/**
 * WP caster-branch-deps — post-candidate ATTACK pass (tester: adversary, 2026-11-04).
 * Targets the C2 Core candidate (ak5e/scripts/caster-core.mjs) and the C5 Mystic candidate
 * (ak5e/scripts/caster-mystic.mjs, driven through the shared use engine and casterCommand
 * routing). C6 Primal is out of scope (separate draft). Black-box: only exported/public
 * surfaces are called; candidate bodies are treated as untrusted.
 *
 * Compatibility baseline: ak5e/test/caster-core-audit.test.mjs (21) and
 * ak5e/test/caster-mystic-audit.test.mjs (24) — both GREEN before this file. Nothing here
 * contradicts them: they pin the happy paths and listed rejections; this file attacks the
 * gaps — pool/AP accounting under retries and concurrency, grant lifecycles, receipt undo
 * (double-undo, foreign/forged receipts, locked windows), GM-relay spoofing, cross-branch
 * interference and malformed inputs, per WORKFLOW.md §3.2.
 *
 * Harness conventions are copied from the two frozen audits (same in-memory world shapes),
 * extended with: mutable encounter epochs, embedded delete bookkeeping, an injectable
 * update-failure hook, and real damage-roll fixtures for Savant rerolls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { casterCommand, casterRest, registerCasterFeatureHooks, mysticCharge } from "../scripts/caster-features.mjs";
import { casterTurn } from "../scripts/caster-casting.mjs";
import * as core from "../scripts/caster-core.mjs";
import { relayedTargetChange } from "../scripts/caster-primal-splash.mjs";

/* ============================== Core harness (frozen caster-core-audit conventions) ============================== */
const setPath = (object, path, value) => {
  const parts = path.split("."), last = parts.pop(); let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
};
function coreWorld({ level = 15, ap = 10, maximum = 30, maxArtLevel = 9, branch = "core", gm = false } = {}) {
  let rollCount = 0, epoch = 0;
  globalThis.game = {
    user: { id: "owner", isGM: gm, targets: new Set() },
    combat: { started: true, uuid: "Combat.atk", id: "atk", round: 2, turn: 0, combatant: { id: "caster-turn", actor: { uuid: "Actor.caster" } } },
    time: { worldTime: 0 },
    settings: { get: (_module, key) => key === "encounterEpoch" ? epoch : false, async set(_module, key, value) { if (key === "encounterEpoch") epoch = value; } },
    actors: new Map(), scenes: new Map(), users: new Map([["owner", { id: "owner", isGM: false }], ["gm", { id: "gm", isGM: true }]])
  };
  globalThis.fromUuidSync = () => null;
  globalThis.fromUuid = async () => null;
  globalThis.foundry = { utils: { randomID: () => "branch-deps-attack" } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { return data; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { rollCount += 1; this.total = 4; return this; } async toMessage() {} };
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Core Caster", isOwner: true,
    flags: { ak5e: { casting: { enabled: true, ability: "int", recovery: "long" },
      artsPoints: { maximum, value: ap, maximumArtLevel: maxArtLevel },
      caster: { version: 1, enabled: true, choices: {}, pools: ["standard-art-pool-flame-arts"], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [], events: [] },
      resourcePools: {} } },
    ownership: { default: 0, player: 3 },
    system: { abilities: { int: { value: 20, mod: 5 }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 }, con: { value: 12, mod: 1 } },
      attributes: { prof: 4, spell: { attack: 5, dc: 13 }, hp: { value: 10, max: 10, temp: 0 } },
      skills: {}, tools: {}, currency: { cp: 1000 }, bonuses: {} },
    items: new Map(), writes: [], deletes: [], tokens: [], failNextUpdate: false,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; },
    getRollData() { return {}; },
    async update(changes) {
      if (this.failNextUpdate) { this.failNextUpdate = false; throw new Error("prevented"); }
      this.writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    },
    async createEmbeddedDocuments(_type, data) {
      return data.map((entry, i) => {
        const item = { ...structuredClone(entry), id: `grant${this.items.size + i}`, type: entry.type, name: entry.name, flags: entry.flags, system: entry.system,
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
        this.items.set(item.id, item); return item;
      });
    },
    async deleteEmbeddedDocuments(_type, ids) {
      for (const id of ids) this.items.delete(id);
      this.deletes.push(...ids);
      return ids.map(id => ({ id }));
    }
  };
  const branchId = branch === "mystic" ? "subclass-caster-mystic" : "subclass-caster-core";
  actor.items.set("class", { id: "class", type: "class", name: "Caster", system: { levels: level, hd: { denomination: "d6" } }, flags: { ak5e: { chapterThreeId: "class-caster" } }, parent: actor, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set("branch", { id: "branch", type: "subclass", name: branch, system: {}, flags: { ak5e: { chapterThreeId: branchId } }, parent: actor, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  return { actor, get rollCount() { return rollCount; }, advanceEpoch: () => { epoch += 1; } };
}
function makeArt(actor, { id = "art", level = 1 } = {}) {
  const activity = { id: "activity", activation: { type: "action" }, damage: { parts: [[`2d6[fire]`]] } };
  const item = { id, type: "spell", name: `Reviewed Art ${id}`, actor,
    system: { level, activities: new Map([["activity", activity]]), duration: {} }, updates: [],
    flags: { ak5e: { enabled: true, art: { enabled: true } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    updateSource(changes) { this.updates.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
  actor.items.set(item.id, item); return item;
}
function completedCast(actor, item, { id = "cast", level = item?.system?.level ?? 1, cost = 1, turn = casterTurn(actor) } = {}) {
  const cast = { id, itemId: item?.id ?? id, level, cost, turn, activation: "action", completed: true, status: "complete", targets: [] };
  actor.flags.ak5e.caster.casts.push(cast); return cast;
}
const rule = (actor, key, value) => { actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed printed ruling for attack pass." }; };
/** A die term of an actual damage roll, with scripted reroll results. */
function makeDie(faces, first, script = []) {
  return { faces, results: [{ result: first, active: true }], rolls: 0, script,
    async roll({ reroll } = {}) {
      assert.equal(reroll, true, "test die only supports reroll mode");
      this.rolls += 1;
      const value = this.script.length ? this.script.shift() : Math.min(this.faces, 4);
      const result = { result: value, active: true };
      this.results.push(result);
      return result;
    } };
}

/* ============================== Mystic harness (frozen caster-mystic-audit conventions) ============================== */
const mysticStorage = {};
function getFlagFn(scope, key) { return this.flags?.[scope]?.[key]; }
function actorDoc(uuid, { owner = true, hp = { value: 30, max: 30, temp: 0 } } = {}) {
  return { id: uuid.split(".").at(-1), uuid, documentName: "Actor", type: "npc", name: uuid.split(".").at(-1), isOwner: owner,
    flags: { ak5e: {} }, system: { attributes: { hp: structuredClone(hp) } }, items: new Map(), effects: new Map(), writes: [], getFlag: getFlagFn,
    async update(changes) { this.writes.push(structuredClone(changes)); for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; },
    async createEmbeddedDocuments(type, data) {
      return data.map(entry => { const id = `e${this.effects.size + 1}_${Math.random().toString(36).slice(2, 6)}`; const doc = { ...entry, id, parent: this, uuid: `${this.uuid}.ActiveEffect.${id}`, getFlag: getFlagFn }; this.effects.set(id, doc); return doc; });
    }, async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.effects.delete(id); } };
}
function mysticWorld({ gm = false, withCombat = true } = {}) {
  const documents = new Map(), messages = [];
  globalThis.game = { user: { id: gm ? "gm" : "player", isGM: gm, targets: new Set() }, combat: withCombat ? {
      started: true, uuid: "Combat.c", id: "c", round: 1, turn: 0, combatant: { id: "c1", actor: { uuid: "Actor.caster" } },
      turns: [{ id: "c1", actor: { uuid: "Actor.caster" } }, { id: "c2", actor: { uuid: "Actor.target" } }] } : null,
    time: { worldTime: 0 }, settings: { get: (_m, key) => mysticStorage[key] ?? false, async set(_m, key, value) { mysticStorage[key] = structuredClone(value); } },
    actors: documents, scenes: new Map(), messages, users: new Map([["gm", { id: "gm", isGM: true }], ["player", { id: "player", isGM: false }]]), i18n: { localize: key => key } };
  mysticStorage.encounterEpoch = 0;
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2, 10) } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), async create(data) { messages.push(data); return data; } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; this.total = 8; } async evaluate() { return this; } async toMessage() {} };
  globalThis.Hooks = { on() {}, once() {}, off() {} };
  globalThis.CONFIG = { DND5E: { activityTypes: {} }, statusEffects: [] };
  registerCasterFeatureHooks();
  return { documents, messages };
}
function mysticCaster({ level = 1, ap = 20, charge = 0, branch = "mystic" } = {}) {
  const actor = actorDoc("Actor.caster");
  Object.assign(actor, { type: "character", name: "Caster" });
  actor.flags.ak5e = { casting: { enabled: true, ability: "int", recovery: "long" }, artsPoints: { maximum: 35, value: ap, maximumArtLevel: 9 },
    caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [], rulings: {}, uses: {}, turn: {}, drones: [] },
    resourcePools: { mysticCharge: { value: charge } } };
  actor.system.abilities = { int: { value: 16, mod: 3 }, dex: { value: 10, mod: 0 } };
  actor.system.attributes = { ...actor.system.attributes, prof: 2, spell: { dc: 13 }, hp: { value: 30, max: 30, temp: 0 } };
  actor.system.currency = { cp: 0 };
  actor.getActiveTokens = () => []; actor.getRollData = () => ({});
  const add = (id, type, flags, system = {}) => actor.items.set(id, { id, type, name: id, system, flags: { ak5e: flags }, parent: actor, uuid: `Actor.caster.Item.${id}`, getFlag: getFlagFn });
  add("class", "class", { chapterThreeId: "class-caster" }, { levels: level });
  add("branch", "subclass", { chapterThreeId: `subclass-caster-${branch}` });
  add("cantrip", "spell", { art: { enabled: true } }, { level: 0, activities: new Map([["a1", { id: "a1", activation: { type: "action" }, damage: { parts: [{ types: new Set(["cold"]) }] } }]]) });
  return actor;
}
function mysticSetup(options = {}, worldOptions = {}, targetHp) {
  const env = mysticWorld(worldOptions), actor = mysticCaster(options);
  const target = actorDoc("Actor.target", { owner: false, hp: targetHp ?? { value: 30, max: 30, temp: 0 } });
  const other = actorDoc("Actor.other", { owner: false });
  for (const doc of [actor, target, other]) env.documents.set(doc.uuid, doc);
  env.documents.set("caster", actor);
  actor.flags.ak5e.caster.casts = [
    { id: "cantripHit", itemId: "cantrip", level: 0, completed: true, status: "complete", turn: "Combat.c:1:c1", context: {} }
  ];
  return { ...env, actor, target, other };
}
const stateOf = actor => actor.flags.ak5e.caster;
const apOf = actor => actor.flags.ak5e.artsPoints.value;
const chargeOf = actor => actor.flags.ak5e.resourcePools.mysticCharge.value;
const potent = (actor, data, id) => casterCommand(actor, "potent", { castId: "cantripHit", targetUuid: "Actor.target", outcome: "miss",
  amount: 10, type: "cold", reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true, ...data }, id);

/* ================================================= Core: AP accounting and retries ================================================= */

test("ATK-C1 concurrent Power from Within uses spend the feature once and regain AP once", async () => {
  const { actor } = coreWorld({ level: 5, ap: 10 });
  const settled = await Promise.allSettled([
    core.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pw-c1a"),
    core.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pw-c1b")
  ]);
  const fulfilled = settled.filter(entry => entry.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "exactly one parallel use may succeed (once per Long Rest, serialized)");
  assert.equal(actor.flags.ak5e.artsPoints.value, 13, "ceil(5/2) = 3 regained exactly once (C3:404), no double-add from the race");
  const rejected = settled.find(entry => entry.status === "rejected");
  assert.match(String(rejected.reason?.message), /Long Rest/, "the loser is refused by the once-per-Long-Rest gate (C3:406)");
});

test("ATK-C2 same operation ID replays without re-regaining; the ID cannot cross features", async () => {
  const { actor } = coreWorld({ level: 5, ap: 10 });
  const first = await core.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pw-c2");
  assert.equal(actor.flags.ak5e.artsPoints.value, 13);
  const retry = await core.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pw-c2");
  assert.deepEqual(retry, first, "a retry replays the recorded result");
  assert.equal(actor.flags.ak5e.artsPoints.value, 13, "replay never adds the recovery twice");
  await assert.rejects(core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Corrode" }, "pw-c2"),
    /cannot be reused for a different feature/, "an operation ID cannot be reused across Core features");
  assert.equal(actor.flags.ak5e.caster.uses?.rabbit, undefined, "the refused cross-feature use spent nothing");
});

test("ATK-C3 Rabbit grant lifecycle: use, undo deletes the created Item and re-arms, re-use works", async () => {
  const { actor } = coreWorld();
  const baseline = actor.items.size;
  const first = await core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Corrode" }, "rb-c3a");
  assert.ok(actor.items.get(first.itemId), "the borrowed Art Item exists");
  assert.equal(actor.flags.ak5e.caster.borrowed?.itemId, first.itemId);
  const undone = await core.undoCoreUse(actor, "rb-c3a");
  assert.equal(undone.command, "rabbit");
  assert.equal(actor.items.get(first.itemId), undefined, "undo deletes the Item the use created");
  assert.deepEqual(actor.deletes, [first.itemId], "exactly one embedded delete");
  assert.equal(actor.flags.ak5e.caster.borrowed ?? null, null, "the borrowed slot is restored");
  assert.equal(actor.flags.ak5e.caster.uses?.rabbit, false, "the once-per-Long-Rest use is re-armed by undo");
  assert.equal(actor.items.size, baseline, "no grant residue remains");
  const second = await core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Ice Barrier" }, "rb-c3b");
  assert.ok(actor.items.get(second.itemId), "a fresh operation ID borrows again after undo");
});

test("ATK-C4 double undo of a Core use is refused and deletes nothing further", async () => {
  const { actor } = coreWorld();
  const first = await core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Corrode" }, "rb-c4");
  await core.undoCoreUse(actor, "rb-c4");
  const deletes = actor.deletes.length;
  await assert.rejects(core.undoCoreUse(actor, "rb-c4"), /already undone/, "a second undo is refused (WORKFLOW §3.2 receipts are one-shot)");
  assert.equal(actor.deletes.length, deletes, "the refused double-undo wrote nothing");
  assert.equal(actor.items.get(first.itemId), undefined, "the item stays deleted, not restored");
});

test("ATK-C5 undoing a Rabbit after its Long Rest expiry refuses reconciliation instead of deleting the expired grant", async () => {
  const { actor } = coreWorld();
  const first = await core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Corrode" }, "rb-c5");
  await core.coreRest(actor, "long");
  assert.equal(actor.flags.ak5e.caster.borrowed ?? null, null, "the Long Rest cleared the borrowed slot (C3:398)");
  await assert.rejects(core.undoCoreUse(actor, "rb-c5"), /changed since this use|reconcile/i,
    "the receipt no longer matches the state; undo must refuse rather than resurrect or delete (DECISIONS: Rabbit expiry without deleting independent grants)");
  assert.ok(actor.items.get(first.itemId), "the expired grant Item is left for GM review");
  assert.deepEqual(actor.deletes, [], "nothing was deleted behind the rest");
});

test("ATK-C6 a prevented state write rolls back the created Item and leaves the use unspent", async () => {
  const { actor } = coreWorld();
  actor.failNextUpdate = true;
  await assert.rejects(core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Corrode" }, "rb-c6"), /prevented/);
  assert.equal(actor.flags.ak5e.caster.uses?.rabbit, undefined, "the failed use spent nothing (flags were never written)");
  assert.equal(actor.items.size, 2, "the rollback deleted the created Item (class + branch only)");
  const ok = await core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Corrode" }, "rb-c6");
  assert.ok(actor.items.get(ok.itemId), "a retry with the same operation ID completes after the write is repaired");
});

/* ================================================= Core: Savant rerolls against actual rolls ================================================= */

test("ATK-C7 reroll policy 'once' rolls each die exactly once and persists the replacement", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-art", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-cast" });
  rule(actor, "signatureRerollOnce", true);
  const die = makeDie(8, 2, [2]);
  const result = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-cast", indices: [0], roll: { dice: [die] } }, "rd-c7");
  assert.equal(die.rolls, 1, "the once-per-die policy rolls exactly one time even when the new result is still low (C3:438 recorded policy)");
  assert.equal(result.replacements[0].value, 2, "the recorded replacement is returned");
  assert.deepEqual(actor.flags.ak5e.caster.signatureRerolls["sig-cast"].replacements, { 0: 2 });
  const replay = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-cast", indices: [0], roll: { dice: [die] } }, "rd-c7");
  assert.equal(die.rolls, 1, "the same operation ID replays and never rolls again");
  assert.equal(replay.replacements[0].value, 2);
  const fresh = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-cast", indices: [0], roll: { dice: [die] } }, "rd-c7b");
  assert.equal(die.rolls, 1, "a new operation ID reuses the recorded replacement instead of rolling a second die");
  assert.equal(fresh.replacements[0].value, 2);
});

test("ATK-C8 reroll policy 'no limit' re-rolls until the die exceeds 3; d3 dice are refused", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig2", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig2-cast" });
  rule(actor, "signatureRerollOnce", false);
  const die = makeDie(8, 2, [2, 3, 6]);
  const result = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig2-cast", indices: [0], roll: { dice: [die] } }, "rd-c8");
  assert.equal(die.rolls, 3, "2 -> 3 -> 6: rerolled until the result is above 3 (C3:438 'any result of 3 or less')");
  assert.equal(result.replacements[0].value, 6, "the final usable result is recorded");
  const tiny = makeDie(3, 2, [1, 1, 1]);
  await assert.rejects(core.rerollSignatureDice(actor, { confirmed: true, castId: "sig2-cast", indices: [0], roll: { dice: [tiny] } }, "rd-c8b"),
    /three or fewer faces|manually/, "the unlimited policy must refuse a d3 die it can never terminate on instead of inventing an outcome");
  assert.equal(tiny.rolls, 0, "the refusal happens before any reroll");
});

test("ATK-C9 rerolls reject dice that lie about the actual damage roll", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig3", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig3-cast" });
  rule(actor, "signatureRerollOnce", true);
  const die = makeDie(8, 5, [7]);
  await assert.rejects(core.rerollSignatureDice(actor, { confirmed: true, castId: "sig3-cast", indices: [0], results: [2], roll: { dice: [die] } }, "rd-c9a"),
    /3 or less/, "a claimed 2 cannot mask a die showing 5 (only original dice showing 3 or less reroll, C3:438)");
  const honest = makeDie(8, 2, [6]);
  await assert.rejects(core.rerollSignatureDice(actor, { confirmed: true, castId: "sig3-cast", indices: [0], results: [1], roll: { dice: [honest] } }, "rd-c9b"),
    /do not match/, "entered results must equal the actual damage roll");
  assert.equal(honest.rolls, 0, "the mismatch refused before rolling");
  const forgedFaces = makeDie(8, 2, [6]);
  await assert.rejects(core.rerollSignatureDice(actor, { confirmed: true, castId: "sig3-cast", indices: [0], faces: 20, roll: { dice: [forgedFaces] } }, "rd-c9c"),
    /faces come from the damage roll/, "typed-in faces never override the card's die");
  assert.equal(forgedFaces.rolls, 0, "no die was rolled under the forged faces");
});

/* ================================================= Core: empower, locks, foreign receipts, malformed input ================================================= */

test("ATK-C10 Empowered arming chain: undo unwinds to the previous arm; a consumed use refuses undo", async () => {
  const { actor } = coreWorld({ level: 10 });
  const artA = makeArt(actor, { id: "castA", level: 1 }), artB = makeArt(actor, { id: "castB", level: 1 });
  completedCast(actor, artA, { id: "e10-a" }); completedCast(actor, artB, { id: "e10-b" });
  const staleCast = completedCast(actor, artA, { id: "e10-stale" }); staleCast.turn = "Combat.other:1:x";
  await assert.rejects(core.armEmpoweredArts(actor, { confirmed: true, castId: "e10-stale" }, "e10-stale-arm"), /current Turn/,
    "arming only accepts a cast made this Turn (C3:410)");
  await core.armEmpoweredArts(actor, { confirmed: true, castId: "e10-a" }, "e10-1");
  await core.armEmpoweredArts(actor, { confirmed: true, castId: "e10-b" }, "e10-2");
  assert.equal(actor.flags.ak5e.caster.empowerCastId, "e10-b");
  await core.undoCoreUse(actor, "e10-2");
  assert.equal(actor.flags.ak5e.caster.empowerCastId, "e10-a", "undo of the second arm restores the first exactly");
  actor.flags.ak5e.caster.uses.empowered = casterTurn(actor); // the damage roll consumed the use (map row)
  await assert.rejects(core.undoCoreUse(actor, "e10-1"), /consumed|reconcile/i,
    "a consumed Empowered use cannot be silently re-armed (WORKFLOW §3.2 reconcile instead)");
  delete actor.flags.ak5e.caster.uses.empowered;
  await core.undoCoreUse(actor, "e10-1");
  assert.equal(actor.flags.ak5e.caster.empowerCastId ?? null, null, "undoing the first arm clears the slot");
});

test("ATK-C11 a Core receipt from a closed encounter window is player-locked but GM-undoable", async () => {
  const { actor, advanceEpoch } = coreWorld({ level: 5, ap: 10 });
  await core.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pw-c11");
  advanceEpoch(); // the elected GM advanced the window
  await assert.rejects(core.undoCoreUse(actor, "pw-c11"), /locked/, "players may not undo outside the encounter window (WORKFLOW §3.2)");
  assert.equal(actor.flags.ak5e.artsPoints.value, 13, "the refused undo changed nothing");
  globalThis.game.user.isGM = true;
  const undone = await core.undoCoreUse(actor, "pw-c11");
  assert.equal(undone.command, "powerWithin", "the GM may still undo the locked receipt");
  assert.equal(actor.flags.ak5e.artsPoints.value, 10, "the exact pre-use AP is restored");
  assert.equal(actor.flags.ak5e.caster.uses.powerWithin, false, "the feature is re-armed by the GM undo");
});

test("ATK-C12 foreign and forged undo receipts are refused", async () => {
  const { actor } = coreWorld();
  await assert.rejects(core.undoCoreUse(actor, "no-such-use"), /no longer recorded/);
  // A Mystic-engine-shaped receipt forged into a Core actor's shared ledger must not be undone by the Core layer.
  actor.flags.ak5e.caster.undo = [{ id: "forge-potent", command: "potent", title: "Potent Cantrip", epoch: 0, createdAt: Date.now(), status: "complete", targets: [] }];
  await assert.rejects(core.undoCoreUse(actor, "forge-potent"), /cannot be undone here/,
    "the Core undo refuses receipts it does not own instead of guessing a revert (no target/state writes)");
  assert.equal(actor.flags.ak5e.caster.undo[0].status, "complete", "the forged receipt was left untouched");
});

test("ATK-C13 malformed Core inputs fail closed with zero writes; undo routes through casterCommand", async () => {
  const { actor } = coreWorld({ level: 5, ap: 10 });
  const writes = actor.writes.length;
  await assert.rejects(core.useRabbitFromHat(actor, ["not", "an", "object"], "rb-c13"), /must be an object/);
  await assert.rejects(core.powerFromWithin(actor, { confirmed: true, restCompleted: true }, "pw bad id"), /stable operation ID/,
    "operation IDs may not carry spaces or regex-unsafe characters");
  await assert.rejects(core.selectSignatureArt(actor, { confirmed: true, itemId: "x".repeat(81), damaging: true, restCompleted: true }, "sig-c13"), /non-empty name/);
  await assert.rejects(core.useRabbitFromHat(actor, { confirmed: true, poolArtName: "Not A Printed Art" }, "rb-c13b"), /printed in a Standard Arts Pool/);
  await assert.rejects(core.useRabbitFromHat(actor, { poolArtName: "Corrode" }, "rb-c13c"), /Confirm/, "confirmation before use (WORKFLOW §3.2)");
  assert.equal(actor.writes.length, writes, "every malformed input wrote nothing");
  // Integration: casterCommand routes Core receipts to the Core undo.
  await casterCommand(actor, "powerWithin", { confirmed: true, restCompleted: true }, "pw-c13d");
  assert.equal(actor.flags.ak5e.artsPoints.value, 13);
  const undone = await casterCommand(actor, "undoUse", { useId: "pw-c13d" }, "u-c13");
  assert.equal(undone.command, "powerWithin");
  assert.equal(actor.flags.ak5e.artsPoints.value, 10, "the routed undo restored AP exactly");
});

/* ================================================= cross-branch interference ================================================= */

test("ATK-X1 Core commands on a Mystic Caster and Mystic commands on a Core Caster both refuse without writes", async () => {
  const mystic = coreWorld({ level: 15, branch: "mystic" });
  const writes = mystic.actor.writes.length;
  await assert.rejects(core.powerFromWithin(mystic.actor, { confirmed: true, restCompleted: true }, "x-m1"), /Core Caster/);
  await assert.rejects(core.useRabbitFromHat(mystic.actor, { confirmed: true, poolArtName: "Corrode" }, "x-m2"), /Core Caster/);
  await assert.rejects(core.undoCoreUse(mystic.actor, "x-m1"), /Core Caster/);
  assert.equal(mystic.actor.writes.length, writes, "cross-branch Core attempts wrote nothing");

  const { actor } = mysticSetup({ level: 1, branch: "core" }, { gm: true });
  const before = actor.writes.length;
  await assert.rejects(potent(actor, {}, "x-p1"), /mystic level 3/, "Potent Cantrip is Mystic-only (C3:692-694)");
  await assert.rejects(casterCommand(actor, "beginRitual", { confirmed: true }, "x-r1"), /mystic level 1/, "the charging ritual is Mystic-only (C3:685)");
  assert.equal(actor.writes.length, before, "cross-branch Mystic attempts wrote nothing");
});

/* ================================================= Mystic: ritual AP/charge accounting ================================================= */

test("ATK-M1 malformed ritual command data fails closed", async () => {
  const { actor } = mysticSetup({ level: 3, ap: 10 }, { gm: true });
  await assert.rejects(casterCommand(actor, "beginRitual", null, "m1-null"), /./, "null options must be refused, not crash into a write");
  assert.equal(stateOf(actor).ritual ?? null, null, "nothing was recorded");
  assert.equal(actor.writes.length, 0, "malformed beginRitual wrote nothing");
});

test("ATK-M2 ritual timing and AP bounds: 59s refused, 60s exact accepted, malformed ap refused, no partial spends", async () => {
  const { actor } = mysticSetup({ level: 3, ap: 2, charge: 0 }, { gm: true });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "m2-b");
  game.time.worldTime = 59;
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m2-t59"),
    /Advance World time/, "the printed minute has not passed at 59s (C3:685)");
  const badId = "a".repeat(61);
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, badId),
    /stable operation ID/, "the engine accepts operation IDs up to 60 characters only");
  game.time.worldTime = 60; // the printed minute exactly elapsed (C3:685)
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 2.5, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m2-half"),
    /Ritual AP must be an integer/, "fractional AP is never accepted");
  await assert.rejects(casterCommand(actor, "finishRitual", { ap: 3, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m2-poor"),
    /Not enough AP/, "spending beyond the pool is refused (C3:685)");
  assert.ok(stateOf(actor).ritual, "the pending ritual survived the refusals");
  assert.equal(apOf(actor), 2, "refused finishes spent nothing");
  actor.flags.ak5e.artsPoints.value = 10;
  const done = await casterCommand(actor, "finishRitual", { ap: 3, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m2-ok");
  assert.equal(done.charge, 2, "3 AP at cap 2 clamps the gain to the maximum (C3:685)");
  assert.equal(apOf(actor), 7, "the full 3 AP were expended even though the charge clamped");
  assert.equal(chargeOf(actor), 2);
});

test("ATK-M3 ritual undo restores AP, charge and the pre-ritual slot exactly; a double undo cannot re-refund", async () => {
  const { actor } = mysticSetup({ level: 3, ap: 10, charge: 0 }, { gm: true });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "m3-b");
  game.time.worldTime = 61;
  await casterCommand(actor, "finishRitual", { ap: 2, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m3-f");
  assert.equal(apOf(actor), 8);
  const undo = await casterCommand(actor, "undoUse", { useId: "m3-f" }, "m3-u1");
  assert.equal(undo.undone, "m3-f");
  assert.equal(apOf(actor), 10, "both expended Arts Points come back exactly");
  assert.equal(chargeOf(actor), 0, "the gained charges are removed");
  const again = await casterCommand(actor, "undoUse", { useId: "m3-f" }, "m3-u2");
  assert.equal(again.already, true, "the second undo reports already-undone");
  assert.equal(apOf(actor), 10, "a double undo never refunds twice (pool accounting)");
});

test("ATK-M4 ritual undo refuses when AP or Charge moved after the use", async () => {
  const { actor } = mysticSetup({ level: 3, ap: 10, charge: 0 }, { gm: true });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "m4-b");
  game.time.worldTime = 61;
  await casterCommand(actor, "finishRitual", { ap: 2, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m4-f");
  actor.flags.ak5e.artsPoints.value = 5; // an external AP change after the ritual
  await assert.rejects(casterCommand(actor, "undoUse", { useId: "m4-f" }, "m4-u1"), /Arts Points changed/,
    "undo restores recorded before-states, not guesses (WORKFLOW §3.2)");
  assert.equal(apOf(actor), 5, "the refused undo kept the external value");
  actor.flags.ak5e.artsPoints.value = 8;
  actor.flags.ak5e.resourcePools.mysticCharge.value = 1; // a charge spent/moved after the ritual
  await assert.rejects(casterCommand(actor, "undoUse", { useId: "m4-f" }, "m4-u2"), /Mystic Charge changed/);
  assert.equal(chargeOf(actor), 1, "the refused undo did not touch the charge pool");
});

test("ATK-M5 cancelling and undoing the cancel reopens the ritual at its recorded start", async () => {
  const { actor } = mysticSetup({ level: 3, ap: 10, charge: 0 }, { gm: true });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "m5-b");
  assert.equal(stateOf(actor).ritual?.start, 0);
  const canceled = await casterCommand(actor, "cancelRitual", { confirmed: true }, "m5-c");
  assert.equal(canceled.canceled, true);
  assert.equal(stateOf(actor).ritual, null);
  assert.equal(apOf(actor), 10, "cancel spends nothing (C3:685)");
  await casterCommand(actor, "undoUse", { useId: "m5-c" }, "m5-u");
  assert.equal(stateOf(actor).ritual?.start, 0, "undo of the cancel reopens the pending ritual from its recorded start");
  game.time.worldTime = 61;
  const done = await casterCommand(actor, "finishRitual", { ap: 1, stationary: true, concentration: true, minuteCompleted: true, confirmed: true }, "m5-f");
  assert.equal(done.charge, 1, "the reopened ritual completes against the recorded minute");
  assert.equal(apOf(actor), 9);
});

/* ================================================= Mystic: GM relay spoofing and receipts ================================================= */

test("ATK-M6 relayed apply is idempotent after completion and refused after undo", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true });
  await potent(actor, {}, "m6-p");
  assert.equal(target.system.attributes.hp.value, 25, "half of 10 (C3:694)");
  const writes = target.writes.length;
  const replay = await relayedTargetChange(actor, "apply", { useId: "m6-p", targetUuid: "Actor.target" });
  assert.equal(replay.hpLost, 5, "the relayed replay returns the recorded change");
  assert.equal(replay.tempLost, 0);
  assert.equal(target.writes.length, writes, "the relayed replay wrote nothing to the Creature");
  assert.equal(target.system.attributes.hp.value, 25, "no double damage through the relay (WORKFLOW §3.2)");
  await casterCommand(actor, "undoUse", { useId: "m6-p" }, "m6-u");
  assert.equal(target.system.attributes.hp.value, 30, "undo restores the Creature");
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "m6-p", targetUuid: "Actor.target" }),
    /not ready to apply/, "an undone receipt can never be re-applied through the GM relay");
  assert.equal(target.system.attributes.hp.value, 30, "the refused relay re-write left the Creature healed");
});

test("ATK-M7 relay spoofing: foreign targets, wrong use kinds and forged damage are refused", async () => {
  const { actor, target, other } = mysticSetup({ level: 3 }, { gm: true });
  await casterCommand(actor, "beginRitual", { confirmed: true }, "m7-b");
  await potent(actor, {}, "m7-p");
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "m7-p", targetUuid: "Actor.other" }),
    /not part of the recorded use/, "a relayed change cannot be pointed at a different Creature than the receipt records");
  assert.equal(other.writes.length, 0, "the spoofed Creature was untouched");
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "m7-b", targetUuid: "Actor.target" }),
    /not part of the recorded use/, "a ritual receipt carries no target changes to apply");
  // Forge a receipt whose kind does not belong to the command, and one with an out-of-band amount.
  const state = stateOf(actor);
  state.undo.push({ id: "m7-forged-hp", command: "potent", status: "complete", epoch: 0, targets:
    [{ uuid: "Actor.target", name: "target", kind: "hp", ready: true, damage: { amount: 5 } }] });
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "m7-forged-hp", targetUuid: "Actor.target" }),
    /does not belong to this kind of use/, "the relay re-checks the kind/command pairing (the GM client is not a blind executor)");
  state.undo.push({ id: "m7-forged-neg", command: "potent", status: "complete", epoch: 0, targets:
    [{ uuid: "Actor.target", name: "target", kind: "mysticPotentDamage", ready: true, damage: { amount: -7, type: "cold" } }] });
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "m7-forged-neg", targetUuid: "Actor.target" }),
    /not one this use can make/, "negative recorded damage is rejected by the kind validator");
  assert.equal(target.system.attributes.hp.value, 25, "every spoofed relay application left the recorded half damage only");
});

test("ATK-M8 no GM leaves the Potent use pending and untouched; retrying the same operation applies it once", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: false });
  await assert.rejects(potent(actor, {}, "m8-p"), /Not applied yet/, "without a GM client the unowned Creature is not written to (WORKFLOW §3.2)");
  assert.equal(target.system.attributes.hp.value, 30, "the Creature took no damage");
  assert.equal(target.writes.length, 0, "nothing was relayed behind a GM");
  assert.equal(stateOf(actor).undo.find(entry => entry.id === "m8-p").status, "pending", "the use is recorded and stays retryable");
  game.user.isGM = true; // the GM client is now present; the player retries the SAME operation ID
  const result = await potent(actor, {}, "m8-p");
  assert.equal(result.noAdditionalEffects, true);
  assert.equal(target.system.attributes.hp.value, 25, "the retry applied the recorded change exactly once");
  assert.equal(target.writes.length, 1, "exactly one Creature write for the whole lifecycle");
});

test("ATK-M9 Potent undo restores Temporary HP exactly and clamps healing at the maximum", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true }, { value: 25, max: 30, temp: 4 });
  await potent(actor, { amount: 10 }, "m9-p");
  assert.equal(target.system.attributes.hp.temp, 0, "temp absorbs the half damage first");
  assert.equal(target.system.attributes.hp.value, 24, "5 damage = 4 Temporary HP + 1 HP");
  await casterCommand(actor, "undoUse", { useId: "m9-p" }, "m9-u");
  assert.equal(target.system.attributes.hp.value, 25, "undo returns exactly the pre-use HP");
  assert.equal(target.system.attributes.hp.temp, 4, "and the absorbed Temporary HP");
  // Over-heal clamp: heal the Creature to full after the use, then undo.
  await potent(actor, { amount: 10 }, "m9-p2");
  await target.update({ "system.attributes.hp.value": 30 });
  await casterCommand(actor, "undoUse", { useId: "m9-p2" }, "m9-u2");
  assert.equal(target.system.attributes.hp.value, 30, "the undo add-back clamps at the maximum; it cannot heal above it");
});

test("ATK-M10a Potent Cantrip against an immune Creature must deal zero Damage (candidate defect probe)", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true });
  await potent(actor, { amount: 11, immunity: true }, "m10-i");
  assert.equal(target.system.attributes.hp.value, 30,
    "an Immune Creature takes no Damage from the Cantrip: POTENT_KIND.apply must zero the halved amount like every other damage path does (caster-features.mjs:246 `data.immunity ? 0 : amount`, caster-primal-splash.mjs:339); resolveDamage has no immunity parameter, so passing damage.immunity through silently ignores it (C3:694 + the pipeline contract in the module header)");
  const undo = await casterCommand(actor, "undoUse", { useId: "m10-i" }, "m10-u");
  assert.equal(undo.undone, "m10-i");
  assert.equal(target.system.attributes.hp.value, 30, "undo of an immune use is safe");
});

test("ATK-M10b floor(11/2) = 5 without immunity; locked receipts are player-blocked and GM-allowed", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true });
  await potent(actor, { amount: 11 }, "m10-h");
  assert.equal(target.system.attributes.hp.value, 25, "floor(11/2) = 5 damage without immunity (C3:694)");
  game.user.isGM = false; // back to the player's client
  mysticStorage.encounterEpoch = 1; // the window closed
  await assert.rejects(casterCommand(actor, "undoUse", { useId: "m10-h" }, "m10-lock"), /locked/,
    "players cannot undo a Mystic write from a closed encounter window (WORKFLOW §3.2)");
  assert.equal(target.system.attributes.hp.value, 25, "the locked undo changed nothing");
  game.user.isGM = true;
  await casterCommand(actor, "undoUse", { useId: "m10-h" }, "m10-gm");
  assert.equal(target.system.attributes.hp.value, 30, "the GM may still undo it");
});

test("ATK-M11 registerMystic and Mystic reads survive non-Mystic actors without breaking pool accounting", () => {
  const { actor } = mysticSetup({ level: 10, charge: 5 }, { gm: true });
  assert.deepEqual(mysticCharge(actor), { value: 3, max: 3 }, "level 10 Turbocharger cap 3, stored 5 clamps to 3 (C3:687,704)");
  const core = mysticCaster({ level: 10, branch: "core" });
  core.flags.ak5e.resourcePools = { mysticCharge: { value: 2 } };
  assert.equal(mysticCharge(core).value, 2, "the raw read clamps but a Core actor never plays it");
  const env = mysticSetup({ level: 10, branch: "core" }, { gm: true });
  assert.equal(env.actor.flags.ak5e.caster.undo, undefined, "a Core actor carries no Mystic receipts");
  assert.throws(() => mysticCharge({ documentName: "Actor", getFlag() { return undefined; }, items: new Map(), isOwner: true }),
    /Caster level/, "an actor with no Caster class fails the level read instead of inventing a cap");
});

/* ================== Fix round 2 pins (review: forged positive relay, multi-die reroll index) ================== */

test("ATK-R2-M12 a forged positive Potent relay amount is refused against the recorded Cantrip roll", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true });
  await potent(actor, { amount: 10 }, "r2-p");
  assert.equal(target.system.attributes.hp.value, 25, "the genuine use applies the recorded half (5 of 10)");
  const receipt = stateOf(actor).undo.find(entry => entry.id === "r2-p");
  assert.deepEqual(receipt.mysticPotent && { rolled: receipt.mysticPotent.rolled, half: receipt.mysticPotent.half, target: receipt.mysticPotent.targetUuid },
    { rolled: 10, half: 5, target: "Actor.target" }, "the receipt records the reviewed roll, its exact half and the target");
  // The receipt lives in a flag its owner can write: forge a larger positive amount on the recorded target entry.
  receipt.targets[0].damage.amount = 9;
  const writes = target.writes.length, hp = target.system.attributes.hp.value;
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "r2-p", targetUuid: "Actor.target" }),
    /recorded half|not one this Potent use can make/, "a positive out-of-band amount is not the recorded half (C3:694)");
  assert.equal(target.system.attributes.hp.value, hp, "the forged relay applied no unreviewed damage");
  assert.equal(target.writes.length, writes, "the forged positive relay wrote nothing to the Creature");
  receipt.targets[0].damage.amount = 5;
  const replay = await relayedTargetChange(actor, "apply", { useId: "r2-p", targetUuid: "Actor.target" });
  assert.equal(replay.hpLost, 5, "the genuine recorded half still applies through the relay");
  // A wholly forged receipt with a positive amount and no recorded roll cannot authorize damage either.
  stateOf(actor).undo.push({ id: "r2-forged-pos", command: "potent", status: "complete", epoch: 0,
    targets: [{ uuid: "Actor.target", name: "target", kind: "mysticPotentDamage", ready: true,
      damage: { amount: 9, type: "cold", reduction: 0, resistance: false, vulnerability: false, immunity: false } }] });
  const after = target.system.attributes.hp.value, afterWrites = target.writes.length;
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "r2-forged-pos", targetUuid: "Actor.target" }),
    /not one this use can make/, "a receipt without the recorded Cantrip roll cannot carry Damage");
  assert.equal(target.system.attributes.hp.value, after, "the forged receipt wrote no Hit Points");
  assert.equal(target.writes.length, afterWrites, "the forged receipt wrote nothing");
});

/** A Die term with several active results, as Foundry represents 2d6 (one term, two results). */
function multiDie(results, script = []) {
  return { faces: 6, results: results.map(result => ({ result, active: true })), rolls: 0, script,
    async roll({ reroll } = {}) {
      assert.equal(reroll, true, "the test die only supports reroll mode");
      this.rolls += 1;
      const value = this.script.length ? this.script.shift() : 4;
      const result = { result: value, active: true };
      this.results.push(result);
      return result;
    } };
}

test("ATK-R2-C14 a multi-result Die rerolls the selected result, not the first active one", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-multi", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-multi-cast" });
  rule(actor, "signatureRerollOnce", true);
  const term = multiDie([6, 2], [5]);
  await assert.rejects(core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-multi-cast", indices: [0], roll: { dice: [term] } }, "rd-r2-high"),
    /3 or less/, "position 0 is the 6, so it cannot reroll (C3:438)");
  assert.equal(term.rolls, 0, "the refused high die rolled nothing");
  const result = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-multi-cast", indices: [1], roll: { dice: [term] } }, "rd-r2");
  assert.equal(term.rolls, 1, "exactly one reroll of the selected die");
  assert.equal(term.results[0].result, 6, "the 6 keeps its result");
  assert.equal(term.results[0].active, true, "the 6 is never deactivated for a 2 that qualifies");
  assert.equal(term.results[1].active, false, "the selected 2 is the result that is rerolled");
  assert.equal(result.replacements[0].value, 5, "the replacement is the rerolled selected die");
  assert.equal(result.replacements[0].index, 1, "the recorded replacement keeps its flattened position");
  assert.deepEqual(actor.flags.ak5e.caster.signatureRerolls["sig-multi-cast"].replacements, { 1: 5 });
});

test("ATK-R2-C15 flattened die positions match the entered results for a multi-result Die", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-multi2", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-multi-honest" });
  completedCast(actor, art, { id: "sig-multi-lie" });
  rule(actor, "signatureRerollOnce", true);
  const honest = multiDie([6, 2], [4]);
  const applied = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-multi-honest", indices: [1], results: [6, 2], faces: 6, roll: { dice: [honest] } }, "rd-r2-honest");
  assert.equal(applied.replacements[0].value, 4, "the entered [6, 2] matches the term's two flattened results");
  const lying = multiDie([6, 2], [4]);
  await assert.rejects(core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-multi-lie", indices: [1], results: [3, 2], faces: 6, roll: { dice: [lying] } }, "rd-r2-lie"),
    /do not match/, "a claimed 3 on the 6 cannot mask the card's first die");
  assert.equal(lying.rolls, 0, "the mismatched roll refused before any die was rolled");
});
