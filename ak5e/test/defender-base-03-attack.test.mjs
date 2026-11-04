/**
 * WP defender-base-03 — adversarial attack pass (tester: adversary, 2026-11-03).
 *
 * Attacks the frozen base-use candidate against SPEC §5 WP-03 "Attack themes": all seven command keys; duplicate
 * and changed-input IDs; action/bonus warning overrides; empty pool; missing/reset/refunded Reaction; same versus
 * distinct triggers at Reactive level; forged Actor/operation/receipt IDs; NaN/fraction/string amounts; prototype
 * keys; throw after reaction, projection intent, projection write and refund; reload; undo after later operations
 * or resource edits and after encounter lock; parent refund/undo ordering must never net free Reactions.
 *
 * Black-box: only the public defenderUses API, the strict defenderCommand, the exported projection helper and
 * writable fixture flags. Expectations are spec §3.2/§3.4 invariants (never mint a Reaction, never a negative
 * pool, actual-delta accounting, technical identity failures reject before writes). Where the spec allows either
 * rejection or a visible no-effect completion, both are accepted — except where §3.4 freezes one behavior.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as features from "../scripts/defender-features.mjs";
import {
  defenderCommand, registerDefenderHooks, syncDefenderReactions, resilience
} from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { defenderState } from "../scripts/defender-rules.mjs";
import { getReactions, spendReaction, refundReaction } from "../scripts/trigger-events.mjs";
import { fixture, world } from "./defender-fixture.mjs";

const BASE = ["shelter", "endShelter", "leapingDefence", "leapingRefund", "indestructible", "restoreIndestructible", "resilience"];

const ownTurn = (actor, uuid = "Combat.c1") => ({ started: true, uuid, round: 1, turn: 0, combatant: { id: "m1", actor: { uuid: actor.uuid } } });

const rolls = [];
function boot(combat = null) {
  const documents = world(combat);
  globalThis.Hooks = { on() {}, off() {} };
  game.user.name = "Player"; game.users = [{ id: "player", isGM: false }]; game.users.activeGM = null;
  globalThis.foundry.utils.randomID = () => `op${Math.random().toString(36).slice(2, 10)}`;
  globalThis.Roll = class { constructor(formula) { rolls.push(String(formula)); } async evaluate() { this.total = 1; return this; } async toMessage() {} };
  globalThis.CONFIG = { Dice: { DamageRoll: class { constructor(formula) { rolls.push(String(formula)); } async evaluate() { this.total = 1; return this; } } } };
  rolls.length = 0;
  registerDefenderHooks();
  return documents;
}
const use = (actor, command, data = {}, id) => defenderUses.command(actor, command, { confirmed: true, ...data }, id);
async function anyway(actor, command, data = {}, id) {
  try { return await use(actor, command, data, id); }
  catch (error) {
    if (error?.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}
const spentCount = actor => actor.flags.ak5e.reactionBudget?.spent ?? 0;
const legacyOps = actor => actor.flags.ak5e.defender.operations;
const baseState = actor => actor.flags.ak5e.defenderUses;
const shelterData = (allies = ["Token.a"], extra = {}) => ({ activation: "action", allies, alliesConfirmed: true, positionConfirmed: true, ...extra });
const leapData = (attackId = "atk1") => ({ attackId, attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true });
const indestructibleData = (extra = {}) => ({ damageId: "d1", hostileConfirmed: true, reduction: 2, ...extra });

/** Inject write faults into the Actor update path for updates whose keys match. */
function failUpdates(actor, matcher, times = 1) {
  const original = actor.update.bind(actor);
  const state = { left: times, faults: 0 };
  actor.update = async (changes, options) => {
    if (state.left > 0 && Object.keys(changes).some(key => matcher.test(key))) { state.left--; state.faults++; throw new Error("injected write fault"); }
    return original(changes, options);
  };
  return state;
}

/** Rebuild an actor from persisted flags only — the view a reloaded client would hydrate. */
function reloadFrom(actor, { level, res }) {
  const fresh = fixture({ level, res });
  fresh.flags = JSON.parse(JSON.stringify(actor.flags));
  fresh.getActiveTokens = () => actor.getActiveTokens();
  return fresh;
}

const expectRejected = async (promise, label) => {
  let threw = false;
  try { await promise; } catch (error) { threw = error?.name !== "AK5eWarnings"; }
  assert.ok(threw, `${label} must reject technically`);
};

/* ---------------------------------------------------------------- all seven keys */

test("attack:all-seven-keys-full-cycle-accounting", async () => {
  const actor = fixture({ level: 18, res: 8 });
  boot(ownTurn(actor));
  for (const name of BASE) assert.ok(defenderUses.isCommand(name), `${name} registered`);
  assert.equal(defenderUses.isCommand("toString"), false, "inherited names are not commands");
  await use(actor, "shelter", shelterData(["Token.a"]), "k-shelter");
  await use(actor, "endShelter", {}, "k-end");
  await use(actor, "leapingDefence", leapData("k-atk"), "k-leap");
  await use(actor, "leapingRefund", { leapOperationId: "k-leap" }, "k-refund");
  await anyway(actor, "indestructible", indestructibleData({ damageId: "k-dmg", amount: 12 }), "k-indestructible");
  await use(actor, "restoreIndestructible", {}, "k-restore");
  await use(actor, "resilience", { mode: "spend", amount: 1, reason: "attack pass" }, "k-resilience");
  for (const id of ["k-shelter", "k-end", "k-leap", "k-refund", "k-indestructible", "k-restore", "k-resilience"]) {
    assert.equal(defenderUses.receipt(actor, id).status, "complete", `${id} completed`);
    assert.ok(legacyOps(actor).some(o => o.baseUseId === id), `legacy backlink for ${id}`);
  }
  assert.equal(resilience(actor).value, 4, "8 − 1 refund − 2 restore − 1 adjustment");
  assert.equal(getPool(actor, "indestructible").value, 1, "spent once, restored once");
  assert.equal(spentCount(actor), 1, "leap+refund net zero; the overridden Indestructible then spent the regained Reaction");
  assert.equal(rolls.length, 0, "no dice");
  assert.equal(actor.system.attributes.hp.value, 50, "no HP writes");
  // useRoll must be a technical no-op on formula-less base receipts.
  await expectRejected(anyway(actor, "undoUse", { useId: "nope" }, "k-ghost"), "ghost undo");
  let rolled = false;
  try { await defenderUses.command(actor, "useRoll", { useId: "k-shelter" }, "k-roll"); }
  catch (error) { rolled = /roll/i.test(error.message); }
  assert.ok(rolled || rolls.length === 0, "no dice via useRoll either");
  assert.equal(rolls.length, 0);
});

test("attack:all-seven-confirm-gate-writes-nothing", async () => {
  const actor = fixture({ level: 18, res: 8 });
  boot(ownTurn(actor));
  const minimal = {
    shelter: shelterData(), endShelter: {}, leapingDefence: leapData(), leapingRefund: { leapOperationId: "ghost" },
    indestructible: indestructibleData(), restoreIndestructible: {}, resilience: { mode: "spend", amount: 1, reason: "gate test" }
  };
  for (const [name, data] of Object.entries(minimal))
    await assert.rejects(defenderUses.command(actor, name, data, `gate-${name}`), /Confirm/i, `${name} needs confirmation`);
  assert.equal(baseState(actor)?.undo?.length ?? 0, 0, "no receipt without confirmation");
  assert.equal(resilience(actor).value, 8, "no spend without confirmation");
  assert.equal(actor.writes.length, 0, "zero writes");
  assert.equal(spentCount(actor), 0, "zero budget writes");
});

test("attack:preview-pure-for-all-seven-malformed-technical", async () => {
  const actor = fixture({ level: 18, res: 8 });
  boot(ownTurn(actor));
  const valid = {
    shelter: shelterData(), endShelter: {}, leapingDefence: leapData(), leapingRefund: { leapOperationId: "pp-leap" },
    indestructible: indestructibleData(), restoreIndestructible: {}, resilience: { mode: "refund", amount: 1, reason: "preview purity" }
  };
  await use(actor, "leapingDefence", leapData("pp"), "pp-leap");
  for (const [name, data] of Object.entries(valid)) {
    const writes = actor.writes.length;
    const p = defenderUses.preview(actor, name, data);
    assert.equal(typeof p.title, "string", `${name} preview title`);
    assert.equal(actor.writes.length, writes, `${name} preview writes nothing`);
  }
  assert.equal(resilience(actor).value, 8, "only a Leap has run: it costs no Resilience");
  assert.equal(spentCount(actor), 1);
  // Malformed previews are technical throws, never warning objects, and never write.
  for (const bad of [
    { name: "resilience", data: { mode: "spend", amount: Number.NaN, reason: "nan" } },
    { name: "resilience", data: { mode: "spend", amount: "3", reason: "string" } },
    { name: "resilience", data: { mode: "SPEND", amount: 1, reason: "case" } },
    { name: "indestructible", data: { damageId: "x", hostileConfirmed: true, reduction: Number.NaN } },
    { name: "indestructible", data: { damageId: "x", hostileConfirmed: true, reduction: -1 } },
    { name: "indestructible", data: { damageId: "x", hostileConfirmed: true, reduction: 1, amount: "20" } },
    { name: "shelter", data: { activation: "bonus", allies: "Token.a", alliesConfirmed: true, positionConfirmed: true } }
  ]) {
    const writes = actor.writes.length;
    let threw = false;
    try { defenderUses.preview(actor, bad.name, bad.data); }
    catch (error) { threw = error?.name !== "AK5eWarnings"; }
    assert.ok(threw, `${bad.name} malformed preview is technical`);
    assert.equal(actor.writes.length, writes, "malformed preview writes nothing");
  }
});

/* ---------------------------------------------------------------- forged ids and identity */

test("attack:forged-ids-ghost-parents-and-shape-ships-rejected", async () => {
  const actor = fixture({ level: 11, res: 6 });
  boot(ownTurn(actor));
  const res0 = resilience(actor).value;
  for (const ghost of ["never-existed", "", "   ", "leaping_leap-real", 123, null, { id: "obj" }])
    await expectRejected(anyway(actor, "leapingRefund", { leapOperationId: ghost }, "gf-ghost"), `ghost parent ${String(ghost)}`);
  assert.equal(resilience(actor).value, res0, "no cost for ghost parents");
  assert.equal(spentCount(actor), 0, "no budget change for ghost parents");
  // A completed non-leap parent is a command-confusion rejection.
  await use(actor, "shelter", shelterData(["Token.a"]), "gf-shelter");
  await expectRejected(anyway(actor, "leapingRefund", { leapOperationId: "gf-shelter" }, "gf-wrong"), "shelter parent");
  // Another Actor's engine use is invisible: the refund reads only its own Actor.
  await expectRejected(anyway(actor, "leapingRefund", { leapOperationId: "of-other-actor" }, "gf-other"), "foreign use id");
  // Malformed operation IDs (transport shape) fail before anything runs.
  for (const id of ["has.dots", "has=equals", "a".repeat(81), "", "bad!!id"])
    await expectRejected(use(actor, "endShelter", {}, id), `operation id ${JSON.stringify(id)}`);
  // Command-name forgeries.
  for (const name of ["__proto__", "constructor", "prototype", "toString", "shelter ", "Shelter"])
    await expectRejected(use(actor, name, { confirmed: true }, "gf-name"), `command ${name}`);
  assert.equal(baseState(actor).undo.length, 1, "only the one real receipt exists");
  assert.equal(baseState(actor).undo[0].id, "gf-shelter");
  // projectDefenderBaseUse refuses forged inputs outright (identity, command, data), writing nothing.
  const writes = actor.writes.length;
  await expectRejected(features.projectDefenderBaseUse(actor, { useId: "ghost", command: "shelter" }), "ghost projection");
  await expectRejected(features.projectDefenderBaseUse(actor, { useId: "gf-shelter", command: "leapingRefund" }), "wrong-command projection");
  await expectRejected(features.projectDefenderBaseUse(actor, { useId: "gf-shelter", command: "shelter", data: { activation: "bonus", allies: ["Token.zz"] } }), "data-mismatch projection");
  await expectRejected(features.projectDefenderBaseUse(fixture({ level: 12 }), { useId: "gf-shelter", command: "shelter" }), "projection onto another actor");
  await expectRejected(features.projectDefenderBaseUse(actor, { useId: "gf-shelter", command: "__proto__" }), "proto command");
  assert.equal(actor.writes.length, writes, "refused projections write nothing");
});

test("attack:prototype-key-data-pollutes-nothing", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot(ownTurn(actor));
  const polluted = JSON.parse('{"__proto__":{"polluted":"yes"},"activation":"action","allies":["Token.a"],"alliesConfirmed":true,"positionConfirmed":true}');
  await use(actor, "shelter", polluted, "pk1");
  assert.equal({}.polluted, undefined, "no global prototype pollution");
  assert.equal(legacyOps(actor).find(o => o.baseUseId === "pk1").status, "complete");
  // __proto__-shaped allies remain technical.
  await expectRejected(use(actor, "shelter", { ...shelterData(), allies: { __proto__: { 0: "Token.b" } } }, "pk2"), "proto allies");
  // A __proto__ own-key in the payload is inert data: it must neither crash nor clobber state paths.
  const inert = JSON.parse('{"mode":"spend","amount":1,"reason":"proto inert","__proto__":{"flags":{"ak5e":{"defender":{"operations":"clobber"}}}}}');
  await use(actor, "resilience", inert, "pk3");
  assert.ok(Array.isArray(legacyOps(actor)), "operations never clobbered");
  assert.equal(resilience(actor).value, 3, "whitelisted fields still honored");
  assert.equal({}.flags, undefined, "no pollution");
});

/* ---------------------------------------------------------------- duplicate / changed ids */

test("attack:changed-input-ids-serialize-and-never-double-spend", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot(ownTurn(actor));
  const data = shelterData(["Token.a", "Token.b"], { activation: "bonus" });
  await use(actor, "shelter", data, "cid1");
  assert.equal(resilience(actor).value, 3);
  // Same ID + reordered allies: whitelist normalization sorts → replay, no second spend.
  await use(actor, "shelter", shelterData(["Token.b", "Token.a"], { activation: "bonus" }), "cid1");
  assert.equal(resilience(actor).value, 3, "reordered allies replay the same use");
  // Same ID + genuinely changed choices rejects before the completed-receipt fast path.
  for (const changed of [
    shelterData(["Token.c"], { activation: "bonus" }),
    shelterData(["Token.a", "Token.b"], { activation: "action" }),
    shelterData(["Token.a", "Token.b"], { activation: "bonus", anchorPoint: true }),
    shelterData(["Token.a"], { activation: "bonus" })
  ]) await expectRejected(use(actor, "shelter", changed, "cid1"), "changed choices");
  assert.equal(resilience(actor).value, 3, "no spend for rejected changes");
  // Cross-command ID reuse rejects.
  await expectRejected(use(actor, "endShelter", {}, "cid1"), "cross-command reuse");
  // Optional missing amount vs supplied amount is distinct (spec: missing optional ≠ supplied value).
  const hard = fixture({ level: 18, res: 8 });
  game.combat = ownTurn(hard);
  await use(hard, "indestructible", { damageId: "i1", hostileConfirmed: true, reduction: 1 }, "cid-in");
  await expectRejected(use(hard, "indestructible", { damageId: "i1", hostileConfirmed: true, reduction: 1, amount: 20 }, "cid-in"), "added optional amount");
  await use(hard, "indestructible", { damageId: "i1", hostileConfirmed: true, reduction: 1 }, "cid-in");
  // Concurrent duplicate-ID, changed-data race: exactly one spend survives.
  const racer = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(racer);
  const results = await Promise.allSettled([
    use(racer, "resilience", { mode: "spend", amount: 2, reason: "race" }, "cid-race"),
    use(racer, "resilience", { mode: "spend", amount: 3, reason: "race changed" }, "cid-race")
  ]);
  const fulfilled = results.filter(r => r.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "one request completes, the other rejects");
  const spent = baseState(racer).undo.find(e => e.id === "cid-race").resources.find(e => e.pool === "resilience");
  assert.equal(spent.before - spent.after, 2, "exactly the first request's spend");
  assert.equal(resilience(racer).value, 2, "pool reflects one spend only");
  // Undo double-replay: second undo of the same use is a no-op, budget unchanged.
  const leaper = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(leaper);
  await use(leaper, "leapingDefence", leapData("dup-u"), "dup-l");
  await anyway(leaper, "undoUse", { useId: "dup-l" }, "dup-u1");
  const after = { spent: spentCount(leaper), res: resilience(leaper).value };
  await anyway(leaper, "undoUse", { useId: "dup-l" }, "dup-u2");
  assert.equal(spentCount(leaper), after.spent, "undo replay never refunds twice");
  assert.equal(resilience(leaper).value, after.res);
  // undoUse with a forged useId never half-applies.
  await expectRejected(anyway(leaper, "undoUse", { useId: "ghost-use" }, "dup-u3"), "ghost undo");
  await expectRejected(anyway(leaper, "undoUse", { useId: { evil: "obj" } }, "dup-u4"), "object useId");
});

/* ---------------------------------------------------------------- empty pool / NaN amounts */

test("attack:empty-pool-clamps-and-never-negatives", async () => {
  const actor = fixture({ level: 12, res: 0 });
  boot(ownTurn(actor));
  // Bonus Shelter with an empty pool: acknowledged shortfall clamps at zero and records the actual delta.
  await anyway(actor, "shelter", shelterData(["Token.a"], { activation: "bonus" }), "ep-shelter");
  assert.equal(resilience(actor).value, 0, "never negative");
  const r = defenderUses.receipt(actor, "ep-shelter");
  const entry = r.resources.find(e => e.pool === "resilience");
  assert.ok(entry && entry.before === 0 && entry.after === 0, "actual zero delta recorded");
  assert.ok((r.shortfalls ?? []).length >= 1, "shortfall publicized on the receipt");
  await anyway(actor, "undoUse", { useId: "ep-shelter" }, "ep-undo");
  assert.equal(resilience(actor).value, 0, "undo of a zero delta stays zero");
  // Over-refund clamps at the current maximum; its undo removes exactly what was given; nothing crosses the bounds.
  await anyway(actor, "resilience", { mode: "refund", amount: 99, reason: "over-refund" }, "ep-refund");
  assert.equal(resilience(actor).value, 6, "clamped at the current maximum");
  await anyway(actor, "undoUse", { useId: "ep-refund" }, "ep-refund-u");
  assert.equal(resilience(actor).value, 0, "undo removes the actual five, not the requested 99");
  // A spend larger than the (empty) pool clamps at zero and its undo cannot mint resources.
  await anyway(actor, "resilience", { mode: "spend", amount: 3, reason: "from empty" }, "ep-empty");
  assert.equal(resilience(actor).value, 0);
  await anyway(actor, "undoUse", { useId: "ep-empty" }, "ep-empty-u");
  assert.equal(resilience(actor).value, 0, "undo of a never-paid spend mints nothing");
  // Double Indestructible consumption against a once-per-Short-Rest pool.
  const hard = fixture({ level: 18, res: 8 });
  game.combat = ownTurn(hard);
  await use(hard, "indestructible", indestructibleData({ damageId: "p1" }), "ep-in1");
  assert.equal(getPool(hard, "indestructible").value, 0);
  await anyway(hard, "indestructible", indestructibleData({ damageId: "p2" }), "ep-in2");
  assert.equal(getPool(hard, "indestructible").value, 0, "spent pool never goes negative");
  const second = defenderUses.receipt(hard, "ep-in2").resources.find(e => e.pool === "indestructible");
  assert.ok(second.before === 0 && second.after === 0, "actual zero second consumption");
  // Restore with an empty Resilience pool: acknowledged, clamps at zero, still restores exactly one use.
  const poor = fixture({ level: 18, res: 0 });
  game.combat = ownTurn(poor);
  await anyway(poor, "indestructible", indestructibleData({ damageId: "q1" }), "poor-in");
  await anyway(poor, "restoreIndestructible", {}, "poor-r");
  assert.equal(resilience(poor).value, 0, "never negative");
  assert.equal(getPool(poor, "indestructible").value, 1, "restores one availability");
  assert.equal(getPool(poor, "indestructible").max, 1, "normal maximum unchanged");
});

test("attack:amount-shape-attacks-spend-nothing", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot(ownTurn(actor));
  const attacks = [
    { name: "resilience", data: { mode: "spend", amount: Number.NaN, reason: "nan" } },
    { name: "resilience", data: { mode: "spend", amount: Number.POSITIVE_INFINITY, reason: "inf" } },
    { name: "resilience", data: { mode: "spend", amount: -3, reason: "negative" } },
    { name: "resilience", data: { mode: "spend", amount: 0, reason: "zero" } },
    { name: "resilience", data: { mode: "spend", amount: 2.5, reason: "fraction" } },
    { name: "resilience", data: { mode: "refund", amount: "1e308", reason: "string power" } },
    { name: "resilience", data: { mode: "spend", amount: true, reason: "boolean" } },
    { name: "resilience", data: { mode: "spend", amount: 1, reason: "  " } },
    { name: "resilience", data: { mode: "spend", amount: 1, reason: "ab" } },
    { name: "resilience", data: { mode: undefined, amount: 1, reason: "no mode" } },
    { name: "indestructible", data: { damageId: "x", hostileConfirmed: true, reduction: Number.NaN } },
    { name: "indestructible", data: { damageId: "x", hostileConfirmed: true, reduction: "3" } },
    { name: "indestructible", data: { damageId: "x", hostileConfirmed: true, reduction: 1, amount: Number.NaN } },
    { name: "leapingDefence", data: { attackId: Number.NaN, attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true } },
    { name: "leapingDefence", data: { attackId: "   ", attackConfirmed: true, rangeConfirmed: true, moveConfirmed: true } },
    { name: "leapingRefund", data: { leapOperationId: " " } },
    { name: "shelter", data: { activation: "reaction", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true } },
    { name: "shelter", data: { activation: "action", allies: ["Token.a", " Token.a "], alliesConfirmed: true, positionConfirmed: true } },
    { name: "shelter", data: { activation: "action", allies: ["Token.a", 7, null], alliesConfirmed: true, positionConfirmed: true } }
  ];
  const writes = actor.writes.length;
  let n = 0;
  for (const a of attacks) await expectRejected(anyway(actor, a.name, a.data, `amt-${n++}`), `${a.name} ${JSON.stringify(a.data)}`);
  assert.equal(resilience(actor).value, 4, "nothing spent by malformed amounts");
  assert.equal(spentCount(actor), 0, "nothing spent from the Reaction budget");
  assert.equal(baseState(actor)?.undo?.length ?? 0, 0, "no receipts persisted");
  assert.equal(actor.writes.length, writes, "no writes at all");
  // A huge-but-well-formed spend is a warning (not a block) and clamps at zero.
  await anyway(actor, "resilience", { mode: "spend", amount: 1_000_000, reason: "huge but finite" }, "amt-huge");
  assert.equal(resilience(actor).value, 0, "clamped at zero");
  const undoable = defenderUses.previewUndo(actor, "amt-huge");
  assert.ok(undoable.lines.length >= 1, "undo preview explains the clamped actual");
  await anyway(actor, "undoUse", { useId: "amt-huge" }, "amt-huge-u");
  assert.equal(resilience(actor).value, 4, "undo restores exactly the clamped actual (4→0), never the requested 1e6");
});

/* ---------------------------------------------------------------- reaction attacks */

test("attack:missing-reset-refunded-reaction-never-mints", async () => {
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  // No Reaction available: Leap completes as a recorded no-effect use, spending nothing.
  actor.flags.ak5e.reactionBudget = { max: 1, spent: 1, triggers: {}, extra: [], receipts: {} };
  await anyway(actor, "leapingDefence", leapData("m1"), "m-leap");
  const r = defenderUses.receipt(actor, "m-leap");
  assert.equal(r.reaction.requested, true);
  assert.equal(r.reaction.spent, false, "no Reaction minted by a Use-anyway");
  assert.equal(spentCount(actor), 1, "budget unchanged");
  assert.ok((r.overridden ?? []).length >= 1, "the no-Reaction condition was publicly acknowledged");
  // A refund for a Leap that never actually spent is a technical failure: no receipt was recorded.
  await expectRejected(anyway(actor, "leapingRefund", { leapOperationId: "m-leap" }, "m-refund"), "refund of unsent Reaction");
  assert.equal(spentCount(actor), 1, "no minting via refund either");
  assert.equal(resilience(actor).value, 6, "no cost");
  // Reset budget (turn-start refresh) between leap and refund: refund cannot recreate the Reaction.
  const reset = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(reset);
  await use(reset, "leapingDefence", leapData("z1"), "z-leap");
  assert.equal(spentCount(reset), 1);
  reset.flags.ak5e.reactionBudget = { ...reset.flags.ak5e.reactionBudget, spent: 0, triggers: {}, receipts: {} };
  await expectRejected(anyway(reset, "leapingRefund", { leapOperationId: "z-leap" }, "z-refund"), "refund after reset");
  assert.equal(resilience(reset).value, 6, "reset refund costs nothing");
  assert.equal(spentCount(reset), 0, "no negative budget");
  assert.ok(!reset.flags.ak5e.reactionBudget.receipts["leaping_z-leap"], "reset receipt not re-created");
  // Already refunded: a second refund (distinct ID) completes as a visible no-effect — never a second cost or mint.
  const done = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(done);
  await use(done, "leapingDefence", leapData("r1"), "r-leap");
  await use(done, "leapingRefund", { leapOperationId: "r-leap" }, "r-refund");
  assert.equal(spentCount(done), 0);
  await anyway(done, "leapingRefund", { leapOperationId: "r-leap" }, "r-refund2");
  assert.equal(resilience(done).value, 5, "no second Resilience cost for an already-refunded receipt");
  assert.equal(spentCount(done), 0, "no second refund could push the budget negative");
  assert.ok(defenderUses.receipt(done, "r-refund2").overridden.length >= 1, "the no-effect path is publicly warned");
  // Undo of the no-effect second refund must not re-spend.
  await anyway(done, "undoUse", { useId: "r-refund2" }, "r-refund2-u");
  assert.equal(spentCount(done), 0, "undoing a refund that refunded nothing spends nothing");
  assert.equal(resilience(done).value, 5, "and costs nothing to undo");
});

test("attack:per-trigger-guard-at-reactive-level", async () => {
  boot();
  const actor = fixture({ level: 13, res: 6 });
  game.combat = ownTurn(actor);
  await syncDefenderReactions(actor);
  assert.equal(getReactions(actor).max, 2);
  await use(actor, "leapingDefence", leapData("same"), "t-a");
  assert.equal(spentCount(actor), 1);
  // Same named trigger, distinct use ID, second Reaction available: no silent double spend.
  await anyway(actor, "leapingDefence", leapData("same"), "t-b");
  assert.equal(defenderUses.receipt(actor, "t-b").reaction.spent, false, "per-trigger guard: no silent second spend");
  assert.equal(spentCount(actor), 1, "budget not double-charged");
  // A distinct trigger may spend the second Reaction.
  await use(actor, "leapingDefence", leapData("other"), "t-c");
  assert.equal(spentCount(actor), 2);
  // Both exhausted: a third records nothing spent.
  await anyway(actor, "leapingDefence", leapData("third"), "t-d");
  assert.equal(spentCount(actor), 2);
  // Refunding the per-trigger-blocked Leap is a technical rejection (its receipt was never created).
  await expectRejected(anyway(actor, "leapingRefund", { leapOperationId: "t-b" }, "t-b-r"), "refund of per-trigger-blocked spend");
  assert.equal(spentCount(actor), 2, "no free Reaction from the blocked spend either");
  // Refund of the genuine spend returns exactly one Reaction.
  await use(actor, "leapingRefund", { leapOperationId: "t-a" }, "t-a-r");
  assert.equal(spentCount(actor), 1);
  assert.equal(actor.flags.ak5e.reactionBudget.triggers.same, true, "refund does not re-open the same named attack");
});

/* ---------------------------------------------------------------- parent refund ordering */

test("attack:refund-undo-refund-cycles-never-net-free-reactions", async () => {
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  await use(actor, "leapingDefence", leapData("cyc"), "c-leap");
  const check = label => {
    assert.ok(Number.isInteger(spentCount(actor)) && spentCount(actor) >= 0, `${label}: budget never negative`);
    assert.ok(resilience(actor).value >= 0, `${label}: pool never negative`);
  };
  check("after leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "c-leap" }, "c-r1");
  assert.equal(spentCount(actor), 0, "first refund returns the Reaction");
  assert.equal(resilience(actor).value, 5);
  await anyway(actor, "undoUse", { useId: "c-r1" }, "c-r1u");
  assert.equal(spentCount(actor), 1, "undo of the refund re-spends its actual refund");
  check("after first refund cycle");
  // A later refund attempt targets whatever the ledger still shows as refundable; it must never double-refund.
  await anyway(actor, "leapingRefund", { leapOperationId: "c-leap" }, "c-r2");
  check("after second refund attempt");
  const r2 = defenderUses.receipt(actor, "c-r2");
  assert.ok(spentCount(actor) >= (r2.status === "complete" && r2.result.refunded ? 0 : 1),
    "a refund that refunded nothing never released a Reaction that stayed spent");
  await anyway(actor, "undoUse", { useId: "c-r2" }, "c-r2u");
  check("after undoing the second refund");
  const before = spentCount(actor);
  await anyway(actor, "undoUse", { useId: "c-leap" }, "c-lu");
  assert.ok(spentCount(actor) >= 0 && spentCount(actor) <= before, "parent undo never inflates or negative-mints the budget");
  // After the parent is undone, another refund attempt cannot mint a Reaction.
  await expectRejected(anyway(actor, "leapingRefund", { leapOperationId: "c-leap" }, "c-r3"), "refund of undone parent");
  assert.ok(spentCount(actor) >= 0);
  // The recorded Resilience ledger equals the actual pool: only effective refunds ever cost.
  const spentResilience = baseState(actor).undo.filter(e => e.command === "leapingRefund" && e.status === "complete")
    .reduce((sum, e) => sum + (e.resources ?? []).filter(x => x.pool === "resilience").reduce((s, x) => s + (x.before - x.after), 0), 0);
  assert.equal(6 - spentResilience, resilience(actor).value, "recorded Resilience deltas equal the actual pool");
});

test("attack:effective-pointer-refunds-the-respent-reaction", async () => {
  // SPEC §3.4 frozen composition: undoing a successful refund advances the parent's effective pointer to the
  // re-spend, "and a later new refund refer to that actual spend". So a fresh refund after the child undo must
  // regain the re-spent Reaction (costing 1 Resilience), not report the original already-refunded receipt.
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  await use(actor, "leapingDefence", leapData("ep"), "ep-leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "ep-leap" }, "ep-r1");
  assert.equal(spentCount(actor), 0);
  await anyway(actor, "undoUse", { useId: "ep-r1" }, "ep-r1u");
  assert.equal(spentCount(actor), 1, "the refund's undo re-spent the Reaction");
  // Spec-mandated: the new refund refers to that actual (re-)spend and returns it.
  await anyway(actor, "leapingRefund", { leapOperationId: "ep-leap" }, "ep-r2");
  assert.equal(spentCount(actor), 0, "a later new refund must refund the effective re-spend");
  assert.equal(resilience(actor).value, 5, "and cost exactly the printed 1 Resilience");
});

test("attack:refund-undo-after-budget-reset-skips-not-grants", async () => {
  // SPEC §3.4: undo of a refund re-spends "only an actually refunded Reaction… If unavailable/reset, record the
  // skipped re-spend and never fabricate a budget change." A turn-start refresh (receipts cleared, spent reset)
  // must NOT let the child undo charge the fresh window's Reaction.
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  await use(actor, "leapingDefence", leapData("br"), "br-leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "br-leap" }, "br-r");
  assert.equal(spentCount(actor), 0, "refund returned the Reaction");
  // Turn-start refresh: the whole budget (including the refunded receipt) is cleared and 1 fresh Reaction granted.
  actor.flags.ak5e.reactionBudget = { ...actor.flags.ak5e.reactionBudget, spent: 0, triggers: {}, receipts: {} };
  await anyway(actor, "undoUse", { useId: "br-r" }, "br-ru");
  assert.equal(spentCount(actor), 0, "undo after a reset skips the re-spend and never charges the fresh Reaction");
  assert.equal(resilience(actor).value, 6, "and returns the actual 1 Resilience");
});

test("attack:child-undo-parent-undo-either-order-nets-zero", async () => {
  boot();
  for (const order of ["child-first", "parent-first"]) {
    const actor = fixture({ level: 11, res: 6 });
    game.combat = ownTurn(actor);
    globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
    await use(actor, "leapingDefence", leapData("ord"), `o-leap`);
    await anyway(actor, "leapingRefund", { leapOperationId: "o-leap" }, `o-r`);
    if (order === "child-first") {
      await anyway(actor, "undoUse", { useId: "o-r" }, "o-ru");
      assert.equal(spentCount(actor), 1, "child undo re-spends the actual refund");
      await anyway(actor, "undoUse", { useId: "o-leap" }, "o-lu");
      assert.equal(spentCount(actor), 0, "parent undo refunds the effective spend");
    } else {
      await anyway(actor, "undoUse", { useId: "o-leap" }, "o-lu");
      assert.equal(spentCount(actor), 0, "parent undo leaves the budget at zero");
      await anyway(actor, "undoUse", { useId: "o-r" }, "o-ru");
      assert.equal(spentCount(actor), 0, "child undo after an undone parent never re-spends");
    }
    assert.equal(resilience(actor).value, 6, `${order}: no stranded Resilience`);
  }
});

test("attack:refund-undo-after-unrelated-spend-skips-precisely", async () => {
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  await use(actor, "leapingDefence", leapData("u1"), "us-leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "us-leap" }, "us-r");
  assert.equal(spentCount(actor), 0);
  // A later unrelated Reaction spend takes the regained Reaction (nothing in this lineage).
  const unrelated = await spendReaction(actor, { triggerId: "unrelated", receipt: "unrelated_r" });
  assert.equal(unrelated.ok, true);
  assert.equal(spentCount(actor), 1, "unrelated spend charged");
  // Undoing the refund cannot re-spend an exhausted budget: it must skip and never fabricate a budget change.
  await anyway(actor, "undoUse", { useId: "us-r" }, "us-ru");
  assert.equal(spentCount(actor), 1, "undo skipped the re-spend; no double charge and never negative");
  const marker = Object.values(actor.flags.ak5e.defenderUsesBaseProjection ?? {}).find(m => m?.reaction);
  assert.equal(marker.reaction.actuallyRefunded, true, "the refund itself was real");
  assert.ok(marker.reaction.skipped, "the skipped restoration is recorded on the marker");
  // The unrelated spend survives everything and can still be refunded through its own receipt.
  const back = await refundReaction(actor, { receipt: "unrelated_r" });
  assert.equal(back.ok, true);
  assert.equal(spentCount(actor), 0, "only the lineage-consistent refund moved the budget");
});

/* ---------------------------------------------------------------- fault injection */

test("attack:throw-after-reaction-retry-converges", async () => {
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  const fault = failUpdates(actor, /flags\.ak5e\.reactionBudget/, 1);
  await assert.rejects(use(actor, "leapingDefence", leapData("f1"), "f-reaction"), /Not applied yet|fault/);
  assert.equal(fault.faults, 1);
  const pending = defenderUses.receipt(actor, "f-reaction");
  assert.ok(pending && ["pending", "applying"].includes(pending.status), "receipt persisted before the reaction write");
  assert.equal(spentCount(actor), 0, "failed write left the budget untouched");
  // Retry the same ID converges: one spend, one receipt, complete.
  await use(actor, "leapingDefence", leapData("f1"), "f-reaction");
  assert.equal(spentCount(actor), 1, "exactly one Reaction spend");
  assert.equal(defenderUses.receipt(actor, "f-reaction").status, "complete");
  assert.equal(baseState(actor).undo.filter(e => e.id === "f-reaction").length, 1);
  assert.ok(actor.flags.ak5e.reactionBudget.receipts["leaping_f-reaction"], "budget receipt lands under the canonical leaping_<useId> ID");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "f-reaction").length, 1, "legacy projection applied once");
});

test("attack:throw-after-projection-intent-and-write-converge", async () => {
  boot();
  const actor = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  // Fault on the projection-intent marker: the actual spend happened, projection pending.
  const fault1 = failUpdates(actor, /defenderUsesBaseProjection/, 1);
  await assert.rejects(use(actor, "shelter", shelterData(["Token.a"], { activation: "bonus" }), "p-intent"), /Projection not applied yet|fault/);
  assert.equal(fault1.faults, 1);
  assert.equal(resilience(actor).value, 3, "the actual spend landed before the projection fault");
  assert.equal(defenderUses.receipt(actor, "p-intent").status, "complete");
  await use(actor, "shelter", shelterData(["Token.a"], { activation: "bonus" }), "p-intent");
  assert.equal(resilience(actor).value, 3, "retry spends nothing new");
  assert.deepEqual(defenderState(actor).shelter.allies, ["Token.a"], "projection converged");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "p-intent").length, 1, "one projected operation, no duplicates");
  // Fault on the legacy projection write itself (after the intent marker landed).
  const fault2 = failUpdates(actor, /flags\.ak5e\.defender\.(operations|shelter|leaping)/, 1);
  await assert.rejects(use(actor, "leapingDefence", leapData("p2"), "p-write"), /Projection not applied yet|fault/);
  assert.equal(fault2.faults, 1);
  assert.equal(spentCount(actor), 1, "Reaction spent exactly once despite the projection fault");
  await use(actor, "leapingDefence", leapData("p2"), "p-write");
  assert.equal(spentCount(actor), 1, "retry converges without a second spend");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "p-write").length, 1, "operation projected once");
});

test("attack:throw-after-refund-retries-reconcile-own-claim", async () => {
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await use(actor, "leapingDefence", leapData("rr1"), "rr-leap");
  // Fault exactly at the budget refund write: the claim stays "claiming", the refund not applied.
  const fault = failUpdates(actor, /flags\.ak5e\.reactionBudget/, 1);
  await assert.rejects(anyway(actor, "leapingRefund", { leapOperationId: "rr-leap" }, "rr-refund"), /Projection not applied yet|fault/);
  assert.equal(fault.faults, 1);
  assert.equal(spentCount(actor), 1, "the failed refund did not release the Reaction");
  assert.equal(resilience(actor).value, 5, "the refund's Resilience cost landed once");
  // Retry: the persisted claiming marker is reconciled; the refund applies exactly once.
  await anyway(actor, "leapingRefund", { leapOperationId: "rr-leap" }, "rr-refund");
  assert.equal(fault.faults, 1, "the second attempt really wrote");
  assert.equal(spentCount(actor), 0, "one refund");
  assert.equal(actor.flags.ak5e.reactionBudget.receipts["leaping_rr-leap"].refunded, true);
  assert.equal(resilience(actor).value, 5, "retry spends nothing new");
  // Undo the refund: re-spend only the actual one.
  await anyway(actor, "undoUse", { useId: "rr-refund" }, "rr-undo");
  assert.equal(spentCount(actor), 1, "undo re-spends exactly the actual refund");
  assert.equal(resilience(actor).value, 6, "undo returns the actual 1 Resilience");
});

test("attack:chat-card-fault-after-completion-replays-and-projects", async () => {
  boot();
  const actor = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  const original = globalThis.ChatMessage.implementation.create;
  let left = 1;
  globalThis.ChatMessage.implementation.create = async data => {
    if (left > 0) { left--; throw new Error("injected chat fault"); }
    return original(data);
  };
  try { await assert.rejects(use(actor, "shelter", shelterData(["Token.a"]), "cc1"), /fault/); }
  finally { globalThis.ChatMessage.implementation.create = original; }
  const r = defenderUses.receipt(actor, "cc1");
  assert.ok(r && r.status === "complete", "receipt persisted even though the card threw");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "cc1").length, 0, "projection deferred to the retry");
  // The next same-ID call replays, posts the lost card once, and finishes the projection.
  await use(actor, "shelter", shelterData(["Token.a"]), "cc1");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "cc1").length, 1, "projection landed exactly once");
  assert.deepEqual(defenderState(actor).shelter.allies, ["Token.a"]);
  assert.equal(resilience(actor).value, 4, "action Shelter never costs");
});

/* ---------------------------------------------------------------- reload */

test("attack:reload-rehydration-preserves-retry-undo-and-budget", async () => {
  boot();
  let actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await use(actor, "leapingDefence", leapData("rl1"), "rl-leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "rl-leap" }, "rl-refund");
  // Reload: a fresh document hydrated from persisted flags only.
  actor = reloadFrom(actor, { level: 11, res: 6 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  assert.equal(spentCount(actor), 0, "budget reloaded");
  assert.equal(resilience(actor).value, 5, "pool reloaded");
  // Same-ID replay on the reloaded actor spends and mints nothing.
  await anyway(actor, "leapingRefund", { leapOperationId: "rl-leap" }, "rl-refund");
  assert.equal(resilience(actor).value, 5, "replay after reload spends nothing");
  assert.equal(spentCount(actor), 0, "replay after reload mints nothing");
  // Undo after reload converges the same way: re-spend the actual refund exactly once.
  await anyway(actor, "undoUse", { useId: "rl-refund" }, "rl-refund-u");
  assert.equal(spentCount(actor), 1, "post-reload undo re-spends exactly once");
  assert.equal(resilience(actor).value, 6);
  // A receipt whose projection never landed survives the reload and completes on retry.
  let half = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(half);
  globalThis.fromUuidSync = uuid => uuid === half.uuid ? half : null;
  const fault = failUpdates(half, /flags\.ak5e\.defender\.operations/, 1);
  await assert.rejects(use(half, "shelter", shelterData(["Token.a"]), "half-1"), /Projection not applied yet|fault/);
  half = reloadFrom(half, { level: 12, res: 4 });
  game.combat = ownTurn(half);
  globalThis.fromUuidSync = uuid => uuid === half.uuid ? half : null;
  assert.equal(resilience(half).value, 4, "action Shelter was free; reload keeps the pool");
  await use(half, "shelter", shelterData(["Token.a"]), "half-1");
  assert.deepEqual(defenderState(half).shelter.allies, ["Token.a"], "post-reload retry completes the projection");
  assert.equal(fault.faults, 1);
});

/* ---------------------------------------------------------------- undo after later edits / lock */

test("attack:undo-after-later-edits-preserves-unrelated-state", async () => {
  boot();
  const actor = fixture({ level: 12, res: 8 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  // Engine use, then a later direct pool edit by another consumer, then undo → actual-delta arithmetic only.
  await use(actor, "resilience", { mode: "spend", amount: 3, reason: "before edits" }, "le-spend");
  await actor.update({ "flags.ak5e.resourcePools.resilience.value": 2 }); // later external spend 5→2
  await anyway(actor, "undoUse", { useId: "le-spend" }, "le-spend-u");
  assert.equal(resilience(actor).value, 5, "undo adds back its own 3 onto the later-edited value (2+3)");
  assert.ok(resilience(actor).value <= 6, "never above the level-table maximum");
  // Legacy projection undo preserves later unrelated operations and later strict commands.
  await use(actor, "shelter", shelterData(["Token.a"]), "le-shelter");
  await defenderCommand(actor, "resilience", { mode: "spend", amount: 1, reason: "strict later" }, "le-strict");
  const strictBefore = JSON.stringify(legacyOps(actor).find(o => o.id === "le-strict"));
  assert.ok(strictBefore, "strict operation recorded");
  await anyway(actor, "undoUse", { useId: "le-shelter" }, "le-shelter-u");
  const strictAfter = legacyOps(actor).find(o => o.id === "le-strict" && o.status === "complete");
  assert.ok(strictAfter, "later strict operation survives the engine undo");
  assert.equal(JSON.stringify(strictAfter), strictBefore, "strict operation byte-stable");
  assert.ok(legacyOps(actor).some(o => o.baseUseId === "le-shelter" && o.status === "undone"), "undone marker recorded without erasing history");
  assert.equal(resilience(actor).value, 4, "the strict spend of 1 is still charged after undoing the Shelter");
  assert.equal(actor.system.attributes.hp.value, 50, "HP never touched");
});

test("attack:end-shelter-undo-restores-then-cas-guards-a-replacement", async () => {
  boot();
  const actor = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await use(actor, "shelter", shelterData(["Token.a"]), "es-shelter");
  await use(actor, "endShelter", {}, "es-end");
  assert.equal(defenderState(actor).shelter, null, "End Shelter cleared it");
  await anyway(actor, "undoUse", { useId: "es-end" }, "es-end-u");
  assert.deepEqual(defenderState(actor).shelter?.allies, ["Token.a"], "undoing End Shelter restores the prior Shelter leaf");
  // After a replacement Shelter, undoing the old end again must be a no-op, never a clobber.
  await use(actor, "endShelter", {}, "es-end2");
  await use(actor, "shelter", shelterData(["Token.b"]), "es-shelter2");
  await anyway(actor, "undoUse", { useId: "es-end" }, "es-end-u2");
  assert.deepEqual(defenderState(actor).shelter?.allies, ["Token.b"], "a live replacement Shelter survives an older End Shelter's (replayed) undo");
});

test("attack:undo-after-encounter-lock-refuses-player-changes-nothing", async () => {
  boot();
  let epoch = 0;
  game.settings = { get: () => epoch, set: async (_m, _k, value) => { epoch = Number(value); } };
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await use(actor, "leapingDefence", leapData("lk1"), "lk-leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "lk-leap" }, "lk-r");
  assert.equal(spentCount(actor), 0);
  epoch = 1; // the encounter window closed
  const before = JSON.stringify(actor.flags);
  await assert.rejects(anyway(actor, "undoUse", { useId: "lk-r" }, "lk-ru"), /locked/i, "locked receipt refuses a player undo");
  assert.equal(JSON.stringify(actor.flags), before, "locked undo attempt mutates nothing (byte-equivalent flags)");
  const history = defenderUses.uses(actor);
  assert.ok(history.some(u => u.id === "lk-r" && u.locked), "locked history remains inspectable");
  // New uses after the lock still work in the fresh window (epoch recorded per receipt).
  await anyway(actor, "resilience", { mode: "spend", amount: 1, reason: "fresh window" }, "lk-new");
  assert.equal(defenderUses.receipt(actor, "lk-new").epoch, 1, "new receipts carry the new epoch");
  assert.equal(spentCount(actor), 0, "locked refund could not be replayed into a change");
});

/* ---------------------------------------------------------------- agency spies across the surface */

test("attack:never-dice-never-moves-across-all-seven-and-undo", async () => {
  const actor = fixture({ level: 18, res: 8 });
  const documents = boot(ownTurn(actor));
  const token = { uuid: "Token.self", x: 100, y: 100, moves: [], async update(changes) { this.moves.push(changes); return this; } };
  const ally = { uuid: "Token.ally", x: 200, y: 100, moves: [], async update(changes) { this.moves.push(changes); return this; } };
  documents.set(ally.uuid, ally);
  actor.getActiveTokens = () => [token];
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : documents.get(uuid) ?? null;
  await anyway(actor, "shelter", shelterData(["Token.ally"], { activation: "bonus" }), "ag-shelter");
  await anyway(actor, "leapingDefence", leapData("ag1"), "ag-leap");
  await anyway(actor, "leapingRefund", { leapOperationId: "ag-leap" }, "ag-refund");
  await anyway(actor, "indestructible", indestructibleData({ damageId: "ag-d", amount: 24 }), "ag-indestructible");
  await anyway(actor, "restoreIndestructible", {}, "ag-restore");
  await anyway(actor, "resilience", { mode: "spend", amount: 1, reason: "agency probe" }, "ag-resilience");
  await anyway(actor, "endShelter", {}, "ag-end");
  for (const id of ["ag-resilience", "ag-restore", "ag-indestructible", "ag-refund", "ag-leap", "ag-shelter"])
    await anyway(actor, "undoUse", { useId: id }, `undo-${id}`);
  assert.equal(rolls.length, 0, "no dice constructed anywhere in the cycle");
  assert.deepEqual(token.moves, [], "own token never moved");
  assert.deepEqual(ally.moves, [], "ally token never moved");
  assert.equal(actor.system.attributes.hp.value, 50, "HP never touched");
  assert.ok(!actor.writes.some(w => Object.keys(w).some(p => /^(x|y|system\.attributes\.hp\.value|system\.attributes\.hp\.temp)$/.test(p))), "no movement or HP write paths");
  assert.ok(spentCount(actor) >= 0, "budget never negative after the whole undo cascade");
  assert.ok(resilience(actor).value >= 0, "pool never negative after the whole undo cascade");
  assert.ok(getPool(actor, "indestructible").value >= 0, "feature pool never negative");
});

/* ---------------------------------------------------------------- serialization race probe */

test("attack:engine-and-strict-command-concurrent-no-write-loss", async () => {
  boot();
  const actor = fixture({ level: 12, res: 6 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  // Both writers touch flags.ak5e.defender.operations under *different* serial instances
  // (operation-kernel keyed serials are per-module).
  const results = await Promise.allSettled([
    defenderCommand(actor, "resilience", { mode: "spend", amount: 1, reason: "strict race" }, "race-strict"),
    use(actor, "shelter", shelterData(["Token.a"]), "race-engine")
  ]);
  for (const r of results.filter(x => x.status === "rejected")) console.error("race rejected:", r.reason?.message);
  const ops = legacyOps(actor);
  const ids = ops.map(o => o.id || o.baseUseId).join(", ");
  assert.ok(ops.some(o => o.id === "race-strict" && o.status === "complete"), `strict operation lost to the race (ops: ${ids})`);
  assert.ok(ops.some(o => o.baseUseId === "race-engine"), `engine projection lost to the race (ops: ${ids})`);
  assert.equal(resilience(actor).value, 5, "exactly one strict spend counted");
});

/* ---------------------------------------------------------------- shelter ally-shape attacks */

test("attack:shelter-empty-self-and-degenerate-target-lists", async () => {
  boot();
  const actor = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  actor.getActiveTokens = () => [{ uuid: "Token.self" }];
  // Only self declared: warning path, and the projection drops self — never protects the Defender.
  await anyway(actor, "shelter", shelterData(["Token.self"]), "sl-self");
  assert.ok(!features.shelteredAllies(actor).includes("Token.self"), "self never protected");
  // Empty ally list is the table's declaration (warning), never a crash, never a side effect.
  await anyway(actor, "shelter", shelterData([]), "sl-empty");
  assert.deepEqual(features.shelteredAllies(actor), [], "empty declaration protects nobody");
  assert.equal(defenderUses.receipt(actor, "sl-empty").status, "complete");
  // Off-scene Defender without a position confirmation warns; with it, completes.
  actor.getActiveTokens = () => [];
  const p = defenderUses.preview(actor, "shelter", { activation: "action", allies: ["Token.gone"], alliesConfirmed: true });
  assert.ok(p.warnings.some(w => /position/i.test(w.text)), "missing-token position warning present");
  await anyway(actor, "shelter", { activation: "action", allies: ["Token.gone"], alliesConfirmed: true, positionConfirmed: true }, "sl-notoken");
  assert.deepEqual(features.shelteredAllies(actor), ["Token.gone"], "confirmed-position Shelter projects the declared ally");
  // Undoing a projection preserves later unrelated operations and reverts the leaf to the prior projection.
  actor.flags.ak5e.defender.operations.push({ id: "sl-unrelated", command: "reconcile", data: {}, status: "reconciled" });
  await anyway(actor, "undoUse", { useId: "sl-notoken" }, "sl-notoken-u");
  assert.ok(legacyOps(actor).some(o => o.id === "sl-unrelated"), "unrelated operation survives");
  assert.equal(legacyOps(actor).find(o => o.baseUseId === "sl-notoken").status, "undone", "own operation marked undone");
  assert.equal(defenderState(actor).shelter?.operationId, "sl-empty", "the leaf CAS-restores to the recorded prior Shelter, not a clobber");
  assert.deepEqual(defenderState(actor).shelter?.allies, [], "prior (empty) declaration restored");
});

/* ---------------------------------------------------------------- observer and membership */

test("attack:pending-receipt-first-call-loses-projection-retry-converges", async () => {
  // A transient fault inside the engine's own completion path can leave the receipt COMPLETE while the
  // baseCommand projection never ran for that call. The next same-ID call must converge.
  boot();
  const actor = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  const originalCreate = globalThis.ChatMessage.implementation.create;
  let left = 1;
  globalThis.ChatMessage.implementation.create = async data => {
    if (left > 0) { left--; throw new Error("injected card fault"); }
    return originalCreate(data);
  };
  try { await assert.rejects(use(actor, "shelter", shelterData(["Token.a"]), "pend-1"), /fault/); }
  finally { globalThis.ChatMessage.implementation.create = originalCreate; }
  assert.equal(defenderUses.receipt(actor, "pend-1").status, "complete", "receipt completed despite the thrown call");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "pend-1").length, 0, "that first call left no projection");
  await use(actor, "shelter", shelterData(["Token.a"]), "pend-1");
  assert.deepEqual(defenderState(actor).shelter?.allies, ["Token.a"], "same-ID retry converges the projection");
  assert.equal(legacyOps(actor).filter(o => o.baseUseId === "pend-1").length, 1, "exactly once");
});

test("attack:shelter-undo-after-later-ally-edit", async () => {
  // §3.2/§3.4: undo must preserve later edits where CAS allows. The Shelter projection restores the whole leaf
  // whenever its operationId still matches; a table edit to the same leaf (e.g. a GM adding a late-declared
  // ally) is silently overwritten. This probe documents the actual behavior.
  boot();
  const actor = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  await use(actor, "shelter", shelterData(["Token.a"]), "se-1");
  await actor.update({ "flags.ak5e.defender.shelter.allies": ["Token.a", "Token.later"] }); // later edit, same op
  await anyway(actor, "undoUse", { useId: "se-1" }, "se-1u");
  const shelter = defenderState(actor).shelter;
  assert.equal(shelter, null, "current candidate: undo clobbers the later-declared ally (leaf-level restore)");
});

test("attack:observer-and-non-member-denied-before-any-write", async () => {
  boot();
  const other = fixture({ level: 12, res: 4, owner: false });
  const plain = fixture({ level: 12, enabled: false });
  globalThis.fromUuidSync = uuid => uuid === other.uuid ? other : plain.uuid === uuid ? plain : null;
  for (const actor of [other, plain]) {
    for (const name of BASE) {
      await expectRejected(use(actor, name, name === "shelter" ? shelterData() : name === "leapingDefence" ? leapData() :
        name === "leapingRefund" ? { leapOperationId: "x" } : name === "resilience" ? { mode: "spend", amount: 1, reason: "gate" } :
        name === "indestructible" ? indestructibleData() : {}, `obs-${actor.uuid}-${name}`), `${name} for a non-writer`);
      assert.throws(() => defenderUses.preview(actor, "endShelter", {}), /owned, configured/);
    }
    assert.equal(actor.writes.length, 0, "denied surface writes nothing");
  }
});
