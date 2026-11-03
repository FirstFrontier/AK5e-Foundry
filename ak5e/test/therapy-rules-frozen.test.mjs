// Frozen acceptance tests for the pure Therapist rules module (lane B `therapy-rules`).
// Spec: .codex-work/medic/SPEC-therapy-rules.md (2026-11-01). Source: C3:4923-5004.
// These tests are written before the implementation exists and must not be weakened.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THERAPIES, therapyById, THERAPIST_FEATURES, availableTherapies,
  therapyEligibility, validateSelection, activateDoctorIsIn, doctorIsInActive,
  quoteTherapies, riderFor, riderExpired, recuperativeHeal, earlyOnsetCheck, earlyOnsetUses
} from "../scripts/therapist-rules.mjs";

const SRC_URL = new URL("../scripts/therapist-rules.mjs", import.meta.url);

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

// Art descriptor default: everything unknown/absent, per spec input shape.
const art = (patch = {}) => ({
  targetCount: null,
  rangeFeet: null,
  rangeTouch: false,
  durationSeconds: null,
  concentration: false,
  restoresHP: false,
  apSpent: 0,
  levelled: false,
  ...patch
});

const BASIC_IDS = ["empowering", "energising", "longDistance", "longTerm", "psychological", "recuperative"];
const ADVANCED_IDS = ["cleansing", "regenerative", "resistance"];
const ALL_IDS = [...BASIC_IDS, ...ADVANCED_IDS];

// ---------------------------------------------------------------------------
// THERAPIES table
// ---------------------------------------------------------------------------

test("THERAPIES is exactly the nine therapies, alphabetical within tier", () => {
  assert.deepEqual(
    THERAPIES.map(t => [t.id, t.name, t.tier, t.lifeSupportCost, t.minLevel]),
    [
      ["empowering", "Empowering Therapy", "basic", 5, 1],
      ["energising", "Energising Therapy", "basic", 5, 1],
      ["longDistance", "Long-Distance Therapy", "basic", 5, 1],
      ["longTerm", "Long-Term Therapy", "basic", 5, 1],
      ["psychological", "Psychological Therapy", "basic", 5, 1],
      ["recuperative", "Recuperative Therapy", "basic", 5, 1],
      ["cleansing", "Cleansing Therapy", "advanced", 10, 11],
      ["regenerative", "Regenerative Therapy", "advanced", 10, 11],
      ["resistance", "Resistance Therapy", "advanced", 10, 11]
    ]
  );
});

test("each therapy entry carries exactly the five specified fields", () => {
  for (const entry of THERAPIES) {
    assert.deepEqual(Object.keys(entry).sort(), ["id", "lifeSupportCost", "minLevel", "name", "tier"]);
  }
});

test("THERAPIES is a frozen array", () => {
  assert.equal(Object.isFrozen(THERAPIES), true);
  assert.throws(() => { THERAPIES.push({ id: "x" }); }, TypeError);
});

test("therapyById resolves every id and returns null otherwise", () => {
  for (const id of ALL_IDS) {
    const entry = therapyById(id);
    assert.equal(entry.id, id);
    assert.equal(THERAPIES.includes(entry), true, `${id} returns the table entry`);
  }
  assert.equal(therapyById("notATherapy"), null);
  assert.equal(therapyById("Empowering"), null, "ids are case-sensitive");
});

// ---------------------------------------------------------------------------
// Feature levels
// ---------------------------------------------------------------------------

test("THERAPIST_FEATURES pins the five feature levels", () => {
  assert.deepEqual(THERAPIST_FEATURES, {
    basicTherapy: 1, doctorIsIn: 4, earlyOnset: 7, advancedTherapy: 11, concentratedTreatment: 15
  });
  assert.equal(Object.isFrozen(THERAPIST_FEATURES), true);
});

test("availableTherapies gates basic at 1 and advanced at 11", () => {
  assert.deepEqual(availableTherapies(1), BASIC_IDS);
  assert.deepEqual(availableTherapies(10), BASIC_IDS);
  assert.deepEqual(availableTherapies(11), ALL_IDS);
  assert.deepEqual(availableTherapies(20), ALL_IDS);
});

test("availableTherapies rejects levels below 1 or non-integer levels", () => {
  for (const bad of [0, -1, 1.5, NaN, "3"]) {
    assert.throws(() => availableTherapies(bad), RangeError, `level ${String(bad)}`);
  }
});

// ---------------------------------------------------------------------------
// therapyEligibility
// ---------------------------------------------------------------------------

test("energising and recuperative require exactly one target", () => {
  for (const id of ["energising", "recuperative"]) {
    assert.deepEqual(therapyEligibility(id, art({ targetCount: 1 })), { eligible: true, warnings: [] });
    assert.deepEqual(therapyEligibility(id, art({ targetCount: 2 })), { eligible: false, warnings: ["notSingleTarget"] });
    assert.deepEqual(therapyEligibility(id, art({ targetCount: 0 })), { eligible: false, warnings: ["notSingleTarget"] });
    assert.deepEqual(therapyEligibility(id, art({ targetCount: null })), { eligible: null, warnings: ["unknownTargets"] });
  }
});

test("longDistance accepts touch or range of at least 5 feet and doubles nothing else", () => {
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeTouch: true, rangeFeet: null })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 5 })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 4 })), { eligible: false, warnings: ["rangeTooShort"] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 0 })), { eligible: false, warnings: ["rangeTooShort"] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeTouch: false, rangeFeet: null })), {
    eligible: null, warnings: ["unknownRange"]
  });
});

test("longTerm requires a duration of at least 60 seconds", () => {
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: 60 })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: 59 })), { eligible: false, warnings: ["durationTooShort"] });
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: null })), { eligible: null, warnings: ["unknownDuration"] });
});

test("psychological requires an Art that restores Hit Points", () => {
  assert.deepEqual(therapyEligibility("psychological", art({ restoresHP: true })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("psychological", art({ restoresHP: false })), { eligible: false, warnings: ["noHealing"] });
});

test("cleansing and regenerative require healing of a single creature", () => {
  for (const id of ["cleansing", "regenerative"]) {
    assert.deepEqual(therapyEligibility(id, art({ restoresHP: true, targetCount: 1 })), { eligible: true, warnings: [] });
    assert.deepEqual(therapyEligibility(id, art({ restoresHP: false, targetCount: 1 })), { eligible: false, warnings: ["noHealing"] });
    assert.deepEqual(therapyEligibility(id, art({ restoresHP: true, targetCount: 2 })), { eligible: false, warnings: ["notSingleTarget"] });
    assert.deepEqual(therapyEligibility(id, art({ restoresHP: true, targetCount: null })), { eligible: null, warnings: ["unknownTargets"] });
  }
});

test("a failed check outranks an unknown check for cleansing/regenerative", () => {
  const result = therapyEligibility("cleansing", art({ restoresHP: false, targetCount: null }));
  assert.equal(result.eligible, false, "false wins over null");
  assert.deepEqual([...result.warnings].sort(), ["noHealing", "unknownTargets"]);
});

test("empowering and resistance are always eligible, even with degenerate art data", () => {
  const degenerate = art({
    targetCount: 7, rangeFeet: -5, rangeTouch: false, durationSeconds: 0,
    concentration: false, restoresHP: false, apSpent: 0, levelled: false
  });
  for (const id of ["empowering", "resistance"]) {
    assert.deepEqual(therapyEligibility(id, degenerate), { eligible: true, warnings: [] });
    assert.deepEqual(therapyEligibility(id, art()), { eligible: true, warnings: [] });
  }
});

test("therapyEligibility throws TypeError for an unknown therapy id", () => {
  assert.throws(() => therapyEligibility("Empowering", art()), TypeError);
  assert.throws(() => therapyEligibility("ward", art()), TypeError);
  assert.throws(() => therapyEligibility(undefined, art()), TypeError);
});

// ---------------------------------------------------------------------------
// validateSelection
// ---------------------------------------------------------------------------

test("a single therapy is always allowed", () => {
  assert.deepEqual(validateSelection({ selection: ["empowering"], medicLevel: 1, doctorIsIn: null }), { warnings: [] });
  assert.deepEqual(validateSelection({ selection: ["cleansing"], medicLevel: 11, doctorIsIn: null }), { warnings: [] });
});

test("two therapies need The Doctor Is In", () => {
  assert.deepEqual(validateSelection({ selection: ["empowering", "energising"], medicLevel: 4, doctorIsIn: null }), {
    warnings: ["tooManyTherapies"]
  });
  assert.deepEqual(validateSelection({
    selection: ["empowering", "energising"], medicLevel: 4, doctorIsIn: { active: false, chosenId: "empowering" }
  }), { warnings: ["tooManyTherapies"] });
  assert.deepEqual(validateSelection({
    selection: ["empowering", "energising"], medicLevel: 4, doctorIsIn: { active: true, chosenId: "empowering" }
  }), { warnings: [] }, "ruling 2026-11-01 #3: the free therapy counts as one of the two");
});

test("three therapies are too many even while The Doctor Is In is active", () => {
  assert.deepEqual(validateSelection({
    selection: ["empowering", "energising", "longTerm"], medicLevel: 15, doctorIsIn: { active: true, chosenId: "empowering" }
  }), { warnings: ["tooManyTherapies"] });
});

test("the same therapy twice is a duplicate, including against the Doctor Is In choice", () => {
  assert.deepEqual(validateSelection({
    selection: ["empowering", "empowering"], medicLevel: 4, doctorIsIn: { active: true, chosenId: "empowering" }
  }), { warnings: ["duplicateTherapy"] });
  assert.deepEqual(validateSelection({
    selection: ["recuperative", "recuperative"], medicLevel: 11,
    doctorIsIn: { active: true, chosenId: "empowering" }
  }), { warnings: ["duplicateTherapy"] }, "count is legal, only the duplicate fires");
  const both = validateSelection({
    selection: ["recuperative", "recuperative"], medicLevel: 11, doctorIsIn: null
  });
  assert.deepEqual([...both.warnings].sort(), ["tooManyTherapies", "duplicateTherapy"].sort(),
    "two violations are both reported");
});

test("advanced therapies are locked below level 11", () => {
  for (const id of ADVANCED_IDS) {
    assert.deepEqual(validateSelection({ selection: [id], medicLevel: 10, doctorIsIn: null }), {
      warnings: ["advancedTherapyLocked"]
    });
    assert.deepEqual(validateSelection({ selection: [id], medicLevel: 11, doctorIsIn: null }), { warnings: [] });
  }
});

test("validateSelection reports the lock alongside a legal two-therapy selection", () => {
  assert.deepEqual(validateSelection({
    selection: ["cleansing", "empowering"], medicLevel: 10, doctorIsIn: { active: true, chosenId: "empowering" }
  }), { warnings: ["advancedTherapyLocked"] }, "count is legal, only the lock fires");
});

test("validateSelection throws TypeError for unknown ids", () => {
  assert.throws(() => validateSelection({ selection: ["nope"], medicLevel: 4, doctorIsIn: null }), TypeError);
  assert.throws(() => validateSelection({
    selection: ["empowering", "nope"], medicLevel: 4, doctorIsIn: { active: true, chosenId: "empowering" }
  }), TypeError);
});

// ---------------------------------------------------------------------------
// activateDoctorIsIn / doctorIsInActive
// ---------------------------------------------------------------------------

test("activateDoctorIsIn records the choice and a 60 second expiry", () => {
  assert.deepEqual(
    activateDoctorIsIn({ chosenId: "energising", worldTime: 1000, medicLevel: 4, state: null }),
    { doctorIsIn: { chosenId: "energising", expiresAt: 1060 }, concentratedAllowance: 0 }
  );
});

test("activateDoctorIsIn rejects advanced and unknown therapies", () => {
  for (const chosenId of ["cleansing", "regenerative", "resistance"]) {
    assert.throws(() => activateDoctorIsIn({ chosenId, worldTime: 0, medicLevel: 15, state: null }), TypeError, chosenId);
  }
  assert.throws(() => activateDoctorIsIn({ chosenId: "nope", worldTime: 0, medicLevel: 4, state: null }), TypeError);
});

test("Concentrated Treatment sets exactly 3 allowances at level 15, replacing older ones", () => {
  assert.equal(activateDoctorIsIn({ chosenId: "empowering", worldTime: 0, medicLevel: 15, state: null }).concentratedAllowance, 3);
  const replaced = activateDoctorIsIn({
    chosenId: "empowering", worldTime: 500, medicLevel: 15,
    state: { doctorIsIn: { chosenId: "longTerm", expiresAt: 120 }, concentratedAllowance: 2 }
  });
  assert.equal(replaced.concentratedAllowance, 3, "replaces, never accumulates");
  assert.deepEqual(replaced.doctorIsIn, { chosenId: "empowering", expiresAt: 560 });
});

test("below level 15 the allowance is untouched, defaulting to 0", () => {
  assert.equal(activateDoctorIsIn({ chosenId: "empowering", worldTime: 0, medicLevel: 14, state: null }).concentratedAllowance, 0);
  const kept = activateDoctorIsIn({
    chosenId: "empowering", worldTime: 0, medicLevel: 10,
    state: { doctorIsIn: null, concentratedAllowance: 2 }
  });
  assert.equal(kept.concentratedAllowance, 2);
});

test("activateDoctorIsIn does not mutate its state input", () => {
  const state = deepFreeze({ doctorIsIn: { chosenId: "longTerm", expiresAt: 120 }, concentratedAllowance: 1 });
  const snapshot = JSON.parse(JSON.stringify(state));
  activateDoctorIsIn({ chosenId: "empowering", worldTime: 10, medicLevel: 15, state });
  assert.deepEqual(state, snapshot);
});

test("doctorIsInActive expires exactly at expiresAt", () => {
  const state = { doctorIsIn: { chosenId: "empowering", expiresAt: 1060 }, concentratedAllowance: 0 };
  assert.equal(doctorIsInActive(state, 1059), true);
  assert.equal(doctorIsInActive(state, 1060), false);
  assert.equal(doctorIsInActive(state, 2000), false);
  assert.equal(doctorIsInActive({ doctorIsIn: null, concentratedAllowance: 3 }, 0), false);
  assert.equal(doctorIsInActive(null, 0), false);
});

// ---------------------------------------------------------------------------
// quoteTherapies
// ---------------------------------------------------------------------------

const doctorState = (chosenId, expiresAt, allowance) => ({
  doctorIsIn: { chosenId, expiresAt }, concentratedAllowance: allowance
});

test("a plain therapy costs its Life Support and adds no package", () => {
  const quote = quoteTherapies({
    selection: ["energising"], art: art({ restoresHP: true, apSpent: 2 }),
    state: null, worldTime: 0, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [{ id: "energising", cost: 5, free: null }]);
  assert.equal(quote.lifeSupportCost, 5);
  assert.equal(quote.lifeSupportAfter, 15);
  assert.equal(quote.shortfall, 0);
  assert.equal(quote.allowanceUsed, 0);
  assert.equal(quote.allowanceAfter, 0);
  assert.deepEqual(quote.healingPackages, []);
});

test("the Doctor Is In therapy is free while active and never spends allowance", () => {
  const quote = quoteTherapies({
    selection: ["energising"], art: art({ restoresHP: true, apSpent: 3 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [{ id: "energising", cost: 0, free: "doctorIsIn" }]);
  assert.equal(quote.lifeSupportCost, 0);
  assert.equal(quote.lifeSupportAfter, 20);
  assert.equal(quote.allowanceUsed, 0);
  assert.equal(quote.allowanceAfter, 3);
  assert.deepEqual(quote.healingPackages, [], "the free Doctor Is In therapy is not a Concentrated package");
});

test("once the minute ends the chosen therapy is paid but still spends no allowance", () => {
  const quote = quoteTherapies({
    selection: ["energising"], art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 1060, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [{ id: "energising", cost: 5, free: null }]);
  assert.equal(quote.lifeSupportCost, 5);
  assert.equal(quote.allowanceUsed, 0);
  assert.equal(quote.allowanceAfter, 3, "allowances persist after the minute ends");
});

test("a Concentrated therapy is free, spends one allowance and adds its own package", () => {
  const quote = quoteTherapies({
    selection: ["recuperative"], art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [{ id: "recuperative", cost: 0, free: "concentrated" }]);
  assert.equal(quote.lifeSupportCost, 0);
  assert.equal(quote.allowanceUsed, 1);
  assert.equal(quote.allowanceAfter, 2);
  assert.deepEqual(quote.healingPackages, [{ therapyId: "recuperative", formula: "2d6" }]);
});

test("two Concentrated therapies spend two allowances and add two packages in order", () => {
  const quote = quoteTherapies({
    selection: ["recuperative", "longTerm"], art: art({ restoresHP: true, apSpent: 3 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [
    { id: "recuperative", cost: 0, free: "concentrated" },
    { id: "longTerm", cost: 0, free: "concentrated" }
  ]);
  assert.equal(quote.allowanceUsed, 2);
  assert.equal(quote.allowanceAfter, 1);
  assert.deepEqual(quote.healingPackages, [
    { therapyId: "recuperative", formula: "3d6" },
    { therapyId: "longTerm", formula: "3d6" }
  ]);
});

test("mixed selection: Doctor Is In free, then Concentrated, then paid", () => {
  const quote = quoteTherapies({
    selection: ["energising", "recuperative", "empowering"], art: art({ restoresHP: true, apSpent: 1 }),
    state: doctorState("energising", 1060, 1), worldTime: 1000, lifeSupport: 12
  });
  assert.deepEqual(quote.items, [
    { id: "energising", cost: 0, free: "doctorIsIn" },
    { id: "recuperative", cost: 0, free: "concentrated" },
    { id: "empowering", cost: 5, free: null }
  ]);
  assert.equal(quote.lifeSupportCost, 5);
  assert.equal(quote.lifeSupportAfter, 7);
  assert.equal(quote.shortfall, 0);
  assert.equal(quote.allowanceUsed, 1);
  assert.equal(quote.allowanceAfter, 0);
  assert.deepEqual(quote.healingPackages, [{ therapyId: "recuperative", formula: "1d6" }]);
});

test("allowances persist after expiry and still discount later therapies", () => {  const quote = quoteTherapies({
    selection: ["recuperative", "empowering"], art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 5000, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [
    { id: "recuperative", cost: 0, free: "concentrated" },
    { id: "empowering", cost: 0, free: "concentrated" }
  ]);
  assert.equal(quote.allowanceUsed, 2);
  assert.equal(quote.allowanceAfter, 1);
});

test("concentrated allowances apply even without an active Doctor Is In window", () => {
  const quote = quoteTherapies({
    selection: ["empowering"], art: art({ restoresHP: true, apSpent: 1 }),
    state: { doctorIsIn: null, concentratedAllowance: 3 }, worldTime: 0, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [{ id: "empowering", cost: 0, free: "concentrated" }]);
  assert.equal(quote.allowanceAfter, 2);
});

test("after expiry the old chosen therapy is paid while a companion stays Concentrated", () => {
  const quote = quoteTherapies({
    selection: ["energising", "recuperative"], art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 2000, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [
    { id: "energising", cost: 5, free: null },
    { id: "recuperative", cost: 0, free: "concentrated" }
  ]);
  assert.equal(quote.lifeSupportCost, 5);
  assert.equal(quote.allowanceUsed, 1);
  assert.equal(quote.allowanceAfter, 2);
  assert.deepEqual(quote.healingPackages, [{ therapyId: "recuperative", formula: "2d6" }]);
});

test("an exhausted allowance falls back to paid cost", () => {
  const quote = quoteTherapies({
    selection: ["recuperative"], art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 0), worldTime: 1000, lifeSupport: 20
  });
  assert.deepEqual(quote.items, [{ id: "recuperative", cost: 5, free: null }]);
  assert.equal(quote.allowanceUsed, 0);
  assert.equal(quote.allowanceAfter, 0);
  assert.deepEqual(quote.healingPackages, []);
});

test("no healing package when the Art does not restore HP", () => {
  const quote = quoteTherapies({
    selection: ["recuperative"], art: art({ restoresHP: false, apSpent: 4 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 20
  });
  assert.equal(quote.items[0].free, "concentrated");
  assert.deepEqual(quote.healingPackages, []);
});

test("no healing package when no Arts Points were spent", () => {
  const quote = quoteTherapies({
    selection: ["recuperative"], art: art({ restoresHP: true, apSpent: 0 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 20
  });
  assert.equal(quote.items[0].free, "concentrated");
  assert.deepEqual(quote.healingPackages, []);
});

test("Life Support overspend clamps to zero and reports the shortfall", () => {
  const quote = quoteTherapies({
    selection: ["cleansing"], art: art({ restoresHP: true, targetCount: 1, apSpent: 1 }),
    state: null, worldTime: 0, lifeSupport: 4
  });
  assert.equal(quote.lifeSupportCost, 10);
  assert.equal(quote.lifeSupportAfter, 0);
  assert.equal(quote.shortfall, 6);
});

test("exact Life Support spends to zero with no shortfall", () => {
  const quote = quoteTherapies({
    selection: ["empowering"], art: art(), state: null, worldTime: 0, lifeSupport: 5
  });
  assert.equal(quote.lifeSupportAfter, 0);
  assert.equal(quote.shortfall, 0);
});

test("quoteTherapies does not mutate its inputs", () => {
  const selection = deepFreeze(["energising", "recuperative"]);
  const artInput = deepFreeze(art({ restoresHP: true, apSpent: 2 }));
  const state = deepFreeze(doctorState("energising", 1060, 3));
  const before = JSON.stringify([selection, artInput, state]);
  quoteTherapies({ selection, art: artInput, state, worldTime: 1000, lifeSupport: 20 });
  assert.equal(JSON.stringify([selection, artInput, state]), before);
});

// ---------------------------------------------------------------------------
// riderFor
// ---------------------------------------------------------------------------

const riderCtx = (patch = {}) => ({
  spellMod: 4,
  art: art({ targetCount: 1, rangeFeet: 60, rangeTouch: false, durationSeconds: 600, concentration: false, restoresHP: true, apSpent: 2 }),
  castId: "cast-1",
  casterUuid: "Actor.medic",
  targetUuids: ["Actor.a"],
  worldTime: 1000,
  ...patch
});

test("empowering rider: damage bonus for the next successful attack within a minute", () => {
  assert.deepEqual(riderFor("empowering", riderCtx()), {
    therapyId: "empowering",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "damageBonus",
    amount: 4,
    consume: "nextSuccessfulAttack",
    expires: { worldTime: 1060 }
  });
});

test("energising rider: half-speed move, immediate only", () => {
  assert.deepEqual(riderFor("energising", riderCtx()), {
    therapyId: "energising",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "moveHalfSpeed",
    expires: null
  });
});

test("longDistance rider: touch becomes 30 feet, otherwise range doubles", () => {
  const touch = riderFor("longDistance", riderCtx({ art: art({ rangeTouch: true, rangeFeet: null }) }));
  assert.deepEqual(touch, {
    therapyId: "longDistance",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "range",
    rangeFeet: 30,
    expires: null
  });
  assert.equal(riderFor("longDistance", riderCtx({ art: art({ rangeFeet: 60 }) })).rangeFeet, 120);
  assert.equal(riderFor("longDistance", riderCtx({ art: art({ rangeFeet: 5 }) })).rangeFeet, 10);
});

test("longTerm rider: duration doubles and caps at 24 hours, Concentration grants advantage", () => {
  const doubled = riderFor("longTerm", riderCtx({ art: art({ durationSeconds: 600, concentration: true }) }));
  assert.deepEqual(doubled, {
    therapyId: "longTerm",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "duration",
    durationSeconds: 1200,
    concentrationAdvantage: true,
    expires: null
  });
  assert.equal(riderFor("longTerm", riderCtx({ art: art({ durationSeconds: 50000 }) })).durationSeconds, 86400);
  assert.equal(riderFor("longTerm", riderCtx({ art: art({ durationSeconds: 60, concentration: false }) })).concentrationAdvantage, false);
});

test("psychological rider: one automatic Int/Wis/Cha save before the next turn", () => {
  assert.deepEqual(riderFor("psychological", riderCtx()), {
    therapyId: "psychological",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "autoPassSave",
    abilities: ["int", "wis", "cha"],
    uses: 1,
    expires: { casterNextTurnStart: true }
  });
});

test("recuperative rider: heal on hostile damage for a minute", () => {
  assert.deepEqual(riderFor("recuperative", riderCtx()), {
    therapyId: "recuperative",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "healOnHostileDamage",
    amount: 4,
    expires: { worldTime: 1060 }
  });
});

test("cleansing rider: end one condition immediately", () => {
  assert.deepEqual(riderFor("cleansing", riderCtx()), {
    therapyId: "cleansing",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "endCondition",
    count: 1,
    expires: null
  });
});

test("regenerative rider: 1d6 at the start of each turn for a minute", () => {
  assert.deepEqual(riderFor("regenerative", riderCtx()), {
    therapyId: "regenerative",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "turnStartHeal",
    formula: "1d6",
    expires: { worldTime: 1060 }
  });
});

test("resistance rider: unlimited automatic saves against Arts until the caster's next turn", () => {
  assert.deepEqual(riderFor("resistance", riderCtx()), {
    therapyId: "resistance",
    castId: "cast-1",
    casterUuid: "Actor.medic",
    targetUuids: ["Actor.a"],
    kind: "autoPassSave",
    against: "arts",
    uses: null,
    expires: { casterNextTurnStart: true }
  });
});

test("riderFor throws TypeError for unknown ids and does not mutate its context", () => {
  assert.throws(() => riderFor("nope", riderCtx()), TypeError);
  const ctx = deepFreeze(riderCtx());
  const before = JSON.stringify(ctx);
  riderFor("longTerm", ctx);
  assert.equal(JSON.stringify(ctx), before);
});

// ---------------------------------------------------------------------------
// riderExpired
// ---------------------------------------------------------------------------

test("riderExpired compares world time inclusively", () => {
  const rider = { expires: { worldTime: 1060 } };
  assert.equal(riderExpired(rider, { worldTime: 1059, casterTurnStarted: false }), false);
  assert.equal(riderExpired(rider, { worldTime: 1060, casterTurnStarted: false }), true);
  assert.equal(riderExpired(rider, { worldTime: 5000, casterTurnStarted: false }), true);
});

test("riderExpired ends turn-scoped riders only when the caster's turn starts", () => {
  const rider = { expires: { casterNextTurnStart: true } };
  assert.equal(riderExpired(rider, { worldTime: 9999, casterTurnStarted: false }), false);
  assert.equal(riderExpired(rider, { worldTime: 0, casterTurnStarted: true }), true);
});

test("immediate riders count as expired once applied", () => {
  assert.equal(riderExpired({ expires: null }, { worldTime: 0, casterTurnStarted: false }), true);
});

// ---------------------------------------------------------------------------
// recuperativeHeal
// ---------------------------------------------------------------------------

test("recuperativeHeal heals once per hostile application and records it", () => {
  const rider = { amount: 4, targetUuids: ["Actor.a", "Actor.b"] };
  const application = { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 9 };
  const seen = deepFreeze([]);
  const result = recuperativeHeal(rider, application, seen);
  assert.equal(result.heal, 4);
  assert.deepEqual(result.seen, ["app-1"]);
  assert.notEqual(result.seen, seen, "returns a new seen array");
  assert.deepEqual(seen, [], "input seen is not mutated");
});

test("recuperativeHeal ignores a repeated application id", () => {
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const application = { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 9 };
  const seen = deepFreeze(["app-1"]);
  const result = recuperativeHeal(rider, application, seen);
  assert.equal(result.heal, 0);
  assert.deepEqual(result.seen, ["app-1"]);
  assert.deepEqual(seen, ["app-1"]);
});

test("recuperativeHeal ignores non-hostile, non-positive and off-target damage", () => {
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const base = { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 9 };
  assert.equal(recuperativeHeal(rider, { ...base, hostile: false }, []).heal, 0);
  assert.equal(recuperativeHeal(rider, { ...base, hostile: "yes" }, []).heal, 0);
  assert.equal(recuperativeHeal(rider, { ...base, amount: 0 }, []).heal, 0);
  assert.equal(recuperativeHeal(rider, { ...base, amount: -3 }, []).heal, 0);
  assert.equal(recuperativeHeal(rider, { ...base, targetUuid: "Actor.z" }, []).heal, 0);
});

test("recuperativeHeal keeps earlier entries when appending", () => {
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const result = recuperativeHeal(rider, { id: "app-2", targetUuid: "Actor.a", hostile: true, amount: 1 }, ["app-1"]);
  assert.equal(result.heal, 4);
  assert.deepEqual(result.seen, ["app-1", "app-2"]);
});

// ---------------------------------------------------------------------------
// earlyOnsetCheck / earlyOnsetUses
// ---------------------------------------------------------------------------

const earlyBase = {
  castingTime: "action",
  targetUuids: ["Actor.t"],
  damagedUuid: "Actor.t",
  damagedIsAlly: true,
  canSee: true,
  usesRemaining: 1
};

test("Early Onset accepts an Action or Bonus Action Art on the damaged visible ally", () => {
  assert.deepEqual(earlyOnsetCheck(earlyBase), { warnings: [] });
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime: "bonus" }), { warnings: [] });
});

test("Early Onset warns about a Casting Time that is not Action or Bonus Action", () => {
  for (const castingTime of ["reaction", "minute", "", null]) {
    const result = earlyOnsetCheck({ ...earlyBase, castingTime });
    assert.deepEqual(result.warnings, ["castingTimeNotActionOrBonus"], String(castingTime));
  }
});

test("Early Onset requires the Art to target the damaged creature", () => {
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, damagedUuid: "Actor.other" }).warnings, ["mustTargetDamaged"]);
});

test("Early Onset requires an ally and visibility", () => {
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, damagedIsAlly: false }).warnings, ["notAlly"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, canSee: false }).warnings, ["notVisible"]);
});

test("Early Onset requires an unused charge", () => {
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, usesRemaining: 0 }).warnings, ["noUsesLeft"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, usesRemaining: -1 }).warnings, ["noUsesLeft"]);
});

test("Early Onset reports every broken condition at once", () => {
  const result = earlyOnsetCheck({
    castingTime: "reaction", targetUuids: ["Actor.t"], damagedUuid: "Actor.other",
    damagedIsAlly: false, canSee: false, usesRemaining: 0
  });
  assert.deepEqual([...result.warnings].sort(), [
    "castingTimeNotActionOrBonus", "mustTargetDamaged", "notAlly", "notVisible", "noUsesLeft"
  ].sort());
  assert.equal(result.warnings.length, 5, "no duplicates");
});

test("Early Onset uses equal Proficiency Bonus", () => {
  assert.equal(earlyOnsetUses(2), 2);
  assert.equal(earlyOnsetUses(3), 3);
  assert.equal(earlyOnsetUses(6), 6);
});

// ---------------------------------------------------------------------------
// Purity of the module itself
// ---------------------------------------------------------------------------

test("the Therapist rules module is free of Foundry, hooks, rolls and randomness", () => {
  const source = readFileSync(SRC_URL, "utf8");
  for (const pattern of [/\bgame\s*\./, /\bHooks\s*\./, /\bRoll\s*\(/, /Math\s*\.\s*random/]) {
    assert.equal(pattern.test(source), false, `module source must not match ${pattern}`);
  }
});

test("every specified export is a function or frozen constant of the expected type", () => {
  const fns = [
    therapyById, availableTherapies, therapyEligibility, validateSelection, activateDoctorIsIn,
    doctorIsInActive, quoteTherapies, riderFor, riderExpired, recuperativeHeal, earlyOnsetCheck, earlyOnsetUses
  ];
  for (const fn of fns) assert.equal(typeof fn, "function");
  assert.equal(Array.isArray(THERAPIES), true);
  assert.equal(typeof THERAPIST_FEATURES, "object");
});
