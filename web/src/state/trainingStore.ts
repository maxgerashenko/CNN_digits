// One training run from the Start button to the new model, and the list of
// finished runs. The screens only read this store and call wake(), start(),
// stop() and reset(); all talking to the server happens here.

import { create } from 'zustand';

import { ApiError, createTrainingApi, type JobSnapshot, type TrainingApi } from '../api/trainingApi';
import { STATUS_TEXT, createTrainingServer, type ServerStatus, type TrainingServer } from '../api/training-server.js';
import { TRAINING_SERVER_URL } from '../config';
import { countParams } from '../lib/architecture';
import { loadModel, type LoadedModel } from '../model/modelLoader';
import type { EpochPoint, RunRecord, RunResults, Settings, WeightAnalysis } from '../types';
import { useModelStore } from './modelStore';

export type TrainingPhase =
  /** Nothing is going on. */
  | 'idle'
  /** Waiting for the sleeping server to start (about a minute). */
  | 'waking'
  /** Another visitor is training; `position` is the place in line. */
  | 'queued'
  /** Training; `epochs` grows by one after each epoch. */
  | 'running'
  /** Training is over; the new model is being downloaded. */
  | 'finishing'
  /** The new model is ready and the run is in `runs`. */
  | 'done'
  /** Something failed; `error` says what. */
  | 'error'
  /** The visitor pressed Stop. */
  | 'stopped';

export interface ServerState {
  /** 'unconfigured' = no server address is set, so training is switched off. */
  status: 'unconfigured' | ServerStatus;
  /** A sentence for the visitor, or '' when there is nothing to say. */
  text: string;
}

export interface TrainingState {
  server: ServerState;
  phase: TrainingPhase;
  /** Place in line while queued (1 = next). 0 otherwise. */
  position: number;
  jobId: string | null;
  /** The settings of the run in progress (or of the last one). */
  jobSettings: Settings | null;
  /** Finished epochs of the run in progress (or of the last one). */
  epochs: EpochPoint[];
  /** When the server began training, in milliseconds (Date.now). Null before that. */
  startedAt: number | null;
  error: string | null;
  /** Finished runs of this tab, oldest first. */
  runs: RunRecord[];

  /** Starts waking the server in the background. Call when the app opens. */
  wake(): void;
  /** Starts a run with these settings. Does nothing while a run is in progress. */
  start(settings: Settings): Promise<void>;
  /**
   * Stops following the run. The server has no way to cancel a run, so it
   * finishes there on its own; its result is thrown away.
   */
  stop(): void;
  /** Back to 'idle' after done, error or stopped. Keeps `runs`. */
  reset(): void;
}

export const NOT_CONFIGURED_TEXT = 'Training is not set up yet: the address of the training server is missing.';
export const CONNECTION_LOST_TEXT = 'The connection to the training server was lost. Please try again.';

export function isBusy(phase: TrainingPhase): boolean {
  return phase === 'waking' || phase === 'queued' || phase === 'running' || phase === 'finishing';
}

/** The latest finished run, or null. */
export function selectLatestRun(state: TrainingState): RunRecord | null {
  return state.runs.length > 0 ? state.runs[state.runs.length - 1] : null;
}

/** The run before the latest, or null. */
export function selectPreviousRun(state: TrainingState): RunRecord | null {
  return state.runs.length > 1 ? state.runs[state.runs.length - 2] : null;
}

// ---------------------------------------------------------------------------
// The outside world, replaceable in tests
// ---------------------------------------------------------------------------

export interface TrainingDeps {
  /** Null when no server address is set. */
  server: TrainingServer | null;
  api: TrainingApi | null;
  loadModel(url: string): Promise<LoadedModel>;
  now(): number;
}

let deps: TrainingDeps | null = null;

function defaultDeps(): TrainingDeps {
  const base: Pick<TrainingDeps, 'loadModel' | 'now'> = { loadModel: (url) => loadModel(url), now: () => Date.now() };
  if (!TRAINING_SERVER_URL) return { ...base, server: null, api: null };
  return {
    ...base,
    server: createTrainingServer({
      baseUrl: TRAINING_SERVER_URL,
      onStatus: (status, text) => useTrainingStore.setState({ server: { status, text } }),
    }),
    api: createTrainingApi({ baseUrl: TRAINING_SERVER_URL }),
  };
}

function getDeps(): TrainingDeps {
  deps ??= defaultDeps();
  return deps;
}

/**
 * For tests: replaces the server, the API, the model loader or the clock,
 * and puts the store back to its first state.
 */
export function configureTraining(overrides: Partial<TrainingDeps>): void {
  generation++;
  stopListening?.();
  stopListening = null;
  deps = { server: null, api: null, loadModel: (url) => loadModel(url), now: () => Date.now(), ...overrides };
  useTrainingStore.setState({
    ...INITIAL,
    server: deps.server ? { status: deps.server.status, text: deps.server.statusText } : UNCONFIGURED,
  });
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const UNCONFIGURED: ServerState = { status: 'unconfigured', text: NOT_CONFIGURED_TEXT };

const INITIAL = {
  server: TRAINING_SERVER_URL ? ({ status: 'idle', text: STATUS_TEXT.idle } as ServerState) : UNCONFIGURED,
  phase: 'idle' as TrainingPhase,
  position: 0,
  jobId: null as string | null,
  jobSettings: null as Settings | null,
  epochs: [] as EpochPoint[],
  startedAt: null as number | null,
  error: null as string | null,
  runs: [] as RunRecord[],
};

/** How often a broken progress stream is opened again before giving up. */
const MAX_RECONNECTS = 3;

// Every start() and stop() gets a new number, so answers that arrive for an
// older run are ignored.
let generation = 0;
let stopListening: (() => void) | null = null;

export const useTrainingStore = create<TrainingState>((set, get) => {
  const fail = (message: string) => {
    stopListening?.();
    stopListening = null;
    set({ phase: 'error', error: message, position: 0 });
  };

  /** Puts an epoch in its place, so a replayed stream does not add it twice. */
  const addEpoch = (point: EpochPoint) =>
    set((state) => ({
      phase: 'running',
      position: 0,
      epochs: [...state.epochs.filter((e) => e.epoch !== point.epoch), point].sort((a, b) => a.epoch - b.epoch),
    }));

  async function finish(token: number, jobId: string, results: RunResults, files: Record<string, string>) {
    const { api, loadModel: load } = getDeps();
    set({ phase: 'finishing', position: 0 });
    const state = get();
    const settings = state.jobSettings!;

    let model: LoadedModel | null = null;
    let problem: string | null = null;
    const path = files['model.json'];
    if (!path || !api) {
      problem = 'Training finished, but the server sent no model.';
    } else {
      try {
        model = await load(api.fileUrl(path));
      } catch (error) {
        problem = `Training finished, but the new model could not be loaded. ${(error as Error).message}`;
      }
    }
    if (token !== generation) {
      model?.dispose();
      return;
    }

    let analysis: WeightAnalysis | null = null;
    try {
      analysis = model ? model.analyze() : null;
    } catch {
      analysis = null;
    }

    const record: RunRecord = {
      id: jobId,
      number: get().runs.length + 1,
      settings,
      epochs: get().epochs,
      results,
      analysis,
      params: model ? model.info.params : countParams(settings),
    };
    if (model) useModelStore.getState().setRetrained(model, jobId);
    set((s) => ({
      runs: [...s.runs, record],
      phase: problem ? 'error' : 'done',
      error: problem,
    }));
  }

  function listen(token: number, jobId: string, reconnects: number) {
    const { api, server, now } = getDeps();
    if (!api) return;
    const current = () => token === generation;

    stopListening = api.subscribe(jobId, {
      onQueued: (position) => current() && set({ phase: 'queued', position }),
      onStarted: () => current() && set((s) => ({ phase: 'running', position: 0, startedAt: s.startedAt ?? now() })),
      onEpoch: (point) => current() && addEpoch(point),
      onDone: (results, files) => {
        if (current()) void finish(token, jobId, results, files);
      },
      onError: (message) => current() && fail(message),
      onConnectionLost: () => {
        if (!current()) return;
        // Ask once what happened, then either finish, fail or listen again.
        api.status(jobId).then(
          (snapshot: JobSnapshot) => {
            if (!current()) return;
            if (snapshot.status === 'done' && snapshot.results) {
              set({ epochs: snapshot.epochs });
              void finish(token, jobId, snapshot.results, snapshot.files);
            } else if (snapshot.status === 'error') {
              fail(snapshot.error ?? 'Training failed.');
            } else if (reconnects < MAX_RECONNECTS) {
              listen(token, jobId, reconnects + 1);
            } else {
              fail(CONNECTION_LOST_TEXT);
            }
          },
          (error: unknown) => {
            if (!current()) return;
            if (!(error instanceof ApiError)) server?.markAsleep();
            fail(error instanceof ApiError ? error.message : CONNECTION_LOST_TEXT);
          },
        );
      },
    });
  }

  return {
    ...INITIAL,

    wake() {
      const { server } = getDeps();
      // The promise fails when the server stays unreachable; the status text already says so.
      server?.wake().catch(() => {});
    },

    async start(settings) {
      if (isBusy(get().phase)) return;
      const { server, api } = getDeps();
      if (!server || !api) {
        set({ phase: 'error', error: NOT_CONFIGURED_TEXT });
        return;
      }
      const token = ++generation;
      stopListening?.();
      stopListening = null;
      set({
        phase: 'waking',
        position: 0,
        jobId: null,
        jobSettings: { ...settings },
        epochs: [],
        startedAt: null,
        error: null,
      });

      try {
        await server.whenReady();
      } catch (error) {
        if (token === generation) fail((error as Error).message);
        return;
      }
      if (token !== generation) return;

      let job;
      try {
        job = await api.start(settings);
      } catch (error) {
        if (token !== generation) return;
        // No answer at all usually means the server went back to sleep.
        if (!(error instanceof ApiError)) server.markAsleep();
        fail(error instanceof ApiError ? error.message : STATUS_TEXT.unreachable);
        return;
      }
      if (token !== generation) return;

      set({ phase: 'queued', position: job.position, jobId: job.jobId, jobSettings: job.settings ?? { ...settings } });
      listen(token, job.jobId, 0);
    },

    stop() {
      if (!isBusy(get().phase)) return;
      generation++;
      stopListening?.();
      stopListening = null;
      set({ phase: 'stopped', position: 0 });
    },

    reset() {
      if (isBusy(get().phase)) return;
      set({ phase: 'idle', error: null, position: 0 });
    },
  };
});
