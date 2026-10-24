/**
 * Comprehensive automated test suite for AK5e Hookmaster Specialist Subclass (Ch. 3 L5585–5679).
 * Tests all 14 functional areas + encounter-window undo reversibility:
 *  1. Hookmaster Identification & Subclass Predicates
 *  2. Hooked Weapon Conversion Prerequisites & Validation
 *  3. Free Starting Conversion vs 200 LMD Cost
 *  4. Converted Weapon Mechanical Properties (Two-Handed, Thrown 30/50, STR mod, Returning)
 *  5. Level 5: Big Boot (10 ft Unarmed push, doubled with Urban Jungle)
 *  6. Level 5: King of the Urban Jungle (pre-movement, 2x range flying, +PB damage, prowess trigger)
 *  7. Level 5: Bound in Rope (grapple, 15 ft drag, hogtie, hook lockout, release)
 *  8. Level 5: Wrangler (latch on > +1 size, shared space, advantage, -5 DR bypass)
 *  9. Hookmaster Prowess Gain Triggers (environmental/falling damage, >45 ft flying movement)
 * 10. Level 11: Mighty Push (8d6 bludgeoning, 20 ft knockback, obstacle collision damage)
 * 11. Level 15: Spider's Essence (50 ft Hook, Spider's Thread climb speed, Swing to Safety)
 * 12. Level 20: Scorpion Sting (1/LR, Grappled/Latched auto-fail, 6 attacks at advantage + half level damage)
 * 13. Reversibility & Encounter-Window Undo (WORKFLOW §3.2)
 * 14. Hook Registration Idempotency & GM Target Relay (validateTarget)
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
  hasSwingToSafety, hasScorpionSting, HOOKMASTER_SUBCLASS_ID
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

function createCreature(name, { size = "med", strMod = 2, dexMod = 2 } = {}) {
  return createTestActor({
    name,
    system: {
      traits: { size },
      abilities: {
        str: { mod: strMod, value: 10 + 2 * strMod },
        dex: { mod: dexMod, value: 10 + 2 * dexMod }
      }
    }
  });
}

/* ---------------------------------------------------------------- Test Cases */

test("Area 1: Hookmaster Identification & Subclass Predicates", () => {
  const actor = createHookmasterActor(1);
  assert.equal(isSpecialist(actor), true, "Actor is a Specialist");
  assert.equal(isHookmaster(actor), true, "Actor is identified as Hookmaster");

  const nonHookmaster = createTestActor({
    name: "Base Specialist",
    items: [createTestItem({ name: "Specialist", type: "class", flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } })],
    flags: { ak5e: { specialist: { enabled: true, branch: null } } }
  });
  assert.equal(isHookmaster(nonHookmaster), false, "Non-Hookmaster returns false");

  // Level-based feature unlocks
  const lv1 = createHookmasterActor(1);
  assert.equal(hasBigBoot(lv1), false);
  assert.equal(hasKingOfUrbanJungle(lv1), false);
  assert.equal(hasBoundInRope(lv1), false);
  assert.equal(hasWrangler(lv1), false);
  assert.equal(hasMightyPush(lv1), false);
  assert.equal(hasSpidersEssence(lv1), false);
  assert.equal(hasScorpionSting(lv1), false);

  const lv5 = createHookmasterActor(5);
  assert.equal(hasBigBoot(lv5), true);
  assert.equal(hasKingOfUrbanJungle(lv5), true);
  assert.equal(hasBoundInRope(lv5), true);
  assert.equal(hasWrangler(lv5), true);
  assert.equal(hasMightyPush(lv5), false);

  const lv11 = createHookmasterActor(11);
  assert.equal(hasMightyPush(lv11), true);
  assert.equal(hasSpidersEssence(lv11), false);

  const lv15 = createHookmasterActor(15);
  assert.equal(hasSpidersEssence(lv15), true);
  assert.equal(hasLongerHook(lv15), true);
  assert.equal(hasSpidersThread(lv15), true);
  assert.equal(hasSwingToSafety(lv15), true);
  assert.equal(hasScorpionSting(lv15), false);

  const lv20 = createHookmasterActor(20);
  assert.equal(hasScorpionSting(lv20), true);
});

test("Area 2: Hooked Weapon Conversion Prerequisites & Validation", () => {
  // 1. Valid Melee Slashing weapon
  const scimitar = createWeapon("Scimitar", { actionType: "mwak", damageType: "slashing", properties: ["fin", "lgt"] });
  const check1 = canConvertWeaponToHook(scimitar);
  assert.equal(check1.valid, true, "Scimitar is valid for Hook conversion");

  // 2. Valid Melee Piercing weapon
  const rapier = createWeapon("Rapier", { actionType: "mwak", damageType: "piercing", properties: ["fin"] });
  const check2 = canConvertWeaponToHook(rapier);
  assert.equal(check2.valid, true, "Rapier is valid for Hook conversion");

  // 3. Invalid: Two-Handed weapon
  const greatsword = createWeapon("Greatsword", { actionType: "mwak", damageType: "slashing", properties: ["two", "hvy"] });
  const check3 = canConvertWeaponToHook(greatsword);
  assert.equal(check3.valid, false, "Greatsword is invalid because it is Two-Handed");
  assert.ok(check3.reasons.some(r => r.includes("Two-Handed")));

  // 4. Invalid: Ranged weapon
  const shortbow = createWeapon("Shortbow", { actionType: "rwak", damageType: "piercing", properties: ["amm", "two"] });
  const check4 = canConvertWeaponToHook(shortbow);
  assert.equal(check4.valid, false, "Shortbow is invalid because it is Ranged");

  // 5. Invalid: Bludgeoning only
  const club = createWeapon("Club", { actionType: "mwak", damageType: "bludgeoning", properties: ["lgt"] });
  const check5 = canConvertWeaponToHook(club);
  assert.equal(check5.valid, false, "Club is invalid because it deals Bludgeoning damage");
  assert.ok(check5.reasons.some(r => r.includes("Slashing or Piercing")));
});

test("Area 3: Free Starting Conversion vs 200 LMD Cost", async () => {
  const actor = createHookmasterActor(1, { lmd: 1300, freeConversionUsed: false });
  const scimitar = createWeapon("Scimitar", { damageType: "slashing" });
  addItem(actor, scimitar);

  // 1. First conversion is free
  const res1 = await specialistUses.execute(actor, "convertHookedWeapon", { itemId: scimitar.id });
  assert.equal(res1.free, true, "First conversion is free");
  assert.equal(actor.flags.ak5e.hookmaster.freeConversionUsed, true, "freeConversionUsed is marked true");
  assert.equal(actor.system.currency.lmd, 1300, "Currency is unchanged on free conversion");
  assert.equal(isHookedWeapon(scimitar), true, "Scimitar is now a Hooked weapon");

  // 2. Revert the weapon
  await specialistUses.execute(actor, "revertHookedWeapon", { itemId: scimitar.id });
  assert.equal(isHookedWeapon(scimitar), false, "Scimitar is reverted");

  // 3. Second conversion costs 200 LMD
  const res2 = await specialistUses.execute(actor, "convertHookedWeapon", { itemId: scimitar.id });
  assert.equal(res2.free, false, "Second conversion is not free");
  assert.equal(actor.system.currency.lmd, 1100, "200 LMD was deducted");
  assert.equal(isHookedWeapon(scimitar), true, "Scimitar is hooked again");

  // 4. Insufficient currency triggers shortfall warning and clamps at 0 if overridden
  const poorActor = createHookmasterActor(1, { lmd: 50, freeConversionUsed: true });
  const dagger = createWeapon("Dagger", { damageType: "piercing" });
  addItem(poorActor, dagger);

  assert.throws(() => {
    specialistUses.plan(poorActor, "convertHookedWeapon", { itemId: dagger.id });
  }, /Insufficient currency/, "Throws PlayWarnings for insufficient currency");

  await specialistUses.execute(poorActor, "convertHookedWeapon", { itemId: dagger.id, overrides: ["currency"] });
  assert.equal(poorActor.system.currency.lmd, 0, "Currency clamped at 0 on shortfall override");
  assert.equal(isHookedWeapon(dagger), true, "Dagger was successfully converted with override");
});

test("Area 4: Converted Weapon Mechanical Properties", async () => {
  const actor = createHookmasterActor(1);
  const rapier = createWeapon("Rapier", { damageType: "piercing", properties: ["fin"] });
  addItem(actor, rapier);

  await specialistUses.execute(actor, "convertHookedWeapon", { itemId: rapier.id });

  // Two-Handed and Thrown (30/-)
  assert.equal(rapier.system.properties.has("two"), true, "Gains Two-Handed property");
  assert.equal(rapier.system.properties.has("thr"), true, "Gains Thrown property");
  assert.equal(rapier.system.range.value, 30, "Thrown range is 30 ft at level 1");

  // Only Hookmasters are proficient
  assert.equal(isProficientWithHook(actor, rapier), true, "Hookmaster is proficient with Hook");
  const wizard = createTestActor({ name: "Wizard" });
  assert.equal(isProficientWithHook(wizard, rapier), false, "Non-Hookmaster is NOT proficient with Hook");

  // STR mod on ranged Hook attacks
  const attackConfig = {
    actionType: "rwak",
    subject: { actor, item: rapier },
    rolls: [{ parts: [] }]
  };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  // Actor STR is +3, DEX is +2; diff is +1
  assert.ok(attackConfig.rolls[0].parts.includes("1"), "STR bonus diff (+1) applied to ranged attack roll");

  // STR mod on ranged Hook damage
  const damageConfig = {
    actionType: "rwak",
    subject: { actor, item: rapier },
    rolls: [{ parts: [] }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
  assert.ok(damageConfig.rolls[0].parts.includes("1"), "STR bonus diff (+1) applied to ranged damage roll");

  // Level 15 Longer Hook range
  const lv15Actor = createHookmasterActor(15);
  assert.equal(calculateHookRange(lv15Actor), 50, "Hook range is 50 ft at level 15+");
});

test("Area 5: Level 5 - Big Boot", async () => {
  const actor = createHookmasterActor(5);
  const target = createCreature("Goblin", { size: "sm" });
  const giant = createCreature("Giant", { size: "huge" });

  // 1. Normal Big Boot: 10 ft push on <= +1 size
  const res = await specialistUses.execute(actor, "bigBoot", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(res.pushDistance, 10, "Pushes target 10 feet directly away");

  // 2. King of the Urban Jungle synergy: doubled to 20 ft
  actor.flags.ak5e.hookmaster.urbanJungle = { active: true };
  const res2 = await specialistUses.execute(actor, "bigBoot", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(res2.pushDistance, 20, "Distance is doubled to 20 feet when King of the Urban Jungle is active");

  // 3. Warning on creature > +1 size
  assert.throws(() => {
    specialistUses.plan(actor, "bigBoot", { targetUuid: giant.uuid, targetName: giant.name });
  }, /more than one size larger/, "Throws warning when target is more than one size larger");
});

test("Area 6: Level 5 - King of the Urban Jungle", async () => {
  const actor = createHookmasterActor(5);

  // 1. Warning if 20 ft pre-movement not met
  assert.throws(() => {
    specialistUses.plan(actor, "kingOfUrbanJungle", { moved20ft: false });
  }, /moved at least 20 feet/, "Throws warning if 20 ft pre-movement was not made");

  // 2. Successful activation
  const res = await specialistUses.execute(actor, "kingOfUrbanJungle", { moved20ft: true });
  assert.equal(res.flyingSpeed, 60, "Flying speed is 60 ft (2 * 30 ft range)");
  assert.equal(actor.flags.ak5e.hookmaster.urbanJungle.active, true, "Urban Jungle state is active");
  assert.equal(actor.flags.ak5e.hookmaster.flyingMovementThisTurn, 60, "Tracks 60 ft flying movement");

  // 3. Melee damage bonus (+PB)
  const damageConfig = {
    actionType: "mwak",
    subject: { actor },
    rolls: [{ parts: [] }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
  // Level 5 PB is 3
  assert.ok(damageConfig.rolls[0].parts.includes("3"), "Proficiency bonus (+3) added to immediate melee attack damage");

  // 4. Conclude on melee hit event
  await emitAk5eEvent("hit", { raw: { actor }, actionType: "mwak", isMelee: true });
  assert.equal(actor.flags.ak5e.hookmaster.urbanJungle.active, false, "Urban jungle concludes on melee hit");

  // 5. Prowess gain trigger at turn end if moved > 45 ft with flying speed
  const prowBefore = getPool(actor, "prowess").value;
  actor.flags.ak5e.hookmaster.flyingMovementThisTurn = 50;
  await emitAk5eEvent("turnEnd", { raw: { actor } });
  const prowAfter = getPool(actor, "prowess").value;
  assert.equal(prowAfter, Math.min(getPool(actor, "prowess").max, prowBefore + 1), "Gained 1 Prowess on turnEnd after >45 ft flying movement");
});

test("Area 7: Level 5 - Bound in Rope", async () => {
  const actor = createHookmasterActor(5, { prowess: 2 });
  const hook = createWeapon("Hooked Scimitar");
  hook.flags.ak5e.isHooked = true;
  addItem(actor, hook);
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const target = createCreature("Bandit", { size: "med" });

  // 1. Execute Bound in Rope: spends 1 Prowess, sets Martial DC, grapples target and locks Hook
  const res = await specialistUses.execute(actor, "boundInRope", { targetUuid: target.uuid, targetName: target.name, distance: 20 });
  assert.equal(res.grappled, true, "Target is grappled");
  assert.equal(res.dc, martialDC(actor), "Sets DEX save vs Martial DC");
  assert.equal(getPool(actor, "prowess").value, 1, "Expended 1 Prowess");
  assert.equal(isHookLocked(actor), true, "Hook use is locked while grappling");
  assert.equal(actor.flags.ak5e.hookmaster.grappledTarget.uuid, target.uuid);

  // 2. Drag Bound Target (Bonus Action up to 15 ft)
  const dragRes = await specialistUses.execute(actor, "dragBoundTarget", { distance: 15 });
  assert.equal(dragRes.distance, 15, "Dragged 15 feet");

  // 3. Hogtie within 5 ft (Action)
  const hogtieRes = await specialistUses.execute(actor, "hogtie", { distance: 5 });
  assert.equal(hogtieRes.hogtied, true, "Target hogtied within 5 ft");

  // 4. Release grapple unlocks Hook
  await specialistUses.execute(actor, "releaseGrapple", {});
  assert.equal(isHookLocked(actor), false, "Hook unlocked upon releasing grapple");
  assert.equal(actor.flags.ak5e.hookmaster.grappledTarget, null, "Grappled target cleared");

  // 5. Warning if target is > +1 size
  const giant = createCreature("Giant", { size: "huge" });
  assert.throws(() => {
    specialistUses.plan(actor, "boundInRope", { targetUuid: giant.uuid, targetName: giant.name });
  }, /more than one size larger/, "Throws warning for > +1 size target");
});

test("Area 8: Level 5 - Wrangler", async () => {
  const actor = createHookmasterActor(5, { prowess: 2 });
  const hook = createWeapon("Hooked Rapier");
  hook.flags.ak5e.isHooked = true;
  addItem(actor, hook);
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const hugeBeast = createCreature("Mammoth", { size: "huge" });
  const mediumHuman = createCreature("Guard", { size: "med" });

  // 1. Warning if target <= +1 size
  assert.throws(() => {
    specialistUses.plan(actor, "wrangler", { targetUuid: mediumHuman.uuid, targetName: mediumHuman.name });
  }, /must be more than one size larger/, "Throws warning if target is not more than one size larger");

  // 2. Execute Wrangler: spends 1 Prowess, latches onto creature
  const res = await specialistUses.execute(actor, "wrangler", { targetUuid: hugeBeast.uuid, targetName: hugeBeast.name, ignoreDR: true });
  assert.equal(res.latched, true, "Latched onto target");
  assert.equal(res.dc, martialDC(actor), "DEX save vs Martial DC");
  assert.equal(getPool(actor, "prowess").value, 1, "1 Prowess spent");
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget.uuid, hugeBeast.uuid);

  // 3. Advantage on attack rolls against target & -5 penalty for DR bypass
  const attackConfig = {
    actionType: "mwak",
    subject: { actor, item: hook },
    targetUuid: hugeBeast.uuid,
    rolls: [{ parts: [] }]
  };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  assert.equal(attackConfig.advantage, true, "Attacks against latched creature have Advantage");
  assert.ok(attackConfig.rolls[0].parts.includes("-5"), "-5 penalty applied to ignore DR");

  // 4. Release Wrangler
  await specialistUses.execute(actor, "releaseWrangler", {});
  assert.equal(actor.flags.ak5e.hookmaster.wranglerTarget, null, "Wrangler latch released");
});

test("Area 9: Hookmaster Prowess Gain Triggers", async () => {
  const actor = createHookmasterActor(5, { prowess: 0 });

  // Environmental damage trigger: falling damage grants 1 Prowess
  await emitAk5eEvent("hit", { raw: { actor }, damageType: "falling", environmental: true });
  assert.equal(getPool(actor, "prowess").value, 1, "Gained 1 Prowess from environmental/falling damage");

  // Collision damage trigger
  await emitAk5eEvent("hit", { raw: { actor }, collision: true });
  assert.equal(getPool(actor, "prowess").value, 2, "Gained 1 Prowess from collision damage");
});

test("Area 10: Level 11 - Mighty Push", async () => {
  const actor = createHookmasterActor(11, { mightyPush: 4 });
  const target = createCreature("Enemy Guard");

  // 1. Warning if target > 5 ft away
  assert.throws(() => {
    specialistUses.plan(actor, "mightyPush", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  }, /within 5 feet/, "Throws warning if target is not within 5 feet");

  // 2. Execute Mighty Push
  const opId = "push-op-test";
  const res = await specialistUses.execute(actor, "mightyPush", { targetUuid: target.uuid, targetName: target.name, collision: true }, opId);
  const pushReceipt = specialistUses.receipt(actor, opId);

  assert.equal(pushReceipt.formula, "8d6", "Interactive 8d6 damage formula");
  assert.equal(pushReceipt.rollLabel, "Mighty Push Bludgeoning Damage");
  assert.equal(pushReceipt.dc, martialDC(actor), "STR save vs Martial DC");

  assert.equal(res.dc, martialDC(actor));
  assert.equal(res.collision, true);
  assert.equal(getPool(actor, "mightyPush").value, 3, "Expended 1 Mighty Push use");
});

test("Area 11: Level 15 - Spider's Essence", async () => {
  const actor = createHookmasterActor(15);

  // 1. Longer Hook (50/- range)
  assert.equal(calculateHookRange(actor), 50, "Hook range is 50 ft at level 15");

  // 2. Spider's Thread
  const res = await specialistUses.execute(actor, "spidersThread", { surfacePoint: "ceiling anchor" });
  assert.equal(res.climbingSpeed, 50, "Grants 50 ft climbing speed");

  // 3. Swing to Safety (Reaction while falling >= 10 ft)
  const res2 = await specialistUses.execute(actor, "swingToSafety", { fallingHeight: 30 });
  assert.equal(res2.avoidedFallingDamage, true, "Avoided falling damage via Swing to Safety");
  assert.equal(actor.flags.ak5e.hookmaster.urbanJungle.active, true, "King of the Urban Jungle triggered on reaction");
});

test("Area 12: Level 20 - Scorpion Sting", async () => {
  const actor = createHookmasterActor(20, { scorpionSting: 1 });
  const hook = createWeapon("Hooked Saber");
  hook.flags.ak5e.isHooked = true;
  addItem(actor, hook);
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const target = createCreature("Boss Monster", { size: "med" });

  // 1. Normal Scorpion Sting: target DEX save vs Martial DC
  const res = await specialistUses.execute(actor, "scorpionSting", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(res.attackCount, 6, "Makes 6 Attacks");
  assert.equal(res.bonusDamage, 10, "+10 damage per attack (half Specialist level)");
  assert.equal(res.autoFail, false, "Auto-fail is false when not grappled/latched");
  assert.equal(getPool(actor, "scorpionSting").value, 0, "Expended 1/LR Scorpion Sting use");

  // 2. Scorpion Sting on Grappled Target: automatically fails Save and ignores Hook lockout
  refundPool(actor, "scorpionSting", 1);
  actor.flags.ak5e.hookmaster.grappledTarget = { uuid: target.uuid, name: target.name };
  actor.flags.ak5e.hookmaster.hookLocked = true;

  const resAutoFail = await specialistUses.execute(actor, "scorpionSting", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(resAutoFail.autoFail, true, "Target automatically fails saving throw when grappled/latched");

  // 3. PreRollDamage bonus damage check (+10)
  const damageConfig = {
    isScorpionSting: true,
    subject: { actor, item: hook },
    rolls: [{ parts: [] }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", damageConfig);
  assert.ok(damageConfig.rolls[0].parts.includes("10"), "Scorpion sting adds +10 bonus weapon damage");
});

test("Area 13: Table-Play Reversibility & Encounter-Window Undo", async () => {
  const actor = createHookmasterActor(5, { lmd: 1300, prowess: 2 });
  const rapier = createWeapon("Rapier", { damageType: "piercing" });
  addItem(actor, rapier);

  // 1. Convert weapon
  const convReceipt = await specialistUses.execute(actor, "convertHookedWeapon", { itemId: rapier.id });
  const convUseId = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  assert.equal(isHookedWeapon(rapier), true, "Weapon converted");

  // 2. Undo conversion
  await specialistUses.undo(actor, convUseId);
  assert.equal(isHookedWeapon(rapier), false, "Weapon reverted on undo");
  assert.equal(actor.flags.ak5e.hookmaster.freeConversionUsed, false, "freeConversionUsed reverted to false");

  // 3. Bound in Rope spend & undo
  rapier.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = rapier.id;
  const target = createCreature("Target");

  await specialistUses.execute(actor, "boundInRope", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(getPool(actor, "prowess").value, 1, "Prowess spent");
  assert.equal(isHookLocked(actor), true, "Hook locked");

  const boundUseId = actor.flags.ak5e.specialistUses.undo.slice(-1)[0].id;
  await specialistUses.undo(actor, boundUseId);
  assert.equal(getPool(actor, "prowess").value, 2, "Prowess refunded on undo");
  assert.equal(isHookLocked(actor), false, "Hook unlocked on undo");
  assert.equal(actor.flags.ak5e.hookmaster.grappledTarget, null, "Grapple target cleared on undo");
});

test("Area 14: Hook Registration Idempotency & GM Target Relay (validateTarget)", () => {
  // Idempotency: re-running hook registration doesn't throw or duplicate listeners
  const attackListenersBefore = Hooks._hooks.get("dnd5e.preRollAttackV2")?.length ?? 0;
  const damageListenersBefore = Hooks._hooks.get("dnd5e.preRollDamageV2")?.length ?? 0;

  assert.equal(attackListenersBefore, 1, "Exactly 1 preRollAttackV2 listener registered initially");
  assert.equal(damageListenersBefore, 1, "Exactly 1 preRollDamageV2 listener registered initially");

  // Re-registering does not duplicate listeners
  registerHookmasterHooks();
  registerHookmasterHooks();

  const attackListenersAfter = Hooks._hooks.get("dnd5e.preRollAttackV2")?.length ?? 0;
  const damageListenersAfter = Hooks._hooks.get("dnd5e.preRollDamageV2")?.length ?? 0;

  assert.equal(attackListenersAfter, 1, "Attack hook count invariant under re-registration");
  assert.equal(damageListenersAfter, 1, "Damage hook count invariant under re-registration");

  // ValidateTarget checkers
  const mockTarget = { uuid: "Actor.mock123" };
  const matchingEntry = { uuid: "Actor.mock123" };
  const wrongEntry = { uuid: "Actor.other456" };

  assert.equal(HOOKMASTER_PLANS.bigBoot.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(HOOKMASTER_PLANS.bigBoot.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(HOOKMASTER_PLANS.boundInRope.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(HOOKMASTER_PLANS.boundInRope.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(HOOKMASTER_PLANS.wrangler.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(HOOKMASTER_PLANS.wrangler.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(HOOKMASTER_PLANS.mightyPush.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(HOOKMASTER_PLANS.mightyPush.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(HOOKMASTER_PLANS.scorpionSting.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(HOOKMASTER_PLANS.scorpionSting.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(HOOKMASTER_PLANS.bonusActionHookAttack.validateTarget({}, {}, matchingEntry, mockTarget), true);
  assert.equal(HOOKMASTER_PLANS.bonusActionHookAttack.validateTarget({}, {}, wrongEntry, mockTarget), false);

  assert.equal(HOOKMASTER_PLANS.convertHookedWeapon.validateTarget(), false);
  assert.equal(HOOKMASTER_PLANS.revertHookedWeapon.validateTarget(), false);
  assert.equal(HOOKMASTER_PLANS.releaseGrapple.validateTarget(), false);
  assert.equal(HOOKMASTER_PLANS.releaseWrangler.validateTarget(), false);
});

test("Area 15: Bonus Action Hook Attack, 10 ft Pull, Hook Lockout, Big Boot Doubling, and Wrangler DR Bypass", async () => {
  const actor = createHookmasterActor(5);
  const hook = createWeapon("Hook", { damageType: "slashing", properties: ["two", "thr"] });
  addItem(actor, hook);
  hook.flags.ak5e.isHooked = true;
  actor.flags.ak5e.hookmaster.hookedWeaponId = hook.id;

  const target = createTestActor({ name: "Medium Target", uuid: "Actor.med1", system: { traits: { size: "med" } } });
  globalThis._ak5eTestDocs.set(target.uuid, target);

  // 1. Bonus Action Hook Attack plan
  const planBA = await specialistUses.execute(actor, "bonusActionHookAttack", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(planBA.bonusActionHookAttack, true);
  assert.equal(actor.flags.ak5e.hookmaster.bonusActionHookAttackUsedThisTurn, true);
  assert.equal(actor.flags.ak5e.hookmaster.rangedHookAttacksThisTurn, 1);

  // Re-attempting BA attack warns/fails prior attack restriction
  const planBARepeat = specialistUses.plan(actor, "bonusActionHookAttack", { targetUuid: target.uuid, checkOnly: true });
  assert.ok(planBARepeat.warnings.some(w => w.id === "priorAttack" || w.id === "alreadyUsed"));
  assert.throws(() => {
    specialistUses.plan(actor, "bonusActionHookAttack", { targetUuid: target.uuid });
  });

  // 2. 10 ft Pull on Ranged Hook hit (Ch. 3 L5596)
  await emitAk5eEvent("hit", {
    raw: { actor, target, item: hook },
    targetUuid: target.uuid,
    actionType: "rwak",
    isRanged: true,
    isHook: true
  });
  assert.equal(actor.flags.ak5e.hookmaster.lastRangedHookPullTarget?.pullDistance, 10);

  // 3. Hook Lockout in preRollAttack (Ch. 3 L5640)
  actor.flags.ak5e.hookmaster.hookLocked = true;
  const attackLocked = { actionType: "mwak", subject: { actor, item: hook }, rolls: [{ parts: [] }] };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackLocked);
  assert.equal(attackLocked.rolls[0].options._ak5eHookLocked, true);
  actor.flags.ak5e.hookmaster.hookLocked = false;

  // 4. Urban Jungle Hook Attack Restriction in preRollAttack (Ch. 3 L5622)
  actor.flags.ak5e.hookmaster.urbanJungle = { active: true };
  const attackFlight = { actionType: "mwak", subject: { actor, item: hook }, rolls: [{ parts: [] }] };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackFlight);
  assert.equal(attackFlight.rolls[0].options._ak5eUrbanJungleAttackRestricted, true);

  // 5. Big Boot Forced Movement Doubling after melee hit concludes Urban Jungle
  await emitAk5eEvent("hit", { raw: { actor }, actionType: "mwak", isMelee: true });
  assert.equal(actor.flags.ak5e.hookmaster.urbanJungle.active, false);
  assert.equal(actor.flags.ak5e.hookmaster.meleeForcedMovementDoubled, true);

  const bootRes = await specialistUses.execute(actor, "bigBoot", { targetUuid: target.uuid, targetName: target.name });
  assert.equal(bootRes.pushDistance, 20, "Big Boot push distance is doubled to 20 ft immediately following flight melee strike");
  assert.equal(actor.flags.ak5e.hookmaster.meleeForcedMovementDoubled, false);

  // 6. Wrangler DR Bypass propagation to preRollDamage
  actor.flags.ak5e.hookmaster.wranglerTarget = { uuid: target.uuid, name: target.name, ignoreDR: true };
  const wrDamage = { actionType: "mwak", subject: { actor, item: hook }, targetUuid: target.uuid, rolls: [{ parts: [] }] };
  await Hooks.callAll("dnd5e.preRollDamageV2", wrDamage);
  assert.equal(wrDamage.options.ignoreDamageReduction, true);
  assert.equal(wrDamage.options.ignoreDR, true);
});
