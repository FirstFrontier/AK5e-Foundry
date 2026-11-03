// Adversarial attack suite for the pure Therapist rules module (lane B `therapy-rules`).
// Written by the challenger AFTER the frozen acceptance tests, against the same binding spec:
//   SPEC = .codex-work/medic/SPEC-therapy-rules.md (2026-11-01) — cited as "SPEC L<n>".
//   SRC  = AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt — cited as "C3:<line>".
//   RUL  = ak5e/DECISIONS.md "Medic Therapist, Ward and Witchcraft owner rulings (2026-10-28)"
//          and "… open readings (2026-11-01)".
// This file is read-only with respect to production code: it must never edit
// `ak5e/scripts/therapist-rules.mjs` or the frozen test to go green.
// Tests whose names start with "ATTACK FINDING" are expected to fail against the current
// implementation; every other test pins behaviour the spec/source/rulings actually fix.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as rules from "../scripts/therapist-rules.mjs";

const {
  THERAPIES, THERAPIST_FEATURES, therapyById, availableTherapies,
  therapyEligibility, validateSelection, activateDoctorIsIn, doctorIsInActive,
  quoteTherapies, riderFor, riderExpired, recuperativeHeal, earlyOnsetCheck, earlyOnsetUses
} = rules;

const SRC_URL = new URL("../scripts/therapist-rules.mjs", import.meta.url);

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
const clone = value => JSON.parse(JSON.stringify(value));

// SPEC L31: art shape; null means unknown.
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
const WARNING_CODES = new Set([
  "notSingleTarget", "rangeTooShort", "durationTooShort", "noHealing",
  "unknownTargets", "unknownRange", "unknownDuration"
]);

const doctorState = (chosenId, expiresAt, allowance) => ({
  doctorIsIn: { chosenId, expiresAt }, concentratedAllowance: allowance
});

const riderCtx = (patch = {}) => ({
  spellMod: 4,
  art: art({
    targetCount: 1, rangeFeet: 60, rangeTouch: false, durationSeconds: 600,
    concentration: false, restoresHP: true, apSpent: 2
  }),
  castId: "cast-1",
  casterUuid: "Actor.medic",
  targetUuids: ["Actor.a"],
  worldTime: 1000,
  ...patch
});

// ---------------------------------------------------------------------------
// Constants: deep immutability and a clean export surface
// ---------------------------------------------------------------------------

test("every THERAPIES entry is deeply frozen, not just the array", () => {
  // SPEC L9-22: THERAPIES is a frozen array of nine entries with five fields each.
  assert.equal(THERAPIES.length, 9);
  for (const entry of THERAPIES) {
    assert.equal(Object.isFrozen(entry), true, `${entry.id} entry is frozen`);
    assert.throws(() => { entry.name = "Tampered"; }, TypeError, `${entry.id} entry cannot be written`);
    assert.throws(() => { entry.tier = "advanced"; }, TypeError, `${entry.id} tier cannot be rewritten`);
  }
  assert.throws(() => { THERAPIES[0] = { id: "x" }; }, TypeError);
  assert.throws(() => { THERAPIES.length = 0; }, TypeError);
});

test("THERAPIST_FEATURES is frozen with exactly the five feature levels", () => {
  // SPEC L27: basicTherapy 1, doctorIsIn 4, earlyOnset 7, advancedTherapy 11, concentratedTreatment 15.
  // C3:4925-4951 feature headings confirm 1st/4th/7th/11th/15th.
  assert.equal(Object.isFrozen(THERAPIST_FEATURES), true);
  assert.deepEqual(Object.keys(THERAPIST_FEATURES).sort(), [
    "advancedTherapy", "basicTherapy", "concentratedTreatment", "doctorIsIn", "earlyOnset"
  ]);
  assert.throws(() => { THERAPIST_FEATURES.advancedTherapy = 1; }, TypeError);
});

test("therapyById returns the shared frozen table entry and later calls stay intact", () => {
  // SPEC L24: therapyById returns the entry or null.
  const entry = therapyById("empowering");
  assert.equal(entry, THERAPIES.find(t => t.id === "empowering"));
  assert.throws(() => { entry.tier = "advanced"; }, TypeError);
  assert.equal(therapyById("empowering").tier, "basic", "a failed write must not corrupt the table");
  assert.equal(therapyById("cleansing").lifeSupportCost, 10);
});

test("availableTherapies returns a fresh array each call", () => {
  // SPEC L28: array of ids with minLevel <= medicLevel.
  const first = availableTherapies(11);
  first.push("bogus");
  first[0] = "bogus";
  assert.deepEqual(availableTherapies(11), ALL_IDS);
  assert.notEqual(availableTherapies(11), availableTherapies(11));
});

test("the module exports exactly the frozen surface and nothing else", () => {
  // SPEC L7-89: the export list is exhaustive.
  assert.deepEqual(Object.keys(rules).sort(), [
    "THERAPIES", "THERAPIST_FEATURES", "activateDoctorIsIn", "availableTherapies",
    "doctorIsInActive", "earlyOnsetCheck", "earlyOnsetUses", "quoteTherapies",
    "recuperativeHeal", "riderExpired", "riderFor", "therapyById", "therapyEligibility",
    "validateSelection"
  ].sort());
});

test("the module source has no imports, Foundry globals, clocks, randomness or dice rolls", () => {
  // SPEC L3 and L5: pure ES module; no game/ui/Hooks/foundry/Roll, no randomness, no I/O.
  const source = readFileSync(SRC_URL, "utf8");
  const forbidden = [
    /\bimport\s/, /\brequire\s*\(/,
    /\bgame\s*\./, /\bui\s*\./, /\bHooks\s*\./, /\bfoundry\s*\./, /\bRoll\s*\(/,
    /Math\s*\.\s*random/, /Date\s*\.\s*now/, /performance\s*\.\s*now/, /crypto\s*\./
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, `module source must not match ${pattern}`);
  }
});

// ---------------------------------------------------------------------------
// therapyEligibility edge values
// ---------------------------------------------------------------------------

test("longDistance accepts exactly 5 feet and rejects 4.999", () => {
  // SPEC L36: rangeTouch === true or rangeFeet >= 5.
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 5 })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 4.999 })), {
    eligible: false, warnings: ["rangeTooShort"]
  });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeFeet: 5.0001 })), { eligible: true, warnings: [] });
});

test("longDistance Touch wins even when rangeFeet is present and short", () => {
  // SPEC L36: Touch is an alternative to the 5-foot range, so it must not be gated on rangeFeet.
  // C3:4967: "Alternatively, when you cast an Art that has a range of Touch, you can make that Art's range 30 feet."
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeTouch: true, rangeFeet: 0 })), {
    eligible: true, warnings: []
  });
  assert.deepEqual(therapyEligibility("longDistance", art({ rangeTouch: true, rangeFeet: null })), {
    eligible: true, warnings: []
  });
});

test("longTerm accepts exactly 60 seconds and rejects 59.999", () => {
  // SPEC L37: durationSeconds >= 60. C3:4974: "a duration of 1 minute or longer".
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: 60 })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: 59.999 })), {
    eligible: false, warnings: ["durationTooShort"]
  });
  assert.deepEqual(therapyEligibility("longTerm", art({ durationSeconds: 60.0001 })), {
    eligible: true, warnings: []
  });
});

test("targetCount 0, 2 and 3 fail; 1 and 1.0 pass; null and undefined are unknown", () => {
  // SPEC L35: energising/recuperative need targetCount === 1; SPEC L41: null is unknown.
  // C3:4962 / C3:4983: "targets only one Creature".
  for (const id of ["energising", "recuperative"]) {
    assert.equal(therapyEligibility(id, art({ targetCount: 1 })).eligible, true, id);
    assert.equal(therapyEligibility(id, art({ targetCount: 1.0 })).eligible, true, id);
    for (const bad of [0, 2, 3]) {
      assert.deepEqual(therapyEligibility(id, art({ targetCount: bad })), {
        eligible: false, warnings: ["notSingleTarget"]
      }, `${id} targetCount ${bad}`);
    }
    assert.deepEqual(therapyEligibility(id, art({ targetCount: null })), {
      eligible: null, warnings: ["unknownTargets"]
    }, `${id} targetCount null`);
    assert.deepEqual(therapyEligibility(id, art({ targetCount: undefined })), {
      eligible: null, warnings: ["unknownTargets"]
    }, `${id} targetCount undefined`);
  }
});

test("cleansing/regenerative: a definite failure outranks an unknown in either order", () => {
  // SPEC L41: unknown → eligible null "unless another check already failed → false".
  // C3:4990 / C3:4995: restores HP to a single Creature.
  assert.deepEqual(therapyEligibility("cleansing", art({ restoresHP: false, targetCount: null })), {
    eligible: false, warnings: ["noHealing", "unknownTargets"]
  });
  assert.deepEqual(therapyEligibility("regenerative", art({ restoresHP: false, targetCount: 2 })), {
    eligible: false, warnings: ["noHealing", "notSingleTarget"]
  });
  assert.deepEqual(therapyEligibility("regenerative", art({ restoresHP: true, targetCount: 2 })), {
    eligible: false, warnings: ["notSingleTarget"]
  });
  assert.deepEqual(therapyEligibility("cleansing", art({ restoresHP: true, targetCount: null })), {
    eligible: null, warnings: ["unknownTargets"]
  });
});

test("psychological needs restoresHP === true and nothing else", () => {
  // SPEC L38: psychological needs restoresHP. C3:4977: "an Art that restores Hit Points".
  assert.deepEqual(therapyEligibility("psychological", art({ restoresHP: true })), { eligible: true, warnings: [] });
  assert.deepEqual(therapyEligibility("psychological", art({ restoresHP: false, targetCount: 2 })), {
    eligible: false, warnings: ["noHealing"]
  });
  assert.deepEqual(therapyEligibility("psychological", art({ restoresHP: true, targetCount: 0, durationSeconds: 0 })), {
    eligible: true, warnings: []
  });
});

test("empowering and resistance never read the art descriptor", () => {
  // SPEC L40: always eligible. A throwing proxy proves the check does not inspect art.
  const trap = new Proxy({}, { get() { throw new Error("art was read"); } });
  for (const id of ["empowering", "resistance"]) {
    assert.deepEqual(therapyEligibility(id, trap), { eligible: true, warnings: [] }, id);
  }
});

test("therapyEligibility rejects every case variant of a real id", () => {
  // SPEC L42: unknown therapy id throws TypeError. SPEC L24: ids are exact table ids.
  for (const bad of ["Empowering", "EMPOWERING", "long-distance", "cleansing ", "", null, undefined, 7]) {
    assert.throws(() => therapyEligibility(bad, art()), TypeError, String(bad));
  }
});

test("therapyEligibility only ever emits the seven exact warning codes", () => {
  // SPEC L34: warning codes are strings, exact.
  const values = [null, undefined, 0, 1, 2, 5, 59, 60];
  for (const id of ALL_IDS) {
    for (const targetCount of values) {
      for (const rangeFeet of values) {
        for (const durationSeconds of values) {
          for (const restoresHP of [true, false]) {
            const result = therapyEligibility(id, art({ targetCount, rangeFeet, durationSeconds, restoresHP }));
            for (const warning of result.warnings) {
              assert.equal(WARNING_CODES.has(warning), true, `${id} emitted ${warning}`);
            }
          }
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// validateSelection
// ---------------------------------------------------------------------------

test("two therapies are legal while Doctor Is In is active even if the chosen id is not selected", () => {
  // SPEC L46: allowed count is 2 while doctorIsIn.active. SPEC L50 / RUL 2026-11-01 #3:
  // the free chosen therapy counts as one of the two, but the count is still two.
  assert.deepEqual(validateSelection({
    selection: ["empowering", "energising"], medicLevel: 4,
    doctorIsIn: { active: true, chosenId: "longTerm" }
  }), { warnings: [] });
});

test("three therapies are too many at every level, even at 15 with Doctor Is In", () => {
  // SPEC L46; C3:4937: "you may use a second Therapy on each Art you cast".
  for (const medicLevel of [1, 4, 11, 15, 20]) {
    assert.deepEqual(validateSelection({
      selection: ["empowering", "energising", "longTerm"], medicLevel,
      doctorIsIn: { active: true, chosenId: "empowering" }
    }), { warnings: ["tooManyTherapies"] }, `level ${medicLevel}`);
  }
});

test("tooManyTherapies, duplicateTherapy and advancedTherapyLocked are each reported once", () => {
  // SPEC L46-48: three independent checks; SPEC L34-style exact codes.
  const result = validateSelection({
    selection: ["cleansing", "cleansing", "empowering"], medicLevel: 10,
    doctorIsIn: { active: true, chosenId: "empowering" }
  });
  assert.deepEqual([...result.warnings].sort(), [
    "advancedTherapyLocked", "duplicateTherapy", "tooManyTherapies"
  ]);
  assert.equal(result.warnings.length, 3, "no duplicate warnings");
});

test("advanced lock flips exactly between level 10 and 11", () => {
  // SPEC L48: an advanced therapy below level 11 is locked. C3:4930: 11th Level: Advanced Therapy.
  for (const id of ADVANCED_IDS) {
    assert.deepEqual(validateSelection({ selection: [id], medicLevel: 10, doctorIsIn: null }), {
      warnings: ["advancedTherapyLocked"]
    }, id);
    assert.deepEqual(validateSelection({ selection: [id], medicLevel: 11, doctorIsIn: null }), {
      warnings: []
    }, id);
  }
});

test("validateSelection throws for null/undefined ids and for non-array entries", () => {
  // SPEC L49: unknown id → TypeError.
  assert.throws(() => validateSelection({ selection: [null], medicLevel: 1 }), TypeError);
  assert.throws(() => validateSelection({ selection: [undefined], medicLevel: 1 }), TypeError);
  assert.throws(() => validateSelection({ selection: ["empowering", 3], medicLevel: 1 }), TypeError);
});

test("selection order does not change the warnings", () => {
  // SPEC L45: selection is "array of therapy ids in the order chosen" — order is presentation only.
  const a = validateSelection({
    selection: ["empowering", "cleansing"], medicLevel: 10, doctorIsIn: { active: true, chosenId: "empowering" }
  });
  const b = validateSelection({
    selection: ["cleansing", "empowering"], medicLevel: 10, doctorIsIn: { active: true, chosenId: "empowering" }
  });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// activateDoctorIsIn / doctorIsInActive
// ---------------------------------------------------------------------------

test("every basic therapy can be chosen for The Doctor Is In", () => {
  // SPEC L54; C3:4934: "choose one of your Basic Therapies".
  for (const chosenId of BASIC_IDS) {
    const state = activateDoctorIsIn({ chosenId, worldTime: 10, medicLevel: 4, state: null });
    assert.deepEqual(state, { doctorIsIn: { chosenId, expiresAt: 70 }, concentratedAllowance: 0 }, chosenId);
  }
});

test("expiresAt is exactly worldTime + 60, including fractional world time", () => {
  // SPEC L55; C3:4934: "For the next minute".
  assert.equal(activateDoctorIsIn({ chosenId: "longTerm", worldTime: 123.5, medicLevel: 4, state: null })
    .doctorIsIn.expiresAt, 183.5);
});

test("level 15 sets exactly 3 allowances and re-activation replaces rather than accumulates", () => {
  // SPEC L56; RUL 2026-10-28 "Concentrated Treatment lifetime": a later activation replaces
  // the remaining allowance with three; allowances do not accumulate.
  const fromTwo = activateDoctorIsIn({
    chosenId: "empowering", worldTime: 0, medicLevel: 15,
    state: { doctorIsIn: null, concentratedAllowance: 2 }
  });
  assert.equal(fromTwo.concentratedAllowance, 3);
  const again = activateDoctorIsIn({
    chosenId: "empowering", worldTime: 100, medicLevel: 15,
    state: { doctorIsIn: { chosenId: "empowering", expiresAt: 60 }, concentratedAllowance: 3 }
  });
  assert.equal(again.concentratedAllowance, 3, "never 6");
});

test("below level 15 the allowance is kept, and a missing state defaults to 0", () => {
  // SPEC L56: otherwise unchanged (default 0).
  for (const medicLevel of [1, 4, 10, 14]) {
    assert.equal(activateDoctorIsIn({
      chosenId: "empowering", worldTime: 0, medicLevel,
      state: { doctorIsIn: null, concentratedAllowance: 2 }
    }).concentratedAllowance, 2, `level ${medicLevel}`);
    assert.equal(activateDoctorIsIn({ chosenId: "empowering", worldTime: 0, medicLevel, state: null })
      .concentratedAllowance, 0, `level ${medicLevel} null state`);
  }
});

test("re-activation opens a new minute and swaps the chosen therapy", () => {
  // SPEC L55: Sets doctorIsIn = { chosenId, expiresAt: worldTime + 60 }.
  const state = activateDoctorIsIn({
    chosenId: "longTerm", worldTime: 500, medicLevel: 4,
    state: { doctorIsIn: { chosenId: "energising", expiresAt: 100 }, concentratedAllowance: 0 }
  });
  assert.deepEqual(state.doctorIsIn, { chosenId: "longTerm", expiresAt: 560 });
});

test("the returned state does not alias the input state", () => {
  // SPEC L3: every export returns a new object and never mutates inputs.
  const input = deepFreeze({ doctorIsIn: { chosenId: "longTerm", expiresAt: 120 }, concentratedAllowance: 1 });
  const before = clone(input);
  const state = activateDoctorIsIn({ chosenId: "empowering", worldTime: 10, medicLevel: 15, state: input });
  state.doctorIsIn.chosenId = "cleansing";
  state.concentratedAllowance = 99;
  assert.deepEqual(input, before);
  assert.deepEqual(activateDoctorIsIn({
    chosenId: "empowering", worldTime: 10, medicLevel: 15, state: input
  }), { doctorIsIn: { chosenId: "empowering", expiresAt: 70 }, concentratedAllowance: 3 });
});

test("doctorIsInActive is strictly before expiresAt", () => {
  // SPEC L58: true iff state.doctorIsIn and worldTime < expiresAt.
  const state = doctorState("empowering", 1060, 0);
  assert.equal(doctorIsInActive(state, 1059.999), true);
  assert.equal(doctorIsInActive(state, 1060), false);
  assert.equal(doctorIsInActive(state, 1060.001), false);
});

test("doctorIsInActive is false with no state or no activation", () => {
  // SPEC L58: state.doctorIsIn must be present.
  assert.equal(doctorIsInActive(null, 0), false);
  assert.equal(doctorIsInActive({ doctorIsIn: null, concentratedAllowance: 3 }, 0), false);
  assert.equal(doctorIsInActive({ concentratedAllowance: 3 }, 0), false);
});

test("ATTACK FINDING: activateDoctorIsIn rejects a non-numeric worldTime instead of concatenating it", () => {
  // SPEC L5: malformed input (a non-numeric value) is an error, never a silent result.
  // SPEC L55: expiresAt = worldTime + 60 is numeric.
  // Actual today: expiresAt === "100060" (string concatenation) — a corrupt persisted state.
  assert.throws(
    () => activateDoctorIsIn({ chosenId: "empowering", worldTime: "1000", medicLevel: 4, state: null }),
    TypeError
  );
});

test("ATTACK FINDING: activateDoctorIsIn rejects a non-numeric medicLevel", () => {
  // SPEC L5: non-numeric values are malformed input. SPEC L56: medicLevel >= 15 gates the allowance.
  // Actual today: "15" >= 15 coerces and silently grants 3 allowances.
  assert.throws(
    () => activateDoctorIsIn({ chosenId: "empowering", worldTime: 0, medicLevel: "15", state: null }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// quoteTherapies: allowance bookkeeping, Doctor Is In boundaries, packages
// ---------------------------------------------------------------------------

test("exactly three allowances: the fourth non-chosen therapy is paid", () => {
  // SPEC L64; C3:4949: "your next 3 Therapies (excluding the one chosen …)".
  // RUL 2026-10-28: three individual activations.
  const quote = quoteTherapies({
    selection: ["recuperative", "longTerm", "empowering", "psychological"],
    art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(quote.items.map(item => item.free), ["concentrated", "concentrated", "concentrated", null]);
  assert.deepEqual(quote.items.map(item => item.cost), [0, 0, 0, 5]);
  assert.equal(quote.allowanceUsed, 3);
  assert.equal(quote.allowanceAfter, 0);
  assert.equal(quote.lifeSupportCost, 5);
  assert.deepEqual(quote.healingPackages.map(p => p.therapyId), ["recuperative", "longTerm", "empowering"]);
});

test("the Doctor Is In chosen therapy never consumes an allowance", () => {
  // SPEC L63-64; RUL 2026-10-28: "excluding the one chosen for The Doctor Is In".
  const quote = quoteTherapies({
    selection: ["energising", "energising"],
    art: art({ restoresHP: true, apSpent: 3 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(quote.items, [
    { id: "energising", cost: 0, free: "doctorIsIn" },
    { id: "energising", cost: 0, free: "doctorIsIn" }
  ]);
  assert.equal(quote.allowanceUsed, 0);
  assert.equal(quote.allowanceAfter, 3);
  assert.deepEqual(quote.healingPackages, [], "the Doctor Is In free therapy is not a Concentrated package");
});

test("the chosen therapy is free even when the allowance is exhausted", () => {
  // SPEC L63: the Doctor Is In branch is independent of the allowance.
  const quote = quoteTherapies({
    selection: ["empowering", "energising"],
    art: art(), state: doctorState("energising", 1060, 0), worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(quote.items, [
    { id: "empowering", cost: 5, free: null },
    { id: "energising", cost: 0, free: "doctorIsIn" }
  ]);
  assert.equal(quote.allowanceAfter, 0);
});

test("after the minute the chosen therapy is paid and still spends no allowance", () => {
  // SPEC L64: allowance persists after the minute; the chosen therapy never consumes one.
  // C3:4934: the free window is one minute only.
  const quote = quoteTherapies({
    selection: ["energising", "recuperative"],
    art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 1060, lifeSupport: 100
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

test("two free therapies on one Art produce two packages, in selection order", () => {
  // SPEC L68; C3:4949: "an additional 1d6 … for each Arts Point spent".
  // RUL 2026-10-28: two qualifying Therapies on one Art consume two allowances and each adds its own package.
  const quote = quoteTherapies({
    selection: ["recuperative", "longTerm"],
    art: art({ restoresHP: true, apSpent: 3 }),
    state: doctorState("energising", 1060, 2), worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(quote.items.map(item => item.free), ["concentrated", "concentrated"]);
  assert.equal(quote.allowanceAfter, 0, "exactly two allowances were available and both were spent");
  assert.deepEqual(quote.healingPackages, [
    { therapyId: "recuperative", formula: "3d6" },
    { therapyId: "longTerm", formula: "3d6" }
  ]);
});

test("the chosen free therapy plus one concentrated therapy gives exactly one package", () => {
  // SPEC L63 and L68: packages attach to concentrated items only.
  const quote = quoteTherapies({
    selection: ["energising", "recuperative"],
    art: art({ restoresHP: true, apSpent: 1 }),
    state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(quote.healingPackages, [{ therapyId: "recuperative", formula: "1d6" }]);
  assert.equal(quote.allowanceUsed, 1);
  assert.equal(quote.allowanceAfter, 2);
});

test("allowanceAfter chains across consecutive quotes 3 → 2 → 1 → 0 → paid", () => {
  // SPEC L64: allowance −1 per concentrated item, returned as allowanceAfter.
  // RUL 2026-10-28: unspent allowances remain for later casts.
  const base = { doctorIsIn: { chosenId: "energising", expiresAt: 1060 } };
  const q1 = quoteTherapies({
    selection: ["recuperative", "longTerm"], art: art({ restoresHP: true, apSpent: 1 }),
    state: { ...base, concentratedAllowance: 3 }, worldTime: 1000, lifeSupport: 100
  });
  assert.equal(q1.allowanceAfter, 1);
  const q2 = quoteTherapies({
    selection: ["empowering"], art: art({ restoresHP: true, apSpent: 1 }),
    state: { ...base, concentratedAllowance: q1.allowanceAfter }, worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(q2.items, [{ id: "empowering", cost: 0, free: "concentrated" }]);
  assert.equal(q2.allowanceAfter, 0);
  const q3 = quoteTherapies({
    selection: ["empowering"], art: art({ restoresHP: true, apSpent: 1 }),
    state: { ...base, concentratedAllowance: q2.allowanceAfter }, worldTime: 1000, lifeSupport: 100
  });
  assert.deepEqual(q3.items, [{ id: "empowering", cost: 5, free: null }]);
  assert.equal(q3.allowanceUsed, 0);
  assert.equal(q3.allowanceAfter, 0);
  assert.deepEqual(q3.healingPackages, []);
});

test("allowances persist past the minute and keep discounting later casts", () => {
  // SPEC L64; RUL 2026-10-28 "Concentrated Treatment lifetime".
  const quote = quoteTherapies({
    selection: ["recuperative", "empowering"], art: art({ restoresHP: true, apSpent: 2 }),
    state: doctorState("energising", 1060, 3), worldTime: 99999, lifeSupport: 100
  });
  assert.deepEqual(quote.items.map(item => item.free), ["concentrated", "concentrated"]);
  assert.equal(quote.allowanceAfter, 1);
});

test("packages require both restoresHP and a positive AP spend", () => {
  // SPEC L68: only when art.restoresHP and art.apSpent > 0.
  const state = doctorState("energising", 1060, 3);
  const noHeal = quoteTherapies({
    selection: ["recuperative"], art: art({ restoresHP: false, apSpent: 4 }),
    state, worldTime: 1000, lifeSupport: 100
  });
  assert.equal(noHeal.items[0].free, "concentrated", "the allowance is still spent");
  assert.deepEqual(noHeal.healingPackages, []);
  for (const apSpent of [0, -1]) {
    const quote = quoteTherapies({
      selection: ["recuperative"], art: art({ restoresHP: true, apSpent }),
      state, worldTime: 1000, lifeSupport: 100
    });
    assert.equal(quote.items[0].free, "concentrated", `apSpent ${apSpent}`);
    assert.deepEqual(quote.healingPackages, [], `apSpent ${apSpent}`);
  }
});

test("the package formula uses the AP actually spent, as a dice string", () => {
  // SPEC L68: formula = "<apSpent>d6". SPEC L5: dice appear only as formula strings; nothing is rolled.
  for (const apSpent of [1, 2, 5]) {
    const quote = quoteTherapies({
      selection: ["recuperative"], art: art({ restoresHP: true, apSpent }),
      state: doctorState("energising", 1060, 3), worldTime: 1000, lifeSupport: 100
    });
    assert.equal(quote.healingPackages[0].formula, `${apSpent}d6`);
  }
});

test("Life Support clamps at zero with a reported shortfall, and an exact spend has none", () => {
  // SPEC L67; WORKFLOW §3.2.3 overspend clamps at 0.
  const over = quoteTherapies({ selection: ["cleansing"], art: art(), worldTime: 0, lifeSupport: 4 });
  assert.equal(over.lifeSupportCost, 10);
  assert.equal(over.lifeSupportAfter, 0);
  assert.equal(over.shortfall, 6);
  const exact = quoteTherapies({ selection: ["cleansing"], art: art(), worldTime: 0, lifeSupport: 10 });
  assert.equal(exact.lifeSupportAfter, 0);
  assert.equal(exact.shortfall, 0);
  const broke = quoteTherapies({ selection: ["empowering"], art: art(), worldTime: 0, lifeSupport: 0 });
  assert.equal(broke.lifeSupportAfter, 0);
  assert.equal(broke.shortfall, 5);
});

test("items preserve selection order and carry exactly id/cost/free", () => {
  // SPEC L66: items are [{ id, cost, free }] in order.
  const quote = quoteTherapies({
    selection: ["psychological", "empowering", "cleansing"], art: art(),
    worldTime: 0, lifeSupport: 100
  });
  assert.deepEqual(quote.items.map(item => item.id), ["psychological", "empowering", "cleansing"]);
  for (const item of quote.items) {
    assert.deepEqual(Object.keys(item).sort(), ["cost", "free", "id"]);
  }
});

test("an empty selection quotes zero cost and keeps the Life Support pool", () => {
  // SPEC L62: walk the selection; an empty selection has nothing to walk.
  const quote = quoteTherapies({ selection: [], art: art(), worldTime: 0, lifeSupport: 37 });
  assert.deepEqual(quote, {
    items: [], lifeSupportCost: 0, lifeSupportAfter: 37, shortfall: 0,
    allowanceUsed: 0, allowanceAfter: 0, healingPackages: []
  });
});

test("quoteTherapies throws for an unknown id before quoting anything", () => {
  // SPEC L5 / L49: unknown id is malformed input.
  assert.throws(() => quoteTherapies({
    selection: ["empowering", "nope"], art: art(), worldTime: 0, lifeSupport: 100
  }), TypeError);
});

test("quoteTherapies never mutates deeply frozen inputs", () => {
  // SPEC L3: never mutates inputs.
  const selection = deepFreeze(["energising", "recuperative", "empowering"]);
  const artInput = deepFreeze(art({ restoresHP: true, apSpent: 2 }));
  const state = deepFreeze(doctorState("energising", 1060, 2));
  const before = clone({ selection, art: artInput, state });
  quoteTherapies({ selection, art: artInput, state, worldTime: 1000, lifeSupport: 20 });
  assert.deepEqual({ selection, art: artInput, state }, before);
});

test("a returned quote is fresh and does not alias the state or art", () => {
  // SPEC L3: returns new objects; mutating a returned value must not affect later calls.
  const state = doctorState("energising", 1060, 3);
  const input = art({ restoresHP: true, apSpent: 2 });
  const first = quoteTherapies({
    selection: ["recuperative"], art: input, state, worldTime: 1000, lifeSupport: 20
  });
  first.items[0].cost = 999;
  first.items.push({ id: "x", cost: 1, free: null });
  first.healingPackages[0].formula = "9d6";
  first.healingPackages.push({ therapyId: "x", formula: "1d6" });
  const second = quoteTherapies({
    selection: ["recuperative"], art: input, state, worldTime: 1000, lifeSupport: 20
  });
  assert.deepEqual(second.items, [{ id: "recuperative", cost: 0, free: "concentrated" }]);
  assert.deepEqual(second.healingPackages, [{ therapyId: "recuperative", formula: "2d6" }]);
  assert.equal(state.concentratedAllowance, 3);
  assert.equal(input.apSpent, 2);
});

test("ATTACK FINDING: quoteTherapies rejects a non-array selection instead of quoting nothing", () => {
  // SPEC L45: selection is an array of therapy ids. SPEC L5: malformed input is an error.
  // Actual today: a bare id string is treated as an empty selection — a free, empty quote.
  assert.throws(
    () => quoteTherapies({ selection: "empowering", art: art(), worldTime: 0, lifeSupport: 20 }),
    TypeError
  );
});

// ---------------------------------------------------------------------------
// riderFor: numbers and shape
// ---------------------------------------------------------------------------

test("longTerm doubles the duration and caps at 24 hours, exactly", () => {
  // SPEC L75: durationSeconds = min(art.durationSeconds * 2, 86400). C3:4974-4976: 24-hour cap.
  const duration = value => riderFor("longTerm", riderCtx({ art: art({ durationSeconds: value }) })).durationSeconds;
  assert.equal(duration(60), 120);
  assert.equal(duration(600), 1200);
  assert.equal(duration(43199), 86398);
  assert.equal(duration(43200), 86400, "exactly 12 hours of input doubles to exactly 24 hours");
  assert.equal(duration(43201), 86400, "above the cap still caps");
  assert.equal(duration(86400), 86400);
});

test("longTerm concentration advantage requires exactly true", () => {
  // SPEC L75: concentrationAdvantage: art.concentration === true.
  const advantage = value => riderFor("longTerm", riderCtx({ art: art({ durationSeconds: 60, concentration: value }) }))
    .concentrationAdvantage;
  assert.equal(advantage(true), true);
  for (const value of [false, null, undefined, 1, "true"]) {
    assert.equal(advantage(value), false, String(value));
  }
});

test("longDistance makes Touch 30 feet and otherwise doubles the range", () => {
  // SPEC L74; C3:4967.
  const range = patch => riderFor("longDistance", riderCtx({ art: art(patch) })).rangeFeet;
  assert.equal(range({ rangeTouch: true, rangeFeet: null }), 30);
  assert.equal(range({ rangeTouch: true, rangeFeet: 5 }), 30, "Touch wins over a known range");
  assert.equal(range({ rangeTouch: false, rangeFeet: 5 }), 10);
  assert.equal(range({ rangeTouch: false, rangeFeet: 60 }), 120);
  assert.equal(range({ rangeTouch: false, rangeFeet: 0 }), 0);
});

test("empowering carries the Spellcasting modifier and a one-minute expiry", () => {
  // SPEC L72; C3:4955.
  for (const spellMod of [4, 0, -2]) {
    const rider = riderFor("empowering", riderCtx({ spellMod, worldTime: 500 }));
    assert.equal(rider.amount, spellMod);
    assert.equal(rider.consume, "nextSuccessfulAttack");
    assert.deepEqual(rider.expires, { worldTime: 560 });
  }
});

test("immediate riders are marked expires: null", () => {
  // SPEC L73, L78: energising and cleansing are cast-time only.
  assert.equal(riderFor("energising", riderCtx()).expires, null);
  assert.equal(riderFor("cleansing", riderCtx()).expires, null);
  assert.equal(riderFor("energising", riderCtx()).kind, "moveHalfSpeed");
  assert.equal(riderFor("cleansing", riderCtx()).count, 1);
});

test("psychological and resistance riders expire at the caster's next turn start", () => {
  // SPEC L76, L80; C3:4977 / C3:4998 "before/until the beginning of your next Turn".
  const psych = riderFor("psychological", riderCtx());
  assert.deepEqual(psych.abilities, ["int", "wis", "cha"]);
  assert.equal(psych.uses, 1);
  assert.deepEqual(psych.expires, { casterNextTurnStart: true });
  const resist = riderFor("resistance", riderCtx());
  assert.equal(resist.against, "arts");
  assert.equal(resist.uses, null, "unlimited uses");
  assert.deepEqual(resist.expires, { casterNextTurnStart: true });
});

test("regenerative and recuperative riders last one minute from the cast", () => {
  // SPEC L77, L79; C3:4983 / C3:4995 "for the next minute".
  const regen = riderFor("regenerative", riderCtx({ worldTime: 700 }));
  assert.equal(regen.formula, "1d6");
  assert.deepEqual(regen.expires, { worldTime: 760 });
  const recup = riderFor("recuperative", riderCtx({ spellMod: 3, worldTime: 700 }));
  assert.equal(recup.amount, 3);
  assert.deepEqual(recup.expires, { worldTime: 760 });
});

test("every rider carries the six base keys and a copied targetUuids array", () => {
  // SPEC L71: every rider has therapyId, castId, casterUuid, targetUuids, kind, expires.
  for (const id of ALL_IDS) {
    const ctx = riderCtx({ targetUuids: ["Actor.a", "Actor.b"] });
    const rider = riderFor(id, ctx);
    for (const key of ["therapyId", "castId", "casterUuid", "targetUuids", "kind", "expires"]) {
      assert.equal(Object.hasOwn(rider, key), true, `${id} has ${key}`);
    }
    assert.deepEqual(rider.targetUuids, ["Actor.a", "Actor.b"], id);
    assert.notEqual(rider.targetUuids, ctx.targetUuids, `${id} copies targetUuids`);
    assert.equal(rider.therapyId, id);
    assert.equal(rider.castId, "cast-1");
    assert.equal(rider.casterUuid, "Actor.medic");
  }
});

test("mutating a returned rider never affects the context or later calls", () => {
  // SPEC L3: new objects; mutating a returned value must not affect later calls.
  const ctx = deepFreeze(riderCtx({ targetUuids: ["Actor.a"] }));
  const before = clone(ctx);
  const rider = riderFor("longTerm", ctx);
  rider.targetUuids.push("Actor.z");
  rider.expires = { worldTime: 0 };
  const psych = riderFor("psychological", ctx);
  psych.abilities.push("str");
  assert.deepEqual(ctx, before);
  assert.deepEqual(riderFor("longTerm", ctx).targetUuids, ["Actor.a"]);
  assert.deepEqual(riderFor("psychological", ctx).abilities, ["int", "wis", "cha"]);
});

test("riderFor throws for unknown ids, including wrong case", () => {
  // SPEC L5: unknown id is malformed input.
  for (const bad of ["nope", "Empowering", "", null, undefined]) {
    assert.throws(() => riderFor(bad, riderCtx()), TypeError, String(bad));
  }
});

test("ATTACK FINDING: riderFor rejects a non-numeric worldTime instead of storing a concatenated string", () => {
  // SPEC L5: malformed input is an error. SPEC L72: expires is { worldTime: worldTime + 60 } (numeric).
  // Actual today: expires.worldTime === "100060".
  assert.throws(() => riderFor("empowering", riderCtx({ worldTime: "1000" })), TypeError);
});

// ---------------------------------------------------------------------------
// riderExpired boundaries
// ---------------------------------------------------------------------------

test("world-time expiry is inclusive at exactly expires.worldTime", () => {
  // SPEC L83: expired when worldTime >= expires.worldTime.
  const rider = { expires: { worldTime: 1060 } };
  assert.equal(riderExpired(rider, { worldTime: 1059.999, casterTurnStarted: false }), false);
  assert.equal(riderExpired(rider, { worldTime: 1060, casterTurnStarted: false }), true);
  assert.equal(riderExpired(rider, { worldTime: 1060.001, casterTurnStarted: false }), true);
});

test("turn-scoped riders expire only for casterTurnStarted === true", () => {
  // SPEC L83: turn expiry when casterTurnStarted === true (strict).
  const rider = { expires: { casterNextTurnStart: true } };
  assert.equal(riderExpired(rider, { worldTime: 99999, casterTurnStarted: false }), false);
  assert.equal(riderExpired(rider, { worldTime: 0, casterTurnStarted: true }), true);
  assert.equal(riderExpired(rider, { worldTime: 0, casterTurnStarted: "true" }), false);
});

test("immediate riders are expired once applied", () => {
  // SPEC L83: expires: null riders return true.
  assert.equal(riderExpired({ expires: null }, { worldTime: 0, casterTurnStarted: false }), true);
  assert.equal(riderExpired(riderFor("energising", riderCtx()), { worldTime: 0 }), true);
  assert.equal(riderExpired(riderFor("cleansing", riderCtx()), { worldTime: 0 }), true);
});

test("riders produced by riderFor expire on their own clocks", () => {
  // SPEC L72/L76/L79/L83.
  const empowering = riderFor("empowering", riderCtx({ worldTime: 1000 }));
  assert.equal(riderExpired(empowering, { worldTime: 1059 }), false);
  assert.equal(riderExpired(empowering, { worldTime: 1060 }), true);
  const psych = riderFor("psychological", riderCtx({ worldTime: 1000 }));
  assert.equal(riderExpired(psych, { worldTime: 99999, casterTurnStarted: false }), false);
  assert.equal(riderExpired(psych, { worldTime: 0, casterTurnStarted: true }), true);
});

// ---------------------------------------------------------------------------
// recuperativeHeal
// ---------------------------------------------------------------------------

test("recuperativeHeal heals the rider amount once for hostile damage to its target", () => {
  // SPEC L86; C3:4983; RUL 2026-10-28 "Recuperative Therapy granularity".
  const rider = { amount: 4, targetUuids: ["Actor.a", "Actor.b"] };
  const result = recuperativeHeal(rider, { id: "app-1", targetUuid: "Actor.b", hostile: true, amount: 9 }, []);
  assert.deepEqual(result, { heal: 4, seen: ["app-1"] });
});

test("hostile must be exactly true", () => {
  // SPEC L86: heal = 0 when hostile !== true.
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const base = { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 9 };
  for (const hostile of [false, "yes", 1, null, undefined]) {
    const result = recuperativeHeal(rider, { ...base, hostile }, []);
    assert.equal(result.heal, 0, String(hostile));
    assert.deepEqual(result.seen, [], `${String(hostile)} is not recorded as handled`);
  }
});

test("zero and negative damage do not heal and are not recorded", () => {
  // SPEC L86: heal = 0 when amount <= 0.
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const base = { id: "app-1", targetUuid: "Actor.a", hostile: true };
  for (const amount of [0, -3]) {
    assert.deepEqual(recuperativeHeal(rider, { ...base, amount }, []), { heal: 0, seen: [] }, String(amount));
  }
});

test("damage to a creature outside the rider's targets does not heal", () => {
  // SPEC L86: heal = 0 when the target is not in rider.targetUuids.
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  assert.deepEqual(
    recuperativeHeal(rider, { id: "app-1", targetUuid: "Actor.z", hostile: true, amount: 9 }, []),
    { heal: 0, seen: [] }
  );
});

test("a repeated application id heals zero and leaves seen unchanged", () => {
  // SPEC L86: heal = 0 when id is already in seen. RUL 2026-10-28: once per application.
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const seen = deepFreeze(["app-1"]);
  const result = recuperativeHeal(rider, { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 9 }, seen);
  assert.equal(result.heal, 0);
  assert.deepEqual(result.seen, ["app-1"]);
  assert.notEqual(result.seen, seen);
  assert.deepEqual(seen, ["app-1"]);
});

test("seen is never mutated and the result is always a new array", () => {
  // SPEC L86: "Returns the new seen array (input unchanged)."
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const seen = deepFreeze([]);
  const result = recuperativeHeal(rider, { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 1 }, seen);
  assert.deepEqual(seen, []);
  assert.notEqual(result.seen, seen);
  result.seen.push("app-9");
  assert.deepEqual(seen, []);
});

test("separate hostile applications accumulate once each, in order", () => {
  // SPEC L86; RUL 2026-10-28: separately applied hits trigger separately.
  const rider = { amount: 4, targetUuids: ["Actor.a"] };
  const first = recuperativeHeal(rider, { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 5 }, []);
  const second = recuperativeHeal(rider, { id: "app-2", targetUuid: "Actor.a", hostile: true, amount: 7 }, first.seen);
  const third = recuperativeHeal(rider, { id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 5 }, second.seen);
  assert.equal(first.heal, 4);
  assert.equal(second.heal, 4);
  assert.deepEqual(second.seen, ["app-1", "app-2"]);
  assert.equal(third.heal, 0);
  assert.deepEqual(third.seen, ["app-1", "app-2"]);
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

test("Early Onset: each broken condition maps to exactly its own code", () => {
  // SPEC L89; C3:4938-4941.
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime: "reaction" }).warnings, ["castingTimeNotActionOrBonus"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime: "Action" }).warnings, ["castingTimeNotActionOrBonus"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime: null }).warnings, ["castingTimeNotActionOrBonus"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, damagedUuid: "Actor.other" }).warnings, ["mustTargetDamaged"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, damagedIsAlly: false }).warnings, ["notAlly"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, canSee: false }).warnings, ["notVisible"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, usesRemaining: 0 }).warnings, ["noUsesLeft"]);
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, usesRemaining: -1 }).warnings, ["noUsesLeft"]);
});

test("Early Onset: all five codes at once, with no duplicates", () => {
  // SPEC L89: every broken condition is reported.
  const result = earlyOnsetCheck({
    castingTime: "minute", targetUuids: ["Actor.t"], damagedUuid: "Actor.other",
    damagedIsAlly: false, canSee: false, usesRemaining: 0
  });
  assert.deepEqual([...result.warnings].sort(), [
    "castingTimeNotActionOrBonus", "mustTargetDamaged", "notAlly", "notVisible", "noUsesLeft"
  ].sort());
  assert.equal(result.warnings.length, 5);
});

test("Early Onset: Action and Bonus Action pass, other casting times do not", () => {
  // SPEC L89: castingTime not "action"/"bonus".
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime: "action" }), { warnings: [] });
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime: "bonus" }), { warnings: [] });
  for (const castingTime of ["reaction", "minute", "hour", "", undefined]) {
    assert.deepEqual(earlyOnsetCheck({ ...earlyBase, castingTime }).warnings, ["castingTimeNotActionOrBonus"],
      String(castingTime));
  }
});

test("Early Onset: a fractional use remaining still counts as a use", () => {
  // SPEC L89: noUsesLeft only when usesRemaining <= 0.
  assert.deepEqual(earlyOnsetCheck({ ...earlyBase, usesRemaining: 0.5 }), { warnings: [] });
});

test("Early Onset does not mutate targetUuids", () => {
  // SPEC L3: never mutates inputs.
  const targetUuids = deepFreeze(["Actor.t", "Actor.u"]);
  earlyOnsetCheck({ ...earlyBase, targetUuids });
  assert.deepEqual(targetUuids, ["Actor.t", "Actor.u"]);
});

test("earlyOnsetUses returns the Proficiency Bonus unchanged", () => {
  // SPEC L89; C3:4941: "a number of times equal to your Proficiency Bonus".
  for (const pb of [2, 3, 4, 5, 6]) assert.equal(earlyOnsetUses(pb), pb);
});

test("earlyOnsetUses rejects non-numeric and non-finite proficiency bonuses", () => {
  // SPEC L5: non-numeric values are malformed input.
  for (const bad of ["3", null, undefined, NaN, Infinity, -Infinity, {}]) {
    assert.throws(() => earlyOnsetUses(bad), TypeError, String(bad));
  }
});

test("ATTACK FINDING: earlyOnsetCheck rejects a non-numeric usesRemaining", () => {
  // SPEC L5: malformed input is an error, never a rules warning.
  // SPEC L89: usesRemaining <= 0 is a rules condition on a numeric input.
  // Actual today: "1" silently passes; "abc" becomes a noUsesLeft warning (malformed → warning).
  assert.throws(() => earlyOnsetCheck({ ...earlyBase, usesRemaining: "1" }), TypeError);
  assert.throws(() => earlyOnsetCheck({ ...earlyBase, usesRemaining: "abc" }), TypeError);
});

// ---------------------------------------------------------------------------
// Cross-cutting: malformed vs rules failure, and input independence
// ---------------------------------------------------------------------------

test("ATTACK FINDING: validateSelection rejects a non-array selection instead of silently passing", () => {
  // SPEC L45: selection is an array of therapy ids. SPEC L5: malformed input is an error.
  // Actual today: "cleansing" is treated as no selection — no advanced lock at level 1.
  assert.throws(() => validateSelection({ selection: "cleansing", medicLevel: 1, doctorIsIn: null }), TypeError);
});

test("ATTACK FINDING: validateSelection rejects a non-numeric medicLevel", () => {
  // SPEC L5: non-numeric values are malformed input. SPEC L48: the lock compares against level 11.
  // Actual today: "11" >= 11 coerces, so an advanced therapy is unlocked by a string level.
  assert.throws(() => validateSelection({ selection: ["cleansing"], medicLevel: "11", doctorIsIn: null }), TypeError);
});

test("rules failures stay warnings: every eligibility/selection/early-onset failure returns codes, never throws", () => {
  // SPEC L5: rules failures are warnings, never errors.
  const failingArt = art({ targetCount: 0, rangeFeet: 0, durationSeconds: 0, restoresHP: false });
  for (const id of ALL_IDS) {
    assert.doesNotThrow(() => therapyEligibility(id, failingArt), id);
  }
  assert.doesNotThrow(() => validateSelection({
    selection: ["cleansing", "cleansing", "regenerative"], medicLevel: 1, doctorIsIn: null
  }));
  assert.doesNotThrow(() => earlyOnsetCheck({
    castingTime: "reaction", targetUuids: [], damagedUuid: "x",
    damagedIsAlly: false, canSee: false, usesRemaining: 0
  }));
  assert.doesNotThrow(() => quoteTherapies({
    selection: ["cleansing"], art: failingArt, worldTime: 0, lifeSupport: 0
  }));
});

test("no exported function mutates a deeply frozen argument in any code path", () => {
  // SPEC L3: every export never mutates inputs.
  const frozenArt = deepFreeze(art({ targetCount: 1, rangeFeet: 30, durationSeconds: 60, restoresHP: true, apSpent: 2 }));
  const frozenSelection = deepFreeze(["empowering", "recuperative"]);
  const frozenState = deepFreeze(doctorState("empowering", 1060, 3));
  const frozenCtx = deepFreeze(riderCtx({ targetUuids: ["Actor.a"] }));
  const frozenRider = deepFreeze({ amount: 4, targetUuids: ["Actor.a"] });
  const frozenApplication = deepFreeze({ id: "app-1", targetUuid: "Actor.a", hostile: true, amount: 5 });
  const frozenSeen = deepFreeze([]);
  const frozenTargets = deepFreeze(["Actor.t"]);
  const before = clone({
    frozenArt, frozenSelection, frozenState, frozenCtx, frozenRider, frozenApplication, frozenSeen, frozenTargets
  });
  for (const id of ALL_IDS) therapyEligibility(id, frozenArt);
  validateSelection({ selection: frozenSelection, medicLevel: 15, doctorIsIn: { active: true, chosenId: "empowering" } });
  activateDoctorIsIn({ chosenId: "empowering", worldTime: 0, medicLevel: 15, state: frozenState });
  doctorIsInActive(frozenState, 1000);
  quoteTherapies({ selection: frozenSelection, art: frozenArt, state: frozenState, worldTime: 1000, lifeSupport: 20 });
  for (const id of ALL_IDS) riderFor(id, frozenCtx);
  riderExpired(riderFor("empowering", frozenCtx), { worldTime: 0, casterTurnStarted: false });
  recuperativeHeal(frozenRider, frozenApplication, frozenSeen);
  earlyOnsetCheck({
    castingTime: "action", targetUuids: frozenTargets, damagedUuid: "Actor.t",
    damagedIsAlly: true, canSee: true, usesRemaining: 1
  });
  assert.deepEqual({
    frozenArt, frozenSelection, frozenState, frozenCtx, frozenRider, frozenApplication, frozenSeen, frozenTargets
  }, before);
});

test("mutating one returned warnings array never leaks into the next call", () => {
  // SPEC L3: every call returns new objects.
  const first = therapyEligibility("cleansing", art({ restoresHP: false, targetCount: null }));
  first.warnings.push("bogus");
  assert.deepEqual(therapyEligibility("cleansing", art({ restoresHP: false, targetCount: null })).warnings,
    ["noHealing", "unknownTargets"]);
  const selection = validateSelection({ selection: [], medicLevel: 1, doctorIsIn: null });
  selection.warnings.push("bogus");
  assert.deepEqual(validateSelection({ selection: [], medicLevel: 1, doctorIsIn: null }), { warnings: [] });
  const early = earlyOnsetCheck(earlyBase);
  early.warnings.push("bogus");
  assert.deepEqual(earlyOnsetCheck(earlyBase), { warnings: [] });
});
