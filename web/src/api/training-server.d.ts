// Types for training-server.js (plain JavaScript, tested with node --test).

export type ServerStatus = 'idle' | 'starting' | 'ready' | 'unreachable';

export const STATUS_TEXT: Record<ServerStatus, string>;

export class ServerUnreachableError extends Error {
  constructor(message?: string);
}

export interface TrainingServerOptions {
  baseUrl: string;
  wakePath?: string;
  retryEveryMs?: number;
  requestTimeoutMs?: number;
  giveUpAfterMs?: number;
  showStartingAfterMs?: number;
  isReady?: (response: Response) => boolean | Promise<boolean>;
  onStatus?: (status: ServerStatus, text: string) => void;
  fetchFn?: typeof fetch;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  now?: () => number;
}

export interface TrainingServer {
  /** Absolute address for a server path, for example url('/train'). */
  url(path?: string): string;
  /** Start waking the server. Safe to call many times. */
  wake(): Promise<void>;
  /** Resolves when the server is awake; rejects with ServerUnreachableError. */
  whenReady(): Promise<void>;
  /** Call when a request fails because the server went back to sleep. */
  markAsleep(): void;
  readonly status: ServerStatus;
  readonly statusText: string;
}

export function createTrainingServer(options: TrainingServerOptions): TrainingServer;
