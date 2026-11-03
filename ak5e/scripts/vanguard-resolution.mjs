import { vanguardEnabled, flag } from "./vanguard-rules.mjs";
import { vanguardState } from "./vanguard-rules.mjs";
import { clearNimbleTargets, clearDirectedEngagement } from "./vanguard-features.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { vanguardBenefitPreRoll, registerVanguardBenefitHooks } from "./vanguard-benefits.mjs";

let installed = false;
let eventsInstalled = false;
const warnedStorm = new Set();
const warnedQuick = new Set();
const consuming = new Set();
const collection = value => Array.from(value?.values?.() ?? value ?? []);

/** A stored bonus is usable only as a positive whole number. */
function positiveWholeBonus(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A receipt identity cannot be a missing value stringified by a caller. */
function stableUseId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id && !/^(undefined|null)$/i.test(id) ? id : null;
}

function warnOnce(set, key, message) {
  if (set.has(key)) return;
  set.add(key);
  globalThis.ui?.notifications?.warn?.(message);
}

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
  if (!Array.isArray(rolls) || !rolls.length || config._ak5eApproachingStorm) return;
  const combat = globalThis.game?.combat, armed = flag(actor, "vanguard.approachingStormArmed");
  if (!armed || typeof armed !== "object" || Array.isArray(armed)) return;
  const useId = stableUseId(armed.useId), bonus = positiveWholeBonus(armed.bonus);
  const warningKey = useId ?? `${actor.uuid}:invalid`;
  if (!useId || bonus === null) {
    warnOnce(warnedStorm, warningKey, "Approaching Storm has malformed armed data. This native Damage Roll was left unchanged; review the use receipt with the GM.");
    return;
  }
  const combatId = typeof combat?.uuid === "string" && combat.uuid ? combat.uuid : null;
  // The timing warning was already confirmed when armed. Preserve the exact
  // armed round, but still reject stale or malformed combat snapshots.
  const rawRound = combat?.round ?? armed.round;
  const combatRound = typeof rawRound === "number" && Number.isInteger(rawRound) && rawRound >= 0 ? rawRound : null;
  if (combatRound === null) {
    warnOnce(warnedStorm, warningKey, "Approaching Storm has an invalid combat round. This native Damage Roll was left unchanged; review the use receipt with the GM.");
    return;
  }
  if (armed.combatId !== combatId || Number(armed.round) !== combatRound) {
    warnOnce(warnedStorm, warningKey, "Approaching Storm was armed for a different combat/round. This native Damage Roll was left unchanged; review the use receipt with the GM.");
    return;
  }
  // The warning/Use anyway choice is part of the committed use. Do not silently
  // erase its chosen bonus by re-applying the level gate here.
  const candidates = [...new Set(rolls)].filter(candidate => Array.isArray(candidate?.parts));
  if (!candidates.length) return;
  const reading = armed.reading;
  if (!['once', 'perRoll'].includes(reading)) {
    warnOnce(warnedStorm, warningKey, "Approaching Storm has an unrecognised component reading. This native Damage Roll was left unchanged; review the use receipt with the GM.");
    return;
  }
  const rawComponentIndex = armed.componentIndex;
  const componentIndex = typeof rawComponentIndex === "number" && Number.isInteger(rawComponentIndex) && rawComponentIndex >= 0
    ? rawComponentIndex : null;
  if (reading === 'once' && componentIndex === null) {
    warnOnce(warnedStorm, warningKey, "Approaching Storm has no valid native Damage Roll component. This roll was left unchanged; review the use receipt with the GM.");
    return;
  }
  const selected = reading === 'perRoll' ? candidates : [candidates[componentIndex]].filter(Boolean);
  if (!selected.length) {
    warnOnce(warnedStorm, warningKey, `Approaching Storm component ${componentIndex} is not present in this Damage Roll. The roll was left unchanged; review the use receipt with the GM.`);
    return;
  }
  for (const roll of selected) {
    roll.parts.push(String(bonus));
    roll.options ??= {};
    roll.options._ak5eApproachingStorm = { actorUuid: actor.uuid, bonus, combatId, round: combatRound, useId, reading };
  }
  config._ak5eApproachingStorm = true;
}

/** Consume the optional activation only after D&D5e has produced its damage roll. */
export async function vanguardPostRollDamage(rolls, data) {
  if (!Array.isArray(rolls) || !rolls.length) return;
  const markers = rolls.map(roll => roll?.options?._ak5eApproachingStorm)
    .filter(marker => marker && typeof marker === "object" && !Array.isArray(marker));
  if (!markers.length) return;
  const activity = data?.subject, actor = activity?.actor;
  if (!actor?.isOwner || !vanguardEnabled(actor)) return;
  const marker = markers.find(entry => entry.actorUuid === actor.uuid);
  if (!marker) return;
  const useId = stableUseId(marker.useId), bonus = positiveWholeBonus(marker.bonus);
  if (!useId || bonus === null) return;
  const armed = flag(actor, "vanguard.approachingStormArmed");
  if (!armed || typeof armed !== "object" || Array.isArray(armed)) return;
  if (stableUseId(armed.useId) !== useId || positiveWholeBonus(armed.bonus) !== bonus) return;
  if (marker.combatId !== armed.combatId || Number(marker.round) !== Number(armed.round) || marker.reading !== armed.reading) return;
  const currentCombatId = globalThis.game?.combat?.uuid ?? null;
  if (armed.combatId !== currentCombatId) return;
  const state = flag(actor, "vanguardUses") ?? {}, undo = Array.isArray(state.undo) ? state.undo : [];
  const receipt = undo.find(entry => entry.id === useId);
  if (!receipt || receipt.command !== "approachingStorm" || receipt.approachingStormApplied) return;
  const key = `${actor.uuid}:${useId}`;
  if (consuming.has(key)) return;
  consuming.add(key);
  try {
    receipt.approachingStormApplied = { bonus, round: marker.round ?? null, reading: marker.reading ?? null };
    receipt.undoNotes = [...(Array.isArray(receipt.undoNotes) ? receipt.undoNotes : []), "The native damage roll already made with Approaching Storm remains in chat after undo." ];
    const flagChanges = Array.isArray(receipt.flagChanges)
      ? receipt.flagChanges.find(change => change?.path === "flags.ak5e.vanguard.approachingStormArmed") : null;
    if (flagChanges) flagChanges.after = null;
    await actor.update({ "flags.ak5e.vanguard.approachingStormArmed": null, "flags.ak5e.vanguardUses.undo": undo });
  } finally {
    consuming.delete(key);
  }
}

/** Optional, owner-armed PB added to D&D5e's native, still-unrolled Initiative roll. */
export function vanguardPreConfigureInitiative(actor, config) {
  if (!actor?.isOwner || !vanguardEnabled(actor) || !Array.isArray(config?.parts)) return;
  const armed = flag(actor, "vanguard.quickOffTheMarkArmed");
  if (!armed || typeof armed !== "object" || Array.isArray(armed) || config._ak5eQuickOffTheMark) return;
  const useId = stableUseId(armed.useId), bonus = positiveWholeBonus(armed.bonus);
  if (!useId || bonus === null) {
    warnOnce(warnedQuick, useId ?? `${actor.uuid}:invalid`, "Quick off the Mark has malformed armed data. The Initiative roll was left unchanged; review the use receipt with the GM.");
    return;
  }
  const marker = { actorUuid: actor.uuid, useId, bonus };
  config.parts.push(String(bonus));
  config.options ??= {};
  config.options._ak5eQuickOffTheMark = marker;
  config._ak5eQuickOffTheMark = true;
  // D&D5e rebuilds the initiative roll from its own options, so keep a transient
  // actor-side marker for the post-roll hook as well as the config marker.
  actor._ak5eQuickOffTheMarkMarker = marker;
}

/** Consume Quick off the Mark only after D&D5e successfully adds the Initiative roll. */
export async function vanguardPostRollInitiative(actor) {
  if (!actor?.isOwner || !vanguardEnabled(actor)) return;
  const armed = flag(actor, "vanguard.quickOffTheMarkArmed");
  const cachedMarker = actor._cachedInitiativeRoll?.options?._ak5eQuickOffTheMark;
  const marker = cachedMarker ?? actor._ak5eQuickOffTheMarkMarker;
  if (!armed || typeof armed !== "object" || Array.isArray(armed) || !marker || typeof marker !== "object") return;
  if (marker.actorUuid !== actor.uuid || stableUseId(marker.useId) === null || marker.useId !== armed.useId) return;
  const bonus = positiveWholeBonus(marker.bonus);
  if (bonus === null) return;
  const state = flag(actor, "vanguardUses") ?? {}, undo = Array.isArray(state.undo) ? state.undo : [];
  const receipt = undo.find(entry => entry.id === marker.useId);
  if (!receipt || receipt.command !== "quickOffTheMark" || receipt.quickOffTheMarkApplied) return;
  const key = `${actor.uuid}:${marker.useId}`;
  if (consuming.has(key)) return;
  consuming.add(key);
  try {
    receipt.quickOffTheMarkApplied = { bonus };
    receipt.undoNotes = [...(Array.isArray(receipt.undoNotes) ? receipt.undoNotes : []), "The native Initiative roll already made with Quick off the Mark remains in combat after undo."];
    const flagChange = Array.isArray(receipt.flagChanges)
      ? receipt.flagChanges.find(change => change?.path === "flags.ak5e.vanguard.quickOffTheMarkArmed") : null;
    if (flagChange) flagChange.after = null;
    await actor.update({ "flags.ak5e.vanguard.quickOffTheMarkArmed": null, "flags.ak5e.vanguardUses.undo": undo });
    delete actor._ak5eQuickOffTheMarkMarker;
  } finally {
    consuming.delete(key);
  }
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
