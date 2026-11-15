import { describe, expect, it } from 'vitest';

import { batchesPerEpoch, countParams, describeArchitecture } from './architecture';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from '../types';

const with_ = (changes: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...changes });

describe('countParams', () => {
  it('gives 219,162 weights for the default settings (same as Keras)', () => {
    expect(countParams(DEFAULT_SETTINGS)).toBe(219162);
  });

  it('gives 218,490 with batch norm off (a bias in place of batch norm)', () => {
    expect(countParams(with_({ batch_norm: false }))).toBe(160 + 2320 + 4640 + 9248 + 200832 + 1290);
    expect(countParams(with_({ batch_norm: false }))).toBe(218490);
  });

  it('counts a model with no hidden dense layer', () => {
    const params = countParams(with_({ dense_layers: 0, batch_norm: false }));
    expect(params).toBe(160 + 2320 + 4640 + 9248 + 1568 * 10 + 10);
  });
});

describe('describeArchitecture', () => {
  it('follows the image size through the blocks', () => {
    const a = describeArchitecture(DEFAULT_SETTINGS);
    expect(a.sizes).toEqual([28, 14, 7]);
    expect(a.flatten).toBe(1568);
    expect(a.dense).toEqual([128]);
    expect(a.blocks.map((b) => b.filters)).toEqual([16, 32]);
  });

  it('doubles the filters in each block and reaches 3 x 3 after three blocks', () => {
    const a = describeArchitecture(with_({ conv_blocks: 3 }));
    expect(a.blocks.map((b) => b.filters)).toEqual([16, 32, 64]);
    expect(a.sizes).toEqual([28, 14, 7, 3]);
    expect(a.flatten).toBe(3 * 3 * 64);
  });
});

describe('batchesPerEpoch', () => {
  it('is 313 for 10,000 images in batches of 32', () => {
    expect(batchesPerEpoch(DEFAULT_SETTINGS)).toBe(313);
  });
});
