#!/usr/bin/env node

/**
 * Skill Hub relay — rebuild catalog when skills change, optionally commit,
 * push, and re-anchor on-chain.
 *
 * Modes:
 *   node scripts/skill-relay.mjs              # one-shot rebuild + verify
 *   node scripts/skill-relay.mjs --watch      # poll skills/ and rebuild on change
 *   node scripts/skill-relay.mjs --commit     # git add/commit generated artifacts
 *   node scripts/skill-relay.mjs --push       # git push after commit
 *   node scripts/skill-relay.mjs --onchain    # dry-run on-chain plan after build
 *   node scripts/skill-relay.mjs --onchain --execute [--devnet]
 *
 * Env:
 *   SKILLHUB_RELAY_INTERVAL_MS  poll interval in watch mode (default 2000)
 *   SKILLHUB_RELAY_COMMIT_MSG   commit message template (default auto)
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.join(ROOT, "skills");
const STATE_PATH = path.join(ROOT, "onchain", "relay-state.json");

const args = process.argv.slice(2);
const WATCH = args.includes("--watch");
const COMMIT = args.includes("--commit");
const PUSH = args.includes("--push");
const ONCHAIN = args.includes("--onchain");
const EXECUTE = args.includes("--execute");
const DEVNET = args.includes("--devnet");
const INTERVAL_MS = Number(process.env.SKILLHUB_RELAY_INTERVAL_MS || 2000);

const GENERATED_PATHS = [
  "catalog.json",
  "skills.sh.json",
  "HUB.md",
  "README.md",
  "assets/hub-banner.svg",
  "assets/chain-divider.svg",
  "public",
  "onchain/publish-plan.json",
  "onchain/publish-receipt.json",
  "onchain/relay-state.json",
];

async function main() {
  if (WATCH) {
    console.log(`Skill relay watching ${path.relative(ROOT, SKILLS_ROOT)} (every ${INTERVAL_MS}ms)`);
    let lastFingerprint = await fingerprintSkills();
    // Always run once at start so catalog is current.
    await runPipeline({ reason: "startup" });
    lastFingerprint = await fingerprintSkills();

    for (;;) {
      await sleep(INTERVAL_MS);
      const next = await fingerprintSkills();
      if (next === lastFingerprint) continue;
      console.log(`\n[${ts()}] skills/ changed — rebuilding`);
      await runPipeline({ reason: "watch-change" });
      lastFingerprint = await fingerprintSkills();
    }
  }

  await runPipeline({ reason: "one-shot" });
}

async function runPipeline({ reason }) {
  const started = Date.now();
  console.log(`[${ts()}] relay start (${reason})`);

  await run("node", ["scripts/build-catalog.mjs"]);
  await run("node", ["scripts/smoke-test-skills.mjs"]);

  // Sample install of a few NVIDIA skills into a temp root to prove installer paths.
  const sampleTarget = path.join(ROOT, ".relay-install-check");
  await run("node", [
    "bin/skills.mjs",
    "install",
    "nvidia/jetson-quick-start",
    "nvidia/cudaq-guide",
    "nvidia/deepstream-dev",
    "--force",
    "--target",
    sampleTarget,
  ]);

  if (ONCHAIN) {
    const onchainArgs = ["scripts/publish-onchain.mjs"];
    if (EXECUTE) onchainArgs.push("--execute");
    if (DEVNET) onchainArgs.push("--devnet");
    await run("node", onchainArgs);
  }

  const catalog = JSON.parse(await readFile(path.join(ROOT, "catalog.json"), "utf8"));
  const nvidiaCount = catalog.filter((s) => s.slug.startsWith("nvidia/")).length;
  const registry = JSON.parse(
    await readFile(path.join(ROOT, "public", ".well-known", "onchain-skill-registry.json"), "utf8"),
  );

  const state = {
    schemaVersion: "skillhub-relay-state/v1",
    updatedAt: new Date().toISOString(),
    reason,
    totalSkills: catalog.length,
    nvidiaSkills: nvidiaCount,
    merkleRoot: registry.merkleRoot,
    catalogHash: registry.catalogHash,
    durationMs: Date.now() - started,
  };
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`[${ts()}] catalog: ${state.totalSkills} skills (${state.nvidiaSkills} nvidia)`);
  console.log(`[${ts()}] merkle : ${state.merkleRoot}`);
  console.log(`[${ts()}] state  : onchain/relay-state.json`);

  if (COMMIT) {
    await gitCommit(state);
  }
  if (PUSH) {
    await run("git", ["push"]);
  }

  console.log(`[${ts()}] relay done in ${state.durationMs}ms`);
}

async function gitCommit(state) {
  const status = await capture("git", ["status", "--porcelain", ...GENERATED_PATHS, "scripts", ".github"]);
  if (!status.trim()) {
    console.log(`[${ts()}] git: nothing to commit`);
    return;
  }

  await run("git", ["add", ...GENERATED_PATHS, "scripts/build-catalog.mjs", "scripts/skill-relay.mjs", "package.json", ".github/workflows/skill-relay.yml"].filter((p) => existsSync(path.join(ROOT, p))));

  const msg = process.env.SKILLHUB_RELAY_COMMIT_MSG
    || `chore(relay): rebuild catalog (${state.totalSkills} skills, ${state.nvidiaSkills} nvidia)`;

  // Avoid failing when hooks rewrite or when there's nothing staged after filter.
  const staged = await capture("git", ["diff", "--cached", "--name-only"]);
  if (!staged.trim()) {
    console.log(`[${ts()}] git: nothing staged after add`);
    return;
  }

  await run("git", ["commit", "-m", msg]);
  console.log(`[${ts()}] git: committed — ${msg}`);
}

async function fingerprintSkills() {
  const files = [];
  await walk(SKILLS_ROOT, files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.mtimeMs));
    hash.update("\0");
    hash.update(String(file.size));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    // Fingerprint skill sources (md/json/yaml/scripts) — skip large binaries.
    const ext = path.extname(entry.name).toLowerCase();
    if (![".md", ".json", ".yaml", ".yml", ".py", ".sh", ".ts", ".js", ".toml", ".txt"].includes(ext)) continue;
    const info = await stat(full);
    out.push({
      path: path.relative(SKILLS_ROOT, full),
      mtimeMs: info.mtimeMs,
      size: info.size,
    });
  }
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${command} ${commandArgs.join(" ")}`);
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function capture(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${command} failed: ${err || out || code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ts() {
  return new Date().toISOString();
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
