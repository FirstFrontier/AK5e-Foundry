/** T3 caster-branch-deps: eight new regression pins for creation authority, durable dice and the sheet path. */
import test from "node:test";
import assert from "node:assert/strict";
import { casterCommand, registerCasterFeatureHooks } from "/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-features.mjs";
import { casterTurn } from "/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-casting.mjs";
import * as core from "/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-core.mjs";
import { relayedTargetChange } from "/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-primal-splash.mjs";

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

for (const consistentMarker of [false, true]) {
  test("T3-M1 first relay refuses whole-pending tamper, marker consistent=" + consistentMarker, async () => {
    const { actor, target } = mysticSetup({ level: 3 }, { gm: false });
    await assert.rejects(potent(actor, { amount: 10 }, "t3-pending"), /Not applied yet/);
    const receipt = stateOf(actor).undo.find(entry => entry.id === "t3-pending");
    receipt.targets[0].damage.amount = 9;
    receipt.mysticPotent.rolled = 18; receipt.mysticPotent.half = 9;
    receipt.data.amount = 18;
    if (consistentMarker) Object.assign(stateOf(actor).casts[0].potentUses[0], { rolled: 18, half: 9 });
    game.user.isGM = true;
    const actorWrites = actor.writes.length;
    await assert.rejects(relayedTargetChange(actor, "apply", { useId: receipt.id, targetUuid: target.uuid }), /not one this Potent use can make/);
    assert.equal(target.system.attributes.hp.value, 30);
    assert.equal(target.writes.length, 0);
    assert.equal(actor.writes.length, actorWrites, "refusal is zero-write on both documents");
  });
}

test("T3-M2 a forged pending with a consistent cast marker still has no creation authorization", async () => {
  const { actor, target } = mysticSetup({ level: 3 }, { gm: false });
  await assert.rejects(potent(actor, { amount: 10 }, "t3-original"), /Not applied yet/);
  const forged = structuredClone(stateOf(actor).undo[0]);
  forged.id = "t3-forged";
  stateOf(actor).undo.push(forged);
  const marker = structuredClone(stateOf(actor).casts[0].potentUses[0]);
  marker.useId = forged.id;
  stateOf(actor).casts[0].potentUses.push(marker);
  game.user.isGM = true;
  await assert.rejects(relayedTargetChange(actor, "apply", { useId: forged.id, targetUuid: target.uuid }), /creation-time authorization/);
  assert.equal(target.writes.length, 0);
});

test("T3-C1 JSON-rehydrated sequential dice keep distinct replacement identities", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-json", level: 3 });
  stateOf(actor).signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-json-cast" });
  rule(actor, "signatureRerollOnce", true);
  const term = multiDie([2, 3], [6]);
  await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-json-cast", indices: [0], roll: { dice: [term] } }, "t3-json-a");
  const restored = multiDie([], [4]);
  restored.results = JSON.parse(JSON.stringify(term.results));
  const result = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-json-cast", indices: [0], roll: { dice: [restored] } }, "t3-json-b");
  assert.equal(restored.rolls, 1, "rehydration cannot reuse the other die's replacement");
  assert.equal(result.replacements[0].value, 4);
});

test("T3-C2 a different rehydrated DamageRoll on the same cast cannot collide with the first roll", async () => {
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-new", level: 3 });
  stateOf(actor).signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-new-cast" });
  rule(actor, "signatureRerollOnce", true);
  const first = multiDie([2], [6]);
  await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-new-cast", indices: [0], roll: { dice: [first] } }, "t3-new-a");
  const other = multiDie([], [4]);
  other.results = JSON.parse('[{"result":3,"active":true}]');
  const result = await core.rerollSignatureDice(actor, { confirmed: true, castId: "sig-new-cast", indices: [0], roll: { dice: [other] } }, "t3-new-b");
  assert.equal(other.rolls, 1, "a fresh roll receives its own die identity");
  assert.equal(result.replacements[0].value, 4);
});

for (const native of [false, true]) test(`T3-S${native ? 2 : 1} ordinary sheet Savant resolves ${native ? "native originatingMessage" : "direct"} actual dice; cancel zero-writes and confirm rerolls that die`, async () => {
  const { createRequire } = await import("node:module");
  const { parseHTML } = createRequire("/tmp/ak5e-lanes/caster-branch-deps/package.json")("linkedom");
  const { actor } = coreWorld();
  const art = makeArt(actor, { id: "sig-sheet", level: 3 });
  stateOf(actor).signature = { itemId: art.id, damaging: true };
  completedCast(actor, art, { id: "sig-sheet-cast" });
  rule(actor, "signatureRerollOnce", true);
  const term = multiDie([6, 2], [5]);
  const roll = { dice: [term] };
  game.messages = new Map([["damage-card", { id: "damage-card", speaker: { actor: actor.id },
    flags: { ak5e: { casterCast: { castId: "sig-sheet-cast" } } }, rolls: [roll] }]]);
  if (native) game.messages = new Map([
    ["cast-card", { id: "cast-card", speaker: { actor: actor.id }, flags: { ak5e: { artCast: { id: "sig-sheet-cast" } }, dnd5e: { roll: { type: "attack" } } }, rolls: [{ dice: [multiDie([1], [20])] }] }],
    ["damage-card", { id: "damage-card", speaker: { actor: actor.id }, flags: { dnd5e: { originatingMessage: "cast-card", roll: { type: "damage" } } }, rolls: [roll] }]
  ]);
  game.items = new Map(); game.packs = new Map();
  const { document } = parseHTML("<html><body></body></html>");
  globalThis.document = document;
  const { openCasterControls } = await import("/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-sheet.mjs");
  let confirms = false, opened = 0;
  foundry.applications = { api: { DialogV2: { wait: async options => {
    if (!options.window.title.startsWith("Savant Signature reroll")) {
      const box = document.createElement("div");
      box.innerHTML = options.content;
      options.render(null, { element: box });
      box.querySelector('[data-caster-ui="signatureDice"]').click();
      return null;
    }
    opened += 1;
    assert.match(options.content, /Position 0.*=.*6/s);
    assert.match(options.content, /Position 1.*=.*2/s);
    assert.doesNotMatch(options.content, /No damage roll is attached/);
    if (!confirms) return null;
    return options.buttons.find(button => button.action === "confirm").callback(null,
      { form: { elements: { castId: { value: "sig-sheet-cast" }, indices: { value: "1" }, confirmed: { checked: true } } } });
  } } } };
  await openCasterControls(actor);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(opened, 1);
  assert.equal(actor.writes.length, 0, "cancel is zero-write");
  assert.equal(term.rolls, 0);
  confirms = true;
  await openCasterControls(actor);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(opened, 2);
  assert.equal(term.rolls, 1, "confirm rerolls the very same card die");
  assert.equal(term.results[0].result, 6);
  assert.equal(term.results[1].active, false);
});


test("T3-M3 a separate GM client derives a durable seal from the original request, not pending Actor copies", async () => {
  const { actor, target, documents } = mysticSetup({ level: 3 }, { gm: false });
  await assert.rejects(potent(actor, { amount: 10 }, "t3-sealed"), /Not applied yet/);
  const originalInput = structuredClone(stateOf(actor).undo[0].data);
  // Different Actor instance = separate client, with no private plan cache from the owner's client.
  const remote = { ...actor, flags: structuredClone(actor.flags), writes: [], testUserPermission: () => true };
  documents.set(remote.uuid, remote); documents.set("caster", remote);
  const callbacks = new Map();
  globalThis.Hooks = { on(name, fn) { callbacks.set(name, fn); }, once() {}, off() {} };
  const module = await import("/tmp/ak5e-lanes/caster-branch-deps/ak5e/scripts/caster-mystic.mjs?t3-independent-gm");
  module.registerMystic();
  game.user = { id: "gm", isGM: true };
  game.users.activeGM = { id: "gm", isGM: true };
  ChatMessage.implementation.create = async data => {
    const message = { ...structuredClone(data), id: "gm-seal", author: { id: "gm", isGM: true }, getFlag: getFlagFn };
    game.messages.push(message); return message;
  };
  const request = { id: "original-request", author: { id: "player", isGM: false }, getFlag: getFlagFn,
    flags: { ak5e: { mysticPotentSealReady: true, mysticPotentSealRequest: { id: "t3-sealed", actorUuid: remote.uuid, command: "seal",
      data: { useId: "t3-sealed", input: originalInput, confirmation: true } } } },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
  callbacks.get("updateChatMessage")(request, {}, {}, "player");
  for (let attempt = 0; attempt < 30 && !request.flags.ak5e.mysticPotentSealResponse; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(request.flags.ak5e.mysticPotentSealResponse?.ok, true);
  assert.equal(game.messages[1].author.isGM, true);
  const receipt = stateOf(remote).undo[0];
  // Alter ALL pending copies before the first target write, while the GM-authored original stays 10/5.
  receipt.targets[0].damage.amount = 9; receipt.mysticPotent.rolled = 18; receipt.mysticPotent.half = 9;
  receipt.data.amount = 18;
  Object.assign(stateOf(remote).casts[0].potentUses[0], { rolled: 18, half: 9 });
  await assert.rejects(relayedTargetChange(remote, "apply", { useId: receipt.id, targetUuid: target.uuid }), /original authorization/);
  assert.equal(target.writes.length, 0);
  // Restore authentic terms and apply: the separate GM client can use the persisted seal with no plan cache.
  receipt.targets[0].damage.amount = 5; receipt.mysticPotent.rolled = 10; receipt.mysticPotent.half = 5;
  receipt.data.amount = 10;
  Object.assign(stateOf(remote).casts[0].potentUses[0], { rolled: 10, half: 5 });
  await relayedTargetChange(remote, "apply", { useId: receipt.id, targetUuid: target.uuid });
  assert.equal(target.system.attributes.hp.value, 25);
  assert.equal(target.writes.length, 1);
});
