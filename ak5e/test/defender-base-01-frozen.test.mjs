/**
 * WP defender-base-01 — frozen tests (tester: adversary, drafted from SPEC-defender-base-replan.md
 * §5 WP-01 + §3.2/§3.3 + WORKFLOW §3.2 + source C3:943–965,986–989,1033–1034 + C1:133–143).
 * Black-box: only public entry points (previewDefenderSetup/applyDefenderSetup), the frozen §3.3
 * journal exports via defender-advancement.mjs (new file; absent at draft time → those tests are RED
 * for the intended reason), observable flags, and the existing fixture conventions.
 *
 * AC → frozen test ID:
 *  01.1 setup-preview-cancel-stale        01.2 setup-write-ahead-public
 *  01.3 setup-post-create-reload          01.4 setup-replay-fingerprint-serial
 *  01.5 setup-authored-budget-preserved   01.6 setup-undo-cas
 *  01.7 setup-undo-epoch-owner            01.8 setup-existing-planners
 *  01.9 setup-live-export-journal
 *
 * This file owns its local harness (defender-fixture.mjs is NOT modified): embedded documents honour
 * `_id` with `keepId:true`, writes are event-logged with journal snapshots taken before each external
 * mutation, state can be rebuilt "after reload", a create can throw AFTER successful insertion, the
 * encounter epoch is controllable, and Hooks.on captures registrations.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fixture, world } from "./defender-fixture.mjs";
import {
  previewDefenderSetup, applyDefenderSetup, registerSetupPlanner,
  reconcileManagedEffect, planActivity, MANAGED_EFFECT_FLAG,
} from "../scripts/defender-setup.mjs";
import { registerDefenderHooks } from "../scripts/defender-features.mjs";

const JOURNAL_KEY = "defenderAdvancement";
const journalOf = actor => actor.flags?.ak5e?.[JOURNAL_KEY];
const journalOp = (actor, id) => (journalOf(actor)?.operations ?? []).find(op => op.id === id);

/* ---------------------------------------------------------------- harness */

// One generic, deduplicated planner for every scenario; it contributes only what the tagged actor asks.
registerSetupPlanner((actor, _profile, plan) => {
  for (const desired of actor.__wp01Effects ?? []) reconcileManagedEffect(actor, desired, plan);
  for (const a of actor.__wp01Activities ?? []) planActivity(actor, a.chapterThreeId, a.activity, plan);
});

const strip = key => key.replace(/^==/, "");
// Same semantics as the shared fixture: force-replace keys ("==name") strip recursively (§ WP-01 harness).
const forceKeys = value => (!value || typeof value !== "object" || Array.isArray(value))
  ? value
  : Object.fromEntries(Object.entries(value).map(([key, entry]) => [strip(key), forceKeys(entry)]));
function setPath(object, path, value) {
  const parts = path.split("."), last = strip(parts.pop());
  let target = object;
  for (const raw of parts) { const part = strip(raw); target = target[part] ??= {}; }
  if (last.startsWith("-=")) delete target[last.slice(2)];
  else target[last] = forceKeys(structuredClone(value));
}
const applyPaths = (object, changes) => { for (const [k, v] of Object.entries(changes)) setPath(object, k, v); };
const plain = object => Object.fromEntries(Object.entries(object).filter(([, v]) => typeof v !== "function"));

let epoch = 0;                       // shared "world setting" — advanced by setEpoch like the elected-GM hook
const hookRegistry = [];             // Hooks.on captures survive across harnesses (registrations dedupe in production)

function harness(opts = {}) {
  const { level = 13, enabled = false, owner = true, res = null, branch = null } = opts;
  world();
  epoch = 0;
  globalThis.game.settings = {
    get: (module, key) => (module === "ak5e" && key === "encounterEpoch" ? epoch : false),
    set: async () => {}, register: () => {},
  };
  globalThis.Hooks = { on: (name, fn) => hookRegistry.push([name, fn]) };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => {
    const stored = structuredClone(data);                       // deep clone, per spec §3.5
    stored.getFlag = (scope, key) => stored.flags?.[scope]?.[key];
    game.messages.push(stored); return stored;
  } } };
  registerDefenderHooks();
  let counter = 0;
  globalThis.foundry = { utils: { randomID: () => `det-op-${++counter}` } };   // deterministic; retries must not need this
  const actor = fixture({ level, enabled, owner, res, branch });
  const events = [];
  const snap = () => { const j = journalOf(actor); return j ? structuredClone(j) : null; };
  actor.effects = new Map();
  actor.update = async changes => {
    events.push({ ev: "actorUpdate", paths: Object.keys(changes), journalBefore: snap() });
    actor.writes.push(structuredClone(changes));
    applyPaths(actor, changes);
    return actor;
  };
  actor.createEmbeddedDocuments = async (type, data, context = {}) => {
    const journalAtCall = snap();                               // intent must already be persisted here
    const collection = type === "ActiveEffect" ? actor.effects : actor.items;
    const docs = data.map(entry => {
      const record = structuredClone(entry);
      const keep = context.keepId === true && typeof record._id === "string" && record._id;
      const id = keep ? record._id : `${type === "ActiveEffect" ? "fx" : "it"}-${++counter}`;
      const doc = {
        ...record, id, type, parentUuid: actor.uuid,
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async update(changes) { events.push({ ev: "embeddedUpdate", id: this.id, paths: Object.keys(changes), journalBefore: snap() }); applyPaths(this, changes); return this; },
        async delete() { events.push({ ev: "embeddedDelete", id: this.id, journalBefore: snap() }); collection.delete(this.id); },
      };
      collection.set(id, doc);
      return doc;
    });
    events.push({ ev: "create", type, requestedIds: data.map(d => d?._id ?? null), keepId: context.keepId === true, journalAtCall });
    if (actor.__crashAfterCreate) { actor.__crashAfterCreate = false; throw new Error("simulated lost response after a successful embedded create"); }
    return docs;
  };
  actor.items.get = id => actor.items.constructor.prototype.get.call(actor.items, id);
  actor.__events = events;
  const api = {
    actor,
    makeFeature(id, chapterThreeId) {
      const feature = {
        id, name: `Feature ${id}`, type: "feat", chapterThreeId, system: { activities: new Map() },
        flags: { ak5e: { chapterThreeId } },
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async update(changes) {
          events.push({ ev: "itemUpdate", id, paths: Object.keys(changes), journalBefore: snap() });
          for (const [k, v] of Object.entries(changes)) feature.system.activities.set(k.split(".").pop(), structuredClone(v));
          return feature;
        },
      };
      actor.items.set(id, feature);
      return feature;
    },
    setEpoch(value) { epoch = value; },
    eventCount: () => events.length,
    writesCount: () => actor.writes.length,
    reload: () => reloadHarness(actor, opts),
  };
  return api;
}

/* Rebuild the actor from plain state, as after a reload: documents and journal flags are whatever
 * survived in the database, closures and in-flight promises are gone. */
function reloadHarness(actor, opts) {
  const state = {
    flags: structuredClone(actor.flags), system: structuredClone(actor.system), isOwner: actor.isOwner,
    effects: [...actor.effects.values()].map(e => plain(e)),
    features: [...actor.items.values()].filter(i => i.type === "feat")
      .map(i => ({ id: i.id, name: i.name, chapterThreeId: i.flags?.ak5e?.chapterThreeId, activities: Object.fromEntries(i.system.activities) })),
    others: [...actor.items.values()].filter(i => i.type !== "feat").map(i => plain(i)),
  };
  const h = harness(opts);
  const a2 = h.actor;
  a2.flags = structuredClone(state.flags);
  a2.isOwner = state.isOwner;
  a2.effects = new Map(state.effects.map(e => [e.id, {
    ...e, type: "ActiveEffect", parentUuid: a2.uuid,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { applyPaths(this, changes); a2.writes.push(structuredClone(changes)); return this; },
    async delete() { a2.effects.delete(this.id); },
  }]));
  for (const f of state.features) {
    const feature = {
      id: f.id, name: f.name, type: "feat", flags: { ak5e: { chapterThreeId: f.chapterThreeId } },
      system: { activities: new Map(Object.entries(f.activities)) },
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async update(changes) { for (const [k, v] of Object.entries(changes)) feature.system.activities.set(k.split(".").pop(), structuredClone(v)); return feature; },
    };
    a2.items.set(f.id, feature);
  }
  for (const o of state.others) {
    const doc = { ...o, getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { applyPaths(this, changes); return this; } };
    a2.items.set(o.id, doc);
  }
  a2.items.get = id => a2.items.constructor.prototype.get.call(a2.items, id);
  return h;
}

async function journalApi() {
  const mod = await import("../scripts/defender-advancement.mjs").catch(() => null);
  assert.ok(mod, "RED (spec §3.3): ak5e/scripts/defender-advancement.mjs — Defender-local advancement journal is absent");
  for (const fn of ["runDefenderAdvancement", "retryDefenderAdvancement", "listDefenderAdvancement", "previewDefenderAdvancementUndo", "undoDefenderAdvancement"])
    assert.equal(typeof mod[fn], "function", `RED (spec §3.3): journal export ${fn} is absent`);
  return mod;
}

function assertJournalOpShape(op, id, kind, status) {
  assert.ok(op, `journal operation ${id} missing`);
  assert.equal(op.id, id);
  assert.equal(op.kind, kind);
  assert.equal(op.status, status, `operation ${id} status`);
  for (const key of ["userId", "epoch", "contextKey", "fingerprint", "summary", "steps", "result", "notes"])
    assert.ok(key in op, `§3.3 persisted operation must carry "${key}"`);
  assert.ok(Array.isArray(op.steps), "steps must be a serializable array (§3.3)");
  for (const step of op.steps) {
    assert.ok(["actorPatch", "embeddedCreate", "embeddedPatch", "embeddedDelete"].includes(step.type), `step type ${step.type} is not whitelisted`);
    assert.ok("before" in step && "after" in step, "every patch/create step carries before/after values (§3.3 intent-before-writes)");
  }
}

const managedDesired = (sourceId, value = "@prof") => ({
  sourceId, name: `Managed ${sourceId}`, changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value, priority: 20 }],
});

/* ------------------------------------------------------------------ 01.1 */

test("setup-preview-cancel-stale", async () => {
  const h = harness({ level: 13, enabled: false });
  const actor = h.actor;
  // Preview reports the configuration changes, including Reactive max at its source threshold (C3:1033–1034).
  const plan = previewDefenderSetup(actor);
  assert.equal(plan.enable, true, "preview reports enabling the Defender state");
  assert.equal(plan.reactionMax, 2, "level 13 preview reports Reactive max 2 (source table)");
  assert.equal(plan.empty, false);
  assert.deepEqual(plan.blocked, []);
  assert.equal(previewDefenderSetup(harness({ level: 5, enabled: false }).actor).reactionMax, null, "below 13th has no Reactive");
  assert.equal(actor.writes.length, 0, "01.1: preview is pure — no Actor/Item/Effect/Chat writes");
  assert.equal(game.messages.length, 0, "01.1: preview posts nothing");

  // Cancel (unconfirmed) writes nothing — no Actor change, no journal, no chat (WORKFLOW §3.2).
  await assert.rejects(applyDefenderSetup(actor, { confirmed: false, contextKey: plan.contextKey }), /Confirm/);
  assert.equal(actor.writes.length, 0, "01.1: unconfirmed apply writes nothing");
  assert.equal(game.messages.length, 0);
  assert.equal(journalOf(actor), undefined, "01.1: a cancelled setup leaves no journal trace either");

  // Stale preview writes nothing.
  await assert.rejects(applyDefenderSetup(actor, { confirmed: true, contextKey: "stale-key" }), /preview the setup again/);
  assert.equal(actor.writes.length, 0, "01.1: stale apply writes nothing");
  assert.equal(game.messages.length, 0);

  // Observer apply is a technical failure with zero writes.
  await assert.rejects(applyDefenderSetup({ ...actor, isOwner: false }, { confirmed: true, contextKey: plan.contextKey }), /owned/i);
  assert.equal(actor.writes.length, 0, "01.1: denied apply writes nothing");

  // A completed confirmation is unchanged afterwards (control for the above negatives).
  h.actor.__wp01Effects = [managedDesired("c3-reactive-guard")];
  const plan2 = previewDefenderSetup(h.actor);
  await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan2.contextKey, operationId: "ctrl-1" });
  assert.ok(h.actor.writes.length > 0, "control: a confirmed apply does write");
});

/* ------------------------------------------------------------------ 01.2 */

test("setup-write-ahead-public", async () => {
  const h = harness({ level: 13, enabled: false });
  const actor = h.actor;
  h.makeFeature("feat", "feature-x");
  h.actor.__wp01Effects = [managedDesired("c3-986-resilience")];
  h.actor.__wp01Activities = [{ chapterThreeId: "feature-x", activity: { _id: "ak5eTestActivity1", type: "utility", name: "Test" } }];
  const plan = previewDefenderSetup(actor);
  await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "ahead-1" });

  // (a) The whole immutable intent (operation id, steps with before-data) is persisted BEFORE the first
  // external embedded create/update — the write-ahead order §3.3 freezes.
  const firstExternal = actor.__events.findIndex(e => e.ev === "create" || e.ev === "itemUpdate");
  assert.ok(firstExternal >= 0, "scenario: setup performs embedded mutations");
  const journalWrittenFirst = actor.__events.slice(0, firstExternal)
    .some(e => e.ev === "actorUpdate" && e.paths.some(p => p.includes(`flags.ak5e.${JOURNAL_KEY}`)));
  assert.ok(journalWrittenFirst, "01.2: journal intent (before-data) must be persisted before any external create/update");

  const createEvent = actor.__events.find(e => e.ev === "create");
  assert.ok(createEvent, "scenario: an ActiveEffect was created");
  assert.ok(createEvent.journalAtCall, "01.2: at embedded-create time the journal must already be readable on the actor");
  assert.equal(createEvent.journalAtCall.version, 1, "01.2: journal shape { version: 1, operations: [...] }");
  const opAtCreate = createEvent.journalAtCall.operations.find(o => o.id === "ahead-1");
  assert.ok(opAtCreate, "01.2: the operation is persisted under the caller's stable operationId");
  assert.equal(opAtCreate.kind, "setup");
  assert.ok(["applying"].includes(opAtCreate.status), "01.2: intent is journaled as applying before documents change");
  const createStep = opAtCreate.steps.find(s => s.type === "embeddedCreate");
  assert.ok(createStep, "01.2: a preassigned embeddedCreate step must exist in the persisted intent");
  assert.equal(typeof createStep.documentId, "string", "01.2: managed Effect activity IDs are preassigned and persisted before create");
  assert.ok(createStep.before !== undefined, "01.2: create step carries its before-state");
  // Creation honours the preassigned id (keepId), not a fresh random one.
  assert.equal(createEvent.keepId, true, "01.2: embedded creation must pass keepId:true (§3.3)");
  assert.equal(createEvent.requestedIds[0], createStep.documentId, "01.2: the created document uses the persisted preassigned id");
  const activityStep = JSON.stringify(opAtCreate.steps);
  assert.ok(activityStep.includes("ak5eTestActivity1"), "01.2: the native activity addition is journaled under its preassigned key");

  const finalOp = journalOp(actor, "ahead-1");
  assertJournalOpShape(finalOp, "ahead-1", "setup", "complete");
  assert.equal(finalOp.userId, game.user.id, "01.2: the operation records the acting user id");
  assert.equal(finalOp.epoch, 0);

  // (b) No hook/render/drop automatically applies setup: firing every registered hook handler
  // against a fresh actor must not perform the setup (no enable flip, no managed content, no journal).
  const h2 = harness({ level: 13, enabled: false });
  h2.actor.__wp01Effects = [managedDesired("c3-hook-bait")];
  for (const [, fn] of hookRegistry) {
    for (const args of [[], [h2.actor], [{}, h2.actor], [h2.actor, {}], [game.combat], [{ actor: h2.actor }]]) {
      try { await fn(...args); } catch { /* handlers may reject odd arguments; only setup-side mutation matters */ }
    }
  }
  assert.equal(h2.actor.flags.ak5e.defender.enabled, false, "01.2: no lifecycle/render hook enables the Defender without a confirmed apply");
  assert.equal(h2.actor.effects.size, 0, "01.2: hooks never create managed setup content by themselves");
  assert.equal(journalOf(h2.actor), undefined, "01.2: hooks never mint journal operations by themselves");
});

/* ------------------------------------------------------------------ 01.3 */

test("setup-post-create-reload", async () => {
  const j = await journalApi();
  const h = harness({ level: 13, enabled: false, res: 3 });
  const actor = h.actor;
  // Pre-existing budget state that advancement must not reset.
  actor.flags.ak5e.reactionBudget = { max: 1, spent: 1, triggers: { trigA: { receipt: "rX" } }, receipts: { rX: { id: "rX", perTrigger: true } } };
  const budgetBefore = structuredClone(actor.flags.ak5e.reactionBudget);
  const poolBefore = structuredClone(actor.flags.ak5e.resourcePools);
  h.actor.__wp01Effects = [managedDesired("c3-crash-effect")];

  actor.__crashAfterCreate = true;
  const plan = previewDefenderSetup(actor);
  await assert.rejects(applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "crash-1" }),
    /simulated lost response/);

  // The document was successfully created before the throw; the journal must remember it by its
  // persisted id (never a post-create list) with the intent still applying.
  assert.equal(actor.effects.size, 1, "scenario: the create itself succeeded before the crash");
  const crashedOp = journalOp(actor, "crash-1");
  assert.ok(crashedOp, "01.3: the interrupted operation stays journaled after the crash");
  assert.equal(crashedOp.status, "applying", "01.3: unacknowledged steps leave the operation applying, not complete");

  // Reconstruct exactly what a reload would show, then retry the SAME public operation id.
  const h2 = h.reload();
  const reloaded = h2.actor;
  assert.equal(reloaded.effects.size, 1, "01.3 reload: the created document survived");
  const createdId = [...reloaded.effects.keys()][0];
  const result = await j.retryDefenderAdvancement(reloaded, { kind: "setup", useId: "crash-1", confirmed: true });
  assert.ok(result && typeof result === "object", "01.3: retry resolves with the caller-compatible result");
  assert.equal(reloaded.effects.size, 1, "01.3: the already-created document is recognised, not recreated");
  assert.equal([...reloaded.effects.keys()][0], createdId, "01.3: retry converges on the preassigned id");
  const retryOp = journalOp(reloaded, "crash-1");
  assert.equal(retryOp.status, "complete", "01.3: retry completes the interrupted journal entry");
  assert.equal(reloaded.flags.ak5e.defender.enabled, true, "01.3: the original intent is resumed without new caller input");
  assert.deepEqual(reloaded.flags.ak5e.resourcePools, poolBefore, "01.3: retry must not reset the Resilience pool (C3:986–989)");
  assert.deepEqual(
    { max: reloaded.flags.ak5e.reactionBudget.max, spent: reloaded.flags.ak5e.reactionBudget.spent,
      triggers: reloaded.flags.ak5e.reactionBudget.triggers, receipts: reloaded.flags.ak5e.reactionBudget.receipts },
    { max: 2, spent: budgetBefore.spent, triggers: budgetBefore.triggers, receipts: budgetBefore.receipts },
    "01.3: Reactive max may reach the source threshold, but spent/trigger/receipt state is never reset (§3.3)");

  // A second retry of a complete operation is a replay, not a second execution.
  const again = await j.retryDefenderAdvancement(reloaded, { kind: "setup", useId: "crash-1", confirmed: true });
  assert.equal(reloaded.effects.size, 1, "01.3: repeated retry cannot duplicate the managed document");
  assert.deepEqual(again, result, "01.3: retry of a completed operation returns the original result");
});

/* ------------------------------------------------------------------ 01.4 */

test("setup-replay-fingerprint-serial", async () => {
  const j = await journalApi();

  // (A) existing replay subcase: same id, same immutable input after completion → no additional writes.
  const h = harness({ level: 13, enabled: false });
  h.actor.__wp01Effects = [managedDesired("c3-replay")];
  const plan = previewDefenderSetup(h.actor);
  const result = await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "rp-1" });
  const writes = h.writesCount(), effects = h.actor.effects.size;
  assert.deepEqual(await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "rp-1" }), result, "same id + same input replays the result");
  assert.equal(h.writesCount(), writes, "01.4: a completed replay performs no additional document writes");
  assert.equal(h.actor.effects.size, effects);

  // (B) changed immutable input under the SAME operation id rejects before any mutation (§3.3 fingerprint).
  const fingerprintBefore = journalOp(h.actor, "rp-1").fingerprint;
  assert.equal(typeof fingerprintBefore, "string", "01.4: the persisted operation carries a deterministic fingerprint");
  h.actor.__wp01Effects = [managedDesired("c3-replay", "@prof + 1")];      // an immutable choice changed
  const plan2 = previewDefenderSetup(h.actor);
  await assert.rejects(applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan2.contextKey, operationId: "rp-1" }),
    undefined, "01.4: same id with changed immutable input must reject");
  assert.equal(h.writesCount(), writes, "01.4: the fingerprint rejection happened before any mutation");
  assert.equal(journalOp(h.actor, "rp-1").fingerprint, fingerprintBefore, "01.4: the original fingerprint is not overwritten");
  assert.equal(h.actor.effects.size, effects, "01.4: no new documents from the rejected attempt");

  // (C) simultaneous different operations on the same Actor serialize; neither journal entry is lost.
  const k = harness({ level: 13, enabled: false });
  k.actor.flags.ak5e.defender.rulings = { witnessA: false, witnessB: false };
  k.actor.__wp01Effects = [managedDesired("c3-serial")];
  const plan3 = previewDefenderSetup(k.actor);
  const stepLeaf = (leaf, value) => [{ id: `${leaf}-step`, type: "actorPatch", before: { [`flags.ak5e.defender.rulings.${leaf}`]: false }, after: { [`flags.ak5e.defender.rulings.${leaf}`]: value } }];
  const settled = await Promise.allSettled([
    applyDefenderSetup(k.actor, { confirmed: true, contextKey: plan3.contextKey, operationId: "ser-setup" }),
    j.runDefenderAdvancement(k.actor, { kind: "setup", id: "j-a", contextKey: "ctx-a", fingerprint: "fp-a", steps: stepLeaf("witnessA", true), result: { marker: "A" } }),
    j.runDefenderAdvancement(k.actor, { kind: "setup", id: "j-b", contextKey: "ctx-b", fingerprint: "fp-b", steps: stepLeaf("witnessB", true), result: { marker: "B" } }),
  ]);
  for (const s of settled) assert.equal(s.status, "fulfilled", "01.4: concurrent different operations must all complete, not corrupt each other");
  assert.deepEqual(settled.map(s => s.value).filter(v => v && v.marker).map(v => v.marker).sort(), ["A", "B"], "01.4: runDefenderAdvancement resolves with the caller result");
  assert.equal(k.actor.flags.ak5e.defender.rulings.witnessA, true, "01.4: serialized operations must not lose each other's leaf writes");
  assert.equal(k.actor.flags.ak5e.defender.rulings.witnessB, true, "01.4: no lost journal entry/leaf across the serialization");
  assert.equal(k.actor.effects.size, 1, "01.4: serialization prevents duplicate managed documents");
  const listed = j.listDefenderAdvancement(k.actor, { kind: "setup" });
  assert.ok(Array.isArray(listed), "01.4: list returns an array");
  const ids = listed.map(e => e.id);
  for (const id of ["ser-setup", "j-a", "j-b"]) assert.ok(ids.includes(id), `01.4: ${id} must survive in the journal listing (no lost entries)`);
  assert.equal(new Set(ids).size, ids.length, "01.4: each operation listed exactly once");
  const entry = listed[0];
  for (const key of ["id", "kind", "status", "epoch", "locked", "summary"]) assert.ok(key in entry, `01.4: list entries are {id,kind,status,epoch,locked,summary}`);
  const writesAfterList = k.writesCount();
  j.listDefenderAdvancement(k.actor);
  assert.equal(k.writesCount(), writesAfterList, "01.4: listing is pure (no render writes)");
});

/* ------------------------------------------------------------------ 01.5 */

test("setup-authored-budget-preserved", async () => {
  const h = harness({ level: 13, enabled: false, res: 3 });
  const actor = h.actor;
  // A live mid-encounter state: one Reaction already spent on a trigger with a receipt, and Resilience spent.
  actor.flags.ak5e.reactionBudget = { max: 1, spent: 1, triggers: { trigA: { receipt: "rX" } }, receipts: { rX: { id: "rX", perTrigger: true } } };
  // An unmanaged authored effect and a managed-baseline effect edited by the player must survive.
  actor.effects.set("authored1", { id: "authored1", type: "ActiveEffect", name: "Authored", changes: [{ key: "system.armor.value", mode: 0, value: "1" }], flags: {},
    getFlag(s, k) { return this.flags?.[s]?.[k]; } });
  h.actor.__wp01Effects = [managedDesired("c3-1033-reactive")];

  const plan = previewDefenderSetup(actor);
  assert.equal(plan.reactionMax, 2, "01.5: Reactive max at the source threshold is reported (C3:1033–1034)");
  const result = await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "budget-1" });
  assert.equal(result.reactionMax, 2);
  assert.equal(actor.flags.ak5e.reactionBudget.max, 2, "01.5: the source-level Reactive maximum is raised to 2");
  assert.equal(actor.flags.ak5e.reactionBudget.spent, 1, "01.5: setup must NOT grant fresh Reactions — spent state is preserved");
  assert.deepEqual(actor.flags.ak5e.reactionBudget.triggers, { trigA: { receipt: "rX" } }, "01.5: trigger state is preserved, not reset");
  assert.deepEqual(actor.flags.ak5e.reactionBudget.receipts, { rX: { id: "rX", perTrigger: true } }, "01.5: receipt state is preserved, not reset");
  assert.equal(actor.flags.ak5e.resourcePools.resilience.value, 3, "01.5: the Resilience pool is untouched by setup (C3:986–989)");

  // Authored content survives.
  assert.ok(actor.effects.get("authored1"), "01.5: unmanaged authored effects survive setup");
  assert.deepEqual(actor.effects.get("authored1").changes, [{ key: "system.armor.value", mode: 0, value: "1" }], "01.5: authored effect content is not rewritten");
  assert.equal(actor.effects.size, 2, "01.5: only the absent managed addition was applied");
  const managed = [...actor.effects.values()].find(e => e.id !== "authored1");
  managed.changes = [{ key: "system.bonuses.mwak.damage", mode: 2, value: "99", priority: 20 }];   // later authored edit
  const replan = previewDefenderSetup(actor);
  assert.equal(replan.updateEffects.length, 0, "01.5: an authored edit to a managed effect is preserved, never overwritten");
  assert.ok(replan.warnings.some(w => /beyond its managed baseline/.test(w)), "01.5: the preserved edit is surfaced for review");

  // A second setup on the already-configured actor grants nothing new (accepted as no-op or refused — both compatible).
  assert.equal(previewDefenderSetup(actor).empty, true);
  try { await applyDefenderSetup(actor, { confirmed: true, contextKey: previewDefenderSetup(actor).contextKey, operationId: "budget-2" }); }
  catch { /* refusing to re-apply an empty plan is equally compatible */ }
  assert.equal(actor.flags.ak5e.reactionBudget.spent, 1, "01.5: no fresh Reactions from re-running setup");
  assert.equal(actor.effects.size, 2, "01.5: no duplicate effects from re-running setup");
});

/* ------------------------------------------------------------------ 01.6 */

test("setup-undo-cas", async () => {
  const j = await journalApi();

  // Scenario 1: created effect later authored-edited → preserved with a visible note; leaf restores by CAS.
  const h = harness({ level: 5, enabled: false });
  h.actor.__wp01Effects = [managedDesired("c3-undo-edit")];
  const plan = previewDefenderSetup(h.actor);
  await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "undo-1" });
  assert.equal(h.actor.flags.ak5e.defender.enabled, true, "scenario: setup applied");
  const effectId = [...h.actor.effects.keys()][0];
  const effect = h.actor.effects.get(effectId);
  effect.changes = [{ key: "system.bonuses.mwak.damage", mode: 2, value: "player-edited", priority: 20 }];

  // Undo requires confirmation.
  await assert.rejects(j.undoDefenderAdvancement(h.actor, { kind: "setup", useId: "undo-1", confirmed: false }), undefined, "01.6: undo without confirmation rejects");
  const writesOnReject = h.writesCount();
  assert.equal(h.writesCount(), writesOnReject, "01.6: a rejected undo writes nothing");

  const preview = j.previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "undo-1" });
  assert.equal(typeof preview.contextKey, "string", "01.6: the undo preview hands back a fresh contextKey");
  for (const key of ["contextKey", "lines", "warnings", "locked", "blocked", "safeSteps"]) assert.ok(key in preview, `01.6: undo preview must carry ${key} (§3.3 shape)`);
  assert.ok(Array.isArray(preview.lines) && preview.lines.length > 0, "01.6: the preview lists what will be restored");
  assert.equal(preview.locked, false);
  assert.equal(h.writesCount(), writesOnReject, "01.6: the undo preview is pure — no writes");

  const undo = await j.undoDefenderAdvancement(h.actor, { kind: "setup", useId: "undo-1", confirmed: true, contextKey: preview.contextKey });
  assert.equal(undo.undone, true, "01.6: confirmed undo restores this operation's unchanged changes");
  assert.equal(undo.useId, "undo-1");
  assert.ok(Array.isArray(undo.notes), "01.6: undo returns visible notes");
  assert.equal(h.actor.flags.ak5e.defender.enabled, false, "01.6: the journaled before-value is restored");
  assert.ok(h.actor.effects.get(effectId), "01.6: a created document with later authored edits is preserved, not deleted");
  assert.equal(h.actor.effects.get(effectId).changes[0].value, "player-edited", "01.6: the later authored edit survives undo");
  assert.ok(undo.notes.length >= 1 && undo.notes.some(n => typeof n === "string" && n.length > 0), "01.6: the preserved edit gets a visible note");
  assert.equal(journalOp(h.actor, "undo-1").status, "undone", "01.6: the operation is marked undone");

  // Repeated undo is a no-op.
  const writesAfterUndo = h.writesCount();
  const again = await j.undoDefenderAdvancement(h.actor, { kind: "setup", useId: "undo-1", confirmed: true, contextKey: preview.contextKey });
  assert.equal(again.undone, false, "01.6: repeated undo reports a no-op");
  assert.equal(h.writesCount(), writesAfterUndo, "01.6: repeated undo mutates nothing");

  // Scenario 2: CAS — a leaf changed externally after the operation is not stomped by undo.
  const k = harness({ level: 13, enabled: false });
  const plan2 = previewDefenderSetup(k.actor);
  await applyDefenderSetup(k.actor, { confirmed: true, contextKey: plan2.contextKey, operationId: "undo-2" });
  assert.equal(k.actor.flags.ak5e.reactionBudget.max, 2, "scenario: Reactive max raised");
  await k.actor.update({ "flags.ak5e.reactionBudget.max": 3 });               // a later GM edit beyond the after-value
  const pv2 = j.previewDefenderAdvancementUndo(k.actor, { kind: "setup", useId: "undo-2" });
  const undo2 = await j.undoDefenderAdvancement(k.actor, { kind: "setup", useId: "undo-2", confirmed: true, contextKey: pv2.contextKey });
  assert.equal(k.actor.flags.ak5e.reactionBudget.max, 3, "01.6: CAS — undo restores only leaves still equal to this step's after-value");
  assert.equal(k.actor.flags.ak5e.defender.enabled, false, "01.6: unchanged journaled leaves still restore");
  assert.ok(undo2.notes.some(n => /max|budget|reaction/i.test(String(n))), "01.6: the skipped CAS restore is visible in the notes");

  // Scenario 3: missing managed documents are harmless.
  const m = harness({ level: 5, enabled: false });
  m.actor.__wp01Effects = [managedDesired("c3-undo-missing")];
  const plan3 = previewDefenderSetup(m.actor);
  await applyDefenderSetup(m.actor, { confirmed: true, contextKey: plan3.contextKey, operationId: "undo-3" });
  const gone = [...m.actor.effects.keys()][0];
  await m.actor.effects.get(gone).delete();                                    // externally deleted
  const pv3 = j.previewDefenderAdvancementUndo(m.actor, { kind: "setup", useId: "undo-3" });
  const undo3 = await j.undoDefenderAdvancement(m.actor, { kind: "setup", useId: "undo-3", confirmed: true, contextKey: pv3.contextKey });
  assert.equal(undo3.undone, true, "01.6: undo of a deleted managed document completes without crashing");
  assert.equal(m.actor.effects.has(gone), false, "01.6: undo does not resurrect content the table removed");
  assert.equal(m.actor.flags.ak5e.defender.enabled, false);
});

/* ------------------------------------------------------------------ 01.7 */

test("setup-undo-epoch-owner", async () => {
  const j = await journalApi();

  // (a) Current-epoch, owner-initiated undo needs no human GM approval and no relay message (WORKFLOW §3.2).
  const h = harness({ level: 5, enabled: false });
  h.actor.__wp01Effects = [managedDesired("c3-owner")];
  const plan = previewDefenderSetup(h.actor);
  await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "own-1" });
  assert.equal(game.user.isGM, false, "scenario: the acting user is a plain player");
  const pv = j.previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "own-1" });
  const undo = await j.undoDefenderAdvancement(h.actor, { kind: "setup", useId: "own-1", confirmed: true, contextKey: pv.contextKey });
  assert.equal(undo.undone, true, "01.7: the owning player undoes their own current-epoch receipt directly");
  assert.equal(game.messages.length, 0, "01.7: no approval/relay chat was required");
  assert.equal(h.actor.flags.ak5e.defender.enabled, false);

  // (b) An observer (non-owner) cannot mutate through undo; read-only list/preview still work.
  const k = harness({ level: 5, enabled: false });
  const plan2 = previewDefenderSetup(k.actor);
  await applyDefenderSetup(k.actor, { confirmed: true, contextKey: plan2.contextKey, operationId: "obs-1" });
  const writesOwned = k.writesCount();
  k.actor.isOwner = false;                                                     // observer view of the same actor
  const listed = j.listDefenderAdvancement(k.actor);
  assert.ok(listed.some(e => e.id === "obs-1"), "01.7: receipts remain visible to the table");
  assert.equal(k.writesCount(), writesOwned, "01.7: listing stays read-only");
  await assert.rejects(j.undoDefenderAdvancement(k.actor, { kind: "setup", useId: "obs-1", confirmed: true,
    contextKey: (() => { try { return j.previewDefenderAdvancementUndo(k.actor, { kind: "setup", useId: "obs-1" }).contextKey; } catch { return "no-preview-key"; } })() }), undefined, "01.7: non-owner undo is a technical failure");
  assert.equal(k.writesCount(), writesOwned, "01.7: the denied undo changed nothing");
  assert.equal(k.actor.flags.ak5e.defender.enabled, true);

  // (c) A forged journal entry with an arbitrary Actor path cannot write through undo.
  const m = harness({ level: 5, enabled: true });
  m.actor.flags.ak5e[JOURNAL_KEY] = { version: 1, operations: [{
    id: "forged-1", kind: "setup", userId: game.user.id, epoch: 0, contextKey: "forged-ctx", fingerprint: "forged-fp",
    status: "complete", summary: "forged", notes: [], result: {},
    steps: [{ id: "fstep", type: "actorPatch", before: { "system.attributes.hp.value": 50 }, after: { "system.attributes.hp.value": 9999 }, status: "complete" }],
  }] };
  await assert.rejects(j.undoDefenderAdvancement(m.actor, { kind: "setup", useId: "forged-1", confirmed: true, contextKey: "forged-ctx" }),
    undefined, "01.7: caller journal data is not permission to write arbitrary Actor paths");
  assert.equal(m.actor.system.attributes.hp.value, 50, "01.7: the forged HP path was not restored either direction");
  assert.ok(!m.actor.writes.some(w => Object.keys(w).some(p => p.startsWith("system.attributes.hp"))), "01.7: no Actor-attribute write from the forged operation");

  // (d) A locked (previous-encounter) receipt is visible but not player-undoable.
  const n = harness({ level: 5, enabled: false });
  const plan3 = previewDefenderSetup(n.actor);
  await applyDefenderSetup(n.actor, { confirmed: true, contextKey: plan3.contextKey, operationId: "lock-1" });
  const writesLocked = n.writesCount();
  n.setEpoch(1);                                                               // a new encounter starts and locks prior receipts
  const pv3 = j.previewDefenderAdvancementUndo(n.actor, { kind: "setup", useId: "lock-1" });
  assert.equal(pv3.locked, true, "01.7: the previous-epoch receipt previews as locked");
  await assert.rejects(j.undoDefenderAdvancement(n.actor, { kind: "setup", useId: "lock-1", confirmed: true, contextKey: pv3.contextKey }),
    undefined, "01.7: a locked receipt cannot be undone");
  assert.equal(n.writesCount(), writesLocked, "01.7: the locked attempt wrote nothing");
  const listed3 = j.listDefenderAdvancement(n.actor);
  const lockEntry = listed3.find(e => e.id === "lock-1");
  assert.ok(lockEntry, "01.7: locked receipts stay visible in history, not vanish");
  assert.equal(lockEntry.locked, true);
  assert.equal(lockEntry.status, "complete");

  // (e) Interruption recovery crosses an encounter boundary: the epoch lock applies to undo, not completion.
  const o = harness({ level: 13, enabled: false, res: 4 });
  o.actor.__wp01Effects = [managedDesired("c3-edge")];
  const plan4 = previewDefenderSetup(o.actor);
  o.actor.__crashAfterCreate = true;
  await assert.rejects(applyDefenderSetup(o.actor, { confirmed: true, contextKey: plan4.contextKey, operationId: "edge-1" }), /simulated lost response/);
  o.setEpoch(1);
  const recovered = o.reload();
  const result = await j.retryDefenderAdvancement(recovered.actor, { kind: "setup", useId: "edge-1", confirmed: true });
  assert.ok(result, "01.7: an interrupted advancement completes after the epoch boundary (§3.3)");
  assert.equal(journalOp(recovered.actor, "edge-1").status, "complete");
});

/* ------------------------------------------------------------------ 01.8 */

test("setup-existing-planners", async () => {
  const h = harness({ level: 13, enabled: false });
  const actor = h.actor;
  h.makeFeature("feat", "feature-x");
  const activity = { _id: "ak5eTestActivity1", type: "utility", name: "Test" };
  h.actor.__wp01Effects = [managedDesired("c3-compat")];
  h.actor.__wp01Activities = [{ chapterThreeId: "feature-x", activity }];

  // Existing planner registration + result fields remain valid (frozen §3.2 surface).
  assert.equal(MANAGED_EFFECT_FLAG, "defenderManagedEffect", "01.8: the managed-effect flag key is unchanged");
  const plan = previewDefenderSetup(actor);
  for (const key of ["enable", "reactionMax", "empty", "blocked", "warnings", "createEffects", "contextKey"])
    assert.ok(key in plan, `01.8: preview result keeps its existing field ${key}`);
  assert.equal(plan.createEffects.length, 1);
  assert.equal(plan.addActivities.length, 1, "01.8: planActivity still feeds the existing preview field");
  const result = await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "compat-1" });
  assert.equal(result.reactionMax, 2, "01.8: confirmed apply result fields stay compatible");
  assert.equal(actor.effects.size, 1, "01.8: managed effect created once");
  assert.ok(actor.items.get("feat").system.activities.has("ak5eTestActivity1"), "01.8: the managed activity grant still lands on the Item");
  assert.equal(previewDefenderSetup(actor).empty, true, "01.8: idempotence for already-configured characters");

  // Re-registering the same planner identity must not duplicate contributions.
  registerSetupPlanner(() => {});
  assert.equal(previewDefenderSetup(actor).createEffects.length, 0);

  // A non-Defender gains nothing.
  const none = harness({ level: 13, enabled: false });
  none.actor.items.clear();
  const blocked = previewDefenderSetup(none.actor);
  assert.ok(blocked.blocked.includes("NotDefender"), "01.8: non-Defender still blocked");
  await assert.rejects(applyDefenderSetup(none.actor, { confirmed: true, contextKey: blocked.contextKey, operationId: "compat-2" }), undefined);
  assert.equal(none.writesCount(), 0, "01.8: a blocked actor is not written");
  assert.equal(none.actor.effects.size, 0, "01.8: no unrelated grants to non-Defenders");

  // The existing setup test's authored-preservation expectations still hold verbatim.
  const effect = [...actor.effects.values()][0];
  effect.changes = [{ key: "system.bonuses.mwak.damage", mode: 2, value: "99", priority: 20 }];
  actor.__wp01Effects = [managedDesired("c3-compat", "@prof + 1")];
  const replan = previewDefenderSetup(actor);
  assert.equal(replan.updateEffects.length, 0, "01.8: edited managed effect remains preserved");
  assert.ok(replan.warnings.some(w => /beyond its managed baseline/.test(w)));
  actor.items.get("feat").system.activities.set("ak5eTestActivity1", { ...activity, name: "Edited" });
  assert.equal(previewDefenderSetup(actor).addActivities.length, 0, "01.8: an edited activity wins over the managed one");
});

/* ------------------------------------------------------------------ 01.9 */

test("setup-live-export-journal", async () => {
  const j = await journalApi();

  // Static guard: the public namespace export is the tested entry point itself (ak5e.mjs:400 live path).
  const moduleSource = readFileSync(fileURLToPath(new URL("../scripts/ak5e.mjs", import.meta.url)), "utf8");
  assert.match(moduleSource, /preview:\s*previewDefenderSetup\s*,\s*apply:\s*applyDefenderSetup/,
    "01.9: game.ak5e.defender must keep exposing the tested preview/apply functions (§WP-01 live path)");

  // Dynamic proof through the public surface (helper-only passes are insufficient): the export path
  // itself produces the journal, and §3.3 undo reverses its actual managed changes.
  const h = harness({ level: 13, enabled: false });
  // harness() -> world() replaces globalThis.game, so the namespace stub must be installed after it.
  globalThis.game.ak5e = { defender: Object.freeze({ preview: previewDefenderSetup, apply: applyDefenderSetup }) };
  h.actor.__wp01Effects = [managedDesired("c3-wiring")];
  const plan = game.ak5e.defender.preview(h.actor);
  assert.equal(plan.empty, false, "scenario: the public preview reports work");
  const result = await game.ak5e.defender.apply(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "live-1" });
  assert.ok(result, "01.9: the public apply still resolves with its compatible result");

  const op = journalOp(h.actor, "live-1");
  assert.ok(op, "01.9: invoking the PUBLIC game.ak5e.defender.apply must produce the §3.3 journal (a helper-only passing test is insufficient)");
  assertJournalOpShape(op, "live-1", "setup", "complete");
  const managedId = [...h.actor.effects.keys()][0];

  const pv = j.previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "live-1" });
  const undo = await j.undoDefenderAdvancement(h.actor, { kind: "setup", useId: "live-1", confirmed: true, contextKey: pv.contextKey });
  assert.equal(undo.undone, true, "01.9: the actual managed setup changes are undoable via the §3.3 API");
  assert.equal(h.actor.effects.has(managedId), false, "01.9: the created managed effect is removed by undo");
  assert.equal(h.actor.flags.ak5e.defender.enabled, false, "01.9: the journaled before-state is restored");
  const listed = j.listDefenderAdvancement(h.actor);
  assert.equal(listed.find(e => e.id === "live-1").status, "undone");
});
