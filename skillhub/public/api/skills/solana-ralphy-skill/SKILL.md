---
name: solana-ralphy-skill
description: Autonomous AI coding loop for Solana development that combines Ralphy-style task execution with Solana program, token launch, dApp, testing, and multi-engine coding workflows. Use when running PRD-driven or parallel Solana implementation tasks.
---

# Solana Ralphy - Autonomous AI Coding Loop for Solana Development

A Claude Code skill that combines Ralphy's autonomous task execution with modern Solana development best practices. Launch tokens, build dApps, and execute complex blockchain tasks autonomously.

## Quick Start

```bash
# Install the skill
cp -r solana-ralphy-skill ~/.claude/skills/solana-ralphy

# Or for project-specific
cp -r solana-ralphy-skill .claude/skills/solana-ralphy

# Create a Solana PRD and run
./solana-ralphy.sh --prd SOLANA_PRD.md
```

## Core Capabilities

### 1. Autonomous Solana Development
- Token launches with fee sharing (Bags.fm)
- Program development (Anchor/Pinocchio)
- dApp UI with framework-kit
- Testing with LiteSVM/Surfpool

### 2. Multi-Engine Support
| Engine | Command | Best For |
|--------|---------|----------|
| Claude Code | `--claude` (default) | Complex reasoning, code review |
| OpenCode | `--opencode` | Cost-efficient bulk tasks |
| Cursor | `--cursor` | IDE integration |
| Codex | `--codex` | Structured outputs |

### 3. Parallel Execution
Run multiple Solana tasks concurrently with isolated git worktrees:
```bash
./solana-ralphy.sh --parallel --max-parallel 4
```

## PRD Formats

### Markdown (SOLANA_PRD.md)
```markdown
# My Solana Project

## Tasks
- [ ] Initialize Anchor project with escrow program
- [ ] Create token launch with 3-way fee split via Bags.fm
- [ ] Build React UI with wallet connection
- [ ] Write LiteSVM tests for all instructions
- [ ] Deploy to devnet and verify
```

### YAML (solana-tasks.yaml)
```yaml
project: my-solana-dapp
network: devnet

tasks:
  - title: Create Anchor escrow program
    type: program
    parallel_group: 1
    
  - title: Launch governance token via Bags.fm
    type: token
    parallel_group: 1
    config:
      name: "MyGov"
      symbol: "MGOV"
      initial_buy_sol: 0.1
      fee_claimers:
        - provider: twitter
          username: founder
          bps: 5000
        - provider: github
          username: dev1
          bps: 3000
          
  - title: Build React frontend with framework-kit
    type: frontend
    parallel_group: 2
    depends_on: [1]
    
  - title: Integration tests with Surfpool
    type: testing
    parallel_group: 3
```

## Environment Setup

```bash
# Required
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
export PRIVATE_KEY="your_base58_private_key"

# For Bags.fm operations
export BAGS_API_KEY="your_bags_api_key"
export BAGS_PARTNER_CONFIG_KEY="optional_partner_pda"

# For Helius/Birdeye data
export HELIUS_API_KEY="your_helius_key"
export BIRDEYE_API_KEY="your_birdeye_key"
```

## Task Types

### Program Development
```yaml
- title: Create token staking program
  type: program
  framework: anchor  # or pinocchio for performance
  features:
    - stake_tokens
    - unstake_tokens
    - claim_rewards
```

### Token Operations
```yaml
- title: Launch token with fee sharing
  type: token
  platform: bags  # or pump for pump.fun
  config:
    name: "Community Token"
    symbol: "COMM"
    initial_buy_sol: 0.05
```

### Frontend
```yaml
- title: Build swap interface
  type: frontend
  stack: framework-kit  # Uses @solana/react-hooks
  components:
    - wallet_connect
    - token_swap
    - position_display
```

### Testing
```yaml
- title: Unit tests for escrow
  type: testing
  framework: litesvm  # or mollusk, surfpool
  coverage: 80
```

## Skill Architecture

```
solana-ralphy-skill/
├── SKILL.md                    # This file
├── solana-ralphy.sh            # Main executable
├── scripts/
│   ├── bags-operations.ts      # Bags.fm SDK wrapper
│   ├── pump-operations.ts      # Pump.fun integration
│   ├── token-utils.ts          # Token helpers
│   └── test-helpers.ts         # Testing utilities
├── templates/
│   ├── anchor-program/         # Anchor boilerplate
│   ├── pinocchio-program/      # High-perf programs
│   ├── frontend-kit/           # React + framework-kit
│   └── test-suites/            # LiteSVM/Surfpool templates
├── references/
│   ├── solana-sdk.md           # @solana/kit patterns
│   ├── anchor-guide.md         # Anchor best practices
│   ├── bags-api.md             # Bags.fm API reference
│   └── security.md             # Security patterns
└── assets/
    ├── package.json            # Dependencies
    └── tsconfig.json           # TypeScript config
```

## CLI Options

### Solana-Specific
| Flag | Description |
|------|-------------|
| `--network devnet|mainnet` | Target network (default: devnet) |
| `--with-bags` | Enable Bags.fm operations |
| `--with-pump` | Enable Pump.fun operations |
| `--anchor` | Use Anchor framework |
| `--pinocchio` | Use Pinocchio (high-perf) |

### Inherited from Ralphy
| Flag | Description |
|------|-------------|
| `--parallel` | Run tasks in parallel |
| `--max-parallel N` | Max concurrent agents |
| `--branch-per-task` | Create git branch per task |
| `--create-pr` | Auto-create pull requests |
| `--fast` | Skip tests and linting |

## Examples

```bash
# Basic Solana project
./solana-ralphy.sh --prd SOLANA_PRD.md

# Token launch with Bags.fm
./solana-ralphy.sh --with-bags --yaml token-launch.yaml

# Parallel program development
./solana-ralphy.sh --parallel --max-parallel 3 --anchor

# High-performance programs
./solana-ralphy.sh --pinocchio --network mainnet

# Full workflow with PRs
./solana-ralphy.sh --parallel --branch-per-task --create-pr
```

## Progressive Disclosure

This skill uses progressive disclosure. Read specialized docs as needed:

- `references/solana-sdk.md` - @solana/kit patterns
- `references/anchor-guide.md` - Anchor development
- `references/bags-api.md` - Bags.fm token operations
- `references/security.md` - Security vulnerabilities
- `references/testing.md` - LiteSVM/Surfpool patterns

## Integration Points

### With Bags Skill
If `bags-solana-ops` skill is available, Ralphy automatically uses it for:
- Token launches with fee sharing
- Fee claiming operations
- Partner config management

### With Solana Dev Skill
If `solana-dev` skill is available, uses its:
- Framework-kit UI patterns
- Testing infrastructure
- Security guidelines

## Version

v1.0.0 - Solana Ralphy Connector
