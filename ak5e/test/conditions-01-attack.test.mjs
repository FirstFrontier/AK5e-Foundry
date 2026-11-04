/**
 * WP conditions-01 — POST-CANDIDATE attack pass (tester: adversary).
 * Drafted from SPEC-conditions.md §5 WP conditions-01 ACs + §3.1–§3.4 shared
 * contracts + source C1:21,24,226–254. Candidate = gated submission 1.
 * Frozen suite re-run first: 34/34 green (baseline preserved, untouched).
 * Harness conventions from conditions-01-frozen.test.mjs / base-classes-fixture.mjs
 * (two-client relay, fault injection, write journal). No production or frozen
 * file edited by this pass.
 *
 * Themes exercised: concurrent/double clicks · same-ID altered request (incl.
 * declared-alias equivalence) · GM-side prewrite fail + same-ID re-drive ·
 * final source-write fail + retry · ack-failure recovery · NaN/strings/
 * prototype keys/malformed IDs · unowned with no GM (visible Retry) ·
 * duplicate elected-GM delivery idempotency · Use-anyway preview surface
 * (mechanics warnings land in C02) · undo after unrelated later edits ·
 * encounter-window lock · forged statusId/AE/field entries · source Actor
 * deletion after apply (independent removability, read contract) · setup
 * re-run/registration idempotency (reload shape).
 * Fixture limitation noted in the report: true reload (fresh module state) and
 * real Foundry deleted-document update errors cannot be reproduced in-process;
 * those aspects are inspected via persisted-state re-read only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";
import {
  CONDITION_DEFINITIONS, conditionDefinition, conditionEffectData,
  conditionExpiry, conditionExpired, conditionFacts,
} from "../scripts/condition-registry.mjs";
import {
  conditionUses, conditionCommand, registerConditionHooks, validateConditionTarget,
  preview as previewUse, previewUndo, uses as usesOf, receipt as receiptOf,
  projectConditionEntry,
} from "../scripts/condition-uses.mjs";

/* ------------------------------------------------- import-time capture (frozen convention) */

const capturedOnce = [];
class MixinBase {}
function installImportGlobals() {
  globalThis.Hooks = { once: (n, f) => capturedOnce.push([n, f]), on: () => {}, call: () => true, callAll: async () => true, off: () => {} };
  globalThis.game = {
    system: { id: "dnd5e" }, settings: { get: () => true, set: async () => {}, register: () => {}, registerMenu: () => {} },
    i18n: { format: k => k, localize: k => k },
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    packs: [], modules: new Map(), scenes: [], messages: [], combat: null, combats: [],
    time: { worldTime: 0 }, actors: new Map(), items: new Map(),
  };
  globalThis.CONFIG = { statusEffects: [], DOMPurify: { sanitize: s => s } };
  globalThis.foundry = {
    utils: { duplicate: o => structuredClone(o), mergeObject: (a, b) => Object.assign(a, b), randomID: () => "rid" },
    applications: { api: { DialogV2: { confirm: async () => true, wait: async () => true }, HandlebarsApplicationMixin: B => class extends B {}, Application: MixinBase, ApplicationV2: MixinBase }, sheets: {}, apps: {} },
    documents: { Actor: MixinBase, Item: MixinBase, ActiveEffect: MixinBase, ChatMessage: MixinBase, Combat: MixinBase, Combatant: MixinBase, JournalEntry: MixinBase },
    data: {}, abstract: {},
  };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async d => d } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
}
installImportGlobals();
let ak5eLoadError = null;
try { await import("../scripts/ak5e.mjs"); } catch (e) { ak5eLoadError = e; }

/* ------------------------------------------------- per-test world harness */

const STOCK_EFFECTS = () => ([
  { id: "blinded", name: "Blinded" }, { id: "deafened", name: "Deafened" }, { id: "frightened", name: "Frightened" },
  { id: "surprised", name: "Surprised" }, { id: "poisoned", name: "Poisoned" }, { id: "invisible", name: "Invisible" },
  { id: "prone", name: "Prone" }, { id: "grappled", name: "Grappled" }, { id: "charmed", name: "Charmed" },
]);

function jsort(v) {
  if (Array.isArray(v)) return v.map(jsort);
  if (v && typeof v === "object") { const out = {}; for (const k of Object.keys(v).sort()) out[k] = jsort(v[k]); return out; }
  return typeof v === "function" ? undefined : v;
}
const snapOf = o => JSON.stringify(jsort(o));
const aefx = actor => [...actor.effects.values()];
const instOf = e => e.getFlag?.("ak5e", "conditionInstance") ?? e.flags?.ak5e?.conditionInstance;
const contribs = actor => aefx(actor).filter(e => instOf(e));
const acks = actor => Object.values(actor.flags?.ak5e?.conditionUsesApplied ?? {});

function harness(opts = {}) {
  const { chapterOneRules = true } = opts;
  assert.equal(ak5eLoadError, null, `HARNESS: ak5e.mjs must import under stubs: ${ak5eLoadError?.message ?? ""}`);
  const settingsObj = { "ak5e.chapterOneRules": chapterOneRules, "ak5e.encounterEpoch": 0 };
  const env = setupFoundryGlobals({ settings: settingsObj });
  const game = globalThis.game;
  game.system = { id: "dnd5e" };
  game.packs ??= []; game.modules ??= new Map();
  game.socket ??= { on() {}, emit() {} };
  game.settings.register = () => {}; game.settings.registerMenu = () => {};

  globalThis.CONFIG.statusEffects = STOCK_EFFECTS();
  globalThis.CONFIG.DND5E = Object.assign({ tools: {}, toolProficiencies: {}, skills: {}, conditions: {}, constants: {} }, globalThis.CONFIG.DND5E);
  globalThis.CONFIG.AK5E ??= {};
  const dialog = { mode: true, calls: [] };
  const dval = () => (typeof dialog.mode === "function" ? dialog.mode() : dialog.mode);
  globalThis.foundry.applications = { api: { DialogV2: {
    async confirm(o) { dialog.calls.push({ kind: "confirm", options: o }); return dval(); },
    async wait(o) { dialog.calls.push({ kind: "wait", options: o }); return dval(); },
  } } };

  const events = [];
  let counter = 0;
  globalThis.foundry.utils.randomID = () => `det-${++counter}`;

  const gm = { id: "gm", name: "Gamemaster", isGM: true };
  const player = { id: "player", name: "Player", isGM: false };

  const mkActor = (id, { owner = true, as = player } = {}) => {
    const actor = createTestActor({ id, name: id.replace(/-/g, " "), owner,
      ownership: { default: owner ? 3 : 0, [as.id]: owner ? 3 : 0 } });
    actor.statuses = new Set();
    game.actors.set(actor.id, actor);
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
    const rawUpdate = actor.update.bind(actor);
    actor.update = async (changes, options) => {
      const paths = Object.keys(changes);
      const isAck = paths.some(p => p.startsWith("flags.ak5e.conditionUsesApplied"));
      if (actor.__faultAck && isAck) { actor.__faultAck = false; throw new Error("simulated authoritative-target acknowledgement write fault"); }
      const isSourceState = paths.some(p => p === "flags.ak5e.conditionUses" || p.startsWith("flags.ak5e.conditionUses."));
      if (actor.__faultSource && isSourceState && actor.__sawAck) {
        actor.__faultSource = false;
        throw new Error("simulated final source receipt write fault");
      }
      if (isAck) actor.__sawAck = true;
      events.push({ ev: "update", actor: actor.id, paths });
      return rawUpdate(changes, options);
    };
    const rawCreate = actor.createEmbeddedDocuments.bind(actor);
    actor.createEmbeddedDocuments = async (type, entries, options) => {
      if (actor.__faultCreate && type === "ActiveEffect") { actor.__faultCreate = false; throw new Error("simulated embedded-create fault"); }
      events.push({ ev: "create", actor: actor.id, type, count: (entries ?? []).length });
      const docs = await rawCreate(type, entries, options);
      if (type === "ActiveEffect") docs.forEach((doc, i) => { doc.statuses = structuredClone(entries[i]?.statuses ?? []); });
      return docs;
    };
    return actor;
  };

  const hookProblems = [];
  for (const name of ["init", "setup", "ready"]) {
    for (const [n, fn] of capturedOnce.filter(([n2]) => n2 === name)) {
      try { fn(); } catch (e) { hookProblems.push(`${name}: ${e.message}`); }
    }
  }

  const relayRequests = () => game.messages.filter(m => Object.keys(m.flags?.ak5e ?? {}).some(k => /conditionUsesRelayRequest$/.test(k)));
  const waitForRelayCount = async n => {
    for (let i = 0; i < 6000; i++) { if (relayRequests().length >= n) return relayRequests().length; await new Promise(r => setImmediate(r)); }
    return relayRequests().length;
  };
  const waitForRelayRequest = async () => { const c = await waitForRelayCount(1); return c >= 1 ? relayRequests().at(-1) : null; };
  const settle = p => p.then(value => ({ value }), error => ({ error }));
  const setEpoch = n => { settingsObj["ak5e.encounterEpoch"] = n; };
  /** GM-client delivery of a captured request, then return to player context. */
  const deliver = async (request, { keepGm = false, ownTarget } = {}) => {
    game.user = gm;
    const t = ownTarget ?? null;
    if (t) t.isOwner = true;
    let threw = null;
    try { await conditionUses.handleRelay(request, {}, player.id); }
    catch (e) { threw = e; }
    globalThis.Hooks.callAll("updateChatMessage", request);
    if (!keepGm) { game.user = player; if (t) t.isOwner = false; }
    return threw;
  };

  return { game, env, events, dialog, gm, player, mkActor, relayRequests, waitForRelayRequest,
    waitForRelayCount, settle, setEpoch, hookProblems, deliver, messages: game.messages };
}

const APPLY = (target, key) => ({ key, target: target.uuid, targetUuid: target.uuid, confirmed: true });

/* ================================================================ double click / concurrency */

test("atk-double-click-same-op-id-applies-once: two concurrent identical commands sharing one operation ID must not double-apply", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("double-clicker");
  const OP = "atk-dbl-op";
  const [a, b] = await Promise.all([
    h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "bleeding"), OP)),
    h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "bleeding"), OP)),
  ]);
  assert.equal(a.error, undefined, `first must not throw: ${a.error?.message}`);
  assert.equal(b.error, undefined, `second (same stable ID) must resume, not error elsewhere: ${b.error?.message}`);
  assert.equal(contribs(actor).length, 1, "§3.1: a repeated stable operation ID resumes, never re-applies");
  assert.equal(acks(actor).filter(x => x.operationId === OP).length, 1, "exactly one authoritative target acknowledgement");
  assert.equal(usesOf(actor).filter(u => u.id === OP).length, 1, "one receipt for the shared operation ID");
  assert.equal(h.hookProblems.length, 0, `hook-error free: ${h.hookProblems.join("; ")}`);
});

test("atk-double-click-distinct-ids-remain-separately-tracked: two rapid distinct applications stay independently attributable and instance-scoped removal survives", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("rapid-two");
  await Promise.all([
    conditionCommand(actor, "applyCondition", APPLY(actor, "burning"), "atk-r1"),
    conditionCommand(actor, "applyCondition", APPLY(actor, "burning"), "atk-r2"),
  ]);
  const cs = contribs(actor);
  assert.equal(cs.length, 2, "§3.2: distinct applications remain separately tracked");
  const ids = cs.map(e => instOf(e).instanceId);
  assert.ok(ids[0] !== ids[1], "instances must be independently attributable/removable");
  const removed = await conditionCommand(actor, "removeCondition",
    { key: "burning", instanceIds: [ids[0]], reason: "one source ended", target: actor.uuid, targetUuid: actor.uuid, confirmed: true }, "atk-rm-one");
  assert.equal(removed.error, undefined, `instance-scoped remove must succeed: ${removed.error?.message}`);
  assert.equal(contribs(actor).length, 1, "only the named instance was removed");
  assert.equal(instOf(contribs(actor)[0]).instanceId, ids[1], "the surviving contribution is the untouched one");
});

/* ================================================================ same-ID altered request */

test("atk-same-id-target-swapped-rejected: same operation ID pointed at a different target must reject before any mutation", async () => {
  const h = harness();
  h.game.user = h.player;
  const src = h.mkActor("swapper");
  const a = h.mkActor("victim-a");
  const b = h.mkActor("victim-b");
  const OP = "atk-swap-op";
  const r1 = await conditionCommand(src, "applyCondition", APPLY(a, "bleeding"), OP);
  assert.equal(r1.error, undefined, `initial apply must work: ${r1.error?.message}`);
  const beforeB = snapOf({ fx: aefx(b).map(e => ({ id: e.id, statuses: e.statuses ?? null })), ev: h.events.length });
  const r2 = await h.settle(conditionCommand(src, "applyCondition", APPLY(b, "bleeding"), OP));
  const rejected = r2.error || r2.value?.ok === false || r2.value?.error;
  assert.ok(rejected, "§3.1/AC4: same stable ID with an altered request must be rejected, not applied to a new target");
  const afterB = snapOf({ fx: aefx(b).map(e => ({ id: e.id, statuses: e.statuses ?? null })), ev: h.events.length });
  assert.equal(beforeB, afterB, "rejection happens BEFORE another mutation — target B untouched, no new writes journaled");
  assert.equal(contribs(a).length, 1, "original application stays intact");
});

test("atk-same-id-command-swapped-rejected: reusing an apply operation ID for a remove must reject and preserve state", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("cmd-swapper");
  const OP = "atk-cmd-swap";
  await conditionCommand(actor, "applyCondition", APPLY(actor, "frozen"), OP);
  const r = await h.settle(conditionCommand(actor, "removeCondition",
    { key: "frozen", instanceIds: ["whatever"], reason: "x", target: actor.uuid, targetUuid: actor.uuid, confirmed: true }, OP));
  assert.ok(r.error || r.value?.ok === false || r.value?.error,
    "operation ID belongs to a different command kind — must reject (resume is for identical requests only, §3.1)");
  assert.equal(contribs(actor).length, 1, "the applied contribution survives the rejected swap");
});

test("atk-same-id-declared-alias-resumes: canonical key via its declared alias must RESUME the same operation, not reject as altered", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("alias-op");
  const OP = "atk-alias-op";
  const first = await conditionCommand(actor, "applyCondition", APPLY(actor, "off-balance"), OP);
  assert.equal(first.error, undefined, `setup apply: ${first.error?.message}`);
  const second = await h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "offBalance"), OP));
  const deadEnded = second.error || second.value?.ok === false;
  assert.ok(!deadEnded,
    "§3.2 declares offBalance an exact API alias of off-balance — identical choices under the same ID must resume (§3.1), got: "
    + (second.error?.message ?? JSON.stringify(second.value)?.slice(0, 160)));
  assert.equal(contribs(actor).length, 1, "resume must not re-apply");
});

/* ================================================================ NaN / strings / prototype keys */

test("atk-prototype-and-nonstring-keys: registry and command reject prototype/non-string identities without pollution", async () => {
  const h = harness();
  h.game.user = h.player;
  for (const probe of ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"]) {
    assert.equal(conditionDefinition(probe), null, `prototype member ${probe} must resolve null`);
    assert.ok(!Object.prototype.hasOwnProperty.call(CONDITION_DEFINITIONS, probe), `${probe} must not be an own key`);
  }
  for (const weird of [NaN, 0, 1, true, false, [], null, undefined, ["bleeding"], { toString: () => "bleeding" }]) {
    assert.equal(conditionDefinition(weird), null, `non-string/coercible input ${snapOf(weird)} must resolve null — §3.2 declared exact aliases only, no prose guessing`);
  }
  const polluted = conditionEffectData({ key: "bleeding", sourceActorUuid: "Actor.x", operationId: "op1", instanceId: "i1",
    expiry: { kind: "manual" }, parameters: JSON.parse('{"__proto__": {"ak5eAttack": 1}}') });
  assert.equal({}.ak5eAttack, undefined, "prototype-key parameters must never pollute Object.prototype");
  if (polluted) assert.ok(!JSON.stringify(Object.getOwnPropertyNames(polluted)).includes("ak5eAttack") || !snapOf(polluted).includes("ak5eAttack"),
    "attacker prototype value must not ride through into effect data");
  const actor = h.mkActor("proto-cmd");
  const r = await h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "__proto__"), "atk-proto-apply"));
  assert.ok(r.error || r.value?.ok === false || r.value?.error, "command with key __proto__ must reject");
  assert.equal(aefx(actor).length, 0, "prototype key cannot create effects (AC1)");
  // NB: `undefined`/absent operationId is the spec default ("generate a new ID", §3.4) and is NOT malformed.
  for (const badId of ["", "op with spaces", "op/../x", "a".repeat(61), NaN, 42, null, {}]) {
    const r2 = await h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "bleeding"), badId));
    assert.ok(r2.error, `malformed operation ID ${snapOf(badId)} must be rejected (§3.4 stable operation identity)`);
  }
  assert.equal(contribs(actor).length, 0, "none of the malformed-ID attempts applied anything");
});

test("atk-expiry-nonfinite-and-unknown: conditionExpiry must normalize or reject, never leak NaN/unknown tagged unions", async () => {
  const cases = [
    { kind: "time", worldTime: NaN }, { kind: "time", worldTime: "soon" }, { kind: "time", worldTime: Infinity },
    { kind: "time", worldTime: -Infinity }, { kind: "time", worldTime: 1.5 }, { kind: "forever" },
    null, undefined, "manual", 42, { __proto__: { polluted: 1 } },
  ];
  for (const spec of cases) {
    let out = "THREW";
    try { out = conditionExpiry(spec, { worldTime: 100 }); } catch { out = null; }
    if (out == null) continue; // explicit rejection is acceptable
    assert.ok(["manual", "time", "turn", "concentration", "any"].includes(out.kind),
      `§3.3: normalized expiry must be a tagged-union member, got ${JSON.stringify(out.kind)}`);
    if (out.kind === "time") assert.ok(Number.isFinite(out.worldTime), `time expiry must never persist non-finite worldTime (input ${snapOf(spec)})`);
    if (out.kind === "turn") assert.ok(Number.isInteger(out.round) && out.round >= 0, `turn expiry round must be a non-negative integer (input ${snapOf(spec)})`);
  }
  const ok = conditionExpiry({ kind: "time", worldTime: 500 }, {});
  assert.equal(conditionExpired(ok, { worldTime: 499 }), false, "not expired before the deadline");
  for (const junk of [null, undefined, {}, "time", { kind: "time" }]) {
    let res = "THREW";
    try { res = conditionExpired(junk, { worldTime: 999 }); } catch { res = false; }
    assert.notEqual(res, true, `garbage expiry ${snapOf(junk)} must never report expired (fail-closed)`);
  }
});

/* ================================================================ unowned / no GM / retry */

test("atk-nogm-then-gm-arrives-same-id-completes-once: absent GM gives visible 'Not applied yet — Retry'; same-ID retry with a GM applies exactly once", async () => {
  const h = harness();
  h.game.user = h.player;
  h.game.users.activeGM = null;
  const src = h.mkActor("caster-nogm");
  const target = h.mkActor("unowned-nogm", { owner: false });
  const OP = "atk-nogm-retry";
  const first = await h.settle(conditionCommand(src, "applyCondition", APPLY(target, "frozen"), OP));
  assert.equal(aefx(target).length, 0, "no direct player-side write on an unowned target (§3.1/WORKFLOW §3.2)");
  const evidence = snapOf(first.value ?? first.error?.message);
  assert.match(evidence, /not applied|retry|pending|no gm/i,
    `§3.1: absent GM must yield a visible 'Not applied yet — Retry', never a silent queue (got ${evidence.slice(0, 200)})`);
  h.game.users.activeGM = h.gm;
  const running = h.settle(conditionCommand(src, "applyCondition", APPLY(target, "frozen"), OP));
  const req = await h.waitForRelayRequest();
  assert.ok(req, "retry with a GM present must reach the elected-GM transport");
  await h.deliver(req, { ownTarget: target });
  const second = await running;
  assert.equal(second.error, undefined, `retry must resolve, not dead-end: ${second.error?.message}`);
  assert.equal(contribs(target).length, 1, "resume semantics: the retry applied exactly once");
  assert.equal(acks(target).filter(x => x.operationId === OP).length, 1, "exactly one acknowledgement for the operation");
});

test("atk-duplicate-elected-gm-delivery-idempotent: the same relay message processed repeatedly must not double-apply", async () => {
  const h = harness();
  h.game.user = h.player;
  const src = h.mkActor("dup-src");
  const target = h.mkActor("dup-target", { owner: false });
  const OP = "atk-dup-delivery";
  const running = h.settle(conditionCommand(src, "applyCondition", APPLY(target, "corroded"), OP));
  const req = await h.waitForRelayRequest();
  await h.deliver(req, { ownTarget: target });
  await h.deliver(req, { ownTarget: target });   // socket echo / GM double click
  const outcome = await running;
  assert.equal(outcome.error, undefined, `delivery must resolve: ${outcome.error?.message}`);
  assert.equal(contribs(target).length, 1, "§3.2: repeats with the same (sourceActorUuid,operationId,instanceId) are idempotent");
  assert.equal(acks(target).filter(x => x.operationId === OP).length, 1, "single authoritative acknowledgement");
});

/* ================================================================ partial failure / retry / source writes */

test("atk-gm-side-prewrite-fault: relayed create failure is visibly reported and never strands a success claim", async () => {
  const h = harness();
  h.game.user = h.player;
  const src = h.mkActor("gw-src");
  const target = h.mkActor("gw-target", { owner: false });
  const OP = "atk-gw-fault";
  target.__faultCreate = true;
  const running = h.settle(conditionCommand(src, "applyCondition", APPLY(target, "silenced"), OP));
  const req = await h.waitForRelayRequest();
  assert.ok(req, "relay request created");
  const threw = await h.deliver(req, { ownTarget: target });
  const first = await running;
  const failureVisible = !!first.error || first.value?.ok === false || !!threw;
  assert.ok(failureVisible, "GM-side prewrite failure must surface visibly to the acting player");
  const msg = snapOf(threw?.message ?? "") + snapOf(first.error?.message ?? first.value ?? "");
  assert.match(msg, /did not apply|not applied|retry|timed out|fault/i,
    `the player must learn why (GM client did not apply / retry guidance), got: ${msg.slice(0, 220)}`);
  assert.equal(aefx(target).length, 0, "prewrite failure leaves no target change");
  assert.equal(acks(target).filter(x => x.operationId === OP && x.status === "applied").length, 0,
    "no success acknowledgement may exist for a failed application");
});

test("atk-gm-fault-same-id-reattempt-repairs: after a GM-side failure, a fresh operation ID applies exactly once while the dead receipt stays undoable-or-stable", async () => {
  const h = harness();
  h.game.user = h.player;
  const src = h.mkActor("gw2-src");
  const target = h.mkActor("gw2-target", { owner: false });
  const OP = "atk-gw2-fault";
  target.__faultCreate = true;
  const running = h.settle(conditionCommand(src, "applyCondition", APPLY(target, "bleeding"), OP));
  const req = await h.waitForRelayRequest();
  await h.deliver(req, { ownTarget: target });
  await running; // settle whichever way it resolves
  // The failed operation must not claim completion on source-side evidence alone.
  const dead = receiptOf(src, OP);
  if (dead) assert.notEqual(dead.status, "complete",
    "a relay attempt whose GM-side write failed must not be marked complete (§3.1 target evidence)");
  // After GM recovery, a fresh-ID attempt must re-drive the elected-GM transport and converge to one instance each.
  target.__faultCreate = false;
  const preCount = h.relayRequests().length;
  const fresh = h.settle(conditionCommand(src, "applyCondition", APPLY(target, "bleeding"), "atk-gw2-fresh"));
  const got = await h.waitForRelayCount(preCount + 1);
  assert.ok(got >= preCount + 1,
    `DEFECT CHECK §3.1: after a GM-side failure a new confirmed apply must re-drive the elected-GM transport (new relay request); requests stayed at ${got}`);
  await h.deliver(h.relayRequests().at(-1), { ownTarget: target });
  const out = await fresh;
  assert.equal(out.error, undefined, `fresh-ID attempt after GM recovery must resolve: ${out.error?.message}`);
  const applied = contribs(target);
  assert.ok(applied.length >= 1, "the condition is applied after recovery");
  const instanceIds = new Set(applied.map(e => instOf(e).instanceId));
  assert.equal(instanceIds.size, applied.length, "no duplicated instances from the fault + retry sequence (R2 representation)");
});

test("atk-source-final-write-failure-recovery: source final-write failure is reported; same-ID retry converges to one application with working undo", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("src-fault");
  const OP = "atk-src-fault-op";
  actor.__faultSource = true;   // fires on the FINAL flags.ak5e.conditionUses state write after target ack
  const first = await h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "dazed"), OP));
  assert.ok(first.error || first.value?.ok === false,
    "§3.1: a source final-write failure must be reported, not swallowed into false success");
  assert.equal(contribs(actor).length, 1, "target-side evidence precedes the final source acknowledgement and survives");
  const retry = await h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "dazed"), OP));
  assert.equal(retry.error, undefined, `same-ID retry must resolve, not duplicate: ${retry.error?.message}`);
  assert.equal(contribs(actor).length, 1, "exactly one contribution after fault + retry");
  assert.equal(acks(actor).filter(x => x.operationId === OP).length, 1, "exactly one acknowledgement");
  const undo = await conditionCommand(actor, "undoUse", { useId: OP }, "atk-src-fault-undo");
  assert.equal(undo.error, undefined, `undo recovery path must work after source-write recovery: ${undo.error?.message}`);
  assert.equal(contribs(actor).length, 0, "bounded removal completed");
});

test("atk-ack-failure-then-undo-target-authoritative: ack write fault recovers; revert validates against target evidence", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("ack-faulty");
  const OP = "atk-ack-op";
  actor.__faultAck = true;
  const first = await h.settle(conditionCommand(actor, "applyCondition", APPLY(actor, "necrotised"), OP));
  assert.ok(first.error || first.value?.ok === false, "acknowledgement fault must surface visibly");
  assert.equal(contribs(actor).length, 1, "target-side evidence exists even though the ack write failed");
  const retry = await conditionCommand(actor, "applyCondition", APPLY(actor, "necrotised"), OP);
  assert.equal(retry.error, undefined, `retry must complete the evidence: ${retry.error?.message}`);
  assert.equal(contribs(actor).length, 1, "and must not duplicate the effect");
  assert.equal(acks(actor).filter(x => x.operationId === OP).length, 1, "one acknowledgement after recovery");
  const undo = await conditionCommand(actor, "undoUse", { useId: OP }, "atk-ack-undo");
  assert.equal(undo.error, undefined, `undo after ack recovery must work: ${undo.error?.message}`);
  assert.equal(contribs(actor).length, 0, "bounded removal completed");
});

/* ================================================================ forged statusId / AE / entry fields */

test("atk-forged-entry-fields-rejected-by-validator: validator accepts the genuine projected entry and rejects forged statusId/paths/unbounded expiry/ready flips", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("forge-here");
  const other = h.mkActor("forge-other");
  const OP = "atk-forge-op";
  const r = await conditionCommand(actor, "applyCondition", APPLY(actor, "bleeding"), OP);
  assert.equal(r.error, undefined, `setup apply: ${r.error?.message}`);
  const receipt = receiptOf(actor, OP);
  assert.ok(receipt, "receipt recorded");
  const genuine = projectConditionEntry(structuredClone(receipt.targets[0]));
  assert.ok(genuine, "the genuine recorded entry projects");
  assert.equal(validateConditionTarget(actor, receipt, structuredClone(genuine), actor, {}), true,
    "positive control: the genuine projected entry validates (this is exactly what the relay gate checks)");

  const forgeries = {
    statusIdSwap: e => { e.key = "burning"; },
    conditionKeySwap: e => { e.condition.key = "burning"; },
    actionFlipToRemove: e => { e.action = "remove"; },
    removeAllSweep: e => { e.action = "remove"; e.instanceIds = ["every-matching-status"]; e.reason = "sweep"; },
    targetRedirect: e => { e.uuid = other.uuid; },
    instanceBogus: e => { e.instanceId = "not-an-instance"; },
    arbitraryUpdatePath: e => { e["system.attributes.hp.max"] = 9999; },
    arbitraryPayload: e => { e.condition.update = { "system.attributes.hp.max": 9999 }; },
    unboundedExpiryInf: e => { e.condition.expiry = { kind: "time", worldTime: Infinity }; },
    unboundedExpiryNaN: e => { e.condition.expiry = { kind: "time", worldTime: NaN }; },
    inventedExpiryKind: e => { e.condition.expiry = { kind: "forever" }; },
    protoParameters: e => { e.condition.parameters = JSON.parse('{"__proto__": {"ak5eForge": 1}}'); },
    readyFlipped: e => { e.ready = false; },
    kindSpoof: e => { e.kind = "hpPool"; },
    dropCondition: e => { e.condition = null; },
  };
  for (const [label, mutate] of Object.entries(forgeries)) {
    const e = structuredClone(genuine);
    mutate(e);
    let verdict;
    try { verdict = validateConditionTarget(actor, receipt, e, actor, {}); } catch { verdict = false; }
    assert.notEqual(verdict, true, `forged entry (${label}) must NOT validate (§3.4: reject arbitrary updates, forged identity, unbounded duration, prototype keys)`);
  }
  // Forged receipt identity: an impostor source may not drive the genuine entry.
  let imp;
  try { imp = validateConditionTarget(other, structuredClone({ ...receipt, id: OP }), structuredClone(genuine), other, {}); } catch { imp = false; }
  assert.notEqual(imp, true, "§3.4: forged source actor must be rejected");
  assert.equal({}.ak5eForge, undefined, "no prototype pollution through forged parameters");
  assert.equal(contribs(actor).length, 1, "the original contribution is untouched by every forgery probe");
  assert.equal(aefx(other).length, 0, "the redirect probe never touched the other actor");
});

test("atk-forged-ae-metadata-cannot-satisfy-revert-evidence: revert requires the target's own operation record, not a planted ack", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("revert-fake");
  const OP = "atk-revert-fake";
  const r = await conditionCommand(actor, "applyCondition", APPLY(actor, "taunted"), OP);
  assert.equal(r.error, undefined, `setup: ${r.error?.message}`);
  const receipt = receiptOf(actor, OP);
  const genuine = projectConditionEntry(structuredClone(receipt.targets[0]));
  // Strip the authoritative ack, then attempt revert: must fail on target evidence, not on the source receipt.
  await actor.update({ [`flags.ak5e.conditionUsesApplied.${Object.keys(actor.flags.ak5e.conditionUsesApplied ?? {}).find(k => actor.flags.ak5e.conditionUsesApplied[k].operationId === OP)}`]: null });
  let verdict;
  try { verdict = validateConditionTarget(actor, receipt, structuredClone(genuine), actor, { revert: true }); } catch { verdict = false; }
  assert.notEqual(verdict, true, "§3.1/§3.4: revert validated against authoritative TARGET evidence — a player-owned receipt alone must not authorize the revert");
});

/* ================================================================ undo after unrelated edits / remove-all */

test("atk-remove-rejects-unmanaged-and-unknown-instances: remove cannot sweep every matching status or unmanaged native markers", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("rm-scope");
  await conditionCommand(actor, "applyCondition", APPLY(actor, "poisoned"), "atk-rm-a");
  await conditionCommand(actor, "applyCondition", APPLY(actor, "poisoned"), "atk-rm-b");
  const cs = contribs(actor);
  assert.equal(cs.length, 2);
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Poisoned", icon: "x", statuses: ["poisoned"], origin: "Actor.third-party" }]);
  const unmanaged = aefx(actor).find(e => !instOf(e));
  assert.ok(unmanaged, "unmanaged marker present");
  const rm = await conditionCommand(actor, "removeCondition",
    { key: "poisoned", instanceIds: [instOf(cs[0]).instanceId], reason: "source A ended", target: actor.uuid, targetUuid: actor.uuid, confirmed: true }, "atk-rm-one");
  assert.equal(rm.error, undefined, `instance-scoped remove: ${rm.error?.message}`);
  assert.ok(contribs(actor).some(e => instOf(e).instanceId === instOf(cs[1]).instanceId), "op B contribution survives");
  assert.ok(aefx(actor).some(e => !instOf(e)), "§3.1/§3.4: the unmanaged native marker is untouched by a condition-keyed remove");
  const bad = await h.settle(conditionCommand(actor, "removeCondition",
    { key: "poisoned", instanceIds: ["not-present", instOf(contribs(actor)[0]).instanceId], reason: "sweep", target: actor.uuid, targetUuid: actor.uuid, confirmed: true }, "atk-rm-bad"));
  assert.ok(bad.error || bad.value?.ok === false || bad.value?.error, "remove with an unknown instance ID must reject before mutation");
  assert.equal(contribs(actor).length, 1, "rejection preserved the remaining instance — no delete-every-matching-status sweep");
});

test("atk-undo-after-unrelated-later-edits-restores-safe-parts-only", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("undo-later");
  const OP = "atk-undo-later";
  await conditionCommand(actor, "applyCondition", APPLY(actor, "corroded"), OP);
  await actor.update({ "system.attributes.hp.value": 10 });
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Torchlight Blessing", icon: "y", origin: "Actor.other", changes: [{ key: "system.attributes.ac", mode: 2, value: 1 }] }]);
  const authoredId = aefx(actor).find(e => e.name === "Torchlight Blessing").id;
  const undo = await conditionCommand(actor, "undoUse", { useId: OP }, "atk-undo-later-u");
  assert.equal(undo.error, undefined, `undo must remain reachable: ${undo.error?.message}`);
  assert.equal(contribs(actor).length, 0, "the operation's own contribution removed");
  assert.equal(actor.system.attributes.hp.value, 10, "later unrelated HP edit preserved (§3.1 preview conflicts and preserve later unrelated changes)");
  assert.ok(aefx(actor).some(e => e.id === authoredId), "unrelated authored effect never touched");
});

/* ================================================================ encounter-window lock */

test("atk-encounter-lock-blocks-undo-but-keeps-receipts-and-allows-new-work", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("locky");
  const OP = "atk-lock-op";
  await conditionCommand(actor, "applyCondition", APPLY(actor, "berserk"), OP);
  h.setEpoch(41);
  const lockedUndo = await conditionCommand(actor, "undoUse", { useId: OP }, "atk-lock-undo");
  assert.ok(lockedUndo.ok === false || lockedUndo.error || lockedUndo.locked, "§3.1: undo outside the current encounter window is locked");
  assert.equal(contribs(actor).length, 1, "lock blocks the revert — it never silently applied it");
  const snapBefore = snapOf(actor.flags.ak5e?.conditionUses ?? null);
  const prev = previewUndo(actor, OP);
  assert.ok(prev.locked === true || snapOf(prev.lines ?? prev).match(/lock/i), "locked undo preview is visibly marked");
  assert.equal(snapOf(actor.flags.ak5e?.conditionUses ?? null), snapBefore, "receipts are locked, NOT deleted");
  assert.ok(usesOf(actor).some(u => u.id === OP), "receipt stays enumerated for the table");
  const fresh = await conditionCommand(actor, "applyCondition", APPLY(actor, "berserk"), "atk-lock-fresh");
  assert.equal(fresh.error, undefined, "new operations in the new window still work");
  assert.equal(acks(actor).filter(x => x.operationId === "atk-lock-fresh").length, 1);
});

/* ================================================================ source deletion after apply */

test("atk-source-deleted-after-apply: contributions stay attributable, facts stay readable, and instance-scoped removal still works without the original source", async () => {
  const h = harness();
  h.game.user = h.player;
  const src = h.mkActor("doomed-src");
  const target = h.mkActor("survivor-target", { owner: false });
  const OP = "atk-del-op";
  const running = h.settle(conditionCommand(src, "applyCondition", APPLY(target, "bleeding"), OP));
  const req = await h.waitForRelayRequest();
  await h.deliver(req, { ownTarget: target });
  const applied = await running;
  assert.equal(applied.error, undefined, `relay apply: ${applied.error?.message}`);
  const cs = contribs(target);
  assert.equal(cs.length, 1);
  const iid = instOf(cs[0]).instanceId;
  // The source Actor is deleted (leaves the world entirely).
  h.game.actors.delete(src.id);
  globalThis._ak5eTestDocs.delete(src.uuid);
  let factsErr = null;
  try { const f = conditionFacts(target); assert.ok(f && f.active instanceof Set && Array.isArray(f.instances), "facts shape"); }
  catch (e) { factsErr = e; }
  assert.equal(factsErr, null, `§3.2 read contract: conditionFacts must not depend on source liveness: ${factsErr?.message}`);
  // §3.2: each contribution is independently attributable/removable — the GM removes by instance ID.
  h.game.user = h.gm; h.game.users.activeGM = h.gm; target.isOwner = true;
  const rm = await h.settle(conditionCommand(target, "removeCondition",
    { key: "bleeding", instanceIds: [iid], reason: "source vanished; table cleanup", target: target.uuid, targetUuid: target.uuid, confirmed: true }, "atk-del-rm"));
  h.game.user = h.player; target.isOwner = false;
  assert.equal(rm.error, undefined,
    `removal of an orphaned contribution by instance ID must work without the original source actor (§3.2 independently removable): ${rm.error?.message ?? snapOf(rm.value)?.slice(0, 160)}`);
  assert.equal(contribs(target).length, 0, "the instance was removed cleanly");
});

/* ================================================================ reload / registration duplication */

test("atk-setup-rerun-no-duplicate-status-registration: repeated setup + hook registration stay idempotent (reload shape)", async () => {
  const h = harness();
  const setupFns = capturedOnce.filter(([n]) => n === "setup").map(([, f]) => f);
  assert.ok(setupFns.length >= 1, "setup hook captured");
  setupFns.forEach(f => f());
  setupFns.forEach(f => f());
  const ids = globalThis.CONFIG.statusEffects.map(s => s.id);
  const ak5eIds = ids.filter(id => String(id).startsWith("ak5e-"));
  assert.equal(new Set(ak5eIds).size, ak5eIds.length,
    `AC2/WORKFLOW §3.1: no status registered twice across repeated setup — got ${ak5eIds.join(",")}`);
  assert.ok(ak5eIds.includes("ak5e-bleeding"), "custom statuses present");
  assert.equal(h.hookProblems.length, 0, `setup reruns must be hook-error free: ${h.hookProblems.join("; ")}`);
  assert.equal(registerConditionHooks(), true, "registerConditionHooks idempotent (1st)");
  assert.equal(registerConditionHooks(), true, "registerConditionHooks idempotent (repeat)");
});

/* ================================================================ Use-anyway disclosure surface (C01-visible half) */

test("atk-use-anyway-disclosure-shape: preview exposes source/target naming and a warnings array for the confirmation card", async () => {
  const h = harness();
  h.game.user = h.player;
  const actor = h.mkActor("warn-reader");
  const p = await previewUse(actor, "applyCondition", APPLY(actor, "bleeding"));
  assert.ok(p, "preview reachable");
  const shape = snapOf(p);
  assert.match(shape, /source|target/i, "§3.1: preview names source and target");
  assert.ok(Array.isArray(p.warnings), "AC5: preview must include a warnings array (even if empty) so the card can enumerate accepted 'Use anyway' disclosures");
  // AC5 "manual boundary": bare C1 conditions have no invented deadline — the preview must disclose the manual boundary.
  assert.match(shape, /manual/i,
    `AC5/§3.3: preview for a bare C1 condition must show its manual (no-invented-deadline) boundary, got ${shape.slice(0, 240)}`);
  // Unowned preview must at least be reachable and not overstate a local write.
  const unowned = h.mkActor("warn-unowned", { owner: false });
  const p2 = await previewUse(actor, "applyCondition", APPLY(unowned, "bleeding"));
  assert.ok(p2 && Array.isArray(p2.warnings), "unowned preview reachable with warnings surface");
  // Observation (not asserted): run-time discloses "Not applied yet — Retry" (covered atk-nogm…), but the
  // unowned PREVIEW itself does not pre-disclose the elected-GM retry boundary — flagged for manager adjudication.
});
