import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTER_CLASS_ID, SUPPORTER_BRANCH_IDS, IMPLEMENTED_SUPPORTER_BRANCHES,
  SUPPORTER_SKILLS, SUPPORTER_SAVES, SUPPORTER_ARMOR_PROFS, SUPPORTER_WEAPON_PROFS,
  SUPPORTER_TOOL_CHOICES, ASI_LEVELS, SUPPORTER_LEVEL_STEPS, STARTING_EQUIPMENT_OPTIONS,
  checkLevel, pbForLevel, hitPointsAtLevel, aidDieSize, martialDC,
  supporterProfile, supporterEnabled, supporterLevel, supporterBranch,
  calculateSupporterProfile, aidAbilityKey, aidDieMax, highestAidAbility, hasAidAbilityChoice
} from "../scripts/supporter-rules.mjs";
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
  // 1st level: 6 + CON
  assert.equal(hitPointsAtLevel(1, 0), 6);
  assert.equal(hitPointsAtLevel(1, 3), 9);
  assert.equal(hitPointsAtLevel(1, -2), 4);

  // 2nd level: 6 + CON + 4 + CON = 10 + 2*CON
  assert.equal(hitPointsAtLevel(2, 0), 10);
  assert.equal(hitPointsAtLevel(2, 2), 14);

  // 5th level: 6 + 4*4 = 22 (CON 0)
  assert.equal(hitPointsAtLevel(5, 0), 22);
  // 5th level with CON +3: 9 + 4*7 = 37
  assert.equal(hitPointsAtLevel(5, 3), 37);

  // 20th level: 6 + 19*4 = 82 (CON 0)
  assert.equal(hitPointsAtLevel(20, 0), 82);
  // 20th level with CON +5: 11 + 19*9 = 182
  assert.equal(hitPointsAtLevel(20, 5), 182);

  // Rolled mode (1d6)
  const rolls = [5, 6, 3, 4];
  assert.equal(hitPointsAtLevel(5, 2, { mode: "rolled", rolls }), (6 + 2) + (5 + 2) + (6 + 2) + (3 + 2) + (4 + 2));

  // Extreme negative CON clamps minimum gain to 1 per level (1 + 1 + 1 = 3 at level 3)
  assert.equal(hitPointsAtLevel(3, -10), 3);
});

test("aidDieSize: d8 (1–6), d10 (7–13), d12 (14–20)", () => {
  for (let l = 1; l <= 6; l++) {
    assert.equal(aidDieSize(l), "d8", `Level ${l} should have d8 Aid Die`);
  }
  for (let l = 7; l <= 13; l++) {
    assert.equal(aidDieSize(l), "d10", `Level ${l} should have d10 Aid Die`);
  }
  for (let l = 14; l <= 20; l++) {
    assert.equal(aidDieSize(l), "d12", `Level ${l} should have d12 Aid Die`);
  }
});

test("DC calculations: martialDC only (R2: the base Supporter prints no DC)", () => {
  const actor1 = createTestActor({
    system: {
      attributes: { prof: 2 },
      abilities: {
        str: { mod: 1 },
        dex: { mod: 2 },
        int: { mod: 3 },
        wis: { mod: 1 },
        cha: { mod: 4 }
      }
    },
    flags: {
      ak5e: {
        supporter: { aidAbility: "cha" }
      }
    }
  });
  assert.equal(martialDC(actor1), 8 + 2 + 2); // 12

  const actor2 = createTestActor({
    system: {
      attributes: { prof: 4 },
      abilities: {
        str: { mod: 2 },
        dex: { mod: 1 },
        int: { mod: 4 },
        wis: { mod: 2 },
        cha: { mod: 1 }
      }
    },
    flags: {
      ak5e: {
        supporter: { aidAbility: "int" }
      }
    }
  });
});

test("progression table: step definitions for levels 1–20", () => {
  for (let l = 1; l <= 20; l++) {
    const step = SUPPORTER_LEVEL_STEPS[l];
    assert.ok(step, `Level ${l} step must exist`);
    assert.equal(step.level, l);
    assert.equal(step.pb, pbForLevel(l));
    assert.equal(step.aidDie, aidDieSize(l));
    assert.ok(Array.isArray(step.features) && step.features.length > 0);
  }
});

test("proficiencies and choices: rules matrices adhere to Ch. 3", () => {
  assert.deepEqual(SUPPORTER_ARMOR_PROFS, ["lgt", "shl"]);
  assert.deepEqual(SUPPORTER_WEAPON_PROFS, ["Light Melee"]);
  assert.deepEqual(SUPPORTER_TOOL_CHOICES, ["Tool Kit", "Vehicle"]);
  assert.deepEqual(ASI_LEVELS, [4, 6, 8, 10, 12, 16, 19]);
  assert.equal(SUPPORTER_SKILLS.length, 6);
  assert.deepEqual(SUPPORTER_SAVES.choices.map(([_, k]) => k), ["con", "cha", "wis"]);
  assert.equal(IMPLEMENTED_SUPPORTER_BRANCHES.length, 5);
});

test("supporterProfile: actor inspection and edge cases", () => {
  // Non-character
  const npc = createTestActor({ type: "npc" });
  assert.equal(supporterProfile(npc).applicable, false);

  // Character without Supporter class
  const warrior = createTestActor({ type: "character", items: [] });
  assert.equal(supporterProfile(warrior).applicable, false);

  // Character with Supporter class
  const sClass = createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: 3 },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  const actor = createTestActor({
    type: "character",
    items: [sClass],
    flags: { ak5e: { supporter: { enabled: true } } }
  });

  const profile = supporterProfile(actor);
  assert.equal(profile.applicable, true);
  assert.equal(profile.configured, true);
  assert.equal(profile.level, 3);
  assert.equal(supporterEnabled(actor), true);
  assert.equal(supporterLevel(actor), 3);

  // Unknown branch block
  const badSubclass = createTestItem({
    name: "Invalid Subclass",
    type: "subclass",
    flags: { ak5e: { chapterThreeId: "subclass-unknown" } }
  });
  const actorWithBadBranch = createTestActor({
    type: "character",
    items: [sClass, badSubclass]
  });
  const badBranchProfile = supporterProfile(actorWithBadBranch);
  assert.equal(badBranchProfile.applicable, true);
  assert.ok(badBranchProfile.blocked.includes("UnknownBranch"));

  // Multiple classes block
  const fighterClass = createTestItem({ name: "Fighter", type: "class", system: { levels: 2 } });
  const multiclassActor = createTestActor({ type: "character", items: [sClass, fighterClass] });
  const multiProfile = supporterProfile(multiclassActor);
  assert.equal(multiProfile.applicable, true);
  assert.ok(multiProfile.blocked.includes("MultipleClasses"));

  // Subclass resolved by name fallback
  const namedSubclass = createTestItem({ name: "Supporter: Artificer", type: "subclass" });
  const namedBranchActor = createTestActor({ type: "character", items: [sClass, namedSubclass] });
  const namedProfile = supporterProfile(namedBranchActor);
  assert.equal(namedProfile.branch, "artificer");
  assert.equal(supporterBranch(namedBranchActor), "artificer");

  // Invalid class level
  const invalidLevelClass = createTestItem({ name: "Supporter", type: "class", system: { levels: 25 }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const invalidLevelActor = createTestActor({ type: "character", items: [invalidLevelClass] });
  const invalidProfile = supporterProfile(invalidLevelActor);
  assert.ok(invalidProfile.blocked.includes("InvalidClassLevel"));
});

test("calculateSupporterProfile: returns full interface contract object", () => {
  const sClass = createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: 5 },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  const actor = createTestActor({
    type: "character",
    items: [sClass],
    system: {
      attributes: { prof: 3 },
      abilities: {
        con: { mod: 2 },
        cha: { mod: 3 }
      }
    },
    flags: {
      ak5e: {
        supporter: { enabled: true, aidAbility: "cha" }
      }
    }
  });

  const profile = calculateSupporterProfile(actor);
  assert.equal(profile.level, 5);
  assert.equal(profile.pb, 3);
  assert.equal(profile.hp.hitDice, "5d6");
  assert.equal(profile.hp.base, 8); // 6 + 2
  assert.equal(profile.hp.averagePerLevel, 6); // 4 + 2
  assert.equal(profile.hp.totalFixed, 32); // 8 + 4*6 = 32
  assert.deepEqual(profile.saves.choiceOptions, ["con", "cha", "wis"]);
  assert.deepEqual(profile.proficiencies.armor, ["lgt", "shl"]);
  assert.deepEqual(profile.proficiencies.weapons, ["Light Melee"]);
  assert.equal(profile.resources.aidDie.size, "d8");
  assert.equal(profile.dc.supporter, undefined, "no Supporter DC (R2)");
  assert.ok(profile.features.length >= 6);
});

test("artificerDC is 8 + Intelligence modifier + Proficiency Bonus (Ch. 3 L6958)", async () => {
  const { artificerDC } = await import("../scripts/supporter-rules.mjs");
  assert.equal(artificerDC({ system: { attributes: { prof: 4 }, abilities: { int: { mod: 3 } } } }), 15);
  assert.equal(artificerDC({ system: { attributes: { prof: 2 }, abilities: { int: { mod: -1 } } } }), 9);
});

/* ---- r1-base ruling F-R5: Aid ability falls back to the highest INT/WIS/CHA modifier ---- */

const abilityActor = (mods, flags = {}) => ({
  name: "Sup", system: { abilities: { int: { mod: mods.int }, wis: { mod: mods.wis }, cha: { mod: mods.cha } } },
  items: [], flags: flags.ak5e ? flags : { ak5e: flags }
});

test("F-R5: with no stored Aid ability the highest of INT/WIS/CHA is used; ties go cha, then wis, then int", () => {
  assert.equal(aidAbilityKey(abilityActor({ int: 5, wis: 1, cha: 2 }, {})), "int");
  assert.equal(aidAbilityKey(abilityActor({ int: 1, wis: 4, cha: 2 }, {})), "wis");
  assert.equal(aidAbilityKey(abilityActor({ int: 3, wis: 3, cha: 3 }, {})), "cha", "three-way tie: cha");
  assert.equal(aidAbilityKey(abilityActor({ int: 5, wis: 5, cha: 1 }, {})), "wis", "wis beats int on a tie");
  assert.equal(aidAbilityKey(abilityActor({ int: 5, wis: 5, cha: 5 }, {})), "cha");
  assert.equal(highestAidAbility(abilityActor({ int: 0, wis: 0, cha: -1 }, {})), "wis", "wis and int tie at 0; wis is earlier in the order");
});

test("F-R5: an explicit stored choice wins over the highest modifier; the max follows the chosen key", () => {
  const explicit = abilityActor({ int: 1, wis: 2, cha: 6 }, { supporter: { enabled: true, aidAbility: "int" } });
  assert.equal(aidAbilityKey(explicit), "int");
  assert.equal(aidDieMax(explicit), 1, "explicit INT mod, not the highest");
  const fallback = abilityActor({ int: 5, wis: 1, cha: 2 }, { supporter: { enabled: true } });
  assert.equal(aidDieMax(fallback), 5);
  assert.equal(calculateSupporterProfile(fallback).resources.aidDie.maxFormula, "max(0, @abilities.int.mod)");
  assert.equal(hasAidAbilityChoice(fallback), false);
});
