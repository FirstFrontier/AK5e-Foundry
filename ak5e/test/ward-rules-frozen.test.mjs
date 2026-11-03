// Frozen contract tests for lane C `ward-rules` (written before any implementation).
//
// Oracles come from:
//   - AK5e v1.3.1 Ch.3 Ward C3:5049-5087 (read with the whole Medic section C3:4560-5146)
//   - .codex-work/medic/SPEC-ward-rules.md (binding)
//   - ak5e/DECISIONS.md "Medic Therapist, Ward and Witchcraft owner rulings (2026-10-28)"
//     and "... open readings (2026-11-01)"
//
// House rules pinned here:
//   * rules failures are warnings (string codes) in the returned value, never throws;
//   * only malformed input (non-numeric / negative amounts, unknown enum value) throws;
//   * dice exist only as formula strings, nothing is rolled and nothing is random;
//   * the module is pure: no Foundry globals, no input mutation.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// ------------------------------------------------- WARD_FEATURES (frozen)

test("WARD_FEATURES: exact frozen level table (C3:5059-5085)", () => {
  assert.deepEqual(WARD_FEATURES, {
    preventionNotCure: 1,
    statusResistance: 4,
    treatTheCause: 7,
    wardingSurge: 11,
    communityCare: 15
  });
  assert.equal(Object.isFrozen(WARD_FEATURES), true);
  assert.equal(Object.isExtensible(WARD_FEATURES), false);
  assert.throws(() => { WARD_FEATURES.wardingSurge = 99; }, TypeError);
  assert.throws(() => { WARD_FEATURES.communityCareExtra = 1; }, TypeError);
  assert.equal(WARD_FEATURES.wardingSurge, 11, "a rejected write must not change the frozen table");
});

// ------------------------------------- wardGrant (C3:5059-5061) + DECISIONS #4

test("wardGrant: 1d8 only for Action and Bonus Action", () => {
  for (const actionType of ["action", "bonus"]) {
    assert.deepEqual(
      wardGrant({ healingAmount: 7, actionType, fromArt: false, apSpent: 0 }),
      { base: 7, dieFormula: "1d8", apBonus: 0, formula: "7 + 1d8" }
    );
  }
  for (const actionType of ["reaction", "other"]) {
    assert.deepEqual(
      wardGrant({ healingAmount: 7, actionType, fromArt: false, apSpent: 0 }),
      { base: 7, dieFormula: null, apBonus: 0, formula: "7" }
    );
  }
});

test("wardGrant: AP bonus needs both an Art and an Action/Bonus Action (DECISIONS 2026-11-01 #4)", () => {
  assert.deepEqual(
    wardGrant({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: 3 }),
    { base: 7, dieFormula: "1d8", apBonus: 3, formula: "7 + 1d8 + 3" }
  );
  assert.equal(wardGrant({ healingAmount: 7, actionType: "bonus", fromArt: true, apSpent: 2 }).formula, "7 + 1d8 + 2");

  // Not an Art: no AP bonus even when AP were notionally spent.
  assert.deepEqual(
    wardGrant({ healingAmount: 7, actionType: "action", fromArt: false, apSpent: 3 }),
    { base: 7, dieFormula: "1d8", apBonus: 0, formula: "7 + 1d8" }
  );

  // Literal reading: "those Temporary Hit Points" are the Action/Bonus Action ones only.
  for (const actionType of ["reaction", "other"]) {
    assert.deepEqual(
      wardGrant({ healingAmount: 7, actionType, fromArt: true, apSpent: 3 }),
      { base: 7, dieFormula: null, apBonus: 0, formula: "7" }
    );
  }

  // `fromArt === true` is a strict test, not truthiness.
  assert.equal(wardGrant({ healingAmount: 7, actionType: "action", fromArt: 1, apSpent: 3 }).apBonus, 0);
  assert.equal(wardGrant({ healingAmount: 7, actionType: "action", fromArt: "yes", apSpent: 3 }).apBonus, 0);
  assert.equal(wardGrant({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: 0 }).apBonus, 0);
});

test("wardGrant: formula sums only non-zero parts and stays a string", () => {
  assert.equal(wardGrant({ healingAmount: 0, actionType: "action", fromArt: false, apSpent: 0 }).formula, "1d8");
  assert.equal(wardGrant({ healingAmount: 12, actionType: "action", fromArt: true, apSpent: 1 }).formula, "12 + 1d8 + 1");
  assert.equal(wardGrant({ healingAmount: 7, actionType: "reaction", fromArt: false, apSpent: 0 }).formula, "7");
  const result = wardGrant({ healingAmount: 3, actionType: "bonus", fromArt: true, apSpent: 4 });
  assert.equal(typeof result.formula, "string");
  assert.equal(result.formula, "3 + 1d8 + 4");
  assert.equal(typeof result.base, "number");
});

test("wardGrant: malformed input throws; rules failures never throw", () => {
  assert.throws(() => wardGrant({ healingAmount: -1, actionType: "action", fromArt: false, apSpent: 0 }), RangeError);
  assert.throws(() => wardGrant({ healingAmount: "7", actionType: "action", fromArt: false, apSpent: 0 }), TypeError);
  assert.throws(() => wardGrant({ actionType: "action", fromArt: false, apSpent: 0 }), TypeError);
  assert.throws(() => wardGrant({ healingAmount: 7, actionType: "move", fromArt: false, apSpent: 0 }), RangeError);
  assert.throws(() => wardGrant({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: -2 }), RangeError);
  assert.throws(() => wardGrant({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: "3" }), TypeError);
});

// ------------------------------------- extraTempHP (C3:5061, any temp HP)

test("extraTempHP: same Additional Temporary Hit Points rule for any temp HP this Medic grants", () => {
  assert.deepEqual(extraTempHP({ actionType: "action", fromArt: false, apSpent: 0 }), { dieFormula: "1d8", apBonus: 0 });
  assert.deepEqual(extraTempHP({ actionType: "bonus", fromArt: true, apSpent: 4 }), { dieFormula: "1d8", apBonus: 4 });
  assert.deepEqual(extraTempHP({ actionType: "action", fromArt: true, apSpent: 0 }), { dieFormula: "1d8", apBonus: 0 });
  assert.deepEqual(extraTempHP({ actionType: "reaction", fromArt: true, apSpent: 4 }), { dieFormula: null, apBonus: 0 });
  assert.deepEqual(extraTempHP({ actionType: "other", fromArt: false, apSpent: 0 }), { dieFormula: null, apBonus: 0 });
  assert.equal(extraTempHP({ actionType: "action", fromArt: 1, apSpent: 4 }).apBonus, 0);
  assert.throws(() => extraTempHP({ actionType: "free", fromArt: false, apSpent: 0 }), RangeError);
});

// ------------------------------- choosePool / wardOf / reconcileTag (tag + pools)

test("choosePool: replace swaps the pool and stamps grantedAt null for the caller", () => {
  assert.deepEqual(
    choosePool({ currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: "replace" }),
    { temp: 9, tag: { medicUuid: MEDIC, grantedAt: null, amount: 9 }, changed: true, suggestion: "replace" }
  );
  // Replacing an untagged pool still produces a Ward tag owned by the granting Medic.
  assert.deepEqual(
    choosePool({ currentTemp: 0, currentTag: null, incomingAmount: 5, medicUuid: MEDIC, choice: "replace" }).tag,
    { medicUuid: MEDIC, grantedAt: null, amount: 5 }
  );
});

test("choosePool: keep never stacks pools (ruling 2026-10-28)", () => {
  const currentTag = wardTag({ amount: 4 });
  const result = choosePool({ currentTemp: 4, currentTag, incomingAmount: 9, medicUuid: MEDIC, choice: "keep" });
  assert.equal(result.temp, 4, "pools never stack: 4 + 9 is not a legal outcome");
  assert.deepEqual(result.tag, currentTag);
  assert.equal(result.suggestion, "replace", "the suggestion still reports the better pool");
});

test("choosePool: null choice changes nothing and only reports a suggestion", () => {
  const currentTag = wardTag({ amount: 6 });
  const bigger = choosePool({ currentTemp: 6, currentTag, incomingAmount: 10, medicUuid: MEDIC, choice: null });
  assert.equal(bigger.temp, 6);
  assert.deepEqual(bigger.tag, currentTag);
  assert.equal(bigger.changed, false);
  assert.equal(bigger.suggestion, "replace");

  const smaller = choosePool({ currentTemp: 6, currentTag, incomingAmount: 2, medicUuid: MEDIC, choice: null });
  assert.equal(smaller.temp, 6);
  assert.deepEqual(smaller.tag, currentTag);
  assert.equal(smaller.changed, false);
  assert.equal(smaller.suggestion, "keep");
});

test("choosePool: suggestion ties go to keep, and the suggestion ignores the choice made", () => {
  const currentTag = wardTag({ amount: 10 });
  assert.equal(choosePool({ currentTemp: 10, currentTag, incomingAmount: 10, medicUuid: MEDIC, choice: "replace" }).suggestion, "keep");
  assert.equal(choosePool({ currentTemp: 10, currentTag, incomingAmount: 11, medicUuid: MEDIC, choice: "keep" }).suggestion, "replace");
  assert.equal(choosePool({ currentTemp: 10, currentTag, incomingAmount: 9, medicUuid: MEDIC, choice: "replace" }).suggestion, "keep");
  assert.equal(choosePool({ currentTemp: 0, currentTag: null, incomingAmount: 0, medicUuid: MEDIC, choice: null }).suggestion, "keep");
});

test("choosePool: malformed choice or amounts throw", () => {
  assert.throws(() => choosePool({ currentTemp: 0, currentTag: null, incomingAmount: 3, medicUuid: MEDIC, choice: "stack" }), RangeError);
  assert.throws(() => choosePool({ currentTemp: 0, currentTag: null, incomingAmount: -3, medicUuid: MEDIC, choice: "replace" }), RangeError);
  assert.throws(() => choosePool({ currentTemp: "0", currentTag: null, incomingAmount: 3, medicUuid: MEDIC, choice: "replace" }), TypeError);
  assert.throws(() => choosePool({ currentTemp: 0, currentTag: null, incomingAmount: "3", medicUuid: MEDIC, choice: "replace" }), TypeError);
});

test("wardOf: only this Medic's live Ward counts (ruling 2026-10-28)", () => {
  assert.equal(wardOf({ temp: 8, tag: wardTag({ amount: 8 }) }, MEDIC), 8);
  assert.equal(wardOf({ temp: 3, tag: wardTag({ amount: 8 }) }, MEDIC), 3, "remaining temp HP, not the granted amount");
  assert.equal(wardOf({ temp: 8, tag: wardTag({ medicUuid: OTHER_MEDIC }) }, MEDIC), 0);
  assert.equal(wardOf({ temp: 8, tag: null }, MEDIC), 0);
  assert.equal(wardOf({ temp: 8, tag: undefined }, MEDIC), 0);
  assert.equal(wardOf({ temp: 0, tag: wardTag({ amount: 8 }) }, MEDIC), 0);
  assert.equal(wardOf({ temp: 8, tag: wardTag({ medicUuid: OTHER_MEDIC }) }, OTHER_MEDIC), 8);
});

test("reconcileTag: depleted, replaced by a non-Ward pool, or partially depleted", () => {
  const tag = wardTag({ amount: 8 });
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 0, tag, grantedByWard: false }), null);
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: -2, tag, grantedByWard: true }), null);

  // A larger pool that was not granted as Ward replaced the Ward.
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 12, tag, grantedByWard: false }), null);
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 12, tag, grantedByWard: "true" }), null, "strict !== true");

  // Partial depletion keeps the Ward tag.
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 5, tag, grantedByWard: false }), tag);
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 1, tag, grantedByWard: false }), tag);
  // Unchanged temp HP keeps it too.
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 8, tag, grantedByWard: false }), tag);
  // A Ward increase is the same pool growing.
  assert.deepEqual(reconcileTag({ tempBefore: 8, tempAfter: 12, tag, grantedByWard: true }), tag);
  // No tag stays no tag.
  assert.equal(reconcileTag({ tempBefore: 8, tempAfter: 5, tag: null, grantedByWard: false }), null);
});

// ------------------------------------------- statusResistance (C3:5063-5064)

test("statusResistance: first status save each turn has Advantage (C3:5063)", () => {
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "combat1:3:2", usedTurnKey: null }),
    { advantage: true, usedTurnKey: "combat1:3:2" }
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "combat1:3:2", usedTurnKey: "combat1:3:2" }),
    { advantage: false, usedTurnKey: "combat1:3:2" }
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "combat1:3:3", usedTurnKey: "combat1:3:2" }),
    { advantage: true, usedTurnKey: "combat1:3:3" }
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: "combat1:4:2", usedTurnKey: "combat1:3:2" }),
    { advantage: true, usedTurnKey: "combat1:4:2" }
  );
});

test("statusResistance: outside combat the Advantage is never consumed", () => {
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: null, usedTurnKey: null }),
    { advantage: true, usedTurnKey: null }
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: null, usedTurnKey: null }),
    { advantage: true, usedTurnKey: null },
    "a second out-of-combat save still has Advantage"
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: true, turnKey: null, usedTurnKey: "combat1:3:2" }),
    { advantage: true, usedTurnKey: "combat1:3:2" }
  );
});

test("statusResistance: no Ward or a non-status save gets no Advantage and burns nothing", () => {
  assert.deepEqual(
    statusResistance({ hasWard: false, savingVsStatusCondition: true, turnKey: "combat1:1:1", usedTurnKey: null }),
    { advantage: false, usedTurnKey: null }
  );
  assert.deepEqual(
    statusResistance({ hasWard: true, savingVsStatusCondition: false, turnKey: "combat1:1:1", usedTurnKey: null }),
    { advantage: false, usedTurnKey: null }
  );
  assert.deepEqual(
    statusResistance({ hasWard: false, savingVsStatusCondition: false, turnKey: null, usedTurnKey: null }),
    { advantage: false, usedTurnKey: null }
  );
});

// -------------------------------------------- treatTheCause (C3:5066-5069)

test("treatTheCause: full descriptor when every precondition holds", () => {
  assert.deepEqual(
    treatTheCause({ targetHasWard: true, attackerDistanceFeet: 30, reactionAvailable: true, saveDC: 15 }),
    {
      warnings: [],
      save: { ability: "dex", dc: 15 },
      damage: { formula: "2d10", type: "force" },
      onFail: { damage: "full", forcedMiss: true },
      onSuccess: { damage: "half", forcedMiss: false },
      restoreReactionCost: 15
    }
  );
});

test("treatTheCause: every broken precondition is a warning and the descriptor is still produced", () => {
  const noWard = treatTheCause({ targetHasWard: false, attackerDistanceFeet: 10, reactionAvailable: true, saveDC: 14 });
  assert.deepEqual(noWard.warnings, ["targetHasNoWard"]);
  assert.deepEqual(noWard.save, { ability: "dex", dc: 14 });
  assert.deepEqual(noWard.damage, { formula: "2d10", type: "force" });

  const far = treatTheCause({ targetHasWard: true, attackerDistanceFeet: 31, reactionAvailable: true, saveDC: 14 });
  assert.deepEqual(far.warnings, ["attackerOutOfRange"]);
  assert.deepEqual(far.onFail, { damage: "full", forcedMiss: true });

  const unknown = treatTheCause({ targetHasWard: true, attackerDistanceFeet: null, reactionAvailable: true, saveDC: 14 });
  assert.deepEqual(unknown.warnings, ["attackerRangeUnknown"]);

  const noReaction = treatTheCause({ targetHasWard: true, attackerDistanceFeet: 10, reactionAvailable: false, saveDC: 14 });
  assert.deepEqual(noReaction.warnings, ["noReaction"]);
  assert.equal(noReaction.restoreReactionCost, 15);

  const all = treatTheCause({ targetHasWard: false, attackerDistanceFeet: 40, reactionAvailable: false, saveDC: 14 });
  assert.deepEqual(sorted(all.warnings), ["attackerOutOfRange", "noReaction", "targetHasNoWard"]);
  assert.equal(all.restoreReactionCost, 15, "warnings never suppress the card");
});

test("treatTheCause: 30 feet is in range, 30.5 feet is not", () => {
  assert.deepEqual(
    treatTheCause({ targetHasWard: true, attackerDistanceFeet: 30, reactionAvailable: true, saveDC: 13 }).warnings,
    []
  );
  assert.deepEqual(
    treatTheCause({ targetHasWard: true, attackerDistanceFeet: 30.5, reactionAvailable: true, saveDC: 13 }).warnings,
    ["attackerOutOfRange"]
  );
});

test("treatTheCauseOutcome: full damage on a failed save, half rounded down on success", () => {
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: false, damageRolled: 11 }), { damage: 11, forcedMiss: true });
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 11 }), { damage: 5, forcedMiss: false });
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 1 }), { damage: 0, forcedMiss: false });
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: true, damageRolled: 0 }), { damage: 0, forcedMiss: false });
  assert.deepEqual(treatTheCauseOutcome({ saveSucceeded: false, damageRolled: 0 }), { damage: 0, forcedMiss: true });
  assert.throws(() => treatTheCauseOutcome({ saveSucceeded: true, damageRolled: -1 }), RangeError);
  assert.throws(() => treatTheCauseOutcome({ saveSucceeded: true, damageRolled: "11" }), TypeError);
});

// ----------------------------------------------- wardingSurge (C3:5071-5076)

test("wardingSurge: costs 10 Life Support and grants Resistance to those types", () => {
  assert.deepEqual(
    wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 26, damageTypes: ["fire"] }),
    {
      warnings: [],
      cost: 10,
      lifeSupportAfter: 16,
      shortfall: 0,
      resistTypes: ["fire"],
      expires: "endOfCurrentTurn",
      restoreReactionCost: 15
    }
  );
});

test("wardingSurge: resistTypes is unique but keeps first-seen order", () => {
  const result = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: ["fire", "cold", "fire"] });
  assert.deepEqual(sorted(result.resistTypes), ["cold", "fire"]);
  assert.equal(result.resistTypes.length, 2, "duplicate damage types are collapsed");
  assert.deepEqual(
    wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: [] }).resistTypes,
    []
  );
});

test("wardingSurge: Life Support clamps at 0 with a shortfall warning", () => {
  const short = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 4, damageTypes: ["fire"] });
  assert.equal(short.lifeSupportAfter, 0);
  assert.equal(short.shortfall, 6);
  assert.deepEqual(short.warnings, ["lifeSupportShort"]);
  assert.equal(short.cost, 10);

  const exact = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 10, damageTypes: ["fire"] });
  assert.equal(exact.lifeSupportAfter, 0);
  assert.equal(exact.shortfall, 0);
  assert.deepEqual(exact.warnings, []);

  const zero = wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: 0, damageTypes: ["fire"] });
  assert.equal(zero.lifeSupportAfter, 0);
  assert.equal(zero.shortfall, 10);
  assert.deepEqual(zero.warnings, ["lifeSupportShort"]);
});

test("wardingSurge: a wardless target or a spent Reaction warns but still describes the surge", () => {
  const result = wardingSurge({ targetHasWard: false, reactionAvailable: false, lifeSupport: 20, damageTypes: ["fire"] });
  assert.deepEqual(sorted(result.warnings), ["noReaction", "targetHasNoWard"]);
  assert.equal(result.cost, 10);
  assert.equal(result.lifeSupportAfter, 10);
  assert.equal(result.shortfall, 0);
  assert.deepEqual(result.resistTypes, ["fire"]);
  assert.equal(result.expires, "endOfCurrentTurn");
  assert.equal(result.restoreReactionCost, 15);
});

test("wardingSurge: malformed Life Support throws", () => {
  assert.throws(() => wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: -1, damageTypes: ["fire"] }), RangeError);
  assert.throws(() => wardingSurge({ targetHasWard: true, reactionAvailable: true, lifeSupport: "20", damageTypes: ["fire"] }), TypeError);
});

test("restoreReaction: 15 Life Support restores the Reaction, clamped with a shortfall", () => {
  assert.deepEqual(restoreReaction({ lifeSupport: 20 }), { cost: 15, lifeSupportAfter: 5, shortfall: 0, warnings: [] });
  assert.deepEqual(restoreReaction({ lifeSupport: 15 }), { cost: 15, lifeSupportAfter: 0, shortfall: 0, warnings: [] });
  assert.deepEqual(restoreReaction({ lifeSupport: 4 }), { cost: 15, lifeSupportAfter: 0, shortfall: 11, warnings: ["lifeSupportShort"] });
  assert.deepEqual(restoreReaction({ lifeSupport: 0 }), { cost: 15, lifeSupportAfter: 0, shortfall: 15, warnings: ["lifeSupportShort"] });
  assert.throws(() => restoreReaction({ lifeSupport: -1 }), RangeError);
  assert.throws(() => restoreReaction({ lifeSupport: "15" }), TypeError);
});

// -------------------------- collectiveWardSettlement (C3:5083, ruling 2026-10-28)

test("collectiveWardSettlement: Ward removes damage before the recipient's temp HP", () => {
  assert.deepEqual(
    collectiveWardSettlement({
      damage: 20,
      recipientTemp: 5,
      recipientHasWard: true,
      recipientDistanceFeet: 10,
      donors: [{ uuid: "Actor.donorA", ward: 8, distanceFeet: 10 }],
      removals: { "Actor.donorA": 5 }
    }),
    {
      removed: 5,
      damageAfterWard: 15,
      wasted: 0,
      tempAbsorbed: 5,
      hpLoss: 10,
      donorUpdates: [{ uuid: "Actor.donorA", wardBefore: 8, wardAfter: 3 }],
      warnings: []
    }
  );
});

test("collectiveWardSettlement: the recipient's temp HP only ever absorbs what Ward left (ruling 2026-10-28)", () => {
  const result = collectiveWardSettlement({
    damage: 20,
    recipientTemp: 10,
    recipientHasWard: true,
    recipientDistanceFeet: 5,
    donors: [{ uuid: "Actor.donorA", ward: 15, distanceFeet: 5 }],
    removals: { "Actor.donorA": 15 }
  });
  assert.equal(result.removed, 15);
  assert.equal(result.damageAfterWard, 5);
  assert.equal(result.tempAbsorbed, 5, "temp HP absorbs the post-Ward 5, never the pre-Ward 20");
  assert.equal(result.hpLoss, 0, "Ward already prevented the rest");
});

test("collectiveWardSettlement: excess Ward is wasted, never banked into temp HP", () => {
  const result = collectiveWardSettlement({
    damage: 4,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 5,
    donors: [{ uuid: "Actor.donorA", ward: 10, distanceFeet: 5 }],
    removals: { "Actor.donorA": 10 }
  });
  assert.equal(result.removed, 10);
  assert.equal(result.damageAfterWard, 0);
  assert.equal(result.wasted, 6);
  assert.equal(result.tempAbsorbed, 0, "donor Ward is consumed, not transferred");
  assert.equal(result.hpLoss, 0);
  assert.deepEqual(result.warnings, ["wardWasted"]);
  assert.deepEqual(result.donorUpdates, [{ uuid: "Actor.donorA", wardBefore: 10, wardAfter: 0 }]);
});

test("collectiveWardSettlement: removals clamp to the donor's remaining Ward", () => {
  const result = collectiveWardSettlement({
    damage: 12,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 5,
    donors: [{ uuid: "Actor.donorA", ward: 3, distanceFeet: 5 }],
    removals: { "Actor.donorA": 9 }
  });
  assert.equal(result.removed, 3);
  assert.equal(result.damageAfterWard, 9);
  assert.equal(result.wasted, 0);
  assert.equal(result.tempAbsorbed, 0);
  assert.equal(result.hpLoss, 9);
  assert.deepEqual(result.warnings, ["removalExceedsWard"]);
  assert.deepEqual(result.donorUpdates, [{ uuid: "Actor.donorA", wardBefore: 3, wardAfter: 0 }]);
});

test("collectiveWardSettlement: a zero removal consumes nothing and warns about nothing", () => {
  const result = collectiveWardSettlement({
    damage: 7,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 5,
    donors: [{ uuid: "Actor.donorA", ward: 3, distanceFeet: 5 }],
    removals: { "Actor.donorA": 0 }
  });
  assert.deepEqual(result.donorUpdates, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.removed, 0);
  assert.equal(result.damageAfterWard, 7);
  assert.equal(result.hpLoss, 7);
});

test("collectiveWardSettlement: out-of-range donors and recipients warn but still apply", () => {
  const far = collectiveWardSettlement({
    damage: 10,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 35,
    donors: [{ uuid: "Actor.donorA", ward: 6, distanceFeet: 31 }],
    removals: { "Actor.donorA": 4 }
  });
  assert.equal(far.removed, 4, "warn, never block");
  assert.equal(far.damageAfterWard, 6);
  assert.deepEqual(sorted(far.warnings), ["donorOutOfRange", "recipientOutOfRange"]);

  const unknown = collectiveWardSettlement({
    damage: 10,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 30,
    donors: [{ uuid: "Actor.donorA", ward: 6, distanceFeet: null }],
    removals: { "Actor.donorA": 4 }
  });
  assert.deepEqual(unknown.warnings, ["donorRangeUnknown"]);
  assert.equal(unknown.removed, 4);

  const atRange = collectiveWardSettlement({
    damage: 10,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 30,
    donors: [{ uuid: "Actor.donorA", ward: 6, distanceFeet: 30 }],
    removals: { "Actor.donorA": 4 }
  });
  assert.deepEqual(atRange.warnings, [], "30 feet is inside the 30-foot limit");
});

test("collectiveWardSettlement: a wardless recipient still settles and warns", () => {
  const result = collectiveWardSettlement({
    damage: 10,
    recipientTemp: 2,
    recipientHasWard: false,
    recipientDistanceFeet: 10,
    donors: [{ uuid: "Actor.donorA", ward: 6, distanceFeet: 10 }],
    removals: { "Actor.donorA": 3 }
  });
  assert.deepEqual(result.warnings, ["recipientHasNoWard"]);
  assert.equal(result.removed, 3);
  assert.equal(result.damageAfterWard, 7);
  assert.equal(result.tempAbsorbed, 2);
  assert.equal(result.hpLoss, 5);
});

test("collectiveWardSettlement: sums clamped removals and reports only donors actually consumed", () => {
  const result = collectiveWardSettlement({
    damage: 30,
    recipientTemp: 4,
    recipientHasWard: true,
    recipientDistanceFeet: 10,
    donors: [
      { uuid: "Actor.donorA", ward: 6, distanceFeet: 10 },
      { uuid: "Actor.donorB", ward: 9, distanceFeet: 20 },
      { uuid: "Actor.donorC", ward: 5, distanceFeet: 10 }
    ],
    removals: { "Actor.donorA": 6, "Actor.donorB": 2, "Actor.donorC": 0 }
  });
  assert.equal(result.removed, 8);
  assert.equal(result.damageAfterWard, 22);
  assert.equal(result.wasted, 0);
  assert.equal(result.tempAbsorbed, 4);
  assert.equal(result.hpLoss, 18);
  assert.deepEqual(sorted(result.donorUpdates.map((update) => update.uuid)), ["Actor.donorA", "Actor.donorB"]);
  assert.deepEqual(byUuid(result.donorUpdates)["Actor.donorA"], { uuid: "Actor.donorA", wardBefore: 6, wardAfter: 0 });
  assert.deepEqual(byUuid(result.donorUpdates)["Actor.donorB"], { uuid: "Actor.donorB", wardBefore: 9, wardAfter: 7 });
  assert.equal("Actor.donorC" in byUuid(result.donorUpdates), false);
  assert.deepEqual(result.warnings, []);
});

test("collectiveWardSettlement: no donors leaves native temp HP to absorb alone", () => {
  assert.deepEqual(
    collectiveWardSettlement({
      damage: 6,
      recipientTemp: 10,
      recipientHasWard: true,
      recipientDistanceFeet: 5,
      donors: [],
      removals: {}
    }),
    { removed: 0, damageAfterWard: 6, wasted: 0, tempAbsorbed: 6, hpLoss: 0, donorUpdates: [], warnings: [] }
  );
});

test("collectiveWardSettlement: negative damage is malformed", () => {
  assert.throws(() => collectiveWardSettlement({
    damage: -1,
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 5,
    donors: [],
    removals: {}
  }), RangeError);
  assert.throws(() => collectiveWardSettlement({
    damage: "20",
    recipientTemp: 0,
    recipientHasWard: true,
    recipientDistanceFeet: 5,
    donors: [],
    removals: {}
  }), TypeError);
});

// ------------------------------------------ wardRegeneration (C3:5085)

test("wardRegeneration: half Medic level rounded up from level 15 without your own Ward", () => {
  assert.deepEqual(wardRegeneration({ medicLevel: 15, hasOwnWard: false, currentTemp: 0 }), { eligible: true, amount: 8, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 16, hasOwnWard: false, currentTemp: 0 }), { eligible: true, amount: 8, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 17, hasOwnWard: false, currentTemp: 0 }), { eligible: true, amount: 9, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 20, hasOwnWard: false, currentTemp: 0 }), { eligible: true, amount: 10, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 14, hasOwnWard: false, currentTemp: 0 }), { eligible: false, amount: 7, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 15, hasOwnWard: true, currentTemp: 0 }), { eligible: false, amount: 8, warnings: [] });
  assert.deepEqual(wardRegeneration({ medicLevel: 1, hasOwnWard: false, currentTemp: 0 }), { eligible: false, amount: 1, warnings: [] });
});

test("wardRegeneration: existing temp HP is a keep/replace choice, not a stack", () => {
  assert.deepEqual(
    wardRegeneration({ medicLevel: 16, hasOwnWard: false, currentTemp: 3 }),
    { eligible: true, amount: 8, warnings: ["replacesOtherTemp"] }
  );
  assert.deepEqual(wardRegeneration({ medicLevel: 16, hasOwnWard: false, currentTemp: 0 }).warnings, []);
  // The warning is about the pool, independent of eligibility.
  assert.deepEqual(wardRegeneration({ medicLevel: 15, hasOwnWard: true, currentTemp: 3 }).warnings, ["replacesOtherTemp"]);
});

test("wardRegeneration: a Medic level outside 1-20 is malformed", () => {
  assert.throws(() => wardRegeneration({ medicLevel: 0, hasOwnWard: false, currentTemp: 0 }), RangeError);
  assert.throws(() => wardRegeneration({ medicLevel: 21, hasOwnWard: false, currentTemp: 0 }), RangeError);
  assert.throws(() => wardRegeneration({ medicLevel: -3, hasOwnWard: false, currentTemp: 0 }), RangeError);
  assert.throws(() => wardRegeneration({ medicLevel: "15", hasOwnWard: false, currentTemp: 0 }), TypeError);
});

// --------------------------------------------------------------- purity

test("purity: no export mutates its inputs", () => {
  const api = {
    wardGrant, extraTempHP, choosePool, wardOf, reconcileTag, statusResistance,
    treatTheCause, treatTheCauseOutcome, wardingSurge, restoreReaction,
    collectiveWardSettlement, wardRegeneration
  };
  const cases = [
    ["wardGrant", [{ healingAmount: 7, actionType: "action", fromArt: true, apSpent: 3 }]],
    ["extraTempHP", [{ actionType: "bonus", fromArt: true, apSpent: 2 }]],
    ["choosePool", [{ currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: "replace" }]],
    ["choosePool", [{ currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: "keep" }]],
    ["choosePool", [{ currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: null }]],
    ["wardOf", [{ temp: 8, tag: wardTag({ amount: 8 }) }, MEDIC]],
    ["reconcileTag", [{ tempBefore: 8, tempAfter: 5, tag: wardTag({ amount: 8 }), grantedByWard: false }]],
    ["statusResistance", [{ hasWard: true, savingVsStatusCondition: true, turnKey: "combat1:1:1", usedTurnKey: null }]],
    ["treatTheCause", [{ targetHasWard: false, attackerDistanceFeet: null, reactionAvailable: false, saveDC: 14 }]],
    ["treatTheCauseOutcome", [{ saveSucceeded: true, damageRolled: 9 }]],
    ["wardingSurge", [{ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: ["fire", "cold", "slashing", "fire"] }]],
    ["restoreReaction", [{ lifeSupport: 20 }]],
    ["collectiveWardSettlement", [{
      damage: 20,
      recipientTemp: 5,
      recipientHasWard: true,
      recipientDistanceFeet: 10,
      donors: [{ uuid: "Actor.donorA", ward: 8, distanceFeet: 10 }],
      removals: { "Actor.donorA": 5 }
    }]],
    ["wardRegeneration", [{ medicLevel: 16, hasOwnWard: false, currentTemp: 3 }]]
  ];
  for (const [name, args] of cases) {
    const snapshot = clone(args);
    api[name](...args);
    assert.deepEqual(args, snapshot, `${name} mutated its input`);
  }
});

test("purity: deep-frozen inputs are accepted", () => {
  assert.doesNotThrow(() => {
    wardGrant(freezeDeep({ healingAmount: 7, actionType: "action", fromArt: true, apSpent: 3 }));
    extraTempHP(freezeDeep({ actionType: "bonus", fromArt: true, apSpent: 2 }));
    choosePool(freezeDeep({ currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: "replace" }));
    choosePool(freezeDeep({ currentTemp: 4, currentTag: wardTag({ amount: 4 }), incomingAmount: 9, medicUuid: MEDIC, choice: "keep" }));
    wardOf(freezeDeep({ temp: 8, tag: wardTag({ amount: 8 }) }), MEDIC);
    reconcileTag(freezeDeep({ tempBefore: 8, tempAfter: 5, tag: wardTag({ amount: 8 }), grantedByWard: false }));
    statusResistance(freezeDeep({ hasWard: true, savingVsStatusCondition: true, turnKey: "combat1:1:1", usedTurnKey: null }));
    treatTheCause(freezeDeep({ targetHasWard: true, attackerDistanceFeet: 10, reactionAvailable: true, saveDC: 14 }));
    treatTheCauseOutcome(freezeDeep({ saveSucceeded: true, damageRolled: 9 }));
    wardingSurge(freezeDeep({ targetHasWard: true, reactionAvailable: true, lifeSupport: 20, damageTypes: ["fire"] }));
    restoreReaction(freezeDeep({ lifeSupport: 20 }));
    collectiveWardSettlement(freezeDeep({
      damage: 20,
      recipientTemp: 5,
      recipientHasWard: true,
      recipientDistanceFeet: 10,
      donors: [{ uuid: "Actor.donorA", ward: 8, distanceFeet: 10 }],
      removals: { "Actor.donorA": 5 }
    }));
    wardRegeneration(freezeDeep({ medicLevel: 16, hasOwnWard: false, currentTemp: 3 }));
  });
});

test("purity: the module source touches no Foundry globals, rolls or randomness", () => {
  const source = readFileSync(new URL("../scripts/ward-rules.mjs", import.meta.url), "utf8");
  const forbidden = [
    [/\bgame\./, "game."],
    [/\bui\./, "ui."],
    [/\bHooks\./, "Hooks."],
    [/\bfoundry\./, "foundry."],
    [/\bRoll\(/, "Roll("],
    [/\bMath\.random\b/, "Math.random"]
  ];
  for (const [pattern, label] of forbidden) {
    assert.equal(pattern.test(source), false, `ward-rules.mjs must not reference ${label}`);
  }
});
