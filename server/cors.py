"""Let the GitHub Pages site call the training server (CORS).

The page lives on https://maxgerashenko.github.io and the server lives on a
different address (the Hugging Face Space). Browsers block such cross-site
requests unless the server says the page's address is allowed. This module
adds that permission.

Use it in server/app.py, right after the app is created:

    from cors import add_cors   # or: from server.cors import add_cors

    app = FastAPI()
    add_cors(app)

Settings (environment variables, both optional):

    ALLOWED_ORIGINS   Comma-separated addresses that may call the server.
                      Default: https://maxgerashenko.github.io
                      Example: https://maxgerashenko.github.io,https://example.com
    ALLOW_LOCALHOST   "1" (default) also allows pages opened from this computer
                      (http://localhost:<any port>), for testing. "0" turns it off.

An origin is only scheme + host (+ port). It has no path, so the page at
https://maxgerashenko.github.io/CNN_digits/ has the origin
https://maxgerashenko.github.io.
"""

from __future__ import annotations

import os

from starlette.middleware.cors import CORSMiddleware

DEFAULT_ORIGINS = ("https://maxgerashenko.github.io",)

# Pages served from the developer's own computer, on any port.
LOCALHOST_REGEX = r"http://(localhost|127\.0\.0\.1)(:\d+)?"

# The page only reads and posts JSON, so these are all it needs.
ALLOWED_METHODS = ("GET", "POST", "OPTIONS")

# Lets the page read the file name when it downloads the trained model.
EXPOSED_HEADERS = ("Content-Disposition",)

# How long (seconds) the browser may remember the permission check.
PREFLIGHT_MAX_AGE = 3600


def _clean_origin(origin: str) -> str:
    """Trim spaces and a trailing slash; browsers send origins without one."""
    return origin.strip().rstrip("/")


def allowed_origins() -> list[str]:
    """The list of addresses allowed to call the server."""
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    origins = [_clean_origin(o) for o in raw.split(",") if _clean_origin(o)]
    if not origins:
        origins = list(DEFAULT_ORIGINS)
    if "*" in origins:
        raise ValueError(
            'ALLOWED_ORIGINS must list real addresses, not "*". '
            "Example: https://maxgerashenko.github.io"
        )
    for origin in origins:
        if not origin.startswith(("https://", "http://")) or "/" in origin.split("://", 1)[1]:
            raise ValueError(
                f"ALLOWED_ORIGINS has a bad address: {origin!r}. "
                "Use scheme and host only, like https://maxgerashenko.github.io"
            )
    return origins


def localhost_allowed() -> bool:
    return os.environ.get("ALLOW_LOCALHOST", "1").strip().lower() not in ("0", "false", "no", "")


def cors_settings() -> dict:
    """Keyword arguments for Starlette's CORSMiddleware."""
    return {
        "allow_origins": allowed_origins(),
        "allow_origin_regex": LOCALHOST_REGEX if localhost_allowed() else None,
        "allow_methods": list(ALLOWED_METHODS),
        "allow_headers": ["*"],
        "expose_headers": list(EXPOSED_HEADERS),
        "allow_credentials": False,  # the page sends no cookies or logins
        "max_age": PREFLIGHT_MAX_AGE,
    }


def add_cors(app):
    """Allow the GitHub Pages site to call this FastAPI or Starlette app.

    Call it once, right after the app is created. Returns the same app.
    """
    app.add_middleware(CORSMiddleware, **cors_settings())
    return app
