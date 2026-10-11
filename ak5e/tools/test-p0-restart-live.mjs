/** Capture final P0 test state, restart the disposable server, then compare. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const output = process.env.AK5E_P0_OUTPUT ?? "/tmp/ak5e-p0-live";
const live = JSON.parse(await readFile(`${output}/report.json`, "utf8"));
assert.ok(live.reload && live.player, "Complete content UI acceptance before restart testing");
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}),
  ...(process.env.AK5E_NATIVE_VULKAN ? { args: ["--disable-gpu-sandbox", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--enable-features=Vulkan"] } : {})
});
const errors = [], warnings = [];
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type())) warnings.push(message.text()); });
  await page.goto(process.env.AK5E_P0_URL ?? "http://127.0.0.1:30135/join");
  await page.selectOption('select[name="userid"]', { label: name }); await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => game.world.id), "standard-test");
  return page;
}
try {
  const gm = await join("Gamemaster");
  const snapshot = await gm.evaluate(async actorId => {
    const { contentHash } = await import("/modules/ak5e/scripts/class-content-installation.mjs");
    const selected = [...game.items, ...game.actors, ...game.journal, ...game.tables].filter(document =>
      document.getFlag("ak5e", "chapterThreeId") || document.getFlag("ak5e", "rollTableId") || document.id === actorId);
    const documents = await Promise.all(selected.map(async document => ({ uuid: document.uuid, hash: await contentHash(JSON.stringify(document.toObject())) })));
    documents.sort((a, b) => a.uuid.localeCompare(b.uuid));
    return { documents, counts: { items: game.items.size, actors: game.actors.size, journals: game.journal.size, tables: game.tables.size },
      versions: { foundry: game.version, dnd5e: game.system.version, ak5e: game.modules.get("ak5e").version },
      modules: game.modules.filter(module => module.active).map(module => module.id) };
  }, live.installation.actorId);
  assert.equal(snapshot.documents.length, 1461); // 1,456 Chapter 3 + test Actor + four tables.
  assert.deepEqual(snapshot.modules, ["ak5e"]);
  if (process.argv.includes("--capture")) {
    await writeFile(`${output}/before-restart.json`, JSON.stringify(snapshot, null, 2));
    console.log(`Captured ${snapshot.documents.length} document hashes before restart.`);
  } else {
    const before = JSON.parse(await readFile(`${output}/before-restart.json`, "utf8"));
    assert.deepEqual(snapshot, before, "Persistent P0 documents changed across server restart");
    const player = await join("Standard Player");
    const permissions = await player.evaluate(async actorId => {
      const actor = game.actors.get(actorId), option = actor.items.filter(item => item.getFlag("ak5e", "classOption")).at(-1);
      if (!actor.isOwner || !option) throw new Error("Owned option missing after restart");
      const source = game.items.find(item => item.getFlag("ak5e", "chapterThreeId") === option.getFlag("ak5e", "chapterThreeId"));
      const metadataRetained = option.system.description.value === source?.system.description.value && JSON.stringify(option.flags.ak5e) === JSON.stringify(source?.flags.ak5e);
      if (!metadataRetained) throw new Error("Dragged option lost description/provenance");
      await option.sheet.render(true);
      const visibleTables = game.tables.filter(table => table.getFlag("ak5e", "rollTableId") && table.visible).length;
      const denied = await game.ak5e.installRollTables();
      return { ownedOption: option.name, metadataRetained, visibleTables, denied };
    }, live.installation.actorId);
    assert.equal(permissions.visibleTables, 4); assert.equal(permissions.denied.created, 0); assert.equal(permissions.denied.updated, 0);
    await player.evaluate(() => ui.notifications.clear());
    await player.screenshot({ path: `${output}/player-after-restart.png` });
    const tableSheet = await player.evaluate(async () => {
      const table = game.tables.find(table => table.getFlag("ak5e", "rollTableId"));
      await table.sheet.render(true);
      return { sheetId: table.sheet.element.id, editable: table.sheet.isEditable, beforeMessages: game.messages.size };
    });
    assert.equal(tableSheet.editable, false, "Observer may edit table data");
    await player.locator(`#${tableSheet.sheetId} button[data-action="drawResult"]`).click();
    await player.waitForFunction(count => game.messages.size > count, tableSheet.beforeMessages);
    await player.screenshot({ path: `${output}/player-table-after-restart.png` });
    assert.deepEqual(errors, []);
    const report = { restart: true, checkedDocuments: snapshot.documents.length, counts: snapshot.counts, versions: snapshot.versions, permissions, playerTableSheet: { editable: tableSheet.editable, nativeDraw: true }, errors, warnings };
    await writeFile(`${output}/restart.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
} finally { await browser.close(); }
