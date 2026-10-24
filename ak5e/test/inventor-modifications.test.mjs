/**
 * Comprehensive Automated Test Suite for AK5e Inventor Modifications Catalog & Activation (Ch. 3 L5958–6140).
 * Milestone 2 coverage:
 *  1. Catalog Completeness & Metadata Integrity (all 28 modifications, 3 categories, 3 dangerous)
 *  2. Damage Scaling Mathematics (Laser Cutter, Arts Cannon, Flame Gout across levels 1-20)
 *  3. Conditions Handling (Blinded, Bleeding, Dazed, Nervous Impairment, Burning, Prone, immunities)
 *  4. Melee Weapon Modifications Activations (10 modifications: Boom Module, Burning Edge, Collapsible Weapon,
 *     Flexible Weapon, Laser Cutter [Dangerous], Returner, Rotary Blade, Shock Engine, Telescopic Weapon, Trick Weapon)
 *  5. Ranged Weapon Modifications Activations (8 modifications: Arts Cannon [Dangerous], Collapsible Weapon,
 *     Explosive Shots, Electrobolts, Flame Gout, Homing Shots, Melee Attachment, Safety Removal)
 *  6. Armor Modifications Activations (10 modifications: Adrenal Overloader [Dangerous], Artsfield Generator,
 *     Camouflage Cloak, Exoskeleton, Jetboots, Life Support, Powered Gauntlet, Refocuser, Shock Absorbers, Wingsuit)
 *  7. Activation Prerequisites, Breakdown Triggering, HP Clamping, and Broken Equipment Rider Gating
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isInventor,
  calculateInventorDC,
  registerInventorPools,
  defineInventorPools
} from "../scripts/specialist-rules.mjs";
import {
  calculateInstability,
  evaluateBreakdownRoll,
  applyEquipmentModification,
  removeEquipmentModification,
  repairBrokenEquipment,
  isBrokenEquipment,
  isModifiableEquipment,
  isMagicalEquipment,
  getItemModifications,
  getModification,
  MODIFICATIONS_CATALOG,
  MODIFICATION_CATEGORIES,
  registerInventorHooks,
  isMeleeWeapon,
  isRangedWeapon,
  getArmorType,
  weaponDealsDamageType,
  isTwoHandedWeapon,
  isLightWeapon,
  isHeavyWeapon,
  isFirearmWeapon,
  INVENTOR_CONDITIONS,
  applyConditionToActor,
  getModificationDamageFormula,
  getModificationSaveInfo,
  validateModificationCompatibility,
  executeModificationActivation
} from "../scripts/inventor-features.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineInventorPools();
  registerInventorHooks();
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

function createInventorActor(level = 1, options = {}) {
  const actor = createTestActor({
    name: "Test Inventor",
    level,
    class: "specialist",
    branch: "inventor",
    system: {
      details: { level },
      attributes: {
        prof: options.prof ?? (level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2),
        hp: { value: options.hp ?? 30, max: options.maxHp ?? 30 }
      },
      abilities: {
        str: { value: options.str ?? 10, mod: options.strMod ?? 0 },
        dex: { value: options.dex ?? 14, mod: options.dexMod ?? 2 },
        con: { value: options.con ?? 14, mod: options.conMod ?? 2 },
        int: { value: options.int ?? 16, mod: options.intMod ?? 3 },
        wis: { value: options.wis ?? 10, mod: options.wisMod ?? 0 },
        cha: { value: options.cha ?? 10, mod: options.chaMod ?? 0 }
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: "brawler"
        }
      }
    }
  });

  return actor;
}

function createWeapon(name = "Shortsword", options = {}) {
  return createTestItem({
    id: options.id ?? `item-weapon-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: "weapon",
    system: {
      actionType: options.actionType ?? "mwak",
      weaponType: options.weaponType ?? "simpleM",
      properties: options.properties ?? new Set(),
      rarity: options.rarity ?? "common",
      damage: options.damage ?? { parts: [["1d6", options.damageType ?? "slashing"]] }
    },
    flags: {
      ak5e: {
        inventor: {
          modifications: options.modifications ?? []
        }
      }
    }
  });
}

function createArmor(name = "Leather Armor", options = {}) {
  return createTestItem({
    id: options.id ?? `item-armor-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: "equipment",
    system: {
      type: { value: options.armorType ?? "light" },
      armor: { value: options.ac ?? 11, type: options.armorType ?? "light" },
      properties: options.properties ?? new Set(),
      rarity: options.rarity ?? "common"
    },
    flags: {
      ak5e: {
        inventor: {
          modifications: options.modifications ?? []
        }
      }
    }
  });
}

/* ---------------------------------------------------------------- 1. Catalog Completeness */

test("1. Catalog Completeness & Metadata Integrity (28 modifications, 3 categories, 3 dangerous)", () => {
  const allMods = Object.values(MODIFICATIONS_CATALOG);
  assert.equal(allMods.length, 28, "Catalog must contain exactly 28 modifications");

  const melee = allMods.filter(m => m.category === MODIFICATION_CATEGORIES.MELEE);
  const ranged = allMods.filter(m => m.category === MODIFICATION_CATEGORIES.RANGED);
  const armor = allMods.filter(m => m.category === MODIFICATION_CATEGORIES.ARMOR);

  assert.equal(melee.length, 10, "Exactly 10 Melee Weapon Modifications");
  assert.equal(ranged.length, 8, "Exactly 8 Ranged Weapon Modifications");
  assert.equal(armor.length, 10, "Exactly 10 Armor Modifications");

  const dangerous = allMods.filter(m => m.isDangerous);
  assert.equal(dangerous.length, 3, "Exactly 3 Dangerous Modifications");
  const dangerousIds = dangerous.map(m => m.id).sort();
  assert.deepEqual(
    dangerousIds,
    ["adrenal-overloader", "arts-cannon", "laser-cutter"],
    "Dangerous modifications must be Adrenal Overloader, Arts Cannon, and Laser Cutter"
  );

  for (const m of allMods) {
    assert.ok(m.id, `Mod ${m.name} has id`);
    assert.ok(m.name, `Mod ${m.id} has name`);
    assert.ok(m.category, `Mod ${m.id} has category`);
    assert.ok(m.itemType, `Mod ${m.id} has itemType`);
    assert.ok(m.subType, `Mod ${m.id} has subType`);
    assert.ok(m.chapterThreeId, `Mod ${m.id} has chapterThreeId`);
    assert.ok(m.summary, `Mod ${m.id} has summary`);
    assert.equal(typeof m.isDangerous, "boolean", `Mod ${m.id} has boolean isDangerous`);
  }
});

/* ---------------------------------------------------------------- 2. Damage Scaling */

test("2. Damage Scaling Mathematics (Laser Cutter, Arts Cannon, Flame Gout across Levels 1-20)", () => {
  // Laser Cutter: 3d8 (1-6), 4d8 (7-13), 5d8 (14-20) Radiant
  assert.equal(getModificationDamageFormula("laser-cutter", 1), "3d8");
  assert.equal(getModificationDamageFormula("laser-cutter", 6), "3d8");
  assert.equal(getModificationDamageFormula("laser-cutter", 7), "4d8");
  assert.equal(getModificationDamageFormula("laser-cutter", 13), "4d8");
  assert.equal(getModificationDamageFormula("laser-cutter", 14), "5d8");
  assert.equal(getModificationDamageFormula("laser-cutter", 20), "5d8");

  // Arts Cannon: 3d8 (1-6), 4d8 (7-13), 5d8 (14-20) Force
  assert.equal(getModificationDamageFormula("arts-cannon", 1), "3d8");
  assert.equal(getModificationDamageFormula("arts-cannon", 6), "3d8");
  assert.equal(getModificationDamageFormula("arts-cannon", 7), "4d8");
  assert.equal(getModificationDamageFormula("arts-cannon", 13), "4d8");
  assert.equal(getModificationDamageFormula("arts-cannon", 14), "5d8");
  assert.equal(getModificationDamageFormula("arts-cannon", 20), "5d8");

  // Flame Gout: 1d8 (1-6), 2d8 (7-13), 3d8 (14-20) Fire
  assert.equal(getModificationDamageFormula("flame-gout", 1), "1d8");
  assert.equal(getModificationDamageFormula("flame-gout", 6), "1d8");
  assert.equal(getModificationDamageFormula("flame-gout", 7), "2d8");
  assert.equal(getModificationDamageFormula("flame-gout", 13), "2d8");
  assert.equal(getModificationDamageFormula("flame-gout", 14), "3d8");
  assert.equal(getModificationDamageFormula("flame-gout", 20), "3d8");
});

/* ---------------------------------------------------------------- 3. Conditions Handling */

test("3. Conditions Handling (Blinded, Bleeding, Dazed, Nervous Impairment, Burning, Prone, Immunities)", async () => {
  const target = createTestActor({
    name: "Target Foe",
    system: { details: { type: { value: "humanoid" } } }
  });

  // Prone
  const proneRes = await applyConditionToActor(target, INVENTOR_CONDITIONS.PRONE, true);
  assert.equal(proneRes.applied, true);
  assert.equal(target.flags?.ak5e?.conditions?.prone, true);

  // Bleeding
  const bleedRes = await applyConditionToActor(target, INVENTOR_CONDITIONS.BLEEDING, true);
  assert.equal(bleedRes.applied, true);
  assert.equal(target.flags?.ak5e?.conditions?.bleeding, true);

  // Dazed
  const dazedRes = await applyConditionToActor(target, INVENTOR_CONDITIONS.DAZED, true);
  assert.equal(dazedRes.applied, true);
  assert.equal(target.flags?.ak5e?.conditions?.dazed, true);

  // Nervous Impairment
  const nervRes = await applyConditionToActor(target, INVENTOR_CONDITIONS.NERVOUS_IMPAIRMENT, true);
  assert.equal(nervRes.applied, true);
  assert.equal(target.flags?.ak5e?.conditions?.["nervous-impairment"], true);

  // Burning
  const burnRes = await applyConditionToActor(target, INVENTOR_CONDITIONS.BURNING, true);
  assert.equal(burnRes.applied, true);
  assert.equal(target.flags?.ak5e?.conditions?.burning, true);

  // Blinded
  const blindRes = await applyConditionToActor(target, INVENTOR_CONDITIONS.BLINDED, true);
  assert.equal(blindRes.applied, true);
  assert.equal(target.flags?.ak5e?.conditions?.blinded, true);

  // Construct bleeding immunity (constructs cannot bleed per Ch. 1 L226)
  const construct = createTestActor({
    name: "Steel Golem",
    system: { details: { type: { value: "construct" } } }
  });
  const constructBleed = await applyConditionToActor(construct, INVENTOR_CONDITIONS.BLEEDING, true);
  assert.equal(constructBleed.applied, false);
  assert.equal(constructBleed.immune, true);

  // Condition immunity check
  const immuneActor = createTestActor({
    name: "Immune Foe",
    system: {
      details: { type: { value: "humanoid" } },
      traits: { ci: { value: ["dazed", "prone"] } }
    }
  });
  const immuneDaze = await applyConditionToActor(immuneActor, "dazed", true);
  assert.equal(immuneDaze.applied, false);
  assert.equal(immuneDaze.immune, true);
});

/* ---------------------------------------------------------------- 4. Melee Modifications */

test("4.1 Melee: Boom Module (Thunder damage, STR save vs DC, 20 ft knockback & Prone)", async () => {
  const actor = createInventorActor(1, { intMod: 3, prof: 2 }); // DC = 8 + 3 + 2 = 13
  const weapon = createWeapon("Warhammer", { damageType: "bludgeoning" });
  await applyEquipmentModification(weapon, "boom-module", { actor });

  const target = createTestActor({ name: "Foe", system: { abilities: { str: { mod: 0 } } } });

  // Target fails STR save
  const resultFail = await executeModificationActivation(weapon, "boom-module", actor, {
    targets: [target],
    targetSaveRoll: 5 // 5 + 0 = 5 < 13 -> fails
  });

  assert.equal(resultFail.success, true);
  assert.equal(resultFail.inventorDC, 13);
  assert.equal(resultFail.stateChanges.extraDamageType, "thunder");
  assert.equal(resultFail.stateChanges.knockbackFeet, 20);
  assert.equal(resultFail.targetResults[0].savePassed, false);
  assert.equal(resultFail.targetResults[0].conditionApplied, "prone");
  assert.equal(target.flags?.ak5e?.conditions?.prone, true);

  // Target passes STR save
  const target2 = createTestActor({ name: "Strong Foe", system: { abilities: { str: { mod: 5 } } } });
  const resultPass = await executeModificationActivation(weapon, "boom-module", actor, {
    targets: [target2],
    targetSaveRoll: 10 // 10 + 5 = 15 >= 13 -> passes
  });
  assert.equal(resultPass.targetResults[0].savePassed, true);
  assert.equal(resultPass.targetResults[0].conditionApplied, null);
  assert.equal(target2.flags?.ak5e?.conditions?.prone, undefined);
});

test("4.2 Melee: Burning Edge (Damage converted to Fire until end of turn)", async () => {
  const actor = createInventorActor(3);
  const weapon = createWeapon("Longsword");
  await applyEquipmentModification(weapon, "burning-edge", { actor });

  const result = await executeModificationActivation(weapon, "burning-edge", actor);
  assert.equal(result.success, true);
  assert.equal(result.stateChanges.damageConverted, "fire");
  assert.equal(result.stateChanges.duration, "endOfTurn");
});

test("4.3 Melee: Collapsible Weapon (Melee fold to disguise 1d4, revert bonus action)", async () => {
  const actor = createInventorActor(3);
  const weapon = createWeapon("Spear");
  await applyEquipmentModification(weapon, "collapsible-weapon-melee", { actor });

  // Fold action
  const foldResult = await executeModificationActivation(weapon, "collapsible-weapon-melee", actor, { fold: true });
  assert.equal(foldResult.stateChanges.isFolded, true);
  assert.equal(foldResult.stateChanges.improvised, true);
  assert.equal(foldResult.stateChanges.damageFormula, "1d4");

  // Revert bonus action
  const revertResult = await executeModificationActivation(weapon, "collapsible-weapon-melee", actor, { revert: true });
  assert.equal(revertResult.stateChanges.isFolded, false);
});

test("4.4 Melee: Flexible Weapon (Ignore shield AC, bonus action repeat attack)", async () => {
  const actor = createInventorActor(3);
  const weapon = createWeapon("Flail");
  await applyEquipmentModification(weapon, "flexible-weapon", { actor });

  const result = await executeModificationActivation(weapon, "flexible-weapon", actor);
  assert.equal(result.stateChanges.ignoreShieldAC, true);
  assert.equal(result.stateChanges.repeatAttackBonusAction, true);
  assert.equal(result.stateChanges.repeatAttackRangeFeet, 10);
});

test("4.5 Melee: Laser Cutter [Dangerous] (15 ft cone, DEX save, Radiant scaling, breakdown rider)", async () => {
  const actor = createInventorActor(7, { intMod: 4, prof: 3 }); // DC = 8 + 4 + 3 = 15; Level 7 -> 4d8
  const weapon = createWeapon("Dagger");
  await applyEquipmentModification(weapon, "laser-cutter", { actor });

  const target1 = createTestActor({ name: "Foe 1" });
  const target2 = createTestActor({ name: "Foe 2" });

  const result = await executeModificationActivation(weapon, "laser-cutter", actor, {
    targets: [target1, target2],
    targetSaves: {
      [target1.id]: { success: false },
      [target2.id]: { success: true }
    },
    damage: 24,
    skipBreakdown: true
  });

  assert.equal(result.isDangerous, true);
  assert.equal(result.damageFormula, "4d8");
  assert.equal(result.targetResults[0].damageTaken, 24, "Failed save takes full damage");
  assert.equal(result.targetResults[1].damageTaken, 12, "Successful save takes half damage");

  // Dangerous breakdown check breaks weapon!
  assert.equal(isBrokenEquipment(weapon), false);
  const breakdownRes = await executeModificationActivation(weapon, "laser-cutter", actor, {
    rollResults: [2, 2, 4], // Duplicate dice triggers breakdown
    damage: 10
  });

  assert.equal(breakdownRes.isBreakdown, true);
  assert.equal(breakdownRes.equipmentBroken, true);
  assert.equal(isBrokenEquipment(weapon), true, "Weapon is marked broken after dangerous breakdown");
});

test("4.6 Melee: Returner (Returning property, bonus action recall)", async () => {
  const actor = createInventorActor(3);
  const weapon = createWeapon("Handaxe");
  await applyEquipmentModification(weapon, "returner", { actor });

  const result = await executeModificationActivation(weapon, "returner", actor);
  assert.equal(result.stateChanges.returning, true);
  assert.equal(result.stateChanges.recallAvailable, true);
  assert.equal(result.stateChanges.duration, "endOfTurn");
});

test("4.7 Melee: Rotary Blade (Slashing/Piercing, +1 die Slashing, DEX save or Bleeding)", async () => {
  const actor = createInventorActor(5, { intMod: 3, prof: 3 }); // DC = 14
  const weapon = createWeapon("Scimitar", { damageType: "slashing" });
  await applyEquipmentModification(weapon, "rotary-blade", { actor });

  const target = createTestActor({ name: "Beast", system: { details: { type: { value: "beast" } } } });
  const result = await executeModificationActivation(weapon, "rotary-blade", actor, {
    targets: [target],
    targetSaveRoll: 8 // 8 < 14 -> fails
  });

  assert.equal(result.stateChanges.extraDamageType, "slashing");
  assert.equal(result.targetResults[0].savePassed, false);
  assert.equal(result.targetResults[0].conditionApplied, "bleeding");
  assert.equal(target.flags?.ak5e?.conditions?.bleeding, true);
});

test("4.8 Melee: Shock Engine (Lightning conversion, DEX save or Dazed)", async () => {
  const actor = createInventorActor(3, { intMod: 3, prof: 2 }); // DC = 13
  const weapon = createWeapon("Mace");
  await applyEquipmentModification(weapon, "shock-engine", { actor });

  const target = createTestActor({ name: "Guard" });
  const result = await executeModificationActivation(weapon, "shock-engine", actor, {
    targets: [target],
    targetSaveRoll: 7 // 7 < 13 -> fails
  });

  assert.equal(result.stateChanges.damageConverted, "lightning");
  assert.equal(result.targetResults[0].savePassed, false);
  assert.equal(result.targetResults[0].conditionApplied, "dazed");
  assert.equal(target.flags?.ak5e?.conditions?.dazed, true);
});

test("4.9 Melee: Telescopic Weapon (Reach property, 15 ft reach if already Reach)", async () => {
  const actor = createInventorActor(3);
  const shortsword = createWeapon("Shortsword");
  await applyEquipmentModification(shortsword, "telescopic-weapon", { actor });

  // Normal weapon gains reach (10 ft)
  const res1 = await executeModificationActivation(shortsword, "telescopic-weapon", actor);
  assert.equal(res1.stateChanges.reach, 10);
  assert.equal(res1.stateChanges.duration, "endOfTurn");

  // Weapon with Reach already increases to 15 ft
  const pike = createWeapon("Pike", { properties: new Set(["reach"]) });
  await applyEquipmentModification(pike, "telescopic-weapon", { actor });
  const res2 = await executeModificationActivation(pike, "telescopic-weapon", actor);
  assert.equal(res2.stateChanges.reach, 15);
});

test("4.10 Melee: Trick Weapon (Bonus action transform into chosen Light/Heavy melee weapon)", async () => {
  const actor = createInventorActor(3);
  const weapon = createWeapon("Club");
  await applyEquipmentModification(weapon, "trick-weapon", { actor });

  const result = await executeModificationActivation(weapon, "trick-weapon", actor, {
    targetWeaponType: "greatsword"
  });

  assert.equal(result.stateChanges.isTransformed, true);
  assert.equal(result.stateChanges.transformedWeapon, "greatsword");
  assert.equal(result.stateChanges.proficient, true);
  assert.equal(result.stateChanges.duration, "1min");
});

/* ---------------------------------------------------------------- 5. Ranged Modifications */

test("5.1 Ranged: Arts Cannon [Dangerous] (60 ft range, 10 ft radius sphere, DEX save, Force scaling)", async () => {
  const actor = createInventorActor(14, { intMod: 5, prof: 5 }); // DC = 18, Level 14 -> 5d8
  const cannon = createWeapon("Heavy Crossbow", {
    actionType: "rwak",
    weaponType: "martialR",
    properties: new Set(["two"])
  });
  await applyEquipmentModification(cannon, "arts-cannon", { actor });

  const target = createTestActor({ name: "Target" });
  const result = await executeModificationActivation(cannon, "arts-cannon", actor, {
    targets: [target],
    damage: 30,
    saveSuccess: false,
    skipBreakdown: true
  });

  assert.equal(result.isDangerous, true);
  assert.equal(result.damageFormula, "5d8");
  assert.equal(result.stateChanges.damageType, "force");
  assert.equal(result.targetResults[0].damageTaken, 30);

  // Dangerous breakdown breaks weapon
  const breakdownRes = await executeModificationActivation(cannon, "arts-cannon", actor, {
    rollResults: [3, 3, 5]
  });
  assert.equal(breakdownRes.equipmentBroken, true);
  assert.equal(isBrokenEquipment(cannon), true);
});

test("5.2 Ranged: Collapsible Weapon (Ranged fold to disguise 1d4, revert bonus action)", async () => {
  const actor = createInventorActor(3);
  const bow = createWeapon("Shortbow", { actionType: "rwak", weaponType: "simpleR" });
  await applyEquipmentModification(bow, "collapsible-weapon-ranged", { actor });

  const fold = await executeModificationActivation(bow, "collapsible-weapon-ranged", actor, { fold: true });
  assert.equal(fold.stateChanges.isFolded, true);
  assert.equal(fold.stateChanges.damageFormula, "1d4");

  const revert = await executeModificationActivation(bow, "collapsible-weapon-ranged", actor, { revert: true });
  assert.equal(revert.stateChanges.isFolded, false);
});

test("5.3 Ranged: Explosive Shots (Damage even on miss, 10 ft DEX save for half Thunder)", async () => {
  const actor = createInventorActor(3, { intMod: 3, prof: 2 }); // DC = 13
  const heavyCrossbow = createWeapon("Heavy Crossbow", {
    actionType: "rwak",
    weaponType: "martialR",
    properties: new Set(["heavy", "two"])
  });
  await applyEquipmentModification(heavyCrossbow, "explosive-shots", { actor });

  const bystander = createTestActor({ name: "Bystander" });
  const result = await executeModificationActivation(heavyCrossbow, "explosive-shots", actor, {
    targets: [bystander],
    attackDamage: 20,
    targetSaveRoll: 6 // 6 < 13 -> fails
  });

  assert.equal(result.stateChanges.rollDamageEvenOnMiss, true);
  assert.equal(result.stateChanges.splashDamage, 10);
  assert.equal(result.stateChanges.damageType, "thunder");
  assert.equal(result.targetResults[0].savePassed, false);
});

test("5.4 Ranged: Electrobolts (Lightning conversion, CON save or Nervous Impairment)", async () => {
  const actor = createInventorActor(3, { intMod: 3, prof: 2 }); // DC = 13
  const bow = createWeapon("Longbow", { actionType: "rwak", weaponType: "martialR" });
  await applyEquipmentModification(bow, "electrobolts", { actor });

  const target = createTestActor({ name: "Target" });
  const result = await executeModificationActivation(bow, "electrobolts", actor, {
    targets: [target],
    targetSaveRoll: 9 // 9 < 13 -> fails
  });

  assert.equal(result.stateChanges.damageConverted, "lightning");
  assert.equal(result.targetResults[0].savePassed, false);
  assert.equal(result.targetResults[0].conditionApplied, "nervous-impairment");
  assert.equal(target.flags?.ak5e?.conditions?.["nervous-impairment"], true);
});

test("5.5 Ranged: Flame Gout (15 ft cone DEX save, Fire scaling, Burning condition on fail)", async () => {
  const actor = createInventorActor(5, { intMod: 3, prof: 3 }); // DC = 14; Level 5 -> 1d8
  const weapon = createWeapon("Heavy Crossbow", {
    actionType: "rwak",
    weaponType: "martialR",
    properties: new Set(["two"])
  });
  await applyEquipmentModification(weapon, "flame-gout", { actor });

  const targetFail = createTestActor({ name: "Foe 1" });
  const targetPass = createTestActor({ name: "Foe 2" });

  const result = await executeModificationActivation(weapon, "flame-gout", actor, {
    targets: [targetFail, targetPass],
    targetSaves: {
      [targetFail.id]: { success: false },
      [targetPass.id]: { success: true }
    },
    damage: 8
  });

  assert.equal(result.damageFormula, "1d8");
  assert.equal(result.targetResults[0].savePassed, false);
  assert.equal(result.targetResults[0].damageTaken, 8);
  assert.equal(result.targetResults[0].conditionApplied, "burning");
  assert.equal(targetFail.flags?.ak5e?.conditions?.burning, true);

  assert.equal(result.targetResults[1].savePassed, true);
  assert.equal(result.targetResults[1].damageTaken, 4, "Half damage on save");
  assert.equal(result.targetResults[1].conditionApplied, null, "No burning on save");
  assert.equal(targetPass.flags?.ak5e?.conditions?.burning, undefined);
});

test("5.6 Ranged: Homing Shots (Miss Reaction to reroll attack)", async () => {
  const actor = createInventorActor(3);
  const bow = createWeapon("Shortbow", { actionType: "rwak", properties: new Set(["light"]) });
  await applyEquipmentModification(bow, "homing-shots", { actor });

  const result = await executeModificationActivation(bow, "homing-shots", actor);
  assert.equal(result.stateChanges.rerollMissedAttack, true);
  assert.equal(result.stateChanges.mustUseNewResult, true);
  assert.equal(result.stateChanges.cannotRerollAgain, true);
});

test("5.7 Ranged: Melee Attachment (Bonus Action/OA melee with DEX, 1d8 Piercing, +PB option)", async () => {
  const actor = createInventorActor(5, { dexMod: 3, prof: 3 });
  const bow = createWeapon("Shortbow", { actionType: "rwak" });
  await applyEquipmentModification(bow, "melee-attachment", { actor });

  // Standard reading: 1d8 + DEX
  const res1 = await executeModificationActivation(bow, "melee-attachment", actor);
  assert.equal(res1.stateChanges.meleeAttacksAllowed, true);
  assert.equal(res1.stateChanges.useDexModifier, true);
  assert.equal(res1.stateChanges.damageFormula, "1d8 + 3");
  assert.equal(res1.stateChanges.damageType, "piercing");

  // Table reading with + PB support
  const res2 = await executeModificationActivation(bow, "melee-attachment", actor, { reading: "addPB" });
  assert.equal(res2.stateChanges.damageFormula, "1d8 + 3 + 3");
});

test("5.8 Ranged: Safety Removal (+1 Attack in Attack Action with Disadvantage)", async () => {
  const actor = createInventorActor(3);
  const musket = createWeapon("Musket", {
    actionType: "rwak",
    properties: new Set(["firearm"])
  });
  await applyEquipmentModification(musket, "safety-removal", { actor });

  const result = await executeModificationActivation(musket, "safety-removal", actor);
  assert.equal(result.stateChanges.additionalAttacks, 1);
  assert.equal(result.stateChanges.disadvantageAllAttacks, true);
});

/* ---------------------------------------------------------------- 6. Armor Modifications */

test("6.1 Armor: Adrenal Overloader [Dangerous] (+1 Action, 1/SR & 1/turn limit, breakdown breaks armor)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Scale Mail", { armorType: "medium" });
  await applyEquipmentModification(armor, "adrenal-overloader", { actor });

  // 1st activation grants +1 action
  const res1 = await executeModificationActivation(armor, "adrenal-overloader", actor, { skipBreakdown: true });
  assert.equal(res1.isDangerous, true);
  assert.equal(res1.stateChanges.additionalActions, 1);
  assert.equal(actor.flags?.ak5e?.inventor?.adrenalOverloaderUsedSR, true);

  // 2nd activation rejected before Short Rest
  await assert.rejects(
    async () => executeModificationActivation(armor, "adrenal-overloader", actor),
    /already activated/,
    "Cannot activate Adrenal Overloader more than 1/SR"
  );

  // Dangerous breakdown check flags armor broken
  assert.equal(isBrokenEquipment(armor), false);
  const breakdownRes = await executeModificationActivation(armor, "adrenal-overloader", actor, {
    rollResults: [4, 4, 1],
    force: true
  });
  assert.equal(breakdownRes.equipmentBroken, true);
  assert.equal(isBrokenEquipment(armor), true);
});

test("6.2 Armor: Artsfield Generator (Reaction grants Resistance against 1 damage type)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Chain Mail", { armorType: "heavy" });
  await applyEquipmentModification(armor, "artsfield-generator", { actor });

  const result = await executeModificationActivation(armor, "artsfield-generator", actor, {
    damageType: "slashing"
  });
  assert.equal(result.stateChanges.grantResistance, true);
  assert.equal(result.stateChanges.damageType, "slashing");
});

test("6.3 Armor: Camouflage Cloak (1 min Advantage on Stealth, Disadvantage on Perception to see)", async () => {
  const actor = createInventorActor(3);
  const cloak = createArmor("Clothing", { armorType: "clothing" });
  await applyEquipmentModification(cloak, "camouflage-cloak", { actor });

  const result = await executeModificationActivation(cloak, "camouflage-cloak", actor);
  assert.equal(result.stateChanges.stealthAdvantage, true);
  assert.equal(result.stateChanges.perceptionDisadvantage, true);
  assert.equal(result.stateChanges.duration, "1min");
});

test("6.4 Armor: Exoskeleton (Size +1, double jump, Advantage on Athletics, unhindered carrying)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Breastplate", { armorType: "medium" });
  await applyEquipmentModification(armor, "exoskeleton", { actor });

  const result = await executeModificationActivation(armor, "exoskeleton", actor);
  assert.equal(result.stateChanges.sizeBonus, 1);
  assert.equal(result.stateChanges.doubleJump, true);
  assert.equal(result.stateChanges.athleticsAdvantage, true);
  assert.equal(result.stateChanges.unhinderedCarrying, true);
  assert.equal(result.stateChanges.duration, "startOfNextTurn");
});

test("6.5 Armor: Jetboots (Bonus action Dash in straight line)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Studded Leather", { armorType: "light" });
  await applyEquipmentModification(armor, "jetboots", { actor });

  const result = await executeModificationActivation(armor, "jetboots", actor);
  assert.equal(result.stateChanges.dashAction, true);
  assert.equal(result.stateChanges.straightLineOnly, true);
});

test("6.6 Armor: Life Support (Bonus action when HP < 50%, rolls Hit Die + CON mod, recovers HP)", async () => {
  // Max HP 40, Current HP 15 (< 50% max)
  const actor = createInventorActor(3, { conMod: 2, hp: 15, maxHp: 40 });
  const armor = createArmor("Ring Mail", { armorType: "heavy" });
  await applyEquipmentModification(armor, "life-support", { actor });

  // Activation succeeds when < 50% HP
  const result = await executeModificationActivation(armor, "life-support", actor, {
    hitDieRoll: 6 // 6 + 2 = 8 healing
  });
  assert.equal(result.healed, 8);
  assert.equal(actor.system.attributes.hp.value, 23);

  // Activation rejected when at or above half HP (23 >= 20)
  await assert.rejects(
    async () => executeModificationActivation(armor, "life-support", actor),
    /wearer must be below half maximum Hit Points/,
    "Life Support rejected when at or above 50% HP"
  );
});

test("6.7 Armor: Powered Gauntlet (Unarmed strike hit deals +1 die Lightning damage)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Leather Armor", { armorType: "light" });
  await applyEquipmentModification(armor, "powered-gauntlet", { actor });

  const result = await executeModificationActivation(armor, "powered-gauntlet", actor);
  assert.equal(result.stateChanges.extraDamageDice, "1 die");
  assert.equal(result.stateChanges.extraDamageType, "lightning");
});

test("6.8 Armor: Refocuser (Reaction rerolls failed Concentration save with Advantage)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Robes", { armorType: "clothing" });
  await applyEquipmentModification(armor, "refocuser", { actor });

  const result = await executeModificationActivation(armor, "refocuser", actor);
  assert.equal(result.stateChanges.rerollConcentrationSaveWithAdvantage, true);
});

test("6.9 Armor: Shock Absorbers (Reaction adds Inventor's INT mod to STR or DEX save)", async () => {
  const actor = createInventorActor(3, { intMod: 4 });
  const armor = createArmor("Half Plate", { armorType: "medium" });
  await applyEquipmentModification(armor, "shock-absorbers", { actor });

  const result = await executeModificationActivation(armor, "shock-absorbers", actor);
  assert.equal(result.stateChanges.saveBonus, 4);
});

test("6.10 Armor: Wingsuit (Reaction on falling >= 10 ft grants Flying Speed 30 ft until landing)", async () => {
  const actor = createInventorActor(3);
  const armor = createArmor("Padded Armor", { armorType: "light" });
  await applyEquipmentModification(armor, "wingsuit", { actor });

  const result = await executeModificationActivation(armor, "wingsuit", actor);
  assert.equal(result.stateChanges.flyingSpeed, 30);
  assert.equal(result.stateChanges.cannotAscend, true);
  assert.equal(result.stateChanges.minimumDescendFeetPerTurn, 10);
  assert.equal(result.stateChanges.duration, "untilLanding");
});

/* ---------------------------------------------------------------- 7. Breakdown & Safety Gating */

test("7. Gating: Uninstalled mods rejected, broken equipment blocks usage, breakdown HP loss clamped", async () => {
  const actor = createInventorActor(3, { hp: 5, maxHp: 30 });
  const weapon = createWeapon("Shortsword");

  // 1. Uninstalled mod rejection
  await assert.rejects(
    async () => executeModificationActivation(weapon, "laser-cutter", actor, { requireInstalled: true }),
    /is not installed/,
    "Cannot activate modification that is not installed"
  );

  // 2. Install Boom Module
  await applyEquipmentModification(weapon, "boom-module", { actor });

  // 3. Broken equipment rejection
  weapon.flags.ak5e.isBroken = true;
  await assert.rejects(
    async () => executeModificationActivation(weapon, "boom-module", actor),
    /is broken and must be repaired/,
    "Cannot activate modification on broken equipment"
  );

  // Repair equipment
  await repairBrokenEquipment(weapon, actor);
  assert.equal(isBrokenEquipment(weapon), false);

  // 4. Breakdown HP loss evaluation & clamping at 1 HP
  const breakdownRes = await executeModificationActivation(weapon, "boom-module", actor, {
    rollResults: [2, 2, 5], // duplicate -> breakdown
    breakdownDamage: 12,    // actor has 5 HP
    skipBreakdown: false
  });

  assert.equal(breakdownRes.isBreakdown, true);
  assert.equal(breakdownRes.breakdown.actualHPLoss, 4, "5 HP minus 4 deals 4 damage (clamped so HP does not drop below 1)");
  assert.equal(actor.system.attributes.hp.value, 1, "Actor HP clamped at minimum 1 HP");
});
