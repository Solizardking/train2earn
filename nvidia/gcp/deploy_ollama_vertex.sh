#!/usr/bin/env bash
#
# deploy_ollama_vertex.sh — Deploy Ollama models to Google Cloud Vertex AI
#
# Pipeline:
#   1. Export Ollama models as GGUF + Modelfiles
#   2. Upload artifacts to GCS
#   3. Build custom serving container with models baked in
#   4. Push container to Artifact Registry
#   5. Import model to Vertex AI Model Registry
#   6. Deploy to GPU endpoint
#   7. Run prediction test
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-x402-477302}"
REGION="${REGION:-us-central1}"
AR_REPO="${AR_REPO:-clawd-models}"
GCS_BUCKET="${GCS_BUCKET:-gs://clawd-ollama-models}"
IMAGE_NAME="${IMAGE_NAME:-ollama-vertex-serve}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENDPOINT_NAME="${ENDPOINT_NAME:-clawd-ollama-endpoint}"

# Models to deploy (space-separated Ollama tags)
# Pick production-ready models — not all 51GB
MODELS_TO_DEPLOY=(
    "8bit/solana-clawd-core-ai:latest"
    "8bit/solana-trading-factory:latest"
    "deepsol-clawd-code:latest"
)

echo "================================================"
echo "  Ollama → Vertex AI Deployment Pipeline"
echo "================================================"
echo "Project:    $PROJECT_ID"
echo "Region:     $REGION"
echo "AR Repo:    $AR_REPO"
echo "GCS Bucket: $GCS_BUCKET"
echo "Models:     ${MODELS_TO_DEPLOY[*]}"
echo "================================================"
echo ""

# ─── Step 1: Ensure GCS bucket exists ───────────────────────────
echo "[1/7] Ensuring GCS bucket exists..."
if ! gsutil ls "$GCS_BUCKET" >/dev/null 2>&1; then
    gsutil mb -l "$REGION" -p "$PROJECT_ID" "$GCS_BUCKET"
    echo "  ✓ Created bucket $GCS_BUCKET"
else
    echo "  ✓ Bucket already exists"
fi

# ─── Step 2: Export Ollama models ──────────────────────────────
echo ""
echo "[2/7] Exporting Ollama models to temp dir..."
EXPORT_DIR=$(mktemp -d /tmp/ollama-export.XXXXXX)
trap "rm -rf $EXPORT_DIR" EXIT

for model_tag in "${MODELS_TO_DEPLOY[@]}"; do
    echo "  Exporting: $model_tag"
    
    # Get model info
    model_info=$(ollama show "$model_tag" --modelfile 2>/dev/null || true)
    if [ -z "$model_info" ]; then
        echo "    ⚠ Model $model_tag not found locally, skipping"
        continue
    fi
    
    # Sanitize name for filesystem
    safe_name=$(echo "$model_tag" | tr '/:' '__')
    
    # Save modelfile
    ollama show "$model_tag" --modelfile > "$EXPORT_DIR/Modelfile.${safe_name}"
    
    # Extract the GGUF blob path from the modelfile
    blob_path=$(grep '^FROM ' "$EXPORT_DIR/Modelfile.${safe_name}" | awk '{print $2}')
    
    if [[ "$blob_path" == /* ]]; then
        # It's a local file path — copy the blob
        cp "$blob_path" "$EXPORT_DIR/${safe_name}.gguf"
        # Update modelfile to point to local gguf
        sed -i.bak "s|FROM .*|FROM /models/${safe_name}.gguf|" "$EXPORT_DIR/Modelfile.${safe_name}"
        echo "    ✓ Exported $(du -sh "$EXPORT_DIR/${safe_name}.gguf" | cut -f1)"
    elif [[ "$blob_path" == sha256:* ]] || [[ "$blob_path" =~ ^[a-f0-9]{64} ]]; then
        # It's a blob hash — resolve from ollama store
        blob_hash=$(echo "$blob_path" | sed 's/sha256://')
        blob_file=$(find ~/.ollama/models/blobs -name "$blob_hash" 2>/dev/null | head -1)
        if [ -n "$blob_file" ]; then
            cp "$blob_file" "$EXPORT_DIR/${safe_name}.gguf"
            sed -i.bak "s|FROM .*|FROM /models/${safe_name}.gguf|" "$EXPORT_DIR/Modelfile.${safe_name}"
            echo "    ✓ Exported $(du -sh "$EXPORT_DIR/${safe_name}.gguf" | cut -f1)"
        else
            echo "    ⚠ Blob $blob_hash not found, keeping pull reference"
        fi
    else
        echo "    ℹ Model references remote: $blob_path (will pull at runtime)"
    fi
done

echo ""
echo "Export contents:"
ls -lh "$EXPORT_DIR/" 2>/dev/null || echo "  (empty)"

# ─── Step 3: Upload artifacts to GCS ───────────────────────────
echo ""
echo "[3/7] Uploading model artifacts to GCS..."
gsutil -m cp -r "$EXPORT_DIR/"* "$GCS_BUCKET/artifacts/" 2>/dev/null || true
echo "  ✓ Artifacts uploaded to $GCS_BUCKET/artifacts/"

# ─── Step 4: Build container ───────────────────────────────────
echo ""
echo "[4/7] Building custom serving container..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Prepare build context with exported models
BUILD_DIR=$(mktemp -d /tmp/ollama-build.XXXXXX)
cp "$SCRIPT_DIR/Dockerfile.ollama-serve" "$BUILD_DIR/"
cp "$SCRIPT_DIR/ollama_vertex_serve.py" "$BUILD_DIR/"
cp "$SCRIPT_DIR/entrypoint.sh" "$BUILD_DIR/"

# Copy exported models into build context
mkdir -p "$BUILD_DIR/models"
for modelfile in "$EXPORT_DIR"/Modelfile.*; do
    [ -f "$modelfile" ] || continue
    cp "$modelfile" "$BUILD_DIR/models/"
done
for gguf in "$EXPORT_DIR"/*.gguf; do
    [ -f "$gguf" ] || continue
    cp "$gguf" "$BUILD_DIR/models/"
done

# Compose model names for dynamic pull fallback
MODEL_NAMES_STR=$(IFS=,; echo "${MODELS_TO_DEPLOY[*]}")

# Build for amd64 (Vertex AI runs on x86)
docker buildx build \
    --platform linux/amd64 \
    --build-arg MODEL_NAMES="$MODEL_NAMES_STR" \
    -t "$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/$IMAGE_NAME:$IMAGE_TAG" \
    "$BUILD_DIR" 2>&1 | tail -5

echo "  ✓ Container built"
rm -rf "$BUILD_DIR"

# ─── Step 5: Push to Artifact Registry ─────────────────────────
echo ""
echo "[5/7] Pushing to Artifact Registry..."
FULL_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/$IMAGE_NAME:$IMAGE_TAG"

# Configure docker auth
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet 2>/dev/null

docker push "$FULL_IMAGE" 2>&1 | tail -5
echo "  ✓ Pushed: $FULL_IMAGE"

# ─── Step 6: Import to Vertex AI Model Registry ────────────────
echo ""
echo "[6/7] Importing to Vertex AI Model Registry..."

MODEL_DISPLAY_NAME="clawd-ollama-serve"

# Check if model already exists
MODEL_ID=$(gcloud ai models list \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --filter="display_name=$MODEL_DISPLAY_NAME" \
    --format="value(name)" 2>/dev/null | head -1)

if [ -n "$MODEL_ID" ]; then
    echo "  Model already exists ($MODEL_ID), uploading as new version..."
    gcloud ai models upload \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --display-name="$MODEL_DISPLAY_NAME" \
        --container-image-uri="$FULL_IMAGE" \
        --artifact-uri="$GCS_BUCKET/artifacts/" \
        2>&1 | tail -3
else
    gcloud ai models upload \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --display-name="$MODEL_DISPLAY_NAME" \
        --container-image-uri="$FULL_IMAGE" \
        --artifact-uri="$GCS_BUCKET/artifacts/" \
        2>&1 | tail -3
fi

# Get model ID
MODEL_ID=$(gcloud ai models list \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --filter="display_name=$MODEL_DISPLAY_NAME" \
    --format="value(name)" | head -1)
echo "  ✓ Model registered: $MODEL_ID"

# ─── Step 7: Deploy to endpoint ────────────────────────────────
echo ""
echo "[7/7] Deploying to GPU endpoint..."

# Create endpoint if needed
ENDPOINT_ID=$(gcloud ai endpoints list \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --filter="display_name=$ENDPOINT_NAME" \
    --format="value(name)" 2>/dev/null | head -1)

if [ -z "$ENDPOINT_ID" ]; then
    echo "  Creating endpoint $ENDPOINT_NAME..."
    ENDPOINT_ID=$(gcloud ai endpoints create \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --display-name="$ENDPOINT_NAME" \
        --format="value(name)")
    echo "  ✓ Endpoint created: $ENDPOINT_ID"
fi

# Deploy model to endpoint with GPU
# Using T4 GPU (nvidia-l4 is also available, cheaper for small models)
echo "  Deploying model to endpoint (this takes a few minutes)..."
gcloud ai endpoints deploy-model "$ENDPOINT_ID" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --model="$MODEL_ID" \
    --display-name="clawd-ollama-deployment" \
    --machine-type="g2-standard-4" \
    --accelerator="type=nvidia-l4,count=1" \
    --min-replica-count=1 \
    --max-replica-count=1 \
    --traffic-split=0=100 \
    --format="value(name)" 2>&1 | tail -5

echo ""
echo "================================================"
echo "  ✓ Deployment Complete!"
echo "================================================"
echo ""
echo "Model:        $MODEL_DISPLAY_NAME ($MODEL_ID)"
echo "Endpoint:     $ENDPOINT_NAME ($ENDPOINT_ID)"
echo "Container:    $FULL_IMAGE"
echo "GCS Artifacts: $GCS_BUCKET/artifacts/"
echo ""
echo "Test prediction:"
echo "  gcloud ai endpoints predict $ENDPOINT_ID \\"
echo "    --region=$REGION \\"
echo '    --json-request='"'"'{"instances":[{"prompt":"Hello Clawd","model":"solana-clawd-core-ai"}]}'"'"''
echo ""
echo "Or via REST:"
echo "  curl -X POST \\"
echo "    -H \"Authorization: Bearer \$(gcloud auth print-access-token)\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    \"https://$REGION-aiplatform.googleapis.com/v1/projects/$PROJECT_ID/locations/$REGION/endpoints/$ENDPOINT_ID:predict\" \\"
echo '    -d '"'"'{"instances":[{"prompt":"Hello Clawd","model":"solana-clawd-core-ai"}]}'"'"''