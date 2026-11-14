"""Tests for server/export.py.

Run from the repo root:

    pip install tensorflow pytest
    pytest server/tests

The TensorFlow.js test also needs Node and `npm install @tensorflow/tfjs`
(run in server/tests). It is skipped if they are missing.
"""

import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

keras = pytest.importorskip('keras')
from server.export import (  # noqa: E402
    ExportError, check_export, export_tfjs, load_export, predict_export)

HERE = os.path.dirname(os.path.abspath(__file__))


def build_test_model(conv_blocks=2, conv_layers=2, dense_layers=1, filters=16,
                     kernel_size=3, dense_units=128, dropout=0.1,
                     batch_norm=True, augmentation=0.05):
    """A stand-in for the training code (issue #5), same layout as the notebook.

    It covers every layer type the 13 settings can produce.
    """
    L = keras.layers
    layers = [L.Input(shape=(28, 28, 1))]
    if augmentation:
        layers.append(keras.Sequential([
            L.RandomRotation(augmentation),
            L.RandomZoom(augmentation),
            L.RandomTranslation(augmentation, augmentation),
        ]))
    for block in range(conv_blocks):
        for _ in range(conv_layers):
            layers.append(L.Conv2D(filters * 2 ** block, kernel_size,
                                   padding='same', use_bias=not batch_norm))
            if batch_norm:
                layers.append(L.BatchNormalization())
            layers.append(L.Activation('relu'))
        layers.append(L.MaxPooling2D(pool_size=(2, 2), strides=(2, 2)))
    layers.append(L.Flatten())
    for _ in range(dense_layers):
        layers.append(L.Dense(dense_units, use_bias=not batch_norm))
        if batch_norm:
            layers.append(L.BatchNormalization())
        layers.append(L.Activation('relu'))
        layers.append(L.Dropout(dropout))
    layers.append(L.Dense(10, activation='softmax'))
    model = keras.Sequential(layers)
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy')
    # A few training steps on random data, so the batch norm averages and
    # the weights are not at their starting values.
    rng = np.random.default_rng(1)
    x = rng.random((64, 28, 28, 1), dtype=np.float32)
    y = rng.integers(0, 10, 64)
    model.fit(x, y, epochs=2, batch_size=16, verbose=0)
    return model


# Corners of the 13 settings that change the layers.
CASES = {
    'notebook_defaults': dict(),
    'smallest': dict(conv_blocks=1, conv_layers=1, dense_layers=0, filters=4,
                     batch_norm=False, augmentation=0),
    'largest': dict(conv_blocks=3, conv_layers=3, dense_layers=2, filters=32,
                    kernel_size=5, dense_units=256, dropout=0.5),
    'no_batch_norm': dict(batch_norm=False, kernel_size=5, dropout=0),
    'no_augmentation': dict(augmentation=0, dense_layers=2, dense_units=32),
}


@pytest.fixture(scope='module', params=list(CASES))
def exported(request, tmp_path_factory):
    model = build_test_model(**CASES[request.param])
    out_dir = tmp_path_factory.mktemp(request.param)
    info = export_tfjs(model, str(out_dir))
    return model, str(out_dir), info


def test_writes_two_files(exported):
    model, out_dir, info = exported
    assert sorted(os.listdir(out_dir)) == ['model.json', 'weights.bin']
    with open(info['model_json']) as f:
        data = json.load(f)
    assert data['format'] == 'layers-model'
    assert data['weightsManifest'][0]['paths'] == ['weights.bin']
    assert info['weights_bytes'] == info['params'] * 4
    assert info['params'] == model.count_params()


def test_augmentation_is_skipped(exported):
    _, out_dir, _ = exported
    layers, _ = load_export(out_dir)
    kinds = {layer['class_name'] for layer in layers}
    assert not any(k.startswith('Random') or k == 'Sequential' for k in kinds)
    assert layers[0]['config']['batch_input_shape'] == [None, 28, 28, 1]


def test_same_answers_as_keras(exported):
    model, out_dir, _ = exported
    assert check_export(model, out_dir, samples=32, seed=7) < 1e-4


def test_loads_in_tensorflowjs(exported, tmp_path):
    """Load the files with the real TensorFlow.js and compare the answers."""
    model, out_dir, _ = exported
    if not shutil.which('node') or not os.path.isdir(
            os.path.join(HERE, 'node_modules', '@tensorflow', 'tfjs')):
        pytest.skip('Node or @tensorflow/tfjs is not installed.')
    images = np.random.default_rng(3).random((8, 28, 28, 1), dtype=np.float32)
    expected = np.asarray(model(images, training=False))
    case = tmp_path / 'case.json'
    case.write_text(json.dumps({'input': images.ravel().tolist(),
                                'shape': list(images.shape),
                                'expected': expected.ravel().tolist()}))
    result = subprocess.run(
        ['node', os.path.join(HERE, 'load_in_tfjs.mjs'), out_dir, str(case)],
        capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_check_catches_wrong_weights(exported):
    model, out_dir, _ = exported
    path = os.path.join(out_dir, 'weights.bin')
    original = open(path, 'rb').read()
    try:
        broken = np.frombuffer(original, dtype='<f4').copy()
        broken[:] = broken[::-1]
        open(path, 'wb').write(broken.tobytes())
        with pytest.raises(ExportError):
            check_export(model, out_dir)
    finally:
        open(path, 'wb').write(original)


def test_unsupported_layer_is_rejected(tmp_path):
    model = keras.Sequential([
        keras.layers.Input(shape=(28, 28, 1)),
        keras.layers.Flatten(),
        keras.layers.Dense(10),
        keras.layers.LeakyReLU(),
    ])
    with pytest.raises(ExportError):
        export_tfjs(model, str(tmp_path))


def test_functional_model_and_reload(tmp_path):
    """A model built the functional way, saved to .keras and loaded again."""
    L = keras.layers
    inputs = keras.Input(shape=(28, 28, 1))
    x = L.RandomRotation(0.1)(inputs)
    x = L.Conv2D(8, 3, padding='same')(x)
    x = L.BatchNormalization()(x)
    x = L.ReLU()(x)
    x = L.MaxPooling2D()(x)
    x = L.Flatten()(x)
    outputs = L.Dense(10, activation='softmax')(x)
    model = keras.Model(inputs, outputs)
    path = str(tmp_path / 'm.keras')
    model.save(path)
    model = keras.models.load_model(path)
    out_dir = str(tmp_path / 'out')
    export_tfjs(model, out_dir)
    images = np.random.default_rng(0).random((4, 28, 28, 1), dtype=np.float32)
    np.testing.assert_allclose(predict_export(out_dir, images),
                               np.asarray(model(images, training=False)),
                               atol=1e-4)
