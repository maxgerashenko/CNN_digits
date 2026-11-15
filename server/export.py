"""Export a trained Keras model so TensorFlow.js can run it in the browser.

Writes two files into a folder:

    model.json   the list of layers and where each weight sits in weights.bin
    weights.bin  all the numbers, as float32, one weight after another

Load them in the page with:

    const model = await tf.loadLayersModel('path/to/model.json');

Only tensorflow (Keras) and numpy are needed. `tensorflowjs_converter` is not
used, because it often fails with Keras 3 and with the augmentation layers.

The augmentation layers (RandomRotation, RandomZoom, RandomTranslation, ...)
only matter while training, so they are left out. Dropout is kept so the
exported model has the same layers as the Keras one; TensorFlow.js turns it off
when predicting.

Use from Python:

    from server.export import export_tfjs
    export_tfjs(model, 'out_dir')

Use from the command line (for the saved model):

    python server/export.py digits_recognition_cnn.keras web/public/model

The web app loads the saved model from web/public/model/.
"""

import json
import os
import sys

import numpy as np

MODEL_FILE = 'model.json'
WEIGHTS_FILE = 'weights.bin'

# Activations TensorFlow.js knows by the same name.
SUPPORTED_ACTIVATIONS = ('linear', 'relu', 'softmax', 'sigmoid', 'tanh')


class ExportError(ValueError):
    """The model has a layer or a shape this exporter can't write."""


# ---------------------------------------------------------------------------
# Reading the Keras model
# ---------------------------------------------------------------------------

def _class_name(layer):
    return layer.__class__.__name__


def _is_augmentation(layer):
    """True for layers that only change the image while training."""
    name = _class_name(layer)
    if name.startswith('Random'):
        return True
    # A Sequential that holds only augmentation layers, like the notebook's
    # `data_augmentation`.
    inner = getattr(layer, 'layers', None)
    if inner:
        return all(_is_augmentation(l) or _class_name(l) == 'InputLayer'
                   for l in inner)
    return False


def _flat_layers(model):
    """The model's layers in order, without input and augmentation layers."""
    result = []
    for layer in model.layers:
        if _class_name(layer) == 'InputLayer' or _is_augmentation(layer):
            continue
        if getattr(layer, 'layers', None):  # a nested model: open it up
            result.extend(_flat_layers(layer))
        else:
            result.append(layer)
    return result


def _activation_name(layer):
    fn = getattr(layer, 'activation', None)
    name = 'linear' if fn is None else getattr(fn, '__name__', str(fn))
    if name not in SUPPORTED_ACTIVATIONS:
        raise ExportError(
            f'Layer "{layer.name}": activation "{name}" is not supported.')
    return name


def _pair(value):
    if isinstance(value, int):
        return [value, value]
    return [int(v) for v in value]


def _layer_entry(layer):
    """Return (TensorFlow.js layer config, [(weight name, array), ...])."""
    kind = _class_name(layer)
    name = layer.name
    config = {'name': name, 'trainable': True, 'dtype': 'float32'}
    weights = []

    if kind == 'Conv2D':
        config.update(
            filters=int(layer.filters),
            kernel_size=_pair(layer.kernel_size),
            strides=_pair(layer.strides),
            padding=layer.padding,
            data_format='channels_last',
            dilation_rate=_pair(layer.dilation_rate),
            activation=_activation_name(layer),
            use_bias=bool(layer.use_bias),
        )
        if getattr(layer, 'groups', 1) != 1:
            raise ExportError(f'Layer "{name}": grouped convs are not supported.')
        weights.append((f'{name}/kernel', layer.kernel))
        if layer.use_bias:
            weights.append((f'{name}/bias', layer.bias))

    elif kind == 'Dense':
        config.update(
            units=int(layer.units),
            activation=_activation_name(layer),
            use_bias=bool(layer.use_bias),
        )
        weights.append((f'{name}/kernel', layer.kernel))
        if layer.use_bias:
            weights.append((f'{name}/bias', layer.bias))

    elif kind == 'BatchNormalization':
        axis = layer.axis[0] if isinstance(layer.axis, (list, tuple)) else layer.axis
        config.update(
            axis=int(axis),
            momentum=float(layer.momentum),
            epsilon=float(layer.epsilon),
            center=bool(layer.center),
            scale=bool(layer.scale),
        )
        if layer.scale:
            weights.append((f'{name}/gamma', layer.gamma))
        if layer.center:
            weights.append((f'{name}/beta', layer.beta))
        weights.append((f'{name}/moving_mean', layer.moving_mean))
        weights.append((f'{name}/moving_variance', layer.moving_variance))

    elif kind == 'Activation':
        config.update(activation=_activation_name(layer))

    elif kind == 'ReLU':
        if layer.max_value is not None or layer.negative_slope or layer.threshold:
            raise ExportError(f'Layer "{name}": only a plain ReLU is supported.')
        kind = 'Activation'
        config.update(activation='relu')

    elif kind == 'MaxPooling2D':
        config.update(
            pool_size=_pair(layer.pool_size),
            strides=_pair(layer.strides if layer.strides else layer.pool_size),
            padding=layer.padding,
            data_format='channels_last',
        )

    elif kind == 'Flatten':
        config.update(data_format='channels_last')

    elif kind == 'Dropout':
        config.update(rate=float(layer.rate))

    else:
        raise ExportError(
            f'Layer "{name}" ({kind}) is not supported by the browser export.')

    arrays = [(n, np.asarray(w.numpy() if hasattr(w, 'numpy') else w,
                             dtype='<f4')) for n, w in weights]
    return {'class_name': kind, 'config': config}, arrays


def _input_shape(model):
    shape = model.input_shape
    if isinstance(shape, list):
        if len(shape) != 1:
            raise ExportError('Only models with one input are supported.')
        shape = shape[0]
    return [None] + [int(d) for d in shape[1:]]


# ---------------------------------------------------------------------------
# Writing the files
# ---------------------------------------------------------------------------

def export_tfjs(model, out_dir, check=True):
    """Save `model` as model.json + weights.bin in `out_dir`.

    model:   a trained Keras model that is a plain stack of layers
             (Conv2D, BatchNormalization, Activation/ReLU, MaxPooling2D,
             Flatten, Dense, Dropout). Augmentation layers are skipped.
    out_dir: folder to write to; it is created if missing.
    check:   if True, read the two files back, run them with numpy and
             make sure they give the same answers as the Keras model.
             Raises ExportError if they don't.

    Returns a dict with the two file paths, their sizes in bytes, the layer
    list and the parameter count.
    """
    layers = _flat_layers(model)
    if not layers:
        raise ExportError('The model has no layers to export.')

    layer_configs = []
    specs = []
    chunks = []
    seen = set()
    for layer in layers:
        if layer.name in seen:
            raise ExportError(f'Two layers are named "{layer.name}".')
        seen.add(layer.name)
        entry, arrays = _layer_entry(layer)
        layer_configs.append(entry)
        for name, array in arrays:
            specs.append({'name': name, 'shape': list(array.shape),
                          'dtype': 'float32'})
            chunks.append(array.tobytes())

    input_shape = _input_shape(model)
    layer_configs[0]['config']['batch_input_shape'] = input_shape

    model_json = {
        'format': 'layers-model',
        'generatedBy': 'CNN_digits server/export.py',
        'convertedBy': None,
        'modelTopology': {
            # TensorFlow.js reads the Keras 2 layout, so that is what we write.
            'keras_version': '2.15.0',
            'backend': 'tensorflow',
            'model_config': {
                'class_name': 'Sequential',
                'config': {'name': model.name, 'layers': layer_configs},
            },
        },
        'weightsManifest': [{'paths': [WEIGHTS_FILE], 'weights': specs}],
    }

    os.makedirs(out_dir, exist_ok=True)
    model_path = os.path.join(out_dir, MODEL_FILE)
    weights_path = os.path.join(out_dir, WEIGHTS_FILE)
    with open(weights_path, 'wb') as f:
        for chunk in chunks:
            f.write(chunk)
    with open(model_path, 'w') as f:
        json.dump(model_json, f)

    if check:
        check_export(model, out_dir)

    return {
        'model_json': model_path,
        'weights_bin': weights_path,
        'model_json_bytes': os.path.getsize(model_path),
        'weights_bytes': os.path.getsize(weights_path),
        'layers': [e['class_name'] for e in layer_configs],
        'params': int(sum(int(np.prod(s['shape'])) for s in specs)),
    }


# ---------------------------------------------------------------------------
# Checking the files: run them with plain numpy, compare with Keras
# ---------------------------------------------------------------------------

def _same_pad(x, kernel, strides):
    """Pad height and width the way TensorFlow's padding='same' does."""
    pads = [(0, 0)]
    for size, k, s in zip(x.shape[1:3], kernel, strides):
        out = -(-size // s)
        total = max((out - 1) * s + k - size, 0)
        pads.append((total // 2, total - total // 2))
    pads.append((0, 0))
    return pads


def _windows(x, kernel, strides):
    """All kernel-sized windows of x: (batch, out_h, out_w, channels, kh, kw)."""
    win = np.lib.stride_tricks.sliding_window_view(x, kernel, axis=(1, 2))
    return win[:, ::strides[0], ::strides[1]]


def _activate(x, name):
    if name == 'linear':
        return x
    if name == 'relu':
        return np.maximum(x, 0)
    if name == 'softmax':
        e = np.exp(x - x.max(axis=-1, keepdims=True))
        return e / e.sum(axis=-1, keepdims=True)
    if name == 'sigmoid':
        return 1 / (1 + np.exp(-x))
    if name == 'tanh':
        return np.tanh(x)
    raise ExportError(f'Unknown activation "{name}".')


def load_export(out_dir):
    """Read model.json + weights.bin. Returns (layer configs, {name: array})."""
    with open(os.path.join(out_dir, MODEL_FILE)) as f:
        model_json = json.load(f)
    with open(os.path.join(out_dir, WEIGHTS_FILE), 'rb') as f:
        data = f.read()
    weights = {}
    offset = 0
    for spec in model_json['weightsManifest'][0]['weights']:
        count = int(np.prod(spec['shape']))
        weights[spec['name']] = np.frombuffer(
            data, dtype='<f4', count=count, offset=offset).reshape(spec['shape'])
        offset += count * 4
    if offset != len(data):
        raise ExportError('weights.bin does not match model.json.')
    layers = model_json['modelTopology']['model_config']['config']['layers']
    return layers, weights


def predict_export(out_dir, images):
    """Run the exported files on `images` with numpy only (no Keras)."""
    layers, weights = load_export(out_dir)
    x = np.asarray(images, dtype=np.float64)
    for layer in layers:
        kind, c = layer['class_name'], layer['config']
        name = c['name']
        if kind == 'Conv2D':
            if c['padding'] == 'same':
                x = np.pad(x, _same_pad(x, c['kernel_size'], c['strides']))
            win = _windows(x, c['kernel_size'], c['strides'])
            # windows: (b, h, w, in, kh, kw); kernel: (kh, kw, in, out)
            x = np.einsum('bhwikl,klio->bhwo', win, weights[f'{name}/kernel'])
            if c['use_bias']:
                x = x + weights[f'{name}/bias']
            x = _activate(x, c['activation'])
        elif kind == 'Dense':
            x = x @ weights[f'{name}/kernel']
            if c['use_bias']:
                x = x + weights[f'{name}/bias']
            x = _activate(x, c['activation'])
        elif kind == 'BatchNormalization':
            if c['axis'] not in (-1, x.ndim - 1):
                raise ExportError(f'Layer "{name}": batch norm axis must be last.')
            mean = weights[f'{name}/moving_mean']
            var = weights[f'{name}/moving_variance']
            x = (x - mean) / np.sqrt(var + c['epsilon'])
            if c['scale']:
                x = x * weights[f'{name}/gamma']
            if c['center']:
                x = x + weights[f'{name}/beta']
        elif kind == 'Activation':
            x = _activate(x, c['activation'])
        elif kind == 'MaxPooling2D':
            if c['padding'] == 'same':
                x = np.pad(x, _same_pad(x, c['pool_size'], c['strides']),
                           constant_values=-np.inf)
            x = _windows(x, c['pool_size'], c['strides']).max(axis=(4, 5))
        elif kind == 'Flatten':
            x = x.reshape(x.shape[0], -1)
        elif kind == 'Dropout':
            pass  # off when predicting
        else:
            raise ExportError(f'Unknown layer type "{kind}" in model.json.')
    return x


def check_export(model, out_dir, samples=16, tolerance=1e-4, seed=0):
    """Make sure the exported files give the same answers as the Keras model.

    Runs `samples` random images through both and compares every output
    number. Returns the largest difference. Raises ExportError if it is
    bigger than `tolerance` or if the predicted digits differ.
    """
    shape = _input_shape(model)[1:]
    images = np.random.default_rng(seed).random((samples, *shape), dtype=np.float32)
    expected = np.asarray(model(images, training=False))
    got = predict_export(out_dir, images)
    if got.shape != expected.shape:
        raise ExportError(
            f'Exported model output shape {got.shape} != Keras {expected.shape}.')
    diff = float(np.abs(got - expected).max())
    same_answers = bool((got.argmax(-1) == expected.argmax(-1)).all())
    if not diff <= tolerance or not same_answers:  # also catches NaN
        raise ExportError(
            f'Exported model does not match the Keras model '
            f'(largest difference {diff:.2e}).')
    return diff


def main(argv):
    if len(argv) != 3:
        print('Usage: python server/export.py MODEL.keras OUT_DIR')
        return 2
    import keras
    model = keras.models.load_model(argv[1])
    info = export_tfjs(model, argv[2])
    print(f"Wrote {info['model_json']} ({info['model_json_bytes']:,} bytes)")
    print(f"Wrote {info['weights_bin']} ({info['weights_bytes']:,} bytes)")
    print(f"{len(info['layers'])} layers, {info['params']:,} parameters. "
          'Checked: same answers as the Keras model.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
