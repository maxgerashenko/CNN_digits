// The two models the app can read a drawing with: the saved one that ships
// with the page, and the one the visitor retrained (kept only in this tab).

import { create } from 'zustand';

import { SAVED_MODEL_URL } from '../config';
import { ModelMissingError, loadModel, type LoadedModel } from '../model/modelLoader';
import type { ModelSource } from '../types';

export type ModelStatus =
  /** Not asked for yet. */
  | 'idle'
  | 'loading'
  | 'ready'
  /** The model files are not there. For the saved model: not added to the repo yet. */
  | 'missing'
  | 'error';

export interface ModelSlot {
  status: ModelStatus;
  model: LoadedModel | null;
  /** A sentence for the visitor when status is 'error'. */
  error: string | null;
}

export interface ModelState {
  saved: ModelSlot;
  retrained: ModelSlot;
  /** Id of the run that made the retrained model. */
  retrainedRunId: string | null;
  /** Which model reads the drawing. */
  active: ModelSource;
  /** Loads the saved model once. Safe to call many times. */
  loadSaved(loader?: (url: string) => Promise<LoadedModel>): Promise<void>;
  /** Stores a freshly trained model. It does not become active by itself. */
  setRetrained(model: LoadedModel, runId: string): void;
  /** Picks the model to use. 'retrained' is ignored until there is one. */
  setActive(source: ModelSource): void;
}

const EMPTY: ModelSlot = { status: 'idle', model: null, error: null };

export const useModelStore = create<ModelState>((set, get) => ({
  saved: EMPTY,
  retrained: EMPTY,
  retrainedRunId: null,
  active: 'saved',

  async loadSaved(loader = loadModel) {
    if (get().saved.status !== 'idle') return;
    set({ saved: { status: 'loading', model: null, error: null } });
    try {
      const model = await loader(SAVED_MODEL_URL);
      set({ saved: { status: 'ready', model, error: null } });
    } catch (error) {
      if (error instanceof ModelMissingError) {
        set({ saved: { status: 'missing', model: null, error: null } });
      } else {
        set({ saved: { status: 'error', model: null, error: (error as Error).message } });
      }
    }
  },

  setRetrained(model, runId) {
    const previous = get().retrained.model;
    set({ retrained: { status: 'ready', model, error: null }, retrainedRunId: runId });
    if (previous && previous !== model) previous.dispose();
  },

  setActive(source) {
    if (source === 'retrained' && get().retrained.status !== 'ready') return;
    set({ active: source });
  },
}));

/** The slot of the model that reads the drawing now. */
export function selectActiveSlot(state: ModelState): ModelSlot {
  return state.active === 'retrained' ? state.retrained : state.saved;
}
