/**
 * Live Foundry V13 + D&D5e browser validation for the Guard class and the Artsblade branch (B-153).
 * Joins as the Gamemaster and as a non-GM player and exercises, for each workflow that changes something:
 * confirm -> (Cancel writes nothing) -> Use -> owner-clicked roll / target-owner save -> relayed target change -> undo.
 * Uses launchTestBrowser() from ./test-browser.mjs per WORKFLOW.md §5.3 and closes the browser in `finally`.
 *
 * Usage (a disposable Foundry V13 server with the standard-test World, AK5e installed and enabled):
 *   AK5E_TEST_PORT=30191 [AK5E_TEST_OUTPUT=<dir>] [AK5E_PLAYWRIGHT=<path to playwright/index.mjs>] node ak5e/tools/test-guard-live.mjs
 * Writes <dir>/browser-report.json and the screenshots listed in it. It never views or judges the images.
 *
 * Covered: Martial DC ability chooser (confirm, Cancel, undo); Press the Attack: Smite with a real cost preview, Cancel
 * and undo; Unrelenting with Eternal Aggression (the 1d4 waits for the clicked Roll; undo); Guard setup/progression
 * idempotency and the granted Artsblade source Features; Augmented Assault; Blade Art (selected pool, native NPC save by
 * the GM, "already made" preview, expiry at the next Turn, relayed effect, undo); Cut Through Chaos with a selected
 * native melee weapon (Reaction spent, undone); Spellsword Art at the fixed maximum level; a level-13 chooser Cancel;
 * an overridden shortfall that clamps at 0; encounter lock after combat end; every branch's control panel opens
 * without writing. The run fails on any console or page error.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

let chromium;
for (const candidate of [process.env.AK5E_PLAYWRIGHT, "playwright", "/tmp/frontier-browser-check/node_modules/playwright/index.mjs"].filter(Boolean)) {
  try {
    const mod = await import(candidate);
    if (mod.chromium) { chromium = mod.chromium; break; }
  } catch {
    // try the next candidate
  }
}
if (!chromium) throw new Error("Could not load Playwright chromium module (set AK5E_PLAYWRIGHT).");

const port = process.env.AK5E_TEST_PORT ?? process.env.AK5E_PORT ?? "30191";
const outputDir = process.env.AK5E_TEST_OUTPUT ?? process.env.AK5E_GUARD_OUTPUT ?? "/tmp/ak5e-guard-live";
const joinUrl = `http://127.0.0.1:${port}/join`;
const PLAYER_NAME = "AK5e U1 Player";
const report = { world: "standard-test", port, steps: [], checks: [], errors: [], screenshots: [], renderer: null, passed: false };
await mkdir(outputDir, { recursive: true });

const browser = await launchTestBrowser(chromium, process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {});
const contexts = [];

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push(`${name}: ${message.text()} @ ${JSON.stringify(message.location())}`);
  });
  await page.goto(joinUrl);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 20000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.canvas?.ready, null, { timeout: 90000 });
  await page.evaluate(() => {
    for (const app of foundry.applications.instances.values()) if (/UserConfig/.test(app.constructor.name)) void app.close();
  });
  const safety = await page.evaluate(() => ({ world: game.world.id, system: game.system.id, isGM: game.user.isGM }));
  if (safety.world !== "standard-test" || safety.system !== "dnd5e") throw new Error(`Refusing non-test runtime: ${JSON.stringify(safety)}`);
  return page;
}

async function shot(page, filename) {
  const path = `${outputDir}/${filename}`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}

function check(name, pass, detail = null) {
  report.checks.push({ name, result: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) throw new Error(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail) ?? "assertion failed"}`);
}

const snapshot = (page, actorId) => page.evaluate(id => {
  const actor = game.actors.get(id);
  const pool = name => { try { return game.ak5e.resourcePools.getPool(actor, name)?.value ?? null; } catch { return null; } };
  return {
    aggression: pool("aggression"), unrelenting: pool("unrelenting"), sp: pool("spellswordPoints"), cut: pool("cutThroughChaos"),
    receipts: actor.getFlag("ak5e", "guardUses")?.undo?.length ?? 0, martialDC: actor.getFlag("ak5e", "guard")?.martialDCAbility ?? null,
    messages: game.messages.size
  };
}, actorId);
const lastReceipt = (page, actorId, command) => page.evaluate(({ id, command }) => [...(game.actors.get(id).getFlag("ak5e", "guardUses")?.undo ?? [])].reverse()
  .find(entry => !command || entry.command === command) ?? null, { id: actorId, command });
const receiptById = (page, actorId, useId) => page.evaluate(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.find(entry => entry.id === useId) ?? null, { id: actorId, useId });

async function closeGuardDialogs(page) {
  await page.evaluate(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.element?.querySelector?.(".ak5e-guard-dialog")) await app.close();
    }
  });
  await page.waitForTimeout(200);
}
async function openControls(page, actorId) {
  await closeGuardDialogs(page);
  await page.evaluate(id => { void game.ak5e.guard.open(game.actors.get(id)); }, actorId);
  await page.locator(".ak5e-guard-dialog").last().waitFor({ state: "visible" });
}
const reactionsAvailable = (page, actorId) => page.evaluate(async id => (await import("/modules/ak5e/scripts/trigger-events.mjs")).getReactions(game.actors.get(id))?.available ?? null, actorId);
const guardButton = (page, command) => page.locator(`.ak5e-guard-dialog button[data-guard-cmd="${command}"]`).last();
const promptWith = (page, selector) => page.locator(`dialog:has(${selector})`).last();
const useButton = page => page.getByRole("button", { name: /^Use( anyway)?$/ }).last();
const confirmText = page => page.locator("dialog").last().innerText();
async function showChat(page) {
  await page.evaluate(async () => { ui.sidebar.changeTab("chat", "primary"); ui.sidebar.expand(); await ui.chat.scrollBottom({ waitImages: true }); });
}
/** Click the "Roll ..." control on the newest use card for this Actor. The card control opens the confirm; Use rolls. */
async function clickCardRoll(page, pattern) {
  await showChat(page);
  const roll = page.locator(".ak5e-play-use-controls button").filter({ hasText: pattern }).last();
  await roll.waitFor({ state: "visible" });
  await roll.evaluate(el => el.scrollIntoView({ block: "center", inline: "center" }));
  await roll.evaluate(el => el.click());
}
async function undoFromList(page, actorId, useId) {
  await openControls(page, actorId);
  await page.locator('.ak5e-guard-dialog button[data-guard-act="__undo"]').last().click();
  const list = promptWith(page, 'input[name="useId"]');
  await list.waitFor({ state: "visible" });
  await list.locator(`input[name="useId"][value="${useId}"]`).check();
  await list.getByRole("button", { name: "Review undo", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Undo this use", exact: true }).last();
  await confirm.waitFor({ state: "visible" });
  const text = await confirmText(page);
  await confirm.click();
  await page.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.find(entry => entry.id === useId)?.status === "undone",
    { id: actorId, useId }, { timeout: 20000 });
  await closeGuardDialogs(page);
  return text;
}
async function answerAbility(page, ability) {
  const prompt = promptWith(page, 'select[name="ability"]');
  await prompt.waitFor({ state: "visible" });
  await page.selectOption('select[name="ability"]', ability);
  await prompt.locator('button[data-action="ok"]').click();
}

try {
  const gm = await join("Gamemaster");
  check("GM role", await gm.evaluate(() => game.user.isGM));
  check("AK5e active with the Guard API", await gm.evaluate(() => game.modules.get("ak5e")?.active === true && Boolean(game.ak5e?.guard?.open && game.ak5e?.guard?.use && game.ak5e?.guard?.previewUse)));
  report.environment = await gm.evaluate(() => ({
    foundry: game.version, dnd5e: game.system.version, module: game.modules.get("ak5e")?.version, world: game.world.id,
    renderer: (() => { const ext = canvas?.app?.renderer?.gl?.getExtension("WEBGL_debug_renderer_info"); return ext ? canvas.app.renderer.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable"; })()
  }));
  report.renderer = report.environment.renderer;
  await shot(gm, "guard-01-gm-world.png");

  /* ------------------------------------------------------------------ fixture (GM) */
  const fixture = await gm.evaluate(async playerName => {
    const suffix = foundry.utils.randomID();
    const player = game.users.getName(playerName) ?? await User.implementation.create({ name: playerName, role: 1, password: "" });
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { CHAPTER_FIVE_ARTS } = await import("/modules/ak5e/scripts/chapter-five-content.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    const classEntry = CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-guard");
    const branchEntry = CHAPTER_THREE_CLASSES.find(entry => entry.id === "subclass-guard-artsblade");
    const iceSheet = CHAPTER_FIVE_ARTS.find(entry => entry.name === "Ice Sheet");
    if (!classEntry || !branchEntry || iceSheet?.level !== 2) throw new Error("Missing source-backed Guard, Artsblade, or level-2 Frost Art record.");
    const scene = await Scene.implementation.create({ name: `AK5e U1 Arena ${suffix}`, width: 2200, height: 1200, padding: 0,
      tokenVision: false, grid: { type: 1, size: 100, distance: 5, units: "ft" }, flags: { ak5e: { u1Disposable: suffix } } });
    const character = async (name, level, x, { branch = true, extra = {} } = {}) => {
      const actor = await Actor.implementation.create({ name: `${name} ${suffix}`, type: "character", ownership: { default: 0, [player.id]: 3 },
        system: { abilities: { str: { value: 18 }, dex: { value: 14 }, con: { value: 16 }, int: { value: 12 }, wis: { value: 12 }, cha: { value: 10 } },
          details: { level }, attributes: { prof: level >= 9 ? 4 : 3, hp: { value: 73, max: 81, temp: 5 }, movement: { walk: 30 } },
          currency: { cp: 417, sp: 0, ep: 0, gp: 2, pp: 0 } },
        flags: { ak5e: { u1Disposable: suffix, ...extra } } });
      const classData = sourceEntryData(classEntry); classData.system.levels = level;
      await actor.createEmbeddedDocuments("Item", [classData, ...(branch ? [sourceEntryData(branchEntry)] : []),
        { name: "Acceptance Longsword", type: "weapon", system: { equipped: true, proficient: 1, quantity: 1, type: { value: "martialM" } }, flags: { ak5e: { u1Disposable: suffix } } }]);
      const tokenData = await actor.getTokenDocument({ x, y: 300 });
      tokenData.updateSource({ name: actor.name, actorLink: true, disposition: 1 });
      const token = (await scene.createEmbeddedDocuments("Token", [tokenData.toObject()]))[0];
      return { actor, token };
    };
    const artsblade = await character("Frost Artsblade", 5, 300);
    const advanced = await character("Level 13 Artsblade", 13, 800);
    const eternal = await character("Level 18 Guard", 18, 1100, { branch: false, extra: { guard: { enabled: true } } });
    const npc = await Actor.implementation.create({ name: `NPC Save Target ${suffix}`, type: "npc", ownership: { default: 0 },
      system: { abilities: { con: { value: 1 } }, attributes: { hp: { value: 40, max: 40 } } }, flags: { ak5e: { u1Disposable: suffix } } });
    const npcTokenData = await npc.getTokenDocument({ x: 500, y: 300 });
    npcTokenData.updateSource({ name: npc.name, actorLink: true, disposition: -1 });
    const npcToken = (await scene.createEmbeddedDocuments("Token", [npcTokenData.toObject()]))[0];
    await artsblade.actor.createEmbeddedDocuments("Item", [sourceEntryData(iceSheet)]);
    await advanced.actor.update({
      "flags.ak5e.guard.enabled": true, "flags.ak5e.guardProgression.choices.artPools": ["frost"],
      "flags.ak5e.guardProgression.choices.additionalArtPools": ["crude", "flame"],
      "flags.ak5e.resourcePools.aggression": { value: 4, max: 6 }, "flags.ak5e.resourcePools.spellswordPoints": { value: 2, max: 2 }
    });
    await eternal.actor.update({
      "flags.ak5e.resourcePools.aggression": { value: 2, max: 8 }, "flags.ak5e.resourcePools.unrelenting": { value: 2, max: 2 }
    });
    await scene.activate();
    return { suffix, playerId: player.id, sceneId: scene.id,
      artsbladeId: artsblade.actor.id, artsbladeTokenId: artsblade.token.id, weaponId: artsblade.actor.items.find(item => item.type === "weapon").id,
      weaponUuid: artsblade.actor.items.find(item => item.type === "weapon").uuid,
      advancedId: advanced.actor.id, eternalId: eternal.actor.id, npcId: npc.id, npcTokenId: npcToken.id };
  }, PLAYER_NAME);
  report.fixture = fixture;

  const player = await join(PLAYER_NAME);
  check("player is non-GM", !await player.evaluate(() => game.user.isGM));
  check("Artsblade and Guard are owned by the player, the NPC is not", await player.evaluate(({ a, e, n }) => game.actors.get(a)?.isOwner && game.actors.get(e)?.isOwner && !game.actors.get(n)?.isOwner,
    { a: fixture.artsbladeId, e: fixture.eternalId, n: fixture.npcId }));

  /* ------------------------------------------------------------------ progression and setup (player) */
  const progressionChoices = {
    saves: ["con"], skills: ["ath", "acr", "ins"], fightingStyle: "defensive", startingEquipment: { mode: "cash" }, artPools: ["frost"],
    hp: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), { mode: "existing" }])), asi: { 4: { mode: "existing" } }
  };
  const progression = await player.evaluate(async ({ actorId, choices }) => {
    const actor = game.actors.get(actorId), api = game.ak5e.guard;
    const plan = await api.previewProgression(actor, choices);
    if (plan.pending.length) throw new Error(`Guard progression pending: ${plan.pending.join(", ")}`);
    await api.applyProgression(actor, { ...choices, confirmed: true, contextKey: plan.contextKey });
    const snap = () => ({ hp: { ...actor.system.attributes.hp }, str: actor.system.abilities.str.value, currency: { ...actor.system.currency }, items: actor.items.map(item => item.id).sort() });
    const before = snap();
    const repeat = await api.previewProgression(actor, choices);
    await api.applyProgression(actor, { ...choices, confirmed: true, contextKey: repeat.contextKey });
    const featureNames = actor.items.filter(item => item.flags?.ak5e?.chapterThreeId?.startsWith("subclass-feature-guard-artsblade")).map(item => item.name);
    let rejected = null;
    try { await api.previewProgression(actor, { ...choices, asi: { 4: { increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 1 }] } } }); }
    catch (error) { rejected = error.message; }
    return { unchanged: JSON.stringify(before) === JSON.stringify(snap()), pools: actor.getFlag("ak5e", "guardProgression")?.choices?.artPools ?? [], featureNames, rejected,
      hpLevels: actor.getFlag("ak5e", "guardProgression")?.hpLevels };
  }, { actorId: fixture.artsbladeId, choices: progressionChoices });
  report.progression = progression;
  check("Frost-only progression is idempotent", progression.unchanged && progression.pools.length === 1 && progression.pools[0] === "frost", progression);
  check("explicitly supplied levels are recorded as granted", progression.hpLevels?.length === 5, progression.hpLevels);
  check("progression grants the Artsblade source Features at their levels (L1, L4)", ["Sword and Sorcery", "Resonance", "Blade Art", "Cut Through Chaos"].every(name => progression.featureNames.some(entry => entry.includes(name)))
    && !progression.featureNames.some(entry => entry.includes("Sharpened Mind")), progression.featureNames);
  check("an impossible Ability Score Improvement is rejected before anything is written", /must be \+2 to one ability or \+1 to two/.test(progression.rejected ?? ""), progression.rejected);

  const setup = await player.evaluate(async actorId => {
    const actor = game.actors.get(actorId), api = game.ak5e.guard;
    const stale = await api.preview(actor);
    const probe = await actor.createEmbeddedDocuments("Item", [{ name: "1st Level: Guard Branch", type: "feat", flags: { ak5e: { chapterThreeId: "class-feature-guard-1st-level-guard-branch-2128", u1SetupProbe: true } } }]);
    let staleRejected = false;
    try { await api.apply(actor, { confirmed: true, contextKey: stale.contextKey }); } catch (error) { staleRejected = /changed since the preview/.test(error.message); }
    await actor.deleteEmbeddedDocuments("Item", probe.map(item => item.id));
    const current = await api.preview(actor);
    await api.apply(actor, { confirmed: true, contextKey: current.contextKey });
    const first = actor.items.map(item => item.id).sort();
    const repeat = await api.preview(actor);
    await api.apply(actor, { confirmed: true, contextKey: repeat.contextKey });
    return { staleRejected, idempotent: JSON.stringify(first) === JSON.stringify(actor.items.map(item => item.id).sort()) };
  }, fixture.artsbladeId);
  check("Guard setup rejects a stale contextKey and is idempotent", setup.staleRejected && setup.idempotent, setup);

  /* ------------------------------------------------------------------ Martial DC chooser */
  await player.evaluate(({ actorId, tokenId }) => { canvas.tokens.setTargets([tokenId]); game.actors.get(actorId).sheet.render(true); }, { actorId: fixture.artsbladeId, tokenId: fixture.npcTokenId });
  await player.locator(".sheet.actor").waitFor({ state: "visible", timeout: 20000 });
  await player.locator('.sheet.actor .tabs [data-tab="features"]').last().click();
  await player.locator(".ak5e-guard-sheet-panel button").filter({ hasText: "Open Guard Controls" }).click();
  await player.locator(".ak5e-guard-dialog").waitFor({ state: "visible" });
  check("Guard Controls opens with the Martial DC line and no stored choice yet",
    /Martial DC:\s*\d+ \(higher of STR\/DEX until you choose\)/.test(await player.locator(".ak5e-guard-dialog").last().innerText()));
  await shot(player, "guard-02-player-controls.png");
  await player.keyboard.press("Escape");
  await player.evaluate(id => game.actors.get(id)?.sheet?.close(), fixture.artsbladeId);

  const dcBefore = await snapshot(player, fixture.artsbladeId);
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "chooseMartialDC").click();
  const preselected = await promptWith(player, 'select[name="ability"]').locator('select[name="ability"]').inputValue();
  check("the Martial DC prompt starts on the higher modifier (STR)", preselected === "str", preselected);
  await promptWith(player, 'select[name="ability"]').getByRole("button", { name: "Cancel", exact: true }).click();
  await player.waitForTimeout(250);
  check("Cancel on the Martial DC prompt writes nothing", JSON.stringify(await snapshot(player, fixture.artsbladeId)) === JSON.stringify(dcBefore), dcBefore);
  await guardButton(player, "chooseMartialDC").click();
  await answerAbility(player, "dex");
  await useButton(player).waitFor({ state: "visible" });
  check("the Martial DC confirm names the choice use", /Choose Martial DC ability/.test(await confirmText(player)));
  await shot(player, "guard-03-martial-dc-confirm.png");
  await player.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await player.waitForTimeout(250);
  check("Cancel on the Martial DC confirm writes nothing", JSON.stringify(await snapshot(player, fixture.artsbladeId)) === JSON.stringify(dcBefore));
  await guardButton(player, "chooseMartialDC").click();
  await answerAbility(player, "dex");
  await useButton(player).click();
  await player.waitForFunction(id => game.actors.get(id).getFlag("ak5e", "guard")?.martialDCAbility === "dex", fixture.artsbladeId);
  const dexUse = await lastReceipt(player, fixture.artsbladeId, "chooseMartialDC");
  check("the Martial DC choice is stored and recorded in the ledger", dexUse.result?.martialDCAbility === "dex" && dexUse.result.martialDC === 13, dexUse.result);
  await undoFromList(player, fixture.artsbladeId, dexUse.id);
  check("undo removes the stored Martial DC choice", (await snapshot(player, fixture.artsbladeId)).martialDC === null);
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "chooseMartialDC").click();
  await answerAbility(player, "str");
  await useButton(player).click();
  await player.waitForFunction(id => game.actors.get(id).getFlag("ak5e", "guard")?.martialDCAbility === "str", fixture.artsbladeId);
  check("STR is stored as this character's Martial DC ability", (await snapshot(player, fixture.artsbladeId)).martialDC === "str");
  await closeGuardDialogs(player);

  /* ------------------------------------------------------------------ Smite: real preview, Cancel, Use, undo */
  const smiteBefore = await snapshot(player, fixture.artsbladeId);
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "smite").click();
  const amountPrompt = promptWith(player, 'input[name="amount"]');
  await amountPrompt.waitFor({ state: "visible" });
  await amountPrompt.locator('button[data-action="ok"]').click();
  await useButton(player).waitFor({ state: "visible" });
  const smiteText = await confirmText(player);
  check("Smite's confirm states its cost and nothing has been spent yet", /Cost:\s*1 Aggression/.test(smiteText) && (await snapshot(player, fixture.artsbladeId)).aggression === smiteBefore.aggression, smiteText);
  await shot(player, "guard-04-smite-preview.png");
  await player.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await player.waitForTimeout(250);
  const smiteCancelled = await snapshot(player, fixture.artsbladeId);
  check("Cancel on Smite's confirm writes nothing", smiteCancelled.aggression === smiteBefore.aggression && smiteCancelled.receipts === smiteBefore.receipts && smiteCancelled.messages === smiteBefore.messages, smiteCancelled);
  await guardButton(player, "smite").click();
  await amountPrompt.waitFor({ state: "visible" });
  await amountPrompt.locator('button[data-action="ok"]').click();
  await useButton(player).click();
  await player.waitForFunction(({ id, receipts }) => (game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.length ?? 0) > receipts, { id: fixture.artsbladeId, receipts: smiteBefore.receipts });
  const smiteUse = await lastReceipt(player, fixture.artsbladeId, "smite");
  check("Smite spends 1 Aggression once confirmed", (await snapshot(player, fixture.artsbladeId)).aggression === smiteBefore.aggression - 1 && smiteUse.result?.damageBonus === 3, smiteUse.result);
  await undoFromList(player, fixture.artsbladeId, smiteUse.id);
  check("undo restores the Aggression Smite spent", (await snapshot(player, fixture.artsbladeId)).aggression === smiteBefore.aggression);

  /* ------------------------------------------------------------------ Eternal Aggression: the 1d4 waits for the clicked Roll */
  const eternalBefore = await snapshot(player, fixture.eternalId);
  await openControls(player, fixture.eternalId);
  await guardButton(player, "unrelenting").click();
  await useButton(player).waitFor({ state: "visible" });
  check("Unrelenting's confirm states its cost", /Cost:\s*1 Unrelenting/.test(await confirmText(player)));
  await useButton(player).click();
  await player.waitForFunction(({ id, receipts }) => (game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.length ?? 0) > receipts, { id: fixture.eternalId, receipts: eternalBefore.receipts });
  const eternalUse = await lastReceipt(player, fixture.eternalId, "unrelenting");
  const waiting = await snapshot(player, fixture.eternalId);
  check("Eternal Aggression waits for the player's Roll: nothing is rolled or recovered yet",
    eternalUse.status === "awaitingRoll" && eternalUse.formula === "1d4" && eternalUse.roll === undefined && waiting.aggression === eternalBefore.aggression && waiting.unrelenting === eternalBefore.unrelenting - 1, { eternalUse: eternalUse.status, waiting });
  await closeGuardDialogs(player);
  await clickCardRoll(player, /^Roll 1d4/);
  await useButton(player).waitFor({ state: "visible" });
  await useButton(player).click();
  await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.find(entry => entry.id === useId)?.roll !== undefined, { id: fixture.eternalId, useId: eternalUse.id });
  const rolled = await receiptById(player, fixture.eternalId, eternalUse.id);
  const afterRoll = await snapshot(player, fixture.eternalId);
  check("the clicked d4 is added to Aggression (capped at the maximum)", rolled.roll >= 1 && rolled.roll <= 4 && afterRoll.aggression === Math.min(8, eternalBefore.aggression + rolled.roll), { roll: rolled.roll, afterRoll });
  await shot(player, "guard-05-eternal-aggression-rolled.png");
  await undoFromList(player, fixture.eternalId, eternalUse.id);
  const eternalUndone = await snapshot(player, fixture.eternalId);
  check("undo returns the Unrelenting use and the recovered Aggression", eternalUndone.aggression === eternalBefore.aggression && eternalUndone.unrelenting === eternalBefore.unrelenting, eternalUndone);

  /* ------------------------------------------------------------------ Artsblade, in combat */
  const combatId = await gm.evaluate(async ({ sceneId, actorToken, npcToken }) => {
    const combat = await Combat.implementation.create({ scene: sceneId, active: true, flags: { ak5e: { u1Disposable: true } } });
    await combat.createEmbeddedDocuments("Combatant", [
      { actorId: game.scenes.get(sceneId).tokens.get(actorToken).actorId, tokenId: actorToken, sceneId, initiative: 30 },
      { actorId: game.scenes.get(sceneId).tokens.get(npcToken).actorId, tokenId: npcToken, sceneId, initiative: 10 }
    ]);
    await combat.startCombat();
    await combat.update({ round: 1, turn: 0 });
    return combat.id;
  }, { sceneId: fixture.sceneId, actorToken: fixture.artsbladeTokenId, npcToken: fixture.npcTokenId });
  report.combatId = combatId;
  await player.evaluate(id => canvas.tokens.setTargets([id]), fixture.npcTokenId);

  // Augmented Assault: a confirmed use whose cost is shown first.
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "augmentedAssault").click();
  await useButton(player).waitFor({ state: "visible" });
  check("Augmented Assault's confirmation shows its cost", /2\s+Aggression/i.test(await confirmText(player)));
  await shot(player, "guard-06-augmented-confirm.png");
  await useButton(player).click();
  await player.waitForTimeout(500);

  // First Frost Blade Art against the unowned NPC.
  const bladeBefore = await snapshot(player, fixture.artsbladeId);
  await guardButton(player, "bladeArt").click();
  const poolPrompt = promptWith(player, 'select[name="artPool"]');
  await poolPrompt.waitFor({ state: "visible" });
  const poolOptions = await player.locator('select[name="artPool"] option').allTextContents();
  check("unselected Standard Pools are absent", poolOptions.length === 1 && /Frost/.test(poolOptions[0]), poolOptions);
  await player.selectOption('select[name="artPool"]', "frost");
  await poolPrompt.locator('button[data-action="ok"]').click();
  const dcPrompt = promptWith(player, 'select[name="ability"]');
  await dcPrompt.waitFor({ state: "visible" });
  check("the Martial DC prompt starts on the stored STR choice", await dcPrompt.locator('select[name="ability"]').inputValue() === "str");
  await answerAbility(player, "str");
  await useButton(player).waitFor({ state: "visible" });
  const frostText = await confirmText(player);
  check("Frost's confirm identifies the targeted NPC", frostText.includes("NPC Save Target") && /Blade Art/i.test(frostText), frostText);
  await shot(player, "guard-07-frost-confirm.png");
  await useButton(player).click();
  await player.waitForFunction(({ id, receipts }) => (game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.length ?? 0) > receipts, { id: fixture.artsbladeId, receipts: bladeBefore.receipts });
  const bladeUse = await lastReceipt(player, fixture.artsbladeId, "bladeArt");
  const bladeUseId = bladeUse.id;
  check("Frost Blade Art is 2d6 cold with an owner-rolled CON save pending and no dice rolled",
    bladeUse.formula === "2d6" && bladeUse.result?.damageType === "cold" && bladeUse.saves?.[0]?.ability === "con" && bladeUse.saves[0].dc === 15 && bladeUse.saves[0].resolved !== true && bladeUse.roll === undefined, bladeUse.result);
  check("the card tells the player which wielded weapon is the Casting Unit (Resonance)", /Casting Unit \(Resonance\): Acceptance Longsword counts as a Casting Unit while wielded/.test(bladeUse.manualSteps.join(" ")), bladeUse.manualSteps);
  await shot(player, "guard-08-blade-art-awaiting-roll.png");

  await showChat(gm);
  const saveName = /NPC Save Target .* CON save DC 15/i;
  check("the target save is not offered before the damage is rolled", !await gm.getByRole("button", { name: saveName }).last().isVisible({ timeout: 2000 }).catch(() => false));
  await closeGuardDialogs(player);
  await clickCardRoll(player, /^Roll 2d6/);
  await useButton(player).waitFor({ state: "visible" });
  await useButton(player).click();
  await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.find(entry => entry.id === useId)?.roll !== undefined, { id: fixture.artsbladeId, useId: bladeUseId }, { timeout: 20000 });
  await shot(player, "guard-09-blade-art-rolled.png");

  // The NPC's owner (the GM) rolls the native save; the bridge records it and relays the Resonance effect.
  await showChat(gm);
  const saveButton = gm.getByRole("button", { name: saveName }).last();
  await saveButton.waitFor({ state: "visible", timeout: 20000 });
  check("the NPC save button is absent for the non-owner player", await player.getByRole("button", { name: saveName }).count() === 0);
  await saveButton.click();
  await gm.getByRole("button", { name: /^Normal$/ }).last().waitFor({ state: "visible", timeout: 10000 });
  await shot(gm, "guard-10-gm-native-save-dialog.png");
  await gm.getByRole("button", { name: /^Normal$/ }).last().click();
  await gm.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.find(entry => entry.id === useId)?.saves?.[0]?.resolved === true, { id: fixture.artsbladeId, useId: bladeUseId }, { timeout: 20000 });
  const afterSave = await gm.evaluate(async ({ actorId, npcId, useId }) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    const source = game.actors.get(actorId), target = game.actors.get(npcId);
    const state = source.getFlag("ak5e", "guardUses"), receipt = state.undo.find(entry => entry.id === useId);
    const message = game.messages.find(entry => entry.uuid === receipt.saves[0].messageUuid);
    return { resolved: receipt.saves[0].resolved, save: receipt.result.saveResolved, author: message?.author?.name, type: message?.flags?.dnd5e?.roll?.type, ability: message?.flags?.dnd5e?.roll?.ability,
      immunity: Object.values(state.data?.bladeArtSaves ?? {}).find(entry => entry?.targetUuid === target.uuid) ?? null,
      effects: target.effects.filter(effect => effect.flags?.ak5e?.guardUsesEffect?.opId === useId || effect.flags?.ak5e?.guardUsesEffect).map(effect => effect.name) };
  }, { actorId: fixture.artsbladeId, npcId: fixture.npcId, useId: bladeUseId });
  report.nativeSave = afterSave;
  check("the bridge accepts the target owner's matching native CON save", afterSave.resolved && afterSave.type === "save" && afterSave.ability === "con" && afterSave.author === "Gamemaster", afterSave);
  check("the verified save records the single-save exemption for this Turn", Boolean(afterSave.immunity) && afterSave.immunity.combatId === combatId, afterSave.immunity);
  check("a failed save relays the Resonance effect to the NPC (a passed one adds none)", afterSave.save?.success ? afterSave.effects.length === 0 : afterSave.effects.length > 0, afterSave);

  // A second Blade Art this Turn: the confirm says the NPC already made its save, and no second save is offered.
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "bladeArt").click();
  await promptWith(player, 'select[name="artPool"]').waitFor({ state: "visible" });
  await player.selectOption('select[name="artPool"]', "frost");
  await promptWith(player, 'select[name="artPool"]').locator('button[data-action="ok"]').click();
  await answerAbility(player, "str");
  await useButton(player).waitFor({ state: "visible" });
  const secondText = await confirmText(player);
  check("a same-Turn second Blade Art says the save was already made", /already made this Cantrip's saving throw/i.test(secondText) && /exempt from repeating it/i.test(secondText), secondText);
  await shot(player, "guard-11-repeat-save-exemption.png");
  await useButton(player).click();
  await player.waitForTimeout(500);
  const secondUse = await lastReceipt(player, fixture.artsbladeId, "bladeArt");
  check("the repeat card posts no second save", secondUse.id !== bladeUseId && (secondUse.saves ?? []).length === 0 && secondUse.result?.immuneToSave === true, secondUse.result);

  // The exemption ends when the Artsblade's next Turn begins.
  await gm.evaluate(async id => { const combat = game.combats.get(id); await combat.nextTurn(); await combat.nextTurn(); }, combatId);
  await gm.waitForFunction(id => game.combats.get(id)?.round === 2 && game.combats.get(id)?.turn === 0, combatId);
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "bladeArt").click();
  await promptWith(player, 'select[name="artPool"]').waitFor({ state: "visible" });
  await player.selectOption('select[name="artPool"]', "frost");
  await promptWith(player, 'select[name="artPool"]').locator('button[data-action="ok"]').click();
  await answerAbility(player, "str");
  await useButton(player).waitFor({ state: "visible" });
  check("the exemption has ended at the source's next Turn", !/already made this Cantrip/i.test(await confirmText(player)));
  await shot(player, "guard-12-next-turn-save.png");
  await useButton(player).click();
  await player.waitForTimeout(500);
  const thirdUse = await lastReceipt(player, fixture.artsbladeId, "bladeArt");
  check("a fresh damage-triggered native save is requested", thirdUse.saves?.length === 1 && thirdUse.saves[0].ability === "con" && thirdUse.saves[0].afterRoll === true && thirdUse.saves[0].resolved !== true, thirdUse.saves);

  // Cut Through Chaos: the selected native melee weapon, the Reaction, and undo.
  const cutBefore = await snapshot(player, fixture.artsbladeId);
  const reactionsBefore = await reactionsAvailable(player, fixture.artsbladeId);
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "cutThroughChaos").click();
  const cutPrompt = promptWith(player, 'select[name="weaponUuid"]');
  await cutPrompt.waitFor({ state: "visible" });
  const weaponOptions = await cutPrompt.locator('select[name="weaponUuid"] option').allTextContents();
  check("the Cut Through Chaos form lists the equipped melee weapon", weaponOptions.some(text => /Acceptance Longsword \(equipped\)/.test(text)), weaponOptions);
  await cutPrompt.locator('select[name="mode"]').selectOption("savingThrow");
  await cutPrompt.locator('select[name="weaponUuid"]').selectOption(fixture.weaponUuid);
  await cutPrompt.locator('input[name="incomingDC"]').fill("14");
  await cutPrompt.locator('button[data-action="ok"]').click();
  await useButton(player).waitFor({ state: "visible" });
  const cutText = await confirmText(player);
  check("Cut Through Chaos's confirm states its cost and has no missing-weapon warning", /Cost:\s*1 Cut Through Chaos/.test(cutText) && !/Select the equipped melee weapon/.test(cutText), cutText);
  await shot(player, "guard-13-cut-through-chaos-confirm.png");
  await player.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await player.waitForTimeout(250);
  check("Cancel on Cut Through Chaos writes nothing", JSON.stringify(await snapshot(player, fixture.artsbladeId)) === JSON.stringify(cutBefore));
  await guardButton(player, "cutThroughChaos").click();
  await cutPrompt.waitFor({ state: "visible" });
  await cutPrompt.locator('select[name="mode"]').selectOption("savingThrow");
  await cutPrompt.locator('select[name="weaponUuid"]').selectOption(fixture.weaponUuid);
  await cutPrompt.locator('input[name="incomingDC"]').fill("14");
  await cutPrompt.locator('button[data-action="ok"]').click();
  await useButton(player).click();
  await player.waitForFunction(({ id, receipts }) => (game.actors.get(id).getFlag("ak5e", "guardUses")?.undo?.length ?? 0) > receipts, { id: fixture.artsbladeId, receipts: cutBefore.receipts });
  const cutUse = await lastReceipt(player, fixture.artsbladeId, "cutThroughChaos");
  const cutAfter = await snapshot(player, fixture.artsbladeId);
  check("Cut Through Chaos records the native weapon attack, spends a use and the Reaction, and rolls nothing",
    cutUse.nativeAttack?.weaponUuid === fixture.weaponUuid && cutUse.formula === undefined && cutUse.roll === undefined && cutAfter.cut === cutBefore.cut - 1 && cutUse.reaction?.spent === true, { nativeAttack: cutUse.nativeAttack, cutAfter });
  await undoFromList(player, fixture.artsbladeId, cutUse.id);
  const cutUndone = await snapshot(player, fixture.artsbladeId);
  const reactionsAfter = await reactionsAvailable(player, fixture.artsbladeId);
  check("undo returns the Cut Through Chaos use and the Reaction", cutUndone.cut === cutBefore.cut && reactionsAfter === reactionsBefore, { cutUndone, reactionsBefore, reactionsAfter });

  // Undo of the first save-bearing Blade Art restores Artsblade tracking and removes the relayed effect from the NPC.
  await undoFromList(player, fixture.artsbladeId, bladeUseId);
  const undoResult = await gm.evaluate(async ({ npcId, useId }) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    return game.actors.get(npcId).effects.filter(effect => effect.flags.ak5e?.guardUsesEffect?.opId === useId).map(effect => effect.name);
  }, { npcId: fixture.npcId, useId: bladeUseId });
  check("undo removes the relayed Resonance effect inside the encounter window", undoResult.length === 0, undoResult);
  await shot(player, "guard-14-undo-blade-art.png");

  /* ------------------------------------------------------------------ level 13: chooser Cancel, shortfall override */
  const advBefore = await snapshot(player, fixture.advancedId);
  await openControls(player, fixture.advancedId);
  await guardButton(player, "augmentedAssault").click();
  await promptWith(player, 'input[name="unleash"]').waitFor({ state: "visible" });
  await shot(player, "guard-15-level13-unleash-prompt.png");
  await player.keyboard.press("Escape");
  await player.waitForTimeout(250);
  check("closing the Unleash chooser writes nothing", JSON.stringify(await snapshot(player, fixture.advancedId)) === JSON.stringify(advBefore));
  await guardButton(player, "augmentedAssault").click();
  await promptWith(player, 'input[name="unleash"]').locator('button[data-action="cancel"]').click();
  await player.waitForTimeout(250);
  check("Cancel on the Unleash chooser writes nothing (B-130)", JSON.stringify(await snapshot(player, fixture.advancedId)) === JSON.stringify(advBefore));
  await guardButton(player, "augmentedAssault").click();
  await promptWith(player, 'input[name="unleash"]').locator('button[data-action="ok"]').click();
  await useButton(player).waitFor({ state: "visible" });
  await player.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await player.waitForTimeout(250);
  check("Cancel on the confirm after the chooser writes nothing", JSON.stringify(await snapshot(player, fixture.advancedId)) === JSON.stringify(advBefore));

  await player.evaluate(id => game.actors.get(id).update({ "flags.ak5e.resourcePools.aggression.value": 1 }), fixture.advancedId);
  await guardButton(player, "augmentedAssault").click();
  await promptWith(player, 'input[name="unleash"]').locator('button[data-action="ok"]').click();
  const anyway = player.getByRole("button", { name: "Use anyway", exact: true }).last();
  await anyway.waitFor({ state: "visible" });
  check("a resource shortfall is a warning with Use anyway", /2 Aggression needed and 1 remain/i.test(await confirmText(player)));
  await shot(player, "guard-16-resource-warning.png");
  await anyway.click();
  await player.waitForTimeout(600);
  const spent = await player.evaluate(id => ({ aggression: game.actors.get(id).getFlag("ak5e", "resourcePools")?.aggression?.value,
    overridden: [...(game.actors.get(id).getFlag("ak5e", "guardUses")?.undo ?? [])].at(-1)?.overridden,
    card: [...game.messages].reverse().find(message => message.flags.ak5e?.guardUsesUse?.actorUuid === game.actors.get(id).uuid)?.content ?? "" }), fixture.advancedId);
  check("the overspent Aggression clamps at 0 and the public card records the override", spent.aggression === 0 && spent.overridden?.length > 0 && /Aggression needed and 1 remain/i.test(spent.card) && /short by 1/i.test(spent.card), spent);
  await closeGuardDialogs(player);

  /* ------------------------------------------------------------------ Spellsword Art at the fixed maximum level */
  await openControls(player, fixture.artsbladeId);
  await guardButton(player, "castSpellswordArt").click();
  const artPrompt = promptWith(player, 'input[name="artName"]');
  await artPrompt.waitFor({ state: "visible" });
  await artPrompt.locator('input[name="artName"]').fill("Ice Sheet");
  const levelText = await artPrompt.innerText();
  check("the Spellsword dialog fixes level 2 and shows the Frost pool", /maximum level for this Guard level:\s*2/i.test(levelText) && /Frost/i.test(levelText), levelText);
  await shot(player, "guard-17-spellsword-level2-prompt.png");
  await artPrompt.locator('button[data-action="ok"]').click();
  await answerAbility(player, "str");
  await useButton(player).waitFor({ state: "visible" });
  await useButton(player).click();
  await player.waitForTimeout(600);
  const spellsword = await lastReceipt(player, fixture.artsbladeId, "castSpellswordArt");
  check("Ice Sheet is recorded at fixed level 2 and spends one Spellsword Point", spellsword?.result?.castingLevel === 2 && spellsword.result.spSpent === 1 && spellsword.result.artName === "Ice Sheet", spellsword?.result);
  check("the Spellsword card names the Casting Unit weapon", /Casting Unit \(Resonance\)/.test(spellsword.manualSteps.join(" ")));
  await closeGuardDialogs(player);

  // Ending the combat locks every receipt from it.
  // Combat#endCombat() opens a confirm dialog on the GM client and would wait for a click; deleting the Combat is what it does.
  await gm.evaluate(async id => { await game.combats.get(id)?.delete(); }, combatId);
  await player.waitForTimeout(600);
  const locked = await player.evaluate(({ id, useId }) => game.ak5e.guard.uses(game.actors.get(id)).find(entry => entry.id === useId)?.locked, { id: fixture.artsbladeId, useId: spellsword?.id });
  check("ending the combat locks that encounter's receipts", locked === true, { useId: spellsword?.id, locked });

  /* ------------------------------------------------------------------ B-131: the sheet's setup button previews, confirms, passes the key */
  const setupId = await gm.evaluate(async ({ playerId, suffix }) => {
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    const actor = await Actor.implementation.create({ name: `AK5e U1 Unconfigured Guard ${suffix}`, type: "character", ownership: { default: 0, [playerId]: 3 }, system: { details: { level: 3 } } });
    const classData = sourceEntryData(CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-guard")); classData.system.levels = 3;
    await actor.createEmbeddedDocuments("Item", [classData]);
    return actor.id;
  }, { playerId: fixture.playerId, suffix: fixture.suffix });
  const itemCount = id => player.evaluate(actorId => game.actors.get(actorId).items.size, id);
  await player.waitForFunction(id => Boolean(game.actors.get(id)), setupId);
  await openControls(player, setupId);
  const setupBefore = await itemCount(setupId);
  await player.locator('.ak5e-guard-dialog button[data-guard-act="__setup"]').last().click();
  await player.locator('dialog button[data-action="no"]').last().waitFor({ state: "visible" });
  await shot(player, "guard-18-setup-confirm.png");
  await player.locator('dialog button[data-action="no"]').last().click();
  await player.waitForTimeout(300);
  check("Cancel on the Guard setup confirm grants nothing", await itemCount(setupId) === setupBefore);
  await player.locator('.ak5e-guard-dialog button[data-guard-act="__setup"]').last().click();
  await player.locator('dialog button[data-action="yes"]').last().click();
  await player.waitForFunction(({ id, before }) => game.actors.get(id).items.size > before, { id: setupId, before: setupBefore }, { timeout: 20000 });
  check("the setup button grants the core Guard Features with the preview key", await player.evaluate(id => game.actors.get(id).items.some(item => /Press the Attack/.test(item.name)) && game.actors.get(id).getFlag("ak5e", "guard")?.enabled === true, setupId));

  /* ------------------------------------------------------------------ every branch's panel opens without writing */
  const panels = await gm.evaluate(async () => {
    const branches = ["artsblade", "brawler", "centurion", "crusher", "duellist", "instructor", "liberator", "lord", "musha", "reaper", "weaponmaster"];
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
    const results = [];
    for (const branch of branches) {
      const actor = await Actor.implementation.create({ name: `AK5e U1 Panel ${branch}`, type: "character", system: { details: { level: 13 }, attributes: { prof: 5 } },
        flags: { ak5e: { guard: { enabled: true } } } });
      const classData = sourceEntryData(CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-guard")); classData.system.levels = 13;
      await actor.createEmbeddedDocuments("Item", [classData, sourceEntryData(CHAPTER_THREE_CLASSES.find(entry => entry.id === `subclass-guard-${branch}`))]);
      // Item-creation hooks (for example the Operator Skills prompt key) write shortly after creation; let them settle first.
      await new Promise(resolve => setTimeout(resolve, 1500));
      const before = JSON.stringify([actor.flags.ak5e, actor.system.attributes.hp]);
      void game.ak5e.guard.open(actor);
      await new Promise(resolve => setTimeout(resolve, 900));
      const dialog = [...document.querySelectorAll(".ak5e-guard-dialog")].at(-1);
      results.push({ branch, commands: dialog ? dialog.querySelectorAll("[data-guard-cmd]").length : 0, unchanged: JSON.stringify([actor.flags.ak5e, actor.system.attributes.hp]) === before });
      for (const app of [...foundry.applications.instances.values()]) if (app.element?.querySelector?.(".ak5e-guard-dialog")) await app.close();
      await actor.delete();
    }
    return results;
  });
  report.panels = panels;
  check("every branch's Guard Controls opens with its commands and writes nothing", panels.every(entry => entry.commands >= 5 && entry.unchanged), panels);

  /* ------------------------------------------------------------------ persistence across a reload */
  await player.reload();
  await player.waitForFunction(id => game.ready && game.actors.get(id), fixture.artsbladeId, { timeout: 60000 });
  const persisted = await snapshot(player, fixture.artsbladeId);
  check("the stored Martial DC choice and the ledger survive a reload", persisted.martialDC === "str" && persisted.receipts >= 4, persisted);
  await shot(player, "guard-19-after-reload.png");

  check("no console or page errors in any client", report.errors.length === 0, report.errors);
  report.passed = true;
} catch (error) {
  report.failure = error?.stack ?? String(error);
  throw error;
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser.close();
  report.passed ||= false;
  await writeFile(`${outputDir}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputDir}/browser-report.json (passed: ${report.passed}, console/page errors: ${report.errors.length})`);
}
