# On-chain artifacts

## Files

| Path | Committed? | Purpose |
|------|------------|---------|
| `publish-plan.json` | yes | Dry-run / last plan for **catalog** Arweave + Solana memo |
| `publish-receipt.json` | yes | Last successful **catalog** anchor (public explorer links only) |
| `public-ledger.json` | yes | **Redacted** community submissions (safe for GitHub) |
| `submissions/` | **no** (gitignored) | Private job store: full files, scan detail, payment memos |

## Security

Never store in git:

- Solana keypairs / `SOLANA_KEYPAIR` JSON
- Merchant private keys
- `.env` files
- Raw blocked skill bodies that may contain secrets

The public ledger exporter (`npm run ledger:export`) strips:

- Private key / mnemonic / secret patterns
- Finding excerpts and file bodies for blocked jobs
- Anything matching long base58 secret-like blobs in free text

Public fields kept: slug, hashes, risk level, payment signature, explorer URLs, Arweave IDs, payer **public** keys.

## Commands

```bash
npm run ledger:export          # rebuild public-ledger.json + public/api/submissions.json
npm run publish:onchain        # catalog plan
npm run publish:onchain -- --execute --devnet
npm run relay:upload           # community upload API + UI
```

## Hubs

- Primary: https://skills.x402.wtf
- Alias: https://skills.onchainai.fund
- Cheshire: https://cheshireterminal.ai/skills
- Ledger UI: https://skills.x402.wtf/submissions
- API: https://skills.x402.wtf/api/submissions.json
