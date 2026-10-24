import assert from "node:assert/strict";
import {
  previewVanguardSetup, applyVanguardSetup, VANGUARD_CORE_FEATURES
} from "../scripts/vanguard-setup.mjs";
import {
  inspectVanguardFields, vanguardChoices, previewVanguardProgression, applyVanguardProgression,
  VANGUARD_PROGRESS_FLAG
} from "../scripts/vanguard-progression.mjs";
import { VANGUARD_CLASS_ID, VANGUARD_SKILLS, VANGUARD_SAVES, ASI_LEVELS } from "../scripts/vanguard-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "../test/base-classes-fixture.mjs";

console.log("Starting Adversarial Stress Harness for Vanguard...");

setupFoundryGlobals();

function createActor(level = 1, options = {}) {
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
        ak5ewilderness: { value: 0 },
        arc: { value: 0 },
        his: { value: 0 },
        rel: { value: 0 }
      },
      currency: { cp: 0 },
      ...options.system
    }
  });
  return actor;
}

const results = [];

function record(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === "function") {
      return res.then(
        () => {
          console.log(`[PASS] ${name}`);
          results.push({ name, status: "PASS" });
        },
        (err) => {
          console.log(`[FAIL] ${name}: ${err.message}`);
          results.push({ name, status: "FAIL", error: err.message });
        }
      );
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
    const p1 = await previewVanguardSetup(actor);
    const r1 = await applyVanguardSetup(actor, { confirmed: true, contextKey: p1.contextKey });
    const countAfterRun1 = actor.items.size;

    for (let i = 2; i <= 5; i++) {
      const p = await previewVanguardSetup(actor);
      assert.equal(p.creates.length, 0, `Run ${i} should have 0 creates`);
      const r = await applyVanguardSetup(actor, { confirmed: true, contextKey: p.contextKey });
      assert.equal(r.created.length, 0, `Run ${i} should create 0 items`);
      assert.equal(actor.items.size, countAfterRun1, `Item count grew on run ${i}: ${actor.items.size} vs ${countAfterRun1}`);
    }
  });

  // 1b. Setup Idempotency: Authored item retention
  await record("Setup Idempotency: Pre-populated authored item is preserved and not overwritten", async () => {
    const actor = createActor(1);
    const customDesc = "CUSTOM AUTHORED DESCRIPTION: MUST NEVER BE OVERWRITTEN";
    const customItem = createTestItem({
      name: "1st Level: Landstrider",
      type: "feat",
      system: { description: { value: customDesc } },
      flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-landstrider-2798", authored: true } }
    }, actor);
    actor.items.set(customItem.id, customItem);

    const prevCount = actor.items.size;
    const preview = await previewVanguardSetup(actor);
    assert.ok(preview.kept.includes("1st Level: Landstrider"), "Landstrider should be in kept");
    assert.ok(!preview.creates.some(c => c.name === "1st Level: Landstrider"), "Landstrider should not be created");

    await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
    const keptItem = actor.items.get(customItem.id);
    assert.ok(keptItem, "Custom item must still exist");
    assert.equal(keptItem.system.description.value, customDesc, "Custom description must be preserved");
  });

  // 2a. Incremental level up 1 -> 20
  await record("Progression: Incremental level-up 1 -> 20", async () => {
    const actor = createActor(1);
    // Base level 1 choices
    let baseChoices = {
      branch: "subclass-vanguard-agent",
      saves: ["str"],
      skills: ["acr", "ath", "ste"],
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };

    let p = await previewVanguardProgression(actor, baseChoices);
    await applyVanguardProgression(actor, { confirmed: true, contextKey: p.contextKey, choices: baseChoices });

    for (let lvl = 2; lvl <= 20; lvl++) {
      // update class level
      const vClass = Array.from(actor.items.values()).find(i => i.type === "class");
      await vClass.update({ "system.levels": lvl });

      const choices = vanguardChoices(actor);
      choices.hp[lvl] = { mode: "fixed" };
      if (ASI_LEVELS.includes(lvl)) {
        choices.asi[lvl] = { increases: [{ ability: "dex", amount: 2 }] };
      }
      if (lvl === 3) {
        choices.talents.basic = "class-option-vanguard-talent-basic-alacrity";
      }

      p = await previewVanguardProgression(actor, choices);
      assert.equal(p.pending.length, 0, `Level ${lvl} should have 0 pending`);
      await applyVanguardProgression(actor, { confirmed: true, contextKey: p.contextKey, choices });
    }

    assert.equal(actor.system.abilities.dex.value, 20, "DEX capped at 20 through ASIs");
    assert.ok(actor.system.attributes.hp.max > 100, "HP scaled properly to level 20");
  });

  // 2b. Re-run progression at level 20 with identical choices; HP and ASIs NOT double-counted
  await record("Progression Idempotency: Re-run at level 20 does not double-count HP or ASIs", async () => {
    const actor = createActor(20);
    // Initialize full choices
    const choices = {
      branch: "subclass-vanguard-charger",
      saves: ["cha"],
      skills: ["acr", "prc", "ste"],
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: {},
      asi: {},
      talents: {
        basic: "class-option-vanguard-talent-basic-alacrity"
      }
    };
    for (let l = 1; l <= 20; l++) choices.hp[l] = { mode: "fixed" };
    for (const l of ASI_LEVELS) choices.asi[l] = { increases: [{ ability: "dex", amount: 2 }] };

    const p1 = await previewVanguardProgression(actor, choices);
    await applyVanguardProgression(actor, { confirmed: true, contextKey: p1.contextKey, choices });

    const hpAfter1 = actor.system.attributes.hp.max;
    const strAfter1 = actor.system.abilities.str.value;
    const dexAfter1 = actor.system.abilities.dex.value;

    // Second run with vanguardChoices(actor)
    const secondChoices = vanguardChoices(actor);
    const p2 = await previewVanguardProgression(actor, secondChoices);
    assert.equal(p2.pending.length, 0);
    await applyVanguardProgression(actor, { confirmed: true, contextKey: p2.contextKey, choices: secondChoices });

    assert.equal(actor.system.attributes.hp.max, hpAfter1, "HP must not be double-counted");
    assert.equal(actor.system.abilities.dex.value, dexAfter1, "DEX must not be double-counted");
    assert.equal(actor.system.abilities.str.value, strAfter1, "STR must not be changed");
  });

  // 2c. Tampered contextKey rejected
  await record("Progression Invariant: Tampered contextKey is rejected", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["str"],
      skills: ["acr", "ath", "ste"],
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    let rejected = false;
    try {
      await applyVanguardProgression(actor, { confirmed: true, contextKey: "TAMPERED_HASH", choices });
    } catch (e) {
      rejected = true;
    }
    assert.ok(rejected, "Must reject tampered contextKey");
  });

  // 2d. Saving throw validation: attempting both STR and CHA instead of picking one alongside DEX
  await record("Progression Invariant: Attempting both STR and CHA saves is rejected or flagged", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["str", "cha"], // Invalid! Source says "Dexterity + one of your choice from the following: Strength, Charisma"
      skills: ["acr", "ath", "ste"],
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    // Did it reject or mark saves as pending? Or did it grant both?
    // Let's check:
    console.log("   DEBUG saves test: pending=", p.pending, "writes[traits.saves]=", p.writes["system.traits.saves.value"]);
    // In strict invariant check: saves must contain exactly 1 choice from [str, cha].
    // If pending does NOT include 'saves', or writes includes both str and cha, or it silently ignored the rule:
    const grantedSaves = p.writes["system.traits.saves.value"] ?? [];
    if (grantedSaves.includes("str") && grantedSaves.includes("cha")) {
      throw new Error("VIOLATION: Progression granted BOTH Strength and Charisma saves when only one choice is allowed!");
    }
    if (!p.pending.includes("saves") && choices.saves.length > 1) {
      throw new Error(`VIOLATION: choices.saves had length ${choices.saves.length} but was not flagged as pending/invalid`);
    }
  });

  // 2e. Saving throw validation: invalid saving throw choice (e.g. "int" or "wis")
  await record("Progression Invariant: Invalid saving throw choice (e.g. INT) is rejected", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["int"], // Invalid! Must be STR or CHA
      skills: ["acr", "ath", "ste"],
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    console.log("   DEBUG invalid save test: pending=", p.pending, "writes[traits.saves]=", p.writes["system.traits.saves.value"]);
    const grantedSaves = p.writes["system.traits.saves.value"] ?? [];
    if (grantedSaves.includes("int")) {
      throw new Error("VIOLATION: Progression granted INT save which is not on Vanguard saving throw list!");
    }
    if (!p.pending.includes("saves")) {
      throw new Error("VIOLATION: Invalid save ['int'] was not flagged as pending/invalid");
    }
  });

  // 2f. Skill count validation: < 3 skills
  await record("Progression Invariant: Skill count < 3 is flagged as pending/rejected", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["str"],
      skills: ["acr", "ath"], // Only 2 skills!
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    assert.ok(p.pending.includes("skills"), "Should have 'skills' in pending");
    let rejected = false;
    try {
      await applyVanguardProgression(actor, { confirmed: true, contextKey: p.contextKey, choices });
    } catch (e) {
      rejected = true;
    }
    assert.ok(rejected, "Must reject applying with < 3 skills");
  });

  // 2g. Skill count validation: > 3 skills
  await record("Progression Invariant: Skill count > 3 is flagged as pending/rejected", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["str"],
      skills: ["acr", "ath", "ste", "prc"], // 4 skills!
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    assert.ok(p.pending.includes("skills"), "Should have 'skills' in pending");
    let rejected = false;
    try {
      await applyVanguardProgression(actor, { confirmed: true, contextKey: p.contextKey, choices });
    } catch (e) {
      rejected = true;
    }
    assert.ok(rejected, "Must reject applying with > 3 skills");
  });

  // 2h. Skills not on the Vanguard list
  await record("Progression Invariant: Skills not on Vanguard list (e.g. Arcana, History, Religion) are rejected", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["str"],
      skills: ["arc", "his", "rel"], // NOT Vanguard skills! Vanguard skills: acr, ath, prc, per, ste, ak5ewilderness
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    console.log("   DEBUG invalid skills test: pending=", p.pending, "writes=", Object.keys(p.writes));
    if (p.writes["system.skills.arc.value"] || p.writes["system.skills.his.value"] || p.writes["system.skills.rel.value"]) {
      throw new Error("VIOLATION: Progression granted non-Vanguard skills (arc, his, rel)!");
    }
    if (!p.pending.includes("skills")) {
      throw new Error("VIOLATION: Non-Vanguard skills were not flagged as pending/invalid!");
    }
  });

  // 2i. Duplicate skills in choices (e.g. ["acr", "acr", "acr"])
  await record("Progression Invariant: Duplicate skills (e.g. ['acr', 'acr', 'acr']) are rejected", async () => {
    const actor = createActor(1);
    const choices = {
      branch: "subclass-vanguard-agent",
      saves: ["str"],
      skills: ["acr", "acr", "acr"],
      tool: "Messenger Kit",
      startingEquipment: { mode: "cash" },
      hp: { 1: { mode: "fixed" } }
    };
    const p = await previewVanguardProgression(actor, choices);
    console.log("   DEBUG duplicate skills test: pending=", p.pending);
    if (!p.pending.includes("skills")) {
      throw new Error("VIOLATION: Duplicate skills ['acr', 'acr', 'acr'] were not flagged as pending/invalid!");
    }
  });

  console.log("\n=== SUMMARY OF ADVERSARIAL STRESS HARNESS ===");
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`Passed: ${passed}/${results.length}, Failed: ${failed}/${results.length}`);
}

await runAll();
teardownFoundryGlobals();

// Additional edge cases:
await record("Progression Invariant: Rolled HP > 8 is rejected or clamped", async () => {
  const actor = createActor(2);
  const choices = {
    branch: "subclass-vanguard-agent",
    saves: ["str"],
    skills: ["acr", "ath", "ste"],
    tool: "Messenger Kit",
    startingEquipment: { mode: "cash" },
    hp: {
      1: { mode: "fixed" },
      2: { mode: "rolled", roll: 50 } // d8 cannot roll 50!
    }
  };
  const p = await previewVanguardProgression(actor, choices);
  const hpIncrease = p.writes["system.attributes.hp.max"] - actor.system.attributes.hp.max;
  console.log("   DEBUG rolled HP=50: hpIncrease=", hpIncrease);
  if (hpIncrease > (8 + 2 + 8 + 2)) { // max possible is (8+2) + (8+2) = 20
    throw new Error(`VIOLATION: Granted HP increase of ${hpIncrease} for a d8 roll of 50!`);
  }
});

await record("Progression Invariant: ASI increase > 2 is rejected or clamped", async () => {
  const actor = createActor(4);
  const choices = {
    branch: "subclass-vanguard-agent",
    saves: ["str"],
    skills: ["acr", "ath", "ste"],
    tool: "Messenger Kit",
    startingEquipment: { mode: "cash" },
    hp: { 1: { mode: "fixed" }, 2: { mode: "fixed" }, 3: { mode: "fixed" }, 4: { mode: "fixed" } },
    asi: {
      4: { increases: [{ ability: "dex", amount: 10 }] } // ASI can only be +2 or +1/+1
    }
  };
  const p = await previewVanguardProgression(actor, choices);
  const dexWrite = p.writes["system.abilities.dex.value"];
  console.log("   DEBUG ASI amount=10: dexWrite=", dexWrite, "initial=", actor.system.abilities.dex.value);
  if (dexWrite - actor.system.abilities.dex.value > 2) {
    throw new Error(`VIOLATION: Granted DEX increase of ${dexWrite - actor.system.abilities.dex.value} from a single ASI level!`);
  }
});
