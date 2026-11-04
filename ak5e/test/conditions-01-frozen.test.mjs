/**
 * WP conditions-01 — frozen tests (tester: adversary, drafted ONLY from
 * `.codex-work/conditions/SPEC-conditions.md` §5 WP conditions-01 + §3.1–§3.4 shared
 * contracts + source C1:21,24,226–254 + WORKFLOW §3.2 conventions visible in
 * play-uses.test.mjs:1–80 / vanguard-base-use-adversarial relay fixtures /
 * base-classes-fixture.mjs mock semantics).
 *
 * Black-box phase: condition-registry.mjs and condition-uses.mjs do not exist yet.
 * Per the spec, every test that needs a new export first makes an EXPLICIT
 * missing-capability assertion (file existence), so the baseline RED is behavioral
 * ("intended missing behavior"), never a module-load crash. ak5e.mjs is imported as
 * the existing public entry point under stubbed Foundry globals (init/setup/ready
 * collected; content installers are never invoked).
 *
 * Criterion → frozen test map (baseline predictions, static):
 *  A1 registry IDs           a1-registry-exact-ids, a1-registry-unknown-and-prototype-null,
 *                            a1-registry-deep-frozen-records, a1-dying-legacy-untouched (GREEN)
 *  A2 setup registration     a2-setup-registers-custom-once (RED: 4 local statuses absent),
 *                            a2-setup-off-leaves-native-untouched (GREEN),
 *                            a2-ready-compat-api-and-command-entry (RED: new public entry),
 *                            a2-register-condition-hooks-idempotent (RED: module absent)
 *  A3 attribution/manual     a3-attributed-contribution-manual-expiry, a3-expiry-pure-normalization
 *  A4 replay idempotency     a4-replay-same-operation-idempotent,
 *                            a4-same-id-altered-request-rejected, a4-distinct-sources-separately-tracked
 *  A5 preview/cancel         a5-preview-contents-and-read-only,
 *                            a5-cancel-null-close-writes-nothing (RED today: legacy wrapper applies unconfirmed),
 *                            a5-command-reachable-from-ready
 *  A6 owned/no-GM + relay    a6-owned-apply-remove-without-gm, a6-unowned-relay-through-elected-gm,
 *                            a6-unowned-absent-gm-visible-retry, a6-relay-arbitrary-fields-rejected
 *  A7 validators             a7-validator-accepts-identity-rejects-forgery,
 *                            a7-revert-requires-authoritative-target-record
 *  A8 durable intent         a8-durable-intent-precedes-target-mutation,
 *                            a8-target-fault-retry-stable-single-application,
 *                            a8-ack-failure-retry-completes-evidence
 *  A9 remove/undo + lock     a9-undo-removes-only-operation-instances,
 *                            a9-unrelated-later-changes-preserved,
 *                            a9-encounter-lock-receipts-visible-not-deleted
 *  A10 native markers        a10-current-id-presence (GREEN today: ID-compatibility baseline),
 *                            a10-condition-facts-read-contract,
 *                            a10-projection-and-bare-statuses-are-not-evidence,
 *                            a10-static-no-statuses-set-or-wallclock-guard
 *
 * Assumptions (manager may amend the exact request keys; frozen evidence is the
 * §3.2/§3.4 persisted shapes, not data-key names):
 *  - `conditionCommand(actor, "applyCondition", data, operationId)` reads the target
 *    from `data.target`/`data.targetUuid` (a uuid string) and the canonical key from
 *    `data.key`; remove additionally accepts `data.instanceIds` + `data.reason`.
 *  - Confirmed invocations pass `data.confirmed: true` (play-uses convention); the
 *    public legacy wrappers (`game.ak5e.applyCondition(actor, key)`) must open a real
 *    DialogV2 confirmation whose nullish result (false/null/undefined) writes nothing.
 *  - Relay requests are persisted chat messages carrying `flags.ak5e.conditionUsesRelayRequest`
 *    (createPlayUses `ns:"conditionUses"` requestFlag), applied GM-side via
 *    `conditionUses.handleRelay(message, {}, requesterUserId)` — the established
 *    two-client convention from vanguard/supporter adversarial fixtures.
 *
 * No network. Deterministic operation IDs. Lane: /tmp/ak5e-lanes/conditions-01.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

/* ------------------------------------------------- capability gates (explicit RED) */

const REGISTRY_URL = new URL("../scripts/condition-registry.mjs", import.meta.url);
const USES_URL = new URL("../scripts/condition-uses.mjs", import.meta.url);

async function needRegistry() {
  assert.ok(existsSync(fileURLToPath(REGISTRY_URL)),
    "A1/A3/A10 (WP conditions-01): ak5e/scripts/condition-registry.mjs must exist with the §3.2 exports — intended baseline RED, module not yet implemented");
  return import(REGISTRY_URL);
}
async function needUses() {
  assert.ok(existsSync(fileURLToPath(USES_URL)),
    "A2–A9 (WP conditions-01): ak5e/scripts/condition-uses.mjs must exist with the §3.4 exports — intended baseline RED, module not yet implemented");
  return import(USES_URL);
}

/* ------------------------------------------------- ak5e.mjs import-time capture */

const capturedOnce = [];   // [name, fn] collected at module evaluation (defender-base-01 pattern)
const capturedOn = [];
class MixinBase {}
function installImportGlobals() {
  globalThis.Hooks = {
    once: (n, f) => capturedOnce.push([n, f]),
    on: (n, f) => capturedOn.push([n, f]),
    call: () => true, callAll: async () => true, off: () => {},
  };
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
    applications: {
      api: {
        DialogV2: { confirm: async () => true, wait: async () => true },
        HandlebarsApplicationMixin: B => class extends B {}, Application: MixinBase, ApplicationV2: MixinBase,
      },
      sheets: {}, apps: {},
    },
    documents: { Actor: MixinBase, Item: MixinBase, ActiveEffect: MixinBase, ChatMessage: MixinBase, Combat: MixinBase, Combatant: MixinBase, JournalEntry: MixinBase },
    data: {}, abstract: {},
  };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async d => d } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
}
installImportGlobals();

let ak5eLoadError = null;
try {
  // Existing public entry point: the module only registers Hooks.once(init/setup/ready)
  // at evaluation; nothing is invoked here (content installers stay un-called).
  await import("../scripts/ak5e.mjs");
} catch (e) { ak5eLoadError = e; }

/* ------------------------------------------------- per-test world harness */

const STOCK_EFFECTS = () => ([
  { id: "blinded", name: "Blinded" }, { id: "deafened", name: "Deafened" }, { id: "frightened", name: "Frightened" },
  { id: "surprised", name: "Surprised" }, { id: "poisoned", name: "Poisoned" }, { id: "invisible", name: "Invisible" },
  { id: "prone", name: "Prone" }, { id: "grappled", name: "Grappled" }, { id: "charmed", name: "Charmed" },
]);

function jsort(v) {
  if (Array.isArray(v)) return v.map(jsort);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = jsort(v[k]);
    return out;
  }
  return typeof v === "function" ? undefined : v;
}
const snapOf = o => JSON.stringify(jsort(o));
const aefx = actor => [...actor.effects.values()];
const effSnap = e => snapOf({ id: e.id, name: e.name, statuses: e.statuses ?? null, disabled: e.disabled === true, changes: e.changes ?? null, flags: e.flags ?? {} });
const effectsSnap = actor => aefx(actor).map(effSnap).sort();
const instOf = e => e.getFlag?.("ak5e", "conditionInstance");
const contribs = actor => aefx(actor).filter(e => instOf(e));
const acks = actor => Object.values(actor.flags?.ak5e?.conditionUsesApplied ?? {});

function harness(opts = {}) {
  const { chapterOneRules = true, hooks = ["init", "setup", "ready"] } = opts;
  assert.equal(ak5eLoadError, null,
    `HARNESS: ak5e.mjs must import under stubbed Foundry globals for init/setup/ready collection: ${ak5eLoadError?.message ?? ""}`);

  const settingsObj = { "ak5e.chapterOneRules": chapterOneRules, "ak5e.encounterEpoch": 0 };
  const env = setupFoundryGlobals({ settings: settingsObj });
  const game = globalThis.game;
  game.system = { id: "dnd5e" };
  game.packs ??= [];
  game.modules ??= new Map();
  game.socket ??= { on() {}, emit() {} };
  game.settings.register = () => {};
  game.settings.registerMenu = () => {};
  const settingsWrites = [];
  const rawSet = game.settings.set.bind(game.settings);
  game.settings.set = (...a) => { settingsWrites.push(a); return rawSet(...a); };

  globalThis.CONFIG.statusEffects = STOCK_EFFECTS();
  globalThis.CONFIG.DND5E = Object.assign({ tools: {}, toolProficiencies: {}, skills: {}, conditions: {}, constants: {} },
    globalThis.CONFIG.DND5E);
  globalThis.CONFIG.AK5E ??= {};
  const dialog = { mode: true, calls: [] };
  const dval = () => (typeof dialog.mode === "function" ? dialog.mode() : dialog.mode);
  globalThis.foundry.applications = { api: { DialogV2: {
    async confirm(o) { dialog.calls.push({ kind: "confirm", options: o }); return dval(); },
    async wait(o) { dialog.calls.push({ kind: "wait", options: o }); return dval(); },
  } } };

  const events = [];          // cross-actor ordering journal (A8)
  let counter = 0;
  globalThis.foundry.utils.randomID = () => `det-${++counter}`;

  const gm = { id: "gm", name: "Gamemaster", isGM: true };
  const player = { id: "player", name: "Player", isGM: false };

  const mkActor = (id, { owner = true, as = player } = {}) => {
    const actor = createTestActor({ id, name: id.replace(/-/g, " "), owner,
      ownership: { default: owner ? 3 : 0, [as.id]: owner ? 3 : 0 } });
    actor.statuses = new Set();                 // native transient status surface; A10 forbids it as the operation carrier
    game.actors.set(actor.id, actor);
    globalThis._ak5eTestDocs.set(actor.uuid, actor);
    const rawUpdate = actor.update.bind(actor);
    actor.update = async (changes, options) => {
      if (actor.__faultAck && Object.keys(changes).some(p => p.startsWith("flags.ak5e.conditionUsesApplied"))) {
        actor.__faultAck = false;
        throw new Error("simulated authoritative-target acknowledgement write fault");
      }
      events.push({ ev: "update", actor: actor.id, paths: Object.keys(changes) });
      return rawUpdate(changes, options);
    };
    const rawCreate = actor.createEmbeddedDocuments.bind(actor);
    actor.createEmbeddedDocuments = async (type, entries, options) => {
      if (actor.__faultCreate && type === "ActiveEffect") {
        actor.__faultCreate = false;
        throw new Error("simulated embedded-create fault");
      }
      events.push({ ev: "create", actor: actor.id, type, count: (entries ?? []).length });
      const docs = await rawCreate(type, entries, options);
      if (type === "ActiveEffect") {
        // Fidelity patch: the shared Item mock drops AE-only `statuses`; real AE docs keep them.
        docs.forEach((doc, i) => { doc.statuses = structuredClone(entries[i]?.statuses ?? []); });
      }
      return docs;
    };
    return actor;
  };

  const hookProblems = [];
  for (const name of hooks) {
    for (const [n, fn] of capturedOnce.filter(([n2]) => n2 === name)) {
      if (n !== name) continue;
      try { fn(); } catch (e) { hookProblems.push(`${name}: ${e.message}`); }
    }
  }

  const relayRequests = () => game.messages.filter(m => Object.keys(m.flags?.ak5e ?? {}).some(k => /conditionUsesRelayRequest$/.test(k)));
  const waitForRelayRequest = async () => {
    for (let i = 0; i < 2000; i++) {
      const req = relayRequests()[0];
      if (req) return req;
      await new Promise(resolve => setImmediate(resolve));
    }
    return null;
  };
  const settle = p => p.then(value => ({ value }), error => ({ error }));
  const setEpoch = n => { settingsObj["ak5e.encounterEpoch"] = n; };

  return { game, env, events, dialog, gm, player, mkActor, settingsWrites, relayRequests,
    waitForRelayRequest, settle, setEpoch, hookProblems, messages: game.messages };
}

const APPLY = (target, key) => ({ key, target: target.uuid, targetUuid: target.uuid, confirmed: true });

/* ============================================================ A1 — registry IDs */

test("a1-registry-exact-ids: every C1 and requested local/native key resolves to the exact §3.2 statusId; declared aliases only, no name guessing", async () => {
  const reg = await needRegistry();
  const EXPECT = {
    // Ten C1 keys (C1:21,24,226–254)
    frightened: "frightened", surprised: "surprised",
    bleeding: "ak5e-bleeding", burning: "ak5e-burning", corroded: "ak5e-corroded",
    dazed: "ak5e-dazed", frozen: "ak5e-frozen", necrotised: "ak5e-necrotised",
    "nervous-impairment": "ak5e-nervous-impairment", silenced: "ak5e-silenced",
    // requested local statuses (C3:1639,1653,5715; C5:1296) — IDs never shortened/renamed
    berserk: "ak5e-berserk", taunted: "ak5e-taunted",
    "off-balance": "ak5e-off-balance", doomed: "ak5e-doomed",
    // native delegates: stock IDs unchanged, no general replacement
    poisoned: "poisoned", invisible: "invisible", prone: "prone", grappled: "grappled",
  };
  for (const [key, statusId] of Object.entries(EXPECT)) {
    const rec = reg.conditionDefinition(key);
    assert.ok(rec, `conditionDefinition("${key}") must resolve to a record`);
    assert.equal(rec.statusId, statusId, `key "${key}" must map to the exact statusId ${statusId}`);
    assert.equal(rec.key, key, `record key must round-trip for "${key}"`);
    // …and resolve the same record by its exact statusId
    const byId = reg.conditionDefinition(statusId);
    assert.equal(byId?.key, key, `conditionDefinition("${statusId}") must resolve the same key`);
  }
  // The ONLY declared alias: offBalance → off-balance (explicit alias, §3.2).
  assert.equal(reg.conditionDefinition("offBalance")?.key, "off-balance");
  // Names are never guessed from prose; undeclared casing/spelling variants resolve null.
  for (const guess of ["Off Balance", "offbalance", "OFFBalance", "Nervous Impairment",
    "nervousImpairment", "nervous_impairment", "ak5e-off-balance-2", "not-a-condition", "poison"]) {
    assert.equal(reg.conditionDefinition(guess), null, `"${guess}" is not a declared key/alias → null (no prose guessing)`);
  }
});

test("a1-registry-unknown-and-prototype-null: prototype/path keys resolve null and cannot create effects", async () => {
  const reg = await needRegistry();
  for (const proto of ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(reg.conditionDefinition(proto), null, `prototype member "${proto}" must never resolve as a condition`);
  }
  for (const bad of ["__proto__", "constructor", "not-a-condition"]) {
    let produced = "no-throw";
    try {
      produced = reg.conditionEffectData({ key: bad, sourceActorUuid: "Actor.s", operationId: "op-p", instanceId: "i-p" });
    } catch { /* rejection by throw is acceptable */ }
    assert.ok(produced == null || produced === false,
      `conditionEffectData for unknown/prototype key "${bad}" must not produce effect data (no effects can be created)`);
  }
  // And the prototype itself stays clean after the probes above.
  assert.equal({}.ak5eConditionPollution, undefined, "no prototype pollution through registry lookups");
});

test("a1-registry-deep-frozen-records: CONDITION_DEFINITIONS is a deeply frozen own-key map of §3.2 records", async () => {
  const reg = await needRegistry();
  assert.ok(reg.CONDITION_DEFINITIONS, "CONDITION_DEFINITIONS must be exported");
  assert.ok(Object.getPrototypeOf(reg.CONDITION_DEFINITIONS) === Object.prototype || Object.isFrozen(reg.CONDITION_DEFINITIONS),
    "CONDITION_DEFINITIONS must be a plain own-key map");
  assert.ok(Object.isFrozen(reg.CONDITION_DEFINITIONS), "CONDITION_DEFINITIONS itself must be frozen");
  const requiredFields = ["key", "statusId", "name", "img", "scope", "source", "manual", "mechanics"];
  const keys = Object.keys(reg.CONDITION_DEFINITIONS);
  assert.ok(keys.length >= 10, `registry must cover the ten C1 keys plus requested locals (found ${keys.length})`);
  for (const key of keys) {
    const rec = reg.CONDITION_DEFINITIONS[key];
    assert.ok(Object.isFrozen(rec), `record "${key}" must be frozen`);
    for (const field of requiredFields) {
      assert.ok(field in rec, `record "${key}" must declare §3.2 field "${field}"`);
      assert.ok(!rec[field] || Object.getPrototypeOf(rec[field]) === Object.prototype || Array.isArray(rec[field])
        || typeof rec[field] !== "object", `record "${key}.${field}" must be plain data`);
    }
    // deep freeze sample: nested mechanics data cannot be mutated into new state
    if (rec.mechanics && typeof rec.mechanics === "object") {
      assert.ok(snapOf(rec.mechanics) === snapOf(structuredClone(rec.mechanics)), "frozen records are plain-cloneable");
    }
    const before = snapOf(rec);
    try { rec.statusId = "hacked"; } catch { /* strict throw is fine */ }
    assert.equal(snapOf(rec), before, `record "${key}" must resist mutation (deeply frozen)`);
  }
});

test("a1-dying-legacy-untouched: ak5e-dying keeps the exact legacy internal path (no confirmation, no condition-use state)", async () => {
  const h = harness();
  const target = h.mkActor("dying-target", { owner: true });
  const result = await h.game.ak5e.applyCondition(target, "dying");
  const dyingAe = aefx(target).find(e => (e.statuses ?? []).includes("ak5e-dying"));
  assert.ok(dyingAe, "legacy ak5e-dying application must still work through the existing path");
  assert.equal(h.dialog.calls.length, 0, "internal dying path must never become a condition-use confirmation prompt (spec §5 WP-01)");
  assert.equal(target.flags.ak5e.conditionUses, undefined, "dying applications must not create condition-use state");
  assert.deepEqual(acks(target), [], "dying applications must not create conditionUsesApplied receipts");
});

/* ============================================================ A2 — setup registration + ready API */

const CUSTOM_STATUS_IDS = ["ak5e-bleeding", "ak5e-burning", "ak5e-corroded", "ak5e-dazed", "ak5e-frozen",
  "ak5e-necrotised", "ak5e-nervous-impairment", "ak5e-silenced",
  "ak5e-berserk", "ak5e-taunted", "ak5e-off-balance", "ak5e-doomed"];

test("a2-setup-registers-custom-once: chapterOneRules on registers each custom registry status exactly once, keeps ak5e-dying, and never re-adds on repeated setup", async () => {
  const h = harness();
  assert.deepEqual(h.hookProblems, [], `bootstrap hooks must run clean: ${h.hookProblems.join("; ")}`);
  const ids = () => globalThis.CONFIG.statusEffects.map(e => e.id);
  for (const id of CUSTOM_STATUS_IDS) {
    assert.equal(ids().filter(x => x === id).length, 1, `custom status ${id} must be registered exactly once at setup`);
  }
  assert.ok(ids().includes("ak5e-dying"), "the existing ak5e-dying status record stays untouched");
  // stock native entries are untouched by registration (present, unchanged objects)
  for (const stock of STOCK_EFFECTS()) {
    assert.deepEqual(globalThis.CONFIG.statusEffects.find(e => e.id === stock.id), stock,
      `stock status ${stock.id} must remain exactly as installed`);
  }
  // idempotent: re-running setup adds nothing
  const before = ids().length;
  for (const [n, fn] of capturedOnce.filter(([n2]) => n2 === "setup")) fn();
  assert.equal(ids().length, before, "setup must remain idempotent");
});

test("a2-setup-off-leaves-native-untouched: chapterOneRules off leaves D&D status configuration unmodified", async () => {
  const h = harness({ chapterOneRules: false });
  assert.deepEqual(globalThis.CONFIG.statusEffects, STOCK_EFFECTS(),
    "with the world switch off, no AK5e status (including dying) may be registered");
});

test("a2-ready-compat-api-and-command-entry: ready exposes the backwards-compatible dictionary AND the new command path, with zero imports/world mutation", async () => {
  const h = harness();
  const api = h.game.ak5e;
  assert.ok(api, "game.ak5e must exist after ready");
  // Existing compatibility surface, preserved (spec: keep the dictionary, don't change its API type).
  assert.equal(typeof api.conditions, "object");
  assert.equal(api.conditions.bleeding?.id, "ak5e-bleeding");
  assert.equal(api.conditions["nervous-impairment"]?.name, "Nervous Impairment");
  assert.equal(api.conditions.dying?.id, "ak5e-dying");
  assert.equal(typeof api.applyCondition, "function");
  assert.equal(typeof api.removeCondition, "function");
  // New public entries on the SAME ready object (RED baseline: intended missing new public entry).
  assert.equal(typeof api.conditionCommand, "function",
    "A2 (WP conditions-01): ready must expose game.ak5e.conditionCommand — intended baseline RED (new public entry not yet wired)");
  assert.ok(api.conditionRegistry, "A2: game.ak5e.conditionRegistry must be exposed from ready");
  assert.ok(api.conditionUses, "A2: game.ak5e.conditionUses must be exposed from ready");
  // No bootstrap side effects: no world-setting writes, no chat traffic from the module wiring.
  assert.deepEqual(h.settingsWrites, [], "setup/ready must not write world settings");
  assert.equal(h.game.messages.length, 0, "setup/ready must not post chat messages");
});

test("a2-register-condition-hooks-idempotent: registerConditionHooks returns a boolean and repeat registration adds no duplicate listeners", async () => {
  const uses = await needUses();
  const h = harness();   // ready already invoked the wiring once on this fixture's Hooks
  assert.equal(typeof uses.registerConditionHooks, "function", "§3.4: condition-uses must export registerConditionHooks");
  const listenerCount = () => [...globalThis.Hooks._hooks.values()].reduce((n, list) => n + list.length, 0);
  const before = listenerCount();
  const again = uses.registerConditionHooks();
  assert.equal(typeof again, "boolean", "registerConditionHooks() -> boolean (§3.4)");
  assert.equal(listenerCount(), before, "hook registration must be idempotent — no duplicate relay listeners on repeat calls");
});

/* ============================================================ A3 — attribution + manual expiry */

test("a3-attributed-contribution-manual-expiry: confirmed apply creates one source-attributed contribution with normalized {kind:'manual'} expiry and an authoritative target receipt", async () => {
  const [reg, uses] = [await needRegistry(), await needUses()];
  const h = harness();
  const source = h.mkActor("surgeon");
  const target = h.mkActor("patient", { owner: true });
  const OP = "op-a3-apply-1";
  const result = await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  assert.ok(result, `confirmed applyCondition must return an operation result (got ${JSON.stringify(result)})`);

  const created = contribs(target);
  assert.equal(created.length, 1, "exactly one contribution AE per confirmed apply");
  const meta = instOf(created[0]);
  assert.equal(meta.version, 1, "conditionInstance metadata version must be 1 (§3.2)");
  assert.equal(meta.key, "bleeding", "canonical condition identity is condition.key");
  assert.equal(meta.operationId, OP);
  assert.ok(meta.instanceId, "instanceId must be a stable non-empty value");
  assert.equal(meta.sourceActorUuid, source.uuid, "contribution must be attributed to the acting source actor");
  assert.ok("sourceItemUuid" in meta, "sourceItemUuid is part of the frozen metadata shape");
  // Bare C1 conditions default to MANUAL — no invented 1-minute/1-hour duration (C1:226).
  assert.deepEqual(meta.expiry, { kind: "manual" },
    "A3: C1 bare Bleeding must normalize to {kind:'manual'} expiry, never a made-up duration");
  assert.ok(Array.isArray(meta.parameters), "parameters present (object/array per §3.2 — must be plain)");
  // §3.2: contributions carry none of the base native changes.
  assert.deepEqual(created[0].changes ?? [], [], "contribution AEs contain no base stat changes (projection owns those in C02)");
  assert.deepEqual([...(created[0].statuses ?? [])], ["ak5e-bleeding"], "contribution exposes the exact registered statusId");

  // Authoritative target acknowledgement (§3.4).
  const ackList = acks(target);
  assert.equal(ackList.length, 1, "target must hold exactly one authoritative operation record");
  const ack = ackList[0];
  assert.equal(ack.operationId, OP);
  assert.equal(ack.instanceId, meta.instanceId);
  assert.equal(ack.action, "apply");
  assert.ok(Array.isArray(ack.effectIds) && ack.effectIds.length === 1, "ack lists the exact effect ids it owns");
  assert.ok(ack.status, "ack carries a status field");

  // One public result card for this operation (§3.1 public result/card).
  assert.ok(h.game.messages.length >= 1, "a public result card must exist for the applied operation");

  // and the registry-side pure helper agrees
  const expiry = reg.conditionExpiry({ kind: "manual" }, { worldTime: 500 });
  assert.deepEqual(expiry, { kind: "manual" });
});

test("a3-expiry-pure-normalization: conditionExpiry/conditionExpired are pure; manual never expires; time uses world time, never wall clock", async () => {
  const reg = await needRegistry();
  // Bare/no spec → manual default (durations only from cited consumers).
  assert.deepEqual(reg.conditionExpiry({}, { worldTime: 999 }), { kind: "manual" },
    "an unspecified expiry normalizes to manual, not a fabricated deadline");
  const t = reg.conditionExpiry({ kind: "time", worldTime: 100 }, { worldTime: 900 });
  assert.deepEqual(t, { kind: "time", worldTime: 100 }, "absolute world time is preserved verbatim");
  assert.equal(reg.conditionExpired(t, { worldTime: 99 }), false);
  assert.equal(reg.conditionExpired(t, { worldTime: 100 }), true, "expiry at the exact boundary");
  assert.equal(reg.conditionExpired(t, { worldTime: 101 }), true);
  assert.equal(reg.conditionExpired({ kind: "manual" }, { worldTime: 10 ** 9 }), false,
    "a manual condition never self-expires, no matter the clock (C1:226–254 have no invented lifetime)");
  assert.equal(reg.conditionExpired({ kind: "any", entries: [{ kind: "time", worldTime: 50 }, { kind: "time", worldTime: 80 }] },
    { worldTime: 60 }), true, "any() ends on the earliest explicit deadline");
});

/* ============================================================ A4 — replay idempotency */

test("a4-replay-same-operation-idempotent: repeating the same stable operation ID resumes and re-spends/re-applies nothing", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("medic-a");
  const target = h.mkActor("wounded-a", { owner: true });
  const OP = "op-a4-replay";
  const first = await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  assert.ok(first, "first confirmed apply must succeed");
  const effectsAfter = effectsSnap(target);
  const messagesAfter = h.game.messages.length;

  const replay = await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  assert.ok(replay, `a repeated stable operation ID must resume with a result, not error out (got ${JSON.stringify(replay)})`);
  assert.deepEqual(effectsSnap(target), effectsAfter, "replay must not re-apply: contribution count unchanged");
  assert.equal(contribs(target).length, 1);
  assert.equal(h.game.messages.length, messagesAfter, "replay must not duplicate public cards");
  const ack = acks(target).filter(a => a.operationId === OP);
  assert.equal(ack.length, 1, "still exactly one authoritative record for the operation");
});

test("a4-same-id-altered-request-rejected: same operation ID with altered payload is rejected BEFORE any further mutation", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("medic-b");
  const target = h.mkActor("wounded-b", { owner: true });
  const OP = "op-a4-altered";
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  const effectsAfter = effectsSnap(target);
  const writesAfter = target.writes.length;

  // Same ID, different choices (different key) — must reject without touching the target again.
  const altered = await h.settle(h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "burning"), OP));
  if (!altered.error) {
    assert.ok(altered.value?.error || altered.value?.rejected || altered.value?.ok === false,
      `A4: altered same-ID request must be reported as rejected (got ${snapOf(altered.value)})`);
  }
  assert.deepEqual(effectsSnap(target), effectsAfter, "rejected altered request must write nothing to the target");
  assert.equal(target.writes.length, writesAfter, "rejected altered request must not even journal a new target write");
});

test("a4-distinct-sources-separately-tracked: a contribution from another source survives and is tracked separately (R2 representation)", async () => {
  const reg = await needRegistry();
  const h = harness();
  const s1 = h.mkActor("lasher");
  const s2 = h.mkActor("sawblade");
  const target = h.mkActor("victim", { owner: true });
  await h.game.ak5e.conditionCommand(s1, "applyCondition", APPLY(target, "bleeding"), "op-a4-src1");
  await h.game.ak5e.conditionCommand(s2, "applyCondition", APPLY(target, "bleeding"), "op-a4-src2");

  const list = contribs(target);
  assert.equal(list.length, 2, "distinct applications remain separately tracked");
  const metas = list.map(instOf);
  assert.notEqual(metas[0].instanceId, metas[1].instanceId, "each contribution owns a distinct instanceId");
  const facts = reg.conditionFacts(target);
  assert.ok(facts.active.has("bleeding"), "status present while any source remains");
  assert.equal(facts.instances.length, 2, "both source instances visible in facts");
  // R2 representation: neither contribution smuggles stacked base penalties.
  for (const ae of list) assert.deepEqual(ae.changes ?? [], [], "base penalties/ticks do not stack by default (R2)");
});

/* ============================================================ A5 — preview / cancel */

test("a5-preview-contents-and-read-only: preview names source, target, manual boundary and warnings — and writes nothing", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("previewer");
  const target = h.mkActor("preview-target", { owner: true });
  const before = { effects: effectsSnap(target), writes: target.writes.length, messages: h.game.messages.length };

  const p = uses.preview(source, "applyCondition", { key: "bleeding", target: target.uuid, targetUuid: target.uuid });
  const text = snapOf(typeof p?.toPlain === "function" ? p.toPlain() : p);
  assert.ok(p, "preview must return a structure");
  assert.ok(text.includes(target.uuid) || text.includes(target.name), `preview must name the target (got ${text.slice(0, 400)})`);
  assert.ok(text.includes(source.uuid) || text.includes(source.name), "preview must name the source");
  assert.match(text, /manual/i, "preview must disclose the manual expiry boundary for bare C1 conditions");
  assert.ok(Array.isArray(p.warnings) || /warnings/i.test(text), "preview must expose a warnings surface (§3.1)");
  assert.deepEqual(effectsSnap(target), before.effects, "previewing must create no effects");
  assert.equal(target.writes.length, before.writes, "previewing must write no documents");
  assert.equal(h.game.messages.length, before.messages, "previewing must post no cards");
});

for (const [label, mode] of [["undefined (dialog close)", undefined], ["null", null], ["false (Cancel button)", false]]) {
  test(`a5-cancel-null-close-writes-nothing: manual apply via the legacy wrapper with dialog ${label} writes nothing`, async () => {
    const h = harness();
    const target = h.mkActor("sleepy", { owner: true, as: h.player });
    h.game.user = h.player;
    h.dialog.mode = mode;
    const result = await h.game.ak5e.applyCondition(target, "bleeding");
    assert.ok(h.dialog.calls.length >= 1,
      `A5: legacy applyCondition must open a confirmation for non-dying manual invocations (no dialog opened) — intended baseline RED`);
    assert.ok(result == null, "a cancelled manual apply returns nullish");
    assert.equal(aefx(target).length, 0, `cancel (${label}) must create zero effects`);
    assert.equal(target.writes.length, 0, `cancel (${label}) must write zero documents`);
    assert.equal(h.game.messages.length, 0, `cancel (${label}) must post zero cards`);
  });
}

test("a5-command-reachable-from-ready: the command path works through the ready API object, not only a direct module import", async () => {
  await needUses();
  const h = harness();
  const api = h.game.ak5e;
  assert.equal(typeof api?.conditionCommand, "function",
    "A5: game.ak5e.conditionCommand must be reachable from ready (API smoke, not direct import)");
  const target = h.mkActor("ready-target", { owner: true });
  const owner = h.mkActor("ready-self", { owner: true });
  const result = await api.conditionCommand(owner, "applyCondition", { key: "silenced", target: target.uuid, targetUuid: target.uuid, confirmed: true }, "op-a5-ready");
  assert.ok(result, `ready API command path must execute a confirmed apply (got ${JSON.stringify(result)})`);
  assert.equal(contribs(target).length, 1, "and it must reach the same §3.2 contribution representation");
});

/* ============================================================ A6 — owned / relay / no-GM */

test("a6-owned-apply-remove-without-gm: owned apply/remove needs no connected GM", async () => {
  const uses = await needUses();
  const h = harness();
  h.game.user = h.player;
  h.game.users.activeGM = null;                        // no GM connected at all
  const owner = h.mkActor("owner-no-gm", { owner: true });
  const OP = "op-a6-owned";
  const applied = await h.game.ak5e.conditionCommand(owner, "applyCondition", APPLY(owner, "burning"), OP);
  assert.ok(applied, "owned-target apply must succeed with no GM connected");
  assert.equal(contribs(owner).length, 1);
  assert.deepEqual(h.relayRequests(), [], "owned mutations must not relay through a GM socket");

  const meta = instOf(contribs(owner)[0]);
  const removed = await h.game.ak5e.conditionCommand(owner, "removeCondition",
    { key: "burning", target: owner.uuid, targetUuid: owner.uuid, instanceIds: [meta.instanceId], reason: "test removal", confirmed: true }, "op-a6-owned-rm");
  assert.ok(removed, "owned remove must succeed with no GM");
  assert.equal(contribs(owner).length, 0, "remove takes the contribution down");
});

test("a6-unowned-relay-through-elected-gm: unowned targets relay automatically through the elected GM transport", async () => {
  const uses = await needUses();
  const h = harness();
  h.game.user = h.player;
  const source = h.mkActor("caster-side");
  const target = h.mkActor("hostile-token", { owner: false });   // player does NOT own it
  const OP = "op-a6-relay";

  const running = h.settle(h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "nervous-impairment"), OP));
  const request = await h.waitForRelayRequest();
  assert.ok(request, "the unowned target change must persist a GM relay request (automatic transport, no approval dialog)");
  assert.equal(aefx(target).length, 0, "the player side must never directly change an unowned target");

  h.game.user = h.gm;
  target.isOwner = true;                                          // GM client holds the document
  try { await uses.conditionUses.handleRelay(request, {}, h.player.id); } finally { h.game.user = h.player; target.isOwner = false; }
  globalThis.Hooks.callAll("updateChatMessage", request);
  const outcome = await running;
  assert.ok(!outcome.error, `relayed apply must resolve: ${outcome.error?.message ?? ""}`);
  assert.equal(contribs(target).length, 1, "GM-side relay creates exactly the attributed contribution");
  assert.equal(instOf(contribs(target)[0]).sourceActorUuid, source.uuid, "attribution survives the relay");
  assert.equal(acks(target).filter(a => a.operationId === OP).length, 1, "authoritative target acknowledgement written on the GM side");
});

test("a6-unowned-absent-gm-visible-retry: unowned target with no GM yields a visible 'Not applied yet — Retry', never a silent queue", async () => {
  const uses = await needUses();
  const h = harness();
  h.game.user = h.player;
  h.game.users.activeGM = null;
  const source = h.mkActor("retry-source");
  const target = h.mkActor("untouchable", { owner: false });
  const OP = "op-a6-nogm";

  const outcome = await h.settle(h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP));
  assert.ok(!outcome.error || snapOf(outcome.error).match(/retry|not applied/i),
    `absent-GM unowned apply must resolve as a visible retryable status, not throw silently (got ${outcome.error?.message})`);
  const evidence = snapOf(outcome.value) + snapOf(source.flags.ak5e?.conditionUses ?? null);  assert.match(evidence, /not applied|retry|pending/i,
    "A6: the result/receipt must tell the user it was Not applied yet and offer Retry (§3.1)");
  assert.equal(aefx(target).length, 0, "no target write without a GM");
  assert.equal(target.writes.length, 0, "and no target update journal — never a silent queue that applies later without the user");
});

test("a6-relay-arbitrary-fields-rejected: a forged relay payload carrying arbitrary update paths cannot change the target", async () => {
  const uses = await needUses();
  const h = harness();
  h.game.user = h.player;
  const source = h.mkActor("forged-src");
  const target = h.mkActor("forged-target", { owner: false });
  const OP = "op-a6-forge";
  const running = h.settle(h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP));
  const request = await h.waitForRelayRequest();
  assert.ok(request, "legit relay request captured for tampering");

  // Tamper: inject an arbitrary document-update payload into every object entry we can reach.
  const tamper = node => {
    if (Array.isArray(node)) { node.forEach(tamper); return; }
    if (node && typeof node === "object") {
      Object.values(node).forEach(tamper);
      if (node.kind === "condition" || node.condition || node.instanceId !== undefined || node.action) {
        node["system.attributes.hp.max"] = 9999;
        node.update = { "system.attributes.hp.max": 9999 };
      }
    }
  };
  const flagKey = Object.keys(request.flags.ak5e).find(k => /conditionUsesRelayRequest$/.test(k));
  const payload = request.flags.ak5e[flagKey];
  if (typeof payload === "string") { try { tamper(JSON.parse(payload)); } catch {} }
  else tamper(payload);

  const hpBefore = target.system.attributes.hp.max;
  h.game.user = h.gm;
  target.isOwner = true;
  let relayError = null;
  try { await uses.conditionUses.handleRelay(request, {}, h.player.id); } catch (e) { relayError = e; }
  finally { h.game.user = h.player; target.isOwner = false; }
  globalThis.Hooks.callAll("updateChatMessage", request);

  assert.equal(target.system.attributes.hp.max, hpBefore, "arbitrary update payloads must NEVER reach the document");
  assert.equal(aefx(target).length, 0, "tampered request must not apply its effect either (rejected as a whole)");
});

/* ============================================================ A7 — validators */

test("a7-validator-accepts-identity-rejects-forgery: validateConditionTarget accepts exact registered identity and rejects forged/unbounded/arbitrary shapes", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("validator-src");
  const target = h.mkActor("validator-target", { owner: true });
  const OP = "op-a7-valid";
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  const ae = contribs(target)[0];
  const meta = instOf(ae);
  assert.ok(meta, "setup: contribution exists");
  const receipt = uses.conditionUses.receipt?.(source, OP) ?? (source.flags.ak5e.conditionUses?.undo ?? []).find(u => u.id === OP);
  assert.ok(receipt, "setup: source receipt exists for the operation");

  const realEntry = { kind: "condition", uuid: target.uuid, key: "bleeding", action: "apply",
    instanceId: meta.instanceId, condition: { key: "bleeding", expiry: { kind: "manual" }, parameters: {}, overlay: null }, ready: true };
  assert.equal(uses.validateConditionTarget(source, receipt, realEntry, target), true, "positive control: exact identity validates");

  const forgeries = {
    "redirected target": { ...realEntry, uuid: h.mkActor("other-actor", { owner: true }).uuid },
    "wrong actor object": [source, receipt, realEntry, h.mkActor("wrong-actor", { owner: true })],
    "remove-all (missing instanceIds)": { ...realEntry, action: "remove", condition: { key: "bleeding" }, instanceIds: [] },
    "mismatched instance identity": { ...realEntry, instanceId: "totally-made-up" },
    "unknown canonical key": { ...realEntry, condition: { ...realEntry.condition, key: "not-a-condition" } },
    "prototype key": { ...realEntry, condition: { ...realEntry.condition, key: "__proto__" } },
    "unbounded time expiry": { ...realEntry, condition: { ...realEntry.condition, expiry: { kind: "time", worldTime: Infinity } } },
    "NaN expiry": { ...realEntry, condition: { ...realEntry.condition, expiry: { kind: "time", worldTime: NaN } } },
    "arbitrary update field": { ...realEntry, update: { "system.attributes.hp.max": 9999 } },
  };
  for (const [label, entry] of Object.entries(forgeries)) {
    const args = label === "wrong actor object" ? entry : [source, receipt, entry, target];
    const verdict = uses.validateConditionTarget(...args);
    assert.equal(verdict, false, `A7: forged request "${label}" must be rejected by validateConditionTarget`);
  }
  // Unknown command kinds cannot be smuggled through the discriminated union.
  assert.equal(uses.validateConditionTarget(source, receipt,
    { kind: "snapshot", uuid: target.uuid, restore: true, ready: true }, target), false,
    "generic snapshot payloads are not a valid target entry (§3.4)");
});

test("a7-revert-requires-authoritative-target-record: revert validation requires the target's own operation record, not just a source receipt", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("revert-src");
  const target = h.mkActor("revert-target", { owner: true });
  const OP = "op-a7-revert";
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "frozen"), OP);
  const meta = instOf(contribs(target)[0]);
  const receipt = uses.conditionUses.receipt?.(source, OP);
  const removeEntry = { kind: "condition", uuid: target.uuid, key: "frozen", action: "remove",
    instanceIds: [meta.instanceId], reason: "adjudicated removal", condition: { key: "frozen" }, ready: true };

  assert.equal(uses.validateConditionTarget(source, receipt, removeEntry, target, { revert: true }), true,
    "positive control: revert with authoritative target record validates");

  // A target with no acknowledgement of this operation must refuse the revert.
  const stranger = h.mkActor("no-ack-target", { owner: true });
  assert.equal(uses.validateConditionTarget(source, receipt,
    { ...removeEntry, uuid: stranger.uuid }, stranger, { revert: true }), false,
    "revert against a target lacking the authoritative operation record must be rejected (forged receipt/snapshot)");
});

/* ============================================================ A8 — durable intent ordering + fault injection */

test("a8-durable-intent-precedes-target-mutation: the source's durable intent is journaled before any target write", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("intent-src");
  const target = h.mkActor("intent-target", { owner: true });
  const OP = "op-a8-order";
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "corroded"), OP);

  const intentIdx = h.events.findIndex(ev => ev.actor === source.id && ev.paths.some(p => p.includes("conditionUses")));
  const targetIdx = h.events.findIndex(ev => ev.actor === target.id);
  assert.ok(intentIdx >= 0, "durable source intent (flags.ak5e.conditionUses…) must be written before the operation completes");
  assert.ok(targetIdx >= 0, "target mutation occurred");
  assert.ok(intentIdx < targetIdx, `source intent (event ${intentIdx}) must precede the first target mutation (event ${targetIdx}) — §3.1`);
});

test("a8-target-fault-retry-stable-single-application: prewrite failure leaves no target change; retry with the same ID applies exactly once", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("fault-src");
  const target = h.mkActor("fault-target", { owner: true });
  target.__faultCreate = true;
  const OP = "op-a8-fault";

  const first = await h.settle(h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP));
  assert.equal(aefx(target).length, 0, "injected create fault must leave the target untouched");
  assert.ok(source.flags.ak5e?.conditionUses,
    "durable source intent/evidence must survive the target-side fault (stable same-ID retry) — §3.1/B-312 pattern");
  assert.equal(h.relayRequests().length, 0, "owned flow, no relay artifacts left behind");

  const second = await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  assert.ok(second, `retry after a target-side fault must resume and succeed (got ${JSON.stringify(second)})`);
  assert.equal(contribs(target).length, 1, "fault + retry must produce exactly one contribution, never two");
  assert.equal(acks(target).filter(a => a.operationId === OP).length, 1, "one stable acknowledgement record after retry");
});

test("a8-ack-failure-retry-completes-evidence: final acknowledgement failure recovers without duplicating the effect", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("ack-src");
  const target = h.mkActor("ack-target", { owner: true });
  target.__faultAck = true;
  const OP = "op-a8-ack";

  const first = await h.settle(h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "burning"), OP));
  // Effect may exist; ack write failed → visible retry evidence, no silent loss.
  assert.ok(first.value || first.error, "ack failure must surface a result/error, never hang silently");

  const second = await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "burning"), OP);
  assert.ok(second, "retry must complete the operation");
  assert.equal(contribs(target).length, 1, "retrying after an acknowledged-but-failed final write must not re-apply a second effect");
  const ack = acks(target).filter(a => a.operationId === OP);
  assert.equal(ack.length, 1, "target-side evidence precedes source completion — exactly one ack after recovery");
  assert.ok(["applied", "done", "complete", "confirmed", "ok"].some(w => String(ack[0].status).toLowerCase().includes(w.slice(0, 4))),
    `final acknowledgement must record a completed status (got ${JSON.stringify(ack[0].status)})`);
});

/* ============================================================ A9 — remove/undo scope + encounter lock */

test("a9-undo-removes-only-operation-instances: undo affects only the operation's own contributions", async () => {
  const reg = await needRegistry();
  const uses = await needUses();
  const h = harness();
  const sA = h.mkActor("undo-src-a");
  const sB = h.mkActor("undo-src-b");
  const target = h.mkActor("undo-target", { owner: true });
  await h.game.ak5e.conditionCommand(sA, "applyCondition", APPLY(target, "bleeding"), "op-a9-a");
  await h.game.ak5e.conditionCommand(sB, "applyCondition", APPLY(target, "bleeding"), "op-a9-b");
  // unrelated native status effect
  const [blinded] = await target.createEmbeddedDocuments("ActiveEffect",
    [{ name: "Blinded (trap)", statuses: ["blinded"], changes: [], flags: {} }]);

  const undo = await h.game.ak5e.conditionCommand(sA, "undoUse", { useId: "op-a9-a" }, "op-a9-undo-a");
  assert.ok(undo, `undo must succeed for the actor owner/GM (got ${JSON.stringify(undo)})`);

  const remaining = contribs(target);
  assert.equal(remaining.length, 1, "only the undone operation's contribution is removed");
  assert.equal(instOf(remaining[0]).operationId, "op-a9-b", "the other source's contribution survives");
  assert.ok([...target.effects.values()].some(e => (e.statuses ?? []).includes("blinded")),
    "the unrelated native Blinded AE remains untouched");
  assert.ok(reg.conditionFacts(target).active.has("bleeding"), "the condition remains active through the surviving source");
});

test("a9-unrelated-later-changes-preserved: undo preserves later unrelated changes made after the application", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("later-src");
  const target = h.mkActor("later-target", { owner: true });
  const OP = "op-a9-later";
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "dazed"), OP);
  const ae = contribs(target)[0];
  const meta = instOf(ae);

  // A third party edits the contribution's display name and adds another effect afterwards.
  await ae.update({ name: "Renamed by another user" });
  await h.game.ak5e.conditionCommand(h.mkActor("other-src"), "applyCondition", APPLY(target, "silenced"), "op-a9-unrelated-add");

  await h.game.ak5e.conditionCommand(source, "undoUse", { useId: OP }, "op-a9-later-undo");
  assert.equal(contribs(target).filter(e => instOf(e)?.operationId === OP).length, 0, "the undone instance is gone");
  assert.equal(contribs(target).filter(e => instOf(e)?.operationId === "op-a9-unrelated-add").length, 1,
    "the later unrelated operation survives the undo untouched");
});

test("a9-encounter-lock-receipts-visible-not-deleted: encounter start/end locks receipts without deleting them", async () => {
  const uses = await needUses();
  const h = harness();
  const source = h.mkActor("lock-src");
  const target = h.mkActor("lock-target", { owner: true });
  const OP = "op-a9-lock";
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "bleeding"), OP);
  const before = effectsSnap(target);

  h.setEpoch(1);                                       // encounter boundary crossed (combat started/ended)
  const preview = uses.previewUndo(source, OP);
  const text = snapOf(preview);
  assert.match(text, /lock/i, "A9: past-encounter receipts must remain visible with a lock marker (§3.1)");

  const outcome = await h.settle(h.game.ak5e.conditionCommand(source, "undoUse", { useId: OP }, "op-a9-locked-undo"));
  const refused = outcome.error || outcome.value?.error || outcome.value?.locked || outcome.value?.ok === false
    || !outcome.value;
  assert.ok(refused, "undo outside the encounter window must be refused");
  assert.deepEqual(effectsSnap(target), before, "locked undo changes nothing");
  const receipts = (source.flags.ak5e.conditionUses?.undo ?? []);
  assert.ok(receipts.some(r => r.id === OP), "the locked receipt must still exist — locking never deletes receipts");
});

/* ============================================================ A10 — native markers / read contract */

test("a10-current-id-presence: existing custom markers keep their exact ak5e-* IDs through setup and the compatibility dictionary (regression GREEN)", async () => {
  const h = harness();
  const ids = () => globalThis.CONFIG.statusEffects.map(e => e.id);
  for (const id of ["ak5e-bleeding", "ak5e-burning", "ak5e-corroded", "ak5e-dazed", "ak5e-frozen",
    "ak5e-necrotised", "ak5e-nervous-impairment", "ak5e-silenced", "ak5e-dying"]) {
    assert.equal(ids().filter(x => x === id).length, 1,
      `existing status ${id} must remain present exactly once with its exact ID (never shortened/renamed)`);
  }
  for (const key of ["bleeding", "burning", "corroded", "dazed", "frozen", "necrotised", "nervous-impairment", "silenced", "dying"]) {
    assert.equal(h.game.ak5e.conditions[key]?.id, `ak5e-${key}`,
      `game.ak5e.conditions["${key}"] dictionary entry must survive the C01 wiring unchanged (§5: keep the dictionary)`);
  }
});

test("a10-condition-facts-read-contract: contributions, explicit legacy markers and unmanaged native statuses are readable without writes or eager migration", async () => {
  const reg = await needRegistry();
  const h = harness();
  const target = h.mkActor("facts-target", { owner: true });

  // (1) registry-typed contribution, created through the frozen data builder.
  const data = reg.conditionEffectData({ key: "bleeding", sourceActorUuid: "Actor.remote-src",
    operationId: "op-a10-1", instanceId: "inst-a10-1", expiry: { kind: "manual" } });
  assert.ok(data && (data.statuses ?? []).includes("ak5e-bleeding"), "conditionEffectData yields the registered status");
  const [typedAe] = await target.createEmbeddedDocuments("ActiveEffect", [data]);

  // (2) EXPLICIT legacy AK5e marker (current ak5e.mjs representation) — readable, NOT migrated.
  const [legacyAe] = await target.createEmbeddedDocuments("ActiveEffect",
    [{ name: "Burning", img: "icons/svg/fire.svg", transfer: false, statuses: ["ak5e-burning"], flags: { ak5e: { statusId: "ak5e-burning" } } }]);

  // (3) unmanaged native status marker (third-party/DM source) — read-only recognized.
  const [nativeAe] = await target.createEmbeddedDocuments("ActiveEffect",
    [{ name: "Poisoned", statuses: ["poisoned"], flags: {} }]);

  // (4) a disabled contribution must not count.
  const [disabledAe] = await target.createEmbeddedDocuments("ActiveEffect",
    [{ ...reg.conditionEffectData({ key: "silenced", sourceActorUuid: "Actor.remote-src",
        operationId: "op-a10-d", instanceId: "inst-a10-d", expiry: { kind: "manual" } }), disabled: true }]);

  const before = { writes: target.writes.length, created: target.created.length, effects: effectsSnap(target) };
  const facts = reg.conditionFacts(target);

  assert.ok(facts.active.has("bleeding"), "typed contribution marks the condition active");
  assert.ok(facts.active.has("burning"), "explicit legacy ak5e-* metadata is recognized (ID compatibility)");
  assert.ok(facts.active.has("poisoned"), "unmanaged native status markers are recognized read-only");
  assert.ok(!facts.active.has("silenced"), "disabled contributions are excluded");
  const bleedingInstances = facts.instances.filter(i => i.key === "bleeding");
  assert.equal(bleedingInstances.length, 1, "one attributable instance record");
  assert.equal(bleedingInstances[0].instanceId ?? bleedingInstances[0].instance?.instanceId, "inst-a10-1",
    "instance records carry the frozen identity");
  assert.ok(Array.isArray(facts.overlays), "overlays surface exists (§3.2 record shape)");
  assert.ok(!Object.prototype.hasOwnProperty.call(facts, "display") || !facts.display,
    "never read a display name as authoritative");

  assert.equal(target.writes.length, before.writes, "conditionFacts performs no writes");
  assert.equal(target.created.length, before.created, "conditionFacts performs no eager migration");
  assert.deepEqual(effectsSnap(target), before.effects, "legacy marker AE is left byte-identical (compatibility read)");
});

test("a10-projection-and-bare-statuses-are-not-evidence: derived projection AEs and transient status sets never count as sources", async () => {
  const reg = await needRegistry();
  const uses = await needUses();
  const h = harness();
  const target = h.mkActor("projection-target", { owner: true });

  // A derived projection with no contribution behind it (§3.2): derived output, never a source.
  await target.createEmbeddedDocuments("ActiveEffect",
    [{ name: "Corroded (derived)", statuses: ["corroded"], transfer: true, changes: [
        { key: "system.attributes.ac.bonus", value: "-2", mode: 2 }],
      flags: { ak5e: { conditionProjection: { version: 1, key: "corroded", derived: true } } } }]);
  const facts = reg.conditionFacts(target);
  assert.ok(!facts.active.has("corroded"),
    "a status arising solely from a conditionProjection AE must not count as evidence (derived output exclusion)");

  // The transient native statuses Set is not the success carrier: an operation's evidence is effectIds.
  target.statuses.add("ak5e-nervous-impairment");
  const facts2 = reg.conditionFacts(target);
  assert.ok(!facts2.active.has("nervous-impairment"),
    "transient actor.statuses membership alone is not condition evidence (no transient-flag-only success path)");

  // And a real operation still reports effectIds, not a bare statuses claim.
  const source = h.mkActor("projection-src");
  await h.game.ak5e.conditionCommand(source, "applyCondition", APPLY(target, "nervous-impairment"), "op-a10-real");
  const ack = acks(target).find(a => a.operationId === "op-a10-real");
  assert.ok(ack && Array.isArray(ack.effectIds) && ack.effectIds.length >= 1,
    "successful operations receipt with effectIds, never a statuses-set shortcut");
});

test("a10-static-no-statuses-set-or-wallclock-guard: the new modules never touch actor.statuses or Date.now", async () => {
  const src = p => readFileSync(fileURLToPath(p), "utf8");
  await needRegistry(); await needUses();
  const registrySource = src(REGISTRY_URL);
  const usesSource = src(USES_URL);
  for (const [label, code] of [["condition-registry", registrySource], ["condition-uses", usesSource]]) {
    assert.doesNotMatch(code, /\.statuses\.(add|delete)\(/,
      `${label} must not mutate actor.statuses directly (A10: contributions are ActiveEffect documents)`);
    assert.doesNotMatch(code, /Date\.now\(/,
      `${label} must not read wall-clock time (§3.3: world time only, never Date.now)`);
  }
});
