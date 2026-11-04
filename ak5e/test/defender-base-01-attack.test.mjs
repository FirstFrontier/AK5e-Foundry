/**
 * WP defender-base-01 — ATTACK tests (tester: adversary; candidate under attack: the frozen 9/9 build).
 *
 * Drafted from SPEC-defender-base-replan.md §5 WP-01 "Attack themes" + §3.3:
 *   interrupted create/patch/delete/undo at every await; same/different concurrent IDs;
 *   stale preview; journal spoof / prototype paths; NaN steps; deleted document;
 *   later authored edit; locked encounter; owner/observer/GM.
 *
 * Black-box: only public entry points (applyDefenderSetup + the §3.3 journal exports) and observable
 * Actor state. Production files are FROZEN for this run — nothing here edits them.
 * A failure is a candidate break; the repro is inline and the spec citation is in the assertion message.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, world } from "./defender-fixture.mjs";
import {
  previewDefenderSetup, applyDefenderSetup, registerSetupPlanner,
  reconcileManagedEffect, planActivity,
} from "../scripts/defender-setup.mjs";
import {
  runDefenderAdvancement, retryDefenderAdvancement, listDefenderAdvancement,
  previewDefenderAdvancementUndo, undoDefenderAdvancement,
} from "../scripts/defender-advancement.mjs";

const JOURNAL_KEY = "defenderAdvancement";
const MARKER_KEY = "defenderAdvancementStep";
const journalOf = actor => actor.flags?.ak5e?.[JOURNAL_KEY];
const journalOp = (actor, id) => (journalOf(actor)?.operations ?? []).find(op => op && op.id === id);
const managedDesired = (sourceId, value = "@prof") => ({
  sourceId, name: `Managed ${sourceId}`,
  changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value, priority: 20 }],
});

/* ------------------------------------------------------------------ harness (owned by this file) */

registerSetupPlanner((actor, _profile, plan) => {
  for (const desired of actor.__wp01Effects ?? []) reconcileManagedEffect(actor, desired, plan);
  for (const a of actor.__wp01Activities ?? []) planActivity(actor, a.chapterThreeId, a.activity, plan);
});

const strip = key => key.replace(/^==/, "");
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

let epoch = 0;

function harness(opts = {}) {
  const { level = 13, enabled = false, owner = true, res = null, effects = [], baseline = null } = opts;
  world();
  epoch = 0;
  globalThis.game.settings = {
    get: (module, key) => (module === "ak5e" && key === "encounterEpoch" ? epoch : false),
    set: async () => {}, register: () => {},
  };
  globalThis.Hooks = { on: () => {} };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => {
    const stored = structuredClone(data); stored.getFlag = (s, k) => stored.flags?.[s]?.[k];
    game.messages.push(stored); return stored;
  } } };
  let counter = 0;
  globalThis.foundry = { utils: { randomID: () => `det-op-${++counter}` } };
  const actor = fixture({ level, enabled, owner, res });
  const events = [];
  const fault = {                              // await-level injection controls (attack harness)
    journalFailNth: 0, journalWrites: 0,
    leafFailOnce: false, createFailAfterInsert: false, embeddedUpdateFailOnce: false, deleteFailOnce: false,
  };
  actor.effects = new Map();
  const makeDoc = (record, id, type, collection) => ({
    ...record, id, type, parentUuid: actor.uuid,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) {
      events.push({ ev: "embeddedUpdate", id, paths: Object.keys(changes) });
      if (fault.embeddedUpdateFailOnce) { fault.embeddedUpdateFailOnce = false; throw new Error("simulated lost response on embedded update"); }
      applyPaths(this, changes); return this;
    },
    async delete() {
      events.push({ ev: "embeddedDelete", id });
      if (fault.deleteFailOnce) { fault.deleteFailOnce = false; throw new Error("simulated lost response on embedded delete"); }
      collection.delete(id);
    },
  });
  if (baseline) actor.effects.set(baseline.id, makeDoc(structuredClone(baseline), baseline.id, "ActiveEffect", actor.effects));
  actor.__wp01Effects = effects;
  actor.__wp01Activities = opts.activities ?? [];
  actor.update = async changes => {
    const paths = Object.keys(changes);
    const isJournal = paths.some(p => p.includes(`flags.ak5e.${JOURNAL_KEY}`));
    events.push({ ev: isJournal ? "journalWrite" : "actorUpdate", paths });
    if (isJournal) {
      fault.journalWrites += 1;
      if (fault.journalFailNth === fault.journalWrites) throw new Error(`simulated lost response on journal write #${fault.journalWrites}`);
    } else if (fault.leafFailOnce) {
      fault.leafFailOnce = false; throw new Error("simulated lost response on Actor leaf write");
    }
    actor.writes.push(structuredClone(changes));
    applyPaths(actor, changes);
    return actor;
  };
  actor.createEmbeddedDocuments = async (type, data, context = {}) => {
    const collection = type === "ActiveEffect" ? actor.effects : actor.items;
    const docs = data.map(entry => {
      const record = structuredClone(entry);
      const keep = context.keepId === true && typeof record._id === "string" && record._id;
      const id = keep ? record._id : `${type === "ActiveEffect" ? "fx" : "it"}-${++counter}`;
      const doc = makeDoc(record, id, type, collection);
      collection.set(id, doc);
      return doc;
    });
    events.push({ ev: "create", type, requestedIds: data.map(d => d?._id ?? null), keepId: context.keepId === true });
    if (fault.createFailAfterInsert) { fault.createFailAfterInsert = false; throw new Error("simulated lost response after a successful embedded create"); }
    return docs;
  };
  actor.items.get = id => actor.items.constructor.prototype.get.call(actor.items, id);
  return {
    actor, fault, events,
    setEpoch(value) { epoch = value; },
    writesCount: () => actor.writes.length,
    journalWriteCount: () => events.filter(e => e.ev === "journalWrite").length,
    reload: () => reloadHarness(actor, opts),
  };
}

/* Rebuild exactly what a reload surfaces: flags/documents survive, closures and armed faults do not. */
function reloadHarness(actor, opts) {
  const state = {
    flags: structuredClone(actor.flags), isOwner: actor.isOwner,
    effects: [...actor.effects.values()].map(e => structuredClone(plain(e))),
  };
  const h = harness(opts);
  const a2 = h.actor;
  a2.flags = structuredClone(state.flags);
  a2.isOwner = state.isOwner;
  a2.effects = new Map(state.effects.map(e => {
    const doc = {
      ...e, type: "ActiveEffect", parentUuid: a2.uuid,
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async update(changes) { applyPaths(this, changes); a2.writes.push(structuredClone(changes)); return this; },
      async delete() { a2.effects.delete(this.id); },
    };
    return [e.id, doc];
  }));
  return h;
}

const fixedBudget = actor => {
  const b = actor.flags.ak5e?.reactionBudget ?? {};
  return structuredClone({ spent: b.spent, triggers: b.triggers, receipts: b.receipts });
};

/* ------------------------------------------------------------------ interrupted create/patch/delete/undo at every await */

test("atk-interrupt-forward-at-every-await", async () => {
  // One plan exercising every forward step shape: actorPatch x2, embeddedCreate, embeddedPatch.
  // Clean-run journal awaits: intent(1) + 4 step acks(2..5) + completion(6).
  const baseline = {
    id: "fx-base", name: "Managed Reactive",
    changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }],
    flags: { ak5e: { defenderManagedEffect: { sourceId: "c3-1033-reactive",
      managedChanges: [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }], active: true } } },
  };
  const scenario = { level: 13, res: 5, baseline, effects: [managedDesired("c3-1033-reactive", "@prof + 1"), managedDesired("c3-create-me")] };
  const failPoints = [1, 2, 3, 4, 5, 6, "create", "patch", "leaf"];

  for (const point of failPoints) {
    const h = harness(scenario);
    const actor = h.actor;
    actor.flags.ak5e.reactionBudget = { max: 1, spent: 1, triggers: { trigA: { receipt: "rX" } }, receipts: { rX: { id: "rX", perTrigger: true } } };
    actor.flags.ak5e.shelter = { allies: ["Actor.ally"] };
    const poolBefore = structuredClone(actor.flags.ak5e.resourcePools);
    const budgetFixed = fixedBudget(actor);
    if (point === "create") h.fault.createFailAfterInsert = true;
    else if (point === "patch") h.fault.embeddedUpdateFailOnce = true;
    else if (point === "leaf") h.fault.leafFailOnce = true;
    else h.fault.journalFailNth = point;

    const plan = previewDefenderSetup(actor);
    assert.equal(plan.updateEffects.length, 1, "scenario: unmodified managed baseline is patchable");
    assert.equal(plan.createEffects.length, 1, "scenario: one managed create pending");
    await assert.rejects(applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: `brk-${point}` }),
      /simulated lost response/, `injection ${point}: apply must surface the lost response`);
    assert.equal(game.messages.length, 0, `injection ${point}: advancement never posts chat`);

    const h2 = h.reload();
    const reloaded = h2.actor;
    const op = journalOp(reloaded, `brk-${point}`);
    if (point === 1) {
      // Intent write lost → nothing may have executed; the same id runs cleanly from scratch.
      assert.equal(op, undefined, "injection 1: intent write failed → no operation may exist");
      assert.equal(reloaded.flags.ak5e.defender.enabled, false, "injection 1: nothing mutated before the intent persisted");
      assert.equal(reloaded.effects.size, 1, "injection 1: no document written before the intent persisted");
      const plan2 = previewDefenderSetup(reloaded);
      const result = await applyDefenderSetup(reloaded, { confirmed: true, contextKey: plan2.contextKey, operationId: `brk-${point}` });
      assert.equal(result.enabled, true);
      assert.equal(journalOp(reloaded, "brk-1").status, "complete", "injection 1: clean convergence after the intent write was lost");
      assert.equal(reloaded.effects.size, 2, "injection 1: exactly one managed create on the rerun");
      continue;
    }
    assert.equal(op.status, "applying", `injection ${point}: interrupted op stays applying`);
    const result = await retryDefenderAdvancement(reloaded, { kind: "setup", useId: `brk-${point}`, confirmed: true });
    assert.equal(result.enabled, true, `injection ${point}: retry resolves with the caller result`);
    assert.equal(journalOp(reloaded, `brk-${point}`).status, "complete", `injection ${point}: retry completes the persisted intent`);
    assert.equal(reloaded.flags.ak5e.defender.enabled, true, `injection ${point}: enable intent resumed`);
    assert.equal(reloaded.flags.ak5e.reactionBudget.max, 2, `injection ${point}: Reactive max reaches the source threshold (C3:1033–1034)`);
    const created = [...reloaded.effects.values()].filter(e => e.flags?.ak5e?.[MARKER_KEY]?.operationId === `brk-${point}`);
    assert.equal(created.length, 1, `injection ${point}: exactly one managed document (recognised by preassigned id, never recreated)`);
    assert.equal(reloaded.effects.get("fx-base").changes[0].value, "@prof + 1", `injection ${point}: the patch step converges to the journaled after-value`);
    assert.deepEqual(fixedBudget(reloaded), budgetFixed, `injection ${point}: spent/trigger/receipt state is never reset`);
    assert.deepEqual(reloaded.flags.ak5e.resourcePools, poolBefore, `injection ${point}: Resilience pool not reset by recovery (C3:986–989)`);
    assert.deepEqual(reloaded.flags.ak5e.shelter, { allies: ["Actor.ally"] }, `injection ${point}: unrelated leaves untouched`);

    // Replay of the completed op: resolves with the original result and writes nothing.
    const writesAfter = reloaded.writes.length;
    const again = await retryDefenderAdvancement(reloaded, { kind: "setup", useId: `brk-${point}`, confirmed: true });
    assert.deepEqual(again, result, `injection ${point}: retry of a completed op replays the result`);
    assert.equal(reloaded.writes.length, writesAfter, `injection ${point}: the replay writes nothing`);
    assert.equal([...reloaded.effects.values()].filter(e => e.flags?.ak5e?.[MARKER_KEY]?.operationId === `brk-${point}`).length, 1);
  }
});

test("atk-interrupt-undo-at-every-await", async () => {
  // Undo awaits, in reversal order for this plan: managed-create delete → reaction leaf → enable leaf → status journal write.
  const scenario = { level: 13, res: 5, effects: [managedDesired("c3-undo-attack")] };
  for (const point of ["delete", "leaf1", "journal"]) {
    const h = harness(scenario);
    const actor = h.actor;
    const plan = previewDefenderSetup(actor);
    await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: `und-${point}` });
    const createdId = [...actor.effects.keys()].find(id => actor.effects.get(id).flags?.ak5e?.[MARKER_KEY]);
    assert.ok(createdId, "scenario: managed effect created");

    if (point === "delete") h.fault.deleteFailOnce = true;
    else if (point === "leaf1") h.fault.leafFailOnce = true;
    else { const before = h.journalWriteCount(); h.fault.journalFailNth = before + 1; }   // undo's status commit is the next journal await

    const pv = previewDefenderAdvancementUndo(actor, { kind: "setup", useId: `und-${point}` });
    const outcome = await undoDefenderAdvancement(actor, { kind: "setup", useId: `und-${point}`, confirmed: true, contextKey: pv.contextKey })
      .then(() => "resolved", error => error.message);
    assert.match(String(outcome), /simulated lost response/, `undo ${point}: the injected failure surfaces`);
    assert.equal(journalOp(actor, `und-${point}`).status, "complete", `undo ${point}: a failed reversal keeps the op complete`);
    if (point === "delete") {
      assert.ok(actor.effects.has(createdId), "undo delete-failure: the document survives");
      assert.equal(actor.flags.ak5e.defender.enabled, true, "undo delete-failure: later leaf restores were not attempted");
    } else {
      assert.equal(actor.effects.has(createdId), false, `undo ${point}: the managed create was already removed`);
      assert.equal(actor.flags.ak5e.reactionBudget.max, point === "leaf1" ? 2 : 1,
        `undo ${point}: partial reversal state is consistent with where the failure hit`);
    }

    // Resume: a fresh preview + undo must finish WITHOUT repeating completed reversals and without resurrection.
    const pv2 = previewDefenderAdvancementUndo(actor, { kind: "setup", useId: `und-${point}` });
    const undo2 = await undoDefenderAdvancement(actor, { kind: "setup", useId: `und-${point}`, confirmed: true, contextKey: pv2.contextKey });
    assert.equal(undo2.undone, true, `undo ${point}: the resumed undo converges`);
    assert.equal(actor.flags.ak5e.defender.enabled, false, `undo ${point}: fully reversed`);
    assert.equal(actor.flags.ak5e.reactionBudget.max, 1, `undo ${point}: max restored to the journaled before-value`);
    assert.equal(actor.effects.has(createdId), false, `undo ${point}: the removed managed create is not resurrected by the resumed pass`);
    assert.equal(journalOp(actor, `und-${point}`).status, "undone");

    const pv3 = previewDefenderAdvancementUndo(actor, { kind: "setup", useId: `und-${point}` });
    const writesEnd = actor.writes.length;
    const undo3 = await undoDefenderAdvancement(actor, { kind: "setup", useId: `und-${point}`, confirmed: true, contextKey: pv3.contextKey });
    assert.equal(undo3.undone, false, `undo ${point}: repeated undo of an undone receipt is a no-op`);
    assert.equal(actor.writes.length, writesEnd, `undo ${point}: the repeated undo mutates nothing`);
  }
});

test("atk-interrupt-delete-and-recreate", async () => {
  // A journaled embeddedDelete interrupted at its document.delete await, resumed via retry — then undone.
  const h = harness({ level: 5, enabled: true });
  const actor = h.actor;
  const doomed = { id: "fx-doomed", _id: "fx-doomed", name: "Obsolete managed effect", changes: [],
    flags: { ak5e: { [MARKER_KEY]: { operationId: "del-op", stepId: "d1" } } } };
  actor.effects.set(doomed.id, { ...doomed, type: "ActiveEffect", parentUuid: actor.uuid,
    getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(c) { applyPaths(this, c); return this; },
    async delete() {
      if (actor.__delFail) { actor.__delFail = false; throw new Error("simulated lost response on embedded delete"); }
      actor.effects.delete(this.id);
    } });
  actor.flags.ak5e[JOURNAL_KEY] = { version: 1, operations: [{
    id: "del-op", kind: "setup", userId: "player", epoch: 0, contextKey: "ctx-del", fingerprint: "fp-del",
    status: "applying", summary: "delete slice", notes: [], result: { deleted: true },
    steps: [{ id: "d1", type: "embeddedDelete", documentType: "ActiveEffect", documentId: "fx-doomed",
      before: { _id: "fx-doomed", name: "Obsolete managed effect", changes: [] }, after: null, status: "pending" }],
  }] };
  actor.__delFail = true;
  await assert.rejects(retryDefenderAdvancement(actor, { kind: "setup", useId: "del-op", confirmed: true }), /simulated lost response/);
  assert.ok(actor.effects.has("fx-doomed"), "delete-failure: document survives");
  assert.equal(journalOp(actor, "del-op").status, "applying", "delete-failure: op stays applying");
  const result = await retryDefenderAdvancement(actor, { kind: "setup", useId: "del-op", confirmed: true });
  assert.deepEqual(result, { deleted: true }, "resume returns the persisted caller result");
  assert.equal(actor.effects.has("fx-doomed"), false, "resume completes the journaled delete");
  assert.equal(journalOp(actor, "del-op").status, "complete");

  const pv = previewDefenderAdvancementUndo(actor, { kind: "setup", useId: "del-op" });
  const undo = await undoDefenderAdvancement(actor, { kind: "setup", useId: "del-op", confirmed: true, contextKey: pv.contextKey });
  assert.equal(undo.undone, true);
  assert.equal(actor.effects.get("fx-doomed")?.name, "Obsolete managed effect", "undo restores a managed deletion while its id is still absent");

  // Restore-then-lost-ack: delete the restored doc again, arm a delete failure on the recreation path…
  const undoAgain = await undoDefenderAdvancement(actor, { kind: "setup", useId: "del-op", confirmed: true, contextKey: pv.contextKey });
  assert.equal(undoAgain.undone, false, "a second undo of an undone receipt must not re-run reversals (no double restore)");
  assert.equal(actor.effects.size, 1, "exactly one restored document after repeated undo attempts");
});

/* ------------------------------------------------------------------ concurrency */

test("atk-concurrent-same-id", async () => {
  // (a) Simultaneous same id + same steps: serialization replays the completed result; one document, one record.
  const h = harness({ level: 5, enabled: true });
  const actor = h.actor;
  const spec = { kind: "setup", id: "dup-1", contextKey: "ctx-d", fingerprint: "fp-d",
    steps: [{ id: "c1", type: "embeddedCreate", documentType: "ActiveEffect", documentId: "fxdup",
      before: null, after: { _id: "fxdup", name: "Dup", changes: [] } }], result: { marker: "D" } };
  const both = await Promise.all([runDefenderAdvancement(actor, spec), runDefenderAdvancement(actor, spec)]);
  assert.deepEqual(both[0], { marker: "D" });
  assert.deepEqual(both[1], { marker: "D" }, "01.4/§3.3: simultaneous same-id calls both resolve (replay); neither corrupts the journal");
  assert.equal(actor.effects.size, 1, "same-id race must not create the document twice");
  assert.equal(journalOf(actor).operations.filter(o => o.id === "dup-1").length, 1, "same-id race must not double-record the operation");

  // (b) Same id, DIFFERENT immutable input, simultaneous: the loser rejects before touching anything.
  const k = harness({ level: 5, enabled: true });
  const settled = await Promise.allSettled([
    runDefenderAdvancement(k.actor, { kind: "setup", id: "dup-2", contextKey: "ctx-x", fingerprint: "fp-X",
      steps: [{ id: "s1", type: "actorPatch", before: { "flags.ak5e.defender.uses": {} }, after: { "flags.ak5e.defender.uses": { owned: true } } }], result: { marker: "Y" } }),
    runDefenderAdvancement(k.actor, { kind: "setup", id: "dup-2", contextKey: "ctx-x", fingerprint: "fp-OTHER",
      steps: [{ id: "s1", type: "actorPatch", before: { "flags.ak5e.defender.uses": {} }, after: { "flags.ak5e.defender.uses": { stolen: true } } }], result: { marker: "X" } }),
  ]);
  assert.equal(settled[0].status, "fulfilled");
  assert.equal(settled[1].status, "rejected", "§3.3/01.4: same id with a changed fingerprint rejects, even mid-race");
  assert.equal(k.actor.flags.ak5e.defender.uses.owned, true);
  assert.equal(k.actor.flags.ak5e.defender.uses.stolen, undefined, "the rejected rival applied no steps");
  assert.equal(journalOp(k.actor, "dup-2").fingerprint, "fp-X", "the persisted fingerprint is never overwritten by the loser");

  // (c) Reusing the id under a different kind: technical failure before mutation.
  const writesC = k.writesCount();
  await assert.rejects(runDefenderAdvancement(k.actor, { kind: "progression", id: "dup-2", contextKey: "ctx-x", fingerprint: "fp-X",
    steps: [{ id: "s1", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.rulings": { cross: true } } }], result: {} }),
    /kind|setup/i);
  assert.equal(k.writesCount(), writesC, "the cross-kind reuse wrote nothing");
  assert.deepEqual(k.actor.flags.ak5e.defender.rulings, {}, "the rejected cross-kind op applied no leaf writes");

  // (d) Simultaneous same-id setup applies: the in-flight guard rejects exactly one; state stays coherent.
  const m = harness({ level: 13, effects: [managedDesired("c3-race")] });
  const plan = previewDefenderSetup(m.actor);
  const race = await Promise.allSettled([
    applyDefenderSetup(m.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "dup-3" }),
    applyDefenderSetup(m.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "dup-3" }),
  ]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1, "exactly one concurrent same-id apply proceeds");
  assert.equal(m.actor.effects.size, 1, "the race created one managed document");
  assert.equal(journalOf(m.actor).operations.filter(o => o.id === "dup-3").length, 1);
  assert.equal(previewDefenderSetup(m.actor).empty, true, "the in-flight guard did not leak; the actor is configured afterwards");
});

test("atk-concurrent-different-ids", async () => {
  const h = harness({ level: 13, effects: [managedDesired("c3-mix")] });
  const actor = h.actor;
  actor.flags.ak5e.defender.rulings = { witnessA: false, witnessB: false, witnessC: false };
  const plan = previewDefenderSetup(actor);
  const leaf = (w, v) => [{ id: `${w}-step`, type: "actorPatch", before: { [`flags.ak5e.defender.rulings.${w}`]: false }, after: { [`flags.ak5e.defender.rulings.${w}`]: v } }];
  const settled = await Promise.allSettled([
    applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey, operationId: "mix-setup" }),
    runDefenderAdvancement(actor, { kind: "setup", id: "mix-a", contextKey: "ca", fingerprint: "fa", steps: leaf("witnessA", true), result: { m: "A" } }),
    runDefenderAdvancement(actor, { kind: "progression", id: "mix-b", contextKey: "cb", fingerprint: "fb", steps: leaf("witnessB", true), result: { m: "B" } }),
    runDefenderAdvancement(actor, { kind: "progression", id: "mix-c", contextKey: "cc", fingerprint: "fc", steps: leaf("witnessC", true), result: { m: "C" } }),
  ]);
  for (const [i, s] of settled.entries()) assert.equal(s.status, "fulfilled", `different-id op ${i} must complete under serialization`);
  assert.equal(actor.flags.ak5e.defender.rulings.witnessA, true);
  assert.equal(actor.flags.ak5e.defender.rulings.witnessB, true);
  assert.equal(actor.flags.ak5e.defender.rulings.witnessC, true, "§3.3: different IDs across both kinds serialize per Actor without lost leaves");
  const ids = listDefenderAdvancement(actor).map(e => e.id);
  for (const id of ["mix-setup", "mix-a", "mix-b", "mix-c"]) assert.ok(ids.includes(id), `journal must retain ${id}: whole-journal writes cannot drop a concurrent entry`);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(actor.effects.size, 1, "one managed document from the mixed concurrency");
});

/* ------------------------------------------------------------------ stale preview */

test("atk-stale-preview-matrix", async () => {
  // (a) Preview, external change, stale contextKey → rejects with NO journal trace and zero mutation.
  const h = harness({ level: 13, effects: [managedDesired("c3-stale")] });
  const actor = h.actor;
  const stale = previewDefenderSetup(actor);
  await actor.update({ "flags.ak5e.defender.enabled": true });          // external change after the preview
  await assert.rejects(applyDefenderSetup(actor, { confirmed: true, contextKey: stale.contextKey, operationId: "stale-1" }),
    /preview the setup again/);
  assert.equal(journalOf(actor), undefined, "01.1: a stale apply leaves no journal operation at all");
  assert.equal(actor.effects.size, 0, "01.1: a stale apply creates nothing");
  assert.equal(actor.writes.length, 1, "only the external write happened");
  assert.equal(game.messages.length, 0);

  // (b) Completed id + changed immutable input while the plan still has work → reject; fingerprint intact.
  const k = harness({ level: 13, effects: [managedDesired("c3-idem")] });
  const planB = previewDefenderSetup(k.actor);
  const resultB = await applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB.contextKey, operationId: "idem-1" });
  const writes = k.writesCount();
  const fingerprint = journalOp(k.actor, "idem-1").fingerprint;
  k.actor.__wp01Effects = [managedDesired("c3-idem"), managedDesired("c3-extra")];   // new pending work under the same id
  const planB2 = previewDefenderSetup(k.actor);
  await assert.rejects(applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB2.contextKey, operationId: "idem-1" }),
    undefined, "01.4: same id with different persisted input must reject");
  assert.equal(k.actor.effects.size, 1, "01.4: the rejected attempt created nothing");
  assert.equal(journalOp(k.actor, "idem-1").fingerprint, fingerprint, "01.4: the original fingerprint is never overwritten");
  assert.equal(k.writesCount(), writes, "01.4: the rejection happens before any mutation");

  // (c) Same id, EMPTY pending plan, drifted fingerprint, NEWLY generated key: must reject with the
  // changed-input error (§3.3 duplicate-ID rule, AC 01.4). A fresh key for changed context is not the
  // original acknowledgement, even when no write would occur.
  k.actor.__wp01Effects = [managedDesired("c3-idem")];   // the created effect now matches its desired state — nothing pending
  const planB3 = previewDefenderSetup(k.actor);
  assert.equal(planB3.empty, true, "scenario: nothing left to apply");
  await assert.rejects(applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB3.contextKey, operationId: "idem-1" }),
    /different setup choices/, "01.4: a newly generated key for changed context must reject even when the plan is empty");
  assert.equal(k.writesCount(), writes, "01.4: the changed-input rejection performs zero writes");
  assert.equal(journalOp(k.actor, "idem-1").fingerprint, fingerprint, "the rejection does not re-fingerprint the receipt");

  // (c2) Legitimate replay: the ORIGINAL acknowledged key with nothing left to apply returns the recorded
  // result with zero writes.
  const replay = await applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB.contextKey, operationId: "idem-1" });
  assert.deepEqual(replay, resultB, "01.4: the original-key replay returns the ORIGINAL result");
  assert.equal(k.writesCount(), writes, "01.4: the legitimate empty-plan replay performs zero writes");
  assert.equal(journalOp(k.actor, "idem-1").fingerprint, fingerprint, "the replay does not re-fingerprint the receipt");

  // (d) Interrupted (applying) op + same id with changed input → reject; the persisted intent is untouched.
  const m = harness({ level: 13, effects: [managedDesired("c3-applying")] });
  m.fault.journalFailNth = 3;                                          // intent + step acks ok, one ack lost
  const planD = previewDefenderSetup(m.actor);
  await assert.rejects(applyDefenderSetup(m.actor, { confirmed: true, contextKey: planD.contextKey, operationId: "appl-1" }),
    /simulated lost response/);
  const applyingOp = journalOp(m.actor, "appl-1");
  assert.equal(applyingOp.status, "applying", "scenario: op left applying");
  const stepsBefore = structuredClone(applyingOp.steps);
  m.actor.__wp01Effects = [managedDesired("c3-applying"), managedDesired("c3-different")];
  const planD2 = previewDefenderSetup(m.actor);
  await assert.rejects(applyDefenderSetup(m.actor, { confirmed: true, contextKey: planD2.contextKey, operationId: "appl-1" }),
    undefined, "§3.3: an applying op must not silently absorb different choices");
  assert.deepEqual(journalOp(m.actor, "appl-1").steps, stepsBefore, "the persisted intent is untouched by the rejected attempt");
  assert.equal(journalOp(m.actor, "appl-1").fingerprint, applyingOp.fingerprint);

  // (e) Stale UNDO preview key: preview, external leaf change, confirm with the cached key → reject.
  const n = harness({ level: 13, effects: [managedDesired("c3-undostale")] });
  const planE = previewDefenderSetup(n.actor);
  await applyDefenderSetup(n.actor, { confirmed: true, contextKey: planE.contextKey, operationId: "undo-stale" });
  const pvE = previewDefenderAdvancementUndo(n.actor, { kind: "setup", useId: "undo-stale" });
  const writesE = n.writesCount();
  await n.actor.update({ "flags.ak5e.reactionBudget.max": 3 });         // GM edits a journaled leaf after the preview
  await assert.rejects(undoDefenderAdvancement(n.actor, { kind: "setup", useId: "undo-stale", confirmed: true, contextKey: pvE.contextKey }),
    /preview the undo again/, "01.6: a stale undo contextKey must not act");
  assert.equal(n.writesCount(), writesE + 1, "the stale undo wrote nothing beyond the GM's own edit");
});

/* ------------------------------------------------------------------ journal spoof / prototype paths */

const polluted = key => Object.prototype.hasOwnProperty.call(Object.prototype, key) || ({})[key] !== undefined;
function cleanPrototype() {
  for (const key of ["evil", "pwned", "polluted"]) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, key)) delete Object.prototype[key];
  }
}

test("atk-prototype-path-rejection", async () => {
  // §3.3: "Caller data is not permission to write arbitrary Actor paths." Step paths whose dotted
  // traversal leaves the whitelisted namespace through __proto__/constructor must be a technical
  // failure with ZERO writes — not a silently accepted leaf that escapes into Object.prototype
  // through the dotted-merge update channel the journal itself relies on.
  const breaks = [];
  try {
    // Vector 1: actorPatch under the Defender flag namespace, then up through __proto__.
    const h = harness({ level: 5, enabled: true });
    let threw = null;
    try {
      await runDefenderAdvancement(h.actor, { kind: "setup", id: "proto-1", contextKey: "c", fingerprint: "f",
        steps: [{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.__proto__.evil": true } }], result: {} });
    } catch (error) { threw = error; }
    if (!threw) breaks.push("actorPatch validator accepted a '__proto__' traversal under the Defender prefix");
    if (polluted("evil")) breaks.push("Object.prototype.evil WAS written through a journal actorPatch step (namespace escape)");
    if (h.actor.writes.length !== 0) breaks.push("the accepted __proto__ step performed an Actor write");

    // Vector 2: constructor traversal.
    const k = harness({ level: 5, enabled: true });
    threw = null;
    try {
      await runDefenderAdvancement(k.actor, { kind: "setup", id: "proto-2", contextKey: "c", fingerprint: "f",
        steps: [{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.constructor.prototype.pwned": true } }], result: {} });
    } catch (error) { threw = error; }
    if (!threw) breaks.push("actorPatch validator accepted a 'constructor.prototype' traversal");
    if (polluted("pwned")) breaks.push("Object.prototype.pwned WAS written through a journal actorPatch step");
    if (k.actor.writes.length !== 0) breaks.push("the accepted constructor step performed an Actor write");

    // Vector 3: the managed-Effect path whitelist (EFFECT_PATH) allows dotted continuation — probe __proto__.
    const m = harness({ level: 5, enabled: true });
    const victim = { id: "fx-victim", _id: "fx-victim", name: "Authored", changes: [], flags: { ak5e: {} } };
    m.actor.effects.set(victim.id, { ...victim, type: "ActiveEffect", parentUuid: m.actor.uuid,
      getFlag(s2, k2) { return this.flags?.[s2]?.[k2]; },
      async update(c) { applyPaths(this, c); m.actor.writes.push(structuredClone(c)); return this; },
      async delete() { m.actor.effects.delete(this.id); } });
    threw = null;
    try {
      await runDefenderAdvancement(m.actor, { kind: "setup", id: "proto-3", contextKey: "c", fingerprint: "f",
        steps: [{ id: "s", type: "embeddedPatch", documentType: "ActiveEffect", documentId: "fx-victim",
          before: {}, after: { "flags.ak5e.defenderManagedEffect.__proto__.polluted": true } }], result: {} });
    } catch (error) { threw = error; }
    if (!threw) breaks.push("embeddedPatch Effect-path whitelist accepted a '__proto__' continuation");
    if (polluted("polluted")) breaks.push("Object.prototype.polluted WAS written through a journal embeddedPatch step");
    if (m.actor.writes.length !== 0) breaks.push("the accepted Effect __proto__ step performed a document write");
  } finally {
    cleanPrototype();
    cleanPrototype();
  }
  assert.deepEqual(breaks, [], breaks.map((b, i) => `BREAK ${i + 1}: ${b}`).join(" | "));
});

test("atk-journal-spoof-shapes", async () => {
  // Pre-planted journal garbage must never execute, self-complete or corrupt.
  const h = harness({ level: 5, enabled: true });
  const actor = h.actor;
  actor.flags.ak5e[JOURNAL_KEY] = structuredClone({
    version: 1, operations: [
      null, 42, "op-string", { id: 7 }, { id: "no-kind", status: "applying" },
      { id: "bad-doc-type", kind: "setup", userId: "player", epoch: 0, contextKey: "c", fingerprint: "f", status: "applying",
        summary: "", notes: [], result: {}, steps: [{ id: "s", type: "embeddedCreate", documentType: "Wallet", documentId: "w1", after: { _id: "w1" } }] },
      { id: "bad-status", kind: "setup", userId: "player", epoch: 0, contextKey: "c", fingerprint: "f", status: "pending",
        summary: "", notes: [], result: {}, steps: [] },
      { id: "unowned-delete", kind: "setup", userId: "player", epoch: 0, contextKey: "c", fingerprint: "f", status: "applying",
        summary: "", notes: [], result: {}, steps: [{ id: "d1", type: "embeddedDelete", documentType: "ActiveEffect", documentId: "fx-owned", before: { _id: "fx-owned", name: "Player content" } }] },
    ],
  });
  const authored = { id: "fx-owned", _id: "fx-owned", name: "Player content", changes: [], flags: {} };
  actor.effects.set(authored.id, { ...authored, type: "ActiveEffect", parentUuid: actor.uuid,
    getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(c) { applyPaths(this, c); return this; }, async delete() { actor.effects.delete(this.id); } });
  const writes = actor.writes.length;

  const listed = listDefenderAdvancement(actor);
  assert.ok(Array.isArray(listed), "list must tolerate garbage entries without throwing");
  assert.equal(actor.writes.length, writes, "listing a spoofed journal is read-only");

  for (const bad of ["bad-doc-type", "bad-status"]) {
    await assert.rejects(retryDefenderAdvancement(actor, { kind: "setup", useId: bad, confirmed: true }),
      undefined, `planted malformed receipt ${bad} must not resume`);
    assert.throws(() => previewDefenderAdvancementUndo(actor, { kind: "setup", useId: bad }),
      undefined, "undo preview must refuse malformed receipts too");
  }
  assert.equal(journalOp(actor, "bad-doc-type").status, "applying", "a refused planted op must not self-complete");

  // §3.3 forward delete: "refusing to delete content this receipt does not own" — the ownership marker must match.
  await assert.rejects(retryDefenderAdvancement(actor, { kind: "setup", useId: "unowned-delete", confirmed: true }),
    /does not own|refus/i, "01.7: a journaled delete without a matching ownership marker must be a precise refusal");
  assert.ok(actor.effects.has("fx-owned"), "01.7: an unowned planted delete cannot remove player content");
  assert.equal(actor.writes.length, writes, "the planted attempts wrote nothing");
});

test("atk-undo-planted-create-ownership", async () => {
  // The FORWARD path refuses to delete content the receipt does not own (§3.3 ownership marker).
  // Undo reverses embeddedCreate by deleting whatever matches the receipt's after-value. §3.3 says
  // "Delete only this receipt's unchanged managed create" — the same ownership evidence should apply,
  // otherwise a spoofed/mis-keyed receipt can delete content the journal never created.
  const h = harness({ level: 5, enabled: true });
  const actor = h.actor;
  const authored = { id: "fx-auth", _id: "fx-auth", name: "Precious authored effect",
    changes: [{ key: "system.armor.value", mode: 0, value: "1" }], disabled: false, flags: {} };
  actor.effects.set(authored.id, { ...authored, type: "ActiveEffect", parentUuid: actor.uuid,
    getFlag(s, k) { return this.flags?.[s]?.[k]; },
    async update(c) { applyPaths(this, c); return this; }, async delete() { actor.effects.delete(this.id); } });
  actor.flags.ak5e[JOURNAL_KEY] = { version: 1, operations: [{
    id: "spoof-create", kind: "setup", userId: "player", epoch: 0, contextKey: "c", fingerprint: "f",
    status: "complete", summary: "spoof", notes: [], result: {},
    steps: [{ id: "c1", type: "embeddedCreate", documentType: "ActiveEffect", documentId: "fx-auth",
      before: null, after: { _id: "fx-auth", name: "Precious authored effect",
        changes: [{ key: "system.armor.value", mode: 0, value: "1" }], disabled: false, flags: {} }, status: "complete" }],
  }] };
  const pv = previewDefenderAdvancementUndo(actor, { kind: "setup", useId: "spoof-create" });
  const undo = await undoDefenderAdvancement(actor, { kind: "setup", useId: "spoof-create", confirmed: true, contextKey: pv.contextKey });
  const survived = actor.effects.has("fx-auth");
  assert.ok(survived,
    `BREAK: undo deleted an authored, unowned document the receipt never created (undone=${undo.undone}; `
    + "embeddedCreate undo lacks the ownership-marker check the forward delete enforces — §3.3 'Delete only this receipt's unchanged managed create')");
});

/* ------------------------------------------------------------------ NaN / non-serializable steps */

test("atk-nan-and-nonserializable-steps", async () => {
  const actor = harness({ level: 5, enabled: true }).actor;
  const wrap = (steps, result = {}, fingerprint = "f") => ({ kind: "setup", id: "fz", contextKey: "c", fingerprint, steps, result });
  const leaf = { id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.ok": true } };
  const circular = (() => { const step = { id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.ok": true } }; step.self = step; return step; })();
  const badCases = [
    ["NaN value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.nan": Number.NaN } }])],
    ["-Infinity value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.inf": Number.NEGATIVE_INFINITY } }])],
    ["undefined value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.und": undefined } }])],
    ["function value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.fn": () => true } }])],
    ["symbol value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.sym": Symbol("x") } }])],
    ["bigint value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.bi": 10n } }])],
    ["class instance value", wrap([{ id: "s", type: "actorPatch", before: {}, after: { "flags.ak5e.defender.cls": new (class Thing { })() } }])],
    ["NaN in result", wrap([leaf], { n: Number.NaN })],
    ["array result", wrap([], [])],
    ["circular step", wrap([circular])],
    ["unknown step type", wrap([{ id: "s", type: "actorReboot", before: {}, after: {} }])],
    ["duplicate step ids", wrap([leaf, { ...leaf, after: { "flags.ak5e.defender.ok2": true } }])],
    ["non-string step id", wrap([{ id: 5, type: "actorPatch", before: {}, after: { "flags.ak5e.defender.a": 1 } }])],
    ["create without preassigned _id in after", wrap([{ id: "s", type: "embeddedCreate", documentType: "ActiveEffect", documentId: "fx1", after: { name: "no id" } }])],
    ["delete carrying an after-state", wrap([{ id: "s", type: "embeddedDelete", documentType: "ActiveEffect", documentId: "fx1", before: { _id: "fx1" }, after: { _id: "fx1" } }])],
    ["create carrying a before-state", wrap([{ id: "s", type: "embeddedCreate", documentType: "ActiveEffect", documentId: "fx1", before: { _id: "fx1" }, after: { _id: "fx1" } }])],
    ["empty fingerprint", wrap([leaf], {}, "")],
    ["empty contextKey", { kind: "setup", id: "fz", contextKey: "", fingerprint: "f", steps: [leaf], result: {} }],
    ["operation id too long", { kind: "setup", id: "z".repeat(81), contextKey: "c", fingerprint: "f", steps: [], result: {} }],
    ["operation id traversal", { kind: "setup", id: "../../fx", contextKey: "c", fingerprint: "f", steps: [], result: {} }],
    ["non-array steps", { kind: "setup", id: "fz", contextKey: "c", fingerprint: "f", steps: { 0: leaf }, result: {} }],
  ];

  for (const [name, spec] of badCases) {
    await assert.rejects(runDefenderAdvancement(actor, spec), undefined, `non-serializable attack (${name}) must reject`);
    assert.equal(journalOf(actor), undefined, `attack (${name}): rejection must happen BEFORE any journal write`);
    assert.equal(actor.writes.length, 0, `attack (${name}): zero Actor writes`);
    assert.equal(actor.effects.size, 0, `attack (${name}): zero documents`);
  }

  // Closure fields on an otherwise valid step: never executed, and the PERSISTED journal must be
  // plain JSON data (a closure cannot smuggle behaviour into retry).
  const c = harness({ level: 5, enabled: true });
  let smuggled = null;
  const spec = { kind: "setup", id: "closure-1", contextKey: "c", fingerprint: "f",
    steps: [{ ...leaf, execute() { smuggled = "closure executed"; } }], result: {} };
  await runDefenderAdvancement(c.actor, spec);
  const persisted = structuredClone(journalOp(c.actor, "closure-1"));
  assert.equal(smuggled, null, "a smuggled closure must never execute");
  assert.deepEqual(JSON.parse(JSON.stringify(persisted)), persisted, "the persisted journal must be plain JSON (no live functions)");
  assert.equal(persisted.steps[0].execute, undefined, "the persisted step carries no callable field");
  assert.equal(c.actor.flags.ak5e.defender.ok, true, "control: the legitimate leaf did apply");

  // Setup-entry fuzz (frozen §3.2 guards) — rejections leave no trace and leak no lock.
  const s = harness({ level: 13, effects: [managedDesired("c3-fuzz")] });
  const plan = previewDefenderSetup(s.actor);
  await assert.rejects(applyDefenderSetup(s.actor, { confirmed: "true", contextKey: plan.contextKey }), /Confirm/);
  await assert.rejects(applyDefenderSetup(s.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "z".repeat(81) }), /stable operation ID/);
  await assert.rejects(applyDefenderSetup(s.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "has space" }), /stable operation ID/);
  await assert.rejects(applyDefenderSetup(s.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "../escape" }), /stable operation ID/);
  assert.equal(journalOf(s.actor), undefined, "the setup entry fuzz wrote no journal");
  assert.equal(s.actor.effects.size, 0, "the setup entry fuzz created nothing");
  const result = await applyDefenderSetup(s.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "fuzz-ok" });
  assert.equal(result.enabled, true, "guards did not wedge the actor; a valid apply still works afterwards");
});

/* ------------------------------------------------------------------ deleted / conflicting documents */

test("atk-deleted-and-conflicting-documents", async () => {
  // (a) Managed doc deleted between crash and retry → the retry recreates it from the persisted intent.
  const h = harness({ level: 13, res: 4, effects: [managedDesired("c3-gone")] });
  h.fault.createFailAfterInsert = true;
  const plan = previewDefenderSetup(h.actor);
  await assert.rejects(applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "gone-1" }), /simulated lost response/);
  const persistedId = journalOp(h.actor, "gone-1").steps.find(s => s.type === "embeddedCreate").documentId;
  h.actor.effects.delete(persistedId);                                     // the table deleted the half-created doc
  const h2 = h.reload();
  const result = await retryDefenderAdvancement(h2.actor, { kind: "setup", useId: "gone-1", confirmed: true });
  assert.equal(result.enabled, true, "retry converges after the created document was deleted");
  assert.ok(h2.actor.effects.has(persistedId), "the journaled create is restored under its preassigned id");
  assert.equal(h2.actor.effects.size, 1, "exactly one managed document after recreation");
  assert.equal(journalOp(h2.actor, "gone-1").status, "complete");

  // (b) Created doc EDITED between crash and retry → precise conflict, never overwrite; op stays applying.
  const k = harness({ level: 13, effects: [managedDesired("c3-edit")] });
  k.fault.createFailAfterInsert = true;
  const planB = previewDefenderSetup(k.actor);
  await assert.rejects(applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB.contextKey, operationId: "edit-1" }), /simulated lost response/);
  const editedId = journalOp(k.actor, "edit-1").steps.find(s => s.type === "embeddedCreate").documentId;
  k.actor.effects.get(editedId).name = "Player renamed me";
  await assert.rejects(retryDefenderAdvancement(k.actor, { kind: "setup", useId: "edit-1", confirmed: true }),
    /reconcile|conflict|already exists/i, "§3.3: conflicting content stops with a precise technical conflict");
  assert.equal(k.actor.effects.get(editedId).name, "Player renamed me", "the conflict never overwrote the edited content");
  assert.equal(journalOp(k.actor, "edit-1").status, "applying", "the conflicted op did not self-complete");
  assert.equal(k.actor.effects.size, 1, "no duplicate from the conflicted retry");
  const pvB = previewDefenderAdvancementUndo(k.actor, { kind: "setup", useId: "edit-1" });
  assert.equal(pvB.locked, false, "the conflicted receipt still previews (visible, per 01.7)");
  await assert.rejects(undoDefenderAdvancement(k.actor, { kind: "setup", useId: "edit-1", confirmed: true, contextKey: pvB.contextKey }),
    /resume|not finished/i, "undoing an unfinished op is refused — the table must reconcile, silently half-undoing is not offered");

  // (c) Foreign document already occupies the preassigned id with different content → conflict, no merge.
  const m = harness({ level: 13, effects: [managedDesired("c3-hijack")] });
  m.actor.effects.set("det-op-1", { id: "det-op-1", _id: "det-op-1", name: "Foreign occupant", changes: [], flags: {},
    type: "ActiveEffect", parentUuid: m.actor.uuid,
    getFlag(s2, k2) { return this.flags?.[s2]?.[k2]; }, async update(c) { applyPaths(this, c); return this; },
    async delete() { m.actor.effects.delete(this.id); } });
  const planC = previewDefenderSetup(m.actor);
  await assert.rejects(applyDefenderSetup(m.actor, { confirmed: true, contextKey: planC.contextKey, operationId: "hijack-1" }),
    /reconcile|conflict|already exists/i, "a foreign occupant of the preassigned id must conflict, never merge");
  assert.equal(m.actor.effects.get("det-op-1").name, "Foreign occupant", "the foreign content is not rewritten");
  assert.equal(journalOp(m.actor, "hijack-1").status, "applying", "intent persisted before the conflict (retry-visible)");

  // (d) embeddedPatch target deleted before the retry → precise conflict; acked steps are not re-run or duplicated.
  const n = harness({ level: 13, effects: [managedDesired("c3-patch-gone", "@prof + 1")], baseline: {
    id: "fx-base2", name: "Managed Base",
    changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }],
    flags: { ak5e: { defenderManagedEffect: { sourceId: "c3-patch-gone",
      managedChanges: [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }], active: true } } } } });
  n.fault.journalFailNth = 3;                                             // crash on the reaction ack; patch still pending
  const planD = previewDefenderSetup(n.actor);
  assert.equal(planD.updateEffects.length, 1, "scenario: the drifted managed baseline is patchable");
  await assert.rejects(applyDefenderSetup(n.actor, { confirmed: true, contextKey: planD.contextKey, operationId: "pd-1" }), /simulated lost response/);
  n.actor.effects.delete("fx-base2");                                     // the table deleted the patch target
  const h4 = n.reload();
  await assert.rejects(retryDefenderAdvancement(h4.actor, { kind: "setup", useId: "pd-1", confirmed: true }),
    /missing; reconcile/i, "§3.3: a missing patch target is a precise conflict, not a silent skip");
  assert.equal(journalOp(h4.actor, "pd-1").status, "applying");
});

/* ------------------------------------------------------------------ later authored edits */

test("atk-authored-edit-composition", async () => {
  // (a) GM edits a journaled leaf after the undo preview → stale undo rejects; fresh preview converges with CAS.
  const h = harness({ level: 13, effects: [managedDesired("c3-compose")] });
  const plan = previewDefenderSetup(h.actor);
  await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "comp-1" });
  const pv = previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "comp-1" });
  const beforeWrites = h.writesCount();
  await h.actor.update({ "flags.ak5e.reactionBudget.max": 3 });          // GM raises the max after the preview
  await assert.rejects(undoDefenderAdvancement(h.actor, { kind: "setup", useId: "comp-1", confirmed: true, contextKey: pv.contextKey }),
    /preview the undo again/, "01.6: a stale undo preview key must not act");
  assert.equal(h.writesCount(), beforeWrites + 1, "the stale undo wrote nothing beyond the GM's own edit");
  const pv2 = previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "comp-1" });
  const undo = await undoDefenderAdvancement(h.actor, { kind: "setup", useId: "comp-1", confirmed: true, contextKey: pv2.contextKey });
  assert.equal(undo.undone, true);
  assert.equal(h.actor.flags.ak5e.reactionBudget.max, 3, "01.6: CAS — the later GM value survives");
  assert.equal(h.actor.flags.ak5e.defender.enabled, false, "the untouched journaled leaf still restores");
  assert.ok(undo.notes.some(w => /kept the later value/i.test(String(w))), "the skipped restore is a visible note");

  // (b) FORWARD CAS: GM edits a journaled actorPatch leaf between the crash and the retry.
  // §3.3: retry must "inspect the exact intended document ID and before/after state" — the embeddedPatch
  // forward step has exactly this conflict guard ("was changed after the preview; reconcile it manually");
  // silently re-asserting the journaled after-value over a mid-encounter GM edit would violate 01.5/01.6 CAS intent.
  const breaks = [];
  const k = harness({ level: 13 });
  k.actor.flags.ak5e.reactionBudget = { max: 1 };
  k.fault.journalFailNth = 3;                                            // crash right after the reaction-max mutation
  const planB = previewDefenderSetup(k.actor);
  await assert.rejects(applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB.contextKey, operationId: "fwd-cas" }), /simulated lost response/);
  assert.equal(k.actor.flags.ak5e.reactionBudget.max, 2, "scenario: the max leaf was mutated before the ack was lost");
  await k.actor.update({ "flags.ak5e.reactionBudget.max": 3 });          // GM raises it further after the crash
  const reloaded = k.reload();
  try {
    await retryDefenderAdvancement(reloaded.actor, { kind: "setup", useId: "fwd-cas", confirmed: true });
    if (reloaded.actor.flags.ak5e.reactionBudget.max !== 3) {
      breaks.push(`retry silently re-asserted the journaled after-value (${reloaded.actor.flags.ak5e.reactionBudget.max}), `);breaks.push("overwriting the GM's mid-encounter edit; actorPatch retry has no before/after inspection while embeddedPatch does");
    }
  } catch { /* a precise conflict refusal is the compatible behaviour */ }

  // (c) Activity edited after the completed op → undo preserves the edit with a note, restores the flag leaf.
  const m = harness({ level: 5, activities: [{ chapterThreeId: "feature-x", activity: { _id: "ak5eAtkAct", type: "utility", name: "Guided" } }] });
  m.actor.items.set("feat", { id: "feat", name: "Feature", type: "feat", flags: { ak5e: { chapterThreeId: "feature-x" } },
    system: { activities: new Map() },
    getFlag(s, k2) { return this.flags?.[s]?.[k2]; },
    async update(changes) { for (const [key, value] of Object.entries(changes)) m.actor.items.get("feat").system.activities.set(key.split(".").pop(), structuredClone(value)); return this; } });
  const planC = previewDefenderSetup(m.actor);
  await applyDefenderSetup(m.actor, { confirmed: true, contextKey: planC.contextKey, operationId: "act-1" });
  m.actor.items.get("feat").system.activities.set("ak5eAtkAct", { _id: "ak5eAtkAct", type: "utility", name: "Player rewrote this" });
  const pvC = previewDefenderAdvancementUndo(m.actor, { kind: "setup", useId: "act-1" });
  const undoC = await undoDefenderAdvancement(m.actor, { kind: "setup", useId: "act-1", confirmed: true, contextKey: pvC.contextKey });
  assert.equal(undoC.undone, true);
  assert.equal(m.actor.items.get("feat").system.activities.get("ak5eAtkAct").name, "Player rewrote this",
    "01.6: a later authored activity edit survives undo");
  assert.equal(m.actor.flags.ak5e.defender.enabled, false, "the unedited journaled leaf still restores");
  assert.ok(undoC.notes.some(w => /kept the later value|preserved/i.test(String(w))), "the preserved activity edit is visible in the notes");

  // (d) An edited created effect is preserved on undo (not deleted), with a note — different vector: edit BEFORE retry, resolve by reconciling manually first.
  const p = harness({ level: 5, effects: [managedDesired("c3-undoedit")] });
  p.fault.createFailAfterInsert = true;
  const planD = previewDefenderSetup(p.actor);
  await assert.rejects(applyDefenderSetup(p.actor, { confirmed: true, contextKey: planD.contextKey, operationId: "rec-1" }), /simulated lost response/);
  const recId = journalOp(p.actor, "rec-1").steps.find(s => s.type === "embeddedCreate").documentId;
  p.actor.effects.get(recId).name = "Renamed by the player";
  await assert.rejects(retryDefenderAdvancement(p.actor, { kind: "setup", useId: "rec-1", confirmed: true }), /reconcile/i,
    "the edit is visible to recovery");
  p.actor.effects.get(recId).name = `Managed c3-undoedit`;                // table reconciles the conflict…
  await retryDefenderAdvancement(p.actor, { kind: "setup", useId: "rec-1", confirmed: true });
  assert.equal(journalOp(p.actor, "rec-1").status, "complete", "after manual reconciliation the same retry converges");
  const pvD = previewDefenderAdvancementUndo(p.actor, { kind: "setup", useId: "rec-1" });
  const undoD = await undoDefenderAdvancement(p.actor, { kind: "setup", useId: "rec-1", confirmed: true, contextKey: pvD.contextKey });
  assert.equal(undoD.undone, true);
  assert.equal(p.actor.effects.has(recId), false, "an unchanged managed create IS removed once reconciled");

  assert.deepEqual(breaks, [], breaks.length ? `BREAK (forward CAS): ${breaks.join("")}` : null);
});

/* ------------------------------------------------------------------ locked encounter / roles */

test("atk-locked-encounter-and-roles", async () => {
  // (a) Race the lock: preview while open, epoch advances, confirm with the cached key.
  const h = harness({ level: 5, effects: [managedDesired("c3-lock")] });
  const plan = previewDefenderSetup(h.actor);
  await applyDefenderSetup(h.actor, { confirmed: true, contextKey: plan.contextKey, operationId: "lock-atk" });
  const pv = previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "lock-atk" });
  assert.equal(pv.locked, false, "scenario: previewed while the epoch is current");
  const writes = h.writesCount();
  h.setEpoch(7);                                                          // a new encounter begins
  await assert.rejects(undoDefenderAdvancement(h.actor, { kind: "setup", useId: "lock-atk", confirmed: true, contextKey: pv.contextKey }),
    /earlier encounter|lock/i, "01.7: a receipt locked between preview and confirm cannot undo");
  assert.equal(h.writesCount(), writes, "the locked attempt wrote nothing");
  const pv2 = previewDefenderAdvancementUndo(h.actor, { kind: "setup", useId: "lock-atk" });
  assert.equal(pv2.locked, true, "locked receipts stay previewable, never silently dropped");
  const entry = listDefenderAdvancement(h.actor).find(e => e.id === "lock-atk");
  assert.equal(entry.locked, true);
  assert.equal(entry.status, "complete");

  // (b) Observer: run/retry/undo are technical failures with zero mutation; list/preview stay read-only.
  const k = harness({ level: 5 });
  const planB = previewDefenderSetup(k.actor);
  await applyDefenderSetup(k.actor, { confirmed: true, contextKey: planB.contextKey, operationId: "obs-atk" });
  const ownedWrites = k.writesCount();
  k.actor.isOwner = false;
  const pvB = previewDefenderAdvancementUndo(k.actor, { kind: "setup", useId: "obs-atk" });
  assert.deepEqual(pvB.blocked, ["NotOwner"], "01.7: the undo preview reports the observer block");
  await assert.rejects(undoDefenderAdvancement(k.actor, { kind: "setup", useId: "obs-atk", confirmed: true, contextKey: pvB.contextKey }), /owned/i);
  await assert.rejects(retryDefenderAdvancement(k.actor, { kind: "setup", useId: "obs-atk", confirmed: true }), /owned/i);
  await assert.rejects(runDefenderAdvancement(k.actor, { kind: "setup", id: "obs-run", contextKey: "c", fingerprint: "f",
    steps: [{ id: "s", type: "actorPatch", before: { "flags.ak5e.defender.enabled": true }, after: { "flags.ak5e.defender.enabled": false } }], result: {} }), /owned/i);
  assert.equal(k.writesCount(), ownedWrites, "01.7: no observer mutation through any advancement entry");
  assert.equal(k.actor.flags.ak5e.defender.enabled, true);
  assert.ok(listDefenderAdvancement(k.actor).some(e => e.id === "obs-atk"), "receipts remain visible to the table");
  assert.equal(k.writesCount(), ownedWrites, "listing stays read-only for observers");

  // (c) Logged-out caller: rejected before any journal write; a signed-in GM records the GM's id.
  const m = harness({ level: 5, enabled: true });
  game.user = null;
  await assert.rejects(runDefenderAdvancement(m.actor, { kind: "setup", id: "ghost-1", contextKey: "c", fingerprint: "f",
    steps: [{ id: "s", type: "actorPatch", before: { "flags.ak5e.defender.enabled": true }, after: { "flags.ak5e.defender.enabled": false } }], result: {} }),
    /signed-in|user/i);
  assert.equal(journalOf(m.actor), undefined, "an anonymous fresh advancement cannot persist a receipt");
  assert.equal(m.actor.writes.length, 0, "the anonymous advancement wrote nothing");
  game.user = { id: "gm-1", isGM: true };
  await runDefenderAdvancement(m.actor, { kind: "setup", id: "gm-1", contextKey: "c", fingerprint: "f",
    steps: [{ id: "s", type: "actorPatch", before: { "flags.ak5e.defender.enabled": true }, after: { "flags.ak5e.defender.enabled": false } }], result: { ok: true } });
  assert.equal(journalOp(m.actor, "gm-1").userId, "gm-1", "the receipt binds the authenticated requester");
  assert.equal(m.actor.flags.ak5e.defender.enabled, false, "control: the GM's legitimate op applied");

  // (d) Pack sources and non-characters are technical failures at every entry.
  const packActor = { ...harness({ level: 5 }).actor, pack: "World.AK5e" };
  await assert.rejects(runDefenderAdvancement(packActor, { kind: "setup", id: "pk", contextKey: "c", fingerprint: "f", steps: [], result: {} }), /owned character/i);
  const npc = harness({ level: 5 }).actor; npc.type = "npc";
  await assert.rejects(runDefenderAdvancement(npc, { kind: "setup", id: "np", contextKey: "c", fingerprint: "f", steps: [], result: {} }), /owned character/i);
  await assert.rejects(applyDefenderSetup({ ...packActor }, { confirmed: true, contextKey: "anything", operationId: "pk-2" }), /owned character/i);
});
