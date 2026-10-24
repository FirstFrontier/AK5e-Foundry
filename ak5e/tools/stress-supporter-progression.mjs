import assert from "node:assert/strict";
import {
  previewSupporterSetup, applySupporterSetup, SUPPORTER_CORE_FEATURES
} from "../scripts/supporter-setup.mjs";
import {
  inspectSupporterFields, supporterChoices, previewSupporterProgression, applySupporterProgression,
  SUPPORTER_PROGRESS_FLAG
} from "../scripts/supporter-progression.mjs";
import {
  SUPPORTER_CLASS_ID, SUPPORTER_SKILLS, SUPPORTER_SAVES, ASI_LEVELS, pbForLevel, hitPointsAtLevel
} from "../scripts/supporter-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "../test/base-classes-fixture.mjs";

console.log("Starting Adversarial Stress Harness for Supporter...");

setupFoundryGlobals();

function createActor(level = 1, options = {}) {
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
        prof: pbForLevel(level)
      },
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 14, mod: 2 },
        con: { value: 14, mod: 2 },
        int: { value: 14, mod: 2 },
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
        per: { value: 0 },
        ath: { value: 0 },
        ste: { value: 0 },
        prc: { value: 0 }
      },
      currency: { cp: 0 },
      ...options.system
    }
  });
  return actor;
}

const results = [];

async function record(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === "function") {
      await res;
    }
    console.log(`[PASS] ${name}`);
    results.push({ name, status: "PASS" });
  } catch (err) {
    console.log(`[FAIL] ${name}: ${err.message}`);
    results.push({ name, status: "FAIL", error: err.message });
  }
}

async function runAll() {
  // 1. Setup Idempotency: 5 sequential runs
  await record("Setup Idempotency: 5 sequential runs do not increase item count", async () => {
    const actor = createActor(5);
    const p1 = await previewSupporterSetup(actor);
    const r1 = await applySupporterSetup(actor, { confirmed: true, contextKey: p1.contextKey });
    const countAfterRun1 = actor.items.size;

    for (let i = 2; i <= 5; i++) {
      const p = await previewSupporterSetup(actor);
      assert.equal(p.creates.length, 0, `Run ${i} should have 0 creates`);
      const r = await applySupporterSetup(actor, { confirmed: true, contextKey: p.contextKey });
      assert.equal(r.createdCount, 0, `Run ${i} createdCount should be 0`);
      assert.equal(actor.items.size, countAfterRun1, `Item count should remain ${countAfterRun1}`);
    }
  });

  // 2. Setup Idempotency: Pre-populated authored item is preserved and not overwritten
  await record("Setup Idempotency: Pre-populated authored item is preserved", async () => {
    const authoredFeat = createTestItem({
      name: "1st Level: Provide Aid",
      type: "feat",
      flags: {
        ak5e: {
          chapterThreeId: "class-feature-supporter-1st-level-provide-aid-2284",
          customFlag: "preserve-me"
        }
      }
    });
    const sClass = createTestItem({
      name: "Supporter",
      type: "class",
      system: { levels: 1 },
      flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
    });
    const actor = createTestActor({ items: [sClass, authoredFeat] });

    const preview = await previewSupporterSetup(actor);
    assert.ok(preview.kept.includes("1st Level: Provide Aid"), "Authored feature was kept");
    assert.equal(preview.creates.some(c => c.name === "1st Level: Provide Aid"), false, "Not in creates");

    await applySupporterSetup(actor, { confirmed: true, contextKey: preview.contextKey });
    const found = Array.from(actor.items.values()).find(i => i.name === "1st Level: Provide Aid");
    assert.ok(found);
    assert.equal(found.flags?.ak5e?.customFlag, "preserve-me", "Authored customization preserved");
  });

  // 3. Progression: Incremental level-up 1 -> 20
  await record("Progression: Incremental level-up 1 -> 20", async () => {
    const actor = createActor(1);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");

    // Level 1 setup and initial choices
    const setupPlan1 = await previewSupporterSetup(actor);
    await applySupporterSetup(actor, { confirmed: true, contextKey: setupPlan1.contextKey });

    const progPlan1 = await previewSupporterProgression(actor, {
      branch: "subclass-supporter-bard",
      saves: ["con", "cha"],
      skills: ["arc", "ins", "per"],
      aidAbility: "cha",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed", roll: 6 } }
    });
    await applySupporterProgression(actor, { confirmed: true, contextKey: progPlan1.contextKey, choices: progPlan1.choices });

    assert.equal(actor.system.currency.cp, 1300, "1300 LMD granted at level 1");
    assert.deepEqual(actor.system.traits.saves.value.sort(), ["cha", "con"]);

    // Progress incrementally up to 20
    for (let lvl = 2; lvl <= 20; lvl++) {
      await sClass.update({ "system.levels": lvl });

      const setupPlan = await previewSupporterSetup(actor);
      await applySupporterSetup(actor, { confirmed: true, contextKey: setupPlan.contextKey });

      const choices = {
        hp: { [lvl]: { mode: "fixed", roll: 4 } }
      };
      if (ASI_LEVELS.includes(lvl)) {
        choices.asi = {
          [lvl]: { increases: [{ ability: "cha", amount: (actor.system.abilities.cha.value < 20 ? 2 : 0) || (actor.system.abilities.con.value < 20 ? 2 : 0) || [{ ability: "dex", amount: 2 }] }] }
        };
        // Normalize increases scheme if needed
        const abl = actor.system.abilities.cha.value <= 18 ? "cha" : (actor.system.abilities.con.value <= 18 ? "con" : "dex");
        choices.asi[lvl] = { increases: [{ ability: abl, amount: 2 }] };
      }
      if (lvl === 3) choices.talents = { basic: "class-option-supporter-talent-tactical-insight-1" };

      const progPlan = await previewSupporterProgression(actor, choices);
      await applySupporterProgression(actor, { confirmed: true, contextKey: progPlan.contextKey, choices });
    }

    assert.equal(actor.system.currency.cp, 1300, "Currency did not duplicate on level-up");
  });

  // 4. Progression Idempotency: Re-run at level 20 does not double-count HP or ASIs
  await record("Progression Idempotency: Re-run at level 20 does not double-count HP or ASIs", async () => {
    const actor = createActor(20);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");

    const setupPlan = await previewSupporterSetup(actor);
    await applySupporterSetup(actor, { confirmed: true, contextKey: setupPlan.contextKey });

    const progPlan = await previewSupporterProgression(actor, {
      branch: "subclass-supporter-bard",
      saves: ["con", "cha"],
      skills: ["arc", "ins", "per"],
      aidAbility: "cha",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed", roll: 6 }, ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 2, { mode: "fixed", roll: 4 }])) },
      asi: Object.fromEntries(ASI_LEVELS.map(l => [l, { increases: [{ ability: "cha", amount: 2 }] }]))
    });
    await applySupporterProgression(actor, { confirmed: true, contextKey: progPlan.contextKey, choices: progPlan.choices });

    const hpAfterRun1 = actor.system.attributes.hp.max;
    const chaAfterRun1 = actor.system.abilities.cha.value;

    // Second run with empty/existing choices
    const progPlan2 = await previewSupporterProgression(actor, {});
    await applySupporterProgression(actor, { confirmed: true, contextKey: progPlan2.contextKey, choices: progPlan2.choices });

    assert.equal(actor.system.attributes.hp.max, hpAfterRun1, "HP did not change on re-run");
    assert.equal(actor.system.abilities.cha.value, chaAfterRun1, "Ability score did not change on re-run");
  });

  // 5. Progression Invariant: Tampered contextKey is rejected
  await record("Progression Invariant: Tampered contextKey is rejected", async () => {
    const actor = createActor(1);
    const progPlan = await previewSupporterProgression(actor, {
      branch: "subclass-supporter-bard",
      saves: ["con", "cha"],
      skills: ["arc", "ins", "per"],
      startingEquipment: { mode: "cash" }
    });

    await assert.rejects(
      () => applySupporterProgression(actor, { confirmed: true, contextKey: "tampered-hash", choices: progPlan.choices }),
      /character changed since the preview/
    );
  });

  // 6. Progression Invariant: Saving throw choices (exactly 2 from con, cha, wis)
  await record("Progression Invariant: Saves validation (exactly 2 from CON, CHA, WIS)", async () => {
    const actor = createActor(1);

    // Invalid save: DEX, STR
    const pInvalid = await previewSupporterProgression(actor, { saves: ["dex", "str"] });
    assert.ok(pInvalid.pending.includes("saves"), "Invalid saves (DEX, STR) flagged as pending");

    // Only 1 save: CON
    const pOne = await previewSupporterProgression(actor, { saves: ["con"] });
    assert.ok(pOne.pending.includes("saves"), "1 save flagged as pending");

    // Duplicate saves: ["con", "con"]
    const pDup = await previewSupporterProgression(actor, { saves: ["con", "con"] });
    assert.ok(pDup.pending.includes("saves"), "Duplicate saves flagged as pending");

    // 3 saves: ["con", "cha", "wis"]
    const pThree = await previewSupporterProgression(actor, { saves: ["con", "cha", "wis"] });
    assert.ok(pThree.pending.includes("saves"), "3 saves flagged as pending");

    // Valid: ["con", "wis"]
    const pValid = await previewSupporterProgression(actor, { saves: ["con", "wis"] });
    assert.equal(pValid.pending.includes("saves"), false, "Valid saves not pending");
  });

  // 7. Progression Invariant: Skills validation (exactly 3 from 6 supporter skills)
  await record("Progression Invariant: Skills validation (exactly 3 from 6 supporter skills)", async () => {
    const actor = createActor(1);

    // Invalid skills: not on list
    const pInvalid = await previewSupporterProgression(actor, { skills: ["ath", "ste", "prc"] });
    assert.ok(pInvalid.pending.includes("skills"), "Skills not on list flagged as pending");

    // Only 2 skills
    const pTwo = await previewSupporterProgression(actor, { skills: ["arc", "ins"] });
    assert.ok(pTwo.pending.includes("skills"), "2 skills flagged as pending");

    // 4 skills
    const pFour = await previewSupporterProgression(actor, { skills: ["arc", "ins", "per", "dec"] });
    assert.ok(pFour.pending.includes("skills"), "4 skills flagged as pending");

    // Duplicate skills: ["arc", "arc", "ins"]
    const pDup = await previewSupporterProgression(actor, { skills: ["arc", "arc", "ins"] });
    assert.ok(pDup.pending.includes("skills"), "Duplicate skills flagged as pending");

    // Valid: ["arc", "ak5elore", "ak5etech"]
    const pValid = await previewSupporterProgression(actor, { skills: ["arc", "ak5elore", "ak5etech"] });
    assert.equal(pValid.pending.includes("skills"), false, "Valid skills not pending");
  });

  // 8. Progression Invariant: Starting equipment cash vs items idempotency
  await record("Progression Invariant: Starting equipment cash grants exactly 1300 LMD once", async () => {
    const actor = createActor(1);
    const plan = await previewSupporterProgression(actor, {
      branch: "subclass-supporter-bard",
      saves: ["con", "cha"],
      skills: ["arc", "ins", "per"],
      startingEquipment: { mode: "cash" }
    });
    await applySupporterProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: plan.choices });

    assert.equal(actor.system.currency.cp, 1300);

    // Re-preview should have startingEquipment mode set to existing
    const plan2 = await previewSupporterProgression(actor, {});
    await applySupporterProgression(actor, { confirmed: true, contextKey: plan2.contextKey, choices: plan2.choices });

    assert.equal(actor.system.currency.cp, 1300, "Currency remains 1300 on subsequent runs");
  });

  // 9. Progression Invariant: ASI scheme validation
  await record("Progression Invariant: ASI scheme validation (+2 or +1/+1 scheme, ability cap 20)", async () => {
    const actor = createActor(4);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");

    // Invalid scheme: +3 to STR
    const pInvalidAmount = await previewSupporterProgression(actor, {
      asi: { 4: { increases: [{ ability: "str", amount: 3 }] } }
    });
    assert.ok(pInvalidAmount.pending.includes("asi.4"), "+3 increase flagged as pending");

    // Invalid scheme: 3 abilities +1 each
    const pThreeAbilities = await previewSupporterProgression(actor, {
      asi: { 4: { increases: [{ ability: "str", amount: 1 }, { ability: "dex", amount: 1 }, { ability: "con", amount: 1 }] } }
    });
    assert.ok(pThreeAbilities.pending.includes("asi.4"), "3 abilities flagged as pending");

    // Valid scheme: +2 to CHA capped at 20
    const pValid = await previewSupporterProgression(actor, {
      asi: { 4: { increases: [{ ability: "cha", amount: 2 }] } }
    });
    assert.equal(pValid.pending.includes("asi.4"), false, "Valid +2 increase not pending");
    assert.equal(pValid.writes["system.abilities.cha.value"], 18);
  });

  // 10. Progression Invariant: Rolled HP boundary validation (clamped to [1, 6])
  await record("Progression Invariant: Rolled HP boundary validation (values > 6 clamped to 6, values < 1 clamped to 1)", async () => {
    const actor = createActor(2);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");
    sClass.system.levels = 2;

    const initialMax = actor.system.attributes.hp.max; // 8
    // CON mod is 2.
    // Rolled 50: clamped to 6 -> increase is 6 + 2 = 8 -> 8 + 8 = 16
    const pHigh = await previewSupporterProgression(actor, {
      hp: { 2: { mode: "rolled", roll: 50 } }
    });
    assert.equal(pHigh.writes["system.attributes.hp.max"], initialMax + 8, "Roll of 50 clamped to 6");

    // Rolled -10: clamped to 1 -> increase is 1 + 2 = 3 -> 8 + 3 = 11
    const pLow = await previewSupporterProgression(actor, {
      hp: { 2: { mode: "rolled", roll: -10 } }
    });
    assert.equal(pLow.writes["system.attributes.hp.max"], initialMax + 3, "Roll of -10 clamped to 1");
  });

  // 11. Progression Invariant: ASI duplicate ability rejection
  await record("Progression Invariant: ASI duplicate ability in +1/+1 scheme is flagged pending and rejected", async () => {
    const actor = createActor(4);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");
    sClass.system.levels = 4;

    const pDup = await previewSupporterProgression(actor, {
      asi: {
        4: {
          mode: "custom",
          increases: [{ ability: "cha", amount: 1 }, { ability: "cha", amount: 1 }]
        }
      }
    });
    assert.ok(pDup.pending.includes("asi.4"), "Duplicate ability in +1/+1 scheme must be flagged pending");
    assert.equal(pDup.writes["system.abilities.cha.value"], undefined);
  });

  console.log("\n=== SUMMARY OF ADVERSARIAL STRESS HARNESS ===");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`Passed: ${passed}/${results.length}, Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    process.exit(1);
  }
}

await runAll();
