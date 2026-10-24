import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor, createTestItem, teardownFoundryGlobals } from "./base-classes-fixture.mjs";
import { marksmanUses } from "../scripts/marksman-uses.mjs";
import { resolutionId, effectExpired, resolutionTriggerDue, outcomeHP } from "../scripts/marksman-resolution.mjs";
import { hasWeaponProperty, weaponPropertyValue, weaponRange, weaponDamageParts } from "../scripts/weapon-properties.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { marksmanPreRollDamage } from "../scripts/marksman-features.mjs";

test.afterEach(teardownFoundryGlobals);
function setup(options = {}) {
  const env = setupFoundryGlobals({ activeGM: null, ...options });
  const source = createTestActor({ id: "marksman", class: "marksman", level: 20, flags: { ak5e: { marksman: { enabled: true, martialDcAbility: "dex" } } } });
  const target = createTestActor({ id: "target", hp: { value: 100, max: 100, temp: 5 } });
  env.docs.set(source.uuid, source); env.docs.set(target.uuid, target);
  marksmanUses.register({ plans: { fixtureResolution(_actor, _state, data) { return { warnings: [], title: "Source fixture", apply(_next, receipt) {
    receipt.resolution = { version: 1, steps: structuredClone(data.steps) }; receipt.summary = "Fixture source"; receipt.result = {}; return {};
  } }; } } });
  return { ...env, source, target };
}
async function record(source, steps, id = "source") {
  await marksmanUses.command(source, "fixtureResolution", { steps, confirmed: true }, id);
  return marksmanUses.receipt(source, id);
}
async function apply(source, target, useId, stepId, extra = {}) {
  const id = resolutionId(useId, stepId, "apply", target.uuid);
  await marksmanUses.command(source, "resolveUse", { useId, stepId, targetUuid: target.uuid, confirmed: true, ...extra }, id);
  return id;
}

test("actual generated weapon metadata feeds all relevant AK5e properties and values", () => {
  setup();
  const item = name => { const entry = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.name === name && entry.kind === "weapon");
    return createTestItem({ type: "weapon", system: entry.systemData, flags: { ak5e: { tableData: entry.tableData } } }); };
  assert.equal(hasWeaponProperty(item("Axe"), "deadly"), true);
  assert.equal(hasWeaponProperty(item("Handgun"), "rapidFire"), true);
  assert.equal(hasWeaponProperty(item("Greatbow"), "brace"), true);
  assert.equal(weaponPropertyValue(item("Greatbow"), "crush"), 5);
  assert.equal(weaponPropertyValue(item("Grenade Launcher"), "splash"), 5);
  assert.deepEqual(weaponRange(item("Greatbow")), { normal: 100, long: 400 });
  assert.deepEqual(weaponDamageParts(item("Grenade Launcher")), [{ formula: "1d8", type: "thunder" }]);
  assert.equal(hasWeaponProperty({ system: { description: { value: "not a Deadly weapon" } } }, "deadly"), false);
});

test("Smooth Operator includes negative modifiers exactly once and preserves native ability damage", () => {
  const { source } = setup(); source.flags.ak5e.marksman.fightingStyle = "smoothOperator"; source.system.abilities.dex.mod = -2;
  const subject = { actor: source, actionType: "rwak", ability: "dex", activation: { type: "bonus" }, item: { flags: { ak5e: { tableData: { properties: "Rapid Fire" } } } } };
  const roll = { parts: ["1d6"], options: {} };
  marksmanPreRollDamage({ subject, rolls: [roll] }); marksmanPreRollDamage({ subject, rolls: [roll] });
  assert.deepEqual(roll.parts, ["1d6", "-2"]);
  const native = { parts: ["1d6", "@mod"], options: {} }; marksmanPreRollDamage({ subject, rolls: [native] });
  assert.deepEqual(native.parts, ["1d6", "@mod"]);
});

test("a use never rolls dice until its explicit damage command, applies once, and parent undo reverses children", async () => {
  let rolls = 0;
  const { source, target } = setup({ rollEvaluator: () => { rolls++; return 20; } });
  await record(source, [{ id: "blast", kind: "damage", targetUuids: [target.uuid], damageParts: [{ formula: "5d8", type: "piercing" }] }]);
  assert.equal(rolls, 0);
  await assert.rejects(apply(source, target, "source", "blast"), /Roll this step/);
  assert.equal(marksmanUses.state(source).undo.length, 1);
  const rollId = resolutionId("source", "blast", "roll");
  await marksmanUses.command(source, "rollResolution", { confirmed: true, useId: "source", stepId: "blast" }, rollId);
  assert.equal(rolls, 0);
  await marksmanUses.command(source, "useRoll", { useId: rollId }, "roll-click");
  assert.equal(rolls, 1);
  await apply(source, target, "source", "blast");
  assert.equal(target.system.attributes.hp.value, 85); assert.equal(target.system.attributes.hp.temp, 0);
  await apply(source, target, "source", "blast"); assert.equal(target.system.attributes.hp.value, 85);
  await marksmanUses.command(source, "undoUse", { useId: "source" }, "undo");
  assert.equal(target.system.attributes.hp.value, 100); assert.equal(target.system.attributes.hp.temp, 5);
  assert.ok(marksmanUses.state(source).undo.every(use => use.status === "undone"));
});

test("save outcome is required before applying and successful Siege Bolt save still takes full damage", async () => {
  const { source, target } = setup();
  await record(source, [{ id: "bolt", kind: "damage", targetUuids: [target.uuid], damageParts: [{ amount: 25, type: "piercing" }],
    save: { ability: "dex", dc: 15, success: "full" }, ignoreDR: true, ignoreResistance: true }]);
  await assert.rejects(apply(source, target, "source", "bolt"), /saving throw/);
  await apply(source, target, "source", "bolt", { saveSucceeded: true, overrides: ["save"] });
  assert.equal(target.system.attributes.hp.value, 80);
});

test("partial effect creation can be undone while pending, including already applied HP", async () => {
  const { source, target } = setup();
  await record(source, [{ id: "hit", kind: "damage", targetUuids: [target.uuid], damageParts: [{ amount: 10, type: "piercing" }], effects: [{ label: "Stun", statuses: ["stunned"], changes: [] }] }]);
  const original = target.createEmbeddedDocuments;
  target.createEmbeddedDocuments = async () => { throw new Error("effect failure"); };
  const id = resolutionId("source", "hit", "apply", target.uuid);
  await assert.rejects(apply(source, target, "source", "hit"), /effect failure/);
  assert.equal(target.system.attributes.hp.value, 95);
  assert.equal(marksmanUses.receipt(source, id).targets[0].attempted, true);
  target.createEmbeddedDocuments = original;
  await marksmanUses.command(source, "undoUse", { useId: id }, "undo-partial");
  assert.equal(target.system.attributes.hp.value, 100); assert.equal(target.system.attributes.hp.temp, 5);
});

test("two Marksmen applying concurrent outcomes serialize on their shared target", async () => {
  const { source, target, docs } = setup(); target.system.attributes.hp.temp = 0;
  const other = createTestActor({ id: "other", class: "marksman", flags: { ak5e: { marksman: { enabled: true } } } }); docs.set(other.uuid, other);
  const update = target.update.bind(target); target.update = async (...args) => { await new Promise(resolve => setTimeout(resolve, 2)); return update(...args); };
  await record(source, [{ id: "a", kind: "damage", targetUuids: [target.uuid], damageParts: [{ amount: 10, type: "piercing" }] }], "one");
  await record(other, [{ id: "b", kind: "damage", targetUuids: [target.uuid], damageParts: [{ amount: 20, type: "piercing" }] }], "two");
  await Promise.all([apply(source, target, "one", "a"), apply(other, target, "two", "b")]);
  assert.equal(target.system.attributes.hp.value, 70);
});

test("linked Token targets expire on the correct same-round next turn and second tick waits a round", () => {
  const { source, target, docs } = setup();
  const tokenUuid = "Scene.test.Token.enemy"; docs.set(tokenUuid, { documentName: "Token", uuid: tokenUuid, actor: target });
  globalThis.game.combat = { id: "combat", started: true, round: 1, turn: 2, turns: [{ actor: source }, { actor: target }] };
  const metadata = { expiry: { event: "nextTurnEnd", actorUuid: tokenUuid, created: { combatId: "combat", round: 1, turn: 0 } } };
  assert.equal(effectExpired(metadata, { event: "turnEnd", actorUuid: target.uuid, round: 1, turn: 1 }), true);
  const use = { data: { turnKey: "combat:1:0" } };
  const step = { trigger: { event: "turnEnd", actorUuid: tokenUuid, occurrence: 2 } };
  assert.equal(resolutionTriggerDue(use, step, { event: "turnEnd", actorUuid: target.uuid, round: 1, turn: 1 }), false);
  assert.equal(resolutionTriggerDue(use, step, { event: "turnEnd", actorUuid: target.uuid, round: 2, turn: 1 }), true);
});

test("Godpiercer requires a policy, preserves Temporary HP under direct loss, and Crush respects immunity", () => {
  const { source, target } = setup();
  assert.throws(() => outcomeHP(source, target, { hpLoss: 8 }), /policy/);
  const result = outcomeHP(source, target, { hpLoss: 8, hpLossPolicy: { bypassDR: true, bypassResistance: true, bypassTemp: true } });
  assert.equal(result.hp, 92); assert.equal(result.temp, 5);
  target.system.traits = { di: { value: new Set(["piercing"]) } };
  assert.equal(outcomeHP(source, target, { damageParts: [{ amount: 20, type: "piercing" }], minimumDamageAfterDR: 12 }).hp, 100);
});

test("target relay rejects forged payloads instead of applying arbitrary receipt values", async () => {
  const { source, target } = setup();
  await record(source, [{ id: "hit", kind: "damage", targetUuids: [target.uuid], damageParts: [{ amount: 10, type: "piercing" }] }]);
  const id = await apply(source, target, "source", "hit");
  const receipt = marksmanUses.receipt(source, id);
  receipt.targets[0].payload.damageParts[0].amount = 100000;
  source.flags.ak5e.marksmanUses.undo = source.flags.ak5e.marksmanUses.undo.map(entry => entry.id === id ? receipt : entry);
  await assert.rejects(marksmanUses.relayedTargetChange(source, "apply", { useId: id, targetUuid: target.uuid }), /not one this use can make/);
});
