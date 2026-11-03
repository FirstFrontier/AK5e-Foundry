/**
 * Therapist package E regressions for the independent-review findings (2026-11-01).
 * These target the three majors and two minors; they are written against the lane production
 * modules and the shared frozen fixtures. They are delivered outside the lane because lane
 * ownership covers only ak5e/scripts/therapist-features.mjs and therapist-sheet.mjs.
 *
 * Freeze target: ak5e/test/therapist-regression.test.mjs (tester owns the test files).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import { applyArtCastOptions } from "../scripts/arts-casting.mjs";
import { appendArtReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";
import { riderRecords } from "../scripts/trigger-events.mjs";
import {
  registerTherapistHooks, syncTherapistCast, therapistRiders, therapistState, THERAPIST_FLAG_PATH
} from "../scripts/therapist-features.mjs";

const HEALING_POOL = "special-art-pool-healing-arts-4211";
const THERAPY = "therapist-therapy";

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 100, activeGM: null, settings: { "ak5e.artReceiptEpoch": 0 } });
  await registerMedicArts();
  await registerTherapistHooks();
});
test.after(() => teardownFoundryGlobals());

function medic({ level = 15, owner = true, id = `therapist-reg-${foundry.utils.randomID(6)}`, lifeSupport = 125 } = {}) {
  const actor = createTestActor({ id, name: "Regression Therapist", type: "character", level,
    prof: 2 + Math.floor((level - 1) / 4), owner,
    abilities: { wis: { value: 16, mod: 3 }, int: { value: 12, mod: 1 }, cha: { value: 10, mod: 0 } },
    flags: { ak5e: {
      medic: { enabled: true, spellcastingAbility: "wis" },
      casting: { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" },
      artsPoints: { maximum: 26, value: 26, maximumArtLevel: 8, ninthLevelCast: false },
      resourcePools: { lifeSupport: { value: lifeSupport, max: 125 } }
    } } });
  actor.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic",
    system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("therapist-branch", createTestItem({ id: "therapist-branch", type: "subclass", name: "Therapist",
    flags: { ak5e: { chapterThreeId: "subclass-medic-therapist" } } }, actor));
  return actor;
}
function healingArt(actor, { id = "regression-healing-art", level = 3 } = {}) {
  const item = createTestItem({ id, type: "spell", name: "Field Dressing", system: {
    level, activation: { type: "action" }, target: { type: "creature", value: 1 },
    range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" },
    properties: { concentration: true }, description: { value: "Restore Hit Points to one Creature." }
  }, flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function ally({ owner = true, id = `therapy-ally-${foundry.utils.randomID(6)}` } = {}) {
  const actor = createTestActor({ id, name: "Therapy Ally", type: "npc", owner,
    flags: { ak5e: { therapistRegressionAlly: true } } });
  game.actors.set(actor.id, actor);
  return actor;
}
const cardMessages = () => Array.from(game.messages ?? []).filter(message => message.flags?.ak5e?.therapistCard === undefined && message.getFlag?.("ak5e", "therapistCard"));
const allMessages = () => Array.from(game.messages ?? []);

/* ---------------------------------------------------------------- MAJOR-1 */

test("MAJOR-1: Early Onset stores the live use count, so five overridden uses store five", async () => {
  const actor = medic({ level: 7, id: "early-onset-count" });
  game.actors.set(actor.id, actor);
  const base = { castingTime: "action", damagedUuid: "Actor.patient", requiredTargetUuid: "Actor.patient",
    targetUuids: ["Actor.patient"], damagedIsAlly: true, canSee: true };
  for (let index = 1; index <= 5; index += 1) {
    const data = { ...base, triggerEventId: `hitTaken:regression-${index}` };
    const overrides = medicUses.preview(actor, "earlyOnset", data).warnings.map(warning => warning.id);
    await medicUses.command(actor, "earlyOnset", { confirmed: true, ...data, overrides }, `early-onset-${index}`);
    assert.equal(therapistState(actor).earlyOnsetUsed, index, `after ${index} uses the stored count is ${index}`);
  }
  const data = { ...base, triggerEventId: "hitTaken:regression-6" };
  await medicUses.command(actor, "earlyOnset", { confirmed: true, ...data,
    overrides: medicUses.preview(actor, "earlyOnset", data).warnings.map(warning => warning.id) }, "early-onset-6");
  assert.equal(therapistState(actor).earlyOnsetUsed, 6, "a sixth overridden use continues from the stored count");
  assert.equal(therapistState(actor).earlyOnsetPending.requiredTargetUuid, "Actor.patient");
});

/* ---------------------------------------------------------------- MAJOR-2 */

test("MAJOR-2: a free Therapy on a healing Art delivers its 1d6-per-AP package as an owner-rolled rider and control", async () => {
  const actor = medic({ id: "package-cast" });
  const target = ally({ id: "package-ally" });
  game.actors.set(actor.id, actor);
  const item = healingArt(actor);
  // The Doctor Is In supplies the concentrated allowance.
  await medicUses.command(actor, "doctorIsIn", { confirmed: true, chosenId: "empowering" }, "package-doctor");
  const receipt = { id: "package-cast-receipt", itemId: item.id, cost: 3, level: 3, name: item.name };
  const updates = { actor: {} };
  const warnings = applyArtCastOptions({ actor, item }, { ak5eOptions: { [THERAPY]: { therapy: "energising" } } }, updates, receipt);
  assert.deepEqual(warnings, []);
  assert.deepEqual(receipt.therapist.healingPackages, [{ therapyId: "energising", formula: "3d6" }],
    "the quote records the final-AP package");

  const OriginalRoll = globalThis.Roll;
  let constructed = 0;
  globalThis.Roll = class SpyRoll { constructor() { constructed += 1; } };
  try {
    const parentChanges = captureArtChanges(actor, updates.actor ?? {});
    const parent = appendArtReceipt(actor, receipt, parentChanges)[0];
    await actor.update({ ...(updates.actor ?? {}), "flags.ak5e.artReceipts": [parent] });

    const result = await syncTherapistCast(actor, receipt, [target.uuid]);
    assert.equal(constructed, 0, "delivery never starts a die; only the owner's click rolls");
    assert.deepEqual(result.riders, ["therapist:package:package-cast-receipt:0:0"]);

    const records = riderRecords(target);
    const pkg = records.find(record => record.id === "therapist:package:package-cast-receipt:0:0");
    assert.ok(pkg, "the package is registered as a durable rider");
    assert.equal(pkg.effectRef.package, true);
    assert.equal(pkg.effectRef.rider.formula, "3d6");
    assert.equal(pkg.effectRef.rider.kind, "healPackage");

    const listed = therapistRiders(target).find(rider => rider.id === pkg.id);
    assert.ok(listed, "the panel lists the pending package");
    assert.equal(listed.package, true);
    assert.equal(listed.expired, false, "a package is spent by its roll, not by the minute timer");

    const card = allMessages().find(message => String(message.content).includes('data-ak5e-therapist-package="3d6"'));
    assert.ok(card, "a public card carries the explicit package roll control");
    assert.match(String(card.content), /Roll 3d6 for Therapy Ally/);
    assert.equal(card.getFlag?.("ak5e", "therapistCard")?.castId, receipt.id, "the package card belongs to the cast receipt");

    const riderUse = medicUses.state(actor).undo.find(entry => entry.command === "therapistRider");
    assert.equal(riderUse.status, "complete");
    assert.notEqual(riderUse.targets[0].relayed, true, "a writable target is applied directly by the use");
  } finally { globalThis.Roll = OriginalRoll; }
});

/* ---------------------------------------------------------------- MAJOR-3 */

test("MAJOR-3: an unowned target's rider goes through the Medic relay instead of a local ownership skip", async () => {
  const actor = medic({ id: "relay-cast" });
  const target = ally({ owner: false, id: "relay-ally-unowned" });
  game.actors.set(actor.id, actor);
  const receipt = { id: "relay-cast-receipt", cost: 3, name: "Field Dressing" };
  const parent = appendArtReceipt(actor, receipt, [])[0];
  await actor.update({ "flags.ak5e.artReceipts": [parent] });
  // The cast itself used a Therapy with a rider.
  const current = actor.getFlag("ak5e", "lastArtCast") ?? {};
  const options = { ...(current.options ?? {}), [THERAPY]: { therapy: "empowering", secondaryTherapy: "none" } };
  await actor.update({ "flags.ak5e.lastArtCast": { ...receipt, options } });

  const result = await syncTherapistCast(actor, { ...receipt, options }, [target.uuid]);
  assert.deepEqual(result.riders.length, 1, "the rider is still recorded for the cast");

  const riderUse = medicUses.state(actor).undo.find(entry => entry.command === "therapistRider");
  assert.ok(riderUse, "a Therapist rider use is recorded even with no GM connected");
  assert.equal(riderUse.status, "pending", "without a GM the relayed change stays retryable, never silently dropped");
  assert.match(String(riderUse.lastError ?? ""), /no GM/i);
  assert.deepEqual(riderRecords(target), [], "nothing is written on a Creature this client cannot write");
  assert.deepEqual(riderUse.targets.map(entry => entry.uuid), [target.uuid], "the unowned target stays on the recorded use");
  const pendingCard = allMessages().find(message => /not recorded yet/.test(String(message.content)));
  assert.ok(pendingCard, "the table is told the rider is pending");
  assert.equal(pendingCard.getFlag?.("ak5e", "therapistCard")?.castId, receipt.id);
});

/* ---------------------------------------------------------------- MINOR-3 */

test("MINOR-3: an Advanced Therapy forced below level 11 is a warning on the plan, matching the sheet gate", async () => {
  const actor = medic({ level: 10, id: "cleansing-level" });
  game.actors.set(actor.id, actor);
  const preview = medicUses.preview(actor, "therapistCleansing", { conditionId: "effect-1", targetUuid: null });
  assert.ok(preview.warnings.some(warning => warning.text.includes("Advanced Therapy")), "the level is a visible warning");
  const high = medic({ level: 11, id: "cleansing-level-11" });
  game.actors.set(high.id, high);
  const highPreview = medicUses.preview(high, "therapistCleansing", { conditionId: "effect-1", targetUuid: null });
  assert.ok(!highPreview.warnings.some(warning => warning.text.includes("Advanced Therapy")));
});

/* ---------------------------------------------------------------- MINOR-1 */

test("MINOR-1: a no-target cast still ties its guidance card to the cast receipt", async () => {
  const actor = medic({ id: "no-target-cast" });
  game.actors.set(actor.id, actor);
  const receipt = { id: "no-target-receipt", cost: 3, name: "Field Dressing" };
  const parent = appendArtReceipt(actor, receipt, [])[0];
  await actor.update({ "flags.ak5e.artReceipts": [parent] });
  await syncTherapistCast(actor, { ...receipt, options: { [THERAPY]: { therapy: "empowering" } } }, []);
  const card = allMessages().find(message => /recorded no target/.test(String(message.content)));
  assert.ok(card, "the guidance is posted");
  assert.equal(card.getFlag?.("ak5e", "therapistCard")?.castId, receipt.id, "it names the cast it belongs to");
});
