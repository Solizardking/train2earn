---
name: solana-rent-free-dev
description: >
  Skill for Solana development using compressed accounts from Light Protocol.
  Covers compressed token client development (TypeScript) and compressed PDA
  program development (Rust) across Anchor, native Rust, and Pinocchio. Use cases
  include token distribution, stablecoin payments, per-user and app state,
  nullifiers, and ZK applications.
compatibility: |
  Requires ZK Compression CLI, Solana CLI, Anchor CLI, and Node.js.
metadata:
  mintlify-proj: lightprotocol
  openclaw:
    requires:
      env: []
      bins: ["node", "solana", "anchor", "cargo", "light"]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - WebFetch(https://zkcompression.com/*)
  - WebFetch(https://github.com/Lightprotocol/*)
  - WebSearch
  - mcp__zkcompression__SearchLightProtocol
  - mcp__deepwiki__ask_question
---

## Capabilities

ZK Compression is a framework on Solana for token distribution, stablecoin payments, consumer apps, and per-user state. The Light SDK and APIs let you create token and PDA accounts without rent-exemption, with a familiar Solana developer experience.

### Primitives

| Primitive        | Use case                                                                                                                                                            | Constraints                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Compressed Token | Token use cases such as token distribution, stablecoin payments, and storing balances rent-free. Always compressed and rent-free. Works with SPL and Token-2022. Supported by Phantom and Backpack. | The SPL mint and interface PDA pay rent; individual token accounts do not. |
| Compressed PDA   | Per-user and app state, nullifiers (payments and ZK applications), DePIN nodes, and stake accounts. Derived like a program-derived address, without a rent-exempt balance. | Programs invoke the Light System Program (not the System Program) with a validity proof. |

View the SDK reference: https://www.zkcompression.com/api-reference/sdk.

### Creation cost

| Creation cost      | Compressed           | Standard Solana      |
| ------------------ | -------------------: | -------------------: |
| **Token account**  | **~5,000 lamports**  | ~2,000,000 lamports  |
| **PDA (100-byte)** | **~15,000 lamports** | ~1,600,000 lamports  |

### Install

Install the orchestrator agent skill or view [skill.md](https://www.zkcompression.com/skill.md):

```bash
npx skills add https://zkcompression.com
```

Install or view [dedicated agent skills](/ai-tools/overview#agent-skills):

```
npx skills add Lightprotocol/skills
```

## Workflow

1. **Clarify intent**
   - Recommend plan mode, if it's not activated
   - Use `AskUserQuestion` to resolve blind spots
   - All questions must be resolved before execution
2. **Identify references and skills**
   - Match the task to the available [skills](#skills) below
   - Locate relevant documentation and examples
3. **Write plan file** (YAML task format)
   - Use `AskUserQuestion` for anything unclear — never guess or assume
   - Identify blockers: permissions, dependencies, unknowns
   - Plan must be complete before execution begins
4. **Execute**
   - Use `Task` tool with subagents for parallel research
   - Subagents load skills via `Skill` tool
   - Track progress with `TodoWrite`
5. **When stuck**: spawn a subagent with `Read`, `Glob`, `Grep`, DeepWiki MCP access and load `skills/ask-mcp`

## Skills

| Use case                                                                                                                          | Skill                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| For token use cases on Solana, such as token distribution, stablecoin payments and more. Works with Token-2022, Privy, Wallet Adapter similarly to SPL. | [compressed-token](https://github.com/Lightprotocol/skills/tree/main/skills/compressed-token) |
| For program development on Solana with infrequently accessed state, such as per-user state, DePIN registrations, nullifiers, or custom compressed accounts | [compressed-pda](https://github.com/Lightprotocol/skills/tree/main/skills/compressed-pda)     |
| For custom ZK Solana programs and privacy-preserving applications to prevent double spending                                      | [zk](https://github.com/Lightprotocol/skills/tree/main/skills/zk)                             |
| For testing with Light Protocol programs and clients on localnet, devnet, and mainnet validation                                  | [testing](https://github.com/Lightprotocol/skills/tree/main/skills/testing)                   |
| For questions about compressed accounts, Light SDK, Solana development, Claude Code features, or agent skills                      | [ask-mcp](https://github.com/Lightprotocol/skills/tree/main/skills/ask-mcp)                   |

## Context

- SDK reference: https://zkcompression.com/api-reference/sdk

### Compressed token

Compressed token accounts store balance, owner, mint, and delegate like SPL token accounts, without paying rent-exemption. Any SPL or Token-2022 token can be compressed and decompressed at will. Wallets like Phantom and Backpack display them alongside SPL tokens.

A compressed token uses a standard SPL (or Token-2022) mint plus an interface PDA. The interface PDA is an omnibus account that locks SPL tokens while they are compressed and releases them on decompression. The SPL mint and interface PDA pay rent like regular SPL accounts; individual compressed token accounts are rent-free.

Use for: token distribution and airdrops, stablecoin payments, and storing token balances rent-free.

### Compressed PDA

Compressed PDAs are derived using a program address and seed, like regular PDAs. A program invokes the Light System Program (not the System Program) to create and update them. Creating an account requires a validity proof that the derived address does not yet exist; updates, closes, and burns require a proof that the account exists.

Persistent unique identification. Program ownership. CPI between compressed and regular PDAs.

Use for: per-user state, app state, nullifiers for payments and ZK applications, DePIN node accounts, and stake accounts.

## Examples

### Compressed token client (`@lightprotocol/compressed-token`)

Operations use `@lightprotocol/compressed-token` with `createRpc()` from `@lightprotocol/stateless.js`.

| Operation                | GitHub example                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createMint`             | [create-mint](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/create-mint.ts)                          |
| `createTokenPool`        | [create-token-pool](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/create-token-pool.ts)              |
| `mintTo`                 | [mint-to](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/mint-to.ts)                                  |
| `transfer`               | [transfer](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/transfer.ts)                                |
| `approve` / `revoke`     | [approve](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/approve.ts) \| [revoke](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/revoke.ts) |
| `compress`               | [compress](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/compress.ts)                                |
| `decompress`             | [decompress](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/decompress.ts)                            |
| `compressSplTokenAccount`| [compress-spl-account](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/compress-spl-account.ts)         |
| `mergeTokenAccounts`     | [merge-token-accounts](https://github.com/Lightprotocol/examples-zk-compression/blob/main/compressed-token-cookbook/actions/merge-token-accounts.ts)        |

### Token distribution

| Flow              | GitHub example                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Simple airdrop    | [simple-airdrop](https://github.com/Lightprotocol/examples-zk-compression/tree/main/example-token-distribution/src/simple-airdrop)     |
| Optimized airdrop | [optimized-airdrop](https://github.com/Lightprotocol/examples-zk-compression/tree/main/example-token-distribution/src/optimized-airdrop) |

### Compressed PDA programs (`light-sdk`)

| Example                                                                                                          | Description                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [counter](https://github.com/Lightprotocol/program-examples/tree/main/counter)                                  | Full lifecycle (create, update, close) in Anchor, native, and Pinocchio  |
| [basic-operations](https://github.com/Lightprotocol/program-examples/tree/main/basic-operations)                | Create, update, close, reinitialize, burn (Anchor and native)            |
| [create-and-update](https://github.com/Lightprotocol/program-examples/tree/main/create-and-update)              | Create and update with a single validity proof in one instruction        |
| [account-comparison](https://github.com/Lightprotocol/program-examples/tree/main/account-comparison)            | Compressed vs regular Solana accounts                                    |
| [nullifier-program](https://github.com/Lightprotocol/nullifier-program)                                         | Rent-free PDA for duplicate-execution prevention                         |
| [zk-id](https://github.com/Lightprotocol/program-examples/tree/main/zk/zk-id)                                   | Identity verification with Groth16 proofs                                |

## SDK references

### TypeScript packages

| Package                           | npm                                                                  |
| --------------------------------- | -------------------------------------------------------------------- |
| `@lightprotocol/stateless.js`     | [npm](https://www.npmjs.com/package/@lightprotocol/stateless.js)     |
| `@lightprotocol/compressed-token` | [npm](https://www.npmjs.com/package/@lightprotocol/compressed-token) |

### Rust crates

| Crate                        | docs.rs                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `light-sdk`                  | [docs.rs/light-sdk](https://docs.rs/light-sdk)                                   |
| `light-sdk-pinocchio`        | [docs.rs/light-sdk-pinocchio](https://docs.rs/light-sdk-pinocchio)               |
| `light-compressed-token-sdk` | [docs.rs/light-compressed-token-sdk](https://docs.rs/light-compressed-token-sdk) |
| `light-client`               | [docs.rs/light-client](https://docs.rs/light-client)                             |
| `light-program-test`         | [docs.rs/light-program-test](https://docs.rs/light-program-test)                 |
| `light-hasher`               | [docs.rs/light-hasher](https://docs.rs/light-hasher)                             |
| `light-account`              | [docs.rs/light-account](https://docs.rs/light-account)                           |

---

> For additional documentation and navigation, see: [https://www.zkcompression.com/llms.txt](https://www.zkcompression.com/llms.txt)
> For additional skills, see: [https://github.com/Lightprotocol/skills](https://github.com/Lightprotocol/skills)
