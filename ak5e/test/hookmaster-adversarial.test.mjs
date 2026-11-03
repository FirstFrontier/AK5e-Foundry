/**
 * Adversarial Stress Test Suite for AK5e Hookmaster Specialist Subclass (Ch. 3 L5585–5679).
 * Tests edge cases, boundary conditions, loopholes, hook dispatch, and full undo reversibility:
 *  1. Invalid Hooked Weapon Conversion & Cost Overrides
 *  2. Relative Creature Size Comparison Matrix Across All Sizes
 *  3. Resource Shortfall Overrides (Prowess = 0 Clamping)
 *  4. King of the Urban Jungle Pre-movement, Flying Speed Scaling & Attack Buffs
 *  5. Bound in Rope (Saves, Conditions, Hook Lockout, Drag, Hogtie, Release, Kill Event)
 *  6. Wrangler (Size Gate, Shared Space, Advantage, -5 DR Bypass, Release)
 *  7. Mighty Push (STR Save, Interactive 8d6 Roll, Knockback, Collision, useRoll Execution)
 *  8. Scorpion Sting (Pool Spend, Auto-fail, Lockout Bypass, Pull Direction, 6 Adv Attacks + Half Level Dmg)
 *  9. Full Undo Reversibility for Every Hookmaster Plan
 * 10. Hook Dispatch Integration via Hooks.callAll
 * 11. Receipt Lifecycle and Status Integrity
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isHookmaster, calculateHookRange, getCreatureSize, getSizeValue,
  isNoMoreThanOneSizeLarger, isMoreThanOneSizeLarger,
  canConvertWeaponToHook, getWeaponDamageTypes, isHookedWeapon,
  isProficientWithHook, getHookedWeapon, getHookmasterState, isHookLocked,
  convertHookedWeapon, revertHookedWeapon, defineHookmasterPools,
  hookmasterPreRollAttack, hookmasterPreRollDamage, registerHookmasterHooks,
  hasBigBoot, hasKingOfUrbanJungle, hasBoundInRope, hasWrangler,
  hasMightyPush, hasSpidersEssence, hasLongerHook, hasSpidersThread,
  hasSwingToSafety, hasScorpionSting, HOOKMASTER_SUBCLASS_ID, SIZE_ORDER
} from "../scripts/hookmaster-features.mjs";
import { specialistUses, HOOKMASTER_PLANS, HOOKMASTER_READINGS } from "../scripts/specialist-uses.mjs";
import { SPECIALIST_CLASS_ID, martialDC, isSpecialist } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, refundPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineHookmasterPools();
  registerHookmasterHooks();
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

function createHookmasterActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subClass = createTestItem({
    name: "Hookmaster",
    type: "subclass",
    flags: {
      ak5e: {
        chapterThreeId: HOOKMASTER_SUBCLASS_ID
      }
    }
  });

  const actor = createTestActor({
    name: options.name ?? "Test Hookmaster",
    items: [sClass, subClass, ...(options.items ?? [])],
    system: {
      ...options.system,
      traits: {
        size: options.size ?? "med",
        ...(options.system?.traits ?? {})
      },
      attributes: {
        prof: Math.floor((level - 1) / 4) + 2,
        movement: { walk: 30, climb: 0, swim: 0, fly: 0 },
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { mod: 3, value: 16 },
        dex: { mod: 2, value: 14 },
        con: { mod: 2, value: 14 },
        int: { mod: 0, value: 10 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 },
        ...(options.system?.abilities ?? {})
      },
      currency: {
        lmd: options.lmd ?? 1300,
        gp: options.gp ?? 0
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "hookmaster",
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "duelling"
        },
        hookmaster: {
          freeConversionUsed: options.freeConversionUsed ?? false,
          hookLocked: options.hookLocked ?? false,
          grappledTarget: options.grappledTarget ?? null,
          wranglerTarget: options.wranglerTarget ?? null,
          urbanJungle: options.urbanJungle ?? null,
          flyingMovementThisTurn: options.flyingMovementThisTurn ?? 0,
          hookedWeaponId: options.hookedWeaponId ?? null,
          ...(options.hookmasterFlags ?? {})
        },
        resourcePools: {
          prowess: { value: options.prowess ?? 2, max: Math.floor((level - 1) / 4) + 2 },
          mightyPush: { value: options.mightyPush ?? Math.floor((level - 1) / 4) + 2, max: Math.floor((level - 1) / 4) + 2 },
          scorpionSting: { value: options.scorpionSting ?? 1, max: 1 }
        }
      }
    }
  });

  return actor;
}

function createWeapon(name, { actionType = "mwak", damageType = "slashing", properties = ["fin"], range = { value: 5 } } = {}) {
  const props = properties instanceof Set ? properties : new Set(properties);
  return createTestItem({
    name,
    type: "weapon",
    system: {
      actionType,
      damage: { base: { formula: "1d8", type: damageType } },
      properties: props,
      range
    }
  });
}

function createCreature(name, size = "med") {
  return createTestActor({
    name,
    system: {
      traits: { size },
      attributes: { hp: { value: 50, max: 50 } }
    }
  });
}

/* ==============================================================================
 * Test 1: Invalid Hooked Weapon Conversion & Cost Overrides
 * ============================================================================== */
test("Adversarial 1: Invalid Hooked Weapon Conversion & Cost Overrides", async () => {
  const actor = createHookmasterActor(5, { lmd: 50, freeConversionUsed: true });

  // 1. Non-weapon item rejection
  const armor = createTestItem({ name: "Plate Armor", type: "equipment" });
  addItem(actor, armor);
  const armorCheck = canConvertWeaponToHook(armor);
  assert.equal(armorCheck.valid, false);
  assert.ok(armorCheck.reasons.some(r => r.includes("Item must be a weapon")));

  // 2. Two-Handed property rejection
  const greatsword = createWeapon("Greatsword", { properties: ["two", "hvy"] });
  addItem(actor, greatsword);
  const twoHandedCheck = canConvertWeaponToHook(greatsword);
  assert.equal(twoHandedCheck.valid, false);
  assert.ok(twoHandedCheck.reasons.some(r => r.includes("Two-Handed")));

  // 3. Ranged / Ammunition weapon rejection
  const longbow = createWeapon("Longbow", { actionType: "rwak", properties: ["amm"] });
  addItem(actor, longbow);
  const rangedCheck = canConvertWeaponToHook(longbow);
  assert.equal(rangedCheck.valid, false);
  assert.ok(rangedCheck.reasons.some(r => r.includes("Melee Weapon")));

  // 4. Bludgeoning-only damage rejection
  const mace = createWeapon("Mace", { damageType: "bludgeoning", properties: [] });
  addItem(actor, mace);
  const bludgeonCheck = canConvertWeaponToHook(mace);
  assert.equal(bludgeonCheck.valid, false);
  assert.ok(bludgeonCheck.reasons.some(r => r.includes("Slashing or Piercing")));

  // 5. Non-existent item rejection in plan
  const planMissing = specialistUses.plan(actor, "convertHookedWeapon", { itemId: "missing-item-id", checkOnly: true });
  assert.ok(planMissing.warnings.some(w => w.id === "item"));

  // 6. Cost shortfall override & clamping
  const rapier = createWeapon("Rapier", { damageType: "piercing", properties: ["fin"] });
  addItem(actor, rapier);

  const planCost = specialistUses.plan(actor, "convertHookedWeapon", { itemId: rapier.id, checkOnly: true });
  assert.ok(planCost.warnings.some(w => w.id === "currency"));

  // Execution without override throws
  await assert.rejects(
    async () => specialistUses.execute(actor, "convertHookedWeapon", { itemId: rapier.id }),
    /AK5eWarnings/
  );

  // Execution with override clamps LMD at 0 (from 50 to 0, not -150)
  await specialistUses.execute(actor, "convertHookedWeapon", { itemId: rapier.id, overrides: ["currency"] });
  assert.equal(actor.system.currency.lmd, 0, "LMD currency clamped at 0 upon shortfall override");
  assert.equal(isHookedWeapon(rapier), true, "Rapier successfully converted into Hook");
  assert.equal(rapier.system.properties.has("two"), true, "Converted hook gains Two-Handed");
  assert.equal(rapier.system.properties.has("thr"), true, "Converted hook gains Thrown");
});

/* ==============================================================================
 * Test 2: Relative Creature Size Comparison Matrix Across All Sizes
 * ============================================================================== */
test("Adversarial 2: Relative Creature Size Comparison Matrix Across All Sizes", () => {
  const sizes = ["tiny", "sm", "med", "lg", "huge", "grg"];
  const sizeMap = { tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5 };

  for (const aSize of sizes) {
    for (const tSize of sizes) {
      const aVal = sizeMap[aSize];
      const tVal = sizeMap[tSize];
      const actor = createCreature("Actor", aSize);
      const target = createCreature("Target", tSize);

      const noMoreThanOne = isNoMoreThanOneSizeLarger(actor, target);
      const moreThanOne = isMoreThanOneSizeLarger(actor, target);

      const expectedNoMoreThanOne = tVal <= aVal + 1;
      const expectedMoreThanOne = tVal > aVal + 1;

      assert.equal(noMoreThanOne, expectedNoMoreThanOne, `isNoMoreThanOneSizeLarger(${aSize}, ${tSize}) mismatch`);
      assert.equal(moreThanOne, expectedMoreThanOne, `isMoreThanOneSizeLarger(${aSize}, ${tSize}) mismatch`);
      assert.equal(noMoreThanOne, !moreThanOne, `Mutual exclusivity failed for (${aSize}, ${tSize})`);
    }
  }

  // Alternate labels & case insensitivity
  const c1 = createCreature("C1", "GARGANTUAN");
  const c2 = createCreature("C2", "small");
  assert.equal(getSizeValue(c1), 5);
  assert.equal(getSizeValue(c2), 1);
  assert.equal(isMoreThanOneSizeLarger(c2, c1), true);
  assert.equal(isNoMoreThanOneSizeLarger(c2, c1), false);

  // Missing size trait defaults to medium (2)
  const cNoSize = createTestActor({ name: "NoSize" });
  assert.equal(getSizeValue(cNoSize), 2);
});

/* ==============================================================================
 * Test 3: Resource Shortfall Overrides (Prowess = 0 Clamping)
 * ============================================================================== */
test("Adversarial 3: Resource Shortfall Overrides (Prowess = 0 Clamping)", async () => {
  const actor = createHookmasterActor(5, { prowess: 0 });
  const hook = createWeapon("Hook", { damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const targetSmall = createCreature("SmallTarget", "med");
  const targetHuge = createCreature("HugeTarget", "huge");

  // 1. Bound in Rope with 0 Prowess
  const planBound = specialistUses.plan(actor, "boundInRope", { targetUuid: targetSmall.uuid, targetName: targetSmall.name, checkOnly: true });
  assert.ok(planBound.warnings.some(w => w.id === "shortfall"));

  await assert.rejects(
    async () => specialistUses.execute(actor, "boundInRope", { targetUuid: targetSmall.uuid, targetName: targetSmall.name }),
    /AK5eWarnings/
  );

  await specialistUses.execute(actor, "boundInRope", { targetUuid: targetSmall.uuid, targetName: targetSmall.name, overrides: ["shortfall"] });
  assert.equal(getPool(actor, "prowess").value, 0, "Prowess pool clamped at 0");
  assert.equal(actor.flags.ak5e.hookmaster.grappledTarget.uuid, targetSmall.uuid, "Target grappled via override");
  assert.equal(isHookLocked(actor), true, "Hook locked");

  // Release grapple
  await specialistUses.execute(actor, "releaseGrapple");
  assert.equal(isHookLocked(actor), false);

  // 2. Wrangler with 0 Prowess
  const planWrangler = specialistUses.plan(actor, "wrangler", { targetUuid: targetHuge.uuid, targetName: targetHuge.name, checkOnly: true });
  assert.ok(planWrangler.warnings.some(w => w.id === "shortfall"));

  await assert.rejects(
    async () => specialistUses.execute(actor, "wrangler", { targetUuid: targetHuge.uuid, targetName: targetHuge.name }),
    /AK5eWarnings/
  );

  await specialistUses.execute(actor, "wrangler", { targetUuid: targetHuge.uuid, targetName: targetHuge.name, overrides: ["shortfall"] });
  assert.equal(getPool(actor, "prowess").value, 0, "Prowess pool clamped at 0 on Wrangler override");
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget.uuid, targetHuge.uuid, "Target latched via override");
});

/* ==============================================================================
 * Test 4: King of the Urban Jungle Pre-movement, Flying Speed Scaling & Attack Buffs
 * ============================================================================== */
test("Adversarial 4: King of the Urban Jungle Pre-movement, Flying Speed Scaling & Attack Buffs", async () => {
  // 1. Pre-movement warning without 20 ft
  const actor5 = createHookmasterActor(5);
  const planNoMove = specialistUses.plan(actor5, "kingOfUrbanJungle", { moved20ft: false, checkOnly: true });
  assert.ok(planNoMove.warnings.some(w => w.id === "movement"));

  // Override applies flying speed of 60 ft at level 5
  await specialistUses.execute(actor5, "kingOfUrbanJungle", { moved20ft: false, overrides: ["movement"] });
  assert.equal(actor5.flags.ak5e.hookmaster.urbanJungle.flyingSpeed, 60, "Flying speed is 60 ft at Lv 5 (2x 30 ft range)");
  assert.equal(actor5.flags.ak5e.hookmaster.urbanJungle.active, true);

  // 2. Flying speed at level 15 (Hook range 50 ft -> Flying speed 100 ft)
  const actor15 = createHookmasterActor(15);
  await specialistUses.execute(actor15, "kingOfUrbanJungle", { moved20ft: true });
  assert.equal(actor15.flags.ak5e.hookmaster.urbanJungle.flyingSpeed, 100, "Flying speed is 100 ft at Lv 15 (2x 50 ft range)");

  // 3. Immediate melee attack bonus damage via hookmasterPreRollDamage
  const rollConfig = {
    actor: actor5,
    actionType: "mwak",
    rolls: [{ parts: ["1d8"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", rollConfig);
  assert.ok(rollConfig.rolls[0].parts.includes("3"), "Added +PB (3 at Lv 5) damage to melee roll");

  // 4. Doubled forced movement on Big Boot
  const target = createCreature("Enemy", "med");
  const bootResult = await specialistUses.execute(actor5, "bigBoot", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(bootResult.pushDistance, 20, "Big Boot push doubled to 20 ft with Urban Jungle active");

  // 5. Conclude urban jungle on melee hit event
  await emitAk5eEvent("hit", { raw: { actor: actor5 }, actionType: "mwak", isMelee: true });
  assert.equal(actor5.flags.ak5e.hookmaster.urbanJungle.active, false, "Urban jungle deactivated after immediate melee hit");
});

/* ==============================================================================
 * Test 5: Bound in Rope (Saves, Conditions, Hook Lockout, Drag, Hogtie, Release, Kill Event)
 * ============================================================================== */
test("Adversarial 5: Bound in Rope (Saves, Conditions, Hook Lockout, Drag, Hogtie, Release, Kill Event)", async () => {
  const actor = createHookmasterActor(5, { prowess: 3 });
  const hook = createWeapon("Hook", { damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const target = createCreature("Enemy", "med");

  // 1. Bound in Rope execution
  await specialistUses.execute(actor, "boundInRope", { targetUuid: target.uuid, targetName: target.name });
  const receipt = actor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receipt.saveAbility, "dex");
  assert.equal(receipt.dc, martialDC(actor), "DEX Save DC equals Martial DC");
  assert.equal(isHookLocked(actor), true, "Hook locked while grappling");

  // 2. Drag target (up to 15 ft)
  const dragResult = await specialistUses.execute(actor, "dragBoundTarget", { targetUuid: target.uuid, targetName: target.name, distance: 15 });
  assert.equal(dragResult.distance, 15);

  // Drag without grappled target fails warning
  actor.flags.ak5e.hookmaster.grappledTarget = null;
  const planNoDrag = specialistUses.plan(actor, "dragBoundTarget", { targetUuid: target.uuid, checkOnly: true });
  assert.ok(planNoDrag.warnings.some(w => w.id === "grapple"));

  // Restore grappled target
  actor.flags.ak5e.hookmaster.grappledTarget = { uuid: target.uuid, name: target.name };

  // 3. Hogtie within 5 ft
  const hogtiePlanWarn = specialistUses.plan(actor, "hogtie", { targetUuid: target.uuid, distance: 10, checkOnly: true });
  assert.ok(hogtiePlanWarn.warnings.some(w => w.id === "distance"), "Hogtie warns when distance > 5 ft");

  const hogtieResult = await specialistUses.execute(actor, "hogtie", { targetUuid: target.uuid, distance: 5 });
  assert.equal(hogtieResult.hogtied, true);

  // 4. Kill event auto-releases grapple and unlocks hook
  await emitAk5eEvent("kill", { actorUuid: target.uuid, raw: { actor } });
  assert.equal(actor.flags.ak5e.hookmaster.grappledTarget, null, "Grappled target cleared on target kill");
  assert.equal(isHookLocked(actor), false, "Hook unlocked on target kill");
});

/* ==============================================================================
 * Test 6: Wrangler (Size Gate, Shared Space, Advantage, -5 DR Bypass, Release)
 * ============================================================================== */
test("Adversarial 6: Wrangler (Size Gate, Shared Space, Advantage, -5 DR Bypass, Release)", async () => {
  const actor = createHookmasterActor(5, { prowess: 3 });
  const hook = createWeapon("Hook", { damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const medEnemy = createCreature("MediumEnemy", "med");
  const hugeEnemy = createCreature("HugeEnemy", "huge");

  // 1. Size gate: Medium creature produces warning
  const planSmall = specialistUses.plan(actor, "wrangler", { targetUuid: medEnemy.uuid, checkOnly: true });
  assert.ok(planSmall.warnings.some(w => w.id === "size"), "Wrangler warns on creature <= +1 size");

  // 2. Huge creature produces no size warning
  const planHuge = specialistUses.plan(actor, "wrangler", { targetUuid: hugeEnemy.uuid, checkOnly: true });
  assert.ok(!planHuge.warnings.some(w => w.id === "size"), "Wrangler permits creature > +1 size");

  // 3. Execute Wrangler with ignoreDR option
  await specialistUses.execute(actor, "wrangler", { targetUuid: hugeEnemy.uuid, targetName: hugeEnemy.name, ignoreDR: true });
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget.uuid, hugeEnemy.uuid);
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget.ignoreDR, true);

  // 4. Hook attack preRoll: Advantage + -5 attack penalty for DR bypass
  const attackConfig = {
    actor,
    item: hook,
    actionType: "mwak",
    target: { uuid: hugeEnemy.uuid },
    rolls: [{ parts: ["1d20", "5"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  assert.equal(attackConfig.rolls[0].options.advantage, true, "Advantage applied to latched Wrangler target");
  assert.ok(attackConfig.rolls[0].parts.includes("-5"), "-5 penalty added to roll parts to bypass DR");

  // 5. Release Wrangler
  await specialistUses.execute(actor, "releaseWrangler");
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget, null, "Wrangler latch released");
});

/* ==============================================================================
 * Test 7: Mighty Push (STR Save, Interactive 8d6 Roll, Knockback, Collision, useRoll Execution)
 * ============================================================================== */
test("Adversarial 7: Mighty Push (STR Save, Interactive 8d6 Roll, Knockback, Collision, useRoll Execution)", async () => {
  const actor = createHookmasterActor(11);
  const target = createCreature("Enemy", "med");

  // Distance warning if > 5 ft
  const planFar = specialistUses.plan(actor, "mightyPush", { targetUuid: target.uuid, distance: 10, checkOnly: true });
  assert.ok(planFar.warnings.some(w => w.id === "distance"));

  // Execute Mighty Push
  const result = await specialistUses.execute(actor, "mightyPush", { targetUuid: target.uuid, targetName: target.name, collision: true, collisionTargetName: "stone wall" });
  assert.equal(result.formula, "8d6");
  assert.equal(result.collision, true);

  const receipt = actor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(receipt.formula, "8d6");
  assert.equal(receipt.saveAbility, "str");
  assert.equal(receipt.dc, martialDC(actor));
  assert.ok(receipt.summary.includes("8d6 Bludgeoning"));
  assert.ok(receipt.summary.includes("20 ft knockback"));
  assert.ok(receipt.summary.includes("Collides with stone wall"));

  // Pool spend from 4 to 3
  assert.equal(actor.flags.ak5e.resourcePools.mightyPush.value, 3);

  // EMPIRICAL DEFECT CHECK: Executing useRoll on Mighty Push should evaluate damage and complete cleanly
  // If useRoll crashes because of unregistered target kinds, assert failure
  await assert.doesNotReject(
    async () => {
      await specialistUses.command(actor, "useRoll", { useId: receipt.id });
    },
    "Mighty Push useRoll MUST evaluate without crashing on unregistered target kind 'damage'"
  );
});

/* ==============================================================================
 * Test 8: Scorpion Sting (Pool Spend, Auto-fail, Lockout Bypass, Pull Direction, 6 Adv Attacks + Half Level Dmg)
 * ============================================================================== */
test("Adversarial 8: Scorpion Sting (Pool Spend, Auto-fail, Lockout Bypass, Pull Direction, 6 Adv Attacks + Half Level Dmg)", async () => {
  const actor = createHookmasterActor(20, { hookLocked: true });
  const hook = createWeapon("Hook", { damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const targetMed = createCreature("MedEnemy", "med");
  const targetHuge = createCreature("HugeEnemy", "huge");

  // 1. Grappled target auto-fails save and bypasses Hook lockout
  actor.flags.ak5e.hookmaster.grappledTarget = { uuid: targetMed.uuid, name: targetMed.name };
  const resultMed = await specialistUses.execute(actor, "scorpionSting", { targetUuid: targetMed.uuid, targetName: targetMed.name });
  assert.equal(resultMed.autoFail, true, "Target auto-fails save when grappled");
  assert.equal(resultMed.attackCount, 6, "6 attacks granted");
  assert.equal(resultMed.bonusDamage, 10, "+10 bonus damage (half level 20)");
  assert.equal(actor.flags.ak5e.resourcePools.scorpionSting.value, 0, "1/LR use expended");

  // 2. Damage roll preRoll with isScorpionSting
  const damageConfig = {
    actor,
    item: hook,
    actionType: "mwak",
    isScorpionSting: true,
    rolls: [{ parts: ["1d8"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
  assert.ok(damageConfig.rolls[0].parts.includes("10"), "Added +10 damage to Scorpion Sting damage roll");

  // 3. Pull direction against Huge creature (actor pulled to target)
  actor.flags.ak5e.resourcePools.scorpionSting.value = 1;
  await specialistUses.execute(actor, "scorpionSting", { targetUuid: targetHuge.uuid, targetName: targetHuge.name, targetGrappledOrLatched: true });
  const receiptHuge = actor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.ok(receiptHuge.summary.includes(`pulls ${actor.name} directly to within 5 ft of ${targetHuge.name}`), "Pulls actor to larger creature");
});

/* ==============================================================================
 * Test 9: Full Undo Reversibility for Every Hookmaster Plan
 * ============================================================================== */
test("Adversarial 9: Full Undo Reversibility for Every Hookmaster Plan", async () => {
  const actor = createHookmasterActor(20, { lmd: 1300, prowess: 5, mightyPush: 6, scorpionSting: 1 });
  const sword = createWeapon("Scimitar", { damageType: "slashing", properties: ["fin"], range: { value: 5, reach: 5 } });
  addItem(actor, sword);

  // --- A. convertHookedWeapon ---
  await specialistUses.execute(actor, "convertHookedWeapon", { itemId: sword.id });
  const useIdConvert = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  assert.equal(isHookedWeapon(sword), true);
  await specialistUses.undo(actor, useIdConvert);
  assert.equal(isHookedWeapon(sword), false, "Weapon reverted on undo convert");
  assert.equal(sword.system.properties.has("two"), false, "Two-Handed property removed on undo convert");

  // --- B. revertHookedWeapon ---
  // Re-convert weapon
  await specialistUses.execute(actor, "convertHookedWeapon", { itemId: sword.id });
  assert.equal(isHookedWeapon(sword), true);

  // Revert weapon
  await specialistUses.execute(actor, "revertHookedWeapon", { itemId: sword.id });
  assert.equal(isHookedWeapon(sword), false, "Weapon unhooked after revert");
  const useIdRevert = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;

  // Undo revert: check whether sword is restored to Hook
  await specialistUses.undo(actor, useIdRevert);
  const actorHookedId = actor.flags.ak5e.hookmaster?.hookedWeaponId;
  assert.equal(actorHookedId, sword.id, "Actor hookedWeaponId restored on undo revert");

  // EMPIRICAL DEFECT CHECK: Reverting a revert MUST restore the weapon document's Hooked state
  assert.equal(
    isHookedWeapon(sword),
    true,
    "Undoing revertHookedWeapon MUST restore weapon's Hooked state and properties on Item document (WORKFLOW §3.2 reversibility)"
  );

  // Ensure sword is hooked for following tests
  sword.flags.ak5e.isHooked = true;
  sword.system.properties.add("two");
  sword.system.properties.add("thr");
  actor.flags.ak5e.hookmaster.hookedWeaponId = sword.id;

  const target = createCreature("Enemy", "med");
  const targetHuge = createCreature("HugeEnemy", "huge");

  // --- C. bigBoot ---
  await specialistUses.execute(actor, "bigBoot", { targetUuid: target.uuid, targetName: target.name });
  const useIdBoot = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, useIdBoot);

  // --- D. kingOfUrbanJungle ---
  await specialistUses.execute(actor, "kingOfUrbanJungle", { moved20ft: true });
  assert.equal(actor.flags.ak5e.hookmaster.urbanJungle.active, true);
  const useIdJungle = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, useIdJungle);
  assert.equal(actor.flags.ak5e.hookmaster.urbanJungle, null, "Urban jungle flag cleared on undo");

  // --- E. boundInRope ---
  const prowessBeforeBound = getPool(actor, "prowess").value;
  await specialistUses.execute(actor, "boundInRope", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(getPool(actor, "prowess").value, prowessBeforeBound - 1);
  assert.equal(isHookLocked(actor), true);
  const useIdBound = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, useIdBound);
  assert.equal(getPool(actor, "prowess").value, prowessBeforeBound, "Prowess refunded on undo boundInRope");
  assert.equal(isHookLocked(actor), false, "Hook unlocked on undo boundInRope");
  assert.equal(actor.flags.ak5e.hookmaster.grappledTarget, null);

  // --- F. wrangler ---
  const prowessBeforeWrangler = getPool(actor, "prowess").value;
  await specialistUses.execute(actor, "wrangler", { targetUuid: targetHuge.uuid, targetName: targetHuge.name });
  assert.equal(getPool(actor, "prowess").value, prowessBeforeWrangler - 1);
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget.uuid, targetHuge.uuid);
  const useIdWrangler = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, useIdWrangler);
  assert.equal(getPool(actor, "prowess").value, prowessBeforeWrangler, "Prowess refunded on undo wrangler");
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget, null, "Wrangler target cleared on undo");

  // --- G. mightyPush ---
  const mightyBefore = actor.flags.ak5e.resourcePools.mightyPush.value;
  await specialistUses.execute(actor, "mightyPush", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(actor.flags.ak5e.resourcePools.mightyPush.value, mightyBefore - 1);
  const useIdPush = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, useIdPush);
  assert.equal(actor.flags.ak5e.resourcePools.mightyPush.value, mightyBefore, "Mighty push use refunded on undo");

  // --- H. scorpionSting ---
  const stingBefore = actor.flags.ak5e.resourcePools.scorpionSting.value;
  await specialistUses.execute(actor, "scorpionSting", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(actor.flags.ak5e.resourcePools.scorpionSting.value, stingBefore - 1);
  const useIdSting = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, useIdSting);
  assert.equal(actor.flags.ak5e.resourcePools.scorpionSting.value, stingBefore, "Scorpion sting use refunded on undo");
});

/* ==============================================================================
 * Test 10: Hook Dispatch Integration via Hooks.callAll
 * ============================================================================== */
test("Adversarial 10: Hook Dispatch Integration via Hooks.callAll", async () => {
  const actor = createHookmasterActor(5);
  // STR 16 (+3), DEX 14 (+2)
  actor.system.abilities.str = { mod: 3, value: 16 };
  actor.system.abilities.dex = { mod: 2, value: 14 };

  const hook = createWeapon("Hook", { actionType: "rwak", damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  // 1. Ranged attack STR replacement via Hooks.callAll("dnd5e.preRollAttackV2")
  const attackConfig = {
    actor,
    item: hook,
    actionType: "rwak",
    rolls: [{ parts: ["1d20", "2"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  assert.ok(attackConfig.rolls[0].parts.includes("1"), "STR - DEX diff (3 - 2 = 1) added to ranged hook attack");

  // 2. When DEX >= STR, no penalty is added
  actor.system.abilities.dex = { mod: 4, value: 18 };
  const attackConfigDex = {
    actor,
    item: hook,
    actionType: "rwak",
    rolls: [{ parts: ["1d20", "4"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfigDex);
  assert.equal(attackConfigDex.rolls[0].parts.length, 2, "No penalty added when DEX >= STR");

  // 3. Ranged damage STR replacement via Hooks.callAll("dnd5e.preRollDamageV2")
  actor.system.abilities.dex = { mod: 2, value: 14 };
  const damageConfig = {
    actor,
    item: hook,
    actionType: "rwak",
    rolls: [{ parts: ["1d8", "2"], options: {} }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
  assert.ok(damageConfig.rolls[0].parts.includes("1"), "STR - DEX diff (1) added to ranged hook damage");
});

/* ==============================================================================
 * Test 11: Receipt Lifecycle and Status Integrity
 * ============================================================================== */
test("Adversarial 11: Receipt Lifecycle and Status Integrity", async () => {
  const actor = createHookmasterActor(11, { prowess: 4, mightyPush: 4 });
  const hook = createWeapon("Hook", { damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const target = createCreature("Enemy", "med");

  // EMPIRICAL DEFECT CHECK: Big Boot has no dice formula and must transition to 'complete', not get stuck in 'awaitingRoll'
  await specialistUses.execute(actor, "bigBoot", { targetUuid: target.uuid, targetName: target.name });
  const bootReceipt = actor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(bootReceipt.status, "complete", "bigBoot receipt status must be 'complete' since it requires no interactive dice roll");

  // EMPIRICAL DEFECT CHECK: Bound in Rope has no dice formula and must transition to 'complete', not get stuck in 'awaitingRoll'
  await specialistUses.execute(actor, "boundInRope", { targetUuid: target.uuid, targetName: target.name });
  const boundReceipt = actor.flags.ak5e.specialistUses.undo.slice(-1)[0];
  assert.equal(boundReceipt.status, "complete", "boundInRope receipt status must be 'complete' since it requires no interactive dice roll");
});
