import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../lib/settings';
import { useSettingsStore } from './settingsStore';

beforeEach(() => {
  useSettingsStore.getState().reset();
});
const get = () => useSettingsStore.getState();

describe('settingsStore', () => {
  it('starts at the defaults', () => {
    expect(get().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('sets one allowed value', () => {
    get().setSetting('epochs', 4);
    expect(get().settings.epochs).toBe(4);
  });

  it('ignores a value that is not allowed', () => {
    get().setSetting('epochs', 99);
    get().setSetting('epochs', 0);
    expect(get().settings.epochs).toBe(DEFAULT_SETTINGS.epochs);
  });

  it('applies several values and skips the bad ones', () => {
    get().applySettings({ epochs: 3, batch_size: 64 });
    expect(get().settings).toMatchObject({ epochs: 3, batch_size: 64 });
    const before = get().settings;
    get().applySettings({ epochs: 99 });
    expect(get().settings.epochs).toBe(before.epochs);
  });

  it('reset restores defaults', () => {
    get().setSetting('epochs', 4);
    get().reset();
    expect(get().settings).toEqual(DEFAULT_SETTINGS);
  });
});
