# Solana Testing Guide

Testing Solana programs with LiteSVM, Mollusk, and Surfpool - January 2026 best practices.

## Testing Stack Overview

| Tool | Use Case | Speed | Features |
|------|----------|-------|----------|
| LiteSVM | Unit tests | ⚡ Fast | In-memory SVM |
| Mollusk | Instruction tests | ⚡ Fast | Single instruction |
| Surfpool | Integration | 🐢 Slower | Mainnet state |

## LiteSVM

### Installation

```toml
[dev-dependencies]
litesvm = "0.3"
solana-sdk = "2.0"
```

### Basic Setup

```rust
use litesvm::LiteSVM;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

fn setup_test() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    
    // Add your program
    svm.add_program_from_file(
        my_program::ID,
        "target/deploy/my_program.so"
    ).unwrap();
    
    // Create funded wallet
    let wallet = Keypair::new();
    svm.airdrop(&wallet.pubkey(), 10_000_000_000).unwrap();
    
    (svm, wallet)
}
```

### Testing Instructions

```rust
#[test]
fn test_initialize() {
    let (mut svm, wallet) = setup_test();
    
    // Derive PDA
    let (state_pda, bump) = Pubkey::find_program_address(
        &[b"state", wallet.pubkey().as_ref()],
        &my_program::ID,
    );
    
    // Build instruction
    let ix = Instruction {
        program_id: my_program::ID,
        accounts: vec![
            AccountMeta::new(state_pda, false),
            AccountMeta::new(wallet.pubkey(), true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: my_program::instruction::Initialize { data: 42 }.data(),
    };
    
    // Create and send transaction
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&wallet.pubkey()),
        &[&wallet],
        svm.latest_blockhash(),
    );
    
    let result = svm.send_transaction(tx);
    assert!(result.is_ok());
    
    // Verify state
    let account = svm.get_account(&state_pda).unwrap();
    let state: State = State::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(state.data, 42);
}
```

### Testing Token Operations

```rust
#[test]
fn test_token_transfer() {
    let (mut svm, wallet) = setup_test();
    
    // Add token program
    svm.add_program_from_file(
        spl_token::ID,
        "spl_token.so"
    ).unwrap();
    
    // Create mint
    let mint = Keypair::new();
    let create_mint_ix = create_mint_ix(
        &wallet.pubkey(),
        &mint.pubkey(),
        6, // decimals
    );
    
    let tx = Transaction::new_signed_with_payer(
        &create_mint_ix,
        Some(&wallet.pubkey()),
        &[&wallet, &mint],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).unwrap();
    
    // Create token accounts and transfer
    // ...
}
```

### Testing Errors

```rust
#[test]
fn test_unauthorized_fails() {
    let (mut svm, wallet) = setup_test();
    
    // Setup state owned by wallet
    initialize_state(&mut svm, &wallet);
    
    // Try to update with different signer
    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    
    let ix = my_program::instruction::update(
        &my_program::ID,
        &state_pda,
        &attacker.pubkey(),
        999,
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&attacker.pubkey()),
        &[&attacker],
        svm.latest_blockhash(),
    );
    
    let result = svm.send_transaction(tx);
    assert!(result.is_err());
    
    // Verify specific error
    match result {
        Err(e) => {
            assert!(e.to_string().contains("Unauthorized"));
        }
        Ok(_) => panic!("Expected error"),
    }
}
```

## Mollusk (Instruction-Level Testing)

### Installation

```toml
[dev-dependencies]
mollusk-svm = "0.1"
```

### Setup

```rust
use mollusk_svm::Mollusk;

fn setup_mollusk() -> Mollusk {
    let mut mollusk = Mollusk::new(&my_program::ID, "target/deploy/my_program.so");
    mollusk.add_program(&spl_token::ID, "spl_token.so");
    mollusk
}
```

### Testing Single Instruction

```rust
#[test]
fn test_instruction_with_mollusk() {
    let mollusk = setup_mollusk();
    
    // Setup accounts
    let authority = Keypair::new();
    let (state_pda, _) = Pubkey::find_program_address(
        &[b"state", authority.pubkey().as_ref()],
        &my_program::ID,
    );
    
    // Create instruction
    let ix = my_program::instruction::initialize(42);
    
    // Define account states
    let accounts = vec![
        (state_pda, AccountSharedData::new(0, 0, &system_program::ID)),
        (authority.pubkey(), AccountSharedData::new(1_000_000_000, 0, &system_program::ID)),
        (system_program::ID, AccountSharedData::new(0, 0, &native_loader::ID)),
    ];
    
    // Process instruction
    let result = mollusk.process_instruction(&ix, &accounts);
    
    // Check result
    assert!(result.is_ok());
    
    // Verify account changes
    let new_state = result.unwrap().get_account(&state_pda).unwrap();
    // ...
}
```

### Testing Compute Units

```rust
#[test]
fn test_compute_units() {
    let mollusk = setup_mollusk();
    
    let ix = my_program::instruction::complex_operation();
    let result = mollusk.process_instruction(&ix, &accounts);
    
    let cu_consumed = result.unwrap().compute_units_consumed;
    
    // Verify within limits
    assert!(cu_consumed < 200_000, "CU too high: {}", cu_consumed);
    
    // Log for optimization
    println!("Compute units: {}", cu_consumed);
}
```

## Surfpool (Integration Testing)

### Installation

```bash
cargo install surfpool
```

### Configuration

```toml
# Surfpool.toml
[network]
rpc_url = "https://api.mainnet-beta.solana.com"

[cache]
enabled = true
path = ".surfpool/cache"

[programs]
my_program = "target/deploy/my_program.so"
```

### Test with Mainnet State

```rust
use surfpool::Surfpool;

#[tokio::test]
async fn test_with_mainnet_state() {
    let surfpool = Surfpool::new()
        .with_mainnet_accounts(&[
            // Fetch these accounts from mainnet
            "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // Jupiter
            "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", // Orca
        ])
        .await
        .unwrap();
    
    // Now test against real state
    let wallet = Keypair::new();
    surfpool.airdrop(&wallet.pubkey(), 1_000_000_000).await.unwrap();
    
    // Your program interacts with real Jupiter/Orca state
    let ix = my_program::instruction::swap_via_jupiter(/* ... */);
    
    let result = surfpool.send_transaction(tx).await;
    assert!(result.is_ok());
}
```

### Fork Mainnet at Block

```rust
#[tokio::test]
async fn test_at_specific_block() {
    let surfpool = Surfpool::new()
        .at_slot(250_000_000)  // Fork at specific slot
        .with_program("target/deploy/my_program.so")
        .await
        .unwrap();
    
    // Test against historical state
}
```

## TypeScript Integration Tests

### Anchor Test Setup

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MyProgram } from "../target/types/my_program";

describe("my_program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MyProgram as Program<MyProgram>;

  it("initializes state", async () => {
    const [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initialize(new anchor.BN(42))
      .accounts({
        state: statePda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.state.fetch(statePda);
    expect(state.data.toNumber()).to.equal(42);
  });
});
```

### Testing with Bankrun

```typescript
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";

describe("bankrun tests", () => {
  let context;
  let provider;
  let program;

  before(async () => {
    context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    program = new Program(IDL, provider);
  });

  it("fast test with bankrun", async () => {
    // Tests run in-memory, much faster
    await program.methods.initialize(new BN(42)).rpc();
  });
});
```

## Test Patterns

### Setup/Teardown Pattern

```rust
struct TestContext {
    svm: LiteSVM,
    authority: Keypair,
    state_pda: Pubkey,
}

impl TestContext {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(my_program::ID, "target/deploy/my_program.so").unwrap();
        
        let authority = Keypair::new();
        svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
        
        let (state_pda, _) = Pubkey::find_program_address(
            &[b"state", authority.pubkey().as_ref()],
            &my_program::ID,
        );
        
        Self { svm, authority, state_pda }
    }
    
    fn initialize(&mut self, data: u64) -> Result<(), Box<dyn Error>> {
        // Initialize state
        Ok(())
    }
}

#[test]
fn test_with_context() {
    let mut ctx = TestContext::new();
    ctx.initialize(42).unwrap();
    // ...
}
```

### Property-Based Testing

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_deposit_withdraw_balance(
        deposit in 1u64..1_000_000_000,
        withdraw in 1u64..1_000_000_000,
    ) {
        let (mut svm, wallet) = setup_test();
        
        // Deposit
        deposit_funds(&mut svm, &wallet, deposit);
        
        // Withdraw (capped at deposited amount)
        let withdraw_amount = withdraw.min(deposit);
        withdraw_funds(&mut svm, &wallet, withdraw_amount);
        
        // Verify balance
        let balance = get_balance(&svm, &wallet);
        prop_assert_eq!(balance, deposit - withdraw_amount);
    }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Rust
        uses: dtolnay/rust-action@stable
      
      - name: Install Solana
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/v2.0.0/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
      
      - name: Build
        run: anchor build
      
      - name: Test
        run: cargo test --all
      
      - name: Integration Tests
        run: anchor test
```
