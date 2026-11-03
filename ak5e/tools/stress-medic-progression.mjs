import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  previewMedicSetup,
  applyMedicSetup,
  MEDIC_CORE_FEATURES,
  PHYSICIAN_FEATURES,
  TRIAGE_FEATURES
} from "../scripts/medic-setup.mjs";
import {
  inspectMedicFields,
  medicChoices,
  previewMedicProgression,
  applyMedicProgression,
  MEDIC_PROGRESS_FLAG,
  ASI_LEVELS
} from "../scripts/medic-progression.mjs";
import {
  MEDIC_CLASS_ID,
  MEDIC_BRANCH_IDS,
  MEDIC_SKILLS,
  MEDIC_SKILL_CHOICES,
  MEDIC_SAVES,
  MEDIC_TOOL_CHOICES,
  pbForLevel,
  hitPointsAtLevel,
  medicProfile,
  medicEnabled
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
} from "../test/base-classes-fixture.mjs";

console.log("Starting Adversarial Stress Harness for Medic Progression, Schema Edge Cases & Concurrency...\n");

setupFoundryGlobals();

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

const results = [];

async function record(name, fn) {
  const start = performance.now();
  try {
    const res = fn();
    if (res && typeof res.then === "function") {
      await res;
    }
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[PASS] ${name} (${duration}ms)`);
    results.push({ name, status: "PASS", duration });
  } catch (err) {
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[FAIL] ${name} (${duration}ms): ${err.message}`);
    results.push({ name, status: "FAIL", duration, error: err.message });
  }
}

async function runAll() {
  clearPoolRegistry();
  defineMedicPools();

  // =========================================================================
  // 1. PROGRESSION IDEMPOTENCY STRESS
  // =========================================================================

  await record("Progression Idempotency: Level 1 -> 4 -> 8 -> 12 -> 16 -> 20 incremental progression", async () => {
    const actor = createActor(1);
    const mClass = Array.from(actor.items.values()).find(i => i.type === "class");

    // Level 1 setup and progression
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

    assert.equal(actor.system.currency.cp, 1300, "1300 LMD granted at level 1");
    assert.deepEqual(actor.system.traits.saves.value.sort(), ["con", "int"]);
    assert.equal(actor.system.skills.med.value, 2, "Medicine has Expertise (value=2)");
    assert.deepEqual(actor.system.traits.armorProf.value, ["shl"], "Light Shields only");

    // Incremental steps: 4, 8, 12, 16, 20
    const steps = [4, 8, 12, 16, 20];
    for (const lvl of steps) {
      await mClass.update({ "system.levels": lvl });
      actor.system.attributes.prof = pbForLevel(lvl);

      const sPlan = await previewMedicSetup(actor);
      await applyMedicSetup(actor, { confirmed: true, contextKey: sPlan.contextKey });

      const choices = {
        hp: { [lvl]: { mode: "fixed", roll: 4 } }
      };
      if (ASI_LEVELS.includes(lvl)) {
        choices.asi = { [lvl]: { increases: [{ ability: "int", amount: 2 }] } };
      }

      const pPlan = await previewMedicProgression(actor, choices);
      await applyMedicProgression(actor, { confirmed: true, contextKey: pPlan.contextKey, choices: pPlan.choices });
    }

    assert.equal(actor.system.currency.cp, 1300, "Cash never duplicated during level-up");
  });

  await record("Progression Idempotency: Re-run progression 5 times on same Level 20 character (HP, ASIs, items)", async () => {
    const actor = createActor(20);
    const mClass = Array.from(actor.items.values()).find(i => i.type === "class");

    const setupPlan = await previewMedicSetup(actor);
    await applyMedicSetup(actor, { confirmed: true, contextKey: setupPlan.contextKey });

    const initialHpChoices = {
      1: { mode: "fixed", roll: 6 },
      ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 2, { mode: "fixed", roll: 4 }]))
    };
    // Specifically test an ability that does NOT hit the 20 cap (STR starts at 10 -> +2 at level 4 to 12)
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

    const hpAfterRun1 = actor.system.attributes.hp.max;
    const strAfterRun1 = actor.system.abilities.str.value;
    assert.equal(strAfterRun1, 12, "STR is 12 after initial +2 ASI at level 4");
    const itemCountAfterRun1 = actor.items.size;

    // 5 sequential re-runs with empty choices
    for (let run = 2; run <= 6; run++) {
      const rePreview = await previewMedicProgression(actor, {});
      await applyMedicProgression(actor, { confirmed: true, contextKey: rePreview.contextKey, choices: rePreview.choices });

      assert.equal(actor.system.attributes.hp.max, hpAfterRun1, `Run ${run}: HP must not double or increase (was ${hpAfterRun1}, got ${actor.system.attributes.hp.max})`);
      assert.equal(actor.system.abilities.str.value, strAfterRun1, `Run ${run}: STR must not re-apply (expected 12, got ${actor.system.abilities.str.value})`);
      assert.equal(actor.items.size, itemCountAfterRun1, `Run ${run}: Items must not duplicate`);
    }
  });

  await record("Progression Idempotency: Authored item changes (names, descriptions, flags) preserved on re-run", async () => {
    const actor = createActor(1);
    const mClass = Array.from(actor.items.values()).find(i => i.type === "class");

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

    // User customizes an existing feature item on the actor
    const featureItem = Array.from(actor.items.values()).find(i => i.name.includes("Medical Expertise") || i.name.includes("Life Support"));
    assert.ok(featureItem, "Feature item found on actor");
    const originalName = featureItem.name;
    const customizedName = `${originalName} (Custom Table Note)`;
    const customizedDesc = "<p>Player customized field note: emergency supply kit inspected.</p>";

    await featureItem.update({
      name: customizedName,
      "system.description.value": customizedDesc,
      "flags.ak5e.playerNote": "do-not-overwrite"
    });

    // Re-run progression
    const reProg = await previewMedicProgression(actor, {});
    await applyMedicProgression(actor, { confirmed: true, contextKey: reProg.contextKey, choices: reProg.choices });

    // Assert customization is intact
    const foundCustomized = Array.from(actor.items.values()).find(i => i.id === featureItem.id);
    assert.ok(foundCustomized, "Item still exists");
    assert.equal(foundCustomized.name, customizedName, "Authored item name preserved");
    assert.equal(foundCustomized.system.description.value, customizedDesc, "Authored item description preserved");
    assert.equal(foundCustomized.flags?.ak5e?.playerNote, "do-not-overwrite", "Authored flag preserved");
  });

  // =========================================================================
  // 2. CHOICE SCHEMA EDGE CASES
  // =========================================================================

  await record("Choice Schema: Attempting to pick 1 or 3 saves must reject (exactly 2 required)", async () => {
    const actor = createActor(1);

    // Pick 1 save: ["con"]
    const plan1 = await previewMedicProgression(actor, {
      saves: ["con"]
    });
    assert.ok(
      plan1.pending?.includes("saves") || plan1.errors?.some(e => e.includes("saves")),
      "1 save must be flagged as pending or error (exactly 2 required)"
    );

    // Pick 3 saves: ["con", "int", "wis"]
    const plan3 = await previewMedicProgression(actor, {
      saves: ["con", "int", "wis"]
    });
    assert.ok(
      plan3.pending?.includes("saves") || plan3.errors?.some(e => e.includes("saves")),
      "3 saves must be flagged as pending or error (exactly 2 required)"
    );

    // Rejection on apply if invalid
    if (plan1.pending?.includes("saves")) {
      await assert.rejects(
        () => applyMedicProgression(actor, { confirmed: true, contextKey: plan1.contextKey, choices: plan1.choices }),
        /Complete all required choices/
      );
    }
  });

  await record("Choice Schema: Attempting to pick invalid saves (STR, DEX, CHA) must reject", async () => {
    const actor = createActor(1);

    // STR and DEX (neither allowed; only CON, INT, WIS allowed)
    const planInvalid = await previewMedicProgression(actor, {
      saves: ["str", "dex"]
    });
    assert.ok(
      planInvalid.pending?.includes("saves") || planInvalid.errors?.some(e => e.includes("saves")),
      "Invalid saves (STR, DEX) must be flagged as pending/error"
    );

    // Mixed valid and invalid: ["con", "cha"] (CHA not allowed for Medic)
    const planMixed = await previewMedicProgression(actor, {
      saves: ["con", "cha"]
    });
    assert.ok(
      planMixed.pending?.includes("saves") || planMixed.errors?.some(e => e.includes("saves")),
      "Mixed invalid saves (CON, CHA) must be flagged as pending/error"
    );

    // Duplicate saves: ["con", "con"]
    const planDup = await previewMedicProgression(actor, {
      saves: ["con", "con"]
    });
    assert.ok(
      planDup.pending?.includes("saves") || planDup.errors?.some(e => e.includes("saves")),
      "Duplicate saves ['con', 'con'] must be flagged as pending/error"
    );
  });

  await record("Choice Schema: Attempting invalid skills must reject (Medicine auto + exactly 2 from allowed)", async () => {
    const actor = createActor(1);

    // Invalid skills: Athletics, Stealth (neither in Medic list)
    const planInvalid = await previewMedicProgression(actor, {
      skills: ["ath", "ste"]
    });
    assert.ok(
      planInvalid.pending?.includes("skills") || planInvalid.errors?.some(e => e.includes("skills")),
      "Unlisted skills must be flagged as pending/error"
    );

    // Only 1 skill chosen
    const planOne = await previewMedicProgression(actor, {
      skills: ["arc"]
    });
    assert.ok(
      planOne.pending?.includes("skills") || planOne.errors?.some(e => e.includes("skills")),
      "1 skill must be flagged as pending/error"
    );

    // 3 skills chosen
    const planThree = await previewMedicProgression(actor, {
      skills: ["arc", "ins", "prc"]
    });
    assert.ok(
      planThree.pending?.includes("skills") || planThree.errors?.some(e => e.includes("skills")),
      "3 skills must be flagged as pending/error"
    );

    // Duplicate skill: ["arc", "arc"]
    const planDup = await previewMedicProgression(actor, {
      skills: ["arc", "arc"]
    });
    assert.ok(
      planDup.pending?.includes("skills") || planDup.errors?.some(e => e.includes("skills")),
      "Duplicate skills ['arc', 'arc'] must be flagged as pending/error"
    );
  });

  await record("Choice Schema: Attempting Feats for ASIs must reject (only ability improvements allowed)", async () => {
    const actor = createActor(4);
    const mClass = Array.from(actor.items.values()).find(i => i.type === "class");
    mClass.system.levels = 4;

    // Passing feat option instead of ability increases
    const planFeat = await previewMedicProgression(actor, {
      asi: {
        4: {
          mode: "feat",
          featId: "feat-sharpshooter"
        }
      }
    });
    assert.ok(
      planFeat.pending?.includes("asi.4") || planFeat.errors?.some(e => e.includes("asi")),
      "Feats for ASI must be rejected/flagged as pending (AK5e allows only ability score improvements)"
    );

    // Passing invalid increase schemes (+3 to one stat, or 3 stats +1)
    const planPlus3 = await previewMedicProgression(actor, {
      asi: {
        4: {
          increases: [{ ability: "int", amount: 3 }]
        }
      }
    });
    assert.ok(
      planPlus3.pending?.includes("asi.4") || planPlus3.errors?.some(e => e.includes("asi")),
      "+3 ASI increase must be flagged as pending/error"
    );

    // Duplicate ability in +1/+1 scheme: [{ ability: "int", amount: 1 }, { ability: "int", amount: 1 }]
    const planDupAsi = await previewMedicProgression(actor, {
      asi: {
        4: {
          increases: [{ ability: "int", amount: 1 }, { ability: "int", amount: 1 }]
        }
      }
    });
    assert.ok(
      planDupAsi.pending?.includes("asi.4") || planDupAsi.errors?.some(e => e.includes("asi")),
      "Duplicate ability in +1/+1 ASI scheme must be flagged as pending/error"
    );
  });

  await record("Choice Schema: Starting equipment cash (1300 LMD) vs item packages idempotency", async () => {
    // 1. Cash test
    const actorCash = createActor(1);
    const planCash = await previewMedicProgression(actorCash, {
      branch: "subclass-medic-physician",
      spellcastingAbility: "int",
      saves: ["con", "int"],
      skills: ["arc", "ins"],
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed", roll: 6 } }
    });
    await applyMedicProgression(actorCash, { confirmed: true, contextKey: planCash.contextKey, choices: planCash.choices });
    assert.equal(actorCash.system.currency.cp, 1300, "1300 LMD granted");

    // Second run with cash mode: currency must NOT increase to 2600
    const planCash2 = await previewMedicProgression(actorCash, {
      startingEquipment: { mode: "cash" }
    });
    assert.equal(planCash2.writes["system.currency.cp"], undefined, "No second cash write on re-run");
    await applyMedicProgression(actorCash, { confirmed: true, contextKey: planCash2.contextKey, choices: planCash2.choices });
    assert.equal(actorCash.system.currency.cp, 1300, "Currency remains 1300");

    // 2. Items test
    const actorItems = createActor(1);
    const planItems = await previewMedicProgression(actorItems, {
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
    await applyMedicProgression(actorItems, { confirmed: true, contextKey: planItems.contextKey, choices: planItems.choices });

    const itemsCount1 = actorItems.items.size;
    const gearItems1 = Array.from(actorItems.items.values()).filter(i =>
      i.flags?.ak5e?.medicProgressionGrant?.kind === "startingEquipment"
    );
    assert.ok(gearItems1.length >= 2, `Starting equipment items created (found ${gearItems1.length})`);

    // Verify Medical Kit item existence (flagging bug if missing due to wrong ID)
    const hasMedicalKit = gearItems1.some(i => i.name.toLowerCase().includes("medical kit"));
    assert.ok(hasMedicalKit, "Medical Kit tool was granted as part of starting equipment package");

    // Re-run with items mode: items must NOT duplicate
    const planItems2 = await previewMedicProgression(actorItems, {
      startingEquipment: {
        mode: "items",
        weapon1: "weapon-knife-4",
        shieldFocus: "equipment-small-shield-12"
      }
    });
    const newGearInPlan2 = planItems2.createItems.filter(i =>
      i.flags?.ak5e?.medicProgressionGrant?.kind === "startingEquipment"
    );
    assert.equal(newGearInPlan2.length, 0, "No new equipment in createItems on re-run");
    await applyMedicProgression(actorItems, { confirmed: true, contextKey: planItems2.contextKey, choices: planItems2.choices });
    assert.equal(actorItems.items.size, itemsCount1, "Actor item count did not increase");
  });

  // =========================================================================
  // 3. CONCURRENCY STRESS
  // =========================================================================

  await record("Concurrency Stress: 10 simultaneous touchHeal calls serialized via keyedSerial", async () => {
    const medic = createActor(5);
    medic.flags.ak5e = {
      medic: { enabled: true, spellcastingAbility: "int" }
    };
    setLifeSupport(medic, 100, "concurrency test");

    const patient = createTestActor({
      name: "Patient",
      level: 3,
      system: { attributes: { hp: { value: 10, max: 100 } } }
    });

    // Fire 10 concurrent touchHeal commands for 5 LS each
    const promises = Array.from({ length: 10 }, (_, i) =>
      medicUses.command(medic, "touchHeal", {
        confirmed: true,
        amount: 5,
        targetUuid: patient.uuid
      }, `concurrent-th-${i + 1}`)
    );

    const outcomes = await Promise.all(promises);
    assert.equal(outcomes.length, 10, "All 10 commands resolved");

    // Total LS spent: 10 * 5 = 50 -> 100 - 50 = 50
    const finalLS = lifeSupport(medic).value;
    assert.equal(finalLS, 50, `Life support exactly 50 (got ${finalLS})`);

    // Total HP restored: 10 * 5 = 50 -> 10 + 50 = 60
    assert.equal(patient.system.attributes.hp.value, 60, "Patient HP exactly 60");

    // Verify undo receipts integrity: exactly 10 distinct receipts
    const undoStack = medic.flags?.ak5e?.medicUses?.undo ?? [];
    const touchHealReceipts = undoStack.filter(r => r.command === "touchHeal");
    assert.equal(touchHealReceipts.length, 10, "10 undo receipts recorded in order");
  });

  await record("Concurrency Stress: Interleaved spends and undos maintain consistent state", async () => {
    const medic = createActor(5);
    medic.flags.ak5e = {
      medic: { enabled: true, spellcastingAbility: "int" }
    };
    setLifeSupport(medic, 50, "interleaved test");

    // Spend 5 LS
    await medicUses.command(medic, "preserver", { confirmed: true }, "interleave-1");
    assert.equal(lifeSupport(medic).value, 45); // 5 LS spent

    // Concurrent spend and undo
    const p1 = medicUses.command(medic, "preserver", { confirmed: true }, "interleave-2");
    const p2 = medicUses.command(medic, "undoUse", { useId: "interleave-1" });

    await Promise.all([p1, p2]);

    // 50 - 5 + 5 - 5 = 45 LS
    assert.equal(lifeSupport(medic).value, 45, "Life support consistent after interleaved spend & undo");
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================

  console.log("\n=== SUMMARY OF ADVERSARIAL STRESS HARNESS ===");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const totalTime = results.reduce((acc, r) => acc + parseFloat(r.duration), 0).toFixed(2);
  console.log(`Passed: ${passed}/${results.length}, Failed: ${failed}/${results.length}`);
  console.log(`Total execution time: ${totalTime}ms\n`);

  if (failed > 0) {
    console.log("FAILURES DETECTED:");
    for (const f of results.filter(r => r.status === "FAIL")) {
      console.log(`- ${f.name}: ${f.error}`);
    }
  }
}

await runAll();
