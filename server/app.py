"""Web API for the training server (the Hugging Face Space).

The web page calls these addresses:

    GET  /wake                      small "wake up" request, sent when the page opens
    POST /train                     start a training run; the body is the settings as JSON
    GET  /train/{job_id}/events     live progress: one message after each epoch, then the result
    GET  /train/{job_id}            the same information as one plain JSON answer
    GET  /train/{job_id}/model/...  the trained model files (model.json, weights.bin)

One training runs at a time, unless TRAIN_WORKERS allows more (see below).
Other runs wait in line and are told their place.

    TRAIN_WORKERS   How many runs may train at the same time (1 to 8, default 1).
                    The first trains inside the server. Each extra one trains in
                    its own Python process, which starts when the line needs it
                    and closes after two idle minutes, so an idle server uses
                    the same memory as before. Each needs about 1.5 GB of memory.
    TRAIN_WORKERS_WARM  How many of them stay ready once they have started
                    (default 1: only the first). With 2, the first extra process
                    does not close when idle, so two runs always start at once.

Run it locally from the repository root:

    pip install -r server/requirements.txt
    uvicorn server.app:app --port 7860

The training code (`model.py`) and the export code (`export.py`) live next to this
file and are loaded the first time they are needed.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import logging
import multiprocessing
import os
import shutil
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

log = logging.getLogger("cnn_digits.api")

# How many finished runs to remember. Older ones and their model files are deleted.
MAX_FINISHED_JOBS = 20
# How often the progress stream looks for news, and how often it sends a
# "still here" line so the connection is not closed while an epoch is running.
STREAM_POLL_SECONDS = 0.25
STREAM_KEEPALIVE_SECONDS = 15
# The most runs that may ever train at the same time, whatever TRAIN_WORKERS says.
WORKERS_LIMIT = 8
# An extra training process closes after this long without work.
WORKER_IDLE_SECONDS = 120


def _workers_setting(name: str) -> int:
    """An environment variable as a number from 1 to WORKERS_LIMIT. Anything else counts as 1."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return 1
    try:
        value = int(raw)
    except ValueError:
        log.warning("%s=%r is not a whole number; 1 is used.", name, raw)
        return 1
    return max(1, min(WORKERS_LIMIT, value))


def max_workers_from_env() -> int:
    """TRAIN_WORKERS: the most runs that train at the same time."""
    return _workers_setting("TRAIN_WORKERS")


def warm_workers_from_env() -> int:
    """TRAIN_WORKERS_WARM: how many workers stay ready when there is no work."""
    return _workers_setting("TRAIN_WORKERS_WARM")


def _import_sibling(name: str):
    """Import a module that sits next to this file (`server/model.py`, ...)."""
    if __package__:
        return importlib.import_module(f"{__package__}.{name}")
    return importlib.import_module(name)


class Backend:
    """The training and export functions the API calls.

    With no arguments it loads the real ones from `model.py` and `export.py`
    on first use. Tests pass small stand-ins instead.
    """

    def __init__(
        self,
        train: Callable | None = None,
        export: Callable | None = None,
        default_settings: dict | None = None,
        evaluate: Callable | None = None,
        validate: Callable | None = None,
    ):
        self._train = train
        self._export = export
        self._defaults = default_settings
        self._evaluate = evaluate
        self._validate = validate
        self._loaded = train is not None and export is not None
        self._lock = threading.Lock()

    def load(self) -> None:
        with self._lock:
            if self._loaded:
                return
            model = _import_sibling("model")
            export = _import_sibling("export")
            self._train = self._train or model.train
            self._export = self._export or export.export_tfjs
            if self._defaults is None:
                self._defaults = dict(model.DEFAULT_SETTINGS)
            if self._evaluate is None:
                self._evaluate = getattr(model, "evaluate", None)
            if self._validate is None:
                self._validate = getattr(model, "validate_settings", None)
            self._loaded = True

    @property
    def default_settings(self) -> dict:
        self.load()
        return dict(self._defaults or {})

    def train(self, settings: dict, progress_callback: Callable):
        self.load()
        return self._train(settings, progress_callback=progress_callback)

    def export(self, model, out_dir: str) -> None:
        self.load()
        self._export(model, out_dir)

    def validate(self, settings: dict) -> dict:
        """Check the values with the training code's own check, if it has one."""
        self.load()
        if self._validate is None:
            return settings
        return dict(self._validate(settings) or settings)

    def evaluate(self, model) -> dict:
        self.load()
        return dict(self._evaluate(model)) if self._evaluate else {}


def _optional_sibling(name: str):
    """Like `_import_sibling`, but gives None when the file is not there yet."""
    try:
        return _import_sibling(name)
    except ModuleNotFoundError as exc:
        if exc.name and exc.name.split(".")[-1] == name:
            return None
        raise


def _plain(value: Any) -> Any:
    """Turn numpy numbers and the like into plain JSON values."""
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, (str, bool, int, float)) or value is None:
        return value
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)


class Job:
    """One training run."""

    def __init__(self, settings: dict):
        self.id = uuid.uuid4().hex
        self.settings = settings
        self.status = "queued"  # queued -> running -> done / error
        self.events: list[tuple[str, dict]] = []  # everything sent to the page, in order
        self.epochs: list[dict] = []
        self.results: dict | None = None
        self.files: list[str] = []
        self.error: str | None = None
        self.out_dir: str | None = None
        self.lock = threading.Lock()

    def add_event(self, name: str, data: dict) -> None:
        with self.lock:
            self.events.append((name, data))

    def on_progress(self, *args, **kwargs) -> None:
        """Called by the training code after each epoch.

        Accepts one dict (`{"epoch": 1, "loss": ..., "accuracy": ...}`) or the
        Keras style `(epoch_index, logs)`, where the index starts at 0.
        """
        data: dict = {}
        if len(args) == 1 and isinstance(args[0], dict):
            data.update(args[0])
        elif len(args) >= 2 and isinstance(args[1], dict):
            data.update(args[1])
            data.setdefault("epoch", int(args[0]) + 1)
        data.update(kwargs)
        data = _plain(data)
        data.setdefault("epoch", len(self.epochs) + 1)
        data.setdefault("epochs", self.settings.get("epochs"))
        with self.lock:
            self.epochs.append(data)
            self.events.append(("epoch", data))

    @property
    def finished(self) -> bool:
        return self.status in ("done", "error")


def run_training(backend: Backend, settings: dict, out_dir: str, on_progress: Callable, epochs: list) -> tuple:
    """Train, measure and export one model. Returns (results, file names).

    `epochs` is the list that `on_progress` fills, one entry per epoch.
    """
    start = time.monotonic()
    model = backend.train(settings, progress_callback=on_progress)
    seconds = time.monotonic() - start

    results: dict = {}
    if epochs:
        results.update({k: v for k, v in epochs[-1].items() if k not in ("epoch", "epochs")})
    results.update(_plain(backend.evaluate(model)))
    results["epochs"] = len(epochs)
    results["training_seconds"] = round(seconds, 1)

    backend.export(model, out_dir)
    files = sorted(p.name for p in Path(out_dir).iterdir() if p.is_file())
    if not files:
        raise RuntimeError("The export step wrote no model files.")
    return results, files


def _training_process(conn) -> None:
    """The body of an extra training process. Trains what the server sends it.

    It gets (settings, out_dir) and answers with ("epoch", data) after each
    epoch, then ("done", (results, files)) or ("error", message). None ends it.
    """
    backend = Backend()
    while True:
        try:
            message = conn.recv()
        except (EOFError, OSError):
            return
        if message is None:
            return
        settings, out_dir = message
        local = Job(settings)  # only used to bring each epoch's numbers into one form

        def on_progress(*args, **kwargs):
            local.on_progress(*args, **kwargs)
            conn.send(("epoch", local.epochs[-1]))

        try:
            conn.send(("done", run_training(backend, settings, out_dir, on_progress, local.epochs)))
        except Exception as exc:
            log.exception("Training failed in the training process")
            conn.send(("error", str(exc)))


class ProcessRunner:
    """Trains in a separate Python process, so runs can train at the same time.

    The process starts with the first run and is reused for the next ones.
    """

    def __init__(self):
        self._context = multiprocessing.get_context("spawn")
        self._process = None
        self._conn = None

    def run(self, settings: dict, out_dir: str, on_progress: Callable) -> tuple:
        if self._process is None or not self._process.is_alive():
            self.close()
            self._conn, child = self._context.Pipe()
            self._process = self._context.Process(
                target=_training_process, args=(child,), daemon=True, name="trainer-process"
            )
            self._process.start()
            child.close()
        self._conn.send((settings, out_dir))
        while True:
            try:
                kind, payload = self._conn.recv()
            except (EOFError, OSError):
                self.close()
                raise RuntimeError("the training process stopped. It may have run out of memory.")
            if kind == "epoch":
                on_progress(payload)
            elif kind == "done":
                return payload
            else:
                raise RuntimeError(payload)

    def close(self) -> None:
        process, conn = self._process, self._conn
        self._process = self._conn = None
        if conn is not None:
            try:
                conn.send(None)
            except (OSError, ValueError):
                pass
            conn.close()
        if process is not None:
            process.join(timeout=5)
            if process.is_alive():
                process.terminate()


class JobManager:
    """Keeps the line of training runs and trains up to `max_workers` at a time.

    The first worker trains inside the server and never stops. The others are
    started when more runs wait than workers are free. Each of those trains
    through its own runner (a `ProcessRunner` unless `make_runner` gives
    something else) and stops after `idle_seconds` without work, unless it
    is one of the `warm_workers` that stay ready.
    """

    def __init__(
        self,
        backend: Backend,
        max_workers: int | None = None,
        make_runner: Callable | None = None,
        idle_seconds: float = WORKER_IDLE_SECONDS,
        warm_workers: int | None = None,
    ):
        self.backend = backend
        self.max_workers = max_workers_from_env() if max_workers is None else max(1, int(max_workers))
        warm = warm_workers_from_env() if warm_workers is None else max(1, int(warm_workers))
        self.warm_workers = min(warm, self.max_workers)
        self.jobs: dict[str, Job] = {}
        self._waiting: list[Job] = []
        self._finished: list[Job] = []
        self._running = 0  # runs training now
        self._free = 0  # workers waiting for a run, or just started
        self._extra = 0  # extra workers alive
        self._lock = threading.Condition()
        self._worker: threading.Thread | None = None
        self._make_runner = make_runner or ProcessRunner
        self._idle_seconds = idle_seconds

    # -- called by the API ---------------------------------------------------

    def submit(self, settings: dict) -> Job:
        job = Job(settings)
        with self._lock:
            self.jobs[job.id] = job
            self._waiting.append(job)
            if self._worker is None or not self._worker.is_alive():
                self._free += 1
                self._worker = threading.Thread(target=self._work, daemon=True, name="trainer")
                self._worker.start()
            elif len(self._waiting) > self._free and self._extra < self.max_workers - 1:
                self._free += 1
                self._extra += 1
                threading.Thread(target=self._work_extra, daemon=True, name="trainer-extra").start()
            self._lock.notify()
        return job

    def position(self, job: Job) -> int:
        """Place in line: 0 = training now or finished, 1 = next, 2 = after that."""
        with self._lock:
            if job not in self._waiting:
                return 0
            return self._waiting.index(job) + 1

    def state(self) -> dict:
        with self._lock:
            return {"busy": self._running > 0, "waiting": len(self._waiting)}

    def snapshot(self, job: Job) -> dict:
        with job.lock:
            data = {
                "job_id": job.id,
                "status": job.status,
                "settings": job.settings,
                "epochs": list(job.epochs),
                "results": job.results,
                "files": _file_urls(job),
                "error": job.error,
            }
        data["position"] = self.position(job)
        return data

    # -- the workers -----------------------------------------------------------

    def _work(self) -> None:
        """The first worker: trains inside the server, waits for work for ever."""
        while True:
            with self._lock:
                while not self._waiting:
                    self._lock.wait()
                job = self._take()
            self._train(job, lambda out_dir: run_training(self.backend, job.settings, out_dir, job.on_progress, job.epochs))
            with self._lock:
                self._free += 1

    def _work_extra(self) -> None:
        """An extra worker: trains through its own runner, stops when idle too long."""
        runner = self._make_runner()
        try:
            while True:
                with self._lock:
                    deadline = time.monotonic() + self._idle_seconds
                    while not self._waiting:
                        left = deadline - time.monotonic()
                        if left > 0:
                            self._lock.wait(left)
                        elif self._extra > self.warm_workers - 1:
                            self._free -= 1
                            self._extra -= 1
                            return
                        else:  # one of the workers that stay ready
                            self._lock.wait()
                    job = self._take()
                self._train(job, lambda out_dir: runner.run(job.settings, out_dir, job.on_progress))
                with self._lock:
                    self._free += 1
        finally:
            runner.close()

    def _take(self) -> Job:
        """The next run in line. Call with the lock held."""
        self._free -= 1
        self._running += 1
        return self._waiting.pop(0)

    def _train(self, job: Job, run: Callable) -> None:
        """Train one run with `run(out_dir) -> (results, files)` and record how it ended."""
        job.status = "running"
        job.add_event("started", {"epochs": job.settings.get("epochs")})
        out_dir = tempfile.mkdtemp(prefix=f"cnn-digits-{job.id[:8]}-")
        try:
            results, files = run(out_dir)
            with job.lock:
                job.out_dir = out_dir
                job.files = list(files)
                job.results = results
                job.status = "done"
                job.events.append(("done", {"results": results, "files": _file_urls(job)}))
        except Exception as exc:  # the page must always get an answer
            log.exception("Training run %s failed", job.id)
            shutil.rmtree(out_dir, ignore_errors=True)
            with job.lock:
                job.error = f"Training failed: {exc}"
                job.status = "error"
                job.events.append(("error", {"message": job.error}))
        finally:
            with self._lock:
                self._running -= 1
                self._finished.append(job)
                old = self._finished[:-MAX_FINISHED_JOBS]
                self._finished = self._finished[-MAX_FINISHED_JOBS:]
                for gone in old:
                    self.jobs.pop(gone.id, None)
            for gone in old:
                if gone.out_dir:
                    shutil.rmtree(gone.out_dir, ignore_errors=True)


def _file_urls(job: Job) -> dict:
    return {name: f"/train/{job.id}/model/{name}" for name in job.files}


def _sse(name: str, data: dict, event_id: int | None = None) -> str:
    text = f"event: {name}\ndata: {json.dumps(data)}\n"
    if event_id is not None:
        text = f"id: {event_id}\n" + text
    return text + "\n"


def create_app(
    backend: Backend | None = None,
    max_workers: int | None = None,
    make_runner: Callable | None = None,
    idle_seconds: float = WORKER_IDLE_SECONDS,
    warm_workers: int | None = None,
) -> FastAPI:
    """Build the web API. The arguments after `backend` are for tests; see JobManager."""
    backend = backend or Backend()
    manager = JobManager(
        backend,
        max_workers=max_workers,
        make_runner=make_runner,
        idle_seconds=idle_seconds,
        warm_workers=warm_workers,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Load TensorFlow in the background while the server starts, so the
        # wake-up request also warms up the training code.
        def warm_up():
            try:
                backend.load()
            except Exception:
                log.exception("Could not load the training code yet")

        threading.Thread(target=warm_up, daemon=True, name="warm-up").start()
        yield

    app = FastAPI(title="CNN digits training server", lifespan=lifespan)
    app.state.manager = manager

    # Let the GitHub Pages site call this server (server/cors.py, issue #9).
    cors = _optional_sibling("cors")
    if cors is not None:
        cors.add_cors(app)
    # Safety limits for the settings (server/limits.py, issue #8).
    limits = _optional_sibling("limits")

    def get_job(job_id: str) -> Job:
        job = manager.jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "This training run was not found. It may have been cleaned up.")
        return job

    @app.get("/")
    @app.get("/wake")
    def wake() -> dict:
        """The page calls this when it opens, so a sleeping Space starts up."""
        return {"status": "ok", **manager.state()}

    @app.post("/train", status_code=202)
    async def start_training(request: Request) -> dict:
        """Start a training run. Body: the settings as JSON; missing ones use the defaults."""
        raw = await request.body()
        try:
            body = json.loads(raw) if raw.strip() else {}
        except ValueError:
            raise HTTPException(400, "The settings must be JSON.")
        if isinstance(body, dict) and isinstance(body.get("settings"), dict):
            body = body["settings"]
        if not isinstance(body, dict):
            raise HTTPException(400, "The settings must be a JSON object, for example {\"epochs\": 2}.")

        if limits is not None:
            # limits.py fills in the defaults and refuses values outside the allowed ranges.
            try:
                settings = limits.validate_settings(body)
            except limits.SettingsError as exc:
                errors = list(getattr(exc, "errors", None) or [str(exc)])
                raise HTTPException(400, " ".join(errors))
        else:
            try:
                defaults = backend.default_settings
            except Exception:
                log.exception("Could not load the training code")
                raise HTTPException(503, "The training code is not ready on the server.")
            unknown = sorted(set(body) - set(defaults)) if defaults else []
            if unknown:
                raise HTTPException(400, f"Unknown settings: {', '.join(unknown)}.")
            try:
                settings = backend.validate({**defaults, **body})
            except ValueError as exc:
                raise HTTPException(400, f"{exc}")

        job = manager.submit(settings)
        return {
            "job_id": job.id,
            "status": job.status,
            "position": manager.position(job),
            "settings": job.settings,
            "events_url": f"/train/{job.id}/events",
            "status_url": f"/train/{job.id}",
        }

    @app.get("/train/{job_id}")
    def training_status(job_id: str) -> dict:
        """Everything known about a run, for pages that ask again instead of listening."""
        return manager.snapshot(get_job(job_id))

    @app.get("/train/{job_id}/events")
    async def training_events(job_id: str, request: Request) -> StreamingResponse:
        """Live progress as Server-Sent Events (works with the browser's EventSource).

        Events: `queued` {position}, `started`, `epoch` {epoch, epochs, loss,
        accuracy, ...}, then `done` {results, files} or `error` {message}.
        If the connection drops, the browser reconnects and only gets what it missed.
        """
        job = get_job(job_id)
        try:
            sent = int(request.headers.get("last-event-id", "-1")) + 1
        except ValueError:
            sent = 0

        async def stream():
            nonlocal sent
            last_position = None
            last_write = time.monotonic()
            while True:
                with job.lock:
                    new = job.events[sent:]
                    finished = job.finished
                for name, data in new:
                    yield _sse(name, data, sent)
                    sent += 1
                    last_write = time.monotonic()
                if finished and not new:
                    return
                if not new:
                    position = manager.position(job)
                    if job.status == "queued" and position != last_position:
                        last_position = position
                        yield _sse("queued", {"position": position})
                        last_write = time.monotonic()
                    elif time.monotonic() - last_write > STREAM_KEEPALIVE_SECONDS:
                        yield ": still working\n\n"
                        last_write = time.monotonic()
                    await asyncio.sleep(STREAM_POLL_SECONDS)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/train/{job_id}/model/{filename}")
    def model_file(job_id: str, filename: str) -> FileResponse:
        """One trained model file. TensorFlow.js can load `.../model/model.json` directly."""
        job = get_job(job_id)
        if job.status != "done" or filename not in job.files:
            raise HTTPException(404, "This model file was not found.")
        media = "application/json" if filename.endswith(".json") else "application/octet-stream"
        return FileResponse(Path(job.out_dir) / filename, media_type=media)

    return app


app = create_app()
