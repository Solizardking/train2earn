---
name: solana-redpill-verifier
description: Solana RedPill TEE verifier development and operations for the `web/solana-redpill-verifier` stack. Use for Pinocchio SVM proof storage, TeeProofV2 PDA layout, StoreProofV2 transactions, RedPill/TDX and NVIDIA NRAS attestation anchoring, CLAWD TEE Gateway setup, OpenAI-compatible attested inference proxying, Solana Attestation Service Token-2022 credentials, TypeScript client integration, OP-TEE signer integration, deployment, and debugging proof anchoring on Solana.
---

# Solana RedPill Verifier Skill

## What this Skill is for
Use this Skill when the user asks for:
- Solana RedPill verifier implementation in `web/solana-redpill-verifier`
- TEE proof anchoring on Solana with `StoreProofV2`
- `TeeProof`, `TeeProofV2`, `ProofCounterDay`, or verifier PDA layout
- Native Solana secp256k1 proof binding for TEE signatures
- CLAWD TEE Gateway proxying OpenAI-compatible requests and adding `_clawd` proofs
- Intel TDX, Phala verifier, NVIDIA NRAS, or OP-TEE signer integration
- Solana Attestation Service credentials issued from verified TEE inference counts
- TypeScript client usage, CLI commands, proof lookup, or day counters
- Deployment, local testing, Docker, key handling, or production hardening

## Source of truth
Read source files from `web/solana-redpill-verifier` before making code changes.

Do not read or copy secrets from:
- `web/solana-redpill-verifier/.keys`
- real keypair paths referenced by `SOLANA_KEYPAIR_PATH`
- generated build artifacts under `target/` unless a build error requires inspection

Prefer V2 unless the user explicitly asks for legacy V1. `svm.md` is useful historical handoff context, but the README and current source files include newer V2, gateway, SAS, and OP-TEE behavior.

## Key concepts
**TeeProofV2** is the default on-chain account. Its PDA is:

```text
["tee_proof_v2", signed_payload_hash]
```

**StoreProofV2** is instruction discriminator `2`. It stores forensic hashes, a TEE signing address, verification level, status, expiry, nonce, policy metadata, and submitter slot/time.

**signed_payload_hash** binds the proof to an inference. For CLAWD-native gateway proofs it is:

```text
SHA256("CLAWD_REDPILL_V2:" || request_hash || response_hash || model_hash || nonce)
```

**Native secp256k1 verification** is required when `verification_level >= 1`. The secp instruction must sign the exact 32-byte `signed_payload_hash`, and `secp_ix_index` must match its transaction index.

**Gateway anchoring** is optional at runtime. If `SOLANA_KEYPAIR_PATH` is absent, the gateway can still proxy and sign proofs, but Solana anchoring is skipped and only the expected proof PDA is returned.

**SAS credentials** are Token-2022 non-transferable NFT attestations issued when a wallet reaches `SAS_PROOF_THRESHOLD` verified inferences through the gateway.

## Default stack decisions
1. Use `StoreProofV2`, `TeeProofV2`, and `ProofCounterDay` for new work.
2. Keep Rust program constants, TypeScript client builders/decoders, and gateway Solana builders in sync.
3. Use `verification_level = 0` for stored-only development and `verification_level = 1` only when the secp256k1 instruction and signature are present.
4. Treat V1 `InitCounter` and `StoreProof` as backwards-compatible legacy paths.
5. Keep TEE signing keys inside the TEE boundary or an approved sealed-storage path. Never put real keys into skill files, examples, commits, or logs.

## Operating procedure
1. Classify the task:
   - Architecture or flow: read [architecture.md](architecture.md)
   - On-chain program or PDA layout: read [onchain-program.md](onchain-program.md)
   - TypeScript client or CLI: read [typescript-client.md](typescript-client.md)
   - Gateway proxy, signing, anchoring, or env vars: read [gateway.md](gateway.md)
   - SAS credentials: read [sas-credentials.md](sas-credentials.md)
   - OP-TEE signer path: read [optee.md](optee.md)
   - Build, deploy, or operations: read [deployment.md](deployment.md)
   - Failures or transaction errors: read [debugging.md](debugging.md)
2. Inspect the current source files before editing. The skill docs summarize the repo, but code wins.
3. Preserve the V2 security invariants:
   - 32-byte `signed_payload_hash` must be the PDA seed.
   - secp message data must equal `signed_payload_hash`.
   - recovered Ethereum address must equal `signing_address`.
   - `day_tag` must be exactly 8 ASCII bytes, `YYYYMMDD`.
   - `expires_at != 0` must not be in the past at store time.
4. When changing account layout or instruction data, update every mirror:
   - `program/src/constants.rs`
   - `program/src/state/tee_proof.rs`
   - `program/src/processor/store_proof_v2.rs`
   - `clients/typescript/src/accounts.ts`
   - `clients/typescript/src/instructions.ts`
   - `clients/typescript/src/types.ts`
   - `clawd-tee-gateway/src/solana.rs`
   - `idl/solana_redpill_verifier.json` if the public interface changed
5. Verify with the narrowest useful build or test command and report any unrun checks.

## Deliverables expectations
When implementing changes, include:
- Files changed and the exact behavioral change
- Build/test commands run
- Deployment or key-management assumptions
- Risk notes for signer, verifier level, secp index, PDA seeds, or account layout changes

## Progressive disclosure
- System architecture and proof flow: [architecture.md](architecture.md)
- Pinocchio on-chain program and PDA layout: [onchain-program.md](onchain-program.md)
- TypeScript client and CLI: [typescript-client.md](typescript-client.md)
- CLAWD TEE Gateway: [gateway.md](gateway.md)
- Solana Attestation Service credentials: [sas-credentials.md](sas-credentials.md)
- OP-TEE signer provider: [optee.md](optee.md)
- Build and deployment: [deployment.md](deployment.md)
- Debugging guide: [debugging.md](debugging.md)
- Source map and external endpoints: [resources.md](resources.md)
