// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

import { loadTf, type Tf } from './tf';
import { ModelLoadError, ModelMissingError, loadModel, wrapModel, type LoadedModel } from './modelLoader';
import type { LayersModel } from '@tensorflow/tfjs-layers';

let tf: Tf;
const L = () => tf.layers.layers;

/** A small network built like server/model.py builds it: Conv, BatchNorm, ReLU, MaxPool, Flatten, Dense, Dropout, Dense. */
function buildSmall(blocks: number, batchNorm = true): LayersModel {
  const model = tf.layers.sequential();
  let first = true;
  for (let b = 0; b < blocks; b++) {
    const filters = 4 * 2 ** b;
    model.add(
      L().conv2d({
        filters,
        kernelSize: 3,
        padding: 'same',
        useBias: !batchNorm,
        ...(first ? { inputShape: [28, 28, 1] } : {}),
      }),
    );
    first = false;
    if (batchNorm) model.add(L().batchNormalization());
    model.add(L().activation({ activation: 'relu' }));
    model.add(L().maxPooling2d({ poolSize: 2, strides: 2 }));
  }
  model.add(L().flatten());
  model.add(L().dense({ units: 16, useBias: !batchNorm }));
  if (batchNorm) model.add(L().batchNormalization());
  model.add(L().activation({ activation: 'relu' }));
  model.add(L().dropout({ rate: 0.1 }));
  model.add(L().dense({ units: 10, activation: 'softmax' }));
  return model;
}

interface Files {
  modelJson: string;
  weights: ArrayBuffer;
}

/** Writes the model the way server/export.py does: model.json + weights.bin. */
async function exportFiles(model: LayersModel): Promise<Files> {
  let files: Files | null = null;
  await model.save(
    tf.core.io.withSaveHandler(async (artifacts) => {
      files = {
        modelJson: JSON.stringify({
          modelTopology: artifacts.modelTopology,
          format: 'layers-model',
          weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }],
        }),
        weights: artifacts.weightData as ArrayBuffer,
      };
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }),
  );
  return files!;
}

function serve(files: Files): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('model.json')) return new Response(files.modelJson, { status: 200 });
    if (url.endsWith('weights.bin')) return new Response(files.weights, { status: 200 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

const URL_OF_MODEL = 'http://localhost/model/model.json';
const blankDigit = () => new Float32Array(784);
const stripe = () => Float32Array.from({ length: 784 }, (_, i) => (i % 28 > 12 && i % 28 < 16 ? 1 : 0));

beforeAll(async () => {
  tf = await loadTf();
});

describe('loadModel', () => {
  it('loads a good model and describes it', async () => {
    const files = await exportFiles(buildSmall(2));
    const model = await loadModel(URL_OF_MODEL, { fetchFn: serve(files) });
    expect(model.info.blocks).toEqual([
      { index: 1, filters: 4, convLayers: 1, kernel: 3, inSize: 28, outSize: 14 },
      { index: 2, filters: 8, convLayers: 1, kernel: 3, inSize: 14, outSize: 7 },
    ]);
    expect(model.info.flatten).toBe(7 * 7 * 8);
    expect(model.info.dense).toEqual([16]);
    expect(model.info.batchNorm).toBe(true);
    expect(model.info.params).toBeGreaterThan(0);
    model.dispose();
  });

  it('says ModelMissingError for a 404', async () => {
    const fetchFn = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn })).rejects.toBeInstanceOf(ModelMissingError);
  });

  it('says ModelMissingError when a web page answers in place of model.json', async () => {
    const fetchFn = (async () => new Response('<!doctype html><html></html>', { status: 200 })) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn })).rejects.toBeInstanceOf(ModelMissingError);
  });

  it('says ModelLoadError for a broken file, a server error and a network failure', async () => {
    const notAModel = (async () => new Response('{"hello": 1}', { status: 200 })) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn: notAModel })).rejects.toBeInstanceOf(ModelLoadError);

    const broken = (async () =>
      new Response(JSON.stringify({ modelTopology: { nonsense: true }, weightsManifest: [{ paths: ['w.bin'], weights: [] }] }))) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn: broken })).rejects.toBeInstanceOf(ModelLoadError);

    const serverError = (async () => new Response('x', { status: 500 })) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn: serverError })).rejects.toBeInstanceOf(ModelLoadError);

    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn: offline })).rejects.toBeInstanceOf(ModelLoadError);
  });

  it('says ModelLoadError when weights.bin is missing or too short', async () => {
    const files = await exportFiles(buildSmall(1));
    const noWeights = (async (input: RequestInfo | URL) =>
      String(input).endsWith('model.json') ? new Response(files.modelJson) : new Response('x', { status: 404 })) as typeof fetch;
    await expect(loadModel(URL_OF_MODEL, { fetchFn: noWeights })).rejects.toBeInstanceOf(ModelLoadError);

    const short = serve({ ...files, weights: files.weights.slice(0, 40) });
    await expect(loadModel(URL_OF_MODEL, { fetchFn: short })).rejects.toBeInstanceOf(ModelLoadError);
  });
});

describe('infer', () => {
  it.each([1, 2, 3])('gives 10 probabilities that add up to 1 and one map set per block (%i blocks)', async (blocks) => {
    const files = await exportFiles(buildSmall(blocks));
    const model = await loadModel(URL_OF_MODEL, { fetchFn: serve(files) });
    const result = model.infer(stripe());
    expect(result.probs).toHaveLength(10);
    expect(result.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(result.digit).toBe(result.probs.indexOf(Math.max(...result.probs)));
    expect(result.maps).toHaveLength(blocks);
    const sizes = [14, 7, 3];
    result.maps.forEach((set, i) => {
      expect(set.block).toBe(i + 1);
      expect(set.size).toBe(sizes[i]);
      expect(set.channels).toBe(4 * 2 ** i);
      expect(set.maps).toHaveLength(Math.min(set.channels, 8));
      for (const map of set.maps) expect(map).toHaveLength(set.size * set.size);
    });
    model.dispose();
  });

  it('limits the maps to maxMaps and handles a blank drawing', async () => {
    const files = await exportFiles(buildSmall(2));
    const model = await loadModel(URL_OF_MODEL, { fetchFn: serve(files) });
    const result = model.infer(blankDigit(), 3);
    expect(result.maps[0].maps).toHaveLength(3);
    expect(result.maps[1].channels).toBe(8);
    expect(result.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    model.dispose();
  });

  it('refuses a drawing of the wrong size', async () => {
    const model = wrapModel(buildSmall(1), tf);
    expect(() => model.infer(new Float32Array(10))).toThrow(/784/);
    model.dispose();
  });

  it('does not leak tensors', async () => {
    const model = wrapModel(buildSmall(2), tf);
    model.infer(stripe());
    const before = tf.core.memory().numTensors;
    for (let i = 0; i < 5; i++) model.infer(stripe());
    expect(tf.core.memory().numTensors).toBe(before);
    model.dispose();
  });

  it('gives the same answer as the model itself', async () => {
    const raw = buildSmall(2);
    const model = wrapModel(raw, tf);
    const direct = Array.from((raw.predict(tf.core.tensor(stripe(), [1, 28, 28, 1])) as import('@tensorflow/tfjs-core').Tensor).dataSync());
    const result = model.infer(stripe());
    result.probs.forEach((p, i) => expect(p).toBeCloseTo(direct[i], 6));
    model.dispose();
  });
});

describe('analyze', () => {
  let model: LoadedModel;
  beforeAll(async () => {
    const files = await exportFiles(buildSmall(2));
    model = await loadModel(URL_OF_MODEL, { fetchFn: serve(files) });
  });

  it('makes one histogram per conv and dense kernel and finds batch norm weights', () => {
    const analysis = model.analyze();
    expect(analysis.layers.map((l) => l.name)).toEqual(['conv 1', 'conv 2', 'dense', 'output']);
    const tags = analysis.tags.map((t) => t.tag);
    expect(tags).toEqual(expect.arrayContaining(['kernel', 'gamma', 'beta', 'moving_mean', 'moving_variance', 'bias']));
    expect(analysis.layers[0].histogram.count).toBe(3 * 3 * 1 * 4);
    expect(analysis.deadFilterShare).toBe(0);
  });

  it('is the same object on the second call', () => {
    expect(model.analyze()).toBe(model.analyze());
  });

  it('leaves out batch norm tags for a model without batch norm', async () => {
    const files = await exportFiles(buildSmall(1, false));
    const plain = await loadModel(URL_OF_MODEL, { fetchFn: serve(files) });
    const tags = plain.analyze().tags.map((t) => t.tag);
    expect(tags).toEqual(['kernel', 'bias']);
    expect(plain.info.batchNorm).toBe(false);
  });
});
