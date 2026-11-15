import { beforeEach, describe, expect, it } from 'vitest';

import { CELLS, isBlank } from '../lib/drawing';
import { useDrawingStore } from './drawingStore';

beforeEach(() => useDrawingStore.getState().clear());

describe('drawingStore', () => {
  it('starts blank', () => {
    const s = useDrawingStore.getState();
    expect(s.blank).toBe(true);
    expect(s.pixels).toHaveLength(CELLS);
    expect(isBlank(s.pixels)).toBe(true);
  });

  it('a stroke draws, makes a new array and clears the blank flag', () => {
    const before = useDrawingStore.getState().pixels;
    useDrawingStore.getState().stroke({ x: 14, y: 14 }, { x: 14, y: 14 });
    const s = useDrawingStore.getState();
    expect(s.blank).toBe(false);
    expect(s.pixels).not.toBe(before);
    expect(isBlank(s.pixels)).toBe(false);
    expect(isBlank(before)).toBe(true);
  });

  it('clear wipes the drawing', () => {
    useDrawingStore.getState().stroke({ x: 5, y: 5 }, { x: 20, y: 20 });
    useDrawingStore.getState().clear();
    expect(useDrawingStore.getState().blank).toBe(true);
    expect(isBlank(useDrawingStore.getState().pixels)).toBe(true);
  });
});
