import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeFakeModel } from '../test/fixtures';
import { useDrawingStore } from './drawingStore';
import { runInferenceNow, startInference, useInferenceStore } from './inferenceStore';
import { useModelStore } from './modelStore';

const get = () => useInferenceStore.getState();
const READY = (model: ReturnType<typeof makeFakeModel>) => ({ status: 'ready' as const, model, error: null });

beforeEach(() => {
  useDrawingStore.getState().clear();
  useModelStore.setState({
    saved: { status: 'idle', model: null, error: null },
    retrained: { status: 'idle', model: null, error: null },
    retrainedRunId: null,
    active: 'saved',
  });
  useInferenceStore.setState({ status: 'no-model', result: null });
});

describe('runInferenceNow', () => {
  it('says "no-model" when the active model is not ready', () => {
    useDrawingStore.getState().stroke({ x: 10, y: 10 }, { x: 10, y: 10 });
    runInferenceNow();
    expect(get()).toEqual({ status: 'no-model', result: null });
  });

  it('says "empty" when nothing is drawn', () => {
    useModelStore.setState({ saved: READY(makeFakeModel()) });
    runInferenceNow();
    expect(get()).toEqual({ status: 'empty', result: null });
  });

  it('reads the drawing when there is a model and a drawing', () => {
    useModelStore.setState({ saved: READY(makeFakeModel({ digit: 4 })) });
    useDrawingStore.getState().stroke({ x: 10, y: 10 }, { x: 18, y: 18 });
    runInferenceNow();
    expect(get().status).toBe('ready');
    expect(get().result).not.toBeNull();
  });

  it('uses the retrained model when it is active', () => {
    useModelStore.setState({ saved: READY(makeFakeModel({ digit: 1 })), retrained: READY(makeFakeModel({ digit: 8 })) });
    useDrawingStore.getState().stroke({ x: 10, y: 10 }, { x: 18, y: 18 });
    runInferenceNow();
    const saved = get().result;
    useModelStore.getState().setActive('retrained');
    runInferenceNow();
    expect(get().result).not.toEqual(saved);
  });
});

describe('startInference', () => {
  let stop: (() => void) | undefined;
  afterEach(() => stop?.());
  const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('reads at start, again after a change, and stops on request', async () => {
    useModelStore.setState({ saved: READY(makeFakeModel()) });
    stop = startInference();
    expect(get().status).toBe('empty');
    useDrawingStore.getState().stroke({ x: 10, y: 10 }, { x: 12, y: 12 });
    useDrawingStore.getState().stroke({ x: 12, y: 12 }, { x: 14, y: 14 });
    await tick();
    expect(get().status).toBe('ready');
    stop();
    useDrawingStore.getState().clear();
    await tick();
    expect(get().status).toBe('ready');
  });
});
