/**
 * Adversarial tests for WP vanguard-base (rules, progression, setup, features,
 * resolution). They exercise malformed stored data, numeric strings, non-finite
 * values, prototype keys, stale previews, repeated hooks and cancellation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  VANGUARD_CLASS_ID, checkLevel, hitPointsAtLevel, martialDC, vanguardDC,
  vanguardProfile, vanguardEnabled, vanguardLevel, vanguardState, calculateVanguardProfile
} from "../scripts/vanguard-rules.mjs";
import {
  recordNimbleTarget, isNimbleAgainst, clearNimbleTargets,
  executeUncannyDodge, calculateUncannyDodge, hasUncannyDodge,
  activateDirectedEngagement, isDirectedEngagementActive, clearDirectedEngagement,
  lightspeedSecondInitiative, isLightspeedApplicable,
  approachingStormDamageBonus, executeTipOfTheSpear, TIP_OUTCOMES, validateTipTarget
} from "../scripts/vanguard-features.mjs";
import {
  vanguardPreRollDamage, vanguardPostRollDamage,
  vanguardPreConfigureInitiative, vanguardPostRollInitiative
} from "../scripts/vanguard-resolution.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { tipEffectId } from "../scripts/tip-of-the-spear.mjs";
import {
  previewVanguardProgression, applyVanguardProgression, vanguardChoices, beginVanguardReceipt
} from "../scripts/vanguard-progression.mjs";
import { previewVanguardSetup, applyVanguardSetup } from "../scripts/vanguard-setup.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});
test.afterEach(() => {
  teardownFoundryGlobals();
});

let sequence = 0;
const freshUseId = prefix => `${prefix}-attack-${Date.now()}-${++sequence}`;

function classItem(level = 5) {
  return createTestItem({
    name: "Vanguard", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } }
  });
}

function branchItem(id, name = `Vanguard: ${id}`) {
  return createTestItem({
    name, type: "subclass", system: { classIdentifier: "vanguard" },
    flags: { ak5e: { chapterThreeId: id } }
  });
}

function vanguard(level = 5, { items = [], flags = {}, system = {}, name = "Attack Vanguard" } = {}) {
  return createTestActor({
    name,
    items: [classItem(level), ...items],
    flags: { ak5e: { vanguard: { enabled: true, ...flags } } },
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 30, max: 30, temp: 0 } },
      abilities: { str: { mod: 1 }, dex: { mod: 3 }, con: { mod: 2 }, int: { mod: 0 }, wis: { mod: 0 }, cha: { mod: 1 } },
      ...system
    }
  });
}

function combatMock({ uuid = "Combat.attack", started = true, round = 1, combatantId = "ct0" } = {}) {
  const combat = {
    uuid, started, round,
    combatants: new Map([["ct0", { id: "ct0" }], ["ct1", { id: "ct1" }]]),
    combatant: { id: combatantId }
  };
  globalThis.game.combat = combat;
  return combat;
}

/* ---------------------------------------------------------------- levels */

test("attack levels: booleans, arrays, objects and fractional strings never become Vanguard levels", () => {
  for (const level of [true, false, [5], {}, [], 2.5, "3.5", "abc", 0, 21, null, undefined]) {
    assert.throws(() => checkLevel(level), /./, `level ${JSON.stringify(level)}`);
  }
  for (let level = 1; level <= 20; level++) {
    assert.equal(checkLevel(level), level);
    assert.equal(checkLevel(String(level)), level);
  }

  for (const level of [true, [5], {}, "3.5"]) {
    const actor = vanguard(5);
    const cls = [...actor.items.values()].find(item => item.type === "class");
    cls.system.levels = level;
    const profile = vanguardProfile(actor);
    assert.equal(profile.level, null, `stored level ${JSON.stringify(level)} must not coerce`);
    assert.deepEqual(profile.blocked, ["InvalidClassLevel"]);
    assert.equal(vanguardEnabled(actor), false);
  }
});

test("attack profile: inherited and malformed branch identities never resolve", () => {
  for (const poison of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", " ", 5, {}, ["subclass-vanguard-agent"]]) {
    const actor = createTestActor({
      items: [classItem(5), branchItem(poison)],
      flags: { ak5e: { vanguard: { enabled: true } } }
    });
    const profile = vanguardProfile(actor);
    assert.equal(profile.branch, null, `branch ${JSON.stringify(poison)}`);
    assert.deepEqual(profile.blocked, ["UnknownBranch"]);
    assert.equal(vanguardEnabled(actor), false);
  }
  const duplicate = createTestActor({
    items: [classItem(5), branchItem("subclass-vanguard-agent"), branchItem("subclass-vanguard-agent")],
    flags: { ak5e: { vanguard: { enabled: true } } }
  });
  assert.deepEqual(vanguardProfile(duplicate).blocked, []);
  assert.equal(vanguardProfile(duplicate).branch, "agent");

  const conflicting = createTestActor({
    items: [classItem(5), branchItem("subclass-vanguard-agent"), branchItem("constructor")],
    flags: { ak5e: { vanguard: { enabled: true } } }
  });
  assert.deepEqual(vanguardProfile(conflicting).blocked, ["ConflictingVanguardBranches"]);
});

test("attack profile: malformed vanguard flag state cannot crash or enable a blocked actor", () => {
  const actor = createTestActor({
    items: [classItem(5), branchItem("subclass-vanguard-agent")],
    flags: { ak5e: { vanguard: "enabled" } }
  });
  const state = vanguardState(actor);
  assert.equal(state.enabled, false);
  assert.deepEqual(state.operations, []);
  assert.equal(vanguardEnabled(actor), false);
});

/* ---------------------------------------------------------------- HP / DC */

test("attack HP: mode, count and die bounds are validated before arithmetic", () => {
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "wild" }));
  assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled", rolls: [] }));
  assert.throws(() => hitPointsAtLevel(3, 0, { mode: "rolled", rolls: [4] }));
  for (const roll of [0, 9, -1, 4.5, "4", true, null, undefined, NaN, Infinity]) {
    assert.throws(() => hitPointsAtLevel(2, 0, { mode: "rolled", rolls: [roll] }), /./, `roll ${String(roll)}`);
  }
  for (const con of [1.5, "abc", true, null, Infinity, NaN]) {
    assert.throws(() => hitPointsAtLevel(2, con), /./, `CON ${String(con)}`);
  }
  assert.equal(hitPointsAtLevel(2, 0, { mode: "rolled", rolls: [7] }), 15);
  assert.equal(hitPointsAtLevel(2, -10), 2);
});

test("attack DC: fixed ability selection, shared PB and finite modifiers only", () => {
  const actor = vanguard(5, { system: { abilities: { str: { mod: 1 }, dex: { mod: "4" }, con: { mod: 0 } }, attributes: { prof: 4 } } });
  assert.equal(martialDC(actor, "dex"), 8 + 4 + 4);
  assert.equal(martialDC(actor), null);
  for (const ability of ["cha", "constructor", "toString", "__proto__", ""]) {
    assert.equal(martialDC(actor, ability), null);
  }
  for (const bad of [Infinity, NaN, "abc", null, undefined]) {
    actor.system.abilities.str.mod = bad;
    assert.throws(() => martialDC(actor, "str"), /./, `modifier ${String(bad)}`);
  }
  actor.system.abilities.str.mod = 1;
  for (const pb of [Infinity, NaN, -1, 2.5, "abc", null, true]) {
    actor.system.attributes.prof = pb;
    assert.throws(() => martialDC(actor, "str"), /./, `PB ${String(pb)}`);
  }
  actor.system.attributes.prof = 4;
  assert.equal(vanguardDC(actor), 8 + 4 + 4);
  actor.system.abilities.dex.mod = Infinity;
  assert.throws(() => vanguardDC(actor), /./);
});

test("attack DC: persisted choice is read, malformed choice is refused", () => {
  const actor = vanguard(1, { system: { attributes: { prof: 2 }, abilities: { str: { mod: 1 }, dex: { mod: 5 }, con: { mod: 0 } } } });
  actor.flags.ak5e.vanguard.martialDCAbility = "dex";
  assert.equal(martialDC(actor), 15);
  actor.flags.ak5e.vanguard.martialDCAbility = "constructor";
  assert.equal(martialDC(actor), null);
});

/* ---------------------------------------------------------------- Nimble */

test("attack Nimble: missing, placeholder and whitespace identifiers are refused before any write", async () => {
  const actor = vanguard(1);
  for (const bad of [undefined, null, {}, { uuid: "" }, " ", "undefined", "NULL", 5, true]) {
    await assert.rejects(() => recordNimbleTarget(actor, bad), /./, `target ${String(bad)}`);
  }
  assert.equal(actor.flags.ak5e.vanguard?.nimbleTargets, undefined);
});

test("attack Nimble: duplicate records are idempotent and cross-combat turns expire", async () => {
  const actor = vanguard(1);
  const enemy = createTestActor({ name: "Enemy", type: "npc" });
  const other = createTestActor({ name: "Other", type: "npc" });
  await recordNimbleTarget(actor, enemy);
  const writesAfterFirst = actor.writes.length;
  await recordNimbleTarget(actor, enemy);
  assert.equal(actor.writes.length, writesAfterFirst, "same-turn duplicate performs no extra write");
  await recordNimbleTarget(actor, other);
  assert.deepEqual(actor.flags.ak5e.vanguard.nimbleTargets, [enemy.uuid, other.uuid]);

  const combat = combatMock({ uuid: "Combat.nimble", started: true, round: 1, combatantId: "ct0" });
  await actor.update({ "flags.ak5e.vanguard.nimbleTurn": { combatId: combat.uuid, round: 1, combatantId: "ct0" } });
  assert.equal(isNimbleAgainst(actor, enemy), true);
  combat.round = 2;
  assert.equal(isNimbleAgainst(actor, enemy), false, "later round ends protection");
  combat.round = 1;
  combat.combatant = { id: "ct1" };
  assert.equal(isNimbleAgainst(actor, enemy), false, "another combatant's turn ends protection");
  combat.combatant = { id: "ct0" };
  combat.uuid = "Combat.other";
  assert.equal(isNimbleAgainst(actor, enemy), false, "a different combat ends protection");
  combat.started = false;
  assert.equal(isNimbleAgainst(actor, enemy), false, "ended combat ends protection");

  await clearNimbleTargets(actor);
  assert.deepEqual(actor.flags.ak5e.vanguard.nimbleTargets, []);
  assert.equal(actor.flags.ak5e.vanguard.nimbleTurn, null);
  await clearNimbleTargets(actor);
});

/* ---------------------------------------------------------------- Quick */

test("attack Quick off the Mark: malformed armed state never reaches the native roll", () => {
  const actor = vanguard(3);
  for (const armed of [
    { bonus: Infinity, useId: "u" }, { bonus: NaN, useId: "u" }, { bonus: 2.5, useId: "u" },
    { bonus: 0, useId: "u" }, { bonus: -2, useId: "u" }, { bonus: "abc", useId: "u" },
    { bonus: 2 }, { bonus: 2, useId: "" }, { bonus: 2, useId: "undefined" }, { bonus: 2, useId: 5 }
  ]) {
    actor.flags.ak5e.vanguard.quickOffTheMarkArmed = armed;
    const config = { parts: ["1d20"] };
    vanguardPreConfigureInitiative(actor, config);
    assert.deepEqual(config.parts, ["1d20"], `armed ${JSON.stringify(armed)}`);
    assert.equal(config._ak5eQuickOffTheMark, undefined);
  }
  actor.flags.ak5e.vanguard.quickOffTheMarkArmed = { bonus: 2, useId: "u" };
  const config = { parts: ["1d20"], options: {} };
  vanguardPreConfigureInitiative(actor, config);
  vanguardPreConfigureInitiative(actor, config);
  assert.deepEqual(config.parts, ["1d20", "2"], "one injection per configuration");
});

test("attack Quick off the Mark: mismatched, missing and already-applied receipts do not consume", async () => {
  const actor = vanguard(3);
  const useId = freshUseId("quick");
  await actor.update({
    "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 2, useId },
    "flags.ak5e.vanguardUses": { undo: [{ id: useId, command: "quickOffTheMark", flagChanges: [{ path: "flags.ak5e.vanguard.quickOffTheMarkArmed" }] }] }
  });
  for (const marker of [
    undefined, null, "junk", { actorUuid: actor.uuid, useId: "other", bonus: 2 },
    { actorUuid: "Actor.other", useId, bonus: 2 }, { actorUuid: actor.uuid, useId, bonus: Infinity }
  ]) {
    actor._cachedInitiativeRoll = { options: { _ak5eQuickOffTheMark: marker } };
    await vanguardPostRollInitiative(actor);
    assert.ok(actor.flags.ak5e.vanguard.quickOffTheMarkArmed, `marker ${JSON.stringify(marker)}`);
  }
  delete actor._cachedInitiativeRoll;
  await vanguardPostRollInitiative(actor);
  assert.ok(actor.flags.ak5e.vanguard.quickOffTheMarkArmed, "no cached roll never consumes");

  await actor.update({ "flags.ak5e.vanguardUses": { undo: [] } });
  actor._cachedInitiativeRoll = { options: { _ak5eQuickOffTheMark: { actorUuid: actor.uuid, useId, bonus: 2 } } };
  await vanguardPostRollInitiative(actor);
  assert.ok(actor.flags.ak5e.vanguard.quickOffTheMarkArmed, "missing receipt never consumes");
});

/* ---------------------------------------------------------------- Uncanny */

test("attack Uncanny Dodge: every invalid damage value fails before the Reaction is spent", async () => {
  for (const bad of ["abc", -5, 1.5, Infinity, NaN, undefined, null, true, ""]) {
    const actor = vanguard(11);
    assert.equal(getReactions(actor).available, 1);
    await assert.rejects(() => executeUncannyDodge(actor, { damage: bad }), /./, `damage ${String(bad)}`);
    assert.equal(getReactions(actor).available, 1, `damage ${String(bad)} must not spend`);
  }
  const actor = vanguard(11);
  await assert.rejects(() => executeUncannyDodge(actor, { damage: 10, receiptId: 5 }), /./);
  await assert.rejects(() => executeUncannyDodge(actor, { damage: 10, receiptId: " " }), /./);
  assert.equal(getReactions(actor).available, 1);
});

test("attack Uncanny Dodge: exact halving and single expenditure survive receipt replay", async () => {
  assert.equal(calculateUncannyDodge(25), 12);
  assert.equal(calculateUncannyDodge(0), 0);
  for (const bad of [-1, 1.5, "1.5", Infinity, NaN, null, undefined, true]) {
    assert.throws(() => calculateUncannyDodge(bad), /./, `damage ${String(bad)}`);
  }
  const actor = vanguard(11);
  const first = await executeUncannyDodge(actor, { damage: 25, receiptId: "r-1" });
  assert.deepEqual([first.halvedDamage, first.damageReduced], [12, 13]);
  assert.equal(getReactions(actor).available, 0);
  await assert.rejects(() => executeUncannyDodge(actor, { damage: 10, receiptId: "r-2" }), /./);
  assert.equal(getReactions(actor).available, 0);
});

/* ---------------------------------------------------------------- Directed */

test("attack Directed Engagement: gate, one Reaction, scoped expiry and failure does not double-spend", async () => {
  const low = vanguard(14);
  await assert.rejects(() => activateDirectedEngagement(low, { receiptId: "r-low" }), /Directed Engagement/);
  assert.equal(getReactions(low).available, 1);

  const actor = vanguard(15);
  await activateDirectedEngagement(actor, { receiptId: "r-1" });
  assert.equal(getReactions(actor).available, 0);
  await assert.rejects(() => activateDirectedEngagement(actor, { receiptId: "r-2" }), /Reaction/);
  assert.equal(getReactions(actor).available, 0);
  assert.equal(actor.flags.ak5e.vanguard.directedEngagementActive, true);

  const combat = combatMock({ uuid: "Combat.directed", started: true, round: 1, combatantId: "ct0" });
  await actor.update({ "flags.ak5e.vanguard.directedEngagementTurn": { combatId: combat.uuid, round: 1, combatantId: "ct0" } });
  assert.equal(isDirectedEngagementActive(actor), true);
  combat.round = 2;
  assert.equal(isDirectedEngagementActive(actor), false);
  combat.round = 1;
  combat.combatant = { id: "ct1" };
  assert.equal(isDirectedEngagementActive(actor), false);
  combat.combatant = { id: "ct0" };
  combat.started = false;
  assert.equal(isDirectedEngagementActive(actor), false);

  await clearDirectedEngagement(actor);
  assert.equal(actor.flags.ak5e.vanguard.directedEngagementActive, false);
  assert.equal(actor.flags.ak5e.vanguard.directedEngagementTurn, null);
});

/* ---------------------------------------------------------------- Lightspeed */

test("attack Lightspeed: only a started numeric Round 1 qualifies and fractional initiative is floored", () => {
  const actor = vanguard(18);
  for (const combat of [null, {}, { round: 1 }, { started: false, round: 1 }, { started: "yes", round: 1 }, { started: true, round: 2 }, { started: true, round: "2" }, { started: true, round: true }, { started: true, round: [] }]) {
    assert.equal(isLightspeedApplicable(actor, combat), false, `combat ${JSON.stringify(combat)}`);
  }
  assert.equal(isLightspeedApplicable(actor, { started: true, round: 1 }), true);
  assert.equal(isLightspeedApplicable(vanguard(17), { started: true, round: 1 }), false);

  assert.equal(lightspeedSecondInitiative(5), -5);
  assert.equal(lightspeedSecondInitiative(-2), -12);
  assert.equal(lightspeedSecondInitiative("12"), 2);
  assert.equal(lightspeedSecondInitiative(14.16), 4);
  for (const bad of [Infinity, NaN, null, undefined, "", true, "fast", []]) {
    assert.throws(() => lightspeedSecondInitiative(bad), /./, `initiative ${String(bad)}`);
  }
});

/* ---------------------------------------------------------------- Storm */

test("attack Approaching Storm: level/round gates and recorded reading are respected", () => {
  assert.equal(approachingStormDamageBonus(vanguard(19), { started: true, round: 1 }), 0);
  assert.equal(approachingStormDamageBonus(vanguard(20), { started: true, round: 1 }), 10);
  assert.equal(approachingStormDamageBonus(vanguard(20), { started: "yes", round: 1 }), 0);
  assert.equal(approachingStormDamageBonus(vanguard(20), { started: true, round: true }), 0);
  assert.equal(approachingStormDamageBonus(vanguard(20), { started: true, round: 2 }), 0);
  assert.equal(approachingStormDamageBonus(vanguard(20), { started: true, round: "1" }), 10);
  assert.equal(approachingStormDamageBonus(vanguard(20), null), 0);
});

test("attack Approaching Storm: malformed or stale armed data never injects and stays armed", () => {
  const actor = vanguard(20);
  const combat = combatMock({ uuid: "Combat.storm-attack", started: true, round: 1 });
  const component = { parts: ["1d8"], options: {} };
  for (const armed of [
    { bonus: Infinity, useId: "s", combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 },
    { bonus: 2.5, useId: "s", combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 },
    { bonus: "abc", useId: "s", combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 },
    { bonus: 10, useId: "", combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 },
    { bonus: 10, useId: "s", combatId: "Combat.other", round: 1, reading: "once", componentIndex: 0 },
    { bonus: 10, useId: "s", combatId: combat.uuid, round: 2, reading: "once", componentIndex: 0 },
    { bonus: 10, useId: "s", combatId: combat.uuid, round: 1, reading: "both", componentIndex: 0 },
    { bonus: 10, useId: "s", combatId: combat.uuid, round: 1, reading: "once", componentIndex: -1 },
    { bonus: 10, useId: "s", combatId: combat.uuid, round: 1, reading: "once", componentIndex: 1.5 }
  ]) {
    actor.flags.ak5e.vanguard.approachingStormArmed = armed;
    const config = { subject: { actor }, rolls: [{ parts: ["1d8"], options: {} }] };
    vanguardPreRollDamage(config, {}, {});
    assert.deepEqual(config.rolls[0].parts, ["1d8"], `armed ${JSON.stringify(armed)}`);
    assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed, "malformed arm is not silently cleared");
  }
  combat.round = 2;
  actor.flags.ak5e.vanguard.approachingStormArmed = { bonus: 10, useId: "s", combatId: combat.uuid, round: 1, reading: "once", componentIndex: 0 };
  const roundTwo = { subject: { actor }, rolls: [{ parts: ["1d8"], options: {} }] };
  vanguardPreRollDamage(roundTwo, {}, {});
  assert.deepEqual(roundTwo.rolls[0].parts, ["1d8"], "first round only");
});

test("attack Approaching Storm: per-roll component selection and duplicate injection protection", () => {
  const actor = vanguard(20);
  combatMock({ uuid: "Combat.storm-dupe", started: true, round: 1 });
  actor.flags.ak5e.vanguard.approachingStormArmed = { bonus: 10, useId: "s", combatId: "Combat.storm-dupe", round: 1, reading: "perRoll", componentIndex: 0 };
  const first = { parts: ["1d8"], options: {} }, second = { parts: ["2"], options: {} };
  const config = { subject: { actor }, rolls: [first, second, first] };
  vanguardPreRollDamage(config, {}, {});
  assert.deepEqual(first.parts, ["1d8", "10"]);
  assert.deepEqual(second.parts, ["2", "10"]);
  vanguardPreRollDamage(config, {}, {});
  assert.equal(first.parts.filter(part => part === "10").length, 1, "same roll receives one injection");
  assert.equal(second.parts.filter(part => part === "10").length, 1);
});

test("attack Approaching Storm: post-roll validation and concurrent replay consume once", async () => {
  const actor = vanguard(20);
  combatMock({ uuid: "Combat.storm-post", started: true, round: 1 });
  const useId = freshUseId("storm");
  actor.flags.ak5e.vanguard.approachingStormArmed = { bonus: 10, useId, combatId: "Combat.storm-post", round: 1, reading: "once", componentIndex: 0 };
  actor.flags.ak5e.vanguardUses = { undo: [{ id: useId, command: "approachingStorm", flagChanges: [{ path: "flags.ak5e.vanguard.approachingStormArmed" }] }] };
  await assert.doesNotReject(() => vanguardPostRollDamage(null, { subject: { actor } }));
  await assert.doesNotReject(() => vanguardPostRollDamage([{ parts: ["1d8"], options: { _ak5eApproachingStorm: { actorUuid: actor.uuid, useId, bonus: Infinity } } }], { subject: { actor } }));
  assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed, "invalid marker bonus does not consume");
  await assert.doesNotReject(() => vanguardPostRollDamage([{ parts: ["1d8"], options: { _ak5eApproachingStorm: { actorUuid: actor.uuid, useId: "missing", bonus: 10 } } }], { subject: { actor } }));
  assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed, "missing receipt does not consume");

  const component = { parts: ["1d8"], options: {} };
  const config = { subject: { actor }, rolls: [component] };
  vanguardPreRollDamage(config, {}, {});
  const originalUpdate = actor.update.bind(actor);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  actor.update = async (changes, options = {}) => { await gate; return originalUpdate(changes, options); };
  const one = vanguardPostRollDamage([component], { subject: { actor } });
  const two = vanguardPostRollDamage([component], { subject: { actor } });
  release();
  await Promise.all([one, two]);
  assert.equal(actor.flags.ak5e.vanguard.approachingStormArmed, null);
  assert.equal(actor.flags.ak5e.vanguardUses.undo[0].approachingStormApplied.bonus, 10);
  const writeCount = actor.writes.length;
  await vanguardPostRollDamage([component], { subject: { actor } });
  assert.equal(actor.writes.length, writeCount, "a replayed marker never writes twice");
});

test("attack Approaching Storm: non-owner actors never consume", async () => {
  const actor = vanguard(20);
  actor.isOwner = false;
  combatMock({ uuid: "Combat.storm-owner", started: true, round: 1 });
  const useId = freshUseId("storm-owner");
  actor.flags.ak5e.vanguard.approachingStormArmed = { bonus: 10, useId, combatId: "Combat.storm-owner", round: 1, reading: "once", componentIndex: 0 };
  actor.flags.ak5e.vanguardUses = { undo: [{ id: useId, command: "approachingStorm" }] };
  await vanguardPostRollDamage([{ parts: ["1d8"], options: { _ak5eApproachingStorm: { actorUuid: actor.uuid, useId, bonus: 10 } } }], { subject: { actor } });
  assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed);
});

/* ---------------------------------------------------------------- Tip */

test("attack Tip contract: range, membership and bearer PB boundaries", () => {
  assert.deepEqual(TIP_OUTCOMES.map(entry => entry.id), ["tip1", "tip2", "tip3", "tip4", "tip5", "tip6"]);
  const bearer = vanguard(9);
  const outsider = createTestActor({ name: "Outsider", prof: 2 });
  assert.equal(TIP_OUTCOMES[0].value(bearer), 4);
  assert.equal(TIP_OUTCOMES[0].value(outsider), 2);
  const helpers = { withinFeet: () => true, tokenPoint: () => ({ x: 0, y: 0 }) };
  assert.equal(validateTipTarget({ source: bearer, target: outsider, helpers }), true);
  for (const range of [0, -5, NaN, "60", null]) {
    assert.throws(() => validateTipTarget({ source: bearer, target: outsider, range, helpers }), /./, `range ${String(range)}`);
  }
  assert.equal(validateTipTarget({ source: bearer, target: outsider, range: Infinity, helpers: {} }), true);
  assert.throws(() => validateTipTarget({ source: bearer, target: outsider, helpers: {} }), /distance helper/);
  assert.notEqual(tipEffectId({ id: "op" }, { actor: outsider }, 0), tipEffectId({ id: "op" }, { actor: outsider }, 1));
  assert.equal(TIP_OUTCOMES[0].expiryActor, "source");
  assert.equal(TIP_OUTCOMES[0].trigger, "turnStart");
});

test("attack Tip execution: target, level, directed choice, operation and helper validation", async () => {
  const outsider = createTestActor({ name: "Outside" });
  const bearer = vanguard(15);
  const recipient = createTestActor({ name: "Ally", prof: 2 });
  const helpers = { dice: async () => 4, tagged: async () => ({ id: "e" }), temporaryHP: async () => ({}) };

  await assert.rejects(() => executeTipOfTheSpear({ actor: outsider, target: { actor: outsider }, helpers }));
  for (const target of [null, {}, { actor: {} }, { actor: { uuid: " " } }]) {
    await assert.rejects(() => executeTipOfTheSpear({ actor: bearer, target, helpers }), /./, `target ${JSON.stringify(target)}`);
  }
  for (const op of [null, {}, { id: "" }, { id: 5 }]) {
    await assert.rejects(() => executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, op, helpers }), /./);
  }
  await assert.rejects(() => executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, helpers: [] }), /./);
  await assert.rejects(() => executeTipOfTheSpear({ actor: vanguard(14), target: { actor: recipient }, directed: true, choice: 1, helpers }), /Directed Engagement/);
  for (const choice of [null, 0, 7, "1", 1.5]) {
    await assert.rejects(() => executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, directed: true, choice, helpers }), /./, `choice ${String(choice)}`);
  }

  const calls = { dice: 0, tagged: [], temp: [] };
  const tracked = {
    dice: async () => { calls.dice++; return 4; },
    tagged: async (_actor, _item, targetActor, id, _options, metadata) => { calls.tagged.push({ targetActor, id, metadata }); return { id }; },
    temporaryHP: async (...args) => { calls.temp.push(args); return {}; }
  };
  const plain = await executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, op: { id: "op-plain" }, helpers: tracked });
  assert.equal(plain.outcome, 4);
  assert.equal(calls.dice, 1, "exactly one explicit outcome roll");
  const directed = await executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, directed: true, choice: 1, op: { id: "op-directed" }, helpers: tracked });
  assert.equal(directed.outcome, 1);
  assert.equal(calls.dice, 1, "directed choice never rolls");
  assert.equal(calls.tagged.at(-1).metadata.value, 5, "metadata carries the giver's PB");
  assert.equal(calls.tagged.at(-1).targetActor, recipient);
  const second = await executeTipOfTheSpear({ actor: bearer, target: { actor: recipient }, directed: true, choice: 2, op: { id: "op-second" }, helpers: tracked });
  assert.equal(second.outcome, 2);
  assert.equal(calls.temp.at(-1)[1], 4);
  assert.equal(calls.temp.at(-1)[2], true);
  assert.equal(globalThis.game.messages.length, 0, "no automatic chat roll");
});

/* ---------------------------------------------------------------- Progression */

function progressionActor(level = 1) {
  return createTestActor({
    name: "Progression Attack",
    items: [classItem(level)],
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 10, max: 10, temp: 0 } },
      abilities: {
        str: { value: 12, mod: 1, proficient: 0 }, dex: { value: 16, mod: 3, proficient: 0 },
        con: { value: 14, mod: 2, proficient: 0 }, int: { value: 10, mod: 0, proficient: 0 },
        wis: { value: 10, mod: 0, proficient: 0 }, cha: { value: 12, mod: 1, proficient: 0 }
      },
      skills: { acr: { value: 0 }, ath: { value: 0 }, prc: { value: 0 }, per: { value: 0 }, ste: { value: 0 }, ak5ewilderness: { value: 0 } },
      traits: { saves: { value: ["authored"] }, armorProf: { value: ["authored-armor"] }, weaponProf: { value: ["authored-weapon"] }, toolProf: { value: [] } },
      currency: { cp: 0 }
    },
    flags: { ak5e: { custom: { authored: true } } }
  });
}

const validChoices = (overrides = {}) => ({
  branch: "subclass-vanguard-agent",
  martialDCAbility: "dex",
  saves: ["cha"],
  skills: ["acr", "ath", "ste"],
  tool: "Messenger Kit",
  startingEquipment: { mode: "cash" },
  hp: { 1: { mode: "fixed" } },
  ...overrides
});

test("attack progression choices: null/array options are refused, saved malformed arrays do not spread", () => {
  const actor = progressionActor(1);
  assert.throws(() => vanguardChoices(actor, null), /object/);
  assert.throws(() => vanguardChoices(actor, []), /object/);
  actor.flags.ak5e.vanguardProgression = { choices: { skills: "acr", saves: "cha", hp: "junk", asi: "junk", talents: "junk", startingEquipment: "junk", branches: "junk" } };
  const choices = vanguardChoices(actor);
  assert.deepEqual(choices.skills, []);
  assert.deepEqual(choices.saves, ["cha"]);
  assert.equal(choices.hp.junk, undefined);
  assert.equal(choices.hp[1].mode, "existing");
  assert.deepEqual(choices.asi, {});
  assert.deepEqual(choices.talents, {});
  assert.deepEqual(choices.branches, {});
});

test("attack progression HP: impossible fixed/rolled values and malformed modes stay pending", async () => {
  const actor = progressionActor(3);
  const bad = [
    { hp: { 1: { mode: "fixed", roll: 9 } } },
    { hp: { 1: { mode: "rolled", roll: 5 } } },
    { hp: { 2: { mode: "fixed", roll: 6 } } },
    { hp: { 2: { mode: "rolled", roll: 0 } } },
    { hp: { 2: { mode: "rolled", roll: 9 } } },
    { hp: { 2: { mode: "rolled", roll: 3.5 } } },
    { hp: { 2: { mode: "wild" } } },
    { hp: { 2: { mode: "rolled" } } }
  ];
  for (const overrides of bad) {
    const plan = await previewVanguardProgression(actor, validChoices(overrides));
    assert.ok(plan.pending.some(entry => String(entry).startsWith("hp.")), `pending for ${JSON.stringify(overrides)}`);
    assert.equal(actor.writes.length, 0, "preview writes nothing");
  }
});

test("attack progression ASI/skills/saves/equipment: duplicate and out-of-range choices are pending", async () => {
  const actor = progressionActor(4);
  const invalid = [
    { skills: ["acr", "acr", "ste"] },
    { skills: ["acr", "ath", "constructor"] },
    { skills: ["acr", "ath"] },
    { saves: [] },
    { saves: ["str", "cha"] },
    { saves: ["dex"] },
    { martialDCAbility: "constructor" },
    { startingEquipment: { mode: "wild" } },
    { startingEquipment: { mode: "items", weapon1: "equipment-light-combat-gear-2", weapon2: "equipment-light-combat-gear-2", armour: "equipment-light-combat-gear-2" } },
    { asi: { 4: { mode: "apply", increases: [{ ability: "str", amount: 3 }] } } },
    { asi: { 4: { mode: "apply", increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 2 }] } } },
    { asi: { 4: { mode: "apply", increases: [{ ability: "str", amount: 1 }, { ability: "str", amount: 1 }] } } },
    { asi: { 4: { mode: "apply", increases: [{ ability: "constructor", amount: 2 }] } } }
  ];
  for (const overrides of invalid) {
    const plan = await previewVanguardProgression(actor, validChoices(overrides));
    assert.ok(plan.pending.length > 0, `expected pending for ${JSON.stringify(overrides)}`);
    await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: validChoices(overrides) }));
    assert.equal(actor.writes.length, 0, "refused apply writes nothing");
  }

  actor.system.abilities.str.value = 19;
  const capped = await previewVanguardProgression(actor, validChoices({ asi: { 4: { mode: "apply", increases: [{ ability: "str", amount: 2 }] } } }));
  assert.ok(capped.pending.includes("asi.cap.str"), "cap 20 is enforced");
});

test("attack progression apply: stale, unconfirmed and replayed contexts never duplicate grants", async () => {
  const actor = progressionActor(1);
  const choices = validChoices();
  const plan = await previewVanguardProgression(actor, choices);
  assert.equal(actor.writes.length, 0);
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: "true", contextKey: plan.contextKey, choices }));
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: "stale", choices }));
  await actor.update({ "system.abilities.int.value": 11 });
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices }));
  assert.equal(actor.writes.length, 1, "only the deliberate stale mutation wrote");

  const fresh = await previewVanguardProgression(actor, choices);
  const applied = await applyVanguardProgression(actor, { confirmed: true, contextKey: fresh.contextKey, choices });
  assert.equal(applied.success, true);
  const afterFirst = structuredClone(actor.toObject());
  assert.equal(actor.system.currency.cp, 1300);
  assert.equal(actor.system.attributes.hp.max, 20);
  assert.equal(actor.system.abilities.dex.proficient, 1);
  assert.equal(actor.system.abilities.cha.proficient, 1);
  assert.deepEqual(actor.system.traits.saves.value, ["authored"], "authored save data preserved");
  assert.deepEqual(actor.system.traits.armorProf.value.includes("authored-armor"), true);
  assert.deepEqual(actor.getFlag("ak5e", "custom"), { authored: true });

  const replay = await previewVanguardProgression(actor, choices);
  assert.equal(replay.pending.length, 0);
  assert.equal(replay.writes["system.currency.cp"], undefined);
  assert.equal(replay.writes["system.attributes.hp.max"], undefined);
  const writesBeforeReplay = actor.writes.length;
  await applyVanguardProgression(actor, { confirmed: true, contextKey: replay.contextKey, choices });
  assert.equal(actor.writes.length, writesBeforeReplay, "replay performs no writes, including the receipt ledger");
  assert.deepEqual(actor.toObject(), afterFirst, "second apply changes nothing");
  assert.ok((actor.flags.ak5e.vanguardUses?.undo ?? []).every(receipt => receipt.status !== "applying"));
});

test("checkpoint: replay compares persisted source, not prepared DataModel fields", async () => {
  const actor = progressionActor(1), choices = validChoices();
  const first = await previewVanguardProgression(actor, choices);
  await applyVanguardProgression(actor, { confirmed: true, contextKey: first.contextKey, choices });
  actor._source = { system: structuredClone(actor.system), flags: structuredClone(actor.flags) };
  actor.system.tools.ak5emessengerkit.preparedOnly = true;
  const replay = await previewVanguardProgression(actor, choices);
  const before = actor.writes.length;
  await applyVanguardProgression(actor, { confirmed: true, contextKey: replay.contextKey, choices });
  assert.equal(actor.writes.length, before);
  assert.ok(actor.flags.ak5e.vanguardUses.undo.every(entry => entry.status !== "applying"));
});

test("attack progression apply: rejected pending plans and malformed actor HP never write", async () => {
  const actor = progressionActor(1);
  const pending = await previewVanguardProgression(actor, validChoices({ skills: ["acr"] }));
  await assert.rejects(() => applyVanguardProgression(actor, { confirmed: true, contextKey: pending.contextKey, choices: validChoices({ skills: ["acr"] }) }));
  assert.equal(actor.writes.length, 0);

  actor.system.attributes.hp.max = Infinity;
  await assert.rejects(() => previewVanguardProgression(actor, validChoices()), /Hit Point maximum/);
  actor.system.attributes.hp.max = 10;
  actor.system.abilities.con.mod = 1.5;
  await assert.rejects(() => previewVanguardProgression(actor, validChoices()), /Constitution/);
});

/* ---------------------------------------------------------------- Setup */

test("attack setup: preview writes nothing, confirm/stale are enforced, replay creates nothing", async () => {
  const actor = progressionActor(5);
  const preview = await previewVanguardSetup(actor);
  assert.ok(preview.creates.length > 0);
  assert.equal(actor.writes.length, 0);
  assert.equal(actor.created.length, 0);
  await assert.rejects(() => applyVanguardSetup(actor, { confirmed: false, contextKey: preview.contextKey }));
  await assert.rejects(() => applyVanguardSetup(actor, { confirmed: true, contextKey: "stale" }));
  assert.equal(actor.writes.length, 0);

  const applied = await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  assert.ok(applied.created.length > 0);
  const itemsAfter = actor.items.size;
  const writesAfter = actor.writes.length;
  const again = await previewVanguardSetup(actor);
  assert.deepEqual(again.creates, []);
  const reapplied = await applyVanguardSetup(actor, { confirmed: true, contextKey: again.contextKey });
  assert.equal(reapplied.created.length, 0);
  assert.equal(actor.items.size, itemsAfter, "no duplicate feature items");
  assert.equal(actor.writes.length, writesAfter, "idempotent replay writes nothing");

  const landstrider = [...actor.items.values()].find(item => item.flags?.ak5e?.chapterThreeId === "class-feature-vanguard-1st-level-landstrider-2798");
  const managed = [...landstrider.effects.values()].filter(effect => effect.flags?.ak5e?.vanguardManagedEffect === "landstrider-speed");
  assert.equal(managed.length, 1, "one managed Landstrider effect");
  assert.equal(Number(managed[0].changes[0].value), 10);

  const authored = [...actor.items.values()].find(item => item.flags?.ak5e?.chapterThreeId === "class-feature-vanguard-1st-level-landstrider-2798");
  authored.flags.ak5e.authored = true;
  await applyVanguardSetup(actor, { confirmed: true, contextKey: (await previewVanguardSetup(actor)).contextKey });
  assert.equal(authored.flags.ak5e.authored, true, "authored feature data preserved");
  assert.equal([...landstrider.effects.values()].filter(effect => effect.flags?.ak5e?.vanguardManagedEffect === "landstrider-speed").length, 1);
});

test("attack setup: malformed or blocked profiles are refused", async () => {
  const npc = createTestActor({ type: "npc", items: [classItem(5)] });
  await assert.rejects(() => previewVanguardSetup(npc));
  const compendium = createTestActor({ items: [classItem(5)], pack: "ak5e.classes" });
  await assert.rejects(() => previewVanguardSetup(compendium));
  const malformed = createTestActor({ items: [classItem(0)] });
  malformed.items.get([...malformed.items.keys()][0]).system.levels = "3.5";
  await assert.rejects(() => previewVanguardSetup(malformed));
});

/* ---------------------------------------------------------------- Rehydration */

test("attack rehydration: serialized flags survive a rebuild without duplication or coercion", async () => {
  const actor = progressionActor(5);
  const preview = await previewVanguardSetup(actor);
  await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  const useId = freshUseId("persist");
  await actor.update({
    "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 3, useId },
    "flags.ak5e.vanguard.nimbleTargets": ["Actor.enemy"],
    "flags.ak5e.vanguardUses": { undo: [{ id: useId, command: "quickOffTheMark" }] }
  });
  const reloaded = createTestActor(actor.toObject());
  assert.equal(vanguardEnabled(reloaded), true);
  assert.equal(vanguardLevel(reloaded), 5);
  assert.deepEqual(reloaded.flags.ak5e.vanguard.nimbleTargets, ["Actor.enemy"]);
  assert.equal(reloaded.flags.ak5e.vanguard.quickOffTheMarkArmed.useId, useId);
  assert.equal(reloaded.flags.ak5e.vanguardUses.undo.length, 1);
  const again = await previewVanguardSetup(reloaded);
  assert.deepEqual(again.creates, []);
  assert.equal(again.effectUpdates.length, 0);
});

test("attack progression: a native actor's prepared CON modifier is used for HP", async () => {
  const actor = progressionActor(1);
  actor._source = { system: structuredClone(actor.system) };
  actor._source.system.abilities.con.mod = 0;
  actor.system.abilities.con.mod = 3;
  const plan = await previewVanguardProgression(actor, validChoices());
  assert.equal(plan.writes["system.attributes.hp.max"], 10 + 8 + 3,
    "the prepared CON modifier must win over a source record that omits it");
});

test("attack Quick: an actor-side marker consumes when the cached roll drops custom options", async () => {
  const actor = vanguard(3);
  const useId = freshUseId("quick-marker");
  await actor.update({
    "flags.ak5e.vanguard.quickOffTheMarkArmed": { bonus: 2, useId },
    "flags.ak5e.vanguardUses": { undo: [{ id: useId, command: "quickOffTheMark",
      flagChanges: [{ path: "flags.ak5e.vanguard.quickOffTheMarkArmed" }] }] }
  });
  const config = { parts: ["1d20"] };
  vanguardPreConfigureInitiative(actor, config);
  assert.deepEqual(config.parts, ["1d20", "2"]);
  actor._cachedInitiativeRoll = { options: {} };
  await vanguardPostRollInitiative(actor);
  assert.equal(actor.flags.ak5e.vanguard.quickOffTheMarkArmed, null);
  const receipt = actor.flags.ak5e.vanguardUses.undo.find(entry => entry.id === useId);
  assert.deepEqual(receipt.quickOffTheMarkApplied, { bonus: 2 });
});


test("attack progression: apply records a reachable receipt and undo restores the before-state", async () => {
  const actor = progressionActor(1);
  actor.flags.ak5e.vanguard = { enabled: true };
  const choices = validChoices();
  const plan = await previewVanguardProgression(actor, choices);
  const itemsBefore = actor.items.size;
  const applied = await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices });
  assert.equal(applied.success, true);
  assert.equal(actor.system.currency.cp, 1300);
  const receipt = (actor.flags.ak5e.vanguardUses?.undo ?? []).find(entry => entry.command === "vanguardProgression");
  assert.ok(receipt, "progression apply must leave an undo receipt");
  assert.ok(receipt.targets?.some(target => target.kind === "vanguardCreatedItem"), "created Item IDs must be recorded");
  assert.ok(receipt.flagChanges?.some(change => change.path === "system.currency.cp"));
  await vanguardUses.command(actor, "undoUse", { useId: receipt.id }, freshUseId("undo-progression"));
  assert.equal(actor.system.currency.cp, 0, "undo restores cash");
  assert.equal(actor.system.attributes.hp.max, 10, "undo restores HP");
  assert.equal(actor.items.size, itemsBefore, "undo removes created Items");
  assert.equal(actor.getFlag("ak5e", "vanguardProgression"), undefined, "undo restores the progression flag");
});

test("attack setup: apply records created IDs and undo removes the granted features", async () => {
  const actor = progressionActor(5);
  actor.flags.ak5e.vanguard = { enabled: true };
  const preview = await previewVanguardSetup(actor);
  const itemsBefore = actor.items.size;
  await applyVanguardSetup(actor, { confirmed: true, contextKey: preview.contextKey });
  const receipt = (actor.flags.ak5e.vanguardUses?.undo ?? []).find(entry => entry.command === "vanguardSetup");
  assert.ok(receipt, "setup apply must leave an undo receipt");
  assert.ok(receipt.targets?.some(target => target.kind === "vanguardCreatedItem"));
  await vanguardUses.command(actor, "undoUse", { useId: receipt.id }, freshUseId("undo-setup"));
  assert.equal(actor.items.size, itemsBefore, "undo removes the granted feature Items");
  const again = await previewVanguardSetup(actor);
  assert.ok(again.creates.length > 0, "the undone setup is available again");
});

test("attack undo: preflight warns on a mid-batch conflict, restores safe fields, and posts the conflict", async () => {
  const actor = vanguard(5);
  const [first, second, created] = await actor.createEmbeddedDocuments("Item", [
    { name: "First", system: { value: 2, other: "after" } },
    { name: "Second", system: { value: 99 } },
    { name: "Created" }
  ]);
  const receipt = beginVanguardReceipt(actor, "vanguardProgression", "Progression");
  receipt.status = "complete";
  receipt.flagChanges = [{ path: "system.attributes.hp.max", beforePresent: true, before: 10, after: 30 }];
  receipt.targets = [
    { uuid: created.uuid, name: created.name, kind: "vanguardCreatedItem", applied: true },
    { uuid: first.uuid, name: first.name, kind: "vanguardItemRestore", applied: true, updates: [
      { path: "system.value", beforePresent: true, before: 1, after: 2 },
      { path: "system.other", beforePresent: false, after: "after" }
    ] },
    { uuid: second.uuid, name: second.name, kind: "vanguardItemRestore", applied: true, updates: [
      { path: "system.value", beforePresent: true, before: 1, after: 2 }
    ] }
  ];
  actor.flags.ak5e.vanguardUses = { undo: [receipt] };
  const preview = vanguardUses.previewUndo(actor, receipt.id);
  assert.match(preview.lines.join(" "), /Second: won't restore system.value/);
  await vanguardUses.command(actor, "undoUse", { useId: receipt.id }, freshUseId("partial"));
  assert.equal(first.system.value, 1);
  assert.equal(first.system.other, undefined);
  assert.equal(second.system.value, 99);
  assert.equal(actor.items.has(created.id), false);
  assert.equal(actor.system.attributes.hp.max, 10);
  assert.equal(vanguardUses.receipt(actor, receipt.id).status, "undone");
  assert.match(vanguardUses.receipt(actor, receipt.id).undoNotes.join(" "), /Second: won't restore system.value/);
  assert.match([...game.messages.values()].map(message => message.content).join(" "), /Second: won&#39;t restore system.value/);
});

test("attack undo: deleted effects retain identity across a failed ledger write", async () => {
  const actor = vanguard(5);
  const [quick] = await actor.createEmbeddedDocuments("Item", [{
    name: "Quick off the Mark", flags: { ak5e: { chapterThreeId: "class-feature-vanguard-3rd-level-quick-off-the-mark-4553" } },
    effects: [{ _id: "old-effect-id", name: "Obsolete", flags: { ak5e: { vanguardManagedEffect: "quick-off-mark-initiative" } } }]
  }]);
  const original = quick.effects.get("old-effect-id").toObject();
  const plan = await previewVanguardSetup(actor);
  await applyVanguardSetup(actor, { confirmed: true, contextKey: plan.contextKey });
  const receipt = vanguardUses.state(actor).undo.find(entry => entry.command === "vanguardSetup");
  assert.equal(receipt.targets.find(entry => entry.kind === "vanguardRestoreEffects").effects[0]._id, "old-effect-id");
  assert.equal(quick.effects.has("old-effect-id"), false);

  const update = actor.update.bind(actor);
  let fail = true;
  actor.update = async changes => {
    if (fail && changes["flags.ak5e.vanguardUses"]?.undo?.some(entry => entry.id === receipt.id && entry.status === "undone")) {
      fail = false; throw new Error("ledger write failed");
    }
    return update(changes);
  };
  await assert.rejects(vanguardUses.command(actor, "undoUse", { useId: receipt.id }, freshUseId("ledger")), /ledger write failed/);
  assert.equal(quick.effects.size, 1);
  assert.deepEqual(quick.effects.get("old-effect-id").toObject(), original);
  await vanguardUses.command(actor, "undoUse", { useId: receipt.id }, freshUseId("retry-ledger"));
  assert.equal(quick.effects.size, 1);
  assert.equal(vanguardUses.receipt(actor, receipt.id).status, "undone");
});

test("attack undo: effect collisions, duplicate IDs and legacy ID-less effects are skipped and noted", async () => {
  const actor = vanguard(5);
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "Item" }]);
  const [current] = await item.createEmbeddedDocuments("ActiveEffect", [{ _id: "collision", name: "Different" }]);
  const original = { ...current.toObject(), name: "Original" };
  const receipt = beginVanguardReceipt(actor, "vanguardSetup", "Setup");
  receipt.status = "complete";
  receipt.targets = [{ uuid: item.uuid, name: item.name, kind: "vanguardRestoreEffects", applied: true, effects: [original] }];
  actor.flags.ak5e.vanguardUses = { undo: [receipt] };
  const noId = { ...original }; delete noId._id; delete noId.id;
  receipt.targets[0].effects = [original, current.toObject(), noId, { _id: "safe", name: "Safe" }];
  assert.match(vanguardUses.previewUndo(actor, receipt.id).lines.join(" "), /occupied by a different effect/);
  await vanguardUses.command(actor, "undoUse", { useId: receipt.id }, freshUseId("collision"));
  assert.equal(item.effects.get("collision").name, "Different");
  assert.ok(item.effects.get("safe"));
  const notes = vanguardUses.receipt(actor, receipt.id).undoNotes.join(" ");
  assert.match(notes, /occupied by a different effect/);
  assert.match(notes, /repeated effect ID/);
  assert.match(notes, /without its original ID/);
});

test("attack turn scope: Nimble and Directed Engagement capture the actual combat round", async () => {
  const actor = vanguard(5);
  const enemy = createTestActor({ name: "Round 2 Enemy", type: "npc" });
  const combat = combatMock({ uuid: "Combat.round2", started: true, round: 2, combatantId: "ct0" });
  await recordNimbleTarget(actor, enemy);
  assert.equal(actor.flags.ak5e.vanguard.nimbleTurn.round, 2, "turn marker must record round 2");
  assert.equal(isNimbleAgainst(actor, enemy), true, "Nimble is not a Round-1-only feature");

  const directed = vanguard(15);
  globalThis.game.combat = combat;
  await activateDirectedEngagement(directed, { receiptId: freshUseId("round2-directed") });
  assert.equal(directed.flags.ak5e.vanguard.directedEngagementTurn.round, 2);
  assert.equal(isDirectedEngagementActive(directed), true);
});

test("attack profile: calculateVanguardProfile rejects non-finite PB and modifiers", () => {
  const actor = vanguard(3);
  actor.system.attributes.prof = Infinity;
  assert.throws(() => calculateVanguardProfile(actor), /./);
  actor.system.attributes.prof = 2;
  actor.system.abilities.dex.mod = NaN;
  assert.throws(() => calculateVanguardProfile(actor), /./);
});

test("checkpoint: half-proficiency upgrades to one and malformed values are rejected", async () => {
  const actor = progressionActor(1), choices = validChoices();
  actor.system.abilities.dex.proficient = 0.5;
  actor.system.abilities.cha.proficient = 0.5;
  actor.system.skills.acr.value = 0.5;
  actor.system.tools = { ak5emessengerkit: { value: 0.5, ability: "int" } };
  const plan = await previewVanguardProgression(actor, choices);
  assert.equal(plan.writes["system.abilities.dex.proficient"], 1);
  assert.equal(plan.writes["system.abilities.cha.proficient"], 1);
  assert.equal(plan.writes["system.skills.acr.value"], 1);
  assert.equal(plan.writes["system.tools.ak5emessengerkit"].value, 1);
  for (const invalid of [-1, 0.25, 1.5, 3, true, null, [], " ", Infinity]) {
    actor.system.skills.acr.value = invalid;
    await assert.rejects(() => previewVanguardProgression(actor, choices), /proficiency/);
  }
});

test("checkpoint: Storm round-two override arms, injects, and consumes its recorded reading", async () => {
  const actor = vanguard(20), combat = combatMock({ uuid: "Combat.r2", round: 2 });
  const data = { confirmed: true, overrides: ["round"], readings: { approachingStormComponents: "once" }, componentIndex: 0 };
  const preview = vanguardUses.preview(actor, "approachingStorm", data);
  assert.ok(preview.warnings.some(warning => warning.id === "round" || warning.code === "round"));
  const useId = freshUseId("storm-r2");
  await vanguardUses.command(actor, "approachingStorm", data, useId);
  assert.equal(actor.flags.ak5e.vanguard.approachingStormArmed.round, combat.round);
  const config = { subject: { actor }, rolls: [{ parts: ["1d8"], options: {} }] };
  vanguardPreRollDamage(config, {}, {});
  assert.deepEqual(config.rolls[0].parts, ["1d8", "10"]);
  await vanguardPostRollDamage(config.rolls, { subject: { actor } });
  assert.equal(actor.flags.ak5e.vanguard.approachingStormArmed, null);
  assert.equal(vanguardUses.receipt(actor, useId).approachingStormApplied.round, 2);
});

test("attack Storm: null/false/empty componentIndex is malformed, not component 0", () => {
  const actor = vanguard(20);
  const combat = combatMock({ uuid: "Combat.index", started: true, round: 1 });
  for (const componentIndex of [null, false, "", 1.5, -1]) {
    actor.flags.ak5e.vanguard.approachingStormArmed = { bonus: 10, useId: "index-use", combatId: combat.uuid, round: 1, reading: "once", componentIndex };
    const config = { subject: { actor }, rolls: [{ parts: ["1d8"], options: {} }] };
    vanguardPreRollDamage(config, {}, {});
    assert.deepEqual(config.rolls[0].parts, ["1d8"], `componentIndex ${JSON.stringify(componentIndex)}`);
    assert.ok(actor.flags.ak5e.vanguard.approachingStormArmed, "malformed arm remains unspent");
  }
});
