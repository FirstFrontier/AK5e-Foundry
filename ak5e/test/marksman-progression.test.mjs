import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewMarksmanSetup, applyMarksmanSetup, MARKSMAN_CORE_FEATURES,
  ARTILLERYMAN_BRANCH_FEATURES, BESIEGER_BRANCH_FEATURES
} from "../scripts/marksman-setup.mjs";
import {
  inspectMarksmanFields, marksmanProgressionChoices, previewMarksmanProgression, applyMarksmanProgression
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

function completeChoices(level, overrides = {}) {
  const hp = Object.fromEntries(Array.from({ length: level }, (_, index) => [index + 1, { mode: "existing" }]));
  const asi = Object.fromEntries([4, 6, 8, 10, 12, 16, 19].filter(n => n <= level).map(n => [n, { mode: "existing" }]));
  return {
    skills: ["acr", "prc", "ste"], save: "wis", tool: "Maintenance Kit",
    fightingStyle: "class-feature-marksman-braced-for-action-4536",
    startingEquipment: { mode: "items", ranged: "weapon-bow-0", melee: "weapon-sword-6", armour: "equipment-protective-clothing-0", toolkit: "tool-maintenance-kit-5" },
    ...(level >= 3 ? { talents: { basic: "class-option-marksman-talent-basic-alert" } } : {}),
    ...overrides,
    hp: { ...hp, ...(overrides.hp ?? {}) }, asi: { ...asi, ...(overrides.asi ?? {}) },
    talents: { ...(level >= 3 ? { basic: "class-option-marksman-talent-basic-alert" } : {}), ...(overrides.talents ?? {}) }
  };
}

test("HP and ASI progression is incremental, tracks existing choices, and is idempotent", async () => {
  const actor = actorAtLevel(4);
  const choices = completeChoices(4, { tool: "Mechanism Kit", hp: { 1: { mode: "existing" } }, asi: { 4: { str: 2 } } });
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
  const choices = completeChoices(4, { asi: { 4: { str: 2 } } });
  const plan = await previewMarksmanProgression(actor, choices);
  assert.equal(plan.actorUpdates["system.abilities.str.value"], undefined);
  assert.equal(plan.actorUpdates["system.attributes.hp.max"], undefined);
  await applyMarksmanProgression(actor, { confirmed: true, choices: plan.choices, contextKey: plan.contextKey });
  assert.equal(actor.system.abilities.str.value, 14);
  assert.deepEqual(actor.flags.ak5e.marksmanProgression.asiLevels, [4]);
});

test("progression binds full choices, warns on table overrides, and rejects malformed choices", async () => {
  const actor = actorAtLevel(4);
  const choices = completeChoices(4, { asi: { 4: { str: 3 } } });
  const plan = await previewMarksmanProgression(actor, choices);
  assert.ok(plan.warnings.some(w => w.includes("printed budget is 2")));
  await assert.rejects(applyMarksmanProgression(actor, {
    confirmed: true, choices: { ...choices, asi: { 4: { str: 2 } } }, contextKey: plan.contextKey
  }), /changed since the preview/);
  await assert.rejects(previewMarksmanProgression(actor, { ...choices, asi: { 4: { banana: 2 } } }), /Invalid Ability Score Improvement/);

  const artillery = actorAtLevel(1, "artilleryman");
  const launcherPlan = await previewMarksmanProgression(artillery, completeChoices(1, { save: "cha", tool: "Art Kit" }));
  assert.match(launcherPlan.actorUpdates["system.traits.weaponProf.custom"], /Grenade Launcher/);
  assert.match(launcherPlan.actorUpdates["system.traits.weaponProf.custom"], /Rocket Launcher/);
  assert.match(launcherPlan.actorUpdates["system.traits.weaponProf.custom"], /Authored Weapon Note/);
  assert.ok(launcherPlan.manualInstructions.some(line => line.includes("does not grant both launchers as inventory")));
});

test("Marksman choice schema exposes source grants and all eight styles", () => {
  const actor = actorAtLevel(13);
  const view = marksmanProgressionChoices(actor, { talents: { basic: "class-option-marksman-talent-basic-alert", advanced: "class-option-marksman-talent-advanced-alpha-strike" } });
  assert.equal(view.applicable, true);
  assert.equal(view.fields.find(field => field.key === "fightingStyle").options.length, 8);
  assert.equal(view.fields.find(field => field.key === "fightingStyle").options.every(option => !String(option.effect).includes("<")), true);
  assert.ok(view.fields.some(field => field.key === "talents.basicAt8"));
  assert.ok(view.fields.some(field => field.key === "talents.advancedAt13"));
  assert.equal(view.fields.find(field => field.key === "startingEquipment.mode").options.some(option => option.value === "cash"), true);
});

test("progression grants source-ID style, talent/module and equipment Items idempotently", async () => {
  const actor = actorAtLevel(8);
  actor.system.currency = { cp: 17 };
  actor.createEmbeddedDocuments = async (_type, data) => {
    const created = data.map((item, index) => ({ ...structuredClone(item), id: `created-${actor.items.length + index}` }));
    actor.items.push(...created); return created;
  };
  actor.updateEmbeddedDocuments = async (_type, updates) => {
    for (const update of updates) {
      const item = actor.items.find(row => row.id === update._id);
      if (item) item.flags.ak5e.marksmanTalent = structuredClone(update["flags.ak5e.marksmanTalent"]);
    }
  };
  const talent = "class-option-marksman-talent-basic-alert";
  const choices = completeChoices(8, { talents: { basic: talent, basicAt8: { mode: "upgrade", sourceId: talent } } });
  const plan = await previewMarksmanProgression(actor, choices);
  assert.deepEqual(plan.pending, []);
  const retryPlan = await previewMarksmanProgression(actor, choices);
  await applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: retryPlan.contextKey });
  const granted = actor.items.filter(item => item.flags?.ak5e?.marksmanProgressionGrant);
  assert.equal(granted.length, 6); // Style, Basic Talent, four starting equipment Items.
  const talentItem = granted.find(item => item.flags.ak5e.chapterThreeId === talent);
  assert.equal(talentItem.flags.ak5e.marksmanTalent.moduleActive, true);
  const bow = granted.find(item => item.flags.ak5e.chapterFourId === "weapon-bow-0");
  assert.ok(bow);
  assert.equal(bow.flags.ak5e.chapterThreeId, undefined);
  const count = actor.items.length;
  const repeat = await previewMarksmanProgression(actor, choices);
  await applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: repeat.contextKey });
  assert.equal(actor.items.length, count);
  assert.equal(actor.items.filter(item => item.flags?.ak5e?.chapterThreeId === talent).length, 1);
});

test("cash choice is a one-time owner award and failed item creation can be retried", async () => {
  const actor = actorAtLevel(1);
  actor.system.currency = { cp: 9 };
  const choices = completeChoices(1, { startingEquipment: { mode: "cash" } });
  actor.itemsCreationFails = true;
  actor.createEmbeddedDocuments = async (_type, data) => {
    if (actor.itemsCreationFails) { actor.itemsCreationFails = false; return []; }
    const created = data.map(item => ({ ...structuredClone(item), id: `created-${actor.items.length}` })); actor.items.push(...created); return created;
  };
  const plan = await previewMarksmanProgression(actor, choices);
  await assert.rejects(applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: plan.contextKey }), /Could not add/);
  assert.equal(actor.system.currency.cp, 1309);
  const retry = await previewMarksmanProgression(actor, choices);
  await applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: retry.contextKey });
  assert.equal(actor.system.currency.cp, 1309);
  assert.equal(actor.items.filter(item => item.flags?.ak5e?.chapterThreeId === "class-feature-marksman-braced-for-action-4536").length, 1);
});

test("preview becomes stale when inventory changes and fixed HP must use the printed average", async () => {
  const actor = actorAtLevel(1);
  const choices = completeChoices(1, { hp: { 1: { mode: "fixed", roll: 8 } } });
  const plan = await previewMarksmanProgression(actor, choices);
  actor.items.push({ id: "new-item", name: "An authored item", type: "feat", system: { description: { value: "custom" } } });
  await assert.rejects(applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: plan.contextKey }), /changed since the preview/);
  const invalid = completeChoices(2, { hp: { 2: { mode: "fixed", roll: 6 } } });
  await assert.rejects(previewMarksmanProgression(actorAtLevel(2), invalid), /Invalid Marksman Hit Point gain/);
});

test("partial Item creation resumes from a fresh preview without duplicating completed grants", async () => {
  const actor = actorAtLevel(1);
  let calls = 0;
  actor.createEmbeddedDocuments = async (_type, data) => {
    calls++;
    if (calls === 2) return [];
    const created = data.map(item => ({ ...structuredClone(item), id: `grant-${actor.items.length}` }));
    actor.items.push(...created);
    return created;
  };
  const choices = completeChoices(1);
  const first = await previewMarksmanProgression(actor, choices);
  await assert.rejects(applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: first.contextKey }), /Could not add/);
  const alreadyCreated = actor.items.filter(item => item.flags?.ak5e?.marksmanProgressionGrant).length;
  assert.equal(alreadyCreated, 1);
  const retry = await previewMarksmanProgression(actor, choices);
  await applyMarksmanProgression(actor, { confirmed: true, choices, contextKey: retry.contextKey });
  const sourceIds = actor.items.map(item => item.flags?.ak5e?.chapterThreeId ?? item.flags?.ak5e?.chapterFourId).filter(Boolean);
  assert.equal(sourceIds.filter(id => id === "class-feature-marksman-braced-for-action-4536").length, 1);
  assert.equal(sourceIds.filter(id => id === "weapon-bow-0").length, 1);
  assert.equal(actor.items.filter(item => item.flags?.ak5e?.marksmanProgressionGrant).length, 5);
});

test("legacy style keys normalize to source IDs before selection and recorded-choice validation", async () => {
  const actor = actorAtLevel(1);
  actor.flags.ak5e.marksmanProgression = { version: 2, choices: { fightingStyle: "ranger" }, hpLevels: [1], asiLevels: [] };
  const view = marksmanProgressionChoices(actor);
  assert.equal(view.choices.fightingStyle, "class-feature-marksman-ranger-5331");
  const choices = completeChoices(1, { fightingStyle: "class-feature-marksman-ranger-5331" });
  const plan = await previewMarksmanProgression(actor, choices);
  assert.equal(plan.choices.fightingStyle, "class-feature-marksman-ranger-5331");
  assert.equal(plan.styleKey, "ranger");
});

test("an unrecorded starting Tool Kit proficiency is warned and can be reviewed", async () => {
  const actor = actorAtLevel(1);
  const choices = completeChoices(1, { tool: "Maintenance Kit", startingEquipment: {
    mode: "items", ranged: "weapon-bow-0", melee: "weapon-sword-6", armour: "equipment-protective-clothing-0", toolkit: "tool-art-kit-0"
  } });
  const plan = await previewMarksmanProgression(actor, choices);
  assert.ok(plan.warnings.some(message => message.includes("Art Kit") && message.includes("not recorded as proficient")));
});

