// The shape of the network that a set of settings builds. Follows
// server/model.py build_model() exactly, so the weight count shown before
// training equals the count of the trained model.

import type { Settings } from '../types';

export const IMAGE_SIZE = 28;
export const OUTPUT_UNITS = 10;

export interface BlockShape {
  /** 1 for the first block. */
  index: number;
  filters: number;
  convLayers: number;
  kernel: number;
  /** Side of the square image going in and coming out (after MaxPool). */
  inSize: number;
  outSize: number;
}

export interface Architecture {
  blocks: BlockShape[];
  /** Image side at each stage: [28, 14, 7] for two blocks. */
  sizes: number[];
  /** Numbers that leave Flatten: outSize * outSize * filters of the last block. */
  flatten: number;
  /** Units of each hidden dense layer. */
  dense: number[];
  batchNorm: boolean;
  dropout: number;
  /** All weights, trainable or not (Keras count_params). */
  params: number;
}

export function describeArchitecture(settings: Settings): Architecture {
  const bn = settings.batch_norm;
  const k = settings.kernel_size;
  const blocks: BlockShape[] = [];
  const sizes = [IMAGE_SIZE];
  let size = IMAGE_SIZE;
  let channels = 1;
  let params = 0;

  for (let b = 0; b < settings.conv_blocks; b++) {
    const filters = settings.filters * 2 ** b;
    for (let c = 0; c < settings.conv_layers_per_block; c++) {
      // Conv kernel, then either batch norm (4 numbers per filter) or a bias.
      params += k * k * channels * filters + (bn ? 4 * filters : filters);
      channels = filters;
    }
    const outSize = Math.floor(size / 2);
    blocks.push({ index: b + 1, filters, convLayers: settings.conv_layers_per_block, kernel: k, inSize: size, outSize });
    size = outSize;
    sizes.push(size);
  }

  const flatten = size * size * channels;
  let width = flatten;
  const dense: number[] = [];
  for (let d = 0; d < settings.dense_layers; d++) {
    params += width * settings.dense_units + (bn ? 4 * settings.dense_units : settings.dense_units);
    width = settings.dense_units;
    dense.push(width);
  }
  params += width * OUTPUT_UNITS + OUTPUT_UNITS;

  return { blocks, sizes, flatten, dense, batchNorm: bn, dropout: settings.dropout, params };
}

export function countParams(settings: Settings): number {
  return describeArchitecture(settings).params;
}

/** Batches in one epoch: 313 for 10,000 images in batches of 32. */
export function batchesPerEpoch(settings: Settings): number {
  return Math.ceil(settings.train_images / settings.batch_size);
}
