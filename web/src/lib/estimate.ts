// How long training will take. A port of estimate() in server/limits.py,
// because the server does not offer the estimate over the network.
// Keep the constants the same as in that file.

import type { Settings } from '../types';

const STARTUP_SECONDS = 4.0;
const US_PER_MILLION_MACS = { off: 18.0, on: 23.0 };
const MS_PER_BATCH = 1.5;
const MS_PER_BATCH_LAYER = { off: 0.7, on: 1.9 };
const US_PER_IMAGE = 30.0;
const US_PER_IMAGE_AUGMENT = 100.0;
const TEST_IMAGES = 10_000;
const TEST_COST_SHARE = 0.25;

/** Default of TRAIN_TIME_LIMIT_SECONDS in server/limits.py. */
export const TIME_LIMIT_SECONDS = 600;

/** Multiply-adds for one 28x28 image going forward through the network. */
export function countMultiplyAdds(settings: Settings): number {
  let size = 28;
  let channels = 1;
  let total = 0;
  const kernel = settings.kernel_size;
  for (let block = 0; block < settings.conv_blocks; block++) {
    const filters = settings.filters * 2 ** block;
    for (let layer = 0; layer < settings.conv_layers_per_block; layer++) {
      total += size * size * kernel * kernel * channels * filters;
      channels = filters;
    }
    size = Math.floor(size / 2);
  }
  let width = size * size * channels;
  for (let layer = 0; layer < settings.dense_layers; layer++) {
    total += width * settings.dense_units;
    width = settings.dense_units;
  }
  return total + width * 10;
}

export function estimateSeconds(settings: Settings): number {
  const bn = settings.batch_norm ? 'on' : 'off';
  const layers = settings.conv_blocks * settings.conv_layers_per_block + settings.dense_layers;

  let perImage = (countMultiplyAdds(settings) / 1e6) * US_PER_MILLION_MACS[bn];
  const perBatchMs = MS_PER_BATCH + layers * MS_PER_BATCH_LAYER[bn];
  perImage += (perBatchMs * 1000) / settings.batch_size + US_PER_IMAGE;

  const trainPerImage = perImage + (settings.augmentation ? US_PER_IMAGE_AUGMENT : 0);
  const epochs = settings.epochs;

  let microseconds = epochs * settings.train_images * trainPerImage;
  microseconds += (epochs + 1) * TEST_IMAGES * perImage * TEST_COST_SHARE;
  return STARTUP_SECONDS + microseconds / 1e6;
}

/** Python's round(): halves go to the even number, so results equal server/limits.py exactly. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Seconds in words: "a few seconds", "about 40 seconds", "about 2 minutes". */
export function formatDuration(seconds: number): string {
  if (seconds < 10) return 'a few seconds';
  if (seconds < 50) return `about ${roundHalfEven(seconds / 10) * 10} seconds`;
  const minutes = Math.max(1, roundHalfEven(seconds / 60));
  return minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`;
}

export interface TimeEstimate {
  seconds: number;
  text: string;
  overTimeLimit: boolean;
}

export function estimate(settings: Settings): TimeEstimate {
  const seconds = estimateSeconds(settings);
  return {
    seconds: roundHalfEven(seconds),
    text: formatDuration(Math.min(seconds, TIME_LIMIT_SECONDS)),
    overTimeLimit: seconds > TIME_LIMIT_SECONDS,
  };
}
