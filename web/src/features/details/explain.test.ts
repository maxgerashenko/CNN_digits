import { describe, expect, it } from 'vitest';

import { evaluateChecks, checksInBucket, type CheckResult } from '../../lib/checks';
import { runOne, runTwo, settingsWith } from '../../test/fixtures';
import { explainCheck } from './explain';

function firstChecks(run: typeof runOne, prev: typeof runOne | null): CheckResult[] {
  return checksInBucket(evaluateChecks({ run, prev, settings: settingsWith() }), 'first');
}

describe('explainCheck', () => {
  it('single run: states the value and the ideal, no comparison', () => {
    const epochs = firstChecks(runOne, null).find((c) => c.key === 'epochs')!;
    const text = explainCheck(epochs);
    expect(text).toContain(epochs.numbers!.nowText);
    expect(text).toContain(epochs.numbers!.idealText);
    expect(text).toContain('first run');
    expect(text).toContain(`Try Epochs ${epochs.nextText}`);
  });

  it('previous run without a value: does not call it the first run', () => {
    const check = {
      label: 'Epochs',
      metric: 'val loss',
      numbers: { name: 'Val loss', prevText: null, nowText: '0.1', idealText: '0.05', gapClosed: null },
      nextText: '4',
      evidence: 'estimate',
    } as unknown as CheckResult;
    const text = explainCheck(check);
    expect(text).not.toContain('first run');
    expect(text).toContain('The previous run has no number for this');
    expect(text).toContain('Try Epochs 4 next.');
  });

  it('measured: names the setting as the only change and the gap share', () => {
    const later = { ...runTwo, settings: settingsWith({ epochs: 4 }), results: { ...runTwo.results, valLoss: 0.09 } };
    const checks = evaluateChecks({ run: later, prev: runOne, settings: settingsWith() });
    const epochs = checks.find((c) => c.key === 'epochs')!;
    expect(epochs.evidence).toBe('measured');
    const text = explainCheck(epochs);
    expect(text).toContain('was the only change');
    expect(text).toContain(epochs.numbers!.prevText!);
    expect(text).toContain(epochs.numbers!.nowText);
  });

  it('estimate: says it is an estimate', () => {
    const run = { ...runTwo, settings: settingsWith({ epochs: 4, dropout: 0.2 }), results: { ...runTwo.results, valLoss: 0.09 } };
    const checks = evaluateChecks({ run, prev: runOne, settings: settingsWith() });
    const check = checks.find((c) => c.key === 'epochs')!;
    expect(check.evidence).toBe('estimate');
    expect(explainCheck(check)).toContain('estimate');
  });

  it('check without numbers: uses the measured text only', () => {
    const check = {
      label: 'Learning rate',
      metric: 'loss smoothness',
      numbers: null,
      lastText: 'spikes',
      idealText: 'no spikes',
      nextText: '0.0005',
      evidence: null,
    } as unknown as CheckResult;
    const text = explainCheck(check);
    expect(text).toContain('spikes');
    expect(text).toContain('Try Learning rate 0.0005');
  });
});
