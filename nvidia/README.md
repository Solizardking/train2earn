# NVIDIA AI Blueprints — Solana Clawd Integration

This folder integrates six NVIDIA AI Blueprints and the cuFOLIO portfolio
optimization library into the Solana Clawd AI training pipeline.

## Organization

The bridge modules are mapped in [`integration/README.md`](integration/README.md).
The full training workspace map is in [`../STRUCTURE.md`](../STRUCTURE.md).

## Blueprints

| Folder | What it does |
|---|---|
| [`blueprints/transaction-foundation-model/`](https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model) | Converts Solana tx JSONL to NeMo CPT format and defines the NIM/NeMo fine-tune launch contract. |
| [`blueprints/portfolio-optimization/`](https://build.nvidia.com/nvidia/quantitative-portfolio-optimization) | cuML KDE scenario generation plus Mean-CVaR optimizer with cuFOLIO preferred and CVXPY fallback. |
| [`blueprints/model-distillation/`](https://build.nvidia.com/nvidia/ai-model-distillation-for-financial-data) | Response and CoT distillation from a Hermes/Nemotron teacher into the 1.5B Clawd student lane. |
| [`blueprints/signal-discovery/`](https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent) | Phoenix perps signal agent: RSI, MACD, funding rate, orderbook imbalance, and EMA divergence through `RPC_URL` plus Vulcan CLI; paper executes on accepted signals. |
| [`blueprints/enterprise-rag/`](https://build.nvidia.com/nvidia/build-an-enterprise-rag-pipeline) | NeMo Retriever RAG contract: nv-ingest PDFs/docs to local FAISS, rerank, then NIM/Clawd generation. |
| [`blueprints/aiq/`](https://build.nvidia.com/nvidia/aiq) | Local AIQ evaluator that scores safety, artifact completeness, and 9-role coverage. |
| [`cufolio/`](https://github.com/NVIDIA-AI-Blueprints/cuFOLIO) | GPU portfolio optimizer with Clawd CVaR, leverage, and turnover constraints; emits Vulcan paper commands. |
| [`integration/nemo_clawd.py`](https://github.com/NVIDIA/NemoClaw) | Nemo Clawd: adapts the local `core-ai/` tree into a NemoClaw-style sandbox, network policy, lifecycle, and routed inference blueprint. |
| `integration/` | NIM bridge routes NVIDIA to ClawdRouter to Ollama, signal-to-trading-factory bridge, Nemo Clawd Core AI inventory, and NVIDIA SFT dataset builder. |
| `../perps/` | Model-facing perps tools, schemas, function-calling harness, and NVIDIA perps handoff generator. |

## Models

### Published (Live)

| # | Model | Type | Size | Role | Status |
|---|-------|------|------|------|--------|
| ⭐ | **`ordlibrary/clawd-trading-wallet`** | Fine-tuned (Qwen2.5-1.5B) | 986 MB | **First wallet-bearing LLM** — encrypted Solana wallet in session | ✅ **Live — Historic** |
| 🧠 | **`ordlibrary/hauhau-qwen36-onchain`** | GGUF (Qwen3.6) | 11 GB | Onchain constitution reasoning — training data inference | ✅ **Live** |
| 🧠 | **`ordlibrary/hauhau-qwen36-uncensored`** | GGUF (Qwen3.6) | 11 GB | Uncensored variant — unrestricted reasoning | ✅ **Live** |
| 🦞 | **`ordlibrary/core-ai-clawd-1.5b`** | GGUF (Qwen2.5-1.5B) | 986 MB | Core AI Clawd — Solana/DeFi/ZK chat | ✅ **Live** |
| 🦞 | **`ordlibrary/core-ai-clawd-1.5b:finetuned`** | Fine-tuned (Qwen2.5-1.5B) | 4.9 GB | Core AI Clawd — additional SFT tuning | ✅ **Live** |
| 🔬 | **`solanaclawd/solana-clawd-core-ai-1.5b-lora`** | LoRA adapter | ~9M params | Student — Solana/DeFi/constitutional chat | ✅ **Live** |
| 🔬 | **`solanaclawd/solana-nvidia-trading-factory-8b-lora`** | LoRA adapter (Hermes-3-8B) | ~9M params | NVIDIA Trading Factory — perps, Mean-CVaR | ✅ **Live** |
| 🏗️ | **`solanaclawd/solana-tx-foundation-1.5b`** | Full model (CPT+SFT) | 1.5B | Transaction foundation (Blueprint 1) — Qwen2.5-1.5B base | 🔄 **In training** |

### Oracle / Teacher Models (External)

| Model | Type | Status | Role |
| --- | --- | --- | --- |
| `nvidia/nemotron-3-nano-30b-a3b` | NIM API | External | Primary reasoning — signal verdicts, portfolio narration |
| `nvidia/nemotron-3-super-120b-a12b` | NIM API | External | Teacher — SFT labeling and CoT distillation |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16` | HF Inference API | External | Fallback when `HF_TOKEN` set, no `NVIDIA_API_KEY` |
| `nvidia/nv-embedqa-e5-v5` | NIM API | External | RAG embedding |
| `nvidia/nv-rerankqa-mistral-4b-v3` | NIM API | External | RAG reranker |

### Pull & Run Published Models

```bash
# ⭐ First wallet-bearing LLM — carries encrypted Solana wallet in session
ollama run hf.co/ordlibrary/clawd-trading-wallet
#   > create a wallet
#   > buy 100 SOL
#   > short ETH 5x

# 🧠 Onchain constitution reasoning
ollama run hf.co/ordlibrary/hauhau-qwen36-onchain

# 🧠 Uncensored variant
ollama run hf.co/ordlibrary/hauhau-qwen36-uncensored

# 🦞 Core AI Clawd
ollama run hf.co/ordlibrary/core-ai-clawd-1.5b

# 🦞 Core AI Clawd (fine-tuned)
ollama run ordlibrary/core-ai-clawd-1.5b:finetuned
```

### Training Datasets Used

| Dataset | Examples | Domain |
|---------|----------|--------|
| **Fable-5-traces** | 5,000 | Agent interaction traces for reasoning |
| **Core AI Instruct** | 35,173 | Solana, DeFi, ZK, Agent Architecture |
| **Realtime Research** | 29,058 | PDFs, notebooks, ZK skills |
| **TX Foundation CPT** | 19,542 | Solana mainnet transactions |
| **NVIDIA Trading Factory** | 142 | Perps, cuML, cuFOLIO, Mean-CVaR |
| **TX Foundation Unified** | 82,169 | Combined transaction foundation |
| **Clawd Fable SFT** | 3,052 | Fable trace training |

### Historic Milestone: July 4, 2026

On July 4, 2026, **`ordlibrary/clawd-trading-wallet`** was published — the first LLM in history that carries its own encrypted Solana wallet. It generates BIP39 seeds, derives Ed25519 keypairs, and executes natural-language trading commands entirely within inference, never exposing the raw private key.

```
User Command ──► LLM ──► BIP39 Seed ──► Ed25519 Keypair ──► Encrypted Session Key
                                                                    │
                                                    ❌ No disk writes
                                                    ❌ No clipboard
                                                    ❌ No .env secrets
                                                    ❌ No git exposure
```

See [`MODEL.md`](../../MODEL.md) for the full ecosystem documentation.

### NIM endpoint routing

The signal agent and NIM bridge (`integration/clawd_nim_bridge.py`) resolve in priority order:

```text
NVIDIA_API_KEY set  →  NIM API         (nvidia/nemotron-3-nano-30b-a3b)
HF_TOKEN set        →  HF Inference    (nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16)
FAL_API_KEY/FAL_KEY →  fal Model API    (nvidia/nemotron-3-nano-omni)
CLAWD_INFERENCE_URL →  Self-hosted Clawd endpoint
CLAWD_ROUTER_KEY    →  clawd-box-router.fly.dev (free tier)
(fallback)          →  Ollama localhost:11434
```

Override the resolved model: `NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b`  
Override the fal model/app: `FAL_MODEL_ID=nvidia/nemotron-3-nano-omni`  
Force local HF pipeline: `NVIDIA_USE_PIPELINE=1`

## Quick start

```bash
# 1. Set your NVIDIA API key (from build.nvidia.com)
export NVIDIA_API_KEY=nvapi-...

# 2. Install the NVIDIA stack
bash nvidia/scripts/setup_nvidia.sh

# 3. Run a specific blueprint or perps handoff
python3 perps/nvidia_perps.py --market SOL --mode observer
python3 nvidia/blueprints/signal-discovery/agent.py --mode paper

# 4. Verify the full integration
python3 nvidia/scripts/verify_nvidia.py
```

## fal Serverless

The `nvidia/pyproject.toml` file defines a private fal app named
`clawd-nvidia-agent`. It exposes the Clawd/NVIDIA chat surface through
`nvidia/fal_serverless_app.py` and routes inference through the same bridge as
the local agents.

```bash
cd nvidia
export FAL_API_KEY=<set-in-shell-only>
python3 scripts/verify_fal_serverless.py --deploy
./scripts/deploy_fal_serverless.sh check
./scripts/deploy_fal_serverless.sh
```

The deploy helper stores the runtime `FAL_KEY` secret in fal, then runs
`fal deploy clawd-nvidia-agent`. The app uses FAL's queue-backed
`nvidia/nemotron-3-nano-omni` model API when no higher-priority NVIDIA/HF
credential is present.

If `fal deploy ... --check` returns `Insufficient permissions`, the key can call
FAL model APIs but the account has not been granted FAL Serverless deployment
access yet. Request access at `https://fal.ai/dashboard/serverless-get-started`,
then rerun the deploy helper.

For local Python calls through the FAL route, install `fal` and `fal-client`,
then run:

```bash
python3 scripts/verify_fal_serverless.py --local-runtime
```

## fal Assets / CDN

FAL Serverless deployment requires account-level Serverless access, but FAL CDN
uploads are useful immediately for hosting public, sanitized model manifests.
The asset manifest records the NVIDIA/FAL app wiring, model IDs, file sizes, and
SHA-256 hashes for the deploy/config artifacts without embedding secrets.

```bash
cd nvidia
python3 scripts/fal_assets.py
export FAL_API_KEY=<set-in-shell-only>
python3 scripts/fal_assets.py --upload
```

The upload command writes:

- `outputs/fal_asset_manifest.json`
- `outputs/fal_asset_upload.json`

CDN URLs are public. The script only uploads the generated manifest by default;
do not upload arbitrary model weights or private files unless their contents are
intended to be public.

## Local Mac Control Plane

For an Apple Silicon local run that ties the blueprints, model-kit, trading
factory, AIQ, transaction-foundation preflight, and optional RAG path together:

```bash
cd /Users/8bit/Downloads/solana-clawd/ai-training
python3 scripts/run_local_clawd_stack.py --best-effort
```

Details, local URLs, and model choices are in
[`LOCAL_MAC_STACK.md`](LOCAL_MAC_STACK.md).

Hosted RAG API:

```bash
open https://solana-clawd-rag.fly.dev/about
curl -sS https://solana-clawd-rag.fly.dev/health
curl -sS https://solana-clawd-rag.fly.dev/query \
  -H "Content-Type: application/json" \
  -d '{"question":"What does the Solana Clawd NVIDIA stack do?","top_k":5}'
```

The protected dashboard lives at `https://solana-clawd-rag.fly.dev/admin` and
requires `CLAWD_RAG_ADMIN_KEY` to be set as a Fly secret. Deployment notes and
the Fly config are in
[`blueprints/enterprise-rag/README.md`](blueprints/enterprise-rag/README.md).

Perps signal agent quick start:

```bash
export RPC_URL=https://api.mainnet-beta.solana.com
export NVIDIA_API_KEY=<set-in-shell-only>
python3 nvidia/blueprints/signal-discovery/perps_signal_agent.py \
  --market SOL \
  --mode paper \
  --loop
```

## NemoClawd Solana Factory Adapter

The integration point is `trading_factory/solana_factory/`. The factory now
generates one additional artifact:

```bash
python3 scripts/build_solana_trading_factory_strategies.py
```

Output:

- `data/strategies/strategy_manifest.json`
- `data/strategies/cufolio_mean_cvar_handoff.json`
- `data/strategies/rise_market_data_plan.json`
- `data/strategies/vulcan_command_plans.json`
- `data/strategies/nvidia_clawd_agent_plan.json`
- `data/strategies/nemo_clawd_core_inventory.json`
- `data/strategies/nemo_clawd_blueprint.json`

You can regenerate only the NemoClawd/NVIDIA agent plan with:

```bash
python3 nvidia/integration/nemo_clawd_agent.py \
  --markets SOL BTC ETH JUP PYTH JTO \
  --mode paper
```

You can regenerate only the Core AI -> Nemo Clawd inventory and blueprint with:

```bash
python3 nvidia/integration/nemo_clawd.py --write --check
```

The generated agent plan adapts two upstream projects without vendoring their
entire trees:

| Source | What is adapted |
|---|---|
| `NVIDIA/NemoClaw` | Guided onboarding, hardened sandbox blueprint, routed inference, network policy, and lifecycle management for always-on agents. |
| `Solizardking/quantitative-signal-discovery-agent` | NeMo Agent Toolkit loop: signal agent, code agent, evaluator, retry feedback |
| `x402agent/NemoClawd` | Blueprint lifecycle, sandbox posture, MCP tool catalog, and permission gates |

The plan remains observer/paper-only by default. It does not write wallet
passwords, private keys, OAuth files, or API tokens into generated artifacts.

### Nemo Clawd Core AI inventory

`nemo_clawd.py` checks the explicit Core AI surface that powers Clawd:

- `.agents`, `.clawd-plugin`, `.github`
- `clawd-agents`, `clawd-code`, `clawd-grok`, `v3`
- `helius-cli`, `helius-cursor`, `helius-mcp`, `helius-plugin`, `helius-skills`
- `knowledge`, `docs`, `mcp-server`, `scripts`
- root governance files: `AGENTS.md`, `CLAUDE.md`, `CLAWD.md`,
  `CONTRIBUTING.md`, `README.md`, `LICENSE`, `versions.json`, `glama.json`

The inventory records path existence, counts, package summaries, SKILL.md files,
MCP tool files, and content hashes. It is a reference mount contract, not a
source copy. Secret-like filenames and generated dependency folders are excluded
from inventory traversal.

## Blueprint Contracts

| Contract | Local producer | Local consumer |
|---|---|---|
| Nemo Clawd Core AI inventory | `nvidia/integration/nemo_clawd.py` | `nvidia/integration/nemo_clawd_agent.py`, `nvidia/integration/dataset_nvidia_sft.py`, AIQ |
| Strategy and command specs | `trading_factory/solana_factory/factory.py` | `scripts/build_solana_trading_factory_strategies.py` |
| NemoClawd agent plan | `trading_factory/solana_factory/nvidia_agent.py` | `nvidia/integration/nemo_clawd_agent.py` |
| Signal SFT log | `nvidia/blueprints/signal-discovery/agent.py` | `scripts/build_nvidia_trading_factory_dataset.py` |
| AIQ release gate | `nvidia/blueprints/aiq/agent.py` | `nvidia/scripts/verify_nvidia.py` and release checks |

## Environment variables

| Variable | Required for |
|---|---|
| `NVIDIA_API_KEY` | All NIM API calls, NeMo, nv-ingest, cuFOLIO |
| `FAL_API_KEY` / `FAL_KEY` | fal Model API fallback and `clawd-nvidia-agent` deployment |
| `HF_TOKEN` | Publishing SFT datasets to Hub |
| `WANDB_API_KEY` | Training metric logging |
| `CLAWD_INFERENCE_URL` | Pointing signal agent at your local Clawd endpoint |

Keep all keys in your shell or secret manager. Never write them to YAML, JSON, or markdown files.

## Integration map

```
Solana on-chain data
  └─► blueprints/transaction-foundation-model/  ─── NeMo CPT → tx embeddings
        └─► blueprints/model-distillation/      ─── distill 8B → 1.5B Clawd
              └─► blueprints/signal-discovery/  ─── AIQ agent finds alpha
                    └─► cufolio/                ─── GPU Mean-CVaR portfolio
                          └─► blueprints/portfolio-optimization/
                                └─► integration/nemo_clawd_agent.py
                                      └─► trading_factory/solana_factory/nvidia_agent.py

Solana docs + PDFs
└─► blueprints/enterprise-rag/               ─── NeMo Retriever RAG index
        └─► blueprints/aiq/                   ─── AIQ eval of full pipeline

Core AI runtime
└─► integration/nemo_clawd.py                ─── Core inventory + sandbox/network blueprint
        └─► integration/nemo_clawd_agent.py   ─── Nemo Clawd plan + training hooks
```

## Verification

Run the local NVIDIA verifier from `ai-training/`:

```bash
python3 nvidia/scripts/verify_nvidia.py --strict
python3 nvidia/scripts/validate_configs.py --strict
python3 nvidia/scripts/verify_fal_serverless.py
python3 nvidia/blueprints/aiq/agent.py --strict
```

`verify_nvidia.py` checks that all six blueprint folders exist, builds the
Solana strategy bundle in a temporary directory, confirms the NemoClawd agent
plan is emitted, confirms the Nemo Clawd Core AI inventory and blueprint can be
generated, validates the NVIDIA YAML config contracts, and scans the NVIDIA
integration files for credential-like patterns.

## Folder layout

```
nvidia/
├── README.md                            ← this file
├── blueprints/
│   ├── transaction-foundation-model/    ← Blueprint 1: NeMo tx foundation model
│   ├── portfolio-optimization/          ← Blueprint 2: cuML/cuDF/cuOpt CVaR
│   ├── model-distillation/             ← Blueprint 3: teacher→student distill
│   ├── signal-discovery/               ← Blueprint 4: AIQ signal agent
│   ├── enterprise-rag/                 ← Blueprint 5: NeMo Retriever RAG
│   └── aiq/                            ← Blueprint 6: AIQ eval toolkit
├── cufolio/                             ← cuFOLIO: GPU portfolio optimizer
├── configs/                             ← NIM / NeMo / AIQ YAML configs
├── scripts/                             ← Setup, run, verify
└── integration/                         ← Bridges to trading_factory + Clawd
    ├── nemo_clawd.py                    ← Core AI → NVIDIA/NemoClaw-style blueprint
    ├── nemo_clawd_agent.py              ← Agent-plan writer
    ├── clawd_nim_bridge.py              ← Routed NIM/HF/Clawd/Ollama inference
    ├── trading_factory_nvidia.py        ← Signal → Vulcan paper bridge
    └── dataset_nvidia_sft.py            ← NVIDIA + Nemo Clawd SFT builder

../perps/
├── README.md                            ← Perps quickstart and safety contract
└── nvidia_perps.py                      ← Writes data/perps/nvidia_perps_handoff.json
```
