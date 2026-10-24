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

  // Branch item attached
  const branchItem = Array.from(actor.items.values()).find(i => i.type === "subclass");
  assert.ok(branchItem);

  const hpBefore = actor.system.attributes.hp.max;

  // Running progression again with existing mode is idempotent: no double HP!
  const secondChoices = vanguardChoices(actor);
  const previewSecond = await previewVanguardProgression(actor, secondChoices);
  assert.equal(previewSecond.pending.length, 0);

  await applyVanguardProgression(actor, {
    confirmed: true,
    contextKey: previewSecond.contextKey,
    choices: secondChoices
  });

  assert.equal(actor.system.attributes.hp.max, hpBefore, "HP not double counted");
});

test("applyVanguardProgression: level-up to 4 applies ASI and talents without resetting customizations", async () => {
  const actor = createVanguardActor(4);
  const choices = {
    branch: "subclass-vanguard-standard-bearer",
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

  // Talent item created
  const talentItem = Array.from(actor.items.values()).find(i => i.name === "Alacrity");
  assert.ok(talentItem, "Alacrity talent item was created");
});
