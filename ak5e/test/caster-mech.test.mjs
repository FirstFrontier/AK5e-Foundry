import test from "node:test";
import assert from "node:assert/strict";
import { casterCommand, getCasterView } from "../scripts/caster-features.mjs";
import { validateCasterContext } from "../scripts/caster-casting.mjs";
import { droneAttackGate } from "../scripts/caster-drones.mjs";
import { requestCasterDrone } from "../scripts/caster-mech.mjs";
import { previewUndo } from "../scripts/caster-primal-splash.mjs";

const getFlag = function(scope, key) { return this.flags?.[scope]?.[key]; };
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const scene = { id: "scene", grid: { units: "ft", distance: 5, size: 100 } };
function doc(uuid, data) {
  return { uuid, id: uuid.split(".").at(-1), documentName: "Actor", isOwner: true, flags: { ak5e: {} }, getFlag, updates: [], ...data,
    async update(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
}
function setup({ level = 10, ap = 8, prof = 4, cp = 1000, combatTurn = true } = {}) {
  const documents = new Map(), rolls = [], messages = [];
  globalThis.game = { user: { id: "owner", isGM: false, targets: new Set() }, time: { worldTime: 0 }, messages, settings: { get: () => false },
    combat: { started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: combatTurn ? "creator" : "other", actor: { uuid: combatTurn ? "Actor.caster" : "Actor.other" } } },
    actors: new Map(), scenes: new Map([[scene.id, scene]]), users: new Map([["gm", { id: "gm", isGM: true }]]) };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 10) } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { messages.push(data); return { ...data, id: `m${messages.length}`, getFlag }; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; rolls.push(formula); } async evaluate() { this.total = 5 * Number(this.formula.split("d")[0]); return this; } async toMessage() {} };
  globalThis.Hooks = { on() {}, off() {}, once() {} };
  const actor = doc("Actor.caster", { type: "character", name: "Caster", tokens: [], items: new Map(),
    system: { abilities: { int: { value: 16, mod: 3 } }, attributes: { prof, hp: { value: 20, max: 20, temp: 0 } }, currency: { cp }, skills: { ak5etech: { total: 5 } } },
    getActiveTokens() { return this.tokens; }, getRollData: () => ({}) });
  actor.flags.ak5e = { casting: { enabled: true, ability: "int" }, artsPoints: { maximum: 35, value: ap, maximumArtLevel: 9 },
    caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] } };
  for (const [id, type, chapterThreeId, system] of [["class", "class", "class-caster", { levels: level }], ["branch", "subclass", "subclass-caster-mech-accord", {}]])
    actor.items.set(id, { id, type, system, flags: { ak5e: { chapterThreeId } }, getFlag });
  actor.tokens.push({ documentName: "Token", uuid: "Scene.scene.Token.caster", x: 0, y: 0, elevation: 0, width: 1, height: 1, parent: scene, actor });
  documents.set(actor.uuid, actor);
  const drone = (id, { x = 100, hp = 10, max = 30, temp = 0 } = {}) => {
    const actorDoc = doc(`Actor.${id}`, { name: id, system: { attributes: { hp: { value: hp, max, temp } } }, flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: false } } } });
    const token = { documentName: "Token", uuid: `Scene.scene.Token.${id}`, id, name: id, x, y: 0, elevation: 0, width: 1, height: 1, parent: scene, actor: actorDoc, isOwner: true, flags: { ak5e: {} }, getFlag, updates: [],
      async update(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
    actorDoc.getActiveTokens = () => [token];
    actor.flags.ak5e.caster.drones.push(actorDoc.uuid);
    documents.set(actorDoc.uuid, actorDoc); documents.set(token.uuid, token); game.actors.set(actorDoc.uuid, actorDoc);
    return { drone: actorDoc, token };
  };
  return { actor, documents, rolls, messages, drone };
}
const ruling = (actor, key, value) => { actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed by the GM against the printed source." }; };
async function overrideAll(run) {
  try { return await run([]); } catch (error) { if (error.name !== "AK5eWarnings") throw error; return run(error.warnings.map(warning => warning.id)); }
}

test("Jury Rigging spends AP on confirmation, rolls only on the player's click, and its excess Temporary HP uses a reading", async () => {
  const { actor, drone, rolls, messages } = setup();
  const { token, drone: arts } = drone("repair", { hp: 20, max: 30, temp: 3 });
  const data = { confirmed: true, droneUuid: token.uuid, visible: true, ap: 3 };
  // 3d8 can exceed the 10 missing HP, so the excess Temporary HP reading is offered.
  await assert.rejects(casterCommand(actor, "juryRig", data, "j1"), error => error.name === "AK5eReading" && error.key === "juryTempHP");
  const pending = await casterCommand(actor, "juryRig", { ...data, reading: "add" }, "j1");
  assert.equal(pending.awaitingRoll, true);
  assert.deepEqual(rolls, [], "nothing is rolled on confirmation");
  assert.equal(actor.flags.ak5e.artsPoints.value, 5);
  assert.match(messages.at(-1).content, /Add to current Temporary HP/);
  const result = await casterCommand(actor, "useRoll", { useId: "j1" }, "j1-roll");
  assert.equal(result.roll, 15);
  assert.equal(arts.system.attributes.hp.value, 30);
  assert.equal(arts.system.attributes.hp.temp, 8, "5 excess added to the existing 3 Temporary HP");
  assert.match(messages.at(-1).content, /recovers 10 Hit Points/);
});

test("Jury Rigging above 2xPB, out of range, unseen or without enough AP are warnings; overrides clamp AP at 0 and are public", async () => {
  const { actor, drone, messages } = setup({ prof: 2, ap: 3 });
  const { token } = drone("far", { x: 2500, hp: 29 });
  ruling(actor, "juryTempHP", "replace");
  const data = { confirmed: true, droneUuid: token.uuid, visible: false, ap: 5 };
  await assert.rejects(casterCommand(actor, "juryRig", data, "w1"), error => ["apCap", "visible", "ap"].every(id => error.warnings.some(w => w.id === id))
    && error.warnings.some(w => /more than 100 feet/.test(w.text)));
  await overrideAll(overrides => casterCommand(actor, "juryRig", { ...data, overrides }, "w1"));
  assert.equal(actor.flags.ak5e.artsPoints.value, 0);
  assert.match(messages.at(-1).content, /Used anyway/);
  assert.match(messages.at(-1).content, /AP short by 2/);
  await casterCommand(actor, "undoUse", { useId: "w1" }, "w1-undo");
  assert.equal(actor.flags.ak5e.artsPoints.value, 3, "undo restores the exact prior AP");
});

test("undoing Jury Rigging after a matching Unending refund does not restore the same AP twice", async () => {
  const { actor, drone } = setup({ level: 18, ap: 8, prof: 4 });
  const { token } = drone("refunded", { hp: 1, max: 100 });
  ruling(actor, "juryTempHP", "replace"); ruling(actor, "unendingBasis", "actualSpend");
  await overrideAll(overrides => casterCommand(actor, "juryRig", { confirmed: true, droneUuid: token.uuid, visible: true, ap: 5, overrides }, "jury-refund"));
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
  await casterCommand(actor, "useRoll", { useId: "jury-refund" }, "jury-refund-roll");
  actor.flags.ak5e.caster.spends = [{ id: "jury-refund", amount: 5, reason: "Jury Rigging" }];
  await casterCommand(actor, "unending", { confirmed: true, spendId: "jury-refund" }, "jury-refund-unending");
  assert.equal(actor.flags.ak5e.artsPoints.value, 8);
  assert.match(previewUndo(actor, "jury-refund").lines.join(" "), /Restores 0 AP\s+after subtracting 5 AP refunded/);
  await casterCommand(actor, "undoUse", { useId: "jury-refund" }, "jury-refund-undo");
  assert.equal(actor.flags.ak5e.artsPoints.value, 8, "the Unending refund remains and the original spend is not restored again");
});

test("legacy prepared Mech operations without a matching use receipt require reconciliation", async () => {
  const { actor, drone } = setup();
  const { token } = drone("legacy");
  actor.flags.ak5e.caster.operations = [{ id: "legacy-op", command: "juryRig", status: "prepared" }];
  const before = actor.flags.ak5e.artsPoints.value;
  await assert.rejects(casterCommand(actor, "juryRig", { confirmed: true, droneUuid: token.uuid, visible: true, ap: 1, reading: "replace" }, "new-op"),
    /Legacy prepared Mech-Accord operation legacy-op has no established use receipt/);
  assert.equal(actor.flags.ak5e.artsPoints.value, before);
  assert.equal(actor.flags.ak5e.caster.operations[0].status, "prepared");
});

test("legacy Mech operation with a receipt is recovered without blocking the next use; other branches ignore it", async () => {
  const { actor, drone } = setup();
  const { token } = drone("legacy-known", { hp: 20, max: 30 });
  ruling(actor, "juryTempHP", "replace");
  await casterCommand(actor, "juryRig", { confirmed: true, droneUuid: token.uuid, visible: true, ap: 1 }, "legacy-receipt");
  actor.flags.ak5e.caster.operations = [{ id: "legacy-receipt", command: "juryRig", status: "eventFailed" }];
  await casterCommand(actor, "juryRig", { confirmed: true, droneUuid: token.uuid, visible: true, ap: 1 }, "after-legacy");
  assert.equal(actor.flags.ak5e.caster.operations[0].status, "recovered");
  assert.equal(actor.flags.ak5e.artsPoints.value, 6, "both committed receipts remain accounted for exactly once");
});

test("commanding drones off-turn or beyond the cap warns; a move is undoable", async () => {
  const { actor, drone } = setup({ level: 3, combatTurn: false });
  const one = drone("one"), two = drone("two", { x: 200 });
  const data = { confirmed: true, mode: "move", tokenUuids: [one.token.uuid, two.token.uuid], destination: { x: 500, y: 300 } };
  await assert.rejects(casterCommand(actor, "commandDrones", data, "c1"), error => ["turn", "cap"].every(id => error.warnings.some(w => w.id === id)));
  await overrideAll(overrides => casterCommand(actor, "commandDrones", { ...data, overrides }, "c1"));
  assert.deepEqual([one.token.x, one.token.y, two.token.x], [500, 300, 500]);
  assert.match(previewUndo(actor, "c1").lines.join(" "), /moves back to \(100, 0\)/);
  await casterCommand(actor, "undoUse", { useId: "c1" }, "c1-undo");
  assert.deepEqual([one.token.x, one.token.y, two.token.x], [100, 0, 200]);
});

test("Wolfpack Doctrine marks the drone's own Reaction; a second Reaction warns; undo frees it", async () => {
  const { actor, drone } = setup();
  const { drone: arts } = drone("wolf");
  actor.flags.ak5e.caster.casts = [{ id: "cast", itemId: "art", level: 1, completed: true, turn: "Combat.c:1:creator" }];
  await casterCommand(actor, "wolfpack", { confirmed: true, droneUuid: arts.uuid, castId: "cast", visible: true }, "w1");
  assert.equal(arts.flags.ak5e.artsMaster.reactionOperation, "w1");
  await assert.rejects(casterCommand(actor, "wolfpack", { confirmed: true, droneUuid: arts.uuid, castId: "cast", visible: true }, "w2"), /already used its Reaction/);
  await casterCommand(actor, "undoUse", { useId: "w1" }, "w1-undo");
  assert.equal(arts.flags.ak5e.artsMaster.reactionOperation, null);
  assert.equal(arts.flags.ak5e.artsMaster.reactionTurn, null);
});

test("rebuilding without enough LMD warns, clamps currency at 0 and shows the shortfall", async () => {
  const { actor, drone, messages } = setup({ cp: 200 });
  const { drone: arts } = drone("broken", { hp: 0 });
  arts.flags.ak5e.artsMaster.destroyed = true;
  const data = { confirmed: true, droneUuid: arts.uuid, restCompleted: true, components: false };
  await assert.rejects(casterCommand(actor, "rebuild", data, "r1"), error => error.warnings.some(w => w.id === "cost"));
  await casterCommand(actor, "rebuild", { ...data, overrides: ["cost"] }, "r1");
  assert.equal(actor.system.currency.cp, 0);
  assert.equal(arts.system.attributes.hp.value, 30);
  assert.match(messages.at(-1).content, /LMD short by 300/);
});

test("Death from Above uses the GM's cost ruling or the player's reading; source limits are warnings", () => {
  const { actor, drone } = setup({ level: 12 });
  const { token } = drone("sky");
  const item = { id: "art", system: { level: 4, activities: new Map() } };
  actor.flags.ak5e.caster.casts = [{ id: "orig", itemId: "art", level: 4, activation: "bonus", completed: true, turn: "Combat.c:1:creator" }];
  const options = { mode: "ap", level: 4, repeat: "deathAbove", previousCastId: "orig", droneTokenUuid: token.uuid };
  assert.throws(() => validateCasterContext(actor, item, options), error => error.name === "AK5eReading" && error.key === "deathAboveCost");
  assert.throws(() => validateCasterContext(actor, item, { ...options, reading: "free" }),
    error => ["deathAboveLevel", "deathAboveLevelCast", "deathAboveAction"].every(id => error.warnings.some(w => w.id === id)));
  const context = validateCasterContext(actor, item, { ...options, reading: "free", overrides: ["deathAboveLevel", "deathAboveLevelCast", "deathAboveAction"] });
  assert.equal(context.overrideCost, 0);
  assert.match(context.readingNote, /costs no AP/);
  assert.equal(context.overridden.length, 3);
});

test("an owner requests an Arts Master: without a GM nothing changes; with one the GM's client is asked", async () => {
  const { actor, messages } = setup({ level: 1 });
  ruling(actor, "technologyModifier", "intMod");
  await assert.rejects(requestCasterDrone(actor, "create", { confirmed: true, sceneId: "scene", x: 0, y: 0 }), /Not applied yet: no GM is connected/);
  assert.equal(messages.length, 0);
  game.users.activeGM = { id: "gm", isGM: true };
  const pending = requestCasterDrone(actor, "create", { confirmed: true, sceneId: "scene", x: 0, y: 0, operationId: "req1" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(messages[0].flags.ak5e.casterDroneRequest.command, "create");
  assert.equal(messages[0].flags.ak5e.casterDroneRequest.data.technologyModifier, "intMod");
  pending.catch(() => {}); // The fake world has no GM client to answer; the request itself is what is checked.
  // Without a ruling, the player picks the Technology Modifier reading first.
  delete actor.flags.ak5e.caster.rulings.technologyModifier;
  await assert.rejects(requestCasterDrone(actor, "create", { confirmed: true, sceneId: "scene", x: 0, y: 0 }), error => error.name === "AK5eReading");
});

test("a prohibited Originium Spark asks before use; Use anyway is public and repeats the use", async () => {
  const { actor, drone, messages } = setup();
  const { drone: arts } = drone("spark", { hp: 0 });
  let used = null, asked = 0;
  globalThis.foundry.applications = { api: { DialogV2: { confirm: async () => { asked += 1; return true; } } } };
  const activity = { actor: arts, item: { id: "spark", flags: { ak5e: { artsMasterSpark: true } }, getFlag }, async use(usage) { used = usage; droneAttackGate(this, { stage: "use", args: [usage] }); } };
  assert.equal(droneAttackGate(activity, {}), false, "the first attempt is held while the dialog is open");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(asked, 1);
  assert.deepEqual(used, { ak5eDroneOverride: true });
  assert.match(messages.at(-1).content, /used anyway.*destroyed/s);
  assert.equal(droneAttackGate(activity, {}), false, "a new activity attempt needs a fresh confirmation");
  await new Promise(resolve => setTimeout(resolve, 0));
  delete globalThis.foundry.applications;
  assert.ok(getCasterView(actor).manual.some(line => /Jury Rigging, drone commands/.test(line)));
});

test("Use anyway resumes the held Spark attack with its original args and does not start another activity use", async () => {
  const { drone, messages } = setup();
  const { drone: arts } = drone("held", { hp: 0 });
  let resumed, useCount = 0;
  const decisions = [true, false];
  globalThis.foundry.applications = { api: { DialogV2: { confirm: async () => decisions.shift() } } };
  const config = { subject: null, options: { original: true }, hookNames: ["custom", "attack", "d20Test", ""], rolls: [{ id: "kept" }] }, dialog = { id: "dialog" }, message = { id: "message" };
  let attackRolls = 0;
  const activity = { actor: arts, item: { id: "spark", flags: { ak5e: { artsMasterSpark: true } }, getFlag },
    async use() { useCount += 1; }, async rollAttack(...args) {
      resumed = args;
      const nativeConfig = args[0], hookNames = [...(nativeConfig.hookNames ?? []), "attack", "d20Test", ""];
      for (const hookName of hookNames) if (hookName === "attack") droneAttackGate(this, { stage: "attack", args });
      if (hookNames.filter(name => name === "attack").length === 1) attackRolls += 1;
    } };
  config.subject = activity;
  assert.equal(droneAttackGate(activity, { stage: "attack", args: [config, dialog, message] }), false);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(resumed[0].subject, activity);
  assert.deepEqual(resumed.slice(1), [dialog, message]);
  assert.notEqual(resumed[0], config, "resume uses a cloned native config");
  assert.deepEqual(resumed[0].hookNames, ["custom"], "D&D5e's appended hooks are added only once by native rollAttack");
  assert.notEqual(resumed[0].rolls, config.rolls, "native roll consumption cannot mutate the held config");
  assert.deepEqual(config.rolls, [{ id: "kept" }]);
  assert.equal(useCount, 0, "the attack continuation never calls activity.use");
  assert.equal(attackRolls, 1, "native preRollAttackV2 hooks run once and permit the resumed attack");
  assert.match(messages.at(-1).content, /used anyway.*destroyed/s);
  assert.equal(droneAttackGate(activity, { stage: "attack", args: [config, dialog, message] }), false, "a later independent attempt gets its own warning");
  await new Promise(resolve => setTimeout(resolve, 0));
  delete globalThis.foundry.applications;
});

test("review fixes: the drone cap warns on the requesting client; forged relay receipts are refused; undo is exact and survives deleted tokens", async () => {
  const { relayedTargetChange } = await import("../scripts/caster-primal-splash.mjs");
  const { actor, drone, messages, documents } = setup({ level: 3, ap: 12 });
  const arts = drone("first");
  ruling(actor, "technologyModifier", "intMod");
  game.users.activeGM = { id: "gm", isGM: true };
  // H1: at the cap, a non-GM owner gets "Use anyway" before anything is sent to the GM.
  await assert.rejects(requestCasterDrone(actor, "create", { confirmed: true, sceneId: "scene", x: 0, y: 0 }), error => error.name === "AK5eWarnings" && error.warnings[0].id === "cap");
  assert.equal(messages.length, 0);
  requestCasterDrone(actor, "create", { confirmed: true, sceneId: "scene", x: 0, y: 0, overrides: ["cap"], operationId: "over" }).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(messages[0].flags.ak5e.casterDroneRequest.data.overrides[0], "cap");
  // M1: the GM-side relay re-checks a receipt the owner could have written.
  const boss = { documentName: "Token", uuid: "Scene.other.Token.boss", x: 0, y: 0, actor: { uuid: "Actor.boss", documentName: "Actor", flags: { ak5e: {} }, getFlag }, flags: { ak5e: {} }, getFlag, async update() { throw new Error("must not move"); } };
  documents.set(boss.uuid, boss);
  actor.flags.ak5e.caster.undo = [
    { id: "forged", command: "commandDrones", status: "applying", epoch: 0, targets: [{ uuid: boss.uuid, kind: "tokenMove", to: { x: 99999, y: -5 }, ready: true }] },
    { id: "heal", command: "juryRig", status: "applying", epoch: 0, formula: "1d8", roll: 5, targets: [{ uuid: arts.drone.uuid, kind: "droneHeal", amount: 500, ready: true }] }];
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "forged", targetUuid: boss.uuid }), /not one this use can make/);
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "heal", targetUuid: arts.drone.uuid }), /not one this use can make/);
  // L1 + L2: AP above its maximum is restored exactly; a deleted drone token does not block the undo.
  actor.flags.ak5e.artsPoints = { maximum: 10, value: 12, maximumArtLevel: 9 };
  actor.flags.ak5e.caster.undo = [];
  await overrideAll(overrides => casterCommand(actor, "juryRig", { confirmed: true, droneUuid: arts.token.uuid, visible: true, ap: 4, reading: "replace", overrides }, "over-cap"));
  assert.equal(actor.flags.ak5e.artsPoints.value, 8);
  await overrideAll(overrides => casterCommand(actor, "commandDrones", { confirmed: true, mode: "move", tokenUuids: [arts.token.uuid], destination: { x: 300, y: 0 }, overrides }, "moved"));
  documents.delete(arts.token.uuid);
  await casterCommand(actor, "undoUse", { useId: "moved" }, "undo-moved");
  assert.match(messages.at(-1).content, /no longer exists; nothing to revert/);
  await casterCommand(actor, "undoUse", { useId: "over-cap" }, "undo-over-cap");
  assert.equal(actor.flags.ak5e.artsPoints.value, 12);
});

test("review fix: with a GM ruling for Residual Energy no player reading is offered", async () => {
  const { actor } = setup();
  actor.flags.ak5e.caster.residual = { turn: "t", active: true, amount: 3, amounts: [2, 3], choice: "latest" };
  ruling(actor, "residualStacking", "latest");
  await assert.rejects(casterCommand(actor, "residualReading", { reading: "sum", confirmed: true }, "rr"), /GM has recorded a ruling/);
});
