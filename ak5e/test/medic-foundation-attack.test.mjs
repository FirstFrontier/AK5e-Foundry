/** Post-candidate adversarial checks for Medic Foundation WP A (A1–A9).
 * These attack boundary conditions and native-use sequencing beyond the frozen spec tests.
 * Shared wiring/template, Foundry rendering, and an installed D&D5e runtime are parent/checkpoint scope.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { previewMedicSetup, applyMedicSetup } from "../scripts/medic-setup.mjs";
import { registerMedicArts, previewSelfDefenceProtocol, applySelfDefenceProtocol } from "../scripts/medic-features.mjs";
import {
  artAvailability, applyArtCastOptions, registerArtCastOptions, registerArtGrant,
  prepareArtUse, consumeArt, validateArtCastOptions, wrapActivityUse, undoArtReceipt
} from "../scripts/arts-casting.mjs";
import { appendLinkedReceipt } from "../scripts/arts-ledger.mjs";
import { registerDamageResolver, applyArtDamageResolvers } from "../scripts/art-correlation.mjs";
import { handleRollDamage, onAk5eEvent, offAk5eEvent, getReactions } from "../scripts/trigger-events.mjs";
import { artsPointsForLevel } from "../scripts/medic-rules.mjs";

let globals;
test.beforeEach(() => { globals = setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 } }); });
test.afterEach(() => { teardownFoundryGlobals(); });

const HEALING = "special-art-pool-healing-arts-4211";
const FLAME = "standard-art-pool-flame-arts-3917";
function medic({ level = 9, points = 16, lifeSupport = 80, owner = true } = {}) {
  const actor = createTestActor({ name: "Attack Fixture Medic", class: "class-medic", level,
    abilities: { int: { value: 14, mod: 2 }, wis: { value: 14, mod: 2 }, cha: { value: 10, mod: 0 } },
    hp: { value: 20, max: 20, temp: 0 }, owner });
  actor.type = "character";
  actor.flags.ak5e.casting = { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" };
  actor.flags.ak5e.artsPoints = { maximum: 16, value: points, maximumArtLevel: 5, ninthLevelCast: false };
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis" };
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: lifeSupport, max: 80 } };
  actor.items.set("focus", createTestItem({ id: "focus", type: "weapon", name: "Arts Wand",
    system: { equipped: true }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }, actor));
  return actor;
}
function art(actor, { id = "healing-art", level = 5, pool = HEALING } = {}) {
  const item = createTestItem({ id, type: "spell", name: `Art ${id}`, system: { level },
    flags: { ak5e: { art: { enabled: true, pool }, pool } } }, actor);
  actor.items.set(item.id, item);
  return item;
}

// A native-use double follows the supported D&D5e hook order: preUseActivity, cancellation,
// activityConsumption, then the single committed Actor update.
class NativeActivity {
  constructor(actor, item, activation = "action") {
    this.actor = actor; this.item = item; this.type = "cast"; this.activation = { type: activation };
    this.shouldCancel = false;
  }
  async use(usage = {}, dialog = {}, message = {}) {
    const workingUsage = { ...usage }, workingDialog = { ...dialog };
    const workingMessage = { data: structuredClone(message.data ?? {}), update: async () => {} };
    for (const hook of Hooks._hooks.get("dnd5e.preUseActivity") ?? []) {
      if (hook(this, workingUsage, workingDialog, workingMessage) === false) return null;
    }
    if (this.shouldCancel) return null;
    const updates = { actor: {} };
    for (const hook of Hooks._hooks.get("dnd5e.activityConsumption") ?? []) hook(this, workingUsage, workingMessage, updates);
    if (!Object.keys(updates.actor).length) return null;
    await this.actor.update(updates.actor);
    return { message: workingMessage };
  }
  async consume() {}
  async _prepareUsageConfig() {}
}

test("A1: stale setup preview refuses a level change without partial flag or Item writes", async () => {
  const actor = medic({ level: 5 });
  const plan = await previewMedicSetup(actor);
  actor.items.get("class_item").system.levels = 6;
  const before = structuredClone(actor.flags.ak5e);
  await assert.rejects(applyMedicSetup(actor, { confirmed: true, contextKey: plan.contextKey }), /changed since the preview/i);
  assert.deepEqual(actor.flags.ak5e, before);
  assert.equal(actor.created.length, 0);
  assert.equal(actor.flags.ak5e.artsPoints.maximum, 16);
  assert.equal(artsPointsForLevel(6), 11);
});

test("A2/A3: fractional Life Support selection rounds down, then stacks after a grant without overspending", async () => {
  const actor = medic({ level: 11, lifeSupport: 15 });
  const item = art(actor);
  await registerMedicArts();
  registerArtGrant((a, i) => i.id === item.id ? { reduction: 2, source: "attack grant" } : {});
  const selected = { ak5eOptions: { "urgency-of-treatment": { lifeSupport: 29 } } };
  const choices = artAvailability(actor, item, selected);
  assert.equal(choices.quote.cost, 2, "base 5 AP minus grant 2 minus one actual 10-LS unit");
  assert.equal(choices.quote.lifeSupportCost, 10);
  const validation = await validateArtCastOptions(actor, item, null, selected.ak5eOptions);
  assert.match(validation.warnings.map(entry => entry.text).join(" "), /multiples of 10/i);
  const updates = { actor: { "flags.ak5e.artsPoints.value": 9 } };
  const receipt = { id: "attack-a23" };
  applyArtCastOptions({ actor, item }, selected, updates, receipt);
  assert.equal(updates.actor["flags.ak5e.resourcePools.lifeSupport.value"], 5);
  assert.deepEqual(receipt.options["urgency-of-treatment"], { lifeSupport: 29 }, "the receipt records the exact user selection");
});

test("A3: Self-Defence Protocol refuses a stale pool preview instead of granting a different choice", async () => {
  const actor = medic({ level: 5 });
  const feature = createTestItem({ id: "sdp", type: "feat", name: "Self-Defence Protocol",
    flags: { ak5e: { chapterThreeId: "class-feature-medic-5th-level-self-defence-protocol-6382" } } }, actor);
  actor.items.set(feature.id, feature);
  const plan = await previewSelfDefenceProtocol(actor, { poolId: FLAME });
  const alternate = await previewSelfDefenceProtocol(actor, { poolId: "standard-art-pool-corrosion-arts-407" });
  await assert.rejects(applySelfDefenceProtocol(actor, { poolId: FLAME, confirmed: true, contextKey: alternate.contextKey }), /changed since the preview/i);
  assert.equal(actor.flags.ak5e.medic.selfDefenceProtocol, undefined);
  assert.equal(actor.items.size, 3, "stale preview did not create granted Arts");
  assert.equal(plan.poolId, FLAME);
  assert.notEqual(plan.contextKey, alternate.contextKey);
});


test("A4: throwing option consumer rolls back only its partial changes and receipt writes", async () => {
  const actor = medic();
  const item = art(actor, { id: "throwing-provider-art", pool: FLAME });
  registerArtCastOptions((_a, candidate) => candidate.id === item.id ? {
    id: "attack-thrower", consume: (_selection, updates, receipt) => {
      updates.actor["flags.ak5e.resourcePools.lifeSupport.value"] = 0;
      receipt.partial = true;
      throw new Error("after partial write");
    }
  } : null);
  const updates = { actor: { "flags.ak5e.artsPoints.value": 12 } };
  const receipt = { id: "attack-consumer", retained: true };
  const originalWarn = console.warn;
  let warnings;
  console.warn = () => {};
  try { warnings = applyArtCastOptions({ actor, item }, { ak5eOptions: { "attack-thrower": { selected: true } } }, updates, receipt); }
  finally { console.warn = originalWarn; }
  assert.equal(updates.actor["flags.ak5e.artsPoints.value"], 12);
  assert.equal(updates.actor["flags.ak5e.resourcePools.lifeSupport.value"], undefined);
  assert.deepEqual(receipt, { id: "attack-consumer", retained: true });
  assert.match(warnings.map(entry => entry.text).join(" "), /after partial write/);
});

test("A4/A5/A9: native owner cast commits once, cancel spends no Reaction, and undo restores AP plus Reaction", async () => {
  const actor = medic({ points: 10 });
  const item = art(actor, { id: "native-art", level: 3, pool: FLAME });
  await actor.update({ "flags.ak5e.reactionBudget": { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} } });
  const native = new NativeActivity(actor, item, "reaction");
  wrapActivityUse(NativeActivity.prototype);
  Hooks.on("dnd5e.preUseActivity", prepareArtUse);
  Hooks.on("dnd5e.activityConsumption", consumeArt);
  const OriginalRoll = globalThis.Roll;
  globalThis.Roll = class ForbiddenRoll { constructor() { throw new Error("module started a roll"); } };
  try {
  native.shouldCancel = true;
  assert.equal(await native.use({ ak5eContext: { requiredTargetUuid: "Actor.required" } }, { applicationClass: class NativeDialog {} }), null);
  assert.equal(actor.flags.ak5e.artsPoints.value, 10);
  assert.equal(getReactions(actor).spent, 0, "cancellation must not spend a Reaction");
  native.shouldCancel = false;
  const result = await native.use({ ak5eContext: { requiredTargetUuid: "Actor.required" } }, { applicationClass: class NativeDialog {} });
  assert.ok(result?.message, "native cast did not commit");
  assert.equal(actor.flags.ak5e.artsPoints.value, 7, JSON.stringify(actor.flags.ak5e.lastArtCast));
  assert.equal(getReactions(actor).spent, 1);
  const receipt = actor.flags.ak5e.artReceipts.find(entry => entry.id === actor.flags.ak5e.lastArtCast.id);
  assert.match(receipt.warnings.join(" "), /required target/i, "target mismatch warning must survive to the public receipt");
  await undoArtReceipt(actor, receipt.id);
  assert.equal(actor.flags.ak5e.artsPoints.value, 10);
  assert.equal(getReactions(actor).spent, 0, "cast undo restores its Reaction spend");
  } finally { globalThis.Roll = OriginalRoll; }
});

test("A6: malformed relayed updates are rejected before any child receipt or target write", async () => {
  const actor = medic();
  const parent = { id: "attack-parent", actorUuid: actor.uuid, status: "available", changes: [] };
  await actor.update({ "flags.ak5e.artReceipts": [parent] });
  const target = createTestActor({ name: "Target", hp: { value: 7, max: 20, temp: 0 } });
  let writes = 0;
  const original = target.update.bind(target);
  target.update = async changes => { writes += 1; return original(changes); };
  await assert.rejects(appendLinkedReceipt(actor, parent.id, { id: "attack-child", relay: {
    targetUuid: target.uuid, changes: { "system.attributes.hp.value": -100, "system.isGM": true }
  } }), /permitted Actor update/i);
  assert.equal(target.system.attributes.hp.value, 7);
  assert.equal(writes, 0);
  assert.equal(actor.flags.ak5e.artReceipts.length, 1, "rejected operation leaves no child receipt");
});

test("A7: delayed damage roll correlates its explicit cast ID, not the newest cast", async () => {
  const source = medic();
  await source.update({ "flags.ak5e.artReceipts": [
    { id: "cast-old", level: 2, cost: 2, actorUuid: source.uuid },
    { id: "cast-new", level: 5, cost: 5, actorUuid: source.uuid }
  ], "flags.ak5e.lastArtCast": { id: "cast-new", level: 5, cost: 5, actorUuid: source.uuid } });
  const item = art(source, { level: 2, pool: FLAME });
  const roll = { total: 9, formula: "1d8", options: { type: "fire" },
    parent: { id: "roll-old", uuid: "ChatMessage.roll-old", flags: { ak5e: { castId: "cast-old" }, dnd5e: {} } } };
  const seen = [];
  const handler = event => seen.push(event);
  onAk5eEvent("damageRoll", handler);
  try {
    await handleRollDamage([roll], { subject: { actor: source, item, uuid: `${item.uuid}.Activity.cast` } });
  } finally { offAk5eEvent("damageRoll", handler); }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].castId, "cast-old");
  assert.equal(seen[0].artLevel, 2);
  assert.equal(seen[0].apSpent, 2);
});

test("A8: added resistance applies only to its named damage portion before flat reduction when exact native parts are captured", async () => {
  const { captureNativeDamage } = await import("../scripts/art-correlation.mjs");
  const target = createTestActor({ name: "Typed Damage Target", hp: { value: 100, max: 100, temp: 0 } });
  registerDamageResolver(context => context?.options?.attackTag === "typed" ? { resistTypes: ["fire"], reduce: 2 } : {});
  const updates = { "system.attributes.hp.value": 80, "system.attributes.hp.temp": 0 };
  const message = { uuid: "ChatMessage.typed", rolls: [
    { total: 10, options: { type: "fire" } }, { total: 10, options: { type: "cold" } }
  ] };
  const options = { attackTag: "typed", originatingMessage: message };
  captureNativeDamage(target, [{ type: "fire", value: 10 }, { type: "cold", value: 10 }], options);
  applyArtDamageResolvers(target, 20, updates, options);
  assert.equal(updates["system.attributes.hp.value"], 87, "20 exact native damage -> 15 after fire Resistance -> 13 after reduction");
  assert.equal(updates["system.attributes.hp.temp"], 0);
});

test("A8: mixed damage without exact native parts uses the flat aggregate and warns for manual handling", () => {
  const target = createTestActor({ name: "Untyped Mixed Damage Target", hp: { value: 100, max: 100, temp: 0 } });
  registerDamageResolver(context => context?.options?.attackTag === "typed-no-native" ? { resistTypes: ["fire"], reduce: 2 } : {});
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    const updates = { "system.attributes.hp.value": 80, "system.attributes.hp.temp": 0 };
    const message = { uuid: "ChatMessage.typed-no-native", rolls: [
      { total: 10, options: { type: "fire" } }, { total: 10, options: { type: "cold" } }
    ] };
    applyArtDamageResolvers(target, 20, updates, { attackTag: "typed-no-native", originatingMessage: message });
    assert.equal(updates["system.attributes.hp.value"], 82, "without exact native parts, flat aggregate damage is 20 - 2, not an inferred raw split");
    assert.match(warnings.join("\n"), /manual|exact|native|mixed|type/i, "uncertain mixed damage visibly requires manual handling");
  } finally { console.warn = originalWarn; }
});
