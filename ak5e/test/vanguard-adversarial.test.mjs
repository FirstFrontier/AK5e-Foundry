import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import {
  hasLandstrider, isNimbleAgainst, hasQuickOffTheMark,
  hasUncannyDodge, calculateUncannyDodge, executeUncannyDodge,
  hasDirectedEngagement, activateDirectedEngagement, isDirectedEngagementActive,
  hasLightspeed, lightspeedSecondInitiative, isLightspeedApplicable,
  hasApproachingStorm, approachingStormDamageBonus, applyAdditiveTempHP
} from "../scripts/vanguard-features.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import {
  tipCritReduction, tipCritThreshold, activeTipEffects, useTipSP
} from "../scripts/tip-of-the-spear.mjs";
import { spendReaction, getReactions } from "../scripts/trigger-events.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createVanguard(level = 1, extraFlags = {}) {
  const vClass = createTestItem({
    name: "Vanguard",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  const tipFeat = createTestItem({
    name: "1st Level: Tip of the Spear",
    type: "feat",
    flags: { ak5e: { chapterThreeId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092" } }
  });
  const actor = createTestActor({
    items: [vClass, tipFeat],
    system: {
      attributes: {
        prof: Math.floor((level - 1) / 4) + 2,
        hp: { value: 20, max: 20, temp: 0 }
      },
      abilities: { dex: { mod: 3 }, str: { mod: 1 }, con: { mod: 2 } }
    },
    flags: {
      ak5e: {
        vanguard: { enabled: true, ...extraFlags }
      }
    }
  });
  return actor;
}

/* ==========================================================================
   1. Tip of the Spear & Directed Engagement Adversarial Challenges
   ========================================================================== */

test("ADV-TIP-1: Table-play unrolled Tip of the Spear succeeds useRoll flow", async () => {
  const actor = createVanguard(5);
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30 } } }
  });

  // Regular invocation without pre-selected choice (awaiting roll)
  await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    confirmation: true
  }, "tip-unrolled-test");

  const receiptBefore = vanguardUses.receipt(actor, "tip-unrolled-test");
  assert.ok(receiptBefore, "Receipt was recorded");
  assert.equal(receiptBefore.status, "awaitingRoll");
  assert.equal(receiptBefore.formula, "1d6");

  const rollResult = await vanguardUses.command(actor, "useRoll", { useId: "tip-unrolled-test" });
  assert.ok(rollResult, "useRoll succeeded");

  const receiptAfter = vanguardUses.receipt(actor, "tip-unrolled-test");
  assert.equal(receiptAfter.status, "complete");
  assert.ok(receiptAfter.outcome >= 1 && receiptAfter.outcome <= 6, "Outcome is between 1 and 6");
  assert.equal(receiptAfter.outcome, receiptAfter.roll);
});

test("ADV-TIP-2: Level 1 Vanguard picking Tip outcome raises Directed Engagement level warning", async () => {
  const actor = createVanguard(1);
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30 } } }
  });

  // Directed Engagement requires Level 15 (L8046).
  // A Level 1 Vanguard picking an outcome must raise level warning.
  const plan = vanguardUses.plan(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    choice: 4,
    directed: false,
    overrides: ["level"]
  });

  assert.ok(plan.warnings.some(w => w.id === "level"), "Level warning raised when Lv 1 picks outcome");

  const result = await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    choice: 4,
    directed: false,
    overrides: ["level"],
    confirmation: true
  }, "tip-lv1-override");

  assert.equal(result.outcome, 4);
});

test("ADV-TIP-3: Outcome 5 active effect is recognized by tipCritReduction / tipCritThreshold", async () => {
  const actor = createVanguard(15);
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30 } } }
  });

  await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    directed: true,
    choice: 5,
    confirmation: true
  }, "tip-crit-test");

  const reduction = tipCritReduction(ally);
  const threshold = tipCritThreshold(ally, 20);

  assert.equal(reduction, 1, "tipCritReduction detects tip5 effect");
  assert.equal(threshold, 19, "critical threshold is lowered by 1");
});

test("ADV-TIP-4: Outcome 6 active effect integrates with useTipSP", async () => {
  const actor = createVanguard(15);
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30 } } }
  });

  await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    directed: true,
    choice: 6,
    confirmation: true
  }, "tip-sp-test");

  let spGranted = 0;
  await useTipSP({
    target: ally,
    amount: 1,
    op: { id: "test-sp-op" },
    grantSP: async (_target, amount) => { spGranted = amount; },
    actor
  });

  assert.equal(spGranted, 1, "useTipSP successfully granted extra SP");
});

/* ==========================================================================
   2. Additive Temporary HP & Undo Stress Tests
   ========================================================================== */

test("ADV-THP-1: Multi-step additive THP accumulation and undo with damage absorption", async () => {
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 20, max: 20, temp: 5 } } }
  });

  // Direct helper
  const step1 = await applyAdditiveTempHP(ally, 6);
  assert.equal(step1.before, 5);
  assert.equal(step1.after, 11);
  assert.equal(ally.system.attributes.hp.temp, 11);

  const step2 = await applyAdditiveTempHP(ally, 4);
  assert.equal(step2.before, 11);
  assert.equal(step2.after, 15);
  assert.equal(ally.system.attributes.hp.temp, 15);

  // Table play execution and undo
  const actor = createVanguard(15);
  await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    directed: true,
    choice: 2,
    amount: 10,
    confirmation: true
  }, "tip-thp-undo-test");

  assert.equal(ally.system.attributes.hp.temp, 25);

  // Damage reduces THP to 18
  await ally.update({ "system.attributes.hp.temp": 18 });

  // Undoing the 10 THP grant cleanly removes 10 (down to 8)
  const undo = await vanguardUses.undo(actor, "tip-thp-undo-test");
  assert.equal(undo.undone, "tip-thp-undo-test");
  assert.equal(ally.system.attributes.hp.temp, 8);
});

test("ADV-THP-2: Non-positive THP values are rejected by applyAdditiveTempHP", async () => {
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 20, max: 20, temp: 5 } } }
  });

  await assert.rejects(() => applyAdditiveTempHP(ally, 0), /positive integer/);
  await assert.rejects(() => applyAdditiveTempHP(ally, -3), /positive integer/);
  await assert.rejects(() => applyAdditiveTempHP(ally, 3.5), /positive integer/);
  await assert.rejects(() => applyAdditiveTempHP(ally, "abc"), /positive integer/);
});

/* ==========================================================================
   3. Uncanny Dodge & Directed Engagement Overridden Reaction Bug
   ========================================================================== */

test("ADV-RX-1: Overriding reaction warning on Uncanny Dodge succeeds with spent === false", async () => {
  const actor = createVanguard(11);
  await spendReaction(actor, { triggerId: "prior-reaction" });
  assert.equal(getReactions(actor).available, 0);

  await vanguardUses.execute(actor, "uncannyDodge", {
    damage: 30,
    overrides: ["reaction"],
    confirmation: true
  }, "dodge-crash-test");

  const receipt = vanguardUses.receipt(actor, "dodge-crash-test");
  assert.ok(receipt, "Receipt was created");
  assert.equal(receipt.reaction?.spent, false, "Reaction spent is false when overridden");
});

test("ADV-RX-2: Overriding reaction warning on Directed Engagement succeeds with spent === false", async () => {
  const actor = createVanguard(15);
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 } } }
  });
  await spendReaction(actor, { triggerId: "prior-reaction" });
  assert.equal(getReactions(actor).available, 0);

  await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    directed: true,
    choice: 2,
    amount: 5,
    overrides: ["reaction"],
    confirmation: true
  }, "directed-crash-test");

  const receipt = vanguardUses.receipt(actor, "directed-crash-test");
  assert.ok(receipt, "Receipt was created");
  assert.equal(receipt.reaction?.spent, false, "Reaction spent is false when overridden");
});

test("ADV-RX-3: Uncanny Dodge damage halving math handles edge cases", () => {
  assert.equal(calculateUncannyDodge(0), 0);
  assert.equal(calculateUncannyDodge(1), 0);
  assert.equal(calculateUncannyDodge(15), 7);
  assert.equal(calculateUncannyDodge(100), 50);
  assert.equal(calculateUncannyDodge(999), 499);
  assert.throws(() => calculateUncannyDodge(-5), /non-negative/);
});

/* ==========================================================================
   4. Nimble Plan ReferenceError Bug
   ========================================================================== */

test("ADV-NIMBLE-1: Executing nimble plan in vanguardUses completes cleanly", async () => {
  const actor = createVanguard(1);
  const enemy = createTestActor({ name: "Enemy Goblin" });

  const result = await vanguardUses.execute(actor, "nimble", {
    targetUuid: enemy.uuid,
    targetName: enemy.name,
    confirmation: true
  }, "nimble-test-op");

  assert.ok(result, "Nimble plan executed cleanly");
  assert.equal(result.targetUuid, enemy.uuid);
});

/* ==========================================================================
   5. Lightspeed & Approaching Storm Adversarial Checks
   ========================================================================== */

test("ADV-STORM-1: Approaching Storm damage bonus math across all 20 levels", () => {
  for (let lvl = 1; lvl <= 20; lvl++) {
    const actor = createVanguard(lvl);
    const combatR1 = { started: true, round: 1 };
    const combatR2 = { started: true, round: 2 };

    const expectedBonus = lvl >= 20 ? 10 : 0;
    assert.equal(approachingStormDamageBonus(actor, combatR1), expectedBonus);
    assert.equal(approachingStormDamageBonus(actor, combatR2), 0);
  }
});

test("ADV-LIGHT-1: Lightspeed second initiative calculation handles negative initiatives", () => {
  assert.equal(lightspeedSecondInitiative(25), 15);
  assert.equal(lightspeedSecondInitiative(10), 0);
  assert.equal(lightspeedSecondInitiative(5), -5);
  assert.equal(lightspeedSecondInitiative(-2), -12);
});
