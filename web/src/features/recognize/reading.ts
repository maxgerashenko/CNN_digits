import { formatInt } from '../../lib/format';
import type { Inference, LoadedModel } from '../../model/modelLoader';
import { useInferenceStore, type InferenceStatus } from '../../state/inferenceStore';
import { selectActiveSlot, useModelStore } from '../../state/modelStore';

export interface Reading {
  /** The active model when it is ready, else null. */
  model: LoadedModel | null;
  /** Loading, missing or failed, as the model store says. */
  modelStatus: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  /** The model store's message when loading failed, else null. */
  modelError: string | null;
  status: InferenceStatus;
  result: Inference | null;
}

/** What the active model made of the drawing, for the "how it was read" blocks. */
export function useReading(): Reading {
  const slot = useModelStore(selectActiveSlot);
  const status = useInferenceStore((s) => s.status);
  const result = useInferenceStore((s) => s.result);
  return {
    model: slot.status === 'ready' ? slot.model : null,
    modelStatus: slot.status,
    modelError: slot.status === 'error' ? (slot.error ?? null) : null,
    status,
    result,
  };
}

/** The short title for a model that cannot read: loading, missing or failed. */
export function noModelTitle(modelStatus: Reading['modelStatus']): string {
  if (modelStatus === 'missing') return 'Model missing';
  if (modelStatus === 'error') return 'Model not loaded';
  return 'Loading';
}

/** The sentence for a model that cannot read: loading, missing or failed. */
export function noModelText(modelStatus: Reading['modelStatus']): string {
  if (modelStatus === 'missing') return 'The saved model is not added yet, so there is nothing to show.';
  if (modelStatus === 'error') return 'The model could not be loaded, so there is nothing to show.';
  return 'The model is loading.';
}

export const DRAW_PROMPT = 'Draw a digit to see it here.';

export function stepLabel(n: number): string {
  return String(n).padStart(2, '0');
}

/** "1,568 → dense 128 → 10", from the model's own shape. */
export function answerSpec(flatten: number, dense: number[]): string {
  return [formatInt(flatten), ...dense.map((units) => `dense ${units}`), '10'].join(' → ');
}

