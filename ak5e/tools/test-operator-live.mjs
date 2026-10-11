/** Optional live test. Run only against the disposable sp-test World on port 30133. */
import { writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium);
const errors = [], report = {};
const listen = page => { page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); }); };
async function join(userName) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage(); listen(page);
  await page.goto("http://127.0.0.1:30133/join");
  await page.selectOption('select[name="userid"]', { label: userName }); await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready, null, { timeout: 45000 });
  await page.waitForFunction(() => !game.scenes.active || globalThis.canvas?.ready, null, { timeout: 45000 });
  if (await page.evaluate(() => game.world.id) !== "sp-test") throw new Error("Live SP tests require the disposable sp-test World.");
  console.log(`Joined ${userName}.`);
  return page;
}
try {
  const gm = await join("Gamemaster");
  if (!await gm.evaluate(() => game.modules.get("ak5e").active)) {
    await gm.evaluate(() => game.settings.set("core", "moduleConfiguration", { ak5e: true })); await gm.reload();
    await gm.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 45000 });
  }
  report.slice = await gm.evaluate(async () => {
    const assert = (value, label) => { if (!value) throw new Error(label); };
    const runtime = await import("/modules/ak5e/scripts/operator-skills.mjs");
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { CHAPTER_FOUR_EQUIPMENT } = await import("/modules/ak5e/scripts/chapter-four-content.mjs");
    // Only a small playable slice is imported before catalogue expansion validation.
    for (const existing of game.actors.filter(actor => actor.getFlag("ak5e", "spLiveTest"))) await existing.delete();
    for (const combat of [...game.combats]) await combat.delete();
    for (const scene of game.scenes.filter(scene => scene.getFlag("ak5e", "spLiveTest"))) await scene.delete();
    for (const [name, role] of [["SP Owner One", 1], ["SP Owner Two", 1], ["SP Observer", 1], ["SP Second GM", 4]]) {
      if (!game.users.getName(name)) await User.implementation.create({ name, role, password: "", ...(role === 4 ? { _id: "zzzzzzzzzzzzzzzz" } : {}) });
    }
    const owners = [game.users.getName("SP Owner One").id, game.users.getName("SP Owner Two").id];
    const pc = await Actor.implementation.create({ name: "SP playable PC", type: "character", ownership: Object.fromEntries(owners.map(id => [id, 3])),
      flags: { ak5e: { spLiveTest: true } }, system: { attributes: { hp: { value: 30, max: 30 } } } });
    const npc = await Actor.implementation.create({ name: "SP hostile NPC", type: "npc", flags: { ak5e: { spLiveTest: true } }, system: { attributes: { hp: { value: 30, max: 30 }, ac: { calc: "flat", flat: 99 } } } });
    const ally = await Actor.implementation.create({ name: "SP ally", type: "character", ownership: Object.fromEntries(owners.map(id => [id, 3])), flags: { ak5e: { spLiveTest: true } }, system: { attributes: { hp: { value: 20, max: 30 } } } });
    const choose = name => CHAPTER_THREE_CLASSES.find(entry => entry.kind === "operator-skill" && entry.parentClass === "Defender" && entry.name === name);
    const skills = await pc.createEmbeddedDocuments("Item", ["Hidden Might", "Evasive Stance", "Meditation", "Mark Prey", "Lifestealer"].map(name => runtime.operatorSkillItemData(choose(name))));
    await pc.createEmbeddedDocuments("Item", [runtime.operatorSkillItemData(choose("Hidden Might"))]);
    await npc.createEmbeddedDocuments("Item", [runtime.operatorSkillItemData(choose("Evasive Stance"))]);
    const swordEntry = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.name === "Sword" && entry.itemType === "weapon");
    const [sword] = await pc.createEmbeddedDocuments("Item", [{ name: "SP Sword", type: "weapon", system: { ...swordEntry.systemData, equipped: true, proficient: 1 } }]);
    const [heal] = await pc.createEmbeddedDocuments("Item", [{ name: "SP healing Art", type: "spell", system: { level: 0, activities: { spHealing0000001: { _id: "spHealing0000001", type: "heal", healing: { number: 1, denomination: 4, types: ["healing"] } } } } }]);
    const scene = await Scene.implementation.create({ name: "SP test arena", width: 800, height: 600, flags: { ak5e: { spLiveTest: true } }, grid: { type: 1, size: 100 } });
    await scene.createEmbeddedDocuments("Token", [{ name: pc.name, actorId: pc.id, actorLink: true, x: 100, y: 100, disposition: 1 },
      { name: npc.name, actorId: npc.id, actorLink: true, x: 200, y: 100, disposition: -1 }, { name: ally.name, actorId: ally.id, actorLink: true, x: 300, y: 100, disposition: 1 },
      { name: "SP synthetic NPC", actorId: npc.id, actorLink: false, x: 400, y: 100, disposition: -1 }]);
    await scene.activate();
    const synthetic = scene.tokens.find(token => !token.actorLink).actor;
    await game.ak5e.configureOperatorSkills(pc, { enabled: true }); await game.ak5e.configureOperatorSkills(npc, { enabled: true }); await game.ak5e.configureOperatorSkills(synthetic, { enabled: true });
    assert(game.ak5e.getOperatorSkillState(pc).points === 0, "Adoption refilled SP");
    assert(game.ak5e.getOperatorSkillState(pc).maximum === 15, "Wrong pool maximum");
    assert(game.ak5e.getOperatorSkillState(pc).rates.offensive === 2 && game.ak5e.getOperatorSkillState(pc).rates.automatic === 4, "Stacking/duplicate counts");
    const combat = await Combat.implementation.create({ scene: scene.id, active: true });
    await combat.createEmbeddedDocuments("Combatant", [{ actorId: pc.id, tokenId: scene.tokens.find(token => token.actorId === pc.id).id, sceneId: scene.id, initiative: 20 },
      { actorId: npc.id, tokenId: scene.tokens.find(token => token.actorId === npc.id && token.actorLink).id, sceneId: scene.id, initiative: 10 }]);
    await combat.startCombat();
    const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error("SP live hook did not complete"); };
    await wait(() => game.ak5e.getOperatorSkillState(pc).points === 4);
    const attackActivity = sword.system.activities.contents[0];
    game.user.targets = new Set([scene.tokens.find(token => token.actorId === npc.id && token.actorLink).object]);
    await attackActivity.rollAttack({}, { configure: false }, { create: true });
    const attack = game.messages.contents.filter(message => message.flags.dnd5e?.roll?.type === "attack").at(-1);
    await wait(() => game.ak5e.getOperatorSkillState(npc).points === 2);
    assert(attack.rolls[0].total < 99, "Expected a native miss for Defensive test");
    await npc.update({ "system.attributes.hp.temp": 10 });
    await npc.applyDamage([{ value: 5, type: "slashing" }], { originatingMessage: attack });
    await wait(() => game.ak5e.getOperatorSkillState(pc).points === 6);
    assert(npc.system.attributes.hp.value === 30 && npc.system.attributes.hp.temp === 5, "Temporary HP damage test");
    assert(game.ak5e.getOperatorSkillState(npc).points === 2, "Defensive damage charged a second time");
    await npc.applyDamage([{ value: 2, type: "slashing" }], { originatingMessage: attack });
    await new Promise(resolve => setTimeout(resolve, 100)); assert(game.ak5e.getOperatorSkillState(pc).points === 6, "Attack charged for a second damage part");
    await heal.system.activities.contents[0].rollDamage({}, { configure: false }, { create: true });
    const healingMessage = game.messages.contents.filter(message => message.flags.dnd5e?.item?.id === heal.id).at(-1);
    await ally.applyDamage([{ value: 3, type: "healing" }], { originatingMessage: healingMessage });
    await wait(() => game.ak5e.getOperatorSkillState(pc).points === 8);
    await pc.applyDamage([{ value: 3, type: "healing" }], { originatingMessage: healingMessage });
    await new Promise(resolve => setTimeout(resolve, 100)); assert(game.ak5e.getOperatorSkillState(pc).points === 8, "Self-healing charged");
    await game.ak5e.adjustSkillPoints(pc, 7, { reason: "Live test setup" });
    const meditation = skills.find(item => item.name === "Meditation");
    await game.ak5e.activateOperatorSkill(pc, { itemId: meditation.id, confirmation: true, roll: false });
    assert(game.ak5e.getOperatorSkillState(pc).active === null && game.ak5e.getOperatorSkillState(pc).points === 5, "Instant lifecycle");
    assert(game.user.targets.size === 1, "A self buff cleared the selected attack target");
    const activationId = game.ak5e.getOperatorSkillState(pc).lastSkill.activationId;
    assert(game.messages.filter(message => message.getFlag("ak5e", "spActivation") === activationId && message.getFlag("ak5e", "skillOrigin")?.skillUuid === meditation.uuid).length === 1, "Activation source card/provenance");
    await runtime.submitOperatorCommand(pc, "origin", { itemId: meditation.id });
    await attackActivity.rollAttack({}, { configure: false }, { create: true });
    const skillAttack = game.messages.contents.filter(message => message.flags.dnd5e?.roll?.type === "attack").at(-1);
    assert(skillAttack.getFlag("ak5e", "skillOrigin")?.skillUuid === meditation.uuid, "Deferred origin missing");
    await npc.applyDamage([{ value: 1, type: "slashing" }], { originatingMessage: skillAttack });
    await new Promise(resolve => setTimeout(resolve, 100)); assert(game.ak5e.getOperatorSkillState(pc).points === 5 && game.ak5e.getOperatorSkillState(npc).points === 2, "Skill effect charged SP");
    await pc.sheet.render(true); await npc.sheet.render(true);
    await pc.setFlag("ak5e", "spLiveRefs", { npc: npc.uuid, ally: ally.uuid, synthetic: synthetic.uuid, combat: combat.id, sword: sword.id, heal: heal.id });
    const gl = document.createElement("canvas").getContext("webgl"); const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return { pcId: pc.id, syntheticUuid: synthetic.uuid, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable", foundry: game.version, system: game.system.version,
      rates: game.ak5e.getOperatorSkillState(pc).rates, nativeAttackTargets: attack.flags.dnd5e.targets, points: game.ak5e.getOperatorSkillState(pc).points };
  });
  await gm.waitForFunction(() => document.querySelectorAll(".ak5e-operator-skills").length >= 2);
  console.log("Native SP playable slice passed.");
  report.ownerControls = await gm.locator(".ak5e-operator-skills").count();
  await gm.evaluate(pcId => { void game.ak5e.openOperatorSkills(game.actors.get(pcId)); }, report.slice.pcId);
  const setup = gm.locator("dialog:has(.ak5e-operator-dialog)");
  await setup.waitFor(); await setup.locator('button[data-action="save"]').click(); await setup.waitFor({ state: "detached" });
  report.setup = await gm.evaluate(pcId => game.ak5e.getOperatorSkillState(game.actors.get(pcId)).points, report.slice.pcId);
  if (report.setup !== 5) throw new Error("Setup changed existing SP");
  const ownerOne = await join("SP Owner One"), ownerTwo = await join("SP Owner Two");
  const pcId = report.slice.pcId;
  report.twoOwners = await Promise.all([ownerOne, ownerTwo].map((page, index) => page.evaluate(async ({ pcId, index }) => {
    const actor = game.actors.get(pcId);
    return game.ak5e.recordSkillPointEvent(actor, { type: "defensiveAttack", id: `owner-confirm-${index}`, hostile: true });
  }, { pcId, index })));
  await gm.waitForFunction(pcId => game.ak5e.getOperatorSkillState(game.actors.get(pcId)).points === 9, pcId);
  await ownerTwo.context().close();
  report.playerApplication = await ownerOne.evaluate(async pcId => {
    const actor = game.actors.get(pcId), refs = actor.getFlag("ak5e", "spLiveRefs"), ally = await fromUuid(refs.ally);
    const healingMessage = game.messages.filter(message => message.flags.dnd5e?.item?.id === refs.heal).at(-1);
    await ally.applyDamage([{ value: 2, type: "healing" }], { originatingMessage: healingMessage });
    for (let i = 0; i < 100 && game.ak5e.getOperatorSkillState(actor).points !== 11; i++) await new Promise(resolve => setTimeout(resolve, 30));
    if (game.ak5e.getOperatorSkillState(actor).points !== 11) throw new Error("Player HP application did not charge through the GM");
    return { points: 11, restored: 2 };
  }, pcId);
  const secondGM = await join("SP Second GM");
  report.gmElection = await secondGM.evaluate(async pcId => {
    const { submitOperatorCommand } = await import("/modules/ak5e/scripts/operator-skills.mjs");
    await submitOperatorCommand(game.actors.get(pcId), "event", { event: { type: "defensiveAttack", id: "two-gms-repeat", hostile: true } }, "same-request");
    await submitOperatorCommand(game.actors.get(pcId), "event", { event: { type: "defensiveAttack", id: "two-gms-repeat", hostile: true } }, "same-request");
    return game.users.activeGM.id;
  }, pcId);
  await gm.waitForFunction(pcId => game.ak5e.getOperatorSkillState(game.actors.get(pcId)).points === 13, pcId);
  await secondGM.context().close();
  const observer = await join("SP Observer");
  report.unauthorized = await observer.evaluate(async pcId => {
    try { await game.ak5e.endOperatorSkill(game.actors.get(pcId)); return false; } catch { return true; }
  }, pcId);
  if (!report.unauthorized) throw new Error("Unauthorized observer request succeeded");
  await observer.context().close();
  report.lifecycle = await gm.evaluate(async pcId => {
    const assert = (value, label) => { if (!value) throw new Error(label); };
    const actor = game.actors.get(pcId), refs = actor.getFlag("ak5e", "spLiveRefs"), combat = game.combats.get(refs.combat);
    const hidden = actor.items.find(item => item.name === "Hidden Might");
    await game.ak5e.activateOperatorSkill(actor, { itemId: hidden.id, confirmation: true, roll: false }); assert(game.ak5e.getOperatorSkillState(actor).points === 3, "Activation did not serialize");
    let locked = false; try { await game.ak5e.activateOperatorSkill(actor, { itemId: hidden.id, confirmation: true, roll: false }); } catch { locked = true; } assert(locked, "Active lock failed");
    await combat.nextTurn(); await combat.nextTurn();
    for (let i = 0; i < 100 && game.ak5e.getOperatorSkillState(actor).points !== 7; i++) await new Promise(resolve => setTimeout(resolve, 30));
    assert(game.ak5e.getOperatorSkillState(actor).active === null && game.ak5e.getOperatorSkillState(actor).points === 7, "Round expiration before charging");
    await combat.previousTurn(); await combat.nextTurn(); await new Promise(resolve => setTimeout(resolve, 100));
    assert(game.ak5e.getOperatorSkillState(actor).points === 7, "Rewind charged twice");
    const synth = await fromUuid(refs.synthetic);
    assert(game.ak5e.getOperatorSkillState(synth).points === 0, "Synthetic Actor inherited base-Actor SP changes");
    await game.ak5e.recordSkillPointEvent(synth, { type: "defensiveAttack", id: "synthetic", hostile: true });
    assert(game.ak5e.getOperatorSkillState(synth).points === 2, "Synthetic Actor failed");
    await game.ak5e.recoverOperatorSkills(actor); assert(game.ak5e.getOperatorSkillState(actor).points === 15, "Start SP recovery");
    return { points: game.ak5e.getOperatorSkillState(actor).points, synthetic: game.ak5e.getOperatorSkillState(synth).points, receipts: game.ak5e.getOperatorSkillState(actor).receipts.length };
  }, pcId);
  await gm.evaluate(pcId => game.ak5e.activateOperatorSkill(game.actors.get(pcId), { id: "rest-test", name: "Rest test", cost: 5, duration: "Until Long Rest" }), pcId);
  report.playerLongRest = await ownerOne.evaluate(async pcId => {
    const actor = game.actors.get(pcId);
    const result = await actor.longRest({ dialog: false, chat: false, request: true, advanceTime: false, advanceBastionTurn: false });
    if (!result?.longRest) throw new Error("Native player Long Rest did not complete");
    for (let i = 0; i < 100 && (game.ak5e.getOperatorSkillState(actor).active || game.ak5e.getOperatorSkillState(actor).points !== 15); i++) await new Promise(resolve => setTimeout(resolve, 30));
    const state = game.ak5e.getOperatorSkillState(actor);
    if (state.active || state.points !== 15) throw new Error("Completed Long Rest did not end the Skill and recover SP");
    return { points: state.points, active: state.active };
  }, pcId);
  for (const page of [ownerOne, ownerTwo, secondGM, observer]) await page.context().close();
  report.catalogue = await gm.evaluate(async () => {
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const { operatorSkillItemData } = await import("/modules/ak5e/scripts/operator-skills.mjs");
    const entries = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill);
    const existing = new Set(game.items.map(item => item.getFlag("ak5e", "chapterThreeId")));
    const created = await Item.implementation.createDocuments(entries.filter(entry => !existing.has(entry.id)).map(operatorSkillItemData));
    const skills = game.items.filter(item => item.getFlag("ak5e", "operatorSkill"));
    if (skills.length !== 320 || skills.some(item => item.invalid || !item.system.activities.get("ak5eSkillUse0001") || item.system.activities.size < 2)) throw new Error("Skill catalogue failed native validation");
    return { created: created.length, valid: skills.length };
  });
  await gm.reload(); await gm.waitForFunction(() => game.ready && game.ak5e);
  report.persistence = await gm.evaluate(pcId => game.ak5e.getOperatorSkillState(game.actors.get(pcId)).points, pcId);
  if (report.persistence !== 15) throw new Error("SP did not persist after reload");
  report.errors = errors;
  await writeFile("/tmp/ak5e-sp-live-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) throw new Error("SP browser errors occurred");
} catch (error) {
  report.failure = error.message; report.errors = errors;
  await writeFile("/tmp/ak5e-sp-live-report.json", JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  throw error;
} finally { await browser.close(); }
