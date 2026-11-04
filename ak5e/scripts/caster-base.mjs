/**
 * Caster base class runtime (WP CBR).
 *
 * Owns the parts of the Caster that belong to no branch: the base casting context (Doublecast's
 * explicit second-cost reading and the base source warnings), the transactional base cast layer
 * (actual Arts Point debit facts, Unending, Doublecast), the base expenditure/event bookkeeping and
 * the base rest recovery. The live native facade is `caster-casting.mjs`; `caster-features.mjs` is the
 * command/registration facade and calls `registerBase({castArt})` once.
 *
 * Branch casting options are still validated by the existing public Caster context so the base layer
 * never reinterprets a branch rule. Source limits are warnings with "Use anyway" (WORKFLOW.md §3.2);
 * a missing GM ruling is the player's reading for that use and is never stored.
 */
import { casterLevel, casterBranch, casterState, casterTable } from "./caster-rules.mjs";
import { artsState, integer, quoteArt, restArtsUpdates } from "./arts-rules.mjs";
import { flag, need } from "./operation-kernel.mjs";
import { PlayReading, requireOverrides, currentEpoch, isLocked } from "./play-undo.mjs";
import { artReceiptWindow, appendArtReceipt, captureArtChanges } from "./arts-ledger.mjs";

export { getCasterSetupChoices, previewCasterSetup, applyCasterSetup } from "./caster-setup.mjs";

/** Source: Ch.3 "20th Level: Doublecast" — a second Art as part of the same Action, once per Short Rest. */
export const DOUBLE_CAST_LEVEL = 20;
export const AP_PATH = "flags.ak5e.artsPoints.value";
export const UNENDING_LEVEL = 18;
/** Commands this module owns. `caster-features.casterCommand` routes them here before branch routing. */
export const BASE_COMMANDS = Object.freeze(["unending", "doublecast"]);
/** Marks a receipt in `flags.ak5e.caster.undo` as a base use, so facade routing never confuses it with a branch use. */
const BASE = true;

/** Named readings only. A numeric AP price is never offered (OR-1, spec R10). */
export const BASE_READINGS = Object.freeze({
  unendingBasis: Object.freeze({ key: "unendingBasis", label: "How Unending reads this Arts Point expenditure", options: Object.freeze([
    { value: "actualSpend", label: "The actual Arts Points spent on this use" }]) }),
  doublecastCost: Object.freeze({ key: "doublecastCost", label: "The Arts Point cost of the second Art (Doublecast)", options: Object.freeze([
    { value: "normal", label: "Normal cost (the existing quote, including Growing Power)" },
    { value: "free", label: "Free (0 Arts Points for this use)" }]) })
});
/** Compatibility alias for the pre-existing exported reading metadata. */
export const DOUBLE_CAST_READING = BASE_READINGS.doublecastCost;

const turnOf = actor => {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return null;
  return `${combat.uuid ?? combat.id}:${combat.round}:${combat.combatant?.id ?? combat.turn}`;
};
// A retry may serialize the same immutable selections with a different key order; compare values, not
// insertion order, so only an actually changed selection counts as a malformed replay (§3.3).
const canonical = value => JSON.stringify(value ?? {}, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const sameData = (left, right) => canonical(left) === canonical(right);
const listOf = value => Array.isArray(value) ? value : [];
const undoOf = state => Array.isArray(state.undo) ? state.undo : [];
const spendsOf = state => Array.isArray(state.spends) ? state.spends : [];
const ledgerOf = actor => {
  const stored = actor?.getFlag?.("ak5e", "artReceipts") ?? actor?.flags?.ak5e?.artReceipts;
  return Array.isArray(stored) ? stored : [];
};

/** Offer one named reading; prototype keys and numeric prices are never readings (spec R10). */
function readNamed(reading, key) {
  const offered = BASE_READINGS[key];
  if (reading === undefined || reading === null || reading === "") throw new PlayReading(key, offered.label, offered.options);
  const found = offered.options.find(option => option.value === reading);
  if (!found) throw new PlayReading(key, offered.label, offered.options);
  return found.value;
}

/**
 * The base adapter's own grant projection for its source-limit probe. It mirrors the facade's
 * `casterGrant` for the fields a quote reads; the facade keeps its richer grant for live casting.
 * The base module must not import the facade (that cycle is why `registerBase` injects `castArt`).
 */
function baseGrant(actor, item) {
  const level = casterLevel(actor), state = casterState(actor);
  const stored = flag(item, "art");
  return { ...(stored && typeof stored === "object" ? stored : {}),
    caster: { level, branch: casterBranch(actor),
      maximumArtLevel: Number.isInteger(level) ? casterTable(level).maximumArtLevel : undefined,
      costOrder: state.rulings?.costOrder?.value } };
}
/**
 * Quote for the source-limit probe. The internal per-use `limitOverride` (CR2 §3.2) inspects *both*
 * source limits read-only: a strict quote throws on the first failure, which hid the second limit and
 * the AP shortfall from the confirmation loop. The option only suppresses those two checks and reports
 * them as `limitWarnings` (cap then ninth); cost, shortfall and stored state stay untouched. Other arts
 * readings (cost order, focus, an unavailable grant) still throw and stay the facade's own path.
 */
function quoteProbe(actor, item, context = {}) {
  const state = artsState(actor);
  if (!state.enabled) return null;
  const base = Number(item?.system?.level);
  if (!Number.isSafeInteger(base) || base < 0 || base > 9) return null;
  const selected = context.level === undefined ? base : Number(context.level);
  if (!Number.isSafeInteger(selected) || selected < 0 || selected > 9) return null;
  const mode = ["free", "ritual"].includes(context.mode) ? context.mode : "ap";
  return quoteArt(state, base, selected, baseGrant(actor, item),
    { mode, ...(context.overrideCost !== undefined ? { overrideCost: context.overrideCost } : {}),
      limitOverride: { level: selected, mode, keys: ["LevelCap", "NinthUsed"] } });
}

/**
 * Base cast context (spec §3.4): `{ repeat, previousCastId, warnings, overrideCost?, reading? }` plus
 * the existing branch option fields. Source limits warn; malformed input still fails.
 */
export function validateBaseContext(actor, item, input = {}) {
  need(actor?.documentName === "Actor" && actor.isOwner, "Choose a Caster character you own.");
  // The facade only reaches this layer for an owned native Art activity; require a usable Item
  // document here, not a specific `type` the branch fixtures do not always model.
  need(item && typeof item === "object" && !Array.isArray(item), "Choose a known Art.");
  need(input && typeof input === "object" && !Array.isArray(input), "The cast options must be an object.");
  const state = casterState(actor), level = casterLevel(actor), warnings = [];
  const context = { ...input };
  delete context.overrideCost; // Only the reading recorded here may set it.
  delete context.area; // Recomputed from the activity actually used.
  context.repeat = input.repeat === "doublecast" ? "doublecast" : null;
  context.previousCastId = typeof input.previousCastId === "string" && input.previousCastId ? input.previousCastId : null;
  if (context.repeat === "doublecast") {
    need(context.previousCastId, "Choose the recorded Action Art that the Doublecast follows.");
    const previous = listOf(state.casts).find(cast => cast.id === context.previousCastId);
    need(previous, "Choose a recorded Art cast to repeat.");
    if (!(Number(level) >= DOUBLE_CAST_LEVEL))
      warnings.push({ id: "doublecastLevel", text: `Doublecast is a Caster level 20 feature; this Caster is level ${level ?? 0}.` });
    if (previous.activation !== "action")
      warnings.push({ id: "doublecastActivation", text: "Doublecast follows an Art cast with a Casting Time of an Action." });
    if (!(previous.turn && previous.turn === turnOf(actor)))
      warnings.push({ id: "doublecastTurn", text: "Choose an Art cast made during your current Turn." });
    if (state.uses?.doublecast)
      warnings.push({ id: "doublecastUsed", text: "Doublecast has been used since the last Short Rest; a Short Rest restores it once." });
    const ruling = state.rulings?.doublecastCost?.value;
    if (ruling === "free" || ruling === "normal") {
      context.reading = ruling;
      if (ruling === "free") context.overrideCost = 0;
    } else {
      // A stored GM ruling wins; otherwise the player's named reading for this use only.
      const reading = readNamed(input.reading ?? input.readings?.doublecastCost, "doublecastCost");
      context.reading = reading;
      if (reading === "free") {
        context.overrideCost = 0;
        context.readingNote = "Doublecast: the second Art costs 0 AP for this use (player's reading; no GM ruling recorded).";
      } else {
        context.readingNote = "Doublecast: normal cost for the second Art this use (player's reading; no GM ruling recorded).";
      }
    }
  }
  // Source limits: maximum Art level and the once-per-Long-Rest ninth level warn, never veto, and every
  // applicable limit is reported in one review (CR2 §3.3). An AP shortfall joins them only when a
  // source-limit cast is being confirmed; an ordinary shortfall keeps its existing clamp-and-cast
  // behavior with no additional confirmation gate.
  try {
    const quote = quoteProbe(actor, item, context);
    const limitWarnings = Array.isArray(quote?.limitWarnings) ? quote.limitWarnings : [];
    warnings.push(...limitWarnings);
    if (limitWarnings.length && quote.shortfall > 0)
      warnings.push({ id: "apShortfall", text: `Not enough Arts Points for this cast: ${quote.cost} required, ${quote.shortfall} short. Use anyway to spend every remaining Arts Point.` });
  } catch (error) {
    if (error?.key === "LevelCap") warnings.push({ id: "maximumArtLevel", text: error.message });
    else if (error?.key === "NinthUsed") warnings.push({ id: "ninthLevel", text: error.message });
    // Any other quote reading (cost order, focus, an unavailable grant) stays the facade's own path.
  }
  context.warnings = warnings;
  return context;
}

/**
 * Base consumption contributes to the existing mutable `updates`/`receipt` before the branch layer:
 * it re-validates the base context and freezes the actual debit facts of this cast. The AP write and
 * the native receipt itself belong to `arts-casting`, so nothing is charged twice.
 */
export function baseConsumption(activity, usage = {}, updates = {}, receipt = {}) {
  const actor = activity?.actor, item = activity?.item;
  need(actor?.documentName === "Actor" && actor.isOwner, "Choose a Caster character you own.");
  need(item && typeof item === "object", "Choose a known Art.");
  need(updates && typeof updates === "object" && !Array.isArray(updates), "A cast update target is required.");
  need(typeof receipt?.id === "string" && receipt.id, "A cast receipt with a stable ID is required.");
  const input = { ...(usage?.ak5eCaster ?? {}) };
  if (input.mode === undefined && typeof usage?.ak5eMode === "string") input.mode = usage.ak5eMode;
  // Base source limits never re-gate a cast whose resources are already committed (§3.1).
  const context = validateBaseContext(actor, item, input);
  const ap = artsState(actor), cost = integer(receipt.cost ?? 0, "Art AP cost", 0, 99);
  const after = Math.max(0, ap.value - cost);
  receipt.before = ap.value;
  receipt.after = after;
  receipt.actualCost = ap.value - after;
  receipt.shortfall = Math.max(0, cost - ap.value);
  if (context.repeat === "doublecast") receipt.previousCastId = context.previousCastId;
  return (updates.actor ??= {});
}

/** Base bookkeeping for a committed `apSpent`/`artCast` event. Pure: the caller persists the state. */
export function applyBaseEvent(state, event) {
  need(state && typeof state === "object", "A Caster state is required.");
  if (event.kind === "apSpent") {
    const amount = event.amount === undefined ? 0 : integer(event.amount, "AP expenditure", 0, 999);
    // §3.3 freezes {actorUuid, spendId, amount}: an apSpent event without a stable operationId is
    // malformed and never enters the ledger. An idless entry would also swallow every later idless
    // event through the duplicate check.
    const operationId = typeof event.operationId === "string" && event.operationId.trim() ? event.operationId : null;
    // A zero actual debit is not an expenditure trigger (§3.3); >d6 spends are still recorded as offers.
    const recorded = amount > 0 && operationId && !spendsOf(state).some(entry => entry.id === operationId);
    if (recorded)
      state.spends = [...spendsOf(state), { id: operationId, amount, turn: event.turn ?? null, level: event.level, reason: event.reason ?? "Art cast" }].slice(-40);
    if (recorded && event.turn) {
      state.turn = state.turn?.key === event.turn ? state.turn : { key: event.turn, apSpent: 0, chargesSpent: 0 };
      state.turn.apSpent = Number(state.turn.apSpent ?? 0) + amount;
    }
  } else if (event.kind === "artCast") {
    const cast = listOf(state.casts).find(entry => entry.id === event.operationId);
    if (cast) { cast.completed = true; cast.status = "complete"; }
  }
  return state;
}

let stateSerial = null;
const serialFor = async (actor, task) => (stateSerial ??= (await import("./caster-primal-splash.mjs")).casterStateSerial)(actor, task);

/** Base event entry point (frozen facade path). One per-Actor serialized write of the base bookkeeping. */
export async function baseEvent(event) {
  need(event && typeof event === "object" && typeof event.kind === "string", "A Caster event needs a kind.");
  need(typeof event.actorUuid === "string" && event.actorUuid, "A Caster event needs an Actor.");
  const actor = globalThis.fromUuidSync?.(event.actorUuid);
  need(actor?.documentName === "Actor", "The Caster event's Actor could not be found.");
  need(actor.isOwner, "Choose a Caster character you own.");
  return serialFor(actor, async () => {
    const state = casterState(actor);
    applyBaseEvent(state, event);
    await actor.update({ "flags.ak5e.caster": state });
  });
}

/** The base portion of one rest: AP recovery (C3:151) and the once-per-Short-Rest Doublecast use. */
export function baseRestUpdates(actor, type) {
  need(["short", "long"].includes(type), "Choose a short or long rest.");
  if (!(actor?.documentName === "Actor" && actor.isOwner)) return {};
  const updates = { ...restArtsUpdates(actor, type), "flags.ak5e.caster.uses.doublecast": false };
  return updates;
}

/** Base rest entry point (frozen facade path). `casterRest` delegates here once, then applies branch state. */
export async function baseRest(actor, type) {
  need(actor?.documentName === "Actor" && actor.isOwner, "Choose a Caster character you own.");
  const updates = baseRestUpdates(actor, type);
  if (!Object.keys(updates).length) return;
  return serialFor(actor, async () => { await actor.update(updates); });
}

/* ------------------------------------------------------------------ base use plans */

function unendingPlan(actor, state, data = {}) {
  const level = casterLevel(actor), warnings = [];
  if (!(Number(level) >= UNENDING_LEVEL))
    warnings.push({ id: "unendingLevel", text: `Unending is a Caster level ${UNENDING_LEVEL} feature; this Caster is level ${level ?? 0}.` });
  const ruling = state.rulings?.unendingBasis?.value;
  let reading = null, readingNote = null;
  if (ruling === "actualSpend") reading = "actualSpend";
  else {
    reading = readNamed(data.reading ?? data.readings?.unendingBasis, "unendingBasis");
    readingNote = "Unending: this roll refunds the actual Arts Points spent on that use (player's reading; no GM ruling recorded).";
  }
  return { title: "Unending", warnings, reading, readingNote };
}

function doublecastPlan(actor, state, data = {}) {
  const warnings = [];
  if (!(Number(casterLevel(actor)) >= DOUBLE_CAST_LEVEL))
    warnings.push({ id: "doublecastLevel", text: `Doublecast is a Caster level ${DOUBLE_CAST_LEVEL} feature; this Caster is level ${casterLevel(actor) ?? 0}.` });
  const previous = listOf(state.casts).find(cast => cast.id === data.castId);
  if (!previous) throw new Error("Choose a recorded Art cast to repeat.");
  if (previous.activation !== "action") warnings.push({ id: "doublecastActivation", text: "Doublecast follows an Art cast with a Casting Time of an Action." });
  if (!(previous.turn && previous.turn === turnOf(actor))) warnings.push({ id: "doublecastTurn", text: "Choose an Art cast made during your current Turn." });
  if (state.uses?.doublecast) warnings.push({ id: "doublecastUsed", text: "Doublecast has been used since the last Short Rest; a Short Rest restores it once." });
  return { title: "Doublecast", warnings };
}

/** Build the base plan for a command. Registered at the shared `registerCasterUses` seam as functions. */
export function basePlan(command, actor, state, data = {}) {
  if (command === "unending") return unendingPlan(actor, state, data);
  if (command === "doublecast") return doublecastPlan(actor, state, data);
  throw new Error("Unknown Caster base command.");
}

/* ------------------------------------------------------------------ base commands */

function receiptFor(actor, operationId, command, data, extra = {}) {
  return { id: operationId, base: BASE, command, userId: globalThis.game?.user?.id ?? null, epoch: currentEpoch(),
    windowId: artReceiptWindow(actor).id, createdAt: Date.now(), data: structuredClone(data), actorUuid: actor.uuid, ...extra };
}

async function unendingCommand(actor, data, operationId) {
  need(data.confirmed === true, "Confirm Unending before using it.");
  need(typeof data.spendId === "string" && data.spendId, "Choose an Arts Point expenditure awaiting its Unending roll.");
  const plan = unendingPlan(actor, casterState(actor), data);
  const overridden = requireOverrides(plan.warnings, data.overrides).map(warning => warning.text);
  return serialFor(actor, async () => {
    const state = casterState(actor);
    const existing = undoOf(state).find(entry => entry.id === operationId && entry.base === BASE);
    if (existing) {
      need(existing.command === "unending" && sameData(existing.data, data),
        "Retry with the same operation ID and the exact recorded choices; a changed selection is a malformed replay.");
      return existing.result ?? { awaitingRoll: existing.status !== "complete", formula: "1d6", spendId: existing.spendId };
    }
    const spend = spendsOf(state).find(entry => entry.id === data.spendId);
    need(spend, "Choose an Arts Point expenditure awaiting its Unending roll.");
    need(Number.isSafeInteger(spend.amount) && spend.amount > 0, "Unending applies to a positive Arts Point expenditure.");
    need(!spend.unendingUseId, "That Arts Point expenditure already has a recorded Unending use.");
    need(spend.refundRoll === undefined, "That Arts Point expenditure's Unending roll is already resolved.");
    const receipt = receiptFor(actor, operationId, "unending", data, { title: "Unending", status: "awaitingRoll",
      spendId: spend.id, overridden, reading: plan.readingNote, result: { awaitingRoll: true, formula: "1d6", spendId: spend.id } });
    const nextUndo = [...undoOf(state), receipt];
    const nextSpends = spendsOf(state).map(entry => entry.id === spend.id ? { ...entry, unendingUseId: operationId } : entry);
    await actor.update({ "flags.ak5e.caster.undo": nextUndo, "flags.ak5e.caster.spends": nextSpends });
    return { ...receipt.result };
  });
}

/**
 * Record (or clear) the Unending refund on the established Caster receipt that made the spend, so
 * that receipt's own undo never restores AP Unending already returned. `apRefunded` is the field the
 * shared preview/undo already subtracts; no second AP inverse is created (§3.3).
 */
function markMirrorRefund(receipts, spendId, useId, refunded) {
  const mirror = listOf(receipts).find(entry => entry.id === spendId && entry.id !== useId && entry.caster?.pool);
  if (!mirror) return;
  if (Number(refunded) > 0) {
    mirror.apRefunded = Number(refunded);
    mirror.caster.pool.refunds = [...new Set([...(Array.isArray(mirror.caster.pool.refunds) ? mirror.caster.pool.refunds : []), useId])];
  } else {
    delete mirror.apRefunded;
    if (Array.isArray(mirror.caster.pool.refunds)) mirror.caster.pool.refunds = mirror.caster.pool.refunds.filter(id => id !== useId);
  }
}

async function useRollCommand(actor, data) {
  const useId = data?.useId;
  need(typeof useId === "string" && useId, "Choose a Caster use that is waiting for its roll.");
  return serialFor(actor, async () => {
    let state = casterState(actor);
    let receipt = undoOf(state).find(entry => entry.id === useId && entry.base === BASE);
    need(receipt, "Choose a Caster use that is waiting for its roll.");
    need(receipt.command === "unending", "This use has no roll to make.");
    need(receipt.status !== "undone", "That use was undone.");
    // §3.1/R13: combat start locks preceding receipts, and the waiting roll obeys the same encounter
    // window as undoUse. The receipt already stores windowId/epoch; the roll path must honor it.
    const window = artReceiptWindow(actor);
    need(!receipt.windowId || receipt.windowId === window.id, "This Unending use belongs to a previous encounter window and is locked.");
    need(!isLocked(receipt), "This Unending use belongs to a previous encounter window and is locked.");
    if (receipt.roll === undefined) {
      const roll = await new Roll("1d6", actor.getRollData?.() ?? {}).evaluate();
      const total = Number(roll.total);
      need(Number.isSafeInteger(total) && total >= 1 && total <= 6, "The Unending die must be a d6.");
      const rolled = undoOf(state).map(entry => entry.id === receipt.id ? { ...entry, roll: total, status: "rolled" } : entry);
      await actor.update({ "flags.ak5e.caster.undo": rolled });
      // The formula/result are durable before any refund (§3.3): a failure below retries without rerolling.
      await roll.toMessage?.({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: "Unending: 1d6" });
      state = casterState(actor);
      receipt = undoOf(state).find(entry => entry.id === useId && entry.base === BASE);
      need(receipt, "This use is no longer recorded.");
    }
    if (receipt.status === "complete" && receipt.result?.roll !== undefined) return { ...receipt.result };
    const spend = spendsOf(state).find(entry => entry.id === receipt.spendId);
    need(spend, "Choose an Arts Point expenditure awaiting its Unending roll.");
    const refunded = Number(receipt.roll) === Number(spend.amount) ? Number(spend.amount) : 0;
    const updates = {};
    if (refunded > 0) updates[AP_PATH] = artsState(actor).value + refunded;
    const nextUndo = undoOf(state).map(entry => entry.id === receipt.id
      ? { ...entry, refunded, status: "complete", result: { roll: receipt.roll, refunded } } : entry);
    const nextSpends = spendsOf(state).map(entry => entry.id === receipt.spendId
      ? { ...entry, refundRolled: true, refundRoll: receipt.roll, refundedBy: receipt.id } : entry);
    // Net-spend semantics for the established Caster receipt (branch or native): its own undo must
    // never restore AP that Unending already refunded (§3.3).
    if (refunded > 0) markMirrorRefund(nextUndo, receipt.spendId, receipt.id, refunded);
    // One canonical inverse per resource change: the refund AP and its signed linked child commit
    // together, and only when the roll actually refunded something (§3.3).
    const ledger = ledgerOf(actor);
    if (refunded > 0 && ledger.some(parent => parent.id === receipt.spendId)) {
      const child = { id: `${receipt.spendId}-unending`, parentReceiptId: receipt.spendId, useId: receipt.id,
        command: "unendingRefund", title: "Unending refund", source: "unending", spendId: receipt.spendId,
        amount: -refunded, signed: -refunded, items: [] };
      const changes = captureArtChanges(actor, updates);
      updates["flags.ak5e.artReceipts"] = appendArtReceipt(actor, child, changes);
    }
    await actor.update({ ...updates, "flags.ak5e.caster.undo": nextUndo, "flags.ak5e.caster.spends": nextSpends });
    return { roll: receipt.roll, refunded };
  });
}

async function undoUseCommand(actor, data) {
  const useId = data?.useId;
  need(typeof useId === "string" && useId, "Choose a Caster use to undo.");
  return serialFor(actor, async () => {
    const state = casterState(actor);
    const receipt = undoOf(state).find(entry => entry.id === useId && entry.base === BASE);
    need(receipt, "This use is no longer recorded.");
    if (receipt.status === "undone") return { undone: receipt.id, already: true };
    const window = artReceiptWindow(actor);
    need(!receipt.windowId || receipt.windowId === window.id, "This use belongs to a previous encounter window and is locked.");
    need(!isLocked(receipt), "This use belongs to a previous encounter window and is locked.");
    need(receipt.command === "unending", "This use cannot be undone here.");
    const refunded = Number(receipt.refunded ?? 0), updates = {};
    const ledger = ledgerOf(actor);
    // §3.3 forbids subtracting a refund twice: when the canonical child receipt that owns this refund
    // is already undone, the AP inverse is already reversed and must be skipped here.
    const child = ledger.find(entry => entry.parentReceiptId === receipt.spendId && entry.useId === receipt.id);
    if (refunded > 0 && child?.status !== "undone") updates[AP_PATH] = Math.max(0, artsState(actor).value - refunded);
    const nextUndo = undoOf(state).map(entry => entry.id === receipt.id
      ? { ...entry, status: "undone", undoneBy: globalThis.game?.user?.id ?? null, undoneAt: Date.now() } : entry);
    // Undo restores the exact before-state of the expenditure: the claim and the persisted roll are
    // removed, so the source spend is again available for a fresh, independent Unending use.
    const nextSpends = spendsOf(state).map(entry => {
      if (entry.id !== receipt.spendId) return entry;
      const { unendingUseId, refundRolled, refundRoll, refundedBy, ...rest } = entry;
      return rest;
    });
    markMirrorRefund(nextUndo, receipt.spendId, receipt.id, 0);
    // Preserve an already-undone linked child's own undo record; only available children are reversed here.
    const linked = ledger.filter(entry => entry.status !== "undone" && (entry.parentReceiptId === receipt.spendId || entry.useId === receipt.id));
    if (linked.length) updates["flags.ak5e.artReceipts"] = ledger.map(entry =>
      linked.includes(entry) ? { ...entry, status: "undone", undoneBy: globalThis.game?.user?.id ?? null } : entry);
    await actor.update({ ...updates, "flags.ak5e.caster.undo": nextUndo, "flags.ak5e.caster.spends": nextSpends });
    return { undone: receipt.id };
  });
}

/** The cast callback is injected by `registerBase({castArt})`; the dynamic fallback keeps direct test use working. */
let registeredCastArt = null;
export function setBaseCastArt(castArt) {
  if (typeof castArt === "function" && !registeredCastArt) registeredCastArt = castArt;
}
export const basePlans = Object.freeze({
  unending: (actor, state, data) => basePlan("unending", actor, state, data),
  doublecast: (actor, state, data) => basePlan("doublecast", actor, state, data)
});

async function doublecastCommand(actor, data, operationId) {
  need(data.confirmed === true, "Confirm Doublecast before using it.");
  need(typeof data.castId === "string" && data.castId, "Choose the recorded Action Art that the Doublecast follows.");
  need(typeof data.itemId === "string" && data.itemId, "Choose the second Art to cast with Doublecast.");
  if (data.level !== undefined) integer(data.level, "Doublecast Art level", 0, 9);
  const item = actor.items?.get?.(data.itemId);
  need(item?.type === "spell", "Choose a known Art.");
  // Stage 1 (serialized): replay an immutable receipt or persist the intent before any mutation.
  const prepared = await serialFor(actor, async () => {
    const state = casterState(actor);
    const existing = undoOf(state).find(entry => entry.id === operationId && entry.base === BASE);
    if (existing) {
      need(existing.command === "doublecast" && sameData(existing.data, data),
        "Retry with the same operation ID and the exact recorded choices; a changed selection is a malformed replay.");
      if (existing.status === "complete") return { done: existing.result ?? {} };
      // Retry only the unfinished stage: if the native second Art already committed, finalize the base
      // receipt with it and never run the native use again (§3.3/R12). Identity is the recorded first
      // Art, the chosen second Art and its level — never merely the latest cast.
      const committed = listOf(state.casts).find(cast => cast.id !== data.castId && cast.itemId === data.itemId
        && cast.context?.repeat === "doublecast" && cast.context?.previousCastId === data.castId
        && (data.level === undefined || Number(cast.level) === Number(data.level))
        && cast.status !== "failed");
      if (committed) {
        const finalized = undoOf(state).map(entry => entry.id === operationId && entry.base === BASE
          ? { ...entry, status: "complete", result: committed } : entry);
        await actor.update({ "flags.ak5e.caster.undo": finalized });
        return { done: committed };
      }
      return { resume: true };
    }
    // New attempt: source prerequisites are checked (and warned) before a receipt exists. The
    // once-per-Short-Rest limit is one of those warnings (spec R7): an unrelated pending operation or
    // an already spent use never hard-vetoes the player, it surfaces "Use anyway". A confirmed use
    // therefore proceeds, and only an unconfirmed one is refused by `requireOverrides` (no write).
    const plan = doublecastPlan(actor, state, data);
    const overridden = requireOverrides(plan.warnings, data.overrides).map(warning => warning.text);
    const receipt = receiptFor(actor, operationId, "doublecast", data, { title: "Doublecast", status: "applying", overridden });
    await actor.update({ "flags.ak5e.caster.undo": [...undoOf(state), receipt] });
    return { receipt };
  });
  if (prepared.done !== undefined) return prepared.done;
  // Stage 2: the native second Art runs OUTSIDE the per-Actor serial, because the native use
  // reacquires that same serial itself (§3.3: no nested lock around a callback that reacquires it).
  const options = { mode: "ap", level: data.level, repeat: "doublecast", previousCastId: data.castId,
    ...(data.reading !== undefined ? { reading: data.reading } : {}), ...(data.overrides ? { overrides: data.overrides } : {}) };
  const cast = registeredCastArt ?? (await import("./caster-casting.mjs")).castCasterArt;
  const result = await cast(actor, data.itemId, options);
  // Stage 3 (serialized): record the outcome, or discard the intent when the native use was canceled.
  return serialFor(actor, async () => {
    const state = casterState(actor);
    const receipt = undoOf(state).find(entry => entry.id === operationId && entry.base === BASE);
    const cancelled = !result || result.cancelled === true || result === false;
    const finalUndo = undoOf(state).filter(entry => entry.id !== operationId);
    if (!cancelled) finalUndo.push({ ...(receipt ?? receiptFor(actor, operationId, "doublecast", data)), status: "complete", result });
    await actor.update({ "flags.ak5e.caster.undo": finalUndo });
    return result;
  });
}

/**
 * One base command. Ownership and confirmation are checked here; a retry with the same operation ID
 * replays the recorded outcome and never rerolls, respends or re-expends a use.
 */
export async function baseCommand(actor, command, data = {}, operationId = globalThis.foundry?.utils?.randomID?.()) {
  need(actor?.documentName === "Actor" && actor.isOwner && !actor.pack, "Choose an owned Caster.");
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(operationId), "A stable operation ID is required.");
  need(data && typeof data === "object" && !Array.isArray(data), "The command options must be an object.");
  if (command === "unending") return unendingCommand(actor, data, operationId);
  if (command === "doublecast") return doublecastCommand(actor, data, operationId);
  if (command === "useRoll") return useRollCommand(actor, data);
  if (command === "undoUse") return undoUseCommand(actor, data);
  need(false, "Unknown Caster base command.");
}
