// Load an exported model with TensorFlow.js and compare its answers with
// the ones Keras gave.
//
//   node load_in_tfjs.mjs EXPORT_DIR CASE.json
//
// CASE.json holds {input, shape, expected}. Exits with 1 if they differ.
import fs from 'node:fs';
import path from 'node:path';
import * as tf from '@tensorflow/tfjs';

const [dir, caseFile] = process.argv.slice(2);
const modelJson = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
const manifest = modelJson.weightsManifest[0];
const bin = fs.readFileSync(path.join(dir, manifest.paths[0]));
const weightData = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);

// Same as tf.loadLayersModel('.../model.json'), but from disk instead of a URL.
const model = await tf.loadLayersModel(tf.io.fromMemory({
  modelTopology: modelJson.modelTopology,
  weightSpecs: manifest.weights,
  weightData,
}));

const { input, shape, expected } = JSON.parse(fs.readFileSync(caseFile, 'utf8'));
const got = await model.predict(tf.tensor(input, shape)).data();

let maxDiff = 0;
for (let i = 0; i < expected.length; i++) {
  maxDiff = Math.max(maxDiff, Math.abs(got[i] - expected[i]));
}
console.log(`layers=${model.layers.length} outputs=${got.length} maxDiff=${maxDiff.toExponential(2)}`);
if (got.length !== expected.length || !(maxDiff < 1e-4)) {
  console.error('TensorFlow.js answers differ from Keras.');
  process.exit(1);
}
