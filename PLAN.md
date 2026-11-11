# Web app plan

The app is a free web page on GitHub Pages where visitors draw a digit and the saved CNN recognizes it instantly in the browser. Visitors can also retrain the network with their own settings on a free Hugging Face server and compare the new model with the saved one. Everything costs $0.

## Decisions

| Topic | Decision | Status |
| --- | --- | --- |
| Modes | 1 Saved model, 2 Retrain, 3 My retrained model | Decided Nov 11 |
| Web page | GitHub Pages, static HTML + JavaScript, always on | Decided Nov 11 |
| Mode 1 | Saved model runs in the browser with TensorFlow.js, never waits for a server | Decided Nov 11 |
| Training (mode 2) | Hugging Face Space (Python, TensorFlow), used only for training | Decided Nov 11 |
| Waking the server | The page pings the Space in the background when it opens | Decided Nov 11 |
| Mode 3 | The Space sends the trained model back; it runs in the browser like mode 1 | Decided Nov 11 |
| Retraining settings | 13 settings: 9 Basic, 4 behind Advanced (table below) | Decided Nov 11 |
| What visitors see | Prediction, 10 probability bars, feature maps of each conv layer, layer list | Decided Nov 11 |
| Input | Drawing only, or photo upload too | Open |
| Letters | Digits only for now; letters need EMNIST and retraining | Open |
| Public link | `maxgerashenko.github.io/CNN_digits` (repo must be public) | Open |

## How it fits together

```
 GitHub Pages                 Visitor's browser                     Hugging Face Space
 (page + saved model) --load once--> drawing pad + results          (trains, mode 2;
                               saved model, TF.js (mode 1)  --settings-->   free CPU,
                               retrained model (mode 3)    --wake ping-->   sleeps when idle)
                                                           <--new model--
```

The page and the saved model load once from GitHub Pages and then run in the browser. Only the Train button talks to the Hugging Face Space, which sends the new model back.

## The three modes

| Mode | What the visitor does | Where it runs | Waits for the server? |
| --- | --- | --- | --- |
| 1. Saved model | Draws a digit and sees the digit, 10 probability bars and the feature maps of each conv layer | In the browser (TensorFlow.js), with the saved model exported to `model.json` + `weights.bin` | No, never |
| 2. Retrain | Picks settings and clicks Train; sees loss and accuracy after each epoch | On the Hugging Face Space (Python, the notebook's model code) | Only if the Space was asleep, about 1 minute |
| 3. My retrained model | Switches "Use model" to My retrained, then draws | In the browser, with the model the Space sent back (about 1 MB) | No, once training is done |

**Opening the page never waits for the server.** GitHub Pages serves the page instantly, and mode 1 needs nothing else. On load the page quietly sends one small request to the Space so it starts waking up. If the Space is still waking when the visitor presses Train, the button shows "Server is starting, about 1 minute".

**How mode 3 works.** After training, the Space exports the new model with the same export script used for the saved model and returns the two files. The page loads them next to the saved model, and a switch "Use model: Saved / My retrained" picks which one reads the drawing. Predictions, feature maps and the layer list are instant for both. The retrained model lives only in that browser tab; a Download button saves it.

## Retraining settings

All 13 settings are in the first version. Nine are always visible (Basic); four sit behind an "Advanced settings" toggle. Defaults are the notebook's values, except epochs and training images, which are smaller so training stays around a minute.

| Setting | Group | Choices | Default | What the visitor learns | Panel |
| --- | --- | --- | --- | --- | --- |
| Conv blocks | Layers | 1, 2, 3 | 2 | Each block ends with MaxPool and halves the image: 28 to 14 to 7 to 3 | Basic |
| Conv layers per block | Layers | 1, 2, 3 | 2 | Stacking convs before pooling finds more complex patterns | Basic |
| Hidden dense layers | Layers | 0, 1, 2 | 1 | 0 goes straight from features to the answer | Basic |
| Filters in block 1 | Architecture | 4, 8, 16, 32 | 16 | More filters see more patterns but train slower; each next block doubles it | Basic |
| Kernel size | Architecture | 3 or 5 | 3 | The log: 3x3 made fewer mistakes than 5x5 | Basic |
| Dense units | Architecture | 32, 64, 128, 256 | 128 | Size of each hidden dense layer | Basic |
| Dropout | Architecture | 0 to 0.5 | 0.1 | Higher fights overfitting, too high hurts accuracy | Basic |
| Learning rate | Training | 0.0001, 0.001, 0.01 | 0.001 | Too high jumps around, too low learns slowly | Basic |
| Epochs | Training | 1 to 5 | 2 | More passes over the data, longer wait | Basic |
| Batch norm | Architecture | On / Off | On | Off trains slower and less stable | Advanced |
| Batch size | Training | 32, 64, 128 | 32 | Bigger is faster per epoch, sometimes less accurate | Advanced |
| Training images | Training | 5,000 to 60,000 | 10,000 | More data, better model, longer wait | Advanced |
| Data augmentation | Data | Off, 0.05, 0.1 | 0.05 | Tilting and shifting helps on real drawings | Advanced |

Before training, the layer list and parameter count update live as the visitor moves the layer sliders. After training, the page shows test accuracy, mistakes out of 10,000 and training time, next to the saved model's 99.58% and 41 mistakes.

## Limits of the free server

- The free Hugging Face Space sleeps after about 48 hours without visitors; waking takes about a minute.
- Training runs on a small free CPU. The defaults (10,000 images, 2 epochs) should take about a minute and reach roughly 97 to 98%; these are estimates to measure in Phase 3.
- One visitor trains at a time; others wait in a queue and see their place.
- The largest settings (3 blocks x 3 layers, 32 filters, 60,000 images, 5 epochs) can take many minutes; the page shows an estimate before the visitor presses Train.

## The saved model in the browser

The notebook's model (about 219,000 parameters): 2 blocks of [Conv 3x3 + BatchNorm + ReLU] x 2 + MaxPool (16, then 32 filters), Flatten, Dense 128 + BatchNorm + ReLU, Dropout 0.1, Dense 10 softmax. The augmentation layers only matter in training and are skipped in the browser.

The browser can't read a `.keras` file, so a short Colab cell (tensorflow + numpy only, no extra installs) saves it as `model.json` (the layers) and `weights.bin` (the numbers). It runs once after training, and the two files go in the repo. The `tensorflowjs_converter` mentioned in the notebook is not used, because it often fails with Keras 3 and the augmentation layers.

## Phases

1. **Phase 1: Repo.** Notebook code, README and plan in GitHub. Done (PR #1).
2. **Phase 2: Mode 1 on GitHub Pages.** The page in `docs/` with drawing pad, probability bars, feature maps and layer list, plus the export cell and the exported model. Turn on GitHub Pages.
3. **Phase 3: Training Space.** A small Python app on Hugging Face with one train function: settings in, progress out, trained model files back.
4. **Phase 4: Modes 2 and 3 in the page.** Train tab with the 13 settings, live loss and accuracy chart, background wake-up, and the Saved / My retrained switch.

Each phase is a pull request reviewed before it goes live.

## Still open

- [ ] Drawing only, or also photo upload?
- [ ] Digits only for now, or plan letters (EMNIST) later?
- [ ] Is the public link `maxgerashenko.github.io/CNN_digits` fine?

## Background: is a CNN image recognition?

Yes. A CNN slides small filters over an image; early filters react to edges and strokes, later ones to loops and corners. This model takes a 28 x 28 image and outputs 10 probabilities, one per digit, and was trained on MNIST's 60,000 handwritten digits.
