/** Targeted post-review regressions for WP A. These tests capture adjudicated behavior gaps only. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { previewMedicSetup, applyMedicSetup } from "../scripts/medic-setup.mjs";
import { previewMedicProgression, applyMedicProgression } from "../scripts/medic-progression.mjs";
import { previewSelfDefenceProtocol, applySelfDefenceProtocol } from "../scripts/medic-features.mjs";
import { appendLinkedReceipt, validateRelayPayload } from "../scripts/arts-ledger.mjs";
import { undoArtReceipt, prepareArtUse, consumeArt, wrapActivityUse } from "../scripts/arts-casting.mjs";
import { registerDamageResolver, applyArtDamageResolvers } from "../scripts/art-correlation.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";

const FLAME = "standard-art-pool-flame-arts-3917";
let warnings;
test.beforeEach(() => {
  warnings = [];
  setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 }, onWarn: message => warnings.push(message) });
});
test.afterEach(() => teardownFoundryGlobals());

function medic({ id = "review-medic", level = 5, points = 10, owner = true } = {}) {
  const actor = createTestActor({ id, name: "Review Medic", class: "class-medic", level, owner,
    hp: { value: 20, max: 20, temp: 0 } });
  actor.type = "character";
  actor.flags.ak5e.casting = { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" };
  actor.flags.ak5e.artsPoints = { maximum: 16, value: points, maximumArtLevel: 5, ninthLevelCast: false };
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis" };
  actor.items.set("focus", createTestItem({ id: "focus", type: "weapon", name: "Arts Wand",
    system: { equipped: true }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }, actor));
  return actor;
}
function art(actor, id = "review-art", level = 3) {
  const item = createTestItem({ id, type: "spell", name: "Review Art", system: { level },
    flags: { ak5e: { art: { enabled: true, pool: FLAME }, pool: FLAME } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function parentReceipt(actor, id = "review-parent") {
  return { id, actorUuid: actor.uuid, status: "available", epoch: 0, changes: [] };
}

// Native activity harness follows the D&D5e preUseActivity/activityConsumption boundary; no rolls occur.
class NativeActivity {
  constructor(actor, item) { this.actor = actor; this.item = item; this.type = "cast"; this.activation = { type: "reaction" }; }
  async use(usage = {}, dialog = {}, message = {}) {
    const workingUsage = { ...usage }, workingDialog = { ...dialog };
    const workingMessage = { data: structuredClone(message.data ?? {}), update: async () => {} };
    for (const hook of Hooks._hooks.get("dnd5e.preUseActivity") ?? []) {
      if (hook(this, workingUsage, workingDialog, workingMessage) === false) return null;
    }
    const updates = { actor: {} };
    for (const hook of Hooks._hooks.get("dnd5e.activityConsumption") ?? []) {
      if (hook(this, workingUsage, workingMessage, updates) === false) return null;
    }
    if (!Object.keys(updates.actor).length) return null;
    await this.actor.update(updates.actor);
    return { message: workingMessage };
  }
  async consume() {}
  async _prepareUsageConfig() {}
}

test("A1: setup undo restores the prior Arts and casting flags", async () => {
  const actor = medic({ id: "review-setup" });
  const priorArts = { value: 3, maximum: 4, maximumArtLevel: 1, ninthLevelCast: true, custom: "keep" };
  const priorCasting = { enabled: false, ability: "int", recovery: "short", castingUnit: "old-focus", custom: 7 };
  actor.flags.ak5e.artsPoints = structuredClone(priorArts);
  actor.flags.ak5e.casting = structuredClone(priorCasting);
  const preview = await previewMedicSetup(actor);
  const result = await applyMedicSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.ok(result.receipt?.id, "the setup receipt is the existing undo entry point");
  await undoArtReceipt(actor, result.receipt.id);
  assert.deepEqual(actor.flags.ak5e.artsPoints, priorArts);
  assert.deepEqual(actor.flags.ak5e.casting, priorCasting);
});

test("A1: native Medic progression has encounter undo for casting/AP flags and preserves unrelated Items", async () => {
  const actor = medic({ id: "review-medic-progression", level: 1 });
  const priorArts = { value: 2, maximum: 4, maximumArtLevel: 1, ninthLevelCast: false, marker: "prior" };
  const priorCasting = { enabled: false, ability: "cha", recovery: "short", castingUnit: "old-focus", marker: "prior" };
  actor.flags.ak5e.artsPoints = structuredClone(priorArts);
  actor.flags.ak5e.casting = structuredClone(priorCasting);
  const preserved = createTestItem({ id: "progression-unrelated", type: "equipment", name: "Unrelated equipment" }, actor);
  actor.items.set(preserved.id, preserved);
  const choices = {
    branch: "subclass-medic-physician",
    spellcastingAbility: "wis",
    saves: ["con", "int"],
    skills: ["arc", "ins"],
    tool: "Medical Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  };
  const preview = await previewMedicProgression(actor, choices);
  assert.deepEqual(preview.pending, [], "the progression fixture supplies all required level-1 choices");
  const receiptIdsBefore = new Set((actor.getFlag("ak5e", "artReceipts") ?? []).map(entry => entry.id));
  await applyMedicProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  assert.equal(actor.flags.ak5e.casting.enabled, true, "native Medic progression enables Arts casting");
  assert.equal(actor.flags.ak5e.artsPoints.maximum, preview.writes["flags.ak5e.artsPoints"].maximum);
  const receipt = (actor.getFlag("ak5e", "artReceipts") ?? []).find(entry => !receiptIdsBefore.has(entry.id));
  assert.ok(receipt?.id, "native Medic progression must expose an encounter undo receipt");
  await undoArtReceipt(actor, receipt.id);
  assert.deepEqual(actor.flags.ak5e.casting, priorCasting);
  assert.deepEqual(actor.flags.ak5e.artsPoints, priorArts);
  assert.strictEqual(actor.items.get(preserved.id), preserved);
});

test("A1: progression undo removes only created Items and preserves pre-existing Items", async () => {
  const actor = medic({ id: "review-setup-items" });
  const preserved = createTestItem({ id: "preserved-gear", type: "equipment", name: "Unrelated equipment" }, actor);
  actor.items.set(preserved.id, preserved);
  const preview = await previewMedicSetup(actor);
  const result = await applyMedicSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.ok(result.receipt?.id);
  await undoArtReceipt(actor, result.receipt.id);
  assert.strictEqual(actor.items.get(preserved.id), preserved);
  const createdNames = new Set(result.created);
  assert.equal([...actor.items.values()].some(item => createdNames.has(item.name)), false,
    "undo removes Items created by this progression while retaining pre-existing Items");
});

test("A3: Self-Defence Protocol pool choice and newly created Arts have encounter undo", async () => {
  const actor = medic({ id: "review-sdp" });
  const previousChoice = { poolId: "prior-standard-pool", source: "prior choice", reduction: 1 };
  actor.flags.ak5e.medic.selfDefenceProtocol = structuredClone(previousChoice);
  actor.items.set("sdp-feature", createTestItem({ id: "sdp-feature", type: "feat", name: "Self-Defence Protocol",
    flags: { ak5e: { chapterThreeId: "class-feature-medic-5th-level-self-defence-protocol-6382" } } }, actor));
  const preserved = createTestItem({ id: "sdp-preserved", type: "equipment", name: "Keep this Item" }, actor);
  actor.items.set(preserved.id, preserved);
  const idsBefore = new Set(actor.items.keys());
  const receiptIdsBefore = new Set((actor.getFlag("ak5e", "artReceipts") ?? []).map(entry => entry.id));
  const preview = await previewSelfDefenceProtocol(actor, { poolId: FLAME });
  const result = await applySelfDefenceProtocol(actor, { poolId: FLAME, confirmed: true, contextKey: preview.contextKey });
  assert.equal(actor.flags.ak5e.medic.selfDefenceProtocol.poolId, FLAME);
  assert.ok(result.granted.length > 0, "the fixture must exercise created Arts");
  const receipt = (actor.getFlag("ak5e", "artReceipts") ?? []).find(entry => !receiptIdsBefore.has(entry.id));
  assert.ok(receipt?.id, "the selected pool and created Arts need a normal encounter undo receipt");
  const createdIds = [...actor.items.keys()].filter(id => !idsBefore.has(id));
  assert.equal(actor.flags.ak5e.medic.selfDefenceProtocol.poolId, FLAME);
  await undoArtReceipt(actor, receipt.id);
  assert.deepEqual(actor.flags.ak5e.medic.selfDefenceProtocol, previousChoice);
  assert.deepEqual(createdIds.filter(id => actor.items.has(id)), [], "undo removes the newly granted Arts");
  assert.strictEqual(actor.items.get(preserved.id), preserved, "undo retains Items not created by this grant");
});

async function relayedChild({ actorId, targetId, parentId, childId }) {
  const actor = medic({ id: actorId });
  await actor.update({ "flags.ak5e.artReceipts": [parentReceipt(actor, parentId)] });
  const target = createTestActor({ id: targetId, name: "Owned relay target", hp: { value: 20, max: 20, temp: 0 } });
  // The caller already applied this change. The reviewer accepted relay.restore as the explicit before-state.
  await target.update({ "system.attributes.hp.value": 12 });
  await appendLinkedReceipt(actor, parentId, { id: childId, relay: {
    targetUuid: target.uuid,
    changes: { "system.attributes.hp.value": 12 },
    restore: { "system.attributes.hp.value": 20 }
  } });
  return { actor, target };
}

test("A6: owned-target relay records the true pre-change state and parent undo restores it", async () => {
  const { actor, target } = await relayedChild({ actorId: "relay-parent-source", targetId: "relay-parent-target",
    parentId: "relay-parent", childId: "relay-parent-child" });
  const child = actor.flags.ak5e.artReceipts.find(entry => entry.id === "relay-parent-child");
  assert.equal(child.relay.restore["system.attributes.hp.value"], 20,
    "review-approved interface assumption: explicit relay.restore carries the already-captured before-state");
  await undoArtReceipt(actor, "relay-parent");
  assert.equal(target.system.attributes.hp.value, 20);
});

test("A6: parent undo restores the already-changed owned target to its true before-state", async () => {
  const { actor, target } = await relayedChild({ actorId: "relay-parent-undo-source", targetId: "relay-parent-undo-target",
    parentId: "relay-parent-undo", childId: "relay-parent-undo-child" });
  await undoArtReceipt(actor, "relay-parent-undo");
  assert.equal(target.system.attributes.hp.value, 20, "parent undo must use the captured pre-change value");
});

test("A6: undoing a relayed child on its own restores the owned target", async () => {
  const { actor, target } = await relayedChild({ actorId: "relay-child-source", targetId: "relay-child-target",
    parentId: "relay-child-parent", childId: "relay-only-child" });
  await undoArtReceipt(actor, "relay-only-child");
  assert.equal(target.system.attributes.hp.value, 20, "child-only undo must invoke the same validated revert path");
});

test("A6: relay validation rejects arbitrary AK5e flags, not just non-namespaced paths", async () => {
  const actor = medic({ id: "relay-flags-source" });
  await actor.update({ "flags.ak5e.artReceipts": [parentReceipt(actor, "relay-flags-parent")] });
  const target = createTestActor({ id: "relay-flags-target", name: "Relay target" });
  const changes = { "flags.ak5e.casting.enabled": false };
  let appendAccepted = false;
  try {
    await appendLinkedReceipt(actor, "relay-flags-parent", { id: "relay-arbitrary-flag", relay: {
      targetUuid: target.uuid, changes
    } });
    appendAccepted = true;
  } catch { /* refusal is the expected behavior */ }
  const childRecorded = actor.flags.ak5e.artReceipts.some(entry => entry.id === "relay-arbitrary-flag");
  assert.deepEqual({ structurallyAccepted: validateRelayPayload(target, changes), appendAccepted, childRecorded },
    { structurallyAccepted: false, appendAccepted: false, childRecorded: false },
    "relay payloads must be operation-specific; broad AK5e namespacing alone is insufficient");
});

test("A8: mixed damage with only aggregate post-native total is not rescaled from raw type totals", () => {
  const target = createTestActor({ id: "mixed-damage-target", name: "Mixed damage target",
    hp: { value: 100, max: 100, temp: 0 } });
  registerDamageResolver(context => context?.options?.reviewMixedDamage ? { resistTypes: ["fire"] } : {});
  // Native DR/resistance already produced 10 Fire + 20 Cold = 30 pending damage. The hook gives
  // the resolver only the aggregate pending update, not that per-type native split; raw card totals are 20+20.
  const updates = { "system.attributes.hp.value": 70, "system.attributes.hp.temp": 0 };
  const message = { uuid: "ChatMessage.review-mixed", rolls: [
    { total: 20, options: { type: "fire" } }, { total: 20, options: { type: "cold" } }
  ] };
  applyArtDamageResolvers(target, 40, updates, { reviewMixedDamage: true, originatingMessage: message });
  const damageAfter = 100 - updates["system.attributes.hp.value"];
  assert.deepEqual({ damageAfter, warned: warnings.length > 0 }, { damageAfter: 30, warned: true },
    "without per-type native totals, leave the native aggregate unchanged and visibly warn instead of scaling raw totals");
});

test("A5: if Reaction receipt persistence fails, the spend is atomic or remains recoverable", async () => {
  const actor = medic({ id: "reaction-persistence", points: 10 });
  const item = art(actor, "reaction-review-art", 3);
  await actor.update({ "flags.ak5e.reactionBudget": { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} } });
  const originalUpdate = actor.update.bind(actor);
  actor.update = async changes => {
    const ledger = changes["flags.ak5e.artReceipts"];
    const cast = Array.isArray(ledger) && ledger.find(entry => entry.id === actor.flags.ak5e.lastArtCast?.id);
    if (cast?.changes?.some(change => change.path === "flags.ak5e.reactionBudget")) {
      throw new Error("review fixture: cannot persist the Reaction spend receipt");
    }
    return originalUpdate(changes);
  };
  const native = new NativeActivity(actor, item);
  wrapActivityUse(NativeActivity.prototype);
  Hooks.on("dnd5e.preUseActivity", prepareArtUse);
  Hooks.on("dnd5e.activityConsumption", consumeArt);
  await native.use({ ak5eContext: { castingTime: "reaction" } },
    { applicationClass: class NativeDialog {} });
  const receipt = actor.flags.ak5e.artReceipts.find(entry => entry.id === actor.flags.ak5e.lastArtCast?.id);
  const reactionChange = receipt?.changes?.find(change => change.path === "flags.ak5e.reactionBudget");
  assert.ok(getReactions(actor).spent === 0 || reactionChange,
    "a committed Reaction cannot remain spent without a durable receipt that can reverse it");
});
