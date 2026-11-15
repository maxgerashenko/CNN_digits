import { describe, expect, it } from 'vitest';

import { CELLS, GRID, blankPixels, isBlank, pointerToPad, stampStroke } from './drawing';

describe('stampStroke', () => {
  it('returns a new array and leaves the input alone', () => {
    const before = blankPixels();
    const after = stampStroke(before, { x: 14, y: 14 }, { x: 14, y: 14 });
    expect(after).not.toBe(before);
    expect(isBlank(before)).toBe(true);
    expect(after).toHaveLength(CELLS);
  });

  it('puts full ink under a dot and fades it out within 2.3 cells', () => {
    const dot = stampStroke(blankPixels(), { x: 14.5, y: 14.5 }, { x: 14.5, y: 14.5 });
    expect(dot[14 * GRID + 14]).toBe(1);
    const edge = dot[14 * GRID + 16]; // 2 cells from the centre
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(dot[14 * GRID + 18]).toBe(0);
  });

  it('draws a line between two points', () => {
    const line = stampStroke(blankPixels(), { x: 2.5, y: 10.5 }, { x: 25.5, y: 10.5 });
    for (let x = 2; x <= 25; x++) expect(line[10 * GRID + x]).toBe(1);
  });

  it('keeps the strongest ink when strokes overlap', () => {
    const first = stampStroke(blankPixels(), { x: 5.5, y: 5.5 }, { x: 5.5, y: 5.5 });
    const second = stampStroke(first, { x: 20.5, y: 20.5 }, { x: 20.5, y: 20.5 });
    expect(second[5 * GRID + 5]).toBe(1);
    expect(second[20 * GRID + 20]).toBe(1);
  });

  it('stays inside the grid at the edges', () => {
    const corner = stampStroke(blankPixels(), { x: 0, y: 0 }, { x: 28, y: 28 });
    expect(corner).toHaveLength(CELLS);
    expect(corner[0]).toBe(1);
    expect(corner[CELLS - 1]).toBe(1);
  });
});

describe('pointerToPad', () => {
  const box = { left: 100, top: 50, width: 280, height: 280 };

  it('turns a screen position into cell units', () => {
    expect(pointerToPad(240, 190, box)).toEqual({ x: 14, y: 14 });
    expect(pointerToPad(100, 50, box)).toEqual({ x: 0, y: 0 });
  });

  it('works for a pad that is not 28 px per cell', () => {
    expect(pointerToPad(110, 60, { left: 0, top: 0, width: 56, height: 56 })).toEqual({ x: 28, y: 28 });
  });

  it('clamps a pointer that left the pad', () => {
    expect(pointerToPad(0, 1000, box)).toEqual({ x: 0, y: 28 });
    expect(pointerToPad(9999, -5, box)).toEqual({ x: 28, y: 0 });
  });
});
