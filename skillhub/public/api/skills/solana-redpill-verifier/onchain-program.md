# On-Chain Program

## Contents
- [Files](#files)
- [Instruction dispatch](#instruction-dispatch)
- [V2 PDAs](#v2-pdas)
- [TeeProofV2 layout](#teeproofv2-layout)
- [StoreProofV2 accounts](#storeproofv2-accounts)
- [StoreProofV2 data](#storeproofv2-data)
- [Secp256k1 verification](#secp256k1-verification)
- [Editing rules](#editing-rules)
- [Common build checks](#common-build-checks)

## Files
```text
web/solana-redpill-verifier/program/src/
+-- constants.rs
+-- entrypoint.rs
+-- error.rs
+-- processor/
|   +-- init_counter.rs
|   +-- store_proof.rs
|   +-- store_proof_v2.rs
|   `-- shared/
`-- state/
    +-- proof_counter.rs
    `-- tee_proof.rs
```

## Instruction dispatch
`entrypoint.rs` dispatches by first instruction byte:

| Disc | Instruction | Default use |
|---:|---|---|
| `0` | `InitCounter` | Legacy V1 one-time global counter init |
| `1` | `StoreProof` | Legacy V1 proof storage |
| `2` | `StoreProofV2` | Current proof storage path |

## V2 PDAs
| Account | Seeds | Size | Discriminator |
|---|---|---:|---:|
| `TeeProofV2` | `["tee_proof_v2", signed_payload_hash]` | 372 | `0x56` |
| `ProofCounterDay` | `["proof_counter_day", day_tag]` | 17 | `0x44` |
| `VerifierRegistry` | `["verifier_registry", verifier_pubkey]` | 87 | `0x52` |

`day_tag` is 8 ASCII bytes in `YYYYMMDD` format.

## TeeProofV2 layout
`TeeProofV2` stores:
- `version`
- `verification_level`
- `status`
- `quote_hash`
- `signed_payload_hash`
- `request_hash`
- `response_hash`
- `model_hash`
- `attestation_report_hash`
- `compose_hash`
- `signing_address`
- `verifier_set_hash`
- `policy_version`
- `nonce`
- `expires_at`
- `timestamp`
- `slot`
- `submitter`

Verification levels:

| Value | Constant | Meaning |
|---:|---|---|
| `0` | `StoredOnly` | Stored on-chain without on-chain TEE signature verification |
| `1` | `TeeSigOnchain` | Native secp256k1 signature verified on-chain |
| `2` | `DcapOffchain` | DCAP/NRAS accepted off-chain |
| `3` | `MultiVerifier` | Multiple verifiers accepted |
| `4` | `DcapOnchain` | Reserved for on-chain DCAP path |
| `5` | `ZkAuthorized` | Reserved for Groth16/ZK authorization |

Proof status values are `Active = 0`, `Consumed = 1`, `Revoked = 2`, `Expired = 3`.

## StoreProofV2 accounts
```text
0. payer / submitter   [signer, writable]
1. proof_account       [writable] PDA ["tee_proof_v2", signed_payload_hash]
2. day_counter         [writable] PDA ["proof_counter_day", day_tag]
3. system_program      []
4. instructions_sysvar []
```

The proof account must be uninitialized. The day counter is created on first proof of the day and incremented thereafter.

## StoreProofV2 data
After discriminator `2`, the data is:

```text
secp_ix_index:          u16 LE
verification_level:     u8
signed_payload_hash:    [u8; 32]
quote_hash:             [u8; 32]
request_hash:           [u8; 32]
response_hash:          [u8; 32]
model_hash:             [u8; 32]
attestation_report_hash:[u8; 32]
compose_hash:           [u8; 32]
signing_address:        [u8; 20]
verifier_set_hash:      [u8; 32]
policy_version:         u32 LE
nonce:                  [u8; 32]
expires_at:             i64 LE
day_tag:                [u8; 8]
```

Current total instruction data is 332 bytes including the discriminator.

## Secp256k1 verification
When `verification_level >= 1`, `store_proof_v2.rs` reads the instructions sysvar and checks:
- `secp_ix_index` exists.
- The instruction program is `KeccakSecp256k11111111111111111111111111111`.
- The recovered Ethereum address equals `signing_address`.
- The secp message length is 32.
- The secp message bytes equal `signed_payload_hash`.

If compute budget instructions are inserted before the secp instruction, update `secp_ix_index` to the secp instruction's actual position.

## Editing rules
When changing V2 layout, change all mirrors in the same patch:
- Rust constants and serializers: `constants.rs`, `state/tee_proof.rs`
- Rust processor parsing: `processor/store_proof_v2.rs`
- TypeScript builders and decoders: `clients/typescript/src/instructions.ts`, `accounts.ts`, `types.ts`
- PDA helpers if seeds change: `processor/shared/pda_utils.rs`, `clients/typescript/src/pdas.ts`, `clawd-tee-gateway/src/solana.rs`
- Gateway instruction builder: `clawd-tee-gateway/src/solana.rs`
- IDL if public interface changed: `idl/solana_redpill_verifier.json`

## Common build checks
```bash
cd web/solana-redpill-verifier
cargo check -p solana-redpill-verifier
cargo build-sbf
```

Use `cargo build-sbf` for the deployable SBF artifact. Use `cargo check` for fast non-SBF feedback when iterating on logic.
