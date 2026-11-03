import { currentEpoch, isLocked } from "./play-undo.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";
import { createOperationKernel, need, flag, opaqueKey } from "./operation-kernel.mjs";

/** Durable, encounter-scoped receipts for changes made by a native AK5e Art use. */
const MISSING = Object.freeze({ missing: true });

const isObject = value => value !== null && typeof value === "object";
export function getPath(object, path) {
  let value = object;
  for (const part of String(path).split(".")) {
    if (!isObject(value) || !Object.hasOwn(value, part)) return MISSING;
    value = value[part];
  }
  return value;
}

function putPath(object, path, value) {
  const parts = String(path).split("."), last = parts.pop();
  let cursor = object;
  for (const part of parts) cursor = cursor[part] ??= {};
  if (value === MISSING) delete cursor[last];
  else cursor[last] = structuredClone(value);
}

function applyChanges(object, changes) {
  for (const [path, value] of Object.entries(changes ?? {})) {
    if (!path.includes(".")) { object[path] = structuredClone(value); continue; }
    putPath(object, path, value);
  }
  return object;
}

/** Document source data is JSON by contract, but a live client `_source` can hold a just-created embedded
 * Item record that structuredClone rejects (DataCloneError). Fall back to the JSON copy, as capture does. */
function cloneSource(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}

const equal = (a, b) => a === MISSING || b === MISSING
  ? a === b : JSON.stringify(a) === JSON.stringify(b);
const allowedPath = path => path.startsWith("flags.ak5e.") && path !== "flags.ak5e.lastArtCast"
  && path !== "flags.ak5e.artReceipts" && !path.startsWith("flags.ak5e.artReceipts.")
  && !path.split(".").some(key => ["__proto__", "prototype", "constructor"].includes(key));
const poolId = path => path.match(/^flags\.ak5e\.resourcePools\.([^.]+)\.value$/)?.[1];
const resourcePath = path => path === "flags.ak5e.artsPoints.value" || Boolean(poolId(path)) || /^flags\.ak5e\.artFreeUses\.[^.]+$/.test(path);
function implicitResource(actor, path) {
  const id = poolId(path);
  return id && getPoolDefinition(id) ? getPool(actor, id).value : 0;
}

// MISSING is a sentinel object: a path that did not exist before must be recorded as absent, never expanded as data.
const plainObject = value => value !== MISSING && value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);

/** Expand an object change to its leaves so an undo can delete keys this use added (for example the
 * casting flags' new `version`) instead of merging the old object over them. */
function pushChange(changes, actor, path, before, after, depth = 0) {
  if (equal(before, after)) return;
  if (depth < 6 && plainObject(before) && plainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      pushChange(changes, actor, `${path}.${key}`,
        Object.hasOwn(before, key) ? before[key] : MISSING,
        Object.hasOwn(after, key) ? after[key] : MISSING, depth + 1);
    }
    return;
  }
  changes.push({ path, before: before === MISSING ? null : structuredClone(before), beforeMissing: before === MISSING,
    ...(before === MISSING && resourcePath(path) ? { numericBefore: implicitResource(actor, path) } : {}),
    after: after === MISSING ? null : structuredClone(after), afterMissing: after === MISSING });
}

/** Snapshot every Actor field in the final native consumption update, excluding its own index. */
export function captureArtChanges(actor, actorUpdates) {
  const snapshot = actor?._source ?? actor?.toObject?.() ?? actor;
  let cloned;
  try { cloned = structuredClone(snapshot); }
  catch { cloned = JSON.parse(JSON.stringify(snapshot)); }
  const afterState = applyChanges(cloned, actorUpdates), changes = [];
  for (const path of Object.keys(actorUpdates ?? {})) {
    if (!allowedPath(path) || path.startsWith("-")) continue;
    // A Foundry `-=` deletion joins the committed update like any other write, so the receipt
    // must capture it: the semantic path is deleted (after is MISSING) and undo restores before.
    const deletion = path.indexOf(".-=");
    if (deletion !== -1) {
      const target = `${path.slice(0, deletion)}.${path.slice(deletion + 3)}`;
      if (!allowedPath(target)) continue;
      pushChange(changes, actor, target, getPath(snapshot, target), MISSING);
      continue;
    }
    pushChange(changes, actor, path, getPath(snapshot, path), getPath(afterState, path));
  }
  return changes;
}

export function artReceiptWindow(actor, combat = globalThis.game?.combat) {
  bridgeEpochSetting();
  return { id: combat?.started ? `combat:${combat.uuid ?? combat.id}` : `free:${currentEpoch()}`, epoch: currentEpoch() };
}

/** The live module registers `encounterEpoch` (play-undo). Older fixtures name the same window
 * `artReceiptEpoch`; bridge the read-only fallback only while the registered setting is absent, so a
 * live World always uses its own epoch. */
const bridgedSettings = new WeakSet();
function bridgeEpochSetting() {
  const settings = globalThis.game?.settings;
  if (!settings || typeof settings.get !== "function" || bridgedSettings.has(settings)) return;
  bridgedSettings.add(settings);
  const original = settings.get.bind(settings);
  settings.get = (module, key) => {
    const value = original(module, key);
    if (module === "ak5e" && key === "encounterEpoch" && (value === undefined || value === null || value === false)) {
      const legacy = original(module, "artReceiptEpoch");
      if (legacy !== undefined && legacy !== null && legacy !== false) return legacy;
    }
    return value;
  };
}

export function appendArtReceipt(actor, receipt, changes, combat) {
  const previous = actor?.getFlag?.("ak5e", "artReceipts") ?? actor?.flags?.ak5e?.artReceipts ?? [];
  const window = artReceiptWindow(actor, combat);
  const record = { ...structuredClone(receipt), actorUuid: actor.uuid, windowId: window.id, epoch: window.epoch,
    status: "available", changes: structuredClone(changes), createdAt: Date.now() };
  return [...previous.filter(entry => entry.id !== record.id), record];
}

const itemFlag = item => item?.flags?.ak5e ?? item?.getFlag?.("ak5e") ?? {};

/** Provenance signature for an Item this module created (name, type, source id). It identifies where an
 * Item came from, not that it is unedited: it never authorizes deletion on its own. */
export function itemReceiptSignature(item) {
  const flags = itemFlag(item);
  const provenance = flags.chapterThreeId ? `chapter:${flags.chapterThreeId}`
    : flags.medicProgressionGrant?.sourceId ? `progression:${flags.medicProgressionGrant.sourceId}`
    : flags.medicArtGrant ? `art:${flags.medicArtGrant.poolId ?? ""}:${flags.medicArtGrant.name ?? ""}`
    : flags.medicFeature ? "medic-feature" : "";
  return JSON.stringify([String(item?.name ?? ""), String(item?.type ?? ""), provenance]);
}

const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

/** Digest of the document source an Item had right after Foundry created it: name, type, system and
 * flags. It is taken from the created document (not the pre-creation data) so native defaults and
 * preparation are part of the baseline and cannot produce a false conflict, while a later edit to any
 * system or flag value is detected. Returns null when the document cannot report its source. */
export function itemBaselineDigest(item) {
  let source;
  try { source = typeof item?.toObject === "function" ? item.toObject() : item?._source; }
  catch { source = null; }
  if (!source || typeof source !== "object") return null;
  return opaqueKey(stable({ name: source.name ?? null, type: source.type ?? null,
    system: source.system ?? {}, flags: source.flags ?? {} }));
}

/** Receipt metadata for an Item the use will create. The id must be assigned before creation. */
export function receiptItemRecord(data) {
  const id = data?._id ?? data?.id;
  if (!id) return null;
  return { id: String(id), name: String(data?.name ?? ""), signature: itemReceiptSignature(data) };
}

const notify = (level, text) => {
  console.warn("AK5e | Arts receipt", text);
  try { globalThis.ui?.notifications?.[level]?.(text); } catch { /* Notifications are optional. */ }
};

/** Create the Items a use granted. Foundry must keep the pre-assigned IDs (`keepId`) so the receipt that
 * was persisted before creation names the real documents. The documents it returns are then sealed
 * into the receipt with their actual IDs and a baseline digest; if Foundry nevertheless assigned
 * different IDs, the receipt is corrected from the returned documents. A failure to seal is shown to the
 * user and leaves the pre-creation receipt (IDs plus provenance signature, no baseline) in place; undo
 * then treats those Items as unverified conflicts and preserves them. */
export async function createReceiptItems(actor, receiptId, creates = []) {
  if (!creates.length) return [];
  let created;
  try { created = await actor.createEmbeddedDocuments("Item", creates, { keepId: true }); }
  catch (error) {
    notify("warn", `Granting Items failed part-way: ${error?.message ?? error}. The use receipt remains; undoing it removes any Item it already created.`);
    throw error;
  }
  const documents = Array.from(created ?? []);
  if (!receiptId || !documents.length) return documents;
  try {
    const ledger = actor.getFlag?.("ak5e", "artReceipts") ?? actor.flags?.ak5e?.artReceipts ?? [];
    const entry = ledger.find(candidate => candidate.id === receiptId);
    if (!entry) return documents;
    const requested = creates.map(data => String(data?._id ?? data?.id ?? ""));
    const sealed = documents.map((doc, index) => ({ id: String(doc?.id ?? doc?._id ?? requested[index] ?? ""),
      name: String(doc?.name ?? creates[index]?.name ?? ""), signature: itemReceiptSignature(doc),
      baseline: itemBaselineDigest(doc) })).filter(record => record.id);
    const replaced = new Set([...requested, ...sealed.map(record => record.id)]);
    const items = [...(entry.items ?? []).filter(record => !replaced.has(record.id)), ...sealed];
    const next = ledger.map(candidate => candidate.id === receiptId ? { ...candidate, items } : candidate);
    await actor.update({ "flags.ak5e.artReceipts": next });
  } catch (error) {
    notify("warn", `The granted Items were created, but their receipt could not record exact edit baselines: ${error?.message ?? error}. Undo will preserve these Items as unverified and you must remove them manually if wanted.`);
  }
  return documents;
}

/** Return a conflict preview. A path changed after this use is deliberately preserved. */
export function previewArtUndo(actor, receipt) {
  const restore = [], conflicts = [];
  for (const change of receipt?.changes ?? []) {
    if (!allowedPath(change.path)) { conflicts.push({ path: change.path, invalid: true }); continue; }
    const expected = change.afterMissing ? MISSING : change.after;
    const snapshot = actor?._source ?? actor?.toObject?.() ?? actor;
    const current = getPath(snapshot, change.path);
    const beforeValue = change.beforeMissing ? change.numericBefore : change.before;
    const numericResource = resourcePath(change.path) && [beforeValue, change.after, current].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (numericResource && typeof current === "number") {
      // Refund the actual amount this use spent. Later casts/resource changes remain in place.
      let maximum = Infinity;
      if (change.path === "flags.ak5e.artsPoints.value") maximum = Number(actor.getFlag?.("ak5e", "artsPoints")?.maximum ?? Infinity);
      const id = poolId(change.path);
      if (id) {
        const definition = getPoolDefinition(id);
        if (!definition?.overMax) maximum = definition ? getPool(actor, id).max : Number(actor.flags?.ak5e?.resourcePools?.[id]?.max ?? Infinity);
      }
      const value = Math.max(0, Math.min(Math.max(maximum, beforeValue), current + beforeValue - change.after));
      restore.push({ path: change.path, value, delta: true });
      continue;
    }
    if (!equal(current, expected)) { conflicts.push({ path: change.path, current: current === MISSING ? null : current }); continue; }
    restore.push({ path: change.path, value: change.beforeMissing ? MISSING : change.before });
  }
  const itemRemovals = [], itemConflicts = [];
  for (const record of receipt?.items ?? []) {
    if (!record?.id) continue;
    const item = actor?.items?.get?.(record.id) ?? Array.from(actor?.items ?? []).find(entry => entry?.id === record.id);
    if (!item) continue;
    // Only an exact persisted source baseline may authorize deletion. A name/type/provenance match
    // (the unsealed signature) cannot show the Item is unedited, so without a baseline it is a conflict.
    const digest = record.baseline ? itemBaselineDigest(item) : null;
    if (record.baseline && digest !== null && digest === record.baseline) itemRemovals.push(record.id);
    else itemConflicts.push({ id: record.id, name: item.name ?? record.name, unverified: !record.baseline || digest === null });
  }
  return { restore, conflicts, itemRemovals, itemConflicts,
    safeCount: restore.length, conflictCount: conflicts.length,
    itemSafeCount: itemRemovals.length, itemConflictCount: itemConflicts.length };
}

export function undoArtChanges(actor, preview) {
  const update = {};
  for (const change of preview.restore) {
    if (change.value !== MISSING) { update[change.path] = structuredClone(change.value); continue; }
    const parts = change.path.split("."), field = parts.pop();
    update[`${parts.join(".")}.-=${field}`] = null;
  }
  return update;
}

/** Reverse causal order, not independent previews of the same live state. The projection is data
 * only: reviewing/cancelling never writes a document. Already restored source changes are skipped
 * while a failed target operation remains available for an ordinary undo retry. */
export function previewLinkedArtUndo(actor, entry, ledger) {
  const ordered = [], seen = new Set();
  function visit(receipt) {
    if (seen.has(receipt.id)) return;
    seen.add(receipt.id);
    for (const child of [...ledger].reverse()) {
      if (child.parentReceiptId === receipt.id && child.status === "available") visit(child);
    }
    ordered.push(receipt);
  }
  visit(entry);
  const source = cloneSource(actor?._source ?? actor?.toObject?.() ?? actor);
  const projected = { _source: source, flags: source.flags, items: actor.items,
    getFlag: (scope, key) => getPath(source, `flags.${scope}.${key}`) === MISSING ? undefined : getPath(source, `flags.${scope}.${key}`) };
  const update = {}, targets = new Map(), previews = [];
  for (const receipt of ordered) {
    const preview = previewArtUndo(projected, receipt.sourceUndone ? { ...receipt, changes: [], items: [] } : receipt);
    for (const change of preview.restore) putPath(source, change.path, change.value);
    Object.assign(update, undoArtChanges(actor, preview));
    let targetPreview = null;
    if (receipt.relay) {
      const target = relayTarget(receipt.relay.targetUuid);
      if (target && !targets.has(target.uuid)) targets.set(target.uuid, cloneSource(target._source ?? target.toObject?.() ?? target));
      targetPreview = previewLinkedRelay(actor, receipt, { snapshot: targets.get(target?.uuid), runValidator: false });
      if (!targetPreview.conflicts.length) {
        for (const change of targetPreview.restore) putPath(targets.get(target.uuid), change.path, change.missing ? MISSING : change.value);
      }
    }
    previews.push({ receipt, preview, targetPreview });
  }
  return { previews, update };
}

export function artReceiptUndoAllowed(actor, receipt, user = globalThis.game?.user) {
  bridgeEpochSetting();
  if (!receipt || receipt.actorUuid !== actor?.uuid || !["available"].includes(receipt.status)) return false;
  return Boolean((user?.isGM || actor?.isOwner) && !isLocked(receipt));
}

/* -------------------------------------------- */
/*  Linked receipts (contract item 4)           */
/* -------------------------------------------- */

const RELAY_STATE_FLAG = "medicRelay";
const RELAY_REQUEST_FLAG = "medicRelayRequest";
const RELAY_RESPONSE_FLAG = "medicRelayResponse";
const RELAY_RECEIPT_FLAG = "medicRelayReceipt";
const RELAY_BENEFIT_FLAG = "medicRelayBenefit";
const RELAY_ROLL_FLAG = "medicRelayRoll";
const RELAY_RESTORE_FLAG = "medicRelayRestore";
const DEFAULT_RELAY_VALIDATOR = "ak5e.actor-hp-flags";
const HP_VALUE = "system.attributes.hp.value";
const HP_TEMP = "system.attributes.hp.temp";
const RELAY_HP_PATHS = new Set([HP_VALUE, HP_TEMP]);

const hpOf = target => target?.system?.attributes?.hp ?? null;
const finiteAmount = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const hpCap = target => {
  const max = Number(hpOf(target)?.max);
  return Number.isFinite(max) && max > 0 ? max : null;
};

/** Structural validation for a relayed Actor update. Relay is operation-specific: only the HP value
 * or temporary-HP pool, finite non-negative numbers, HP never above the target's maximum. Arbitrary
 * AK5e flags (casting, grants, riders, receipts) are refused here; branch provenance travels through a
 * named `registerRelayOperation` handler instead. Pure data, so it still applies after a reload. */
export function validateRelayPayload(target, changes) {
  if (target?.documentName !== "Actor") return false;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return false;
  const paths = Object.keys(changes);
  if (!paths.length) return false;
  for (const path of paths) {
    if (!RELAY_HP_PATHS.has(path)) return false;
    const value = changes[path];
    if (!finiteAmount(value)) return false;
    if (path === HP_VALUE) {
      const max = hpCap(target);
      if (max !== null && value > max) return false;
    }
  }
  return true;
}

/* -------------------------------------------- */
/*  Operation-specific update validation        */
/* -------------------------------------------- */

const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
// Keys the ledger and operation kernel own. No registered operation may write them.
const RESERVED_FLAG_ROOTS = new Set(["artReceipts", "lastArtCast", RELAY_STATE_FLAG, RELAY_REQUEST_FLAG,
  RELAY_RESPONSE_FLAG, RELAY_RECEIPT_FLAG, RELAY_BENEFIT_FLAG, RELAY_ROLL_FLAG, RELAY_RESTORE_FLAG,
  "medicReactionRecovery"]);

/** Paths a registered operation with its own `validateUpdate` may even ask to write: the HP pair, or a
 * plain `flags.ak5e.*` path outside the ledger/kernel internals. The operation's validator then has to
 * approve the exact set of paths and values; this is a floor under it, never a replacement for it. */
function operationPathAllowed(path) {
  if (typeof path !== "string" || !path) return false;
  if (RELAY_HP_PATHS.has(path)) return true;
  if (!path.startsWith("flags.ak5e.")) return false;
  const parts = path.split(".");
  if (parts.length < 4) return false;
  if (parts.some(part => !part || part.startsWith("-=") || part.startsWith("==") || UNSAFE_SEGMENTS.has(part))) return false;
  return !RESERVED_FLAG_ROOTS.has(parts[2]);
}

/** Validate a forward (`apply`) or inverse (`restore`) update map for a relayed operation. Without a
 * registered `validateUpdate` only the HP value/temporary-HP structural check applies. With one, the
 * operation's trusted module code must approve exactly this map for exactly this phase; anything else,
 * including a throwing or asynchronous validator, is refused. Restore maps mark paths that did not
 * exist before the operation with `null` and list them in `context.absent`. */
function validateOperationUpdate(handler, target, updates, context) {
  if (target?.documentName !== "Actor") return false;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) return false;
  const paths = Object.keys(updates);
  if (!paths.length) return false;
  if (typeof handler?.validateUpdate !== "function") return validateRelayPayload(target, updates);
  if (!paths.every(operationPathAllowed)) return false;
  try { return handler.validateUpdate(target, structuredClone(updates), Object.freeze(context)) === true; }
  catch (error) { console.warn("AK5e | Medic relay: operation validateUpdate failed", error); return false; }
}

function operationContext(phase, sourceActor, descriptor, extra = {}) {
  const data = structuredClone(descriptor?.data ?? {});
  return { phase, sourceActor, id: descriptor?.id, operationId: descriptor?.id,
    operation: Object.freeze({ id: descriptor?.id, data }), data, ...extra };
}

/** HP restore values never exceed the target's current maximum (it may have changed since). */
function capHpValues(target, values) {
  const max = hpCap(target), out = { ...values };
  if (max !== null && typeof out[HP_VALUE] === "number" && out[HP_VALUE] > max) out[HP_VALUE] = max;
  return out;
}

/* Before-state records: a list of `{ path, value }` / `{ path, missing }` entries. The GM stores one on the
 * target (which the requesting player cannot write) in the same update as the forward change. */
function encodeRestore(target, paths) {
  const source = target?._source ?? target, entries = [];
  for (const path of paths) {
    const value = getPath(source, path);
    if (value === MISSING) entries.push(RELAY_HP_PATHS.has(path) ? { path, value: 0 } : { path, missing: true });
    else entries.push({ path, value: structuredClone(value) });
  }
  return entries;
}

function restoreMaps(entries) {
  const values = {}, absent = [];
  for (const entry of entries ?? []) {
    if (typeof entry?.path !== "string") continue;
    if (entry.missing === true) { absent.push(entry.path); values[entry.path] = null; }
    else values[entry.path] = structuredClone(entry.value);
  }
  return { values, absent };
}

/** Foundry expands dotted keys inside stored flag data, so a persisted `{ "system.attributes.hp.value": 10 }`
 * map comes back nested. Receipts therefore also persist the same maps as `{ path, value }` entry lists,
 * whose paths are values, and readers prefer those. A map handed in by a caller is still read as given. */
const mapEntries = (map, absent = []) => Object.entries(map ?? {}).map(([path, value]) => absent.includes(path) ? { path, missing: true } : { path, value: structuredClone(value) });
const entriesToMap = entries => Object.fromEntries((entries ?? []).filter(entry => typeof entry?.path === "string")
  .map(entry => [entry.path, entry.missing === true ? null : structuredClone(entry.value)]));
const changesFromRelay = relay => Array.isArray(relay?.changesEntries) ? entriesToMap(relay.changesEntries) : relay?.changes;

function restoreMapsFromRelay(relay) {
  if (Array.isArray(relay?.restoreEntries)) return restoreMaps(relay.restoreEntries);
  const absent = Array.isArray(relay?.restoreAbsent) ? relay.restoreAbsent.filter(path => typeof path === "string") : [];
  const values = structuredClone(relay?.restore ?? {});
  for (const path of absent) values[path] = null;
  return { values, absent };
}

/** The actual Actor update that restores a before-state: values, and Foundry `-=` deletion for paths
 * that did not exist. */
function restoreUpdate(maps) {
  const update = {};
  for (const [path, value] of Object.entries(maps.values)) {
    if (maps.absent.includes(path)) {
      const parts = path.split("."), last = parts.pop();
      update[`${parts.join(".")}.-=${last}`] = null;
    } else update[path] = structuredClone(value);
  }
  return update;
}

const validRecordEntries = entries => Array.isArray(entries) && entries.length > 0 &&
  entries.every(entry => typeof entry?.path === "string" && (entry.missing === true || "value" in entry));

/* -------------------------------------------- */
/*  Relay operations (specific, recomputed)     */
/* -------------------------------------------- */

const relayOperations = new Map();

/** Register a named relay operation (trusted module code; never a serialised function). A handler is
 * `{ validate(target, data) => boolean, apply(target, data) => updateMap, validateUpdate?(target, updates,
 * context) => boolean }`. The GM recomputes `apply` from the descriptor on the target, captures the true
 * before-state, and validates both the forward map (`context.phase === "apply"`) and, on undo, the stored
 * inverse (`"restore"`). `context` carries `sourceActor`, `id`/`operationId`, `operation` and `data`
 * (and `absent` for restore). Without `validateUpdate` only HP value/temporary-HP updates are allowed. */
export function registerRelayOperation(id, handler) {
  need(typeof id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(id), "A relay operation needs a stable id.");
  need(handler && typeof handler.apply === "function" && typeof handler.validate === "function",
    "A relay operation needs validate() and apply() functions.");
  need(handler.validateUpdate === undefined || typeof handler.validateUpdate === "function",
    "A relay operation's validateUpdate must be a function.");
  if (relayOperations.has(id)) return false;
  relayOperations.set(id, Object.freeze({ id, label: String(handler.label ?? id),
    validate: handler.validate, apply: handler.apply, validateUpdate: handler.validateUpdate }));
  return true;
}

export function relayOperationFor(id) { return relayOperations.get(id) ?? null; }

registerRelayOperation("hp-heal", {
  label: "Healing",
  validate: (target, data) => Boolean(hpOf(target)) && finiteAmount(data?.amount) && Number(data.amount) > 0,
  apply: (target, data) => {
    const current = Number(hpOf(target)?.value) || 0, max = hpCap(target);
    const healed = current + Number(data.amount);
    return { [HP_VALUE]: max === null ? healed : Math.min(max, healed) };
  }
});
registerRelayOperation("hp-damage", {
  label: "Damage",
  validate: (target, data) => Boolean(hpOf(target)) && finiteAmount(data?.amount) && Number(data.amount) > 0,
  apply: (target, data) => ({ [HP_VALUE]: Math.max(0, (Number(hpOf(target)?.value) || 0) - Number(data.amount)) })
});
registerRelayOperation("temp-hp-grant", {
  label: "Temporary HP grant",
  validate: (target, data) => Boolean(hpOf(target)) && finiteAmount(data?.amount) && Number(data.amount) > 0,
  apply: (target, data) => ({ [HP_TEMP]: Math.max(Number(hpOf(target)?.temp) || 0, Number(data.amount)) })
});
registerRelayOperation("temp-hp-spend", {
  label: "Temporary HP spend",
  validate: (target, data) => Boolean(hpOf(target)) && finiteAmount(data?.amount) && Number(data.amount) > 0,
  apply: (target, data) => ({ [HP_TEMP]: Math.max(0, (Number(hpOf(target)?.temp) || 0) - Number(data.amount)) })
});

/* -------------------------------------------- */
/*  Reload-safe revert validators               */
/* -------------------------------------------- */

const relayValidators = new Map();
const sessionValidators = new Map();
const relayKey = (actor, id) => `${actor?.uuid ?? ""}:${id}`;
const ownedUndoKey = (source, child) => opaqueKey(`owned-undo:${source.uuid}:${child.id}`);

export function registerRelayRevertValidator(id, fn) {
  need(typeof id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(id), "A relay validator needs a stable id.");
  need(typeof fn === "function", "A relay validator must be a function.");
  if (relayValidators.has(id)) return false;
  relayValidators.set(id, fn);
  return true;
}

/** Default revert gate: the stored before-state (and applied change, when recorded) must satisfy the same
 * validation the operation had when it was applied. An unknown operation fails closed. */
relayValidators.set(DEFAULT_RELAY_VALIDATOR, (source, child, relay) => {
  const target = relayTarget(relay.targetUuid);
  const descriptor = relay.operation ?? null;
  const handler = descriptor ? relayOperationFor(descriptor.id) : null;
  if (descriptor && !handler) return false;
  const maps = restoreMapsFromRelay(relay);
  if (!validateOperationUpdate(handler, target, maps.values, operationContext("restore", source, descriptor,
    { target, absent: maps.absent, receiptId: child?.id }))) return false;
  const changes = changesFromRelay(relay);
  return changes === undefined || changes === null ||
    validateOperationUpdate(handler, target, changes, operationContext("apply", source, descriptor,
      { target, receiptId: child?.id }));
});

/** Resolve a revert validator. An unknown persisted id fails closed: the revert refuses rather than
 * falling back to a broader default (including after a reload). */
function relayValidatorFor(child) {
  const relay = child?.relay ?? {};
  const session = sessionValidators.get(relayKey({ uuid: child?.actorUuid }, child?.id));
  if (session) return session;
  if (typeof relay.validateRevertId === "string") return relayValidators.get(relay.validateRevertId) ?? null;
  return relayValidators.get(DEFAULT_RELAY_VALIDATOR);
}

function relayTarget(uuid) {
  const doc = globalThis.fromUuidSync?.(uuid);
  return doc?.documentName === "Token" ? doc.actor : doc;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const recordKey = applyId => opaqueKey(applyId);

/** The GM-written before-state for a relayed apply. For an unowned target only the record on the target
 * itself is authoritative: the GM writes it atomically with the forward change. The mirror kept on the
 * source Actor is owner-editable and is never a substitute. Waits briefly for the GM's write to arrive. */
async function relayRecordFor(sourceActor, target, applyId, { wait = true } = {}) {
  const key = recordKey(applyId), attempts = wait ? 50 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const record = flag(target, RELAY_RESTORE_FLAG)?.[key];
    if (record && record.sourceUuid === sourceActor.uuid && record.targetUuid === target.uuid && validRecordEntries(record.entries)) return record;
    if (attempt + 1 < attempts) await sleep(100);
  }
  return null;
}

/** A relay operation goes through the shared operation kernel: only registered operations, recomputed
 * on the elected GM, replayed by stable operation id, and never written to an unowned target from the
 * requesting client. */
let relayKernel = null;
function relayOperationKernel() {
  if (relayKernel) return relayKernel;
  relayKernel = createOperationKernel({
    label: "Medic relay", stateFlag: RELAY_STATE_FLAG, requestFlag: RELAY_REQUEST_FLAG,
    responseFlag: RELAY_RESPONSE_FLAG, receiptFlag: RELAY_RECEIPT_FLAG, benefitFlag: RELAY_BENEFIT_FLAG,
    rollFlag: RELAY_ROLL_FLAG, tagPreset: "custom",
    getState: actor => {
      const stored = flag(actor, RELAY_STATE_FLAG) ?? {};
      return { version: 1, ...structuredClone(stored), operations: [...(stored.operations ?? [])] };
    },
    isMember: actor => actor?.documentName === "Actor" && !actor.pack,
    perform: async (sourceActor, command, data, op, state) => {
      const target = relayTarget(data.targetUuid);
      need(target?.documentName === "Actor", "The relayed target was not found.");
      need(command === "apply" || command === "revert", `Unsupported relay command ${command}.`);
      const descriptor = { id: String(data.operation?.id ?? ""), data: structuredClone(data.operation?.data ?? {}) };
      const handler = relayOperationFor(descriptor.id);
      need(handler, `The relayed operation ${descriptor.id || "(missing)"} is not registered.`);
      const key = recordKey(op.id), marker = `flags.ak5e.${RELAY_RECEIPT_FLAG}.${key}`;
      if (command === "apply") {
        let record = flag(target, RELAY_RESTORE_FLAG)?.[key];
        if (flag(target, RELAY_RECEIPT_FLAG)?.[key]) {
          // Replay of an interrupted request whose target write already happened: never apply twice.
          need(record && validRecordEntries(record.entries), "This relayed change was applied but its before-state is missing; reconcile it manually.");
        } else {
          need(handler.validate(target, descriptor.data), "The relayed operation data is invalid.");
          const update = handler.apply(target, descriptor.data);
          need(validateOperationUpdate(handler, target, update, operationContext("apply", sourceActor, descriptor, { target })),
            "The relayed operation produced an invalid update.");
          record = { sourceUuid: sourceActor.uuid, targetUuid: target.uuid, operationId: descriptor.id,
            operation: descriptor, entries: encodeRestore(target, Object.keys(update)),
            afterEntries: mapEntries(update), at: Date.now() };
          relayKernel.noteMutation(sourceActor);
          // Forward change, replay marker and the true before-state land in one write.
          await target.update({ ...update, [marker]: true, [`flags.ak5e.${RELAY_RESTORE_FLAG}.${key}`]: record });
        }
        return state;
      }
      // Revert: the inverse comes only from the GM-stored before-state of the matching apply.
      const applyId = String(data.applyOperationId ?? "");
      need(/^relay-apply-[A-Za-z0-9_-]{1,80}$/.test(applyId), "The relayed revert must name the apply it reverses.");
      const record = flag(target, RELAY_RESTORE_FLAG)?.[recordKey(applyId)];
      need(record && record.sourceUuid === sourceActor.uuid && record.targetUuid === target.uuid &&
        record.operationId === descriptor.id && validRecordEntries(record.entries),
      "No GM-recorded before-state matches this relayed revert.");
      if (flag(target, RELAY_RECEIPT_FLAG)?.[key]) return state;
      need(stable(record.operation) === stable(descriptor), "The relayed operation choices do not match the GM record.");
      // Recheck against the authoritative post-state here, not merely on the requesting client's preview.
      const preview = targetUndoPreview(target, record.entries, record.afterEntries);
      need(!preview.conflicts.length, `Target changed; preserved ${preview.conflicts.map(c => c.path).join(", ")}. Review undo again.`);
      const maps = { values: Object.fromEntries(preview.restore.map(c => [c.path, c.value])),
        absent: preview.restore.filter(c => c.missing).map(c => c.path) };
      maps.values = capHpValues(target, maps.values);
      need(validateOperationUpdate(handler, target, maps.values, operationContext("restore", sourceActor, record.operation,
        { target, absent: maps.absent })), "The relayed revert is not a permitted Actor update.");
      relayKernel.noteMutation(sourceActor);
      await target.update({ ...restoreUpdate(maps), [marker]: true,
        [`flags.ak5e.${RELAY_RESTORE_FLAG}.${recordKey(applyId)}.undone`]: true });
      return state;
    }
  });
  return relayKernel;
}

/** Submit one validated relay command; resolves after the elected GM applied it (or throws). */
async function runRelay(sourceActor, command, payload, receiptId) {
  need(globalThis.game?.users?.activeGM, "An active GM is required to relay changes to an unowned target.");
  const kernel = relayOperationKernel();
  const result = await kernel.submit(sourceActor, command, { ...payload, confirmation: true }, `relay-${command}-${receiptId}`);
  // Let the incoming response handler finish before a dependent operation starts.
  await sleep(0);
  return result;
}

const relayHooksOn = new WeakSet();
/** Attach the elected GM's incoming-request handler to Foundry's chat-message creation boundary.
 * Idempotent per Hooks registry; nothing registers at import time. The parent calls this once after
 * `ready`. Only the active GM client acts on a request; every request is revalidated there. */
export function registerArtRelayHooks() {
  const registry = globalThis.Hooks;
  if (!registry || relayHooksOn.has(registry)) return false;
  relayHooksOn.add(registry);
  const kernel = relayOperationKernel();
  registry.on("createChatMessage", (message, options, userId) =>
    Promise.resolve(kernel.handle(message, options, userId)).catch(error =>
      console.warn("AK5e | Medic relay: GM request handling failed", error)));
  return true;
}

/** Record a child receipt that points to its cast. An already-applied owned-target change must supply
 * its captured `relay.restore` (and `restoreAbsent` for paths that did not exist); an unowned target must
 * name a registered relay operation, which the elected GM recomputes, applies and records. */
export async function appendLinkedReceipt(actor, parentReceiptId, receipt = {}, changes = []) {
  need(actor?.documentName === "Actor" && !actor.pack, "A live Actor is required.");
  need(globalThis.game?.user?.isGM || actor.isOwner, "You must own this Actor (or be the GM) to record a linked cast receipt.");
  need(typeof parentReceiptId === "string" && parentReceiptId, "A parent cast receipt is required.");
  need(typeof receipt?.id === "string" && receipt.id, "A linked receipt needs a stable id.");
  const ledger = actor.getFlag("ak5e", "artReceipts") ?? actor.flags?.ak5e?.artReceipts ?? [];
  need(ledger.some(entry => entry.id === parentReceiptId), "The parent cast receipt was not found.");
  const existing = ledger.find(entry => entry.id === receipt.id);
  // A stable child identity is an action identity, never permission to apply a new action.
  if (existing) {
    need(existing.parentReceiptId === parentReceiptId, "A linked receipt ID cannot change parent.");
    // A NEW action reusing an already-undone id is a different action, never a replay: refuse loudly
    // so the caller's already-applied change cannot end up untracked and un-undoable. A new action
    // needs a fresh receipt id; an interrupted relay retries while still available (below).
    need(existing.status !== "undone", "A linked receipt ID cannot be reused after undo; record the new action under a fresh id.");
    if (!existing.relay?.recoveryPending || existing.status !== "available") return existing;
    need(existing.relay.targetUuid === receipt.relay?.targetUuid &&
      stable(existing.relay.operation) === stable(receipt.relay?.operation), "A recovery retry cannot change operation choices.");
    // The recorded source spend is part of the action identity: a retry finishes it, never replaces it.
    need(stable(existing.changes ?? []) === stable(changes ?? []), "A recovery retry cannot change the recorded source changes.");
    // The revert gate chosen with the action is part of it too: a retry cannot swap in another validator.
    const retryValidatorId = typeof receipt.relay?.validateRevertId === "string" ? receipt.relay.validateRevertId : DEFAULT_RELAY_VALIDATOR;
    need(retryValidatorId === (existing.relay.validateRevertId ?? DEFAULT_RELAY_VALIDATOR), "A recovery retry cannot change the revert validator.");
    const sessionKey = relayKey(actor, receipt.id), retrySession = receipt.relay?.validateRevert;
    need(typeof retrySession === "function" ? sessionValidators.get(sessionKey) === retrySession : !sessionValidators.has(sessionKey),
      "A recovery retry cannot change the revert validator.");
  }
  // An undo that already restored the source (target restore still pending) owns the receipt's lifecycle:
  // a retry only completes the relay record and must keep that undo state, so the source is never refunded twice.
  const undoState = existing && (existing.sourceUndone || existing.targetUndoPending)
    ? Object.fromEntries(["status", "sourceUndone", "undoneBy", "undoneAt", "targetUndoPending", "targetUndoOutcome"]
      .filter(key => Object.hasOwn(existing, key)).map(key => [key, structuredClone(existing[key])]))
    : null;
  const record = { ...receipt, parentReceiptId };
  if (receipt.relay) {
    const relay = receipt.relay;
    const target = relayTarget(relay.targetUuid);
    need(target?.documentName === "Actor", `The relayed target ${relay.targetUuid} was not found.`);
    const owned = existing?.relay?.status !== "relayed" && Boolean(globalThis.game?.user?.isGM || target.isOwner);
    const validatorId = typeof relay.validateRevertId === "string" ? relay.validateRevertId : null;
    need(!validatorId || relayValidators.has(validatorId), `Unknown relay validator ${validatorId}.`);
    let operation = null, handler = null;
    if (relay.operation) {
      operation = { id: String(relay.operation.id ?? ""), data: structuredClone(relay.operation.data ?? {}) };
      handler = relayOperationFor(operation.id);
      need(handler, `Unknown relay operation ${operation.id || "(missing)"}.`);
    }
    let changesMap = null, restore = null, absent = [], applyOperationId = null;
    if (owned) {
      // The change was already made by an owner: record it and its captured before-state, never recapture.
      if (relay.changes !== undefined) {
        need(validateOperationUpdate(handler, target, relay.changes, operationContext("apply", actor, operation,
          { target, receiptId: receipt.id })), "The relayed change is not a permitted Actor update.");
        changesMap = structuredClone(relay.changes);
      }
      need(relay.restore !== undefined, "An already-applied relayed change must supply its captured before-state (relay.restore).");
      const maps = restoreMapsFromRelay(relay);
      need(validateOperationUpdate(handler, target, maps.values, operationContext("restore", actor, operation,
        { target, absent: maps.absent, receiptId: receipt.id })), "The relayed before-state is not a permitted Actor update.");
      restore = structuredClone(relay.restore); absent = maps.absent;
    } else {
      need(operation, "An unowned target change must describe a specific relay operation.");
      need(globalThis.game?.users?.activeGM, "An active GM is required to relay changes to an unowned target.");
      need(handler.validate(target, operation.data), "The relayed operation data is invalid.");
      need(validateOperationUpdate(handler, target, handler.apply(target, operation.data),
        operationContext("apply", actor, operation, { target, receiptId: receipt.id })),
      "The relayed operation produced an invalid update.");
      applyOperationId = `relay-apply-${receipt.id}`;
      // Persist the ordinary, undo-visible child BEFORE crossing the document/client boundary.
      // Its undo resolves the target's authoritative record even if finalisation never happens.
      if (!existing) {
        const window = artReceiptWindow(actor);
        const intent = { ...record, actorUuid: actor.uuid, windowId: window.id, epoch: window.epoch,
          status: "available", changes: structuredClone(changes), createdAt: Date.now(),
          relay: { targetUuid: relay.targetUuid, operation, applyOperationId, status: "relayed",
            recoveryPending: true, validateRevertId: validatorId ?? DEFAULT_RELAY_VALIDATOR } };
        await actor.update({ "flags.ak5e.artReceipts": [...ledger, intent] });
        // Bind the caller's session validator to the intent now, so its recovery undo and a stable-ID retry use it.
        if (typeof relay.validateRevert === "function") sessionValidators.set(relayKey(actor, receipt.id), relay.validateRevert);
      }
      try { await runRelay(actor, "apply", { targetUuid: relay.targetUuid, operation }, receipt.id); }
      catch (error) {
        await reportRelayRecovery(actor, receipt.id, error);
        throw error;
      }
      // The caller's own restore map, if any, is ignored: the GM-captured before-state is authoritative.
      const stored = await relayRecordFor(actor, target, applyOperationId);
      need(stored, "The GM did not report a valid before-state for the relayed operation.");
      const maps = restoreMaps(stored.entries);
      need(validateOperationUpdate(handler, target, maps.values, operationContext("restore", actor, operation,
        { target, absent: maps.absent, receiptId: receipt.id })), "The GM-recorded before-state is not a permitted Actor update.");
      restore = maps.values; absent = maps.absent;
      changesMap = validRecordEntries(stored.afterEntries) ? entriesToMap(stored.afterEntries) : null;
    }
    record.relay = { targetUuid: relay.targetUuid, operation, changes: changesMap, restore,
      ...(absent.length ? { restoreAbsent: absent } : {}), ...(applyOperationId ? { applyOperationId } : {}),
      validateRevertId: validatorId ?? DEFAULT_RELAY_VALIDATOR, status: owned ? "applied" : "relayed",
      restoreEntries: mapEntries(restore, absent), ...(changesMap ? { changesEntries: mapEntries(changesMap) } : {}) };
    if (typeof relay.validateRevert === "function") sessionValidators.set(relayKey(actor, receipt.id), relay.validateRevert);
  }
  const window = artReceiptWindow(actor);
  const full = { ...record, actorUuid: actor.uuid, windowId: window.id, epoch: window.epoch, status: "available",
    changes: structuredClone(existing ? existing.changes ?? [] : changes), createdAt: Date.now(), ...(undoState ?? {}) };
  try {
    const current = actor.getFlag("ak5e", "artReceipts") ?? [];
    // Replace a retried receipt in place: ledger order is use order, which linked undo composes in reverse.
    const next = current.some(entry => entry.id === receipt.id)
      ? current.map(entry => entry.id === receipt.id ? full : entry) : [...current, full];
    await actor.update({ "flags.ak5e.artReceipts": next });
  } catch (error) {
    if (record.relay?.status === "relayed") await reportRelayRecovery(actor, receipt.id, error);
    throw error;
  }
  return full;
}

async function reportRelayRecovery(actor, id, error) {
  const text = `Linked use ${id} could not finish saving: ${error?.message ?? error}. ` +
    "A durable recovery receipt remains in Arts cast receipts; review/undo it (or its parent) to recover any target change. Retry only with the same ID.";
  notify("warn", text);
  try { await globalThis.ChatMessage?.implementation?.create({
    speaker: globalThis.ChatMessage.implementation.getSpeaker({ actor }), content: `<p>${text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</p>` }); }
  catch (displayError) { console.warn("AK5e | Relay recovery public notice failed", displayError); }
}

/** Compare exact recorded post-state, never infer it from a restore map or current values. */
function targetUndoPreview(target, entries, afterEntries, snapshot = target?._source ?? target) {
  const restore = [], conflicts = [];
  const before = validRecordEntries(entries) ? entries : [];
  const after = validRecordEntries(afterEntries) ? afterEntries : [];
  const paths = before.length ? before.map(c => c.path) : ["target-state"];
  for (const path of paths) {
    const prior = before.find(c => c.path === path), post = after.find(c => c.path === path);
    const current = getPath(snapshot, path);
    if (!prior || !post || !equal(current, post.missing ? MISSING : post.value)) {
      conflicts.push({ path, targetUuid: target?.uuid, current: current === MISSING ? null : current,
        reason: !post ? "missing-post-state" : "target-changed" });
    } else restore.push({ path, value: prior.missing ? null : structuredClone(prior.value), missing: prior.missing === true });
  }
  return { restore, conflicts };
}

/** Pure preview shared by sheet/card reviews and commit. Unowned post-state comes ONLY from the
 * GM's target record. A persisted recovery intent does not need a finalised source mirror. */
export function previewLinkedRelay(sourceActor, child, { snapshot, runValidator = true } = {}) {
  const relay = child?.relay, target = relayTarget(relay?.targetUuid);
  const fail = reason => ({ restore: [], conflicts: [{ path: relay?.targetUuid ?? "target", targetUuid: relay?.targetUuid, reason }], reason });
  if (!target) return fail("missing-target");
  let resolved = relay, stored;
  if (relay.status === "relayed") {
    stored = flag(target, RELAY_RESTORE_FLAG)?.[recordKey(relay.applyOperationId ?? `relay-apply-${child.id}`)];
    if (!stored || stored.sourceUuid !== sourceActor.uuid || stored.targetUuid !== target.uuid ||
      stored.operationId !== relay.operation?.id || stable(stored.operation) !== stable(relay.operation)) return fail("no-gm-record");
    if (stored.undone) return { restore: [], conflicts: [], alreadyUndone: true, target, resolved: relay };
    resolved = { ...relay, restoreEntries: stored.entries, changesEntries: stored.afterEntries,
      restore: entriesToMap(stored.entries), changes: entriesToMap(stored.afterEntries) };
  }
  const validator = relayValidatorFor({ ...child, actorUuid: child.actorUuid ?? sourceActor.uuid });
  const descriptor = resolved.operation, handler = descriptor ? relayOperationFor(descriptor.id) : null;
  if (!validator || (descriptor && !handler)) return fail("no-validator-or-operation");
  try { if (runValidator && validator(sourceActor, child, resolved) !== true) return fail("refused"); }
  catch { return fail("validator-failed"); }
  const maps = restoreMapsFromRelay(resolved);
  const afterMap = changesFromRelay(resolved);
  const entries = mapEntries(maps.values, maps.absent);
  const after = Array.isArray(resolved.changesEntries) ? resolved.changesEntries : afterMap ? mapEntries(afterMap) : [];
  const seal = opaqueKey(stable([sourceActor.uuid, child.id, entries, after]));
  if (relay.status !== "relayed" && flag(target, RELAY_RECEIPT_FLAG)?.[ownedUndoKey(sourceActor, child)] === seal) {
    return { restore: [], conflicts: [], alreadyUndone: true, target, resolved };
  }
  const result = targetUndoPreview(target, entries, after, snapshot ?? target._source ?? target);
  return { ...result, target, resolved, handler, descriptor, seal };
}

/** Recheck at commit. Technical failures/conflicts remain undo-visible instead of falsely marking the
 * child/parent complete. The GM independently repeats validation at the remote mutation boundary. */
export async function revertLinkedRelay(sourceActor, child) {
  const preview = previewLinkedRelay(sourceActor, child);
  if (preview.alreadyUndone) return { ok: true, changed: 0, conflicts: [] };
  if (preview.conflicts.length) return { ok: false, reason: preview.reason ?? "target-conflict", changed: 0, conflicts: preview.conflicts };
  const { target, resolved, handler, descriptor } = preview;
  const maps = { values: Object.fromEntries(preview.restore.map(c => [c.path, c.value])),
    absent: preview.restore.filter(c => c.missing).map(c => c.path) };
  maps.values = capHpValues(target, maps.values);
  if (!Object.keys(maps.values).length) return { ok: true, changed: 0, conflicts: [] };
  need(validateOperationUpdate(handler, target, maps.values, operationContext("restore", sourceActor, descriptor,
    { target, absent: maps.absent, receiptId: child.id })), "The relayed revert is not a permitted Actor update.");
  if (resolved.status !== "relayed") {
    need(globalThis.game?.user?.isGM || target.isOwner, "An unowned target can only be reverted by the GM relay.");
    await target.update({ ...restoreUpdate(maps),
      [`flags.ak5e.${RELAY_RECEIPT_FLAG}.${ownedUndoKey(sourceActor, child)}`]: preview.seal });
  } else {
    // Finish an interrupted kernel acknowledgement using its original ID before issuing the inverse.
    const pending = flag(sourceActor, RELAY_STATE_FLAG)?.operations?.find(op => op.id === resolved.applyOperationId && op.status === "prepared");
    if (pending) await runRelay(sourceActor, "apply", { targetUuid: resolved.targetUuid, operation: descriptor }, child.id);
    await runRelay(sourceActor, "revert", { targetUuid: resolved.targetUuid, operation: descriptor,
      applyOperationId: resolved.applyOperationId ?? `relay-apply-${child.id}` }, child.id);
  }
  return { ok: true, changed: Object.keys(maps.values).length, conflicts: [], restored: Object.keys(maps.values) };
}
