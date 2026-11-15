// How the size of a layer's gradient is judged and where it sits on the chart.

import type { RunRecord } from '../types';

/**
 * The gradient chart has a logarithmic scale from 10^-6 (left end) to 10^4
 * (right end). A gradient between GRADIENT_IDEAL.min and .max is in the
 * ideal band, which is the middle 40% of the scale. A healthy run of this
 * network measures about 0.1 to 2. The limits are a rule of thumb for this
 * small network, not an exact law.
 */
export const GRADIENT_SCALE = { minExponent: -6, maxExponent: 4 } as const;
export const GRADIENT_IDEAL = { min: 1e-3, max: 10 } as const;

/** Where a gradient size sits on the chart, 0..100 (%). */
export function gradientPosition(size: number): number {
  if (!(size > 0)) return 0;
  const { minExponent, maxExponent } = GRADIENT_SCALE;
  const share = (Math.log10(size) - minExponent) / (maxExponent - minExponent);
  return Math.min(100, Math.max(0, share * 100));
}

export type GradientVerdict = 'vanishing' | 'ideal' | 'exploding';

export function gradientVerdict(size: number): GradientVerdict {
  if (size < GRADIENT_IDEAL.min) return 'vanishing';
  if (size > GRADIENT_IDEAL.max) return 'exploding';
  return 'ideal';
}

/** The gradient sizes of the last epoch that has them, or null when the server sent none. */
export function lastGradients(run: RunRecord): Record<string, number> | null {
  for (let i = run.epochs.length - 1; i >= 0; i -= 1) {
    const gradients = run.epochs[i].gradients;
    if (gradients && Object.keys(gradients).length > 0) return gradients;
  }
  return null;
}
