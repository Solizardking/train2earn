# CLAWD TEE Gateway

## Contents
- [Purpose](#purpose)
- [Key files](#key-files)
- [Routes](#routes)
- [Required env](#required-env)
- [Solana env](#solana-env)
- [Attestation env](#attestation-env)
- [Signing key env](#signing-key-env)
- [Policy env](#policy-env)
- [Request proof behavior](#request-proof-behavior)
- [Wallet tracking](#wallet-tracking)
- [Local run](#local-run)
- [Docker run](#docker-run)

## Purpose
`web/solana-redpill-verifier/clawd-tee-gateway` is a Rust/axum OpenAI-compatible proxy that:
- forwards inference requests to an upstream provider;
- hashes request, response, model, and nonce;
- signs a V2 payload hash with a TEE secp256k1 key;
- optionally anchors a `TeeProofV2` PDA on Solana;
- returns `_clawd` proof metadata in the upstream response;
- optionally issues SAS credentials to wallets.

## Key files
| File | Purpose |
|---|---|
| `src/main.rs` | App state, routes, SAS startup init |
| `src/config.rs` | Env-driven configuration |
| `src/proxy.rs` | HTTP handlers and proof construction |
| `src/signing.rs` | TEE signing key lifecycle and payload hash |
| `src/solana.rs` | StoreProofV2 instruction builder and RPC submitter |
| `src/attestation.rs` | TDX quote and NVIDIA NRAS attestation |
| `src/sas.rs` | SAS credential and Token-2022 issuance |
| `src/types.rs` | Request, response, proof, and attestation structs |

## Routes
| Method | Path | Behavior |
|---|---|---|
| `GET` | `/health` | Liveness, signing address, program ID, SAS status |
| `GET` | `/v1/attestation` | Collect TDX quote and optional NRAS GPU claims |
| `POST` | `/v1/chat/completions` | Proxy chat completion and append `_clawd` |
| `POST` | `/v1/completions` | Proxy completion and append `_clawd` |
| `POST` | `/v1/embeddings` | Proxy embeddings and append `_clawd` |
| `GET` | `/v1/proof/:payload_hash` | Lookup a `TeeProofV2` PDA by signed payload hash |
| `POST` | `/v1/credential/init` | Initialize SAS credential/schema |
| `POST` | `/v1/credential/issue` | Issue SAS attestation for a wallet |
| `GET` | `/v1/credential/:wallet` | Check wallet SAS attestation status |

## Required env
```bash
UPSTREAM_URL=https://api.openai.com
UPSTREAM_API_KEY=sk-...
```

## Solana env
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
REDPILL_PROGRAM_ID=BnoUSPTE88ebzLb74RAnTogddDMzyBPtkmKxiRoRJG4L
SOLANA_KEYPAIR_PATH=/keys/solana-keypair.json
```

If `SOLANA_KEYPAIR_PATH` is absent, `anchor_proof_v2` skips submitting the transaction and returns the expected proof PDA with an empty transaction signature.

## Attestation env
```bash
NVIDIA_API_KEY=nvapi-...
NRAS_URL=https://nras.attestation.nvidia.com/v4/attest/gpu
```

If `NVIDIA_API_KEY` is absent, GPU attestation is skipped or stubbed depending on the path. Keep this explicit in status and debugging output.

## Signing key env
```bash
SIGNING_KEY_PEM_PATH=/keys/tee-signing-key.pem
```

Without `SIGNING_KEY_PEM_PATH`, the gateway generates an ephemeral signing key on each boot. This is fine for development and bad for stable production identity.

With `SIGNING_KEY_PEM_PATH`, the key is loaded or generated at that path. In production, that path should be in TEE-backed or otherwise sealed encrypted storage.

## Policy env
```bash
PROOF_TTL_SECS=86400
VERIFICATION_LEVEL=0
```

Set `VERIFICATION_LEVEL=1` only when a 65-byte recoverable secp256k1 signature is available and the native secp instruction is included before `StoreProofV2`.

## Request proof behavior
The proxy computes:

```text
request_hash = SHA256(request_json)
response_hash = SHA256(response_json)
model_hash = SHA256(model)
nonce = random 32 bytes
signed_payload_hash = SHA256("CLAWD_REDPILL_V2:" || request_hash || response_hash || model_hash || nonce)
```

The `_clawd` response includes:
- `request_hash`
- `response_hash`
- `model_hash`
- `signed_payload_hash`
- `signing_address`
- `signature`
- `verification_level`
- `solana_proof_address`
- `solana_tx_sig`
- `nonce`

## Wallet tracking
If requests include:

```text
x-clawd-wallet: <base58-solana-pubkey>
```

the gateway records proof counts in memory and may auto-issue SAS credentials when `SAS_PROOF_THRESHOLD` is reached.

This tracker is in-memory. Restarting the gateway loses unsaved counts unless another persistence layer is added.

## Local run
```bash
cd web/solana-redpill-verifier/clawd-tee-gateway
UPSTREAM_URL=https://api.openai.com \
UPSTREAM_API_KEY=sk-... \
SOLANA_RPC_URL=https://api.devnet.solana.com \
REDPILL_PROGRAM_ID=BnoUSPTE88ebzLb74RAnTogddDMzyBPtkmKxiRoRJG4L \
SOLANA_KEYPAIR_PATH=~/.config/solana/id.json \
cargo run
```

## Docker run
```bash
cd web/solana-redpill-verifier/clawd-tee-gateway
cp .env.example .env
docker compose up --build
```

Do not commit `.env`, keypair JSON, signing key PEM, or mounted secret volumes.
