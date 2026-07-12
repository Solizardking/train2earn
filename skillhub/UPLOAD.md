# Upload → Scan → Pay → Publish

Anyone can publish a skill to Skill Hub through a browser UI and the upload relay server.

## Pipeline

```
User uploads SKILL.md (+ optional files)
        │
        ▼
  Local scanner (scanner/lib/scan-upload.mjs)
  · frontmatter validation
  · static security rules (CRITICAL blocks publish)
  · bundle hash + merkle leaf
        │
        ▼
  Solana wallet pays publish fee
  · transfer SOL → SKILLHUB_MERCHANT_WALLET
  · memo: skillhub-publish:<jobId>
        │
        ▼
  Relay confirms payment on RPC
        │
        ▼
  Package skill JSON → optional Irys/Arweave
  + optional Solana memo anchor (needs SOLANA_KEYPAIR)
  → onchain/submissions/<jobId>/
```

## Quick start (local)

```bash
# Terminal 1 — upload relay (serves UI + API)
export SKILLHUB_MERCHANT_WALLET=<your-sol-address>
export SKILLHUB_PAYMENT_NETWORK=devnet
export SKILLHUB_PUBLISH_FEE_LAMPORTS=10000000   # 0.01 SOL
# optional: enable Arweave + memo after payment
# export SOLANA_KEYPAIR=~/.config/solana/id.json
# export SKILLHUB_AUTO_INGEST=1                # write into skills/community/

npm run relay:upload
```

Open **http://127.0.0.1:8787/** (or production **https://skills.x402.wtf/publish**).

1. Paste or drop a skill (`SKILL.md` required).
2. Click **Scan skill**.
3. Connect Phantom/Solflare.
4. **Pay & publish** — signs a fee transfer + memo.
5. Relay verifies the tx and writes a package under `onchain/submissions/`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/config` | Fee, merchant, network, RPC |
| `POST` | `/api/skills/upload` | Upload files → scan → create job |
| `GET` | `/api/skills/:id` | Job status |
| `POST` | `/api/skills/:id/confirm` | `{ signature, payer }` after payment |
| `GET` | `/api/jobs` | Recent jobs |

### Upload body

```json
{
  "slug": "community/my-skill",
  "wallet": "optional-payer-pubkey",
  "files": [
    { "path": "SKILL.md", "content": "---\nname: my-skill\n..." },
    { "path": "references/notes.md", "content": "..." }
  ]
}
```

Binary files may use `"encoding": "base64"`.

## Scanner gate

- **CRITICAL** findings → job `blocked` (no payment accepted).
- **HIGH** → status `caution` (payment still allowed; review first).
- Clean / low → `awaiting_payment`.

Rules live in [`scanner/lib/scan-upload.mjs`](./scanner/lib/scan-upload.mjs) and mirror the catalog scanner.

## On-chain artifact

After a successful confirm (with server keypair):

- Arweave/Irys package tagged `Type: skill-package/v1`
- Solana memo:

  ```
  skillhub:skill:v1|slug:…|bundle:sha256-…|leaf:sha256-…|ar:…|job:…|pay:…
  ```

Without `SOLANA_KEYPAIR`, payment still verifies and the package is stored as
`paid_pending_anchor` for a later catalog relay / operator anchor.

## Env reference

| Variable | Default | Role |
|---|---|---|
| `PORT` / `SKILLHUB_UPLOAD_PORT` | `8787` | Listen port |
| `SKILLHUB_MERCHANT_WALLET` | — | Fee recipient (required to confirm) |
| `SKILLHUB_PUBLISH_FEE_LAMPORTS` | `10000000` | Fee |
| `SKILLHUB_PAYMENT_NETWORK` | `devnet` | `devnet` or `mainnet` |
| `SKILLHUB_PAYMENT_RPC_URL` | public cluster | RPC |
| `SOLANA_KEYPAIR` | `~/.config/solana/id.json` | Irys + memo signer |
| `SKILLHUB_AUTO_INGEST` | off | Write to `skills/community/` |
| `SKILLHUB_UPLOAD_DIR` | `onchain/submissions` | Job store |
| `SKILLHUB_CORS_ORIGIN` | `*` | CORS |

## Deploy notes

- **Static UI**: `public/publish/index.html` is shipped with the hub (`/publish` on Vercel/Render).
- **API**: run `scripts/upload-relay-server.mjs` as a long-lived service (Render web service, Fly, Railway, etc.). Point the UI at it with `?api=https://your-relay.example` if the static site and API are on different hosts.
- Catalog-wide re-anchor remains `npm run publish:onchain` / `npm run relay -- --onchain` (see [ONCHAIN.md](./ONCHAIN.md), [RELAY.md](./RELAY.md)).

## Public ledger (GitHub-safe)

```bash
npm run ledger:export
```

Writes redacted `onchain/public-ledger.json` and `public/api/submissions.json`.
Never includes private keys. See [onchain/README.md](./onchain/README.md).

## Related

- Scanner hub: `/scanner`
- Catalog: https://skills.x402.wtf
- Submissions UI: https://skills.x402.wtf/submissions
- Cheshire: https://cheshireterminal.ai/skills
- Protocol: [ONCHAIN.md](./ONCHAIN.md)
- Domains: [DOMAINS.md](./DOMAINS.md)
