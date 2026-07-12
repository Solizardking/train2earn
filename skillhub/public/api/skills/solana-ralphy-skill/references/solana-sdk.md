# Solana SDK Reference (@solana/kit)

Modern Solana development patterns using @solana/kit (v5.x) - January 2026 best practices.

## Package Overview

| Package | Purpose |
|---------|---------|
| `@solana/kit` | Core SDK (replaces @solana/web3.js) |
| `@solana/client` | RPC client |
| `@solana/react-hooks` | React integration |
| `@solana/web3-compat` | web3.js compatibility layer |

## RPC Connection

### Basic Setup

```typescript
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

// HTTP RPC
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');

// WebSocket subscriptions
const rpcSubscriptions = createSolanaRpcSubscriptions(
  'wss://api.mainnet-beta.solana.com'
);
```

### With Helius

```typescript
const rpc = createSolanaRpc(
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
);
```

## Account Fetching

### Get Account Info

```typescript
import { getAccount, fetchEncodedAccount } from '@solana/kit';

// Fetch and decode
const account = await getAccount(rpc, address);

// Fetch raw
const encoded = await fetchEncodedAccount(rpc, address);
```

### Multiple Accounts

```typescript
import { getMultipleAccounts } from '@solana/kit';

const accounts = await getMultipleAccounts(rpc, [addr1, addr2, addr3]);
```

## Transaction Building

### Create Transaction

```typescript
import {
  createTransaction,
  setTransactionFeePayer,
  appendTransactionInstruction,
  signTransaction,
} from '@solana/kit';

// Build transaction
let tx = createTransaction({ version: 0 });
tx = setTransactionFeePayer(wallet.publicKey, tx);
tx = appendTransactionInstruction(instruction, tx);

// Sign
const signedTx = await signTransaction([wallet], tx);
```

### With Instructions

```typescript
import { 
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/kit';

const transferIx = createTransferInstruction({
  source: sourceAta,
  destination: destAta,
  owner: wallet.publicKey,
  amount: 1_000_000n, // Use bigint for amounts
});
```

## Sending Transactions

### Send and Confirm

```typescript
import { sendAndConfirmTransaction } from '@solana/kit';

const signature = await sendAndConfirmTransaction(
  rpc,
  signedTx,
  { commitment: 'confirmed' }
);
```

### With Retry

```typescript
import { sendAndConfirmTransactionWithRetry } from '@solana/kit';

const signature = await sendAndConfirmTransactionWithRetry(
  rpc,
  signedTx,
  {
    commitment: 'confirmed',
    maxRetries: 3,
    retryDelay: 1000,
  }
);
```

## Token Operations

### Get Token Account

```typescript
import { getAssociatedTokenAddress, getTokenAccount } from '@solana/kit';

const ata = await getAssociatedTokenAddress(mint, owner);
const tokenAccount = await getTokenAccount(rpc, ata);

console.log('Balance:', tokenAccount.amount);
```

### Create Token Account

```typescript
import { createAssociatedTokenAccountInstruction } from '@solana/kit';

const ix = createAssociatedTokenAccountInstruction({
  payer: wallet.publicKey,
  associatedToken: ata,
  owner: owner,
  mint: mint,
});
```

### Transfer Tokens

```typescript
import { createTransferCheckedInstruction } from '@solana/kit';

const ix = createTransferCheckedInstruction({
  source: sourceAta,
  mint: mint,
  destination: destAta,
  owner: wallet.publicKey,
  amount: 1_000_000n,
  decimals: 6,
});
```

## PDAs (Program Derived Addresses)

### Find PDA

```typescript
import { findProgramAddress } from '@solana/kit';

const [pda, bump] = await findProgramAddress(
  [
    Buffer.from('seed'),
    wallet.publicKey.toBuffer(),
  ],
  programId
);
```

### Create PDA Instruction

```typescript
const ix = {
  programId,
  keys: [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
  ],
  data: instructionData,
};
```

## React Integration (framework-kit)

### Wallet Provider

```tsx
import { 
  WalletProvider,
  ConnectionProvider,
} from '@solana/react-hooks';

function App({ children }) {
  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={[phantom, solflare]}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### useWallet Hook

```tsx
import { useWallet } from '@solana/react-hooks';

function WalletButton() {
  const { connected, publicKey, connect, disconnect } = useWallet();

  if (connected) {
    return (
      <button onClick={disconnect}>
        {publicKey.toBase58().slice(0, 4)}...
      </button>
    );
  }

  return <button onClick={connect}>Connect</button>;
}
```

### useConnection Hook

```tsx
import { useConnection } from '@solana/react-hooks';

function Balance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (publicKey) {
      connection.getBalance(publicKey).then(setBalance);
    }
  }, [publicKey, connection]);

  return <div>{balance / LAMPORTS_PER_SOL} SOL</div>;
}
```

### useSendTransaction

```tsx
import { useSendTransaction } from '@solana/react-hooks';

function SendButton() {
  const { sendTransaction, status, error } = useSendTransaction();

  const handleSend = async () => {
    const signature = await sendTransaction(transaction);
    console.log('Sent:', signature);
  };

  return (
    <button onClick={handleSend} disabled={status === 'pending'}>
      {status === 'pending' ? 'Sending...' : 'Send'}
    </button>
  );
}
```

## web3.js Compatibility

### Bridge Pattern

```typescript
import { toWeb3JsTransaction, fromWeb3JsTransaction } from '@solana/web3-compat';

// Convert Kit transaction to web3.js
const web3Tx = toWeb3JsTransaction(kitTx);

// Convert web3.js transaction to Kit
const kitTx = fromWeb3JsTransaction(web3Tx);
```

### Legacy Library Integration

```typescript
import { Connection as Web3Connection } from '@solana/web3.js';
import { createWeb3JsCompatConnection } from '@solana/web3-compat';

// Create compatible connection for legacy libraries
const legacyConnection = createWeb3JsCompatConnection(rpc);

// Use with legacy library expecting web3.js Connection
await legacyLibrary.doSomething(legacyConnection);
```

## Subscriptions

### Account Changes

```typescript
const subscription = rpcSubscriptions.accountNotifications(address, {
  commitment: 'confirmed',
});

for await (const notification of subscription) {
  console.log('Account updated:', notification);
}
```

### Signature Status

```typescript
const subscription = rpcSubscriptions.signatureNotifications(signature, {
  commitment: 'confirmed',
});

for await (const notification of subscription) {
  if (notification.value.err === null) {
    console.log('Transaction confirmed!');
    break;
  }
}
```

## Compute Budget

### Set Compute Units

```typescript
import { 
  createSetComputeUnitLimitInstruction,
  createSetComputeUnitPriceInstruction,
} from '@solana/kit';

const computeLimitIx = createSetComputeUnitLimitInstruction({
  units: 200_000,
});

const computePriceIx = createSetComputeUnitPriceInstruction({
  microLamports: 1_000, // Priority fee
});

// Prepend to transaction
tx = appendTransactionInstruction(computeLimitIx, tx);
tx = appendTransactionInstruction(computePriceIx, tx);
```

## Error Handling

```typescript
import { isTransactionError, parseTransactionError } from '@solana/kit';

try {
  await sendAndConfirmTransaction(rpc, tx);
} catch (error) {
  if (isTransactionError(error)) {
    const parsed = parseTransactionError(error);
    
    if (parsed.code === 'InsufficientFunds') {
      console.log('Need more SOL');
    } else if (parsed.code === 'AccountNotFound') {
      console.log('Account does not exist');
    }
  }
}
```

## Address Lookup Tables (ALT)

### Fetch ALT

```typescript
import { fetchAddressLookupTable } from '@solana/kit';

const alt = await fetchAddressLookupTable(rpc, altAddress);
console.log('Addresses:', alt.addresses);
```

### Use in Transaction

```typescript
const tx = createTransaction({
  version: 0,
  addressTableLookups: [
    {
      lookupTableAddress: altAddress,
      writableIndexes: [0, 1],
      readonlyIndexes: [2, 3, 4],
    },
  ],
});
```

## Best Practices

### 1. Use BigInt for Amounts
```typescript
// Good
const amount = 1_000_000n;

// Avoid
const amount = 1000000;
```

### 2. Handle Blockhash Expiry
```typescript
const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash();

// Check before sending
const currentHeight = await rpc.getBlockHeight();
if (currentHeight > lastValidBlockHeight) {
  // Refresh blockhash
}
```

### 3. Simulate First
```typescript
const simulation = await rpc.simulateTransaction(tx);
if (simulation.value.err) {
  console.log('Simulation failed:', simulation.value.err);
  return;
}
```

### 4. Use Proper Commitment
```typescript
// For reads that affect UX
{ commitment: 'confirmed' }

// For critical operations
{ commitment: 'finalized' }

// For speed (use carefully)
{ commitment: 'processed' }
```
