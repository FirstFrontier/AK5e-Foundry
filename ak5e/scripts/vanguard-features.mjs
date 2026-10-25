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
import { spendReaction, getReactions } from "./trigger-events.mjs";

/* ---------------------------------------------------------------- Landstrider (Lv 1) */

export function hasLandstrider(actor) {
  const lvl = vanguardLevel(actor);
  return Boolean(lvl && lvl >= 1);
}

/** Record a creature hit by the Vanguard so they do not provoke Opportunity Attacks from it this turn. */
export async function recordNimbleTarget(actor, target) {
  need(hasLandstrider(actor), "Landstrider is a Vanguard 1st level feature.");
  const targetUuid = target?.uuid ?? target?.actor?.uuid ?? String(target);
  need(targetUuid, "Target creature identifier is required for Nimble.");
  const state = flag(actor, "vanguard") ?? {};
  const current = state.nimbleTargets ?? [];
  if (!current.includes(targetUuid)) {
    const updated = [...current, targetUuid];
    await actor.update({ "flags.ak5e.vanguard.nimbleTargets": updated });
    return updated;
  }
  return current;
}

export function isNimbleAgainst(actor, target) {
  if (!hasLandstrider(actor)) return false;
  const targetUuid = target?.uuid ?? target?.actor?.uuid ?? String(target);
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
  return Boolean(lvl && lvl >= 3);
}

export function quickOffTheMarkBonus(actor) {
  if (!hasQuickOffTheMark(actor)) return 0;
  return Number(actor?.system?.attributes?.prof ?? 2);
}

export function applyQuickOffTheMark(actor, rollData = {}) {
  const bonus = quickOffTheMarkBonus(actor);
  if (!bonus) return rollData;
  return {
    ...rollData,
    initiativeBonus: (Number(rollData.initiativeBonus) || 0) + bonus
  };
}

/* ---------------------------------------------------------------- Extra Attack (Lv 5) */

export function extraAttacksCount(actor) {
  const lvl = vanguardLevel(actor);
  return (lvl && lvl >= 5) ? 1 : 0;
}

/* ---------------------------------------------------------------- Uncanny Dodge (Lv 11) */

export function hasUncannyDodge(actor) {
  const lvl = vanguardLevel(actor);
  return Boolean(lvl && lvl >= 11);
}

export function calculateUncannyDodge(damage) {
  const dmg = Number(damage);
  need(Number.isFinite(dmg) && dmg >= 0, "Damage must be a non-negative number.");
  return Math.floor(dmg / 2);
}

export async function executeUncannyDodge(actor, { damage, attacker, receiptId = null } = {}) {
  need(hasUncannyDodge(actor), "Uncanny Dodge is a Vanguard 11th level feature.");
  const reactions = getReactions(actor);
  need(reactions?.available >= 1, `${actor.name} has no Reaction remaining.`);

  const rx = await spendReaction(actor, {
    triggerId: receiptId ? `${receiptId}-uncannyDodge` : `uncannyDodge-${Date.now()}`,
    receipt: receiptId ?? `uncannyDodge-${Date.now()}`
  });
  need(rx.ok, "Reaction expenditure failed.");

  const halved = calculateUncannyDodge(damage);
  return {
    halvedDamage: halved,
    damageReduced: damage - halved,
    attackerUuid: attacker?.uuid ?? attacker?.actor?.uuid ?? null,
    reactionSpent: true
  };
}

/* ---------------------------------------------------------------- Directed Engagement (Lv 15) */

export function hasDirectedEngagement(actor) {
  const lvl = vanguardLevel(actor);
  return Boolean(lvl && lvl >= 15);
}

export async function activateDirectedEngagement(actor, { receiptId = null } = {}) {
  need(hasDirectedEngagement(actor), "Directed Engagement is a Vanguard 15th level feature.");
  const reactions = getReactions(actor);
  need(reactions?.available >= 1, `${actor.name} has no Reaction remaining.`);

  const rx = await spendReaction(actor, {
    triggerId: receiptId ? `${receiptId}-directedEngagement` : `directedEngagement-${Date.now()}`,
    receipt: receiptId ?? `directedEngagement-${Date.now()}`
  });
  need(rx.ok, "Reaction expenditure failed.");

  await actor.update({ "flags.ak5e.vanguard.directedEngagementActive": true });
  return { success: true, reactionSpent: true };
}

export function isDirectedEngagementActive(actor) {
  const state = flag(actor, "vanguard") ?? {};
  if (!state.directedEngagementActive) return false;
  const turn = state.directedEngagementTurn;
  if (!turn?.combatId) return true; // Outside combat, use the manual expiry procedure.
  const combat = globalThis.game?.combat, current = combat?.combatant;
  return Boolean(combat?.started && combat.uuid === turn.combatId && Number(combat.round) === Number(turn.round) && current?.id === turn.combatantId);
}

export async function clearDirectedEngagement(actor) {
  const state = flag(actor, "vanguard") ?? {};
  if (state.directedEngagementActive) {
    await actor.update({ "flags.ak5e.vanguard.directedEngagementActive": false, "flags.ak5e.vanguard.directedEngagementTurn": null });
  }
}

/* ---------------------------------------------------------------- Lightspeed (Lv 18) */

export function hasLightspeed(actor) {
  const lvl = vanguardLevel(actor);
  return Boolean(lvl && lvl >= 18);
}

export function lightspeedSecondInitiative(initiative) {
  const init = Number(initiative);
  need(Number.isFinite(init), "Initiative must be a valid number.");
  return init - 10;
}

export function isLightspeedApplicable(actor, combat) {
  if (!hasLightspeed(actor)) return false;
  return Boolean(combat && combat.round === 1);
}

/* ---------------------------------------------------------------- Approaching Storm (Lv 20) */

export function hasApproachingStorm(actor) {
  const lvl = vanguardLevel(actor);
  return Boolean(lvl && lvl >= 20);
}

export function approachingStormDamageBonus(actor, combat = globalThis.game?.combat) {
  if (!hasApproachingStorm(actor)) return 0;
  if (!combat?.started || Number(combat.round) !== 1) return 0;
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
  if (directed) {
    need(hasDirectedEngagement(actor), "Directed Engagement requires Vanguard level 15.");
    need(choice !== null && choice !== undefined, "A specific outcome (1-6) must be chosen for Directed Engagement.");
  }

  const item = { name: "Tip of the Spear" };
  return await useTip({
    actor,
    item,
    target,
    op,
    directed,
    choice,
    helpers
  });
}
