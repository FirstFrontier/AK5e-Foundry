/**
 * Vanguard table-play use engine (WORKFLOW.md §3.2, play-uses.mjs).
 * Enforces:
 *  - Confirm before use;
 *  - Non-blocking warnings with "Use anyway" overrides;
 *  - Zero-clamping on resource shortfalls;
 *  - Automatic GM relay for unowned target modifications;
 *  - Interactive roll buttons on chat cards (no auto-rolled dice);
 *  - Encounter-window undo receipts in `flags.ak5e.vanguardUses`.
 */
import { createPlayUses, warn } from "./play-uses.mjs";
import { notifyVanguardOperatorCommit, checkVanguardTipGrant, registerVanguardTipGrantSource } from "./vanguard-extensions.mjs";
import {
  vanguardEnabled, vanguardLevel, vanguardState, vanguardProfile, checkLevel,
  approachingStormBonus, landstriderSpeedBonus, flag
} from "./vanguard-rules.mjs";
import {
  hasLandstrider, hasQuickOffTheMark, hasUncannyDodge,
  hasDirectedEngagement, isDirectedEngagementActive, hasLightspeed, hasApproachingStorm,
  calculateUncannyDodge, lightspeedSecondInitiative
} from "./vanguard-features.mjs";
import { TIP_INSTRUCTIONS } from "./standard-bearer-rules.mjs";
import { TIP_OUTCOMES, attackChanges } from "./tip-of-the-spear.mjs";
import { need, opaqueKey, values, keyedSerial } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { requireOverrides, isPlayWarnings, resolveReading, isLocked } from "./play-undo.mjs";
import { applyFeatureTag, tagExpiry, tagActors, registerFeatureTagExpiryHandler } from "./feature-tags.mjs";
import { withinFeet, tokenPoint } from "./standard-bearer-rules.mjs";

export const vanguardUses = createPlayUses({
  ns: "vanguardUses",
  label: "Vanguard",
  isMember: actor => vanguardEnabled(actor),
  ruling: (actor, key) => {
    const record = vanguardState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. */
export async function recordVanguardRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Vanguard rulings.");
  const reading = vanguardUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.vanguard.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return vanguardState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = vanguardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Vanguard level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

// Tip THP has one native pool, not separable buckets. A revision is evidence of
// *any* later write, including equal-valued writes and A -> B -> A changes.
const TIP_REVISION = "tipTemporaryHpRevision";
const tipSerial = keyedSerial();
const tipHooks = new WeakSet();
const tipKey = (source, useId) => opaqueKey(`${useId}:${source.uuid}`);
const tipRecord = (source, useId, target) => flag(target, vanguardUses.appliedFlag)?.[tipKey(source, useId)];
const tempHp = target => Math.max(0, Number(target?.system?.attributes?.hp?.temp) || 0);
const tipSnapshot = target => ({ expectedTemp: tempHp(target), expectedRevision: flag(target, TIP_REVISION) ?? null });
const escTip = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Register on every client, including clients which never initiate a Tip. */
export function registerTipTemporaryHpHooks() {
  if (!globalThis.Hooks || tipHooks.has(Hooks)) return;
  tipHooks.add(Hooks);
  Hooks.on("preUpdateActor", (_actor, changes) => {
    const hasTemp = Object.hasOwn(changes, "system.attributes.hp.temp") ||
      Object.hasOwn(changes.system?.attributes?.hp ?? {}, "temp") ||
      Object.hasOwn(changes["system.attributes"]?.hp ?? {}, "temp") ||
      Object.hasOwn(changes["system.attributes.hp"] ?? {}, "temp");
    if (!hasTemp) return;
    const revision = foundry.utils.randomID();
    changes[`flags.ak5e.${TIP_REVISION}`] = revision;
    if (changes.flags?.ak5e) changes.flags.ak5e[TIP_REVISION] = revision;
    if (changes["flags.ak5e"]) changes["flags.ak5e"][TIP_REVISION] = revision;
    // Our pool write and attribution receipt are atomic. Other writes leave the
    // attribution's older revision intact and therefore make it uncertain.
    const stamp = (object, prefix = "") => {
      for (const [key, value] of Object.entries(object ?? {})) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (!value || typeof value !== "object") continue;
        if (path.startsWith(`flags.ak5e.${vanguardUses.appliedFlag}.`) && value.tipTemporaryHp === true) value.expectedRevision = revision;
        else if (path === "flags" || path.startsWith("flags.")) stamp(value, path);
      }
    };
    stamp(changes);
  });
}

function tipDeadline(source) {
  const combat = game.combat;
  if (!combat?.started || combat.turn === null || !values(combat.turns).some(turn => turn.actor?.uuid === source.uuid)) {
    return { trigger: "manual", actorUuid: source.uuid };
  }
  return tagExpiry(source, source, { trigger: "turnStart", expiryActor: "source" });
}
function crossedTipDeadline(deadline, event) {
  if (deadline?.trigger !== "turnStart" || event.kind !== "combatTurn") return false;
  const combat = event.combat, previous = combat?.previous;
  if (deadline.combatUuid !== combat?.uuid || !previous || combat.turn === null || previous.turn === null) return false;
  if (combat.round < previous.round || combat.round === previous.round && combat.turn <= previous.turn) return false;
  const index = values(combat.turns).findIndex(turn => turn.id === deadline.combatantId && turn.actor?.uuid === deadline.actorUuid);
  if (index < 0) return false;
  const before = previous.round < deadline.round || previous.round === deadline.round && previous.turn < index;
  const reached = combat.round > deadline.round || combat.round === deadline.round && combat.turn >= index;
  return before && reached;
}
const tipDeadlineText = deadline => deadline?.trigger === "turnStart"
  ? `Source's next Turn start (Round ${deadline.round}, ${deadline.combatUuid}).`
  : "Source's next Turn boundary outside combat: the owner must confirm a manual boundary and explain why.";

function establishedTipContribution(source, useId, target) {
  const grant = tipRecord(source, useId, target);
  if (!grant || grant.status !== "active" || grant.expectedRevision == null) return false;
  const snapshot = tipSnapshot(target);
  const overlapping = Object.values(flag(target, vanguardUses.appliedFlag) ?? {}).filter(record =>
    record?.tipTemporaryHp === true && record.status === "active");
  return overlapping.length === 1 && grant.expectedTemp === snapshot.expectedTemp &&
    grant.expectedRevision === snapshot.expectedRevision && grant.amount <= snapshot.expectedTemp;
}

// A surviving source receipt establishes the rolled grant's upper bound, not
// how much remains in the native pool. Missing target history always requires
// an explicit owner selection; this transient record is never auto-subtracted.
function reconcilableTipGrant(source, use, target, operationId) {
  if (!use || !target) return null;
  const recorded = tipRecord(source, use.id, target);
  if (recorded) return recorded;
  const entry = use.targets?.find(change => change.uuid === target.uuid && change.kind === "tipTemporaryHP");
  const amount = Number(use.roll);
  if (use.command !== "tipOfTheSpear" || use.outcome !== 2 || use.status === "undone" ||
      !["expire", "retain"].includes(use.tipTemporaryHpReading) || !entry?.ready || !entry.applied && !entry.attempted ||
      !Number.isInteger(amount) || amount < 1 || amount > 6 || entry.amount !== amount) return null;
  const settled = vanguardUses.state(source).undo.some(receipt => receipt.command === "settleTipTemporaryHp" &&
    receipt.tipUseId === use.id && receipt.id !== operationId && receipt.status === "complete");
  const sourceStatus = typeof entry.applied === "object" ? entry.applied?.status : null;
  return { tipTemporaryHp: true, sourceUuid: source.uuid, useId: use.id, amount,
    readingValue: use.tipTemporaryHpReading, deadline: structuredClone(use.tipDeadline),
    status: settled ? "settled" : sourceStatus ?? "active", missingAttribution: true };
}
async function writeTipPool(source, useId, target, grant, pool, extra = {}) {
  const revision = foundry.utils.randomID();
  const next = { ...grant, expectedTemp: pool, expectedRevision: revision };
  await target.update({ "system.attributes.hp.temp": pool, [`flags.ak5e.${TIP_REVISION}`]: revision,
    [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}`]: next, ...extra });
  return tipRecord(source, useId, target);
}

/** Public request; the source's owners use the same confirmed command/relay as every other use. */
async function offerTipReconciliation(source, use, target, explanation = "The pool changed; attribution needs owner reconciliation.") {
  const grant = reconcilableTipGrant(source, use, target), snapshot = tipSnapshot(target);
  const maximum = Math.min(grant?.amount ?? 0, snapshot.expectedTemp);
  const evidence = { actorUuid: source.uuid, useId: use.id, targetUuid: target.uuid,
    readingValue: use.tipTemporaryHpReading ?? use.readingValue, deadline: use.tipDeadline,
    min: 0, max: maximum, ...snapshot };
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: source }),
    content: `<h3>Tip temporary HP: Needs reconciliation</h3><p>${escTip(use.id)}: ${escTip(explanation)}</p><p>Reading: ${escTip(evidence.readingValue)}. ${escTip(tipDeadlineText(use.tipDeadline))}</p><p>Remaining Tip HP: 0–${maximum}. Select only the amount of this grant still attributable in the current pool (${snapshot.expectedTemp}); zero leaves the pool unchanged.</p>`,
    flags: { ak5e: { vanguardTipTemporaryHp: evidence } } });
  return evidence;
}

/**
 * Mark one receipt's Tip boundary. The active GM client owns only this field of this receipt, so the current receipt
 * list is re-read inside the Actor's serial queue (the same queue every use, roll and undo runs in) and only the
 * `undo` subtree is written: a concurrent receipt or use is never overwritten by a stale whole-state copy.
 * Resolves the current receipt, or null when it is gone, undone or already marked.
 */
function markTipBoundaryReached(source, useId) {
  return vanguardUses.serial(source, async () => {
    const undo = vanguardUses.state(source).undo, current = undo.find(receipt => receipt.id === useId);
    if (!current || current.status === "undone" || current.tipBoundaryReached) return null;
    current.tipBoundaryReached = true;
    await source.update({ "flags.ak5e.vanguardUses.undo": undo });
    return current;
  });
}

async function handleTipBoundary(event) {
  if (event.kind !== "combatTurn") return;
  const gm = game.users?.activeGM;
  if (gm && gm.id !== game.user.id) return;
  for (const source of tagActors()) {
    if (!source.isOwner) continue;
    // Receipts also exist before the separate THP die: mark the boundary then,
    // so a late owner click cannot restart the duration.
    for (const use of vanguardUses.state(source).undo) {
      if (use.command !== "tipOfTheSpear" || use.status === "undone" || use.tipBoundaryReached || !crossedTipDeadline(use.tipDeadline, event)) continue;
      const current = await markTipBoundaryReached(source, use.id);
      if (!current) continue;
      if (current.outcome !== 2 || current.tipTemporaryHpReading !== "expire") continue;
      const target = await fromUuid(current.targetUuid), grant = tipRecord(source, use.id, target);
      if (!target) continue;
      if (!grant) {
        await offerTipReconciliation(source, current, target, "Target-side attribution history is missing. The pool is unchanged; the owner must reconcile this use's remaining Tip HP.");
        continue;
      }
      if (grant.status !== "active") continue;
      if (!establishedTipContribution(source, use.id, target)) {
        await offerTipReconciliation(source, current, target);
        continue;
      }
      try {
        await vanguardUses.command(source, "settleTipTemporaryHp", { useId: use.id, remaining: grant.amount,
          ...tipSnapshot(target), manualBoundary: false, reason: "Established contribution at the recorded source Turn boundary", confirmed: true },
        `tip-expiry-${opaqueKey(`${source.uuid}:${use.id}`)}`);
      } catch (error) {
        // A pending command already has a public Retry card. Boundary replay
        // must not create a new operation or silently enqueue a target write.
        ui.notifications.warn(`Tip temporary HP settlement needs retry: ${error.message}`);
      }
    }
  }
}
registerFeatureTagExpiryHandler(handleTipBoundary);

/* ---------------------------------------------------------------- Core Vanguard Plans */

/**
 * Bookkeeping integrity for a granted Tip (not a player-agency gate; range and prerequisites only ever warn).
 * When a call names a grant source (`data.grantKind`), that kind must be registered
 * (vanguard-extensions.mjs registerVanguardTipGrantSource), its validator must accept
 * (actor, sourceEventId, grantIndex), and no other live receipt may already hold the same
 * (kind, sourceEventId, grantIndex): an undone receipt releases the grant. A receipt that already exists
 * (operationId found, e.g. while resolving its Roll) was validated when it was created and is not re-judged.
 * A Tip without `grantKind` (an ordinary use) is unchanged.
 */
function validateTipGrant(actor, state, data, operationId) {
  if (data.grantKind === undefined || data.grantKind === null) return;
  need(typeof data.grantKind === "string" && data.grantKind.length > 0, "The Tip of the Spear grant source is not recognised.");
  if (operationId && state.undo.some(entry => entry.id === operationId)) return;
  need(typeof data.sourceEventId === "string" && data.sourceEventId.length > 0 && Number.isInteger(data.grantIndex) && data.grantIndex >= 1,
    "A granted Tip of the Spear use needs its source event and a whole-number grant index of at least 1.");
  const checked = checkVanguardTipGrant(data.grantKind, actor, data.sourceEventId, data.grantIndex);
  need(checked.ok, checked.reason);
  const live = state.undo.find(entry => entry.command === "tipOfTheSpear" && entry.status !== "undone" && entry.id !== operationId
    && entry.data?.grantKind === data.grantKind && entry.data?.sourceEventId === data.sourceEventId && entry.data?.grantIndex === data.grantIndex);
  need(!live, `That ${data.grantKind} Tip of the Spear grant (${data.sourceEventId} #${data.grantIndex}) was already used; undo the earlier use to release it.`);
}

/** Operator Skill grant sources: the committed activation receipt is the grant's proof (undoing it removes the proof). */
const committedActivation = (actor, activationId, sourceId) => (flag(actor, "operatorSkills")?.operatorEvents ?? []).some(event =>
  event.id === `${activationId}:activation` && event.activationId === activationId && event.kind === "activation"
  && event.sourceId === sourceId && event.committed === true);
export const TIP_GRANT_KIND_LEADING_LANCE = "leading-lance", TIP_GRANT_KIND_DEVASTATING_BLOW = "devastating-blow";
registerVanguardTipGrantSource(TIP_GRANT_KIND_LEADING_LANCE, (actor, activationId, grantIndex) =>
  [1, 2].includes(grantIndex) && committedActivation(actor, activationId, "operator-skill-vanguard-basic-leading-lance")
  || { ok: false, reason: "Leading Lance grants two Tip of the Spear uses, each tied to a committed Leading Lance activation." });
registerVanguardTipGrantSource(TIP_GRANT_KIND_DEVASTATING_BLOW, (actor, activationId, grantIndex) =>
  grantIndex === 1 && committedActivation(actor, activationId, "operator-skill-vanguard-advanced-devastating-blow")
  || { ok: false, reason: "Devastating Blow grants one Tip of the Spear use, tied to a committed Devastating Blow activation." });

function applyTipOutcomeData(receipt, outcome, actor, targetUuid, targetName, pb, data = {}) {
  need(outcome >= 1 && outcome <= 6, "Tip outcome must be 1 to 6.");
  receipt.outcome = outcome;
  const instruction = TIP_INSTRUCTIONS[outcome - 1];

  if (outcome === 1) {
    receipt.summary = `${targetName} gains +${pb} damage on one Damage Roll of their choice until start of ${actor.name}'s next Turn.`;
    receipt.result = { damageBonus: pb, outcome: 1 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        standardBenefit: { kind: "tip1", value: pb, bearerUuid: actor.uuid },
        meta: { standardBenefit: { kind: "tip1", value: pb, bearerUuid: actor.uuid }, sourceUseId: receipt.id, createdAt: Date.now() },
        tag: {
          label: `Tip of the Spear: +${pb} Damage`,
          trigger: "turnStart",
          expiryActor: "source",
          actions: ["used"],
          changes: [],
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 2) {
    receipt.summary = `${targetName} gains additive Temporary Hit Points (1d6).`;
    receipt.result = { outcome: 2, additive: true };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "tipTemporaryHP",
        mode: "additive",
        formula: "1d6",
        ready: false
      }];
      receipt.formula = "1d6";
      receipt.rollFlavor = "Tip of the Spear: Temporary Hit Points";
    }
  } else if (outcome === 3) {
    receipt.summary = `${targetName}'s Speed modes increase by 10 feet until start of ${actor.name}'s next Turn.`;
    receipt.result = { speedBonus: 10, outcome: 3 };
    if (targetUuid) {
      const recipient = globalThis.fromUuidSync?.(targetUuid)
        ?? values(globalThis.canvas?.tokens?.placeables).find(token => token.actor?.uuid === targetUuid)?.actor;
      need(recipient, "The target's movement modes could not be recorded for this Tip benefit.");
      const changes = TIP_OUTCOMES[2].changes(recipient);
      receipt.tipSpeedModes = changes.map(change => change.key.slice("system.attributes.movement.".length));
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        tag: {
          label: "Tip of the Spear: Speed +10 ft",
          trigger: "turnStart",
          expiryActor: "source",
          changes,
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 4) {
    receipt.summary = `${targetName} gains +2 to Attack Rolls until start of ${actor.name}'s next Turn.`;
    receipt.result = { attackBonus: 2, outcome: 4 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        tag: {
          label: "Tip of the Spear: +2 to Attack Rolls",
          trigger: "turnStart",
          expiryActor: "source",
          changes: attackChanges(2),
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 5) {
    receipt.summary = `${targetName}'s Critical Range is increased by 1 until start of ${actor.name}'s next Turn.`;
    receipt.result = { critRangeBonus: 1, outcome: 5 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        standardBenefit: { kind: "tip5", value: 1 },
        tag: {
          label: "Tip of the Spear: Critical Range +1",
          trigger: "turnStart",
          expiryActor: "source",
          changes: [],
          instructions: instruction
        },
        ready: true
      }];
    }
  } else if (outcome === 6) {
    receipt.summary = `${targetName} gains 1 additional Skill Point whenever they gain SP until start of ${actor.name}'s next Turn.`;
    receipt.result = { spBonus: 1, outcome: 6 };
    if (targetUuid) {
      receipt.targets = [{
        uuid: targetUuid,
        name: targetName,
        kind: "effect",
        featureId: "class-feature-vanguard-1st-level-tip-of-the-spear-3092",
        standardBenefit: { kind: "tip6", value: 1, bearerUuid: actor.uuid },
        meta: { standardBenefit: { kind: "tip6", value: 1, bearerUuid: actor.uuid }, sourceUseId: receipt.id, createdAt: Date.now() },
        tag: {
          label: "Tip of the Spear: +1 Skill Point",
          trigger: "turnStart",
          expiryActor: "source",
          changes: [],
          instructions: instruction
        },
        ready: true
      }];
    }
  }
}

const CORE_PLANS = {
  settleTipTemporaryHp(actor, state, data) {
    const use = state.undo.find(receipt => receipt.id === data.useId && receipt.command === "tipOfTheSpear");
    need(use && use.outcome === 2 && use.status !== "undone", "Choose a recorded, active Tip temporary HP use.");
    need(!isLocked(use) || game.user.isGM, "This Tip use is locked: its encounter window has ended.");
    need(use.tipBoundaryReached || data.manualBoundary === true, "Confirm a manual source Turn boundary before settling this use.");
    need(typeof data.reason === "string" && data.reason.trim().length >= 10, "Explain the Tip temporary HP boundary/reconciliation (at least 10 characters).");
    need(Number.isInteger(data.remaining) && data.remaining >= 0, "Choose a non-negative whole number of remaining Tip HP.");
    need(Number.isFinite(data.expectedTemp) && data.expectedTemp >= 0 && data.expectedRevision != null, "Review a current Temporary HP pool and revision snapshot.");
    return { warnings: [], title: "Settle Tip temporary HP", async apply(_next, receipt) {
      const target = await fromUuid(use.targetUuid), grant = reconcilableTipGrant(actor, use, target, receipt.id);
      need(target && grant, "The recorded Tip grant could not be found; reconcile its history first.");
      need(grant.status === "active", "This Tip contribution has already been settled or undone; retry its existing receipt.");
      if (data.expectedTemp !== tempHp(target) || data.expectedRevision !== flag(target, TIP_REVISION)) {
        await offerTipReconciliation(actor, use, target, "The pool or revision snapshot is stale. Review this fresh snapshot and retry with a new operation ID.");
        throw new Error("The Tip temporary HP snapshot changed; review the refreshed public snapshot.");
      }
      need(data.remaining <= Math.min(grant.amount, tempHp(target)), "Remaining Tip HP cannot exceed this grant or the current pool.");
      const amount = use.tipTemporaryHpReading === "expire" && grant.status === "active" ? data.remaining : 0;
      receipt.readingValue = use.tipTemporaryHpReading;
      receipt.tipUseId = use.id;
      receipt.tipDeadline = structuredClone(use.tipDeadline);
      receipt.summary = `Tip temporary HP adjustment: remove ${amount}. Reading: ${receipt.readingValue}. ${tipDeadlineText(use.tipDeadline)} Reconciliation: ${data.reason.trim()}; ${data.remaining} remaining Tip HP attributed to this grant.`;
      if (grant.missingAttribution) receipt.summary += " Target attribution history was missing; the adjustment uses only the owner's selected remaining contribution.";
      receipt.result = { adjustment: amount, remaining: data.remaining, readingValue: receipt.readingValue };
      receipt.targets = [{ uuid: use.targetUuid, name: use.targetName, kind: "tipTemporaryHPSettlement", ready: true,
        tipUseId: use.id, amount, ...tipSnapshot(target), manualBoundary: data.manualBoundary === true }];
      return {};
    } };
  },
  leadingLanceSP(actor, _state, data) {
    need(vanguardEnabled(actor), "Leading Lance requires the Vanguard class.");
    const operator = flag(actor, "operatorSkills") ?? {};
    need(operator.enabled === true && Number.isFinite(Number(operator.maximum)), "Enable Operator Skills and learn Leading Lance before recording this SP gain.");
    const eventId = String(data.eventId ?? "");
    need(eventId.length > 0 && eventId.length <= 200, "A stable Leading Lance activation ID is required.");
    const activation = (operator.operatorEvents ?? []).find(event => event.id === `${eventId}:activation`
      && event.kind === "activation" && event.sourceId === "operator-skill-vanguard-basic-leading-lance" && event.committed === true);
    need(activation, "The Leading Lance trigger must reference a committed Leading Lance activation.");
    const warnings = [];
    if (operator.active) warn(warnings, "active-skill", "An Operator Skill is currently active; the shared SP rules normally prevent gains while a Skill is active.");
    return { warnings, title: "Leading Lance: gain 10 Skill Points", apply(_next, receipt) {
      const ledger = operator.operatorEvents ?? [];
      if (ledger.some(event => event.id === `${eventId}:leadingLanceKill`)) {
        receipt.eventId = eventId;
        receipt.summary = "This Leading Lance activation already has its qualifying-kill grant recorded; no additional SP is added.";
        receipt.result = { duplicate: true, eventId };
        return {};
      }
      const before = Math.max(0, Number(operator.points) || 0), maximum = Math.max(0, Number(operator.maximum) || 0);
      const after = Math.min(maximum, before + 10), gained = after - before;
      const event = { id: `${eventId}:leadingLanceKill`, activationId: eventId, kind: "grant",
        sourceId: activation.sourceId, trigger: "qualifying kill", useId: receipt.id,
        spBefore: before, spAfter: after, spRequested: 10, spGained: gained, maximum, committed: true, createdAt: Date.now() };
      receipt.eventId = eventId;
      receipt.summary = `${actor.name} gains ${gained} of the 10 Skill Points granted by Leading Lance${gained < 10 ? ` (capped at the shared SP maximum of ${maximum})` : ""}.`;
      receipt.result = { eventId, requested: 10, before, after, gained, maximum };
      return { "flags.ak5e.operatorSkills.points": after,
        "flags.ak5e.operatorSkills.operatorEvents": [...ledger, event] };
    } };
  },

  undoOperatorActivation(actor, state, data) {
    need(vanguardEnabled(actor), "Operator activation undo requires a Vanguard class Actor.");
    const activationId = String(data.activationId ?? "");
    const operator = flag(actor, "operatorSkills") ?? {};
    const event = (operator.operatorEvents ?? []).find(candidate => candidate.id === `${activationId}:activation`
      && candidate.activationId === activationId && candidate.kind === "activation" && candidate.committed === true);
    need(event, "Choose a committed Vanguard Operator Skill activation.");
    const grant = state.undo.find(receipt => receipt.command === "leadingLanceSP" && receipt.eventId === activationId
      && receipt.status !== "undone");
    need(!grant, `Undo Leading Lance use ${grant?.id} first using Undo recent use, then retry this activation.`);
    const dependent = state.undo.find(receipt => receipt.status !== "undone" && receipt.operatorSources?.some(source =>
      source.actorUuid === actor.uuid && source.activationId === activationId));
    need(!dependent, `Undo dependent use ${dependent?.command ?? "benefit"} (${dependent?.id}) first using Undo recent use, then retry this activation.`);
    const current = Math.max(0, Number(operator.points) || 0), maximum = Math.max(0, Number(operator.maximum) || 0);
    const restore = Math.max(0, Number(event.spSpent) || 0);
    return { warnings: [], title: "Undo Vanguard Operator Skill activation", apply(_next, receipt) {
      receipt.activationId = activationId;
      receipt.summary = `Undo ${event.name ?? "Vanguard Operator Skill"}; restore up to ${restore} spent Skill Points while preserving later pool changes.`;
      receipt.result = { activationId, requestedRestore: restore };
      return {};
    } };
  },

  quickOffTheMark(actor) {
    need(vanguardEnabled(actor), "Quick off the Mark requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 3, "Quick off the Mark");
    const bonus = Number(actor.system?.attributes?.prof ?? 2);
    if (flag(actor, "vanguard.quickOffTheMarkArmed")) warn(warnings, "already-armed", "Quick off the Mark is already armed for a native Initiative roll.");
    return { warnings, title: "Quick off the Mark", apply(_next, receipt) {
      receipt.summary = `${actor.name} chooses to add +${bonus} to the next native Initiative roll. Canceling that native roll leaves this option armed.`;
      receipt.result = { initiativeBonus: bonus, armed: true };
      return { "flags.ak5e.vanguard.quickOffTheMarkArmed": { useId: receipt.id, bonus } };
    } };
  },

  tipOfTheSpear(actor, state, data, operationId) {
    registerTipTemporaryHpHooks();
    need(vanguardEnabled(actor), "Tip of the Spear requires the Vanguard class.");
    validateTipGrant(actor, state, data, operationId);
    const warnings = [];
    const pb = Number(actor.system?.attributes?.prof ?? 2);

    const targetUuid = data.target?.uuid ?? data.targetActor?.uuid ?? data.targetUuid ?? null;
    need(typeof targetUuid === "string" && targetUuid.length > 0, "Choose an allied creature for Tip of the Spear.");
    const targetName = data.target?.name ?? data.targetActor?.name ?? data.targetName ?? "creature";
    const selfTarget = targetUuid === actor.uuid;
    const reading = selfTarget ? "tipSelfTargeting" : null;
    const storedReading = reading ? vanguardState(actor).rulings?.[reading] : null;
    const rulingValue = storedReading?.source?.trim?.() && storedReading.value !== undefined ? storedReading.value : undefined;
    const selectedReading = reading
      ? (rulingValue ?? data.readings?.[reading] ?? data.reading ?? null)
      : null;
    const token = data.target?.document?.object ?? data.target?.token ??
      values(globalThis.canvas?.tokens?.placeables).find(candidate => candidate.actor?.uuid === targetUuid || candidate.document?.uuid === targetUuid);

    // Range check: 60 ft (Tactician may have range Infinity)
    const range = 60;
    const sourceToken = values(globalThis.canvas?.tokens?.placeables).find(candidate => candidate.actor?.uuid === actor.uuid);
    const scene = sourceToken?.document?.parent ?? sourceToken?.parent;
    const tokenScene = token?.document?.parent ?? token?.parent;
    if (sourceToken && token && tokenScene?.id === scene?.id && scene?.grid) {
      if (Number.isFinite(range) && !withinFeet(scene, tokenPoint(sourceToken), token, range)) warn(warnings, "range", `${targetName} is beyond ${range} feet; use anyway only if the table confirms an exception.`);
    } else warn(warnings, "range-unverified", `Confirm that ${targetName} is within ${range} feet; distance could not be verified.`);
    if (!token || token.document?.hidden || token.isVisible === false) warn(warnings, "visibility-unverified", `Confirm that ${targetName} is visible; visibility could not be verified.`);
    const sourceDisposition = sourceToken?.document?.disposition;
    const targetDisposition = token?.document?.disposition ?? token?.disposition;
    if (sourceDisposition === undefined || targetDisposition === undefined) warn(warnings, "alliance-unverified", `Confirm that ${targetName} is allied; alliance could not be verified.`);
    else if (sourceDisposition !== 1 || targetDisposition !== 1) warn(warnings, "alliance", `Confirm that ${targetName} is allied before using Tip of the Spear.`);
    if (selfTarget && selectedReading === "otherAllyOnly") {
      warn(warnings, "selfTarget", "The selected reading allows only another ally to receive Tip; this use targets the Vanguard themself.");
    }

    const directed = Boolean(data.directed);
    const choice = data.choice !== undefined && data.choice !== null ? Number(data.choice) : null;
    const isDirected = Boolean(directed || choice !== null);
    const alreadyActive = isDirectedEngagementActive(actor);

    if (isDirected) {
      need(choice !== null || !directed, "Choose one of the six Tip outcomes when invoking Directed Engagement.");
      if (!alreadyActive) {
        levelWarning(warnings, actor, 15, "Directed Engagement");
        const reactions = getReactions(actor);
        if (reactions?.available < 1) {
          warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
        }
      } else need(Number.isInteger(choice) && choice >= 1 && choice <= 6, "Choose a Tip of the Spear outcome from 1 to 6 for the active Directed Engagement.");
      need(choice === null || (Number.isInteger(choice) && choice >= 1 && choice <= 6), "Choose a Tip of the Spear outcome from 1 to 6 for Directed Engagement.");
    }

    const directedUse = isDirected;
    const title = directedUse ? "Tip of the Spear (Directed Engagement)" : "Tip of the Spear";

    return {
      warnings,
      title,
      ...(reading ? { reading } : {}),
      rolls: (!isDirected && choice === null)
        ? [{ id: "tipRoll", label: "Tip of the Spear (1d6)", formula: "1d6" }]
        : [],
      async apply(next, receipt, resolvedReading) {
        receipt.tipDeadline = tipDeadline(actor);
        if (reading) receipt.readingValue = resolvedReading;
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.directed = directedUse;
        receipt.choice = choice;
        receipt.proficiencyBonus = pb;
        receipt.data = structuredClone({ ...data, target: { uuid: targetUuid, name: targetName }, targetActor: undefined });

        if (isDirected && !alreadyActive) {
          const triggerId = `${receipt.id}-directedEngagement`;
          receipt.reaction = { requested: true, spent: false, receiptId: `playuse_vanguardUses_${receipt.id}`, triggerId };
          receipt.directedEngagementGrant = true;
        }

        const resolvedOutcome = choice ?? (receipt.roll !== undefined ? Number(receipt.roll) : null);

        if (resolvedOutcome !== null) {
          applyTipOutcomeData(receipt, resolvedOutcome, actor, targetUuid, targetName, pb, data);
          receipt.outcome = resolvedOutcome;
          receipt.rollResolved = true;
        } else {
          receipt.formula = "1d6";
          receipt.rollLabel = "Tip of the Spear (1d6)";
          receipt.rollFlavor = "Tip of the Spear";
          receipt.summary = `${actor.name} invokes Tip of the Spear targeting ${targetName}. Click Roll to determine the outcome.`;
          receipt.status = "awaitingRoll";
          receipt.result = { awaitingRoll: true, formula: "1d6" };
        }

        if (receipt.directedEngagementGrant) {
          const combat = globalThis.game?.combat;
          const combatant = combat?.combatant;
          return { "flags.ak5e.vanguard.directedEngagementActive": true,
            "flags.ak5e.vanguard.directedEngagementTurn": combatant && combat?.started
              ? { combatId: combat.uuid, round: combat.round, combatantId: combatant.id }
              : null };
        }
        return {};
      },
      resolveRoll(owner, receipt) {
        if (receipt.choice !== null && receipt.choice !== undefined || receipt.outcome !== undefined) return;
        const outcome = Number(receipt.roll);
        need(Number.isInteger(outcome) && outcome >= 1 && outcome <= 6, "Tip of the Spear needs a d6 result from its Roll button.");
        receipt.tipOutcomeRoll = outcome;
        applyTipOutcomeData(receipt, outcome, owner, receipt.targetUuid, receipt.targetName, Number(receipt.proficiencyBonus ?? owner.system?.attributes?.prof ?? 2), receipt.data ?? {});
        if (outcome === 2) {
          receipt.roll = undefined;
          receipt.formula = "1d6";
          receipt.rollLabel = "Temporary Hit Points";
          receipt.rollFlavor = "Tip of the Spear: Temporary Hit Points";
          receipt.summary = `${receipt.targetName} gains additive Temporary Hit Points. Roll 1d6 in this second step.`;
        } else receipt.rollLabel = "Tip of the Spear outcome";
      }
    };
  },

  uncannyDodge(actor, state, data) {
    need(vanguardEnabled(actor), "Uncanny Dodge requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 11, "Uncanny Dodge");

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const damage = Number(data.damage ?? 0);
    need(Number.isInteger(damage) && damage >= 0, "Enter the final whole-number Attack damage after other reductions.");
    const halved = calculateUncannyDodge(damage);
    const reduced = damage - halved;
    const hp = actor.system?.attributes?.hp ?? {};
    if (damage > 0) {
      warn(warnings, "attack-hit", "Confirm the incoming Attack hit this character and Uncanny Dodge is available for that hit.");
      warn(warnings, "attacker-visible", "Confirm the Attack source was visible and is the creature responsible for this hit.");
      warn(warnings, "damage-final", "Enter final incoming Attack damage after resistance, vulnerability, and other reductions. Apply only the halved amount below instead of applying the full damage card as well.");
    }

    return {
      warnings,
      title: "Uncanny Dodge",
      async apply(next, receipt) {
        const triggerId = `${receipt.id}-uncannyDodge`;
        receipt.reaction = { requested: true, spent: false, receiptId: `playuse_vanguardUses_${receipt.id}`, triggerId };
        receipt.summary = `${actor.name} uses their Reaction to halve incoming Attack damage against them from ${damage} to ${halved} (reduced by ${reduced}).`;
        receipt.result = { originalDamage: damage, halvedDamage: halved, damageReduced: reduced, hitPointsBefore: hp.value, temporaryHitPointsBefore: hp.temp,
          attacker: data.attacker ? { uuid: data.attacker.uuid ?? null, name: String(data.attacker.name ?? "") } : null };
        if (halved > 0) receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "damage", amount: halved, ready: true }];
        return {};
      }
    };
  },

  nimble(actor, state, data) {
    need(vanguardEnabled(actor), "Nimble requires the Vanguard class.");
    const warnings = [];
    const targetUuid = data.target?.uuid ?? data.targetActor?.uuid ?? data.targetUuid ?? null;
    const targetName = data.target?.name ?? data.targetActor?.name ?? data.targetName ?? "creature";
    need(typeof targetUuid === "string" && targetUuid.length > 0, "Choose the creature you hit to record Nimble protection.");
    const combat = globalThis.game?.combat;
    if (!combat?.started || !combat?.combatant) warn(warnings, "expiry-unverified", "Nimble expires at the end of your Turn; no active combat Turn is available, so remove this record manually at Turn end.");

    return {
      warnings,
      title: "Landstrider: Nimble",
      async apply(next, receipt) {
        const current = flag(actor, "vanguard.nimbleTargets") ?? [];
        if (targetUuid && !current.includes(targetUuid)) {
          const updated = [...current, targetUuid];
          const currentCombat = globalThis.game?.combat, currentCombatant = currentCombat?.combatant;
          receipt.summary = `${actor.name} hits ${targetName}; record Nimble protection from that creature until the end of this Turn${currentCombat?.started ? "." : " (remove it manually at Turn end outside combat)."}`;
          receipt.result = { targetUuid, targetName };
          return { "flags.ak5e.vanguard.nimbleTargets": updated,
            "flags.ak5e.vanguard.nimbleTurn": currentCombat?.started && currentCombatant
              ? { combatId: currentCombat.uuid, round: currentCombat.round, combatantId: currentCombatant.id }
              : null };
        }
        receipt.summary = `${actor.name} is Nimble against ${targetName}.`;
        return {};
      }
    };
  },

  clearTurnProtection(actor) {
    need(vanguardEnabled(actor), "Vanguard turn protection controls require the Vanguard class.");
    const state = flag(actor, "vanguard") ?? {};
    return {
      warnings: [], title: "Clear Vanguard turn protection",
      apply(_next, receipt) {
        receipt.summary = `${actor.name} clears tracked Nimble targets and Directed Engagement. Use this at the end of the current Turn when outside combat.`;
        receipt.result = { nimbleTargetsCleared: (state.nimbleTargets ?? []).length, directedEngagementCleared: state.directedEngagementActive === true };
        return { "flags.ak5e.vanguard.nimbleTargets": [], "flags.ak5e.vanguard.nimbleTurn": null,
          "flags.ak5e.vanguard.directedEngagementActive": false, "flags.ak5e.vanguard.directedEngagementTurn": null };
      }
    };
  },

  approachingStorm(actor, state, data) {
    need(vanguardEnabled(actor), "Approaching Storm requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "Approaching Storm");

    const combat = globalThis.game?.combat;
    const round = Number(combat?.round ?? data.round ?? 1);
    if (!combat?.started) warn(warnings, "combat", "Approaching Storm requires a Damage Roll during Round 1 of a combat; no active combat is found.");
    if (combat?.started && round > 1) {
      warn(warnings, "round", "Approaching Storm only functions during the first Round of a combat.");
    }
    if (data.round !== undefined && combat?.round !== undefined && Number(data.round) !== Number(combat.round)) warn(warnings, "round-mismatch", `The supplied Round ${data.round} does not match active combat Round ${combat.round}; the active Round is used.`);

    const level = vanguardLevel(actor) ?? 20;
    const bonus = approachingStormBonus(level);

    return {
      warnings,
      title: "Approaching Storm",
      reading: "approachingStormComponents",
      apply(next, receipt, reading) {
        const componentIndex = Math.max(0, Math.trunc(Number(data.componentIndex) || 0));
        receipt.summary = `${actor.name} arms Approaching Storm for +${bonus} on the next native Damage Roll during Round 1. The bonus is optional and applies only when the native roll is made.`;
        receipt.result = { damageBonus: bonus, round, armed: true, reading };
        return { "flags.ak5e.vanguard.approachingStormArmed": { useId: receipt.id, bonus, round,
          componentIndex, reading, combatId: combat?.uuid ?? null } };
      }
    };
  },

  lightspeed(actor, state, data) {
    need(vanguardEnabled(actor), "Lightspeed requires the Vanguard class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Lightspeed");

    const combat = globalThis.game?.combat;
    if (data.phase !== undefined) need(["begin", "complete"].includes(data.phase), "Choose begin or complete for the Lightspeed guided procedure.");
    const round = Number(combat?.round ?? data.round ?? 1);
    if (data.round !== undefined && combat?.round !== undefined && Number(data.round) !== Number(combat.round)) warn(warnings, "round-mismatch", `The supplied Round ${data.round} does not match active combat Round ${combat.round}; the active Round is used.`);
    if (combat?.started && round > 1) {
      warn(warnings, "round", "Lightspeed only grants a second turn during the first Round of a combat.");
    }
    const combatId = combat?.uuid ?? null;
    if (!combatId || !combat?.started) warn(warnings, "combat", "Confirm this is the first Round of an active combat; no active combat was found.");
    const combatant = values(combat?.turns).find(entry => entry.actor?.uuid === actor.uuid);
    const initiative = Number(data.initiative ?? combatant?.initiative);
    if (!Number.isFinite(initiative)) warn(warnings, "initiative-unverified", "Confirm the first-turn Initiative; it could not be read from this combat.");
    const secondTurnInit = Number.isFinite(initiative) ? lightspeedSecondInitiative(initiative) : null;
    const phase = data.phase === "complete" ? "complete" : "begin";
    const prior = flag(actor, "vanguard.lightspeed") ?? {};
    const sameRound = prior.combatId === combatId && Number(prior.round) === round;
    if (sameRound && prior.status) warn(warnings, "lightspeed-duplicate", `A Lightspeed procedure is already ${prior.status} for this combat Round; confirm before recording another step.`);
    if (phase === "complete" && (!sameRound || prior.status !== "pending")) warn(warnings, "lightspeed-not-pending", "No pending Lightspeed second turn is recorded for this combat Round.");

    return {
      warnings,
      title: phase === "begin" ? "Lightspeed: Begin second turn" : "Lightspeed: Complete second turn",
      apply(next, receipt) {
        const status = phase === "begin" ? "pending" : "completed";
        receipt.summary = phase === "begin"
          ? `${actor.name} records a second Round 1 turn at Initiative ${secondTurnInit ?? "first Initiative - 10"} (first Initiative ${Number.isFinite(initiative) ? initiative : "confirm the table value"} - 10). Complete the turn and manually follow normal refresh and expiry steps.`
          : `${actor.name} records the Lightspeed second turn complete. Manually follow the normal refresh and expiry steps.`;
        receipt.result = { phase, status, firstInitiative: initiative, secondInitiative: secondTurnInit, combatId, round };
        return { "flags.ak5e.vanguard.lightspeed": { combatId, round, phase, status, firstInitiative: initiative, secondInitiative: secondTurnInit, operationId: receipt.id } };
      }
    };
  }
};

CORE_PLANS.undoOperatorActivation.undoUpdates = (owner, _state, receipt) => {
  const latest = flag(owner, "operatorSkills") ?? {}, events = latest.operatorEvents ?? [];
  const committed = events.find(candidate => candidate.id === `${receipt.activationId}:activation`
    && candidate.activationId === receipt.activationId && candidate.kind === "activation" && candidate.committed === true);
  const stillGranted = vanguardUses.state(owner).undo.some(candidate => candidate.command === "leadingLanceSP"
    && candidate.eventId === receipt.activationId && candidate.status !== "undone");
  const dependent = vanguardUses.state(owner).undo.some(candidate => candidate.status !== "undone" && candidate.operatorSources?.some(source =>
    source.actorUuid === owner.uuid && source.activationId === receipt.activationId));
  if (!committed || stillGranted || dependent) {
    receipt.undoNotes = [...(receipt.undoNotes ?? []), stillGranted || dependent
      ? "A dependent use remains committed. Undo it using Undo recent use before retrying the activation."
      : "The activation ledger changed or expired; no activation state was restored."];
    return {};
  }
  const points = Math.max(0, Number(latest.points) || 0);
  const gained = Math.min(Math.max(0, Number(committed.spSpent) || 0), Math.max(0, Number(latest.maximum) - points));
  const updates = { "flags.ak5e.operatorSkills.points": points + gained,
    "flags.ak5e.operatorSkills.operatorEvents": events.filter(candidate => candidate.activationId !== receipt.activationId) };
  if (latest.active?.activationId === receipt.activationId) updates["flags.ak5e.operatorSkills.active"] = null;
  if (gained < Number(committed.spSpent ?? 0)) receipt.undoNotes = [...(receipt.undoNotes ?? []),
    `Restored ${gained} of ${committed.spSpent} Skill Points; the shared pool reached its maximum.`];
  return updates;
};

CORE_PLANS.approachingStorm.undoNotes = (_actor, _state, receipt) => receipt.approachingStormApplied
  ? ["The native damage roll already made with Approaching Storm remains in chat after undo."] : [];

CORE_PLANS.tipOfTheSpear.beforeRoll = (actor, receipt, data) => {
  if (receipt.outcome !== 2 || receipt.tipTemporaryHpReading) return;
  const key = "tipTemporaryHpExpiry", definition = vanguardUses.readings()[key];
  const record = vanguardState(actor).rulings?.[key];
  const ruling = record?.source?.trim?.() ? record.value : undefined;
  const reading = resolveReading(ruling, data.readings?.[key] ?? data.reading, key, definition.label, definition.options);
  receipt.tipTemporaryHpReading = reading.value;
  receipt.rollCardStage = "temporaryHp";
  if (receipt.readingValue) {
    receipt.tipSelfReadingValue = receipt.readingValue;
    receipt.manualSteps = [...(receipt.manualSteps ?? []), `Self-target reading captured for this use: ${receipt.reading}.`];
  }
  receipt.readingValue = reading.value;
  receipt.readingSource = reading.source;
  receipt.reading = definition.options.find(option => option.value === reading.value)?.label;
  receipt.manualSteps = [...(receipt.manualSteps ?? []), `${tipDeadlineText(receipt.tipDeadline)} Reading captured for this use: ${reading.value}${reading.source === "ruling" ? " (GM ruling)" : " (per-use choice)"}.`];
  return true;
};

vanguardUses.register({
  plans: CORE_PLANS,
  readings: {
    tipTemporaryHpExpiry: {
      label: "Tip temporary HP at the source's next Turn (unspent HP is not specified in the source)",
      options: [
        { value: "expire", label: "Expire: remove only the remaining attributable Tip temporary HP at the source's next Turn start." },
        { value: "retain", label: "Retain: keep the temporary HP after the source's next Turn start." }
      ]
    },
    tipSelfTargeting: {
      label: "Tip of the Spear self-target eligibility",
      options: [
        { value: "allowSelf", label: "Self is allowed; the Vanguard may receive their own Tip benefit." },
        { value: "otherAllyOnly", label: "Only another ally may receive the Tip benefit; self is excluded." }
      ]
    },
    approachingStormComponents: {
      label: "Approaching Storm damage components",
      options: [
        { value: "once", label: "Add it once to one damage component (selected component; defaults to the first)." },
        { value: "perRoll", label: "Add it to each distinct damage component in this action." }
      ]
    }
  },
  targetKinds: {
    tipTemporaryHP: {
      async apply(source, useId, entry, target) {
        return tipSerial(target, async () => {
          const existing = tipRecord(source, useId, target);
          if (existing) return existing;
          const use = vanguardUses.receipt(source, useId);
          need(["expire", "retain"].includes(use?.tipTemporaryHpReading), "Choose this use's temporary HP duration before rolling.");
          const before = tempHp(target), late = use.tipBoundaryReached && use.tipTemporaryHpReading === "expire";
          const grant = { tipTemporaryHp: true, sourceUuid: source.uuid, useId, amount: entry.amount,
            tempBefore: before, temp: late ? before : before + entry.amount, rolled: entry.amount,
            readingValue: use.tipTemporaryHpReading, deadline: structuredClone(use.tipDeadline),
            status: late ? "expired" : "active" };
          let applied;
          if (late) {
            applied = { ...grant, ...tipSnapshot(target) };
            await target.update({ [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}`]: applied });
          } else applied = await writeTipPool(source, useId, target, grant, before + entry.amount);
          if (use.tipDeadline?.trigger === "manual") await offerTipReconciliation(source, use, target, "Outside combat there is no automatic boundary. Confirm the manual source Turn boundary and explain why before settlement.");
          return applied;
        });
      },
      async revert(source, useId, _entry, target) {
        return tipSerial(target, async () => {
          const grant = reconcilableTipGrant(source, vanguardUses.receipt(source, useId), target);
          if (!grant || grant.status === "undone") return { removed: 0 };
          if (grant.status !== "active") {
            await target.update({ [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}.status`]: "undone" });
            return { removed: 0 };
          }
          if (!establishedTipContribution(source, useId, target)) {
            const use = vanguardUses.receipt(source, useId);
            await offerTipReconciliation(source, use, target, "Undo needs owner reconciliation of this grant. The current pool is preserved until the remaining contribution is selected.");
            throw new Error("Reconcile the remaining Tip HP before undoing this grant; no pool adjustment was made");
          }
          await writeTipPool(source, useId, target, { ...grant, status: "undone" }, tempHp(target) - grant.amount);
          return { removed: grant.amount };
        });
      },
      preview(source, receipt, entry, target) {
        const grant = reconcilableTipGrant(source, receipt, target);
        if (!grant || grant.status !== "active") return `${entry.name}: no current Tip temporary HP contribution to remove; expiry/undo is not reversed.`;
        return establishedTipContribution(source, receipt.id, target)
          ? `${entry.name}: removes this established ${grant.amount} Tip temporary HP contribution.`
          : `${entry.name}: attribution is uncertain; the owner must reconcile the remaining Tip HP. The pool is preserved until then.`;
      },
      rolled(entry, total) { entry.amount = total; },
      rollText(entry) {
        const applied = entry.applied ?? {};
        return `${entry.name}: Tip temporary HP ${applied.tempBefore ?? 0} → ${applied.temp ?? entry.amount} (rolled ${entry.amount})${applied.status === "expired" ? "; original deadline already passed, adjustment 0" : ""}.`;
      }
    },
    tipTemporaryHPSettlement: {
      async apply(source, useId, entry, target) {
        return tipSerial(target, async () => {
          const prior = tipRecord(source, useId, target);
          if (prior) return prior;
          const use = vanguardUses.receipt(source, entry.tipUseId), grant = reconcilableTipGrant(source, use, target, useId);
          need(use?.status !== "undone" && grant?.status === "active", "This Tip grant is no longer active.");
          if (entry.expectedTemp !== tempHp(target) || entry.expectedRevision !== flag(target, TIP_REVISION)) {
            await offerTipReconciliation(source, use, target, "The pool or revision changed before application. Review this fresh snapshot with a new operation ID.");
            throw new Error("Stale Tip temporary HP snapshot; review the refreshed public request");
          }
          const amount = grant.status === "active" && grant.readingValue === "expire" ? entry.amount : 0;
          need(Number.isInteger(amount) && amount >= 0 && amount <= Math.min(grant.amount, tempHp(target)), "The remaining Tip contribution is out of range.");
          const applied = { tipTemporaryHpSettlement: true, tipUseId: entry.tipUseId, removed: amount, undone: false };
          const nextGrant = grant.readingValue === "retain" ? grant
            : { ...grant, status: "settled", settledBy: useId, remaining: 0, adjustment: amount };
          if (amount) await writeTipPool(source, entry.tipUseId, target, nextGrant, tempHp(target) - amount,
            { [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}`]: applied });
          else await target.update({ [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, entry.tipUseId)}`]: nextGrant,
            [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}`]: applied });
          return applied;
        });
      },
      async revert(source, useId, entry, target) {
        return tipSerial(target, async () => {
          const applied = tipRecord(source, useId, target);
          if (!applied || applied.undone) return { restored: 0 };
          const use = vanguardUses.receipt(source, entry.tipUseId), grant = tipRecord(source, entry.tipUseId, target);
          const restore = use?.status !== "undone" && grant?.status !== "undone" ? applied.removed : 0;
          const done = { ...applied, undone: true };
          if (restore) await writeTipPool(source, entry.tipUseId, target,
            { ...grant, status: "active", remaining: restore, amount: restore, settledBy: null }, tempHp(target) + restore,
            { [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}`]: done });
          else await target.update({ [`flags.ak5e.${vanguardUses.appliedFlag}.${tipKey(source, useId)}`]: done });
          return { restored: restore };
        });
      },
      preview(source, receipt, entry, target) {
        const applied = tipRecord(source, receipt.id, target);
        return `${entry.name}: reverses only this Tip temporary HP adjustment (${applied?.undone ? 0 : applied?.removed ?? 0}), preserving intervening pool changes; an undone grant is never restored.`;
      }
    },
    damage: {
      local: true,
      async apply(source, useId, entry, target) {
        const key = opaqueKey(`${useId}:${source.uuid}`);
        const existing = flag(target, vanguardUses.appliedFlag)?.[key];
        if (existing) return existing;
        const hp = target.system.attributes.hp;
        const before = { value: Number(hp.value ?? 0), temp: Number(hp.temp ?? 0) };
        const tempLost = Math.min(before.temp, entry.amount), hitPointsLost = Math.min(before.value, entry.amount - tempLost);
        const after = { value: before.value - hitPointsLost, temp: before.temp - tempLost };
        const applied = { before, after, amount: entry.amount, tempLost, hitPointsLost };
        await target.update({ "system.attributes.hp.value": after.value, "system.attributes.hp.temp": after.temp,
          [`flags.ak5e.${vanguardUses.appliedFlag}.${key}`]: applied });
        return applied;
      },
      async revert(source, useId, _entry, target) {
        const key = opaqueKey(`${useId}:${source.uuid}`), path = `${vanguardUses.appliedFlag}.${key}`;
        const applied = flag(target, vanguardUses.appliedFlag)?.[key];
        if (!applied) return { removed: 0 };
        const hp = target.system.attributes.hp;
        if (Number(hp.value) !== applied.after.value || Number(hp.temp ?? 0) !== applied.after.temp) return { conflict: true };
        await target.update({ "system.attributes.hp.value": applied.before.value, "system.attributes.hp.temp": applied.before.temp, [`flags.ak5e.${path}`]: null });
        return { restored: applied.hitPointsLost + applied.tempLost };
      },
      preview(_source, _receipt, _entry, target) {
        const hp = target.system.attributes.hp;
        return `Restores the recorded damage only if HP and Temporary HP still match the state after this use (current HP ${hp.value}, Temporary HP ${hp.temp ?? 0}).`;
      }
    },
    effect: {
      async apply(source, useId, entry, target) {
        const existing = values(target.effects).find(effect => flag(effect, vanguardUses.effectFlag)?.opId === useId && flag(effect, vanguardUses.effectFlag)?.sourceUuid === source.uuid);
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
        const updates = { [`flags.ak5e.${vanguardUses.effectFlag}`]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) } };
        if (entry.standardBenefit) {
          updates["flags.ak5e.standardBenefit"] = entry.standardBenefit;
        }
        try { await effect.update(updates); }
        catch (error) { await effect.delete(); throw error; }
        return true;
      },
      async revert(source, useId, _entry, target) {
        const effects = values(target.effects).filter(effect => flag(effect, vanguardUses.effectFlag)?.opId === useId && flag(effect, vanguardUses.effectFlag)?.sourceUuid === source.uuid);
        if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
        return { removed: effects.length };
      },
      preview(_source, receipt, entry, target) {
        const present = values(target?.effects).some(effect => flag(effect, vanguardUses.effectFlag)?.opId === receipt.id);
        return present ? `${entry.name}: removes ${entry.tag?.label ?? "the effect"}.` : `${entry.name}: ${entry.tag?.label ?? "the effect"} is already gone; nothing to remove.`;
      }
    }
  }
});

CORE_PLANS.uncannyDodge.validateTarget = (source, receipt, entry, target) =>
  entry.uuid === source.uuid && target.uuid === source.uuid && entry.kind === "damage" &&
  Number.isInteger(entry.amount) && entry.amount === receipt.result?.halvedDamage;

const exactData = (actual, expected) => {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual) !== Array.isArray(expected)) return false;
  if (Array.isArray(actual)) return actual.length === expected.length && actual.every((value, index) => exactData(value, expected[index]));
  const keys = Object.keys(actual).sort(), expectedKeys = Object.keys(expected).sort();
  return exactData(keys, expectedKeys) && keys.every(key => exactData(actual[key], expected[key]));
};
CORE_PLANS.tipOfTheSpear.validateTarget = (source, receipt, entry, target) => {
  if (entry.uuid !== receipt.targetUuid || target.uuid !== receipt.targetUuid || entry.name !== receipt.targetName) return false;
  const outcome = Number(receipt.outcome), pb = Number(receipt.result?.damageBonus);
  if (outcome === 2) return entry.kind === "tipTemporaryHP" && entry.mode === "additive" && entry.ready === true &&
    ["expire", "retain"].includes(receipt.tipTemporaryHpReading) &&
    Number.isInteger(entry.amount) && entry.amount >= 1 && entry.amount <= 6 && Number(receipt.roll) === entry.amount;
  if (![1, 3, 4, 5, 6].includes(outcome) || entry.kind !== "effect" || entry.ready !== true ||
      entry.featureId !== "class-feature-vanguard-1st-level-tip-of-the-spear-3092") return false;
  const base = { trigger: "turnStart", expiryActor: "source", changes: [], instructions: TIP_INSTRUCTIONS[outcome - 1] };
  if (outcome === 1) return Number.isInteger(pb) && pb >= 0 && exactData(entry.standardBenefit, { kind: "tip1", value: pb, bearerUuid: source.uuid }) &&
    exactData(entry.meta?.standardBenefit, { kind: "tip1", value: pb, bearerUuid: source.uuid }) &&
    entry.meta?.sourceUseId === receipt.id &&
    Number.isFinite(Number(entry.meta?.createdAt)) && Number(entry.meta.createdAt) > 0 &&
    exactData(entry.tag, { ...base, label: `Tip of the Spear: +${pb} Damage`, actions: ["used"] });
  if (outcome === 3) {
    const allowedModes = ["walk", "fly", "swim", "climb", "burrow"];
    const modes = receipt.tipSpeedModes;
    if (!Array.isArray(modes) || !exactData(modes, allowedModes.filter(mode => modes.includes(mode)))) return false;
    const movement = Object.fromEntries(modes.map(mode => [mode, 1]));
    return entry.standardBenefit === undefined && exactData(entry.tag, { ...base, label: "Tip of the Spear: Speed +10 ft",
      changes: TIP_OUTCOMES[2].changes({ system: { attributes: { movement } } }) });
  }
  if (outcome === 4) return entry.standardBenefit === undefined && exactData(entry.tag, { ...base, label: "Tip of the Spear: +2 to Attack Rolls",
    changes: attackChanges(2) });
  if (outcome === 5) return exactData(entry.standardBenefit, { kind: "tip5", value: 1 }) &&
    exactData(entry.tag, { ...base, label: "Tip of the Spear: Critical Range +1" });
  return exactData(entry.standardBenefit, { kind: "tip6", value: 1, bearerUuid: source.uuid }) &&
    exactData(entry.meta?.standardBenefit, { kind: "tip6", value: 1, bearerUuid: source.uuid }) &&
    entry.meta?.sourceUseId === receipt.id &&
    Number.isFinite(Number(entry.meta?.createdAt)) && Number(entry.meta.createdAt) > 0 &&
    exactData(entry.tag, { ...base, label: "Tip of the Spear: +1 Skill Point" });
};

CORE_PLANS.settleTipTemporaryHp.validateTarget = (source, receipt, entry, target) => {
  const data = receipt.data, use = vanguardUses.receipt(source, data?.useId);
  const grant = reconcilableTipGrant(source, use, target, receipt.id);
  return Boolean(use && use.command === "tipOfTheSpear" && use.outcome === 2 && use.status !== "undone" && grant &&
    (use.tipBoundaryReached || data.manualBoundary === true) &&
    (!isLocked(use) || game.user.isGM) && typeof data.reason === "string" && data.reason.trim().length >= 10 &&
    entry.kind === "tipTemporaryHPSettlement" && entry.tipUseId === use.id &&
    entry.uuid === use.targetUuid && target.uuid === use.targetUuid &&
    Number.isInteger(data.remaining) && data.remaining >= 0 && data.remaining <= grant.amount &&
    entry.amount === (use.tipTemporaryHpReading === "expire" ? data.remaining : 0) &&
    entry.expectedTemp === data.expectedTemp && entry.expectedRevision === data.expectedRevision);
};
CORE_PLANS.settleTipTemporaryHp.validateRevert = (source, receipt, entry, target) => {
  const applied = tipRecord(source, receipt.id, target);
  return entry.kind === "tipTemporaryHPSettlement" && applied?.tipTemporaryHpSettlement === true &&
    applied.tipUseId === entry.tipUseId && applied.removed >= 0 && applied.removed <= 6;
};

// Uses and rolls go through the generic confirmed command API. No implicit
// confirmation or programmatic dice path is exposed.

const commandVanguardUse = vanguardUses.command;
vanguardUses.command = async function(actor, name, data = {}, operationId, requester = game.user) {
  const before = structuredClone(flag(actor, "operatorSkills")?.operatorEvents ?? []);
  const result = await commandVanguardUse(actor, name, data, operationId, requester);
  const after = flag(actor, "operatorSkills")?.operatorEvents ?? [];
  const profile = vanguardProfile(actor);
  const notify = (event, state, reason) => notifyVanguardOperatorCommit({ actor, actorUuid: actor.uuid, branchId: profile.branchId,
    event: Object.freeze(structuredClone(event)), state, reason, requestId: operationId ?? data.useId, initiatingUserId: requester.id });
  for (const event of after.filter(event => event.committed && event.kind === "grant" && !before.some(previous => previous.id === event.id))) await notify(event, "present", "commit");
  for (const event of before.filter(event => !after.some(current => current.id === event.id))) await notify(event, "removed", "undo");
  return result;
};

vanguardUses.undo = async function(actor, useId) {
  const use = vanguardUses.receipt(actor, useId);
  const before = use?.command === "undoOperatorActivation" ? (flag(actor, "operatorSkills")?.operatorEvents ?? []).filter(event => event.activationId === use.activationId).map(event => structuredClone(event)) : [];
  const result = await vanguardUses.command(actor, "undoUse", { useId });
  const remaining = flag(actor, "operatorSkills")?.operatorEvents ?? [];
  const profile = vanguardProfile(actor);
  for (const event of before.filter(event => !remaining.some(candidate => candidate.id === event.id))) {
    await notifyVanguardOperatorCommit({ actor, actorUuid: actor.uuid, branchId: profile.branchId, event: Object.freeze(event),
      state: "removed", reason: "undo", requestId: useId, initiatingUserId: game.user.id });
  }
  return result;
};

vanguardUses.plan = function(actor, name, data = {}) {
  const planFn = CORE_PLANS[name];
  need(planFn, `Unknown Vanguard plan ${name}.`);
  const state = vanguardUses.state(actor);
  const plan = planFn(actor, state, data);
  if (plan.warnings?.length) {
    requireOverrides(plan.warnings, data.overrides ?? data.overridden);
  }
  return plan;
};
