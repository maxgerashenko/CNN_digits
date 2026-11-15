import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../routes';
import { useSettingsStore } from '../state/settingsStore';
import { isBusy, useTrainingStore } from '../state/trainingStore';
import type { Settings } from '../types';

export interface StartTraining {
  /**
   * Starts a run with the settings in the form and opens the Training
   * screen. `changes` are put into the form first ("Retrain with Epochs 4").
   */
  start(changes?: Partial<Settings>): void;
  /** True when Start must not be pressed: no server address, or a run is in progress. */
  disabled: boolean;
  /** True while a run is in progress. */
  busy: boolean;
  /** A sentence to show next to the button, or null: server not set up, starting, unreachable. */
  note: string | null;
}

/** The one way to start a training run from a button. */
export function useStartTraining(): StartTraining {
  const navigate = useNavigate();
  const server = useTrainingStore((state) => state.server);
  const busy = useTrainingStore((state) => isBusy(state.phase));

  const start = useCallback(
    (changes?: Partial<Settings>) => {
      const settingsStore = useSettingsStore.getState();
      if (changes) settingsStore.applySettings(changes);
      void useTrainingStore.getState().start(useSettingsStore.getState().settings);
      navigate(ROUTES.training);
    },
    [navigate],
  );

  return {
    start,
    disabled: server.status === 'unconfigured' || busy,
    busy,
    note: server.text || null,
  };
}
