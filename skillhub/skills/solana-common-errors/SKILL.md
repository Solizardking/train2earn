---
name: solana-common-errors
description: >
  Diagnose and fix common Solana development errors — GLIBC mismatches, Anchor
  version conflicts, cargo build-sbf / platform-tools failures, LiteSVM issues,
  edition2024 crate pins, RPC airdrops, and Anchor 0.29→0.32 migrations. Use when
  builds fail, Anchor CLI won't install, or CI breaks on Debian/Ubuntu.
license: MIT
compatibility: Anchor 0.30–0.32, Solana CLI 2.x, Node 18+, Linux/macOS
metadata:
  author: skill-hub
  version: "1.0.0"
  homepage: https://skills.x402.wtf/api/skills/solana-common-errors/SKILL.md
  category: Solana / Blockchain
  priority: critical
  aliases:
    - common-errors
    - anchor-errors
    - glibc-solana
---

# Solana Common Errors & Solutions

**Priority skill** for Solana program development. When a build, install, test, or
IDL step fails, use this skill before guessing.

Full encyclopedia: [references/common-errors.md](./references/common-errors.md)

## Quick triage

| Symptom | First fix |
|---------|-----------|
| `GLIBC_2.38/2.39 not found` | Build Anchor from source, use Docker `ubuntu:24.04`, or `avm install X --from-source` |
| `cargo build-sbf` not found | Install Anza CLI + fix PATH |
| Platform tools corrupted | `cargo build-sbf --force-tools-install` + free ≥3GB disk |
| `feature edition2024 is required` | Pin crates (see below) + commit `Cargo.lock` |
| `litesvm` `__isoc23_strtol` | GLIBC &lt;2.38 → use `solana-bankrun` or Ubuntu 24.04 |
| `ECONNREFUSED ::1:8899` | Use `http://127.0.0.1:8899` / `NODE_OPTIONS=--dns-result-order=ipv4first` |
| Anchor CLI ≠ anchor-lang | Match versions via AVM + Cargo.toml |

## edition2024 pins (platform-tools v1.48 / cargo 1.84)

```bash
cargo update -p blake3 --precise 1.8.2
cargo update -p constant_time_eq --precise 0.3.1
cargo update -p base64ct --precise 1.7.3
cargo update -p indexmap --precise 2.11.4
```

Or in `Cargo.toml`:

```toml
blake3 = "=1.8.2"
constant_time_eq = "=0.3.1"
base64ct = "=1.7.3"
indexmap = "=2.11.4"
```

## Install toolchain (safe baseline)

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cargo install --git https://github.com/solana-foundation/anchor avm --force
avm install 0.30.1
avm use 0.30.1
```

## When to read the full reference

Open [references/common-errors.md](./references/common-errors.md) for:

- GLIBC / OS matrix
- Anchor 0.29 → 0.30 → 0.31 → 0.32 migrations
- IDL / `proc_macro2` / `unexpected_cfgs`
- LiteSVM vs bankrun
- Platform-tools corruption & disk space
- Verified Debian 12 test matrix (Jan 2026)

## Hub links

- Live catalog: https://skills.x402.wtf
- Cheshire skills: https://cheshireterminal.ai/skills
- Publish your own skill: https://skills.x402.wtf/publish
