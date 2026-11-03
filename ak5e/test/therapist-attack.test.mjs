/**
 * Adversarial boundary tests for Wave 2 package E (Therapist runtime).
 * Drafted before implementation; this file is intentionally separate from the
 * frozen behavior suite. Sources/specs are SPEC-therapist.md, SPEC-therapy-rules.md,
 * Chapter 3 C3:4923-5004 and the binding 2026-10-28/2026-11-01 owner rulings.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  THERAPIES, therapyEligibility, validateSelection, activateDoctorIsIn,
  doctorIsInActive, quoteTherapies, riderFor, riderExpired, recuperativeHeal,
  earlyOnsetCheck
} from "../scripts/therapist-rules.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import { artCastOptionsFor, validateArtCastOptions, applyArtCastOptions, undoArtReceipt } from "../scripts/arts-casting.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";
import { appendArtReceipt, appendLinkedReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";

const featureImport = await import("../scripts/therapist-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/therapist-sheet.mjs").catch(error => ({ __loadError: error }));
const HEALING_POOL = "special-art-pool-healing-arts-4211";
let registered = false;

test.before(async () => {
  setupFoundryGlobals({ isGM: false, worldTime: 100, activeGM: null, settings: { "ak5e.artReceiptEpoch": 0 } });
  await registerMedicArts();
  if (typeof featureImport.registerTherapistHooks === "function") {
    await featureImport.registerTherapistHooks();
    registered = true;
  }
});
test.after(() => teardownFoundryGlobals());

function runtime() {
  assert.equal(typeof featureImport.registerTherapistHooks, "function",
    `Therapist runtime absent: registerTherapistHooks() unavailable (${featureImport.__loadError?.code ?? "export unavailable"}: ${featureImport.__loadError?.message ?? ""})`);
  assert.ok(featureImport.THERAPIST_PLANS, "THERAPIST_PLANS is required by the frozen contract");
  assert.equal(typeof sheetImport.renderTherapistSection, "function",
    `Therapist sheet absent: renderTherapistSection() unavailable (${sheetImport.__loadError?.code ?? "export unavailable"}: ${sheetImport.__loadError?.message ?? ""})`);
  assert.equal(typeof sheetImport.handleTherapistCommand, "function", "handleTherapistCommand() is required by the frozen contract");
  assert.equal(registered, true, "therapist hook registration did not run");
}
function medic({ level = 15, lifeSupport = 30, owner = true, id = `therapist-${foundry.utils.randomID(5)}` } = {}) {
  const actor = createTestActor({ id, name: "Adversary Therapist", type: "character", level,
    prof: 2 + Math.floor((level - 1) / 4), owner,
    abilities: { wis: { value: 16, mod: 3 } },
    flags: { ak5e: {
      medic: { enabled: true, spellcastingAbility: "wis" },
      casting: { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" },
      artsPoints: { maximum: 26, value: 26, maximumArtLevel: 8, ninthLevelCast: false },
      resourcePools: { lifeSupport: { value: lifeSupport, max: 125 } }
    } }
  });
  actor.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("therapist-branch", createTestItem({ id: "therapist-branch", type: "subclass", name: "Therapist",
    flags: { ak5e: { chapterThreeId: "subclass-medic-therapist" } } }, actor));
  game.actors.set(actor.id, actor);
  return actor;
}
function healingArt(actor, id = "adversary-healing-art") {
  const item = createTestItem({ id, type: "spell", name: "Healing Art", system: {
    level: 3, activation: { type: "action" }, target: { type: "creature", value: 1 },
    range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" },
    properties: { concentration: true }, description: { value: "Restore Hit Points to one Creature." }
  }, flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function fieldValues(field) {
  return (field?.options ?? []).map(option => Array.isArray(option) ? String(option[0]) : String(option?.value ?? option?.id ?? "")).filter(Boolean);
}
function selectionFor(entry, ids) {
  const remaining = new Set(ids), selection = {};
  for (const field of entry.fields ?? []) {
    const name = String(field.name ?? ""), values = fieldValues(field);
    if (!name) continue;
    const multiple = field.multiple === true || ["multiselect", "checkboxes"].includes(field.type) || /therapies/i.test(name);
    if (multiple && values.length) {
      const chosen = ids.filter(id => values.includes(id));
      if (chosen.length) {
        selection[name] = chosen;
        for (const id of chosen) remaining.delete(id);
      }
    } else {
      const chosen = [...remaining].find(id => values.includes(id));
      if (chosen) {
        selection[name] = field.type === "checkbox" ? true : chosen;
        remaining.delete(chosen);
      } else if ([...remaining].includes(name) && THERAPIES.some(therapy => therapy.id === name)) {
        selection[name] = field.type === "checkbox" ? true : name;
        remaining.delete(name);
      }
    }
  }
  assert.deepEqual([...remaining], [], `Therapist fields cannot represent: ${[...remaining].join(", ")}`);
  return selection;
}
async function optionFor(actor, item) {
  runtime();
  const result = await artCastOptionsFor(actor, item, null, {});
  const entry = result.options.find(value => /therap/i.test(`${value.id} ${value.label}`));
  assert.ok(entry, "no Therapist cast-option provider was registered");
  assert.ok(Array.isArray(entry.fields), "Therapist fields must use the shared native Arts dialog");
  return entry;
}
function warnText(result) {
  return (result?.warnings ?? []).map(value => typeof value === "string" ? value : String(value?.id ?? value?.text ?? value)).join(" ");
}
function errorText(result) {
  return (result?.errors ?? []).map(value => typeof value === "string" ? value : String(value?.id ?? value?.text ?? value)).join(" ");
}
async function activate(actor, id = "empowering", opId = "doctor-attack") {
  runtime();
  return medicUses.command(actor, "doctorIsIn", { confirmed: true, chosenId: id }, opId);
}

// Registration and malformed-input boundaries

test("duplicate hook registration cannot duplicate the cast option or event-driven application", async () => {
  const { registerTherapistHooks } = (runtime(), featureImport);
  await registerTherapistHooks();
  await registerTherapistHooks();
  const actor = medic();
  const item = healingArt(actor);
  const model = await artCastOptionsFor(actor, item, null, {});
  assert.equal(model.options.filter(entry => /therap/i.test(`${entry.id} ${entry.label}`)).length, 1);
});

test("unknown Therapy IDs are malformed input, not a soft eligibility warning or partial update", async () => {
  const actor = medic({ level: 15 });
  const item = healingArt(actor);
  const entry = await optionFor(actor, item);
  const valid = selectionFor(entry, ["empowering"]);
  const fieldName = Object.keys(valid)[0];
  const malformed = { ...valid, [fieldName]: "unknownTherapyId" };
  const before = structuredClone(actor.flags);
  const result = await validateArtCastOptions(actor, item, null, { [entry.id]: malformed });
  assert.ok(warnText(result).length > 0, "the shared cast validator must surface the provider's malformed-input rejection");
  assert.throws(() => validateSelection({ selection: ["unknownTherapyId"], medicLevel: 15, doctorIsIn: null }), /Unknown Therapy/,
    "the pure rules layer throws for malformed input rather than inventing an eligibility warning");
  assert.deepEqual(actor.flags, before);
});

test("out-of-tier, target, and resource prerequisites stay overridable warnings", async () => {
  const actor = medic({ level: 10, lifeSupport: 0 });
  const item = healingArt(actor);
  const entry = await optionFor(actor, item);
  const selection = selectionFor(entry, ["cleansing"]);
  const result = entry.provider.validate(selection);
  assert.ok(warnText(result).length > 0);
  assert.equal(errorText(result), "");
  const rules = therapyEligibility("cleansing", { targetCount: 2, restoresHP: false });
  assert.equal(rules.eligible, false);
  assert.ok(rules.warnings.includes("notSingleTarget") && rules.warnings.includes("noHealing"));
});

// Native cast accounting and adversarial resource composition

test("Therapy consumption composes with a pending Life Support gain/spend and clamps shortfalls at zero", async () => {
  const actor = medic({ level: 15, lifeSupport: 4 });
  const item = healingArt(actor);
  const entry = await optionFor(actor, item);
  const selection = selectionFor(entry, ["empowering"]);
  const usage = { ak5eOptions: { [entry.id]: selection } };
  const updates = { actor: { "flags.ak5e.resourcePools.lifeSupport.value": 9, "flags.ak5e.artsPoints.value": 23 } };
  const receipt = { id: "cast-composed", cost: 3, name: item.name };
  applyArtCastOptions({ actor, item }, usage, updates, receipt);
  assert.equal(updates.actor["flags.ak5e.resourcePools.lifeSupport.value"], 4,
    "the Therapy cost must apply to the pending value (9), not overwrite it from the Actor snapshot (4)");
  assert.equal(updates.actor["flags.ak5e.artsPoints.value"], 23, "Therapist must preserve another cast consumer's AP update");
  assert.deepEqual(receipt.options?.[entry.id], selection, "the exact selection belongs on the cast receipt");

  actor.flags.ak5e.resourcePools.lifeSupport.value = 0;
  const shortfallUpdates = { actor: {} };
  const shortfallReceipt = { id: "cast-shortfall", cost: 0 };
  applyArtCastOptions({ actor, item }, usage, shortfallUpdates, shortfallReceipt);
  assert.ok(Object.values(shortfallUpdates.actor).every(value => typeof value !== "number" || value >= 0),
    "overspending clamps at zero, never negative");
});

test("a final zero-AP cast creates no concentrated healing package; discounts cannot be inferred from Art level", async () => {
  const actor = medic({ level: 15 });
  const item = healingArt(actor);
  await activate(actor, "empowering", "doctor-zero-ap");
  const entry = await optionFor(actor, item);
  const selection = selectionFor(entry, ["energising"]);
  const receipt = { id: "final-ap-zero", cost: 0, level: 3 };
  const updates = { actor: {} };
  applyArtCastOptions({ actor, item }, { ak5eOptions: { [entry.id]: selection } }, updates, receipt);
  assert.doesNotMatch(JSON.stringify(receipt), /[1-9]d6/i, "the source adds 1d6 per actual AP, not per nominal Art level");
});

test("Urgency and Therapist Life Support costs compose in one pending cast", async () => {
  runtime();
  const actor = medic({ level: 9, lifeSupport: 50 });
  actor.items.set("focus", createTestItem({ id: "focus", type: "weapon", name: "Arts Wand",
    system: { equipped: true }, flags: { ak5e: { tableData: { properties: "Casting Unit" } } } }, actor));
  const item = healingArt(actor);
  const model = await artCastOptionsFor(actor, item, null, {});
  const therapist = model.options.find(entry => /therap/i.test(`${entry.id} ${entry.label}`));
  assert.ok(therapist, "Therapist provider missing");
  const urgency = model.options.find(entry => /urgency/i.test(`${entry.id} ${entry.label}`));
  assert.ok(urgency, "the fixture must expose the existing Urgency of Treatment option");
  const usage = { ak5eOptions: {
    [therapist.id]: selectionFor(therapist, ["empowering"]),
    [urgency.id]: { lifeSupport: 20 }
  } };
  const available = await import("../scripts/arts-casting.mjs");
  const quote = available.artAvailability(actor, item, usage).quote;
  assert.equal(quote.lifeSupportCost, 25, "Urgency's 20 and Therapist's 5 Life Support costs must both survive composition");
});

// Persistent feature state, operation replay, and encounter windows

test("same Doctor Is In operation ID is idempotent under retry", async () => {
  const actor = medic({ level: 15 });
  const useId = "doctor-retry-id";
  const first = await activate(actor, "empowering", useId);
  const afterFirst = structuredClone(medicUses.state(actor));
  const retry = await activate(actor, "empowering", useId);
  assert.deepEqual(medicUses.state(actor), afterFirst, "retry must not add a second use or allowance");
  assert.deepEqual(retry, first);
  assert.equal(medicUses.uses(actor).filter(entry => entry.id === useId).length, 1);
});

test("Doctor Is In expires at the exact 60-second boundary while unused level-15 allowance persists", () => {
  const state = activateDoctorIsIn({ chosenId: "empowering", worldTime: 100, medicLevel: 15, state: null });
  assert.equal(doctorIsInActive(state, 159.999), true);
  assert.equal(doctorIsInActive(state, 160), false);
  const quote = quoteTherapies({ selection: ["empowering", "energising"], art: {
    targetCount: 1, rangeFeet: 30, rangeTouch: false, durationSeconds: 60, concentration: false,
    restoresHP: true, apSpent: 2, levelled: true
  }, state, worldTime: 160, lifeSupport: 0 });
  assert.equal(quote.items[0].free, null, "chosen Therapy's minute has ended");
  assert.equal(quote.items[1].free, "concentrated", "unspent allowance survives the minute");
  assert.deepEqual(quote.healingPackages, [{ therapyId: "energising", formula: "2d6" }]);
});

test("a later 15th-level Doctor Is In activation replaces a partially spent allowance", () => {
  const previous = { doctorIsIn: { chosenId: "empowering", expiresAt: 160 }, concentratedAllowance: 1 };
  const activated = activateDoctorIsIn({ chosenId: "energising", worldTime: 200, medicLevel: 15, state: previous });
  assert.equal(activated.concentratedAllowance, 3, "replacement is three, not the prior remainder plus three");
  assert.equal(activated.doctorIsIn.chosenId, "energising");
});

test("an encounter lock prevents undoing a Therapist child even if the child was recorded later", async () => {
  runtime();
  const actor = medic({ level: 15 });
  const parentChanges = captureArtChanges(actor, { "flags.ak5e.artsPoints.value": 23 });
  const parent = appendArtReceipt(actor, { id: "therapist-locked-parent", cost: 3, name: "Healing Art" }, parentChanges)[0];
  await actor.update({ "flags.ak5e.artsPoints.value": 23, "flags.ak5e.artReceipts": [parent] });
  game.settings.set("ak5e", "artReceiptEpoch", 1);
  const changes = [{ path: "flags.ak5e.resourcePools.lifeSupport.value", before: 30, after: 25 }];
  await actor.update({ "flags.ak5e.resourcePools.lifeSupport.value": 25 });
  await appendLinkedReceipt(actor, parent.id, { id: "therapist-locked-child", name: "Therapy rider" }, changes);
  await assert.rejects(undoArtReceipt(actor, "therapist-locked-child"), /lock|window/i);
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 25);
});

// Correlated events, hostile applications, saves, and turn anchors

test("Recuperative does not heal a non-hostile, zero, wrong-target, or replayed damage application", () => {
  const rider = riderFor("recuperative", { spellMod: 3, art: { targetCount: 1 }, castId: "cast-hostile",
    casterUuid: "Actor.medic", targetUuids: ["Actor.patient"], worldTime: 100 });
  let seen = [];
  for (const application of [
    { id: "friendly", targetUuid: "Actor.patient", hostile: false, amount: 8 },
    { id: "zero", targetUuid: "Actor.patient", hostile: true, amount: 0 },
    { id: "other-target", targetUuid: "Actor.other", hostile: true, amount: 8 }
  ]) {
    const result = recuperativeHeal(rider, application, seen);
    assert.equal(result.heal, 0);
    seen = result.seen;
  }
  const first = recuperativeHeal(rider, { id: "hostile-1", targetUuid: "Actor.patient", hostile: true, amount: 8 }, seen);
  const replay = recuperativeHeal(rider, { id: "hostile-1", targetUuid: "Actor.patient", hostile: true, amount: 8 }, first.seen);
  assert.equal(first.heal, 3);
  assert.equal(replay.heal, 0);
});

test("separate committed hostile damage application IDs each trigger one Recuperative healing", () => {
  const rider = riderFor("recuperative", { spellMod: 4, art: { targetCount: 1 }, castId: "cast-parts",
    casterUuid: "Actor.medic", targetUuids: ["Actor.patient"], worldTime: 100 });
  let result = recuperativeHeal(rider, { id: "application-combined-parts", targetUuid: "Actor.patient", hostile: true, amount: 18 }, []);
  assert.equal(result.heal, 4, "combined damage parts in one application heal once");
  result = recuperativeHeal(rider, { id: "application-next-hit", targetUuid: "Actor.patient", hostile: true, amount: 1 }, result.seen);
  assert.equal(result.heal, 4, "a separately applied hit is a distinct application");
});

test("automatic-pass riders distinguish qualifying abilities and Arts saves without starting any Roll", async () => {
  runtime();
  const originalRoll = globalThis.Roll;
  let constructed = 0;
  globalThis.Roll = class SpyRoll { constructor() { constructed++; } };
  try {
    const rider = riderFor("psychological", { spellMod: 2, art: { targetCount: 1, restoresHP: true }, castId: "cast-pass",
      casterUuid: "Actor.medic", targetUuids: ["Actor.patient"], worldTime: 100 });
    assert.deepEqual(rider.abilities, ["int", "wis", "cha"]);
    assert.equal(riderExpired(rider, { casterTurnStarted: false }), false);
    assert.equal(riderExpired(rider, { casterTurnStarted: true }), true);
    assert.equal(constructed, 0, "a save pass is confirmed by its owner, never rolled by the module");
  } finally { globalThis.Roll = originalRoll; }
});

test("Early Onset rejects bad target/visibility/timing as warnings and does not spend a Reaction during preview", () => {
  runtime();
  const warnings = earlyOnsetCheck({ castingTime: "minute", targetUuids: ["Actor.wrong"], damagedUuid: "Actor.patient",
    damagedIsAlly: true, canSee: false, usesRemaining: 1 }).warnings;
  assert.deepEqual(warnings, ["castingTimeNotActionOrBonus", "mustTargetDamaged", "notVisible"]);
  const actor = medic({ level: 7 });
  const before = getReactions(actor).available;
  assert.equal(getReactions(actor).available, before);
  assert.equal(medicUses.isCommand("earlyOnset"), true);
});

test("unknown source/save context is guided instead of silently treated as hostile or qualifying", () => {
  const noTarget = therapyEligibility("recuperative", { targetCount: null });
  assert.deepEqual(noTarget, { eligible: null, warnings: ["unknownTargets"] });
  const noRange = therapyEligibility("longDistance", { rangeFeet: null, rangeTouch: false });
  assert.deepEqual(noRange, { eligible: null, warnings: ["unknownRange"] });
  const saveRider = riderFor("resistance", { spellMod: 2, art: { targetCount: 3 }, castId: "cast-resist",
    casterUuid: "Actor.medic", targetUuids: ["Actor.one", "Actor.two", "Actor.three"], worldTime: 100 });
  assert.equal(saveRider.against, "arts");
  assert.equal(saveRider.uses, null, "the rule is not silently restricted to one save");
});
