/**
 * Deadeye subclass features (Ch.3 L4106-4160):
 * Deadshot (Bonus Action: no long-range penalty, min 3 on damage dice, double PB on attack roll),
 * Target Shooting (Lethal: +1 crit range vs Target, +2 vs Elite/Leader; Target of Opportunity SR mark),
 * Vital Strike (Action in Deadshot: +2d6/3d6/4d6 piercing damage),
 * Anti-Sniper Training (Head Down: Half Cover / 3/4 Cover; Small Profile: Stealth proficiency),
 * Improved Deadshot (Deathblow: execute below Marksman Level HP; Piercing Shots: ignore cover),
 * Ultimate Deadshot (Killchain: free Deadshot on 0 HP kill; Nevermiss: floor d20 to Mod + PB).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  martialDC, isTargetLocked, deadeyeVitalStrikeDice
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isDeadeye = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "deadeye";

export function inDeadshot(actor) {
  if (!isDeadeye(actor)) return false;
  return Boolean(flag(actor, "marksman")?.deadshotActive);
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Deadeye level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/** Checks whether a target creature is an Elite or Leader tier. */
export function isEliteOrLeader(targetActor) {
  if (!targetActor) return false;
  if (flag(targetActor, "tier") === "elite" || flag(targetActor, "tier") === "leader") return true;
  if (flag(targetActor, "isElite") || flag(targetActor, "isLeader")) return true;
  const name = targetActor.name?.toLowerCase() ?? "";
  return name.includes("[elite]") || name.includes("[leader]");
}

/* ---------------------------------------------------------------- Deadeye Plans */

export const DEADEYE_PLANS = {
  deadshot(actor, _state, _data) {
    need(isDeadeye(actor), "Deadshot is a Deadeye feature.");
    const level = marksmanLevel(actor);
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const isKillchain = Boolean(flag(actor, "marksman")?.killchainFreeDeadshot);

    return {
      warnings: [],
      title: "Enter Deadshot State",
      apply(next, receipt) {
        const updates = {
          "flags.ak5e.marksman.deadshotActive": true,
          "flags.ak5e.marksman.killchainFreeDeadshot": false
        };

        if (level >= 10) {
          updates["flags.ak5e.marksman.headDownActive"] = true;
        }

        receipt.summary = `${actor.name} enters Deadshot State${isKillchain ? " (Killchain: no Bonus Action required)" : ""}: PB doubled on next Attack Roll (+${pb}), damage dice 1-2 count as 3, and no penalty at Long Range.`;
        if (level >= 10) receipt.summary += " Anti-Sniper Training: gains Half Cover (+2 AC/Dex saves).";
        if (level >= 15) receipt.summary += " Piercing Shots: ignores enemy Half and 3/4 Cover.";
        if (level >= 18) receipt.summary += " Nevermiss: d20 roll floored to Ability Mod + PB.";

        receipt.result = {
          deadshot: true,
          doubledPb: pb,
          headDown: level >= 10,
          piercingShots: level >= 15,
          nevermiss: level >= 18
        };
        return updates;
      }
    };
  },

  endDeadshot(actor, _state, _data) {
    need(isDeadeye(actor), "Deadshot is a Deadeye feature.");
    return {
      warnings: [],
      title: "End Deadshot State",
      apply(next, receipt) {
        receipt.summary = `${actor.name} exits Deadshot State.`;
        return {
          "flags.ak5e.marksman.deadshotActive": false,
          "flags.ak5e.marksman.vitalStrikeActive": false
        };
      }
    };
  },

  targetOfOpportunity(actor, _state, data) {
    need(isDeadeye(actor), "Target of Opportunity is a Deadeye feature.");
    const targetName = data.targetName ?? data.nameOrDescription ?? "Designated Target";

    return {
      warnings: [],
      title: "Target of Opportunity",
      apply(next, receipt) {
        receipt.summary = `${actor.name} nominates ${targetName} as Target of Opportunity (treated as Target until next Short or Long Rest).`;
        receipt.result = { targetName, untilRest: true };
        return {
          "flags.ak5e.marksman.opportunityTarget": {
            name: targetName,
            active: true,
            markedAt: Date.now()
          }
        };
      }
    };
  },

  vitalStrike(actor, _state, _data) {
    need(isDeadeye(actor), "Vital Strike is a Deadeye feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Vital Strike");
    if (!inDeadshot(actor)) {
      warn(warnings, "deadshot", "Vital Strike requires active Deadshot State.");
    }

    const formula = deadeyeVitalStrikeDice(actor);

    return {
      warnings,
      title: "Vital Strike",
      apply(next, receipt) {
        receipt.summary = `${actor.name} lines up a Vital Strike: Ranged Attack deals +${formula} Piercing Damage if it hits.`;
        receipt.result = { vitalStrike: true, bonusFormula: formula };
        return {
          "flags.ak5e.marksman.vitalStrikeActive": true
        };
      }
    };
  },

  deathblow(actor, _state, data) {
    need(isDeadeye(actor), "Deathblow is a Deadeye feature.");
    const warnings = [];
    levelWarning(warnings, actor, 15, "Deathblow");
    if (!inDeadshot(actor)) {
      warn(warnings, "deadshot", "Deathblow requires active Deadshot State.");
    }

    const level = marksmanLevel(actor);
    const targetHp = Number(data.currentHp ?? 1);
    const isTargetElite = Boolean(data.isEliteOrLeader);
    const threshold = isTargetElite ? (2 * level) : level;
    const executed = targetHp > 0 && targetHp < threshold;
    const targetName = data.targetName ?? "Target";

    return {
      warnings,
      title: "Deathblow Execution",
      apply(next, receipt) {
        if (executed) {
          receipt.summary = `Deathblow! ${targetName} had ${targetHp} HP (< ${threshold} threshold) and is immediately reduced to 0 Hit Points!`;
          receipt.result = { executed: true, targetHp, threshold, newHp: 0 };
          // If level >= 18 Ultimate Deadshot, trigger Killchain!
          if (level >= 18) {
            receipt.summary += " Killchain triggered: next Deadshot does not expend Bonus Action.";
            return {
              "flags.ak5e.marksman.killchainFreeDeadshot": true
            };
          }
        } else {
          receipt.summary = `${targetName} HP (${targetHp}) is at or above the Deathblow threshold (${threshold}). Target survives.`;
          receipt.result = { executed: false, targetHp, threshold };
        }
        return {};
      }
    };
  }
};

marksmanUses.register({ plans: DEADEYE_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function deadeyePreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isDeadeye(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const targetActor = targetToken?.actor ?? null;
  const targetUuid = targetToken?.document?.uuid ?? targetActor?.uuid ?? null;
  const level = marksmanLevel(actor);

  // Target Shooting: Lethal (+1 crit range vs Target, +2 vs Elite/Leader)
  const isLocked = (targetUuid && isTargetLocked(actor, targetUuid)) ||
    (targetActor?.name && flag(actor, "marksman")?.opportunityTarget?.name === targetActor.name);
  if (isLocked) {
    const isElite = isEliteOrLeader(targetActor);
    const critBonus = isElite ? 2 : 1;
    roll.options ??= {};
    roll.options.criticalSuccess = Math.max(1, (roll.options.criticalSuccess ?? 20) - critBonus);
  }

  // Deadshot State attack roll modifications
  if (inDeadshot(actor)) {
    const pb = Number(actor.system?.attributes?.prof ?? 2);
    // Unerring Accuracy: PB is doubled for that Attack Roll
    roll.parts ??= [];
    roll.parts.push(String(pb));

    // Improved Deadshot: Piercing Shots (15th level: ignore half and 3/4 cover)
    if (level >= 15) {
      roll.options ??= {};
      roll.options.ignoreCover = true;
    }

    // Ultimate Deadshot: Nevermiss (18th level: d20 floor = Ability Mod + PB)
    if (level >= 18) {
      const ability = activity.ability ?? "dex";
      const mod = Number(actor.system?.abilities?.[ability]?.mod ?? 0);
      const floorValue = mod + pb;
      roll.options ??= {};
      roll.options.minimumD20 = floorValue;
    }
  }
}

export function deadeyePreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isDeadeye(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  // Vital Strike: +2d6 / 3d6 / 4d6 piercing
  if (flag(actor, "marksman")?.vitalStrikeActive) {
    const bonus = deadeyeVitalStrikeDice(actor);
    roll.parts.push(bonus);
  }

  // Make it Count (Deadshot): minimum 3 on damage dice
  if (inDeadshot(actor)) {
    roll.options ??= {};
    roll.options.damageFloor = 3;
  }
}

let installed = false;
export function registerDeadeyeHooks() {
  if (installed) return;
  installed = true;

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", deadeyePreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", deadeyePreRollDamage);
  }
}

