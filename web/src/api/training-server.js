// Connection from the page to the training server (the Hugging Face Space).
//
// The free Space sleeps when nobody uses it and needs about a minute to
// start. This module wakes it in the background and tells the page what to
// show while it waits.
//
// How the page uses it:
//
//   import { createTrainingServer } from "./training-server.js";
//
//   const server = createTrainingServer({
//     baseUrl: "https://<user>-<space>.hf.space",
//     onStatus: (status, text) => { trainButton.textContent = text || "Train"; },
//   });
//
//   server.wake();                  // when the page opens; never blocks the page
//
//   trainButton.onclick = async () => {
//     await server.whenReady();     // shows "Server is starting..." if needed
//     const response = await fetch(server.url("/train"), { method: "POST", ... });
//   };
//
// Status values: "idle" (not asked yet), "starting", "ready", "unreachable".

export const STATUS_TEXT = {
  idle: "",
  starting: "Server is starting, about 1 minute",
  ready: "",
  unreachable: "The training server can't be reached. Please try again in a few minutes.",
};

export class ServerUnreachableError extends Error {
  constructor(message = STATUS_TEXT.unreachable) {
    super(message);
    this.name = "ServerUnreachableError";
  }
}

// The server counts as awake when the wake request gets a normal answer.
// A sleeping Space answers with an error, with no answer at all, or with a
// Hugging Face "starting" web page, so an HTML answer does not count.
function defaultIsReady(response) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  return response.ok && !type.includes("text/html");
}

export function createTrainingServer({
  baseUrl,
  wakePath = "/wake",
  retryEveryMs = 5000, // pause between wake attempts
  requestTimeoutMs = 10000, // give up on one attempt after this long
  giveUpAfterMs = 180000, // stop trying after 3 minutes
  showStartingAfterMs = 1500, // an awake server answers fast: no message
  isReady = defaultIsReady,
  onStatus = () => {},
  fetchFn = (...args) => globalThis.fetch(...args),
  setTimeoutFn = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeoutFn = (id) => globalThis.clearTimeout(id),
  now = () => Date.now(),
} = {}) {
  if (!baseUrl) throw new Error("createTrainingServer needs baseUrl");
  const base = String(baseUrl).replace(/\/+$/, "");

  let status = "idle";
  let wakePromise = null;

  function url(path = "") {
    return base + (path.startsWith("/") ? path : "/" + path);
  }

  function setStatus(next) {
    if (next === status) return;
    status = next;
    onStatus(status, STATUS_TEXT[status]);
  }

  const sleep = (ms) => new Promise((resolve) => setTimeoutFn(resolve, ms));

  async function tryOnce() {
    const controller = new AbortController();
    const timer = setTimeoutFn(() => controller.abort(), requestTimeoutMs);
    try {
      // A plain GET with no extra headers, so the browser sends it directly.
      const response = await fetchFn(url(wakePath), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      return Boolean(await isReady(response));
    } catch {
      return false; // asleep, starting, offline or blocked: all mean "not yet"
    } finally {
      clearTimeoutFn(timer);
    }
  }

  async function wakeLoop() {
    const startedAt = now();
    // Only say "starting" if the first answer is slow or fails.
    const startingTimer = setTimeoutFn(() => {
      if (status !== "ready") setStatus("starting");
    }, showStartingAfterMs);
    try {
      for (;;) {
        if (await tryOnce()) {
          setStatus("ready");
          return;
        }
        setStatus("starting");
        if (now() - startedAt + retryEveryMs > giveUpAfterMs) {
          setStatus("unreachable");
          throw new ServerUnreachableError();
        }
        await sleep(retryEveryMs);
      }
    } finally {
      clearTimeoutFn(startingTimer);
    }
  }

  // Start waking the server. Safe to call many times: one wake runs at a
  // time, and a new one starts only after the last one failed.
  function wake() {
    if (!wakePromise) {
      wakePromise = wakeLoop().catch((error) => {
        wakePromise = null; // lets the next call try again
        throw error;
      });
      wakePromise.catch(() => {}); // the background call on page load ignores failures
    }
    return wakePromise;
  }

  // Use before a training request. Resolves when the server is awake;
  // rejects with ServerUnreachableError after giveUpAfterMs.
  function whenReady() {
    return wake();
  }

  // Call when a later request fails in a way that means the server went
  // back to sleep; the next wake() or whenReady() then checks again.
  function markAsleep() {
    if (status === "ready") {
      wakePromise = null;
      setStatus("idle");
    }
  }

  return {
    url,
    wake,
    whenReady,
    markAsleep,
    get status() {
      return status;
    },
    get statusText() {
      return STATUS_TEXT[status];
    },
  };
}
