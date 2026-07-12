# Skill Relay — realtime catalog sync

Whenever a new skill lands under `skills/` (or an existing one changes), the
relay rebuilds the catalog, keeps GitHub artifacts current, redeploys the
static hub, and can re-anchor the Merkle root on Arweave × Solana.

## Local

```bash
npm run relay              # one-shot: build + smoke + sample install check
npm run relay:watch        # poll skills/ and rebuild on change
npm run relay:push         # rebuild, commit generated files, git push
npm run relay -- --onchain --execute --devnet   # also publish on-chain
npm run relay:upload       # HTTP upload → scan → Solana fee → on-chain pipeline
```

Community uploads (browser + wallet) use the upload relay — see [UPLOAD.md](./UPLOAD.md).

What a relay run does:

1. `npm run build:catalog` — README, HUB, `catalog.json`, public site, Merkle registry
2. `npm run smoke` — frontmatter, uniqueness, public mirrors, verification artifacts
3. Sample install of a few `nvidia/*` skills into `.relay-install-check/`
4. Optional Arweave upload + Solana memo via `publish:onchain`
5. Optional `git commit` / `git push` of generated artifacts

## GitHub Actions

[`.github/workflows/skill-relay.yml`](./.github/workflows/skill-relay.yml)

| Trigger | When |
|---|---|
| `push` to `skills/**` on `main` | Every skill add/edit |
| `workflow_dispatch` | Manual rebuild (+ optional on-chain) |
| `repository_dispatch` `skill-ingest` | External bot/webhook ingest |

### External webhook (bot / form / CLI)

After pushing skill files (or in the same automation), fire:

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GH_TOKEN" \
  https://api.github.com/repos/Solizardking/skills/dispatches \
  -d '{"event_type":"skill-ingest","client_payload":{"publish_onchain":false,"onchain_devnet":true}}'
```

### Secrets (optional)

| Secret | Purpose |
|---|---|
| `SKILLHUB_RELAY_TOKEN` | PAT with `contents:write` if branch protection blocks `GITHUB_TOKEN` pushes |
| `SOLANA_KEYPAIR` | Keypair JSON for Arweave (Irys) + Solana memo when on-chain publish is enabled |
| `SOLANA_RPC_URL` | Optional custom RPC |

## Site deploy

Vercel (and Render) already run `npm run build:catalog` and publish `public/`.
Once the relay commits updated catalog artifacts (or skills land on `main`),
the production site at https://skills.onchainai.fund refreshes on the next deploy.

## On-chain

```bash
npm run publish:onchain                    # dry-run plan
npm run publish:onchain -- --execute --devnet   # free rehearsal
npm run publish:onchain -- --execute            # mainnet (needs funded keypair)
```

See [ONCHAIN.md](./ONCHAIN.md) for verification protocol and receipt format.
Receipts land in `onchain/publish-receipt.json`.
