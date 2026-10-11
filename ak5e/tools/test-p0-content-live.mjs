import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

// This script may only mutate the explicitly designated disposable test World.
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const output = process.env.AK5E_P0_OUTPUT ?? "/tmp/ak5e-p0-live";
await mkdir(output, { recursive: true });
const baseline = JSON.parse(await readFile(new URL("../test/fixtures/p0-chapter-three-baseline.json", import.meta.url), "utf8"));
const draft = process.env.AK5E_P0_DRAFT ? (await import(process.env.AK5E_P0_DRAFT)).CHAPTER_THREE_CLASSES : null;
const draftTables = process.env.AK5E_P0_TABLE_DRAFT ? (await import(process.env.AK5E_P0_TABLE_DRAFT)).AK5E_ROLL_TABLES : null;
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}),
  ...(process.env.AK5E_NATIVE_VULKAN ? { args: ["--disable-gpu-sandbox", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--enable-features=Vulkan"] } : {})
});
const report = { errors: [], consoleWarnings: [], screenshots: [] };
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type())) report.consoleWarnings.push(message.text()); });
  await page.goto(process.env.AK5E_P0_URL ?? "http://127.0.0.1:30135/join");
  await page.selectOption('select[name="userid"]', { label: name });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 60000 });
  assert.equal(await page.evaluate(() => game.world.id), "standard-test", "Requires disposable standard-test World");
  return page;
}
async function screenshot(page, name) {
  await page.evaluate(() => {
    if (typeof ui.notifications.clear === "function") ui.notifications.clear();
    else document.querySelectorAll('#notifications .notification .close, #notifications [data-action="dismiss"]').forEach(button => button.click());
  });
  const path = `${output}/${name}.png`;
  await page.screenshot({ path }); report.screenshots.push(path);
}
try {
  const gm = await join("Gamemaster");
  report.environment = await gm.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl"), extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return { world: game.world.id, foundry: game.version, system: game.system.version, module: game.modules.get("ak5e").version,
      activeModules: game.modules.filter(module => module.active).map(module => module.id),
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  assert.equal(report.environment.foundry, "13.351"); assert.equal(report.environment.system, "5.3.3");
  assert.equal(report.environment.module, "0.3.8"); assert.deepEqual(report.environment.activeModules, ["ak5e"]);
  report.installation = await gm.evaluate(async ({ baseline, draft, draftTables }) => {
    const { CHAPTER_THREE_CLASSES: entries } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { AK5E_ROLL_TABLES: tables } = await import("/modules/ak5e/scripts/roll-table-content.mjs");
    const { classContentUpdate, contentHash, canonicalDescription } = await import("/modules/ak5e/scripts/class-content-installation.mjs");
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    // Optional one-time reconciliation of canonical, unpublished P0 test drafts.
    // The World guard above and exact old-description hash preserve customized fixtures.
    let draftReconciled = 0;
    if (draft) for (const entry of entries) {
      const old = draft.find(record => record.id === entry.id);
      const item = game.items.find(item => item.getFlag("ak5e", "chapterThreeId") === entry.id);
      if (!old || !item || old.content === entry.content) continue;
      const update = await classContentUpdate(item, { ...entry, previousContentHash: await contentHash(old.content) });
      if (update) { await item.update(update); draftReconciled++; }
    }
    let draftTablesReconciled = 0;
    if (draftTables) for (const entry of tables) {
      const old = draftTables.find(record => record.id === entry.id);
      const table = game.tables.find(table => table.getFlag("ak5e", "rollTableId") === entry.id);
      if (table && old?.content !== entry.content && table.description === old?.content) {
        await table.update({ description: entry.content }); draftTablesReconciled++;
      }
    }
    let actor = game.actors.find(actor => actor.getFlag("ak5e", "p0TestActor"));
    const doublecast = entries.find(entry => /doublecast/.test(entry.id) && entry.previousContentHash);
    const customized = entries.find(entry => /chosen-of-asclepius/.test(entry.id));
    if (!actor?.getFlag("ak5e", "p0MigrationSeed")) {
      const player = game.users.getName("Standard Player");
      actor ??= await Actor.implementation.create({ name: "P0 content inspection", type: "character", ownership: { [player.id]: 3 }, flags: { ak5e: { p0TestActor: true } } });
      const old = baseline.migrated.find(entry => entry.id === doublecast.id);
      const item = await Item.implementation.create({ name: "Authored Doublecast title", type: "feat", img: "icons/svg/book.svg",
        system: { description: { value: old.content, chat: "Authored chat text" }, uses: { max: "7", spent: 2 },
          activities: { P0Activity123456: { _id: "P0Activity123456", type: "utility", name: "Authored activity" } } },
        effects: [{ name: "Authored effect", disabled: true }], flags: { ak5e: { chapterThreeId: doublecast.id, contentVersion: "0.2.4" }, p0Other: { retained: true } } });
      await actor.createEmbeddedDocuments("Item", [{ ...item.toObject(), _id: undefined }]);
      const customOld = baseline.migrated.find(entry => entry.id === customized.id);
      await Item.implementation.create({ name: customized.name, type: "feat", system: { description: { value: `${customOld.content}<p>P0 authored note.</p>` } },
        flags: { ak5e: { chapterThreeId: customized.id, contentVersion: "0.2.4" } } });
      const caster = entries.find(entry => entry.id === "class-caster");
      await Item.implementation.create({ name: caster.name, type: caster.itemType, system: { ...caster.systemData, description: { value: caster.content } },
        flags: { ak5e: { chapterThreeId: caster.id, contentVersion: "0.0.0" } } });
      await actor.setFlag("ak5e", "p0MigrationSeed", true);
    }
    const canonical = game.items.find(item => item.getFlag("ak5e", "chapterThreeId") === doublecast.id);
    // Re-seed this designated fixture so reruns exercise a previous-version migration.
    await canonical.update({ "system.description.value": baseline.migrated.find(entry => entry.id === doublecast.id).content, "flags.ak5e.contentVersion": "0.2.4" });
    const custom = game.items.find(item => item.getFlag("ak5e", "chapterThreeId") === customized.id);
    const unrelated = game.items.find(item => item.getFlag("ak5e", "chapterThreeId") === "class-caster");
    const copiesBefore = JSON.stringify(actor.items.map(item => item.toObject()));
    const unrelatedBefore = JSON.stringify(unrelated.toObject());
    const customBefore = JSON.stringify(custom.toObject());
    const authoredBefore = { id: canonical.id, name: canonical.name, img: canonical.img, activities: JSON.stringify(canonical._source.system.activities),
      effects: JSON.stringify(canonical._source.effects), uses: JSON.stringify(canonical._source.system.uses), chat: canonical.system.description.chat };
    const first = await game.ak5e.installChapterThreeClasses();
    const installedOptions = game.items.filter(item => item.getFlag("ak5e", "classOption"));
    assert(installedOptions.length === 418, "Individual option coverage incomplete");
    for (const item of installedOptions) assert(canonicalDescription(item.system.description.value) === canonicalDescription(entries.find(entry => entry.id === item.getFlag("ak5e", "chapterThreeId"))?.content), `Stale option description: ${item.name}`);
    assert(canonical.system.description.value === doublecast.content, "Canonical previous description did not migrate");
    assert(JSON.stringify(custom.toObject()) === customBefore, "Customized description/fields overwritten");
    assert(JSON.stringify(unrelated.toObject()) === unrelatedBefore, "Unaffected class overwritten");
    assert(JSON.stringify(actor.items.map(item => item.toObject())) === copiesBefore, "Actor-owned copy changed");
    const authoredAfter = { id: canonical.id, name: canonical.name, img: canonical.img, activities: JSON.stringify(canonical._source.system.activities),
      effects: JSON.stringify(canonical._source.effects), uses: JSON.stringify(canonical._source.system.uses), chat: canonical.system.description.chat };
    assert(JSON.stringify(authoredAfter) === JSON.stringify(authoredBefore), "Authored fields changed");
    const ids = game.items.filter(item => item.getFlag("ak5e", "chapterThreeId")).map(item => item.id);
    const repeat = await game.ak5e.installChapterThreeClasses();
    assert(repeat.created === 0 && repeat.updated === 0, "Repeat class installation mutated documents");
    assert(JSON.stringify(ids) === JSON.stringify(game.items.filter(item => item.getFlag("ak5e", "chapterThreeId")).map(item => item.id)), "Class IDs changed");
    const [tableFirst, overlapping] = await Promise.all([game.ak5e.installRollTables(), game.ak5e.installRollTables()]);
    assert(JSON.stringify(tableFirst) === JSON.stringify(overlapping), "Overlapping table installation did not share result");
    const tableRepeat = await game.ak5e.installRollTables();
    assert(tableRepeat.created === 0 && tableRepeat.updated === 0, "Repeat table installation mutated documents");
    assert(game.tables.filter(table => table.getFlag("ak5e", "rollTableId")).length === 4, "Table count incorrect");
    let checkedResults = 0;
    for (const entry of tables) {
      const table = game.tables.find(table => table.getFlag("ak5e", "rollTableId") === entry.id);
      assert(table.formula === entry.formula && table.replacement && table.displayRoll, `${entry.name}: settings incorrect`);
      assert(table.results.size === entry.results.length, `${entry.name}: result count`);
      for (const expected of entry.results) {
        const result = table.results.get(expected._id);
        assert(result && result.type === "text" && result.name === expected.name && result.description === expected.description, `${entry.name}: exact result mismatch`);
        assert(JSON.stringify(result.range) === JSON.stringify(expected.range), `${entry.name}: boundary mismatch`);
        assert(table.getResultsForRoll(expected.range[0])[0]?.id === expected._id, `${entry.name}: lookup mismatch`);
        checkedResults++;
      }
      const minimum = await new Roll(table.formula).evaluate({ minimize: true });
      // V13 RollTable.roll always rerolls; supplied results make boundary chat draws deterministic.
      const firstDraw = await table.draw({ roll: minimum, results: table.getResultsForRoll(minimum.total) });
      const repeatedMinimum = await new Roll(table.formula).evaluate({ minimize: true });
      const repeatDraw = await table.draw({ roll: repeatedMinimum, results: table.getResultsForRoll(repeatedMinimum.total) });
      assert(firstDraw.results[0]?.id === repeatDraw.results[0]?.id && table.results.contents.every(result => !result.drawn), `${entry.name}: replacement repeat failed ${JSON.stringify({ firstTotal: firstDraw.roll.total, repeatTotal: repeatDraw.roll.total, firstIds: firstDraw.results.map(r => r.id), repeatIds: repeatDraw.results.map(r => r.id), drawn: table.results.map(r => r.drawn) })}`);
      const maximumRoll = await new Roll(table.formula).evaluate({ maximize: true });
      const maximum = await table.draw({ roll: maximumRoll, results: table.getResultsForRoll(maximumRoll.total) });
      assert(maximum.results[0]?.range[1] === (table.formula === "2d10" ? 20 : 6), `${entry.name}: maximum sum failed`);
    }
    return { first, repeat, tableFirst, tableRepeat, checkedResults, draftReconciled, draftTablesReconciled, actorId: actor.id, canonicalId: canonical.id,
      customizedId: custom.id, unchangedActorCopies: true, unchangedAuthoredFields: true,
      classWorldCount: ids.length, optionCount: game.items.filter(item => item.getFlag("ak5e", "classContentKind") === "class-option").length,
      tableIds: game.tables.filter(table => table.getFlag("ak5e", "rollTableId")).map(table => ({ id: table.id, sourceId: table.getFlag("ak5e", "rollTableId"), results: table.results.map(result => result.id) })) };
  }, { baseline, draft, draftTables });
  assert.equal(report.installation.optionCount, 350); assert.equal(report.installation.checkedResults, 37);

  const targets = await gm.evaluate(() => game.items.filter(item => item.getFlag("ak5e", "classOption")).reduce((samples, item) => {
    const category = item.getFlag("ak5e", "classOption").category;
    if (!samples.some(sample => sample.category === category)) samples.push({ category, id: item.id, name: item.name });
    return samples;
  }, []));
  report.renderedOptions = [];
  for (const target of targets) {
    await gm.evaluate(async id => { await globalThis.p0OptionSheet?.close(); globalThis.p0OptionSheet = game.items.get(id).sheet; await p0OptionSheet.render(true); }, target.id);
    await gm.waitForFunction(id => document.querySelector(`[data-item-id="${id}"]`) || [...document.querySelectorAll(".window-title")].some(title => title.textContent.includes(game.items.get(id).name)), target.id);
    const rendered = await gm.evaluate(id => {
      const item = game.items.get(id), element = item.sheet.element;
      const text = element.innerText;
      if (!text.includes(item.name) || !text.includes("Rule context")) throw new Error(`Missing rendered option/context ${item.name}`);
      if (item.getFlag("ak5e", "classOption").category === "talent" && (!text.includes("Effect") || !text.includes("Module Effect"))) throw new Error("Talent lost Effect/Module Effect");
      return { name: item.name, category: item.getFlag("ak5e", "classOption").category, textLength: text.length, width: element.getBoundingClientRect().width };
    }, target.id);
    report.renderedOptions.push(rendered); await screenshot(gm, `option-${target.category}`);
    const scrolled = await gm.evaluate(id => {
      const element = game.items.get(id).sheet.element;
      const scroll = [...element.querySelectorAll("*")].find(child => child.clientHeight > 0 && child.scrollHeight > child.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(child).overflowY));
      if (!scroll) return false; scroll.scrollTop = scroll.scrollHeight; return true;
    }, target.id);
    if (scrolled) await screenshot(gm, `option-${target.category}-bottom`);
  }
  const corrected = await gm.evaluate(async () => {
    const { CHAPTER_THREE_CLASSES: entries } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    return entries.filter(entry => entry.previousContentHash && !entry.classOption).map(entry => ({
      id: game.items.find(item => item.getFlag("ak5e", "chapterThreeId") === entry.id).id, sourceId: entry.id, name: entry.name
    }));
  });
  report.correctedFeatures = corrected;
  await gm.evaluate(async () => { await globalThis.p0OptionSheet?.close(); });
  for (const target of corrected) {
    await gm.evaluate(async target => {
      await globalThis.p0FeatureSheet?.close();
      for (const app of Object.values(ui.windows)) if (app.document) await app.close();
      const { CHAPTER_THREE_CLASSES: entries } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
      const entry = entries.find(entry => entry.id === target.sourceId);
      let item = game.items.get(target.id);
      // Render the current source through the native sheet without overwriting the customized fixture.
      if (item.system.description.value !== entry.content) item = new Item.implementation({ name: entry.name, type: "feat", system: { description: { value: entry.content } } });
      globalThis.p0FeatureSheet = item.sheet; await item.sheet.render(true);
    }, target);
    await gm.waitForFunction(() => globalThis.p0FeatureSheet?.element?.innerText.length > 0);
    await screenshot(gm, `feature-${target.id}`);
  }
  await gm.evaluate(async () => { await globalThis.p0FeatureSheet?.close(); });
  await gm.evaluate(async () => { for (const app of Object.values(ui.windows)) if (app.document) await app.close(); await ui.sidebar.changeTab("tables", "primary"); });
  for (const table of report.installation.tableIds) {
    await gm.evaluate(async id => { await globalThis.p0TableSheet?.close(); globalThis.p0TableSheet = game.tables.get(id).sheet; await p0TableSheet.render(true); }, table.id);
    await gm.waitForFunction(id => game.tables.get(id).sheet.element?.querySelector('button[data-action="drawResult"]'), table.id);
    await screenshot(gm, table.sourceId);
    const count = await gm.evaluate(() => game.messages.size);
    const selector = await gm.evaluate(id => `#${game.tables.get(id).sheet.element.id} button[data-action="drawResult"]`, table.id);
    await gm.locator(selector).first().click();
    await gm.waitForFunction(count => game.messages.size > count, count);
    const last = table.results.at(-1);
    await gm.locator(`#${await gm.evaluate(id => game.tables.get(id).sheet.element.id, table.id)} [data-result-id="${last}"]`).scrollIntoViewIfNeeded();
    await screenshot(gm, `${table.sourceId}-last-result`);
  }
  await gm.evaluate(async () => { await globalThis.p0TableSheet?.close(); await ui.sidebar.expand(); await ui.sidebar.changeTab("chat", "primary"); });
  await screenshot(gm, "table-chat-draws");

  await gm.evaluate(async id => { await ui.sidebar.changeTab("items", "primary"); await game.actors.get(id).sheet.render(true); }, report.installation.actorId);
  const dragItem = targets.find(item => item.category === "technique");
  await gm.locator('#items input[name="search"]').fill(dragItem.name);
  await gm.locator('#items input[name="search"]').press("e");
  await gm.locator('#items input[name="search"]').press("Backspace");
  await gm.locator(`#items [data-entry-id="${dragItem.id}"]`).waitFor({ state: "visible" });
  await screenshot(gm, "item-search");
  report.dragDrop = await gm.evaluate(({ actorId, itemId }) => {
    const actor = game.actors.get(actorId), item = game.items.get(itemId);
    return { before: actor.items.size, sourceId: item.getFlag("ak5e", "chapterThreeId"), sheetId: actor.sheet.element.id };
  }, { actorId: report.installation.actorId, itemId: dragItem.id });
  await gm.locator(`#items [data-entry-id="${dragItem.id}"]`).dragTo(gm.locator(`#${report.dragDrop.sheetId} .window-content`));
  await gm.waitForFunction(({ actorId, before }) => game.actors.get(actorId).items.size > before, { actorId: report.installation.actorId, before: report.dragDrop.before });
  report.dragDrop.metadataRetained = await gm.evaluate(({ actorId, itemId }) => {
    const source = game.items.get(itemId), copy = game.actors.get(actorId).items.filter(item => item.getFlag("ak5e", "chapterThreeId") === source.getFlag("ak5e", "chapterThreeId")).at(-1);
    return copy.system.description.value === source.system.description.value && JSON.stringify(copy.flags.ak5e) === JSON.stringify(source.flags.ak5e);
  }, { actorId: report.installation.actorId, itemId: dragItem.id });
  assert.ok(report.dragDrop.metadataRetained);
  await screenshot(gm, "actor-dropped-option");

  const player = await join("Standard Player");
  report.player = await player.evaluate(async actorId => {
    const before = { items: game.items.size, tables: game.tables.size };
    const denied = await game.ak5e.installRollTables();
    const classDenied = await game.ak5e.installChapterThreeClasses();
    if (denied.created || denied.updated || classDenied.created || classDenied.updated || game.items.size !== before.items || game.tables.size !== before.tables) throw new Error("Player installer allowed mutation");
    const actor = game.actors.get(actorId); await actor.sheet.render(true);
    const copy = actor.items.filter(item => item.getFlag("ak5e", "classOption")).at(-1); if (!copy) throw new Error("Player owned option unavailable"); await copy.sheet.render(true);
    const table = game.tables.find(table => table.getFlag("ak5e", "rollTableId"));
    if (!table.testUserPermission(game.user, "OBSERVER")) throw new Error("Player table not visible");
    await table.draw();
    return { denied, classDenied, ownedOption: copy.name, visibleTables: game.tables.filter(table => table.getFlag("ak5e", "rollTableId") && table.visible).length };
  }, report.installation.actorId);
  await screenshot(player, "player-owned-option");
  const beforeReload = report.installation.tableIds;
  await gm.reload(); await gm.waitForFunction(() => game.ready && game.ak5e);
  report.reload = await gm.evaluate(({ actorId, canonicalId, customizedId }) => ({
    actorCopies: game.actors.get(actorId).items.size, canonicalId: game.items.get(canonicalId)?.id,
    canonicalRevision: game.items.get(canonicalId)?.getFlag("ak5e", "contentVersion"), customNote: game.items.get(customizedId)?.system.description.value.includes("P0 authored note"),
    tableIds: game.tables.filter(table => table.getFlag("ak5e", "rollTableId")).map(table => ({ id: table.id, sourceId: table.getFlag("ak5e", "rollTableId"), results: table.results.map(result => result.id) }))
  }), report.installation);
  assert.deepEqual(report.reload.tableIds, beforeReload); assert.ok(report.reload.customNote);
  assert.equal(report.reload.canonicalId, report.installation.canonicalId); assert.equal(report.reload.canonicalRevision, "0.3.8");
  assert.deepEqual(report.errors, [], "Browser errors");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
