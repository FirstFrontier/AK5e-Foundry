// WP CBR — caster-base-runtime ATTACK tests (adversary, post-candidate audit pass).
// Baseline: caster-base-runtime-frozen.test.mjs is 15/15 GREEN on this lane's candidate
// (caster-base.mjs / caster-casting.mjs / caster-features.mjs, frozen for this tester).
// Spec: .codex-work/caster-base-replan/SPEC-caster-base-replan.md §5 WP CBR attack themes:
// "same/different operation ids concurrently; event replay on reload; actual debit less than cost;
//  AP excess before spend; AP 0/1/6/7 and costs above 6; fake spend from another Actor;
//  zero/negative/NaN/string/fractional amounts; tampered parent ids; __proto__/constructor;
//  native cancel/throw before vs after consume; Chat failure after refund; roll succeeded but AP
//  update failed; later AP spend before undo; child undo then parent undo; start/end encounter lock;
//  no-GM unowned target failure." Plus §3.1-3.4 contracts and Lap-1 lessons (numeric readings
//  rejected, R6 strictness, no blanket pending/GM veto).
// Every assert below is spec-cited; where the candidate is expected to break, the assertion says
// ATK-BREAK and captures the observed evidence.
import test from "node:test";
import assert from "node:assert/strict";
import { casterConsumption, completeCasterConsumption, completeCasterUse, casterTurn, castCasterArt,
  casterGrant, validateCasterContext, markCasterCastFailure } from "../scripts/caster-casting.mjs";
import { casterCommand, handleCasterEvent, casterRest, getCasterView, registerCasterFeatureHooks,
  casterSpellDC, recordCasterRuling } from "../scripts/caster-features.mjs";
import { onAk5eEvent, offAk5eEvent, emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { consumeArt, wrapActivityUse, undoArtReceipt, grantFor } from "../scripts/arts-casting.mjs";
import { artsState, quoteArt } from "../scripts/arts-rules.mjs";

// ---------- harness (same native-wrapper convention as the frozen file) ----------
function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part] ??= {};
  target[last] = structuredClone(value);
}
const TABLE = { 1: [3, 1], 2: [4, 1], 3: [6, 2], 4: [7, 2], 5: [10, 3], 6: [11, 3], 7: [12, 4], 8: [15, 4],
  9: [16, 5], 10: [17, 5], 11: [20, 6], 12: [21, 6], 13: [22, 7], 14: [25, 7], 15: [26, 8], 16: [27, 8],
  17: [30, 9], 18: [31, 9], 19: [32, 9], 20: [35, 9] };

let opCounter = 0;
function world({ level = 18, branch = "core", ap = 20, artLevel, combat = true, owner = true, roll = 3 } = {}) {
  const maximum = artLevel ?? TABLE[level][1];
  const rollFormulas = [];
  const env = { rollCount: 0, rollTotal: roll, rollToMessageFails: 0, chatFails: 0, warns: [],
    get rollFormulas() { return rollFormulas; }, documents: new Map(), get messages() { return game.messages ?? []; } };
  globalThis.game = {
    user: { id: "owner-user", isGM: false, targets: new Set() },
    combat: combat ? { started: true, uuid: "Combat.cbr", id: "cbr", round: 2, turn: 1,
      combatant: { id: "caster-turn", actor: { uuid: "Actor.caster" } } } : null,
    time: { worldTime: 0 }, settings: { get: () => false }, actors: new Map(), scenes: new Map(),
    users: Object.assign(new Map(), { activeGM: null })
  };
  game.i18n = { localize: key => key, format: key => key };
  globalThis.fromUuidSync = uuid => env.documents.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => env.documents.get(uuid) ?? null;
  opCounter = 0;
  globalThis.foundry = { utils: { randomID: () => `op-${++opCounter}` } };
  globalThis.ui = { notifications: { warn(m) { env.warns.push(String(m)); }, error(m) { env.warns.push(String(m)); }, info() {} } };
  globalThis.CONFIG = { DND5E: { activityTypes: {} } };
  globalThis.Hooks = { on: (name, fn) => { (env.hooks ??= {}); (env.hooks[name] ??= []).push(fn); } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}),
    async create(data) {
      if (env.chatFails > 0 && (env.chatFailMatcher === undefined || String(data?.content ?? "").includes(env.chatFailMatcher))) {
        env.chatFails -= 1; throw new Error("injected chat card failure");
      }
      const clone = structuredClone({ ...data, actor: undefined }); (game.messages ??= []).push(clone); return clone;
    },
    async updateOne(id, changes) { return { id, ...changes }; } } };
  globalThis.Roll = class { constructor(formula) { rollFormulas.push(String(formula)); }
    async evaluate() { env.rollCount += 1; this.total = roll; return this; }
    async toMessage() { if (env.rollToMessageFails > 0) { env.rollToMessageFails -= 1; throw new Error("injected Unending card failure"); } } };
  const actor = {
    id: "caster", uuid: "Actor.caster", documentName: "Actor", type: "character", name: "Caster", isOwner: owner,
    flags: { ak5e: { casting: { enabled: true, ability: "int", castingUnit: "wand", recovery: "long" },
      artsPoints: { maximum: TABLE[level][0], value: ap, maximumArtLevel: maximum, ninthLevelCast: false },
      caster: { version: 1, enabled: true, choices: {}, pools: [], operations: [], casts: [], spends: [],
        rulings: {}, uses: {}, turn: {}, drones: [], undo: [] } } },
    ownership: { default: 0, player: 3 },
    system: { abilities: { int: { value: 16, mod: 3 }, wis: { value: 10, mod: 0 }, cha: { value: 10, mod: 0 },
      con: { value: 12, mod: 1 }, str: { value: 20, mod: 5 }, dex: { value: 18, mod: 4 } },
      attributes: { prof: 3, spell: { attack: 6 }, hp: { value: 10, max: 10, temp: 0 } },
      skills: {}, tools: {}, currency: { cp: 0 }, bonuses: {} },
    items: new Map(), writes: [], tokens: [], failNextUpdate: null,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    getActiveTokens() { return this.tokens; }, getRollData() { return {}; },
    async update(changes) {
      if (this.failNextUpdate?.(changes)) { this.failNextUpdate = null; throw new Error("injected Actor update failure"); }
      this.writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    },
    async createEmbeddedDocuments(_type, data) { return data.map((entry, i) => ({ ...structuredClone(entry), id: `grant${i}` })); }
  };
  const branchIds = { core: "subclass-caster-core", mystic: "subclass-caster-mystic", "mech-accord": "subclass-caster-mech-accord" };
  actor.items.set("class", { id: "class", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-caster" } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  actor.items.set("branch", { id: "branch", type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: branchIds[branch] } }, getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  env.documents.set(actor.uuid, actor); game.actors.set(actor.uuid, actor);
  env.actor = actor;
  return env;
}
function art(env, { id = "art", name = "Reviewed Art", level = 1, activation = "action", grant = null } = {}) {
  const { actor } = env;
  const baseGrant = grant ?? { enabled: true, noCastingUnit: true };
  class Activity {
    constructor(item) { this.actor = actor; this.item = item; this.id = "activity"; this.activation = { type: activation }; }
    async use(cfg) {
      const updates = { actor: {} }, message = { data: {} };
      const usage = { ...cfg, ak5eLevel: cfg.ak5eLevel ?? cfg.level ?? this.item.system.level, ak5eMode: cfg.ak5eMode ?? cfg.mode ?? "ap" };
      const result = consumeArt(this, usage, message, updates);
      if (result === false) return false;
      applyActorChanges(actor, updates.actor);
      return true;
    }
  }
  wrapActivityUse(Activity.prototype);
  const item = { id, type: "spell", name, actor,
    system: { level, activities: new Map([["activity", new Activity(null)]]) },
    flags: { ak5e: { art: baseGrant } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; } };
  const activity = item.system.activities.get("activity");
  activity.item = item;
  actor.items.set(id, item);
  return item;
}
function applyActorChanges(actor, changes) { for (const [path, value] of Object.entries(changes)) setPath(actor, path, value); }
function approved(env, key, value) { env.actor.flags.ak5e.caster.rulings[key] = { value, source: "Reviewed printed source; recorded by the GM." }; }
async function nativeCast(env, item, usage = {}) {
  return item.system.activities.get("activity").use({ ak5eLevel: item.system.level, ak5eMode: "ap", ...usage });
}
async function nativeCastWithOverride(env, item, level = item.system.level) {
  // Accept every base source-limit warning ("Use anyway") exactly as the player flow does.
  let warn;
  try { validateCasterContext(env.actor, item, { mode: "ap", level }); } catch (error) { warn = error; }
  assert.ok(warn === undefined || warn.name === "AK5eWarnings",
    `source limits must be overridable warnings, got ${warn?.name}: ${warn?.message}`);
  const usage = warn ? { ak5eCaster: validateCasterContext(env.actor, item, { mode: "ap", level, overrides: warn.warnings.map(w => w.id) }) } : {};
  return nativeCast(env, item, usage);
}
function seedCast(env, item, { id = "first", level = item.system.level, activation = "action", targets = [] } = {}) {
  const cast = { id, itemId: item.id, level, cost: 1, turn: casterTurn(env.actor), activation, targets, completed: true, status: "complete" };
  env.actor.flags.ak5e.caster.casts.push(cast);
  return cast;
}
function recordSpend(env, { id = "sp-1", amount = 3, level = 1, reason = "Art cast" } = {}) {
  return handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, operationId: id, amount, level, turn: casterTurn(env.actor), reason });
}
function events(kindList) {
  const received = [];
  const off = [];
  for (const kind of kindList) off.push([kind, onAk5eEvent(kind, event => { received.push(event); })]);
  return { received, cleanup: () => { for (const [kind, handler] of off) offAk5eEvent(kind, handler); } };
}
const spends = env => env.actor.flags.ak5e.caster.spends ?? [];
const undo = env => env.actor.flags.ak5e.caster.undo ?? [];
const ledger = env => env.actor.flags.ak5e.artReceipts ?? [];
const numericish = value => /^\d+(\.\d+)?$/.test(String(value));

// ---------- ATK-01 [R1 registration] late registerBase cannot replace the injected castArt;
// live startup listeners never double-record a spend ----------
test("ATK-01 [R1] hooks register each listener exactly once; a late registerBase({castArt:fake}) can never replace the live cast path; one bus apSpent records one spend even when replayed", async () => {
  const env = world({ level: 18, ap: 10 });
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); } };
  registerCasterFeatureHooks();
  registerCasterFeatureHooks(); // double registration must not stack a second consumer/listener (§3.3)
  for (const [name, listeners] of Object.entries(hooks)) {
    assert.equal(listeners.length, 1, `hook "${name}" registered ${listeners.length} times`);
  }
  // Late injection attack: registerBase must be idempotent for the callback too — the first live
  // castArt stays and a fake injected afterwards is inert (registration "never executes a use").
  const features = await import("../scripts/caster-features.mjs");
  let fakeUsed = 0;
  features.registerBase({ castArt: async () => { fakeUsed += 1; return true; } });
  const deep = world({ level: 20, ap: 20, artLevel: 9 });
  const firstArt = art(deep, { id: "reg-a", level: 3 });
  const secondArt = art(deep, { id: "reg-b", level: 8 });
  const first = seedCast(deep, firstArt, { id: "reg-first", level: 3 });
  approved(deep, "doublecastCost", "normal"); // stored ruling: the second Art pays the real quote
  const quoted = quoteArt(artsState(deep.actor), 8, 8, casterGrant(deep.actor, secondArt, {}), { mode: "ap" });
  assert.equal(quoted.cost, 6, "Growing Power keeps the L20 level-8 quote at 6 AP (C3:174-175)");
  await casterCommand(deep.actor, "doublecast", { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8 }, "reg-dc");
  assert.equal(fakeUsed, 0, "ATK-BREAK: a late registerBase({castArt}) replaced the live cast callback — registration is not inert");
  assert.equal(deep.actor.flags.ak5e.artsPoints.value, 20 - quoted.cost, "the real castCasterArt path ran and paid AP, not the fake");
  assert.ok(deep.actor.flags.ak5e.caster.casts.some(cast => cast.itemId === "reg-b" && cast.context?.repeat === "doublecast"),
    "the second Art committed through the native path");

  // Event identity through the live bus: one operationId, delivered twice (bus + replay), records once.
  const bus = world({ level: 18, ap: 10 });
  const turn = casterTurn(bus.actor);
  await emitAk5eEvent("apSpent", { actorUuid: "Actor.caster", operationId: "bus-1", amount: 4, level: 2, turn });
  await handleCasterEvent({ kind: "apSpent", actorUuid: "Actor.caster", operationId: "bus-1", amount: 4, level: 2, turn });
  assert.equal(spends(bus).filter(entry => entry.id === "bus-1").length, 1,
    "bus delivery plus a replayed handleCasterEvent must deduplicate into one expenditure (§3.3)");
});

// ---------- ATK-02 [R2/R7] an unrelated pending operation is not a blanket actor lock ----------
test("ATK-02 [R2/R7] an unrelated pending operation must not block a new independent native cast (§3.1: warnings/recovery, not a blanket lock)", async () => {
  const env = world({ level: 6, ap: 10 });
  // A genuinely unrelated operation (different command, in flight elsewhere) — §3.1 and R7:
  // "A pending unrelated operation is not a blanket actor lock." The CBR inventory row
  // "Broad unfinished-operation locks → CBR" assigns the current-code resolution to this WP.
  env.actor.flags.ak5e.caster.operations = [{ id: "unrelated-other", command: "mysticRitual", data: {}, status: "applying" }];
  const item = art(env, { id: "free-act", level: 2 }); // L6: level 2 < max 3 → GP -1 → cost 1
  const ok = await nativeCast(env, item);
  assert.equal(ok, true,
    `ATK-BREAK: an unrelated pending operation blanket-refused an independent cast (warns: ${JSON.stringify(env.warns)}); ` +
    "spec §3.1/R7 require the new use to proceed (or at most warn with Use anyway), never a silent veto");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 9, "the independent cast paid its own quote");
});

// ---------- ATK-03 [R12/R7] a failed cast retains its receipt but must not lock later uses ----------
test("ATK-03 [R2/R12] failure after consumption retains the spend receipt and never blanket-blocks a later independent cast", async () => {
  const env = world({ level: 6, ap: 10 });
  const doom = art(env, { id: "doom", level: 3 });
  class FailAfterConsume { constructor() { this.actor = env.actor; this.item = doom; }
    async use(cfg) {
      const updates = { actor: {} }, message = { data: {} };
      consumeArt(this, cfg, message, updates);
      applyActorChanges(env.actor, updates.actor);
      throw new Error("injected post-consumption failure");
    } }
  wrapActivityUse(FailAfterConsume.prototype);
  await assert.rejects(new FailAfterConsume().use({ ak5eLevel: 3, ak5eMode: "ap" }), /injected post-consumption failure/);
  const ap = env.actor.flags.ak5e.artsPoints.value;
  assert.equal(ap, 7, "the failed cast's actual debit stands; no automatic refund (§3.1)");
  assert.ok(env.actor.flags.ak5e.caster.casts.some(cast => cast.status === "failed"), "the failed cast is visibly retained for recovery");
  // The next independent Art is a separate operation. §3.1: the pending evidence of the FIRST cast
  // must not become a blanket lock on the actor; R12: "no broad global pending lock".
  const next = art(env, { id: "next-art", level: 2 });
  const ok = await nativeCast(env, next);
  assert.equal(ok, true,
    `ATK-BREAK: an interrupted earlier cast blanket-refused a new independent use (warns: ${JSON.stringify(env.warns)}); ` +
    "recovery evidence must stay visible without locking unrelated casts (spec §2 'broad unfinished-operation locks', R7/R12)");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 6, "the independent cast paid its own quote");
});

// ---------- ATK-04 [R4/R5] malformed spend events: identity frozen, amounts validated ----------
test("ATK-04 [R4/R5] negative/fractional/NaN/garbage amounts and missing operationId never enter the expenditure ledger; string numerics normalize", async () => {
  const env = world({ level: 18, ap: 20 });
  const turn = casterTurn(env.actor);
  const bad = [
    { label: "negative", amount: -3 },
    { label: "fractional", amount: 2.5 },
    { label: "NaN", amount: Number.NaN },
    { label: "string words", amount: "lots" },
    { label: "huge", amount: 1e308 }
  ];
  for (const probe of bad) {
    await assert.rejects(handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, operationId: `bad-${probe.label}`, amount: probe.amount, level: 1, turn }),
      /integer|AP expenditure|expenditure/, `${probe.label} amount must be refused as a malformed expenditure`);
    assert.equal(spends(env).some(entry => entry.id === `bad-${probe.label}`), false, `${probe.label} amount left no ledger entry`);
  }
  // Missing/empty operationId: the source identity is frozen (§3.3) — a spend with no id is malformed.
  await handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, amount: 3, level: 1, turn });
  await handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, operationId: "", amount: 2, level: 1, turn });
  const idless = spends(env).filter(entry => typeof entry.id !== "string" || !entry.id);
  assert.equal(idless.length, 0,
    `ATK-BREAK: apSpent events without a usable operationId created ${idless.length} ledger entr${idless.length === 1 ? "y" : "ies"} ` +
    `(${JSON.stringify(idless.map(entry => entry.id))}) — §3.3 freezes {actorUuid, spendId, amount}; a missing spendId is malformed, and an ` +
    "undefined-id entry also silently deduplicates every later idless event against it");
  // A string numeric that normalizes must be stored as a finite positive integer, and be claimable.
  await handleCasterEvent({ kind: "apSpent", actorUuid: env.actor.uuid, operationId: "str-3", amount: "3", level: 1, turn });
  const coerced = spends(env).find(entry => entry.id === "str-3");
  assert.equal(coerced?.amount, 3, "a coerced string amount is stored as a number");
  assert.equal(typeof coerced?.amount, "number", "ledger amounts are numeric, never strings");
  // An event for an unknown or non-owned Actor writes nothing.
  const writes = env.actor.writes.length;
  assert.equal(await handleCasterEvent({ kind: "apSpent", actorUuid: "Actor.nowhere", operationId: "ghost", amount: 3, level: 1, turn }), undefined);
  assert.equal(env.actor.writes.length, writes, "an unknown Actor event mutates nothing");
});

// ---------- ATK-05 [R2/R5] a real zero-debit cast (AP 0 clamped) triggers nothing ----------
test("ATK-05 [R2/R5] casting at AP 0 with an accepted shortfall warning commits the cast with a zero actual debit, no apSpent event, and no Unending offer", async () => {
  const env = world({ level: 6, ap: 0 });
  const item = art(env, { id: "last-ap", level: 2 }); // cost 1 after GP; AP 0 → clamped zero debit
  const bus = events(["apSpent", "artCast"]);
  try {
    const ok = await nativeCastWithOverride(env, item);
    assert.equal(ok, true, "a confirmed shortfall cast proceeds (§3.1 Use anyway)");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 0, "the clamp holds at zero");
    assert.equal(bus.received.some(event => event.kind === "apSpent"), false,
      "ATK-BREAK: a zero actual debit emitted apSpent — §3.3: 'a zero actual debit is not an expenditure trigger (C3:195)'");
    assert.equal(spends(env).length, 0, "no expenditure entry for a zero debit");
    const castId = env.actor.getFlag("ak5e", "lastArtCast")?.id;
    approved(env, "unendingBasis", "actualSpend");
    // Level 6 is not Unending: the plan warns (overridable per R7), then the claim must die at the
    // missing-expenditure lookup — the same result the level-18 path would give.
    await assert.rejects(casterCommand(env.actor, "unending", { confirmed: true, spendId: castId, overrides: ["unendingLevel"] }, "zero-claim"),
      /expenditure|Choose/, "a zero-debit cast cannot be claimed by Unending");
  } finally { bus.cleanup(); }
});

// ---------- ATK-06 [R6/R13] encounter-window lock must also stop the awaiting roll, not just undo ----------
test("ATK-06 [R6/R13] a confirmed Unending receipt from a previous encounter window stays locked: the Roll 1d6 click must refuse after the window changed", async () => {
  const env = world({ level: 18, ap: 10, roll: 3 });
  await recordSpend(env, { id: "window-spend", amount: 3, level: 2 });
  approved(env, "unendingBasis", "actualSpend");
  const prepared = await casterCommand(env.actor, "unending", { confirmed: true, spendId: "window-spend" }, "window-un");
  assert.equal(prepared.awaitingRoll, true);
  // Combat starts for the next encounter: §3.1 "Combat start locks preceding receipts".
  game.combat = { started: true, uuid: "Combat.next", id: "next", round: 1, turn: 0, combatant: { id: "other", actor: { uuid: "Actor.other" } } };
  const result = await casterCommand(env.actor, "useRoll", { useId: "window-un" }, "window-roll")
    .then(value => ({ value }), error => ({ rejected: String(error?.message ?? error) }));
  if (result.rejected) {
    assert.match(result.rejected, /lock|previous|window|encounter/i, "the refusal must name the window lock");
    assert.equal(env.rollCount, 0, "a locked receipt rolls nothing");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 10, "a locked receipt refunds nothing");
  } else {
    assert.fail("ATK-BREAK: useRoll has no encounter-window check — a receipt confirmed in a previous window rolled and refunded " +
      `${result.value?.refunded} AP after a new combat started (rollCount ${env.rollCount}, AP ${env.actor.flags.ak5e.artsPoints.value}). ` +
      "§3.1 locks preceding receipts at combat start; the frozen CBR-T13 proves the same lock for undoUse, and the base receipt already " +
      "stores windowId/epoch — the roll path ignores it");
  }
});

// ---------- ATK-07 [R6/R12] a chat-card failure after the persisted roll resumes without rerolling ----------
test("ATK-07 [R6/R12] if the roll's card fails after the result was persisted, the retry reuses the stored d6 exactly once and completes the refund", async () => {
  const env = world({ level: 18, ap: 10, roll: 3 });
  await recordSpend(env, { id: "card-spend", amount: 3, level: 2 });
  approved(env, "unendingBasis", "actualSpend");
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "card-spend" }, "card-un");
  env.rollToMessageFails = 1; // the die lands, the result persists, then the card write fails
  await assert.rejects(casterCommand(env.actor, "useRoll", { useId: "card-un" }, "card-roll-1"), /injected Unending card failure/);
  assert.equal(env.rollCount, 1, "the d6 rolled once");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 10, "the failed stage left no refund applied — durable recovery, no half-write");
  const receipt = undo(env).find(entry => entry.id === "card-un");
  assert.equal(receipt?.roll, 3, "the persisted result survived the card failure (§3.3: retry never rerolls)");
  const retry = await casterCommand(env.actor, "useRoll", { useId: "card-un" }, "card-roll-2");
  assert.equal(env.rollCount, 1, "ATK-BREAK: the retry re-rolled a persisted d6 instead of reusing the stored result");
  assert.equal(retry.roll, 3, "the retry reuses the stored result");
  assert.equal(retry.refunded, 3, "the retry completes the refund");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 13);
});

// ---------- ATK-08 [R7/R10] tampered stored rulings are never honored as prices or bases ----------
test("ATK-08 [R7/R10] a corrupted stored ruling ('3', 'quoteCost') is ignored, never silently reinterpreted, and a non-GM can never record a ruling", async () => {
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const item = art(env, { id: "dc-price", level: 8 });
  const turn = casterTurn(env.actor);
  env.actor.flags.ak5e.caster.casts = [{ id: "prior", itemId: item.id, level: 8, turn, activation: "action", targets: [], completed: true }];
  env.actor.flags.ak5e.caster.rulings.doublecastCost = { value: "3", source: "tampered fixture" };
  const baseInput = { repeat: "doublecast", previousCastId: "prior", mode: "ap", level: 8 };
  // A stored price that is not one of the two named readings must fall back to the named prompt,
  // never act as an invisible numeric price (R10: 'altered saved price' is not accepted).
  let err;
  try { validateCasterContext(env.actor, item, baseInput); } catch (error) { err = error; }
  assert.equal(err?.name, "AK5eReading", "a tampered numeric ruling must not silently authorize a price; the named reading prompt returns");
  const values = (err?.options ?? []).map(option => option.value ?? option);
  assert.deepEqual(values.sort(), ["free", "normal"], "tampering cannot widen the offered readings");
  assert.throws(() => validateCasterContext(env.actor, item, { ...baseInput, reading: "3" }), error => error.name === "AK5eReading",
    "the tampered value is not offered as a reading either");
  assert.throws(() => validateCasterContext(env.actor, item, { ...baseInput, reading: "__proto__" }), error => error.name === "AK5eReading");
  assert.throws(() => validateCasterContext(env.actor, item, { ...baseInput, reading: "constructor" }), error => error.name === "AK5eReading");
  const normal = validateCasterContext(env.actor, item, { ...baseInput, reading: "normal" });
  assert.equal(normal.overrideCost, undefined, "the tampered '3' is not carried into the context as a price");
  const spoofed = validateCasterContext(env.actor, item, { ...baseInput, reading: "normal", overrideCost: 3 });
  assert.equal(spoofed.overrideCost, undefined, "direct overrideCost alongside a reading is still unauthorized (§3.4)");
  assert.equal(env.actor.flags.ak5e.caster.rulings.doublecastCost.value, "3", "player readings never rewrite the stored ruling");

  // Unending: a stored incompatible basis is not silently reinterpreted (OR-3): no claim without an
  // explicit compatible reading, and the tampered value is never overwritten by the player.
  const un = world({ level: 18, ap: 10 });
  await recordSpend(un, { id: "basis-spend", amount: 2, level: 1 });
  un.actor.flags.ak5e.caster.rulings.unendingBasis = { value: "quoteCost", source: "tampered fixture" };
  await assert.rejects(casterCommand(un.actor, "unending", { confirmed: true, spendId: "basis-spend" }, "basis-1"),
    error => error.name === "AK5eReading", "an incompatible stored basis must prompt, not silently claim");
  assert.equal(spends(un).find(entry => entry.id === "basis-spend")?.unendingUseId, undefined, "no claim happened on the refusal");
  const claimed = await casterCommand(un.actor, "unending", { confirmed: true, spendId: "basis-spend", reading: "actualSpend" }, "basis-2");
  assert.equal(claimed.awaitingRoll, true, "the source-consistent per-use reading makes the offer reachable");
  assert.equal(un.actor.flags.ak5e.caster.rulings.unendingBasis.value, "quoteCost", "the player's per-use reading is not stored");
  // Only the GM may record rulings.
  await assert.rejects(recordCasterRuling(un.actor, "unendingBasis", "actualSpend", "player writes their own world ruling"), /GM/);
  assert.equal(un.actor.flags.ak5e.caster.rulings.unendingBasis.value, "quoteCost", "a non-GM cannot overwrite a ruling");
});

// ---------- ATK-09 [R8] child undo then parent undo must not subtract the refund twice ----------
test("ATK-09 [R8] after the canonical child refund is undone directly, the base undoUse must not subtract the same refund again, and the parent undo lands every inverse exactly once", async () => {
  const env = world({ level: 18, ap: 10, roll: 2, artLevel: 2 });
  const item = art(env, { id: "dbl-inv", level: 2 });
  globalThis.foundry = { utils: { randomID: () => "dbl-inv-cast" } };
  assert.equal(await nativeCast(env, item), true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 8);
  await recordSpend(env, { id: "dbl-inv-cast", amount: 2, level: 2 });
  approved(env, "unendingBasis", "actualSpend");
  await casterCommand(env.actor, "unending", { confirmed: true, spendId: "dbl-inv-cast" }, "dbl-inv-un");
  const rolled = await casterCommand(env.actor, "useRoll", { useId: "dbl-inv-un" }, "dbl-inv-roll");
  assert.deepEqual({ roll: rolled.roll, refunded: rolled.refunded }, { roll: 2, refunded: 2 });
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 10, "the refund restored the actual spend");
  const child = ledger(env).find(entry => entry.parentReceiptId === "dbl-inv-cast");
  assert.ok(child, "the refund child is on the canonical ledger");

  // Direct child undo: the canonical inverse reverses the refund (10 -> 8).
  await undoArtReceipt(env.actor, child.id);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 8, "the child undo reversed the refund once");

  // Then the owner undoes the base use. The refund is ALREADY reversed — §3.3: "Facade undo routing
  // must not subtract a refund twice." AP must stay 8.
  const apBefore = env.actor.flags.ak5e.artsPoints.value;
  const undone = await casterCommand(env.actor, "undoUse", { useId: "dbl-inv-un" }, "dbl-inv-undo")
    .catch(error => ({ rejected: String(error?.message ?? error) }));
  assert.equal(env.actor.flags.ak5e.artsPoints.value, apBefore,
    undone.rejected
      ? "a refusal is acceptable only if nothing mutates; AP moved anyway"
      : `ATK-BREAK: undoUse re-subtracted a refund the canonical child undo had already reversed ` +
        `(${apBefore} -> ${env.actor.flags.ak5e.artsPoints.value}); §3.3 forbids double-subtracting refunds — ` +
        "the base undo must notice the linked child is already undone and skip the AP inverse");

  // Finally the parent cast undo: reverses the original spend exactly once (8 -> 10).
  await undoArtReceipt(env.actor, "dbl-inv-cast");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 10,
    "ATK-BREAK: the composed inverse net is not the original pre-cast balance");
});

// ---------- ATK-10 [R6/R8] a nonmatching roll must not fabricate a canonical refund receipt ----------
test("ATK-10 [R6/R8] a nonmatching Unending roll refunds zero, emits neither event, and commits no phantom child into flags.ak5e.artReceipts (one canonical inverse per resource change)", async () => {
  const env = world({ level: 18, ap: 10, roll: 1, artLevel: 2 });
  const item = art(env, { id: "phantom", level: 2 });
  globalThis.foundry = { utils: { randomID: () => "phantom-cast" } };
  assert.equal(await nativeCast(env, item), true);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 8);
  await recordSpend(env, { id: "phantom-cast", amount: 2, level: 2 });
  approved(env, "unendingBasis", "actualSpend");
  const bus = events(["apSpent", "artCast"]);
  try {
    await casterCommand(env.actor, "unending", { confirmed: true, spendId: "phantom-cast" }, "phantom-un");
    const result = await casterCommand(env.actor, "useRoll", { useId: "phantom-un" }, "phantom-roll");
    assert.equal(result.refunded, 0, "rolling 1 against a 2 AP expenditure refunds zero (C3:194-195)");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 8, "a zero refund changes no AP");
    assert.deepEqual(bus.received.map(event => event.kind), [], "the roll/refund emits neither apSpent nor artCast");
    const phantom = ledger(env).filter(entry => entry.parentReceiptId === "phantom-cast");
    assert.equal(phantom.length, 0,
      `ATK-BREAK: a zero refund appended ${phantom.length} 'available' signed receipt(s) ` +
      `(${JSON.stringify(phantom.map(entry => ({ id: entry.id, amount: entry.amount })))}) to the canonical ledger. ` +
      "§3.3: 'One canonical inverse per resource change' — there was no resource change, so no receipt; a phantom child with amount 0 " +
      "still consumes parent-undo traversal and undo-list surface for every later review");
    assert.equal(spends(env).length, 1, "the refund creates no new expenditure");
  } finally { bus.cleanup(); }
});

// ---------- ATK-11 [R9/R10] injection through the command path: numeric price, bad level ----------
test("ATK-11 [R9/R10] doublecast via casterCommand rejects a numeric reading end-to-end without burning AP/use, keeps a visible resumable receipt, then an honest operation commits once", async () => {
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const firstArt = art(env, { id: "inj-a", level: 3 });
  const secondArt = art(env, { id: "inj-b", level: 8 });
  const first = seedCast(env, firstArt, { id: "inj-first", level: 3 });
  const quoted = quoteArt(artsState(env.actor), 8, 8, casterGrant(env.actor, secondArt, {}), { mode: "ap" }).cost;
  // (a) numeric 'price' reading through the live command: rejected, zero mutation.
  const poison = await casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8, reading: "8.88" }, "inj-num")
    .then(value => ({ value }), error => ({ rejected: error }));
  assert.equal(poison.rejected?.name, "AK5eReading", "a numeric price must be refused as an unauthorized reading (Lap-1)");
  const values = (poison.rejected?.options ?? []).map(option => option.value ?? option);
  assert.ok(values.length > 0 && values.every(value => !numericish(value)), "the re-offered readings stay named, never numeric");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 20, "the refused operation spent nothing");
  assert.notEqual(env.actor.flags.ak5e.caster.uses.doublecast, true, "the refused operation burned no use");
  assert.ok(getCasterView(env.actor).pending.some(op => op.id === "inj-num"),
    "a persisted intent that failed pre-commit stays visible for recovery (R12: durable, not hidden)");
  // Same id, same poison: still a refusal, still no mutation (immutable replay).
  await assert.rejects(casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8, reading: "8.88" }, "inj-num"),
    error => error.name === "AK5eReading", "same-id replay of a refused payload must not gain mutation");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 20);
  // (b) an independent named-normal operation commits through the live native path.
  const result = await casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8, reading: "normal" }, "inj-ok");
  assert.ok(result, "the named reading resolves");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 20 - quoted, "normal pays the existing discounted quote");
  assert.equal(env.actor.flags.ak5e.caster.uses.doublecast, true, "exactly one Doublecast use burned");
  assert.equal(env.actor.flags.ak5e.caster.rulings.doublecastCost, undefined, "the per-use reading was not stored as a ruling");
  // (c) a non-integer Art level is malformed input, never a price: no commit, no use, no receipt.
  const thirdArt = art(env, { id: "inj-c", level: 1 });
  await assert.rejects(casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: "inj-first", itemId: thirdArt.id, level: 8.5, reading: "free" }, "inj-frac"));
  assert.equal(undo(env).some(entry => entry.id === "inj-frac"), false, "malformed level never even persists an intent");
  assert.equal(env.actor.flags.ak5e.caster.casts.some(cast => cast.itemId === "inj-c"), false, "no fractional-level cast committed");
  // (d) direct castCasterArt with the same poison: also refused.
  await assert.rejects(castCasterArt(env.actor, secondArt.id,
    { mode: "ap", level: 8, repeat: "doublecast", previousCastId: first.id, reading: "5" }),
    error => error.name === "AK5eReading");
});

// ---------- ATK-12 [R12] chat-card failure after the native second-use commit: resume, no respending ----------
test("ATK-12 [R12] if the public card fails after the Doublecast second Art committed, the AP/use are already spent exactly once and the same-id retry finalizes without a second cast", async () => {
  registerCasterFeatureHooks(); // live consumers: artCast completion must mark the cast for resume
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const firstArt = art(env, { id: "cf-a", level: 3 });
  const secondArt = art(env, { id: "cf-b", level: 8 });
  const first = seedCast(env, firstArt, { id: "cf-first", level: 3 });
  const quoted = quoteArt(artsState(env.actor), 8, 8, casterGrant(env.actor, secondArt, {}), { mode: "ap" }).cost;
  // Player reading 'normal' -> readingNote -> castCasterArt publishes the card AFTER the native commit.
  env.chatFails = 1; env.chatFailMatcher = "player's reading";
  await assert.rejects(casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8, reading: "normal" }, "cf-op"),
    /injected chat card failure/);
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 20 - quoted, "the committed debit stands despite the card failure (no auto-refund)");
  const committed = env.actor.flags.ak5e.caster.casts.filter(cast => cast.itemId === "cf-b" && cast.context?.repeat === "doublecast");
  assert.equal(committed.length, 1, "exactly one second Art committed");
  assert.equal(env.actor.flags.ak5e.caster.uses.doublecast, true, "the use was burned once");
  assert.ok(getCasterView(env.actor).pending.some(op => op.id === "cf-op"),
    "the receipt stays visible for recovery — 'do not hide a receipt because the chat card failed' (§3.3/R12)");
  // Same-id retry: only the unfinished stage remains; the native use must NOT run again.
  const retry = await casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: first.id, itemId: secondArt.id, level: 8, reading: "normal" }, "cf-op");
  assert.ok(retry, "the retry resolves");
  assert.equal(env.actor.flags.ak5e.artsPoints.value, 20 - quoted, "ATK-BREAK: the retry re-spent the second Art");
  assert.equal(env.actor.flags.ak5e.caster.casts.filter(cast => cast.itemId === "cf-b" && cast.context?.repeat === "doublecast").length, 1,
    "ATK-BREAK: the retry committed a second duplicate Art");
});

// ---------- ATK-13 [R5/R13] cross-actor spend claims and concurrent double-claim ----------
test("ATK-13 [R5/R13] an expenditure id from another Actor is not claimable, and two concurrent confirms of one spend yield exactly one claim", async () => {
  const victim = world({ level: 18, ap: 10 });
  await recordSpend(victim, { id: "victim-spend", amount: 3, level: 2 });
  const other = world({ level: 18, ap: 10, roll: 2 }); // same Actor uuid is replaced by this env
  approved(other, "unendingBasis", "actualSpend");
  await recordSpend(other, { id: "own-spend", amount: 2, level: 1 });
  // Cross-actor claim: 'victim-spend' does not exist in this actor's ledger.
  const writesBefore = other.actor.writes.length;
  await assert.rejects(casterCommand(other.actor, "unending", { confirmed: true, spendId: "victim-spend", reading: "actualSpend" }, "cross-1"),
    /expenditure|Choose/, "a spendId from another Actor's ledger is invisible here (identity includes actorUuid, §3.3)");
  assert.equal(other.actor.writes.length, writesBefore, "the refused cross-actor claim wrote nothing");
  assert.equal(victim.actor.flags.ak5e.caster.spends.find(entry => entry.id === "victim-spend")?.unendingUseId, undefined,
    "the victim's own expenditure was not claimed by the attacker's refusal");
  // Concurrent same-spend, different operation ids: the per-Actor serial must claim exactly once.
  const [one, two] = await Promise.allSettled([
    casterCommand(other.actor, "unending", { confirmed: true, spendId: "own-spend", reading: "actualSpend" }, "race-1"),
    casterCommand(other.actor, "unending", { confirmed: true, spendId: "own-spend", reading: "actualSpend" }, "race-2")
  ]);
  const winners = [one, two].filter(outcome => outcome.status === "fulfilled");
  assert.equal(winners.length, 1, "ATK-BREAK: two concurrent confirms both claimed one expenditure");
  const loser = [one, two].find(outcome => outcome.status === "rejected");
  assert.match(String(loser?.reason?.message ?? loser?.reason), /expenditure|Unending|recorded|already/i, "the loser gets a clear refusal");
  const raceReceipts = undo(other).filter(entry => entry.id === "race-1" || entry.id === "race-2");
  assert.equal(raceReceipts.length, 1, "exactly one base receipt exists for the claimed expenditure");
  const spend = spends(other).find(entry => entry.id === "own-spend");
  assert.equal(spend.unendingUseId, raceReceipts[0].id, "the claim is recorded on the expenditure itself");
  // Only the winner can roll; the loser id has no receipt.
  await assert.rejects(casterCommand(other.actor, "useRoll", { useId: "race-1" === raceReceipts[0].id ? "race-2" : "race-1" }, "race-loser"));
  const rolled = await casterCommand(other.actor, "useRoll", { useId: raceReceipts[0].id }, "race-roll");
  assert.equal(rolled.refunded, 2, "the single claim refunded once");
  assert.equal(other.actor.flags.ak5e.artsPoints.value, 12, "no double refund from the racing pair");
});

// ---------- ATK-14 [R15] base routing refuses to hijack a branch receipt even when spoofed ----------
test("ATK-14 [R15] a base receipt continuation cannot undo a non-unending use, even if a locally forged base flag tries to route it", async () => {
  const env = world({ level: 18, ap: 10 });
  env.actor.flags.ak5e.caster.undo = [{ id: "branch-use", base: true, command: "powerWithin", status: "complete",
    epoch: 0, windowId: "combat:Combat.cbr", targets: [], refunded: 0 }];
  const writesBefore = env.actor.writes.length;
  await assert.rejects(casterCommand(env.actor, "undoUse", { useId: "branch-use" }, "hijack-1"), /cannot be undone/i,
    "the base undo layer must only reverse its own unending receipts");
  assert.equal(env.actor.writes.length, writesBefore, "the refused hijack wrote nothing");
  assert.equal(env.actor.flags.ak5e.caster.undo.find(entry => entry.id === "branch-use").status, "complete",
    "the branch-side receipt is untouched");
  // useRoll is equally narrow: a non-unending base receipt has no roll.
  await assert.rejects(casterCommand(env.actor, "useRoll", { useId: "branch-use" }, "hijack-2"), /no roll/i);
});

// ---------- ATK-15 [R2/R4/R5] AP 7 vs cost 9: clamped actual debit 7, above-d6 offer kept, mismatch refunds 0 ----------
test("ATK-15 [R2/R4/R5] a ninth-level cast at AP 7 records actual spend 7 (not 9), stays a claimable above-d6 expenditure, and a d6 roll can never match it", async () => {
  const env = world({ level: 18, ap: 7, roll: 6 });
  const item = art(env, { id: "nine", level: 9 }); // L18: maximum 9, no Growing Power; cost 9 > AP 7
  const bus = events(["apSpent", "artCast"]);
  try {
    assert.equal(await nativeCastWithOverride(env, item, 9), true, "the over-AP cast proceeds after Use anyway");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 0, "the clamp holds at zero");
    assert.equal(env.actor.flags.ak5e.artsPoints.ninthLevelCast, true, "the once-per-LR ninth flag is consumed (C1:191-195)");
    const spendEvent = bus.received.find(event => event.kind === "apSpent");
    assert.equal(spendEvent?.amount, 7, "the event reports the actual debit 7, never the quoted 9");
    const receipt = ledger(env).find(entry => entry.id === spendEvent?.operationId);
    assert.ok(Number(receipt?.shortfall) >= 2, "the shortfall is on the canonical receipt (2 AP short)");
    await recordSpend(env, { id: spendEvent.operationId, amount: 7, level: 9 }); // idempotent: the live event already recorded it
    assert.equal(spends(env).filter(entry => entry.id === spendEvent.operationId).length, 1,
      "the live ledger already holds one above-d6 expenditure; replay does not duplicate it");
    approved(env, "unendingBasis", "actualSpend");
    await casterCommand(env.actor, "unending", { confirmed: true, spendId: spendEvent.operationId }, "nine-un");
    const result = await casterCommand(env.actor, "useRoll", { useId: "nine-un" }, "nine-roll");
    assert.equal(result.roll, 6, "the offer above the d6 range is exposed, not dropped (R5)");
    assert.equal(result.refunded, 0, "6 can never match 7: the refund is honestly zero, no partial magic");
    assert.equal(env.actor.flags.ak5e.artsPoints.value, 0, "AP did not move");
  } finally { bus.cleanup(); }
});

// ---------- FIX-01 (fix round) [R7] a spent Doublecast is a warning with Use anyway, never a hard veto ----------
test("FIX-01 [R7] a new Doublecast after the use was spent refuses as an overridable warning with no write, and commits once the player confirms Use anyway", async () => {
  const env = world({ level: 20, ap: 20, artLevel: 9 });
  const firstArt = art(env, { id: "fix-a", level: 3 });
  const secondArt = art(env, { id: "fix-b", level: 8 });
  seedCast(env, firstArt, { id: "fix-first", level: 3 });
  approved(env, "doublecastCost", "free"); // pricing is ATK-11's subject; this regression is the once-per-Short-Rest limit
  env.actor.flags.ak5e.caster.uses.doublecast = true; // already spent since the last Short Rest
  const writesBefore = env.actor.writes.length;
  const refused = await casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: "fix-first", itemId: secondArt.id, level: 8 }, "fix-new")
    .then(value => ({ value }), error => ({ rejected: error }));
  assert.equal(refused.rejected?.name, "AK5eWarnings",
    "ATK-BREAK: a spent Doublecast hard-refused instead of warning with Use anyway (R7)");
  assert.ok((refused.rejected?.warnings ?? []).some(warning => warning.id === "doublecastUsed"),
    "the warning carries the stable id the override accepts");
  assert.equal(env.actor.writes.length, writesBefore, "an unconfirmed use writes nothing");
  assert.equal(undo(env).some(entry => entry.id === "fix-new"), false, "no receipt exists before the player confirms");

  const committed = await casterCommand(env.actor, "doublecast",
    { confirmed: true, castId: "fix-first", itemId: secondArt.id, level: 8, overrides: ["doublecastUsed"] }, "fix-confirmed");
  assert.ok(committed, "a confirmed Use anyway proceeds");
  const cast = env.actor.flags.ak5e.caster.casts.find(entry => entry.id !== "fix-first" && entry.itemId === secondArt.id);
  assert.ok(cast, "the confirmed second Art commits through the native path");
  assert.equal(cast.context?.repeat, "doublecast", "the second use records its base repeat context");
  const receipt = undo(env).find(entry => entry.id === "fix-confirmed");
  assert.equal(receipt?.status, "complete", "the confirmed use finalizes its receipt");
  assert.ok((receipt?.overridden ?? []).some(text => /Short Rest/i.test(text)),
    "the public receipt lists the overridden source limit (WORKFLOW.md §3.2)");
  assert.equal(env.actor.flags.ak5e.caster.uses.doublecast, true, "the use stays spent until a rest restores it");
});
