import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { munitionDie } from "../scripts/defender-rules.mjs";
import { registerDefenderHooks } from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { registerFortressHooks, loadedMunitions, entrenched, martialDC } from "../scripts/fortress-features.mjs";
import { getPool, recoverPool } from "../scripts/resource-pools.mjs";
import { onAk5eEvent, emitAk5eEvent, getReactions, refreshReactions, setReactionMax, spendReaction, grantExtraReaction } from "../scripts/trigger-events.mjs";

const hooks = {}, rolls = [];
const PLATFORM = "subclass-feature-defender-fortress-level-1-fire-support-platform-481", FIRE = "subclass-feature-defender-fortress-level-4-fire-for-effect-1457";
function boot({ combat = null } = {}) {
  const documents = world(combat);
  for (const key of Object.keys(hooks)) delete hooks[key];
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); }, off() {} };
  game.user.name = "Player"; game.users = [{ id: "gm", isGM: true }]; game.users.activeGM = game.users[0];
  game.i18n = { localize: key => key, format: key => key };
  globalThis.foundry.utils.randomID = () => Math.random().toString(36).slice(2, 10);
  globalThis.CONFIG = { statusEffects: ["ak5e-dazed", "ak5e-corroded", "ak5e-burning", "ak5e-bleeding"].map(id => ({ id, name: id, img: `${id}.svg` })),
    Dice: { DamageRoll: class { constructor(formula, _data, options) { this.formula = formula; this.options = options; rolls.push(formula); } async evaluate() { this.total = 2 * Number(this.formula.split("d")[0]); return this; } } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; rolls.push(formula); } async evaluate() { this.total = 1; return this; } async toMessage() {} };
  rolls.length = 0;
  registerDefenderHooks(); registerFortressHooks();
  return documents;
}
const get = function(s, k) { return this.flags?.[s]?.[k]; };
function fortress(documents, { level = 12, res = 6, prof = 4 } = {}) {
  const actor = setup(fixture({ level, res, branch: "fortress" }));
  actor.system.attributes.prof = prof; actor.system.abilities.dex = { value: 14, mod: 2 };
  actor.isOwner = true; actor.testUserPermission = () => true; actor.statuses = new Set();
  actor.createEmbeddedDocuments = async (_type, data) => data.map((entry, i) => {
    const doc = { ...structuredClone(entry), id: `fx${actor.effects.size + i}`, parent: actor, getFlag: get, async delete() { actor.effects.delete(this.id); },
      async update(changes) { for (const [k, v] of Object.entries(changes)) { const parts = k.split("."), last = parts.pop(); let t = this; for (const p of parts) t = t[p] ??= {}; t[last] = structuredClone(v); } } };
    actor.effects.set(doc.id, doc); return doc;
  });
  actor.deleteEmbeddedDocuments = async (_type, ids) => { for (const id of ids) actor.effects.delete(id); };
  for (const [id, chapterThreeId] of [["platform", PLATFORM], ["fire", FIRE]])
    actor.items.set(id, { id, type: "feat", name: id, uuid: `Actor.def.Item.${id}`, parent: actor, system: {}, flags: { ak5e: { chapterThreeId } }, getFlag: get });
  actor.items.set("gl", { id: "gl", type: "weapon", name: "Grenade Launcher", parent: actor, flags: { ak5e: { chapterFourId: "weapon-grenade-launcher-12" } }, getFlag: get,
    system: { equipped: true, ability: "dex", damage: { base: { number: 1, denomination: 8, types: ["thunder", "thunder", "fire"] } } } });
  actor.items.set("sword", { id: "sword", type: "weapon", name: "Sword", parent: actor, flags: { ak5e: {} }, getFlag: get, system: { equipped: true, damage: { base: { number: 1, denomination: 6, types: ["slashing"] } } } });
  documents.set(actor.uuid, actor);
  return actor;
}
function creature(documents, id, { owner = true } = {}) {
  const doc = { id, uuid: `Actor.${id}`, documentName: "Actor", type: "npc", name: id, get isOwner() { return Boolean(game.user?.isGM || owner); }, flags: { ak5e: {} }, effects: new Map(), items: new Map(),
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 20, max: 20 } } }, getFlag: get,
    async update() { return this; },
    async createEmbeddedDocuments(_type, data) { return data.map((entry, i) => { const e = { ...structuredClone(entry), id: `e${this.effects.size + i}`, parent: doc, getFlag: get, async delete() { doc.effects.delete(this.id); },
      async update(changes) { for (const [k, v] of Object.entries(changes)) { const parts = k.split("."), last = parts.pop(); let t = this; for (const p of parts) t = t[p] ??= {}; t[last] = structuredClone(v); } } }; doc.effects.set(e.id, e); return e; }); },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) doc.effects.delete(id); } };
  documents.set(doc.uuid, doc);
  return doc;
}
const use = (actor, command, data = {}, id = Math.random().toString(36).slice(2, 10)) => defenderUses.command(actor, command, { confirmed: true, ...data }, id);
async function anyway(actor, command, data, id) {
  try { return await use(actor, command, data, id); } catch (error) { if (error.name !== "AK5eWarnings") throw error; return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id); }
}

test("Munitions Dice: five from level 4, d4/d6/d8 at 4/7/14; Martial DC uses the higher of STR and DEX", () => {
  const documents = boot();
  assert.deepEqual([4, 6, 7, 13, 14, 20].map(munitionDie), [4, 4, 6, 6, 8, 8]);
  assert.equal(getPool(fortress(documents, { level: 3 }), "munitionsDice").max, 0);
  assert.equal(getPool(fortress(documents, { level: 4 }), "munitionsDice").max, 5);
  assert.equal(martialDC(fortress(documents, { prof: 4 })), 16);
});

test("Entrench: Speed 0 that cannot be increased, −20 ft from 9th; off-turn is a warning; undo removes it", async () => {
  const documents = boot({ combat: { started: true, uuid: "Combat.c", round: 1, turn: 0, combatant: { id: "x", actor: { uuid: "Actor.other" } }, turns: [{ id: "f", actor: { uuid: "Actor.def" } }] } });
  const low = fortress(documents, { level: 5 });
  await assert.rejects(use(low, "entrench", {}, "e1"), error => error.warnings.some(w => w.id === "turn"));
  await anyway(low, "entrench", {}, "e1");
  const [effect] = [...low.effects.values()];
  assert.deepEqual(effect.changes[0], { key: "system.attributes.movement.walk", mode: 5, value: "0", priority: 50 });
  assert.equal(effect.flags.ak5e.temporaryTag.expiry.trigger, "turnStart");
  assert.equal(entrenched(low), true);
  await use(low, "undoUse", { useId: "e1" }, "u1");
  assert.equal(entrenched(low), false);
  const high = fortress(boot(), { level: 9 });
  await use(high, "entrench", {}, "e2");
  assert.deepEqual([...high.effects.values()][0].changes, [{ key: "system.attributes.movement.walk", mode: 2, value: "-20", priority: 50 }]);
});

test("loading: launcher, duplicates, the PB cap and dice are warnings; a Bonus Action spends Resilience; undo unloads", async () => {
  const documents = boot();
  const actor = fortress(documents, { prof: 2 });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "l1");
  assert.equal(getPool(actor, "munitionsDice").value, 4);
  await use(actor, "loadMunition", { weaponId: "gl", munition: "explosive", bonusAction: true }, "l2");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 5);
  assert.deepEqual(loadedMunitions(actor).gl, ["concussive", "explosive"]);
  await assert.rejects(use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "l3"), error => ["duplicate", "count"].every(id => error.warnings.some(w => w.id === id)));
  await assert.rejects(use(actor, "loadMunition", { weaponId: "sword", munition: "flare" }, "l4"), error => error.warnings.some(w => w.id === "launcher"));
  await use(actor, "undoUse", { useId: "l1" }, "u1");
  assert.deepEqual(loadedMunitions(actor).gl, ["explosive"]);
  assert.equal(getPool(actor, "munitionsDice").value, 4);
});

test("firing: weapon + Munition Damage rolled only from the card as typed rolls; Martial DC save; Danger Close and riders", async () => {
  const documents = boot();
  const actor = fortress(documents, { prof: 4 }), foe = creature(documents, "foe"), friend = creature(documents, "friend");
  await use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "l1");
  await use(actor, "loadMunition", { weaponId: "gl", munition: "explosive" }, "l2");
  const data = { weaponId: "gl", mode: "attack", explosiveType: "fire", pointConfirmed: true, dangerClose: [friend.uuid] };
  await assert.rejects(use(actor, "fireMunitions", data, "f1"), error => error.name === "AK5eWarnings" && error.warnings.some(w => w.id === "dangerClose"));
  await assert.rejects(use(actor, "fireMunitions", { ...data, overrides: ["dangerClose"] }, "f1"), error => error.name === "AK5eReading" && error.key === "munitionWeaponDamage");
  const fired = await use(actor, "fireMunitions", { ...data, overrides: ["dangerClose"], reading: "weaponPlusModifier" }, "f1");
  assert.equal(fired.formula, "1d8 + 2 + 1d6 + 2d6");
  assert.deepEqual(rolls, [], "nothing is rolled before the click");
  assert.match(game.messages.at(-1).content, /\[\[\/save ability=dex dc=16\]\]/);
  assert.match(game.messages.at(-1).content, /Danger Close: friend/);
  assert.deepEqual(loadedMunitions(actor).gl, []);
  await use(actor, "useRoll", { useId: "f1" }, "f1-roll");
  const damage = game.messages.find(message => message.rolls?.length);
  assert.deepEqual(damage.rolls.map(roll => roll.options.type), ["thunder", "thunder", "fire"]);
  assert.equal(damage.flags.dnd5e.roll.type, "damage");
  assert.equal(defenderUses.receipt(actor, "f1").status, "complete");
  await assert.rejects(use(actor, "munitionEffects", { fireId: "f1", targetUuid: friend.uuid, failedSave: true }, "r0"), error => error.warnings.some(w => w.id === "dangerClose"));
  await use(actor, "munitionEffects", { fireId: "f1", targetUuid: foe.uuid, failedSave: true }, "r1");
  const [rider] = [...foe.effects.values()];
  assert.deepEqual(rider.statuses, ["ak5e-dazed"]);
  assert.equal(rider.changes[0].mode, 1);
  assert.equal(rider.changes[0].value, "0.5");
  await assert.rejects(use(actor, "munitionEffects", { fireId: "f1", targetUuid: foe.uuid, failedSave: true }, "r2"), error => error.warnings.some(w => w.id === "repeat"));
  // Undo the volley: the Munitions are loaded again (the Damage message stays; it was applied natively).
  await use(actor, "undoUse", { useId: "f1" }, "u-f1");
  assert.deepEqual(loadedMunitions(actor).gl.sort(), ["concussive", "explosive"]);
});

test("all six Munitions retain their damage types and guided riders; turn effects have source-defined expiry", async () => {
  const combat = { started: true, uuid: "Combat.m", round: 1, turn: 0, combatant: { id: "d", actor: { uuid: "Actor.def" } },
    turns: [{ id: "d", actor: { uuid: "Actor.def" } }, { id: "f", actor: { uuid: "Actor.foe" } }] };
  const documents = boot({ combat });
  const actor = fortress(documents, { level: 14 }), cases = [
    ["concussive", "thunder", "ak5e-dazed", "target", "nextTurnEnd", true],
    ["corrosive", "acid", "ak5e-corroded", null, "manual", true],
    ["flare", "fire", null, "source", "nextTurnEnd", true],
    ["explosive", "acid", null, null, null, false],
    ["incendiary", "fire", "ak5e-burning", null, "manual", true],
    ["shrapnel", "slashing", "ak5e-bleeding", null, "manual", true]
  ];
  for (const [key, damageType, condition, expiryActor, trigger, hasRider] of cases) {
    const foe = creature(documents, `foe-${key}`);
    combat.turns.push({ id: foe.id, actor: { uuid: foe.uuid } });
    actor.flags.ak5e.resourcePools.munitionsDice = { value: 5 };
    await use(actor, "loadMunition", { weaponId: "gl", munition: key }, `all-load-${key}`);
    const fired = await use(actor, "fireMunitions", { weaponId: "gl", mode: "attack", explosiveType: "acid", pointConfirmed: true, reading: "weaponDice" }, `all-fire-${key}`);
    assert.deepEqual(defenderUses.receipt(actor, `all-fire-${key}`).damageParts.slice(1).map(part => part.type), [damageType], `${key} Damage type`);
    if (!hasRider) {
      await assert.rejects(use(actor, "munitionEffects", { fireId: fired.fireId, targetUuid: foe.uuid, failedSave: true }, `all-effect-${key}`), /no additional effects/i);
      continue;
    }
    await use(actor, "munitionEffects", { fireId: fired.fireId, targetUuid: foe.uuid, failedSave: true }, `all-effect-${key}`);
    const effect = [...foe.effects.values()][0];
    if (condition) assert.deepEqual(effect.statuses, [condition], `${key} condition`);
    const tag = effect.flags.ak5e.temporaryTag;
    assert.equal(tag.instructions.includes("Advantage"), key === "flare");
    assert.equal(tag.expiry.trigger, trigger, `${key} expiry`);
    if (expiryActor) assert.equal(tag.expiry.actorUuid, expiryActor === "source" ? actor.uuid : foe.uuid);
    if (key === "corrosive") assert.match(tag.instructions, /uses an Action during its Turn to remove it/);
    if (key === "flare") assert.match(tag.instructions, /Attack Rolls against it are made at Advantage/);
  }
});

test("Stop their Advance is a level 12 Reaction for 1 Resilience; Explosive needs a Damage type", async () => {
  const documents = boot();
  const actor = fortress(documents, { level: 10, res: 0 });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "explosive" }, "l1");
  await assert.rejects(use(actor, "fireMunitions", { weaponId: "gl", mode: "stopTheirAdvance", pointConfirmed: true, reading: "weaponDice" }, "s1"), /Choose Acid, Fire or Thunder/);
  await assert.rejects(use(actor, "fireMunitions", { weaponId: "gl", mode: "stopTheirAdvance", explosiveType: "acid", pointConfirmed: true, reading: "weaponDice" }, "s1"),
    error => ["level", "resilience"].every(id => error.warnings.some(w => w.id === id)));
});

test("Stop their Advance spends one Reaction and Resilience, retries once, and undo restores both before refresh", async () => {
  const documents = boot();
  const actor = fortress(documents, { res: 3 });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "stop-load-1");
  const data = { weaponId: "gl", mode: "stopTheirAdvance", triggerId: "move-1", triggerConfirmed: true, pointConfirmed: true, reading: "weaponDice" };
  await use(actor, "fireMunitions", data, "stop-1");
  assert.equal(getReactions(actor).spent, 1);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 2);
  assert.equal(defenderUses.receipt(actor, "stop-1").reaction.spent, true);
  await use(actor, "fireMunitions", data, "stop-1");
  assert.equal(getReactions(actor).spent, 1, "retrying the completed operation cannot spend a second Reaction");
  assert.match(defenderUses.previewUndo(actor, "stop-1").lines.join(" "), /Restores the Reaction/);
  await use(actor, "undoUse", { useId: "stop-1" }, "stop-undo-1");
  assert.equal(getReactions(actor).available, 1);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 3);
  assert.deepEqual(loadedMunitions(actor).gl, ["concussive"]);
});

test("Stop their Advance warns on trigger and exhausted Reaction; Use anyway cannot overspend Reaction and undo handles late refresh", async () => {
  const documents = boot();
  const actor = fortress(documents, { res: 3 });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "stop-load-a");
  const first = { weaponId: "gl", mode: "stopTheirAdvance", triggerId: "move-a", triggerConfirmed: true, pointConfirmed: true, reading: "weaponDice" };
  await use(actor, "fireMunitions", first, "stop-a");
  await use(actor, "loadMunition", { weaponId: "gl", munition: "flare" }, "stop-load-b");
  const second = { ...first, triggerId: "move-b", triggerConfirmed: false };
  await assert.rejects(use(actor, "fireMunitions", second, "stop-b"), error => ["trigger", "reaction"].every(id => error.warnings.some(w => w.id === id)));
  await anyway(actor, "fireMunitions", second, "stop-b");
  assert.equal(defenderUses.receipt(actor, "stop-b").reaction.spent, false);
  assert.equal(getReactions(actor).spent, 1);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 1, "Resilience is spent once for the use, while the unavailable Reaction clamps at zero");
  await use(actor, "undoUse", { useId: "stop-b" }, "stop-undo-b");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 2);
  await refreshReactions(actor);
  await use(actor, "undoUse", { useId: "stop-a" }, "stop-undo-a");
  assert.equal(getReactions(actor).available, 1, "a Reaction already refreshed at Turn start remains available after late undo");
  assert.match(game.messages.at(-1).content, /already refreshed at a Turn start/);
});

test("Stop their Advance partial save failure retries with the same Reaction receipt", async () => {
  const documents = boot();
  const actor = fortress(documents, { res: 3 });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "stop-load-retry");
  const update = actor.update.bind(actor);
  let failReceiptWrite = true;
  actor.update = async changes => {
    if (failReceiptWrite && Object.hasOwn(changes, "flags.ak5e.defenderUses")) { failReceiptWrite = false; throw new Error("simulated receipt write failure"); }
    return update(changes);
  };
  const data = { weaponId: "gl", mode: "stopTheirAdvance", triggerId: "move-retry", triggerConfirmed: true, pointConfirmed: true, reading: "weaponDice" };
  await assert.rejects(use(actor, "fireMunitions", data, "stop-retry"), /simulated receipt write failure/);
  assert.equal(getReactions(actor).spent, 1, "the Reaction spend is durable even if the play receipt write fails");
  await use(actor, "fireMunitions", data, "stop-retry");
  assert.equal(getReactions(actor).spent, 1);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 2);
});

test("Stop their Advance warns but lets the player continue when this trigger already used a Reaction", async () => {
  const documents = boot();
  const actor = fortress(documents, { res: 3 });
  await setReactionMax(actor, 2);
  await spendReaction(actor, { triggerId: "move-same", receipt: "prior-reaction" });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "concussive" }, "same-trigger-load");
  const data = { weaponId: "gl", mode: "stopTheirAdvance", triggerId: "move-same", triggerConfirmed: true, pointConfirmed: true, reading: "weaponDice" };
  await assert.rejects(use(actor, "fireMunitions", data, "same-trigger-fire"), error => error.warnings.some(warning => warning.id === "triggerUsed"));
  await anyway(actor, "fireMunitions", data, "same-trigger-fire");
  assert.equal(defenderUses.receipt(actor, "same-trigger-fire").reaction.spent, false);
  assert.equal(getReactions(actor).available, 1, "Use anyway does not spend another Reaction for the same trigger");
  await use(actor, "undoUse", { useId: "same-trigger-fire" }, "same-trigger-undo");
  assert.equal(getReactions(actor).available, 1);
});

test("Long Rest restores Fortress Munitions Dice to five", async () => {
  const documents = boot();
  const actor = fortress(documents, { level: 14 });
  actor.flags.ak5e.resourcePools.munitionsDice = { value: 1 };
  await recoverPool(actor, "lr", { poolIds: ["munitionsDice"] });
  assert.equal(getPool(actor, "munitionsDice").value, 5);
});

test("a malformed launcher cannot consume Stop their Advance's Reaction or resources", async () => {
  const actor = fortress(boot(), { res: 3 });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "flare" }, "bad-weapon-load");
  actor.items.get("gl").system.damage.base = {};
  await assert.rejects(use(actor, "fireMunitions", { weaponId: "gl", mode: "stopTheirAdvance", triggerId: "bad-weapon-move",
    triggerConfirmed: true, pointConfirmed: true, reading: "weaponDice" }, "bad-weapon-fire"), /no reviewed Damage dice/);
  assert.equal(getReactions(actor).spent, 0);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 3);
  assert.deepEqual(loadedMunitions(actor).gl, ["flare"]);
  assert.equal(defenderUses.receipt(actor, "bad-weapon-fire"), null);
});

test("restricted extra Reactions warn before Stop their Advance and never masquerade as an override", async () => {
  const actor = fortress(boot(), { res: 3 });
  await setReactionMax(actor, 0);
  await grantExtraReaction(actor, { id: "opportunity-only", count: 1, restrictedTo: ["opportunityAttack"], atTurnStart: "keep" });
  await use(actor, "loadMunition", { weaponId: "gl", munition: "flare" }, "restricted-load");
  const data = { weaponId: "gl", mode: "stopTheirAdvance", triggerId: "restricted-move", triggerConfirmed: true, pointConfirmed: true, reading: "weaponDice" };
  await assert.rejects(use(actor, "fireMunitions", data, "restricted-fire"), error => error.warnings.some(warning => warning.id === "reaction"));
  assert.equal(defenderUses.receipt(actor, "restricted-fire"), null);
  await anyway(actor, "fireMunitions", data, "restricted-fire");
  const receipt = defenderUses.receipt(actor, "restricted-fire");
  assert.equal(receipt.reaction.spent, false);
  assert.ok(receipt.overridden.some(text => /eligible Reaction/.test(text)));
  assert.equal(getReactions(actor).available, 1, "the unrelated extra Reaction remains available for its own action");
});

test("old volley receipts retain loaded-Munition undo data after more than twenty uses in one window", async () => {
  const actor = fortress(boot());
  for (let index = 0; index < 21; index++) {
    await anyway(actor, "loadMunition", { weaponId: "gl", munition: "flare" }, `many-load-${index}`);
    await use(actor, "fireMunitions", { weaponId: "gl", pointConfirmed: true, reading: "weaponDice" }, `many-fire-${index}`);
  }
  assert.deepEqual(loadedMunitions(actor).gl, []);
  await use(actor, "undoUse", { useId: "many-fire-0" }, "many-old-fire-undo");
  assert.deepEqual(loadedMunitions(actor).gl, ["flare"]);
});

test("Fortification sets a no-Action Shelter while Entrenched; undo restores the previous Shelter", async () => {
  const documents = boot();
  const actor = fortress(documents);
  actor.flags.ak5e.defender.shelter = { active: true, allies: ["Scene.s.Token.old"], operationId: "older" };
  await assert.rejects(use(actor, "fortification", { allies: ["Scene.s.Token.a"], alliesConfirmed: true }, "fo1"), error => error.warnings.some(w => w.id === "entrenched"));
  await use(actor, "entrench", {}, "en");
  await use(actor, "fortification", { allies: ["Scene.s.Token.a"], alliesConfirmed: true }, "fo1");
  assert.equal(actor.flags.ak5e.defender.shelter.activation, "fortification");
  await use(actor, "undoUse", { useId: "fo1" }, "u-fo1");
  assert.equal(actor.flags.ak5e.defender.shelter.operationId, "older");
});

test("Creeping Barrage regains Munitions Dice up to two on initiative (undoable); unequipping a loaded launcher loses its Munitions", async () => {
  const documents = boot();
  const actor = fortress(documents, { level: 15, prof: 5 });
  actor.flags.ak5e.resourcePools.munitionsDice = { value: 0 };
  game.user.isGM = true; game.user.id = "gm"; game.users.activeGM = game.user;
  await emitAk5eEvent("initiative", { eventId: "initiative:1", actorUuid: actor.uuid });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(getPool(actor, "munitionsDice").value, 2);
  const receipt = defenderUses.uses(actor).find(entry => entry.command === "creepingBarrage");
  assert.match(defenderUses.previewUndo(actor, receipt.id).lines.join(" "), /Removes the 2 Munitions Dice it gave/);
  await use(actor, "undoUse", { useId: receipt.id }, "u-cb");
  assert.equal(getPool(actor, "munitionsDice").value, 0);
  actor.flags.ak5e.resourcePools.munitionsDice = { value: 3 };
  await use(actor, "loadMunition", { weaponId: "gl", munition: "flare" }, "lf");
  for (const fn of hooks.updateItem) fn(actor.items.get("gl"), { system: { equipped: false } }, {}, game.user.id);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(loadedMunitions(actor).gl, []);
  assert.match(game.messages.at(-1).content, /Munitions are lost/);
});

test("the GM-side relay applies only defined Munition riders to another player's Creature", async () => {
  const documents = boot();
  const actor = fortress(documents), enemy = creature(documents, "enemy", { owner: false });
  game.user.isGM = true; game.user.id = "gm"; game.users.activeGM = game.user;
  actor.flags.ak5e.defenderUses = { data: {}, undo: [
    { id: "bad", command: "munitionEffects", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "munitionEffects", munitions: ["nuclear"], ready: true }] },
    { id: "ok", command: "munitionEffects", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "munitionEffects", munitions: ["shrapnel"], ready: true }] },
    { id: "move", command: "entrench", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "effect", featureId: PLATFORM, tag: { label: "x", changes: [] }, ready: true }] }] };
  await assert.rejects(defenderUses.relayedTargetChange(actor, "apply", { useId: "bad", targetUuid: enemy.uuid }), /not one this use can make/);
  await assert.rejects(defenderUses.relayedTargetChange(actor, "apply", { useId: "move", targetUuid: enemy.uuid }), /not one this use can make/);
  await defenderUses.relayedTargetChange(actor, "apply", { useId: "ok", targetUuid: enemy.uuid });
  assert.deepEqual([...enemy.effects.values()][0].statuses, ["ak5e-bleeding"]);
});
