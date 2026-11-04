/**
 * WP defender-base-03 — frozen red-first tests (tester: adversary, 2026-11-03).
 *
 * Spec: .codex-work/defender-base-replan/SPEC-defender-base-replan.md §5 WP-03 (14 ACs) + §3.4 frozen contracts.
 * Sources: C3:943–965,986–994,1028–1048; C1:207–212; WORKFLOW §3.2; DECISIONS 1220–1230, 1407–1410; B-094/B-086 Defender slices.
 * Black-box only: tests drive the public `defenderUses` engine API and the existing strict `defenderCommand`
 * regression guards. New exports (`projectDefenderBaseUse`) are checked through the namespace import before
 * invocation so this file loads cleanly against the unchanged tree. Tests that require the seven registered
 * base plans are expected RED vs unchanged code; strict-API/lifecycle guards are expected GREEN both before
 * and after implementation.
 *
 * Criterion map (AC → test title below):
 *  03.1 → base-public-plans-confirm ; strict-api-unchanged (GREEN guard)
 *  03.2 → warnings-use-anyway-owned
 *  03.3 → shelter-engine-state-expiry
 *  03.4 → pool-actual-delta-undo
 *  03.5 → leap-exact-reaction-guided
 *  03.6 → leap-refund-parent-reset
 *  03.7 → stand-behind-manual-only
 *  03.8 → indestructible-one-instance-zero
 *  03.9 → restore-warning-actual-cost
 *  03.10 → base-fingerprint-reload-faults
 *  03.11 → base-validator-cas-refund-undo
 *  03.12 → new-parent-existing-consumers
 *  03.13 → lifecycle-adamantine-regression
 *  03.14 → base-public-card-history
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as features from "../scripts/defender-features.mjs";
import {
  defenderCommand, registerDefenderHooks, defenderTurnEvent, defenderRest, syncDefenderReactions,
  adamantineNotice, resilience, shelteredAllies
} from "../scripts/defender-features.mjs";
import { defenderUses } from "../scripts/defender-uses.mjs";
import { getPool, getPoolDefinition } from "../scripts/resource-pools.mjs";
import { fixture, world } from "./defender-fixture.mjs";

const BASE = ["shelter", "endShelter", "leapingDefence", "leapingRefund", "indestructible", "restoreIndestructible", "resilience"];

const ownTurn = (actor, uuid = "Combat.c1") => ({ started: true, uuid, round: 1, turn: 0, combatant: { id: "m1", actor: { uuid: actor.uuid } } });
const otherTurn = () => ({ started: true, uuid: "Combat.c1", round: 1, turn: 1, combatant: { id: "m2", actor: { uuid: "Actor.other" } } });

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
const receiptText = (actor, id, result) => JSON.stringify({ result, receipt: defenderUses.receipt(actor, id) });

/* ---------------------------------------------------------------- 03.1 */

test("base-public-plans-confirm: all seven base commands reach the public .use path with confirmation", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot(ownTurn(actor));
  // Registration seam: every base key is a known engine command (§3.4 exact keys).
  assert.deepEqual(BASE.filter(name => !defenderUses.isCommand(name)), [], "seven base commands registered");
  // Preview is public, pure and write-free.
  const writes = actor.writes.length;
  const p = defenderUses.preview(actor, "shelter", shelterData());
  assert.equal(typeof p.title, "string", "preview has a title");
  assert.ok(Array.isArray(p.warnings) && Array.isArray(p.costs));
  assert.equal(actor.writes.length, writes, "preview writes nothing");
  // Unconfirmed request fails the confirmation gate and leaves no receipt.
  await assert.rejects(defenderUses.command(actor, "shelter", shelterData(), "uc1"), /Confirm/i);
  assert.equal(baseState(actor)?.undo?.length ?? 0, 0, "unconfirmed leaves no receipt");
  assert.equal(resilience(actor).value, 4, "unconfirmed spends nothing");
  // Confirmed use through the public API succeeds and records one receipt.
  const result = await use(actor, "shelter", shelterData(), "ok1");
  assert.ok(result, "confirmed base use returns a result");
  assert.equal(defenderUses.receipt(actor, "ok1").status, "complete");
  // Unknown commands stay technical failures even after base registration.
  await assert.rejects(use(actor, "notACommand", {}, "nc1"), /Unknown/);
});

/* ---------------------------------------------------------------- 03.1 GREEN strict guard */

test("strict-api-unchanged: the direct strict defenderCommand keeps its existing rejection contract", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot(ownTurn(actor));
  await assert.rejects(defenderCommand(actor, "shelter", { activation: "reaction", allies: ["Token.a"], alliesConfirmed: true, positionConfirmed: true }, "st1"), /Bonus Action/);
  await assert.rejects(defenderCommand(fixture({ enabled: false }), "resilience", {}, "st2"), /configured Defender/);
  await assert.rejects(defenderCommand(fixture({ owner: false }), "resilience", {}, "st3"), /configured Defender/);
  await assert.rejects(defenderCommand(fixture(), "bogus", {}, "st4"), /Unknown/);
  const zero = fixture({ level: 12, res: 0 });
  await assert.rejects(defenderCommand(zero, "shelter", shelterData(["Token.a"], { activation: "bonus" }), "st5"), /Not enough/);
  assert.deepEqual(zero.flags.ak5e.defender.operations, [], "strict rejection still leaves no blocking receipt");
  // Base plans must not leak into the strict command registry.
  await assert.rejects(defenderCommand(actor, "engineOnlyProbe", {}, "st6"), /Unknown/);
});

/* ---------------------------------------------------------------- 03.2 */

test("warnings-use-anyway-owned: table conditions warn instead of blocking; identity and data still fail technically", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot(otherTurn()); // not the Defender's turn: B-094 — must warn, not forbid
  const p = defenderUses.preview(actor, "shelter", shelterData());
  assert.ok(p.warnings.length >= 1, "off-turn shelter carries a warning");
  assert.ok(p.warnings.some(w => /turn/i.test(w.text)), "warning names the turn condition");
  const result = await anyway(actor, "shelter", shelterData(), "w1");
  assert.ok(result, "Use-anyway completes the owned off-turn use");
  const r = defenderUses.receipt(actor, "w1");
  assert.equal(r.status, "complete");
  assert.ok(r.overridden.length >= 1, "acknowledged warnings are recorded on the receipt");
  // Under-level Leap is a warning on the base path (strict API intentionally stays rejecting).
  const low = fixture({ level: 5, res: 4 });
  await assert.rejects(defenderCommand(low, "leapingDefence", leapData(), "strict-level"), /level 11/, "strict level gate untouched");
  const lp = defenderUses.preview(low, "leapingDefence", leapData());
  assert.ok(lp.warnings.some(w => /level/i.test(w.text)), "feature-level gate is a visible warning on the base path");
  await anyway(low, "leapingDefence", leapData(), "w2");
  assert.equal(defenderUses.receipt(low, "w2").status, "complete");
  // Ownership and membership remain technical.
  const notMine = fixture({ level: 12, owner: false });
  await assert.rejects(use(notMine, "shelter", shelterData(), "w3"), /owned, configured/);
  // Malformed values remain technical, never a warning prompt.
  try { await anyway(actor, "resilience", { mode: "spend", amount: "3", reason: "string amount" }, "w4"); assert.fail("string amount must throw"); }
  catch (error) { assert.notEqual(error.name, "AK5eWarnings", "malformed input is a technical failure"); }
  try { await anyway(actor, "resilience", { mode: "spend", amount: 1.5, reason: "fraction" }, "w5"); assert.fail("fractional amount must throw"); }
  catch (error) { assert.notEqual(error.name, "AK5eWarnings", "fractional amount is a technical failure"); }
  assert.equal(resilience(actor).value, 4, "technical failures spend nothing");
});

/* ---------------------------------------------------------------- 03.3 */

test("shelter-engine-state-expiry: action free / bonus costs 1, self excluded, expiry and out-of-combat End Shelter", async () => {
  const actor = fixture({ level: 12, res: 4 });
  const documents = boot();
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : documents.get(uuid) ?? null;
  // Action Shelter: no Resilience.
  await use(actor, "shelter", shelterData(["Token.a", "Token.b"]), "sh-act");
  assert.equal(resilience(actor).value, 4, "Action Shelter is free");
  assert.ok(!defenderUses.receipt(actor, "sh-act").resources?.some(e => e.before !== e.after), "no actual resource delta");
  assert.deepEqual(shelteredAllies(actor), ["Token.a", "Token.b"]);
  // Bonus Shelter: exactly 1 Resilience with a before/after receipt entry.
  await use(actor, "shelter", shelterData(["Token.c"], { activation: "bonus" }), "sh-bonus");
  assert.equal(resilience(actor).value, 3);
  const bonus = defenderUses.receipt(actor, "sh-bonus").resources.find(e => e.pool === "resilience");
  assert.ok(bonus && bonus.before === 4 && bonus.after === 3 && bonus.max === 6 && typeof bonus.label === "string", "actual before/after/label accounting");
  // Self is excluded, never protected by its own Shelter.
  actor.getActiveTokens = () => [{ uuid: "Token.self" }];
  let selfOutcome = "completed";
  try { await anyway(actor, "shelter", shelterData(["Token.self", "Token.d"]), "sh-self"); }
  catch (error) { if (/Defender|self|protect/i.test(error.message)) selfOutcome = "rejected"; else throw error; }
  if (selfOutcome === "completed") assert.ok(!shelteredAllies(actor).includes("Token.self") && shelteredAllies(actor).includes("Token.d"), "self excluded, allies kept");
  // Expiry at the Defender's next turn start (existing hook semantics preserved).
  game.combat = { ...ownTurn(actor), round: 2 };
  await defenderTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 2, combatantId: "m1" });
  assert.deepEqual(shelteredAllies(actor), [], "engine Shelter expires like the strict one");
  // End Shelter clears only this Actor's Shelter, including outside combat.
  game.combat = ownTurn(actor);
  const other = fixture({ level: 12, res: 4 });
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : (uuid === other.uuid ? other : documents.get(uuid) ?? null);
  await use(actor, "shelter", shelterData(["Token.e"]), "sh-end-a");
  game.combat = ownTurn(other);
  await use(other, "shelter", shelterData(["Token.f"]), "sh-end-b");
  game.combat = null; // B-086 slice: out of combat, explicit end with no turn gate
  await anyway(actor, "endShelter", {}, "sh-end");
  assert.deepEqual(shelteredAllies(actor), [], "own Shelter cleared outside combat");
  assert.deepEqual(shelteredAllies(other), ["Token.f"], "End Shelter clears only this Actor's Shelter");
});

/* ---------------------------------------------------------------- 03.4 */

test("pool-actual-delta-undo: shortfall clamps at zero, restores clamp at max, undo reverses the actual delta only", async () => {
  boot();
  assert.deepEqual(getPoolDefinition("resilience").max.rows, [[1, 4], [7, 6], [14, 8], [20, 10]], "level-table maxima unchanged");
  assert.equal(getPoolDefinition("resilience").recovery[0].on, "lr", "long-rest recovery unchanged");
  // Acknowledged shortfall clamps at zero and records the ACTUAL cost.
  const low = fixture({ level: 12, res: 1 });
  game.combat = ownTurn(low);
  await anyway(low, "resilience", { mode: "spend", amount: 3, reason: "Table adjustment" }, "pl-clamp");
  assert.equal(resilience(low).value, 0, "clamp at zero, never negative");
  const clamp = defenderUses.receipt(low, "pl-clamp").resources.find(e => e.pool === "resilience");
  assert.ok(clamp.before === 1 && clamp.after === 0, "actual delta 1 recorded, not requested 3");
  // Undo restores only that actual delta.
  await anyway(low, "undoUse", { useId: "pl-clamp" }, "pl-clamp-u");
  assert.equal(resilience(low).value, 1, "undo returns the actual 1, never the requested 3");
  // Refund/restore clamps at the current maximum; later spend survives an earlier undo.
  const mid = fixture({ level: 12, res: 3 });
  game.combat = ownTurn(mid);
  await anyway(mid, "resilience", { mode: "refund", amount: 99, reason: "Table adjustment" }, "pl-max");
  assert.equal(resilience(mid).value, 6, "restore clamps at the current maximum");
  await anyway(mid, "undoUse", { useId: "pl-max" }, "pl-max-u");
  assert.equal(resilience(mid).value, 3, "undo reverses the actual delta");
  const seq = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(seq);
  await use(seq, "resilience", { mode: "spend", amount: 2, reason: "first" }, "pl-a");
  await use(seq, "resilience", { mode: "spend", amount: 1, reason: "second" }, "pl-b");
  await anyway(seq, "undoUse", { useId: "pl-a" }, "pl-a-u");
  assert.equal(resilience(seq).value, 3, "undo of A preserves B's later spend (4−2−1+2)");
  // Rest recovery of untouched pools remains unchanged.
  await defenderRest(seq, "short");
  assert.equal(resilience(seq).value, 3, "short rest does not recover Resilience");
});

/* ---------------------------------------------------------------- 03.5 */

test("leap-exact-reaction-guided: source Reaction against the named Attack, guided text, no move, no rolls, no double-spend", async () => {
  const actor = fixture({ level: 11, res: 6 });
  const documents = boot();
  game.combat = ownTurn(actor);
  const token = { uuid: "Token.self", x: 0, y: 0, moves: [], async update(changes) { this.moves.push(changes); } };
  actor.getActiveTokens = () => [token];
  documents.set(actor.uuid, actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : documents.get(uuid) ?? null;
  const result = await use(actor, "leapingDefence", leapData("atk1"), "lp1");
  const r = defenderUses.receipt(actor, "lp1");
  assert.equal(r.reaction.requested, true);
  assert.equal(r.reaction.spent, true);
  assert.equal(r.reaction.receiptId, "leaping_lp1", "explicit leaping_<useId> receipt ID (§3.4)");
  assert.equal(r.reaction.perTrigger, true);
  assert.equal(spentCount(actor), 1);
  const text = receiptText(actor, "lp1", result).toLowerCase();
  assert.match(text, /unoccupied/);
  assert.match(text, /opportunity attack/i);
  assert.match(text, /hits you regardless of your armour class/);
  assert.deepEqual(token.moves, [], "no forced token movement");
  assert.equal(actor.system.attributes.hp.value, 50, "no HP change");
  assert.equal(rolls.length, 0, "no dice evaluated");
  // Same named trigger cannot silently spend another Reaction even with two available (level 13 Reactive).
  const twin = fixture({ level: 13, res: 6 });
  game.combat = ownTurn(twin);
  globalThis.fromUuidSync = uuid => uuid === twin.uuid ? twin : documents.get(uuid) ?? null;
  await syncDefenderReactions(twin); // max 2
  await use(twin, "leapingDefence", leapData("sameAtk"), "lp2");
  assert.equal(spentCount(twin), 1);
  try { await anyway(twin, "leapingDefence", leapData("sameAtk"), "lp3"); }
  catch { /* a rejection is fine */ }
  assert.equal(spentCount(twin), 1, "per-trigger guard: no silent second spend for the same trigger");
  assert.notEqual(defenderUses.receipt(twin, "lp3")?.reaction?.spent, true, "if a receipt exists it did not spend a Reaction");
  // A different trigger may spend the second Reaction.
  await use(twin, "leapingDefence", leapData("otherAtk"), "lp4");
  assert.equal(spentCount(twin), 2);
});

/* ---------------------------------------------------------------- 03.6 */

test("leap-refund-parent-reset: exact-parent refund only, legacy parents work, replay/reset never mint Reactions", async () => {
  boot();
  const actor = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(actor);
  await use(actor, "leapingDefence", leapData(), "fr1");
  assert.equal(spentCount(actor), 1);
  await use(actor, "leapingRefund", { leapOperationId: "fr1" }, "fr1-r");
  assert.equal(resilience(actor).value, 5, "the refund costs exactly 1 Resilience");
  assert.equal(spentCount(actor), 0, "the parent Reaction was regained");
  assert.equal(actor.flags.ak5e.reactionBudget.receipts["leaping_fr1"].refunded, true, "exact receipt refunded");
  // Same refund ID + same data replays without a second cost.
  await use(actor, "leapingRefund", { leapOperationId: "fr1" }, "fr1-r");
  assert.equal(resilience(actor).value, 5, "replay spends nothing");
  // A later repeated attempt with a different ID gives no extra refund and no second cost.
  try { await anyway(actor, "leapingRefund", { leapOperationId: "fr1" }, "fr1-r2"); }
  catch { /* rejection also acceptable; numbers below are the contract */ }
  assert.equal(resilience(actor).value, 5, "no second Resilience cost");
  assert.equal(spentCount(actor), 0, "no extra Reaction minted");
  assert.equal(actor.flags.ak5e.reactionBudget.receipts["leaping_fr1"].refunded, true);
  // Missing parent is a technical identity failure.
  await assert.rejects(anyway(actor, "leapingRefund", { leapOperationId: "never-existed" }, "fr-ghost"), /(parent|leap|unknown|no )/i);
  assert.equal(resilience(actor).value, 5);
  // A reset budget (turn-start refresh) cannot be refunded into a free Reaction.
  const reset = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(reset);
  await use(reset, "leapingDefence", leapData("z1"), "fr2");
  reset.flags.ak5e.reactionBudget = { ...reset.flags.ak5e.reactionBudget, spent: 0, triggers: {}, receipts: {} };
  try { await anyway(reset, "leapingRefund", { leapOperationId: "fr2" }, "fr2-r"); }
  catch { /* strict-style rejection is acceptable too */ }
  assert.ok(spentCount(reset) >= 0, "never a negative pool");
  assert.ok(!reset.flags.ak5e.reactionBudget?.receipts?.["leaping_fr2"], "reset receipt was not re-created/refunded");
  // An existing legacy (strict-command) parent is refundable through the base path, and the legacy view agrees.
  const legacy = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(legacy);
  await defenderCommand(legacy, "leapingDefence", leapData("l1"), "lg1");
  assert.equal(spentCount(legacy), 1);
  await anyway(legacy, "leapingRefund", { leapOperationId: "lg1" }, "lg1-r");
  assert.equal(spentCount(legacy), 0, "engine refund released the legacy parent Reaction");
  assert.equal(resilience(legacy).value, 5);
  await assert.rejects(defenderCommand(legacy, "leapingRefund", { leapOperationId: "lg1" }, "lg1-strict2"), /already regained/, "legacy view of the refund is shared");
});

/* ---------------------------------------------------------------- 03.7 */

test("stand-behind-manual-only: follow-through instruction only at level 17+, nothing moves, no ally action spent", async () => {
  const documents = boot();
  const allyToken = { uuid: "Token.ally", x: 300, y: 0, updates: [], async update(changes) { this.updates.push(changes); } };
  documents.set(allyToken.uuid, allyToken);
  const at = actor => { game.combat = ownTurn(actor); globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : documents.get(uuid) ?? null; return actor; };
  const sixteen = fixture({ level: 16, res: 6 });
  const r16 = await use(at(sixteen), "leapingDefence", leapData("s16"), "sb16");
  assert.doesNotMatch(receiptText(sixteen, "sb16", r16), /Stand Behind Me/);
  const seventeen = fixture({ level: 17, res: 6 });
  const r17 = await use(at(seventeen), "leapingDefence", leapData("s17"), "sb17");
  const t17 = receiptText(seventeen, "sb17", r17);
  assert.match(t17, /Stand Behind Me/);
  assert.match(t17, /15 f(eet|t)/i);
  assert.match(t17.toLowerCase(), /does not provoke|no opportunity attack/, "no-OA guidance present");
  assert.deepEqual(allyToken.updates, [], "the ally is never moved automatically");
  assert.equal(rolls.length, 0);
  // Strict legacy guard untouched.
  const strict16 = await defenderCommand(fixture({ level: 16, res: 6 }), "leapingDefence", leapData("x"), "ss16");
  assert.ok(!strict16.instructions.some(i => /Stand Behind Me/.test(i)), "strict level guard unchanged");
});

/* ---------------------------------------------------------------- 03.8 */

test("indestructible-one-instance-zero: pool + Reaction once per Short Rest, doubles supplied DR, zero DR stays zero, no HP", async () => {
  const actor = fixture({ level: 18, res: 8 });
  boot(ownTurn(actor));
  const data = { damageId: "d1", hostileConfirmed: true, reduction: 3, amount: 20, type: "slashing" };
  const p = defenderUses.preview(actor, "indestructible", data);
  assert.equal(typeof p.title, "string", "guided preview exists");
  const result = await use(actor, "indestructible", data, "in1");
  const r = defenderUses.receipt(actor, "in1");
  assert.equal(r.reaction.requested, true);
  assert.equal(r.reaction.spent, true);
  assert.equal(spentCount(actor), 1);
  const pool = r.resources.find(e => e.pool === "indestructible");
  assert.ok(pool.before === 1 && pool.after === 0 && pool.max === 1, "existing once-per-Short-Rest pool consumed");
  assert.equal(getPool(actor, "indestructible").value, 0);
  // Parity with the strict path's published value (dynamic golden).
  const gold = await defenderCommand(fixture({ level: 18, res: 8 }), "indestructible", data, "g-in");
  assert.equal(gold.doubledReduction, 6);
  assert.equal(result.doubledReduction ?? JSON.parse(JSON.stringify(r)).result.doubledReduction, gold.doubledReduction, "doubles the supplied DR for the single named instance");
  assert.equal(actor.system.attributes.hp.value, 50, "no HP applied");
  assert.equal(rolls.length, 0, "no damage dice");
  // Zero DR stays zero — doubling changes nothing.
  const zero = fixture({ level: 18, res: 8 });
  const zr = await use(zero, "indestructible", { damageId: "z1", hostileConfirmed: true, reduction: 0 }, "in0");
  assert.equal((zr?.doubledReduction ?? JSON.parse(receiptText(zero, "in0", zr)).result.doubledReduction), 0);
  assert.match(receiptText(zero, "in0", zr), /changes nothing/i);
  assert.equal(zero.system.attributes.hp.value, 50, "zero DR grants nothing");
});

/* ---------------------------------------------------------------- 03.9 */

test("restore-warning-actual-cost: printed Resilience cost, off-turn/already-available warn not block, no extra maximum uses", async () => {
  const actor = fixture({ level: 18, res: 8 });
  boot(ownTurn(actor));
  await use(actor, "indestructible", { damageId: "d1", hostileConfirmed: true, reduction: 2 }, "rs-use");
  game.combat = otherTurn();
  const p = defenderUses.preview(actor, "restoreIndestructible", {});
  assert.ok(p.warnings.some(w => /turn/i.test(w.text)), "out-of-turn restore warns");
  await anyway(actor, "restoreIndestructible", {}, "rs1");
  assert.equal(resilience(actor).value, 6, "printed cost is 2 Resilience");
  assert.equal(getPool(actor, "indestructible").value, 1);
  assert.ok(defenderUses.receipt(actor, "rs1").overridden.length >= 1, "acknowledgment recorded");
  const restore = defenderUses.receipt(actor, "rs1").resources.find(e => e.pool === "indestructible");
  assert.ok(restore && restore.before === 0 && restore.after === 1 && restore.max === 1, "restore recorded as an actual pool delta");
  // Already available: warn, and acknowledging cannot grant extra uses.
  const again = defenderUses.preview(actor, "restoreIndestructible", {});
  assert.ok(again.warnings.length >= 1, "already-available restore warns");
  await anyway(actor, "restoreIndestructible", {}, "rs2");
  assert.equal(getPool(actor, "indestructible").value, 1, "pool availability never exceeds normal maximum");
  assert.equal(getPool(actor, "indestructible").max, 1);
  // Shortfall: acknowledged restore clamps Resilience at zero and still restores exactly one use.
  const poor = fixture({ level: 18, res: 1 });
  await anyway(poor, "indestructible", { damageId: "d2", hostileConfirmed: true, reduction: 1 }, "rs-use2");
  await anyway(poor, "restoreIndestructible", {}, "rs3");
  assert.equal(resilience(poor).value, 0, "cost clamps at zero, never negative");
  assert.equal(getPool(poor, "indestructible").value, 1);
});

/* ---------------------------------------------------------------- 03.10 */

test("base-fingerprint-reload-faults: receipts persist, concurrent same-ID spends once, changed immutable data rejects", async () => {
  const actor = fixture({ level: 12, res: 4 });
  boot();
  game.combat = ownTurn(actor);
  const data = shelterData(["Token.a", "Token.b"], { activation: "bonus" });
  // Concurrent identical requests serialize to one spend and one receipt.
  const [a, b] = await Promise.all([use(actor, "shelter", data, "fp1"), use(actor, "shelter", data, "fp1")]);
  assert.deepEqual(a, b, "both callers converge on the same result");
  assert.equal(resilience(actor).value, 3, "one actual spend, not two");
  assert.equal(baseState(actor).undo.filter(e => e.id === "fp1").length, 1);
  // Same ID + same immutable data replays without new writes.
  const writes = actor.writes.length;
  const replay = await use(actor, "shelter", data, "fp1");
  assert.deepEqual(replay, a);
  assert.equal(resilience(actor).value, 3, "replay spends nothing");
  // Same ID + changed immutable choices rejects at the base boundary (before any fast path).
  await assert.rejects(use(actor, "shelter", shelterData(["Token.c"], { activation: "bonus" }), "fp1"));
  assert.equal(resilience(actor).value, 3, "rejected changed input spends nothing");
  // Receipt and projection intent persist in Actor flags: a reload re-reads them (uses/receipt read from flags).
  const persisted = JSON.parse(JSON.stringify(baseState(actor).undo.find(e => e.id === "fp1")));
  assert.equal(persisted.status, "complete");
  assert.equal(typeof persisted.epoch, "number", "epoch metadata persisted");
  assert.ok(Array.isArray(persisted.targets) && persisted.targets.length >= 1, "projection intent persisted");
  assert.ok(Array.isArray(persisted.resources) && persisted.resources.every(e => typeof e.before === "number" && typeof e.after === "number"));
});

/* ---------------------------------------------------------------- 03.11 */

test("base-validator-cas-refund-undo: local projection intents validated both ways, no other-Actor writes, refund undo nets zero", async () => {
  const actor = fixture({ level: 12, res: 4 });
  const documents = boot();
  game.combat = ownTurn(actor);
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : documents.get(uuid) ?? null;
  await use(actor, "shelter", shelterData(["Token.a"]), "v-sh");
  const r = defenderUses.receipt(actor, "v-sh");
  assert.ok(r.targets.length >= 1, "Shelter records a projection intent");
  for (const entry of r.targets) {
    assert.equal(entry.kind, "defenderBaseProjection", "source-local projection kind");
    assert.equal(entry.uuid, actor.uuid, "projection is bound to the source Actor");
    assert.equal(entry.ready, true);
    assert.equal(entry.command, "shelter");
  }
  // Forged entries cannot be pushed through the relay onto another Actor.
  const victim = { uuid: "Actor.victim", documentName: "Actor", name: "victim", isOwner: false, flags: { ak5e: {} }, writes: [], async update(c) { this.writes.push(c); return this; } };
  documents.set(victim.uuid, victim);
  r.targets.push({ uuid: victim.uuid, kind: "defenderBaseProjection", key: "base", ready: true, command: "shelter" });
  game.user.isGM = true;
  await assert.rejects(defenderUses.relayedTargetChange(actor, "apply", { useId: "v-sh", targetUuid: victim.uuid }));
  assert.deepEqual(victim.writes, [], "validators/CAS refused the forged projection");
  game.user.isGM = false;
  // Refund/parent undo converges to no net Reaction charge in BOTH orders.
  const orderA = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(orderA);
  globalThis.fromUuidSync = uuid => uuid === orderA.uuid ? orderA : documents.get(uuid) ?? null;
  await use(orderA, "leapingDefence", leapData("tA"), "oa-l");
  await anyway(orderA, "leapingRefund", { leapOperationId: "oa-l" }, "oa-r");
  assert.equal(spentCount(orderA), 0);
  await anyway(orderA, "undoUse", { useId: "oa-r" }, "oa-ru");
  assert.equal(spentCount(orderA), 1, "undoing the refund re-spends its actual refund");
  await anyway(orderA, "undoUse", { useId: "oa-l" }, "oa-lu");
  assert.equal(spentCount(orderA), 0, "child undo → parent undo nets zero");
  assert.equal(resilience(orderA).value, 6, "no stranded Resilience");
  const orderB = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(orderB);
  globalThis.fromUuidSync = uuid => uuid === orderB.uuid ? orderB : documents.get(uuid) ?? null;
  await use(orderB, "leapingDefence", leapData("tB"), "ob-l");
  await anyway(orderB, "leapingRefund", { leapOperationId: "ob-l" }, "ob-r");
  await anyway(orderB, "undoUse", { useId: "ob-l" }, "ob-lu"); // parent first: refunds current effective spend, no double
  assert.ok(spentCount(orderB) >= 0);
  await anyway(orderB, "undoUse", { useId: "ob-r" }, "ob-ru"); // child sees parent undone: must not re-spend
  assert.equal(spentCount(orderB), 0, "parent undo → child undo nets zero");
  assert.equal(resilience(orderB).value, 6);
  // After both are undone, another refund attempt cannot mint a Reaction.
  try { await anyway(orderB, "leapingRefund", { leapOperationId: "ob-l" }, "ob-r2"); } catch { /* rejection fine */ }
  assert.ok(spentCount(orderB) >= 0 && spentCount(orderB) !== undefined, "never a negative pool");
  assert.equal(spentCount(orderB), 0, "undone parent grants no fresh refund");
});

/* ---------------------------------------------------------------- 03.12 */

test("new-parent-existing-consumers: base projection matches the strict golden, backlink present, helpers refuse forged input", async () => {
  boot();
  // New additive export must exist (checked through the namespace, loaded cleanly either way).
  assert.equal(typeof features.projectDefenderBaseUse, "function", "projectDefenderBaseUse exported (§3.4)");
  // Dynamic golden from a legal strict use.
  const gold = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(gold);
  const data = shelterData(["Token.a", "Token.b"], { activation: "bonus" });
  await defenderCommand(gold, "shelter", data, "cg");
  const goldOp = legacyOps(gold).find(o => o.id === "cg");
  assert.ok(goldOp && goldOp.status, "golden fixture yields a legacy operation");
  const goldShelter = structuredClone(gold.flags.ak5e.defender.shelter);
  // The engine use must expose the same subclass-consumed state.
  const eng = fixture({ level: 12, res: 4 });
  game.combat = ownTurn(eng);
  await use(eng, "shelter", data, "ce");
  assert.deepEqual(shelteredAllies(eng), shelteredAllies(gold), "Protector-style ally reads match");
  const op = legacyOps(eng).find(o => o.baseUseId === "ce");
  assert.ok(op, "projected legacy operation with baseUseId backlink");
  assert.equal(op.command, goldOp.command);
  assert.equal(op.status, goldOp.status, "status parity with the strict path");
  for (const key of ["activation", "allies", "alliesConfirmed", "positionConfirmed"])
    assert.deepEqual(op.data?.[key], goldOp.data?.[key], `consumer field ${key} matches the golden`);
  // A completed base Leap exposes the legacy-consumed operation + canonical reaction receipt.
  const leaper = fixture({ level: 11, res: 6 });
  game.combat = ownTurn(leaper);
  await use(leaper, "leapingDefence", leapData("n1"), "cl");
  const lop = legacyOps(leaper).find(o => o.baseUseId === "cl" || o.id === "cl");
  assert.ok(lop, "legacy consumers can find the new parent by its use ID");
  assert.equal(lop.command, "leapingDefence");
  assert.equal(lop.data.attackId, "n1");
  assert.ok(leaper.flags.ak5e.reactionBudget?.receipts?.["leaping_cl"], "Dreadnought/Sentry receipt lookups hit leaping_<useId>");
  // The projection helper refuses input without a persisted matching receipt and writes nothing.
  const writes = eng.writes.length;
  let refused = false;
  try { await features.projectDefenderBaseUse(eng, { useId: "ghost", command: "shelter", data, result: {} }); }
  catch { refused = true; }
  assert.ok(refused, "only a persisted matching base receipt is accepted");
  assert.equal(eng.writes.length, writes, "refusal writes nothing");
  // Undoing the base Shelter preserves an unrelated legacy operation entry.
  eng.flags.ak5e.defender.operations.push({ id: "unrelated", command: "reconcile", data: {}, status: "reconciled" });
  await anyway(eng, "undoUse", { useId: "ce" }, "ce-u");
  assert.deepEqual(shelteredAllies(eng), [], "undo reverts the projection");
  assert.ok(legacyOps(eng).some(o => o.id === "unrelated"), "later unrelated operations are not erased");
  assert.deepEqual(shelteredAllies(gold), ["Token.a", "Token.b"], "undo never touches the golden Actor");
});

/* ---------------------------------------------------------------- 03.13 */

test("lifecycle-adamantine-regression: hooks expire/recover as before, history survives, Adamantine stays a notice", async () => {
  const documents = boot();
  const actor = fixture({ level: 12, res: 4 });
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : documents.get(uuid) ?? null;
  // GREEN legacy half: strict Shelter still expires on the next turn start.
  game.combat = ownTurn(actor);
  await defenderCommand(actor, "shelter", shelterData(["Token.legacy"]), "lc-strict");
  await defenderTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c1", round: 2, combatantId: "m1" });
  assert.deepEqual(shelteredAllies(actor), [], "existing expiry unchanged");
  // NEW half: the same hooks drive engine Shelter expiry without deleting use history.
  game.combat = ownTurn(actor, "Combat.c2");
  await use(actor, "shelter", shelterData(["Token.engine"]), "lc-base");
  assert.deepEqual(shelteredAllies(actor), ["Token.engine"], "base Shelter active under the same state hooks");
  await defenderTurnEvent({ kind: "turnStart", actorUuid: actor.uuid, combatUuid: "Combat.c2", round: 2, combatantId: "m1" });
  assert.deepEqual(shelteredAllies(actor), [], "engine Shelter expires on the Defender's next turn start");
  assert.ok(defenderUses.receipt(actor, "lc-base"), "use history survived the expiry");
  assert.ok(defenderUses.uses(actor).some(u => u.id === "lc-base"), "history remains inspectable");
  await defenderRest(actor, "short");
  assert.ok(defenderUses.receipt(actor, "lc-base"), "rest handlers do not delete use history");
  // Adamantine Defence remains a guided notice, never a dice rewrite.
  const level20 = fixture({ level: 20 }), level19 = fixture({ level: 19 });
  level20.uuid = "Actor.d20"; level19.uuid = "Actor.d19";
  const tok = a => ({ uuid: `Token.${a.id}${a.uuid}`, actor: a });
  const t20 = tok(level20), t19 = tok(level19);
  documents.set(t20.uuid, t20); documents.set(t19.uuid, t19);
  game.users = [{ id: "gm", isGM: true }, { id: "p1", isGM: false }];
  level20.testUserPermission = user => user.id === "p1";
  const before = rolls.length;
  await adamantineNotice({ attackId: "a1", critical: true, targets: [{ uuid: t20.uuid, hit: true }, { uuid: t19.uuid, hit: true }] });
  assert.ok(game.messages.length >= 1, "notice posted");
  await adamantineNotice({ attackId: "a2", critical: false, targets: [{ uuid: t20.uuid, hit: true }] });
  assert.equal(rolls.length, before, "no dice are re-evaluated for the notice");
});

/* ---------------------------------------------------------------- 03.14 */

test("base-public-card-history: cards expose actual costs and identity, metadata persists, zero automated dice or moves", async () => {
  const actor = fixture({ level: 11, res: 6 });
  boot(ownTurn(actor));
  const messagesBefore = game.messages.length;
  // A scripted mini-chain: bonus Shelter, Leap, exact refund, undo the refund.
  await use(actor, "shelter", shelterData(["Token.a"], { activation: "bonus" }), "hd-sh");
  const shelterCard = game.messages.find(m => JSON.stringify(m).includes("hd-sh"));
  assert.ok(shelterCard, "a public card was posted for the base use");
  assert.equal(resilience(actor).value, 5);
  await use(actor, "leapingDefence", leapData("h1"), "hd-l");
  assert.ok(game.messages.some(m => JSON.stringify(m).includes("hd-l")), "Leap card posted");
  await use(actor, "leapingRefund", { leapOperationId: "hd-l" }, "hd-r");
  assert.ok(game.messages.some(m => JSON.stringify(m).includes("hd-r")), "refund card posted");
  const refundReceipt = defenderUses.receipt(actor, "hd-r");
  const parent = defenderUses.receipt(actor, "hd-l");
  const chainText = JSON.stringify({ parent, refundReceipt });
  assert.match(chainText, /hd-l/, "refund card/receipt exposes the exact parent identity");
  const costsText = JSON.stringify({ shelter: defenderUses.receipt(actor, "hd-sh").resources, refund: refundReceipt.resources });
  assert.match(costsText, /Resilience/i, "cards expose actual costs with labels");
  assert.ok(costsText.includes('"before"') && costsText.includes('"after"'), "actual before/after accounting is public");
  // Undo/retry metadata persists in flags (survives a reload re-read) and preview is write-free.
  const writes = actor.writes.length;
  const pu = defenderUses.previewUndo(actor, "hd-r");
  assert.ok(pu.lines.length >= 1, "undo preview explains the reversal");
  assert.equal(actor.writes.length, writes, "undo preview writes nothing");
  await anyway(actor, "undoUse", { useId: "hd-r" }, "hd-ru");
  const persisted = JSON.parse(JSON.stringify(baseState(actor).undo));
  assert.ok(persisted.find(e => e.id === "hd-r" && e.status === "undone"), "undo status persisted in flags for reload");
  assert.ok(persisted.every(e => typeof e.epoch === "number"), "epoch metadata persists");
  // Hard table-agency guard across the whole chain: no dice, no HP changes, no forced moves.
  assert.equal(rolls.length, 0, "no attack/save/damage/healing/feature dice without an owner click");
  assert.equal(actor.system.attributes.hp.value, 50, "no HP applied");
  assert.ok(!actor.writes.some(w => Object.keys(w).some(p => /^(x|y|system\.attributes\.hp\.value)$/.test(p))), "no actor movement or HP writes");
});
