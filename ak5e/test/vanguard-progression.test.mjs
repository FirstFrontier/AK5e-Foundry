import test from "node:test";
import assert from "node:assert/strict";
import {
  previewVanguardSetup, applyVanguardSetup, VANGUARD_CORE_FEATURES
} from "../scripts/vanguard-setup.mjs";
import {
  inspectVanguardFields, vanguardChoices, previewVanguardProgression, applyVanguardProgression,
  VANGUARD_PROGRESS_FLAG
} from "../scripts/vanguard-progression.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createVanguardActor(level = 1, options = {}) {
  const vClass = createTestItem({
    name: "Vanguard",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [vClass],
    system: {
      attributes: {
        hp: { value: 10, max: 10, temp: 0 },
        prof: Math.floor((level - 1) / 4) + 2
      },
      abilities: {
        str: { value: 12, mod: 1 },
        dex: { value: 16, mod: 3 },
        con: { value: 14, mod: 2 },
        int: { value: 10, mod: 0 },
        wis: { value: 10, mod: 0 },
        cha: { value: 12, mod: 1 }
      },
      traits: {
        saves: { value: [] },
        armorProf: { value: [] },
        weaponProf: { value: [] },
        toolProf: { value: [] }
      },
      skills: {
        acr: { value: 0 },
        ath: { value: 0 },
        prc: { value: 0 },
        per: { value: 0 },
        ste: { value: 0 },
        ak5ewilderness: { value: 0 }
      },
      currency: { cp: 0 },
      ...options.system
    }
  });
  return actor;
}

test("previewVanguardSetup: generates feature items up to actor level and deterministic contextKey", async () => {
  const actor = createVanguardActor(1);
  const preview = await previewVanguardSetup(actor);

  assert.equal(preview.level, 1);
  // At level 1: Vanguard Branch, Landstrider, Tip of the Spear
  assert.equal(preview.creates.length, 3);
  assert.equal(preview.kept.length, 0);
  assert.ok(preview.contextKey.length > 0);

  // Deterministic contextKey: same actor and level yields identical hash
  const preview2 = await previewVanguardSetup(actor);
  assert.equal(preview.contextKey, preview2.contextKey);

  // Higher level actor gets more features
  const actorLv5 = createVanguardActor(5);
  const previewLv5 = await previewVanguardSetup(actorLv5);
  // Features at levels 1, 2, 3 (x2), 4, 5
  assert.equal(previewLv5.level, 5);
  assert.ok(previewLv5.creates.length >= 6);
});

test("applyVanguardSetup: idempotent application preserving existing features", async () => {
  const actor = createVanguardActor(3);
  const preview = await previewVanguardSetup(actor);

  // Unconfirmed setup throws
  await assert.rejects(() => applyVanguardSetup(actor, { confirmed: false, contextKey: preview.contextKey }));

  // Mismatched contextKey throws
  await assert.rejects(() => applyVanguardSetup(actor, { confirmed: true, contextKey: "wrong-key" }));

  // Apply setup
  const result = await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.equal(result.level, 3);
  assert.ok(result.created.length > 0);
  assert.equal(actor.flags.ak5e.vanguard.enabled, true);

  const initialItemCount = actor.items.size;

  // Running setup a second time is idempotent: 0 creates, all kept!
  const previewAgain = await previewVanguardSetup(actor);
  assert.equal(previewAgain.creates.length, 0);
  assert.equal(previewAgain.kept.length, result.created.length);

  const resultAgain = await applyVanguardSetup(actor, { confirmed: true, contextKey: previewAgain.contextKey });
  assert.equal(resultAgain.created.length, 0);
  assert.equal(actor.items.size, initialItemCount, "No duplicate items created");
});

test("setup migrates a same-name authored effect without replacing it", async () => {
  const vClass = createTestItem({ name: "Vanguard", type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } } });
  const landstrider = createTestItem({ name: "Landstrider", type: "feat", flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-landstrider-2798" } },
    effects: [{ name: "Landstrider: Walking Speed +10 ft", transfer: false, changes: [{ key: "system.attributes.movement.walk", value: 1, mode: 2 }] }] });
  const actor = createTestActor({ items: [vClass, landstrider] });
  const ownedLandstrider = actor.items.get(landstrider.id);
  const authoredEffect = [...ownedLandstrider.effects.values()][0];
  const preview = await previewVanguardSetup(actor);
  assert.equal(preview.effectUpdates.length, 1);
  await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.equal(ownedLandstrider.effects.size, 2);
  assert.equal(authoredEffect.name, "Landstrider: Walking Speed +10 ft");
  assert.ok([...ownedLandstrider.effects.values()].some(effect => effect.flags.ak5e.vanguardManagedEffect === "landstrider-speed"));
});

test("setup removes only the obsolete managed Quick off the Mark transfer effect", async () => {
  const vClass = createTestItem({ name: "Vanguard", type: "class", system: { levels: 3 }, flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } } });
  const quick = createTestItem({ name: "3rd Level: Quick off the Mark", type: "feat", flags: { ak5e: { chapterThreeId: "class-feature-vanguard-3rd-level-quick-off-the-mark-4553" } },
    effects: [
      { name: "Quick off the Mark: Initiative +PB", transfer: true, flags: { ak5e: { vanguardManagedEffect: "quick-off-mark-initiative" } }, changes: [{ key: "system.attributes.init.bonus", value: "@prof", mode: 2 }] },
      { name: "Authored Initiative Note", transfer: false, changes: [] }
    ] });
  const actor = createTestActor({ items: [vClass, quick] });
  const owned = actor.items.get(quick.id);
  const before = [...owned.effects.values()];
  const preview = await previewVanguardSetup(actor);
  assert.equal(preview.effectDeletes.length, 1);
  await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.equal(owned.effects.size, 1);
  assert.ok(owned.effects.has(before.find(effect => effect.name === "Authored Initiative Note").id));
  assert.equal([...owned.effects.values()][0].name, "Authored Initiative Note");
});

test("inspectVanguardFields: returns schema options for branch, saves, skills, equipment, and level choices", () => {
  const actor = createVanguardActor(4);
  const fields = inspectVanguardFields(actor);

  const fieldKeys = fields.map(f => f.key);
  assert.ok(fieldKeys.includes("branch"));
  assert.ok(fieldKeys.includes("saves"));
  assert.ok(fieldKeys.includes("skills"));
  assert.ok(fieldKeys.includes("tool"));
  assert.ok(fieldKeys.includes("startingEquipment.mode"));
  assert.ok(fieldKeys.includes("hp.1"));
  assert.ok(fieldKeys.includes("hp.4"));
  assert.ok(fieldKeys.includes("asi.4"));
  assert.ok(fieldKeys.includes("talents.basic"));

  // Check saves options: Strength and Charisma
  const savesField = fields.find(f => f.key === "saves");
  assert.deepEqual(savesField.options.map(o => o.value), ["str", "cha"]);

  // Check skills field requires 3 choices
  const skillsField = fields.find(f => f.key === "skills");
  assert.equal(skillsField.count, 3);
  assert.equal(skillsField.options.length, 6);
});

test("previewVanguardProgression: detects missing choices and computes preview", async () => {
  const actor = createVanguardActor(1);

  // Empty choices has pending requirements
  const emptyPlan = await previewVanguardProgression(actor, {});
  assert.ok(emptyPlan.pending.includes("branch"));
  assert.ok(emptyPlan.pending.includes("saves"));
  assert.ok(emptyPlan.pending.includes("skills"));
  assert.ok(emptyPlan.pending.includes("startingEquipment.mode"));

  // Complete choices
  const completeChoices = {
    branch: "subclass-vanguard-agent",
    martialDCAbility: "dex",
    saves: ["str"],
    skills: ["acr", "ath", "ste"],
    tool: "Messenger Kit",
    startingEquipment: {
      mode: "cash"
    },
    hp: {
      1: { mode: "fixed" }
    }
  };

  const validPlan = await previewVanguardProgression(actor, completeChoices);
  assert.equal(validPlan.pending.length, 0);
  assert.ok(validPlan.contextKey.length > 0);
  assert.ok(validPlan.writes["system.traits.saves.value"].includes("dex"));
  assert.ok(validPlan.writes["system.traits.saves.value"].includes("str"));
  assert.equal(validPlan.writes["system.skills.acr.value"], 1);
  assert.equal(validPlan.writes["system.skills.ath.value"], 1);
  assert.equal(validPlan.writes["system.skills.ste.value"], 1);
  assert.equal(validPlan.writes["system.currency.cp"], 1300); // 1300 LMD = 1300 CP
});

test("applyVanguardProgression: level 1 progression grant and idempotency", async () => {
  const actor = createVanguardActor(1);
  const choices = {
    branch: "subclass-vanguard-agent",
    martialDCAbility: "dex",
    saves: ["cha"],
    skills: ["acr", "prc", "ste"],
    tool: "Messenger Kit",
    startingEquipment: {
      mode: "cash"
    },
    hp: {
      1: { mode: "fixed" }
    }
  };

  const preview = await previewVanguardProgression(actor, choices);
  const result = await applyVanguardProgression(actor, {
    confirmed: true,
    contextKey: preview.contextKey,
    choices
  });

  assert.equal(result.success, true);
  // Verify saves updated
  assert.ok(actor.system.traits.saves.value.includes("dex"));
  assert.ok(actor.system.traits.saves.value.includes("cha"));
  // Verify skills updated
  assert.equal(actor.system.skills.acr.value, 1);
  assert.equal(actor.system.skills.prc.value, 1);
  assert.equal(actor.system.skills.ste.value, 1);
  // Verify currency granted
  assert.equal(actor.system.currency.cp, 1300);
  assert.equal(actor.system.tools.ak5emessengerkit.value, 1);

  // Branch item attached
  const branchItem = Array.from(actor.items.values()).find(i => i.type === "subclass");
  assert.ok(branchItem);

  const hpBefore = actor.system.attributes.hp.max;

  // Running progression again with existing mode is idempotent: no double HP!
  const previewSecond = await previewVanguardProgression(actor, choices);
  assert.equal(previewSecond.pending.length, 0);
  assert.equal(previewSecond.writes["system.attributes.hp.max"], undefined, "reusing the original explicit HP choice cannot grant it twice");

  await applyVanguardProgression(actor, {
    confirmed: true,
    contextKey: previewSecond.contextKey,
    choices: previewSecond.choices
  });

  assert.equal(actor.system.attributes.hp.max, hpBefore, "HP not double counted");
});

test("applyVanguardProgression: level-up to 4 applies ASI and talents without resetting customizations", async () => {
  const actor = createVanguardActor(4);
  const choices = {
    branch: "subclass-vanguard-standard-bearer",
    martialDCAbility: "dex",
    saves: ["str"],
    skills: ["ath", "per", "ak5ewilderness"],
    tool: "Messenger Kit",
    startingEquipment: { mode: "cash" },
    hp: {
      1: { mode: "fixed" },
      2: { mode: "fixed" },
      3: { mode: "fixed" },
      4: { mode: "fixed" }
    },
    asi: {
      4: { increases: [{ ability: "dex", amount: 2 }] }
    },
    talents: {
      basic: "class-option-vanguard-talent-basic-alacrity"
    }
  };

  const preview = await previewVanguardProgression(actor, choices);
  assert.equal(preview.pending.length, 0);

  const initialDex = actor.system.abilities.dex.value;
  await applyVanguardProgression(actor, {
    confirmed: true,
    contextKey: preview.contextKey,
    choices
  });

  // ASI applied: DEX increased by 2
  assert.equal(actor.system.abilities.dex.value, initialDex + 2);
  const level4MaxHp = actor.system.attributes.hp.max;
  const replayPreview = await previewVanguardProgression(actor, choices);
  assert.equal(replayPreview.writes["system.abilities.dex.value"], undefined, "reusing the original ASI cannot apply it twice");
  assert.equal(replayPreview.writes["system.attributes.hp.max"], undefined, "reusing original HP choices cannot apply them twice");
  await applyVanguardProgression(actor, { confirmed: true, contextKey: replayPreview.contextKey, choices: replayPreview.choices });
  assert.equal(actor.system.abilities.dex.value, initialDex + 2);
  assert.equal(actor.system.attributes.hp.max, level4MaxHp);

  // Talent item created
  const talentItem = Array.from(actor.items.values()).find(i => i.name === "Alacrity");
  assert.ok(talentItem, "Alacrity talent item was created");
});

test("source-category weapon proficiency only updates Light Melee AK5e weapons", async () => {
  const actor = createVanguardActor(1);
  const light = createTestItem({ name: "AK5e Light Weapon", type: "weapon", system: { proficient: 0 }, flags: { ak5e: { tableData: { category: "Light Melee Weapons" } } } }, actor);
  const unrelated = createTestItem({ name: "Third Party Weapon", type: "weapon", system: { proficient: 0 }, flags: { ak5e: { tableData: { category: "Simple Weapons" } } } }, actor);
  actor.items.set(light.id, light); actor.items.set(unrelated.id, unrelated);
  const preview = await previewVanguardProgression(actor, { branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"],
    skills: ["acr", "ath", "ste"], startingEquipment: { mode: "existing" } });
  assert.deepEqual(preview.updateItems.map(update => update._id), [light.id]);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: preview.contextKey,
    choices: { branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"], skills: ["acr", "ath", "ste"], startingEquipment: { mode: "existing" } } });
  assert.equal(light.system.proficient, 1);
  assert.equal(unrelated.system.proficient, 0);
});

test("invalid progression IDs and values stay pending", async () => {
  const actor = createVanguardActor(2);
  const plan = await previewVanguardProgression(actor, {
    branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"], skills: ["acr", "ath", "ste"],
    startingEquipment: { mode: "unsupported", weapon1: "not-a-source-item" },
    hp: { 1: { mode: "unknown" }, 2: { mode: "rolled", roll: 9 } }, talents: { basic: "not-a-talent" }, tool: "unknown kit"
  });
  for (const key of ["startingEquipment.mode", "hp.1", "hp.2", "tool", "talents.basic"]) assert.ok(plan.pending.includes(key), `${key} remains pending`);
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey,
    choices: { branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"], skills: ["acr", "ath", "ste"], startingEquipment: { mode: "unsupported" }, hp: { 1: { mode: "unknown" } }, tool: "unknown kit" } }));
});

test("each Talent unlock remains pending until chosen or reconciled", async () => {
  const actor = createVanguardActor(13);
  const plan = await previewVanguardProgression(actor, { branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"],
    skills: ["acr", "ath", "ste"], startingEquipment: { mode: "existing" }, tool: "Messenger Kit" });
  for (const key of ["talents.basic", "talents.basicModule", "talents.advanced", "talents.advancedModule"]) assert.ok(plan.pending.includes(key), `${key} is required at its unlock`);
  const level8 = createVanguardActor(8);
  const duplicate = "class-option-vanguard-talent-basic-alacrity";
  const sameTalentTwice = await previewVanguardProgression(level8, { branch: "subclass-vanguard-agent", martialDCAbility: "dex", saves: ["str"],
    skills: ["acr", "ath", "ste"], startingEquipment: { mode: "existing" }, tool: "Messenger Kit",
    talents: { basic: duplicate, basicModule: duplicate } });
  assert.ok(sameTalentTwice.pending.includes("talents.basicModule"), "the Module choice must be a different talent or an explicit upgrade");
});
