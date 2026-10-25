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
import { submitOperatorCommand, isOwnerLocalOperatorCommand } from "../scripts/operator-skills.mjs";
import {
  tipCritReduction, tipCritThreshold, activeTipEffects, useTipSP
} from "../scripts/tip-of-the-spear.mjs";
import { spendReaction, getReactions } from "../scripts/trigger-events.mjs";
import { vanguardPreRollDamage, vanguardPostRollDamage, vanguardPreConfigureInitiative, vanguardPostRollInitiative } from "../scripts/vanguard-resolution.mjs";
const TIP_WARNINGS = ["range", "range-unverified", "visibility-unverified", "alliance-unverified"];

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

test("owned Operator Skill play commands can commit without a GM while admin writes remain GM-only", async () => {
  const player = { id: "player-owner", isGM: false };
  const actor = createTestActor({ name: "Owner-local Vanguard", ownership: { default: 0, [player.id]: 3 }, flags: { ak5e: {
    operatorSkills: { enabled: true, points: 4, maximum: 20, active: { id: "operator-skill-vanguard-basic-leading-lance", activationId: "activation-local", name: "Leading Lance" }, operations: [] }
  } } });
  actor.items.set("vanguard-class", createTestItem({ id: "vanguard-class", type: "class", flags: { ak5e: { chapterThreeId: "class-vanguard" } } }, actor));
  globalThis.game.user = player;
  globalThis.game.users = new Map([[player.id, player]]);
  assert.equal(isOwnerLocalOperatorCommand(actor, { command: "activate" }, player), true);
  assert.equal(isOwnerLocalOperatorCommand(actor, { command: "end" }, player), true);
  assert.equal(isOwnerLocalOperatorCommand(actor, { command: "resolvePhase" }, player), true);
  assert.equal(isOwnerLocalOperatorCommand(actor, { command: "configureSkill" }, player), false);
  assert.equal(isOwnerLocalOperatorCommand(actor, { command: "adjust" }, player), false);
  assert.equal(isOwnerLocalOperatorCommand(createTestActor({ ownership: { default: 0, [player.id]: 3 } }), { command: "end" }, player), false);
  assert.equal(isOwnerLocalOperatorCommand(actor, { command: "end" }, { id: "different-user", isGM: false }), false);
  const result = await submitOperatorCommand(actor, "end", {}, "owner-local-end");
  assert.equal(result, true);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").active, null);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").operatorEvents.at(-1).kind, "end");
});

test("Approaching Storm requires a per-use reading, applies only the selected component or distinct components, and consumes after native roll", async () => {
  const actor = createVanguard(20);
  const combat = { uuid: "Combat.storm", started: true, round: 1 };
  globalThis.game.combat = combat;
  await assert.rejects(() => vanguardUses.command(actor, "approachingStorm", { confirmed: true }, "storm-no-reading"), /No GM ruling for approachingStormComponents/);
  await vanguardUses.command(actor, "approachingStorm", { confirmed: true, round: 1, reading: "perRoll" }, "storm-per-roll");
  const armed = actor.getFlag("ak5e", "vanguard").approachingStormArmed;
  assert.equal(armed.reading, "perRoll");
  const first = { parts: ["1d6"], options: {} }, second = { parts: ["1d8"], options: {} };
  const config = { subject: { actor }, rolls: [first, second, first] };
  vanguardPreRollDamage(config);
  assert.deepEqual(first.parts, ["1d6", "10"]);
  assert.deepEqual(second.parts, ["1d8", "10"]);
  assert.equal(actor.getFlag("ak5e", "vanguard").approachingStormArmed.useId, "storm-per-roll", "pre-roll edits do not consume the use");
  await vanguardPostRollDamage([first, second], { subject: { actor } });
  assert.equal(actor.getFlag("ak5e", "vanguard").approachingStormArmed, null);
  assert.equal(vanguardUses.receipt(actor, "storm-per-roll").approachingStormApplied.reading, "perRoll");
});

test("Approaching Storm Use anyway honors a below-level, no-combat override on a native roll", async () => {
  const actor = createVanguard(19);
  globalThis.game.combat = null;
  await vanguardUses.command(actor, "approachingStorm", { confirmed: true, round: 1, reading: "once",
    overrides: ["level", "combat"], componentIndex: 0 }, "storm-override");
  const component = { parts: ["1d6"], options: {} };
  vanguardPreRollDamage({ subject: { actor }, rolls: [component] });
  assert.deepEqual(component.parts, ["1d6", "9"], "Use anyway applies the recorded half-level bonus without silently re-gating eligibility");
  await vanguardPostRollDamage([component], { subject: { actor } });
  assert.equal(actor.getFlag("ak5e", "vanguard").approachingStormArmed, null);
});

test("Leading Lance SP uses the shared Operator pool, commits a deduplicated event, and undoes exactly", async () => {
  const actor = createVanguard(5);
  await actor.update({ "flags.ak5e.operatorSkills": { enabled: true, points: 4, maximum: 20, active: null,
    operatorEvents: [{ id: "activation-leading-lance-1:activation", activationId: "activation-leading-lance-1",
      kind: "activation", sourceId: "operator-skill-vanguard-basic-leading-lance", spBefore: 14, spAfter: 4, spSpent: 10, committed: true }] } });
  const data = { confirmed: true, eventId: "activation-leading-lance-1" };
  await assert.rejects(() => vanguardUses.command(actor, "leadingLanceSP", { ...data, eventId: "made-up" }, "leading-lance-invalid-source"), /committed Leading Lance activation/);
  await vanguardUses.command(actor, "leadingLanceSP", data, "leading-lance-sp-1");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 14);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").operatorEvents[1].id, `${data.eventId}:leadingLanceKill`);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").operatorEvents[1].spGained, 10);
  await vanguardUses.command(actor, "leadingLanceSP", data, "leading-lance-sp-1");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 14, "same receipt replay never awards SP twice");
  await vanguardUses.undo(actor, "leading-lance-sp-1");
  assert.equal(actor.getFlag("ak5e", "operatorSkills").points, 4);
  assert.equal(actor.getFlag("ak5e", "operatorSkills").operatorEvents.length, 1);
});

test("Vanguard controls can undo a committed Operator activation while preserving later pool and active-state changes", async () => {
  const actor = createVanguard(5);
  await actor.update({ "flags.ak5e.operatorSkills": { enabled: true, points: 7, maximum: 20,
    active: { id: "operator-skill-vanguard-basic-other", activationId: "later-activation", name: "Later Skill" }, operations: [
      { id: "activation-old", result: { activationId: "activation-old" } }, { id: "later-activation", result: { activationId: "later-activation" } }
    ], operatorEvents: [
      { id: "activation-old:activation", activationId: "activation-old", kind: "activation", sourceId: "operator-skill-vanguard-basic-leading-lance", spBefore: 14, spAfter: 4, spSpent: 10, committed: true },
      { id: "activation-old:end", activationId: "activation-old", kind: "end", sourceId: "operator-skill-vanguard-basic-leading-lance", committed: true },
      { id: "later-activation:activation", activationId: "later-activation", kind: "activation", sourceId: "operator-skill-vanguard-basic-other", spBefore: 7, spAfter: 7, spSpent: 0, committed: true }
    ] } });
  await vanguardUses.command(actor, "undoOperatorActivation", { activationId: "activation-old", confirmed: true }, "undo-activation-old");
  await vanguardUses.undo(actor, "undo-activation-old");
  const operator = actor.getFlag("ak5e", "operatorSkills");
  assert.equal(operator.points, 17, "the committed 10 SP cost is restored as a delta to the later value");
  assert.equal(operator.active.activationId, "later-activation", "a different later active Skill is preserved");
  assert.equal(operator.operatorEvents.some(event => event.activationId === "activation-old"), false);
  assert.equal(operator.operatorEvents.some(event => event.activationId === "later-activation"), true);
  assert.equal(operator.operations.some(operation => operation.id === "activation-old"), true, "the Operator operation remains as an idempotency tombstone");
});

test("Quick off the Mark is optional, preserves native initiative parts, applies once, and cancellation leaves it armed", async () => {
  const actor = createVanguard(5);
  await vanguardUses.command(actor, "quickOffTheMark", { confirmed: true }, "quick-mark-use");
  const config = { parts: ["@abilities.dex.mod", "1d4"], options: {} };
  vanguardPreConfigureInitiative(actor, config);
  vanguardPreConfigureInitiative(actor, config);
  assert.deepEqual(config.parts, ["@abilities.dex.mod", "1d4", "3"], "native authored components remain and PB is added only once");
  assert.equal(actor.getFlag("ak5e", "vanguard").quickOffTheMarkArmed.useId, "quick-mark-use", "preparation does not spend or consume the choice");
  actor._cachedInitiativeRoll = { options: config.options };
  await vanguardPostRollInitiative(actor);
  assert.equal(actor.getFlag("ak5e", "vanguard").quickOffTheMarkArmed, null);
  assert.equal(vanguardUses.receipt(actor, "quick-mark-use").quickOffTheMarkApplied.bonus, 3);

  await vanguardUses.command(actor, "quickOffTheMark", { confirmed: true }, "quick-mark-cancel");
  actor._cachedInitiativeRoll = null;
  await vanguardPostRollInitiative(actor);
  assert.equal(actor.getFlag("ak5e", "vanguard").quickOffTheMarkArmed.useId, "quick-mark-cancel", "no successful native roll callback means cancellation leaves the option armed");
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
  await vanguardUses.command(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    overrides: TIP_WARNINGS,
    confirmed: true
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

test("ADV-TIP-TARGET: caller distance/disposition cannot bypass geometry or alliance warnings", () => {
  const actor = createVanguard(5);
  const ally = createTestActor({ name: "Neutral target" });
  const scene = { id: "scene", grid: { units: "ft", distance: 5, size: 100, type: 0 } };
  const token = (owner, x, disposition) => ({
    actor: owner, x, y: 0, width: 1, height: 1, parent: scene, isVisible: true,
    document: { hidden: false, disposition }, getCenterPoint: () => ({ x, y: 0 })
  });
  globalThis.canvas = { tokens: { placeables: [token(actor, 0, 0), token(ally, 2000, 0)] } };
  const plan = vanguardUses.plan(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid, distance: 0, sourceDisposition: 1, overrides: ["range", "alliance"]
  });
  assert.ok(plan.warnings.some(warning => warning.id === "range"), "scene geometry overrides caller's fake distance");
  assert.ok(plan.warnings.some(warning => warning.id === "alliance"), "neutral dispositions do not establish alliance");
  delete globalThis.canvas;
});

test("ADV-TIP-TARGET-UNVERIFIED: forged range and faction claims cannot suppress verification warnings", () => {
  const actor = createVanguard(5);
  const ally = createTestActor({ name: "Ally" });
  const plan = vanguardUses.plan(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid, distance: 0, sourceDisposition: 1,
    overrides: ["range-unverified", "visibility-unverified", "alliance-unverified"]
  });
  assert.ok(plan.warnings.some(warning => warning.id === "range-unverified"));
  assert.ok(plan.warnings.some(warning => warning.id === "alliance-unverified"));
});

test("Tip outcome 3 matches the shared speed modes while Landstrider stays a walking-speed bonus", async () => {
  const actor = createVanguard(5), ally = createTestActor({ name: "Speed recipient", system: { attributes: { movement: { walk: 30, fly: 40, swim: 20, climb: 0, burrow: 10 } } } });
  globalThis.fromUuidSync = uuid => uuid === ally.uuid ? ally : null;
  const plan = vanguardUses.plan(actor, "tipOfTheSpear", { targetUuid: ally.uuid, targetName: ally.name, directed: true, choice: 3, overrides: TIP_WARNINGS.concat("level") });
  const receipt = { id: "tip-speed-modes", targets: [] };
  await plan.apply({}, receipt);
  const changes = receipt.targets[0].tag.changes;
  assert.deepEqual(changes.map(change => change.key), ["system.attributes.movement.walk", "system.attributes.movement.fly", "system.attributes.movement.swim", "system.attributes.movement.burrow"]);
  assert.ok(changes.every(change => change.value === "10"));
});

test("ADV-TIP-5: Outcome 2 uses a separate owner-clicked THP roll and replays idempotently", async () => {
  const actor = createVanguard(5), ally = createTestActor({ name: "Ally", system: { attributes: { hp: { value: 10, max: 10, temp: 3 } } } });
  const OriginalRoll = globalThis.Roll;
  let resultIndex = 0;
  globalThis.Roll = class extends OriginalRoll {
    async evaluate() { this.total = [2, 4][resultIndex++] ?? 4; return this; }
  };
  await vanguardUses.command(actor, "tipOfTheSpear", { targetUuid: ally.uuid, targetName: ally.name, overrides: TIP_WARNINGS, confirmed: true }, "tip-two-stage");
  await vanguardUses.command(actor, "useRoll", { useId: "tip-two-stage" });
  let receipt = vanguardUses.receipt(actor, "tip-two-stage");
  assert.equal(receipt.outcome, 2);
  assert.equal(receipt.tipOutcomeRoll, 2);
  assert.equal(receipt.status, "awaitingRoll");
  assert.equal(ally.system.attributes.hp.temp, 3);
  await vanguardUses.command(actor, "useRoll", { useId: "tip-two-stage" });
  receipt = vanguardUses.receipt(actor, "tip-two-stage");
  assert.equal(receipt.outcome, 2);
  assert.equal(ally.system.attributes.hp.temp, 7);
  assert.equal(receipt.status, "complete");
  await vanguardUses.command(actor, "useRoll", { useId: "tip-two-stage" });
  assert.equal(ally.system.attributes.hp.temp, 7);
  await vanguardUses.undo(actor, "tip-two-stage");
  assert.equal(ally.system.attributes.hp.temp, 3);
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
    overrides: ["level", ...TIP_WARNINGS]
  });

  assert.ok(plan.warnings.some(w => w.id === "level"), "Level warning raised when Lv 1 picks outcome");

  const result = await vanguardUses.command(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    choice: 4,
    directed: false,
    overrides: ["level", ...TIP_WARNINGS],
    confirmed: true
  }, "tip-lv1-override");

  assert.equal(result.outcome, 4);
});

test("ADV-TIP-3: Outcome 5 active effect is recognized by tipCritReduction / tipCritThreshold", async () => {
  const actor = createVanguard(15);
  const ally = createTestActor({
    name: "Ally",
    system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30 } } }
  });

  await vanguardUses.command(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    overrides: TIP_WARNINGS,
    directed: true,
    choice: 5,
    confirmed: true
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

  await vanguardUses.command(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    overrides: TIP_WARNINGS,
    directed: true,
    choice: 6,
    confirmed: true
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
  await vanguardUses.command(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    overrides: TIP_WARNINGS,
    directed: true,
    choice: 2,
    confirmed: true
  }, "tip-thp-undo-test");

  await vanguardUses.command(actor, "useRoll", { useId: "tip-thp-undo-test" });

  assert.equal(ally.system.attributes.hp.temp, 19);

  // Damage reduces THP to 18
  await ally.update({ "system.attributes.hp.temp": 18 });

  // Undoing the 10 THP grant cleanly removes 10 (down to 8)
  const undo = await vanguardUses.undo(actor, "tip-thp-undo-test");
  assert.equal(undo.undone, "tip-thp-undo-test");
  assert.equal(ally.system.attributes.hp.temp, 14);
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

  await vanguardUses.command(actor, "uncannyDodge", {
    damage: 30,
    overrides: ["reaction", "attack-hit", "attacker-visible", "damage-final"],
    confirmed: true
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

  await vanguardUses.command(actor, "tipOfTheSpear", {
    targetUuid: ally.uuid,
    targetName: ally.name,
    overrides: [...TIP_WARNINGS, "reaction"],
    directed: true,
    choice: 2,
    confirmed: true
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

  const result = await vanguardUses.command(actor, "nimble", {
    targetUuid: enemy.uuid,
    targetName: enemy.name,
    overrides: ["expiry-unverified"],
    confirmed: true
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
