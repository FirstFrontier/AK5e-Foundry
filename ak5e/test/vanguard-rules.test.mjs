import test from "node:test";
import assert from "node:assert/strict";
import {
  VANGUARD_CLASS_ID, VANGUARD_BRANCH_IDS, IMPLEMENTED_VANGUARD_BRANCHES,
  VANGUARD_SKILLS, VANGUARD_SAVES, VANGUARD_ARMOR_PROFS, VANGUARD_WEAPON_PROFS,
  VANGUARD_TOOL_PROFS, ASI_LEVELS, VANGUARD_LEVEL_STEPS, STARTING_EQUIPMENT_OPTIONS,
  checkLevel, pbForLevel, hitPointsAtLevel, approachingStormBonus, landstriderSpeedBonus,
  martialDC, vanguardDC, vanguardProfile, vanguardEnabled, vanguardLevel, vanguardBranch,
  calculateVanguardProfile
} from "../scripts/vanguard-rules.mjs";
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

  // Rolled mode
  const rolls = [7, 8, 4, 6];
  assert.equal(hitPointsAtLevel(5, 2, { mode: "rolled", rolls }), (8 + 2) + (7 + 2) + (8 + 2) + (4 + 2) + (6 + 2));

  // Extreme negative CON clamps minimum gain to 1 per level (1 + 1 + 1 = 3 at level 3)
  assert.equal(hitPointsAtLevel(3, -10), 3);
});

test("feature scaling formulas: Approaching Storm and Landstrider", () => {
  assert.equal(landstriderSpeedBonus(), 10);
  assert.equal(approachingStormBonus(1), 0);
  assert.equal(approachingStormBonus(10), 5);
  assert.equal(approachingStormBonus(18), 9);
  assert.equal(approachingStormBonus(19), 9);
  assert.equal(approachingStormBonus(20), 10);
});

test("DC calculations: martialDC and vanguardDC", () => {
  const actor1 = createTestActor({
    system: {
      attributes: { prof: 2 },
      abilities: {
        str: { mod: 3 },
        dex: { mod: 2 }
      }
    }
  });
  assert.equal(martialDC(actor1), 8 + 2 + 3); // 13
  assert.equal(vanguardDC(actor1), 8 + 2 + 2); // 12

  const actor2 = createTestActor({
    system: {
      attributes: { prof: 5 },
      abilities: {
        str: { mod: 1 },
        dex: { mod: 4 }
      }
    }
  });
  assert.equal(martialDC(actor2), 8 + 5 + 4); // 17
  assert.equal(vanguardDC(actor2), 8 + 5 + 4); // 17
});

test("progression table: step definitions for levels 1–20", () => {
  assert.equal(Object.keys(VANGUARD_LEVEL_STEPS).length, 20);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[1].features, ["Elite 0- Vanguard Branch", "Landstrider", "Tip of the Spear"]);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[3].features, ["Basic Talent", "Quick off the Mark"]);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[5].features, ["Extra Attack"]);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[11].features, ["Uncanny Dodge"]);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[15].features, ["Directed Engagement"]);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[18].features, ["Lightspeed"]);
  assert.deepEqual(VANGUARD_LEVEL_STEPS[20].features, ["Approaching Storm"]);

  assert.deepEqual(ASI_LEVELS, [4, 6, 8, 10, 12, 16, 19]);
});

test("proficiencies and choices: rules matrices adhere to Ch. 3", () => {
  assert.deepEqual(VANGUARD_ARMOR_PROFS, ["lgt", "shl"]);
  assert.deepEqual(VANGUARD_WEAPON_PROFS, ["Light Melee"]);
  assert.deepEqual(VANGUARD_TOOL_PROFS, ["Messenger Kit"]);
  assert.equal(VANGUARD_SAVES.automatic, "dex");
  assert.deepEqual(VANGUARD_SAVES.choices, [["Strength", "str"], ["Charisma", "cha"]]);
  assert.equal(VANGUARD_SKILLS.length, 6);
  assert.equal(STARTING_EQUIPMENT_OPTIONS.cashOptionLMD, 1300);
});

test("vanguardProfile: actor inspection and edge cases", () => {
  // Non-character
  assert.equal(vanguardProfile({ type: "npc" }).applicable, false);

  // Character without class
  const emptyActor = createTestActor();
  assert.equal(vanguardProfile(emptyActor).applicable, false);

  // Character with Vanguard class
  const vanguardItem = createTestItem({
    name: "Vanguard",
    type: "class",
    system: { levels: 5 },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  const actor = createTestActor({ items: [vanguardItem] });
  let prof = vanguardProfile(actor);
  assert.equal(prof.applicable, true);
  assert.equal(prof.level, 5);
  assert.equal(prof.branch, null);
  assert.equal(vanguardLevel(actor), 5);
  assert.equal(vanguardBranch(actor), null);
  assert.equal(vanguardEnabled(actor), false); // not yet configured

  // Enable via flag
  actor.flags.ak5e.vanguard = { enabled: true };
  assert.equal(vanguardEnabled(actor), true);

  // With branch: Agent
  const branchItem = createTestItem({
    name: "Vanguard: Agent",
    type: "subclass",
    flags: { ak5e: { chapterThreeId: "subclass-vanguard-agent" } }
  });
  actor.items.set(branchItem.id, branchItem);
  prof = vanguardProfile(actor);
  assert.equal(prof.branch, "agent");
  assert.equal(vanguardBranch(actor), "agent");

  // Multiclass detection
  const secondClass = createTestItem({ name: "Guard", type: "class", system: { levels: 2 } });
  actor.items.set(secondClass.id, secondClass);
  prof = vanguardProfile(actor);
  assert.deepEqual(prof.blocked, ["MultipleClasses"]);
  assert.equal(vanguardEnabled(actor), false);
});

test("calculateVanguardProfile: returns full interface contract object", () => {
  const vanguardItem = createTestItem({
    name: "Vanguard",
    type: "class",
    system: { levels: 3 },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [vanguardItem],
    system: {
      attributes: { prof: 2 },
      abilities: { con: { mod: 2 }, dex: { mod: 3 }, str: { mod: 1 } }
    }
  });

  const fullProf = calculateVanguardProfile(actor);
  assert.equal(fullProf.level, 3);
  assert.equal(fullProf.pb, 2);
  assert.equal(fullProf.hp.hitDice, "3d8");
  assert.equal(fullProf.hp.base, 10);
  assert.equal(fullProf.hp.averagePerLevel, 7);
  assert.equal(fullProf.hp.totalFixed, 24); // (8+2) + 2*(5+2) = 10 + 14 = 24
  assert.equal(fullProf.saves.automatic, "dex");
  assert.deepEqual(fullProf.saves.choiceOptions, ["str", "cha"]);
  assert.deepEqual(fullProf.proficiencies.armor, ["lgt", "shl"]);
  assert.deepEqual(fullProf.proficiencies.weapons, ["Light Melee"]);
  assert.deepEqual(fullProf.proficiencies.tools, ["Messenger Kit"]);
  assert.equal(fullProf.dc.vanguard, 8 + 2 + 3);
  assert.equal(fullProf.dc.martial, 8 + 2 + 3);
});
