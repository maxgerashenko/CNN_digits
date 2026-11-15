// TensorFlow.js, loaded only when a model is needed, so the first screen
// does not wait for it. Only the parts the app uses are imported: the core,
// the Keras-style layers and the plain JavaScript (CPU) backend. The network
// is small (about 1.5 million multiply-adds per drawing), so the CPU backend
// answers in a few milliseconds and behaves the same in every browser.

export interface Tf {
  core: typeof import('@tensorflow/tfjs-core');
  layers: typeof import('@tensorflow/tfjs-layers');
}

let loading: Promise<Tf> | null = null;

export function loadTf(): Promise<Tf> {
  loading ??= (async () => {
    const [core, layers] = await Promise.all([
      import('@tensorflow/tfjs-core'),
      import('@tensorflow/tfjs-layers'),
      import('@tensorflow/tfjs-backend-cpu'),
    ]);
    await core.setBackend('cpu');
    await core.ready();
    return { core, layers };
  })();
  return loading;
}
