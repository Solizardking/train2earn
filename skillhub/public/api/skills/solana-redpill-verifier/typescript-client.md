# TypeScript Client

## Contents
- [Package](#package)
- [Public modules](#public-modules)
- [Main V2 exports](#main-v2-exports)
- [Store a V2 proof](#store-a-v2-proof)
- [Lookup a V2 proof](#lookup-a-v2-proof)
- [Day counter lookup](#day-counter-lookup)
- [CLI](#cli)
- [V1 compatibility](#v1-compatibility)
- [Sync rules](#sync-rules)

## Package
Client source lives in:

```text
web/solana-redpill-verifier/clients/typescript
```

Package name:

```text
@redpill-ai/solana-verifier
```

Build:

```bash
cd web/solana-redpill-verifier/clients/typescript
npm install
npm run build
```

## Public modules
| File | Purpose |
|---|---|
| `src/index.ts` | Public exports |
| `src/pdas.ts` | PDA derivation helpers |
| `src/accounts.ts` | V1/V2 account decoders |
| `src/instructions.ts` | Raw Solana instruction builders |
| `src/types.ts` | Client types, verification levels, proof status |
| `src/verify.ts` | High-level verification and store helpers |
| `src/cli.ts` | CLI entrypoint |

## Main V2 exports
- `computeSignedPayloadHash`
- `storeProofV2Onchain`
- `lookupProofV2`
- `lookupDayCounter`
- `buildStoreProofV2Instruction`
- `buildSecp256k1InstructionV2`
- `findTeeProofV2Pda`
- `findProofCounterDayPda`
- `decodeTeeProofV2`
- `VerificationLevel`
- `ProofStatus`

## Store a V2 proof
```ts
import { Keypair } from "@solana/web3.js";
import {
  VerificationLevel,
  computeSignedPayloadHash,
  storeProofV2Onchain,
} from "@redpill-ai/solana-verifier";

const signedPayloadHash = await computeSignedPayloadHash(signedMessageBytes);

const result = await storeProofV2Onchain(
  {
    rpcUrl: "https://api.devnet.solana.com",
    programId: "YOUR_PROGRAM_ID",
  },
  signer as Keypair,
  {
    signedPayloadHash,
    signingAddress,       // Uint8Array[20]
    quoteHash,            // Uint8Array[32]
    requestHash,          // Uint8Array[32]
    responseHash,         // Uint8Array[32]
    modelHash,            // Uint8Array[32]
    verificationLevel: VerificationLevel.StoredOnly,
  },
);

console.log(result.txSig);
console.log(result.proofAddress.toBase58());
```

For `VerificationLevel.TeeSigOnchain`, include a 65-byte secp256k1 signature and ensure the message signed by the secp instruction is the exact `signedPayloadHash` bytes.

## Lookup a V2 proof
```ts
import { lookupProofV2 } from "@redpill-ai/solana-verifier";

const proof = await lookupProofV2(
  {
    rpcUrl: "https://api.devnet.solana.com",
    programId: "YOUR_PROGRAM_ID",
  },
  signedPayloadHash,
);

console.log(proof?.verificationLevel);
console.log(proof?.status);
```

## Day counter lookup
```ts
import { lookupDayCounter } from "@redpill-ai/solana-verifier";

const counter = await lookupDayCounter(network, "20260619");
console.log(counter?.count);
```

## CLI
Build first, then run:

```bash
cd web/solana-redpill-verifier/clients/typescript
npm install
npm run build

node dist/cli.js store-model --model deepseek/deepseek-v4-flash
node dist/cli.js lookup-v2 --payload-hash <64-hex-chars>
node dist/cli.js day-counter --day 20260619
node dist/cli.js hash-message --message "CLAWD_REDPILL_V2:..."
node dist/cli.js lookup --quote-hash <64-hex-chars>
```

## V1 compatibility
V1 helpers remain available:
- `storeProofOnchain`
- `lookupProof`
- `buildStoreProofInstruction`
- `buildSecp256k1Instruction`
- `findTeeProofPda`
- `findProofCounterPda`

Use these only for legacy `TeeProof` accounts keyed by `quote_hash`.

## Sync rules
If a Rust account layout changes, update `accounts.ts`.
If instruction data changes, update `instructions.ts`.
If seeds change, update `pdas.ts`.
If enum constants change, update `types.ts`.

Generated `dist/` files should be rebuilt with `npm run build`; do not hand-edit them.
