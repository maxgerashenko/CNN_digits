"""Tests for server/limits.py. Run with: pytest server/test_limits.py

They need only pytest, not TensorFlow, and take about a second.
"""

import threading

import pytest

import limits


class FakeClock:
    """A clock the tests move by hand, so nothing has to really wait."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def tick(self, seconds):
        self.now += seconds


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def queue(clock):
    return limits.TrainingQueue(time_limit=600, max_waiting=3, heartbeat=30, stuck_grace=120, clock=clock)


DEFAULTS = limits.validate_settings({})

# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------


def test_defaults_are_the_plan_values():
    assert DEFAULTS == {
        "conv_blocks": 2,
        "conv_layers_per_block": 2,
        "dense_layers": 1,
        "filters": 16,
        "kernel_size": 3,
        "dense_units": 128,
        "dropout": 0.1,
        "learning_rate": 0.001,
        "epochs": 2,
        "batch_norm": True,
        "batch_size": 32,
        "train_images": 10000,
        "augmentation": 0.05,
    }
    assert len(limits.SETTINGS) == 13
    assert limits.validate_settings(None) == DEFAULTS


def test_missing_settings_get_defaults():
    clean = limits.validate_settings({"epochs": 5})
    assert clean == {**DEFAULTS, "epochs": 5}


def test_largest_and_smallest_allowed_settings_pass():
    largest = {
        "conv_blocks": 3, "conv_layers_per_block": 3, "dense_layers": 2, "filters": 32,
        "kernel_size": 5, "dense_units": 256, "dropout": 0.5, "learning_rate": 0.01,
        "epochs": 5, "batch_norm": True, "batch_size": 128, "train_images": 60000,
        "augmentation": 0.1,
    }
    smallest = {
        "conv_blocks": 1, "conv_layers_per_block": 1, "dense_layers": 0, "filters": 4,
        "kernel_size": 3, "dense_units": 32, "dropout": 0, "learning_rate": 0.0001,
        "epochs": 1, "batch_norm": False, "batch_size": 32, "train_images": 5000,
        "augmentation": 0,
    }
    assert limits.validate_settings(largest) == largest
    assert limits.validate_settings(smallest) == smallest


@pytest.mark.parametrize(
    "name, value",
    [
        ("epochs", 21),  # epochs max 20
        ("epochs", 0),
        ("epochs", 2.5),
        ("epochs", 10**9),
        ("train_images", 60001),  # the issue: images max 60,000
        ("train_images", 4999),
        ("train_images", 1e12),
        ("conv_blocks", 4),
        ("conv_blocks", 0),
        ("conv_layers_per_block", 10),
        ("dense_layers", 3),
        ("dense_layers", -1),
        ("filters", 64),
        ("filters", 12),
        ("kernel_size", 7),
        ("kernel_size", 4),
        ("dense_units", 4096),
        ("dropout", 0.6),
        ("dropout", -0.1),
        ("learning_rate", 0.1),
        ("learning_rate", 0.002),
        ("batch_size", 1),
        ("batch_size", 100000),
        ("augmentation", 0.5),
    ],
)
def test_out_of_range_values_are_rejected(name, value):
    with pytest.raises(limits.SettingsError) as error:
        limits.validate_settings({name: value})
    assert len(error.value.errors) == 1
    assert limits.SETTINGS[name]["label"] in error.value.errors[0]


@pytest.mark.parametrize(
    "name, value",
    [
        ("epochs", "5"),
        ("epochs", None),
        ("epochs", True),  # True must not pass as the number 1
        ("epochs", [2]),
        ("epochs", float("nan")),
        ("train_images", float("inf")),
        ("dropout", "0.1"),
        ("dropout", float("nan")),
        ("conv_blocks", True),
        ("batch_norm", 1),
        ("batch_norm", "yes"),
        ("augmentation", False),
        ("filters", {"a": 1}),
    ],
)
def test_wrong_types_are_rejected(name, value):
    with pytest.raises(limits.SettingsError):
        limits.validate_settings({name: value})


def test_not_a_dict_is_rejected():
    for raw in ([], "epochs=2", 5):
        with pytest.raises(limits.SettingsError):
            limits.validate_settings(raw)


def test_unknown_setting_is_rejected():
    with pytest.raises(limits.SettingsError) as error:
        limits.validate_settings({"epochz": 2})
    assert "Unknown setting" in error.value.errors[0]


def test_all_problems_are_reported_at_once():
    with pytest.raises(limits.SettingsError) as error:
        limits.validate_settings({"epochs": 99, "train_images": 10**7, "filters": 5})
    assert len(error.value.errors) == 3
    assert "from 1 to 20" in str(error.value)
    assert "60,000" in str(error.value)


def test_long_bad_values_are_cut_in_the_message():
    with pytest.raises(limits.SettingsError) as error:
        limits.validate_settings({"epochs": "x" * 10000})
    assert len(error.value.errors[0]) < 200


def test_whole_numbers_sent_as_floats_are_accepted():
    clean = limits.validate_settings({"epochs": 3.0, "filters": 8.0, "train_images": 20000.0})
    assert clean["epochs"] == 3 and isinstance(clean["epochs"], int)
    assert clean["filters"] == 8 and isinstance(clean["filters"], int)
    assert clean["train_images"] == 20000 and isinstance(clean["train_images"], int)


def test_describe_limits_can_be_sent_as_json():
    import json

    info = json.loads(json.dumps(limits.describe_limits()))
    assert info["settings"]["epochs"] == {"label": "Epochs", "kind": "int", "min": 1, "max": 20, "default": 2}
    assert info["time_limit_seconds"] == limits.TIME_LIMIT_SECONDS


# --------------------------------------------------------------------------
# Time estimate
# --------------------------------------------------------------------------


def test_multiply_adds_for_the_notebook_model():
    # 28*28*9*(1*16 + 16*16) + 14*14*9*(16*32 + 32*32) + 7*7*32*128 + 128*10
    assert limits.count_multiply_adds(DEFAULTS) == 1_919_232 + 2_709_504 + 200_704 + 1_280


def test_default_estimate_is_short():
    info = limits.estimate(DEFAULTS)
    assert 5 <= info["seconds"] <= 120
    assert info["over_time_limit"] is False
    assert info["text"].startswith("about ")


@pytest.mark.parametrize(
    "change",
    [
        {"epochs": 5},
        {"train_images": 60000},
        {"conv_blocks": 3},
        {"conv_layers_per_block": 3},
        {"dense_layers": 2},
        {"filters": 32},
        {"kernel_size": 5},
        {"dense_units": 256},
    ],
)
def test_bigger_settings_take_longer(change):
    assert limits.estimate_seconds({**DEFAULTS, **change}) > limits.estimate_seconds(DEFAULTS)


def test_cheaper_settings_take_less_time():
    for change in ({"batch_norm": False}, {"batch_size": 128}, {"augmentation": 0}):
        assert limits.estimate_seconds({**DEFAULTS, **change}) < limits.estimate_seconds(DEFAULTS)


def test_every_allowed_combination_gets_an_estimate():
    import itertools

    names = ["conv_blocks", "conv_layers_per_block", "dense_layers", "filters", "kernel_size", "dense_units", "batch_norm", "batch_size", "augmentation"]
    options = [limits.SETTINGS[n].get("choices", [True, False]) for n in names]
    for combo in itertools.product(*options):
        settings = limits.validate_settings({**dict(zip(names, combo)), "epochs": 1, "train_images": 5000})
        assert 0 < limits.estimate_seconds(settings) < 3600


def test_largest_settings_are_flagged_as_over_the_time_limit():
    largest = limits.validate_settings(
        {"conv_blocks": 3, "conv_layers_per_block": 3, "dense_layers": 2, "filters": 32, "kernel_size": 5,
         "dense_units": 256, "epochs": 5, "train_images": 60000, "augmentation": 0.1}
    )
    info = limits.estimate(largest)
    assert info["over_time_limit"] is True
    assert info["seconds"] > limits.TIME_LIMIT_SECONDS
    assert info["text"] == "about 10 minutes"  # never promises longer than the limit


def test_format_duration():
    assert limits.format_duration(3) == "a few seconds"
    assert limits.format_duration(19) == "about 20 seconds"
    assert limits.format_duration(55) == "about 1 minute"
    assert limits.format_duration(84) == "about 1 minute"
    assert limits.format_duration(200) == "about 3 minutes"


# --------------------------------------------------------------------------
# Queue
# --------------------------------------------------------------------------


def test_one_visitor_starts_right_away(queue):
    ticket = queue.join(DEFAULTS)
    assert queue.status(ticket.id)["state"] == "waiting"
    assert queue.status(ticket.id)["position"] == 1
    assert queue.status(ticket.id)["ahead"] == 0
    run = queue.try_start(ticket.id)
    assert run is not None and run.settings == DEFAULTS
    status = queue.status(ticket.id)
    assert status["state"] == "running" and status["position"] == 0
    queue.finish(ticket.id)
    assert queue.status(ticket.id)["state"] == "done"
    assert queue.snapshot() == {"running": False, "waiting": 0}


def test_only_one_run_at_a_time_and_others_see_their_place(queue):
    a, b, c = (queue.join(DEFAULTS) for _ in range(3))
    assert queue.try_start(b.id) is None  # b is not first in line
    assert queue.try_start(a.id) is not None
    assert queue.try_start(b.id) is None  # a is still training
    assert queue.try_start(c.id) is None

    assert queue.status(b.id)["position"] == 1 and queue.status(b.id)["ahead"] == 1
    assert queue.status(c.id)["position"] == 2 and queue.status(c.id)["ahead"] == 2
    assert queue.snapshot() == {"running": True, "waiting": 2}

    queue.finish(a.id)
    assert queue.try_start(c.id) is None  # first come, first served
    assert queue.try_start(b.id) is not None
    assert queue.status(c.id)["position"] == 1
    queue.finish(b.id)
    assert queue.try_start(c.id) is not None


def test_estimated_wait_counts_the_run_and_the_people_ahead(queue, clock):
    one = limits.estimate_seconds(DEFAULTS)
    a, b, c = (queue.join(DEFAULTS) for _ in range(3))
    queue.try_start(a.id)
    assert queue.status(b.id)["estimated_wait_seconds"] == round(one)
    assert queue.status(c.id)["estimated_wait_seconds"] == round(2 * one)
    clock.tick(5)
    assert queue.status(b.id)["estimated_wait_seconds"] == round(one - 5)
    clock.tick(25)  # the run is taking longer than estimated: never negative
    assert queue.status(b.id)["estimated_wait_seconds"] == 0
    assert queue.status(c.id)["estimated_wait_seconds"] == round(one)


def test_wait_estimate_never_counts_more_than_the_time_limit_per_run(queue):
    huge = limits.validate_settings(
        {"conv_blocks": 3, "conv_layers_per_block": 3, "filters": 32, "kernel_size": 5, "epochs": 5, "train_images": 60000}
    )
    assert limits.estimate_seconds(huge) > 600
    a = queue.join(huge)
    b = queue.join(DEFAULTS)
    queue.try_start(a.id)
    assert queue.status(b.id)["estimated_wait_seconds"] == 600


def test_same_visitor_gets_the_same_ticket(queue):
    first = queue.join(DEFAULTS, client_id="visitor-1")
    again = queue.join(DEFAULTS, client_id="visitor-1")
    other = queue.join(DEFAULTS, client_id="visitor-2")
    assert again is first and other is not first
    assert queue.snapshot()["waiting"] == 2
    queue.try_start(first.id)
    assert queue.join(DEFAULTS, client_id="visitor-1") is first  # still training
    queue.finish(first.id)
    assert queue.join(DEFAULTS, client_id="visitor-1") is not first  # may train again


def test_queue_has_a_safety_cap(queue):
    tickets = [queue.join(DEFAULTS) for _ in range(3)]
    with pytest.raises(limits.QueueFull):
        queue.join(DEFAULTS)
    queue.try_start(tickets[0].id)  # one leaves the line to train
    queue.join(DEFAULTS)  # so there is room again


def test_cancel_while_waiting_moves_everyone_up(queue):
    a, b, c = (queue.join(DEFAULTS) for _ in range(3))
    queue.cancel(b.id)
    assert queue.status(b.id)["state"] == "cancelled"
    assert queue.status(c.id)["position"] == 2
    with pytest.raises(limits.TicketClosed):
        queue.try_start(b.id)
    queue.try_start(a.id)
    assert queue.status(c.id)["position"] == 1


def test_cancel_while_running_stops_training(queue):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    run = queue.try_start(a.id)
    assert run.should_stop() is False
    queue.cancel(a.id)
    assert run.should_stop() is True and run.stop_reason == "cancelled"
    assert queue.try_start(b.id) is None  # freed only when training really ends
    queue.finish(a.id)
    assert queue.status(a.id)["state"] == "cancelled"
    assert queue.try_start(b.id) is not None


def test_visitor_who_closed_the_page_loses_their_place(queue, clock):
    a, b, c = (queue.join(DEFAULTS) for _ in range(3))
    queue.try_start(a.id)
    for _ in range(4):  # c keeps asking, b went away
        clock.tick(10)
        queue.status(c.id)
    assert queue.status(b.id)["state"] == "expired"
    assert queue.status(c.id)["position"] == 1
    queue.finish(a.id)
    assert queue.try_start(c.id) is not None


def test_a_gone_visitor_at_the_front_does_not_block_the_queue(queue, clock):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    clock.tick(20)
    queue.status(b.id)
    clock.tick(20)  # a has now been silent for 40 seconds
    assert queue.try_start(b.id) is not None


def test_a_worker_waiting_for_the_turn_does_not_keep_a_gone_visitor_alive(queue, clock):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    queue.try_start(a.id)
    for _ in range(3):
        clock.tick(10)
        assert queue.try_start(b.id) is None  # the server asks, the visitor does not
    clock.tick(10)
    with pytest.raises(limits.TicketClosed):
        queue.try_start(b.id)
    assert queue.status(b.id)["state"] == "expired"


def test_keep_alive_is_for_open_connections(queue, clock):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    queue.try_start(a.id)
    for _ in range(10):
        clock.tick(10)
        assert queue.try_start(b.id, keep_alive=True) is None
    assert queue.status(b.id)["state"] == "waiting"


def test_polling_keeps_a_waiting_visitor_alive_for_a_long_time(queue, clock):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    queue.try_start(a.id)
    for _ in range(50):
        clock.tick(10)
        assert queue.status(b.id)["state"] == "waiting"


def test_time_limit_stops_the_run(queue, clock):
    ticket = queue.join(DEFAULTS)
    run = queue.try_start(ticket.id)
    assert run.seconds_left() == 600
    clock.tick(599)
    assert run.should_stop() is False and run.stop_reason is None
    assert queue.status(ticket.id)["seconds_left"] == 1
    clock.tick(1)
    assert run.should_stop() is True and run.stop_reason == "time_limit"
    queue.finish(ticket.id)
    status = queue.status(ticket.id)
    assert status["state"] == "done" and status["stop_reason"] == "time_limit"


def test_a_stuck_run_is_given_up_on(queue, clock):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    run = queue.try_start(a.id)
    for _ in range(72):  # 720 seconds: the limit plus the grace time
        clock.tick(10)
        assert queue.status(b.id)["position"] == 1  # b keeps waiting
        assert queue.try_start(b.id) is None
    clock.tick(10)
    assert queue.try_start(b.id) is not None
    assert queue.status(a.id)["state"] == "timed_out"
    assert run.should_stop() is True
    queue.finish(a.id)  # a late finish must not free b's turn
    assert queue.status(b.id)["state"] == "running"
    assert queue.snapshot()["running"] is True


def test_failed_run_frees_the_server(queue):
    a, b = queue.join(DEFAULTS), queue.join(DEFAULTS)
    with pytest.raises(ZeroDivisionError):
        with queue.turn(a.id):
            1 / 0
    assert queue.status(a.id)["state"] == "failed"
    with queue.turn(b.id) as run:
        assert run.ticket_id == b.id
    assert queue.status(b.id)["state"] == "done"


def test_unknown_and_old_tickets(queue, clock):
    with pytest.raises(limits.UnknownTicket):
        queue.status("nope")
    ticket = queue.join(DEFAULTS)
    queue.try_start(ticket.id)
    queue.finish(ticket.id)
    clock.tick(limits.KEEP_FINISHED_SECONDS - 1)
    assert queue.status(ticket.id)["state"] == "done"
    clock.tick(2)
    with pytest.raises(limits.UnknownTicket):
        queue.status(ticket.id)
    queue.finish(ticket.id)  # finishing a forgotten ticket is harmless


def test_many_threads_never_train_at_the_same_time():
    queue = limits.TrainingQueue(time_limit=600, max_waiting=50, heartbeat=30)
    training_now, most_at_once, order = [], [0], []
    guard = threading.Lock()

    def visitor(ticket):
        with queue.turn(ticket.id, poll_seconds=0.001, keep_alive=True):
            with guard:
                training_now.append(ticket.id)
                most_at_once[0] = max(most_at_once[0], len(training_now))
                order.append(ticket.id)
            threading.Event().wait(0.005)  # "train"
            with guard:
                training_now.remove(ticket.id)

    tickets = [queue.join(DEFAULTS) for _ in range(20)]
    threads = [threading.Thread(target=visitor, args=(t,)) for t in tickets]
    for thread in reversed(threads):  # start in the wrong order on purpose
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert most_at_once[0] == 1
    assert order == [t.id for t in tickets]  # first come, first served
    assert queue.snapshot() == {"running": False, "waiting": 0}
