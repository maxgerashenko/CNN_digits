---
title: CNN Digits Trainer
emoji: 🔢
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: Retrains a small digit CNN with your own settings
---

# CNN Digits training server

This Space is the training server of the [CNN Digits](https://github.com/maxgerashenko/CNN_digits) web app. The web page sends it the visitor's settings, it trains a small CNN on MNIST and sends the new model back to the browser.

It has no page of its own. Open the web app instead.

## Do not edit files here

The files in this Space are copied from the `server/` folder of the GitHub repo each time that folder changes on `main`. A change made directly in the Space is overwritten by the next deploy. Change the code on GitHub.

The lines between the `---` marks at the top are settings Hugging Face reads: the Space runs the `Dockerfile` and expects the app on port 7860.
