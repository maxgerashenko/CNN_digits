# CNN Digits

A convolutional neural network (CNN) that recognizes handwritten digits (0 to 9), trained on the MNIST dataset in Google Colab.

## Goal

1. **Learn how CNNs work** by building, training and tuning a digit classifier in Keras.
2. **Turn it into a free web app** where anyone can draw a digit and see:
   - the predicted digit and the probability for each of the 10 classes,
   - what each convolution layer "sees" (its feature maps),
   - a diagram of the network that follows the settings.
3. **Let visitors retrain it** with their own settings (layers, filters, dropout, learning rate, epochs and more) and compare the new model with the saved one.

The page is a React single-page app in `web/` with one adaptive design for phone, tablet and desktop. It will be hosted for free on GitHub Pages and run the saved model in the visitor's browser with TensorFlow.js. Retraining runs on a free Hugging Face Space. The web app is built and lives in `web/`. It is not published yet, so for now it runs locally (see "Run the web app" below). See [PLAN.md](PLAN.md) and [web/ARCHITECTURE.md](web/ARCHITECTURE.md).

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
| `web/` | The web app (React, Vite, TypeScript). `web/ARCHITECTURE.md` describes its structure. |
| `server/` | The training server for the Hugging Face Space (Python, FastAPI). |
| `README.md` | This file. |

## Run the web app

You need Node.js 22.12 or newer. From the repo root:

```
cd web
npm install
npm run dev
```

`npm run dev` starts the dev server and prints the address, usually `http://localhost:5173`. Open it in a browser.

```
npm test          # unit tests for the app, then the training-server tests
npm run build     # type check, then build the app into web/dist
```

What you see:

- **Recognize tab:** it uses the saved model in `web/public/model/` (`model.json` and `weights.bin`). To replace it, export a trained Keras model:

  ```
  python server/export.py <model.keras> web/public/model
  ```

  Then update `SAVED_MODEL_FACTS` in `web/src/config.ts` with the new model's test results.

- **Train tab:** without a training server it says training is not set up. Copy `web/.env.example` to `web/.env.local` and set `VITE_TRAINING_SERVER_URL` to the server's address, without a slash at the end. For the published site the address comes from the repository variable `VITE_TRAINING_SERVER_URL`.
- **Google Analytics:** off by default. Set `VITE_GA_MEASUREMENT_ID` (like `G-XXXXXXXXXX`) in `web/.env.local`, or as a repository variable for the published site, and the app loads Google Analytics 4 and counts a page view for each screen.

## Run the training server on a Mac

Training needs a server. The published site uses one that runs on a Mac, in a Docker container, behind a Cloudflare tunnel (below). `start` runs it behind an ngrok tunnel instead. Training works only while it runs.

```
scripts/mac-server.sh start https://your-name.ngrok-free.dev   # leave the terminal open; Ctrl+C stops it
scripts/mac-server.sh status
scripts/mac-server.sh stop
```

- Needs Docker Desktop running and ngrok signed in. The address is your ngrok domain; it must be the same as `VITE_TRAINING_SERVER_URL`.
- The container gets no folders of the Mac and listens on the Mac only. Only the tunnel reaches it.
- The Mac must stay awake with the lid open. The script keeps it awake while it runs.
- Anyone who knows the address can start training runs, so run the server only when you need it.
- Two runs can always train at the same time. When more people queue, a third worker starts, and it closes after two idle minutes. More runs than that wait in line. Change the numbers with `WARM` (always ready) and `WORKERS` (most at a time, 1 to 8): `WARM=1 WORKERS=4 scripts/mac-server.sh start ...`. On other hosts the server reads `TRAIN_WORKERS_WARM` and `TRAIN_WORKERS` (default 1 for both).
- The free ngrok plan shows browsers a warning page. The app sends the header `ngrok-skip-browser-warning` with each request to pass it (`web/src/api/serverFetch.ts`).

### Fixed address with a Cloudflare tunnel

The published site uses `https://train.cnndigits.online`. A free Cloudflare named tunnel sends it to the server on the Mac. The tunnel runs as a launchd service, so it starts again after a restart, and the address never changes.

Start the server once; Docker starts it again on its own afterwards:

```
scripts/mac-server.sh up
scripts/mac-server.sh status
curl https://train.cnndigits.online/wake   # {"status":"ok",...}
```

Docker Desktop must open at login (Settings > General), and the Mac must stay awake.

How the tunnel was set up (once, on the Mac; the domain is on Cloudflare):

```
brew install cloudflared
cloudflared tunnel login                     # pick cnndigits.online in the browser
cloudflared tunnel create cnn-digits-trainer
cloudflared tunnel route dns cnn-digits-trainer train.cnndigits.online
```

- `~/.cloudflared/cnn-digits.yml` sends `train.cnndigits.online` to `http://localhost:7860`. The tunnel's key file sits next to it; keep it secret.
- `~/Library/LaunchAgents/local.cnn-digits-tunnel.plist` runs `cloudflared tunnel --config ~/.cloudflared/cnn-digits.yml run`. Log: `~/Library/Logs/cnn-digits-tunnel.log`.
- Stop the tunnel: `launchctl bootout gui/$(id -u)/local.cnn-digits-tunnel`. Start it: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.cnn-digits-tunnel.plist`.

The same `server/Dockerfile` runs on a cloud host (a Hugging Face Docker Space, Google Cloud Run). To move there, deploy it and change `VITE_TRAINING_SERVER_URL`.

## How to run the notebook

Open the Colab link above, or upload `notebook/cnn_digits.py` to Colab, then choose **Runtime > Run all**. The `!` lines are Colab shell commands, so the file runs in Colab or Jupyter, not as a plain `python` script.
