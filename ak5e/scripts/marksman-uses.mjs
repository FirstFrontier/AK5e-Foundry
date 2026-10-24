/**
 * Marksman table-play use engine (WORKFLOW.md §3.2, play-uses.mjs):
 * Base Marksman, Artilleryman, and Besieger register their plans here.
 * Receipts live in `flags.ak5e.marksmanUses`; rulings are read from `flags.ak5e.marksman.rulings`.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import {
  marksmanEnabled, marksmanLevel, marksmanState, checkLevel, targetLockBonus,
  isTargetLockActive, marksmanWorldTime
} from "./marksman-rules.mjs";
import { need, createOperationKernel, flag, opaqueKey } from "./operation-kernel.mjs";
import { recoverPool, registerPoolRecoveryRouter, listPoolDefinitions, hasPool } from "./resource-pools.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";

export const marksmanUses = createPlayUses({
  ns: "marksmanUses",
  label: "Marksman",
  publicSnapshot: true,
  isMember: actor => marksmanEnabled(actor),
  ruling: (actor, key) => {
    const record = marksmanState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

// One committing client orders play and initiative/rest recovery on the same Actor.
// A disconnected GM never prevents an owner from playing with owned documents.
const localCommand = marksmanUses.command;
const marksmanPoolIds = ["targetLock", "unerring", "steelRain", "versatileApproach", "theLastOption", "delayedDetonation", "secondaryDetonation", "scatterThem", "siegeBolt", "goliathsBane"];
const coordinator = createOperationKernel({
  label: "Marksman", stateFlag: "marksmanCoordinator", requestFlag: "marksmanRequest",
  responseFlag: "marksmanResponse", receiptFlag: "marksmanCommit", benefitFlag: "marksmanBenefit", rollFlag: "marksmanRoll",
  isMember: marksmanEnabled, getState: actor => ({ operations: [], ...structuredClone(flag(actor, "marksmanCoordinator") ?? {}) }),
  async perform(actor, command, data, operation, state, user) {
    if (command === "use") {
      need(marksmanUses.isCommand(data.name), "Unknown Marksman command.");
      try { operation.result = await localCommand(actor, data.name, data.input, data.id, user); }
      catch (error) { if (marksmanUses.receipt(actor, data.id)) coordinator.noteMutation(actor); throw error; }
    } else {
      need(command === "recover" && [data.period].flat().every(period => ["initiative", "sr", "lr"].includes(period)), "Unknown Marksman recovery.");
      need(data.poolIds?.every(id => marksmanPoolIds.includes(id)), "Unknown Marksman pool.");
      operation.result = await recoverPool(actor, data.period, { poolIds: data.poolIds, eventKey: data.eventKey, context: data.context });
    }
    return state;
  }
});
const canCoordinate = actor => Boolean(globalThis.game?.users?.activeGM && actor?.documentName === "Actor");
async function coordinated(actor, command, data, id) {
  await coordinator.submit(actor, command, { ...data, confirmation: true }, id);
  return flag(actor, "marksmanCoordinator")?.operations?.find(operation => operation.id === id)?.result;
}
export async function recoverMarksmanPool(actor, period, options) {
  if (!canCoordinate(actor)) return recoverPool(actor, period, options);
  const id = `recover_${opaqueKey(JSON.stringify([period, options.eventKey ?? foundry.utils.randomID(), options.poolIds]))}`;
  return coordinated(actor, "recover", { period, ...options }, id);
}
marksmanUses.command = async (actor, name, data = {}, id = globalThis.foundry?.utils?.randomID?.()) => {
  need(actor?.isOwner, "Choose an owned Marksman Actor.");
  const input = { ...data };
  if (!["undoUse", "useRoll"].includes(name)) {
    const tokens = Array.from(globalThis.game?.user?.targets?.values?.() ?? []);
    input.targetUuids ??= input.targetUuid ? [input.targetUuid] : tokens.map(token => token.document?.uuid ?? token.actor?.uuid).filter(Boolean);
    input.turnKey ??= globalThis.game?.combat?.started
      ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `manual:${marksmanState(actor).manualTurn ?? 0}`;
    input.actionId ??= id;
  }
  marksmanUses.validate(actor, name, input, id);
  return canCoordinate(actor) ? coordinated(actor, "use", { name, input, id }, `use_${opaqueKey(id)}`) : localCommand(actor, name, input, id);
};
const targetRelay = marksmanUses.handleRelay;
marksmanUses.handleRelay = async (...args) => { await targetRelay(...args); await coordinator.handle(...args); };
registerPoolRecoveryRouter(marksmanEnabled, async (actor, trigger, options) => {
  const definitions = listPoolDefinitions().filter(definition => hasPool(actor, definition) && definition.recovery.some(entry => [trigger].flat().includes(entry.on)));
  const managed = definitions.filter(definition => marksmanPoolIds.includes(definition.id)).map(definition => definition.id);
  const remaining = definitions.filter(definition => !marksmanPoolIds.includes(definition.id)).map(definition => definition.id);
  const result = managed.length ? await recoverMarksmanPool(actor, trigger, { ...options, poolIds: managed }) : [];
  return [...result, ...(remaining.length ? await recoverPool(actor, trigger, { ...options, poolIds: remaining }) : [])];
});

/** GM-only: record a ruling for an unresolved reading. */
export async function recordMarksmanRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Marksman rulings.");
  const reading = marksmanUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.marksman.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return marksmanState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Marksman level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

export const MARKSMAN_READINGS = Object.freeze({
  enhancedTargetLockLevel: Object.freeze({
    label: "Enhanced Target Lock unlock level (C3 class table: 11; feature heading: 12)",
    options: Object.freeze([
      Object.freeze({ value: "11", label: "11th level (class table)" }),
      Object.freeze({ value: "12", label: "12th level (feature heading)" })
    ])
  })
});

/* ---------------------------------------------------------------- Core Marksman Plans */

export const CORE_PLANS = {
  advanceManualTurn(actor) {
    need(marksmanEnabled(actor), "Choose a Marksman.");
    const warnings = [];
    if (globalThis.game?.combat?.started) warn(warnings, "combat", "Combat is active; use its Turn controls instead of advancing a manual Turn.");
    return { warnings, title: "Advance manual Turn", apply(_state, receipt) {
      const turn = Number(marksmanState(actor).manualTurn ?? 0) + 1;
      receipt.summary = `${actor.name} begins manual Turn ${turn}. Once-per-Turn allowances refresh; the table tracks timing outside combat.`;
      receipt.result = { manualTurn: turn };
      receipt.targets = [{ kind: "marksmanOutcome", uuid: actor.uuid, name: actor.name, ready: true, payload: { removeLabels: ["Siege Mode"] } }];
      return { "flags.ak5e.marksman.manualTurn": turn, "flags.ak5e.marksman.siegeMode": false, "flags.ak5e.marksman.deliberateEfficientActive": false };
    } };
  },
  targetLock(actor, _state, data) {
    need(marksmanEnabled(actor), "Target Lock is a Marksman feature.");
    const warnings = [];
    const targetUuid = data.targetUuid;
    const targetName = data.targetName || "Target";
    if (!targetUuid) {
      warn(warnings, "target", "No target selected for Target Lock.");
    }
    if (data.targetHostile === false) warn(warnings, "targetHostile", "Target Lock selects a hostile Creature.");
    if (data.targetVisible === false) warn(warnings, "targetVisible", "Target Lock selects a Creature you can see.");
    const combat = globalThis.game?.combat;
    if (combat?.started && combat.combatant?.actor?.uuid !== actor.uuid) {
      warn(warnings, "timing", "Target Lock is selected during your Turn; this is not your Turn.");
    }
    const currentLock = marksmanState(actor).targetLock;
    if (isTargetLockActive(actor) && currentLock.targetUuid !== targetUuid) {
      warn(warnings, "replaceLock", `This replaces the active Target Lock on ${currentLock.targetName || "another target"} before its minute expires.`);
    }
    const available = resourceValue(actor, { pool: "targetLock" });
    if (available < 1) {
      warn(warnings, "targetLock", `Target Lock has already been used; uses clamp at 0.`);
    }

    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;

    return {
      warnings,
      title: "Target Lock",
      reading: marksmanLevel(actor) === 11 ? "enhancedTargetLockLevel" : null,
      apply(next, receipt, reading) {
        const updates = spendResource(actor, receipt, { pool: "targetLock", amount: 1, label: "Target Lock" });
        const bonus = targetLockBonus(actor, reading?.value ?? reading);
        const startedAt = marksmanWorldTime();
        updates["flags.ak5e.marksman.targetLock"] = {
          targetUuid,
          targetName,
          active: true,
          bonus,
          turnKey: currentTurnKey,
          startedAt,
          expiresAt: startedAt + 60
        };
        receipt.summary = `${actor.name} locks onto ${targetName} (+${bonus} to Attack Rolls for 1 minute).`;
        receipt.result = { targetUuid, targetName, bonus };
        return updates;
      }
    };
  },

  chooseMartialDC(actor, _state, data) {
    need(marksmanEnabled(actor), "Martial DC is a Marksman feature.");
    const ability = data.martialDcAbility;
    need(ability === "str" || ability === "dex", "Choose Strength or Dexterity for your Martial DC.");
    return {
      warnings: [],
      title: "Choose Martial DC Ability",
      apply(_next, receipt) {
        receipt.summary = `${actor.name} uses ${ability === "str" ? "Strength" : "Dexterity"} for Martial DC.`;
        receipt.result = { martialDcAbility: ability };
        return { "flags.ak5e.marksman.martialDcAbility": ability };
      }
    };
  },

  clearTargetLock(actor, _state, _data) {
    need(marksmanEnabled(actor), "Target Lock is a Marksman feature.");
    return {
      warnings: [],
      title: "Clear Target Lock",
      apply(next, receipt) {
        receipt.summary = `${actor.name} clears their active Target Lock.`;
        return {
          "flags.ak5e.marksman.targetLock.active": false
        };
      }
    };
  },

  unerring(actor, _state, data) {
    need(marksmanEnabled(actor), "Unerring is a Marksman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Unerring");
    const available = resourceValue(actor, { pool: "unerring" });
    if (available < 1) {
      warn(warnings, "unerring", "Unerring has already been used; uses clamp at 0.");
    }
    const message = data.originMessageUuid && globalThis.fromUuidSync?.(data.originMessageUuid);
    if (!message) warn(warnings, "attack", "Select the originating missed Attack message.");
    if (!data.missConfirmed) warn(warnings, "miss", "Confirm the selected Attack missed its intended Creature.");
    const ac = data.targetAC == null ? null : Number(data.targetAC);
    need(ac === null || Number.isFinite(ac), "Enter a valid reviewed target AC.");

    return {
      warnings,
      title: "Unerring",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "unerring", amount: 1, label: "Unerring" });
        receipt.summary = `${actor.name} chooses to turn a missed Attack into a hit (minimum required roll).`;
        receipt.originMessageUuid = data.originMessageUuid ?? null;
        receipt.summary += ` Original Attack: ${message?.uuid ?? "tracked manually"}; effective result ${ac ?? "the table's minimum to hit"}. The original d20 and its natural-result properties are unchanged.`;
        receipt.result = { hit: true, effectiveTotal: ac, originMessageUuid: receipt.originMessageUuid };
        if (data.weaponUuid) {
          receipt.weaponUuid = data.weaponUuid;
          receipt.resolution = { version: 1, steps: [] };
        }
        return updates;
      }
    };
  },

  steelRain(actor, _state, data) {
    need(marksmanEnabled(actor), "Steel Rain is a Marksman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "Steel Rain");
    const available = resourceValue(actor, { pool: "steelRain" });
    if (available < 1) {
      warn(warnings, "steelRain", "Steel Rain has already been used; uses clamp at 0.");
    }

    return {
      warnings,
      title: "Steel Rain",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "steelRain", amount: 1, label: "Steel Rain" });
        receipt.summary = `${actor.name} takes the Attack Action as a Bonus Action.`;
        receipt.result = { bonusActionAttack: true };
        receipt.weaponUuid = data.weaponUuid;
        receipt.resolution = { version: 1, steps: Array.from({ length: marksmanLevel(actor) >= 5 ? 2 : 1 }, (_, index) => ({
          id: `steel-rain-${index + 1}`, kind: "attack", label: `Steel Rain Attack ${index + 1}`, weaponUuid: data.weaponUuid,
          targetUuids: data.targetUuids ?? (data.targetUuid ? [data.targetUuid] : []), activityId: data.activityId
        })) };
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: CORE_PLANS, readings: MARKSMAN_READINGS });
CORE_PLANS.advanceManualTurn.validateTarget = (source, _receipt, entry, target) => target.uuid === source.uuid &&
  entry.uuid === source.uuid && JSON.stringify(entry.payload) === JSON.stringify({ removeLabels: ["Siege Mode"] });
