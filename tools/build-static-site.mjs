import fs from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";

const workspace = process.cwd();
const outFile = path.join(workspace, "site", "public", "site-data.json");

const roots = [
  { id: "claude", label: "Claude Settings", rel: ".claude", sensitive: true },
  { id: "hf", label: "Hugging Face Cache", rel: ".hf", sensitive: true },
  { id: "configs", label: "Training Configs", rel: "configs" },
  { id: "dao", label: "DAO Registry", rel: "dao" },
  { id: "data", label: "Datasets", rel: "data" },
  { id: "dirs", label: "Dirs Created", rel: "dirs created" },
  { id: "docs", label: "Docs", rel: "docs" },
  { id: "echo", label: "Echo", rel: "echo" },
  { id: "etc", label: "Assets", rel: "etc" },
  { id: "memory", label: "Memory", rel: "memory" },
  { id: "modelKit", label: "Model Kit", rel: "model-kit" },
  { id: "nvidia", label: "NVIDIA Blueprints", rel: "nvidia" },
  { id: "ollama", label: "Ollama Models", rel: "ollama" },
  { id: "trainingData", label: "Training Data Staging", rel: "training-data" },
  { id: "readme", label: "Root README", rel: "README.md" },
];

const trainingStageMeta = [
  {
    id: "corpus",
    label: "Corpus",
    rel: "training-data/corpus",
    summary: "Page-grounded PDF chunks, repository chunks, and deterministic split labels.",
  },
  {
    id: "manifests",
    label: "Manifests",
    rel: "training-data/manifests",
    summary: "Source inventory, hashes, duplicate aliases, and extraction stats.",
  },
  {
    id: "sft",
    label: "SFT",
    rel: "training-data/sft",
    summary: "Chat fine-tuning rows in messages format with metadata-rich variants.",
  },
  {
    id: "preference",
    label: "Preference",
    rel: "training-data/preference",
    summary: "Chosen and rejected safety pairs for policy tuning.",
  },
  {
    id: "eval",
    label: "Eval",
    rel: "training-data/eval",
    summary: "Source-grounded prompts with expected answers for regression checks.",
  },
  {
    id: "reports",
    label: "Reports",
    rel: "training-data/reports",
    summary: "Machine-readable and human-readable quality reports.",
  },
  {
    id: "source_notes",
    label: "Source Notes",
    rel: "training-data/source_notes",
    summary: "Curated source cards for unique PDFs.",
  },
];

const binaryExts = new Set([
  ".arrow",
  ".faiss",
  ".gguf",
  ".jpeg",
  ".jpg",
  ".lock",
  ".mdb",
  ".png",
  ".pyc",
  ".svg",
  ".webp",
]);

const previewExts = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".toml",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const sensitiveKey = /(^|_|-)(secret|password|passphrase|private[-_]?key|mnemonic|bearer|authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|hf[-_]?token|openai[-_]?api[-_]?key|nvidia[-_]?api[-_]?key)(_|-|$)/i;
const secretValuePatterns = [
  /hf_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /nvapi-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function relPath(abs) {
  return path.relative(workspace, abs).split(path.sep).join("/");
}

function formatId(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase();
}

function redactString(value, max = 600) {
  let out = String(value);
  for (const pattern of secretValuePatterns) {
    out = out.replace(pattern, "[redacted]");
  }
  if (out.length > max) out = `${out.slice(0, max)}...`;
  return out;
}

function sanitize(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value).slice(0, 40)) {
      out[key] = sensitiveKey.test(key) ? "[redacted]" : sanitize(val, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return redactString(value);
  return value;
}

function previewText(text, max = 1200) {
  return redactString(text.replace(/\r/g, "").trim(), max);
}

function isLikelyText(ext, size) {
  return previewExts.has(ext) || (size < 256 * 1024 && !binaryExts.has(ext));
}

function shouldSkipDirectory(rel, name) {
  const normalized = rel.split(path.sep).join("/");
  if ([".git", "node_modules", "__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache"].includes(name)) {
    return "runtime or dependency directory";
  }
  if (normalized === ".hf/hub" || normalized === ".hf/datasets") return "Hugging Face cache directory";
  if (normalized.startsWith(".hf/xet/") && normalized.includes("/shard-cache")) return "Hugging Face Xet binary shard cache";
  return "";
}

function shouldSkipFile(name) {
  if (name === ".DS_Store") return "macOS metadata";
  return "";
}

function summarizePath(abs) {
  if (!fs.existsSync(abs)) return { bytes: 0, files: 0, dirs: 0 };
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) return { bytes: stat.size, files: 1, dirs: 0 };
  let bytes = 0;
  let files = 0;
  let dirs = 1;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(abs, entry.name);
    const childStat = summarizePath(child);
    bytes += childStat.bytes;
    files += childStat.files;
    dirs += childStat.dirs;
  }
  return { bytes, files, dirs };
}

function statKey(label) {
  const words = label.match(/[A-Za-z0-9]+/g) || [];
  return words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      return index === 0 ? normalized : `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    })
    .join("");
}

function readTrainingDataReadme() {
  const readmeAbs = path.join(workspace, "training-data", "README.md");
  const text = fs.existsSync(readmeAbs) ? fs.readFileSync(readmeAbs, "utf8") : "";
  const currentBuildText = text.split("## Current Build")[1]?.split("\n## ")[0] || "";
  const buildStats = {};
  const expectedOutputs = [];
  const contentPattern = /^- `([^`]+)`: (.+)$/gm;
  let contentMatch;

  while ((contentMatch = contentPattern.exec(text))) {
    const rel = contentMatch[1];
    const description = contentMatch[2].trim();
    const stage = rel.split("/")[0];
    const abs = path.join(workspace, "training-data", rel.replace("*.md", ""));
    const exists = rel.includes("*")
      ? fs.existsSync(path.dirname(abs)) && fs.readdirSync(path.dirname(abs)).some((name) => name.endsWith(path.extname(rel)))
      : fs.existsSync(abs);
    const summary = rel.includes("*") ? summarizePath(path.dirname(abs)) : summarizePath(abs);
    expectedOutputs.push({
      path: `training-data/${rel}`,
      rel,
      stage,
      description,
      exists,
      bytes: summary.bytes,
      presentFiles: summary.files,
    });
  }

  const generatedMatch = currentBuildText.match(/^- Generated at: `?([^`\n]+)`?/m);
  if (generatedMatch) buildStats.generatedAt = generatedMatch[1].trim();

  const statsPattern = /^- ([^:]+): `?([^`\n]+)`?$/gm;
  let statsMatch;
  while ((statsMatch = statsPattern.exec(currentBuildText))) {
    const key = statKey(statsMatch[1]);
    const raw = statsMatch[2].trim();
    const value = Number(raw.replace(/,/g, ""));
    buildStats[key] = Number.isFinite(value) ? value : raw;
  }

  const rowHints = {
    corpus: (buildStats.pdfChunks || 0) + (buildStats.repoChunks || 0),
    manifests: buildStats.uniquePdfSources || 0,
    sft: buildStats.sftRows || 0,
    preference: buildStats.preferenceRows || 0,
    eval: buildStats.evalRows || 0,
    reports: 2,
    source_notes: buildStats.uniquePdfSources || 0,
  };

  const directories = trainingStageMeta.map((stage) => {
    const abs = path.join(workspace, stage.rel);
    const summary = summarizePath(abs);
    return {
      id: stage.id,
      label: stage.label,
      path: stage.rel,
      exists: fs.existsSync(abs),
      ...summary,
    };
  });

  const stages = trainingStageMeta.map((stage) => {
    const directory = directories.find((item) => item.id === stage.id) || {};
    const expected = expectedOutputs.filter((item) => item.stage === stage.id);
    const expectedFiles =
      stage.id === "source_notes" && rowHints.source_notes
        ? rowHints.source_notes
        : stage.id === "reports"
          ? 2
          : expected.length || 1;
    return {
      ...stage,
      path: stage.rel,
      expectedFiles,
      presentFiles: directory.files || 0,
      bytes: directory.bytes || 0,
      rows: rowHints[stage.id] || 0,
      status: directory.files ? "present" : rowHints[stage.id] ? "manifested" : "empty",
    };
  });

  return {
    readmePath: "training-data/README.md",
    summary:
      "Source-grounded training data organized into corpus chunks, fine-tuning rows, preferences, evals, manifests, reports, and source notes.",
    buildStats,
    expectedOutputs,
    directories,
    stages,
  };
}

function wandbExportConfig() {
  const project = process.env.WANDB_PROJECT || "nemo-clawd-training-data";
  const entity = process.env.WANDB_ENTITY || "";
  const artifactName = process.env.WANDB_ARTIFACT_NAME || "nemo-clawd-training-data";
  const mode = process.env.WANDB_MODE || "online";
  const entityArg = entity ? ` --entity ${entity}` : "";
  return {
    project,
    entity,
    artifactName,
    mode,
    hasApiKey: Boolean(process.env.WANDB_API_KEY),
    dashboardUrl: entity ? `https://wandb.ai/${entity}/${project}` : "",
    syncCommand: `WANDB_PROJECT=${project} python3 tools/sync-wandb-training-data.py --site-data site/public/site-data.json --project ${project}${entityArg}`,
  };
}

function lineCount(abs) {
  return new Promise((resolve, reject) => {
    let lines = 0;
    let lastByte;
    const stream = createReadStream(abs);
    stream.on("data", (chunk) => {
      for (let i = 0; i < chunk.length; i += 1) {
        if (chunk[i] === 10) lines += 1;
      }
      lastByte = chunk[chunk.length - 1];
    });
    stream.on("end", () => resolve(lastByte === undefined ? 0 : lines + (lastByte === 10 ? 0 : 1)));
    stream.on("error", reject);
  });
}

async function jsonlSamples(abs) {
  const lines = await firstLines(abs, 3);
  const samples = [];
  const keys = new Set();
  for (const line of lines.slice(0, 3)) {
    try {
      const parsed = JSON.parse(line);
      Object.keys(parsed || {}).forEach((key) => keys.add(key));
      samples.push(sanitize(parsed));
    } catch {
      samples.push(previewText(line, 300));
    }
  }
  return { samples, sampleKeys: [...keys] };
}

function firstLines(abs, limit) {
  return new Promise((resolve, reject) => {
    const lines = [];
    let buffer = "";
    let settled = false;
    const stream = createReadStream(abs, { encoding: "utf8", highWaterMark: 64 * 1024 });
    const finish = () => {
      if (settled) return;
      settled = true;
      if (buffer.trim()) lines.push(buffer);
      resolve(lines.slice(0, limit));
      stream.destroy();
    };
    stream.on("data", (chunk) => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || "";
      for (const part of parts) {
        if (part.trim()) lines.push(part);
        if (lines.length >= limit) finish();
      }
    });
    stream.on("end", finish);
    stream.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function markdownSummary(text) {
  const headings = text
    .split(/\r?\n/)
    .filter((line) => /^#{1,3}\s+/.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim());
  const title = headings[0] || "";
  const body = text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^[-#`|<>{}]/.test(line.trim()))
    .join(" ")
    .replace(/\s+/g, " ");
  return { title, headings, excerpt: previewText(body, 700) };
}

function yamlSummary(text) {
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+):/);
    if (match && !keys.includes(match[1])) keys.push(match[1]);
    if (keys.length >= 12) break;
  }
  return { keys, excerpt: previewText(text, 700) };
}

function jsonSummary(text) {
  try {
    const parsed = JSON.parse(text);
    const safe = sanitize(parsed);
    if (Array.isArray(parsed)) {
      return { keys: [], arrayLength: parsed.length, preview: safe.slice(0, 4) };
    }
    return { keys: Object.keys(parsed).slice(0, 20), preview: safe };
  } catch {
    return { keys: [], preview: previewText(text, 700) };
  }
}

async function summarizeFile(abs, root) {
  const stat = fs.statSync(abs);
  const relative = relPath(abs);
  const ext = path.extname(abs).toLowerCase();
  const base = path.basename(abs);
  const entry = {
    id: formatId(relative),
    rootId: root.id,
    rootLabel: root.label,
    path: relative,
    name: base,
    ext: ext || "(none)",
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    kind: "file",
  };

  if (binaryExts.has(ext)) {
    entry.kind = [".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(ext) ? "asset" : "binary";
    entry.summary = ext === ".gguf" ? "Local Ollama model artifact; metadata only." : "Binary asset; metadata only.";
    return entry;
  }

  if (root.sensitive) {
    entry.kind = "sensitive";
    entry.summary = "Sensitive local configuration/cache file; raw contents redacted.";
    if (ext === ".json" && stat.size < 512 * 1024) {
      const parsed = jsonSummary(fs.readFileSync(abs, "utf8"));
      entry.jsonKeys = parsed.keys;
    }
    return entry;
  }

  if (ext === ".jsonl") {
    entry.kind = "jsonl";
    entry.rows = await lineCount(abs);
    entry.lines = entry.rows;
    const samples = await jsonlSamples(abs);
    entry.sampleKeys = samples.sampleKeys;
    entry.samples = samples.samples;
    entry.summary = `${entry.rows.toLocaleString()} JSONL rows${samples.sampleKeys.length ? ` with keys: ${samples.sampleKeys.join(", ")}` : ""}.`;
    return entry;
  }

  if (!isLikelyText(ext, stat.size)) {
    entry.kind = "binary";
    entry.summary = "Non-text file; metadata only.";
    return entry;
  }

  const text = fs.readFileSync(abs, "utf8");
  entry.lines = text ? text.split(/\r?\n/).length : 0;
  if (ext === ".md") {
    entry.kind = "markdown";
    Object.assign(entry, markdownSummary(text));
    entry.summary = entry.title || "Markdown document.";
  } else if (ext === ".json") {
    entry.kind = "json";
    const summary = jsonSummary(text);
    entry.jsonKeys = summary.keys;
    entry.jsonPreview = summary.preview;
    entry.arrayLength = summary.arrayLength;
    entry.summary = summary.keys.length ? `JSON keys: ${summary.keys.join(", ")}.` : "JSON file.";
  } else if (ext === ".yaml" || ext === ".yml") {
    entry.kind = "yaml";
    const summary = yamlSummary(text);
    entry.yamlKeys = summary.keys;
    entry.preview = summary.excerpt;
    entry.summary = summary.keys.length ? `YAML keys: ${summary.keys.join(", ")}.` : "YAML configuration.";
  } else {
    entry.kind = [".py", ".ts", ".js", ".mjs", ".sh"].includes(ext) ? "code" : "text";
    entry.preview = previewText(text, 900);
    entry.summary = `${entry.lines.toLocaleString()} lines.`;
  }
  return entry;
}

async function walkRoot(root) {
  const abs = path.join(workspace, root.rel);
  const summary = {
    ...root,
    path: root.rel,
    exists: fs.existsSync(abs),
    type: "missing",
    bytes: 0,
    files: 0,
    dirs: 0,
    skipped: [],
    extensions: {},
    kinds: {},
    largestFiles: [],
  };
  const files = [];

  if (!summary.exists) return { summary, files };

  const stat = fs.statSync(abs);
  summary.type = stat.isDirectory() ? "directory" : "file";

  async function visit(current) {
    const currentStat = fs.statSync(current);
    if (currentStat.isDirectory()) {
      summary.dirs += 1;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        const relative = relPath(child);
        if (entry.isDirectory()) {
          const reason = shouldSkipDirectory(relative, entry.name);
          if (reason) {
            const skipped = summarizePath(child);
            summary.skipped.push({ path: relative, reason, ...skipped });
            continue;
          }
        } else {
          const reason = shouldSkipFile(entry.name);
          if (reason) {
            const skipped = summarizePath(child);
            summary.skipped.push({ path: relative, reason, ...skipped });
            continue;
          }
        }
        await visit(child);
      }
      return;
    }

    const file = await summarizeFile(current, root);
    summary.files += 1;
    summary.bytes += currentStat.size;
    summary.extensions[file.ext] = (summary.extensions[file.ext] || 0) + 1;
    summary.kinds[file.kind] = (summary.kinds[file.kind] || 0) + 1;
    summary.largestFiles.push({ path: file.path, bytes: file.bytes, kind: file.kind });
    files.push(file);
  }

  await visit(abs);
  summary.largestFiles = summary.largestFiles.sort((a, b) => b.bytes - a.bytes).slice(0, 6);
  return { summary, files };
}

function totalsFrom(rootSummaries, files) {
  const skipped = rootSummaries.flatMap((root) => root.skipped || []);
  return {
    roots: rootSummaries.length,
    files: files.length,
    dirs: rootSummaries.reduce((sum, root) => sum + root.dirs, 0),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    skippedFiles: skipped.reduce((sum, item) => sum + item.files, 0),
    skippedBytes: skipped.reduce((sum, item) => sum + item.bytes, 0),
    jsonlRows: files.reduce((sum, file) => sum + (file.rows || 0), 0),
    docs: files.filter((file) => file.kind === "markdown").length,
    configs: files.filter((file) => file.kind === "yaml").length,
    datasets: files.filter((file) => file.kind === "jsonl").length,
    artifacts: files.filter((file) => file.kind === "asset" || file.kind === "binary").length,
  };
}

function collectionViews(files) {
  return {
    datasets: files
      .filter((file) => file.kind === "jsonl" || /dataset_info|manifest|quality_report|dataset_card/i.test(file.path))
      .sort((a, b) => (b.rows || 0) - (a.rows || 0) || a.path.localeCompare(b.path)),
    docs: files.filter((file) => file.kind === "markdown").sort((a, b) => a.path.localeCompare(b.path)),
    configs: files.filter((file) => file.kind === "yaml").sort((a, b) => a.path.localeCompare(b.path)),
    artifacts: files.filter((file) => file.kind === "asset" || file.kind === "binary").sort((a, b) => b.bytes - a.bytes),
    previews: files.filter((file) => file.preview || file.excerpt || file.samples || file.jsonPreview).sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function main() {
  const rootSummaries = [];
  const files = [];
  for (const root of roots) {
    const result = await walkRoot(root);
    rootSummaries.push(result.summary);
    files.push(...result.files);
  }

  const data = {
    generatedAt: new Date().toISOString(),
    workspace,
    trainingData: readTrainingDataReadme(),
    wandb: wandbExportConfig(),
    policy: {
      rawSensitiveRootsRedacted: [".claude", ".hf"],
      omittedKinds: ["dependency directories", "virtualenvs", "Hugging Face caches", "model/cache binaries"],
      note: "Static export contains metadata, summaries, redacted snippets, and JSONL samples instead of full local secrets, cache blobs, or model weights.",
    },
    totals: totalsFrom(rootSummaries, files),
    roots: rootSummaries,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    ...collectionViews(files),
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${relPath(outFile)} with ${files.length} files across ${rootSummaries.length} roots.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
