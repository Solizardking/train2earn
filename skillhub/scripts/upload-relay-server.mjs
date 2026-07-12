#!/usr/bin/env node

/**
 * Skill Hub upload relay server
 *
 * Pipeline:
 *   1. POST /api/skills/upload   — accept skill files, run scanner, quote fee
 *   2. User pays fee via Solana wallet (transfer + memo)
 *   3. POST /api/skills/:id/confirm — verify payment, optional Arweave + Solana anchor
 *
 *   node scripts/upload-relay-server.mjs
 *   npm run relay:upload
 *
 * Env:
 *   PORT / SKILLHUB_UPLOAD_PORT     listen port (default 8787)
 *   SKILLHUB_MERCHANT_WALLET        SOL destination for publish fees
 *   SKILLHUB_PUBLISH_FEE_LAMPORTS   fee in lamports (default 10_000_000 = 0.01 SOL)
 *   SKILLHUB_PAYMENT_NETWORK        mainnet | devnet (default devnet)
 *   SKILLHUB_PAYMENT_RPC_URL        Solana RPC
 *   SOLANA_KEYPAIR                  optional server keypair for Irys + memo anchor
 *   SKILLHUB_UPLOAD_DIR             job storage (default onchain/submissions)
 *   SKILLHUB_CORS_ORIGIN            CORS origin (default *)
 *   SKILLHUB_AUTO_INGEST            if "1", write skills into skills/community/
 */

import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { scanUploadedSkill } from "../scanner/lib/scan-upload.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const PORT = Number(process.env.PORT || process.env.SKILLHUB_UPLOAD_PORT || 8787);
const HOST = process.env.SKILLHUB_UPLOAD_HOST || "0.0.0.0";
const NETWORK = (process.env.SKILLHUB_PAYMENT_NETWORK || "devnet").toLowerCase();
const RPC_URL = process.env.SKILLHUB_PAYMENT_RPC_URL
  || process.env.SOLANA_RPC_URL
  || (NETWORK === "mainnet" || NETWORK === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");
const MERCHANT_WALLET = process.env.SKILLHUB_MERCHANT_WALLET || "";
const FEE_LAMPORTS = Number(process.env.SKILLHUB_PUBLISH_FEE_LAMPORTS || 10_000_000);
const CORS_ORIGIN = process.env.SKILLHUB_CORS_ORIGIN || "*";
const AUTO_INGEST = process.env.SKILLHUB_AUTO_INGEST === "1";
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR
  || path.join(os.homedir(), ".config", "solana", "id.json");
const UPLOAD_DIR = path.resolve(
  process.env.SKILLHUB_UPLOAD_DIR || path.join(ROOT, "onchain", "submissions"),
);
const STATIC_DIR = path.join(PUBLIC, "publish");

const jobs = new Map();

async function main() {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await loadJobsFromDisk();

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (error) {
      console.error(`[upload-relay] ${error.stack || error}`);
      sendJson(res, 500, { error: String(error?.message || error) });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Skill Hub upload relay listening on http://${HOST}:${PORT}`);
    console.log(`  network : ${NETWORK}`);
    console.log(`  rpc     : ${RPC_URL}`);
    console.log(`  fee     : ${FEE_LAMPORTS} lamports (${(FEE_LAMPORTS / 1e9).toFixed(4)} SOL)`);
    console.log(`  merchant: ${MERCHANT_WALLET || "(set SKILLHUB_MERCHANT_WALLET)"}`);
    console.log(`  jobs    : ${UPLOAD_DIR}`);
    console.log(`  ui      : http://127.0.0.1:${PORT}/`);
  });
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET" && (pathname === "/health" || pathname === "/api/health")) {
    return sendJson(res, 200, {
      ok: true,
      service: "skillhub-upload-relay",
      network: NETWORK,
      feeLamports: FEE_LAMPORTS,
      merchantConfigured: Boolean(MERCHANT_WALLET),
      jobs: jobs.size,
    });
  }

  if (req.method === "GET" && pathname === "/api/config") {
    return sendJson(res, 200, publicConfig());
  }

  if (req.method === "POST" && pathname === "/api/skills/upload") {
    const body = await readJsonBody(req);
    return handleUpload(res, body);
  }

  if (req.method === "GET" && pathname.startsWith("/api/skills/")) {
    const id = pathname.slice("/api/skills/".length).split("/")[0];
    if (!id) return sendJson(res, 404, { error: "Missing job id" });
    const job = await getJob(id);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    return sendJson(res, 200, publicJob(job));
  }

  if (req.method === "POST" && pathname.match(/^\/api\/skills\/[^/]+\/confirm$/)) {
    const id = pathname.split("/")[3];
    const body = await readJsonBody(req);
    return handleConfirm(res, id, body);
  }

  if (req.method === "GET" && pathname === "/api/jobs") {
    const list = [...jobs.values()]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50)
      .map(publicJob);
    return sendJson(res, 200, { jobs: list });
  }

  // Static publish UI + fallback to public/
  if (req.method === "GET") {
    return serveStatic(req, res, pathname);
  }

  sendJson(res, 404, { error: "Not found" });
}

function publicConfig() {
  return {
    schemaVersion: "skillhub-upload-config/v1",
    network: NETWORK === "mainnet" ? "mainnet-beta" : NETWORK,
    rpcUrl: RPC_URL,
    merchantWallet: MERCHANT_WALLET,
    merchantName: process.env.SKILLHUB_MERCHANT_NAME || "Skill Hub",
    feeLamports: FEE_LAMPORTS,
    feeSol: FEE_LAMPORTS / 1e9,
    memoProgram: MEMO_PROGRAM_ID,
    pipeline: ["upload", "scan", "pay", "publish"],
    autoIngest: AUTO_INGEST,
    canAnchor: existsSync(KEYPAIR_PATH),
  };
}

async function handleUpload(res, body) {
  if (!body || typeof body !== "object") {
    return sendJson(res, 400, { error: "JSON body required" });
  }

  const files = Array.isArray(body.files) ? body.files : null;
  if (!files?.length) {
    return sendJson(res, 400, {
      error: "Provide files: [{ path, content }] including SKILL.md",
    });
  }

  if (files.length > 80) {
    return sendJson(res, 400, { error: "Too many files (max 80)" });
  }

  const totalBytes = files.reduce((sum, f) => {
    const len = f.encoding === "base64"
      ? Buffer.byteLength(String(f.content || ""), "base64")
      : Buffer.byteLength(String(f.content ?? ""), "utf8");
    return sum + len;
  }, 0);
  if (totalBytes > 1_500_000) {
    return sendJson(res, 400, { error: "Skill bundle too large (max ~1.5 MB)" });
  }

  const scan = scanUploadedSkill({
    slug: body.slug,
    files,
  });

  if (scan.status === "invalid") {
    return sendJson(res, 400, { error: scan.error, scan });
  }

  const jobId = randomUUID();
  const paymentMemo = `skillhub-publish:${jobId}`;
  const job = {
    schemaVersion: "skillhub-upload-job/v1",
    id: jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: scan.gate.publishAllowed ? "awaiting_payment" : "blocked",
    submitter: {
      wallet: body.wallet || null,
      label: body.label || null,
    },
    scan,
    payment: {
      network: NETWORK === "mainnet" ? "mainnet-beta" : NETWORK,
      rpcUrl: RPC_URL,
      merchantWallet: MERCHANT_WALLET,
      feeLamports: FEE_LAMPORTS,
      memo: paymentMemo,
      signature: null,
      payer: null,
      confirmedAt: null,
    },
    publish: null,
    files: files.map((f) => ({
      path: String(f.path).replace(/\\/g, "/").replace(/^\/+/, ""),
      content: f.encoding === "base64" ? undefined : String(f.content ?? ""),
      encoding: f.encoding === "base64" ? "base64" : "utf8",
      contentBase64: f.encoding === "base64" ? String(f.content || "") : undefined,
    })),
  };

  // Re-materialize content for storage
  job.storedFiles = materializeFiles(files);

  await saveJob(job);
  jobs.set(jobId, job);
  await exportPublicLedgerSafe();

  console.log(`[upload] ${jobId} slug=${scan.slug} status=${job.status} risk=${scan.risk.level}`);

  return sendJson(res, 201, {
    job: publicJob(job),
    config: publicConfig(),
  });
}

async function handleConfirm(res, jobId, body) {
  const job = await getJob(jobId);
  if (!job) return sendJson(res, 404, { error: "Job not found" });

  if (job.status === "blocked") {
    return sendJson(res, 400, {
      error: "Job is blocked by scanner findings. Fix CRITICAL issues and re-upload.",
      job: publicJob(job),
    });
  }

  if (job.status === "published") {
    return sendJson(res, 200, { job: publicJob(job), message: "Already published" });
  }

  const signature = String(body?.signature || "").trim();
  const payer = String(body?.payer || body?.wallet || "").trim();
  if (!signature) {
    return sendJson(res, 400, { error: "Payment signature is required" });
  }
  if (!MERCHANT_WALLET) {
    return sendJson(res, 503, {
      error: "Server is missing SKILLHUB_MERCHANT_WALLET — cannot verify publish fees.",
    });
  }

  // Skip re-verify if already paid
  if (job.status !== "paid" && job.status !== "published") {
    const verification = await verifyPayment({
      signature,
      expectedMemo: job.payment.memo,
      expectedLamports: job.payment.feeLamports,
      merchantWallet: MERCHANT_WALLET,
      payer: payer || null,
    });

    if (!verification.ok) {
      return sendJson(res, 402, {
        error: verification.error,
        details: verification.details || null,
      });
    }

    job.payment.signature = signature;
    job.payment.payer = verification.payer || payer || null;
    job.payment.confirmedAt = new Date().toISOString();
    job.payment.explorer = solscanTx(signature);
    job.status = "paid";
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
  }

  // Publish on-chain (Arweave + optional Solana memo)
  try {
    const publishResult = await publishSkillJob(job);
    job.publish = publishResult;
    job.status = publishResult.anchored || publishResult.arweave ? "published" : "paid_pending_anchor";
    job.updatedAt = new Date().toISOString();

    if (AUTO_INGEST && job.status === "published") {
      await ingestSkill(job);
      job.ingested = true;
    }

    await saveJob(job);
    await exportPublicLedgerSafe();
    console.log(`[publish] ${jobId} status=${job.status}`);
    return sendJson(res, 200, { job: publicJob(job) });
  } catch (error) {
    job.publish = {
      error: String(error?.message || error),
      at: new Date().toISOString(),
    };
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
    await exportPublicLedgerSafe();
    return sendJson(res, 500, {
      error: `Payment verified but publish failed: ${error.message}`,
      job: publicJob(job),
    });
  }
}

function exportPublicLedgerSafe() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "export-public-ledger.mjs")], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      if (code !== 0) console.warn(`[ledger] export exit ${code}: ${err.slice(0, 300)}`);
      resolve();
    });
    child.on("error", (error) => {
      console.warn(`[ledger] export failed: ${error.message}`);
      resolve();
    });
  });
}

function materializeFiles(files) {
  return files.map((f) => {
    const cleanPath = String(f.path).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "");
    if (f.encoding === "base64") {
      return {
        path: cleanPath,
        content: Buffer.from(String(f.content || ""), "base64").toString("base64"),
        encoding: "base64",
      };
    }
    return {
      path: cleanPath,
      content: String(f.content ?? ""),
      encoding: "utf8",
    };
  });
}

async function publishSkillJob(job) {
  const scan = job.scan;
  const packagePayload = {
    schemaVersion: "skillhub-skill-package/v1",
    publishedAt: new Date().toISOString(),
    jobId: job.id,
    slug: scan.slug,
    name: scan.name,
    description: scan.description,
    bundleHash: scan.bundleHash,
    merkleLeaf: scan.merkleLeaf,
    risk: scan.risk,
    payment: {
      signature: job.payment.signature,
      payer: job.payment.payer,
      feeLamports: job.payment.feeLamports,
      network: job.payment.network,
    },
    files: (job.storedFiles || []).map((f) => ({
      path: f.path,
      encoding: f.encoding,
      content: f.content,
      sha256: scan.files.find((x) => x.path === f.path)?.sha256 || null,
    })),
  };

  const packageJson = `${JSON.stringify(packagePayload, null, 2)}\n`;
  const packagePath = path.join(UPLOAD_DIR, job.id, "skill-package.json");
  await mkdir(path.dirname(packagePath), { recursive: true });
  await writeFile(packagePath, packageJson);

  const result = {
    packagePath: path.relative(ROOT, packagePath),
    packageHash: `sha256-${createHash("sha256").update(packageJson).digest("hex")}`,
    arweave: null,
    solana: null,
    anchored: false,
    memo: buildSkillMemo(scan, job),
  };

  if (!existsSync(KEYPAIR_PATH)) {
    result.note = "No SOLANA_KEYPAIR on server — package stored locally. Set keypair to enable Irys + Solana anchor.";
    // Write a local plan-style receipt for the catalog relay to pick up later
    const planPath = path.join(UPLOAD_DIR, job.id, "publish-plan.json");
    await writeFile(planPath, `${JSON.stringify({
      schemaVersion: "skillhub-skill-publish-plan/v1",
      createdAt: new Date().toISOString(),
      jobId: job.id,
      slug: scan.slug,
      bundleHash: scan.bundleHash,
      merkleLeaf: scan.merkleLeaf,
      memoPreview: result.memo,
      cluster: job.payment.network,
    }, null, 2)}\n`);
    return result;
  }

  const deps = await loadSolanaDeps();
  const secretKey = Uint8Array.from(JSON.parse(await readFile(KEYPAIR_PATH, "utf8")));

  // Upload package to Arweave via Irys
  try {
    const arId = await uploadToIrys(deps, secretKey, packageJson, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "skill-hub" },
      { name: "Type", value: "skill-package/v1" },
      { name: "Skill-Slug", value: scan.slug },
      { name: "Bundle-Hash", value: scan.bundleHash },
      { name: "Merkle-Leaf", value: scan.merkleLeaf },
      { name: "Job-Id", value: job.id },
    ]);
    result.arweave = {
      id: arId,
      url: `https://gateway.irys.xyz/${arId}`,
      arweaveUrl: `https://arweave.net/${arId}`,
    };
  } catch (error) {
    result.arweaveError = String(error?.message || error);
    console.warn(`[publish] arweave upload failed for ${job.id}:`, error.message);
  }

  // Anchor memo on Solana
  try {
    const memo = buildSkillMemo(scan, job, result.arweave?.id);
    const signature = await sendMemo(deps, secretKey, memo);
    result.solana = {
      memoProgram: MEMO_PROGRAM_ID,
      signature,
      explorer: solscanTx(signature),
      memo,
    };
    result.anchored = true;
    result.memo = memo;
  } catch (error) {
    result.solanaError = String(error?.message || error);
    console.warn(`[publish] solana memo failed for ${job.id}:`, error.message);
  }

  const receiptPath = path.join(UPLOAD_DIR, job.id, "publish-receipt.json");
  await writeFile(receiptPath, `${JSON.stringify({
    schemaVersion: "skillhub-skill-publish-receipt/v1",
    publishedAt: new Date().toISOString(),
    jobId: job.id,
    slug: scan.slug,
    bundleHash: scan.bundleHash,
    merkleLeaf: scan.merkleLeaf,
    ...result,
  }, null, 2)}\n`);
  result.receiptPath = path.relative(ROOT, receiptPath);

  return result;
}

function buildSkillMemo(scan, job, arId = "pending") {
  return [
    "skillhub:skill:v1",
    `slug:${scan.slug}`,
    `bundle:${scan.bundleHash}`,
    `leaf:${scan.merkleLeaf}`,
    `ar:${arId || "pending"}`,
    `job:${job.id.slice(0, 8)}`,
    `pay:${(job.payment.signature || "").slice(0, 16)}`,
  ].join("|").slice(0, 550);
}

async function verifyPayment({ signature, expectedMemo, expectedLamports, merchantWallet, payer }) {
  const url = `${RPC_URL}`;
  const tx = await rpc(url, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);

  if (!tx) {
    return { ok: false, error: "Transaction not found on RPC yet. Wait a few seconds and retry." };
  }
  if (tx.meta?.err) {
    return { ok: false, error: "Payment transaction failed on-chain", details: tx.meta.err };
  }

  const accountKeys = tx.transaction?.message?.accountKeys || [];
  const keyStr = (k) => (typeof k === "string" ? k : k?.pubkey || "");
  const keys = accountKeys.map(keyStr);

  // Find SOL transfer to merchant
  let transferred = 0;
  let foundPayer = null;
  const instructions = [
    ...(tx.transaction?.message?.instructions || []),
    ...(tx.meta?.innerInstructions || []).flatMap((ii) => ii.instructions || []),
  ];

  for (const ix of instructions) {
    const programId = ix.programId || keys[ix.programIdIndex] || "";
    // System transfer (parsed)
    if (ix.parsed?.type === "transfer") {
      const info = ix.parsed.info || {};
      if (info.destination === merchantWallet) {
        transferred += Number(info.lamports || 0);
        foundPayer = info.source || foundPayer;
      }
    }
    // Memo
    if (programId === MEMO_PROGRAM_ID || ix.program === "spl-memo") {
      // parsed memo or raw
    }
  }

  // Also check pre/post balances if parsed transfer missing
  if (transferred === 0 && tx.meta?.preBalances && tx.meta?.postBalances) {
    const merchantIndex = keys.indexOf(merchantWallet);
    if (merchantIndex >= 0) {
      const delta = Number(tx.meta.postBalances[merchantIndex]) - Number(tx.meta.preBalances[merchantIndex]);
      if (delta > 0) transferred = delta;
    }
  }

  if (transferred < expectedLamports) {
    return {
      ok: false,
      error: `Insufficient fee: expected ≥ ${expectedLamports} lamports to ${merchantWallet}, saw ${transferred}`,
      details: { transferred, expectedLamports, merchantWallet },
    };
  }

  // Memo check (best-effort — some wallets put memo as separate instruction)
  const memoText = extractMemo(tx, keys);
  if (memoText && !memoText.includes(expectedMemo) && !memoText.includes(expectedMemo.replace("skillhub-publish:", ""))) {
    // Soft fail only if memo present but wrong
    console.warn(`[pay] memo mismatch for ${signature}: got "${memoText}" expected "${expectedMemo}"`);
  }

  if (payer && foundPayer && payer !== foundPayer) {
    return {
      ok: false,
      error: "Payer wallet does not match the payment transaction",
      details: { expected: payer, actual: foundPayer },
    };
  }

  return { ok: true, payer: foundPayer || payer, transferred, memo: memoText };
}

function extractMemo(tx, keys) {
  const instructions = tx.transaction?.message?.instructions || [];
  for (const ix of instructions) {
    const programId = ix.programId || keys[ix.programIdIndex] || "";
    if (programId === MEMO_PROGRAM_ID || ix.program === "spl-memo") {
      if (typeof ix.parsed === "string") return ix.parsed;
      if (ix.parsed?.info?.memo) return ix.parsed.info.memo;
      if (ix.data) {
        try {
          return Buffer.from(ix.data, "base64").toString("utf8");
        } catch {
          return String(ix.data);
        }
      }
    }
  }
  return null;
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

async function loadSolanaDeps() {
  try {
    const [irysUpload, irysSolana, web3] = await Promise.all([
      import("@irys/upload"),
      import("@irys/upload-solana"),
      import("@solana/web3.js"),
    ]);
    return { irysUpload, irysSolana, web3 };
  } catch (error) {
    throw new Error(`Missing publish SDKs: ${error.message}. Run npm install.`);
  }
}

async function uploadToIrys(deps, secretKey, data, tags) {
  const { Uploader } = deps.irysUpload;
  const { Solana } = deps.irysSolana;
  const bs58Key = base58Encode(secretKey);
  let builder = Uploader(Solana).withWallet(bs58Key).withRpc(RPC_URL);
  if (NETWORK === "devnet") builder = builder.devnet();
  const irys = await builder;
  const size = Buffer.byteLength(data);
  const price = await irys.getPrice(size);
  const balance = await irys.getBalance();
  if (balance.isLessThan(price)) {
    const topUp = price.minus(balance).multipliedBy(1.1).integerValue();
    await irys.fund(topUp);
  }
  const receipt = await irys.upload(data, { tags });
  return receipt.id;
}

async function sendMemo(deps, secretKey, memoText) {
  const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = deps.web3;
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = Keypair.fromSecretKey(secretKey);
  const instruction = new TransactionInstruction({
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_PROGRAM_ID),
    data: Buffer.from(memoText, "utf8"),
  });
  const transaction = new Transaction().add(instruction);
  return sendAndConfirmTransaction(connection, transaction, [payer]);
}

async function ingestSkill(job) {
  const slug = job.scan.slug;
  if (slug.includes("..") || path.isAbsolute(slug)) {
    throw new Error("Invalid slug for ingest");
  }
  const dest = path.join(ROOT, "skills", "community", slug);
  await mkdir(dest, { recursive: true });
  for (const file of job.storedFiles || []) {
    const target = path.join(dest, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    const buf = file.encoding === "base64"
      ? Buffer.from(file.content, "base64")
      : Buffer.from(file.content, "utf8");
    await writeFile(target, buf);
  }
  console.log(`[ingest] wrote skills/community/${slug}`);
}

function publicJob(job) {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    submitter: job.submitter,
    scan: {
      ok: job.scan.ok,
      status: job.scan.status,
      slug: job.scan.slug,
      name: job.scan.name,
      description: job.scan.description,
      scannedAt: job.scan.scannedAt,
      bundleHash: job.scan.bundleHash,
      merkleLeaf: job.scan.merkleLeaf,
      files: job.scan.files,
      stats: job.scan.stats,
      findings: job.scan.findings,
      risk: job.scan.risk,
      gate: job.scan.gate,
    },
    payment: {
      network: job.payment.network,
      merchantWallet: job.payment.merchantWallet,
      feeLamports: job.payment.feeLamports,
      feeSol: job.payment.feeLamports / 1e9,
      memo: job.payment.memo,
      signature: job.payment.signature,
      payer: job.payment.payer,
      confirmedAt: job.payment.confirmedAt,
      explorer: job.payment.explorer || null,
    },
    publish: job.publish
      ? {
          packageHash: job.publish.packageHash,
          arweave: job.publish.arweave,
          solana: job.publish.solana,
          anchored: job.publish.anchored,
          memo: job.publish.memo,
          note: job.publish.note,
          error: job.publish.error,
          arweaveError: job.publish.arweaveError,
          solanaError: job.publish.solanaError,
          receiptPath: job.publish.receiptPath,
        }
      : null,
    ingested: Boolean(job.ingested),
  };
}

async function saveJob(job) {
  const dir = path.join(UPLOAD_DIR, job.id);
  await mkdir(dir, { recursive: true });
  // Don't store huge duplicate — strip raw content from main job json for API cache
  const disk = {
    ...job,
    files: undefined,
  };
  await writeFile(path.join(dir, "job.json"), `${JSON.stringify(disk, null, 2)}\n`);
  if (job.storedFiles) {
    await writeFile(path.join(dir, "files.json"), `${JSON.stringify(job.storedFiles, null, 2)}\n`);
    for (const file of job.storedFiles) {
      const target = path.join(dir, "bundle", file.path);
      await mkdir(path.dirname(target), { recursive: true });
      const buf = file.encoding === "base64"
        ? Buffer.from(file.content, "base64")
        : Buffer.from(file.content, "utf8");
      await writeFile(target, buf);
    }
  }
  jobs.set(job.id, job);
}

async function getJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  const jobPath = path.join(UPLOAD_DIR, id, "job.json");
  if (!existsSync(jobPath)) return null;
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const filesPath = path.join(UPLOAD_DIR, id, "files.json");
  if (existsSync(filesPath)) {
    job.storedFiles = JSON.parse(await readFile(filesPath, "utf8"));
  }
  jobs.set(id, job);
  return job;
}

async function loadJobsFromDisk() {
  if (!existsSync(UPLOAD_DIR)) return;
  const entries = await readdir(UPLOAD_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await getJob(entry.name);
    } catch {
      // ignore corrupt jobs
    }
  }
  console.log(`[upload-relay] loaded ${jobs.size} jobs from disk`);
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  // Prefer publish UI, then public root
  const candidates = [
    path.join(STATIC_DIR, rel),
    path.join(PUBLIC, rel),
  ];

  for (const filePath of candidates) {
    if (!filePath.startsWith(PUBLIC) && !filePath.startsWith(STATIC_DIR)) continue;
    if (!existsSync(filePath)) continue;
    const st = await stat(filePath);
    if (st.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      if (existsSync(indexPath)) {
        return sendFile(res, indexPath);
      }
      continue;
    }
    return sendFile(res, filePath);
  }

  // SPA fallback for /publish
  if (pathname.startsWith("/publish") || pathname === "/") {
    const index = path.join(STATIC_DIR, "index.html");
    if (existsSync(index)) return sendFile(res, index);
  }

  sendJson(res, 404, { error: "Not found" });
}

async function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
    ...corsHeaders(),
  });
  res.end(body);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(body);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function solscanTx(signature) {
  const cluster = NETWORK === "mainnet" || NETWORK === "mainnet-beta" ? "" : `?cluster=${NETWORK}`;
  return `https://solscan.io/tx/${signature}${cluster}`;
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
