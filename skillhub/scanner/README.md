# Skill Scanner

Local scanner and browser hub for the 222-skill catalog in this repository.

The scanner is dependency-free Node.js. It reads `catalog.json`, verifies each skill against the generated `public/api/skills/**/verification.json` files and the Merkle registry, runs a static rule pass over published bundle files, and writes a static data file consumed by the hub UI.

## Commands

```bash
npm run scanner:scan
npm run scanner:serve
```

## Upload pipeline integration

Community publishes use the same vetter rules via `scanner/lib/scan-upload.mjs`,
driven by the upload relay:

```bash
npm run relay:upload   # UI + API at http://127.0.0.1:8787
```

Flow: **upload skill → scan → Solana fee → Arweave/memo**. See [UPLOAD.md](../UPLOAD.md).

Open `http://localhost:8877` after the server starts.

Useful direct commands:

```bash
node scanner/bin/scan-skills.mjs --help
node scanner/bin/scan-skills.mjs --all-local
node scanner/bin/scan-skills.mjs --check
```

## Outputs

- `scanner/results/scan-results.json` - full machine-readable scan output.
- `scanner/results/summary.md` - compact human-readable summary.
- `scanner/public/scan-data.js` - browser data loaded by `scanner/public/index.html`.
- `scanner/public/index.html` - static hub for filtering by on-chain/off-chain surface, verification state, risk, category, and install telemetry.

## Verification Model

For each canonical skill, the scanner checks:

1. The generated per-skill verification file exists.
2. Every listed bundle file exists locally and its SHA-256 hash matches.
3. The deterministic bundle hash matches.
4. The skill Merkle leaf matches `sha256(slug + "\0" + bundleHash)`.
5. The leaf is present in `public/api/verification.json`.
6. The registry Merkle root recomputes correctly.
7. The on-chain anchor state is reported from local registry artifacts.

This checkout currently has `onchain/publish-plan.json` but no `onchain/publish-receipt.json`, so the hub reports the registry as planned or anchor-ready rather than fully anchored.

## Install Telemetry

The repository does not include install-count telemetry. The hub therefore shows install counts as unknown unless you provide:

```text
scanner/data/install-metrics.json
```

Use `scanner/data/install-metrics.example.json` as the schema. The scanner never fabricates install counts.

## Cisco Scanner Context

The original Dockerfile still documents how to build Cisco `cisco-ai-skill-scanner` with the local LLM base URL backport. The local scanner added here is separate: it is intended for this repository's static skill catalog and frontend hub.
