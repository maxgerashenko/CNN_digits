// The app's side of the training server's web API (server/app.py).
//
//   POST /train                    start a run; the body is the settings as JSON
//   GET  /train/{job_id}/events    live progress (Server-Sent Events)
//   GET  /train/{job_id}           the same information as one JSON answer
//   GET  /train/{job_id}/model/... the trained model files
//
// Waking the server is done by training-server.js, not here.

import type { EpochPoint, RunResults, Settings } from '../types';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

/** The answer to POST /train. */
export interface StartedJob {
  jobId: string;
  status: JobStatus;
  /** Place in line: 0 = training now, 1 = next, 2 = after that. */
  position: number;
  /** The settings the server will really use (defaults filled in). */
  settings: Settings;
}

/** The answer to GET /train/{job_id}. */
export interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  position: number;
  settings: Settings;
  epochs: EpochPoint[];
  results: RunResults | null;
  /** File name to server path: { 'model.json': '/train/<id>/model/model.json', ... }. */
  files: Record<string, string>;
  error: string | null;
}

export interface JobHandlers {
  /** The run is waiting in line. Called again when the place changes. */
  onQueued?(position: number): void;
  /** Training began. */
  onStarted?(totalEpochs: number): void;
  /** One epoch finished. */
  onEpoch?(point: EpochPoint): void;
  /** Training and export finished. `files` maps file names to server paths. */
  onDone?(results: RunResults, files: Record<string, string>): void;
  /** Training failed on the server. */
  onError?(message: string): void;
  /** The connection broke and the browser gave up on it. The run may still be going. */
  onConnectionLost?(): void;
}

export interface TrainingApi {
  start(settings: Settings): Promise<StartedJob>;
  status(jobId: string): Promise<JobSnapshot>;
  /** Listens to a run. Returns a function that stops listening. */
  subscribe(jobId: string, handlers: JobHandlers): () => void;
  /** The full address of a server path such as '/train/<id>/model/model.json'. */
  fileUrl(path: string): string;
}

/** The server answered with an error status. `message` is the server's own text. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The small part of the browser's EventSource that the client uses. */
export interface EventSourceLike {
  readyState: number;
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export interface TrainingApiOptions {
  /** Address of the server, for example https://user-space.hf.space */
  baseUrl: string;
  fetchFn?: typeof fetch;
  eventSourceFactory?: (url: string) => EventSourceLike;
}

const CLOSED = 2; // EventSource.CLOSED

type Raw = Record<string, unknown>;

const number = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN);

/** An epoch message from the server (snake_case) as an EpochPoint. */
export function toEpochPoint(raw: Raw): EpochPoint {
  return {
    epoch: number(raw.epoch),
    epochs: number(raw.epochs),
    loss: number(raw.loss),
    accuracy: number(raw.accuracy),
    valLoss: number(raw.val_loss),
    valAccuracy: number(raw.val_accuracy),
    seconds: number(raw.seconds),
  };
}

/** The `results` object of a finished run as RunResults. */
export function toRunResults(raw: Raw): RunResults {
  return {
    testAccuracy: number(raw.test_accuracy),
    mistakes: number(raw.mistakes),
    testImages: number(raw.test_images),
    loss: number(raw.loss),
    accuracy: number(raw.accuracy),
    valLoss: number(raw.val_loss),
    valAccuracy: number(raw.val_accuracy),
    epochs: number(raw.epochs),
    trainingSeconds: number(raw.training_seconds),
  };
}

function toFiles(raw: unknown): Record<string, string> {
  const files: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [name, path] of Object.entries(raw as Raw)) if (typeof path === 'string') files[name] = path;
  }
  return files;
}

/** Data-less 'error' events in a row after which a reconnecting stream counts as lost. */
const MAX_FAILURES = 10;

export function createTrainingApi(options: TrainingApiOptions): TrainingApi {
  if (!options.baseUrl) throw new Error('createTrainingApi needs baseUrl');
  const base = options.baseUrl.replace(/\/+$/, '');
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const eventSourceFactory = options.eventSourceFactory ?? ((url: string) => new EventSource(url));

  const fileUrl = (path: string) => base + (path.startsWith('/') ? path : `/${path}`);

  async function readJson(response: Response): Promise<Raw> {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const detail = body && typeof body === 'object' ? (body as Raw).detail : null;
      throw new ApiError(
        response.status,
        typeof detail === 'string' ? detail : `The training server answered with status ${response.status}.`,
      );
    }
    if (!body || typeof body !== 'object') {
      throw new ApiError(response.status, 'The training server sent an answer that could not be read.');
    }
    return body as Raw;
  }

  return {
    fileUrl,

    async start(settings) {
      const response = await fetchFn(fileUrl('/train'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const body = await readJson(response);
      return {
        jobId: String(body.job_id),
        status: body.status as JobStatus,
        position: number(body.position),
        settings: body.settings as Settings,
      };
    },

    async status(jobId) {
      const response = await fetchFn(fileUrl(`/train/${encodeURIComponent(jobId)}`), { cache: 'no-store' });
      const body = await readJson(response);
      return {
        jobId: String(body.job_id),
        status: body.status as JobStatus,
        position: number(body.position),
        settings: body.settings as Settings,
        epochs: Array.isArray(body.epochs) ? (body.epochs as Raw[]).map(toEpochPoint) : [],
        results: body.results && typeof body.results === 'object' ? toRunResults(body.results as Raw) : null,
        files: toFiles(body.files),
        error: typeof body.error === 'string' ? body.error : null,
      };
    },

    subscribe(jobId, handlers) {
      const source = eventSourceFactory(fileUrl(`/train/${encodeURIComponent(jobId)}/events`));
      let open = true;
      let failures = 0; // 'error' events with no data in a row, while the browser keeps reconnecting
      const close = () => {
        if (!open) return;
        open = false;
        source.close();
      };

      // Calls `use` with the message's JSON. A message that cannot be read is skipped.
      const on = (type: string, use: (data: Raw) => void) => {
        source.addEventListener(type, (event) => {
          if (!open) return;
          failures = 0;
          const text = (event as MessageEvent).data;
          if (typeof text !== 'string') return;
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            return;
          }
          if (data && typeof data === 'object') use(data as Raw);
        });
      };

      on('queued', (data) => handlers.onQueued?.(number(data.position)));
      on('started', (data) => handlers.onStarted?.(number(data.epochs)));
      on('epoch', (data) => handlers.onEpoch?.(toEpochPoint(data)));
      on('done', (data) => {
        close(); // the server ends the stream here; do not let the browser reconnect
        handlers.onDone?.(toRunResults((data.results ?? {}) as Raw), toFiles(data.files));
      });

      // 'error' is two things: a message from the server (it has data), or a
      // broken connection (it has none).
      source.addEventListener('error', (event) => {
        if (!open) return;
        const text = (event as MessageEvent).data;
        if (typeof text === 'string') {
          close();
          let message = 'Training failed.';
          try {
            const data = JSON.parse(text) as Raw;
            if (typeof data.message === 'string') message = data.message;
          } catch {
            // keep the default message
          }
          handlers.onError?.(message);
        } else {
          failures += 1;
          if (source.readyState === CLOSED || failures >= MAX_FAILURES) {
            close();
            handlers.onConnectionLost?.();
          }
          // Otherwise the browser is reconnecting by itself and asks only for what it missed.
        }
      });
      source.addEventListener('open', () => {
        failures = 0;
      });

      return close;
    },
  };
}
