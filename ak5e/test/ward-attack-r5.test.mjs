/**
 * Ward runtime regression, round 5 — W2F-4 sibling relay target binding.
 *
 * Oracle: SPEC-ward.md F4/F5/F6/F9 + the Integration contract ("named operations validate
 * source/target/path") and the W2F-2 Surge target pin this round generalises: the relay may
 * apply only the target change the receipt recorded, to the target the receipt recorded.
 *
 *   W2F-4  wardGrant, wardLifeSupport, wardRegeneration and reapplyForeignPool re-checked
 *          kind and pool value but never the recorded target. A receipt flag repointed at
 *          another Creature (entry.uuid changed, or the relay resolving a different
 *          document) applied this use's Temporary-HP pool to that Creature. The Surge pin
 *          binds entry.uuid + targetDoc.uuid to receipt.result.targetUuid; each sibling now
 *          does the same, through both relay entry points (plan function and plan closure).
 *
 * Red-first: on the unfixed module every "repointed" assertion below fails (the old
 * validators accepted the tampered entry), including the GM relay gate that really applies
 * the pool to the stranger. The well-formed assertions pass before and after, so the fix
 * rejects only the repointing and never a recorded relay.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { medicUses } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { setReactionStore, flagReactionStore } from "../scripts/trigger-events.mjs";
import { registerWardHooks, WARD_PLANS } from "../scripts/ward-features.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 300, settings: { "ak5e.artReceiptEpoch": 0 } });
  defineMedicPools();
  await registerWardHooks();
});
test.after(() => teardownFoundryGlobals());

/* ---------------------------------------------------------------- fixtures */

function medic(id, level = 15, lifeSupport = 100) {
  clearPoolRegistry(); defineMedicPools(); setReactionStore(flagReactionStore);
  const actor = createTestActor({
    name: id, level,
    abilities: { dex: { value: 12, mod: 1 }, wis: { value: 16, mod: 3 } },
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 40, max: 40, temp: 0 } } }
  });
  actor.flags.ak5e.medic = { enabled: true, spellcastingAbility: "wis", spellDC: 15 };
  actor.flags.ak5e.resourcePools = { lifeSupport: { value: lifeSupport, max: 125 } };
  actor.items.set("class", createTestItem({ id: "class", type: "class", name: "Medic",
    system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("subclass", createTestItem({ id: "subclass", type: "subclass", name: "Ward",
    flags: { ak5e: { chapterThreeId: "subclass-medic-ward" } } }, actor));
  setLifeSupport(actor, lifeSupport, "r5 fixture");
  actor.uuid = `Actor.${id}`;
  globalThis._ak5eTestDocs.set(actor.uuid, actor);
  globalThis.game.actors.set(actor.id, actor);
  return actor;
}

function patient(name, temp = 0) {
  return createTestActor({
    name,
    system: { details: { type: { value: "humanoid" } }, attributes: { hp: { value: 40, max: 40, temp } } }
  });
}

/** This Medic's Ward provenance plus the matching native pool. */
function ward(target, source, amount) {
  target.system.attributes.hp.temp = amount;
  target.flags.ak5e.ward = { medicUuid: source.uuid, grantedAt: "r5:grant", amount, observedTemp: amount };
}

/**
 * The two relay entry points for a plan: the plan *function* the GM relay reads
 * (`PLANS[name].validateTarget`) and the plan object's own closure (the in-plan gate).
 */
function checksFor(name, plan) {
  return [WARD_PLANS[name].validateTarget, plan.validateTarget];
}

/** Repointed entry/doc pairs that must never relay, against a recorded temporary-HP use. */
function assertTargetPinned(checks, actor, receipt, entry, target, stranger) {
  const recorded = receipt.result.targetUuid;
  assert.equal(recorded, target.uuid, "fixture: the receipt recorded the target's uuid");
  for (const check of checks) {
    assert.equal(check(actor, receipt, { ...entry }, target), true,
      "the well-formed recorded entry still relays");
    assert.equal(check(actor, receipt, { ...entry, uuid: stranger.uuid }, stranger), false,
      "a repointed entry must not apply this use's pool to another Creature");
    assert.equal(check(actor, receipt, entry, stranger), false,
      "a relay resolving a document other than the recorded target must not apply");
    assert.equal(check(actor, receipt, { ...entry, uuid: stranger.uuid }, target), false,
      "the entry uuid must equal the recorded target even when the resolved document matches");
    assert.equal(check(actor, receipt, entry, null), false,
      "no resolved document is never a recorded relay target");
    const missing = { ...receipt, result: { ...receipt.result } };
    delete missing.result.targetUuid;
    assert.equal(check(actor, missing, { ...entry }, target), false,
      "a receipt without a recorded target cannot relay");
    const empty = { ...receipt, result: { ...receipt.result, targetUuid: "" } };
    assert.equal(check(actor, empty, { ...entry }, target), false,
      "an empty recorded target cannot relay");
  }
}

/**
 * Forge the stored receipt entry onto `stranger`, then exercise the real GM relay gate:
 * the repointed entry is rejected before any write, and restoring the recorded uuid makes
 * the same relay apply. This is the defect the fix kills, not just a validator unit check.
 */
async function assertRelayRejectsRepoint(actor, useId, targetKey, entryUuid, stranger) {
  const stored = actor.flags.ak5e.medicUses.undo.find(entry => entry.id === useId);
  assert.ok(stored, `fixture: the stored receipt ${useId} exists`);
  const storedEntry = stored.targets.find(change => change.key === targetKey);
  assert.ok(storedEntry, `fixture: the stored receipt records the ${targetKey} entry`);
  assert.equal(storedEntry.uuid, entryUuid, "fixture: the stored entry names the recorded target");
  storedEntry.uuid = stranger.uuid;
  await assert.rejects(
    medicUses.relayedTargetChange(actor, "apply", { useId, targetUuid: stranger.uuid, targetKey }, globalThis.game.user),
    /recorded change is not one this use can make/i,
    "the GM relay refuses a receipt entry repointed at another Creature");
  storedEntry.uuid = entryUuid;
  await assert.doesNotReject(
    medicUses.relayedTargetChange(actor, "apply", { useId, targetUuid: entryUuid, targetKey }, globalThis.game.user),
    "the recorded entry itself still applies through the same gate");
}

/* ------------------------------------------------------- W2F-4 validators */

test("R5-W2F4 wardGrant: a repointed grant entry is rejected; the recorded one relays", async () => {
  const actor = medic("R5GrantPin", 15);
  const target = patient("R5 Grant Target");
  const stranger = patient("R5 Grant Stranger");
  const data = { confirmed: true, targetUuid: target.uuid, healingAmount: 6, actionType: "action" };
  const plan = WARD_PLANS.wardGrant(actor, medicUses.state(actor), { ...data });
  await medicUses.command(actor, "wardGrant", data, "r5-grant-use");
  const receipt = medicUses.receipt(actor, "r5-grant-use");
  const entry = receipt.targets.find(change => change.kind === "wardTempPool" && change.key === "ward");
  assert.ok(entry, "fixture: the receipt records the grant pool");
  assert.equal(entry.temp, 6, "fixture: the 6 rolled healing became Ward");

  assertTargetPinned(checksFor("wardGrant", plan), actor, receipt, entry, target, stranger);
  await assertRelayRejectsRepoint(actor, "r5-grant-use", "ward", target.uuid, stranger);
});

test("R5-W2F4 wardLifeSupport: a repointed conversion entry is rejected; the recorded one relays", async () => {
  const actor = medic("R5LsPin", 15);
  const target = patient("R5 LS Target");
  const stranger = patient("R5 LS Stranger");
  const data = { confirmed: true, targetUuid: target.uuid, amount: 6, reading: "lifeSupportToo" };
  const plan = WARD_PLANS.wardLifeSupport(actor, medicUses.state(actor), { ...data, reading: "lifeSupportToo" });
  await medicUses.command(actor, "wardLifeSupport", data, "r5-ls-use");
  const receipt = medicUses.receipt(actor, "r5-ls-use");
  const entry = receipt.targets.find(change => change.kind === "wardTempPool" && change.key === "ward");
  assert.ok(entry, "fixture: the receipt records the Life Support conversion pool");
  assert.equal(entry.temp, 6, "fixture: the 6 Life Support became Ward");

  assertTargetPinned(checksFor("wardLifeSupport", plan), actor, receipt, entry, target, stranger);
  await assertRelayRejectsRepoint(actor, "r5-ls-use", "ward", target.uuid, stranger);
});

test("R5-W2F4 wardRegeneration: a repointed regeneration entry is rejected; the recorded one relays", async () => {
  const actor = medic("R5RegenPin", 15);
  const target = patient("R5 Regen Target");
  const stranger = patient("R5 Regen Stranger");
  const data = { confirmed: true, targetUuid: target.uuid };
  await medicUses.command(actor, "wardRegeneration", data, "r5-regen-use");
  const receipt = medicUses.receipt(actor, "r5-regen-use");
  const entry = receipt.targets.find(change => change.kind === "wardTempPool" && change.key === "ward");
  assert.ok(entry, "fixture: the receipt records the regeneration pool");
  assert.equal(entry.temp, 8, "fixture: half the level-15 Medic's level became Ward");

  const plan = WARD_PLANS.wardRegeneration(actor, medicUses.state(actor), { ...data, confirmed: undefined });
  assertTargetPinned(checksFor("wardRegeneration", plan), actor, receipt, entry, target, stranger);
  await assertRelayRejectsRepoint(actor, "r5-regen-use", "ward", target.uuid, stranger);
});

test("R5-W2F4 reapplyForeignPool: a repointed foreign entry is rejected; the recorded one relays", async () => {
  const actor = medic("R5ForeignPin", 15);
  const target = patient("R5 Foreign Target", 4);
  target.flags.ak5e.ward = { medicUuid: "Actor.ForeignMedic", grantedAt: "r5:foreign", amount: 4, observedTemp: 4 };
  const stranger = patient("R5 Foreign Stranger");
  const foreign = { medicUuid: "Actor.ForeignMedic", grantedAt: "r5:foreign", amount: 4 };
  const data = { confirmed: true, targetUuid: target.uuid, foreign };
  await medicUses.command(actor, "reapplyForeignPool", data, "r5-foreign-use");
  const receipt = medicUses.receipt(actor, "r5-foreign-use");
  const entry = receipt.targets.find(change => change.kind === "wardTempPool" && change.key === "foreign");
  assert.ok(entry, "fixture: the receipt records the foreign pool");
  assert.equal(entry.temp, receipt.result.amount, "fixture: the entry carries the recorded amount");

  const plan = WARD_PLANS.reapplyForeignPool(actor, medicUses.state(actor), { ...data, confirmed: undefined });
  assertTargetPinned(checksFor("reapplyForeignPool", plan), actor, receipt, entry, target, stranger);
  await assertRelayRejectsRepoint(actor, "r5-foreign-use", "foreign", target.uuid, stranger);
});

/* -------------------------------------- W2F-4 sweep: missing record and kind */

test("R5-W2F4 sweep: a temporary-HP entry whose receipt recorded no target never relays", async () => {
  const actor = medic("R5NoRecordPin", 15);
  const target = patient("R5 No Record Target");
  const plan = WARD_PLANS.wardGrant(actor, medicUses.state(actor),
    { confirmed: true, targetUuid: target.uuid, healingAmount: 5, actionType: "action" });
  await medicUses.command(actor, "wardGrant",
    { confirmed: true, targetUuid: target.uuid, healingAmount: 5, actionType: "action" }, "r5-norecord-use");
  const receipt = medicUses.receipt(actor, "r5-norecord-use");
  const entry = receipt.targets[0];
  const noTarget = { ...receipt, result: { ...receipt.result, targetUuid: null } };
  for (const check of checksFor("wardGrant", plan)) {
    assert.equal(check(actor, receipt, entry, target), true, "fixture: the recorded relay passes");
    assert.equal(check(actor, noTarget, entry, target), false,
      "a null recorded target is refused instead of defaulting to the relayed document");
    assert.equal(check(actor, receipt, { ...entry, kind: "damage" }, target), false,
      "a non-temporary-HP entry is never this plan's relay");
    assert.equal(check(actor, receipt, { ...entry, temp: entry.temp + 1 }, target), false,
      "the pool value stays pinned as before (the target binding does not relax it)");
  }
});
