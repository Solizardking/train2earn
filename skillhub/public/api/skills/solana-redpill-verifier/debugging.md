# Debugging

## Contents
- [First checks](#first-checks)
- [Gateway health](#gateway-health)
- [No Solana transaction signature](#no-solana-transaction-signature)
- [Proof already exists](#proof-already-exists)
- [PDA mismatch](#pda-mismatch)
- [Secp instruction not found](#secp-instruction-not-found)
- [Secp address mismatch](#secp-address-mismatch)
- [Secp message hash mismatch](#secp-message-hash-mismatch)
- [Proof expired](#proof-expired)
- [Day counter errors](#day-counter-errors)
- [Gateway upstream errors](#gateway-upstream-errors)
- [TDX or NRAS errors](#tdx-or-nras-errors)
- [SAS failures](#sas-failures)
- [Layout mismatch after code changes](#layout-mismatch-after-code-changes)

## First checks
```bash
cd web/solana-redpill-verifier
git status --short
```

Do not inspect `.keys/` or real keypair files. Confirm the active cluster, program ID, and keypair path before transaction debugging:

```bash
solana config get
echo "$SOLANA_RPC_URL"
echo "$REDPILL_PROGRAM_ID"
```

## Gateway health
```bash
curl http://localhost:8080/health
```

Check:
- `signing_address` is present.
- `program_id` matches the deployed verifier.
- `sas_initialized` matches expectations.
- `sas_threshold` is not accidentally `0` when credentials should issue.

## No Solana transaction signature
If `_clawd.solana_tx_sig` is empty:
- `SOLANA_KEYPAIR_PATH` may be unset.
- The gateway may be in attestation-only mode.
- The proof may already exist and submit was skipped.
- RPC send may have failed; check gateway logs around `Solana anchor failed`.

## Proof already exists
V2 proof PDAs are one-shot because the PDA seed is `signed_payload_hash`.

If storage returns an existing proof:
- Reuse the existing PDA for lookup.
- Generate a new nonce for a new inference.
- Do not try to overwrite the account unless adding an explicit new lifecycle instruction.

## PDA mismatch
Check seed and byte lengths:
- `signed_payload_hash` must be 32 bytes.
- `day_tag` must be 8 ASCII bytes, `YYYYMMDD`.
- Program ID must be the deployed verifier program, not the SAS program.
- Rust, TypeScript, and gateway seed constants must match.

Files to compare:
- `program/src/constants.rs`
- `program/src/processor/shared/pda_utils.rs`
- `clients/typescript/src/pdas.ts`
- `clawd-tee-gateway/src/solana.rs`

## Secp instruction not found
Likely causes:
- `verification_level >= 1` but no secp instruction was included.
- `secp_ix_index` points at the wrong instruction.
- Compute budget instructions were inserted before secp without updating `secp_ix_index`.
- The transaction used the wrong program ID for native secp256k1.

The expected program ID is:

```text
KeccakSecp256k11111111111111111111111111111
```

## Secp address mismatch
Check:
- `signing_address` is exactly 20 bytes.
- It is derived as `keccak256(uncompressed_pubkey[1..65])[12..32]`.
- Signature recovery ID is normalized to `0` or `1`, not `27` or `28`.
- The TEE signing key used for the signature is the key whose address was stored.

## Secp message hash mismatch
The secp instruction message must be exactly 32 bytes and equal to `signed_payload_hash`.

Do not pass:
- a hex string of the hash;
- the original request JSON;
- the RedPill signature text;
- `SHA256(signed_payload_hash)`.

The native secp program applies Keccak internally to the message data.

## Proof expired
If `expires_at != 0`, the program rejects proofs whose expiry is before the Solana clock timestamp.

Check:
- gateway `PROOF_TTL_SECS`;
- local clock only for generated expiry;
- cluster clock through transaction simulation or logs.

Set `PROOF_TTL_SECS=0` only when no expiry is intended.

## Day counter errors
The day counter PDA is auto-created on first proof for a day.

Check:
- payer has enough SOL for rent;
- day tag is ASCII `YYYYMMDD`;
- day counter account is writable;
- system program is present;
- program ID matches the verifier.

Lookup with:

```bash
cd web/solana-redpill-verifier/clients/typescript
node dist/cli.js day-counter --day <YYYYMMDD>
```

## Gateway upstream errors
For `GatewayError::Upstream`:
- confirm `UPSTREAM_URL` has no wrong path suffix;
- confirm `UPSTREAM_API_KEY` is set;
- inspect upstream HTTP status in the error body;
- remember caller `Authorization` header overrides the configured upstream key.

## TDX or NRAS errors
TDX:
- `/dev/tdx_guest` may be absent outside TDX.
- Stub behavior may be active depending on backend detection.
- Phala verifier failures do not mean Solana storage failed.

NRAS:
- `NVIDIA_API_KEY` may be missing.
- `NRAS_URL` defaults to NVIDIA v4 in the gateway.
- GPU evidence collection may be placeholder unless the NVIDIA attestation SDK is wired.

## SAS failures
SAS init or issue requires:
- `SOLANA_KEYPAIR_PATH`;
- funded fee payer;
- valid wallet pubkey;
- SAS credential/schema initialized;
- enough compute and correct Token-2022 sizing.

If status shows unverified but the account exists, check expiry.

## Layout mismatch after code changes
Symptoms:
- TypeScript decoder rejects discriminator or account size.
- Gateway lookup returns raw `data_hex` but client decode fails.
- IDL consumers disagree with instruction data.

Fix by updating every mirror listed in [onchain-program.md](onchain-program.md), then rebuild the client and SBF program.
