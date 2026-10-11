/**
 * Guard table-play use engine (WORKFLOW.md §3.2, play-uses.mjs):
 * Base Guard, Centurion, Crusher, and Instructor register their plans here.
 * Receipts live in `flags.ak5e.guardUses`; rulings are read from `flags.ak5e.guard.rulings`.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import { guardEnabled, guardLevel, guardState, checkLevel } from "./guard-rules.mjs";
import { need } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";

export const guardUses = createPlayUses({
  ns: "guardUses",
  label: "Guard",
  isMember: actor => guardEnabled(actor),
  ruling: (actor, key) => {
    const record = guardState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. A recorded ruling replaces the player's per-use reading. */
export async function recordGuardRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Guard rulings.");
  const reading = guardUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.guard.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return guardState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Guard level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Core Guard Plans */

const CORE_PLANS = {
  forestall(actor, _state, data) {
    need(guardEnabled(actor), "Forestall is a Guard feature.");
    const amount = Number(data.amount ?? 1);
    need(Number.isInteger(amount) && amount >= 1 && amount <= 3, "Choose how much Aggression to expend (1 to 3).");
    const warnings = [];
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < amount) {
      warn(warnings, "aggression", `${amount} Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    return {
      warnings,
      title: "Press the Attack: Forestall",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount, label: "Aggression" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-forestall`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        const bonus = amount * pb;
        receipt.summary = `${actor.name}'s AC is increased by ${bonus} against the triggering Attack.`;
        receipt.result = { acBonus: bonus, aggressionSpent: amount };
        return updates;
      }
    };
  },

  smite(actor, _state, data) {
    need(guardEnabled(actor), "Smite is a Guard feature.");
    const amount = Number(data.amount ?? 1);
    need(Number.isInteger(amount) && amount >= 1 && amount <= 3, "Choose how much Aggression to expend (1 to 3).");
    const warnings = [];
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < amount) {
      warn(warnings, "aggression", `${amount} Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }

    return {
      warnings,
      title: "Press the Attack: Smite",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount, label: "Aggression" });
        const bonus = amount * pb;
        receipt.summary = `${actor.name}'s Attack deals ${bonus} additional Damage.`;
        receipt.result = { damageBonus: bonus, aggressionSpent: amount };
        return updates;
      }
    };
  },

  strikeTrue(actor, _state, data) {
    need(guardEnabled(actor), "Strike True is a Guard feature.");
    const amount = Number(data.amount ?? 1);
    need(Number.isInteger(amount) && amount >= 1 && amount <= 3, "Choose how much Aggression to expend (1 to 3).");
    const warnings = [];
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < amount) {
      warn(warnings, "aggression", `${amount} Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }

    return {
      warnings,
      title: "Press the Attack: Strike True",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount, label: "Aggression" });
        const bonus = amount * pb;
        receipt.summary = `${actor.name} gains a +${bonus} bonus to the Attack Roll.`;
        receipt.result = { attackBonus: bonus, aggressionSpent: amount };
        return updates;
      }
    };
  },

  unrelenting(actor, _state, data) {
    need(guardEnabled(actor), "Unrelenting is a Guard feature.");
    const warnings = [];
    levelWarning(warnings, actor, 3, "Unrelenting");
    const available = resourceValue(actor, { pool: "unrelenting" });
    if (available < 1) {
      warn(warnings, "unrelenting", `1 use of Unrelenting needed and ${available} remain.`);
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const level = guardLevel(actor) ?? 1;
    const isEternal = level >= 18;

    return {
      warnings,
      title: "Unrelenting",
      rolls: isEternal ? [{ id: "eternalAggression", label: "Eternal Aggression (1d4 Aggression refund)", formula: "1d4" }] : [],
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "unrelenting", amount: 1, label: "Unrelenting" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-unrelenting`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        receipt.summary = `${actor.name} immediately makes a single Attack as a Reaction.`;
        receipt.result = { attacks: 1, eternalAggression: isEternal };
        return updates;
      }
    };
  },

  pursuitUnrelenting(actor, _state, data) {
    need(guardEnabled(actor), "Pursuit Unrelenting is a Guard feature.");
    const actionType = data.actionType === "bonus" ? "Bonus Action" : "Action";
    const warnings = [];
    levelWarning(warnings, actor, 11, "Pursuit Unrelenting");
    const available = resourceValue(actor, { pool: "unrelenting" });
    if (available < 2) {
      warn(warnings, "unrelenting", `2 uses of Unrelenting needed and ${available} remain.`);
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const level = guardLevel(actor) ?? 1;
    const isEternal = level >= 18;

    return {
      warnings,
      title: "Pursuit Unrelenting",
      rolls: isEternal ? [{ id: "eternalAggression", label: "Eternal Aggression (2d4 Aggression refund)", formula: "2d4" }] : [],
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "unrelenting", amount: 2, label: "Unrelenting" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-pursuitUnrelenting`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        receipt.summary = `${actor.name} takes an ${actionType} in place of the single Attack.`;
        receipt.result = { actionType, eternalAggression: isEternal };
        return updates;
      }
    };
  },

  unrelentingAggression(actor, _state, data) {
    need(guardEnabled(actor), "Unrelenting Aggression is a Guard feature.");
    const warnings = [];
    levelWarning(warnings, actor, 15, "Unrelenting Aggression");
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 2) {
      warn(warnings, "aggression", `2 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const damageFormula = String(data.formula ?? "1d8").trim();

    return {
      warnings,
      title: "Press the Attack: Unrelenting Aggression",
      rolls: [{ id: "unrelentingDamage", label: "Miss Damage (no Ability Modifier)", formula: damageFormula }],
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-unrelentingAggression`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        receipt.summary = `${actor.name} deals weapon dice Damage without Ability Score Modifier on a missed melee Attack.`;
        receipt.result = { aggressionSpent: 2, formula: damageFormula };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: CORE_PLANS });
