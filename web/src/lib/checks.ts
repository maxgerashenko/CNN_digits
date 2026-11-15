// The check behind every setting: which number of a run it looks at, what
// the ideal is, whether the last run passed, and what to try next.
//
// Metric names, ideal texts and thresholds come from the design (artboards
// "2 Configure" and "2c Run details"). Every "last" value is worked out from
// what the training server really sent, or from the trained weights. Where
// neither holds the number, the check is 'unmeasured' and says why.

import { SAVED_MODEL_FACTS } from '../config';
import type { RunRecord, SettingKey, SettingValue, Settings } from '../types';
import { formatAccuracy, formatInt, formatLoss, formatPercent, formatPoints, formatSeconds } from './format';
import { SETTING_KEYS, diffSettings, formatSetting, getSettingSpec } from './settings';

/** The thresholds in the design's "ideal" texts. */
export const TARGETS = {
  /** "≥ 98.6%" */
  valAccuracy: 0.986,
  /** "< 0.05" */
  valLoss: 0.05,
  /** "< 100" mistakes out of 10,000 */
  mistakes: 100,
  /** "< 30 s" per epoch */
  secondsPerEpoch: 30,
  /** "< 1 pt" between train and validation accuracy */
  gapPoints: 1,
  /** "< 10%" dead filters */
  deadFilterShare: 0.1,
  /** The loss is "still falling" when the last epoch cut it by more than this share. */
  fallingShare: 0.05,
} as const;

export type CheckShape = 'rise' | 'fall' | 'slope' | 'flat' | 'bell';
/** 'new' = no run yet. 'unmeasured' = the run does not hold the number. */
export type CheckStatus = 'new' | 'ok' | 'improve' | 'unmeasured';
/** Where the setting sits on the Run details screen. */
export type CheckBucket = 'first' | 'later' | 'keep' | 'unmeasured';
export type CheckAction = 'raise' | 'lower' | 'switch';

/** Colour of a status word. Matches the tones of the `Mono` component. */
export type StatusTone = 'ok' | 'warn' | 'muted';

/** The word shown for each check status, and its colour. The one copy for every screen. */
export const STATUS_WORD: Record<CheckStatus, { text: string; tone: StatusTone }> = {
  new: { text: 'new', tone: 'muted' },
  ok: { text: 'ok', tone: 'ok' },
  improve: { text: 'improve', tone: 'warn' },
  unmeasured: { text: 'not measured', tone: 'muted' },
};

/** The word shown for each bucket of the Run details screen ("Try later", "Keep", "Not measured"). */
export const BUCKET_WORD: Record<Exclude<CheckBucket, 'first'>, { text: string; tone: StatusTone }> = {
  later: { text: 'later', tone: 'warn' },
  keep: { text: 'keep', tone: 'ok' },
  unmeasured: STATUS_WORD.unmeasured,
};

export interface CheckNumbers {
  /** Name on the "Change first" card, for example "val loss at the end". */
  name: string;
  /** The ideal end of the gap bar, as text: "98.6%", "0.05", "≥ 0". */
  idealText: string;
  prevText: string | null;
  nowText: string;
  /** Per-epoch values of this run and the one before, for the small chart. */
  nowSeries: number[];
  prevSeries: number[];
  /** The ideal as a number in the same unit as the series. */
  ideal: number;
  better: 'higher' | 'lower';
  /**
   * How much of the gap between the previous run and the ideal this run
   * closed, 0 to 100. Null without a previous run, or when the previous run
   * was already at the ideal.
   */
  gapClosed: number | null;
}

export interface CheckResult {
  key: SettingKey;
  label: string;
  /** The setting's value in the run (or in the form when there is no run), and as text. */
  value: SettingValue;
  valueText: string;
  /** What the check looks at: long form for the setting rows, short for lists. */
  metric: string;
  metricShort: string;
  idealText: string;
  idealShort: string;
  shape: CheckShape;
  status: CheckStatus;
  /** Null when there is no run yet. */
  bucket: CheckBucket | null;
  /** The measured value as text ("97.9%", "still falling"), or null. */
  lastText: string | null;
  /** Why the check is unmeasured, as one sentence. */
  reason: string | null;
  /** Per-epoch values for the small line in the setting row. Empty when there are none. */
  series: number[];
  /** Numbers for the "Change first" card. Null for checks that have no number. */
  numbers: CheckNumbers | null;
  /** What to try next. Null when the check passed or the setting is at its limit. */
  action: CheckAction | null;
  next: SettingValue | null;
  nextText: string | null;
  /**
   * 'measured' when this setting is the only one changed since the previous
   * run, so the difference between the runs belongs to it. 'estimate' when
   * there is a previous run but something else (or nothing) changed. Null
   * without a previous run.
   */
  evidence: 'measured' | 'estimate' | null;
}

interface Verdict {
  ok: boolean | null;
  text: string | null;
  reason?: string;
}

interface NumberSpec {
  name: string;
  idealText: string;
  ideal: number;
  better: 'higher' | 'lower';
  value(run: RunRecord): number | null;
  series(run: RunRecord): number[];
  format(value: number): string;
}

interface CheckSpec {
  key: SettingKey;
  metric: string;
  metricShort?: string;
  idealText: string;
  idealShort?: string;
  shape: CheckShape;
  verdict(run: RunRecord): Verdict;
  series?(run: RunRecord): number[];
  numbers?: NumberSpec;
  suggest(settings: Settings): { action: CheckAction; next: SettingValue } | null;
}

// ---------------------------------------------------------------------------
// Numbers read from a run
// ---------------------------------------------------------------------------

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Accuracy on the 10,000 test images, 0..1. */
export function runValAccuracy(run: RunRecord): number | null {
  if (finite(run.results.testAccuracy)) return run.results.testAccuracy;
  return finite(run.results.valAccuracy) ? run.results.valAccuracy : null;
}

export function runValLoss(run: RunRecord): number | null {
  return finite(run.results.valLoss) ? run.results.valLoss : null;
}

export function runSecondsPerEpoch(run: RunRecord): number | null {
  // The last epoch's `seconds` is counted from the start of fit, so it leaves out
  // loading the data, building the model and testing; `trainingSeconds` includes them.
  const last = run.epochs.at(-1)?.seconds;
  if (run.epochs.length > 0 && finite(last)) return last / run.epochs.length;
  const { trainingSeconds, epochs } = run.results;
  return finite(trainingSeconds) && epochs > 0 ? trainingSeconds / epochs : null;
}

/** Train accuracy minus validation accuracy of the last epoch, in percentage points. */
export function runGapPoints(run: RunRecord): number | null {
  const { accuracy, valAccuracy } = run.results;
  return finite(accuracy) && finite(valAccuracy) ? (accuracy - valAccuracy) * 100 : null;
}

const VAL_ACCURACY: NumberSpec = {
  name: 'val accuracy',
  idealText: formatAccuracy(TARGETS.valAccuracy),
  ideal: TARGETS.valAccuracy,
  better: 'higher',
  value: runValAccuracy,
  series: (run) => run.epochs.map((e) => e.valAccuracy),
  format: formatAccuracy,
};

const VAL_LOSS: NumberSpec = {
  name: 'val loss at the end',
  idealText: formatLoss(TARGETS.valLoss),
  ideal: TARGETS.valLoss,
  better: 'lower',
  value: runValLoss,
  series: (run) => run.epochs.map((e) => e.valLoss),
  format: formatLoss,
};

const MISTAKES: NumberSpec = {
  name: 'mistakes of 10,000',
  idealText: formatInt(TARGETS.mistakes),
  ideal: TARGETS.mistakes,
  better: 'lower',
  value: (run) => (finite(run.results.mistakes) ? run.results.mistakes : null),
  // The validation set is the 10,000 test images, so mistakes follow from accuracy.
  series: (run) => run.epochs.map((e) => Math.round((1 - e.valAccuracy) * run.results.testImages)),
  format: formatInt,
};

const VAL_MINUS_TRAIN: NumberSpec = {
  name: 'val minus train accuracy',
  idealText: '≥ 0',
  ideal: 0,
  better: 'higher',
  value: (run) => {
    const gap = runGapPoints(run);
    return gap === null ? null : -gap;
  },
  series: (run) => run.epochs.map((e) => (e.valAccuracy - e.accuracy) * 100),
  format: formatPoints,
};

const TRAIN_VAL_GAP: NumberSpec = {
  name: 'train–val gap',
  idealText: `${TARGETS.gapPoints} pt`,
  ideal: TARGETS.gapPoints,
  better: 'lower',
  value: runGapPoints,
  series: (run) => run.epochs.map((e) => (e.accuracy - e.valAccuracy) * 100),
  format: formatPoints,
};

const TIME_PER_EPOCH: NumberSpec = {
  name: 'time per epoch',
  idealText: formatSeconds(TARGETS.secondsPerEpoch),
  ideal: TARGETS.secondsPerEpoch,
  better: 'lower',
  value: runSecondsPerEpoch,
  series: (run) => run.epochs.map((e, i) => e.seconds - (i > 0 ? run.epochs[i - 1].seconds : 0)),
  format: formatSeconds,
};

const DEAD_FILTERS: NumberSpec = {
  name: 'dead filters',
  idealText: formatPercent(TARGETS.deadFilterShare, 0),
  ideal: TARGETS.deadFilterShare,
  better: 'lower',
  value: (run) => (run.analysis ? run.analysis.deadFilterShare : null),
  series: () => [],
  format: (value) => formatPercent(value, 0),
};

function numberVerdict(spec: NumberSpec, strict: boolean, reason: string) {
  return (run: RunRecord): Verdict => {
    const value = spec.value(run);
    if (value === null) return { ok: null, text: null, reason };
    const ok =
      spec.better === 'higher' ? value >= spec.ideal : strict ? value < spec.ideal : value <= spec.ideal;
    return { ok, text: spec.format(value) };
  };
}

const NO_RESULT = 'The run did not report this number.';
const NO_WEIGHTS = 'The trained weights could not be read.';
const NEEDS_TWO_EPOCHS = 'Needs a run with 2 or more epochs.';

// ---------------------------------------------------------------------------
// What to try next
// ---------------------------------------------------------------------------

function stepBy(key: SettingKey, amount: number) {
  return (settings: Settings) => {
    const spec = getSettingSpec(key);
    const current = settings[key] as number;
    const next = Math.round((current + amount) * 10) / 10;
    const limited = Math.max(spec.min!, Math.min(spec.max!, next));
    if (Math.abs(limited - current) < 1e-9) return null;
    return { action: amount > 0 ? ('raise' as const) : ('lower' as const), next: limited };
  };
}

function nextChoice(key: SettingKey, direction: 1 | -1) {
  return (settings: Settings) => {
    const choices = getSettingSpec(key).choices!;
    const index = choices.findIndex((choice) => Math.abs(choice - (settings[key] as number)) < 1e-9);
    const next = choices[index + direction];
    if (index < 0 || next === undefined) return null;
    return { action: direction > 0 ? ('raise' as const) : ('lower' as const), next };
  };
}

// ---------------------------------------------------------------------------
// The 13 checks
// ---------------------------------------------------------------------------

const CHECK_SPECS: Record<SettingKey, CheckSpec> = {
  conv_blocks: {
    key: 'conv_blocks',
    metric: 'val accuracy',
    idealText: '≥ 98.6%',
    shape: 'rise',
    verdict: numberVerdict(VAL_ACCURACY, false, NO_RESULT),
    numbers: VAL_ACCURACY,
    suggest: stepBy('conv_blocks', 1),
  },
  conv_layers_per_block: {
    key: 'conv_layers_per_block',
    metric: 'dead filters',
    idealText: '< 10%',
    shape: 'flat',
    verdict: numberVerdict(DEAD_FILTERS, true, NO_WEIGHTS),
    numbers: DEAD_FILTERS,
    suggest: stepBy('conv_layers_per_block', -1),
  },
  dense_layers: {
    key: 'dense_layers',
    metric: 'val loss at the end',
    metricShort: 'val loss',
    idealText: '< 0.05',
    shape: 'fall',
    verdict: numberVerdict(VAL_LOSS, true, NO_RESULT),
    numbers: VAL_LOSS,
    suggest: stepBy('dense_layers', 1),
  },
  filters: {
    key: 'filters',
    metric: 'time per epoch',
    idealText: '< 30 s',
    shape: 'flat',
    verdict: numberVerdict(TIME_PER_EPOCH, true, NO_RESULT),
    numbers: TIME_PER_EPOCH,
    suggest: nextChoice('filters', -1),
  },
  kernel_size: {
    key: 'kernel_size',
    metric: 'mistakes of 10,000',
    metricShort: 'mistakes',
    idealText: '< 100',
    shape: 'fall',
    verdict: numberVerdict(MISTAKES, true, NO_RESULT),
    numbers: MISTAKES,
    suggest: (settings) => ({ action: 'switch', next: settings.kernel_size === 3 ? 5 : 3 }),
  },
  dense_units: {
    key: 'dense_units',
    metric: 'weight histogram',
    idealText: 'bell around 0',
    idealShort: 'bell at 0',
    shape: 'bell',
    verdict: (run) => {
      const bell = run.analysis ? run.analysis.denseBell : null;
      if (bell === null) return { ok: null, text: null, reason: NO_WEIGHTS };
      return { ok: bell, text: bell ? 'bell' : 'not a bell' };
    },
    suggest: nextChoice('dense_units', -1),
  },
  dropout: {
    key: 'dropout',
    metric: 'train–val gap',
    idealText: '< 1 pt',
    shape: 'rise',
    verdict: numberVerdict(TRAIN_VAL_GAP, true, NO_RESULT),
    series: (run) => run.epochs.map((e) => e.valAccuracy),
    numbers: TRAIN_VAL_GAP,
    suggest: stepBy('dropout', 0.1),
  },
  learning_rate: {
    key: 'learning_rate',
    metric: 'loss smoothness',
    metricShort: 'loss',
    idealText: 'no spikes',
    shape: 'fall',
    verdict: (run) => {
      const losses = run.epochs.map((e) => e.loss).filter(finite);
      if (losses.length < 2) return { ok: null, text: null, reason: NEEDS_TWO_EPOCHS };
      const spike = losses.some((loss, i) => i > 0 && loss > losses[i - 1]);
      return { ok: !spike, text: spike ? 'spikes' : 'smooth' };
    },
    series: (run) => run.epochs.map((e) => e.loss),
    suggest: nextChoice('learning_rate', -1),
  },
  epochs: {
    key: 'epochs',
    metric: 'loss slope at the end',
    idealText: 'flat',
    shape: 'slope',
    verdict: (run) => {
      const losses = run.epochs.map((e) => e.valLoss).filter(finite);
      if (losses.length < 2) return { ok: null, text: null, reason: NEEDS_TWO_EPOCHS };
      const before = losses[losses.length - 2];
      const last = losses[losses.length - 1];
      const falling = before > 0 && (before - last) / before > TARGETS.fallingShare;
      return { ok: !falling, text: falling ? 'still falling' : 'flat' };
    },
    series: (run) => run.epochs.map((e) => e.valLoss),
    numbers: VAL_LOSS,
    suggest: stepBy('epochs', 2),
  },
  batch_norm: {
    key: 'batch_norm',
    metric: 'gradient norm',
    idealText: 'steady',
    shape: 'flat',
    verdict: () => ({ ok: null, text: null, reason: 'The training server does not send gradient sizes.' }),
    suggest: () => null,
  },
  batch_size: {
    key: 'batch_size',
    metric: 'loss noise per step',
    metricShort: 'loss noise',
    idealText: 'small wiggle',
    idealShort: 'small',
    shape: 'flat',
    verdict: () => ({
      ok: null,
      text: null,
      reason: 'The training server reports the loss once per epoch, not per step.',
    }),
    suggest: () => null,
  },
  train_images: {
    key: 'train_images',
    metric: 'val accuracy',
    idealText: '≥ 98.6%',
    shape: 'rise',
    verdict: numberVerdict(VAL_ACCURACY, false, NO_RESULT),
    numbers: VAL_ACCURACY,
    suggest: nextChoice('train_images', 1),
  },
  augmentation: {
    key: 'augmentation',
    metric: 'val vs train accuracy',
    idealText: 'val ≥ train',
    shape: 'rise',
    verdict: (run) => {
      const { accuracy, valAccuracy } = run.results;
      if (!finite(accuracy) || !finite(valAccuracy)) return { ok: null, text: null, reason: NO_RESULT };
      return {
        ok: valAccuracy >= accuracy,
        text: `${(valAccuracy * 100).toFixed(1)} vs ${(accuracy * 100).toFixed(1)}`,
      };
    },
    series: (run) => run.epochs.map((e) => e.valAccuracy),
    numbers: VAL_MINUS_TRAIN,
    suggest: nextChoice('augmentation', 1),
  },
};

/**
 * Which failed checks to act on first. The first three failed checks in
 * this order become the "Change first" cards; the rest go to "Try later".
 * Cheap, safe changes come before changes to the network's shape.
 */
export const CHECK_PRIORITY: readonly SettingKey[] = [
  'epochs',
  'train_images',
  'augmentation',
  'learning_rate',
  'dropout',
  'conv_blocks',
  'kernel_size',
  'dense_layers',
  'filters',
  'conv_layers_per_block',
  'dense_units',
  'batch_norm',
  'batch_size',
];

export const CHANGE_FIRST_COUNT = 3;

export function gapClosed(spec: NumberSpec, prev: number | null, now: number | null): number | null {
  if (prev === null || now === null) return null;
  const whole = spec.ideal - prev;
  if (spec.better === 'higher' ? whole <= 0 : whole >= 0) return null;
  const share = (now - prev) / whole;
  return Math.round(Math.max(0, Math.min(1, share)) * 100);
}

export interface CheckInput {
  /** The run to judge: the latest finished run, or null when there is none. */
  run: RunRecord | null;
  /** The run before it, or null. */
  prev?: RunRecord | null;
  /** The settings in the form now. Used for the values when there is no run. */
  settings: Settings;
}

/** One result per setting, in screen order. */
export function evaluateChecks({ run, prev = null, settings }: CheckInput): CheckResult[] {
  const changed = run && prev ? diffSettings(prev.settings, run.settings) : [];

  const results = SETTING_KEYS.map((key): CheckResult => {
    const spec = CHECK_SPECS[key];
    const source = run ? run.settings : settings;
    const base = {
      key,
      label: getSettingSpec(key).label,
      value: source[key],
      valueText: formatSetting(key, source[key]),
      metric: spec.metric,
      metricShort: spec.metricShort ?? spec.metric,
      idealText: spec.idealText,
      idealShort: spec.idealShort ?? spec.idealText,
      shape: spec.shape,
    };
    if (!run) {
      return {
        ...base,
        status: 'new',
        bucket: null,
        lastText: null,
        reason: null,
        series: [],
        numbers: null,
        action: null,
        next: null,
        nextText: null,
        evidence: null,
      };
    }

    const verdict = spec.verdict(run);
    const status: CheckStatus = verdict.ok === null ? 'unmeasured' : verdict.ok ? 'ok' : 'improve';
    const suggestion = status === 'improve' ? spec.suggest(run.settings) : null;

    let numbers: CheckNumbers | null = null;
    if (spec.numbers) {
      const now = spec.numbers.value(run);
      const before = prev ? spec.numbers.value(prev) : null;
      if (now !== null) {
        numbers = {
          name: spec.numbers.name,
          idealText: spec.numbers.idealText,
          prevText: before === null ? null : spec.numbers.format(before),
          nowText: spec.numbers.format(now),
          nowSeries: spec.numbers.series(run).filter(finite),
          prevSeries: prev ? spec.numbers.series(prev).filter(finite) : [],
          ideal: spec.numbers.ideal,
          better: spec.numbers.better,
          gapClosed: gapClosed(spec.numbers, before, now),
        };
      }
    }

    return {
      ...base,
      status,
      bucket: status === 'unmeasured' ? 'unmeasured' : status === 'ok' ? 'keep' : 'later',
      lastText: verdict.text,
      reason: verdict.reason ?? null,
      series: (spec.series ?? spec.numbers?.series ?? (() => []))(run).filter(finite),
      numbers,
      action: suggestion?.action ?? null,
      next: suggestion?.next ?? null,
      nextText: suggestion ? formatSetting(key, suggestion.next) : null,
      evidence: prev ? (changed.length === 1 && changed[0] === key ? 'measured' : 'estimate') : null,
    };
  });

  // The first few failed checks that have something to try become "Change first".
  let first = 0;
  for (const key of CHECK_PRIORITY) {
    const result = results.find((r) => r.key === key)!;
    if (result.status === 'improve' && result.next !== null && first < CHANGE_FIRST_COUNT) {
      result.bucket = 'first';
      first++;
    }
  }
  return results;
}

/** The checks of one bucket. "Change first" comes in priority order, the others in screen order. */
export function checksInBucket(checks: readonly CheckResult[], bucket: CheckBucket): CheckResult[] {
  const picked = checks.filter((check) => check.bucket === bucket);
  if (bucket !== 'first') return picked;
  return picked.sort((a, b) => CHECK_PRIORITY.indexOf(a.key) - CHECK_PRIORITY.indexOf(b.key));
}

export interface SummaryRow {
  name: string;
  /** Null when there is no previous run. */
  prev: string | null;
  now: string;
  ideal: string;
}

const DASH = '–';

/**
 * The three rows of the "run 1 / run 2 / ideal" table. The ideal column is
 * the saved model's measured result; for the loss the design's goal is "near 0".
 */
export function summarizeRuns(run: RunRecord, prev: RunRecord | null = null): SummaryRow[] {
  const text = <T,>(value: T | null, format: (value: T) => string) => (value === null ? DASH : format(value));
  const mistakes = (r: RunRecord) => (finite(r.results.mistakes) ? r.results.mistakes : null);
  return [
    {
      name: 'Val accuracy',
      prev: prev ? text(runValAccuracy(prev), formatAccuracy) : null,
      now: text(runValAccuracy(run), formatAccuracy),
      ideal: formatAccuracy(SAVED_MODEL_FACTS.testAccuracy),
    },
    {
      name: 'Mistakes',
      prev: prev ? text(mistakes(prev), formatInt) : null,
      now: text(mistakes(run), formatInt),
      ideal: formatInt(SAVED_MODEL_FACTS.mistakes),
    },
    {
      name: 'Val loss',
      prev: prev ? text(runValLoss(prev), formatLoss) : null,
      now: text(runValLoss(run), formatLoss),
      ideal: 'near 0',
    },
  ];
}

/** The one-line result of a run: "97.9% · 210 mistakes · 58 s". */
export function describeRun(run: RunRecord): string {
  const parts: string[] = [];
  const accuracy = runValAccuracy(run);
  if (accuracy !== null) parts.push(formatAccuracy(accuracy));
  if (finite(run.results.mistakes)) parts.push(`${formatInt(run.results.mistakes)} mistakes`);
  if (finite(run.results.trainingSeconds)) parts.push(formatSeconds(run.results.trainingSeconds));
  return parts.join(' · ');
}
