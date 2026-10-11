/**
 * Marksman class features (Ch.3 L3521-3876):
 * Target Lock, High Ground, Fighting Styles, Unerring, and Steel Rain.
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch, marksmanState,
  targetLockBonus, isTargetLocked, hasFightingStyle, FIGHTING_STYLES
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { definePool, getPool, getPoolDefinition, spendPool, refundPool } from "./resource-pools.mjs";
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
        { on: "lr", amount: "toMax" }
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
    if (disposition >= 0) continue; // Not hostile
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

  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const targetUuid = targetToken?.document?.uuid ?? targetToken?.actor?.uuid ?? null;
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  // 1. Target Lock: +1 (or +2) attack bonus if attacking the locked target
  const state = marksmanState(actor);
  if (state.targetLock?.active && targetUuid && state.targetLock.targetUuid === targetUuid) {
    const bonus = targetLockBonus(actor);
    roll.parts ??= [];
    roll.parts.push(String(bonus));
  }

  // 2. High Ground: Advantage if attacker is >= 10 ft above target
  if (attackerToken && targetToken && checkHighGround(attackerToken, targetToken)) {
    roll.options ??= {};
    roll.options.advantage = true;
  }

  // 3. Ranger Fighting Style: +2 to attack rolls with Ranged or Thrown weapons
  const isRangedOrThrown = activity.actionType === "rwak" ||
    activity.item?.system?.properties?.has?.("thr") ||
    flag(activity.item, "thrown");
  if (isRangedOrThrown && hasFightingStyle(actor, "ranger")) {
    roll.parts ??= [];
    roll.parts.push("2");
  }

  // 4. Close and Personal: Suppress disadvantage within 5 ft on ranged attacks
  if (activity.actionType === "rwak" && hasFightingStyle(actor, "closeAndPersonal")) {
    if (attackerToken && hasAdjacentHostile(attackerToken)) {
      roll.options ??= {};
      // Suppress disadvantage from adjacent hostile
      if (roll.options.disadvantage && !roll.options.advantage) {
        roll.options.disadvantage = false;
      }
    }
  }

  // 5. Deadly Fighter: +1 critical range on first attack roll each turn with Deadly weapon
  if (hasFightingStyle(actor, "deadlyFighter")) {
    const isDeadly = Boolean(activity.item?.system?.properties?.has?.("deadly") || flag(activity.item, "deadly"));
    if (isDeadly) {
      roll.options ??= {};
      roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
    }
  }
}

export function marksmanPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !marksmanEnabled(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  // Smooth Operator Fighting Style: add ability modifier to Bonus Action Rapid Fire attack
  if (hasFightingStyle(actor, "smoothOperator")) {
    const isRapidFire = Boolean(activity.item?.system?.properties?.has?.("rapid") || flag(activity.item, "rapidFire"));
    if (isRapidFire && activity.activation?.type === "bonus") {
      const abl = activity.ability || actor.system?.attributes?.spellcasting || "dex";
      const mod = Number(actor.system?.abilities?.[abl]?.mod ?? 0);
      if (mod > 0) roll.parts.push(String(mod));
    }
  }
}

/* ---------------------------------------------------------------- Registration */

export function registerMarksmanFeatureHooks() {
  if (installed) return;
  installed = true;

  defineMarksmanPools();

  // Enhanced Target Lock (Marksman 11th level): regain 1 use of Target Lock on Initiative
  onAk5eEvent("initiative", async actor => {
    if (!marksmanEnabled(actor)) return;
    const level = marksmanLevel(actor);
    if (level >= 11) {
      const lock = targetLockPool(actor);
      if (lock && lock.value === 0) {
        await refundPool(actor, "targetLock", 1, { reason: "Enhanced Target Lock" });
      }
    }
  });

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", marksmanPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", marksmanPreRollDamage);
  }
}

export const registerMarksmanHooks = registerMarksmanFeatureHooks;

defineMarksmanPools();

