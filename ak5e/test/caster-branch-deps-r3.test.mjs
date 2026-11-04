/**
 * WP caster-branch-deps — fix-round-3 pins (reviewer: Luna, 3 must-fix findings).
 * Black-box: only exported/public surfaces are called; candidate bodies are untrusted.
 * Harnesses copy the frozen-audit conventions (core) and the branch-deps attack file (mystic).
 * Nothing here contradicts the frozen audits or the 29 attack tests; all 87 stay GREEN.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { casterCommand, registerCasterFeatureHooks } from "../scripts/caster-features.mjs";
import { casterTurn } from "../scripts/caster-casting.mjs";
import * as core from "../scripts/caster-core.mjs";
import { relayedTargetChange } from "../scripts/caster-primal-splash.mjs";
import { coreDamageDice, coreDialogContent } from "../scripts/caster-core-ui.mjs";

/* ============================== shared helpers ============================== */
const setPath = (object, path, value) => {
  const parts = path.split("."), last = parts.pop(); let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
};

/* ============================== Core harness (attack-file conventions) ============================== */
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
  globalThis.foundry = { utils: { randomID: () => "r3-pin" } };
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
  return { actor, get rollCount() { return rollCount; } };
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
const rule = (actor, key, value) => { actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed printed ruling for R3 pins." }; };
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

/* ============================== Mystic harness (attack-file conventions) ============================== */
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
const potent = (actor, data, id) => casterCommand(actor, "potent", { castId: "cantripHit", targetUuid: "Actor.target", outcome: "miss",
  amount: 10, type: "cold", reduction: 0, resistance: false, vulnerability: false, immunity: false, confirmed: true, ...data }, id);

/* ================== R3 finding 1: consistent whole-forgery refused by the GM stamp ================== */

test("R3-M1 a receipt rewritten consistently across every owner-writable copy still refuses against the GM-stamped authorization", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true });
  await potent(actor, { amount: 10 }, "r3-m1");
  assert.equal(target.system.attributes.hp.value, 25, "the genuine use applies the recorded half (5 of 10)");
  // The attacker rewrites EVERY owner-writable copy consistently: the relayed entry, the recorded review,
  // the engine's input snapshot, and the cast's review marker. Only the Creature-side GM stamp still says 5 of 10.
  const receipt = stateOf(actor).undo.find(entry => entry.id === "r3-m1");
  receipt.targets[0].damage.amount = 9;
  receipt.mysticPotent.rolled = 18; receipt.mysticPotent.half = 9;
  receipt.data.amount = 18;
  // The plan anchors its review on the cast record (absent before the fix; then there is nothing to forge here
  // and the receipt-only forgery below already passes on its own).
  const mark = actor.flags.ak5e.caster.casts.find(cast => cast.id === "cantripHit").potentUses
    ?.find(marker => marker.useId === "r3-m1");
  if (mark) { mark.rolled = 18; mark.half = 9; }
  const writes = target.writes.length, hp = target.system.attributes.hp.value;
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "r3-m1", targetUuid: "Actor.target" }),
    /GM-applied authorization/, "a consistent whole-forgery cannot move the GM-stamped authorization (C3:694 records half, never more)");
  assert.equal(target.system.attributes.hp.value, hp, "the forged relay applied no unreviewed damage");
  assert.equal(target.writes.length, writes, "the forged relay wrote nothing to the Creature");
});

test("R3-M1b a hand-forged receipt reusing a genuine cast authorizes nothing without the plan's review marker", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: true });
  stateOf(actor).undo ??= [];
  stateOf(actor).undo.push({ id: "r3-nomark", command: "potent", status: "complete", epoch: 0,
    data: { castId: "cantripHit", targetUuid: "Actor.target", outcome: "miss", amount: 10 },
    mysticPotent: { castId: "cantripHit", castLevel: 0, itemId: "cantrip", targetUuid: "Actor.target",
      rolled: 10, half: 5, type: "cold", defence: { reduction: 0, resistance: false, vulnerability: false, immunity: false } },
    targets: [{ uuid: "Actor.target", name: "target", kind: "mysticPotentDamage", ready: true,
      damage: { amount: 5, type: "cold", reduction: 0, resistance: false, vulnerability: false, immunity: false } }] });
  const writes = target.writes.length;
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: "r3-nomark", targetUuid: "Actor.target" }),
    /not one this Potent use can make/, "a receipt the plan never wrote carries no review marker on the cast");
  assert.equal(target.system.attributes.hp.value, 30, "the forged receipt wrote no Hit Points");
  assert.equal(target.writes.length, writes, "the forged receipt wrote nothing");
});

/* ================== R3 finding 2: UI and core present the same flattened result positions ================== */

test("R3-C2 the dialog lists the same per-result positions the core rerolls, including a 2d6 [6, 2]", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-ui", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-ui-cast" });
  rule(actor, "signatureRerollOnce", true);
  // One Die term with two results, as Foundry represents 2d6: the UI must show TWO positions, not one per-term row.
  const term = multiDie([6, 2], [5]);
  const dice = coreDamageDice({ roll: { dice: [term] } });
  assert.deepEqual(dice, [{ index: 0, faces: 6, result: 6 }, { index: 1, faces: 6, result: 2 }],
    "per-result positions in card order, matching the core's flattened dice");
  const html = coreDialogContent("signatureDice", { casts: [{ id: "sig-ui-cast", artName: "Reviewed Art" }], roll: { dice: [term] } });
  assert.match(html, /Position 0.*=.*6/s, "position 0 shows the 6");
  assert.match(html, /Position 1.*=.*2/s, "position 1 shows the 2 that may reroll");
  // The positions the dialog shows are the positions the core accepts: rerolling UI position 1 hits the 2.
  const positions = dice.filter(die => Number.isInteger(die.result) && die.result <= 3).map(die => die.index);
  assert.deepEqual(positions, [1]);
  const result = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-ui-cast", indices: positions, roll: { dice: [term] } }, "rd-r3-ui");
  assert.equal(result.replacements[0].value, 5, "the UI-selected position rerolls through the core");
  assert.equal(term.results[1].active, false, "the selected 2 — not the first active result — is the one rerolled");
  assert.equal(term.results[0].active, true, "the 6 is untouched");
});

/* ================== R3 finding 3: sequential rerolls keep stable per-die identities ================== */

test("R3-C3 a sequential reroll on the same cast rolls a new die instead of reading another die's replacement", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-seq", level: 3 });
  actor.flags.ak5e.caster.signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-seq-cast" });
  rule(actor, "signatureRerollOnce", true);
  // 2d6 showing [2, 3]: two rerollable dice in one term.
  const term = multiDie([2, 3], [6, 4]);
  const first = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-seq-cast", indices: [0], roll: { dice: [term] } }, "rd-r3a");
  assert.equal(term.rolls, 1, "the first reroll rolls once");
  assert.equal(first.replacements[0].value, 6, "the 2 becomes a 6");
  // The reroll deactivated the 2 and appended the 6: flattened position 0 now names the 3, whose die was never rerolled.
  const second = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-seq-cast", indices: [0], roll: { dice: [term] } }, "rd-r3b");
  assert.equal(term.rolls, 2, "the new die at position 0 has no recorded replacement, so it is rolled (a transient-index cache would have reused the 6 without rolling)");
  assert.equal(second.replacements[0].value, 4, "the 3 becomes a 4, not the other die's recorded 6");
  assert.deepEqual(actor.flags.ak5e.caster.signatureRerolls["sig-seq-cast"].replacements, { 0: 6, 1: 4 },
    "each die keeps its own stable replacement across the deactivation");
});
