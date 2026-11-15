# Web app plan

The app is a free web page on GitHub Pages where visitors draw a digit and the saved CNN recognizes it instantly in the browser. Visitors can also retrain the network with their own settings on a free Hugging Face server and compare the new model with the saved one. Everything costs $0.

## Decisions

| Topic | Decision | Status |
| --- | --- | --- |
| Tabs | Recognize and Train. A switch on Recognize picks the model: Saved model or My retrained | Design, Nov 14 |
| Web page | GitHub Pages, a React single-page app in `web/` (Vite, TypeScript, flexbox), always on | Design, Nov 14 |
| Layouts | One adaptive design: phone (stacked screens, bottom tab bar), tablet landscape (three columns, no scroll), desktop (rail and panes) | Design, Nov 14 |
| Recognize | Saved model runs in the browser with TensorFlow.js, never waits for a server | Decided Nov 11 |
| Training | Hugging Face Space (Python, TensorFlow), used only for training | Decided Nov 11 |
| Waking the server | The page pings the Space in the background when it opens | Decided Nov 11 |
| My retrained | The Space sends the trained model back; it runs in the browser like the saved model | Decided Nov 11 |
| Retraining settings | 13 settings: 9 Basic, 4 behind Advanced (table below) | Decided Nov 11 |
| What visitors see | Prediction, 10 probability bars, feature maps of each conv block, a diagram of the network. After a run: a check per setting, run details and raw charts | Design, Nov 14 |
| Input | Drawing only, or photo upload too | Open |
| Letters | Digits only for now; letters need EMNIST and retraining | Open |
| Public link | `maxgerashenko.github.io/CNN_digits` (repo must be public) | Open |

## How it fits together

```
 GitHub Pages                 Visitor's browser                     Hugging Face Space
 (page + saved model) --load once--> drawing pad + results          (trains;        
                               saved model, TF.js           --settings-->   free CPU,
                               retrained model             --wake ping-->   sleeps when idle)
                                                           <--new model--
```

The page and the saved model load once from GitHub Pages and then run in the browser. Only the Train button talks to the Hugging Face Space, which sends the new model back.

## The two tabs

| Tab | What the visitor does | Where it runs | Waits for the server? |
| --- | --- | --- | --- |
| Recognize, saved model | Draws a digit and sees the digit, 10 probability bars and, under "How it was read", the feature maps of each conv block | In the browser (TensorFlow.js), with the saved model exported to `model.json` + `weights.bin` | No, never |
| Train | Picks settings and presses Start training; sees loss and accuracy after each epoch, then what each setting did | On the Hugging Face Space (Python, the notebook's model code) | Only if the Space was asleep, about 1 minute |
| Recognize, my retrained | Presses "Use my retrained model" (or the My retrained pill), then draws | In the browser, with the model the Space sent back (about 1 MB) | No, once training is done |

**Opening the page never waits for the server.** GitHub Pages serves the page instantly, and the saved model needs nothing else. On load the page quietly sends one small request to the Space so it starts waking up. If the Space is still waking when the visitor presses Start training, the page shows "Server is starting, about 1 minute".

**How My retrained works.** After training, the Space exports the new model with the same export script used for the saved model and returns the two files. The page loads them next to the saved model, and the two pills "Saved model" and "My retrained" pick which one reads the drawing. Predictions and feature maps are instant for both. The retrained model lives only in that browser tab; the design has no Download button.

## Retraining settings

All 13 settings are in the first version. Nine are always visible (Basic); four sit behind an "Advanced settings" row on phone and desktop, and are always visible on the tablet. Defaults are the notebook's values, except epochs and training images, which are smaller so training stays around a minute.

| Setting | Group | Choices | Default | What the visitor learns | Panel |
| --- | --- | --- | --- | --- | --- |
| Conv blocks | Layers | 1, 2, 3 | 2 | Each block ends with MaxPool and halves the image: 28 to 14 to 7 to 3 | Basic |
| Conv layers per block | Layers | 1, 2, 3 | 2 | Stacking convs before pooling finds more complex patterns | Basic |
| Hidden dense layers | Layers | 0, 1, 2 | 1 | 0 goes straight from features to the answer | Basic |
| Filters in block 1 | Architecture | 4, 8, 16, 32 | 16 | More filters see more patterns but train slower; each next block doubles it | Basic |
| Kernel size | Architecture | 3 or 5 | 3 | The log: 3x3 made fewer mistakes than 5x5 | Basic |
| Dense units | Architecture | 32, 64, 128, 256 | 128 | Size of each hidden dense layer | Basic |
| Dropout | Architecture | 0 to 0.5 in steps of 0.1 | 0.1 | Higher fights overfitting, too high hurts accuracy | Basic |
| Learning rate | Training | 0.0001, 0.001, 0.01 | 0.001 | Too high jumps around, too low learns slowly | Basic |
| Epochs | Training | 1 to 5 | 2 | More passes over the data, longer wait | Basic |
| Batch norm | Architecture | On / Off | On | Off trains slower and less stable | Advanced |
| Batch size | Training | 32, 64, 128 | 32 | Bigger is faster per epoch, sometimes less accurate | Advanced |
| Training images | Training | 5,000, 10,000, 30,000 or 60,000 (the server accepts any whole number from 5,000 to 60,000) | 10,000 | More data, better model, longer wait | Advanced |
| Data augmentation | Data | Off, 0.05, 0.1 | 0.05 | Tilting and shifting helps on real drawings | Advanced |

Before training, the network diagram and the weight count update live as the visitor changes the settings. After training, the page shows test accuracy, mistakes out of 10,000 and training time next to the saved model's 99.58% and 41 mistakes, and a check for every setting: what it looked at, the ideal, the result, and what to try next. The design also shows data the server does not send yet (results per digit, a confusion matrix, gradient sizes, progress per batch, weights after every epoch); those places show an empty state. The full list is in [web/ARCHITECTURE.md](web/ARCHITECTURE.md), "Data gaps".

## Limits of the free server

- The free Hugging Face Space sleeps after about 48 hours without visitors; waking takes about a minute.
- Training runs on a small free CPU. The defaults (10,000 images, 2 epochs) should take about a minute and reach roughly 97 to 98%; these are estimates to measure in Phase 3.
- One visitor trains at a time; others wait in a queue and see their place.
- The largest settings (3 blocks x 3 layers, 32 filters, 60,000 images, 5 epochs) can take many minutes; the Training screen shows the elapsed time next to an estimate.

## The saved model in the browser

The notebook's model (about 219,000 parameters): 2 blocks of [Conv 3x3 + BatchNorm + ReLU] x 2 + MaxPool (16, then 32 filters), Flatten, Dense 128 + BatchNorm + ReLU, Dropout 0.1, Dense 10 softmax. The augmentation layers only matter in training and are skipped in the browser.

The browser can't read a `.keras` file, so a short Colab cell (tensorflow + numpy only, no extra installs) saves it as `model.json` (the layers) and `weights.bin` (the numbers). It runs once after training, and the two files go in `web/public/model/`. Until they are there, the page says that the saved model is not added yet. The `tensorflowjs_converter` mentioned in the notebook is not used, because it often fails with Keras 3 and the augmentation layers.

## Phases

1. **Phase 1: Repo.** Notebook code, README and plan in GitHub. Done (PR #1).
2. **Phase 2: Recognize on GitHub Pages.** The React app in `web/` with drawing pad, probability bars and feature maps, plus the exported model in `web/public/model/`. Turn on GitHub Pages.
3. **Phase 3: Training Space.** A small Python app on Hugging Face with one train function: settings in, progress out, trained model files back.
4. **Phase 4: Train in the page.** Train tab with the 13 settings, live loss and accuracy charts, run details, raw charts, background wake-up, and the Saved / My retrained switch.

Phases 2 and 4 are built together from the design canvas. The structure, the breakpoints and the work packages are in [web/ARCHITECTURE.md](web/ARCHITECTURE.md).

Each phase is a pull request reviewed before it goes live.

## Still open

- [ ] Drawing only, or also photo upload?
- [ ] Digits only for now, or plan letters (EMNIST) later?
- [ ] Is the public link `maxgerashenko.github.io/CNN_digits` fine?

## Background: is a CNN image recognition?

Yes. A CNN slides small filters over an image; early filters react to edges and strokes, later ones to loops and corners. This model takes a 28 x 28 image and outputs 10 probabilities, one per digit, and was trained on MNIST's 60,000 handwritten digits.
