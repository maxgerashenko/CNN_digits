import { describe, expect, it } from 'vitest';

import {
  CHANGE_FIRST_COUNT,
  CHECK_PRIORITY,
  checksInBucket,
  describeRun,
  evaluateChecks,
  gapClosed,
  summarizeRuns,
  type CheckResult,
} from './checks';
import { DEFAULT_SETTINGS, SETTING_KEYS } from './settings';
import { makeAnalysis, makeEpochs, runOne, runTwo, settingsWith } from '../test/fixtures';
import type { RunRecord, SettingKey } from '../types';

const checkOf = (checks: CheckResult[], key: SettingKey) => checks.find((c) => c.key === key)!;

/** A run that passes every measurable check. */
function goodRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ...runOne,
    epochs: makeEpochs([
      { accuracy: 0.97, loss: 0.1, valAccuracy: 0.985, valLoss: 0.031, seconds: 10 },
      { accuracy: 0.985, loss: 0.05, valAccuracy: 0.99, valLoss: 0.03, seconds: 20 },
    ]),
    results: {
      testAccuracy: 0.99,
      mistakes: 60,
      testImages: 10000,
      loss: 0.05,
      accuracy: 0.985,
      valLoss: 0.03,
      valAccuracy: 0.99,
      epochs: 2,
      trainingSeconds: 20,
    },
    ...overrides,
  };
}

describe('evaluateChecks without a run', () => {
  const checks = evaluateChecks({ run: null, settings: DEFAULT_SETTINGS });

  it('gives one "new" check per setting with the form value and no last value', () => {
    expect(checks.map((c) => c.key)).toEqual([...SETTING_KEYS]);
    for (const check of checks) {
      expect(check.status).toBe('new');
      expect(check.bucket).toBeNull();
      expect(check.lastText).toBeNull();
      expect(check.series).toEqual([]);
      expect(check.numbers).toBeNull();
    }
    expect(checkOf(checks, 'kernel_size').valueText).toBe('3×3');
  });
});

describe('evaluateChecks for a run that fails and passes', () => {
  const checks = evaluateChecks({ run: runOne, settings: DEFAULT_SETTINGS });

  it('fails val accuracy below 98.6%, with the text and the next value', () => {
    const c = checkOf(checks, 'train_images');
    expect(c.status).toBe('improve');
    expect(c.lastText).toBe('97.9%');
    expect(c.action).toBe('raise');
    expect(c.next).toBe(30000);
    expect(c.nextText).toBe('30k');
  });

  it('passes time per epoch under 30 s and the train-val gap under 1 pt', () => {
    expect(checkOf(checks, 'filters').status).toBe('ok');
    expect(checkOf(checks, 'filters').lastText).toBe('29 s');
    expect(checkOf(checks, 'dropout').status).toBe('ok');
  });

  it('fails mistakes and val loss with the rules of the design', () => {
    expect(checkOf(checks, 'kernel_size').status).toBe('improve');
    expect(checkOf(checks, 'kernel_size').action).toBe('switch');
    expect(checkOf(checks, 'kernel_size').next).toBe(5);
    expect(checkOf(checks, 'dense_layers').status).toBe('improve');
    expect(checkOf(checks, 'dense_layers').next).toBe(2);
  });

  it('says epochs "still falling" when val loss dropped by more than 5%', () => {
    const c = checkOf(checks, 'epochs');
    expect(c.status).toBe('improve');
    expect(c.lastText).toBe('still falling');
    expect(c.next).toBe(4);
  });

  it('judges the learning rate by spikes in the loss', () => {
    expect(checkOf(checks, 'learning_rate').status).toBe('ok');
    const spiky = evaluateChecks({
      run: { ...runOne, epochs: makeEpochs([
        { accuracy: 0.9, loss: 0.1, valAccuracy: 0.9, valLoss: 0.1, seconds: 1 },
        { accuracy: 0.9, loss: 0.3, valAccuracy: 0.9, valLoss: 0.1, seconds: 2 },
      ]) },
      settings: DEFAULT_SETTINGS,
    });
    expect(checkOf(spiky, 'learning_rate').status).toBe('improve');
    expect(checkOf(spiky, 'learning_rate').lastText).toBe('spikes');
    expect(checkOf(spiky, 'learning_rate').next).toBe(0.0001);
  });

  it('checks that validation is not below training for augmentation', () => {
    expect(checkOf(checks, 'augmentation').status).toBe('ok');
    const overfit = evaluateChecks({
      run: { ...runOne, results: { ...runOne.results, accuracy: 0.999, valAccuracy: 0.97 } },
      settings: DEFAULT_SETTINGS,
    });
    expect(checkOf(overfit, 'augmentation').status).toBe('improve');
    expect(checkOf(overfit, 'augmentation').next).toBe(0.1);
    expect(checkOf(overfit, 'dropout').status).toBe('improve');
    expect(checkOf(overfit, 'dropout').next).toBe(0.2);
  });

  it('reads dead filters and the bell from the weights', () => {
    expect(checkOf(checks, 'conv_layers_per_block').status).toBe('ok');
    expect(checkOf(checks, 'dense_units').status).toBe('ok');
    const dead = evaluateChecks({
      run: { ...runOne, analysis: makeAnalysis({ deadFilterShare: 0.5, denseBell: false }) },
      settings: DEFAULT_SETTINGS,
    });
    expect(checkOf(dead, 'conv_layers_per_block').status).toBe('improve');
    expect(checkOf(dead, 'conv_layers_per_block').next).toBe(1);
    expect(checkOf(dead, 'dense_units').status).toBe('improve');
    expect(checkOf(dead, 'dense_units').next).toBe(64);
  });
});

describe('unmeasured checks', () => {
  it('batch norm is measured when the run has gradient sizes', () => {
    const withGradients = (gradients: Record<string, number>, batchNorm = true) => {
      const run = goodRun({ settings: settingsWith({ batch_norm: batchNorm }) });
      run.epochs = run.epochs.map((epoch) => ({ ...epoch, gradients }));
      return checkOf(evaluateChecks({ run, settings: run.settings }), 'batch_norm');
    };
    expect(withGradients({ 'conv 1': 0.02, output: 0.1 }).status).toBe('ok');
    expect(withGradients({ 'conv 1': 0.02, output: 0.1 }).lastText).toBe('steady');
    expect(withGradients({ 'conv 1': 1e-6, output: 0.1 }).status).toBe('improve');
    expect(withGradients({ 'conv 1': 1e-6, output: 0.1 }).lastText).toBe('vanishing');
    // With batch norm already on there is nothing to switch.
    expect(withGradients({ 'conv 1': 0.02, output: 50 }).next).toBeNull();
    expect(withGradients({ 'conv 1': 0.02, output: 50 }, false).next).toBe(true);
  });

  it('batch norm (without gradient sizes) and batch size are not measured, with a reason', () => {
    const checks = evaluateChecks({ run: goodRun(), settings: DEFAULT_SETTINGS });
    for (const key of ['batch_norm', 'batch_size'] as const) {
      expect(checkOf(checks, key).status).toBe('unmeasured');
      expect(checkOf(checks, key).bucket).toBe('unmeasured');
      expect(checkOf(checks, key).reason).toMatch(/does not send|once per epoch/);
    }
  });

  it('epochs and learning rate need 2 epochs', () => {
    const one = goodRun({
      epochs: makeEpochs([{ accuracy: 0.97, loss: 0.1, valAccuracy: 0.985, valLoss: 0.05, seconds: 10 }]),
    });
    const checks = evaluateChecks({ run: one, settings: DEFAULT_SETTINGS });
    expect(checkOf(checks, 'epochs').status).toBe('unmeasured');
    expect(checkOf(checks, 'learning_rate').status).toBe('unmeasured');
    expect(checkOf(checks, 'epochs').reason).toMatch(/2 or more epochs/);
  });

  it('weight checks are unmeasured when the weights could not be read', () => {
    const checks = evaluateChecks({ run: goodRun({ analysis: null }), settings: DEFAULT_SETTINGS });
    expect(checkOf(checks, 'conv_layers_per_block').status).toBe('unmeasured');
    expect(checkOf(checks, 'dense_units').status).toBe('unmeasured');
    expect(checkOf(checks, 'dense_units').reason).toMatch(/weights/);
  });
});

describe('a run that passes everything', () => {
  const checks = evaluateChecks({ run: goodRun(), settings: DEFAULT_SETTINGS });

  it('has no "first" or "later" check', () => {
    expect(checksInBucket(checks, 'first')).toEqual([]);
    expect(checksInBucket(checks, 'later')).toEqual([]);
    expect(checksInBucket(checks, 'keep')).toHaveLength(11);
    expect(checksInBucket(checks, 'unmeasured')).toHaveLength(2);
  });
});

describe('buckets and priority', () => {
  const checks = evaluateChecks({ run: runOne, settings: DEFAULT_SETTINGS });

  it('puts the first three failed checks, in priority order, into "first"', () => {
    const first = checksInBucket(checks, 'first');
    expect(first).toHaveLength(CHANGE_FIRST_COUNT);
    // epochs, train_images and conv_blocks fail; augmentation, learning rate and dropout pass.
    expect(first.map((c) => c.key)).toEqual(['epochs', 'train_images', 'conv_blocks']);
  });

  it('sends the other failed checks to "later" and the passed ones to "keep"', () => {
    expect(checksInBucket(checks, 'later').map((c) => c.key)).toEqual(['dense_layers', 'kernel_size']);
    expect(checksInBucket(checks, 'keep').map((c) => c.key)).toEqual([
      'conv_layers_per_block',
      'filters',
      'dense_units',
      'dropout',
      'learning_rate',
      'augmentation',
    ]);
  });

  it('does not make a failed check "first" when it has nothing to try', () => {
    const atLimit = evaluateChecks({
      run: { ...runOne, settings: settingsWith({ epochs: 20, train_images: 60000, conv_blocks: 3 }) },
      settings: DEFAULT_SETTINGS,
    });
    expect(checkOf(atLimit, 'epochs').status).toBe('improve');
    expect(checkOf(atLimit, 'epochs').next).toBeNull();
    expect(checkOf(atLimit, 'epochs').bucket).toBe('later');
    expect(checkOf(atLimit, 'train_images').bucket).toBe('later');
    // The slots go on to the next failed checks.
    expect(checksInBucket(atLimit, 'first').map((c) => c.key)).toEqual(['kernel_size', 'dense_layers']);
  });

  it('ranks epochs, training images, augmentation, learning rate, dropout first', () => {
    expect(CHECK_PRIORITY.slice(0, 5)).toEqual(['epochs', 'train_images', 'augmentation', 'learning_rate', 'dropout']);
    expect([...CHECK_PRIORITY].sort()).toEqual([...SETTING_KEYS].sort());
  });
});

describe('evidence', () => {
  it('is null without a previous run', () => {
    const checks = evaluateChecks({ run: runOne, settings: DEFAULT_SETTINGS });
    expect(checks.every((c) => c.evidence === null)).toBe(true);
  });

  it('is "measured" only for the one setting changed between the runs', () => {
    const checks = evaluateChecks({ run: runTwo, prev: runOne, settings: DEFAULT_SETTINGS });
    expect(checkOf(checks, 'epochs').evidence).toBe('measured');
    expect(checkOf(checks, 'train_images').evidence).toBe('estimate');
  });

  it('is "estimate" for everything when several settings changed', () => {
    const run = { ...runTwo, settings: settingsWith({ epochs: 4, filters: 32 }) };
    const checks = evaluateChecks({ run, prev: runOne, settings: DEFAULT_SETTINGS });
    expect(checks.every((c) => c.evidence === 'estimate')).toBe(true);
  });

  it('fills the numbers for the gap bar from two runs', () => {
    const checks = evaluateChecks({ run: runTwo, prev: runOne, settings: DEFAULT_SETTINGS });
    const n = checkOf(checks, 'dense_layers').numbers!;
    expect(n.prevText).toBe('0.07');
    expect(n.nowText).toBe('0.05');
    expect(n.nowSeries).toHaveLength(4);
    expect(n.prevSeries).toHaveLength(2);
    // 0.07 to 0.048 against the ideal 0.05: the ideal was reached.
    expect(n.gapClosed).toBe(100);
  });
});

describe('gapClosed', () => {
  const lower = { ideal: 0.05, better: 'lower' } as never;
  const higher = { ideal: 0.986, better: 'higher' } as never;

  it('is null without a previous run or without a result', () => {
    expect(gapClosed(lower, null, 0.07)).toBeNull();
    expect(gapClosed(lower, 0.07, null)).toBeNull();
  });

  it('is null when the previous run was already at the ideal', () => {
    expect(gapClosed(lower, 0.04, 0.03)).toBeNull();
    expect(gapClosed(higher, 0.99, 0.995)).toBeNull();
    expect(gapClosed(lower, 0.05, 0.04)).toBeNull();
  });

  it('is the share of the gap that was closed, from 0 to 100', () => {
    expect(gapClosed(lower, 0.15, 0.1)).toBe(50);
    expect(gapClosed(higher, 0.976, 0.981)).toBe(50);
  });

  it('is 0 when the result got worse and 100 when it went past the ideal', () => {
    expect(gapClosed(lower, 0.1, 0.2)).toBe(0);
    expect(gapClosed(lower, 0.1, 0.01)).toBe(100);
    expect(gapClosed(higher, 0.97, 0.999)).toBe(100);
  });
});

describe('summarizeRuns and describeRun', () => {
  it('gives the three rows, with a dash column for run 1 alone', () => {
    const rows = summarizeRuns(runOne);
    expect(rows.map((r) => r.name)).toEqual(['Val accuracy', 'Mistakes', 'Val loss']);
    expect(rows[0]).toEqual({ name: 'Val accuracy', prev: null, now: '97.9%', ideal: '99.53%' });
    expect(rows[1].ideal).toBe('47');
    expect(rows[2].ideal).toBe('near 0');
  });

  it('shows both runs', () => {
    const rows = summarizeRuns(runTwo, runOne);
    expect(rows[0].prev).toBe('97.9%');
    expect(rows[0].now).toBe('98.6%');
    expect(rows[1]).toMatchObject({ prev: '210', now: '138' });
  });

  it('writes the one-line result', () => {
    expect(describeRun(runOne)).toBe('97.9% · 210 mistakes · 58 s');
  });
});
