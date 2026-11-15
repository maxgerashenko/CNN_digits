// What the active model reads in the current drawing. Worked out in one
// place, once per change, so every screen and pane shows the same answer.

import { create } from 'zustand';

import type { Inference } from '../model/modelLoader';
import { useDrawingStore } from './drawingStore';
import { selectActiveSlot, useModelStore } from './modelStore';

export type InferenceStatus =
  /** The active model is not ready (loading, missing or failed). */
  | 'no-model'
  /** Nothing is drawn yet. */
  | 'empty'
  | 'ready';

export interface InferenceState {
  status: InferenceStatus;
  /** Set when status is 'ready'. */
  result: Inference | null;
}

export const useInferenceStore = create<InferenceState>(() => ({ status: 'no-model', result: null }));

/** Reads the drawing with the active model right now and stores the result. */
export function runInferenceNow(): void {
  const slot = selectActiveSlot(useModelStore.getState());
  const { pixels, blank } = useDrawingStore.getState();
  if (slot.status !== 'ready' || !slot.model) {
    useInferenceStore.setState({ status: 'no-model', result: null });
  } else if (blank) {
    useInferenceStore.setState({ status: 'empty', result: null });
  } else {
    try {
      useInferenceStore.setState({ status: 'ready', result: slot.model.infer(pixels) });
    } catch (error) {
      // Never leave the answer to an older drawing on screen: show no answer instead.
      console.error('Reading the drawing failed.', error);
      useInferenceStore.setState({ status: 'empty', result: null });
    }
  }
}

/**
 * Keeps the result up to date: reads the drawing again whenever the drawing
 * or the active model changes, at most once per frame. Call once when the
 * app starts. Returns a function that stops it.
 */
export function startInference(): () => void {
  let scheduled = false;
  let stopped = false;
  const later: (run: () => void) => void =
    typeof requestAnimationFrame === 'function' ? (run) => requestAnimationFrame(run) : (run) => setTimeout(run, 0);

  const schedule = () => {
    if (scheduled || stopped) return;
    scheduled = true;
    later(() => {
      scheduled = false;
      if (!stopped) runInferenceNow();
    });
  };

  const stopDrawing = useDrawingStore.subscribe(schedule);
  const stopModel = useModelStore.subscribe(schedule);
  runInferenceNow();
  return () => {
    stopped = true;
    stopDrawing();
    stopModel();
  };
}
