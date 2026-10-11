import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world, setup } from "./defender-fixture.mjs";
import { paviseOpposite } from "../scripts/defender-rules.mjs";
import { registerDefenderHooks } from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { registerSentryHooks, paviseAttackHook, pavise, pavisePoint, torrentActive } from "../scripts/sentry-features.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent, getReactions } from "../scripts/trigger-events.mjs";

let booted = false;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const get = function(s, k) { return this.flags?.[s]?.[k]; };
function assign(target, changes) { for (const [k, v] of Object.entries(changes)) { const parts = k.split("."), last = parts.pop(); let t = target; for (const p of parts) t = t[p] ??= {}; t[last] = structuredClone(v); } }
function boot({ combat = null } = {}) {
  const documents = world(combat);
  globalThis.Hooks = { on() {}, off() {} };
  game.user.name = "Player"; game.users = [{ id: "gm", isGM: true }]; game.users.activeGM = game.users[0];
  game.i18n = { localize: key => key, format: key => key };
  let n = 0; globalThis.foundry.utils.randomID = () => `id${++n}`;
  globalThis.CONFIG = { statusEffects: [] };
  if (!booted) { registerDefenderHooks(); registerSentryHooks(); booted = true; }
  // A 100-px, 5-ft grid. Templates are created with their chosen ID and resolve by UUID.
  const scene = { id: "s", uuid: "Scene.s", documentName: "Scene", grid: { size: 100, distance: 5 }, tokens: new Map(), templates: new Map(),
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "MeasuredTemplate");
      return data.map(entry => {
        const doc = { ...structuredClone(entry), id: entry._id, documentName: "MeasuredTemplate", uuid: `Scene.s.MeasuredTemplate.${entry._id}`, parent: scene,
          toObject() { const { parent, toObject, delete: _d, ...rest } = this; return structuredClone({ ...rest, _id: this.id }); },
          async delete() { scene.templates.delete(this.id); documents.delete(this.uuid); } };
        scene.templates.set(doc.id, doc); documents.set(doc.uuid, doc); return doc;
      });
    } };
  documents.set(scene.uuid, scene);
  globalThis.canvas = { scene };
  return { documents, scene };
}
function token(world, id, actor, x, y = 0) {
  const doc = { id, uuid: `Scene.s.Token.${id}`, documentName: "Token", name: id, actor, x, y, width: 1, height: 1, parent: world.scene };
  world.scene.tokens.set(id, doc); world.documents.set(doc.uuid, doc);
  actor.getActiveTokens = () => [doc];
  return doc;
}
function sentry(world, { level = 15, res = 6 } = {}) {
  const actor = setup(fixture({ level, res, branch: "sentry" }));
  actor.testUserPermission = () => true;
  const item = (id, data) => actor.items.set(id, { id, uuid: `Actor.def.Item.${id}`, parent: actor, getFlag: get, flags: { ak5e: {} }, async update(changes) { assign(this, changes); return this; }, ...data });
  item("shield", { type: "equipment", name: "Defender Shield", flags: { ak5e: { tableData: { category: "Heavy Shields", special: "Bastion, Stealth Disadvantage" } } }, system: { equipped: true, type: { value: "shield" } } });
  item("bow", { type: "weapon", name: "Bow", system: { equipped: true } });
  world.documents.set(actor.uuid, actor);
  return actor;
}
const creature = (world, id) => { const doc = { id, uuid: `Actor.${id}`, documentName: "Actor", name: id, flags: { ak5e: {} }, items: new Map(), getFlag: get, isOwner: true }; world.documents.set(doc.uuid, doc); return doc; };
const use = (actor, command, data = {}, id = Math.random().toString(36).slice(2, 10)) => defenderUses.command(actor, command, { confirmed: true, ...data }, id);
const attack = (attacker, targets) => ({ subject: { actor: attacker }, rolls: [{ options: {} }], targets: (game.user.targets = new Set(targets)) });

test("Pavise geometry: the attacker must be beyond the shield as seen from the sheltered Creature", () => {
  assert.equal(paviseOpposite({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }), true);
  assert.equal(paviseOpposite({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -30, y: 0 }), false);
  assert.equal(paviseOpposite({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }), false, "level with the shield is not beyond it");
  assert.equal(paviseOpposite({ x: 10, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }), false);
});

test("Plant Pavise: a template at your token, shield unequipped by reading; Disadvantage only from beyond it; recover and undo", async () => {
  const world = boot();
  const actor = sentry(world), ally = creature(world, "ally"), foe = creature(world, "foe"), stranger = creature(world, "stranger");
  token(world, "sentry", actor, 0); const allyToken = token(world, "ally", ally, -100); const foeToken = token(world, "foe", foe, 600);
  token(world, "stranger", stranger, -100, 100);
  await assert.rejects(use(actor, "plantPavise", { allies: [allyToken.uuid] }, "p1"), error => error.warnings.some(w => w.id === "allies"));
  await assert.rejects(use(actor, "plantPavise", { allies: [allyToken.uuid], alliesConfirmed: true }, "p1"), error => error.name === "AK5eReading" && error.key === "paviseShield");
  await use(actor, "plantPavise", { allies: [allyToken.uuid], alliesConfirmed: true, reading: "unequip" }, "p1");
  assert.equal(world.scene.templates.size, 1);
  assert.deepEqual([pavisePoint(actor).x, pavisePoint(actor).y], [50, 50]);
  assert.equal(actor.items.get("shield").system.equipped, false);
  assert.deepEqual(pavise(actor).allies, ["Scene.s.Token.sentry", allyToken.uuid], "the Sentry is always included");
  const fromBeyond = attack(foe, [allyToken]); paviseAttackHook(fromBeyond);
  assert.equal(fromBeyond.rolls[0].options.disadvantage, true);
  const fromBehind = attack(foe, [allyToken]); foeToken.x = -500; paviseAttackHook(fromBehind);
  assert.equal(fromBehind.rolls[0].options.disadvantage, undefined, "same side as the ally");
  foeToken.x = 600;
  const notAlly = attack(foe, [world.scene.tokens.get("stranger")]); paviseAttackHook(notAlly);
  assert.equal(notAlly.rolls[0].options.disadvantage, undefined, "allegiance is chosen by the player");
  await use(actor, "recoverPavise", {}, "r1");
  assert.equal(world.scene.templates.size, 0);
  assert.equal(actor.items.get("shield").system.equipped, true);
  assert.equal(pavise(actor), null);
  await use(actor, "undoUse", { useId: "r1" }, "u1");
  assert.equal(world.scene.templates.size, 1, "undoing the recovery plants it again with the same marker");
  assert.equal(actor.items.get("shield").system.equipped, false);
  assert.equal(pavise(actor).useId, "p1");
  await use(actor, "undoUse", { useId: "p1" }, "u2");
  assert.equal(world.scene.templates.size, 0);
  assert.equal(actor.items.get("shield").system.equipped, true);
});

test("a placed token can stand for the planted shield; Shelter follows the token when it moves", async () => {
  const world = boot();
  const actor = sentry(world), ally = creature(world, "ally"), foe = creature(world, "foe"), prop = creature(world, "prop");
  token(world, "sentry", actor, 0); const allyToken = token(world, "ally", ally, -100); token(world, "foe", foe, 600);
  const propToken = token(world, "prop", prop, 0);
  await use(actor, "plantPavise", { allies: [allyToken.uuid], alliesConfirmed: true, reading: "keep" }, "p1");
  await assert.rejects(use(actor, "linkPaviseToken", { tokenUuid: propToken.uuid, allies: [allyToken.uuid], alliesConfirmed: true }, "l1"), error => error.warnings.some(w => w.id === "planted"));
  await use(actor, "linkPaviseToken", { tokenUuid: propToken.uuid, allies: [allyToken.uuid], alliesConfirmed: true, overrides: ["planted"] }, "l1");
  assert.equal(world.scene.templates.size, 0, "the template marker is replaced by the token");
  assert.equal(pavise(actor).kind, "token");
  const near = attack(foe, [allyToken]); paviseAttackHook(near);
  assert.equal(near.rolls[0].options.disadvantage, true);
  propToken.x = -1000;
  const moved = attack(foe, [allyToken]); paviseAttackHook(moved);
  assert.equal(moved.rolls[0].options.disadvantage, undefined, "more than 10 feet from the moved shield");
  await use(actor, "undoUse", { useId: "l1" }, "u1");
  assert.equal(pavise(actor).kind, "template");
  assert.equal(world.scene.templates.size, 1);
});

test("Advance and Fire: a Reaction per Attack with a refund; Retributor once per Round; Torrent of Lead adds an Attack until your next Turn ends", async () => {
  const combat = { started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "d", actor: { uuid: "Actor.def" } }, turns: [{ id: "d", actor: { uuid: "Actor.def" } }] };
  const world = boot({ combat });
  const actor = sentry(world), foe = creature(world, "foe");
  await use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "a1", attackConfirmed: true }, "f1");
  assert.equal(getReactions(actor).spent, 1);
  assert.match(game.messages.at(-1).content, /@UUID\[Actor\.def\.Item\.bow\]\{Bow\}/);
  await assert.rejects(use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "a1", attackConfirmed: true }, "f2"), error => error.warnings.some(w => w.id === "triggerUsed"));
  await use(actor, "advanceAndFireRefund", { useId: "f1" }, "f1r");
  assert.equal(getReactions(actor).spent, 0);
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 5);
  await use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "a2", attackConfirmed: true, retributor: true }, "f3");
  assert.equal(getReactions(actor).spent, 0, "Retributor spends no Reaction");
  await assert.rejects(use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "a3", attackConfirmed: true, retributor: true }, "f4"), error => error.warnings.some(w => w.id === "retributor"));
  await use(actor, "torrentOfLead", {}, "t1");
  assert.equal(getPool(actor, "torrentOfLead").value, 0);
  await use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "a4", attackConfirmed: true }, "f5");
  assert.match(game.messages.at(-1).content, /one additional Attack/);
  game.user.isGM = true; game.user.id = "gm";
  await emitAk5eEvent("turnEnd", { eventId: "turnEnd:1", actorUuid: actor.uuid }); await tick();
  assert.equal(torrentActive(actor), true, "still active after the Turn it was activated in");
  await emitAk5eEvent("turnEnd", { eventId: "turnEnd:2", actorUuid: actor.uuid }); await tick();
  assert.equal(torrentActive(actor), false, "ends with the next Turn");
});

test("Heads Down spends 1 Resilience for a Creature within 5 feet of the planted shield; an attack on a Pavise ally prompts Advance and Fire", async () => {
  const world = boot();
  const actor = sentry(world, { level: 12 }), ally = creature(world, "ally"), foe = creature(world, "foe");
  token(world, "sentry", actor, 0); const allyToken = token(world, "ally", ally, -100); const foeToken = token(world, "foe", foe, 600);
  await use(actor, "plantPavise", { allies: [allyToken.uuid], alliesConfirmed: true, reading: "keep" }, "p1");
  await use(actor, "headsDown", { targetUuid: ally.uuid, visibleConfirmed: true }, "h1");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 5);
  assert.match(game.messages.at(-1).content, /automatically passes/);
  allyToken.x = -400;
  await assert.rejects(use(actor, "headsDown", { targetUuid: ally.uuid, visibleConfirmed: true }, "h2"), error => error.warnings.some(w => w.id === "range"));
  allyToken.x = -100;
  // D&D5e target descriptors carry the Actor UUID (review fix).
  await emitAk5eEvent("attack", { eventId: "attack:z", attackId: "z", actorUuid: foe.uuid, targets: [{ uuid: ally.uuid, hit: false }], raw: {} });
  await tick();
  assert.equal(game.messages.at(-1).flags.ak5e.sentryPrompt.kind, "advanceAndFire");
  assert.equal(foeToken.parent.id, "s");
});

test("review fixes: the Pavise marker never goes through the GM relay and only touches its own templates; Retributor and refund undo", async () => {
  const combat = { started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "d", actor: { uuid: "Actor.def" } }, turns: [{ id: "d", actor: { uuid: "Actor.def" } }] };
  const world = boot({ combat });
  const actor = sentry(world), foe = creature(world, "foe");
  const boss = { id: "boss", uuid: "Actor.boss", documentName: "Actor", name: "boss", deleted: false, async delete() { this.deleted = true; } };
  world.documents.set(boss.uuid, boss);
  token(world, "sentry", actor, 0);
  await use(actor, "plantPavise", { allies: [], alliesConfirmed: true, reading: "keep" }, "p1");
  game.user.isGM = true; game.user.id = "gm";
  // A forged receipt and applied record naming another document.
  actor.flags.ak5e.defenderUsesApplied = { ...(actor.flags.ak5e.defenderUsesApplied ?? {}), forged: { created: boss.uuid } };
  actor.flags.ak5e.defenderUses.undo.push({ id: "forged", command: "plantPavise", status: "complete", epoch: 0, targets: [{ uuid: actor.uuid, kind: "paviseMarker", applied: true, ready: true, create: { sceneUuid: "Scene.s", id: "x" } }] });
  await assert.rejects(defenderUses.relayedTargetChange(actor, "revert", { useId: "forged", targetUuid: actor.uuid }), /never applied through the GM relay/);
  assert.equal(boss.deleted, false);
  game.user.isGM = false; game.user.id = "player";
  await use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "r1", attackConfirmed: true, retributor: true }, "f1");
  await use(actor, "undoUse", { useId: "f1" }, "u1");
  await use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "r2", attackConfirmed: true, retributor: true }, "f2");
  await use(actor, "advanceAndFire", { attackerUuid: foe.uuid, weaponId: "bow", triggerId: "r3", attackConfirmed: true }, "f3");
  await use(actor, "advanceAndFireRefund", { useId: "f3" }, "f3r");
  await use(actor, "undoUse", { useId: "f3r" }, "u3");
  assert.equal(getReactions(actor).spent, 1, "the refunded Reaction is spent again");
});
