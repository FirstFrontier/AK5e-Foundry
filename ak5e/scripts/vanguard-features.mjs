/** Vanguard runtime features and mechanical hooks (Ch. 3 L7904–8085).
 * Landstrider, Quick off the Mark, Tip of the Spear, Directed Engagement,
 * Extra Attack, Uncanny Dodge, Lightspeed, and Approaching Storm.
 */
import {
  vanguardLevel, vanguardEnabled, checkLevel, flag,
  approachingStormBonus, landstriderSpeedBonus
} from "./vanguard-rules.mjs";
import { TIP_INSTRUCTIONS } from "./standard-bearer-rules.mjs";
import { useTip, TIP_OUTCOMES, validateTipTarget } from "./tip-of-the-spear.mjs";
import { need, opaqueKey } from "./operation-kernel.mjs";
import { spendReaction, refundReaction, getReactions } from "./trigger-events.mjs";

/* ---------------------------------------------------------------- Landstrider (Lv 1) */

export function hasLandstrider(actor) {
  return vanguardEnabled(actor);
}

/** Resolve a creature identifier without ever stringifying a missing object. */
function validTargetUuid(target) {
  const candidate = typeof target === "string" ? target : (target?.uuid ?? target?.actor?.uuid);
  if (typeof candidate !== "string") return null;
  const id = candidate.trim();
  if (!id || /^(undefined|null)$/i.test(id)) return null;
  return id;
}

function activeTurnReference() {
  const combat = globalThis.game?.combat, combatant = combat?.combatant;
  if (!combat?.started || !combatant?.id || typeof combat.uuid !== "string" || !combat.uuid) return null;
  // Nimble and Directed Engagement last until the end of the current Turn in
  // any combat round; only Lightspeed and Approaching Storm are Round-1 gates.
  const round = Number(combat.round);
  if (!Number.isInteger(round) || round < 1) return null;
  return { combatId: combat.uuid, round, combatantId: combatant.id };
}

function isRoundOne(value) {
  if (value === null || value === undefined || typeof value === "boolean" ||
      Array.isArray(value) || typeof value === "object") return false;
  return Number(value) === 1;
}

/** Record a creature hit by the Vanguard so they do not provoke Opportunity Attacks from it this turn. */
export async function recordNimbleTarget(actor, target) {
  need(hasLandstrider(actor), "Landstrider is a Vanguard 1st level feature.");
  const targetUuid = validTargetUuid(target);
  need(targetUuid, "A valid Target creature identifier is required for Nimble.");
  const state = flag(actor, "vanguard") ?? {};
  const current = Array.isArray(state.nimbleTargets) ? state.nimbleTargets : [];
  const turn = activeTurnReference();
  const unchangedTurn = JSON.stringify(state.nimbleTurn ?? null) === JSON.stringify(turn);
  if (current.includes(targetUuid) && unchangedTurn) return current;
  const updated = current.includes(targetUuid) ? current : [...current, targetUuid];
  await actor.update({
    "flags.ak5e.vanguard.nimbleTargets": updated,
    "flags.ak5e.vanguard.nimbleTurn": turn
  });
  return updated;
}

export function isNimbleAgainst(actor, target) {
  if (!hasLandstrider(actor)) return false;
  const targetUuid = validTargetUuid(target);
  if (!targetUuid) return false;
  const state = flag(actor, "vanguard") ?? {};
  const turn = state.nimbleTurn;
  if (turn?.combatId) {
    const combat = globalThis.game?.combat;
    if (!combat?.started || combat.uuid !== turn.combatId || Number(combat.round) !== Number(turn.round) || combat.combatant?.id !== turn.combatantId) return false;
  }
  const targets = state.nimbleTargets ?? [];
  return targets.includes(targetUuid);
}

export async function clearNimbleTargets(actor) {
  const state = flag(actor, "vanguard") ?? {};
  if (state.nimbleTargets?.length || state.nimbleTurn) {
    await actor.update({ "flags.ak5e.vanguard.nimbleTargets": [], "flags.ak5e.vanguard.nimbleTurn": null });
  }
}

/* ---------------------------------------------------------------- Quick off the Mark (Lv 3) */

export function hasQuickOffTheMark(actor) {
  const lvl = vanguardLevel(actor);
  return vanguardEnabled(actor) && Boolean(lvl && lvl >= 3);
}

export function quickOffTheMarkBonus(actor) {
  if (!hasQuickOffTheMark(actor)) return 0;
  const raw = actor?.system?.attributes?.prof;
  need(raw !== null && raw !== undefined && raw !== "" && typeof raw !== "boolean",
    "The Actor's shared Proficiency Bonus must be a non-negative integer.");
  const pb = Number(raw);
  need(Number.isInteger(pb) && pb >= 0, "The Actor's shared Proficiency Bonus must be a non-negative integer.");
  return pb;
}

export function applyQuickOffTheMark(actor, rollData = {}) {
  const bonus = quickOffTheMarkBonus(actor);
  if (!bonus) return rollData;
  const current = Number(rollData.initiativeBonus ?? 0);
  need(Number.isFinite(current), "The native Initiative bonus must be a finite number.");
  return {
    ...rollData,
    initiativeBonus: current + bonus
  };
}

/* ---------------------------------------------------------------- Extra Attack (Lv 5) */

export function extraAttacksCount(actor) {
  const lvl = vanguardLevel(actor);
  return vanguardEnabled(actor) && lvl && lvl >= 5 ? 1 : 0;
}

/* ---------------------------------------------------------------- Uncanny Dodge (Lv 11) */

export function hasUncannyDodge(actor) {
  const lvl = vanguardLevel(actor);
  return vanguardEnabled(actor) && Boolean(lvl && lvl >= 11);
}

export function calculateUncannyDodge(damage) {
  if (damage === null || damage === undefined || damage === "" || typeof damage === "boolean") {
    throw new RangeError("Damage must be a non-negative whole number.");
  }
  const dmg = Number(damage);
  need(Number.isInteger(dmg) && dmg >= 0, "Damage must be a non-negative whole number.");
  return Math.floor(dmg / 2);
}

export async function executeUncannyDodge(actor, { damage, attacker, receiptId = null } = {}) {
  need(hasUncannyDodge(actor), "Uncanny Dodge is a Vanguard 11th level feature.");
  // Validate the complete input before spending the Reaction: an invalid damage
  // value must never leave the character without their Reaction (C3 L8041).
  const halved = calculateUncannyDodge(damage);
  const dmg = Number(damage);
  if (receiptId !== null && receiptId !== undefined) {
    need(typeof receiptId === "string" && receiptId.trim(), "A Reaction receipt id must be a non-empty string.");
  }
  const reactions = getReactions(actor);
  need(reactions?.available >= 1, `${actor.name} has no Reaction remaining.`);

  const receipt = receiptId ?? `uncannyDodge-${Date.now()}`;
  const rx = await spendReaction(actor, {
    triggerId: receiptId ? `${receiptId}-uncannyDodge` : receipt,
    receipt
  });
  need(rx.ok, "Reaction expenditure failed.");

  return {
    halvedDamage: halved,
    damageReduced: dmg - halved,
    attackerUuid: attacker?.uuid ?? attacker?.actor?.uuid ?? null,
    reactionSpent: true
  };
}

/* ---------------------------------------------------------------- Directed Engagement (Lv 15) */

export function hasDirectedEngagement(actor) {
  const lvl = vanguardLevel(actor);
  return vanguardEnabled(actor) && Boolean(lvl && lvl >= 15);
}

export async function activateDirectedEngagement(actor, { receiptId = null } = {}) {
  need(hasDirectedEngagement(actor), "Directed Engagement is a Vanguard 15th level feature.");
  if (receiptId !== null && receiptId !== undefined) {
    need(typeof receiptId === "string" && receiptId.trim(), "A Reaction receipt id must be a non-empty string.");
  }
  const reactions = getReactions(actor);
  need(reactions?.available >= 1, `${actor.name} has no Reaction remaining.`);

  const receipt = receiptId ?? `directedEngagement-${Date.now()}`;
  const rx = await spendReaction(actor, {
    triggerId: receiptId ? `${receiptId}-directedEngagement` : receipt,
    receipt
  });
  need(rx.ok, "Reaction expenditure failed.");

  try {
    await actor.update({
      "flags.ak5e.vanguard.directedEngagementActive": true,
      "flags.ak5e.vanguard.directedEngagementTurn": activeTurnReference()
    });
  } catch (error) {
    // The Reaction was already spent; refund it so a failed write cannot leave
    // the character unable to use Directed Engagement at all.
    await refundReaction(actor, { receipt }).catch(() => {});
    throw error;
  }
  return { success: true, reactionSpent: true };
}

export function isDirectedEngagementActive(actor) {
  if (!vanguardEnabled(actor)) return false;
  const state = flag(actor, "vanguard") ?? {};
  if (!state.directedEngagementActive) return false;
  const turn = state.directedEngagementTurn;
  if (!turn?.combatId) return true; // Outside combat, use the manual expiry procedure.
  const combat = globalThis.game?.combat, current = combat?.combatant;
  return Boolean(combat?.started && combat.uuid === turn.combatId && Number(combat.round) === Number(turn.round) && current?.id === turn.combatantId);
}

export async function clearDirectedEngagement(actor) {
  const state = flag(actor, "vanguard") ?? {};
  if (state.directedEngagementActive || state.directedEngagementTurn) {
    await actor.update({ "flags.ak5e.vanguard.directedEngagementActive": false, "flags.ak5e.vanguard.directedEngagementTurn": null });
  }
}

/* ---------------------------------------------------------------- Lightspeed (Lv 18) */

export function hasLightspeed(actor) {
  const lvl = vanguardLevel(actor);
  return vanguardEnabled(actor) && Boolean(lvl && lvl >= 18);
}

export function lightspeedSecondInitiative(initiative) {
  if (initiative === null || initiative === undefined || initiative === "" || typeof initiative === "boolean" ||
      Array.isArray(initiative) || typeof initiative === "object") {
    throw new RangeError("Initiative must be a finite number.");
  }
  const init = Number(initiative);
  need(Number.isFinite(init), "Initiative must be a finite number.");
  return Math.floor(init) - 10;
}

export function isLightspeedApplicable(actor, combat) {
  if (!hasLightspeed(actor)) return false;
  if (combat?.started !== true) return false;
  return isRoundOne(combat.round);
}

/* ---------------------------------------------------------------- Approaching Storm (Lv 20) */

export function hasApproachingStorm(actor) {
  const lvl = vanguardLevel(actor);
  return vanguardEnabled(actor) && Boolean(lvl && lvl >= 20);
}

export function approachingStormDamageBonus(actor, combat = globalThis.game?.combat) {
  if (!hasApproachingStorm(actor)) return 0;
  if (combat?.started !== true || !isRoundOne(combat.round)) return 0;
  const lvl = vanguardLevel(actor);
  return approachingStormBonus(lvl);
}

/* ---------------------------------------------------------------- Additive Temporary HP Helper */

/**
 * Applies additive Temporary HP per explicit source rule exception for Tip of the Spear #2 (L8003).
 * Unlike native D&D5e (which takes Math.max), this adds the amount to current THP.
 */
export async function applyAdditiveTempHP(targetActor, amount, { source = null, id = null } = {}) {
  const target = targetActor?.actor ?? targetActor;
  need(target?.system?.attributes?.hp, "Target must have HP attributes.");
  const amt = Number(amount);
  need(Number.isInteger(amt) && amt > 0, "Temporary HP amount must be a positive integer.");

  const currentTHP = Number(target.system.attributes.hp.temp ?? 0);
  const newTHP = currentTHP + amt;

  await target.update({
    "system.attributes.hp.temp": newTHP
  });

  return {
    before: currentTHP,
    after: newTHP,
    added: amt,
    additive: true,
    sourceUuid: source?.uuid ?? null,
    id
  };
}

/* ---------------------------------------------------------------- Tip of the Spear Wrapper */

export { TIP_OUTCOMES, TIP_INSTRUCTIONS, validateTipTarget };

/**
 * Execute Tip of the Spear for a Vanguard actor.
 * Automatically checks Directed Engagement if `directed` is requested.
 */
export async function executeTipOfTheSpear({
  actor,
  target,
  choice = null,
  directed = false,
  op = { id: `tip-${Date.now()}` },
  helpers
}) {
  need(hasLandstrider(actor), "Tip of the Spear requires the Vanguard class.");
  need(typeof target?.actor?.uuid === "string" && target.actor.uuid.trim(),
    "Choose a creature to receive Tip of the Spear.");
  need(typeof op?.id === "string" && op.id.trim(), "Tip of the Spear needs a stable operation id.");
  need(helpers && typeof helpers === "object" && !Array.isArray(helpers), "Tip of the Spear requires its helper adapters.");
  if (directed) {
    need(hasDirectedEngagement(actor), "Directed Engagement requires Vanguard level 15.");
    need(Number.isInteger(choice) && choice >= 1 && choice <= 6,
      "A specific outcome (1-6) must be chosen for Directed Engagement.");
  }

  const item = { name: "Tip of the Spear" };
  return await useTip({
    actor,
    item,
    target,
    op: { ...op, id: op.id.trim() },
    directed,
    choice,
    helpers
  });
}
