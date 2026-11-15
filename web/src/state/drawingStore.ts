// The drawing on the pad. One drawing for the whole app.

import { create } from 'zustand';

import { blankPixels, stampStroke, type PadPoint } from '../lib/drawing';

export interface DrawingState {
  /** 784 values, 0..1, row by row. A new array after every change. */
  pixels: Float32Array;
  /** True while nothing is drawn. */
  blank: boolean;
  /** Adds a brush stroke from one pad point to another (the same point twice for a dot). */
  stroke(from: PadPoint, to: PadPoint): void;
  clear(): void;
}

export const useDrawingStore = create<DrawingState>((set) => ({
  pixels: blankPixels(),
  blank: true,
  stroke: (from, to) => set((state) => ({ pixels: stampStroke(state.pixels, from, to), blank: false })),
  clear: () => set({ pixels: blankPixels(), blank: true }),
}));
