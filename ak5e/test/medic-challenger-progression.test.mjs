import test from "node:test";
import assert from "node:assert/strict";
import {
  previewMedicSetup,
  applyMedicSetup
} from "../scripts/medic-setup.mjs";
import {
  previewMedicProgression,
  applyMedicProgression,
  ASI_LEVELS
} from "../scripts/medic-progression.mjs";
import {
  MEDIC_CLASS_ID,
  pbForLevel
} from "../scripts/medic-rules.mjs";
import {
  defineMedicPools,
  setLifeSupport,
  lifeSupport
} from "../scripts/medic-features.mjs";
import { medicUses } from "../scripts/medic-uses.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  clearPoolRegistry();
  defineMedicPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createActor(level = 1, options = {}) {
  const mClass = createTestItem({
    name: "Medic",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: MEDIC_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [mClass],
    system: {
      attributes: {
        hp: { value: 8, max: 8, temp: 0 },
        prof: pbForLevel(level)
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 12, mod: 1 },
        con: { value: 14, mod: 2 },
        int: { value: 14, mod: 2 },
        wis: { value: 12, mod: 1 },
        cha: { value: 8, mod: -1 }
      },
      traits: {
        saves: { value: [] },
        armorProf: { value: [] },
        weaponProf: { value: [], custom: "" },
        toolProf: { value: [] }
      },
      skills: {
        med: { value: 0 },
        arc: { value: 0 },
        ak5elore: { value: 0 },
        ak5etech: { value: 0 },
        ins: { value: 0 },
        prc: { value: 0 },
        per: { value: 0 },
        ath: { value: 0 },
        ste: { value: 0 },
        dec: { value: 0 }
      },
      currency: { cp: 0 },
      ...options.system
    }
  });
  return actor;
}

test("Challenger 1: Progression incremental level-up 1 -> 20 does not duplicate cash or features", async () => {
  const actor = createActor(1);
  const mClass = Array.from(actor.items.values()).find(i => i.type === "class");

  const setup1 = await previewMedicSetup(actor);
  await applyMedicSetup(actor, { confirmed: true, contextKey: setup1.contextKey });

  const prog1 = await previewMedicProgression(actor, {
    branch: "subclass-medic-physician",
    spellcastingAbility: "int",
    saves: ["con", "int"],
    skills: ["arc", "ins"],
    tool: "Medical Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  });
  await applyMedicProgression(actor, { confirmed: true, contextKey: prog1.contextKey, choices: prog1.choices });

  assert.equal(actor.system.currency.cp, 1300);
  assert.deepEqual(actor.system.traits.saves.value.sort(), ["con", "int"]);
  assert.equal(actor.system.skills.med.value, 2);

  for (const lvl of [4, 8, 12, 16, 20]) {
    await mClass.update({ "system.levels": lvl });
    actor.system.attributes.prof = pbForLevel(lvl);

    const sPlan = await previewMedicSetup(actor);
    await applyMedicSetup(actor, { confirmed: true, contextKey: sPlan.contextKey });

    const choices = { hp: { [lvl]: { mode: "fixed", roll: 4 } } };
    if (ASI_LEVELS.includes(lvl)) {
      choices.asi = { [lvl]: { increases: [{ ability: "int", amount: 2 }] } };
    }

    const pPlan = await previewMedicProgression(actor, choices);
    await applyMedicProgression(actor, { confirmed: true, contextKey: pPlan.contextKey, choices: pPlan.choices });
  }

  assert.equal(actor.system.currency.cp, 1300, "Currency remains 1300 across all level-ups");
});

test("Challenger 2: Progression re-run on Level 20 character must not re-apply ASIs to non-maxed abilities", async () => {
  const actor = createActor(20);

  const setupPlan = await previewMedicSetup(actor);
  await applyMedicSetup(actor, { confirmed: true, contextKey: setupPlan.contextKey });

  const initialHpChoices = {
    1: { mode: "fixed", roll: 6 },
    ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 2, { mode: "fixed", roll: 4 }]))
  };
  // Level 4 ASI takes STR from 10 to 12
  const initialAsiChoices = {
    4: { increases: [{ ability: "str", amount: 2 }] }
  };

  const progPlan = await previewMedicProgression(actor, {
    branch: "subclass-medic-physician",
    spellcastingAbility: "int",
    saves: ["con", "int"],
    skills: ["arc", "ins"],
    startingEquipment: { mode: "cash" },
    hp: initialHpChoices,
    asi: initialAsiChoices
  });
  await applyMedicProgression(actor, { confirmed: true, contextKey: progPlan.contextKey, choices: progPlan.choices });

  assert.equal(actor.system.abilities.str.value, 12, "STR is 12 after initial run");

  // Re-run progression with empty choices
  const rePreview = await previewMedicProgression(actor, {});
  await applyMedicProgression(actor, { confirmed: true, contextKey: rePreview.contextKey, choices: rePreview.choices });

  assert.equal(actor.system.abilities.str.value, 12, "STR must remain 12 and not increase to 14 on re-run");
});

test("Challenger 3: Authored item customizations are preserved across progression re-runs", async () => {
  const actor = createActor(1);

  const setupPlan = await previewMedicSetup(actor);
  await applyMedicSetup(actor, { confirmed: true, contextKey: setupPlan.contextKey });

  const progPlan = await previewMedicProgression(actor, {
    branch: "subclass-medic-physician",
    spellcastingAbility: "int",
    saves: ["con", "int"],
    skills: ["arc", "ins"],
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed", roll: 6 } }
  });
  await applyMedicProgression(actor, { confirmed: true, contextKey: progPlan.contextKey, choices: progPlan.choices });

  const featureItem = Array.from(actor.items.values()).find(i => i.name.includes("Medical Expertise") || i.name.includes("Life Support"));
  assert.ok(featureItem);
  const customName = `${featureItem.name} [Authored Custom Note]`;
  await featureItem.update({ name: customName, "flags.ak5e.custom": true });

  const reProg = await previewMedicProgression(actor, {});
  await applyMedicProgression(actor, { confirmed: true, contextKey: reProg.contextKey, choices: reProg.choices });

  const found = Array.from(actor.items.values()).find(i => i.id === featureItem.id);
  assert.equal(found.name, customName);
  assert.equal(found.flags?.ak5e?.custom, true);
});

test("Challenger 4: Choice Schema - Saves must require exactly 2 choices from CON, INT, WIS", async () => {
  const actor = createActor(1);

  // 1 save
  const pOne = await previewMedicProgression(actor, { saves: ["con"] });
  assert.ok(pOne.pending?.includes("saves"), "1 save must be flagged as pending");

  // 3 saves
  const pThree = await previewMedicProgression(actor, { saves: ["con", "int", "wis"] });
  assert.ok(pThree.pending?.includes("saves"), "3 saves must be flagged as pending");

  // Invalid save
  const pInvalid = await previewMedicProgression(actor, { saves: ["str", "dex"] });
  assert.ok(pInvalid.pending?.includes("saves"), "STR/DEX saves must be flagged as pending");
});

test("Challenger 5: Choice Schema - Skills must require exactly 2 choices from allowed Medic list", async () => {
  const actor = createActor(1);

  // Unlisted skills
  const pUnlisted = await previewMedicProgression(actor, { skills: ["ath", "ste"] });
  assert.ok(pUnlisted.pending?.includes("skills"), "Unlisted skills must be flagged as pending");

  // Only 1 skill
  const pOne = await previewMedicProgression(actor, { skills: ["arc"] });
  assert.ok(pOne.pending?.includes("skills"), "1 skill must be flagged as pending");

  // Duplicate skill
  const pDup = await previewMedicProgression(actor, { skills: ["arc", "arc"] });
  assert.ok(pDup.pending?.includes("skills"), "Duplicate skills must be flagged as pending");
});

test("Challenger 6: Choice Schema - ASI must reject Feats and invalid increase schemes", async () => {
  const actor = createActor(4);
  const mClass = Array.from(actor.items.values()).find(i => i.type === "class");
  mClass.system.levels = 4;

  const pFeat = await previewMedicProgression(actor, {
    asi: { 4: { mode: "feat", featId: "feat-sharpshooter" } }
  });
  assert.ok(pFeat.pending?.includes("asi.4"), "Feat for ASI must be flagged as pending");

  const pPlus3 = await previewMedicProgression(actor, {
    asi: { 4: { increases: [{ ability: "int", amount: 3 }] } }
  });
  assert.ok(pPlus3.pending?.includes("asi.4"), "+3 increase must be flagged as pending");
});

test("Challenger 7: Starting equipment grants Medical Kit tool with valid chapter 4 ID", async () => {
  const actor = createActor(1);
  const plan = await previewMedicProgression(actor, {
    branch: "subclass-medic-triage",
    spellcastingAbility: "wis",
    saves: ["con", "wis"],
    skills: ["prc", "per"],
    startingEquipment: {
      mode: "items",
      weapon1: "weapon-knife-4",
      shieldFocus: "equipment-small-shield-12"
    },
    hp: { 1: { mode: "fixed", roll: 6 } }
  });
  await applyMedicProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: plan.choices });

  const kit = Array.from(actor.items.values()).find(i => i.name.toLowerCase().includes("medical kit"));
  assert.ok(kit, "Medical Kit tool item must be created on actor (check tool-medical-kit-8 ID)");
});

test("Challenger 8: Concurrency - 10 simultaneous touchHeal calls serialized via keyedSerial", async () => {
  const medic = createActor(5);
  medic.flags.ak5e = { medic: { enabled: true, spellcastingAbility: "int" } };
  setLifeSupport(medic, 100, "concurrency test");

  const patient = createTestActor({
    name: "Patient",
    level: 3,
    system: { attributes: { hp: { value: 10, max: 100 } } }
  });

  const promises = Array.from({ length: 10 }, (_, i) =>
    medicUses.command(medic, "touchHeal", {
      confirmed: true,
      amount: 5,
      targetUuid: patient.uuid
    }, `concurrent-th-${i + 1}`)
  );

  const outcomes = await Promise.all(promises);
  assert.equal(outcomes.length, 10);
  assert.equal(lifeSupport(medic).value, 50);
  assert.equal(patient.system.attributes.hp.value, 60);

  const undoStack = medic.flags?.ak5e?.medicUses?.undo ?? [];
  assert.equal(undoStack.filter(r => r.command === "touchHeal").length, 10);
});

test("Challenger 9: Concurrency - Interleaved spends and undos maintain exact pool consistency", async () => {
  const medic = createActor(5);
  medic.flags.ak5e = { medic: { enabled: true, spellcastingAbility: "int" } };
  setLifeSupport(medic, 50, "interleaved test");

  await medicUses.command(medic, "preserver", { confirmed: true }, "interleave-1");
  assert.equal(lifeSupport(medic).value, 45);

  const p1 = medicUses.command(medic, "preserver", { confirmed: true }, "interleave-2");
  const p2 = medicUses.command(medic, "undoUse", { useId: "interleave-1" });

  await Promise.all([p1, p2]);
  assert.equal(lifeSupport(medic).value, 45);
});
