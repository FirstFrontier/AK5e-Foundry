import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { barrierMax } from "../scripts/defender-rules.mjs";
import { registerDefenderHooks } from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { registerJuggernautHooks, overwhelmingMightHook } from "../scripts/juggernaut-features.mjs";
import { calculateDamageHook, applyDamageHook, preApplyDamageHook } from "../scripts/defender-damage-mods.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

const rolls = [];
let booted = false;
function boot() {
  const documents = world();
  globalThis.Hooks = { on() {}, off() {} };
  game.user.name = "Player"; game.users = [{ id: "gm", isGM: true }]; game.users.activeGM = game.users[0];
  game.i18n = { localize: key => key, format: key => key };
  let n = 0; globalThis.foundry.utils.randomID = () => `id${++n}`;
  globalThis.CONFIG = { statusEffects: [], Dice: { DamageRoll: class { constructor(formula, _data, options) { this.formula = formula; this.options = options; rolls.push(formula); } async evaluate() { this.total = 5; return this; } } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; rolls.push(formula); } async evaluate() { this.total = 1; return this; } async toMessage() {} };
  ChatMessage.implementation.getSpeakerActor = speaker => documents.get(speaker?.actor) ?? null;
  rolls.length = 0;
  if (!booted) { registerDefenderHooks(); registerJuggernautHooks(); booted = true; }
  return documents;
}
const get = function(s, k) { return this.flags?.[s]?.[k]; };
function juggernaut(documents, { level = 12, res = 6, armour = true, layers } = {}) {
  const actor = setup(fixture({ level, res, branch: "juggernaut" }));
  actor.system.abilities.dex = { value: 10, mod: 0 };
  if (layers !== undefined) actor.flags.ak5e.resourcePools.barrierLayers = { value: layers };
  if (armour) actor.items.set("arm", { id: "arm", type: "equipment", name: "Juggernaut Armour", parent: actor, flags: { ak5e: {} }, getFlag: get, system: { equipped: true, type: { value: "heavy" } } });
  documents.set(actor.uuid, actor);
  return actor;
}
const foe = documents => { const doc = { id: "foe", uuid: "Actor.foe", documentName: "Actor", name: "Foe", isToken: false }; documents.set(doc.uuid, doc); return doc; };
const damage = (value, type = "slashing") => Object.assign([{ type, value, active: {} }], { amount: value, temp: 0, tempMax: 0 });
const fromCard = speaker => ({ originatingMessage: { speaker: { actor: speaker } } });
const use = (actor, command, data = {}, id = Math.random().toString(36).slice(2, 10)) => defenderUses.command(actor, command, { confirmed: true, ...data }, id);
async function anyway(actor, command, data, id) {
  try { return await use(actor, command, data, id); } catch (error) { if (error.name !== "AK5eWarnings") throw error; return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id); }
}

test("Superheavy layers: 1, 2 from 7th, 3 from 14th; Bullrush from 9th; Groundbreaker from 15th", () => {
  const documents = boot();
  assert.deepEqual([1, 6, 7, 13, 14, 20].map(barrierMax), [1, 1, 2, 2, 3, 3]);
  assert.equal(getPool(juggernaut(documents, { level: 7 }), "barrierLayers").max, 2);
  assert.equal(getPool(juggernaut(documents, { level: 8 }), "bullrush").max, 0);
  assert.equal(getPool(juggernaut(documents, { level: 9 }), "bullrush").max, 1);
  assert.equal(getPool(juggernaut(documents, { level: 14 }), "groundbreaker").max, 0);
  assert.equal(getPool(juggernaut(documents, { level: 15 }), "groundbreaker").max, 1);
});

test("Superheavy halves Damage from another Creature only; previews change nothing; applying shatters a layer and offers Shatterstorm", async () => {
  const documents = boot();
  const actor = juggernaut(documents, { level: 4 }), enemy = foe(documents);
  const options = fromCard(enemy.uuid);
  for (let i = 0; i < 3; i++) {
    const preview = damage(11);
    calculateDamageHook(actor, preview, options);
    assert.equal(preview.amount, 5, "halved, rounding down");
  }
  assert.equal(getPool(actor, "barrierLayers").value, 1, "a preview never uses a layer");
  for (const [label, other] of [["no chat card", {}], ["own Damage", fromCard(actor.uuid)]]) {
    const unchanged = damage(11); calculateDamageHook(actor, unchanged, other);
    assert.equal(unchanged.amount, 11, label);
  }
  const applied = damage(11); calculateDamageHook(actor, applied, options);
  await applyDamageHook(actor, applied.amount, options);
  assert.equal(getPool(actor, "barrierLayers").value, 0);
  const [receipt] = defenderUses.uses(actor);
  assert.equal(receipt.command, "barrierShatter");
  assert.equal(receipt.formula, "1d8 + 3");
  assert.equal(receipt.status, "awaitingRoll");
  assert.deepEqual(rolls, [], "Shatterstorm is not rolled before the click");
  const after = damage(11); calculateDamageHook(actor, after, options);
  assert.equal(after.amount, 11, "no layer left: no halving");
  await use(actor, "useRoll", { useId: receipt.id }, "roll");
  assert.equal(game.messages.find(message => message.rolls?.length).rolls[0].options.type, "force");
  await use(actor, "undoUse", { useId: receipt.id }, "undo");
  assert.equal(getPool(actor, "barrierLayers").value, 1, "undo restores the layer");
});

test("without Heavy Armour the Barrier is suspended; below 4th level a shatter has no Shatterstorm", async () => {
  const documents = boot();
  const bare = juggernaut(documents, { level: 4, armour: false }), enemy = foe(documents);
  const amount = damage(10); calculateDamageHook(bare, amount, fromCard(enemy.uuid));
  assert.equal(amount.amount, 10);
  assert.equal(getPool(bare, "barrierLayers").value, 1, "suspended, not lost");
  const low = juggernaut(documents, { level: 3 }), options = fromCard(enemy.uuid), hit = damage(10);
  calculateDamageHook(low, hit, options); await applyDamageHook(low, hit.amount, options);
  const [receipt] = defenderUses.uses(low);
  assert.equal(receipt.formula, null);
  assert.equal(receipt.status, "complete");
});

test("Reform: an Action, or a Bonus Action for 1 Resilience; full layers and missing armour are warnings; undo", async () => {
  const documents = boot();
  const actor = juggernaut(documents, { level: 14, layers: 1 });
  await use(actor, "reformBarrier", {}, "r1");
  assert.equal(getPool(actor, "barrierLayers").value, 2);
  await use(actor, "reformBarrier", { bonusAction: true }, "r2");
  assert.equal(getPool(actor, "barrierLayers").value, 3);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 5);
  await assert.rejects(use(actor, "reformBarrier", {}, "r3"), error => error.warnings.some(w => w.id === "full"));
  await use(actor, "undoUse", { useId: "r2" }, "u2");
  assert.equal(getPool(actor, "barrierLayers").value, 2);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 6);
  const bare = juggernaut(documents, { armour: false, layers: 0 });
  await assert.rejects(use(bare, "reformBarrier", {}, "r4"), error => error.warnings.some(w => w.id === "armour"));
});

test("Bullrush and Groundbreaker post save links (Martial DC) and roll only on click; uses and restore", async () => {
  const documents = boot();
  const actor = juggernaut(documents, { level: 15 });
  await use(actor, "bullrush", {}, "b1");
  assert.match(game.messages.at(-1).content, /\[\[\/save ability=dex dc=16\]\]/);
  assert.deepEqual(rolls, []);
  await assert.rejects(use(actor, "bullrush", {}, "b2"), error => error.warnings.some(w => w.id === "used"));
  await use(actor, "restoreBullrush", {}, "rb");
  assert.equal(getPool(actor, "bullrush").value, 1);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 4);
  await use(actor, "groundbreaker", {}, "g1");
  assert.match(game.messages.at(-1).content, /\[\[\/save ability=str dc=16\]\]/);
  await use(actor, "useRoll", { useId: "g1" }, "g1r");
  assert.deepEqual(rolls, ["8d12"]);
  await assert.rejects(use(juggernaut(documents, { level: 8 }), "bullrush", {}, "b3"), error => error.warnings.some(w => w.id === "level"));
});

test("Overwhelming Might adds one weapon die of Force Damage to Melee Attacks while a layer holds", () => {
  const documents = boot();
  const config = (actor, type = "melee") => ({ subject: { type: "attack", actor, attack: { type: { value: type } }, item: { system: {} } },
    rolls: [{ parts: ["1d10 + 4"], data: {}, options: { type: "slashing", types: ["slashing"] } }] });
  const actor = juggernaut(documents, { level: 12 }), melee = config(actor);
  overwhelmingMightHook(melee);
  assert.equal(melee.rolls.length, 2);
  assert.deepEqual(melee.rolls[1].parts, ["1d10"]);
  assert.equal(melee.rolls[1].options.type, "force");
  const ranged = config(actor, "ranged"); overwhelmingMightHook(ranged); assert.equal(ranged.rolls.length, 1);
  const early = config(juggernaut(documents, { level: 11 })); overwhelmingMightHook(early); assert.equal(early.rolls.length, 1);
  const broken = config(juggernaut(documents, { level: 12, layers: 0 })); overwhelmingMightHook(broken); assert.equal(broken.rolls.length, 1);
});

test("review fix: a layer reserved by an application in flight cannot halve a second instance", async () => {
  const documents = boot();
  const actor = juggernaut(documents, { level: 4 }), enemy = foe(documents);
  const first = fromCard(enemy.uuid), second = fromCard(enemy.uuid);
  const a = damage(20); calculateDamageHook(actor, a, first); preApplyDamageHook(actor, a.amount, {}, first);
  const b = damage(20); calculateDamageHook(actor, b, second); preApplyDamageHook(actor, b.amount, {}, second);
  assert.equal(a.amount, 10);
  assert.equal(b.amount, 20, "the only layer is reserved by the first application");
  await Promise.all([applyDamageHook(actor, a.amount, first), applyDamageHook(actor, b.amount, second)]);
  assert.equal(defenderUses.uses(actor).filter(use => use.command === "barrierShatter").length, 1);
  assert.equal(getPool(actor, "barrierLayers").value, 0);
  const ignored = damage(20); calculateDamageHook(juggernaut(documents, { level: 4 }), ignored, { ...fromCard(enemy.uuid), ignore: true });
  assert.equal(ignored.amount, 20, "options.ignore is honoured");
});
