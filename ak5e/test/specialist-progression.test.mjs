import test from "node:test";
import assert from "node:assert/strict";
import {
  previewSpecialistSetup, applySpecialistSetup, SPECIALIST_CORE_FEATURES
} from "../scripts/specialist-setup.mjs";
import {
  inspectSpecialistFields, specialistChoices, previewSpecialistProgression, applySpecialistProgression,
  SPECIALIST_PROGRESS_FLAG
} from "../scripts/specialist-progression.mjs";
import { SPECIALIST_CLASS_ID, SPECIALIST_SKILLS, SPECIALIST_SAVES, ASI_LEVELS } from "../scripts/specialist-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
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
      attributes: {
        hp: { value: 10, max: 10, temp: 0 },
        prof: Math.floor((level - 1) / 4) + 2
      },
      abilities: {
        str: { value: 12, mod: 1 },
        dex: { value: 16, mod: 3 },
        con: { value: 14, mod: 2 },
        int: { value: 12, mod: 1 },
        wis: { value: 12, mod: 1 },
        cha: { value: 10, mod: 0 }
      },
      traits: {
        saves: { value: [] },
        armorProf: { value: [] },
        weaponProf: { value: [] },
        toolProf: { value: [] }
      },
      skills: {
        acr: { value: 0 },
        slt: { value: 0 },
        ste: { value: 0 },
        ak5etech: { value: 0 },
        prc: { value: 0 },
        ak5ewilderness: { value: 0 }
      },
      currency: { cp: 0 },
      ...options.system
    }
  });
  return actor;
}

test("previewSpecialistSetup: generates feature items up to actor level and deterministic contextKey", async () => {
  const actor = createSpecialistActor(1);
  const preview = await previewSpecialistSetup(actor);

  assert.equal(preview.level, 1);
  // Level 1: Specialist Branch, Weapon Specialisation -> 2 features
  assert.equal(preview.creates.length, 2);
  assert.equal(preview.kept.length, 0);
  assert.ok(preview.contextKey.length > 0);

  // Deterministic contextKey: identical actor yields identical hash
  const preview2 = await previewSpecialistSetup(actor);
  assert.equal(preview.contextKey, preview2.contextKey);

  // Higher level actor gets more features
  const actorLv6 = createSpecialistActor(6);
  const previewLv6 = await previewSpecialistSetup(actorLv6);
  // Features at levels 1 (x2), 2, 3, 4 (x2), 6 -> 7 features
  assert.equal(previewLv6.level, 6);
  assert.ok(previewLv6.creates.length >= 7);
});

test("applySpecialistSetup: idempotent application preserving existing features", async () => {
  const actor = createSpecialistActor(4);
  const preview = await previewSpecialistSetup(actor);

  // Unconfirmed setup throws
  await assert.rejects(() => applySpecialistSetup(actor, { confirmed: false, contextKey: preview.contextKey }));

  // Mismatched contextKey throws
  await assert.rejects(() => applySpecialistSetup(actor, { confirmed: true, contextKey: "wrong-key" }));

  // Apply setup
  const result = await applySpecialistSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.equal(result.level, 4);
  assert.ok(result.created.length >= 5);

  // Re-running setup creates 0 new items and keeps all existing
  const secondPreview = await previewSpecialistSetup(actor);
  assert.equal(secondPreview.creates.length, 0);
  assert.equal(secondPreview.kept.length, result.created.length);

  const secondResult = await applySpecialistSetup(actor, { confirmed: true, contextKey: secondPreview.contextKey });
  assert.equal(secondResult.created.length, 0);
  assert.equal(secondResult.kept.length, result.created.length);
});

test("inspectSpecialistFields: returns schema options for branch, saves, skills, styles, equipment, and level choices", () => {
  const actor = createSpecialistActor(1);
  const fields = inspectSpecialistFields(actor);

  const keys = fields.map(f => f.key);
  assert.ok(keys.includes("branch"));
  assert.ok(keys.includes("saves"));
  assert.ok(keys.includes("skills"));
  assert.ok(keys.includes("weaponCategory"));
  assert.ok(keys.includes("fightingStyle"));
  assert.ok(keys.includes("startingEquipment.mode"));
  assert.ok(keys.includes("hp.1"));

  // Saves: Dex automatic, 1 choice from Wis/Cha
  const saveField = fields.find(f => f.key === "saves");
  assert.equal(saveField.count, 1);
  assert.deepEqual(saveField.options.map(o => o.value), ["wis", "cha"]);

  // Skills: Choose 3 from 6
  const skillField = fields.find(f => f.key === "skills");
  assert.equal(skillField.count, 3);
  assert.equal(skillField.options.length, 6);

  // Weapon Category: Melee vs Ranged
  const catField = fields.find(f => f.key === "weaponCategory");
  assert.equal(catField.options.length, 2);
});

test("previewSpecialistProgression: validates required choices and rejects invalid permutations", async () => {
  const actor = createSpecialistActor(1);

  // Empty choices -> pending branch, saves, skills, weaponCategory, fightingStyle, equipment
  const planEmpty = await previewSpecialistProgression(actor, {});
  assert.equal(planEmpty.valid, false);
  assert.ok(planEmpty.pending.includes("branch"));
  assert.ok(planEmpty.pending.includes("saves"));
  assert.ok(planEmpty.pending.includes("skills"));
  assert.ok(planEmpty.pending.includes("weaponCategory"));
  assert.ok(planEmpty.pending.includes("fightingStyle"));
  assert.ok(planEmpty.pending.includes("startingEquipment.mode"));

  // Invalid saves (two saves chosen instead of 1)
  const planTwoSaves = await previewSpecialistProgression(actor, {
    saves: ["wis", "cha"]
  });
  assert.ok(planTwoSaves.pending.includes("saves"));

  // Invalid save choice (not wis or cha)
  const planBadSave = await previewSpecialistProgression(actor, {
    saves: ["str"]
  });
  assert.ok(planBadSave.pending.includes("saves"));

  // Invalid skills (only 2 chosen)
  const planTwoSkills = await previewSpecialistProgression(actor, {
    skills: ["acr", "slt"]
  });
  assert.ok(planTwoSkills.pending.includes("skills"));

  // Invalid skills (duplicate skills)
  const planDupSkills = await previewSpecialistProgression(actor, {
    skills: ["acr", "slt", "acr"]
  });
  assert.ok(planDupSkills.pending.includes("skills"));
});

test("applySpecialistProgression: level 1 progression with cash option, proficiencies, saves, and fighting style", async () => {
  const actor = createSpecialistActor(1);

  const choices = {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "duelling",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" } }
  };

  const preview = await previewSpecialistProgression(actor, choices);
  assert.equal(preview.valid, true);
  assert.equal(preview.pending.length, 0);

  // Apply progression
  const result = await applySpecialistProgression(actor, {
    confirmed: true,
    contextKey: preview.contextKey,
    choices
  });
  assert.equal(result.success, true);
  assert.equal(result.level, 1);

  // Verify actor state
  assert.equal(actor.flags.ak5e.specialist.enabled, true);
  assert.equal(actor.flags.ak5e.specialist.weaponCategory, "melee");
  assert.equal(actor.flags.ak5e.specialist.fightingStyle, "duelling");

  // Saves: Dex automatic + Wis
  assert.ok(actor.system.traits.saves.value.includes("dex"));
  assert.ok(actor.system.traits.saves.value.includes("wis"));
  assert.equal(actor.system.traits.saves.value.includes("cha"), false);

  // Armor: Light, Medium, Light Shield
  assert.ok(actor.system.traits.armorProf.value.includes("lgt"));
  assert.ok(actor.system.traits.armorProf.value.includes("med"));
  assert.ok(actor.system.traits.armorProf.value.includes("shl"));

  // Skills
  assert.equal(actor.system.skills.acr.value, 1);
  assert.equal(actor.system.skills.slt.value, 1);
  assert.equal(actor.system.skills.ste.value, 1);
  assert.equal(actor.system.skills.prc.value, 0);

  // Currency: 1300 CP gained
  assert.equal(actor.system.currency.cp, 1300);

  // Items created: Executor subclass item + Duelling fighting style item
  const itemNames = Array.from(actor.items.values()).map(i => i.name);
  assert.ok(itemNames.some(name => name.includes("Executor") || name.includes("subclass")));
  assert.ok(itemNames.some(name => name.includes("Duelling")));
});

test("applySpecialistProgression: level-up to 4 applies ASI and HP idempotently without duplicating starting gear", async () => {
  // Start at Level 4
  const actor = createSpecialistActor(4);

  const choicesLv4 = {
    branch: "subclass-specialist-hookmaster",
    saves: ["cha"],
    skills: ["ste", "ak5etech", "prc"],
    weaponCategory: "ranged",
    fightingStyle: "ranger",
    startingEquipment: { mode: "cash" },
    hp: {
      1: { mode: "fixed" },
      2: { mode: "fixed" },
      3: { mode: "fixed" },
      4: { mode: "fixed" }
    },
    asi: {
      4: {
        increases: [{ ability: "dex", amount: 2 }]
      }
    }
  };

  const preview = await previewSpecialistProgression(actor, choicesLv4);
  assert.equal(preview.valid, true);

  const initialDex = actor.system.abilities.dex.value; // 16
  await applySpecialistProgression(actor, {
    confirmed: true,
    contextKey: preview.contextKey,
    choices: choicesLv4
  });

  // DEX increased by 2: 16 -> 18
  assert.equal(actor.system.abilities.dex.value, initialDex + 2);

  // State recorded
  const state = actor.flags.ak5e[SPECIALIST_PROGRESS_FLAG];
  assert.ok(state.asiLevels.includes(4));
  assert.equal(state.startingEquipmentGranted, true);

  // Re-running preview preserves starting equipment as already granted
  const secondPreview = await previewSpecialistProgression(actor, {
    ...choicesLv4,
    startingEquipment: { mode: "cash" }
  });
  // currency.cp should NOT be written again
  assert.equal(secondPreview.writes["system.currency.cp"], undefined);
});

test("ASI scheme validation: accepts +2 or +1/+1 and rejects invalid schemes", async () => {
  const actor = createSpecialistActor(4);

  // Valid +2 to DEX
  const planPlus2 = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "brawler",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" }, 2: { mode: "fixed" }, 3: { mode: "fixed" }, 4: { mode: "fixed" } },
    asi: { 4: { increases: [{ ability: "dex", amount: 2 }] } }
  });
  assert.equal(planPlus2.pending.includes("asi.4"), false);

  // Valid +1 STR and +1 CON
  const planDual = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "brawler",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" }, 2: { mode: "fixed" }, 3: { mode: "fixed" }, 4: { mode: "fixed" } },
    asi: { 4: { increases: [{ ability: "str", amount: 1 }, { ability: "con", amount: 1 }] } }
  });
  assert.equal(planDual.pending.includes("asi.4"), false);

  // Invalid: +1 and +1 to same ability
  const planDupAbility = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "brawler",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" }, 2: { mode: "fixed" }, 3: { mode: "fixed" }, 4: { mode: "fixed" } },
    asi: { 4: { increases: [{ ability: "dex", amount: 1 }, { ability: "dex", amount: 1 }] } }
  });
  assert.equal(planDupAbility.pending.includes("asi.4"), true);

  // Invalid: +3 amount
  const planPlus3 = await previewSpecialistProgression(actor, {
    branch: "subclass-specialist-executor",
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "brawler",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" }, 2: { mode: "fixed" }, 3: { mode: "fixed" }, 4: { mode: "fixed" } },
    asi: { 4: { increases: [{ ability: "dex", amount: 3 }] } }
  });
  assert.equal(planPlus3.pending.includes("asi.4"), true);
});
