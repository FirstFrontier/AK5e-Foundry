import test from "node:test";
import assert from "node:assert/strict";
import {
  hasWeaponSpecialisation, getWeaponSpecialisation, hasShowYourStyle,
  hasWeaponAdept, hasWeaponExpertise, hasFallingUpwards,
  hasWeaponMastery, defineSpecialistPools, onSpecialistRest, registerSpecialistHooks
} from "../scripts/specialist-features.mjs";
import { specialistUses } from "../scripts/specialist-uses.mjs";
import { SPECIALIST_CLASS_ID } from "../scripts/specialist-rules.mjs";
import { getPool, refundPool, spendPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem,
  triggerShortRest, triggerLongRest
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function createSpecialistActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2 },
      abilities: {
        str: { mod: 1, value: 12 },
        dex: { mod: 3, value: 16 },
        con: { mod: 2, value: 14 },
        int: { mod: 1, value: 12 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 }
      },
      ...options.system
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "duelling"
        }
      }
    }
  });
  return actor;
}

test("Feature level unlocks: Weapon Specialisation, Show Your Style, Weapon Adept, Weapon Expertise, Falling Upwards, Weapon Mastery", () => {
  const lv1 = createSpecialistActor(1);
  const lv3 = createSpecialistActor(3);
  const lv4 = createSpecialistActor(4);
  const lv5 = createSpecialistActor(5);
  const lv6 = createSpecialistActor(6);
  const lv11 = createSpecialistActor(11);
  const lv12 = createSpecialistActor(12);
  const lv16 = createSpecialistActor(16);
  const lv17 = createSpecialistActor(17);
  const lv18 = createSpecialistActor(18);

  // Weapon Specialisation (Lv 1)
  assert.equal(hasWeaponSpecialisation(lv1), true);

  // Show Your Style (Lv 4)
  assert.equal(hasShowYourStyle(lv1), false);
  assert.equal(hasShowYourStyle(lv3), false);
  assert.equal(hasShowYourStyle(lv4), true);
  assert.equal(hasShowYourStyle(lv5), true);

  // Weapon Adept (Lv 6)
  assert.equal(hasWeaponAdept(lv5), false);
  assert.equal(hasWeaponAdept(lv6), true);

  // Weapon Expertise (Lv 12)
  assert.equal(hasWeaponExpertise(lv11), false);
  assert.equal(hasWeaponExpertise(lv12), true);

  // Falling Upwards (Lv 17)
  assert.equal(hasFallingUpwards(lv16), false);
  assert.equal(hasFallingUpwards(lv17), true);

  // Weapon Mastery (Lv 18)
  assert.equal(hasWeaponMastery(lv17), false);
  assert.equal(hasWeaponMastery(lv18), true);
});

test("Resource pool: prowess registration, initial value, spend, refund, and max cap", async () => {
  const actor = createSpecialistActor(4); // PB = 2
  const pool = getPool(actor, "prowess");
  assert.equal(pool.id, "prowess");
  assert.equal(pool.max, 2);
  assert.equal(pool.value, 0); // initial is 0

  // Refund (gain) 2 Prowess
  await refundPool(actor, "prowess", 2);
  assert.equal(getPool(actor, "prowess").value, 2);

  // Spend 1 Prowess
  await spendPool(actor, "prowess", 1);
  assert.equal(getPool(actor, "prowess").value, 1);

  // Capping at max
  await refundPool(actor, "prowess", 5);
  assert.equal(getPool(actor, "prowess").value, 2);
});

test("Short Rest and Long Rest recovery: 1 Prowess restored per rest up to maximum", async () => {
  registerSpecialistHooks();
  const actor = createSpecialistActor(6); // PB = 3
  assert.equal(getPool(actor, "prowess").value, 0);

  // Short rest regains 1
  await triggerShortRest(actor);
  assert.equal(getPool(actor, "prowess").value, 1);

  // Another short rest regains 1
  await triggerShortRest(actor);
  assert.equal(getPool(actor, "prowess").value, 2);

  // Long rest regains 1
  await triggerLongRest(actor);
  assert.equal(getPool(actor, "prowess").value, 3);

  // Further rest does not exceed max of 3
  await triggerLongRest(actor);
  assert.equal(getPool(actor, "prowess").value, 3);
});

test("specialistUses: markOfASpecialist spend, shortfall warning override, and refund", async () => {
  const actor = createSpecialistActor(4);
  await refundPool(actor, "prowess", 2);

  // 1. Successful spend of 1 Prowess to reroll Sleight of Hand
  const opId1 = "mark-op-1";
  const result1 = await specialistUses.execute(actor, "markOfASpecialist", {
    skill: "slt",
    skillName: "Sleight of Hand"
  }, opId1);
  assert.ok(result1);
  assert.equal(getPool(actor, "prowess").value, 1);
  assert.equal(result1.skill, "slt");
  assert.equal(result1.prowessCost, 1);

  // 2. Second failure triggers refundMarkOfASpecialist
  const opIdRefund = "refund-op-1";
  const resultRefund = await specialistUses.execute(actor, "refundMarkOfASpecialist", {}, opIdRefund);
  assert.ok(resultRefund);
  assert.equal(resultRefund.refundedProwess, 1);
  assert.equal(getPool(actor, "prowess").value, 2); // 1 + 1 refunded = 2

  // 3. Spend down to 0
  await spendPool(actor, "prowess", 2);
  assert.equal(getPool(actor, "prowess").value, 0);

  // Spending with 0 prowess raises PlayWarnings unless overridden
  await assert.rejects(
    () => specialistUses.execute(actor, "markOfASpecialist", { skill: "ste", skillName: "Stealth" }),
    err => {
      assert.ok(err.name === "PlayWarnings" || err.warnings);
      return true;
    }
  );

  // Overriding shortfall clamps at 0
  const opIdOverride = "override-op-1";
  const resultOverride = await specialistUses.execute(actor, "markOfASpecialist", {
    skill: "ste",
    skillName: "Stealth",
    overrides: ["shortfall"]
  }, opIdOverride);
  assert.ok(resultOverride);
  assert.equal(getPool(actor, "prowess").value, 0);
  const receiptOverride = specialistUses.receipt(actor, opIdOverride);
  assert.ok(receiptOverride.shortfalls?.some(s => s.includes("short by 1")));
});

test("specialistUses: weaponExpertiseMelee and weaponExpertiseRanged", async () => {
  // Melee actor at level 12
  const meleeActor = createSpecialistActor(12, { weaponCategory: "melee" });
  await refundPool(meleeActor, "prowess", 4);

  const meleeUse = await specialistUses.execute(meleeActor, "weaponExpertiseMelee");
  assert.ok(meleeUse);
  assert.equal(meleeUse.bonusDice, 1);
  assert.equal(getPool(meleeActor, "prowess").value, 3);

  // Ranged actor at level 12
  const rangedActor = createSpecialistActor(12, { weaponCategory: "ranged" });
  await refundPool(rangedActor, "prowess", 4);

  const rangedUse = await specialistUses.execute(rangedActor, "weaponExpertiseRanged");
  assert.ok(rangedUse);
  assert.equal(rangedUse.advantage, true);
  assert.equal(getPool(rangedActor, "prowess").value, 3);

  // Wrong specialisation throws warning
  await assert.rejects(
    () => specialistUses.execute(rangedActor, "weaponExpertiseMelee"),
    err => {
      assert.ok(err.name === "PlayWarnings" || err.warnings);
      return true;
    }
  );
});

test("specialistUses: itsAllSkill auto-success spend, reaction consumption, and undo", async () => {
  const actor = createSpecialistActor(17);
  await refundPool(actor, "prowess", 6);

  const opId = "its-all-skill-op";
  const use = await specialistUses.execute(actor, "itsAllSkill", {}, opId);
  assert.ok(use);
  assert.equal(use.autoSuccess, true);
  assert.equal(getPool(actor, "prowess").value, 3); // 6 - 3 = 3

  const receipt = specialistUses.receipt(actor, opId);
  assert.equal(receipt.reaction?.spent, true);

  // Undo restores both 3 Prowess and the spent reaction
  await specialistUses.undo(actor, opId);
  assert.equal(getPool(actor, "prowess").value, 6);
});

test("specialistUses: weaponMasteryMelee and weaponMasteryRanged calculations", async () => {
  const meleeActor = createSpecialistActor(18, { weaponCategory: "melee" });
  const meleeUse = await specialistUses.execute(meleeActor, "weaponMasteryMelee");
  assert.ok(meleeUse);
  assert.equal(meleeUse.damageBonus, 9); // floor(18 / 2) = 9

  const rangedActor = createSpecialistActor(20, { weaponCategory: "ranged" });
  const rangedUse = await specialistUses.execute(rangedActor, "weaponMasteryRanged");
  assert.ok(rangedUse);
  assert.equal(rangedUse.attackBonus, 6); // Lv 20 PB = 6
});

test("specialistUses: defensiveStyle reaction spend and undo", async () => {
  const actor = createSpecialistActor(2);
  const opId = "def-op";
  const use = await specialistUses.execute(actor, "defensiveStyle", {}, opId);
  assert.ok(use);
  assert.equal(use.acBonusFormula, "1d4");

  const receipt = specialistUses.receipt(actor, opId);
  assert.equal(receipt.reaction?.spent, true);

  await specialistUses.undo(actor, opId);
});
