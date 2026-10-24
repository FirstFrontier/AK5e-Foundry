import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIC_CLASS_ID,
  MEDIC_BRANCH_IDS,
  IMPLEMENTED_MEDIC_BRANCHES,
  MEDIC_SAVES,
  MEDIC_SKILLS,
  MEDIC_SKILL_CHOICES,
  MEDIC_ARMOR_PROFS,
  MEDIC_WEAPON_PROFS,
  MEDIC_TOOL_CHOICES,
  ASI_LEVELS,
  LIFE_SUPPORT_STEPS,
  ARTS_POINTS_TABLE,
  MAX_ART_LEVEL_TABLE,
  MEDIC_LEVEL_STEPS,
  STARTING_EQUIPMENT_OPTIONS,
  checkLevel,
  pbForLevel,
  hitPointsAtLevel,
  lifeSupportMax,
  maxArtLevel,
  artsPointsForLevel,
  medicSpellcastingAbility,
  medicSpellDC,
  medicSpellAttackMod,
  martialDC,
  medicState,
  medicProfile,
  medicEnabled,
  medicLevel,
  medicBranch,
  isMedic,
  isPhysician,
  isTriage,
  calculateMedicProfile
} from "../scripts/medic-rules.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

test("checkLevel validates level bounds", () => {
  assert.equal(checkLevel(1), 1);
  assert.equal(checkLevel(20), 20);
  assert.equal(checkLevel("10"), 10);
  assert.throws(() => checkLevel(0), RangeError);
  assert.throws(() => checkLevel(21), RangeError);
  assert.throws(() => checkLevel(-5), RangeError);
  assert.throws(() => checkLevel(1.5), RangeError);
  assert.throws(() => checkLevel("abc"), RangeError);
  assert.throws(() => checkLevel(null), RangeError);
});

test("pbForLevel calculates proficiency bonus correctly across levels 1–20", () => {
  for (let lvl = 1; lvl <= 4; lvl++) assert.equal(pbForLevel(lvl), 2);
  for (let lvl = 5; lvl <= 8; lvl++) assert.equal(pbForLevel(lvl), 3);
  for (let lvl = 9; lvl <= 12; lvl++) assert.equal(pbForLevel(lvl), 4);
  for (let lvl = 13; lvl <= 16; lvl++) assert.equal(pbForLevel(lvl), 5);
  for (let lvl = 17; lvl <= 20; lvl++) assert.equal(pbForLevel(lvl), 6);
});

test("hitPointsAtLevel computes 1d6 HD scaling with minimum 1 HP gain per level", () => {
  // 1st level: 6 + CON
  assert.equal(hitPointsAtLevel(1, 2), 8);
  assert.equal(hitPointsAtLevel(1, 0), 6);
  assert.equal(hitPointsAtLevel(1, -2), 4);
  assert.equal(hitPointsAtLevel(1, -10), 1, "Clamped to minimum 1 HP");

  // Higher levels fixed: 4 + CON
  assert.equal(hitPointsAtLevel(2, 2, { mode: "fixed" }), 8 + 6); // 14
  assert.equal(hitPointsAtLevel(3, 2, { mode: "fixed" }), 14 + 6); // 20
  assert.equal(hitPointsAtLevel(5, 0, { mode: "fixed" }), 6 + (4 * 4)); // 22
  assert.equal(hitPointsAtLevel(2, -5, { mode: "fixed" }), 1 + 1); // min 1 at lv 1 and min 1 at lv 2

  // Higher levels rolled
  assert.equal(hitPointsAtLevel(3, 1, { mode: "rolled", rolls: [6, 3] }), (6 + 1) + (6 + 1) + (3 + 1)); // 7 + 7 + 4 = 18
});

test("lifeSupportMax matches exact Chapter 3 closed formula 20 + 15 * floor(Level/2)", () => {
  const expected = {
    1: 20, 2: 35, 3: 35, 4: 50, 5: 50, 6: 65, 7: 65, 8: 80, 9: 80, 10: 95,
    11: 95, 12: 110, 13: 110, 14: 125, 15: 125, 16: 140, 17: 140, 18: 155, 19: 155, 20: 170
  };

  for (let lvl = 1; lvl <= 20; lvl++) {
    assert.equal(lifeSupportMax(lvl), expected[lvl], `Life support at level ${lvl}`);
    assert.equal(LIFE_SUPPORT_STEPS[lvl], expected[lvl], `Step constant at level ${lvl}`);
  }
});

test("artsPointsForLevel and maxArtLevel match progression table", () => {
  assert.equal(artsPointsForLevel(1), 3);
  assert.equal(maxArtLevel(1), 1);

  assert.equal(artsPointsForLevel(5), 10);
  assert.equal(maxArtLevel(5), 3);

  assert.equal(artsPointsForLevel(11), 20);
  assert.equal(maxArtLevel(11), 6);

  assert.equal(artsPointsForLevel(17), 30);
  assert.equal(maxArtLevel(17), 9);

  assert.equal(artsPointsForLevel(20), 35);
  assert.equal(maxArtLevel(20), 9);

  for (let lvl = 1; lvl <= 20; lvl++) {
    assert.equal(artsPointsForLevel(lvl), ARTS_POINTS_TABLE[lvl]);
    assert.equal(maxArtLevel(lvl), MAX_ART_LEVEL_TABLE[lvl]);
  }
});

test("proficiencies and chassis constants adhere strictly to Ch. 3 L4588", () => {
  // Light Shields ONLY, NO light armor!
  assert.deepEqual(MEDIC_ARMOR_PROFS, ["shl"]);
  assert.ok(!MEDIC_ARMOR_PROFS.includes("lgt"), "Medic MUST NOT have Light Armor proficiency");
  assert.ok(!MEDIC_ARMOR_PROFS.includes("med"), "Medic MUST NOT have Medium Armor proficiency");
  assert.ok(!MEDIC_ARMOR_PROFS.includes("hvy"), "Medic MUST NOT have Heavy Armor proficiency");

  assert.deepEqual(MEDIC_WEAPON_PROFS, ["Light Melee"]);
  assert.deepEqual(ASI_LEVELS, [4, 6, 8, 10, 12, 16, 19]);
  assert.equal(MEDIC_CLASS_ID, "class-medic");
  assert.equal(MEDIC_BRANCH_IDS["subclass-medic-physician"], "physician");
  assert.equal(MEDIC_BRANCH_IDS["subclass-medic-triage"], "triage");
  assert.deepEqual(IMPLEMENTED_MEDIC_BRANCHES, ["physician", "triage"]);
});

test("Spellcasting Ability resolves INT or WIS and computes DCs", () => {
  const actorWis = createTestActor({
    abilities: {
      str: { value: 10, mod: 0 },
      dex: { value: 14, mod: 2 },
      con: { value: 14, mod: 2 },
      int: { value: 12, mod: 1 },
      wis: { value: 16, mod: 3 },
      cha: { value: 8, mod: -1 }
    },
    prof: 2
  });

  assert.equal(medicSpellcastingAbility(actorWis), "wis", "Defaults to higher of INT or WIS (WIS is 3 vs INT 1)");
  assert.equal(medicSpellDC(actorWis), 8 + 2 + 3); // 13
  assert.equal(medicSpellAttackMod(actorWis), 2 + 3); // 5
  assert.equal(martialDC(actorWis), 8 + 2 + 2); // 12 (DEX 2)

  // Explicit override to INT
  actorWis.flags.ak5e = { medic: { spellcastingAbility: "int" } };
  assert.equal(medicSpellcastingAbility(actorWis), "int");
  assert.equal(medicSpellDC(actorWis), 8 + 2 + 1); // 11
  assert.equal(medicSpellAttackMod(actorWis), 2 + 1); // 3
});

test("medicProfile and predicates evaluate Medic, Physician, and Triage identity", () => {
  const nonMedic = createTestActor({ name: "Warrior" });
  assert.equal(isMedic(nonMedic), false);
  assert.equal(isPhysician(nonMedic), false);
  assert.equal(isTriage(nonMedic), false);

  const medicUnconfigured = createTestActor({
    name: "Doctor",
    class: "class-medic",
    level: 3
  });
  const profUnconfigured = medicProfile(medicUnconfigured);
  assert.equal(profUnconfigured.applicable, true);
  assert.equal(profUnconfigured.configured, false);
  assert.equal(medicEnabled(medicUnconfigured), false);

  // Enable medic
  medicUnconfigured.flags.ak5e = { medic: { enabled: true } };
  assert.equal(medicEnabled(medicUnconfigured), true);
  assert.equal(isMedic(medicUnconfigured), true);
  assert.equal(isPhysician(medicUnconfigured), false);
  assert.equal(isTriage(medicUnconfigured), false);
  assert.equal(medicLevel(medicUnconfigured), 3);

  // Add Physician subclass
  const physicianItem = createTestItem({
    type: "subclass",
    name: "Physician",
    flags: { ak5e: { chapterThreeId: "subclass-medic-physician" } },
    parent: medicUnconfigured
  }, medicUnconfigured);
  medicUnconfigured.items.set(physicianItem.id, physicianItem);

  assert.equal(medicBranch(medicUnconfigured), "physician");
  assert.equal(isPhysician(medicUnconfigured), true);
  assert.equal(isTriage(medicUnconfigured), false);

  // Switch to Triage subclass
  physicianItem.flags.ak5e.chapterThreeId = "subclass-medic-triage";
  physicianItem.name = "Triage";
  assert.equal(medicBranch(medicUnconfigured), "triage");
  assert.equal(isPhysician(medicUnconfigured), false);
  assert.equal(isTriage(medicUnconfigured), true);
});

test("calculateMedicProfile returns complete profile complying with PROJECT.md contract", () => {
  const actor = createTestActor({
    name: "Combat Medic",
    class: "class-medic",
    branch: "subclass-medic-physician",
    level: 5,
    abilities: {
      str: { value: 10, mod: 0 },
      dex: { value: 12, mod: 1 },
      con: { value: 14, mod: 2 },
      int: { value: 10, mod: 0 },
      wis: { value: 16, mod: 3 },
      cha: { value: 10, mod: 0 }
    }
  });
  actor.flags.ak5e = { medic: { enabled: true, spellcastingAbility: "wis" } };

  const profile = calculateMedicProfile(actor);
  assert.equal(profile.level, 5);
  assert.equal(profile.pb, 3);
  assert.equal(profile.spellcastingAbility, "wis");
  assert.equal(profile.branch, "physician");
  assert.equal(profile.hp.hitDice, "5d6");
  assert.equal(profile.hp.base, 8); // 6 + 2
  assert.equal(profile.hp.averagePerLevel, 6); // 4 + 2
  assert.equal(profile.resources.lifeSupport.max, 50); // 20 + 15 * 2
  assert.equal(profile.resources.artsPoints.max, 10);
  assert.equal(profile.resources.artsPoints.maxArtLevel, 3);
  assert.equal(profile.dc.spell, 14); // 8 + 3 + 3
  assert.equal(profile.dc.martial, 12); // 8 + 3 + 1
  assert.deepEqual(profile.proficiencies.armor, ["shl"]);
  assert.ok(profile.features.includes("Self-Defence Protocol"));
});
