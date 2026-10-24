import test from "node:test";
import assert from "node:assert/strict";
import {
  hasLandstrider, recordNimbleTarget, isNimbleAgainst, clearNimbleTargets,
  hasQuickOffTheMark, quickOffTheMarkBonus, applyQuickOffTheMark,
  extraAttacksCount, hasUncannyDodge, calculateUncannyDodge, executeUncannyDodge,
  hasDirectedEngagement, activateDirectedEngagement, isDirectedEngagementActive, clearDirectedEngagement,
  hasLightspeed, lightspeedSecondInitiative, isLightspeedApplicable,
  hasApproachingStorm, approachingStormDamageBonus, applyAdditiveTempHP,
  executeTipOfTheSpear, TIP_OUTCOMES, TIP_INSTRUCTIONS
} from "../scripts/vanguard-features.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function createVanguardActor(level = 1, options = {}) {
  const vClass = createTestItem({
    name: "Vanguard",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
  const actor = createTestActor({
    items: [vClass],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2 },
      abilities: {
        dex: { mod: 3 },
        con: { mod: 2 },
        str: { mod: 1 }
      },
      ...options.system
    },
    flags: {
      ak5e: {
        vanguard: { enabled: true }
      }
    }
  });
  return actor;
}

test("Landstrider: Walking speed bonus and Nimble target tracking", async () => {
  const actor = createVanguardActor(1);
  assert.equal(hasLandstrider(actor), true);

  const target = createTestActor({ name: "Enemy" });
  assert.equal(isNimbleAgainst(actor, target), false);

  await recordNimbleTarget(actor, target);
  assert.equal(isNimbleAgainst(actor, target), true);

  const otherTarget = createTestActor({ name: "Other Enemy" });
  assert.equal(isNimbleAgainst(actor, otherTarget), false);

  await clearNimbleTargets(actor);
  assert.equal(isNimbleAgainst(actor, target), false);
});

test("Quick off the Mark: level unlock and initiative bonus", () => {
  const lv1 = createVanguardActor(1);
  const lv2 = createVanguardActor(2);
  const lv3 = createVanguardActor(3);
  const lv5 = createVanguardActor(5);
  const lv20 = createVanguardActor(20);

  assert.equal(hasQuickOffTheMark(lv1), false);
  assert.equal(hasQuickOffTheMark(lv2), false);
  assert.equal(hasQuickOffTheMark(lv3), true);
  assert.equal(hasQuickOffTheMark(lv5), true);
  assert.equal(hasQuickOffTheMark(lv20), true);

  assert.equal(quickOffTheMarkBonus(lv1), 0);
  assert.equal(quickOffTheMarkBonus(lv2), 0);
  assert.equal(quickOffTheMarkBonus(lv3), 2);
  assert.equal(quickOffTheMarkBonus(lv5), 3);
  assert.equal(quickOffTheMarkBonus(lv20), 6);

  const rollData = applyQuickOffTheMark(lv3, { initiativeBonus: 3 });
  assert.equal(rollData.initiativeBonus, 5); // 3 (DEX) + 2 (PB)
});

test("Extra Attack: level 5 unlock", () => {
  assert.equal(extraAttacksCount(createVanguardActor(1)), 0);
  assert.equal(extraAttacksCount(createVanguardActor(4)), 0);
  assert.equal(extraAttacksCount(createVanguardActor(5)), 1);
  assert.equal(extraAttacksCount(createVanguardActor(15)), 1);
  assert.equal(extraAttacksCount(createVanguardActor(20)), 1);
});

test("Uncanny Dodge: level 11 unlock, damage halving, and reaction spend", async () => {
  const lv10 = createVanguardActor(10);
  const lv11 = createVanguardActor(11);

  assert.equal(hasUncannyDodge(lv10), false);
  assert.equal(hasUncannyDodge(lv11), true);

  // Math: halves damage rounding down
  assert.equal(calculateUncannyDodge(20), 10);
  assert.equal(calculateUncannyDodge(15), 7);
  assert.equal(calculateUncannyDodge(1), 0);
  assert.equal(calculateUncannyDodge(0), 0);

  // Execution with Reaction
  const result = await executeUncannyDodge(lv11, { damage: 25 });
  assert.equal(result.halvedDamage, 12);
  assert.equal(result.damageReduced, 13);
  assert.equal(result.reactionSpent, true);

  // Second spend in same turn fails because reaction was spent
  await assert.rejects(() => executeUncannyDodge(lv11, { damage: 10 }));
});

test("Directed Engagement: level 15 unlock and reaction state", async () => {
  const lv14 = createVanguardActor(14);
  const lv15 = createVanguardActor(15);

  assert.equal(hasDirectedEngagement(lv14), false);
  assert.equal(hasDirectedEngagement(lv15), true);
  assert.equal(isDirectedEngagementActive(lv15), false);

  const res = await activateDirectedEngagement(lv15);
  assert.equal(res.success, true);
  assert.equal(isDirectedEngagementActive(lv15), true);

  await clearDirectedEngagement(lv15);
  assert.equal(isDirectedEngagementActive(lv15), false);
});

test("Lightspeed: level 18 unlock and initiative calculation", () => {
  const lv17 = createVanguardActor(17);
  const lv18 = createVanguardActor(18);

  assert.equal(hasLightspeed(lv17), false);
  assert.equal(hasLightspeed(lv18), true);

  assert.equal(lightspeedSecondInitiative(22), 12);
  assert.equal(lightspeedSecondInitiative(15), 5);
  assert.equal(lightspeedSecondInitiative(8), -2);

  const combatRound1 = { started: true, round: 1 };
  const combatRound2 = { started: true, round: 2 };

  assert.equal(isLightspeedApplicable(lv18, combatRound1), true);
  assert.equal(isLightspeedApplicable(lv18, combatRound2), false);
  assert.equal(isLightspeedApplicable(lv18, null), false);
});

test("Approaching Storm: level 20 unlock and Round 1 damage bonus", () => {
  const lv19 = createVanguardActor(19);
  const lv20 = createVanguardActor(20);

  assert.equal(hasApproachingStorm(lv19), false);
  assert.equal(hasApproachingStorm(lv20), true);

  const combatRound1 = { started: true, round: 1 };
  const combatRound2 = { started: true, round: 2 };

  assert.equal(approachingStormDamageBonus(lv20, combatRound1), 10);
  assert.equal(approachingStormDamageBonus(lv20, combatRound2), 0);
  assert.equal(approachingStormDamageBonus(lv19, combatRound1), 0);
});

test("Additive Temporary HP: stacks additively with existing THP", async () => {
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 20, max: 20, temp: 5 } } }
  });

  // Adding 6 THP to existing 5 gives 11 THP
  const res = await applyAdditiveTempHP(ally, 6);
  assert.equal(res.before, 5);
  assert.equal(res.after, 11);
  assert.equal(res.added, 6);
  assert.equal(res.additive, true);
  assert.equal(ally.system.attributes.hp.temp, 11);

  // Another 4 THP gives 15 THP
  const res2 = await applyAdditiveTempHP(ally, 4);
  assert.equal(res2.before, 11);
  assert.equal(res2.after, 15);
  assert.equal(ally.system.attributes.hp.temp, 15);
});

test("executeTipOfTheSpear: integration with tip-of-the-spear helpers", async () => {
  const bearer = createVanguardActor(15);
  const target = createTestActor({
    name: "Target Ally",
    system: { attributes: { movement: { walk: 30 } } }
  });

  const diceLog = [];
  const taggedLog = [];
  const tempLog = [];
  const helpers = {
    dice: async (op, key, formula, actor) => { diceLog.push({ key, formula }); return 4; },
    tagged: async (actor, item, targetActor, id, options, metadata) => {
      taggedLog.push({ actor, item, targetActor, id, options, metadata });
      return { id };
    },
    temporaryHP: async (targetActor, amount, additive, id, actor) => {
      tempLog.push({ targetActor, amount, additive, id, actor });
    }
  };

  // Rolled execution: rolls 1d6
  const rolledResult = await executeTipOfTheSpear({
    actor: bearer,
    target: { actor: target },
    helpers
  });
  assert.equal(rolledResult.outcome, 4);
  assert.equal(taggedLog.length, 1);
  assert.equal(taggedLog[0].metadata.kind, "tip4");

  // Directed execution: chooses outcome 2 (additive THP) without rolling
  const directedResult = await executeTipOfTheSpear({
    actor: bearer,
    target: { actor: target },
    directed: true,
    choice: 2,
    helpers
  });
  assert.equal(directedResult.outcome, 2);
  assert.equal(tempLog.length, 1);
  assert.equal(tempLog[0].additive, true);
});

test("vanguardUses: table-play plan execution, warnings, overrides, and undo", async () => {
  const actor = createVanguardActor(15);
  const target = createTestActor({
    name: "Target",
    system: { attributes: { hp: { value: 20, max: 20, temp: 0 } } }
  });

  // 1. Tip of the spear with distance > 60 ft throws PlayWarnings
  assert.throws(() => {
    vanguardUses.plan(actor, "tipOfTheSpear", {
      targetUuid: target.uuid,
      targetName: target.name,
      distance: 75,
      choice: 1
    });
  }, (err) => {
    return (err.name === "PlayWarnings" || err.name === "AK5eWarnings") && err.warnings.some(w => w.id === "range");
  });

  // 2. Overriding the warning ("Use anyway") succeeds
  const plan = vanguardUses.plan(actor, "tipOfTheSpear", {
    targetUuid: target.uuid,
    targetName: target.name,
    distance: 75,
    choice: 1,
    overridden: ["range"]
  });
  assert.equal(plan.title, "Tip of the Spear");

  // 3. Execute Tip of the spear outcome 2 (additive THP)
  const result = await vanguardUses.execute(actor, "tipOfTheSpear", {
    targetUuid: target.uuid,
    targetName: target.name,
    choice: 2,
    amount: 5,
    directed: true,
    confirmation: true
  }, "tip-op-1");
  assert.equal(result.outcome, 2);
  assert.equal(target.system.attributes.hp.temp, 5);

  const receipt = vanguardUses.receipt(actor, "tip-op-1");
  assert.equal(receipt.status, "complete");

  // 4. Undo cleanly reverts target THP and actor state within encounter window
  const undoResult = await vanguardUses.undo(actor, "tip-op-1");
  assert.equal(undoResult.undone, "tip-op-1");
  assert.equal(target.system.attributes.hp.temp, 0);

  // 5. Uncanny Dodge execution and undo
  const dodgeResult = await vanguardUses.execute(actor, "uncannyDodge", {
    damage: 30,
    confirmation: true
  }, "dodge-op-1");
  assert.equal(dodgeResult.halvedDamage, 15);

  const dodgeUndo = await vanguardUses.undo(actor, "dodge-op-1");
  assert.equal(dodgeUndo.undone, "dodge-op-1");
});
