import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import test from "node:test";
import { installForTesting } from "../tools/install-for-testing.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "ak5e install test "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "repo", "ak5e");
  const dataPath = path.join(root, "User Data");
  const foundryPath = path.join(root, "FoundryV13");
  const target = path.join(dataPath, "Data", "modules", "ak5e");
  const manifest = {
    id: "ak5e", version: "0.3.1", compatibility: { minimum: "13", verified: "13" },
    system: ["dnd5e"], relationships: { systems: [{ id: "dnd5e", compatibility: { minimum: "5.0.0" } }] },
    esmodules: ["scripts/main.mjs"], styles: ["styles/main.css"], languages: [{ path: "lang/en.json" }]
  };
  const put = async (file, value) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
  };
  await put(path.join(source, "module.json"), manifest);
  await put(path.join(source, "scripts", "main.mjs"), 'import "./helper.mjs";');
  await put(path.join(source, "scripts", "helper.mjs"), "export const test = true;");
  await put(path.join(source, "styles", "main.css"), ".test { color: red; }");
  await put(path.join(source, "lang", "en.json"), { test: "test" });
  await put(path.join(source, "README.md"), "Module readme");
  await put(path.join(source, "templates", "example.hbs"), "<p>Test</p>");
  await put(path.join(source, "assets", "test.svg"), "<svg/>");
  await put(path.join(source, "tools", "dev-only.mjs"), "Do not deploy");
  await put(path.join(source, "test", "dev-only.mjs"), "Do not deploy");
  await put(path.join(foundryPath, "package.json"), { name: "foundryvtt", version: "13.351.0", release: { generation: 13 } });
  const systemFile = path.join(dataPath, "Data", "systems", "dnd5e", "system.json");
  await put(systemFile, { id: "dnd5e", version: "5.3.3" });
  await mkdir(path.join(dataPath, "Data", "modules"));
  const worldFile = path.join(dataPath, "Data", "worlds", "existing-world", "actors", "CURRENT");
  await put(worldFile, "User database sentinel");
  // Reserve an OS-selected port, then release it for the install preflight.
  const server = net.createServer();
  let port;
  try { port = await listen(server); } finally { await close(server); }
  const options = { source, dataPath, foundryPath, port, log: () => {} };
  return { root, source, dataPath, foundryPath, target, manifest, systemFile, worldFile, put, options };
}

test("fresh install copies runtime dependencies and leaves World/system data intact", async t => {
  const f = await fixture(t);
  const result = await installForTesting(f.options);
  assert.equal(result.target, f.target);
  assert.equal(result.backup, null);
  assert.equal(await readFile(path.join(f.target, "scripts", "helper.mjs"), "utf8"), "export const test = true;");
  assert.equal(await readFile(path.join(f.target, "assets", "test.svg"), "utf8"), "<svg/>");
  assert.equal(await readFile(f.worldFile, "utf8"), "User database sentinel");
  assert.deepEqual(JSON.parse(await readFile(f.systemFile)), { id: "dnd5e", version: "5.3.3" });
  assert.equal((await readdir(f.target)).includes("tools"), false);
  assert.equal((await readdir(f.target)).includes("test"), false);
});

test("updates back up installation-side edits, retain packs and extra files, and repeat without writes", async t => {
  const f = await fixture(t);
  await installForTesting(f.options);
  const script = path.join(f.target, "scripts", "main.mjs");
  await f.put(script, "Local installed edit");
  const pack = path.join(f.target, "packs", "classes", "CURRENT");
  const extra = path.join(f.target, "scripts", "custom-user.mjs");
  await f.put(pack, "Compendium database sentinel");
  await f.put(extra, "Custom user script");
  const result = await installForTesting(f.options);
  assert.deepEqual(result.changes, [path.join("scripts", "main.mjs")]);
  assert.equal(await readFile(path.join(result.backup, "ak5e", "scripts", "main.mjs"), "utf8"), "Local installed edit");
  assert.deepEqual(JSON.parse(await readFile(path.join(result.backup, "install-record.json"))).replaced, result.changes);
  assert.equal(await readFile(pack, "utf8"), "Compendium database sentinel");
  assert.equal(await readFile(extra, "utf8"), "Custom user script");
  const before = await readdir(f.dataPath);
  const repeat = await installForTesting(f.options);
  assert.deepEqual(repeat.changes, []);
  assert.equal(repeat.backup, null);
  assert.deepEqual(await readdir(f.dataPath), before);
});

test("dry run previews changes without creating a module or backup", async t => {
  const f = await fixture(t);
  const before = await readdir(f.dataPath);
  const result = await installForTesting({ ...f.options, dryRun: true });
  assert.ok(result.changes.includes("module.json"));
  assert.deepEqual(await readdir(f.dataPath), before);
  assert.deepEqual(await readdir(path.dirname(f.target)), []);
});

test("refuses symlinked module roots and nested destinations without modifying the linked files", async t => {
  const f = await fixture(t);
  await symlink(f.source, f.target, "dir");
  await assert.rejects(installForTesting(f.options), /symbolic link/);
  await rm(f.target);
  await installForTesting(f.options);
  await rm(path.join(f.target, "scripts"), { recursive: true });
  await symlink(path.join(f.source, "scripts"), path.join(f.target, "scripts"), "dir");
  await assert.rejects(installForTesting(f.options), /symbolic link/);
  assert.equal(await readFile(path.join(f.source, "scripts", "main.mjs"), "utf8"), 'import "./helper.mjs";');
});

test("rejects wrong Foundry generation and incompatible D&D5e before any writes", async t => {
  const f = await fixture(t);
  await f.put(path.join(f.foundryPath, "package.json"), { name: "foundryvtt", version: "12.331.0" });
  await assert.rejects(installForTesting(f.options), /Foundry VTT 13/);
  await f.put(path.join(f.foundryPath, "package.json"), { name: "foundryvtt", version: "13.351.0" });
  await f.put(f.systemFile, { id: "dnd5e", version: "4.4.0" });
  await assert.rejects(installForTesting(f.options), /outside the manifest compatibility range/);
  assert.deepEqual(await readdir(path.dirname(f.target)), []);
});

test("rejects missing manifest dependencies, source symlinks, and release packs", async t => {
  const f = await fixture(t);
  await rm(path.join(f.source, "styles", "main.css"));
  await assert.rejects(installForTesting(f.options), /Manifest dependency missing/);
  await f.put(path.join(f.source, "styles", "main.css"), "css");
  await symlink(f.worldFile, path.join(f.source, "assets", "linked-file"));
  await assert.rejects(installForTesting(f.options), /source symbolic link/);
  await rm(path.join(f.source, "assets", "linked-file"));
  await f.put(path.join(f.source, "module.json"), { ...f.manifest, packs: [{ name: "classes", path: "packs/classes" }] });
  await assert.rejects(installForTesting(f.options), /preserves existing packs/);
  assert.deepEqual(await readdir(path.dirname(f.target)), []);
});

test("refuses unrelated existing targets", async t => {
  const f = await fixture(t);
  await f.put(path.join(f.target, "module.json"), { id: "other-module" });
  await assert.rejects(installForTesting(f.options), /different package ID/);
  await rm(path.join(f.target, "module.json"));
  await f.put(path.join(f.target, "user-file.txt"), "Preserve me");
  await assert.rejects(installForTesting(f.options), /nonempty but has no module.json/);
  assert.equal(await readFile(path.join(f.target, "user-file.txt"), "utf8"), "Preserve me");
});

test("refuses a listening Foundry port; dry run remains available", async t => {
  const f = await fixture(t);
  const server = net.createServer(socket => socket.end());
  try {
    const port = await listen(server);
    await assert.rejects(installForTesting({ ...f.options, port }), /Stop Foundry/);
    assert.deepEqual(await readdir(path.dirname(f.target)), []);
    await installForTesting({ ...f.options, port, dryRun: true });
    assert.deepEqual(await readdir(path.dirname(f.target)), []);
  } finally { await close(server); }
});

test("restores earlier copied files when a later destination is unwritable", {
  skip: process.platform === "win32" || process.getuid?.() === 0
}, async t => {
  const f = await fixture(t);
  await installForTesting(f.options);
  const readme = path.join(f.target, "README.md");
  const script = path.join(f.target, "scripts", "main.mjs");
  await f.put(readme, "Installed readme edit");
  await f.put(script, "Installed script edit");
  await chmod(path.dirname(script), 0o555);
  try {
    await assert.rejects(installForTesting(f.options), /Installation failed; previous files restored/);
    assert.equal(await readFile(readme, "utf8"), "Installed readme edit");
    assert.equal(await readFile(script, "utf8"), "Installed script edit");
    const backupName = (await readdir(f.dataPath)).find(name => name.startsWith("ak5e-code-backup-"));
    assert.equal(await readFile(path.join(f.dataPath, backupName, "ak5e", "README.md"), "utf8"), "Installed readme edit");
  } finally { await chmod(path.dirname(script), 0o755); }
});
