/**
 * Bags.fm Operations Helper for Solana Ralphy
 * Token launches, trading, and fee claiming via Bags.fm SDK
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import * as dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================

interface Config {
  rpcUrl: string;
  privateKey: string;
  bagsApiKey: string;
  partnerConfigKey?: string;
}

function loadConfig(): Config {
  const rpcUrl = process.env.RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const privateKey = process.env.PRIVATE_KEY;
  const bagsApiKey = process.env.BAGS_API_KEY;
  const partnerConfigKey = process.env.BAGS_PARTNER_CONFIG_KEY;

  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable required');
  }
  if (!bagsApiKey) {
    throw new Error('BAGS_API_KEY environment variable required');
  }

  return { rpcUrl, privateKey, bagsApiKey, partnerConfigKey };
}

function getWallet(privateKey: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(privateKey));
}

// ============================================
// TOKEN LAUNCH
// ============================================

interface FeeClaimer {
  provider: 'twitter' | 'github' | 'kick';
  username: string;
  bps: number; // Basis points (100 = 1%)
}

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
  usePartnerConfig?: boolean;
}

interface LaunchTokenResult {
  mint: string;
  signature: string;
  tokenAccount: string;
}

export async function launchToken(params: LaunchTokenParams): Promise<LaunchTokenResult> {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const wallet = getWallet(config.privateKey);

  console.log(`🚀 Launching token: ${params.name} (${params.symbol})`);
  console.log(`   Initial buy: ${params.initialBuySOL} SOL`);

  // Validate fee claimers
  if (params.feeClaimers && params.feeClaimers.length > 0) {
    const totalBps = params.feeClaimers.reduce((sum, c) => sum + c.bps, 0);
    if (totalBps > 10000) {
      throw new Error(`Total fee BPS (${totalBps}) exceeds 10000`);
    }
    console.log(`   Fee claimers: ${params.feeClaimers.length}`);
    for (const claimer of params.feeClaimers) {
      console.log(`     - ${claimer.provider}/${claimer.username}: ${claimer.bps / 100}%`);
    }
  }

  // Build request body
  const requestBody: Record<string, unknown> = {
    name: params.name,
    symbol: params.symbol,
    description: params.description,
    imageUrl: params.imageUrl,
    initialBuyLamports: Math.floor(params.initialBuySOL * LAMPORTS_PER_SOL),
  };

  if (params.twitterUrl) requestBody.twitterUrl = params.twitterUrl;
  if (params.websiteUrl) requestBody.websiteUrl = params.websiteUrl;
  if (params.telegramUrl) requestBody.telegramUrl = params.telegramUrl;
  
  if (params.feeClaimers && params.feeClaimers.length > 0) {
    requestBody.feeClaimers = params.feeClaimers;
  }

  if (params.usePartnerConfig && config.partnerConfigKey) {
    requestBody.partnerConfigKey = config.partnerConfigKey;
  }

  // Make API request
  const response = await fetch('https://api.bags.fm/v2/token/launch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.bagsApiKey}`,
      'X-Wallet-Address': wallet.publicKey.toBase58(),
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Launch failed: ${error}`);
  }

  const result = await response.json();

  console.log(`✅ Token launched!`);
  console.log(`   Mint: ${result.mint}`);
  console.log(`   Signature: ${result.signature}`);

  return {
    mint: result.mint,
    signature: result.signature,
    tokenAccount: result.tokenAccount,
  };
}

// ============================================
// TRADING
// ============================================

interface TradeParams {
  mint: string;
  side: 'buy' | 'sell';
  amountLamports?: number;
  amountTokens?: number;
  slippageBps?: number;
}

interface TradeResult {
  signature: string;
  inputAmount: string;
  outputAmount: string;
}

export async function executeTrade(params: TradeParams): Promise<TradeResult> {
  const config = loadConfig();
  const wallet = getWallet(config.privateKey);

  console.log(`💱 ${params.side.toUpperCase()} trade for ${params.mint}`);

  const response = await fetch('https://api.bags.fm/v2/trade/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.bagsApiKey}`,
      'X-Wallet-Address': wallet.publicKey.toBase58(),
    },
    body: JSON.stringify({
      mint: params.mint,
      side: params.side,
      amountLamports: params.amountLamports,
      amountTokens: params.amountTokens,
      slippageBps: params.slippageBps || 100,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Trade failed: ${error}`);
  }

  const result = await response.json();

  console.log(`✅ Trade executed!`);
  console.log(`   Signature: ${result.signature}`);

  return result;
}

export async function buyWithSOL(mint: string, solAmount: number): Promise<TradeResult> {
  return executeTrade({
    mint,
    side: 'buy',
    amountLamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
  });
}

export async function sellTokens(mint: string, tokenAmount: number): Promise<TradeResult> {
  return executeTrade({
    mint,
    side: 'sell',
    amountTokens: tokenAmount,
  });
}

// ============================================
// FEE CLAIMING
// ============================================

interface FeePosition {
  mint: string;
  tokenSymbol: string;
  claimableSOL: number;
  claimableLamports: bigint;
}

interface FeeSummary {
  totalClaimableSOL: number;
  positions: FeePosition[];
}

export async function getFeeSummary(): Promise<FeeSummary> {
  const config = loadConfig();
  const wallet = getWallet(config.privateKey);

  const response = await fetch(`https://api.bags.fm/v2/fees/summary?wallet=${wallet.publicKey.toBase58()}`, {
    headers: {
      'Authorization': `Bearer ${config.bagsApiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch fee summary');
  }

  return response.json();
}

export async function claimAllFees(): Promise<{ signatures: string[]; totalClaimed: number }> {
  const config = loadConfig();
  const wallet = getWallet(config.privateKey);

  console.log('💰 Claiming all fees...');

  const response = await fetch('https://api.bags.fm/v2/fees/claim-all', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.bagsApiKey}`,
      'X-Wallet-Address': wallet.publicKey.toBase58(),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claim failed: ${error}`);
  }

  const result = await response.json();

  console.log(`✅ Claimed ${result.totalClaimed} SOL`);
  console.log(`   Transactions: ${result.signatures.length}`);

  return result;
}

export async function claimFeesForToken(mint: string): Promise<{ signature: string; claimed: number }> {
  const config = loadConfig();
  const wallet = getWallet(config.privateKey);

  console.log(`💰 Claiming fees for ${mint}...`);

  const response = await fetch('https://api.bags.fm/v2/fees/claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.bagsApiKey}`,
      'X-Wallet-Address': wallet.publicKey.toBase58(),
    },
    body: JSON.stringify({ mint }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claim failed: ${error}`);
  }

  const result = await response.json();

  console.log(`✅ Claimed ${result.claimed} SOL`);

  return result;
}

// ============================================
// PARTNER OPERATIONS
// ============================================

export async function createPartnerKey(): Promise<string> {
  const config = loadConfig();
  const wallet = getWallet(config.privateKey);

  console.log('🤝 Creating partner key...');

  const response = await fetch('https://api.bags.fm/v2/partner/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.bagsApiKey}`,
      'X-Wallet-Address': wallet.publicKey.toBase58(),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Partner key creation failed: ${error}`);
  }

  const result = await response.json();

  console.log(`✅ Partner key created!`);
  console.log(`   PDA: ${result.partnerPda}`);
  console.log('\n   Add to .env: BAGS_PARTNER_CONFIG_KEY=' + result.partnerPda);

  return result.partnerPda;
}

export async function getPartnerStats(): Promise<{
  totalFeesEarned: number;
  launchesReferred: number;
  claimableSOL: number;
}> {
  const config = loadConfig();
  const wallet = getWallet(config.privateKey);

  const response = await fetch(`https://api.bags.fm/v2/partner/stats?wallet=${wallet.publicKey.toBase58()}`, {
    headers: {
      'Authorization': `Bearer ${config.bagsApiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch partner stats');
  }

  return response.json();
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'launch': {
        // Example: ts-node bags-operations.ts launch "MyToken" "MTK" "Description" "https://img.url" 0.1
        const [, name, symbol, description, imageUrl, initialBuy] = args;
        if (!name || !symbol || !description || !imageUrl || !initialBuy) {
          console.log('Usage: launch <name> <symbol> <description> <imageUrl> <initialBuySOL>');
          process.exit(1);
        }
        await launchToken({
          name,
          symbol,
          description,
          imageUrl,
          initialBuySOL: parseFloat(initialBuy),
        });
        break;
      }

      case 'buy': {
        const [, mint, amount] = args;
        if (!mint || !amount) {
          console.log('Usage: buy <mint> <solAmount>');
          process.exit(1);
        }
        await buyWithSOL(mint, parseFloat(amount));
        break;
      }

      case 'sell': {
        const [, mint, amount] = args;
        if (!mint || !amount) {
          console.log('Usage: sell <mint> <tokenAmount>');
          process.exit(1);
        }
        await sellTokens(mint, parseInt(amount));
        break;
      }

      case 'fees': {
        const summary = await getFeeSummary();
        console.log('\n💰 Fee Summary');
        console.log(`   Total claimable: ${summary.totalClaimableSOL} SOL`);
        console.log('\n   Positions:');
        for (const pos of summary.positions) {
          console.log(`     ${pos.tokenSymbol}: ${pos.claimableSOL} SOL`);
        }
        break;
      }

      case 'claim': {
        const subCommand = args[1];
        if (subCommand === 'all') {
          await claimAllFees();
        } else if (subCommand) {
          await claimFeesForToken(subCommand);
        } else {
          console.log('Usage: claim all | claim <mint>');
        }
        break;
      }

      case 'partner': {
        const subCommand = args[1];
        if (subCommand === 'create') {
          await createPartnerKey();
        } else if (subCommand === 'stats') {
          const stats = await getPartnerStats();
          console.log('\n🤝 Partner Stats');
          console.log(`   Total earned: ${stats.totalFeesEarned} SOL`);
          console.log(`   Launches referred: ${stats.launchesReferred}`);
          console.log(`   Claimable: ${stats.claimableSOL} SOL`);
        } else {
          console.log('Usage: partner create | partner stats');
        }
        break;
      }

      default:
        console.log(`
Solana Ralphy - Bags.fm Operations

Commands:
  launch <name> <symbol> <description> <imageUrl> <initialBuySOL>
  buy <mint> <solAmount>
  sell <mint> <tokenAmount>
  fees                    Show claimable fees
  claim all               Claim all fees
  claim <mint>            Claim fees for specific token
  partner create          Create partner key
  partner stats           Show partner stats
        `);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
