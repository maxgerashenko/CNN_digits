// What can be told from the weights of a trained model, without any data:
// histograms per layer and per kind of weight, dead filters, and whether the
// dense weights form a bell. Plain arrays in, plain numbers out.

import type { Histogram, LayerHistogram, TagHistogram, WeightAnalysis, WeightTag } from '../types';

export const WEIGHT_TAGS: readonly WeightTag[] = ['kernel', 'gamma', 'beta', 'moving_mean', 'moving_variance', 'bias'];

/** One weight array of one layer. */
export interface WeightEntry {
  /** Display name of the layer: 'conv 1', 'dense', 'output', 'norm 3'. */
  layer: string;
  kind: 'conv' | 'dense' | 'output' | 'norm';
  tag: WeightTag;
  /** Conv kernels are [height, width, in, out]; dense kernels are [in, out]. */
  shape: number[];
  values: Float32Array;
}

export const HISTOGRAM_BINS = 24;
/** A filter counts as dead when all its weights are this close to zero. */
export const DEAD_WEIGHT = 1e-3;

interface Moments {
  count: number;
  mean: number;
  std: number;
  skew: number;
  /** 0 for a perfect bell, about -1.2 for a flat (uniform) spread. */
  excessKurtosis: number;
  min: number;
  max: number;
}

function moments(lists: readonly Float32Array[]): Moments {
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    count += list.length;
  }
  if (count === 0) return { count: 0, mean: 0, std: 0, skew: 0, excessKurtosis: 0, min: 0, max: 0 };
  const mean = sum / count;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const d = list[i] - mean;
      m2 += d * d;
      m3 += d * d * d;
      m4 += d * d * d * d;
    }
  }
  m2 /= count;
  m3 /= count;
  m4 /= count;
  const std = Math.sqrt(m2);
  return {
    count,
    mean,
    std,
    skew: std > 0 ? m3 / (std * std * std) : 0,
    excessKurtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0,
    min,
    max,
  };
}

/** Counts the values into equal bins from the smallest to the largest value. */
export function histogram(lists: readonly Float32Array[], binCount = HISTOGRAM_BINS): Histogram {
  const m = moments(lists);
  const bins = new Array<number>(binCount).fill(0);
  if (m.count === 0) return { lo: 0, hi: 0, bins, count: 0, mean: 0, std: 0 };
  const span = m.max - m.min;
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const index = span === 0 ? Math.floor(binCount / 2) : Math.min(binCount - 1, Math.floor(((list[i] - m.min) / span) * binCount));
      bins[index]++;
    }
  }
  const tallest = Math.max(...bins);
  return {
    lo: m.min,
    hi: m.max,
    bins: bins.map((n) => n / tallest),
    count: m.count,
    mean: m.mean,
    std: m.std,
  };
}

/** Share of conv filters (0..1) whose kernel weights are all within DEAD_WEIGHT of zero. */
export function deadFilterShare(entries: readonly WeightEntry[]): number {
  let filters = 0;
  let dead = 0;
  for (const entry of entries) {
    if (entry.kind !== 'conv' || entry.tag !== 'kernel' || entry.shape.length !== 4) continue;
    const out = entry.shape[3];
    const largest = new Float32Array(out);
    for (let i = 0; i < entry.values.length; i++) {
      const size = Math.abs(entry.values[i]);
      const filter = i % out; // the filter is the last axis
      if (size > largest[filter]) largest[filter] = size;
    }
    filters += out;
    for (let f = 0; f < out; f++) if (largest[f] < DEAD_WEIGHT) dead++;
  }
  return filters === 0 ? 0 : dead / filters;
}

/**
 * True when the weights form a bell around 0: centred (mean within half a
 * standard deviation of 0), even on both sides, and not a flat spread.
 */
export function isBellAroundZero(lists: readonly Float32Array[]): boolean | null {
  const m = moments(lists);
  if (m.count < 16 || m.std === 0) return null;
  return Math.abs(m.mean) < 0.5 * m.std && Math.abs(m.skew) < 1 && m.excessKurtosis > -1;
}

export function analyzeWeights(entries: readonly WeightEntry[]): WeightAnalysis {
  const layers: LayerHistogram[] = entries
    .filter((entry) => entry.tag === 'kernel' && entry.kind !== 'norm')
    .map((entry) => ({
      name: entry.layer,
      kind: entry.kind as LayerHistogram['kind'],
      histogram: histogram([entry.values]),
    }));

  const tags: TagHistogram[] = [];
  for (const tag of WEIGHT_TAGS) {
    const lists = entries.filter((entry) => entry.tag === tag).map((entry) => entry.values);
    if (lists.length > 0) tags.push({ tag, histogram: histogram(lists) });
  }

  const hiddenDense = entries
    .filter((entry) => entry.kind === 'dense' && entry.tag === 'kernel')
    .map((entry) => entry.values);

  return {
    layers,
    tags,
    deadFilterShare: deadFilterShare(entries),
    denseBell: hiddenDense.length > 0 ? isBellAroundZero(hiddenDense) : null,
  };
}
