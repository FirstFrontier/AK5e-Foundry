import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewMarksmanSetup, applyMarksmanSetup, MARKSMAN_CORE_FEATURES,
  ARTILLERYMAN_BRANCH_FEATURES, BESIEGER_BRANCH_FEATURES
} from "../scripts/marksman-setup.mjs";
import {
  inspectMarksmanFields, previewMarksmanProgression, applyMarksmanProgression
} from "../scripts/marksman-progression.mjs";

test("previewMarksmanSetup identifies missing core and branch features", async () => {
  const actor = {
    uuid: "Actor.progression1",
    isOwner: true,
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Artilleryman",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }
    ],
    flags: {}
  };

  const plan = await previewMarksmanSetup(actor);
  assert.equal(plan.level, 4);
  assert.equal(plan.branch, "artilleryman");
  assert.equal(plan.kept.length, 0);

  // Core features at level <= 4:
  // 1st: Branch, Fighting Style, High Ground, Target Lock (4)
  // 2nd: Basic Operator Skill (1)
  // 3rd: Basic Talent (1)
  // 4th: ASI (1)
  // Total core = 7
  // Artilleryman at level <= 4:
  // 1st: Tools of the Trade, Delayed Detonation (2)
  // 4th: Secondary Detonation (1)
  // Total branch = 3
  // Total creates = 10
  assert.equal(plan.creates.length, 10);
});

test("applyMarksmanSetup idempotently grants features without duplicates", async () => {
  const actor = {
    uuid: "Actor.progression2",
    isOwner: true,
    items: [
      {
        type: "class",
        system: { levels: 1 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Besieger",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {},
    async update(updates) {
      Object.assign(this.flags, updates);
    }
  };

  const plan = await previewMarksmanSetup(actor);
  assert.equal(plan.level, 1);
  assert.equal(plan.branch, "besieger");

  const result = await applyMarksmanSetup(actor, { confirmed: true, contextKey: plan.contextKey });
  assert.equal(result.createdCount > 0, true);
  assert.equal(actor.flags["flags.ak5e.marksman.enabled"], true);

  // Second run: everything should be kept, 0 creates!
  const repeatPlan = await previewMarksmanSetup(actor);
  assert.equal(repeatPlan.creates.length, 0);
  assert.equal(repeatPlan.kept.length, plan.creates.length);
});

test("inspectMarksmanFields and previewMarksmanProgression calculate HP and proficiencies", async () => {
  const actor = {
    uuid: "Actor.progression3",
    isOwner: true,
    system: {
      attributes: { hp: { max: 10 } },
      abilities: { con: { mod: 2 } },
      skills: {},
      traits: { armorProf: {}, weaponProf: {} }
    },
    items: [
      {
        type: "class",
        system: { levels: 3 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      }
    ],
    flags: {}
  };

  const fields = inspectMarksmanFields(actor);
  assert.equal(fields.applicable, true);
  assert.equal(fields.level, 3);
  assert.equal(fields.skills.length, 6);
  assert.equal(fields.saves.length, 3);

  const preview = await previewMarksmanProgression(actor, {
    skills: ["acr", "prc", "ste"],
    save: "wis",
    hp: { 2: 6, 3: 5 }
  });

  // Level 1: 8 + 2 = 10
  // Level 2: 6 + 2 = 8
  // Level 3: 5 + 2 = 7
  // Total HP = 10 + 8 + 7 = 25
  assert.equal(preview.totalHpGain, 25);
  assert.equal(preview.actorUpdates["system.attributes.hp.max"], 25);
  assert.equal(preview.actorUpdates["system.abilities.dex.proficient"], 1);
  assert.equal(preview.actorUpdates["system.abilities.wis.proficient"], 1);
});

