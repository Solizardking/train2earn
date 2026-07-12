#!/usr/bin/env node

/**
 * Export a GitHub-safe public ledger of on-chain skill submissions.
 *
 * Reads private job dirs under onchain/submissions/ and writes ONLY redacted
 * public metadata — never key material, never raw env, never full unvetted bodies
 * for blocked jobs.
 *
 *   node scripts/export-public-ledger.mjs
 *
 * Outputs:
 *   onchain/public-ledger.json
 *   public/api/submissions.json
 *   public/api/onchain.json
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUBMISSIONS = path.join(ROOT, "onchain", "submissions");
const LEDGER_PATH = path.join(ROOT, "onchain", "public-ledger.json");
const PUBLIC_API = path.join(ROOT, "public", "api");

const SECRET_KEY_RE = /private[_-]?key|secret[_-]?key|secretkey|keypair|mnemonic|seed[_-]?phrase|api[_-]?key|auth[_-]?token|bearer\s|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/i;
const BASE58_LONG_RE = /\b[1-9A-HJ-NP-Za-km-z]{64,}\b/g;

async function main() {
  const entries = [];
  if (existsSync(SUBMISSIONS)) {
    const dirs = await readdir(SUBMISSIONS, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      try {
        const job = await loadJob(path.join(SUBMISSIONS, dir.name));
        if (!job) continue;
        const publicEntry = redactJob(job);
        if (publicEntry) entries.push(publicEntry);
      } catch (error) {
        console.warn(`skip ${dir.name}: ${error.message}`);
      }
    }
  }

  entries.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));

  const plan = await readJsonIfExists(path.join(ROOT, "onchain", "publish-plan.json"));
  const receipt = await readJsonIfExists(path.join(ROOT, "onchain", "publish-receipt.json"));

  const ledger = {
    schemaVersion: "skillhub-public-ledger/v1",
    generatedAt: new Date().toISOString(),
    security: {
      redacted: true,
      policy: [
        "No private keys, keypairs, mnemonics, or API secrets",
        "No SOLANA_KEYPAIR material",
        "Blocked submissions never expose file bodies",
        "Published entries expose hashes + explorer links only (optional public package URLs)",
      ],
    },
    hubs: {
      primary: "https://skills.x402.wtf",
      aliases: [
        "https://skills.x402.wtf",
        "https://skills.onchainai.fund",
        "https://cheshireterminal.ai/skills",
      ],
      publishUi: "https://skills.x402.wtf/publish",
      cheshireStore: "https://cheshireterminal.ai/skills-store",
      repository: "https://github.com/Solizardking/skills",
    },
    catalogAnchor: summarizeCatalogAnchor(plan, receipt),
    count: entries.length,
    submissions: entries,
  };

  await mkdir(path.dirname(LEDGER_PATH), { recursive: true });
  await mkdir(PUBLIC_API, { recursive: true });
  const json = `${JSON.stringify(ledger, null, 2)}\n`;
  await writeFile(LEDGER_PATH, json);
  await writeFile(path.join(PUBLIC_API, "submissions.json"), json);
  await writeFile(
    path.join(PUBLIC_API, "onchain.json"),
    `${JSON.stringify({
      schemaVersion: "skillhub-onchain-summary/v1",
      generatedAt: ledger.generatedAt,
      hubs: ledger.hubs,
      catalogAnchor: ledger.catalogAnchor,
      submissionCount: ledger.count,
      submissionsUrl: "/api/submissions.json",
      registryUrl: "/.well-known/onchain-skill-registry.json",
      publishPlan: plan ? "onchain/publish-plan.json" : null,
      publishReceipt: receipt ? "onchain/publish-receipt.json" : null,
    }, null, 2)}\n`,
  );

  console.log(`Public ledger: ${entries.length} submissions → onchain/public-ledger.json + public/api/submissions.json`);
}

async function loadJob(dir) {
  const jobPath = path.join(dir, "job.json");
  if (!existsSync(jobPath)) return null;
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const filesPath = path.join(dir, "files.json");
  if (existsSync(filesPath)) {
    job.storedFiles = JSON.parse(await readFile(filesPath, "utf8"));
  }
  const receiptPath = path.join(dir, "publish-receipt.json");
  if (existsSync(receiptPath)) {
    job.diskReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
  }
  return job;
}

function redactJob(job) {
  if (!job?.id || !job?.scan) return null;

  // Never surface blocked payloads on the public ledger beyond risk summary
  const status = job.status || "unknown";
  const scan = job.scan;

  if (containsSecretMarker(JSON.stringify(job.scan || {}))) {
    return null;
  }

  const entry = {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status,
    slug: scan.slug,
    name: scan.name,
    description: sanitizeText(scan.description || "", 400),
    risk: {
      level: scan.risk?.level || "unknown",
      score: scan.risk?.score ?? 0,
      totalFindings: scan.risk?.total ?? (scan.findings?.length || 0),
      bySeverity: scan.risk?.bySeverity || null,
    },
    verification: {
      bundleHash: scan.bundleHash || null,
      merkleLeaf: scan.merkleLeaf || null,
      fileCount: scan.stats?.fileCount ?? scan.files?.length ?? 0,
      totalBytes: scan.stats?.totalBytes ?? null,
    },
    submitter: {
      // Public wallets only (base58 pubkeys are not secrets)
      wallet: isPubkey(job.submitter?.wallet) ? job.submitter.wallet : null,
      label: sanitizeText(job.submitter?.label || "", 80) || null,
    },
    payment: null,
    publish: null,
    public: true,
  };

  if (job.payment?.signature || job.payment?.confirmedAt) {
    entry.payment = {
      network: job.payment.network || null,
      feeLamports: job.payment.feeLamports ?? null,
      // merchant wallet is a public address
      merchantWallet: isPubkey(job.payment.merchantWallet) ? job.payment.merchantWallet : null,
      payer: isPubkey(job.payment.payer) ? job.payment.payer : null,
      signature: job.payment.signature || null,
      explorer: job.payment.explorer || null,
      confirmedAt: job.payment.confirmedAt || null,
      // memo is intentional public correlation id
      memo: job.payment.memo || null,
    };
  }

  const pub = job.publish || job.diskReceipt || null;
  if (pub && (status === "published" || status === "paid_pending_anchor" || status === "paid")) {
    entry.publish = {
      packageHash: pub.packageHash || null,
      anchored: Boolean(pub.anchored || pub.solana?.signature),
      arweave: pub.arweave
        ? {
            id: pub.arweave.id,
            url: pub.arweave.url || pub.arweave.arweaveUrl || null,
          }
        : null,
      solana: pub.solana
        ? {
            signature: pub.solana.signature,
            explorer: pub.solana.explorer,
            // memo is public on-chain text
            memo: pub.solana.memo || pub.memo || null,
          }
        : null,
      note: pub.note && !SECRET_KEY_RE.test(pub.note) ? sanitizeText(pub.note, 240) : null,
    };
  }

  // Finding titles only (no file excerpts that might leak paths to secrets)
  if (Array.isArray(scan.findings) && scan.findings.length) {
    entry.findingsSummary = scan.findings.slice(0, 20).map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      category: f.category,
      message: sanitizeText(f.message || "", 160),
      // omit excerpt + file path for safety on public github
    }));
  }

  entry.integrity = {
    entryHash: `sha256-${createHash("sha256").update(JSON.stringify({
      id: entry.id,
      slug: entry.slug,
      status: entry.status,
      bundleHash: entry.verification.bundleHash,
      paymentSig: entry.payment?.signature || null,
      anchorSig: entry.publish?.solana?.signature || null,
    })).digest("hex")}`,
  };

  return entry;
}

function summarizeCatalogAnchor(plan, receipt) {
  return {
    plan: plan
      ? {
          cluster: plan.cluster,
          merkleRoot: plan.merkleRoot,
          catalogHash: plan.catalogHash,
          totalSkills: plan.totalSkills,
          createdAt: plan.createdAt,
        }
      : null,
    receipt: receipt
      ? {
          cluster: receipt.cluster,
          merkleRoot: receipt.merkleRoot,
          catalogHash: receipt.catalogHash,
          totalSkills: receipt.totalSkills,
          publishedAt: receipt.publishedAt,
          solana: receipt.solana
            ? {
                signature: receipt.solana.signature,
                explorer: receipt.solana.explorer,
              }
            : null,
          arweave: Array.isArray(receipt.arweave)
            ? receipt.arweave.map((a) => ({ label: a.label, id: a.id, url: a.arweaveUrl || a.url }))
            : null,
        }
      : null,
  };
}

function containsSecretMarker(text) {
  return SECRET_KEY_RE.test(text);
}

function sanitizeText(value, max = 400) {
  let s = String(value || "")
    .replace(BASE58_LONG_RE, "[redacted-long-key]")
    .replace(SECRET_KEY_RE, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

function isPubkey(value) {
  if (typeof value !== "string") return false;
  // Solana base58 pubkeys are typically 32–44 chars
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

async function readJsonIfExists(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
