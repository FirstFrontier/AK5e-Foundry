import test from "node:test";
import assert from "node:assert/strict";
import { casterCommand, handleCasterEvent, casterTurnEvent, casterCombatEnd, casterRest, getCasterView, recordCasterRuling } from "../scripts/caster-features.mjs";
import { onAk5eEvent, offAk5eEvent } from "../scripts/trigger-events.mjs";
import { casterTurn, castCasterArt, casterConsumption, casterGrant, markCasterCastFailure, validateCasterContext } from "../scripts/caster-casting.mjs";
import { artsState, quoteArt } from "../scripts/arts-rules.mjs";

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop(); let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}

test("combat end expires drone damage and attack locks without discarding unfinished burst evidence", async () => {
  const { actor } = setup({branch:"mech-accord", level:10});
  Object.assign(actor.flags.ak5e.caster, {residual:{active:true,amount:3}, attackLocks:{"Token.drone":{castId:"cast"}},
    turn:{key:casterTurn(actor),apSpent:3}, burst:{remaining:1,castIds:["cast"]}});
  await casterCombatEnd({actorUuids:[actor.uuid]});
  assert.equal(actor.flags.ak5e.caster.residual,null);
  assert.deepEqual(actor.flags.ak5e.caster.attackLocks,{});
  assert.deepEqual(actor.flags.ak5e.caster.turn,{});
  assert.equal(actor.flags.ak5e.caster.burst.remaining,1);
});

function setup({ branch = "core", level = 15, ap = 10, charge = 0, roll = 8, combat = true } = {}) {
  let rollCount = 0;
  globalThis.game = {
    user: { id: "owner", isGM: false, targets: new Set() },
    combat: combat ? { started: true, uuid: "Combat.recovery", id: "recovery", round: 2, turn: 0,
      combatant: { id: "creator-turn", actor: { uuid: "Actor.caster" } } } : null,
    time: { worldTime: 0 }, settings: { get: () => false }, actors: new Map(), scenes: new Map()
  };
  const documents = new Map();
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => "recovery-operation" } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { (game.messages ??= []).push(data); return data; } } };
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { rollCount += 1; this.total = roll; return this; }
    async toMessage() {}
  };
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Caster", isOwner: true,
    flags: { ak5e: { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 30, value: ap, maximumArtLevel: 9 },
      caster: { version: 1, enabled: true, choices: {}, pools: ["standard-art-pool-flame-arts"], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [], events: [] },
      resourcePools: { mysticCharge: { value: charge } } } },
    ownership: { default: 0, player: 3 },
    system: { abilities: { int: { value: 14, mod: 2 }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
      attributes: { prof: 3, spell: { attack: 5 }, hp: { value: 10, max: 10, temp: 0 } },
      skills: { ak5etech: { value: 1, total: 3 } }, tools: {}, currency: { cp: 1000 }, bonuses: {} },
    items: new Map(), writes: [], tokens: [], failNextUpdate: null,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; },
    getRollData() { return {}; },
    async update(changes) {
      if (this.failNextUpdate?.(changes)) { this.failNextUpdate = null; throw new Error("injected Actor update failure"); }
      this.writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    },
    async createEmbeddedDocuments(_type, data) { return data.map((entry, i) => ({ ...structuredClone(entry), id: `grant${i}`, type: entry.type, flags: entry.flags, system: entry.system })); }
  };
  const chapterThreeId = branch === "core" ? "subclass-caster-core" : branch === "mystic" ? "subclass-caster-mystic" : "subclass-caster-mech-accord";
  actor.items.set("class", { id: "class", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set("branch", { id: "branch", type: "subclass", system: {}, flags: { ak5e: { chapterThreeId } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  documents.set(actor.uuid, actor); game.actors.set(actor.uuid, actor);
  return { actor, documents, get rollCount() { return rollCount; } };
}

let nativeCastSeq = 0;
function makeArt(actor, { id = "art", level = 1, activation = "action" } = {}) {
  const item = { id, type: "spell", name: "Reviewed Art", actor,
    system: { level, activities: new Map() },
    flags: { ak5e: { art: { enabled: true } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    updateSource(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  // Minimal native-activity completion (attack-suite Activity convention): quotes the real cost from
  // production, consumes through the Caster consumption path, and commits the one native Actor update.
  item.system.activities.set("activity", { id: "activity", activation: { type: activation },
    use: async usage => {
      const updates = { actor: {} };
      const quote = quoteArt(artsState(actor), item.system.level, usage.ak5eLevel ?? item.system.level,
        casterGrant(actor, item, {}), { mode: usage.ak5eMode ?? "ap" });
      const receipt = { id: `native-${item.id}-${++nativeCastSeq}`, itemId: item.id, level: quote.level, cost: quote.cost };
      casterConsumption({ actor, item, activation: { type: activation } }, usage, updates, receipt);
      updates.actor["flags.ak5e.artsPoints.value"] = receipt.after;
      await actor.update(updates.actor);
      actor.flags.ak5e.lastArtCast = receipt;
      return true;
    } });
  actor.items.set(item.id, item); return item;
}

function approved(actor, key, value) {
  actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed printed text and recorded a table ruling." };
}
function completedCast(actor, item, { id = "cast", level = item.system.level, turn = casterTurn(actor), activation = "action" } = {}) {
  const cast = { id, itemId: item.id, level, cost: 0, turn, activation, completed: true, status: "complete", targets: [] };
  actor.flags.ak5e.caster.casts.push(cast); return cast;
}
function linkedDrone(documents, actor, id, { hp = 24, max = 25, temp = 0 } = {}) {
  const scene = { id: "scene", grid: { units: "ft", distance: 5, size: 100 } };
  const drone = { id, uuid: `Actor.${id}`, documentName: "Actor", isOwner: true,
    flags: { ak5e: { artsMaster: { creatorUuid: actor.uuid, destroyed: false } } },
    system: { attributes: { hp: { value: hp, max, temp } } }, updates: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); }
  };
  const casterToken = { documentName: "Token", uuid: `Scene.scene.Token.${id}-creator`, x: 0, y: 0, elevation: 0, width: 1, height: 1, parent: scene, actor };
  const droneToken = { documentName: "Token", uuid: `Scene.scene.Token.${id}`, x: 0, y: 0, elevation: 0, width: 1, height: 1, parent: scene, actor: drone,
    getFlag(scope, key) { return this.actor.getFlag(scope, key); } };
  actor.tokens = [...actor.tokens, casterToken]; actor.flags.ak5e.caster.drones.push(drone.uuid);
  documents.set(drone.uuid, drone); documents.set(droneToken.uuid, droneToken); game.actors.set(drone.uuid, drone);
  return { drone, token: droneToken, scene };
}

test("prepared/applying feature receipts stay pending for retry while unrelated native casts warn and proceed; pre-consumption failures spend nothing", async () => {
  const { actor } = setup({ level: 3, ap: 6 });
  const art = makeArt(actor);
  for (const status of ["prepared", "applying"]) {
    actor.flags.ak5e.caster.operations = [{ id: `pending-${status}`, command: "powerWithin", data: {}, status }];
    const writes = actor.writes.length, ap = actor.flags.ak5e.artsPoints.value;
    // Same-work retry still needs the same ID: a second powerWithin under a new ID is refused.
    await assert.rejects(casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: true }, `new-${status}`), /interrupted operation/);
    // Spec §3.1/R7: the unrelated pending receipt is recovery evidence, never a blanket lock — the
    // independent native cast warns (Use anyway) and proceeds on its own quote.
    const notices = [];
    const notify = globalThis.ui.notifications.warn;
    globalThis.ui.notifications.warn = message => notices.push(String(message));
    let result;
    try {
      result = await castCasterArt(actor, art.id, { mode: "ap", level: 1 });
    } finally { globalThis.ui.notifications.warn = notify; }
    assert.equal(result, true, "an unrelated pending operation must not veto an independent native cast");
    assert.ok(notices.some(message => message.includes(`pending-${status}`) && message.includes("not blocked")),
      `the pending receipt must be surfaced as a warning, got: ${JSON.stringify(notices)}`);
    assert.equal(actor.flags.ak5e.caster.operations.filter(op => op.id === `pending-${status}` && op.status === status).length, 1,
      "the unrelated receipt stays pending for retry or GM reconciliation");
    const committed = actor.flags.ak5e.caster.casts.find(cast => cast.itemId === art.id && cast.status === "consumed");
    assert.ok(committed, "the independent cast committed its own receipt");
    assert.equal(committed.cost, 1, "level 1 at Caster level 3 pays the base 1 AP (no Growing Power below level 5)");
    assert.equal(actor.flags.ak5e.artsPoints.value, ap - 1, "the independent cast paid its own quote");
    assert.ok(actor.writes.length > writes, "the independent cast committed its Actor update");
    // Use anyway lists the accepted warning on the public card instead of only notifying.
    const listed = validateCasterContext(actor, art, { mode: "ap", level: 1, overrides: ["interruptedOperation"] });
    assert.ok(listed.overridden.some(text => text.includes(`pending-${status}`)),
      "an accepted Use-anyway warning is listed on the public card");
  }
  actor.flags.ak5e.caster.operations = [];
  actor.flags.ak5e.caster.casts = [{ id: "interrupted-cast", status: "failed", completed: false }];
  const before = actor.writes.length;
  await assert.rejects(casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: true }, "after-failed-cast"), /interrupted operation/);
  // R12/ATK-03: the failed receipt stays visible for recovery, but an unrelated Art is not locked.
  const failedNotices = [];
  const failedNotify = globalThis.ui.notifications.warn;
  globalThis.ui.notifications.warn = message => failedNotices.push(String(message));
  let failedResult;
  try {
    failedResult = await castCasterArt(actor, art.id, { mode: "ap", level: 1 });
  } finally { globalThis.ui.notifications.warn = failedNotify; }
  assert.equal(failedResult, true, "a failed receipt for another operation must not veto an independent cast");
  assert.ok(failedNotices.some(message => message.includes("interrupted-cast") && message.includes("not blocked")),
    `the failed receipt must be surfaced as a warning, got: ${JSON.stringify(failedNotices)}`);
  assert.ok(actor.flags.ak5e.caster.casts.some(cast => cast.id === "interrupted-cast" && cast.status === "failed"),
    "the failed receipt stays visible for recovery");
  assert.ok(actor.writes.length > before, "the independent cast committed its Actor update");

  actor.flags.ak5e.caster.casts = [];
  const tailWrites = actor.writes.length;
  await assert.rejects(casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: false }, "invalid-rest"), /Short Rest/);
  await assert.rejects(castCasterArt(actor, "missing-art", { mode: "ap", level: 1 }), /known Art/);
  const cancelled = makeArt(actor, { id: "cancelled", level: 1 });
  cancelled.system.activities.get("activity").use = async () => ({ cancelled: true });
  const ap = actor.flags.ak5e.artsPoints.value, receiptCount = actor.flags.ak5e.caster.operations.length;
  const response = await castCasterArt(actor, cancelled.id, { mode: "ap", level: 1 });
  assert.deepEqual(response, { cancelled: true });
  assert.equal(actor.flags.ak5e.artsPoints.value, ap);
  assert.equal(actor.flags.ak5e.caster.operations.length, receiptCount);
  assert.equal(actor.writes.length, tailWrites, "invalid or canceled pre-consumption actions create no receipts or resource updates");
});

test("an interrupted Jury Rigging commit changes nothing; the same ID spends once, and the clicked roll heals once", async () => {
  const env = setup({ branch: "mech-accord", level: 3, ap: 4, roll: 8 });
  const { actor, documents } = env;
  approved(actor, "juryTempHP", "replace");
  const { drone, token } = linkedDrone(documents, actor, "repair-drone");
  actor.failNextUpdate = changes => changes["flags.ak5e.artsPoints.value"] !== undefined;
  const data = { confirmed: true, droneUuid: token.uuid, visible: true, ap: 1 };
  // The AP and the use receipt are written together, before anything is rolled or healed.
  await assert.rejects(casterCommand(actor, "juryRig", data, "jury-recovery"), /injected Actor update failure/);
  assert.equal(drone.system.attributes.hp.value, 24);
  assert.equal(actor.flags.ak5e.artsPoints.value, 4);
  assert.equal(env.rollCount, 0, "nothing is rolled before the player clicks Roll");
  assert.equal(await casterCommand(actor, "juryRig", data, "jury-recovery").then(result => result.awaitingRoll), true);
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
  // A failed drone write keeps the roll; the retry applies it without rolling again.
  let failDrone = true;
  const update = drone.update;
  drone.update = async function(changes) { if (failDrone) { failDrone = false; throw new Error("injected drone update failure"); } return update.call(this, changes); };
  await assert.rejects(casterCommand(actor, "useRoll", { useId: "jury-recovery" }, "jury-roll-1"), /Not applied yet: injected drone update failure/);
  assert.equal(drone.system.attributes.hp.value, 24);
  const result = await casterCommand(actor, "useRoll", { useId: "jury-recovery" }, "jury-roll-2");
  assert.equal(result.roll, 8);
  assert.equal(drone.system.attributes.hp.value, 25);
  assert.equal(drone.system.attributes.hp.temp, 7);
  await casterCommand(actor, "useRoll", { useId: "jury-recovery" }, "jury-roll-3");
  assert.equal(drone.system.attributes.hp.temp, 7, "a completed repair is never applied twice");
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
  assert.equal(actor.flags.ak5e.caster.spends.filter(spend => spend.id === "jury-recovery").length, 1);
  assert.equal(env.rollCount, 1, "the stored roll is reused on retry");
  // Undo restores the AP and removes the repair.
  await casterCommand(actor, "undoUse", { useId: "jury-recovery" }, "jury-undo");
  assert.equal(actor.flags.ak5e.artsPoints.value, 4);
  assert.equal(drone.system.attributes.hp.value, 24);
  assert.equal(drone.system.attributes.hp.temp, 0);

  const spendEvent = { kind: "apSpent", actorUuid: actor.uuid, operationId: "jury-recovery", amount: 1, turn: casterTurn(actor), reason: "Jury Rigging" };
  await handleCasterEvent(spendEvent); await handleCasterEvent(spendEvent);
  assert.equal(actor.flags.ak5e.caster.spends.filter(spend => spend.id === "jury-recovery").length, 1, "actual-spend event replay is deduplicated");
});

test("Jury Rigging with no excess healing preserves existing temporary HP under a replacement ruling", async () => {
  const { actor, documents } = setup({ branch: "mech-accord", level: 3, ap: 4, roll: 8 });
  approved(actor, "juryTempHP", "replace");
  const { drone, token } = linkedDrone(documents, actor, "no-excess-drone", { hp: 10, max: 25, temp: 7 });
  await casterCommand(actor, "juryRig", { confirmed: true, droneUuid: token.uuid, visible: true, ap: 1 }, "no-excess-repair");
  await casterCommand(actor, "useRoll", { useId: "no-excess-repair" }, "no-excess-roll");
  assert.equal(drone.system.attributes.hp.value, 18);
  assert.equal(drone.system.attributes.hp.temp, 7);
  assert.equal(actor.flags.ak5e.artsPoints.value, 3);
});

test("Wolfpack retries after reaction write, preserves per-drone budgets, and resets only on creator Turn Start", async () => {
  const { actor, documents } = setup({ branch: "mech-accord", level: 10, ap: 8 });
  approved(actor, "droneReactionTiming", "ownBudget");
  const first = linkedDrone(documents, actor, "wolf-one");
  const second = linkedDrone(documents, actor, "wolf-two");
  const art = makeArt(actor); const cast = completedCast(actor, art);
  const command = droneUuid => ({ confirmed: true, droneUuid, castId: cast.id, visible: true });
  actor.failNextUpdate = changes => {
    const state = changes["flags.ak5e.caster"];
    return state?.undo?.some(use => use.id === "wolf-retry" && use.status === "complete");
  };
  await assert.rejects(casterCommand(actor, "wolfpack", command(first.drone.uuid), "wolf-retry"), /injected Actor update failure/);
  assert.equal(first.drone.flags.ak5e.artsMaster.reactionOperation, "wolf-retry");
  assert.equal(actor.flags.ak5e.artsPoints.value, 8);
  await casterCommand(actor, "wolfpack", command(first.drone.uuid), "wolf-retry");
  assert.equal(actor.flags.ak5e.artsPoints.value, 8, "Wolfpack does not spend AP on a retry");
  await casterCommand(actor, "wolfpack", command(second.drone.uuid), "wolf-second");
  assert.equal(second.drone.flags.ak5e.artsMaster.reactionOperation, "wolf-second", "the second drone has an independent Reaction budget");

  game.combat.round = 3; game.combat.turn = 2;
  actor.flags.ak5e.caster.casts.find(entry => entry.id === cast.id).turn = casterTurn(actor);
  await assert.rejects(casterCommand(actor, "wolfpack", command(first.drone.uuid), "wolf-new-global-turn"), /already used its Reaction/);
  assert.equal(first.drone.flags.ak5e.artsMaster.reactionTurn, "Combat.recovery:2:creator-turn");
  game.combat.turn = 0; game.combat.combatant = { id: "creator-turn-3", actor };
  actor.flags.ak5e.caster.casts.find(entry => entry.id === cast.id).turn = casterTurn(actor);
  await casterTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.recovery", round: 3, combatantId: "creator-turn-3", turn: 0, skipped: false });
  assert.equal(first.drone.flags.ak5e.artsMaster.reactionTurn, null);
  await casterCommand(actor, "wolfpack", command(first.drone.uuid), "wolf-after-creator-start");
  assert.equal(first.drone.flags.ak5e.artsMaster.reactionOperation, "wolf-after-creator-start");
});

test("Unending requires level and recorded expenditure policy, refunds fully without adding a spend or cast", async () => {
  let low = setup({ level: 17, ap: 5, roll: 3 });
  low.actor.flags.ak5e.caster.spends = [{ id: "old-spend", amount: 3, reason: "Art cast" }];
  approved(low.actor, "unendingBasis", "actualSpend");
  await assert.rejects(casterCommand(low.actor, "unending", { confirmed: true, spendId: "old-spend" }, "unending-low"), /level 18/);

  // Spec R7/OR-3 on a separate actor so the refund ledger below stays exact: with no recorded ruling
  // the source-consistent actual-expenditure reading is offered for this use — never a GM veto.
  const bare = setup({ level: 18, ap: 5, roll: 3 });
  bare.actor.flags.ak5e.caster.spends = [{ id: "unruled-spend", amount: 3, reason: "Art cast", level: 1 }];
  const unruled = await casterCommand(bare.actor, "unending", { confirmed: true, spendId: "unruled-spend" }, "unending-no-policy")
    .then(value => ({ value }), error => ({ rejected: error }));
  assert.equal(unruled.rejected?.name, "AK5eReading", "a missing ruling offers the named actual-expenditure reading for this use");
  assert.equal(unruled.rejected?.key, "unendingBasis");
  assert.doesNotMatch(String(unruled.rejected?.message ?? ""), /GM must record a ruling/, "the legacy GM-required veto is superseded");
  assert.deepEqual((unruled.rejected?.options ?? []).map(option => option.value ?? option), ["actualSpend"],
    "the only offered reading is the source-consistent actual expenditure");
  const readingOffer = await casterCommand(bare.actor, "unending", { confirmed: true, spendId: "unruled-spend", reading: "actualSpend" }, "unending-no-policy");
  assert.equal(readingOffer?.awaitingRoll, true, "the per-use reading makes the offer reachable with no GM online");
  assert.equal(bare.actor.flags.ak5e.caster.rulings.unendingBasis, undefined, "a player's per-use reading is never stored as a world ruling");
  assert.equal(bare.rollCount, 0, "still no automatic die");

  const { actor } = setup({ level: 18, ap: 5, roll: 3 });
  actor.flags.ak5e.caster.spends = [{ id: "actual-cast-spend", amount: 3, reason: "Art cast", level: 2 }];
  approved(actor, "unendingBasis", "actualSpend");
  const prepared = await casterCommand(actor, "unending", { confirmed: true, spendId: "actual-cast-spend" }, "unending-refund");
  assert.equal(prepared.awaitingRoll, true);
  const result = await casterCommand(actor, "useRoll", { useId: "unending-refund" }, "unending-refund-roll");
  assert.deepEqual({ roll: result.roll, refunded: result.refunded }, { roll: 3, refunded: 3 });
  assert.equal(actor.flags.ak5e.artsPoints.value, 8);
  assert.equal(actor.flags.ak5e.caster.spends.length, 1);
  assert.equal(actor.flags.ak5e.caster.spends[0].id, "actual-cast-spend");
  assert.equal(actor.flags.ak5e.caster.spends[0].refundRoll, 3);
  assert.equal(actor.flags.ak5e.caster.casts.length, 0, "a refund is separate from spending and does not create an Art cast");
  await casterCommand(actor, "unending", { confirmed: true, spendId: "actual-cast-spend" }, "unending-refund");
  assert.equal(actor.flags.ak5e.artsPoints.value, 8, "replaying a completed refund does not refund again");
});

test("Savant damage ignores DR/resistance but retains vulnerability and immunity", async () => {
  const { actor } = setup({ branch: "core", level: 15, ap: 10 });
  const art = makeArt(actor, { level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "savant-cast", level: 3 });
  const target = { id: "target", uuid: "Actor.target", documentName: "Actor", isOwner: true,
    flags: { ak5e: {} }, system: { attributes: { hp: { value: 100, max: 100, temp: 0 } } },
    getFlag(s, k) { return this.flags?.[s]?.[k]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  fromUuidSync = uuid => uuid === target.uuid ? target : uuid === actor.uuid ? actor : null;
  const result = await casterCommand(actor, "damage", { confirmed: true, castId: "savant-cast", targetUuid: target.uuid, amount: 10, type: "fire", reduction: 5, resistance: true, vulnerability: true, immunity: false }, "savant-damage");
  assert.equal(result.final, 20, "DR and resistance are ignored while vulnerability still doubles damage");
  assert.equal(target.system.attributes.hp.value, 80);
  const immune = await casterCommand(actor, "damage", { confirmed: true, castId: "savant-cast", targetUuid: target.uuid, amount: 10, type: "fire", reduction: 5, resistance: true, vulnerability: true, immunity: true }, "savant-immunity");
  assert.equal(immune.final, 0, "immunity remains effective for a Signature Art");
  assert.equal(target.system.attributes.hp.value, 80);
});

test("Potent Cantrip halves miss/save damage without extra effects, requires multi-attack ruling, and retries exact target result", async () => {
  const { actor } = setup({ branch: "mystic", level: 3 });
  const cantrip = makeArt(actor, { id: "cantrip", level: 0 });
  completedCast(actor, cantrip, { id: "potent-miss", level: 0 });
  const target = { id: "potent-target", uuid: "Actor.potent-target", documentName: "Actor", isOwner: true,
    flags: { ak5e: {} }, system: { attributes: { hp: { value: 100, max: 100, temp: 0 } } }, updates: [],
    getFlag(s, k) { return this.flags?.[s]?.[k]; }, async update(changes) {
      if (this.failOnce) { this.failOnce = false; throw new Error("injected target update failure"); }
      this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
    } };
  fromUuidSync = uuid => uuid === target.uuid ? target : uuid === actor.uuid ? actor : null;
  // Engine contract (caster-primal-splash.mjs changeTarget): target changes resolve asynchronously
  // via fromUuid (the GM-relay path), so the harness mirrors the same documents there.
  globalThis.fromUuid = async uuid => globalThis.fromUuidSync(uuid) ?? null;
  target.failOnce = true;
  const data = { confirmed: true, castId: "potent-miss", targetUuid: target.uuid, outcome: "miss", amount: 9, type: "force", reduction: 0, resistance: false, vulnerability: false, immunity: false, damageReviewed: true };
  await assert.rejects(casterCommand(actor, "potent", data, "potent-retry"), /injected target update failure/);
  // Engine contract (caster-primal-splash.mjs): a routed branch use records its receipt in state.undo
  // (not state.operations); the recorded target change carries the reviewed half damage.
  const stored = actor.flags.ak5e.caster.undo.find(entry => entry.id === "potent-retry");
  assert.equal(stored.targets[0].damage.amount, 4);
  const result = await casterCommand(actor, "potent", data, "potent-retry");
  // Engine contract (caster-mystic.mjs potent plan): the result reports the applied half as amount.
  assert.equal(result.amount, 4);
  assert.equal(result.noAdditionalEffects, true);
  assert.equal(target.system.attributes.hp.value, 96);
  assert.equal(target.updates.length, 1, "same-ID retry applies the exact recorded result once");

  completedCast(actor, cantrip, { id: "potent-save", level: 0 });
  const saveTarget = { ...target, id: "save-target", uuid: "Actor.save-target", flags: { ak5e: {} }, system: { attributes: { hp: { value: 100, max: 100, temp: 0 } } }, updates: [], async update(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  documentsForSave(saveTarget, actor);
  const save = await casterCommand(actor, "potent", { ...data, castId: "potent-save", targetUuid: saveTarget.uuid, outcome: "save", amount: 8 }, "potent-save-op");
  assert.equal(save.amount, 4); assert.equal(save.noAdditionalEffects, true);
  // Engine contract (caster-mystic.mjs potent plan): a multi-attack Cantrip needs the recorded
  // potentMultiAttack ruling before automation — the same gate as the monolith, in engine wording
  // (also pinned by frozen mystic audit-5c).
  await assert.rejects(casterCommand(actor, "potent", { ...data, castId: "potent-save", targetUuid: saveTarget.uuid, outcome: "save", amount: 8, multiAttack: true }, "potent-multi"), /record a ruling for potentMultiAttack/);
  approved(actor, "potentMultiAttack", true);
  const multi = await casterCommand(actor, "potent", { ...data, castId: "potent-save", targetUuid: saveTarget.uuid, outcome: "save", amount: 8, multiAttack: true }, "potent-multi-approved");
  assert.equal(multi.amount, 4);
});

function documentsForSave(target, actor) {
  const prior = globalThis.fromUuidSync;
  globalThis.fromUuidSync = uuid => uuid === target.uuid ? target : prior(uuid) ?? (uuid === actor.uuid ? actor : null);
}

test("Residual Energy from a levelled off-turn cast remains until creator Turn End and free/duplicate events do not alter it", async () => {
  const { actor, documents } = setup({ branch: "mech-accord", level: 10 });
  approved(actor,"residualStacking","sum");
  const offTurn = "Combat.recovery:2:other-combatant";
  const spend = { kind: "apSpent", actorUuid: actor.uuid, operationId: "reaction-cast", amount: 2, turn: offTurn, level: 1, reason: "Reaction Art" };
  await handleCasterEvent(spend);
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "reaction-cast", amount: 2, level: 1, turn: offTurn });
  assert.deepEqual(actor.flags.ak5e.caster.residual, { turn: offTurn, active: true, amount: 2, amounts: [2], choice: "sum" });
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "free-cast", amount: 0, level: 1, turn: offTurn });
  assert.equal(actor.flags.ak5e.caster.residual.amount, 2, "free casts add no Residual Energy");
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "reaction-cast", amount: 2, level: 1, turn: offTurn });
  assert.equal(actor.flags.ak5e.caster.residual.amount, 2, "duplicate artCast receipts do not stack again");
  documents.set("Actor.other", { uuid: "Actor.other", documentName: "Actor", isOwner: true, type: "character", flags: { ak5e: { caster: { enabled: false } } }, items: new Map() });
  await casterTurnEvent({ kind: "turnEnd", actorUuid: "Actor.other", combatUuid: "Combat.recovery", round: 2, combatantId: "other-combatant", turn: 1, skipped: false });
  assert.equal(actor.flags.ak5e.caster.residual.active, true, "another combatant ending a Turn does not expire the creator's rider");
  await casterTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.recovery", round: 2, combatantId: "creator-turn", turn: 0, skipped: false });
  assert.equal(actor.flags.ak5e.caster.residual, null, "a reaction cast expires when the creator's Turn ends");
});

test("several levelled Arts apply the latest AP until the player's reading or a GM ruling; the reading is undoable", async () => {
  const { actor } = setup({ branch: "mech-accord", level: 10 });
  const offTurn = "Combat.recovery:2:other-combatant";
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "stack-first", amount: 2, level: 1, turn: offTurn });
  await handleCasterEvent({ kind: "artCast", actorUuid: actor.uuid, operationId: "second-cast", amount: 3, level: 2, turn: offTurn });
  assert.equal(actor.flags.ak5e.caster.residual.requiresGM, undefined, "Army of One is never suspended for a GM ruling");
  assert.equal(actor.flags.ak5e.caster.residual.amount, 3, "until a reading is chosen, the latest Art applies");
  await handleCasterEvent({kind:"artCast",actorUuid:actor.uuid,operationId:"third-cast",amount:4,level:1,turn:offTurn});
  assert.deepEqual(actor.flags.ak5e.caster.residual.amounts,[2,3,4]);
  await casterCommand(actor, "residualReading", { reading: "sum", confirmed: true }, "residual-sum");
  assert.equal(actor.flags.ak5e.caster.residual.amount, 9);
  assert.match(game.messages.at(-1).content, /Player's reading for this use/);
  await casterCommand(actor, "undoUse", { useId: "residual-sum" }, "residual-undo");
  assert.equal(actor.flags.ak5e.caster.residual.amount, 4);
  game.user.isGM=true;
  await recordCasterRuling(actor,"residualStacking","sum","Reviewed source residual-energy stacking as addition.");
  assert.equal(actor.flags.ak5e.caster.residual.amount,9);
  await casterTurnEvent({ kind: "turnEnd", actorUuid: actor.uuid, combatUuid: "Combat.recovery", round: 2, combatantId: "creator-turn", turn: 0, skipped: false });
  assert.equal(actor.flags.ak5e.caster.residual, null, "the creator's Turn End expires the rider");

  const resolved = setup({ branch: "mech-accord", level: 10 }).actor;
  approved(resolved, "residualStacking", "sum");
  const turn = "Combat.recovery:2:creator-turn";
  await handleCasterEvent({ kind: "artCast", actorUuid: resolved.uuid, operationId: "stack-one", amount: 2, level: 1, turn });
  await handleCasterEvent({ kind: "artCast", actorUuid: resolved.uuid, operationId: "stack-two", amount: 3, level: 6, turn });
  assert.equal(resolved.flags.ak5e.caster.residual.amount, 5, "a recorded sum ruling combines positive AP expenditures");
});

test("zero-cost levelled casts obey the recorded latest/sum policy; without one the latest applies", async () => {
  for (const policy of ["latest","sum",null]) {
    const {actor}=setup({branch:"mech-accord",level:10});
    if(policy)approved(actor,"residualStacking",policy);
    for(const [id,amount]of [["first",2],["free",0]])await handleCasterEvent({kind:"artCast",actorUuid:actor.uuid,operationId:id,amount,level:1,turn:casterTurn(actor)});
    assert.equal(actor.flags.ak5e.caster.residual.amount,policy==="sum"?2:0);
    assert.equal(actor.flags.ak5e.caster.residual.choice,policy);
  }
  const {actor}=setup({branch:"mech-accord",level:10});
  await handleCasterEvent({kind:"artCast",actorUuid:actor.uuid,operationId:"zero",amount:0,level:1,turn:casterTurn(actor)});
  await handleCasterEvent({kind:"artCast",actorUuid:actor.uuid,operationId:"positive",amount:2,level:1,turn:casterTurn(actor)});
  assert.equal(actor.flags.ak5e.caster.residual.amount,2,"without a ruling the latest Art applies");
});

test("an unfinished burst after Turn end is visible and GM reconciliation retains outcomes without refunding charges", async () => {
  const {actor}=setup({branch:"mystic",level:6});
  actor.flags.ak5e.caster.burst={remaining:2,total:3,turn:casterTurn(actor),castIds:["first-cast"]};
  await casterTurnEvent({kind:"turnEnd",actorUuid:actor.uuid,combatUuid:"Combat.recovery",round:2,combatantId:"creator-turn"});
  assert.ok(getCasterView(actor).pending.some(op=>op.id==="burst_first-cast"));
  actor.flags.ak5e.resourcePools.mysticCharge.value=2;
  await casterRest(actor,"long");
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value,0);
  assert.ok(getCasterView(actor).pending.some(op=>op.id==="burst_first-cast"),"Long Rest must retain the interrupted burst for review");
  assert.equal(actor.flags.ak5e.caster.burst.remaining,2);
  game.user.isGM=true;
  await casterCommand(actor,"reconcile",{confirmed:true,operationId:"burst_first-cast",reason:"Reviewed interrupted burst; remaining uses abandoned."},"review-burst");
  assert.equal(actor.flags.ak5e.caster.burst,null);
  assert.deepEqual(actor.flags.ak5e.caster.burstRecovery.castIds,["first-cast"]);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value,0);
});

test("branch AP event failure retains a committed receipt and retries only the event", async () => {
  const {actor,documents}=setup({branch:"mystic",level:1,ap:8});
  const handler=onAk5eEvent("apSpent",()=>{throw new Error("injected event failure");});
  await casterCommand(actor,"beginRitual",{confirmed:true},"begin-event-test");
  game.time.worldTime=60;
  const data={confirmed:true,ap:2,stationary:true,concentration:true,minuteCompleted:true};
  try {await assert.rejects(casterCommand(actor,"finishRitual",data,"finish-event-test"),/event handling failed/);}
  finally {offAk5eEvent("apSpent",handler);}
  assert.equal(actor.flags.ak5e.artsPoints.value,6);
  // Engine contract (caster-primal-splash.mjs AP-event promotion): the committed receipt lives in
  // state.undo and the failed AP event marks it eventFailed instead of warning only.
  assert.equal(actor.flags.ak5e.caster.undo.find(entry => entry.id === "finish-event-test").status, "eventFailed");
  assert.ok(getCasterView(actor).pending.some(op=>op.status==="eventFailed"));
  await assert.rejects(casterCommand(actor,"beginRitual",{confirmed:true},"another-ritual"),/Retry or reconcile/);
  await casterCommand(actor,"finishRitual",data,"finish-event-test");
  assert.equal(actor.flags.ak5e.artsPoints.value,6,"retry cannot consume AP again");
  // Engine contract: the same-ID retry replays the recorded result and the repaired AP event completes it.
  assert.equal(actor.flags.ak5e.caster.undo.find(entry => entry.id === "finish-event-test").status, "complete");
});

test("Mystic Feedback Loop grants from completed AP-funded casts, adds its level-6 gain, caps, and deduplicates", async () => {
  const { actor } = setup({ branch: "mystic", level: 15, charge: 0 });
  const event = { kind: "artCast", actorUuid: actor.uuid, operationId: "feedback-6", amount: 4, level: 6, turn: casterTurn(actor) };
  await handleCasterEvent(event); await handleCasterEvent(event);
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 2, "a level 6+ AP-funded cast gives two charge once");
  await handleCasterEvent({ ...event, operationId: "feedback-free", amount: 0, level: 1 });
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 2, "free casts grant no charge");
  await handleCasterEvent({ ...event, operationId: "feedback-cap", amount: 1, level: 1 });
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 3, "level 15 has a maximum of three charges");
  await handleCasterEvent({ ...event, operationId: "feedback-over-cap", amount: 2, level: 6 });
  assert.equal(actor.flags.ak5e.resourcePools.mysticCharge.value, 3, "charge does not exceed the level-based maximum");
});
