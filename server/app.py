"""Web API for the training server (the Hugging Face Space).

The web page calls these addresses:

    GET  /wake                      small "wake up" request, sent when the page opens
    POST /train                     start a training run; the body is the settings as JSON
    GET  /train/{job_id}/events     live progress: one message after each epoch, then the result
    GET  /train/{job_id}            the same information as one plain JSON answer
    GET  /train/{job_id}/model/...  the trained model files (model.json, weights.bin)

One training runs at a time. Other runs wait in line and are told their place.

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
    ):
        self._train = train
        self._export = export
        self._defaults = default_settings
        self._evaluate = evaluate
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


class JobManager:
    """Keeps the line of training runs and trains them one at a time."""

    def __init__(self, backend: Backend):
        self.backend = backend
        self.jobs: dict[str, Job] = {}
        self._waiting: list[Job] = []
        self._finished: list[Job] = []
        self._running: Job | None = None
        self._lock = threading.Condition()
        self._worker: threading.Thread | None = None

    # -- called by the API ---------------------------------------------------

    def submit(self, settings: dict) -> Job:
        job = Job(settings)
        with self._lock:
            self.jobs[job.id] = job
            self._waiting.append(job)
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._work, daemon=True, name="trainer")
                self._worker.start()
            self._lock.notify()
        return job

    def position(self, job: Job) -> int:
        """Place in line: 0 = training now or finished, 1 = next, 2 = after that."""
        with self._lock:
            if job not in self._waiting:
                return 0
            ahead = self._waiting.index(job)
            return ahead + (1 if self._running else 0) + (0 if self._running else 1)

    def state(self) -> dict:
        with self._lock:
            return {"busy": self._running is not None, "waiting": len(self._waiting)}

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

    # -- the worker thread ---------------------------------------------------

    def _work(self) -> None:
        while True:
            with self._lock:
                while not self._waiting:
                    self._lock.wait()
                job = self._waiting.pop(0)
                self._running = job
            try:
                self._train(job)
            finally:
                with self._lock:
                    self._running = None
                    self._finished.append(job)
                    old = self._finished[:-MAX_FINISHED_JOBS]
                    self._finished = self._finished[-MAX_FINISHED_JOBS:]
                    for gone in old:
                        self.jobs.pop(gone.id, None)
                for gone in old:
                    if gone.out_dir:
                        shutil.rmtree(gone.out_dir, ignore_errors=True)

    def _train(self, job: Job) -> None:
        job.status = "running"
        job.add_event("started", {"epochs": job.settings.get("epochs")})
        try:
            start = time.monotonic()
            model = self.backend.train(job.settings, progress_callback=job.on_progress)
            seconds = time.monotonic() - start

            results: dict = {}
            if job.epochs:
                results.update({k: v for k, v in job.epochs[-1].items() if k not in ("epoch", "epochs")})
            results.update(_plain(self.backend.evaluate(model)))
            results["epochs"] = len(job.epochs)
            results["training_seconds"] = round(seconds, 1)

            out_dir = tempfile.mkdtemp(prefix=f"cnn-digits-{job.id[:8]}-")
            self.backend.export(model, out_dir)
            files = sorted(p.name for p in Path(out_dir).iterdir() if p.is_file())
            if not files:
                raise RuntimeError("The export step wrote no model files.")

            with job.lock:
                job.out_dir = out_dir
                job.files = files
                job.results = results
                job.status = "done"
                job.events.append(("done", {"results": results, "files": _file_urls(job)}))
        except Exception as exc:  # the page must always get an answer
            log.exception("Training run %s failed", job.id)
            with job.lock:
                job.error = f"Training failed: {exc}"
                job.status = "error"
                job.events.append(("error", {"message": job.error}))


def _file_urls(job: Job) -> dict:
    return {name: f"/train/{job.id}/model/{name}" for name in job.files}


def _sse(name: str, data: dict, event_id: int | None = None) -> str:
    text = f"event: {name}\ndata: {json.dumps(data)}\n"
    if event_id is not None:
        text = f"id: {event_id}\n" + text
    return text + "\n"


def create_app(backend: Backend | None = None) -> FastAPI:
    backend = backend or Backend()
    manager = JobManager(backend)

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
            settings = {**defaults, **body}

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
