/**
 * Frozen acceptance tests for Wave 2 package E (Therapist runtime).
 * Spec: .codex-work/medic/SPEC-therapist.md + SPEC-therapy-rules.md.
 * Source authority: AK5e 1st Ed. v1.3.1, Chapter 3 C3:4560-5146,
 * especially Therapist C3:4923-5004; owner rulings 2026-10-28 and 2026-11-01.
 * Drafted before therapist-features.mjs / therapist-sheet.mjs exist. Do not weaken
 * these expectations to make an implementation pass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  THERAPIES, therapyEligibility, validateSelection, activateDoctorIsIn,
  quoteTherapies, riderFor, riderExpired, recuperativeHeal, earlyOnsetCheck,
  earlyOnsetUses
} from "../scripts/therapist-rules.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";
import { registerMedicArts } from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import {
  artCastOptionsFor, validateArtCastOptions, applyArtCastOptions, artAvailability, undoArtReceipt
} from "../scripts/arts-casting.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";
import { appendArtReceipt, appendLinkedReceipt, captureArtChanges } from "../scripts/arts-ledger.mjs";

const featureImport = await import("../scripts/therapist-features.mjs").catch(error => ({ __loadError: error }));
const sheetImport = await import("../scripts/therapist-sheet.mjs").catch(error => ({ __loadError: error }));
const ALL_IDS = THERAPIES.map(entry => entry.id);
const HEALING_POOL = "special-art-pool-healing-arts-4211";
let globals;
let registered = false;

test.before(async () => {
  globals = setupFoundryGlobals({ isGM: false, worldTime: 100, settings: { "ak5e.artReceiptEpoch": 0 } });
  await registerMedicArts();
  if (typeof featureImport.registerTherapistHooks === "function") {
    await featureImport.registerTherapistHooks();
    registered = true;
  }
});
test.after(() => teardownFoundryGlobals());

function requireFeatures() {
  assert.equal(typeof featureImport.registerTherapistHooks, "function",
    `Therapist runtime missing registerTherapistHooks() (${featureImport.__loadError?.code ?? "export unavailable"}: ${featureImport.__loadError?.message ?? ""})`);
  assert.ok(featureImport.THERAPIST_PLANS && typeof featureImport.THERAPIST_PLANS === "object",
    "Therapist runtime missing THERAPIST_PLANS");
  return featureImport;
}
function requireSheet() {
  assert.equal(typeof sheetImport.renderTherapistSection, "function",
    `Therapist sheet module missing renderTherapistSection() (${sheetImport.__loadError?.code ?? "export unavailable"}: ${sheetImport.__loadError?.message ?? ""})`);
  assert.equal(typeof sheetImport.handleTherapistCommand, "function",
    "Therapist sheet module missing handleTherapistCommand()");
  return sheetImport;
}
function requireRegistration() {
  requireFeatures();
  assert.equal(registered, true, "registerTherapistHooks() was not called in the fixture");
}
function medic({ level = 15, lifeSupport = 125, owner = true, name = "Therapist Fixture" } = {}) {
  const actor = createTestActor({ name, type: "character", level, prof: 2 + Math.floor((level - 1) / 4), owner,
    abilities: { wis: { value: 16, mod: 3 }, int: { value: 12, mod: 1 }, cha: { value: 10, mod: 0 } },
    flags: { ak5e: {
      medic: { enabled: true, spellcastingAbility: "wis" },
      casting: { enabled: true, ability: "wis", recovery: "long", castingUnit: "focus" },
      artsPoints: { maximum: 26, value: 26, maximumArtLevel: 8, ninthLevelCast: false },
      resourcePools: { lifeSupport: { value: lifeSupport, max: 125 } }
    } }
  });
  actor.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic",
    system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-medic" } } }, actor));
  actor.items.set("therapist-branch", createTestItem({ id: "therapist-branch", type: "subclass", name: "Therapist",
    flags: { ak5e: { chapterThreeId: "subclass-medic-therapist" } } }, actor));
  game.actors.set(actor.id, actor);
  return actor;
}
function healingArt(actor, { id = "healing-art", level = 1, description = "Restore Hit Points to one Creature." } = {}) {
  const item = createTestItem({ id, type: "spell", name: "Field Dressing", system: {
    level, activation: { type: "action" }, target: { type: "creature", value: 1 },
    range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" },
    properties: { concentration: true }, description: { value: description }
  }, flags: { ak5e: { art: { enabled: true, pool: HEALING_POOL }, pool: HEALING_POOL } } }, actor);
  actor.items.set(item.id, item);
  return item;
}
function valuesForField(field) {
  return (field?.options ?? []).map(option => Array.isArray(option) ? String(option[0]) :
    String(option?.value ?? option?.id ?? "")).filter(Boolean);
}
function assertTherapyRuntimeFieldContract(entry) {
  assert.ok(entry && typeof entry === "object", "native cast dialog omitted the Therapist option provider");
  assert.ok(Array.isArray(entry.fields), "Therapist cast option must publish native dialog fields");
  assert.equal(typeof entry.provider?.validate, "function", "Therapist option must validate selections through the shared cast path");
  assert.equal(typeof entry.provider?.quote, "function", "Therapist option must quote Life Support and free allowances");
  assert.equal(typeof entry.provider?.consume, "function", "Therapist option must join the native cast's consumption update");
}
async function therapistOption(actor, item, usage = {}) {
  requireRegistration();
  const model = await artCastOptionsFor(actor, item, null, { usage });
  const option = model.options.find(entry => /therap/i.test(`${entry.id} ${entry.label}`));
  assertTherapyRuntimeFieldContract(option);
  return { option, model };
}
function selectionFor(entry, therapyIds) {
  const remaining = new Set(therapyIds);
  const selection = {};
  for (const field of entry.fields) {
    const name = String(field.name ?? "");
    if (!name) continue;
    const fieldValues = valuesForField(field);
    const supportsMultiple = field.multiple === true || field.type === "multiselect" || field.type === "checkboxes" || /therapies/i.test(name);
    if (supportsMultiple && fieldValues.length) {
      const selected = therapyIds.filter(id => fieldValues.includes(id));
      if (selected.length) {
        selection[name] = selected;
        for (const id of selected) remaining.delete(id);
      }
      continue;
    }
    const choice = [...remaining].find(id => fieldValues.includes(id));
    if (choice) {
      selection[name] = field.type === "checkbox" ? true : choice;
      remaining.delete(choice);
      continue;
    }
    if (ALL_IDS.includes(name) && remaining.has(name)) {
      selection[name] = field.type === "checkbox" ? true : name;
      remaining.delete(name);
    }
  }
  assert.deepEqual([...remaining], [], `native Therapist fields cannot represent selected Therapies: ${[...remaining].join(", ")}`);
  return selection;
}
function warningText(result) {
  return (result?.warnings ?? []).map(value => typeof value === "string" ? value :
    String(value?.id ?? value?.code ?? value?.text ?? value)).join(" ");
}
async function activateDoctor(actor, chosenId = "empowering", useId = "doctor-use-1") {
  requireRegistration();
  return medicUses.command(actor, "doctorIsIn", { confirmed: true, chosenId }, useId);
}
async function castOption(actor, item, ids, usagePatch = {}) {
  const { option } = await therapistOption(actor, item, { ...usagePatch });
  const selection = selectionFor(option, ids);
  return { option, selection };
}

// E1 · catalogue, native casting dialog and advisory eligibility

test("E1: runtime exports the approved plan registry and registers Doctor Is In and Early Onset", () => {
  const { THERAPIST_PLANS, registerTherapistHooks } = requireFeatures();
  assert.equal(typeof registerTherapistHooks, "function");
  assert.equal(typeof THERAPIST_PLANS.doctorIsIn, "function");
  assert.equal(typeof THERAPIST_PLANS.earlyOnset, "function");
  assert.equal(medicUses.isCommand("doctorIsIn"), true);
  assert.equal(medicUses.isCommand("earlyOnset"), true);
});

test("E1: registering twice is idempotent and produces one native cast option", async () => {
  const { registerTherapistHooks } = requireFeatures();
  await registerTherapistHooks();
  await registerTherapistHooks();
  const actor = medic();
  const item = healingArt(actor);
  const { model } = await therapistOption(actor, item);
  assert.equal(model.options.filter(entry => /therap/i.test(`${entry.id} ${entry.label}`)).length, 1);
});

test("E1: all nine Therapy choices and their printed Life Support costs appear in the native dialog", async () => {
  const actor = medic({ level: 10 });
  const item = healingArt(actor);
  const { option } = await therapistOption(actor, item);
  const text = JSON.stringify(option.fields);
  for (const therapy of THERAPIES) {
    assert.match(text, new RegExp(therapy.id, "i"), `${therapy.id} is selectable`);
    assert.match(text, new RegExp(therapy.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${therapy.name} is named`);
    assert.match(text, new RegExp(`\\b${therapy.lifeSupportCost}\\b`), `${therapy.name} shows ${therapy.lifeSupportCost} Life Support`);
  }
});

test("E1: a locked or ineligible Therapy is a visible warning, not a cast-blocking error", async () => {
  const actor = medic({ level: 10 });
  const item = healingArt(actor, { description: "A hostile Art that does not restore Hit Points and affects an area." });
  const { option } = await therapistOption(actor, item);
  const selection = selectionFor(option, ["cleansing"]);
  const result = option.provider.validate(selection);
  assert.ok(warningText(result).length > 0, "advanced level and healing/target prerequisites must be reported");
  assert.deepEqual(result?.errors ?? [], [], "rule prerequisites remain overridable warnings");
});

// E2 · multi-selection and Life Support quoting

test("E2: one Therapy is the normal limit; two distinct choices are valid only while Doctor Is In is active", async () => {
  const actor = medic({ level: 4 });
  const item = healingArt(actor);
  const { option } = await therapistOption(actor, item);
  const two = selectionFor(option, ["empowering", "energising"]);
  const inactive = option.provider.validate(two);
  assert.match(warningText(inactive), /tooManyTherapies|two|one Therapy/i);
  const activeActor = medic({ level: 4 });
  const activeItem = healingArt(activeActor);
  await activateDoctor(activeActor, "empowering", "doctor-use-active");
  const { option: activeOption } = await therapistOption(activeActor, activeItem);
  assert.deepEqual(activeOption.provider.validate(selectionFor(activeOption, ["empowering", "energising"]))?.errors ?? [], []);
  assert.doesNotMatch(warningText(activeOption.provider.validate(selectionFor(activeOption, ["empowering", "energising"]))), /tooManyTherapies/);
});

test("E2: the chosen free Therapy counts toward the two-distinct-choice limit", async () => {
  const actor = medic({ level: 4 });
  const item = healingArt(actor);
  await activateDoctor(actor, "empowering", "doctor-chosen-count");
  const { option } = await therapistOption(actor, item);
  assert.deepEqual(option.provider.validate(selectionFor(option, ["empowering", "energising"]))?.errors ?? [], []);
  assert.doesNotMatch(warningText(option.provider.validate(selectionFor(option, ["empowering", "energising"]))), /tooManyTherapies/);
  assert.deepEqual(validateSelection({ selection: ["empowering", "energising"], medicLevel: 4,
    doctorIsIn: { active: true, chosenId: "empowering" } }), { warnings: [] });
  assert.ok(validateSelection({ selection: ["empowering", "empowering"], medicLevel: 4,
    doctorIsIn: { active: true, chosenId: "empowering" } }).warnings.includes("duplicateTherapy"));
});

test("E2: selected Life Support costs are summed in order and shortfalls clamp at zero", async () => {
  const actor = medic({ level: 4, lifeSupport: 5 });
  const item = healingArt(actor);
  const { option, selection } = await castOption(actor, item, ["empowering", "energising"]);
  const quote = option.provider.quote(selection);
  const expected = quoteTherapies({ selection: ["empowering", "energising"], art: {
    targetCount: 1, rangeFeet: 30, rangeTouch: false, durationSeconds: 60, concentration: true,
    restoresHP: true, apSpent: 0, levelled: true
  }, state: null, worldTime: game.time.worldTime, lifeSupport: 5 });
  assert.equal(quote.lifeSupportCost, expected.lifeSupportCost);
  assert.equal(quote.lifeSupportAfter, 0);
  assert.equal(quote.shortfall, 5);
});

// E3 · confirmation, cancellation, and persistent Doctor Is In state

test("E3: opening the branch control is read-only; unrelated commands return false", async () => {
  const sheet = requireSheet();
  const actor = medic({ level: 15, name: "<Doctor & Friend>" });
  const before = structuredClone(actor.flags);
  const html = sheet.renderTherapistSection(actor);
  assert.match(String(html), /data-medic-cmd/);
  assert.match(String(html), /Doctor|Therap/i);
  assert.doesNotMatch(String(html), /<Doctor & Friend>/, "Actor-controlled markup is never emitted as raw HTML");
  assert.deepEqual(actor.writes, [], "rendering controls never writes");
  assert.deepEqual(actor.flags, before);
  assert.equal(await sheet.handleTherapistCommand(actor, "unrelatedCommand", {}), false);
});

test("E3: canceling the Doctor Is In confirmation leaves resources, flags, and receipts unchanged", async () => {
  requireRegistration();
  const actor = medic({ level: 4, lifeSupport: 27 });
  const beforeFlags = structuredClone(actor.flags);
  const beforeWrites = actor.writes.length;
  await assert.rejects(medicUses.command(actor, "doctorIsIn", { confirmed: false, chosenId: "empowering" }, "doctor-cancel"), /confirm/i);
  assert.deepEqual(actor.flags, beforeFlags);
  assert.equal(actor.writes.length, beforeWrites);
  assert.deepEqual(medicUses.uses(actor), []);
});

test("E3: Doctor Is In is a Bonus Action, once per Long Rest, and the exhaustion warning can be overridden", async () => {
  const actor = medic({ level: 4 });
  await activateDoctor(actor, "empowering", "doctor-first");
  const preview = medicUses.preview(actor, "doctorIsIn", { chosenId: "energising" });
  assert.ok(preview.warnings.length > 0, "a second activation before a Long Rest is warned");
  assert.match(JSON.stringify(preview), /Bonus Action|1 minute|Long Rest/i);
  const warningIds = preview.warnings.map(value => value.id).filter(Boolean);
  await assert.doesNotReject(medicUses.command(actor, "doctorIsIn", {
    confirmed: true, chosenId: "energising", overrides: warningIds
  }, "doctor-override"));
});

// E4 · Early Onset Treatment

test("E4: Early Onset is available at 7, uses PB, and receives B's exact eligibility warnings", () => {
  const { THERAPIST_PLANS } = requireFeatures();
  assert.equal(typeof THERAPIST_PLANS.earlyOnset, "function");
  assert.equal(earlyOnsetUses(3), 3);
  assert.deepEqual(earlyOnsetCheck({ castingTime: "action", targetUuids: ["Actor.ally"], damagedUuid: "Actor.ally",
    damagedIsAlly: true, canSee: true, usesRemaining: 3 }), { warnings: [] });
  const invalid = earlyOnsetCheck({ castingTime: "minute", targetUuids: ["Actor.other"], damagedUuid: "Actor.ally",
    damagedIsAlly: false, canSee: false, usesRemaining: 0 });
  assert.deepEqual(invalid.warnings, ["castingTimeNotActionOrBonus", "mustTargetDamaged", "notAlly", "notVisible", "noUsesLeft"]);
});

test("E4: reaction cast context preserves triggerEventId and requires the damaged target without spending on preview", async () => {
  requireRegistration();
  const actor = medic({ level: 7 });
  const before = structuredClone(actor.flags);
  const available = getReactions(actor).available;
  const plan = medicUses.preview(actor, "earlyOnset", { castingTime: "reaction", triggerEventId: "hitTaken:damage-17",
    requiredTargetUuid: "Actor.patient", targetUuids: [], damagedUuid: "Actor.patient", damagedIsAlly: true, canSee: true });
  assert.ok(plan && Array.isArray(plan.warnings));
  assert.deepEqual(actor.flags, before);
  assert.equal(getReactions(actor).available, available);
});

// E5/E6 · allowance accounting, native Art presentation, and rider lifetime

test("E5: each Concentrated Treatment allowance adds one owner-clicked 1d6 package per final AP", () => {
  const state = activateDoctorIsIn({ chosenId: "empowering", worldTime: 100, medicLevel: 15, state: null });
  const art = { targetCount: 1, rangeFeet: 30, rangeTouch: false, durationSeconds: 3600, concentration: true,
    restoresHP: true, apSpent: 3, levelled: true };
  const quote = quoteTherapies({ selection: ["empowering", "energising", "psychological"], art, state, worldTime: 100, lifeSupport: 125 });
  assert.deepEqual(quote.healingPackages, [
    { therapyId: "energising", formula: "3d6" },
    { therapyId: "psychological", formula: "3d6" }
  ]);
  assert.equal(quote.allowanceUsed, 2);
});

test("E5: zero actual AP produces no Concentrated Treatment healing dice", () => {
  const state = activateDoctorIsIn({ chosenId: "empowering", worldTime: 100, medicLevel: 15, state: null });
  const quote = quoteTherapies({ selection: ["energising"], art: {
    targetCount: 1, rangeFeet: 30, rangeTouch: false, durationSeconds: 60, concentration: false,
    restoresHP: true, apSpent: 0, levelled: false
  }, state, worldTime: 100, lifeSupport: 125 });
  assert.deepEqual(quote.healingPackages, []);
});

test("E5: one Doctor Is In activation starts three Concentrated Treatments and the cast consumes one", async () => {
  const actor = medic({ level: 15 });
  await activateDoctor(actor, "empowering", "doctor-allowance-1");
  const item = healingArt(actor);
  const { option, selection } = await castOption(actor, item, ["longDistance"]);
  const quote = option.provider.quote(selection);
  assert.equal(quote.allowanceAfter, 2, "the first of the three allowances is consumed by this Therapy");
  assert.equal(quote.allowanceUsed, 1);
});

test("E5: the chosen free Therapy never consumes allowance; unspent allowance survives the minute and reload", async () => {
  const actor = medic({ level: 15 });
  await activateDoctor(actor, "empowering", "doctor-persist");
  game.time.worldTime = 161;
  const persisted = createTestActor({ name: actor.name, type: "character", level: 15, prof: 5,
    flags: { ak5e: structuredClone(actor.flags.ak5e) } });
  persisted.items.set("medic-class", createTestItem({ id: "medic-class", type: "class", name: "Medic", system: { levels: 15 },
    flags: { ak5e: { chapterThreeId: "class-medic" } } }, persisted));
  persisted.items.set("therapist-branch", createTestItem({ id: "therapist-branch", type: "subclass", name: "Therapist",
    flags: { ak5e: { chapterThreeId: "subclass-medic-therapist" } } }, persisted));
  const item = healingArt(persisted);
  const { option, selection } = await castOption(persisted, item, ["empowering", "energising"]);
  const quote = option.provider.quote(selection);
  assert.equal(quote.items.find(entry => entry.id === "empowering")?.free, null, "expired minute ends the chosen Therapy's free use");
  assert.equal(quote.items.find(entry => entry.id === "energising")?.free, "concentrated");
  assert.equal(quote.allowanceUsed, 1);
});

test("E6: long-distance and long-term Therapy quote temporary native Art changes without editing the original Item", async () => {
  const actor = medic({ level: 4 });
  const item = healingArt(actor);
  const before = structuredClone(item.system);
  const { option, selection } = await castOption(actor, item, ["longDistance", "longTerm"]);
  const quote = option.provider.quote(selection);
  assert.equal(quote.lifeSupportCost, 10);
  assert.deepEqual(item.system, before, "casting-time modifications do not permanently alter the original Art");
  assert.deepEqual(validateSelection({ selection: ["longDistance", "longTerm"], medicLevel: 4,
    doctorIsIn: { active: true, chosenId: "empowering" } }).warnings, []);
});

// E7/E8 · save confirmation, damage applications, target turns and receipts

test("E7: save riders are owner-confirmed automatic passes and do not roll or alter a die", () => {
  const context = { spellMod: 3, art: { targetCount: 1, restoresHP: true }, castId: "cast-save",
    casterUuid: "Actor.caster", targetUuids: ["Actor.patient"], worldTime: 100 };
  const psychological = riderFor("psychological", context);
  const resistance = riderFor("resistance", context);
  assert.deepEqual(psychological.abilities, ["int", "wis", "cha"]);
  assert.equal(psychological.uses, 1);
  assert.equal(resistance.against, "arts");
  assert.equal(resistance.uses, null);
  assert.equal(psychological.expires.casterNextTurnStart, true);
  assert.equal(resistance.expires.casterNextTurnStart, true);
  requireFeatures();
});

test("E8: Recuperative uses the correlated hostile application ID exactly once, but separate applications heal separately", () => {
  const rider = riderFor("recuperative", { spellMod: 3, art: { targetCount: 1 }, castId: "cast-rec",
    casterUuid: "Actor.medic", targetUuids: ["Actor.patient"], worldTime: 100 });
  const first = recuperativeHeal(rider, { id: "damage-app-1", targetUuid: "Actor.patient", hostile: true, amount: 7 }, []);
  const replay = recuperativeHeal(rider, { id: "damage-app-1", targetUuid: "Actor.patient", hostile: true, amount: 7 }, first.seen);
  const second = recuperativeHeal(rider, { id: "damage-app-2", targetUuid: "Actor.patient", hostile: true, amount: 2 }, replay.seen);
  assert.equal(first.heal, 3);
  assert.equal(replay.heal, 0);
  assert.equal(second.heal, 3);
  assert.deepEqual(first.seen, ["damage-app-1"]);
  requireFeatures();
});

test("E8: Regenerative exposes an explicit 1d6 owner roll at target turn-start, not an automatic roll", () => {
  const rider = riderFor("regenerative", { spellMod: 3, art: { targetCount: 1, restoresHP: true }, castId: "cast-regen",
    casterUuid: "Actor.medic", targetUuids: ["Actor.patient"], worldTime: 100 });
  assert.equal(rider.kind, "turnStartHeal");
  assert.equal(rider.formula, "1d6");
  assert.equal(rider.expires.worldTime, 160);
  assert.equal(riderExpired(rider, { worldTime: 159 }), false);
  assert.equal(riderExpired(rider, { worldTime: 160 }), true);
  requireSheet();
});

test("E8: a rider receipt links to the cast and parent undo reverses both records", async () => {
  requireRegistration();
  const actor = medic();
  const parentChanges = captureArtChanges(actor, { "flags.ak5e.artsPoints.value": 23 });
  const parent = appendArtReceipt(actor, { id: "therapist-parent-cast", name: "Healing Art", cost: 3 }, parentChanges)[0];
  await actor.update({ "flags.ak5e.artsPoints.value": 23, "flags.ak5e.artReceipts": [parent] });
  const childChanges = [{ path: "flags.ak5e.resourcePools.lifeSupport.value", before: 125, after: 120 }];
  await actor.update({ "flags.ak5e.resourcePools.lifeSupport.value": 120 });
  await appendLinkedReceipt(actor, parent.id, { id: "therapist-rider-child", kind: "therapistRider" }, childChanges);
  const child = actor.getFlag("ak5e", "artReceipts").find(entry => entry.id === "therapist-rider-child");
  assert.equal(child.parentReceiptId ?? child.parentId, parent.id);
  assert.deepEqual(child.changes, childChanges);
  await undoArtReceipt(actor, parent.id);
  assert.equal(actor.flags.ak5e.artsPoints.value, 26, "parent undo restores the cast's AP");
  assert.equal(actor.flags.ak5e.resourcePools.lifeSupport.value, 125, "parent undo restores the linked Therapy change");
  assert.equal(actor.getFlag("ak5e", "artReceipts").find(entry => entry.id === child.id).status, "undone");
});
