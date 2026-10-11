/** Disposable standard-test World only. Use a private data copy and port.
 * AK5E_PLAYWRIGHT / AK5E_CHROMIUM select tools; AK5E_STANDARD_PORT selects localhost.
 * AK5E_STANDARD_RESTART_REPORT verifies a previous report without resetting fixtures. */
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium, {
  ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}),
  ...(process.env.AK5E_NATIVE_VULKAN ? { args: ["--disable-gpu-sandbox", "--ignore-gpu-blocklist", "--enable-webgl", "--use-angle=vulkan", "--use-vulkan=native", "--disable-vulkan-surface", "--enable-features=Vulkan"] } : {})
});
const report = { errors: [], screenshots: [] }, output = process.env.AK5E_STANDARD_OUTPUT ?? "/tmp/standard-bearer-live";
const contexts = [], port = Number(process.env.AK5E_STANDARD_PORT ?? 30135);
if (!Number.isInteger(port) || port < 1 || port > 65535) { await browser.close(); throw new Error("Invalid AK5E_STANDARD_PORT"); }
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", e => report.errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/join`);
  await page.selectOption('select[name="userid"]', { label: name });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready, null, { timeout: 45000 });
  if (await page.evaluate(() => game.world.id) !== "standard-test") throw new Error("Requires disposable standard-test World.");
  console.log(`Joined ${name}`);
  return page;
}
async function readyScene(page, sceneId) {
  await page.waitForFunction(id => canvas?.ready && !canvas.loading && canvas.scene?.id === id && canvas.pendingRenderFlags?.OBJECTS,
    sceneId, { timeout: 45000 });
}
async function closeChoosers(page) {
  await page.evaluate(async () => {
    for (const app of foundry.applications.instances.values()) if (app.element?.querySelector?.(".ak5e-skill-choices") || /UserConfig/.test(app.constructor.name)) await app.close();
  });
}
async function shot(page, name) {
  await closeChoosers(page);
  await page.mouse.move(20, 900);
  await page.evaluate(() => ui.tooltip?.deactivate());
  const path = `${output}-${name}.png`; await page.screenshot({ path }); report.screenshots.push(path);
}
function persisted(actorId) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const actor = game.actors.get(actorId);
  if (!actor || actor.getFlag("ak5e", "standardLiveTest") !== "bearer") throw new Error("Missing marked Standard Bearer fixture");
  const state = actor.getFlag("ak5e", "standardBearer"), scene = game.scenes.get(state.location?.sceneId) ?? game.scenes.active;
  return stable({ actorId, state, weaponIds: actor.items.filter(i => i.getFlag("ak5e", "standardWeapon")).map(i => i.id).sort(),
    actors: game.actors.filter(a => ["bearer", "ally", "hostile"].includes(a.getFlag("ak5e", "standardLiveTest"))).map(a => ({ id: a.id, hp: a.system.attributes.hp.toObject?.() ?? a.system.attributes.hp,
      flags: a.flags.ak5e,
      effects: a.effects.map(e => ({ id: e.id, flags: e.flags.ak5e })).sort((a, b) => a.id.localeCompare(b.id)) })).sort((a, b) => a.id.localeCompare(b.id)),
    sceneId: scene.id, props: scene.tokens.filter(t => t.getFlag("ak5e", "standardProp")?.bearerUuid === actor.uuid).map(t => t.id).sort(),
    templates: scene.templates.filter(t => t.getFlag("ak5e", "standardAura")?.bearerUuid === actor.uuid).map(t => ({ id: t.id, x: t.x, y: t.y, distance: t.distance })).sort((a, b) => a.id.localeCompare(b.id)) });
}
try {
  const gm = await join("Gamemaster");
  if (!await gm.evaluate(() => game.modules.get("ak5e").active)) {
    await gm.evaluate(() => game.settings.set("core", "moduleConfiguration", { ak5e: true }));
    await gm.reload(); await gm.waitForFunction(() => game.ready && game.ak5e);
  }
  report.environment = await gm.evaluate(() => ({ foundry: game.version, system: game.system.version, module: game.modules.get("ak5e").version, world: game.world.id }));
  if (process.env.AK5E_STANDARD_RESTART_REPORT) {
    const previous = JSON.parse(await readFile(process.env.AK5E_STANDARD_RESTART_REPORT, "utf8"));
    await readyScene(gm, previous.persistence.sceneId);
    report.persistence = await gm.evaluate(persisted, previous.persistence.actorId);
    if (JSON.stringify(previous.persistence) !== JSON.stringify(report.persistence)) throw new Error("Standard Bearer state changed across server restart");
    report.restart = true;
    await gm.evaluate(async id => { await game.actors.get(id).sheet.render(true); }, report.persistence.actorId);
    await gm.waitForFunction(() => document.querySelector(".ak5e-standard-controls"));
    // This fixture deliberately leaves its three earned Skill tiers unchosen.
    // Await that asynchronous render before closing it for the sheet screenshot.
    await gm.waitForFunction(() => document.querySelector(".ak5e-skill-choices"));
    await shot(gm, "restart");
  } else {
  const initialScene = await gm.evaluate(() => game.scenes.active?.id);
  if (initialScene) await readyScene(gm, initialScene);
  report.fixture = await gm.evaluate(async () => {
    const rules = await import("/modules/ak5e/scripts/standard-bearer-rules.mjs");
    const { CHAPTER_THREE_CLASSES: entries } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const previous = game.actors.filter(a => ["bearer", "ally", "hostile"].includes(a.getFlag("ak5e", "standardLiveTest")));
    const bearers = previous.filter(a => a.getFlag("ak5e", "standardLiveTest") === "bearer"), actorUuids = new Set(bearers.map(a => a.uuid));
    const scenes = game.scenes.filter(s => s.getFlag("ak5e", "standardLiveTest") === true);
    const { waitForStandardOperations } = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    for (const actor of bearers) {
      await actor.unsetFlag("ak5e", "standardBearer");
      await waitForStandardOperations(actor);
      // An already-running refresh may have saved its snapshot before the barrier.
      await actor.unsetFlag("ak5e", "standardBearer");
    }
    for (const combat of game.combats.filter(c => scenes.some(s => s.id === c.scene?.id))) await combat.delete();
    for (const scene of game.scenes) {
      for (const template of scene.templates.filter(t => actorUuids.has(t.getFlag("ak5e", "standardAura")?.bearerUuid))) await template.delete();
      for (const token of scene.tokens.filter(t => actorUuids.has(t.getFlag("ak5e", "standardProp")?.bearerUuid))) await token.delete({ ak5eStandardSync: true });
    }
    for (const scene of scenes) await scene.delete();
    for (const prop of game.actors.filter(a => actorUuids.has(a.getFlag("ak5e", "standardPropActor")))) await prop.delete();
    for (const a of previous) await a.delete();
      const user = game.users.getName("Standard Player") ?? await User.implementation.create({ name: "Standard Player", role: 1, password: "" });
      const observer = game.users.getName("Standard Observer") ?? await User.implementation.create({ name: "Standard Observer", role: 1, password: "" });
      const actor = await Actor.implementation.create({ name: "Standard Bearer test", type: "character", ownership: { [user.id]: 3 },
        flags: { ak5e: { standardLiveTest: "bearer" } }, system: { abilities: { cha: { value: 16 } }, attributes: { hp: { value: 50, max: 50 }, movement: { walk: 30 } } } });
      const source = entries.filter(e => e.id === "class-vanguard" || e.id === rules.STANDARD_BRANCH_ID || e.parentBranch === "Standard Bearer" || /tip-of-the-spear|directed-engagement/.test(e.id));
      await actor.createEmbeddedDocuments("Item", source.map(e => ({ name: e.name, type: e.itemType, system: { ...e.systemData, ...(e.itemType === "class" ? { levels: 17 } : {}) },
        flags: { ak5e: { chapterThreeId: e.id, sourceHeading: e.sourceHeading, rawSource: e.rawSource } } })));
      const ally = await Actor.implementation.create({ name: "Standard Ally", type: "character", ownership: { [user.id]: 3 }, flags: { ak5e: { standardLiveTest: "ally" } }, system: { attributes: { hp: { value: 20, max: 40 }, movement: { walk: 30 } } } });
      const hostile = await Actor.implementation.create({ name: "Standard Hostile", type: "npc", flags: { ak5e: { standardLiveTest: "hostile" } }, system: { attributes: { hp: { value: 40, max: 40 }, movement: { walk: 30 } } } });
      const scene = await Scene.implementation.create({ name: "Standard Bearer arena", width: 1800, height: 1400, padding: 0, tokenVision: false, grid: { type: 1, size: 100, distance: 5, units: "ft" }, flags: { ak5e: { standardLiveTest: true } } });
      const tokens = await scene.createEmbeddedDocuments("Token", [{ name: actor.name, actorId: actor.id, actorLink: true, x: 600, y: 500, disposition: 1 },
        { name: ally.name, actorId: ally.id, actorLink: true, x: 700, y: 500, disposition: 1 }, { name: hostile.name, actorId: hostile.id, actorLink: true, x: 800, y: 500, disposition: -1 },
        { name: "Private hostile", actorId: hostile.id, actorLink: false, x: 800, y: 600, hidden: true, disposition: -1 }]);
      await scene.activate();
      await actor.setFlag("ak5e", "standardLiveRefs", { source: tokens[0].uuid, ally: tokens[1].uuid, hostile: tokens[2].uuid, hidden: tokens[3].uuid, observerId: observer.id });
      return { actorId: actor.id, sceneId: scene.id, resetActors: previous.length };
  });
  await readyScene(gm, report.fixture.sceneId);
  await gm.evaluate(async ({ sceneId }) => {
      const scene = game.scenes.get(sceneId), tokens = scene.tokens.filter(t => !t.hidden);
      const combat = await Combat.implementation.create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", tokens.slice(0, 3).map((t, i) => ({ actorId: t.actorId, tokenId: t.id, sceneId: scene.id, initiative: 30 - i * 10 })));
      await combat.startCombat();
      if (game.paused) await game.togglePause(false, { broadcast: true });
  }, report.fixture);
  report.slice = await gm.evaluate(async ({ actorId }) => {
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const runtime = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    const rules = await import("/modules/ak5e/scripts/standard-bearer-rules.mjs");
    const actor = game.actors.get(actorId);
    const refs = actor.getFlag("ak5e", "standardLiveRefs"), source = await fromUuid(refs.source), ally = await fromUuid(refs.ally);
    const facts = { qualifying: true, action: true, reaction: true, allied: true, hostile: true, visible: true, hears: true, grounded: true, willing: true, notKilledOutright: true, damageReviewed: true };
    const cmd = async (command, extra = {}, id = foundry.utils.randomID()) => {
      const result = await runtime.submitStandardCommand(actor, command, { confirmation: true, sourceTokenUuid: source.uuid, targetTokenUuids: [ally.uuid], facts, ...extra }, id);
      const deadline = Date.now() + 15000;
      while (source.parent.templates.some(t => t.getFlag("ak5e", "standardAura")?.bearerUuid === actor.uuid && (!t.object?.shape || !t.object?.template))) {
        if (Date.now() > deadline) throw new Error(`Aura failed to draw after ${command}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return result;
    };
    if (!actor.getFlag("ak5e", "standardLiveComplete")) {
      await cmd("setup"); await cmd("setup");
      assert(actor.items.filter(i => i.getFlag("ak5e", "standardWeapon")).length === 1, "Duplicate weapon");
      const weapon = actor.items.find(i => i.getFlag("ak5e", "standardWeapon"));
      assert(weapon.system.activities.size > 0 && weapon.system.damage.base.denomination === 8, "Native weapon activity");
      await cmd("wield"); assert(source.parent.templates.find(t => t.getFlag("ak5e", "standardAura"))?.distance === 10, "10 foot aura");
      await cmd("plant"); assert(source.parent.templates.find(t => t.getFlag("ak5e", "standardAura"))?.distance === 25, "25 foot aura");
      const prop = source.parent.tokens.find(t => t.getFlag("ak5e", "standardProp")); assert(prop && prop.bar1.attribute === null, "Noncombat flag");
      await cmd("tip", { trigger: "planted" });
      for (const trigger of rules.FERVOUR_TRIGGERS) await cmd("fervour", { trigger });
      assert(rules.standardState(actor).fervour === 4, "Fervour trigger totals");
      await cmd("cry", { cry: "belligerant" });
      const cryId = Object.keys(rules.standardState(actor).cries).at(-1);
      await cmd("chorus", { cryId });
      await cmd("herald");
      await game.combat.nextTurn(); // King of the Hill expires at the recipient's current Turn end.
      await cmd("kingHill", { choice: "walk" });
      await game.combat.nextRound(); // Last Stand requires the bearer's own Turn.
      await cmd("expertise");
      await cmd("projection", { point: { x: 650, y: 550 }, outcomes: { [ally.uuid]: "friendly" } });
      assert(source.parent.templates.filter(t => t.getFlag("ak5e", "standardAura")).length === 2, "Projection dual aura");
      await cmd("lastStand");
      let locked = false; try { await cmd("pickup"); } catch { locked = true; } assert(locked, "Last Stand locks pickup");
      await cmd("extraTurn");
      await actor.setFlag("ak5e", "standardLiveComplete", true);
    }
    await actor.sheet.render(true);
    await weaponSheet();
    async function weaponSheet() { await actor.items.find(i => i.getFlag("ak5e", "standardWeapon")).sheet.render(true); }
    const gl = document.createElement("canvas").getContext("webgl"), debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return { actorId: actor.id, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable", foundry: game.version, system: game.system.version,
      fervour: rules.standardState(actor).fervour, mode: rules.standardState(actor).mode, prop: rules.standardState(actor).propTokenUuid,
      activities: actor.items.filter(i => i.getFlag("ak5e", "standardHelperVersion")).length, allyEffects: ally.actor.effects.size };
  }, report.fixture);
  await gm.waitForFunction(() => document.querySelector(".ak5e-standard-controls"), null, { timeout: 10000 });
  await gm.waitForFunction(() => canvas.templates.placeables.filter(t => t.document.getFlag("ak5e", "standardAura")).every(t => t.shape && t.template));
  await shot(gm, "gm");
  await gm.evaluate(id => { void game.ak5e.openStandardBearer(game.actors.get(id)); }, report.slice.actorId);
  await gm.waitForFunction(() => document.querySelector(".ak5e-standard-panel"));
  await shot(gm, "controls");
  report.layout = await gm.evaluate(() => [...document.querySelectorAll(".ak5e-standard-buttons button")].map(button => {
    const text = document.createRange(); text.selectNodeContents(button);
    const bounds = text.getBoundingClientRect(), box = button.getBoundingClientRect();
    return { label: button.textContent, fits: bounds.left >= box.left && bounds.right <= box.right + 1 && bounds.top >= box.top && bounds.bottom <= box.bottom + 1 };
  }));
  if (report.layout.some(button => !button.fits)) throw new Error("Standard Bearer button label overflow");
  for (const action of ["cry", "tip", "projection"]) {
    await gm.locator(`[data-standard-action="${action}"]`).click();
    await gm.waitForFunction(() => document.querySelector(".ak5e-standard-form"));
    await shot(gm, `dialog-${action}`);
    await gm.keyboard.press("Escape");
    await gm.waitForFunction(() => !document.querySelector(".ak5e-standard-form") && document.querySelector(".ak5e-standard-panel"));
  }
  report.dialogs = ["cry", "tip", "projection"];
  // Interrupt only a marked fixture recipient's first receipt write. runAction
  // retains the exact confirmed choices; the real Retry button must reuse them.
  const retryFixture = await gm.evaluate(async id => {
    for (const app of foundry.applications.instances.values()) if (app.element?.querySelector?.(".ak5e-standard-panel")) await app.close();
    const actor = game.actors.get(id), refs = actor.getFlag("ak5e", "standardLiveRefs"), ally = (await fromUuid(refs.ally)).actor;
    const { submitStandardCommand } = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    await submitStandardCommand(actor, "directed", { confirmation: true, sourceTokenUuid: refs.source, facts: { reaction: true, qualifying: true } });
    const original = ally.update;
    ally.update = async function(changes, options) {
      if (Object.keys(changes).some(key => key.startsWith("flags.ak5e.standardApplications."))) {
        this.update = original;
        throw new Error("Standard live test injected receipt failure");
      }
      return original.call(this, changes, options);
    };
    globalThis.standardLiveRestore = () => { ally.update = original; };
    globalThis.standardLiveFailure = null;
    const { runAction } = await import("/modules/ak5e/scripts/standard-bearer-sheet.mjs");
    void runAction(actor, "tip", refs.source).then(() => { globalThis.standardLiveFailure = "unexpected success"; }, error => { globalThis.standardLiveFailure = error.message; });
    return { allyUuid: refs.ally, temp: ally.system.attributes.hp.temp ?? 0 };
  }, report.slice.actorId);
  try {
    await gm.waitForFunction(() => document.querySelector(".ak5e-standard-form"));
    const form = gm.locator(".ak5e-standard-form");
    await form.locator(`input[name="targetTokenUuids"][value="${retryFixture.allyUuid}"]`).check();
    await form.locator('select[name="tipChoice"]').selectOption("2");
    for (const name of ["fact-allied", "fact-visible", "fact-qualifying", "confirmation"]) await form.locator(`input[name="${name}"]`).check();
    await gm.locator('button[data-action="submit"]').click();
    await gm.waitForFunction(() => globalThis.standardLiveFailure !== null);
    if (await gm.evaluate(() => globalThis.standardLiveFailure) !== "Standard live test injected receipt failure") throw new Error("Expected injected failure was not observed");
    await gm.evaluate(id => { void game.ak5e.openStandardBearer(game.actors.get(id)); }, report.slice.actorId);
    await gm.waitForFunction(() => document.querySelector("[data-standard-retry]"));
    await shot(gm, "retry-pending");
    const pendingId = await gm.evaluate(id => game.actors.get(id).getFlag("ak5e", "standardBearer").operations.find(op => op.status === "prepared").id, report.slice.actorId);
    await gm.locator("[data-standard-retry]").click();
    await gm.waitForFunction(({ id, pendingId }) => game.actors.get(id).getFlag("ak5e", "standardBearer").operations.find(op => op.id === pendingId)?.status === "committed", { id: report.slice.actorId, pendingId });
    report.retry = await gm.evaluate(async ({ id, pendingId, before }) => {
      const actor = game.actors.get(id), op = actor.getFlag("ak5e", "standardBearer").operations.find(op => op.id === pendingId);
      const ally = (await fromUuid(actor.getFlag("ak5e", "standardLiveRefs").ally)).actor;
      const rolled = Object.values(op.rolls).reduce((sum, value) => sum + value, 0);
      if (ally.system.attributes.hp.temp !== before + rolled) throw new Error("Retry did not apply each stored roll exactly once");
      return { operationId: pendingId, status: op.status, rolled, before, after: ally.system.attributes.hp.temp };
    }, { id: report.slice.actorId, pendingId, before: retryFixture.temp });
  } finally { await gm.evaluate(() => { globalThis.standardLiveRestore?.(); delete globalThis.standardLiveRestore; }); }
  const player = await join("Standard Player");
  report.player = await player.evaluate(async id => {
    const runtime = await import("/modules/ak5e/scripts/standard-bearer.mjs"), actor = game.actors.get(id), refs = actor.getFlag("ak5e", "standardLiveRefs");
    const source = await fromUuid(refs.source); await source.parent.view();
    const view = await runtime.getStandardView(actor); if (view.targets.some(t => t.uuid === refs.hidden)) throw new Error("Hidden target privacy");
    await actor.sheet.render(true); return { targetCount: view.targets.length, hiddenExcluded: true };
  }, report.slice.actorId);
  await readyScene(player, report.fixture.sceneId);
  await player.evaluate(id => { void game.ak5e.openStandardBearer(game.actors.get(id)); }, report.slice.actorId);
  await player.waitForFunction(() => document.querySelector(".ak5e-standard-panel"));
  await shot(player, "player");
  report.playerRequest = await player.evaluate(async id => {
    const actor = game.actors.get(id), refs = actor.getFlag("ak5e", "standardLiveRefs");
    const { submitStandardCommand } = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    return submitStandardCommand(actor, "endStand", { confirmation: true, sourceTokenUuid: refs.source, facts: { action: true } }, "live-player-endstand");
  }, report.slice.actorId);
  const observer = await join("Standard Observer");
  report.unauthorized = await observer.evaluate(async id => {
    const { submitStandardCommand } = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    try { await submitStandardCommand(game.actors.get(id), "setup", { confirmation: true }, "live-observer-denied"); return false; } catch { return true; }
  }, report.slice.actorId);
  if (!report.unauthorized) throw new Error("Unauthorized observer mutation");
  report.refresh = await gm.evaluate(async id => {
    const actor = game.actors.get(id), source = await fromUuid(actor.getFlag("ak5e", "standardLiveRefs").source);
    await source.update({ x: source.x + 100 }); await source.update({ x: source.x - 100 });
    await game.combat.nextTurn(); await game.combat.nextTurn(); await game.combat.nextRound();
    const { syncStandardMap } = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    for (let n = 0; n < 3; n++) await syncStandardMap(actor);
    const { waitForStandardOperations } = await import("/modules/ak5e/scripts/standard-bearer.mjs");
    await waitForStandardOperations(actor);
    const { createOperationKernel } = await import("/modules/ak5e/scripts/operation-kernel.mjs");
    const state = structuredClone(actor.getFlag("ak5e", "standardBearer"));
    const unchanged = await actor.update({ "flags.ak5e.standardBearer": structuredClone(state) });
    const kernel = createOperationKernel({ label: "Standard Bearer", stateFlag: "standardBearer" });
    const original = actor.update;
    let noOpWrites = 0;
    actor.update = async function(...args) { noOpWrites++; return original.apply(this, args); };
    try { await kernel.saveState(actor, structuredClone(state)); await kernel.saveState(actor, structuredClone(state)); }
    finally { actor.update = original; }
    if (noOpWrites) throw new Error("Unchanged kernel saves wrote to the database");
    return { nativeNoopReturnedUndefined: unchanged === undefined, noOpWrites };
  }, report.slice.actorId);
  const beforeReload = await gm.evaluate(persisted, report.slice.actorId);
  await gm.reload(); await gm.waitForFunction(() => game.ready && game.ak5e);
  await readyScene(gm, report.fixture.sceneId);
  report.persistence = await gm.evaluate(persisted, report.slice.actorId);
  if (!report.persistence.props.length || report.persistence.weaponIds.length !== 1 || JSON.stringify(beforeReload) !== JSON.stringify(report.persistence)) throw new Error("Reload persistence");
  }
  if (report.errors.length) throw new Error(`Unexpected browser errors: ${report.errors.join("; ")}`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.message;
  const page = contexts[0]?.pages()[0];
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${output}-failure.png` }).catch(() => {});
    report.canvas = await page.evaluate(() => ({ ready: globalThis.canvas?.ready, loading: globalThis.canvas?.loading, scene: globalThis.canvas?.scene?.id })).catch(() => null);
  }
  throw error;
}
finally {
  try { await writeFile(`${output}.json`, JSON.stringify(report, null, 2)); }
  finally { await Promise.allSettled(contexts.map(context => context.close())); await browser.close(); }
}
