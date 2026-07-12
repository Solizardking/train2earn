# Bags.fm API Reference for Solana Ralphy

Complete reference for Bags.fm token operations within the Solana Ralphy skill.

## SDK Setup

```typescript
import { BagsClient } from '@bagsfm/bags-sdk';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const connection = new Connection(process.env.RPC_URL!);
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));

const bags = new BagsClient({
  apiKey: process.env.BAGS_API_KEY!,
  connection,
  wallet,
});
```

## Token Launch v2

### Basic Launch

```typescript
const result = await bags.launchToken({
  name: "My Token",
  symbol: "MTK",
  description: "Community token",
  imageUrl: "https://example.com/logo.png",
  initialBuySOL: 0.01,
});

console.log('Mint:', result.mint);
console.log('Signature:', result.signature);
```

### Launch with Fee Sharing

```typescript
const result = await bags.launchToken({
  name: "Community Token",
  symbol: "COMM",
  description: "Community-owned token",
  imageUrl: "https://example.com/logo.png",
  initialBuySOL: 0.05,
  
  // Fee sharing configuration
  feeClaimers: [
    { provider: "twitter", username: "founder", bps: 5000 },   // 50%
    { provider: "github", username: "dev1", bps: 2000 },       // 20%
    { provider: "twitter", username: "marketing", bps: 1000 }, // 10%
    // Creator gets remaining 20%
  ],
  
  // Optional: Partner config for revenue share
  partnerConfigKey: process.env.BAGS_PARTNER_CONFIG_KEY,
});
```

### Fee Sharing Rules

| Rule | Value |
|------|-------|
| Total BPS | Must equal 10000 (100%) |
| Max claimers | 100 |
| Providers | twitter, github, kick |
| LUT threshold | Auto-created for >15 claimers |

### Supported Socials

```typescript
type SocialProvider = 'twitter' | 'github' | 'kick';

interface FeeClaimer {
  provider: SocialProvider;
  username: string;
  bps: number; // Basis points (100 = 1%)
}
```

## Trading (Wolf Mode 🐺)

### Buy Tokens

```typescript
// Buy with SOL amount
await bags.trade.buy({
  mint: "TOKEN_MINT_ADDRESS",
  amountSOL: 0.1,
  slippageBps: 100, // 1%
});

// Buy with exact token output
await bags.trade.buy({
  mint: "TOKEN_MINT_ADDRESS",
  amountTokens: 1000000,
  slippageBps: 100,
});
```

### Sell Tokens

```typescript
// Sell token amount
await bags.trade.sell({
  mint: "TOKEN_MINT_ADDRESS",
  amountTokens: 500000,
  slippageBps: 100,
});

// Sell percentage
await bags.trade.sell({
  mint: "TOKEN_MINT_ADDRESS",
  percentage: 50, // Sell 50%
  slippageBps: 100,
});
```

### Get Quote

```typescript
const quote = await bags.trade.getQuote({
  inputMint: "So11111111111111111111111111111111111111112", // SOL
  outputMint: "TOKEN_MINT",
  amountLamports: 100_000_000, // 0.1 SOL
});

console.log('Expected output:', quote.expectedOutput);
console.log('Price impact:', quote.priceImpact);
```

### Quick Swap

```typescript
await bags.trade.swap({
  inputMint: "TOKEN_A",
  outputMint: "TOKEN_B",
  amountLamports: 50_000_000,
  slippageMode: "auto", // or "manual" with slippageBps
});
```

## Fee Claiming

### View Claimable Fees

```typescript
const summary = await bags.fees.getSummary();

console.log('Total claimable:', summary.totalClaimableSOL);
console.log('Positions:', summary.positions);

for (const position of summary.positions) {
  console.log(`${position.tokenSymbol}: ${position.claimableSOL} SOL`);
}
```

### Claim All Fees

```typescript
const result = await bags.fees.claimAll();

console.log('Claimed:', result.totalClaimed);
console.log('Transactions:', result.signatures);
```

### Claim Specific Token

```typescript
const result = await bags.fees.claimForToken("TOKEN_MINT");

console.log('Claimed:', result.claimedSOL);
```

## Partner Operations

### Create Partner Key

```typescript
const partnerPda = await bags.partner.create();

console.log('Partner PDA:', partnerPda);
// Save to BAGS_PARTNER_CONFIG_KEY in .env
```

### Get Partner Stats

```typescript
const stats = await bags.partner.getStats();

console.log('Total fees earned:', stats.totalFeesEarned);
console.log('Launches referrred:', stats.launchesReferred);
console.log('Claimable:', stats.claimableSOL);
```

### Claim Partner Fees

```typescript
const result = await bags.partner.claimFees();

console.log('Claimed:', result.claimedSOL);
```

## Key Addresses

| Name | Address |
|------|---------|
| SOL Mint | `So11111111111111111111111111111111111111112` |
| Fee Share V2 Program | `FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK` |
| Bags LUT | `Eq1EVs15EAWww1YtPTtWPzJRLPJoS6VYP9oW9SbNr3yp` |

## Rate Limits

- 1,000 requests/hour per API key
- Sliding window (not fixed periods)
- Check headers: `X-RateLimit-Remaining`

## Error Handling

```typescript
try {
  await bags.launchToken({ ... });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    const resetTime = error.headers['X-RateLimit-Reset'];
    console.log(`Rate limited. Reset at: ${resetTime}`);
  } else if (error.code === 'INSUFFICIENT_SOL') {
    console.log('Need more SOL for transaction');
  } else if (error.code === 'INVALID_FEE_CONFIG') {
    console.log('Fee BPS must sum to 10000');
  }
}
```

## Jito Integration

Bags.fm automatically uses Jito bundles for faster transaction inclusion:

```typescript
// Automatic Jito submission with dynamic tip
const result = await bags.launchToken({
  // ...config
  jitoTipLamports: 10000, // Optional: override default tip
});
```

## TypeScript Types

```typescript
interface LaunchTokenParams {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  initialBuySOL: number;
  twitterUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  feeClaimers?: FeeClaimer[];
  partnerConfigKey?: string;
  jitoTipLamports?: number;
}

interface LaunchTokenResult {
  mint: string;
  signature: string;
  tokenAccount: string;
  metadata: string;
}

interface TradeParams {
  mint: string;
  amountSOL?: number;
  amountTokens?: number;
  percentage?: number;
  slippageBps?: number;
  slippageMode?: 'auto' | 'manual';
}

interface FeePosition {
  mint: string;
  tokenSymbol: string;
  claimableSOL: number;
  claimableLamports: bigint;
  poolType: 'virtual' | 'damm';
}
```

## Integration with Ralphy

When using `--with-bags`, Solana Ralphy automatically:

1. Loads Bags.fm SDK configuration
2. Parses token launch configs from YAML
3. Executes launches with proper fee sharing
4. Handles fee claiming operations
5. Manages partner configurations

### YAML Task Example

```yaml
tasks:
  - title: Launch governance token
    type: token
    platform: bags
    config:
      name: "GovernDAO"
      symbol: "GDAO"
      description: "Governance token for our DAO"
      imageUrl: "https://example.com/gdao.png"
      initialBuySOL: 0.1
      feeClaimers:
        - provider: twitter
          username: founder
          bps: 4000
        - provider: github
          username: core_dev
          bps: 3000
        - provider: twitter
          username: community
          bps: 2000
```
