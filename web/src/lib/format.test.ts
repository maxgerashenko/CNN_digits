import { describe, expect, it } from 'vitest';

import {
  argMax,
  formatAccuracy,
  formatInt,
  formatLoss,
  formatPercent,
  formatPoints,
  formatProbability,
  formatSeconds,
} from './format';
import { epochSeries, extent, idealCurve, sparkPath } from './curves';
import { rampColor } from './ramp';

describe('format', () => {
  it('formats numbers the way the design writes them', () => {
    expect(formatInt(219162)).toBe('219,162');
    expect(formatPercent(0.979)).toBe('97.9%');
    expect(formatAccuracy(0.979)).toBe('97.9%');
    expect(formatAccuracy(0.9958)).toBe('99.58%');
    expect(formatProbability(0.962)).toBe('96.2%');
    expect(formatProbability(0.0004)).toBe('<0.1%');
    expect(formatLoss(0.0712)).toBe('0.07');
    expect(formatSeconds(57.6)).toBe('58 s');
    expect(formatPoints(-0.5)).toBe('−0.5 pt');
    expect(formatPoints(1.25)).toBe('1.3 pt');
  });

  it('finds the largest value', () => {
    expect(argMax([0.1, 0.7, 0.2])).toBe(1);
    expect(argMax([])).toBe(0);
  });
});

describe('curves', () => {
  it('draws the ideal shape from start to end', () => {
    const rise = idealCurve(10, 0.9, 1);
    expect(rise[0]).toEqual({ x: 0, y: 0.9 });
    expect(rise[rise.length - 1].x).toBe(10);
    expect(rise[rise.length - 1].y).toBeGreaterThan(0.99);
    expect(rise[1].y).toBeGreaterThan(rise[0].y);
    const fall = idealCurve(4, 1, 0);
    expect(fall[1].y).toBeLessThan(fall[0].y);
  });

  it('puts the first epoch at x = 1', () => {
    expect(epochSeries([0.5, 0.6])).toEqual([
      { x: 1, y: 0.5 },
      { x: 2, y: 0.6 },
    ]);
  });

  it('finds the extent with room, ignoring NaN', () => {
    expect(extent([])).toEqual([0, 1]);
    const [lo, hi] = extent([[1, 3], [Number.NaN, 2]]);
    expect(lo).toBeLessThan(1);
    expect(hi).toBeGreaterThan(3);
    const [a, b] = extent([[2, 2]]);
    expect(a).toBeLessThan(2);
    expect(b).toBeGreaterThan(2);
  });

  it('makes a spark path only from 2 or more values', () => {
    expect(sparkPath([1])).toBe('');
    expect(sparkPath([1, 2, 3]).startsWith('M')).toBe(true);
  });
});

describe('ramp', () => {
  it('goes from dark to the ink colour and clamps', () => {
    expect(rampColor(0, 'ink')).toEqual([18, 18, 24]);
    expect(rampColor(1, 'ink')).toEqual([245, 245, 245]);
    expect(rampColor(2, 'violet')).toEqual([167, 150, 255]);
    expect(rampColor(Number.NaN, 'violet')).toEqual([18, 18, 24]);
  });
});
