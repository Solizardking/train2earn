# ⛓️ On-Chain Protocol: Arweave × Solana

How the Skill Hub catalog becomes permanent (Arweave) and verifiable (Solana SVM).

## The Idea

Every build of the hub produces a cryptographic commitment to all catalog skills:

```
skill files ──sha256──▶ bundleHash (per skill)
bundleHash  ──sha256──▶ merkleLeaf  = sha256(slug ∥ bundleHash)
all leaves  ──merkle──▶ merkleRoot  (one hash commits to everything)
```

The Merkle root lives in [`public/.well-known/onchain-skill-registry.json`](./public/.well-known/onchain-skill-registry.json)
alongside per-skill `bundleHash`/`merkleLeaf` values and a `catalogHash` over the full catalog JSON.

Anchoring that one root on Solana proves *the entire catalog* existed, byte-for-byte, at that slot.
Pinning the registry to Arweave means the data behind the proof can never disappear.

## The Pipeline

### Catalog (operator)

```
npm run build:catalog          # 1. hash every skill bundle, emit merkle root + registry
npm run publish:onchain        # 2. dry run — writes onchain/publish-plan.json, prints memo preview
npm run publish:onchain -- --execute          # 3. upload + anchor on mainnet
npm run publish:onchain -- --execute --devnet # …or rehearse on devnet (free Irys uploads)
```

### Single skill (community upload)

```
npm run relay:upload           # browser UI + API: upload → scanner → wallet fee → package/anchor
```

User-submitted skills land in `onchain/submissions/<jobId>/` (private, gitignored) with optional
Irys package and `skillhub:skill:v1|…` memo. A **redacted** ledger is exported to
`onchain/public-ledger.json` and `public/api/submissions.json` for GitHub + https://skills.x402.wtf/submissions.

Full docs: [UPLOAD.md](./UPLOAD.md) · [onchain/README.md](./onchain/README.md) · [DOMAINS.md](./DOMAINS.md).

### Step 2/3 in detail

1. **Arweave upload (paid in SOL)** — the registry and catalog JSON are uploaded through
   [Irys](https://irys.xyz), which accepts SOL for Arweave storage, tagged with:
   `App-Name: skill-hub`, `Type`, `Merkle-Root`, `Catalog-Hash`, `Skill-Count`, `Hub-Url`.
   Tagged uploads are queryable later via Irys/Arweave GraphQL.
2. **Solana anchor** — a memo transaction (program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) records:

   ```
   skillhub:v1|skills:<N>|merkle:sha256-…|catalog:sha256-…|ar:<registryTx>,<catalogTx>
   ```

   One transaction, a few thousand lamports, permanently timestamped by the cluster.
3. **Receipt** — `onchain/publish-receipt.json` stores the Arweave URLs, the Solana signature,
   and the explorer link.

## Requirements for `--execute`

```bash
npm install @irys/upload @irys/upload-solana @solana/web3.js
```

- A funded Solana keypair: `--keypair <path>`, `SOLANA_KEYPAIR`, or `~/.config/solana/id.json`.
- Optional custom RPC: `--rpc <url>` or `SOLANA_RPC_URL`.
- Costs: Arweave storage for ~300 KiB of JSON (fractions of a cent, paid in SOL) + one Solana tx fee.

## Verifying a Skill Later

Anyone can verify any skill against the anchor, with no trust in GitHub or the site:

1. Fetch the anchored memo from Solana (or the receipt) → get `merkleRoot` and the Arweave tx IDs.
2. Fetch the registry from Arweave: `https://arweave.net/<registryTx>`.
3. Recompute the skill's `bundleHash` from its files (sha256 of each file, sorted, per
   `verification.json`), then `merkleLeaf = sha256(slug ∥ bundleHash)`.
4. Walk the Merkle path (leaves sorted as in the registry, pairs hashed upward) to the root.
5. Root matches the memo → the skill is exactly what was anchored. ✅

## Flags Reference

| Flag | Effect |
|---|---|
| *(none)* | Dry run: plan + memo preview, writes `onchain/publish-plan.json` |
| `--execute` | Upload to Arweave and send the Solana memo |
| `--devnet` | Solana devnet + Irys devnet (free test uploads) |
| `--rpc <url>` | Custom RPC endpoint |
| `--keypair <path>` | Keypair JSON to pay and sign with |
| `--skip-arweave` | Re-anchor using the Arweave tx IDs from the last receipt |
