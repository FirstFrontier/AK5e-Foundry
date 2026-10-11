/**
 * Anti-Air subclass features (Ch.3 L3876-3950):
 * Weight of Fire (forgo Advantage to repeat attack 1/turn),
 * Air Tracking (Pigeon Shooting advantage vs flying/moved 60+ ft, Shifting Focus BA retarget at 0 HP),
 * Versatile Approach (Area Denial, Crowd Control, Stop their Approach, Shoot to Kill),
 * Unapproachable (reaction attack + half move; free reaction vs locked target),
 * Always Another Option (Option Recharge on initiative, upgraded options),
 * The Last Option (1-minute stance: 1 free option/turn, +1 attack on Attack Action).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  martialDC, isTargetLocked, targetLockBonus
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isAntiAir = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "antiAir";

export function defineAntiAirPools() {
  if (!getPoolDefinition("versatileApproach")) {
    definePool({
      id: "versatileApproach",
      label: "Versatile Approach",
      max: "@prof",
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isAntiAir(actor) && marksmanLevel(actor) >= 4,
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("theLastOption")) {
    definePool({
      id: "theLastOption",
      label: "The Last Option",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isAntiAir(actor) && marksmanLevel(actor) >= 18,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is an Anti-Air level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/** Checks whether a target creature is considered airborne or moved 60+ feet (Pigeon Shooting). */
export function isAirborneOrFast(targetToken, targetActor) {
  if (!targetToken && !targetActor) return false;
  // Elevation > 0
  const elevation = Number(targetToken?.document?.elevation ?? 0);
  if (elevation > 0) return true;
  // Flying movement trait
  const flySpeed = Number(targetActor?.system?.attributes?.movement?.fly ?? 0);
  if (flySpeed > 0) return true;
  // Status condition flying
  if (targetActor?.statuses?.has?.("flying") || targetActor?.statuses?.has?.("hovering")) return true;
  // Moved 60+ ft flag or tracking
  if (flag(targetActor, "movedLastTurn") >= 60 || flag(targetActor, "feetMovedLastTurn") >= 60) return true;
  return false;
}

/* ---------------------------------------------------------------- Anti-Air Plans */

export const ANTI_AIR_PLANS = {
  weightOfFire(actor, _state, _data) {
    need(isAntiAir(actor), "Weight of Fire is an Anti-Air feature.");
    return {
      warnings: [],
      title: "Weight of Fire",
      apply(next, receipt) {
        receipt.summary = `${actor.name} forgoes Advantage on this Ranged Attack to make an immediate repeated attack against the same target.`;
        receipt.result = { weightOfFire: true };
        return {
          "flags.ak5e.marksman.weightOfFireActive": true
        };
      }
    };
  },

  shiftingFocus(actor, _state, data) {
    need(isAntiAir(actor), "Shifting Focus is an Anti-Air feature.");
    const warnings = [];
    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "New Target";
    if (!targetUuid) {
      warn(warnings, "target", "Select a new hostile creature to mark with Shifting Focus.");
    }
    const bonus = targetLockBonus(actor);

    return {
      warnings,
      title: "Shifting Focus",
      apply(next, receipt) {
        receipt.summary = `${actor.name} shifts focus to ${targetName} (+${bonus} to attack rolls).`;
        receipt.result = { targetUuid, targetName, bonus };
        return {
          "flags.ak5e.marksman.targetLock": {
            active: true,
            targetUuid,
            targetName,
            bonus,
            startedAt: Date.now()
          }
        };
      }
    };
  },

  versatileApproach(actor, _state, data) {
    need(isAntiAir(actor), "Versatile Approach is an Anti-Air feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Versatile Approach");

    const option = data.option ?? "areaDenial";
    const validOptions = ["areaDenial", "crowdControl", "stopApproach", "shootToKill"];
    if (!validOptions.includes(option)) {
      warn(warnings, "option", `Invalid Versatile Approach option: ${option}.`);
    }

    const isTheLastOptionActive = Boolean(flag(actor, "marksman")?.theLastOptionActive);
    const usesFreeLastOption = isTheLastOptionActive && !flag(actor, "marksman")?.usedFreeOptionThisTurn;

    if (!usesFreeLastOption) {
      const available = resourceValue(actor, { pool: "versatileApproach" });
      if (available < 1) {
        warn(warnings, "versatileApproach", "Versatile Approach uses exhausted; uses clamp at 0.");
      }
    }

    const level = marksmanLevel(actor);
    const upgraded = level >= 15;
    const dc = martialDC(actor);
    const targetName = data.targetName ?? "Target";

    const titles = {
      areaDenial: "Area Denial",
      crowdControl: "Crowd Control",
      stopApproach: "Stop their Approach",
      shootToKill: "Shoot to Kill"
    };

    return {
      warnings,
      title: `Versatile Approach: ${titles[option] ?? option}`,
      apply(next, receipt) {
        let updates = {};
        if (usesFreeLastOption) {
          updates["flags.ak5e.marksman.usedFreeOptionThisTurn"] = true;
          receipt.summary = `${actor.name} uses ${titles[option]} (free from The Last Option).`;
        } else {
          updates = spendResource(actor, receipt, { pool: "versatileApproach", amount: 1, label: "Versatile Approach" });
          receipt.summary = `${actor.name} spends 1 use of Versatile Approach to execute ${titles[option]}.`;
        }

        if (option === "areaDenial") {
          receipt.result = {
            option: "areaDenial",
            dc,
            damage: "3d6 piercing",
            radiusFt: 10,
            durationRounds: upgraded ? 2 : 1,
            note: upgraded
              ? "Lingers 1 additional round. Disadvantage & half fly speed for flying creatures. Nominated allies immune."
              : "Next turn: DC " + dc + " Dex save (3d6 piercing). Disadvantage & half fly speed for flying creatures."
          };
          receipt.summary += ` Area Denial: 10-ft cylinder at chosen point (DC ${dc} Dex save, 3d6 piercing; flying creatures save at Disadvantage & lose half fly speed).`;
        } else if (option === "crowdControl") {
          receipt.result = {
            option: "crowdControl",
            repeats: upgraded ? 2 : 1,
            halfDamage: true
          };
          receipt.summary += upgraded
            ? ` Crowd Control: Repeat attack against up to 2 other creatures within 15 ft (half damage).`
            : ` Crowd Control: Repeat attack against 1 other creature within 15 ft of original (half damage).`;
        } else if (option === "stopApproach") {
          receipt.result = {
            option: "stopApproach",
            dc,
            speedReduction: 20,
            saveFailureSpeedReduction: 20,
            saveSuccessSpeedReduction: upgraded ? 10 : 0
          };
          receipt.summary += upgraded
            ? ` Stop their Approach: ${targetName} DC ${dc} Wis save or -20 ft Speed (-10 ft on successful save) until end of next turn.`
            : ` Stop their Approach: ${targetName} DC ${dc} Wis save or -20 ft Speed until end of next turn.`;
        } else if (option === "shootToKill") {
          const instances = Math.max(1, Number(data.damageInstances ?? 1));
          const die = upgraded ? "d6" : "d4";
          receipt.result = {
            option: "shootToKill",
            formula: `${instances}${die}`,
            instances,
            die: `1${die}`
          };
          receipt.summary += ` Shoot to Kill: +${instances}${die} Piercing Damage (${instances} prior damage instance${instances > 1 ? "s" : ""}).`;
        }

        return updates;
      }
    };
  },

  unapproachable(actor, _state, data) {
    need(isAntiAir(actor), "Unapproachable is an Anti-Air feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Unapproachable");

    const targetUuid = data.targetUuid ?? null;
    const isLocked = targetUuid && isTargetLocked(actor, targetUuid);

    if (!isLocked) {
      const reactions = getReactions(actor);
      if (reactions?.available < 1) {
        warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
      }
    }

    const targetName = data.targetName ?? "Hostile creature";

    return {
      warnings,
      title: "Unapproachable",
      async apply(next, receipt) {
        let updates = {};
        if (!isLocked) {
          try {
            const rx = await spendReaction(actor, { triggerId: `${receipt.id}-unapproachable`, receipt: receipt.id });
            receipt.reaction = { requested: true, spent: Boolean(rx?.ok), receiptId: receipt.id };
          } catch {
            receipt.reaction = { requested: true, spent: false, note: "Reaction spent or mock actor" };
          }
        } else {
          receipt.reaction = { requested: false, spent: false, note: "Free Reaction vs Target Lock target." };
        }

        receipt.summary = `${actor.name} reacts to ${targetName} entering range or moving: makes a Ranged Attack and moves up to half Speed without provoking Opportunity Attacks.`;
        receipt.result = { unapproachableAttack: true, halfSpeedMove: true, targetLocked: isLocked };
        return updates;
      }
    };
  },

  theLastOption(actor, _state, _data) {
    need(isAntiAir(actor), "The Last Option is an Anti-Air feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "The Last Option");

    const available = resourceValue(actor, { pool: "theLastOption" });
    if (available < 1) {
      warn(warnings, "theLastOption", "The Last Option has already been used; uses clamp at 0.");
    }

    return {
      warnings,
      title: "The Last Option",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "theLastOption", amount: 1, label: "The Last Option" });
        updates["flags.ak5e.marksman.theLastOptionActive"] = true;
        updates["flags.ak5e.marksman.usedFreeOptionThisTurn"] = false;
        receipt.summary = `${actor.name} activates The Last Option for 1 minute: 1 free Option per turn and +1 Ranged Weapon Attack on Attack Action.`;
        receipt.result = { stance: "theLastOption", duration: "1 minute" };
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: ANTI_AIR_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function antiAirPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isAntiAir(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const targetToken = globalThis.game?.user?.targets?.first?.() ?? null;
  const targetActor = targetToken?.actor ?? null;

  // Air Tracking: Pigeon Shooting (Advantage against airborne or moved 60+ ft)
  if (activity.actionType === "rwak" && isAirborneOrFast(targetToken, targetActor)) {
    roll.options ??= {};
    roll.options.advantage = true;
  }

  // Weight of Fire: forgo advantage
  if (flag(actor, "marksman")?.weightOfFireActive) {
    roll.options ??= {};
    roll.options.advantage = false;
  }
}

export function antiAirRollInitiative(actor, _combat) {
  if (!actor || !isAntiAir(actor)) return;
  const level = marksmanLevel(actor);
  // 15th level: Option Recharge (recover 1 use of Versatile Approach if below max)
  if (level >= 15) {
    const pool = getPool(actor, "versatileApproach");
    if (pool && pool.value < pool.max) {
      actor.update({
        "flags.ak5e.pools.versatileApproach.value": Math.min(pool.max, pool.value + 1)
      }).catch(err => console.error("AK5e | Option Recharge", err));
    }
  }
}

let installed = false;
export function registerAntiAirHooks() {
  if (installed) return;
  installed = true;

  defineAntiAirPools();

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", antiAirPreRollAttack);
    Hooks.on("dnd5e.rollInitiative", antiAirRollInitiative);
  }
}

defineAntiAirPools();
