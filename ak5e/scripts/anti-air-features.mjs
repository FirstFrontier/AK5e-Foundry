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
import { definePool, getPool, getPoolDefinition, recoverPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { getReactions } from "./trigger-events.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isAntiAir = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "antiAir";
const now = () => Number(globalThis.game?.time?.worldTime ?? Date.now() / 1000);
const ownTurn = actor => Boolean(globalThis.game?.combat?.started && game.combat.combatant?.actor?.uuid === actor.uuid);
const targetKey = uuid => encodeURIComponent(uuid ?? "missing").replaceAll(".", "%2E");
export function antiAirTurnKey(actor, own = false) {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return "outside-combat";
  const index = Array.from(combat.turns ?? []).findIndex(c => c.actor?.uuid === actor.uuid);
  const round = Number(combat.round) - (own && index > Number(combat.turn) ? 1 : 0);
  return `${combat.id}:${round}:${own ? index : combat.turn}`;
}
export const lastOptionActive = actor => {
  const stance = flag(actor, "marksman")?.lastOption;
  return stance?.active === true && Number.isFinite(stance.expiresAt) && now() < stance.expiresAt;
};

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
        { on: "lr", amount: "toMax" },
        { on: "initiative", amount: 1, when: (actor, context) => marksmanLevel(actor) >= 15 && context.marksmanEvent === true }
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
  // Elevation and a fly speed do not establish lack of ground contact (rooftops, grounded flyers).
  if (flag(targetToken?.document, "airborne") === true || flag(targetActor, "airborne") === true) return true;
  // Status condition flying
  if (targetActor?.statuses?.has?.("flying") || targetActor?.statuses?.has?.("hovering")) return true;
  // Moved 60+ ft flag or tracking
  if (flag(targetActor, "movedLastTurn") >= 60 || flag(targetActor, "feetMovedLastTurn") >= 60) return true;
  return false;
}

/* ---------------------------------------------------------------- Anti-Air Plans */

export const ANTI_AIR_PLANS = {
  weightOfFire(actor, _state, data) {
    need(isAntiAir(actor), "Weight of Fire is an Anti-Air feature.");
    const warnings = [];
    if (!ownTurn(actor)) warn(warnings, "turn", "Weight of Fire requires the Attack Action during your Turn.");
    if (!data.advantagedRangedAttack) warn(warnings, "attack", "Confirm an advantaged ranged roll in your Attack Action.");
    if (flag(actor, "marksman")?.weightOfFireUsedTurn === antiAirTurnKey(actor)) warn(warnings, "repeat", "Weight of Fire was already used this Turn.");
    return {
      warnings,
      title: "Weight of Fire",
      apply(next, receipt) {
        receipt.summary = `${actor.name} uses Weight of Fire. Manual resolution: turn off Advantage for the chosen ranged roll in the native roll dialog, then repeat that ranged attack against the same Creature in the same Attack Action. No later roll is changed.`;
        receipt.weaponUuid = data.weaponUuid;
        receipt.result = { weightOfFire: true };
        return {
          "flags.ak5e.marksman.weightOfFireUsedTurn": antiAirTurnKey(actor)
        };
      }
    };
  },

  shiftingFocus(actor, _state, data) {
    need(isAntiAir(actor), "Shifting Focus is an Anti-Air feature.");
    const warnings = [];
    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "New Target";
    const lock = flag(actor, "marksman")?.targetLock;
    if (!lock || !isTargetLocked(actor, lock.targetUuid)) warn(warnings, "lock", "There is no unexpired Target Lock to transfer.");
    if (data.previousTargetHp !== 0) warn(warnings, "previousTarget", "Shifting Focus requires the old Target to have reached 0 Hit Points.");
    if (!ownTurn(actor)) warn(warnings, "turn", "Shifting Focus uses a Bonus Action during your Turn.");
    if (!targetUuid) {
      warn(warnings, "target", "Select a new hostile creature to mark with Shifting Focus.");
    }
    const bonus = lock?.bonus ?? targetLockBonus(actor);

    return {
      warnings,
      title: "Shifting Focus",
      apply(next, receipt) {
        receipt.summary = `${actor.name} shifts focus to ${targetName} (+${bonus} to attack rolls).`;
        receipt.result = { targetUuid, targetName, bonus };
        return {
          "flags.ak5e.marksman.targetLock": {
            ...lock,
            active: true,
            targetUuid,
            targetName,
            bonus,
            startedAt: lock?.startedAt ?? now() - 60,
            expiresAt: lock?.expiresAt ?? now()
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
    need(validOptions.includes(option), "Choose a valid Versatile Approach option.");
    if (!data.conditionsConfirmed) warn(warnings, "conditions", "Confirm this Option's ranged weapon/action or hit trigger, and that no other Option was used on this Attack.");
    if (option === "shootToKill" && data.damageInstances === undefined) warn(warnings, "instances", "Enter the actual damage-instance count since your last Turn; an unspecified count grants no damage.");

    const usesFreeLastOption = lastOptionActive(actor) && ownTurn(actor) && flag(actor, "marksman")?.freeOptionTurn !== antiAirTurnKey(actor, true);

    if (!usesFreeLastOption) {
      const available = resourceValue(actor, { pool: "versatileApproach" });
      if (available < 1) {
        warn(warnings, "versatileApproach", "Versatile Approach uses exhausted; uses clamp at 0.");
      }
    }

    const level = marksmanLevel(actor);
    const upgraded = level >= 15;
    const dc = martialDC(actor, data.martialDcAbility ?? flag(actor, "marksman")?.martialDcAbility);
    if (dc == null && ["areaDenial", "stopApproach"].includes(option)) warn(warnings, "martialDC", "Choose STR or DEX for Martial DC, or resolve the DC manually with the table.");
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
          updates["flags.ak5e.marksman.freeOptionTurn"] = antiAirTurnKey(actor, true);
          receipt.summary = `${actor.name} uses ${titles[option]} (free from The Last Option).`;
        } else {
          updates = spendResource(actor, receipt, { pool: "versatileApproach", amount: 1, label: "Versatile Approach" });
          receipt.summary = `${actor.name} spends 1 use of Versatile Approach to execute ${titles[option]}.`;
        }

        if (option === "areaDenial") {
          receipt.result = {
            option: "areaDenial",
            dc: dc ?? "chosen Martial DC",
            damage: "3d6 piercing",
            radiusFt: 10,
            durationRounds: upgraded ? 2 : 1,
            note: upgraded
              ? "Lingers 1 additional round. Disadvantage & half fly speed for flying creatures. Nominated allies immune."
              : "Next turn: DC " + dc + " Dex save (3d6 piercing). Disadvantage & half fly speed for flying creatures."
          };
          receipt.summary += ` Manual Area Denial: choose a visible point within your wielded ranged weapon's long range. Mark a 10-foot-radius cylinder rising to that point; do not assume a fixed height. At your next Turn start, each Creature in it makes a ${dc == null ? "chosen Martial DC" : `DC ${dc}`} Dexterity save (target owner rolls), taking 3d6 Piercing, half on success. Flying Creatures save at Disadvantage; only a failed save halves Flying Speed until their next Turn ends. INT 10+ Creatures can see the pending area.${upgraded ? " Name Creatures that can hear you as immune now; it lingers an additional round, with saves on entry and Turn end." : ""} Mark timing, affected Creatures and movement changes by hand; this card schedules no automatic damage or saves.`;
          receipt.formula = "3d6";
          receipt.damageParts = [{ formula: "3d6", type: "piercing" }];
        } else if (option === "crowdControl") {
          receipt.result = {
            option: "crowdControl",
            repeats: upgraded ? 2 : 1,
            halfDamage: true
          };
          receipt.summary += upgraded
            ? ` Crowd Control: Repeat attack against up to 2 other creatures within 15 ft (half damage).`
            : ` Crowd Control: Repeat attack against 1 other creature within 15 ft of original (half damage).`;
          receipt.weaponUuid = data.weaponUuid;
          receipt.summary += " Manual resolution: select a different Creature for each repeat, roll your weapon from the card, and halve each repeat's damage with the native controls.";
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
          receipt.summary += " Manual resolution: the target owner rolls the Wisdom save; record each cumulative reduction and restore it at the end of that target's next Turn.";
          receipt.saveAbility = dc == null ? null : "wis";
          receipt.saveTargetUuid = data.targetActorUuid;
        } else if (option === "shootToKill") {
          const instances = Number(data.damageInstances ?? 0);
          need(Number.isSafeInteger(instances) && instances >= 0, "Enter the actual whole number of damage instances since your last Turn, excluding this Option.");
          const die = upgraded ? "d6" : "d4";
          receipt.result = {
            option: "shootToKill",
            formula: `${instances}${die}`,
            instances,
            die: `1${die}`
          };
          receipt.summary += ` Shoot to Kill: +${instances}${die} Piercing Damage (${instances} prior damage instance${instances > 1 ? "s" : ""}).`;
          receipt.summary += " Count damage instances since your last Turn, excluding damage from this Option. The table keeps this count manually.";
          if (instances) { receipt.formula = `${instances}${die}`; receipt.damageParts = [{ formula: receipt.formula, type: "piercing" }]; }
        }

        if (data.resolutionNotes) receipt.summary += ` Resolution notes: ${data.resolutionNotes}`;

        return updates;
      }
    };
  },

  unapproachable(actor, _state, data) {
    need(isAntiAir(actor), "Unapproachable is an Anti-Air feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Unapproachable");

    const targetUuid = data.targetUuid ?? null;
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm a hostile Creature entered your wielded ranged weapon's normal range, or moved while within 30 feet of you.");
    const turn = antiAirTurnKey(actor, true);
    if (flag(actor, "marksman")?.unapproachableTargets?.[targetKey(targetUuid)] === turn) warn(warnings, "repeat", "You already used Unapproachable against this Creature since your last Turn began.");
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
      apply(next, receipt) {
        const updates = { [`flags.ak5e.marksman.unapproachableTargets.${targetKey(targetUuid)}`]: turn };
        if (!isLocked) {
          receipt.reaction = { requested: true, triggerId: `${receipt.id}-unapproachable` };
        } else {
          receipt.reaction = { requested: false, spent: false, note: "Free Reaction vs Target Lock target." };
        }

        receipt.summary = `${actor.name} reacts to ${targetName} entering range or moving: makes a Ranged Attack and moves up to half Speed without provoking Opportunity Attacks.`;
        receipt.summary += " Manual resolution: select that hostile Creature and roll your wielded weapon from this card. Then move your token up to half Speed; movement is optional.";
        receipt.weaponUuid = data.weaponUuid;
        receipt.result = { unapproachableAttack: true, halfSpeedMove: true, targetLocked: isLocked };
        return updates;
      }
    };
  },

  theLastOption(actor, _state, data) {
    need(isAntiAir(actor), "The Last Option is an Anti-Air feature.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "The Last Option");
    if (!ownTurn(actor)) warn(warnings, "turn", "The Last Option is activated during your Turn (no Action required).");

    const available = resourceValue(actor, { pool: "theLastOption" });
    if (available < 1) {
      warn(warnings, "theLastOption", "The Last Option has already been used; uses clamp at 0.");
    }

    return {
      warnings,
      title: "The Last Option",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "theLastOption", amount: 1, label: "The Last Option" });
        updates["flags.ak5e.marksman.lastOption"] = { active: true, expiresAt: now() + 60 };
        updates["flags.ak5e.marksman.freeOptionTurn"] = null;
        receipt.summary = `${actor.name} activates The Last Option for 1 minute: 1 free Option per turn and +1 Ranged Weapon Attack on Attack Action.`;
        receipt.summary += " During each of your Turns, the first Option is free. Make the additional ranged weapon attack manually each Attack Action; this card never starts it for you. Outside combat, track your Turns and the minute by hand.";
        receipt.weaponUuid = data.weaponUuid;
        receipt.result = { stance: "theLastOption", duration: "1 minute" };
        return updates;
      }
    };
  },
  endLastOption(actor) {
    need(isAntiAir(actor), "The Last Option is an Anti-Air feature.");
    return { title: "End The Last Option", warnings: [], apply(_state, receipt) {
      receipt.summary = `${actor.name} ends The Last Option; no use is refunded. Use this when its minute ends outside combat.`;
      return { "flags.ak5e.marksman.lastOption.active": false };
    } };
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

  // Weight of Fire's chosen roll is resolved explicitly in the native roll dialog.
}

export async function antiAirRollInitiative(actor, event = {}) {
  if (!actor || !isAntiAir(actor)) return;
  const level = marksmanLevel(actor);
  // 15th level: Option Recharge (recover 1 use of Versatile Approach if below max)
  if (level >= 15) {
    const pool = getPool(actor, "versatileApproach");
    if (pool && pool.value < pool.max) {
      await recoverPool(actor, "initiative", { poolIds: ["versatileApproach"], eventKey: event.eventId, context: { marksmanEvent: true } });
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
    onAk5eEvent("initiative", event => antiAirRollInitiative(event.raw?.actor, event));
  }
}

defineAntiAirPools();
