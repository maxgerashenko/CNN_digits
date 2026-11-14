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

from server.app import Backend, create_app  # noqa: E402

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
    return {"test_accuracy": 0.975, "mistakes": 250, "test_images": 10000}


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
