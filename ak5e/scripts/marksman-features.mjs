/**
 * Marksman class features (Ch.3 L3521-3876):
 * Target Lock, High Ground, Fighting Styles, Unerring, and Steel Rain.
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch, marksmanState,
  targetLockBonus, isTargetLocked, hasFightingStyle, FIGHTING_STYLES
} from "./marksman-rules.mjs";
import { marksmanUses, recoverMarksmanPool } from "./marksman-uses.mjs";
import { hasWeaponProperty } from "./weapon-properties.mjs";
import { marksmanAttackTarget, inheritMarksmanAttackContext } from "./marksman-context.mjs";
import { definePool, getPool, getPoolDefinition, recoverPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { flag, values, need, keyedSerial } from "./operation-kernel.mjs";

export const serial = keyedSerial();
let installed = false;

export function defineMarksmanPools() {
  if (!getPoolDefinition("targetLock")) {
    definePool({
      id: "targetLock",
      label: "Target Lock",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => marksmanEnabled(actor),
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" },
        { on: "initiative", amount: 1, when: (actor, context) => enhancedTargetLockUnlocked(actor) && context.marksmanEvent === true }
      ]
    });
  }
  if (!getPoolDefinition("unerring")) {
    definePool({
      id: "unerring",
      label: "Unerring",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => marksmanEnabled(actor) && marksmanLevel(actor) >= 17,
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("steelRain")) {
    definePool({
      id: "steelRain",
      label: "Steel Rain",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => marksmanEnabled(actor) && marksmanLevel(actor) >= 20,
      recovery: [
        { on: "sr", amount: "toMax" }
      ]
    });
  }
}

export const targetLockPool = actor => getPool(actor, "targetLock");
export const unerringPool = actor => getPool(actor, "unerring");
export const steelRainPool = actor => getPool(actor, "steelRain");

const enhancedTargetLockUnlocked = actor => {
  const level = marksmanLevel(actor);
  if (level >= 12) return true;
  return level >= 11 && Number(marksmanState(actor).rulings?.enhancedTargetLockLevel?.value) === 11;
};

const deadlyFighterTurn = new Map();
const deadlyFighterPending = new Map();
const deadlyAdjustedRolls = new WeakSet();
function deadlyFighterCycle(actor) {
  const combat = globalThis.game?.combat;
  if (!combat?.started || combat.round == null || combat.turn == null) return false;
  return `${combat.uuid ?? combat.id ?? "combat"}:${combat.round}:${combat.turn}`;
}
function deadlyItemKey(item) {
  return item?.uuid ?? item?.id ?? item?.name ?? null;
}
export function marksmanPostRollAttack(_rolls, { subject } = {}) {
  const actor = subject?.actor, cycle = actor && deadlyFighterCycle(actor);
  if (!actor || !cycle) return;
  const actorKey = actor.uuid ?? actor.id ?? actor.name, pending = deadlyFighterPending.get(actorKey);
  if (pending?.cycle !== cycle || pending.itemKey !== deadlyItemKey(subject?.item)) return;
  deadlyFighterTurn.set(actorKey, cycle);
  deadlyFighterPending.delete(actorKey);
}

function tellManualTargetLockRecovery(actor) {
  const owners = Array.from(globalThis.game?.users ?? []).filter(user => actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
  const message = "Enhanced Target Lock's initiative recovery is unresolved at Marksman level 11 (class table says 11; feature heading says 12). No use was restored. Ask the GM to record the ruling; otherwise recover Target Lock manually if the table uses the 11th-level reading.";
  if (!globalThis.ChatMessage?.implementation?.create || owners.length === 0) return;
  return globalThis.ChatMessage.implementation.create({ content: `<p>${message}</p>`, whisper: owners });
}

/** Initiative adapter. Event documents are in `raw`; use the canonical receipt-aware pool recovery path. */
export async function recoverTargetLockOnInitiative(event) {
  const actor = event?.raw?.actor;
  if (!actor || !marksmanEnabled(actor) || marksmanLevel(actor) < 11) return [];
  if (!enhancedTargetLockUnlocked(actor)) {
    if (marksmanState(actor).rulings?.enhancedTargetLockLevel?.value === undefined) {
      await tellManualTargetLockRecovery(actor);
    }
    return [];
  }
  return recoverMarksmanPool(actor, "initiative", {
    poolIds: ["targetLock"],
    eventKey: event.eventId ?? `enhancedTargetLock:${event.combatantId ?? actor.uuid}:${event.combatUuid ?? "combat"}`,
    context: { marksmanEvent: true, actorUuid: actor.uuid, combatUuid: event.combatUuid ?? null, combatantId: event.combatantId ?? null }
  });
}

export const ownTurn = actor => Boolean(globalThis.game?.combat?.started && globalThis.game.combat.combatant?.actor?.uuid === actor.uuid);

/** Check whether attacker has High Ground (>= 10 ft above target). */
export function checkHighGround(attackerToken, targetToken) {
  if (!attackerToken || !targetToken) return false;
  const attackerElevation = Number(attackerToken.document?.elevation ?? attackerToken.elevation ?? 0);
  const targetElevation = Number(targetToken.document?.elevation ?? targetToken.elevation ?? 0);
  return (attackerElevation - targetElevation) >= 10;
}

/** Check whether hostile creature is within 5 ft of attacker token. */
export function hasAdjacentHostile(attackerToken) {
  if (!attackerToken || !globalThis.canvas?.tokens?.placeables) return false;
  const aCenter = attackerToken.center ?? { x: attackerToken.x, y: attackerToken.y };
  const gridSize = globalThis.canvas.grid?.size ?? 100;
  const gridDistance = globalThis.canvas.grid?.distance ?? 5;
  const fiveFtPx = (5 / gridDistance) * gridSize + 1;

  for (const token of globalThis.canvas.tokens.placeables) {
    if (token === attackerToken) continue;
    const disposition = token.document?.disposition ?? 0;
    const attackerDisposition = attackerToken.document?.disposition ?? 1;
    if (disposition === 0 || disposition === attackerDisposition) continue;
    const tCenter = token.center ?? { x: token.x, y: token.y };
    const distPx = Math.hypot(aCenter.x - tCenter.x, aCenter.y - tCenter.y);
    if (distPx <= fiveFtPx) return true;
  }
  return false;
}

/* ---------------------------------------------------------------- Hook Handlers */

export function marksmanPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !marksmanEnabled(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const { token: targetToken, uuid: targetUuid } = marksmanAttackTarget(config);
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  // 1. Target Lock: +1 (or +2) attack bonus if attacking the locked target
  const state = marksmanState(actor);
  if (targetUuid && isTargetLocked(actor, targetUuid)) {
    const storedBonus = Number(state.targetLock?.bonus);
    const bonus = Number.isFinite(storedBonus) && storedBonus > 0 ? storedBonus : targetLockBonus(actor);
    roll.parts ??= [];
    roll.parts.push(String(bonus));
  }

  // 2. High Ground: Advantage if attacker is >= 10 ft above target
  if (attackerToken && targetToken && checkHighGround(attackerToken, targetToken)) {
    roll.options ??= {};
    roll.options.advantage = true;
  }

  // 3. Ranger Fighting Style: +2 to attack rolls with Ranged or Thrown weapons
  const isRangedOrThrown = activity.actionType === "rwak" || hasWeaponProperty(activity.item, "thrown");
  if (isRangedOrThrown && hasFightingStyle(actor, "ranger")) {
    roll.parts ??= [];
    roll.parts.push("2");
  }

  // 4. Close and Personal: Suppress disadvantage within 5 ft on ranged attacks
  if (activity.actionType === "rwak" && hasFightingStyle(actor, "closeAndPersonal")) {
    if (attackerToken && hasAdjacentHostile(attackerToken)) {
      roll.options ??= {};
      // The feature says the attack does not have Disadvantage, even when Advantage also applies.
      roll.options.disadvantage = false;
    }
  }

  // 5. Deadly Fighter: +1 critical range on first attack roll each turn with Deadly weapon
  if (hasFightingStyle(actor, "deadlyFighter")) {
    const isDeadly = hasWeaponProperty(activity.item, "deadly");
    const cycle = isDeadly && deadlyFighterCycle(actor);
    const actorKey = actor.uuid ?? actor.id ?? actor.name;
    if (cycle && deadlyFighterTurn.get(actorKey) !== cycle && !deadlyAdjustedRolls.has(roll)) {
      roll.options ??= {};
      roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
      // Pre-roll can still be cancelled; only postRollAttack spends the once-per-Turn benefit.
      deadlyFighterPending.set(actorKey, { cycle, itemKey: deadlyItemKey(activity.item) });
      deadlyAdjustedRolls.add(roll);
    }
  }
}

export function marksmanPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !marksmanEnabled(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;
  inheritMarksmanAttackContext(config);
  marksmanAttackTarget(config);

  // Smooth Operator Fighting Style: add ability modifier to Bonus Action Rapid Fire attack
  if (hasFightingStyle(actor, "smoothOperator")) {
    const isRapidFire = hasWeaponProperty(activity.item, "rapidFire");
    if (isRapidFire && activity.activation?.type === "bonus") {
      const abl = activity.ability || "dex";
      const mod = Number(actor.system?.abilities?.[abl]?.mod ?? 0);
      if (!roll.options?._ak5eAbilityModifierAdded) {
        // Native off-hand activities may already include the modifier. The
        // dedicated Rapid Fire workflow explicitly omits it; add it once only.
        const hasNativeModifier = roll.parts.some(part => typeof part === "string" && /@mod\b/.test(part));
        if (!hasNativeModifier) roll.parts.push(String(mod));
        roll.options ??= {}; roll.options._ak5eAbilityModifierAdded = true;
      }
    }
  }
  if (hasFightingStyle(actor, "twoWeaponFighting") && activity.activation?.type === "bonus" &&
    (config.ak5eTwoWeaponFighting === true || activity.flags?.ak5e?.twoWeaponFighting === true) && !roll.options?._ak5eAbilityModifierAdded) {
    const ability = activity.ability || "dex";
    if (!roll.parts.some(part => typeof part === "string" && /@mod\b/.test(part))) roll.parts.push(String(Number(actor.system?.abilities?.[ability]?.mod ?? 0)));
    roll.options ??= {}; roll.options._ak5eAbilityModifierAdded = true;
  }
  if (config.ak5eTwoWeaponFighting && hasFightingStyle(actor, "twoWeaponFighting") && !roll.options?._ak5eAbilityModifierAdded) {
    if (!roll.parts.some(part => typeof part === "string" && /@mod\b/.test(part))) roll.parts.push(String(Number(actor.system?.abilities?.[activity.ability || "dex"]?.mod ?? 0)));
    roll.options ??= {}; roll.options._ak5eAbilityModifierAdded = true;
  }
  const scale = Number(config.ak5eDamageScale ?? 1);
  if (scale !== 1 && Number.isFinite(scale) && scale >= 0 && scale <= 1 && !roll.options?._ak5eDamageScaled) {
    roll.parts = [`floor((${roll.parts.join(" + ")}) * ${scale})`];
    roll.options ??= {}; roll.options._ak5eDamageScaled = true;
  }
}

/* ---------------------------------------------------------------- Registration */

export function registerMarksmanFeatureHooks() {
  if (installed) return;
  installed = true;

  defineMarksmanPools();

  onAk5eEvent("initiative", recoverTargetLockOnInitiative);

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", marksmanPreRollAttack);
    Hooks.on("dnd5e.postRollAttack", marksmanPostRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", marksmanPreRollDamage);
  }
}

export const registerMarksmanHooks = registerMarksmanFeatureHooks;

defineMarksmanPools();

