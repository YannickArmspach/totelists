#!/bin/sh
# Start the server, then make sure the requested models exist locally.
# `ollama show` succeeds only for already-downloaded models, so a restart
# with a warm volume never touches the network.
set -eu

MODELS="${OLLAMA_PULL_MODELS:-qwen3:4b}"

ollama serve &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null' TERM INT

until ollama ls >/dev/null 2>&1; do sleep 1; done

for m in $MODELS; do
  if ! ollama show "$m" >/dev/null 2>&1; then
    echo "pulling $m..."
    ollama pull "$m"
  fi
done

wait "$pid"
