#!/bin/sh
# Runs the training server on this Mac and makes it reachable from the web app.
#
#   scripts/mac-server.sh up
#   scripts/mac-server.sh start https://your-name.ngrok-free.dev
#   scripts/mac-server.sh status
#   scripts/mac-server.sh stop
#
# up:    builds the server image from server/Dockerfile and runs it in a Docker
#        container that Docker starts again on its own (after a restart of
#        Docker or the Mac). Use it with the Cloudflare tunnel, which runs as
#        its own service (see "Fixed address with a Cloudflare tunnel" in the
#        README). The terminal can be closed.
# start: the same container, but with an ngrok tunnel instead. Leave the
#        terminal open; Ctrl+C closes the tunnel and stops the server.
#
# The container gets no folders of this Mac, runs as a normal user and
# listens on this Mac only (127.0.0.1). Only the tunnel reaches it.
#
# The server answers pages from https://maxgerashenko.github.io and from this
# Mac (localhost). To let other pages call it, such as the dev app opened on a
# tablet, list every allowed address before the command:
#
#   ALLOWED_ORIGINS="https://maxgerashenko.github.io,http://192.168.1.191:5174" \
#     scripts/mac-server.sh start https://your-name.ngrok-free.dev
#
# Two runs can always train at the same time (WARM). When more people queue, a
# third worker starts, up to WORKERS, and closes again when it is idle. More
# runs than that wait in line. Each worker needs about 1.5 GB of memory, and
# Docker Desktop must have that much (Settings > Resources):
#
#   WARM=1 WORKERS=4 scripts/mac-server.sh start https://your-name.ngrok-free.dev
#
# Needs: Docker Desktop running, and ngrok signed in (ngrok config add-authtoken).
# The Mac must stay awake with the lid open; this script keeps it awake.
set -eu

NAME=cnn-digits-trainer
PORT=7860
WORKERS=${WORKERS:-3}
WARM=${WARM:-2}
# Memory for the container: 2 GB for the server and 1.5 GB for each run.
MEMORY_MB=$((2000 + 1500 * WORKERS))
ROOT=$(cd "$(dirname "$0")/.." && pwd)

stop_server() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}

# run_server <restart policy>
run_server() {
  docker build -q -t "$NAME" "$ROOT/server" >/dev/null
  stop_server
  docker run -d --name "$NAME" --restart "$1" \
    -p "127.0.0.1:$PORT:$PORT" \
    --cap-drop ALL --security-opt no-new-privileges \
    --memory "${MEMORY_MB}m" --cpus 12 --pids-limit 1024 \
    -e "TRAIN_WORKERS=$WORKERS" -e "TRAIN_WORKERS_WARM=$WARM" \
    ${ALLOWED_ORIGINS:+-e "ALLOWED_ORIGINS=$ALLOWED_ORIGINS"} \
    "$NAME" >/dev/null
}

case "${1:-}" in
  up)
    run_server unless-stopped
    echo "Training server: http://127.0.0.1:$PORT, $WARM to $WORKERS runs at a time"
    echo "It keeps running after this terminal closes. Stop it with: scripts/mac-server.sh stop"
    ;;
  start)
    URL=${2:-}
    if [ -z "$URL" ]; then
      echo "Give the tunnel address: scripts/mac-server.sh start https://your-name.ngrok-free.dev" >&2
      exit 1
    fi
    run_server no
    trap stop_server EXIT INT TERM
    echo "Training server: http://127.0.0.1:$PORT  (public: $URL), $WARM to $WORKERS runs at a time"
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
    echo "Usage: scripts/mac-server.sh up | start <ngrok address> | status | stop" >&2
    exit 1
    ;;
esac
