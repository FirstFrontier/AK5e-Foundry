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
export function marksmanPostRollAttack(rolls, context = {}) {
  const subject = context?.subject ?? rolls?.subject ?? (rolls?.actor ? rolls : null);
  const actor = subject?.actor ?? rolls?.actor;
  if (!actor) return;
  const cycle = deadlyFighterCycle(actor);
  if (cycle) {
    const actorKey = actor.uuid ?? actor.id ?? actor.name, pending = deadlyFighterPending.get(actorKey);
    if (pending?.cycle === cycle && pending.itemKey === deadlyItemKey(subject?.item)) {
      deadlyFighterTurn.set(actorKey, cycle);
      deadlyFighterPending.delete(actorKey);
    }
  }
  if (isDefensiveStyleActive(actor)) {
    expireDefensiveStyle(actor);
    if (context?.flags?.ak5e) context.flags.ak5e.defensiveStyleExpired = true;
    if (rolls?.flags?.ak5e) rolls.flags.ak5e.defensiveStyleExpired = true;
  }
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

export function findUnerringReceipt(actor, messageUuid) {
  if (!actor || !messageUuid) return null;
  const undo = flag(actor, "marksmanUses")?.undo ?? [];
  const playUsesUndo = flag(actor, "playUses")?.undo ?? flag(actor, "playUses")?.receipts ?? [];
  const directReceipts = actor.flags?.ak5e?.marksmanReceipts
    ? (Array.isArray(actor.flags.ak5e.marksmanReceipts) ? actor.flags.ak5e.marksmanReceipts : Object.values(actor.flags.ak5e.marksmanReceipts))
    : [];
  const receipts = [
    ...(marksmanUses.receipts?.(actor) ?? []),
    ...(Array.isArray(undo) ? undo : []),
    ...(Array.isArray(playUsesUndo) ? playUsesUndo : []),
    ...directReceipts
  ];
  return receipts.find(r => r && r.command === "unerring" && r.status !== "undone" &&
    (r.originMessageUuid === messageUuid || r.result?.originMessageUuid === messageUuid || r.messageUuid === messageUuid
     || (r.originMessageUuid && (r.originMessageUuid.endsWith(messageUuid) || messageUuid.endsWith(r.originMessageUuid)))));
}

export function marksmanPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !marksmanEnabled(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;
  inheritMarksmanAttackContext(config);
  marksmanAttackTarget(config);

  // Unerring damage continuation:
  // If the originating attack was converted to a hit by Unerring, carry unerring
  // provenance, ensure hit is marked true, record the effective AC total, link to
  // the unerring receipt, and suppress critical damage (treated as minimum required to hit).
  const originMsgUuid = config.originMessageUuid
    || config.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId
    || roll.options?.ak5eMarksman?.originMessageUuid;
  const unerringReceipt = findUnerringReceipt(actor, originMsgUuid)
    || (config.unerringUseId ? marksmanUses.receipt(actor, config.unerringUseId) : null)
    || (config.ak5eUnerring ? { id: config.unerringUseId ?? "unerring", result: { hit: true, effectiveTotal: config.targetAC } } : null);

  if (unerringReceipt || config.ak5eUnerring || roll.options?.ak5eMarksman?.unerring) {
    roll.options ??= {};
    roll.options.ak5eMarksman = {
      ...(roll.options.ak5eMarksman ?? {}),
      actorUuid: actor.uuid,
      unerring: true,
      convertedToHit: true,
      hit: true,
      effectiveTotal: unerringReceipt?.result?.effectiveTotal ?? config.targetAC ?? null,
      unerringUseId: unerringReceipt?.id ?? config.unerringUseId ?? null
    };
    roll.options.critical = false;
    roll.options.isCritical = false;
    roll.critical = false;
    config.flags ??= {};
    config.flags.ak5e ??= {};
    config.flags.ak5e.unerring = true;
    config.flags.ak5e.convertedToHit = true;
  }

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

/* ---------------------------------------------------------------- Defensive End Control */

export const DEFENSIVE_STYLE_PLANS = {
  endDefensiveStyle(actor, _state, _data) {
    need(marksmanEnabled(actor), "Defensive is a Marksman fighting style.");
    return {
      warnings: [],
      title: "End Defensive Style AC Bonus",
      apply(_next, receipt) {
        receipt.summary = `${actor.name} ends the Defensive Fighting Style AC bonus.`;
        receipt.result = { ended: true };
        (receipt.targets ??= []).push({
          uuid: actor.uuid,
          name: actor.name,
          kind: "marksmanOutcome",
          ready: true,
          payload: { removeLabels: ["Defensive: end after the triggering Attack"] }
        });
        return {
          "flags.ak5e.marksman.defensiveActive": false,
          "flags.ak5e.marksman.defensiveBonusActive": false
        };
      }
    };
  }
};
DEFENSIVE_STYLE_PLANS.endDefensiveStyle.validateTarget = (source, _receipt, entry, target) =>
  entry.kind === "marksmanOutcome" && target.uuid === source.uuid
  && Object.keys(entry.payload ?? {}).length === 1
  && entry.payload?.removeLabels?.length === 1
  && entry.payload.removeLabels[0] === "Defensive: end after the triggering Attack";

marksmanUses.register({ plans: DEFENSIVE_STYLE_PLANS });

export function isDefensiveStyleActive(actor) {
  if (!actor) return false;
  if (actor.flags?.ak5e?.marksman?.defensiveBonusActive === true) return true;
  return values(actor.effects).some(effect => effect.name === "Defensive: end after the triggering Attack");
}

export async function expireDefensiveStyle(actor) {
  if (!actor) return false;
  const updates = {
    "flags.ak5e.marksman.defensiveBonusActive": false,
    "flags.ak5e.marksman.defensiveExpiredAt": globalThis.game?.time?.worldTime ?? Date.now()
  };
  if (actor.flags?.ak5e?.marksman) {
    actor.flags.ak5e.marksman.defensiveBonusActive = false;
    actor.flags.ak5e.marksman.defensiveExpiredAt = updates["flags.ak5e.marksman.defensiveExpiredAt"];
  }
  const effects = values(actor.effects).filter(effect => effect.name === "Defensive: end after the triggering Attack");
  if (effects.length && actor.deleteEmbeddedDocuments) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id ?? e._id));
  } else if (actor.update) {
    await actor.update(updates);
  }
  return updates;
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


