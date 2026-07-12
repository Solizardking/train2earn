# Anchor Program Development Guide

Best practices for building Solana programs with Anchor framework - January 2026.

## Project Setup

### Initialize Project

```bash
anchor init my_program
cd my_program
```

### Project Structure

```
my_program/
├── Anchor.toml          # Config
├── Cargo.toml           # Workspace
├── programs/
│   └── my_program/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs   # Program code
├── tests/
│   └── my_program.ts    # Integration tests
└── app/                 # Frontend (optional)
```

### Anchor.toml

```toml
[features]
seeds = true
skip-lint = false

[programs.devnet]
my_program = "PROGRAM_ID_HERE"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

## Program Structure

### Basic Program

```rust
use anchor_lang::prelude::*;

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod my_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.data = data;
        state.bump = ctx.bumps.state;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, new_data: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.data = new_data;
        Ok(())
    }
}
```

### Account Structs

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + State::INIT_SPACE,
        seeds = [b"state", authority.key().as_ref()],
        bump
    )]
    pub state: Account<'info, State>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(
        mut,
        seeds = [b"state", authority.key().as_ref()],
        bump = state.bump,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, State>,
    
    pub authority: Signer<'info>,
}
```

### State Accounts

```rust
#[account]
#[derive(InitSpace)]
pub struct State {
    pub authority: Pubkey,
    pub data: u64,
    pub bump: u8,
    #[max_len(32)]
    pub name: String,
}
```

## Account Constraints

### Common Constraints

```rust
#[account(
    init,                    // Create new account
    payer = payer,           // Who pays rent
    space = 8 + 32 + 8,      // Discriminator + data
)]

#[account(mut)]              // Account must be mutable

#[account(
    seeds = [b"seed", key.as_ref()],
    bump
)]                           // PDA derivation

#[account(
    has_one = authority      // Verify field matches
)]

#[account(
    constraint = amount > 0 @ ErrorCode::InvalidAmount
)]                           // Custom constraint

#[account(
    close = recipient        // Close account, send lamports
)]
```

### Token Constraints

```rust
use anchor_spl::token::{Token, TokenAccount, Mint};

#[derive(Accounts)]
pub struct TokenTransfer<'info> {
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = from,
    )]
    pub from_ata: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = from,
        associated_token::mint = mint,
        associated_token::authority = to,
    )]
    pub to_ata: Account<'info, TokenAccount>,
    
    pub mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub from: Signer<'info>,
    
    /// CHECK: Recipient doesn't need to sign
    pub to: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
```

## Error Handling

### Custom Errors

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid amount: must be greater than 0")]
    InvalidAmount,
    
    #[msg("Account already initialized")]
    AlreadyInitialized,
    
    #[msg("Insufficient funds")]
    InsufficientFunds,
    
    #[msg("Overflow in calculation")]
    MathOverflow,
}
```

### Using Errors

```rust
pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    
    let balance = ctx.accounts.from.lamports();
    require!(balance >= amount, ErrorCode::InsufficientFunds);
    
    // Safe math
    let new_balance = balance
        .checked_sub(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    
    Ok(())
}
```

## PDAs and Signing

### PDA Seeds

```rust
#[account(
    seeds = [
        b"vault",
        user.key().as_ref(),
        mint.key().as_ref(),
    ],
    bump
)]
pub vault: Account<'info, TokenAccount>,
```

### CPI with PDA Signer

```rust
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let seeds = &[
        b"vault",
        ctx.accounts.user.key.as_ref(),
        ctx.accounts.mint.key().as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_ata.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    
    token::transfer(cpi_ctx, amount)?;
    Ok(())
}
```

## Events

### Define Events

```rust
#[event]
pub struct TransferEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
```

### Emit Events

```rust
pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    // ... transfer logic ...
    
    emit!(TransferEvent {
        from: ctx.accounts.from.key(),
        to: ctx.accounts.to.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
```

## Testing with LiteSVM

### Setup

```rust
use litesvm::LiteSVM;
use solana_sdk::{signature::Keypair, signer::Signer};

#[test]
fn test_initialize() {
    let mut svm = LiteSVM::new();
    
    // Add program
    svm.add_program_from_file(
        my_program::ID,
        "target/deploy/my_program.so"
    );
    
    // Create accounts
    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
    
    // Build and send transaction
    let ix = my_program::instruction::initialize(
        &my_program::ID,
        &authority.pubkey(),
        42,
    );
    
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&authority.pubkey()),
        &[&authority],
        svm.latest_blockhash(),
    );
    
    let result = svm.send_transaction(tx);
    assert!(result.is_ok());
    
    // Verify state
    let (state_pda, _) = Pubkey::find_program_address(
        &[b"state", authority.pubkey().as_ref()],
        &my_program::ID,
    );
    
    let account = svm.get_account(&state_pda).unwrap();
    let state: State = State::try_deserialize(&mut account.data.as_slice()).unwrap();
    
    assert_eq!(state.data, 42);
    assert_eq!(state.authority, authority.pubkey());
}
```

## IDL Generation

### Build with IDL

```bash
anchor build
```

### IDL Location

```
target/idl/my_program.json
target/types/my_program.ts  # TypeScript types
```

### Client Generation

```typescript
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { MyProgram } from './types/my_program';
import idl from './idl/my_program.json';

const program = new Program<MyProgram>(idl, provider);

// Typed instruction call
await program.methods
  .initialize(new BN(42))
  .accounts({
    state: statePda,
    authority: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Deployment

### Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

### Verify Deployment

```bash
solana program show <PROGRAM_ID>
```

### Upgrade Program

```bash
anchor upgrade target/deploy/my_program.so \
  --program-id <PROGRAM_ID> \
  --provider.cluster mainnet
```

## Best Practices

### 1. Use InitSpace Derive

```rust
#[account]
#[derive(InitSpace)]
pub struct State {
    pub authority: Pubkey,  // 32 bytes
    pub data: u64,          // 8 bytes
    #[max_len(100)]
    pub name: String,       // 4 + 100 bytes
}

// In accounts:
space = 8 + State::INIT_SPACE
```

### 2. Validate All Inputs

```rust
pub fn process(ctx: Context<Process>, amount: u64, recipient: Pubkey) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(amount <= MAX_AMOUNT, ErrorCode::AmountTooLarge);
    require!(recipient != Pubkey::default(), ErrorCode::InvalidRecipient);
    // ...
}
```

### 3. Use Safe Math

```rust
let result = a
    .checked_add(b)
    .ok_or(ErrorCode::MathOverflow)?;

let result = a
    .checked_mul(b)
    .and_then(|x| x.checked_div(c))
    .ok_or(ErrorCode::MathOverflow)?;
```

### 4. Close Accounts Properly

```rust
#[account(
    mut,
    close = recipient,
    has_one = authority,
)]
pub state: Account<'info, State>,

#[account(mut)]
/// CHECK: Receives closed account lamports
pub recipient: AccountInfo<'info>,
```

### 5. Document with Comments

```rust
/// Initialize a new vault for the user.
/// 
/// # Arguments
/// * `ctx` - Initialize context
/// * `deposit_amount` - Initial deposit in lamports
/// 
/// # Errors
/// * `InvalidAmount` - If deposit_amount is 0
pub fn initialize(ctx: Context<Initialize>, deposit_amount: u64) -> Result<()> {
    // ...
}
```
