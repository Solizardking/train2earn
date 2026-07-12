# Solana Ralphy 🔷

> Autonomous AI Coding Loop for Solana Development

A Claude Code skill that combines [Ralphy](https://github.com/michaelshimeles/ralphy)'s autonomous task execution with modern Solana development best practices. Build programs, launch tokens, and deploy dApps with AI assistance.

![Version](https://img.shields.io/badge/version-1.0.0-purple)
![Solana](https://img.shields.io/badge/Solana-January%202026-14F195)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- 🤖 **Autonomous Development** - AI works through PRD tasks until completion
- 🔷 **Solana Native** - Built for @solana/kit, Anchor, and Pinocchio
- 💰 **Token Operations** - Launch tokens via Bags.fm with fee sharing
- ⚡ **Parallel Execution** - Multiple AI agents in isolated git worktrees
- 🧪 **Modern Testing** - LiteSVM, Mollusk, and Surfpool integration
- 🎨 **Framework-kit UI** - React hooks for Solana dApps

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/solana-ralphy-skill.git
./install.sh

# Set environment
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export PRIVATE_KEY="your_base58_key"
export BAGS_API_KEY="from_dev.bags.fm"

# Create PRD and run
cp templates/SOLANA_PRD.md ./SOLANA_PRD.md
./solana-ralphy.sh --prd SOLANA_PRD.md
```

## Installation

### Personal (Claude Desktop)

```bash
./install.sh --personal
# Installs to ~/.claude/skills/solana-ralphy
```

### Project-Specific

```bash
./install.sh --project
# Installs to .claude/skills/solana-ralphy
```

### Custom Location

```bash
./install.sh --path /your/custom/path
```

## Usage

### Basic Execution

```bash
# Run with Claude Code (default)
./solana-ralphy.sh --prd SOLANA_PRD.md

# Specify AI engine
./solana-ralphy.sh --opencode --prd SOLANA_PRD.md
./solana-ralphy.sh --cursor --prd SOLANA_PRD.md
./solana-ralphy.sh --codex --prd SOLANA_PRD.md
```

### Solana Options

```bash
# Target network
./solana-ralphy.sh --network mainnet

# Enable token platforms
./solana-ralphy.sh --with-bags    # Bags.fm operations
./solana-ralphy.sh --with-pump    # Pump.fun operations

# Program framework
./solana-ralphy.sh --anchor       # Anchor (default)
./solana-ralphy.sh --pinocchio    # High-performance programs
```

### Parallel Execution

```bash
# Run 4 agents concurrently
./solana-ralphy.sh --parallel --max-parallel 4

# With feature branches and PRs
./solana-ralphy.sh --parallel --branch-per-task --create-pr
```

### YAML Task Files

```bash
./solana-ralphy.sh --yaml solana-tasks.yaml
```

## PRD Formats

### Markdown

```markdown
# My Solana Project

## Tasks
- [ ] Initialize Anchor workspace
- [ ] Create token launch with fee sharing
- [ ] Build React UI with wallet connection
- [x] Completed task (skipped)
```

### YAML (with parallel groups)

```yaml
project: my-dapp
network: devnet

tasks:
  - title: Create Anchor program
    type: program
    parallel_group: 1
    
  - title: Launch governance token
    type: token
    platform: bags
    parallel_group: 2
    config:
      name: "MyToken"
      symbol: "MTK"
      initialBuySOL: 0.1
      feeClaimers:
        - { provider: twitter, username: founder, bps: 5000 }
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_RPC_URL` | Yes | Solana RPC endpoint |
| `PRIVATE_KEY` | Yes* | Base58 encoded private key |
| `BAGS_API_KEY` | With --with-bags | Bags.fm API key |
| `BAGS_PARTNER_CONFIG_KEY` | No | Partner config PDA |
| `HELIUS_API_KEY` | No | Helius RPC key |
| `BIRDEYE_API_KEY` | No | Birdeye API key |

\* Required for token operations

## CLI Reference

### AI Engines
| Flag | Description |
|------|-------------|
| `--claude` | Claude Code (default) |
| `--opencode` | OpenCode |
| `--cursor` | Cursor agent |
| `--codex` | Codex CLI |

### Solana Options
| Flag | Description |
|------|-------------|
| `--network devnet\|mainnet` | Target network |
| `--with-bags` | Enable Bags.fm |
| `--with-pump` | Enable Pump.fun |
| `--anchor` | Use Anchor framework |
| `--pinocchio` | Use Pinocchio |

### Execution
| Flag | Description |
|------|-------------|
| `--parallel` | Parallel execution |
| `--max-parallel N` | Max concurrent agents |
| `--branch-per-task` | Git branch per task |
| `--create-pr` | Auto-create PRs |
| `--fast` | Skip tests/lint |
| `--dry-run` | Preview mode |

## Skill Structure

```
solana-ralphy-skill/
├── SKILL.md                    # Skill definition
├── solana-ralphy.sh            # Main executable
├── install.sh                  # Installer
├── scripts/
│   └── bags-operations.ts      # Bags.fm SDK wrapper
├── templates/
│   ├── SOLANA_PRD.md           # PRD template
│   └── solana-tasks.yaml       # YAML template
├── references/
│   ├── solana-sdk.md           # @solana/kit patterns
│   ├── anchor-guide.md         # Anchor best practices
│   ├── bags-api.md             # Bags.fm API reference
│   ├── security.md             # Security checklist
│   └── testing.md              # Testing guide
└── assets/
    └── package.json            # Dependencies
```

## Integration with Other Skills

### With Bags Skill
If `bags-solana-ops` skill is installed, Solana Ralphy automatically uses it for advanced token operations.

### With Solana Dev Skill
If `solana-dev` skill is installed, uses its patterns for framework-kit UI and testing.

## Examples

### Token Launch with Fee Sharing

```bash
./solana-ralphy.sh --with-bags --yaml token-launch.yaml
```

```yaml
# token-launch.yaml
tasks:
  - title: Launch community token
    type: token
    platform: bags
    config:
      name: "Community Token"
      symbol: "COMM"
      initialBuySOL: 0.1
      feeClaimers:
        - { provider: twitter, username: founder, bps: 4000 }
        - { provider: github, username: dev, bps: 3000 }
        - { provider: twitter, username: treasury, bps: 2000 }
```

### High-Performance Program

```bash
./solana-ralphy.sh --pinocchio --network mainnet --fast
```

### Full Development Workflow

```bash
./solana-ralphy.sh \
  --parallel \
  --max-parallel 4 \
  --branch-per-task \
  --create-pr \
  --with-bags \
  --network devnet
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Resources

- [Ralphy](https://github.com/michaelshimeles/ralphy) - Original autonomous coding loop
- [Solana Docs](https://docs.solana.com) - Official documentation
- [Bags.fm Dev Portal](https://dev.bags.fm) - Token launch platform
- [@solana/kit](https://github.com/solana-labs/solana-web3.js) - Modern Solana SDK
- [Anchor](https://anchor-lang.com) - Program framework
- [LiteSVM](https://github.com/litesvm/litesvm) - Fast testing

---

Built with 🔷 for the Solana ecosystem
