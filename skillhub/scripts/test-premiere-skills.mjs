#!/usr/bin/env node

/**
 * Durable proof that premiere skill families are cataloged and one-shot installable.
 * Drives the real catalog + installer entrypoints (not a reimplementation).
 */

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.join(ROOT, "skills");
const INSTALLER = path.join(ROOT, "bin", "skills.mjs");

/** Premiere families listed in the hub objective — must stay installable. */
export const PREMIERE_FAMILIES = [
  "agent-orchestration",
  "animation-vocabulary",
  "apple-design",
  "deprecated",
  "emil-design-eng",
  "engineering",
  "misc",
  "in-progress",
  "ops-and-setup",
  "personal",
  "productivity",
  "research-and-web",
  "review-animations",
  "skill-authoring",
  "thinking-and-docs",
];

async function collectSkillSlugs(directory, segments = []) {
  const skillPath = path.join(directory, "SKILL.md");
  if (segments.length > 0 && existsSync(skillPath)) {
    return [segments.join("/")];
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const slugs = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    slugs.push(
      ...(await collectSkillSlugs(path.join(directory, entry.name), [...segments, entry.name])),
    );
  }
  return slugs;
}

/** Enumerate every installable slug under the premiere family roots. */
export async function enumeratePremiereSlugs(skillsRoot = SKILLS_ROOT) {
  const slugs = [];
  for (const family of PREMIERE_FAMILIES) {
    const familyDir = path.join(skillsRoot, family);
    if (!existsSync(familyDir)) {
      throw new Error(`missing premiere family directory: skills/${family}`);
    }
    // Top-level skill (e.g. apple-design/SKILL.md) or nested under the family.
    if (existsSync(path.join(familyDir, "SKILL.md"))) {
      slugs.push(family);
      continue;
    }
    const nested = await collectSkillSlugs(familyDir, [family]);
    if (nested.length === 0) {
      throw new Error(`premiere family skills/${family} has no SKILL.md entries`);
    }
    slugs.push(...nested);
  }
  return slugs;
}

export async function loadCatalog(catalogPath = path.join(ROOT, "catalog.json")) {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (!Array.isArray(catalog)) throw new Error("catalog.json must be an array");
  return catalog;
}

export async function assertCatalogIncludesPremiere(catalog, premiereSlugs) {
  const present = new Set(catalog.map((entry) => entry.slug));
  const missing = premiereSlugs.filter((slug) => !present.has(slug));
  if (missing.length > 0) {
    throw new Error(`catalog.json missing premiere slugs: ${missing.join(", ")}`);
  }
  return { present: premiereSlugs.length, totalCatalog: catalog.length };
}

function runInstaller(args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [INSTALLER, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/** One-shot install of the full premiere set into a fresh temp target. */
export async function installPremiereToTemp(premiereSlugs) {
  const target = await mkdtemp(path.join(os.tmpdir(), "skillhub-premiere-"));
  try {
    const result = await runInstaller([
      "install",
      "--target",
      target,
      "--force",
      ...premiereSlugs,
    ]);
    if (result.code !== 0) {
      throw new Error(
        `installer exited ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
    const missing = premiereSlugs.filter(
      (slug) => !existsSync(path.join(target, slug, "SKILL.md")),
    );
    if (missing.length > 0) {
      throw new Error(`install missing SKILL.md for: ${missing.join(", ")}`);
    }
    return { target, installed: premiereSlugs.length, stdout: result.stdout };
  } catch (error) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function main() {
  const premiereSlugs = await enumeratePremiereSlugs();
  const catalog = await loadCatalog();
  const inclusion = await assertCatalogIncludesPremiere(catalog, premiereSlugs);

  // Two independent installs prove consistent one-shot behavior (not flaky).
  const first = await installPremiereToTemp(premiereSlugs);
  await rm(first.target, { recursive: true, force: true });
  const second = await installPremiereToTemp(premiereSlugs);
  await rm(second.target, { recursive: true, force: true });

  console.log(
    `Premiere skills test passed: ${inclusion.present} slugs in catalog (${inclusion.totalCatalog} total); installed twice via bin/skills.mjs.`,
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
