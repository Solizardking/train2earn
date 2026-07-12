# Solana Security Vulnerabilities & Prevention

Critical security patterns for Solana program development. Review this before deploying to mainnet.

## Top Vulnerabilities

### 1. Missing Signer Check

**Vulnerability**: Not verifying that the expected account signed the transaction.

```rust
// ❌ VULNERABLE - Anyone can call
pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    // Transfers without checking who authorized it
}

// ✅ SECURE - Requires signer
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,  // Must be a Signer
    
    #[account(
        mut,
        has_one = authority,  // Verify authority matches
    )]
    pub vault: Account<'info, Vault>,
}
```

### 2. Missing Owner Check

**Vulnerability**: Not verifying that an account is owned by the expected program.

```rust
// ❌ VULNERABLE - Accepts any account
pub fn process(ctx: Context<Process>) -> Result<()> {
    let data = &ctx.accounts.data;
    // Could be a fake account with manipulated data
}

// ✅ SECURE - Anchor Account<> type enforces ownership
#[derive(Accounts)]
pub struct Process<'info> {
    // Account<'info, T> automatically checks:
    // 1. Owner is this program
    // 2. Discriminator matches T
    pub data: Account<'info, MyData>,
}

// ✅ SECURE - Manual check for AccountInfo
/// CHECK: Manually verified
#[account(
    constraint = data.owner == &expected_program_id @ ErrorCode::InvalidOwner
)]
pub data: AccountInfo<'info>,
```

### 3. Arithmetic Overflow/Underflow

**Vulnerability**: Integer overflow can wrap around, causing unexpected values.

```rust
// ❌ VULNERABLE - Can overflow
let new_balance = balance + amount;
let shares = total_supply * amount / total_value;

// ✅ SECURE - Use checked math
let new_balance = balance
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;

let shares = total_supply
    .checked_mul(amount)
    .and_then(|x| x.checked_div(total_value))
    .ok_or(ErrorCode::MathOverflow)?;
```

### 4. Missing Rent Exemption

**Vulnerability**: Account can be garbage collected if not rent-exempt.

```rust
// ❌ VULNERABLE - May not have enough lamports
#[account(init, payer = user, space = 100)]
pub data: Account<'info, MyData>,

// ✅ SECURE - Anchor handles rent automatically
// But verify manually created accounts:
let rent = Rent::get()?;
require!(
    account.lamports() >= rent.minimum_balance(account.data_len()),
    ErrorCode::NotRentExempt
);
```

### 5. PDA Seed Collisions

**Vulnerability**: Different inputs producing the same PDA.

```rust
// ❌ VULNERABLE - Seeds can collide
// user1 = "ab", id = "c" has same seeds as user1 = "a", id = "bc"
seeds = [user_name.as_bytes(), id.as_bytes()]

// ✅ SECURE - Use fixed-length or delimited seeds
seeds = [
    b"vault",
    user.key().as_ref(),  // Fixed 32 bytes
    &[id],                // Single byte
]

// ✅ SECURE - Use length prefix
seeds = [
    &(user_name.len() as u8).to_le_bytes(),
    user_name.as_bytes(),
    id.as_bytes(),
]
```

### 6. Missing Account Validation

**Vulnerability**: Not validating all required account properties.

```rust
// ❌ VULNERABLE - Doesn't verify account relationships
#[derive(Accounts)]
pub struct Transfer<'info> {
    pub from: Account<'info, TokenAccount>,
    pub to: Account<'info, TokenAccount>,
}

// ✅ SECURE - Validate all relationships
#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub from: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = mint,  // Same mint as source
    )]
    pub to: Account<'info, TokenAccount>,
    
    pub mint: Account<'info, Mint>,
    pub owner: Signer<'info>,
}
```

### 7. Reentrancy

**Vulnerability**: External call allows reentry before state update.

```rust
// ❌ VULNERABLE - State updated after external call
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    // External call first
    token::transfer(cpi_ctx, amount)?;
    
    // State update after - could be reentered
    ctx.accounts.vault.balance -= amount;
    Ok(())
}

// ✅ SECURE - Checks-Effects-Interactions pattern
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    
    // 1. CHECKS
    require!(vault.balance >= amount, ErrorCode::InsufficientFunds);
    
    // 2. EFFECTS - Update state FIRST
    vault.balance = vault.balance
        .checked_sub(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // 3. INTERACTIONS - External call LAST
    token::transfer(cpi_ctx, amount)?;
    
    Ok(())
}
```

### 8. Type Confusion

**Vulnerability**: Deserializing account data as wrong type.

```rust
// ❌ VULNERABLE - Raw deserialization
let account_data = &ctx.accounts.data.try_borrow_data()?;
let state: State = State::try_from_slice(account_data)?;

// ✅ SECURE - Anchor discriminator check
// Account<'info, State> automatically verifies the 8-byte discriminator
pub state: Account<'info, State>,

// ✅ SECURE - Manual discriminator check
let discriminator = &account_data[..8];
require!(
    discriminator == State::DISCRIMINATOR,
    ErrorCode::InvalidAccountType
);
```

### 9. Duplicate Account Attack

**Vulnerability**: Same account passed multiple times.

```rust
// ❌ VULNERABLE - Same account could be from and to
pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    let from = &mut ctx.accounts.from;
    let to = &mut ctx.accounts.to;
    // If from == to, balance manipulation possible
}

// ✅ SECURE - Verify accounts are different
#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(
        mut,
        constraint = from.key() != to.key() @ ErrorCode::SameAccount
    )]
    pub from: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub to: Account<'info, TokenAccount>,
}
```

### 10. Uninitialized Account

**Vulnerability**: Using account before it's properly initialized.

```rust
// ❌ VULNERABLE - Account might have garbage data
pub fn read_state(ctx: Context<ReadState>) -> Result<()> {
    let state = &ctx.accounts.state;
    msg!("Data: {}", state.data);  // Could be uninitialized
}

// ✅ SECURE - Check initialization flag
#[account]
pub struct State {
    pub is_initialized: bool,
    pub data: u64,
}

pub fn read_state(ctx: Context<ReadState>) -> Result<()> {
    require!(ctx.accounts.state.is_initialized, ErrorCode::NotInitialized);
    // Safe to use
}

// ✅ SECURE - Anchor handles with init constraint
#[account(init, ...)]  // Guarantees fresh account
```

## Security Checklist

### Before Each Instruction

- [ ] All accounts that should sign are marked `Signer`
- [ ] All mutable accounts are marked `mut`
- [ ] Account ownership is verified
- [ ] Account data discriminators are checked
- [ ] PDA seeds are properly validated
- [ ] Bump seeds are verified (not just derived)
- [ ] All `has_one` constraints are in place
- [ ] No duplicate accounts possible

### Arithmetic Safety

- [ ] All math uses `checked_*` operations
- [ ] Division by zero is handled
- [ ] Precision loss is minimized in order of operations
- [ ] Casting between integer types is safe

### State Management

- [ ] State is updated BEFORE external calls
- [ ] Account closure sends lamports to correct recipient
- [ ] Rent exemption is maintained
- [ ] No uninitialized reads

### Access Control

- [ ] Admin functions have proper authority checks
- [ ] Upgrade authority is properly configured
- [ ] Time-based locks are implemented correctly
- [ ] Multi-sig requirements are enforced

## Testing for Security

### Unit Tests

```rust
#[test]
fn test_missing_signer_fails() {
    let mut svm = LiteSVM::new();
    // ... setup ...
    
    // Try to call without proper signer
    let fake_authority = Keypair::new();
    let ix = instruction::withdraw(&program_id, &fake_authority.pubkey());
    
    let result = svm.send_transaction(tx);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        TransactionError::SignatureFailure
    ));
}

#[test]
fn test_overflow_prevented() {
    // Test with max values
    let max_amount = u64::MAX;
    let result = process_deposit(max_amount);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        ProgramError::Custom(ErrorCode::MathOverflow as u32)
    ));
}
```

### Fuzz Testing

```rust
use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;

#[derive(Arbitrary, Debug)]
struct FuzzInput {
    amount: u64,
    authority: [u8; 32],
}

fuzz_target!(|input: FuzzInput| {
    // Run program with arbitrary inputs
    // Look for panics, overflows, unexpected behavior
});
```

## Audit Resources

- [Solana Security Best Practices](https://docs.solana.com/developing/programming-model/security)
- [Neodyme Blog](https://blog.neodyme.io/) - Solana security research
- [OtterSec](https://osec.io/) - Security audits
- [sec3](https://www.sec3.dev/) - Automated auditing
