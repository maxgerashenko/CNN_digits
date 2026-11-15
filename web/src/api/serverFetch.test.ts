import { describe, expect, it, vi } from 'vitest';
import { SERVER_HEADERS, createFetchEventSource, withServerHeaders } from './serverFetch';

const encoder = new TextEncoder();

/** An answer whose body sends the given pieces of text, one after another. */
function streamResponse(pieces: string[], init: { status?: number; type?: string } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': init.type ?? 'text/event-stream' }),
    body,
  } as unknown as Response;
}

/** Collects what a source tells its listeners. */
function listen(source: ReturnType<typeof createFetchEventSource>, types: string[]) {
  const seen: { type: string; data: unknown }[] = [];
  for (const type of types) {
    source.addEventListener(type, (event) => seen.push({ type, data: (event as MessageEvent).data }));
  }
  return seen;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('withServerHeaders', () => {
  it('adds the tunnel header and keeps the caller\'s headers and options', async () => {
    const fetchFn = vi.fn(async () => new Response('{}'));
    const wrapped = withServerHeaders(fetchFn as unknown as typeof fetch);

    await wrapped('https://server.example/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://server.example/train');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(headers.get('Content-Type')).toBe('application/json');
    for (const [name, value] of Object.entries(SERVER_HEADERS)) expect(headers.get(name)).toBe(value);
  });

  it('works with no options', async () => {
    const fetchFn = vi.fn(async () => new Response('{}'));
    await withServerHeaders(fetchFn as unknown as typeof fetch)('https://server.example/wake');
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('ngrok-skip-browser-warning')).toBe('1');
  });
});

describe('createFetchEventSource', () => {
  it('gives each message to the listeners of its event name', async () => {
    const fetchFn = vi.fn(async () =>
      streamResponse([
        'event: started\ndata: {"epochs":2}\nid: 0\n\n',
        ': still working\n\n',
        'event: epoch\ndata: {"epoch":1}\nid: 1\n\n',
      ]),
    );
    const source = createFetchEventSource('https://s.example/events', fetchFn as unknown as typeof fetch, {
      setTimeoutFn: () => 0,
    });
    const seen = listen(source, ['open', 'started', 'epoch']);
    await settle();

    expect(seen).toEqual([
      { type: 'open', data: undefined },
      { type: 'started', data: '{"epochs":2}' },
      { type: 'epoch', data: '{"epoch":1}' },
    ]);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
  });

  it('reads a message that arrives in several pieces, with any line ending', async () => {
    const fetchFn = vi.fn(async () => streamResponse(['event: ep', 'och\r\ndata: {"epo', 'ch":3}\r\n', '\r\n']));
    const source = createFetchEventSource('u', fetchFn as unknown as typeof fetch, { setTimeoutFn: () => 0 });
    const seen = listen(source, ['epoch']);
    await settle();
    expect(seen).toEqual([{ type: 'epoch', data: '{"epoch":3}' }]);
  });

  it('stops reading when a listener closes it', async () => {
    const fetchFn = vi.fn(async () =>
      streamResponse(['event: done\ndata: {}\nid: 4\n\nevent: epoch\ndata: {"late":true}\n\n']),
    );
    const retries: (() => void)[] = [];
    const source = createFetchEventSource('u', fetchFn as unknown as typeof fetch, {
      setTimeoutFn: (fn) => retries.push(fn),
    });
    const seen = listen(source, ['epoch', 'error']);
    source.addEventListener('done', () => source.close());
    await settle();

    expect(seen).toEqual([]);
    expect(source.readyState).toBe(2);
    expect(retries).toHaveLength(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('after a broken connection: error with no data, then asks only for what it missed', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(streamResponse(['event: epoch\ndata: {"epoch":1}\nid: 7\n\n']))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(streamResponse(['event: epoch\ndata: {"epoch":2}\nid: 8\n\n']));
    const retries: { fn: () => void; ms: number }[] = [];
    const source = createFetchEventSource('u', fetchFn as unknown as typeof fetch, {
      retryMs: 1234,
      setTimeoutFn: (fn, ms) => retries.push({ fn, ms }),
    });
    const seen = listen(source, ['epoch', 'error']);
    await settle();

    // The stream ended without the listener closing it: one error, one retry planned.
    expect(seen).toEqual([
      { type: 'epoch', data: '{"epoch":1}' },
      { type: 'error', data: undefined },
    ]);
    expect(source.readyState).toBe(0);
    expect(retries).toHaveLength(1);
    expect(retries[0].ms).toBe(1234);

    retries[0].fn(); // this attempt fails
    await settle();
    expect(seen).toHaveLength(3);
    expect(retries).toHaveLength(2);

    retries[1].fn();
    await settle();
    expect(seen[3]).toEqual({ type: 'epoch', data: '{"epoch":2}' });
    for (const call of fetchFn.mock.calls.slice(1)) {
      expect((call[1] as { headers: Record<string, string> }).headers['Last-Event-ID']).toBe('7');
    }
  });

  it('an answer that is not an event stream is final', async () => {
    for (const response of [
      streamResponse(['{"detail":"Unknown job"}'], { status: 404, type: 'application/json' }),
      streamResponse(['<html>warning page</html>'], { type: 'text/html' }),
    ]) {
      const retries: (() => void)[] = [];
      const source = createFetchEventSource('u', (async () => response) as unknown as typeof fetch, {
        setTimeoutFn: (fn) => retries.push(fn),
      });
      const seen = listen(source, ['open', 'error']);
      await settle();
      expect(seen).toEqual([{ type: 'error', data: undefined }]);
      expect(source.readyState).toBe(2);
      expect(retries).toHaveLength(0);
    }
  });

  it('does not connect again after close()', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('network'));
    const retries: (() => void)[] = [];
    const source = createFetchEventSource('u', fetchFn as unknown as typeof fetch, {
      setTimeoutFn: (fn) => retries.push(fn),
    });
    await settle();
    expect(retries).toHaveLength(1);
    source.close();
    retries[0]();
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
