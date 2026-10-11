/** Disposable Foundry 13 / D&D5e live acceptance for the Primal, Splash and Chain Caster branches. Never targets a non-test World. */
import { readFile, writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";

const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const port = process.env.AK5E_PORT ?? "30171";
const base = `http://127.0.0.1:${port}/join`;
const output = process.env.AK5E_BRANCHES_OUTPUT ?? "/tmp/ak5e-caster-branches-live";
const restartReportPath = process.env.AK5E_BRANCHES_RESTART_REPORT ?? null;
const report = { world: "standard-test", port, errors: [], consoleWarnings: [], screenshots: [], fixture: {}, primal: {}, splash: {}, chain: {}, permissions: {}, persistence: {} };
const browser = await launchTestBrowser(chromium, { ...(process.env.AK5E_CHROMIUM ? { executablePath: process.env.AK5E_CHROMIUM } : {}) });
const contexts = [];
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(`${name}: ${error.stack ?? error.message}`));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push(`${name}: ${message.text()}`);
    else if (message.type() === "warning" && /ak5e/i.test(message.text())) report.consoleWarnings.push(`${name}: ${message.text()}`);
  });
  await page.goto(base);
  await page.selectOption('select[name="userid"]', { label: name, timeout: 10000 });
  await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && globalThis.game.ak5e?.caster && globalThis.canvas?.ready, null, { timeout: 60000 });
  // A player without an assigned character gets Foundry's User Configuration window on login; it would cover the canvas.
  await page.evaluate(async () => { for (const app of [...foundry.applications.instances.values()]) if (app.constructor.name === "UserConfig") await app.close(); });
  const worldId = await page.evaluate(() => game.world.id);
  check(worldId === "standard-test", `Refusing World ${worldId}; only the disposable standard-test copy is allowed.`);
  return page;
}
async function screenshot(page, key) {
  const path = `${output}-${key}.png`;
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
}
async function closeDialogs(page) {
  for (const button of await page.locator('dialog button[data-action="cancel"], dialog button[data-action="close"]').all()) await button.click().catch(() => {});
  await page.waitForTimeout(250);
}
/** Open a Caster command dialog from the rendered panel, screenshot it and cancel; nothing is applied. */
async function commandDialog(page, actorId, label, key) {
  await page.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, actorId);
  const panel = page.locator(".ak5e-caster-panel");
  await panel.waitFor({ timeout: 15000 });
  await page.locator(".ak5e-caster-panel button", { hasText: label }).first().click();
  const form = page.locator('dialog:has(button[data-action="submit"])');
  await form.waitFor({ timeout: 15000 });
  await screenshot(page, key);
  const text = (await form.innerText()).replace(/\s+/g, " ");
  await form.locator('button[data-action="cancel"]').click();
  await closeDialogs(page);
  return text;
}
/** Cast through the native D&D5e usage dialog; optionally place the area template on the canvas. */
async function cast(page, actorId, itemId, options, key, placeAt = null) {
  const prior = await page.evaluate(() => game.messages.contents.map(message => message.id));
  await page.evaluate(({ actorId, itemId, options }) => {
    globalThis.__castError = null;
    globalThis.__castUse = game.ak5e.caster.cast(game.actors.get(actorId), itemId, options).catch(error => { globalThis.__castError = error.message; });
  }, { actorId, itemId, options });
  const use = page.locator('button[data-action="use"]');
  await use.first().waitFor({ timeout: 20000 });
  const template = page.locator('dialog input[name="create.measuredTemplate"]');
  if (await template.count()) { if (placeAt) await template.check(); else await template.uncheck(); }
  await screenshot(page, `${key}-usage`);
  const dialogText = (await page.locator('dialog:has(button[data-action="use"])').innerText()).replace(/\s+/g, " ");
  await use.first().click();
  if (placeAt) {
    await page.waitForTimeout(800);
    await page.mouse.move(placeAt.x, placeAt.y); await page.waitForTimeout(300);
    await page.mouse.click(placeAt.x, placeAt.y);
  }
  try { await page.waitForFunction(prior => game.messages.contents.some(m => m.flags?.ak5e?.artCast && !prior.includes(m.id)), prior, { timeout: 25000 }); }
  catch (error) {
    await screenshot(page, `${key}-timeout`);
    throw new Error(`${key}: no cast message (${await page.evaluate(() => globalThis.__castError)}). ${error.message}`);
  }
  await page.evaluate(async () => { await globalThis.__castUse; if (globalThis.__castError) throw new Error(globalThis.__castError); });
  // D&D5e opens its attack roll dialog after an attack Art; outcomes are confirmed through the Caster helpers instead.
  await page.evaluate(async () => { for (const app of [...foundry.applications.instances.values()]) if (/RollConfiguration/.test(app.constructor.name)) await app.close(); });
  return page.evaluate(({ prior, dialogText }) => {
    const message = [...game.messages].reverse().find(m => m.flags?.ak5e?.artCast && !prior.includes(m.id));
    return { messageId: message.id, receipt: message.flags.ak5e.artCast, dialogText };
  }, { prior, dialogText });
}

/** Click a Roll/Undo/Retry control on a Caster use card in the expanded chat log (WORKFLOW.md §3.2 controls). */
async function clickUseControl(page, actorId, useId, selector, key) {
  await page.evaluate(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
  const messageId = await page.waitForFunction(({ actorId, useId }) => game.messages.contents.find(m => m.flags?.ak5e?.casterUse?.useId === useId
    && m.flags.ak5e.casterUse.actorUuid === game.actors.get(actorId).uuid)?.id, { actorId, useId }, { timeout: 15000 }).then(handle => handle.jsonValue());
  const control = page.locator(`#sidebar [data-message-id="${messageId}"] ${selector}`);
  await control.waitFor({ timeout: 15000 });
  await control.scrollIntoViewIfNeeded();
  await screenshot(page, key);
  await control.click();
  return messageId;
}
const useStatus = (page, actorId, useId) => page.evaluate(({ actorId, useId }) => game.actors.get(actorId).getFlag("ak5e", "caster").undo?.find(use => use.id === useId)?.status ?? null, { actorId, useId });

/* ---------------------------------------------------------------- Chain Caster helpers */
const setTargets = (page, uuids) => page.evaluate(list => { for (const [index, uuid] of list.entries()) canvas.tokens.get(uuid.split(".").at(-1)).setTarget(true, { user: game.user, releaseOthers: index === 0 }); }, uuids);
/** (Re)open the Caster panel so its snapshot of casts, receipts and targets is current. */
async function openPanel(page, actorId) {
  await closeDialogs(page);
  await page.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, actorId);
  await page.locator(".ak5e-caster-panel").waitFor({ timeout: 15000 });
  await page.locator(".ak5e-caster-panel").evaluate(panel => { for (let node = panel; node; node = node.parentElement) node.scrollTop = 0; });
}
/** Show a Caster use card in the expanded chat log, screenshot it, and collapse the sidebar again. */
async function showUseCard(page, actorId, useId, key) {
  await page.evaluate(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
  const messageId = await page.waitForFunction(({ actorId, useId }) => game.messages.contents.findLast(m => m.flags?.ak5e?.casterUse?.useId === useId
    && m.flags.ak5e.casterUse.actorUuid === game.actors.get(actorId).uuid)?.id, { actorId, useId }, { timeout: 15000 }).then(handle => handle.jsonValue());
  const card = page.locator(`#sidebar [data-message-id="${messageId}"]`);
  await card.waitFor({ timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const text = (await card.innerText()).replace(/\s+/g, " "), html = await card.innerHTML();
  await screenshot(page, key);
  await page.evaluate(() => ui.sidebar.collapse());
  return { messageId, text, html };
}
const casterFlag = (page, actorId) => page.evaluate(id => { const actor = game.actors.get(id), state = actor.getFlag("ak5e", "caster"), pools = game.ak5e.caster.inspect(actor).chain;
  return { chainArt: pools.chainArt.value, sparks: pools.sparks.value, undo: (state.undo ?? []).map(use => ({ id: use.id, status: use.status, title: use.title })) }; }, actorId);
const sparkEffects = (page, actorId) => page.evaluate(id => game.actors.get(id).effects.filter(effect => effect.flags.ak5e?.casterSpark)
  .map(effect => ({ name: effect.name, opId: effect.flags.ak5e.casterSpark.opId, effect: effect.flags.ak5e.casterSpark.effect, upgraded: effect.flags.ak5e.casterSpark.upgraded,
    changes: effect.changes.map(change => `${change.key}:${change.mode}:${change.value}`) })), actorId);
/** Close the native D&D5e roll configuration dialog that follows an attack Art; nothing is rolled (WORKFLOW.md §3.2). */
const closeRollDialogs = page => page.evaluate(async () => { for (const app of [...foundry.applications.instances.values()]) if (/RollConfiguration/.test(app.constructor.name)) await app.close(); });
/** Complete a cast whose Caster form/validation has been submitted: the native D&D5e usage dialog, then the cast message. */
async function finishNativeUse(page, actorId, key, prior) {
  const use = page.locator('button[data-action="use"]');
  await use.first().waitFor({ timeout: 20000 });
  await screenshot(page, `${key}-usage`);
  await use.first().click();
  try { await page.waitForFunction(prior => game.messages.contents.some(m => m.flags?.ak5e?.artCast && !prior.includes(m.id)), prior, { timeout: 25000 }); }
  catch (error) { await screenshot(page, `${key}-timeout`); throw new Error(`${key}: no cast message. ${error.message}`); }
  await page.waitForTimeout(500);
  await closeRollDialogs(page);
  return page.evaluate(({ prior }) => {
    const message = [...game.messages].reverse().find(m => m.flags?.ak5e?.artCast && !prior.includes(m.id));
    const element = document.querySelector(`[data-message-id="${message.id}"]`);
    return { messageId: message.id, castId: message.flags.ak5e.artCast.id, rolls: message.rolls.length, targets: (message.flags.dnd5e?.targets ?? []).map(target => target.name),
      cardText: element?.innerText.replace(/\s+/g, " ") ?? null };
  }, { prior });
}
const messageIds = page => page.evaluate(() => game.messages.contents.map(message => message.id));
/** Fill the real Cast an Art form for a Chain Art / Ouroboros cast; the caller handles what follows the Submit click. */
async function submitChainCastForm(page, actorId, fields, key) {
  await openPanel(page, actorId);
  await page.locator('.ak5e-caster-panel button[data-caster-ui="cast"]').click();
  const form = page.locator('dialog:has(select[name="chainMode"])');
  await form.waitFor({ timeout: 15000 });
  const formText = (await form.innerText()).replace(/\s+/g, " ");
  await form.locator('select[name="itemId"]').selectOption(fields.itemId);
  await form.locator('select[name="level"]').selectOption(String(fields.level ?? 0));
  await form.locator('select[name="chainMode"]').selectOption(fields.mode);
  await form.locator('select[name="chainOriginal"]').selectOption(fields.original);
  for (const uuid of fields.chainTo ?? []) await form.locator(`input[name="chainTo"][value="${uuid}"]`).check();
  if (fields.single) await form.locator('input[name="chainSingle"]').check();
  await form.locator('input[name="confirmed"]').check();
  await screenshot(page, key);
  await form.locator('button[data-action="cast"]').click();
  return formText;
}

try {
  let gm = await join("Gamemaster");
  report.environment = await gm.evaluate(() => {
    const gl = canvas?.app?.renderer?.gl, ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return { foundry: game.version, system: game.system.version, world: game.world.id, moduleVersion: game.modules.get("ak5e").version,
      activeModules: game.modules.filter(module => module.active).map(module => module.id), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  check(report.environment.system === "5.3.3", `Expected D&D5e 5.3.3; found ${report.environment.system}.`);
  check(report.environment.activeModules.length === 1 && report.environment.activeModules[0] === "ak5e", "Only AK5e may be enabled in this disposable World.");

  if (restartReportPath) {
    const previous = JSON.parse(await readFile(restartReportPath, "utf8"));
    check(previous.world === "standard-test" && previous.persistence?.primal, "Restart verification needs a completed Primal/Splash report.");
    report.restart = await gm.evaluate(({ fixture, persistence }) => {
      const facts = {};
      for (const key of ["primal", "splash"]) {
        const actor = game.actors.get(fixture.actors[key]), expected = persistence[key];
        if (!actor || actor.getFlag("ak5e", "casterBranchesFixture") !== fixture.suffix) throw new Error(`Restart lost the ${key} fixture.`);
        const ids = actor.items.map(item => item.id).sort();
        if (JSON.stringify(ids) !== JSON.stringify(expected.itemIds)) throw new Error(`${key} Item IDs changed across restart.`);
        if (JSON.stringify(actor.getFlag("ak5e", "artsPoints")) !== JSON.stringify(expected.ap)) throw new Error(`${key} AP changed across restart.`);
        if (JSON.stringify(actor.getFlag("ak5e", "caster").uses) !== JSON.stringify(expected.uses)) throw new Error(`${key} use flags changed across restart.`);
        facts[key] = { itemCount: ids.length, ap: actor.getFlag("ak5e", "artsPoints"), uses: actor.getFlag("ak5e", "caster").uses };
      }
      const primal = game.actors.get(fixture.actors.primal);
      facts.residual = game.ak5e.caster.inspect(primal).residual;
      if (facts.residual.value !== persistence.primal.residual) throw new Error("Residual Suffering uses did not persist across restart.");
      const frozen = game.actors.get(fixture.actors.targetB).effects.filter(effect => effect.flags.ak5e?.casterPrimal);
      facts.targetBPrimalEffects = frozen.map(effect => ({ name: effect.name, statuses: [...effect.statuses] }));
      if (JSON.stringify(facts.targetBPrimalEffects) !== JSON.stringify(persistence.targetBPrimalEffects)) throw new Error("Primal Conditions changed across restart.");
      return facts;
    }, { fixture: previous.fixture, persistence: previous.persistence });
    await gm.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, previous.fixture.actors.primal);
    await gm.locator(".ak5e-caster-panel").waitFor({ timeout: 15000 });
    await screenshot(gm, "restart-primal-panel");
    await closeDialogs(gm);
    if (previous.persistence.chain) {
      // 12. Chain pools, receipt statuses and Spark effects survive a server restart.
      const expected = previous.persistence.chain, chainActors = previous.fixture.actors;
      report.restart.chain = await gm.evaluate(({ actors }) => {
        const actor = game.actors.get(actors.chain), pools = game.ak5e.caster.inspect(actor).chain;
        return { itemIds: actor.items.map(item => item.id).sort(), chainArt: pools.chainArt.value, sparks: pools.sparks.value, max: [pools.chainArt.max, pools.sparks.max],
          receipts: (actor.getFlag("ak5e", "caster").undo ?? []).map(use => `${use.id}:${use.status}`).sort(),
          effects: Object.fromEntries(["chainA", "chainB", "chainC", "chainD", "chainE"].map(key => [key, game.actors.get(actors[key]).effects.filter(effect => effect.flags.ak5e?.casterSpark)
            .map(effect => `${effect.flags.ak5e.casterSpark.opId}:${effect.flags.ak5e.casterSpark.effect}:${effect.changes.map(change => change.value).join("|")}`).sort()])) };
      }, { actors: chainActors });
      const { max, ...restartChain } = report.restart.chain;
      check(JSON.stringify(restartChain) === JSON.stringify(expected), `Chain state changed across restart: ${JSON.stringify(restartChain)} vs ${JSON.stringify(expected)}`);
      await openPanel(gm, chainActors.chain);
      report.restart.chainPanel = (await gm.locator(".ak5e-caster-panel").innerText()).replace(/\s+/g, " ");
      await screenshot(gm, "restart-chain-panel");
      check(new RegExp(`Chain Art:\\s*${expected.chainArt} / 5`).test(report.restart.chainPanel) && new RegExp(`Sparks:\\s*${expected.sparks} / 12`).test(report.restart.chainPanel), `Restarted Chain panel counters: ${report.restart.chainPanel}`);
      await closeDialogs(gm);
    }
  } else {
    report.fixture = await gm.evaluate(async () => {
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
      const { CHAPTER_FOUR_EQUIPMENT } = await import("/modules/ak5e/scripts/chapter-four-content.mjs");
      const { standardPools } = await import("/modules/ak5e/scripts/caster-rules.mjs");
      const { sourceEntryData } = await import("/modules/ak5e/scripts/caster-setup.mjs");
      const suffix = foundry.utils.randomID();
      for (const combat of game.combats.filter(entry => entry.scene?.getFlag("ak5e", "casterBranchesFixture"))) await combat.delete();
      if (game.paused) game.togglePause(false, { broadcast: true });
      const player = game.users.getName("Caster Live Owner"), observer = game.users.getName("Caster Live Observer");
      assert(player && observer, "The disposable World lacks its Caster Live Owner/Observer users.");
      const scene = await Scene.implementation.create({ name: `Primal Splash Arena ${suffix}`, width: 2400, height: 1200, padding: 0, tokenVision: false,
        grid: { type: 1, size: 100, distance: 5, units: "ft" }, flags: { ak5e: { casterBranchesFixture: suffix } } });
      await scene.activate();
      const ids = { suffix, sceneId: scene.id, actors: {}, tokens: {} };
      const staff = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.id === "weapon-arts-staff-0");
      const pool = name => standardPools.find(row => row.name === name);
      const pools = [pool("Crude Arts"), pool("Corrosion Arts")];
      const placeToken = async (actor, x, y, disposition) => {
        const data = await actor.getTokenDocument({ x, y }); data.updateSource({ name: actor.name, actorLink: true, disposition });
        const [token] = await scene.createEmbeddedDocuments("Token", [data.toObject()]); return token;
      };
      for (const [key, branch, x, level] of [["primal", "Primal", 300, 15], ["splash", "Splash", 500, 15], ["chain", "Chain", 700, 15]]) {
        const actor = await Actor.implementation.create({ name: `${branch} Caster ${suffix}`, type: "character",
          ownership: { default: 0, [player.id]: 3, [observer.id]: 2 }, flags: { ak5e: { casterBranchesFixture: suffix, casterBranchesRole: key } },
          system: { abilities: { str: { value: 10 }, dex: { value: 10 }, con: { value: 12 }, int: { value: 16 }, wis: { value: 10 }, cha: { value: 10 } }, attributes: { hp: { value: 80, max: 80 } } } });
        const classData = sourceEntryData(CHAPTER_THREE_CLASSES.find(entry => entry.id === "class-caster")); classData.system.levels = level;
        const branchData = sourceEntryData(CHAPTER_THREE_CLASSES.find(entry => entry.kind === "subclass" && entry.parentClass === "Caster" && entry.sourceHeading === branch));
        await actor.createEmbeddedDocuments("Item", [classData, branchData, sourceEntryData(staff)]);
        const unit = actor.items.find(item => item.type === "weapon" && item.getFlag("ak5e", "chapterFourId") === staff.id);
        assert(unit, `${key}: the Arts Staff casting unit was not created.`);
        const view = game.ak5e.caster.choices(actor);
        const basic = view.pending.find(row => row.key === "talents.basic")?.options[0]?.value, advanced = view.pending.find(row => row.key === "talents.advanced")?.options[0]?.value;
        const choices = { branch: branchData.flags.ak5e.chapterThreeId, ability: "int", pools: pools.map(p => p.id), saves: ["int", "wis"], skills: ["Arts", "Tech", "Lore"],
          tool: "Medical Kit", startingEquipment: { mode: "cash" }, castingUnit: unit.id,
          talents: { basic, basicAt8: { mode: "upgrade", sourceId: basic }, advanced, ...(level >= 13 ? { advancedAt13: { mode: "upgrade", sourceId: advanced } } : {}) }, hp: {}, asi: {} };
        for (let step = 1; step <= level; step++) choices.hp[step] = { mode: "existing", roll: 0 };
        for (const step of [4, 6, 8, 10, 12].filter(step => step <= level)) choices.asi[step] = { mode: "existing" };
        if (key === "splash") Object.assign(choices, { splashArts: ["Lightning Bolt", "Storm Sphere"], splashArtsReview: "reviewed" });
        const preview = await game.ak5e.caster.preview(actor, { choices });
        assert(!preview.pending.length, `${key} setup pending: ${preview.pending.map(row => `${row.key} ${row.label}`).join("; ")}`);
        assert(!preview.missing.length, `${key} setup unresolved: ${preview.missing.map(row => row.name).join(", ")}`);
        await game.ak5e.caster.apply(actor, { choices, contextKey: preview.contextKey, confirmed: true, operationId: `branches_${suffix}_${key}` });
        await actor.items.get(unit.id).update({ "system.equipped": true });
        ids.actors[key] = actor.id; ids.tokens[key] = (await placeToken(actor, x, 300, 1)).uuid;
        ids[`${key}Setup`] = { createdItems: preview.createItems.length, features: actor.items.filter(item => item.flags.ak5e?.chapterThreeId?.startsWith(`subclass-feature-caster-${key}`)).map(item => item.name),
          splashGrants: actor.items.filter(item => item.flags.ak5e?.casterArtGrants?.some(grant => grant.feature === "implementsOfDestruction")).map(item => item.name),
          reviewedBy: actor.getFlag("ak5e", "caster").choices.splashArtsReviewedBy ?? null, spellDc: actor.system.attributes.spell.dc,
          pools: key === "chain" ? (() => { const chain = game.ak5e.caster.inspect(actor).chain; return { chainArt: chain.chainArt.max, sparks: chain.sparks.max, values: [chain.chainArt.value, chain.sparks.value] }; })() : null };
      }
      // Chain Caster fixtures: original target, three additional targets within 15 ft, and one target beyond 15 ft.
      for (const [key, x] of [["chainA", 300], ["chainB", 500], ["chainC", 1100], ["chainD", 400], ["chainE", 600]]) {
        const target = await Actor.implementation.create({ name: `Chain Target ${key} ${suffix}`, type: "npc", ownership: { default: 0 },
          flags: { ak5e: { casterBranchesFixture: suffix } }, system: { abilities: { dex: { value: 10 }, con: { value: 10 } }, attributes: { hp: { value: 60, max: 60 }, ac: { flat: 5, calc: "flat" } } } });
        ids.actors[key] = target.id; ids.tokens[key] = (await placeToken(target, x, 800, -1)).uuid;
      }
      for (const [key, x] of [["targetA", 1300], ["targetB", 1500]]) {
        const target = await Actor.implementation.create({ name: `Branch Target ${key} ${suffix}`, type: "npc", ownership: { default: 0 },
          flags: { ak5e: { casterBranchesFixture: suffix } }, system: { abilities: { dex: { value: 10 } }, attributes: { hp: { value: 60, max: 60 }, ac: { flat: 5, calc: "flat" } } } });
        ids.actors[key] = target.id; ids.tokens[key] = (await placeToken(target, x, 300, -1)).uuid;
      }
      const combat = await Combat.implementation.create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments("Combatant", ["primal", "splash", "targetA", "targetB", "chain"].map((key, index) => {
        const token = scene.tokens.get(ids.tokens[key].split(".").at(-1)); return { actorId: token.actorId, tokenId: token.id, sceneId: scene.id, initiative: 40 - index * 10 };
      }));
      await combat.startCombat(); await combat.update({ round: 1, turn: 0 });
      ids.combatId = combat.id;
      return ids;
    });
    const ids = report.fixture;
    check(ids.splashSetup.splashGrants.sort().join() === "Lightning Bolt,Storm Sphere", `Implements of Destruction grants: ${ids.splashSetup.splashGrants}`);
    check(ids.splashSetup.reviewedBy?.userId, "Splash setup lacks its GM area-review stamp.");
    check(ids.chainSetup.pools?.chainArt === 5 && ids.chainSetup.pools?.sparks === 12 && ids.chainSetup.pools.values.join() === "5,12", `Level 15 Chain pools after setup: ${JSON.stringify(ids.chainSetup.pools)}`);
    check(ids.primalSetup.features.length === 5, `Primal level 15 feature Items: ${ids.primalSetup.features}`);

    // Player owner: Primal controls, cast and Residual Suffering request.
    const player = await join("Caster Live Owner");
    await player.evaluate(uuid => canvas.tokens.get(uuid.split(".").at(-1)).setTarget(true, { user: game.user, releaseOthers: true }), ids.tokens.targetA);
    await player.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, ids.actors.primal);
    await player.locator(".ak5e-caster-panel").waitFor({ timeout: 15000 });
    report.primal.panel = (await player.locator(".ak5e-caster-panel").innerText()).replace(/\s+/g, " ");
    check(/Residual Suffering: 10 \/ 10/.test(report.primal.panel), `Primal panel lacks the 2xPB Residual Suffering pool: ${report.primal.panel}`);
    await screenshot(player, "owner-primal-panel");
    await closeDialogs(player);
    report.primal.residualDialog = await commandDialog(player, ids.actors.primal, "Residual Suffering", "owner-residual-dialog");
    const blast = await player.evaluate(id => game.actors.get(id).items.find(item => item.name === "Eldritch Blast")?.id, ids.actors.primal);
    check(blast, "Primal Caster lacks the mapped Eldritch Blast.");
    report.primal.cast = await cast(player, ids.actors.primal, blast, { mode: "ap", level: 0 }, "owner-primal-blast");
    const castId = report.primal.cast.receipt.id;
    await player.waitForFunction(({ id, castId }) => game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId)?.completed, { id: ids.actors.primal, castId }, { timeout: 15000 });
    // WORKFLOW.md §3.2: the owner applies Residual Suffering to an enemy it does not own; the GM's client applies it, unprompted.
    const residualUse = `residual_${ids.suffix}`, debilitateUse = `debilitate_${ids.suffix}`;
    report.primal.residualByPlayer = await player.evaluate(async ({ id, castId, targetUuid, useId }) => {
      const result = await game.ak5e.caster.command(game.actors.get(id), "residual", { castId, targetUuid, damageType: "force", outcome: "hit", confirmed: true }, useId);
      return { result, targetOwned: fromUuidSync(targetUuid)?.isOwner ?? null, pool: game.ak5e.caster.inspect(game.actors.get(id)).residual.value };
    }, { id: ids.actors.primal, castId, targetUuid: `Actor.${ids.actors.targetA}`, useId: residualUse });
    report.primal.residual = await gm.evaluate(async ({ id, targetId, useId }) => {
      const target = game.actors.get(targetId), effect = target.effects.find(entry => entry.flags.ak5e?.casterPrimal?.opId === useId);
      const card = game.messages.contents.find(m => m.flags?.ak5e?.casterUse?.useId === useId);
      return { statuses: [...target.statuses], expiry: effect?.flags.ak5e.temporaryTag.expiry, instructions: effect?.flags.ak5e.temporaryTag.instructions,
        pool: game.ak5e.caster.inspect(game.actors.get(id)).residual.value, card: card?.content };
    }, { id: ids.actors.primal, targetId: ids.actors.targetA, useId: residualUse });
    check(report.primal.residualByPlayer.targetOwned === false, "The fixture target must be unowned by the player.");
    check(report.primal.residual.statuses.includes("blinded") && report.primal.residual.expiry?.trigger === "nextTurnEnd" && report.primal.residual.pool === 9,
      `Relayed Residual Suffering did not apply Blinded until the Caster's next Turn end: ${JSON.stringify(report.primal.residual)}`);
    check(/Applied by the GM&#39;s client|Applied by the GM's client/.test(report.primal.residual.card ?? ""), "The use card does not say the GM's client applied the change.");
    check(/Blinding Light/.test(report.primal.residual.instructions), "Enduring Affliction overlay text missing at level 15.");

    // Debilitate and Destroy without a GM ruling: the player picks a reading, then rolls from the card.
    const hpBeforeDebilitate = await gm.evaluate(id => game.actors.get(id).system.attributes.hp.value, ids.actors.targetA);
    report.primal.debilitateRequest = await player.evaluate(async ({ id, targetUuid, useId }) => {
      const actor = game.actors.get(id), data = { targetUuid, damageDealt: true, negativeConfirmed: true, confirmed: true };
      let reading = null; try { await game.ak5e.caster.command(actor, "debilitate", data, useId); } catch (error) { reading = { name: error.name, options: error.options?.map(option => option.value) }; }
      const pending = await game.ak5e.caster.command(actor, "debilitate", { ...data, reading: "bypassDRResist" }, useId);
      return { reading, pending, ruling: actor.getFlag("ak5e", "caster").rulings?.debilitateLoss ?? null };
    }, { id: ids.actors.primal, targetUuid: `Actor.${ids.actors.targetA}`, useId: debilitateUse });
    check(report.primal.debilitateRequest.reading?.name === "AK5eReading" && report.primal.debilitateRequest.pending.awaitingRoll && report.primal.debilitateRequest.pending.formula === "3d8"
      && !report.primal.debilitateRequest.ruling, `Debilitate reading/pending roll: ${JSON.stringify(report.primal.debilitateRequest)}`);
    await clickUseControl(player, ids.actors.primal, debilitateUse, ".ak5e-caster-roll", "owner-debilitate-roll-button");
    await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "caster").undo?.find(use => use.id === useId)?.status === "complete", { id: ids.actors.primal, useId: debilitateUse }, { timeout: 20000 });
    await player.evaluate(() => ui.sidebar.collapse());
    report.primal.debilitate = await gm.evaluate(({ id, targetId, useId }) => {
      const use = game.actors.get(id).getFlag("ak5e", "caster").undo.find(entry => entry.id === useId);
      return { roll: use.roll, hp: game.actors.get(targetId).system.attributes.hp.value };
    }, { id: ids.actors.primal, targetId: ids.actors.targetA, useId: debilitateUse });
    report.primal.debilitateRepeat = await player.evaluate(async ({ id, targetUuid }) => {
      try { await game.ak5e.caster.command(game.actors.get(id), "debilitate", { targetUuid, damageDealt: true, negativeConfirmed: true, reading: "bypassDRResist", confirmed: true }, "debilitate_repeat"); return "applied"; }
      catch (error) { return `${error.name}: ${error.message}`; }
    }, { id: ids.actors.primal, targetUuid: `Actor.${ids.actors.targetA}` });
    check(report.primal.debilitate.roll >= 3 && report.primal.debilitate.roll <= 24 && hpBeforeDebilitate - report.primal.debilitate.hp === report.primal.debilitate.roll
      && /^AK5eWarnings: .*this Turn/.test(report.primal.debilitateRepeat), `Debilitate and Destroy roll/HP loss/once per Turn: ${JSON.stringify({ hpBeforeDebilitate, ...report.primal.debilitate, repeat: report.primal.debilitateRepeat })}`);

    // Elemental Burst by the owner.
    // Operation receipts are per Caster; a per-run ID keeps earlier fixtures' cards out of this check.
    const burstId = `burst_${ids.suffix}`;
    report.primal.burst = await player.evaluate(async ({ id, burstId }) => game.ak5e.caster.command(game.actors.get(id), "elementalBurst", { condition: "ak5e-frozen", confirmed: true }, burstId), { id: ids.actors.primal, burstId });
    check(report.primal.burst.dc === ids.primalSetup.spellDc + 5, `Improved Elemental Burst DC ${report.primal.burst.dc} != ${ids.primalSetup.spellDc} + 5.`);
    await player.waitForFunction(({ id, burstId }) => { const message = game.messages.contents.find(m => m.flags?.ak5e?.casterOperation === burstId && m.flags.ak5e.casterActor === game.actors.get(id).uuid);
      return message && document.querySelector(`#chat-log [data-message-id="${message.id}"], .chat-log [data-message-id="${message.id}"]`); }, { id: ids.actors.primal, burstId }, { timeout: 15000 });
    report.primal.burstCard = await player.evaluate(({ id, burstId }) => {
      const message = game.messages.contents.find(m => m.flags?.ak5e?.casterOperation === burstId && m.flags.ak5e.casterActor === game.actors.get(id).uuid);
      const element = document.querySelector(`#chat-log [data-message-id="${message.id}"], .chat-log [data-message-id="${message.id}"]`);
      element.scrollIntoView();
      return { text: element.innerText.replace(/\s+/g, " "), saveLink: !!element.querySelector('[data-action="rollRequest"], .roll-link-group, a.roll-link, [data-type="save"]') };
    }, { id: ids.actors.primal, burstId });
    // Show the card itself in the expanded chat log, then restore the collapsed sidebar for later canvas clicks.
    await player.evaluate(async () => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
    await player.waitForTimeout(700);
    await player.evaluate(({ id, burstId }) => { const message = game.messages.contents.find(m => m.flags?.ak5e?.casterOperation === burstId && m.flags.ak5e.casterActor === game.actors.get(id).uuid);
      document.querySelector(`#sidebar [data-message-id="${message.id}"]`)?.scrollIntoView(); }, { id: ids.actors.primal, burstId });
    await player.waitForTimeout(300);
    await screenshot(player, "owner-elemental-burst-card");
    await player.evaluate(() => ui.sidebar.collapse());
    check(report.primal.burstCard.saveLink && /Elemental Burst/.test(report.primal.burstCard.text) && /Frozen/.test(report.primal.burstCard.text) && report.primal.burstCard.text.includes(String(ids.primalSetup.spellDc + 5)),
      `Elemental Burst card lacks its DC ${ids.primalSetup.spellDc + 5} save link: ${JSON.stringify(report.primal.burstCard)}`);
    await player.evaluate(async ({ id, targetUuid, burstId }) => game.ak5e.caster.command(game.actors.get(id), "burstCondition", { burstId, targetUuid, failedSave: true, confirmed: true }, `${burstId}_apply`),
      { id: ids.actors.primal, targetUuid: `Actor.${ids.actors.targetB}`, burstId });
    report.primal.burstCondition = await gm.evaluate(targetId => ({ statuses: [...game.actors.get(targetId).statuses] }), ids.actors.targetB);
    check(report.primal.burstCondition.statuses.includes("ak5e-frozen"), "The relayed Elemental Burst Condition was not applied.");

    // A second Elemental Burst before a Short Rest: the real panel shows the warning, and Use anyway posts it publicly.
    await player.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, ids.actors.primal);
    await player.locator(".ak5e-caster-panel").waitFor({ timeout: 15000 });
    await player.locator('.ak5e-caster-panel button[data-caster-ui="elementalBurst"]').click();
    const burstForm = player.locator('dialog:has(select[name="condition"])');
    await burstForm.waitFor({ timeout: 15000 });
    await burstForm.locator('select[name="condition"]').selectOption("ak5e-frozen");
    await burstForm.locator('input[name="confirmed"]').check();
    await burstForm.locator('button[data-action="submit"]').click();
    const warningDialog = player.locator('dialog:has(button[data-action="anyway"])');
    await warningDialog.waitFor({ timeout: 15000 });
    report.primal.warningDialog = (await warningDialog.innerText()).replace(/\s+/g, " ");
    await screenshot(player, "owner-warning-dialog");
    const messagesBeforeAnyway = await player.evaluate(() => game.messages.size);
    await warningDialog.locator('button[data-action="anyway"]').click();
    await player.waitForFunction(count => game.messages.size > count && /Used anyway/.test(game.messages.contents.at(-1).content), messagesBeforeAnyway, { timeout: 15000 });
    report.primal.usedAnywayCard = await player.evaluate(() => game.messages.contents.at(-1).content);
    await closeDialogs(player);
    check(/used since your last Short Rest/.test(report.primal.warningDialog) && /Used anyway:<\/strong> Elemental Burst has been used since your last Short Rest/.test(report.primal.usedAnywayCard),
      `Warning dialog or public override card: ${JSON.stringify({ dialog: report.primal.warningDialog, card: report.primal.usedAnywayCard })}`);

    // Undo from the card: the player reverses the relayed Hit Point loss.
    await clickUseControl(player, ids.actors.primal, debilitateUse, ".ak5e-caster-undo", "owner-undo-button");
    const undoDialog = player.locator('dialog:has(button[data-action="undo"])');
    await undoDialog.waitFor({ timeout: 15000 });
    report.primal.undoPreview = (await undoDialog.innerText()).replace(/\s+/g, " ");
    await screenshot(player, "owner-undo-dialog");
    await undoDialog.locator('button[data-action="undo"]').click();
    await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "caster").undo?.find(use => use.id === useId)?.status === "undone", { id: ids.actors.primal, useId: debilitateUse }, { timeout: 20000 });
    await player.evaluate(() => ui.sidebar.collapse());
    report.primal.undo = await gm.evaluate(({ targetId, useId }) => ({ hp: game.actors.get(targetId).system.attributes.hp.value,
      note: game.messages.contents.some(m => m.flags?.ak5e?.casterOperation === `${useId}-undo` && /Undone: Debilitate and Destroy/.test(m.content)) }), { targetId: ids.actors.targetA, useId: debilitateUse });
    check(/adds back/.test(report.primal.undoPreview) && report.primal.undo.hp === hpBeforeDebilitate && report.primal.undo.note, `Undo of the relayed HP loss: ${JSON.stringify({ hpBeforeDebilitate, ...report.primal.undo, preview: report.primal.undoPreview })}`);
    await gm.evaluate(id => game.actors.get(id).sheet.render(true), ids.actors.targetA);
    await gm.waitForTimeout(700); await screenshot(gm, "gm-target-blinded-sheet");
    await closeDialogs(gm);

    // Advance through the Caster's next Turn: Residual Suffering expires at its end.
    report.primal.expiry = await gm.evaluate(async ({ combatId, targetId }) => {
      const combat = game.combats.get(combatId), target = game.actors.get(targetId), seen = [];
      for (let step = 0; step < 6; step++) {
        await combat.nextTurn(); await new Promise(resolve => setTimeout(resolve, 600));
        seen.push({ round: combat.round, turn: combat.turn, blinded: target.statuses.has("blinded") });
      }
      return seen;
    }, { combatId: ids.combatId, targetId: ids.actors.targetA });
    const expiry = report.primal.expiry;
    check(expiry[4].blinded === true && expiry[5].blinded === false, `Blinded did not last through the Caster's next Turn and expire at its end: ${JSON.stringify(expiry)}`);
    // Round 2, turn 1: the Splash Caster's Turn.

    // Splash: Vitriolic Sphere with Overwhelming Detonation, Safe Zone and All-Consuming.
    await player.evaluate(uuids => { for (const [index, uuid] of uuids.entries()) canvas.tokens.get(uuid.split(".").at(-1)).setTarget(true, { user: game.user, releaseOthers: index === 0 }); }, [ids.tokens.targetA, ids.tokens.targetB]);
    report.splash.castDialog = await player.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); return true; }, ids.actors.splash);
    await player.locator(".ak5e-caster-panel").waitFor({ timeout: 15000 });
    await player.locator('.ak5e-caster-panel button[data-caster-ui="cast"]').click();
    const castForm = player.locator('dialog:has(input[name="overwhelm"])');
    await castForm.waitFor({ timeout: 15000 });
    report.splash.castForm = (await castForm.innerText()).replace(/\s+/g, " ");
    await screenshot(player, "owner-splash-cast-form");
    await castForm.locator('button[data-action="cancel"]').click();
    await closeDialogs(player);
    const sphere = await player.evaluate(id => game.actors.get(id).items.find(item => item.name === "Vitriolic Sphere")?.id, ids.actors.splash);
    check(sphere, "Splash Caster lacks the mapped Vitriolic Sphere.");
    const apBefore = await player.evaluate(id => game.actors.get(id).getFlag("ak5e", "artsPoints").value, ids.actors.splash);
    const templatesBefore = await player.evaluate(() => canvas.scene.templates.size);
    report.splash.cast = await cast(player, ids.actors.splash, sphere, { mode: "ap", level: 4, overwhelm: 2, safeZone: [`Actor.${ids.actors.targetB}`], allConsuming: true }, "owner-splash-sphere", { x: 1000, y: 500 });
    await player.waitForTimeout(800);
    report.splash.after = await player.evaluate(({ id, templatesBefore, messageId }) => {
      const actor = game.actors.get(id), message = game.messages.get(messageId), template = canvas.scene.templates.contents.at(-1);
      const element = document.querySelector(`[data-message-id="${messageId}"]`);
      return { ap: actor.getFlag("ak5e", "artsPoints").value, uses: actor.getFlag("ak5e", "caster").uses, templateCount: canvas.scene.templates.size - templatesBefore,
        templateDistance: template?.distance, templateType: template?.t, cardText: element?.innerText.replace(/\s+/g, " "), context: message.flags.ak5e.artCast.caster.context };
    }, { id: ids.actors.splash, templatesBefore, messageId: report.splash.cast.messageId });
    await screenshot(player, "owner-splash-template-and-card");
    const receipt = report.splash.cast.receipt;
    check(receipt.cost === 3 && apBefore - report.splash.after.ap === 3, `Vitriolic Sphere cost ${receipt.cost}: expected 4 - Growing Power 2 - Economics 1 + 2 Overwhelming.`);
    check(report.splash.after.uses.allConsuming === true, "All-Consuming use was not recorded.");
    check(report.splash.after.templateCount === 1 && report.splash.after.templateDistance === 30, `Overwhelming Detonation template: ${JSON.stringify(report.splash.after)}`);
    check(report.splash.after.cardText?.includes(`DC ${ids.splashSetup.spellDc + 2}`), `Controlled Detonation DC ${ids.splashSetup.spellDc + 2} missing from card: ${report.splash.after.cardText}`);

    // All-Consuming: the GM rolls target A's save from the card; D&D5e's roll dialog defaults to Disadvantage.
    const savePrior = await gm.evaluate(({ messageId, tokenUuid }) => {
      const token = canvas.tokens.get(tokenUuid.split(".").at(-1)); token.control({ releaseOthers: true });
      const prior = game.messages.contents.map(message => message.id);
      const button = document.querySelector(`#chat-log [data-message-id="${messageId}"] button[data-action="rollSave"], .chat-log [data-message-id="${messageId}"] button[data-action="rollSave"]`);
      button?.click();
      return { prior, button: !!button };
    }, { messageId: report.splash.cast.messageId, tokenUuid: ids.tokens.targetA });
    check(savePrior.button, "The Vitriolic Sphere card has no saving throw button.");
    const rollDialog = gm.locator('dialog:has(button[data-action="disadvantage"])');
    await rollDialog.waitFor({ timeout: 15000 });
    await screenshot(gm, "gm-all-consuming-save");
    const dialogFormula = (await rollDialog.innerText()).match(/1d20\S*/)?.[0] ?? null;
    const defaultAction = await rollDialog.evaluate(element => element.querySelector("button.default, button[autofocus]")?.dataset.action ?? null);
    await rollDialog.locator(`button[data-action="${defaultAction ?? "normal"}"]`).click();
    await gm.waitForFunction(prior => game.messages.contents.some(message => !prior.includes(message.id) && message.rolls?.length), savePrior.prior, { timeout: 15000 });
    report.splash.allConsumingSave = await gm.evaluate(prior => {
      const roll = game.messages.contents.find(message => !prior.includes(message.id) && message.rolls?.length)?.rolls?.[0];
      return { formula: roll?.formula, advantageMode: roll?.options?.advantageMode, disadvantage: roll?.options?.advantageMode === -1 || /kl|dis/.test(roll?.formula ?? "") };
    }, savePrior.prior);
    Object.assign(report.splash.allConsumingSave, { dialogFormula, defaultAction });
    check(defaultAction === "disadvantage" && report.splash.allConsumingSave.disadvantage, `All-Consuming save was not rolled with Disadvantage: ${JSON.stringify(report.splash.allConsumingSave)}`);

    // Splash area Damage by the owner through the GM relay; no ruling exists, so the player picks the Safe Zone reading for this use.
    const hpBeforeSplash = await gm.evaluate(({ a, b }) => [game.actors.get(a).system.attributes.hp.value, game.actors.get(b).system.attributes.hp.value], { a: ids.actors.targetA, b: ids.actors.targetB });
    report.splash.damageRequest = await player.evaluate(async ({ id, castId, a, b }) => {
      const actor = game.actors.get(id), data = uuid => ({ castId, targetUuid: uuid, amount: 20, type: "acid", reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true });
      await game.ak5e.caster.command(actor, "damage", { ...data(a), saveOutcome: "succeeded", onSuccess: "half", resistance: true }, `splash_a_${castId}`);
      let reading = ""; try { await game.ak5e.caster.command(actor, "damage", { ...data(b), saveOutcome: "failed", onSuccess: "half" }, `splash_b_${castId}`); } catch (error) { reading = error.name; }
      await game.ak5e.caster.command(actor, "damage", { ...data(b), saveOutcome: "failed", onSuccess: "half", reading: "safeZone" }, `splash_b_${castId}`);
      return { reading, card: game.messages.contents.findLast(m => m.flags?.ak5e?.casterUse?.useId === `splash_b_${castId}`)?.content };
    }, { id: ids.actors.splash, castId: report.splash.cast.receipt.id, a: `Actor.${ids.actors.targetA}`, b: `Actor.${ids.actors.targetB}` });
    const hpAfterSplash = await gm.evaluate(({ a, b }) => [game.actors.get(a).system.attributes.hp.value, game.actors.get(b).system.attributes.hp.value], { a: ids.actors.targetA, b: ids.actors.targetB });
    report.splash.damage = { lostA: hpBeforeSplash[0] - hpAfterSplash[0], lostB: hpBeforeSplash[1] - hpAfterSplash[1], reading: report.splash.damageRequest.reading };
    check(report.splash.damage.lostA === 10 && report.splash.damage.reading === "AK5eReading" && report.splash.damage.lostB === 0
      && /Player&#39;s reading for this use|Player's reading for this use/.test(report.splash.damageRequest.card ?? ""), `Splash area Damage: ${JSON.stringify(report.splash.damage)}`);
    report.splash.damageDialog = await commandDialog(player, ids.actors.splash, "Apply reviewed area Damage", "owner-splash-damage-dialog");

    // Splashing Cantrips on a single-target Cantrip.
    await player.evaluate(uuid => canvas.tokens.get(uuid.split(".").at(-1)).setTarget(true, { user: game.user, releaseOthers: true }), ids.tokens.targetA);
    const splashBlast = await player.evaluate(id => game.actors.get(id).items.find(item => item.name === "Eldritch Blast")?.id, ids.actors.splash);
    const cantrip = await cast(player, ids.actors.splash, splashBlast, { mode: "ap", level: 0 }, "owner-splash-cantrip");
    await player.waitForFunction(({ id, castId }) => game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId)?.completed, { id: ids.actors.splash, castId: cantrip.receipt.id }, { timeout: 15000 });
    report.splash.splashingCantrip = await player.evaluate(async ({ id, castId, targetUuid }) =>
      game.ak5e.caster.command(game.actors.get(id), "splashCantrip", { castId, primaryTargetUuid: targetUuid, amount: 9, singleTarget: true, confirmed: true }, `splash_cantrip_${castId}`),
      { id: ids.actors.splash, castId: cantrip.receipt.id, targetUuid: `Actor.${ids.actors.targetA}` });
    check(report.splash.splashingCantrip.halved === 4 && report.splash.splashingCantrip.dc === ids.splashSetup.spellDc + 2, `Splashing Cantrips: ${JSON.stringify(report.splash.splashingCantrip)}`);
    await player.waitForTimeout(500); await screenshot(player, "owner-splashing-cantrip-card");
    const hpBeforeCantrip = await gm.evaluate(a => game.actors.get(a).system.attributes.hp.value, ids.actors.targetA);
    await player.evaluate(async ({ id, castId, a }) => game.ak5e.caster.command(game.actors.get(id), "damage", { castId, splashOf: castId, splashRole: "primary", targetUuid: a, amount: 0, type: "force",
      reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true }, `splash_primary_${castId}`), { id: ids.actors.splash, castId: cantrip.receipt.id, a: `Actor.${ids.actors.targetA}` });
    report.splash.splashDamage = { lost: hpBeforeCantrip - await gm.evaluate(a => game.actors.get(a).system.attributes.hp.value, ids.actors.targetA) };
    check(report.splash.splashDamage.lost === 4, `Splashing Cantrip halved Damage: ${JSON.stringify(report.splash.splashDamage)}`);

    // CHAIN-BEGIN
    // Chain Caster (level 15), WORKFLOW.md §3.2 as the non-GM owner: out-of-turn use, the three-additional-target cap, warnings, Ouroboros, Sparks, expiry, rest, undo and relay.
    const chainStartErrors = report.errors.length, chainId = ids.actors.chain, chainTokens = ids.tokens;
    const chainActorUuid = `Actor.${chainId}`, npcUuid = key => `Actor.${ids.actors[key]}`;
    check(ids.chainSetup.features.length >= 2, `Chain level 15 feature Items: ${ids.chainSetup.features}`);
    const readEffects = key => gm.evaluate(({ id }) => game.actors.get(id).effects.filter(effect => effect.flags.ak5e?.casterSpark).map(effect => ({ opId: effect.flags.ak5e.casterSpark.opId, effect: effect.flags.ak5e.casterSpark.effect,
      name: effect.name, changes: effect.changes.map(change => `${change.key}:${change.mode}:${change.value}`) })), { id: ids.actors[key] });

    // 1. Panel counters and the Subtle Spark control.
    await setTargets(player, [chainTokens.chainA, chainTokens.chainB]);
    await openPanel(player, chainId);
    report.chain.panel = (await player.locator(".ak5e-caster-panel").innerText()).replace(/\s+/g, " ");
    report.chain.panelControls = await player.locator(".ak5e-caster-panel button").allInnerTexts();
    await screenshot(player, "owner-chain-panel");
    const chainMax = ids.chainSetup.pools;
    check(new RegExp(`Chain Art:\\s*${chainMax.chainArt} / ${chainMax.chainArt}`).test(report.chain.panel) && new RegExp(`Sparks:\\s*${chainMax.sparks} / ${chainMax.sparks}`).test(report.chain.panel)
      && report.chain.panelControls.some(label => /Subtle Spark$/.test(label.trim())), `Chain panel counters/controls: ${report.chain.panel} | ${report.chain.panelControls}`);
    check(chainMax.chainArt === 5 && chainMax.sparks === 12, `Level 15 Chain pools should be Chain Art PB 5 and 12 Sparks: ${JSON.stringify(chainMax)}`);
    report.chain.outOfTurn = await player.evaluate(({ combatId, actorId }) => {
      const combat = game.combats.get(combatId), actor = game.actors.get(actorId);
      return { currentActorUuid: combat.combatant.actor.uuid, casterUuid: actor.uuid, outOfTurn: combat.combatant.actor.uuid !== actor.uuid };
    }, { combatId: ids.combatId, actorId: chainId });
    check(report.chain.outOfTurn.outOfTurn, `The Chain owner should be able to use the branch while another combatant has the Turn: ${JSON.stringify(report.chain.outOfTurn)}`);
    await closeDialogs(player);

    // 2. Cast form fieldset; level 15 permits three additional Creatures within 15 ft. The Art card lists all four and the public Chain Art card has Undo.
    const arrowId = await player.evaluate(id => game.actors.get(id).items.find(item => item.name === "Acid Arrow")?.id, chainId);
    const splashId = await player.evaluate(id => game.actors.get(id).items.find(item => item.name === "Acid Splash")?.id, chainId);
    check(arrowId && splashId, "The Chain Caster lacks the mapped Acid Arrow / Acid Splash.");
    await setTargets(player, [chainTokens.chainA, chainTokens.chainB, chainTokens.chainD, chainTokens.chainE]);
    let prior = await messageIds(player);
    report.chain.castForm = await submitChainCastForm(player, chainId, { itemId: arrowId, level: 2, mode: "chain", original: chainTokens.chainA,
      chainTo: [chainTokens.chainB, chainTokens.chainD, chainTokens.chainE], single: true }, "owner-chain-cast-form");
    check(/Chain Art \(5 use\(s\) left\)/.test(report.chain.castForm) && /Ouroboros/.test(report.chain.castForm) && /single Creature/.test(report.chain.castForm), `Cast form lacks the Chain Art fieldset: ${report.chain.castForm}`);
    report.chain.cast1 = await finishNativeUse(player, chainId, "owner-chain-cast1", prior);
    await player.waitForFunction(({ id, castId }) => game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId)?.completed, { id: chainId, castId: report.chain.cast1.castId }, { timeout: 20000 });
    await player.waitForFunction(({ id, useId }) => game.messages.contents.some(m => m.flags?.ak5e?.casterUse?.useId === useId && m.flags.ak5e.casterUse.actorUuid === game.actors.get(id).uuid), { id: chainId, useId: `${report.chain.cast1.castId}-chain` }, { timeout: 15000 });
    report.chain.pools1 = await casterFlag(player, chainId);
    report.chain.card1 = await showUseCard(player, chainId, `${report.chain.cast1.castId}-chain`, "owner-chain-card");
    report.chain.cast1.recorded = await player.evaluate(({ id, castId }) => { const context = game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId).context;
      return { mode: context.chain.mode, chained: context.chain.chainedNames, overridden: context.overridden }; }, { id: chainId, castId: report.chain.cast1.castId });
    check(report.chain.cast1.targets.length === 4 && /4 Creatures/i.test(report.chain.cast1.cardText) && report.chain.cast1.rolls === 0 && report.chain.pools1.chainArt === 4
      && /Chain Art/.test(report.chain.card1.text) && /chains from/.test(report.chain.card1.text) && /Undo/i.test(report.chain.card1.text) && report.chain.card1.html.includes("ak5e-caster-undo"),
      `Three-additional-target Chain Art cast: ${JSON.stringify({ targets: report.chain.cast1.targets, rolls: report.chain.cast1.rolls, pools: report.chain.pools1.chainArt, card: report.chain.card1.text })}`);

    // 3. Chain Art to the far token: the warning dialog lists the 15-foot limit; Use anyway lists it publicly.
    await setTargets(player, [chainTokens.chainA, chainTokens.chainC]);
    prior = await messageIds(player);
    await submitChainCastForm(player, chainId, { itemId: arrowId, level: 2, mode: "chain", original: chainTokens.chainA, chainTo: [chainTokens.chainC], single: true }, "owner-chain-cast-form-far");
    const chainWarning = player.locator('dialog:has(button[data-action="anyway"])');
    await chainWarning.waitFor({ timeout: 15000 });
    report.chain.warningDialog = (await chainWarning.innerText()).replace(/\s+/g, " ");
    await screenshot(player, "owner-chain-warning");
    const apCasts = await player.evaluate(id => game.actors.get(id).getFlag("ak5e", "caster").casts.length, chainId);
    check(/more than 15 feet from/.test(report.chain.warningDialog) && /Use anyway/.test(report.chain.warningDialog), `Chain far-token warning: ${report.chain.warningDialog}`);
    // Cancel changes nothing; then submit again and use anyway.
    await chainWarning.locator('button[data-action="cancel"]').click();
    await player.waitForTimeout(500);
    report.chain.afterCancel = { casts: await player.evaluate(id => game.actors.get(id).getFlag("ak5e", "caster").casts.length, chainId), pools: await casterFlag(player, chainId) };
    check(report.chain.afterCancel.casts === apCasts && report.chain.afterCancel.pools.chainArt === 4, `Cancelling the warning dialog changed state: ${JSON.stringify(report.chain.afterCancel)}`);
    await closeDialogs(player);
    await submitChainCastForm(player, chainId, { itemId: arrowId, level: 2, mode: "chain", original: chainTokens.chainA, chainTo: [chainTokens.chainC], single: true }, "owner-chain-cast-form-far-again");
    await chainWarning.waitFor({ timeout: 15000 });
    await chainWarning.locator('button[data-action="anyway"]').click();
    report.chain.cast2 = await finishNativeUse(player, chainId, "owner-chain-cast2", prior);
    await player.waitForFunction(({ id, castId }) => game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId)?.completed, { id: chainId, castId: report.chain.cast2.castId }, { timeout: 20000 });
    await player.waitForFunction(({ id, useId }) => game.messages.contents.some(m => m.flags?.ak5e?.casterUse?.useId === useId && m.flags.ak5e.casterUse.actorUuid === game.actors.get(id).uuid), { id: chainId, useId: `${report.chain.cast2.castId}-chain` }, { timeout: 15000 });
    report.chain.pools2 = await casterFlag(player, chainId);
    report.chain.card2 = await showUseCard(player, chainId, `${report.chain.cast2.castId}-chain`, "owner-chain-card-used-anyway");
    report.chain.cast2.publicOverride = await player.evaluate(({ castId }) => game.messages.contents.some(m => /used anyway/i.test(m.content) && m.flags?.ak5e?.casterUse?.useId !== `${castId}-chain` && /more than 15 feet/.test(m.content)), { castId: report.chain.cast2.castId });
    check(/Used anyway/.test(report.chain.card2.text) && /more than 15 feet/.test(report.chain.card2.text) && report.chain.pools2.chainArt === 3 && report.chain.cast2.rolls === 0,
      `Used-anyway Chain Art card: ${JSON.stringify({ card: report.chain.card2.text, pools: report.chain.pools2 })}`);

    // 4. Ouroboros: the GM rolls the original target's save from the Ouroboros cast's card (Disadvantage); a save from another Art's card is unaffected.
    await setTargets(player, [chainTokens.chainA]);
    const gmSave = async (messageId, tokenUuid, key) => {
      const state = await gm.evaluate(({ messageId, tokenUuid }) => {
        const token = canvas.tokens.get(tokenUuid.split(".").at(-1)); token.control({ releaseOthers: true });
        const prior = game.messages.contents.map(message => message.id);
        const button = document.querySelector(`#chat-log [data-message-id="${messageId}"] button[data-action="rollSave"], .chat-log [data-message-id="${messageId}"] button[data-action="rollSave"]`);
        button?.click();
        return { prior, button: !!button };
      }, { messageId, tokenUuid });
      check(state.button, `${key}: the Art's card has no saving throw button.`);
      const dialog = gm.locator('dialog:has(button[data-action="disadvantage"])');
      await dialog.waitFor({ timeout: 15000 });
      await screenshot(gm, key);
      const dialogFormula = (await dialog.innerText()).match(/\d?d20\S*/)?.[0] ?? null;
      const defaultAction = await dialog.evaluate(element => element.querySelector("button.default, button[autofocus]")?.dataset.action ?? null);
      await dialog.locator(`button[data-action="${defaultAction ?? "normal"}"]`).click();
      await gm.waitForFunction(prior => game.messages.contents.some(message => !prior.includes(message.id) && message.rolls?.length), state.prior, { timeout: 15000 });
      return gm.evaluate(prior => { const roll = game.messages.contents.find(message => !prior.includes(message.id) && message.rolls?.length)?.rolls?.[0];
        return { formula: roll?.formula, advantageMode: roll?.options?.advantageMode, disadvantage: roll?.options?.advantageMode === -1 || /kl/.test(roll?.formula ?? "") }; }, state.prior).then(roll => ({ ...roll, dialogFormula, defaultAction }));
    };
    const controlCast = await cast(player, chainId, splashId, { mode: "ap", level: 0 }, "owner-chain-control-cast");
    report.chain.controlSave = await gmSave(controlCast.messageId, chainTokens.chainA, "gm-chain-control-save");
    const ouroborosCast = await cast(player, chainId, splashId, { mode: "ap", level: 0, chain: { mode: "ouroboros", originalTokenUuid: chainTokens.chainA, chainedTokenUuids: [], singleTarget: true } }, "owner-chain-ouroboros");
    await player.waitForFunction(({ id, castId }) => game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId)?.completed, { id: chainId, castId: ouroborosCast.receipt.id }, { timeout: 20000 });
    report.chain.ouroborosSave = await gmSave(ouroborosCast.messageId, chainTokens.chainA, "gm-chain-ouroboros-save");
    report.chain.pools3 = await casterFlag(player, chainId);
    check(!report.chain.controlSave.disadvantage && report.chain.ouroborosSave.disadvantage && report.chain.ouroborosSave.defaultAction === "disadvantage" && report.chain.pools3.chainArt === 2,
      `Ouroboros Disadvantage: control ${JSON.stringify(report.chain.controlSave)} vs ${JSON.stringify(report.chain.ouroborosSave)}; Chain Art ${report.chain.pools3.chainArt}`);
    await closeDialogs(gm);

    // 5. Subtle Spark Innervate on an unowned NPC while the GM is connected: relayed automatically; no dice rolled.
    const cast1 = report.chain.cast1.castId, cast2 = report.chain.cast2.castId, cast4 = ouroborosCast.receipt.id;
    const innervateUse = `innervate_${ids.suffix}`;
    await setTargets(player, [chainTokens.chainA]);
    const rollsBeforeSpark = await player.evaluate(() => game.messages.contents.filter(m => m.rolls?.length).length);
    report.chain.innervate = await player.evaluate(async ({ id, castId, targetUuid, useId }) => {
      const result = await game.ak5e.caster.command(game.actors.get(id), "spark", { castId, effect: "innervate", upgraded: false, targetUuids: [targetUuid], singleTarget: true, confirmed: true }, useId);
      return { result, owned: fromUuidSync(targetUuid)?.isOwner ?? null };
    }, { id: chainId, castId: cast1, targetUuid: npcUuid("chainA"), useId: innervateUse });
    await gm.waitForFunction(({ id, useId }) => game.actors.get(id).effects.some(effect => effect.flags.ak5e?.casterSpark?.opId === useId), { id: ids.actors.chainA, useId: innervateUse }, { timeout: 15000 });
    report.chain.innervateEffects = await readEffects("chainA");
    report.chain.pools4 = await casterFlag(player, chainId);
    check(report.chain.innervate.owned === false && report.chain.innervateEffects.some(effect => effect.opId === innervateUse && effect.effect === "innervate" && effect.changes.includes("system.bonuses.mwak.attack:2:+1"))
      && report.chain.pools4.sparks === 11 && await player.evaluate(() => game.messages.contents.filter(m => m.rolls?.length).length) === rollsBeforeSpark, `Innervate relay: ${JSON.stringify({ innervate: report.chain.innervate, effects: report.chain.innervateEffects, sparks: report.chain.pools4.sparks })}`);
    report.chain.innervateCard = await showUseCard(player, chainId, innervateUse, "owner-spark-card");
    check(/Applied by the GM['\u2019]s client/.test(report.chain.innervateCard.text), `Innervate card does not say the GM's client applied the change: ${report.chain.innervateCard.text}`);
    await gm.evaluate(async id => { const sheet = game.actors.get(id).sheet; await sheet.render({ force: true }); await new Promise(resolve => setTimeout(resolve, 600)); sheet.changeTab?.("effects", "primary"); await new Promise(resolve => setTimeout(resolve, 500)); }, ids.actors.chainA);
    await screenshot(gm, "gm-spark-effect");
    report.chain.gmSheetEffects = await gm.evaluate(id => [...(game.actors.get(id).sheet.element?.querySelectorAll(".effects-list .effect-name, .effect .name, [data-effect-id]") ?? [])].map(node => node.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12), ids.actors.chainA);
    await gm.evaluate(id => game.actors.get(id).sheet.close(), ids.actors.chainA);

    // 6. Spark on two Creatures: no GM ruling, so the player's reading dialog (through the real form); per Creature spends 2 Sparks.
    await setTargets(player, [chainTokens.chainA, chainTokens.chainC]);
    await openPanel(player, chainId);
    await player.locator('.ak5e-caster-panel button[data-caster-ui="spark"]').click();
    const sparkForm = player.locator('dialog:has(select[name="effect"])');
    await sparkForm.waitFor({ timeout: 15000 });
    await sparkForm.locator('select[name="castId"]').selectOption(cast2);
    await sparkForm.locator('select[name="effect"]').selectOption("accelerate");
    check(await sparkForm.locator('input[name="targetUuids"]:checked').count() === 2, "The Spark form should pre-check both targeted Creatures.");
    await sparkForm.locator('input[name="singleTarget"]').check();
    await sparkForm.locator('input[name="confirmed"]').check();
    report.chain.sparkForm = (await sparkForm.innerText()).replace(/\s+/g, " ");
    await sparkForm.locator('button[data-action="submit"]').click();
    const readingDialog = player.locator('dialog:has(input[name="reading"])');
    await readingDialog.waitFor({ timeout: 15000 });
    report.chain.readingDialog = (await readingDialog.innerText()).replace(/\s+/g, " ");
    await screenshot(player, "owner-spark-reading");
    check(/no GM ruling|GM has not ruled/.test(report.chain.readingDialog) && /for each Creature/.test(report.chain.readingDialog) && /for the cast/.test(report.chain.readingDialog), `Spark reading dialog: ${report.chain.readingDialog}`);
    const sparksBeforeTwo = (await casterFlag(player, chainId)).sparks;
    await readingDialog.locator('input[name="reading"][value="perCreature"]').check();
    await readingDialog.locator('button[data-action="read"]').click();
    await player.waitForFunction(({ id, before }) => game.actors.get(id).flags.ak5e.resourcePools.subtleSparks.value === before - 2, { id: chainId, before: sparksBeforeTwo }, { timeout: 20000 });
    await gm.waitForFunction(({ a, c }) => [a, c].every(id => game.actors.get(id).effects.some(effect => effect.flags.ak5e?.casterSpark?.effect === "accelerate")), { a: ids.actors.chainA, c: ids.actors.chainC }, { timeout: 15000 });
    const twoTargetUseId = await player.waitForFunction(id => {
      const actor = game.actors.get(id), receipt = actor.getFlag("ak5e", "caster").undo.findLast(use => use.title === "Subtle Spark: Accelerate" && use.result?.spent === 2);
      return receipt && game.messages.contents.some(message => message.flags?.ak5e?.casterUse?.useId === receipt.id) ? receipt.id : null;
    }, chainId, { timeout: 15000 }).then(handle => handle.jsonValue());
    const twoTargetUseCard = await showUseCard(player, chainId, twoTargetUseId, "owner-spark-two-target-card");
    report.chain.twoTargets = { sparks: (await casterFlag(player, chainId)).sparks, before: sparksBeforeTwo,
      card: await player.evaluate(id => { const actor = game.actors.get(id), receipt = actor.getFlag("ak5e", "caster").undo.findLast(use => use.title === "Subtle Spark: Accelerate");
        return receipt ? { reading: receipt.reading, spent: receipt.result?.spent } : null; }, chainId),
      cardText: twoTargetUseCard.text,
      effects: { chainA: await readEffects("chainA"), chainC: await readEffects("chainC") } };
    check(report.chain.twoTargets.sparks === sparksBeforeTwo - 2 && report.chain.twoTargets.card?.spent === 2 && /Player(&#39;|')s reading for this use/.test(report.chain.twoTargets.cardText) && /for each Creature/.test(report.chain.twoTargets.cardText),
      `Spark per Creature reading: ${JSON.stringify(report.chain.twoTargets)}`);
    await closeDialogs(player);

    // 7. Decelerate: a Constitution save link at the Caster's Spell Save DC; the failed target then takes Speed -10.
    const decelerateUse = `decelerate_${ids.suffix}`;
    report.chain.decelerate = await player.evaluate(async ({ id, castId, targetUuid, useId }) => game.ak5e.caster.command(game.actors.get(id), "spark",
      { castId, effect: "decelerate", upgraded: false, targetUuids: [targetUuid], singleTarget: true, confirmed: true }, useId), { id: chainId, castId: cast4, targetUuid: npcUuid("chainA"), useId: decelerateUse });
    report.chain.decelerateCard = await showUseCard(player, chainId, decelerateUse, "owner-spark-decelerate-card");
    report.chain.decelerateCard.save = await player.evaluate(({ messageId }) => { const link = document.querySelector(`#sidebar [data-message-id="${messageId}"] a.roll-link, #chat [data-message-id="${messageId}"] a.roll-link`);
      return link ? { ability: link.dataset.ability, dc: link.dataset.dc, type: link.dataset.type } : null; }, { messageId: report.chain.decelerateCard.messageId });
    const chainDc = ids.chainSetup.spellDc;
    const aBefore = await gm.evaluate(id => game.actors.get(id).effects.filter(effect => effect.flags.ak5e?.casterSpark?.effect === "decelerate").length, ids.actors.chainA);
    check(aBefore === 0, "Decelerate must not be applied until the save is marked failed.");
    check(report.chain.decelerate.dc === chainDc && (report.chain.decelerateCard.save?.ability === "con" && Number(report.chain.decelerateCard.save?.dc) === chainDc || (new RegExp(`DC ${chainDc}`).test(report.chain.decelerateCard.text) && /Con/i.test(report.chain.decelerateCard.text))),
      `Decelerate save link/DC ${chainDc}: ${JSON.stringify({ result: report.chain.decelerate, save: report.chain.decelerateCard.save, text: report.chain.decelerateCard.text })}`);
    const conditionUse = `${decelerateUse}_apply`;
    await player.evaluate(async ({ id, sparkId, targetUuid, useId }) => game.ak5e.caster.command(game.actors.get(id), "sparkCondition", { sparkId, targetUuid, failedSave: true, confirmed: true }, useId),
      { id: chainId, sparkId: decelerateUse, targetUuid: npcUuid("chainA"), useId: conditionUse });
    await gm.waitForFunction(({ id, useId }) => game.actors.get(id).effects.some(effect => effect.flags.ak5e?.casterSpark?.opId === useId), { id: ids.actors.chainA, useId: conditionUse }, { timeout: 15000 });
    report.chain.decelerateEffects = (await readEffects("chainA")).filter(effect => effect.effect === "decelerate");
    report.chain.decelerateSpeed = await gm.evaluate(id => game.actors.get(id).system.attributes.movement.walk, ids.actors.chainA);
    check(report.chain.decelerateEffects.some(effect => effect.changes.includes("system.attributes.movement.walk:2:-10")), `Decelerate Speed -10 effect: ${JSON.stringify(report.chain.decelerateEffects)}`);
    report.chain.pools5 = await casterFlag(player, chainId);

    // 8. Undo the Innervate from its card: effect removed, Sparks restored, undo noted publicly.
    const sparksBeforeUndo = report.chain.pools5.sparks;
    await clickUseControl(player, chainId, innervateUse, ".ak5e-caster-undo", "owner-spark-undo");
    const sparkUndo = player.locator('dialog:has(button[data-action="undo"])');
    await sparkUndo.waitFor({ timeout: 15000 });
    report.chain.undoPreview = (await sparkUndo.innerText()).replace(/\s+/g, " ");
    await screenshot(player, "owner-spark-undo-dialog");
    await sparkUndo.locator('button[data-action="undo"]').click();
    await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "caster").undo?.find(use => use.id === useId)?.status === "undone", { id: chainId, useId: innervateUse }, { timeout: 20000 });
    await gm.waitForFunction(({ id, useId }) => !game.actors.get(id).effects.some(effect => effect.flags.ak5e?.casterSpark?.opId === useId), { id: ids.actors.chainA, useId: innervateUse }, { timeout: 15000 });
    report.chain.undone = { sparks: (await casterFlag(player, chainId)).sparks, effects: await readEffects("chainA"),
      note: await player.evaluate(useId => game.messages.contents.some(m => m.flags?.ak5e?.casterOperation === `${useId}-undo` && /Undone: Subtle Spark: Innervate/.test(m.content)), innervateUse) };
    report.chain.undoneCard = await showUseCard(player, chainId, innervateUse, "owner-spark-undone-card");
    check(report.chain.undone.sparks === sparksBeforeUndo + 1 && !report.chain.undone.effects.some(effect => effect.opId === innervateUse) && report.chain.undone.note
      && report.chain.undone.effects.some(effect => effect.effect === "decelerate"), `Undo of Innervate: ${JSON.stringify(report.chain.undone)}; preview ${report.chain.undoPreview}`);

    // 9. No GM connected: a Spark on an unowned Creature is reported "not applied yet", stays pending, and Retry applies it once a GM joins.
    await setTargets(player, [chainTokens.chainB]);
    const plain = await cast(player, chainId, splashId, { mode: "ap", level: 0 }, "owner-chain-plain-cast");
    await player.waitForFunction(({ id, castId }) => game.actors.get(id).getFlag("ak5e", "caster").casts.find(c => c.id === castId)?.completed, { id: chainId, castId: plain.receipt.id }, { timeout: 20000 });
    const offlineSpark = `offline_spark_${ids.suffix}`;
    await gm.context().close(); contexts.splice(contexts.indexOf(gm.context()), 1);
    await player.waitForFunction(() => !game.users.activeGM, null, { timeout: 30000 });
    report.chain.noGM = await player.evaluate(async ({ id, castId, targetUuid, useId }) => {
      try { await game.ak5e.caster.command(game.actors.get(id), "spark", { castId, effect: "innervate", upgraded: false, targetUuids: [targetUuid], singleTarget: true, confirmed: true }, useId); return "applied"; }
      catch (error) { return error.message; }
    }, { id: chainId, castId: plain.receipt.id, targetUuid: npcUuid("chainB"), useId: offlineSpark });
    report.chain.noGMStatus = await useStatus(player, chainId, offlineSpark);
    check(/Not applied yet: no GM is connected/.test(report.chain.noGM) && report.chain.noGMStatus === "pending", `No-GM Spark: ${report.chain.noGM} (${report.chain.noGMStatus})`);
    gm = await join("Gamemaster");
    await player.waitForFunction(() => !!game.users.activeGM, null, { timeout: 30000 });
    await openPanel(player, chainId);
    const sparkRetry = player.locator(`.ak5e-caster-panel button[data-caster-ui="retryUse"][data-operation-id="${offlineSpark}"]`);
    await sparkRetry.waitFor({ timeout: 15000 });
    await screenshot(player, "owner-spark-retry-pending");
    await sparkRetry.click();
    await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "caster").undo?.find(use => use.id === useId)?.status === "complete", { id: chainId, useId: offlineSpark }, { timeout: 30000 });
    await closeDialogs(player);
    report.chain.retried = (await readEffects("chainB")).some(effect => effect.opId === offlineSpark && effect.effect === "innervate");
    check(report.chain.retried, "The retried Spark did not apply once a GM joined.");

    // 10. Spark expiry is tied to the Chain Caster's next Turn: all active Spark effects remain through the other combatants, then expire at Chain's turn start.
    const expiryUse = `expiry_spark_${ids.suffix}`;
    await player.evaluate(async ({ id, castId, targetUuid, useId }) => game.ak5e.caster.command(game.actors.get(id), "spark",
      { castId, effect: "innervate", upgraded: false, targetUuids: [targetUuid], singleTarget: true, confirmed: true }, useId),
    { id: chainId, castId: cast1, targetUuid: npcUuid("chainE"), useId: expiryUse });
    await gm.waitForFunction(({ id, useId }) => game.actors.get(id).effects.some(effect => effect.flags.ak5e?.casterSpark?.opId === useId), { id: ids.actors.chainE, useId: expiryUse }, { timeout: 15000 });
    // Advance until the Chain Caster's own Turn starts, wherever initiative placed it.
    report.chain.expiry = await gm.evaluate(async ({ combatId, actors, casterUuid }) => {
      const combat = game.combats.get(combatId), keys = ["chainA", "chainB", "chainC", "chainE"], seen = [];
      const count = () => keys.reduce((total, key) => total + game.actors.get(actors[key]).effects.filter(effect => effect.flags.ak5e?.casterSpark).length, 0);
      for (let step = 0; step <= combat.turns.length; step++) {
        await combat.nextTurn(); await new Promise(resolve => setTimeout(resolve, 350));
        seen.push({ round: combat.round, turn: combat.turn, currentActor: combat.combatant.actor.uuid, effects: count() });
        if (combat.combatant.actor.uuid === casterUuid) break;
      }
      return seen;
    }, { combatId: ids.combatId, actors: ids.actors, casterUuid: chainActorUuid });
    const expiryLast = report.chain.expiry.at(-1);
    check(expiryLast?.currentActor === chainActorUuid && expiryLast.effects === 0
      && report.chain.expiry.slice(0, -1).every(step => step.effects > 0),
      `Spark effects must last until the start of the Chain Caster's next Turn: ${JSON.stringify(report.chain.expiry)}`);

    // 11. Great Chain of Being restores one use on a Short Rest, and a Long Rest restores Chain Art and all six Sparks.
    report.chain.shortRest = await player.evaluate(async id => {
      const actor = game.actors.get(id), before = game.ak5e.caster.inspect(actor).chain.chainArt.value;
      const result = await actor.shortRest({ dialog: false, chat: false, request: true, advanceTime: false });
      // AK5e recovery runs in an un-awaited D&D5e rest hook; wait for it to land before reading the pools.
      for (let i = 0; i < 40 && game.ak5e.caster.inspect(actor).chain.chainArt.value === before; i++) await new Promise(resolve => setTimeout(resolve, 250));
      const pool = game.ak5e.caster.inspect(actor).chain;
      return { rested: !!result, chainArt: pool.chainArt.value, sparks: pool.sparks.value };
    }, chainId);
    check(report.chain.shortRest.chainArt === 3 && report.chain.shortRest.sparks === 7,
      `Great Chain Short Rest should restore exactly one Chain Art use, not Sparks: ${JSON.stringify(report.chain.shortRest)}`);
    report.chain.longRest = await player.evaluate(async id => {
      const actor = game.actors.get(id), result = await actor.longRest({ dialog: false, chat: false, request: true, advanceTime: false, advanceBastionTurn: false });
      const full = () => { const pool = game.ak5e.caster.inspect(actor).chain; return pool.chainArt.value === pool.chainArt.max && pool.sparks.value === pool.sparks.max; };
      for (let i = 0; i < 40 && !full(); i++) await new Promise(resolve => setTimeout(resolve, 250));
      const pool = game.ak5e.caster.inspect(actor).chain;
      return { rested: !!result, chainArt: pool.chainArt.value, sparks: pool.sparks.value };
    }, chainId);
    check(report.chain.longRest.chainArt === 5 && report.chain.longRest.sparks === 12,
      `Long Rest should restore all Chain Art uses and all Sparks: ${JSON.stringify(report.chain.longRest)}`);
    report.chain.pools6 = await casterFlag(player, chainId);
    report.chain.errors = report.errors.slice(chainStartErrors);
    // CHAIN-END

    // No GM connected: a relayed change is not applied yet, is reported, and is retried from the panel once a GM joins.
    const offlineUse = `offline_${ids.suffix}`;
    await gm.context().close(); contexts.splice(contexts.indexOf(gm.context()), 1);
    await player.waitForFunction(() => !game.users.activeGM, null, { timeout: 30000 });
    report.permissions.noGM = await player.evaluate(async ({ id, castId, targetUuid, useId }) => {
      try { await game.ak5e.caster.command(game.actors.get(id), "residual", { castId, targetUuid, damageType: "force", outcome: "hit", confirmed: true }, useId); return "applied"; }
      catch (error) { return error.message; }
    }, { id: ids.actors.primal, castId, targetUuid: `Actor.${ids.actors.targetB}`, useId: offlineUse });
    check(/Not applied yet: no GM is connected/.test(report.permissions.noGM) && await useStatus(player, ids.actors.primal, offlineUse) === "pending", `No-GM relay: ${report.permissions.noGM}`);
    gm = await join("Gamemaster");
    await player.waitForFunction(() => !!game.users.activeGM, null, { timeout: 30000 });
    await player.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, ids.actors.primal);
    const retry = player.locator(`.ak5e-caster-panel button[data-caster-ui="retryUse"][data-operation-id="${offlineUse}"]`);
    await retry.waitFor({ timeout: 15000 });
    await screenshot(player, "owner-retry-pending");
    await retry.click();
    await player.waitForFunction(({ id, useId }) => game.actors.get(id).getFlag("ak5e", "caster").undo?.find(use => use.id === useId)?.status === "complete", { id: ids.actors.primal, useId: offlineUse }, { timeout: 30000 });
    await closeDialogs(player);
    report.permissions.retried = await gm.evaluate(({ targetId, useId }) => game.actors.get(targetId).effects.some(effect => effect.flags.ak5e?.casterPrimal?.opId === useId), { targetId: ids.actors.targetB, useId: offlineUse });
    check(report.permissions.retried, "The retried relay did not apply Residual Suffering once a GM joined.");

    // Ending the combat closes the encounter window: earlier uses are locked for the player.
    await gm.evaluate(id => game.combats.get(id).delete(), ids.combatId);
    await player.waitForFunction(id => game.ak5e.caster.inspect(game.actors.get(id)).uses.find(use => use.title === "Residual Suffering")?.locked === true, ids.actors.primal, { timeout: 15000 });
    report.permissions.locked = await player.evaluate(async ({ id, useId }) => {
      try { await game.ak5e.caster.command(game.actors.get(id), "undoUse", { useId }, "undo_locked"); return "undone"; } catch (error) { return error.message; }
    }, { id: ids.actors.primal, useId: residualUse });
    check(/locked/.test(report.permissions.locked), `A use from the ended combat was not locked: ${report.permissions.locked}`);
    report.chain.locked = await player.evaluate(async ({ id, useId }) => {
      const actor = game.actors.get(id), receipt = actor.getFlag("ak5e", "caster").undo.find(use => use.id === useId);
      try { await game.ak5e.caster.command(actor, "undoUse", { useId }, `undo_chain_locked_${foundry.utils.randomID()}`); return { status: receipt?.status, result: "undone" }; }
      catch (error) { return { status: receipt?.status, result: error.message }; }
    }, { id: ids.actors.chain, useId: `${report.chain.cast1.castId}-chain` });
    check(report.chain.locked.status === "complete" && /locked/.test(report.chain.locked.result),
      `A Chain Art receipt from the ended encounter must remain recorded and locked: ${JSON.stringify(report.chain.locked)}`);

    // GM rulings dialog and observer view.
    await gm.evaluate(id => { globalThis.__casterPanel = game.ak5e.caster.open(game.actors.get(id)); }, ids.actors.splash);
    await gm.locator(".ak5e-caster-panel").waitFor({ timeout: 15000 });
    await gm.locator('.ak5e-caster-panel button[data-caster-ui="rulings"]').click();
    const rulings = gm.locator('dialog:has(select[name="key"])'); await rulings.waitFor({ timeout: 15000 });
    report.permissions.rulingKeys = await rulings.locator('select[name="key"] option').allTextContents();
    check(report.permissions.rulingKeys.includes("Debilitate and Destroy Hit Point loss") && report.permissions.rulingKeys.includes("Safe Zone and Maximum Burst on the same Creature"), "New rulings are missing from the GM dialog.");
    await screenshot(gm, "gm-rulings-dialog");
    await rulings.locator('button[data-action="cancel"]').click(); await closeDialogs(gm);
    const observer = await join("Caster Live Observer");
    report.permissions.observer = await observer.evaluate(async id => {
      const actor = game.actors.get(id); await actor.sheet.render(true); await new Promise(resolve => setTimeout(resolve, 800));
      let opened = ""; try { await game.ak5e.caster.open(actor); opened = "opened"; } catch (error) { opened = error.message; }
      return { owner: actor.isOwner, panelButtons: document.querySelectorAll(".ak5e-caster-sheet-panel button").length, opened };
    }, ids.actors.primal);
    await screenshot(observer, "observer-primal-sheet");
    check(!report.permissions.observer.owner && report.permissions.observer.panelButtons === 0, `Observer saw Caster controls: ${JSON.stringify(report.permissions.observer)}`);
    // 10. An Observer sees no Chain controls on the Chain Caster's sheet and cannot run Chain commands (the Actor's owner and the GM only).
    report.chain.observer = await observer.evaluate(async id => {
      const actor = game.actors.get(id); await actor.sheet.render(true); await new Promise(resolve => setTimeout(resolve, 800));
      const panel = document.querySelector(".ak5e-caster-sheet-panel");
      const before = actor.getFlag("ak5e", "caster").undo?.length ?? 0;
      let command = ""; try { await game.ak5e.caster.command(actor, "spark", { castId: "none", effect: "innervate", targetUuids: [], confirmed: true }, "observer_spark"); command = "accepted"; } catch (error) { command = error.message; }
      let open = ""; try { await game.ak5e.caster.open(actor); open = "opened"; } catch (error) { open = error.message; }
      return { owner: actor.isOwner, panelButtons: document.querySelectorAll(".ak5e-caster-sheet-panel button").length, panelText: panel?.innerText.replace(/\s+/g, " ") ?? null,
        sparkControl: [...document.querySelectorAll("button, [data-caster-ui]")].some(node => /Subtle Spark|Cast an Art/i.test(node.innerText ?? "") && !node.closest(".chat-message")),
        command, open, undoBefore: before, undoAfter: actor.getFlag("ak5e", "caster").undo?.length ?? 0 };
    }, ids.actors.chain);
    await closeDialogs(observer);
    await screenshot(observer, "observer-chain-sheet");
    check(!report.chain.observer.owner && report.chain.observer.panelButtons === 0 && !report.chain.observer.sparkControl && report.chain.observer.command !== "accepted" && report.chain.observer.undoAfter === report.chain.observer.undoBefore,
      `Observer Chain controls/commands: ${JSON.stringify(report.chain.observer)}`);

    // Reload persistence for the owner.
    await player.reload(); await player.waitForFunction(() => globalThis.game?.ready && game.ak5e?.caster, null, { timeout: 60000 });
    report.persistence.reload = await player.evaluate(({ primal, splash }) => ({ residual: game.ak5e.caster.inspect(game.actors.get(primal)).residual.value,
      allConsuming: game.actors.get(splash).getFlag("ak5e", "caster").uses.allConsuming, elementalBurst: game.actors.get(primal).getFlag("ak5e", "caster").uses.elementalBurst }), { primal: ids.actors.primal, splash: ids.actors.splash });
    check(report.persistence.reload.residual === 8 && report.persistence.reload.allConsuming && report.persistence.reload.elementalBurst, `Use state did not persist across reload: ${JSON.stringify(report.persistence.reload)}`);
    report.persistence.reload.chain = await casterFlag(player, ids.actors.chain);
    check(report.persistence.reload.chain.chainArt === report.chain.pools6.chainArt && report.persistence.reload.chain.sparks === report.chain.pools6.sparks
      && JSON.stringify(report.persistence.reload.chain.undo) === JSON.stringify(report.chain.pools6.undo), `Chain state did not persist across a browser reload: ${JSON.stringify(report.persistence.reload.chain)} vs ${JSON.stringify(report.chain.pools6)}`);
    Object.assign(report.persistence, await gm.evaluate(({ actors }) => {
      const out = {};
      for (const key of ["primal", "splash"]) { const actor = game.actors.get(actors[key]); out[key] = { itemIds: actor.items.map(item => item.id).sort(), ap: actor.getFlag("ak5e", "artsPoints"), uses: actor.getFlag("ak5e", "caster").uses }; }
      out.primal.residual = game.ak5e.caster.inspect(game.actors.get(actors.primal)).residual.value;
      out.targetBPrimalEffects = game.actors.get(actors.targetB).effects.filter(effect => effect.flags.ak5e?.casterPrimal).map(effect => ({ name: effect.name, statuses: [...effect.statuses] }));
      return out;
    }, { actors: ids.actors }));
    // 12. Chain state the restart run compares: pools, receipt statuses and Spark effects.
    report.persistence.chain = await gm.evaluate(({ actors }) => {
      const actor = game.actors.get(actors.chain), pools = game.ak5e.caster.inspect(actor).chain;
      return { itemIds: actor.items.map(item => item.id).sort(), chainArt: pools.chainArt.value, sparks: pools.sparks.value,
        receipts: (actor.getFlag("ak5e", "caster").undo ?? []).map(use => `${use.id}:${use.status}`).sort(),
        effects: Object.fromEntries(["chainA", "chainB", "chainC", "chainD", "chainE"].map(key => [key, game.actors.get(actors[key]).effects.filter(effect => effect.flags.ak5e?.casterSpark)
          .map(effect => `${effect.flags.ak5e.casterSpark.opId}:${effect.flags.ak5e.casterSpark.effect}:${effect.changes.map(change => change.value).join("|")}`).sort()])) };
    }, { actors: ids.actors });
    check(report.persistence.chain.chainArt === 5 && report.persistence.chain.sparks === 12 && Object.values(report.persistence.chain.effects).every(effects => effects.length === 0),
      `Chain end-of-run state: ${JSON.stringify(report.persistence.chain)}`);
  }
  report.unexpectedBrowserErrors = report.errors;
  report.passed = report.errors.length === 0;
} catch (error) {
  report.failure = error.stack ?? error.message;
  report.passed = false;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  const seen = new WeakSet(); // browser-returned documents can carry cycles (system.attributes.hd.actor)
  await writeFile(`${output}.json`, JSON.stringify(report, (key, value) => {
    if (value && typeof value === "object") { if (seen.has(value)) return "[circular]"; seen.add(value); }
    return value;
  }, 2));
  console.log(JSON.stringify({ passed: report.passed, failure: report.failure, errors: report.errors.slice(0, 8), screenshots: report.screenshots.length }, null, 2));
}
if (!report.passed) process.exitCode = 1;
