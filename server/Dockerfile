# Runs the training server on the Hugging Face Space (free CPU).
# On the Space this file sits next to app.py, because the deploy copies the
# contents of server/ to the Space's top folder.
FROM python:3.11-slim

# Hugging Face runs the container as user 1000, so the app must not need root.
RUN useradd --create-home --uid 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2

WORKDIR /home/user/app

# Install the packages first so this slow step is reused when only code changes.
COPY --chown=user requirements.txt ./server/requirements.txt
# uvicorn is named here too, so the start command below always works.
RUN pip install --no-cache-dir --user -r server/requirements.txt uvicorn

# Put the MNIST data in the image, so the first training run does not wait for
# a download and the server needs no internet to train.
RUN python -c "import tensorflow as tf; tf.keras.datasets.mnist.load_data()"

# Keep the code in a "server" folder, like in the GitHub repo. Both import
# styles then work: "from server.model import ..." and "import model".
COPY --chown=user . ./server/
ENV PYTHONPATH=/home/user/app:/home/user/app/server

# 7860 is the port Hugging Face expects (app_port in README.md).
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "7860"]
