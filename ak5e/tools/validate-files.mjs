import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleRoot = new URL("../", import.meta.url);
const manifest = await readJson(new URL("module.json", moduleRoot));
const translations = await readJson(new URL("lang/en.json", moduleRoot));

assert.equal(manifest.id, "ak5e");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.compatibility?.minimum, "13");
assert.equal(manifest.compatibility?.verified, "13");
assert.deepEqual(manifest.system, ["dnd5e"]);
const dnd5e = manifest.relationships?.systems?.find(system => system.id === "dnd5e");
assert.ok(dnd5e, "module.json must declare its D&D5e system relationship.");
assert.match(dnd5e.compatibility?.minimum ?? "", /^5\./);

for (const path of [
  ...(manifest.esmodules ?? []),
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map(language => language.path),
  ...(manifest.packs ?? []).map(pack => pack.path)
]) {
  assert.ok(existsSync(new URL(path, moduleRoot)), `Manifest path does not exist: ${path}`);
}
for (const pack of manifest.packs ?? []) {
  assert.ok(["Actor", "Adventure", "Item", "JournalEntry", "RollTable"].includes(pack.type), `Unsupported pack type: ${pack.type}`);
  if (["Actor", "Adventure", "Item"].includes(pack.type)) assert.equal(pack.system, "dnd5e", `${pack.name} must target dnd5e.`);
}

assert.equal(typeof translations.AK5E?.SourceBook, "string");
assertStringLeaves(translations, "en.json");

const modules = (await findFiles(moduleRoot)).filter(url => url.pathname.endsWith(".mjs"));
for (const moduleUrl of modules) {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(moduleUrl)], { encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || `Syntax check failed: ${fileURLToPath(moduleUrl)}`);
}
console.log(`Validated module.json, lang/en.json, and ${modules.length} .mjs files.`);

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${fileURLToPath(url)}: ${error.message}`, { cause: error });
  }
}

function assertStringLeaves(value, path) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path} must contain a JSON object.`);
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (typeof child === "string") assert.ok(child.length, `${childPath} must not be empty.`);
    else assertStringLeaves(child, childPath);
  }
}

async function findFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) files.push(...await findFiles(url));
    else files.push(url);
  }
  return files;
}
