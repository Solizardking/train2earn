#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCANNER_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ROOT = path.resolve(SCANNER_ROOT, "..");

const PUBLIC_RESOURCE_DIRS = ["references", "scripts", "assets", "agents"];
const PUBLIC_ROOT_RESOURCE_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml"]);
const PUBLIC_COPY_EXCLUDES = new Set([".DS_Store", ".git", "__pycache__", "node_modules"]);
const PUBLIC_COPY_EXCLUDED_EXTENSIONS = new Set([".pyc", ".pyo"]);
const TEXT_EXTENSIONS = new Set([
  ".bash",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
  ".zsh",
]);

const IGNORED_TOP_LEVEL_DIRS = new Set([
  ".git",
  ".vercel",
  "assets",
  "bin",
  "node_modules",
  "onchain",
  "public",
  "scanner",
  "scripts",
]);

const IGNORED_NESTED_DIRS = new Set([
  ".git",
  ".lake",
  ".vercel",
  "node_modules",
  "target",
]);

const CATEGORY_ORDER = [
  "Dev Tools / Agents",
  "Google / Ads",
  "Google / Analytics",
  "Google / Cloud",
  "Local / Web Services",
  "Media / Devices",
  "Productivity / Messaging",
  "Solana / Blockchain",
  "Utilities",
];

const CATEGORY_OVERRIDES = new Map([
  ["ask-mcp", "Solana / Blockchain"],
  ["compressed-pda", "Solana / Blockchain"],
  ["compressed-token", "Solana / Blockchain"],
  ["solana-redpill-verifier", "Solana / Blockchain"],
  ["solana-rent-free-dev", "Solana / Blockchain"],
  ["testing", "Solana / Blockchain"],
  ["zk", "Solana / Blockchain"],
  ["zkrouter", "Solana / Blockchain"],
]);

const SEVERITY_ORDER = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITY_WEIGHTS = {
  INFO: 0,
  LOW: 2,
  MEDIUM: 6,
  HIGH: 14,
  CRITICAL: 32,
};

const RULES = [
  {
    id: "VETTER_AGENT_MEMORY_ACCESS",
    severity: "CRITICAL",
    category: "data_exfiltration",
    message: "Reads or references agent memory or identity files.",
    pattern: /\b(?:cat|grep|rg|sed|open|readFile|read_text|Path|fs\.read)\b.*(?:MEMORY\.md|USER\.md|SOUL\.md|IDENTITY\.md|\.claude\/(?:memory|settings)|claude_desktop_config\.json)/i,
  },
  {
    id: "VETTER_BROWSER_DATA_ACCESS",
    severity: "CRITICAL",
    category: "data_exfiltration",
    message: "Touches browser profile, cookie, or session storage paths.",
    pattern: /\b(?:cat|grep|rg|sed|open|readFile|read_text|Path|fs\.read)\b.*(?:Library\/Application Support\/(?:Google\/Chrome|BraveSoftware)|\.mozilla\/firefox|Login Data|Cookies|session_?storage|local_?storage)/i,
  },
  {
    id: "VETTER_SYSTEM_FILE_WRITE",
    severity: "CRITICAL",
    category: "unauthorized_tool_use",
    message: "Writes to system directories outside the skill workspace.",
    pattern: /(?:open\s*\([^)]*['"]\/(?:etc|usr|var|opt)\/|writeFile\s*\([^)]*['"]\/(?:etc|usr|var|opt)\/|>\s*\/(?:etc|usr|var|opt)\/|tee\s+\/(?:etc|usr|var|opt)\/)/i,
    exclude: /(?:\/tmp\/|read|['"]r['"])/i,
  },
  {
    id: "VETTER_CURL_WGET_EXTERNAL",
    severity: "HIGH",
    category: "data_exfiltration",
    message: "Uses curl or wget against an external URL.",
    pattern: /\b(?:curl|wget)\b[^\n]*(?:https?:\/\/[^\s)"'`]+)/i,
    exclude: /(?:localhost|127\.0\.0\.1|api\.github\.com|raw\.githubusercontent\.com|pypi\.org|npmjs\.com)/i,
  },
  {
    id: "VETTER_CREDENTIAL_REQUEST",
    severity: "HIGH",
    category: "hardcoded_secrets",
    message: "Prompts for credentials or secrets directly.",
    pattern: /(?:input\s*\(.*(?:password|token|api.?key|secret|credential)|getpass\.getpass|prompt.*(?:enter|provide|give).*(?:api.?key|token|password|secret))/i,
  },
  {
    id: "VETTER_IP_ADDRESS_CALL",
    severity: "HIGH",
    category: "data_exfiltration",
    message: "Uses a public IP address in a network URL.",
    pattern: /https?:\/\/(?!(?:127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[0-1])))(?:\d{1,3}\.){3}\d{1,3}/i,
  },
  {
    id: "VETTER_RUNTIME_INSTALL",
    severity: "HIGH",
    category: "unauthorized_tool_use",
    message: "Installs packages at runtime rather than relying on declared dependencies.",
    pattern: /\b(?:pip3?|uv\s+pip|npm|pnpm|yarn|bun|cargo|gem)\s+(?:install|add)\b/i,
    exclude: /(?:package\.json|requirements\.txt|pyproject\.toml|README|#\s*dev only|#\s*optional)/i,
  },
  {
    id: "VETTER_EVAL_EXEC",
    severity: "HIGH",
    category: "command_injection",
    message: "Uses eval or exec style code execution.",
    pattern: /(?<!functions\.)\b(?:eval|exec)\s*\(/i,
  },
  {
    id: "VETTER_SUDO_REQUEST",
    severity: "HIGH",
    category: "unauthorized_tool_use",
    message: "Requests sudo or elevated local privileges.",
    pattern: /\bsudo\b/i,
    exclude: /^\s*(?:#|\/\/)/,
  },
  {
    id: "VETTER_SECRET_PATH_ACCESS",
    severity: "MEDIUM",
    category: "data_exfiltration",
    message: "References local secret or credential paths.",
    pattern: /(?:~\/\.ssh|\/\.ssh\/|~\/\.aws|\.aws\/credentials|~\/\.config|\/etc\/passwd)/i,
  },
  {
    id: "VETTER_SUBPROCESS_SHELL",
    severity: "MEDIUM",
    category: "command_injection",
    message: "Runs subprocess commands through a shell.",
    pattern: /subprocess\.(?:run|Popen|call|check_output)\s*\([^)]*shell\s*=\s*True/i,
  },
  {
    id: "VETTER_BASE64_DECODE",
    severity: "MEDIUM",
    category: "obfuscation",
    message: "Decodes base64 content, which can hide payloads.",
    pattern: /(?:base64\s+-d|base64\.b64decode|Buffer\.from\([^)]*,\s*['"]base64['"])/i,
  },
  {
    id: "VETTER_ENV_SECRET_ACCESS",
    severity: "LOW",
    category: "hardcoded_secrets",
    message: "Reads secret-like environment variables.",
    pattern: /(?:process\.env\.[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)|os\.environ\[[^\]]*(?:KEY|TOKEN|SECRET|PASSWORD))/i,
  },
  {
    id: "VETTER_ONCHAIN_WRITE_SURFACE",
    severity: "INFO",
    category: "onchain_surface",
    message: "Mentions transaction signing, simulation, deployment, or mainnet/devnet behavior.",
    pattern: /(?:sendTransaction|signTransaction|simulateTransaction|wallet signature|anchor deploy|solana transfer|\bmainnet\b|\bdevnet\b)/i,
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || DEFAULT_ROOT);
  const mode = args.allLocal ? "all-local" : "canonical";
  const outputPath = path.resolve(args.output || path.join(SCANNER_ROOT, "results", "scan-results.json"));
  const publicDataPath = path.resolve(args.publicData || path.join(SCANNER_ROOT, "public", "scan-data.js"));
  const summaryPath = path.resolve(args.summary || path.join(SCANNER_ROOT, "results", "summary.md"));

  const catalog = mode === "all-local" ? await collectLocalCatalog(root) : await loadCanonicalCatalog(root);
  const localSkillCount = await countLocalSkills(root);
  const registry = await readJsonIfExists(path.join(root, "public", "api", "verification.json"));
  const registryRootValid = registry ? computeMerkleRoot((registry.skills || []).map((entry) => entry.merkleLeaf)) === registry.merkleRoot : false;
  const registryBySlug = new Map((registry?.skills || []).map((entry) => [entry.slug, entry]));
  const publishPlan = await readJsonIfExists(path.join(root, "onchain", "publish-plan.json"));
  const publishReceipt = await readJsonIfExists(path.join(root, "onchain", "publish-receipt.json"));
  const installMetrics = await readJsonIfExists(path.join(SCANNER_ROOT, "data", "install-metrics.json"));

  const skills = [];
  for (const skill of catalog) {
    skills.push(await scanSkill({
      root,
      skill,
      registry,
      registryBySlug,
      registryRootValid,
      publishPlan,
      publishReceipt,
      installMetrics,
    }));
  }

  const results = {
    schemaVersion: "skill-scanner-results/v1",
    scanner: {
      name: "local-skill-scanner",
      mode,
      root,
      rules: RULES.map(({ id, severity, category, message }) => ({ id, severity, category, message })),
    },
    scannedAt: new Date().toISOString(),
    source: {
      catalog: mode === "canonical" ? "catalog.json" : "local SKILL.md crawl",
      canonicalSkills: catalog.length,
      localSkills: localSkillCount,
      duplicatePublicSkillsExcluded: true,
    },
    onchain: summarizeOnchain(registry, publishPlan, publishReceipt, registryRootValid),
    summary: summarizeSkills(skills, localSkillCount),
    skills,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(publicDataPath), { recursive: true });
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(publicDataPath, renderPublicData(results));
  await writeFile(summaryPath, renderSummary(results));

  const summary = results.summary;
  console.log(`Scanned ${summary.totalSkills} skills (${summary.onChainSkills} on-chain, ${summary.offChainSkills} off-chain).`);
  console.log(`Verified ${summary.verification.verified}; changed ${summary.verification.changed}; missing ${summary.verification.missing}; errors ${summary.verification.error}.`);
  console.log(`Findings: ${summary.findings.total} total, ${summary.findings.bySeverity.CRITICAL} critical, ${summary.findings.bySeverity.HIGH} high.`);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)} and ${path.relative(process.cwd(), publicDataPath)}.`);

  if (args.check && (summary.verification.changed > 0 || summary.verification.error > 0 || summary.findings.bySeverity.CRITICAL > 0)) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all-local") {
      args.allLocal = true;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--root") {
      args.root = requireValue(argv, ++i, arg);
    } else if (arg === "--output") {
      args.output = requireValue(argv, ++i, arg);
    } else if (arg === "--public-data") {
      args.publicData = requireValue(argv, ++i, arg);
    } else if (arg === "--summary") {
      args.summary = requireValue(argv, ++i, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index] || argv[index].startsWith("--")) {
    throw new Error(`Expected a value after ${flag}`);
  }
  return argv[index];
}

function printHelp() {
  console.log(`Usage: node scanner/bin/scan-skills.mjs [options]

Options:
  --root <path>          Repository root. Defaults to parent of scanner/.
  --all-local            Crawl all local SKILL.md files instead of catalog.json.
  --output <path>        JSON output path.
  --public-data <path>   Browser data JS output path.
  --summary <path>       Markdown summary output path.
  --check                Exit nonzero on changed verification, scanner errors, or critical findings.
`);
}

async function loadCanonicalCatalog(root) {
  const catalogPath = path.join(root, "catalog.json");
  const raw = await readFile(catalogPath, "utf8");
  const catalog = JSON.parse(raw);
  if (!Array.isArray(catalog)) {
    throw new Error(`${catalogPath} must contain an array`);
  }
  return catalog.map(normalizeCatalogEntry);
}

async function collectLocalCatalog(root) {
  const existing = existsSync(path.join(root, "catalog.json"))
    ? new Map((await loadCanonicalCatalog(root)).map((skill) => [skill.slug, skill]))
    : new Map();
  const skills = [];
  await collectSkills(path.join(root, "skills"), [], existing, skills);
  skills.sort((a, b) => {
    const categoryDiff = categoryIndex(a.category) - categoryIndex(b.category);
    if (categoryDiff !== 0) return categoryDiff;
    return a.slug.localeCompare(b.slug);
  });
  return skills;
}

async function collectSkills(directory, segments, existing, skills) {
  const skillPath = path.join(directory, "SKILL.md");
  const ownsSkill = segments.length > 0 && existsSync(skillPath);

  if (ownsSkill) {
    const content = await readFile(skillPath, "utf8");
    const frontmatter = parseFrontmatter(content);
    const slug = segments.join("/");
    const existingEntry = existing.get(slug);
    const name = normalizeText(frontmatter.name) || existingEntry?.name || slug;
    const description = normalizeText(frontmatter.description) || existingEntry?.description || fallbackDescription(content);
    const category = existingEntry?.category || categorize({ slug, name, description });
    skills.push({ slug, name, description, category });

    // A skill directory is a leaf: don't descend into its own bundled
    // references/scripts/examples looking for further catalog entries.
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (segments.length === 0 && IGNORED_TOP_LEVEL_DIRS.has(entry.name)) continue;
    if (segments.length > 0 && IGNORED_NESTED_DIRS.has(entry.name)) continue;
    await collectSkills(path.join(directory, entry.name), [...segments, entry.name], existing, skills);
  }
}

async function countLocalSkills(root) {
  let count = 0;
  await countSkills(path.join(root, "skills"), []);
  return count;

  async function countSkills(directory, segments) {
    if (segments.length > 0 && existsSync(path.join(directory, "SKILL.md"))) {
      count += 1;
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (segments.length === 0 && IGNORED_TOP_LEVEL_DIRS.has(entry.name)) continue;
      if (segments.length > 0 && IGNORED_NESTED_DIRS.has(entry.name)) continue;
      await countSkills(path.join(directory, entry.name), [...segments, entry.name]);
    }
  }
}

function normalizeCatalogEntry(entry) {
  return {
    slug: String(entry.slug || "").trim(),
    name: normalizeText(entry.name) || String(entry.slug || "").trim(),
    description: normalizeText(entry.description) || "Agent skill.",
    category: normalizeText(entry.category) || "Utilities",
  };
}

async function scanSkill(context) {
  const { root, skill, registryBySlug, registryRootValid } = context;
  const skillDir = path.join(root, "skills", skill.slug);
  const skillPath = path.join(skillDir, "SKILL.md");
  const verificationPath = path.join(root, "public", "api", "skills", ...skill.slug.split("/"), "verification.json");
  const verificationDoc = await readJsonIfExists(verificationPath);
  const registryEntry = registryBySlug.get(skill.slug);
  const bundleFiles = await readBundleFiles(skillDir, verificationDoc);
  const findings = scanBundleFiles(bundleFiles);
  const localBundleHash = hashBundle(bundleFiles.filter((file) => !file.missing));
  const localMerkleLeaf = `sha256-${sha256(`${skill.slug}\0${localBundleHash}`)}`;
  const fileChecks = checkFileHashes(bundleFiles, verificationDoc);
  const verification = buildVerification({
    verificationDoc,
    registryEntry,
    registryRootValid,
    localBundleHash,
    localMerkleLeaf,
    fileChecks,
    context,
  });
  const stats = buildStats(bundleFiles);
  const surface = classifySurface(skill, bundleFiles);
  const install = buildInstallMetric(skill, context.installMetrics);
  const risk = buildRisk(findings);

  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    surface,
    path: path.relative(root, skillDir),
    skillPath: path.relative(root, skillPath),
    install,
    verification,
    risk,
    stats,
    findings,
  };
}

async function readBundleFiles(skillDir, verificationDoc) {
  if (verificationDoc?.files?.length) {
    const files = [];
    for (const file of verificationDoc.files) {
      const absolutePath = path.join(skillDir, file.path);
      if (!existsSync(absolutePath)) {
        files.push({
          path: file.path,
          content: Buffer.alloc(0),
          bytes: 0,
          missing: true,
          expectedSha256: file.sha256,
        });
        continue;
      }
      const content = await readFile(absolutePath);
      files.push({
        path: file.path,
        content,
        bytes: content.byteLength,
        missing: false,
        expectedSha256: file.sha256,
      });
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  if (!existsSync(skillDir)) return [];
  return collectBundleFiles(skillDir);
}

async function collectBundleFiles(skillDir) {
  const files = [];
  const skillPath = path.join(skillDir, "SKILL.md");
  if (existsSync(skillPath)) {
    files.push({ path: "SKILL.md", content: await readFile(skillPath), missing: false });
  }

  const entries = await readdir(skillDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === "SKILL.md") continue;
    if (entry.name === "metadata.json" || entry.name === "verification.json") continue;
    if (entry.name.startsWith(".")) continue;
    if (!PUBLIC_ROOT_RESOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const content = await readFile(path.join(skillDir, entry.name));
    files.push({ path: entry.name, content, missing: false });
  }

  for (const resourceDir of PUBLIC_RESOURCE_DIRS) {
    const absoluteDir = path.join(skillDir, resourceDir);
    if (!existsSync(absoluteDir)) continue;
    await addResourceFiles(files, absoluteDir, resourceDir);
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function addResourceFiles(files, absoluteDir, prefix) {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || PUBLIC_COPY_EXCLUDES.has(entry.name)) continue;
    const absolutePath = path.join(absoluteDir, entry.name);
    const publicPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await addResourceFiles(files, absolutePath, publicPath);
    } else if (entry.isFile() && !PUBLIC_COPY_EXCLUDED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const content = await readFile(absolutePath);
      files.push({ path: publicPath, content, missing: false });
    }
  }
}

function scanBundleFiles(bundleFiles) {
  const findings = [];
  for (const file of bundleFiles) {
    if (file.missing || !isTextFile(file.path, file.content)) continue;
    const text = file.content.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      for (const rule of RULES) {
        if (!rule.pattern.test(line)) continue;
        if (rule.exclude?.test(line)) continue;
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          category: rule.category,
          message: rule.message,
          file: file.path,
          line: index + 1,
          excerpt: trimExcerpt(line),
        });
      }
    }
  }
  return findings;
}

function checkFileHashes(bundleFiles, verificationDoc) {
  const expected = new Map((verificationDoc?.files || []).map((file) => [file.path, file]));
  const checks = [];
  for (const file of bundleFiles) {
    const localSha256 = file.missing ? null : `sha256-${sha256(file.content)}`;
    const expectedSha256 = file.expectedSha256 || expected.get(file.path)?.sha256 || null;
    checks.push({
      path: file.path,
      status: file.missing ? "missing" : expectedSha256 && localSha256 !== expectedSha256 ? "changed" : "verified",
      bytes: file.bytes ?? file.content?.byteLength ?? 0,
      expectedSha256,
      localSha256,
    });
  }
  return checks;
}

function buildVerification({ verificationDoc, registryEntry, registryRootValid, localBundleHash, localMerkleLeaf, fileChecks, context }) {
  if (verificationDoc?.error) {
    return {
      status: "error",
      method: "sha256 bundle hash plus registry merkle leaf",
      error: verificationDoc.error,
      path: verificationDoc.path || null,
      checks: {
        verificationFile: false,
        fileHashes: false,
        bundleHash: false,
        merkleLeaf: false,
        registryMembership: Boolean(registryEntry),
        registryRoot: registryRootValid,
        onchainAnchor: anchorState(context),
      },
      localBundleHash,
      localMerkleLeaf,
      fileCount: fileChecks.length,
      changedFiles: fileChecks.length,
      changedFileSamples: fileChecks.slice(0, 8),
    };
  }

  if (!verificationDoc) {
    return {
      status: "missing",
      method: "sha256 bundle hash plus registry merkle leaf",
      checks: {
        verificationFile: false,
        fileHashes: false,
        bundleHash: false,
        merkleLeaf: false,
        registryMembership: Boolean(registryEntry),
        registryRoot: registryRootValid,
        onchainAnchor: anchorState(context),
      },
      localBundleHash,
      localMerkleLeaf,
      fileCount: fileChecks.length,
      changedFiles: fileChecks.filter((check) => check.status !== "verified").length,
    };
  }

  const expectedFiles = Array.isArray(verificationDoc.files) ? verificationDoc.files : [];
  const fileHashesOk = fileChecks.length === expectedFiles.length && fileChecks.every((check) => check.status === "verified");
  const bundleHashOk = localBundleHash === verificationDoc.bundleHash;
  const merkleLeafOk = localMerkleLeaf === verificationDoc.merkleLeaf;
  const registryMembershipOk = Boolean(registryEntry && registryEntry.merkleLeaf === verificationDoc.merkleLeaf);
  const ok = fileHashesOk && bundleHashOk && merkleLeafOk && registryMembershipOk && registryRootValid;
  const changedFiles = fileChecks.filter((check) => check.status !== "verified");

  return {
    status: ok ? "verified" : "changed",
    method: "sha256 file hashes, deterministic bundle hash, merkle leaf, and registry root",
    checks: {
      verificationFile: true,
      fileHashes: fileHashesOk,
      bundleHash: bundleHashOk,
      merkleLeaf: merkleLeafOk,
      registryMembership: registryMembershipOk,
      registryRoot: registryRootValid,
      onchainAnchor: anchorState(context),
    },
    bundleHash: verificationDoc.bundleHash,
    localBundleHash,
    merkleLeaf: verificationDoc.merkleLeaf,
    localMerkleLeaf,
    fileCount: expectedFiles.length,
    localFileCount: fileChecks.length,
    changedFiles: changedFiles.length,
    changedFileSamples: changedFiles.slice(0, 8),
    registry: verificationDoc.registry,
    solana: verificationDoc.solana || null,
  };
}

function buildStats(bundleFiles) {
  let bytes = 0;
  let lines = 0;
  let textFiles = 0;
  let scriptFiles = 0;
  let referenceFiles = 0;
  let assetFiles = 0;

  for (const file of bundleFiles) {
    const size = file.bytes ?? file.content?.byteLength ?? 0;
    bytes += size;
    if (isTextFile(file.path, file.content)) {
      textFiles += 1;
      lines += file.content.toString("utf8").split(/\r?\n/).length;
    }
    if (file.path.startsWith("scripts/")) scriptFiles += 1;
    if (file.path.startsWith("references/")) referenceFiles += 1;
    if (file.path.startsWith("assets/")) assetFiles += 1;
  }

  return {
    filesScanned: bundleFiles.length,
    textFiles,
    scriptFiles,
    referenceFiles,
    assetFiles,
    bytesScanned: bytes,
    lineCount: lines,
  };
}

function classifySurface(skill, bundleFiles) {
  const text = `${skill.slug} ${skill.name} ${skill.description} ${skill.category}`.toLowerCase();
  const bundleText = bundleFiles
    .filter((file) => !file.missing && isTextFile(file.path, file.content))
    .slice(0, 8)
    .map((file) => file.content.toString("utf8").slice(0, 12000).toLowerCase())
    .join("\n");
  const combined = `${text}\n${bundleText}`;
  const onchain = /\b(solana|blockchain|wallet|token|anchor|pda|program|mainnet|devnet|transaction|signature|arweave|merkle|onchain|on-chain|zk|dflow|kalshi|pump|vulcan|imperial|helius|phantom|jupiter|okx)\b/.test(combined);
  const chain = /\bsolana|svm|anchor|pda|spl\b/.test(combined) ? "solana" : onchain ? "mixed" : null;
  return {
    type: onchain ? "on-chain" : "off-chain",
    chain,
    reason: onchain ? "Matched blockchain, wallet, transaction, or registry language." : "No blockchain execution or registry surface detected.",
  };
}

function buildInstallMetric(skill, installMetrics) {
  const globalSource = installMetrics?.source || "not tracked locally";
  const metric = installMetrics?.skills?.[skill.slug] || null;
  const installs = Number.isFinite(metric?.installs) ? metric.installs : null;
  return {
    command: `npx github:Solizardking/skills install ${skill.slug}`,
    installs,
    status: installs === null ? "unknown" : "known",
    source: metric?.source || globalSource,
    updatedAt: metric?.updatedAt || installMetrics?.updatedAt || null,
    note: installs === null ? "No local install telemetry file was found for this skill." : null,
  };
}

function buildRisk(findings) {
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map((severity) => [severity, 0]));
  let score = 0;
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    score += SEVERITY_WEIGHTS[finding.severity] || 0;
  }
  const maxSeverity = [...SEVERITY_ORDER].reverse().find((severity) => bySeverity[severity] > 0) || "INFO";
  const cappedScore = Math.min(100, score);
  let level = "low";
  let status = "pass";
  if (bySeverity.CRITICAL > 0) {
    level = "critical";
    status = "required";
  } else if (bySeverity.HIGH > 1 || cappedScore >= 28) {
    level = "high";
    status = "review";
  } else if (bySeverity.HIGH > 0 || bySeverity.MEDIUM > 2 || cappedScore >= 12) {
    level = "medium";
    status = "review";
  }

  return {
    status,
    level,
    score: cappedScore,
    maxSeverity,
    findingsCount: findings.length,
    bySeverity,
  };
}

function summarizeSkills(skills, localSkillCount) {
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map((severity) => [severity, 0]));
  const verification = { verified: 0, changed: 0, missing: 0, error: 0 };
  const risk = { pass: 0, review: 0, required: 0 };
  const categories = {};
  let onChainSkills = 0;
  let knownInstallSkills = 0;
  let totalKnownInstalls = 0;

  for (const skill of skills) {
    verification[skill.verification.status] = (verification[skill.verification.status] || 0) + 1;
    risk[skill.risk.status] = (risk[skill.risk.status] || 0) + 1;
    categories[skill.category] = (categories[skill.category] || 0) + 1;
    if (skill.surface.type === "on-chain") onChainSkills += 1;
    if (skill.install.installs !== null) {
      knownInstallSkills += 1;
      totalKnownInstalls += skill.install.installs;
    }
    for (const severity of SEVERITY_ORDER) {
      bySeverity[severity] += skill.risk.bySeverity[severity];
    }
  }

  return {
    totalSkills: skills.length,
    localSkills: localSkillCount,
    onChainSkills,
    offChainSkills: skills.length - onChainSkills,
    categories,
    verification,
    risk,
    findings: {
      total: Object.values(bySeverity).reduce((sum, count) => sum + count, 0),
      bySeverity,
    },
    installs: {
      knownSkillCount: knownInstallSkills,
      unknownSkillCount: skills.length - knownInstallSkills,
      totalKnownInstalls,
      source: knownInstallSkills > 0 ? "scanner/data/install-metrics.json" : "not tracked locally",
    },
  };
}

function summarizeOnchain(registry, publishPlan, publishReceipt, registryRootValid) {
  if (!registry) {
    return {
      status: "missing",
      anchorState: "missing-registry",
      registryRootValid: false,
    };
  }

  const anchor = publishReceipt?.solanaSignature ? "anchored" : publishPlan ? "planned" : registry.status || "anchor-ready";
  return {
    schemaVersion: registry.schemaVersion,
    chain: registry.chain,
    cluster: registry.cluster,
    status: registry.status,
    anchorState: anchor,
    totalSkills: registry.totalSkills,
    catalogHash: registry.catalogHash,
    merkleRoot: registry.merkleRoot,
    registryRootValid,
    registryProgramId: registry.solana?.registryProgramId || null,
    registryPda: registry.solana?.registryPda || null,
    authority: registry.solana?.authority || null,
    publishPlan: publishPlan ? "onchain/publish-plan.json" : null,
    publishReceipt: publishReceipt ? "onchain/publish-receipt.json" : null,
    solanaSignature: publishReceipt?.solanaSignature || null,
  };
}

function anchorState({ registry, publishPlan, publishReceipt }) {
  if (publishReceipt?.solanaSignature) return "anchored";
  if (publishPlan) return "planned";
  if (registry?.status) return registry.status;
  return "not-configured";
}

function hashBundle(bundleFiles) {
  const hash = createHash("sha256");
  hash.update("skill-bundle-v1\0");
  const sorted = [...bundleFiles].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

function computeMerkleRoot(leaves) {
  if (!leaves.length) return `sha256-${sha256("")}`;
  let level = leaves.map((leaf) => String(leaf).replace(/^sha256-/, ""));
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

function isTextFile(filePath, content = Buffer.alloc(0)) {
  if (TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  if (!content || content.length === 0) return false;
  const sample = content.subarray(0, Math.min(content.length, 512));
  return !sample.includes(0);
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

function fallbackDescription(content) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  return heading ? normalizeText(heading) : "Agent skill.";
}

function categorize(skill) {
  if (CATEGORY_OVERRIDES.has(skill.slug)) {
    return CATEGORY_OVERRIDES.get(skill.slug);
  }

  if (skill.slug.startsWith("google/ads/")) return "Google / Ads";
  if (skill.slug.startsWith("google/analytics/")) return "Google / Analytics";
  if (skill.slug.startsWith("google/cloud/")) return "Google / Cloud";

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

function categoryIndex(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

async function readJsonIfExists(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    return { error: String(error?.message || error), path: filePath };
  }
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function trimExcerpt(line) {
  return line.trim().replace(/\s+/g, " ").slice(0, 220);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function renderPublicData(results) {
  const data = JSON.stringify(results, null, 2).replace(/</g, "\\u003c");
  return `window.SKILL_SCAN_RESULTS = ${data};\n`;
}

function renderSummary(results) {
  const { summary, onchain } = results;
  const lines = [
    "# Skill Scanner Results",
    "",
    `Scanned at: ${results.scannedAt}`,
    "",
    `- Skills scanned: ${summary.totalSkills}`,
    `- Local skills available: ${summary.localSkills}`,
    `- On-chain skills: ${summary.onChainSkills}`,
    `- Off-chain skills: ${summary.offChainSkills}`,
    `- Verified skills: ${summary.verification.verified}`,
    `- Changed skills: ${summary.verification.changed}`,
    `- Missing verification: ${summary.verification.missing}`,
    `- Critical findings: ${summary.findings.bySeverity.CRITICAL}`,
    `- High findings: ${summary.findings.bySeverity.HIGH}`,
    `- Install telemetry source: ${summary.installs.source}`,
    "",
    "## On-Chain Registry",
    "",
    `- Status: ${onchain.status || "unknown"}`,
    `- Anchor state: ${onchain.anchorState || "unknown"}`,
    `- Registry root valid: ${onchain.registryRootValid ? "yes" : "no"}`,
    `- Merkle root: ${onchain.merkleRoot || "missing"}`,
    `- Catalog hash: ${onchain.catalogHash || "missing"}`,
    "",
    "## Skills Requiring Review",
    "",
  ];

  const reviewSkills = results.skills
    .filter((skill) => skill.risk.status !== "pass" || skill.verification.status !== "verified")
    .sort((a, b) => b.risk.score - a.risk.score)
    .slice(0, 40);

  if (!reviewSkills.length) {
    lines.push("No skills require review under the current scanner rules.");
  } else {
    for (const skill of reviewSkills) {
      lines.push(`- ${skill.slug}: ${skill.risk.level} risk, ${skill.findings.length} findings, verification ${skill.verification.status}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}`;
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
