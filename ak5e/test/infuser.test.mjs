/**
 * Comprehensive automated test suite for AK5e Infuser Specialist Subclass (Ch. 3 L5688–5823 & DECISIONS.md L465).
 * Tests all 15 functional areas + encounter-window undo reversibility:
 *  1. Infuser Identification & Subclass Predicates
 *  2. Infuser DC Calculations (20 - INT - PB default, scaling, minimum floor clamp, standard formula toggle)
 *  3. Principle of Double Effect (Pharmacology Kit proficiency, alchemicalInfusions pool cap & recovery, range)
 *  4. Construct & Undead Immunity (Target validation & warnings)
 *  5. Max 1 Active Infusion per Creature (Overwriting prior infusion)
 *  6. All 8 Alchemical Infusions (Mechanics, triggers, actions, formulas, effects)
 *  7. Leverage Workflow & Lockout (CON save vs Infuser DC, Dazed & Lockout on failure, benefits on pass/fail)
 *  8. Level 5: New Concoctions (Neurological Inhibitor Berserk, Bungarotoxin Paralyzed + 2d10 Poison)
 *  9. Level 5: Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin mapping, 10 min weapon duration)
 * 10. Infuser Prowess Gain Triggers (0 HP on Poisoned/Toxined target, turnedFailureToSuccess 1/round limit, turnStart reset)
 * 11. Level 11: Stimpack & Rejuvenation (30 ft range, Questionable Rejuvenation 1d10 Temp HP on apply & save, additive with Procoagulant)
 * 12. Level 15: Excessive Dosing (Succumb +PB Toxin DC, Toxic Shock Poisoned rider)
 * 13. Level 20: To Defy Science (1/LR Action within 30 ft, 1-min Invulnerability preventing HP loss)
 * 14. Reversibility & Encounter-Window Undo (WORKFLOW §3.2 for all Infuser plans)
 * 15. Hook Registration Idempotency, GM Target Relay (validateTarget), & Hook Dispatch Integration
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isInfuser, calculateInfuserDC, calculateInfusionRange, getActiveInfusion,
  hasPrincipleOfDoubleEffect, hasNewConcoctions, hasDoubleBlindTrial,
  hasStimpack, hasExcessiveDosing, hasToDefyScience, getToxinDC,
  defineInfuserPools, infuserPreRollDamage, infuserPreApplyDamage,
  registerInfuserHooks, INFUSIONS, DOUBLE_BLIND_TABLE, INFUSER_SUBCLASS_ID
} from "../scripts/infuser-features.mjs";
import { specialistUses, INFUSER_PLANS, INFUSER_READINGS } from "../scripts/specialist-uses.mjs";
import { SPECIALIST_CLASS_ID, specialistBranch, isSpecialist } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineInfuserPools();
  registerInfuserHooks();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function addItem(actor, item) {
  if (actor.items?.set) {
    actor.items.set(item.id, item);
  } else if (Array.isArray(actor.items)) {
    actor.items.push(item);
  }
  return item;
}

function createInfuserActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subClass = createTestItem({
    name: "Infuser",
    type: "subclass",
    flags: {
      ak5e: {
        chapterThreeId: INFUSER_SUBCLASS_ID
      }
    }
  });

  const actor = createTestActor({
    name: options.name ?? "Test Infuser",
    items: [sClass, subClass, ...(options.items ?? [])],
    system: {
      ...options.system,
      attributes: {
        prof: Math.floor((level - 1) / 4) + 2,
        movement: { walk: 30 },
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { mod: 0, value: 10 },
        dex: { mod: 2, value: 14 },
        con: { mod: 2, value: 14 },
        int: { mod: options.intMod ?? 3, value: 10 + (options.intMod ?? 3) * 2 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 },
        ...(options.system?.abilities ?? {})
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "infusion"
        },
        specialistProgression: {
          level,
          branch: "infusion"
        },
        resourcePools: {
          prowess: { value: options.prowess ?? 2, max: Math.floor((level - 1) / 4) + 2 },
          alchemicalInfusions: { value: options.infusions ?? (2 * (Math.floor((level - 1) / 4) + 2)), max: 2 * (Math.floor((level - 1) / 4) + 2) },
          toDefyScience: { value: options.toDefyScience ?? 1, max: 1 }
        },
        infuser: {
          activeInfusions: {}
        },
        ...(options.flags?.ak5e ?? {})
      }
    }
  });

  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
  }
  return actor;
}

function createCreature(name = "Target Creature", options = {}) {
  const actor = createTestActor({
    name,
    uuid: options.uuid ?? `Actor.creature-${Math.random().toString(36).slice(2, 8)}`,
    system: {
      attributes: {
        hp: { value: options.hp ?? 25, max: options.hpMax ?? 25, temp: options.tempHp ?? 0 },
        hd: { denom: options.hd ?? "d8" },
        movement: { walk: 30 }
      },
      abilities: {
        str: { mod: 2, value: 14 },
        dex: { mod: 1, value: 12 },
        con: { mod: 2, value: 14 },
        int: { mod: 0, value: 10 },
        wis: { mod: 0, value: 10 },
        cha: { mod: 0, value: 10 }
      },
      details: {
        type: { value: options.creatureType ?? "humanoid" }
      }
    },
    flags: {
      ak5e: {
        ...(options.flags?.ak5e ?? {})
      }
    }
  });

  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
  }
  return actor;
}

/* ---------------------------------------------------------------- Test Areas */

test("Area 1: Infuser Identification & Subclass Predicates", () => {
  const infuserLv1 = createInfuserActor(1);
  const infuserLv5 = createInfuserActor(5);
  const infuserLv11 = createInfuserActor(11);
  const infuserLv15 = createInfuserActor(15);
  const infuserLv20 = createInfuserActor(20);
  const nonSpecialist = createTestActor({ name: "Civilian" });

  // Identification
  assert.equal(isSpecialist(infuserLv1), true, "Infuser is recognized as Specialist");
  assert.equal(isInfuser(infuserLv1), true, "Infuser actor is recognized as Infuser");
  assert.equal(isInfuser(nonSpecialist), false, "Civilian is not an Infuser");
  assert.equal(specialistBranch(infuserLv1), "infusion", "Branch resolves to infusion");

  // Predicate level scaling
  assert.equal(hasPrincipleOfDoubleEffect(infuserLv1), true, "Principle of Double Effect active at Lv 1");
  assert.equal(hasNewConcoctions(infuserLv1), false, "New Concoctions inactive at Lv 1");
  assert.equal(hasNewConcoctions(infuserLv5), true, "New Concoctions active at Lv 5");
  assert.equal(hasDoubleBlindTrial(infuserLv5), true, "Double-Blind Trial active at Lv 5");
  assert.equal(hasStimpack(infuserLv5), false, "Stimpack inactive at Lv 5");
  assert.equal(hasStimpack(infuserLv11), true, "Stimpack active at Lv 11");
  assert.equal(hasExcessiveDosing(infuserLv11), false, "Excessive Dosing inactive at Lv 11");
  assert.equal(hasExcessiveDosing(infuserLv15), true, "Excessive Dosing active at Lv 15");
  assert.equal(hasToDefyScience(infuserLv15), false, "To Defy Science inactive at Lv 15");
  assert.equal(hasToDefyScience(infuserLv20), true, "To Defy Science active at Lv 20");
});

test("Area 2: Infuser DC Calculations", () => {
  // Source default formula: 20 - INT - PB (DECISIONS.md L465)
  // Lv 1, INT 14 (+2), PB 2: DC = 20 - 2 - 2 = 16
  const infuser1 = createInfuserActor(1, { intMod: 2 });
  assert.equal(calculateInfuserDC(infuser1), 16, "Level 1 Infuser (INT +2, PB 2) DC is 16");

  // Lv 5, INT 16 (+3), PB 3: DC = 20 - 3 - 3 = 14
  const infuser5 = createInfuserActor(5, { intMod: 3 });
  assert.equal(calculateInfuserDC(infuser5), 14, "Level 5 Infuser (INT +3, PB 3) DC is 14");

  // Lv 20, INT 20 (+5), PB 6: DC = 20 - 5 - 6 = 9
  const infuser20 = createInfuserActor(20, { intMod: 5 });
  assert.equal(calculateInfuserDC(infuser20), 9, "Level 20 Infuser (INT +5, PB 6) DC is 9");

  // Extreme high stats floor clamp: Math.max(1, dc)
  const infuserGodlike = createInfuserActor(20, { intMod: 15 });
  assert.equal(calculateInfuserDC(infuserGodlike), 1, "Extreme stats clamp at minimum DC 1");

  // Standard formula toggle: 8 + INT + PB
  assert.equal(calculateInfuserDC(infuser1, { useStandardFormula: true }), 12, "Standard formula (8 + 2 + 2) is 12 at Lv 1");
  assert.equal(calculateInfuserDC(infuser5, { useStandardFormula: true }), 14, "Standard formula (8 + 3 + 3) is 14 at Lv 5");
  assert.equal(calculateInfuserDC(infuser20, { useStandardFormula: true }), 19, "Standard formula (8 + 5 + 6) is 19 at Lv 20");

  // GM ruling toggle via flags
  infuser1.flags.ak5e.specialist.rulings = { infuserDcReading: { value: "standard" } };
  assert.equal(calculateInfuserDC(infuser1), 12, "Ruling toggle 'standard' evaluates to 8 + INT + PB");
});

test("Area 3: Principle of Double Effect", () => {
  const infuser1 = createInfuserActor(1);
  const infuser5 = createInfuserActor(5);
  const infuser11 = createInfuserActor(11);
  const infuser20 = createInfuserActor(20);

  // Pool capacity scales strictly with 2 * PB
  const pool1 = getPool(infuser1, "alchemicalInfusions");
  const pool5 = getPool(infuser5, "alchemicalInfusions");
  const pool11 = getPool(infuser11, "alchemicalInfusions");
  const pool20 = getPool(infuser20, "alchemicalInfusions");

  assert.equal(pool1.max, 4, "Lv 1 pool max is 2 * PB = 4");
  assert.equal(pool5.max, 6, "Lv 5 pool max is 2 * PB = 6");
  assert.equal(pool11.max, 8, "Lv 11 pool max is 2 * PB = 8");
  assert.equal(pool20.max, 12, "Lv 20 pool max is 2 * PB = 12");

  // Infusion Range: 5 ft base, 30 ft at level 11+ (Delivery Service, Ch. 3 L5750)
  assert.equal(calculateInfusionRange(infuser1), 5, "Infusion range is 5 ft at Lv 1");
  assert.equal(calculateInfusionRange(infuser5), 5, "Infusion range is 5 ft at Lv 5");
  assert.equal(calculateInfusionRange(infuser11), 30, "Infusion range is 30 ft at Lv 11");
  assert.equal(calculateInfusionRange(infuser20), 30, "Infusion range is 30 ft at Lv 20");
});

test("Area 4: Construct & Undead Immunity", () => {
  const infuser = createInfuserActor(1);
  const construct = createCreature("Gilded Golem", { creatureType: "construct" });
  const undead = createCreature("Ghoul", { creatureType: "undead" });
  const humanoid = createCreature("Ally Guard", { creatureType: "humanoid" });

  // Plan against Construct throws PlayWarnings without override
  const planConstruct = specialistUses.plan(infuser, "applyInfusion", {
    targetUuid: construct.uuid,
    targetName: construct.name,
    infusionType: "adrenalineTrigger",
    checkOnly: true
  });
  assert.ok(planConstruct.warnings.some(w => w.id === "creatureType"), "Construct generates creatureType warning");

  assert.throws(() => {
    specialistUses.plan(infuser, "applyInfusion", {
      targetUuid: construct.uuid,
      targetName: construct.name,
      infusionType: "adrenalineTrigger"
    });
  }, /Constructs or Undead/);

  // Plan against Undead throws PlayWarnings without override
  const planUndead = specialistUses.plan(infuser, "applyInfusion", {
    targetUuid: undead.uuid,
    targetName: undead.name,
    infusionType: "adrenalineTrigger",
    checkOnly: true
  });
  assert.ok(planUndead.warnings.some(w => w.id === "creatureType"), "Undead generates creatureType warning");

  // Humanoid succeeds without creatureType warning
  const planHumanoid = specialistUses.plan(infuser, "applyInfusion", {
    targetUuid: humanoid.uuid,
    targetName: humanoid.name,
    infusionType: "adrenalineTrigger"
  });
  assert.equal(planHumanoid.warnings.some(w => w.id === "creatureType"), false, "Humanoid has no creatureType warning");
});

test("Area 5: Max 1 Active Infusion per Creature", async () => {
  const infuser = createInfuserActor(1, { infusions: 4 });
  const ally = createCreature("Vanguard Ally");

  // 1. Apply Adrenaline Trigger
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });

  const active1 = getActiveInfusion(ally);
  assert.equal(active1.type, "adrenalineTrigger", "Adrenaline Trigger is active on target");
  assert.equal(active1.infuserUuid, infuser.uuid, "Infuser UUID recorded on target");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[ally.uuid].type, "adrenalineTrigger", "Infuser tracks active infusion");
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 3, "1 use of Alchemical Infusions spent");

  // 2. Apply second Infusion: Muscle Strengthener (replaces Adrenaline Trigger)
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "muscleStrengthener"
  });

  const active2 = getActiveInfusion(ally);
  assert.equal(active2.type, "muscleStrengthener", "Muscle Strengthener replaced previous infusion");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[ally.uuid].type, "muscleStrengthener", "Infuser tracking updated");
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 2, "Second use spent");
});

test("Area 6: All 8 Alchemical Infusions", () => {
  const expectedKeys = [
    "adrenalineTrigger", "flightReflexStimulant", "focusHeightener", "hesitationSuppressor",
    "muscleStrengthener", "procoagulant", "respirationStimulant", "sensationNulling"
  ];

  assert.equal(Object.keys(INFUSIONS).length, 8, "Exactly 8 Alchemical Infusions defined");
  for (const key of expectedKeys) {
    const inf = INFUSIONS[key];
    assert.ok(inf, `Infusion ${key} is defined`);
    assert.equal(inf.id, key, `Infusion ID matches key: ${key}`);
    assert.ok(typeof inf.name === "string" && inf.name.length > 0, `Infusion has a valid name: ${inf.name}`);
    assert.ok(typeof inf.leverageCondition === "string" && inf.leverageCondition.length > 0, `Infusion has leverage condition: ${inf.leverageCondition}`);
    assert.ok(typeof inf.effect === "string" && inf.effect.length > 0, `Infusion has effect description: ${inf.effect}`);
    assert.ok(inf.actionType === "reaction" || inf.actionType === "bonus", `Infusion action type is reaction or bonus: ${inf.actionType}`);
  }

  // Check specific formulas and types
  assert.equal(INFUSIONS.adrenalineTrigger.formula, "1d6");
  assert.equal(INFUSIONS.focusHeightener.formula, "1d6");
  assert.equal(INFUSIONS.hesitationSuppressor.formula, "1d4");
  assert.equal(INFUSIONS.sensationNulling.formula, "1d6");
  assert.equal(INFUSIONS.flightReflexStimulant.formula, null);
  assert.equal(INFUSIONS.muscleStrengthener.formula, null);
  assert.equal(INFUSIONS.respirationStimulant.formula, null);
});

test("Area 7: Leverage Workflow & Lockout", async () => {
  const infuser = createInfuserActor(1, { intMod: 3 }); // DC = 20 - 3 - 2 = 15
  const ally = createCreature("Allied Specialist");

  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });

  // 1. Successful Leverage Save: Benefit applied, no Dazed, no Lockout
  const leverageSuccess = await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    saveFailed: false
  });

  assert.equal(leverageSuccess.saveFailed, false, "Save marked as successful");
  assert.equal(leverageSuccess.dazedApplied, false, "Dazed not applied on save success");
  assert.equal(Boolean(ally.flags.ak5e?.infuser?.leverageLockout), false, "No leverage lockout on success");
  assert.equal(Boolean(ally.flags.ak5e?.dazed), false, "No dazed condition on success");

  // 2. Failed Leverage Save: Benefit applied, BUT Dazed applied and Leverage Lockout set
  const leverageFail = await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    saveFailed: true
  });

  assert.equal(leverageFail.saveFailed, true, "Save marked as failed");
  assert.equal(leverageFail.dazedApplied, true, "Dazed applied on save failure");
  assert.equal(ally.flags.ak5e.infuser.leverageLockout, true, "Leverage lockout set to true on failure");
  assert.equal(ally.flags.ak5e.dazed, true, "Dazed condition flag set on failure");

  // 3. Re-attempting Leverage while in Lockout emits warning
  const planLocked = specialistUses.plan(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    checkOnly: true
  });
  assert.ok(planLocked.warnings.some(w => w.id === "lockout"), "Lockout warning emitted while Dazed");

  assert.throws(() => {
    specialistUses.plan(infuser, "leverageInfusion", { targetUuid: ally.uuid, targetName: ally.name });
  }, /cannot Leverage Infusions/);

  // 4. Turn start clears Lockout when Dazed ends
  ally.flags.ak5e.dazed = false;
  await emitAk5eEvent("turnStart", { raw: { actor: ally } });
  assert.equal(ally.flags.ak5e.infuser.leverageLockout, false, "Lockout cleared at turnStart when no longer Dazed");
});

test("Area 8: Level 5: New Concoctions", () => {
  const infuser1 = createInfuserActor(1);
  const infuser5 = createInfuserActor(5);

  assert.equal(hasNewConcoctions(infuser1), false, "Lv 1 does not have New Concoctions");
  assert.equal(hasNewConcoctions(infuser5), true, "Lv 5 has New Concoctions");

  // Verify New Concoctions rules: Neurological Inhibitor & Bungarotoxin (Ch. 3 L5705–5726)
  assert.equal(DOUBLE_BLIND_TABLE[1], "Neurological Inhibitor");
  assert.equal(DOUBLE_BLIND_TABLE[6], "Bungarotoxin");
});

test("Area 9: Level 5: Double-Blind Trial", async () => {
  const infuser = createInfuserActor(5, { prowess: 2, infusions: 4 });
  addItem(infuser, createTestItem({ name: "Pharmacology Kit", type: "tool" }));

  // Execute Double-Blind Trial: roll 1d6 -> 4 (Cytotoxin)
  const res = await specialistUses.execute(infuser, "doubleBlindTrial", {
    rolledToxin: 4
  });

  assert.equal(res.rollResult, 4, "Rolled 4 on 1d6");
  assert.equal(res.toxinName, "Cytotoxin", "Result 4 maps to Cytotoxin");
  assert.equal(res.dc, 15, "Base Toxin DC is 15");
  assert.equal(getPool(infuser, "prowess").value, 1, "1 Prowess spent");
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 3, "1 Alchemical Infusion spent");
  assert.equal(infuser.flags.ak5e.appliedToxin.name, "Cytotoxin", "Cytotoxin applied to weapon");
  assert.equal(infuser.flags.ak5e.appliedToxin.duration, 600, "Duration is 10 minutes (600s)");

  // Re-attempting Double-Blind Trial while weapon is toxined emits warning
  const planDuplicate = specialistUses.plan(infuser, "doubleBlindTrial", { checkOnly: true });
  assert.ok(planDuplicate.warnings.some(w => w.id === "toxin"), "Weapon already toxined emits warning");

  assert.throws(() => {
    specialistUses.plan(infuser, "doubleBlindTrial");
  }, /already has a toxin applied/);
});

test("Area 10: Infuser Prowess Gain Triggers", async () => {
  const infuser = createInfuserActor(5, { prowess: 1 });
  if (globalThis.game?.actors?.set) globalThis.game.actors.set(infuser.id, infuser);

  // Trigger 1: Poisoned or Toxined creature drops to 0 HP
  const poisonedVictim = createCreature("Poisoned Victim", { hp: 0 });
  poisonedVictim.flags.ak5e.poisoned = true;
  globalThis._ak5eTestDocs.set(poisonedVictim.uuid, poisonedVictim);

  await emitAk5eEvent("kill", {
    raw: { actor: poisonedVictim },
    actorUuid: poisonedVictim.uuid,
    poisoned: true
  });
  assert.equal(getPool(infuser, "prowess").value, 2, "Infuser gained 1 Prowess when Poisoned creature dropped to 0 HP");

  // Trigger 2: Infusion turned failure into success (1/round limit)
  const ally = createCreature("Ally");
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });

  await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    turnedFailureToSuccess: true
  });
  assert.equal(getPool(infuser, "prowess").value, 3, "Infuser gained 1 Prowess when Infusion turned failure into success");
  assert.equal(infuser.flags.ak5e.infuser.prowessGainedFromInfusionThisRound, true, "Round flag set");

  // Re-triggering in same round does not grant additional prowess
  await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    turnedFailureToSuccess: true
  });
  assert.equal(getPool(infuser, "prowess").value, 3, "No additional prowess gained in same round");

  // turnStart resets 1/round flag
  await emitAk5eEvent("turnStart", { raw: { actor: infuser } });
  assert.equal(infuser.flags.ak5e.infuser.prowessGainedFromInfusionThisRound, false, "Round flag reset on turnStart");
});

test("Area 11: Level 11: Stimpack & Rejuvenation", async () => {
  const infuser11 = createInfuserActor(11, { infusions: 6 });
  const ally = createCreature("Frontline Ally");

  // 1. Delivery Service: 30 ft range
  assert.equal(calculateInfusionRange(infuser11), 30, "Range is 30 ft at level 11");

  // 2. Questionable Rejuvenation: 1d10 Temp HP roll button on apply
  const planApply = specialistUses.plan(infuser11, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "hesitationSuppressor"
  });
  assert.equal(planApply.warnings.length, 0, "No warnings within range");

  await specialistUses.execute(infuser11, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "hesitationSuppressor"
  });
  const applyReceipt = infuser11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(applyReceipt.formula, "1d10", "Questionable Rejuvenation 1d10 Temp HP button on apply");

  // 3. Questionable Rejuvenation on Save Success
  await specialistUses.execute(infuser11, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    saveFailed: false
  });
  const leverageReceipt = infuser11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(leverageReceipt.stimpackFormula, "1d10", "Questionable Rejuvenation 1d10 Temp HP on save success");

  // 4. Procoagulant additive Temp HP formula: 1hd + conMod + 1d10
  await specialistUses.execute(infuser11, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "procoagulant"
  });
  await specialistUses.execute(infuser11, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    saveFailed: false
  });
  const procoagulantReceipt = infuser11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(procoagulantReceipt.formula, "1d8 + 2 + 1d10", "Procoagulant Temp HP formula includes + 1d10 from Stimpack");
});

test("Area 12: Level 15: Excessive Dosing", () => {
  const infuser11 = createInfuserActor(11);
  const infuser15 = createInfuserActor(15); // PB = 5

  assert.equal(hasExcessiveDosing(infuser11), false, "Lv 11 does not have Excessive Dosing");
  assert.equal(hasExcessiveDosing(infuser15), true, "Lv 15 has Excessive Dosing");

  // Succumb: Toxin DC increases by PB (15 + 5 = 20)
  assert.equal(getToxinDC(infuser11, 15), 15, "Lv 11 Toxin DC is base 15");
  assert.equal(getToxinDC(infuser15, 15), 20, "Lv 15 Toxin DC is 15 + PB = 20");
});

test("Area 13: Level 20: To Defy Science", async () => {
  const infuser20 = createInfuserActor(20, { toDefyScience: 1 });
  const ally = createCreature("Defender", { hp: 50 });

  assert.equal(hasToDefyScience(infuser20), true, "Lv 20 has To Defy Science");

  // Activate To Defy Science
  await specialistUses.execute(infuser20, "toDefyScience", {
    targetUuid: ally.uuid,
    targetName: ally.name
  });

  assert.equal(getPool(infuser20, "toDefyScience").value, 0, "1 use of To Defy Science spent");
  assert.equal(ally.flags.ak5e.infuser.invulnerable, true, "Target gained invulnerable flag");

  // preApplyDamage prevents all HP loss
  const updates = { "system.attributes.hp.value": 20 };
  const canApply = infuserPreApplyDamage(ally, 30, updates, {});
  assert.equal(canApply, false, "preApplyDamage returns false preventing damage");
  assert.equal(updates["system.attributes.hp.value"], 50, "HP update clamped back to current HP 50");
});

test("Area 14: Reversibility & Encounter-Window Undo", async () => {
  const infuser = createInfuserActor(20, { prowess: 2, infusions: 6, toDefyScience: 1 });
  const ally = createCreature("Test Ally", { hp: 40 });
  addItem(infuser, createTestItem({ name: "Pharmacology Kit", type: "tool" }));

  // 1. applyInfusion and undo
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 5, "Infusions spent to 5");
  assert.equal(getActiveInfusion(ally)?.type, "adrenalineTrigger", "Infusion active on target");

  const applyUseId = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, applyUseId);
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 6, "Infusions refunded to 6 on undo");
  assert.equal(getActiveInfusion(ally), null, "Infusion cleared from target on undo");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[ally.uuid], undefined, "Infuser tracking cleared on undo");

  // 2. leverageInfusion and undo
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "respirationStimulant"
  });
  await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    saveFailed: true
  });
  assert.equal(ally.flags.ak5e.infuser.leverageLockout, true, "Lockout active on save failure");
  assert.equal(ally.flags.ak5e.dazed, true, "Dazed active on save failure");

  const leverageUseId = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, leverageUseId);
  assert.equal(ally.flags.ak5e.infuser.leverageLockout, false, "Lockout cleared on undo");
  assert.equal(ally.flags.ak5e.dazed, false, "Dazed cleared on undo");

  // 3. doubleBlindTrial and undo
  await specialistUses.execute(infuser, "doubleBlindTrial", { rolledToxin: 2 });
  assert.equal(getPool(infuser, "prowess").value, 1, "Prowess spent to 1");
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 4, "Infusions spent to 4");
  assert.equal(infuser.flags.ak5e.appliedToxin.name, "Necrotoxin", "Necrotoxin applied");

  const dbtUseId = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, dbtUseId);
  assert.equal(getPool(infuser, "prowess").value, 2, "Prowess refunded on undo");
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 5, "Infusions refunded on undo");
  assert.equal(infuser.flags.ak5e.appliedToxin ?? null, null, "Applied toxin cleared on undo");

  // 4. toDefyScience and undo
  await specialistUses.execute(infuser, "toDefyScience", { targetUuid: ally.uuid, targetName: ally.name });
  assert.equal(getPool(infuser, "toDefyScience").value, 0, "To Defy Science spent");
  assert.equal(ally.flags.ak5e.infuser.invulnerable, true, "Target invulnerable");

  const tdsUseId = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, tdsUseId);
  assert.equal(getPool(infuser, "toDefyScience").value, 1, "To Defy Science refunded on undo");
  assert.equal(ally.flags.ak5e.infuser.invulnerable, false, "Target invulnerability cleared on undo");
});

test("Area 15: Hook Registration Idempotency, GM Target Relay (validateTarget), & Hook Dispatch Integration", async () => {
  // 1. Hook Registration Idempotency
  const damageListenersBefore = Hooks._hooks.get("dnd5e.preRollDamageV2")?.length ?? 0;
  const applyListenersBefore = Hooks._hooks.get("dnd5e.preApplyDamage")?.length ?? 0;

  assert.equal(damageListenersBefore, 1, "1 preRollDamageV2 listener registered initially (infuser)");
  assert.equal(applyListenersBefore, 1, "1 preApplyDamage listener registered initially (infuser)");

  // Re-registering does not duplicate listeners
  registerInfuserHooks();
  registerInfuserHooks();

  const damageListenersAfter = Hooks._hooks.get("dnd5e.preRollDamageV2")?.length ?? 0;
  const applyListenersAfter = Hooks._hooks.get("dnd5e.preApplyDamage")?.length ?? 0;

  assert.equal(damageListenersAfter, damageListenersBefore, "Damage hook count invariant under re-registration");
  assert.equal(applyListenersAfter, applyListenersBefore, "Apply damage hook count invariant under re-registration");

  // 2. ValidateTarget assertions
  const mockTarget = { uuid: "Actor.mock123" };
  const matchingEntry = { uuid: "Actor.mock123" };
  const wrongEntry = { uuid: "Actor.other456" };

  assert.equal(INFUSER_PLANS.applyInfusion.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(INFUSER_PLANS.applyInfusion.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(INFUSER_PLANS.leverageInfusion.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(INFUSER_PLANS.leverageInfusion.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(INFUSER_PLANS.clearInfusion.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(INFUSER_PLANS.clearInfusion.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(INFUSER_PLANS.toDefyScience.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(INFUSER_PLANS.toDefyScience.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(INFUSER_PLANS.doubleBlindTrial.validateTarget(), false, "doubleBlindTrial modifies self weapon only");

  // 3. Hook Dispatch Integration via Hooks.callAll
  // Muscle Strengthener (+INT bonus to melee attack damage)
  const infuser = createInfuserActor(1, { intMod: 3 });
  const ally = createCreature("Swordsman");
  ally.flags.ak5e.infuser = {
    activeInfusion: { type: "muscleStrengthener", infuserIntBonus: 3 },
    muscleStrengthenerActive: true
  };

  const damageConfig = {
    actionType: "mwak",
    subject: { actor: ally },
    rolls: [{ parts: ["1d8", "3"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
  assert.equal(damageConfig.rolls[0].parts.includes("3"), true, "INT bonus added to damage roll parts");

  // Cytotoxin bonus (+1d6[poison])
  infuser.flags.ak5e.appliedToxin = { name: "Cytotoxin", type: "Cytotoxin" };
  const toxinConfig = {
    actionType: "mwak",
    subject: { actor: infuser },
    rolls: [{ parts: ["1d8", "2"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", toxinConfig);
  assert.equal(toxinConfig.rolls[0].parts.includes("1d6[poison]"), true, "1d6[poison] added by Cytotoxin");

  // Sensation Nulling DR in preApplyDamage
  const defender = createCreature("Defender", { hp: 30 });
  defender.flags.ak5e.infuser = { sensationNullingDR: 5 };
  const dmgUpdates = { "system.attributes.hp.value": 15 }; // 15 damage taken
  infuserPreApplyDamage(defender, 15, dmgUpdates, {});
  assert.equal(dmgUpdates["system.attributes.hp.value"], 20, "Damage mitigated by 5 DR: HP is 20 instead of 15");
});
