import { vanguardEnabled, flag } from "./vanguard-rules.mjs";
import { vanguardState } from "./vanguard-rules.mjs";
import { clearNimbleTargets, clearDirectedEngagement } from "./vanguard-features.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { vanguardBenefitPreRoll, registerVanguardBenefitHooks } from "./vanguard-benefits.mjs";

let installed = false;
let eventsInstalled = false;
const warnedStorm = new Set();
const collection = value => Array.from(value?.values?.() ?? value ?? []);

function actorsForExpiry(event) {
  const actors = [event?.raw?.actor, ...collection(globalThis.game?.actors),
    ...collection(globalThis.canvas?.tokens?.placeables).map(token => token.actor)].filter(Boolean);
  return [...new Map(actors.map(actor => [actor.uuid, actor])).values()];
}

async function expireVanguardTurnState(event) {
  if (!event?.combatUuid || !event?.combatantId) return;
  const endedActor = event.raw?.actor;
  for (const actor of actorsForExpiry(event)) {
    if (!vanguardEnabled(actor)) continue;
    const state = vanguardState(actor), updates = {};
    const nimbleTurn = state.nimbleTurn;
    if ((nimbleTurn?.combatId === event.combatUuid && nimbleTurn.combatantId === event.combatantId && Number(nimbleTurn.round) === Number(event.round)) ||
        (endedActor?.uuid === actor.uuid && state.nimbleTargets?.length && !nimbleTurn?.combatId)) {
      updates["flags.ak5e.vanguard.nimbleTargets"] = [];
      updates["flags.ak5e.vanguard.nimbleTurn"] = null;
    }
    const directed = state.directedEngagementTurn;
    if (state.directedEngagementActive && directed?.combatId === event.combatUuid &&
        directed.combatantId === event.combatantId && Number(directed.round) === Number(event.round)) {
      updates["flags.ak5e.vanguard.directedEngagementActive"] = false;
      updates["flags.ak5e.vanguard.directedEngagementTurn"] = null;
    }
    if (Object.keys(updates).length) await actor.update(updates);
  }
}

async function expireVanguardCombatState(event) {
  for (const actor of actorsForExpiry(event)) {
    if (!vanguardEnabled(actor)) continue;
    const state = vanguardState(actor), updates = {};
    if (state.nimbleTurn?.combatId === event.combatUuid) {
      updates["flags.ak5e.vanguard.nimbleTargets"] = [];
      updates["flags.ak5e.vanguard.nimbleTurn"] = null;
    }
    if (state.directedEngagementTurn?.combatId === event.combatUuid) {
      updates["flags.ak5e.vanguard.directedEngagementActive"] = false;
      updates["flags.ak5e.vanguard.directedEngagementTurn"] = null;
    }
    if (Object.keys(updates).length) await actor.update(updates);
  }
}

/** Add Approaching Storm to native damage rolls, without rolling or applying damage. */
export function vanguardPreRollDamage(config, dialog, message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor) return;
  vanguardBenefitPreRoll(config, dialog, message);
  if (!vanguardEnabled(actor)) return;
  const rolls = config.rolls ?? [];
  if (!rolls.length || config._ak5eApproachingStorm) return;
  const combat = globalThis.game?.combat, armed = flag(actor, "vanguard.approachingStormArmed");
  if (!armed) return;
  if (armed.combatId !== (combat?.uuid ?? null) || Number(armed.round) !== Number(combat?.round ?? 1)) {
    if (!warnedStorm.has(armed.useId)) {
      warnedStorm.add(armed.useId);
      globalThis.ui?.notifications?.warn?.("Approaching Storm was armed for a different combat/round. This native Damage Roll was left unchanged; review the use receipt with the GM.");
    }
    return;
  }
  // The warning/Use anyway choice is part of the committed use. Do not silently
  // erase its chosen bonus by re-applying the level gate here.
  const bonus = Math.max(0, Math.trunc(Number(armed.bonus) || 0));
  if (!bonus) return;
  const candidates = [...new Set(rolls)].filter(candidate => Array.isArray(candidate?.parts));
  if (!candidates.length) return;
  const reading = armed.reading;
  if (!['once', 'perRoll'].includes(reading)) return;
  const selected = reading === 'perRoll' ? candidates : [candidates[Number(armed.componentIndex) || 0]].filter(Boolean);
  if (!selected.length) {
    if (!warnedStorm.has(armed.useId)) {
      warnedStorm.add(armed.useId);
      globalThis.ui?.notifications?.warn?.(`Approaching Storm component ${armed.componentIndex} is not present in this Damage Roll. The roll was left unchanged; review the use receipt with the GM.`);
    }
    return;
  }
  for (const roll of selected) {
    roll.parts.push(String(bonus));
    roll.options ??= {};
    roll.options._ak5eApproachingStorm = { actorUuid: actor.uuid, bonus, round: combat?.round ?? 1, useId: armed.useId, reading };
  }
  config._ak5eApproachingStorm = true;
}

/** Consume the optional activation only after D&D5e has produced its damage roll. */
export async function vanguardPostRollDamage(rolls, data) {
  const markers = (rolls ?? []).map(roll => roll?.options?._ak5eApproachingStorm).filter(Boolean);
  if (!markers.length) return;
  const activity = data?.subject, actor = activity?.actor;
  if (!actor?.isOwner || !vanguardEnabled(actor)) return;
  const marker = markers.find(entry => entry.actorUuid === actor.uuid);
  if (!marker) return;
  const state = flag(actor, "vanguardUses") ?? {}, receipt = state.undo?.find(entry => entry.id === marker.useId);
  if (!receipt || receipt.command !== "approachingStorm" || receipt.approachingStormApplied) return;
  receipt.approachingStormApplied = { bonus: marker.bonus, round: marker.round, reading: marker.reading };
  receipt.undoNotes = [...(receipt.undoNotes ?? []), "The native damage roll already made with Approaching Storm remains in chat after undo." ];
  const flagChanges = receipt.flagChanges?.find(change => change.path === "flags.ak5e.vanguard.approachingStormArmed");
  if (flagChanges) flagChanges.after = null;
  await actor.update({ "flags.ak5e.vanguard.approachingStormArmed": null, "flags.ak5e.vanguardUses.undo": state.undo });
}

/** Optional, owner-armed PB added to D&D5e's native, still-unrolled Initiative roll. */
export function vanguardPreConfigureInitiative(actor, config) {
  if (!actor?.isOwner || !vanguardEnabled(actor) || !Array.isArray(config?.parts)) return;
  const armed = flag(actor, "vanguard.quickOffTheMarkArmed");
  if (!armed || config._ak5eQuickOffTheMark) return;
  const bonus = Math.max(0, Math.trunc(Number(armed.bonus) || 0));
  if (!bonus) return;
  config.parts.push(String(bonus));
  config.options ??= {};
  config.options._ak5eQuickOffTheMark = { actorUuid: actor.uuid, useId: armed.useId, bonus };
  config._ak5eQuickOffTheMark = true;
}

/** Consume Quick off the Mark only after D&D5e successfully adds the Initiative roll. */
export async function vanguardPostRollInitiative(actor) {
  if (!actor?.isOwner || !vanguardEnabled(actor)) return;
  const armed = flag(actor, "vanguard.quickOffTheMarkArmed");
  const marker = actor._cachedInitiativeRoll?.options?._ak5eQuickOffTheMark;
  if (!armed || !marker || marker.actorUuid !== actor.uuid || marker.useId !== armed.useId) return;
  const state = flag(actor, "vanguardUses") ?? {}, receipt = state.undo?.find(entry => entry.id === marker.useId);
  if (!receipt || receipt.command !== "quickOffTheMark" || receipt.quickOffTheMarkApplied) return;
  receipt.quickOffTheMarkApplied = { bonus: marker.bonus };
  receipt.undoNotes = [...(receipt.undoNotes ?? []), "The native Initiative roll already made with Quick off the Mark remains in combat after undo."];
  const flagChange = receipt.flagChanges?.find(change => change.path === "flags.ak5e.vanguard.quickOffTheMarkArmed");
  if (flagChange) flagChange.after = null;
  await actor.update({ "flags.ak5e.vanguard.quickOffTheMarkArmed": null, "flags.ak5e.vanguardUses.undo": state.undo });
}

export function registerVanguardResolution() {
  if (installed) return;
  installed = true;
  if (!eventsInstalled) {
    eventsInstalled = true;
    onAk5eEvent("turnEnd", expireVanguardTurnState);
    onAk5eEvent("combatEnd", expireVanguardCombatState);
  }
  registerVanguardBenefitHooks();
  globalThis.Hooks?.on?.("dnd5e.preRollDamageV2", vanguardPreRollDamage);
  globalThis.Hooks?.on?.("dnd5e.rollDamageV2", vanguardPostRollDamage);
  globalThis.Hooks?.on?.("dnd5e.preConfigureInitiative", vanguardPreConfigureInitiative);
  globalThis.Hooks?.on?.("dnd5e.rollInitiative", actor => { void vanguardPostRollInitiative(actor).catch(error => console.error("AK5e | Quick off the Mark", error)); });
}
