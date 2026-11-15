import { describe, expect, it } from 'vitest';

import { countMultiplyAdds, estimate, formatDuration } from './estimate';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from '../types';

const with_ = (changes: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...changes });

// Expected values were produced by running estimate() and count_multiply_adds()
// of server/limits.py with python3 on the same settings.
const FROM_PYTHON: { name: string; changes: Partial<Settings>; seconds: number; text: string; over: boolean; macs: number }[] = [
  { name: 'defaults', changes: {}, seconds: 19, text: 'about 20 seconds', over: false, macs: 4830720 },
  { name: '5 epochs', changes: { epochs: 5 }, seconds: 41, text: 'about 40 seconds', over: false, macs: 4830720 },
  { name: 'batch norm off', changes: { batch_norm: false }, seconds: 14, text: 'about 10 seconds', over: false, macs: 4830720 },
  {
    name: 'biggest network and data',
    changes: { conv_blocks: 3, filters: 32, kernel_size: 5, epochs: 5, train_images: 60000 },
    seconds: 776,
    text: 'about 10 minutes',
    over: true,
    macs: 81057536,
  },
  {
    name: 'no augmentation, batch 128, no dense layer',
    changes: { augmentation: 0, batch_size: 128, dense_layers: 0 },
    seconds: 10,
    text: 'a few seconds',
    over: false,
    macs: 4644416,
  },
  {
    name: 'smallest network',
    changes: {
      epochs: 1,
      train_images: 5000,
      conv_blocks: 1,
      filters: 4,
      conv_layers_per_block: 1,
      dense_layers: 2,
      dense_units: 256,
      batch_norm: false,
      augmentation: 0.1,
    },
    seconds: 6,
    text: 'a few seconds',
    over: false,
    macs: 297024,
  },
];

describe('estimate (port of server/limits.py)', () => {
  it.each(FROM_PYTHON)('equals the Python for $name', ({ changes, seconds, text, over, macs }) => {
    const settings = with_(changes);
    expect(countMultiplyAdds(settings)).toBe(macs);
    expect(estimate(settings)).toEqual({ seconds, text, overTimeLimit: over });
  });
});

describe('formatDuration', () => {
  it('writes seconds in words', () => {
    expect(formatDuration(5)).toBe('a few seconds');
    expect(formatDuration(38)).toBe('about 40 seconds');
    expect(formatDuration(55)).toBe('about 1 minute');
    expect(formatDuration(130)).toBe('about 2 minutes');
  });

  it('rounds halves to the even number, like Python round()', () => {
    expect(formatDuration(25)).toBe('about 20 seconds'); // round(2.5) is 2 in Python
    expect(formatDuration(35)).toBe('about 40 seconds'); // round(3.5) is 4
  });
});
