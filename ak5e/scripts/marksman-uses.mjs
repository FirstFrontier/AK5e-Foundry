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
import { need } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";

export const marksmanUses = createPlayUses({
  ns: "marksmanUses",
  label: "Marksman",
  isMember: actor => marksmanEnabled(actor),
  ruling: (actor, key) => {
    const record = marksmanState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
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

  unerring(actor, _state, _data) {
    need(marksmanEnabled(actor), "Unerring is a Marksman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Unerring");
    const available = resourceValue(actor, { pool: "unerring" });
    if (available < 1) {
      warn(warnings, "unerring", "Unerring has already been used; uses clamp at 0.");
    }

    return {
      warnings,
      title: "Unerring",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "unerring", amount: 1, label: "Unerring" });
        receipt.summary = `${actor.name} chooses to turn a missed Attack into a hit (minimum required roll).`;
        receipt.result = { hit: true };
        return updates;
      }
    };
  },

  steelRain(actor, _state, _data) {
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
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: CORE_PLANS, readings: MARKSMAN_READINGS });
