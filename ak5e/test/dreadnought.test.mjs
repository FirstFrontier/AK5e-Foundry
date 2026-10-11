import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { defenderCommand, registerDefenderHooks, defenderTurnEvent, defenderRest, resilience } from "../scripts/defender-features.mjs";
import { previewDefenderSetup, applyDefenderSetup, MANAGED_EFFECT_FLAG } from "../scripts/defender-setup.mjs";
import {
  registerDreadnoughtHooks, dreadnoughtPlanner, wreckingWallActivity, processAdvanceAttack, advanceAttackActivity, advanceDamageEvent, crownsplitterHook,
  skillPoints, advanceActive, ADVANCE_EFFECT_ID, WRECKING_WALL_FEATURE_ID, expireAdvances
} from "../scripts/dreadnought-features.mjs";

const hooks = {};
function boot({ combat = null, gm = false } = {}) {
  const documents = world(combat);
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); } };
  game.user.isGM = gm; game.users = [{ id: "gm", isGM: true }]; game.users.activeGM = { id: "player" };
  game.actors = new Map();
  ChatMessage.implementation.getSpeakerActor = speaker => documents.get(speaker?.actorUuid) ?? null;
  registerDefenderHooks(); registerDreadnoughtHooks();
  return documents;
}
function dreadnought({ level = 12, res = 6, advance = null, owner = true } = {}) {
  const actor = setup(fixture({ level, res, branch: "dreadnought", owner }));
  actor.type = "character";
  actor.flags.ak5e.resourcePools.dreadnoughtAdvance = undefined;
  delete actor.flags.ak5e.resourcePools.dreadnoughtAdvance;
  if (advance) actor.flags.ak5e.defender.advance = advance;
  return actor;
}
async function configured(actor) {
  const plan = previewDefenderSetup(actor);
  await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "setup" });
  return actor;
}
const turn = actor => ({ started: true, uuid: "Combat.c1", round: 1, turn: 0, combatant: { id: "m1", actor: { uuid: actor.uuid } } });
const grants = [];
const message = (id, { speaker = null, targets = [], type = "attack" } = {}) => ({ uuid: `ChatMessage.${id}`, id, speaker: { actorUuid: speaker }, flags: { dnd5e: { roll: { type }, targets: targets.map(uuid => ({ uuid })) } },
  getFlag() { return undefined; } });

test("setup plans the Advance effect for every Dreadnought, Legendary Might from 15, and Wrecking Wall from 9", () => {
  boot();
  const low = dreadnought({ level: 8 });
  let plan = previewDefenderSetup(low);
  assert.equal(plan.createEffects.length, 1);
  assert.equal(plan.createEffects[0].flags.ak5e[MANAGED_EFFECT_FLAG].sourceId, ADVANCE_EFFECT_ID);
  assert.equal(plan.createEffects[0].disabled, true, "the Advance bonus starts switched off");
  assert.deepEqual(plan.createEffects[0].changes, [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }]);
  assert.equal(plan.addActivities.length, 0);
  const high = dreadnought({ level: 15 });
  plan = previewDefenderSetup(high);
  const might = plan.createEffects.find(e => e.name === "Legendary Might");
  assert.deepEqual(might.changes.map(c => [c.key, c.mode, c.value]), [["system.abilities.str.value", 2, "6"], ["system.abilities.str.value", 3, "26"]]);
  assert.ok(might.changes[0].priority < might.changes[1].priority, "the +6 applies before the cap of 26");
  assert.ok(plan.missing.includes(WRECKING_WALL_FEATURE_ID), "a missing feature Item is reported, not invented");
  assert.equal(previewDefenderSetup(dreadnought({ level: 14 })).createEffects.some(e => e.name === "Legendary Might"), false);
});

test("Wrecking Wall activity matches the source: 10d6 bludgeoning, Constitution save, half on success, once per Long Rest", () => {
  const activity = wreckingWallActivity();
  assert.equal(activity.save.ability[0], "con");
  assert.equal(activity.damage.onSave, "half");
  assert.deepEqual([activity.damage.parts[0].number, activity.damage.parts[0].denomination, activity.damage.parts[0].types[0]], [10, 6, "bludgeoning"]);
  assert.deepEqual(activity.uses.recovery, [{ period: "lr", type: "recoverAll" }]);
  assert.equal(activity.activation.type, "action");
  assert.match(activity.save.dc.formula, /8 \+ @prof/);
  const feature = { id: "ww", name: "Wrecking Wall", system: { activities: new Map() }, flags: { ak5e: { chapterThreeId: WRECKING_WALL_FEATURE_ID } }, getFlag(s, k) { return this.flags[s][k]; } };
  const actor = dreadnought({ level: 9 }); actor.items.set("ww", feature);
  assert.equal(previewDefenderSetup(actor).addActivities.length, 1);
  assert.equal(previewDefenderSetup(dreadnought({ level: 8 })).addActivities.length, 0);
});

test("removing the Branch disables managed bonuses instead of deleting them", async () => {
  boot();
  const actor = await configured(dreadnought({ level: 15 }));
  assert.equal(actor.effects.size, 2);
  actor.items.delete("branch");
  const plan = previewDefenderSetup(actor);
  assert.deepEqual(plan.updateEffects.map(u => u.effect.name), ["Legendary Might"], "the active bonus is switched off; the already-disabled Advance needs no change");
  assert.equal(plan.updateEffects[0].changes.disabled, true);
  assert.equal(actor.effects.size, 2, "nothing is deleted");
});

test("Dreadnought's Advance: Bonus Action on the Dreadnought's Turn, costs the use, switches the bonus on", async () => {
  boot();
  const actor = await configured(dreadnought({ level: 7 }));
  game.combat = { started: true, uuid: "Combat.c1", round: 1, turn: 1, combatant: { id: "x", actor: { uuid: "Actor.other" } } };
  await assert.rejects(defenderCommand(actor, "advance", { confirmed: true }, "a0"), /during your Turn/);
  game.combat = turn(actor);
  await assert.rejects(defenderCommand(actor, "advance", {}, "a1"), /Bonus Action/);
  const result = await defenderCommand(actor, "advance", { confirmed: true }, "a2");
  assert.equal(result.advance.skillPoints, 2);
  assert.equal(advanceActive(actor), true);
  const effect = [...actor.effects.values()].find(e => e.flags.ak5e[MANAGED_EFFECT_FLAG].sourceId === ADVANCE_EFFECT_ID);
  assert.equal(effect.disabled, false);
  assert.equal(actor.flags.ak5e.resourcePools.dreadnoughtAdvance.value, 0);
  await assert.rejects(defenderCommand(actor, "advance", { confirmed: true }, "a3"), /already active/);
  await defenderCommand(actor, "endAdvance", {}, "a4");
  assert.equal(effect.disabled, true);
  await assert.rejects(defenderCommand(actor, "advance", { confirmed: true }, "a5"), /spent/);
  assert.equal(resilience(actor).value, 6);
  await defenderCommand(actor, "restoreAdvance", {}, "a6");
  assert.equal(resilience(actor).value, 4, "restoring costs 2 Resilience");
  await defenderCommand(actor, "advance", { confirmed: true }, "a7");
});

test("the Advance needs the Dreadnought Branch and the managed effect", async () => {
  boot();
  const other = await configured(setup(fixture({ level: 7, res: 6, branch: "artshield" })));
  await assert.rejects(defenderCommand(other, "advance", { confirmed: true }, "a1"), /Dreadnought Branch/);
  const noEffect = dreadnought({ level: 7 }); noEffect.flags.ak5e.defender.enabled = true;
  await assert.rejects(defenderCommand(noEffect, "advance", { confirmed: true }, "a1"), /Run Defender setup/);
  assert.equal(noEffect.flags.ak5e.resourcePools?.dreadnoughtAdvance, undefined, "nothing was spent");
});

test("the Advance lasts one minute of world time", async () => {
  boot();
  const actor = await configured(dreadnought({ level: 7 }));
  await defenderCommand(actor, "advance", { confirmed: true }, "a1");
  game.time.worldTime = 59; assert.equal(advanceActive(actor), true);
  game.time.worldTime = 60; assert.equal(advanceActive(actor), false);
  game.actors.set(actor.id, actor);
  game.user.isGM = true; game.users.activeGM = { id: game.user.id };
  await expireAdvances();
  assert.equal(actor.flags.ak5e.defender.advance.endedBy, "expired");
});

test("Skill Points: 1/2/3 by level, once per Attack Roll made and once per Attack Roll against, idempotent IDs", async () => {
  const documents = boot({ gm: true });
  grants.length = 0; skillPoints.grant = async (actor, grant) => { grants.push({ actor: actor.id, ...grant }); };
  for (const [level, expected] of [[1, 1], [7, 2], [14, 3]]) {
    grants.length = 0;
    const actor = await configured(dreadnought({ level, res: 4 })); actor.id = `d${level}`; actor.uuid = `Actor.d${level}`; documents.set(actor.uuid, actor);
    actor.flags.ak5e.defender.advance = { active: true, expiresAt: 60, watch: { attacked: false, dealt: false, forcedSave: false, tookDamage: false } };
    const enemy = { documentName: "Actor", uuid: "Actor.enemy", flags: {} }; documents.set(enemy.uuid, enemy);
    await processAdvanceAttack(message(`atk${level}`, { speaker: actor.uuid, targets: [enemy.uuid] }));
    assert.deepEqual(grants.map(g => g.amount), [expected]);
    assert.match(grants[0].id, /^dreadnought_attack_ChatMessage\.atk/);
    await processAdvanceAttack(message(`atk${level}`, { speaker: actor.uuid, targets: [enemy.uuid] }));
    assert.equal(grants[1].id, grants[0].id, "replay uses the same ID so the SP engine deduplicates");
    grants.length = 0;
    actor.flags.ak5e.defender.advance.watch.attacked = false;
    await processAdvanceAttack(message(`def${level}`, { speaker: enemy.uuid, targets: [actor.uuid] }));
    assert.deepEqual(grants.map(g => [g.amount, g.id.split("_")[1]]), [[expected, "defence"]]);
    assert.equal(actor.flags.ak5e.defender.advance.watch.attacked, false, "being Attacked does not count as making an Attack");
  }
});

test("Skill Points: a roll with no target still counts, and nothing is awarded when the Advance is inactive or off the GM client", async () => {
  const documents = boot({ gm: true });
  grants.length = 0; skillPoints.grant = async (actor, grant) => { grants.push(grant); };
  const actor = await configured(dreadnought({ level: 1, res: 4 })); documents.set(actor.uuid, actor);
  await processAdvanceAttack(message("inactive", { speaker: actor.uuid }));
  assert.equal(grants.length, 0);
  actor.flags.ak5e.defender.advance = { active: true, expiresAt: 60, watch: {} };
  await processAdvanceAttack(message("notarget", { speaker: actor.uuid }));
  assert.equal(grants.length, 1);
  await processAdvanceAttack(message("damage", { speaker: actor.uuid, type: "damage" }));
  assert.equal(grants.length, 1, "only attack rolls");
  game.users.activeGM = { id: "somebody-else" };
  await processAdvanceAttack(message("other-gm", { speaker: actor.uuid }));
  assert.equal(grants.length, 1, "only the active GM awards");
  game.users.activeGM = { id: "player" }; game.user.isGM = false;
  await processAdvanceAttack(message("player", { speaker: actor.uuid }));
  assert.equal(grants.length, 1);
});

test("a refused Skill Point grant is reported to the owner and GM, not hidden", async () => {
  const documents = boot({ gm: true });
  skillPoints.grant = async () => { throw new Error("No SP gain while an Operator Skill is active."); };
  const actor = await configured(dreadnought({ level: 7, res: 6 })); documents.set(actor.uuid, actor);
  actor.flags.ak5e.defender.advance = { active: true, expiresAt: 60, watch: {} };
  await processAdvanceAttack(message("refused", { speaker: actor.uuid }));
  assert.equal(game.messages.length, 1);
  assert.match(game.messages[0].content, /did not gain 2 Skill Points: No SP gain/);
});

test("Turn end: the Advance ends without a qualifying action, continues with one, and the window resets", async () => {
  const documents = boot({ gm: true });
  skillPoints.grant = async () => {};
  const actor = await configured(dreadnought({ level: 7 })); documents.set(actor.uuid, actor);
  game.combat = turn(actor);
  await defenderCommand(actor, "advance", { confirmed: true }, "a1");
  const end = round => ({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round, combatantId: "m1" });
  await processAdvanceAttack(message("swing", { speaker: actor.uuid }));
  await defenderTurnEvent(end(1));
  assert.equal(advanceActive(actor), true, "an Attack was made");
  assert.equal(actor.flags.ak5e.defender.advance.watch.attacked, false, "the window resets after the check");
  await defenderTurnEvent(end(2));
  assert.equal(actor.flags.ak5e.defender.advance.endedBy, "noQualifyingAction");
  assert.equal(advanceActive(actor), false);
  assert.match(game.messages.at(-1).content, /ask the GM to reinstate/);
});

test("Advance activation inherits qualifying activity from earlier in the current Turn window", async () => {
  const documents = boot({ gm: true });
  const actor = await configured(dreadnought({ level: 7 })); documents.set(actor.uuid, actor);
  game.combat = turn(actor);
  await advanceAttackActivity({ actorUuid: actor.uuid });
  assert.equal(actor.flags.ak5e.defender.advanceWindow.attacked, true);
  await advanceDamageEvent({ actorUuid: "Actor.other", sourceActorUuid: actor.uuid, amount: 9 });
  assert.equal(actor.flags.ak5e.defender.advanceWindow.dealt, true);
  assert.equal(advanceActive(actor), false, "activity tracking alone does not activate the Advance");
  await defenderCommand(actor, "advance", { confirmed: true }, "a1");
  assert.equal(actor.flags.ak5e.defender.advance.watch.dealt, true, "the activation seeds its watch from this window");
  await defenderTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 1, combatantId: "m1" });
  assert.equal(advanceActive(actor), true);
  assert.equal(actor.flags.ak5e.defender.advance.watch.dealt, false, "the own-Turn end resets the window");
  assert.equal(actor.flags.ak5e.defender.advanceWindow.dealt, false);
});

test("Damage dealt, damage taken and recorded saves keep the Advance going; other events do not", async () => {
  const documents = boot({ gm: true });
  const actor = await configured(dreadnought({ level: 7 })); documents.set(actor.uuid, actor);
  actor.flags.ak5e.defender.advance = { active: true, expiresAt: 60, watch: { attacked: false, dealt: false, forcedSave: false, tookDamage: false } };
  const writes = actor.writes.length;
  await advanceDamageEvent({ actorUuid: "Actor.other", sourceActorUuid: actor.uuid });
  assert.deepEqual(Object.keys(actor.writes[writes]), ["flags.ak5e.defender.advanceWindow.dealt", "flags.ak5e.defender.advance.watch.dealt"], "only the current window keys are written, never the whole state");
  assert.equal(actor.flags.ak5e.defender.advance.watch.dealt, true);
  await advanceDamageEvent({ actorUuid: actor.uuid, sourceActorUuid: null });
  assert.equal(actor.flags.ak5e.defender.advance.watch.tookDamage, true);
  await defenderCommand(actor, "advanceActivity", { kind: "forcedSave" }, "r1");
  assert.equal(actor.flags.ak5e.defender.advance.watch.forcedSave, true);
  await assert.rejects(defenderCommand(actor, "advanceActivity", { kind: "attacked" }, "r2"), /observed from the roll/);
  await assert.rejects(defenderCommand(actor, "advanceActivity", { kind: "bogus" }, "r3"), /Record/);
});

test("only a GM can reinstate an Advance that ended for lack of action, and only inside its minute", async () => {
  const documents = boot({ gm: false });
  skillPoints.grant = async () => {};
  const actor = await configured(dreadnought({ level: 7 })); documents.set(actor.uuid, actor);
  game.combat = turn(actor);
  await defenderCommand(actor, "advance", { confirmed: true }, "a1");
  await defenderTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 1, combatantId: "m1" });
  assert.equal(advanceActive(actor), false);
  await assert.rejects(defenderCommand(actor, "reinstateAdvance", { reason: "I did attack, honest" }, "g1"), /GM must/);
  game.user.isGM = true;
  await assert.rejects(defenderCommand(actor, "reinstateAdvance", { reason: "short" }, "g2"), /GM must/);
  await defenderCommand(actor, "reinstateAdvance", { reason: "Attacked with a thrown weapon off-camera." }, "g3");
  assert.equal(advanceActive(actor), true);
  assert.equal(actor.flags.ak5e.resourcePools.dreadnoughtAdvance.value, 0, "reinstating does not refund or spend");
  game.time.worldTime = 120;
  actor.flags.ak5e.defender.advance = { ...actor.flags.ak5e.defender.advance, active: false, endedBy: "noQualifyingAction" };
  await assert.rejects(defenderCommand(actor, "reinstateAdvance", { reason: "Attacked with a thrown weapon off-camera." }, "g4"), /within its minute/);
});

test("any rest ends the Advance", async () => {
  const documents = boot({ gm: true });
  skillPoints.grant = async () => {};
  const actor = await configured(dreadnought({ level: 7 })); documents.set(actor.uuid, actor);
  await defenderCommand(actor, "advance", { confirmed: true }, "a1");
  await defenderRest(actor, "short");
  assert.equal(actor.flags.ak5e.defender.advance.endedBy, "rest");
});

test("Crownsplitter adds the Strength modifier with an Operator Skill active, doubled for a known Elite or Leader", async () => {
  const documents = boot({ gm: true });
  const actor = await configured(dreadnought({ level: 4 })); documents.set(actor.uuid, actor);
  actor.flags.ak5e.operatorSkills = { active: { id: "skill" } };
  const elite = { documentName: "Actor", uuid: "Actor.elite", flags: { ak5e: { category: "Elite" } }, getFlag(s, k) { return this.flags[s]?.[k]; } };
  const grunt = { documentName: "Actor", uuid: "Actor.grunt", flags: { ak5e: { category: "Normal" } }, getFlag(s, k) { return this.flags[s]?.[k]; } };
  const unknown = { documentName: "Actor", uuid: "Actor.unknown", flags: {}, getFlag() { return undefined; } };
  const eliteToken = { documentName: "Token", uuid: "Token.elite", actor: elite };
  for (const a of [elite, grunt, unknown]) documents.set(a.uuid, a);
  documents.set(eliteToken.uuid, eliteToken);
  const melee = { actor, actionType: "mwak", getActionType: () => "mwak" };
  const roll = (subject, targets) => { const config = { subject, rolls: [{ parts: ["1d8"] }] }; crownsplitterHook(config, {}, { data: { flags: { dnd5e: { targets: targets.map(uuid => ({ uuid })) } } } }); return config.rolls[0].parts; };
  assert.deepEqual(roll(melee, [elite.uuid]), ["1d8", "8"]);
  assert.deepEqual(roll(melee, [grunt.uuid]), ["1d8", "4"]);
  assert.deepEqual(roll(melee, [unknown.uuid]), ["1d8", "4"], "an unknown tier is never guessed");
  assert.deepEqual(roll(melee, [elite.uuid, grunt.uuid]), ["1d8", "4"], "mixed targets are not guessed");
  const nativePayload = { subject: melee, rolls: [{ parts: ["1d8"] }] };
  crownsplitterHook(nativePayload, {}, { flags: { dnd5e: { targets: [{ uuid: eliteToken.uuid }] } } });
  assert.deepEqual(nativePayload.rolls[0].parts, ["1d8", "8"], "actual token target descriptors normalize to their Actor");
  assert.deepEqual(roll({ ...melee, getActionType: () => "rwak", actionType: "rwak" }, [elite.uuid]), ["1d8"]);
  actor.flags.ak5e.operatorSkills = {};
  assert.deepEqual(roll(melee, [elite.uuid]), ["1d8"], "no active Skill, no bonus");
  actor.flags.ak5e.operatorSkills = { active: {} };
  actor.items.get("class").system.levels = 3;
  assert.deepEqual(roll(melee, [elite.uuid]), ["1d8"], "level 4 feature");
});

test("Sword of Damocles: Leaping Offence costs 1 Resilience once per Leaping Defence and needs an Elite or Leader; Tear them Down is free", async () => {
  const documents = boot({ gm: true });
  const actor = await configured(dreadnought({ level: 12, res: 6 })); documents.set(actor.uuid, actor);
  const elite = { documentName: "Actor", uuid: "Actor.elite", flags: { ak5e: { category: "Leader" } }, getFlag(s, k) { return this.flags[s]?.[k]; } };
  documents.set(elite.uuid, elite);
  await defenderCommand(actor, "leapingDefence", { attackId: "a1", attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true }, "leap");
  await assert.rejects(defenderCommand(actor, "leapingOffence", { leapOperationId: "leap", tier: "normal" }, "o1"), /Elite or Leader/);
  assert.equal(resilience(actor).value, 6);
  await assert.rejects(defenderCommand(actor, "leapingOffence", { leapOperationId: "leap" }, "o2"), /Choose the attacker's tier/);
  const result = await defenderCommand(actor, "leapingOffence", { leapOperationId: "leap", attackerUuid: elite.uuid }, "o3");
  assert.equal(result.tier, "leader");
  assert.equal(resilience(actor).value, 5);
  await assert.rejects(defenderCommand(actor, "leapingOffence", { leapOperationId: "leap", tier: "elite" }, "o4"), /already triggered/);
  const tear = await defenderCommand(actor, "tearThemDown", { tier: "elite", inReach: true, otherTarget: true }, "t1");
  assert.match(tear.instruction, /no Reaction/);
  assert.equal(resilience(actor).value, 5);
  await assert.rejects(defenderCommand(actor, "tearThemDown", { tier: "elite", inReach: true, otherTarget: false }, "t2"), /Confirm/);
  await assert.rejects(defenderCommand(setup(fixture({ level: 11, res: 6, branch: "dreadnought" })), "tearThemDown", {}, "t3"), /configured Defender|level 12/);
});

test("setup keeps a Legendary Might effect the GM switched off, but restores one this module switched off", async () => {
  boot();
  const actor = await configured(dreadnought({ level: 15 }));
  const might = [...actor.effects.values()].find(e => e.name === "Legendary Might");
  might.disabled = true;                      // the GM turned it off by hand: provenance still says active
  assert.equal(previewDefenderSetup(actor).updateEffects.length, 0, "the manual choice is respected");
  actor.items.get("class").system.levels = 14;
  const plan = previewDefenderSetup(actor);
  assert.equal(plan.updateEffects.length, 0, "already off, nothing to disable");
  might.disabled = false;
  const down = previewDefenderSetup(actor);
  assert.equal(down.updateEffects[0].changes.disabled, true, "ineligible: switched off by the module");
  await applyDefenderSetup(actor, { confirmed: true, contextKey: down.contextKey, operationId: "s-down" });
  assert.equal(might.disabled, true);
  assert.equal(might.flags.ak5e.defenderManagedEffect.active, false);
  actor.items.get("class").system.levels = 15;
  const up = previewDefenderSetup(actor);
  assert.equal(up.updateEffects[0].changes.disabled, false, "eligible again: the module's own disable is reversed");
});
