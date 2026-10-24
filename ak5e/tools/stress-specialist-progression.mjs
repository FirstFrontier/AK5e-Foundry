import assert from "node:assert/strict";
import {
  previewSpecialistSetup, applySpecialistSetup, SPECIALIST_CORE_FEATURES
} from "../scripts/specialist-setup.mjs";
import {
  inspectSpecialistFields, specialistChoices, previewSpecialistProgression, applySpecialistProgression,
  SPECIALIST_PROGRESS_FLAG
} from "../scripts/specialist-progression.mjs";
import {
  SPECIALIST_CLASS_ID, SPECIALIST_SKILLS, SPECIALIST_SAVES, ASI_LEVELS, pbForLevel, hitPointsAtLevel,
  specialistProfile, specialistEnabled, checkLevel
} from "../scripts/specialist-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "../test/base-classes-fixture.mjs";

console.log("Starting Adversarial Stress Harness for Specialist...");

setupFoundryGlobals();

function createActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: {
        hp: { value: 10, max: 10, temp: 0 },
        prof: pbForLevel(level)
      },
      abilities: {
        str: { value: 12, mod: 1 },
        dex: { value: 16, mod: 3 },
        con: { value: 14, mod: 2 },
        int: { value: 12, mod: 1 },
        wis: { value: 12, mod: 1 },
        cha: { value: 10, mod: 0 }
      },
      traits: {
        saves: { value: [] },
        armorProf: { value: [] },
        weaponProf: { value: [] },
        toolProf: { value: [] }
      },
      skills: {
        acr: { value: 0 },
        slt: { value: 0 },
        ste: { value: 0 },
        ak5etech: { value: 0 },
        prc: { value: 0 },
        ak5ewilderness: { value: 0 },
        ath: { value: 0 }
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
  // =========================================================================
  // 1. SETUP IDEMPOTENCY & AUTHORED ITEMS
  // =========================================================================

  await record("Setup Idempotency: 5 sequential runs do not duplicate items", async () => {
    const actor = createActor(5);
    const p1 = await previewSpecialistSetup(actor);
    const r1 = await applySpecialistSetup(actor, { confirmed: true, contextKey: p1.contextKey });
    const countAfterRun1 = actor.items.size;

    for (let i = 2; i <= 5; i++) {
      const p = await previewSpecialistSetup(actor);
      assert.equal(p.creates.length, 0, `Run ${i} should have 0 creates`);
      const r = await applySpecialistSetup(actor, { confirmed: true, contextKey: p.contextKey });
      assert.equal(r.created.length, 0, `Run ${i} created length should be 0`);
      assert.equal(actor.items.size, countAfterRun1, `Item count should remain ${countAfterRun1}`);
    }
  });

  await record("Setup Idempotency: Pre-populated authored feature is preserved and not overwritten", async () => {
    const customDesc = "CUSTOM AUTHORED DESCRIPTION: MUST NEVER BE OVERWRITTEN";
    const customFeat = createTestItem({
      name: "1st Level: Weapon Specialisation",
      type: "feat",
      system: { description: { value: customDesc } },
      flags: {
        ak5e: {
          chapterThreeId: "class-feature-specialist-1st-level-weapon-specialisation-3266",
          authoredCustomFlag: "keep-me-safe"
        }
      }
    });
    const sClass = createTestItem({
      name: "Specialist",
      type: "class",
      system: { levels: 1 },
      flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
    });
    const actor = createTestActor({ items: [sClass, customFeat] });

    const preview = await previewSpecialistSetup(actor);
    assert.ok(preview.kept.includes("1st Level: Weapon Specialisation"), "Authored feature was in kept");
    assert.equal(preview.creates.some(c => c.name === "1st Level: Weapon Specialisation"), false, "Not in creates");

    await applySpecialistSetup(actor, { confirmed: true, contextKey: preview.contextKey });
    const found = Array.from(actor.items.values()).find(i => i.name === "1st Level: Weapon Specialisation");
    assert.ok(found, "Item exists");
    assert.equal(found.system.description.value, customDesc, "Custom description preserved");
    assert.equal(found.flags?.ak5e?.authoredCustomFlag, "keep-me-safe", "Custom flag preserved");
  });

  await record("Setup Idempotency: Custom weapons, armor, and abilities are preserved untouched", async () => {
    const actor = createActor(1);
    const customWeapon = createTestItem({
      name: "Super Vibranium Dagger",
      type: "weapon",
      system: { damage: { base: "2d4" } }
    });
    const customArmor = createTestItem({
      name: "Ghostlight Underarmour",
      type: "equipment",
      system: { armor: { value: 13 } }
    });
    const customAbility = createTestItem({
      name: "Unique Combat Instinct",
      type: "feat",
      system: { description: { value: "Rare ability" } }
    });
    actor.items.set(customWeapon.id, customWeapon);
    actor.items.set(customArmor.id, customArmor);
    actor.items.set(customAbility.id, customAbility);

    const initialTotalItems = actor.items.size; // 1 class + 3 custom = 4

    const p1 = await previewSpecialistSetup(actor);
    await applySpecialistSetup(actor, { confirmed: true, contextKey: p1.contextKey });

    // Level 1 creates 2 features (Specialist Branch, Weapon Specialisation)
    assert.equal(actor.items.size, initialTotalItems + 2);
    assert.ok(actor.items.has(customWeapon.id), "Custom weapon preserved");
    assert.ok(actor.items.has(customArmor.id), "Custom armor preserved");
    assert.ok(actor.items.has(customAbility.id), "Custom ability preserved");

    // Run setup again at level 5
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");
    sClass.system.levels = 5;

    const p2 = await previewSpecialistSetup(actor);
    await applySpecialistSetup(actor, { confirmed: true, contextKey: p2.contextKey });

    assert.ok(actor.items.has(customWeapon.id), "Custom weapon still preserved at Lv 5");
    assert.ok(actor.items.has(customArmor.id), "Custom armor still preserved at Lv 5");
    assert.ok(actor.items.has(customAbility.id), "Custom ability still preserved at Lv 5");
  });

  await record("Setup Idempotency: Level 20 populates all 13 core features and is idempotent", async () => {
    const actor = createActor(20);
    const p1 = await previewSpecialistSetup(actor);
    assert.equal(p1.creates.length, 13, "Level 20 populates all 13 core features");
    assert.equal(p1.kept.length, 0);

    const r1 = await applySpecialistSetup(actor, { confirmed: true, contextKey: p1.contextKey });
    assert.equal(r1.created.length, 13);

    const p2 = await previewSpecialistSetup(actor);
    assert.equal(p2.creates.length, 0, "Second run has 0 creates");
    assert.equal(p2.kept.length, 13, "Second run keeps all 13 features");

    const r2 = await applySpecialistSetup(actor, { confirmed: true, contextKey: p2.contextKey });
    assert.equal(r2.created.length, 0);
    assert.equal(r2.kept.length, 13);
  });

  // =========================================================================
  // 2. PROGRESSION INVARIANTS & SCALING (LEVEL 1 TO 20)
  // =========================================================================

  await record("Progression Invariant: Incremental level-up 1 -> 20 preserves exact HP math and gear rules", async () => {
    const actor = createActor(1);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");

    // Level 1 setup and progression
    const setupPlan1 = await previewSpecialistSetup(actor);
    await applySpecialistSetup(actor, { confirmed: true, contextKey: setupPlan1.contextKey });

    const progPlan1 = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });
    await applySpecialistProgression(actor, { confirmed: true, contextKey: progPlan1.contextKey, choices: progPlan1.choices });

    // Initial state checks
    // CON mod is 2. Level 1 HP = 8 + 2 = 10. Initial actor max HP was 10.
    // Progression writes: currentMax (10) + hpIncrease (10) = 20 HP.
    assert.equal(actor.system.currency.cp, 1300, "1300 LMD granted at Level 1");
    assert.deepEqual(actor.system.traits.saves.value.sort(), ["dex", "wis"]);
    assert.equal(actor.system.abilities.dex.value, 16);

    const conMod = 2;
    let expectedHP = actor.system.attributes.hp.max;

    // Progress incrementally through levels 2 to 20
    for (let lvl = 2; lvl <= 20; lvl++) {
      await sClass.update({ "system.levels": lvl });

      const sPlan = await previewSpecialistSetup(actor);
      await applySpecialistSetup(actor, { confirmed: true, contextKey: sPlan.contextKey });

      const choices = {
        hp: { [lvl]: { mode: "fixed", roll: 5 } }
      };

      if (ASI_LEVELS.includes(lvl)) {
        // Boost DEX to 20 then CON
        const abl = actor.system.abilities.dex.value < 20 ? "dex" : "con";
        choices.asi = { [lvl]: { increases: [{ ability: abl, amount: 2 }] } };
      }

      if (lvl === 3) choices.talents = { basic: "class-option-specialist-talent-shadow-step-1" };

      const pPlan = await previewSpecialistProgression(actor, choices);
      assert.equal(pPlan.valid, true, `Level ${lvl} progression plan should be valid`);
      await applySpecialistProgression(actor, { confirmed: true, contextKey: pPlan.contextKey, choices });

      // Verify HP increased by exactly 5 + conMod (7) per level
      expectedHP += (5 + conMod);
      assert.equal(actor.system.attributes.hp.max, expectedHP, `HP at level ${lvl} should match exact formula`);
    }

    // After 20 levels:
    assert.equal(actor.system.currency.cp, 1300, "Starting cash was NOT re-granted on level-ups");
    assert.equal(actor.system.abilities.dex.value, 20, "DEX capped at 20 across ASIs");
    assert.equal(actor.system.abilities.con.value, 20, "CON capped at 20 across ASIs");
  });

  await record("Progression Invariant: Re-run at level 20 does not double-count HP or ASIs", async () => {
    const actor = createActor(20);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");

    const setupPlan = await previewSpecialistSetup(actor);
    await applySpecialistSetup(actor, { confirmed: true, contextKey: setupPlan.contextKey });

    const progPlan = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-hookmaster",
      saves: ["cha"],
      skills: ["acr", "prc", "ste"],
      weaponCategory: "ranged",
      fightingStyle: "ranger",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" }, ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 2, { mode: "fixed", roll: 5 }])) },
      asi: Object.fromEntries(ASI_LEVELS.map(l => [l, { increases: [{ ability: "dex", amount: 2 }] }]))
    });
    await applySpecialistProgression(actor, { confirmed: true, contextKey: progPlan.contextKey, choices: progPlan.choices });

    const hpAfterRun1 = actor.system.attributes.hp.max;
    const dexAfterRun1 = actor.system.abilities.dex.value;
    const cpAfterRun1 = actor.system.currency.cp;

    // Second run with empty choices (or specialistChoices)
    const progPlan2 = await previewSpecialistProgression(actor, {});
    assert.equal(progPlan2.valid, true);
    await applySpecialistProgression(actor, { confirmed: true, contextKey: progPlan2.contextKey, choices: progPlan2.choices });

    assert.equal(actor.system.attributes.hp.max, hpAfterRun1, "HP did not change on re-run");
    assert.equal(actor.system.abilities.dex.value, dexAfterRun1, "DEX did not change on re-run");
    assert.equal(actor.system.currency.cp, cpAfterRun1, "Currency did not duplicate on re-run");
  });

  await record("Progression Invariant: Starting equipment items mode grants items once and never duplicates", async () => {
    const actor = createActor(1);
    const plan = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: {
        mode: "items",
        choice1: "weapon-combat-knife-1",
        choice2: "weapon-shortsword-3",
        choice3: "equipment-reinforced-outfit-1",
        toolKit: "tool-thieves-tools-1"
      },
      hp: { 1: { mode: "fixed" } }
    });
    await applySpecialistProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: plan.choices });

    const state = actor.flags.ak5e[SPECIALIST_PROGRESS_FLAG];
    assert.equal(state.startingEquipmentGranted, true, "startingEquipmentGranted is true");

    const itemCountAfter1 = actor.items.size;

    // Second progression run passing the same items mode again
    const plan2 = await previewSpecialistProgression(actor, {
      startingEquipment: {
        mode: "items",
        choice1: "weapon-combat-knife-1",
        choice2: "weapon-shortsword-3"
      }
    });

    // Writes and createItems should have 0 startingEquipment items
    assert.equal(plan2.createItems.some(i => i.flags?.ak5e?.specialistProgressionGrant?.kind === "startingEquipment"), false);
    await applySpecialistProgression(actor, { confirmed: true, contextKey: plan2.contextKey, choices: plan2.choices });

    assert.equal(actor.items.size, itemCountAfter1, "Item count did not increase on re-run");
  });

  await record("Progression Invariant: Negative CON mod enforces 1 HP minimum gain", async () => {
    // Actor with CON = 6 (-2 mod)
    const actor = createActor(2, {
      system: {
        abilities: { con: { value: 6, mod: -2 } },
        attributes: { hp: { max: 0 } }
      }
    });

    const plan = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: {
        1: { mode: "fixed" }, // 8 - 2 = 6 HP
        2: { mode: "rolled", roll: 1 } // 1 - 2 = -1, clamped to minimum 1 HP
      }
    });

    // Total HP should be 6 + 1 = 7
    assert.equal(plan.writes["system.attributes.hp.max"], 7, "Negative CON roll respects min 1 HP");
  });

  // =========================================================================
  // 3. CHOICE VALIDATION PERMUTATIONS
  // =========================================================================

  await record("Choice Validation: Permute invalid saving throws (Dex+Str, Wis+Cha, 2 saves, unlisted)", async () => {
    const actor = createActor(1);

    // Permutation 1: Dex + Str (Str is not allowed; Dex is automatic)
    const pDexStr = await previewSpecialistProgression(actor, { saves: ["dex", "str"] });
    assert.ok(pDexStr.pending.includes("saves"), "Dex+Str must be flagged pending saves");

    // Permutation 2: Wis + Cha (Both chosen from choice list, but only 1 allowed)
    const pWisCha = await previewSpecialistProgression(actor, { saves: ["wis", "cha"] });
    assert.ok(pWisCha.pending.includes("saves"), "Wis+Cha (2 chosen saves) must be flagged pending saves");

    // Permutation 3: Only Dex (Dex is automatic, must pick 1 from Wis/Cha)
    const pOnlyDex = await previewSpecialistProgression(actor, { saves: ["dex"] });
    assert.ok(pOnlyDex.pending.includes("saves"), "Only Dex must be flagged pending saves");

    // Permutation 4: Empty saves
    const pEmpty = await previewSpecialistProgression(actor, { saves: [] });
    assert.ok(pEmpty.pending.includes("saves"), "Empty saves must be flagged pending saves");

    // Permutation 5: Unlisted save (Intelligence)
    const pInt = await previewSpecialistProgression(actor, { saves: ["int"] });
    assert.ok(pInt.pending.includes("saves"), "Unlisted save INT must be flagged pending saves");

    // Permutation 6: Unlisted save (Constitution)
    const pCon = await previewSpecialistProgression(actor, { saves: ["con"] });
    assert.ok(pCon.pending.includes("saves"), "Unlisted save CON must be flagged pending saves");

    // Permutation 7: Valid save (Wisdom)
    const pValidWis = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });
    assert.equal(pValidWis.pending.includes("saves"), false, "Valid save WIS must NOT be pending");
    assert.ok(pValidWis.writes["system.traits.saves.value"].includes("dex"), "Dex is automatically added");
    assert.ok(pValidWis.writes["system.traits.saves.value"].includes("wis"), "Wis is added");

    // Permutation 8: Valid save (Charisma)
    const pValidCha = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["cha"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });
    assert.equal(pValidCha.pending.includes("saves"), false, "Valid save CHA must NOT be pending");
    assert.ok(pValidCha.writes["system.traits.saves.value"].includes("dex"), "Dex is automatically added");
    assert.ok(pValidCha.writes["system.traits.saves.value"].includes("cha"), "Cha is added");
  });

  await record("Choice Validation: Permute invalid skill counts (2 skills, 4 skills, unlisted Athletics, duplicates)", async () => {
    const actor = createActor(1);

    // Permutation 1: 2 skills (under count)
    const pTwo = await previewSpecialistProgression(actor, { skills: ["acr", "slt"] });
    assert.ok(pTwo.pending.includes("skills"), "2 skills must be flagged pending skills");

    // Permutation 2: 4 skills (over count)
    const pFour = await previewSpecialistProgression(actor, { skills: ["acr", "slt", "ste", "prc"] });
    assert.ok(pFour.pending.includes("skills"), "4 skills must be flagged pending skills");

    // Permutation 3: Unlisted skill (Athletics is NOT a specialist skill)
    const pAth = await previewSpecialistProgression(actor, { skills: ["ath", "acr", "slt"] });
    assert.ok(pAth.pending.includes("skills"), "Athletics (unlisted) must be flagged pending skills");

    // Permutation 4: Duplicate skill
    const pDup = await previewSpecialistProgression(actor, { skills: ["acr", "acr", "slt"] });
    assert.ok(pDup.pending.includes("skills"), "Duplicate skill must be flagged pending skills");

    // Permutation 5: 0 skills
    const pZero = await previewSpecialistProgression(actor, { skills: [] });
    assert.ok(pZero.pending.includes("skills"), "Empty skills must be flagged pending skills");

    // Permutation 6: Valid exactly 3
    const pValid = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["ste", "ak5etech", "ak5ewilderness"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });
    assert.equal(pValid.pending.includes("skills"), false, "Valid 3 specialist skills not pending");
  });

  await record("Choice Validation: Permute invalid rolled HP (0, 9, negative, float, NaN)", async () => {
    const actor = createActor(2);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");
    sClass.system.levels = 2;

    const baseMax = actor.system.attributes.hp.max; // 10
    const conMod = 2;

    // Roll 0: Clamped to 1 -> + 1 + 2 = 3
    const p0 = await previewSpecialistProgression(actor, { hp: { 2: { mode: "rolled", roll: 0 } } });
    assert.equal(p0.writes["system.attributes.hp.max"], baseMax + (1 + conMod), "Roll 0 clamped to 1");

    // Roll 9: Clamped to 8 -> + 8 + 2 = 10
    const p9 = await previewSpecialistProgression(actor, { hp: { 2: { mode: "rolled", roll: 9 } } });
    assert.equal(p9.writes["system.attributes.hp.max"], baseMax + (8 + conMod), "Roll 9 clamped to 8");

    // Roll -100: Clamped to 1 -> + 1 + 2 = 3
    const pNeg = await previewSpecialistProgression(actor, { hp: { 2: { mode: "rolled", roll: -100 } } });
    assert.equal(pNeg.writes["system.attributes.hp.max"], baseMax + (1 + conMod), "Negative roll clamped to 1");

    // Roll 5.4 (float): Rounded to 5 -> + 5 + 2 = 7
    const pFloatLow = await previewSpecialistProgression(actor, { hp: { 2: { mode: "rolled", roll: 5.4 } } });
    assert.equal(pFloatLow.writes["system.attributes.hp.max"], baseMax + (5 + conMod), "Float 5.4 rounded to 5");

    // Roll 5.8 (float): Rounded to 6 -> + 6 + 2 = 8
    const pFloatHigh = await previewSpecialistProgression(actor, { hp: { 2: { mode: "rolled", roll: 5.8 } } });
    assert.equal(pFloatHigh.writes["system.attributes.hp.max"], baseMax + (6 + conMod), "Float 5.8 rounded to 6");

    // Roll NaN / string: Falls back to fixed 5 -> + 5 + 2 = 7
    const pNaN = await previewSpecialistProgression(actor, { hp: { 2: { mode: "rolled", roll: "bad" } } });
    assert.equal(pNaN.writes["system.attributes.hp.max"], baseMax + (5 + conMod), "NaN roll falls back to fixed 5");
  });

  await record("Choice Validation: Permute invalid ASIs (+3, +2/+1, +1/+1 same stat, 3 stats, 20 cap)", async () => {
    const actor = createActor(4);
    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");
    sClass.system.levels = 4;

    // Permutation 1: +3 to STR
    const pPlus3 = await previewSpecialistProgression(actor, {
      asi: { 4: { increases: [{ ability: "str", amount: 3 }] } }
    });
    assert.ok(pPlus3.pending.includes("asi.4"), "+3 increase must be flagged pending asi.4");

    // Permutation 2: +2 to STR and +1 to DEX
    const p2Plus1 = await previewSpecialistProgression(actor, {
      asi: { 4: { increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 1 }] } }
    });
    assert.ok(p2Plus1.pending.includes("asi.4"), "+2 and +1 must be flagged pending asi.4");

    // Permutation 3: +1 and +1 to same stat (duplicate ability)
    const pDupStat = await previewSpecialistProgression(actor, {
      asi: { 4: { increases: [{ ability: "dex", amount: 1 }, { ability: "dex", amount: 1 }] } }
    });
    assert.ok(pDupStat.pending.includes("asi.4"), "+1/+1 to same stat must be flagged pending asi.4");

    // Permutation 4: +1 to 3 stats
    const pThreeStats = await previewSpecialistProgression(actor, {
      asi: { 4: { increases: [{ ability: "str", amount: 1 }, { ability: "dex", amount: 1 }, { ability: "con", amount: 1 }] } }
    });
    assert.ok(pThreeStats.pending.includes("asi.4"), "3 stats must be flagged pending asi.4");

    // Permutation 5: Invalid ability key ("speed")
    const pBadAbl = await previewSpecialistProgression(actor, {
      asi: { 4: { increases: [{ ability: "speed", amount: 2 }] } }
    });
    assert.ok(pBadAbl.pending.includes("asi.4"), "Invalid ability key must be flagged pending asi.4");

    // Permutation 6: Ability cap at 20 (actor has DEX 19, +2 to DEX written as 20, never 21)
    const actor19 = createActor(4, { system: { abilities: { dex: { value: 19, mod: 4 } } } });
    const pCap = await previewSpecialistProgression(actor19, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" }, 2: { mode: "fixed" }, 3: { mode: "fixed" }, 4: { mode: "fixed" } },
      asi: { 4: { increases: [{ ability: "dex", amount: 2 }] } }
    });
    assert.equal(pCap.writes["system.abilities.dex.value"], 20, "DEX capped at 20, never exceeds 20");
  });

  await record("Choice Validation: ContextKey tampering and unconfirmed calls throw", async () => {
    const actor = createActor(1);

    // Setup: Unconfirmed throws
    const pSetup = await previewSpecialistSetup(actor);
    await assert.rejects(
      () => applySpecialistSetup(actor, { confirmed: false, contextKey: pSetup.contextKey }),
      /Confirm the previewed Specialist setup first/
    );

    // Setup: Tampered contextKey throws
    await assert.rejects(
      () => applySpecialistSetup(actor, { confirmed: true, contextKey: "TAMPERED_KEY" }),
      /character changed since the preview/
    );

    // Progression: Unconfirmed throws
    const pProg = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });
    await assert.rejects(
      () => applySpecialistProgression(actor, { confirmed: false, contextKey: pProg.contextKey, choices: pProg.choices }),
      /Confirm the previewed Specialist progression first/
    );

    // Progression: Tampered contextKey throws
    await assert.rejects(
      () => applySpecialistProgression(actor, { confirmed: true, contextKey: "TAMPERED_KEY", choices: pProg.choices }),
      /character changed since the preview/
    );

    // Progression: Incomplete choices (valid === false) throws
    const pIncomplete = await previewSpecialistProgression(actor, {});
    assert.equal(pIncomplete.valid, false);
    await assert.rejects(
      () => applySpecialistProgression(actor, { confirmed: true, contextKey: pIncomplete.contextKey, choices: {} }),
      /Complete all required choices before applying progression/
    );
  });

  await record("Choice Validation: Weapon Specialisation category and style validation", async () => {
    const actor = createActor(1);

    // Invalid category
    const pBadCat = await previewSpecialistProgression(actor, { weaponCategory: "unarmed" });
    assert.ok(pBadCat.pending.includes("weaponCategory"), "Invalid category 'unarmed' pending");

    // Invalid fighting style
    const pBadStyle = await previewSpecialistProgression(actor, { fightingStyle: "spinAttack" });
    assert.ok(pBadStyle.pending.includes("fightingStyle"), "Invalid style 'spinAttack' pending");

    // Valid melee style
    const pValidMelee = await previewSpecialistProgression(actor, { weaponCategory: "melee", fightingStyle: "brawler" });
    assert.equal(pValidMelee.pending.includes("weaponCategory"), false);
    assert.equal(pValidMelee.pending.includes("fightingStyle"), false);

    // Valid ranged style
    const pValidRanged = await previewSpecialistProgression(actor, { weaponCategory: "ranged", fightingStyle: "ranger" });
    assert.equal(pValidRanged.pending.includes("weaponCategory"), false);
    assert.equal(pValidRanged.pending.includes("fightingStyle"), false);
  });

  await record("Progression Invariant: Caller attempts to re-grant cash or gear at higher levels are blocked", async () => {
    const actor = createActor(1);
    const plan1 = await previewSpecialistProgression(actor, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });
    await applySpecialistProgression(actor, { confirmed: true, contextKey: plan1.contextKey, choices: plan1.choices });
    assert.equal(actor.system.currency.cp, 1300);

    const sClass = Array.from(actor.items.values()).find(i => i.type === "class");
    await sClass.update({ "system.levels": 2 });

    // Adversarial: Pass startingEquipment cash mode again
    const plan2Cash = await previewSpecialistProgression(actor, {
      startingEquipment: { mode: "cash" },
      hp: { 2: { mode: "fixed" } }
    });
    assert.equal(plan2Cash.writes["system.currency.cp"], undefined, "Cash write blocked on level 2");
    await applySpecialistProgression(actor, { confirmed: true, contextKey: plan2Cash.contextKey, choices: plan2Cash.choices });
    assert.equal(actor.system.currency.cp, 1300, "Currency remains 1300");

    await sClass.update({ "system.levels": 3 });

    // Adversarial: Pass startingEquipment items mode at level 3
    const plan3Items = await previewSpecialistProgression(actor, {
      startingEquipment: {
        mode: "items",
        choice1: "weapon-combat-knife-1",
        choice2: "weapon-shortsword-3"
      },
      hp: { 3: { mode: "fixed" } }
    });
    const startingEqItems = plan3Items.createItems.filter(i => i.flags?.ak5e?.specialistProgressionGrant?.kind === "startingEquipment");
    assert.equal(startingEqItems.length, 0, "No starting equipment created on level 3");
  });

  await record("Architecture Guards: Multiclass and invalid class level safety", async () => {
    // Non-specialist actor rejected by setup and progression
    const actorFighter = createActor(1);
    const sItem = Array.from(actorFighter.items.values()).find(i => i.name === "Specialist");
    actorFighter.items.delete(sItem.id);

    await assert.rejects(
      () => previewSpecialistSetup(actorFighter),
      /Choose an owned character with the Specialist class/
    );
    await assert.rejects(
      () => previewSpecialistProgression(actorFighter),
      /Choose an owned character with the Specialist class/
    );

    // Multiclass actor: profile blocked and specialistEnabled is false
    const actorMulti = createActor(1);
    const extraClass = createTestItem({
      name: "Fighter",
      type: "class",
      system: { levels: 1 }
    });
    actorMulti.items.set(extraClass.id, extraClass);

    const profile = specialistProfile(actorMulti);
    assert.equal(profile.applicable, true);
    assert.deepEqual(profile.blocked, ["MultipleClasses"]);
    assert.equal(profile.level, null);
    assert.equal(specialistEnabled(actorMulti), false, "specialistEnabled is false for multiclass actor");

    // specialistUses rejects multiclass actor
    const { specialistUses } = await import("../scripts/specialist-uses.mjs");
    assert.throws(
      () => specialistUses.plan(actorMulti, "markOfASpecialist", {}),
      /Mark of a Specialist requires the Specialist class/
    );

    // Invalid class level bounds
    assert.throws(() => checkLevel(0), RangeError);
    assert.throws(() => checkLevel(21), RangeError);
    assert.throws(() => checkLevel(-1), RangeError);
    assert.throws(() => checkLevel(1.5), RangeError);
    assert.throws(() => checkLevel("abc"), RangeError);
  });

  await record("Choice Validation: Deep ContextKey tampering permutations", async () => {
    const actor1 = createActor(1);
    const actor2 = createActor(1);

    const plan1 = await previewSpecialistProgression(actor1, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });

    const plan2 = await previewSpecialistProgression(actor2, {
      branch: "subclass-specialist-executor",
      saves: ["wis"],
      skills: ["acr", "slt", "ste"],
      weaponCategory: "melee",
      fightingStyle: "duelling",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    });

    // Replay attack: Use actor2's contextKey on actor1
    await assert.rejects(
      () => applySpecialistProgression(actor1, { confirmed: true, contextKey: plan2.contextKey, choices: plan1.choices }),
      /character changed since the preview/
    );

    // Substring tampering: replace level or choice in contextKey
    const tamperedKey = plan1.contextKey.replace(/"melee"/, '"ranged"');
    await assert.rejects(
      () => applySpecialistProgression(actor1, { confirmed: true, contextKey: tamperedKey, choices: plan1.choices }),
      /character changed since the preview/
    );
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================

  console.log("\n=== SUMMARY OF ADVERSARIAL STRESS HARNESS ===");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`Passed: ${passed}/${results.length}, Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    process.exit(1);
  }
}

await runAll();
