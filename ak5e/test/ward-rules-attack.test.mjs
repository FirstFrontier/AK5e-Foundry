// ADVERSARIAL ATTACK-PASS tests for lane C `ward-rules` (challenger, 2026-11-01).
//
// Written after the implementation, against the same oracles as the frozen suite:
//   - .codex-work/medic/SPEC-ward-rules.md (binding; cited by section name)
//   - AK5e v1.3.1 Ch.3 Ward C3:5049-5087 and Life Support C3:4650-4660
//   - ak5e/DECISIONS.md "Medic Therapist, Ward and Witchcraft owner rulings (2026-10-28)"
//     and "... open readings (2026-11-01)"
//
// This file is deliberately hostile: exact boundaries (0, 30 ft, level 14/15/20,
// LS 9/10/11 and 14/15/16), clamped/shortfall arithmetic, pool non-stacking,
// cross-Medic Ward ownership, Collective Ward ordering, warning codes *and their
// order*, formula strings, determinism, deep-frozen nested inputs, freshness of
// returned containers, and malformed-input rejection.
//
// Every assertion below cites the spec section or source line it depends on.
// Behaviours the spec/rulings leave open are NOT asserted here; they are listed
// in the challenger report as questions.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as api from "../scripts/ward-rules.mjs";
import {
  WARD_FEATURES,
  wardGrant,
  extraTempHP,
  choosePool,
  wardOf,
  reconcileTag,
  statusResistance,
  treatTheCause,
  treatTheCauseOutcome,
  wardingSurge,
  restoreReaction,
  collectiveWardSettlement,
  wardRegeneration
} from "../scripts/ward-rules.mjs";

// ---------------------------------------------------------------- helpers

const sorted = (values) => [...values].sort();
const clone = (value) => structuredClone(value);
const byUuid = (updates) => Object.fromEntries(updates.map((update) => [update.uuid, update]));

/** Deep-freeze a fixture so any write by the module throws under ESM strict mode. */
const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
    Object.freeze(value);
  }
  return value;
};

const MEDIC = "Actor.medicWard";
const OTHER_MEDIC = "Actor.medicOther";
const wardTag = (overrides = {}) => ({ medicUuid: MEDIC, grantedAt: "combat1:2:3", amount: 8, ...overrides });

const settlement = (overrides = {}) => ({
  damage: 20,
  recipientTemp: 5,
  recipientHasWard: true,
  recipientDistanceFeet: 10,
  donors: [{ uuid: "Actor.donorA", ward: 8, distanceFeet: 10 }],
  removals: { "Actor.donorA": 5 },
  ...overrides
});

// ------------------------------------------------- module surface (SPEC Exports)

test("attack: the module exports exactly the frozen API surface", () => {
  // SPEC "Exports" lists these twelve functions plus WARD_FEATURES; nothing else.
  assert.deepEqual(sorted(Object.keys(api)), sorted([
    "WARD_FEATURES",
    "wardGrant",
    "extraTempHP",
    "choosePool",
    "wardOf",
    "reconcileTag",
    "statusResistance",
    "treatTheCause",
    "treatTheCauseOutcome",
    "wardingSurge",
    "restoreReaction",
    "collectiveWardSettlement",
    "wardRegeneration"
  ]));
  assert.equal("default" in api, false, "the module is named exports only");
  for (const name of Object.keys(api)) {
    assert.equal(typeof api[name], name === "WARD_FEATURES" ? "object" : "function", `${name} export kind`);
  }
});

// --------------------------------------------- WARD_FEATURES (SPEC, C3:5049-5087)

test("attack: WARD_FEATURES levels match the printed features and cannot be altered", () => {
  // C3:5059 (1st), C3:5063 (4th), C3:5066 (7th), C3:5071 (11th), C3:5081-5085 (15th).
  assert.deepEqual(WARD_FEATURES, {
    preventionNotCure: 1,
    statusResistance: 4,
    treatTheCause: 7,
    wardingSurge: 11,
    communityCare: 15
  });
  assert.equal(Object.isFrozen(WARD_FEATURES), true);
  for (const level of Object.values(WARD_FEATURES)) {
    assert.equal(Number.isInteger(level), true);
    assert.ok(level >= 1 && level <= 20);
  }
  // A second reference through the namespace must be the same frozen object.
  assert.equal(api.WARD_FEATURES, WARD_FEATURES);
  // Rejected writes must not corrupt the table (ESM modules run in strict mode).
  assert.throws(() => { WARD_FEATURES.statusResistance = 5; }, TypeError);
  assert.equal(WARD_FEATURES.statusResistance, 4);
});

// ------------------------------------------ wardGrant (C3:5059-5061, DECISIONS #4)

test("attack: wardGrant base boundary 0 keeps the die and the AP part ordering", () => {
  // SPEC wardGrant: formula is "the string sum of the non-zero parts in order base, die, AP".
  assert.deepEqual(
    wardGrant({ healingAmount: 0, actionType: "action", fromArt: true, apSpent: 2 }),
    { base: 0, dieFormula: "1d8", apBonus: 2, formula: "1d8 + 2" }
  );
  assert.deepEqual(
    wardGrant({ healingAmount: 0, actionType: "bonus", fromArt: false, apSpent: 0 }),
    { base: 0, dieFormula: "1d8", apBonus: 0, formula: "1d8" }
  );
  // No die and no AP: nothing to add. "0" is the degenerate rendering of the empty sum.
  assert.equal(wardGrant({ healingAmount: 0, actionType: "reaction", fromArt: false, apSpent: 0 }).formula, "0");
});

test("attack: wardGrant formula is always parts joined by a single separator", () => {
  // SPEC: e.g. "7 + 1d8 + 3". No leading/trailing separator, no empty part.
  for (const actionType of ["action", "bonus", "reaction", "other"]) {
    for (const fromArt of [true, false]) {
      for (const apSpent of [0, 1, 17]) {
        for (const healingAmount of [0, 1, 250]) {
          const { formula, base, dieFormula, apBonus } = wardGrant({ healingAmount, actionType, fromArt, apSpent });
          const expected = [
            base !== 0 ? String(base) : null,
            dieFormula,
            apBonus !== 0 ? String(apBonus) : null
          ].filter((part) => part !== null);
          assert.equal(formula, expected.length === 0 ? "0" : expected.join(" + "));
          const parts = formula.split(" + ");
          assert.deepEqual(parts.filter((part) => part.length === 0), [], "no empty formula part");
          assert.equal(formula.trim(), formula, "no padding");
          assert.equal(typeof formula, "string");
        }
      }
    }
  }
});

test("attack: wardGrant AP amount boundaries (0 is no bonus, 1 is a bonus, integers only)", () => {
  // SPEC: apBonus = apSpent when fromArt === true and dieFormula !== null.
  assert.equal(wardGrant({ healingAmount: 5, actionType: "action", fromArt: true, apSpent: 0 }).apBonus, 0);
  assert.equal(wardGrant({ healingAmount: 5, actionType: "action", fromArt: true, apSpent: 1 }).apBonus, 1);
  assert.equal(wardGrant({ healingAmount: 5, actionType: "action", fromArt: true, apSpent: 40 }).apBonus, 40);
  assert.equal(wardGrant({ healingAmount: 5, actionType: "action", fromArt: true, apSpent: 40 }).formula, "5 + 1d8 + 40");
  // Malformed amounts: SPEC "integer >= 0" for base, "malformed input ... throws".
  assert.throws(() => wardGrant({ healingAmount: 5.5, actionType: "action", fromArt: false, apSpent: 0 }), RangeError);
  assert.throws(() => wardGrant({ healingAmount: 5, actionType: "action", fromArt: true, apSpent: 2.5 }), RangeError);
});

test("attack: wardGrant rejects negative AP even when the AP bonus is unused", () => {
  // SPEC: negative amounts are malformed input and throw, independent of whether
  // the value could reach the result (DECISIONS #4 makes it inert for a reaction).
  assert.throws(
    () => wardGrant({ healingAmount: 5, actionType: "reaction", fromArt: true, apSpent: -1 }),
    RangeError
  );
  assert.throws(
    () => extraTempHP({ actionType: "other", fromArt: true, apSpent: -1 }),
    RangeError
  );
});

test("attack: extraTempHP mirrors wardGrant's die/bonus rule for any temp HP (C3:5061)", () => {
  // SPEC extraTempHP: the same "Additional Temporary Hit Points" rule, no base.
  for (const actionType of ["action", "bonus"]) {
    assert.deepEqual(extraTempHP({ actionType, fromArt: false, apSpent: 9 }), { dieFormula: "1d8", apBonus: 0 });
    assert.deepEqual(extraTempHP({ actionType, fromArt: true, apSpent: 9 }), { dieFormula: "1d8", apBonus: 9 });
  }
  for (const actionType of ["reaction", "other"]) {
    assert.deepEqual(extraTempHP({ actionType, fromArt: true, apSpent: 9 }), { dieFormula: null, apBonus: 0 });
  }
  assert.throws(() => extraTempHP({ actionType: undefined, fromArt: false, apSpent: 0 }), RangeError);
  assert.throws(() => extraTempHP({ actionType: "Action", fromArt: false, apSpent: 0 }), RangeError);
});

// ----------------------------- choosePool (ruling 2026-10-28, pools never stack)

test("attack: choosePool suggestion boundary is strict and display-only", () => {
  // SPEC choosePool: suggestion = "replace" when incomingAmount > currentTemp, else "keep".
  const currentTag = wardTag({ amount: 10 });
  const at = (incomingAmount) =>
    choosePool({ currentTemp: 10, currentTag, incomingAmount, medicUuid: MEDIC, choice: null }).suggestion;
  assert.equal(at(9), "keep");
  assert.equal(at(10), "keep", "equal pools are not an upgrade");
  assert.equal(at(11), "replace");
  // The suggestion must not depend on the choice actually made.
  assert.equal(choosePool({ currentTemp: 10, currentTag, incomingAmount: 30, medicUuid: MEDIC, choice: "keep" }).suggestion, "replace");
  assert.equal(choosePool({ currentTemp: 10, currentTag, incomingAmount: 1, medicUuid: MEDIC, choice: "replace" }).suggestion, "keep");
});

test("attack: choosePool replace builds a fresh tag and leaves the input tag untouched", () => {
  // SPEC: "replace" -> temp = incomingAmount, tag = { medicUuid, grantedAt: null, amount }.
  // SPEC header: the module never mutates its inputs.
  const currentTag = freezeDeep(wardTag({ amount: 4 }));
  const args = freezeDeep({
    currentTemp: 4,
    currentTag,
    incomingAmount: 9,
    medicUuid: MEDIC,
    choice: "replace"
  });
  const result = choosePool(args);
  assert.equal(result.temp, 9);
  assert.notStrictEqual(result.tag, currentTag, "a replacement tag is a new record");
  assert.deepEqual(result.tag, { medicUuid: MEDIC, grantedAt: null, amount: 9 });
  result.tag.amount = 999;
  assert.deepEqual(currentTag, wardTag({ amount: 4 }), "mutating the result must not reach the input tag");
});

test("attack: choosePool replace with an incoming Ward of 0 yields an empty pool, not a stack", () => {
  // SPEC: "replace" -> temp = incomingAmount (literal, no minimum).
  const result = choosePool({
    currentTemp: 12,
    currentTag: wardTag({ amount: 12 }),
    incomingAmount: 0,
    medicUuid: MEDIC,
    choice: "replace"
  });
  assert.equal(result.temp, 0);
  assert.equal(result.changed, true);
  assert.deepEqual(result.tag, { medicUuid: MEDIC, grantedAt: null, amount: 0 });
});

test("attack: choosePool never returns a summed pool in any branch", () => {
  // Ruling 2026-10-28: "Pools never stack."
  const currentTag = wardTag({ amount: 7 });
  for (const choice of ["keep", "replace", null]) {
    for (const currentTemp of [0, 7, 40]) {
      for (const incomingAmount of [0, 3, 7, 41]) {
        const result = choosePool({ currentTemp, currentTag, incomingAmount, medicUuid: MEDIC, choice });
        if (currentTemp > 0 && incomingAmount > 0) {
          assert.notEqual(result.temp, currentTemp + incomingAmount, `stacked ${currentTemp}+${incomingAmount} under ${choice}`);
        }
        assert.ok(result.temp === currentTemp || result.temp === incomingAmount, "temp is one existing pool, never a sum");
      }
    }
  }
});

test("attack: choosePool 'keep' preserves the stored tag exactly and reports no change", () => {
  // SPEC: '"keep" -> unchanged.' The tag is the caller's stored record.
  const currentTag = freezeDeep(wardTag({ amount: 4, grantedAt: "combat9:7:2" }));
  const result = choosePool({ currentTemp: 4, currentTag, incomingAmount: 12, medicUuid: MEDIC, choice: "keep" });
  assert.equal(result.temp, 4);
  assert.equal(result.changed, false);
  assert.deepEqual(result.tag, wardTag({ amount: 4, grantedAt: "combat9:7:2" }));
});

test("attack: choosePool null choice only advises and changes nothing", () => {
  // SPEC: choice null -> "no change, only suggestion".
  const result = choosePool({ currentTemp: 3, currentTag: null, incomingAmount: 8, medicUuid: MEDIC, choice: null });
  assert.deepEqual(result, { temp: 3, tag: null, changed: false, suggestion: "replace" });
});

test("attack: choosePool malformed values throw (choice enum, amounts, medicUuid)", () => {
  // SPEC: unknown enum value / non-numeric / negative amounts are malformed input.
  const base = { currentTemp: 0, currentTag: null, incomingAmount: 3, medicUuid: MEDIC, choice: "replace" };
  assert.throws(() => choosePool({ ...base, choice: "stack" }), RangeError);
  assert.throws(() => choosePool({ ...base, choice: "REPLACE" }), RangeError);
  assert.throws(() => choosePool({ ...base, choice: true }), RangeError);
  assert.throws(() => choosePool({ ...base, currentTemp: -1 }), RangeError);
  assert.throws(() => choosePool({ ...base, currentTemp: 1.5 }), RangeError);
  assert.throws(() => choosePool({ ...base, incomingAmount: -1 }), RangeError);
  assert.throws(() => choosePool({ ...base, incomingAmount: "3" }), TypeError);
  assert.throws(() => choosePool({ ...base, medicUuid: 7 }), TypeError);
  assert.throws(() => choosePool({ ...base, medicUuid: null }), TypeError);
});

test("attack: choosePool accepts deep-frozen input", () => {
  assert.doesNotThrow(() => choosePool(freezeDeep({
    currentTemp: 4,
    currentTag: wardTag({ amount: 4 }),
    incomingAmount: 9,
    medicUuid: MEDIC,
    choice: "replace"
  })));
});

// -------------------------------------------- wardOf (ruling 2026-10-28, C3:5059)

test("attack: wardOf reports remaining HP only for this Medic's live Ward", () => {
  // SPEC wardOf: temp when tag?.medicUuid === medicUuid and temp > 0, else 0.
  assert.equal(wardOf({ temp: 8, tag: wardTag({ amount: 8 }) }, MEDIC), 8);
  assert.equal(wardOf({ temp: 1, tag: wardTag({ amount: 8 }) }, MEDIC), 1);
  assert.equal(wardOf({ temp: 8, tag: wardTag({ medicUuid: OTHER_MEDIC }) }, MEDIC), 0);
  assert.equal(wardOf({ temp: 8, tag: wardTag({ medicUuid: OTHER_MEDIC }) }, OTHER_MEDIC), 8);
  assert.equal(wardOf({ temp: 8, tag: { grantedAt: null, amount: 8 } }, MEDIC), 0, "a tag with no owner is nobody's Ward");
  assert.equal(wardOf({ temp: 0, tag: wardTag({ amount: 8 }) }, MEDIC), 0);
  assert.equal(wardOf({ temp: 0, tag: null }, MEDIC), 0);
  // An absent temp amount is malformed input rather than "0": SPEC malformed rule.
  assert.throws(() => wardOf({}, MEDIC), TypeError);
});

test("attack: wardOf cannot report Ward for a missing Medic identity", () => {
  // SPEC wardOf returns HP "from that Medic"; null/undefined is not a Medic.
  // The module's own choosePool requires medicUuid to be a string; wardOf must not
  // be looser, because a tag with a missing owner must never become anyone's Ward
  // (ruling 2026-10-28: "Only the Ward's originating Medic may use it").
  assert.equal(wardOf({ temp: 5, tag: { grantedAt: null, amount: 5 } }, undefined), 0);
  assert.equal(wardOf({ temp: 5, tag: { medicUuid: null, grantedAt: null, amount: 5 } }, null), 0);
});

test("attack: wardOf rejects malformed temp HP instead of guessing", () => {
  // SPEC: non-numeric / negative amounts are malformed input.
  assert.throws(() => wardOf({ temp: -1, tag: null }, MEDIC), RangeError);
  assert.throws(() => wardOf({ temp: "8", tag: null }, MEDIC), TypeError);
  assert.throws(() => wardOf({ temp: 8.5, tag: null }, MEDIC), RangeError);
});

test("attack: a replaced pool is this Medic's Ward and nobody else's (ruling 2026-10-28)", () => {
  // Ruling: "Only the Ward's originating Medic may use it for their Ward features."
  const pool = choosePool({ currentTemp: 0, currentTag: null, incomingAmount: 6, medicUuid: MEDIC, choice: "replace" });
  const stored = { temp: pool.temp, tag: { ...pool.tag, grantedAt: "c1:1:1" } };
  assert.equal(wardOf(stored, MEDIC), 6);
  assert.equal(wardOf(stored, OTHER_MEDIC), 0);
  // Partial depletion keeps the same Ward pool for its owner.
  const keptTag = reconcileTag({ tempBefore: 6, tempAfter: 2, tag: stored.tag, grantedByWard: false });
  assert.equal(wardOf({ temp: 2, tag: keptTag }, MEDIC), 2);
  // A larger non-Ward pool replaced the Ward and the tag must be dropped.
  const droppedTag = reconcileTag({ tempBefore: 2, tempAfter: 9, tag: keptTag, grantedByWard: false });
  assert.equal(wardOf({ temp: 9, tag: droppedTag }, MEDIC), 0);
});

// -------------------------------- reconcileTag (SPEC; native temp-HP bookkeeping)

test("attack: reconcileTag boundaries around depletion and replacement", () => {
  // SPEC reconcileTag: tempAfter <= 0 -> null; tempAfter > tempBefore and not a
  // Ward grant -> null; otherwise unchanged.
  const tag = wardTag({ amount: 8 });
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 0, tag, grantedByWard: false }), null);
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: -5, tag, grantedByWard: true }), null);
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 1, tag, grantedByWard: false }), tag);
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 9, tag, grantedByWard: false }), null);
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 9, tag, grantedByWard: 1 }), null, "strict true");
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 9, tag, grantedByWard: "true" }), null, "strict true");
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 9, tag, grantedByWard: true }), tag);
  assert.equal(reconcileTag({ tempBefore: 0, tempAfter: 0, tag, grantedByWard: true }), null);
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 4, tag: undefined, grantedByWard: false }), null);
});

test("attack: reconcileTag rejects a non-tag value instead of storing garbage", () => {
  // SPEC: tag is a Ward tag object or null. A string/array/number tag is malformed
  // input (SPEC malformed rule: wrong type throws TypeError), and returning it
  // would let a bogus record survive into the actor's stored Ward tag.
  assert.throws(() => reconcileTag({ tempBefore: 8, tempAfter: 5, tag: "Actor.medic", grantedByWard: false }), TypeError);
  assert.throws(() => reconcileTag({ tempBefore: 8, tempAfter: 5, tag: [], grantedByWard: false }), TypeError);
  assert.throws(() => reconcileTag({ tempBefore: 8, tempAfter: 5, tag: 7, grantedByWard: false }), TypeError);
});

test("attack: reconcileTag accepts a deep-frozen record and never writes to it", () => {
  const tag = freezeDeep(wardTag({ amount: 8 }));
  const args = freezeDeep({ tempBefore: 8, tempAfter: 3, tag, grantedByWard: false });
  assert.doesNotThrow(() => reconcileTag(args));
  args; // (frozen arguments would throw on any write)
  const result = reconcileTag(args);
  assert.equal(result.medicUuid, MEDIC);
  assert.equal(result.amount, 8, "the granted amount is a record, not a remaining-HP counter");
});

test("attack: reconcileTag accepts negative tempAfter as a signed total", () => {
  // SPEC: tempAfter is a native temporary-HP total that may go negative on overflow.
  assert.equal(reconcileTag({ tempBefore: 2, tempAfter: -9, tag: wardTag(), grantedByWard: false }), null);
  assert.throws(() => reconcileTag({ tempBefore: 2, tempAfter: 1.5, tag: wardTag(), grantedByWard: false }), RangeError);
});

// --------------------------------- statusResistance (C3:5063-5064, per-turn key)

test("attack: statusResistance consumes Advantage once per turn and resets next turn", () => {
  // C3:5063: "The first time each Turn a Creature that has your Ward makes a
  // Saving Throw to avoid or end a Status Condition, they do so with Advantage."
  let used = null;
  const save = (turnKey) => {
    const result = statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey, usedTurnKey: used });
    used = result.usedTurnKey;
    return result;
  };
  assert.deepEqual(save("c1:1:1"), { advantage: true, usedTurnKey: "c1:1:1" });
  assert.deepEqual(save("c1:1:1"), { advantage: false, usedTurnKey: "c1:1:1" }, "second save in the same turn");
  assert.deepEqual(save("c1:1:1"), { advantage: false, usedTurnKey: "c1:1:1" });
  assert.deepEqual(save("c1:2:1"), { advantage: true, usedTurnKey: "c1:2:1" }, "next round is a new turn");
  assert.deepEqual(save("c1:2:1"), { advantage: false, usedTurnKey: "c1:2:1" });
  assert.deepEqual(save("c2:1:1"), { advantage: true, usedTurnKey: "c2:1:1" }, "a new combat starts fresh");
});

test("attack: statusResistance turn keys are distinct per combat id and turn index", () => {
  // SPEC: turnKey is "combatId:round:turn"; keys are compared as turn identities.
  const stale = "c1:3:2";
  for (const turnKey of ["c1:3:3", "c1:4:2", "c2:3:2", "c10:3:2"]) {
    assert.deepEqual(
      statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey, usedTurnKey: stale }),
      { advantage: true, usedTurnKey: turnKey },
      `${turnKey} is not ${stale}`
    );
  }
});

test("attack: statusResistance never spends the Advantage on a save that does not qualify", () => {
  // C3:5063 restricts the benefit to saves to avoid or end a Status Condition on a
  // creature that has this Ward; a non-qualifying save must not burn the turn key.
  const used = "c9:9:9";
  const cases = [
    { hasWard: false, savingVsStatusCondition: true },
    { hasWard: true, savingVsStatusCondition: false },
    { hasWard: false, savingVsStatusCondition: false }
  ];
  for (const flags of cases) {
    assert.deepEqual(
      statusResistance({ ...flags, turnKey: "c1:1:1", usedTurnKey: used }),
      { advantage: false, usedTurnKey: used }
    );
    assert.deepEqual(
      statusResistance({ ...flags, turnKey: "c1:1:1", usedTurnKey: null }),
      { advantage: false, usedTurnKey: null }
    );
  }
});

test("attack: statusResistance outside combat grants Advantage every time (SPEC null turnKey)", () => {
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: null, usedTurnKey: null }),
    { advantage: true, usedTurnKey: null }
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: null, usedTurnKey: "c1:1:1" }),
    { advantage: true, usedTurnKey: "c1:1:1" }, "a stale in-combat key is kept unchanged"
  );
});

test("attack: statusResistance rejects a non-string turn key", () => {
  // SPEC: turnKey is "combatId:round:turn" or null; anything else is malformed.
  assert.throws(
    () => statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: 7, usedTurnKey: null }),
    TypeError
  );
  assert.throws(
    () => statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: null, usedTurnKey: 7 }),
    TypeError
  );
});

test("attack: statusResistance accepts deep-frozen input", () => {
  assert.doesNotThrow(() => statusResistance(freezeDeep({
    hasWard: true,
    savingVsStatusCondition: true,
    turnKey: "c1:1:1",
    usedTurnKey: null
  })));
});

// --------------------------------------- treatTheCause (C3:5066-5069)

test("attack: treatTheCause range boundaries at 0, 29.99, 30, 30.01", () => {
  // C3:5066: "targeted by an Attack from a Creature within 30 feet of them".
  const warningsAt = (attackerDistanceFeet) =>
    treatTheCause({ targetHasWard: true, attackerDistanceFeet, reactionAvailable: true, saveDC: 15 }).warnings;
  assert.deepEqual(warningsAt(0), []);
  assert.deepEqual(warningsAt(29.99), []);
  assert.deepEqual(warningsAt(30), [], "30 feet is within 30 feet");
  assert.deepEqual(warningsAt(30.01), ["attackerOutOfRange"]);
  assert.deepEqual(warningsAt(1000), ["attackerOutOfRange"]);
  assert.deepEqual(warningsAt(null), ["attackerRangeUnknown"]);
});

test("attack: treatTheCause warning order is the SPEC order and never duplicated", () => {
  // SPEC treatTheCause: warnings "targetHasNoWard", "attackerOutOfRange" /
  // "attackerRangeUnknown", "noReaction" - warn, never block.
  assert.deepEqual(
    treatTheCause({ targetHasWard: false, attackerDistanceFeet: 40, reactionAvailable: false, saveDC: 13 }).warnings,
    ["targetHasNoWard", "attackerOutOfRange", "noReaction"]
  );
  assert.deepEqual(
    treatTheCause({ targetHasWard: false, attackerDistanceFeet: null, reactionAvailable: false, saveDC: 13 }).warnings,
    ["targetHasNoWard", "attackerRangeUnknown", "noReaction"]
  );
});

test("attack: treatTheCause descriptor is complete and exact, with no extra keys", () => {
  // C3:5066-5069: Dex save vs the Medic's Spell Save DC, 2d10 Force, full damage +
  // forced miss on a failure, half damage and no other effect on a success.
  const descriptor = treatTheCause({ targetHasWard: true, attackerDistanceFeet: 30, reactionAvailable: true, saveDC: 0 });
  assert.deepEqual(descriptor, {
    warnings: [],
    save: { ability: "dex", dc: 0 },
    damage: { formula: "2d10", type: "force" },
    onFail: { damage: "full", forcedMiss: true },
    onSuccess: { damage: "half", forcedMiss: false },
    restoreReactionCost: 15
  });
  assert.deepEqual(sorted(Object.keys(descriptor)), sorted([
    "warnings", "save", "damage", "onFail", "onSuccess", "restoreReactionCost"
  ]));
  assert.equal(typeof descriptor.damage.formula, "string", "no rolled total anywhere");
  assert.equal(descriptor.damage.formula, "2d10");
});

test("attack: treatTheCause rejects malformed distances and DCs", () => {
  // SPEC: malformed input throws (non-numeric, negative).
  const base = { targetHasWard: true, attackerDistanceFeet: 10, reactionAvailable: true, saveDC: 15 };
  assert.throws(() => treatTheCause({ ...base, attackerDistanceFeet: -1 }), RangeError);
  assert.throws(() => treatTheCause({ ...base, attackerDistanceFeet: "30" }), TypeError);
  assert.throws(() => treatTheCause({ ...base, attackerDistanceFeet: Number.NaN }), TypeError);
  assert.throws(() => treatTheCause({ ...base, attackerDistanceFeet: Number.POSITIVE_INFINITY }), TypeError);
  assert.throws(() => treatTheCause({ ...base, saveDC: -1 }), RangeError);
  assert.throws(() => treatTheCause({ ...base, saveDC: "15" }), TypeError);
  assert.throws(() => treatTheCause({ ...base, saveDC: undefined }), TypeError);
});

test("attack: treatTheCause accepts deep-frozen input", () => {
  assert.doesNotThrow(() => treatTheCause(freezeDeep({
    targetHasWard: true,
    attackerDistanceFeet: 30,
    reactionAvailable: true,
    saveDC: 18
  })));
});

// ------------------------------- treatTheCauseOutcome (C3:5069, half rounds down)

test("attack: treatTheCauseOutcome halves downward across the low damage range", () => {
  // C3:5069: "on a successful Save, they take half as much Damage"; SPEC: floor.
  for (let rolled = 0; rolled <= 12; rolled += 1) {
    assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: rolled }), {
      damage: Math.floor(rolled / 2),
      forcedMiss: false
    });
    assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: false, damageRolled: rolled }), {
      damage: rolled,
      forcedMiss: true
    });
  }
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 1 }), { damage: 0, forcedMiss: false });
});

test("attack: treatTheCauseOutcome rejects malformed damage", () => {
  assert.throws(() => treatTheCauseOutcome({ saveSucceeded: true, damageRolled: -2 }), RangeError);
  assert.throws(() => treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 2.5 }), RangeError);
  assert.throws(() => treatTheCauseOutcome({ saveSucceeded: false, damageRolled: "9" }), TypeError);
});

// -------------------------------------- wardingSurge (C3:5071-5076)

test("attack: wardingSurge cost and shortfall boundaries at 9, 10, 11 Life Support", () => {
  // C3:5071: "expend 10 Life Support"; SPEC: lifeSupportAfter = max(0, ls-10),
  // shortfall = max(0, 10-ls).
  const at = (lifeSupport) => wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport, damageTypes: ["fire"] });
  assert.deepEqual(
    { after: at(9).lifeSupportAfter, shortfall: at(9).shortfall, warnings: at(9).warnings },
    { after: 0, shortfall: 1, warnings: ["lifeSupportShort"] }
  );
  assert.deepEqual(
    { after: at(10).lifeSupportAfter, shortfall: at(10).shortfall, warnings: at(10).warnings },
    { after: 0, shortfall: 0, warnings: [] }
  );
  assert.deepEqual(
    { after: at(11).lifeSupportAfter, shortfall: at(11).shortfall, warnings: at(11).warnings },
    { after: 1, shortfall: 0, warnings: [] }
  );
  assert.equal(at(0).shortfall, 10);
  assert.equal(at(0).lifeSupportAfter, 0);
  assert.equal(at(125).lifeSupportAfter, 115, "a 15th-level pool is plenty");
});

test("attack: wardingSurge warning order is the SPEC order", () => {
  // SPEC wardingSurge: warnings "targetHasNoWard", "noReaction", "lifeSupportShort".
  assert.deepEqual(
    wardingSurge({ targetHasWard: false, reactionAvailable: false, lifeSupport: 4, damageTypes: ["cold"] }).warnings,
    ["targetHasNoWard", "noReaction", "lifeSupportShort"]
  );
});

test("attack: wardingSurge constants survive every warning combination", () => {
  // C3:5071-5076: the cost is 10, the Resistance lasts to the end of the current
  // Turn, and restoring the Reaction costs 15.
  for (const targetHasWard of [true, false]) {
    for (const reactionAvailable of [true, false]) {
      for (const lifeSupport of [0, 4, 10, 40]) {
        const result = wardingSurge({ targetHasWard, reactionAvailable, lifeSupport, damageTypes: ["fire"] });
        assert.equal(result.cost, 10);
        assert.equal(result.restoreReactionCost, 15);
        assert.equal(result.expires, "endOfCurrentTurn");
        assert.equal(result.lifeSupportAfter, Math.max(0, lifeSupport - 10));
        assert.equal(result.shortfall, Math.max(0, 10 - lifeSupport));
      }
    }
  }
});

test("attack: wardingSurge resistTypes is the unique set of the input, never aliased", () => {
  // SPEC: resistTypes = unique damageTypes.
  const damageTypes = ["fire", "cold", "fire", "acid", "cold"];
  const result = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes });
  assert.deepEqual(sorted(result.resistTypes), ["acid", "cold", "fire"]);
  assert.equal(result.resistTypes.length, 3);
  assert.notStrictEqual(result.resistTypes, damageTypes);
  result.resistTypes.push("thunder");
  assert.deepEqual(damageTypes, ["fire", "cold", "fire", "acid", "cold"], "input array untouched");
  assert.deepEqual(
    sorted(wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes }).resistTypes),
    ["acid", "cold", "fire"],
    "a later call is unaffected by mutating an earlier result"
  );
});

test("attack: wardingSurge malformed input throws, empty lists do not", () => {
  const base = { targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: ["fire"] };
  assert.throws(() => wardingSurge({ ...base, damageTypes: "fire" }), TypeError);
  assert.throws(() => wardingSurge({ ...base, damageTypes: ["fire", 7] }), TypeError);
  assert.throws(() => wardingSurge({ ...base, lifeSupport: -1 }), RangeError);
  assert.throws(() => wardingSurge({ ...base, lifeSupport: 2.5 }), RangeError);
  assert.throws(() => wardingSurge({ ...base, lifeSupport: "20" }), TypeError);
  assert.deepEqual(wardingSurge({ ...base, damageTypes: [] }).resistTypes, []);
});

test("attack: wardingSurge accepts deep-frozen input", () => {
  assert.doesNotThrow(() => wardingSurge(freezeDeep({
    targetHasWard: true,
    reactionAvailable: true,
    lifeSupport: 12,
    damageTypes: ["fire", "cold"]
  })));
});

// ------------------------ restoreReaction (C3:5069, C3:5076: 15 Life Support)

test("attack: restoreReaction boundaries at 14, 15, 16 Life Support", () => {
  assert.deepEqual(restoreReaction({ lifeSupport: 14 }), { cost: 15, lifeSupportAfter: 0, shortfall: 1, warnings: ["lifeSupportShort"] });
  assert.deepEqual(restoreReaction({ lifeSupport: 15 }), { cost: 15, lifeSupportAfter: 0, shortfall: 0, warnings: [] });
  assert.deepEqual(restoreReaction({ lifeSupport: 16 }), { cost: 15, lifeSupportAfter: 1, shortfall: 0, warnings: [] });
  // The cost never changes with the pool size.
  for (const lifeSupport of [0, 1, 15, 170]) {
    assert.equal(restoreReaction({ lifeSupport }).cost, 15);
    assert.equal(restoreReaction({ lifeSupport }).lifeSupportAfter, Math.max(0, lifeSupport - 15));
  }
});

test("attack: restoreReaction rejects malformed pools", () => {
  assert.throws(() => restoreReaction({ lifeSupport: -1 }), RangeError);
  assert.throws(() => restoreReaction({ lifeSupport: 1.5 }), RangeError);
  assert.throws(() => restoreReaction({ lifeSupport: "15" }), TypeError);
  assert.throws(() => restoreReaction({}), TypeError);
});

// ------------------- collectiveWardSettlement (C3:5083, ruling 2026-10-28 ordering)

test("attack: Collective Ward wastes everything when the damage is already 0", () => {
  // C3:5083: reduce the damage "to a minimum of 0"; SPEC: wasted = max(0, removed - damage).
  const result = collectiveWardSettlement(settlement({
    damage: 0,
    recipientTemp: 6,
    donors: [{ uuid: "Actor.donorA", ward: 9, distanceFeet: 10 }],
    removals: { "Actor.donorA": 9 }
  }));
  assert.equal(result.removed, 9);
  assert.equal(result.damageAfterWard, 0);
  assert.equal(result.wasted, 9);
  assert.equal(result.tempAbsorbed, 0);
  assert.equal(result.hpLoss, 0);
  assert.deepEqual(result.warnings, ["wardWasted"]);
});

test("attack: Collective Ward is exactly enough when the removal equals the damage", () => {
  const result = collectiveWardSettlement(settlement({
    damage: 8,
    recipientTemp: 4,
    donors: [{ uuid: "Actor.donorA", ward: 8, distanceFeet: 10 }],
    removals: { "Actor.donorA": 8 }
  }));
  assert.equal(result.removed, 8);
  assert.equal(result.damageAfterWard, 0);
  assert.equal(result.wasted, 0);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.tempAbsorbed, 0, "no damage reaches the recipient's temp HP");
  assert.equal(result.hpLoss, 0);
});

test("attack: Collective Ward sums several donors and reports them in donor order", () => {
  // SPEC: removed = sum of clamped removals; donorUpdates for every consumed donor.
  const result = collectiveWardSettlement(settlement({
    damage: 40,
    recipientTemp: 3,
    donors: [
      { uuid: "Actor.donorC", ward: 4, distanceFeet: 30 },
      { uuid: "Actor.donorA", ward: 10, distanceFeet: 5 },
      { uuid: "Actor.donorB", ward: 7, distanceFeet: 20 }
    ],
    removals: { "Actor.donorA": 10, "Actor.donorB": 7, "Actor.donorC": 1 }
  }));
  assert.equal(result.removed, 18);
  assert.equal(result.damageAfterWard, 22);
  assert.equal(result.wasted, 0);
  assert.equal(result.tempAbsorbed, 3);
  assert.equal(result.hpLoss, 19);
  assert.deepEqual(result.donorUpdates, [
    { uuid: "Actor.donorC", wardBefore: 4, wardAfter: 3 },
    { uuid: "Actor.donorA", wardBefore: 10, wardAfter: 0 },
    { uuid: "Actor.donorB", wardBefore: 7, wardAfter: 0 }
  ]);
  assert.deepEqual(result.warnings, []);
});

test("attack: Collective Ward warns about a far donor but still spends their Ward", () => {
  // C3:5083 + WORKFLOW §3.2: warn, never block; SPEC: still applied.
  const result = collectiveWardSettlement(settlement({
    damage: 10,
    recipientDistanceFeet: 30,
    donors: [{ uuid: "Actor.donorA", ward: 6, distanceFeet: 30.5 }],
    removals: { "Actor.donorA": 6 }
  }));
  assert.equal(result.removed, 6);
  assert.equal(result.damageAfterWard, 4);
  assert.deepEqual(result.warnings, ["donorOutOfRange"]);
  assert.deepEqual(result.donorUpdates, [{ uuid: "Actor.donorA", wardBefore: 6, wardAfter: 0 }]);
});

test("attack: Collective Ward warns about unknown donor range but still spends", () => {
  const result = collectiveWardSettlement(settlement({
    donors: [{ uuid: "Actor.donorA", ward: 6, distanceFeet: null }],
    removals: { "Actor.donorA": 2 }
  }));
  assert.deepEqual(result.warnings, ["donorRangeUnknown"]);
  assert.equal(result.removed, 2);
});

test("attack: Collective Ward recipient range boundary at exactly 30 feet", () => {
  const result = collectiveWardSettlement(settlement({ recipientDistanceFeet: 30 }));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    collectiveWardSettlement(settlement({ recipientDistanceFeet: 30.01 })).warnings,
    ["recipientOutOfRange"]
  );
  // (A null recipient distance is left to the question list: the SPEC defines
  // "donorRangeUnknown" for donors only and has no recipient-unknown code.)
});

test("attack: Collective Ward clamps an oversized removal to the donor's Ward", () => {
  // SPEC: clamp to [0, donor.ward] with a removalExceedsWard warning.
  const result = collectiveWardSettlement(settlement({
    damage: 20,
    donors: [{ uuid: "Actor.donorA", ward: 3, distanceFeet: 10 }],
    removals: { "Actor.donorA": 100 }
  }));
  assert.equal(result.removed, 3);
  assert.equal(result.damageAfterWard, 17);
  assert.equal(result.wasted, 0);
  assert.deepEqual(result.warnings, ["removalExceedsWard"]);
  assert.deepEqual(result.donorUpdates, [{ uuid: "Actor.donorA", wardBefore: 3, wardAfter: 0 }]);
});

test("attack: Collective Ward a zero-Ward donor is consumed by nothing", () => {
  const result = collectiveWardSettlement(settlement({
    donors: [{ uuid: "Actor.donorA", ward: 0, distanceFeet: 10 }],
    removals: { "Actor.donorA": 4 }
  }));
  assert.equal(result.removed, 0);
  assert.deepEqual(result.donorUpdates, [], "no Ward was consumed");
  assert.deepEqual(result.warnings, ["removalExceedsWard"]);
});

test("attack: Collective Ward arithmetic holds across a grid of damage, removal and temp", () => {
  // SPEC: damageAfterWard = max(0, damage - removed); wasted = max(0, removed - damage);
  // tempAbsorbed = min(recipientTemp, damageAfterWard); hpLoss = damageAfterWard - tempAbsorbed.
  for (const damage of [0, 1, 5, 12]) {
    for (const requested of [0, 1, 5, 12]) {
      for (const recipientTemp of [0, 2, 9]) {
        const result = collectiveWardSettlement(settlement({
          damage,
          recipientTemp,
          donors: [{ uuid: "Actor.donorA", ward: 12, distanceFeet: 5 }],
          removals: { "Actor.donorA": requested }
        }));
        assert.equal(result.removed, requested, `removed for ${damage}/${requested}/${recipientTemp}`);
        assert.equal(result.damageAfterWard, Math.max(0, damage - requested));
        assert.equal(result.wasted, Math.max(0, requested - damage));
        assert.equal(result.tempAbsorbed, Math.min(recipientTemp, result.damageAfterWard));
        assert.equal(result.hpLoss, result.damageAfterWard - result.tempAbsorbed);
        assert.equal(result.hpLoss + result.tempAbsorbed, result.damageAfterWard);
      }
    }
  }
});

test("attack: Collective Ward returns fresh containers that do not alias its input", () => {
  // SPEC header: never mutates inputs; a mutated result must not corrupt stored state.
  const donor = { uuid: "Actor.donorA", ward: 8, distanceFeet: 10 };
  const input = {
    damage: 20,
    recipientTemp: 5,
    recipientHasWard: true,
    recipientDistanceFeet: 10,
    donors: [donor],
    removals: { "Actor.donorA": 5 }
  };
  const snapshot = clone(input);
  const result = collectiveWardSettlement(input);
  assert.notStrictEqual(result.donorUpdates, input.donors);
  assert.notStrictEqual(result.donorUpdates[0], donor);
  result.donorUpdates[0].wardAfter = 999;
  result.warnings.push("invented");
  assert.deepEqual(input, snapshot, "the settlement input is untouched");
  assert.deepEqual(donor, { uuid: "Actor.donorA", ward: 8, distanceFeet: 10 });
  assert.deepEqual(collectiveWardSettlement(input).donorUpdates, [
    { uuid: "Actor.donorA", wardBefore: 8, wardAfter: 3 }
  ]);
});

test("attack: Collective Ward accepts deep-frozen nested input", () => {
  // Every nested array/object is frozen: any write inside the module would throw.
  assert.doesNotThrow(() => collectiveWardSettlement(freezeDeep({
    damage: 30,
    recipientTemp: 4,
    recipientHasWard: false,
    recipientDistanceFeet: 7,
    donors: [
      { uuid: "Actor.donorA", ward: 6, distanceFeet: 10 },
      { uuid: "Actor.donorB", ward: 9, distanceFeet: null }
    ],
    removals: { "Actor.donorA": 6, "Actor.donorB": 3 }
  })));
});

test("attack: Collective Ward rejects malformed structures and amounts", () => {
  // SPEC malformed-input rule.
  assert.throws(() => collectiveWardSettlement(settlement({ damage: -1 })), RangeError);
  assert.throws(() => collectiveWardSettlement(settlement({ damage: 1.5 })), RangeError);
  assert.throws(() => collectiveWardSettlement(settlement({ damage: "20" })), TypeError);
  assert.throws(() => collectiveWardSettlement(settlement({ recipientTemp: -1 })), RangeError);
  assert.throws(() => collectiveWardSettlement(settlement({ donors: "none" })), TypeError);
  assert.throws(() => collectiveWardSettlement(settlement({ donors: [null] })), TypeError);
  assert.throws(() => collectiveWardSettlement(settlement({ donors: [{ uuid: 7, ward: 1, distanceFeet: 1 }] })), TypeError);
  assert.throws(() => collectiveWardSettlement(settlement({ donors: [{ uuid: "A", ward: -1, distanceFeet: 1 }] })), RangeError);
  assert.throws(() => collectiveWardSettlement(settlement({ removals: [] })), TypeError);
  assert.throws(() => collectiveWardSettlement(settlement({ removals: { "Actor.donorA": "5" } })), TypeError);
  assert.throws(() => collectiveWardSettlement(settlement({ removals: { "Actor.donorA": 2.5 } })), RangeError);
});

test("attack: Collective Ward with an empty removals map never fails, whatever the donor id", () => {
  // SPEC: removals is the player's chosen map; a donor with no entry contributes
  // nothing (removed 0) and the function settles normally. A donor uuid that
  // happens to collide with an Object.prototype name must not crash the card, and
  // must not pick up an inherited "removal" either.
  const result = collectiveWardSettlement(settlement({
    damage: 10,
    donors: [
      { uuid: "constructor", ward: 5, distanceFeet: 5 },
      { uuid: "toString", ward: 5, distanceFeet: 5 }
    ],
    removals: {}
  }));
  assert.equal(result.removed, 0);
  assert.equal(result.damageAfterWard, 10);
  assert.deepEqual(result.donorUpdates, []);
});

test("attack: Collective Ward never removes more Ward than a creature has", () => {
  // C3:5083 + SPEC: each removal is clamped to that creature's own remaining Ward
  // and donor Ward is consumed, never transferred. Two donor entries for the same
  // creature are the same Ward pool, so the total taken from it cannot exceed 5.
  // Either reject the duplicate listing as malformed or settle it once; both
  // satisfy the printed rule, double-spending 10 Ward does not.
  let result;
  try {
    result = collectiveWardSettlement(settlement({
      damage: 10,
      recipientTemp: 0,
      donors: [
        { uuid: "Actor.donorA", ward: 5, distanceFeet: 5 },
        { uuid: "Actor.donorA", ward: 5, distanceFeet: 5 }
      ],
      removals: { "Actor.donorA": 5 }
    }));
  } catch (error) {
    assert.ok(error instanceof TypeError || error instanceof RangeError, "duplicates must be a malformed-input error");
    return;
  }
  assert.ok(result.removed <= 5, `removed ${result.removed} Ward from a creature that has 5`);
  assert.ok(result.wasted === 0, "duplicate donors must not manufacture wasted Ward");
});

test("attack: Collective Ward donor bookkeeping never reports more than the donor held", () => {
  // SPEC donorUpdates: { uuid, wardBefore, wardAfter } from the clamped removal.
  for (const requested of [0, 3, 12]) {
    const result = collectiveWardSettlement(settlement({
      donors: [{ uuid: "Actor.donorA", ward: 12, distanceFeet: 5 }],
      removals: { "Actor.donorA": requested }
    }));
    for (const update of result.donorUpdates) {
      assert.equal(update.wardBefore, 12);
      assert.equal(update.wardAfter, 12 - requested);
      assert.ok(update.wardAfter >= 0);
    }
  }
});

test("attack: Collective Ward validates removal amounts for creatures that are not donors", () => {
  // SPEC malformed rule: "negative amounts" are malformed input and throw. The
  // removals map is input; a negative amount anywhere in it is malformed, even if
  // the uuid does not match a listed donor (which would otherwise be silently
  // dropped, hiding a caller bug).
  assert.throws(
    () => collectiveWardSettlement(settlement({ donors: [], removals: { "Actor.ghost": -5 } })),
    RangeError
  );
});

// ------------------------------------ wardRegeneration (C3:5085)

test("attack: wardRegeneration amount is ceil(level/2) across all 20 levels", () => {
  // C3:5085: "Temporary Hit Points equal to half of your Medic Level, rounded up".
  for (let medicLevel = 1; medicLevel <= 20; medicLevel += 1) {
    const result = wardRegeneration({ medicLevel, hasOwnWard: false, currentTemp: 0 });
    assert.equal(result.amount, Math.ceil(medicLevel / 2), `level ${medicLevel}`);
    assert.equal(result.eligible, medicLevel >= 15, `eligibility at level ${medicLevel}`);
    assert.deepEqual(result.warnings, []);
  }
});

test("attack: wardRegeneration eligibility boundaries at 14, 15 and 20 with an existing Ward", () => {
  assert.deepEqual(wardRegeneration({ medicLevel: 14, hasOwnWard: false, currentTemp: 0 }), { eligible: false, amount: 7, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 15, hasOwnWard: false, currentTemp: 0 }), { eligible: true, amount: 8, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 20, hasOwnWard: false, currentTemp: 0 }), { eligible: true, amount: 10, warnings: [] });
  // C3:5085: "If you begin your Turn and do not have your Ward" - having it blocks.
  assert.deepEqual(wardRegeneration({ medicLevel: 20, hasOwnWard: true, currentTemp: 9 }), {
    eligible: false,
    amount: 10,
    warnings: ["replacesOtherTemp"]
  });
});

test("attack: wardRegeneration warns about an existing pool independently of eligibility", () => {
  for (const medicLevel of [1, 14, 15, 20]) {
    for (const hasOwnWard of [true, false]) {
      assert.deepEqual(
        wardRegeneration({ medicLevel, hasOwnWard, currentTemp: 1 }).warnings,
        ["replacesOtherTemp"],
        `level ${medicLevel}, ownWard ${hasOwnWard}`
      );
      assert.deepEqual(wardRegeneration({ medicLevel, hasOwnWard, currentTemp: 0 }).warnings, []);
    }
  }
});

test("attack: wardRegeneration rejects levels outside 1-20 and non-numeric levels", () => {
  // SPEC: medicLevel outside 1-20 -> RangeError; non-numeric -> TypeError.
  for (const medicLevel of [0, -1, 21, 999]) {
    assert.throws(() => wardRegeneration({ medicLevel, hasOwnWard: false, currentTemp: 0 }), RangeError, `level ${medicLevel}`);
  }
  assert.throws(() => wardRegeneration({ medicLevel: "15", hasOwnWard: false, currentTemp: 0 }), TypeError);
  assert.throws(() => wardRegeneration({ medicLevel: Number.NaN, hasOwnWard: false, currentTemp: 0 }), TypeError);
  assert.throws(() => wardRegeneration({ medicLevel: 16, hasOwnWard: false, currentTemp: -1 }), RangeError);
});

test("attack: wardRegeneration accepts deep-frozen input", () => {
  assert.doesNotThrow(() => wardRegeneration(freezeDeep({ medicLevel: 17, hasOwnWard: false, currentTemp: 2 })));
});

// ------------------------------------- determinism, purity, no hidden state

test("attack: every export is deterministic and returns fresh containers", () => {
  // SPEC header: deterministic, pure, no I/O, no randomness.
  const cases = [
    ["wardGrant", frozen => wardGrant(frozen), { healingAmount: 7, actionType: "action", fromArt: true, apSpent: 3 }],
    ["extraTempHP", frozen => extraTempHP(frozen), { actionType: "bonus", fromArt: true, apSpent: 2 }],
    ["choosePool", frozen => choosePool(frozen), { currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: "replace" }],
    ["wardOf", frozen => wardOf(frozen, MEDIC), { temp: 8, tag: wardTag({ amount: 8 }) }],
    ["statusResistance", frozen => statusResistance(frozen), { hasWard: true, savingVsStatusCondition: true, turnKey: "c1:1:1", usedTurnKey: null }],
    ["treatTheCause", frozen => treatTheCause(frozen), { targetHasWard: false, attackerDistanceFeet: null, reactionAvailable: false, saveDC: 14 }],
    ["treatTheCauseOutcome", frozen => treatTheCauseOutcome(frozen), { saveSucceeded: true, damageRolled: 9 }],
    ["wardingSurge", frozen => wardingSurge(frozen), { targetHasWard: true, reactionAvailable: false, lifeSupport: 3, damageTypes: ["fire", "cold"] }],
    ["restoreReaction", frozen => restoreReaction(frozen), { lifeSupport: 4 }],
    ["collectiveWardSettlement", frozen => collectiveWardSettlement(frozen), settlement()],
    ["wardRegeneration", frozen => wardRegeneration(frozen), { medicLevel: 16, hasOwnWard: false, currentTemp: 3 }]
  ];
  for (const [name, run, input] of cases) {
    const frozen = freezeDeep(clone(input));
    const first = run(frozen);
    const second = run(frozen);
    assert.deepEqual(second, first, `${name} is deterministic`);
    if (first !== null && typeof first === "object") {
      assert.notStrictEqual(second, first, `${name} returns a fresh object`);
    }
  }
});

test("attack: mutating a returned object never leaks into a later call", () => {
  // SPEC header: pure and deterministic; no module-level state.
  const first = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: ["fire"] });
  first.resistTypes.push("necrotic");
  first.warnings.push("bogus");
  first.lifeSupportAfter = -99;
  const second = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: ["fire"] });
  assert.deepEqual(second.resistTypes, ["fire"]);
  assert.deepEqual(second.warnings, []);
  assert.equal(second.lifeSupportAfter, 10);

  const descriptor = treatTheCause({ targetHasWard: true, attackerDistanceFeet: 10, reactionAvailable: true, saveDC: 15 });
  descriptor.save.dc = 99;
  descriptor.warnings.push("bogus");
  const again = treatTheCause({ targetHasWard: true, attackerDistanceFeet: 10, reactionAvailable: true, saveDC: 15 });
  assert.equal(again.save.dc, 15);
  assert.deepEqual(again.warnings, []);
});

test("attack: the module source reads no clock, entropy or process state", () => {
  // SPEC header: no I/O, no randomness, deterministic; dice are formula strings.
  const source = readFileSync(new URL("../scripts/ward-rules.mjs", import.meta.url), "utf8");
  const forbidden = [
    [/\bDate\b/, "Date"],
    [/\bcrypto\b/, "crypto"],
    [/\bperformance\b/, "performance"],
    [/\bsetTimeout\b|\bsetInterval\b/, "timers"],
    [/\bglobalThis\b/, "globalThis"],
    [/\bprocess\b/, "process"],
    [/\bimport\s*\(/, "dynamic import"],
    [/\bMath\.random\b/, "Math.random"],
    [/\brequire\s*\(/, "require"]
  ];
  for (const [pattern, label] of forbidden) {
    assert.equal(pattern.test(source), false, `ward-rules.mjs must not use ${label}`);
  }
  // No module-level mutable binding can carry state between calls.
  assert.equal(/^(let|var)\s+/m.test(source), false, "no top-level let/var");
});
