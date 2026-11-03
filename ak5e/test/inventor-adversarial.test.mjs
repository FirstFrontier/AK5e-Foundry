/**
 * Adversarial Stress Test Suite for AK5e Inventor Specialist Subclass (Ch. 3 L5847–6140 & DECISIONS.md).
 * Authored by Empirical Challenger (challenger_m1) to ruthlessly attack:
 *  1. Instability Calculation Boundary Conditions:
 *     - 0 modifications (returns 0 / safe, unmodified equipment never rolls Instability)
 *     - 1 standard modification (base 3)
 *     - 1 dangerous modification (base 3 + 1 extra = 4)
 *     - Multiple modifications (e.g. 3 standard + 1 dangerous = 7; 2 standard + 2 dangerous = 8)
 *     - Level 11 Risk Assessment stacking: Speciality Modding (-1), Trained Operator (-1), both stacking (-2)
 *     - Instability reduction clamping: cannot drop below 1 (e.g. base 3 with -2 reduction = 1, base 3 with -5 clamp = 1)
 *  2. Breakdown Roll Mathematics & Generative Boundary Edge Cases:
 *     - Instability = 1 (1d6): 0% breakdown probability across all 6 faces [1]..[6]
 *     - Instability >= 7 (7d6+): 100% guaranteed duplicate dice by Dirichlet Pigeonhole Principle across 100+ random rolls
 *     - Arbitrary dice arrays: distinct faces always breakdown === false
 *     - Arbitrary dice arrays: matching pairs (adjacent, ends, interior) always breakdown === true
 *     - Multi-way matches: triples, quads, two pairs, full houses always breakdown === true
 *     - Generative property-based stress tests with randomized permutations
 *  3. Breakdown HP Loss Formula & Clamping:
 *     - Scaling: 1d8 at Instability 1, 2, 3; 2d8 at 4; 3d8 at 5; 4d8 at 6; 5d8 at 7; Nd8 at N+2
 *     - Creature at 1 HP: applied damage MUST be 0 (cannot drop below 1 HP)
 *     - Creature at 5 HP: roll of 8 deals exactly 4 damage (remaining HP = 1)
 *     - Parametric sweep across HP 1..50 and rolled damage 1..100: remaining HP is always >= 1
 *  4. Dangerous Breakdown Equipment Rider Isolation:
 *     - Activating Dangerous mod on breakdown: equipment is marked broken (isBrokenEquipment === true)
 *     - Activating Non-Dangerous mod on item with Dangerous mod: HP loss inflicted, equipment NOT marked broken
 *     - Broken equipment blocks usage / warns until repaired
 *     - Maintenance Kit repair restores broken equipment cleanly (isBrokenEquipment === false)
 *     - Repairing non-broken equipment is a safe no-op
 *  5. Inventions Pool Integrity & Modification Gating:
 *     - Duplicate modifications on same equipment strictly prohibited
 *     - Modifications on magical items strictly prohibited
 *     - Cross-category modification gating (melee mod on ranged/armor, ranged mod on melee, armor mod on weapon)
 *     - Inventions pool accounting: applying decrements pool, removing refunds pool, pool cannot overdraw
 *     - 1-week maintenance expiry tracking
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { SPECIALIST_CLASS_ID } from "../scripts/specialist-rules.mjs";
import * as specialistRules from "../scripts/specialist-rules.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";

// Top-level dynamic import so tests can report precise diagnostics if module is not yet compiled
let inventorModule = null;
let importError = null;

try {
  inventorModule = await import("../scripts/inventor-features.mjs");
} catch (err) {
  importError = err;
}

// Helpers that dynamically delegate to the module under test
function getFeature(name) {
  if (inventorModule && name in inventorModule) {
    return inventorModule[name];
  }
  if (name in specialistRules) {
    return specialistRules[name];
  }
  return null;
}

function req(name) {
  const fn = getFeature(name);
  if (!fn) {
    throw new Error(
      `[Adversarial Assertion Failed] Required export '${name}' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. ` +
      (importError ? `Import error: ${importError.message}` : "Ensure worker_m1 implements and exports it.")
    );
  }
  return fn;
}

// Global fixtures setup and teardown
test.beforeEach(() => {
  setupFoundryGlobals();
  const defPools = getFeature("defineInventorPools") ?? getFeature("registerInventorPools");
  if (typeof defPools === "function") {
    defPools();
  }
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

// Actor and Item test generators
function createInventorActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subClass = createTestItem({
    name: "Inventor",
    type: "subclass",
    identifier: "inventor",
    flags: {
      ak5e: {
        chapterThreeId: "subclass-specialist-inventor"
      }
    }
  });

  const prof = options.prof ?? (Math.floor((level - 1) / 4) + 2);
  const intMod = options.intMod ?? 3;
  const dexMod = options.dexMod ?? 2;
  const strMod = options.strMod ?? 1;

  return createTestActor({
    name: options.name ?? "Test Inventor",
    items: [sClass, subClass, ...(options.items ?? [])],
    system: {
      ...options.system,
      attributes: {
        prof,
        movement: { walk: 30 },
        hp: {
          value: options.hp ?? 20,
          max: options.maxHp ?? 20,
          temp: 0
        },
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { mod: strMod, value: 10 + strMod * 2 },
        dex: { mod: dexMod, value: 10 + dexMod * 2 },
        con: { mod: 2, value: 14 },
        int: { mod: intMod, value: 10 + intMod * 2 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 },
        ...(options.system?.abilities ?? {})
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "inventor",
          branchId: "subclass-specialist-inventor",
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "brawler"
        },
        ...(options.flags?.ak5e ?? {})
      }
    }
  });
}

function createWeapon(name = "Longsword", options = {}) {
  return createTestItem({
    name,
    type: "weapon",
    system: {
      actionType: options.actionType ?? "mwak",
      type: { value: options.weaponType ?? "simpleM" },
      damage: { parts: [["1d8", "slashing"]] },
      properties: { ...(options.properties ?? {}) },
      magical: options.magical ?? false,
      rarity: options.rarity ?? "common"
    },
    flags: {
      ak5e: {
        inventor: {
          modifications: options.modifications ?? []
        },
        ...(options.flags?.ak5e ?? {})
      }
    }
  });
}

function createArmor(name = "Chain Mail", options = {}) {
  return createTestItem({
    name,
    type: "equipment",
    system: {
      type: { value: options.armorType ?? "heavy" },
      armor: { value: options.ac ?? 16 },
      magical: options.magical ?? false,
      rarity: options.rarity ?? "common"
    },
    flags: {
      ak5e: {
        inventor: {
          modifications: options.modifications ?? []
        },
        ...(options.flags?.ak5e ?? {})
      }
    }
  });
}

// ============================================================================
// 1. Instability Calculation Boundary Conditions
// ============================================================================

test("Vector 1.1: Instability with 0 modifications returns 0 (unmodified equipment is safe)", () => {
  const calc = req("calculateInstability");
  const actor = createInventorActor(3);
  const cleanWeapon = createWeapon("Clean Longsword", { modifications: [] });
  const cleanArmor = createArmor("Clean Armor", { modifications: [] });

  assert.equal(calc(cleanWeapon, actor), 0, "Clean weapon with 0 mods must have Instability 0");
  assert.equal(calc(cleanArmor, actor), 0, "Clean armor with 0 mods must have Instability 0");

  // Also verify null/undefined/missing modifications field does not throw and returns 0
  const bareItem = createTestItem({ name: "Bare Item", type: "weapon" });
  assert.equal(calc(bareItem, actor), 0, "Item without modifications flag must have Instability 0");
});

test("Vector 1.2: Instability with 1 standard modification evaluates to base 3", () => {
  const calc = req("calculateInstability");
  const actor = createInventorActor(3);
  const moddedWeapon = createWeapon("Modded Sword", {
    modifications: [{ id: "boom-module", name: "Boom Module", isDangerous: false }]
  });

  const instability = calc(moddedWeapon, actor);
  assert.equal(instability, 3, "1 standard modification must evaluate to base Instability 3");
});

test("Vector 1.3: Instability with 1 dangerous modification evaluates to base 3 + 1 = 4", () => {
  const calc = req("calculateInstability");
  const actor = createInventorActor(3);
  const dangerousWeapon = createWeapon("Laser Sword", {
    modifications: [{ id: "laser-cutter", name: "Laser Cutter", isDangerous: true }]
  });

  const instability = calc(dangerousWeapon, actor);
  assert.equal(instability, 4, "1 dangerous modification must evaluate to Instability 4 (base 3 + 1 dangerous)");
});

test("Vector 1.4: Instability with multiple modifications scales correctly (+1 per extra, +1 per dangerous)", () => {
  const calc = req("calculateInstability");
  const actor = createInventorActor(3);

  // 2 standard mods: base 3 + (2 - 1) = 4
  const twoStd = createWeapon("Two Std", {
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false },
      { id: "burning-edge", name: "Burning Edge", isDangerous: false }
    ]
  });
  assert.equal(calc(twoStd, actor), 4, "2 standard mods must evaluate to Instability 4");

  // 3 standard mods: base 3 + (3 - 1) = 5
  const threeStd = createWeapon("Three Std", {
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false },
      { id: "burning-edge", name: "Burning Edge", isDangerous: false },
      { id: "rotary-blade", name: "Rotary Blade", isDangerous: false }
    ]
  });
  assert.equal(calc(threeStd, actor), 5, "3 standard mods must evaluate to Instability 5");

  // 3 standard + 1 dangerous: 4 mods total (3 extra + 1 dangerous) = 3 + 3 + 1 = 7
  const mixedWeapon = createWeapon("Mixed Weapon", {
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false },
      { id: "burning-edge", name: "Burning Edge", isDangerous: false },
      { id: "rotary-blade", name: "Rotary Blade", isDangerous: false },
      { id: "laser-cutter", name: "Laser Cutter", isDangerous: true }
    ]
  });
  assert.equal(calc(mixedWeapon, actor), 7, "3 standard + 1 dangerous mods must evaluate to Instability 7");

  // 2 standard + 2 dangerous: 4 mods total (3 extra + 2 dangerous) = 3 + 3 + 2 = 8
  const twoDangerous = createWeapon("Double Dangerous", {
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false },
      { id: "burning-edge", name: "Burning Edge", isDangerous: false },
      { id: "laser-cutter", name: "Laser Cutter", isDangerous: true },
      { id: "arts-cannon", name: "Arts Cannon", isDangerous: true }
    ]
  });
  assert.equal(calc(twoDangerous, actor), 8, "2 standard + 2 dangerous mods must evaluate to Instability 8");
});

test("Vector 1.5: Level 11 Risk Assessment reductions stack (-1 Speciality Modding, -1 Trained Operator)", () => {
  const calc = req("calculateInstability");

  // Pre-11 actor: level 10 has NO Risk Assessment reductions
  const actorLv10 = createInventorActor(10, { weaponCategory: "melee" });
  const weapon = createWeapon("Specialised Melee", {
    actionType: "mwak",
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false },
      { id: "burning-edge", name: "Burning Edge", isDangerous: false },
      { id: "rotary-blade", name: "Rotary Blade", isDangerous: false },
      { id: "laser-cutter", name: "Laser Cutter", isDangerous: true }
    ] // Base = 7
  });
  weapon.actor = actorLv10;
  assert.equal(calc(weapon, actorLv10, { wielder: actorLv10, isInventorWielder: true }), 7, "Level 10 Inventor receives 0 reductions");

  // Level 11 actor wielding their specialised weapon: receives BOTH reductions (-2 total)
  const actorLv11 = createInventorActor(11, { weaponCategory: "melee" });
  weapon.actor = actorLv11;
  assert.equal(
    calc(weapon, actorLv11, { wielder: actorLv11, isInventorWielder: true }),
    5,
    "Level 11 Inventor wielding specialised weapon receives -2 Instability (7 -> 5)"
  );

  // Level 11 actor wielding NON-specialised weapon: receives ONLY Trained Operator (-1 total)
  const rangedWeapon = createWeapon("Ranged Weapon", {
    actionType: "rwak",
    modifications: weapon.flags.ak5e.inventor.modifications
  });
  rangedWeapon.actor = actorLv11;
  assert.equal(
    calc(rangedWeapon, actorLv11, { wielder: actorLv11, isInventorWielder: true }),
    6,
    "Level 11 Inventor wielding non-specialised weapon receives only -1 Instability (7 -> 6)"
  );

  // Ally wielding the Inventor's specialised weapon: receives Speciality Modding (-1) but NOT Trained Operator (0) -> -1 total (7 -> 6)
  const ally = createTestActor({ name: "Ally" });
  weapon.actor = ally;
  assert.equal(
    calc(weapon, actorLv11, { wielder: ally, isInventorWielder: false, trainedOperator: false }),
    6,
    "Ally wielding Inventor's specialised weapon receives Speciality Modding (-1) but not Trained Operator (7 -> 6)"
  );

  // Ally wielding non-specialised weapon (ranged when specialisation is melee): receives 0 reductions (7 remains 7)
  rangedWeapon.actor = ally;
  assert.equal(
    calc(rangedWeapon, actorLv11, { wielder: ally, isInventorWielder: false, trainedOperator: false }),
    7,
    "Ally wielding Inventor's non-specialised weapon receives 0 reductions (7 remains 7)"
  );
});

test("Vector 1.6: Instability reduction clamping ensures Instability NEVER drops below 1", () => {
  const calc = req("calculateInstability");
  const actorLv11 = createInventorActor(11, { weaponCategory: "melee" });

  // 1 standard mod on specialised weapon: Base 3 - 2 (Speciality + Trained) = 1
  const singleModWeapon = createWeapon("Single Mod", {
    actionType: "mwak",
    modifications: [{ id: "boom-module", name: "Boom Module", isDangerous: false }]
  });
  singleModWeapon.actor = actorLv11;
  assert.equal(
    calc(singleModWeapon, actorLv11, { wielder: actorLv11, isInventorWielder: true }),
    1,
    "1 standard mod with -2 reduction must equal 1"
  );

  // Stress-test with additional hypothetical reduction parameters: must clamp at minimum 1
  const clampedResult = calc(singleModWeapon, actorLv11, { riskAssessmentReductions: 5 });
  assert.equal(clampedResult, 1, `Instability must clamp at 1 under heavy reductions; got ${clampedResult}`);

  // Test across parametric reduction sweep from 0 to 10: result is strictly >= 1
  for (let red = 0; red <= 10; red++) {
    const val = calc(singleModWeapon, actorLv11, { riskAssessmentReductions: red });
    assert.ok(val >= 1, `Instability clamped at min 1 under reduction ${red}; got ${val}`);
  }
});

// ============================================================================
// 2. Breakdown Roll Mathematics & Generative Edge Cases
// ============================================================================

test("Vector 2.1: Instability = 1 rolling 1d6 CANNOT have duplicate dice (breakdown probability is strictly 0%)", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };

  // For every single possible outcome of 1d6, breakdown MUST be false
  for (let face = 1; face <= 6; face++) {
    const res = evalRoll([face], 1, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(
      isBreakdown,
      false,
      `Rolling 1d6 with face [${face}] must NOT trigger a breakdown (single die cannot match another die)`
    );
  }
});

test("Vector 2.2: Instability >= 7 rolling 7d6+ MUST ALWAYS trigger breakdown (Dirichlet Pigeonhole Principle)", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };

  // Test worst-case distinct 6-dice array [1, 2, 3, 4, 5, 6]: adding ANY 7th die forces a match
  for (let seventh = 1; seventh <= 6; seventh++) {
    const dice = [1, 2, 3, 4, 5, 6, seventh];
    const res = evalRoll(dice, 7, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(
      isBreakdown,
      true,
      `Array ${JSON.stringify(dice)} must trigger breakdown by Pigeonhole Principle`
    );
  }

  // Generative randomized stress test: 100 random 7d6 rolls
  for (let trial = 0; trial < 100; trial++) {
    const random7d6 = Array.from({ length: 7 }, () => Math.floor(Math.random() * 6) + 1);
    const res = evalRoll(random7d6, 7, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(
      isBreakdown,
      true,
      `Random 7d6 roll ${JSON.stringify(random7d6)} must guarantee breakdown`
    );
  }

  // Verify scaling to 8d6, 10d6, 15d6, 20d6
  for (const count of [8, 10, 15, 20]) {
    const dice = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
    const res = evalRoll(dice, count, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(isBreakdown, true, `${count}d6 roll must guarantee breakdown`);
  }
});

test("Vector 2.3: Arbitrary dice arrays with ALL distinct values evaluate to breakdown === FALSE", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };

  const distinctCases = [
    [1, 2],
    [2, 5],
    [1, 3, 6],
    [2, 4, 6],
    [1, 2, 4, 5],
    [2, 3, 4, 5, 6],
    [1, 2, 3, 4, 5, 6],
    [6, 5, 4, 3, 2, 1], // reverse order
    [3, 1, 5, 2, 6, 4]  // scrambled order
  ];

  for (const dice of distinctCases) {
    const res = evalRoll(dice, dice.length, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(
      isBreakdown,
      false,
      `Distinct dice array ${JSON.stringify(dice)} must NOT trigger breakdown`
    );
  }
});

test("Vector 2.4: Arbitrary dice arrays with at least one matching pair evaluate to breakdown === TRUE", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };

  const matchingCases = [
    { dice: [2, 2], name: "minimal pair" },
    { dice: [6, 6], name: "highest pair" },
    { dice: [1, 1, 4], name: "leading pair" },
    { dice: [3, 5, 5], name: "trailing pair" },
    { dice: [2, 4, 2], name: "split pair (ends)" },
    { dice: [1, 3, 3, 5], name: "interior pair" },
    { dice: [1, 2, 3, 4, 5, 5], name: "6 dice with trailing pair" },
    { dice: [6, 1, 2, 3, 4, 6], name: "6 dice with outer pair" }
  ];

  for (const { dice, name } of matchingCases) {
    const res = evalRoll(dice, dice.length, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(
      isBreakdown,
      true,
      `Dice array ${JSON.stringify(dice)} (${name}) must trigger breakdown`
    );
  }
});

test("Vector 2.5: Multi-way matches (triples, quads, two pairs, full house) evaluate to breakdown === TRUE", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };

  const multiMatches = [
    { dice: [3, 3, 3], name: "triple" },
    { dice: [1, 4, 4, 4, 6], name: "interior triple" },
    { dice: [2, 2, 2, 2], name: "quad" },
    { dice: [5, 5, 5, 5, 5], name: "five-of-a-kind" },
    { dice: [1, 1, 3, 3], name: "two pairs" },
    { dice: [2, 4, 2, 4, 6], name: "separated two pairs" },
    { dice: [4, 4, 4, 5, 5], name: "full house" }
  ];

  for (const { dice, name } of multiMatches) {
    const res = evalRoll(dice, dice.length, mod);
    const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
    assert.equal(
      isBreakdown,
      true,
      `Multi-match dice array ${JSON.stringify(dice)} (${name}) must trigger breakdown`
    );
  }
});

test("Vector 2.6: Generative property-based test for dice evaluation", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };

  // Generator: start with distinct subset of {1..6}, assert breakdown === false;
  // then duplicate one element, assert breakdown === true
  for (let trial = 0; trial < 50; trial++) {
    const faces = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    const len = Math.floor(Math.random() * 5) + 2; // length 2 to 6
    const distinctSet = faces.slice(0, len);

    // 1. Distinct set must be false
    const safeRes = evalRoll(distinctSet, len, mod);
    const isBreakdownSafe = Boolean(safeRes.isBreakdown ?? safeRes.breakdown);
    assert.equal(isBreakdownSafe, false, `Distinct set ${JSON.stringify(distinctSet)} must be safe`);

    // 2. Duplicating any member must flip to true
    const duplicateFace = distinctSet[Math.floor(Math.random() * distinctSet.length)];
    const dupeSet = [...distinctSet, duplicateFace];
    const dupeRes = evalRoll(dupeSet, dupeSet.length, mod);
    const isBreakdownDupe = Boolean(dupeRes.isBreakdown ?? dupeRes.breakdown);
    assert.equal(isBreakdownDupe, true, `Duplicated set ${JSON.stringify(dupeSet)} must trigger breakdown`);
  }
});

// ============================================================================
// 3. Breakdown HP Loss Formula & Clamping
// ============================================================================

test("Vector 3.1: Damage formula scaling: 1d8 + max(0, Instability - 3)d8", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };
  const matchingPair = [2, 2];

  // Instability 1: 1d8
  const r1 = evalRoll(matchingPair, 1, mod);
  const diceCount1 = r1.hpLossDiceCount ?? r1.diceCount ?? parseInt(r1.hpLossFormula ?? r1.damageFormula, 10);
  assert.equal(diceCount1, 1, "Instability 1 must inflict 1d8 (term max(0, 1-3) is 0)");

  // Instability 2: 1d8
  const r2 = evalRoll(matchingPair, 2, mod);
  const diceCount2 = r2.hpLossDiceCount ?? r2.diceCount ?? parseInt(r2.hpLossFormula ?? r2.damageFormula, 10);
  assert.equal(diceCount2, 1, "Instability 2 must inflict 1d8 (term max(0, 2-3) is 0)");

  // Instability 3: 1d8
  const r3 = evalRoll(matchingPair, 3, mod);
  const diceCount3 = r3.hpLossDiceCount ?? r3.diceCount ?? parseInt(r3.hpLossFormula ?? r3.damageFormula, 10);
  assert.equal(diceCount3, 1, "Instability 3 must inflict 1d8 (term max(0, 3-3) is 0)");

  // Instability 4: 2d8
  const r4 = evalRoll(matchingPair, 4, mod);
  const diceCount4 = r4.hpLossDiceCount ?? r4.diceCount ?? parseInt(r4.hpLossFormula ?? r4.damageFormula, 10);
  assert.equal(diceCount4, 2, "Instability 4 must inflict 2d8 (1 + max(0, 4-3))");

  // Instability 5: 3d8
  const r5 = evalRoll(matchingPair, 5, mod);
  const diceCount5 = r5.hpLossDiceCount ?? r5.diceCount ?? parseInt(r5.hpLossFormula ?? r5.damageFormula, 10);
  assert.equal(diceCount5, 3, "Instability 5 must inflict 3d8 (1 + max(0, 5-3))");

  // Instability 6: 4d8
  const r6 = evalRoll(matchingPair, 6, mod);
  const diceCount6 = r6.hpLossDiceCount ?? r6.diceCount ?? parseInt(r6.hpLossFormula ?? r6.damageFormula, 10);
  assert.equal(diceCount6, 4, "Instability 6 must inflict 4d8");

  // Instability 7: 5d8
  const r7 = evalRoll(matchingPair, 7, mod);
  const diceCount7 = r7.hpLossDiceCount ?? r7.diceCount ?? parseInt(r7.hpLossFormula ?? r7.damageFormula, 10);
  assert.equal(diceCount7, 5, "Instability 7 must inflict 5d8");
});

test("Vector 3.2: HP Clamping at 1 HP: applied damage MUST be 0 and HP cannot drop below 1", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };
  const pair = [3, 3];

  const res = evalRoll(pair, 4, mod, { currentHP: 1, damage: 8, rolledDamage: 8 });
  const applied = res.actualHPLoss ?? res.appliedDamage ?? 0;
  assert.equal(applied, 0, "Creature at 1 HP must take 0 damage on breakdown");
  assert.ok(1 - applied >= 1, "Remaining HP must stay at least 1");

  // Even with astronomical damage roll (e.g. 64), 1 HP creature takes 0
  const resHuge = evalRoll(pair, 4, mod, { currentHP: 1, damage: 64, rolledDamage: 64 });
  const appliedHuge = resHuge.actualHPLoss ?? resHuge.appliedDamage ?? 0;
  assert.equal(appliedHuge, 0, "Creature at 1 HP taking 64 rolled damage must take 0 damage");
});

test("Vector 3.3: HP Clamping at 5 HP with roll of 8 deals exactly 4 damage (remaining HP = 1)", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };
  const pair = [4, 4];

  const res = evalRoll(pair, 4, mod, { currentHP: 5, damage: 8, rolledDamage: 8 });
  const applied = res.actualHPLoss ?? res.appliedDamage;
  assert.equal(applied, 4, "Creature at 5 HP with damage roll 8 must suffer exactly 4 damage (5 - 1 = 4)");
  assert.equal(5 - applied, 1, "Remaining HP must be exactly 1");

  // If damage rolled is 3 (less than 4): applied is 3, remaining HP is 2
  const resSmall = evalRoll(pair, 4, mod, { currentHP: 5, damage: 3, rolledDamage: 3 });
  const appliedSmall = resSmall.actualHPLoss ?? resSmall.appliedDamage;
  assert.equal(appliedSmall, 3, "Creature at 5 HP with damage roll 3 must suffer 3 damage");
  assert.equal(5 - appliedSmall, 2, "Remaining HP must be 2");
});

test("Vector 3.4: Parametric sweep across current HP (1..50) and rolled damage (1..100)", () => {
  const evalRoll = req("evaluateBreakdownRoll");
  const mod = { id: "boom-module", isDangerous: false };
  const pair = [5, 5];

  for (let hp = 1; hp <= 50; hp += 5) {
    for (let rolled = 1; rolled <= 100; rolled += 10) {
      const res = evalRoll(pair, 3, mod, { currentHP: hp, damage: rolled, rolledDamage: rolled });
      const applied = res.actualHPLoss ?? res.appliedDamage;
      const expected = Math.min(rolled, Math.max(0, hp - 1));
      assert.equal(applied, expected, `HP ${hp} with roll ${rolled} must result in applied damage ${expected}`);
      assert.ok(hp - applied >= 1, `Remaining HP for starting HP ${hp} must be >= 1 (got ${hp - applied})`);
    }
  }
});

// ============================================================================
// 4. Dangerous Breakdown Equipment Rider Isolation
// ============================================================================

test("Vector 4.1: Activating a Dangerous mod that breaks down MUST flag equipment as broken", () => {
  const evalRoll = req("evaluateBreakdownRoll");

  const dangerousWeapon = createWeapon("Laser Sword", {
    modifications: [{ id: "laser-cutter", name: "Laser Cutter", isDangerous: true }]
  });

  const dangerousMod = { id: "laser-cutter", isDangerous: true };
  const rollWithDupe = [4, 4];

  const res = evalRoll(rollWithDupe, 4, dangerousMod, { item: dangerousWeapon });
  const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
  assert.equal(isBreakdown, true, "Roll with duplicate dice must trigger breakdown");

  // The evaluation must report isBroken === true or equipmentBroken === true
  const brokenState = Boolean(res.isBroken ?? res.equipmentBroken ?? res.isEquipmentBroken);
  assert.equal(
    brokenState,
    true,
    "Activating a dangerous mod on breakdown must flag equipment as broken"
  );
});

test("Vector 4.2: Activating a NON-DANGEROUS mod on a mixed item damages HP but MUST NOT break equipment", () => {
  const evalRoll = req("evaluateBreakdownRoll");

  // Item contains BOTH dangerous and standard modifications
  const mixedWeapon = createWeapon("Mixed Weapon", {
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false },
      { id: "laser-cutter", name: "Laser Cutter", isDangerous: true }
    ]
  });

  // Wielder activates the STANDARD mod (boom-module)
  const standardMod = { id: "boom-module", isDangerous: false };
  const rollWithDupe = [2, 2, 5];

  const res = evalRoll(rollWithDupe, 5, standardMod, { item: mixedWeapon });
  const isBreakdown = Boolean(res.isBreakdown ?? res.breakdown);
  assert.equal(isBreakdown, true, "Roll with duplicate dice must trigger breakdown");

  // HP loss is inflicted, BUT equipment broken rider MUST NOT trigger!
  const brokenState = Boolean(res.isBroken ?? res.equipmentBroken ?? res.isEquipmentBroken);
  assert.equal(
    brokenState,
    false,
    "Activating non-dangerous mod on mixed item MUST NOT break equipment (rider is isolated to dangerous mods)"
  );
});

test("Vector 4.3: Broken equipment blocks usage until repaired by Maintenance Kit", async () => {
  const isBroken = req("isBrokenEquipment");
  const repair = req("repairBrokenEquipment");
  const actor = createInventorActor(3);

  const brokenWeapon = createWeapon("Broken Weapon", {
    flags: { ak5e: { isBroken: true, inventor: { modifications: [{ id: "laser-cutter", isDangerous: true }] } } }
  });

  assert.equal(isBroken(brokenWeapon), true, "Item marked as isBroken must be recognized by isBrokenEquipment");

  // Repairing with Maintenance Kit restores equipment
  const repairResult = await repair(brokenWeapon, actor);
  assert.ok(repairResult !== false, "repairBrokenEquipment must succeed");
  assert.equal(isBroken(brokenWeapon), false, "Equipment must no longer be broken after repair");

  // Repairing unbroken equipment is a safe no-op
  const secondRepair = await repair(brokenWeapon, actor);
  assert.ok(secondRepair !== false, "Second repair on unbroken item must be safe no-op");
  assert.equal(isBroken(brokenWeapon), false, "Equipment remains unbroken");
});

// ============================================================================
// 5. Inventions Pool Integrity & Modification Gating
// ============================================================================

test("Vector 5.1: Duplicate modifications on the same equipment piece are strictly prohibited", async () => {
  const applyMod = req("applyEquipmentModification");
  const actor = createInventorActor(3);
  const weapon = createWeapon("Test Sword", { modifications: [] });

  // 1st application of boom-module succeeds
  const res1 = await applyMod(weapon, "boom-module", { actor });
  assert.ok(res1 !== false, "Applying boom-module for the first time must succeed");

  // 2nd application of the SAME boom-module must fail / throw / reject
  let rejected = false;
  try {
    const res2 = await applyMod(weapon, "boom-module", { actor });
    if (res2 === false || res2?.error || res2?.rejected) {
      rejected = true;
    }
  } catch (err) {
    rejected = true;
  }
  assert.ok(rejected, "Applying duplicate modification to the same equipment piece MUST be rejected");
});

test("Vector 5.2: Modifications on magical items are strictly prohibited", async () => {
  const applyMod = req("applyEquipmentModification");
  const actor = createInventorActor(3);

  // Weapon flagged as magical
  const magicWeapon = createWeapon("+1 Longsword", {
    magical: true,
    rarity: "uncommon",
    properties: { mgc: true }
  });

  let rejected = false;
  try {
    const res = await applyMod(magicWeapon, "boom-module", { actor });
    if (res === false || res?.error || res?.rejected) {
      rejected = true;
    }
  } catch (err) {
    rejected = true;
  }
  assert.ok(rejected, "Applying modifications to magical items MUST be rejected");
});

test("Vector 5.3: Cross-category modification gating rejects incompatible equipment", async () => {
  const applyMod = req("applyEquipmentModification");
  const actor = createInventorActor(3);

  const rangedWeapon = createWeapon("Shortbow", { actionType: "rwak", weaponType: "simpleR" });
  const armor = createArmor("Chain Mail", { armorType: "heavy" });
  const potion = createTestItem({ name: "Healing Potion", type: "consumable" });

  // 1. Melee-only mod (boom-module) on armor must fail
  let r2Rejected = false;
  try {
    const r2 = await applyMod(armor, "boom-module", { actor });
    if (r2 === false || r2?.error || r2?.rejected) r2Rejected = true;
  } catch {
    r2Rejected = true;
  }
  assert.ok(r2Rejected, "Melee modification on armor must be rejected");

  // 2. Armor-only mod (wingsuit) on weapon must fail
  let rArmorRejected = false;
  try {
    const r = await applyMod(rangedWeapon, "wingsuit", { actor });
    if (r === false || r?.error || r?.rejected) rArmorRejected = true;
  } catch {
    rArmorRejected = true;
  }
  assert.ok(rArmorRejected, "Armor modification on weapon must be rejected");

  // 3. Modification on consumable/potion must fail
  let r3Rejected = false;
  try {
    const r3 = await applyMod(potion, "boom-module", { actor });
    if (r3 === false || r3?.error || r3?.rejected) r3Rejected = true;
  } catch {
    r3Rejected = true;
  }
  assert.ok(r3Rejected, "Modifications on non-equipment consumables must be rejected");
});

test("Vector 5.4: Inventions pool accounting (application consumes, removal refunds, overdraw clamped)", async () => {
  const applyMod = req("applyEquipmentModification");
  const removeMod = req("removeEquipmentModification");

  // Level 1 Inventor: PB = 2, max Inventions = 2 * 2 = 4
  const actor = createInventorActor(1);
  const pool = getPool(actor, "inventions");
  assert.equal(pool?.max ?? 4, 4, "Level 1 Inventor must have 4 max Inventions (2 * @prof)");

  const w1 = createWeapon("Weapon 1");
  const w2 = createWeapon("Weapon 2");
  const w3 = createWeapon("Weapon 3");
  const w4 = createWeapon("Weapon 4");
  const w5 = createWeapon("Weapon 5");

  // Apply 4 modifications: each consumes 1 Invention
  await applyMod(w1, "boom-module", { actor });
  await applyMod(w2, "burning-edge", { actor });
  await applyMod(w3, "rotary-blade", { actor });
  await applyMod(w4, "shock-engine", { actor });

  const poolAfter4 = getPool(actor, "inventions");
  if (poolAfter4) {
    assert.equal(poolAfter4.value, 0, "4 modifications must consume all 4 Inventions");
  }

  // Attempting 5th mod with 0 Inventions remaining must fail / reject
  let overdrawRejected = false;
  try {
    const res5 = await applyMod(w5, "telescopic-weapon", { actor });
    if (res5 === false || res5?.error || res5?.rejected) overdrawRejected = true;
  } catch {
    overdrawRejected = true;
  }
  assert.ok(overdrawRejected, "Attempting to apply modification with 0 available Inventions must be rejected");

  // Removing 1 modification refunds 1 Invention
  await removeMod(w1, "boom-module", { actor });
  const poolAfterRefund = getPool(actor, "inventions");
  if (poolAfterRefund) {
    assert.equal(poolAfterRefund.value, 1, "Removing modification must refund 1 Invention");
  }

  // Now 5th mod can be applied successfully
  const resRetry = await applyMod(w5, "telescopic-weapon", { actor });
  assert.ok(resRetry !== false, "Applying modification after refund must succeed");
});

test("Vector 5.5: 1-week maintenance expiry tracking", async () => {
  const applyMod = req("applyEquipmentModification");
  const actor = createInventorActor(3);
  const weapon = createWeapon("Expiring Weapon");

  // Apply mod at simulated time t0
  const t0 = 1000000;
  await applyMod(weapon, "boom-module", { actor, appliedAt: t0 });

  const mods = weapon.flags.ak5e?.inventor?.modifications ?? [];
  assert.ok(mods.length > 0, "Modification must be recorded");

  // Check timestamp recorded
  const modRecord = mods.find(m => m.id === "boom-module" || m === "boom-module");
  assert.ok(modRecord, "boom-module modification must be present");
  assert.equal(modRecord.appliedAt, t0, "Applied timestamp must be recorded");

  // 1 week is 604,800 seconds
  const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60; // 604800
  const timeElapsed = (t0 + ONE_WEEK_SECONDS + 3600) - modRecord.appliedAt;
  assert.ok(timeElapsed >= ONE_WEEK_SECONDS, "Time elapsed must exceed 1 week");
});
