/**
 * Ward runtime regression, round 4 — W2F-1..3 closed with independent tests.
 *
 * Oracle: SPEC-ward.md F7/F8, the Integration contract ("named operations validate
 * source/target/path") and the reviewer notes recorded in .codex-work/medic/DEFERRED.md.
 * Expectations were derived from those documents and the live-budget/settlement contracts,
 * never copied from the candidate bodies.
 *
 *   W2F-1  Warding Surge must read the LIVE Reaction budget: an exhausted budget takes
 *          the readable noReaction warning branch (use anyway, nothing half-spent); an
 *          available budget stays completely clean and spends the Reaction.
 *   W2F-2  The Collective Ward recipient relay value is pinned to the recorded reduced
 *          pool: the recorded value passes; a different temp and a stranger are rejected.
 *   W2F-3  A direct-API donor list containing the same Creature twice is normalised
 *          unique at plan time: one pool, one removal, no phantom duplicate warnings.
 *   Sweep  W2F-2's bug class (a relay accepting an unrecorded payload) also covered the
 *          Warding Surge marker: only the recorded resistance types may be relayed.
 *   Pin+   The Surge marker pin is canonical (unique, nonempty, order-free) and bound to
 *          the recorded target and expiry: duplicate substitution, target repointing,
 *          retimed markers and empty/missing recorded selections are all rejected.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { medicUses } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { getReactions, setReactionStore, flagReactionStore, REACTION_FLAG } from "../scripts/trigger-events.mjs";
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
  setLifeSupport(actor, lifeSupport, "r4 fixture");
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
  target.flags.ak5e.ward = { medicUuid: source.uuid, grantedAt: "r4:grant", amount, observedTemp: amount };
}

const lsOf = actor => actor.flags.ak5e.resourcePools?.lifeSupport?.value ?? 0;
const warningIds = list => (list ?? []).map(warning => warning?.id ?? warning);

/* ------------------------------------------------------------------ W2F-1 */

test("R4-W2F1: an exhausted live Reaction budget takes the readable noReaction warning branch", async () => {
  const actor = medic("R4SurgeExhausted", 11, 60);
  actor.flags.ak5e[REACTION_FLAG] = { max: 1, spent: 1 };
  const target = patient("R4 Surge Target");
  ward(target, actor, 8);
  const data = { targetUuid: target.uuid, damageTypes: ["fire"] };

  const preview = medicUses.preview(actor, "wardingSurge", data);
  const warning = preview.warnings.find(entry => entry.id === "noReaction");
  assert.ok(warning, "an exhausted live budget must surface noReaction (a hardcoded true leaves this branch dead)");
  assert.match(warning.text, /No Reaction remains/,
    "a readable exhausted budget uses the the-table-may-have-a-Reaction branch, not the unreadable-store text");
  assert.doesNotMatch(warning.text, /could not be read/);

  await assert.rejects(
    medicUses.command(actor, "wardingSurge", { ...data, confirmed: true }, "r4-surge-exhausted"),
    error => warningIds(error?.warnings).includes("noReaction"),
    "the unoverridden use is guided, not applied");
  assert.equal(lsOf(actor), 60, "the blocked attempt spent no Life Support");
  assert.equal(medicUses.receipt(actor, "r4-surge-exhausted"), null, "the blocked attempt recorded nothing");

  // Paying 15 LS to restore the Reaction means this use spends none: no noReaction warning,
  // exactly like Treat the Cause's restore path.
  const restorePreview = medicUses.preview(actor, "wardingSurge", { ...data, restoreReaction: true });
  assert.ok(!warningIds(restorePreview.warnings).includes("noReaction"),
    "restoring the Reaction removes the need for an available one");

  await medicUses.command(actor, "wardingSurge",
    { ...data, confirmed: true, overrides: ["noReaction"] }, "r4-surge-override");
  const receipt = medicUses.receipt(actor, "r4-surge-override");
  assert.equal(receipt.reaction?.spent, false, "the override records that no Reaction was actually spent");
  assert.equal(getReactions(actor).available, 0, "an exhausted budget never goes negative");
  assert.equal(lsOf(actor), 50, "the overridden use pays its own Life Support only");
});

test("R4-W2F1: an available live Reaction budget stays clean and spends the Reaction", async () => {
  const actor = medic("R4SurgeAvailable", 11, 100);
  const target = patient("R4 Ready Target");
  ward(target, actor, 8);
  const data = { targetUuid: target.uuid, damageTypes: ["fire"] };

  assert.deepEqual(medicUses.preview(actor, "wardingSurge", data).warnings, [],
    "an available Reaction, a warded target and enough Life Support produce no warnings at all");
  assert.equal(getReactions(actor).available, 1, "the live budget reads available before the use");

  await medicUses.command(actor, "wardingSurge", { ...data, confirmed: true }, "r4-surge-clean");
  const receipt = medicUses.receipt(actor, "r4-surge-clean");
  assert.equal(receipt.reaction?.spent, true, "the live Reaction was spent through the engine");
  assert.equal(getReactions(actor).available, 0, "the shared budget is exhausted after the use");
  assert.equal(lsOf(actor), 90, "the 10 Life Support cost was paid");
  assert.ok((target.flags.ak5e?.wardResist?.types ?? []).includes("fire"), "the Resistance marker is live");
});

/* ------------------------------------------------------------------ W2F-2 */

test("R4-W2F2: the Collective Ward recipient relay value is pinned to the recorded reduced pool", async () => {
  const actor = medic("R4PinRelay", 15);
  const donor = patient("R4 Pin Donor", 8);
  ward(donor, actor, 8);
  const recipient = patient("R4 Pin Recipient", 2);
  ward(recipient, actor, 2);

  await medicUses.command(actor, "collectiveWard", { confirmed: true, targetUuid: recipient.uuid,
    damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 5 } }, "r4-pin-use");
  const receipt = medicUses.receipt(actor, "r4-pin-use");
  const entry = receipt.targets.find(change => change.key === "recipient");
  assert.ok(entry, "the receipt records the recipient pool change");
  assert.equal(receipt.result.recipientTempAfter, 0, "2 existing temp HP absorbed the 5 remaining Damage");
  assert.equal(entry.temp, receipt.result.recipientTempAfter, "the relay entry is the recorded reduced pool");

  // The plan function is what the GM relay reads; the plan object's closure is the in-plan gate.
  const plan = WARD_PLANS.collectiveWard(actor, medicUses.state(actor), {
    targetUuid: recipient.uuid, damage: 10, recipientDistanceFeet: 10,
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }], removals: { [donor.uuid]: 5 }
  });
  for (const check of [WARD_PLANS.collectiveWard.validateTarget, plan.validateTarget]) {
    assert.equal(check(actor, receipt, { ...entry }, recipient), true,
      "the recorded reduced value passes match");
    assert.equal(check(actor, receipt, { ...entry, temp: entry.temp + 1 }, recipient), false,
      "a different temp is not this use (the old temp>=0 check would have accepted it)");
    assert.equal(check(actor, receipt, { ...entry, temp: receipt.result.removed }, recipient), false,
      "the removed donor Ward is never transferred to the recipient");
    assert.equal(check(actor, receipt, { ...entry, uuid: "Actor.stranger" }, recipient), false,
      "a stranger uuid is not the recorded recipient");
  }
});

/* ------------------------------------------------------------------ W2F-3 */

test("R4-W2F3: a direct-API donor double-listing is normalised unique and settles once", async () => {
  const actor = medic("R4Dedup", 15);
  const donor = patient("R4 Dedup Donor", 8);
  ward(donor, actor, 8);
  const recipient = patient("R4 Dedup Recipient", 2);
  ward(recipient, actor, 2);
  const data = {
    confirmed: true, targetUuid: recipient.uuid, damage: 10, recipientDistanceFeet: 10,
    // Direct API: the same Creature twice, with a conflicting second distance.
    donors: [{ uuid: donor.uuid, distanceFeet: 10 }, { uuid: donor.uuid, distanceFeet: 999 }],
    removals: { [donor.uuid]: 5 }
  };

  assert.deepEqual(medicUses.preview(actor, "collectiveWard", data).warnings, [],
    "the phantom duplicate may not produce a donorOutOfRange warning");
  await medicUses.command(actor, "collectiveWard", data, "r4-dedup");

  const receipt = medicUses.receipt(actor, "r4-dedup");
  assert.equal(receipt.result.donorUpdates.length, 1, "one Creature, one donor operation");
  assert.equal(receipt.result.removed, 5, "the Ward was removed once, never twice");
  assert.equal(donor.system.attributes.hp.temp, 3, "the donor pool paid 5 exactly (not 10)");
  assert.equal(receipt.targets.filter(change => change.key?.startsWith("donor-")).length, 1,
    "the receipt records one donor target, not one per listing");
  assert.equal(receipt.result.tempAbsorbed, 2, "the recipient's 2 temp HP absorbed the remaining 2 Damage");
  assert.equal(receipt.result.hpLoss, 3, "settlement used the deduplicated removal (10-5-2)");
});

/* ---------------------------------------------------- W2F-2 sibling sweep */

test("R4-W2F2 sweep: a relayed Warding Surge marker only accepts the recorded resistance types", async () => {
  const actor = medic("R4SurgeRelay", 11);
  const target = patient("R4 Surge Relay Target");
  ward(target, actor, 8);
  await medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
    damageTypes: ["fire", "cold"] }, "r4-surge-relay");
  const receipt = medicUses.receipt(actor, "r4-surge-relay");
  const entry = receipt.targets.find(change => change.kind === "wardResistance");
  assert.ok(entry, "the receipt records the Resistance marker");

  const plan = WARD_PLANS.wardingSurge(actor, medicUses.state(actor),
    { targetUuid: target.uuid, damageTypes: ["fire", "cold"] });
  for (const check of [WARD_PLANS.wardingSurge.validateTarget, plan.validateTarget]) {
    assert.equal(check(actor, receipt, { ...entry }, target), true, "the recorded types pass");
    assert.equal(check(actor, receipt, { ...entry, types: ["cold", "fire"] }, target), true,
      "serialization order does not change the recorded set");
    assert.equal(check(actor, receipt, { ...entry, types: ["force"] }, target), false,
      "a forged Resistance type is not this use");
    assert.equal(check(actor, receipt, { ...entry, types: ["fire"] }, target), false,
      "a narrower recorded set is not the recorded choice either");
    assert.equal(check(actor, receipt, { ...entry, types: "fire" }, target), false,
      "a bare string is not a recorded type list");
  }
});

/* -------------------- W2F-2 sibling sweep: forged Surge marker payloads ----- */

/** Recorded Warding Surge marker plus both relay-entry points (plan function + closure). */
async function surgeMarkerFixture(id) {
  const actor = medic(id, 15);
  const target = patient(`${id} Target`);
  ward(target, actor, 8);
  await medicUses.command(actor, "wardingSurge", { confirmed: true, targetUuid: target.uuid,
    damageTypes: ["fire", "cold"] }, `${id}-use`);
  const receipt = medicUses.receipt(actor, `${id}-use`);
  const entry = receipt.targets.find(change => change.kind === "wardResistance");
  assert.ok(entry, "fixture: the receipt records the Resistance marker");
  assert.deepEqual([...entry.types].sort(), ["cold", "fire"], "fixture: the chosen pair was recorded");
  const plan = WARD_PLANS.wardingSurge(actor, medicUses.state(actor),
    { targetUuid: target.uuid, damageTypes: ["fire", "cold"] });
  return { actor, target, receipt, entry, checks: [WARD_PLANS.wardingSurge.validateTarget, plan.validateTarget] };
}

test("R4-W2F2 sweep: duplicate type substitution is rejected by the Surge marker pin", async () => {
  const { actor, target, receipt, entry, checks } = await surgeMarkerFixture("R4SurgeDup");
  for (const check of checks) {
    assert.equal(check(actor, receipt, { ...entry }, target), true, "fixture: the recorded marker passes");
    assert.equal(check(actor, receipt, { ...entry, types: ["fire", "fire"] }, target), false,
      "['fire','fire'] must not pass for the recorded ['fire','cold'] (length + includes was blind to it)");
    assert.equal(check(actor, receipt, { ...entry, types: ["fire", "cold", "fire"] }, target), false,
      "a duplicated type list is not a canonical set even when its members match");
  }
});

test("R4-W2F2 sweep: a repointed Surge marker target is rejected", async () => {
  const { actor, target, receipt, entry, checks } = await surgeMarkerFixture("R4SurgeRepoint");
  const stranger = patient("R4 Surge Repoint Stranger");
  for (const check of checks) {
    assert.equal(check(actor, receipt, { ...entry, uuid: stranger.uuid }, stranger), false,
      "a marker repointed at another Creature is not the recorded use");
    assert.equal(check(actor, receipt, entry, stranger), false,
      "a resolved document other than the recorded target is not this use");
  }
});

test("R4-W2F2 sweep: an altered Surge marker expiry is rejected", async () => {
  globalThis.game.combat = { started: true, uuid: "Combat.r4surge", round: 1, turn: 0 };
  try {
    const { actor, target, receipt, entry, checks } = await surgeMarkerFixture("R4SurgeExpiry");
    assert.equal(entry.until, "Combat.r4surge:1:0", "fixture: the marker carries the recorded turn key");
    for (const check of checks) {
      assert.equal(check(actor, receipt, { ...entry }, target), true, "fixture: the recorded marker passes");
      assert.equal(check(actor, receipt, { ...entry, until: null }, target), false,
        "null would make the one-Turn marker persistent in the resolver");
      assert.equal(check(actor, receipt, { ...entry, until: `${entry.until}-forged` }, target), false,
        "an expiry other than the recorded turn key is not this use");
    }
  } finally {
    globalThis.game.combat = null;
  }
});

test("R4-W2F2 sweep: an empty recorded Surge selection is rejected", async () => {
  const { actor, target, receipt, entry, checks } = await surgeMarkerFixture("R4SurgeEmptyRecorded");
  for (const check of checks) {
    const emptyRecorded = { ...receipt, result: { ...receipt.result, resistTypes: [] } };
    assert.equal(check(actor, emptyRecorded, { ...entry, types: [] }, target), false,
      "an empty recorded selection is never a relayable Resistance marker");
    const missingRecorded = { ...receipt, result: { ...receipt.result } };
    delete missingRecorded.result.resistTypes;
    assert.equal(check(actor, missingRecorded, { ...entry, types: [] }, target), false,
      "a missing recorded selection must not fall back to an empty list the relay accepts");
  }

  // The input path warns but does not block, so a real empty selection can be recorded.
  const emptyActor = medic("R4SurgeEmpty", 15);
  const emptyTarget = patient("R4 Surge Empty Target");
  ward(emptyTarget, emptyActor, 8);
  await medicUses.command(emptyActor, "wardingSurge",
    { confirmed: true, targetUuid: emptyTarget.uuid, damageTypes: [], overrides: ["damageTypes"] },
    "r4-surge-empty");
  const emptyReceipt = medicUses.receipt(emptyActor, "r4-surge-empty");
  const emptyEntry = emptyReceipt.targets.find(change => change.kind === "wardResistance");
  assert.deepEqual(emptyReceipt.result.resistTypes, [], "fixture: the warn-not-block input records the empty selection");
  assert.equal(emptyEntry.types.length, 0, "fixture: the marker carries no types");
  assert.equal(WARD_PLANS.wardingSurge.validateTarget(emptyActor, emptyReceipt, emptyEntry, emptyTarget), false,
    "a recorded empty selection is refused instead of being relayed");
});
