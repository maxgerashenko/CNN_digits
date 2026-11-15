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

  it('shows the sample digit, and the first stroke takes its place', () => {
    useDrawingStore.getState().showSample();
    const shown = useDrawingStore.getState();
    expect(shown.sample).toBe(true);
    expect(shown.blank).toBe(false);
    // The 5 has ink on its top bar and none in the corner of the pad.
    expect(shown.pixels[6 * 28 + 14]).toBe(1);
    expect(shown.pixels[0]).toBe(0);

    useDrawingStore.getState().stroke({ x: 3, y: 25 }, { x: 3, y: 25 });
    const drawn = useDrawingStore.getState();
    expect(drawn.sample).toBe(false);
    expect(drawn.pixels[6 * 28 + 14]).toBe(0);
    expect(drawn.pixels[25 * 28 + 3]).toBe(1);
  });

  it('clear removes the sample digit', () => {
    useDrawingStore.getState().showSample();
    useDrawingStore.getState().clear();
    expect(useDrawingStore.getState().sample).toBe(false);
    expect(useDrawingStore.getState().blank).toBe(true);
  });
});
