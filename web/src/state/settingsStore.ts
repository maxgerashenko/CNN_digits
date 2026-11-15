// The 13 settings in the Train form.

import { create } from 'zustand';

import { DEFAULT_SETTINGS, cleanValue, isAllowed } from '../lib/settings';
import type { SettingKey, Settings } from '../types';

export interface SettingsState {
  settings: Settings;
  /** Whether the Advanced group is open (phone and desktop; the tablet always shows it). */
  advancedOpen: boolean;
  /** Sets one setting. A value that is not allowed is ignored. */
  setSetting<K extends SettingKey>(key: K, value: Settings[K]): void;
  /** Sets several settings at once, for example from a "Set 4" button. */
  applySettings(values: Partial<Settings>): void;
  setAdvancedOpen(open: boolean): void;
  reset(): void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  advancedOpen: false,
  setSetting: (key, value) =>
    set((state) => {
      const clean = cleanValue(key, value);
      if (!isAllowed(key, clean)) return state;
      return { settings: { ...state.settings, [key]: clean } };
    }),
  applySettings: (values) =>
    set((state) => {
      const next = { ...state.settings };
      for (const [key, value] of Object.entries(values) as [SettingKey, Settings[SettingKey]][]) {
        const clean = cleanValue(key, value);
        if (isAllowed(key, clean)) (next as Record<SettingKey, unknown>)[key] = clean;
      }
      return { settings: next };
    }),
  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  reset: () => set({ settings: { ...DEFAULT_SETTINGS } }),
}));
