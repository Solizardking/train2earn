# Deployment

## Contents
- [Build order](#build-order)
- [On-chain program](#on-chain-program)
- [TypeScript client](#typescript-client)
- [Gateway local run](#gateway-local-run)
- [Gateway Docker run](#gateway-docker-run)
- [SAS init](#sas-init)
- [Health checks](#health-checks)
- [Key handling](#key-handling)
- [Production checklist](#production-checklist)

## Build order
Use this order when preparing a full stack:

1. Build and deploy the on-chain program.
2. Build the TypeScript client from the deployed program interface.
3. Configure and run the gateway with the deployed program ID.
4. Initialize SAS credential/schema if credential issuance is enabled.
5. Run a proof store and lookup smoke test.

## On-chain program
```bash
cd web/solana-redpill-verifier
cargo build-sbf
solana program deploy target/deploy/solana_redpill_verifier.so --url devnet
```

Record the deployed program ID and use it consistently as `REDPILL_PROGRAM_ID` and client `programId`.

Fast compile check:

```bash
cd web/solana-redpill-verifier
cargo check -p solana-redpill-verifier
```

## TypeScript client
```bash
cd web/solana-redpill-verifier/clients/typescript
npm install
npm run build
```

After build, use the CLI for smoke tests:

```bash
node dist/cli.js store-model --model deepseek/deepseek-v4-flash
node dist/cli.js lookup-v2 --payload-hash <64-hex-chars>
node dist/cli.js day-counter --day <YYYYMMDD>
```

## Gateway local run
```bash
cd web/solana-redpill-verifier/clawd-tee-gateway
UPSTREAM_URL=https://api.openai.com \
UPSTREAM_API_KEY=sk-... \
SOLANA_RPC_URL=https://api.devnet.solana.com \
REDPILL_PROGRAM_ID=<deployed-program-id> \
SOLANA_KEYPAIR_PATH=~/.config/solana/id.json \
VERIFICATION_LEVEL=0 \
cargo run
```

Switch to `VERIFICATION_LEVEL=1` only after the signer and native secp instruction path are working.

## Gateway Docker run
```bash
cd web/solana-redpill-verifier/clawd-tee-gateway
cp .env.example .env
docker compose up --build
```

Review `.env` before running. Do not commit it.

## SAS init
With gateway running and `SOLANA_KEYPAIR_PATH` configured:

```bash
curl -X POST http://localhost:8080/v1/credential/init
```

Then send inference requests with:

```text
x-clawd-wallet: <base58-solana-pubkey>
```

## Health checks
Gateway:

```bash
curl http://localhost:8080/health
```

Attestation:

```bash
curl http://localhost:8080/v1/attestation
```

Proof lookup:

```bash
curl http://localhost:8080/v1/proof/<64-hex-signed-payload-hash>
```

Solana account:

```bash
solana account <proof-pda> --url devnet --output json
```

## Key handling
- Keep `.keys/` out of reads, docs, commits, and examples.
- Use `SOLANA_KEYPAIR_PATH` for the fee payer and submitter.
- Use `SIGNING_KEY_PEM_PATH` only inside an approved TEE-backed or sealed-storage path.
- Without `SIGNING_KEY_PEM_PATH`, the TEE signing identity changes every restart.
- Never paste real API keys, keypair arrays, PEM files, or `.env` values into docs or tests.

## Production checklist
- Program ID matches gateway, client, and IDL.
- RPC endpoint is the intended cluster.
- Fee payer has enough SOL for proof PDA rent and transactions.
- `VERIFICATION_LEVEL` matches the actual signature path.
- Gateway signing key persistence is intentional.
- TDX and NRAS failures are observable in logs.
- SAS threshold and schema version are intentional.
- Proof lookup succeeds for a freshly anchored `signed_payload_hash`.
