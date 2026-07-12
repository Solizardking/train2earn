#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const IGNORED_TOP_LEVEL_DIRS = new Set([
  ".git",
  ".vercel",
  "bin",
  "node_modules",
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

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

async function main() {
  const errors = [];
  const skills = await collectSkills(path.join(ROOT, "skills"), [], errors);
  const catalog = await readJson(path.join(ROOT, "catalog.json"), errors, "catalog.json");
  const skillsSh = await readJson(path.join(ROOT, "skills.sh.json"), errors, "skills.sh.json");
  const publicCatalog = await readJson(path.join(ROOT, "public", "api", "skills.json"), errors, "public/api/skills.json");
  const siteManifest = await readJson(path.join(ROOT, "public", ".well-known", "skills-hub.json"), errors, "public/.well-known/skills-hub.json");
  const onchainRegistry = await readJson(path.join(ROOT, "public", ".well-known", "onchain-skill-registry.json"), errors, "public/.well-known/onchain-skill-registry.json");
  const vercel = await readJson(path.join(ROOT, "vercel.json"), errors, "vercel.json");

  validateSkillSet(skills, errors);
  validateCatalog(catalog, skills, "catalog.json", errors);
  validateSkillsSh(skillsSh, skills, errors);
  validateCatalog(publicCatalog, skills, "public/api/skills.json", errors);
  await validatePublicMirror(skills, errors);
  validateVercel(vercel, errors);
  validateSiteManifest(siteManifest, skills, errors);
  validateOnchainRegistry(onchainRegistry, skills, errors);

  if (errors.length > 0) {
    console.error("Skill smoke test failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Skill smoke test passed for ${skills.length} skills.`);
}

async function collectSkills(directory, segments, errors) {
  const skills = [];
  const skillPath = path.join(directory, "SKILL.md");
  const ownsSkill = segments.length > 0 && existsSync(skillPath);

  if (ownsSkill) {
    const content = await readFile(skillPath, "utf8");
    const frontmatter = parseFrontmatter(content);
    const slug = segments.join("/");
    skills.push({
      slug,
      name: normalizeText(frontmatter.name),
      description: normalizeText(frontmatter.description),
      skillPath,
      content,
    });

    // A skill directory is a leaf: don't descend into its own bundled
    // references/scripts/examples looking for further catalog entries.
    return skills;
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    errors.push(`cannot read directory ${path.relative(ROOT, directory)}: ${error.message}`);
    return skills;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (segments.length === 0 && IGNORED_TOP_LEVEL_DIRS.has(entry.name)) continue;
    if (segments.length > 0 && IGNORED_NESTED_DIRS.has(entry.name)) continue;

    skills.push(...await collectSkills(path.join(directory, entry.name), [...segments, entry.name], errors));
  }

  return skills;
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

async function readJson(file, errors, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function validateSkillSet(skills, errors) {
  if (skills.length === 0) {
    errors.push("no source skills found");
    return;
  }

  const byName = new Map();
  const byDescription = new Map();

  for (const skill of skills) {
    if (!SLUG_PATTERN.test(skill.slug)) {
      errors.push(`${skill.slug}: slug must use lowercase letters, digits, hyphens, and nested slashes only`);
    }
    if (skill.slug.includes("copy")) {
      errors.push(`${skill.slug}: copy directory is still present`);
    }
    if (!skill.name) {
      errors.push(`${skill.slug}: missing frontmatter name`);
    } else if (!NAME_PATTERN.test(skill.name)) {
      errors.push(`${skill.slug}: frontmatter name must be lowercase hyphen-case`);
    }
    if (!skill.description) {
      errors.push(`${skill.slug}: missing frontmatter description`);
    } else if (skill.description.length < 40) {
      errors.push(`${skill.slug}: description is too short for reliable triggering`);
    }

    addToMap(byName, skill.name, skill.slug);
    addToMap(byDescription, skill.description, skill.slug);
  }

  for (const [name, slugs] of byName) {
    if (name && slugs.length > 1) {
      errors.push(`duplicate skill name ${name}: ${slugs.join(", ")}`);
    }
  }

  for (const [description, slugs] of byDescription) {
    if (description && slugs.length > 1) {
      errors.push(`duplicate skill description: ${slugs.join(", ")}`);
    }
  }
}

function validateCatalog(catalog, skills, label, errors) {
  if (!Array.isArray(catalog)) {
    errors.push(`${label} must be an array`);
    return;
  }

  const skillSlugs = new Set(skills.map((skill) => skill.slug));
  const catalogSlugs = new Set(catalog.map((skill) => skill.slug));

  for (const slug of skillSlugs) {
    if (!catalogSlugs.has(slug)) errors.push(`${label}: missing ${slug}`);
  }
  for (const slug of catalogSlugs) {
    if (!skillSlugs.has(slug)) errors.push(`${label}: stale ${slug}`);
  }

  for (const entry of catalog) {
    if (!entry.slug || !entry.name || !entry.description || !entry.category) {
      errors.push(`${label}: ${entry.slug || "(missing slug)"} missing slug/name/description/category`);
    }
  }
}

function validateSkillsSh(config, skills, errors) {
  if (!config) return;
  if (config.$schema !== "https://skills.sh/schemas/skills.sh.schema.json") {
    errors.push("skills.sh.json missing expected schema URL");
  }
  if (!Array.isArray(config.groupings) || config.groupings.length === 0) {
    errors.push("skills.sh.json must include at least one grouping");
    return;
  }

  const skillSlugs = new Set(skills.map((skill) => skill.slug));
  const grouped = new Set();

  for (const group of config.groupings) {
    if (!group.title || !Array.isArray(group.skills) || group.skills.length === 0) {
      errors.push("skills.sh.json contains an invalid group");
      continue;
    }
    for (const slug of group.skills) {
      if (!skillSlugs.has(slug)) {
        errors.push(`skills.sh.json references unknown skill ${slug}`);
      }
      if (grouped.has(slug)) {
        errors.push(`skills.sh.json groups ${slug} more than once`);
      }
      grouped.add(slug);
    }
  }

  for (const slug of skillSlugs) {
    if (!grouped.has(slug)) errors.push(`skills.sh.json does not group ${slug}`);
  }
}

async function validatePublicMirror(skills, errors) {
  for (const skill of skills) {
    const base = path.join(ROOT, "public", "api", "skills", ...skill.slug.split("/"));
    const metadataPath = path.join(base, "metadata.json");
    const sourcePath = path.join(base, "SKILL.md");

    if (!existsSync(metadataPath)) {
      errors.push(`public mirror missing metadata for ${skill.slug}`);
      continue;
    }
    if (!existsSync(sourcePath)) {
      errors.push(`public mirror missing SKILL.md for ${skill.slug}`);
      continue;
    }
    if (!existsSync(path.join(base, "verification.json"))) {
      errors.push(`public mirror missing verification for ${skill.slug}`);
      continue;
    }

    const metadata = await readJson(metadataPath, errors, `public metadata ${skill.slug}`);
    if (!metadata) continue;
    if (metadata.slug !== skill.slug) errors.push(`public metadata ${skill.slug}: slug mismatch`);
    if (metadata.name !== skill.name) errors.push(`public metadata ${skill.slug}: name mismatch`);
    if (metadata.description !== skill.description) errors.push(`public metadata ${skill.slug}: description mismatch`);
    if (metadata.skill !== `/api/skills/${skill.slug}/SKILL.md`) errors.push(`public metadata ${skill.slug}: skill URL mismatch`);

    const verification = await readJson(path.join(base, "verification.json"), errors, `public verification ${skill.slug}`);
    if (!verification) continue;
    if (verification.slug !== skill.slug) errors.push(`public verification ${skill.slug}: slug mismatch`);
    if (!/^sha256-[a-f0-9]{64}$/.test(verification.bundleHash || "")) errors.push(`public verification ${skill.slug}: invalid bundleHash`);
    if (!/^sha256-[a-f0-9]{64}$/.test(verification.merkleLeaf || "")) errors.push(`public verification ${skill.slug}: invalid merkleLeaf`);
    if (!Array.isArray(verification.files) || verification.files.length === 0) errors.push(`public verification ${skill.slug}: missing file hashes`);
  }
}

function validateVercel(vercel, errors) {
  if (!vercel) return;
  if (vercel.buildCommand !== "npm run build:catalog") {
    errors.push("vercel.json buildCommand must be npm run build:catalog");
  }
  if (vercel.outputDirectory !== "public") {
    errors.push("vercel.json outputDirectory must be public");
  }

  const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
  const rewriteSources = new Set(rewrites.map((rewrite) => rewrite.source));
  for (const source of ["/api/skills", "/api/skills/:slug", "/skills"]) {
    if (!rewriteSources.has(source)) errors.push(`vercel.json missing rewrite ${source}`);
  }
}

function validateSiteManifest(manifest, skills, errors) {
  if (!manifest) return;
  if (manifest.totalSkills !== skills.length) {
    errors.push(`site manifest totalSkills ${manifest.totalSkills} does not match ${skills.length}`);
  }
  if (!manifest.endpoints?.catalog || !manifest.endpoints?.skillMetadata || !manifest.endpoints?.skillSource) {
    errors.push("site manifest missing catalog/skill endpoint templates");
  }
  if (!manifest.endpoints?.skillVerification || !manifest.endpoints?.onchainRegistry) {
    errors.push("site manifest missing verification endpoint templates");
  }
  if (manifest.skillsSh?.install !== "npx skills add Solizardking/skills") {
    errors.push("site manifest missing skills.sh one-shot install command");
  }
  if (!/^sha256-[a-f0-9]{64}$/.test(manifest.verification?.merkleRoot || "")) {
    errors.push("site manifest missing valid Solana verification Merkle root");
  }
}

function validateOnchainRegistry(registry, skills, errors) {
  if (!registry) return;
  if (registry.schemaVersion !== "onchain-skill-registry/v1") {
    errors.push("onchain registry has unexpected schemaVersion");
  }
  if (registry.chain !== "solana") {
    errors.push("onchain registry chain must be solana");
  }
  if (registry.totalSkills !== skills.length) {
    errors.push(`onchain registry totalSkills ${registry.totalSkills} does not match ${skills.length}`);
  }
  if (!/^sha256-[a-f0-9]{64}$/.test(registry.merkleRoot || "")) {
    errors.push("onchain registry missing valid merkleRoot");
  }
  if (!/^sha256-[a-f0-9]{64}$/.test(registry.catalogHash || "")) {
    errors.push("onchain registry missing valid catalogHash");
  }

  const skillSlugs = new Set(skills.map((skill) => skill.slug));
  const registrySlugs = new Set((registry.skills || []).map((skill) => skill.slug));
  for (const slug of skillSlugs) {
    if (!registrySlugs.has(slug)) errors.push(`onchain registry missing ${slug}`);
  }
  for (const slug of registrySlugs) {
    if (!skillSlugs.has(slug)) errors.push(`onchain registry has stale ${slug}`);
  }
}

function addToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
