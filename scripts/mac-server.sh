#!/bin/sh
# Runs the training server on this Mac and makes it reachable from the web app.
#
#   scripts/mac-server.sh start https://your-name.ngrok-free.dev
#   scripts/mac-server.sh status
#   scripts/mac-server.sh stop
#
# start: builds the server image from server/Dockerfile, runs it in a Docker
#        container and opens an ngrok tunnel to it. Leave the terminal open;
#        Ctrl+C closes the tunnel and stops the server.
#
# The container gets no folders of this Mac, runs as a normal user and
# listens on this Mac only (127.0.0.1). Only the tunnel reaches it.
#
# Needs: Docker Desktop running, and ngrok signed in (ngrok config add-authtoken).
# The Mac must stay awake with the lid open; this script keeps it awake.
set -eu

NAME=cnn-digits-trainer
PORT=7860
ROOT=$(cd "$(dirname "$0")/.." && pwd)

stop_server() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}

case "${1:-}" in
  start)
    URL=${2:-}
    if [ -z "$URL" ]; then
      echo "Give the tunnel address: scripts/mac-server.sh start https://your-name.ngrok-free.dev" >&2
      exit 1
    fi
    docker build -q -t "$NAME" "$ROOT/server" >/dev/null
    stop_server
    docker run -d --name "$NAME" \
      -p "127.0.0.1:$PORT:$PORT" \
      --cap-drop ALL --security-opt no-new-privileges \
      --memory 4g --cpus 8 --pids-limit 512 \
      "$NAME" >/dev/null
    trap stop_server EXIT INT TERM
    echo "Training server: http://127.0.0.1:$PORT  (public: $URL)"
    echo "Press Ctrl+C to stop."
    caffeinate -i ngrok http "$PORT" --url="$URL"
    ;;
  status)
    docker ps --filter "name=$NAME" --format '{{.Names}}: {{.Status}}'
    curl -s -m 3 "http://127.0.0.1:$PORT/wake" || echo "The server does not answer."
    echo
    ;;
  stop)
    stop_server
    pkill -f "ngrok http $PORT" 2>/dev/null || true
    echo "Stopped."
    ;;
  *)
    echo "Usage: scripts/mac-server.sh start <tunnel address> | status | stop" >&2
    exit 1
    ;;
esac
