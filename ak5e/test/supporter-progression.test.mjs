import test from "node:test";
import assert from "node:assert/strict";
import {
  previewSupporterSetup, applySupporterSetup, SUPPORTER_CORE_FEATURES
} from "../scripts/supporter-setup.mjs";
import {
  inspectSupporterFields, supporterChoices, previewSupporterProgression, applySupporterProgression,
  SUPPORTER_PROGRESS_FLAG
} from "../scripts/supporter-progression.mjs";
import { SUPPORTER_CLASS_ID, SUPPORTER_SKILLS, SUPPORTER_SAVES } from "../scripts/supporter-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createSupporterActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: {
        hp: { value: 8, max: 8, temp: 0 },
        prof: Math.floor((level - 1) / 4) + 2
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 14, mod: 2 },
        con: { value: 14, mod: 2 },
        int: { value: 12, mod: 1 },
        wis: { value: 12, mod: 1 },
        cha: { value: 16, mod: 3 }
      },
      traits: {
        saves: { value: [] },
        armorProf: { value: [] },
        weaponProf: { value: [] },
        toolProf: { value: [] }
      },
      skills: {
        arc: { value: 0 },
        ak5elore: { value: 0 },
        ak5etech: { value: 0 },
        ins: { value: 0 },
        dec: { value: 0 },
        per: { value: 0 }
      },
      currency: { cp: 0 },
      ...options.system
    }
  });
  return actor;
}

test("previewSupporterSetup: generates feature items up to actor level and deterministic contextKey", async () => {
  const actor = createSupporterActor(1);
  const preview = await previewSupporterSetup(actor);

  assert.equal(preview.level, 1);
  // At level 1: Supporter Branch, Provide Aid
  assert.equal(preview.creates.length, 2);
  assert.equal(preview.kept.length, 0);
  assert.ok(preview.contextKey.length > 0);

  // Deterministic contextKey: same actor and level yields identical hash
  const preview2 = await previewSupporterSetup(actor);
  assert.equal(preview.contextKey, preview2.contextKey);

  // Higher level actor gets more features
  const actorLv5 = createSupporterActor(5);
  const previewLv5 = await previewSupporterSetup(actorLv5);
  // Features at levels 1 (x2), 2, 3, 4, 5 -> at least 6 features
  assert.equal(previewLv5.level, 5);
  assert.ok(previewLv5.creates.length >= 6);
});

test("applySupporterSetup: idempotent application preserving existing features", async () => {
  const actor = createSupporterActor(3);
  const preview = await previewSupporterSetup(actor);

  // Unconfirmed setup throws
  await assert.rejects(() => applySupporterSetup(actor, { confirmed: false, contextKey: preview.contextKey }));

  // Mismatched contextKey throws
  await assert.rejects(() => applySupporterSetup(actor, { confirmed: true, contextKey: "wrong-key" }));

  // Apply setup
  const result = await applySupporterSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.equal(result.level, 3);
  assert.ok(result.createdCount >= 4);

  // Re-running setup creates 0 new items and keeps all existing
  const secondPreview = await previewSupporterSetup(actor);
  assert.equal(secondPreview.creates.length, 0);
  assert.equal(secondPreview.kept.length, result.createdCount);

  const secondResult = await applySupporterSetup(actor, { confirmed: true, contextKey: secondPreview.contextKey });
  assert.equal(secondResult.createdCount, 0);
  assert.equal(secondResult.keptCount, result.createdCount);
});

test("inspectSupporterFields: returns schema options for branch, saves, skills, aidAbility, equipment, and level choices", () => {
  const actor = createSupporterActor(1);
  const fields = inspectSupporterFields(actor);

  const keys = fields.map(f => f.key);
  assert.ok(keys.includes("branch"));
  assert.ok(keys.includes("saves"));
  assert.ok(keys.includes("skills"));
  assert.ok(keys.includes("aidAbility"));
  assert.ok(keys.includes("tool"));
  assert.ok(keys.includes("startingEquipment.mode"));
  assert.ok(keys.includes("hp.1"));

  // Check saving throw choices (CON, CHA, WIS)
  const saveField = fields.find(f => f.key === "saves");
  assert.equal(saveField.count, 2);
  assert.deepEqual(saveField.options.map(o => o.value), ["con", "cha", "wis"]);

  // Check skill choices (6 options, count 3)
  const skillField = fields.find(f => f.key === "skills");
  assert.equal(skillField.count, 3);
  assert.equal(skillField.options.length, 6);
});

test("previewSupporterProgression: choice validation for saves, skills, and starting gear", async () => {
  const actor = createSupporterActor(1);

  // Missing all choices -> pending branch, saves, skills, equipment
  const planEmpty = await previewSupporterProgression(actor, {});
  assert.ok(planEmpty.pending.includes("branch"));
  assert.ok(planEmpty.pending.includes("saves"));
  assert.ok(planEmpty.pending.includes("skills"));
  assert.ok(planEmpty.pending.includes("startingEquipment.mode"));

  // Invalid saves (only 1 save chosen)
  const planOneSave = await previewSupporterProgression(actor, {
    saves: ["con"]
  });
  assert.ok(planOneSave.pending.includes("saves"));

  // Invalid saves (not from CON, CHA, WIS)
  const planBadSave = await previewSupporterProgression(actor, {
    saves: ["str", "dex"]
  });
  assert.ok(planBadSave.pending.includes("saves"));

  // Invalid skills (only 2 skills chosen)
  const planTwoSkills = await previewSupporterProgression(actor, {
    skills: ["arc", "ak5elore"]
  });
  assert.ok(planTwoSkills.pending.includes("skills"));

  // Invalid skills (duplicate skills)
  const planDupSkills = await previewSupporterProgression(actor, {
    skills: ["arc", "arc", "ins"]
  });
  assert.ok(planDupSkills.pending.includes("skills"));

  // Valid choices
  const validChoices = {
    branch: "subclass-supporter-artificer",
    saves: ["con", "cha"],
    skills: ["arc", "ins", "per"],
    aidAbility: "cha",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  };
  const planValid = await previewSupporterProgression(actor, validChoices);
  assert.equal(planValid.pending.length, 0);
  assert.ok(planValid.contextKey.length > 0);
  assert.equal(planValid.writes["system.currency.cp"], 1300);
});

test("applySupporterProgression: level 1 progression grant and idempotency", async () => {
  const actor = createSupporterActor(1);
  const choices = {
    branch: "subclass-supporter-artificer",
    saves: ["con", "wis"],
    skills: ["ak5etech", "ins", "dec"],
    aidAbility: "wis",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  };

  const preview = await previewSupporterProgression(actor, choices);
  assert.equal(preview.pending.length, 0);

  const applied = await applySupporterProgression(actor, {
    confirmed: true,
    contextKey: preview.contextKey,
    choices
  });
  assert.equal(applied.success, true);
  assert.equal(applied.level, 1);

  // Saves are granted
  assert.ok(actor.system.traits.saves.value.includes("con"));
  assert.ok(actor.system.traits.saves.value.includes("wis"));

  // Skills are trained
  assert.equal(actor.system.skills.ak5etech.value, 1);
  assert.equal(actor.system.skills.ins.value, 1);
  assert.equal(actor.system.skills.dec.value, 1);

  // Currency was granted
  assert.equal(actor.system.currency.cp, 1300);

  // aidAbility flag was stored
  assert.equal(actor.flags.ak5e.supporter.aidAbility, "wis");

  // Re-running progression should not duplicate starting currency
  const secondPreview = await previewSupporterProgression(actor, {});
  assert.equal(secondPreview.writes["system.currency.cp"], undefined);
});

test("applySupporterProgression: level-up to 4 applies ASI and talents without resetting customizations", async () => {
  const actor = createSupporterActor(1);
  // Initial level 1 progression
  const lv1Choices = {
    branch: "subclass-supporter-artificer",
    saves: ["con", "cha"],
    skills: ["arc", "ins", "per"],
    aidAbility: "cha",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  };
  const p1 = await previewSupporterProgression(actor, lv1Choices);
  await applySupporterProgression(actor, { confirmed: true, contextKey: p1.contextKey, choices: lv1Choices });

  // Level up actor to 4
  const sClass = actor.items.find(i => i.type === "class");
  sClass.system.levels = 4;

  const currentCha = actor.system.abilities.cha.value; // 16
  const currentMaxHp = actor.system.attributes.hp.max;

  const lv4Choices = {
    hp: {
      2: { mode: "fixed", roll: 4 },
      3: { mode: "fixed", roll: 4 },
      4: { mode: "fixed", roll: 4 }
    },
    asi: {
      4: {
        mode: "custom",
        increases: [{ ability: "cha", amount: 2 }]
      }
    },
    talents: {
      basic: "talent-supporter-basic-alchemical-insight-0"
    }
  };

  const p4 = await previewSupporterProgression(actor, lv4Choices);
  assert.equal(p4.pending.length, 0);

  const applied4 = await applySupporterProgression(actor, { confirmed: true, contextKey: p4.contextKey, choices: lv4Choices });
  assert.equal(applied4.success, true);
  assert.equal(applied4.level, 4);

  // CHA increased by +2 (16 -> 18)
  assert.equal(actor.system.abilities.cha.value, currentCha + 2);

  // HP increased by 3 levels of (4 + 2) = +18
  assert.equal(actor.system.attributes.hp.max, currentMaxHp + 18);

  // Saves and skills preserved
  assert.ok(actor.system.traits.saves.value.includes("con"));
  assert.ok(actor.system.traits.saves.value.includes("cha"));
  assert.equal(actor.system.skills.arc.value, 1);
});

test("previewSupporterProgression: deep choice validation for saves and skills permutations", async () => {
  const actor = createSupporterActor(1);

  // 3 saves -> pending
  const p1 = await previewSupporterProgression(actor, { saves: ["con", "cha", "wis"] });
  assert.ok(p1.pending.includes("saves"));

  // duplicate save -> pending
  const p2 = await previewSupporterProgression(actor, { saves: ["con", "con"] });
  assert.ok(p2.pending.includes("saves"));

  // valid permutation: cha and wis
  const p3 = await previewSupporterProgression(actor, {
    branch: "subclass-supporter-artificer",
    saves: ["cha", "wis"],
    skills: ["arc", "ins", "per"],
    startingEquipment: { mode: "cash" }
  });
  assert.ok(!p3.pending.includes("saves"));

  // 4 skills -> pending
  const p4 = await previewSupporterProgression(actor, { skills: ["arc", "ak5elore", "ak5etech", "ins"] });
  assert.ok(p4.pending.includes("skills"));

  // invalid skill key (stealth is not a supporter skill) -> pending
  const p5 = await previewSupporterProgression(actor, { skills: ["arc", "ins", "ste"] });
  assert.ok(p5.pending.includes("skills"));
});

test("applySupporterProgression: equipment mode items grants embedded items and sets startingEquipmentGranted", async () => {
  const actor = createSupporterActor(1);
  const choices = {
    branch: "subclass-supporter-artificer",
    saves: ["con", "wis"],
    skills: ["ak5etech", "ins", "dec"],
    aidAbility: "cha",
    startingEquipment: {
      mode: "items",
      weapon1: "weapon-knife-4",
      weapon2: "equipment-small-shield-12",
      tool1: "tool-art-kit-0",
      tool2: "tool-brewing-kit-1"
    },
    hp: { 1: { mode: "fixed", roll: 6 } }
  };

  const preview = await previewSupporterProgression(actor, choices);
  assert.equal(preview.pending.length, 0);

  const result = await applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
  assert.equal(result.success, true);
  assert.ok(actor.flags.ak5e[SUPPORTER_PROGRESS_FLAG].startingEquipmentGranted);
  // Embedded items were created (branch + 4 equipment items + protective clothing = 6 items)
  assert.ok(result.created.length >= 3);
});

test("previewSupporterProgression: ASI validation rejects duplicate ability and invalid schemes", async () => {
  const actor = createSupporterActor(4);
  const sClass = actor.items.find(i => i.type === "class");
  sClass.system.levels = 4;

  // Duplicate ability in +1/+1 scheme is rejected
  const pDup = await previewSupporterProgression(actor, {
    asi: {
      4: {
        mode: "custom",
        increases: [{ ability: "cha", amount: 1 }, { ability: "cha", amount: 1 }]
      }
    }
  });
  assert.ok(pDup.pending.includes("asi.4"));

  // Invalid ability name is rejected
  const pBad = await previewSupporterProgression(actor, {
    asi: {
      4: {
        mode: "custom",
        increases: [{ ability: "invalid", amount: 2 }]
      }
    }
  });
  assert.ok(pBad.pending.includes("asi.4"));
});
