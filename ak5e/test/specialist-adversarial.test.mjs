import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem,
  triggerShortRest, triggerLongRest
} from "./base-classes-fixture.mjs";
import {
  SPECIALIST_CLASS_ID, pbForLevel, checkLevel, hitPointsAtLevel,
  specialistDC, martialDC, weaponMasteryMeleeBonus, weaponMasteryRangedBonus,
  MELEE_FIGHTING_STYLES, RANGED_FIGHTING_STYLES, ALL_FIGHTING_STYLES
} from "../scripts/specialist-rules.mjs";
import {
  hasWeaponSpecialisation, getWeaponSpecialisation, hasShowYourStyle,
  hasWeaponAdept, hasWeaponExpertise, hasFallingUpwards,
  hasWeaponMastery, defineSpecialistPools, onSpecialistRest, registerSpecialistHooks
} from "../scripts/specialist-features.mjs";
import { specialistUses } from "../scripts/specialist-uses.mjs";
import { getPool, refundPool, spendPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { getReactions, spendReaction } from "../scripts/trigger-events.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function createSpecialist(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: {
        prof: pbForLevel(level),
        hp: { value: 30, max: 30, temp: 0 }
      },
      abilities: {
        str: { mod: 1, value: 12 },
        dex: { mod: 3, value: 16 },
        con: { mod: 2, value: 14 },
        int: { mod: 1, value: 12 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 },
        ...(options.abilities ?? {})
      },
      ...options.system
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "duelling",
          ...(options.specialistFlags ?? {})
        }
      }
    }
  });
  return actor;
}

/* ==========================================================================
   1. Prowess Resource Pool: Bounds, Scaling, Recovery, Overrides
   ========================================================================== */

test("ADV-PROW-1: Prowess pool max scales strictly with Proficiency Bonus across levels 1–20", () => {
  for (let lvl = 1; lvl <= 20; lvl++) {
    const actor = createSpecialist(lvl);
    const expectedPB = Math.floor((lvl - 1) / 4) + 2;
    const pool = getPool(actor, "prowess");
    assert.equal(pool.id, "prowess");
    assert.equal(pool.max, expectedPB, `Level ${lvl} Specialist must have prowess max = ${expectedPB}`);
  }
});

test("ADV-PROW-2: Initial Prowess value is 0, requiring rest or refund before use", () => {
  const actor = createSpecialist(4);
  const pool = getPool(actor, "prowess");
  assert.equal(pool.value, 0, "Initial Prowess value must be 0");
  assert.equal(pool.max, 2, "Level 4 Specialist PB is 2");
});

test("ADV-PROW-3A: Short Rest restores 1 Prowess and Long Rest restores 1 Prowess (bounded at max)", async () => {
  const actor = createSpecialist(8); // PB = 3, max = 3
  assert.equal(getPool(actor, "prowess").value, 0);

  // Short rest #1: 0 -> 1
  await onSpecialistRest(actor, "short");
  assert.equal(getPool(actor, "prowess").value, 1, "Short rest should add 1 Prowess");

  // Short rest #2: 1 -> 2
  await onSpecialistRest(actor, "short");
  assert.equal(getPool(actor, "prowess").value, 2, "Second short rest should add 1 Prowess");

  // Long rest #1: 2 -> 3 (adds exactly 1, not full reset to max, not 2)
  await onSpecialistRest(actor, "long");
  assert.equal(getPool(actor, "prowess").value, 3, "Long rest should add 1 Prowess (reaching max 3)");

  // Short rest #3 at max: 3 -> 3 (bounded at max)
  await onSpecialistRest(actor, "short");
  assert.equal(getPool(actor, "prowess").value, 3, "Short rest at max must remain clamped at max");

  // Long rest #2 at max: 3 -> 3 (bounded at max)
  await onSpecialistRest(actor, "long");
  assert.equal(getPool(actor, "prowess").value, 3, "Long rest at max must remain clamped at max");
});

test("ADV-PROW-3B: Rest via dnd5e.restCompleted hook recovers exactly 1 Prowess (no duplicate hook)", async () => {
  const { registerResourcePoolHooks } = await import("../scripts/resource-pools.mjs");
  registerResourcePoolHooks();
  registerSpecialistHooks();
  const actor = createSpecialist(6); // PB = 3, max = 3
  assert.equal(getPool(actor, "prowess").value, 0);

  await triggerShortRest(actor);
  assert.equal(getPool(actor, "prowess").value, 1,
    "Rest via hooks recovers exactly 1 Prowess (no duplicate hook registration)");
});

test("ADV-PROW-4: Pre-level 4 actors do not gain Prowess on rests", async () => {
  const actor = createSpecialist(3); // Level 3: Show Your Style not yet unlocked
  assert.equal(hasShowYourStyle(actor), false);

  await onSpecialistRest(actor, "short");
  assert.equal(getPool(actor, "prowess").value, 0, "Level 3 actor must not regain Prowess on short rest");

  await onSpecialistRest(actor, "long");
  assert.equal(getPool(actor, "prowess").value, 0, "Level 3 actor must not regain Prowess on long rest");
});

test("ADV-PROW-5: Zero-floor clamping on overspend and shortfall warnings with overrides", async () => {
  const actor = createSpecialist(4); // max 2, value 0

  // 1. Un-overridden attempt with 0 prowess raises PlayWarnings with shortfall
  assert.throws(() => {
    specialistUses.plan(actor, "markOfASpecialist", { skill: "acr", skillName: "Acrobatics" });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "shortfall"));
    return true;
  });

  // 2. Overridden execution clamps at 0 and reports shortfall in receipt
  const opId = "adv-prow-shortfall-op";
  const result = await specialistUses.execute(actor, "markOfASpecialist", {
    skill: "acr",
    skillName: "Acrobatics",
    overrides: ["shortfall"]
  }, opId);

  assert.ok(result);
  assert.equal(getPool(actor, "prowess").value, 0, "Value clamped at 0");
  const receipt = specialistUses.receipt(actor, opId);
  assert.ok(receipt.shortfalls?.some(s => s.includes("Prowess short by 1")));
});

/* ==========================================================================
   2. Mark of a Specialist (Show Your Style): Spend, Refund, and No-Refund
   ========================================================================== */

test("ADV-MOS-1: Spend 1 Prowess on proficient ability check reroll", async () => {
  const actor = createSpecialist(4);
  await refundPool(actor, "prowess", 2); // set to 2
  assert.equal(getPool(actor, "prowess").value, 2);

  const opId = "adv-mos-spend-op";
  const result = await specialistUses.execute(actor, "markOfASpecialist", {
    skill: "ste",
    skillName: "Stealth"
  }, opId);

  assert.ok(result);
  assert.equal(result.prowessCost, 1);
  assert.equal(result.skill, "ste");
  assert.equal(getPool(actor, "prowess").value, 1, "Pool decremented by 1");

  const receipt = specialistUses.receipt(actor, opId);
  assert.equal(receipt.resources[0].before, 2);
  assert.equal(receipt.resources[0].after, 1);
  assert.ok(receipt.summary.includes("expended 1 Prowess to reroll a failed Stealth Check"));
});

test("ADV-MOS-2: Refund of 1 Prowess if second roll is also a failure", async () => {
  const actor = createSpecialist(4);
  await refundPool(actor, "prowess", 2);

  // Spend 1 for initial reroll
  await specialistUses.execute(actor, "markOfASpecialist", { skill: "prc", skillName: "Perception" }, "mos-op-1");
  assert.equal(getPool(actor, "prowess").value, 1);

  // Second roll also failed: invoke refundMarkOfASpecialist
  const refundOp = "adv-mos-refund-op";
  const refundResult = await specialistUses.execute(actor, "refundMarkOfASpecialist", {}, refundOp);
  assert.ok(refundResult);
  assert.equal(refundResult.refundedProwess, 1);
  assert.equal(getPool(actor, "prowess").value, 2, "Prowess restored to 2 after refund");

  const receipt = specialistUses.receipt(actor, refundOp);
  assert.ok(receipt.summary.includes("1 Prowess has been refunded"));
});

test("ADV-MOS-3: Successful second roll results in no refund (Prowess remains spent)", async () => {
  const actor = createSpecialist(4);
  await refundPool(actor, "prowess", 2);

  // Spend 1 for initial reroll
  await specialistUses.execute(actor, "markOfASpecialist", { skill: "ak5etech", skillName: "Tech" }, "mos-success-op");
  assert.equal(getPool(actor, "prowess").value, 1);

  // Reroll succeeded: no refund executed; verify Prowess remains 1
  assert.equal(getPool(actor, "prowess").value, 1, "Prowess remains spent on success");
});

test("ADV-MOS-4: Level requirement check (Level < 4 triggers level warning)", () => {
  const actor = createSpecialist(3); // Level 3

  assert.throws(() => {
    specialistUses.plan(actor, "markOfASpecialist", { skill: "acr", skillName: "Acrobatics" });
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "level"));
    return true;
  });
});

/* ==========================================================================
   3. Falling Upwards / It's All Skill: Auto-Success, Reaction, Shortfalls
   ========================================================================== */

test("ADV-FU-1: Spend 3 Prowess and 1 reaction to auto-succeed on saving throw", async () => {
  const actor = createSpecialist(17); // PB = 6, max = 6
  await refundPool(actor, "prowess", 6);
  assert.equal(getPool(actor, "prowess").value, 6);

  const opId = "adv-fu-exec-op";
  const result = await specialistUses.execute(actor, "itsAllSkill", {}, opId);

  assert.ok(result);
  assert.equal(result.autoSuccess, true);
  assert.equal(result.minRollRequired, true);
  assert.equal(getPool(actor, "prowess").value, 3, "6 - 3 = 3 Prowess remaining");

  const receipt = specialistUses.receipt(actor, opId);
  assert.equal(receipt.reaction?.spent, true, "Reaction consumed");
  assert.ok(receipt.summary.includes("expended 3 Prowess as a Reaction to auto-succeed"));
});

test("ADV-FU-2: Level < 17 triggers level warning", () => {
  const actor = createSpecialist(16);
  assert.equal(hasFallingUpwards(actor), false);

  assert.throws(() => {
    specialistUses.plan(actor, "itsAllSkill", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "level"));
    return true;
  });
});

test("ADV-FU-3: Shortfall behavior when Prowess < 3 (warns and clamps at 0 if overridden)", async () => {
  // Test with Prowess = 1 (short by 2)
  const actor1 = createSpecialist(17);
  await refundPool(actor1, "prowess", 1);
  assert.equal(getPool(actor1, "prowess").value, 1);

  assert.throws(() => {
    specialistUses.plan(actor1, "itsAllSkill", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "shortfall"));
    return true;
  });

  const opId1 = "adv-fu-shortfall-1";
  await specialistUses.execute(actor1, "itsAllSkill", { overrides: ["shortfall"] }, opId1);
  assert.equal(getPool(actor1, "prowess").value, 0, "Clamped at 0 (not negative)");
  const receipt1 = specialistUses.receipt(actor1, opId1);
  assert.ok(receipt1.shortfalls?.some(s => s.includes("Prowess short by 2")));

  // Test with Prowess = 0 (short by 3)
  const actor0 = createSpecialist(17);
  assert.equal(getPool(actor0, "prowess").value, 0);

  const opId0 = "adv-fu-shortfall-0";
  await specialistUses.execute(actor0, "itsAllSkill", { overrides: ["shortfall"] }, opId0);
  assert.equal(getPool(actor0, "prowess").value, 0, "Clamped at 0");
  const receipt0 = specialistUses.receipt(actor0, opId0);
  assert.ok(receipt0.shortfalls?.some(s => s.includes("Prowess short by 3")));
});

test("ADV-FU-4: Reaction already spent triggers reaction warning for itsAllSkill", async () => {
  const actor = createSpecialist(17);
  await refundPool(actor, "prowess", 6);

  // Spend reaction so available becomes 0
  await spendReaction(actor, { triggerId: "previous-reaction" });
  assert.equal(getReactions(actor).available, 0, "Reaction is expended (available: 0)");

  // Without override: throws PlayWarnings because reaction warning is emitted
  assert.throws(() => {
    specialistUses.plan(actor, "itsAllSkill", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "reaction" || w.code === "reaction"), "Warning id must be reaction");
    return true;
  });

  // With override: succeeds and plan reflects reaction warning
  const plan = specialistUses.plan(actor, "itsAllSkill", { overrides: ["reaction"] });
  assert.ok(plan.warnings.some(w => w.id === "reaction" || w.code === "reaction"), "Plan records reaction warning");
});

/* ==========================================================================
   4. Weapon Adept, Weapon Expertise, Weapon Mastery Across Melee vs Ranged
   ========================================================================== */

test("ADV-WEAP-1: Level unlock gates for all weapon progression tiers", () => {
  const lv1 = createSpecialist(1);
  const lv5 = createSpecialist(5);
  const lv6 = createSpecialist(6);
  const lv11 = createSpecialist(11);
  const lv12 = createSpecialist(12);
  const lv17 = createSpecialist(17);
  const lv18 = createSpecialist(18);

  // Weapon Specialisation (Lv 1)
  assert.equal(hasWeaponSpecialisation(lv1), true);

  // Weapon Adept (Lv 6)
  assert.equal(hasWeaponAdept(lv5), false);
  assert.equal(hasWeaponAdept(lv6), true);

  // Weapon Expertise (Lv 12)
  assert.equal(hasWeaponExpertise(lv11), false);
  assert.equal(hasWeaponExpertise(lv12), true);

  // Weapon Mastery (Lv 18)
  assert.equal(hasWeaponMastery(lv17), false);
  assert.equal(hasWeaponMastery(lv18), true);
});

test("ADV-WEAP-2: Weapon Expertise Melee vs Ranged choice enforcement and bonus", async () => {
  // Melee Specialist at Level 12
  const meleeActor = createSpecialist(12, { weaponCategory: "melee" });
  await refundPool(meleeActor, "prowess", 4);

  const meleeResult = await specialistUses.execute(meleeActor, "weaponExpertiseMelee");
  assert.ok(meleeResult);
  assert.equal(meleeResult.bonusDice, 1, "Melee expertise rolls 1 additional damage die");
  assert.equal(meleeResult.actionType, "bonusAction");
  assert.equal(getPool(meleeActor, "prowess").value, 3);

  // Ranged Specialist at Level 12
  const rangedActor = createSpecialist(12, { weaponCategory: "ranged" });
  await refundPool(rangedActor, "prowess", 4);

  const rangedResult = await specialistUses.execute(rangedActor, "weaponExpertiseRanged");
  assert.ok(rangedResult);
  assert.equal(rangedResult.advantage, true, "Ranged expertise grants Advantage");
  assert.equal(rangedResult.actionType, "bonusAction");
  assert.equal(getPool(rangedActor, "prowess").value, 3);

  // Category mismatch: Melee using Ranged Expertise triggers warning
  assert.throws(() => {
    specialistUses.plan(meleeActor, "weaponExpertiseRanged", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "specialisation"));
    return true;
  });

  // Category mismatch: Ranged using Melee Expertise triggers warning
  assert.throws(() => {
    specialistUses.plan(rangedActor, "weaponExpertiseMelee", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "specialisation"));
    return true;
  });
});

test("ADV-WEAP-3: Weapon Mastery Melee bonus scales to floor(level / 2)", async () => {
  // Level 18 melee: bonus = floor(18 / 2) = 9
  const m18 = createSpecialist(18, { weaponCategory: "melee" });
  const res18 = await specialistUses.execute(m18, "weaponMasteryMelee");
  assert.equal(res18.damageBonus, 9);
  assert.equal(res18.frequency, "oncePerTurn");

  // Level 19 melee: bonus = floor(19 / 2) = 9
  const m19 = createSpecialist(19, { weaponCategory: "melee" });
  const res19 = await specialistUses.execute(m19, "weaponMasteryMelee");
  assert.equal(res19.damageBonus, 9);

  // Level 20 melee: bonus = floor(20 / 2) = 10
  const m20 = createSpecialist(20, { weaponCategory: "melee" });
  const res20 = await specialistUses.execute(m20, "weaponMasteryMelee");
  assert.equal(res20.damageBonus, 10);

  // Level warning if < 18
  const m17 = createSpecialist(17, { weaponCategory: "melee" });
  assert.throws(() => {
    specialistUses.plan(m17, "weaponMasteryMelee", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "level"));
    return true;
  });
});

test("ADV-WEAP-4: Weapon Mastery Ranged bonus doubles PB (+PB attack bonus)", async () => {
  // Level 18 ranged: PB = 6, attack bonus = 6
  const r18 = createSpecialist(18, { weaponCategory: "ranged" });
  const res18 = await specialistUses.execute(r18, "weaponMasteryRanged");
  assert.equal(res18.attackBonus, 6);
  assert.equal(res18.frequency, "oncePerTurn");

  // Level 20 ranged: PB = 6, attack bonus = 6
  const r20 = createSpecialist(20, { weaponCategory: "ranged" });
  const res20 = await specialistUses.execute(r20, "weaponMasteryRanged");
  assert.equal(res20.attackBonus, 6);

  // Level warning if < 18
  const r17 = createSpecialist(17, { weaponCategory: "ranged" });
  assert.throws(() => {
    specialistUses.plan(r17, "weaponMasteryRanged", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "level"));
    return true;
  });
});

test("ADV-WEAP-5A: Defensive Fighting Style emits reaction warning when reaction is spent", async () => {
  const actor = createSpecialist(1, { fightingStyle: "defensive" });
  await spendReaction(actor, { triggerId: "prior-action" });
  assert.equal(getReactions(actor).available, 0, "Reaction is exhausted");

  // Without override: throws PlayWarnings
  assert.throws(() => {
    specialistUses.plan(actor, "defensiveStyle", {});
  }, err => {
    assert.ok(err.warnings?.some(w => w.id === "reaction" || w.code === "reaction"), "Warning id must be reaction");
    return true;
  });

  // With override: succeeds and plan records reaction warning
  const plan = specialistUses.plan(actor, "defensiveStyle", { overrides: ["reaction"] });
  assert.ok(plan.warnings.some(w => w.id === "reaction" || w.code === "reaction"), "Plan records reaction warning");
});

test("ADV-WEAP-5B: Defensive Fighting Style reaction consumption and clean reversible undo", async () => {
  const actor = createSpecialist(1, { fightingStyle: "defensive" });
  assert.equal(getReactions(actor).available, 1);

  const opId = "adv-def-style-op";
  const result = await specialistUses.execute(actor, "defensiveStyle", {}, opId);
  assert.ok(result);
  assert.equal(result.acBonusFormula, "1d4");
  assert.equal(getReactions(actor).available, 0, "Reaction consumed");

  const receipt = specialistUses.receipt(actor, opId);
  assert.equal(receipt.reaction?.spent, true);

  // Undo restores reaction
  await specialistUses.undo(actor, opId);
  assert.equal(getReactions(actor).available, 1, "Reaction restored upon undo");
});

/* ==========================================================================
   5. Table-Play Undo Invariants & Multi-Action Receipts
   ========================================================================== */

test("ADV-UNDO-1: Every active feature generates an undo receipt in flags.ak5e.specialistUses.undo", async () => {
  const actor = createSpecialist(18, { weaponCategory: "melee" });
  await refundPool(actor, "prowess", 6);

  const opId = "adv-undo-receipt-check";
  await specialistUses.execute(actor, "weaponExpertiseMelee", {}, opId);

  const undoStack = actor.flags?.ak5e?.specialistUses?.undo;
  assert.ok(Array.isArray(undoStack), "Undo stack must be an array under flags.ak5e.specialistUses.undo");
  const receipt = undoStack.find(r => r.id === opId);
  assert.ok(receipt, "Receipt with matching opId found in undo stack");
  assert.equal(receipt.status, "complete");
  assert.ok(receipt.epoch !== undefined, "Epoch must be recorded");
  assert.equal(receipt.resources?.length, 1);
  assert.equal(receipt.resources[0].pool, "prowess");
  assert.equal(receipt.resources[0].before, 6);
  assert.equal(receipt.resources[0].after, 5);
});

test("ADV-UNDO-2: Sequential multi-action execution and clean reversible undo restoration", async () => {
  const actor = createSpecialist(18, { weaponCategory: "melee" });
  await refundPool(actor, "prowess", 6);
  assert.equal(getPool(actor, "prowess").value, 6);
  assert.equal(getReactions(actor).available, 1);

  // Action 1: Mark of a Specialist (costs 1)
  const op1 = "seq-op-1";
  await specialistUses.execute(actor, "markOfASpecialist", { skill: "ste", skillName: "Stealth" }, op1);
  assert.equal(getPool(actor, "prowess").value, 5);

  // Action 2: Weapon Expertise Melee (costs 1)
  const op2 = "seq-op-2";
  await specialistUses.execute(actor, "weaponExpertiseMelee", {}, op2);
  assert.equal(getPool(actor, "prowess").value, 4);

  // Action 3: Falling Upwards (costs 3, consumes reaction)
  const op3 = "seq-op-3";
  await specialistUses.execute(actor, "itsAllSkill", {}, op3);
  assert.equal(getPool(actor, "prowess").value, 1);
  assert.equal(getReactions(actor).available, 0);

  // Undo Action 3: restores 3 Prowess (1 -> 4) and restores reaction (0 -> 1)
  await specialistUses.undo(actor, op3);
  assert.equal(getPool(actor, "prowess").value, 4);
  assert.equal(getReactions(actor).available, 1);

  // Undo Action 2: restores 1 Prowess (4 -> 5)
  await specialistUses.undo(actor, op2);
  assert.equal(getPool(actor, "prowess").value, 5);

  // Undo Action 1: restores 1 Prowess (5 -> 6)
  await specialistUses.undo(actor, op1);
  assert.equal(getPool(actor, "prowess").value, 6);
  assert.equal(getReactions(actor).available, 1);
});

test("ADV-UNDO-3: Undo with shortfall override correctly restores 'before' value, not theoretical cost", async () => {
  const actor = createSpecialist(17);
  await refundPool(actor, "prowess", 1); // Only 1 Prowess
  assert.equal(getPool(actor, "prowess").value, 1);

  // Spend 3 on itsAllSkill with shortfall override: clamps to 0 (spent 1)
  const opId = "adv-undo-shortfall-op";
  await specialistUses.execute(actor, "itsAllSkill", { overrides: ["shortfall"] }, opId);
  assert.equal(getPool(actor, "prowess").value, 0);

  // Undo must restore back to 1 (the 'before' value), not 3!
  await specialistUses.undo(actor, opId);
  assert.equal(getPool(actor, "prowess").value, 1, "Undo restored exact before value of 1");
});

test("ADV-PROG-STYLE: previewSpecialistProgression cross-validates fightingStyle against weaponCategory", async () => {
  const { previewSpecialistProgression } = await import("../scripts/specialist-progression.mjs");
  const actor = createSpecialist(1);

  // Melee specialist attempting to select Ranged fighting style ("ranger")
  const planMeleeRanger = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "ranger",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" } }
  });
  assert.equal(planMeleeRanger.valid, false);
  assert.ok(planMeleeRanger.pending.includes("fightingStyle"), "Melee with Ranged style must be pending");

  // Ranged specialist attempting to select Melee fighting style ("duelling")
  const planRangedDuelling = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "ranged",
    fightingStyle: "duelling",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" } }
  });
  assert.equal(planRangedDuelling.valid, false);
  assert.ok(planRangedDuelling.pending.includes("fightingStyle"), "Ranged with Melee style must be pending");

  // Valid Melee with Melee style ("duelling")
  const planMeleeValid = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "duelling",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" } }
  });
  assert.equal(planMeleeValid.valid, true);
  assert.equal(planMeleeValid.pending.length, 0);
});
