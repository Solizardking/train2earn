/**
 * Shared scanner for ad-hoc skill uploads (upload → scan → on-chain pipeline).
 * Mirrors the static rule pass + bundle hashing used by scanner/bin/scan-skills.mjs.
 */

import { createHash } from "node:crypto";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".bash", ".css", ".go", ".html", ".java", ".js", ".json", ".jsx", ".kt",
  ".md", ".mjs", ".py", ".rs", ".sh", ".sql", ".swift", ".toml", ".ts",
  ".tsx", ".txt", ".yaml", ".yml", ".zsh",
]);

const SEVERITY_ORDER = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITY_WEIGHTS = {
  INFO: 0,
  LOW: 2,
  MEDIUM: 6,
  HIGH: 14,
  CRITICAL: 32,
};

export const VETTER_RULES = [
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

/**
 * @param {{ slug?: string, files: Array<{ path: string, content: string|Buffer, encoding?: string }> }} input
 */
export function scanUploadedSkill(input) {
  const files = normalizeFiles(input.files || []);
  const skillMd = files.find((f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md"));
  if (!skillMd) {
    return {
      ok: false,
      status: "invalid",
      error: "SKILL.md is required at the skill root.",
      findings: [],
      risk: emptyRisk(),
    };
  }

  const skillText = skillMd.content.toString("utf8");
  const frontmatter = parseFrontmatter(skillText);
  const name = normalizeText(frontmatter.name) || path.basename(input.slug || "skill");
  const description = normalizeText(frontmatter.description) || fallbackDescription(skillText);
  const slug = sanitizeSlug(input.slug || frontmatter.name || name);

  if (!slug) {
    return {
      ok: false,
      status: "invalid",
      error: "Could not derive a valid skill slug. Provide a slug or a `name` in SKILL.md frontmatter.",
      findings: [],
      risk: emptyRisk(),
    };
  }

  if (!frontmatter.name) {
    return {
      ok: false,
      status: "invalid",
      error: "SKILL.md frontmatter must include `name:`.",
      slug,
      findings: [],
      risk: emptyRisk(),
    };
  }

  const findings = scanBundleFiles(files);
  const fileRecords = files.map((file) => ({
    path: file.path,
    bytes: file.content.byteLength,
    sha256: `sha256-${sha256(file.content)}`,
  }));
  const bundleHash = hashBundle(files);
  const merkleLeaf = `sha256-${sha256(`${slug}\0${bundleHash}`)}`;
  const risk = buildRisk(findings);
  const blocked = risk.bySeverity.CRITICAL > 0;
  const caution = risk.bySeverity.HIGH > 0;

  return {
    ok: !blocked,
    status: blocked ? "blocked" : caution ? "caution" : "passed",
    slug,
    name,
    description,
    scannedAt: new Date().toISOString(),
    bundleHash,
    merkleLeaf,
    files: fileRecords,
    stats: {
      fileCount: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.content.byteLength, 0),
    },
    findings,
    risk,
    rules: VETTER_RULES.map(({ id, severity, category, message }) => ({ id, severity, category, message })),
    gate: {
      publishAllowed: !blocked,
      reason: blocked
        ? "Critical findings must be fixed before on-chain publish."
        : caution
          ? "High findings present — review before paying the publish fee."
          : "Scanner passed. Connect a wallet and pay the fee to publish on-chain.",
    },
  };
}

function normalizeFiles(files) {
  const out = [];
  for (const file of files) {
    if (!file?.path) continue;
    const cleanPath = String(file.path).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "");
    if (!cleanPath || cleanPath.includes("\0")) continue;
    let content;
    if (Buffer.isBuffer(file.content)) {
      content = file.content;
    } else if (file.encoding === "base64") {
      content = Buffer.from(String(file.content || ""), "base64");
    } else {
      content = Buffer.from(String(file.content ?? ""), "utf8");
    }
    out.push({ path: cleanPath, content });
  }
  // Deduplicate by path (last wins)
  const map = new Map(out.map((f) => [f.path, f]));
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function scanBundleFiles(bundleFiles) {
  const findings = [];
  for (const file of bundleFiles) {
    if (!isTextFile(file.path, file.content)) continue;
    const text = file.content.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      for (const rule of VETTER_RULES) {
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

function buildRisk(findings) {
  const bySeverity = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  let score = 0;
  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    score += SEVERITY_WEIGHTS[finding.severity] || 0;
  }
  let level = "clean";
  if (bySeverity.CRITICAL > 0) level = "critical";
  else if (bySeverity.HIGH > 0) level = "high";
  else if (bySeverity.MEDIUM > 0) level = "medium";
  else if (bySeverity.LOW > 0 || bySeverity.INFO > 0) level = "low";
  return { level, score, bySeverity, total: findings.length };
}

function emptyRisk() {
  return {
    level: "invalid",
    score: 0,
    bySeverity: Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0])),
    total: 0,
  };
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

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function trimExcerpt(line) {
  return line.trim().replace(/\s+/g, " ").slice(0, 220);
}

function sanitizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .replace(/\/-|-\//g, "/")
    .slice(0, 96);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
