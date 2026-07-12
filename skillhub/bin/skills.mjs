#!/usr/bin/env node

import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_TARGET = process.env.SKILLS_DIR || path.join(os.homedir(), ".agents", "skills");
const COPY_EXCLUDES = new Set([".DS_Store", ".git", "node_modules"]);

const USAGE = `Usage:
  skills install [skill ...] [--all] [--force] [--target DIR] [--eve]
  skills list [--json]

Examples:
  npx github:Solizardking/skills install
  npx github:Solizardking/skills install solana-dev magicblock --force
  npx github:Solizardking/skills install --target ~/.codex/skills
  npx github:Solizardking/skills install --claude
  npx github:Solizardking/skills install --eve

Targets:
  default       ~/.agents/skills
  --agents      ~/.agents/skills
  --codex       ~/.codex/skills
  --claude      ~/.claude/skills
  --eve         ./agent/skills`;

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }

  if (command === "list") {
    await list(args);
    return;
  }

  if (command === "install" || command === "add" || command === "update") {
    await install(args, { update: command === "update" });
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(USAGE);
  process.exitCode = 1;
}

async function list(args) {
  const options = parseOptions(args);
  const catalog = await loadCatalog();

  if (options.json) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }

  for (const skill of catalog) {
    console.log(`${skill.slug}\t${skill.category}\t${skill.description}`);
  }
}

async function install(args, defaults = {}) {
  const options = parseOptions(args);
  const catalog = await loadCatalog();
  const bySlug = new Map(catalog.map((skill) => [skill.slug, skill]));
  const requested = options.skills.length > 0 && !options.all ? options.skills : catalog.map((skill) => skill.slug);
  const missing = requested.filter((slug) => !bySlug.has(slug));

  if (missing.length > 0) {
    console.error(`Unknown skill${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
    console.error("Run `skills list` to see available skills.");
    process.exitCode = 1;
    return;
  }

  const target = expandHome(options.target || DEFAULT_TARGET);
  const force = options.force || defaults.update;
  await mkdir(target, { recursive: true });

  let installed = 0;
  let skipped = 0;

  for (const slug of requested) {
    const source = path.join(ROOT, "skills", slug);
    const destination = path.join(target, slug);

    if (!existsSync(source)) {
      console.error(`Missing source directory for ${slug}: ${source}`);
      process.exitCode = 1;
      return;
    }

    if (existsSync(destination)) {
      if (!force) {
        console.log(`skip ${slug} already exists at ${destination}`);
        skipped += 1;
        continue;
      }
      if (!options.dryRun) {
        await rm(destination, { recursive: true, force: true });
      }
    }

    if (options.dryRun) {
      console.log(`would install ${slug} -> ${destination}`);
      installed += 1;
      continue;
    }

    await cp(source, destination, {
      recursive: true,
      filter: (file) => !COPY_EXCLUDES.has(path.basename(file)),
    });
    console.log(`installed ${slug} -> ${destination}`);
    installed += 1;
  }

  console.log(`Done. Installed ${installed}, skipped ${skipped}. Target: ${target}`);
}

async function loadCatalog() {
  const raw = await readFile(path.join(ROOT, "catalog.json"), "utf8");
  const catalog = JSON.parse(raw);
  if (!Array.isArray(catalog)) {
    throw new Error("catalog.json must be an array");
  }
  return catalog;
}

function parseOptions(args) {
  const options = {
    all: false,
    dryRun: false,
    force: false,
    json: false,
    skills: [],
    target: "",
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--agents") {
      options.target = path.join(os.homedir(), ".agents", "skills");
    } else if (arg === "--codex") {
      options.target = path.join(os.homedir(), ".codex", "skills");
    } else if (arg === "--claude") {
      options.target = path.join(os.homedir(), ".claude", "skills");
    } else if (arg === "--eve" || arg === "--project") {
      options.target = path.join(process.cwd(), "agent", "skills");
    } else if (arg === "--target" || arg === "--dir") {
      const value = args[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a directory`);
      }
      options.target = value;
      i += 1;
    } else if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
    } else if (arg.startsWith("--dir=")) {
      options.target = arg.slice("--dir=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.skills.push(arg);
    }
  }

  return options;
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
