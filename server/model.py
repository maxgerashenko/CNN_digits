"""Build and train the digit CNN from the 13 retraining settings.

This is the notebook's model (notebook/cnn_digits.py) turned into functions.
With DEFAULT_SETTINGS the layers are the same as in the notebook. The settings
and their allowed values come from the "Retraining settings" table in PLAN.md.

Main functions:
    validate_settings(settings)  -> full settings dict, or ValueError
    build_model(settings)        -> compiled Keras model, not trained
    train(settings, progress_callback=None, should_stop=None)
                                 -> trained model
    train_with_results(settings, progress_callback=None, should_stop=None)
                                 -> (model, results)
    evaluate(model)              -> test accuracy and mistakes out of 10,000
"""

import contextlib
import functools
import time
from pathlib import Path

import numpy as np
import tensorflow as tf

# Fixed values taken from the notebook (not settings).
IMAGE_SIZE = 28
IMAGE_CHANNELS = 1
OUTPUT_UNITS = 10
POOLING_SIZE = 2
PADDING = "same"
SEED = 42
AUGMENTATION_LAYER_NAME = "data_augmentation"

# The 13 settings. Defaults are the notebook's values, except epochs and
# train_images, which are smaller so training takes about a minute (PLAN.md).
DEFAULT_SETTINGS = {
    # Basic
    "conv_blocks": 2,            # 1, 2, 3 (each block ends with MaxPool)
    "conv_layers_per_block": 2,  # 1, 2, 3
    "dense_layers": 1,           # 0, 1, 2 hidden dense layers
    "filters": 16,               # filters in block 1; each next block doubles
    "kernel_size": 3,            # 3 or 5
    "dense_units": 128,          # size of each hidden dense layer
    "dropout": 0.1,              # 0 to 0.5
    "learning_rate": 0.001,      # 0.0001, 0.001, 0.01
    "epochs": 2,                 # 1 to 20
    # Advanced
    "batch_norm": True,          # on / off
    "batch_size": 32,            # 32, 64, 128
    "train_images": 10000,       # 5,000 to 60,000
    "augmentation": 0.05,        # 0 (off), 0.05, 0.1
}

# Settings with a fixed list of choices.
SETTING_CHOICES = {
    "conv_blocks": (1, 2, 3),
    "conv_layers_per_block": (1, 2, 3),
    "dense_layers": (0, 1, 2),
    "filters": (4, 8, 16, 32),
    "kernel_size": (3, 5),
    "dense_units": (32, 64, 128, 256),
    "learning_rate": (0.0001, 0.001, 0.01),
    "batch_size": (32, 64, 128),
    "augmentation": (0, 0.05, 0.1),
}

# Training ends before the last epoch when the validation loss has not
# improved for this many epochs in a row (the notebook's value).
EARLY_STOPPING_PATIENCE = 3

# How many training images the gradient sizes are measured on after each epoch.
GRADIENT_BATCH_SIZE = 256

# Settings with a range (min, max), both ends allowed.
SETTING_RANGES = {
    "dropout": (0.0, 0.5),
    "epochs": (1, 20),
    "train_images": (5000, 60000),
}

_INT_SETTINGS = (
    "conv_blocks", "conv_layers_per_block", "dense_layers", "filters",
    "kernel_size", "dense_units", "epochs", "batch_size", "train_images",
)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_settings(settings=None):
    """Fill in missing settings with defaults and check every value.

    Returns a new dict with all 13 settings. Raises ValueError with a clear
    message for an unknown setting or a value that is not allowed.
    """
    settings = dict(settings or {})
    unknown = sorted(set(settings) - set(DEFAULT_SETTINGS))
    if unknown:
        raise ValueError(f"Unknown settings: {', '.join(unknown)}")

    result = {**DEFAULT_SETTINGS, **settings}

    if not isinstance(result["batch_norm"], bool):
        raise ValueError("batch_norm must be true or false")

    for name, value in result.items():
        if name == "batch_norm":
            continue
        if not _is_number(value) or not np.isfinite(value):
            raise ValueError(f"{name} must be a number, got {value!r}")
        if name in _INT_SETTINGS:
            if value != int(value):
                raise ValueError(f"{name} must be a whole number, got {value!r}")
            result[name] = int(value)
        else:
            result[name] = float(value)

    for name, choices in SETTING_CHOICES.items():
        if not any(np.isclose(result[name], choice) for choice in choices):
            raise ValueError(
                f"{name} must be one of {list(choices)}, got {result[name]!r}"
            )

    for name, (low, high) in SETTING_RANGES.items():
        if not low <= result[name] <= high:
            raise ValueError(
                f"{name} must be between {low} and {high}, got {result[name]!r}"
            )

    return result


def _conv_block_layers(filters, kernel_size, batch_norm):
    """Conv -> BatchNorm -> ReLU, as in the notebook's conv_bn_relu helper.

    With batch norm off, the conv layer gets a bias instead.
    """
    layers = [
        tf.keras.layers.Conv2D(
            filters=filters,
            kernel_size=kernel_size,
            strides=1,
            padding=PADDING,
            activation=None,
            use_bias=not batch_norm,
            kernel_initializer=tf.keras.initializers.HeNormal(),
        )
    ]
    if batch_norm:
        layers.append(tf.keras.layers.BatchNormalization())
    layers.append(tf.keras.layers.Activation("relu"))
    return layers


def _dense_block_layers(units, batch_norm):
    """Dense -> BatchNorm -> ReLU, as in the notebook's head."""
    layers = [
        tf.keras.layers.Dense(
            units,
            activation=None,
            use_bias=not batch_norm,
            kernel_initializer=tf.keras.initializers.VarianceScaling(),
        )
    ]
    if batch_norm:
        layers.append(tf.keras.layers.BatchNormalization())
    layers.append(tf.keras.layers.Activation("relu"))
    return layers


def build_model(settings=None):
    """Build and compile the model for the given settings (not trained yet).

    Layer order, same as the notebook:
        Input 28x28x1
        data augmentation (only if augmentation > 0; does nothing at inference)
        conv_blocks x [ conv_layers_per_block x (Conv, BatchNorm, ReLU), MaxPool ]
        Flatten
        dense_layers x [ Dense, BatchNorm, ReLU, Dropout ]
        Dense 10 softmax

    Filters double in each next block (16, 32, 64 for the default 16).
    Dropout layers are left out when dropout is 0. With 0 hidden dense layers,
    one Dropout sits between Flatten and the output layer.
    """
    s = validate_settings(settings)
    layers = [
        tf.keras.layers.Input(shape=(IMAGE_SIZE, IMAGE_SIZE, IMAGE_CHANNELS))
    ]

    if s["augmentation"] > 0:
        amount = s["augmentation"]
        layers.append(
            tf.keras.Sequential(
                [
                    tf.keras.layers.RandomRotation(amount),
                    tf.keras.layers.RandomZoom(amount),
                    tf.keras.layers.RandomTranslation(amount, amount),
                ],
                name=AUGMENTATION_LAYER_NAME,
            )
        )

    for block in range(s["conv_blocks"]):
        filters = s["filters"] * 2 ** block
        for _ in range(s["conv_layers_per_block"]):
            layers += _conv_block_layers(filters, s["kernel_size"], s["batch_norm"])
        layers.append(
            tf.keras.layers.MaxPooling2D(
                pool_size=(POOLING_SIZE, POOLING_SIZE),
                strides=(POOLING_SIZE, POOLING_SIZE),
            )
        )

    layers.append(tf.keras.layers.Flatten())

    for _ in range(s["dense_layers"]):
        layers += _dense_block_layers(s["dense_units"], s["batch_norm"])
        if s["dropout"] > 0:
            layers.append(tf.keras.layers.Dropout(s["dropout"]))
    if s["dense_layers"] == 0 and s["dropout"] > 0:
        layers.append(tf.keras.layers.Dropout(s["dropout"]))

    layers.append(tf.keras.layers.Dense(OUTPUT_UNITS, activation="softmax"))

    model = tf.keras.Sequential(layers)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=s["learning_rate"]),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


@contextlib.contextmanager
def _one_download_at_a_time():
    """Let one process at a time fetch MNIST.

    Keras downloads the file on first use. Two training processes that start
    together would both write it, and one would read a half-written file.
    """
    try:
        import fcntl
    except ImportError:  # not on Windows; there the server trains one run at a time
        yield
        return
    folder = Path.home() / ".keras"
    folder.mkdir(parents=True, exist_ok=True)
    with open(folder / "mnist.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


@functools.lru_cache(maxsize=1)
def load_data():
    """Load MNIST once and format it like the notebook.

    Returns (train_images, train_labels), (test_images, test_labels) with
    images as float32 in [0, 1] and shape (N, 28, 28, 1).
    """
    with _one_download_at_a_time():
        (train_image, train_label), (test_image, test_label) = (
            tf.keras.datasets.mnist.load_data()
        )
    train = (train_image / 255.0).astype("float32")[..., np.newaxis]
    test = (test_image / 255.0).astype("float32")[..., np.newaxis]
    return (train, train_label), (test, test_label)


def evaluate(model):
    """Check the model on the 10,000 MNIST test images.

    Returns {"test_accuracy": 0.9958, "mistakes": 42, "test_images": 10000,
             "confusion": [[...10 numbers...], ...10 rows...]}.

    "confusion" counts the test images: row = the digit in the image,
    column = the digit the model read. The diagonal holds the right answers.
    """
    _, (test_images, test_labels) = load_data()
    probabilities = model.predict(test_images, batch_size=256, verbose=0)
    predictions = np.argmax(probabilities, axis=1)
    mistakes = int(np.sum(predictions != test_labels))
    total = int(len(test_labels))
    confusion = np.zeros((OUTPUT_UNITS, OUTPUT_UNITS), dtype=np.int64)
    np.add.at(confusion, (np.asarray(test_labels).astype(np.int64).reshape(-1), predictions), 1)
    return {
        "test_accuracy": (total - mistakes) / total,
        "mistakes": mistakes,
        "test_images": total,
        "confusion": confusion.tolist(),
    }


def gradient_sizes(model, images, labels):
    """Measure how large the loss gradient is for each layer that has weights.

    Returns {"conv 1": 0.12, "conv 2": 0.08, "dense 1": 0.05, "output": 0.2}:
    the length (L2 norm) of the gradient of the loss with respect to the
    layer's kernel, on the given images. Convolution and dense layers are
    numbered from the input; the last dense layer is "output".

    The model is used as at inference: no dropout, no augmentation.
    """
    named = []
    conv = dense = 0
    for layer in model.layers:
        if isinstance(layer, tf.keras.layers.Conv2D):
            conv += 1
            named.append((f"conv {conv}", layer.kernel))
        elif isinstance(layer, tf.keras.layers.Dense):
            dense += 1
            named.append((f"dense {dense}", layer.kernel))
    if dense:
        named[-1] = ("output", named[-1][1])

    with tf.GradientTape() as tape:
        probabilities = model(tf.convert_to_tensor(images), training=False)
        loss = tf.reduce_mean(
            tf.keras.losses.sparse_categorical_crossentropy(labels, probabilities)
        )
    gradients = tape.gradient(loss, [kernel for _, kernel in named])
    return {
        name: float(tf.norm(gradient))
        for (name, _), gradient in zip(named, gradients)
        if gradient is not None
    }


class _ProgressCallback(tf.keras.callbacks.Callback):
    """Calls progress_callback with one plain dict after each epoch."""

    def __init__(self, progress_callback, epochs, should_stop=None, gradient_batch=None):
        super().__init__()
        self.progress_callback = progress_callback
        self.epochs = epochs
        self.should_stop = should_stop
        # (images, labels) on which the gradient sizes are measured after each epoch.
        self.gradient_batch = gradient_batch
        self.stopped_early = False
        self.started = None

    def on_train_batch_end(self, batch, logs=None):
        if self.should_stop is not None and self.should_stop():
            self.stopped_early = True
            self.model.stop_training = True

    def on_train_begin(self, logs=None):
        self.started = time.perf_counter()

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        progress = {
            "epoch": epoch + 1,
            "epochs": self.epochs,
            "loss": float(logs.get("loss", float("nan"))),
            "accuracy": float(logs.get("accuracy", float("nan"))),
            "val_loss": float(logs.get("val_loss", float("nan"))),
            "val_accuracy": float(logs.get("val_accuracy", float("nan"))),
        }
        if self.gradient_batch is not None:
            progress["gradients"] = gradient_sizes(self.model, *self.gradient_batch)
        progress["seconds"] = time.perf_counter() - self.started
        self.progress_callback(progress)


def train_with_results(settings=None, progress_callback=None, should_stop=None):
    """Build the model, train it, and test it.

    should_stop, if given, is a function with no arguments that is checked
    after every batch. When it returns True (for example, time is up), training
    stops and the model trained so far is tested and returned.

    progress_callback, if given, is called after each epoch with a dict:
        {"epoch": 1, "epochs": 2, "loss": ..., "accuracy": ...,
         "val_loss": ..., "val_accuracy": ...,
         "gradients": {"conv 1": ..., "dense 1": ..., "output": ...},
         "seconds": ...}
    val_* are measured on the test set, as in the notebook. "gradients" is the
    gradient size per layer (see gradient_sizes), measured on the first
    GRADIENT_BATCH_SIZE training images. If the callback
    raises an exception, training stops and the exception reaches the caller.

    Returns (model, results). results is a plain dict:
        {"settings": {...all 13...},
         "test_accuracy": 0.975, "mistakes": 250, "test_images": 10000,
         "confusion": [[...], ...],  # see evaluate
         "training_seconds": 61.2, "parameters": 219162,
         "stopped_early": False,     # True when should_stop ended the run
         "no_more_progress": False,  # True when the run ended before its last
                                     # epoch because it stopped improving
         "history": [one progress dict per finished epoch]}
    """
    s = validate_settings(settings)
    tf.keras.utils.set_random_seed(SEED)

    (train_images, train_labels), (test_images, test_labels) = load_data()
    train_images = train_images[: s["train_images"]]
    train_labels = train_labels[: s["train_images"]]

    model = build_model(s)

    history = []

    def on_epoch(progress):
        history.append(progress)
        if progress_callback is not None:
            progress_callback(progress)

    gradient_batch = (
        train_images[:GRADIENT_BATCH_SIZE],
        train_labels[:GRADIENT_BATCH_SIZE],
    )
    progress = _ProgressCallback(on_epoch, s["epochs"], should_stop, gradient_batch)
    # Like the notebook: stop when the validation loss has not improved for
    # EARLY_STOPPING_PATIENCE epochs in a row, and keep the best epoch's weights.
    early_stopping = tf.keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=EARLY_STOPPING_PATIENCE,
        restore_best_weights=True,
    )
    started = time.perf_counter()
    model.fit(
        train_images,
        train_labels,
        validation_data=(test_images, test_labels),
        epochs=s["epochs"],
        batch_size=s["batch_size"],
        callbacks=[progress, early_stopping],
        verbose=0,
    )
    training_seconds = time.perf_counter() - started

    results = {
        "settings": s,
        **evaluate(model),
        "training_seconds": training_seconds,
        "parameters": int(model.count_params()),
        "stopped_early": progress.stopped_early,
        "no_more_progress": early_stopping.stopped_epoch > 0,
        "history": history,
    }
    return model, results


def train(settings=None, progress_callback=None, should_stop=None):
    """Same as train_with_results, but returns only the trained model."""
    model, _ = train_with_results(settings, progress_callback, should_stop)
    return model


if __name__ == "__main__":
    # Quick manual check: python server/model.py
    def _print_progress(progress):
        print(
            f"epoch {progress['epoch']}/{progress['epochs']}  "
            f"loss {progress['loss']:.4f}  accuracy {progress['accuracy']:.4f}  "
            f"test accuracy {progress['val_accuracy']:.4f}  "
            f"{progress['seconds']:.0f}s"
        )

    _, _results = train_with_results(DEFAULT_SETTINGS, _print_progress)
    print(
        f"Test accuracy {_results['test_accuracy']:.2%}, "
        f"{_results['mistakes']} mistakes out of {_results['test_images']:,}, "
        f"trained in {_results['training_seconds']:.0f} seconds, "
        f"{_results['parameters']:,} parameters"
    )
