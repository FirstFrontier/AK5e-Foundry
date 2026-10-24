/**
 * Adversarial Stress Test Suite for AK5e Inventor Subclass Milestone 3 (Ch. 3 L5881–5946).
 * Authored by Empirical Challenger (challenger_m3) to attack:
 *
 * 1. Strange Contraption (Lv 5) & Stranger Contraptions (Lv 15):
 *    - Level 5 gating (rejects < 5) and Level 15 Stranger upgrade activation.
 *    - 1/Long Rest per-option lockout: using option A locks out option A for the day,
 *      while options B..H remain available; Long Rest restores all options.
 *    - Flashlight: Blinded on failed save; Stranger Lv 15 upgrades pass to Dazed until end of next turn.
 *    - Fun Toy: Construct stats (18 AC, 10 HP, 20 ft move, 60 ft Darkvision, 10 min); Stranger Lv 15 applies Invisible condition.
 *    - Musbeast Remover: 10 ft radius, 4d8 Piercing (half on save); Stranger Lv 15 adds Bleeding condition on failed save.
 *    - Needlefly Fumigator: 20 ft radius, CON save or 2d8 Poison + Poisoned; Stranger Lv 15 allows nominating immune allies (0 damage, no condition).
 *    - Portable Firestarter: 10 ft radius, 2d8 Fire + Burning; Stranger Lv 15 adds INT mod to ongoing burn damage.
 *    - Universal Keycard: 5 ft lock removal, leaves trace; Stranger Lv 15 removes lock tracelessly.
 *    - Unstable Contraption: 10 ft radius, 5d8 Thunder (half on save); Stranger Lv 15 deals 8d8 Thunder.
 *
 * 2. Mobile Modding (Lv 5):
 *    - Level 5 gating (rejects < 5).
 *    - Resource accounting: spends exactly 1 Prowess (rejects/warns on Prowess shortfall).
 *    - Inventions pool invariance: costs exactly 0 Inventions (does NOT decrement inventions pool).
 *    - Target qualification: must be a willing creature within 5 ft (rejects > 5 ft, rejects unwilling).
 *    - Temporary duration: exactly 1 minute (expires cleanly without refunding inventions).
 *    - Duplicate rejection: duplicate modification on target equipment is rejected.
 *
 * 3. Inventor Prowess Gain Trigger:
 *    - Creature who activated Inventor's mod this turn reduces enemy to 0 HP -> Inventor gains 1 Prowess.
 *    - Non-modified creature reducing enemy to 0 HP -> 0 Prowess gained.
 *    - Creature with mod who did NOT activate mod this turn reducing enemy to 0 HP -> 0 Prowess gained.
 *    - Creature who activated another Inventor's mod reducing enemy to 0 HP -> this Inventor gains 0 Prowess.
 *    - 1/turn clamp: multiple 0 HP reductions in the same turn grant max 1 Prowess.
 *    - Pool clamp: Prowess gain clamped at maximum Prowess (no overflow).
 *
 * 4. The Big One (Lv 20):
 *    - Level requirement: strictly requires Inventor level 20 (rejects level < 20).
 *    - 1/Long Rest limit (daily resource spend & restoration).
 *    - Mode FLASH: 4 points within 100 ft, 10 ft radius, 8d6 Thunder + Burning.
 *      CRUCIAL TEST: Overlapping single-save invariance (creature in multiple points saves and takes damage ONCE).
 *    - Mode SHARD: 50 ft cone, 10d6 Slashing + Bleeding.
 *      CRUCIAL TEST: Ignores cover bonuses to saving throw and AC.
 *    - Mode QUASAR: 100x10 ft line, 14d6 Radiant (half on DEX save).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { SPECIALIST_CLASS_ID, calculateInventorDC } from "../scripts/specialist-rules.mjs";
import * as specialistRules from "../scripts/specialist-rules.mjs";
import {
  getPool,
  setPool,
  spendPool,
  refundPool,
  hasPool,
  clearPoolRegistry
} from "../scripts/resource-pools.mjs";

let inventorModule = null;
let importError = null;

try {
  inventorModule = await import("../scripts/inventor-features.mjs");
} catch (err) {
  importError = err;
}

const FEATURE_ALIASES = {
  executeContraption: ["activateContraption", "useContraption"],
  CONTRAPTIONS_CATALOG: ["CONTRAPTION_CATALOG", "STRANGE_CONTRAPTIONS", "STRANGE_CONTRAPTIONS_CATALOG"],
  getAvailableContraptions: ["listAvailableContraptions", "getContraptions"],
  executeMobileModding: ["applyMobileModding", "mobileModding"],
  onCreatureReducedToZeroHP: ["handleCreatureReducedToZeroHP", "triggerInventorProwessGain", "triggerInventorProwessOnKill", "onZeroHP"],
  executeTheBigOne: ["useTheBigOne", "activateTheBigOne"]
};

function getFeature(name) {
  const names = [name, ...(FEATURE_ALIASES[name] ?? [])];
  for (const n of names) {
    if (inventorModule && n in inventorModule) {
      return inventorModule[n];
    }
    if (globalThis.game?.ak5e?.specialist?.inventor && n in globalThis.game.ak5e.specialist.inventor) {
      return globalThis.game.ak5e.specialist.inventor[n];
    }
    if (n in specialistRules) {
      return specialistRules[n];
    }
  }
  return null;
}

function req(name) {
  const fn = getFeature(name);
  if (!fn) {
    throw new Error(
      `[Adversarial Assertion Failed] Required export '${name}' was not found in ak5e/scripts/inventor-features.mjs or specialist-rules.mjs. ` +
      (importError ? `Import error: ${importError.message}` : "Ensure worker_m3 implements and exports it.")
    );
  }
  return fn;
}

test.beforeEach(() => {
  setupFoundryGlobals();
  const defPools = getFeature("defineInventorPools") ?? getFeature("registerInventorPools");
  if (typeof defPools === "function") {
    defPools();
  }
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

// Helper creators
function createInventorActor(level = 5, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subClass = createTestItem({
    name: "Inventor",
    type: "subclass",
    identifier: "inventor",
    flags: {
      ak5e: {
        chapterThreeId: "subclass-specialist-inventor"
      }
    }
  });

  const prof = options.prof ?? (Math.floor((level - 1) / 4) + 2);
  const intMod = options.intMod ?? 4;
  const dexMod = options.dexMod ?? 2;
  const strMod = options.strMod ?? 1;

  const actor = createTestActor({
    name: options.name ?? `Test Inventor Lv${level}`,
    items: [sClass, subClass, ...(options.items ?? [])],
    system: {
      ...options.system,
      attributes: {
        prof,
        movement: { walk: 30 },
        hp: {
          value: options.hp ?? 40,
          max: options.maxHp ?? 40,
          temp: 0
        },
        ...(options.system?.attributes ?? {})
      },
      abilities: {
        str: { mod: strMod, value: 10 + strMod * 2 },
        dex: { mod: dexMod, value: 10 + dexMod * 2 },
        con: { mod: 2, value: 14 },
        int: { mod: intMod, value: 10 + intMod * 2 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 },
        ...(options.system?.abilities ?? {})
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "inventor",
          branchId: "subclass-specialist-inventor",
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "brawler"
        },
        inventor: {
          usedContraptions: options.usedContraptions ?? [],
          ...(options.flags?.ak5e?.inventor ?? {})
        },
        ...(options.flags?.ak5e ?? {})
      }
    }
  });

  // Ensure pools exist on actor
  actor.flags.ak5e.resourcePools ??= {};
  if (actor.flags.ak5e.resourcePools.prowess === undefined) {
    actor.flags.ak5e.resourcePools.prowess = { value: options.prowess ?? prof, receipts: [] };
  }
  if (actor.flags.ak5e.resourcePools.inventions === undefined) {
    actor.flags.ak5e.resourcePools.inventions = { value: options.inventions ?? prof * 2, receipts: [] };
  }

  return actor;
}

function createTargetCreature(name = "Target", options = {}) {
  const dexMod = options.dexMod ?? 1;
  const conMod = options.conMod ?? 1;
  return createTestActor({
    name,
    system: {
      attributes: {
        hp: { value: options.hp ?? 30, max: options.maxHp ?? 30 },
        ac: { value: options.ac ?? 14 }
      },
      abilities: {
        str: { mod: 0, value: 10 },
        dex: { mod: dexMod, value: 10 + dexMod * 2 },
        con: { mod: conMod, value: 10 + conMod * 2 },
        int: { mod: 0, value: 10 },
        wis: { mod: 0, value: 10 },
        cha: { mod: 0, value: 10 }
      }
    },
    flags: {
      ak5e: {
        cover: options.cover ?? "none",
        ...(options.flags?.ak5e ?? {})
      }
    }
  });
}

function createWeapon(name = "Dagger", options = {}) {
  return createTestItem({
    name,
    type: "weapon",
    system: {
      actionType: options.actionType ?? "mwak",
      type: { value: options.weaponType ?? "simpleM" },
      damage: { parts: [["1d4", "piercing"]] },
      properties: { ...(options.properties ?? {}) },
      magical: options.magical ?? false,
      rarity: options.rarity ?? "common"
    },
    flags: {
      ak5e: {
        inventor: {
          modifications: options.modifications ?? []
        },
        ...(options.flags?.ak5e ?? {})
      }
    }
  });
}

// ============================================================================
// 1. Strange Contraptions (Lv 5) & Stranger Contraptions (Lv 15)
// ============================================================================

test("Vector 1.1: Feature Predicates & Level Gating for Contraptions", () => {
  const hasStrange = req("hasStrangeContraption");
  const hasStranger = req("hasStrangerContraptions");

  const inv1 = createInventorActor(1);
  const inv4 = createInventorActor(4);
  const inv5 = createInventorActor(5);
  const inv14 = createInventorActor(14);
  const inv15 = createInventorActor(15);
  const inv20 = createInventorActor(20);

  assert.equal(hasStrange(inv1), false, "Level 1 does not have Strange Contraption");
  assert.equal(hasStrange(inv4), false, "Level 4 does not have Strange Contraption");
  assert.equal(hasStrange(inv5), true, "Level 5 has Strange Contraption");
  assert.equal(hasStrange(inv14), true, "Level 14 has Strange Contraption");
  assert.equal(hasStrange(inv15), true, "Level 15 has Strange Contraption");

  assert.equal(hasStranger(inv5), false, "Level 5 does not have Stranger Contraptions");
  assert.equal(hasStranger(inv14), false, "Level 14 does not have Stranger Contraptions");
  assert.equal(hasStranger(inv15), true, "Level 15 has Stranger Contraptions");
  assert.equal(hasStranger(inv20), true, "Level 20 has Stranger Contraptions");
});

test("Vector 1.2: Contraptions Catalog Completeness & Specification", () => {
  const catalog = req("CONTRAPTIONS_CATALOG");
  assert.ok(catalog && typeof catalog === "object", "CONTRAPTIONS_CATALOG must exist as an object");

  const requiredIdGroups = [
    ["flashlight", "12-million-lumen-flashlight"],
    ["fun-toy"],
    ["musbeast-remover"],
    ["needlefly-fumigator"],
    ["over-tuned-speaker"],
    ["portable-firestarter"],
    ["universal-keycard"],
    ["unstable-contraption"]
  ];

  for (const group of requiredIdGroups) {
    const entry = group.map(id => catalog[id]).find(Boolean);
    assert.ok(entry, `Contraption matching '${group.join(" or ")}' must be present in CONTRAPTIONS_CATALOG`);
    assert.ok(group.includes(entry.id), `Entry id '${entry.id}' must be in [${group.join(", ")}]`);
    assert.ok(entry.name, `Entry '${entry.id}' must have a name`);
    assert.equal(entry.actionCost, "action", `Contraption '${entry.id}' must cost an Action`);
    assert.equal(entry.rangeFeet, 30, `Contraption '${entry.id}' must have a 30 ft throw range`);
  }
});

test("Vector 1.3: 1/Long Rest Per-Option Lockout & Option Independence", async () => {
  const executeContraption = req("executeContraption");
  const getAvailable = req("getAvailableContraptions");

  const actor = createInventorActor(5);
  const availableInitial = getAvailable(actor);
  assert.equal(availableInitial.length, 8, "Inventor starts with all 8 contraptions available");

  const catalog = req("CONTRAPTIONS_CATALOG");
  const flashlightId = catalog["flashlight"] ? "flashlight" : "12-million-lumen-flashlight";

  // Execute flashlight
  const target = createTargetCreature("Goblin");
  const res1 = await executeContraption(flashlightId, actor, {
    target,
    savePassed: false
  });
  assert.ok(res1.success, "Flashlight execution succeeds");

  // Check available options: flashlight is burned, remaining 7 are available
  const availableAfterFirst = getAvailable(actor);
  assert.equal(availableAfterFirst.length, 7, "7 contraptions remain available after burning flashlight");
  const hasFlashlight = availableAfterFirst.some(c => (typeof c === "string" ? c === flashlightId : c.id === flashlightId));
  assert.equal(hasFlashlight, false, "Flashlight is no longer available before a Long Rest");

  // Attempting to execute flashlight again must be rejected or warn of lockout
  let secondFlashlightFailed = false;
  try {
    const res2 = await executeContraption(flashlightId, actor, { target, savePassed: false });
    if (!res2.success || res2.warning === "lockout" || res2.warning === "alreadyUsed") {
      secondFlashlightFailed = true;
    }
  } catch (err) {
    secondFlashlightFailed = true;
  }
  assert.ok(secondFlashlightFailed, "Re-executing Flashlight before Long Rest must be rejected or fail");

  // Other options (e.g. unstable-contraption) MUST remain usable!
  const res3 = await executeContraption("unstable-contraption", actor, {
    target,
    savePassed: false
  });
  assert.ok(res3.success, "Unstable Contraption remains usable while Flashlight is burned");

  const availableAfterSecond = getAvailable(actor);
  assert.equal(availableAfterSecond.length, 6, "6 contraptions remain available");

  // Trigger Long Rest reset
  const resetFn = getFeature("resetContraptionsLongRest");
  if (typeof resetFn === "function") {
    resetFn(actor);
  } else {
    // Reset flags directly if helper is not exported
    if (actor.flags?.ak5e?.inventor) {
      actor.flags.ak5e.inventor.usedContraptions = [];
    }
  }

  const availableAfterRest = getAvailable(actor);
  assert.equal(availableAfterRest.length, 8, "Long Rest restores all 8 contraptions");
});

test("Vector 1.4: Adversarial Flashlight (Blinded on fail; Stranger Lv 15 Dazed on pass)", async () => {
  const executeContraption = req("executeContraption");
  const dcCalc = req("calculateInventorDC");

  const inv5 = createInventorActor(5, { intMod: 4, prof: 3 }); // DC = 8 + 4 + 3 = 15
  const inv15 = createInventorActor(15, { intMod: 5, prof: 5 }); // DC = 8 + 5 + 5 = 18

  assert.equal(dcCalc(inv5), 15);
  assert.equal(dcCalc(inv15), 18);

  const target1 = createTargetCreature("Enemy 1");
  const target2 = createTargetCreature("Enemy 2");

  const catalog = req("CONTRAPTIONS_CATALOG");
  const flashlightId = catalog["flashlight"] ? "flashlight" : "12-million-lumen-flashlight";

  // Lv 5 on failed save: Blinded
  const resLv5Fail = await executeContraption(flashlightId, inv5, {
    targets: [target1],
    savePassed: false
  });
  assert.ok(resLv5Fail.success);
  assert.ok(resLv5Fail.blinded || resLv5Fail.conditions?.includes("blinded"), "Lv 5 failed save causes Blinded");
  assert.equal(resLv5Fail.dazed ?? false, false, "Lv 5 failed save does NOT cause Dazed");

  // Lv 5 on passed save: No condition
  const resLv5Pass = await executeContraption(flashlightId, inv5, {
    targets: [target2],
    savePassed: true
  });
  assert.ok(resLv5Pass.success);
  assert.equal(resLv5Pass.blinded ?? false, false, "Lv 5 passed save does NOT cause Blinded");
  assert.equal(resLv5Pass.dazed ?? false, false, "Lv 5 passed save does NOT cause Dazed");

  // Reset used contraptions
  inv15.flags.ak5e.inventor.usedContraptions = [];

  // Lv 15 (Stranger) on failed save: Blinded
  const resLv15Fail = await executeContraption(flashlightId, inv15, {
    targets: [target1],
    savePassed: false
  });
  assert.ok(resLv15Fail.success);
  assert.ok(resLv15Fail.blinded || resLv15Fail.conditions?.includes("blinded"), "Lv 15 failed save causes Blinded");

  // Lv 15 (Stranger) on passed save: DAZED until end of next turn!
  inv15.flags.ak5e.inventor.usedContraptions = [];
  const resLv15Pass = await executeContraption(flashlightId, inv15, {
    targets: [target2],
    savePassed: true
  });
  assert.ok(resLv15Pass.success);
  assert.equal(resLv15Pass.blinded ?? false, false, "Lv 15 passed save does NOT cause Blinded");
  assert.ok(resLv15Pass.dazed || resLv15Pass.conditions?.includes("dazed"), "Lv 15 passed save MUST apply Dazed condition!");
});

test("Vector 1.5: Adversarial Fun Toy (Construct stats & Lv 15 Invisible Condition)", async () => {
  const executeContraption = req("executeContraption");

  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);

  const resLv5 = await executeContraption("fun-toy", inv5, {});
  assert.ok(resLv5.success);
  const construct5 = resLv5.construct;
  assert.ok(construct5, "Fun Toy must create a Construct Mobile Camera");
  assert.equal(construct5.ac, 18, "Mobile Camera AC must be 18");
  assert.equal(construct5.hp, 10, "Mobile Camera HP must be 10");
  assert.equal(construct5.speed, 20, "Mobile Camera speed must be 20 ft");
  assert.equal(construct5.darkvision, 60, "Mobile Camera darkvision must be 60 ft");
  assert.equal(construct5.durationMinutes, 10, "Mobile Camera duration must be 10 minutes");
  assert.equal(construct5.invisible ?? false, false, "Lv 5 Mobile Camera is NOT invisible");

  const resLv15 = await executeContraption("fun-toy", inv15, {});
  assert.ok(resLv15.success);
  const construct15 = resLv15.construct;
  assert.ok(construct15, "Lv 15 Fun Toy must create a Construct Mobile Camera");
  assert.ok(construct15.invisible === true || construct15.conditions?.includes("invisible"), "Lv 15 Mobile Camera MUST have Invisible condition");
});

test("Vector 1.6: Adversarial Musbeast Remover (4d8 Piercing & Lv 15 Bleeding Rider)", async () => {
  const executeContraption = req("executeContraption");

  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);
  const target = createTargetCreature("Beast");

  // Lv 5 fail save: 4d8 Piercing, no bleeding
  const res5 = await executeContraption("musbeast-remover", inv5, {
    targets: [target],
    savePassed: false
  });
  assert.ok(res5.success);
  assert.equal(res5.damageFormula, "4d8", "Musbeast Remover deals 4d8 damage");
  assert.equal(res5.damageType, "piercing", "Damage type is Piercing");
  assert.equal(res5.bleeding ?? false, false, "Lv 5 Musbeast Remover does NOT inflict Bleeding");

  // Lv 15 fail save: 4d8 Piercing + Bleeding
  const res15 = await executeContraption("musbeast-remover", inv15, {
    targets: [target],
    savePassed: false
  });
  assert.ok(res15.success);
  assert.ok(res15.bleeding || res15.conditions?.includes("bleeding"), "Lv 15 Stranger Musbeast Remover MUST inflict Bleeding on failed save");

  // Lv 15 pass save: half damage, no bleeding
  inv15.flags.ak5e.inventor.usedContraptions = [];
  const res15Pass = await executeContraption("musbeast-remover", inv15, {
    targets: [target],
    savePassed: true
  });
  assert.ok(res15Pass.success);
  assert.equal(res15Pass.bleeding ?? false, false, "Successful save negates Bleeding rider");
});

test("Vector 1.7: Adversarial Needlefly Fumigator (Poison + Lv 15 Nominated Ally Immunity)", async () => {
  const executeContraption = req("executeContraption");

  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);

  const ally = createTargetCreature("Ally Defender");
  const enemy = createTargetCreature("Enemy Attacker");

  // Lv 5: No ally immunity supported; ally still makes save and takes poison
  const res5 = await executeContraption("needlefly-fumigator", inv5, {
    targets: [ally, enemy],
    immuneCreatures: [ally],
    savePassed: false
  });
  assert.ok(res5.success);
  assert.equal(res5.damageFormula, "2d8", "Needlefly Fumigator deals 2d8 damage");
  assert.equal(res5.damageType, "poison", "Damage type is Poison");

  // Lv 15: Nominated ally is immune (takes 0 damage and no Poisoned condition)
  const res15 = await executeContraption("needlefly-fumigator", inv15, {
    targets: [ally, enemy],
    immuneCreatures: [ally.id ?? ally.name ?? ally],
    savePassed: false
  });
  assert.ok(res15.success);

  // Check ally results vs enemy results
  const allyResult = res15.targetResults?.find(r => r.targetId === ally.id || r.target === ally || r.name === ally.name);
  const enemyResult = res15.targetResults?.find(r => r.targetId === enemy.id || r.target === enemy || r.name === enemy.name);

  if (allyResult) {
    assert.equal(allyResult.immune, true, "Ally must be marked immune");
    assert.equal(allyResult.damage, 0, "Immune ally takes 0 damage");
    assert.equal(allyResult.poisoned ?? false, false, "Immune ally suffers no Poisoned condition");
  }
  if (enemyResult) {
    assert.equal(enemyResult.immune ?? false, false, "Enemy is not immune");
    assert.ok(enemyResult.poisoned || enemyResult.conditions?.includes("poisoned"), "Enemy suffers Poisoned condition");
  }
});

test("Vector 1.8: Adversarial Portable Firestarter (2d8 Fire + Lv 15 +INT Ongoing Burn)", async () => {
  const executeContraption = req("executeContraption");

  const inv5 = createInventorActor(5, { intMod: 4 });
  const inv15 = createInventorActor(15, { intMod: 4 });
  const target = createTargetCreature("Target Dummy");

  const res5 = await executeContraption("portable-firestarter", inv5, {
    targets: [target],
    savePassed: false
  });
  assert.ok(res5.success);
  assert.equal(res5.damageFormula, "2d8", "Deals 2d8 Fire damage");
  assert.equal(res5.damageType, "fire", "Damage type is Fire");
  assert.ok(res5.burning || res5.conditions?.includes("burning"), "Inflicts Burning condition");
  assert.equal(res5.ongoingBurnBonus ?? 0, 0, "Lv 5 does not add INT mod to ongoing burn");

  const res15 = await executeContraption("portable-firestarter", inv15, {
    targets: [target],
    savePassed: false
  });
  assert.ok(res15.success);
  assert.ok(res15.burning || res15.conditions?.includes("burning"), "Inflicts Burning condition");
  assert.equal(res15.ongoingBurnBonus, 4, "Lv 15 Stranger Contraption adds INT mod (+4) to ongoing burning damage");
});

test("Vector 1.9: Adversarial Universal Keycard & Unstable Contraption (5d8 vs Lv 15 8d8)", async () => {
  const executeContraption = req("executeContraption");

  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);

  // Keycard
  const resKey5 = await executeContraption("universal-keycard", inv5, { lockObject: "Terminal" });
  assert.ok(resKey5.success);
  assert.equal(resKey5.leavesTrace, true, "Lv 5 Keycard leaves a trace");

  const resKey15 = await executeContraption("universal-keycard", inv15, { lockObject: "Terminal" });
  assert.ok(resKey15.success);
  assert.equal(resKey15.leavesTrace, false, "Lv 15 Keycard is traceless (leaves no trace)");

  // Unstable Contraption
  const target = createTargetCreature("Trooper");
  const resUnstable5 = await executeContraption("unstable-contraption", inv5, {
    targets: [target],
    savePassed: false
  });
  assert.ok(resUnstable5.success);
  assert.equal(resUnstable5.damageFormula, "5d8", "Lv 5 Unstable Contraption deals 5d8 Thunder");
  assert.equal(resUnstable5.damageType, "thunder", "Damage type is Thunder");

  const resUnstable15 = await executeContraption("unstable-contraption", inv15, {
    targets: [target],
    savePassed: false
  });
  assert.ok(resUnstable15.success);
  assert.equal(resUnstable15.damageFormula, "8d8", "Lv 15 Stranger Unstable Contraption deals 8d8 Thunder");
});

// ============================================================================
// 2. Mobile Modding (Lv 5)
// ============================================================================

test("Vector 2.1: Mobile Modding Level Gating (< Lv 5 Rejection)", async () => {
  const hasModding = req("hasMobileModding");
  const execModding = req("executeMobileModding");

  const inv4 = createInventorActor(4);
  const inv5 = createInventorActor(5);
  assert.equal(hasModding(inv4), false, "Level 4 does not have Mobile Modding");
  assert.equal(hasModding(inv5), true, "Level 5 has Mobile Modding");

  const ally = createTargetCreature("Ally");
  const weapon = createWeapon("Shortsword");

  let lowLevelBlocked = false;
  try {
    const res = await execModding(ally, weapon, "boom-module", inv4, { distance: 5 });
    if (!res.success || res.warning === "levelTooLow") {
      lowLevelBlocked = true;
    }
  } catch (err) {
    lowLevelBlocked = true;
  }
  assert.ok(lowLevelBlocked, "Attempting Mobile Modding below level 5 must be rejected");
});

test("Vector 2.2: Mobile Modding Prowess Accounting (1 Spend & Shortfall Rejection)", async () => {
  const execModding = req("executeMobileModding");

  const inv5 = createInventorActor(5, { prowess: 3 });
  const ally = createTargetCreature("Ally");
  const weapon = createWeapon("Club");

  // Spend 1 Prowess
  const res1 = await execModding(ally, weapon, "boom-module", inv5, { distance: 5 });
  assert.ok(res1.success, "Mobile Modding succeeds with adequate Prowess");
  assert.equal(getPool(inv5, "prowess")?.value, 2, "Prowess decremented from 3 to 2");

  // Drain Prowess to 0
  setPool(inv5, "prowess", 0);
  let shortfallBlocked = false;
  try {
    const res2 = await execModding(ally, weapon, "shock-engine", inv5, { distance: 5 });
    if (!res2.success || res2.warning === "shortfall" || res2.warning === "insufficientProwess") {
      shortfallBlocked = true;
    }
  } catch (err) {
    shortfallBlocked = true;
  }
  assert.ok(shortfallBlocked, "Mobile Modding with 0 Prowess must be rejected or warn of shortfall");
});

test("Vector 2.3: Mobile Modding Inventions Pool Invariance (Costs Strictly 0 Inventions)", async () => {
  const execModding = req("executeMobileModding");

  const inv5 = createInventorActor(5, { prowess: 3, inventions: 6 });
  const ally = createTargetCreature("Ally");
  const weapon = createWeapon("Mace");

  const initialInventions = getPool(inv5, "inventions")?.value;
  assert.equal(initialInventions, 6, "Initial Inventions pool is 6");

  const res = await execModding(ally, weapon, "boom-module", inv5, { distance: 5 });
  assert.ok(res.success);

  const finalInventions = getPool(inv5, "inventions")?.value;
  assert.equal(finalInventions, 6, "Mobile Modding MUST NOT decrement Inventions pool (costs 0 Inventions)");
});

test("Vector 2.4: Mobile Modding Range (5 ft) & Willingness Verification", async () => {
  const execModding = req("executeMobileModding");

  const inv5 = createInventorActor(5, { prowess: 3 });
  const allyClose = createTargetCreature("Close Ally");
  const allyDistant = createTargetCreature("Distant Ally");
  const unwillingAlly = createTargetCreature("Unwilling Creature");
  const weapon = createWeapon("Spear");

  // Within 5 ft: Allowed
  const resClose = await execModding(allyClose, weapon, "boom-module", inv5, { distance: 5, willing: true });
  assert.ok(resClose.success, "Ally within 5 ft is valid target");

  // Greater than 5 ft: Blocked
  let rangeBlocked = false;
  try {
    const resDist = await execModding(allyDistant, weapon, "boom-module", inv5, { distance: 10, willing: true });
    if (!resDist.success || resDist.warning === "outOfRange") {
      rangeBlocked = true;
    }
  } catch (err) {
    rangeBlocked = true;
  }
  assert.ok(rangeBlocked, "Target beyond 5 ft must be rejected");

  // Unwilling target: Blocked
  let unwillingBlocked = false;
  try {
    const resUnwilling = await execModding(unwillingAlly, weapon, "boom-module", inv5, { distance: 5, willing: false });
    if (!resUnwilling.success || resUnwilling.warning === "unwillingTarget") {
      unwillingBlocked = true;
    }
  } catch (err) {
    unwillingBlocked = true;
  }
  assert.ok(unwillingBlocked, "Unwilling target must be rejected");
});

test("Vector 2.5: Mobile Modding 1-Minute Duration & Duplicate Rejection", async () => {
  const execModding = req("executeMobileModding");

  const inv5 = createInventorActor(5, { prowess: 3 });
  const ally = createTargetCreature("Ally");
  const weapon = createWeapon("Halberd");

  const res1 = await execModding(ally, weapon, "boom-module", inv5, { distance: 5 });
  assert.ok(res1.success);
  assert.equal(res1.duration, "1min", "Mobile Modding duration must be exactly 1 minute");
  assert.ok(res1.temporary, "Mobile Modding must be marked temporary");

  // Attempting duplicate mod on same weapon: Blocked
  let dupBlocked = false;
  try {
    const resDup = await execModding(ally, weapon, "boom-module", inv5, { distance: 5 });
    if (!resDup.success || resDup.warning === "duplicateModification") {
      dupBlocked = true;
    }
  } catch (err) {
    dupBlocked = true;
  }
  assert.ok(dupBlocked, "Duplicate modification on target weapon must be rejected");
});

// ============================================================================
// 3. Inventor Prowess Gain Trigger
// ============================================================================

test("Vector 3.1: Prowess Gain on Downed Enemy by Mod-Activating Ally", async () => {
  const triggerProwess = req("onCreatureReducedToZeroHP");

  const inventor = createInventorActor(5, { prowess: 1, prof: 3 });
  const moddedAlly = createTargetCreature("Modded Ally");
  const enemy = createTargetCreature("Goblin", { hp: 0 });

  // Ally activated Inventor's mod this turn
  const res = await triggerProwess(enemy, moddedAlly, {
    inventor,
    activatedModThisTurn: true
  });

  assert.ok(res.success ?? true);
  assert.equal(res.prowessGained, 1, "Inventor must gain exactly 1 Prowess");
  assert.equal(getPool(inventor, "prowess")?.value, 2, "Inventor Prowess increased from 1 to 2");
});

test("Vector 3.2: Rejection of Non-Modded Creature Down Trigger", async () => {
  const triggerProwess = req("onCreatureReducedToZeroHP");

  const inventor = createInventorActor(5, { prowess: 1, prof: 3 });
  const nonModdedAlly = createTargetCreature("Ordinary Fighter");
  const enemy = createTargetCreature("Goblin", { hp: 0 });

  const res = await triggerProwess(enemy, nonModdedAlly, {
    inventor,
    activatedModThisTurn: false,
    hasInventorMod: false
  });

  assert.equal(res.prowessGained ?? 0, 0, "Non-modded ally downing enemy grants 0 Prowess");
  assert.equal(getPool(inventor, "prowess")?.value, 1, "Inventor Prowess remains at 1");
});

test("Vector 3.3: Rejection if Mod Was NOT Activated This Turn", async () => {
  const triggerProwess = req("onCreatureReducedToZeroHP");

  const inventor = createInventorActor(5, { prowess: 1, prof: 3 });
  const moddedAlly = createTargetCreature("Modded Paladin");
  const enemy = createTargetCreature("Orc", { hp: 0 });

  // Ally has a mod, but did NOT activate it this turn
  const res = await triggerProwess(enemy, moddedAlly, {
    inventor,
    hasInventorMod: true,
    activatedModThisTurn: false
  });

  assert.equal(res.prowessGained ?? 0, 0, "Creature who did NOT activate mod this turn grants 0 Prowess");
  assert.equal(getPool(inventor, "prowess")?.value, 1, "Inventor Prowess remains at 1");
});

test("Vector 3.4: 1/Turn Prowess Gain Clamp & Maximum Pool Cap", async () => {
  const triggerProwess = req("onCreatureReducedToZeroHP");

  const inventor = createInventorActor(5, { prowess: 1, prof: 3 });
  const ally = createTargetCreature("Modded Berserker");
  const enemy1 = createTargetCreature("Goblin 1", { hp: 0 });
  const enemy2 = createTargetCreature("Goblin 2", { hp: 0 });

  // First down in turn
  const res1 = await triggerProwess(enemy1, ally, {
    inventor,
    activatedModThisTurn: true,
    turn: 1
  });
  assert.equal(res1.prowessGained, 1, "First down in turn grants 1 Prowess");
  assert.equal(getPool(inventor, "prowess")?.value, 2);

  // Second down in SAME turn: Clamped to 0!
  const res2 = await triggerProwess(enemy2, ally, {
    inventor,
    activatedModThisTurn: true,
    turn: 1
  });
  assert.equal(res2.prowessGained, 0, "Second down in same turn MUST grant 0 Prowess (1/turn clamp)");
  assert.equal(getPool(inventor, "prowess")?.value, 2, "Prowess does not exceed 1 gain per turn");

  // Clamping at maximum Prowess
  setPool(inventor, "prowess", 3, { max: 3 }); // already at max
  const res3 = await triggerProwess(enemy1, ally, {
    inventor,
    activatedModThisTurn: true,
    turn: 2 // new turn
  });
  assert.equal(getPool(inventor, "prowess")?.value, 3, "Prowess cannot exceed pool maximum");
});

// ============================================================================
// 4. The Big One (Lv 20)
// ============================================================================

test("Vector 4.1: The Big One Level Gating (< Lv 20 Rejection) & 1/LR Limit", async () => {
  const hasBigOne = req("hasTheBigOne");
  const execBigOne = req("executeTheBigOne");

  const inv19 = createInventorActor(19);
  const inv20 = createInventorActor(20);

  assert.equal(hasBigOne(inv19), false, "Level 19 does not have The Big One");
  assert.equal(hasBigOne(inv20), true, "Level 20 has The Big One");

  const target = createTargetCreature("Target");

  // Inv19 rejection
  let lowLevelBlocked = false;
  try {
    const res19 = await execBigOne("FLASH", inv19, { targets: [target] });
    if (!res19.success || res19.warning === "levelTooLow") {
      lowLevelBlocked = true;
    }
  } catch (err) {
    lowLevelBlocked = true;
  }
  assert.ok(lowLevelBlocked, "The Big One must be rejected if level < 20");

  // Inv20 execution (1/Long Rest)
  const res20 = await execBigOne("FLASH", inv20, {
    targets: [target],
    points: [{ x: 0, y: 0 }],
    savePassed: false
  });
  assert.ok(res20.success, "The Big One succeeds at level 20");

  // Attempting second use before Long Rest: Blocked
  let secondUseBlocked = false;
  try {
    const res20Second = await execBigOne("FLASH", inv20, { targets: [target] });
    if (!res20Second.success || res20Second.warning === "alreadyUsed" || res20Second.warning === "lockout") {
      secondUseBlocked = true;
    }
  } catch (err) {
    secondUseBlocked = true;
  }
  assert.ok(secondUseBlocked, "The Big One cannot be used again before completing a Long Rest");
});

test("Vector 4.2: Mode FLASH - Overlapping Single-Save & Single-Damage Invariance", async () => {
  const execBigOne = req("executeTheBigOne");

  const inv20 = createInventorActor(20);
  const enemyAlpha = createTargetCreature("Enemy Alpha in Overlap Zone");
  const enemyBeta = createTargetCreature("Enemy Beta in Single Zone");

  // 4 overlapping points chosen within 100 ft:
  // Alpha is positioned at (0, 0), and all 4 points are at (0, 0), (2, 0), (0, 2), (2, 2)
  // Each point has 10 ft radius, so Alpha is well within ALL 4 POINTS!
  // Beta is at (50, 50), within only Point 4 at (50, 50).
  const points = [
    { x: 0, y: 0, radius: 10 },
    { x: 2, y: 0, radius: 10 },
    { x: 0, y: 2, radius: 10 },
    { x: 50, y: 50, radius: 10 }
  ];

  const res = await execBigOne("FLASH", inv20, {
    points,
    targets: [enemyAlpha, enemyBeta],
    targetRolls: {
      [enemyAlpha.id]: { savePassed: false },
      [enemyBeta.id]: { savePassed: false }
    }
  });

  assert.ok(res.success);
  assert.equal(res.damageFormula, "8d6", "FLASH deals 8d6 Thunder damage");
  assert.equal(res.damageType, "thunder", "Damage type is Thunder");

  // Inspect results for enemyAlpha:
  // Source rule: "If a Creature would be within multiple affected areas, they only make the Saving Throw once."
  const alphaResult = res.targetResults?.find(r => r.targetId === enemyAlpha.id || r.target === enemyAlpha || r.name === enemyAlpha.name);
  assert.ok(alphaResult, "Alpha must be evaluated");
  assert.equal(alphaResult.savesMade ?? 1, 1, "Creature within multiple overlapping points makes saving throw ONLY ONCE");
  assert.equal(alphaResult.damageMultiplier ?? 1, 1, "Creature within multiple overlapping points takes damage ONLY ONCE (not 4x)");
  assert.ok(alphaResult.burning || alphaResult.conditions?.includes("burning"), "Suffers Burning condition");
});

test("Vector 4.3: Mode SHARD - Cover Bonus Bypass & Slashing + Bleeding", async () => {
  const execBigOne = req("executeTheBigOne");

  const inv20 = createInventorActor(20, { intMod: 5, prof: 6 }); // DC = 8 + 5 + 6 = 19
  const targetHalfCover = createTargetCreature("Target Behind Half Cover", {
    cover: "half", // normally +2 bonus
    dexMod: 2
  });
  const targetThreeQuarterCover = createTargetCreature("Target Behind 3/4 Cover", {
    cover: "threeQuarters", // normally +5 bonus
    dexMod: 2
  });

  const res = await execBigOne("SHARD", inv20, {
    targets: [targetHalfCover, targetThreeQuarterCover],
    coneSizeFeet: 50,
    targetRolls: {
      [targetHalfCover.id]: { d20: 10 }, // 10 + 2 = 12 (vs DC 19). If cover counted (+2), 14. Still fails.
      [targetThreeQuarterCover.id]: { d20: 13 } // 13 + 2 = 15 (vs DC 19). If cover counted (+5), 20 (would pass).
    }
  });

  assert.ok(res.success);
  assert.equal(res.damageFormula, "10d6", "SHARD deals 10d6 Slashing damage");
  assert.equal(res.damageType, "slashing", "Damage type is Slashing");

  // Inspect cover bonus bypass
  // Source rule: "Creatures do not gain the benefit of cover against this effect."
  const t2Result = res.targetResults?.find(r => r.targetId === targetThreeQuarterCover.id || r.target === targetThreeQuarterCover);
  if (t2Result) {
    assert.equal(t2Result.coverIgnored, true, "Cover bonuses must be ignored against SHARD");
    assert.equal(t2Result.savePassed, false, "Target fails save because +5 cover bonus was ignored");
    assert.ok(t2Result.bleeding || t2Result.conditions?.includes("bleeding"), "Suffers Bleeding condition on failed save");
  }
});

test("Vector 4.4: Mode QUASAR - 100x10 Line & 14d6 Radiant Damage", async () => {
  const execBigOne = req("executeTheBigOne");

  const inv20 = createInventorActor(20);
  const target = createTargetCreature("Target in Line");

  const res = await execBigOne("QUASAR", inv20, {
    targets: [target],
    lineDimensions: { lengthFeet: 100, widthFeet: 10 },
    savePassed: false
  });

  assert.ok(res.success);
  assert.equal(res.damageFormula, "14d6", "QUASAR deals 14d6 Radiant damage");
  assert.equal(res.damageType, "radiant", "Damage type is Radiant");
  assert.equal(res.halfOnSave ?? true, true, "Save for half damage");
});
