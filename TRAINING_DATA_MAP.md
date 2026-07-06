# Training Assets Map

Inventory of Clawd/Solana training datasets and model outputs across the machine.
Generated 2026-07-05.

## 1. Standalone datasets (outside solana-clawd)

| Path | Size / Rows | Format | What it is |
|---|---|---|---|
| `/Users/8bit/drive/clawd_masterpiece_sft.jsonl` | 306 MB / 82,221 | chat `messages` | Largest SFT set. DeepSolanaZKr-1 persona (ZK proofs + Solana dev + DeFi + on-chain agents). Source for the "masterpiece" Qwen LoRA runs. |
| `/Users/8bit/drive/solana_clawd_reasoning_tooling_sft.jsonl` | 237 MB / 64,408 | chat `messages` | Same DeepSolanaZKr-1 persona, focused on auditable reasoning summaries + tool use. |
| `/Users/8bit/zk-router/data/hf-upload/solana-private-datasets/data/train.jsonl` | 84 MB / 36,062 | Alpaca `instruction/input/output` + provenance metadata | Built by the `zk-router-dataset-upload` pipeline from `zk-router/data/skills/*` sources (each row carries source_file + sha256 + line). Staged for HF upload as `solana-private-datasets`. |
| `/Users/8bit/zk-router/data/skills/trainingday.jsonl` | 75 MB / 27,092 | chat `messages` | Solana RPC / Alchemy API Q&A pairs. One of the skill sources feeding the private dataset above. |

## 2. `solana-clawd/ai-training/data/` — dataset lane

Each dataset follows the pattern: `<name>_sft.jsonl` (source) + `<name>_dataset_card.md` + `<name>_manifest.json` + `<name>_processed/` (HF `save_to_disk` with train/eval/test).

| Dataset | Rows | Splits (train/eval/test) | HF repo_id | Notes |
|---|---|---|---|---|
| `core_ai_clawd_sft.jsonl` (96 MB) | 35,173 | see `core_ai_processed/` | `solanaclawd/solana-clawd-core-ai-instruct` | DeepSolanaZKr-1 chat instruct. Parquet release in `outputs/hf_release_bundle_all/datasets/core_ai/`. |
| `realtime_research_sft.jsonl` (98 MB) | 29,058 | 26,152 / 1,452 / 1,454 | `solanaclawd/solana-clawd-realtime-research-instruct` | Source-grounded from 28 sources (PDFs, notebooks, parquet); 296 secret/invalid rows skipped. `realtime_research_processed/` is **empty** — the processed copy lives only in the release bundle. |
| `nvidia_trading_factory_sft.jsonl` (628 KB) | 195 | 175 / 9 / 11 | `solanaclawd/solana-clawd-nvidia-trading-factory-instruct` | Clawd Trading Factory persona: RAPIDS/cuML/cuOpt/cuFOLIO/NeMo GPU trading pipelines. |
| `tx_foundation_cpt.jsonl` (20 MB) | 19,542 | 17,587 / 977 / 978 | (see manifest) | Continued-pretraining `text` of `<tx_context>` Jupiter swap/tx records. Trained `nvidia/outputs/solana-tx-foundation-1.5b`. |
| `clawd_fable_sft.jsonl` (13 MB) | 3,052 | — | — | ChatML `text` rows of project-context pairs. Trained `clawd-fable-lora-local`. |
| `clawd_code_deepsol_sft.jsonl` (1.1 MB) | 1,485 | — | — | Plain Human/Assistant coding transcripts. Trained `deepsol-clawd-code-merged`. |
| `jupiter_txs.jsonl` (220 KB) | 500 | — | — | Raw Jupiter swap-quote contexts; feedstock for tx_foundation CPT. |
| `solana_clawd_seed.jsonl` | 85 | — | — | Clawd persona seed conversations. |
| `solana_clawd_merged.jsonl` (41 MB) | 30,365 | — | — | Merged DeepSolanaZKr-1 training set. |
| `solana_clawd_eval.jsonl` | 13 | — | — | Red-team/behavior eval set (see `eval_card.md`). |

### Supporting dirs in `data/`
- `core_ai_processed/`, `nvidia_trading_factory_processed/`, `tx_foundation_cpt_processed/`, `processed/` — HF `datasets` save_to_disk dirs (train/eval/test arrow).
- `model_kit/` (324 MB) — Onchain Model Kit lane: `bigquery_solana_mainnet_cpt.jsonl` (+mock), `clawd_autoresearch_wiki_sft.jsonl` + card/manifest/processed, future-drill sets.
- `nemo_clawd/` (7.6 MB) — source-grounded build: `corpus/` (pdf/repo chunks), `sft/chat_finetune.jsonl`, `preference/risk_preferences.jsonl` (chosen/rejected safety pairs), `eval/source_grounded_eval.jsonl`, `manifests/`, `reports/`. Described by `nemo_clawd_README.md` + card + manifest.
- `nvidia_rag_store/` — `chunks.jsonl` + `index.faiss` RAG store.
- `perps/` — `nvidia_perps_handoff.json` (perps pipeline handoff).
- `strategies/` — 8 strategy/handoff JSONs: cuFOLIO mean-CVaR, SOL EMA/ADX trend, MACD/ADX trim, RSI mean-reversion paper strategies, nemo_clawd blueprint/inventory, NVIDIA agent plan, Rise market-data plan.
- `signal_discovery_report.json` — market scan verdicts/regimes/confidence.
- `nvidia_aiq_eval.json` — NVIDIA AIQ plan eval + release gate result.
- `incoming/` — empty staging dir.

## 3. Model outputs

All LoRA runs use r=16 / alpha=32 on all attention+MLP projections unless noted.

| Output | Base model | Steps / epoch | Last loss | Trained on |
|---|---|---|---|---|
| `outputs/clawd-solana-masterpiece-qwen15-lora-mac-v2` | Qwen2.5-1.5B-Instruct | 64 / 0.30 | 1.12 | masterpiece SFT |
| `outputs/clawd-solana-masterpiece-qwen15-lora-mac-v3` | Qwen2.5-1.5B-Instruct | 192 / 0.33 | **0.29** | masterpiece SFT (best of the three) |
| `outputs/clawd-autoresearch-wiki-qwen15-lora-mac` | Qwen2.5-1.5B-Instruct | 24 / 0.21 | 1.86 | model_kit autoresearch-wiki SFT |
| `outputs/clawd-fable-lora-local/checkpoint-4` | AliesTaha/fable-traces (r=4/α=8) | 4 / 0.5 | 2.66 | clawd_fable_sft — smoke-test scale |
| `outputs/deepsol-clawd-code-merged` | GPT-2 (124M class), fully merged 241 MB | — | — | clawd_code_deepsol_sft |
| `nvidia/outputs/solana-tx-foundation-1.5b/sft/checkpoint-500` | Qwen2.5-1.5B-Instruct | 500 / 0.28 | 0.79 | tx_foundation_cpt |
| `nvidia/outputs/solana-tx-foundation-1.5b/sft/checkpoint-1000` | Qwen2.5-1.5B-Instruct | 1000 / 0.55 | **0.74** | tx_foundation_cpt (later checkpoint) |

## 4. `outputs/hf_release_bundle_all/` — HF upload bundle

Three datasets packaged for Hugging Face (README + release_manifest + source.jsonl + parquet splits each):

| Bundle dataset | repo_id | train / eval / test parquet |
|---|---|---|
| `datasets/core_ai/` | `solanaclawd/solana-clawd-core-ai-instruct` | 81 MB / 4.5 MB / 4.6 MB |
| `datasets/realtime_research/` | `solanaclawd/solana-clawd-realtime-research-instruct` | 79 MB / 4.4 MB / 4.4 MB |
| `datasets/trading_factory/` | `solanaclawd/solana-clawd-nvidia-trading-factory-instruct` | 336 KB / 24 KB / 16 KB |

`bundle_manifest.json` at bundle root lists all files; `UPLOAD.md` has the upload procedure.

## 5. Lineage (dataset → model)

```
jupiter_txs.jsonl ──► tx_foundation_cpt.jsonl ──► solana-tx-foundation-1.5b (ckpt-500 → ckpt-1000)
clawd_masterpiece_sft.jsonl ──► clawd-solana-masterpiece-qwen15-lora-mac (v2 → v3)
model_kit/clawd_autoresearch_wiki_sft.jsonl ──► clawd-autoresearch-wiki-qwen15-lora-mac
clawd_fable_sft.jsonl ──► clawd-fable-lora-local
clawd_code_deepsol_sft.jsonl ──► deepsol-clawd-code-merged (GPT-2, merged)
core_ai_clawd_sft.jsonl / realtime_research_sft.jsonl / nvidia_trading_factory_sft.jsonl ──► hf_release_bundle_all (parquet, HF-ready)
zk-router/data/skills/*.jsonl (incl. trainingday.jsonl) ──► zk-router hf-upload solana-private-datasets/train.jsonl
```
