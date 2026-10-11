import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { protectorDC } from "../scripts/defender-rules.mjs";
import { registerDefenderHooks, defenderCommand, shelterAppliesTo } from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { registerProtectorHooks, protectorAttackHook, improvedShelterSaveHook, activeMarks, PROTECTOR_FEATURES } from "../scripts/protector-features.mjs";
import { calculateDamageHook, applyDamageHook } from "../scripts/defender-damage-mods.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent, getReactions } from "../scripts/trigger-events.mjs";

const hooks = {}, rolls = [];
let booted = false;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function boot({ combat = null } = {}) {
  const documents = world(combat);
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); }, off() {} };
  game.user.name = "Player"; game.users = [{ id: "gm", isGM: true }]; game.users.activeGM = game.users[0];
  game.i18n = { localize: key => key, format: key => key };
  let n = 0; globalThis.foundry.utils.randomID = () => `id${++n}`;
  globalThis.foundry.utils.hasProperty = (object, path) => path.split(".").reduce((value, key) => value?.[key], object) !== undefined;
  globalThis.CONFIG = { statusEffects: [], Dice: { DamageRoll: class { constructor(formula, _data, options) { this.formula = formula; this.options = options; rolls.push(formula); } async evaluate() { this.total = 6; return this; } } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; rolls.push(formula); } async evaluate() { this.total = 1; return this; } async toMessage() {} };
  ChatMessage.implementation.getSpeakerActor = speaker => documents.get(speaker?.actor) ?? null;
  rolls.length = 0;
  if (!booted) { registerDefenderHooks(); registerProtectorHooks(); booted = true; }
  return documents;
}
const get = function(s, k) { return this.flags?.[s]?.[k]; };
function assign(target, changes) { for (const [k, v] of Object.entries(changes)) { const parts = k.split("."), last = parts.pop(); let t = target; for (const p of parts) t = t[p] ??= {}; t[last] = structuredClone(v); } }
function withEffects(doc) {
  doc.effects = new Map();
  doc.createEmbeddedDocuments = async (_type, data) => data.map((entry, i) => {
    const effect = { ...structuredClone(entry), id: `fx${doc.effects.size + i}`, parent: doc, getFlag: get, async delete() { doc.effects.delete(this.id); }, async update(changes) { assign(this, changes); return this; } };
    doc.effects.set(effect.id, effect); return effect;
  });
  doc.deleteEmbeddedDocuments = async (_type, ids) => { for (const id of ids) doc.effects.delete(id); };
  return doc;
}
function protector(documents, { level = 15, res = 6, bastion = true } = {}) {
  const actor = setup(fixture({ level, res, branch: "protector" }));
  withEffects(actor);
  actor.testUserPermission = () => true;
  for (const [id, chapterThreeId] of Object.entries(PROTECTOR_FEATURES))
    actor.items.set(id, { id, type: "feat", name: id, uuid: `Actor.def.Item.${id}`, parent: actor, system: {}, flags: { ak5e: { chapterThreeId } }, getFlag: get });
  actor.items.set("shield", { id: "shield", type: "equipment", name: bastion ? "Defender Shield" : "Combat Shield", parent: actor, getFlag: get,
    flags: { ak5e: { tableData: { category: bastion ? "Heavy Shields" : "Light Shields", special: bastion ? "Bastion, Stealth Disadvantage" : "-" } } }, system: { equipped: true, type: { value: "shield" } } });
  documents.set(actor.uuid, actor);
  return actor;
}
function creature(documents, id, { owner = true } = {}) {
  const doc = withEffects({ id, uuid: `Actor.${id}`, documentName: "Actor", type: "npc", name: id, get isOwner() { return Boolean(game.user?.isGM || owner); }, flags: { ak5e: {} }, items: new Map(),
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 20, max: 20 } } }, getFlag: get, getActiveTokens: () => [], async update(changes) { assign(this, changes); return this; } });
  documents.set(doc.uuid, doc);
  return doc;
}
const damage = (value, type = "slashing", active = {}) => Object.assign([{ type, value, active }], { amount: value, temp: 0, tempMax: 0 });
const fromCard = speaker => ({ originatingMessage: { speaker: { actor: speaker } } });
const use = (actor, command, data = {}, id = Math.random().toString(36).slice(2, 10)) => defenderUses.command(actor, command, { confirmed: true, ...data }, id);

test("Protector DC is 8 + CON + PB; Centre of Attention uses equal the Constitution Modifier (never below 0)", () => {
  const documents = boot();
  assert.equal(protectorDC(3, 4), 15);
  assert.equal(getPool(protector(documents), "centreOfAttention").max, 3);
  const frail = protector(documents); frail.system.abilities.con = { value: 8, mod: -1 };
  assert.equal(getPool(frail, "centreOfAttention").max, 0);
});

test("Centre of Attention posts a Wisdom save at the Protector DC; Taunt applies Taunted (and Punishment from 12th) to a failing Creature", async () => {
  const documents = boot({ combat: { started: true, uuid: "Combat.c", round: 1, turn: 0, combatant: { id: "p", actor: { uuid: "Actor.def" } },
    turns: [{ id: "p", actor: { uuid: "Actor.def" } }, { id: "f", actor: { uuid: "Actor.foe" } }] } });
  const actor = protector(documents), foe = creature(documents, "foe");
  await use(actor, "centreOfAttention", { targets: [], bonusAction: true }, "c1");
  assert.match(game.messages.at(-1).content, /\[\[\/save ability=wis dc=15\]\]/);
  assert.equal(getPool(actor, "centreOfAttention").value, 2);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 4);
  await use(actor, "taunt", { targetUuid: foe.uuid, failedSave: true }, "t1");
  const taunted = activeMarks(foe, "taunted", actor.uuid);
  assert.equal(taunted.length, 1);
  assert.equal(taunted[0].flags.ak5e.temporaryTag.expiry.trigger, "nextTurnEnd");
  assert.equal(taunted[0].flags.ak5e.temporaryTag.expiry.actorUuid, foe.uuid);
  assert.equal(activeMarks(foe, "punishment").length, 1);
  await assert.rejects(use(actor, "taunt", { targetUuid: foe.uuid, failedSave: true }, "t2"), error => error.warnings.some(w => w.id === "repeat"));
  await use(actor, "undoUse", { useId: "t1" }, "u1");
  assert.equal(foe.effects.size, 0);
  actor.flags.ak5e.resourcePools.centreOfAttention = { value: 0 };
  await assert.rejects(use(actor, "centreOfAttention", {}, "c2"), error => error.warnings.some(w => w.id === "uses"));
});

test("Off Balance gives Advantage; Punishment gives Disadvantage once and is used up; Taunt warns when attacking someone else", async () => {
  const documents = boot();
  const actor = protector(documents), foe = creature(documents, "foe"), other = creature(documents, "other");
  await use(actor, "stoneWall", { attackerUuid: foe.uuid, triggerId: "a1", hitConfirmed: true }, "s1");
  assert.match(game.messages.at(-1).content, /\[\[\/save ability=str dc=15\]\]/);
  assert.equal(getReactions(actor).spent, 1);
  await use(actor, "stoneWallFailed", { stoneWallUseId: "s1", targetUuid: foe.uuid, failedSave: true }, "s2");
  assert.deepEqual(rolls, [], "Stone Wall Damage waits for the click");
  assert.equal(activeMarks(foe, "offBalance").length, 1);
  game.user.targets = new Set([{ actor: foe, name: "foe" }]);
  const atFoe = { subject: { actor: other }, rolls: [{ options: {} }] };
  protectorAttackHook(atFoe);
  assert.equal(atFoe.rolls[0].options.advantage, true);
  // The foe is under Punishment (level 12+): Disadvantage on its next Attack Roll, then it is used up.
  let warned = null; ui.notifications.warn = text => { warned = text; };
  await use(actor, "taunt", { targetUuid: foe.uuid, failedSave: true }, "t1");
  game.user.targets = new Set([{ actor: other, name: "other" }]);
  const byFoe = { subject: { actor: foe }, rolls: [{ options: {} }] };
  protectorAttackHook(byFoe);
  assert.equal(byFoe.rolls[0].options.disadvantage, true);
  assert.match(warned, /must Attack/);
  await emitAk5eEvent("attack", { eventId: "attack:x", attackId: "x", actorUuid: foe.uuid, targets: [], raw: { actor: foe } });
  await tick();
  assert.equal(activeMarks(foe, "punishment").length, 0);
  const next = { subject: { actor: foe }, rolls: [{ options: {} }] };
  protectorAttackHook(next);
  assert.equal(next.rolls[0].options.disadvantage, undefined);
});

test("Improved Taunt and Greater Improved Shelter grant Resistance without stacking with existing Resistance; GIS is used up on apply", async () => {
  const documents = boot();
  const actor = protector(documents), foe = creature(documents, "foe"), ally = creature(documents, "ally");
  await use(actor, "taunt", { targetUuid: foe.uuid, failedSave: true }, "t1");
  const fromFoe = damage(9); calculateDamageHook(actor, fromFoe, fromCard(foe.uuid));
  assert.equal(fromFoe.amount, 4, "Resistance truncates as D&D5e does: 9 → 4");
  const resisted = damage(9, "slashing", { type: { resistance: true } }); resisted.amount = 4;
  calculateDamageHook(actor, resisted, fromCard(foe.uuid));
  assert.equal(resisted.amount, 4, "already Resistant: not halved again");
  await use(actor, "greaterImprovedShelter", { allies: [ally.uuid] }, "g1");
  assert.equal(activeMarks(ally, "gis").length, 1);
  const options = fromCard(foe.uuid);
  for (let i = 0; i < 2; i++) { const preview = damage(10); calculateDamageHook(ally, preview, options); assert.equal(preview.amount, 5); }
  const applied = damage(10); calculateDamageHook(ally, applied, options); await applyDamageHook(ally, applied.amount, options);
  assert.equal(activeMarks(ally, "gis").length, 0, "used up by the first instance");
  const second = damage(10); calculateDamageHook(ally, second, fromCard(foe.uuid));
  assert.equal(second.amount, 10);
});

test("Anchor Point: Shelter radius 10 ft with the Bulwark box; Improved Shelter preselects Advantage on STR and DEX saves", async () => {
  const documents = boot();
  const scene = { id: "s", uuid: "Scene.s", grid: { size: 100, distance: 5 }, tokens: new Map() };
  const actor = protector(documents), ally = creature(documents, "ally");
  const token = (id, actorDoc, x) => { const t = { id, uuid: `Scene.s.Token.${id}`, documentName: "Token", name: id, actor: actorDoc, x, y: 0, width: 1, height: 1, parent: scene }; scene.tokens.set(id, t); documents.set(t.uuid, t); return t; };
  const own = token("p", actor, 0), allyToken = token("a", ally, 200);
  actor.getActiveTokens = () => [own]; ally.getActiveTokens = () => [allyToken];
  globalThis.canvas = { scene };
  await defenderCommand(actor, "shelter", { activation: "action", allies: [allyToken.uuid], alliesConfirmed: true, anchorPoint: true }, "sh1");
  assert.equal(actor.flags.ak5e.defender.shelter.radius, 10);
  assert.equal(shelterAppliesTo(actor, allyToken.uuid), true, "10 feet away is inside the improved radius");
  const save = { subject: ally, ability: "dex", rolls: [{ options: {} }] };
  improvedShelterSaveHook(save);
  assert.equal(save.rolls[0].options.advantage, true);
  const wis = { subject: ally, ability: "wis", rolls: [{ options: {} }] };
  improvedShelterSaveHook(wis);
  assert.equal(wis.rolls[0].options.advantage, undefined);
  await defenderCommand(actor, "shelter", { activation: "action", allies: [allyToken.uuid], alliesConfirmed: true, anchorPoint: false }, "sh2");
  assert.equal(actor.flags.ak5e.defender.shelter.radius, 5);
  assert.equal(shelterAppliesTo(actor, allyToken.uuid), false);
  delete globalThis.canvas;
});

test("Impenetrable: reading for rounding, Reaction + 1 Resilience, Bulwark warning, refund; Unending Defence and Punishment on hits are automatic", async () => {
  const documents = boot();
  const actor = protector(documents, { bastion: false }), foe = creature(documents, "foe");
  await assert.rejects(use(actor, "impenetrable", { physicalReduction: 5, triggerId: "d1" }, "i1"), error => error.warnings.some(w => w.id === "bulwark"));
  await assert.rejects(use(actor, "impenetrable", { physicalReduction: 5, triggerId: "d1", overrides: ["bulwark"] }, "i1"), error => error.name === "AK5eReading");
  const result = await use(actor, "impenetrable", { physicalReduction: 5, triggerId: "d1", overrides: ["bulwark"], reading: "up" }, "i1");
  assert.equal(result.reduction, 3);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 5);
  assert.equal(getReactions(actor).spent, 1);
  await use(actor, "impenetrableRefund", { useId: "i1" }, "i2");
  assert.equal(getReactions(actor).spent, 0);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 4);
  // Unending Defence on the Protector's Turn end (GM client), undoable.
  actor.flags.ak5e.resourcePools.resilience.value = 0;
  game.user.isGM = true; game.user.id = "gm";
  await emitAk5eEvent("turnEnd", { eventId: "turnEnd:c:1:0:p", actorUuid: actor.uuid });
  await tick();
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 1);
  const unending = defenderUses.uses(actor).find(entry => entry.command === "unendingDefence");
  await use(actor, "undoUse", { useId: unending.id }, "u-ud");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 0);
  await emitAk5eEvent("hit", { eventId: "hit:h1:Actor.foe", attackId: "h1", actorUuid: actor.uuid, targetUuid: foe.uuid });
  await tick();
  assert.equal(activeMarks(foe, "punishment", actor.uuid).length, 1);
});

test("the GM-side relay applies only Protector effects the recorded use can create; levels stay warnings", async () => {
  const documents = boot();
  const actor = protector(documents, { level: 9 }), enemy = creature(documents, "enemy", { owner: false });
  game.user.isGM = true; game.user.id = "gm"; game.users.activeGM = game.user;
  actor.flags.ak5e.defenderUses = { data: {}, undo: [
    { id: "bad", command: "stoneWallFailed", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "protectorMarks", marks: ["gis"], ready: true }] },
    { id: "wrong", command: "punishment", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "protectorMarks", marks: ["taunted"], ready: true }] },
    { id: "early", command: "punishment", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "protectorMarks", marks: ["punishment"], ready: true }] },
    { id: "ok", command: "stoneWallFailed", status: "applying", epoch: 0, targets: [{ uuid: enemy.uuid, kind: "protectorMarks", marks: ["offBalance"], ready: true }] }] };
  await assert.rejects(defenderUses.relayedTargetChange(actor, "apply", { useId: "bad", targetUuid: enemy.uuid }), /not one this use can make/);
  await assert.rejects(defenderUses.relayedTargetChange(actor, "apply", { useId: "wrong", targetUuid: enemy.uuid }), /not one this use can make/);
  await defenderUses.relayedTargetChange(actor, "apply", { useId: "ok", targetUuid: enemy.uuid });
  assert.equal(activeMarks(enemy, "offBalance").length, 1);
  // Review fix: a level-9 Protector who overrode the level-12 warning still gets Punishment applied by the GM.
  await defenderUses.relayedTargetChange(actor, "apply", { useId: "early", targetUuid: enemy.uuid });
  assert.equal(activeMarks(enemy, "punishment").length, 1);
});

test("review fixes: GIS is used up even when the first instance was already resisted; re-enabling a used-up effect restores it; refund undo spends the Reaction again", async () => {
  const documents = boot();
  const actor = protector(documents), foe = creature(documents, "foe"), ally = creature(documents, "ally");
  await use(actor, "greaterImprovedShelter", { allies: [ally.uuid] }, "g1");
  const options = fromCard(foe.uuid), resisted = damage(10, "fire", { type: { resistance: true } }); resisted.amount = 5;
  calculateDamageHook(ally, resisted, options); await applyDamageHook(ally, resisted.amount, options);
  assert.equal(resisted.amount, 5);
  assert.equal(activeMarks(ally, "gis").length, 0, "the first instance used it up");
  assert.match(game.messages.at(-1).content, /Greater Improved Shelter: 5 → 5/);
  const [gis] = [...ally.effects.values()]; await gis.update({ disabled: false });
  assert.equal(activeMarks(ally, "gis").length, 1, "re-enabling restores it");
  await use(actor, "impenetrable", { physicalReduction: 4, triggerId: "d9", reading: "down" }, "i1");
  await use(actor, "impenetrableRefund", { useId: "i1" }, "i2");
  assert.equal(getReactions(actor).spent, 0);
  await use(actor, "undoUse", { useId: "i2" }, "u2");
  assert.equal(getReactions(actor).spent, 1, "undoing the refund spends the Reaction again");
});
