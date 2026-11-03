/**
 * Comprehensive test suite for Trapmaster Specialist Subclass (Ch. 3 L6382–6542).
 * Tests all 12 functional areas:
 *  1. Trapmaster Identification & Feature Predicates
 *  2. Environmental Warfare: Trap DC Calculations (Dex/Int, Lv 20 House of Horrors +5)
 *  3. Environmental Warfare: Sleight of Hand Expertise Grant
 *  4. Environmental Warfare: Traps Resource Pool & LR Recovery
 *  5. Devil's Own Luck: 1/SR or LR Action environmental trap suggestion (rejects Timed Explosive)
 *  6. All 8 Trap Schemas: properties, damage scaling at Level 1, 7, and 14, saves, conditions
 *  7. Detecting & Disarming Mechanics (Detection check, disarm check, fail-by-5 trigger)
 *  8. 5th Level: Panic Inducer (Irritating Distraction, Jester's Grace, Warning Point)
 *  9. 5th Level: Here's One I Made Earlier (60 ft placement, 1 Prowess spend, Prowess gain triggers)
 * 10. 11th Level: Bait the Trap (Come and Get Me lure, WIS save vs Trap DC)
 * 11. 15th Level: Agent of Chaos (DR bypass, Resistance neutralization)
 * 12. 20th Level: House of Horrors (Party Favours 6 hidden traps at 100 ft, Undo reversibility)
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  TRAPMASTER_SUBCLASS_ID,
  TRAPS_CATALOG,
  isTrapmaster,
  hasEnvironmentalWarfare,
  hasPanicInducer,
  hasHeresOneIMadeEarlier,
  hasBaitTheTrap,
  hasAgentOfChaos,
  hasHouseOfHorrors,
  calculateTrapDC,
  calculateDetectionDC,
  calculateDisarmDC,
  getTrap,
  getTrapDamageFormula,
  getTrapDamageType,
  getTrapSaveInfo,
  checkTrapDetection,
  evaluateDisarmAttempt,
  hasSleightOfHandExpertise,
  applySleightOfHandGrant,
  defineTrapmasterPools,
  registerTrapmasterPools,
  validateTrapPlacement,
  plantTrap,
  executeDevilsOwnLuck,
  applyIrritatingDistraction,
  hasIrritatingDistraction,
  evaluateTrapSaveRollOptions,
  checkJesterGraceTriggerImmunity,
  checkJesterGraceSaveAdvantage,
  executeWarningPoint,
  triggerDelayedTrap,
  recordTrapSaveFailure,
  checkTurnStartProwessGain,
  onCreatureReducedToZeroByTrap,
  executeComeAndGetMe,
  applyAgentOfChaos,
  checkAgentOfChaosBypass,
  evaluateAgentOfChaosDamage,
  executePartyFavours,
  undoTrapmasterOperation,
  registerTrapmasterHooks
} from "../scripts/trapmaster-features.mjs";

import { SPECIALIST_CLASS_ID } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

function createTrapmasterActor(level = 1, options = {}) {
  const sClass = createTestItem({
    type: "class",
    name: "Specialist",
    system: { identifier: "specialist", levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });

  const subclass = createTestItem({
    type: "subclass",
    name: "Specialist: Trapmaster",
    system: { identifier: "trapmaster", classIdentifier: "specialist" },
    flags: { ak5e: { chapterThreeId: TRAPMASTER_SUBCLASS_ID } }
  });

  const actor = createTestActor({
    name: options.name || "Test Trapmaster",
    system: {
      details: { level },
      attributes: { prof: Math.floor((level - 1) / 4) + 2 },
      abilities: {
        str: { mod: options.strMod ?? 0 },
        dex: { mod: options.dexMod ?? 3 },
        con: { mod: options.conMod ?? 2 },
        int: { mod: options.intMod ?? 2 },
        wis: { mod: options.wisMod ?? 1 },
        cha: { mod: options.chaMod ?? 0 }
      },
      skills: {
        slt: { value: options.sltProf ?? 0 },
        prc: { value: options.prcProf ?? 1, passive: options.passivePerception ?? 13 }
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "trapmaster"
        },
        resourcePools: {
          prowess: { value: options.prowess ?? (level >= 4 ? Math.floor((level - 1) / 4) + 2 : 0) }
        },
        trapmaster: {}
      }
    }
  });

  if (actor.items?.set) {
    actor.items.set(sClass.id, sClass);
    actor.items.set(subclass.id, subclass);
  } else if (Array.isArray(actor.items)) {
    actor.items.push(sClass, subclass);
  }

  return actor;
}

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineTrapmasterPools();
  registerTrapmasterHooks();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

// -----------------------------------------------------------------------------
// 1. Identification & Feature Predicates
// -----------------------------------------------------------------------------

test("Trapmaster: identification predicate identifies Trapmaster actors correctly", () => {
  const trapmaster = createTrapmasterActor(1);
  assert.equal(isTrapmaster(trapmaster), true);

  const nonSpecialist = createTestActor({ name: "Commoner" });
  assert.equal(isTrapmaster(nonSpecialist), false);

  const otherSubclass = createTestActor({
    name: "Executor",
    flags: { ak5e: { specialist: { enabled: true, branch: "executor" } } }
  });
  assert.equal(isTrapmaster(otherSubclass), false);
  assert.equal(isTrapmaster(null), false);
});

test("Trapmaster: feature predicates unlock at appropriate levels", () => {
  const lv1 = createTrapmasterActor(1);
  assert.equal(hasEnvironmentalWarfare(lv1), true);
  assert.equal(hasPanicInducer(lv1), false);
  assert.equal(hasHeresOneIMadeEarlier(lv1), false);
  assert.equal(hasBaitTheTrap(lv1), false);
  assert.equal(hasAgentOfChaos(lv1), false);
  assert.equal(hasHouseOfHorrors(lv1), false);

  const lv5 = createTrapmasterActor(5);
  assert.equal(hasPanicInducer(lv5), true);
  assert.equal(hasHeresOneIMadeEarlier(lv5), true);
  assert.equal(hasBaitTheTrap(lv5), false);

  const lv11 = createTrapmasterActor(11);
  assert.equal(hasBaitTheTrap(lv11), true);
  assert.equal(hasAgentOfChaos(lv11), false);

  const lv15 = createTrapmasterActor(15);
  assert.equal(hasAgentOfChaos(lv15), true);
  assert.equal(hasHouseOfHorrors(lv15), false);

  const lv20 = createTrapmasterActor(20);
  assert.equal(hasHouseOfHorrors(lv20), true);
});

// -----------------------------------------------------------------------------
// 2. Environmental Warfare: Trap DC Calculations
// -----------------------------------------------------------------------------

test("Trapmaster: calculateTrapDC computes 8 + PB + max(Dex, Int)", () => {
  // Lv 1, PB = 2, Dex = +3, Int = +1 -> 8 + 2 + 3 = 13
  const actorDex = createTrapmasterActor(1, { dexMod: 3, intMod: 1 });
  assert.equal(calculateTrapDC(actorDex), 13);
  assert.equal(calculateDetectionDC(actorDex), 13);
  assert.equal(calculateDisarmDC(actorDex), 13);

  // Lv 1, PB = 2, Dex = +1, Int = +4 -> 8 + 2 + 4 = 14
  const actorInt = createTrapmasterActor(1, { dexMod: 1, intMod: 4 });
  assert.equal(calculateTrapDC(actorInt), 14);

  // Explicit ability override
  assert.equal(calculateTrapDC(actorDex, { ability: "int" }), 8 + 2 + 1); // 11
  assert.equal(calculateTrapDC(actorInt, { ability: "dex" }), 8 + 2 + 1); // 11
});

test("Trapmaster: House of Horrors at Lv 20 permanently adds +5 to Trap DC", () => {
  // Lv 20: PB = 6, Dex = +5, Int = +3. Base = 8 + 6 + 5 = 19. With +5 = 24.
  const actor20 = createTrapmasterActor(20, { dexMod: 5, intMod: 3 });
  assert.equal(calculateTrapDC(actor20), 24);

  // Manual houseOfHorrors toggle
  const actor1 = createTrapmasterActor(1, { dexMod: 3, intMod: 1 });
  assert.equal(calculateTrapDC(actor1, { houseOfHorrors: true }), 13 + 5);
});

// -----------------------------------------------------------------------------
// 3. Environmental Warfare: Sleight of Hand Expertise Grant
// -----------------------------------------------------------------------------

test("Trapmaster: applySleightOfHandGrant grants proficiency or upgrades to expertise", async () => {
  // Unproficient -> gains proficiency (value = 1)
  const actorUnprof = createTrapmasterActor(1, { sltProf: 0 });
  assert.equal(hasSleightOfHandExpertise(actorUnprof), false);
  await applySleightOfHandGrant(actorUnprof);
  assert.equal(actorUnprof.system.skills.slt.value, 1);

  // Already proficient -> gains expertise (value = 2)
  const actorProf = createTrapmasterActor(1, { sltProf: 1 });
  await applySleightOfHandGrant(actorProf);
  assert.equal(actorProf.system.skills.slt.value, 2);
  assert.equal(hasSleightOfHandExpertise(actorProf), true);
});

// -----------------------------------------------------------------------------
// 4. Environmental Warfare: Traps Resource Pool & LR Recovery
// -----------------------------------------------------------------------------

test("Trapmaster: traps resource pool scales to 2 * PB and replenishes on Long Rest", async () => {
  const actor1 = createTrapmasterActor(1); // PB = 2 -> Max Traps = 4
  const pool1 = getPool(actor1, "traps");
  assert.equal(pool1.max, 4);
  assert.equal(pool1.value, 4);

  const actor5 = createTrapmasterActor(5); // PB = 3 -> Max Traps = 6
  const pool5 = getPool(actor5, "traps");
  assert.equal(pool5.max, 6);

  const actor20 = createTrapmasterActor(20); // PB = 6 -> Max Traps = 12
  const pool20 = getPool(actor20, "traps");
  assert.equal(pool20.max, 12);
});

// -----------------------------------------------------------------------------
// 5. Devil's Own Luck: 1/SR or LR Environmental Trap Suggestion
// -----------------------------------------------------------------------------

test("Trapmaster: executeDevilsOwnLuck allows environmental trap suggestion and rejects Timed Explosive", async () => {
  const actor = createTrapmasterActor(1);

  // Reject Timed Explosive per source rule
  await assert.rejects(
    async () => {
      await executeDevilsOwnLuck(actor, { trapChoice: "timedExplosive" });
    },
    /cannot mimic Timed Explosive/
  );

  // Valid suggestion with Explosive Trap
  const result = await executeDevilsOwnLuck(actor, {
    objectDescription: "fuel barrel by the wall",
    trapChoice: "explosive",
    triggerCondition: "Shot with handgun as enemy runs past",
    gmAgreed: true
  });

  assert.equal(result.record.trapChoice, "explosive");
  assert.equal(result.record.gmAgreed, true);
  assert.equal(result.receipt.devilsOwnLuckSpent, 1);

  // Pool usage
  const pool = getPool(actor, "devilsOwnLuck");
  assert.equal(pool.value, 0);
});

// -----------------------------------------------------------------------------
// 6. All 8 Trap Schemas: Properties, Damage Scaling & Saves
// -----------------------------------------------------------------------------

test("Trapmaster: all 8 traps exist in catalog with proper metadata", () => {
  const expectedTraps = [
    "alarm", "explosive", "gas", "incendiary",
    "paddle", "snare", "spike", "timedExplosive"
  ];

  for (const id of expectedTraps) {
    const trap = getTrap(id);
    assert.ok(trap, `Trap ${id} should exist`);
    assert.equal(trap.id, id);
    assert.ok(trap.name);
    assert.ok(trap.setupArea);
    assert.ok(trap.triggerCondition);
  }
});

test("Trapmaster: trap damage scaling matches dispatch specification at Lv 1, 7, and 14", () => {
  // Explosive Trap: 2d8 Fire (4d8 at 7th, 6d8 at 14th)
  assert.equal(getTrapDamageFormula("explosive", 1), "2d8");
  assert.equal(getTrapDamageFormula("explosive", 7), "4d8");
  assert.equal(getTrapDamageFormula("explosive", 14), "6d8");
  assert.equal(getTrapDamageType("explosive"), "fire");
  assert.equal(getTrapSaveInfo("explosive").saveAbility, "dex");
  assert.equal(getTrapSaveInfo("explosive").halfOnSave, true);

  // Gas Trap: 2d6 Poison (4d6 at 7th, 6d6 at 14th) + Poisoned
  assert.equal(getTrapDamageFormula("gas", 1), "2d6");
  assert.equal(getTrapDamageFormula("gas", 7), "4d6");
  assert.equal(getTrapDamageFormula("gas", 14), "6d6");
  assert.equal(getTrapDamageType("gas"), "poison");
  assert.equal(getTrapSaveInfo("gas").saveAbility, "con");
  assert.equal(getTrapSaveInfo("gas").condition, "poisoned");

  // Incendiary Trap: 2d6 Fire (4d6 at 7th, 6d6 at 14th) + Burning
  assert.equal(getTrapDamageFormula("incendiary", 1), "2d6");
  assert.equal(getTrapDamageFormula("incendiary", 7), "4d6");
  assert.equal(getTrapDamageFormula("incendiary", 14), "6d6");
  assert.equal(getTrapDamageType("incendiary"), "fire");
  assert.equal(getTrapSaveInfo("incendiary").condition, "burning");

  // Paddle Trap: 1d10 Bludgeoning (2d10 at 7th, 3d10 at 14th) + Prone / knockback
  assert.equal(getTrapDamageFormula("paddle", 1), "1d10");
  assert.equal(getTrapDamageFormula("paddle", 7), "2d10");
  assert.equal(getTrapDamageFormula("paddle", 14), "3d10");
  assert.equal(getTrapDamageType("paddle"), "bludgeoning");
  assert.equal(getTrapSaveInfo("paddle").saveAbility, "str");

  // Snare Trap: Restrained condition
  assert.equal(getTrapDamageFormula("snare", 1), null);
  assert.equal(getTrapSaveInfo("snare").condition, "restrained");

  // Spike Trap: 2d10 Piercing (4d10 at 7th, 6d10 at 14th) + movement speed halved
  assert.equal(getTrapDamageFormula("spike", 1), "2d10");
  assert.equal(getTrapDamageFormula("spike", 7), "4d10");
  assert.equal(getTrapDamageFormula("spike", 14), "6d10");
  assert.equal(getTrapDamageType("spike"), "piercing");
  assert.equal(getTrap("spike").multiTrigger, true);

  // Timed Explosive: 3d8 Force (6d8 at 7th, 9d8 at 14th)
  assert.equal(getTrapDamageFormula("timedExplosive", 1), "3d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 7), "6d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 14), "9d8");
  assert.equal(getTrapDamageType("timedExplosive"), "force");
});

test("Trapmaster: trap damage scaling also supports source Chapter 3 formulas via variant: 'source'", () => {
  // Source Explosive: 4d8 Thunder (6d8 at 7th, 8d8 at 14th)
  assert.equal(getTrapDamageFormula("explosive", 1, { variant: "source" }), "4d8");
  assert.equal(getTrapDamageFormula("explosive", 7, { variant: "source" }), "6d8");
  assert.equal(getTrapDamageFormula("explosive", 14, { variant: "source" }), "8d8");
  assert.equal(getTrapDamageType("explosive", { variant: "source" }), "thunder");

  // Source Gas: 2d8 Poison (3d8 at 7th, 4d8 at 14th)
  assert.equal(getTrapDamageFormula("gas", 1, { variant: "source" }), "2d8");
  assert.equal(getTrapDamageFormula("gas", 7, { variant: "source" }), "3d8");
  assert.equal(getTrapDamageFormula("gas", 14, { variant: "source" }), "4d8");

  // Source Timed Explosive: 6d10 Thunder
  assert.equal(getTrapDamageFormula("timedExplosive", 1, { variant: "source" }), "6d10");
  assert.equal(getTrapDamageType("timedExplosive", { variant: "source" }), "thunder");
});

// -----------------------------------------------------------------------------
// 7. Detecting & Disarming Mechanics
// -----------------------------------------------------------------------------

test("Trapmaster: checkTrapDetection evaluates passive and active detection against Trap DC", () => {
  const trapDC = 15;

  // Passive perception >= DC succeeds
  const passRes = checkTrapDetection({ trapDC, passivePerception: 16 });
  assert.equal(passRes.detected, true);
  assert.equal(passRes.byPassive, true);

  // Passive perception < DC fails
  const failRes = checkTrapDetection({ trapDC, passivePerception: 12 });
  assert.equal(failRes.detected, false);

  // Active check succeeds
  const activeRes = checkTrapDetection({ trapDC, passivePerception: 12, activeCheckRoll: 17 });
  assert.equal(activeRes.detected, true);
  assert.equal(activeRes.byActive, true);
});

test("Trapmaster: evaluateDisarmAttempt enforces fail-by-5 immediate trigger", () => {
  const trapDC = 15;

  // Exact DC or higher succeeds
  const success = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 15 });
  assert.equal(success.success, true);
  assert.equal(success.triggered, false);

  // Failed by 1-4 points fails without triggering
  const failSafe = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 12 }); // margin -3
  assert.equal(failSafe.success, false);
  assert.equal(failSafe.triggered, false);
  assert.equal(failSafe.margin, -3);

  // Failed by 5 points immediately triggers the trap!
  const trigger5 = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 10 }); // margin -5
  assert.equal(trigger5.success, false);
  assert.equal(trigger5.triggered, true);

  // Failed by 8 points immediately triggers the trap!
  const trigger8 = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 7 }); // margin -8
  assert.equal(trigger8.success, false);
  assert.equal(trigger8.triggered, true);
});

// -----------------------------------------------------------------------------
// 8. 5th Level: Panic Inducer
// -----------------------------------------------------------------------------

test("Trapmaster: Irritating Distraction applies disadvantage on trap saves", async () => {
  const trapmaster = createTrapmasterActor(5);
  const target = createTestActor({ name: "Hostile Enemy" });

  assert.equal(hasIrritatingDistraction(target, trapmaster), false);
  await applyIrritatingDistraction(trapmaster, target);
  assert.equal(hasIrritatingDistraction(target, trapmaster), true);

  const rollOpts = evaluateTrapSaveRollOptions(target, trapmaster, {});
  assert.equal(rollOpts.disadvantage, true);
});

test("Trapmaster: Jester's Grace provides trigger immunity to own/ally traps and advantage on saves", () => {
  const trapmaster = createTrapmasterActor(5);
  const ally = createTestActor({ name: "Ranger Ally", id: "ally-1" });
  const hostile = createTestActor({ name: "Hostile", id: "hostile-1" });

  // Immune to triggering own traps
  assert.equal(checkJesterGraceTriggerImmunity(trapmaster, trapmaster), true);

  // Immune to ally traps
  assert.equal(checkJesterGraceTriggerImmunity(trapmaster, ally, { allyIds: ["ally-1"] }), true);

  // Not immune to hostile traps
  assert.equal(checkJesterGraceTriggerImmunity(trapmaster, hostile, { allyIds: ["ally-1"] }), false);

  // Advantage on saves against traps
  assert.equal(checkJesterGraceSaveAdvantage(trapmaster, hostile), true);
});

test("Trapmaster: Warning Point reduces speed to 0 on failed INT save and delays trap trigger", async () => {
  const trapmaster = createTrapmasterActor(5, { dexMod: 3, intMod: 2 }); // Trap DC = 8 + 3 + 3 = 14
  const target = createTestActor({ name: "Advancing Enemy" });
  const trapInstance = { id: "trap-wp-1", trapId: "explosive", dc: 14 };

  // Creature fails INT save (roll 10 < 14)
  const result = await executeWarningPoint(trapmaster, target, trapInstance, { intSaveResult: 10 });
  assert.equal(result.saveFailed, true);
  assert.equal(result.speedLocked, true);
  assert.equal(target.flags?.ak5e?.speedReducedToZero, true);

  // Trigger delayed trap as reaction
  const reactResult = await triggerDelayedTrap(trapmaster, "trap-wp-1", [target]);
  assert.equal(reactResult.triggered, true);
  assert.equal(reactResult.trap.delayed, false);
});

// -----------------------------------------------------------------------------
// 9. 5th Level: Here's One I Made Earlier & Prowess Triggers
// -----------------------------------------------------------------------------

test("Trapmaster: Here's One I Made Earlier allows 60 ft trap placement by spending 1 Prowess", async () => {
  const trapmaster = createTrapmasterActor(5);

  // Normal placement beyond 5 ft warns
  const normVal = validateTrapPlacement(trapmaster, { distance: 30, spendProwess: false });
  assert.equal(normVal.valid, false);

  // With Here's One I Made Earlier (1 Prowess spend), range up to 60 ft is valid
  const prowessVal = validateTrapPlacement(trapmaster, { distance: 45, spendProwess: true });
  assert.equal(prowessVal.valid, true);
  assert.equal(prowessVal.maxRange, 60);
  assert.equal(prowessVal.prowessCost, 1);

  // Plant trap spending 1 Traps pool and 1 Prowess pool
  const plantRes = await plantTrap(trapmaster, {
    trapId: "explosive",
    distance: 40,
    useProwess: true
  });

  assert.equal(plantRes.receipt.trapsSpent, 1);
  assert.equal(plantRes.receipt.prowessSpent, 1);
  assert.equal(plantRes.trap.distance, 40);
});

test("Trapmaster: Prowess triggers on 0 HP, fail-by-5, and 2+ failed saves at turn start", async () => {
  const trapmaster = createTrapmasterActor(5);
  const target1 = createTestActor({ name: "Target 1", id: "t-1" });
  const target2 = createTestActor({ name: "Target 2", id: "t-2" });

  // 1. Fail by 5+ grants 1 Prowess immediately
  const fail5Res = await recordTrapSaveFailure(trapmaster, "t-1", { margin: -6 });
  assert.equal(fail5Res.prowessAwarded, 1);

  // 2. Kill by trap grants 1 Prowess (1/turn)
  const killRes = await onCreatureReducedToZeroByTrap(trapmaster, target1);
  assert.equal(killRes.prowessAwarded, 1);

  // 3. Second kill in same turn is blocked by 1/turn limit
  const kill2Res = await onCreatureReducedToZeroByTrap(trapmaster, target2);
  assert.equal(kill2Res.prowessAwarded, 0);

  // 4. Turn start: 2+ failed saves since last turn grants 1 Prowess
  await recordTrapSaveFailure(trapmaster, "t-2", { margin: -2 });
  const turnStart = await checkTurnStartProwessGain(trapmaster);
  assert.equal(turnStart.gained, true);
  assert.equal(turnStart.prowessAwarded, 1);
});

// -----------------------------------------------------------------------------
// 10. 11th Level: Bait the Trap (Come and Get Me)
// -----------------------------------------------------------------------------

test("Trapmaster: Come and Get Me taunts a creature within 60 ft with WIS save vs Trap DC", async () => {
  const trapmaster = createTrapmasterActor(11, { dexMod: 4, intMod: 2 }); // Trap DC = 8 + 4 + 4 = 16
  const target = createTestActor({ name: "Boss Brute" });

  // Failed save (roll 12 < 16)
  const failRes = await executeComeAndGetMe(trapmaster, target, { wisSaveResult: 12 });
  assert.equal(failRes.saveFailed, true);
  assert.ok(target.flags?.ak5e?.comeAndGetMeLure);

  // Successful save (roll 18 >= 16)
  const passRes = await executeComeAndGetMe(trapmaster, target, { wisSaveResult: 18 });
  assert.equal(passRes.saveFailed, false);
});

// -----------------------------------------------------------------------------
// 11. 15th Level: Agent of Chaos
// -----------------------------------------------------------------------------

test("Trapmaster: Agent of Chaos strips DR and Damage Resistance against trap damage", async () => {
  const target = createTestActor({ name: "Armored Golem" });

  // Standard damage calculation without Agent of Chaos:
  // Raw damage 30, DR = 10, Resistance = true -> (30 - 10) / 2 = 10
  const baseline = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 30,
    hasResistance: true,
    damageReduction: 10
  });
  assert.equal(baseline.finalDamage, 10);
  assert.equal(baseline.isBypassed, false);

  // Apply Agent of Chaos for "fire"
  await applyAgentOfChaos(target, { damageType: "fire", trapId: "explosive" });
  assert.equal(checkAgentOfChaosBypass(target, "fire"), true);

  // With Agent of Chaos: DR ignored, Resistance treated as normal -> 30 damage!
  const bypassed = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 30,
    hasResistance: true,
    damageReduction: 10
  });
  assert.equal(bypassed.finalDamage, 30);
  assert.equal(bypassed.isBypassed, true);
  assert.equal(bypassed.damageReductionIgnored, true);
  assert.equal(bypassed.resistanceIgnored, true);
});

// -----------------------------------------------------------------------------
// 12. 20th Level: House of Horrors — Party Favours & Undo Reversibility
// -----------------------------------------------------------------------------

test("Trapmaster: Party Favours places up to 6 traps at 100 ft simultaneously without expending Traps pool", async () => {
  const trapmaster = createTrapmasterActor(20);
  const trapsPoolBefore = getPool(trapmaster, "traps").value;

  const trapsToSet = [
    { trapId: "explosive", distance: 90, location: "North Gate" },
    { trapId: "gas", distance: 80, location: "Courtyard" },
    { trapId: "incendiary", distance: 100, location: "Bridge" },
    { trapId: "paddle", distance: 50, location: "Hallway" },
    { trapId: "snare", distance: 60, location: "Doorstep" },
    { trapId: "spike", distance: 75, location: "Window" }
  ];

  const result = await executePartyFavours(trapmaster, { trapsList: trapsToSet });
  assert.equal(result.planted.length, 6);
  assert.equal(result.receipt.trapsCount, 6);

  // Verify Traps pool was NOT expended
  const trapsPoolAfter = getPool(trapmaster, "traps").value;
  assert.equal(trapsPoolAfter, trapsPoolBefore);

  // Verify Party Favours pool was expended
  const pfPool = getPool(trapmaster, "partyFavours");
  assert.equal(pfPool.value, 0);

  // More than 6 traps is rejected
  await assert.rejects(
    async () => {
      await executePartyFavours(trapmaster, {
        trapsList: ["alarm", "explosive", "gas", "incendiary", "paddle", "snare", "spike"]
      });
    },
    /maximum of 6 traps/
  );
});

test("Trapmaster: undoTrapmasterOperation cleanly reverses planted traps and resource expenditures", async () => {
  const trapmaster = createTrapmasterActor(5);

  // Plant a trap with Here's One I Made Earlier
  const plantRes = await plantTrap(trapmaster, {
    trapId: "explosive",
    distance: 40,
    useProwess: true
  });

  const trapsCount = trapmaster.flags.ak5e.trapmaster.plantedTraps.length;
  assert.equal(trapsCount, 1);

  // Undo plant operation
  const undoRes = await undoTrapmasterOperation(trapmaster, plantRes.receipt);
  assert.equal(undoRes.undone, true);

  // Verify planted trap was removed from actor flags
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 0);

  // Verify resources were refunded
  const poolTraps = getPool(trapmaster, "traps");
  const poolProwess = getPool(trapmaster, "prowess");
  assert.equal(poolTraps.value, poolTraps.max);
  assert.equal(poolProwess.value, poolProwess.max);
});

test("Trapmaster: registerTrapmasterHooks safely exposes functions on globalThis.game.ak5e", () => {
  assert.ok(globalThis.game?.ak5e?.specialist?.trapmaster);
  assert.equal(typeof globalThis.game.ak5e.specialist.trapmaster.calculateTrapDC, "function");
  assert.equal(typeof globalThis.game.ak5e.specialist.trapmaster.plantTrap, "function");
  assert.equal(typeof globalThis.game.ak5e.specialist.trapmaster.getTrapDamageFormula, "function");
});

// -----------------------------------------------------------------------------
// 13. Adversarial Edge Cases & Boundary Conditions
// -----------------------------------------------------------------------------

test("Trapmaster: Trap DC handles equal ability scores, negative modifiers, and character flag preferences", () => {
  // Equal Dex and Int (+2, +2)
  const equalActor = createTrapmasterActor(1, { dexMod: 2, intMod: 2 });
  assert.equal(calculateTrapDC(equalActor), 8 + 2 + 2); // 12

  // Negative ability modifiers
  const lowActor = createTrapmasterActor(1, { dexMod: -1, intMod: -2 });
  assert.equal(calculateTrapDC(lowActor), 8 + 2 - 1); // 9

  // Flag preference on actor
  equalActor.flags.ak5e.trapmaster.dcAbility = "int";
  assert.equal(calculateTrapDC(equalActor), 12);
});

test("Trapmaster: Trap placement validates occupied spaces, range limits, and level gates", () => {
  const trapmaster1 = createTrapmasterActor(1);

  // Occupied space warning
  const occRes = validateTrapPlacement(trapmaster1, { unoccupied: false });
  assert.equal(occRes.valid, false);
  assert.ok(occRes.warnings.some(w => w.includes("not unoccupied")));

  // Here's One I Made Earlier used without 5th level warns
  const lv1Prowess = validateTrapPlacement(trapmaster1, { distance: 30, spendProwess: true });
  assert.equal(lv1Prowess.valid, false);
  assert.ok(lv1Prowess.warnings.some(w => w.includes("requires 5th level")));

  // Distance 65 ft (> 60 ft) with Prowess warns
  const trapmaster5 = createTrapmasterActor(5);
  const outOfRange = validateTrapPlacement(trapmaster5, { distance: 65, spendProwess: true });
  assert.equal(outOfRange.valid, false);
  assert.ok(outOfRange.warnings.some(w => w.includes("exceeds maximum")));

  // Party Favours used without 20th level warns
  const lv5PF = validateTrapPlacement(trapmaster5, { isPartyFavours: true });
  assert.equal(lv5PF.valid, false);
  assert.ok(lv5PF.warnings.some(w => w.includes("requires 20th level")));
});

test("Trapmaster: Agent of Chaos only bypasses the specific stripped damage type", async () => {
  const target = createTestActor({ name: "Fire & Cold Resistant Fiend" });

  // Apply Agent of Chaos for "fire"
  await applyAgentOfChaos(target, { damageType: "fire", trapId: "explosive" });

  // "fire" damage is bypassed
  const fireDmg = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 20,
    hasResistance: true,
    damageReduction: 5
  });
  assert.equal(fireDmg.finalDamage, 20);
  assert.equal(fireDmg.isBypassed, true);

  // "cold" damage is NOT bypassed (still resisted and reduced)
  const coldDmg = evaluateAgentOfChaosDamage(target, {
    damageType: "cold",
    rawDamage: 20,
    hasResistance: true,
    damageReduction: 5
  });
  // (20 - 5) / 2 = 7
  assert.equal(coldDmg.finalDamage, 7);
  assert.equal(coldDmg.isBypassed, false);
});

test("Trapmaster: Disarm check exact boundary tests (DC-4 vs DC-5)", () => {
  const trapDC = 20;

  // DC - 4: (16) fails safely without trigger
  const safeFail = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 16 });
  assert.equal(safeFail.success, false);
  assert.equal(safeFail.triggered, false);

  // DC - 5: (15) triggers immediately!
  const critFail = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 15 });
  assert.equal(critFail.success, false);
  assert.equal(critFail.triggered, true);
});

test("Trapmaster: undo of Devil's Own Luck and Party Favours restores resources and state", async () => {
  const trapmaster = createTrapmasterActor(20);

  // 1. Devil's Own Luck undo
  const dolRes = await executeDevilsOwnLuck(trapmaster, {
    objectDescription: "Steam vent",
    trapChoice: "gas"
  });
  assert.equal(getPool(trapmaster, "devilsOwnLuck").value, 0);

  await undoTrapmasterOperation(trapmaster, dolRes.receipt);
  assert.equal(getPool(trapmaster, "devilsOwnLuck").value, 1);

  // 2. Party Favours undo
  const pfRes = await executePartyFavours(trapmaster, {
    trapsList: ["alarm", "explosive"]
  });
  assert.equal(getPool(trapmaster, "partyFavours").value, 0);
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 2);

  await undoTrapmasterOperation(trapmaster, pfRes.receipt);
  assert.equal(getPool(trapmaster, "partyFavours").value, 1);
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 0);

  // 3. Null / empty receipt handling
  const nullRes = await undoTrapmasterOperation(trapmaster, null);
  assert.equal(nullRes.undone, false);
});

