#!/bin/bash
set -e

# Vertex AI custom container entrypoint for Ollama serving
# Starts Ollama daemon, pulls/bakes models, then launches the prediction shim

echo "[entrypoint] Starting Ollama serving container..."

# Start Ollama in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "[entrypoint] Waiting for Ollama daemon..."
for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        echo "[entrypoint] Ollama daemon is ready."
        break
    fi
    sleep 1
done

# Load models from MODEL_NAMES env or GCS artifacts dir
# Models are pre-baked into the image at /models/*.gguf via Modelfiles
if [ -d /models ]; then
    echo "[entrypoint] Loading models from /models..."
    for modelfile in /models/Modelfile.*; do
        if [ -f "$modelfile" ]; then
            model_name=$(basename "$modelfile" | sed 's/Modelfile\.//')
            echo "[entrypoint] Creating model: $model_name"
            ollama create "$model_name" -f "$modelfile" 2>&1 || echo "[entrypoint] WARN: Failed to create $model_name"
        fi
    done
fi

# Pull models if MODEL_NAMES is set (for dynamically loaded models)
if [ -n "$MODEL_NAMES" ]; then
    IFS=',' read -ra MODELS <<< "$MODEL_NAMES"
    for model in "${MODELS[@]}"; do
        echo "[entrypoint] Pulling model: $model"
        ollama pull "$model" 2>&1 || echo "[entrypoint] WARN: Failed to pull $model"
    done
fi

echo "[entrypoint] Available models:"
ollama list

# Launch the Vertex AI prediction shim on port 8080
echo "[entrypoint] Starting Vertex AI prediction shim on :${PORT:-8080}..."
exec python3 /app/ollama_vertex_serve.py
</parameter>