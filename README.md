<div align="center">

# 🧠 Solana Clawd AI Training Framework

**On-Chain Model Training · LoRA Fine-Tuning · Dataset Engineering · NVIDIA Blueprint Integration · ZK Attestation · CAAP/1.0 Registry**

</div>

---

```math
\boxed{\text{Training Surface}} \xrightarrow[\text{36K SFT + 29K Realtime + 19K CPT + 142 Trading}]{\text{Dataset Ingestion}} \boxed{SFT JSONL} \xrightarrow{\text{LoRA (r=16)}} \boxed{\text{Adapter}} \xrightarrow{\text{HF Jobs / Local MPS}} \boxed{\text{Trained Model}}
```

<div align="center">

[![Hugging Face Org](https://img.shields.io/badge/🤗_Hugging_Face-solanaclawd-FFD21E?style=for-the-badge)](https://huggingface.co/solanaclawd)
[![Onchain Registry](https://img.shields.io/badge/🧾_Registry-onchain.x402.wtf-00D4AA?style=for-the-badge)](https://onchain.x402.wtf)
[![Model Kit](https://img.shields.io/badge/📦_Model_Kit-models.x402.wtf-8B5CF6?style=for-the-badge)](https://models.x402.wtf)
[![$CLAWD](https://img.shields.io/badge/🪙_$CLAWD-8cHzQHUS...pump-FF6B6B?style=for-the-badge)](https://solscan.io/token/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

<br>

![GitHub Repo](https://img.shields.io/badge/Solizardking-solana--clawd--ai--training-181717?logo=github)
![License](https://img.shields.io/badge/License-Apache_2.0-blue)
![LoRA Params](https://img.shields.io/badge/LoRA-9M_params_(0.6%25)-purple)
![Base Model](https://img.shields.io/badge/Base-Qwen2.5--1.5B--Instruct-orange)
![Training Loss](https://img.shields.io/badge/train_loss-0.9008-success)
![Token Accuracy](https://img.shields.io/badge/token_accuracy-82.9%25-brightgreen)

</div>

---

## 📋 Table of Contents

- [🎯 Overview](#-overview)
- [🚀 Quick Start](#-quick-start)
- [📊 Datasets](#-datasets)
- [🧬 Model Family](#-model-family)
- [⚙️ Training Pipeline](#️-training-pipeline)
- [🔧 Configuration Matrix](#-configuration-matrix)
- [🖥️ NVIDIA Blueprint Integration](#️-nvidia-blueprint-integration)
- [🛠️ Perps Tool Library](#️-perps-tool-library)
- [🔗 Onchain Registry & DAO](#-onchain-registry--dao)
- [📜 Constitution](#-constitution)
- [🧪 Evaluation](#-evaluation)
- [🤖 Model Arena](#-model-arena)
- [📁 Directory Map](#-directory-map)

---

## 🎯 Overview

The **Solana Clawd AI Training Framework** is a complete, one-shot pipeline for training, registering, and serving Solana-native AI models. It ships inside `ai-training/` and includes:

| Component | Description |
|-----------|-------------|
| **36K SFT Dataset** | Curated Solana/DeFi instruction-tuning examples |
| **LoRA Training Pipeline** | Qwen2.5-1.5B-Instruct + Hermes-3-8B fine-tuning |
| **13 Perps Tools** | Phoenix/Jupiter function-calling library |
| **6 NVIDIA Blueprints** | Transaction foundation, distillation, RAG, signal discovery, portfolio optimization, AI-Q |
| **Onchain Registry** | CAAP/1.0 model registration + ZK compressed attestations |
| **Clawd Constitution** | Sovereign AI agent runtime governance |
| **Model Kit CLI** | `clawd-model-kit` — one-shot ingest → train → register |
| **Model Arena** | Multi-provider chat/code benchmark comparison |

---

## 🚀 Quick Start

<div align="center">

```bash
# ─── 1. Clone & Install ───
git clone https://github.com/Solizardking/solana-clawd
cd solana-clawd/ai-training
pip install -r requirements.txt
export HF_TOKEN=hf_...

# ─── 2. Train on Remote GPU (Recommended) ───
./scripts/launch_hf_jobs.sh a100-large   # ~$3-6 for full run

# ─── 3. Train on Local Mac MPS ───
python3 scripts/train_lora.py --num-epochs 1 --no-quant

# ─── 4. Register Model Onchain ───
./dao/register_model.sh \
  --hf-model "YOUR_ORG/your-model-id" \
  --eval-accuracy 0.60 \
  --dataset-size 36109

# ─── 5. Serve Locally ───
ollama create my-clawd -f ollama/Modelfile.finetuned
ollama run my-clawd "How do I detect a rug pull on a fresh Solana token?"
```

</div>

### One-Shot with Model Kit

```bash
# Drop files into data/incoming/, then:
model-kit/bin/clawd-model-kit doctor            # check system
model-kit/bin/clawd-model-kit init              # create dirs
model-kit/bin/clawd-model-kit one-shot \
  data/incoming \
  --dataset-repo solanaclawd/my-dataset \
  --train-dry-run
```

---

## 📊 Datasets

<div align="center">

| Dataset | Examples | Split (train/eval/test) | Status | Domain |
|---------|----------|------------------------|--------|--------|
| **Core AI Instruct** | **35,173** | 31,655 / 1,758 / 1,760 | ✅ Published | Solana, DeFi, ZK, Agent Architecture |
| **Legacy Seed** | **36,109** | 32,498 / 1,805 / 1,806 | ✅ Published | Solana fundamentals, constitutional reasoning |
| **Realtime Research** | **29,058** | 26,152 / 1,452 / 1,454 | ✅ Published | PDFs, notebooks, parquet QA, ZK skills |
| **TX Foundation CPT** | **19,542** | — | ✅ Published | Solana mainnet transactions (4886 vocab) |
| **NVIDIA Trading Factory** | **142** | 127 / 7 / 8 | ✅ Published | Perps, cuML, cuFOLIO, Mean-CVaR |
| **TX Foundation Unified** | **82,169** | 17,262 CPT + 64,907 SFT | ✅ Published | Combined transaction foundation |

</div>

### Dataset Hub IDs

```
solanaclawd/solana-clawd-core-ai-instruct          # 35,173 examples
solanaclawd/solana-clawd-instruct                  # 36,109 examples (legacy)
solanaclawd/solana-clawd-realtime-research-instruct # 29,058 examples
solanaclawd/solana-tx-foundation-cpt               # 19,542 examples
solanaclawd/solana-clawd-nvidia-trading-factory-instruct # 142 examples
solanaclawd/solana-tx-foundation-unified            # 82,169 examples
```

### Data Flow

```
BigQuery (mainnet) ──► Tokenizer (vocab 4886) ──► CPT JSONL ──► TX Foundation Model
PDFs / Notebooks    ──► realtime_dataset_ingest  ──► SFT JSONL  ──► Realtime Dataset
Source Docs         ──► auto_research.py          ──► SFT JSONL  ──► Core AI Dataset
Perps Tools         ──► build_trading_factory     ──► SFT JSONL  ──► NVIDIA Trading Dataset
```

---

## 🧬 Model Family

<div align="center">

| Model | Type | Params | Base | Status |
|-------|------|--------|------|--------|
| `solanaclawd/solana-clawd-core-ai-1.5b-lora` | LoRA Adapter | ~9M (0.6%) | Qwen2.5-1.5B-Instruct | ✅ **Live** |
| `solanaclawd/solana-tx-foundation-1.5b` | Full Model | 1.5B | Qwen2.5-1.5B-Instruct | 🔄 Training |
| `solanaclawd/solana-tx-foundation-7b` | Full Model | 7B | Qwen2.5-7B-Instruct | ⏳ Queued |
| `solanaclawd/clawd-fable` | Full Model | — | AliesTaha/fable-traces | ✅ **Live** |
| `solanaclawd/clawd-fable-lora` | LoRA Adapter | — | AliesTaha/fable-traces | ✅ **Live** |
| `solanaclawd/solana-nvidia-trading-factory-8b-lora` | LoRA Adapter | — | Hermes-3-8B | ✅ **Live** |
| `solanaclawd/clawd-solana-masterpiece-qwen15-lora` | LoRA Adapter | — | Qwen2.5-1.5B | ✅ **Live** |

</div>

### NIM Endpoint Routing

```
NVIDIA_API_KEY set        →  NIM API (nvidia/nemotron-3-nano-30b-a3b)
HF_TOKEN set              →  HF Inference API (nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16)
CLAWD_INFERENCE_URL set   →  Self-hosted Clawd endpoint
CLAWD_ROUTER_KEY set      →  clawd-box-router.fly.dev (free tier)
(fallback)                →  Ollama localhost:11434
```

---

## ⚙️ Training Pipeline

### Architecture

```
data/solana_clawd_merged.jsonl
  │
  ▼
scripts/prepare_dataset.py    ──► HF Dataset splits (90/5/5)
  │                                 data/processed/*.parquet
  ▼
scripts/train_lora.py         ──► LoRA adapter (r=16, α=32, all-linear)
  │                                 data/outputs/solana-clawd-1.5b-lora/
  ▼
scripts/launch_hf_jobs.sh     ──► HF Jobs (A100, H200, L4x1)
  │                                 Push to hub: solanaclawd/...
  ▼
scripts/evaluate.py           ──► Eval results → outputs/eval/
  │
  ▼
dao/register_model.sh         ──► CAAP/1.0 registry → onchain.x402.wtf
```

### Training Hyperparameters

```
┌─────────────────────────────────────────────┐
│  LoRA Rank/Alpha:     16 / 32               │
│  LoRA Dropout:        0.05                  │
│  Target Modules:      q/k/v/o + gate/up/down│
│  Trainable Params:    ~9M (0.6% of base)    │
│  Epochs:              3 (1 for recovery)    │
│  Learning Rate:       2.0e-4 (cosine, 3% WP)│
│  Batch Size:          2 × 8 grad accum = 16 │
│  Max Sequence:        4096 tokens           │
│  Loss:                Assistant-only masked  │
│  Quantization:        4-bit NF4 (optional)   │
│  Hardware:            A100 80GB / MPS (Mac)  │
│  Train Loss:          0.9008                │
│  Token Accuracy:      82.9%                 │
│  Tokens Trained:      24.54M                │
└─────────────────────────────────────────────┘
```

### Local MPS Training (Apple Silicon)

```bash
# Smoke test — 100 steps, float32 (bfloat16 unsupported on MPS)
python3 scripts/train_lora.py \
  --config configs/glm52_lora_config_mac.yaml \
  --num-epochs 1 \
  --no-quant

# Fixes applied for MPS compatibility:
#   device_map: "auto" → {"": "mps"}     (avoid meta-device offload)
#   torch_dtype: bfloat16 → float32      (stable MPS matmul)
#   gradient_checkpointing: false         (PEFT conflict on MPS)
```

---

## 🔧 Configuration Matrix

<div align="center">

| Config File | Base Model | Dataset | Purpose |
|-------------|-----------|---------|---------|
| `configs/lora_config.yaml` | Qwen2.5-1.5B | Core AI (35K) | **Primary SFT config** |
| `configs/core_ai_lora_config.yaml` | Qwen2.5-1.5B | Core AI (35K) | Core AI lane |
| `configs/hermes3_lora_config.yaml` | Hermes-3-8B | Perps (13 tools) | Function-calling + trading |
| `configs/glm52_lora_config.yaml` | Qwen2.5-7B | Core AI (36K) | Full 7B training |
| `configs/glm52_lora_config_mac.yaml` | Qwen2.5-7B | Core AI (27K) | **MPS-compatible 7B** |
| `configs/deep_solana_cpt_config.yaml` | Qwen2.5-1.5B | TX Foundation CPT | Continued pre-training |
| `configs/deepsol_clawd_code_lora_mac.yaml` | Qwen2.5-1.5B | Code SFT | **Code generation MPS** |
| `configs/qwen35_fable5_clawd_lora.yaml` | fable-traces | Clawd Fable SFT | Fable trace training |
| `configs/qwen35_fable5_clawd_lora_mac.yaml` | fable-traces | Clawd Fable SFT | **Fable MPS config** |
| `configs/nvidia_trading_factory_lora_config.yaml` | Hermes-3-8B | Trading Factory (142) | NVIDIA trading LoRA |
| `configs/nvidia_trading_factory_lora_config_mac.yaml` | Hermes-3-8B | Trading Factory (142) | **Trading factory MPS** |
| `configs/nvidia_trading_factory_config.yaml` | Nemotron-3 | Trading Factory (142) | NVIDIA teacher config |
| `configs/autoresearch_wiki_lora_config_mac.yaml` | Qwen2.5-1.5B | AutoResearch SFT | **Wiki research MPS** |
| `configs/autoresearch_wiki_dataset_config.yaml` | — | AutoResearch | Dataset generation |
| `configs/clawd_future_drill_lora_config_mac.yaml` | Qwen2.5-1.5B | Future Drill SFT | **Scenario planning MPS** |
| `configs/clawd_future_refinement_lora_config_mac.yaml` | Qwen2.5-1.5B | Future Refinement SFT | **Refinement MPS** |
| `configs/clawd_masterpiece_lora_config_mac.yaml` | Qwen2.5-1.5B | Masterpiece SFT | **Masterpiece MPS** |
| `configs/eval_config.yaml` | — | Eval dataset | Evaluation runner |
| `configs/realtime_dataset_config.yaml` | — | Realtime data | Dataset ingest config |
| `configs/hauhau_qwen36_llama_cpp.yaml` | Qwen3.6 | llama.cpp | **GGUF quantization** |

</div>

---

## 🖥️ NVIDIA Blueprint Integration

<div align="center">

| # | Blueprint | Directory | Status | Output |
|---|-----------|-----------|--------|--------|
| 1 | **Transaction Foundation Model** | `nvidia/blueprints/transaction-foundation-model/` | 🔄 Training | Solana TX tokenizer (vocab 4886), CPT pipeline |
| 2 | **Model Distillation** | `nvidia/blueprints/model-distillation/` | ✅ Ready | Nemotron teacher → CoT distillation |
| 3 | **Enterprise RAG** | `nvidia/blueprints/enterprise-rag/` | ✅ Ready | Solana doc retrieval pipeline |
| 4 | **Quantitative Signal Discovery** | `nvidia/blueprints/signal-discovery/` | ✅ Ready | Market signal agent |
| 5 | **Portfolio Optimization** | `nvidia/blueprints/portfolio-optimization/` + `nvidia/cufolio/` | ✅ Ready | cuFOLIO Mean-CVaR |
| 6 | **AI-Q** | `nvidia/blueprints/aiq/` | ✅ Ready | Model quality scoring |

</div>

### Transaction Foundation Pipeline

```
BigQuery (crypto_solana_mainnet_us)
  │  query: DEX swaps (Jupiter, Phoenix, Orca, Raydium)
  ▼
SolanaTokenizerPipeline (vocab_size=4886)
  │  PROG_N IX_SWAP MINT_N MINT_N AMT_N AMT_N FEE_N SLOT_N SIDE_BUY STATUS_SUCCESS
  ▼
CPT JSONL (19,542 examples)
  │
  ├──► 01_dataset_baseline.ipynb
  ├──► 02_seq_preproc_tokenization.ipynb
  ├──► 03_foundation_model_training.ipynb
  ├──► 04_inference_embedding_extraction.ipynb
  └──► 05_xgboost_fraud_detection.ipynb
```

### Running NVIDIA Workflows

```bash
# Full TX foundation pipeline
python3 nvidia/blueprints/transaction-foundation-model/pipeline.py \
  --stages cpt sft evaluate

# Signal discovery agent
python3 nvidia/blueprints/signal-discovery/quantitative_signal_agent.py \
  --market SOL --mode paper

# AI-Q evaluation
model-kit/bin/clawd-model-kit nvidia aiq --strict

# All NVIDIA checkpoints
model-kit/bin/clawd-model-kit nvidia verify --strict
```

---

## 🛠️ Perps Tool Library

<div align="center">

**13 Solana Perpetuals Tools** — Drop-in function-calling for any OpenAI-compatible agent

</div>

| Tool | What It Does |
|------|-------------|
| `get_sol_price` | SOL price + 24h change (CoinGecko) |
| `get_token_price` | Any Solana token by symbol or mint |
| `get_perp_markets` | Phoenix DEX perp markets (mark, OI, volume, funding) |
| `get_funding_rate` | Hourly + 8h + annualized funding rate |
| `get_orderbook` | Phoenix order book (top N bids/asks, spread) |
| `check_positions` | Open perp positions for a wallet |
| `check_sol_balance` | SOL + USD balance |
| `get_jupiter_quote` | Best swap route + price impact (Jupiter v6) |
| `paper_trade` | Simulate perp entry (mark, liq, margin, funding) |
| `get_market_overview` | Snapshot: SOL price, TPS, epoch, top markets |
| `get_trader_history` | Recent fills + realized PnL on Phoenix |
| `send_sol` | Transfer SOL (paper mode by default) |
| `assess_position_risk` | Liq price, max loss, funding cost, 1-10 risk score |

```python
from perps.functions import get_openai_tools, call_function

tools = get_openai_tools()  # all 13 tools in OpenAI format

# Direct call
import json
print(json.dumps(call_function("get_sol_price", {}), indent=2))
print(json.dumps(call_function("assess_position_risk", {
    "market": "SOL-PERP", "side": "long", "size_usd": 500, "leverage": 3
}), indent=2))
```

```bash
# Hermes-3 agent
python3 perps/functioncall.py --query "What's the SOL-PERP funding rate?"

# GOAP multi-step reasoning
python3 perps/functioncall.py --goap \
  --query "Assess the risk of shorting SOL-PERP with $1000 at 5x leverage"
```

---

## 🔗 Onchain Registry & DAO

### Three-Layer Registration

```
Layer 1: Off-Chain Index (curl, no wallet)
  curl -X POST https://onchain.x402.wtf/api/register \
    -H "Authorization: Bearer $HF_TOKEN" \
    -d '{"hf_model_id": "...", ...}'
  Returns CAAP/1.0 JSON record

Layer 2: Onchain PDA (Anchor tx, permanent)
  ./dao/register_model.sh --onchain \
    --hf-model "..." --keypair ~/.config/solana/id.json --cluster devnet
  Creates ModelRegistry PDA at seeds ["model", authority]

Layer 3: ZK Attestations (Light Protocol compressed, ~0.00003 SOL)
  pnpm tsx dao/attestation/create_attestation.ts \
    --type dataset --model-id "..." --hash "sha256:..." --compressed
```

### Program Addresses

```
solana_ai_inference:  3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj  (devnet)
SAS Attestation:      ATSPssFHEjvJgAXKkfAWNRqTQW9Wm6JDDVW7Ec1G3zM
Light Protocol Null:  NFLx5WGPrTHHvdRNsidcrNcLxRruMC92E4yv7zhZBoT
$CLAWD Token:         8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
```

### DAO Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLAWD DAO                             │
│                                                              │
│  Genesis Programs (Attribution/Accounting Only):              │
│  ├── ModelRegistry      ── PDA per authority                  │
│  ├── DataSubmission     ── $CLAWD credit per example          │
│  ├── ValidatorAccount   ── Stake + reputation                 │
│  └── SAS Attestations   ── Compressed ZK credentials          │
│                                                              │
│  User Capital (Genesis NEVER touches):                       │
│  └── Percolator Insurance Pools  ── Market-determined rates   │
│                                                              │
│  Governance: Proposal → 72h vote → 1-week Squads timelock    │
│  Emergency: 3-of-5 multisig (pause only, no withdrawals)     │
└──────────────────────────────────────────────────────────────┘
```

### Query the Registry

```bash
# Full index
curl https://onchain.x402.wtf/.well-known/clawd-registry.json | jq .

# Specific model
curl "https://onchain.x402.wtf/api/models?hf_id=solanaclawd/solana-clawd-1.5b"

# Verify attestation onchain (no API trust)
solana account <ATTESTATION_PDA> --url devnet --output json
```

---

## 📜 Constitution

The **Onchain Constitution** governs all Clawd agents at runtime. It is not decorative — it prescribes how agents choose models, route inference, store data, handle failures, and add integrations.

### Core Invariants

```
1.  Usable without a paid model provider
2.  Core functionality requires no single vendor account
3.  Data remains under operator control by default
4.  Every important inference path leaves evidence
5.  Paid inference is an upgrade, not a dependency
6.  Model routing is configurable at the boundary
7.  Failure is logged, not hidden
8.  Deterministic solutions preferred over model calls
9.  Correctness is checkable after the fact
10. Sovereignty and capability are the same requirement
```

### Backend Selection Protocol

```
1. Deterministic local computation
2. Cached result
3. Local or self-hosted model
4. Free no-auth router with ZK receipt
5. Free no-auth router without ZK receipt
6. Paid x402 premium model
7. Paid external provider
8. Manual operator escalation
```

### Constitutional Summary

> **Inference by default. Dependency by choice. Verification over trust. Operator control over vendor gravity. Sovereign by design. On-chain by proof.**

Full constitution: `docs/onchain_constitution.md` (665 lines)

---

## 🧪 Evaluation

```bash
python3 scripts/evaluate.py \
  --config configs/eval_config.yaml \
  --adapter solanaclawd/solana-clawd-core-ai-1.5b-lora \
  --dataset solanaclawd/solana-clawd-eval \
  --out ./outputs/eval \
  --format markdown
```

### What the Model Knows

- [x] Solana mechanics (PDAs, accounts, instructions, rent, compute budgets, Token-2022)
- [x] DeFi primitives (AMMs, CLMMs, perpetuals, bonding curves, Jupiter, Phoenix)
- [x] Memecoin risk (rug detection, holder concentration, deployer forensics)
- [x] Agent architecture (skill registries, brain/hands split, multi-agent coordination)
- [x] ZK compression (Light Protocol, nullifiers, Groth16)
- [x] Code generation (Anchor/Rust, TypeScript @solana/kit, Python)
- [x] Constitutional reasoning (guardrails, refusal patterns)
- [ ] Perps function calling ← Hermes-3 8B path

### Evaluation Metrics

| Metric | Value |
|--------|-------|
| Training Loss | **0.9008** |
| Token Accuracy | **82.9%** |
| Tokens Trained | **24.54M** |
| Samples/sec | **2.73** |

---

## 🤖 Model Arena

The model arena at **models.x402.wtf** compares any OpenAI-compatible provider, plus Anthropic and Gemini:

```
OpenRouter:         nvidia/llama-nemotron, openrouter/fusion, kimi-k2.7-code
Anthropic:          claude-opus-4.8-fast
OpenAI:             gpt-5.2, gpt-5.1-codex-max
xAI:                grok-4.3
NVIDIA:             nemotron-3-ultra-550b-a55b
Qwen:               qwen3.7-plus
DeepSeek:           deepseek-v3.2
```

```bash
# Arena API
GET  /api/arena/providers       # Provider templates + metadata
POST /api/arena/runs             # Start chat or code run
GET  /api/arena/runs/{id}/events # SSE realtime events
GET  /api/arena/runs/{id}        # Recorded outputs + benchmarks
```

---

## 📁 Directory Map

```
train2earn/
├── clawd-training-index/       # Static training index export
├── configs/                    # LoRA/CPT/eval/dataset configs
├── data/                       # LFS-backed datasets, manifests, processed metadata
│   ├── core_ai_processed/
│   ├── model_kit/
│   ├── nvidia_trading_factory_processed/
│   ├── realtime_research_processed/
│   ├── tx_foundation_cpt_processed/
│   ├── incoming/               # Drop zone for model-kit ingest
│   ├── perps/                  # Perps strategy data
│   └── strategies/             # Trading strategies
├── dao/                        # Onchain registry + attestations
│   ├── attestation/            # ZK compressed attestation scripts
│   ├── DAO_DESIGN.md           # Full DAO architecture
│   ├── MODEL_KIT_HANDOFF.md    # Model kit → DAO handoff
│   ├── register_model.sh       # One-shot registration
│   └── register_model.ts       # Anchor TS client
├── docs/                       # Model, dataset, onchain, and session docs
│   ├── model_card.md           # Live model card (624 lines)
│   ├── dataset_card.md         # Dataset documentation (272 lines)
│   ├── onchainai.md            # Onchain registry skill (414 lines)
│   ├── onchain_constitution.md # Constitution (665 lines)
│   ├── clawd_fable.md          # Fable trace training
│   ├── clawd_solana_svm_ai_compute_design.md  # Full protocol spec (1658 lines)
│   ├── hauhau_qwen36.md        # Qwen3.6 quantization
│   └── SESSIONS.md             # Training session logs
├── etc/                        # Mascot images (4K transparent, blueprint grid)
├── memory/                     # Honcho memory server
├── model-kit/                  # Terminal-first training surface
│   ├── bin/clawd-model-kit     # CLI entrypoint
│   ├── clawd_model_kit.py      # Python CLI wrapper
│   ├── frontend/               # models.x402.wtf + register.x402.wtf
│   ├── backend/                # FastAPI arena + status + registration proxy
│   ├── scripts/                # Verification scripts
│   └── docs/                   # 8 documentation files
├── nvidia/                     # NVIDIA blueprint implementations
│   └── blueprints/
│       ├── transaction-foundation-model/  # BigQuery + tokenizer + CPT pipeline
│       ├── model-distillation/            # Nemotron teacher → CoT
│       ├── enterprise-rag/                # Document retrieval
│       ├── signal-discovery/              # Market signals
│       ├── portfolio-optimization/        # cuFOLIO
│       └── aiq/                           # Model quality
├── ollama/                     # Modelfile templates and LFS-backed GGUF builds
├── site/                       # Vite/React source for the training index
│   ├── src/
│   ├── public/
│   └── assets/
├── tools/                      # Static-site and W&B/data sync helpers
├── training-data/              # Source-grounded corpus/SFT/eval workspace
├── wandb/                      # Local/offline W&B runs; ignored by Git
├── .gitattributes              # Git LFS rules and text normalization
└── .gitignore                  # Generated/local cache exclusions
```

Large JSONL datasets, GGUF model builds, vector indexes, model weight formats,
and binary image assets are tracked through Git LFS. Generated dependencies and
local runtime output are ignored: `site/node_modules/`, `site/.npm-cache/`,
`site/dist/`, Python `__pycache__/`, NVIDIA blueprint `.venv/` directories,
`.DS_Store`, `wandb/`, and local training outputs.

---

<div align="center">

### 🧠 Built with

[![Qwen](https://img.shields.io/badge/Qwen2.5-1.5B-0A7CFF)](https://huggingface.co/Qwen)
[![NVIDIA](https://img.shields.io/badge/NVIDIA_Nemotron-76B900?logo=nvidia)](https://build.nvidia.com)
[![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana)](https://solana.com)
[![Hugging Face](https://img.shields.io/badge/Hugging_Face_Jobs-FFD21E)](https://huggingface.co/jobs)
[![Anchor](https://img.shields.io/badge/Anchor-1.0-78C2AD)](https://anchor-lang.com)
[![Light Protocol](https://img.shields.io/badge/Light_Protocol_V2-00D4AA)](https://lightprotocol.com)

---

**Main Repository**: [github.com/Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)  
**Training Repository**: [github.com/Solizardking/solana-clawd-ai-training](https://github.com/solizardking/solana-clawd-ai-training)  
**Model Kit**: [models.x402.wtf](https://models.x402.wtf)  
**Registry**: [onchain.x402.wtf](https://onchain.x402.wtf)  
**Hugging Face**: [huggingface.co/solanaclawd](https://huggingface.co/solanaclawd)  
**$CLAWD**: [8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump](https://solscan.io/token/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

</div>
