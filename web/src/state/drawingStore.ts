// The drawing on the pad. One drawing for the whole app.

import { create } from 'zustand';

import { blankPixels, samplePixels, stampStroke, type PadPoint } from '../lib/drawing';

export interface DrawingState {
  /** 784 values, 0..1, row by row. A new array after every change. */
  pixels: Float32Array;
  /** True while nothing is drawn. */
  blank: boolean;
  /** True while the pad shows the sample digit, not a drawing of the visitor. */
  sample: boolean;
  /** Puts the sample digit 5 on the pad. The app does this once, when it opens. */
  showSample(): void;
  /** Adds a brush stroke from one pad point to another (the same point twice for a dot). */
  stroke(from: PadPoint, to: PadPoint): void;
  clear(): void;
}

export const useDrawingStore = create<DrawingState>((set) => ({
  pixels: blankPixels(),
  blank: true,
  sample: false,
  showSample: () => set({ pixels: samplePixels(), blank: false, sample: true }),
  stroke: (from, to) =>
    set((state) => ({
      // The first stroke takes the place of the sample digit.
      pixels: stampStroke(state.sample ? blankPixels() : state.pixels, from, to),
      blank: false,
      sample: false,
    })),
  clear: () => set({ pixels: blankPixels(), blank: true, sample: false }),
}));
