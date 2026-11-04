/**
 * The Defender branches' table-play use engine (play-uses.mjs, WORKFLOW.md §3.2): Guardian and Fortress register their
 * plans here. Receipts live in `flags.ak5e.defenderUses`; GM rulings are read from the Defender state's `rulings`.
 *
 * The seven base commands (SPEC §3.4) are registered here too: their plans are pure, charge actual resource deltas,
 * spend a Reaction through the engine's own phase, and project the legacy `flags.ak5e.defender` state and operation
 * entry through the additive `projectDefenderBaseUse` helper. The command boundary adds an immutable-input check on
 * this class only; the shared engine's semantics are untouched.
 */
import { createPlayUses, spendResource } from "./play-uses.mjs";
import {
  defenderEnabled, ownTurn, primaryToken, projectDefenderBaseUse, defenderBaseProjectionKey
} from "./defender-features.mjs";
import {
  defenderState, defenderLevel, defenderProfile, shelterCost, indestructibleReduction, leapingRange,
  SHELTER_FEET, IMPROVED_SHELTER_FEET
} from "./defender-rules.mjs";
import { need, flag, opaqueKey, keyedSerial } from "./operation-kernel.mjs";
import { refundReaction, spendReaction, getReactions } from "./trigger-events.mjs";
import { getPool } from "./resource-pools.mjs";

export const defenderUses = createPlayUses({
  ns: "defenderUses", label: "Defender", isMember: actor => defenderEnabled(actor),
  ruling: (actor, key) => {
    const record = defenderState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. A recorded ruling replaces the player's per-use reading. */
export async function recordDefenderRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Defender rulings.");
  const reading = defenderUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.defender.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return defenderState(actor).rulings[key];
}

/**
 * "Expend 1 Resilience to refund use of your Reaction" (Protector Impenetrable, Sentry Advance and Fire): the Reaction a
 * recorded use spent comes back. Undo spends it again (a new spend, so the refund cannot be used for a free Reaction);
 * if no Reaction is left to spend by then, the undo says so. Applied only on the Defender's own client.
 */
defenderUses.register({ targetKinds: { reactionRefund: {
  local: true,
  async apply(_source, useId, entry, target) {
    const key = opaqueKey(useId), done = flag(target, defenderUses.appliedFlag)?.[key];
    if (done) return done;
    const result = await refundReaction(target, { receipt: entry.receiptId });
    const record = { refunded: result?.ok === true && !result.replayed };
    await target.update({ [`flags.ak5e.${defenderUses.appliedFlag}.${key}`]: record });
    return record;
  },
  async revert(_source, useId, entry, target) {
    const key = opaqueKey(useId), record = flag(target, defenderUses.appliedFlag)?.[key];
    let respent = null;
    if (record?.refunded) respent = await spendReaction(target, { triggerId: `${entry.triggerId ?? entry.receiptId}:refund-undone:${useId}`, perTrigger: false, receipt: `${entry.receiptId}_undo_${useId}` });
    await target.update({ [`flags.ak5e.${defenderUses.appliedFlag}.${key}`]: null });
    return { respent: respent?.ok === true };
  },
  preview(_source, receipt, _entry, target) {
    const record = flag(target, defenderUses.appliedFlag)?.[opaqueKey(receipt.id)];
    return record?.refunded ? "Spends the refunded Reaction again (if one is available)." : "No Reaction was refunded; nothing to spend again.";
  }
} } });

/* ================================================================== base use plans (WP defender-base-03) */

const BASE_COMMANDS = Object.freeze(["shelter", "endShelter", "leapingDefence", "leapingRefund", "indestructible", "restoreIndestructible", "resilience"]);
const BASE = new Set(BASE_COMMANDS);
const BASE_PROJECTION_FLAG = "defenderUsesBaseProjection";

const baseText = value => typeof value === "string" ? value.trim() : "";
const baseWarn = (list, id, text) => list.push({ id, text });
const requireText = (value, message) => { need(typeof value === "string" && value.trim().length > 0, message); return value.trim(); };
const finiteNumber = (value, message) => { need(typeof value === "number" && Number.isFinite(value), message); return value; };
const positiveWhole = (value, message) => { need(typeof value === "number" && Number.isInteger(value) && value > 0, message); return value; };
const optionalAmount = value => (value === undefined || value === null || value === "" ? null : finiteNumber(value, "Enter a numeric amount."));
const resilienceAvailable = actor => getPool(actor, "resilience").value;
const reactionAvailable = actor => getReactions(actor).available ?? 0;

/** True when the base use's own plan is allowed to change this target: only the owning source Actor, only base data. */
const projectionValidator = command => (source, receipt, entry, target) =>
  Boolean(entry && receipt && entry.kind === "defenderBaseProjection" && entry.key === "base" && entry.command === command &&
    entry.baseUseId === receipt.id && receipt.command === command && source?.uuid && entry.uuid === source.uuid && target?.uuid === source.uuid);

/**
 * The local projection intent. `applied` marks the entry as owned by the base adapter (the shared engine must not
 * resolve it as a foreign document); `projectDefenderBaseUse` performs the write on this same Actor.
 */
const projectionEntry = (actor, useId, command) => ({ uuid: actor.uuid, name: actor.name ?? "Defender", kind: "defenderBaseProjection",
  key: "base", ready: true, applied: true, deferred: "baseProjection", command, baseUseId: useId });

const shelterRadiusFor = (actor, anchorPoint) => {
  const profile = defenderProfile(actor), level = defenderLevel(actor);
  return anchorPoint && profile.branch === "protector" && Number.isInteger(level) && level >= 4 ? IMPROVED_SHELTER_FEET : SHELTER_FEET;
};

/** Shelter (C3:991-994): Action, or a Bonus Action for 1 Resilience. Self is never protected, allies are declared. */
function shelterPlan(actor, _state, data, useId) {
  const warnings = [];
  let cost;
  try { cost = shelterCost(data?.activation); } catch { throw new Error("Shelter is taken as an Action, or as a Bonus Action for 1 Resilience."); }
  need(Array.isArray(data?.allies) && data.allies.every(ally => typeof ally === "string" && ally.trim().length > 0),
    "Choose the allied Creatures (distinct tokens) that Shelter protects.");
  need(new Set(data.allies.map(ally => ally.trim())).size === data.allies.length, "Choose each allied Creature once.");
  const own = primaryToken(actor);
  if (game?.combat?.started && !ownTurn(actor)) baseWarn(warnings, "shelterTurn", "Shelter normally takes your Action during your own Turn.");
  if (data?.alliesConfirmed !== true) baseWarn(warnings, "shelterAlly", "Confirm that every chosen Creature is an ally; geometry never decides allegiance.");
  if (!own && data?.positionConfirmed !== true) baseWarn(warnings, "shelterPosition", "Place the Defender's token on the scene, or confirm positions at the table.");
  const allies = data.allies.map(ally => ally.trim()).filter(ally => !own?.uuid || ally !== own.uuid);
  if (!allies.length) baseWarn(warnings, "shelterEmpty", "Choose at least one allied Creature other than the Defender.");
  if (cost.resilience && resilienceAvailable(actor) < cost.resilience) baseWarn(warnings, "shelterShortfall", "Use Resilience you do not have; the cost is clamped at zero.");
  const radius = shelterRadiusFor(actor, data?.anchorPoint === true);
  const instruction = `Until the beginning of your next Turn, Attacks against these allied Creatures within ${radius} feet of you are made at Disadvantage (checked when the Attack is rolled).${radius > SHELTER_FEET ? " Improved Shelter: they also have Advantage on Strength and Dexterity Saving Throws against effects you can see." : ""} Outside combat, choose End Shelter when it ends.`;
  return {
    title: "Shelter", warnings, costs: cost.resilience ? [{ label: "Resilience", amount: cost.resilience }] : [],
    validateTarget: projectionValidator("shelter"), validateRevert: projectionValidator("shelter"),
    apply(_next, receipt) {
      const updates = {};
      if (cost.resilience) Object.assign(updates, spendResource(actor, receipt, { pool: "resilience", amount: cost.resilience, label: "Resilience (Shelter as a Bonus Action)" }));
      receipt.targets = [projectionEntry(actor, useId, "shelter")];
      receipt.summary = `Shelter (${cost.resilience ? "Bonus Action" : "Action"}): ${allies.length} allied Creature${allies.length === 1 ? "" : "s"} protected within ${radius} feet.`;
      receipt.manualSteps = [instruction];
      receipt.result = { activation: data.activation, allies, radius, instruction };
      return updates;
    }
  };
}

/** End Shelter (B-086): clears only this Defender's own Shelter, including outside combat. */
function endShelterPlan(actor, _state, _data, useId) {
  const warnings = [];
  if (!defenderState(actor).shelter?.active) baseWarn(warnings, "endShelterNone", "No Shelter of yours is active; this use changes nothing.");
  return {
    title: "End Shelter", warnings, costs: [],
    validateTarget: projectionValidator("endShelter"), validateRevert: projectionValidator("endShelter"),
    apply(_next, receipt) {
      receipt.targets = [projectionEntry(actor, useId, "endShelter")];
      receipt.summary = "End Shelter: your own Shelter ends.";
      receipt.result = { ended: true };
      return {};
    }
  };
}

/** Leaping Defence (C3:1028-1034): one Reaction against a named Attack; the table applies the guided move and hit. */
function leapingPlan(actor, _state, data, useId) {
  const warnings = [];
  const attackId = requireText(data?.attackId, "Name the Attack this Reaction responds to.");
  const level = defenderLevel(actor);
  if (!(level >= 11)) baseWarn(warnings, "leapLevel", "Leaping Defence requires Defender level 11.");
  if (data?.attackConfirmed !== true) baseWarn(warnings, "leapAttack", "Confirm that an Attack hit an allied Creature you can see.");
  const range = leapingRange(Number(actor.system?.attributes?.movement?.walk ?? 0));
  if (data?.rangeConfirmed !== true) baseWarn(warnings, "leapRange", `Confirm the ally is within ${range} feet (half your Speed).`);
  if (data?.moveConfirmed !== true) baseWarn(warnings, "leapMove", "Confirm you have moved to an unoccupied space within 5 feet of the ally (no Opportunity Attacks).");
  if (flag(actor, "reactionBudget")?.triggers?.[attackId]) baseWarn(warnings, "leapTrigger", "A Reaction was already spent against that Attack; there is no silent second spend.");
  if (reactionAvailable(actor) < 1) baseWarn(warnings, "leapReaction", "No Reaction is available; the use is recorded without spending one.");
  const instructions = [
    "You move to an unoccupied space within 5 feet of that ally; this movement does not provoke Opportunity Attacks.",
    "You are now the target of that Attack, which hits you regardless of your Armour Class.",
    `Apply its Damage to ${actor.name}; a Critical Hit follows the original roll${level >= 20 ? " unless Adamantine Defence downgrades it" : ""}.`
  ];
  if (level >= 17) instructions.push("Stand Behind Me: that ally may move up to 15 feet; this movement does not provoke Opportunity Attacks and must end farther from the Attacking Creature.");
  instructions.push("You may expend 1 Resilience to regain your Reaction (Leaping Refund).");
  return {
    title: "Leaping Defence", warnings, costs: [],
    validateTarget: projectionValidator("leapingDefence"), validateRevert: projectionValidator("leapingDefence"),
    apply(_next, receipt) {
      receipt.reaction = { requested: true, triggerId: attackId, receiptId: `leaping_${useId}`, tags: ["leapingDefence"], perTrigger: true, pool: "auto" };
      receipt.targets = [projectionEntry(actor, useId, "leapingDefence")];
      receipt.summary = `Leaping Defence: you become the target of that Attack${level >= 17 ? " (Stand Behind Me available)" : ""}.`;
      receipt.manualSteps = instructions;
      receipt.result = { attackId, instructions, reactionReceiptId: `leaping_${useId}` };
      return {};
    }
  };
}

/**
 * One refund marker's own re-spent receipt, only when that marker was recorded for this exact parent. The persisted
 * marker is the authority: a refund receipt whose stored data was later relinked to another Leap must never donate
 * its residual Reaction to that other parent's lineage (SPEC §3.4: bind every pointer to parent and child marker).
 */
function refundMarkerSpend(markers, child, parentId) {
  const reaction = markers?.[defenderBaseProjectionKey(child.id, "base")]?.reaction ?? null;
  if (!reaction || reaction.parentOperationId !== parentId) return null;
  return typeof reaction.undoSpendReceiptId === "string" && reaction.undoSpendReceiptId ? reaction.undoSpendReceiptId : null;
}

/**
 * Every Reaction receipt one Leaping Defence's line still knows about, oldest first: the spend the parent recorded,
 * the parent operation's effective pointer, then each undone refund's re-spend. Reversing the list lets a new refund
 * claim the newest receipt that is still in the budget and not yet refunded (SPEC §3.4: a later refund refers to the
 * actual spend), so undoing a refund never strands the Reaction it re-spent.
 */
function leapSpendCandidates(actor, parentId, parent) {
  const legacy = defenderState(actor).operations.find(operation => operation && (operation.id === parentId || operation.baseUseId === parentId));
  const markers = flag(actor, BASE_PROJECTION_FLAG) ?? {};
  const candidates = [];
  if (parent?.reaction?.receiptId) candidates.push(parent.reaction.receiptId);
  const marked = [];
  for (const child of defenderUses.state(actor).undo) {
    if (child.command !== "leapingRefund") continue;
    const reaction = markers[defenderBaseProjectionKey(child.id, "base")]?.reaction ?? null;
    if (!reaction || reaction.parentOperationId !== parentId) continue;
    if (typeof reaction.receiptId === "string" && reaction.receiptId) marked.push(reaction.receiptId);
    const spent = refundMarkerSpend(markers, child, parentId);
    if (spent) marked.push(spent);
  }
  // A stored effective pointer counts only when a recorded child marker of this parent still names it.
  const pointer = typeof legacy?.baseReactionReceiptId === "string" ? legacy.baseReactionReceiptId : null;
  if (pointer && marked.includes(pointer)) candidates.push(pointer);
  candidates.push(...marked);
  return [...new Set(candidates)];
}

/** The receipt a Leaping Refund must target: the parent's current effective spend, not merely its original receipt. */
function effectiveLeapReceiptId(actor, parentId, parent) {
  const candidates = leapSpendCandidates(actor, parentId, parent);
  const records = getReactions(actor).receipts ?? {};
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const record = records[candidates[index]];
    if (record && record.refunded !== true) return candidates[index];
  }
  return candidates[candidates.length - 1] ?? `leaping_${parentId}`;
}

/** Leaping Refund (C3:1031,1033-1034): 1 Resilience for the exact parent's Reaction; a reset receipt never mints one. */
function leapingRefundPlan(actor, _state, data, useId) {
  const warnings = [];
  const leapOperationId = requireText(data?.leapOperationId, "Choose the Leaping Defence to refund.");
  const parent = defenderUses.receipt(actor, leapOperationId);
  const legacy = parent ? null : defenderState(actor).operations.find(operation => operation && (operation.id === leapOperationId || operation.baseUseId === leapOperationId));
  need(parent || legacy, "The selected Leaping Defence is not recorded.");
  if (parent) need(parent.command === "leapingDefence" && parent.status === "complete", "Choose a completed Leaping Defence.");
  else need(legacy.command === "leapingDefence" && legacy.status === "complete", "Choose a completed Leaping Defence.");
  const receiptId = effectiveLeapReceiptId(actor, leapOperationId, parent);
  const record = getReactions(actor).receipts?.[receiptId];
  need(record, "The selected Leaping Defence has no Reaction receipt to refund; it already refreshed or its budget was reset.");
  const refundable = record.refunded !== true;
  if (!refundable) baseWarn(warnings, "leapRefunded", "That Reaction was already regained; this attempt changes nothing and costs nothing.");
  if (refundable && resilienceAvailable(actor) < 1) baseWarn(warnings, "leapRefundShortfall", "Use 1 Resilience you do not have; the cost is clamped at zero.");
  return {
    title: "Leaping Refund", warnings, costs: refundable ? [{ label: "Resilience", amount: 1 }] : [],
    validateTarget: projectionValidator("leapingRefund"), validateRevert: projectionValidator("leapingRefund"),
    apply(_next, receipt) {
      const updates = {};
      if (refundable) Object.assign(updates, spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience (regain Reaction)" }));
      receipt.targets = [projectionEntry(actor, useId, "leapingRefund")];
      receipt.summary = refundable ? `Leaping Refund: 1 Resilience regains the Reaction from ${leapOperationId}.` : "Leaping Refund: that Reaction was already regained; nothing changes.";
      receipt.manualSteps = [refundable ? "The Reaction spent by that Leaping Defence is available again." : "No Reaction is regained; the previous refund still applies."];
      receipt.result = { leapOperationId, receiptId, refunded: refundable };
      return updates;
    }
  };
}

/** Indestructible (C3:1042-1045, C1:207-209): the once-per-Short-Rest pool plus a Reaction; doubles the supplied DR. */
function indestructiblePlan(actor, _state, data, useId) {
  const warnings = [];
  const damageId = requireText(data?.damageId, "Name the instance of Damage this Reaction responds to.");
  const reduction = finiteNumber(data?.reduction, "Enter the Damage Reduction you currently have against this Damage.");
  need(reduction >= 0, "Damage Reduction must be zero or more.");
  const amount = optionalAmount(data?.amount);
  if (amount !== null) need(amount >= 0, "Enter a Damage amount of zero or more.");
  const level = defenderLevel(actor);
  if (!(level >= 18)) baseWarn(warnings, "indestructibleLevel", "Indestructible requires Defender level 18.");
  if (data?.hostileConfirmed !== true) baseWarn(warnings, "indestructibleHostile", "Confirm that the Damage is the result of a hostile action.");
  const pool = getPool(actor, "indestructible");
  if (pool.value < 1) baseWarn(warnings, "indestructibleSpent", "Indestructible is spent; finish a Short Rest or restore it with 2 Resilience during your Turn.");
  if (reactionAvailable(actor) < 1) baseWarn(warnings, "indestructibleReaction", "No Reaction is available; the use is recorded without spending one.");
  const doubled = indestructibleReduction(reduction);
  const instruction = reduction === 0
    ? "You have no Damage Reduction against this Damage, so doubling it changes nothing."
    : `Use ${doubled} Damage Reduction against this instance of Damage.`;
  return {
    title: "Indestructible", warnings, costs: [],
    validateTarget: projectionValidator("indestructible"), validateRevert: projectionValidator("indestructible"),
    apply(_next, receipt) {
      const updates = {};
      Object.assign(updates, spendResource(actor, receipt, { pool: "indestructible", amount: 1, label: "Indestructible" }));
      receipt.reaction = { requested: true, triggerId: damageId, receiptId: `indestructible_${useId}`, tags: ["indestructible"], perTrigger: true, pool: "auto" };
      receipt.targets = [projectionEntry(actor, useId, "indestructible")];
      receipt.summary = `Indestructible: ${doubled} Damage Reduction against that instance of Damage.`;
      receipt.manualSteps = [instruction];
      receipt.result = { reduction, doubledReduction: doubled, reductionType: baseText(data?.type) || null, amount, instruction };
      return updates;
    }
  };
}

/** Restore Indestructible (C3:1045): 2 Resilience restores only the normal pool availability. */
function restoreIndestructiblePlan(actor, _state, _data, useId) {
  const warnings = [];
  const level = defenderLevel(actor);
  if (!(level >= 18)) baseWarn(warnings, "restoreLevel", "Indestructible requires Defender level 18.");
  if (game?.combat?.started && !ownTurn(actor)) baseWarn(warnings, "restoreTurn", "Restore Indestructible during your own Turn.");
  const pool = getPool(actor, "indestructible");
  const restore = pool.value < pool.max;
  if (!restore) baseWarn(warnings, "restoreAvailable", "Indestructible is already available; there is nothing to restore.");
  if (restore && resilienceAvailable(actor) < 2) baseWarn(warnings, "restoreShortfall", "Use 2 Resilience you do not have; the cost is clamped at zero.");
  return {
    title: "Restore Indestructible", warnings, costs: restore ? [{ label: "Resilience", amount: 2 }] : [],
    validateTarget: projectionValidator("restoreIndestructible"), validateRevert: projectionValidator("restoreIndestructible"),
    apply(_next, receipt) {
      const updates = {};
      if (restore) {
        Object.assign(updates, spendResource(actor, receipt, { pool: "resilience", amount: 2, label: "Resilience (restore Indestructible)" }));
        const current = getPool(actor, "indestructible");
        const after = Math.min(current.max, current.value + 1);
        (receipt.resources ??= []).push({ pool: "indestructible", path: "flags.ak5e.resourcePools.indestructible.value",
          before: current.value, after, max: current.max, label: "Indestructible (restored)" });
        updates["flags.ak5e.resourcePools.indestructible.value"] = after;
      }
      receipt.targets = [projectionEntry(actor, useId, "restoreIndestructible")];
      receipt.summary = restore ? "Restore Indestructible: 2 Resilience restores its normal use." : "Restore Indestructible: it is already available; nothing changes.";
      receipt.result = { restored: restore };
      return updates;
    }
  };
}

/** Resilience adjustment: an actual, bounded pool delta with a recorded reason. */
function resiliencePlan(actor, _state, data, useId) {
  const warnings = [];
  const mode = data?.mode;
  need(mode === "spend" || mode === "refund", "Choose spend or refund.");
  const amount = positiveWhole(data?.amount, "Change Resilience by a positive whole number.");
  need(typeof data?.reason === "string" && data.reason.trim().length >= 3, "Record a reason for this Resilience change.");
  const pool = getPool(actor, "resilience");
  if (mode === "spend" && amount > pool.value) baseWarn(warnings, "resilienceShortfall", "Not enough Resilience; the cost is clamped at zero and the actual change is recorded.");
  if (mode === "refund" && pool.value >= pool.max) baseWarn(warnings, "resilienceFull", "Resilience is already at its maximum; the refund is clamped.");
  else if (mode === "refund" && amount > pool.max - pool.value) baseWarn(warnings, "resilienceClamp", "The refund is clamped at the current maximum.");
  return {
    title: mode === "spend" ? "Spend Resilience" : "Refund Resilience", warnings, costs: [{ label: "Resilience", amount }],
    validateTarget: projectionValidator("resilience"), validateRevert: projectionValidator("resilience"),
    apply(_next, receipt) {
      const updates = {};
      if (mode === "spend") Object.assign(updates, spendResource(actor, receipt, { pool: "resilience", amount, label: "Resilience" }));
      else {
        const current = getPool(actor, "resilience");
        const after = Math.min(current.max, current.value + amount);
        (receipt.resources ??= []).push({ pool: "resilience", path: "flags.ak5e.resourcePools.resilience.value",
          before: current.value, after, max: current.max, label: "Resilience" });
        updates["flags.ak5e.resourcePools.resilience.value"] = after;
      }
      receipt.targets = [projectionEntry(actor, useId, "resilience")];
      receipt.summary = `${mode === "spend" ? "Spend" : "Refund"} ${amount} Resilience: ${data.reason.trim()}.`;
      receipt.result = { mode, amount, reason: data.reason.trim() };
      return updates;
    }
  };
}

const BASE_PLANS = Object.freeze({ shelter: shelterPlan, endShelter: endShelterPlan, leapingDefence: leapingPlan,
  leapingRefund: leapingRefundPlan, indestructible: indestructiblePlan, restoreIndestructible: restoreIndestructiblePlan, resilience: resiliencePlan });

/* ---------------------------------------------------------------- projection target kind */

function validatedReceipt(source, entry, target) {
  const receipt = entry?.baseUseId ? defenderUses.receipt(source, entry.baseUseId) : null;
  need(receipt && BASE.has(receipt.command), "The recorded projection is not one this use can make.");
  need(entry.kind === "defenderBaseProjection" && entry.key === "base" && entry.command === receipt.command,
    "The recorded projection is not one this use can make.");
  need(Boolean(source?.uuid) && entry.uuid === source.uuid && target?.uuid === source.uuid,
    "A base use only ever projects onto its own Defender.");
  return receipt;
}

/** The exact-parent Reaction refund (C3:1031,1033-1034). The helper never touches the budget; this callback owns it. */
async function refundLeapParentReaction(actor, receipt, entry) {
  const key = defenderBaseProjectionKey(receipt.id, entry.key ?? "base");
  const markerPath = `flags.ak5e.${BASE_PROJECTION_FLAG}.${key}`;
  const stored = flag(actor, BASE_PROJECTION_FLAG)?.[key] ?? null;
  const parentId = baseText(receipt.data?.leapOperationId);
  const claim = stored?.reaction ?? null;
  // A stored claim for another parent is stale/forged (relinked data): it proves nothing here, so resolve afresh.
  if (claim && claim.parentOperationId === parentId && ["complete", "already", "missing"].includes(claim.status)) return claim;
  const parent = defenderUses.receipt(actor, parentId);
  const legacy = parent ? null : defenderState(actor).operations.find(operation => operation && (operation.id === parentId || operation.baseUseId === parentId));
  need(parent || legacy, "The selected Leaping Defence is not recorded.");
  const receiptId = effectiveLeapReceiptId(actor, parentId, parent);
  const record = getReactions(actor).receipts?.[receiptId];
  if (!record) {
    await actor.update({ [`${markerPath}.reaction`]: { parentOperationId: parentId, receiptId, actuallyRefunded: false,
      undoSpendReceiptId: null, status: "missing" } });
    return { status: "missing", actuallyRefunded: false };
  }
  if (record.refunded) {
    const ours = Boolean(claim && claim.parentOperationId === parentId && claim.receiptId === receiptId &&
      claim.status === "claiming" && claim.priorRefunded === false);
    const reaction = { parentOperationId: parentId, receiptId, actuallyRefunded: ours, undoSpendReceiptId: null, status: ours ? "complete" : "already" };
    await actor.update({ [`${markerPath}.reaction`]: reaction });
    return reaction;
  }
  await actor.update({ [`${markerPath}.reaction`]: { parentOperationId: parentId, receiptId, actuallyRefunded: false,
    undoSpendReceiptId: null, status: "claiming", priorRefunded: false } });
  const result = await refundReaction(actor, { receipt: receiptId });
  const reaction = { parentOperationId: parentId, receiptId, actuallyRefunded: result?.ok === true && result?.replayed !== true,
    undoSpendReceiptId: null, status: "complete", reason: result?.reason ?? null };
  await actor.update({ [`${markerPath}.reaction`]: reaction });
  return reaction;
}

async function applyBaseProjection(source, _useId, entry, target) {
  const receipt = validatedReceipt(source, entry, target);
  if (receipt.command === "leapingRefund") await refundLeapParentReaction(source, receipt, entry);
  return projectDefenderBaseUse(source, { useId: receipt.id, command: receipt.command, data: receipt.data, result: receipt.result });
}

async function revertBaseProjection(source, _useId, entry, target) {
  const receipt = validatedReceipt(source, entry, target);
  return projectDefenderBaseUse(source, { useId: receipt.id, command: receipt.command, data: receipt.data }, { revert: true });
}

defenderUses.register({
  plans: BASE_PLANS,
  targetKinds: { defenderBaseProjection: {
    local: true, documentName: "Actor",
    apply: applyBaseProjection, revert: revertBaseProjection,
    preview(_source, receipt, entry) {
      return entry.command === "leapingRefund"
        ? "Reverses this refund and spends the regained Reaction again if one is still available."
        : `Reverses the legacy Defender state and operation recorded by ${receipt.title ?? "this base use"}.`;
    }
  } }
});

/* ---------------------------------------------------------------- base command boundary */

const clonePlain = value => (value === undefined ? null : structuredClone(value));

/** The narrow immutable feature data of one base command; confirmation, overrides and readings never take part. */
function normalizedBaseData(name, data = {}) {
  const value = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  switch (name) {
    case "shelter":
      return { activation: baseText(value.activation),
        allies: [...new Set((Array.isArray(value.allies) ? value.allies : []).filter(ally => typeof ally === "string").map(ally => ally.trim()).filter(Boolean))].sort(),
        alliesConfirmed: value.alliesConfirmed === true, positionConfirmed: value.positionConfirmed === true,
        anchorPoint: value.anchorPoint === true, tokenUuid: baseText(value.tokenUuid) };
    case "endShelter":
    case "restoreIndestructible":
      return {};
    case "leapingDefence":
      return { attackId: baseText(value.attackId), allyTokenUuid: baseText(value.allyTokenUuid),
        attackConfirmed: value.attackConfirmed === true, rangeConfirmed: value.rangeConfirmed === true, moveConfirmed: value.moveConfirmed === true };
    case "leapingRefund":
      return { leapOperationId: baseText(value.leapOperationId) };
    case "indestructible":
      return { damageId: baseText(value.damageId), reduction: finiteNumber(value.reduction, "Enter the Damage Reduction as a number."),
        amount: value.amount === undefined || value.amount === null || value.amount === "" ? null : finiteNumber(value.amount, "Enter the Damage amount as a number."),
        type: baseText(value.type), hostileConfirmed: value.hostileConfirmed === true };
    case "resilience":
      return { mode: baseText(value.mode), amount: finiteNumber(value.amount, "Change Resilience by a number."), reason: baseText(value.reason) };
    default:
      return {};
  }
}

const baseSerial = keyedSerial();
const CORE_COMMAND = defenderUses.command.bind(defenderUses);

/** Project a completed base receipt. Replays converge; a pending projection is retried by the next same-ID call. */
async function projectBaseUse(actor, useId) {
  const receipt = defenderUses.receipt(actor, useId);
  if (!receipt || !BASE.has(receipt.command) || receipt.status !== "complete") return;
  const entry = receipt.targets?.find(target => target?.kind === "defenderBaseProjection" && target?.baseUseId === useId);
  if (!entry) return;
  try { await applyBaseProjection(actor, useId, entry, actor); }
  catch (error) { throw new Error(`Projection not applied yet: ${String(error.message).replace(/\.$/, "")}. Retry this use.`); }
}

/**
 * A base refund's own undo re-spends the Reaction it actually regained, with a stable receipt, unless the parent use is
 * already undone or no Reaction is available (a reset never mints one).
 */
async function respendRefundedReaction(actor, receipt, entry) {
  const key = defenderBaseProjectionKey(receipt.id, entry.key ?? "base");
  const path = `flags.ak5e.${BASE_PROJECTION_FLAG}.${key}.reaction`;
  const claim = flag(actor, BASE_PROJECTION_FLAG)?.[key]?.reaction ?? null;
  if (!claim?.actuallyRefunded || claim.status === "undone") return {};
  const parentId = claim.parentOperationId;
  // The marker must belong to the parent this child receipt declares; a relinked child re-spends nothing.
  if (parentId !== baseText(receipt.data?.leapOperationId)) {
    await actor.update({ [`${path}.status`]: "undone", [`${path}.undoSpendReceiptId`]: null, [`${path}.skipped`]: "parentMismatch" });
    return {};
  }
  const parent = defenderUses.receipt(actor, parentId);
  const legacy = parent ? null : defenderState(actor).operations.find(operation => operation && (operation.id === parentId || operation.baseUseId === parentId));
  const active = parent ? parent.status !== "undone" : Boolean(legacy && legacy.status !== "undone");
  if (!active) {
    await actor.update({ [`${path}.status`]: "undone", [`${path}.undoSpendReceiptId`]: null });
    return {};
  }
  // A turn-start refresh clears the budget's receipts: the Reaction the refund regained no longer exists to re-spend,
  // so record the skipped restoration instead of charging the fresh window's Reaction (SPEC §3.4, never fabricated).
  const records = getReactions(actor).receipts ?? {};
  if (typeof claim.receiptId !== "string" || !claim.receiptId || !Object.hasOwn(records, claim.receiptId)) {
    await actor.update({ [`${path}.status`]: "undone", [`${path}.undoSpendReceiptId`]: null, [`${path}.skipped`]: "reset" });
    return {};
  }
  const spendReceiptId = `base_refund_undo_${receipt.id}`;
  const spend = await spendReaction(actor, { triggerId: `leapingDefence:undo:${receipt.id}`, tags: ["leapingDefence"],
    perTrigger: false, receipt: spendReceiptId });
  if (spend?.ok) {
    await actor.update({ [`${path}.undoSpendReceiptId`]: spendReceiptId, [`${path}.status`]: "undone" });
    return { spentReceiptId: spendReceiptId };
  }
  await actor.update({ [`${path}.status`]: "undone", [`${path}.skipped`]: spend?.reason ?? "unavailable" });
  return {};
}

/** Undo of a base Leap refunds the current effective unrefunded spend; a reset or already-refunded receipt is skipped. */
async function refundEffectiveLeapReaction(actor, receipt) {
  const candidates = [];
  if (receipt.reaction?.receiptId) candidates.push(receipt.reaction.receiptId);
  const markers = flag(actor, BASE_PROJECTION_FLAG) ?? {};
  for (const child of defenderUses.state(actor).undo) {
    if (child.command !== "leapingRefund") continue;
    const spent = refundMarkerSpend(markers, child, receipt.id);
    if (spent) candidates.push(spent);
  }
  const records = getReactions(actor).receipts ?? {};
  for (const receiptId of [...candidates].reverse()) {
    const record = records[receiptId];
    if (!record || record.refunded) continue;
    const result = await refundReaction(actor, { receipt: receiptId });
    if (result?.ok) return { refunded: receiptId };
  }
  return { refunded: null };
}

/** Reverse one base receipt's local projection after the engine's own undo has run (idempotent on retry). */
async function reverseBaseUse(actor, useId, requester) {
  const receipt = defenderUses.receipt(actor, useId);
  if (!receipt || !BASE.has(receipt.command)) return;
  const entry = receipt.targets?.find(target => target?.kind === "defenderBaseProjection" && target?.baseUseId === useId)
    ?? { key: "base", uuid: actor.uuid, command: receipt.command, baseUseId: useId };
  let effectiveReceiptId = null;
  if (receipt.command === "leapingRefund") effectiveReceiptId = (await respendRefundedReaction(actor, receipt, entry)).spentReceiptId ?? null;
  else if (receipt.command === "leapingDefence") await refundEffectiveLeapReaction(actor, receipt);
  try {
    await projectDefenderBaseUse(actor, { useId, command: receipt.command, data: receipt.data },
      { revert: true, effectiveReceiptId, undoneBy: requester?.id ?? null });
  } catch (error) {
    console.error("AK5e | Defender base projection", error);
    globalThis.ui?.notifications?.error?.(`Undo could not reverse the base projection: ${error.message}`);
  }
}

/**
 * Base-only command boundary: one class-local serial queue covers the immutable-input check and the delegation, so two
 * concurrent requests cannot both miss the receipt, and a reused ID with different choices rejects before the engine's
 * completed-receipt shortcut. Untouched commands keep the engine's exact behaviour.
 */
async function baseCommand(actor, name, data = {}, operationId, requester = game.user) {
  if (name === "undoUse") {
    const useId = typeof data?.useId === "string" ? data.useId : null;
    const receipt = useId ? defenderUses.receipt(actor, useId) : null;
    const isBase = Boolean(receipt && BASE.has(receipt.command)) || Boolean(receipt?.targets?.some(target => target?.kind === "defenderBaseProjection"));
    return baseSerial(actor, async () => {
      const result = await CORE_COMMAND(actor, "undoUse", data, operationId, requester);
      if (isBase) await reverseBaseUse(actor, useId, requester);
      return result;
    });
  }
  if (!BASE.has(name)) return CORE_COMMAND(actor, name, data, operationId, requester);
  return baseSerial(actor, async () => {
    const useId = operationId ?? globalThis.foundry?.utils?.randomID?.();
    const existing = defenderUses.receipt(actor, useId);
    if (existing && existing.command === name) {
      const stored = normalizedBaseData(name, clonePlain(existing.data) ?? {});
      const requested = normalizedBaseData(name, data);
      need(JSON.stringify(stored) === JSON.stringify(requested),
        "That operation ID was already used with different choices; choose a new operation ID.");
    }
    const result = await CORE_COMMAND(actor, name, data, useId, requester);
    await projectBaseUse(actor, useId);
    return result;
  });
}

defenderUses.command = baseCommand;
