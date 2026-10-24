/**
 * Adversarial Test Suite for AK5e Trapmaster Specialist Subclass (Ch. 3 L6382–6542).
 * Authored by Empirical Challenger (challenger_trapmaster_11) to aggressively stress:
 *  1. Trap DC Calculations & Boundary Values:
 *     - Equal Dex and Int modifiers, negative modifiers, extreme modifier boundaries (-10, +10).
 *     - Minimum DC floor clamping.
 *     - Actor flag preferences (`flags.ak5e.trapmaster.dcAbility`) and runtime options overrides.
 *     - Level 20 House of Horrors permanent +5 bonus and Level 19 boundary.
 *     - Detection DC and Disarm DC exact equivalence to Trap DC.
 *     - Passive perception and active check detection threshold boundaries.
 *  2. 8 Trap Schemas Scaling & Trigger Mechanics:
 *     - All 8 traps catalog schemas (alarm, explosive, gas, incendiary, paddle, snare, spike, timedExplosive).
 *     - Dual-variant damage scaling at level 1, 6, 7, 13, 14, 20 (dispatch vs source variants).
 *     - Disarm Sleight of Hand exact boundary conditions: DC, DC-1, DC-4 (safe), DC-5 (trigger!), DC-6 (trigger!).
 *     - Devil's Own Luck strict rejection of Timed Explosive, acceptance of 7 other traps, unknown trap rejection,
 *       shortfall clamping, and rest recovery.
 *  3. Panic Inducer & Reaction Timing:
 *     - Irritating Distraction level gate, target isolation, and disadvantage on trap saves.
 *     - Jester's Grace trigger immunity (own traps, ally traps, hostile traps still trigger).
 *     - Jester's Grace saving throw advantage on own and other traps.
 *     - Warning Point INT save failure vs success, speed lock (0), delayed trap ledger, reaction release.
 *     - Attempting to trigger non-delayed or already-triggered traps.
 *  4. Here's One I Made Earlier & Prowess Triggers:
 *     - 60 ft placement validation with 1 Prowess spend, distance boundaries (60 ft valid, 61 ft warns).
 *     - Normal placement distance boundaries (5 ft valid, 6 ft warns).
 *     - Shortfall handling when attempting 60 ft placement with 0 Prowess (override clamps at 0, non-blocking warning).
 *     - Shortfall handling with 0 Traps pool.
 *     - Prowess gain triggers: kill by trap (1/turn), save failed by 5+ (1/turn), turn start 2+ failed saves.
 *     - Turn start reset of failed saves ledger.
 *  5. Bait the Trap (11th Level):
 *     - Come and Get Me level gate, PB-scaling pool, WIS save vs Trap DC, forced movement heading towards designated point.
 *     - Shortfall handling when pool is empty.
 *  6. Agent of Chaos (15th Level):
 *     - Level gate (Lv 15).
 *     - Bypassing Damage Reduction (DR = 0) and treating Damage Resistance as normal damage.
 *     - Damage type strict isolation (e.g. fire stripped does NOT bypass cold, thunder, or bludgeoning).
 *     - Multiple stripped damage types on the same target.
 *     - Parametric damage matrix across DR only, resistance only, both, neither.
 *  7. House of Horrors & Party Favours (20th Level):
 *     - Level gate (Lv 20).
 *     - Party Favours placing up to 6 traps simultaneously within 100 ft without expending `traps` pool.
 *     - Enforcing 1/Long Rest constraint on `partyFavours` pool.
 *     - Boundary constraints: 1..6 traps valid; 0 traps rejected; 7 traps rejected.
 *     - Range boundary: 100 ft valid; 101 ft warns.
 *  8. Full Encounter-Window Undo Reversibility (WORKFLOW §3.2):
 *     - Reverting trap placements, Devil's Own Luck, Come and Get Me, and Party Favours.
 *     - Multi-step undo in arbitrary order preserving remaining traps.
 *     - Robustness against corrupt or null receipts.
 *     - specialistUses integration audit for placeTrap and partyFavours.
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
import { getPool, refundPool, setPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { specialistUses } from "../scripts/specialist-uses.mjs";
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
        trapmaster: options.trapmasterFlags ?? {}
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

// =============================================================================
// SECTION 1: TRAP DC CALCULATIONS & BOUNDARY VALUES
// =============================================================================

test("Adversarial: Trap DC handles equal ability modifiers", () => {
  // Dex = +2, Int = +2, PB = 2 -> 8 + 2 + 2 = 12
  const actor = createTrapmasterActor(1, { dexMod: 2, intMod: 2 });
  assert.equal(calculateTrapDC(actor), 12);
  assert.equal(calculateDetectionDC(actor), 12);
  assert.equal(calculateDisarmDC(actor), 12);
});

test("Adversarial: Trap DC handles negative ability modifiers properly selecting highest", () => {
  // Dex = -1, Int = -3, PB = 2 -> max(-1, -3) = -1 -> 8 + 2 - 1 = 9
  const actor1 = createTrapmasterActor(1, { dexMod: -1, intMod: -3 });
  assert.equal(calculateTrapDC(actor1), 9);

  // Dex = -4, Int = -2, PB = 2 -> max(-4, -2) = -2 -> 8 + 2 - 2 = 8
  const actor2 = createTrapmasterActor(1, { dexMod: -4, intMod: -2 });
  assert.equal(calculateTrapDC(actor2), 8);
});

test("Adversarial: Trap DC clamps to floor of 1 on extreme negative ability modifiers", () => {
  // Dex = -15, Int = -12, PB = 2 -> 8 + 2 - 12 = -2 -> clamped to 1
  const actorCursed = createTrapmasterActor(1, { dexMod: -15, intMod: -12 });
  assert.equal(calculateTrapDC(actorCursed), 1);
});

test("Adversarial: Trap DC character flag preferences and explicit option overrides", () => {
  // Dex = +4, Int = +1, PB = 2. Default = 8 + 2 + 4 = 14.
  const actor = createTrapmasterActor(1, { dexMod: 4, intMod: 1 });
  assert.equal(calculateTrapDC(actor), 14);

  // Actor preference flag for Int
  actor.flags.ak5e.trapmaster.dcAbility = "int";
  assert.equal(calculateTrapDC(actor), 8 + 2 + 1); // 11

  // Actor preference flag for Dex
  actor.flags.ak5e.trapmaster.dcAbility = "dex";
  assert.equal(calculateTrapDC(actor), 14);

  // Invalid flag falls back safely to max(Dex, Int)
  actor.flags.ak5e.trapmaster.dcAbility = "invalid_ability";
  assert.equal(calculateTrapDC(actor), 14);

  // Explicit option overrides actor flag
  assert.equal(calculateTrapDC(actor, { ability: "int" }), 11);
  assert.equal(calculateTrapDC(actor, { ability: "dex" }), 14);
});

test("Adversarial: Trap DC House of Horrors boundary (Level 19 vs Level 20)", () => {
  // Lv 19: PB = 6, Dex = +5, Int = +3. DC = 8 + 6 + 5 = 19 (no House of Horrors).
  const actor19 = createTrapmasterActor(19, { dexMod: 5, intMod: 3 });
  assert.equal(hasHouseOfHorrors(actor19), false);
  assert.equal(calculateTrapDC(actor19), 19);

  // Lv 20: PB = 6, Dex = +5, Int = +3. DC = 8 + 6 + 5 + 5 = 24 (House of Horrors +5).
  const actor20 = createTrapmasterActor(20, { dexMod: 5, intMod: 3 });
  assert.equal(hasHouseOfHorrors(actor20), true);
  assert.equal(calculateTrapDC(actor20), 24);
  assert.equal(calculateDetectionDC(actor20), 24);
  assert.equal(calculateDisarmDC(actor20), 24);
});

test("Adversarial: Trap detection threshold boundaries (passive and active checks)", () => {
  const trapDC = 16;

  // Passive perception: exact DC succeeds, DC - 1 fails
  assert.equal(checkTrapDetection({ trapDC, passivePerception: 16 }).detected, true);
  assert.equal(checkTrapDetection({ trapDC, passivePerception: 16 }).margin, 0);
  assert.equal(checkTrapDetection({ trapDC, passivePerception: 15 }).detected, false);
  assert.equal(checkTrapDetection({ trapDC, passivePerception: 15 }).margin, -1);

  // Active check overrides lower passive check
  const activeSucceeds = checkTrapDetection({ trapDC, passivePerception: 10, activeCheckRoll: 16 });
  assert.equal(activeSucceeds.detected, true);
  assert.equal(activeSucceeds.byActive, true);
  assert.equal(activeSucceeds.margin, 0);

  // Active check lower than DC fails even if higher than passive
  const activeFails = checkTrapDetection({ trapDC, passivePerception: 10, activeCheckRoll: 15 });
  assert.equal(activeFails.detected, false);
  assert.equal(activeFails.margin, -1);

  // Invalid trapDC throws error
  assert.throws(() => checkTrapDetection({ trapDC: NaN }), /trapDC must be a finite number/);
});

// =============================================================================
// SECTION 2: 8 TRAP SCHEMAS SCALING & TRIGGER MECHANICS
// =============================================================================

test("Adversarial: Complete catalog coverage for all 8 traps", () => {
  const trapKeys = Object.keys(TRAPS_CATALOG);
  assert.equal(trapKeys.length, 8);
  const expected = ["alarm", "explosive", "gas", "incendiary", "paddle", "snare", "spike", "timedExplosive"];
  for (const key of expected) {
    assert.ok(trapKeys.includes(key), `Catalog missing expected trap '${key}'`);
  }
});

test("Adversarial: Damage scaling boundary transitions across all 8 traps (dispatch variant)", () => {
  // Explosive Trap: 2d8 (1..6), 4d8 (7..13), 6d8 (14..20) Fire
  assert.equal(getTrapDamageFormula("explosive", 1), "2d8");
  assert.equal(getTrapDamageFormula("explosive", 6), "2d8");
  assert.equal(getTrapDamageFormula("explosive", 7), "4d8");
  assert.equal(getTrapDamageFormula("explosive", 13), "4d8");
  assert.equal(getTrapDamageFormula("explosive", 14), "6d8");
  assert.equal(getTrapDamageFormula("explosive", 20), "6d8");
  assert.equal(getTrapDamageType("explosive"), "fire");

  // Gas Trap: 2d6 (1..6), 4d6 (7..13), 6d6 (14..20) Poison
  assert.equal(getTrapDamageFormula("gas", 1), "2d6");
  assert.equal(getTrapDamageFormula("gas", 6), "2d6");
  assert.equal(getTrapDamageFormula("gas", 7), "4d6");
  assert.equal(getTrapDamageFormula("gas", 13), "4d6");
  assert.equal(getTrapDamageFormula("gas", 14), "6d6");
  assert.equal(getTrapDamageFormula("gas", 20), "6d6");
  assert.equal(getTrapDamageType("gas"), "poison");

  // Incendiary Trap: 2d6 (1..6), 4d6 (7..13), 6d6 (14..20) Fire
  assert.equal(getTrapDamageFormula("incendiary", 1), "2d6");
  assert.equal(getTrapDamageFormula("incendiary", 6), "2d6");
  assert.equal(getTrapDamageFormula("incendiary", 7), "4d6");
  assert.equal(getTrapDamageFormula("incendiary", 13), "4d6");
  assert.equal(getTrapDamageFormula("incendiary", 14), "6d6");
  assert.equal(getTrapDamageFormula("incendiary", 20), "6d6");
  assert.equal(getTrapDamageType("incendiary"), "fire");

  // Paddle Trap: 1d10 (1..6), 2d10 (7..13), 3d10 (14..20) Bludgeoning
  assert.equal(getTrapDamageFormula("paddle", 1), "1d10");
  assert.equal(getTrapDamageFormula("paddle", 6), "1d10");
  assert.equal(getTrapDamageFormula("paddle", 7), "2d10");
  assert.equal(getTrapDamageFormula("paddle", 13), "2d10");
  assert.equal(getTrapDamageFormula("paddle", 14), "3d10");
  assert.equal(getTrapDamageFormula("paddle", 20), "3d10");
  assert.equal(getTrapDamageType("paddle"), "bludgeoning");

  // Spike Trap: 2d10 (1..6), 4d10 (7..13), 6d10 (14..20) Piercing
  assert.equal(getTrapDamageFormula("spike", 1), "2d10");
  assert.equal(getTrapDamageFormula("spike", 6), "2d10");
  assert.equal(getTrapDamageFormula("spike", 7), "4d10");
  assert.equal(getTrapDamageFormula("spike", 13), "4d10");
  assert.equal(getTrapDamageFormula("spike", 14), "6d10");
  assert.equal(getTrapDamageFormula("spike", 20), "6d10");
  assert.equal(getTrapDamageType("spike"), "piercing");

  // Timed Explosive: 3d8 (1..6), 6d8 (7..13), 9d8 (14..20) Force
  assert.equal(getTrapDamageFormula("timedExplosive", 1), "3d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 6), "3d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 7), "6d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 13), "6d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 14), "9d8");
  assert.equal(getTrapDamageFormula("timedExplosive", 20), "9d8");
  assert.equal(getTrapDamageType("timedExplosive"), "force");

  // Non-damaging traps return null
  assert.equal(getTrapDamageFormula("alarm", 1), null);
  assert.equal(getTrapDamageFormula("alarm", 14), null);
  assert.equal(getTrapDamageFormula("snare", 1), null);
  assert.equal(getTrapDamageFormula("snare", 14), null);
});

test("Adversarial: Damage scaling boundary transitions across all 8 traps (source variant)", () => {
  // Source Explosive: 4d8 (1..6), 6d8 (7..13), 8d8 (14..20) Thunder
  assert.equal(getTrapDamageFormula("explosive", 1, { variant: "source" }), "4d8");
  assert.equal(getTrapDamageFormula("explosive", 6, { variant: "source" }), "4d8");
  assert.equal(getTrapDamageFormula("explosive", 7, { variant: "source" }), "6d8");
  assert.equal(getTrapDamageFormula("explosive", 13, { variant: "source" }), "6d8");
  assert.equal(getTrapDamageFormula("explosive", 14, { variant: "source" }), "8d8");
  assert.equal(getTrapDamageFormula("explosive", 20, { variant: "source" }), "8d8");
  assert.equal(getTrapDamageType("explosive", { variant: "source" }), "thunder");

  // Source Gas: 2d8 (1..6), 3d8 (7..13), 4d8 (14..20) Poison
  assert.equal(getTrapDamageFormula("gas", 1, { variant: "source" }), "2d8");
  assert.equal(getTrapDamageFormula("gas", 7, { variant: "source" }), "3d8");
  assert.equal(getTrapDamageFormula("gas", 14, { variant: "source" }), "4d8");

  // Source Incendiary: 2d8 (1..6), 3d8 (7..13), 4d8 (14..20) Fire
  assert.equal(getTrapDamageFormula("incendiary", 1, { variant: "source" }), "2d8");
  assert.equal(getTrapDamageFormula("incendiary", 7, { variant: "source" }), "3d8");
  assert.equal(getTrapDamageFormula("incendiary", 14, { variant: "source" }), "4d8");

  // Source Paddle: 4d8 (1..6), 6d8 (7..13), 8d8 (14..20) Bludgeoning
  assert.equal(getTrapDamageFormula("paddle", 1, { variant: "source" }), "4d8");
  assert.equal(getTrapDamageFormula("paddle", 7, { variant: "source" }), "6d8");
  assert.equal(getTrapDamageFormula("paddle", 14, { variant: "source" }), "8d8");

  // Source Spike: 1d8 at all levels
  assert.equal(getTrapDamageFormula("spike", 1, { variant: "source" }), "1d8");
  assert.equal(getTrapDamageFormula("spike", 7, { variant: "source" }), "1d8");
  assert.equal(getTrapDamageFormula("spike", 14, { variant: "source" }), "1d8");

  // Source Timed Explosive: 6d10 Thunder at all levels
  assert.equal(getTrapDamageFormula("timedExplosive", 1, { variant: "source" }), "6d10");
  assert.equal(getTrapDamageFormula("timedExplosive", 7, { variant: "source" }), "6d10");
  assert.equal(getTrapDamageFormula("timedExplosive", 14, { variant: "source" }), "6d10");
  assert.equal(getTrapDamageType("timedExplosive", { variant: "source" }), "thunder");
});

test("Adversarial: Disarm check exact boundary conditions (success, safe fail, critical fail)", () => {
  const trapDC = 18;

  // Exact success (margin = 0)
  const resSuccessExact = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 18 });
  assert.equal(resSuccessExact.success, true);
  assert.equal(resSuccessExact.triggered, false);
  assert.equal(resSuccessExact.margin, 0);

  // High success (margin = +5)
  const resSuccessHigh = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 23 });
  assert.equal(resSuccessHigh.success, true);
  assert.equal(resSuccessHigh.triggered, false);

  // Safe fail margin -1 (roll = 17)
  const resFail1 = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 17 });
  assert.equal(resFail1.success, false);
  assert.equal(resFail1.triggered, false);
  assert.equal(resFail1.margin, -1);

  // Safe fail margin -4 (roll = 14) -> boundary: fails safely!
  const resFail4 = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 14 });
  assert.equal(resFail4.success, false);
  assert.equal(resFail4.triggered, false);
  assert.equal(resFail4.margin, -4);

  // Critical fail margin -5 (roll = 13) -> boundary: triggers immediately!
  const resFail5 = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 13 });
  assert.equal(resFail5.success, false);
  assert.equal(resFail5.triggered, true);
  assert.equal(resFail5.margin, -5);

  // Critical fail margin -6 (roll = 12) -> triggers immediately!
  const resFail6 = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: 12 });
  assert.equal(resFail6.success, false);
  assert.equal(resFail6.triggered, true);
  assert.equal(resFail6.margin, -6);

  // Parametric sweep: rolls from (DC - 10) to (DC + 10)
  for (let r = trapDC - 10; r <= trapDC + 10; r++) {
    const res = evaluateDisarmAttempt({ trapDC, sleightOfHandRoll: r });
    const expectedMargin = r - trapDC;
    assert.equal(res.margin, expectedMargin);
    if (r >= trapDC) {
      assert.equal(res.success, true);
      assert.equal(res.triggered, false);
    } else if (expectedMargin <= -5) {
      assert.equal(res.success, false);
      assert.equal(res.triggered, true);
    } else {
      assert.equal(res.success, false);
      assert.equal(res.triggered, false);
    }
  }
});

test("Adversarial: Devil's Own Luck rejects Timed Explosive and unknown traps", async () => {
  const trapmaster = createTrapmasterActor(1);

  // Strictly rejects Timed Explosive
  await assert.rejects(
    async () => {
      await executeDevilsOwnLuck(trapmaster, { trapChoice: "timedExplosive" });
    },
    /cannot mimic Timed Explosive/
  );

  // Strictly rejects unknown trap ID
  await assert.rejects(
    async () => {
      await executeDevilsOwnLuck(trapmaster, { trapChoice: "laserTurret" });
    },
    /Unknown trap choice/
  );

  // Accepts all other 7 traps: alarm, explosive, gas, incendiary, paddle, snare, spike
  const allowedTraps = ["alarm", "explosive", "gas", "incendiary", "paddle", "snare", "spike"];
  for (const trapId of allowedTraps) {
    // Ensure pool has 1 use before each test
    await refundPool(trapmaster, "devilsOwnLuck", 1);
    const res = await executeDevilsOwnLuck(trapmaster, {
      objectDescription: `Environmental object for ${trapId}`,
      trapChoice: trapId,
      gmAgreed: true
    });
    assert.equal(res.record.trapChoice, trapId);
    assert.equal(res.record.gmAgreed, true);
    assert.equal(res.receipt.devilsOwnLuckSpent, 1);
  }

  // Attempting to use Devil's Own Luck with empty pool throws Not enough error
  await assert.rejects(
    async () => {
      await executeDevilsOwnLuck(trapmaster, { trapChoice: "explosive" });
    },
    /Not enough Devil's Own Luck/
  );
});

test("Adversarial: Devil's Own Luck handles GM disagreement non-blockingly with warnings", async () => {
  const trapmaster = createTrapmasterActor(1);
  const result = await executeDevilsOwnLuck(trapmaster, {
    objectDescription: "Cardboard box",
    trapChoice: "explosive",
    gmAgreed: false
  });

  assert.equal(result.record.gmAgreed, false);
  assert.ok(result.receipt.warnings.some(w => w.includes("GM did not agree")));
});

// =============================================================================
// SECTION 3: PANIC INDUCER & REACTION TIMING
// =============================================================================

test("Adversarial: Irritating Distraction level gate and target disadvantage isolation", async () => {
  const lv1 = createTrapmasterActor(1);
  const lv5A = createTrapmasterActor(5, { name: "Trapmaster A" });
  lv5A.id = "tm-a";
  const lv5B = createTrapmasterActor(5, { name: "Trapmaster B" });
  lv5B.id = "tm-b";
  const target = createTestActor({ name: "Hostile Target", id: "target-1" });

  // Lv 1 cannot apply Irritating Distraction
  const lv1Result = await applyIrritatingDistraction(lv1, target);
  assert.equal(lv1Result, false);
  assert.equal(hasIrritatingDistraction(target, lv1), false);

  // Lv 5 applies Irritating Distraction from Trapmaster A
  const lv5Result = await applyIrritatingDistraction(lv5A, target);
  assert.equal(lv5Result, true);
  assert.equal(hasIrritatingDistraction(target, lv5A), true);

  // Target has disadvantage against Trapmaster A's traps
  const optsA = evaluateTrapSaveRollOptions(target, lv5A);
  assert.equal(optsA.disadvantage, true);

  // Target does NOT have disadvantage against Trapmaster B's traps!
  assert.equal(hasIrritatingDistraction(target, lv5B), false);
  const optsB = evaluateTrapSaveRollOptions(target, lv5B);
  assert.equal(optsB.disadvantage, undefined);
});

test("Adversarial: Jester's Grace trigger immunity and saving throw advantage", () => {
  const trapmaster = createTrapmasterActor(5, { name: "Trapmaster Self" });
  trapmaster.id = "self-1";
  const ally = createTestActor({ name: "Ally Specialist", id: "ally-1" });
  const hostile = createTestActor({ name: "Enemy Trapmaster", id: "enemy-1" });

  // Immune to triggering own traps
  assert.equal(checkJesterGraceTriggerImmunity(trapmaster, trapmaster), true);

  // Immune to triggering ally traps
  assert.equal(checkJesterGraceTriggerImmunity(trapmaster, ally, { allyIds: ["ally-1"] }), true);

  // Hostile trap triggers normally!
  assert.equal(checkJesterGraceTriggerImmunity(trapmaster, hostile, { allyIds: ["ally-1"] }), false);

  // Advantage on saves against traps (both own and other)
  assert.equal(checkJesterGraceSaveAdvantage(trapmaster, hostile), true);
  assert.equal(checkJesterGraceSaveAdvantage(trapmaster, trapmaster), true);

  // Non-5th level actor lacks Jester's Grace
  const lv1 = createTrapmasterActor(1);
  assert.equal(checkJesterGraceTriggerImmunity(lv1, lv1), false);
  assert.equal(checkJesterGraceSaveAdvantage(lv1), false);
});

test("Adversarial: Warning Point mechanics, INT save threshold, speed locking, and reaction delay", async () => {
  const trapmaster = createTrapmasterActor(5, { dexMod: 3, intMod: 3 }); // Trap DC = 8 + 3 + 3 = 14
  const target = createTestActor({ name: "Advancing Orc", id: "target-orc" });
  const trapInstance = { id: "trap-wp-stress", trapId: "explosive", dc: 14 };

  // 1. Level gate: lv 1 throws
  const lv1 = createTrapmasterActor(1);
  await assert.rejects(
    async () => {
      await executeWarningPoint(lv1, target, trapInstance, { intSaveResult: 10 });
    },
    /Warning Point requires 5th level/
  );

  // 2. Creature fails INT save (roll 13 < 14)
  const failRes = await executeWarningPoint(trapmaster, target, trapInstance, { intSaveResult: 13, dc: 14 });
  assert.equal(failRes.saveFailed, true);
  assert.equal(failRes.speedLocked, true);
  assert.equal(target.flags?.ak5e?.speedReducedToZero, true);
  assert.equal(target.flags?.ak5e?.warningPointLock?.trapmasterId, trapmaster.id);

  // Trap is recorded in delayedTraps
  const delayedList = trapmaster.flags.ak5e.trapmaster.delayedTraps;
  assert.equal(delayedList.length, 1);
  assert.equal(delayedList[0].id, "trap-wp-stress");
  assert.equal(delayedList[0].delayed, true);

  // 3. Reaction trigger releases delayed trap
  const trigRes = await triggerDelayedTrap(trapmaster, "trap-wp-stress", [target]);
  assert.equal(trigRes.triggered, true);
  assert.equal(trigRes.trap.delayed, false);
  assert.equal(trapmaster.flags.ak5e.trapmaster.delayedTraps.length, 0);

  // 4. Triggering non-existent delayed trap throws error
  await assert.rejects(
    async () => {
      await triggerDelayedTrap(trapmaster, "trap-wp-stress", [target]);
    },
    /Delayed trap instance trap-wp-stress not found/
  );

  // 5. Successful INT save (roll 14 >= 14) does not reduce speed
  const targetPassing = createTestActor({ name: "Smart Wizard", id: "target-wiz" });
  const trapInstance2 = { id: "trap-wp-2", trapId: "gas", dc: 14 };
  const passRes = await executeWarningPoint(trapmaster, targetPassing, trapInstance2, { intSaveResult: 14, dc: 14 });
  assert.equal(passRes.saveFailed, false);
  assert.equal(passRes.speedLocked, false);
  assert.equal(targetPassing.flags?.ak5e?.speedReducedToZero, undefined);
});

// =============================================================================
// SECTION 4: HERE'S ONE I MADE EARLIER & PROWESS TRIGGERS
// =============================================================================

test("Adversarial: Here's One I Made Earlier 60 ft placement validation and boundaries", () => {
  const trapmaster5 = createTrapmasterActor(5);

  // Standard placement: 5 ft valid, 6 ft invalid
  assert.equal(validateTrapPlacement(trapmaster5, { distance: 5, spendProwess: false }).valid, true);
  assert.equal(validateTrapPlacement(trapmaster5, { distance: 6, spendProwess: false }).valid, false);

  // Here's One I Made Earlier: 60 ft valid, 61 ft invalid
  const val60 = validateTrapPlacement(trapmaster5, { distance: 60, spendProwess: true });
  assert.equal(val60.valid, true);
  assert.equal(val60.maxRange, 60);
  assert.equal(val60.prowessCost, 1);

  const val61 = validateTrapPlacement(trapmaster5, { distance: 61, spendProwess: true });
  assert.equal(val61.valid, false);
  assert.ok(val61.warnings.some(w => w.includes("exceeds maximum placement range of 60 ft")));

  // Below 5th level using Prowess warns
  const trapmaster1 = createTrapmasterActor(1);
  const valLv1 = validateTrapPlacement(trapmaster1, { distance: 30, spendProwess: true });
  assert.equal(valLv1.valid, false);
  assert.ok(valLv1.warnings.some(w => w.includes("requires 5th level")));
});

test("Adversarial: Shortfall handling when placing traps with 0 Prowess or 0 Traps pool", async () => {
  const trapmaster = createTrapmasterActor(5, { prowess: 0 });

  // Manually empty traps pool
  trapmaster.flags.ak5e.resourcePools = {
    traps: { value: 0 },
    prowess: { value: 0 }
  };

  const plantRes = await plantTrap(trapmaster, {
    trapId: "explosive",
    distance: 40,
    useProwess: true
  });

  // Clamps at 0 without blocking execution (WORKFLOW §3.2)
  assert.equal(plantRes.receipt.trapsSpent, 0);
  assert.equal(plantRes.receipt.prowessSpent, 0);
  assert.ok(plantRes.validation.warnings.some(w => w.includes("Traps pool shortfall")));
  assert.ok(plantRes.validation.warnings.some(w => w.includes("Prowess shortfall")));
  assert.equal(plantRes.trap.distance, 40);
});

test("Adversarial: Trapmaster Prowess gain triggers and 1/turn constraints", async () => {
  const trapmaster = createTrapmasterActor(5, { prowess: 0 });
  const target1 = createTestActor({ name: "Foe 1", id: "foe-1" });
  const target2 = createTestActor({ name: "Foe 2", id: "foe-2" });

  // 1. Kill by trap gives 1 Prowess
  const kill1 = await onCreatureReducedToZeroByTrap(trapmaster, target1);
  assert.equal(kill1.prowessAwarded, 1);
  assert.equal(getPool(trapmaster, "prowess").value, 1);

  // 2. Second kill in same turn gives 0 Prowess (1/turn constraint)
  const kill2 = await onCreatureReducedToZeroByTrap(trapmaster, target2);
  assert.equal(kill2.prowessAwarded, 0);
  assert.equal(getPool(trapmaster, "prowess").value, 1);

  // 3. Save failed by 5+ margin gives 1 Prowess
  const fail5 = await recordTrapSaveFailure(trapmaster, "foe-1", { margin: -5 });
  assert.equal(fail5.prowessAwarded, 1);
  assert.equal(getPool(trapmaster, "prowess").value, 2);

  // 4. Second save failed by 5+ in same turn does NOT award another immediate prowess
  const fail5Second = await recordTrapSaveFailure(trapmaster, "foe-2", { margin: -7 });
  assert.equal(fail5Second.prowessAwarded, 0);

  // 5. Turn start prowess evaluation: 2 failed saves recorded since last turn
  const turnStart = await checkTurnStartProwessGain(trapmaster);
  assert.equal(turnStart.gained, true);
  assert.equal(turnStart.prowessAwarded, 1);
  assert.equal(getPool(trapmaster, "prowess").value, 3);

  // 6. Turn start resets the failures list; immediate second check gives 0
  const turnStartSecond = await checkTurnStartProwessGain(trapmaster);
  assert.equal(turnStartSecond.gained, false);
  assert.equal(turnStartSecond.prowessAwarded, 0);
});

// =============================================================================
// SECTION 5: BAIT THE TRAP (11TH LEVEL)
// =============================================================================

test("Adversarial: Come and Get Me level gate, pool scaling, and WIS save lure", async () => {
  // Level gate: lv 10 rejects
  const lv10 = createTrapmasterActor(10);
  const target = createTestActor({ name: "Beast", id: "beast-1" });
  await assert.rejects(
    async () => {
      await executeComeAndGetMe(lv10, target);
    },
    /Come and Get Me requires 11th level/
  );

  // Lv 11: PB = 4 -> Come and Get Me pool max = 4
  const lv11 = createTrapmasterActor(11, { dexMod: 4, intMod: 2 }); // Trap DC = 8 + 4 + 4 = 16
  const pool = getPool(lv11, "comeAndGetMe");
  assert.equal(pool.max, 4);
  assert.equal(pool.value, 4);

  // Failed WIS save (roll 15 < 16)
  const failRes = await executeComeAndGetMe(lv11, target, { wisSaveResult: 15, designatedPoint: "pitfall" });
  assert.equal(failRes.saveFailed, true);
  assert.equal(target.flags?.ak5e?.comeAndGetMeLure?.designatedPoint, "pitfall");
  assert.equal(getPool(lv11, "comeAndGetMe").value, 3);

  // Successful WIS save (roll 16 >= 16)
  const target2 = createTestActor({ name: "Wise Owl", id: "owl-1" });
  const passRes = await executeComeAndGetMe(lv11, target2, { wisSaveResult: 16 });
  assert.equal(passRes.saveFailed, false);
  assert.equal(target2.flags?.ak5e?.comeAndGetMeLure, undefined);
  assert.equal(getPool(lv11, "comeAndGetMe").value, 2);
});

// =============================================================================
// SECTION 6: AGENT OF CHAOS (15TH LEVEL)
// =============================================================================

test("Adversarial: Agent of Chaos damage reduction and resistance bypass isolation", async () => {
  const target = createTestActor({ name: "Demonic Golem", id: "golem-1" });

  // Baseline without Agent of Chaos:
  // Raw damage 40, DR = 10, Resistance = true -> (40 - 10) / 2 = 15
  const base = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 40,
    hasResistance: true,
    damageReduction: 10
  });
  assert.equal(base.finalDamage, 15);
  assert.equal(base.isBypassed, false);

  // Apply Agent of Chaos for "fire"
  await applyAgentOfChaos(target, { damageType: "fire", trapId: "explosive" });
  assert.equal(checkAgentOfChaosBypass(target, "fire"), true);
  assert.equal(checkAgentOfChaosBypass(target, "thunder"), false);
  assert.equal(checkAgentOfChaosBypass(target, "cold"), false);

  // Fire damage is completely unreduced: DR = 0, Resistance = false -> 40
  const fireEval = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 40,
    hasResistance: true,
    damageReduction: 10
  });
  assert.equal(fireEval.finalDamage, 40);
  assert.equal(fireEval.isBypassed, true);
  assert.equal(fireEval.damageReductionIgnored, true);
  assert.equal(fireEval.resistanceIgnored, true);

  // Thunder damage is NOT bypassed: DR and Resistance apply normally!
  const thunderEval = evaluateAgentOfChaosDamage(target, {
    damageType: "thunder",
    rawDamage: 40,
    hasResistance: true,
    damageReduction: 10
  });
  assert.equal(thunderEval.finalDamage, 15);
  assert.equal(thunderEval.isBypassed, false);

  // Parametric sweep: DR without resistance, resistance without DR, neither
  // 1. DR = 10, Resistance = false -> bypass gives 40 instead of 30
  const drOnly = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 40,
    hasResistance: false,
    damageReduction: 10
  });
  assert.equal(drOnly.finalDamage, 40);

  // 2. DR = 0, Resistance = true -> bypass gives 40 instead of 20
  const resOnly = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 40,
    hasResistance: true,
    damageReduction: 0
  });
  assert.equal(resOnly.finalDamage, 40);
});

// =============================================================================
// SECTION 7: HOUSE OF HORRORS & PARTY FAVOURS (20TH LEVEL)
// =============================================================================

test("Adversarial: Party Favours 1..6 traps simultaneous placement and pool isolation", async () => {
  const trapmaster20 = createTrapmasterActor(20);
  const initialTraps = getPool(trapmaster20, "traps").value; // 12
  const initialPF = getPool(trapmaster20, "partyFavours").value; // 1

  // 1. Level gate: lv 19 throws
  const lv19 = createTrapmasterActor(19);
  await assert.rejects(
    async () => {
      await executePartyFavours(lv19, { trapsList: ["explosive"] });
    },
    /Party Favours requires 20th level/
  );

  // 2. Exactly 6 traps (valid)
  const sixTraps = ["alarm", "explosive", "gas", "incendiary", "paddle", "spike"];
  const res6 = await executePartyFavours(trapmaster20, { trapsList: sixTraps });
  assert.equal(res6.planted.length, 6);
  assert.equal(res6.receipt.trapsCount, 6);

  // Traps pool is NOT expended
  assert.equal(getPool(trapmaster20, "traps").value, initialTraps);
  // Party Favours pool IS expended
  assert.equal(getPool(trapmaster20, "partyFavours").value, 0);

  // 3. Reject 7 traps
  await assert.rejects(
    async () => {
      await executePartyFavours(trapmaster20, {
        trapsList: ["alarm", "explosive", "gas", "incendiary", "paddle", "snare", "spike"]
      });
    },
    /maximum of 6 traps/
  );

  // 4. Reject empty trapsList
  await assert.rejects(
    async () => {
      await executePartyFavours(trapmaster20, { trapsList: [] });
    },
    /non-empty array/
  );
});

test("Adversarial: Party Favours 100 ft range boundary validation", () => {
  const trapmaster20 = createTrapmasterActor(20);

  // Distance 100 ft: valid
  const val100 = validateTrapPlacement(trapmaster20, { distance: 100, isPartyFavours: true });
  assert.equal(val100.valid, true);
  assert.equal(val100.maxRange, 100);

  // Distance 101 ft: invalid / warning
  const val101 = validateTrapPlacement(trapmaster20, { distance: 101, isPartyFavours: true });
  assert.equal(val101.valid, false);
  assert.ok(val101.warnings.some(w => w.includes("exceeds maximum placement range of 100 ft")));
});

// =============================================================================
// SECTION 8: FULL ENCOUNTER-WINDOW UNDO REVERSIBILITY (WORKFLOW §3.2)
// =============================================================================

test("Adversarial: Multi-step plantTrap and arbitrary-order undo reversibility", async () => {
  const trapmaster = createTrapmasterActor(5); // Traps max = 6, Prowess max = 3
  const poolTraps = getPool(trapmaster, "traps");
  const poolProwess = getPool(trapmaster, "prowess");

  assert.equal(poolTraps.value, 6);
  assert.equal(poolProwess.value, 3);

  // Plant Trap A (Standard 5 ft)
  const resA = await plantTrap(trapmaster, { trapId: "explosive", distance: 5 });
  // Plant Trap B (Here's One I Made Earlier 45 ft, spends prowess)
  const resB = await plantTrap(trapmaster, { trapId: "gas", distance: 45, useProwess: true });
  // Plant Trap C (Standard 5 ft)
  const resC = await plantTrap(trapmaster, { trapId: "paddle", distance: 5 });

  assert.equal(getPool(trapmaster, "traps").value, 3);
  assert.equal(getPool(trapmaster, "prowess").value, 2);
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 3);

  // Undo Trap B first (out of order!)
  const undoB = await undoTrapmasterOperation(trapmaster, resB.receipt);
  assert.equal(undoB.undone, true);
  assert.equal(getPool(trapmaster, "traps").value, 4);
  assert.equal(getPool(trapmaster, "prowess").value, 3); // prowess refunded
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 2);
  // Verify Trap A and C are still present, B is gone
  const idsAfterB = trapmaster.flags.ak5e.trapmaster.plantedTraps.map(t => t.id);
  assert.ok(idsAfterB.includes(resA.trap.id));
  assert.ok(idsAfterB.includes(resC.trap.id));
  assert.ok(!idsAfterB.includes(resB.trap.id));

  // Undo Trap A
  const undoA = await undoTrapmasterOperation(trapmaster, resA.receipt);
  assert.equal(undoA.undone, true);
  assert.equal(getPool(trapmaster, "traps").value, 5);
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 1);
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps[0].id, resC.trap.id);

  // Undo Trap C
  const undoC = await undoTrapmasterOperation(trapmaster, resC.receipt);
  assert.equal(undoC.undone, true);
  assert.equal(getPool(trapmaster, "traps").value, 6);
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, 0);
});

test("Adversarial: Party Favours undo restores all 6 planted traps and partyFavours pool", async () => {
  const trapmaster20 = createTrapmasterActor(20);
  const sixTraps = ["alarm", "explosive", "gas", "incendiary", "paddle", "spike"];

  const pfRes = await executePartyFavours(trapmaster20, { trapsList: sixTraps });
  assert.equal(trapmaster20.flags.ak5e.trapmaster.plantedTraps.length, 6);
  assert.equal(getPool(trapmaster20, "partyFavours").value, 0);

  // Undo Party Favours
  const undoRes = await undoTrapmasterOperation(trapmaster20, pfRes.receipt);
  assert.equal(undoRes.undone, true);
  assert.equal(getPool(trapmaster20, "partyFavours").value, 1);
  assert.equal(trapmaster20.flags.ak5e.trapmaster.plantedTraps.length, 0);
});

test("Adversarial: Devil's Own Luck and Come and Get Me clean undo", async () => {
  const trapmaster11 = createTrapmasterActor(11);
  const target = createTestActor({ name: "Lured Beast", id: "lured-1" });

  // 1. Devil's Own Luck
  const dolRes = await executeDevilsOwnLuck(trapmaster11, { trapChoice: "incendiary" });
  assert.equal(getPool(trapmaster11, "devilsOwnLuck").value, 0);
  await undoTrapmasterOperation(trapmaster11, dolRes.receipt);
  assert.equal(getPool(trapmaster11, "devilsOwnLuck").value, 1);

  // 2. Come and Get Me
  const cagmRes = await executeComeAndGetMe(trapmaster11, target, { wisSaveResult: 10 });
  assert.equal(getPool(trapmaster11, "comeAndGetMe").value, 3);
  // Undo Come and Get Me receipt via refund
  const undoCAGM = await undoTrapmasterOperation(trapmaster11, {
    type: "comeAndGetMe",
    trapsSpent: 0
  });
  assert.equal(undoCAGM.undone, true);
});

test("Adversarial: Robustness against corrupt or null receipts", async () => {
  const trapmaster = createTrapmasterActor(5);

  // Null receipt
  const nullRes = await undoTrapmasterOperation(trapmaster, null);
  assert.equal(nullRes.undone, false);

  // Empty receipt
  const emptyRes = await undoTrapmasterOperation(trapmaster, {});
  assert.equal(emptyRes.undone, true);

  // Non-existent trap instance id
  const fakeRes = await undoTrapmasterOperation(trapmaster, { trapInstanceId: "non-existent-id" });
  assert.equal(fakeRes.undone, true);
});

// =============================================================================
// SECTION 9: SPECIALIST-USES INTEGRATION & CONTRACT AUDIT
// =============================================================================

test("Adversarial: specialistUses table-play execution for Trapmaster plans", async () => {
  const trapmaster = createTrapmasterActor(11, { dexMod: 4, intMod: 3 });
  const target = createTestActor({ name: "Hostile Enemy", id: "hostile-99" });

  // 1. devilsOwnLuck plan execution
  const dolResult = await specialistUses.execute(trapmaster, "devilsOwnLuck", {
    trapId: "gas",
    confirmed: true
  }, "op-dol-1");
  assert.equal(dolResult.trapId, "gas");
  assert.equal(getPool(trapmaster, "devilsOwnLuck").value, 0);

  // 2. warningPoint plan execution with targetUuid
  const wpResult = await specialistUses.execute(trapmaster, "warningPoint", {
    targetUuid: target.uuid,
    targetName: target.name,
    confirmed: true
  }, "op-wp-1");
  assert.equal(wpResult.dc, 8 + 4 + 4); // 16

  // 3. comeAndGetMe plan execution with targetUuid
  const cagmResult = await specialistUses.execute(trapmaster, "comeAndGetMe", {
    targetUuid: target.uuid,
    targetName: target.name,
    confirmed: true
  }, "op-cagm-1");
  assert.equal(cagmResult.dc, 16);
  assert.equal(getPool(trapmaster, "comeAndGetMe").value, 3); // 4 - 1 = 3

  // 4. devilsOwnLuck undo
  const undoDol = await specialistUses.undo(trapmaster, "op-dol-1");
  assert.equal(undoDol.undone, "op-dol-1");
  assert.equal(getPool(trapmaster, "devilsOwnLuck").value, 1);

  // 5. comeAndGetMe undo
  const undoCagm = await specialistUses.undo(trapmaster, "op-cagm-1");
  assert.equal(undoCagm.undone, "op-cagm-1");
  assert.equal(getPool(trapmaster, "comeAndGetMe").value, 4);
});

test("Adversarial: Trap DC handles missing ability scores and string coercion gracefully", () => {
  // Missing abilities object
  const actorNoAbilities = createTestActor({
    system: { details: { level: 1 }, attributes: { prof: 2 }, abilities: {} },
    flags: { ak5e: { specialist: { enabled: true, branch: "trapmaster" } } }
  });
  assert.equal(calculateTrapDC(actorNoAbilities), 8 + 2 + 0); // 10

  // String coercion in abilities
  const actorStrings = createTestActor({
    system: { details: { level: 1 }, attributes: { prof: "3" }, abilities: { dex: { mod: "4" }, int: { mod: "2" } } },
    flags: { ak5e: { specialist: { enabled: true, branch: "trapmaster" } } }
  });
  assert.equal(calculateTrapDC(actorStrings), 8 + 3 + 4); // 15
});

test("Adversarial: applySleightOfHandGrant idempotency across unproficient, proficient, and expertise", async () => {
  // 1. Unproficient -> gains proficiency (value = 1)
  const actor0 = createTrapmasterActor(1, { sltProf: 0 });
  assert.equal(hasSleightOfHandExpertise(actor0), false);
  const grant1 = await applySleightOfHandGrant(actor0);
  assert.equal(grant1, 1);
  assert.equal(actor0.system.skills.slt.value, 1);
  assert.equal(hasSleightOfHandExpertise(actor0), false);

  // 2. Proficient -> gains expertise (value = 2)
  const actor1 = createTrapmasterActor(1, { sltProf: 1 });
  const grant2 = await applySleightOfHandGrant(actor1);
  assert.equal(grant2, 2);
  assert.equal(actor1.system.skills.slt.value, 2);
  assert.equal(hasSleightOfHandExpertise(actor1), true);

  // 3. Already Expertise -> stays expertise (value = 2, does not increase to 3!)
  const actor2 = createTrapmasterActor(1, { sltProf: 2 });
  const grant3 = await applySleightOfHandGrant(actor2);
  assert.equal(grant3, 2);
  assert.equal(actor2.system.skills.slt.value, 2);
  assert.equal(hasSleightOfHandExpertise(actor2), true);
});

test("Adversarial: Disarm check non-finite argument error boundaries", () => {
  assert.throws(() => evaluateDisarmAttempt({ trapDC: NaN, sleightOfHandRoll: 15 }), /trapDC must be a finite number/);
  assert.throws(() => evaluateDisarmAttempt({ trapDC: 15, sleightOfHandRoll: NaN }), /sleightOfHandRoll must be a finite number/);
  assert.throws(() => evaluateDisarmAttempt({ trapDC: "not-a-number", sleightOfHandRoll: 15 }), /trapDC must be a finite number/);
});

test("Adversarial: Normal trap placement distance and space boundaries", () => {
  const trapmaster = createTrapmasterActor(1);

  // Exactly 0 ft (ground under self): valid
  assert.equal(validateTrapPlacement(trapmaster, { distance: 0 }).valid, true);

  // Exactly 5 ft: valid
  assert.equal(validateTrapPlacement(trapmaster, { distance: 5 }).valid, true);

  // 5.1 ft: invalid / warning
  const res51 = validateTrapPlacement(trapmaster, { distance: 5.1 });
  assert.equal(res51.valid, false);
  assert.ok(res51.warnings.some(w => w.includes("exceeds maximum placement range of 5 ft")));

  // Occupied space: invalid / warning
  const resOcc = validateTrapPlacement(trapmaster, { distance: 5, unoccupied: false });
  assert.equal(resOcc.valid, false);
  assert.ok(resOcc.warnings.some(w => w.includes("Trap space is not unoccupied")));
});

test("Adversarial: plantTrap rejects non-Trapmaster and invalid trap identifiers", async () => {
  const commoner = createTestActor({ name: "Commoner" });
  await assert.rejects(
    async () => {
      await plantTrap(commoner, { trapId: "explosive" });
    },
    /Actor must be a Trapmaster/
  );

  const trapmaster = createTrapmasterActor(1);
  await assert.rejects(
    async () => {
      await plantTrap(trapmaster, { trapId: "antiMatterMine" });
    },
    /Unknown trap identifier: antiMatterMine/
  );
});

test("Adversarial: Irritating Distraction deduplication and null-safety", async () => {
  const trapmaster = createTrapmasterActor(5);
  const target = createTestActor({ name: "Target" });

  // Null inputs safely return false
  assert.equal(await applyIrritatingDistraction(null, target), false);
  assert.equal(await applyIrritatingDistraction(trapmaster, null), false);
  assert.equal(hasIrritatingDistraction(null, trapmaster), false);
  assert.equal(hasIrritatingDistraction(target, null), false);

  // Multiple applications from same trapmaster do not duplicate list entries
  await applyIrritatingDistraction(trapmaster, target);
  await applyIrritatingDistraction(trapmaster, target);
  await applyIrritatingDistraction(trapmaster, target);
  assert.equal(target.flags.ak5e.irritatingDistractions.length, 1);
});

test("Adversarial: Agent of Chaos multi-type stripping and zero/minimum damage bounds", async () => {
  const target = createTestActor({ name: "Multi-Resistant Boss" });

  // Strip fire, then strip poison
  await applyAgentOfChaos(target, { damageType: "fire" });
  await applyAgentOfChaos(target, { damageType: "poison" });

  assert.equal(checkAgentOfChaosBypass(target, "fire"), true);
  assert.equal(checkAgentOfChaosBypass(target, "poison"), true);
  assert.equal(checkAgentOfChaosBypass(target, "acid"), false);

  // Zero raw damage remains zero
  const zeroDmg = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 0,
    hasResistance: true,
    damageReduction: 10
  });
  assert.equal(zeroDmg.finalDamage, 0);

  // Damage less than DR: without bypass gives 0; with bypass gives raw damage!
  const smallDmgNoBypass = evaluateAgentOfChaosDamage(target, {
    damageType: "acid",
    rawDamage: 5,
    hasResistance: false,
    damageReduction: 10
  });
  assert.equal(smallDmgNoBypass.finalDamage, 0); // 5 - 10 = 0

  const smallDmgBypassed = evaluateAgentOfChaosDamage(target, {
    damageType: "fire",
    rawDamage: 5,
    hasResistance: false,
    damageReduction: 10
  });
  assert.equal(smallDmgBypassed.finalDamage, 5); // DR ignored!
});

test("Adversarial: Party Favours 1-trap and 6-trap custom locations and shortfall clamping", async () => {
  const trapmaster = createTrapmasterActor(20);

  // 1 trap (minimum non-empty boundary)
  const res1 = await executePartyFavours(trapmaster, {
    trapsList: [{ trapId: "spike", distance: 30, location: "Chokepoint" }]
  });
  assert.equal(res1.planted.length, 1);
  assert.equal(res1.planted[0].location, "Chokepoint");
  assert.equal(res1.planted[0].distance, 30);

  // Pool is now 0. Attempting executePartyFavours again throws Not enough Party Favours
  assert.equal(getPool(trapmaster, "partyFavours").value, 0);
  await assert.rejects(
    async () => {
      await executePartyFavours(trapmaster, { trapsList: ["explosive"] });
    },
    /Not enough Party Favours: 1 needed, 0 available/
  );
});

test("Adversarial: specialistUses heresOneIMadeEarlier plan execution and warnings", async () => {
  const trapmaster = createTrapmasterActor(5, { prowess: 2 });
  const poolTraps = getPool(trapmaster, "traps");
  const initialTraps = poolTraps.value;

  // Execute heresOneIMadeEarlier
  const res = await specialistUses.execute(trapmaster, "heresOneIMadeEarlier", {
    trapId: "explosive",
    confirmed: true
  }, "op-heres-1");

  assert.equal(res.trapId, "explosive");
  assert.equal(res.prowessCost, 1);
  assert.equal(getPool(trapmaster, "prowess").value, 1);
  assert.equal(getPool(trapmaster, "traps").value, initialTraps - 1);

  // Undo restores both prowess and traps
  const undoRes = await specialistUses.undo(trapmaster, "op-heres-1");
  assert.equal(undoRes.undone, "op-heres-1");
  assert.equal(getPool(trapmaster, "prowess").value, 2);
  assert.equal(getPool(trapmaster, "traps").value, initialTraps);
});

test("Adversarial: Remediated — specialistUses placeTrap populates receipt.trapInstanceId and cleans up", async () => {
  const trapmaster = createTrapmasterActor(5);
  const initialPlanted = trapmaster.flags.ak5e?.trapmaster?.plantedTraps?.length ?? 0;

  // Execute placeTrap via specialistUses
  await specialistUses.execute(trapmaster, "placeTrap", {
    trapId: "snare",
    confirmed: true
  }, "op-place-defect-1");

  const plantedCountAfterPlace = trapmaster.flags.ak5e.trapmaster.plantedTraps.length;
  assert.equal(plantedCountAfterPlace, initialPlanted + 1, "Trap is added to plantedTraps");

  // Retrieve the recorded receipt from state
  const state = trapmaster.flags.ak5e.specialistUses;
  const recordedReceipt = state.undo.find(r => r.id === "op-place-defect-1");
  assert.ok(recordedReceipt, "Receipt recorded in specialistUses.undo");

  // VERIFY REMEDIATION:
  // In placeTrap, plantTrap is captured and receipt.trapInstanceId is assigned.
  assert.ok(recordedReceipt.trapInstanceId, "Confirms receipt.trapInstanceId is populated");

  // Perform undo
  await specialistUses.undo(trapmaster, "op-place-defect-1");

  // The resource pool is restored, and the planted trap is cleaned up from the ledger
  assert.equal(trapmaster.flags.ak5e.trapmaster.plantedTraps.length, initialPlanted,
    "Confirms that plantedTraps is cleanly cleaned up using receipt.trapInstanceId");
});
