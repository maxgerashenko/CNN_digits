import { describe, expect, it, vi } from 'vitest';

import { ApiError, createTrainingApi, toEpochPoint, toRunResults, type EventSourceLike, type JobHandlers } from './trainingApi';
import { DEFAULT_SETTINGS } from '../lib/settings';

const BASE = 'https://space.example.hf.space';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A stand-in for EventSource that the test drives by hand. */
class FakeSource implements EventSourceLike {
  readyState = 1;
  closed = false;
  listeners = new Map<string, ((event: Event) => void)[]>();
  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  /** A server message: event name plus JSON data. */
  send(type: string, data: unknown) {
    for (const l of this.listeners.get(type) ?? []) l(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  /** The browser's own "error" event: no data. */
  breakConnection(readyState: number) {
    this.readyState = readyState;
    for (const l of this.listeners.get('error') ?? []) l(new Event('error'));
  }
}

function setup() {
  const sources: { url: string; source: FakeSource }[] = [];
  const fetchFn = vi.fn();
  const api = createTrainingApi({
    baseUrl: `${BASE}/`,
    fetchFn: fetchFn as unknown as typeof fetch,
    eventSourceFactory: (url) => {
      const source = new FakeSource();
      sources.push({ url, source });
      return source;
    },
  });
  const handlers = {
    onQueued: vi.fn(),
    onStarted: vi.fn(),
    onEpoch: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onConnectionLost: vi.fn(),
  } satisfies JobHandlers;
  return { api, fetchFn, sources, handlers };
}

const epochMessage = {
  epoch: 1,
  epochs: 2,
  loss: 0.3,
  accuracy: 0.9,
  val_loss: 0.15,
  val_accuracy: 0.95,
  seconds: 12.5,
};
const resultsMessage = {
  loss: 0.1,
  accuracy: 0.97,
  val_loss: 0.07,
  val_accuracy: 0.979,
  seconds: 58,
  test_accuracy: 0.979,
  mistakes: 210,
  test_images: 10000,
  epochs: 2,
  training_seconds: 58.4,
};

describe('converters', () => {
  it('turn snake_case into camelCase', () => {
    expect(toEpochPoint(epochMessage)).toEqual({
      epoch: 1,
      epochs: 2,
      loss: 0.3,
      accuracy: 0.9,
      valLoss: 0.15,
      valAccuracy: 0.95,
      seconds: 12.5,
    });
    expect(toRunResults(resultsMessage)).toEqual({
      testAccuracy: 0.979,
      mistakes: 210,
      testImages: 10000,
      loss: 0.1,
      accuracy: 0.97,
      valLoss: 0.07,
      valAccuracy: 0.979,
      epochs: 2,
      trainingSeconds: 58.4,
    });
  });

  it('turn a missing number into NaN, not into 0', () => {
    expect(toEpochPoint({}).loss).toBeNaN();
  });
});

describe('start', () => {
  it('posts the settings as JSON and reads the 202 answer', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockResolvedValue(
      json(
        { job_id: 'abc', status: 'queued', position: 2, settings: DEFAULT_SETTINGS, events_url: '/train/abc/events', status_url: '/train/abc' },
        202,
      ),
    );
    const job = await api.start(DEFAULT_SETTINGS);
    expect(job).toEqual({ jobId: 'abc', status: 'queued', position: 2, settings: DEFAULT_SETTINGS });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/train`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(DEFAULT_SETTINGS);
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('throws ApiError with the 400 detail as the message', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockResolvedValue(json({ detail: 'Epochs must be a whole number from 1 to 5 (got 9). Kernel size must be 3 or 5 (got 4).' }, 400));
    const error = await api.start(DEFAULT_SETTINGS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe('Epochs must be a whole number from 1 to 5 (got 9). Kernel size must be 3 or 5 (got 4).');
  });

  it('gives a plain sentence when the error has no detail or is not JSON', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.start(DEFAULT_SETTINGS)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('502') });
  });

  it('lets a network failure through as it is (not an ApiError)', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.start(DEFAULT_SETTINGS)).rejects.toBeInstanceOf(TypeError);
  });

  it('needs a base address', () => {
    expect(() => createTrainingApi({ baseUrl: '' })).toThrow();
  });
});

describe('status and fileUrl', () => {
  it('reads a job snapshot', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockResolvedValue(
      json({
        job_id: 'abc',
        status: 'done',
        position: 0,
        settings: DEFAULT_SETTINGS,
        epochs: [epochMessage],
        results: resultsMessage,
        files: { 'model.json': '/train/abc/model/model.json', 'weights.bin': '/train/abc/model/weights.bin' },
        error: null,
      }),
    );
    const snapshot = await api.status('abc');
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/train/abc`);
    expect(snapshot.status).toBe('done');
    expect(snapshot.epochs).toHaveLength(1);
    expect(snapshot.epochs[0].valAccuracy).toBe(0.95);
    expect(snapshot.results?.mistakes).toBe(210);
    expect(snapshot.files['model.json']).toBe('/train/abc/model/model.json');
    expect(snapshot.error).toBeNull();
  });

  it('reads a running job without results', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockResolvedValue(json({ job_id: 'abc', status: 'running', position: 0, settings: DEFAULT_SETTINGS, epochs: [], results: null, files: {}, error: null }));
    const snapshot = await api.status('abc');
    expect(snapshot.results).toBeNull();
    expect(snapshot.files).toEqual({});
  });

  it('throws ApiError for a job the server does not know', async () => {
    const { api, fetchFn } = setup();
    fetchFn.mockResolvedValue(json({ detail: 'Unknown training run.' }, 404));
    await expect(api.status('nope')).rejects.toMatchObject({ status: 404, message: 'Unknown training run.' });
  });

  it('builds full addresses', () => {
    const { api } = setup();
    expect(api.fileUrl('/train/abc/model/model.json')).toBe(`${BASE}/train/abc/model/model.json`);
    expect(api.fileUrl('train/abc')).toBe(`${BASE}/train/abc`);
  });
});

describe('subscribe', () => {
  it('opens the events address of the job', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    expect(sources[0].url).toBe(`${BASE}/train/abc/events`);
  });

  it('hands every event to its handler, in camelCase', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    const source = sources[0].source;
    source.send('queued', { position: 2 });
    source.send('started', { epochs: 2 });
    source.send('epoch', epochMessage);
    source.send('done', { results: resultsMessage, files: { 'model.json': '/train/abc/model/model.json' } });

    expect(handlers.onQueued).toHaveBeenCalledWith(2);
    expect(handlers.onStarted).toHaveBeenCalledWith(2);
    expect(handlers.onEpoch).toHaveBeenCalledWith(expect.objectContaining({ epoch: 1, valLoss: 0.15 }));
    expect(handlers.onDone).toHaveBeenCalledWith(expect.objectContaining({ mistakes: 210 }), { 'model.json': '/train/abc/model/model.json' });
    // done closes the stream so the browser does not reconnect
    expect(source.closed).toBe(true);
  });

  it('skips a message that is not JSON', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    for (const l of sources[0].source.listeners.get('epoch') ?? []) l(new MessageEvent('epoch', { data: 'not json' }));
    expect(handlers.onEpoch).not.toHaveBeenCalled();
  });

  it('treats an "error" event with data as the server failing the run', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    sources[0].source.send('error', { message: 'Training failed: out of memory' });
    expect(handlers.onError).toHaveBeenCalledWith('Training failed: out of memory');
    expect(handlers.onConnectionLost).not.toHaveBeenCalled();
    expect(sources[0].source.closed).toBe(true);
  });

  it('keeps a default sentence when the error data has no message', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    sources[0].source.send('error', {});
    expect(handlers.onError).toHaveBeenCalledWith('Training failed.');
  });

  it('does nothing while the browser reconnects by itself', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    sources[0].source.breakConnection(0); // CONNECTING
    expect(handlers.onConnectionLost).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(sources[0].source.closed).toBe(false);
  });

  it('says the connection is lost only when the browser gave up (CLOSED)', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    sources[0].source.breakConnection(2);
    expect(handlers.onConnectionLost).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('gives up after 10 data-less errors in a row while the browser keeps reconnecting', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    const source = sources[0].source;
    for (let i = 0; i < 9; i += 1) source.breakConnection(0);
    expect(handlers.onConnectionLost).not.toHaveBeenCalled();
    source.breakConnection(0);
    expect(source.closed).toBe(true);
    expect(handlers.onConnectionLost).toHaveBeenCalledTimes(1);
  });

  it('resets the error count on open or on any message', () => {
    const { api, sources, handlers } = setup();
    api.subscribe('abc', handlers);
    const source = sources[0].source;
    for (let i = 0; i < 9; i += 1) source.breakConnection(0);
    source.send('epoch', epochMessage);
    for (let i = 0; i < 9; i += 1) source.breakConnection(0);
    for (const l of source.listeners.get('open') ?? []) l(new Event('open'));
    for (let i = 0; i < 9; i += 1) source.breakConnection(0);
    expect(handlers.onConnectionLost).not.toHaveBeenCalled();
    expect(source.closed).toBe(false);
  });

  it('stops calling handlers after the returned function is called', () => {
    const { api, sources, handlers } = setup();
    const stop = api.subscribe('abc', handlers);
    stop();
    expect(sources[0].source.closed).toBe(true);
    sources[0].source.send('epoch', epochMessage);
    sources[0].source.breakConnection(2);
    expect(handlers.onEpoch).not.toHaveBeenCalled();
    expect(handlers.onConnectionLost).not.toHaveBeenCalled();
  });
});
