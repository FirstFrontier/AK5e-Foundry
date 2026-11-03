import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectMedicFields,
  previewMedicProgression,
  applyMedicProgression,
  MEDIC_PROGRESS_FLAG,
  ASI_LEVELS
} from "../scripts/medic-progression.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createMedicActor({ level = 1, branch = null } = {}) {
  const actor = createTestActor({
    name: "Doctor Kal",
    class: "class-medic",
    branch: branch ? `subclass-medic-${branch}` : undefined,
    level,
    abilities: {
      str: { value: 10, mod: 0 },
      dex: { value: 12, mod: 1 },
      con: { value: 14, mod: 2 },
      int: { value: 16, mod: 3 },
      wis: { value: 14, mod: 2 },
      cha: { value: 8, mod: -1 }
    }
  });
  actor.system.attributes.hp = { value: 8, max: 8 };
  return actor;
}

test("inspectMedicFields returns chassis choices and fields", () => {
  const actor = createMedicActor({ level: 4 });
  const fieldsData = inspectMedicFields(actor);

  assert.equal(fieldsData.level, 4);
  const keys = fieldsData.fields.map(f => f.key);
  assert.ok(keys.includes("branch"));
  assert.ok(keys.includes("spellcastingAbility"));
  assert.ok(keys.includes("saves"));
  assert.ok(keys.includes("skills"));
  assert.ok(keys.includes("tool"));
  assert.ok(keys.includes("startingEquipment.mode"));
  assert.ok(keys.includes("hp.1"));
  assert.ok(keys.includes("hp.4"));
  assert.ok(keys.includes("asi.4"));
});

test("previewMedicProgression generates correct chassis and proficiencies", async () => {
  const actor = createMedicActor({ level: 1 });
  const choices = {
    branch: "subclass-medic-physician",
    spellcastingAbility: "int",
    saves: ["con", "int"],
    skills: ["arc", "ins"],
    tool: "Medical Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  };

  const preview = await previewMedicProgression(actor, choices);
  assert.equal(preview.level, 1);
  assert.equal(preview.branch, "subclass-medic-physician");

  // Armour proficiency is strictly Light Shields only (Ch. 3 L4588)
  assert.deepEqual(preview.writes["system.traits.armorProf.value"], ["shl"]);

  // Weapons
  assert.ok(preview.writes["system.traits.weaponProf.custom"].includes("Light Melee Weapons"));

  // Saves
  assert.deepEqual(preview.writes["system.traits.saves.value"].sort(), ["con", "int"]);

  // Skills: Medicine expertise (value = 2) + chosen skills (value = 1)
  assert.equal(preview.writes["system.skills.med.value"], 2);
  assert.equal(preview.writes["system.skills.arc.value"], 1);
  assert.equal(preview.writes["system.skills.ins.value"], 1);

  // Cash option: 1300 LMD (1300 cp)
  assert.equal(preview.writes["system.currency.cp"], 1300);

  // Items to create: subclass item
  assert.ok(preview.createItems.some(i => i.flags?.ak5e?.chapterThreeId === "subclass-medic-physician"));
});

test("applyMedicProgression applies changes idempotently without duplicate writes", async () => {
  clearPoolRegistry();
  const actor = createMedicActor({ level: 4 });
  const choices = {
    branch: "subclass-medic-triage",
    spellcastingAbility: "wis",
    saves: ["con", "wis"],
    skills: ["prc", "per"],
    startingEquipment: { mode: "cash" },
    hp: {
      1: { mode: "fixed", roll: 6 },
      2: { mode: "fixed", roll: 4 },
      3: { mode: "fixed", roll: 4 },
      4: { mode: "fixed", roll: 4 }
    },
    asi: {
      4: { increases: [{ ability: "wis", amount: 2 }] }
    }
  };

  const preview1 = await previewMedicProgression(actor, choices);
  const result1 = await applyMedicProgression(actor, {
    confirmed: true,
    contextKey: preview1.contextKey,
    choices
  });

  assert.equal(actor.system.abilities.wis.value, 16); // 14 + 2
  assert.equal(actor.system.skills.med.value, 2);
  assert.deepEqual(actor.system.traits.armorProf.value, ["shl"]);
  assert.equal(actor.flags.ak5e.medic.enabled, true);
  assert.equal(actor.flags.ak5e.medic.spellcastingAbility, "wis");

  // Re-previewing after application: items are already attached, hpLevels recorded
  const preview2 = await previewMedicProgression(actor, choices);
  // Re-running apply with preview2 contextKey
  const result2 = await applyMedicProgression(actor, {
    confirmed: true,
    contextKey: preview2.contextKey,
    choices
  });

  assert.equal(result2.created.length, 0, "No duplicate items created on re-application");
});
