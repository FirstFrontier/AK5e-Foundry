/**
 * Reversible Condition operations (WP conditions-01, SPEC-conditions §3.1–§3.4).
 *
 * Uses the shared `createPlayUses` engine (`ns: "conditionUses"`) for previews, durable receipts, encounter
 * windows, undo and public cards. Target changes are one strict, validated operation: a named Condition
 * Contribution on an exact Actor, applied directly when the client may write that Actor and otherwise relayed
 * through the elected GM client as that same validated entry — never an arbitrary document update.
 */
import { createPlayUses } from "./play-uses.mjs";
import { need, flag, values, opaqueKey } from "./operation-kernel.mjs";
import { currentEpoch } from "./play-undo.mjs";
import { conditionDefinition, conditionEffectData, conditionExpiry } from "./condition-registry.mjs";

const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const clone = value => value === undefined ? undefined : structuredClone(value);
const isLiveActor = actor => actor?.documentName === "Actor" && !actor.pack;
const canWrite = target => Boolean(game.user?.isGM || target?.isOwner);
const instanceOf = effect => {
  const value = effect?.getFlag?.("ak5e", "conditionInstance") ?? effect?.flags?.ak5e?.conditionInstance;
  return value && typeof value === "object" ? value : null;
};
const appliedFlags = target => flag(target, "conditionUsesApplied") ?? {};
const targetUseIdOf = (useId, entry) => entry?.key ? `${useId}_${opaqueKey(String(entry.key))}` : useId;
const newId = () => globalThis.foundry?.utils?.randomID?.() ?? `cond-${Math.random().toString(36).slice(2, 12)}`;

/* ------------------------------------------------------------------ input normalization */

function targetUuidOf(data = {}) {
  const direct = typeof data.target === "string" ? data.target : undefined;
  const alternate = typeof data.targetUuid === "string" ? data.targetUuid : undefined;
  need(direct || alternate, "Choose a target Actor.");
  need(!direct || !alternate || direct === alternate, "The target identity is inconsistent.");
  return direct ?? alternate;
}

function prepareApply(data = {}) {
  const record = conditionDefinition(data.key);
  need(record, "Choose a known Condition.");
  const targetUuid = targetUuidOf(data);
  const expiry = conditionExpiry(data.expiry ?? {}, { worldTime: game.time?.worldTime });
  let parameters = data.parameters ?? [];
  if (!Array.isArray(parameters) && !isPlainObject(parameters)) throw new Error("Condition parameters must be plain data.");
  if (record.key === "doomed") {
    need(isPlainObject(parameters) && isNonEmptyString(parameters.ability) && isNonEmptyString(parameters.damageType),
      "Doomed needs the chosen ability and damage type.");
  }
  let overlay = data.overlay ?? null;
  if (overlay !== null && (!isPlainObject(overlay) || !isNonEmptyString(overlay.kind))) {
    throw new Error("The overlay must be a typed source-scoped record.");
  }
  return { record, targetUuid, expiry, parameters: clone(parameters), overlay: clone(overlay) };
}

function prepareRemove(data = {}) {
  const record = conditionDefinition(data.key);
  need(record, "Choose a known Condition.");
  const targetUuid = targetUuidOf(data);
  need(Array.isArray(data.instanceIds) && data.instanceIds.length, "Choose the exact Condition instances to remove.");
  const instanceIds = [...new Set(data.instanceIds)];
  need(instanceIds.every(id => isNonEmptyString(id)), "Every removed instance needs a stable identity.");
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  need(reason.length > 0, "Give the reason for this removal.");
  return { record, targetUuid, instanceIds, reason };
}

function canonicalApply(data) {
  const { record, targetUuid, expiry, parameters, overlay } = prepareApply(data);
  return JSON.stringify({ command: "applyCondition", key: record.key, target: targetUuid, expiry, parameters, overlay });
}
function canonicalRemove(data) {
  const { record, targetUuid, instanceIds, reason } = prepareRemove(data);
  return JSON.stringify({ command: "removeCondition", key: record.key, target: targetUuid, instanceIds: [...instanceIds].sort(), reason });
}

function expiryLabel(expiry) {
  if (!expiry || expiry.kind === "manual") return "manual (remove it when its source says so)";
  if (expiry.kind === "time") return `world time ${expiry.worldTime}`;
  if (expiry.kind === "turn") return `round ${expiry.round} ${expiry.phase}`;
  if (expiry.kind === "concentration") return "while the linked concentration effect lasts";
  return "the earliest listed deadline";
}

/* ------------------------------------------------------------------ target entry projection */

const ENTRY_KEYS = new Set(["kind", "uuid", "key", "action", "instanceId", "instanceIds", "reason", "condition", "ready"]);
const APPLY_CONDITION_KEYS = new Set(["key", "expiry", "parameters", "overlay"]);
const REMOVE_CONDITION_KEYS = new Set(["key"]);

const plainData = (value, depth = 0) => {
  if (depth > 4) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => plainData(item, depth + 1));
  if (isPlainObject(value)) return Object.entries(value).every(([key, item]) => !DANGEROUS.has(key) && plainData(item, depth + 1));
  return false;
};

const emptyContainer = value => Array.isArray(value) ? value.length === 0
  : isPlainObject(value) && Object.keys(value).length === 0;
/** Empty parameters are the same request whether they arrive as `{}` or `[]`; anything else matches exactly. */
const sameParameters = (a, b) => (emptyContainer(a) && emptyContainer(b))
  || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function boundedExpiry(expiry) {
  try {
    const normalized = conditionExpiry(expiry, {});
    return plainData(normalized) ? normalized : null;
  } catch { return null; }
}

/** The canonical projection of a recorded target entry, without bookkeeping fields. */
export function projectConditionEntry(entry = {}) {
  const record = conditionDefinition(entry?.condition?.key ?? entry?.key);
  if (!record) return null;
  if (entry.action === "remove") {
    return { kind: "condition", uuid: entry.uuid, key: record.key, action: "remove",
      instanceIds: Array.isArray(entry.instanceIds) ? [...entry.instanceIds] : [],
      reason: entry.reason, condition: { key: record.key }, ready: true };
  }
  return { kind: "condition", uuid: entry.uuid, key: record.key, action: "apply", instanceId: entry.instanceId,
    condition: { key: record.key, expiry: entry.condition?.expiry, parameters: entry.condition?.parameters ?? [],
      overlay: entry.condition?.overlay ?? null }, ready: true };
}

/**
 * Validate one target entry against the source's recorded operation and the target's authoritative records.
 * Apply validates the exact instance identity; revert additionally requires the target's own operation record.
 */
export function validateConditionTarget(source, receipt, entry, target, { revert = false } = {}) {
  if (!isLiveActor(source) || !isLiveActor(target) || !receipt || typeof receipt !== "object") return false;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  if (entry.kind !== "condition" || entry.ready !== true) return false;
  for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) return false;
  if (!isNonEmptyString(entry.uuid) || entry.uuid !== target.uuid) return false;
  const record = conditionDefinition(entry.condition?.key);
  if (!record || record.key !== entry.key) return false;
  const candidates = Array.isArray(receipt.targets)
    ? receipt.targets.filter(candidate => candidate?.kind === "condition" && candidate.uuid === target.uuid && candidate.key === record.key)
    : [];
  if (!candidates.length) return false;

  if (entry.action === "apply") {
    const recorded = candidates.find(candidate => candidate.action !== "remove" && candidate.instanceId === entry.instanceId);
    if (!recorded) return false;
    if (!isNonEmptyString(entry.instanceId) || entry.instanceId !== recorded.instanceId) return false;
    for (const key of Object.keys(entry.condition)) if (!APPLY_CONDITION_KEYS.has(key)) return false;
    const expiry = boundedExpiry(entry.condition.expiry);
    if (!expiry || JSON.stringify(expiry) !== JSON.stringify(recorded.condition?.expiry ?? { kind: "manual" })) return false;
    const parameters = entry.condition.parameters ?? [];
    if (!plainData(parameters) || !sameParameters(parameters, recorded.condition?.parameters ?? [])) return false;
    const overlay = entry.condition.overlay ?? null;
    if (overlay !== null && !plainData(overlay)) return false;
    if (JSON.stringify(overlay) !== JSON.stringify(recorded.condition?.overlay ?? null)) return false;
  } else if (entry.action === "remove") {
    for (const key of Object.keys(entry.condition)) if (!REMOVE_CONDITION_KEYS.has(key)) return false;
    if (!Array.isArray(entry.instanceIds) || !entry.instanceIds.length) return false;
    if (new Set(entry.instanceIds).size !== entry.instanceIds.length) return false;
    if (!entry.instanceIds.every(id => isNonEmptyString(id))) return false;
    if (!isNonEmptyString(entry.reason)) return false;
    const known = new Set();
    for (const candidate of candidates) {
      if (candidate.instanceId) known.add(candidate.instanceId);
      for (const id of candidate.instanceIds ?? []) known.add(id);
    }
    if (!entry.instanceIds.every(id => known.has(id))) return false;
  } else return false;

  if (revert) {
    const acks = appliedFlags(target);
    const applied = Object.values(acks).filter(value => value && value.operationId === receipt.id);
    if (!applied.length) return false;
    const ids = entry.action === "remove" ? entry.instanceIds : [entry.instanceId];
    // An undo of a removal must accept the removal's own acknowledgement (`action:"remove"`); an undo of an
    // application accepts the applied/restored acknowledgement only. Each required instance is matched against
    // the acknowledgement's recorded instance set, because a removal records the full set in `instanceIds`.
    const acceptedActions = entry.action === "remove" ? ["apply", "restore", "remove"] : ["apply", "restore"];
    if (!ids.every(instanceId => applied.some(value => {
      if (!acceptedActions.includes(value.action)) return false;
      const recordedInstanceIds = Array.isArray(value.instanceIds) ? value.instanceIds : [value.instanceId];
      return recordedInstanceIds.includes(instanceId);
    }))) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ the target kind */

function recordForEntry(source, entry) {
  const state = conditionUses.state(source);
  return (state.undo ?? []).find(candidate => Array.isArray(candidate.targets)
    && candidate.targets.some(item => {
      if (item?.kind !== "condition" || item.uuid !== entry?.uuid || item.key !== entry?.key) return false;
      // A removal records its instances as a set, so identity must be matched set-to-set, never against a
      // singular field a removal entry does not carry.
      if (entry.action === "remove") {
        return Array.isArray(item.instanceIds) && Array.isArray(entry.instanceIds)
          && item.instanceIds.length === entry.instanceIds.length
          && entry.instanceIds.every(id => item.instanceIds.includes(id));
      }
      return item.action !== "remove" && item.instanceId === entry.instanceId;
    })) ?? null;
}

async function removeContributions(target, instanceIds) {
  const effects = values(target.effects).filter(effect => {
    const instance = instanceOf(effect);
    return instance && instanceIds.includes(instance.instanceId);
  });
  if (!effects.length) return [];
  const before = effects.map(effect => ({
    id: effect.id,
    data: { name: effect.name, img: effect.img, disabled: effect.disabled === true, transfer: effect.transfer === true,
      statuses: clone(effect.statuses ?? []), changes: clone(effect.changes ?? []), flags: clone(effect.flags ?? {}) }
  }));
  await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
  return before;
}

/** The single validated Condition target kind (§3.4) — reusable by a parent ledger without a second source use. */
export const conditionTargetKind = {
  documentName: "Actor",
  async apply(source, useId, entry, target) {
    need(isLiveActor(target), "That target no longer exists.");
    const receipt = recordForEntry(source, entry);
    const operationId = receipt?.id ?? String(useId);
    const ackKey = opaqueKey(`${useId}:${source.uuid}`);
    const existingAck = appliedFlags(target)[ackKey];
    if (existingAck?.status && existingAck.status !== "failed") return existingAck;

    if (entry.action === "remove") {
      const removed = await removeContributions(target, entry.instanceIds);
      need(removed.length === entry.instanceIds.length, "Those Condition instances are no longer on the target.");
      const ack = { operationId, instanceId: entry.instanceIds[0], instanceIds: [...entry.instanceIds], action: "remove",
        before: removed, after: null, effectIds: removed.map(item => item.id), reason: entry.reason, status: "removed" };
      await target.update({ [`flags.ak5e.conditionUsesApplied.${ackKey}`]: ack });
      return ack;
    }

    const existing = values(target.effects).find(effect => {
      const instance = instanceOf(effect);
      return instance && instance.instanceId === entry.instanceId && instance.sourceActorUuid === source.uuid;
    });
    if (existing) {
      const ack = { operationId, instanceId: entry.instanceId, action: "apply", before: null,
        after: { effectId: existing.id }, effectIds: [existing.id], status: "applied" };
      await target.update({ [`flags.ak5e.conditionUsesApplied.${ackKey}`]: ack });
      return ack;
    }
    const data = conditionEffectData({ key: entry.condition.key, sourceActorUuid: source.uuid,
      sourceItemUuid: entry.condition.parameters?.sourceItemUuid ?? null, operationId, instanceId: entry.instanceId,
      expiry: entry.condition.expiry, parameters: entry.condition.parameters, overlay: entry.condition.overlay });
    need(data, "That Condition cannot be applied.");
    const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [data]);
    const ack = { operationId, instanceId: entry.instanceId, action: "apply", before: null,
      after: { effectId: effect.id }, effectIds: [effect.id], status: "applied" };
    await target.update({ [`flags.ak5e.conditionUsesApplied.${ackKey}`]: ack });
    return ack;
  },
  async revert(source, useId, entry, target) {
    need(isLiveActor(target), "That target no longer exists.");
    const ackKey = opaqueKey(`${useId}:${source.uuid}`);
    const ack = appliedFlags(target)[ackKey];
    if (!ack) return { removed: 0, preserved: true };
    if (entry.action === "remove") {
      const restored = (Array.isArray(ack.before) ? ack.before : []).map(item => item?.data).filter(Boolean);
      if (restored.length) await target.createEmbeddedDocuments("ActiveEffect", restored);
      await target.update({ [`flags.ak5e.conditionUsesApplied.${ackKey}`]: { ...ack, action: "reverted", status: "reverted" } });
      return { restored: restored.length };
    }
    const ids = (ack.effectIds ?? []).filter(id => values(target.effects).some(effect => effect.id === id
      && instanceOf(effect)?.instanceId === ack.instanceId));
    if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
    await target.update({ [`flags.ak5e.conditionUsesApplied.${ackKey}`]: { ...ack, action: "reverted", status: "reverted" } });
    return { removed: ids.length };
  },
  preview(_source, receipt, entry, target) {
    if (entry.action === "remove") return `${entry.key}: restores ${entry.instanceIds?.length ?? 0} recorded Condition instance(s).`;
    const present = values(target?.effects).some(effect => instanceOf(effect)?.instanceId === entry.instanceId);
    return present ? `${entry.key}: removes the recorded Condition Effect.` : `${entry.key}: already gone; nothing to remove.`;
  }
};

/* ------------------------------------------------------------------ plans */

function actorAt(uuid, label = "the target") {
  const actor = globalThis.fromUuidSync?.(uuid);
  need(actor?.documentName === "Actor", `Choose ${label}.`);
  return actor;
}

function applyConditionPlan(actor, _state, data) {
  const { record, targetUuid, expiry, parameters, overlay } = prepareApply(data);
  const target = actorAt(targetUuid);
  const ready = canWrite(target);
  return {
    title: `Apply ${record.name} — ${actor.name} (${actor.uuid}) → ${target.name} (${target.uuid}); expiry: ${expiryLabel(expiry)}`,
    warnings: [],
    manualSteps: [record.manual, `Expiry is ${expiryLabel(expiry)}.`],
    previewTargets: [{ uuid: target.uuid, name: target.name, key: record.key }],
    apply(next, receipt) {
      const instanceId = isNonEmptyString(data.instanceId) ? data.instanceId : newId();
      receipt.title = `Apply ${record.name}`;
      receipt.targets = [{ kind: "condition", uuid: target.uuid, name: target.name, key: record.key, action: "apply",
        instanceId, condition: { key: record.key, expiry, parameters, overlay }, ready, remote: !ready }];
      receipt.summary = `Apply ${record.name} to ${target.name} from ${actor.name}; expiry: ${expiryLabel(expiry)}.`;
      receipt.result = { ok: true, key: record.key, instanceId, targetUuid: target.uuid, operationId: receipt.id };
      return {};
    }
  };
}

function removeConditionPlan(actor, _state, data) {
  const { record, targetUuid, instanceIds, reason } = prepareRemove(data);
  const target = actorAt(targetUuid);
  const ready = canWrite(target);
  const present = values(target.effects).filter(effect => {
    const instance = instanceOf(effect);
    return instance && instance.key === record.key && instanceIds.includes(instance.instanceId);
  });
  need(present.length === instanceIds.length, "Those Condition instances are no longer on the target.");
  return {
    title: `Remove ${record.name} — ${actor.name} (${actor.uuid}) → ${target.name} (${target.uuid}); ${instanceIds.length} recorded instance(s)`,
    warnings: [],
    manualSteps: [`Removal reason: ${reason}.`],
    previewTargets: [{ uuid: target.uuid, name: target.name, key: record.key, instanceIds: [...instanceIds] }],
    apply(next, receipt) {
      receipt.title = `Remove ${record.name}`;
      receipt.targets = [{ kind: "condition", uuid: target.uuid, name: target.name, key: record.key, action: "remove",
        instanceIds: [...instanceIds], reason, condition: { key: record.key }, ready, remote: !ready }];
      receipt.summary = `Remove ${record.name} from ${target.name}: ${reason}.`;
      receipt.result = { ok: true, key: record.key, instanceIds: [...instanceIds], targetUuid: target.uuid, operationId: receipt.id };
      return {};
    }
  };
}

/* ------------------------------------------------------------------ the shared use engine */

const engine = createPlayUses({
  ns: "conditionUses",
  label: "Conditions",
  isMember: isLiveActor,
  ruling: () => undefined
});

engine.register({
  plans: { applyCondition: applyConditionPlan, removeCondition: removeConditionPlan },
  targetKinds: { condition: conditionTargetKind }
});

/* ------------------------------------------------------------------ GM relay (strict envelope) */

const REQUEST_FLAG = "conditionUsesRelayRequest";
const RESPONSE_FLAG = "conditionUsesRelayResponse";
const REQUEST_KEYS = new Set(["version", "useId", "sourceUuid", "command", "entry", "confirmation"]);

async function submitTargetRelay(actor, receipt, entry, command) {
  const activeGM = game.users?.activeGM;
  need(activeGM, "No GM is connected.");
  const payload = { version: 1, useId: receipt.id, sourceUuid: actor.uuid, command, confirmation: true,
    entry: projectConditionEntry(entry) };
  const message = await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `Conditions: ${command === "apply" ? "apply" : "remove"} request for ${entry.key}.`,
    whisper: [activeGM.id, game.user.id],
    flags: { ak5e: { [REQUEST_FLAG]: payload } }
  });
  return new Promise((resolve, reject) => {
    const finish = response => {
      if (!response) return;
      clearTimeout(timer);
      Hooks.off("updateChatMessage", listener);
      response.ok ? resolve(response.result) : reject(new Error(response.error ?? "The GM's client did not apply this change."));
    };
    const listener = changed => { if (changed?.id === message.id) finish(flag(changed, RESPONSE_FLAG)); };
    const timer = setTimeout(() => {
      Hooks.off("updateChatMessage", listener);
      reject(new Error("Request timed out. Retry with the same operation ID; do not create a new action."));
    }, 15000);
    Hooks.on("updateChatMessage", listener);
    finish(flag(message, RESPONSE_FLAG));
  });
}

async function applyRelayedCondition(request, message, userId) {
  for (const key of Object.keys(request)) need(REQUEST_KEYS.has(key), "That relayed Condition request carries fields it may not use.");
  need(request.version === 1 && request.confirmation === true, "That relayed Condition request is not a confirmed version 1 operation.");
  need(request.command === "apply" || request.command === "revert", "Unknown relayed Condition change.");
  const user = game.users?.get?.(userId);
  need(user && message?.author?.id === userId, "The relayed request's author is invalid.");
  const source = globalThis.fromUuidSync?.(request.sourceUuid);
  need(isLiveActor(source), "The relayed Condition source no longer exists.");
  const receipt = engine.receipt(source, request.useId);
  need(receipt, "No recorded Condition use matches this relayed change.");
  need(receipt.userId === userId, "That operation belongs to another user.");
  const entry = request.entry;
  need(entry && typeof entry === "object" && !Array.isArray(entry), "The relayed Condition entry is missing.");
  const entryKeys = Object.keys(entry);
  need(entryKeys.length > 0 && entryKeys.every(key => ["kind", "uuid", "key", "action", "instanceId", "instanceIds", "reason", "condition", "ready"].includes(key)),
    "The relayed Condition entry is not a strict target entry.");
  need(entry.kind === "condition" && entry.ready === true, "The relayed Condition entry is not a ready condition operation.");
  const recorded = (receipt.targets ?? []).find(candidate => candidate?.kind === "condition" && candidate.uuid === entry.uuid
    && candidate.key === entry.key && candidate.action === entry.action);
  need(recorded, "That Creature is not part of the recorded Condition use.");
  const projected = projectConditionEntry(recorded);
  need(projected && JSON.stringify(projected) === JSON.stringify(entry), "The relayed entry does not match the recorded operation.");
  const target = globalThis.fromUuidSync?.(entry.uuid);
  need(isLiveActor(target), "The target no longer exists.");
  need(validateConditionTarget(source, receipt, entry, target, { revert: request.command === "revert" }),
    "The recorded Condition change did not validate on the target.");
  if (request.command === "apply") {
    need(receipt.status !== "undone", "That change is not ready to apply.");
    return conditionTargetKind.apply(source, targetUseIdOf(receipt.id, recorded), entry, target);
  }
  need(Number(receipt.epoch ?? -1) === currentEpoch() || user.isGM, "This use is locked: its encounter window has ended.");
  return conditionTargetKind.revert(source, targetUseIdOf(receipt.id, recorded), entry, target);
}

/** GM-client half of the Condition relay: strict entry operations and the engine's own revert transport. */
export async function handleConditionRelay(message, options, userId) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
  const request = flag(message, REQUEST_FLAG);
  if (!request || request.version !== 1 || !request.entry) return engine.handleRelay(message, options, userId);
  if (flag(message, RESPONSE_FLAG)) return;
  try {
    const result = await applyRelayedCondition(request, message, userId);
    await message.update({ [`flags.ak5e.${RESPONSE_FLAG}`]: { ok: true, result } });
  } catch (error) {
    await message.update({ [`flags.ak5e.${RESPONSE_FLAG}`]: { ok: false, error: String(error?.message ?? error) } });
  }
}

let hooksRegistered = false;
/** Idempotent condition relay hooks (§3.4). No bulk import, no migration, no listener duplication. */
export function registerConditionHooks() {
  const hooks = globalThis.Hooks;
  if (!hooks) return false;
  if (hooks._ak5eConditionHooks) return true;
  hooks._ak5eConditionHooks = true;
  hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(handleConditionRelay(message, options, userId))
    .catch(error => console.error("AK5e | Condition relay", error)));
  hooksRegistered = true;
  return true;
}
export const conditionHooksRegistered = () => hooksRegistered;

/* ------------------------------------------------------------------ public surface */

async function markReceipt(actor, operationId, mutate) {
  const state = engine.state(actor);
  const receipt = state.undo.find(entry => entry.id === operationId);
  if (!receipt) return null;
  mutate(receipt, state);
  await actor.update({ "flags.ak5e.conditionUses": state });
  return receipt;
}

async function finishRemote(actor, receipt, result) {
  const remote = (receipt.targets ?? []).find(entry => entry?.kind === "condition" && entry.remote);
  if (!remote) return result;
  if (!game.users?.activeGM) {
    await markReceipt(actor, receipt.id, saved => {
      saved.status = "pending";
      saved.lastError = "no GM is connected";
    });
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<h3>Not applied yet — Retry</h3><p>${remote.name}: no GM is connected, so this Condition was not applied. Retry the same operation when a GM is connected.</p>`,
      flags: { ak5e: { conditionUsesPending: { operationId: receipt.id, targetUuid: remote.uuid } } }
    });
    return { ok: false, status: "pending", operationId: receipt.id, targetUuid: remote.uuid,
      message: "Not applied yet — Retry when a GM is connected." };
  }
  try {
    await submitTargetRelay(actor, receipt, remote, "apply");
  } catch (error) {
    await markReceipt(actor, receipt.id, saved => {
      saved.status = "pending";
      saved.lastError = String(error?.message ?? error);
    });
    throw new Error(`Not applied yet: ${String(error?.message ?? error)}. The use is recorded; retry it when a GM is connected.`);
  }
  await markReceipt(actor, receipt.id, saved => {
    const entry = (saved.targets ?? []).find(item => item?.kind === "condition" && item.remote);
    if (entry) { entry.applied = true; entry.ready = true; }
    saved.status = "complete";
    saved.lastError = null;
  });
  return result;
}

/**
 * Public Condition command (§3.4): `applyCondition`, `removeCondition`, `undoUse`, `useRoll`.
 * A repeated stable operation ID resumes; altered choices under the same ID are rejected before any write.
 */
export async function conditionCommand(actor, name, data = {}, operationId = newId(), requester = game.user) {
  need(isLiveActor(actor), "Choose a live Actor for this Condition use.");
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(operationId), "A stable operation ID is required.");
  if (name === "undoUse") return conditionUndo(actor, data, requester);
  if (name === "useRoll") return engine.command(actor, name, data, operationId, requester);
  need(name === "applyCondition" || name === "removeCondition", "Unknown Conditions command.");
  const canonical = name === "applyCondition" ? canonicalApply(data) : canonicalRemove(data);
  const existing = engine.receipt(actor, operationId);
  if (existing) {
    if (existing.command !== name) return { ok: false, error: "That operation ID belongs to a different Condition use." };
    let stored = null;
    try { stored = existing.command === "applyCondition" ? canonicalApply(existing.data) : canonicalRemove(existing.data); } catch { stored = null; }
    if (stored !== canonical) return { ok: false, error: "That operation ID was already used with different choices; use a new operation ID." };
  }
  const result = await engine.command(actor, name, data, operationId, requester);
  const receipt = engine.receipt(actor, operationId);
  return receipt ? finishRemote(actor, receipt, result) : result;
}

function receiptLocked(receipt) {
  return !receipt || Number(receipt.epoch ?? -1) !== currentEpoch();
}

async function conditionUndo(actor, data = {}, requester = game.user) {
  const receipt = engine.receipt(actor, data?.useId);
  if (!receipt) return { ok: false, error: "This Condition use is no longer recorded." };
  if (receiptLocked(receipt)) return { ok: false, locked: true, error: "Locked: this Condition use's encounter window has ended." };
  return engine.command(actor, "undoUse", data, newId(), requester);
}

function previewConditionUndo(actor, useId) {
  const receipt = engine.receipt(actor, useId);
  if (!receipt) return { lines: ["This Condition use is no longer recorded."], blocked: true };
  if (receiptLocked(receipt)) {
    return { lines: ["Locked: this Condition use's encounter window has ended; its receipt stays visible and is never deleted."], blocked: true, locked: true };
  }
  return engine.previewUndo(actor, useId);
}

export const conditionUses = Object.freeze({
  ...engine,
  command: conditionCommand,
  previewUndo: previewConditionUndo,
  handleRelay: handleConditionRelay
});

/** Module-level preview surfaces (the same functions the ready API exposes). */
export function preview(source, name, data = {}) { return engine.preview(source, name, data); }
export function previewUndo(actor, useId) { return previewConditionUndo(actor, useId); }
export function uses(actor) { return engine.uses(actor); }
export function receipt(actor, useId) { return engine.receipt(actor, useId); }

/** Convenience re-exports for later packages that need the same primitives without a second source use. */
export { conditionDefinition, conditionEffectData, conditionExpiry };
