# Model Kit Site Deployment

This folder ships two deployable surfaces:

- `models.x402.wtf` - static Vercel frontend from `frontend/index.html`.
- `register.x402.wtf` - host-routed Vercel page from `frontend/register.html`.
- Render API - Dockerized FastAPI service from `backend/main.py`.

The frontend is static. It never stores registry tokens. Live registration is
proxied through the Render API only when the page sends an explicit live request.

## Render API

Use the blueprint in this folder (repo root = `train2earn`):

```bash
cd /path/to/train2earn
render blueprint launch model-kit/render.yaml
```

If using the Render dashboard, import the GitHub repo
`https://github.com/Solizardking/train2earn` and point the blueprint to:

```text
model-kit/render.yaml
```

The service root is:

```text
model-kit/backend
```

Required public env:

| Name | Value |
| --- | --- |
| `MODEL_KIT_GITHUB_REPO` | `https://github.com/Solizardking/train2earn` |
| `ONCHAIN_REGISTRY_HOME` | `https://onchain.x402.wtf` |
| `ONCHAIN_REGISTRY_URL` | `https://onchain.x402.wtf/api/register` |
| `X402_HOME` | `https://x402.wtf` |
| `MODELS_HOME` | `https://models.x402.wtf` |
| `REGISTER_HOME` | `https://register.x402.wtf` |
| `MODEL_KIT_CORS_ORIGINS` | `https://models.x402.wtf,https://register.x402.wtf` |

Optional secret env:

| Name | Use |
| --- | --- |
| `ONCHAIN_REGISTRY_TOKEN` | Server-side bearer token for registry writes when users do not pass a request token. |

Smoke checks:

```bash
curl -sS https://x402-model-kit-docker-api.onrender.com/api/health
curl -sS https://x402-model-kit-docker-api.onrender.com/api/model-kit/status
curl -sS https://x402-model-kit-docker-api.onrender.com/.well-known/clawd-model-kit.json
```

## Vercel Frontend

Set the Vercel project root directory to:

```text
model-kit
```

Build settings:

| Setting | Value |
| --- | --- |
| Framework | Other |
| Build command | `npm run build` |
| Output directory | `frontend` |

Before deploy, set `frontend/config.js` to the Render URL:

```js
window.MODEL_KIT_CONFIG = {
  apiBaseUrl: "https://x402-model-kit-docker-api.onrender.com",
  x402Home: "https://x402.wtf",
  modelsHome: "https://models.x402.wtf",
  registerHome: "https://register.x402.wtf",
  onchainHome: "https://onchain.x402.wtf",
  githubRepo: "https://github.com/Solizardking/train2earn",
};
```

Deploy:

```bash
cd /path/to/train2earn/model-kit
npm run build
vercel deploy --prod
```

Attach both domains to the same Vercel project:

| Domain | Served page |
| --- | --- |
| `models.x402.wtf` | `/index.html` |
| `register.x402.wtf` | `/register.html` via host rewrite |

## Cloud Build / Cloud Run

Root `cloudbuild.yaml` builds Docker images with contexts:

| Service | Context | Image name |
| --- | --- | --- |
| Model kit API | `model-kit/backend` | `train2earn-model-kit` |
| Training index site | `site` | `train2earn-site` |

`MODEL_KIT_GITHUB_REPO` is set to `https://github.com/Solizardking/train2earn` on Cloud Run deploy.

## Registration Flow

The register page calls:

| Route | Method | Use |
| --- | --- | --- |
| `/api/register/preview` | `POST` | Build a dry-run CAAP/1.0 payload. |
| `/api/register` | `POST` | Dry-run unless the request has `live: true`. |

Live requests require a real `model_hash` by default. Provisional generated
hashes are allowed only when `allow_generated_hash: true` is sent.
