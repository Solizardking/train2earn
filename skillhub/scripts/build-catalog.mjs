#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.join(ROOT, "skills");
const CHECK = process.argv.includes("--check");
const SITE_URL = process.env.SKILLHUB_SITE_URL || "https://skills.x402.wtf";
const SITE_ALIASES = [
  "https://skills.x402.wtf",
  "https://skills.onchainai.fund",
  "https://cheshireterminal.ai/skills",
];
const DEFAULT_PAYMENT_NETWORK = process.env.SKILLHUB_PAYMENT_NETWORK || "mainnet";
const DEFAULT_MERCHANT_NAME = process.env.SKILLHUB_MERCHANT_NAME || "Skill Hub";
const DEFAULT_MERCHANT_WALLET = process.env.SKILLHUB_MERCHANT_WALLET || "";
const DEFAULT_OFFCHAIN_CHECKOUT_URL = process.env.SKILLHUB_OFFCHAIN_CHECKOUT_URL || "";

const CATEGORY_ORDER = [
  "Solana / Blockchain", // featured first — primary Skill Hub surface
  "Dev Tools / Agents",
  "Google / Ads",
  "Google / Analytics",
  "Google / Cloud",
  "NVIDIA / Accelerated Computing",
  "Local / Web Services",
  "Media / Devices",
  "Productivity / Messaging",
  "Utilities",
];

const IGNORED_TOP_LEVEL_DIRS = new Set([
  ".git",
  ".vercel",
  "assets",
  "bin",
  "node_modules",
  "onchain",
  "public",
  "scripts",
]);

const IGNORED_NESTED_DIRS = new Set([
  ".git",
  ".lake",
  ".vercel",
  "node_modules",
  "target",
]);

const PUBLIC_RESOURCE_DIRS = ["references", "scripts", "assets", "agents"];
const PUBLIC_ROOT_RESOURCE_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml"]);
const PUBLIC_COPY_EXCLUDES = new Set([".DS_Store", ".git", "__pycache__", "node_modules"]);
const PUBLIC_COPY_EXCLUDED_EXTENSIONS = new Set([".pyc", ".pyo"]);
const CATEGORY_OVERRIDES = new Map([
  ["ask-mcp", "Solana / Blockchain"],
  ["compressed-pda", "Solana / Blockchain"],
  ["compressed-token", "Solana / Blockchain"],
  ["solana-redpill-verifier", "Solana / Blockchain"],
  ["solana-rent-free-dev", "Solana / Blockchain"],
  ["testing", "Solana / Blockchain"],
  ["zk", "Solana / Blockchain"],
  ["zkrouter", "Solana / Blockchain"],
  ["solana-common-errors", "Solana / Blockchain"],
  ["solana-dev", "Solana / Blockchain"],
]);

async function main() {
  const existingCategories = await readExistingCategories();
  const skills = await readSkills(existingCategories);
  const outputs = await buildOutputs(skills);

  if (CHECK) {
    await checkOutputs(outputs);
    return;
  }

  await writeOutputs(outputs);
  console.log(`Generated ${skills.length} skills in catalog.json, README.md, and public/.`);
}

async function readExistingCategories() {
  const catalogPath = path.join(ROOT, "catalog.json");
  try {
    const raw = await readFile(catalogPath, "utf8");
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return new Map();
    return new Map(entries.map((entry) => [entry.slug, entry.category]).filter(([slug, category]) => slug && category));
  } catch {
    return new Map();
  }
}

async function readSkills(existingCategories) {
  const skills = [];

  await collectSkills(SKILLS_ROOT, [], existingCategories, skills);

  skills.sort((a, b) => {
    const categoryDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDiff !== 0) return categoryDiff;
    return a.slug.localeCompare(b.slug);
  });

  return skills;
}

async function collectSkills(directory, segments, existingCategories, skills) {
  const skillPath = path.join(directory, "SKILL.md");
  const ownsSkill = segments.length > 0 && existsSync(skillPath);

  if (ownsSkill) {
    const content = await readFile(skillPath, "utf8");
    const frontmatter = parseFrontmatter(content);
    const slug = segments.join("/");
    const name = normalizeText(frontmatter.name) || slug;
    const description = normalizeText(frontmatter.description) || fallbackDescription(content);
    const category = categorize({ slug, name, description }, existingCategories);

    skills.push({
      slug,
      name,
      description,
      category,
      skillPath,
      content,
    });

    // A skill directory is a leaf for catalog purposes: anything nested beneath it
    // (references/, scripts/, assets/, bundled examples, etc.) belongs to this skill's
    // own bundle, not to further independent catalog entries.
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (segments.length === 0 && IGNORED_TOP_LEVEL_DIRS.has(entry.name)) continue;
    if (segments.length > 0 && IGNORED_NESTED_DIRS.has(entry.name)) continue;

    await collectSkills(path.join(directory, entry.name), [...segments, entry.name], existingCategories, skills);
  }
}

function parseFrontmatter(content) {
  if (!content.startsWith("---")) return {};

  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};

  const yaml = content.slice(3, end).replace(/^\r?\n/, "");
  const fields = {};
  const lines = yaml.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(lines[i]);
    if (!match) continue;

    const [, key, rawValue = ""] = match;
    const blockStyle = rawValue.trim();
    if (/^[>|][+-]?$/.test(blockStyle)) {
      const folded = blockStyle.startsWith(">");
      const block = [];
      while (i + 1 < lines.length && /^(?:\s{2,}|\t)/.test(lines[i + 1])) {
        i += 1;
        block.push(lines[i].trim());
      }
      fields[key] = block.join(folded ? " " : "\n");
      continue;
    }

    let scalar = parseScalar(rawValue);
    if (rawValue.trim()) {
      const continuation = [];
      while (i + 1 < lines.length && /^(?:\s{2,}|\t)/.test(lines[i + 1])) {
        i += 1;
        continuation.push(lines[i].trim());
      }
      if (continuation.length > 0) {
        scalar = [scalar, ...continuation].join(" ");
      }
    }

    fields[key] = scalar;
  }

  return fields;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const quote = trimmed[0];
  if ((quote === `"` || quote === `'`) && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    return quote === `"` ? inner.replace(/\\"/g, `"`) : inner.replace(/''/g, "'");
  }

  return trimmed;
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function fallbackDescription(content) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  return heading ? normalizeText(heading) : "Agent skill.";
}

function categorize(skill, existingCategories) {
  if (CATEGORY_OVERRIDES.has(skill.slug)) {
    return CATEGORY_OVERRIDES.get(skill.slug);
  }

  if (existingCategories.has(skill.slug)) {
    return existingCategories.get(skill.slug);
  }

  if (skill.slug.startsWith("google/ads/")) {
    return "Google / Ads";
  }

  if (skill.slug.startsWith("google/analytics/")) {
    return "Google / Analytics";
  }

  if (skill.slug.startsWith("google/cloud/")) {
    return "Google / Cloud";
  }

  if (skill.slug.startsWith("nvidia/")) {
    return "NVIDIA / Accelerated Computing";
  }

  const text = `${skill.slug} ${skill.name} ${skill.description}`.toLowerCase();

  if (/\b(solana|anchor|pinocchio|codama|litesvm|mollusk|surfpool|magicblock|wallet|token|crypto|blockchain|dflow|kalshi|phantom|dex|pump|clawd|vulcan|imperial|phoenix|perp|tee|zk|gateway|swarm|light protocol|zkcompression|compressed)\b/.test(text)) {
    return "Solana / Blockchain";
  }

  if (/\b(audio|image|images|pdf|video|camera|frames|gif|tts|speech|transcribe|whisper|hue|sonos|spotify|canvas)\b/.test(text)) {
    return "Media / Devices";
  }

  if (/\b(notes|reminders|message|messaging|email|gmail|calendar|slack|discord|whatsapp|imessage|notion|obsidian|trello|things|workspace|contacts)\b/.test(text)) {
    return "Productivity / Messaging";
  }

  if (/\b(food|order|places|weather|local|web service|restaurant|forecast)\b/.test(text)) {
    return "Local / Web Services";
  }

  if (/\b(github|agent|agents|mcp|cli|tmux|session|skill|code|codex|claude|oracle|clawdhub|mcporter)\b/.test(text)) {
    return "Dev Tools / Agents";
  }

  return "Utilities";
}

async function buildOutputs(skills) {
  const publicFiles = await renderPublic(skills);
  const catalog = skills.map(({ slug, name, description, category }) => ({ slug, name, description, category }));
  const outputs = new Map();

  outputs.set("catalog.json", `${JSON.stringify(catalog, null, 2)}\n`);
  outputs.set("skills.sh.json", renderSkillsShConfig(catalog));
  outputs.set("HUB.md", renderHub(catalog));
  outputs.set("README.md", renderReadme(catalog));
  outputs.set("assets/hub-banner.svg", renderHeroBanner(catalog));
  outputs.set("assets/chain-divider.svg", renderChainDivider());
  outputs.set(path.join("public", "assets", "hub-banner.svg"), renderHeroBanner(catalog));
  outputs.set(path.join("public", "assets", "chain-divider.svg"), renderChainDivider());

  for (const [file, content] of publicFiles) {
    outputs.set(path.join("public", file), content);
  }

  return outputs;
}

async function renderPublic(skills) {
  const files = new Map();
  const catalog = skills.map(({ slug, name, description, category }) => ({ slug, name, description, category }));
  const catalogJson = `${JSON.stringify(catalog, null, 2)}\n`;
  const monetization = renderMonetizationConfig(catalog);

  files.set("catalog.json", catalogJson);
  files.set("api/skills.json", catalogJson);
  files.set("api/skills/index.json", catalogJson);
  files.set("api/monetization.json", `${JSON.stringify(monetization, null, 2)}\n`);
  files.set("integrations/commerce-kit-payment-button.tsx", renderCommerceKitPaymentButton());
  files.set("CNAME", `${new URL(SITE_URL).hostname}\n`);
  files.set("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  files.set("sitemap.xml", renderSitemap(catalog));
  files.set(".nojekyll", "");
  files.set("favicon.svg", renderFavicon());
  files.set("index.html", renderIndexHtml(catalog));
  files.set("skills/index.html", renderIndexHtml(catalog));
  await addScannerDashboard(files);
  await addHubSurfacePages(files);
  await addPublicLedgerArtifacts(files);

  const verifications = [];

  for (const skill of skills) {
    const metadata = {
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      skill: `/api/skills/${skill.slug}/SKILL.md`,
    };
    files.set(`api/skills/${skill.slug}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
    files.set(`api/skills/${skill.slug}/SKILL.md`, skill.content);
    await addPublicResources(files, skill);

    const verification = renderSkillVerification(skill, getSkillBundleFiles(files, skill.slug));
    files.set(`api/skills/${skill.slug}/verification.json`, `${JSON.stringify(verification, null, 2)}\n`);
    verifications.push({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      bundleHash: verification.bundleHash,
      merkleLeaf: verification.merkleLeaf,
      fileCount: verification.files.length,
      metadata: `/api/skills/${skill.slug}/metadata.json`,
      verification: `/api/skills/${skill.slug}/verification.json`,
    });
  }

  const registry = renderOnchainRegistry(catalog, verifications);
  files.set("api/verification.json", `${JSON.stringify(registry, null, 2)}\n`);
  files.set(".well-known/onchain-skill-registry.json", `${JSON.stringify(registry, null, 2)}\n`);
  files.set("api/site.json", `${JSON.stringify(renderSiteManifest(catalog, registry), null, 2)}\n`);
  files.set(".well-known/skills-hub.json", `${JSON.stringify(renderSiteManifest(catalog, registry), null, 2)}\n`);

  return files;
}

async function addScannerDashboard(files) {
  const scannerPublicDir = path.join(ROOT, "scanner", "public");
  const scannerFiles = ["index.html", "hub-graph.svg", "scan-data.js"];

  for (const file of scannerFiles) {
    const absolutePath = path.join(scannerPublicDir, file);
    if (!existsSync(absolutePath)) continue;
    files.set(`scanner/${file}`, await readFile(absolutePath));
  }
}

/** Durable hub pages (survive full public/ wipe). Prefer site/ then existing public/. */
async function addHubSurfacePages(files) {
  const pages = [
    ["publish/index.html", ["site/publish/index.html", "public/publish/index.html"]],
    ["submissions/index.html", ["site/submissions/index.html", "public/submissions/index.html"]],
  ];
  for (const [outPath, candidates] of pages) {
    for (const rel of candidates) {
      const absolutePath = path.join(ROOT, rel);
      if (!existsSync(absolutePath)) continue;
      let html = await readFile(absolutePath, "utf8");
      html = html
        .replaceAll("https://skills.onchainai.fund", SITE_URL)
        .replaceAll("skills.onchainai.fund", new URL(SITE_URL).hostname);
      files.set(outPath, html);
      break;
    }
  }
}

async function addPublicLedgerArtifacts(files) {
  const ledgerPath = path.join(ROOT, "onchain", "public-ledger.json");
  if (existsSync(ledgerPath)) {
    const raw = await readFile(ledgerPath, "utf8");
    files.set("api/submissions.json", raw);
    try {
      const ledger = JSON.parse(raw);
      files.set(
        "api/onchain.json",
        `${JSON.stringify({
          schemaVersion: "skillhub-onchain-summary/v1",
          generatedAt: new Date().toISOString(),
          hubs: ledger.hubs || { primary: SITE_URL, aliases: SITE_ALIASES },
          catalogAnchor: ledger.catalogAnchor || null,
          submissionCount: ledger.count || 0,
          submissionsUrl: "/api/submissions.json",
          registryUrl: "/.well-known/onchain-skill-registry.json",
        }, null, 2)}\n`,
      );
    } catch {
      // ignore malformed ledger
    }
  } else {
    files.set(
      "api/submissions.json",
      `${JSON.stringify({
        schemaVersion: "skillhub-public-ledger/v1",
        generatedAt: new Date().toISOString(),
        security: { redacted: true, policy: ["No private keys or secrets"] },
        hubs: { primary: SITE_URL, aliases: SITE_ALIASES },
        count: 0,
        submissions: [],
      }, null, 2)}\n`,
    );
  }
}

async function addPublicResources(files, skill) {
  await addPublicRootResources(files, skill);

  for (const resourceDir of PUBLIC_RESOURCE_DIRS) {
    const absoluteDir = path.join(SKILLS_ROOT, skill.slug, resourceDir);
    if (!existsSync(absoluteDir)) continue;
    await addPublicResourceDir(files, absoluteDir, `api/skills/${skill.slug}/${resourceDir}`);
  }

  await addSkillFrontend(files, skill);
}

// Skills may ship a hand-authored landing page at skills/<slug>/frontend/index.html.
// It is copied verbatim to public/skills/<slug>/index.html so it survives the
// full public/ rebuild in writeOutputs() instead of only living in the working tree.
async function addSkillFrontend(files, skill) {
  const frontendEntry = path.join(SKILLS_ROOT, skill.slug, "frontend", "index.html");
  if (!existsSync(frontendEntry)) return;
  files.set(`skills/${skill.slug}/index.html`, await readFile(frontendEntry));
}

async function addPublicRootResources(files, skill) {
  const skillDir = path.join(SKILLS_ROOT, skill.slug);
  const entries = await readdir(skillDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === "SKILL.md") continue;
    if (entry.name === "metadata.json" || entry.name === "verification.json") continue;
    if (entry.name.startsWith(".") || PUBLIC_COPY_EXCLUDES.has(entry.name)) continue;
    if (!PUBLIC_ROOT_RESOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    files.set(`api/skills/${skill.slug}/${entry.name}`, await readFile(path.join(skillDir, entry.name)));
  }
}

async function addPublicResourceDir(files, absoluteDir, publicDir) {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".") || PUBLIC_COPY_EXCLUDES.has(entry.name)) continue;

    const absolutePath = path.join(absoluteDir, entry.name);
    const publicPath = `${publicDir}/${entry.name}`;

    if (entry.isDirectory()) {
      await addPublicResourceDir(files, absolutePath, publicPath);
    } else if (entry.isFile() && !PUBLIC_COPY_EXCLUDED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.set(publicPath, await readFile(absolutePath));
    }
  }
}

const CATEGORY_META = {
  "Dev Tools / Agents": { emoji: "🛠️", tagline: "Build, orchestrate, and ship with agent tooling", anchor: "️-dev-tools--agents" },
  "Google / Ads": { emoji: "📣", tagline: "Google Ads APIs, campaigns, and reporting", anchor: "-google--ads" },
  "Google / Analytics": { emoji: "📈", tagline: "GA4 data APIs and measurement", anchor: "-google--analytics" },
  "Google / Cloud": { emoji: "☁️", tagline: "GCP, GKE, BigQuery, Vertex, and friends", anchor: "️-google--cloud" },
  "NVIDIA / Accelerated Computing": { emoji: "🟩", tagline: "CUDA, Jetson, NeMo, DeepStream, cuOpt, TAO, and GPU stacks", anchor: "-nvidia--accelerated-computing" },
  "Local / Web Services": { emoji: "📍", tagline: "Weather, places, food, and everyday web services", anchor: "-local--web-services" },
  "Media / Devices": { emoji: "🎬", tagline: "Audio, video, images, TTS, cameras, and gadgets", anchor: "-media--devices" },
  "Productivity / Messaging": { emoji: "💬", tagline: "Notes, tasks, chat, and mail on autopilot", anchor: "-productivity--messaging" },
  "Solana / Blockchain": { emoji: "🟣", tagline: "The deep end: DeFi, perps, tokens, ZK, and on-chain agents", anchor: "-solana--blockchain" },
  "Utilities": { emoji: "🧰", tagline: "Handy one-off power tools", anchor: "-utilities" },
};

function categoryMeta(category) {
  return CATEGORY_META[category] || { emoji: "✨", tagline: "More playbooks", anchor: category.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
}

function meterBar(count, max, width = 18) {
  const filled = Math.max(1, Math.round((count / max) * width));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function renderReadme(catalog) {
  const byCategory = groupByCategory(catalog);
  const maxCount = Math.max(...byCategory.map(([, skills]) => skills.length));
  const bySourceFamily = groupBySourceFamily(catalog);
  const googleCount = catalog.filter((skill) => skill.slug.startsWith("google/")).length;
  const nvidiaCount = catalog.filter((skill) => skill.slug.startsWith("nvidia/")).length;
  const featuredRuns = [
    // Premiere offerings — lead the hub with these families.
    ["🎯 Engineering mode", "ship software the Matt Pocock way: TDD, triage, implement, architecture, specs, tickets", catalog.filter((skill) => skill.slug.startsWith("engineering/"))],
    ["🧭 Agent orchestration mode", "goal loops, handoffs, subagents, deep SWE runs, self-scheduling", catalog.filter((skill) => skill.slug.startsWith("agent-orchestration/"))],
    ["✍️ Productivity mode", "grill, teach, handoff, and write great skills", catalog.filter((skill) => skill.slug.startsWith("productivity/"))],
    ["🧠 Thinking & docs mode", "brain-to-docs, ADRs, prompts, level-up, concise teaching", catalog.filter((skill) => skill.slug.startsWith("thinking-and-docs/"))],
    ["🎨 Design & motion mode", "Apple HIG, Emil design-eng, animation vocabulary, review animations", catalog.filter((skill) => ["animation-vocabulary", "apple-design", "emil-design-eng", "review-animations"].includes(skill.slug))],
    ["🔬 Research & web mode", "deep research, browser harness, transcripts, shopping, web search", catalog.filter((skill) => skill.slug.startsWith("research-and-web/"))],
    ["📦 Skill authoring mode", "write, distribute, and push agent skills across every client", catalog.filter((skill) => skill.slug.startsWith("skill-authoring/"))],
    ["⚙️ Ops & setup mode", "readonly DB roles, cyber audit, Safe Browsing, custom models, setup help", catalog.filter((skill) => skill.slug.startsWith("ops-and-setup/"))],
    ["🧪 Misc / in-progress / personal", "guardrails, shoehorn, pre-commit, deep modules, vault, article edit, drafts", catalog.filter((skill) => skill.slug.startsWith("misc/") || skill.slug.startsWith("in-progress/") || skill.slug.startsWith("personal/") || skill.slug.startsWith("deprecated/"))],
    // Vendor + trading loadouts.
    ["🟩 NVIDIA mode", "CUDA, Jetson, NeMo, DeepStream, cuOpt, TAO, Holoscan, Earth-2, Dynamo", catalog.filter((skill) => skill.slug.startsWith("nvidia/"))],
    ["🌞 Helius mode", "Helius infra: Sender, DAS, LaserStream + Jupiter, DFlow, OKX, Phantom, SVM internals", catalog.filter((skill) => skill.slug.startsWith("helius-skills/"))],
    ["🎰 Pump.fun mode", "launch → curve → fees → security, the whole token lifecycle", catalog.filter((skill) => skill.slug === "pumpfun" || skill.slug.startsWith("pump-") || skill.slug.startsWith("pumpfun-"))],
    ["🌋 Vulcan / Phoenix mode", "perps trading: TA, grids, TWAP, TP/SL, risk", catalog.filter((skill) => skill.slug === "vulcan" || skill.slug.startsWith("vulcan-"))],
    ["👑 Imperial mode", "the imperial trading deck: execution, margin, portfolio intel", catalog.filter((skill) => skill.slug === "imperial" || skill.slug.startsWith("imperial-"))],
    ["🎲 DFlow / Kalshi mode", "prediction markets: scan, trade, portfolio, KYC", catalog.filter((skill) => skill.slug.startsWith("dflow-"))],
    ["🗜️ ZK compression mode", "Light Protocol: compressed tokens + PDAs, ~400x cheaper", catalog.filter((skill) => ["ask-mcp", "compressed-pda", "compressed-token", "zk", "zkrouter", "solana-rent-free-dev", "solana-redpill-verifier"].includes(skill.slug))],
  ];

  const lines = [
    '<div align="center">',
    "",
    '<img src="./assets/hub-banner.svg" alt="Skill Hub — an animated constellation of agent skills" width="100%" />',
    "",
    `[![skills.sh](https://skills.sh/b/Solizardking/skills)](https://skills.sh/Solizardking/skills)`,
    `![Skills](https://img.shields.io/badge/skills-${catalog.length}-8A2BE2?style=flat-square) ![Categories](https://img.shields.io/badge/categories-${byCategory.length}-00C2FF?style=flat-square) ![Google](https://img.shields.io/badge/google_integration-${googleCount}_skills-4285F4?style=flat-square) ![NVIDIA](https://img.shields.io/badge/nvidia_integration-${nvidiaCount}_skills-76B900?style=flat-square) ![Verified](https://img.shields.io/badge/merkle-verified-14F195?style=flat-square) ![Arweave](https://img.shields.io/badge/arweave-permanent-222222?style=flat-square) ![Solana](https://img.shields.io/badge/solana-anchored-9945FF?style=flat-square)`,
    "",
    `**${catalog.length} installable agent skills** — including a **${googleCount}-skill Google integration** and a **${nvidiaCount}-skill NVIDIA stack** (CUDA, Jetson, NeMo, DeepStream, cuOpt, TAO, Holoscan, Earth-2). Every one is a \`SKILL.md\` playbook your agent can pull off the shelf —`,
    "hashed, Merkle-rooted, and ready to be pinned to Arweave and anchored on Solana.",
    "",
    "*Pick a cabinet. Pull the lever. The right playbook lights up.* 🕹️",
    "",
    "</div>",
    "",
    "---",
    "",
    "## 🗺️ Choose Your Quest",
    "",
    `${numberWord(byCategory.length)} zones. Every skill lives in exactly one. Click a zone to jump to its catalog.`,
    "",
    "| Zone | Skills | Power level | What lives here |",
    "|---|---:|---|---|",
  ];

  for (const [category, skills] of byCategory) {
    const meta = categoryMeta(category);
    lines.push(`| [${meta.emoji} **${category}**](#${meta.anchor}) | ${skills.length} | \`${meterBar(skills.length, maxCount)}\` | ${meta.tagline} |`);
  }

  lines.push(
    "",
    "## 🧭 Codebase Map",
    "",
    "The hub is a source catalog plus generated distribution surfaces. Canonical skills are discovered from repo-local `SKILL.md` files under `skills/`; generated mirrors live under `public/` and rebuild from source.",
    "",
    "| Layer | What it contains | Main paths |",
    "|---|---|---|",
    `| Skill sources | ${catalog.length} canonical skills. Each slug is the directory path (relative to \`skills/\`) that owns a \`SKILL.md\`. | \`skills/*/SKILL.md\`, \`skills/google/**/SKILL.md\`, \`skills/nvidia/*/SKILL.md\`, \`skills/anthropic-skills/*/SKILL.md\`, plus optional \`references/\`, \`scripts/\`, \`assets/\`, and \`agents/\` folders |`,
    "| Catalog builder | The single source of generated truth for README, Hub docs, catalog JSON, public API, static UI, bundle hashes, and Merkle registry. | [`scripts/build-catalog.mjs`](./scripts/build-catalog.mjs), [`catalog.json`](./catalog.json), [`skills.sh.json`](./skills.sh.json), [`HUB.md`](./HUB.md) |",
    "| Installer CLI | Lists and installs skills into agent skill roots without external dependencies. | [`bin/skills.mjs`](./bin/skills.mjs), [`package.json`](./package.json) |",
    "| Static site and API | Browser catalog, per-skill metadata, mirrored `SKILL.md` files, copied public resources, CORS-ready JSON endpoints, and generated payment config. | [`public/index.html`](./public/index.html), [`public/api/skills.json`](./public/api/skills.json), `public/api/skills/**`, [`public/api/monetization.json`](./public/api/monetization.json) |",
    "| Verification and on-chain flow | Per-skill bundle hashes, Merkle leaves, registry manifests, Arweave upload planning, and Solana memo anchoring. | [`public/.well-known/onchain-skill-registry.json`](./public/.well-known/onchain-skill-registry.json), [`ONCHAIN.md`](./ONCHAIN.md), [`scripts/publish-onchain.mjs`](./scripts/publish-onchain.mjs), [`onchain/`](./onchain/) |",
    "| Skill relay | Watches new/changed skills, rebuilds the catalog, commits to GitHub, deploys the hub site, and optionally re-anchors on-chain. | [`scripts/skill-relay.mjs`](./scripts/skill-relay.mjs), [`.github/workflows/skill-relay.yml`](./.github/workflows/skill-relay.yml) |",
    "| Scanner | Local integrity/risk scanner plus a live, interactive verification dashboard: real-time verification/risk/category charts, keyboard-navigable skill list (`/` search, arrow keys), shareable deep links, and one-click install/hash/link copy. Rebuilds from `scanner/results/scan-results.json` on every `npm run scanner:scan`. | [`scanner/bin/scan-skills.mjs`](./scanner/bin/scan-skills.mjs), [`scanner/results/`](./scanner/results/), [`scanner/public/index.html`](./scanner/public/index.html) |",
    "| Deployment | Static-hosting configs that run the catalog build and publish `public/`. | [`vercel.json`](./vercel.json), [`render.yaml`](./render.yaml) |",
    "",
    "### Source Families",
    "",
    `This is the same ${catalog.length}-skill inventory grouped by where the source directories live. The full per-skill catalog appears below.`,
    "",
    "| Source family | Skills | What it covers |",
    "|---|---:|---|",
  );

  for (const [family, skills] of bySourceFamily) {
    lines.push(`| \`${family}\` | ${skills.length} | ${sourceFamilyDescription(family)} |`);
  }

  lines.push(
    "",
    "## 🚀 Install in 10 Seconds",
    "",
    "The whole hub:",
    "",
    "```bash",
    "npx skills add Solizardking/skills        # via skills.sh",
    "npx github:Solizardking/skills install    # straight from GitHub",
    "```",
    "",
    "Or grab a **premiere** focused stack (the hub's lead offerings):",
    "",
    "```bash",
    "# Premiere: engineering (TDD, implement, triage, architecture)",
    "npx github:Solizardking/skills install engineering/tdd engineering/implement engineering/triage engineering/codebase-design engineering/to-spec",
    "",
    "# Premiere: agent orchestration (goal loops, handoffs, subagents)",
    "npx github:Solizardking/skills install agent-orchestration/goal-loop agent-orchestration/handoff agent-orchestration/codex-subagent agent-orchestration/run-deep-swe",
    "",
    "# Premiere: productivity + thinking & docs",
    "npx github:Solizardking/skills install productivity/grill-me productivity/teach productivity/writing-great-skills thinking-and-docs/brain-to-docs thinking-and-docs/prompt-me",
    "",
    "# Premiere: design & motion",
    "npx github:Solizardking/skills install apple-design emil-design-eng animation-vocabulary review-animations",
    "",
    "# Premiere: research, skill authoring, ops",
    "npx github:Solizardking/skills install research-and-web/deep-research research-and-web/browser-harness skill-authoring/effective-agent-skills ops-and-setup/setup-help",
    "```",
    "",
    "Also available — NVIDIA, Google, and Solana stacks:",
    "",
    "```bash",
    "# NVIDIA accelerated computing (Jetson, DeepStream, NeMo, cuOpt, CUDA-Q)",
    "npx github:Solizardking/skills install nvidia/jetson-quick-start nvidia/deepstream-dev nvidia/cudaq-guide nvidia/aiq-deploy nvidia/cuopt-developer",
    "",
    "npx github:Solizardking/skills install solana-dev solana-formal-verification magicblock",
    "npx github:Solizardking/skills install pumpfun pump-token-lifecycle pump-bonding-curve pump-security",
    "npx github:Solizardking/skills install compressed-pda compressed-token zk zkrouter",
    "npx github:Solizardking/skills install google/cloud/gcloud google/cloud/gke-basics google/cloud/bigquery-basics",
    "```",
    "",
    "Point it at any agent skill root:",
    "",
    "```bash",
    "npx github:Solizardking/skills install --target ~/.codex/skills   # Codex",
    "npx github:Solizardking/skills install --claude                   # Claude Code",
    "npx github:Solizardking/skills install --eve                      # eve (agent/skills/)",
    "```",
    "",
    "## 🌟 Featured Runs",
    "",
    "**Premiere loadouts first** — engineering, orchestration, productivity, design, research, authoring, and ops. NVIDIA, Solana, and trading runs follow:",
    "",
  );

  for (const [label, blurb, skills] of featuredRuns) {
    if (!skills.length) continue;
    lines.push(
      "<details>",
      `<summary><strong>${label}</strong> — ${blurb} <em>(${skills.length} skills)</em></summary>`,
      "",
      skills.map((skill) => markdownSkillLink(skill)).join(" · "),
      "",
      "</details>",
      "",
    );
  }

  lines.push(
    "## 📚 The Full Catalog",
    "",
    "Every skill, every zone. Click a zone to expand it — descriptions keep the exact trigger text agents match on.",
  );

  for (const [category, skills] of byCategory) {
    const meta = categoryMeta(category);
    lines.push(
      "",
      `### ${meta.emoji} ${category}`,
      "",
      `> ${meta.tagline} — **${skills.length} skills**`,
      "",
      "<details>",
      `<summary>Open the ${category} cabinet</summary>`,
      "",
      "| Skill | Name | Description |",
      "|---|---|---|",
    );
    for (const skill of skills) {
      lines.push(`| ${markdownSkillLink(skill)} | ${escapeTable(skill.name)} | ${escapeTable(skill.description)} |`);
    }
    lines.push("", "</details>");
  }

  lines.push(
    "",
    '<div align="center">',
    "",
    '<img src="./assets/chain-divider.svg" alt="" width="100%" />',
    "",
    "</div>",
    "",
    "## ⛓️ On-Chain: Arweave × Solana",
    "",
    "This hub doesn't just live on GitHub — every build is designed to be **permanent and verifiable**:",
    "",
    "1. **Hash** — every skill bundle gets a SHA-256 `bundleHash`; all leaves roll up into one Merkle root in [`.well-known/onchain-skill-registry.json`](./public/.well-known/onchain-skill-registry.json).",
    "2. **Pin** — `npm run publish:onchain` uploads the registry + catalog to **Arweave** (paid in SOL via Irys), so the catalog can never be memory-holed.",
    "3. **Anchor** — the same command writes a **Solana memo transaction** carrying the Merkle root and the Arweave tx IDs, timestamping the whole catalog on SVM.",
    "",
    "```bash",
    "npm run build:catalog          # regenerate catalog + hashes + merkle root",
    "npm run publish:onchain        # dry-run: shows the plan, costs, and memo payload",
    "npm run publish:onchain -- --execute   # uploads to Arweave + anchors on Solana",
    "```",
    "",
    "Verify any skill later: fetch its `verification.json`, re-hash the bundle, check the leaf against the anchored root. See [ONCHAIN.md](./ONCHAIN.md) for the full protocol.",
    "",
    "| Artifact | Where |",
    "|---|---|",
    `| Catalog JSON | [\`catalog.json\`](./catalog.json) · ${SITE_URL}/api/skills.json |`,
    `| Merkle registry | [\`.well-known/onchain-skill-registry.json\`](./public/.well-known/onchain-skill-registry.json) |`,
    `| Per-skill proof | ${SITE_URL}/api/skills/solana-dev/verification.json |`,
    `| Live catalog UI | ${SITE_URL}/skills |`,
    "| Publish receipts | `onchain/publish-receipt.json` (created by `publish:onchain`) |",
    "",
    "## 🔄 How It Stays Fresh",
    "",
    "- Everything you just read is **generated** by `npm run build:catalog` — README, banner SVGs, catalog JSON, the public site, and the Merkle registry all rebuild from the skills on disk.",
    "- Nested skills are discovered recursively (`google/*`, `nvidia/*`, and friends publish through the same pipeline).",
    `- The production mirror is ${SITE_URL} — same build output, served statically.`,
    "- Add a skill folder with a `SKILL.md` under `skills/`, rebuild, and it appears everywhere: README, JSON API, site, and the next on-chain anchor.",
    "",
    "### Realtime skill relay",
    "",
    "Drop a new skill under `skills/` (or update an existing one) and the relay keeps GitHub + the site in sync:",
    "",
    "```bash",
    "npm run relay              # one-shot: build + smoke + sample install check",
    "npm run relay:watch        # poll skills/ and rebuild whenever something changes",
    "npm run relay:push         # rebuild, commit generated artifacts, git push",
    "npm run relay -- --onchain --execute --devnet   # also re-anchor Arweave × Solana",
    "```",
    "",
    "CI path: [`.github/workflows/skill-relay.yml`](./.github/workflows/skill-relay.yml) runs on every push to `skills/**`, on `workflow_dispatch`, and on `repository_dispatch` type `skill-ingest` (for bot/webhook ingest). Vercel rebuilds `public/` from the same catalog build on deploy.",
    "",
    "External ingest webhook shape:",
    "",
    "```bash",
    "curl -X POST -H \"Accept: application/vnd.github+json\" \\",
    "  -H \"Authorization: Bearer $GH_TOKEN\" \\",
    "  https://api.github.com/repos/Solizardking/skills/dispatches \\",
    "  -d '{\"event_type\":\"skill-ingest\",\"client_payload\":{\"publish_onchain\":false}}'",
    "```",
    "",
    '<div align="center">',
    "",
    "**Built for agents, hashed for history, anchored for keeps.** 🟣",
    "",
    "</div>",
    "",
  );

  return `${lines.join("\n")}`;
}

function renderHub(catalog) {
  const byCategory = groupByCategory(catalog);
  const maxCount = Math.max(...byCategory.map(([, skills]) => skills.length));
  const categoryCounts = Object.fromEntries(byCategory.map(([category, skills]) => [category, skills.length]));
  const googleCount = (categoryCounts["Google / Ads"] || 0) + (categoryCounts["Google / Analytics"] || 0) + (categoryCounts["Google / Cloud"] || 0);
  const nvidiaCount = categoryCounts["NVIDIA / Accelerated Computing"] || 0;
  const solanaCount = categoryCounts["Solana / Blockchain"] || 0;

  const lines = [
    "# Skill Hub",
    "",
    "Generated by `npm run build:catalog` from the repo-local `SKILL.md` inventory.",
    "",
    "## Dashboard",
    "",
    "| Signal | Value |",
    "|---|---:|",
    `| Total skills | ${catalog.length} |`,
    `| Categories | ${byCategory.length} |`,
    `| Google skills | ${googleCount} |`,
    `| NVIDIA skills | ${nvidiaCount} |`,
    `| Solana / blockchain skills | ${solanaCount} |`,
    "| Public catalog | `/skills` or `public/index.html` |",
    "| Scanner dashboard | Live, interactive verification/risk/category charts at `/scanner` or `npm run scanner:serve` |",
    `| Production site | ${SITE_URL} |`,
    "",
    "## Launch Sequences",
    "",
    "Install the whole hub:",
    "",
    "```bash",
    "npx skills add Solizardking/skills",
    "npx github:Solizardking/skills install",
    "```",
    "",
    "Install **premiere** focused stacks (lead offerings):",
    "",
    "```bash",
    "npx github:Solizardking/skills install engineering/tdd engineering/implement engineering/triage engineering/codebase-design engineering/to-spec --force",
    "npx github:Solizardking/skills install agent-orchestration/goal-loop agent-orchestration/handoff agent-orchestration/codex-subagent agent-orchestration/run-deep-swe",
    "npx github:Solizardking/skills install productivity/grill-me productivity/teach productivity/writing-great-skills thinking-and-docs/brain-to-docs thinking-and-docs/prompt-me",
    "npx github:Solizardking/skills install apple-design emil-design-eng animation-vocabulary review-animations",
    "npx github:Solizardking/skills install research-and-web/deep-research research-and-web/browser-harness skill-authoring/effective-agent-skills ops-and-setup/setup-help",
    "npx github:Solizardking/skills install misc/setup-pre-commit in-progress/wizard personal/obsidian-vault deprecated/qa",
    "```",
    "",
    "Also available — NVIDIA / Solana / Google stacks:",
    "",
    "```bash",
    "npx github:Solizardking/skills install nvidia/jetson-quick-start nvidia/deepstream-dev nvidia/cudaq-guide nvidia/aiq-deploy nvidia/cuopt-developer --force",
    "npx github:Solizardking/skills install solana-dev solana-formal-verification magicblock --force",
    "npx github:Solizardking/skills install pumpfun pump-token-lifecycle pump-bonding-curve pump-fee-sharing pump-claims-readonly pump-security",
    "npx github:Solizardking/skills install ask-mcp compressed-pda compressed-token solana-redpill-verifier solana-rent-free-dev testing zk zkrouter",
    "npx github:Solizardking/skills install google/cloud/gke-basics google/cloud/gcloud google/cloud/bigquery-basics",
    "npx github:Solizardking/skills install google/ads/google-ads-api/google-ads-api-quickstart google/analytics/google-analytics-data-api-basics",
    "```",
    "",
    "Choose another agent skill root:",
    "",
    "```bash",
    "npx github:Solizardking/skills install --target ~/.codex/skills",
    "npx github:Solizardking/skills install --claude",
    "npx github:Solizardking/skills install --eve",
    "```",
    "",
    "## Verification",
    "",
    "```bash",
    "npm run build:catalog",
    "npm run check",
    "npm run scanner:scan",
    "npm test",
    "```",
    "",
    "Generated verification artifacts:",
    "",
    `| Catalog JSON | [\`catalog.json\`](./catalog.json) and ${SITE_URL}/api/skills.json |`,
    `| Site manifest | [\`.well-known/skills-hub.json\`](./public/.well-known/skills-hub.json) |`,
    `| On-chain registry | [\`.well-known/onchain-skill-registry.json\`](./public/.well-known/onchain-skill-registry.json) |`,
    "| Scanner results | [`scanner/results/scan-results.json`](./scanner/results/scan-results.json) |",
    "| Scanner dashboard | [`scanner/public/index.html`](./scanner/public/index.html) |",
    "| Monetization registry | [`public/api/monetization.json`](./public/api/monetization.json) |",
    "| Commerce Kit integration | [`public/integrations/commerce-kit-payment-button.tsx`](./public/integrations/commerce-kit-payment-button.tsx) |",
    "",
    "## Monetization",
    "",
    "The generated frontend includes a publisher monetization panel. Set a Solana merchant wallet to enable Solana Pay tip links on every skill, and set an off-chain checkout URL for invoices, cards, subscriptions, or account provisioning.",
    "",
    "Render build-time environment variables:",
    "",
    "| Variable | Purpose |",
    "|---|---|",
    "| `SKILLHUB_MERCHANT_WALLET` | Default Solana payment recipient wallet |",
    "| `SKILLHUB_MERCHANT_NAME` | Merchant label shown in payment config |",
    "| `SKILLHUB_PAYMENT_NETWORK` | `mainnet` or `devnet` |",
    "| `SKILLHUB_OFFCHAIN_CHECKOUT_URL` | Optional checkout URL used for off-chain payment flows |",
    "| `SKILLHUB_PAYMENT_RPC_URL` | Optional custom Solana RPC URL for Commerce Kit |",
    "| `SKILLHUB_ALLOWED_MINTS` | Optional comma-separated accepted token mint addresses |",
    "",
    "## Category Map",
    "",
    "| Zone | Skills | Power level | First stops |",
    "|---|---:|---|---|",
  ];

  for (const [category, skills] of byCategory) {
    const stops = skills.slice(0, 5).map((skill) => `\`${skill.slug}\``).join(", ");
    lines.push(`| ${category} | ${skills.length} | \`${meterBar(skills.length, maxCount)}\` | ${stops} |`);
  }

  lines.push(
    "",
    "## Installable Skills",
    "",
    "Every row is generated from a live `SKILL.md` frontmatter block.",
  );

  for (const [category, skills] of byCategory) {
    const meta = categoryMeta(category);
    lines.push(
      "",
      `### ${meta.emoji} ${category}`,
      "",
      `> ${meta.tagline} - ${skills.length} skills`,
      "",
      "| Skill | Name | Trigger summary |",
      "|---|---|---|",
    );
    for (const skill of skills) {
      lines.push(`| ${markdownSkillLink(skill)} | ${escapeTable(skill.name)} | ${escapeTable(skill.description)} |`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}`;
}

function renderHeroBanner(catalog) {
  const byCategory = groupByCategory(catalog);
  const emojis = byCategory.map(([category]) => categoryMeta(category).emoji).join("  ");
  const seeded = (i, m) => ((i * 2654435761) % m + m) % m;
  const stars = Array.from({ length: 42 }, (_, i) => {
    const x = 30 + seeded(i + 7, 1140);
    const y = 20 + seeded(i * 13 + 3, 260);
    const r = 1 + (i % 3);
    const dur = 2 + (i % 5);
    const begin = (i % 10) * 0.35;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#a78bfa"><animate attributeName="opacity" values="0.15;1;0.15" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`;
  }).join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0217">
        <animate attributeName="stop-color" values="#0b0217;#120b2e;#0b0217" dur="8s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" stop-color="#1a0533">
        <animate attributeName="stop-color" values="#1a0533;#062131;#1a0533" dur="8s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#9945FF"/>
      <stop offset="50%" stop-color="#00C2FF"/>
      <stop offset="100%" stop-color="#14F195"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="-0.3 0;0.3 0;-0.3 0" dur="6s" repeatCount="indefinite"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="300" fill="url(#bg)" rx="16"/>
  <g opacity="0.8">
    ${stars}
  </g>
  <g transform="translate(600 128)" text-anchor="middle">
    <text font-size="72" font-weight="800" fill="url(#title)" letter-spacing="6">⚡ SKILL HUB</text>
  </g>
  <g transform="translate(600 178)" text-anchor="middle">
    <text font-size="24" fill="#c4b5fd">${catalog.length} agent skills · ${byCategory.length} zones · merkle-verified · arweave-permanent · solana-anchored</text>
  </g>
  <g transform="translate(600 232)" text-anchor="middle">
    <text font-size="30">${emojis}
      <animate attributeName="opacity" values="0.55;1;0.55" dur="3s" repeatCount="indefinite"/>
    </text>
  </g>
  <rect x="8" y="8" width="1184" height="284" rx="12" fill="none" stroke="#9945FF" stroke-width="2" stroke-dasharray="14 10" opacity="0.6">
    <animate attributeName="stroke-dashoffset" values="0;-96" dur="4s" repeatCount="indefinite"/>
  </rect>
</svg>
`;
}

function renderChainDivider() {
  const links = Array.from({ length: 24 }, (_, i) => {
    const x = 25 + i * 50;
    const begin = (i * 0.12).toFixed(2);
    return `<circle cx="${x}" cy="20" r="6" fill="none" stroke="#14F195" stroke-width="2"><animate attributeName="stroke" values="#14F195;#9945FF;#00C2FF;#14F195" dur="3s" begin="${begin}s" repeatCount="indefinite"/></circle>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 40">
  <line x1="0" y1="20" x2="1200" y2="20" stroke="#4c1d95" stroke-width="2" stroke-dasharray="8 8">
    <animate attributeName="stroke-dashoffset" values="0;-64" dur="3s" repeatCount="indefinite"/>
  </line>
  ${links}
</svg>
`;
}

function groupBySourceFamily(catalog) {
  const groups = new Map();

  for (const skill of catalog) {
    const family = sourceFamily(skill.slug);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(skill);
  }

  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function sourceFamily(slug) {
  // Premiere families first — these are the hub's lead offerings.
  if (slug.startsWith("engineering/")) return "engineering/*";
  if (slug.startsWith("agent-orchestration/")) return "agent-orchestration/*";
  if (slug.startsWith("productivity/")) return "productivity/*";
  if (slug.startsWith("thinking-and-docs/")) return "thinking-and-docs/*";
  if (["animation-vocabulary", "apple-design", "emil-design-eng", "review-animations"].includes(slug)) return "design-motion/*";
  if (slug.startsWith("research-and-web/")) return "research-and-web/*";
  if (slug.startsWith("skill-authoring/")) return "skill-authoring/*";
  if (slug.startsWith("ops-and-setup/")) return "ops-and-setup/*";
  if (slug.startsWith("misc/")) return "misc/*";
  if (slug.startsWith("in-progress/")) return "in-progress/*";
  if (slug.startsWith("personal/")) return "personal/*";
  if (slug.startsWith("deprecated/")) return "deprecated/*";
  if (slug.startsWith("google/")) return "google/*";
  if (slug.startsWith("nvidia/")) return "nvidia/*";
  if (slug.startsWith("anthropic-skills/")) return "anthropic-skills/*";
  if (slug === "pumpfun" || slug.startsWith("pump-") || slug.startsWith("pumpfun-")) return "pump/pumpfun/*";
  if (slug === "vulcan" || slug.startsWith("vulcan-")) return "vulcan/*";
  if (slug === "imperial" || slug.startsWith("imperial-")) return "imperial/*";
  if (slug.startsWith("dflow-")) return "dflow/*";
  if (slug.startsWith("solana")) return "solana/*";
  if (slug.startsWith("helius-skills/")) return "helius-skills/*";
  if (slug.startsWith("openrouter")) return "openrouter/*";
  return "single/root skills";
}

function sourceFamilyDescription(family) {
  const descriptions = {
    "engineering/*": "Premiere engineering playbooks: TDD, implement, triage, architecture, domain modeling, specs, and tickets.",
    "agent-orchestration/*": "Premiere agent orchestration: goal loops, handoffs, subagents, deep SWE, and self-scheduling.",
    "productivity/*": "Premiere productivity: grilling, teaching, handoffs, and writing great skills.",
    "thinking-and-docs/*": "Premiere thinking and docs: brain-to-docs, ADRs, prompts, level-up, and concise teaching.",
    "design-motion/*": "Premiere design and motion: Apple HIG, Emil design-eng, animation vocabulary, and review animations.",
    "research-and-web/*": "Premiere research and web: deep research, browser harness, transcripts, shopping, and web search.",
    "skill-authoring/*": "Premiere skill authoring: effective skills, distribution, folder-specific agents, and GitHub push.",
    "ops-and-setup/*": "Premiere ops and setup: readonly DB roles, cyber audit, Safe Browsing, custom models, and setup help.",
    "misc/*": "Premiere misc utilities: git guardrails, shoehorn migration, exercise scaffolds, and pre-commit setup.",
    "in-progress/*": "Premiere in-progress drafts: wizards, deep modules, writing craft, and experimental loops.",
    "personal/*": "Premiere personal workflows: Obsidian vault and article editing.",
    "deprecated/*": "Premiere-listed deprecated skills kept installable for continuity (QA, design-an-interface, refactor plans).",
    "single/root skills": "One-skill source directories for local tools, messaging, utilities, media, devices, and specialized workflows.",
    "google/*": "Nested Google Ads, Analytics, Cloud, GKE, BigQuery, Firebase, Gemini, and Well-Architected Framework skills.",
    "nvidia/*": "NVIDIA accelerated computing: CUDA/cuDF, Jetson BSP, NeMo, DeepStream, cuOpt, TAO, Holoscan, Earth-2, Dynamo, and digital health.",
    "pump/pumpfun/*": "Pump.fun and pump-program launch, fee, security, wallet, testing, SDK, and token-lifecycle workflows.",
    "vulcan/*": "Vulcan/Phoenix perps trading skills for onboarding, market intel, execution, grids, TWAP, TP/SL, margin, and risk.",
    "anthropic-skills/*": "Imported Anthropic-format skills for documents, spreadsheets, design, web apps, MCP, artifacts, and skill creation.",
    "imperial/*": "Imperial trading deck skills for execution modes, margin, portfolio intelligence, position management, and risk.",
    "dflow/*": "DFlow, Kalshi, Phantom Connect, spot trading, portfolio, market data, fees, and KYC workflows.",
    "solana/*": "Solana development, formal verification, Clawd, Redpill verifier, rent-free, and agentic-commerce skills.",
    "helius-skills/*": "Helius infrastructure skills for Sender, DAS, LaserStream, Jupiter, OKX, Phantom, and SVM internals.",
    "openrouter/*": "OpenRouter model, image, OAuth, TypeScript SDK, and agent migration references.",
  };
  return descriptions[family] || "Repo-local skill sources.";
}

function groupByCategory(catalog) {
  return CATEGORY_ORDER
    .map((category) => [category, catalog.filter((skill) => skill.category === category)])
    .filter(([, skills]) => skills.length > 0);
}

function markdownSkillLink(skill) {
  return `[\`${skill.slug}\`](./skills/${skill.slug}/SKILL.md)`;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function renderSkillsShConfig(catalog) {
  const config = {
    $schema: "https://skills.sh/schemas/skills.sh.schema.json",
    notGrouped: "bottom",
    groupings: groupByCategory(catalog).map(([category, skills]) => ({
      title: category,
      description: categoryDescription(category),
      skills: skills.map((skill) => skill.slug),
    })),
  };

  return `${JSON.stringify(config, null, 2)}\n`;
}

function categoryDescription(category) {
  const descriptions = {
    "Dev Tools / Agents": "Coding-agent, MCP, GitHub, terminal, and skill-development workflows.",
    "Google / Ads": "Google Ads and mobile ads workflows for agent-assisted implementation.",
    "Google / Analytics": "Google Analytics account, property, and reporting workflows.",
    "Google / Cloud": "Google Cloud deployment, operations, infrastructure, and AI platform skills.",
    "NVIDIA / Accelerated Computing": "NVIDIA GPU stacks: CUDA, Jetson, NeMo, DeepStream, cuOpt, TAO, Holoscan, Earth-2, and Dynamo.",
    "Local / Web Services": "Local services, places, orders, and weather workflows.",
    "Media / Devices": "Media generation, device control, transcription, and visual processing skills.",
    "Productivity / Messaging": "Notes, messaging, workspace, and personal productivity integrations.",
    "Solana / Blockchain": "Solana, wallets, trading, verification, ZK, and on-chain agent workflows.",
    "Utilities": "General utility skills for local tools and everyday agent operations.",
  };
  return descriptions[category] || "Repo-local agent skills.";
}

function numberWord(n) {
  const words = {
    1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five",
    6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten",
    11: "Eleven", 12: "Twelve",
  };
  return words[n] || String(n);
}

function getSkillBundleFiles(files, slug) {
  const prefix = `api/skills/${slug}/`;
  return [...files.entries()]
    .filter(([file]) => file.startsWith(prefix))
    .filter(([file]) => !file.endsWith("/metadata.json") && !file.endsWith("/verification.json"))
    .map(([file, content]) => ({
      path: file.slice(prefix.length),
      content: toBuffer(content),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function renderSkillVerification(skill, bundleFiles) {
  const files = bundleFiles.map(({ path: filePath, content }) => ({
    path: filePath,
    bytes: content.byteLength,
    sha256: `sha256-${sha256(content)}`,
  }));
  const bundleHash = hashBundle(bundleFiles);
  const merkleLeaf = `sha256-${sha256(`${skill.slug}\0${bundleHash}`)}`;

  return {
    schemaVersion: "skill-verification/v1",
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    source: `${SITE_URL}/api/skills/${skill.slug}/SKILL.md`,
    metadata: `${SITE_URL}/api/skills/${skill.slug}/metadata.json`,
    bundleHash,
    merkleLeaf,
    files,
    registry: `${SITE_URL}/.well-known/onchain-skill-registry.json`,
    solana: {
      cluster: "mainnet-beta",
      status: "anchor-ready",
      registryProgramId: null,
      registryPda: null,
    },
  };
}

function renderOnchainRegistry(catalog, verifications) {
  return {
    schemaVersion: "onchain-skill-registry/v1",
    name: "Onchain AI Skill Hub",
    url: SITE_URL,
    generatedAt: "1970-01-01T00:00:00.000Z",
    chain: "solana",
    cluster: "mainnet-beta",
    status: "anchor-ready",
    hashAlgorithm: "sha256",
    totalSkills: verifications.length,
    catalogHash: `sha256-${sha256(JSON.stringify(catalog))}`,
    merkleRoot: computeMerkleRoot(verifications.map((entry) => entry.merkleLeaf)),
    solana: {
      registryProgramId: null,
      registryPda: null,
      authority: null,
      seedHint: ["skill-registry", new URL(SITE_URL).hostname],
      instruction: "Anchor this merkleRoot and catalogHash in a Solana registry account controlled by the hub authority.",
    },
    endpoints: {
      catalog: `${SITE_URL}/api/skills.json`,
      skillVerification: `${SITE_URL}/api/skills/{skill}/verification.json`,
      skillSource: `${SITE_URL}/api/skills/{skill}/SKILL.md`,
    },
    skills: verifications,
  };
}

function hashBundle(bundleFiles) {
  const hash = createHash("sha256");
  hash.update("skill-bundle-v1\0");
  for (const file of bundleFiles) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

function computeMerkleRoot(leaves) {
  if (leaves.length === 0) return `sha256-${sha256("")}`;

  let level = leaves.map((leaf) => leaf.replace(/^sha256-/, ""));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(sha256(Buffer.concat([Buffer.from(left, "hex"), Buffer.from(right, "hex")])));
    }
    level = next;
  }

  return `sha256-${level[0]}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value));
}

function renderSiteManifest(catalog, registry) {
  return {
    name: "Skill Hub — skills.x402.wtf",
    url: SITE_URL,
    aliases: SITE_ALIASES,
    cheshire: {
      skills: "https://cheshireterminal.ai/skills",
      skillsStore: "https://cheshireterminal.ai/skills-store",
    },
    generatedAt: "1970-01-01T00:00:00.000Z",
    totalSkills: catalog.length,
    categories: Object.fromEntries(groupByCategory(catalog).map(([category, skills]) => [category, skills.length])),
    featured: {
      solana: catalog.filter((s) => s.category === "Solana / Blockchain").map((s) => s.slug).slice(0, 24),
      prioritySkills: ["solana-common-errors", "solana-dev", "solana-clawd"].filter((slug) =>
        catalog.some((s) => s.slug === slug || s.slug.endsWith(`/${slug}`)),
      ),
    },
    endpoints: {
      ui: `${SITE_URL}/skills`,
      catalog: `${SITE_URL}/api/skills.json`,
      catalogIndex: `${SITE_URL}/api/skills`,
      monetization: `${SITE_URL}/api/monetization.json`,
      commerceKitIntegration: `${SITE_URL}/integrations/commerce-kit-payment-button.tsx`,
      skillMetadata: `${SITE_URL}/api/skills/{skill}/metadata.json`,
      skillSource: `${SITE_URL}/api/skills/{skill}/SKILL.md`,
      skillVerification: `${SITE_URL}/api/skills/{skill}/verification.json`,
      onchainRegistry: `${SITE_URL}/.well-known/onchain-skill-registry.json`,
      submissions: `${SITE_URL}/api/submissions.json`,
      onchainSummary: `${SITE_URL}/api/onchain.json`,
      publish: `${SITE_URL}/publish`,
      submissionsUi: `${SITE_URL}/submissions`,
    },
    skillsSh: {
      install: "npx skills add Solizardking/skills",
      repoConfig: "skills.sh.json",
    },
    verification: {
      chain: "solana",
      status: registry.status,
      merkleRoot: registry.merkleRoot,
      catalogHash: registry.catalogHash,
    },
    monetization: {
      onchain: "Solana Pay tip URI per skill card",
      offchain: "Optional checkout URL carried in api/monetization.json",
      commerceKit: "@solana-commerce/kit PaymentButton integration",
    },
  };
}

function renderSitemap(catalog) {
  const urls = [
    SITE_URL,
    `${SITE_URL}/skills`,
    `${SITE_URL}/api/skills.json`,
    `${SITE_URL}/api/monetization.json`,
    `${SITE_URL}/integrations/commerce-kit-payment-button.tsx`,
    `${SITE_URL}/.well-known/skills-hub.json`,
    `${SITE_URL}/.well-known/onchain-skill-registry.json`,
    ...catalog.flatMap((skill) => [
      `${SITE_URL}/api/skills/${encodeSkillPath(skill.slug)}/metadata.json`,
      `${SITE_URL}/api/skills/${encodeSkillPath(skill.slug)}/verification.json`,
      `${SITE_URL}/api/skills/${encodeSkillPath(skill.slug)}/SKILL.md`,
    ]),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}

function encodeSkillPath(slug) {
  return slug.split("/").map(encodeURIComponent).join("/");
}

function renderMonetizationConfig(catalog) {
  const network = DEFAULT_PAYMENT_NETWORK === "devnet" ? "devnet" : "mainnet";
  const merchant = {
    name: DEFAULT_MERCHANT_NAME,
    wallet: DEFAULT_MERCHANT_WALLET,
  };

  return {
    schemaVersion: "skillhub-monetization/v1",
    generatedAt: "1970-01-01T00:00:00.000Z",
    commerceKit: {
      package: "@solana-commerce/kit",
      component: "PaymentButton",
      mode: "tip",
      integration: "/integrations/commerce-kit-payment-button.tsx",
      docs: "https://launch.solana.com/products/commercekit/playground",
    },
    defaults: {
      merchant,
      network,
      rpcUrl: process.env.SKILLHUB_PAYMENT_RPC_URL || "",
      allowedMints: (process.env.SKILLHUB_ALLOWED_MINTS || "").split(",").map((mint) => mint.trim()).filter(Boolean),
      showQR: true,
      offchainCheckoutUrl: DEFAULT_OFFCHAIN_CHECKOUT_URL,
    },
    skills: catalog.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      category: skill.category,
      mode: "tip",
      merchant,
      network,
      onchainEnabled: isLikelySolanaAddress(merchant.wallet),
      offchainEnabled: Boolean(DEFAULT_OFFCHAIN_CHECKOUT_URL),
    })),
  };
}

function isLikelySolanaAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || ""));
}

function renderCommerceKitPaymentButton() {
  return `import { PaymentButton } from "@solana-commerce/kit";

export type SkillPaymentButtonProps = {
  skillSlug: string;
  merchantName?: string;
  merchantWallet: string;
  network?: "mainnet" | "devnet";
  rpcUrl?: string;
  allowedMints?: string[];
  onPaymentSuccess?: (signature: string) => void;
  onPaymentError?: (error: Error) => void;
};

export function SkillPaymentButton({
  skillSlug,
  merchantName = "Skill Hub",
  merchantWallet,
  network = "mainnet",
  rpcUrl,
  allowedMints,
  onPaymentSuccess,
  onPaymentError,
}: SkillPaymentButtonProps) {
  return (
    <PaymentButton
      config={{
        merchant: { name: merchantName, wallet: merchantWallet },
        mode: "tip",
        network,
        rpcUrl,
        allowedMints,
        showQR: true,
        theme: {
          borderRadius: 8,
        },
      }}
      onPaymentStart={() => {
        console.info("Skill payment started:", skillSlug);
      }}
      onPaymentSuccess={(signature) => {
        console.info("Skill payment confirmed:", skillSlug, signature);
        onPaymentSuccess?.(signature);
      }}
      onPaymentError={(error) => {
        console.error("Skill payment failed:", skillSlug, error);
        onPaymentError?.(error);
      }}
      onCancel={() => {
        console.info("Skill payment cancelled:", skillSlug);
      }}
    >
      <button type="button">Tip this skill</button>
    </PaymentButton>
  );
}
`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[char]);
}

function renderIndexHtml(catalog) {
  const grouped = Object.fromEntries(groupByCategory(catalog));
  const data = JSON.stringify(catalog).replace(/</g, "\\u003c");
  const paymentData = JSON.stringify(renderMonetizationConfig(catalog)).replace(/</g, "\\u003c");
  const categoryOptions = CATEGORY_ORDER.filter((category) => grouped[category]).map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  const categoryOrder = JSON.stringify(CATEGORY_ORDER.filter((category) => grouped[category]));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Skill Hub</title>
  <link rel="canonical" href="${SITE_URL}/skills">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f0e;
      --panel: #151b19;
      --panel-strong: #1b2421;
      --ink: #edf7f3;
      --muted: #9baba6;
      --line: #2b3834;
      --green: #39d7a6;
      --blue: #75a8ff;
      --amber: #e8b44e;
      --purple: #b99cff;
      --red: #ff8b82;
      --chip: #1d2a26;
      --soft-green: rgba(57, 215, 166, 0.14);
      --soft-blue: rgba(117, 168, 255, 0.14);
      --soft-amber: rgba(232, 180, 78, 0.14);
      --soft-red: rgba(255, 139, 130, 0.14);
      --soft-purple: rgba(185, 156, 255, 0.14);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.28), 0 18px 42px rgba(0, 0, 0, 0.24);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        linear-gradient(180deg, #121815 0%, var(--bg) 58%, #0f100c 100%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }

    a {
      color: inherit;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .shell {
      width: min(1340px, calc(100% - 32px));
      margin: 0 auto;
      padding: 24px 0 46px;
    }

    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 20px;
      align-items: center;
      padding: 12px 0 18px;
      border-bottom: 1px solid var(--line);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .mark {
      position: relative;
      width: 48px;
      height: 48px;
      border: 1px solid var(--green);
      border-radius: 8px;
      background:
        linear-gradient(90deg, transparent 48%, rgba(57, 215, 166, 0.34) 48% 52%, transparent 52%),
        linear-gradient(0deg, transparent 48%, rgba(117, 168, 255, 0.26) 48% 52%, transparent 52%),
        var(--panel-strong);
      flex: 0 0 auto;
      animation: mark-shift 8s ease-in-out infinite;
    }

    .mark::after {
      content: "";
      position: absolute;
      inset: 10px;
      border: 1px solid rgba(109, 40, 217, 0.55);
      border-radius: 4px;
      animation: mark-scan 2.8s ease-in-out infinite;
    }

    h1 {
      margin: 0;
      font-size: 31px;
      line-height: 1.08;
      letter-spacing: 0;
    }

    .subhead {
      margin: 5px 0 0;
      color: var(--muted);
      font-size: 15px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .tool-link,
    .copy-action,
    .open-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--ink);
      box-shadow: var(--shadow);
      font-size: 13px;
      font-weight: 720;
      text-decoration: none;
      white-space: nowrap;
      padding: 0 11px;
    }

    .tool-link.primary,
    .copy-action {
      border-color: var(--green);
      background: var(--green);
      color: #06110f;
    }

    .open-action {
      border-color: rgba(117, 168, 255, 0.28);
      background: var(--soft-blue);
      color: #cfe0ff;
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(260px, 1.3fr) minmax(180px, 260px) minmax(150px, 210px);
      gap: 10px;
      margin: 18px 0;
    }

    input,
    select {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101614;
      color: var(--ink);
      font: inherit;
      padding: 0 12px;
    }

    input::placeholder {
      color: #74847f;
    }

    input:focus,
    select:focus,
    button:focus-visible,
    a:focus-visible {
      outline: 3px solid rgba(117, 168, 255, 0.28);
      outline-offset: 1px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 18px;
    }

    .stat {
      min-height: 76px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .stat strong {
      display: block;
      font-size: 24px;
      line-height: 1;
      letter-spacing: 0;
    }

    .stat span {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.2;
    }

    .ops {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 0 0 18px;
    }

    .ops-card {
      position: relative;
      min-width: 0;
      overflow: hidden;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .ops-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: -45%;
      width: 45%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--green), var(--blue), transparent);
      animation: ops-scan 4.8s linear infinite;
    }

    .ops-kicker {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 0 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--chip);
      color: var(--muted);
      font-size: 11px;
      font-weight: 740;
      text-transform: uppercase;
    }

    .ops-card h2 {
      margin: 10px 0 0;
      font-size: 18px;
      line-height: 1.18;
      letter-spacing: 0;
    }

    .ops-card p {
      margin: 7px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .ops-links,
    .creator-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .creator-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(118px, 158px);
      gap: 8px;
      margin-top: 12px;
    }

    .creator-form input:last-child,
    .creator-output {
      grid-column: 1 / -1;
    }

    .creator-output {
      width: 100%;
      min-height: 118px;
      margin-top: 8px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f1513;
      color: var(--ink);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      padding: 10px;
    }

    .monetize {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 0.75fr);
      gap: 12px;
      margin: 18px 0;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .monetize h2,
    .payment-modal h2 {
      margin: 0;
      font-size: 18px;
      line-height: 1.18;
      letter-spacing: 0;
    }

    .monetize p,
    .payment-modal p {
      margin: 7px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .monetize-form {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(110px, 150px);
      gap: 8px;
      align-content: start;
    }

    .monetize-form input:last-child {
      grid-column: 1 / -1;
    }

    .status-line {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--chip);
      color: #d9e8e3;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .badge.green {
      border-color: rgba(57, 215, 166, 0.32);
      background: var(--soft-green);
      color: #91f1d2;
    }

    .badge.amber {
      border-color: rgba(232, 180, 78, 0.32);
      background: var(--soft-amber);
      color: #ffd78a;
    }

    .badge.red {
      border-color: rgba(255, 139, 130, 0.34);
      background: var(--soft-red);
      color: var(--red);
    }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 22px 0 10px;
    }

    .section-head h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0;
    }

    .section-head span {
      color: var(--muted);
      font-size: 13px;
    }

    .map {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .map-card {
      display: grid;
      gap: 10px;
      width: 100%;
      min-height: 104px;
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
      color: var(--ink);
      text-align: left;
      transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
    }

    .map-card:hover,
    .map-card[aria-pressed="true"] {
      border-color: rgba(117, 168, 255, 0.48);
      box-shadow: 0 0 0 1px rgba(117, 168, 255, 0.15), var(--shadow);
      transform: translateY(-1px);
    }

    .map-top,
    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .map-name {
      font-size: 14px;
      font-weight: 760;
      overflow-wrap: anywhere;
    }

    .map-count {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .rail {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #25312e;
    }

    .rail span {
      display: block;
      height: 100%;
      width: var(--rail);
      border-radius: inherit;
      background: linear-gradient(90deg, var(--green), var(--blue), var(--purple));
      animation: rail-flow 3.2s linear infinite;
      background-size: 180% 100%;
    }

    .map-desc {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.3;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .skill-card {
      display: flex;
      min-height: 188px;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
      animation: rise-in 420ms ease both;
      transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
    }

    .skill-card:hover {
      border-color: rgba(117, 168, 255, 0.38);
      box-shadow: var(--shadow);
      transform: translateY(-2px);
    }

    .skill-card h2 {
      margin: 0;
      font-size: 17px;
      line-height: 1.25;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    .skill-card p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
      overflow: hidden;
    }

    .card-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .category {
      color: var(--amber);
      font-size: 12px;
      font-weight: 650;
      line-height: 1.2;
    }

    .path {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      max-width: 100%;
      padding: 0 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--chip);
      color: #d9e8e3;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty {
      display: none;
      padding: 30px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      text-align: center;
    }

    .payment-backdrop {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: none;
      place-items: center;
      padding: 18px;
      background: rgba(4, 7, 6, 0.72);
    }

    .payment-backdrop.open {
      display: grid;
    }

    .payment-modal {
      width: min(760px, 100%);
      max-height: min(760px, calc(100vh - 36px));
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 22px 60px rgba(0, 0, 0, 0.46);
    }

    .payment-head,
    .payment-body {
      padding: 16px;
    }

    .payment-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      border-bottom: 1px solid var(--line);
    }

    .payment-body {
      display: grid;
      gap: 14px;
    }

    .payment-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .payment-box {
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #101614;
    }

    .payment-box strong,
    .payment-box code,
    .payment-code code {
      overflow-wrap: anywhere;
    }

    .payment-code {
      max-height: 220px;
      overflow: auto;
      margin: 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #111c1a;
      color: #eaf7f1;
      font-size: 12px;
    }

    .icon-button {
      width: 34px;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--ink);
      font-size: 20px;
      line-height: 1;
    }

    @media (max-width: 1080px) {
      .ops,
      .map,
      .stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .ops-card:last-child {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 760px) {
      .shell {
        width: min(100% - 22px, 1340px);
        padding-top: 18px;
      }

      header,
      .toolbar,
      .ops,
      .creator-form,
      .map,
      .stats,
      .monetize,
      .monetize-form,
      .payment-grid {
        grid-template-columns: 1fr;
      }

      .ops-card:last-child {
        grid-column: auto;
      }

      .actions {
        justify-content: flex-start;
      }

      h1 {
        font-size: 27px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 1ms !important;
      }
    }

    @keyframes rise-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes mark-shift {
      0%, 100% {
        background-position: 0 0, 0 0, 0 0;
      }
      50% {
        background-position: 8px 0, 0 8px, 0 0;
      }
    }

    @keyframes mark-scan {
      0%, 100% {
        transform: scale(0.82);
        opacity: 0.45;
      }
      50% {
        transform: scale(1);
        opacity: 1;
      }
    }

    @keyframes rail-flow {
      0% {
        background-position: 0% 50%;
      }
      100% {
        background-position: 180% 50%;
      }
    }

    @keyframes ops-scan {
      0% {
        left: -45%;
        opacity: 0;
      }
      12% {
        opacity: 1;
      }
      82% {
        opacity: 1;
      }
      100% {
        left: 100%;
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div>
          <h1>Skill Hub</h1>
          <p class="subhead">${catalog.length} repo-local skills mapped by zone, trigger text, install target, and verification surface.</p>
        </div>
      </div>
      <nav class="actions" aria-label="Hub links">
        <a class="tool-link primary" href="/skills">Catalog</a>
        <a class="tool-link" href="/publish">Publish</a>
        <a class="tool-link" href="/submissions">Submissions</a>
        <a class="tool-link" id="scannerLink" href="/scanner">Scanner</a>
        <a class="tool-link" href="/api/skills.json">API</a>
        <a class="tool-link" href="/.well-known/onchain-skill-registry.json">Registry</a>
        <a class="tool-link" href="https://cheshireterminal.ai/skills" target="_blank" rel="noopener">Cheshire</a>
      </nav>
    </header>

    <section class="stats" id="stats" aria-label="Hub metrics"></section>

    <section class="ops" aria-label="Hub operations">
      <article class="ops-card">
        <span class="ops-kicker">Hub</span>
        <h2>Skill Map</h2>
        <p>${catalog.length} skills are indexed into installable API files, registry records, and searchable frontend cards.</p>
        <div class="status-line">
          <span class="badge green">Catalog live</span>
          <span class="badge">API ready</span>
          <span class="badge">Registry ready</span>
        </div>
        <div class="ops-links">
          <a class="open-action" href="/api/skills.json">Open API</a>
          <a class="open-action" href="/.well-known/skills-hub.json">Open manifest</a>
        </div>
      </article>

      <article class="ops-card">
        <span class="ops-kicker">Creator</span>
        <h2>Skill Creator Hub</h2>
        <div class="creator-form">
          <input id="creatorName" autocomplete="off" spellcheck="false" placeholder="New skill name">
          <select id="creatorResources" aria-label="Creator resources">
            <option value="scripts,references">Scripts + references</option>
            <option value="references">References only</option>
            <option value="scripts">Scripts only</option>
            <option value="assets">Assets only</option>
            <option value="scripts,references,assets">Full bundle</option>
          </select>
          <input id="creatorPurpose" autocomplete="off" spellcheck="false" placeholder="Trigger or workflow">
        </div>
        <textarea class="creator-output" id="creatorOutput" readonly aria-label="Creator plan"></textarea>
        <div class="creator-actions">
          <button class="copy-action" type="button" id="copyCreator">Copy Plan</button>
          <a class="open-action" href="/api/skills/skill-creator/SKILL.md">Open Creator Skill</a>
        </div>
      </article>

      <article class="ops-card">
        <span class="ops-kicker">Scanner</span>
        <h2>Verification Scanner</h2>
        <p>Scanner output is bundled into the static site with risk, verification, hashes, and on-chain registry state.</p>
        <div class="status-line">
          <span class="badge green">Verifier linked</span>
          <span class="badge">Risk rules loaded</span>
          <span class="badge">Hashes indexed</span>
        </div>
        <div class="ops-links">
          <a class="open-action" id="scannerOpsLink" href="/scanner">Open Scanner</a>
          <a class="open-action" href="/api/verification.json">Open verification API</a>
        </div>
      </article>
    </section>

    <section class="monetize" aria-label="Skill monetization">
      <div>
        <h2>Monetize Skills</h2>
        <p>Set a merchant wallet to enable on-chain Solana tips for every skill card. Add an off-chain checkout URL when you want invoices, cards, subscriptions, or account-based access outside the chain.</p>
        <div class="status-line" id="paymentStatus"></div>
      </div>
      <div class="monetize-form">
        <input id="merchantWallet" autocomplete="off" spellcheck="false" placeholder="Solana merchant wallet">
        <select id="paymentNetwork" aria-label="Payment network">
          <option value="mainnet">Mainnet</option>
          <option value="devnet">Devnet</option>
        </select>
        <input id="offchainCheckout" autocomplete="off" spellcheck="false" placeholder="Off-chain checkout URL (optional)">
      </div>
    </section>

    <section class="toolbar" aria-label="Catalog filters">
      <input id="search" type="search" autocomplete="off" placeholder="Search skills">
      <select id="category" aria-label="Category">
        <option value="">All categories</option>
        ${categoryOptions}
      </select>
      <select id="sort" aria-label="Sort">
        <option value="category">Sort by category</option>
        <option value="name">Sort by name</option>
        <option value="length">Sort by description length</option>
      </select>
    </section>

    <section aria-label="Skill map">
      <div class="section-head">
        <h2>Map</h2>
        <span id="visibleCount">0 skills</span>
      </div>
      <div class="map" id="map"></div>
    </section>

    <section aria-label="Skill catalog">
      <div class="section-head">
        <h2>All Skills</h2>
        <span>Install all: <code>npx github:Solizardking/skills install</code></span>
      </div>
    </section>
    <section class="grid" id="grid"></section>
    <p class="empty" id="empty">No skills match the current filters.</p>
  </main>

  <div class="payment-backdrop" id="paymentBackdrop" aria-hidden="true">
    <section class="payment-modal" role="dialog" aria-modal="true" aria-labelledby="paymentTitle">
      <div class="payment-head">
        <div>
          <h2 id="paymentTitle">Skill Payment</h2>
          <p id="paymentSubtitle"></p>
        </div>
        <button class="icon-button" type="button" id="closePayment" aria-label="Close payment dialog">&times;</button>
      </div>
      <div class="payment-body" id="paymentBody"></div>
    </section>
  </div>

  <script id="skills-data" type="application/json">${data}</script>
  <script id="payment-data" type="application/json">${paymentData}</script>
  <script>
    const skills = JSON.parse(document.getElementById("skills-data").textContent);
    const paymentDefaults = JSON.parse(document.getElementById("payment-data").textContent);
    const categoryOrder = ${categoryOrder};
    const categoryDescriptions = {
      "Dev Tools / Agents": "Agent frameworks, CLIs, MCP, GitHub, terminal control, and skill development.",
      "Google / Ads": "Google Ads, mobile ads, and event or audience ingestion.",
      "Google / Analytics": "GA4 admin and reporting workflows.",
      "Google / Cloud": "GCP infrastructure, GKE, BigQuery, Vertex, and operations.",
      "Local / Web Services": "Weather, places, food, and local service helpers.",
      "Media / Devices": "Audio, video, images, TTS, cameras, and device control.",
      "Productivity / Messaging": "Notes, tasks, chat, email, and workspace tools.",
      "Solana / Blockchain": "Solana, wallets, trading, verification, ZK, and on-chain agents.",
      "Utilities": "General local tools and everyday agent operations."
    };
    const search = document.getElementById("search");
    const category = document.getElementById("category");
    const sort = document.getElementById("sort");
    const grid = document.getElementById("grid");
    const map = document.getElementById("map");
    const stats = document.getElementById("stats");
    const empty = document.getElementById("empty");
    const visibleCount = document.getElementById("visibleCount");
    const scannerLink = document.getElementById("scannerLink");
    const scannerOpsLink = document.getElementById("scannerOpsLink");
    const creatorName = document.getElementById("creatorName");
    const creatorResources = document.getElementById("creatorResources");
    const creatorPurpose = document.getElementById("creatorPurpose");
    const creatorOutput = document.getElementById("creatorOutput");
    const copyCreator = document.getElementById("copyCreator");
    const merchantWallet = document.getElementById("merchantWallet");
    const paymentNetwork = document.getElementById("paymentNetwork");
    const offchainCheckout = document.getElementById("offchainCheckout");
    const paymentStatus = document.getElementById("paymentStatus");
    const paymentBackdrop = document.getElementById("paymentBackdrop");
    const closePayment = document.getElementById("closePayment");
    const paymentTitle = document.getElementById("paymentTitle");
    const paymentSubtitle = document.getElementById("paymentSubtitle");
    const paymentBody = document.getElementById("paymentBody");
    const paymentSettings = loadPaymentSettings();

    if (window.location.protocol === "file:") {
      scannerLink.setAttribute("href", "scanner/index.html");
      scannerOpsLink.setAttribute("href", "scanner/index.html");
    }

    merchantWallet.value = paymentSettings.wallet;
    paymentNetwork.value = paymentSettings.network;
    offchainCheckout.value = paymentSettings.offchainCheckoutUrl;

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/\x60/g, "&#96;");
    }

    function loadPaymentSettings() {
      const defaults = paymentDefaults.defaults || {};
      const saved = safeJsonParse(localStorage.getItem("skillhub-payment-settings")) || {};
      return {
        merchantName: saved.merchantName || defaults.merchant?.name || "Skill Hub",
        wallet: saved.wallet || defaults.merchant?.wallet || "",
        network: saved.network || defaults.network || "mainnet",
        rpcUrl: saved.rpcUrl || defaults.rpcUrl || "",
        allowedMints: Array.isArray(saved.allowedMints) ? saved.allowedMints : (defaults.allowedMints || []),
        offchainCheckoutUrl: saved.offchainCheckoutUrl || defaults.offchainCheckoutUrl || "",
      };
    }

    function safeJsonParse(value) {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    }

    function savePaymentSettings() {
      paymentSettings.wallet = merchantWallet.value.trim();
      paymentSettings.network = paymentNetwork.value;
      paymentSettings.offchainCheckoutUrl = offchainCheckout.value.trim();
      localStorage.setItem("skillhub-payment-settings", JSON.stringify(paymentSettings));
      renderPaymentStatus();
    }

    function renderPaymentStatus() {
      const walletOk = isLikelySolanaAddress(paymentSettings.wallet);
      const offchainOk = Boolean(paymentSettings.offchainCheckoutUrl);
      paymentStatus.innerHTML = [
        badge(walletOk ? "Solana payments active" : "Set wallet to activate Solana Pay", walletOk ? "green" : "amber"),
        badge(offchainOk ? "Off-chain checkout active" : "Off-chain optional", offchainOk ? "green" : ""),
        badge(\`Commerce Kit: \${paymentDefaults.commerceKit?.component || "PaymentButton"}\`, "green"),
      ].join("");
    }

    function badge(label, color = "") {
      return \`<span class="badge \${escapeAttr(color)}">\${escapeHtml(label)}</span>\`;
    }

    function isLikelySolanaAddress(value) {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || ""));
    }

    function buildSolanaPayUri(skill, amount) {
      const params = new URLSearchParams();
      const cleanAmount = Number(amount);
      if (Number.isFinite(cleanAmount) && cleanAmount > 0) params.set("amount", String(cleanAmount));
      params.set("label", paymentSettings.merchantName);
      params.set("message", \`Tip for \${skill.slug}\`);
      params.set("memo", \`skillhub:\${skill.slug}\`);
      return \`solana:\${paymentSettings.wallet}?\${params.toString()}\`;
    }

    function buildOffchainCheckoutUrl(skill) {
      if (!paymentSettings.offchainCheckoutUrl) return "";
      try {
        const url = new URL(paymentSettings.offchainCheckoutUrl, window.location.href);
        url.searchParams.set("skill", skill.slug);
        url.searchParams.set("source", "skillhub");
        return url.toString();
      } catch {
        return paymentSettings.offchainCheckoutUrl;
      }
    }

    function commerceKitSnippet(skill) {
      const wallet = paymentSettings.wallet || "your-wallet-address";
      const network = paymentSettings.network || "mainnet";
      return [
        'import { PaymentButton } from "@solana-commerce/kit";',
        "",
        "export function SkillCheckout() {",
        "  return (",
        "    <PaymentButton",
        "      config={{",
        \`        merchant: { name: "\${escapeJs(paymentSettings.merchantName)}", wallet: "\${escapeJs(wallet)}" },\`,
        '        mode: "tip",',
        \`        network: "\${escapeJs(network)}",\`,
        "        showQR: true",
        "      }}",
        "      onPaymentSuccess={(signature) => {",
        \`        console.log("Payment confirmed for \${escapeJs(skill.slug)}:", signature);\`,
        "      }}",
        "    />",
        "  );",
        "}",
      ].join("\\n");
    }

    function escapeJs(value) {
      return String(value).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\"');
    }

    function slugifySkillName(value) {
      return String(value || "new-skill")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "new-skill";
    }

    function renderCreatorPlan() {
      const slug = slugifySkillName(creatorName.value);
      const resources = creatorResources.value || "scripts,references";
      const purpose = creatorPurpose.value.trim() || "Describe the trigger, workflow, and expected output.";
      creatorOutput.value = [
        "Skill: " + slug,
        "Folder: " + slug,
        "Resources: " + resources,
        "",
        "Creator prompt:",
        "Use skill-creator to create or update " + slug + ". Purpose: " + purpose + " Include resources: " + resources + ".",
        "",
        "Install creator:",
        "npx github:Solizardking/skills install skill-creator",
        "",
        "Validate after edits:",
        "scripts/quick_validate.py <path-to-" + slug + ">"
      ].join("\\n");
    }

    function countsByCategory(items) {
      return items.reduce((acc, skill) => {
        acc[skill.category] = (acc[skill.category] || 0) + 1;
        return acc;
      }, {});
    }

    function filteredSkills() {
      const q = search.value.trim().toLowerCase();
      const selectedCategory = category.value;
      let filtered = skills.filter((skill) => {
        const haystack = \`\${skill.slug} \${skill.name} \${skill.description} \${skill.category}\`.toLowerCase();
        return (!q || haystack.includes(q)) && (!selectedCategory || skill.category === selectedCategory);
      });

      filtered = [...filtered].sort((a, b) => {
        if (sort.value === "name") return a.slug.localeCompare(b.slug);
        if (sort.value === "length") return b.description.length - a.description.length || a.slug.localeCompare(b.slug);
        return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.slug.localeCompare(b.slug);
      });

      return filtered;
    }

    function renderStats(items) {
      const allCounts = countsByCategory(skills);
      const largest = Object.entries(allCounts).sort((a, b) => b[1] - a[1])[0];
      stats.innerHTML = [
        ["Skills", skills.length],
        ["Visible", items.length],
        ["Categories", categoryOrder.length],
        ["Largest zone", largest ? \`\${largest[0]} · \${largest[1]}\` : "none"]
      ].map(([label, value]) => \`
        <div class="stat">
          <strong>\${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong>
          <span>\${escapeHtml(label)}</span>
        </div>
      \`).join("");
    }

    function renderMap(items) {
      const allCounts = countsByCategory(skills);
      const visibleCounts = countsByCategory(items);
      const max = Math.max(...Object.values(allCounts), 1);
      map.innerHTML = categoryOrder.map((label) => {
        const total = allCounts[label] || 0;
        const visible = visibleCounts[label] || 0;
        const selected = category.value === label;
        const rail = Math.max(6, Math.round((total / max) * 100));
        return \`
          <button class="map-card" type="button" data-category="\${escapeAttr(label)}" aria-pressed="\${selected ? "true" : "false"}">
            <span class="map-top">
              <span class="map-name">\${escapeHtml(label)}</span>
              <span class="map-count">\${formatNumber(visible)} / \${formatNumber(total)}</span>
            </span>
            <span class="rail" aria-hidden="true" style="--rail: \${rail}%"><span></span></span>
            <span class="map-desc">\${escapeHtml(categoryDescriptions[label] || "Repo-local skills.")}</span>
          </button>
        \`;
      }).join("");

      map.querySelectorAll(".map-card").forEach((card) => {
        card.addEventListener("click", () => {
          category.value = category.value === card.dataset.category ? "" : card.dataset.category;
          render();
        });
      });
    }

    function renderGrid(items) {
      grid.innerHTML = items.map((skill, index) => \`
        <article class="skill-card" style="animation-delay: \${Math.min(index, 24) * 18}ms">
          <div>
            <span class="path">\${escapeHtml(skill.category)}</span>
            <h2>\${escapeHtml(skill.slug)}</h2>
            <p>\${escapeHtml(skill.description)}</p>
          </div>
          <div class="meta">
            <span class="category">\${escapeHtml(skill.name)}</span>
            <span class="card-actions">
              <button class="copy-action" type="button" data-install="\${escapeAttr(installCommand(skill.slug))}">Install</button>
              <button class="open-action" type="button" data-tip="\${escapeAttr(skill.slug)}">Tip</button>
              <a class="open-action" href="/api/skills/\${encodeSkillPath(skill.slug)}/SKILL.md">Open</a>
            </span>
          </div>
        </article>
      \`).join("");
    }

    function openPaymentModal(skill) {
      const walletOk = isLikelySolanaAddress(paymentSettings.wallet);
      const defaultAmount = paymentSettings.network === "devnet" ? "0.01" : "0.05";
      const payUri = walletOk ? buildSolanaPayUri(skill, defaultAmount) : "";
      const offchainUrl = buildOffchainCheckoutUrl(skill);
      const snippet = commerceKitSnippet(skill);

      paymentTitle.textContent = \`Monetize \${skill.slug}\`;
      paymentSubtitle.textContent = "Use Solana Pay now, route off-chain checkout, or copy the Commerce Kit React button.";
      paymentBody.innerHTML = \`
        <div class="payment-grid">
          <div class="payment-box">
            <strong>On-chain Solana</strong>
            <p>\${walletOk ? "Wallet-ready Solana Pay URI for tips and donations." : "Set a valid Solana merchant wallet in the monetization panel first."}</p>
            <p><code>\${escapeHtml(paymentSettings.wallet || "no wallet configured")}</code></p>
            <div class="card-actions">
              \${walletOk ? \`<a class="copy-action" href="\${escapeAttr(payUri)}">Open wallet</a><button class="open-action" type="button" data-copy="\${escapeAttr(payUri)}">Copy URI</button>\` : ""}
            </div>
          </div>
          <div class="payment-box">
            <strong>Off-chain checkout</strong>
            <p>\${offchainUrl ? "Use this for invoices, subscriptions, cards, or account provisioning." : "Add an off-chain checkout URL in the monetization panel to enable this path."}</p>
            <p><code>\${escapeHtml(offchainUrl || "not configured")}</code></p>
            <div class="card-actions">
              \${offchainUrl ? \`<a class="open-action" href="\${escapeAttr(offchainUrl)}" target="_blank" rel="noreferrer">Open checkout</a><button class="open-action" type="button" data-copy="\${escapeAttr(offchainUrl)}">Copy URL</button>\` : ""}
            </div>
          </div>
        </div>
        <div class="payment-box">
          <strong>Commerce Kit PaymentButton</strong>
          <p>React apps can install <code>@solana-commerce/kit</code> and use this drop-in button for wallet connection, token selection, QR flow, and confirmed transaction callbacks.</p>
          <pre class="payment-code"><code>\${escapeHtml(snippet)}</code></pre>
          <div class="card-actions">
            <button class="copy-action" type="button" data-copy="\${escapeAttr(snippet)}">Copy React snippet</button>
            <a class="open-action" href="/integrations/commerce-kit-payment-button.tsx">Open integration file</a>
            <a class="open-action" href="/api/monetization.json">Open payment registry</a>
          </div>
        </div>
      \`;
      paymentBackdrop.classList.add("open");
      paymentBackdrop.setAttribute("aria-hidden", "false");
    }

    function closePaymentModal() {
      paymentBackdrop.classList.remove("open");
      paymentBackdrop.setAttribute("aria-hidden", "true");
    }

    function render() {
      const filtered = filteredSkills();
      visibleCount.textContent = \`\${formatNumber(filtered.length)} of \${formatNumber(skills.length)} skills\`;

      renderStats(filtered);
      renderMap(filtered);
      renderGrid(filtered);
      renderPaymentStatus();
      empty.style.display = filtered.length ? "none" : "block";
    }

    function encodeSkillPath(slug) {
      return slug.split("/").map(encodeURIComponent).join("/");
    }

    function installCommand(slug) {
      return \`npx github:Solizardking/skills install \${slug}\`;
    }

    async function copyText(value) {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
    }

    function formatNumber(value) {
      return new Intl.NumberFormat().format(Number(value || 0));
    }

    grid.addEventListener("click", (event) => {
      const installButton = event.target.closest("[data-install]");
      if (installButton) {
        copyText(installButton.dataset.install);
        return;
      }
      const tipButton = event.target.closest("[data-tip]");
      if (tipButton) {
        const skill = skills.find((item) => item.slug === tipButton.dataset.tip);
        if (skill) openPaymentModal(skill);
      }
    });

    paymentBody.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy]");
      if (copyButton) copyText(copyButton.dataset.copy);
    });

    closePayment.addEventListener("click", closePaymentModal);
    paymentBackdrop.addEventListener("click", (event) => {
      if (event.target === paymentBackdrop) closePaymentModal();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePaymentModal();
    });
    merchantWallet.addEventListener("input", savePaymentSettings);
    paymentNetwork.addEventListener("change", savePaymentSettings);
    offchainCheckout.addEventListener("input", savePaymentSettings);
    creatorName.addEventListener("input", renderCreatorPlan);
    creatorResources.addEventListener("change", renderCreatorPlan);
    creatorPurpose.addEventListener("input", renderCreatorPlan);
    copyCreator.addEventListener("click", () => copyText(creatorOutput.value));
    search.addEventListener("input", render);
    category.addEventListener("change", render);
    sort.addEventListener("change", render);
    renderCreatorPlan();
    render();
  </script>
</body>
</html>
`;
}

function renderFavicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#111715"/>
  <path d="M12 20h40M12 32h40M12 44h40" stroke="#39d7a6" stroke-width="6" stroke-linecap="round"/>
  <path d="M22 12v40M42 12v40" stroke="#e8b44e" stroke-width="6" stroke-linecap="round"/>
</svg>
`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function checkOutputs(outputs) {
  const mismatches = [];
  const generatedFiles = new Set(outputs.keys());

  for (const [relativePath, expected] of outputs) {
    const absolutePath = path.join(ROOT, relativePath);
    let actual;
    try {
      actual = await readFile(absolutePath);
    } catch {
      mismatches.push(relativePath);
      continue;
    }
    const expectedBuffer = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
    if (!actual.equals(expectedBuffer)) mismatches.push(relativePath);
  }

  for (const file of await listFiles(path.join(ROOT, "public"))) {
    const relativePath = path.relative(ROOT, file);
    if (!generatedFiles.has(relativePath)) mismatches.push(relativePath);
  }

  if (mismatches.length > 0) {
    console.error("Catalog outputs are stale:");
    for (const file of mismatches.slice(0, 40)) {
      console.error(`  - ${file}`);
    }
    if (mismatches.length > 40) {
      console.error(`  ... and ${mismatches.length - 40} more`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Catalog outputs are up to date.");
}

async function writeOutputs(outputs) {
  await rm(path.join(ROOT, "public"), { recursive: true, force: true });

  for (const [relativePath, content] of outputs) {
    const absolutePath = path.join(ROOT, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
}

async function listFiles(dir) {
  if (!existsSync(dir)) return [];

  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath));
    } else {
      files.push(absolutePath);
    }
  }
  return files;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
