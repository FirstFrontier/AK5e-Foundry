import test from "node:test";
import assert from "node:assert/strict";
import {
  hasProvideAid, hasAdvancedAid, hasLightenTheLoad,
  hasEverReliable, hasSelfSupportive, hasWillIntoBeing,
  willIntoBeingBonus, defineSupporterPools, onSupporterRest,
  onSupporterTurnStart, hasSelfSupportDie, consumeSelfSupportDie
} from "../scripts/supporter-features.mjs";
import { supporterUses } from "../scripts/supporter-uses.mjs";
import { SUPPORTER_CLASS_ID } from "../scripts/supporter-rules.mjs";
import { getPool, refundPool, spendPool } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSupporterPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createSupporterActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Supporter",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [sClass],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2 },
      abilities: {
        int: { mod: 2, value: 14 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 4, value: 18 },
        con: { mod: 2, value: 14 },
        dex: { mod: 2, value: 14 },
        str: { mod: 0, value: 10 }
      },
      ...options.system
    },
    flags: {
      ak5e: {
        supporter: { enabled: true, aidAbility: "cha" }
      }
    }
  });
  return actor;
}

test("Feature level unlocks: Provide Aid, Advanced Aid, Lighten the Load, Ever Reliable, Self-Supportive, Will Into Being", () => {
  const lv1 = createSupporterActor(1);
  const lv4 = createSupporterActor(4);
  const lv5 = createSupporterActor(5);
  const lv10 = createSupporterActor(10);
  const lv11 = createSupporterActor(11);
  const lv14 = createSupporterActor(14);
  const lv15 = createSupporterActor(15);
  const lv17 = createSupporterActor(17);
  const lv18 = createSupporterActor(18);
  const lv19 = createSupporterActor(19);
  const lv20 = createSupporterActor(20);

  // Provide Aid (Lv 1)
  assert.equal(hasProvideAid(lv1), true);

  // Advanced Aid (Lv 5)
  assert.equal(hasAdvancedAid(lv1), false);
  assert.equal(hasAdvancedAid(lv4), false);
  assert.equal(hasAdvancedAid(lv5), true);
  assert.equal(hasAdvancedAid(lv10), true);

  // Lighten the Load (Lv 11)
  assert.equal(hasLightenTheLoad(lv10), false);
  assert.equal(hasLightenTheLoad(lv11), true);

  // Ever Reliable (Lv 15)
  assert.equal(hasEverReliable(lv14), false);
  assert.equal(hasEverReliable(lv15), true);

  // Self-Supportive (Lv 18)
  assert.equal(hasSelfSupportive(lv17), false);
  assert.equal(hasSelfSupportive(lv18), true);

  // Will Into Being (Lv 20)
  assert.equal(hasWillIntoBeing(lv19), false);
  assert.equal(hasWillIntoBeing(lv20), true);
  assert.equal(willIntoBeingBonus(lv19), 0);
  assert.equal(willIntoBeingBonus(lv20), 6); // Lv 20 PB is +6
});

test("Resource pool: aidDie pool registration, max calculation, spend and refund", async () => {
  const actor = createSupporterActor(5);
  const pool = getPool(actor, "aidDie");
  assert.equal(pool.id, "aidDie");
  assert.equal(pool.max, 4); // Max of int (2), wis (1), cha (4) -> 4
  assert.equal(pool.value, 4);

  // Spend 2 dice
  await spendPool(actor, "aidDie", 2);
  const afterSpend = getPool(actor, "aidDie");
  assert.equal(afterSpend.value, 2);

  // Refund 1 die
  await refundPool(actor, "aidDie", 1);
  const afterRefund = getPool(actor, "aidDie");
  assert.equal(afterRefund.value, 3);
});

test("Ever Reliable: Short Rest recovery of ceil(max / 2) and Turn Start 0-recovery", async () => {
  const actor = createSupporterActor(15);
  // Empty the pool
  await spendPool(actor, "aidDie", 4);
  assert.equal(getPool(actor, "aidDie").value, 0);

  // Short rest recovery should restore ceil(4 / 2) = 2
  await onSupporterRest(actor, "short");
  assert.equal(getPool(actor, "aidDie").value, 2);

  // Spend down to 0 again
  await spendPool(actor, "aidDie", 2);
  assert.equal(getPool(actor, "aidDie").value, 0);

  // Turn start regenerates 1 die when at 0
  await onSupporterTurnStart(actor);
  assert.equal(getPool(actor, "aidDie").value, 1);

  // When not at 0, turn start does NOT add extra dice
  await onSupporterTurnStart(actor);
  assert.equal(getPool(actor, "aidDie").value, 1);
});

test("Self-Supportive: Turn start personal die grant and consumption", async () => {
  const actor = createSupporterActor(18);
  assert.equal(hasSelfSupportDie(actor), false);

  await onSupporterTurnStart(actor);
  assert.equal(hasSelfSupportDie(actor), true);

  await consumeSelfSupportDie(actor);
  assert.equal(hasSelfSupportDie(actor), false);
});

test("supporterUses: provideAid plan, warnings, overrides, and undo reversibility", async () => {
  const actor = createSupporterActor(5);
  const ally = createTestActor({ name: "Ally" });

  // Out of range (> 60 ft) warning throws PlayWarnings
  assert.throws(() => {
    supporterUses.plan(actor, "provideAid", { target: ally, distance: 75 });
  }, err => err.warnings.some(w => w.id === "range"));

  // Overriding range allows plan
  const planOverridden = supporterUses.plan(actor, "provideAid", { target: ally, distance: 75, overridden: ["range"] });
  assert.ok(planOverridden);

  // Target already has Aid Die warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "provideAid", { target: ally, distance: 30, targetHasAidDie: true });
  }, err => err.warnings.some(w => w.id === "targetHasAidDie"));

  // Normal valid execution
  const initialPool = getPool(actor, "aidDie").value;
  const opId = "aid-op-1";
  const result = await supporterUses.execute(actor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 30 }, opId);
  assert.ok(result);
  assert.equal(result.dieSize, "d8");
  assert.equal(getPool(actor, "aidDie").value, initialPool - 1);

  // Undo receipt reverts resource spend
  await supporterUses.undo(actor, opId);
  assert.equal(getPool(actor, "aidDie").value, initialPool);
});

test("supporterUses: useAidDie plan with Advanced Aid and Will Into Being", async () => {
  const actor = createSupporterActor(20);

  // Invalid roll type warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "useAidDie", { rollType: "invalid" });
  }, err => err.warnings.some(w => w.id === "invalidRollType"));

  // Death save warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "useAidDie", { rollType: "save", isDeathSave: true });
  }, err => err.warnings.some(w => w.id === "deathSave"));

  // Execute valid attack roll
  const result = await supporterUses.execute(actor, "useAidDie", {
    rollType: "attack",
    dieSize: "d12",
    supporterLevel: 20,
    supporterPB: 6
  }, "use-aid-1");
  assert.ok(result);
  assert.equal(result.willBonus, 6); // Lv 20 Will Into Being
  assert.equal(result.advancedEffect, "attack"); // Lv 5+ Advanced Aid rider
});

test("supporterUses: lightenTheLoad reaction chaining and warnings", async () => {
  const actor = createSupporterActor(11);
  const ally1 = createTestActor({ name: "Ally 1" });
  const ally2 = createTestActor({ name: "Ally 2" });

  // Level warning on low-level supporter throws
  const lowActor = createSupporterActor(5);
  assert.throws(() => {
    supporterUses.plan(lowActor, "lightenTheLoad", { targetUuid: ally2.uuid, triggerUuid: ally1.uuid });
  }, err => err.warnings.some(w => w.id === "level"));

  // Target self warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "lightenTheLoad", { targetUuid: actor.uuid, triggerUuid: ally1.uuid });
  }, err => err.warnings.some(w => w.id === "selfTarget"));

  // Target same creature warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "lightenTheLoad", { targetUuid: ally1.uuid, triggerUuid: ally1.uuid });
  }, err => err.warnings.some(w => w.id === "sameTarget"));

  // Range warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "lightenTheLoad", { targetUuid: ally2.uuid, triggerUuid: ally1.uuid, distance: 70 });
  }, err => err.warnings.some(w => w.id === "range"));

  // Chaining on supplementary warning throws
  assert.throws(() => {
    supporterUses.plan(actor, "lightenTheLoad", { targetUuid: ally2.uuid, triggerUuid: ally1.uuid, isSupplementary: true });
  }, err => err.warnings.some(w => w.id === "chaining"));

  // Valid execution grants free supplementary die without spending actor's aidDie pool
  const poolBefore = getPool(actor, "aidDie").value;
  const result = await supporterUses.execute(actor, "lightenTheLoad", {
    targetUuid: ally2.uuid,
    targetName: ally2.name,
    triggerUuid: ally1.uuid,
    distance: 30
  }, "lighten-op-1");
  assert.ok(result);
  assert.equal(result.supplementary, true);
  assert.equal(getPool(actor, "aidDie").value, poolBefore); // Free die, none spent!
});

test("supporterUses: empty pool shortfall warning and clamp-at-0 override", async () => {
  const actor = createSupporterActor(1);
  const ally = createTestActor({ name: "Ally" });

  // Spend all dice to 0
  await spendPool(actor, "aidDie", 4);
  assert.equal(getPool(actor, "aidDie").value, 0);

  // Shortfall warning thrown
  assert.throws(() => {
    supporterUses.plan(actor, "provideAid", { targetUuid: ally.uuid, distance: 30 });
  }, err => err.warnings.some(w => w.id === "shortfall"));

  // Overriding shortfall with "Use anyway" succeeds and clamps pool at 0
  const result = await supporterUses.execute(actor, "provideAid", {
    targetUuid: ally.uuid,
    distance: 30,
    overrides: ["shortfall"],
    overridden: ["shortfall"]
  }, "shortfall-op-1");

  assert.ok(result);
  assert.equal(getPool(actor, "aidDie").value, 0);

  // Receipt logs shortfall
  const receipt = supporterUses.receipt(actor, "shortfall-op-1");
  assert.ok(receipt.shortfalls?.length > 0);
});

test("Ever Reliable: odd pool maximum round-up calculation", async () => {
  // Actor with mental mod 3
  const actor = createSupporterActor(15, {
    system: {
      abilities: {
        int: { mod: 3, value: 16 },
        wis: { mod: 2, value: 14 },
        cha: { mod: 3, value: 16 }
      }
    }
  });
  assert.equal(getPool(actor, "aidDie").max, 3);
  await spendPool(actor, "aidDie", 3);
  assert.equal(getPool(actor, "aidDie").value, 0);

  // Short rest recovery should restore ceil(3 / 2) = 2
  await onSupporterRest(actor, "short");
  assert.equal(getPool(actor, "aidDie").value, 2);
});
