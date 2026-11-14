"""Safety limits and queue for the free training server (issue #8).

The free Hugging Face CPU is small, so this module keeps it from being
overloaded. It does four things:

1. validate_settings()  rejects settings outside the allowed ranges.
2. estimate()           says how long training will take, before it starts.
3. TrainingQueue        lets one visitor train at a time; the others wait in
                        a queue and can see their place.
4. Run.should_stop()    is the time limit: it turns True when a run has used
                        up its time, so training stops and keeps the model
                        trained so far.

It uses only the Python standard library, so it can be imported and tested
without TensorFlow.

Typical use from the web API (server/app.py):

    import limits

    queue = limits.TrainingQueue()              # once, at startup

    settings = limits.validate_settings(body)   # raises SettingsError
    info = limits.estimate(settings)            # {"seconds": 62, "text": ...}
    ticket = queue.join(settings, client_id)    # raises QueueFull

    queue.status(ticket.id)                     # {"state": "waiting",
                                                #  "position": 2, ...}

    with queue.turn(ticket.id) as run:          # in a worker thread: waits
                                                # for this ticket's turn
        model.train(settings, should_stop=run.should_stop)
"""

from __future__ import annotations

import math
import os
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator

# ---------------------------------------------------------------------------
# Limits that can be changed without touching the code (Space variables)
# ---------------------------------------------------------------------------


def _env_number(name: str, default: float) -> float:
    """Read a positive number from the environment, or use the default."""
    try:
        value = float(os.environ.get(name, ""))
    except ValueError:
        return default
    return value if math.isfinite(value) and value > 0 else default


#: Longest a single training run may take, in seconds.
TIME_LIMIT_SECONDS = _env_number("TRAIN_TIME_LIMIT_SECONDS", 600)

#: Most visitors that may wait at once. A safety cap, set high on purpose.
MAX_WAITING = int(_env_number("QUEUE_MAX_WAITING", 50))

#: A waiting visitor who has not asked for their status for this long has
#: closed the page, so they are removed and stop holding up the queue.
HEARTBEAT_SECONDS = _env_number("QUEUE_HEARTBEAT_SECONDS", 30)

#: Extra time after the time limit before a run that never reported back is
#: given up on, so one stuck run cannot block the queue forever.
STUCK_GRACE_SECONDS = _env_number("QUEUE_STUCK_GRACE_SECONDS", 120)

#: How long a finished ticket can still be looked up.
KEEP_FINISHED_SECONDS = 600

# ---------------------------------------------------------------------------
# 1. Settings: allowed ranges and defaults (the table in PLAN.md)
# ---------------------------------------------------------------------------

#: The 13 retraining settings. "choice" takes one of a list, "int" and
#: "float" take a range, "bool" takes true or false.
SETTINGS: dict[str, dict[str, Any]] = {
    # Basic panel
    "conv_blocks": {"label": "Conv blocks", "kind": "choice", "choices": [1, 2, 3], "default": 2},
    "conv_layers_per_block": {"label": "Conv layers per block", "kind": "choice", "choices": [1, 2, 3], "default": 2},
    "dense_layers": {"label": "Hidden dense layers", "kind": "choice", "choices": [0, 1, 2], "default": 1},
    "filters": {"label": "Filters in block 1", "kind": "choice", "choices": [4, 8, 16, 32], "default": 16},
    "kernel_size": {"label": "Kernel size", "kind": "choice", "choices": [3, 5], "default": 3},
    "dense_units": {"label": "Dense units", "kind": "choice", "choices": [32, 64, 128, 256], "default": 128},
    "dropout": {"label": "Dropout", "kind": "float", "min": 0.0, "max": 0.5, "default": 0.1},
    "learning_rate": {"label": "Learning rate", "kind": "choice", "choices": [0.0001, 0.001, 0.01], "default": 0.001},
    "epochs": {"label": "Epochs", "kind": "int", "min": 1, "max": 5, "default": 2},
    # Advanced panel
    "batch_norm": {"label": "Batch norm", "kind": "bool", "default": True},
    "batch_size": {"label": "Batch size", "kind": "choice", "choices": [32, 64, 128], "default": 32},
    "train_images": {"label": "Training images", "kind": "int", "min": 5000, "max": 60000, "default": 10000},
    "augmentation": {"label": "Data augmentation", "kind": "choice", "choices": [0, 0.05, 0.1], "default": 0.05},
}

DEFAULTS: dict[str, Any] = {name: spec["default"] for name, spec in SETTINGS.items()}


class SettingsError(ValueError):
    """The settings are not allowed. `errors` lists every problem found."""

    def __init__(self, errors: list[str]):
        super().__init__(" ".join(errors))
        self.errors = errors


def _is_number(value: Any) -> bool:
    """True for a real, finite number. True/False do not count as numbers."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _show(value: Any) -> str:
    """A short, safe way to show a rejected value in an error message."""
    text = repr(value)
    return text if len(text) <= 40 else text[:37] + "..."


def _check_one(spec: dict[str, Any], value: Any) -> tuple[Any, str | None]:
    """Check one value. Returns (clean value, None) or (None, error text)."""
    label, kind = spec["label"], spec["kind"]

    if kind == "bool":
        if isinstance(value, bool):
            return value, None
        return None, f"{label} must be true or false (got {_show(value)})."

    if kind == "choice":
        choices = spec["choices"]
        if _is_number(value):
            for choice in choices:
                if math.isclose(value, choice, rel_tol=1e-9, abs_tol=1e-12):
                    return choice, None
        allowed = ", ".join(str(c) for c in choices[:-1]) + f" or {choices[-1]}"
        return None, f"{label} must be {allowed} (got {_show(value)})."

    low, high = spec["min"], spec["max"]
    if kind == "int":
        if _is_number(value) and float(value).is_integer() and low <= value <= high:
            return int(value), None
        return None, f"{label} must be a whole number from {low:,} to {high:,} (got {_show(value)})."

    # kind == "float"
    if _is_number(value) and low <= value <= high:
        return float(value), None
    return None, f"{label} must be a number from {low:g} to {high:g} (got {_show(value)})."


def validate_settings(raw: Any) -> dict[str, Any]:
    """Check the visitor's settings and return a clean, complete copy.

    Settings that are left out get their default. Anything outside the
    allowed ranges, of the wrong type, or with an unknown name raises
    SettingsError, which lists every problem at once.
    """
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise SettingsError(["Settings must be an object, like {\"epochs\": 2}."])

    errors = [f"Unknown setting {_show(name)}." for name in raw if name not in SETTINGS]
    clean: dict[str, Any] = {}
    for name, spec in SETTINGS.items():
        if name not in raw:
            clean[name] = spec["default"]
            continue
        value, error = _check_one(spec, raw[name])
        if error:
            errors.append(error)
        else:
            clean[name] = value

    if errors:
        raise SettingsError(errors)
    return clean


def describe_limits() -> dict[str, Any]:
    """Everything the page needs to draw the controls and explain the limits."""
    return {
        "settings": {name: dict(spec) for name, spec in SETTINGS.items()},
        "time_limit_seconds": TIME_LIMIT_SECONDS,
        "max_waiting": MAX_WAITING,
        "heartbeat_seconds": HEARTBEAT_SECONDS,
    }


# ---------------------------------------------------------------------------
# 2. Time estimate
# ---------------------------------------------------------------------------

# The estimate is a fixed start-up time plus a cost for every image in every
# epoch. The cost of one image has four parts:
#   - the network's arithmetic (counted below in multiply-adds),
#   - a fixed cost per batch that grows with the number of layers,
#   - a small fixed cost per image,
#   - augmentation, when it is on.
# After every epoch, and once at the end, the 10,000 test images are checked.
#
# The numbers were measured with TensorFlow 2.21 on 2 CPU threads in a cloud
# machine, for ten different settings; the estimate was within about 40% of
# the measured time for each. The free Space also has 2 CPU cores, but it may
# be slower or faster. After one real run there, set ESTIMATE_SPEED_FACTOR on
# the Space: 2 means "this server is twice as slow as the estimate assumes".
SPEED_FACTOR = _env_number("ESTIMATE_SPEED_FACTOR", 1.0)

_STARTUP_SECONDS = 4.0                # load data, build the model, first batch
_US_PER_MILLION_MACS = (18.0, 23.0)   # arithmetic: (batch norm off, on)
_MS_PER_BATCH = 1.5                   # fixed cost of one batch...
_MS_PER_BATCH_LAYER = (0.7, 1.9)      # ...plus this per layer: (batch norm off, on)
_US_PER_IMAGE = 30.0                  # data handling
_US_PER_IMAGE_AUGMENT = 100.0         # rotate + zoom + shift
_TEST_IMAGES = 10_000
_TEST_COST_SHARE = 0.25               # a test image costs this share of a training image


def count_multiply_adds(settings: dict[str, Any]) -> int:
    """Multiply-adds for one 28x28 image going forward through the network."""
    size, channels, total = 28, 1, 0
    kernel = settings["kernel_size"]
    for block in range(settings["conv_blocks"]):
        filters = settings["filters"] * 2**block
        for _ in range(settings["conv_layers_per_block"]):
            total += size * size * kernel * kernel * channels * filters
            channels = filters
        size //= 2  # MaxPool halves the image: 28 -> 14 -> 7 -> 3
    width = size * size * channels  # after Flatten
    for _ in range(settings["dense_layers"]):
        total += width * settings["dense_units"]
        width = settings["dense_units"]
    return total + width * 10  # the output layer


def estimate_seconds(settings: dict[str, Any]) -> float:
    """Rough training time in seconds for settings from validate_settings()."""
    batch_norm = bool(settings["batch_norm"])
    layers = settings["conv_blocks"] * settings["conv_layers_per_block"] + settings["dense_layers"]

    # Microseconds for one training image, without augmentation.
    per_image = count_multiply_adds(settings) / 1e6 * _US_PER_MILLION_MACS[batch_norm]
    per_batch_ms = _MS_PER_BATCH + layers * _MS_PER_BATCH_LAYER[batch_norm]
    per_image += per_batch_ms * 1000 / settings["batch_size"] + _US_PER_IMAGE

    train_per_image = per_image + (_US_PER_IMAGE_AUGMENT if settings["augmentation"] else 0)
    epochs = settings["epochs"]

    microseconds = epochs * settings["train_images"] * train_per_image
    microseconds += (epochs + 1) * _TEST_IMAGES * per_image * _TEST_COST_SHARE
    return (_STARTUP_SECONDS + microseconds / 1e6) * SPEED_FACTOR


def format_duration(seconds: float) -> str:
    """Turn seconds into words a visitor can read: 'about 2 minutes'."""
    if seconds < 10:
        return "a few seconds"
    if seconds < 50:
        return f"about {int(round(seconds / 10) * 10)} seconds"
    minutes = max(1, round(seconds / 60))
    return "about 1 minute" if minutes == 1 else f"about {minutes} minutes"


def estimate(settings: dict[str, Any]) -> dict[str, Any]:
    """Time estimate to show before training starts.

    If the settings would take longer than the time limit, the run is still
    allowed: it stops at the limit and keeps the model trained so far.
    `over_time_limit` tells the page to warn the visitor about that.
    """
    seconds = estimate_seconds(settings)
    over = seconds > TIME_LIMIT_SECONDS
    return {
        "seconds": round(seconds),
        "text": format_duration(min(seconds, TIME_LIMIT_SECONDS)),
        "time_limit_seconds": TIME_LIMIT_SECONDS,
        "over_time_limit": over,
    }


# ---------------------------------------------------------------------------
# 3. Queue: one training run at a time
# ---------------------------------------------------------------------------

WAITING = "waiting"      # in the queue
RUNNING = "running"      # training now
DONE = "done"            # finished normally (also when stopped by the time limit)
FAILED = "failed"        # training raised an error
CANCELLED = "cancelled"  # the visitor left on purpose
EXPIRED = "expired"      # the visitor stopped asking for status while waiting
TIMED_OUT = "timed_out"  # the run never reported back and was given up on

_ACTIVE = (WAITING, RUNNING)


class QueueFull(RuntimeError):
    """Too many visitors are waiting already. Ask them to try again later."""


class UnknownTicket(KeyError):
    """No ticket with this id (never existed, or finished long ago)."""


class TicketClosed(RuntimeError):
    """The ticket cannot start: it was cancelled, expired or already ran."""


@dataclass
class Ticket:
    """One visitor's place in the queue."""

    id: str
    settings: dict[str, Any]
    estimated_seconds: float
    client_id: str | None
    created_at: float
    last_seen: float
    state: str = WAITING
    started_at: float | None = None
    finished_at: float | None = None
    stop_reason: str | None = None  # "time_limit" or "cancelled"
    _cancel: threading.Event = field(default_factory=threading.Event, repr=False)


class Run:
    """Handed to the ticket whose turn it is. Carries the time limit."""

    def __init__(self, ticket: Ticket, time_limit: float, clock: Callable[[], float]):
        self.ticket_id = ticket.id
        self.settings = ticket.settings
        self.time_limit = time_limit
        self._ticket = ticket
        self._clock = clock

    def seconds_left(self) -> float:
        """Seconds until the time limit (0 when it has passed)."""
        return max(0.0, self._ticket.started_at + self.time_limit - self._clock())

    def should_stop(self) -> bool:
        """True when training must stop now. Check it after every batch."""
        ticket = self._ticket
        if ticket._cancel.is_set():
            ticket.stop_reason = ticket.stop_reason or "cancelled"
            return True
        if self.seconds_left() <= 0:
            ticket.stop_reason = ticket.stop_reason or "time_limit"
            return True
        return False

    @property
    def stop_reason(self) -> str | None:
        """Why should_stop() said yes: 'time_limit', 'cancelled' or None."""
        return self._ticket.stop_reason


class TrainingQueue:
    """First come, first served; one run at a time. Safe to use from threads.

    Make one for the whole server. `clock` is only for tests.
    """

    def __init__(
        self,
        time_limit: float | None = None,
        max_waiting: int | None = None,
        heartbeat: float | None = None,
        stuck_grace: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.time_limit = TIME_LIMIT_SECONDS if time_limit is None else time_limit
        self.max_waiting = MAX_WAITING if max_waiting is None else max_waiting
        self.heartbeat = HEARTBEAT_SECONDS if heartbeat is None else heartbeat
        self.stuck_grace = STUCK_GRACE_SECONDS if stuck_grace is None else stuck_grace
        self._clock = clock
        self._lock = threading.Lock()
        self._tickets: dict[str, Ticket] = {}
        self._waiting: list[str] = []  # ticket ids, first in line first
        self._running: str | None = None

    # -- the visitor's side -------------------------------------------------

    def join(self, settings: dict[str, Any], client_id: str | None = None) -> Ticket:
        """Add a visitor to the end of the queue.

        `settings` must come from validate_settings(). Pass a `client_id`
        (any text that stays the same for one visitor) so a double click
        does not take two places: the visitor gets their existing ticket.
        Raises QueueFull when `max_waiting` visitors are waiting already.
        """
        with self._lock:
            now = self._tidy()
            if client_id is not None:
                for ticket in self._tickets.values():
                    if ticket.client_id == client_id and ticket.state in _ACTIVE:
                        ticket.last_seen = now
                        return ticket
            if len(self._waiting) >= self.max_waiting:
                raise QueueFull(
                    f"{len(self._waiting)} people are already waiting to train. Please try again in a few minutes."
                )
            ticket = Ticket(
                id=uuid.uuid4().hex,
                settings=settings,
                estimated_seconds=min(estimate_seconds(settings), self.time_limit),
                client_id=client_id,
                created_at=now,
                last_seen=now,
            )
            self._tickets[ticket.id] = ticket
            self._waiting.append(ticket.id)
            return ticket

    def status(self, ticket_id: str) -> dict[str, Any]:
        """Where this ticket is now. The page should ask every few seconds.

        Asking also tells the queue the visitor is still there. A waiting
        visitor who stops asking for `heartbeat` seconds loses their place.

        `position` is 1 for the next to train, 2 for the one after, and 0
        once the ticket is running or finished. `estimated_wait_seconds` is
        the wait until this ticket's own training starts.
        """
        with self._lock:
            now = self._tidy()
            ticket = self._get(ticket_id)
            if ticket.state == WAITING:
                ticket.last_seen = now
            return self._describe(ticket, now)

    def cancel(self, ticket_id: str) -> None:
        """The visitor leaves. A waiting ticket is removed at once; a running
        one is told to stop (should_stop() turns True) and frees the server
        as soon as training notices."""
        with self._lock:
            now = self._tidy()
            ticket = self._get(ticket_id)
            if ticket.state == WAITING:
                self._waiting.remove(ticket.id)
                self._close(ticket, CANCELLED, now)
            elif ticket.state == RUNNING:
                ticket._cancel.set()

    def snapshot(self) -> dict[str, Any]:
        """A summary for a health page: is someone training, how many wait."""
        with self._lock:
            self._tidy()
            return {"running": self._running is not None, "waiting": len(self._waiting)}

    # -- the server's side --------------------------------------------------

    def try_start(self, ticket_id: str, keep_alive: bool = False) -> Run | None:
        """Start this ticket if it is first in line and the server is free.

        Returns a Run to train with, or None when it is not this ticket's
        turn yet (call again in a second). When training ends, always call
        finish(). Raises TicketClosed if the ticket was cancelled or expired.

        By default this does not count as a heartbeat, so a visitor who
        stops asking for status() still loses their place. Pass
        keep_alive=True only when the visitor's connection is held open
        while they wait (a streaming reply), and call cancel() when that
        connection drops.
        """
        with self._lock:
            now = self._tidy()
            ticket = self._get(ticket_id)
            if ticket.state != WAITING:
                raise TicketClosed(f"Ticket is {ticket.state}, so it cannot start.")
            if keep_alive:
                ticket.last_seen = now
            if self._running is not None or self._waiting[0] != ticket.id:
                return None
            self._waiting.pop(0)
            self._running = ticket.id
            ticket.state = RUNNING
            ticket.started_at = now
            return Run(ticket, self.time_limit, self._clock)

    def finish(self, ticket_id: str, ok: bool = True) -> None:
        """Training ended (ok=False if it crashed). Lets the next one start."""
        with self._lock:
            now = self._tidy()
            ticket = self._tickets.get(ticket_id)
            if ticket is None or ticket.state != RUNNING:
                return  # already closed, for example by the stuck-run check
            if ticket._cancel.is_set():
                state = CANCELLED
            else:
                state = DONE if ok else FAILED
            self._close(ticket, state, now)
            self._running = None

    @contextmanager
    def turn(self, ticket_id: str, poll_seconds: float = 0.5, keep_alive: bool = False) -> Iterator[Run]:
        """Wait for this ticket's turn, run the block, then free the server.

            with queue.turn(ticket.id) as run:
                train(run.settings, should_stop=run.should_stop)

        The server is freed even if the block raises. If the ticket is
        cancelled or expires while waiting, this raises TicketClosed.
        `keep_alive` works as in try_start().
        """
        while True:
            run = self.try_start(ticket_id, keep_alive)
            if run is not None:
                break
            time.sleep(poll_seconds)
        try:
            yield run
        except BaseException:
            self.finish(ticket_id, ok=False)
            raise
        else:
            self.finish(ticket_id, ok=True)

    # -- inside (call only while holding the lock) --------------------------

    def _get(self, ticket_id: str) -> Ticket:
        ticket = self._tickets.get(ticket_id)
        if ticket is None:
            raise UnknownTicket(ticket_id)
        return ticket

    def _close(self, ticket: Ticket, state: str, now: float) -> None:
        ticket.state = state
        ticket.finished_at = now

    def _tidy(self) -> float:
        """Drop visitors who left, give up on a stuck run, forget old tickets."""
        now = self._clock()

        for ticket_id in list(self._waiting):
            ticket = self._tickets[ticket_id]
            if now - ticket.last_seen > self.heartbeat:
                self._waiting.remove(ticket_id)
                self._close(ticket, EXPIRED, now)

        if self._running is not None:
            ticket = self._tickets[self._running]
            if now - ticket.started_at > self.time_limit + self.stuck_grace:
                ticket._cancel.set()  # in case it is still alive somewhere
                ticket.stop_reason = ticket.stop_reason or "time_limit"
                self._close(ticket, TIMED_OUT, now)
                self._running = None

        for ticket_id, ticket in list(self._tickets.items()):
            if ticket.finished_at is not None and now - ticket.finished_at > KEEP_FINISHED_SECONDS:
                del self._tickets[ticket_id]

        return now

    def _describe(self, ticket: Ticket, now: float) -> dict[str, Any]:
        info: dict[str, Any] = {
            "ticket_id": ticket.id,
            "state": ticket.state,
            "position": 0,
            "ahead": 0,
            "estimated_wait_seconds": 0,
            "estimated_seconds": round(ticket.estimated_seconds),
            "stop_reason": ticket.stop_reason,
        }
        if ticket.state == WAITING:
            index = self._waiting.index(ticket.id)
            wait = 0.0
            if self._running is not None:
                running = self._tickets[self._running]
                wait += max(0.0, running.estimated_seconds - (now - running.started_at))
            for other_id in self._waiting[:index]:
                wait += self._tickets[other_id].estimated_seconds
            info["position"] = index + 1
            info["ahead"] = index + (1 if self._running is not None else 0)
            info["estimated_wait_seconds"] = round(wait)
        elif ticket.state == RUNNING:
            info["elapsed_seconds"] = round(now - ticket.started_at)
            info["seconds_left"] = round(max(0.0, ticket.started_at + self.time_limit - now))
        return info
