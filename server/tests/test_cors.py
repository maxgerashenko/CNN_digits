"""Tests for server/cors.py. Run from the repo root: python -m pytest server/tests/test_cors.py"""

import sys
from pathlib import Path

import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cors  # noqa: E402

PAGES = "https://maxgerashenko.github.io"


def make_client():
    async def wake(request):
        return JSONResponse({"status": "ok"})

    async def train(request):
        return JSONResponse({"started": True})

    app = Starlette(routes=[Route("/wake", wake), Route("/train", train, methods=["POST"])])
    cors.add_cors(app)
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("ALLOW_LOCALHOST", raising=False)


def test_github_pages_is_allowed_by_default():
    response = make_client().get("/wake", headers={"Origin": PAGES})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == PAGES


def test_other_sites_are_not_allowed():
    response = make_client().get("/wake", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_lookalike_origins_are_not_allowed():
    client = make_client()
    for origin in (
        "https://maxgerashenko.github.io.evil.example",
        "http://maxgerashenko.github.io",
        "http://localhost.evil.example",
        "https://localhost:3000",
    ):
        response = client.get("/wake", headers={"Origin": origin})
        assert "access-control-allow-origin" not in response.headers, origin


def test_preflight_for_json_post_passes():
    response = make_client().options(
        "/train",
        headers={
            "Origin": PAGES,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == PAGES
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()


def test_preflight_from_other_site_fails():
    response = make_client().options(
        "/train",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_localhost_is_allowed_by_default_and_can_be_turned_off(monkeypatch):
    for origin in ("http://localhost:8000", "http://127.0.0.1:5500", "http://localhost"):
        response = make_client().get("/wake", headers={"Origin": origin})
        assert response.headers["access-control-allow-origin"] == origin

    monkeypatch.setenv("ALLOW_LOCALHOST", "0")
    response = make_client().get("/wake", headers={"Origin": "http://localhost:8000"})
    assert "access-control-allow-origin" not in response.headers


def test_allowed_origins_can_be_changed(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", " https://digits.example.com/ , https://other.example ")
    client = make_client()
    for origin in ("https://digits.example.com", "https://other.example"):
        response = client.get("/wake", headers={"Origin": origin})
        assert response.headers["access-control-allow-origin"] == origin
    response = client.get("/wake", headers={"Origin": PAGES})
    assert "access-control-allow-origin" not in response.headers


def test_empty_setting_falls_back_to_github_pages(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", " , ")
    assert cors.allowed_origins() == [PAGES]


@pytest.mark.parametrize(
    "value",
    ["*", "maxgerashenko.github.io", "https://maxgerashenko.github.io/CNN_digits"],
)
def test_bad_settings_are_rejected(monkeypatch, value):
    monkeypatch.setenv("ALLOWED_ORIGINS", value)
    with pytest.raises(ValueError):
        cors.allowed_origins()


def test_model_file_name_header_is_readable_by_the_page():
    response = make_client().get("/wake", headers={"Origin": PAGES})
    assert "Content-Disposition" in response.headers["access-control-expose-headers"]
