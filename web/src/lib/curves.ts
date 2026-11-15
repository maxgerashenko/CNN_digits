// Helpers for the line charts.
//
// "Ideal shape" curves are drawings of how a good run looks. They are a
// guide, not data: they carry no numbers of their own and are always shown
// dashed and named "ideal" or "ideal shape" in the legend.

export interface ChartPoint {
  x: number;
  y: number;
}

export type CurveShape = 'rise' | 'fall';

/**
 * Points of the ideal shape across `xMax`, from `from` to `to`:
 * fast at first, then flat. 'rise' climbs to `to`, 'fall' drops to `to`.
 */
export function idealCurve(xMax: number, from: number, to: number, samples = 30): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const k = 1 - Math.exp(-t * 6);
    points.push({ x: t * xMax, y: from + (to - from) * k });
  }
  return points;
}

/** Epoch values as chart points: the first value sits at x = 1. */
export function epochSeries(values: readonly number[]): ChartPoint[] {
  return values.map((y, index) => ({ x: index + 1, y }));
}

/** Smallest and largest of several lists, with a little room; for a y axis. */
export function extent(lists: readonly (readonly number[])[], pad = 0.08): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const list of lists) {
    for (const value of list) {
      if (!Number.isFinite(value)) continue;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
  }
  if (lo === Infinity) return [0, 1];
  if (lo === hi) {
    const room = Math.abs(lo) * 0.1 || 0.1;
    return [lo - room, hi + room];
  }
  const room = (hi - lo) * pad;
  return [lo - room, hi + room];
}

/**
 * An SVG path through the values, fitted into a width x height box with a
 * 1 px margin. For the small 40 x 20 shapes in the setting rows.
 * Returns '' for fewer than two values.
 */
export function sparkPath(values: readonly number[], width = 40, height = 20): string {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return '';
  const lo = Math.min(...clean);
  const hi = Math.max(...clean);
  const span = hi - lo || 1;
  return clean
    .map((value, index) => {
      const x = 1 + (index / (clean.length - 1)) * (width - 2);
      const y = height - 2 - ((value - lo) / span) * (height - 4);
      return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

/** The dashed ideal shapes of the setting rows (40 x 20 box), from the design. */
export const IDEAL_SPARK: Record<'rise' | 'fall' | 'slope' | 'flat' | 'bell', string> = {
  rise: 'M1 18C6 6 14 3 39 2',
  fall: 'M1 2C6 14 14 17 39 18',
  slope: 'M1 3C8 14 18 17 39 17.5',
  flat: 'M1 10H39',
  bell: 'M1 18C12 18 14 3 20 3s8 15 19 15',
};
