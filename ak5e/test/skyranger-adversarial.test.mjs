/**
 * Comprehensive Adversarial Test Suite for AK5e Skyranger Specialist Subclass.
 * Stresses edge cases, boundary values, shortfall clamping, rules fidelity, and encounter-window undo reversibility:
 *  1. Flight Suit & Take Off Edge Cases (ADV-FS-*)
 *  2. Fuel Pool Boundary Values & Shortfall Clamping (ADV-FUEL-*)
 *  3. Strafe Damage Scaling & Calculations (ADV-STRAFE-*)
 *  4. Evasive Manoeuvres & Damage Halving Hooks (ADV-EM-*)
 *  5. Aerial Prowess Triggers (ADV-PROW-*)
 *  6. Skyscreamer Transformation Edge Cases (ADV-SKY-*)
 *  7. Full Encounter-Window Undo Reversibility (ADV-UNDO-*)
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isSkyranger,
  hasTakeFlight,
  hasAirDoctrineFeature,
  hasJink,
  hasAdvancedDoctrine,
  hasAfterburners,
  hasSkyscreamer,
  isFlightSuit,
  isWearingFlightSuit,
  canUseFlightSuitToFly,
  createFlightSuitItem,
  calculateFuelMax,
  defineSkyrangerPools,
  getFuel,
  getFuelMax,
  spendFuel,
  refundFuel,
  getStrafeDamageDiceCount,
  getStrafeDamageFormula,
  calculateStrafeDamage,
  isFlying,
  getFlyingSpeed,
  isTargetAerial,
  executeTakeOff,
  endFlight,
  selectAirDoctrine,
  getActiveAirDoctrines,
  hasAirDoctrine,
  getAirDoctrineFuelCost,
  executeAAMissile,
  executeBombingRun,
  executeSwoopingDive,
  isEvasiveManoeuvresActive,
  executeEvasiveManoeuvres,
  resolveEvasiveManoeuvresIncomingAttack,
  checkSkyrangerProwessGain,
  executeCrashAoE,
  executeAfterburnersAura,
  isSkyscreamerActive,
  createCoreCannonItem,
  createCoreSaberItem,
  activateSkyscreamer,
  deactivateSkyscreamer,
  undoSkyrangerAction,
  skyrangerPreApplyDamage,
  resetSkyrangerTurnTriggers,
  resetSkyrangerRestTriggers,
  registerSkyrangerHooks,
  AIR_DOCTRINES,
  AIR_DOCTRINE_NAMES,
  FUEL_PROGRESSION_TABLE,
  FLIGHT_SUIT_CONSTANTS,
  SKYRANGER_SUBCLASS_ID
} from "../scripts/skyranger-features.mjs";

import {
  SPECIALIST_CLASS_ID,
  isSpecialist,
  specialistLevel,
  specialistBranch,
  pbForLevel,
  martialDC,
  specialistDC,
  calculateSpecialistProfile
} from "../scripts/specialist-rules.mjs";

import { defineSpecialistPools, onSpecialistRest } from "../scripts/specialist-features.mjs";
import { specialistUses, SKYRANGER_PLANS, skyrangerCleanup, specialistCleanup } from "../scripts/specialist-uses.mjs";
import { getPool, getPoolDefinition, spendPool, refundPool, clearPoolRegistry, registerProwessPool, registerResourcePoolHooks } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem,
  triggerShortRest,
  triggerLongRest
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineSkyrangerPools();
  registerSkyrangerHooks();
  registerResourcePoolHooks();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function addItem(actor, item) {
  if (actor.items?.set) {
    actor.items.set(item.id || item._id, item);
  } else if (Array.isArray(actor.items)) {
    actor.items.push(item);
  }
  return item;
}

function createSkyrangerActor(level = 1, options = {}) {
  const sClass = createTestItem({
    id: "item_class_specialist",
    name: "Specialist",
    type: "class",
    system: {
      identifier: "specialist",
      levels: level
    },
    flags: {
      ak5e: {
        chapterThreeId: SPECIALIST_CLASS_ID
      }
    }
  });

  const sBranch = createTestItem({
    id: "item_subclass_skyranger",
    name: "Specialist: Skyranger",
    type: "subclass",
    system: {
      identifier: "skyranger"
    },
    flags: {
      ak5e: {
        chapterThreeId: SKYRANGER_SUBCLASS_ID
      }
    }
  });

  const actor = createTestActor({
    name: `Skyranger Lv${level}`,
    type: "character",
    system: {
      details: { level: options.characterLevel ?? level },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 16, mod: 3 },
        con: { value: 14, mod: 2 },
        int: { value: 14, mod: 2 },
        wis: { value: 12, mod: 1 },
        cha: { value: 10, mod: 0 }
      },
      attributes: {
        prof: pbForLevel(level),
        movement: { walk: options.walkSpeed ?? 30, fly: 0 },
        hp: { value: 40, max: 40, temp: 0 }
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "skyranger"
        }
      }
    }
  });

  addItem(actor, sClass);
  addItem(actor, sBranch);

  if (options.flightSuit) {
    const suit = createTestItem(createFlightSuitItem({
      id: "suit_item_1",
      system: { equipped: true }
    }));
    suit.equipped = true;
    addItem(actor, suit);
  }

  return actor;
}

/* ==========================================================================
   1. Flight Suit & Take Off Edge Cases (ADV-FS-*)
   ========================================================================== */

test("ADV-FS-01: Take Off without Flight Suit requires explicit override (direct function)", async () => {
  const actor = createSkyrangerActor(3); // No suit
  assert.equal(isWearingFlightSuit(actor), false);
  assert.equal(canUseFlightSuitToFly(actor), false);

  // Direct executeTakeOff without override throws
  await assert.rejects(async () => {
    await executeTakeOff(actor);
  }, /Take Off requires wearing your Flight Suit/);

  // Direct executeTakeOff with override succeeds, logs warning, and sets isFlying
  const result = await executeTakeOff(actor, { override: true });
  assert.equal(result.success, true);
  assert.ok(result.warnings.some(w => w.includes("not wearing a Flight Suit")));
  assert.equal(isFlying(actor), true);

  // Undo restores pre-activation state
  await undoSkyrangerAction(actor, result.receipt);
  assert.equal(isFlying(actor), false);
});

test("ADV-FS-02: Take Off without Flight Suit via table-play specialistUses throws warning, succeeds with override, logs card warning, and undos cleanly", async () => {
  const actor = createSkyrangerActor(5); // No suit, has fuel
  assert.equal(isWearingFlightSuit(actor), false);

  // specialistUses.plan throws warning if flightSuit is missing
  assert.throws(() => {
    specialistUses.plan(actor, "takeOff", {});
  }, err => {
    return err.warnings?.some(w => w.id === "flightSuit");
  }, "Plan throws flightSuit warning");

  // specialistUses.execute with override succeeds
  const opId = "adv-takeoff-no-suit";
  const executeRes = await specialistUses.execute(actor, "takeOff", { overrides: ["flightSuit"] }, opId);
  assert.ok(executeRes);
  assert.equal(isFlying(actor), true);

  const receipt = specialistUses.receipt(actor, opId);
  assert.ok(receipt.overridden?.some(o => o.includes("Flight Suit")), "Overridden warning logged in receipt");

  // specialistUses.undo restores flight state and refunds fuel
  const initialFuel = getFuel(actor);
  const undoRes = await specialistUses.undo(actor, opId);
  assert.equal(undoRes.undone, opId);
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), initialFuel + 1);
});

test("ADV-FS-03: Flight Suit item state changes: unequipped vs equipped, and multiple armors", () => {
  const actor = createSkyrangerActor(1);
  const suit = createTestItem(createFlightSuitItem({ id: "suit_item", system: { equipped: false } }));
  suit.equipped = false;
  addItem(actor, suit);

  // Unequipped suit -> isWearingFlightSuit is false
  assert.equal(isWearingFlightSuit(actor), false);
  assert.equal(canUseFlightSuitToFly(actor), false);

  // Equip suit -> isWearingFlightSuit is true
  suit.system.equipped = true;
  suit.equipped = true;
  assert.equal(isWearingFlightSuit(actor), true);
  assert.equal(canUseFlightSuitToFly(actor), true);

  // Add another equipment item (e.g. Shield) -> still wearing flight suit
  const shield = createTestItem({
    id: "shield_item",
    name: "Light Shield",
    type: "equipment",
    system: { equipped: true }
  });
  addItem(actor, shield);
  assert.equal(isWearingFlightSuit(actor), true);
  assert.equal(canUseFlightSuitToFly(actor), true);
});

test("ADV-FS-04: Non-skyrangers (Civilians, Fighters, other Specialist branches) cannot use Flight Suit to fly", async () => {
  // Non-specialist character wearing flight suit
  const civilian = createTestActor({ name: "Civilian", type: "character" });
  const suit = createTestItem(createFlightSuitItem({ id: "suit_civ", system: { equipped: true } }));
  suit.equipped = true;
  addItem(civilian, suit);

  assert.equal(isWearingFlightSuit(civilian), true);
  assert.equal(canUseFlightSuitToFly(civilian), false); // Cannot fly per Ch. 3 L6155

  // Other specialist branch (e.g. Executor) wearing flight suit
  const executor = createTestActor({
    name: "Executor",
    type: "character",
    flags: { ak5e: { specialist: { enabled: true, branch: "executor" } } }
  });
  const execSuit = createTestItem(createFlightSuitItem({ id: "suit_exec", system: { equipped: true } }));
  execSuit.equipped = true;
  addItem(executor, execSuit);

  assert.equal(isWearingFlightSuit(executor), true);
  assert.equal(canUseFlightSuitToFly(executor), false);
  assert.equal(isSkyranger(executor), false);

  // Specialist uses plan rejects non-skyranger
  assert.throws(() => {
    specialistUses.plan(executor, "takeOff", {});
  }, /Take Off is a Skyranger feature/);
});

test("ADV-FS-05: Flight duration, landing mechanics, and dynamic walk speed inheritance", async () => {
  // Fast actor (walk speed 45)
  const fastActor = createSkyrangerActor(3, { flightSuit: true, walkSpeed: 45 });
  const fastResult = await executeTakeOff(fastActor);
  assert.equal(fastResult.flyingSpeed, 45);
  assert.equal(fastResult.durationSeconds, 60);
  assert.equal(isFlying(fastActor), true);

  // Immobilized actor (walk speed 0)
  const slowActor = createSkyrangerActor(3, { flightSuit: true, walkSpeed: 0 });
  const slowResult = await executeTakeOff(slowActor);
  assert.equal(slowResult.flyingSpeed, 0);

  // Landing mechanics: endFlight explicitly lands
  await endFlight(fastActor);
  assert.equal(isFlying(fastActor), false);
});

test("ADV-FS-06: Take Off idempotency when already flying (undo preserves prior flying state)", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  // Initial take off
  const firstTakeOff = await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);
  assert.equal(getFuel(actor), 2);

  // Second take off while already flying
  const secondTakeOff = await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);
  assert.equal(getFuel(actor), 1);
  assert.equal(secondTakeOff.receipt.priorFlyingState, true);

  // Undo second take off: should restore prior flying state (true), not false!
  await undoSkyrangerAction(actor, secondTakeOff.receipt);
  assert.equal(isFlying(actor), true, "Undo second take off must preserve prior flying state");
  assert.equal(getFuel(actor), 2, "Fuel refunded on undo");

  // Undo first take off: now flying state returns to false
  await undoSkyrangerAction(actor, firstTakeOff.receipt);
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), 3);
});

/* ==========================================================================
   2. Fuel Pool Boundary Values & Shortfall Clamping (ADV-FUEL-*)
   ========================================================================== */

test("ADV-FUEL-01: Fuel pool boundary: spending with zero fuel requires override, clamps at 0 floor", async () => {
  const actor = createSkyrangerActor(1, { flightSuit: true });
  // Spend down to 0
  await spendFuel(actor, 2);
  assert.equal(getFuel(actor), 0);

  // Strict spend throws on shortfall
  await assert.rejects(async () => {
    await spendFuel(actor, 1, { strict: true });
  }, /Fuel shortfall/);

  // Permissive spend with override clamps at 0
  const spendOver = await spendFuel(actor, 2, { override: true });
  assert.equal(spendOver.spent, 0);
  assert.equal(spendOver.shortfall, 2);
  assert.equal(getFuel(actor), 0, "Fuel pool must clamp at 0 floor (never negative)");
});

test("ADV-FUEL-02: Table-play shortfall: specialistUses.plan throws warning shortfall, execute with override clamps at 0 and logs shortfall on receipt", async () => {
  const actor = createSkyrangerActor(1, { flightSuit: true });
  await spendFuel(actor, 2); // 0 fuel left
  assert.equal(getFuel(actor), 0);

  // Plan throws shortfall warning
  assert.throws(() => {
    specialistUses.plan(actor, "takeOff", {});
  }, err => {
    return err.warnings?.some(w => w.id === "shortfall");
  }, "Throws shortfall warning when Fuel is 0");

  // Execute with shortfall override succeeds and clamps at 0
  const opId = "adv-takeoff-shortfall";
  const execRes = await specialistUses.execute(actor, "takeOff", { overrides: ["shortfall"] }, opId);
  assert.ok(execRes);
  assert.equal(getFuel(actor), 0, "Fuel stays clamped at 0");

  const receipt = specialistUses.receipt(actor, opId);
  assert.ok(receipt.shortfalls?.some(s => s.includes("Fuel short by 1")), "Shortfall recorded in receipt");
  assert.ok(receipt.overridden?.some(o => o.includes("Fuel pool is empty")), "Warning recorded in receipt");
});

test("ADV-FUEL-03: Negative and zero fuel spend attempts", async () => {
  const actor = createSkyrangerActor(3, { flightSuit: true });
  assert.equal(getFuel(actor), 3);

  // Spend 0 fuel
  const spendZero = await spendFuel(actor, 0);
  assert.equal(spendZero.spent, 0);
  assert.equal(spendZero.shortfall, 0);
  assert.equal(getFuel(actor), 3);

  // Spend negative fuel
  const spendNeg = await spendFuel(actor, -3);
  assert.equal(spendNeg.spent, 0);
  assert.equal(spendNeg.shortfall, 0);
  assert.equal(getFuel(actor), 3);
});

test("ADV-FUEL-04: Rest restoration fidelity: Short Rest does NOT restore fuel (0 restored); Long Rest restores to max", async () => {
  const actor = createSkyrangerActor(8, { flightSuit: true });
  assert.equal(getFuelMax(actor), 4);
  assert.equal(getFuel(actor), 4);

  // Spend 3 Fuel -> 1 remaining
  await spendFuel(actor, 3);
  assert.equal(getFuel(actor), 1);

  // Short rest trigger -> Fuel must NOT recover (Fuel recovers on Long Rest only per Ch. 3 L6157)
  await triggerShortRest(actor);
  assert.equal(getFuel(actor), 1, "Short rest must NOT restore Fuel pool");

  // Long rest trigger -> Fuel must recover to max (4)
  await triggerLongRest(actor);
  assert.equal(getFuel(actor), 4, "Long rest must restore Fuel pool to max");
});

test("ADV-FUEL-05: Multiclass actor: Character Level 14 / Specialist Level 3 actor has Fuel max = 3, not 6", () => {
  // Multiclass: character level 14, specialist level 3
  const mcActor = createSkyrangerActor(3, { characterLevel: 14, flightSuit: true });
  assert.equal(specialistLevel(mcActor), 3);
  assert.equal(getFuelMax(mcActor), 3, "Fuel max must be based on Specialist level (3 -> 3), not Character level (14 -> 6)");
});

test("ADV-FUEL-06: Out-of-bounds level calculations", () => {
  assert.equal(calculateFuelMax(0), 2);
  assert.equal(calculateFuelMax(-10), 2);
  assert.equal(calculateFuelMax(25), 8);
  assert.equal(calculateFuelMax(100), 8);
});

test("ADV-FUEL-07: Refunding fuel does not exceed maximum capacity", async () => {
  const actor = createSkyrangerActor(3, { flightSuit: true });
  assert.equal(getFuelMax(actor), 3);
  assert.equal(getFuel(actor), 3);

  // Refund 5 fuel on full pool -> stays at max 3
  await refundFuel(actor, 5);
  assert.equal(getFuel(actor), 3);
});

/* ==========================================================================
   3. Strafe Damage Scaling & Calculations (ADV-STRAFE-*)
   ========================================================================== */

test("ADV-STRAFE-01: Complete 1–20 level progression table exact match", () => {
  const expectedProgression = [
    [1, 0, null],
    [2, 0, null],
    [3, 0, null],
    [4, 0, null],
    [5, 5, "5d8"],
    [6, 5, "5d8"],
    [7, 5, "5d8"],
    [8, 6, "6d8"],
    [9, 6, "6d8"],
    [10, 6, "6d8"],
    [11, 7, "7d8"],
    [12, 7, "7d8"],
    [13, 7, "7d8"],
    [14, 8, "8d8"],
    [15, 8, "8d8"],
    [16, 8, "8d8"],
    [17, 9, "9d8"],
    [18, 9, "9d8"],
    [19, 9, "9d8"],
    [20, 10, "10d8"]
  ];

  for (const [lvl, dice, formula] of expectedProgression) {
    assert.equal(getStrafeDamageDiceCount(lvl), dice, `Level ${lvl} dice count`);
    assert.equal(getStrafeDamageFormula(lvl), formula, `Level ${lvl} formula`);
  }
});

test("ADV-STRAFE-02: AA Missile maximized damage vs aerial targets across levels (5d8->40, 6d8->48, 7d8->56, 8d8->64, 9d8->72, 10d8->80)", () => {
  const levels = [
    [5, 40],
    [8, 48],
    [11, 56],
    [14, 64],
    [17, 72],
    [20, 80]
  ];

  for (const [lvl, expectedMax] of levels) {
    const strafe = calculateStrafeDamage(lvl, { maxDice: true });
    assert.equal(strafe.isMaximized, true);
    assert.equal(strafe.maxDamage, expectedMax, `Level ${lvl} maximized damage`);
    assert.equal(strafe.displayFormula, String(expectedMax));
  }
});

test("ADV-STRAFE-03: Aerial target detection conditions vs grounded target", () => {
  const grounded = createTestActor({ name: "Ground Trooper", type: "character" });
  assert.equal(isTargetAerial(grounded), false);

  // Elevation > 0
  const elevatedToken = { document: { elevation: 15 } };
  assert.equal(isTargetAerial(grounded, elevatedToken), true);

  // Statuses flying
  const flyingStatusTarget = createTestActor({
    name: "Flyer Status",
    type: "character",
    system: {}
  });
  flyingStatusTarget.statuses = new Set(["flying"]);
  assert.equal(isTargetAerial(flyingStatusTarget), true);

  // Flags isAerial or isFlying
  const flagTarget = createTestActor({
    name: "Flag Aerial",
    type: "character",
    flags: { ak5e: { isAerial: true } }
  });
  assert.equal(isTargetAerial(flagTarget), true);

  const notTouchingGroundTarget = createTestActor({
    name: "Hover Target",
    type: "character",
    flags: { ak5e: { notTouchingGround: true } }
  });
  assert.equal(isTargetAerial(notTouchingGroundTarget), true);
});

test("ADV-STRAFE-04: Advanced Doctrine Bombardment damage reduction (-3d8) for Firebomb and Gas Strike", () => {
  // Level 11 base is 7d8 -> reduced by 3d8 is 4d8
  const firebomb11 = calculateStrafeDamage(11, { reducedDice: 3, damageType: "fire" });
  assert.equal(firebomb11.diceCount, 4);
  assert.equal(firebomb11.formula, "4d8");
  assert.equal(firebomb11.damageType, "fire");

  const gasStrike11 = calculateStrafeDamage(11, { reducedDice: 3, damageType: "poison" });
  assert.equal(gasStrike11.diceCount, 4);
  assert.equal(gasStrike11.formula, "4d8");
  assert.equal(gasStrike11.damageType, "poison");

  // Level 20 base is 10d8 -> reduced by 3d8 is 7d8
  const firebomb20 = calculateStrafeDamage(20, { reducedDice: 3, damageType: "fire" });
  assert.equal(firebomb20.diceCount, 7);
  assert.equal(firebomb20.formula, "7d8");
});

test("ADV-STRAFE-05: Excessive damage reduction clamping (reducedDice > baseDice clamps at 0 dice)", () => {
  const overReduced = calculateStrafeDamage(5, { reducedDice: 10 });
  assert.equal(overReduced.diceCount, 0);
  assert.equal(overReduced.formula, "0");
  assert.equal(overReduced.maxDamage, 0);
});

test("ADV-STRAFE-06: Crash AoE half Strafe Damage (floor(baseDice / 2)) and 2x height distance boundary checks", async () => {
  const actor = createSkyrangerActor(11, { flightSuit: true });
  const aerialTarget = createTestActor({ name: "Hover Drone", type: "character" });

  // Target at 20 ft height -> max crash point distance is 40 ft (2x height)
  const validCrash = await executeCrashAoE(actor, aerialTarget, null, 20, { distance: 35 });
  assert.equal(validCrash.success, true);
  assert.equal(validCrash.maxDistance, 40);
  assert.equal(validCrash.radius, 10);
  // Strafe damage at Lv 11 is 7d8 -> half dice is 3d8
  assert.equal(validCrash.damage.diceCount, 3);
  assert.equal(validCrash.damage.formula, "3d8");

  // Exceeding 40 ft distance throws without override
  await assert.rejects(async () => {
    await executeCrashAoE(actor, aerialTarget, null, 20, { distance: 50 });
  }, /Crash point exceeds maximum distance/);
});

/* ==========================================================================
   4. Evasive Manoeuvres & Damage Halving Hooks (ADV-EM-*)
   ========================================================================== */

test("ADV-EM-01: Triggering Evasive Manoeuvres without Prowess: shortfall handling, clamping at 0, receipt warning", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await spendPool(actor, "prowess", getPool(actor, "prowess").value); // Empty prowess
  assert.equal(getPool(actor, "prowess").value, 0);

  // Throws without override
  await assert.rejects(async () => {
    await executeEvasiveManoeuvres(actor);
  }, /Evasive Manoeuvres requires 1 Prowess/);

  // With override succeeds, clamps at 0, reports shortfall
  const em = await executeEvasiveManoeuvres(actor, { override: true });
  assert.equal(em.success, true);
  assert.equal(em.spentProwess, 0);
  assert.equal(em.shortfall, 1);
  assert.equal(getPool(actor, "prowess").value, 0, "Prowess clamped at 0");
  assert.ok(em.warnings.some(w => w.includes("Prowess pool is empty")));

  // Table-play specialistUses.plan also throws shortfall warning
  assert.throws(() => {
    specialistUses.plan(actor, "evasiveManoeuvres", {});
  }, err => {
    return err.warnings?.some(w => w.id === "shortfall");
  });
});

test("ADV-EM-02: Triggering Evasive Manoeuvres without Flight Suit requires override", async () => {
  const actor = createSkyrangerActor(5); // No flight suit
  await refundPool(actor, "prowess", 1);

  await assert.rejects(async () => {
    await executeEvasiveManoeuvres(actor);
  }, /Evasive Manoeuvres requires wearing your Flight Suit/);

  const overridden = await executeEvasiveManoeuvres(actor, { override: true });
  assert.equal(overridden.success, true);
  assert.ok(overridden.warnings.some(w => w.includes("Flight Suit")));
});

test("ADV-EM-03: AC Bonus calculation strictly equals Proficiency Bonus across levels (3, 4, 5, 6)", async () => {
  const levels = [
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6]
  ];

  for (const [lvl, expectedPB] of levels) {
    const actor = createSkyrangerActor(lvl, { flightSuit: true });
    await refundPool(actor, "prowess", 1);
    const em = await executeEvasiveManoeuvres(actor);
    assert.equal(em.acBonus, expectedPB, `Level ${lvl} AC bonus`);
  }
});

test("ADV-EM-04: resolveEvasiveManoeuvresIncomingAttack comprehensive attack vs AC matrix", () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  const baseAC = 15;
  const pb = pbForLevel(5); // +3 -> AC with bonus is 18

  // 1. Attack roll < Base AC (13 vs 15): Already misses
  const resAlreadyMiss = resolveEvasiveManoeuvresIncomingAttack(actor, 13, baseAC, 20);
  assert.equal(resAlreadyMiss.hit, false);
  assert.equal(resAlreadyMiss.turnedToMiss, false);
  assert.equal(resAlreadyMiss.finalDamage, 0);

  // 2. Base AC <= Attack roll < Base AC + PB (15, 16, 17 vs 18): Turned into miss!
  for (const roll of [15, 16, 17]) {
    const resTurned = resolveEvasiveManoeuvresIncomingAttack(actor, roll, baseAC, 20);
    assert.equal(resTurned.hit, false, `Roll ${roll} should miss with +PB AC`);
    assert.equal(resTurned.turnedToMiss, true, `Roll ${roll} turned from hit into miss`);
    assert.equal(resTurned.finalDamage, 0);
  }

  // 3. Attack roll >= Base AC + PB (18, 19, 25 vs 18): Still hits despite AC bonus -> Damage HALVED!
  const resEvenHit = resolveEvasiveManoeuvresIncomingAttack(actor, 19, baseAC, 30);
  assert.equal(resEvenHit.hit, true);
  assert.equal(resEvenHit.turnedToMiss, false);
  assert.equal(resEvenHit.finalDamage, 15, "30 damage halved to 15");

  // Odd damage halving: floor(27 / 2) = 13
  const resOddHit = resolveEvasiveManoeuvresIncomingAttack(actor, 20, baseAC, 27);
  assert.equal(resOddHit.finalDamage, 13);

  // 1 damage: floor(1 / 2) = 0
  const resOneHit = resolveEvasiveManoeuvresIncomingAttack(actor, 20, baseAC, 1);
  assert.equal(resOneHit.finalDamage, 0);

  // 0 damage: 0
  const resZeroHit = resolveEvasiveManoeuvresIncomingAttack(actor, 20, baseAC, 0);
  assert.equal(resZeroHit.finalDamage, 0);
});

test("ADV-EM-05: skyrangerPreApplyDamage hook: halves first triggering attack, clears halveTriggeringDamage flag so subsequent attack takes full damage", () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  actor.flags.ak5e.skyranger = {
    evasiveManoeuvres: {
      active: true,
      acBonus: 3,
      halveTriggeringDamage: true
    }
  };
  actor.system.attributes.hp = { value: 50, temp: 0 };

  // First incoming attack: 20 damage (HP from 50 to 30)
  const updates1 = { "system.attributes.hp.value": 30 };
  skyrangerPreApplyDamage(actor, 20, updates1, {});

  // Halved to 10 damage -> HP updated to 40 instead of 30
  assert.equal(updates1["system.attributes.hp.value"], 40);
  // halveTriggeringDamage cleared
  assert.equal(actor.flags.ak5e.skyranger.evasiveManoeuvres.halveTriggeringDamage, false);

  // Apply update to actor HP
  actor.system.attributes.hp.value = 40;

  // Second incoming attack in the same round: 20 damage (HP from 40 to 20)
  const updates2 = { "system.attributes.hp.value": 20 };
  skyrangerPreApplyDamage(actor, 20, updates2, {});

  // Not halved! Takes full 20 damage -> HP remains 20
  assert.equal(updates2["system.attributes.hp.value"], 20, "Subsequent attack in same round must not be halved");
});

test("ADV-EM-06: Turn start resets and expires Evasive Manoeuvres AC boost", () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  actor.flags.ak5e.skyranger = {
    evasiveManoeuvres: {
      active: true,
      acBonus: 3,
      halveTriggeringDamage: false,
      expiresAt: "turnStart"
    }
  };
  assert.equal(isEvasiveManoeuvresActive(actor), true);

  // Turn start reset
  resetSkyrangerTurnTriggers(actor);
  assert.equal(isEvasiveManoeuvresActive(actor), false, "Evasive Manoeuvres must expire at turn start");
});

/* ==========================================================================
   5. Aerial Prowess Triggers (ADV-PROW-*)
   ========================================================================== */

test("ADV-PROW-01: 1/turn limitation: first kill grants prowess, second kill in same turn is rejected", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await spendPool(actor, "prowess", getPool(actor, "prowess").value); // 0 prowess
  await executeTakeOff(actor); // Skyranger flying

  const groundTarget1 = createTestActor({ name: "Ground Mob 1", type: "character" });
  const groundTarget2 = createTestActor({ name: "Ground Mob 2", type: "character" });

  // First kill: eligible -> gains 1 prowess
  const kill1 = await checkSkyrangerProwessGain(actor, groundTarget1, { damagedSinceLastTurn: true });
  assert.equal(kill1.eligible, true);
  assert.equal(getPool(actor, "prowess").value, 1);

  // Second kill in same turn: rejected by 1/turn limitation
  const kill2 = await checkSkyrangerProwessGain(actor, groundTarget2, { damagedSinceLastTurn: true });
  assert.equal(kill2.eligible, false);
  assert.equal(kill2.reason, "alreadyUsedThisTurn");
  assert.equal(getPool(actor, "prowess").value, 1);
});

test("ADV-PROW-02: Turn reset clears 1/turn tracker, allowing next kill to grant prowess", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await spendPool(actor, "prowess", getPool(actor, "prowess").value);
  await executeTakeOff(actor);

  const aerialTarget = createTestActor({
    name: "Drone",
    type: "character",
    flags: { ak5e: { isAerial: true } }
  });

  // Turn 1 kill
  await checkSkyrangerProwessGain(actor, aerialTarget, { damagedSinceLastTurn: true });
  assert.equal(getPool(actor, "prowess").value, 1);

  // Reset turn triggers
  resetSkyrangerTurnTriggers(actor);

  // Turn 2 kill -> succeeds
  const turn2Kill = await checkSkyrangerProwessGain(actor, aerialTarget, { damagedSinceLastTurn: true });
  assert.equal(turn2Kill.eligible, true);
  assert.equal(getPool(actor, "prowess").value, 2);
});

test("ADV-PROW-03: Complete trigger condition truth table", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await spendPool(actor, "prowess", getPool(actor, "prowess").value);

  const groundTarget = createTestActor({ name: "Ground Target", type: "character" });
  const aerialTarget = createTestActor({
    name: "Aerial Target",
    type: "character",
    flags: { ak5e: { isAerial: true } }
  });

  // Condition 1: Killer Ground + Target Ground -> NO
  resetSkyrangerTurnTriggers(actor);
  assert.equal(isFlying(actor), false);
  const c1 = await checkSkyrangerProwessGain(actor, groundTarget, { damagedSinceLastTurn: true });
  assert.equal(c1.eligible, false);

  // Condition 2: Killer Flying + Target Ground + damaged -> YES
  resetSkyrangerTurnTriggers(actor);
  await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);
  const c2 = await checkSkyrangerProwessGain(actor, groundTarget, { damagedSinceLastTurn: true });
  assert.equal(c2.eligible, true);
  assert.equal(c2.matchedTrigger, "flyingGroundTargetKilled");

  // Condition 3: Killer Ground + Target Aerial + damaged -> YES
  await endFlight(actor);
  resetSkyrangerTurnTriggers(actor);
  assert.equal(isFlying(actor), false);
  const c3 = await checkSkyrangerProwessGain(actor, aerialTarget, { damagedSinceLastTurn: true });
  assert.equal(c3.eligible, true);
  assert.equal(c3.matchedTrigger, "aerialTargetKilled");

  // Condition 4: Target NOT damaged since last turn -> NO
  resetSkyrangerTurnTriggers(actor);
  const c4 = await checkSkyrangerProwessGain(actor, aerialTarget, { damagedSinceLastTurn: false });
  assert.equal(c4.eligible, false);
  assert.equal(c4.reason, "notDamagedSinceLastTurn");
});

test("ADV-PROW-04: Undo reverts prowess gain and restores 1/turn tracker", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await spendPool(actor, "prowess", getPool(actor, "prowess").value);
  await executeTakeOff(actor);

  const target = createTestActor({ name: "Foe", type: "character" });
  const gain = await checkSkyrangerProwessGain(actor, target, { damagedSinceLastTurn: true });
  assert.equal(gain.eligible, true);
  assert.equal(getPool(actor, "prowess").value, 1);

  // Undo prowess gain
  await gain.undo();
  assert.equal(getPool(actor, "prowess").value, 0);

  // Should now be eligible again without waiting for turn reset
  const gainAgain = await checkSkyrangerProwessGain(actor, target, { damagedSinceLastTurn: true });
  assert.equal(gainAgain.eligible, true);
  assert.equal(getPool(actor, "prowess").value, 1);
});

/* ==========================================================================
   6. Skyscreamer Transformation Edge Cases (ADV-SKY-*)
   ========================================================================== */

test("ADV-SKY-01: Multirole: all 3 Air Doctrines active simultaneously in Combat Mode", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY);
  assert.deepEqual(getActiveAirDoctrines(actor), [AIR_DOCTRINES.AIR_SUPERIORITY]);

  // Activate Skyscreamer
  await activateSkyscreamer(actor);
  assert.equal(isSkyscreamerActive(actor), true);

  // Multirole: all 3 doctrines are active at once
  const doctrines = getActiveAirDoctrines(actor);
  assert.equal(doctrines.length, 3);
  assert.ok(hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY));
  assert.ok(hasAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT));
  assert.ok(hasAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT));
});

test("ADV-SKY-02: Free Fuel: Air Doctrine features cost 0 fuel in Combat Mode, even with 0 fuel in pool", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  await spendFuel(actor, getFuel(actor)); // 0 fuel in pool
  assert.equal(getFuel(actor), 0);

  // Activate Skyscreamer
  await activateSkyscreamer(actor);
  assert.equal(getAirDoctrineFuelCost(actor), 0);

  // AA Missile succeeds with 0 fuel and spentFuel = 0
  const missile = await executeAAMissile(actor, null, { distance: 50 });
  assert.equal(missile.success, true);
  assert.equal(missile.spentFuel, 0);
  assert.equal(getFuel(actor), 0);

  // Bombing Run succeeds with 0 fuel and spentFuel = 0
  const bombing = await executeBombingRun(actor, null, { distance: 20 });
  assert.equal(bombing.success, true);
  assert.equal(bombing.spentFuel, 0);

  // Swooping Dive succeeds with 0 fuel and spentFuel = 0
  const dive = await executeSwoopingDive(actor);
  assert.equal(dive.success, true);
  assert.equal(dive.spentFuel, 0);
});

test("ADV-SKY-03: Take Off costs 0 fuel in Combat Mode", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  await spendFuel(actor, getFuel(actor)); // 0 fuel
  await activateSkyscreamer(actor);

  const takeOff = await executeTakeOff(actor);
  assert.equal(takeOff.success, true);
  assert.equal(takeOff.spentFuel, 0);
  assert.equal(takeOff.freeFuel, true);
  assert.equal(isFlying(actor), true);
});

test("ADV-SKY-04: Core Cannon item data model, weapon category (Light Ranged), 3d8 Force, Range 100/300, Rapid Fire, Light", () => {
  const cannon = createCoreCannonItem();
  assert.equal(cannon.name, "Core Cannon");
  assert.equal(cannon.type, "weapon");
  assert.equal(cannon.system.weaponType, "rangedLight");
  assert.equal(cannon.system.damage.base.number, 3);
  assert.equal(cannon.system.damage.base.denomination, 8);
  assert.deepEqual(cannon.system.damage.base.types, ["force"]);
  assert.equal(cannon.system.range.value, 100);
  assert.equal(cannon.system.range.long, 300);
  assert.ok(cannon.system.properties.includes("rapidFire"));
  assert.ok(cannon.system.properties.includes("lgt"));
  assert.equal(cannon.system.weight.value, 0);
  assert.equal(cannon.system.price.value, 0);
  assert.equal(cannon.flags.ak5e.weaponCategory, "Light Ranged");
});

test("ADV-SKY-05: Core Saber item data model, weapon category (Light Melee), 3d8 Force, Deadly, Finesse, Reach, Light", () => {
  const saber = createCoreSaberItem();
  assert.equal(saber.name, "Core Saber");
  assert.equal(saber.type, "weapon");
  assert.equal(saber.system.weaponType, "meleeLight");
  assert.equal(saber.system.damage.base.number, 3);
  assert.equal(saber.system.damage.base.denomination, 8);
  assert.deepEqual(saber.system.damage.base.types, ["force"]);
  assert.ok(saber.system.properties.includes("deadly"));
  assert.ok(saber.system.properties.includes("fin"));
  assert.ok(saber.system.properties.includes("rch"));
  assert.ok(saber.system.properties.includes("lgt"));
  assert.equal(saber.system.weight.value, 0);
  assert.equal(saber.system.price.value, 0);
  assert.equal(saber.flags.ak5e.weaponCategory, "Light Melee");
});

test("ADV-SKY-06: 1/Long Rest limitation: second activation before Long Rest requires override and logs warning", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  await activateSkyscreamer(actor);

  // Second activation without rest throws
  await assert.rejects(async () => {
    await activateSkyscreamer(actor);
  }, /Skyscreamer is limited to once per Long Rest/);

  // With override succeeds, logs warning
  const second = await activateSkyscreamer(actor, { override: true });
  assert.equal(second.success, true);
  assert.ok(second.warnings.some(w => w.includes("already been used")));
});

test("ADV-SKY-07: Deactivation and Long Rest cleanup: restores single doctrine and restores 1 fuel cost", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT);
  await activateSkyscreamer(actor);
  assert.equal(isSkyscreamerActive(actor), true);

  // Long rest cleanup
  resetSkyrangerRestTriggers(actor, true);
  assert.equal(isSkyscreamerActive(actor), false);
  assert.equal(getAirDoctrineFuelCost(actor), 1);
  assert.deepEqual(getActiveAirDoctrines(actor), [AIR_DOCTRINES.BOMBARDMENT]);
});

/* ==========================================================================
   7. Full Encounter-Window Undo Reversibility (ADV-UNDO-*)
   ========================================================================== */

test("ADV-UNDO-01: Reverting Take Off restores prior fuel and prior flying state", async () => {
  const actor = createSkyrangerActor(3, { flightSuit: true });
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), 3);

  const takeOff = await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);
  assert.equal(getFuel(actor), 2);

  await undoSkyrangerAction(actor, takeOff.receipt);
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), 3);
});

test("ADV-UNDO-02: Reverting selectDoctrine restores prior doctrine", async () => {
  const actor = createSkyrangerActor(5);
  selectAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY);
  assert.deepEqual(getActiveAirDoctrines(actor), [AIR_DOCTRINES.AIR_SUPERIORITY]);

  const switchDoctrine = selectAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT);
  assert.deepEqual(getActiveAirDoctrines(actor), [AIR_DOCTRINES.CLOSE_AIR_SUPPORT]);

  await switchDoctrine.undo();
  assert.deepEqual(getActiveAirDoctrines(actor), [AIR_DOCTRINES.AIR_SUPERIORITY]);
});

test("ADV-UNDO-03: Reverting AA Missile refunds spent fuel", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY);
  assert.equal(getFuel(actor), 3);

  const missile = await executeAAMissile(actor, null, { distance: 50 });
  assert.equal(getFuel(actor), 2);

  await undoSkyrangerAction(actor, missile.receipt);
  assert.equal(getFuel(actor), 3);
});

test("ADV-UNDO-04: Reverting Bombing Run refunds spent fuel", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT);
  assert.equal(getFuel(actor), 3);

  const bombing = await executeBombingRun(actor, null, { distance: 20 });
  assert.equal(getFuel(actor), 2);

  await undoSkyrangerAction(actor, bombing.receipt);
  assert.equal(getFuel(actor), 3);
});

test("ADV-UNDO-05: Reverting Swooping Dive refunds fuel and restores prior hit tracking", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT);
  const target = createTestActor({ name: "Foe", type: "character" });

  const dive = await executeSwoopingDive(actor, target);
  assert.equal(getFuel(actor), 2);

  await undoSkyrangerAction(actor, dive.receipt);
  assert.equal(getFuel(actor), 3);
});

test("ADV-UNDO-06: Reverting Evasive Manoeuvres refunds prowess and clears active EM", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await refundPool(actor, "prowess", 2);
  assert.equal(getPool(actor, "prowess").value, 2);

  const em = await executeEvasiveManoeuvres(actor);
  assert.equal(getPool(actor, "prowess").value, 1);
  assert.equal(isEvasiveManoeuvresActive(actor), true);

  await undoSkyrangerAction(actor, em.receipt);
  assert.equal(getPool(actor, "prowess").value, 2);
  assert.equal(isEvasiveManoeuvresActive(actor), false);
});

test("ADV-UNDO-07: Reverting Afterburners Aura clears usedThisTurn flag", async () => {
  const actor = createSkyrangerActor(15, { flightSuit: true });
  await refundPool(actor, "prowess", 1);
  await executeEvasiveManoeuvres(actor);

  const target = createTestActor({ name: "Enemy", type: "character" });
  const aura = await executeAfterburnersAura(actor, target);
  assert.equal(actor.flags.ak5e.skyranger.afterburnersUsedThisTurn, true);

  await undoSkyrangerAction(actor, aura.receipt);
  assert.equal(actor.flags.ak5e.skyranger.afterburnersUsedThisTurn, false);
});

test("ADV-UNDO-08: Reverting Skyscreamer deactivates combat mode and refunds use", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  const combatMode = await activateSkyscreamer(actor);
  assert.equal(isSkyscreamerActive(actor), true);

  await undoSkyrangerAction(actor, combatMode.receipt);
  assert.equal(isSkyscreamerActive(actor), false);
});

test("ADV-UNDO-09: Multi-step table-play sequence: execute takeOff, aaMissile, evasiveManoeuvres, activateSkyscreamer via specialistUses.execute, then undo all via specialistUses.undo", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  await refundPool(actor, "prowess", 3);
  selectAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY);

  const initialFuel = getFuel(actor);
  const initialProwess = getPool(actor, "prowess").value;

  // Step 1: Take Off
  const opTakeOff = "adv-plan-takeoff-1";
  await specialistUses.execute(actor, "takeOff", {}, opTakeOff);
  assert.equal(isFlying(actor), true);
  assert.equal(getFuel(actor), initialFuel - 1);

  // Step 2: AA Missile
  const target = createTestActor({ name: "Drone", type: "character" });
  const opMissile = "adv-plan-missile-1";
  await specialistUses.execute(actor, "aaMissile", { targetUuid: target.uuid }, opMissile);
  assert.equal(getFuel(actor), initialFuel - 2);

  // Step 3: Evasive Manoeuvres
  const opEM = "adv-plan-em-1";
  await specialistUses.execute(actor, "evasiveManoeuvres", {}, opEM);
  assert.equal(getPool(actor, "prowess").value, initialProwess - 1);
  assert.equal(actor.flags.ak5e.skyranger.evasiveManoeuvres, true);

  // Step 4: Activate Skyscreamer
  const opSky = "adv-plan-sky-1";
  await specialistUses.execute(actor, "activateSkyscreamer", {}, opSky);
  assert.equal(isSkyscreamerActive(actor), true);

  // Undo in reverse order:
  // Undo Skyscreamer
  const undoSky = await specialistUses.undo(actor, opSky);
  assert.equal(undoSky.undone, opSky);
  assert.equal(isSkyscreamerActive(actor), false);

  // Undo Evasive Manoeuvres
  const undoEM = await specialistUses.undo(actor, opEM);
  assert.equal(undoEM.undone, opEM);
  assert.equal(getPool(actor, "prowess").value, initialProwess);
  assert.equal(actor.flags.ak5e.skyranger.evasiveManoeuvres, false);

  // Undo AA Missile
  const undoMissile = await specialistUses.undo(actor, opMissile);
  assert.equal(undoMissile.undone, opMissile);
  assert.equal(getFuel(actor), initialFuel - 1);

  // Undo Take Off
  const undoTakeOff = await specialistUses.undo(actor, opTakeOff);
  assert.equal(undoTakeOff.undone, opTakeOff);
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), initialFuel);

  // Repeated undo is idempotent
  const repeatUndo = await specialistUses.undo(actor, opTakeOff);
  assert.equal(repeatUndo.already, true);
});
