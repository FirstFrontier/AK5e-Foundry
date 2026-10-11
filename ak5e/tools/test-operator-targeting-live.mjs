/** Disposable World only: full GM/player canvases, never a user's campaign. */
import { writeFile } from "node:fs/promises";
import { launchTestBrowser } from "./test-browser.mjs";
const { chromium } = await import(process.env.AK5E_PLAYWRIGHT ?? "playwright");
const browser = await launchTestBrowser(chromium);
const report = { errors: [] };
async function join(name) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
  page.on("console", message => { if (message.text().startsWith("Targeting live:")) console.log(message.text()); });
  await page.goto("http://127.0.0.1:30133/join");
  await page.selectOption('select[name="userid"]', { label: name }); await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready && game.ak5e, null, { timeout: 45000 });
  if (await page.evaluate(() => game.world.id) !== "sp-test") throw new Error("Targeting tests require the disposable sp-test World.");
  return page;
}
try {
  const gm = await join("Gamemaster");
  report.fixture = await gm.evaluate(async () => {
    const { operatorSkillItemData, submitOperatorCommand } = await import("/modules/ak5e/scripts/operator-skills.mjs");
    const { CHAPTER_THREE_CLASSES } = await import("/modules/ak5e/scripts/chapter-three-content.mjs");
    const owner = game.users.getName("SP Owner One") ?? await User.implementation.create({ name: "SP Owner One", role: 1, password: "" });
    for (const combat of [...game.combats]) await combat.delete();
    const source = await Actor.implementation.create({ name: "Targeting test source", type: "character", ownership: { [owner.id]: 3 },
      system: { attributes: { hp: { value: 30, max: 30 }, spellcasting: "wis", movement: { walk: 60 } }, abilities: { wis: { value: 16 }, str: { value: 16 } } }, flags: { ak5e: { targetingLiveTest: true } } });
    const npc = await Actor.implementation.create({ name: "Unowned enemy", type: "npc", system: { attributes: { hp: { value: 30, max: 30 } } } });
    const names = ["Grand Cross", "Cluster Bombs", "Armourburner", "Line Breaker", "Thousand Cuts", "Holding Shadow", "Blood Boil", "Levitate", "Stormbolt", "Echoes of Life", "Harpoon Shot", "Volcanian", "Frost Claw"];
    const items = await source.createEmbeddedDocuments("Item", names.map(name => operatorSkillItemData(CHAPTER_THREE_CLASSES.find(entry => entry.operatorSkill && entry.name === name))));
    await submitOperatorCommand(source, "enable"); await submitOperatorCommand(source, "adjust", { amount: 100, reason: "Disposable test" });
    const scene = await Scene.implementation.create({ name: "Targeting verification", width: 2000, height: 1800, padding: 0,
      tokenVision: false, fog: { exploration: false }, ownership: { default: 2 }, grid: { type: 1, size: 100, distance: 5, units: "ft" },
      tokens: [{ name: "Caster", actorId: source.id, actorLink: true, x: 500, y: 500, disposition: 1 },
        { name: "Enemy A", actorId: npc.id, actorLink: false, x: 600, y: 500, disposition: -1 },
        { name: "Enemy B", actorId: npc.id, actorLink: false, x: 500, y: 800, disposition: -1 },
        { name: "Enemy off cross", actorId: npc.id, actorLink: false, x: 800, y: 800, disposition: -1 },
        { name: "Hidden enemy", actorId: npc.id, actorLink: false, x: 400, y: 500, disposition: -1, hidden: true },
        { name: "Large enemy", actorId: npc.id, actorLink: false, x: 900, y: 400, width: 2, height: 2, disposition: -1 }] });
    await scene.activate(); await scene.view();
    await owner.update({ character: source.id });
    const gl = canvas.app.renderer.gl, extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { actorId: source.id, sceneId: scene.id, items: Object.fromEntries(items.map(item => [item.name, item.id])),
      tokens: Object.fromEntries(scene.tokens.map(token => [token.name, token.uuid])), renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  console.log("Created targeting fixture");
  const player = await join("SP Owner One");
  await player.waitForFunction(id => globalThis.canvas?.ready && canvas.scene.id === id, report.fixture.sceneId);
  // Player selects an unowned enemy with the real registered Ctrl+T action.
  await player.evaluate(uuid => {
    canvas.tokens.activate(); canvas.tokens.releaseAll();
    const token = fromUuidSync(uuid).object; token._onHoverIn({});
  }, report.fixture.tokens["Enemy A"]);
  await player.keyboard.press("Control+t");
  report.keybinding = await player.evaluate(() => [...game.user.targets].map(token => token.name));
  if (!report.keybinding.includes("Enemy A")) throw new Error("Ctrl+T did not target an unowned enemy");
  await player.evaluate(uuid => {
    for (const token of canvas.tokens.placeables) if (token.hover) token._onHoverOut({});
    fromUuidSync(uuid).object._onHoverIn({});
  }, report.fixture.tokens["Enemy B"]);
  await player.keyboard.press("Control+Shift+t");
  if (await player.evaluate(() => game.user.targets.size) !== 2) throw new Error("Shift did not add a second target");
  console.log("Verified Ctrl+T and Ctrl+Shift+T");
  report.playerActivation = await player.evaluate(async fixture => {
    const actor = game.actors.get(fixture.actorId);
    const options = { itemId: fixture.items["Grand Cross"], sourceTokenUuid: fixture.tokens.Caster, confirmation: true, roll: false,
      activationId: "live-player-grand-cross", shapes: [{ type: "cross", x: 0, y: 0, direction: 0, distance: 99999 }] };
    const before = game.ak5e.getOperatorSkillState(actor).points;
    const [first, second] = await Promise.all([game.ak5e.activateOperatorSkill(actor, options), game.ak5e.activateOperatorSkill(actor, options)]);
    const state = game.ak5e.getOperatorSkillState(actor), cost = actor.items.get(options.itemId).flags.ak5e.operatorSkill.cost;
    if (state.points !== before - cost || first.activationId !== second.activationId) throw new Error("Concurrent retry spent SP twice");
    if (first.targetTokenUuids.includes(fixture.tokens["Hidden enemy"])) throw new Error("Hidden target leaked in response");
    if (JSON.stringify(state).includes(fixture.tokens["Hidden enemy"])) throw new Error("Hidden token leaked in Actor receipts");
    if (first.targetTokenUuids.includes(fixture.tokens["Enemy off cross"])) throw new Error("Cross included a diagonal victim");
    return { before, after: state.points, targets: first.targetTokenUuids, templates: canvas.scene.templates.filter(template => template.flags.ak5e?.skillActivation === first.activationId).length,
      privateMessageExposed: game.messages.some(message => message.flags.ak5e?.privateSkillSelection?.activationId === first.activationId && message.visible) };
  }, report.fixture);
  if (report.playerActivation.templates !== 2) throw new Error("Grand Cross did not create two rectangles");
  // Real local placement is canceled with Escape; no templates or SP may change.
  await player.evaluate(fixture => {
    const actor = game.actors.get(fixture.actorId);
    globalThis.cancelTestBefore = { points: game.ak5e.getOperatorSkillState(actor).points, templates: canvas.scene.templates.size };
    globalThis.cancelSkillPromise = game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items.Armourburner, sourceTokenUuid: fixture.tokens.Caster, confirmation: true, roll: false });
  }, report.fixture);
  await player.keyboard.press("Escape");
  report.cancel = await player.evaluate(async fixture => {
    if (await cancelSkillPromise !== false) throw new Error("Placement cancellation did not abort");
    const after = { points: game.ak5e.getOperatorSkillState(game.actors.get(fixture.actorId)).points, templates: canvas.scene.templates.size };
    if (JSON.stringify(after) !== JSON.stringify(cancelTestBefore)) throw new Error("Cancellation mutated SP or scene templates");
    return after;
  }, report.fixture);
  console.log("Verified concurrent activation and placement cancellation");
  report.phases = await gm.evaluate(async fixture => {
    const runtime = await import("/modules/ak5e/scripts/operator-skills.mjs"), targeting = await import("/modules/ak5e/scripts/operator-targeting.mjs");
    const actor = game.actors.get(fixture.actorId), scene = game.scenes.get(fixture.sceneId);
    const refill = async () => { await runtime.endIntegratedSkill(actor); await runtime.adjustOperatorSP(actor, 100, { reason: "Disposable test" }); };
    await refill();
    const source = fromUuidSync(fixture.tokens.Caster);
    const bombs = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Cluster Bombs"], sourceTokenUuid: source.uuid, confirmation: true, roll: false,
      shapes: [0, 40, 80].map(dx => ({ type: "circle", x: 650 + dx, y: 550, direction: 0 })) });
    if (new Set(bombs.targetTokenUuids).size !== bombs.targetTokenUuids.length) throw new Error("Overlapping bombs duplicated targets");
    await refill();
    const shadow = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Holding Shadow"], sourceTokenUuid: source.uuid, confirmation: true, roll: false,
      shapes: [{ type: "rect", x: 550, y: 550, direction: 0 }] });
    const combat = await Combat.implementation.create({ scene: scene.id, active: true });
    await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id, tokenId: source.id, sceneId: scene.id, initiative: 20 },
      { actorId: fromUuidSync(fixture.tokens["Enemy A"]).actorId, tokenId: fromUuidSync(fixture.tokens["Enemy A"]).id, sceneId: scene.id, initiative: 10 }]);
    await combat.startCombat(); await runtime.promptOperatorPhases(combat);
    const prompts = runtime.getIntegratedOperatorState(actor).phasePrompts;
    const prompt = prompts.find(prompt => prompt.activationId === shadow.activationId && prompt.phaseId === "delayed");
    if (!prompt) throw new Error("Instant delayed Skill did not retain its mandatory prompt");
    await game.ak5e.resolveOperatorSkillPhase(actor, { activationId: shadow.activationId, phaseId: "delayed", eventKey: prompt.key, roll: false, id: "shadow-delayed" });
    const receipt = runtime.getIntegratedOperatorState(actor).resolutions.find(receipt => receipt.activationId === shadow.activationId);
    await targeting.rollSkillPhase(actor, receipt, "delayed", [fixture.tokens["Enemy A"]], { configure: false });
    const damage = game.messages.contents.filter(message => message.flags.ak5e?.skillOrigin?.activationId === shadow.activationId && message.isRoll).at(-1);
    if (!damage || damage.flags.ak5e.skillOrigin.phaseId !== "delayed") throw new Error("Delayed damage lost activation provenance");
    await refill();
    const blood = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Blood Boil"], sourceTokenUuid: source.uuid, confirmation: true, roll: false,
      shapes: [{ type: "circle", x: 550, y: 550, direction: 0 }] });
    const enemy = fromUuidSync(fixture.tokens["Enemy A"]).actor;
    const message = await ChatMessage.implementation.create({ content: "Counter test", speaker: { actor: enemy.id, token: fromUuidSync(fixture.tokens["Enemy A"]).id, scene: scene.id }, flags: { dnd5e: { activity: { type: "save" } } } });
    await actor.applyDamage(7, { originatingMessage: message });
    await new Promise(resolve => setTimeout(resolve, 300));
    await runtime.endIntegratedSkill(actor);
    const ending = runtime.getIntegratedOperatorState(actor).phasePrompts.find(prompt => prompt.activationId === blood.activationId && prompt.phaseId === "ending");
    if (!ending) throw new Error("Blood Boil did not queue its ending detonation");
    const bloodReceipt = runtime.getIntegratedOperatorState(actor).resolutions.find(receipt => receipt.activationId === blood.activationId);
    if (bloodReceipt.bloodBoilDamage !== 7) throw new Error("Blood Boil damage counter is incorrect");
    const points = runtime.getIntegratedOperatorState(actor).points;
    await game.ak5e.resolveOperatorSkillPhase(actor, { activationId: blood.activationId, phaseId: "ending", eventKey: ending.key, roll: false });
    if (runtime.getIntegratedOperatorState(actor).points !== points) throw new Error("Ending phase spent activation SP again");
    await refill();
    const direct = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items.Stormbolt, sourceTokenUuid: source.uuid,
      targetTokenUuids: [fixture.tokens["Enemy A"]], confirmation: true, roll: false });
    const directReceipt = runtime.getIntegratedOperatorState(actor).resolutions.find(receipt => receipt.activationId === direct.activationId);
    const hp = fromUuidSync(fixture.tokens["Enemy A"]).actor.system.attributes.hp.value;
    const nativeSave = await targeting.rollSkillPhase(actor, directReceipt, "activation", direct.targetTokenUuids, { martialAbility: "str", configure: false });
    const expectedDC = 8 + actor.system.attributes.prof + actor.system.abilities.str.mod;
    if (nativeSave.dc !== expectedDC || fromUuidSync(fixture.tokens["Enemy A"]).actor.system.attributes.hp.value !== hp) throw new Error(`Native save DC or deferred HP application failed: ${nativeSave.dc}/${expectedDC}`);
    await refill();
    const heal = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Echoes of Life"], sourceTokenUuid: source.uuid,
      targetTokenUuids: [source.uuid], confirmation: true, roll: false });
    const healingReceipt = runtime.getIntegratedOperatorState(actor).resolutions.find(receipt => receipt.activationId === heal.activationId);
    await targeting.rollSkillPhase(actor, healingReceipt, "activation", [source.uuid], { configure: false });
    const healingMessages = game.messages.filter(message => message.isRoll && message.flags.ak5e?.skillOrigin?.activationId === heal.activationId);
    if (healingMessages.length !== 5) throw new Error("Echoes of Life did not offer five separate native healing rolls");
    await refill();
    const cone = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items.Armourburner, sourceTokenUuid: source.uuid,
      confirmation: true, roll: false, shapes: [{ type: "cone", x: 0, y: 0, direction: 0 }] });
    if (!cone.targetTokenUuids.includes(fixture.tokens["Enemy A"]) || cone.targetTokenUuids.includes(fixture.tokens["Enemy B"])) throw new Error("Cone eligibility failed");
    await refill();
    const line = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Line Breaker"], sourceTokenUuid: source.uuid,
      confirmation: true, roll: false, shapes: [{ type: "ray", x: 0, y: 0, direction: 0 }] });
    if (!line.targetTokenUuids.includes(fixture.tokens["Large enemy"])) throw new Error("Line missed an occupied cell of a large token");
    await refill();
    const aura = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Thousand Cuts"], sourceTokenUuid: source.uuid,
      confirmation: true, roll: false, shapes: [{ type: "circle", x: 0, y: 0, direction: 0 }] });
    if (!await source.move({ x: 1000, y: 1000, action: "displace" }, { constrainOptions: { ignoreCost: true }, animate: false })) throw new Error("Fixture token did not move");
    await runtime.promptOperatorPhases(combat, source, "aura-move-test");
    const moved = await game.ak5e.resolveOperatorSkillPhase(actor, { activationId: aura.activationId, phaseId: "activation", roll: false });
    if (moved.targetTokenUuids.includes(fixture.tokens["Enemy A"])) throw new Error(`Moving aura used its old position: ${JSON.stringify({ x: source.x, y: source.y, fresh: fromUuidSync(source.uuid).getCenterPoint(), shape: runtime.getIntegratedOperatorState(actor).resolutions.find(receipt => receipt.activationId === aura.activationId).shapes, moving: targeting.profileForSkill(actor.items.get(fixture.items["Thousand Cuts"])).phases[0].moving, moved })}`);
    await source.move({ x: 500, y: 500, action: "displace" }, { constrainOptions: { ignoreCost: true }, animate: false }); await refill();
    const volcanian = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items.Volcanian, sourceTokenUuid: source.uuid, confirmation: true, roll: false });
    const beforePulse = runtime.getIntegratedOperatorState(actor).points;
    const pulse = await game.ak5e.resolveOperatorSkillPhase(actor, { activationId: volcanian.activationId, phaseId: "subsequent", confirmation: true, roll: false,
      shapes: [{ type: "circle", x: 650, y: 550, direction: 0 }] });
    if (runtime.getIntegratedOperatorState(actor).points !== beforePulse || !pulse.targetTokenUuids.includes(fixture.tokens["Enemy A"])) throw new Error("Subsequent placed pulse eligibility or SP was incorrect");
    const pulseReceipt = runtime.getIntegratedOperatorState(actor).resolutions.find(receipt => receipt.activationId === volcanian.activationId);
    await targeting.rollSkillPhase(actor, pulseReceipt, "subsequent", [fixture.tokens["Enemy A"]], { martialAbility: "str", configure: false });
    if (!game.messages.some(message => message.isRoll && message.flags.ak5e?.skillOrigin?.activationId === volcanian.activationId && message.flags.ak5e?.skillOrigin?.phaseId === "subsequent")) throw new Error("Subsequent native pulse lost provenance");
    await refill();
    const frost = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Frost Claw"], sourceTokenUuid: source.uuid, confirmation: true, roll: false,
      shapes: [{ type: "ray", x: 0, y: 0, direction: 0 }] });
    return { bombs: bombs.targetTokenUuids.length, shadow: shadow.activationId, bloodDamage: bloodReceipt.bloodBoilDamage,
      nativeDC: nativeSave.dc, healingInstances: healingMessages.length, movingAura: true,
      subsequentPulse: true, frostActivationId: frost.activationId, receipts: runtime.getIntegratedOperatorState(actor).resolutions.length };
  }, report.fixture);
  console.log("Verified native rolls and delayed, ending, and moving phases");
  await player.evaluate(({ fixture, activationId }) => {
    const actor = game.actors.get(fixture.actorId);
    globalThis.phaseBefore = JSON.stringify(game.ak5e.getOperatorSkillState(actor));
    globalThis.cancelPhasePromise = game.ak5e.resolveOperatorSkillPhase(actor, { activationId, phaseId: "subsequent", confirmation: true, roll: false });
  }, { fixture: report.fixture, activationId: report.phases.frostActivationId });
  await player.keyboard.press("Escape");
  await player.evaluate(async fixture => {
    if (await cancelPhasePromise !== false || JSON.stringify(game.ak5e.getOperatorSkillState(game.actors.get(fixture.actorId))) !== phaseBefore) throw new Error("Canceled subsequent placement changed state");
  }, report.fixture);
  report.phases.subsequentCancellation = true;
  await gm.evaluate(id => game.ak5e.endOperatorSkill(game.actors.get(id)), report.fixture.actorId);
  await player.reload(); await player.waitForFunction(() => globalThis.game?.ready && game.ak5e);
  report.reload = await player.evaluate(id => game.ak5e.getOperatorSkillState(game.actors.get(id)).resolutions.length, report.fixture.actorId);
  console.log("Verified reload; checking inactive scenes, grids, walls and migration");
  report.gridsWallsMigration = await gm.evaluate(async fixture => {
    const runtime = await import("/modules/ak5e/scripts/operator-skills.mjs"), actor = game.actors.get(fixture.actorId);
    const npcId = fromUuidSync(fixture.tokens["Enemy A"]).actorId;
    const results = [];
    for (const type of [0, 4]) {
      console.log(`Targeting live: creating grid ${type}`);
      const scene = await Scene.implementation.create({ name: `Inactive grid ${type}`, width: 2000, height: 1800, padding: 0,
        grid: { type, size: 100, distance: 5, units: "ft" }, tokens: [
          { actorId: actor.id, actorLink: true, x: 500, y: 500 },
          { actorId: npcId, actorLink: true, x: 800, y: 600, width: 3, height: 3 }] });
      await runtime.adjustOperatorSP(actor, 100, { reason: "Disposable grid test" });
      const source = scene.tokens.find(token => token.actorId === actor.id), victim = scene.tokens.find(token => token.actorId === npcId);
      const result = await game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Grand Cross"], sourceTokenUuid: source.uuid,
        confirmation: true, roll: false, shapes: [{ type: "cross", x: 0, y: 0, direction: 0 }] });
      console.log(`Targeting live: resolved grid ${type}`);
      if (type === 0 && result.targetTokenUuids.includes(victim.uuid)) throw new Error("Gridless inclusion used footprint rather than token center");
      if (type === 4 && victim.getOccupiedGridSpaceOffsets().length <= 1) throw new Error("Native hex occupied-cell offsets were unavailable");
      results.push({ type, hit: result.targetTokenUuids.includes(victim.uuid), cells: victim.getOccupiedGridSpaceOffsets().length });
    }
    console.log("Targeting live: creating wall scene");
    const scene = await Scene.implementation.create({ name: "Inactive wall test", width: 2000, height: 1800, padding: 0,
      grid: { type: 1, size: 100, distance: 5, units: "ft" }, tokens: [{ actorId: actor.id, actorLink: true, x: 500, y: 500 }, { actorId: npcId, actorLink: true, x: 700, y: 500 }],
      walls: [{ c: [650, 0, 650, 1500], move: 20, sight: 20, door: 1, ds: 0 }] });
    const source = scene.tokens.find(token => token.actorId === actor.id), victim = scene.tokens.find(token => token.actorId === npcId);
    const activate = async () => {
      await runtime.adjustOperatorSP(actor, 100, { reason: "Disposable wall test" });
      return game.ak5e.activateOperatorSkill(actor, { itemId: fixture.items["Grand Cross"], sourceTokenUuid: source.uuid,
        confirmation: true, roll: false, shapes: [{ type: "cross", x: 0, y: 0, direction: 0 }] });
    };
    if ((await activate()).targetTokenUuids.includes(victim.uuid)) throw new Error("Closed wall did not block area");
    await scene.walls.contents[0].update({ ds: 1 });
    if (!(await activate()).targetTokenUuids.includes(victim.uuid)) throw new Error("Open door still blocked area");
    console.log("Targeting live: verified walls; editing activity");
    const item = actor.items.get(fixture.items["Holding Shadow"]), id = item.id;
    await item.update({ "system.activities.ak5ePhase0000000.damage.parts": [{ custom: { enabled: true, formula: "1d4" }, types: ["force"] }], "flags.ak5e.customCounter": 3 });
    const before = runtime.getIntegratedOperatorState(actor).points;
    const preview = await game.ak5e.previewOperatorSkillUpdate(actor);
    if (runtime.getIntegratedOperatorState(actor).points !== before) throw new Error("Migration preview changed SP");
    await game.ak5e.updateOperatorSkills(actor, { preview: false });
    console.log("Targeting live: applied managed update");
    if (item.id !== id || item.system.activities.get("ak5ePhase0000000").damage.parts[0].custom.formula !== "1d4" || item.flags.ak5e.customCounter !== 3
      || runtime.getIntegratedOperatorState(actor).points !== before) throw new Error("Managed update overwrote user state");
    return { grids: results, closedWall: true, openDoor: true, otherScene: canvas.scene.id !== scene.id, migration: preview.length };
  }, report.fixture);
  await writeFile("/tmp/ak5e-targeting-live-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) throw new Error(`Browser errors: ${report.errors.join("; ")}`);
} finally { await browser.close(); }
