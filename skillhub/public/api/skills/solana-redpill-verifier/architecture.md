# Architecture

## Repo map
Primary source tree:

```text
web/solana-redpill-verifier/
+-- program/                Pinocchio SVM program
+-- clients/typescript/     TypeScript SDK and CLI
+-- clawd-tee-gateway/      Rust axum inference proxy and proof anchor
+-- optee/                  Arm TrustZone signer provider
+-- idl/                    JSON IDL
+-- README.md               Current overview
`-- svm.md                  Older SVM handoff, useful for V1 context
```

## Main components
**On-chain program**
- Written with Pinocchio, zero Anchor.
- Dispatches `InitCounter`, `StoreProof`, and `StoreProofV2`.
- Stores one PDA per proof instead of emitting logs as the durable source.
- Uses Solana's native secp256k1 program through the instructions sysvar for V2 signature checks.

**TypeScript client**
- Package name: `@redpill-ai/solana-verifier`.
- Builds instructions, derives PDAs, decodes proof accounts, stores V1/V2 proofs, and exposes CLI helpers.

**CLAWD TEE Gateway**
- Rust/axum OpenAI-compatible proxy.
- Hashes request, response, model, and nonce.
- Signs the V2 payload hash with a TEE secp256k1 key.
- Optionally submits `StoreProofV2` to Solana.
- Adds a `_clawd` proof object to proxied responses.

**OP-TEE provider**
- Normal-world host sends a 32-byte `signed_payload_hash` to a trusted app.
- Secure-world TA returns public key plus recoverable secp256k1 signature.
- Gateway maps the result into the same `StoreProofV2` path used by TDX.

**SAS credentials**
- Gateway tracks verified proof counts per wallet from `x-clawd-wallet`.
- At threshold, it issues a Solana Attestation Service Token-2022 non-transferable NFT.

## V2 proof flow
```text
OpenAI-compatible request
  -> Gateway forwards upstream
  -> Gateway hashes request JSON, response JSON, model, nonce
  -> signed_payload_hash = SHA256("CLAWD_REDPILL_V2:" || hashes || nonce)
  -> TEE signing key signs signed_payload_hash through secp256k1
  -> Gateway optionally gathers TDX quote and NVIDIA NRAS evidence
  -> Gateway builds native secp256k1 ix when verification_level >= 1
  -> Gateway submits StoreProofV2
  -> Program creates TeeProofV2 PDA and bumps ProofCounterDay
  -> Response includes _clawd proof metadata
  -> Wallet may receive SAS credential when threshold is reached
```

## Hashing and signing rules
For CLAWD-native gateway proofs:

```text
request_hash = SHA256(request_json)
response_hash = SHA256(response_json)
model_hash = SHA256(model)
nonce = random 32 bytes
signed_payload_hash = SHA256("CLAWD_REDPILL_V2:" || request_hash || response_hash || model_hash || nonce)
```

The gateway's `TeeSigningKey::sign_hash` signs `keccak256(signed_payload_hash)`, because Solana's native secp256k1 program verifies signatures against the Keccak hash of the provided message data. The message data inside the secp instruction must still be the raw 32-byte `signed_payload_hash`.

For compatibility with existing RedPill signatures, the TypeScript helper `computeSignedPayloadHash(signedMessage)` hashes the signed message bytes. Do not confuse this compatibility path with the gateway's CLAWD-native canonical hash.

## Trust model
The on-chain program does not perform DCAP or NRAS verification itself. It records:
- who submitted the proof;
- the TEE signing address;
- request, response, model, quote, compose, verifier-set, and policy hashes;
- whether an on-chain TEE signature was verified.

Off-chain verifier policy decides how much to trust the evidence behind `quote_hash`, `attestation_report_hash`, `compose_hash`, `verifier_set_hash`, and `policy_version`.

## Security invariants
- A V2 proof PDA must be derived from `signed_payload_hash`, not `quote_hash`.
- When `verification_level >= TeeSigOnchain`, a native secp256k1 instruction must precede `StoreProofV2`.
- The secp instruction must recover the same 20-byte Ethereum-style address stored as `signing_address`.
- The secp message length must be 32 and the message bytes must equal `signed_payload_hash`.
- `expires_at = 0` means no expiry; otherwise expired proofs are rejected at store time.
- `ProofCounterDay` avoids the V1 global counter write lock.

## Legacy V1
V1 maps Ethereum `RedpillProofStore` semantics to Solana:
- PDA: `["tee_proof", quote_hash]`
- global counter PDA: `["proof_counter"]`
- instruction `StoreProof` with optional secp address check

Use V1 only for backwards compatibility, old lookups, or migration tasks.
