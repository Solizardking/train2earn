# Resources

## Local source map
| Topic | Path |
|---|---|
| Main README | `web/solana-redpill-verifier/README.md` |
| Historical SVM handoff | `web/solana-redpill-verifier/svm.md` |
| Workspace Cargo config | `web/solana-redpill-verifier/Cargo.toml` |
| On-chain program | `web/solana-redpill-verifier/program` |
| Program constants | `web/solana-redpill-verifier/program/src/constants.rs` |
| V2 processor | `web/solana-redpill-verifier/program/src/processor/store_proof_v2.rs` |
| Proof state structs | `web/solana-redpill-verifier/program/src/state/tee_proof.rs` |
| TypeScript client | `web/solana-redpill-verifier/clients/typescript` |
| Gateway | `web/solana-redpill-verifier/clawd-tee-gateway` |
| Gateway env example | `web/solana-redpill-verifier/clawd-tee-gateway/.env.example` |
| OP-TEE provider | `web/solana-redpill-verifier/optee` |
| IDL | `web/solana-redpill-verifier/idl/solana_redpill_verifier.json` |

## Package and crate names
| Component | Name |
|---|---|
| Program crate | `solana-redpill-verifier` |
| Gateway crate/bin | `clawd-tee-gateway` |
| TypeScript package | `@redpill-ai/solana-verifier` |

## Important program IDs
Native Solana secp256k1 program:

```text
KeccakSecp256k11111111111111111111111111111
```

Solana Attestation Service:

```text
22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG
```

Default verifier program ID in gateway config:

```text
BnoUSPTE88ebzLb74RAnTogddDMzyBPtkmKxiRoRJG4L
```

Always verify the deployed program ID for the current cluster instead of assuming the default is correct.

## External verifier endpoints from source
RedPill API base:

```text
https://api.redpill.ai
```

Phala TDX verifier:

```text
https://cloud-api.phala.network/api/v1/attestations/verify
```

NVIDIA NRAS GPU verifier:

```text
https://nras.attestation.nvidia.com/v4/attest/gpu
```

The TypeScript client still references NVIDIA NRAS v3 in `verify.ts` for one helper. Check source before changing endpoint behavior.

## Common commands
```bash
cd web/solana-redpill-verifier
cargo check -p solana-redpill-verifier
cargo build-sbf
solana program deploy target/deploy/solana_redpill_verifier.so --url devnet

cd clients/typescript
npm install
npm run build

cd ../../clawd-tee-gateway
cargo build --release
cargo run
```

## File exclusions
Avoid loading or emitting:
- `.keys/`
- `.env`
- real Solana keypair JSON
- signing key PEM files
- `target/` artifacts unless debugging a build artifact
- generated `clients/typescript/dist/` unless confirming package output after build
