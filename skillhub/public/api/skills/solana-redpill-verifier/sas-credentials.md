# Solana Attestation Service Credentials

## Purpose
The gateway can issue Solana Attestation Service credentials to wallets that complete enough verified TEE inference requests.

Each credential is a Token-2022 non-transferable NFT containing:
- `proof_count`
- `tee_signing_address`
- `last_proof_hash`

## Source files
```text
web/solana-redpill-verifier/clawd-tee-gateway/src/sas.rs
web/solana-redpill-verifier/clawd-tee-gateway/src/proxy.rs
web/solana-redpill-verifier/clawd-tee-gateway/src/config.rs
```

## Program
The SAS client uses:

```text
22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG
```

from `solana-attestation-service-client`.

## Gateway env
```bash
SAS_PROOF_THRESHOLD=1
SAS_CREDENTIAL_NAME=CLAWD-TEE-GATEWAY
SAS_SCHEMA_NAME=CLAWD-TEE-PROOF-V1
SAS_SCHEMA_VERSION=1
SAS_TOKEN_NAME="CLAWD TEE Verified"
SAS_TOKEN_SYMBOL=CLAWD-TEE
SAS_TOKEN_URI=https://zk.x402.wtf/credential-metadata.json
SAS_EXPIRY_SECS=2592000
```

`SAS_PROOF_THRESHOLD=0` disables SAS issuance. SAS init and issuance require `SOLANA_KEYPAIR_PATH`.

## PDA layout
| Account | Seeds |
|---|---|
| Credential | `["credential", authority, credential_name]` |
| Schema | `["schema", credential_pda, schema_name, schema_version]` |
| Attestation | `["attestation", credential_pda, schema_pda, wallet_pubkey]` |
| Schema mint | `["schemaMint", schema_pda]` |
| Attestation mint | `["attestationMint", attestation_pda]` |

## Issuance flow
1. Caller sends inference requests with `x-clawd-wallet: <base58>`.
2. Gateway anchors or computes a proof and records the payload hash for the wallet.
3. The in-memory counter increments.
4. When `count >= SAS_PROOF_THRESHOLD` and `count % threshold == 0`, gateway issues or re-issues a SAS attestation.
5. Existing attestations are closed best-effort before re-issue so counts can update.
6. The wallet receives a Token-2022 non-transferable NFT when schema tokenization is available.

## Endpoints
Initialize credential and schema:

```bash
curl -X POST http://localhost:8080/v1/credential/init
```

Issue manually:

```bash
curl -X POST http://localhost:8080/v1/credential/issue \
  -H "Content-Type: application/json" \
  -d '{"wallet":"<base58-wallet>"}'
```

Check status:

```bash
curl http://localhost:8080/v1/credential/<base58-wallet>
```

## Implementation notes
- The proof tracker is a `DashMap` in memory, not durable storage.
- `issue_attestation` reads the fee payer from `SOLANA_KEYPAIR_PATH`.
- `send_ix` simulates the SAS instruction to estimate compute units, then sends with compute budget instructions.
- Token-2022 mint account sizing is approximate in the current code. Treat production failures around mint sizing as a code issue, not an RPC issue.

## Common risks
- Missing keypair path: SAS init and issue fail.
- Invalid wallet pubkey: issue/status fails before transaction build.
- Expired attestation: status returns `verified: false` even if account exists.
- Restarted gateway: in-memory `proof_count` may reset, while on-chain attestations remain.
- Schema changes: bump `SAS_SCHEMA_VERSION` if field layout changes.
