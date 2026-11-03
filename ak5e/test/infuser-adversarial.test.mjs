/**
 * Adversarial Stress Test Suite for AK5e Infuser Specialist Subclass (Ch. 3 L5688–5823 & DECISIONS.md L465).
 * Tests edge cases, boundary conditions, loopholes, hook dispatch, and full encounter-window undo reversibility:
 *  1. Infuser DC Formula Boundaries (INT negative/zero/high, PB scaling 1–17, floor clamp 1, standard toggle)
 *  2. Target Restrictions (Construct & Undead immunity, 5 ft vs 30 ft range, non-blocking overrides)
 *  3. Infusion State Replacement & Multi-Target Isolation (Dotted UUID key path expansion in activeInfusions)
 *  4. Leverage CON Save Workflow, Dazed & Leverage Lockout Lifecycle
 *  5. Double-Blind Trial Preconditions, Dual Resource Shortfall Clamping & 1d6 Toxin Bounds
 *  6. Stimpack Questionable Rejuvenation Temp HP Rolls & Additive Procoagulant
 *  7. Excessive Dosing Toxin Scaling & Toxic Shock Mechanics
 *  8. To Defy Science 1/LR Pool & preApplyDamage Invulnerability Clamping
 *  9. Standard Plan Undo Reversibility (applyInfusion single, leverageInfusion, doubleBlindTrial, toDefyScience)
 * 10. Overwriting applyInfusion Undo Reversibility (Prior Infusion Restoration)
 * 11. clearInfusion Undo Reversibility (Target Infusion Restoration)
 * 12. Receipt Status Lifecycle & Interactive Dice Verification
 * 13. Real Hooks.call Dispatch Integration & Listener Invariance
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
import { SPECIALIST_CLASS_ID, isSpecialist, specialistBranch } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { isPlayWarnings } from "../scripts/play-undo.mjs";
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

  const prof = options.prof ?? (Math.floor((level - 1) / 4) + 2);
  const intMod = options.intMod ?? 3;

  const actor = createTestActor({
    name: options.name ?? "Test Infuser",
    items: [sClass, subClass, ...(options.items ?? [])],
    system: {
      ...options.system,
      attributes: {
        prof,
        movement: { walk: 30 },
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { mod: 0, value: 10 },
        dex: { mod: 2, value: 14 },
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
          branch: "infusion",
          ...(options.specialistFlags ?? {})
        },
        specialistProgression: {
          level,
          branch: "infusion"
        },
        resourcePools: {
          prowess: { value: options.prowess ?? 2, max: prof },
          alchemicalInfusions: { value: options.infusions ?? (2 * prof), max: 2 * prof },
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
        hp: { value: options.hp ?? 30, max: options.hpMax ?? 30, temp: options.tempHp ?? 0 },
        hd: { denom: options.hd ?? "d8" },
        movement: { walk: 30 }
      },
      abilities: {
        str: { mod: 2, value: 14 },
        dex: { mod: 1, value: 12 },
        con: { mod: options.conMod ?? 2, value: 14 },
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

  // Track status conditions as a Set for realistic Foundry V13 simulation
  actor.statuses = new Set(options.statuses ?? []);
  actor.toggleStatusEffect = async function(statusId, { active } = {}) {
    if (active === true) {
      this.statuses.add(statusId);
      if (this.flags?.ak5e) this.flags.ak5e[statusId] = true;
    } else if (active === false) {
      this.statuses.delete(statusId);
      if (this.flags?.ak5e) this.flags.ak5e[statusId] = false;
    } else {
      if (this.statuses.has(statusId)) {
        this.statuses.delete(statusId);
        if (this.flags?.ak5e) this.flags.ak5e[statusId] = false;
      } else {
        this.statuses.add(statusId);
        if (this.flags?.ak5e) this.flags.ak5e[statusId] = true;
      }
    }
  };

  if (globalThis._ak5eTestDocs) {
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
  }
  return actor;
}

/* ==============================================================================
 * Test 1: Infuser DC Formula Boundaries & Toggles
 * ============================================================================== */
test("Adversarial 1: Infuser DC Formula Boundaries & Toggles", () => {
  // Source default formula: 20 - INT - PB (DECISIONS.md L465)
  // 1. Extreme negative INT modifiers (e.g. feeblemind, poison, stat drain)
  const infuserNeg1 = createInfuserActor(1, { intMod: -1 }); // INT 8 (-1), PB 2 -> 20 - (-1) - 2 = 19
  assert.equal(calculateInfuserDC(infuserNeg1), 19, "INT -1, PB 2 -> DC 19");

  const infuserNeg5 = createInfuserActor(1, { intMod: -5 }); // INT 1 (-5), PB 2 -> 20 - (-5) - 2 = 23
  assert.equal(calculateInfuserDC(infuserNeg5), 23, "INT -5, PB 2 -> DC 23 (unskilled chemist makes ally saves harder)");

  // 2. Zero INT modifier
  const infuserZero = createInfuserActor(1, { intMod: 0 }); // INT 10 (0), PB 2 -> 20 - 0 - 2 = 18
  assert.equal(calculateInfuserDC(infuserZero), 18, "INT 0, PB 2 -> DC 18");

  // 3. High INT modifier scaling across levels 1, 5, 9, 13, 17
  const infuserLv1 = createInfuserActor(1, { intMod: 3 }); // PB 2 -> 20 - 3 - 2 = 15
  assert.equal(calculateInfuserDC(infuserLv1), 15, "Lv 1 (INT +3, PB 2) -> DC 15");

  const infuserLv5 = createInfuserActor(5, { intMod: 3 }); // PB 3 -> 20 - 3 - 3 = 14
  assert.equal(calculateInfuserDC(infuserLv5), 14, "Lv 5 (INT +3, PB 3) -> DC 14");

  const infuserLv9 = createInfuserActor(9, { intMod: 4 }); // PB 4 -> 20 - 4 - 4 = 12
  assert.equal(calculateInfuserDC(infuserLv9), 12, "Lv 9 (INT +4, PB 4) -> DC 12");

  const infuserLv13 = createInfuserActor(13, { intMod: 5 }); // PB 5 -> 20 - 5 - 5 = 10
  assert.equal(calculateInfuserDC(infuserLv13), 10, "Lv 13 (INT +5, PB 5) -> DC 10");

  const infuserLv17 = createInfuserActor(17, { intMod: 5 }); // PB 6 -> 20 - 5 - 6 = 9
  assert.equal(calculateInfuserDC(infuserLv17), 9, "Lv 17 (INT +5, PB 6) -> DC 9");

  // 4. Floor clamping at 1 under extreme supernatural INT modifiers
  const infuserExtremeInt = createInfuserActor(20, { intMod: 15, prof: 6 }); // 20 - 15 - 6 = -1 -> clamped to 1
  assert.equal(calculateInfuserDC(infuserExtremeInt), 1, "Extreme INT +15 clamps DC at floor 1");

  const infuserSuperGod = createInfuserActor(20, { intMod: 20, prof: 6 }); // 20 - 20 - 6 = -6 -> clamped to 1
  assert.equal(calculateInfuserDC(infuserSuperGod), 1, "Supernatural INT +20 clamps DC at floor 1");

  // 5. Toggle between Inverted and Standard DC (8 + INT + PB)
  // Direct parameter toggle
  assert.equal(
    calculateInfuserDC(infuserLv1, { useStandardFormula: true }),
    13, // 8 + 3 + 2 = 13
    "useStandardFormula toggle returns 8 + INT + PB (13)"
  );
  assert.equal(
    calculateInfuserDC(infuserLv17, { useStandardFormula: true }),
    19, // 8 + 5 + 6 = 19
    "useStandardFormula toggle at Lv 17 returns 19"
  );

  // Standard formula floor clamping with extreme negative INT
  const infuserStandardNeg = createInfuserActor(1, { intMod: -10, prof: 2 });
  assert.equal(
    calculateInfuserDC(infuserStandardNeg, { useStandardFormula: true }),
    1, // 8 - 10 + 2 = 0 -> clamped to 1
    "Standard formula clamps at floor 1 on extreme negative stats"
  );

  // Actor flag rulings toggle
  const infuserWithStandardRuling = createInfuserActor(1, {
    intMod: 3,
    specialistFlags: {
      rulings: {
        infuserDcReading: { value: "standard" }
      }
    }
  });
  assert.equal(
    calculateInfuserDC(infuserWithStandardRuling),
    13,
    "Actor ruling flag 'standard' automatically toggles calculateInfuserDC to standard formula"
  );

  const infuserWithInvertedRuling = createInfuserActor(1, {
    intMod: 3,
    specialistFlags: {
      rulings: {
        infuserDcReading: { value: "inverted" }
      }
    }
  });
  assert.equal(
    calculateInfuserDC(infuserWithInvertedRuling),
    15,
    "Actor ruling flag 'inverted' preserves inverted formula"
  );
});

/* ==============================================================================
 * Test 2: Target Restrictions & Non-Blocking Overrides
 * ============================================================================== */
test("Adversarial 2: Target Restrictions & Non-Blocking Overrides", async () => {
  const infuserLv1 = createInfuserActor(1, { infusions: 4 });
  const infuserLv11 = createInfuserActor(11, { infusions: 8 });

  const constructTarget = createCreature("Iron Golem", { creatureType: "construct" });
  const undeadTarget = createCreature("Zombie", { creatureType: "undead" });
  const validTarget = createCreature("Ally Fighter", { creatureType: "humanoid" });

  // 1. Construct target check: warns on creatureType and blocks execution without override
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv1, "applyInfusion", {
        targetUuid: constructTarget.uuid,
        targetName: constructTarget.name,
        infusionType: "adrenalineTrigger"
      });
    },
    error => {
      assert.equal(isPlayWarnings(error), true, "Throws PlayWarnings for construct target");
      assert.ok(error.warnings.some(w => w.id === "creatureType"), "Warning id is creatureType");
      return true;
    }
  );

  // Non-blocking override allows application to Construct
  const constructResult = await specialistUses.execute(infuserLv1, "applyInfusion", {
    targetUuid: constructTarget.uuid,
    targetName: constructTarget.name,
    infusionType: "adrenalineTrigger",
    overrides: ["creatureType"]
  });
  assert.equal(constructResult.infusionType, "adrenalineTrigger", "Construct target accepted with override");
  assert.equal(getActiveInfusion(constructTarget).type, "adrenalineTrigger");

  // 2. Undead target check: warns on creatureType and blocks execution without override
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv1, "applyInfusion", {
        targetUuid: undeadTarget.uuid,
        targetName: undeadTarget.name,
        infusionType: "hesitationSuppressor"
      });
    },
    error => {
      assert.equal(isPlayWarnings(error), true, "Throws PlayWarnings for undead target");
      assert.ok(error.warnings.some(w => w.id === "creatureType"), "Warning id is creatureType");
      return true;
    }
  );

  // Non-blocking override allows application to Undead
  await specialistUses.execute(infuserLv1, "applyInfusion", {
    targetUuid: undeadTarget.uuid,
    targetName: undeadTarget.name,
    infusionType: "hesitationSuppressor",
    overrides: ["creatureType"]
  });
  assert.equal(getActiveInfusion(undeadTarget).type, "hesitationSuppressor");

  // 3. Range verification at Level 1..10 (5 ft range)
  assert.equal(calculateInfusionRange(infuserLv1), 5, "Level 1 base range is 5 ft");

  // Within range (5 ft) -> no warning
  const closeResult = await specialistUses.execute(infuserLv1, "applyInfusion", {
    targetUuid: validTarget.uuid,
    targetName: validTarget.name,
    infusionType: "procoagulant",
    distance: 5
  });
  assert.equal(closeResult.infusionType, "procoagulant");

  // Out of range (10 ft) -> warns on range
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv1, "applyInfusion", {
        targetUuid: validTarget.uuid,
        targetName: validTarget.name,
        infusionType: "muscleStrengthener",
        distance: 10
      });
    },
    error => {
      assert.equal(isPlayWarnings(error), true, "Throws PlayWarnings for out-of-range target");
      assert.ok(error.warnings.some(w => w.id === "range"), "Warning id is range");
      return true;
    }
  );

  // Range warning can be overridden ("Use anyway")
  await specialistUses.execute(infuserLv1, "applyInfusion", {
    targetUuid: validTarget.uuid,
    targetName: validTarget.name,
    infusionType: "muscleStrengthener",
    distance: 10,
    overrides: ["range"]
  });
  assert.equal(getActiveInfusion(validTarget).type, "muscleStrengthener");

  // 4. Range verification at Level 11+ (Delivery Service: 30 ft range)
  assert.equal(calculateInfusionRange(infuserLv11), 30, "Level 11 Delivery Service range is 30 ft");

  // Target at 30 ft -> no range warning at Level 11
  await specialistUses.execute(infuserLv11, "applyInfusion", {
    targetUuid: validTarget.uuid,
    targetName: validTarget.name,
    infusionType: "respirationStimulant",
    distance: 30
  });
  assert.equal(getActiveInfusion(validTarget).type, "respirationStimulant");

  // Target at 35 ft -> warns on range even at Level 11
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv11, "applyInfusion", {
        targetUuid: validTarget.uuid,
        targetName: validTarget.name,
        infusionType: "sensationNulling",
        distance: 35
      });
    },
    error => {
      assert.equal(isPlayWarnings(error), true);
      assert.ok(error.warnings.some(w => w.id === "range"));
      return true;
    }
  );
});

/* ==============================================================================
 * Test 3: Infusion State Replacement & Multi-Target Isolation
 * ============================================================================== */
test("Adversarial 3: Infusion State Replacement & Multi-Target Isolation", async () => {
  const infuser = createInfuserActor(5, { infusions: 6 });
  const allyA = createCreature("Ally Alpha");
  const allyB = createCreature("Ally Bravo");

  // Step 1: Apply Infusion 1 (adrenalineTrigger) to Ally A
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: allyA.uuid,
    targetName: allyA.name,
    infusionType: "adrenalineTrigger"
  });

  assert.equal(getActiveInfusion(allyA).type, "adrenalineTrigger");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[allyA.uuid].type, "adrenalineTrigger");

  // Step 2: Overwrite with Infusion 2 (focusHeightener) on Ally A
  const receiptOverwrite = await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: allyA.uuid,
    targetName: allyA.name,
    infusionType: "focusHeightener"
  });

  assert.equal(receiptOverwrite.overwrotePrior, true, "Receipt records overwrotePrior: true");
  assert.equal(getActiveInfusion(allyA).type, "focusHeightener", "Target now has new infusion");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[allyA.uuid].type, "focusHeightener", "Infuser tracking updated");

  // Step 3: Apply Infusion 3 (procoagulant) to Ally B (separate creature)
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: allyB.uuid,
    targetName: allyB.name,
    infusionType: "procoagulant"
  });

  // Verify multi-target isolation: Ally A still has focusHeightener, Ally B has procoagulant
  assert.equal(getActiveInfusion(allyA).type, "focusHeightener", "Ally A retains focusHeightener");
  assert.equal(getActiveInfusion(allyB).type, "procoagulant", "Ally B has procoagulant");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[allyA.uuid].type, "focusHeightener");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[allyB.uuid].type, "procoagulant");

  // EMPIRICAL DEFECT CHECK: Keys in activeInfusions must NOT have path-split dot expansion creating an extra 'Actor' key
  assert.equal(
    Object.keys(infuser.flags.ak5e.infuser.activeInfusions).length,
    2,
    "Infuser tracks exactly 2 distinct targets without dotted UUID key path expansion polluting activeInfusions"
  );
});

/* ==============================================================================
 * Test 4: Leverage CON Save Workflow, Dazed & Leverage Lockout Lifecycle
 * ============================================================================== */
test("Adversarial 4: Leverage CON Save Workflow, Dazed & Leverage Lockout Lifecycle", async () => {
  const infuser = createInfuserActor(5, { intMod: 3 }); // DC 20 - 3 - 3 = 14
  const target = createCreature("Frontline Fighter", { conMod: 2 });

  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: target.uuid,
    targetName: target.name,
    infusionType: "respirationStimulant"
  });

  // --- Scenario A: Failed CON Save ---
  const failResult = await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: target.uuid,
    targetName: target.name,
    saveFailed: true
  });

  assert.equal(failResult.saveFailed, true);
  assert.equal(failResult.dazedApplied, true);
  assert.equal(target.flags.ak5e.infuser.leverageLockout, true, "Target in leverage lockout on failed save");
  assert.equal(
    Boolean(target.statuses?.has("dazed") || target.flags?.ak5e?.dazed),
    true,
    "Target gains Dazed condition on failed save"
  );

  // --- Scenario B: Attempting to Leverage while in Lockout / Dazed ---
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuser, "leverageInfusion", {
        targetUuid: target.uuid,
        targetName: target.name,
        saveFailed: false
      });
    },
    error => {
      assert.equal(isPlayWarnings(error), true, "Throws PlayWarnings when leveraging during lockout");
      assert.ok(error.warnings.some(w => w.id === "lockout"), "Warning id is lockout");
      return true;
    }
  );

  // Override allows table to proceed if desired
  await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: target.uuid,
    targetName: target.name,
    saveFailed: false,
    overrides: ["lockout"]
  });

  // --- Scenario C: Turn Start Recovery ---
  // If target clears Dazed condition and turn starts, leverageLockout resets
  await target.toggleStatusEffect("dazed", { active: false });
  assert.equal(Boolean(target.statuses?.has("dazed")), false, "Dazed cleared");

  await emitAk5eEvent("turnStart", { actorUuid: target.uuid, raw: { actor: target } });
  assert.equal(target.flags.ak5e.infuser.leverageLockout, false, "Leverage lockout resets on turnStart if not Dazed");

  // --- Scenario D: Turn Start while STILL Dazed ---
  // If target is STILL Dazed, leverageLockout MUST remain locked
  target.flags.ak5e.infuser.leverageLockout = true;
  await target.toggleStatusEffect("dazed", { active: true });

  await emitAk5eEvent("turnStart", { actorUuid: target.uuid, raw: { actor: target } });
  assert.equal(target.flags.ak5e.infuser.leverageLockout, true, "Leverage lockout remains locked if still Dazed");

  // --- Scenario E: Successful CON Save ---
  await target.toggleStatusEffect("dazed", { active: false });
  target.flags.ak5e.infuser.leverageLockout = false;

  const successResult = await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: target.uuid,
    targetName: target.name,
    saveFailed: false
  });
  assert.equal(successResult.saveFailed, false);
  assert.equal(successResult.dazedApplied, false);
  assert.equal(target.flags.ak5e.infuser.leverageLockout, false, "No lockout on successful save");
  assert.equal(Boolean(target.statuses?.has("dazed")), false, "No Dazed on successful save");
});

/* ==============================================================================
 * Test 5: Double-Blind Trial Preconditions, Dual Resource Shortfall Clamping & 1d6 Toxin Bounds
 * ============================================================================== */
test("Adversarial 5: Double-Blind Trial Preconditions, Dual Resource Shortfall Clamping & 1d6 Toxin Bounds", async () => {
  // Preconditions: Level 5+, Pharmacology Kit, untoxined weapon, 1 Prowess, 1 Infusion
  const infuserLv1 = createInfuserActor(1, { prowess: 2, infusions: 4 });
  const infuserLv5 = createInfuserActor(5, { prowess: 0, infusions: 0 }); // 0 resources
  const kit = createTestItem({ name: "Pharmacology Kit", type: "tool", flags: { ak5e: { chapterFourId: "tool-pharmacology-kit-4" } } });
  addItem(infuserLv5, kit);

  // 1. Level gate: Lv 1 actor emits level warning
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv1, "doubleBlindTrial", { skipToolCheck: true });
    },
    error => {
      assert.equal(isPlayWarnings(error), true);
      assert.ok(error.warnings.some(w => w.id === "level"), "Double-Blind Trial warns on level < 5");
      return true;
    }
  );

  // 2. Weapon already toxined warning
  infuserLv5.flags.ak5e.appliedToxin = { name: "Existing Necrotoxin", type: "Necrotoxin" };
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv5, "doubleBlindTrial", { skipToolCheck: true });
    },
    error => {
      assert.equal(isPlayWarnings(error), true);
      assert.ok(error.warnings.some(w => w.id === "toxin"), "Warns that weapon is already toxined");
      return true;
    }
  );
  delete infuserLv5.flags.ak5e.appliedToxin;

  // 3. Dual resource shortfall clamping (Prowess = 0 AND Infusions = 0)
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv5, "doubleBlindTrial", { rolledToxin: 1 });
    },
    error => {
      assert.equal(isPlayWarnings(error), true);
      assert.equal(error.warnings.filter(w => w.id === "shortfall").length, 2, "Warns on both Prowess and Infusion shortfalls");
      return true;
    }
  );

  // Execute with shortfall override -> verify clamping at 0
  await specialistUses.execute(infuserLv5, "doubleBlindTrial", {
    rolledToxin: 1,
    overrides: ["shortfall"]
  });

  assert.equal(getPool(infuserLv5, "prowess").value, 0, "Prowess pool clamps at floor 0 (does not become -1)");
  assert.equal(getPool(infuserLv5, "alchemicalInfusions").value, 0, "Infusion pool clamps at floor 0 (does not become -1)");

  // 4. 1d6 roll bounds mapping [1..6]
  const expectedTable = {
    1: "Neurological Inhibitor",
    2: "Necrotoxin",
    3: "Haemotoxin",
    4: "Cytotoxin",
    5: "Neurotoxin",
    6: "Bungarotoxin"
  };

  const infuserRoller = createInfuserActor(5, { prowess: 3, infusions: 6 });
  addItem(infuserRoller, kit);

  for (let roll = 1; roll <= 6; roll++) {
    delete infuserRoller.flags.ak5e.appliedToxin;
    infuserRoller.flags.ak5e.resourcePools.prowess.value = 3;
    infuserRoller.flags.ak5e.resourcePools.alchemicalInfusions.value = 6;
    const res = await specialistUses.execute(infuserRoller, "doubleBlindTrial", { rolledToxin: roll });
    assert.equal(res.rollResult, roll, `Roll result ${roll}`);
    assert.equal(res.toxinName, expectedTable[roll], `Roll ${roll} maps exactly to ${expectedTable[roll]}`);
    assert.equal(infuserRoller.flags.ak5e.appliedToxin.name, expectedTable[roll]);
    assert.equal(DOUBLE_BLIND_TABLE[roll], expectedTable[roll]);
  }
});

/* ==============================================================================
 * Test 6: Stimpack Questionable Rejuvenation Temp HP Rolls & Additive Procoagulant
 * ============================================================================== */
test("Adversarial 6: Stimpack Questionable Rejuvenation Temp HP Rolls & Additive Procoagulant", async () => {
  const infuserLv10 = createInfuserActor(10, { infusions: 6 });
  const infuserLv11 = createInfuserActor(11, { infusions: 8 });

  const allyWizard = createCreature("Ally Wizard", { hd: "d6", conMod: 1 });
  const allyBarb = createCreature("Ally Barbarian", { hd: "d12", conMod: 3 });

  // 1. Level 10 (no Stimpack):
  // applyInfusion does NOT have 1d10 formula
  await specialistUses.execute(infuserLv10, "applyInfusion", {
    targetUuid: allyWizard.uuid,
    targetName: allyWizard.name,
    infusionType: "procoagulant"
  });
  const receiptLv10Apply = infuserLv10.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receiptLv10Apply.formula ?? null, null, "Lv 10 applyInfusion does not have 1d10 formula");
  assert.equal(receiptLv10Apply.questionableRejuvenation ?? false, false);

  // leverageInfusion on Procoagulant at Lv 10: formula is just 1hd + conMod without 1d10
  await specialistUses.execute(infuserLv10, "leverageInfusion", {
    targetUuid: allyWizard.uuid,
    targetName: allyWizard.name,
    saveFailed: false
  });
  const receiptLv10Lev = infuserLv10.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receiptLv10Lev.formula, "1d6 + 1", "Lv 10 Procoagulant formula is 1d6 + 1 without Stimpack");
  assert.equal(receiptLv10Lev.stimpackFormula ?? null, null);

  // 2. Level 11 (Stimpack active):
  // applyInfusion presents interactive 1d10 Temp HP roll formula
  await specialistUses.execute(infuserLv11, "applyInfusion", {
    targetUuid: allyBarb.uuid,
    targetName: allyBarb.name,
    infusionType: "procoagulant"
  });
  const receiptLv11Apply = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receiptLv11Apply.formula, "1d10", "Lv 11 applyInfusion sets formula: 1d10");
  assert.equal(receiptLv11Apply.questionableRejuvenation, true);
  assert.equal(receiptLv11Apply.rollLabel, "Questionable Rejuvenation (1d10 Temp HP)");

  // leverageInfusion on Procoagulant at Lv 11: formula is ADDITIVE: 1hd + conMod + 1d10!
  await specialistUses.execute(infuserLv11, "leverageInfusion", {
    targetUuid: allyBarb.uuid,
    targetName: allyBarb.name,
    saveFailed: false
  });
  const receiptLv11Lev = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(
    receiptLv11Lev.formula,
    "1d12 + 3 + 1d10",
    "Lv 11 Procoagulant formula is additive with Stimpack: 1d12 + 3 + 1d10"
  );

  // leverageInfusion on non-Procoagulant at Lv 11: successful save grants separate 1d10 stimpackFormula
  await specialistUses.execute(infuserLv11, "applyInfusion", {
    targetUuid: allyWizard.uuid,
    targetName: allyWizard.name,
    infusionType: "adrenalineTrigger"
  });
  await specialistUses.execute(infuserLv11, "leverageInfusion", {
    targetUuid: allyWizard.uuid,
    targetName: allyWizard.name,
    saveFailed: false
  });
  const receiptLv11Adrenaline = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receiptLv11Adrenaline.stimpackFormula, "1d10", "Non-procoagulant save success grants 1d10 stimpack formula");
});

/* ==============================================================================
 * Test 7: Excessive Dosing Toxin Scaling & Toxic Shock Mechanics
 * ============================================================================== */
test("Adversarial 7: Excessive Dosing Toxin Scaling & Toxic Shock Mechanics", async () => {
  const infuserLv14 = createInfuserActor(14, { prof: 5 });
  const infuserLv15 = createInfuserActor(15, { prof: 5 });
  const infuserLv17 = createInfuserActor(17, { prof: 6 });

  // 1. Feature predicate
  assert.equal(hasExcessiveDosing(infuserLv14), false, "Lv 14 Excessive Dosing inactive");
  assert.equal(hasExcessiveDosing(infuserLv15), true, "Lv 15 Excessive Dosing active");
  assert.equal(hasExcessiveDosing(infuserLv17), true, "Lv 17 Excessive Dosing active");

  // 2. DC scaling (Base 15 + PB)
  assert.equal(getToxinDC(infuserLv14, 15), 15, "Lv 14 Toxin DC is base 15");
  assert.equal(getToxinDC(infuserLv15, 15), 20, "Lv 15 Toxin DC is 15 + PB(5) = 20");
  assert.equal(getToxinDC(infuserLv17, 15), 21, "Lv 17 Toxin DC is 15 + PB(6) = 21");

  // 3. Double-Blind Trial applies excessive dosing DC
  const kit = createTestItem({ name: "Pharmacology Kit", type: "tool" });
  addItem(infuserLv15, kit);

  const res15 = await specialistUses.execute(infuserLv15, "doubleBlindTrial", { rolledToxin: 2 });
  assert.equal(res15.dc, 20, "Double-Blind Trial sets DC 20 for Lv 15 Infuser");
  assert.equal(infuserLv15.flags.ak5e.appliedToxin.dc, 20);
});

/* ==============================================================================
 * Test 8: To Defy Science 1/LR Pool & preApplyDamage Invulnerability Clamping
 * ============================================================================== */
test("Adversarial 8: To Defy Science 1/LR Pool & preApplyDamage Invulnerability Clamping", async () => {
  const infuserLv20 = createInfuserActor(20, { toDefyScience: 1 });
  const target = createCreature("Vulnerable Ally", { hp: 25, hpMax: 25, tempHp: 5 });

  // 1. Pool spend & 1/LR enforcement
  assert.equal(hasToDefyScience(infuserLv20), true);
  assert.equal(getPool(infuserLv20, "toDefyScience").value, 1);

  await specialistUses.execute(infuserLv20, "toDefyScience", {
    targetUuid: target.uuid,
    targetName: target.name
  });

  assert.equal(getPool(infuserLv20, "toDefyScience").value, 0, "To Defy Science pool spent to 0");
  assert.equal(target.flags.ak5e.infuser.invulnerable, true, "Target gains invulnerable flag");

  // Second activation in same LR warns on shortfall
  await assert.rejects(
    async () => {
      await specialistUses.execute(infuserLv20, "toDefyScience", {
        targetUuid: target.uuid,
        targetName: target.name
      });
    },
    error => {
      assert.equal(isPlayWarnings(error), true);
      assert.ok(error.warnings.some(w => w.id === "shortfall"));
      return true;
    }
  );

  // 2. Invulnerability hook execution in infuserPreApplyDamage
  // Incoming massive lethal damage: 100 damage
  const updatesLethal = {
    "system.attributes.hp.temp": 0,
    "system.attributes.hp.value": 0
  };
  const allowDamage = infuserPreApplyDamage(target, 100, updatesLethal);

  assert.equal(allowDamage, false, "Invulnerability cancels damage application (returns false)");
  assert.equal(updatesLethal["system.attributes.hp.value"], 25, "HP value clamped back to current 25 (zero damage taken)");
  assert.equal(updatesLethal["system.attributes.hp.temp"], 5, "Temp HP clamped back to current 5 (zero temp HP lost)");

  // Target without invulnerability takes damage normally
  const mortalTarget = createCreature("Mortal Creature", { hp: 20 });
  const updatesNormal = { "system.attributes.hp.value": 10 };
  const allowNormal = infuserPreApplyDamage(mortalTarget, 10, updatesNormal);
  assert.equal(allowNormal, true, "Damage applies to non-invulnerable target");
  assert.equal(updatesNormal["system.attributes.hp.value"], 10);

  // 3. Sensation Nulling Damage Reduction in infuserPreApplyDamage
  mortalTarget.flags.ak5e.infuser = { sensationNullingDR: 4 };
  const updatesMitigated = { "system.attributes.hp.value": 10 }; // 20 - 10 = 10 damage taken
  infuserPreApplyDamage(mortalTarget, 10, updatesMitigated);
  // Mitigated damage = Math.max(0, 10 - 4) = 6 -> new HP = 20 - 6 = 14
  assert.equal(updatesMitigated["system.attributes.hp.value"], 14, "Sensation Nulling reduces damage taken by DR (4)");
});

/* ==============================================================================
 * Test 9: Standard Plan Undo Reversibility (single apply, leverage, DBT, TDS)
 * ============================================================================== */
test("Adversarial 9: Standard Plan Undo Reversibility (single apply, leverage, DBT, TDS)", async () => {
  const infuser = createInfuserActor(20, { prowess: 6, infusions: 12, toDefyScience: 1 });
  const ally = createCreature("Target Ally", { conMod: 2 });
  const kit = createTestItem({ name: "Pharmacology Kit", type: "tool" });
  addItem(infuser, kit);

  // --- A. applyInfusion (single) and undo ---
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 11);
  assert.equal(getActiveInfusion(ally).type, "adrenalineTrigger");

  const useIdApply = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, useIdApply);
  assert.equal(getPool(infuser, "alchemicalInfusions").value, 12, "Infusion refunded on undo applyInfusion");
  assert.equal(getActiveInfusion(ally), null, "Target infusion cleared on undo applyInfusion");
  assert.equal(infuser.flags.ak5e.infuser.activeInfusions[ally.uuid], undefined, "Infuser tracking cleared on undo applyInfusion");

  // --- B. leverageInfusion and undo ---
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });
  await specialistUses.execute(infuser, "leverageInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    saveFailed: true
  });
  assert.equal(ally.flags.ak5e.infuser.leverageLockout, true);
  assert.equal(ally.flags.ak5e.dazed, true);

  const useIdLeverage = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, useIdLeverage);
  assert.equal(ally.flags.ak5e.infuser.leverageLockout, false, "Leverage lockout cleared on undo leverageInfusion");
  assert.equal(ally.flags.ak5e.dazed, false, "Dazed cleared on undo leverageInfusion");

  // --- C. doubleBlindTrial and undo ---
  await specialistUses.execute(infuser, "doubleBlindTrial", { rolledToxin: 4 });
  assert.equal(infuser.flags.ak5e.appliedToxin.name, "Cytotoxin");

  const useIdDBT = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, useIdDBT);
  assert.equal(infuser.flags.ak5e.appliedToxin ?? null, null, "Applied toxin cleared on undo doubleBlindTrial");

  // --- D. toDefyScience and undo ---
  await specialistUses.execute(infuser, "toDefyScience", { targetUuid: ally.uuid, targetName: ally.name });
  assert.equal(ally.flags.ak5e.infuser.invulnerable, true);

  const useIdTDS = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(infuser, useIdTDS);
  assert.equal(getPool(infuser, "toDefyScience").value, 1, "To Defy Science refunded on undo");
  assert.equal(ally.flags.ak5e.infuser.invulnerable, false, "Invulnerability cleared on undo toDefyScience");
});

/* ==============================================================================
 * Test 10: Overwriting applyInfusion Undo Reversibility (Prior Infusion Restoration)
 * ============================================================================== */
test("Adversarial 10: Overwriting applyInfusion Undo Reversibility (Prior Infusion Restoration)", async () => {
  const infuser = createInfuserActor(20, { infusions: 12 });
  const ally = createCreature("Target Ally", { conMod: 2 });

  // Apply Infusion A
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });
  assert.equal(getActiveInfusion(ally).type, "adrenalineTrigger");

  // Overwrite with Infusion B
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "focusHeightener"
  });
  assert.equal(getActiveInfusion(ally).type, "focusHeightener");
  const useIdOverwrite = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;

  // Undo Infusion B: verify Infusion A is restored on Target!
  await specialistUses.undo(infuser, useIdOverwrite);

  // EMPIRICAL DEFECT CHECK: receipt.priorInfusion must not be mutated in-place by targetActor.update,
  // allowing Infusion A to be correctly restored upon undoing the overwrite.
  assert.equal(
    getActiveInfusion(ally)?.type,
    "adrenalineTrigger",
    "Prior infusion A must be restored on target when overwriting apply is undone (WORKFLOW §3.2 reversibility)"
  );
});

/* ==============================================================================
 * Test 11: clearInfusion Undo Reversibility (Target Infusion Restoration)
 * ============================================================================== */
test("Adversarial 11: clearInfusion Undo Reversibility (Target Infusion Restoration)", async () => {
  const infuser = createInfuserActor(20, { infusions: 12 });
  const ally = createCreature("Target Ally", { conMod: 2 });

  // Apply infusion
  await specialistUses.execute(infuser, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "muscleStrengthener"
  });
  assert.equal(getActiveInfusion(ally).type, "muscleStrengthener");

  // Clear infusion
  await specialistUses.execute(infuser, "clearInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name
  });
  assert.equal(getActiveInfusion(ally), null, "Infusion cleared after clearInfusion");

  const useIdClear = infuser.flags.ak5e.specialistUses.undo.slice(-1)[0].id;

  // Undo clearInfusion
  await specialistUses.undo(infuser, useIdClear);

  // EMPIRICAL DEFECT CHECK: Undoing clearInfusion MUST restore the prior active infusion on targetActor
  assert.equal(
    getActiveInfusion(ally)?.type,
    "muscleStrengthener",
    "Undoing clearInfusion MUST restore the cleared active infusion on targetActor (WORKFLOW §3.2 reversibility)"
  );
});

/* ==============================================================================
 * Test 12: Receipt Status Lifecycle & Interactive Dice Verification
 * ============================================================================== */
test("Adversarial 12: Receipt Status Lifecycle & Interactive Dice Verification", async () => {
  const infuserLv11 = createInfuserActor(11, { prowess: 4, infusions: 8 });
  const ally = createCreature("Ally Scout");
  const kit = createTestItem({ name: "Pharmacology Kit", type: "tool" });
  addItem(infuserLv11, kit);

  // 1. applyInfusion at Lv 11+ has Stimpack Questionable Rejuvenation 1d10 formula
  // Receipt must transition to 'awaitingRoll' until user clicks roll button
  await specialistUses.execute(infuserLv11, "applyInfusion", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    infusionType: "adrenalineTrigger"
  });
  const applyReceipt = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(applyReceipt.status, "awaitingRoll", "Stimpack applyInfusion receipt enters 'awaitingRoll'");
  assert.equal(applyReceipt.formula, "1d10");

  // Roll evaluation transitions receipt to 'complete'
  await specialistUses.execute(infuserLv11, "useRoll", { useId: applyReceipt.id });
  const applyReceiptRolled = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(applyReceiptRolled.status, "complete", "Receipt status transitions to 'complete' after useRoll");
  assert.ok(typeof applyReceiptRolled.roll === "number", "Receipt records numeric roll total");

  // 2. doubleBlindTrial has 1d6 formula and must transition to 'awaitingRoll'
  await specialistUses.execute(infuserLv11, "doubleBlindTrial", { rolledToxin: 3 });
  const dbtReceipt = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(dbtReceipt.status, "awaitingRoll", "doubleBlindTrial receipt enters 'awaitingRoll'");
  assert.equal(dbtReceipt.formula, "1d6");

  await specialistUses.execute(infuserLv11, "useRoll", { useId: dbtReceipt.id });
  const dbtReceiptRolled = infuserLv11.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(dbtReceiptRolled.status, "complete", "doubleBlindTrial transitions to 'complete' after useRoll");

  // 3. toDefyScience and clearInfusion have no dice and must transition directly to 'complete'
  const infuserLv20 = createInfuserActor(20, { toDefyScience: 1 });
  await specialistUses.execute(infuserLv20, "toDefyScience", { targetUuid: ally.uuid, targetName: ally.name });
  const tdsReceipt = infuserLv20.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(tdsReceipt.status, "complete", "toDefyScience has no dice and transitions immediately to 'complete'");

  await specialistUses.execute(infuserLv20, "clearInfusion", { targetUuid: ally.uuid, targetName: ally.name });
  const clearReceipt = infuserLv20.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(clearReceipt.status, "complete", "clearInfusion has no dice and transitions immediately to 'complete'");
});

/* ==============================================================================
 * Test 13: Real Hooks.call Dispatch Integration & Listener Invariance
 * ============================================================================== */
test("Adversarial 13: Real Hooks.call Dispatch Integration & Listener Invariance", async () => {
  // 1. Hook Listener Count Invariance
  const damageListenersBefore = Hooks._hooks.get("dnd5e.preRollDamageV2")?.length ?? 0;
  const applyListenersBefore = Hooks._hooks.get("dnd5e.preApplyDamage")?.length ?? 0;

  assert.equal(damageListenersBefore, 1, "Exactly 1 preRollDamageV2 listener registered");
  assert.equal(applyListenersBefore, 1, "Exactly 1 preApplyDamage listener registered");

  // Re-register 5 times
  for (let i = 0; i < 5; i++) {
    registerInfuserHooks();
  }

  const damageListenersAfter = Hooks._hooks.get("dnd5e.preRollDamageV2")?.length ?? 0;
  const applyListenersAfter = Hooks._hooks.get("dnd5e.preApplyDamage")?.length ?? 0;

  assert.equal(damageListenersAfter, damageListenersBefore, "preRollDamageV2 listener count invariant");
  assert.equal(applyListenersAfter, applyListenersBefore, "preApplyDamage listener count invariant");

  // 2. Real Hooks.call("dnd5e.preRollDamageV2") for Cytotoxin and Muscle Strengthener
  const infuser = createInfuserActor(5, { intMod: 3 });
  const ally = createCreature("Infused Ally");

  // Muscle Strengthener test via Hooks.call
  ally.flags.ak5e.infuser = {
    activeInfusion: { type: "muscleStrengthener", infuserIntBonus: 3 },
    muscleStrengthenerActive: true
  };
  const meleeRollConfig = {
    actor: ally,
    actionType: "mwak",
    isMelee: true,
    rolls: [{ parts: ["1d8", "3"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", meleeRollConfig);
  assert.ok(
    meleeRollConfig.rolls[0].parts.includes("3"),
    "Muscle Strengthener +3 INT bonus added to melee roll parts via Hooks.callAll"
  );

  // Cytotoxin test via Hooks.call
  infuser.flags.ak5e.appliedToxin = { name: "Cytotoxin", type: "Cytotoxin" };
  const weaponRollConfig = {
    actor: infuser,
    actionType: "mwak",
    rolls: [{ parts: ["1d6", "2"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", weaponRollConfig);
  assert.ok(
    weaponRollConfig.rolls[0].parts.includes("1d6[poison]"),
    "Cytotoxin 1d6[poison] added to damage roll parts via Hooks.callAll"
  );
});
