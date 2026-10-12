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
  assert.equal(plan.creates.filter(item => item.flags?.ak5e?.chapterThreeId?.startsWith("subclass-feature-marksman-artilleryman-")).length, 3);
  assert.equal(plan.creates.some(item => item.flags?.ak5e?.chapterThreeId?.startsWith("class-feature-marksman-artilleryman-")), false);
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
    tool: "Mechanism Kit",
    hp: { 1: { mode: "existing" }, 2: 6, 3: 5 }
  });

  // Level 1: 8 + 2 = 10
  // Level 2: 6 + 2 = 8
  // Level 3: 5 + 2 = 7
  // Total HP = 10 + 8 + 7 = 25
  assert.equal(preview.totalHpGain, 15);
  assert.equal(preview.actorUpdates["system.attributes.hp.max"], 25);
  assert.equal(preview.actorUpdates["system.abilities.dex.proficient"], 1);
  assert.equal(preview.actorUpdates["system.abilities.wis.proficient"], 1);
  assert.equal(preview.actorUpdates["system.tools.ak5emechanismkit"].value, 1);
  assert.match(preview.manualInstructions.join(" "), /Module Effect/);
});

test("setup repairs only the exact legacy Artilleryman placeholders and preserves edited copies", async () => {
  const oldId = ARTILLERYMAN_BRANCH_FEATURES[0].id.replace("subclass-feature-marksman-artilleryman-", "class-feature-marksman-artilleryman-");
  const actor = {
    uuid: "Actor.progression4", isOwner: true,
    items: [
      { type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", name: "Artilleryman", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } },
      { id: "stable-placeholder", name: ARTILLERYMAN_BRANCH_FEATURES[0].name, system: { description: { value: `<p>AK5e Marksman Feature: ${ARTILLERYMAN_BRANCH_FEATURES[0].name}</p>` } }, flags: { ak5e: { chapterThreeId: oldId } } },
      { id: "stable-authored", name: ARTILLERYMAN_BRANCH_FEATURES[1].name, system: { description: { value: "Authored note retained." } }, flags: { ak5e: { chapterThreeId: ARTILLERYMAN_BRANCH_FEATURES[1].id.replace("subclass-feature-marksman-artilleryman-", "class-feature-marksman-artilleryman-") } } }
    ],
    async update() {},
    async updateEmbeddedDocuments(type, updates) { this.updates = updates; }
  };
  const plan = await previewMarksmanSetup(actor);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0]._id, "stable-placeholder");
  assert.equal(plan.updates[0]["flags.ak5e.chapterThreeId"], ARTILLERYMAN_BRANCH_FEATURES[0].id);
  assert.equal(plan.warnings.length, 1);
  await applyMarksmanSetup(actor, { confirmed: true, contextKey: plan.contextKey });
  assert.equal(actor.updates[0]._id, "stable-placeholder");
  assert.equal(actor.updates[0]["system.description.value"].includes("AK5e Marksman Feature:"), false);
});

function actorAtLevel(level, branch = null) {
  const actor = {
    uuid: `Actor.level${level}.${branch ?? "core"}`, isOwner: true,
    system: {
      attributes: { hp: { max: 100 } },
      abilities: { str: { value: 12 }, dex: { value: 14, proficient: 1 }, con: { value: 14, mod: 2 }, wis: { value: 10 }, cha: { value: 10 }, int: { value: 10 } },
      skills: {}, tools: {}, traits: { armorProf: { value: [] }, weaponProf: { custom: "Authored Weapon Note" } }
    },
    items: [{ type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-marksman" } }, ...(branch ? {} : {}) }],
    flags: { ak5e: {} },
    async update(updates) {
      for (const [path, value] of Object.entries(updates)) {
        const parts = path.split("."); let node = this;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        node[parts.at(-1)] = structuredClone(value);
      }
    }
  };
  if (branch) actor.items.push({ type: "subclass", name: "Artilleryman", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } });
  return actor;
}

test("HP and ASI progression is incremental, tracks existing choices, and is idempotent", async () => {
  const actor = actorAtLevel(4);
  const choices = { skills: ["acr", "prc", "ste"], save: "wis", tool: "Mechanism Kit", hp: { 1: { mode: "existing" } }, asi: { 4: { str: 2 } } };
  let plan = await previewMarksmanProgression(actor, choices);
  assert.equal(plan.actorUpdates["system.attributes.hp.max"], undefined);
  await applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: plan.contextKey });
  assert.equal(actor.system.attributes.hp.max, 100);
  assert.equal(actor.system.abilities.str.value, 14);

  plan = await previewMarksmanProgression(actor, choices);
  assert.equal(plan.actorUpdates["system.abilities.str.value"], undefined);
  assert.equal(plan.actorUpdates["system.attributes.hp.max"], undefined);
  await applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: plan.contextKey });
  assert.equal(actor.system.attributes.hp.max, 100);
  assert.equal(actor.system.abilities.str.value, 14);
});

test("version-1 progression choices are recognized as already applied during migration", async () => {
  const actor = actorAtLevel(4);
  actor.system.abilities.str.value = 14;
  actor.flags.ak5e.marksmanProgression = { version: 1, choices: { asi: { 4: { str: 2 } } }, asiLevels: [], hpLevels: [1, 2, 3, 4] };
  const plan = await previewMarksmanProgression(actor);
  assert.equal(plan.actorUpdates["system.abilities.str.value"], undefined);
  assert.equal(plan.actorUpdates["system.attributes.hp.max"], undefined);
  await applyMarksmanProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey });
  assert.equal(actor.system.abilities.str.value, 14);
  assert.deepEqual(actor.flags.ak5e.marksmanProgression.asiLevels, [4]);
});

test("progression binds full choices, warns on table overrides, and rejects malformed choices", async () => {
  const actor = actorAtLevel(4);
  const choices = { skills: ["acr", "prc", "ste"], save: "wis", tool: "Mechanism Kit", asi: { 4: { str: 3 } } };
  const plan = await previewMarksmanProgression(actor, choices);
  assert.ok(plan.warnings.some(w => w.includes("printed budget is 2")));
  await assert.rejects(applyMarksmanProgression(actor, {
    confirmed: true, choices: { ...choices, asi: { 4: { str: 2 } } }, contextKey: plan.contextKey
  }), /changed since the preview/);
  await assert.rejects(previewMarksmanProgression(actor, { ...choices, asi: { 4: { banana: 2 } } }), /Invalid Ability Score Improvement/);

  const artillery = actorAtLevel(1, "artilleryman");
  const launcherPlan = await previewMarksmanProgression(artillery, { skills: ["acr", "prc", "ste"], save: "cha", tool: "Art Kit" });
  assert.match(launcherPlan.actorUpdates["system.traits.weaponProf.custom"], /Grenade Launcher/);
  assert.match(launcherPlan.actorUpdates["system.traits.weaponProf.custom"], /Rocket Launcher/);
  assert.match(launcherPlan.actorUpdates["system.traits.weaponProf.custom"], /Authored Weapon Note/);
  assert.ok(launcherPlan.manualInstructions.some(line => line.includes("does not grant both launchers as inventory")));
});

