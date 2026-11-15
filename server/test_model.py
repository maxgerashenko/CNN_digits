"""Tests for server/model.py. Run with: pytest server/test_model.py"""

import itertools

import pytest
import tensorflow as tf

import model as m


def notebook_model():
    """The model exactly as written in notebook/cnn_digits.py."""

    def conv_bn_relu(filters, kernel_size, strides=1, padding="same"):
        return [
            tf.keras.layers.Conv2D(
                filters=filters,
                kernel_size=kernel_size,
                strides=strides,
                padding=padding,
                activation=None,
                use_bias=False,
                kernel_initializer=tf.keras.initializers.HeNormal(),
            ),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Activation("relu"),
        ]

    data_augmentation = tf.keras.Sequential(
        [
            tf.keras.layers.RandomRotation(0.05),
            tf.keras.layers.RandomZoom(0.05),
            tf.keras.layers.RandomTranslation(0.05, 0.05),
        ]
    )
    return tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(28, 28, 1)),
            data_augmentation,
            *conv_bn_relu(16, 3, 1, "same"),
            *conv_bn_relu(16, 3, 1, "same"),
            tf.keras.layers.MaxPooling2D(pool_size=(2, 2), strides=(2, 2)),
            *conv_bn_relu(32, 3, 1, "same"),
            *conv_bn_relu(32, 3, 1, "same"),
            tf.keras.layers.MaxPooling2D(pool_size=(2, 2), strides=(2, 2)),
            tf.keras.layers.Flatten(),
            tf.keras.layers.Dense(
                128,
                activation=None,
                use_bias=False,
                kernel_initializer=tf.keras.initializers.VarianceScaling(),
            ),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Activation("relu"),
            tf.keras.layers.Dropout(0.1),
            tf.keras.layers.Dense(10, activation="softmax"),
        ]
    )


def comparable_config(layer):
    """Layer config without names and random seeds, which differ every build."""
    config = layer.get_config()

    def clean(value):
        if isinstance(value, dict):
            return {
                k: clean(v)
                for k, v in value.items()
                if k not in ("name", "seed")
            }
        if isinstance(value, (list, tuple)):
            return [clean(v) for v in value]
        return value

    return layer.__class__.__name__, clean(config)


def test_default_settings_are_the_13_from_the_plan():
    assert m.DEFAULT_SETTINGS == {
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


def test_default_model_matches_the_notebook():
    ours = m.build_model()
    theirs = notebook_model()

    assert [comparable_config(l) for l in ours.layers] == [
        comparable_config(l) for l in theirs.layers
    ]
    assert [w.shape for w in ours.weights] == [w.shape for w in theirs.weights]
    assert ours.count_params() == theirs.count_params()
    assert ours.optimizer.__class__.__name__ == "Adam"
    assert float(ours.optimizer.learning_rate) == pytest.approx(0.001)
    assert ours.loss == "sparse_categorical_crossentropy"


def test_empty_settings_use_defaults():
    assert m.validate_settings() == m.DEFAULT_SETTINGS
    assert m.validate_settings({"epochs": 3})["epochs"] == 3
    assert m.validate_settings({"epochs": 3})["filters"] == 16


def test_every_layer_shape_combination_builds():
    for blocks, per_block, dense, kernel in itertools.product(
        (1, 2, 3), (1, 2, 3), (0, 1, 2), (3, 5)
    ):
        built = m.build_model(
            {
                "conv_blocks": blocks,
                "conv_layers_per_block": per_block,
                "dense_layers": dense,
                "kernel_size": kernel,
            }
        )
        names = [l.__class__.__name__ for l in built.layers]
        assert names.count("Conv2D") == blocks * per_block
        assert names.count("MaxPooling2D") == blocks
        assert names.count("Dense") == dense + 1
        assert built.output_shape == (None, 10)


def test_filters_double_in_each_block():
    built = m.build_model({"conv_blocks": 3, "conv_layers_per_block": 1, "filters": 8})
    convs = [l for l in built.layers if isinstance(l, tf.keras.layers.Conv2D)]
    assert [c.filters for c in convs] == [8, 16, 32]


def test_switches_remove_layers():
    built = m.build_model({"batch_norm": False, "augmentation": 0, "dropout": 0})
    names = [l.__class__.__name__ for l in built.layers]
    assert "BatchNormalization" not in names
    assert "Dropout" not in names
    assert "Sequential" not in names
    conv = next(l for l in built.layers if isinstance(l, tf.keras.layers.Conv2D))
    assert conv.use_bias is True


def test_augmentation_layer_has_a_fixed_name():
    built = m.build_model({"augmentation": 0.1})
    assert built.layers[0].name == m.AUGMENTATION_LAYER_NAME
    assert built.layers[0].layers[0].get_config()["factor"] == pytest.approx((-0.1, 0.1))


@pytest.mark.parametrize(
    "bad",
    [
        {"conv_blocks": 4},
        {"conv_layers_per_block": 0},
        {"dense_layers": 3},
        {"filters": 12},
        {"kernel_size": 4},
        {"dense_units": 100},
        {"dropout": 0.6},
        {"dropout": -0.1},
        {"learning_rate": 0.5},
        {"epochs": 21},
        {"epochs": 0},
        {"epochs": 1.5},
        {"batch_norm": "yes"},
        {"batch_size": 16},
        {"train_images": 100},
        {"train_images": 70000},
        {"augmentation": 0.2},
        {"filters": "16"},
        {"dropout": float("nan")},
        {"made_up": 1},
    ],
)
def test_bad_settings_are_rejected(bad):
    with pytest.raises(ValueError):
        m.validate_settings(bad)


def test_short_training_run_reports_results():
    settings = {
        "conv_blocks": 1,
        "conv_layers_per_block": 1,
        "filters": 4,
        "dense_units": 32,
        "epochs": 2,
        "batch_size": 128,
        "train_images": 5000,
    }
    seen = []
    trained, results = m.train_with_results(settings, seen.append)

    assert isinstance(trained, tf.keras.Model)
    assert [p["epoch"] for p in seen] == [1, 2]
    assert seen == results["history"]
    assert set(seen[0]) == {
        "epoch", "epochs", "loss", "accuracy", "val_loss", "val_accuracy", "seconds",
    }
    assert results["test_images"] == 10000
    assert results["mistakes"] == round((1 - results["test_accuracy"]) * 10000)
    assert results["test_accuracy"] > 0.8
    assert results["training_seconds"] > 0
    assert results["parameters"] == trained.count_params()
    assert results["settings"]["train_images"] == 5000
    assert results["stopped_early"] is False
    assert m.evaluate(trained)["mistakes"] == results["mistakes"]


def test_should_stop_ends_training_early():
    calls = []

    def should_stop():
        calls.append(1)
        return len(calls) >= 3

    seen = []
    trained, results = m.train_with_results(
        {"conv_blocks": 1, "conv_layers_per_block": 1, "filters": 4,
         "dense_layers": 0, "epochs": 5, "train_images": 5000},
        seen.append,
        should_stop,
    )
    assert len(calls) == 3
    assert results["stopped_early"] is True
    assert len(seen) <= 1
    assert isinstance(trained, tf.keras.Model)
    assert results["test_images"] == 10000
