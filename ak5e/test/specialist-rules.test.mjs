import test from "node:test";
import assert from "node:assert/strict";
import {
  SPECIALIST_CLASS_ID, SPECIALIST_BRANCH_IDS, IMPLEMENTED_SPECIALIST_BRANCHES,
  SPECIALIST_SKILLS, SPECIALIST_SAVES, SPECIALIST_ARMOR_PROFS, SPECIALIST_WEAPON_PROFS,
  SPECIALIST_TOOL_CHOICES, ASI_LEVELS, WEAPON_SPECIALISATION_CATEGORIES,
  MELEE_FIGHTING_STYLES, RANGED_FIGHTING_STYLES, ALL_FIGHTING_STYLES,
  SPECIALIST_LEVEL_STEPS, STARTING_EQUIPMENT_OPTIONS,
  checkLevel, pbForLevel, hitPointsAtLevel, martialDC, specialistDC,
  weaponMasteryMeleeBonus, weaponMasteryRangedBonus,
  specialistProfile, specialistEnabled, specialistLevel, specialistBranch,
  calculateSpecialistProfile
} from "../scripts/specialist-rules.mjs";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem } from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

test("checkLevel: boundary validation and type safety", () => {
  for (let l = 1; l <= 20; l++) {
    assert.equal(checkLevel(l), l);
    assert.equal(checkLevel(String(l)), l);
  }
  assert.throws(() => checkLevel(0), RangeError);
  assert.throws(() => checkLevel(21), RangeError);
  assert.throws(() => checkLevel(-1), RangeError);
  assert.throws(() => checkLevel(2.5), RangeError);
  assert.throws(() => checkLevel("abc"), RangeError);
  assert.throws(() => checkLevel(null), RangeError);
});

test("pbForLevel: correct progression across all 20 levels", () => {
  const expected = {
    1: 2, 2: 2, 3: 2, 4: 2,
    5: 3, 6: 3, 7: 3, 8: 3,
    9: 4, 10: 4, 11: 4, 12: 4,
    13: 5, 14: 5, 15: 5, 16: 5,
    17: 6, 18: 6, 19: 6, 20: 6
  };
  for (const [lvl, pb] of Object.entries(expected)) {
    assert.equal(pbForLevel(Number(lvl)), pb, `Level ${lvl} should have PB ${pb}`);
  }
});

test("hitPointsAtLevel: fixed and rolled HP formulas across levels", () => {
  // 1st level: 8 + CON
  assert.equal(hitPointsAtLevel(1, 0), 8);
  assert.equal(hitPointsAtLevel(1, 3), 11);
  assert.equal(hitPointsAtLevel(1, -2), 6);

  // 2nd level: 8 + CON + 5 + CON = 13 + 2*CON
  assert.equal(hitPointsAtLevel(2, 0), 13);
  assert.equal(hitPointsAtLevel(2, 2), 17);

  // 5th level: 8 + 4*5 = 28 (CON 0)
  assert.equal(hitPointsAtLevel(5, 0), 28);
  // 5th level with CON +3: 11 + 4*8 = 43
  assert.equal(hitPointsAtLevel(5, 3), 43);

  // 20th level: 8 + 19*5 = 103 (CON 0)
  assert.equal(hitPointsAtLevel(20, 0), 103);
  // 20th level with CON +5: 13 + 19*10 = 203
  assert.equal(hitPointsAtLevel(20, 5), 203);

  // Rolled mode (1d8)
  const rolls = [6, 7, 4, 5];
  assert.equal(hitPointsAtLevel(5, 2, { mode: "rolled", rolls }), (8 + 2) + (6 + 2) + (7 + 2) + (4 + 2) + (5 + 2));

  // Extreme negative CON clamps minimum gain to 1 per level (1 + 1 + 1 = 3 at level 3)
  assert.equal(hitPointsAtLevel(3, -10), 3);
});

test("DC calculations: specialistDC and martialDC", () => {
  const actor1 = createTestActor({
    system: {
      attributes: { prof: 2 },
      abilities: {
        str: { mod: 1 },
        dex: { mod: 3 },
        con: { mod: 2 },
        int: { mod: 0 },
        wis: { mod: 1 },
        cha: { mod: 0 }
      }
    }
  });
  assert.equal(specialistDC(actor1), 8 + 2 + 3); // 13 (8 + PB + DEX)
  assert.equal(martialDC(actor1), 8 + 2 + 3); // 13 (8 + PB + max(STR, DEX))

  const actor2 = createTestActor({
    system: {
      attributes: { prof: 4 },
      abilities: {
        str: { mod: 4 },
        dex: { mod: 2 },
        con: { mod: 2 },
        int: { mod: 1 },
        wis: { mod: 2 },
        cha: { mod: 0 }
      }
    }
  });
  assert.equal(specialistDC(actor2), 8 + 4 + 2); // 14 (DEX mod 2)
  assert.equal(martialDC(actor2), 8 + 4 + 4); // 16 (STR mod 4)
});

test("weaponMastery bonuses: melee half level and ranged double PB", () => {
  assert.equal(weaponMasteryMeleeBonus(1), 0);
  assert.equal(weaponMasteryMeleeBonus(6), 3);
  assert.equal(weaponMasteryMeleeBonus(18), 9);
  assert.equal(weaponMasteryMeleeBonus(19), 9);
  assert.equal(weaponMasteryMeleeBonus(20), 10);

  const actor = createTestActor({
    items: [
      createTestItem({
        name: "Specialist",
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
      })
    ]
  });
  assert.equal(weaponMasteryRangedBonus(actor), 6); // Lv 18 PB is 6
});

test("fightingStyles catalog: 8 melee and 7 ranged styles correctly mapped", () => {
  assert.equal(MELEE_FIGHTING_STYLES.length, 8);
  assert.equal(RANGED_FIGHTING_STYLES.length, 7);
  assert.equal(ALL_FIGHTING_STYLES.length, 15);

  const meleeIds = MELEE_FIGHTING_STYLES.map(s => s.id);
  assert.ok(meleeIds.includes("brawler"));
  assert.ok(meleeIds.includes("deadlyFighterMelee"));
  assert.ok(meleeIds.includes("defensive"));
  assert.ok(meleeIds.includes("duelling"));
  assert.ok(meleeIds.includes("greatWeaponFighting"));
  assert.ok(meleeIds.includes("lightlyArmed"));
  assert.ok(meleeIds.includes("spearwall"));
  assert.ok(meleeIds.includes("twoWeaponFightingMelee"));

  const rangedIds = RANGED_FIGHTING_STYLES.map(s => s.id);
  assert.ok(rangedIds.includes("bracedForAction"));
  assert.ok(rangedIds.includes("closeAndPersonal"));
  assert.ok(rangedIds.includes("coneOfFire"));
  assert.ok(rangedIds.includes("deadlyFighterRanged"));
  assert.ok(rangedIds.includes("ranger"));
  assert.ok(rangedIds.includes("smoothOperator"));
  assert.ok(rangedIds.includes("twoWeaponFightingRanged"));

  for (const style of ALL_FIGHTING_STYLES) {
    assert.ok(style.id && typeof style.id === "string");
    assert.ok(style.name && typeof style.name === "string");
    assert.ok(style.chapterThreeId && style.chapterThreeId.startsWith("class-feature-specialist-"));
    assert.ok(style.summary && typeof style.summary === "string");
  }
});

test("progression table: step definitions for levels 1–20", () => {
  for (let l = 1; l <= 20; l++) {
    const step = SPECIALIST_LEVEL_STEPS[l];
    assert.ok(step, `Level ${l} step must exist`);
    assert.equal(step.level, l);
    assert.equal(step.pb, pbForLevel(l));
    assert.ok(Array.isArray(step.features) && step.features.length > 0);
  }
});

test("proficiencies and choices: rules matrices adhere to Ch. 3", () => {
  assert.deepEqual(SPECIALIST_ARMOR_PROFS, ["lgt", "med", "shl"]);
  assert.deepEqual(SPECIALIST_WEAPON_PROFS, ["Light Melee", "Light Ranged"]);
  assert.deepEqual(SPECIALIST_TOOL_CHOICES, ["Two Tool Kits of your choice"]);
  assert.deepEqual(ASI_LEVELS, [4, 6, 8, 10, 12, 16, 19]);
  assert.equal(SPECIALIST_SKILLS.length, 6);
  assert.equal(SPECIALIST_SAVES.automatic, "dex");
  assert.deepEqual(SPECIALIST_SAVES.choices.map(([_, k]) => k), ["wis", "cha"]);
  assert.equal(IMPLEMENTED_SPECIALIST_BRANCHES.length, 7);
});

test("specialistProfile: actor inspection and edge cases", () => {
  // Non-character
  const npc = createTestActor({ type: "npc" });
  assert.equal(specialistProfile(npc).applicable, false);

  // Character without class
  const emptyChar = createTestActor({ type: "character" });
  assert.equal(specialistProfile(emptyChar).applicable, false);

  // Multiclass block
  const multiclass = createTestActor({
    type: "character",
    items: [
      createTestItem({ name: "Specialist", type: "class", system: { levels: 3 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } }),
      createTestItem({ name: "Guard", type: "class", system: { levels: 2 } })
    ]
  });
  const mcProfile = specialistProfile(multiclass);
  assert.equal(mcProfile.applicable, true);
  assert.deepEqual(mcProfile.blocked, ["MultipleClasses"]);

  // Invalid class level
  const invalidLevel = createTestActor({
    type: "character",
    items: [
      createTestItem({ name: "Specialist", type: "class", system: { levels: 25 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } })
    ]
  });
  const invProfile = specialistProfile(invalidLevel);
  assert.equal(invProfile.applicable, true);
  assert.deepEqual(invProfile.blocked, ["InvalidClassLevel"]);

  // Valid Specialist without branch
  const validNoBranch = createTestActor({
    type: "character",
    items: [
      createTestItem({ name: "Specialist", type: "class", system: { levels: 4 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } })
    ],
    flags: { ak5e: { specialist: { enabled: true, weaponCategory: "melee", fightingStyle: "duelling" } } }
  });
  const p1 = specialistProfile(validNoBranch);
  assert.equal(p1.applicable, true);
  assert.equal(p1.configured, true);
  assert.equal(p1.level, 4);
  assert.equal(p1.branch, null);
  assert.equal(p1.weaponCategory, "melee");
  assert.equal(p1.fightingStyle, "duelling");
  assert.equal(specialistEnabled(validNoBranch), true);
  assert.equal(specialistLevel(validNoBranch), 4);
  assert.equal(specialistBranch(validNoBranch), null);

  // Valid Specialist with branch
  const validWithBranch = createTestActor({
    type: "character",
    items: [
      createTestItem({ name: "Specialist", type: "class", system: { levels: 6 }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } }),
      createTestItem({ name: "Executor", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-specialist-executor" } } })
    ],
    flags: { ak5e: { specialist: { enabled: true } } }
  });
  const p2 = specialistProfile(validWithBranch);
  assert.equal(p2.branch, "executor");
  assert.equal(specialistBranch(validWithBranch), "executor");

  // calculateSpecialistProfile returns expected interface contract
  const fullProfile = calculateSpecialistProfile(validWithBranch);
  assert.equal(fullProfile.level, 6);
  assert.equal(fullProfile.pb, 3);
  assert.equal(fullProfile.hp.hitDice, "6d8");
  assert.equal(fullProfile.saves.automatic, "dex");
  assert.deepEqual(fullProfile.saves.choiceOptions, ["wis", "cha"]);
  assert.deepEqual(fullProfile.proficiencies.armor, ["lgt", "med", "shl"]);
  assert.deepEqual(fullProfile.proficiencies.weapons, ["Light Melee", "Light Ranged"]);
  assert.equal(fullProfile.resources.prowess.max, 3);
  assert.ok(fullProfile.features.length >= 6);
});
