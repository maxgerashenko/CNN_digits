import { useMemo } from 'react';

import { evaluateChecks, type CheckResult } from '../lib/checks';
import { diffSettings } from '../lib/settings';
import { useSettingsStore } from '../state/settingsStore';
import { selectLatestRun, selectPreviousRun, useTrainingStore } from '../state/trainingStore';
import type { RunRecord, SettingKey } from '../types';

export interface RunChecks {
  /** The latest finished run, or null before the first run. */
  run: RunRecord | null;
  /** The run before it, or null. */
  prev: RunRecord | null;
  /** One check per setting, in screen order. All 'new' before the first run. */
  checks: CheckResult[];
  /** The settings that differ between `prev` and `run`. Empty without both. */
  changed: SettingKey[];
}

/** The latest run, the one before, and the 13 checks. */
export function useRunChecks(): RunChecks {
  const run = useTrainingStore(selectLatestRun);
  const prev = useTrainingStore(selectPreviousRun);
  const settings = useSettingsStore((state) => state.settings);
  return useMemo(
    () => ({
      run,
      prev,
      checks: evaluateChecks({ run, prev, settings }),
      changed: run && prev ? diffSettings(prev.settings, run.settings) : [],
    }),
    [run, prev, settings],
  );
}
