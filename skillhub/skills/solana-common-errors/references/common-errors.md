# Common Solana Development Errors & Solutions

## GLIBC Errors

### `GLIBC_2.39 not found` / `GLIBC_2.38 not found`
```
anchor: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.39' not found (required by anchor)
```

**Cause:** Anchor 0.31+ binaries are built on newer Linux and require GLIBC ≥2.38. Anchor 0.32+ requires ≥2.39.

**Solutions (pick one):**
1. **Upgrade OS** (best): Ubuntu 24.04+ has GLIBC 2.39
2. **Build from source:**
   ```bash
   # For Anchor 0.31.x:
   cargo install --git https://github.com/solana-foundation/anchor --tag v0.31.1 anchor-cli
   
   # For Anchor 0.32.x:
   cargo install --git https://github.com/solana-foundation/anchor --tag v0.32.1 anchor-cli
   ```
3. **Use Docker:**
   ```bash
   docker run -v $(pwd):/workspace -w /workspace solanafoundation/anchor:0.31.1 anchor build
   ```
4. **Use AVM with source build:**
   ```bash
   avm install 0.31.1 --from-source
   ```

---

## Rust / Cargo Errors

### `anchor-cli` fails to install with Rust 1.80 (`time` crate issue)
```
error[E0635]: unknown feature `proc_macro_span_shrink`
 --> .cargo/registry/src/.../time-macros-0.2.16/src/lib.rs
```

**Cause:** Anchor 0.30.x uses a `time` crate version incompatible with Rust ≥1.80 ([anchor#3143](https://github.com/coral-xyz/anchor/pull/3143)).

**Solutions:**
1. **Use AVM** — it auto-selects `rustc 1.79.0` for Anchor < 0.31 ([anchor#3315](https://github.com/coral-xyz/anchor/pull/3315))
2. **Pin Rust version:**
   ```bash
   rustup install 1.79.0
   rustup default 1.79.0
   cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
   ```
3. **Upgrade to Anchor 0.31+** which fixes this issue

### `unexpected_cfgs` warnings flooding build output
```
warning: unexpected `cfg` condition name: `feature`
```

**Cause:** Newer Rust versions (1.80+) are stricter about `cfg` conditions.

**Solution:** Add to your program's `Cargo.toml`:
```toml
[lints.rust]
unexpected_cfgs = { level = "allow" }
```
Or upgrade to Anchor 0.31+ which handles this.

### `error[E0603]: module inner is private`
**Cause:** Version mismatch between `anchor-lang` crate and Anchor CLI.

**Solution:** Ensure `anchor-lang` in Cargo.toml matches your `anchor --version`.

---

## Build Errors

### `cargo build-sbf` not found
```
error: no such command: `build-sbf`
```

**Cause:** Solana CLI not installed, or PATH not set.

**Solutions:**
1. Install Solana CLI: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`
2. Add to PATH: `export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"`
3. Verify: `solana --version`

### `cargo build-bpf` is deprecated
```
Warning: cargo-build-bpf is deprecated. Use cargo-build-sbf instead.
```

**Cause:** As of Anchor 0.30.0, `cargo build-sbf` is the default. BPF target is deprecated in favor of SBF.

**Solution:** This is just a warning if you're using older tooling. Anchor 0.30+ handles this automatically. If calling manually, use `cargo build-sbf`.

### Platform tools download failure
```
Error: Failed to download platform-tools
```
or
```
error: could not compile `solana-program`
```

**Solutions:**
1. **Clear cache and retry:**
   ```bash
   rm -rf ~/.cache/solana/
   cargo build-sbf
   ```
2. **Manual platform tools install:**
   ```bash
   # Check which version you need
   solana --version
   # Download manually from:
   # https://github.com/anza-xyz/platform-tools/releases
   ```
3. **Check disk space** (see "No space left" error below)

### `anchor build` IDL generation fails
```
Error: IDL build failed
```
or
```
BPF SDK: /home/user/.local/share/solana/install/releases/2.1.7/solana-release/bin/sdk/sbf
Error: Function _ZN5anchor...
```

**Solutions:**
1. **Ensure `idl-build` feature is enabled (required since 0.30.0):**
   ```toml
   [features]
   default = []
   idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
   ```
2. **Set ANCHOR_LOG for debugging:**
   ```bash
   ANCHOR_LOG=1 anchor build
   ```
3. **Skip IDL generation:**
   ```bash
   anchor build --no-idl
   ```
4. **Check for nightly Rust interference:**
   ```bash
   # IDL generation uses proc-macro2 which may need nightly features
   # Override with stable:
   RUSTUP_TOOLCHAIN=stable anchor build
   ```

### `anchor build` error with `proc_macro2` / `local_file` method not found
```
error[E0599]: no method named `local_file` found for struct `proc_macro2::Span`
```

**Cause:** proc-macro2 API change in newer nightly Rust.

**Solutions:**
1. Upgrade to Anchor 0.31.1+ (fixed in [#3663](https://github.com/solana-foundation/anchor/pull/3663))
2. Use stable Rust: `RUSTUP_TOOLCHAIN=stable anchor build`
3. Pin proc-macro2: `cargo update -p proc-macro2 --precise 1.0.86`

---

## Installation Errors

### `No space left on device` during Solana install
```
error: No space left on device (os error 28)
```

**Cause:** Solana CLI + platform tools can use 2-5 GB. Multiple versions compound this.

**Solutions:**
1. **Clean old versions:**
   ```bash
   # List installed versions
   ls ~/.local/share/solana/install/releases/
   
   # Remove old ones (keep only what you need)
   rm -rf ~/.local/share/solana/install/releases/1.16.*
   rm -rf ~/.local/share/solana/install/releases/1.17.*
   
   # Also clean cache
   rm -rf ~/.cache/solana/
   ```
2. **Clean Cargo/Rust caches:**
   ```bash
   cargo cache --autoclean  # if cargo-cache is installed
   # or manually:
   rm -rf ~/.cargo/registry/cache/
   rm -rf target/
   ```
3. **Clean AVM:**
   ```bash
   ls ~/.avm/bin/
   # Remove unused anchor versions
   ```

### `agave-install` not found
```
error: agave-install: command not found
```

**Cause:** Anchor CLI 0.31+ migrates to `agave-install` for Solana versions ≥1.18.19.

**Solution:** Install via the Solana install script (which installs both):
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

---

## Testing Errors

### `solana-test-validator` crashes or hangs
```
Error: failed to start validator
```

**Solutions:**
1. **Kill existing validators:**
   ```bash
   pkill -f solana-test-validator
   # or
   solana-test-validator --kill
   ```
2. **Clean ledger:**
   ```bash
   rm -rf test-ledger/
   ```
3. **Check port availability:**
   ```bash
   lsof -i :8899  # RPC port
   lsof -i :8900  # Websocket port
   ```
4. **Consider Surfpool** as a modern alternative to `solana-test-validator`:
   ```bash
   curl --proto '=https' --tlsv1.2 -LsSf https://github.com/txtx/surfpool/releases/latest/download/surfpool-installer.sh | sh
   ```

### Anchor test fails with `Connection refused` / IPv6 issue
```
Error: connect ECONNREFUSED ::1:8899
```

**Cause:** Node.js 17+ resolves `localhost` to IPv6 `::1` by default, but `solana-test-validator` binds to `127.0.0.1`.

**Solutions:**
1. **Use Anchor 0.30+** which defaults to `127.0.0.1` instead of `localhost`
2. **Set NODE_OPTIONS:**
   ```bash
   NODE_OPTIONS="--dns-result-order=ipv4first" anchor test
   ```
3. **Edit Anchor.toml:**
   ```toml
   [provider]
   cluster = "http://127.0.0.1:8899"
   ```

---

## Anchor Version Migration Issues

### Anchor 0.29 → 0.30 Migration Errors

**`accounts` method type errors in TypeScript:**
```
Argument of type '{ ... }' is not assignable to parameter of type 'ResolvedAccounts<...>'
```

**Solution:** Change `.accounts({...})` to `.accountsPartial({...})` or remove auto-resolved accounts from the call.

**Missing `idl-build` feature:**
```
Error: `idl-build` feature is missing
```

**Solution:** Add to each program's Cargo.toml:
```toml
[features]
idl-build = ["anchor-lang/idl-build"]
```

**`overflow-checks` not specified:**
```
Error: overflow-checks must be specified in workspace Cargo.toml
```

**Solution:** Add to workspace `Cargo.toml`:
```toml
[profile.release]
overflow-checks = true
```

### Anchor 0.30 → 0.31 Migration Errors

**Solana v1 → v2 crate conflicts:**
```
error[E0308]: mismatched types
expected `solana_program::pubkey::Pubkey`
found `solana_sdk::pubkey::Pubkey`
```

**Solution:** Remove direct `solana-program` and `solana-sdk` dependencies. Use them through `anchor-lang`:
```rust
use anchor_lang::prelude::*;
// NOT: use solana_program::pubkey::Pubkey;
```

**`Discriminator` trait changes:**
```
error[E0277]: the trait bound `MyAccount: Discriminator` is not satisfied
```

**Solution:** Ensure you derive `#[account]` on your structs. The discriminator is now dynamically sized.

### Anchor 0.31 → 0.32 Migration Errors

**`solana-program` dependency warning becomes error:**
Anchor 0.32 fully removes `solana-program` as a dependency. If your code imports from `solana_program::*`, change to the smaller crates:
```rust
// Before (0.31):
use solana_program::pubkey::Pubkey;

// After (0.32):
use solana_pubkey::Pubkey;
// Or use anchor's re-export:
use anchor_lang::prelude::*;
```

**Duplicate mutable accounts error:**
```
Error: Duplicate mutable account
```
Anchor 0.32+ disallows duplicate mutable accounts by default. Use the `dup` constraint:
```rust
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    #[account(mut)]
    pub account_a: Account<'info, MyAccount>,
    #[account(mut, dup = account_a)]
    pub account_b: Account<'info, MyAccount>,
}
```

---

## Miscellaneous Errors

### `solana airdrop` fails
```
Error: airdrop request failed
```

**Cause:** Rate limiting on devnet/testnet.

**Solutions:**
1. Wait and retry
2. Use the web faucet: https://faucet.solana.com
3. For testing, use localnet where airdrops are unlimited

### Anchor IDL account authority mismatch
```
Error: Authority did not sign
```

**Solution:** The IDL authority is the program's upgrade authority. Check with:
```bash
solana program show <PROGRAM_ID>
```

### `declare_program!` not finding IDL file
```
Error: file not found: idls/my_program.json
```

**Solution:** Place the IDL JSON in the `idls/` directory at the workspace root. The filename must match the program name (snake_case):
```
workspace/
├── idls/
│   └── my_program.json
├── programs/
│   └── my_program/
└── Anchor.toml
```

---

## LiteSVM Errors

### `undefined symbol: __isoc23_strtol` (litesvm native binary)
```
Error: Cannot find native binding.
cause: litesvm.linux-x64-gnu.node: undefined symbol: __isoc23_strtol
```

**Root cause:** LiteSVM 0.5.0 native binary is compiled against GLIBC 2.38+. The `__isoc23_strtol` symbol was introduced in GLIBC 2.38 (C23 standard functions). Systems with GLIBC < 2.38 (Ubuntu 22.04, Debian 12, etc.) cannot load this binary.

**Verified on:** Debian 12 (GLIBC 2.36) — Jan 2026

**Solutions:**
1. **Upgrade OS** to Ubuntu 24.04+ or Debian 13+ (recommended)
2. **Use Docker:**
   ```dockerfile
   FROM ubuntu:24.04
   RUN apt-get update && apt-get install -y nodejs npm
   ```
3. **Fall back to `solana-bankrun`** if you can't upgrade:
   ```bash
   pnpm remove litesvm anchor-litesvm
   pnpm add -D solana-bankrun anchor-bankrun
   ```
4. **Try litesvm 0.3.x** which may work on older GLIBC versions

### `Cannot find module './litesvm.linux-x64-gnu.node'`
```
Error: Cannot find module './litesvm.linux-x64-gnu.node'
```

**Root cause:** pnpm hoisting doesn't always correctly link native optional dependencies for native Node addons.

**Solutions:**
1. Delete `node_modules` and reinstall: `rm -rf node_modules && pnpm install`
2. Use `node-linker=hoisted` in `.npmrc`:
   ```
   node-linker=hoisted
   ```
3. Install the platform-specific package explicitly:
   ```bash
   pnpm add -D litesvm-linux-x64-gnu
   ```

---

## Platform Tools Errors

### `The Solana toolchain is corrupted` after fresh install
```
[ERROR cargo_build_sbf] The Solana toolchain is corrupted. Please, run cargo-build-sbf with the --force-tools-install argument to fix it.
```

**Root cause:** Solana CLI 2.2.x downloads platform-tools v1.48 (~516MB compressed, ~2GB extracted). On systems with limited root partition space (<3GB free in `~/.cache/solana/`), extraction can fail silently, leaving a corrupted toolchain (e.g., `rust/` directory missing `rustc` binary).

**Verified on:** Debian 12, Solana CLI 2.2.16, root partition 9.7GB with 2.1GB free — Jan 2026

**Solutions:**
1. **Run with `--force-tools-install`:**
   ```bash
   cargo build-sbf --force-tools-install
   ```
   This re-downloads and re-extracts. Takes 5-10 minutes on average connections.

2. **Ensure sufficient disk space** (~3GB free needed on partition containing `~/.cache/solana/`):
   ```bash
   df -h ~/.cache/solana/
   # If too small, symlink to bigger disk:
   rm -rf ~/.cache/solana/v1.48/platform-tools
   mkdir -p /mnt/data/solana-cache/v1.48/platform-tools
   ln -sf /mnt/data/solana-cache/v1.48/platform-tools ~/.cache/solana/v1.48/platform-tools
   ```

3. **Manual extraction** (if `--force-tools-install` keeps cycling):
   ```bash
   # Download manually
   wget https://github.com/anza-xyz/platform-tools/releases/download/v1.48/platform-tools-linux-x86_64.tar.bz2
   # Extract to a disk with space
   mkdir -p /mnt/data/solana-platform-tools/v1.48
   cd /mnt/data/solana-platform-tools/v1.48
   tar xjf /path/to/platform-tools-linux-x86_64.tar.bz2
   # Symlink
   ln -sf /mnt/data/solana-platform-tools/v1.48 ~/.cache/solana/v1.48/platform-tools
   ```

**Note:** The `version.md` file is the last file extracted. Its presence confirms successful extraction.

### Anchor CLI version mismatch warnings (non-fatal)
```
WARNING: `anchor-lang` version(0.32.1) and the current CLI version(0.30.1) don't match.
WARNING: `@coral-xyz/anchor` version(^0.32.1) and the current CLI version(0.30.1) don't match.
```

**Root cause:** Using Anchor CLI 0.30.1 with `anchor-lang = "0.32.1"` in Cargo.toml. The build **succeeds** but prints warnings.

**Verified on:** Debian 12, Anchor CLI 0.30.1 building anchor-lang 0.32.1 — builds and generates IDL correctly — Jan 2026

**Impact:** Builds work. IDL generation works. But subtle runtime issues may occur with IDL format differences between 0.30 and 0.32.

**Solutions:**
1. **Match versions** (recommended):
   ```toml
   # Anchor.toml
   [toolchain]
   anchor_version = "0.32.1"
   ```
   Then install matching CLI: `avm install 0.32.1`
2. **Or downgrade crate:** Change `anchor-lang = "0.30.1"` in Cargo.toml
3. **Ignore if just building:** The mismatch is cosmetic for `anchor build` and `anchor idl build`

---

## edition2024 Crate Incompatibility (Cargo 1.84.0)

### `feature edition2024 is required` during `cargo build-sbf`
```
error: failed to download `constant_time_eq v0.4.2`

Caused by:
  failed to parse manifest at `.../constant_time_eq-0.4.2/Cargo.toml`

Caused by:
  feature `edition2024` is required

  The package requires the Cargo feature called `edition2024`, but that feature is not
  stabilized in this version of Cargo (1.84.0 (12fe57a9d 2025-04-07)).
```

**Root cause:** Platform-tools v1.48 (used by Solana CLI 2.2.16 and CI with Solana stable 3.0.14) bundles `cargo 1.84.0` (Solana Rust fork), which does **not** support `edition = "2024"`. Multiple crates in the Solana dependency tree have released versions requiring edition2024.

### ⚠️ Known edition2024 Crates (Updated Jan 31, 2026)

| Crate | Breaking Version | Safe Version | Pulled By |
|---|---|---|---|
| `blake3` | ≥1.8.3 | **1.8.2** | `solana-blake3-hasher` → `solana-program` |
| `constant_time_eq` | ≥0.4.2 | **0.3.1** | `blake3` |
| `base64ct` | ≥1.8.3 | **1.7.3** | `pkcs8`, `spki` → various crypto crates |
| `indexmap` | ≥2.13.0 | **2.11.4** | `toml_edit` → `proc-macro-crate` → `borsh-derive` → `anchor-lang` |

**New crates may ship edition2024 at any time.** If you see this error with a crate not listed above, pin it to the previous version.

**Why existing repos break:** Projects without a `Cargo.lock` (or with a stale one) resolve to the latest crate versions at build time, pulling in edition2024-requiring releases. This is especially common in CI environments.

**Verified on:**
- Debian 12, Solana CLI 2.2.16, platform-tools v1.48 — Jan 30, 2026
- GitHub Actions (ubuntu-latest), Solana stable 3.0.14, Cargo 1.84.0 — Jan 31, 2026

### Solutions

**1. Pin all known problematic crates (recommended for CI):**
```bash
cargo generate-lockfile
cargo update -p blake3 --precise 1.8.2
cargo update -p constant_time_eq --precise 0.3.1
cargo update -p base64ct --precise 1.7.3
cargo update -p indexmap --precise 2.11.4
```

**2. Pin via workspace Cargo.toml:**
```toml
# In workspace Cargo.toml
[workspace.dependencies]
blake3 = "=1.8.2"
base64ct = "=1.7.3"
```

**3. Always commit Cargo.lock for programs and Anchor projects:**
```bash
# Force-add if .gitignore excludes it
git add -f Cargo.lock
```
This is the single most effective prevention — a committed lockfile prevents cargo from resolving to newer breaking versions.

**4. For monorepos with per-project Cargo.lock files (e.g., program-examples):**
Each Anchor project that has its own `Cargo.toml` outside the workspace needs its own `Cargo.lock`. Generate and pin for each:
```bash
for dir in $(find . -path "*/anchor/Cargo.toml" -exec dirname {} \;); do
  cd "$dir"
  cargo generate-lockfile
  cargo update -p blake3 --precise 1.8.2 2>/dev/null
  cargo update -p constant_time_eq --precise 0.3.1 2>/dev/null
  cargo update -p base64ct --precise 1.7.3 2>/dev/null
  cargo update -p indexmap --precise 2.11.4 2>/dev/null
  cd -
done
git add -f **/Cargo.lock
```

**5. Wait for platform-tools update** — a future platform-tools version will ship a cargo that supports edition2024. Track at [anza-xyz/platform-tools](https://github.com/anza-xyz/platform-tools/releases).

### `Could not find specification for target "sbpf-solana-solana"` with `--tools-version`
```
error: Error loading target specification: Could not find specification for target "sbpf-solana-solana".
Run `rustc --print target-list` for a list of built-in targets
```

**Root cause:** Using `cargo build-sbf --tools-version v1.43` with Solana CLI 2.2.16. The CLI generates `--target sbpf-solana-solana` but platform-tools v1.43 only knows older target triples (e.g., `sbf-solana-solana`). The SBPF target rename happened between v1.43 and v1.48.

**Verified on:** Debian 12, Solana CLI 2.2.16 — Jan 30, 2026

**Solution:** Don't downgrade platform-tools below your CLI's default version. Use the default tools version (v1.48 for CLI 2.2.16).

---

## Verified Test Results (Debian 12, Jan 2026)

Environment: Rust 1.93, Solana CLI 2.2.16, Anchor CLI 0.30.1, Node 22.22.0, GLIBC 2.36

| Test | Command | Result | Notes |
|------|---------|--------|-------|
| Anchor CLI/crate mismatch | `anchor build` (CLI 0.30.1 / anchor-lang 0.32.1) | ⚠️ PASS with warnings | Builds succeed; prints version mismatch warnings |
| cargo build-sbf (native) | `cargo build-sbf` on hello-solana, counter, transfer-sol, create-account, checking-accounts | ✅ PASS | All build after platform-tools v1.48 installed correctly |
| solana-bankrun (GLIBC 2.36) | `npm install solana-bankrun && require('solana-bankrun')` | ✅ PASS | `start` function available, works on GLIBC 2.36 |
| litesvm npm (GLIBC 2.36) | `npm install litesvm && require('litesvm')` | ❌ FAIL | `undefined symbol: __isoc23_strtol` — requires GLIBC ≥2.38 |
| @solana/web3.js CJS | `require('@solana/web3.js')` | ✅ PASS | Keypair, Connection etc. available |
| @solana/web3.js ESM | `import * as web3 from '@solana/web3.js'` | ✅ PASS | Full ESM support on Node 22 |
| @solana/kit (web3.js v2) ESM | `import('@solana/kit')` | ✅ PASS | ESM-only, works on Node 22 |
| @coral-xyz/anchor CJS | `require('@coral-xyz/anchor')` | ✅ PASS | Program, Provider etc. available |
| @coral-xyz/anchor ESM | `import * as anchor from '@coral-xyz/anchor'` | ✅ PASS | Full ESM support on Node 22 |
| IDL generation | `anchor idl build` (from program dir) | ✅ PASS | Generates valid JSON IDL with CLI 0.30.1 |
| Cargo duplicate deps | `cargo tree -d` on program-examples | ⚠️ INFO | 2295 lines of duplicate deps (ahash, base64, borsh, curve25519-dalek, ed25519-dalek, etc.) — normal for Solana workspace |
| Platform tools corruption | `cargo build-sbf` on fresh install | ❌ FAIL then PASS | Initial corruption due to disk space; fixed with `--force-tools-install` on adequate disk |

### Key Findings
1. **litesvm 0.5.0 npm is BROKEN on Debian 12** (GLIBC 2.36) — use `solana-bankrun` as fallback
2. **solana-bankrun works perfectly** on GLIBC 2.36 — recommended for Debian 12
3. **Platform-tools v1.48 needs ~2GB disk** for extraction — symlink `~/.cache/solana/` to a larger partition if root is small
4. **Anchor CLI 0.30.1 successfully builds anchor-lang 0.32.1** — warnings only, no errors
5. **Node 22 has full ESM+CJS support** for all Solana JS packages tested
6. **Cargo duplicate dependencies are normal** in Solana monorepos (borsh 0.9/0.10/1.x, curve25519-dalek 3.x/4.x, etc.)---
title: Version Compatibility Matrix
description: Reference table for matching Anchor, Solana CLI, Rust, and Node.js versions to avoid toolchain conflicts.
---

# Solana Version Compatibility Matrix

## Master Compatibility Table

| Anchor Version | Release Date | Solana CLI | Rust Version | Platform Tools | GLIBC Req | Node.js | Key Notes |
|---|---|---|---|---|---|---|---|
| **1.0.x** | — | 3.x | 1.79–1.85+ (stable) | v1.52 | ≥2.39 | ≥17 | TS pkg → `@anchor-lang/core`; `anchor test` defaults to surfpool; IDL in Program Metadata; no `solana` CLI shell-out; all `solana-*` deps must be `^3`; `solana-program` removed as project dep; `solana-signer` replaces `solana-sdk` for signing |
| **0.32.x** | Oct 2025 | 2.1.x+ | 1.79–1.85+ (stable) | v1.50+ | ≥2.39 | ≥17 | Replaces `solana-program` with smaller crates; IDL builds on stable Rust; removes Solang |
| **0.31.1** | Apr 2025 | 2.0.x–2.1.x | 1.79–1.83 | v1.47+ | ≥2.39 ⚠️ | ≥17 | New Docker image `solanafoundation/anchor`; published under solana-foundation org. **Tested: binary requires GLIBC 2.39, not 2.38** |
| **0.31.0** | Mar 2025 | 2.0.x–2.1.x | 1.79–1.83 | v1.47+ | ≥2.39 ⚠️ | ≥17 | Solana v2 upgrade; dynamic discriminators; `LazyAccount`; `declare_program!` improvements. **Pre-built binary needs GLIBC 2.39** |
| **0.30.1** | Jun 2024 | 1.18.x (rec: 1.18.8+) | 1.75–1.79 | v1.43 | ≥2.31 | ≥16 | `declare_program!` macro; legacy IDL conversion; `RUSTUP_TOOLCHAIN` override |
| **0.30.0** | Apr 2024 | 1.18.x (rec: 1.18.8) | 1.75–1.79 | v1.43 | ≥2.31 | ≥16 | New IDL spec; token extensions; `cargo build-sbf` default; `idl-build` feature required |
| **0.29.0** | Oct 2023 | 1.16.x–1.17.x | 1.68–1.75 | v1.37–v1.41 | ≥2.28 | ≥16 | Account reference changes; `idl build` compilation method; `.anchorversion` file |

## Solana CLI Version Mapping

| Solana CLI | Agave Version | Era | solana-program Crate | Platform Tools | Status |
|---|---|---|---|---|---|
| **3.1.x** | v3.1.x | Jan 2026 | N/A (validator only) | v1.52 | Edge/Beta |
| **3.0.x** | v3.0.x | Late 2025 | N/A (validator only) | v1.52 | Stable (mainnet) |
| **2.1.x** | v2.1.x | Mid 2025 | 2.x | v1.47–v1.51 | Stable |
| **2.0.x** | v2.0.x | Early 2025 | 2.x | v1.44–v1.47 | Legacy |
| **1.18.x** | N/A (pre-Anza) | 2024 | 1.18.x | v1.43 | Legacy |
| **1.17.x** | N/A | 2023 | 1.17.x | v1.37–v1.41 | Deprecated |
| **1.16.x** | N/A | 2023 | 1.16.x | v1.35–v1.37 | Deprecated |

### Important: Solana CLI v3.x
As of Agave v3.0.0, Anza **no longer publishes the `agave-validator` binary**. Operators must build from source. The CLI tools (for program development) remain available via `agave-install` or the install script.

## Platform Tools → Rust Toolchain Mapping

| Platform Tools | Bundled Rust | Bundled Cargo | LLVM/Clang | Target Triple | Notes |
|---|---|---|---|---|---|
| **v1.52** | ~1.85 (solana fork) | ~1.85 | Clang 20 | `sbpf-solana-solana` | Latest; used by Solana CLI 3.x |
| **v1.51** | ~1.84 (solana fork) | ~1.84 | Clang 19 | `sbpf-solana-solana` | |
| **v1.50** | ~1.83 (solana fork) | ~1.83 | Clang 19 | `sbpf-solana-solana` | |
| **v1.49** | ~1.82 (solana fork) | ~1.82 | Clang 18 | `sbpf-solana-solana` | |
| **v1.48** | rustc 1.84.1-dev | cargo 1.84.0 | Clang 19 | `sbpf-solana-solana` | **Verified.** Used by Solana CLI 2.2.16. ⚠️ Cargo does NOT support `edition2024` |
| **v1.47** | ~1.80 (solana fork) | ~1.80 | Clang 17 | `sbpf-solana-solana` | Used by Anchor 0.31.x |
| **v1.46** | ~1.79 (solana fork) | ~1.79 | Clang 17 | `sbf-solana-solana` | |
| **v1.45** | ~1.79 (solana fork) | ~1.79 | Clang 17 | `sbf-solana-solana` | |
| **v1.44** | ~1.78 (solana fork) | ~1.78 | Clang 16 | `sbf-solana-solana` | |
| **v1.43** | ~1.75 (solana fork) | ~1.75 | Clang 16 | `sbf-solana-solana` | Used by Anchor 0.30.x/Solana 1.18.x. ❌ Incompatible with CLI 2.2.16 (`sbpf-solana-solana` target not found) |

**Note:** Platform Tools ship a **forked** Rust compiler from [anza-xyz/rust](https://github.com/anza-xyz/rust). The version numbers approximate the upstream Rust equivalent. The forked compiler includes SBF/SBPF target support.

**⚠️ CRITICAL (Jan 2026):** Platform-tools v1.48 bundles `cargo 1.84.0` which does NOT support `edition = "2024"`. Multiple crates now require it: `blake3 ≥1.8.3`, `constant_time_eq ≥0.4.2`, `base64ct ≥1.8.3`, `indexmap ≥2.13.0`. Pin to safe versions: `blake3=1.8.2`, `constant_time_eq=0.3.1`, `base64ct=1.7.3`, `indexmap=2.11.4`. **Always commit Cargo.lock files.** See [common-errors.md](./common-errors.md#edition2024-crate-incompatibility-cargo-1840) for full details and fix scripts.

## GLIBC Requirements by OS

| OS / Distro | GLIBC Version | Compatible Anchor |
|---|---|---|
| **Ubuntu 24.04 (Noble)** | 2.39 | All (0.29–v1+) |
| **Ubuntu 22.04 (Jammy)** | 2.35 | 0.29–0.30.x only (build 0.31+ from source) |
| **Ubuntu 20.04 (Focal)** | 2.31 | 0.29–0.30.x only (build 0.31+ from source) |
| **Debian 12 (Bookworm)** | 2.36 | 0.29–0.30.x only ⚠️ **Tested: 0.31.1 and 0.32.1 pre-built binaries fail.** Build from source works for Anchor CLI, but `litesvm` 0.5.0 native binary also needs GLIBC 2.38+ |
| **Debian 13 (Trixie)** | 2.40 | All |
| **Fedora 39+** | ≥2.38 | All |
| **Arch Linux (rolling)** | Latest | All |
| **macOS 14+ (Sonoma)** | N/A (no GLIBC) | All |
| **macOS 12-13** | N/A | All |
| **Windows WSL2 (Ubuntu)** | Depends on distro | See Ubuntu version |

### Why GLIBC matters
Anchor 0.31+ and 0.32+ binaries are compiled against newer GLIBC. If your system's GLIBC is too old, you'll get:
```
anchor: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.38' not found
```

**Solutions:**
1. Upgrade your OS (recommended)
2. Build Anchor from source: `cargo install --git https://github.com/solana-foundation/anchor --tag v1.0.0 anchor-cli` (replace tag with desired version)
3. Use Docker (see install-guide.md)

## Anchor ↔ Solana Crate Versions

| Anchor | anchor-lang Crate | Project-level solana-* | Notes |
|---|---|---|---|
| **1.0.x** | 1.0.x | `^3` (granular crates) | `solana-program` removed from project deps; use `solana-signer` instead of `solana-sdk` for signing; all `solana-*` must be `^3` |
| **0.32.x** | 0.32.x | `2` (still `solana-program` or granular v2) | anchor-lang internals use granular crates; `solana-program` still valid in user Cargo.toml |
| **0.31.x** | 0.31.x | 2.x | Upgraded to Solana v2 crate ecosystem |
| **0.30.x** | 0.30.x | 1.18.x | Last version using Solana v1 crates |
| **0.29.x** | 0.29.x | 1.16.x–1.17.x | |

### Solana Granular Crate Ecosystem (Anchor 0.31+)
Anchor 0.31+ uses the Solana v2+ crate structure. The monolithic `solana-program` crate is being split into smaller crates:
- `solana-pubkey` / `solana-address`
- `solana-instruction`
- `solana-account-info`
- `solana-msg`
- `solana-invoke`
- `solana-entrypoint`
- `solana-signer` (use instead of `solana-sdk` in v1+)
- etc.

Anchor 0.32+ fully replaces `solana-program` in its own internals. **Anchor v1.0+** goes further: user-facing `Cargo.toml` files must also drop `solana-program` and bump any remaining `solana-*` crates to `^3`. The `anchor build` command warns on mismatched versions.

## Anchor CLI ↔ anchor-lang Crate Compatibility

The Anchor CLI checks version compatibility with the `anchor-lang` crate used in your project. **Mismatched versions will produce a warning.** Always keep these in sync:

```toml
# Cargo.toml (Anchor v1)
[dependencies]
anchor-lang = "1.0.0"

# Must match CLI:
# anchor --version → anchor-cli 1.0.0
```

```toml
# Cargo.toml (Anchor 0.32.x)
[dependencies]
anchor-lang = "0.32.1"

# anchor --version → anchor-cli 0.32.1
```

## SPL Token Crate Versions

| Anchor | anchor-spl | spl-token | spl-token-2022 | spl-associated-token-account |
|---|---|---|---|---|
| **1.0.x** | 1.0.x | Latest compatible | Latest compatible | Latest compatible |
| **0.32.x** | 0.32.x | Latest compatible | Latest compatible | Latest compatible |
| **0.31.x** | 0.31.x | 6.x | 5.x | 4.x |
| **0.30.x** | 0.30.x | 4.x–6.x | 3.x–4.x | 3.x |
| **0.29.x** | 0.29.x | 4.x | 1.x–3.x | 2.x–3.x |

## Node.js / TypeScript Requirements

| Anchor | TS Package | Node.js | TypeScript | Notes |
|---|---|---|---|---|
| **1.0.x** | `@anchor-lang/core ^1.0.0` | ≥17 | 5.x | Renamed from `@coral-xyz/anchor`. IDL types now at root of `@anchor-lang/core` (was `@coral-xyz/anchor/dist/cjs/idl`) |
| **0.32.x** | `@coral-xyz/anchor ^0.32.x` | ≥17 | 5.x | |
| **0.31.x** | `@coral-xyz/anchor ^0.31.x` | ≥17 | 5.x | |
| **0.30.x** | `@coral-xyz/anchor ^0.30.x` | ≥16 | 4.x–5.x | |
| **0.29.x** | `@coral-xyz/anchor ^0.29.x` | ≥16 | 4.x | |

### Anchor v1 TypeScript Package Rename

The npm package moved from `@coral-xyz/anchor` to `@anchor-lang/core`. Update `package.json` and all imports:

```bash
# Find all occurrences to update
grep -r "@coral-xyz" --include="*.ts" --include="*.js" --include="package.json" .
grep -r "dist/cjs/idl" --include="*.ts" --include="*.js" .
```

```typescript
// Before (0.32.x)
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Idl } from "@coral-xyz/anchor/dist/cjs/idl";

// After (v1)
import * as anchor from "@anchor-lang/core";
import { Program, AnchorProvider, BN } from "@anchor-lang/core";
import { Idl } from "@anchor-lang/core";
```

IDL management now uses `anchor idl init` / `anchor idl upgrade` (CLI) or `@solana-program/program-metadata` (npm) — see [migrating-v0.32-to-v1.md](./anchor/migrating-v0.32-to-v1.md#5-close-legacy-idl-accounts-and-re-publish-deploy).

## Known Working Combinations (Tested)

### 🟢 Anchor v1 (Recommended for new projects)
```
Anchor CLI: 1.0.0
anchor-lang: 1.0.0
anchor-spl: 1.0.0
solana-* crates: ^3
litesvm (dev): 0.8.2  (or 0.9.1 if solana-hash 4.0 / solana-vote-interface 5.0)
anchor-litesvm (dev): 0.3
TS: @anchor-lang/core ^1.0.0
Solana CLI: 3.x
Platform Tools: v1.52
Rust: 1.79–1.85+
Node.js: 20.x LTS
OS: Ubuntu 24.04+ (GLIBC ≥2.39) or macOS 14+
Test runner: surfpool (default in anchor test)
```

### 🟢 Modern (Recommended for existing 0.32 projects — Jan 2026)
```
Anchor CLI: 0.31.1
Solana CLI: 2.1.7 (stable)
Rust: 1.83.0
Platform Tools: v1.50
Node.js: 20.x LTS
OS: Ubuntu 24.04 or macOS 14+
```

### 🟢 Latest 0.32.x (Cutting edge pre-v1)
```
Anchor CLI: 0.32.1
Solana CLI: 2.1.7+
Rust: 1.84.0+
Platform Tools: v1.52
Node.js: 20.x LTS
OS: Ubuntu 24.04+ (GLIBC ≥2.39) or macOS 14+
```

### 🟡 Legacy Compatible (For older systems)
```
Anchor CLI: 0.30.1
Solana CLI: 1.18.26
Rust: 1.79.0
Platform Tools: v1.43
Node.js: 18.x LTS
OS: Ubuntu 20.04+ or macOS 12+
```

### 🟡 Transitional (Upgrading from 0.30 → 0.31)
```
Anchor CLI: 0.31.0
Solana CLI: 2.0.x
Rust: 1.79.0
Platform Tools: v1.47
Node.js: 20.x LTS
OS: Ubuntu 24.04 or macOS 14+
```

## Testing Tools: LiteSVM / Bankrun Compatibility

### LiteSVM Rust Crate — Version Selection

Use the row that matches your workspace's resolved `solana-*` granular crate versions:

| litesvm (Rust) | solana-* era | Key markers | anchor-litesvm |
|---|---|---|---|
| **0.8.2** | `~3.0` | `solana-hash ~3.0`, `solana-vote-interface 4.0`, `solana-system-interface 2.0` | `0.3` (requires `anchor-lang ^1.0.0`, `litesvm ^0.8.2`) |
| **0.9.1** | `~3.1`–`~3.3` | `solana-hash 4.0`, `solana-vote-interface 5.0`, `solana-system-interface 3.0` | TBD — `anchor-litesvm 0.3` declared `litesvm ^0.8.2`; check for a newer release |
| **>0.10.0** | `3.3+` | follow latest releases | follow litesvm/anchor-litesvm release |

**Diagnostic:** run `cargo tree -d` — duplicate `solana-*` minor versions in the tree means the selected `litesvm` version is mismatched.

### LiteSVM npm Package (TypeScript tests)

| Tool | npm Package | GLIBC Req | Node.js | Notes |
|---|---|---|---|---|
| **LiteSVM 0.5.0** | `litesvm` | ≥2.38 ⚠️ | ≥18 | **Tested: native binary (`litesvm.linux-x64-gnu.node`) fails on Debian 12 (GLIBC 2.36) with `undefined symbol: __isoc23_strtol`**. Works on Ubuntu 24.04+, macOS. |
| **LiteSVM 0.3.x** | `litesvm` | ≥2.31 | ≥16 | Older API, may work on older systems |
| **solana-bankrun** | `solana-bankrun` | ≥2.28 | ≥16 | Legacy — being replaced by LiteSVM |
| **anchor-bankrun** | `anchor-bankrun` | ≥2.28 | ≥16 | Legacy Anchor wrapper for bankrun |
| **anchor-litesvm** | `anchor-litesvm` | Same as litesvm | ≥18 | Anchor wrapper for LiteSVM |

### LiteSVM on Older Systems
If `litesvm` 0.5.0 fails with GLIBC errors:
1. **Upgrade OS** to Ubuntu 24.04+ (recommended)
2. **Use Docker**: `FROM ubuntu:24.04` base image
3. **Fall back to `solana-bankrun`** temporarily
4. **Build litesvm from source** (requires Rust + napi-rs toolchain)

### Verified Test Environment (Jan 2026)
```
✅ Works: Anchor CLI 0.30.1 (built from source) + Solana CLI 2.2.16 + Rust 1.93.0 + Debian 12
❌ Fails: litesvm 0.5.0 native binary on Debian 12 (GLIBC 2.36)
❌ Fails: Anchor 0.31.1/0.32.1 pre-built binaries on Debian 12 (GLIBC 2.36)
✅ Works: cargo build-sbf (Solana 2.2.16, platform-tools v1.48) on Debian 12
✅ Works: Anchor 0.30.1 built from source with Rust 1.93.0 on Debian 12
```
