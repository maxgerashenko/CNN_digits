"""Tests for the web API, using small stand-ins for the training and export code.

Run from the repository root:

    pip install -r server/requirements.txt pytest httpx
    pytest server/tests
"""

import json
import sys
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from server.app import (  # noqa: E402
    Backend,
    Job,
    create_app,
    max_workers_from_env,
    run_training,
    warm_workers_from_env,
)

DEFAULTS = {"epochs": 2, "dropout": 0.1, "learning_rate": 0.001}


class FakeTrainer:
    """Stands in for `server/model.py`: reports each epoch and returns a "model"."""

    def __init__(self):
        self.gate = threading.Event()  # tests can hold training back with this
        self.gate.set()
        self.seen_settings = []

    def train(self, settings, progress_callback=None):
        self.seen_settings.append(settings)
        self.gate.wait(timeout=5)
        if settings.get("dropout") == 0.5:
            raise ValueError("boom")
        for epoch in range(1, settings["epochs"] + 1):
            progress_callback({"epoch": epoch, "loss": 1.0 / epoch, "accuracy": 0.9 + epoch / 100})
        return {"fake": "model"}


def fake_export(model, out_dir):
    """Stands in for `server/export.py`: writes the two files TensorFlow.js reads."""
    Path(out_dir, "model.json").write_text(json.dumps({"weightsManifest": [{"paths": ["weights.bin"]}]}))
    Path(out_dir, "weights.bin").write_bytes(b"\x00\x01\x02\x03")


def fake_evaluate(model):
    confusion = [[1000 if row == column else 0 for column in range(10)] for row in range(10)]
    return {"test_accuracy": 0.975, "mistakes": 250, "test_images": 10000, "confusion": confusion}


@pytest.fixture(autouse=True)
def api_alone(monkeypatch):
    """Test the API on its own: hide the real `limits.py` and `cors.py`.

    The tests below use small stand-in settings. The test at the end of this
    file checks the API together with the real files.
    """
    monkeypatch.setitem(sys.modules, "server.limits", None)
    monkeypatch.setitem(sys.modules, "server.cors", None)


@pytest.fixture
def trainer():
    return FakeTrainer()


@pytest.fixture
def client(trainer):
    backend = Backend(train=trainer.train, export=fake_export, default_settings=DEFAULTS, evaluate=fake_evaluate)
    with TestClient(create_app(backend)) as c:
        yield c


def read_events(client, job_id, headers=None):
    events = []
    with client.stream("GET", f"/train/{job_id}/events", headers=headers) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        name = None
        for line in response.iter_lines():
            if line.startswith("event: "):
                name = line[len("event: "):]
            elif line.startswith("data: "):
                events.append((name, json.loads(line[len("data: "):])))
    return events


def wait_until_finished(client, job_id):
    for _ in range(200):
        status = client.get(f"/train/{job_id}").json()
        if status["status"] in ("done", "error"):
            return status
        time.sleep(0.02)
    raise AssertionError("training did not finish")


def test_wake(client):
    for path in ("/wake", "/"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "busy": False, "waiting": 0}


def test_train_sends_progress_then_model_and_results(client, trainer):
    started = client.post("/train", json={"epochs": 3})
    assert started.status_code == 202
    job = started.json()
    assert job["settings"] == {"epochs": 3, "dropout": 0.1, "learning_rate": 0.001}
    assert trainer.seen_settings == [] or trainer.seen_settings == [job["settings"]]

    events = read_events(client, job["job_id"])
    names = [name for name, _ in events if name != "queued"]
    assert names == ["started", "epoch", "epoch", "epoch", "done"]

    epochs = [data for name, data in events if name == "epoch"]
    assert [e["epoch"] for e in epochs] == [1, 2, 3]
    assert all(e["epochs"] == 3 and "loss" in e and "accuracy" in e for e in epochs)

    done = events[-1][1]
    assert done["results"]["test_accuracy"] == 0.975
    assert done["results"]["mistakes"] == 250
    assert done["results"]["epochs"] == 3
    assert done["results"]["accuracy"] == pytest.approx(0.93)
    assert "training_seconds" in done["results"]
    assert set(done["files"]) == {"model.json", "weights.bin"}

    model_json = client.get(done["files"]["model.json"])
    assert model_json.status_code == 200
    assert model_json.json()["weightsManifest"][0]["paths"] == ["weights.bin"]
    weights = client.get(done["files"]["weights.bin"])
    assert weights.content == b"\x00\x01\x02\x03"


def test_status_gives_the_same_information_without_streaming(client):
    job_id = client.post("/train", json={}).json()["job_id"]
    status = wait_until_finished(client, job_id)
    assert status["status"] == "done"
    assert len(status["epochs"]) == 2
    assert status["results"]["mistakes"] == 250
    assert set(status["files"]) == {"model.json", "weights.bin"}
    assert status["position"] == 0


def test_settings_can_be_wrapped_and_empty_body_uses_defaults(client):
    wrapped = client.post("/train", json={"settings": {"epochs": 1}}).json()
    assert wrapped["settings"]["epochs"] == 1
    empty = client.post("/train").json()
    assert empty["settings"] == DEFAULTS


def test_bad_requests_are_refused(client):
    assert client.post("/train", json={"speed": "fast"}).status_code == 400
    assert client.post("/train", json=[1, 2]).status_code == 400
    assert client.post("/train", content=b"not json").status_code == 400
    assert client.get("/train/nope").status_code == 404
    assert client.get("/train/nope/events").status_code == 404
    assert client.get("/train/nope/model/model.json").status_code == 404


def test_training_error_is_reported(client):
    job_id = client.post("/train", json={"dropout": 0.5}).json()["job_id"]
    events = read_events(client, job_id)
    assert events[-1][0] == "error"
    assert "boom" in events[-1][1]["message"]
    status = client.get(f"/train/{job_id}").json()
    assert status["status"] == "error" and status["files"] == {}
    assert client.get(f"/train/{job_id}/model/model.json").status_code == 404


def test_one_run_at_a_time_and_others_wait_in_line(client, trainer):
    trainer.gate.clear()  # hold the first run
    first = client.post("/train", json={}).json()
    for _ in range(200):
        if client.get("/wake").json()["busy"]:
            break
        time.sleep(0.01)
    second = client.post("/train", json={}).json()
    third = client.post("/train", json={}).json()
    assert second["position"] == 1
    assert third["position"] == 2
    assert client.get("/wake").json() == {"status": "ok", "busy": True, "waiting": 2}
    assert client.get(f"/train/{second['job_id']}/model/model.json").status_code == 404

    trainer.gate.set()
    for job in (first, second, third):
        assert wait_until_finished(client, job["job_id"])["status"] == "done"
    assert len(trainer.seen_settings) == 3


class ThreadRunner:
    """Stands in for `ProcessRunner`: trains in the worker's own thread, with the same messages."""

    made = []

    def __init__(self, backend, fail=False):
        self.backend = backend
        self.fail = fail
        self.closed = False
        ThreadRunner.made.append(self)

    def run(self, settings, out_dir, on_progress):
        if self.fail:
            raise RuntimeError("the training process stopped. It may have run out of memory.")
        local = Job(settings)

        def progress(*args, **kwargs):
            local.on_progress(*args, **kwargs)
            on_progress(local.epochs[-1])

        return run_training(self.backend, settings, out_dir, progress, local.epochs)

    def close(self):
        self.closed = True


def parallel_client(trainer, max_workers, idle_seconds=60, fail=False, warm_workers=1):
    ThreadRunner.made = []
    backend = Backend(train=trainer.train, export=fake_export, default_settings=DEFAULTS, evaluate=fake_evaluate)
    app = create_app(
        backend,
        max_workers=max_workers,
        make_runner=lambda: ThreadRunner(backend, fail=fail),
        idle_seconds=idle_seconds,
        warm_workers=warm_workers,
    )
    return TestClient(app)


def wait_for(condition):
    for _ in range(300):
        if condition():
            return
        time.sleep(0.01)
    raise AssertionError("the expected state was not reached")


def test_two_workers_train_two_runs_at_the_same_time(trainer):
    with parallel_client(trainer, max_workers=2) as c:
        trainer.gate.clear()  # hold every run inside training
        first = c.post("/train", json={}).json()
        second = c.post("/train", json={}).json()
        third = c.post("/train", json={}).json()

        # Two runs are inside the training code together; the third waits.
        wait_for(lambda: len(trainer.seen_settings) == 2)
        assert c.get("/wake").json() == {"status": "ok", "busy": True, "waiting": 1}
        assert c.get(f"/train/{third['job_id']}").json()["position"] == 1
        assert c.get(f"/train/{first['job_id']}").json()["status"] == "running"
        assert c.get(f"/train/{second['job_id']}").json()["status"] == "running"
        assert len(ThreadRunner.made) == 1  # one extra worker, not more than the limit allows

        trainer.gate.set()
        for job in (first, second, third):
            status = wait_until_finished(c, job["job_id"])
            assert status["status"] == "done"
            assert [e["epoch"] for e in status["epochs"]] == [1, 2]
            assert status["results"]["test_accuracy"] == 0.975
            assert c.get(f"/train/{job['job_id']}/model/weights.bin").content == b"\x00\x01\x02\x03"
        assert len(trainer.seen_settings) == 3


def test_extra_worker_sends_the_same_events_as_the_first(trainer):
    with parallel_client(trainer, max_workers=2) as c:
        trainer.gate.clear()
        jobs = [c.post("/train", json={}).json() for _ in range(2)]
        wait_for(lambda: len(trainer.seen_settings) == 2)
        trainer.gate.set()
        streams = [read_events(c, job["job_id"]) for job in jobs]
    for events in streams:
        assert [name for name, _ in events if name != "queued"] == ["started", "epoch", "epoch", "done"]
    assert streams[0][-1][1]["results"] == streams[1][-1][1]["results"]


def test_extra_worker_stops_when_it_has_no_work(trainer):
    with parallel_client(trainer, max_workers=3, idle_seconds=0.05) as c:
        trainer.gate.clear()
        jobs = [c.post("/train", json={}).json() for _ in range(3)]
        wait_for(lambda: len(trainer.seen_settings) == 3)
        assert len(ThreadRunner.made) == 2
        trainer.gate.set()
        for job in jobs:
            wait_until_finished(c, job["job_id"])
        wait_for(lambda: all(runner.closed for runner in ThreadRunner.made))

        # A new run after that is still trained.
        again = c.post("/train", json={}).json()
        assert wait_until_finished(c, again["job_id"])["status"] == "done"


def test_warm_worker_stays_ready_and_the_others_stop(trainer):
    with parallel_client(trainer, max_workers=3, idle_seconds=0.05, warm_workers=2) as c:
        trainer.gate.clear()
        jobs = [c.post("/train", json={}).json() for _ in range(3)]
        wait_for(lambda: len(trainer.seen_settings) == 3)
        trainer.gate.set()
        for job in jobs:
            wait_until_finished(c, job["job_id"])

        # Of the two extra workers one stops; the other stays, however long it is idle.
        wait_for(lambda: sum(runner.closed for runner in ThreadRunner.made) == 1)
        time.sleep(0.3)
        assert sum(runner.closed for runner in ThreadRunner.made) == 1

        # Two new runs train together without a new worker being made.
        trainer.gate.clear()
        seen = len(trainer.seen_settings)
        again = [c.post("/train", json={}).json() for _ in range(2)]
        wait_for(lambda: len(trainer.seen_settings) == seen + 2)
        assert len(ThreadRunner.made) == 2
        trainer.gate.set()
        for job in again:
            assert wait_until_finished(c, job["job_id"])["status"] == "done"


def test_warm_workers_cannot_be_more_than_the_limit(trainer):
    with parallel_client(trainer, max_workers=2, warm_workers=5) as c:
        assert c.app.state.manager.warm_workers == 2


def test_one_worker_never_starts_an_extra_one(trainer):
    with parallel_client(trainer, max_workers=1) as c:
        trainer.gate.clear()
        jobs = [c.post("/train", json={}).json() for _ in range(3)]
        wait_for(lambda: len(trainer.seen_settings) == 1)
        assert c.get("/wake").json()["waiting"] == 2
        trainer.gate.set()
        for job in jobs:
            assert wait_until_finished(c, job["job_id"])["status"] == "done"
    assert ThreadRunner.made == []


def test_extra_worker_that_breaks_reports_an_error(trainer):
    with parallel_client(trainer, max_workers=2, fail=True) as c:
        trainer.gate.clear()
        first = c.post("/train", json={}).json()
        wait_for(lambda: len(trainer.seen_settings) == 1)
        second = c.post("/train", json={}).json()  # goes to the extra worker, which breaks
        status = wait_until_finished(c, second["job_id"])
        assert status["status"] == "error"
        assert "stopped" in status["error"]
        assert c.get("/wake").json() == {"status": "ok", "busy": True, "waiting": 0}
        trainer.gate.set()
        assert wait_until_finished(c, first["job_id"])["status"] == "done"


@pytest.mark.parametrize(
    "value, expected",
    [(None, 1), ("", 1), ("1", 1), ("3", 3), (" 2 ", 2), ("0", 1), ("-4", 1), ("99", 8), ("many", 1), ("2.5", 1)],
)
def test_train_workers_setting(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("TRAIN_WORKERS", raising=False)
    else:
        monkeypatch.setenv("TRAIN_WORKERS", value)
    assert max_workers_from_env() == expected


def test_warm_workers_setting(monkeypatch):
    monkeypatch.delenv("TRAIN_WORKERS_WARM", raising=False)
    assert warm_workers_from_env() == 1
    monkeypatch.setenv("TRAIN_WORKERS_WARM", "2")
    assert warm_workers_from_env() == 2
    monkeypatch.setenv("TRAIN_WORKERS_WARM", "none")
    assert warm_workers_from_env() == 1


def test_reconnect_only_gets_missed_events(client):
    job_id = client.post("/train", json={}).json()["job_id"]
    wait_until_finished(client, job_id)
    # ids: 0 started, 1 epoch 1, 2 epoch 2, 3 done
    events = read_events(client, job_id, headers={"Last-Event-ID": "1"})
    assert [name for name, _ in events] == ["epoch", "done"]
    assert events[0][1]["epoch"] == 2


def test_keras_style_progress_callback(client, trainer):
    def keras_style(settings, progress_callback=None):
        progress_callback(0, {"loss": 0.5, "accuracy": 0.8})
        return object()

    trainer.train = keras_style
    backend = Backend(train=keras_style, export=fake_export, default_settings=DEFAULTS)
    with TestClient(create_app(backend)) as c:
        job_id = c.post("/train", json={"epochs": 1}).json()["job_id"]
        status = wait_until_finished(c, job_id)
    assert status["epochs"] == [{"loss": 0.5, "accuracy": 0.8, "epoch": 1, "epochs": 1}]


def test_uses_cors_and_limits_when_those_files_exist(trainer, monkeypatch):
    import types

    class SettingsError(Exception):
        def __init__(self, errors):
            super().__init__("; ".join(errors))
            self.errors = errors

    def validate_settings(raw):
        if raw.get("epochs", 2) > 5:
            raise SettingsError(["Epochs must be 1 to 5."])
        return {**DEFAULTS, **raw, "checked": True}

    calls = []
    limits = types.SimpleNamespace(validate_settings=validate_settings, SettingsError=SettingsError)
    cors = types.SimpleNamespace(add_cors=calls.append)
    monkeypatch.setitem(sys.modules, "server.limits", limits)
    monkeypatch.setitem(sys.modules, "server.cors", cors)

    backend = Backend(train=trainer.train, export=fake_export, default_settings=DEFAULTS)
    app = create_app(backend)
    assert calls == [app]
    with TestClient(app) as c:
        refused = c.post("/train", json={"epochs": 9})
        assert refused.status_code == 400
        assert refused.json()["detail"] == "Epochs must be 1 to 5."
        assert c.post("/train", json={"epochs": 1}).json()["settings"]["checked"] is True


def test_training_code_can_refuse_bad_values(trainer):
    def validate(settings):
        if settings["epochs"] > 5:
            raise ValueError("epochs must be between 1 and 5, got 99")
        return settings

    backend = Backend(train=trainer.train, export=fake_export, default_settings=DEFAULTS, validate=validate)
    with TestClient(create_app(backend)) as c:
        refused = c.post("/train", json={"epochs": 99})
        assert refused.status_code == 400
        assert "between 1 and 5" in refused.json()["detail"]
        assert c.post("/train", json={"epochs": 1}).status_code == 202
    assert trainer.seen_settings == [{**DEFAULTS, "epochs": 1}]


def test_works_with_the_real_limits_and_cors_files(trainer, monkeypatch):
    monkeypatch.delitem(sys.modules, "server.limits")
    monkeypatch.delitem(sys.modules, "server.cors")
    from server import limits

    backend = Backend(train=trainer.train, export=fake_export, default_settings=DEFAULTS)
    with TestClient(create_app(backend)) as c:
        started = c.post("/train", json={"epochs": 1})
        assert started.status_code == 202
        settings = started.json()["settings"]
        assert settings == {**limits.validate_settings({}), "epochs": 1}
        assert len(settings) == 13
        assert wait_until_finished(c, started.json()["job_id"])["status"] == "done"

        refused = c.post("/train", json={"epochs": 99})
        assert refused.status_code == 400
        assert "Epochs" in refused.json()["detail"]

        # The GitHub Pages site may call the server, another site may not.
        allowed = c.get("/wake", headers={"Origin": "https://maxgerashenko.github.io"})
        assert allowed.headers.get("access-control-allow-origin") == "https://maxgerashenko.github.io"
        other = c.get("/wake", headers={"Origin": "https://example.com"})
        assert "access-control-allow-origin" not in other.headers
