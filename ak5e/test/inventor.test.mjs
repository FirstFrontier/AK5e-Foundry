/**
 * Comprehensive automated test suite for AK5e Inventor Specialist Subclass (Ch. 3 L5847–6140).
 * Milestone 1 coverage:
 *  1. Subclass Identification & Predicates (isInventor, level feature checks)
 *  2. Inventor DC Calculations (8 + INT + PB, scaling, negative stats, minimum 1 clamp)
 *  3. Resource Pools Registration & Scaling (inventions max 2 * PB, theBigOne at lv 20)
 *  4. Modifications Catalog Schema & 28 Catalogued Modifications
 *  5. Equipment Modification Validation (weapons/armor, non-magical, no duplicates, category compatibility)
 *  6. Equipment Modification Application & Inventions Locking
 *  7. Equipment Modification Removal & Inventions Refund
 *  8. Instability Engine Math (Base 3, stacking, Dangerous +1, Risk Assessment -1/-2, clamp at 1)
 *  9. Breakdown Roll Evaluation & Duplicate Matching Dice Detection
 * 10. Breakdown HP Loss Formula & Clamping at 1 HP (cannot drop below 1 HP)
 * 11. Dangerous Breakdown Equipment Rider (weapon disabled / armor benefits suppressed)
 * 12. Broken Equipment State & Repair (Maintenance Kit restoration)
 * 13. Subclass Progression (levels 1, 3, 5, 11, 15, 20 features granting & idempotency)
 * 14. Module API Wiring (game.ak5e.specialist.inventor and game.ak5e.specialist.isInventor)
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  isInventor,
  calculateInventorDC,
  registerInventorPools,
  defineInventorPools,
  SPECIALIST_CLASS_ID,
  calculateSpecialistProfile,
  isSpecialist
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
  hasEquipmentModification,
  hasStrangeContraption,
  hasMobileModding,
  hasRiskAssessment,
  hasStrangerContraptions,
  hasTheBigOne,
  registerInventorHooks
} from "../scripts/inventor-features.mjs";
import {
  getInventorProgressionFeatures,
  INVENTOR_PROGRESSION_FEATURES,
  previewSpecialistProgression,
  applySpecialistProgression
} from "../scripts/specialist-progression.mjs";
import { getPool, hasPool, getPoolDefinition, clearPoolRegistry } from "../scripts/resource-pools.mjs";
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

/* ---------------------------------------------------------------- Test Cases */

test("1. Subclass Identification & Predicates", () => {
  const inventor = createInventorActor(1);
  assert.equal(isSpecialist(inventor), true, "isSpecialist identifies inventor");
  assert.equal(isInventor(inventor), true, "isInventor identifies inventor actor");

  const nonSpecialist = createTestActor({ name: "Fighter" });
  assert.equal(isInventor(nonSpecialist), false, "non-specialist is not inventor");
  assert.equal(isInventor(null), false, "null actor is not inventor");

  // Other specialist subclass
  const executor = createTestActor({
    name: "Executor",
    class: "specialist",
    branch: "executor",
    flags: { ak5e: { specialist: { enabled: true } } }
  });
  assert.equal(isInventor(executor), false, "Executor is not inventor");

  // Feature progression checks across levels
  const inv1 = createInventorActor(1);
  assert.equal(hasEquipmentModification(inv1), true, "Level 1 has Equipment Modification");
  assert.equal(hasStrangeContraption(inv1), false, "Level 1 lacks Strange Contraption");
  assert.equal(hasMobileModding(inv1), false, "Level 1 lacks Mobile Modding");
  assert.equal(hasRiskAssessment(inv1), false, "Level 1 lacks Risk Assessment");
  assert.equal(hasStrangerContraptions(inv1), false, "Level 1 lacks Stranger Contraptions");
  assert.equal(hasTheBigOne(inv1), false, "Level 1 lacks The Big One");

  const inv5 = createInventorActor(5);
  assert.equal(hasStrangeContraption(inv5), true, "Level 5 has Strange Contraption");
  assert.equal(hasMobileModding(inv5), true, "Level 5 has Mobile Modding");
  assert.equal(hasRiskAssessment(inv5), false, "Level 5 lacks Risk Assessment");

  const inv11 = createInventorActor(11);
  assert.equal(hasRiskAssessment(inv11), true, "Level 11 has Risk Assessment");
  assert.equal(hasStrangerContraptions(inv11), false, "Level 11 lacks Stranger Contraptions");

  const inv15 = createInventorActor(15);
  assert.equal(hasStrangerContraptions(inv15), true, "Level 15 has Stranger Contraptions");
  assert.equal(hasTheBigOne(inv15), false, "Level 15 lacks The Big One");

  const inv20 = createInventorActor(20);
  assert.equal(hasTheBigOne(inv20), true, "Level 20 has The Big One");
});

test("2. Inventor DC Calculations (8 + INT + PB)", () => {
  // Level 1: INT +3, PB 2 -> 8 + 3 + 2 = 13
  const inv1 = createInventorActor(1, { intMod: 3, prof: 2 });
  assert.equal(calculateInventorDC(inv1), 13, "Level 1 DC is 13");

  // Level 5: INT +4, PB 3 -> 8 + 4 + 3 = 15
  const inv5 = createInventorActor(5, { intMod: 4, prof: 3 });
  assert.equal(calculateInventorDC(inv5), 15, "Level 5 DC is 15");

  // Level 20: INT +5, PB 6 -> 8 + 5 + 6 = 19
  const inv20 = createInventorActor(20, { intMod: 5, prof: 6 });
  assert.equal(calculateInventorDC(inv20), 19, "Level 20 DC is 19");

  // Negative INT mod: INT -1, PB 2 -> 8 - 1 + 2 = 9
  const invNeg = createInventorActor(1, { intMod: -1, prof: 2 });
  assert.equal(calculateInventorDC(invNeg), 9, "Negative INT mod (8 - 1 + 2) is 9");

  // Extreme negative INT: clamps at minimum floor 1
  const invExtremeNeg = createInventorActor(1, { intMod: -15, prof: 2 });
  assert.equal(calculateInventorDC(invExtremeNeg), 1, "Extreme negative INT clamps at minimum 1");

  // Profile includes inventor DC
  const profile = calculateSpecialistProfile(inv1);
  assert.equal(profile.dc.inventor, 13, "calculateSpecialistProfile includes dc.inventor");
  assert.equal(profile.resources.inventions.max, 4, "calculateSpecialistProfile includes inventions resource max");
});

test("3. Resource Pools Registration & Scaling", () => {
  const inv1 = createInventorActor(1, { prof: 2 });
  const pool1 = getPool(inv1, "inventions");
  assert.ok(pool1, "inventions pool exists on Inventor");
  assert.equal(pool1.max, 4, "PB 2 gives max 4 Inventions");
  assert.equal(pool1.value, 4, "Inventions pool starts at max");

  const inv5 = createInventorActor(5, { prof: 3 });
  const pool5 = getPool(inv5, "inventions");
  assert.equal(pool5.max, 6, "PB 3 gives max 6 Inventions");

  const inv9 = createInventorActor(9, { prof: 4 });
  const pool9 = getPool(inv9, "inventions");
  assert.equal(pool9.max, 8, "PB 4 gives max 8 Inventions");

  const inv17 = createInventorActor(17, { prof: 6 });
  const pool17 = getPool(inv17, "inventions");
  assert.equal(pool17.max, 12, "PB 6 gives max 12 Inventions");

  // The Big One pool: applies only at level 20
  const defBigOne = getPoolDefinition("theBigOne");
  assert.equal(hasPool(inv1, defBigOne), false, "theBigOne pool does not apply to Level 1");

  const inv20 = createInventorActor(20, { prof: 6 });
  assert.equal(hasPool(inv20, defBigOne), true, "theBigOne pool applies at Level 20");
  const bigOne20 = getPool(inv20, "theBigOne");
  assert.equal(bigOne20.max, 1, "theBigOne max is 1");
  assert.equal(bigOne20.value, 1, "theBigOne starts at max 1");
});

test("4. Modifications Catalog Schema & Completeness", () => {
  const allMods = Object.values(MODIFICATIONS_CATALOG);
  assert.equal(allMods.length, 28, "Catalog contains exactly 28 modifications");

  const meleeMods = allMods.filter(m => m.category === MODIFICATION_CATEGORIES.MELEE);
  const rangedMods = allMods.filter(m => m.category === MODIFICATION_CATEGORIES.RANGED);
  const armorMods = allMods.filter(m => m.category === MODIFICATION_CATEGORIES.ARMOR);

  assert.equal(meleeMods.length, 10, "10 Melee Weapon Modifications");
  assert.equal(rangedMods.length, 8, "8 Ranged Weapon Modifications");
  assert.equal(armorMods.length, 10, "10 Armor Modifications");

  const dangerousMods = allMods.filter(m => m.isDangerous);
  assert.equal(dangerousMods.length, 3, "Exactly 3 Dangerous Modifications");

  const dangerousIds = dangerousMods.map(m => m.id).sort();
  assert.deepEqual(
    dangerousIds,
    ["adrenal-overloader", "arts-cannon", "laser-cutter"],
    "Dangerous modifications are Laser Cutter, Arts Cannon, and Adrenal Overloader"
  );

  for (const mod of allMods) {
    assert.ok(mod.id, `Mod has ID: ${mod.name}`);
    assert.ok(mod.name, `Mod has name: ${mod.id}`);
    assert.ok(mod.category, `Mod has category: ${mod.id}`);
    assert.ok(mod.itemType, `Mod has itemType: ${mod.id}`);
    assert.ok(mod.chapterThreeId, `Mod has chapterThreeId: ${mod.id}`);
    assert.ok(mod.summary, `Mod has summary: ${mod.id}`);
    assert.equal(typeof mod.isDangerous, "boolean", `isDangerous is boolean: ${mod.id}`);
  }
});

test("5. Equipment Modification Validation", async () => {
  const weapon = createWeapon("Club");
  const armor = createArmor("Chain Shirt");
  const potion = createTestItem({ name: "Healing Potion", type: "consumable" });

  assert.equal(isModifiableEquipment(weapon), true, "Weapon is modifiable");
  assert.equal(isModifiableEquipment(armor), true, "Armor is modifiable");
  assert.equal(isModifiableEquipment(potion), false, "Potion is not modifiable");

  // Magical equipment rejection
  const magicWeapon = createWeapon("Moonblade", { properties: new Set(["mgc"]) });
  assert.equal(isMagicalEquipment(magicWeapon), true, "Weapon with mgc property is magical");
  await assert.rejects(
    async () => applyEquipmentModification(magicWeapon, "boom-module"),
    /magical/,
    "Cannot modify magical weapon"
  );

  const rareArmor = createArmor("Armor of Resistance", { rarity: "rare" });
  assert.equal(isMagicalEquipment(rareArmor), true, "Armor with rare rarity is magical");
  await assert.rejects(
    async () => applyEquipmentModification(rareArmor, "exoskeleton"),
    /magical/,
    "Cannot modify magical armor"
  );

  // Category mismatch rejection
  await assert.rejects(
    async () => applyEquipmentModification(armor, "boom-module"),
    /Melee Weapon/,
    "Cannot apply Melee weapon mod to Armor"
  );
  await assert.rejects(
    async () => applyEquipmentModification(weapon, "exoskeleton"),
    /Armor/,
    "Cannot apply Armor mod to Weapon"
  );
});

test("6. Equipment Modification Application & Inventions Locking", async () => {
  const actor = createInventorActor(1, { prof: 2 });
  const weapon = createWeapon("Mace");
  addItem(actor, weapon);

  const poolBefore = getPool(actor, "inventions");
  assert.equal(poolBefore.value, 4, "Initial Inventions pool is 4");

  // Apply 1st mod (Boom Module)
  const result1 = await applyEquipmentModification(weapon, "boom-module", { actor });
  assert.equal(result1.success, true);
  assert.equal(result1.instability, 3, "1st mod gives base 3 instability");

  const poolAfter1 = getPool(actor, "inventions");
  assert.equal(poolAfter1.value, 3, "1 Invention locked, 3 remaining");

  // Duplicate rejection
  await assert.rejects(
    async () => applyEquipmentModification(weapon, "boom-module", { actor }),
    /duplicate/,
    "Duplicate modification is rejected"
  );

  // Apply 2nd mod (Burning Edge)
  const result2 = await applyEquipmentModification(weapon, "burning-edge", { actor });
  assert.equal(result2.success, true);
  assert.equal(result2.instability, 4, "2nd mod gives 4 instability (base 3 + 1)");

  const poolAfter2 = getPool(actor, "inventions");
  assert.equal(poolAfter2.value, 2, "2 Inventions locked, 2 remaining");

  const mods = getItemModifications(weapon);
  assert.equal(mods.length, 2);
  assert.equal(mods[0].id, "boom-module");
  assert.equal(mods[1].id, "burning-edge");
});

test("7. Equipment Modification Removal & Inventions Refund", async () => {
  const actor = createInventorActor(1, { prof: 2 });
  const weapon = createWeapon("Mace");
  addItem(actor, weapon);

  await applyEquipmentModification(weapon, "boom-module", { actor });
  await applyEquipmentModification(weapon, "burning-edge", { actor });

  assert.equal(getPool(actor, "inventions").value, 2, "2 Inventions remain after applying 2 mods");

  // Remove Burning Edge
  const remResult = await removeEquipmentModification(weapon, "burning-edge", { actor });
  assert.equal(remResult.success, true);
  assert.equal(remResult.removedModificationId, "burning-edge");
  assert.equal(remResult.instability, 3, "Instability drops back to 3");

  const poolAfterRemove = getPool(actor, "inventions");
  assert.equal(poolAfterRemove.value, 3, "1 Invention refunded, 3 available");

  // Attempting to remove non-installed mod throws
  await assert.rejects(
    async () => removeEquipmentModification(weapon, "laser-cutter", { actor }),
    /not installed/,
    "Cannot remove uninstalled mod"
  );

  // Remove Boom Module
  await removeEquipmentModification(weapon, "boom-module", { actor });
  assert.equal(getPool(actor, "inventions").value, 4, "All Inventions refunded back to max 4");
  assert.equal(getItemModifications(weapon).length, 0, "No modifications remain on item");
  assert.equal(calculateInstability(weapon, actor), 0, "Unmodified weapon has 0 instability");
});

test("8. Instability Engine Math & Risk Assessment Reductions", () => {
  const actor = createInventorActor(11, { prof: 4, weaponCategory: "melee" });
  const weapon = createWeapon("Warhammer", {
    modifications: [
      { id: "boom-module", name: "Boom Module", isDangerous: false }
    ]
  });
  addItem(actor, weapon);

  // Basic calculation: 1 standard mod = base 3
  assert.equal(calculateInstability(weapon, null), 3, "Base instability for 1 mod is 3");

  // 2 standard mods: 3 + (2 - 1) = 4
  const weapon2 = createWeapon("Warhammer", {
    modifications: [
      { id: "boom-module", isDangerous: false },
      { id: "burning-edge", isDangerous: false }
    ]
  });
  assert.equal(calculateInstability(weapon2, null), 4, "2 standard mods = 4 instability");

  // 1 Dangerous mod: base 3 + (1 - 1) + 1 dangerous = 4
  const dangerousWeapon = createWeapon("Warhammer", {
    modifications: [
      { id: "laser-cutter", isDangerous: true }
    ]
  });
  assert.equal(calculateInstability(dangerousWeapon, null), 4, "1 Dangerous mod = 4 instability");

  // 2 standard mods + 1 Dangerous mod: 3 + (3 - 1) + 1 = 6
  const multiDangerous = createWeapon("Warhammer", {
    modifications: [
      { id: "boom-module", isDangerous: false },
      { id: "burning-edge", isDangerous: false },
      { id: "laser-cutter", isDangerous: true }
    ]
  });
  assert.equal(calculateInstability(multiDangerous, null), 6, "2 standard + 1 dangerous = 6 instability");

  // Risk Assessment at Level 11:
  // Trained Operator (-1) + Speciality Modding (-1 on specialized melee weapon)
  // Single mod weapon (base 3) reduced by 2 -> 1
  const raInstability = calculateInstability(weapon, actor, { isInventorWielder: true });
  assert.equal(raInstability, 1, "Level 11 Inventor wielding specialised weapon has instability reduced to 1");

  // Clamp at minimum 1 even if reductions exceed base
  const clampedInstability = calculateInstability(weapon, actor, { riskAssessmentReductions: 5 });
  assert.equal(clampedInstability, 1, "Excessive reductions clamp at minimum 1 instability");
});

test("9. Breakdown Roll Evaluation & Duplicate Matching Dice Detection", () => {
  // Safe roll: all dice distinct (e.g. [1, 2, 4])
  const safeRoll = evaluateBreakdownRoll([1, 2, 4], 3, { id: "boom-module", isDangerous: false });
  assert.equal(safeRoll.isBreakdown, false, "All distinct dice -> safe");
  assert.deepEqual(safeRoll.matchingDice, [], "No matching dice");
  assert.equal(safeRoll.isBroken, false, "Not broken");

  // Breakdown roll: duplicate pair (e.g. [2, 5, 2])
  const breakdownRoll = evaluateBreakdownRoll([2, 5, 2], 3, { id: "boom-module", isDangerous: false });
  assert.equal(breakdownRoll.isBreakdown, true, "Duplicate 2 -> breakdown triggered");
  assert.deepEqual(breakdownRoll.matchingDice, [2], "Matching die is 2");

  // Multiple duplicate pairs: [1, 3, 1, 4, 3]
  const multiBreakdown = evaluateBreakdownRoll([1, 3, 1, 4, 3], 5, { id: "boom-module", isDangerous: false });
  assert.equal(multiBreakdown.isBreakdown, true, "Multiple duplicates trigger breakdown");
  assert.deepEqual(multiBreakdown.matchingDice, [1, 3], "Identifies both duplicate pairs (1 and 3)");

  // Works with object structure { dice: [{ results: [{ result: 4 }, { result: 4 }] }] }
  const rollObj = { dice: [{ results: [{ result: 4 }, { result: 4 }, { result: 1 }] }] };
  const evaluatedObj = evaluateBreakdownRoll(rollObj, 3, { id: "boom-module", isDangerous: false });
  assert.equal(evaluatedObj.isBreakdown, true, "Evaluates Foundry roll object structure");
  assert.deepEqual(evaluatedObj.matchingDice, [4], "Detects duplicate 4 in roll object");
});

test("10. Breakdown HP Loss Formula & Clamping at 1 HP", () => {
  // Instability 1, 2, 3: formula is 1d8
  assert.equal(evaluateBreakdownRoll([1, 1], 1).hpLossFormula, "1d8");
  assert.equal(evaluateBreakdownRoll([1, 1], 2).hpLossFormula, "1d8");
  assert.equal(evaluateBreakdownRoll([1, 1], 3).hpLossFormula, "1d8");

  // Instability 4: 1d8 + 1d8 = 2d8
  assert.equal(evaluateBreakdownRoll([1, 1, 2, 3], 4).hpLossFormula, "2d8");

  // Instability 5: 1d8 + 2d8 = 3d8
  assert.equal(evaluateBreakdownRoll([1, 1, 2, 3, 4], 5).hpLossFormula, "3d8");

  // Instability 7: 1d8 + 4d8 = 5d8
  assert.equal(evaluateBreakdownRoll([1, 1, 2, 3, 4, 5, 6], 7).hpLossFormula, "5d8");

  // HP Loss Clamping:
  // Creature has 20 HP, takes 10 damage -> loses 10 HP (remaining 10 HP)
  const lossNormal = evaluateBreakdownRoll([2, 2], 3, null, { damage: 10, currentHP: 20 });
  assert.equal(lossNormal.actualHPLoss, 10, "Normal damage applied without clamp");

  // Creature has 5 HP, rolls 8 damage -> loses 4 HP (remaining 1 HP)
  const lossClamped = evaluateBreakdownRoll([2, 2], 3, null, { damage: 8, currentHP: 5 });
  assert.equal(lossClamped.actualHPLoss, 4, "HP loss clamped to currentHP - 1 (leaves 1 HP)");

  // Creature at 1 HP, rolls 12 damage -> loses 0 HP (cannot drop below 1 HP)
  const lossAt1HP = evaluateBreakdownRoll([2, 2], 3, null, { damage: 12, currentHP: 1 });
  assert.equal(lossAt1HP.actualHPLoss, 0, "Creature at 1 HP takes 0 damage");
});

test("11. Dangerous Breakdown Equipment Rider", () => {
  const standardMod = { id: "boom-module", name: "Boom Module", isDangerous: false };
  const dangerousMod = { id: "laser-cutter", name: "Laser Cutter [Dangerous]", isDangerous: true };

  // Breakdown on standard mod: does NOT break equipment
  const stdBreakdown = evaluateBreakdownRoll([3, 3], 3, standardMod);
  assert.equal(stdBreakdown.isBreakdown, true);
  assert.equal(stdBreakdown.isBroken, false, "Standard mod breakdown does NOT break equipment");

  // Safe roll on dangerous mod: does NOT break equipment
  const dangerousSafe = evaluateBreakdownRoll([1, 2, 3, 4], 4, dangerousMod);
  assert.equal(dangerousSafe.isBreakdown, false);
  assert.equal(dangerousSafe.isBroken, false, "Dangerous mod safe roll does not break equipment");

  // Breakdown on dangerous mod: BREAKS equipment
  const dangerousBreakdown = evaluateBreakdownRoll([2, 2, 5, 6], 4, dangerousMod);
  assert.equal(dangerousBreakdown.isBreakdown, true);
  assert.equal(dangerousBreakdown.isBroken, true, "Dangerous mod breakdown breaks equipment");
  assert.equal(dangerousBreakdown.equipmentBroken, true);
});

test("12. Broken Equipment State & Repair", async () => {
  const weapon = createWeapon("Laser Halberd");
  assert.equal(isBrokenEquipment(weapon), false, "Weapon initially not broken");

  // Mark weapon broken
  await weapon.setFlag("ak5e", "isBroken", true);
  assert.equal(isBrokenEquipment(weapon), true, "Weapon is marked broken");

  // Repair with Maintenance Kit
  const repairResult = await repairBrokenEquipment(weapon);
  assert.equal(repairResult.success, true);
  assert.equal(repairResult.wasBroken, true);
  assert.equal(isBrokenEquipment(weapon), false, "Weapon is no longer broken after repair");
});

test("13. Subclass Progression (Levels 1, 3, 5, 11, 15, 20)", async () => {
  // Features mapping query
  const lv1Features = getInventorProgressionFeatures(1);
  assert.equal(lv1Features.length, 1, "Level 1 has 1 feature");
  assert.equal(lv1Features[0].name, "1st Level: Equipment Modification");

  const lv5Features = getInventorProgressionFeatures(5);
  assert.equal(lv5Features.length, 3, "Level 5 has 3 features (Equipment Mod, Strange Contraption, Mobile Modding)");

  const lv11Features = getInventorProgressionFeatures(11);
  assert.equal(lv11Features.length, 4, "Level 11 adds Risk Assessment");

  const lv15Features = getInventorProgressionFeatures(15);
  assert.equal(lv15Features.length, 5, "Level 15 adds Stranger Contraptions");

  const lv20Features = getInventorProgressionFeatures(20);
  assert.equal(lv20Features.length, 6, "Level 20 adds The Big One");

  // Progression preview integration
  const actor = createTestActor({
    name: "New Specialist",
    class: "specialist",
    level: 5,
    system: { details: { level: 5 } }
  });

  const preview = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-inventor",
    saves: ["wis"],
    skills: ["acr", "ste", "prc"],
    weaponCategory: "melee",
    fightingStyle: "brawler",
    startingEquipment: { mode: "cash" }
  });

  assert.equal(preview.valid, true, "Progression preview is valid");
  const branchFeatureCreates = preview.createItems.filter(i => i.flags?.ak5e?.specialistProgressionGrant?.kind === "branchFeature");
  assert.ok(branchFeatureCreates.length >= 2, "Creates Inventor branch features at level 5");
  const featureNames = branchFeatureCreates.map(f => f.name);
  assert.ok(featureNames.some(n => n.includes("Strange Contraption")), "Includes Strange Contraption");
  assert.ok(featureNames.some(n => n.includes("Mobile Modding")), "Includes Mobile Modding");
});

test("14. Module API Wiring", async () => {
  // Check exports on game.ak5e.specialist if globals loaded
  assert.equal(typeof isInventor, "function");
  assert.equal(typeof calculateInventorDC, "function");
  assert.equal(typeof calculateInstability, "function");
  assert.equal(typeof evaluateBreakdownRoll, "function");
  assert.equal(typeof applyEquipmentModification, "function");
  assert.equal(typeof removeEquipmentModification, "function");
  assert.equal(typeof repairBrokenEquipment, "function");
  assert.equal(typeof isBrokenEquipment, "function");
  assert.equal(typeof MODIFICATIONS_CATALOG, "object");
});
