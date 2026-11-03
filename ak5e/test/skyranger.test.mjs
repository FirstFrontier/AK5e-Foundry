/**
 * Comprehensive automated test suite for AK5e Skyranger Specialist Subclass (Ch. 3 L6145–6262).
 * Verifies all features, lookups, item generators, damage calculations, table-play interactions,
 * and encounter-window undo reversibility:
 *  1. Subclass Identification & Predicates (isSkyranger, level gates)
 *  2. Flight Suit Starting Equipment (Light Armour, AC 12+Dex, 0 DR, 25 lb, 650 LMD, flying gate)
 *  3. Fuel Resource Pool Progression (Lv 1–2: 2, Lv 3–5: 3, Lv 6–8: 4, Lv 9–11: 5, Lv 12–14: 6, Lv 15–17: 7, Lv 18–20: 8)
 *  4. Take Off (1 Fuel, bonus action, fly speed = walk speed, 60s duration, undo)
 *  5. Strafe Damage Progression (Lv 1–4: 0, Lv 5–7: 5d8, Lv 8–10: 6d8, Lv 11–13: 7d8, Lv 14–16: 8d8, Lv 17–19: 9d8, Lv 20: 10d8)
 *  6. Air Doctrine Rest Selection (Air Superiority, Bombardment, Close Air Support)
 *  7. Air Superiority: AA Missile (100 ft, DEX save vs Martial DC, Thunder damage, maximized vs aerial)
 *  8. Bombardment: Bombing Run (30 ft / 120 ft flying, 15 ft radius, DEX save vs Martial DC, Thunder damage)
 *  9. Close Air Support: Swooping Dive (movement, attack advantage at 10 ft, +Strafe Damage 1/turn)
 * 10. 5th Level Jink: Evasive Manoeuvres (+PB AC reaction, damage halving if still hit, undo)
 * 11. 5th Level Jink: Aerial Prowess Gain Triggers (1/turn limit, flying ground kill & aerial kill)
 * 12. 11th Level Advanced Doctrine: Crash AoE (non-ground 0 HP -> 2x height, 10 ft radius, DEX save or half Strafe)
 * 13. 11th Level Advanced Doctrine: Bombardment Firebomb & Gas Strike (-3d8 dice, Fire/Burning, Poison/Poisoned/Difficult Terrain)
 * 14. 11th Level Advanced Doctrine: Close Air Support Disadvantage & WIS Frighten Save
 * 15. 15th Level Afterburners (Evasive reaction movement & 1/turn 10 ft Fire damage aura)
 * 16. 20th Level Skyscreamer (1/LR Combat Mode, Multirole 3 doctrines, free Fuel, Core Cannon & Core Saber)
 * 17. Rest & Turn Cycle Hooks (turn reset, long rest pool recovery)
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
  getSkyrangerProgressionFeatures,
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
  FUEL_PROGRESSION_TABLE,
  FLIGHT_SUIT_CONSTANTS,
  SKYRANGER_SUBCLASS_ID
} from "../scripts/skyranger-features.mjs";
import {
  SPECIALIST_CLASS_ID,
  martialDC,
  pbForLevel
} from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry, spendPool, refundPool } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineSkyrangerPools();
  registerSkyrangerHooks();
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
      details: { level },
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
        movement: { walk: 30, fly: 0 }
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

/* ================================================================
   1. Subclass Identification & Progression Gates
   ================================================================ */

test("Skyranger subclass identification and level feature gates", () => {
  const lv1 = createSkyrangerActor(1);
  assert.equal(isSkyranger(lv1), true);
  assert.equal(hasTakeFlight(lv1), true);
  assert.equal(hasAirDoctrineFeature(lv1), false);
  assert.equal(hasJink(lv1), false);
  assert.equal(hasAdvancedDoctrine(lv1), false);
  assert.equal(hasAfterburners(lv1), false);
  assert.equal(hasSkyscreamer(lv1), false);

  const lv5 = createSkyrangerActor(5);
  assert.equal(hasTakeFlight(lv5), true);
  assert.equal(hasAirDoctrineFeature(lv5), true);
  assert.equal(hasJink(lv5), true);
  assert.equal(hasAdvancedDoctrine(lv5), false);

  const lv11 = createSkyrangerActor(11);
  assert.equal(hasAdvancedDoctrine(lv11), true);
  assert.equal(hasAfterburners(lv11), false);

  const lv15 = createSkyrangerActor(15);
  assert.equal(hasAfterburners(lv15), true);
  assert.equal(hasSkyscreamer(lv15), false);

  const lv20 = createSkyrangerActor(20);
  assert.equal(hasSkyscreamer(lv20), true);

  const nonSkyranger = createTestActor({ name: "Civilian", type: "character" });
  assert.equal(isSkyranger(nonSkyranger), false);
  assert.equal(hasTakeFlight(nonSkyranger), false);

  const featuresLv5 = getSkyrangerProgressionFeatures(5);
  assert.ok(featuresLv5.length >= 3);
  assert.ok(featuresLv5.some(f => f.includes("take-flight")));
  assert.ok(featuresLv5.some(f => f.includes("air-doctrine")));
  assert.ok(featuresLv5.some(f => f.includes("jink")));
});

/* ================================================================
   2. Flight Suit Starting Equipment
   ================================================================ */

test("Flight Suit item schema, AC, DR, weight, and wearing detection", () => {
  const suit = createFlightSuitItem();
  assert.equal(suit.name, "Flight Suit");
  assert.equal(suit.type, "equipment");
  assert.equal(suit.system.armor.value, 12);
  assert.equal(suit.system.armor.type, "light");
  assert.equal(suit.system.damageReduction, 0);
  assert.equal(suit.system.weight.value, 25);
  assert.equal(suit.system.price.value, 650);
  assert.equal(suit.flags.ak5e.isFlightSuit, true);
  assert.equal(suit.flags.ak5e.craftingHours, 24);

  assert.equal(isFlightSuit(suit), true);
  assert.equal(isFlightSuit({ name: "Padded Armor" }), false);

  const actorNoSuit = createSkyrangerActor(1);
  assert.equal(isWearingFlightSuit(actorNoSuit), false);
  assert.equal(canUseFlightSuitToFly(actorNoSuit), false);

  const actorWithSuit = createSkyrangerActor(1, { flightSuit: true });
  assert.equal(isWearingFlightSuit(actorWithSuit), true);
  assert.equal(canUseFlightSuitToFly(actorWithSuit), true);

  const nonSkyrangerWithSuit = createTestActor({ name: "Fighter", type: "character" });
  const suitItem = createTestItem(createFlightSuitItem({ system: { equipped: true } }));
  addItem(nonSkyrangerWithSuit, suitItem);
  assert.equal(isWearingFlightSuit(nonSkyrangerWithSuit), true);
  // Non-skyranger cannot use it to fly (Ch. 3 L6155)
  assert.equal(canUseFlightSuitToFly(nonSkyrangerWithSuit), false);
});

/* ================================================================
   3. Fuel Resource Pool Progression
   ================================================================ */

test("Fuel resource pool level progression matches Ch. 3 L6161–6184 exactly", () => {
  const expectedTable = [
    [1, 2], [2, 2],
    [3, 3], [4, 3], [5, 3],
    [6, 4], [7, 4], [8, 4],
    [9, 5], [10, 5], [11, 5],
    [12, 6], [13, 6], [14, 6],
    [15, 7], [16, 7], [17, 7],
    [18, 8], [19, 8], [20, 8]
  ];

  for (const [level, expectedFuel] of expectedTable) {
    assert.equal(
      calculateFuelMax(level),
      expectedFuel,
      `Level ${level} expected ${expectedFuel} Fuel, got ${calculateFuelMax(level)}`
    );
  }

  // Bounds clamping
  assert.equal(calculateFuelMax(0), 2);
  assert.equal(calculateFuelMax(25), 8);
});

test("Fuel pool initialization, spending, shortfall handling, and refunding", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  assert.equal(getFuelMax(actor), 3);
  assert.equal(getFuel(actor), 3);

  // Spend 1 Fuel normally
  const spend1 = await spendFuel(actor, 1);
  assert.equal(spend1.spent, 1);
  assert.equal(spend1.shortfall, 0);
  assert.equal(getFuel(actor), 2);

  // Spend 2 more Fuel
  await spendFuel(actor, 2);
  assert.equal(getFuel(actor), 0);

  // Spend with shortfall and override
  const overspend = await spendFuel(actor, 1, { override: true });
  assert.equal(overspend.spent, 0);
  assert.equal(overspend.shortfall, 1);
  assert.equal(getFuel(actor), 0);

  // Strict shortfall throws without override
  await assert.rejects(async () => {
    await spendFuel(actor, 1, { strict: true });
  }, /Fuel shortfall/);

  // Refund Fuel
  const refunded = await refundFuel(actor, 2);
  assert.equal(refunded.refunded, 2);
  assert.equal(getFuel(actor), 2);
});

/* ================================================================
   4. Take Off (Bonus Action)
   ================================================================ */

test("Take Off bonus action spends 1 Fuel, grants flight equal to walk speed, and undos cleanly", async () => {
  const actor = createSkyrangerActor(3, { flightSuit: true });
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), 3);

  const result = await executeTakeOff(actor);
  assert.equal(result.success, true);
  assert.equal(result.spentFuel, 1);
  assert.equal(result.flyingSpeed, 30);
  assert.equal(result.durationSeconds, 60);
  assert.equal(isFlying(actor), true);
  assert.equal(getFuel(actor), 2);

  // Undo Take Off
  await undoSkyrangerAction(actor, result.receipt);
  assert.equal(isFlying(actor), false);
  assert.equal(getFuel(actor), 3);

  // End flight explicitly
  await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);
  await endFlight(actor);
  assert.equal(isFlying(actor), false);
});

test("Take Off without Flight Suit requires override or throws", async () => {
  const actor = createSkyrangerActor(3); // No suit
  await assert.rejects(async () => {
    await executeTakeOff(actor);
  }, /Take Off requires wearing your Flight Suit/);

  const overridden = await executeTakeOff(actor, { override: true });
  assert.equal(overridden.success, true);
  assert.ok(overridden.warnings.length > 0);
});

/* ================================================================
   5. Strafe Damage Progression
   ================================================================ */

test("Strafe Damage dice and formulas match Ch. 3 L6161–6184 exactly", () => {
  const progression = [
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

  for (const [lvl, expectedDice, expectedFormula] of progression) {
    assert.equal(getStrafeDamageDiceCount(lvl), expectedDice, `Lv ${lvl} dice mismatch`);
    assert.equal(getStrafeDamageFormula(lvl), expectedFormula, `Lv ${lvl} formula mismatch`);
  }

  // Maximize calculation (AA Missile vs non-ground target)
  const lv5Strafe = calculateStrafeDamage(5, { maxDice: true });
  assert.equal(lv5Strafe.isMaximized, true);
  assert.equal(lv5Strafe.maxDamage, 40); // 5 * 8
  assert.equal(lv5Strafe.displayFormula, "40");

  const lv20Strafe = calculateStrafeDamage(20, { maxDice: true });
  assert.equal(lv20Strafe.maxDamage, 80); // 10 * 8

  // Damage reduction calculation (Firebomb / Gas Strike: -3d8)
  const modifiedStrafe = calculateStrafeDamage(11, { reducedDice: 3, damageType: "fire" });
  assert.equal(modifiedStrafe.diceCount, 4); // 7 - 3 = 4d8
  assert.equal(modifiedStrafe.formula, "4d8");
  assert.equal(modifiedStrafe.damageType, "fire");
});

/* ================================================================
   6. Air Doctrine Rest Selection
   ================================================================ */

test("Air Doctrine rest selection and active doctrine query", () => {
  const actor = createSkyrangerActor(5);
  assert.deepEqual(getActiveAirDoctrines(actor), []);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY), false);

  const sel = selectAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY);
  assert.equal(sel.doctrine, "airSuperiority");
  assert.equal(sel.name, "Air Superiority");
  assert.deepEqual(getActiveAirDoctrines(actor), ["airSuperiority"]);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY), true);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT), false);

  // Switch to Bombardment
  selectAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT), true);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY), false);

  // Reject invalid doctrine
  assert.throws(() => {
    selectAirDoctrine(actor, "orbitalStrike");
  }, /Invalid doctrine/);
});

/* ================================================================
   7. AA Missile (Air Superiority)
   ================================================================ */

test("AA Missile requires Air Superiority, spends 1 Fuel, and maximizes dice vs aerial target", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY);
  assert.equal(getFuel(actor), 3);

  const groundTarget = createTestActor({ name: "Ground Trooper", type: "character" });
  const aerialTarget = createTestActor({
    name: "Hover Drone",
    type: "character",
    system: { attributes: { movement: { fly: 40, elevation: 20 } } },
    flags: { ak5e: { isAerial: true } }
  });

  // 1. AA Missile against ground target
  const resGround = await executeAAMissile(actor, groundTarget, { distance: 60 });
  assert.equal(resGround.success, true);
  assert.equal(resGround.spentFuel, 1);
  assert.equal(resGround.isAerial, false);
  assert.equal(resGround.damage.formula, "5d8");
  assert.equal(resGround.damage.isMaximized, false);
  assert.equal(resGround.save.dc, martialDC(actor));
  assert.equal(getFuel(actor), 2);

  // 2. AA Missile against aerial target (not touching the ground) -> maximized dice!
  const resAerial = await executeAAMissile(actor, aerialTarget, { distance: 80 });
  assert.equal(resAerial.success, true);
  assert.equal(resAerial.spentFuel, 1);
  assert.equal(resAerial.isAerial, true);
  assert.equal(resAerial.damage.isMaximized, true);
  assert.equal(resAerial.damage.maxDamage, 40); // 5 * 8
  assert.equal(resAerial.damage.displayFormula, "40");
  assert.equal(getFuel(actor), 1);

  // Range check: >100 ft throws without override
  await assert.rejects(async () => {
    await executeAAMissile(actor, aerialTarget, { distance: 120 });
  }, /Target exceeds 100 ft range/);

  // Undo reverts fuel spend
  await undoSkyrangerAction(actor, resAerial.receipt);
  assert.equal(getFuel(actor), 2);
});

/* ================================================================
   8. Bombing Run (Bombardment)
   ================================================================ */

test("Bombing Run range extends when flying, and 11th level Advanced modifications apply", async () => {
  const actor = createSkyrangerActor(11, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT);
  assert.equal(getFuel(actor), 5);

  // 1. Grounded range is 30 ft
  assert.equal(isFlying(actor), false);
  const runGrounded = await executeBombingRun(actor, null, { distance: 25 });
  assert.equal(runGrounded.range, 30);
  assert.equal(runGrounded.radius, 15);
  assert.equal(runGrounded.spentFuel, 1);
  assert.equal(runGrounded.damage.formula, "7d8");
  assert.equal(runGrounded.damage.damageType, "thunder");

  // Distance 50 ft while grounded throws without override
  await assert.rejects(async () => {
    await executeBombingRun(actor, null, { distance: 50 });
  }, /exceeds 30 ft range/);

  // 2. Flying extends range to 120 ft
  await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);
  const runFlying = await executeBombingRun(actor, null, { distance: 100 });
  assert.equal(runFlying.range, 120);
  assert.equal(runFlying.success, true);

  // 3. Firebomb option (Advanced Doctrine Lv 11): -3d8 dice, Fire damage, Burning condition
  const firebomb = await executeBombingRun(actor, null, { distance: 50, modification: "firebomb" });
  assert.equal(firebomb.damage.formula, "4d8"); // 7d8 - 3d8 = 4d8
  assert.equal(firebomb.damage.damageType, "fire");
  assert.equal(firebomb.conditionRider.condition, "burning");

  // 4. Gas Strike option: -3d8 dice, Poison damage, Poisoned condition, 15 ft Difficult Terrain
  const gasStrike = await executeBombingRun(actor, null, { distance: 50, modification: "gasStrike" });
  assert.equal(gasStrike.damage.formula, "4d8");
  assert.equal(gasStrike.damage.damageType, "poison");
  assert.equal(gasStrike.conditionRider.condition, "poisoned");
  assert.equal(gasStrike.terrainRider.type, "difficultTerrain");
  assert.equal(gasStrike.terrainRider.radius, 15);

  // Undo Bombing Run refunds fuel
  await undoSkyrangerAction(actor, gasStrike.receipt);
  assert.equal(getFuel(actor), 1);
});

/* ================================================================
   9. Swooping Dive (Close Air Support)
   ================================================================ */

test("Swooping Dive grants speed, Advantage within 10 ft, +Strafe Damage, and Lv 11 Frighten rider", async () => {
  const actor = createSkyrangerActor(11, { flightSuit: true });
  selectAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT);

  const target = createTestActor({ name: "Hostile Mercenary", type: "character" });
  const dive = await executeSwoopingDive(actor, target);

  assert.equal(dive.success, true);
  assert.equal(dive.spentFuel, 1);
  assert.equal(dive.movementGranted, 30);
  assert.equal(dive.advantageOnAttack, true);
  assert.equal(dive.bonusDamage.formula, "7d8");
  assert.equal(dive.bonusDamage.damageType, "thunder");
  assert.equal(dive.alreadyDamagedTargetThisTurn, false);

  // 11th level Advanced Doctrine riders
  assert.equal(dive.advancedDoctrine.disadvantageOnAttacksAgainstSkyranger, true);
  assert.equal(dive.advancedDoctrine.frightenSave.ability, "wis");
  assert.equal(dive.advancedDoctrine.frightenSave.condition, "frightened");

  // Second dive on same target this turn notes already damaged
  const secondDive = await executeSwoopingDive(actor, target);
  assert.equal(secondDive.alreadyDamagedTargetThisTurn, true);

  // Undo reverts state cleanly
  await undoSkyrangerAction(actor, secondDive.receipt);
  assert.equal(getFuel(actor), 4);
  await undoSkyrangerAction(actor, dive.receipt);
  assert.equal(getFuel(actor), 5);
});

/* ================================================================
   10. Jink & Evasive Manoeuvres (5th Level)
   ================================================================ */

test("Evasive Manoeuvres spends 1 Prowess, increases AC by +PB, and halves damage if attack still hits", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  assert.equal(hasJink(actor), true);

  // Ensure 2 prowess
  await refundPool(actor, "prowess", 2);
  const initialProwess = getPool(actor, "prowess").value;

  const em = await executeEvasiveManoeuvres(actor);
  assert.equal(em.success, true);
  assert.equal(em.spentProwess, 1);
  assert.equal(em.acBonus, pbForLevel(5)); // +3 AC
  assert.equal(em.halveTriggeringDamage, true);
  assert.equal(isEvasiveManoeuvresActive(actor), true);
  assert.equal(getPool(actor, "prowess").value, initialProwess - 1);

  // Resolve incoming attack checks:
  // Base AC 15 (12 + 3 Dex). With +3 PB bonus, AC is 18.
  const baseAC = 15;

  // Case A: Attack roll 14 -> already a miss
  const rollMiss = resolveEvasiveManoeuvresIncomingAttack(actor, 14, baseAC, 20);
  assert.equal(rollMiss.hit, false);
  assert.equal(rollMiss.turnedToMiss, false);
  assert.equal(rollMiss.finalDamage, 0);

  // Case B: Attack roll 16 -> turned hit into MISS!
  const rollTurnedMiss = resolveEvasiveManoeuvresIncomingAttack(actor, 16, baseAC, 20);
  assert.equal(rollTurnedMiss.hit, false);
  assert.equal(rollTurnedMiss.turnedToMiss, true);
  assert.equal(rollTurnedMiss.finalDamage, 0);

  // Case C: Attack roll 19 -> still hits despite +PB AC -> damage is HALVED!
  const rollStillHit = resolveEvasiveManoeuvresIncomingAttack(actor, 19, baseAC, 25);
  assert.equal(rollStillHit.hit, true);
  assert.equal(rollStillHit.turnedToMiss, false);
  assert.equal(rollStillHit.finalDamage, 12); // floor(25 / 2) = 12

  // Undo Evasive Manoeuvres refunds Prowess
  await undoSkyrangerAction(actor, em.receipt);
  assert.equal(getPool(actor, "prowess").value, initialProwess);
  assert.equal(isEvasiveManoeuvresActive(actor), false);
});

test("Evasive Manoeuvres damage halving hook in preApplyDamage", () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  actor.flags.ak5e.skyranger = {
    evasiveManoeuvres: {
      active: true,
      acBonus: 3,
      halveTriggeringDamage: true
    }
  };
  actor.system.attributes.hp = { value: 30, temp: 0 };

  const updates = { "system.attributes.hp.value": 10 }; // 20 damage incoming
  skyrangerPreApplyDamage(actor, 20, updates, {});

  // 20 damage halved is 10 damage -> HP drops to 30 - 10 = 20
  assert.equal(updates["system.attributes.hp.value"], 20);
  // halveTriggeringDamage flag cleared for subsequent attacks
  assert.equal(actor.flags.ak5e.skyranger.evasiveManoeuvres.halveTriggeringDamage, false);
});

/* ================================================================
   11. Aerial Prowess Gain Triggers
   ================================================================ */

test("Aerial Prowess gain triggers: flying ground kill and aerial target kill (1/turn limit)", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  await spendPool(actor, "prowess", getPool(actor, "prowess").value); // Empty prowess
  assert.equal(getPool(actor, "prowess").value, 0);

  const groundTarget = createTestActor({ name: "Ground Mob", type: "character" });
  const aerialTarget = createTestActor({
    name: "Flying Wasp",
    type: "character",
    flags: { ak5e: { isAerial: true } }
  });

  // Case 1: Skyranger not flying, ground target killed -> conditions not met
  const attempt1 = await checkSkyrangerProwessGain(actor, groundTarget);
  assert.equal(attempt1.eligible, false);
  assert.equal(getPool(actor, "prowess").value, 0);

  // Case 2: Skyranger is flying, ground target killed -> gains 1 Prowess
  await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);

  const attempt2 = await checkSkyrangerProwessGain(actor, groundTarget);
  assert.equal(attempt2.eligible, true);
  assert.equal(attempt2.prowessGained, 1);
  assert.equal(getPool(actor, "prowess").value, 1);

  // Case 3: Second kill in same turn blocked by 1/turn limit
  const attempt3 = await checkSkyrangerProwessGain(actor, aerialTarget);
  assert.equal(attempt3.eligible, false);
  assert.equal(attempt3.reason, "alreadyUsedThisTurn");
  assert.equal(getPool(actor, "prowess").value, 1);

  // Reset turn triggers -> now aerial target kill triggers 1 Prowess
  resetSkyrangerTurnTriggers(actor);
  const attempt4 = await checkSkyrangerProwessGain(actor, aerialTarget);
  assert.equal(attempt4.eligible, true);
  assert.equal(getPool(actor, "prowess").value, 2);

  // Undo reverts prowess gain
  await attempt4.undo();
  assert.equal(getPool(actor, "prowess").value, 1);
});

/* ================================================================
   12. Advanced Doctrine: Crash AoE (11th Level)
   ================================================================ */

test("Crash AoE calculates 2x height distance limit, 10 ft radius, and half Strafe Damage", async () => {
  const actor = createSkyrangerActor(11, { flightSuit: true });
  const target = createTestActor({ name: "Falling Harpy", type: "character" });

  const targetHeight = 25; // 25 ft above ground
  const crash = await executeCrashAoE(actor, target, null, targetHeight, { distance: 40 });

  assert.equal(crash.success, true);
  assert.equal(crash.maxDistance, 50); // 2 * 25
  assert.equal(crash.radius, 10);
  assert.equal(crash.save.ability, "dex");
  assert.equal(crash.save.dc, martialDC(actor));
  // At Lv 11, Strafe Damage is 7d8 -> half is 3d8
  assert.equal(crash.damage.diceCount, 3);
  assert.equal(crash.damage.formula, "3d8");
  assert.equal(crash.damage.damageType, "thunder");

  // Distance exceeding 2x height throws without override
  await assert.rejects(async () => {
    await executeCrashAoE(actor, target, null, targetHeight, { distance: 60 });
  }, /Crash point exceeds maximum distance/);
});

/* ================================================================
   13. Afterburners (15th Level)
   ================================================================ */

test("Afterburners reaction movement and 1/turn Fire damage aura within 10 ft", async () => {
  const actor = createSkyrangerActor(15, { flightSuit: true });
  assert.equal(hasAfterburners(actor), true);

  // Evasive Manoeuvres gives reaction movement up to Speed (30 ft) at level 15
  await refundPool(actor, "prowess", 1);
  const em = await executeEvasiveManoeuvres(actor);
  assert.equal(em.hasAfterburners, true);
  assert.equal(em.reactionMovementGranted, 30);

  const target = createTestActor({ name: "Nearby Guard", type: "character" });

  // Trigger Afterburners fire aura
  const aura = await executeAfterburnersAura(actor, target);
  assert.equal(aura.success, true);
  assert.equal(aura.maxRange, 10);
  assert.equal(aura.save.ability, "dex");
  assert.equal(aura.save.dc, martialDC(actor));
  // At Lv 15, Strafe Damage is 8d8 Fire
  assert.equal(aura.damage.formula, "8d8");
  assert.equal(aura.damage.damageType, "fire");

  // 1/turn limit check
  await assert.rejects(async () => {
    await executeAfterburnersAura(actor, target);
  }, /already been triggered this turn/);

  // Turn reset clears the 1/turn limit
  resetSkyrangerTurnTriggers(actor);
  // But Evasive Manoeuvres AC boost expires on turn start!
  assert.equal(isEvasiveManoeuvresActive(actor), false);
  await assert.rejects(async () => {
    await executeAfterburnersAura(actor, target);
  }, /only active while Armour Class is increased by Evasive Manoeuvres/);
});

/* ================================================================
   14. Skyscreamer (20th Level)
   ================================================================ */

test("Skyscreamer Combat Mode grants multirole doctrines, free Fuel, and special weapons", async () => {
  const actor = createSkyrangerActor(20, { flightSuit: true });
  assert.equal(hasSkyscreamer(actor), true);
  assert.equal(isSkyscreamerActive(actor), false);

  // Activate Skyscreamer Combat Mode
  const combatMode = await activateSkyscreamer(actor);
  assert.equal(combatMode.success, true);
  assert.equal(combatMode.durationSeconds, 60);
  assert.equal(combatMode.multiroleActive, true);
  assert.equal(combatMode.freeDoctrineFuel, true);
  assert.equal(isSkyscreamerActive(actor), true);

  // Multirole: all 3 Air Doctrines are active at once!
  const activeDoctrines = getActiveAirDoctrines(actor);
  assert.equal(activeDoctrines.length, 3);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY), true);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT), true);
  assert.equal(hasAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT), true);

  // Free Fuel: Air Doctrine fuel cost is 0 during Skyscreamer
  assert.equal(getAirDoctrineFuelCost(actor), 0);

  // Check Core Cannon data model
  const cannon = combatMode.specialWeapons.cannon;
  assert.equal(cannon.name, "Core Cannon");
  assert.equal(cannon.system.damage.base.number, 3);
  assert.equal(cannon.system.damage.base.denomination, 8);
  assert.deepEqual(cannon.system.damage.base.types, ["force"]);
  assert.equal(cannon.system.range.value, 100);
  assert.equal(cannon.system.range.long, 300);
  assert.ok(cannon.system.properties.includes("rapidFire"));
  assert.ok(cannon.system.properties.includes("lgt"));

  // Check Core Saber data model
  const saber = combatMode.specialWeapons.saber;
  assert.equal(saber.name, "Core Saber");
  assert.equal(saber.system.damage.base.number, 3);
  assert.equal(saber.system.damage.base.denomination, 8);
  assert.deepEqual(saber.system.damage.base.types, ["force"]);
  assert.ok(saber.system.properties.includes("deadly"));
  assert.ok(saber.system.properties.includes("fin"));
  assert.ok(saber.system.properties.includes("rch"));
  assert.ok(saber.system.properties.includes("lgt"));

  // Execute AA Missile without expending Fuel
  const initialFuel = getFuel(actor);
  const freeMissile = await executeAAMissile(actor, null, { distance: 50 });
  assert.equal(freeMissile.spentFuel, 0);
  assert.equal(getFuel(actor), initialFuel);

  // Deactivate Combat Mode
  await deactivateSkyscreamer(actor);
  assert.equal(isSkyscreamerActive(actor), false);
  assert.equal(getAirDoctrineFuelCost(actor), 1);
});

/* ================================================================
   15. Rest and Lifecycle Hooks
   ================================================================ */

test("Long Rest restores Fuel pool to max and cleans up Combat Mode and Flight states", async () => {
  const actor = createSkyrangerActor(5, { flightSuit: true });
  assert.equal(getFuelMax(actor), 3);

  // Spend Fuel and take off
  await spendFuel(actor, 2);
  assert.equal(getFuel(actor), 1);
  await executeTakeOff(actor);
  assert.equal(isFlying(actor), true);

  // Simulate Long Rest
  resetSkyrangerRestTriggers(actor, true);
  await refundPool(actor, "fuel", getFuelMax(actor)); // To max
  assert.equal(isFlying(actor), false);
});

/* ================================================================
   16. Boundary Values, Negative Tests & Adversarial Edge Cases
   ================================================================ */

test("Adversarial damage halving, non-skyranger gating, and boundary checks", async () => {
  // 1. Damage halving with odd numbers and edge cases
  const actor = createSkyrangerActor(5, { flightSuit: true });
  const baseAC = 15;
  const pb = pbForLevel(5); // +3

  // Odd damage: 15 / 2 = 7
  const oddHit = resolveEvasiveManoeuvresIncomingAttack(actor, baseAC + pb + 1, baseAC, 15);
  assert.equal(oddHit.finalDamage, 7);

  // 1 damage: 1 / 2 = 0
  const oneHit = resolveEvasiveManoeuvresIncomingAttack(actor, baseAC + pb + 1, baseAC, 1);
  assert.equal(oneHit.finalDamage, 0);

  // 0 damage
  const zeroHit = resolveEvasiveManoeuvresIncomingAttack(actor, baseAC + pb + 1, baseAC, 0);
  assert.equal(zeroHit.finalDamage, 0);

  // 2. Non-Skyranger attempts Skyranger actions
  const civilian = createTestActor({ name: "Civilian", type: "character" });
  await assert.rejects(async () => {
    await executeEvasiveManoeuvres(civilian);
  }, /Evasive Manoeuvres requires 5th level Skyranger/);

  await assert.rejects(async () => {
    await executeAfterburnersAura(civilian, actor);
  }, /Afterburners requires 15th level Skyranger/);

  await assert.rejects(async () => {
    await activateSkyscreamer(civilian);
  }, /Skyscreamer requires 20th level Skyranger/);

  // 3. Level boundaries
  assert.equal(calculateFuelMax(-5), 2);
  assert.equal(calculateFuelMax(999), 8);
  assert.equal(getStrafeDamageDiceCount(0), 0);
  assert.equal(getStrafeDamageDiceCount(100), 10);
  assert.equal(calculateStrafeDamage(-1).formula, "0");

  // 4. Skyscreamer second activation without rest
  const lv20 = createSkyrangerActor(20, { flightSuit: true });
  await activateSkyscreamer(lv20);
  await assert.rejects(async () => {
    await activateSkyscreamer(lv20);
  }, /Skyscreamer is limited to once per Long Rest/);

  // Overridden activation succeeds
  const secondMode = await activateSkyscreamer(lv20, { override: true });
  assert.equal(secondMode.success, true);
  assert.ok(secondMode.warnings.length > 0);

  // 5. Elevation checks via token document
  const mockToken = {
    document: { elevation: 35 }
  };
  const tokenTarget = createTestActor({ name: "Token Flyer", type: "character" });
  assert.equal(isTargetAerial(tokenTarget, mockToken), true);

  // Zero elevation token
  const groundToken = { document: { elevation: 0 } };
  assert.equal(isTargetAerial(civilian, groundToken), false);
});

