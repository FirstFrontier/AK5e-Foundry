import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { guardianTable } from "../scripts/defender-rules.mjs";
import { registerDefenderHooks } from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { registerGuardianHooks, previewGuardianArts, applyGuardianArts, pendingNotToday, bestMedicineActive, bestMedicinePrompt, notTodayConsumption } from "../scripts/guardian-features.mjs";
import { quoteArt } from "../scripts/arts-rules.mjs";

const hooks = {}, rolls = [];
const BEST = "subclass-feature-defender-guardian-15th-level-the-best-medicine-3344";
function boot({ combat = null, gm = false, mappings = {} } = {}) {
  const documents = world(combat);
  for (const key of Object.keys(hooks)) delete hooks[key];
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); }, off() {} };
  game.user.isGM = gm; game.user.name = "Player"; game.users = [{ id: "gm", isGM: true }];
  game.settings = { get: (_m, key) => key === "casterArtMappings" ? mappings : false };
  globalThis.foundry.utils.flattenObject = object => {
    const out = {};
    const walk = (value, prefix) => { if (value && typeof value === "object" && !Array.isArray(value)) for (const [k, v] of Object.entries(value)) walk(v, prefix ? `${prefix}.${k}` : k); else out[prefix] = value; };
    walk(object, ""); return out;
  };
  globalThis.foundry.utils.hasProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object) !== undefined
    || Object.keys(object ?? {}).some(key => key === path);
  globalThis.foundry.utils.randomID = () => Math.random().toString(36).slice(2, 10);
  globalThis.Roll = class { constructor(formula) { this.formula = formula; rolls.push(formula); } async evaluate() { this.total = 3 * Number(this.formula.split("d")[0]); return this; } async toMessage() {} };
  rolls.length = 0;
  registerDefenderHooks(); registerGuardianHooks();
  return documents;
}
function guardian({ level = 15, res = 8, prof = 5 } = {}) {
  const actor = setup(fixture({ level, res, branch: "guardian" }));
  actor.system.attributes.prof = prof;
  actor.testUserPermission = () => true;
  actor.createEmbeddedDocuments = async (type, data) => {
    if (type === "Item") { const created = data.map((entry, i) => ({ ...structuredClone(entry), id: `it${actor.items.size + i}`, getFlag(s, k) { return this.flags?.[s]?.[k]; } })); created.forEach(item => actor.items.set(item.id, item)); return created; }
    const created = data.map((entry, i) => ({ ...structuredClone(entry), id: `fx${actor.effects.size + i}`, parent: actor, getFlag(s, k) { return this.flags?.[s]?.[k]; },
      async delete() { actor.effects.delete(this.id); }, async update(changes) { for (const [k, v] of Object.entries(changes)) { const parts = k.split("."), last = parts.pop(); let t = this; for (const p of parts) t = t[p] ??= {}; t[last] = structuredClone(v); } } }));
    created.forEach(effect => actor.effects.set(effect.id, effect)); return created;
  };
  actor.deleteEmbeddedDocuments = async (_type, ids) => { for (const id of ids) actor.effects.delete(id); };
  actor.items.set("best", { id: "best", type: "feat", name: "The Best Medicine", uuid: "Actor.def.Item.best", parent: actor, system: {}, flags: { ak5e: { chapterThreeId: BEST } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  return actor;
}
function creature(documents, id, { hp = 10, max = 30, temp = 0, owner = true, type = "humanoid" } = {}) {
  const doc = { id, uuid: `Actor.${id}`, documentName: "Actor", name: id, isOwner: owner, flags: { ak5e: {} }, effects: new Map(), items: new Map(),
    system: { attributes: { hp: { value: hp, max, temp } }, details: { type: { value: type } } }, getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) { const parts = path.split("."), last = parts.pop(); let t = this; for (const p of parts) t = t[p] ??= {}; t[last] = structuredClone(value); } return this; } };
  documents.set(doc.uuid, doc);
  return doc;
}
const use = (actor, command, data, id = Math.random().toString(36).slice(2, 10)) => defenderUses.command(actor, command, { confirmed: true, ...data }, id);
async function anyway(actor, command, data, id) {
  try { return await use(actor, command, data, id); } catch (error) { if (error.name !== "AK5eWarnings") throw error; return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id); }
}

test("Guardian Arts Casting table matches the printed rows", () => {
  assert.deepEqual([1, 3, 5, 9, 13, 15, 17, 19, 20].map(level => guardianTable(level)),
    [[1, 3], [1, 4], [2, 6], [3, 10], [4, 12], [4, 15], [5, 16], [5, 17], [5, 17]].map(([maximumArtLevel, maximum]) => ({ maximumArtLevel, maximum })));
});

test("Guardian Arts setup asks for the ability, sets AP and shields, grants Healing Arts of 5th level or less, and is idempotent", async () => {
  const cure = { id: "cure", uuid: "Item.cure", name: "Cure Wounds", type: "spell", system: { level: 1, method: "spell", prepared: 0, properties: ["vocal"], materials: {} }, flags: {},
    toObject() { return structuredClone({ _id: this.id, name: this.name, type: this.type, system: this.system, flags: {} }); } };
  const documents = boot({ mappings: { curewounds: { requestedName: "Cure Wounds", uuid: "Item.cure", source: "GM reviewed the SRD spell", mappedName: "Cure Wounds" } } });
  documents.set(cure.uuid, cure);
  const actor = guardian({ level: 9 });
  const pending = await previewGuardianArts(actor);
  assert.deepEqual(pending.pending, ["ability"]);
  const plan = await previewGuardianArts(actor, { ability: "wis" });
  assert.equal(plan.actor["flags.ak5e.artsPoints"].maximum, 10);
  assert.equal(plan.actor["flags.ak5e.artsPoints"].maximumArtLevel, 3);
  assert.equal(plan.actor["flags.ak5e.casting"].castingUnit, "shield");
  assert.deepEqual(plan.creates.map(data => data.name).sort(), ["Abjure", "Bolster", "Cure Wounds"]);
  assert.ok(plan.creates.every(data => data.system.prepared === 2));
  assert.equal(plan.missing.length, 13, "16 Healing Arts of 5th level or less; 13 still need a GM mapping");
  assert.ok(!plan.missing.some(entry => entry.name === "Mass Heal"), "6th-level and higher Arts are not granted");
  await assert.rejects(applyGuardianArts(actor, { ability: "wis", confirmed: true, contextKey: "stale" }), /changed since the preview/);
  const result = await applyGuardianArts(actor, { ability: "wis", confirmed: true, contextKey: plan.contextKey });
  assert.equal(result.granted.length, 3);
  assert.equal(actor.flags.ak5e.artsPoints.value, 10);
  assert.equal(actor.flags.ak5e.guardian.level, 9);
  const again = await previewGuardianArts(actor, { ability: "wis" });
  assert.equal(again.creates.length, 0, "known Healing Arts are never duplicated");
  actor.flags.ak5e.artsPoints.value = 4; actor.items.get("class").system.levels = 13;
  const levelled = await previewGuardianArts(actor);
  assert.equal(levelled.actor["flags.ak5e.artsPoints"].maximum, 12);
  assert.equal(levelled.actor["flags.ak5e.artsPoints"].value, 4, "a level-up preview never changes current AP");
});

test("Not Today discounts the next Art's AP to a minimum of 0", () => {
  const state = { enabled: true, configured: true, maximum: 10, value: 5, maximumArtLevel: 3, ninthLevelCast: false };
  globalThis.game = { settings: { get: () => false } };
  const quote = quoteArt(state, 2, 2, {}, { discount: 3, discountSource: "Not Today" });
  assert.equal(quote.cost, 0);
  assert.deepEqual(quote.modifiers.at(-1), { source: "Not Today", amount: -2 });
  assert.equal(quoteArt(state, 3, 3, {}, { discount: 1 }).cost, 2);
  assert.equal(quoteArt(state, 0, 0, {}, { discount: 2 }).cost, 0, "a Cantrip stays free");
});

test("Not Today is consumed by the next committed Art in AP, free, ritual, and Cantrip modes; undo does not reprice it", async () => {
  boot();
  const actor = guardian({ res: 4 });
  const grant = { free: { level: 1, maximum: 1, spent: 0 }, ritual: true };
  for (const [index, [label, castMode, level]] of [["ap", "ap", 1], ["free", "free", 1], ["ritual", "ritual", 1], ["cantrip", "ap", 0]].entries()) {
    const id = `nt-${label}`;
    await use(actor, "notToday", { amount: 1 }, id);
    const updates = {};
    notTodayConsumption({ actor }, {}, updates, { id: `cast-${label}` }, { mode: castMode });
    await actor.update(updates.actor);
    assert.equal(actor.flags.ak5e.defenderUses.data.notToday.consumedBy, `cast-${label}`);
    assert.equal(quoteArt({ enabled: true, configured: true, maximum: 10, value: 3, maximumArtLevel: 5, ninthLevelCast: false }, level, level, grant, { mode: castMode, discount: 1 }).cost, 0);
    if (index === 0) actor.flags.ak5e.artsPoints = { value: 3 };
    await use(actor, "undoUse", { useId: id }, `${id}-undo`);
    assert.equal(actor.flags.ak5e.artsPoints.value, 3, "undoing Not Today never changes the committed cast's AP");
    assert.match(game.messages.at(-1).content, /discounted Art was already cast; its Arts Points are not changed/);
  }
  await use(actor, "notToday", { amount: 1 }, "nt-cancelled");
  // A cancelled native activity never reaches dnd5e.activityConsumption, so its pending discount remains.
  assert.equal(pendingNotToday(actor).useId, "nt-cancelled");
  assert.equal(quoteArt({ enabled: true, configured: true, maximum: 10, value: 3, maximumArtLevel: 5, ninthLevelCast: false }, 0, 0, grant, { mode: "ap" }).cost, 0);
});

test("Not Today spends Resilience once per Turn, waits for the next Art, and undo restores it", async () => {
  const combat = { started: true, uuid: "Combat.c", round: 1, turn: 0, combatant: { id: "g", actor: { uuid: "Actor.def" } }, turns: [{ id: "g", actor: { uuid: "Actor.def" } }] };
  boot({ combat });
  const actor = guardian({ res: 3 });
  await use(actor, "notToday", { amount: 2 }, "nt1");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 1);
  assert.equal(pendingNotToday(actor).amount, 2);
  await assert.rejects(use(actor, "notToday", { amount: 2 }, "nt2"), error => ["turn", "pending", "resilience"].every(id => error.warnings.some(w => w.id === id)));
  await anyway(actor, "notToday", { amount: 2 }, "nt2");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 0, "a shortfall clamps at 0");
  assert.equal(pendingNotToday(actor).amount, 1, "the discount is the Resilience actually expended");
  assert.match(game.messages.at(-1).content, /Resilience short by 1/);
  await use(actor, "undoUse", { useId: "nt2" }, "undo-nt2");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 1);
  // Undo restores only what nt2 changed (shared changed-leaf undo): the discount it replaced is waiting again, because
  // nt1's Resilience is still spent. Undoing nt1 as well then leaves no discount and returns all the Resilience.
  assert.equal(pendingNotToday(actor).useId, "nt1");
  assert.equal(pendingNotToday(actor).amount, 2);
  await use(actor, "undoUse", { useId: "nt1" }, "undo-nt1");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 3);
  assert.equal(pendingNotToday(actor), null);
});

test("Anaesthesia rolls only on click, can expend Resilience for 4d6, and asks how Temporary HP combine", async () => {
  const documents = boot();
  const actor = guardian({ res: 2 }), ally = creature(documents, "ally", { temp: 5 });
  await assert.rejects(use(actor, "anaesthesia", { targetUuid: ally.uuid, enhanced: true, healedConfirmed: true }, "a1"), error => error.name === "AK5eReading" && error.key === "anaesthesiaTempHP");
  const pending = await use(actor, "anaesthesia", { targetUuid: ally.uuid, enhanced: true, healedConfirmed: true, reading: "additive" }, "a1");
  assert.equal(pending.awaitingRoll, true);
  assert.deepEqual(rolls, []);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 1);
  const rolled = await use(actor, "useRoll", { useId: "a1" }, "a1-roll");
  assert.equal(rolled.roll, 12);
  assert.equal(ally.system.attributes.hp.temp, 17);
  await use(actor, "undoUse", { useId: "a1" }, "a1-undo");
  assert.equal(ally.system.attributes.hp.temp, 5);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 2);
  await assert.rejects(use(actor, "anaesthesia", { targetUuid: ally.uuid, healedConfirmed: false, reading: "replace" }, "a2"), error => error.warnings.some(w => w.id === "healed"));
});

test("Aura of Mercy adds the Proficiency Bonus to an ally's healing once; the Guardian's own healing uses a reading", async () => {
  const documents = boot();
  const actor = guardian({ prof: 5 }), ally = creature(documents, "ally");
  await assert.rejects(use(actor, "auraOfMercy", { targetUuid: ally.uuid, healingId: "h1", healedConfirmed: true }, "m1"), error => ["ally", "range"].every(id => error.warnings.some(w => w.id === id)));
  await anyway(actor, "auraOfMercy", { targetUuid: ally.uuid, healingId: "h1", healedConfirmed: true, allyConfirmed: true }, "m1");
  assert.equal(ally.system.attributes.hp.value, 15);
  await assert.rejects(use(actor, "auraOfMercy", { targetUuid: ally.uuid, healingId: "h1", healedConfirmed: true, allyConfirmed: true, overrides: ["range"] }, "m2"), error => error.warnings.some(w => w.id === "repeat"));
  documents.set(actor.uuid, actor);
  await assert.rejects(use(actor, "auraOfMercy", { targetUuid: actor.uuid, healedConfirmed: true }, "m3"), error => error.name === "AK5eReading" && error.key === "auraIncludesSelf");
  await assert.rejects(use(actor, "auraOfMercy", { targetUuid: actor.uuid, healedConfirmed: true, reading: "no" }, "m3"), /does not include the Guardian/);
  await use(actor, "auraOfMercy", { targetUuid: actor.uuid, healedConfirmed: true, reading: "yes" }, "m4");
  assert.equal(actor.system.attributes.hp.value, 55);
  await use(actor, "undoUse", { useId: "m1" }, "m1-undo");
  assert.equal(ally.system.attributes.hp.value, 10);
});

test("The Best Medicine: once per Long Rest for one minute; each Melee Attack offers 2d6 healing rolled on click; Construct healing needs a public explicit override", async () => {
  const documents = boot();
  const actor = guardian(), ally = creature(documents, "ally"), drone = creature(documents, "drone", { type: "construct" });
  documents.set(actor.uuid, actor);
  await use(actor, "bestMedicine", {}, "b1");
  assert.equal(actor.flags.ak5e.resourcePools.bestMedicine.value, 0);
  assert.equal(bestMedicineActive(actor), true);
  const [effect] = [...actor.effects.values()];
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "time");
  await assert.rejects(use(actor, "bestMedicine", {}, "b2"), error => ["used", "active"].every(id => error.warnings.some(w => w.id === id)));
  await anyway(actor, "bestMedicineHeal", { targetUuid: ally.uuid, attackConfirmed: true, visible: true, attackId: "atk1" }, "h1");
  assert.deepEqual(rolls, []);
  await use(actor, "useRoll", { useId: "h1" }, "h1-roll");
  assert.equal(ally.system.attributes.hp.value, 16);
  await assert.rejects(use(actor, "bestMedicineHeal", { targetUuid: ally.uuid, attackConfirmed: true, visible: true, attackId: "atk1", overrides: ["range"] }, "h2"), error => error.warnings.some(w => w.id === "repeat"));
  await assert.rejects(use(actor, "bestMedicineHeal", { targetUuid: drone.uuid, attackConfirmed: true, visible: true, attackId: "atk2-no-override" }, "h3-no-override"), error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "construct"));
  assert.equal(defenderUses.receipt(actor, "h3-no-override"), null, "cancelling the warning leaves no healing receipt or resource change");
  await anyway(actor, "bestMedicineHeal", { targetUuid: drone.uuid, attackConfirmed: true, visible: true, attackId: "atk2-no-override" }, "h3-no-override");
  await use(actor, "useRoll", { useId: "h3-no-override" }, "h3-no-override-roll");
  assert.equal(drone.system.attributes.hp.value, 16, "Use anyway explicitly overrides the Construct warning even without the optional checkbox");
  assert.match(game.messages.find(message => message.flags.ak5e.defenderUsesUse?.useId === "h3-no-override")?.content ?? "", /Chapter 1 says Constructs cannot regain Hit Points/);
  await assert.rejects(use(actor, "bestMedicineHeal", { targetUuid: drone.uuid, constructOverride: true, attackConfirmed: true, visible: true, attackId: "atk2" }, "h3"), error => error.warnings.some(w => w.id === "construct"));
  await anyway(actor, "bestMedicineHeal", { targetUuid: drone.uuid, constructOverride: true, attackConfirmed: true, visible: true, attackId: "atk2" }, "h3");
  await use(actor, "useRoll", { useId: "h3" }, "h3-roll");
  assert.equal(drone.system.attributes.hp.value, 22, "Use anyway and the optional checkbox both explicitly allow the Construct healing");
  assert.match(game.messages.find(message => message.flags.ak5e.defenderUsesUse?.useId === "h3")?.content ?? game.messages.at(-2).content, /Used anyway:.*Chapter 1 says Constructs cannot regain Hit Points/);
  game.time.worldTime = 61;
  assert.equal(bestMedicineActive(actor), false);
  await assert.rejects(use(actor, "bestMedicineHeal", { targetUuid: ally.uuid, attackConfirmed: true, visible: true, attackId: "atk3" }, "h4"), error => error.warnings.some(w => w.id === "inactive"));
});

test("Aura of Mercy warns before Construct healing; Use anyway or the optional checkbox explicitly overrides", async () => {
  const documents = boot(), actor = guardian({ level: 12 }), drone = creature(documents, "aura-drone", { type: "construct" });
  documents.set(actor.uuid, actor);
  await assert.rejects(use(actor, "auraOfMercy", { targetUuid: drone.uuid, healedConfirmed: true, allyConfirmed: true }, "aura-construct-no-override"),
    error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "construct"));
  await anyway(actor, "auraOfMercy", { targetUuid: drone.uuid, healedConfirmed: true, allyConfirmed: true }, "aura-construct-no-override");
  assert.equal(drone.system.attributes.hp.value, 15, "Use anyway on the public Construct warning is an explicit table override");
  const warned = game.messages.find(message => message.flags.ak5e.defenderUsesUse?.useId === "aura-construct-no-override");
  assert.match(warned.content, /Used anyway:.*Chapter 1 says Constructs cannot regain Hit Points/);
  await anyway(actor, "auraOfMercy", { targetUuid: drone.uuid, healedConfirmed: true, allyConfirmed: true, constructOverride: true }, "aura-construct-override");
  assert.equal(drone.system.attributes.hp.value, 20);
  assert.match(game.messages.find(message => message.flags.ak5e.defenderUsesUse?.useId === "aura-construct-override").content, /explicit Construct healing override/);
});

test("current-window Guardian use receipts remain available beyond sixty uses", async () => {
  boot();
  const actor = guardian({ res: 8 });
  for (let index = 0; index < 65; index++) await anyway(actor, "notToday", { amount: 1 }, `many-${index}`);
  assert.ok(defenderUses.receipt(actor, "many-0"));
  assert.ok(defenderUses.receipt(actor, "many-64"));
});

test("an unowned Creature is changed through the GM relay; without a GM the use waits and can be retried", async () => {
  const documents = boot();
  const actor = guardian(), enemy = creature(documents, "enemy", { owner: false });
  await assert.rejects(anyway(actor, "auraOfMercy", { targetUuid: enemy.uuid, healedConfirmed: true, allyConfirmed: true }, "r1"), /Not applied yet: no GM is connected/);
  assert.equal(defenderUses.receipt(actor, "r1").status, "pending");
  assert.equal(enemy.system.attributes.hp.value, 10);
  game.user.isGM = true;
  await anyway(actor, "auraOfMercy", { targetUuid: enemy.uuid, healedConfirmed: true, allyConfirmed: true }, "r1");
  assert.equal(enemy.system.attributes.hp.value, 15);
});

test("prompts: a Melee Attack with The Best Medicine active and healing near a level 12 Guardian post whispered cards", async () => {
  const documents = boot();
  const actor = guardian(), ally = creature(documents, "ally");
  documents.set(actor.uuid, actor);
  const scene = { id: "s", grid: { size: 100, distance: 5, units: "ft", type: 0 }, tokens: [] };
  const token = (doc, x) => ({ documentName: "Token", uuid: `Scene.s.Token.${doc.id}`, parent: scene, actor: doc, x, y: 0, width: 1, height: 1, elevation: 0, getCenterPoint() { return { x: this.x + 50, y: 50 }; } });
  const own = token(actor, 0), near = token(ally, 100);
  scene.tokens.push(own, near);
  actor.getActiveTokens = () => [own]; ally.getActiveTokens = () => [near];
  await use(actor, "bestMedicine", {}, "bm");
  const before = game.messages.length;
  await bestMedicinePrompt({ attackId: "x", raw: { actor, subject: { attack: { type: { value: "ranged" } } } } });
  assert.equal(game.messages.length, before, "a ranged Attack does not qualify");
  await bestMedicinePrompt({ attackId: "x", raw: { actor, subject: { attack: { type: { value: "melee" } } } } });
  assert.equal(game.messages.at(-1).flags.ak5e.guardianPrompt.kind, "medicine");
  // Healing applied to the ally within 10 feet offers Aura of Mercy; the Aura's own Hit Points do not prompt again.
  for (const fn of hooks.preUpdateActor) fn(ally, { system: { attributes: { hp: { value: 18 } } } });
  ally.system.attributes.hp.value = 18;
  for (const fn of hooks.updateActor) await fn(ally, { system: { attributes: { hp: { value: 18 } } } }, {}, "player");
  assert.equal(game.messages.at(-1).flags.ak5e.guardianPrompt.kind, "aura");
  assert.equal(game.messages.at(-1).flags.ak5e.guardianPrompt.targetUuid, ally.uuid);
  const count = game.messages.length;
  for (const fn of hooks.preUpdateActor) fn(ally, { system: { attributes: { hp: { value: 23 } } } });
  ally.system.attributes.hp.value = 23;
  for (const fn of hooks.updateActor) await fn(ally, { system: { attributes: { hp: { value: 23 } } }, flags: { ak5e: { [defenderUses.appliedFlag]: { k: { tag: "aura" } } } } }, {}, "player");
  assert.equal(game.messages.length, count);
  for (const fn of hooks.preUpdateActor) fn(ally, { system: { attributes: { hp: { value: 30 } } } });
  ally.system.attributes.hp.value = 30;
  for (const fn of hooks.updateActor) await fn(ally, { system: { attributes: { hp: { value: 30 } } } }, { isRest: true }, "player");
  assert.equal(game.messages.length, count, "rest recovery does not prompt");
});

test("review fix: the GM-side relay refuses a recorded Defender change the use could not make", async () => {
  const documents = boot();
  const actor = guardian({ prof: 5 }), enemy = creature(documents, "enemy", { owner: false });
  game.user.isGM = true;
  actor.flags.ak5e.defenderUses = { undo: [
    { id: "forged", command: "auraOfMercy", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "heal", amount: 500, ready: true }] },
    { id: "plain", command: "auraOfMercy", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "heal", amount: 5, ready: true }] }], data: {} };
  await assert.rejects(defenderUses.relayedTargetChange(actor, "apply", { useId: "forged", targetUuid: enemy.uuid }), /not one this use can make/);
  await defenderUses.relayedTargetChange(actor, "apply", { useId: "plain", targetUuid: enemy.uuid });
  assert.equal(enemy.system.attributes.hp.value, 15);
});
