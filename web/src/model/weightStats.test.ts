import { describe, expect, it } from 'vitest';

import { analyzeWeights, deadFilterShare, histogram, isBellAroundZero, type WeightEntry } from './weightStats';

const f = (...values: number[]) => Float32Array.from(values);

describe('histogram', () => {
  it('counts values into bins scaled so the tallest is 1', () => {
    const h = histogram([f(0, 0, 0, 0, 1, 1, 2, 4)], 4);
    expect(h.lo).toBe(0);
    expect(h.hi).toBe(4);
    expect(h.count).toBe(8);
    // bins: [0,1) 4 values, [1,2) 2, [2,3) 1, [3,4] 1
    expect(h.bins).toEqual([1, 0.5, 0.25, 0.25]);
    expect(h.mean).toBeCloseTo(1, 10);
  });

  it('pools several arrays', () => {
    const h = histogram([f(0, 1), f(2, 3)], 4);
    expect(h.count).toBe(4);
    expect(h.bins).toEqual([1, 1, 1, 1]);
  });

  it('copes with empty and constant input', () => {
    expect(histogram([]).count).toBe(0);
    const same = histogram([f(2, 2, 2)], 5);
    expect(same.lo).toBe(2);
    expect(Math.max(...same.bins)).toBe(1);
    expect(same.std).toBe(0);
  });
});

describe('deadFilterShare', () => {
  it('counts filters (the last axis) whose weights are all within 0.001 of zero', () => {
    // shape [1, 1, 2, 3]: values run in-channel major, the filter is the last axis.
    const values = f(0, 0.5, 0.0005, 0, 0.0001, 0.9);
    const entry: WeightEntry = { layer: 'conv 1', kind: 'conv', tag: 'kernel', shape: [1, 1, 2, 3], values };
    // filter 0: indices 0, 3 -> 0, 0; filter 1: 1, 4 -> 0.5, 0.0001; filter 2: 2, 5 -> 0.0005, 0.9
    expect(deadFilterShare([entry])).toBeCloseTo(1 / 3, 10);
  });

  it('is 0 without conv kernels', () => {
    const dense: WeightEntry = { layer: 'dense', kind: 'dense', tag: 'kernel', shape: [2, 2], values: f(0, 0, 0, 0) };
    expect(deadFilterShare([dense])).toBe(0);
  });
});

describe('isBellAroundZero', () => {
  const ramp = (n: number, from: number, to: number) => Float32Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

  it('is true for a bell centred on 0', () => {
    // Triangle-ish bell: dense in the middle.
    const bell: number[] = [];
    for (let i = 0; i < 200; i++) bell.push(Math.tan(((i + 0.5) / 200 - 0.5) * 2) * 0.1);
    expect(isBellAroundZero([Float32Array.from(bell)])).toBe(true);
  });

  it('is false for a flat spread', () => {
    expect(isBellAroundZero([ramp(200, -1, 1)])).toBe(false);
  });

  it('is false for a bell that is not centred', () => {
    const shifted: number[] = [];
    for (let i = 0; i < 200; i++) shifted.push(1 + Math.tan(((i + 0.5) / 200 - 0.5) * 2) * 0.1);
    expect(isBellAroundZero([Float32Array.from(shifted)])).toBe(false);
  });

  it('cannot be told from fewer than 16 values or no spread', () => {
    expect(isBellAroundZero([f(1, 2, 3)])).toBeNull();
    expect(isBellAroundZero([new Float32Array(50)])).toBeNull();
  });
});

describe('analyzeWeights', () => {
  const entries: WeightEntry[] = [
    { layer: 'conv 1', kind: 'conv', tag: 'kernel', shape: [1, 1, 1, 2], values: f(0.5, -0.5) },
    { layer: 'dense', kind: 'dense', tag: 'kernel', shape: [2, 2], values: f(1, 2, 3, 4) },
    { layer: 'output', kind: 'output', tag: 'kernel', shape: [2, 1], values: f(0.1, 0.2) },
    { layer: 'norm 1', kind: 'norm', tag: 'gamma', shape: [2], values: f(1, 1) },
    { layer: 'norm 2', kind: 'norm', tag: 'gamma', shape: [1], values: f(3) },
    { layer: 'output', kind: 'output', tag: 'bias', shape: [1], values: f(0) },
  ];
  const analysis = analyzeWeights(entries);

  it('makes one histogram per kernel, in model order, and none for norm layers', () => {
    expect(analysis.layers.map((l) => [l.name, l.kind])).toEqual([
      ['conv 1', 'conv'],
      ['dense', 'dense'],
      ['output', 'output'],
    ]);
    expect(analysis.layers[1].histogram.count).toBe(4);
    expect(analysis.layers[1].histogram.mean).toBe(2.5);
  });

  it('pools by weight kind and leaves out kinds the model does not have', () => {
    expect(analysis.tags.map((t) => t.tag)).toEqual(['kernel', 'gamma', 'bias']);
    expect(analysis.tags.find((t) => t.tag === 'gamma')!.histogram.count).toBe(3);
    expect(analysis.tags.find((t) => t.tag === 'kernel')!.histogram.count).toBe(8);
  });

  it('reports dead filters and a bell that cannot be told on tiny arrays', () => {
    expect(analysis.deadFilterShare).toBe(0);
    expect(analysis.denseBell).toBeNull();
    expect(analyzeWeights([]).denseBell).toBeNull();
  });
});
