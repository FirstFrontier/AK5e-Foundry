import test from "node:test";
import assert from "node:assert/strict";
import {
  defenderCommand, registerDefenderHooks, getDefenderView, defenderTurnEvent, defenderRest, syncDefenderReactions, adamantineNotice,
  resilience, shelteredAllies, shelterAttackHook, nearFeet
} from "../scripts/defender-features.mjs";
import { getPoolDefinition } from "../scripts/resource-pools.mjs";
import { fixture, world } from "./defender-fixture.mjs";

const turn = (actor, uuid = "Combat.c1") => ({ started: true, uuid, round: 1, turn: 0, combatant: { id: "m1", actor: { uuid: actor.uuid } } });

test("Resilience and Indestructible pools follow the Defender table", () => {
  world(); registerDefenderHooks();
  assert.deepEqual(getPoolDefinition("resilience").max.rows, [[1, 4], [7, 6], [14, 8], [20, 10]]);
  assert.equal(getPoolDefinition("resilience").recovery[0].on, "lr");
  assert.equal(getPoolDefinition("indestructible").recovery[0].on, "sr");
  assert.equal(resilience(fixture({ level: 6 })).max, 4);
  assert.equal(resilience(fixture({ level: 7 })).max, 6);
  assert.equal(resilience(fixture({ level: 20 })).max, 10);
});

test("commands require an owned, configured Defender", async () => {
  world(); registerDefenderHooks();
  await assert.rejects(defenderCommand(fixture({ enabled: false }), "resilience", {}, "op1"), /configured Defender/);
  await assert.rejects(defenderCommand(fixture({ owner: false }), "resilience", {}, "op1"), /configured Defender/);
  await assert.rejects(defenderCommand(fixture(), "bogus", {}, "op1"), /Unknown/);
});

test("Shelter as a Bonus Action spends 1 Resilience; as an Action it is free; neither without confirmed allies", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 4 });
  const data = { activation: "bonus", allies: ["Token.a", "Token.b"], alliesConfirmed: true, positionConfirmed: true };
  await assert.rejects(defenderCommand(actor, "shelter", { ...data, alliesConfirmed: false }, "s0"), /ally/);
  assert.equal(resilience(actor).value, 4, "rejected command spends nothing");
  assert.deepEqual(actor.flags.ak5e.defender.operations, [], "rejected command leaves no blocking receipt");
  const result = await defenderCommand(actor, "shelter", data, "s1");
  assert.equal(resilience(actor).value, 3);
  assert.deepEqual(shelteredAllies(actor), ["Token.a", "Token.b"]);
  assert.match(result.instruction, /Disadvantage/);
  const replay = await defenderCommand(actor, "shelter", data, "s1");
  assert.equal(resilience(actor).value, 3, "replay does not spend again");
  assert.deepEqual(replay, result);
  await assert.rejects(defenderCommand(actor, "shelter", { ...data, activation: "action" }, "s1"), /exact choices/);
  await defenderCommand(actor, "shelter", { ...data, activation: "action", allies: ["Token.c"] }, "s2");
  assert.equal(resilience(actor).value, 3);
  assert.deepEqual(shelteredAllies(actor), ["Token.c"], "a new Shelter replaces the old one");
  await assert.rejects(defenderCommand(actor, "shelter", { ...data, activation: "reaction" }, "s3"), /Bonus Action/);
  await assert.rejects(defenderCommand(actor, "shelter", { ...data, allies: ["Token.a", "Token.a"] }, "s4"), /distinct/);
});

test("Shelter needs the Defender's own Turn in combat and cannot protect the Defender", async () => {
  const actor = fixture({ res: 4 });
  const docs = world({ started: true, uuid: "Combat.c1", round: 1, turn: 1, combatant: { id: "other", actor: { uuid: "Actor.other" } } });
  registerDefenderHooks();
  const data = { activation: "action", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true };
  await assert.rejects(defenderCommand(actor, "shelter", data, "s1"), /during your Turn/);
  globalThis.game.combat = turn(actor);
  actor.getActiveTokens = () => [{ uuid: "Token.d", parent: { id: "scene" } }];
  await assert.rejects(defenderCommand(actor, "shelter", { ...data, allies: ["Token.d"] }, "s2"), /does not protect the Defender/);
  await defenderCommand(actor, "shelter", data, "s3");
  assert.equal(actor.flags.ak5e.defender.shelter.declaredTurn, "Combat.c1:1:m1");
  assert.ok(docs);
});

test("Shelter ends at the start of the Defender's next Turn, not on other combatants' turns, and is not re-run for the same event", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 4 }); globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await defenderCommand(actor, "shelter", { activation: "action", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true }, "s1");
  const event = { kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 2, combatantId: "m1", skipped: false };
  await defenderTurnEvent({ ...event, kind: "turnEnd" });
  assert.equal(shelteredAllies(actor).length, 1, "ending the Turn does not remove it");
  await defenderTurnEvent(event);
  assert.deepEqual(shelteredAllies(actor), []);
  const writes = actor.writes.length;
  await defenderTurnEvent(event);
  assert.equal(actor.writes.length, writes, "duplicate event writes nothing");
});

test("Long Rest clears Shelter and the per-rest uses", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 4 });
  await defenderCommand(actor, "shelter", { activation: "action", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true }, "s1");
  await defenderRest(actor, "short");
  assert.equal(shelteredAllies(actor).length, 1);
  await defenderRest(actor, "long");
  assert.equal(shelteredAllies(actor).length, 0);
});

test("a delayed current-Turn start event preserves Shelter just declared during that Turn", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 4 }); game.combat = turn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await defenderCommand(actor, "shelter", { activation: "action", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true }, "new-turn-shelter");
  await defenderTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 1, combatantId: "m1" });
  assert.equal(shelteredAllies(actor).length, 1);
  await defenderTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 2, combatantId: "m1" });
  assert.equal(shelteredAllies(actor).length, 0);
});

test("Leaping Defence: level 11, one Reaction per Attack, 1 Resilience regains it once", async () => {
  world(); registerDefenderHooks();
  const data = { attackId: "atk1", attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true };
  await assert.rejects(defenderCommand(fixture({ level: 10, res: 6 }), "leapingDefence", data, "l0"), /level 11/);
  const actor = fixture({ level: 11, res: 6 });
  await assert.rejects(defenderCommand(actor, "leapingDefence", { ...data, moveConfirmed: false }, "l1"), /moved/);
  const result = await defenderCommand(actor, "leapingDefence", data, "l2");
  assert.match(result.instructions[0], /hits you regardless of your Armour Class/);
  assert.equal(flagsReactionSpent(actor), 1);
  await assert.rejects(defenderCommand(actor, "leapingDefence", { ...data, attackId: "atk2" }, "l3"), /No Reaction available/);
  assert.equal(flagsReactionSpent(actor), 1, "failed spend leaves the budget unchanged");
  await defenderCommand(actor, "leapingRefund", { leapOperationId: "l2" }, "r1");
  assert.equal(resilience(actor).value, 5);
  assert.equal(flagsReactionSpent(actor), 0);
  await assert.rejects(defenderCommand(actor, "leapingRefund", { leapOperationId: "l2" }, "r2"), /already regained/);
  assert.equal(resilience(actor).value, 5);
});
const flagsReactionSpent = actor => actor.flags.ak5e.reactionBudget?.spent ?? 0;

test("Reactive: a second Reaction is available from level 13, for a different trigger only", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 13, res: 6 });
  assert.deepEqual(await syncDefenderReactions(actor), { changed: true, max: 2 });
  const writes = actor.writes.length;
  assert.deepEqual(await syncDefenderReactions(actor), { changed: false, max: 2 });
  assert.equal(actor.writes.length, writes);
  const data = { attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true };
  await defenderCommand(actor, "leapingDefence", { ...data, attackId: "a1" }, "l1");
  await defenderCommand(actor, "leapingDefence", { ...data, attackId: "a2" }, "l2");
  await assert.rejects(defenderCommand(actor, "leapingDefence", { ...data, attackId: "a3" }, "l3"), /No Reaction/);
  const low = fixture({ level: 12 });
  assert.deepEqual(await syncDefenderReactions(low), { changed: false, max: 1 });
});

test("Stand Behind Me adds its movement instruction only from level 17", async () => {
  world(); registerDefenderHooks();
  const data = { attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true, attackId: "a1" };
  const sixteen = await defenderCommand(fixture({ level: 16, res: 8 }), "leapingDefence", data, "l1");
  const seventeen = await defenderCommand(fixture({ level: 17, res: 8 }), "leapingDefence", data, "l1");
  assert.ok(!sixteen.instructions.some(i => /Stand Behind Me/.test(i)));
  assert.ok(seventeen.instructions.some(i => /15 feet/.test(i)));
});

test("Indestructible doubles DR once per Short Rest and can be restored for 2 Resilience on the Defender's Turn", async () => {
  const actor = fixture({ level: 18, res: 8 });
  world(turn(actor)); registerDefenderHooks();
  const data = { damageId: "d1", hostileConfirmed: true, reduction: 3, amount: 20, type: "slashing" };
  await assert.rejects(defenderCommand(fixture({ level: 17 }), "indestructible", data, "i0"), /level 18/);
  await assert.rejects(defenderCommand(actor, "indestructible", { ...data, hostileConfirmed: false }, "i1"), /hostile/);
  const result = await defenderCommand(actor, "indestructible", data, "i2");
  assert.equal(result.doubledReduction, 6);
  assert.equal(result.preview.final, 14, "20 damage minus doubled DR 6");
  assert.equal(flagsReactionSpent(actor), 1);
  await assert.rejects(defenderCommand(actor, "indestructible", { ...data, damageId: "d2" }, "i3"), /spent/);
  globalThis.game.combat = { started: true, uuid: "Combat.c1", round: 1, turn: 1, combatant: { id: "x", actor: { uuid: "Actor.other" } } };
  await assert.rejects(defenderCommand(actor, "restoreIndestructible", {}, "i4"), /own Turn/);
  globalThis.game.combat = turn(actor);
  await defenderCommand(actor, "restoreIndestructible", {}, "i5");
  assert.equal(resilience(actor).value, 6);
  assert.equal(actor.flags.ak5e.resourcePools.indestructible.value, 1);
  await assert.rejects(defenderCommand(actor, "restoreIndestructible", {}, "i6"), /not spent/);
});

test("Indestructible with no Damage Reduction says doubling changes nothing", async () => {
  world(); registerDefenderHooks();
  const result = await defenderCommand(fixture({ level: 18, res: 8 }), "indestructible", { damageId: "d1", hostileConfirmed: true, reduction: 0 }, "i1");
  assert.equal(result.doubledReduction, 0);
  assert.match(result.instruction, /changes nothing/);
});

test("insufficient Resilience rejects the command with no partial receipt", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 0 });
  await assert.rejects(defenderCommand(actor, "shelter", { activation: "bonus", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true }, "s1"), /Not enough/);
  assert.deepEqual(actor.flags.ak5e.defender.operations, []);
  assert.equal(shelteredAllies(actor).length, 0);
});

test("manual Resilience adjustment needs a reason and cannot exceed the pool", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 2 });
  await assert.rejects(defenderCommand(actor, "resilience", { mode: "spend", amount: 1, reason: "" }, "m1"), /reason/);
  await defenderCommand(actor, "resilience", { mode: "spend", amount: 2, reason: "Table ruling" }, "m2");
  assert.equal(resilience(actor).value, 0);
  await defenderCommand(actor, "resilience", { mode: "refund", amount: 99, reason: "Table ruling" }, "m3");
  assert.equal(resilience(actor).value, resilience(actor).max);
});

test("GM reconciliation of an interrupted operation requires a GM and a reason", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ res: 4 });
  actor.flags.ak5e.defender.operations.push({ id: "stuck", command: "shelter", data: {}, status: "prepared", done: { spend: true } });
  await assert.rejects(defenderCommand(actor, "resilience", { mode: "spend", amount: 1, reason: "x y z" }, "m1"), /Retry or reconcile/);
  await assert.rejects(defenderCommand(actor, "reconcile", { operationId: "stuck", reason: "long enough reason" }, "r1"), /GM/);
  globalThis.game.user.isGM = true;
  await defenderCommand(actor, "reconcile", { operationId: "stuck", reason: "Checked Resilience and map at the table." }, "r2");
  assert.equal(actor.flags.ak5e.defender.operations.find(o => o.id === "stuck").status, "reconciled");
  await defenderCommand(actor, "resilience", { mode: "spend", amount: 1, reason: "Table ruling" }, "m1");
});

test("Adamantine Defence notice appears only for a Critical Hit on a level-20 Defender", async () => {
  const documents = world(); registerDefenderHooks();
  const level20 = fixture({ level: 20 }), level19 = fixture({ level: 19 });
  level20.uuid = "Actor.d20"; level19.uuid = "Actor.d19";
  const token = actor => ({ uuid: `Token.${actor.id}${actor.uuid}`, actor });
  const t20 = token(level20), t19 = token(level19);
  documents.set(t20.uuid, t20); documents.set(t19.uuid, t19);
  game.users = [{ id: "gm", isGM: true }, { id: "p1", isGM: false }];
  level20.testUserPermission = (user) => user.id === "p1";
  const base = { attackId: "a1", targets: [{ uuid: t20.uuid, hit: true }, { uuid: t19.uuid, hit: true }] };
  await adamantineNotice({ ...base, critical: false });
  assert.equal(game.messages.length, 0);
  await adamantineNotice({ ...base, critical: true });
  assert.equal(game.messages.length, 1);
  assert.deepEqual(game.messages[0].whisper.sort(), ["gm", "p1"]);
  assert.match(game.messages[0].content, /non-Critical/);
  await adamantineNotice({ ...base, targets: [{ uuid: t20.uuid, hit: false }], critical: true });
  assert.equal(game.messages.length, 1);
});

test("the view reports the profile, pools and pending operations without writing", () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 18, res: 8, branch: "artshield" });
  actor.flags.ak5e.defender.operations.push({ id: "p", command: "shelter", status: "prepared" });
  const writes = actor.writes.length;
  const view = getDefenderView(actor);
  assert.equal(view.profile.branch, "artshield");
  assert.equal(view.resilience.max, 8);
  assert.equal(view.indestructible.max, 1);
  assert.equal(view.pending.length, 1);
  assert.equal(actor.writes.length, writes);
});

function mapFixture(documents, { allyDistance = 5, otherDistance = 25 } = {}) {
  const scene = { id: "scene", grid: { size: 100, distance: 5, units: "ft", type: 0 }, tokens: new Map() };
  const actor = fixture({ res: 4 });
  const token = (id, col, tokenActor = null) => ({ id, uuid: `Token.${id}`, name: id, x: col * 100 - 50, y: 0, width: 1, height: 1, elevation: 0, parent: scene, actor: tokenActor,
    getCenterPoint() { return { x: this.x + 50, y: 50 }; } });
  const defenderToken = token("defender", 0, actor), ally = token("ally", allyDistance / 5, { uuid: "Actor.ally", flags: {} }), far = token("far", otherDistance / 5, { uuid: "Actor.far", flags: {} });
  for (const t of [defenderToken, ally, far]) { scene.tokens.set(t.id, t); documents.set(t.uuid, t); }
  actor.getActiveTokens = () => [defenderToken];
  documents.set(actor.uuid, actor);
  return { scene, actor, defenderToken, ally, far };
}

test("Shelter imposes Disadvantage on Attacks against sheltered allies still within 5 ft, checked at attack time", async () => {
  const documents = world(); registerDefenderHooks();
  const { actor, ally, far, defenderToken } = mapFixture(documents);
  await defenderCommand(actor, "shelter", { activation: "action", allies: [ally.uuid, far.uuid], alliesConfirmed: true, tokenUuid: defenderToken.uuid }, "s1");
  const roll = () => ({ rolls: [{ options: {} }] });
  const attackOn = target => { const config = roll(); game.user.targets = new Set([target]); shelterAttackHook(config); return config.rolls[0].options; };
  assert.equal(attackOn(ally).disadvantage, true);
  assert.equal(attackOn(far).disadvantage, undefined, "ally outside 5 ft is not protected");
  assert.equal(attackOn(defenderToken).disadvantage, undefined, "the Defender is never protected");
  ally.x = 600; // the ally walks away after Shelter was declared
  assert.equal(attackOn(ally).disadvantage, undefined);
  far.x = 50; // and another sheltered ally walks in
  assert.equal(attackOn(far).disadvantage, true);
  const unsheltered = { ...ally, uuid: "Token.stranger", actor: { uuid: "Actor.s", flags: {} } };
  documents.set(unsheltered.uuid, unsheltered);
  assert.equal(attackOn(unsheltered).disadvantage, undefined, "geometry alone never makes an ally");
  await defenderTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "C", round: 2, combatantId: "m1" });
  ally.x = 50;
  assert.equal(attackOn(ally).disadvantage, undefined, "Shelter ended");
});

test("a command that fails validation after computing leaves no spent Reaction, no spent use and no blocking receipt", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 18, res: 8 });
  await assert.rejects(defenderCommand(actor, "indestructible", { damageId: "d1", hostileConfirmed: true, reduction: 3, amount: -4 }, "i1"));
  assert.equal(flagsReactionSpent(actor), 0);
  assert.equal(actor.flags.ak5e.resourcePools.indestructible, undefined);
  assert.deepEqual(actor.flags.ak5e.defender.operations, []);
  await defenderCommand(actor, "indestructible", { damageId: "d2", hostileConfirmed: true, reduction: 3, amount: 10 }, "i2");
});

test("Leaping Refund spends nothing when the Reaction was already regained at Turn start", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 11, res: 6 });
  await defenderCommand(actor, "leapingDefence", { attackId: "a1", attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true }, "leap");
  actor.flags.ak5e.reactionBudget = { ...actor.flags.ak5e.reactionBudget, spent: 0, triggers: {}, receipts: {} };   // the Turn-start refresh
  await assert.rejects(defenderCommand(actor, "leapingRefund", { leapOperationId: "leap" }, "r1"), /already been regained/);
  assert.equal(resilience(actor).value, 6);
  assert.deepEqual(actor.flags.ak5e.defender.operations.map(o => o.id), ["leap"]);
});

test("a diagonal neighbour counts as 5 ft when the grid can measure a path; without one the straight line applies", () => {
  const scene = { grid: { size: 100, distance: 5, units: "ft", type: 1 } };
  const token = { x: 50, y: 50, width: 1, height: 1, elevation: 0, parent: scene, getCenterPoint() { return { x: 100, y: 100 }; } };
  const origin = { x: 0, y: 0, elevation: 0 };
  assert.equal(nearFeet(scene, origin, token, 5), false, "straight line is 7.07 ft");
  scene.grid.measurePath = () => ({ distance: 5 });
  assert.equal(nearFeet(scene, origin, token, 5), true);
  scene.grid.measurePath = () => ({ distance: 10 });
  assert.equal(nearFeet(scene, origin, token, 5), false);
  scene.grid.measurePath = () => { throw new Error("no grid"); };
  assert.equal(nearFeet(scene, origin, token, 5), false);
});

test("a stale copy of the state cannot overwrite a key another client changed", async () => {
  world(); registerDefenderHooks();
  const actor = fixture({ level: 5, res: 4 });
  actor.flags.ak5e.defender.advance = { active: true, watch: { attacked: false, dealt: false } };
  await defenderRest(actor, "short");                                   // no change, no write
  const stale = (await import("../scripts/defender-rules.mjs")).defenderState(actor);   // the owner client reads its copy
  await actor.update({ "flags.ak5e.defender.advance.watch.attacked": true });             // the GM client records an Attack by path
  stale.uses.example = true;                                                                 // the owner client then saves something unrelated
  const { writeDefenderState } = await import("../scripts/defender-features.mjs");
  await writeDefenderState(actor, stale);
  assert.equal(actor.flags.ak5e.defender.advance.watch.attacked, true, "the GM's change survives");
  assert.equal(actor.flags.ak5e.defender.uses.example, true);
  const writes = actor.writes.length;
  await writeDefenderState(actor, stale);
  assert.equal(actor.writes.length, writes, "an unchanged state writes nothing");
  delete stale.uses.example; stale.shelter = null;
  await writeDefenderState(actor, stale);
  assert.equal("example" in actor.flags.ak5e.defender.uses, false, "removed keys are deleted");
});
