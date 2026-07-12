---
name: solana-clawd-agents
description: Use the imported Solana Clawd Agents hub catalog to browse, validate, build, deploy, mint, stake, and integrate production-ready Solana agent definitions, including x402 paid-agent APIs, MCP catalog endpoints, Cloudflare Worker API, Metaplex Core minting, and agent JSON schema workflows.
---

# Solana Clawd Agents

Use this skill when working with the imported Solana Clawd Agents catalog at `agents/`.
It covers agent JSON definitions, catalog generation, API publishing, MCP discovery,
Metaplex Core minting, staking support, x402 paid-agent wiring, Cloudflare API
deployment, and localized public catalog assets.

## Source Snapshot

- Local source imported from `/Users/8bit/agents/agents`
- Hub copy lives at `solana-clawd-agents/agents`
- Primary catalog: `agents/agents-catalog.json`
- Manifest: `agents/agents-manifest.json`
- Agent definitions: `agents/src/*.json`
- Public API snapshot: `agents/public/api/agents/`
- Build entrypoint: `agents/build-catalog.cjs`

## Read Order

1. Read `agents/AGENTS.md` for repo-local operating guidance.
2. Read `agents/README.md` for the catalog, API, minting, staking, and x402 map.
3. For API or deploy work, read `agents/docs/API.md` and `agents/docs/DEPLOYMENT.md`.
4. For x402 work, read `agents/docs/X402_IMPLEMENTATION.md`.
5. For a specific agent, read `agents/src/<agent-id>.json` and compare it with
   `agents/agents-catalog.json`.

## Workflows

- Catalog edits: modify `agents/src/*.json`, then run the local catalog build in
  `agents/`.
- Catalog verification: run `npm test` from `agents/` when Node is available.
- Public API work: compare generated files under `agents/public/api/agents/`
  with `agents/agents-catalog.json`.
- Templates: use `agents/agent-template.json`,
  `agents/agent-template-full.json`, or `agents/agent-template-attested.json`
  as the starting point.
- Minted examples: inspect `agents/minted/*.json` before changing mint-related
  metadata.
- Character definitions: inspect `agents/characters/*.json` for personality or
  runtime profile changes.

## Safety Boundaries

- Do not launch, mint, stake, bind tokens, or register identities on mainnet
  without explicit confirmation.
- Do not store private keys, seed phrases, raw wallet signatures, or wallet
  approval payloads in agent definitions.
- Keep agent permissions bounded: explicit tools, spend caps, wallet authority,
  model/provider, memory policy, and runtime status.
- Use devnet, dry-run, or validation-only commands first for minting, staking,
  and paid-agent flow changes.
