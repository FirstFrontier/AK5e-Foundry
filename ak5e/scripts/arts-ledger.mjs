import { currentEpoch, isLocked } from "./play-undo.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";

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

/** Snapshot every Actor field in the final native consumption update, excluding its own index. */
export function captureArtChanges(actor, actorUpdates) {
  const snapshot = actor?._source ?? actor?.toObject?.() ?? actor;
  let cloned;
  try { cloned = structuredClone(snapshot); }
  catch { cloned = JSON.parse(JSON.stringify(snapshot)); }
  const afterState = applyChanges(cloned, actorUpdates), changes = [];
  for (const path of Object.keys(actorUpdates ?? {})) {
    if (!allowedPath(path) || path.startsWith("-") || path.includes(".-=")) continue;
    const before = getPath(snapshot, path), after = getPath(afterState, path);
    if (!equal(before, after)) changes.push({ path, before: before === MISSING ? null : structuredClone(before), beforeMissing: before === MISSING,
      ...(before === MISSING && resourcePath(path) ? { numericBefore: implicitResource(actor, path) } : {}),
      after: after === MISSING ? null : structuredClone(after), afterMissing: after === MISSING });
  }
  return changes;
}

export function artReceiptWindow(actor, combat = globalThis.game?.combat) {
  return { id: combat?.started ? `combat:${combat.uuid ?? combat.id}` : `free:${currentEpoch()}`, epoch: currentEpoch() };
}

export function appendArtReceipt(actor, receipt, changes, combat) {
  const previous = actor?.getFlag?.("ak5e", "artReceipts") ?? actor?.flags?.ak5e?.artReceipts ?? [];
  const window = artReceiptWindow(actor, combat);
  const record = { ...structuredClone(receipt), actorUuid: actor.uuid, windowId: window.id, epoch: window.epoch,
    status: "available", changes: structuredClone(changes), createdAt: Date.now() };
  return [...previous.filter(entry => entry.id !== record.id), record];
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
  return { restore, conflicts, safeCount: restore.length, conflictCount: conflicts.length };
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

export function artReceiptUndoAllowed(actor, receipt, user = globalThis.game?.user) {
  if (!receipt || receipt.actorUuid !== actor?.uuid || !["available"].includes(receipt.status)) return false;
  return Boolean((user?.isGM || actor?.isOwner) && !isLocked(receipt));
}

