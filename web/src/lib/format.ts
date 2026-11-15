// Number formatting used across the screens. One place, so "97.9%" looks the
// same everywhere.

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 219162 becomes "219,162". */
export function formatInt(value: number): string {
  return INT.format(Math.round(value));
}

/** A share 0..1 as a percentage: 0.979 becomes "97.9%". */
export function formatPercent(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

/**
 * An accuracy 0..1 the way the design writes it: one decimal ("97.9%"),
 * or two when the value is 99.5% or more ("99.58%"), where one would hide the difference.
 */
export function formatAccuracy(share: number): string {
  return formatPercent(share, share >= 0.995 ? 2 : 1);
}

/** A probability 0..1 for the bars: "96.2%", and "<0.1%" for anything smaller than that. */
export function formatProbability(share: number): string {
  const percent = share * 100;
  return percent >= 0.1 ? `${percent.toFixed(1)}%` : '<0.1%';
}

/** A loss value: "0.07". */
export function formatLoss(value: number): string {
  return value.toFixed(2);
}

/** Whole seconds: "58 s". */
export function formatSeconds(seconds: number): string {
  return `${Math.round(seconds)} s`;
}

/** Percentage points with a real minus sign: -0.5 becomes "−0.5 pt". */
export function formatPoints(points: number): string {
  const text = Math.abs(points).toFixed(1);
  return `${points < 0 ? '−' : ''}${text} pt`;
}

/** The index of the largest value. */
export function argMax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}
