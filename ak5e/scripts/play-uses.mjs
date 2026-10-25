/**
 * Branch-free table-play use engine (WORKFLOW.md §3.2, "trust the table"), generalised from the Caster use engine
 * (caster-primal-splash.mjs) so other classes' branches can adopt it:
 * - a use is a plan: `plan(actor, state, data)` returns `{ warnings, title, reading?, apply(next, receipt, reading) }`;
 *   warnings throw `PlayWarnings` until overridden ("Use anyway"), a missing GM ruling throws `PlayReading`;
 * - each use is one receipt in `flags.ak5e.<ns>.undo` with its encounter epoch; a retry with the same ID resumes it;
 * - resources (pools, AP, Resilience, currency) are spent by path, clamp at 0, show the shortfall and restore by delta;
 * - changes to Creatures the user cannot write go through the active GM's client (an operation-kernel relay) that
 *   applies only a change recorded in the receipt; without a GM the use stays "Not applied yet" and can be retried;
 * - dice are rolled only from the card's Roll button (`useRoll`), and the result is stored before it is applied;
 * - every use posts a public card listing overrides, the player's reading and any shortfall.
 * Nothing here knows a class; branch modules register plans and target kinds.
 */
import { applyFeatureTag } from "./feature-tags.mjs";
import { createOperationKernel, flag, values, need, opaqueKey, esc, keyedSerial } from "./operation-kernel.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";
import { requireOverrides, resolveReading, currentEpoch, isLocked } from "./play-undo.mjs";
import { applyHealing, applyTempHP } from "./damage-pipeline.mjs";
import { getReactions, refundReaction, spendReaction } from "./trigger-events.mjs";

const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const clone = value => value === undefined ? undefined : structuredClone(value);
const deletePath = path => { const parts = path.split("."), leaf = parts.pop(); return `${parts.join(".")}.-=${leaf}`; };
function mergeUpdate(before, update) {
  if (!update || typeof update !== "object" || Array.isArray(update)) return clone(update);
  const merged = before && typeof before === "object" && !Array.isArray(before) ? clone(before) : {};
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("-=")) delete merged[key.slice(2)];
    else merged[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeUpdate(merged[key], value) : clone(value);
  }
  return merged;
}
function restoreUpdate(path, before, after, updates) {
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    for (const key of Object.keys(after)) if (!Object.hasOwn(before, key)) updates[`${path}.-=${key}`] = null;
    for (const [key, value] of Object.entries(before)) {
      if (!Object.hasOwn(after, key)) updates[`${path}.${key}`] = clone(value);
      else restoreUpdate(`${path}.${key}`, value, after[key], updates);
    }
  } else updates[path] = clone(before);
}
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}
// Record only changed leaves so undoing an older use preserves unrelated later state.
function dataDiff(before, after, prefix = []) {
  const changes = [];
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    const a = before?.[key], b = after?.[key], keys = [...prefix, key], path = keys.join(".");
    if (sameValue(a, b)) continue;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) changes.push(...dataDiff(a, b, keys));
    else changes.push({ path, keys, before: clone(a), beforePresent: Object.hasOwn(before ?? {}, key), after: clone(b), afterPresent: Object.hasOwn(after ?? {}, key) });
  }
  return changes;
}
function setData(object, path, value, present) {
  const keys = Array.isArray(path) ? [...path] : path.split("."), leaf = keys.pop();
  let parent = object;
  for (const key of keys) parent = parent[key] ??= {};
  if (present) parent[leaf] = clone(value); else delete parent[leaf];
}
const dataValue = (data, change) => (change.keys ?? change.path.split(".")).reduce((value, key) => value?.[key], data);
function rememberData(receipt, before, after) {
  for (const change of dataDiff(before, after)) {
    const prior = (receipt.dataChanges ??= []).find(entry => entry.path === change.path);
    if (prior) { prior.after = change.after; prior.afterPresent = change.afterPresent; }
    else receipt.dataChanges.push(change);
  }
}
const isConstruct = actor => String(actor?.system?.details?.type?.value ?? "").toLowerCase() === "construct";
export const warn = (list, id, text) => list.push({ id, text });
class NoGM extends Error {}

/**
 * Spend a resource for a use. `pool` (a resource-pools id) or `path` (an Actor value such as AP). Returns the update;
 * records `{path, before, after, max, label}` on the receipt and the shortfall text when the user overrode a shortfall.
 */
export function spendResource(actor, receipt, { pool, path, amount, label, max }) {
  const record = pool ? getPool(actor, pool) : null;
  const resourcePath = pool ? `flags.ak5e.resourcePools.${pool}.value` : path;
  const before = record ? record.value : Number(getPath(actor, path)) || 0, after = Math.max(0, before - amount);
  (receipt.resources ??= []).push({ pool: pool ?? null, path: resourcePath, before, after, max: record?.max ?? max ?? null, label });
  if (amount > before) receipt.shortfalls = [...(receipt.shortfalls ?? []), `${label} short by ${amount - before}`];
  return { [resourcePath]: after };
}
/** Current value of a resource, for warnings before anything is spent. */
export function resourceValue(actor, { pool, path }) { return pool ? getPool(actor, pool).value : Number(getPath(actor, path)) || 0; }

export function createPlayUses({ ns, label, isMember, ruling = () => undefined, publicSnapshot = false }) {
  need(/^[A-Za-z][A-Za-z0-9]{2,40}$/.test(ns), "A play-use namespace must be a short identifier.");
  const PLANS = {}, READINGS = {}, KINDS = {}, CLEANUPS = [], serial = keyedSerial();
  const effectFlag = `${ns}Effect`, appliedFlag = `${ns}Applied`, cardFlag = `${ns}Use`, operationFlag = `${ns}Operation`, actorFlag = `${ns}Actor`;
  const appliedKey = (source, useId) => opaqueKey(`${useId}:${source.uuid}`);
  const record = (target, source, useId) => flag(target, appliedFlag)?.[appliedKey(source, useId)];
  const targetDocument = entry => KINDS[entry.kind]?.documentName ?? "Actor";
  const canWrite = target => game.user.isGM || target.isOwner;
  // Explicit keys distinguish multiple operations on one target without changing legacy receipts.
  const targetUseId = (useId, entry) => entry.key ? `${useId}_${opaqueKey(String(entry.key))}` : useId;

  function readState(actor) {
    const stored = flag(actor, ns);
    const state = stored && typeof stored === "object" ? structuredClone(stored) : {};
    return { ...state, undo: Array.isArray(state.undo) ? state.undo : [], data: state.data && typeof state.data === "object" ? state.data : {} };
  }
  async function save(actor, state, updates = {}) { await actor.update({ ...updates, [`flags.ak5e.${ns}`]: state }); }

  function prepareFlagChanges(actor, receipt, updates) {
    const resourcePaths = new Set((receipt.resources ?? []).map(resource => resource.path));
    receipt.flagChanges = Object.entries(updates)
      .filter(([path]) => path.startsWith("flags.ak5e.") && !resourcePaths.has(path))
      .map(([path, after]) => {
        const before = getPath(actor, path);
        return { path, before: clone(before), beforePresent: before !== undefined, after: mergeUpdate(before, after) };
      });
    receipt.preparedUpdates = clone(updates);
  }

  /* ---------------------------------------------------------------- built-in target kinds */

  /** Healing: Ch.1 L138 Constructs cannot regain HP from these sources unless the table overrides the warning. */
  KINDS.heal = {
    async apply(source, useId, entry, target) {
      const done = record(target, source, useId);
      if (done) return done;
      const hp = target.system.attributes.hp;
      const heal = applyHealing(hp, entry.amount, { source: entry.healingSource ?? "classFeature", isConstruct: isConstruct(target), constructException: entry.constructException === true });
      const applied = { hpGained: heal.newHp - Number(hp.value), value: heal.newHp, rolled: entry.amount, blocked: heal.blocked ? heal.reason : null, tag: entry.recordTag ?? null };
      await target.update({ "system.attributes.hp.value": heal.newHp, [`flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}`]: applied });
      return applied;
    },
    async revert(source, useId, _entry, target) {
      const applied = record(target, source, useId);
      if (!applied) return { removed: 0 };
      await target.update({ "system.attributes.hp.value": Math.max(0, Number(target.system.attributes.hp.value) - applied.hpGained), [`flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}`]: null });
      return { removed: applied.hpGained };
    },
    preview(source, receipt, entry, target) {
      const applied = record(target, source, receipt.id);
      if (!applied) return `${entry.name}: nothing recorded to remove.`;
      return `${entry.name}: removes the ${applied.hpGained} Hit Points restored${Number(target.system.attributes.hp.value) !== applied.value ? "; its Hit Points changed since, so only that amount is removed" : ""}.`;
    },
    rolled(entry, total) { entry.amount = total; },
    rollText(entry) {
      const applied = typeof entry.applied === "object" ? entry.applied : {};
      return applied.blocked ? `${entry.name}: ${applied.blocked}` : `${entry.name} regains ${applied.hpGained ?? 0} Hit Points (rolled ${applied.rolled ?? entry.amount}).`;
    }
  };
  /** Temporary Hit Points: "additive" adds; "replace" keeps the higher value (D&D5e default for non-stacking Temporary HP). */
  KINDS.tempHP = {
    async apply(source, useId, entry, target) {
      const done = record(target, source, useId);
      if (done) return done;
      const before = Number(target.system.attributes.hp.temp ?? 0), temp = applyTempHP(before, entry.amount, entry.mode === "additive" ? "additive" : "replace");
      const applied = { tempBefore: before, temp, rolled: entry.amount };
      await target.update({ "system.attributes.hp.temp": temp, [`flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}`]: applied });
      return applied;
    },
    async revert(source, useId, _entry, target) {
      const applied = record(target, source, useId);
      if (!applied) return { removed: 0 };
      const current = Number(target.system.attributes.hp.temp ?? 0);
      const temp = current === applied.temp ? applied.tempBefore : Math.max(0, current - (applied.temp - applied.tempBefore));
      await target.update({ "system.attributes.hp.temp": temp, [`flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}`]: null });
      return { removed: applied.temp - applied.tempBefore };
    },
    preview(source, receipt, entry, target) {
      const applied = record(target, source, receipt.id);
      return applied ? `${entry.name}: Temporary HP back to ${applied.tempBefore}${Number(target.system.attributes.hp.temp ?? 0) !== applied.temp ? " (it changed since; only the amount added is removed)" : ""}.` : `${entry.name}: nothing recorded to remove.`;
    },
    rolled(entry, total) { entry.amount = total; },
    rollText(entry) {
      const applied = typeof entry.applied === "object" ? entry.applied : {};
      return `${entry.name}: Temporary HP ${applied.tempBefore ?? 0} → ${applied.temp ?? entry.amount} (rolled ${applied.rolled ?? entry.amount}).`;
    }
  };
  /**
   * A tracked effect from a source feature Item (`entry.featureId`, a chapterThreeId) with `entry.tag` applyFeatureTag
   * options. A combat expiry falls back to manual expiry when its actor is not in a started combat.
   */
  KINDS.effect = {
    async apply(source, useId, entry, target) {
      const existing = values(target.effects).find(effect => flag(effect, effectFlag)?.opId === useId && flag(effect, effectFlag)?.sourceUuid === source.uuid);
      if (existing) return true;
      const item = values(source.items).find(candidate => flag(candidate, "chapterThreeId") === entry.featureId);
      need(item, "Run setup to add this feature Item first.");
      const tag = { ...entry.tag }, expiryActor = tag.expiryActor === "target" ? target : source;
      const inCombat = game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === expiryActor.uuid);
      if (["turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd", "combatEnd"].includes(tag.trigger) && !inCombat) {
        tag.trigger = "manual";
        tag.instructions = `${tag.instructions ?? ""} Outside combat, remove it manually when it ends.`.trim();
      }
      const effect = await applyFeatureTag(source, item, target, tag);
      try { await effect.update({ [`flags.ak5e.${effectFlag}`]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) } }); }
      catch (error) { await effect.delete(); throw error; }
      return true;
    },
    async revert(source, useId, _entry, target) {
      const effects = values(target.effects).filter(effect => flag(effect, effectFlag)?.opId === useId && flag(effect, effectFlag)?.sourceUuid === source.uuid);
      if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
      return { removed: effects.length };
    },
    preview(_source, receipt, entry, target) {
      const present = values(target?.effects).some(effect => flag(effect, effectFlag)?.opId === receipt.id);
      return present ? `${entry.name}: removes ${entry.tag?.label ?? "the effect"}.` : `${entry.name}: ${entry.tag?.label ?? "the effect"} is already gone; nothing to remove.`;
    }
  };

  /** A branch-validated AK5e flag only, never an arbitrary document update. */
  KINDS.flag = {
    async apply(source, useId, entry, target) {
      need(/^flags\.ak5e\.[A-Za-z0-9_.-]+$/.test(entry.path) && !entry.path.split(".").some(key => ["__proto__", "constructor", "prototype"].includes(key)), "Invalid AK5e flag operation.");
      const done = record(target, source, useId); if (done) return done;
      const before = getPath(target, entry.path);
      const applied = { before: clone(before), beforePresent: before !== undefined, after: clone(entry.value) };
      await target.update({ [entry.path]: clone(entry.value), [`flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}`]: applied });
      return applied;
    },
    async revert(source, useId, entry, target) {
      const applied = record(target, source, useId); if (!applied) return { removed: 0 };
      if (!sameValue(getPath(target, entry.path), applied.after)) return { preserved: true };
      await target.update({ [applied.beforePresent ? entry.path : deletePath(entry.path)]: applied.beforePresent ? clone(applied.before) : null,
        [`flags.ak5e.${appliedFlag}.${appliedKey(source, useId)}`]: null });
      return { removed: 1 };
    },
    preview(source, receipt, entry, target) {
      const applied = record(target, source, receipt.id);
      return !applied ? `${entry.name}: nothing recorded to restore.` : sameValue(getPath(target, entry.path), applied.after)
        ? `${entry.name}: restores ${entry.path}.` : `${entry.name}: preserves ${entry.path}, which changed later.`;
    }
  };

  async function applyTargetChange(source, useId, entry, target) {
    if (entry.saveId) {
      const receipt = readState(source).undo.find(use => use.id === useId);
      const save = receipt?.saves?.find(save => save.id === entry.saveId && save.uuid === entry.uuid && save.resolved);
      need(save, "This target change requires its owner's recorded saving throw.");
      const message = globalThis.fromUuidSync?.(save.messageUuid);
      const author = message?.author ?? message?.user;
      const outcome = nativeSaveOutcome(message, source, receipt, save, typeof author === "string" ? author : author?.id);
      need(outcome.total === save.total && outcome.success === save.success, "The recorded save outcome no longer matches its native roll.");
    }
    return KINDS[entry.kind].apply(source, targetUseId(useId, entry), entry, target);
  }
  async function revertTargetChange(source, useId, entry, target) { return KINDS[entry.kind].revert(source, targetUseId(useId, entry), entry, target); }

  /**
   * GM-client half of the relay: only a change recorded in the source Actor's own receipt can be applied or reversed.
   * A receipt lives in a flag its owner can write, so before applying, the use's plan must re-check the recorded change
   * with `plan.validateTarget(source, receipt, entry, target)` (for example a heal no larger than its dice). A plan
   * without one cannot change other players' Creatures through the relay.
   */
  async function relayedTargetChange(source, command, data, user = game.user) {
    need(["apply", "revert"].includes(command), `Unknown relayed ${label} change.`);
    const receipt = readState(source).undo.find(entry => entry.id === data.useId);
    need(receipt, `No recorded ${label} use matches this relayed change.`);
    const entry = receipt.targets?.find(change => change.uuid === data.targetUuid && (data.targetKey === undefined ? !change.key : change.key === data.targetKey));
    need(entry && KINDS[entry.kind], "That Creature is not part of the recorded use.");
    // Kinds that only ever change the source's own documents are never relayed (their owner always applies them).
    need(!KINDS[entry.kind].local, "That change is never applied through the GM relay.");
    if (command === "apply") need(receipt.status !== "undone" && entry.ready, "That change is not ready to apply.");
    else need(!isLocked(receipt) || user.isGM, "This use is locked: its encounter window has ended.");
    const target = await globalThis.fromUuid(entry.uuid);
    if (!target && command === "revert") return { missing: true };
    need(target?.documentName === targetDocument(entry), "The target no longer exists.");
    if (command === "apply") need(PLANS[receipt.command]?.validateTarget?.(source, receipt, entry, target) === true, "The recorded change is not one this use can make.");
    return command === "apply" ? applyTargetChange(source, receipt.id, entry, target) : revertTargetChange(source, receipt.id, entry, target);
  }
  const relay = createOperationKernel({
    label: `${label} target change`, stateFlag: `${ns}Relay`, requestFlag: `${ns}RelayRequest`, responseFlag: `${ns}RelayResponse`,
    receiptFlag: `${ns}RelayReceipts`, benefitFlag: `${ns}RelayBenefit`, rollFlag: `${ns}RelayRoll`, tagPreset: "custom",
    getState: actor => ({ operations: [], ...structuredClone(flag(actor, `${ns}Relay`) ?? {}) }),
    isMember,
    perform: async (actor, command, data, _op, state, user) => {
      await relayedTargetChange(actor, command, data, user);
      state.operations = state.operations.slice(-60);
      return state;
    }
  });
  async function changeTarget(source, receipt, entry, command) {
    const target = await globalThis.fromUuid(entry.uuid);
    if (!target && command === "revert") return { missing: true };   // a deleted target leaves nothing to revert
    need(target?.documentName === targetDocument(entry), "The target no longer exists.");
    if (canWrite(target)) return command === "apply" ? applyTargetChange(source, receipt.id, entry, target) : revertTargetChange(source, receipt.id, entry, target);
    if (!game.users?.activeGM) throw new NoGM("No GM is connected.");
    await relay.submit(source, command, { useId: receipt.id, targetUuid: entry.uuid, ...(entry.key ? { targetKey: entry.key } : {}), confirmation: true }, `${receipt.id}-${command[0]}-${opaqueKey(`${entry.uuid}:${entry.key ?? ""}`)}`);
    entry.relayed = true;
    return command === "apply" ? record(target, source, targetUseId(receipt.id, entry)) ?? true : null;
  }

  /* ---------------------------------------------------------------- cards and the use lifecycle */

  function cardHtml(receipt) {
    const lines = [`<p>${receipt.html ? receipt.summary : esc(receipt.summary)}</p>`];
    for (const instruction of receipt.manualSteps ?? []) lines.push(`<p><strong>Manual step:</strong> ${esc(instruction)}</p>`);
    for (const save of receipt.saves ?? []) lines.push(`<p>${esc(save.name ?? "Target")}: ${esc(save.ability.toUpperCase())} save DC ${esc(save.dc)}${save.resolved ? ` — ${save.success ? "success" : "failure"} (${esc(save.total)})` : " — awaiting its owner's roll"}.</p>`);
    if (receipt.overridden?.length) lines.push(`<p><strong>Used anyway:</strong> ${receipt.overridden.map(esc).join(" ")}</p>`);
    if (receipt.reading) lines.push(`<p><strong>Player's reading for this use (no GM ruling):</strong> ${esc(receipt.reading)}</p>`);
    for (const shortfall of receipt.shortfalls ?? []) lines.push(`<p><strong>${esc(shortfall)}.</strong></p>`);
    if (receipt.status === "pending") lines.push(`<p><strong>Not applied yet:</strong> ${esc(receipt.lastError ?? "no GM is connected")}. Retry this use from the panel.</p>`);
    if (receipt.status === "awaitingNativeRoll") lines.push("<p><strong>Armed:</strong> complete the matching native roll to consume this benefit. Canceling the roll leaves it armed.</p>");
    if (receipt.targets?.some(entry => entry.relayed)) lines.push("<p>Applied by the GM's client.</p>");
    if (receipt.reaction?.requested && receipt.reaction.spent === false) lines.push("<p><strong>No Reaction was available.</strong> The action continued because the warning was overridden.</p>");
    return lines.join("");
  }
  async function useCard(actor, receipt, kind = "use") {
    const id = kind === "use" ? receipt.id : `${receipt.id}-${kind}`;
    const existing = values(game.messages).find(message => flag(message, operationFlag) === id && flag(message, actorFlag) === actor.uuid);
    const title = kind === "undo" ? `Undone: ${receipt.title}` : kind === "roll" ? `${receipt.title}: result` : receipt.title;
    const body = kind === "undo" ? `<p>${esc(receipt.undoneByName ?? game.user.name)} undid this use.${receipt.undoNotes?.length ? ` ${receipt.undoNotes.map(esc).join(" ")}` : ""}</p>`
      : kind === "roll" ? (receipt.targets.filter(entry => KINDS[entry.kind]?.rollText).map(entry => `<p>${esc(KINDS[entry.kind].rollText(entry))}</p>`).join("")
        || (receipt.rollParts?.length ? `<p>${esc(`${receipt.rollLabel ?? "Damage"} rolled: ${receipt.roll} (${receipt.rollParts.map(part => `${part.total} ${part.type}`).join(", ")}). Apply it with the native damage controls on the roll card.`)}</p>` : ""))
        + (receipt.targets.some(entry => entry.relayed) ? "<p>Applied by the GM's client.</p>" : "")
        : cardHtml(receipt);
    const data = { speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<h3>${esc(title)}</h3>${body}`,
      flags: { ak5e: { [operationFlag]: id, [actorFlag]: actor.uuid, ...(kind === "use" ? { [cardFlag]: { actorUuid: actor.uuid, useId: receipt.id,
        saves: (receipt.saves ?? []).map(save => ({ ...clone(save), available: !save.afterRoll || receipt.roll !== undefined })),
        ...(publicSnapshot && receipt.resolution ? { snapshot: { command: receipt.command, data: clone(receipt.data), resolution: clone(receipt.resolution) } } : {}) } } : {}) } } };
    if (existing) {
      if (kind === "use" && existing.update) await existing.update(data);
      return existing;
    }
    await ChatMessage.implementation.create(data);
  }
  async function finish(actor, useId) {
    const state = readState(actor), receipt = state.undo.find(entry => entry.id === useId);
    if (!receipt) throw new Error(`No recorded ${label} use matches this operation.`);
    // The confirmed plan is persisted before any returned resource/flag updates are
    // committed. Reapplying these absolute values after an interrupted write is safe.
    if (receipt.preparedUpdates && !receipt.updatesApplied) {
      receipt.status = "applying";
      receipt.updatesApplied = true;
      try { await save(actor, state, receipt.preparedUpdates); }
      catch (error) {
        receipt.updatesApplied = readState(actor).undo.find(entry => entry.id === useId)?.updatesApplied === true;
        receipt.status = "pending";
        receipt.lastError = String(error.message).replace(/\.$/, "");
        await save(actor, state);
        await useCard(actor, receipt);
        throw new Error(`Not applied yet: ${receipt.lastError}. The use is recorded; retry it from the panel.`);
      }
    }
    if (receipt.reaction?.requested && !receipt.reaction.spent) {
      try {
        const reaction = receipt.reaction;
        reaction.receiptId ??= `playuse_${ns}_${receipt.id}`;
        const spent = await spendReaction(actor, { triggerId: reaction.triggerId, receipt: reaction.receiptId,
          tags: reaction.tags ?? [], perTrigger: reaction.perTrigger ?? true, pool: reaction.pool ?? "auto" });
        reaction.spent = spent.ok === true;
        reaction.reason = spent.ok ? null : spent.reason;
        await save(actor, state);
      } catch (error) {
        receipt.status = "pending";
        receipt.lastError = String(error.message).replace(/\.$/, "");
        await save(actor, state);
        await useCard(actor, receipt);
        throw new Error(`Not applied yet: ${receipt.lastError}. The use is recorded; retry it from the panel.`);
      }
    }
    for (const entry of receipt.targets ?? []) {
      if (!entry.ready || entry.applied) continue;
      try {
        // Persist an attempted target write too: a crash between an embedded
        // effect and its acknowledgement must remain undoable.
        entry.attempted = true;
        await save(actor, state);
        entry.applied = (await changeTarget(actor, receipt, entry, "apply")) ?? true;
      }
      catch (error) {
        receipt.status = "pending"; receipt.lastError = error instanceof NoGM ? "no GM is connected" : String(error.message).replace(/\.$/, "");
        await save(actor, state); await useCard(actor, receipt);
        throw new Error(`Not applied yet: ${receipt.lastError}. The use is recorded; retry it from the panel${error instanceof NoGM ? " when a GM is connected" : ""}.`);
      }
    }
    receipt.status = receipt.saves?.some(entry => !entry.resolved && (!entry.afterRoll || receipt.roll !== undefined)) ? "awaitingSave" : receipt.nativePending ? "awaitingNativeRoll"
      : receipt.targets?.some(entry => !entry.ready) || (receipt.damageParts?.length && receipt.roll === undefined) || (receipt.formula && receipt.roll === undefined) ? "awaitingRoll" : "complete"; receipt.lastError = null;
    await save(actor, state);
    await useCard(actor, receipt);
    return receipt.result;
  }
  const ruled = (actor, key) => { const value = ruling(actor, key); return value === null ? undefined : value; };
  /** Inspect a use without calling apply, evaluating dice, or writing documents. */
  function preview(actor, name, data = {}) {
    need(actor?.isOwner && !actor.pack && isMember(actor), `Choose an owned, configured ${label}.`);
    need(Object.hasOwn(PLANS, name), `Unknown ${label} command.`);
    const plan = PLANS[name](actor, readState(actor), data);
    const readings = [];
    if (plan.reading) {
      const offered = READINGS[plan.reading];
      need(offered, "This feature's source reading is not registered.");
      const value = ruled(actor, plan.reading);
      readings.push({ key: plan.reading, ...clone(offered), ...(value === undefined ? {} : { value, source: "ruling" }) });
    }
    const targets = plan.previewTargets ?? plan.targets ?? (data.targetUuid ? [{ uuid: data.targetUuid, name: data.targetName ?? "Target" }] : []);
    return { title: plan.title ?? name, costs: clone(plan.costs ?? []), targets: clone(targets), warnings: clone(plan.warnings ?? []), readings };
  }

  /** Accept only a native save message made by this target's owner; never trust a supplied success flag. */
  function nativeSaveOutcome(message, source, receipt, save, userId) {
    const marker = flag(message, "playSave"), target = globalThis.fromUuidSync?.(save.uuid);
    const author = message?.author ?? message?.user ?? game.users?.get?.(userId);
    const authorId = typeof author === "string" ? author : author?.id;
    const owner = typeof author === "object" ? author : game.users?.get?.(authorId);
    need(target && owner && authorId === userId && (owner.isGM || target.testUserPermission?.(owner, "OWNER")), "Only the target's owner may resolve this save.");
    const roll = message?.rolls?.[0], native = message?.flags?.dnd5e?.roll;
    need(message?.documentName === "ChatMessage" && marker?.ns === ns && marker.sourceUuid === source.uuid
      && marker.useId === receipt.id && marker.saveId === save.id && marker.targetUuid === target.uuid
      && native?.type === "save" && native.ability === save.ability && message.speaker?.actor === target.id
      && Number.isFinite(roll?.total), "The save must be this target's matching native saving throw.");
    return { targetUuid: target.uuid, saveId: save.id, total: Number(roll.total), success: Number(roll.total) >= save.dc, messageUuid: message.uuid };
  }
  async function handleSaveMessage(message, _options, userId) {
    const marker = flag(message, "playSave");
    if (marker?.ns !== ns) return;
    const actor = globalThis.fromUuidSync?.(marker.sourceUuid);
    if (!actor || !isMember(actor)) return;
    const activeGM = game.users?.activeGM;
    if (activeGM ? activeGM.id !== game.user.id : !actor.isOwner) return;
    return serial(actor, async () => {
      const state = readState(actor), receipt = state.undo.find(entry => entry.id === marker.useId);
      need(receipt && receipt.status !== "undone", "The save's feature use is no longer active.");
      const save = receipt.saves?.find(entry => entry.id === marker.saveId && entry.uuid === marker.targetUuid);
      need(save && !isLocked(receipt), "That save does not belong to an active encounter-window use.");
      if (save.resolved) return receipt.result;
      need(!save.afterRoll || receipt.roll !== undefined, "Roll this feature's damage before resolving its damage-triggered save.");
      const outcome = nativeSaveOutcome(message, actor, receipt, save, userId);
      const before = clone(state.data);
      Object.assign(save, outcome, { resolved: true });
      const plan = PLANS[receipt.command](actor, state, receipt.data, receipt.id);
      need(typeof plan.resolveSave === "function", "This feature does not resolve saving throws.");
      await plan.resolveSave(actor, receipt, state, outcome);
      rememberData(receipt, before, state.data);
      await saveStateAndFinish(actor, state, receipt);
      return receipt.result;
    });
  }
  async function saveStateAndFinish(actor, state, receipt) {
    await save(actor, state);
    await finish(actor, receipt.id);
  }
  async function completeNativeRoll(actor, data, requester = game.user) {
    need(actor?.isOwner && !actor.pack && isMember(actor), `Choose an owned, configured ${label}.`);
    return serial(actor, async () => {
      const state = readState(actor), receipt = state.undo.find(entry => entry.id === data.useId);
      if (receipt?.nativeRoll?.chatMessageUuid === data.chatMessageUuid) return receipt.result;
      need(receipt?.status === "awaitingNativeRoll" && receipt.nativePending === true, "No matching native roll is awaiting resolution.");
      const message = globalThis.fromUuidSync?.(data.chatMessageUuid) ?? game.messages?.get?.(String(data.chatMessageUuid ?? "").split(".").at(-1));
      need(message?.documentName === "ChatMessage" && message.uuid === data.chatMessageUuid && message.flags?.dnd5e?.roll?.type === "damage",
        "The native roll ChatMessage is missing or is not a Damage Roll.");
      const validator = PLANS[receipt.command]?.validateNativeMessage;
      need(typeof validator === "function" && validator(actor, receipt, message, requester) === true,
        "This ChatMessage does not match the armed native roll and its owner.");
      const marker = flag(message, "vanguardTipDamage");
      const target = receipt.targets?.find(entry => entry.kind === marker.kind && entry.effectId === marker.effectId);
      need(target && !target.ready, "The armed benefit target is missing or already consumed.");
      target.ready = true; receipt.nativePending = false;
      receipt.nativeRoll = { kind: marker.kind, effectId: marker.effectId, chatMessageUuid: message.uuid };
      receipt.undoNotes = [...(receipt.undoNotes ?? []), "The native Damage Roll remains in chat after undo."];
      await save(actor, state);
      return finish(actor, receipt.id);
    });
  }
  /**
   * Run one use. Warnings throw `PlayWarnings` until overridden; a missing ruling throws `PlayReading` with the
   * readings; both happen before anything is written. Commands `useRoll` and `undoUse` act on a recorded receipt.
   */
  async function command(actor, name, data = {}, operationId = globalThis.foundry?.utils?.randomID?.(), requester = game.user) {
    need(actor?.isOwner && !actor.pack && isMember(actor), `Choose an owned, configured ${label}.`);
    need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(operationId), "A stable operation ID is required.");
    if (name === "undoUse") return serial(actor, () => undoUse(actor, data, requester));
    if (name === "useRoll") return serial(actor, () => useRoll(actor, data));
    if (name === "nativeRollComplete") return completeNativeRoll(actor, data, requester);
    need(Object.hasOwn(PLANS, name), `Unknown ${label} command.`);
    need(data.confirmed === true, "Confirm this use before applying it.");
    return serial(actor, async () => {
      const state = readState(actor), existing = state.undo.find(entry => entry.id === operationId);
      if (existing) {
        need(existing.command === name, "That operation ID belongs to a different use.");
        if (existing.status === "pending" || existing.status === "applying") return finish(actor, existing.id);
        if (existing.status !== "undone") await useCard(actor, existing); // A card lost to an interruption is posted once.
        return existing.result;
      }
      const plan = PLANS[name](actor, state, data, operationId);
      const overridden = requireOverrides(plan.warnings, data.overrides);
      let reading = null;
      if (plan.reading) {
        const offered = READINGS[plan.reading];
        const value = ruled(actor, plan.reading);
        reading = resolveReading(value === undefined ? undefined : value, data.readings?.[plan.reading] ?? data.reading, plan.reading, offered.label, offered.options);
      }
      const receipt = { id: operationId, command: name, title: plan.title, userId: requester.id, epoch: currentEpoch(), createdAt: Date.now(), status: "applying",
        data: structuredClone(data), overridden: overridden.map(warning => warning.text), targets: [],
        reading: reading?.source === "player" ? READINGS[plan.reading].options.find(option => option.value === reading.value)?.label ?? String(reading.value) : null };
      const beforeData = clone(state.data);
      receipt.saves = clone(plan.saves ?? []);
      receipt.manualSteps = clone(plan.manualSteps ?? []);
      // Remembered so useRoll rebuilds the plan only for a use that resolves its roll: a plan's validation (for example
      // "has loaded Munitions to fire") must not be re-run against state the use itself has already consumed.
      if (typeof plan.resolveRoll === "function") receipt.resolvesRoll = true;
      const updates = await plan.apply(state, receipt, reading?.value) ?? {};
      rememberData(receipt, beforeData, state.data);
      prepareFlagChanges(actor, receipt, updates);
      // Encounter receipts stay available for the whole current window, even when a table records more than 60 uses.
      state.undo = [...state.undo, receipt];
      // Persist a recoverable plan before spending resources or applying its flags.
      await save(actor, state);
      return finish(actor, receipt.id);
    });
  }
  /** The owner (or a GM) rolls a use's dice from its card; the stored result is then applied. */
  async function useRoll(actor, data) {
    const state = readState(actor), receipt = state.undo.find(entry => entry.id === data.useId);
    need(receipt?.formula, "Choose a use that is waiting for its roll.");
    need(receipt.status !== "undone", "That use was undone.");
    if (receipt.status === "complete") return receipt.result;
    if (receipt.roll === undefined && receipt.damageParts?.length) {
      // Typed Damage for native application (for example a Munitions volley): one D&D5e damage roll per Damage type.
      const DamageRoll = globalThis.CONFIG?.Dice?.DamageRoll ?? Roll, data = actor.getRollData?.() ?? {};
      const rolls = [];
      for (const part of receipt.damageParts) rolls.push(await new DamageRoll(part.formula, data, { type: part.type, types: [part.type] }).evaluate());
      receipt.roll = rolls.reduce((sum, roll) => sum + Number(roll.total), 0);
      receipt.rollParts = rolls.map((roll, index) => ({ type: receipt.damageParts[index].type, total: roll.total }));
      await save(actor, state);
      await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: receipt.rollFlavor ?? receipt.title, rolls,
        flags: { dnd5e: { roll: { type: "damage" } }, ak5e: { [operationFlag]: `${receipt.id}-dice`, [actorFlag]: actor.uuid } } });
    } else if (receipt.roll === undefined) {
      const roll = await new Roll(receipt.formula, actor.getRollData?.() ?? {}).evaluate();
      receipt.roll = roll.total;
      for (const entry of receipt.targets) if (!entry.ready) { entry.ready = true; (KINDS[entry.kind]?.rolled ?? (e => { e.amount = roll.total; }))(entry, roll.total); }
      await save(actor, state);
      await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: receipt.rollFlavor ?? receipt.title,
        flags: { ak5e: { [operationFlag]: `${receipt.id}-dice`, [actorFlag]: actor.uuid } } });
    }
    // A command may deterministically turn a persisted owner-clicked roll into
    // its next receipt stage (for example Tip's table result, then a separate
    // Temporary HP roll). The callback lives in the registered plan, never in
    // serialized Actor state. Replaying an interrupted resolution is safe because
    // the callback is pure and its marker is saved with the transformed receipt.
    const resolver = receipt.resolvesRoll ? PLANS[receipt.command]?.(actor, state, receipt.data, receipt.id)?.resolveRoll : undefined;
    if (!receipt.rollResolved && typeof resolver === "function") {
      const beforeData = clone(state.data);
      await resolver(actor, receipt, state);
      rememberData(receipt, beforeData, state.data);
      receipt.rollResolved = true;
      await save(actor, state);
    }
    const result = await finish(actor, receipt.id);
    const after = readState(actor).undo.find(item => item.id === receipt.id);
    await useCard(actor, after, "roll");
    return { ...result, roll: after.roll };
  }
  /** What undoing a use will and will not restore, shown before the user confirms. */
  function previewUndo(actor, useId) {
    const receipt = readState(actor).undo.find(entry => entry.id === useId);
    if (!receipt) return { lines: ["This use is no longer recorded."], blocked: true };
    if (receipt.status === "undone") return { lines: ["This use was already undone."], blocked: true };
    const lines = [], locked = isLocked(receipt);
    if (locked) lines.push(game.user.isGM ? "This use is from an earlier encounter window; as GM you may still undo it." : "Locked: this use's encounter window has ended.");
    for (const resource of (!receipt.preparedUpdates || receipt.updatesApplied ? receipt.resources ?? [] : [])) if (resource.before !== resource.after)
      lines.push(resource.before > resource.after ? `Restores ${resource.before - resource.after} ${resource.label}.` : `Removes the ${resource.after - resource.before} ${resource.label} it gave.`);
    for (const change of (!receipt.preparedUpdates || receipt.updatesApplied ? receipt.flagChanges ?? [] : [])) {
      if (sameValue(getPath(actor, change.path), change.after)) lines.push(`Restores ${change.path.replace(/^flags\.ak5e\./, "")} to its prior value.`);
      else lines.push(`Won't restore ${change.path.replace(/^flags\.ak5e\./, "")}: its value changed after this use.`);
    }
    if (receipt.reaction?.spent) {
      const current = getReactions(actor), active = current.receipts?.[receipt.reaction.receiptId];
      lines.push(active ? "Restores the Reaction spent by this use." : "The Reaction has already refreshed at a Turn start; undo leaves it available.");
    }
    for (const change of receipt.dataChanges ?? []) {
      const matches = sameValue(dataValue(readState(actor).data, change), change.after);
      lines.push(matches ? `Restores feature state: ${change.path}.` : `Won't restore ${change.path}: feature state changed after this use.`);
    }
    for (const note of PLANS[receipt.command]?.undoNotes?.(actor, readState(actor), receipt) ?? []) lines.push(note);
    for (const entry of receipt.targets ?? []) {
      if (!entry.applied && !entry.attempted) { lines.push(`${entry.name}: nothing was applied yet.`); continue; }
      lines.push(KINDS[entry.kind].preview(actor, { ...receipt, id: targetUseId(receipt.id, entry) }, entry, globalThis.fromUuidSync?.(entry.uuid)));
    }
    return { lines, blocked: locked && !game.user.isGM, locked };
  }
  async function undoUse(actor, data, requester = game.user) {
    let state = readState(actor), receipt = state.undo.find(entry => entry.id === data.useId);
    need(receipt, "This use is no longer recorded.");
    if (receipt.status === "undone") return { undone: receipt.id, already: true };
    need(!isLocked(receipt) || requester.isGM, "This use is locked: its encounter window has ended.");
    // A source feature owns its resolution steps. Reverse descendants first,
    // then re-read the ledger so child undo receipts cannot be overwritten.
    const children = state.undo.filter(entry => entry.parentUseId === receipt.id && entry.status !== "undone").reverse();
    for (const child of children) await undoUse(actor, { useId: child.id }, requester);
    state = readState(actor); receipt = state.undo.find(entry => entry.id === data.useId);
    receipt.undoNotes = [...(PLANS[receipt.command]?.undoNotes?.(actor, state, receipt) ?? [])];
    for (const entry of receipt.targets ?? []) {
      if (!entry.applied && !entry.attempted) continue;
      try {
        const reverted = await changeTarget(actor, receipt, entry, "revert"); entry.applied = false; entry.attempted = false;
        if (reverted?.missing) receipt.undoNotes.push(`${entry.name} no longer exists; nothing to revert there.`);
      }
      catch (error) { throw new Error(`Not undone yet: ${error instanceof NoGM ? "no GM is connected to change the target" : error.message}.`); }
    }
    if (receipt.reaction?.spent && !receipt.reaction.refunded) {
      const result = await refundReaction(actor, { receipt: receipt.reaction.receiptId });
      if (result?.ok) receipt.reaction.refunded = true;
      else if (result?.reason === "missing") {
        receipt.reaction.refreshed = true;
        receipt.undoNotes.push("The Reaction had already refreshed at a Turn start, so it remains available.");
      } else if (result?.reason !== "nothingSpent") throw new Error("The Reaction could not be restored yet; retry this undo.");
    }
    const updates = {};
    for (const change of (!receipt.preparedUpdates || receipt.updatesApplied ? receipt.flagChanges ?? [] : [])) {
      if (sameValue(getPath(actor, change.path), change.after)) {
        if (change.beforePresent) restoreUpdate(change.path, change.before, change.after, updates);
        else updates[deletePath(change.path)] = null;
      }
      else receipt.undoNotes.push(`Won't restore ${change.path.replace(/^flags\.ak5e\./, "")}: its value changed after this use.`);
    }
    for (const resource of (!receipt.preparedUpdates || receipt.updatesApplied ? receipt.resources ?? [] : [])) {
      const pool = resource.pool && getPoolDefinition(resource.pool) ? getPool(actor, resource.pool) : null;
      const current = pool ? pool.value : Number(getPath(actor, resource.path)) || 0;
      // The exact prior value is restored, even above the maximum.
      updates[resource.path] = Math.max(0, Math.min(Math.max(pool?.max ?? resource.max ?? Infinity, resource.before), current + (resource.before - resource.after)));
    }
    const specializedUndo = PLANS[receipt.command]?.undoUpdates?.(actor, state, receipt);
    if (specializedUndo) Object.assign(updates, specializedUndo);
    for (const change of receipt.dataChanges ?? []) {
      if (sameValue(dataValue(state.data, change), change.after)) setData(state.data, change.keys ?? change.path, change.before, change.beforePresent);
      else receipt.undoNotes.push(`Won't restore ${change.path}: feature state changed after this use.`);
    }
    for (const cleanup of CLEANUPS) cleanup(state, receipt, actor);
    receipt.status = "undone"; receipt.undoneBy = requester.id; receipt.undoneByName = requester.name;
    await save(actor, state, updates);
    await useCard(actor, receipt, "undo");
    return { undone: receipt.id };
  }
  function uses(actor) {
    return readState(actor).undo.slice().reverse().map(receipt => ({ id: receipt.id, title: receipt.title, command: receipt.command, status: receipt.status,
      summary: receipt.summary?.replace(/<[^>]+>|\[\[[^\]]*\]\]/g, ""), locked: isLocked(receipt), data: receipt.data, lastError: receipt.lastError ?? null,
      formula: receipt.formula ?? null, rollLabel: receipt.rollLabel ?? null }));
  }
  function register({ plans = {}, readings = {}, targetKinds = {}, cleanup } = {}) {
    Object.assign(PLANS, plans); Object.assign(READINGS, readings); Object.assign(KINDS, targetKinds);
    if (cleanup && !CLEANUPS.includes(cleanup)) CLEANUPS.push(cleanup);
  }
  function validate(actor, name, data = {}, operationId) {
    if (["useRoll", "undoUse"].includes(name) || readState(actor).undo.some(entry => entry.id === operationId)) return;
    need(Object.hasOwn(PLANS, name), `Unknown ${label} command.`);
    const plan = PLANS[name](actor, readState(actor), data, operationId);
    requireOverrides(plan.warnings, data.overrides);
    if (plan.reading) {
      const offered = READINGS[plan.reading];
      resolveReading(ruled(actor, plan.reading), data.readings?.[plan.reading] ?? data.reading, plan.reading, offered.label, offered.options);
    }
  }
  return {
    ns, label, cardFlag, effectFlag, appliedFlag, register, command, completeNativeRoll, preview, previewUndo, uses, state: readState, serial, handleSaveMessage,
    isCommand: name => Object.hasOwn(PLANS, name) || ["useRoll", "undoUse", "nativeRollComplete"].includes(name),
    readings: () => ({ ...READINGS }),
    receipt: (actor, useId) => readState(actor).undo.find(entry => entry.id === useId) ?? null, validate,
    handleRelay: async (message, options, userId) => { await handleSaveMessage(message, options, userId); return relay.handle(message, options, userId); },
    relayedTargetChange
  };
}
