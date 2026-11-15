import { describe, expect, it } from 'vitest';

import {
  ADVANCED_COUNT,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  cleanValue,
  diffSettings,
  formatSetting,
  isAllowed,
} from './settings';

describe('settings', () => {
  it('has the 13 keys and the server defaults', () => {
    expect(SETTING_KEYS).toHaveLength(13);
    expect(DEFAULT_SETTINGS).toEqual({
      conv_blocks: 2,
      conv_layers_per_block: 2,
      dense_layers: 1,
      filters: 16,
      kernel_size: 3,
      dense_units: 128,
      dropout: 0.1,
      learning_rate: 0.001,
      epochs: 2,
      batch_norm: true,
      batch_size: 32,
      train_images: 10000,
      augmentation: 0.05,
    });
    expect(ADVANCED_COUNT).toBe(4);
  });

  it('accepts only what the server accepts', () => {
    expect(isAllowed('epochs', 20)).toBe(true);
    expect(isAllowed('epochs', 21)).toBe(false);
    expect(isAllowed('epochs', 2.5)).toBe(false);
    expect(isAllowed('filters', 12)).toBe(false);
    expect(isAllowed('learning_rate', 0.01)).toBe(true);
    expect(isAllowed('dropout', 0.3)).toBe(true);
    expect(isAllowed('dropout', 0.6)).toBe(false);
    expect(isAllowed('batch_norm', 1)).toBe(false);
    expect(isAllowed('batch_norm', false)).toBe(true);
    expect(isAllowed('epochs', Number.NaN)).toBe(false);
  });

  it('removes floating point noise', () => {
    expect(cleanValue('dropout', 0.30000000000000004)).toBe(0.3);
    expect(cleanValue('augmentation', 0.05 + 1e-12)).toBe(0.05);
    expect(cleanValue('epochs', 3.0000001)).toBe(3);
  });

  it('writes values as the design does', () => {
    expect(formatSetting('kernel_size', 3, 'long')).toBe('3 × 3');
    expect(formatSetting('kernel_size', 5)).toBe('5×5');
    expect(formatSetting('train_images', 10000)).toBe('10k');
    expect(formatSetting('augmentation', 0)).toBe('Off');
    expect(formatSetting('augmentation', 0.05)).toBe('0.05');
    expect(formatSetting('batch_norm', true)).toBe('on');
    expect(formatSetting('dropout', 0.1)).toBe('0.1');
  });

  it('lists the settings that differ, in screen order', () => {
    expect(diffSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual([]);
    expect(diffSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, epochs: 4, batch_norm: false, filters: 32 })).toEqual([
      'filters',
      'epochs',
      'batch_norm',
    ]);
  });
});
