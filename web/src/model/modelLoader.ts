// Loads a model exported by server/export.py (model.json + weights.bin) and
// wraps it in the three things the app needs: its shape, a way to read a
// drawing (answer + feature maps of every conv block), and its weights.

import type { LayersModel, SymbolicTensor } from '@tensorflow/tfjs-layers';
import type { Tensor } from '@tensorflow/tfjs-core';

import { CELLS, GRID } from '../lib/drawing';
import { argMax } from '../lib/format';
import type { WeightAnalysis, WeightTag } from '../types';
import { loadTf, type Tf } from './tf';
import { WEIGHT_TAGS, analyzeWeights, type WeightEntry } from './weightStats';

/** One conv block of a loaded model. */
export interface ModelBlock {
  /** 1 for the first block. */
  index: number;
  filters: number;
  convLayers: number;
  kernel: number;
  inSize: number;
  outSize: number;
}

export interface ModelInfo {
  blocks: ModelBlock[];
  /** Numbers that leave Flatten, for example 1568. */
  flatten: number;
  /** Units of each hidden dense layer. */
  dense: number[];
  batchNorm: boolean;
  /** All weights (Keras count_params). */
  params: number;
}

/** What one conv block saw in the drawing. */
export interface FeatureMapSet {
  /** 1 for the first block. */
  block: number;
  /** Side of each map: 14, 7 or 3. */
  size: number;
  /** How many maps the block has in total (its filter count). */
  channels: number;
  /** The first `maxMaps` maps, each size * size values, row by row, 0 or more. */
  maps: Float32Array[];
}

export interface Inference {
  /** The most likely digit. */
  digit: number;
  /** Ten probabilities that add up to 1. */
  probs: number[];
  /** One entry per conv block. */
  maps: FeatureMapSet[];
}

export interface LoadedModel {
  info: ModelInfo;
  /** Reads a 28 x 28 drawing (784 values, 0..1). Runs at once, in a few milliseconds. */
  infer(pixels: Float32Array, maxMaps?: number): Inference;
  /** Histograms and checks worked out from the weights. */
  analyze(): WeightAnalysis;
  /** Frees the memory. The model cannot be used after this. */
  dispose(): void;
}

/** The model files are not there (not added yet, or already cleaned up on the server). */
export class ModelMissingError extends Error {
  constructor(message = 'The model files were not found.') {
    super(message);
    this.name = 'ModelMissingError';
  }
}

/** The files are there but could not be read as a model. */
export class ModelLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelLoadError';
  }
}

export const DEFAULT_MAX_MAPS = 8;

function describe(model: LayersModel): ModelInfo {
  const blocks: ModelBlock[] = [];
  const dense: number[] = [];
  let size = GRID;
  let convs = 0;
  let filters = 0;
  let kernel = 0;
  let flatten = 0;
  let batchNorm = false;

  for (const layer of model.layers) {
    const config = layer.getConfig() as Record<string, unknown>;
    switch (layer.getClassName()) {
      case 'Conv2D': {
        convs++;
        filters = Number(config.filters);
        const k = config.kernelSize as number | number[];
        kernel = Array.isArray(k) ? k[0] : k;
        break;
      }
      case 'BatchNormalization':
        batchNorm = true;
        break;
      case 'MaxPooling2D': {
        const outSize = Number((layer.outputShape as (number | null)[])[1]);
        blocks.push({ index: blocks.length + 1, filters, convLayers: convs, kernel, inSize: size, outSize });
        size = outSize;
        convs = 0;
        break;
      }
      case 'Flatten':
        flatten = Number((layer.outputShape as (number | null)[])[1]);
        break;
      case 'Dense':
        dense.push(Number(config.units));
        break;
      default:
        break;
    }
  }
  dense.pop(); // the last dense layer is the 10 answers, not a hidden layer
  return { blocks, flatten, dense, batchNorm, params: model.countParams() };
}

function tagOf(weightName: string): WeightTag | null {
  const last = weightName.split('/').pop() ?? '';
  // Longest names first, so "moving_mean" is not taken for something shorter.
  const tags = [...WEIGHT_TAGS].sort((a, b) => b.length - a.length);
  return tags.find((tag) => last === tag || last.startsWith(`${tag}_`)) ?? null;
}

function readWeights(model: LayersModel): WeightEntry[] {
  const entries: WeightEntry[] = [];
  const denseLayers = model.layers.filter((layer) => layer.getClassName() === 'Dense');
  const outputLayer = denseLayers[denseLayers.length - 1];
  let conv = 0;
  let dense = 0;
  let norm = 0;

  for (const layer of model.layers) {
    let name: string;
    let kind: WeightEntry['kind'];
    switch (layer.getClassName()) {
      case 'Conv2D':
        name = `conv ${++conv}`;
        kind = 'conv';
        break;
      case 'Dense':
        if (layer === outputLayer) {
          name = 'output';
          kind = 'output';
        } else {
          name = ++dense === 1 ? 'dense' : `dense ${dense}`;
          kind = 'dense';
        }
        break;
      case 'BatchNormalization':
        name = `norm ${++norm}`;
        kind = 'norm';
        break;
      default:
        continue;
    }
    const values = layer.getWeights();
    layer.weights.forEach((variable, index) => {
      const tag = tagOf(variable.originalName);
      if (tag) {
        entries.push({
          layer: name,
          kind,
          tag,
          shape: [...values[index].shape],
          values: values[index].dataSync() as Float32Array,
        });
      }
    });
  }
  return entries;
}

/** Wraps a TensorFlow.js layers model. Exported for tests; the app uses loadModel(). */
export function wrapModel(model: LayersModel, tf: Tf): LoadedModel {
  const info = describe(model);
  const pools = model.layers.filter((layer) => layer.getClassName() === 'MaxPooling2D');
  // A second view of the same network that also hands back what leaves every block.
  const probe = tf.layers.model({
    inputs: model.inputs,
    outputs: [...pools.map((layer) => layer.output as SymbolicTensor), model.outputs[0]],
  });
  let analysis: WeightAnalysis | null = null;

  return {
    info,

    infer(pixels, maxMaps = DEFAULT_MAX_MAPS) {
      if (pixels.length !== CELLS) throw new Error(`A drawing must have ${CELLS} values, got ${pixels.length}.`);
      const input = tf.core.tensor(pixels, [1, GRID, GRID, 1]);
      const raw = probe.predict(input) as Tensor | Tensor[];
      const outputs = Array.isArray(raw) ? raw : [raw];
      try {
        const probs = Array.from(outputs[outputs.length - 1].dataSync());

        const maps: FeatureMapSet[] = outputs.slice(0, -1).map((tensor, index) => {
          const [, size, , channels] = tensor.shape as number[];
          const data = tensor.dataSync();
          const shown = Math.min(channels, maxMaps);
          const list: Float32Array[] = [];
          for (let c = 0; c < shown; c++) {
            const map = new Float32Array(size * size);
            for (let i = 0; i < map.length; i++) map[i] = data[i * channels + c];
            list.push(map);
          }
          return { block: index + 1, size, channels, maps: list };
        });

        return { digit: argMax(probs), probs, maps };
      } finally {
        // Free the tensors by hand: the result is plain numbers, which tidy() cannot return.
        input.dispose();
        outputs.forEach((tensor) => tensor.dispose());
      }
    },

    analyze() {
      analysis ??= analyzeWeights(readWeights(model));
      return analysis;
    },

    dispose() {
      // The probe shares its layers with the model, so one dispose frees both.
      model.dispose();
    },
  };
}

interface ModelJson {
  modelTopology?: unknown;
  weightsManifest?: { paths: string[]; weights: { name: string; shape: number[]; dtype: string }[] }[];
}

export interface LoadModelOptions {
  fetchFn?: typeof fetch;
}

/**
 * Loads model.json and the weight files next to it.
 * Throws ModelMissingError when model.json is not there (a 404, or a web
 * page answered in its place), ModelLoadError for anything else.
 */
export async function loadModel(url: string, options: LoadModelOptions = {}): Promise<LoadedModel> {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  let response: Response;
  try {
    response = await fetchFn(url, { cache: 'no-cache' });
  } catch (error) {
    throw new ModelLoadError(`The model could not be downloaded: ${(error as Error).message}`);
  }
  if (response.status === 404 || response.status === 410) throw new ModelMissingError();
  if (!response.ok) throw new ModelLoadError(`The model could not be downloaded (status ${response.status}).`);

  let json: ModelJson;
  try {
    json = JSON.parse(await response.text()) as ModelJson;
  } catch {
    // A development server answers a missing file with the app's own page.
    throw new ModelMissingError();
  }
  const manifest = json.weightsManifest;
  if (!json.modelTopology || !Array.isArray(manifest)) {
    throw new ModelLoadError('model.json is not a TensorFlow.js layers model.');
  }

  const base = new URL(url, globalThis.location?.href ?? 'http://localhost/');
  const buffers: ArrayBuffer[] = [];
  for (const group of manifest) {
    for (const path of group.paths) {
      let part: Response;
      try {
        part = await fetchFn(new URL(path, base).toString(), { cache: 'no-cache' });
      } catch (error) {
        throw new ModelLoadError(`The model weights could not be downloaded: ${(error as Error).message}`);
      }
      if (!part.ok) throw new ModelLoadError(`The model weights could not be downloaded (status ${part.status}).`);
      buffers.push(await part.arrayBuffer());
    }
  }
  const weightData = new Uint8Array(buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0));
  let offset = 0;
  for (const buffer of buffers) {
    weightData.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  const tf = await loadTf();
  try {
    const model = await tf.layers.loadLayersModel(
      tf.core.io.fromMemory({
        modelTopology: json.modelTopology as object,
        weightSpecs: manifest.flatMap((group) => group.weights) as never,
        weightData: weightData.buffer,
      }),
    );
    return wrapModel(model, tf);
  } catch (error) {
    throw new ModelLoadError(`The model files could not be read: ${(error as Error).message}`);
  }
}
