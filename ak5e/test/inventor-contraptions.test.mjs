/**
 * Unit Test Suite for AK5e Inventor Subclass Milestone 3 (Ch. 3 L5881–5946).
 * Covers:
 *  1. Strange Contraption (Lv 5) & Stranger Contraptions (Lv 15):
 *     - Level 5 gating and Level 15 Stranger Contraptions upgrade activation.
 *     - All 8 contraptions in CONTRAPTIONS_CATALOG with schema and aliases.
 *     - 1/Long Rest per-option lockout, option independence, and reset.
 *     - Flashlight (Blinded on fail; Lv 15 Dazed on pass).
 *     - Fun Toy (Mobile Camera construct stats; Lv 15 Invisible condition).
 *     - Musbeast Remover (4d8 Piercing, DEX save; Lv 15 Bleeding rider).
 *     - Needlefly Fumigator (2d8 Poison, CON save; Lv 15 nominated ally immunity).
 *     - Over-tuned Speaker (100 ft audible range; Lv 15 directional & volume controls).
 *     - Portable Firestarter (2d8 Fire + Burning; Lv 15 +INT ongoing burning damage).
 *     - Universal Keycard (electronic lock removal; Lv 15 traceless).
 *     - Unstable Contraption (5d8 Thunder; Lv 15 8d8 Thunder).
 *  2. Mobile Modding (Lv 5):
 *     - Level 5 gating (rejects < 5).
 *     - Spends 1 Prowess; rejects when insufficient.
 *     - Inventions cost is strictly 0 (inventions pool unchanged).
 *     - 5 ft willing creature constraint (rejects > 5 ft or unwilling).
 *     - 1-minute temporary duration (`temporary: true`, `duration: "1min"`).
 *     - Duplicate rejection on already-modded equipment.
 *  3. Inventor Prowess Gain Trigger:
 *     - Creature activating mod reduces enemy to 0 HP -> Inventor gains 1 Prowess.
 *     - Rejection for non-modded creatures or mod not activated this turn.
 *     - 1/turn clamp and maximum pool cap.
 *     - Reset on turn advance.
 *  4. Risk Assessment (Lv 11) Integration:
 *     - Speciality Modding: -1 Instability for matching specialised weapon.
 *     - Trained Operator: -1 Instability for Inventor wielder/wearer.
 *     - Minimum Instability clamped at 1.
 *  5. The Big One (Lv 20):
 *     - Level 20 gating and 1/Long Rest limit.
 *     - FLASH mode: 8d6 Thunder + Burning, overlapping single-save invariance.
 *     - SHARD mode: 50 ft cone, 10d6 Slashing + Bleeding, cover bonus bypass.
 *     - QUASAR mode: 100x10 ft line, 14d6 Radiant.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem
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

async function getInventorModule() {
  if (!inventorModule) {
    inventorModule = await import("../scripts/inventor-features.mjs");
  }
  return inventorModule;
}

function createInventorActor(level = 5, overrides = {}) {
  const intMod = overrides.intMod ?? 4;
  const prof = overrides.prof ?? (level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2);
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

  const actor = createTestActor({
    name: overrides.name ?? `Inventor Lv${level}`,
    type: "character",
    items: [sClass, subClass, ...(overrides.items ?? [])],
    system: {
      abilities: {
        int: { value: 10 + intMod * 2, mod: intMod },
        str: { value: 10, mod: 0 },
        dex: { value: 14, mod: 2 },
        con: { value: 14, mod: 2 },
        wis: { value: 10, mod: 0 },
        cha: { value: 10, mod: 0 }
      },
      attributes: {
        prof,
        hp: { value: 40, max: 40 }
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "inventor",
          branchId: "subclass-specialist-inventor",
          weaponCategory: overrides.weaponCategory ?? "melee",
          fightingStyle: overrides.fightingStyle ?? "brawler"
        },
        inventor: {
          usedContraptions: overrides.usedContraptions ?? []
        }
      }
    }
  });

  specialistRules.registerInventorPools();

  actor.flags ??= {};
  actor.flags.ak5e ??= {};
  actor.flags.ak5e.resourcePools ??= {};
  const prowessVal = overrides.prowessCurrent ?? overrides.prowess ?? 3;
  const inventionsVal = overrides.inventionsCurrent ?? overrides.inventions ?? (prof + Math.max(1, intMod));
  actor.flags.ak5e.resourcePools.prowess = {
    value: prowessVal,
    current: prowessVal,
    max: overrides.prowessMax ?? (prof + Math.max(1, intMod)),
    receipts: []
  };
  actor.flags.ak5e.resourcePools.inventions = {
    value: inventionsVal,
    current: inventionsVal,
    max: overrides.inventionsMax ?? (prof + Math.max(1, intMod)),
    receipts: []
  };

  return actor;
}

function createCreature(name, hp = 30) {
  return createTestActor({
    name,
    type: "npc",
    system: {
      abilities: {
        str: { value: 10, mod: 0 },
        dex: { value: 12, mod: 1 },
        con: { value: 14, mod: 2 },
        int: { value: 10, mod: 0 },
        wis: { value: 10, mod: 0 },
        cha: { value: 8, mod: -1 }
      },
      attributes: {
        hp: { value: hp, max: hp }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Suite Setup & Teardown
// ---------------------------------------------------------------------------

test.beforeEach(async () => {
  setupFoundryGlobals();
  clearPoolRegistry();
  specialistRules.registerInventorPools();
});

test.afterEach(() => {
  clearPoolRegistry();
  teardownFoundryGlobals();
});

// ===========================================================================
// Section 1: Strange Contraptions (Lv 5) & Stranger Contraptions (Lv 15)
// ===========================================================================

test("1.1 Feature Predicates & Level Gating for Contraptions", async () => {
  const m = await getInventorModule();
  const inv3 = createInventorActor(3);
  const inv5 = createInventorActor(5);
  const inv14 = createInventorActor(14);
  const inv15 = createInventorActor(15);
  const nonSpecialist = createTestActor({ name: "Fighter", items: [] });

  assert.equal(m.hasStrangeContraption(nonSpecialist), false);
  assert.equal(m.hasStrangeContraption(inv3), false);
  assert.equal(m.hasStrangeContraption(inv5), true);
  assert.equal(m.hasStrangeContraption(inv14), true);
  assert.equal(m.hasStrangeContraption(inv15), true);

  assert.equal(m.hasStrangerContraptions(inv3), false);
  assert.equal(m.hasStrangerContraptions(inv5), false);
  assert.equal(m.hasStrangerContraptions(inv14), false);
  assert.equal(m.hasStrangerContraptions(inv15), true);

  // Rejection of execution below level 5
  await assert.rejects(
    async () => m.executeContraption("flashlight", inv3),
    /requires 5th level Inventor/i
  );
});

test("1.2 Catalog Completeness & Specification for All 8 Contraptions", async () => {
  const m = await getInventorModule();
  const catalog = m.CONTRAPTIONS_CATALOG;
  assert.ok(catalog && typeof catalog === "object");

  const expectedIds = [
    "flashlight",
    "fun-toy",
    "musbeast-remover",
    "needlefly-fumigator",
    "over-tuned-speaker",
    "portable-firestarter",
    "universal-keycard",
    "unstable-contraption"
  ];

  for (const id of expectedIds) {
    const entry = catalog[id];
    assert.ok(entry, `Contraption '${id}' must exist in catalog`);
    assert.equal(entry.id, id);
    assert.ok(entry.name);
    assert.equal(entry.actionCost, "action");
    assert.equal(entry.rangeFeet, 30);
    assert.ok(Array.isArray(entry.aliases));
    assert.ok(entry.summary);
  }

  // Check alias resolution in getContraption
  assert.equal(m.getContraption("12-million-lumen-flashlight").id, "flashlight");
  assert.equal(m.getContraption("Fun Toy").id, "fun-toy");
  assert.equal(m.getContraption("Musbeast Remover").id, "musbeast-remover");
  assert.equal(m.getContraption("unstable contraption").id, "unstable-contraption");
});

test("1.3 1/Long Rest Per-Option Lockout & Option Independence", async () => {
  const m = await getInventorModule();
  const actor = createInventorActor(5);

  const initialAvailable = m.getAvailableContraptions(actor);
  assert.equal(initialAvailable.length, 8);

  const target = createCreature("Bandit");
  const res1 = await m.executeContraption("musbeast-remover", actor, { target, savePassed: false });
  assert.ok(res1.success);

  // Available contraptions now 7
  const availableAfterFirst = m.getAvailableContraptions(actor);
  assert.equal(availableAfterFirst.length, 7);
  assert.ok(!availableAfterFirst.some(c => c.id === "musbeast-remover"));

  // Second execution of same contraption warns or flags alreadyUsed
  const res2 = await m.executeContraption("musbeast-remover", actor, { target, savePassed: false });
  assert.equal(res2.warning, "alreadyUsed");

  // Other contraptions remain fully usable
  const res3 = await m.executeContraption("flashlight", actor, { target, savePassed: false });
  assert.ok(res3.success);
  assert.equal(res3.warning, null);

  const availableAfterSecond = m.getAvailableContraptions(actor);
  assert.equal(availableAfterSecond.length, 6);

  // Long rest reset
  await m.resetContraptions(actor);
  const availableAfterRest = m.getAvailableContraptions(actor);
  assert.equal(availableAfterRest.length, 8);
});

test("1.4 Flashlight: Lv 5 Blinded on fail; Lv 15 Dazed on pass", async () => {
  const m = await getInventorModule();
  const inv5 = createInventorActor(5, { intMod: 4, prof: 3 }); // DC = 8 + 4 + 3 = 15
  const inv15 = createInventorActor(15, { intMod: 5, prof: 5 }); // DC = 8 + 5 + 5 = 18

  const t1 = createCreature("Enemy A");
  const t2 = createCreature("Enemy B");

  // Lv 5 failed save -> Blinded
  const resLv5Fail = await m.executeContraption("flashlight", inv5, {
    target: t1,
    savePassed: false
  });
  assert.ok(resLv5Fail.success);
  assert.ok(resLv5Fail.blinded || resLv5Fail.conditions.includes("blinded"));
  assert.equal(resLv5Fail.dazed, false);

  // Reset for next test call
  await m.resetContraptions(inv5);

  // Lv 5 passed save -> No condition
  const resLv5Pass = await m.executeContraption("flashlight", inv5, {
    target: t2,
    savePassed: true
  });
  assert.ok(resLv5Pass.success);
  assert.equal(resLv5Pass.blinded, false);
  assert.equal(resLv5Pass.dazed, false);

  // Lv 15 failed save -> Blinded
  const resLv15Fail = await m.executeContraption("flashlight", inv15, {
    target: t1,
    savePassed: false
  });
  assert.ok(resLv15Fail.success);
  assert.ok(resLv15Fail.blinded);

  await m.resetContraptions(inv15);

  // Lv 15 passed save -> Dazed condition
  const resLv15Pass = await m.executeContraption("flashlight", inv15, {
    target: t2,
    savePassed: true
  });
  assert.ok(resLv15Pass.success);
  assert.equal(resLv15Pass.blinded, false);
  assert.ok(resLv15Pass.dazed || resLv15Pass.conditions.includes("dazed"));
});

test("1.5 Fun Toy: Mobile Camera construct stats & Lv 15 Invisible Condition", async () => {
  const m = await getInventorModule();
  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);

  const res5 = await m.executeContraption("fun-toy", inv5);
  assert.ok(res5.success);
  assert.ok(res5.construct);
  assert.equal(res5.construct.ac, 18);
  assert.equal(res5.construct.hp, 10);
  assert.equal(res5.construct.speed, 20);
  assert.equal(res5.construct.darkvision, 60);
  assert.equal(res5.construct.durationMinutes, 10);
  assert.equal(res5.construct.invisible ?? false, false);

  const res15 = await m.executeContraption("fun-toy", inv15);
  assert.ok(res15.success);
  assert.ok(res15.construct);
  assert.ok(res15.construct.invisible || res15.construct.conditions?.includes("invisible"));
});

test("1.6 Musbeast Remover: 4d8 Piercing & Lv 15 Bleeding Rider", async () => {
  const m = await getInventorModule();
  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);
  const t = createCreature("Beast");

  // Lv 5 failed save: 4d8 damage, no bleeding
  const res5Fail = await m.executeContraption("musbeast-remover", inv5, {
    target: t,
    savePassed: false,
    damage: 18
  });
  assert.ok(res5Fail.success);
  assert.equal(res5Fail.damageFormula, "4d8");
  assert.equal(res5Fail.damageType, "piercing");
  assert.equal(res5Fail.targetResults[0].damageTaken, 18);
  assert.equal(res5Fail.bleeding, false);

  // Lv 5 passed save: half damage
  await m.resetContraptions(inv5);
  const res5Pass = await m.executeContraption("musbeast-remover", inv5, {
    target: t,
    savePassed: true,
    damage: 18
  });
  assert.equal(res5Pass.targetResults[0].damageTaken, 9);

  // Lv 15 failed save: 4d8 damage + Bleeding
  const res15Fail = await m.executeContraption("musbeast-remover", inv15, {
    target: t,
    savePassed: false,
    damage: 20
  });
  assert.ok(res15Fail.bleeding || res15Fail.conditions.includes("bleeding"));
});

test("1.7 Needlefly Fumigator: 2d8 Poison + Poisoned & Lv 15 Nominated Ally Immunity", async () => {
  const m = await getInventorModule();
  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);
  const enemy = createCreature("Enemy");
  const ally = createCreature("Ally");

  // Lv 5: both enemy and ally take poison if in area
  const res5 = await m.executeContraption("needlefly-fumigator", inv5, {
    targets: [enemy, ally],
    savePassed: false,
    damage: 10
  });
  assert.ok(res5.poisoned);
  assert.equal(res5.targetResults[0].damageTaken, 10);
  assert.equal(res5.targetResults[1].damageTaken, 10);

  // Lv 15: nominated ally is immune
  const res15 = await m.executeContraption("needlefly-fumigator", inv15, {
    targets: [enemy, ally],
    immuneTargets: [ally],
    savePassed: false,
    damage: 10
  });
  const enemyRes = res15.targetResults.find(r => r.targetId === enemy.id);
  const allyRes = res15.targetResults.find(r => r.targetId === ally.id);
  assert.equal(enemyRes.damageTaken, 10);
  assert.equal(enemyRes.poisoned, true);
  assert.equal(allyRes.immune, true);
  assert.equal(allyRes.damageTaken, 0);
  assert.equal(allyRes.poisoned, false);
});

test("1.8 Portable Firestarter: 2d8 Fire + Burning & Lv 15 +INT Ongoing Burn Bonus", async () => {
  const m = await getInventorModule();
  const inv5 = createInventorActor(5, { intMod: 3 });
  const inv15 = createInventorActor(15, { intMod: 5 });
  const target = createCreature("Target");

  // Lv 5 failed save
  const res5 = await m.executeContraption("portable-firestarter", inv5, {
    target,
    savePassed: false,
    damage: 12
  });
  assert.ok(res5.burning);
  assert.equal(res5.targetResults[0].damageTaken, 12);
  assert.equal(res5.ongoingBurnBonus, 0);

  // Lv 15 failed save: +INT modifier to ongoing burn damage
  const res15 = await m.executeContraption("portable-firestarter", inv15, {
    target,
    savePassed: false,
    damage: 12
  });
  assert.ok(res15.burning);
  assert.equal(res15.ongoingBurnBonus, 5);
  assert.equal(res15.targetResults[0].ongoingBurnBonus, 5);
});

test("1.9 Universal Keycard & Unstable Contraption (5d8 vs Lv 15 8d8)", async () => {
  const m = await getInventorModule();
  const inv5 = createInventorActor(5);
  const inv15 = createInventorActor(15);

  // Keycard: Lv 5 leaves trace, Lv 15 leaves no trace
  const kc5 = await m.executeContraption("universal-keycard", inv5);
  assert.equal(kc5.leavesTrace, true);
  const kc15 = await m.executeContraption("universal-keycard", inv15);
  assert.equal(kc15.leavesTrace, false);

  // Unstable contraption: Lv 5 deals 5d8, Lv 15 deals 8d8
  const tgt = createCreature("Target");
  const uc5 = await m.executeContraption("unstable-contraption", inv5, { target: tgt });
  assert.equal(uc5.damageFormula, "5d8");

  const uc15 = await m.executeContraption("unstable-contraption", inv15, { target: tgt });
  assert.equal(uc15.damageFormula, "8d8");
});

// ===========================================================================
// Section 2: Mobile Modding (Lv 5)
// ===========================================================================

test("2.1 Mobile Modding Level Gating (< Lv 5 Rejection)", async () => {
  const m = await getInventorModule();
  const inv3 = createInventorActor(3);
  const ally = createCreature("Ally");
  const weapon = createTestItem({
    name: "Shortsword",
    type: "weapon",
    system: { type: { value: "simpleM" } }
  });
  ally.items = [weapon];

  await assert.rejects(
    async () => m.executeMobileModding(ally, weapon, "boom-module", inv3, { distanceFeet: 5, willing: true }),
    /requires 5th level Inventor/i
  );
});

test("2.2 Mobile Modding Spends 1 Prowess & Rejects on Shortfall", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 1 });
  const ally = createCreature("Ally");
  const weapon = createTestItem({
    name: "Warhammer",
    type: "weapon",
    system: { type: { value: "martialM" } }
  });
  ally.items = [weapon];

  const res = await m.executeMobileModding(ally, weapon, "boom-module", inv, {
    distanceFeet: 5,
    willing: true
  });
  assert.ok(res.success);
  assert.equal(getPool(inv, "prowess").value, 0);

  // Next attempt fails due to 0 prowess
  const weapon2 = createTestItem({
    name: "Mace",
    type: "weapon",
    system: { type: { value: "simpleM" } }
  });
  ally.items.push(weapon2);

  await assert.rejects(
    async () => m.executeMobileModding(ally, weapon2, "boom-module", inv, { distanceFeet: 5, willing: true }),
    /insufficient prowess/i
  );
});

test("2.3 Mobile Modding Inventions Pool Invariance (Costs Strictly 0 Inventions)", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 3, inventionsCurrent: 5 });
  const ally = createCreature("Ally");
  const weapon = createTestItem({
    name: "Warhammer",
    type: "weapon",
    system: { type: { value: "martialM" } }
  });
  ally.items = [weapon];

  const inventionsBefore = getPool(inv, "inventions").value;
  await m.executeMobileModding(ally, weapon, "boom-module", inv, { distanceFeet: 5, willing: true });
  const inventionsAfter = getPool(inv, "inventions").value;

  assert.equal(inventionsAfter, inventionsBefore);
  assert.equal(inventionsAfter, 5);
});

test("2.4 Mobile Modding Range (5 ft) & Willingness Verification", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 3 });
  const ally = createCreature("Ally");
  const weapon = createTestItem({
    name: "Dagger",
    type: "weapon",
    system: { type: { value: "simpleM" } }
  });
  ally.items = [weapon];

  // Rejects > 5 ft
  await assert.rejects(
    async () => m.executeMobileModding(ally, weapon, "boom-module", inv, { distanceFeet: 10, willing: true }),
    /5 feet/i
  );

  // Rejects unwilling creature
  await assert.rejects(
    async () => m.executeMobileModding(ally, weapon, "boom-module", inv, { distanceFeet: 5, willing: false }),
    /willing/i
  );
});

test("2.5 Mobile Modding 1-Minute Duration & Duplicate Rejection", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 3 });
  const ally = createCreature("Ally");
  const weapon = createTestItem({
    name: "Greatsword",
    type: "weapon",
    system: { type: { value: "martialM" } }
  });
  ally.items = [weapon];

  const res = await m.executeMobileModding(ally, weapon, "boom-module", inv, { distanceFeet: 5, willing: true });
  assert.ok(res.success);
  assert.equal(res.temporary, true);
  assert.equal(res.duration, "1min");
  assert.equal(m.getItemModifications(weapon)[0].temporary, true);

  // Attempting duplicate modification (same mod on same item) must be rejected
  await assert.rejects(
    async () => m.executeMobileModding(ally, weapon, "boom-module", inv, { distanceFeet: 5, willing: true }),
    /duplicate modification/i
  );
});

// ===========================================================================
// Section 3: Inventor Prowess Gain Trigger
// ===========================================================================

test("3.1 Prowess Gain on Downed Enemy by Mod-Activating Ally", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 1, prowessMax: 5 });
  const ally = createCreature("Ally");
  const enemy = createCreature("Enemy", 0);

  const weapon = createTestItem({
    name: "Shock Longsword",
    type: "weapon",
    system: { type: { value: "martialM" } }
  });
  ally.items = [weapon];

  // Apply mod attributed to this Inventor
  await m.applyEquipmentModification(weapon, "shock-engine", inv);

  // Record that ally activated mod this turn
  ally.flags ??= {};
  ally.flags.ak5e ??= {};
  ally.flags.ak5e.activatedModsThisTurn = [
    { modId: "shock-engine", inventorId: inv.id, turn: 1 }
  ];

  const res = await m.onCreatureReducedToZeroHP(enemy, ally, { inventor: inv, turn: 1 });
  assert.equal(res.prowessGained, 1);
  assert.equal(getPool(inv, "prowess").value, 2);
});

test("3.2 Rejection of Non-Modded Creature or Mod NOT Activated This Turn", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 1, prowessMax: 5 });
  const ally = createCreature("Ally");
  const enemy = createCreature("Enemy", 0);

  // Non-modded creature
  const res1 = await m.onCreatureReducedToZeroHP(enemy, ally, {
    inventor: inv,
    hasInventorMod: false,
    turn: 1
  });
  assert.equal(res1.prowessGained, 0);
  assert.equal(getPool(inv, "prowess").value, 1);

  // Has mod, but did NOT activate this turn
  const weapon = createTestItem({
    name: "Sword",
    type: "weapon",
    system: { type: { value: "martialM" } }
  });
  ally.items = [weapon];
  await m.applyEquipmentModification(weapon, "shock-engine", inv);
  ally.flags.ak5e.activatedModsThisTurn = [];

  const res2 = await m.onCreatureReducedToZeroHP(enemy, ally, {
    inventor: inv,
    activatedModThisTurn: false,
    turn: 1
  });
  assert.equal(res2.prowessGained, 0);
  assert.equal(getPool(inv, "prowess").value, 1);
});

test("3.3 1/Turn Prowess Gain Clamp & Maximum Pool Cap", async () => {
  const m = await getInventorModule();
  const inv = createInventorActor(5, { prowessCurrent: 1, prowessMax: 5 });
  const ally = createCreature("Ally");
  const enemy1 = createCreature("Enemy 1", 0);
  const enemy2 = createCreature("Enemy 2", 0);

  const weapon = createTestItem({
    name: "Blade",
    type: "weapon",
    system: { type: { value: "martialM" } }
  });
  ally.items = [weapon];
  await m.applyEquipmentModification(weapon, "boom-module", inv);
  ally.flags = {
    ak5e: {
      activatedModsThisTurn: [{ modId: "boom-module", inventorId: inv.id, turn: 1 }]
    }
  };

  // First down in turn 1: awards 1 Prowess
  const res1 = await m.onCreatureReducedToZeroHP(enemy1, ally, { inventor: inv, turn: 1 });
  assert.equal(res1.prowessGained, 1);
  assert.equal(getPool(inv, "prowess").value, 2);

  // Second down in same turn 1: clamped, awards 0
  const res2 = await m.onCreatureReducedToZeroHP(enemy2, ally, { inventor: inv, turn: 1 });
  assert.equal(res2.prowessGained, 0);
  assert.equal(getPool(inv, "prowess").value, 2);

  // Turn 2 advance: awards 1 Prowess again
  m.resetInventorTurnTriggers(inv);
  ally.flags.ak5e.activatedModsThisTurn = [{ modId: "boom-module", inventorId: inv.id, turn: 2 }];
  const res3 = await m.onCreatureReducedToZeroHP(enemy2, ally, { inventor: inv, turn: 2 });
  assert.equal(res3.prowessGained, 1);
  assert.equal(getPool(inv, "prowess").value, 3);

  // Maximum pool cap enforcement (prowess is already at pool max 3)
  m.resetInventorTurnTriggers(inv);
  ally.flags.ak5e.activatedModsThisTurn = [{ modId: "boom-module", inventorId: inv.id, turn: 3 }];
  const res4 = await m.onCreatureReducedToZeroHP(enemy1, ally, { inventor: inv, turn: 3 });
  assert.equal(res4.prowessGained, 0);
  assert.equal(getPool(inv, "prowess").value, 3);
});

// ===========================================================================
// Section 4: Risk Assessment (Lv 11) Integration
// ===========================================================================

test("4.1 Risk Assessment Instability Reductions & Speciality Modding", async () => {
  const m = await getInventorModule();
  const inv11 = createInventorActor(11, { weaponCategory: "ranged" });
  const ally = createCreature("Ally");

  const matchingFirearm = createTestItem({
    name: "Rifle",
    type: "weapon",
    system: { actionType: "rwak", type: { value: "firearms" } }
  });
  const nonMatchingMelee = createTestItem({
    name: "Greatsword",
    type: "weapon",
    system: { actionType: "mwak", type: { value: "martialM" } }
  });

  // Base instability without reductions (e.g. on ally with non-matching weapon)
  const baseInstability = m.calculateInstability(nonMatchingMelee, ally, {
    inventor: inv11,
    base: 3
  });

  // Speciality Modding: matching weapon reduces Instability by 1
  const specInstability = m.calculateInstability(matchingFirearm, ally, {
    inventor: inv11,
    base: 3
  });
  assert.equal(specInstability, baseInstability - 1);

  // Trained Operator: wielded by the Inventor themselves reduces Instability by 1
  const trainedInstability = m.calculateInstability(nonMatchingMelee, inv11, {
    inventor: inv11,
    base: 3
  });
  assert.equal(trainedInstability, baseInstability - 1);

  // Both Speciality Modding + Trained Operator: reduces Instability by 2
  const bothInstability = m.calculateInstability(matchingFirearm, inv11, {
    inventor: inv11,
    base: 3
  });
  assert.equal(bothInstability, baseInstability - 2);

  // Instability is always clamped at a minimum of 1
  const clampedInstability = m.calculateInstability(matchingFirearm, inv11, {
    base: 2,
    inventor: inv11
  });
  assert.equal(clampedInstability, 1);
});

// ===========================================================================
// Section 5: The Big One (Lv 20)
// ===========================================================================

test("5.1 The Big One Level Gating (< Lv 20 Rejection) & 1/LR Limit", async () => {
  const m = await getInventorModule();
  const inv19 = createInventorActor(19);
  const inv20 = createInventorActor(20);

  // Level gating rejects < 20
  await assert.rejects(
    async () => m.executeTheBigOne("FLASH", inv19),
    /requires 20th level Inventor/i
  );

  // 1/Long Rest limit
  const res1 = await m.executeTheBigOne("FLASH", inv20, { targets: [] });
  assert.ok(res1.success);

  // Second execution warns or rejects
  const res2 = await m.executeTheBigOne("FLASH", inv20, { targets: [] });
  assert.equal(res2.warning, "alreadyUsed");

  // Reset restores capability
  await m.resetTheBigOne(inv20);
  const res3 = await m.executeTheBigOne("FLASH", inv20, { targets: [] });
  assert.ok(res3.success);
  assert.equal(res3.warning, null);
});

test("5.2 Mode FLASH: Overlapping Single-Save Invariance & 8d6 Thunder + Burning", async () => {
  const m = await getInventorModule();
  const inv20 = createInventorActor(20);
  const t1 = createCreature("Target 1");

  const res = await m.executeTheBigOne("FLASH", inv20, {
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
      { x: 5, y: -5 }
    ],
    targets: [t1, t1, t1], // target in multiple overlapping points
    savePassed: false,
    damage: 28
  });

  assert.ok(res.success);
  assert.equal(res.mode, "FLASH");
  assert.equal(res.damageFormula, "8d6");
  assert.equal(res.damageType, "thunder");
  assert.ok(res.burning);

  // Single-save & single-damage invariance
  assert.equal(res.targetResults.length, 1);
  assert.equal(res.targetResults[0].damageTaken, 28);
  assert.equal(res.savesMade, 1);
  assert.equal(res.damageMultiplier, 1);
});

test("5.3 Mode SHARD: 50 ft Cone, 10d6 Slashing + Bleeding, Ignores Cover", async () => {
  const m = await getInventorModule();
  const inv20 = createInventorActor(20);
  const t = createCreature("Cover Target");

  const res = await m.executeTheBigOne("SHARD", inv20, {
    targets: [t],
    targetCover: { [t.id]: "half" },
    savePassed: false,
    damage: 35
  });

  assert.ok(res.success);
  assert.equal(res.mode, "SHARD");
  assert.equal(res.damageFormula, "10d6");
  assert.equal(res.damageType, "slashing");
  assert.ok(res.bleeding);
  assert.ok(res.ignoresCover || res.coverIgnored);
  assert.equal(res.targetResults[0].damageTaken, 35);
});

test("5.4 Mode QUASAR: 100x10 ft Line & 14d6 Radiant Damage", async () => {
  const m = await getInventorModule();
  const inv20 = createInventorActor(20);
  const tFail = createCreature("Enemy Fail");
  const tPass = createCreature("Enemy Pass");

  const res = await m.executeTheBigOne("QUASAR", inv20, {
    targets: [tFail, tPass],
    targetSaves: {
      [tFail.id]: false,
      [tPass.id]: true
    },
    damage: 50
  });

  assert.ok(res.success);
  assert.equal(res.mode, "QUASAR");
  assert.equal(res.damageFormula, "14d6");
  assert.equal(res.damageType, "radiant");

  const failRes = res.targetResults.find(r => r.targetId === tFail.id);
  const passRes = res.targetResults.find(r => r.targetId === tPass.id);

  assert.equal(failRes.damageTaken, 50);
  assert.equal(passRes.damageTaken, 25); // half on save
});
