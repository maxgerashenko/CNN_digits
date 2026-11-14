// Tests for docs/js/training-server.js. Run from the repo root:
//   node --test tests/training-server.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STATUS_TEXT,
  ServerUnreachableError,
  createTrainingServer,
} from "../docs/js/training-server.js";

// A fake clock: timers run instantly, in order, and move "now" forward.
function fakeClock() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id),
    // Run the earliest timer, if any.
    async tick() {
      await new Promise((resolve) => setImmediate(resolve));
      if (timers.size === 0) return false;
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id);
      time = timer.at;
      timer.fn();
      await new Promise((resolve) => setImmediate(resolve));
      return true;
    },
  };
}

const jsonOk = () =>
  new Response('{"status":"ok"}', { headers: { "content-type": "application/json" } });

function setup(answers, options = {}) {
  const clock = fakeClock();
  const calls = [];
  const statuses = [];
  const server = createTrainingServer({
    baseUrl: "https://example.hf.space/",
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      return answer(init);
    },
    onStatus: (status, text) => statuses.push([status, text]),
    ...clock,
    ...options,
  });
  return { server, clock, calls, statuses };
}

async function settle(promise, clock) {
  let done = false;
  let result;
  promise.then(
    (value) => ((done = true), (result = { value })),
    (error) => ((done = true), (result = { error })),
  );
  for (let i = 0; i < 1000 && !done; i++) await clock.tick();
  assert.ok(done, "promise did not settle");
  return result;
}

test("awake server: ready at once, no 'starting' message", async () => {
  const { server, clock, calls, statuses } = setup([jsonOk]);
  const result = await settle(server.wake(), clock);
  assert.equal(result.error, undefined);
  assert.equal(server.status, "ready");
  assert.deepEqual(statuses, [["ready", ""]]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.hf.space/wake");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers, undefined, "no custom headers, so no preflight");
});

test("sleeping server: shows 'Server is starting', retries, then ready", async () => {
  const networkError = () => {
    throw new TypeError("Failed to fetch");
  };
  const badGateway = () => new Response("", { status: 503 });
  const htmlPage = () =>
    new Response("<html>Space is starting</html>", { headers: { "content-type": "text/html" } });
  const { server, clock, calls, statuses } = setup([networkError, badGateway, htmlPage, jsonOk]);

  const result = await settle(server.whenReady(), clock);
  assert.equal(result.error, undefined);
  assert.equal(calls.length, 4);
  assert.deepEqual(statuses, [
    ["starting", "Server is starting, about 1 minute"],
    ["ready", ""],
  ]);
  assert.equal(clock.now(), 15000, "three 5 second pauses");
});

test("slow first answer: 'starting' shows while waiting", async () => {
  const clockRef = {};
  const slow = () =>
    new Promise((resolve) => clockRef.clock.setTimeoutFn(() => resolve(jsonOk()), 4000));
  const { server, clock, statuses } = setup([slow]);
  clockRef.clock = clock;
  await settle(server.wake(), clock);
  assert.deepEqual(statuses.map((s) => s[0]), ["starting", "ready"]);
});

test("hanging request is cut off and retried", async () => {
  const hang = (init) =>
    new Promise((_, reject) =>
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
    );
  const { server, clock, calls } = setup([hang, jsonOk]);
  const result = await settle(server.wake(), clock);
  assert.equal(result.error, undefined);
  assert.equal(calls.length, 2);
  assert.equal(clock.now(), 15000, "10 second timeout + 5 second pause");
});

test("server never answers: gives up after 3 minutes, then can retry", async () => {
  const answers = [() => new Response("", { status: 503 })];
  const { server, clock, calls, statuses } = setup(answers);

  const result = await settle(server.whenReady(), clock);
  assert.ok(result.error instanceof ServerUnreachableError);
  assert.equal(server.status, "unreachable");
  assert.equal(server.statusText, STATUS_TEXT.unreachable);
  assert.ok(clock.now() <= 180000);
  assert.ok(calls.length >= 30);
  assert.deepEqual(statuses.map((s) => s[0]), ["starting", "unreachable"]);

  answers[0] = jsonOk; // the server comes back
  const second = await settle(server.whenReady(), clock);
  assert.equal(second.error, undefined);
  assert.equal(server.status, "ready");
});

test("wake() many times makes one request loop; whenReady() reuses it", async () => {
  const { server, clock, calls } = setup([jsonOk]);
  const a = server.wake();
  const b = server.wake();
  const c = server.whenReady();
  assert.equal(a, b);
  assert.equal(a, c);
  await settle(a, clock);
  await settle(server.whenReady(), clock);
  assert.equal(calls.length, 1);
});

test("markAsleep() makes the next whenReady() check again", async () => {
  const { server, clock, calls } = setup([jsonOk]);
  await settle(server.wake(), clock);
  server.markAsleep();
  assert.equal(server.status, "idle");
  await settle(server.whenReady(), clock);
  assert.equal(calls.length, 2);
  assert.equal(server.status, "ready");
});

test("url() joins paths and wakePath can be changed", async () => {
  const { server, clock, calls } = setup([jsonOk], { wakePath: "/health" });
  assert.equal(server.url("/train"), "https://example.hf.space/train");
  assert.equal(server.url("train"), "https://example.hf.space/train");
  await settle(server.wake(), clock);
  assert.equal(calls[0].url, "https://example.hf.space/health");
});

test("baseUrl is required", () => {
  assert.throws(() => createTrainingServer({}), /baseUrl/);
});
