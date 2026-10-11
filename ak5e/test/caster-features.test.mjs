import test from "node:test";
import assert from "node:assert/strict";
import {
  casterCommand, casterInitiative, casterRest, casterTurnEvent, handleCasterEvent, mysticCharge,
  recordCasterRuling, registerCasterFeatureHooks, casterInitiativeMessage, reviewCasterEligibility, getCasterView
} from "../scripts/caster-features.mjs";
import { createCasterDrone, droneStatistics } from "../scripts/caster-drones.mjs";
import { getPoolDefinition } from "../scripts/resource-pools.mjs";

test("Caster controls expose Mystic Charge only on Mystic",()=>{
  assert.equal(getCasterView(fixture({branch:"core"})).charge,null);
  assert.equal(getCasterView(fixture({branch:"mech-accord"})).charge,null);
  assert.deepEqual(getCasterView(fixture({branch:"mystic",charge:1})).charge,{value:1,max:2});
});

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
function fixture({ branch = "mystic", level = 3, ap = 8, charge = 0, owner = true } = {}) {
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Caster", isOwner: owner,
    flags: { ak5e: { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 10, value: ap, maximumArtLevel: 9 },
      caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] },
      resourcePools: { mysticCharge: { value: charge } } } },
    ownership: { default: 0, player: 3 },
    system: { abilities: { int: { value: 14, mod: 2 }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
      attributes: { prof: 2, spell: { attack: 4 }, hp: { value: 8, max: 12, temp: 0 } },
      skills: { ak5etech: { value: 1, total: 3 } }, tools: {}, currency: { cp: 1000 }, bonuses: {} },
    items: new Map(), writes: [], tokens: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; },
    getRollData() { return {}; },
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(_type, data) { return data.map((entry, i) => ({ ...structuredClone(entry), id: `grant${i}`, type: entry.type, flags: entry.flags, system: entry.system })); }
  };
  const classItem = { id: "class", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } };
  const branchId = { core: "subclass-caster-core", mystic: "subclass-caster-mystic", "mech-accord": "subclass-caster-mech-accord" }[branch];
  const branchItem = { id: "branch", type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: branchId } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } };
  actor.items.set(classItem.id, classItem); actor.items.set(branchItem.id, branchItem);
  return actor;
}
function world(combat = null) {
  const documents = new Map();
  globalThis.game = { user: { id: "player", isGM: false, targets: new Set() }, combat, time: { worldTime: 0 },
    settings: { get: () => false }, actors: new Map(), scenes: new Map(), users: Object.assign(new Map(), { activeGM: null }) };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => "random-operation" } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { (game.messages ??= []).push(data); return data; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; this.total = formula.includes("d8") ? 8 : 4; } async evaluate() { return this; } async toMessage() {} };
  return documents;
}
function ruling(actor, key, value) { actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed against the printed source and recorded by the GM." }; }

test("Mystic Charge pool registers at zero, maxes at 2 then 3, and Long Rest clears all charges", async () => {
  world();
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); } };
  globalThis.CONFIG = { DND5E: { activityTypes: {} } };
  registerCasterFeatureHooks();
  const definition = getPoolDefinition("mysticCharge");
  assert.equal(definition.initial, 0);
  assert.deepEqual(definition.max.rows, [[1, 2], [10, 3]]);
  assert.equal(definition.recovery[0].on, "lr");
  assert.equal(definition.recovery[0].amount, "toInitial");
  const actor = fixture({ charge: 2 });
  assert.deepEqual(mysticCharge(actor), { value: 2, max: 2 });
  actor.items.get("class").system.levels = 10;
  actor.flags.ak5e.resourcePools.mysticCharge.value = 3;
  assert.deepEqual(mysticCharge(actor), { value: 3, max: 3 });
  await casterRest(actor, "long");
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 0);
});

test("turn-end charge requires AP spent and zero Mystic Charge expenditure; duplicate events do not grant twice", async () => {
  world({ started: true, uuid: "Combat.c1", round: 1, turn: 0, combatant: { id: "m1", actor: { uuid: "Actor.caster" } } });
  const actor = fixture({ charge: 0 });
  const docs = new Map([[actor.uuid, actor]]); globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  const stamp = "Combat.c1:1:m1";
  actor.flags.ak5e.caster.turn = { key: stamp, apSpent: 1, chargesSpent: 0 };
  const event = { kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 1, combatantId: "m1", turn: 0, skipped: false };
  await casterTurnEvent(event); await casterTurnEvent(event);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 1);

  const charged = fixture({ charge: 0 }); docs.set(charged.uuid, charged);
  charged.flags.ak5e.caster.turn = { key: stamp, apSpent: 2, chargesSpent: 1 };
  await casterTurnEvent({ ...event, actorUuid: charged.uuid, combatantId: "m2" });
  assert.equal(charged.flags.ak5e.resourcePools.mysticCharge.value, 0);
  const noSpend = fixture({ charge: 0 }); docs.set(noSpend.uuid, noSpend);
  noSpend.flags.ak5e.caster.turn = { key: stamp, apSpent: 0, chargesSpent: 0 };
  await casterTurnEvent({ ...event, actorUuid: noSpend.uuid, combatantId: "m3" });
  assert.equal(noSpend.flags.ak5e.resourcePools.mysticCharge.value, 0);
});

test("initiative rerolls grant once per distinct roll, not once per combat", async () => {
  world({ started: true });
  const actor = fixture({ level: 10 });
  actor._cachedInitiativeRoll = {};
  await casterInitiative(actor); await casterInitiative(actor);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 1);
  actor._cachedInitiativeRoll = {};
  await casterInitiative(actor);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 2);
});

test("actual combat initiative messages grant and deduplicate; fixed scores and other clients do not", async () => {
  world(); const actor=fixture({level:10});
  game.actors=new Map([[actor.id,actor]]);
  const message=(id,dice=[{faces:20}])=>({uuid:`ChatMessage.${id}`,speaker:{actor:actor.id},rolls:[{dice}],getFlag:(scope,key)=>scope==="core"&&key==="initiativeRoll"});
  await casterInitiativeMessage(message("first"),game.user.id);
  await casterInitiativeMessage(message("first"),game.user.id);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value,1,"durable message ID deduplicates reconstructed rolls");
  await casterInitiativeMessage(message("fixed",[]),game.user.id);
  await casterInitiativeMessage(message("other-client"),"another-client");
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value,1);
  await casterInitiativeMessage(message("reroll"),game.user.id);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value,2);
});

test("class removal and level reduction disable managed resistance without changing authored effects", async () => {
  world(); const actor=fixture({branch:"core",level:10});
  const managed={disabled:false,flags:{ak5e:{casterManagedEffect:{active:true}}},getFlag(s,k){return this.flags?.[s]?.[k];},async update(changes){for(const [path,value]of Object.entries(changes))setPath(this,path,value);}};
  const authored={disabled:false,flags:{},getFlag(){}};
  actor.effects=[managed,authored];
  await reviewCasterEligibility(actor);assert.equal(managed.disabled,false);
  actor.items.get("class").system.levels=9;
  await reviewCasterEligibility(actor);
  assert.equal(managed.disabled,true);assert.equal(managed.flags.ak5e.casterManagedEffect.reviewRequired,true);
  assert.equal(authored.disabled,false);
  managed.disabled=false;actor.items.delete("class");
  await reviewCasterEligibility(actor);assert.equal(managed.disabled,true);
});

test("caster controls require an owner, explicit confirmation, and recorded GM rulings", async () => {
  world();
  const actor = fixture({ branch: "core", level: 3, ap: 1 });
  const before = actor.writes.length;
  await assert.rejects(casterCommand(actor, "powerWithin", { confirmed: false, restCompleted: true }, "cancelled"), /Confirm/);
  await assert.rejects(casterCommand(fixture({ branch: "core", level: 3, owner: false }), "powerWithin", { confirmed: true, restCompleted: true }, "no-owner"), /owned/);
  assert.equal(actor.writes.length, before);
  await assert.rejects(recordCasterRuling(actor, "costOrder", "discountsThenSurcharge", "Long enough reason"), /Only the GM/);
  game.user.isGM = true;
  await assert.rejects(recordCasterRuling(actor, "costOrder", "discountsThenSurcharge", "short"), /source and reason/);
  const recorded = await recordCasterRuling(actor, "costOrder", "discountsThenSurcharge", "Reviewed interaction and selected ordering.");
  assert.equal(recorded.approvedBy, "player");
  assert.equal(actor.flags.ak5e.caster.rulings.costOrder.value, "discountsThenSurcharge");
});

test("Power from Within requires the completed Short Rest and replays once per Long Rest", async () => {
  world();
  const actor = fixture({ branch: "core", level: 3, ap: 3 });
  await assert.rejects(casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: false }, "bad-rest"), /Complete the Short Rest/);
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
  const first = await casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: true }, "power-within");
  const replay = await casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: true }, "power-within");
  assert.deepEqual(first, { recovered: 2, spend: undefined });
  assert.deepEqual(replay, first);
  assert.equal(actor.flags.ak5e.artsPoints.value, 5);
  assert.equal(actor.flags.ak5e.caster.uses.powerWithin, true);
  await assert.rejects(casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: true }, "power-within-again"), /once per Long Rest/);
});

test("ritual cancellation spends no AP; completed ritual spends no more than 3 and records Mystic Charge", async () => {
  world();
  const actor = fixture({ branch: "mystic", level: 1, ap: 8 });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "ritual-start");
  await casterCommand(actor, "cancelRitual", { confirmed: true }, "ritual-cancel");
  assert.equal(actor.flags.ak5e.artsPoints.value, 8);
  assert.equal(actor.flags.ak5e.caster.ritual, null);
  await casterCommand(actor, "beginRitual", { confirmed: true }, "ritual-start-2");
  game.time.worldTime = 60;
  const done = await casterCommand(actor, "finishRitual", { confirmed: true, ap: 3, stationary: true, concentration: true, minuteCompleted: true }, "ritual-finish");
  assert.equal(done.charge, 2);
  assert.equal(actor.flags.ak5e.artsPoints.value, 5);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 2);
  assert.equal(actor.flags.ak5e.caster.spends.at(-1).amount, 3);
});

test("Technology HP uses the GM ruling or the player's reading; the cap of one then two is a warning", async () => {
  const docs = world();
  game.user.isGM = true;
  game.user.id = "gm"; game.users.activeGM = game.user;
  const actor = fixture({ branch: "mech-accord", level: 1 });
  assert.throws(() => droneStatistics(actor), error => error.name === "AK5eReading" && error.key === "technologyModifier");
  await recordCasterRuling(actor, "technologyModifier", "intMod", "Use the Intelligence modifier pending table ruling.");
  assert.equal(droneStatistics(actor).hp, 27);
  let created = 0;
  globalThis.Actor = { implementation: { async create(data) {
    created += 1;
    const drone = { ...structuredClone(data), id: `drone${created}`, uuid: `Actor.drone${created}`, documentName: "Actor", isOwner: true,
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
    docs.set(drone.uuid, drone); game.actors.set(drone.uuid, drone); return drone;
  } } };
  const first = await createCasterDrone(actor, { confirmed: true, operationId: "drone-1" });
  assert.equal(first.ownership.player, 3, "the creator's player retains ownership of the native Drone Actor");
  await assert.rejects(createCasterDrone(actor, { confirmed: true, operationId: "drone-over-cap" }), error => error.name === "AK5eWarnings" && /cap has been reached/.test(error.message));
  actor.items.get("class").system.levels = 10;
  const second = await createCasterDrone(actor, { confirmed: true, operationId: "drone-2" });
  assert.notEqual(second.uuid, first.uuid);
  assert.equal(actor.flags.ak5e.caster.drones.length, 2);
});

test("rebuild needs the Long Rest activity, pays only for missing components, and restores the same Actor", async () => {
  const docs = world(); game.user.isGM = true;
  const actor = fixture({ branch: "mech-accord", level: 1, ap: 4 });
  const drone = { id: "drone", uuid: "Actor.drone", documentName: "Actor", isOwner: true, flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: true } } },
    system: { attributes: { hp: { value: 0, max: 28, temp: 0 } } }, getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  actor.flags.ak5e.caster.drones = [drone.uuid]; docs.set(drone.uuid, drone);
  await assert.rejects(casterCommand(actor, "rebuild", { confirmed: true, droneUuid: drone.uuid, restCompleted: false, components: false }, "rebuild-cancel"), error => error.name === "AK5eWarnings" && /Complete the drone rebuild Long Rest/.test(error.message));
  assert.equal(actor.system.currency.cp, 1000);
  assert.equal(drone.system.attributes.hp.value, 0);
  const result = await casterCommand(actor, "rebuild", { confirmed: true, droneUuid: drone.uuid, restCompleted: true, components: false }, "rebuild-paid");
  assert.equal(result.paid, 500);
  assert.equal(actor.system.currency.cp, 500);
  assert.equal(drone.system.attributes.hp.value, 28);
  assert.equal(drone.flags.ak5e.artsMaster.destroyed, false);
  await casterCommand(actor, "rebuild", { confirmed: true, droneUuid: drone.uuid, restCompleted: true, components: false }, "rebuild-paid");
  assert.equal(actor.system.currency.cp, 500, "same operation ID must not charge twice");
  // Undo restores the payment and the destroyed state.
  await casterCommand(actor, "undoUse", { useId: "rebuild-paid" }, "rebuild-undo");
  assert.equal(actor.system.currency.cp, 1000);
  assert.equal(drone.system.attributes.hp.value, 0);
  assert.equal(drone.flags.ak5e.artsMaster.destroyed, true);
});

test("Jury Rigging explicitly heals a Construct and turns excess healing into Temporary HP", async () => {
  const docs = world(); game.user.isGM = true;
  const scene = { id: "scene", grid: { units: "ft", distance: 5, size: 100 } };
  const actor = fixture({ branch: "mech-accord", level: 3, ap: 4 }); ruling(actor, "juryTempHP", "replace");
  const drone = { id: "drone", uuid: "Actor.drone", documentName: "Actor", isOwner: true,
    flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: false } } }, system: { attributes: { hp: { value: 24, max: 25, temp: 6 } } },
    getFlag(s, k) { return this.flags?.[s]?.[k]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  const casterToken = { documentName: "Token", uuid: "Scene.s.Token.caster", x: 0, y: 0, elevation: 0, width: 1, height: 1, parent: scene, actor };
  const droneToken = { documentName: "Token", uuid: "Scene.s.Token.drone", x: 0, y: 0, elevation: 0, width: 1, height: 1, parent: scene, actor: drone,
    getFlag(s, k) { return this.actor.getFlag(s, k); } };
  actor.flags.ak5e.caster.drones = [drone.uuid]; actor.tokens = [casterToken]; docs.set(drone.uuid, drone); docs.set(droneToken.uuid, droneToken);
  const pending = await casterCommand(actor, "juryRig", { confirmed: true, droneUuid: droneToken.uuid, visible: true, ap: 1 }, "jury-1");
  assert.equal(pending.awaitingRoll, true, "nothing is rolled until the player clicks Roll");
  assert.equal(drone.system.attributes.hp.value, 24);
  assert.equal(actor.flags.ak5e.artsPoints.value, 3, "AP is spent when the use is confirmed");
  const result = await casterCommand(actor, "useRoll", { useId: "jury-1" }, "jury-1-roll");
  assert.equal(result.roll, 8);
  assert.equal(drone.system.attributes.hp.value, 25, "Construct healing exception restores one missing HP");
  assert.equal(drone.system.attributes.hp.temp, 7, "seven points of excess healing replace the lower existing Temporary HP");
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
});

