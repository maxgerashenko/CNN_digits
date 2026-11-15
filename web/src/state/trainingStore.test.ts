import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobHandlers, JobSnapshot, TrainingApi } from '../api/trainingApi';
import { ApiError } from '../api/trainingApi';
import { STATUS_TEXT, type TrainingServer } from '../api/training-server.js';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { LoadedModel } from '../model/modelLoader';
import { makeEpochs, makeFakeModel, settingsWith } from '../test/fixtures';
import { useModelStore } from './modelStore';
import {
  CONNECTION_LOST_TEXT,
  NOT_CONFIGURED_TEXT,
  configureTraining,
  isBusy,
  selectLatestRun,
  selectPreviousRun,
  useTrainingStore,
} from './trainingStore';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const get = () => useTrainingStore.getState();

const EPOCHS = makeEpochs([
  { accuracy: 0.9, loss: 0.33, valAccuracy: 0.96, valLoss: 0.14, seconds: 29 },
  { accuracy: 0.965, loss: 0.11, valAccuracy: 0.979, valLoss: 0.07, seconds: 58 },
]);
const RESULTS = {
  testAccuracy: 0.979,
  mistakes: 210,
  testImages: 10000,
  loss: 0.11,
  accuracy: 0.965,
  valLoss: 0.07,
  valAccuracy: 0.979,
  epochs: 2,
  trainingSeconds: 58,
};
const FILES = { 'model.json': '/train/job-1/model/model.json', 'weights.bin': '/train/job-1/model/weights.bin' };

/** A server whose wake-up the test finishes by hand. */
function fakeServer() {
  let ready!: () => void;
  let fail!: (error: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  const server = {
    status: 'idle',
    statusText: STATUS_TEXT.idle,
    url: (path = '') => `https://space.test${path}`,
    wake: vi.fn(() => gate),
    whenReady: vi.fn(() => gate),
    markAsleep: vi.fn(),
  } as unknown as TrainingServer;
  return { server, ready, fail };
}

function fakeApi() {
  const subscriptions: { jobId: string; handlers: JobHandlers; stop: ReturnType<typeof vi.fn> }[] = [];
  const api = {
    start: vi.fn(async (settings) => ({ jobId: 'job-1', status: 'queued' as const, position: 2, settings })),
    status: vi.fn(),
    subscribe: vi.fn((jobId: string, handlers: JobHandlers) => {
      const stop = vi.fn();
      subscriptions.push({ jobId, handlers, stop });
      return stop;
    }),
    fileUrl: (path: string) => `https://space.test${path}`,
  };
  return { api: api as unknown as TrainingApi & typeof api, subscriptions, last: () => subscriptions[subscriptions.length - 1].handlers };
}

function setup(options: { load?: (url: string) => Promise<LoadedModel>; now?: () => number } = {}) {
  const s = fakeServer();
  const a = fakeApi();
  const model = makeFakeModel();
  const load = vi.fn(options.load ?? (async () => model));
  configureTraining({ server: s.server, api: a.api, loadModel: load, now: options.now ?? (() => 1_000) });
  return { ...s, ...a, model, load };
}

beforeEach(() => {
  useModelStore.setState({
    saved: { status: 'idle', model: null, error: null },
    retrained: { status: 'idle', model: null, error: null },
    retrainedRunId: null,
    active: 'saved',
  });
  configureTraining({});
});

describe('with no server address', () => {
  it('starts as "unconfigured" and never calls the network', async () => {
    expect(get().server).toEqual({ status: 'unconfigured', text: NOT_CONFIGURED_TEXT });
    get().wake();
    await get().start(DEFAULT_SETTINGS);
    expect(get().phase).toBe('error');
    expect(get().error).toBe(NOT_CONFIGURED_TEXT);
    expect(get().runs).toEqual([]);
  });
});

describe('a whole run', () => {
  it('goes waking, queued, running, finishing, done and stores the run and the model', async () => {
    const t = setup({ now: () => 5_000 });
    const phases: string[] = [];
    useTrainingStore.subscribe((s) => {
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    });

    const started = get().start(DEFAULT_SETTINGS);
    expect(get().phase).toBe('waking');
    expect(get().jobSettings).toEqual(DEFAULT_SETTINGS);
    expect(isBusy(get().phase)).toBe(true);

    t.ready();
    await started;
    expect(get().phase).toBe('queued');
    expect(get().position).toBe(2);
    expect(get().jobId).toBe('job-1');
    expect(t.api.start).toHaveBeenCalledWith(DEFAULT_SETTINGS);
    expect(t.api.subscribe).toHaveBeenCalledWith('job-1', expect.any(Object));

    t.last().onQueued?.(1);
    expect(get().position).toBe(1);

    t.last().onStarted?.(2);
    expect(get().phase).toBe('running');
    expect(get().position).toBe(0);
    expect(get().startedAt).toBe(5_000);

    t.last().onEpoch?.(EPOCHS[0]);
    expect(get().epochs).toEqual([EPOCHS[0]]);
    t.last().onEpoch?.(EPOCHS[1]);
    expect(get().epochs).toHaveLength(2);

    t.last().onDone?.(RESULTS, FILES);
    expect(get().phase).toBe('finishing');
    await flush();

    expect(t.load).toHaveBeenCalledWith('https://space.test/train/job-1/model/model.json');
    expect(get().phase).toBe('done');
    expect(get().error).toBeNull();
    expect(get().runs).toHaveLength(1);
    const run = selectLatestRun(get())!;
    expect(run).toMatchObject({ id: 'job-1', number: 1, settings: DEFAULT_SETTINGS, results: RESULTS, params: t.model.info.params });
    expect(run.epochs).toEqual(EPOCHS);
    expect(run.analysis).not.toBeNull();
    expect(selectPreviousRun(get())).toBeNull();

    // The new model is kept, but only becomes the reading model when the visitor asks.
    expect(useModelStore.getState().retrained.model).toBe(t.model);
    expect(useModelStore.getState().retrainedRunId).toBe('job-1');
    expect(useModelStore.getState().active).toBe('saved');
    expect(phases).toEqual(['waking', 'queued', 'running', 'finishing', 'done']);
  });

  it('shows the place in line when the server says so, then starts', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onQueued?.(3);
    expect(get()).toMatchObject({ phase: 'queued', position: 3 });
    t.last().onQueued?.(1);
    expect(get().position).toBe(1);
  });

  it('numbers the second run 2 and frees the first retrained model', async () => {
    const t = setup();
    const first = get().start(DEFAULT_SETTINGS);
    t.ready();
    await first;
    t.last().onDone?.(RESULTS, FILES);
    await flush();
    expect(get().phase).toBe('done');

    const second = makeFakeModel({ digit: 3 });
    configureTraining({ server: t.server, api: t.api, loadModel: async () => second });
    // configureTraining resets the store; carry the first run over to test the numbering.
    useTrainingStore.setState({ runs: [{ ...selectLatestRun(get())!, number: 1 }] });
    useModelStore.getState().setRetrained(t.model, 'job-1');
    get().reset();
    const again = get().start(settingsWith({ epochs: 4 }));
    await again;
    t.last().onDone?.({ ...RESULTS, epochs: 4 }, FILES);
    await flush();
    expect(get().runs.map((r) => r.number)).toEqual([1, 2]);
    expect(selectPreviousRun(get())!.number).toBe(1);
    expect(t.model.disposed).toBe(true);
    expect(useModelStore.getState().retrained.model).toBe(second);
  });

  it('does not add an epoch twice when the stream replays it', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onEpoch?.(EPOCHS[0]);
    t.last().onEpoch?.(EPOCHS[0]);
    t.last().onEpoch?.(EPOCHS[1]);
    expect(get().epochs.map((e) => e.epoch)).toEqual([1, 2]);
  });

  it('ignores a second start while a run is in progress', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    await get().start(settingsWith({ epochs: 5 }));
    t.ready();
    await started;
    expect(t.api.start).toHaveBeenCalledTimes(1);
    expect(get().jobSettings).toEqual(DEFAULT_SETTINGS);
  });

  it('uses the settings the server answered with', async () => {
    const t = setup();
    t.api.start.mockResolvedValueOnce({ jobId: 'job-1', status: 'queued', position: 0, settings: settingsWith({ epochs: 3 }) });
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    expect(get().jobSettings).toEqual(settingsWith({ epochs: 3 }));
  });
});

describe('stop', () => {
  it('stops listening, goes to "stopped" and throws the result away', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onStarted?.(2);
    const sub = t.subscriptions[0];
    get().stop();
    expect(get().phase).toBe('stopped');
    expect(sub.stop).toHaveBeenCalled();

    // Late messages of the old run change nothing.
    sub.handlers.onEpoch?.(EPOCHS[0]);
    sub.handlers.onDone?.(RESULTS, FILES);
    await flush();
    expect(get().phase).toBe('stopped');
    expect(get().epochs).toEqual([]);
    expect(get().runs).toEqual([]);
    expect(t.load).not.toHaveBeenCalled();
  });

  it('works while the server is still waking: the run never starts', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    get().stop();
    expect(get().phase).toBe('stopped');
    t.ready();
    await started;
    expect(t.api.start).not.toHaveBeenCalled();
    expect(get().phase).toBe('stopped');
  });

  it('throws away a model that finished downloading after stop', async () => {
    let finishLoad!: () => void;
    const t = setup({ load: () => new Promise<LoadedModel>((resolve) => (finishLoad = () => resolve(makeFakeModel()))) });
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onDone?.(RESULTS, FILES);
    expect(get().phase).toBe('finishing');
    get().stop();
    finishLoad();
    await flush();
    expect(get().phase).toBe('stopped');
    expect(get().runs).toEqual([]);
    expect(useModelStore.getState().retrained.status).toBe('idle');
  });

  it('does nothing when no run is in progress', () => {
    setup();
    get().stop();
    expect(get().phase).toBe('idle');
  });

  it('reset goes back to idle, keeps the runs, and is ignored while busy', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    get().reset();
    expect(get().phase).toBe('queued');
    t.last().onDone?.(RESULTS, FILES);
    await flush();
    get().reset();
    expect(get().phase).toBe('idle');
    expect(get().runs).toHaveLength(1);
    expect(get().error).toBeNull();
  });
});

describe('errors', () => {
  it('shows the failure message the server sends', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onStarted?.(2);
    t.last().onError?.('Training failed: out of memory');
    expect(get()).toMatchObject({ phase: 'error', error: 'Training failed: out of memory' });
    expect(get().runs).toEqual([]);
  });

  it('shows the server sentence for a refused start and does not mark the server asleep', async () => {
    const t = setup();
    t.api.start.mockRejectedValueOnce(new ApiError(400, 'Epochs must be a whole number from 1 to 5 (got 9).'));
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    expect(get()).toMatchObject({ phase: 'error', error: 'Epochs must be a whole number from 1 to 5 (got 9).' });
    expect(t.server.markAsleep).not.toHaveBeenCalled();
  });

  it('marks the server asleep when the start gets no answer at all', async () => {
    const t = setup();
    t.api.start.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    expect(get()).toMatchObject({ phase: 'error', error: STATUS_TEXT.unreachable });
    expect(t.server.markAsleep).toHaveBeenCalled();
  });

  it('shows the reason when the server never wakes up', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.fail(new Error('The training server could not be reached.'));
    await started;
    expect(get()).toMatchObject({ phase: 'error', error: 'The training server could not be reached.' });
    expect(t.api.start).not.toHaveBeenCalled();
  });

  it('keeps the run but reports an error when the new model cannot be loaded', async () => {
    const t = setup({
      load: async () => {
        throw new Error('The model files could not be read: bad file');
      },
    });
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onDone?.(RESULTS, FILES);
    await flush();
    expect(get().phase).toBe('error');
    expect(get().error).toContain('could not be loaded');
    expect(get().runs).toHaveLength(1);
    expect(get().runs[0].analysis).toBeNull();
    expect(useModelStore.getState().retrained.status).toBe('idle');
  });

  it('reports an error when the server sent no model files', async () => {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onDone?.(RESULTS, {});
    await flush();
    expect(get().phase).toBe('error');
    expect(get().error).toBe('Training finished, but the server sent no model.');
    expect(t.load).not.toHaveBeenCalled();
  });
});

describe('a lost connection', () => {
  async function running() {
    const t = setup();
    const started = get().start(DEFAULT_SETTINGS);
    t.ready();
    await started;
    t.last().onStarted?.(2);
    return t;
  }
  const snapshot = (changes: Partial<JobSnapshot>): JobSnapshot => ({
    jobId: 'job-1',
    status: 'running',
    position: 0,
    settings: DEFAULT_SETTINGS,
    epochs: [],
    results: null,
    files: {},
    error: null,
    ...changes,
  });

  it('asks the server once and finishes when the run is done', async () => {
    const t = await running();
    t.api.status.mockResolvedValueOnce(snapshot({ status: 'done', epochs: EPOCHS, results: RESULTS, files: FILES }));
    t.last().onConnectionLost?.();
    await flush();
    expect(t.api.status).toHaveBeenCalledWith('job-1');
    expect(get().phase).toBe('done');
    expect(get().runs[0].epochs).toEqual(EPOCHS);
  });

  it('fails with the server message when the run failed', async () => {
    const t = await running();
    t.api.status.mockResolvedValueOnce(snapshot({ status: 'error', error: 'Training failed: boom' }));
    t.last().onConnectionLost?.();
    await flush();
    expect(get()).toMatchObject({ phase: 'error', error: 'Training failed: boom' });
  });

  it('listens again while the run goes on, at most 3 times, then fails', async () => {
    const t = await running();
    t.api.status.mockResolvedValue(snapshot({ status: 'running' }));
    for (let i = 1; i <= 3; i++) {
      t.last().onConnectionLost?.();
      await flush();
      expect(t.subscriptions).toHaveLength(1 + i);
      expect(get().phase).toBe('running');
    }
    t.last().onConnectionLost?.();
    await flush();
    expect(t.subscriptions).toHaveLength(4);
    expect(get()).toMatchObject({ phase: 'error', error: CONNECTION_LOST_TEXT });
  });

  it('fails and marks the server asleep when it cannot be asked either', async () => {
    const t = await running();
    t.api.status.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    t.last().onConnectionLost?.();
    await flush();
    expect(get()).toMatchObject({ phase: 'error', error: CONNECTION_LOST_TEXT });
    expect(t.server.markAsleep).toHaveBeenCalled();
  });

  it('shows the server sentence when the run is unknown (404)', async () => {
    const t = await running();
    t.api.status.mockRejectedValueOnce(new ApiError(404, 'Unknown training run.'));
    t.last().onConnectionLost?.();
    await flush();
    expect(get()).toMatchObject({ phase: 'error', error: 'Unknown training run.' });
    expect(t.server.markAsleep).not.toHaveBeenCalled();
  });

  it('ignores the answer when the visitor stopped meanwhile', async () => {
    const t = await running();
    t.api.status.mockResolvedValueOnce(snapshot({ status: 'done', epochs: EPOCHS, results: RESULTS, files: FILES }));
    t.last().onConnectionLost?.();
    get().stop();
    await flush();
    expect(get().phase).toBe('stopped');
    expect(get().runs).toEqual([]);
  });
});

describe('wake', () => {
  it('starts waking the server in the background and swallows its failure', async () => {
    const t = setup();
    get().wake();
    expect(t.server.wake).toHaveBeenCalled();
    t.fail(new Error('down'));
    await flush();
    expect(get().phase).toBe('idle');
  });
});
