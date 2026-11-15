// Sample data for tests of the screens. Not shipped: only test files import it.
// The numbers are made up for tests; they are not results of the real server.

import { DEFAULT_SETTINGS } from '../lib/settings';
import { describeArchitecture } from '../lib/architecture';
import { analyzeWeights } from '../model/weightStats';
import type { FeatureMapSet, Inference, LoadedModel, ModelInfo } from '../model/modelLoader';
import type { EpochPoint, RunRecord, RunResults, Settings, WeightAnalysis } from '../types';

/** The default settings with some values changed. */
export function settingsWith(changes: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...changes };
}

/** One EpochPoint per entry; `epochs` is the total asked for. */
export function makeEpochs(
  rows: readonly { valAccuracy: number; accuracy: number; valLoss: number; loss: number; seconds: number }[],
): EpochPoint[] {
  return rows.map((row, index) => ({ epoch: index + 1, epochs: rows.length, ...row }));
}

/** A small fixed pseudo-random list, so a fixture does not change between runs. */
function values(count: number, scale: number, seed: number): Float32Array {
  const list = new Float32Array(count);
  let state = seed;
  for (let i = 0; i < count; i++) {
    // Sum of three uniform numbers: a rough bell around 0.
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      sum += state / 4294967296 - 0.5;
    }
    list[i] = sum * scale;
  }
  return list;
}

/** A weight analysis of a healthy model: bell-shaped weights, no dead filters. */
export function makeAnalysis(overrides: Partial<WeightAnalysis> = {}): WeightAnalysis {
  const analysis = analyzeWeights([
    { layer: 'conv 1', kind: 'conv', tag: 'kernel', shape: [3, 3, 1, 16], values: values(144, 0.8, 1) },
    { layer: 'conv 2', kind: 'conv', tag: 'kernel', shape: [3, 3, 16, 16], values: values(2304, 0.2, 2) },
    { layer: 'dense', kind: 'dense', tag: 'kernel', shape: [1568, 128], values: values(2000, 0.1, 3) },
    { layer: 'output', kind: 'output', tag: 'kernel', shape: [128, 10], values: values(1280, 0.3, 4) },
    { layer: 'norm 1', kind: 'norm', tag: 'gamma', shape: [16], values: new Float32Array(16).fill(1) },
    { layer: 'norm 1', kind: 'norm', tag: 'beta', shape: [16], values: values(16, 0.1, 5) },
  ]);
  return { ...analysis, ...overrides };
}

/** Run 1 of this tab: default settings, 2 epochs, 97.9% and 210 mistakes. */
export const runOne: RunRecord = {
  id: 'job-1',
  number: 1,
  settings: settingsWith(),
  epochs: makeEpochs([
    { accuracy: 0.9, loss: 0.33, valAccuracy: 0.96, valLoss: 0.14, seconds: 29 },
    { accuracy: 0.965, loss: 0.11, valAccuracy: 0.979, valLoss: 0.07, seconds: 58 },
  ]),
  results: {
    testAccuracy: 0.979,
    mistakes: 210,
    testImages: 10000,
    loss: 0.11,
    accuracy: 0.965,
    valLoss: 0.07,
    valAccuracy: 0.979,
    epochs: 2,
    trainingSeconds: 58,
  } satisfies RunResults,
  analysis: makeAnalysis(),
  params: describeArchitecture(settingsWith()).params,
};

/** Run 2: only Epochs changed (2 to 4), so the difference belongs to it. 98.62% and 138 mistakes. */
export const runTwo: RunRecord = {
  id: 'job-2',
  number: 2,
  settings: settingsWith({ epochs: 4 }),
  epochs: makeEpochs([
    { accuracy: 0.9, loss: 0.33, valAccuracy: 0.96, valLoss: 0.14, seconds: 28 },
    { accuracy: 0.965, loss: 0.11, valAccuracy: 0.979, valLoss: 0.07, seconds: 57 },
    { accuracy: 0.978, loss: 0.07, valAccuracy: 0.9845, valLoss: 0.052, seconds: 85 },
    { accuracy: 0.983, loss: 0.055, valAccuracy: 0.9862, valLoss: 0.048, seconds: 114 },
  ]),
  results: {
    testAccuracy: 0.9862,
    mistakes: 138,
    testImages: 10000,
    loss: 0.055,
    accuracy: 0.983,
    valLoss: 0.048,
    valAccuracy: 0.9862,
    epochs: 4,
    trainingSeconds: 114,
  },
  analysis: makeAnalysis(),
  params: describeArchitecture(settingsWith({ epochs: 4 })).params,
};

/** Both runs, oldest first, as `useTrainingStore.runs` holds them. */
export const sampleRuns: RunRecord[] = [runOne, runTwo];

export interface FakeModelOptions {
  /** The digit the model reads, whatever is drawn. Default 7. */
  digit?: number;
  /** Probability of that digit; the rest is shared by the other nine. Default 0.9. */
  confidence?: number;
  /** The shape of the model. Default: the default settings (2 blocks, 1568 numbers, dense 128). */
  info?: ModelInfo;
  analysis?: WeightAnalysis;
}

/** A LoadedModel that needs no TensorFlow.js: it always reads the same digit. */
export function makeFakeModel(options: FakeModelOptions = {}): LoadedModel & { disposed: boolean } {
  const { digit = 7, confidence = 0.9 } = options;
  const architecture = describeArchitecture(DEFAULT_SETTINGS);
  const info: ModelInfo = options.info ?? {
    blocks: architecture.blocks,
    flatten: architecture.flatten,
    dense: architecture.dense,
    batchNorm: architecture.batchNorm,
    params: architecture.params,
  };
  const rest = (1 - confidence) / 9;
  const probs = Array.from({ length: 10 }, (_, i) => (i === digit ? confidence : rest));

  const model = {
    info,
    disposed: false,
    infer(_pixels: Float32Array, maxMaps = 8): Inference {
      const maps: FeatureMapSet[] = info.blocks.map((block) => ({
        block: block.index,
        size: block.outSize,
        channels: block.filters,
        maps: Array.from({ length: Math.min(block.filters, maxMaps) }, (_, c) =>
          Float32Array.from({ length: block.outSize * block.outSize }, (_v, i) => ((i + c) % 5) / 4),
        ),
      }));
      return { digit, probs: [...probs], maps };
    },
    analyze: () => options.analysis ?? makeAnalysis(),
    dispose() {
      model.disposed = true;
    },
  };
  return model;
}
