/**
 * Defender-local advancement journal (SPEC-defender-base-replan §3.3).
 *
 * A write-ahead, id-anchored record of the document changes a Defender setup or progression performs, so an
 * interrupted run can be resumed and a completed one can be undone with compare-and-set restore. It is *not* a
 * shared kernel: only Defender setup/progression callers use it, and the operation kernel, play-uses/play-undo,
 * resource pools and trigger events are untouched.
 *
 * Order (§3.3): pure preview → confirmation (caller) → persist the whole immutable intent and every step's
 * before-data → mutate one document → acknowledge that step → record the result. Retry reads only the persisted
 * intent, inspects the exact intended document ID, and never re-runs a random ID or a caller's live choices.
 */
import { flag, need } from "./operation-kernel.mjs";
import { serial } from "./defender-features.mjs";
import { getPool } from "./resource-pools.mjs";
import { currentEpoch } from "./play-undo.mjs";

export const ADVANCEMENT_FLAG = "defenderAdvancement";
export const ADVANCEMENT_KINDS = Object.freeze(["setup", "progression"]);

const STEP_TYPES = Object.freeze(["actorPatch", "embeddedCreate", "embeddedPatch", "embeddedDelete"]);
const STATUSES = Object.freeze(["applying", "complete", "undone"]);
const DOCUMENT_TYPES = Object.freeze(["ActiveEffect", "Item"]);
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const OPERATION_LIMIT = 40;
const STEP_MARKER = "defenderAdvancementStep";
/** Caller-supplied step data is never permission to write arbitrary Actor paths (§3.3). */
const ACTOR_PREFIXES = Object.freeze(["flags.ak5e.defender.", "flags.ak5e.reactionBudget.", "flags.ak5e.resourcePools."]);
/** §3.3: pools are touched one leaf at a time — never reset as a whole object. */
const POOL_LEAF_PATH = /^flags\.ak5e\.resourcePools\.[A-Za-z0-9_-]+\.(value|max)$/;
const POOL_VALUE_PATH = /^flags\.ak5e\.resourcePools\.([A-Za-z0-9_-]+)\.value$/;
const ITEM_ACTIVITY_PREFIX = "system.activities.";
const EFFECT_PATH = /^(changes|disabled|flags\.ak5e\.defenderManagedEffect(\.[A-Za-z0-9_.-]+)?)$/;
const PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;
const PROTOTYPE_SEGMENTS = Object.freeze(["__proto__", "constructor", "prototype"]);
const PATH_LABELS = Object.freeze({
  "flags.ak5e.defender.enabled": "Defender enabled",
  "flags.ak5e.reactionBudget.max": "Reaction maximum"
});

/* ------------------------------------------------------------------ value helpers */

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** Deterministic serialisation: object key order is immaterial, array order is not. */
function canonical(value) {
  // §3.3: an absent leaf and an explicit null are different states; a null after-value must not be
  // acknowledged as already applied on a leaf that does not exist yet.
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  return JSON.stringify(value);
}
const sameValue = (a, b) => canonical(a) === canonical(b);

function assertPlain(value, label) {
  const type = typeof value;
  if (value === null || type === "string" || type === "boolean") return;
  if (type === "number") { need(Number.isFinite(value), `${label} must be a finite number.`); return; }
  need(type === "object", `${label} must be serializable journal data.`);
  if (Array.isArray(value)) { value.forEach((entry, index) => assertPlain(entry, `${label}[${index}]`)); return; }
  const prototype = Object.getPrototypeOf(value);
  need(prototype === Object.prototype || prototype === null, `${label} must be plain journal data.`);
  for (const [key, entry] of Object.entries(value)) {
    need(!PROTOTYPE_SEGMENTS.includes(key), `${label}.${key} may not name a prototype member.`);
    need(entry !== undefined, `${label}.${key} must not be undefined.`);
    assertPlain(entry, `${label}.${key}`);
  }
}

/** Read a dotted document path. Foundry collections (`items`, `activities`) and Maps are looked up with `get`. */
function readPath(document, path) {
  let target = document;
  for (const part of String(path).split(".")) {
    if (target === null || target === undefined) return undefined;
    if (target instanceof Map) target = target.get(part);
    else if (target && typeof target === "object" && Object.hasOwn(target, part)) target = target[part];
    else if (target && typeof target.get === "function" && !Array.isArray(target)) target = target.get(part);
    else return undefined;
  }
  return target;
}

/* ------------------------------------------------------------------ validation */

const isPlainObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** §3.3: a step path is data, never permission to traverse the prototype chain or leave its namespace. */
function assertSafePath(path, label) {
  need(typeof path === "string" && path.length > 0, `${label}: "${path}" is not a document path.`);
  for (const segment of path.split(".")) {
    need(segment.length > 0, `${label}: ${path} has an empty segment.`);
    need(!PROTOTYPE_SEGMENTS.includes(segment), `${label}: ${path} may not traverse "${segment}".`);
    need(PATH_SEGMENT.test(segment), `${label}: ${path} has an unsupported segment "${segment}".`);
  }
}

function checkPatchMap(step, field, label) {
  const map = step[field];
  need(isPlainObject(map), `${label}: "${field}" must be a leaf map.`);
  for (const [path, value] of Object.entries(map)) {
    assertSafePath(path, `${label}: "${field}"`);
    need(value !== undefined, `${label}: ${path} must not be undefined.`);
    assertPlain(value, `${label}: ${path}`);
  }
  return map;
}

function checkDocumentPath(documentType, path, label) {
  if (documentType === "Item") {
    need(typeof path === "string" && path.startsWith(ITEM_ACTIVITY_PREFIX), `${label}: ${path} is not a managed Item path.`);
    need(ID.test(path.slice(ITEM_ACTIVITY_PREFIX.length)), `${label}: ${path} must address one whole Activity key.`);
    return;
  }
  need(EFFECT_PATH.test(path), `${label}: ${path} is not a managed Effect path.`);
}

function checkActorPath(path, label) {
  need(ACTOR_PREFIXES.some(prefix => path.startsWith(prefix)), `${label}: ${path} is not a Defender advancement path.`);
  // §3.3: "do not reset whole pool objects" — only a single, whole-number resource leaf is a pool step.
  if (path.startsWith("flags.ak5e.resourcePools.")) {
    need(POOL_LEAF_PATH.test(path), `${label}: ${path} is not a single resource-pool leaf.`);
  }
}

/** Every journaled create carries its receipt's ownership marker, so undo can prove what it created. */
function withStepMarker(step, operationId) {
  if (step.type !== "embeddedCreate") return step;
  const after = step.after;
  need(isPlainObject(after), `Step ${step.id}: a created document needs its fields.`);
  const flags = after.flags === undefined ? {} : after.flags;
  need(isPlainObject(flags), `Step ${step.id}: created document flags must be a plain object.`);
  const ak5e = flags.ak5e === undefined ? {} : flags.ak5e;
  need(isPlainObject(ak5e), `Step ${step.id}: created document ak5e flags must be a plain object.`);
  return { ...step, after: { ...after, flags: { ...flags, ak5e: { ...ak5e, [STEP_MARKER]: { operationId, stepId: step.id } } } } };
}

function checkStep(step, label, operationId = null) {
  need(isPlainObject(step), `${label} must be an object.`);
  need(typeof step.id === "string" && ID.test(step.id), `${label} needs a stable step id.`);
  need(STEP_TYPES.includes(step.type), `${label} has an unsupported step type.`);
  if (step.type === "actorPatch") {
    const before = checkPatchMap(step, "before", label), after = checkPatchMap(step, "after", label);
    for (const path of [...Object.keys(before), ...Object.keys(after)]) checkActorPath(path, label);
    for (const [path, value] of [...Object.entries(before), ...Object.entries(after)]) {
      if (path.startsWith("flags.ak5e.resourcePools.")) {
        need(Number.isInteger(value) && value >= 0, `${label}: ${path} must be a whole, non-negative pool number.`);
      }
    }
    for (const path of Object.keys(after)) {
      if (POOL_VALUE_PATH.test(path)) need(Object.hasOwn(before, path), `${label}: a pool change to ${path} needs its before-value.`);
    }
    return;
  }
  need(DOCUMENT_TYPES.includes(step.documentType), `${label} has an unsupported document type.`);
  need(typeof step.documentId === "string" && ID.test(step.documentId), `${label} needs a preassigned document id.`);
  if (step.type === "embeddedCreate") {
    need(step.before === null || step.before === undefined, `${label}: a create step carries no before-state but "before".`);
    const after = checkPatchMap(step, "after", label);
    need(after._id === step.documentId, `${label}: the created document must carry its preassigned _id.`);
    need(after.flags === undefined || isPlainObject(after.flags), `${label}: created document flags must be a plain object.`);
    need(after.flags?.ak5e === undefined || isPlainObject(after.flags.ak5e), `${label}: created document ak5e flags must be a plain object.`);
    if (operationId !== null) {
      const marker = after.flags?.ak5e?.[STEP_MARKER];
      need(isPlainObject(marker) && marker.operationId === operationId && marker.stepId === step.id,
        `${label}: every journaled create must carry this receipt's ownership marker.`);
    }
    return;
  }
  if (step.type === "embeddedDelete") {
    checkPatchMap(step, "before", label);
    need(step.after === null || step.after === undefined, `${label}: a delete step carries no after-state but "after".`);
    return;
  }
  const before = checkPatchMap(step, "before", label), after = checkPatchMap(step, "after", label);
  for (const path of [...Object.keys(before), ...Object.keys(after)]) checkDocumentPath(step.documentType, path, label);
}

function checkReceipt(op) {
  need(isPlainObject(op), "The advancement receipt is malformed.");
  need(typeof op.id === "string" && ID.test(op.id), "The advancement receipt has no stable id.");
  need(ADVANCEMENT_KINDS.includes(op.kind), `The advancement receipt has an unknown kind "${op.kind}".`);
  need(STATUSES.includes(op.status), `The advancement receipt has an unknown status "${op.status}".`);
  need(typeof op.contextKey === "string", "The advancement receipt has no confirmation key.");
  need(typeof op.fingerprint === "string" && op.fingerprint.length > 0, "The advancement receipt has no fingerprint.");
  need(Array.isArray(op.steps), "The advancement receipt has no steps.");
  op.steps.forEach((step, index) => checkStep(step, `Receipt ${op.id} step ${index + 1}`));
  return op;
}

function checkKind(kind) {
  need(ADVANCEMENT_KINDS.includes(kind), "Choose setup or progression advancement.");
  return kind;
}

/** Public entry options: a missing group defaults to {}, but null/arrays/primitives are caller errors. */
function checkOptions(spec, label) {
  need(spec === undefined || isPlainObject(spec), `${label} must be an object.`);
  return spec ?? {};
}

function checkUseId(useId) {
  need(typeof useId === "string" && ID.test(useId), "An advancement receipt id is required.");
  return useId;
}

function needOwner(actor) {
  need(actor?.isOwner && !actor.pack && actor.type === "character", "Choose an owned character.");
}

/* ------------------------------------------------------------------ journal storage */

function readJournal(actor) {
  const stored = flag(actor, ADVANCEMENT_FLAG);
  const operations = Array.isArray(stored?.operations) ? stored.operations : [];
  return {
    version: 1,
    operations: operations
      .filter(op => isPlainObject(op) && typeof op.id === "string")
      .map(op => ({
        id: op.id, kind: op.kind, userId: op.userId ?? null, epoch: Number.isInteger(op.epoch) ? op.epoch : 0,
        contextKey: typeof op.contextKey === "string" ? op.contextKey : "", fingerprint: typeof op.fingerprint === "string" ? op.fingerprint : "",
        status: op.status, summary: typeof op.summary === "string" ? op.summary : "",
        steps: Array.isArray(op.steps) ? clone(op.steps) : [], result: clone(op.result ?? null),
        notes: Array.isArray(op.notes) ? op.notes.filter(note => typeof note === "string") : []
      }))
  };
}

async function writeJournal(actor, journal) {
  const result = await actor.update({ [`flags.ak5e.${ADVANCEMENT_FLAG}`]: journal });
  need(result !== false, "The Defender advancement journal could not be saved.");
}

function userIdOf(requester) {
  const id = requester?.id ?? globalThis.game?.user?.id;
  need(typeof id === "string" && id.length > 0, "A signed-in user is required to record an advancement.");
  return id;
}

const summaryOf = (kind, steps) => `${kind === "setup" ? "Defender setup" : "Defender progression"}: `
  + `${steps.filter(step => step.type === "embeddedCreate").length} created, `
  + `${steps.filter(step => step.type === "embeddedPatch").length} updated, `
  + `${steps.filter(step => step.type === "actorPatch").length} Actor fields.`;

/* ------------------------------------------------------------------ document access */

function documentOf(actor, documentType, documentId) {
  const collection = documentType === "ActiveEffect" ? actor?.effects : documentType === "Item" ? actor?.items : null;
  need(collection, `${documentType} is not an embedded document type this journal can reach.`);
  return collection.get?.(documentId) ?? null;
}

/** Does this document carry this receipt's own creation marker (§3.3 ownership evidence)? */
function ownsStepDocument(document, op, step) {
  const marker = flag(document, STEP_MARKER);
  return marker?.operationId === op.id && marker?.stepId === step.id;
}

/** Does the live document still carry exactly the values this step wrote? */
function documentMatches(document, after) {
  return Object.entries(after).every(([key, value]) => sameValue(document?.[key], value));
}

/**
 * §3.3: pool restoration reverses this receipt's ACTUAL delta instead of re-asserting the recorded absolute
 * value, so a later spend stays spent. `null` means the live pool state is not a whole number and cannot be
 * adjusted safely; callers keep the current value and say so.
 */
function poolRestoreTarget(actor, path, before, after, current) {
  if (!Number.isInteger(before) || !Number.isInteger(after) || !Number.isInteger(current)) return null;
  const id = path.match(POOL_VALUE_PATH)?.[1];
  if (!id) return null;
  let max = null;
  try { max = getPool(actor, id).max; } catch { max = null; }
  if (!Number.isInteger(max)) {
    const storedMax = readPath(actor, `flags.ak5e.resourcePools.${id}.max`);
    max = Number.isInteger(storedMax) ? storedMax : null;
  }
  let target = current - (after - before);          // undo only this receipt's own change
  if (Number.isInteger(max)) target = Math.min(target, max);   // clamp to the current maximum
  return Math.max(0, target);
}

/* ------------------------------------------------------------------ step execution */

/** Documented module defaults for leaves whose absence is not a distinct value (setup reads `?? 1`, `=== false`). */
const PATH_DEFAULTS = Object.freeze({
  "flags.ak5e.defender.enabled": false,
  "flags.ak5e.reactionBudget.max": 1
});
const effectiveValue = (path, value) => (value === undefined && Object.hasOwn(PATH_DEFAULTS, path) ? PATH_DEFAULTS[path] : value);

async function runStep(actor, op, step) {
  if (step.type === "actorPatch") {
    const update = {};
    for (const [path, value] of Object.entries(step.after)) {
      const current = readPath(actor, path);
      if (sameValue(effectiveValue(path, current), value)) continue;            // applied before the ack was lost
      // §3.3: inspect before/after state on resume — never re-assert an after-value over a later table edit.
      const recorded = Object.hasOwn(step.before, path) ? step.before[path] : undefined;
      need(sameValue(effectiveValue(path, current), effectiveValue(path, recorded)),
        `Advancement ${op.id}: ${path} was changed after the preview; reconcile it manually.`);
      update[path] = clone(value);
    }
    if (Object.keys(update).length) {
      const result = await actor.update(update);
      need(result !== false, `Advancement ${op.id}: the Actor change could not be saved.`);
    }
    return;
  }
  if (step.type === "embeddedCreate") {
    const existing = documentOf(actor, step.documentType, step.documentId);
    if (existing) {
      // A create that succeeded before a lost response is recognised by its preassigned id and own marker,
      // never recreated and never mistaken for externally authored content at the same id.
      need(ownsStepDocument(existing, op, step),
        `Advancement ${op.id}: ${step.documentType} ${step.documentId} already exists without this receipt's ownership marker; reconcile it manually.`);
      need(documentMatches(existing, step.after),
        `Advancement ${op.id}: ${step.documentType} ${step.documentId} already exists with different content; reconcile it manually.`);
      return;
    }
    need(ownsStepDocument(step.after, op, step),
      `Advancement ${op.id}: step ${step.id} carries no ownership marker for its created document; reconcile it manually.`);
    const created = await actor.createEmbeddedDocuments(step.documentType, [clone(step.after)], { keepId: true });
    need(Array.isArray(created) && created.length === 1, `Advancement ${op.id}: the managed document could not be created.`);
    return;
  }
  const document = documentOf(actor, step.documentType, step.documentId);
  need(document, `Advancement ${op.id}: ${step.documentType} ${step.documentId} is missing; reconcile it manually.`);
  if (step.type === "embeddedDelete") {
    need(ownsStepDocument(document, op, step), `Advancement ${op.id}: refusing to delete content this receipt does not own.`);
    for (const [path, recorded] of Object.entries(step.before)) {
      need(sameValue(readPath(document, path), recorded),
        `Advancement ${op.id}: ${step.documentType} ${step.documentId} ${path} was changed after the preview; reconcile it manually.`);
    }
    await document.delete();
    return;
  }
  const update = {};
  for (const [path, value] of Object.entries(step.after)) {
    const current = readPath(document, path);
    if (sameValue(current, value)) continue;                                    // already applied
    const recorded = Object.hasOwn(step.before, path) ? step.before[path] : undefined;
    need(sameValue(current, recorded), `Advancement ${op.id}: ${step.documentId} ${path} was changed after the preview; reconcile it manually.`);
    update[path] = clone(value);
  }
  if (Object.keys(update).length) await document.update(update);
}

async function runSteps(actor, journal, op) {
  for (const step of op.steps) {
    if (step.status === "complete") continue;
    await runStep(actor, op, step);
    step.status = "complete";
    await writeJournal(actor, journal);
  }
}

/* ------------------------------------------------------------------ public: run / retry */

/**
 * Internal seam: perform one advancement while the caller already holds the Actor's serial queue
 * (defender-setup runs its staleness check and its steps in one section). Not part of §3.3's public contract.
 */
export async function runDefenderAdvancementLocked(actor, spec = {}, requester = globalThis.game?.user) {
  needOwner(actor);
  const { kind, id, contextKey, fingerprint, steps, result } = checkOptions(spec, "Advancement options");
  checkKind(kind);
  checkUseId(id);
  need(typeof contextKey === "string" && contextKey.length > 0, "A confirmed preview key is required.");
  need(typeof fingerprint === "string" && fingerprint.length > 0, "An immutable-input fingerprint is required.");
  need(Array.isArray(steps), "An advancement needs a serializable list of steps.");
  steps.forEach((step, index) => checkStep(step, `Step ${index + 1}`));
  need(new Set(steps.map(step => step.id)).size === steps.length, "An advancement cannot repeat a step id.");
  // §3.3: attach the receipt's ownership marker to EVERY journaled create before the intent is persisted,
  // so a create can always prove what made it and undo never has to guess.
  const journaledSteps = steps.map(step => withStepMarker(step, id));
  journaledSteps.forEach((step, index) => checkStep(step, `Step ${index + 1}`, id));
  need(isPlainObject(result), "An advancement needs a result receipt.");
  assertPlain(result, "The advancement result");

  const journal = readJournal(actor);
  let op = journal.operations.find(entry => entry.id === id);
  if (op) {
    need(op.kind === kind, `Receipt ${id} was recorded as ${op.kind}, not ${kind}.`);
    need(op.fingerprint === fingerprint, `Receipt ${id} was already used with different choices; use a new operation ID.`);
    need(op.status !== "undone", `Receipt ${id} was undone; use a new operation ID.`);
    if (op.status === "complete") return clone(op.result);
  } else {
    op = { id, kind, userId: userIdOf(requester), epoch: currentEpoch(), contextKey, fingerprint, status: "applying",
      summary: summaryOf(kind, journaledSteps), steps: journaledSteps.map(step => ({ ...clone(step), status: "pending" })),
      result: clone(result), notes: [] };
    journal.operations = [...journal.operations, op];
    if (journal.operations.length > OPERATION_LIMIT) {
      // Bounded history, but an interrupted operation is recovery state: never trim it away.
      const excess = journal.operations.length - OPERATION_LIMIT;
      const head = journal.operations.slice(0, excess).filter(entry => entry.status === "applying");
      journal.operations = [...head, ...journal.operations.slice(excess)];
    }
    await writeJournal(actor, journal);
  }
  await runSteps(actor, journal, op);
  op.status = "complete";
  op.notes = [...op.notes, `${op.summary} Applied.`];
  await writeJournal(actor, journal);
  return clone(op.result);
}

export function runDefenderAdvancement(actor, spec = {}, requester = globalThis.game?.user) {
  return serial(actor, () => runDefenderAdvancementLocked(actor, spec, requester));
}

/** Resume the persisted intent of an interrupted advancement. Accepts no new steps or choices (§3.3). */
export async function retryDefenderAdvancement(actor, spec = {}) {
  const { kind, useId, confirmed } = checkOptions(spec, "Retry options");
  needOwner(actor);
  checkKind(kind);
  checkUseId(useId);
  need(confirmed === true, "Confirm resuming the interrupted advancement first.");
  return serial(actor, async () => {
    const journal = readJournal(actor);
    const op = journal.operations.find(entry => entry.id === useId);
    need(op, `No ${kind} advancement ${useId} was recorded.`);
    checkReceipt(op);
    need(op.kind === kind, `Receipt ${useId} was recorded as ${op.kind}, not ${kind}.`);
    need(op.status !== "undone", `Receipt ${useId} was undone; it cannot be resumed.`);
    if (op.status === "complete") return clone(op.result);
    await runSteps(actor, journal, op);
    op.status = "complete";
    op.notes = [...op.notes, `${op.summary} Resumed and applied.`];
    await writeJournal(actor, journal);
    return clone(op.result);
  });
}

/* ------------------------------------------------------------------ public: history */

/** Read-only, newest-first view. Never writes or renders (§3.3). */
export function listDefenderAdvancement(actor, spec = {}) {
  const { kind } = checkOptions(spec, "History options");
  if (kind !== undefined) checkKind(kind);
  const live = currentEpoch();
  return readJournal(actor).operations
    .filter(op => kind === undefined || op.kind === kind)
    .slice().reverse()
    .map(op => ({ id: op.id, kind: op.kind, status: op.status, epoch: op.epoch, locked: op.epoch !== live, summary: op.summary }));
}

/* ------------------------------------------------------------------ public: undo */

const label = path => PATH_LABELS[path] ?? (POOL_VALUE_PATH.test(path)
  ? `${String(path.match(POOL_VALUE_PATH)[1]).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase())} pool`
  : path);
const shown = value => (value === undefined ? "absent" : JSON.stringify(value));

/** Pure undo plan: what can be restored by compare-and-set, what must be preserved, and why. */
function planUndo(actor, op) {
  const lines = [], warnings = [], safeSteps = [];
  for (const step of [...op.steps].reverse()) {
    if (step.type === "actorPatch" || step.type === "embeddedPatch") {
      const document = step.type === "actorPatch" ? actor : documentOf(actor, step.documentType, step.documentId);
      if (step.type === "embeddedPatch" && !document) continue;
      const paths = [], values = {};
      for (const [path, after] of Object.entries(step.after)) {
        const current = readPath(document, path);
        const hasBefore = Object.hasOwn(step.before, path), before = hasBefore ? step.before[path] : undefined;
        // §3.3: a pool leaf restores by reversing the receipt's own delta, preserving later spends.
        if (step.type === "actorPatch" && POOL_VALUE_PATH.test(path)) {
          const target = poolRestoreTarget(actor, path, before, after, current);
          if (target === null) {
            warnings.push(`${label(path)}: kept the current value ${shown(current)}; this receipt's pool change is not a whole number and cannot be reversed safely.`);
            continue;
          }
          paths.push(path);
          values[path] = { set: target };
          lines.push(target === current
            ? `Keep ${label(path)} at ${shown(current)} (this receipt's pool change is already reversed).`
            : `Restore ${label(path)} to ${target} by reversing this receipt's ${Math.abs(after - before)}-point ${after < before ? "spend" : "restore"}; later spends are preserved.`);
          continue;
        }
        if (sameValue(current, after)) {
          paths.push(path);
          values[path] = hasBefore ? { set: before } : { remove: true };
        } else warnings.push(`${label(path)}: kept the later value ${shown(current)} instead of the receipt's ${shown(after)}.`);
      }
      if (paths.length) {
        safeSteps.push({ stepId: step.id, type: step.type, paths, values });
        for (const path of paths) {
          if (step.type === "actorPatch" && POOL_VALUE_PATH.test(path)) continue;   // already described above
          const before = Object.hasOwn(step.before, path) ? step.before[path] : undefined;
          lines.push(step.type === "actorPatch" ? `Restore ${label(path)} to ${shown(before)}.`
            : `Restore ${path} on ${step.documentId} to ${shown(before)}.`);
        }
      }
      continue;
    }
    if (step.type === "embeddedCreate") {
      const document = documentOf(actor, step.documentType, step.documentId);
      if (!document) continue;
      // Only this receipt's own managed create may be removed: the same ownership marker the forward delete requires.
      if (!ownsStepDocument(document, op, step)) {
        warnings.push(`Kept ${step.documentType} ${step.documentId}: it carries no ownership marker from this receipt.`);
        continue;
      }
      if (documentMatches(document, step.after)) {
        safeSteps.push({ stepId: step.id, type: step.type, documentId: step.documentId });
        lines.push(`Remove the managed ${step.documentType} ${step.documentId}.`);
      } else {
        warnings.push(`Kept ${step.documentType} ${step.documentId}: it was edited after this receipt, so its content is preserved.`);
      }
      continue;
    }
    if (step.type === "embeddedDelete") {
      if (documentOf(actor, step.documentType, step.documentId)) continue;
      safeSteps.push({ stepId: step.id, type: step.type, documentId: step.documentId });
      lines.push(`Restore the deleted ${step.documentType} ${step.documentId}.`);
    }
  }
  return { lines, warnings, safeSteps };
}

const undoKey = (op, plan) => canonical({ id: op.id, status: op.status, epoch: op.epoch, live: currentEpoch(), safe: plan.safeSteps });

export function previewDefenderAdvancementUndo(actor, spec = {}) {
  const { kind, useId } = checkOptions(spec, "Undo preview options");
  checkKind(kind);
  checkUseId(useId);
  const op = readJournal(actor).operations.find(entry => entry.id === useId);
  need(op, `No ${kind} advancement ${useId} was recorded.`);
  checkReceipt(op);
  need(op.kind === kind, `Receipt ${useId} was recorded as ${op.kind}, not ${kind}.`);
  const plan = planUndo(actor, op);
  const locked = op.epoch !== currentEpoch();
  const blocked = actor?.isOwner ? [] : ["NotOwner"];
  if (locked) plan.warnings.push("This receipt belongs to an earlier encounter; it stays visible but can no longer be undone.");
  if (op.status === "undone") plan.warnings.push("This receipt was already undone.");
  return { contextKey: undoKey(op, plan), lines: plan.lines, warnings: plan.warnings, locked, blocked, safeSteps: plan.safeSteps };
}

/** Reverse this receipt's still-unchanged leaves. Later authored edits are preserved with a visible note. */
export async function undoDefenderAdvancement(actor, spec = {}) {
  const { kind, useId, confirmed, contextKey, overrides = [] } = checkOptions(spec, "Undo options");
  needOwner(actor);
  checkKind(kind);
  checkUseId(useId);
  need(confirmed === true, "Confirm the undo of this advancement first.");
  // `overrides` is part of the §3.3 signature. A warning this journal can only report (a later table edit) is
  // never overridable: undo restores by compare-and-set only, so a non-empty list is a caller error, not a bypass.
  need(Array.isArray(overrides), "Undo overrides must be a list.");
  for (const override of overrides) need(typeof override === "string" && override.length > 0, "An undo override must name a warning.");
  need(overrides.length === 0, "This advancement has no overridable undo warnings.");
  return serial(actor, async () => {
    const journal = readJournal(actor);
    const op = journal.operations.find(entry => entry.id === useId);
    need(op, `No ${kind} advancement ${useId} was recorded.`);
    checkReceipt(op);
    need(op.kind === kind, `Receipt ${useId} was recorded as ${op.kind}, not ${kind}.`);
    if (op.status === "undone") return { undone: false, useId, notes: ["This receipt was already undone; nothing changed."] };
    need(op.status === "complete", `Receipt ${useId} has not finished; resume it instead of undoing it.`);
    need(op.epoch === currentEpoch(), "This receipt belongs to an earlier encounter and can no longer be undone.");
    need(typeof contextKey === "string" && contextKey.length > 0, "Preview the undo first; its confirmation key is required.");
    need(undoKey(op, planUndo(actor, op)) === contextKey, "The Actor changed since the undo preview; preview the undo again.");

    const notes = [];
    for (const step of [...op.steps].reverse()) {
      if (step.type === "actorPatch") {
        const update = {};
        for (const [path, after] of Object.entries(step.after)) {
          const current = readPath(actor, path);
          const hasBefore = Object.hasOwn(step.before, path), before = hasBefore ? step.before[path] : undefined;
          // §3.3: reverse the receipt's actual pool delta so later spends survive; clamp to the current maximum.
          if (POOL_VALUE_PATH.test(path)) {
            const target = poolRestoreTarget(actor, path, before, after, current);
            if (target === null) {
              notes.push(`${label(path)}: kept the current value ${shown(current)}; this receipt's pool change cannot be reversed safely.`);
              continue;
            }
            if (target === current) {
              notes.push(`${label(path)}: already at ${shown(current)}; nothing to reverse.`);
              continue;
            }
            update[path] = target;
            notes.push(`Restored ${label(path)} to ${target} by reversing this receipt's pool change; later spends are preserved.`);
            continue;
          }
          if (!sameValue(current, after)) {
            notes.push(`${label(path)}: kept the later value ${shown(current)} instead of restoring ${shown(step.before?.[path])}.`);
            continue;
          }
          if (hasBefore) update[path] = clone(before);
          else update[`${path.slice(0, path.lastIndexOf("."))}.-=${path.slice(path.lastIndexOf(".") + 1)}`] = null;
        }
        if (Object.keys(update).length) {
          const result = await actor.update(update);
          need(result !== false, `Receipt ${useId}: the Actor could not be restored.`);
          notes.push(`Restored ${Object.keys(update).length} Actor field${Object.keys(update).length === 1 ? "" : "s"}.`);
        }
        continue;
      }
      if (step.type === "embeddedCreate") {
        const document = documentOf(actor, step.documentType, step.documentId);
        if (!document) continue;
        if (!ownsStepDocument(document, op, step)) {
          notes.push(`Kept ${step.documentType} ${step.documentId}: it carries no ownership marker from this receipt.`);
          continue;
        }
        if (!documentMatches(document, step.after)) {
          notes.push(`Kept ${step.documentType} ${step.documentId}: it was edited after this receipt, so its content is preserved.`);
          continue;
        }
        await document.delete();
        notes.push(`Removed the managed ${step.documentType} ${step.documentId}.`);
        continue;
      }
      if (step.type === "embeddedDelete") {
        if (documentOf(actor, step.documentType, step.documentId)) continue;
        await actor.createEmbeddedDocuments(step.documentType,
          [{ ...clone(step.before ?? {}), _id: step.documentId }], { keepId: true });
        notes.push(`Restored the deleted ${step.documentType} ${step.documentId}.`);
        continue;
      }
      const document = documentOf(actor, step.documentType, step.documentId);
      if (!document) continue;
      const update = {};
      for (const [path, after] of Object.entries(step.after)) {
        const current = readPath(document, path);
        if (!sameValue(current, after)) {
          notes.push(`${step.documentId} ${path}: kept the later value ${shown(current)} instead of restoring ${shown(step.before?.[path])}.`);
          continue;
        }
        if (Object.hasOwn(step.before, path)) update[path] = clone(step.before[path]);
        else update[`${path.slice(0, path.lastIndexOf("."))}.-=${path.slice(path.lastIndexOf(".") + 1)}`] = null;
      }
      if (Object.keys(update).length) await document.update(update);
    }
    op.status = "undone";
    op.notes = [...op.notes, ...notes, `Undone by ${userIdOf(globalThis.game?.user)}.`];
    await writeJournal(actor, journal);
    return { undone: true, useId, notes };
  });
}
