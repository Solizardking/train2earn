#!/usr/bin/env node

// Publish the Skill Hub catalog to Arweave (paid in SOL via Irys) and anchor
// the Merkle root on Solana with a memo transaction.
//
//   node scripts/publish-onchain.mjs                # dry run: plan + memo preview
//   node scripts/publish-onchain.mjs --execute      # upload + anchor (needs a funded keypair)
//   node scripts/publish-onchain.mjs --execute --devnet
//
// Flags:
//   --execute          actually upload to Arweave and send the Solana memo
//   --devnet           use Solana devnet + Irys devnet (free test uploads)
//   --rpc <url>        Solana RPC endpoint (default: env SOLANA_RPC_URL or public cluster)
//   --keypair <path>   Solana keypair JSON (default: env SOLANA_KEYPAIR or ~/.config/solana/id.json)
//   --skip-arweave     anchor the memo only, without uploading (reuses last receipt's tx ids)
//
// Execute mode requires:  npm install @irys/upload @irys/upload-solana @solana/web3.js

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ONCHAIN_DIR = path.join(ROOT, "onchain");
const REGISTRY_PATH = path.join(ROOT, "public", ".well-known", "onchain-skill-registry.json");
const CATALOG_PATH = path.join(ROOT, "catalog.json");
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const DEVNET = args.includes("--devnet");
const SKIP_ARWEAVE = args.includes("--skip-arweave");
const RPC_URL = flagValue("--rpc") || process.env.SOLANA_RPC_URL
  || (DEVNET ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com");
const KEYPAIR_PATH = flagValue("--keypair") || process.env.SOLANA_KEYPAIR
  || path.join(os.homedir(), ".config", "solana", "id.json");

function flagValue(name) {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

async function main() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error("Missing on-chain registry. Run `npm run build:catalog` first.");
    process.exit(1);
  }

  const registryRaw = await readFile(REGISTRY_PATH, "utf8");
  const catalogRaw = await readFile(CATALOG_PATH, "utf8");
  const registry = JSON.parse(registryRaw);

  const uploads = [
    {
      label: "onchain-skill-registry.json",
      data: registryRaw,
      tags: baseTags(registry, "onchain-skill-registry/v1"),
    },
    {
      label: "catalog.json",
      data: catalogRaw,
      tags: baseTags(registry, "skill-catalog/v1"),
    },
  ];

  const plan = {
    schemaVersion: "skillhub-publish-plan/v1",
    createdAt: new Date().toISOString(),
    cluster: DEVNET ? "devnet" : "mainnet-beta",
    rpc: RPC_URL,
    merkleRoot: registry.merkleRoot,
    catalogHash: registry.catalogHash,
    totalSkills: registry.totalSkills,
    uploads: uploads.map(({ label, data, tags }) => ({ label, bytes: Buffer.byteLength(data), tags })),
    memoPreview: memoPayload(registry, "<registry-ar-tx>", "<catalog-ar-tx>"),
  };

  await mkdir(ONCHAIN_DIR, { recursive: true });
  await writeFile(path.join(ONCHAIN_DIR, "publish-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);

  console.log(`Skill Hub on-chain publish — ${registry.totalSkills} skills`);
  console.log(`  merkle root : ${registry.merkleRoot}`);
  console.log(`  catalog hash: ${registry.catalogHash}`);
  console.log(`  cluster     : ${plan.cluster}`);
  for (const upload of plan.uploads) {
    console.log(`  upload      : ${upload.label} (${(upload.bytes / 1024).toFixed(1)} KiB)`);
  }
  console.log(`  memo        : ${plan.memoPreview}`);
  console.log(`  plan written: onchain/publish-plan.json`);

  if (!EXECUTE) {
    console.log("\nDry run only. Re-run with --execute to upload to Arweave and anchor on Solana.");
    console.log("Execute mode needs: npm install @irys/upload @irys/upload-solana @solana/web3.js");
    return;
  }

  const deps = await loadDeps();
  const secretKey = await loadKeypair(KEYPAIR_PATH);

  let arweaveResults = [];
  if (SKIP_ARWEAVE) {
    arweaveResults = await reuseLastReceipt();
  } else {
    arweaveResults = await uploadToArweave(deps, secretKey, uploads);
  }

  const memoText = memoPayload(
    registry,
    arweaveResults[0]?.id ?? "none",
    arweaveResults[1]?.id ?? "none",
  );
  const signature = await anchorOnSolana(deps, secretKey, memoText);

  const receipt = {
    schemaVersion: "skillhub-publish-receipt/v1",
    publishedAt: new Date().toISOString(),
    cluster: plan.cluster,
    merkleRoot: registry.merkleRoot,
    catalogHash: registry.catalogHash,
    totalSkills: registry.totalSkills,
    arweave: arweaveResults.map(({ label, id }) => ({
      label,
      id,
      url: `https://gateway.irys.xyz/${id}`,
      arweaveUrl: `https://arweave.net/${id}`,
    })),
    solana: {
      memoProgram: MEMO_PROGRAM_ID,
      signature,
      explorer: `https://solscan.io/tx/${signature}${DEVNET ? "?cluster=devnet" : ""}`,
      memo: memoText,
    },
  };

  await writeFile(path.join(ONCHAIN_DIR, "publish-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

  console.log("\nPublished.");
  for (const entry of receipt.arweave) {
    console.log(`  arweave ${entry.label}: ${entry.arweaveUrl}`);
  }
  console.log(`  solana anchor: ${receipt.solana.explorer}`);
  console.log("  receipt written: onchain/publish-receipt.json");
}

function baseTags(registry, type) {
  return [
    { name: "Content-Type", value: "application/json" },
    { name: "App-Name", value: "skill-hub" },
    { name: "Type", value: type },
    { name: "Skill-Count", value: String(registry.totalSkills) },
    { name: "Merkle-Root", value: registry.merkleRoot },
    { name: "Catalog-Hash", value: registry.catalogHash },
    { name: "Hub-Url", value: registry.url },
  ];
}

function memoPayload(registry, registryTx, catalogTx) {
  return [
    "skillhub:v1",
    `skills:${registry.totalSkills}`,
    `merkle:${registry.merkleRoot}`,
    `catalog:${registry.catalogHash}`,
    `ar:${registryTx},${catalogTx}`,
  ].join("|");
}

async function loadDeps() {
  try {
    const [irysUpload, irysSolana, web3] = await Promise.all([
      import("@irys/upload"),
      import("@irys/upload-solana"),
      import("@solana/web3.js"),
    ]);
    return { irysUpload, irysSolana, web3 };
  } catch (error) {
    console.error("\nExecute mode needs the upload/anchor SDKs:");
    console.error("  npm install @irys/upload @irys/upload-solana @solana/web3.js");
    console.error(`\n(${error.message})`);
    process.exit(1);
  }
}

async function loadKeypair(keypairPath) {
  if (!existsSync(keypairPath)) {
    console.error(`Keypair not found at ${keypairPath}.`);
    console.error("Pass --keypair <path> or set SOLANA_KEYPAIR.");
    process.exit(1);
  }
  const raw = JSON.parse(await readFile(keypairPath, "utf8"));
  return Uint8Array.from(raw);
}

async function uploadToArweave(deps, secretKey, uploads) {
  const { Uploader } = deps.irysUpload;
  const { Solana } = deps.irysSolana;
  const bs58Key = base58Encode(secretKey);

  let builder = Uploader(Solana).withWallet(bs58Key).withRpc(RPC_URL);
  if (DEVNET) builder = builder.devnet();
  const irys = await builder;

  const results = [];
  for (const { label, data, tags } of uploads) {
    const size = Buffer.byteLength(data);
    const price = await irys.getPrice(size);
    const balance = await irys.getBalance();
    if (balance.isLessThan(price)) {
      const topUp = price.minus(balance).multipliedBy(1.1).integerValue();
      console.log(`  funding irys node with ${irys.utils.fromAtomic(topUp)} SOL for ${label}...`);
      await irys.fund(topUp);
    }
    const receipt = await irys.upload(data, { tags });
    console.log(`  uploaded ${label}: https://gateway.irys.xyz/${receipt.id}`);
    results.push({ label, id: receipt.id });
  }
  return results;
}

async function reuseLastReceipt() {
  const receiptPath = path.join(ONCHAIN_DIR, "publish-receipt.json");
  if (!existsSync(receiptPath)) {
    console.error("--skip-arweave needs a previous onchain/publish-receipt.json to reuse.");
    process.exit(1);
  }
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  return receipt.arweave.map(({ label, id }) => ({ label, id }));
}

async function anchorOnSolana(deps, secretKey, memoText) {
  const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = deps.web3;
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = Keypair.fromSecretKey(secretKey);

  const instruction = new TransactionInstruction({
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_PROGRAM_ID),
    data: Buffer.from(memoText, "utf8"),
  });

  const transaction = new Transaction().add(instruction);
  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
  console.log(`  anchored on solana: ${signature}`);
  return signature;
}

function base58Encode(bytes) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    encoded = ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
