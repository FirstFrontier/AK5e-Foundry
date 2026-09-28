import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const SOURCE = fileURLToPath(new URL("../", import.meta.url));
const RUNTIME_DIRECTORIES = ["scripts", "styles", "templates", "lang", "assets"];

function defaultDataPath() {
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? homedir(), "FoundryVTT");
  if (process.platform === "darwin") return path.join(homedir(), "Library", "Application Support", "FoundryVTT");
  return path.join(homedir(), ".local", "share", "FoundryVTT");
}

async function statIfPresent(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// Reject links in paths we write so an installed symlink cannot redirect a copy
// into the repository, another module, or a World database.
async function checkDestination(root, relative) {
  let current = root;
  const parts = relative.split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const info = await statIfPresent(current);
    if (info?.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${current}`);
    if (info && index < parts.length - 1 && !info.isDirectory()) throw new Error(`Expected directory: ${current}`);
  }
}

async function collectFiles(root, relative, files) {
  const full = path.join(root, relative);
  const info = await statIfPresent(full);
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error(`Refusing source symbolic link: ${full}`);
  if (info.isDirectory()) {
    for (const name of (await readdir(full)).sort()) await collectFiles(root, path.join(relative, name), files);
  } else if (info.isFile()) {
    files.set(relative, await readFile(full));
  } else throw new Error(`Expected regular file: ${full}`);
}

function digest(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

function atLeast(actual, minimum) {
  const a = actual.split(".").map(Number), b = minimum.split(".").map(Number);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

async function portIsOpen(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once("connect", () => finish(true));
    socket.setTimeout(1500, () => {
      socket.destroy();
      reject(new Error(`Cannot verify Foundry is stopped: connection to ${host}:${port} timed out.`));
    });
    socket.once("error", error => {
      if (["ECONNREFUSED", "EAFNOSUPPORT", "ENETUNREACH"].includes(error.code)) finish(false);
      else { socket.destroy(); reject(error); }
    });
  });
}

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = await mkdtemp(path.join(path.dirname(file), ".ak5e-install-"));
  try {
    const staged = path.join(temporary, "file");
    await writeFile(staged, data);
    await rename(staged, file);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/** Install development code only. Never copy or synchronize database packs. */
export async function installForTesting({
  source = SOURCE,
  dataPath = process.env.FOUNDRY_VTT_DATA_PATH || defaultDataPath(),
  foundryPath = path.join(homedir(), "FoundryV13"),
  port,
  dryRun = false,
  log = console.log
} = {}) {
  const sourceRoot = await realpath(source);
  const userRoot = await realpath(dataPath);
  const targetRelative = path.join("Data", "modules", "ak5e");
  const target = path.join(userRoot, targetRelative);
  await checkDestination(userRoot, targetRelative);
  const sourceRelation = path.relative(sourceRoot, target);
  const targetRelation = path.relative(target, sourceRoot);
  const isWithin = relative => relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  if (isWithin(sourceRelation) || isWithin(targetRelation)) throw new Error("Source and installed module must be separate directories.");
  if (!(await lstat(path.join(userRoot, "Data"))).isDirectory()) throw new Error("--data-path must point to the User Data root containing Data/.");

  const foundry = JSON.parse(await readFile(path.join(foundryPath, "package.json"), "utf8"));
  if (foundry.name !== "foundryvtt" || Number(foundry.release?.generation ?? foundry.version?.split(".")[0]) !== 13) {
    throw new Error("--foundry-path must point to a Foundry VTT 13 installation.");
  }
  const files = new Map();
  await collectFiles(sourceRoot, "module.json", files);
  const manifest = JSON.parse(files.get("module.json")?.toString() ?? "null");
  const relationship = manifest?.relationships?.systems?.find(system => system.id === "dnd5e");
  if (manifest?.id !== "ak5e" || manifest.compatibility?.minimum !== "13"
    || manifest.system?.length !== 1 || manifest.system[0] !== "dnd5e" || !relationship) {
    throw new Error("Source manifest must declare the AK5e V13/D&D5e module contract.");
  }
  if (manifest.packs?.length) throw new Error("This code installer preserves existing packs. Use a tested release installer for manifest-declared packs.");
  const system = JSON.parse(await readFile(path.join(userRoot, "Data", "systems", "dnd5e", "system.json"), "utf8"));
  const minimum = relationship.compatibility?.minimum ?? "5.0.0";
  if (system.id !== "dnd5e" || !atLeast(system.version, minimum)
    || (relationship.compatibility?.maximum && !atLeast(relationship.compatibility.maximum, system.version))) {
    throw new Error(`Installed D&D5e ${system.version} is outside the manifest compatibility range.`);
  }
  for (const directory of RUNTIME_DIRECTORIES) await collectFiles(sourceRoot, directory, files);
  for (const name of (await readdir(sourceRoot)).filter(name => name.endsWith(".md")).sort()) {
    await collectFiles(sourceRoot, name, files);
  }
  for (const entry of [...(manifest.esmodules ?? []), ...(manifest.scripts ?? []), ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(language => language.path)]) {
    if (!files.has(entry.split("/").join(path.sep))) throw new Error(`Manifest dependency missing from install: ${entry}`);
  }
  const installedManifest = await statIfPresent(path.join(target, "module.json"));
  if (installedManifest) {
    await checkDestination(userRoot, path.join(targetRelative, "module.json"));
    if (JSON.parse(await readFile(path.join(target, "module.json"), "utf8")).id !== "ak5e") {
      throw new Error("Installed module has a different package ID; refusing to overwrite it.");
    }
  } else if (await statIfPresent(target)) {
    if ((await readdir(target)).length) throw new Error("Existing target is nonempty but has no module.json; refusing to overwrite it.");
  }

  const changes = [];
  for (const [relative, data] of files) {
    await checkDestination(userRoot, path.join(targetRelative, relative));
    const destination = path.join(target, relative);
    const info = await statIfPresent(destination);
    if (info && !info.isFile()) throw new Error(`Expected regular destination file: ${destination}`);
    const previous = info ? await readFile(destination) : null;
    if (!previous?.equals(data)) changes.push({ relative, data, previous });
  }
  // Dependencies go first, and the manifest is published last.
  changes.sort((a, b) => (a.relative === "module.json") - (b.relative === "module.json") || a.relative.localeCompare(b.relative));
  log(`AK5e ${manifest.version}; Foundry ${foundry.version}; D&D5e ${system.version}`);
  log(`User Data: ${userRoot}\nInstall: ${target}`);
  log(`${dryRun ? "Dry run: " : ""}${changes.length} changed/new files; ${files.size - changes.length} unchanged.`);
  for (const change of changes) log(`  ${change.previous ? "update" : "add"} ${change.relative}`);
  if (dryRun) return { target, changes: changes.map(change => change.relative), backup: null };
  if (!changes.length) return { target, changes: [], backup: null };

  const optionsFile = path.join(userRoot, "Config", "options.json");
  const options = await statIfPresent(optionsFile) ? JSON.parse(await readFile(optionsFile, "utf8")) : {};
  const listenPort = Number(port ?? options.port ?? 30000);
  if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) throw new Error("Invalid Foundry port.");
  if ((await Promise.all([portIsOpen("127.0.0.1", listenPort), portIsOpen("::1", listenPort)])).some(Boolean)) {
    throw new Error(`Port ${listenPort} is listening. Stop Foundry (including any automatic restart service) before installing. Use --port for a command-line port override.`);
  }

  let backup = null;
  if (changes.some(change => change.previous)) {
    backup = await mkdtemp(path.join(userRoot, "ak5e-code-backup-"));
    log(`Code backup: ${backup}`);
    for (const change of changes.filter(change => change.previous)) {
      const file = path.join(backup, "ak5e", change.relative);
      await writeAtomic(file, change.previous);
      if (digest(await readFile(file)) !== digest(change.previous)) throw new Error(`Backup verification failed: ${file}`);
    }
    await writeFile(path.join(backup, "install-record.json"), JSON.stringify({
      target, version: manifest.version, createdAt: new Date().toISOString(),
      replaced: changes.filter(change => change.previous).map(change => change.relative),
      added: changes.filter(change => !change.previous).map(change => change.relative)
    }, null, 2));
  }
  const attempted = [];
  try {
    for (const change of changes) {
      await checkDestination(userRoot, path.join(targetRelative, change.relative));
      await writeAtomic(path.join(target, change.relative), change.data);
      attempted.push(change);
    }
    for (const [relative, data] of files) {
      if (digest(await readFile(path.join(target, relative))) !== digest(data)) throw new Error(`Installed hash mismatch: ${relative}`);
    }
  } catch (error) {
    for (const change of attempted.reverse()) {
      const file = path.join(target, change.relative);
      await checkDestination(userRoot, path.join(targetRelative, change.relative));
      if (change.previous) await writeAtomic(file, change.previous);
      else await rm(file, { force: true });
    }
    throw new Error(`Installation failed; previous files restored. ${error.message}`, { cause: error });
  }
  log(`Verified ${files.size} files by SHA-256. Existing packs and World data were preserved.`);
  log("Restart Foundry, open your D&D5e test World, enable AK5e in Manage Modules, and reload the browser.");
  return { target, changes: changes.map(change => change.relative), backup };
}

async function main() {
  const { values } = parseArgs({ options: {
    "data-path": { type: "string" }, "foundry-path": { type: "string" }, port: { type: "string" },
    "dry-run": { type: "boolean", default: false }, help: { type: "boolean", default: false }
  } });
  if (values.help) {
    console.log(`Install AK5e development code into your stopped Foundry VTT 13 instance.
Usage: npm run install:foundry -- [--dry-run] [--data-path PATH] [--foundry-path PATH] [--port PORT]
Defaults: User Data = FOUNDRY_VTT_DATA_PATH or ${defaultDataPath()}
          Foundry = ${path.join(homedir(), "FoundryV13")}
The source is this repository's ak5e/ directory, regardless of working directory.
Changed code is backed up; packs, Worlds, D&D5e and unrelated files are preserved.
Stop Foundry before installation. --dry-run reads files without modifying them.`);
    return;
  }
  await installForTesting({ dataPath: values["data-path"], foundryPath: values["foundry-path"], port: values.port, dryRun: values["dry-run"] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`AK5e install: ${error.message}`); process.exitCode = 1; });
}
