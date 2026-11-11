# CNN Digits

A convolutional neural network (CNN) that recognizes handwritten digits (0 to 9), trained on the MNIST dataset in Google Colab.

## Goal

1. **Learn how CNNs work** by building, training and tuning a digit classifier in Keras.
2. **Turn it into a free web app** where anyone can draw a digit and see:
   - the predicted digit and the probability for each of the 10 classes,
   - what each convolution layer "sees" (its feature maps),
   - the network architecture, layer by layer.
3. **Let visitors retrain it** with their own settings (layers, filters, dropout, learning rate, epochs and more) and compare the new model with the saved one.

The page will be hosted for free on GitHub Pages and run the saved model in the visitor's browser with TensorFlow.js. Retraining runs on a free Hugging Face Space. It isn't built yet; see [PLAN.md](PLAN.md).

## Model

| Part | Layers | Output |
| --- | --- | --- |
| Input | 28 x 28 grayscale image, scaled to 0..1 | 28 x 28 x 1 |
| Augmentation (training only) | RandomRotation, RandomZoom, RandomTranslation (0.05) | 28 x 28 x 1 |
| Block 1 | 2 x (Conv2D 16, 3x3, same + BatchNorm + ReLU), MaxPool 2x2 | 14 x 14 x 16 |
| Block 2 | 2 x (Conv2D 32, 3x3, same + BatchNorm + ReLU), MaxPool 2x2 | 7 x 7 x 32 |
| Head | Flatten, Dense 128 + BatchNorm + ReLU, Dropout 0.1 | 128 |
| Output | Dense 10, softmax | 10 probabilities |

Training: Adam (learning rate 0.001), batch size 32, up to 20 epochs with early stopping and learning-rate reduction on plateau.

Best result so far: **99.58% test accuracy** (41 mistakes out of 10,000 test images). The full experiment log is at the end of the notebook code.

## Files

| Path | What it is |
| --- | --- |
| `notebook/cnn_digits.py` | The Colab notebook exported as Python: data loading, model, training, evaluation, error analysis and the experiment log. [Open the original in Colab](https://colab.research.google.com/drive/1bzUqcdbaJqzTtpU9TNm4z-twWFE81OiE). |
| `PLAN.md` | The plan for the web app: options, hosting and cost, and the phases. |
| `README.md` | This file. |

## How to run the notebook

Open the Colab link above, or upload `notebook/cnn_digits.py` to Colab, then choose **Runtime > Run all**. The `!` lines are Colab shell commands, so the file runs in Colab or Jupyter, not as a plain `python` script.
