import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../scripts/trigger-events.mjs";

// Argument shapes verified against installed dnd5e 5.3.3 / Foundry 13.351 (see module header).
const gm = { id: "gm", isGM: true }, player = { id: "player", isGM: false };
let seq = 0, hooks, listeners = [], writes = [];
const isPlain = v => v && typeof v === "object" && !Array.isArray(v);
/** Mirrors Foundry's ObjectField update: nested objects merge recursively; "==key" force-replaces and "-=key" deletes. */
function mergeFoundry(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith("==")) target[key.slice(2)] = structuredClone(value);
    else if (key.startsWith("-=")) delete target[key.slice(2)];
    else if (isPlain(value) && isPlain(target[key])) mergeFoundry(target[key], value);
    else if (isPlain(value)) { target[key] = {}; mergeFoundry(target[key], value); }
    else target[key] = structuredClone(value);
  }
}
const put = (object, path, value) => {
  const parts = path.split("."); let next = object;
  for (const part of parts.slice(0, -1)) next = next[part] ??= {};
  const last = parts.at(-1);
  if (last.startsWith("-=")) delete next[last.slice(2)];
  else if (isPlain(value) && isPlain(next[last])) mergeFoundry(next[last], value);
  else if (isPlain(value)) { next[last] = {}; mergeFoundry(next[last], value); }
  else next[last] = structuredClone(value);
};
function actor(name = "Vanguard", { hp = 20, owner = true } = {}) {
  const a = { id: `a${++seq}`, documentName: "Actor", name, isOwner: owner, isToken: false, flags: { ak5e: {} },
    system: { attributes: { hp: { value: hp, temp: 0, max: hp } } },
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
    async update(changes) { writes.push({ uuid: this.uuid, changes: structuredClone(changes) });
      for (const [k, v] of Object.entries(changes)) put(this, k, v); return this; } };
  a.uuid = `Actor.${a.id}`; docs.set(a.uuid, a); return a;
}
function setup({ user = gm } = {}) {
  globalThis.docs = new Map(); writes = []; hooks = new Map();
  for (const [kind, fn] of listeners) T.offAk5eEvent(kind, fn); listeners = [];
  globalThis.game = { user: { ...user, targets: new Set() }, users: new Map([[gm.id, gm], [player.id, player]]),
    time: { worldTime: 0 }, combat: null, actors: [], scenes: [] };
  game.users.activeGM = gm;
  globalThis.foundry = { utils: { randomID: () => `r${++seq}` } };
  globalThis.fromUuid = async id => docs.get(id);
  globalThis.fromUuidSync = id => docs.get(id);
  globalThis.dnd5e = { utils: { getTargetDescriptors: () => targets } };
  globalThis.Hooks = { on(name, fn) { hooks.set(name, [...(hooks.get(name) ?? []), fn]); return seq++; } };
  targets = [];
  T.setReactionStore(T.flagReactionStore);
  T.registerTriggerEventHooks();
}
let targets = [];
const riders = a => Object.values(a.flags.ak5e.triggerRiders ?? {});
const listen = (kind, fn = () => {}) => { const seen = []; const h = async e => { seen.push(e); await fn(e); };
  T.onAk5eEvent(kind, h); listeners.push([kind, h]); return seen; };
const call = (name, ...args) => hooks.get(name).map(fn => fn(...args));
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
const attackRoll = (total, { crit = false, fumble = false } = {}) => ({ total, isCritical: crit, isFumble: fumble, options: {} });
const activity = a => ({ uuid: `${a.uuid}.Item.i1.Activity.x`, actor: a, item: { uuid: `${a.uuid}.Item.i1` } });
function combatOf(...actors) {
  const id = `Combat.k${++seq}`;
  const turns = actors.map((a, i) => ({ id: `c${i}`, uuid: `${id}.Combatant.c${i}`, actor: a, token: { uuid: `Scene.s.Token.t${i}` } }));
  return { uuid: id, started: true, round: 1, turn: 0, turns, combatants: Object.assign(new Map(turns.map(t => [t.id, t])), {}),
    previous: { round: 1, turn: 0, combatantId: "c0" }, get combatant() { return this.turns[this.turn]; } };
}
async function advance(combat, round, turn) {
  const previous = { round: combat.round, turn: combat.turn, combatantId: combat.turns[combat.turn].id };
  combat.previous = previous; combat.round = round; combat.turn = turn;
  call("combatTurnChange", combat, previous, { round, turn, combatantId: combat.turns[turn].id });
  await settle();
}

test("registration is idempotent, one adapter per verified hook, none at import time", () => {
  setup();
  assert.equal(T.registerTriggerEventHooks(), false);
  assert.deepEqual([...hooks.keys()].sort(), ["combatTurnChange", "deleteCombat", "dnd5e.applyDamage", "dnd5e.postRollAttack",
    "dnd5e.preApplyDamage", "dnd5e.rollConcentration", "dnd5e.rollSavingThrow", "updateCombatant"]);
  for (const list of hooks.values()) assert.equal(list.length, 1);
});

test("no adapter returns a value, so none can cancel a cancellable hook", async () => {
  setup(); const a = actor(), combat = combatOf(a);
  const results = [call("dnd5e.postRollAttack", [attackRoll(10)], { subject: activity(a) }),
    call("dnd5e.rollSavingThrow", [attackRoll(10)], { ability: "con", subject: a }),
    call("dnd5e.rollConcentration", [attackRoll(10)], { subject: a }),
    call("dnd5e.preApplyDamage", a, 5, {}, {}), call("dnd5e.applyDamage", a, 5, {}),
    call("updateCombatant", combat.turns[0], { initiative: 12 }, {}, "gm"),
    call("combatTurnChange", combat, combat.previous, { round: 1, turn: 0, combatantId: "c0" }), call("deleteCombat", combat, {}, "gm")];
  for (const r of results.flat()) assert.equal(r, undefined);
  await settle();
});

test("attack emits attack, per-target hit and crit; duplicate hook delivery is deduped", async () => {
  setup(); const a = actor();
  targets = [{ uuid: "Actor.t1", name: "Low", ac: 12 }, { uuid: "Actor.t2", name: "High", ac: 30 }, { uuid: "Actor.t3", name: "Cover", ac: null }];
  const attacks = listen("attack"), hits = listen("hit"), crits = listen("crit");
  const rolls = [attackRoll(18)];
  call("dnd5e.postRollAttack", rolls, { subject: activity(a) });
  call("dnd5e.postRollAttack", rolls, { subject: activity(a) });     // same roll again
  await settle();
  assert.equal(attacks.length, 1); assert.equal(crits.length, 0);
  assert.deepEqual(hits.map(h => h.targetUuid), ["Actor.t1"]);
  assert.deepEqual(attacks[0].targets.map(t => t.hit), [true, false, null]);
  assert.equal(attacks[0].actorUuid, a.uuid); assert.ok(Object.isFrozen(attacks[0]) && Object.isFrozen(attacks[0].targets[0]));
  assert.equal(attacks[0].raw.rolls, rolls);                          // live reference, documented
  call("dnd5e.postRollAttack", [attackRoll(5, { crit: true })], { subject: activity(a) });
  await settle();
  assert.equal(crits.length, 1); assert.deepEqual(hits.slice(1).map(h => h.targetUuid), ["Actor.t1", "Actor.t2"]);
  assert.equal(hits[1].attackId, crits[0].attackId);
  call("dnd5e.postRollAttack", [attackRoll(25, { fumble: true })], { subject: activity(a) });
  await settle(); assert.equal(hits.length, 3);                       // fumble hits nothing
});

test("a throwing or rejecting handler is isolated from the emitter and later handlers", async () => {
  setup(); const a = actor(); const errors = console.error; console.error = () => {};
  try {
    listen("attack", () => { throw new Error("boom"); });
    listen("attack", async () => { throw new Error("async boom"); });
    const after = listen("attack");
    call("dnd5e.postRollAttack", [attackRoll(10)], { subject: activity(a) });
    await settle();
    assert.equal(after.length, 1);
    const { errors: count } = await T.emitAk5eEvent("attack", { actorUuid: a.uuid });
    assert.equal(count, 2);
  } finally { console.error = errors; }
  assert.throws(() => T.onAk5eEvent("bogus", () => {}), /Unknown/);
});

test("damage: hitTaken on damage, kill only when HP goes from above 0 to 0; options untouched", async () => {
  setup(); const a = actor("Target", { hp: 10 });
  const taken = listen("hitTaken"), kills = listen("kill");
  // An operator-skills style consumer keys its snapshot on the options object.
  const snapshots = new WeakMap(); const options = { isDelta: true, multiplier: 1 }; snapshots.set(options, "snap");
  const before = JSON.stringify(options), keys = Object.keys(options);
  call("dnd5e.preApplyDamage", a, 6, { "system.attributes.hp.value": 4 }, options);
  a.system.attributes.hp.value = 4;
  call("dnd5e.applyDamage", a, 6, options);
  call("dnd5e.applyDamage", a, 6, options);                           // duplicate delivery
  await settle();
  assert.equal(taken.length, 1); assert.equal(kills.length, 0);
  assert.equal(JSON.stringify(options), before); assert.deepEqual(Object.keys(options), keys);
  assert.equal(Object.isFrozen(options), false); assert.equal(snapshots.get(options), "snap");
  assert.equal(taken[0].raw.options, undefined);
  const lethal = {};
  call("dnd5e.preApplyDamage", a, 9, {}, lethal); a.system.attributes.hp.value = 0; call("dnd5e.applyDamage", a, 9, lethal);
  await settle();
  assert.equal(kills.length, 1); assert.equal(kills[0].hpBefore, 4); assert.deepEqual(Object.keys(lethal), []);
  const again = {};
  call("dnd5e.preApplyDamage", a, 3, {}, again); call("dnd5e.applyDamage", a, 3, again);
  const heal = {};
  call("dnd5e.preApplyDamage", a, -5, {}, heal); call("dnd5e.applyDamage", a, -5, heal);
  await settle();
  assert.equal(kills.length, 1); assert.equal(taken.length, 3);      // already at 0: no second kill; healing ignored
});

test("saves emit save with DC; a concentration save (delivered to both dnd5e hooks) is one save marked concentration; death saves are not emitted", async () => {
  setup(); const a = actor(); const saves = listen("save");
  call("dnd5e.rollSavingThrow", [{ total: 15, isSuccess: true, options: { target: 13 } }], { ability: "dex", subject: a });
  // Real dnd5e: rollConcentration runs through rollSavingThrow, so the SAME roll object reaches both hooks.
  const concentration = { total: 8, isSuccess: false, options: { target: 10 } };
  call("dnd5e.rollSavingThrow", [concentration], { ability: "con", subject: a });
  call("dnd5e.rollConcentration", [concentration], { subject: a });
  // Death save: rollSavingThrow without an ability.
  call("dnd5e.rollSavingThrow", [{ total: 12, isSuccess: true, options: { target: 10 } }], { ability: undefined, subject: a });
  await new Promise(r => setTimeout(r, 25)); await settle();             // save delivery waits one macrotask for rollConcentration
  assert.deepEqual(saves.map(s => [s.ability, s.success, s.concentration, s.dc]), [["dex", true, false, 13], ["con", false, true, 10]]);
});

test("a GM who advances twice before the first hook runs loses no turn events (core mutates combat.previous in place)", async () => {
  setup(); const [x, y, z] = [actor("X"), actor("Y"), actor("Z")], combat = combatOf(x, y, z);
  const ends = listen("turnEnd"), starts = listen("turnStart");
  // Establish the module's last-seen state at turn 0.
  call("combatTurnChange", combat, { round: 1, turn: 0, combatantId: "c0" }, { round: 1, turn: 0, combatantId: "c0" }); await settle();
  // Two quick advances: core mutated the shared previous/current objects before either hook ran.
  const shared = { round: 1, turn: 2, combatantId: "c2" };
  combat.turn = 2; combat.previous = shared;
  call("combatTurnChange", combat, shared, shared);
  call("combatTurnChange", combat, shared, shared);
  await settle();
  assert.deepEqual(ends.map(e => e.actorUuid), [x.uuid, y.uuid]);
  assert.deepEqual(starts.map(e => [e.actorUuid, e.skipped]), [[y.uuid, true], [z.uuid, false]]);
});

test("a deleted combat that never started emits no combatEnd", async () => {
  setup(); const a = actor(), combat = combatOf(a), ends = listen("combatEnd");
  combat.started = false; call("deleteCombat", combat, {}, "gm"); await settle();
  assert.equal(ends.length, 0);
});

test("rider IDs cannot contain dots, and expiries must carry the fields tagHasExpired reads", async () => {
  setup(); const a = actor();
  await assert.rejects(T.registerRider({ id: "mark:Actor.abc", actor: a, trigger: "attack" }), /dot/);
  for (const expiry of [{ trigger: "turnStart" }, { trigger: "time" }, { trigger: "attack" }, { trigger: "combatEnd" }])
    await assert.rejects(T.registerRider({ id: "x", actor: a, trigger: "attack", expiry }), /would never expire/);
  assert.equal(riders(a).length, 0);
  await T.registerRider({ id: "ok", actor: a, trigger: "attack", expiry: { trigger: "attack", actorUuid: a.uuid } });
  assert.equal(riders(a).length, 1);
});

test("Reaction refresh really clears triggers and receipts under Foundry's recursive flag merge", async () => {
  setup(); const a = actor();
  await T.spendReaction(a, { triggerId: "hit:1", receipt: "op1" });
  assert.ok(Object.keys(a.flags.ak5e.reactionBudget.triggers).length && Object.keys(a.flags.ak5e.reactionBudget.receipts).length);
  await T.refreshReactions(a);
  assert.deepEqual([a.flags.ak5e.reactionBudget.triggers, a.flags.ak5e.reactionBudget.receipts, a.flags.ak5e.reactionBudget.spent], [{}, {}, 0]);
  await T.spendReaction(a, { triggerId: "hit:1" });                      // the same trigger id is usable again next turn
});

test("initiative and combat events are emitted only on the active GM", async () => {
  setup({ user: player }); const a = actor(), combat = combatOf(a);
  const inits = listen("initiative"), ends = listen("combatEnd"), starts = listen("turnStart");
  call("updateCombatant", combat.turns[0], { initiative: 17 }, {}, "player");
  call("deleteCombat", combat, {}, "gm");
  await advance(combat, 1, 0);
  await settle();
  assert.equal(inits.length + ends.length + starts.length, 0);
  game.user = { ...gm, targets: new Set() };
  call("updateCombatant", combat.turns[0], { initiative: 17 }, {}, "player");
  call("updateCombatant", combat.turns[0], { initiative: null }, {}, "player");
  call("deleteCombat", combat, {}, "gm"); call("deleteCombat", combat, {}, "gm");
  await settle();
  assert.equal(inits.length, 1); assert.equal(inits[0].initiative, 17); assert.equal(ends.length, 1);
});

test("turn change emits turnEnd/turnStart once and refreshes only the new creature's Reactions", async () => {
  setup(); const first = actor("First"), second = actor("Second"), combat = combatOf(first, second);
  for (const x of [first, second]) await T.spendReaction(x, { triggerId: "t" });
  const ends = listen("turnEnd"), starts = listen("turnStart", e => {
    assert.equal(T.getReactions(e.raw.actor).spent, 0);                // refreshed before consumers run
  });
  const previous = { round: 1, turn: 0, combatantId: "c0" }, current = { round: 1, turn: 1, combatantId: "c1" };
  combat.turn = 1; combat.previous = previous;
  call("combatTurnChange", combat, previous, current);
  call("combatTurnChange", combat, previous, current);                  // duplicate delivery
  await settle();
  assert.deepEqual(ends.map(e => e.actorUuid), [first.uuid]);
  assert.deepEqual(starts.map(e => e.actorUuid), [second.uuid]);
  assert.equal(T.getReactions(second).spent, 0); assert.equal(T.getReactions(first).spent, 1);
  const count = writes.length; await T.refreshReactions(actor("Untouched")); assert.equal(writes.length, count);
});

test("a 'next attack' rider is consumed by exactly one attack and replays idempotently", async () => {
  setup(); const a = actor();
  await T.registerRider({ id: "smite", actor: a, trigger: "attack", consume: "once", effectRef: { kind: "damage", formula: "1d8" } });
  await T.registerRider({ id: "smite", actor: a, trigger: "attack" });  // idempotent re-register
  const applied = [];
  listen("attack", async e => { for (const r of T.matchRiders(e)) {
    const res = await T.consumeRider(r.id, { actor: a, receipt: e.attackId }); if (res.ok && !res.replayed) applied.push(e.attackId);
  } });
  call("dnd5e.postRollAttack", [attackRoll(10)], { subject: activity(a) });
  call("dnd5e.postRollAttack", [attackRoll(11)], { subject: activity(a) });
  await settle();
  assert.equal(applied.length, 1);
  const receipt = applied[0];
  assert.deepEqual(await T.consumeRider("smite", { actor: a, receipt }).then(r => r.replayed), true);
  assert.deepEqual(await T.consumeRider("smite", { actor: a, receipt: "other" }), { ok: false, reason: "consumed" });
  // Concurrent consumption by two different attacks: exactly one wins.
  await T.registerRider({ id: "strike", actor: a, trigger: "attack" });
  const race = await Promise.all([T.consumeRider("strike", { actor: a, receipt: "x" }), T.consumeRider("strike", { actor: a, receipt: "y" })]);
  assert.deepEqual(race.map(r => r.ok), [true, false]);
});

test("riders survive reload: state is re-read from flags; anonymous matchers fail closed", async () => {
  setup(); const a = actor();
  T.registerRiderMatcher("vsTarget", (e, r) => e.targetUuid === r.effectRef.targetUuid);
  await T.registerRider({ id: "mark", actor: a, trigger: "hit", match: "vsTarget", effectRef: { targetUuid: "Actor.t1" } });
  const reloaded = actor(a.name); reloaded.flags = structuredClone(a.flags);   // fresh document from stored data
  assert.equal(T.matchRiders({ kind: "hit", targetUuid: "Actor.t1" }, reloaded).length, 1);
  assert.equal(T.matchRiders({ kind: "hit", targetUuid: "Actor.t2" }, reloaded).length, 0);
  assert.equal(T.matchRiders({ kind: "attack", targetUuid: "Actor.t1" }, reloaded).length, 0);
  reloaded.flags.ak5e.triggerRiders.orphan = { ...reloaded.flags.ak5e.triggerRiders.mark, id: "orphan", matcher: null, transientMatch: true };
  assert.deepEqual(T.matchRiders({ kind: "hit", targetUuid: "Actor.t1" }, reloaded).map(r => r.id), ["mark"]);
});

test("riders expire on their feature-tags expiry: attack (after consumers), turnStart, combatEnd", async () => {
  setup(); const a = actor(), b = actor("Other"), combat = combatOf(a, b); game.actors = [a, b];
  await T.registerRider({ id: "untilAttack", actor: a, trigger: "attack", consume: "untilExpiry", expiry: { trigger: "attack", actorUuid: a.uuid } });
  await T.registerRider({ id: "untilTurn", actor: a, trigger: "hit",
    expiry: { trigger: "turnStart", actorUuid: a.uuid, combatUuid: combat.uuid, combatantId: "c0", round: 2 } });
  await T.registerRider({ id: "untilEnd", actor: a, trigger: "hit", expiry: { trigger: "combatEnd", actorUuid: a.uuid, combatUuid: combat.uuid } });
  const seen = listen("attack", e => seen.matched = T.matchRiders(e).map(r => r.id));
  call("dnd5e.postRollAttack", [attackRoll(10)], { subject: activity(a) });
  await settle();
  assert.deepEqual(seen.matched, ["untilAttack"]);
  assert.deepEqual(Object.keys(a.flags.ak5e.triggerRiders).sort(), ["untilEnd", "untilTurn"]);
  await advance(combat, 1, 1);
  assert.ok(a.flags.ak5e.triggerRiders.untilTurn);
  await advance(combat, 2, 0);
  assert.deepEqual(Object.keys(a.flags.ak5e.triggerRiders), ["untilEnd"]);
  call("deleteCombat", combat, {}, "gm"); await settle();
  assert.deepEqual(Object.keys(a.flags.ak5e.triggerRiders), []);
  await assert.rejects(T.registerRider({ id: "bad", actor: a, trigger: "attack", expiry: { trigger: "never" } }), /expiry/);
});

test("non-owner, non-GM writes are rejected and write nothing", async () => {
  setup({ user: player }); const a = actor("Theirs", { owner: false }); const count = writes.length;
  await assert.rejects(T.registerRider({ id: "x", actor: a, trigger: "attack" }), /own this Actor/);
  await assert.rejects(T.consumeRider("x", { actor: a, receipt: "r" }), /own this Actor/);
  await assert.rejects(T.spendReaction(a, { triggerId: "t" }), /own this Actor/);
  await assert.rejects(T.grantExtraReaction(a, { id: "e", atTurnStart: "expire" }), /own this Actor/);
  await assert.rejects(T.refundReaction(a), /own this Actor/);
  assert.equal(writes.length, count);
});

test("Reaction budget: default 1, exhaustion, receipts and refund", async () => {
  setup(); const a = actor();
  assert.equal(T.getReactions(a).max, 1); assert.equal(T.getReactions(a).available, 1);
  const spent = await T.spendReaction(a, { triggerId: "atk1", receipt: "op1" });
  assert.deepEqual(spent, { ok: true, replayed: false, pool: "base" });
  assert.equal((await T.spendReaction(a, { triggerId: "atk1", receipt: "op1" })).replayed, true);
  const count = writes.length;
  assert.deepEqual(await T.spendReaction(a, { triggerId: "atk2" }), { ok: false, reason: "exhausted" });
  assert.equal(writes.length, count);
  assert.equal((await T.refundReaction(a, { receipt: "op1" })).ok, true);
  assert.equal((await T.refundReaction(a, { receipt: "op1" })).replayed, true);
  assert.equal(T.getReactions(a).spent, 0);
  await assert.rejects(T.spendReaction(a, {}), /triggerId/);
});

test("perTrigger: one Reaction per trigger when on (Reactive L1034); allowed when off", async () => {
  setup(); const a = actor(); await T.setReactionMax(a, 2);            // Reactive: two Reactions
  assert.equal((await T.spendReaction(a, { triggerId: "hit:1" })).ok, true);
  const count = writes.length;
  assert.deepEqual(await T.spendReaction(a, { triggerId: "hit:1" }), { ok: false, reason: "perTrigger" });
  assert.equal(writes.length, count);
  assert.equal((await T.spendReaction(a, { triggerId: "hit:2" })).ok, true);
  const b = actor(); await T.setReactionMax(b, 2);
  assert.equal((await T.spendReaction(b, { triggerId: "hit:1", perTrigger: false })).ok, true);
  assert.equal((await T.spendReaction(b, { triggerId: "hit:1", perTrigger: false })).ok, true);
});

test("restricted extra Reaction (Well-Drilled L8760) is only spendable on matching tags", async () => {
  setup(); const a = actor();
  await T.spendReaction(a, { triggerId: "base" });
  await T.grantExtraReaction(a, { id: "wellDrilled", restrictedTo: ["tactic:Actor.tac", "strategy:Actor.tac"], atTurnStart: "expire" });
  const count = writes.length;
  assert.deepEqual(await T.spendReaction(a, { triggerId: "t1", tags: ["tactic:Actor.someoneElse"] }), { ok: false, reason: "restricted" });
  assert.deepEqual(await T.spendReaction(a, { triggerId: "t1", pool: "wellDrilled", tags: [] }), { ok: false, reason: "restricted" });
  assert.equal(writes.length, count);
  assert.deepEqual(await T.spendReaction(a, { triggerId: "t1", tags: ["tactic:Actor.tac"] }), { ok: true, replayed: false, pool: "wellDrilled" });
  await assert.rejects(T.grantExtraReaction(a, { id: "x" }), /turn start/);
  await T.grantExtraReaction(a, { id: "defences", restrictedTo: ["rotateShields"], atTurnStart: "regain" });
  await T.spendReaction(a, { triggerId: "t2", tags: ["rotateShields"] });
  await T.refreshReactions(a);
  assert.deepEqual(T.getReactions(a).extra.map(e => [e.id, e.spent]), [["defences", 0]]);
  assert.equal(T.getReactions(a).spent, 0);
});

test("the Reaction budget runs over a replaceable store (SI-2 seam)", async () => {
  setup(); const memory = new Map(), a = actor();
  T.setReactionStore({ read: x => memory.get(x.uuid), write: async (x, s) => { memory.set(x.uuid, structuredClone(s)); } });
  await T.spendReaction(a, { triggerId: "t" });
  assert.equal(memory.get(a.uuid).spent, 1); assert.equal(a.flags.ak5e.reactionBudget, undefined);
  T.setReactionStore(T.flagReactionStore);
});

test("turnTransitions mirrors core: skipped turns across a round and rewinds emit nothing", () => {
  const combat = combatOf(actor("A"), actor("B"), actor("C"));
  const steps = T.turnTransitions(combat, { round: 1, turn: 1, combatantId: "c1" }, { round: 2, turn: 1, combatantId: "c1" });
  assert.deepEqual(steps.map(s => `${s.kind}:${s.combatant.id}:${s.round}:${s.skipped}`),
    ["turnEnd:c1:1:false", "turnStart:c2:1:true", "turnEnd:c2:1:true", "turnStart:c0:2:true", "turnEnd:c0:2:true", "turnStart:c1:2:false"]);
  assert.deepEqual(T.turnTransitions(combat, { round: 2, turn: 1, combatantId: "c1" }, { round: 2, turn: 0, combatantId: "c0" }), []);
});
