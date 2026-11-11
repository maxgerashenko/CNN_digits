# Web app plan

**Recommendation:** build one free website that runs the trained model inside the browser with TensorFlow.js, hosted on GitHub Pages. It combines Option A (draw a digit, see the prediction) and Option B (see what each conv layer "sees"), plus a picture of the network's layers. Cost is $0, no server, and it keeps working when the laptop is off. Option C (change hyperparameters and retrain in the browser) can come later as a second page.

## Is a CNN image recognition?

Yes. A CNN is the standard kind of network for image recognition. This model takes a 28 x 28 grayscale image and outputs 10 probabilities, one for each digit. It recognizes digits only, not letters, because it was trained on MNIST. Letters would need a dataset such as EMNIST and retraining.

The conv layers slide small 3 x 3 filters over the image. Early filters react to edges and strokes, later ones to bigger shapes like loops and corners. Option B makes that visible.

## App options

| Option | What the visitor does | What the page shows | Uses the trained model? | Effort |
| --- | --- | --- | --- | --- |
| A. Digit recognizer | Draws a digit with mouse or finger | The predicted digit and a bar for each of the 10 probabilities | Yes | Small |
| B. Convolution visualizer | Draws a digit (same canvas as A) | The input, then the feature maps from each conv layer | Yes | Medium |
| Architecture view (part of B) | Looks, hovers a layer | Each layer with its output shape and parameter count | Yes | Small |
| C. Hyperparameter tuner | Moves sliders (filters, dropout, learning rate, epochs), clicks Train | Live loss and accuracy curves, then tests the new model on the canvas | No, trains a new one in the browser | Large |

A saved `.keras` model is frozen: changing filters or dropout means retraining. In the browser, a small subset of MNIST for a few epochs should train in about a minute (an estimate, not measured yet).

## Where it runs and what it costs

| Way to run it | Where the model runs | Cost | Always online? | Language |
| --- | --- | --- | --- | --- |
| TensorFlow.js + GitHub Pages (recommended) | In each visitor's browser | $0 | Yes | HTML + JavaScript |
| Streamlit or Gradio on Hugging Face Spaces | On a small free server | $0 (free CPU tier) | Yes, but sleeps when idle | Python |
| Laptop + ngrok tunnel | On your computer | $0 | Only while the laptop is on | Python |

## Getting the model into the browser

The browser can't read a `.keras` file, so the trained model is exported to two files: `model.json` (the layers) and `weights.bin` (the trained numbers). The `tensorflowjs_converter` mentioned in the notebook often fails with Keras 3 and doesn't support the augmentation layers, so a small export cell (tensorflow + numpy only) will be added with the app.

## Phases

1. **Repo:** save the notebook code, README and this plan. *(this PR)*
2. **Web app (A + B):** one page in `docs/` with a drawing canvas, prediction bars, feature maps and the architecture view, plus the export script and a trained model.
3. **Run and publish:** run locally with `python3 -m http.server`, then turn on GitHub Pages (Settings > Pages > branch `main`, folder `/docs`).
4. **Later, Option C:** a second page with sliders that trains a small model in the browser.

## Open questions

- Is A + B + the architecture view the right first version, or should Option C be in it too?
- Digits only, or letters later (EMNIST)?
- Also allow uploading a photo of a digit, or only drawing?
- Is the public link `maxgerashenko.github.io/CNN_digits` fine? Free GitHub Pages needs a public repo.
