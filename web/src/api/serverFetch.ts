// How the app sends requests to the training server when the server is
// reached through a tunnel (ngrok) that shows browsers a warning page.
//
// The tunnel lets a request through when it carries a header that says so.
// The browser's EventSource cannot send headers, so the live progress stream
// is read with fetch instead.

import type { EventSourceLike } from './trainingApi';

/** Sent with every request to the training server. Servers without a tunnel ignore it. */
export const SERVER_HEADERS: Readonly<Record<string, string>> = {
  'ngrok-skip-browser-warning': '1',
};

/** Returns a fetch that adds SERVER_HEADERS to each request. Headers the caller sets win. */
export function withServerHeaders(fetchFn: typeof fetch = (...args) => globalThis.fetch(...args)): typeof fetch {
  return (input, init = {}) => {
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(SERVER_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return fetchFn(input, { ...init, headers });
  };
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

export interface FetchEventSourceOptions {
  /** Pause before connecting again after the connection broke. */
  retryMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
}

/**
 * Reads a Server-Sent Events stream with fetch. It behaves like the part of
 * EventSource the app uses:
 *
 * - a message calls the listeners of its event name with `{ data }`;
 * - a broken connection calls the 'error' listeners with an event that has
 *   no data, then connects again and asks only for what it missed
 *   (Last-Event-ID);
 * - an answer that is not an event stream (a 404, a web page) is final:
 *   readyState becomes CLOSED and the 'error' listeners are called once.
 */
export function createFetchEventSource(
  url: string,
  fetchFn: typeof fetch,
  options: FetchEventSourceOptions = {},
): EventSourceLike {
  const retryMs = options.retryMs ?? 3000;
  const setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => globalThis.setTimeout(fn, ms));

  const listeners = new Map<string, ((event: Event) => void)[]>();
  let controller: AbortController | null = null;
  let lastEventId: string | null = null;

  const source: EventSourceLike = {
    readyState: CONNECTING,
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    close() {
      source.readyState = CLOSED;
      controller?.abort();
    },
  };

  const emit = (type: string, data?: string) => {
    const event = { type, data } as unknown as Event;
    for (const listener of listeners.get(type) ?? []) listener(event);
  };

  // One message is the lines up to an empty line.
  const dispatch = (lines: string[]) => {
    let type = 'message';
    let id: string | null = null;
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue; // a comment, sent to keep the connection open
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') type = value;
      else if (field === 'data') data.push(value);
      else if (field === 'id') id = value;
    }
    if (id !== null) lastEventId = id;
    if (data.length > 0) emit(type, data.join('\n'));
  };

  const connectionBroke = () => {
    if (source.readyState === CLOSED) return;
    source.readyState = CONNECTING;
    emit('error');
    // A listener may have closed the source.
    if ((source.readyState as number) !== CLOSED) setTimeoutFn(() => void connect(), retryMs);
  };

  async function connect(): Promise<void> {
    if (source.readyState === CLOSED) return;
    controller = new AbortController();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (lastEventId !== null) headers['Last-Event-ID'] = lastEventId;

    let response: Response;
    try {
      response = await fetchFn(url, { headers, cache: 'no-store', signal: controller.signal });
    } catch {
      connectionBroke();
      return;
    }
    if ((source.readyState as number) === CLOSED) return;

    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!response.ok || !type.includes('text/event-stream') || !response.body) {
      source.readyState = CLOSED;
      emit('error');
      return;
    }

    source.readyState = OPEN;
    emit('open');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lines: string[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r\n|\n|\r/);
        buffer = parts.pop() ?? '';
        for (const line of parts) {
          if (line === '') {
            if (lines.length > 0) dispatch(lines);
            lines = [];
            if ((source.readyState as number) === CLOSED) return;
          } else {
            lines.push(line);
          }
        }
      }
    } catch {
      // The connection broke, or close() stopped it. Both are handled below.
    }
    // The server ended the stream, or the connection broke, before a listener closed it.
    connectionBroke();
  }

  void connect();
  return source;
}
