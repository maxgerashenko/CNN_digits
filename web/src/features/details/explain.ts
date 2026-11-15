// The paragraph on a "Change first" card. Built from the check's own numbers
// only: the names, the two measured values, the share of the gap closed and
// the suggested next value. No number here is written by hand.

import type { CheckResult } from '../../lib/checks';

/** One short paragraph for a check in the "Change first" list. */
export function explainCheck(check: CheckResult): string {
  const { label, metric, numbers, nextText, evidence } = check;
  const tryNext = nextText ? `Try ${label} ${nextText} next.` : '';

  if (!numbers) {
    const state = check.lastText ? `${metric} reads "${check.lastText}", ideal is ${check.idealText}.` : '';
    return [state, evidence === 'estimate' ? 'Other settings changed too, so this is an estimate.' : '', tryNext]
      .filter(Boolean)
      .join(' ');
  }

  const { name, prevText, nowText, idealText, gapClosed } = numbers;

  if (!prevText && evidence !== null) {
    return `${name} is ${nowText}; the ideal is ${idealText}. The previous run has no number for this, so there is nothing to compare. ${tryNext}`.trim();
  }

  if (!prevText) {
    return `${name} is ${nowText}; the ideal is ${idealText}. This is the first run, so there is nothing to compare yet. ${tryNext}`.trim();
  }

  const moved = `${name} went from ${prevText} to ${nowText}`;
  const share = gapClosed === null ? '' : `, ${gapClosed}% of the way to ${idealText}`;

  if (evidence === 'measured') {
    return `${label} was the only change, so the difference belongs to it. ${moved}${share}. ${tryNext}`.trim();
  }
  return `${label} was not the only change since the last run, so this is an estimate. ${moved}${share}. ${tryNext}`.trim();
}
