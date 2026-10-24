/**
 * Specialist table-play use engine (WORKFLOW.md §3.2, play-uses.mjs).
 * Enforces:
 *  - Confirm before use;
 *  - Non-blocking warnings with "Use anyway" overrides;
 *  - Zero-clamping on resource shortfalls;
 *  - Automatic GM relay for unowned target modifications;
 *  - Interactive roll buttons on chat cards (no auto-rolled dice);
 *  - Encounter-window undo receipts in `flags.ak5e.specialistUses`.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import {
  specialistEnabled, specialistLevel, specialistState, checkLevel,
  specialistDC, martialDC, weaponMasteryMeleeBonus, weaponMasteryRangedBonus, pbForLevel,
  isInventor
} from "./specialist-rules.mjs";
import {
  hasShowYourStyle, hasWeaponAdept, hasWeaponExpertise,
  hasFallingUpwards, hasWeaponMastery, getWeaponSpecialisation
} from "./specialist-features.mjs";
import { need, opaqueKey, values } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { getPool, refundPool } from "./resource-pools.mjs";
import { requireOverrides, isPlayWarnings } from "./play-undo.mjs";
import {
  isExecutor, getExecutorPath, getDeathmarkState, EXECUTOR_PATHS,
  hasInForTheKill
} from "./executor-features.mjs";
import {
  isHookmaster, isHookedWeapon, getHookedWeapon, canConvertWeaponToHook,
  calculateHookRange, getHookmasterState, isNoMoreThanOneSizeLarger,
  isMoreThanOneSizeLarger, listItems, isHookLocked
} from "./hookmaster-features.mjs";
import {
  isInfuser, calculateInfuserDC, calculateInfusionRange, getActiveInfusion,
  hasPrincipleOfDoubleEffect, hasNewConcoctions, hasDoubleBlindTrial,
  hasStimpack, hasExcessiveDosing, hasToDefyScience, getToxinDC,
  INFUSIONS, DOUBLE_BLIND_TABLE
} from "./infuser-features.mjs";
import {
  calculateInventorDC,
  hasEquipmentModification, hasStrangeContraption, hasMobileModding,
  hasRiskAssessment, hasStrangerContraptions, hasTheBigOne,
  isWeapon, isArmor, isModifiableEquipment, isMagicalEquipment, isBrokenEquipment,
  repairBrokenEquipment, getItemModifications, getModification,
  calculateInstability, evaluateBreakdownRoll,
  applyEquipmentModification, removeEquipmentModification,
  MODIFICATIONS_CATALOG, MODIFICATION_CATEGORIES,
  CONTRAPTIONS_CATALOG, getContraption,
  THE_BIG_ONE_MODES, executeTheBigOne
} from "./inventor-features.mjs";
import {
  isSkyranger, isWearingFlightSuit, calculateFuelMax, getFuel, getFuelMax, isSkyscreamerActive,
  AIR_DOCTRINES, AIR_DOCTRINE_NAMES, getStrafeDamageFormula, getStrafeDamageDiceCount,
  executeTakeOff, executeAAMissile, executeBombingRun, executeSwoopingDive,
  executeEvasiveManoeuvres, executeAfterburnersAura, activateSkyscreamer, deactivateSkyscreamer,
  selectAirDoctrine, hasAirDoctrine, isTargetAerial
} from "./skyranger-features.mjs";
import {
  isDollkeeper, getDollkeeperLevel, hasLivingDoll, hasPullTheStrings, hasMusicalChairs,
  hasMasquerade, hasLivingDoll15, hasArtistryIsViolence, executeDollCommand,
  executeMusicalChairs, executeMarionette, executeMistakenIdentity, executeDollRaid,
  calculateDollStrikeBonus, calculateDollStrikeDamageFormula, undoDollkeeperAction
} from "./dollkeeper-features.mjs";
import {
  isTrapmaster, hasEnvironmentalWarfare, hasPanicInducer, hasHeresOneIMadeEarlier,
  hasBaitTheTrap, hasAgentOfChaos, hasHouseOfHorrors, calculateTrapDC, getTrap,
  getTrapDamageFormula, getTrapDamageType, getTrapSaveInfo, plantTrap,
  executeDevilsOwnLuck, executeWarningPoint, executeComeAndGetMe, executePartyFavours,
  undoTrapmasterOperation, TRAPS_CATALOG
} from "./trapmaster-features.mjs";


export function getSpecialistRuling(actor, key) {
  const record = specialistState(actor).rulings?.[key];
  return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
}

export const specialistUses = createPlayUses({
  ns: "specialistUses",
  label: "Specialist",
  isMember: actor => specialistEnabled(actor),
  ruling: (actor, key) => getSpecialistRuling(actor, key)
});
specialistUses.ruling = getSpecialistRuling;

export async function recordSpecialistRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Specialist rulings.");
  const reading = specialistUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.specialist.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return specialistState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = specialistLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Specialist level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const CORE_PLANS = {
  markOfASpecialist(actor, state, data) {
    need(specialistEnabled(actor), "Mark of a Specialist requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Show Your Style (Mark of a Specialist)");

    const skill = data.skill ?? "skill";
    const skillName = data.skillName ?? skill;

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: `Mark of a Specialist -> Reroll ${skillName}`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess to reroll a failed ${skillName} Check. If the reroll fails, 1 Prowess will be refunded.`;
        receipt.result = { skill, skillName, prowessCost: 1, refundable: true };
        return spendUpdate;
      }
    };
  },

  refundMarkOfASpecialist(actor, state, data) {
    need(specialistEnabled(actor), "Refunding Mark of a Specialist requires the Specialist class.");
    const warnings = [];
    return {
      title: "Refund Mark of a Specialist",
      warnings,
      apply(state, receipt) {
        const pool = getPool(actor, "prowess");
        const before = pool.value;
        const after = Math.min(pool.max, before + 1);
        const resourcePath = "flags.ak5e.resourcePools.prowess.value";
        (receipt.resources ??= []).push({
          pool: "prowess",
          path: resourcePath,
          before,
          after,
          max: pool.max,
          label: "Prowess"
        });
        receipt.summary = `${actor.name} still failed the check; 1 Prowess has been refunded per Mark of a Specialist rules.`;
        receipt.result = { refundedProwess: 1 };
        return {
          [resourcePath]: after
        };
      }
    };
  },

  weaponExpertiseMelee(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Expertise requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 12, "Weapon Expertise");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "melee") {
      warn(warnings, "specialisation", "Weapon Expertise (Melee) requires Melee Weapon Specialisation.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Weapon Expertise (Melee): +1 Damage Die",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess (Bonus Action) to roll one additional Damage die on their Melee Attack.`;
        receipt.result = { bonusDice: 1, actionType: "bonusAction" };
        return spendUpdate;
      }
    };
  },

  weaponExpertiseRanged(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Expertise requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 12, "Weapon Expertise");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "ranged") {
      warn(warnings, "specialisation", "Weapon Expertise (Ranged) requires Ranged Weapon Specialisation.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Weapon Expertise (Ranged): Advantage on Next Attack",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess (Bonus Action) to gain Advantage on their next Ranged Attack Roll (rolling 3d20 keep highest if already advantaged).`;
        receipt.result = { advantage: true, actionType: "bonusAction" };
        return spendUpdate;
      }
    };
  },

  itsAllSkill(actor, state, data) {
    need(specialistEnabled(actor), "Falling Upwards requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Falling Upwards (It's All Skill)");

    const pool = getPool(actor, "prowess");
    if (pool.value < 3) {
      warn(warnings, "shortfall", `It's All Skill requires 3 Prowess; current pool has ${pool.value}.`);
    }

    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }

    return {
      title: "Falling Upwards: It's All Skill (Auto-Success)",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 3, label: "Prowess" });
        receipt.reaction = { requested: true, triggerId: data.triggerId ?? `${receipt.id}-itsAllSkill` };
        receipt.summary = `${actor.name} expended 3 Prowess as a Reaction to auto-succeed on their Saving Throw as if rolling the minimum required.`;
        receipt.result = { autoSuccess: true, minRollRequired: true };
        return spendUpdate;
      }
    };
  },

  weaponMasteryMelee(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Mastery requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Weapon Mastery");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "melee") {
      warn(warnings, "specialisation", "Weapon Mastery (Melee) requires Melee Weapon Specialisation.");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const bonus = weaponMasteryMeleeBonus(lvl);

    return {
      title: `Weapon Mastery (Melee): +${bonus} Damage`,
      warnings,
      apply(state, receipt) {
        receipt.summary = `${actor.name} dealt +${bonus} additional Weapon Damage (half Specialist level) on a Melee Attack hit (1/turn).`;
        receipt.result = { damageBonus: bonus, frequency: "oncePerTurn" };
        return {};
      }
    };
  },

  weaponMasteryRanged(actor, state, data) {
    need(specialistEnabled(actor), "Weapon Mastery requires the Specialist class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Weapon Mastery");

    const spec = getWeaponSpecialisation(actor);
    if (spec.category !== "ranged") {
      warn(warnings, "specialisation", "Weapon Mastery (Ranged) requires Ranged Weapon Specialisation.");
    }

    const pb = pbForLevel(specialistLevel(actor) ?? 1);

    return {
      title: `Weapon Mastery (Ranged): Double PB (+${pb} Attack)`,
      warnings,
      apply(state, receipt) {
        receipt.summary = `${actor.name} doubled their Proficiency Bonus (+${pb}) for a Ranged Attack Roll (1/turn).`;
        receipt.result = { attackBonus: pb, frequency: "oncePerTurn" };
        return {};
      }
    };
  },

  defensiveStyle(actor, state, data) {
    need(specialistEnabled(actor), "Fighting Styles require the Specialist class.");
    const warnings = [];
    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }
    return {
      title: "Defensive Fighting Style (+1d4 AC)",
      warnings,
      apply(state, receipt) {
        receipt.reaction = { requested: true, triggerId: data.triggerId ?? `${receipt.id}-defensiveStyle` };
        receipt.summary = `${actor.name} used their Reaction to increase AC by 1d4 against a triggering Attack.`;
        receipt.result = { acBonusFormula: "1d4" };
        return {};
      }
    };
  }
};

export const EXECUTOR_PLANS = {
  transferDeathmark(actor, state, data) {
    need(specialistEnabled(actor), "Deathmark requires the Specialist class.");
    need(isExecutor(actor), "Deathmark is an Executor feature.");
    const warnings = [];

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Hostile Creature";
    if (!targetUuid) {
      warn(warnings, "target", "Target creature is required to transfer Deathmark.");
    }
    if (targetUuid === actor.uuid) {
      warn(warnings, "target", "Cannot transfer Deathmark to yourself.");
    }

    return {
      title: `Transfer Deathmark -> ${targetName}`,
      warnings,
      apply(state, receipt) {
        const priorState = getDeathmarkState(actor);
        const newState = {
          held: false,
          holder: "target",
          targetUuid,
          targetName,
          transferredTurn: data.combatTurnKey ?? null,
          attackedOrDamagedThisTurn: true
        };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.executor.deathmark",
          before: structuredClone(priorState),
          after: structuredClone(newState),
          beforePresent: true
        });

        const updates = {
          "flags.ak5e.executor.deathmark": newState
        };

        if (hasInForTheKill(actor)) {
          updates["flags.ak5e.inForTheKillVulnerable"] = true;
          (receipt.flagChanges ??= []).push({
            path: "flags.ak5e.inForTheKillVulnerable",
            before: actor.flags?.ak5e?.inForTheKillVulnerable ?? null,
            after: true,
            beforePresent: actor.flags?.ak5e?.inForTheKillVulnerable !== undefined
          });
        }

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;

        receipt.summary = `${actor.name} transferred Deathmark to ${targetName}.${hasInForTheKill(actor) ? " Target is Vulnerable against your attacks until end of turn (In for the Kill)." : ""}`;
        receipt.result = { holder: "target", targetUuid, targetName };
        return updates;
      }
    };
  },

  recallDeathmark(actor, state, data) {
    need(specialistEnabled(actor), "Deathmark requires the Specialist class.");
    need(isExecutor(actor), "Deathmark is an Executor feature.");
    const warnings = [];

    const priorState = getDeathmarkState(actor);
    if (priorState.held && priorState.holder === "self") {
      warn(warnings, "alreadyHeld", "Deathmark is already held by yourself.");
    }

    return {
      title: "Recall Deathmark",
      warnings,
      apply(state, receipt) {
        const newState = {
          held: true,
          holder: "self",
          targetUuid: null,
          targetName: null,
          transferredTurn: null,
          attackedOrDamagedThisTurn: false
        };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.executor.deathmark",
          before: structuredClone(priorState),
          after: structuredClone(newState),
          beforePresent: true
        });

        const curSP = Number(actor.flags?.ak5e?.operatorSkill?.points ?? 0);
        const updates = {
          "flags.ak5e.executor.deathmark": newState,
          "flags.ak5e.operatorSkill.points": curSP + 3
        };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.operatorSkill.points",
          before: curSP,
          after: curSP + 3,
          beforePresent: actor.flags?.ak5e?.operatorSkill?.points !== undefined
        });

        receipt.summary = `${actor.name} recalled Deathmark to themselves (+3 SP gained, reaction Disengage available).`;
        receipt.result = { holder: "self", spGained: 3, reactionDisengageAvailable: true };
        return updates;
      }
    };
  },

  sweeper(actor, state, data) {
    need(specialistEnabled(actor), "Sweeper requires the Specialist class.");
    need(isExecutor(actor), "Sweeper is an Executor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Hunter: Sweeper");

    const path = getExecutorPath(actor);
    if (path !== EXECUTOR_PATHS.HUNTER) {
      warn(warnings, "path", "Sweeper requires the Hunter path.");
    }

    const hidingOrInvisible = Boolean(
      data.hidingOrInvisible ||
      actor.flags?.ak5e?.isHiding ||
      actor.flags?.ak5e?.isInvisible ||
      actor.statuses?.has?.("invisible") ||
      actor.statuses?.has?.("hidden")
    );
    if (!hidingOrInvisible && !data.skipStealthCheck) {
      warn(warnings, "stealth", "Sweeper requires you to be Hiding or Invisible.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Sweeper: Reach +5 ft & Cleave (1 Prowess)",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });

        const priorSweeper = actor.flags?.ak5e?.executor?.sweeper ?? { active: false, reachBonus: 0 };
        const newSweeper = { active: true, reachBonus: 5 };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.executor.sweeper",
          before: structuredClone(priorSweeper),
          after: structuredClone(newSweeper),
          beforePresent: actor.flags?.ak5e?.executor?.sweeper !== undefined
        });

        const updates = {
          ...spendUpdate,
          "flags.ak5e.executor.sweeper": newSweeper
        };

        receipt.summary = `${actor.name} expended 1 Prowess for Sweeper: Reach increased by 5 ft until end of turn; make one Melee Attack against each chosen creature within Reach. Hits transfer Deathmark; Deathmark returns at action end (+3 SP).`;
        receipt.result = { reachBonus: 5, active: true };
        return updates;
      }
    };
  },

  smokescreen(actor, state, data) {
    need(specialistEnabled(actor), "Smokescreen requires the Specialist class.");
    need(isExecutor(actor), "Smokescreen is an Executor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Bodyguard: Smokescreen");

    const path = getExecutorPath(actor);
    if (path !== EXECUTOR_PATHS.BODYGUARD) {
      warn(warnings, "path", "Smokescreen requires the Bodyguard path.");
    }

    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Smokescreen: 10-ft Magical Darkness (1 Prowess Reaction)",
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.reaction = { requested: true, triggerId: data.triggerId ?? `${receipt.id}-smokescreen` };

        const priorSmokescreen = actor.flags?.ak5e?.executor?.smokescreen ?? { active: false };
        const newSmokescreen = { active: true, radius: 10, allyName: data.allyName ?? null };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.executor.smokescreen",
          before: structuredClone(priorSmokescreen),
          after: structuredClone(newSmokescreen),
          beforePresent: actor.flags?.ak5e?.executor?.smokescreen !== undefined
        });

        const updates = {
          ...spendUpdate,
          "flags.ak5e.executor.smokescreen": newSmokescreen
        };

        const allyNote = data.allyName ? ` ${data.allyName} may use Reaction to move up to their Speed.` : " One chosen ally within it may use Reaction to move up to their Speed.";
        receipt.summary = `${actor.name} expended 1 Prowess and 1 Reaction to create a 10-foot-radius sphere of Magical Darkness smoke at feet until the end of their next turn.${allyNote}`;
        receipt.result = { radius: 10, duration: "nextTurnEnd", allyName: data.allyName ?? null };
        return updates;
      }
    };
  },

  mortalBlow(actor, state, data) {
    need(specialistEnabled(actor), "Mortal Blow requires the Specialist class.");
    need(isExecutor(actor), "Mortal Blow is an Executor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 20, "Hunter: Mortal Blow");

    const path = getExecutorPath(actor);
    if (path !== EXECUTOR_PATHS.HUNTER) {
      warn(warnings, "path", "Mortal Blow requires the Hunter path.");
    }

    const available = resourceValue(actor, { pool: "mortalBlow" });
    if (available < 1) {
      warn(warnings, "shortfall", "Mortal Blow has already been used this Long Rest.");
    }

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    if (!targetUuid) {
      warn(warnings, "target", "Target creature within Speed is required for Mortal Blow.");
    }

    const mDC = martialDC(actor);
    const reading = specialistUses.ruling(actor, "mortalBlowReading") ?? "bypassDRResist";

    return {
      title: `Mortal Blow -> ${targetName}`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "mortalBlow", amount: 1, label: "Mortal Blow" });

        receipt.formula = "10d8";
        receipt.rollLabel = "Mortal Blow Hit Point Loss";
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.dc = mDC;

        receipt.summary = `${actor.name} uses Mortal Blow (Action, 1/Long Rest) against ${targetName}: teleports within 5 ft; DEX Save vs DC ${mDC}. Interactive 10d8 Hit Point loss (${reading === "bypassAll" ? "bypasses all mitigations and Temporary HP" : "bypasses DR and Resistance"}). HP loss is halved on save, doubled if target has Bleeding.`;
        receipt.result = { dc: mDC, formula: "10d8", reading, targetUuid, targetName };
        return spendUpdate;
      }
    };
  },

  bladeShield(actor, state, data) {
    need(specialistEnabled(actor), "Blade Shield requires the Specialist class.");
    need(isExecutor(actor), "Blade Shield is an Executor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 15, "Bodyguard: Blade Shield");

    const path = getExecutorPath(actor);
    if (path !== EXECUTOR_PATHS.BODYGUARD) {
      warn(warnings, "path", "Blade Shield requires the Bodyguard path.");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const freeReaction = lvl >= 20;

    if (!freeReaction) {
      const reactions = getReactions(actor);
      if (!reactions?.available) {
        warn(warnings, "reaction", "Reaction already expended this round.");
      }
    }

    const dm = getDeathmarkState(actor);
    if (dm.holder !== "target") {
      warn(warnings, "deathmark", "Blade Shield triggers against an attacker with your Deathmark.");
    } else if (data.targetUuid && data.targetUuid !== dm.targetUuid) {
      warn(warnings, "deathmark", "Target creature does not hold your Deathmark.");
    }

    const pb = pbForLevel(lvl);

    return {
      title: `Blade Shield (${freeReaction ? "Free Reaction" : "Reaction"} -> -${pb} to Attack)`,
      warnings,
      apply(state, receipt) {
        if (!freeReaction) {
          receipt.reaction = { requested: true, triggerId: data.triggerId ?? `${receipt.id}-bladeShield` };
        } else {
          receipt.reaction = { requested: false, free: true };
        }

        receipt.summary = `${actor.name} uses Blade Shield${freeReaction ? " (costs 0 Reaction via Ultimate Sword and Shield)" : " (Reaction)"}: make a Weapon Attack against marked attacker. If your Attack hits, subtract ${pb} (PB) from their Attack Roll.`;
        receipt.result = { pbSubtracted: pb, freeReaction };
        return {};
      }
    };
  },

  attackRedirection(actor, state, data) {
    need(specialistEnabled(actor), "Attack Redirection requires the Specialist class.");
    need(isExecutor(actor), "Attack Redirection is an Executor feature.");
    const warnings = [];

    const path = getExecutorPath(actor);
    if (path !== EXECUTOR_PATHS.BODYGUARD) {
      warn(warnings, "path", "Attack Redirection requires the Bodyguard path.");
    }

    const dm = getDeathmarkState(actor);
    if (dm.holder !== "target") {
      warn(warnings, "deathmark", "Hostile creature must hold your Deathmark to redirect its attack.");
    }

    if (data.distanceToTarget !== undefined && Number(data.distanceToTarget) > 10) {
      warn(warnings, "distance", "Specialist must be within 10 feet of the original target.");
    }

    const allyName = data.allyName ?? "allied creature";

    return {
      title: `Attack Redirection -> Redirect to ${actor.name}`,
      warnings,
      apply(state, receipt) {
        receipt.summary = `${actor.name} redirects attack from marked creature onto themselves instead of ${allyName} (no action required).`;
        receipt.result = { redirectedTo: actor.uuid, originalTarget: data.targetUuid ?? null };
        return {};
      }
    };
  },

  dangersense(actor, state, data) {
    need(specialistEnabled(actor), "Dangersense requires the Specialist class.");
    need(isExecutor(actor), "Dangersense is an Executor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 11, "Bodyguard: Dangersense");

    const path = getExecutorPath(actor);
    if (path !== EXECUTOR_PATHS.BODYGUARD) {
      warn(warnings, "path", "Dangersense requires the Bodyguard path.");
    }

    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }

    if (data.allyDistance !== undefined && Number(data.allyDistance) > 5) {
      warn(warnings, "distance", "Allied creature must be within 5 feet.");
    }

    const walkSpeed = actor.system?.attributes?.movement?.walk ?? 30;
    const maxMove = Math.floor(walkSpeed / 2);
    const allyName = data.allyName ?? "ally";

    return {
      title: `Dangersense (Reaction -> Move ${maxMove} ft with ${allyName})`,
      warnings,
      apply(state, receipt) {
        receipt.reaction = { requested: true, triggerId: data.triggerId ?? `${receipt.id}-dangersense` };

        receipt.summary = `${actor.name} uses Dangersense (Reaction): moves with ${allyName} up to ${maxMove} ft (half Speed) out of Area of Effect. If outside AoE, take 0 Damage on Save success and half Damage on failure.`;
        receipt.result = { maxMove, allyName };
        return {};
      }
    };
  }
};

EXECUTOR_PLANS.transferDeathmark.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;
EXECUTOR_PLANS.recallDeathmark.validateTarget = () => false;
EXECUTOR_PLANS.sweeper.validateTarget = () => false;
EXECUTOR_PLANS.smokescreen.validateTarget = () => false;
EXECUTOR_PLANS.mortalBlow.validateTarget = (source, receipt, entry, target) => entry.uuid === target.uuid;
EXECUTOR_PLANS.bladeShield.validateTarget = () => false;
EXECUTOR_PLANS.attackRedirection.validateTarget = () => false;
EXECUTOR_PLANS.dangersense.validateTarget = () => false;

export const HOOKMASTER_PLANS = {
  convertHookedWeapon(actor, state, data) {
    need(specialistEnabled(actor), "Converting a Hooked Weapon requires the Specialist class.");
    need(isHookmaster(actor), "Converting a Hooked Weapon is a Hookmaster feature.");
    const warnings = [];

    const itemId = data.itemId ?? data.itemUuid;
    const item = actor.items?.get?.(itemId) ?? listItems(actor.items).find(i => i.id === itemId || i.uuid === itemId);
    if (!item) {
      warn(warnings, "item", "Choose an owned Melee Weapon to convert into a Hook.");
    } else {
      const check = canConvertWeaponToHook(item);
      if (!check.valid) {
        for (const reason of check.reasons) {
          warn(warnings, "weaponCriteria", reason);
        }
      }
    }

    const hmState = getHookmasterState(actor);
    const free = data.free ?? !hmState.freeConversionUsed;
    const lmd = Number(actor.system?.currency?.lmd ?? actor.system?.currency?.gp ?? 0);
    if (!free && lmd < 200) {
      warn(warnings, "currency", "Insufficient currency: replacing or adding a Hook requires 200 LMD.");
    }

    const rangeVal = calculateHookRange(actor);

    return {
      title: `Convert Hooked Weapon -> ${item?.name ?? "Weapon"}`,
      warnings,
      async apply(state, receipt) {
        const origProps = item.system?.properties;
        const originalProperties = origProps instanceof Set ? Array.from(origProps) :
                                   Array.isArray(origProps) ? [...origProps] :
                                   origProps ? Object.keys(origProps).filter(k => origProps[k]) : [];
        const originalRange = structuredClone(item.system?.range ?? {});
        receipt.originalItemState = {
          itemId: item.id ?? item.uuid,
          properties: originalProperties,
          range: originalRange,
          name: item.name
        };

        let newProps;
        if (origProps instanceof Set) {
          newProps = new Set(origProps);
          newProps.add("two");
          newProps.add("thr");
        } else if (Array.isArray(origProps)) {
          newProps = Array.from(new Set([...origProps, "two", "thr"]));
        } else {
          newProps = new Set([...originalProperties, "two", "thr"]);
        }

        const itemUpdates = {
          "system.properties": newProps,
          "system.range.value": rangeVal,
          "system.range.long": null,
          "flags.ak5e.isHooked": true,
          "flags.ak5e.hookmaster.isHooked": true,
          "flags.ak5e.hookmaster.originalItemState": receipt.originalItemState
        };

        if (typeof item.update === "function") {
          await item.update(itemUpdates);
        } else {
          item.system.properties = newProps;
          item.system.range = { value: rangeVal, long: null };
          ((item.flags ??= {}).ak5e ??= {}).isHooked = true;
          (item.flags.ak5e.hookmaster ??= {}).isHooked = true;
          item.flags.ak5e.hookmaster.originalItemState = receipt.originalItemState;
        }

        const updates = {
          "flags.ak5e.hookmaster.hookedWeaponId": item.id ?? item.uuid,
          "flags.ak5e.hookmaster.freeConversionUsed": true,
          "flags.ak5e.hookmaster.originalItemState": receipt.originalItemState
        };

        if (!free) {
          const curPath = actor.system?.currency?.lmd !== undefined ? "system.currency.lmd" : "system.currency.gp";
          const newLmd = Math.max(0, lmd - 200);
          updates[curPath] = newLmd;
          (receipt.resources ??= []).push({
            pool: null,
            path: curPath,
            before: lmd,
            after: newLmd,
            label: "LMD Currency"
          });
        }

        (receipt.flagChanges ??= []).push(
          {
            path: "flags.ak5e.hookmaster.hookedWeaponId",
            before: hmState.hookedWeaponId,
            after: item.id ?? item.uuid,
            beforePresent: actor.flags?.ak5e?.hookmaster?.hookedWeaponId !== undefined
          },
          {
            path: "flags.ak5e.hookmaster.freeConversionUsed",
            before: hmState.freeConversionUsed,
            after: true,
            beforePresent: actor.flags?.ak5e?.hookmaster?.freeConversionUsed !== undefined
          },
          {
            path: "flags.ak5e.hookmaster.originalItemState",
            before: structuredClone(actor.flags?.ak5e?.hookmaster?.originalItemState ?? null),
            after: structuredClone(receipt.originalItemState),
            beforePresent: actor.flags?.ak5e?.hookmaster?.originalItemState !== undefined
          }
        );

        receipt.summary = `${actor.name} converted ${item.name} into a Hooked Weapon (${free ? "Free starting weapon conversion" : "Cost: 200 LMD, 1 hour"}). Gains Two-Handed, Thrown (${rangeVal}/-), returns on thrown attacks, and uses STR for ranged attacks.`;
        receipt.result = { itemId: item.id ?? item.uuid, free, range: rangeVal };
        return updates;
      }
    };
  },

  revertHookedWeapon(actor, state, data) {
    need(specialistEnabled(actor), "Reverting a Hooked Weapon requires the Specialist class.");
    need(isHookmaster(actor), "Reverting a Hooked Weapon is a Hookmaster feature.");
    const warnings = [];

    const item = (data.itemId ? (actor.items?.get?.(data.itemId) ?? listItems(actor.items).find(i => i.id === data.itemId || i.uuid === data.itemId)) : null) ?? getHookedWeapon(actor);
    if (!item) {
      warn(warnings, "item", "No active Hooked Weapon found to revert.");
    }

    return {
      title: `Revert Hooked Weapon -> ${item?.name ?? "Weapon"}`,
      warnings,
      async apply(state, receipt) {
        const hmState = getHookmasterState(actor);
        const originalState = item.getFlag?.("ak5e", "hookmaster")?.originalItemState ??
                              item.flags?.ak5e?.hookmaster?.originalItemState ??
                              hmState.originalItemState;

        const restoredProps = originalState?.properties ? (item.system?.properties instanceof Set ? new Set(originalState.properties) : [...originalState.properties]) :
                              (item.system?.properties instanceof Set ? (item.system.properties.delete("two"), item.system.properties.delete("thr"), item.system.properties) :
                              Array.isArray(item.system?.properties) ? item.system.properties.filter(p => p !== "two" && p !== "thr") : []);

        const restoredRange = originalState?.range ?? { value: 5, long: null, reach: 5 };

        if (typeof item.update === "function") {
          await item.update({
            "system.properties": restoredProps,
            "system.range": restoredRange,
            "flags.ak5e.isHooked": null,
            "flags.ak5e.hookmaster.isHooked": null
          });
        } else {
          item.system.properties = restoredProps;
          item.system.range = restoredRange;
          if (item.flags?.ak5e) {
            delete item.flags.ak5e.isHooked;
            if (item.flags.ak5e.hookmaster) delete item.flags.ak5e.hookmaster.isHooked;
          }
        }

        const updates = {
          "flags.ak5e.hookmaster.hookedWeaponId": null
        };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.hookmaster.hookedWeaponId",
          before: item.id ?? item.uuid,
          after: null,
          beforePresent: true
        });

        receipt.summary = `${actor.name} reverted ${item.name} back to its original weapon form.`;
        receipt.result = { itemId: item.id ?? item.uuid, reverted: true };
        return updates;
      }
    };
  },

  bigBoot(actor, state, data) {
    need(specialistEnabled(actor), "Big Boot requires the Specialist class.");
    need(isHookmaster(actor), "Big Boot is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Hookmaster: Big Boot");

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;

    if (targetActor && isMoreThanOneSizeLarger(actor, targetActor)) {
      warn(warnings, "size", "Big Boot target cannot be more than one size larger than you.");
    }

    const hmState = getHookmasterState(actor);
    const urbanJungleActive = Boolean(hmState.urbanJungle?.active || hmState.meleeForcedMovementDoubled || data.urbanJungleActive);
    const pushDistance = urbanJungleActive ? 20 : 10;

    return {
      title: `Big Boot -> Push ${targetName} ${pushDistance} ft`,
      warnings,
      apply(state, receipt) {
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;

        if (actor.flags?.ak5e?.hookmaster?.meleeForcedMovementDoubled) {
          if (typeof actor.update === "function") {
            actor.update({ "flags.ak5e.hookmaster.meleeForcedMovementDoubled": false });
          } else {
            actor.flags.ak5e.hookmaster.meleeForcedMovementDoubled = false;
          }
        }

        receipt.summary = `${actor.name} uses Big Boot on ${targetName} on Unarmed Strike hit: pushes ${targetName} ${pushDistance} feet directly away${urbanJungleActive ? " (doubled from 10 ft via King of the Urban Jungle)" : ""}.`;
        receipt.result = { pushDistance, targetUuid, targetName };
        return {};
      }
    };
  },

  kingOfUrbanJungle(actor, state, data) {
    need(specialistEnabled(actor), "King of the Urban Jungle requires the Specialist class.");
    need(isHookmaster(actor), "King of the Urban Jungle is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Hookmaster: King of the Urban Jungle");

    if (!data.moved20ft && !data.skipMovementCheck) {
      warn(warnings, "movement", "King of the Urban Jungle requires having moved at least 20 feet immediately beforehand during your turn.");
    }

    const hookRange = calculateHookRange(actor);
    const flyingSpeed = 2 * hookRange;
    const pb = pbForLevel(specialistLevel(actor));

    return {
      title: `King of the Urban Jungle (Flying Speed ${flyingSpeed} ft)`,
      warnings,
      apply(state, receipt) {
        const priorJungle = actor.flags?.ak5e?.hookmaster?.urbanJungle ?? null;
        const newJungle = {
          active: true,
          hookRange,
          flyingSpeed,
          doublePushActive: true,
          point: data.surfacePoint ?? "surface point within range"
        };

        const priorFlying = Number(actor.flags?.ak5e?.hookmaster?.flyingMovementThisTurn ?? 0);
        const addedFlying = Number(data.flyingDistance ?? flyingSpeed);
        const newFlying = priorFlying + addedFlying;

        (receipt.flagChanges ??= []).push(
          {
            path: "flags.ak5e.hookmaster.urbanJungle",
            before: structuredClone(priorJungle),
            after: structuredClone(newJungle),
            beforePresent: priorJungle !== null
          },
          {
            path: "flags.ak5e.hookmaster.flyingMovementThisTurn",
            before: priorFlying,
            after: newFlying,
            beforePresent: actor.flags?.ak5e?.hookmaster?.flyingMovementThisTurn !== undefined
          }
        );

        const updates = {
          "flags.ak5e.hookmaster.urbanJungle": newJungle,
          "flags.ak5e.hookmaster.flyingMovementThisTurn": newFlying
        };

        receipt.summary = `${actor.name} activates King of the Urban Jungle: gains Flying Speed of ${flyingSpeed} ft towards a chosen surface point within ${hookRange} ft (cannot attack with Hook while flying; must move at least 10 ft). Immediate melee attack deals +${pb} Damage and doubles forced movement.`;
        receipt.result = { flyingSpeed, hookRange, doublePushActive: true };
        return updates;
      }
    };
  },

  boundInRope(actor, state, data) {
    need(specialistEnabled(actor), "Bound in Rope requires the Specialist class.");
    need(isHookmaster(actor), "Bound in Rope is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Hookmaster: Bound in Rope");

    const hook = getHookedWeapon(actor);
    if (!hook) {
      warn(warnings, "hook", "Bound in Rope requires your Hook to be equipped.");
    }

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;

    if (targetActor && isMoreThanOneSizeLarger(actor, targetActor)) {
      warn(warnings, "size", "Bound in Rope target cannot be more than one size larger than you.");
    }

    const hookRange = calculateHookRange(actor);
    if (data.distance !== undefined && Number(data.distance) > hookRange) {
      warn(warnings, "range", `Target is beyond Hook range (${hookRange} ft).`);
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    const mDC = martialDC(actor);

    return {
      title: `Bound in Rope -> Grapple ${targetName} (1 Prowess)`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });

        const priorTarget = actor.flags?.ak5e?.hookmaster?.grappledTarget ?? null;
        const priorLocked = Boolean(actor.flags?.ak5e?.hookmaster?.hookLocked);

        const newTarget = { uuid: targetUuid, name: targetName };

        (receipt.flagChanges ??= []).push(
          {
            path: "flags.ak5e.hookmaster.grappledTarget",
            before: structuredClone(priorTarget),
            after: structuredClone(newTarget),
            beforePresent: priorTarget !== null
          },
          {
            path: "flags.ak5e.hookmaster.hookLocked",
            before: priorLocked,
            after: true,
            beforePresent: actor.flags?.ak5e?.hookmaster?.hookLocked !== undefined
          }
        );

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.dc = mDC;
        receipt.saveAbility = "dex";

        const updates = {
          ...spendUpdate,
          "flags.ak5e.hookmaster.grappledTarget": newTarget,
          "flags.ak5e.hookmaster.hookLocked": true
        };

        receipt.summary = `${actor.name} expends 1 Prowess for Bound in Rope against ${targetName} (Action): target must succeed on a DEX Save vs Martial DC ${mDC} or become Grappled. While Grappled, Hook use is locked. Can drag up to 15 ft (Bonus Action) or hogtie within 5 ft (Action).`;
        receipt.result = { dc: mDC, targetUuid, targetName, grappled: true };
        return updates;
      }
    };
  },

  dragBoundTarget(actor, state, data) {
    need(specialistEnabled(actor), "Drag Bound Target requires the Specialist class.");
    need(isHookmaster(actor), "Drag Bound Target is a Hookmaster feature.");
    const warnings = [];

    const hmState = getHookmasterState(actor);
    const grappled = hmState.grappledTarget;
    if (!grappled?.uuid) {
      warn(warnings, "grapple", "Drag Bound Target requires an actively grappled target via Bound in Rope.");
    }

    const distance = Math.min(15, Number(data.distance ?? 15));
    const targetName = data.targetName ?? grappled?.name ?? "Grappled Creature";
    const targetUuid = data.targetUuid ?? grappled?.uuid;

    return {
      title: `Drag Bound Target -> Drag ${targetName} ${distance} ft (Bonus Action)`,
      warnings,
      apply(state, receipt) {
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;

        receipt.summary = `${actor.name} uses Bonus Action to drag ${targetName} up to ${distance} feet towards themselves.`;
        receipt.result = { distance, targetUuid, targetName };
        return {};
      }
    };
  },

  hogtie(actor, state, data) {
    need(specialistEnabled(actor), "Hogtie requires the Specialist class.");
    need(isHookmaster(actor), "Hogtie is a Hookmaster feature.");
    const warnings = [];

    const hmState = getHookmasterState(actor);
    const grappled = hmState.grappledTarget;
    if (!grappled?.uuid) {
      warn(warnings, "grapple", "Hogtie requires an actively grappled target via Bound in Rope.");
    }

    if (data.distance !== undefined && Number(data.distance) > 5) {
      warn(warnings, "distance", "Hogtie requires target creature to be within 5 feet.");
    }

    const targetName = data.targetName ?? grappled?.name ?? "Grappled Creature";
    const targetUuid = data.targetUuid ?? grappled?.uuid;

    return {
      title: `Hogtie -> Restrain ${targetName} (Action)`,
      warnings,
      apply(state, receipt) {
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;

        receipt.summary = `${actor.name} uses Action to hogtie ${targetName} within 5 ft: applies Manacles (Restrained condition).`;
        receipt.result = { targetUuid, targetName, hogtied: true };
        return {};
      }
    };
  },

  releaseGrapple(actor, state, data) {
    need(specialistEnabled(actor), "Release Grapple requires the Specialist class.");
    need(isHookmaster(actor), "Release Grapple is a Hookmaster feature.");
    const warnings = [];

    const hmState = getHookmasterState(actor);
    const grappled = hmState.grappledTarget;
    const targetName = grappled?.name ?? "target";

    return {
      title: `Release Grapple (${targetName})`,
      warnings,
      apply(state, receipt) {
        (receipt.flagChanges ??= []).push(
          {
            path: "flags.ak5e.hookmaster.grappledTarget",
            before: structuredClone(grappled),
            after: null,
            beforePresent: grappled !== null
          },
          {
            path: "flags.ak5e.hookmaster.hookLocked",
            before: hmState.hookLocked,
            after: false,
            beforePresent: true
          }
        );

        const updates = {
          "flags.ak5e.hookmaster.grappledTarget": null,
          "flags.ak5e.hookmaster.hookLocked": false
        };

        receipt.summary = `${actor.name} ends the Bound in Rope grapple on ${targetName} (no action required); Hook use is unlocked.`;
        receipt.result = { released: true };
        return updates;
      }
    };
  },

  wrangler(actor, state, data) {
    need(specialistEnabled(actor), "Wrangler requires the Specialist class.");
    need(isHookmaster(actor), "Wrangler is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Hookmaster: Wrangler");

    const hook = getHookedWeapon(actor);
    if (!hook) {
      warn(warnings, "hook", "Wrangler requires your Hook to be equipped.");
    }

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;

    if (targetActor && isNoMoreThanOneSizeLarger(actor, targetActor)) {
      warn(warnings, "size", "Wrangler target must be more than one size larger than you.");
    }

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    const mDC = martialDC(actor);
    const ignoreDR = Boolean(data.ignoreDR);

    return {
      title: `Wrangler -> Latch onto ${targetName} (1 Prowess)`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });

        const priorTarget = actor.flags?.ak5e?.hookmaster?.wranglerTarget ?? null;
        const newTarget = { uuid: targetUuid, name: targetName, ignoreDR };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.hookmaster.wranglerTarget",
          before: structuredClone(priorTarget),
          after: structuredClone(newTarget),
          beforePresent: priorTarget !== null
        });

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.dc = mDC;
        receipt.saveAbility = "dex";

        const updates = {
          ...spendUpdate,
          "flags.ak5e.hookmaster.wranglerTarget": newTarget
        };

        receipt.summary = `${actor.name} expends 1 Prowess for Wrangler against ${targetName} (Action): target must succeed on a DEX Save vs Martial DC ${mDC} or your Hook latches onto them. Specialist moves to target's space and moves with target without consuming movement. Attacks against target have Advantage (can take -5 attack penalty to ignore Damage Reduction).`;
        receipt.result = { dc: mDC, targetUuid, targetName, latched: true, ignoreDR };
        return updates;
      }
    };
  },

  releaseWrangler(actor, state, data) {
    need(specialistEnabled(actor), "Release Wrangler requires the Specialist class.");
    need(isHookmaster(actor), "Release Wrangler is a Hookmaster feature.");
    const warnings = [];

    const hmState = getHookmasterState(actor);
    const wrangler = hmState.wranglerTarget;
    const targetName = wrangler?.name ?? "target";

    return {
      title: `Release Wrangler (${targetName})`,
      warnings,
      apply(state, receipt) {
        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.hookmaster.wranglerTarget",
          before: structuredClone(wrangler),
          after: null,
          beforePresent: wrangler !== null
        });

        const updates = {
          "flags.ak5e.hookmaster.wranglerTarget": null
        };

        receipt.summary = `${actor.name} releases the Wrangler latch on ${targetName} (no action required).`;
        receipt.result = { released: true };
        return updates;
      }
    };
  },

  mightyPush(actor, state, data) {
    need(specialistEnabled(actor), "Mighty Push requires the Specialist class.");
    need(isHookmaster(actor), "Mighty Push is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 11, "Hookmaster: Mighty Push");

    const available = resourceValue(actor, { pool: "mightyPush" });
    if (available < 1) {
      warn(warnings, "shortfall", "Mighty Push has no remaining uses this Long Rest.");
    }

    if (data.distance !== undefined && Number(data.distance) > 5) {
      warn(warnings, "distance", "Mighty Push requires target creature to be within 5 feet.");
    }

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const mDC = martialDC(actor);
    const collision = Boolean(data.collision);
    const collisionTargetName = data.collisionTargetName ?? "obstacle";

    return {
      title: `Mighty Push -> ${targetName} (Action, DC ${mDC})`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "mightyPush", amount: 1, label: "Mighty Push" });

        receipt.formula = "8d6";
        receipt.rollLabel = "Mighty Push Bludgeoning Damage";
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.dc = mDC;
        receipt.saveAbility = "str";

        const collisionNote = collision ? ` Collides with ${collisionTargetName}, taking falling damage equal to knockback distance (2d6 on fail, 1d6 on save).` : "";
        receipt.summary = `${actor.name} uses Mighty Push against ${targetName} (Action, PB/Long Rest): target makes STR Save vs Martial DC ${mDC}. Interactive 8d6 Bludgeoning damage. On fail: full damage and 20 ft knockback; on save: half damage and 10 ft knockback.${collisionNote}`;
        receipt.result = { dc: mDC, formula: "8d6", targetUuid, targetName, collision };
        return spendUpdate;
      }
    };
  },

  spidersThread(actor, state, data) {
    need(specialistEnabled(actor), "Spider's Thread requires the Specialist class.");
    need(isHookmaster(actor), "Spider's Thread is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 15, "Spider's Essence: Spider's Thread");

    const hookRange = calculateHookRange(actor);

    return {
      title: `Spider's Thread (Climbing Speed ${hookRange} ft)`,
      warnings,
      apply(state, receipt) {
        const point = data.surfacePoint ?? "surface above";
        receipt.summary = `${actor.name} uses Spider's Thread (Action): grapples to ${point}, gaining Climbing Speed of ${hookRange} ft towards that point until start of next turn. Allies starting from the same location gain ${hookRange} ft Climbing Speed until end of their turn.`;
        receipt.result = { climbingSpeed: hookRange, point };
        return {};
      }
    };
  },

  swingToSafety(actor, state, data) {
    need(specialistEnabled(actor), "Swing to Safety requires the Specialist class.");
    need(isHookmaster(actor), "Swing to Safety is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 15, "Spider's Essence: Swing to Safety");

    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", "Reaction already expended this round.");
    }

    if (data.fallingHeight !== undefined && Number(data.fallingHeight) < 10) {
      warn(warnings, "falling", "Swing to Safety requires falling from a height sufficient to take falling damage (at least 10 ft).");
    }

    const hookRange = calculateHookRange(actor);
    const flyingSpeed = 2 * hookRange;

    return {
      title: `Swing to Safety (Reaction while falling -> Fly ${flyingSpeed} ft)`,
      warnings,
      apply(state, receipt) {
        receipt.reaction = { requested: true, triggerId: data.triggerId ?? `${receipt.id}-swingToSafety` };

        const priorJungle = actor.flags?.ak5e?.hookmaster?.urbanJungle ?? null;
        const newJungle = {
          active: true,
          hookRange,
          flyingSpeed,
          doublePushActive: true,
          reaction: true
        };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.hookmaster.urbanJungle",
          before: structuredClone(priorJungle),
          after: structuredClone(newJungle),
          beforePresent: priorJungle !== null
        });

        const updates = {
          "flags.ak5e.hookmaster.urbanJungle": newJungle
        };

        receipt.summary = `${actor.name} uses Swing to Safety (Reaction while falling): activates King of the Urban Jungle, gaining Flying Speed of ${flyingSpeed} ft to grapple to a surface within ${hookRange} ft and avoid falling damage.`;
        receipt.result = { hookRange, flyingSpeed, avoidedFallingDamage: true };
        return updates;
      }
    };
  },

  scorpionSting(actor, state, data) {
    need(specialistEnabled(actor), "Scorpion Sting requires the Specialist class.");
    need(isHookmaster(actor), "Scorpion Sting is a Hookmaster feature.");
    const warnings = [];

    levelWarning(warnings, actor, 20, "Hookmaster: Scorpion Sting");

    const hook = getHookedWeapon(actor);
    if (!hook) {
      warn(warnings, "hook", "Scorpion Sting requires your Hook to be equipped.");
    }

    const available = resourceValue(actor, { pool: "scorpionSting" });
    if (available < 1) {
      warn(warnings, "shortfall", "Scorpion Sting has already been used this Long Rest.");
    }

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;

    const hookRange = calculateHookRange(actor);
    if (data.distance !== undefined && Number(data.distance) > hookRange) {
      warn(warnings, "range", `Target is beyond Hook range (${hookRange} ft).`);
    }

    const hmState = getHookmasterState(actor);
    const isGrappledOrLatched = Boolean(
      (hmState.grappledTarget?.uuid && hmState.grappledTarget.uuid === targetUuid) ||
      (hmState.wranglerTarget?.uuid && hmState.wranglerTarget.uuid === targetUuid) ||
      data.targetGrappledOrLatched
    );

    const mDC = martialDC(actor);
    const lvl = specialistLevel(actor) ?? 20;
    const bonusDmg = Math.floor(lvl / 2);

    const pullTarget = targetActor ? isNoMoreThanOneSizeLarger(actor, targetActor) : true;

    return {
      title: `Scorpion Sting -> ${targetName} (Action, 1/LR)`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "scorpionSting", amount: 1, label: "Scorpion Sting" });

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.dc = mDC;
        receipt.saveAbility = "dex";
        receipt.autoFail = isGrappledOrLatched;
        receipt.bonusDamage = bonusDmg;
        receipt.attackCount = 6;

        const moveText = pullTarget ? `pulls ${targetName} directly to within 5 ft` : `pulls ${actor.name} directly to within 5 ft of ${targetName}`;
        const autoFailText = isGrappledOrLatched ? " Target automatically fails Save (Grappled/Latched; Hook lockout ignored)." : ` Target must succeed on a DEX Save vs Martial DC ${mDC}.`;

        receipt.summary = `${actor.name} uses Scorpion Sting against ${targetName} (Action, 1/Long Rest):${autoFailText} Specialist ${moveText}, then makes 6 Attacks with Hook with Advantage, each dealing +${bonusDmg} weapon damage.`;
        receipt.result = { dc: mDC, targetUuid, targetName, bonusDamage: bonusDmg, attackCount: 6, autoFail: isGrappledOrLatched };
        return spendUpdate;
      }
    };
  },

  bonusActionHookAttack(actor, state, data) {
    need(specialistEnabled(actor), "Bonus Action Hook Attack requires the Specialist class.");
    need(isHookmaster(actor), "Bonus Action Hook Attack is a Hookmaster feature.");
    const warnings = [];

    const hook = getHookedWeapon(actor);
    if (!hook) {
      warn(warnings, "weapon", "You must have a converted Hook equipped.");
    }

    if (isHookLocked(actor)) {
      warn(warnings, "hookLocked", "Your Hook is locked while grappling a creature with Bound in Rope.");
    }

    const hmState = getHookmasterState(actor);
    if (hmState.urbanJungle?.active) {
      warn(warnings, "urbanJungle", "You cannot attack with your Hook while King of the Urban Jungle is active.");
    }

    if (hmState.rangedHookAttacksThisTurn > 0) {
      warn(warnings, "priorAttack", "You cannot make a Bonus Action Hook Attack: you have already made a Ranged Hook Attack this turn.");
    }

    if (hmState.bonusActionHookAttackUsedThisTurn) {
      warn(warnings, "alreadyUsed", "You have already used Bonus Action Hook Attack this turn.");
    }

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";

    return {
      title: `Bonus Action Ranged Attack with Hook -> ${targetName}`,
      warnings,
      apply(state, receipt) {
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.summary = `${actor.name} makes a Ranged Attack using their Hook as a Bonus Action against ${targetName}. (Restriction: no other Ranged Hook attacks can be or have been made this turn).`;
        receipt.result = { targetUuid, targetName, bonusActionHookAttack: true };

        const updates = {
          "flags.ak5e.hookmaster.bonusActionHookAttackUsedThisTurn": true,
          "flags.ak5e.hookmaster.rangedHookAttacksThisTurn": (hmState.rangedHookAttacksThisTurn || 0) + 1
        };

        (receipt.flagChanges ??= []).push(
          {
            path: "flags.ak5e.hookmaster.bonusActionHookAttackUsedThisTurn",
            before: hmState.bonusActionHookAttackUsedThisTurn,
            after: true,
            beforePresent: true
          },
          {
            path: "flags.ak5e.hookmaster.rangedHookAttacksThisTurn",
            before: hmState.rangedHookAttacksThisTurn,
            after: (hmState.rangedHookAttacksThisTurn || 0) + 1,
            beforePresent: true
          }
        );

        return updates;
      }
    };
  }
};

HOOKMASTER_PLANS.convertHookedWeapon.validateTarget = () => false;
HOOKMASTER_PLANS.revertHookedWeapon.validateTarget = () => false;
HOOKMASTER_PLANS.bigBoot.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.kingOfUrbanJungle.validateTarget = () => false;
HOOKMASTER_PLANS.boundInRope.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.dragBoundTarget.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.hogtie.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.releaseGrapple.validateTarget = () => false;
HOOKMASTER_PLANS.wrangler.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.releaseWrangler.validateTarget = () => false;
HOOKMASTER_PLANS.mightyPush.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.spidersThread.validateTarget = () => false;
HOOKMASTER_PLANS.swingToSafety.validateTarget = () => false;
HOOKMASTER_PLANS.scorpionSting.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
HOOKMASTER_PLANS.bonusActionHookAttack.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;

export const INFUSER_PLANS = {
  applyInfusion(actor, state, data) {
    need(specialistEnabled(actor), "Alchemical Infusions require the Specialist class.");
    need(isInfuser(actor), "Alchemical Infusions is an Infuser feature.");
    const warnings = [];

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;

    if (!targetUuid) {
      warn(warnings, "target", "Target creature is required to apply an Infusion.");
    }

    if (targetActor) {
      const type = String(targetActor.system?.details?.type?.value ?? targetActor.system?.details?.type ?? "").toLowerCase();
      if (type.includes("construct") || type.includes("undead")) {
        warn(warnings, "creatureType", "Alchemical Infusions cannot be applied to Constructs or Undead.");
      }
    }

    const range = calculateInfusionRange(actor);
    if (data.distance !== undefined && Number(data.distance) > range) {
      warn(warnings, "range", `Target is beyond Infusion range (${range} ft).`);
    }

    const infusionType = data.infusionType ?? "adrenalineTrigger";
    const infusion = INFUSIONS[infusionType];
    if (!infusion) {
      warn(warnings, "infusionType", `Unknown Alchemical Infusion type: ${infusionType}.`);
    }

    const pool = getPool(actor, "alchemicalInfusions");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Alchemical Infusions pool is empty (0 remaining).");
    }

    const dc = calculateInfuserDC(actor);
    const intBonus = Number(actor.system?.abilities?.int?.mod ?? 0);

    return {
      title: `Apply Infusion: ${infusion?.name ?? infusionType} -> ${targetName} (Bonus Action)`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "alchemicalInfusions", amount: 1, label: "Alchemical Infusions" });

        const priorInfusion = targetActor ? structuredClone(getActiveInfusion(targetActor)) : null;
        const now = game.time?.worldTime ?? Date.now();
        const infusionRecord = {
          type: infusionType,
          name: infusion?.name ?? infusionType,
          infuserUuid: actor.uuid,
          infuserId: actor.id,
          infuserName: actor.name,
          infuserIntBonus: intBonus,
          dc,
          appliedAt: now,
          expiresAt: now + 60
        };

        if (targetActor) {
          if (typeof targetActor.update === "function") {
            targetActor.update({
              "flags.ak5e.infuser.activeInfusion": infusionRecord,
              "flags.ak5e.infuser.leverageLockout": false
            });
          } else if (targetActor.flags) {
            ((targetActor.flags.ak5e ??= {}).infuser ??= {}).activeInfusion = infusionRecord;
            targetActor.flags.ak5e.infuser.leverageLockout = false;
          }
        }

        const priorInfusionsOnInfuser = actor.flags?.ak5e?.infuser?.activeInfusions ?? {};
        const newInfusionsOnInfuser = {
          ...priorInfusionsOnInfuser,
          [targetUuid]: { type: infusionType, name: infusion?.name ?? infusionType, targetUuid, targetName, appliedAt: now }
        };

        if (actor.flags) {
          ((actor.flags.ak5e ??= {}).infuser ??= {}).activeInfusions = newInfusionsOnInfuser;
        }

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.infuser.activeInfusions",
          before: structuredClone(priorInfusionsOnInfuser),
          after: structuredClone(newInfusionsOnInfuser),
          beforePresent: actor.flags?.ak5e?.infuser?.activeInfusions !== undefined
        });

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.infusionType = infusionType;
        receipt.infusionName = infusion?.name ?? infusionType;
        receipt.dc = dc;
        receipt.priorInfusion = priorInfusion;

        if (hasStimpack(actor)) {
          receipt.formula = "1d10";
          receipt.rollLabel = "Questionable Rejuvenation (1d10 Temp HP)";
          receipt.questionableRejuvenation = true;
        }

        const updates = {
          ...spendUpdate,
          "==flags.ak5e.infuser.activeInfusions": newInfusionsOnInfuser
        };

        const stimNote = hasStimpack(actor) ? " Target gains 1d10 Temporary Hit Points (Questionable Rejuvenation)." : "";
        receipt.summary = `${actor.name} applies ${infusion?.name ?? infusionType} to ${targetName} (Bonus Action, 1 use of Alchemical Infusions, Infuser DC ${dc}, duration 1 minute). Overwrites any prior Infusion.${stimNote}`;
        receipt.result = { infusionType, targetUuid, targetName, dc, overwrotePrior: priorInfusion !== null };
        return updates;
      }
    };
  },

  leverageInfusion(actor, state, data) {
    need(specialistEnabled(actor), "Alchemical Infusions require the Specialist class.");
    const warnings = [];

    const targetUuid = data.targetUuid ?? actor.uuid;
    const targetName = data.targetName ?? actor.name;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : actor;

    const activeInf = targetActor ? getActiveInfusion(targetActor) : null;
    if (!activeInf) {
      warn(warnings, "noInfusion", `Target ${targetName} does not have an active Alchemical Infusion.`);
    }

    const isDazed = Boolean(targetActor?.statuses?.has?.("dazed") || targetActor?.flags?.ak5e?.dazed);
    const lockout = Boolean(targetActor?.flags?.ak5e?.infuser?.leverageLockout);
    if (isDazed || lockout) {
      warn(warnings, "lockout", `${targetName} is Dazed or in Leverage Lockout and cannot Leverage Infusions.`);
    }

    const infuserActor = activeInf?.infuserUuid ? (globalThis.fromUuidSync?.(activeInf.infuserUuid)?.actor ?? globalThis.fromUuidSync?.(activeInf.infuserUuid)) : actor;
    const dc = activeInf?.dc ?? calculateInfuserDC(infuserActor ?? actor);
    const infusionType = activeInf?.type ?? data.infusionType ?? "adrenalineTrigger";
    const infusion = INFUSIONS[infusionType] ?? { name: infusionType, formula: null };

    return {
      title: `Leverage Infusion: ${infusion.name} (${targetName})`,
      warnings,
      apply(state, receipt) {
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.infusionType = infusionType;
        receipt.dc = dc;
        receipt.saveAbility = "con";

        const saveFailed = data.saveFailed ?? (data.saveSuccess === false);
        const updates = {};

        // In both success and failure, target gains the benefit of the infusion
        if (infusionType === "adrenalineTrigger") {
          receipt.formula = "1d6";
          receipt.rollLabel = "Adrenaline Trigger (1d6 to failed STR check/save/attack)";
        } else if (infusionType === "focusHeightener") {
          receipt.formula = "1d6";
          receipt.rollLabel = "Focus Heightener (1d6 to failed DEX check/save/ranged attack)";
        } else if (infusionType === "hesitationSuppressor") {
          receipt.formula = "1d4";
          receipt.rollLabel = "Hesitation Suppressor (1d4 DC boost)";
        } else if (infusionType === "sensationNulling") {
          receipt.formula = "1d6";
          receipt.rollLabel = "Sensation Nulling Damage Reduction (1d6 DR)";
          const drAmount = Number(data.rolledDR ?? data.rollResult ?? 4);
          if (targetActor) {
            if (typeof targetActor.update === "function") {
              targetActor.update({ "flags.ak5e.infuser.sensationNullingDR": drAmount });
            } else if (targetActor.flags) {
              ((targetActor.flags.ak5e ??= {}).infuser ??= {}).sensationNullingDR = drAmount;
            }
          }
        } else if (infusionType === "muscleStrengthener") {
          const intBonus = activeInf?.infuserIntBonus ?? infuserActor?.system?.abilities?.int?.mod ?? actor.system?.abilities?.int?.mod ?? 0;
          receipt.intBonus = intBonus;
          if (targetActor) {
            if (typeof targetActor.update === "function") {
              targetActor.update({ "flags.ak5e.infuser.muscleStrengthenerActive": true });
            } else if (targetActor.flags) {
              ((targetActor.flags.ak5e ??= {}).infuser ??= {}).muscleStrengthenerActive = true;
            }
          }
        } else if (infusionType === "flightReflexStimulant") {
          const intBonus = activeInf?.infuserIntBonus ?? infuserActor?.system?.abilities?.int?.mod ?? actor.system?.abilities?.int?.mod ?? 0;
          receipt.intBonus = intBonus;
        } else if (infusionType === "procoagulant") {
          const hd = targetActor?.system?.attributes?.hd?.denom ?? "d8";
          const conMod = Number(targetActor?.system?.abilities?.con?.mod ?? 0);
          const stimBonus = (infuserActor && hasStimpack(infuserActor)) ? " + 1d10" : "";
          receipt.formula = `1${hd} + ${conMod}${stimBonus}`;
          receipt.rollLabel = "Procoagulant Temporary Hit Points";
          if (targetActor) {
            if (typeof targetActor.toggleStatusEffect === "function") {
              targetActor.toggleStatusEffect("ak5e-bleeding", { active: false }).catch(() => {});
            } else if (targetActor.flags?.ak5e) {
              targetActor.flags.ak5e.bleeding = false;
            }
          }
        } else if (infusionType === "respirationStimulant") {
          receipt.speedBonus = 10;
        }

        // Handle CON save outcome
        let outcomeNote = "";
        let dazedApplied = false;
        if (saveFailed) {
          dazedApplied = true;
          outcomeNote = ` CON Save FAILED vs Infuser DC ${dc}: gains Infusion benefit, but is additionally DAZED until start of next turn and enters Leverage Lockout.`;
          if (targetActor) {
            if (typeof targetActor.update === "function") {
              targetActor.update({ "flags.ak5e.infuser.leverageLockout": true });
            } else if (targetActor.flags) {
              ((targetActor.flags.ak5e ??= {}).infuser ??= {}).leverageLockout = true;
            }
            if (typeof targetActor.toggleStatusEffect === "function") {
              targetActor.toggleStatusEffect("dazed", { active: true }).catch(() => {});
            } else if (targetActor.flags?.ak5e) {
              targetActor.flags.ak5e.dazed = true;
            }
          }
        } else {
          outcomeNote = ` CON Save SUCCEEDED vs Infuser DC ${dc}: gains Infusion benefit without penalty.`;
          if (infuserActor && hasStimpack(infuserActor) && infusionType !== "procoagulant") {
            receipt.stimpackFormula = "1d10";
            outcomeNote += " Stimpack grants 1d10 Temporary Hit Points on Save success.";
          }
        }

        // Prowess trigger: Infusion turned failure into success (1/round)
        if (data.turnedFailureToSuccess && infuserActor) {
          const gainedThisRound = infuserActor.flags?.ak5e?.infuser?.prowessGainedFromInfusionThisRound;
          if (!gainedThisRound) {
            refundPool(infuserActor, "prowess", 1, { reason: "Infusion turned failure into success" });
            if (typeof infuserActor.update === "function") {
              infuserActor.update({ "flags.ak5e.infuser.prowessGainedFromInfusionThisRound": true });
            } else if (infuserActor.flags) {
              ((infuserActor.flags.ak5e ??= {}).infuser ??= {}).prowessGainedFromInfusionThisRound = true;
            }
            outcomeNote += ` Infusion turned failure into success -> ${infuserActor.name} gains 1 Prowess (1/round).`;
          }
        }

        receipt.summary = `${targetName} Leverages ${infusion.name}.${outcomeNote}`;
        receipt.result = { infusionType, targetUuid, targetName, dc, saveFailed, dazedApplied };
        return updates;
      }
    };
  },

  doubleBlindTrial(actor, state, data) {
    need(specialistEnabled(actor), "Double-Blind Trial requires the Specialist class.");
    need(isInfuser(actor), "Double-Blind Trial is an Infuser feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Infuser: Double-Blind Trial");

    if (!data.hasPharmacologyKit && !data.skipToolCheck) {
      const items = listItems(actor.items ?? []);
      const hasKit = items.some(i => i.name?.toLowerCase().includes("pharmacology") || i.flags?.ak5e?.chapterFourId?.includes("pharmacology"));
      if (!hasKit) {
        warn(warnings, "tool", "Double-Blind Trial requires access to a Pharmacology Kit.");
      }
    }

    const appliedToxin = actor.getFlag?.("ak5e", "appliedToxin") ?? actor.flags?.ak5e?.appliedToxin;
    if (appliedToxin) {
      warn(warnings, "toxin", `Weapon already has a toxin applied (${appliedToxin.name}). Double-Blind Trial requires an untoxined weapon.`);
    }

    const prowessPool = getPool(actor, "prowess");
    if (prowessPool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    const infusionPool = getPool(actor, "alchemicalInfusions");
    if (infusionPool.value < 1) {
      warn(warnings, "shortfall", "Alchemical Infusions pool is empty (0 remaining).");
    }

    return {
      title: "Double-Blind Trial (BA, 1 Prowess + 1 Infusion -> 1d6 Toxin)",
      warnings,
      apply(state, receipt) {
        const spendProwess = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        const spendInfusion = spendResource(actor, receipt, { pool: "alchemicalInfusions", amount: 1, label: "Alchemical Infusions" });

        receipt.formula = "1d6";
        receipt.rollLabel = "Double-Blind Trial 1d6 Toxin Roll";

        const rollResult = Number(data.rolledToxin ?? data.rollResult ?? 1);
        const toxinName = DOUBLE_BLIND_TABLE[rollResult] ?? "Neurological Inhibitor";
        const dc = getToxinDC(actor, 15);

        const toxinData = {
          name: toxinName,
          type: toxinName,
          dc,
          appliedAt: game.time?.worldTime ?? Date.now(),
          duration: 600,
          creatorUuid: actor.uuid
        };

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.appliedToxin",
          before: structuredClone(appliedToxin ?? null),
          after: structuredClone(toxinData),
          beforePresent: appliedToxin !== undefined && appliedToxin !== null
        });

        const updates = {
          ...spendProwess,
          ...spendInfusion,
          "flags.ak5e.appliedToxin": toxinData
        };

        const excessiveNote = hasExcessiveDosing(actor) ? " (DC increased by PB via Excessive Dosing Succumb; failed saves inflict Toxic Shock Poisoned rider)" : "";
        receipt.summary = `${actor.name} activates Double-Blind Trial (Bonus Action, 1 Prowess + 1 Infusion): rolled ${rollResult} -> ${toxinName} (DC ${dc}) applied to weapon for 10 minutes.${excessiveNote}`;
        receipt.result = { rollResult, toxinName, dc, duration: 600 };
        return updates;
      }
    };
  },

  toDefyScience(actor, state, data) {
    need(specialistEnabled(actor), "To Defy Science requires the Specialist class.");
    need(isInfuser(actor), "To Defy Science is an Infuser feature.");
    const warnings = [];

    levelWarning(warnings, actor, 20, "Infuser: To Defy Science");

    const pool = getPool(actor, "toDefyScience");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "To Defy Science has already been used this Long Rest.");
    }

    const targetUuid = data.targetUuid ?? actor.uuid;
    const targetName = data.targetName ?? actor.name;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : actor;

    if (data.distance !== undefined && Number(data.distance) > 30) {
      warn(warnings, "range", "Target is beyond 30 feet.");
    }

    return {
      title: `To Defy Science -> ${targetName} (Action, 1/LR Invulnerability)`,
      warnings,
      apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "toDefyScience", amount: 1, label: "To Defy Science" });

        const priorInvulnerable = Boolean(targetActor?.flags?.ak5e?.infuser?.invulnerable);

        if (targetActor) {
          if (typeof targetActor.update === "function") {
            targetActor.update({
              "flags.ak5e.infuser.invulnerable": true,
              "flags.ak5e.infuser.invulnerableUntil": (game.time?.worldTime ?? Date.now()) + 60
            });
          } else if (targetActor.flags) {
            ((targetActor.flags.ak5e ??= {}).infuser ??= {}).invulnerable = true;
            targetActor.flags.ak5e.infuser.invulnerableUntil = (game.time?.worldTime ?? Date.now()) + 60;
          }
        }

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.priorInvulnerable = priorInvulnerable;

        receipt.summary = `${actor.name} uses To Defy Science (Action, 1/Long Rest) on ${targetName}: ${targetName} cannot lose Hit Points for the next minute, as if under the effect of Invulnerability.`;
        receipt.result = { targetUuid, targetName, invulnerable: true, duration: 60 };
        return spendUpdate;
      }
    };
  },

  clearInfusion(actor, state, data) {
    need(specialistEnabled(actor), "Alchemical Infusions require the Specialist class.");
    const warnings = [];

    const targetUuid = data.targetUuid ?? null;
    const targetName = data.targetName ?? "Target";
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;

    if (!targetUuid) {
      warn(warnings, "target", "Target creature is required to clear an Infusion.");
    }

    return {
      title: `Clear Infusion -> ${targetName}`,
      warnings,
      apply(state, receipt) {
        const priorInfusion = targetActor ? structuredClone(getActiveInfusion(targetActor)) : null;

        if (targetActor) {
          if (typeof targetActor.update === "function") {
            targetActor.update({
              "flags.ak5e.infuser.activeInfusion": null,
              "flags.ak5e.infuser.leverageLockout": false
            });
          } else if (targetActor.flags?.ak5e?.infuser) {
            targetActor.flags.ak5e.infuser.activeInfusion = null;
            targetActor.flags.ak5e.infuser.leverageLockout = false;
          }
        }

        const priorInfusionsOnInfuser = actor.flags?.ak5e?.infuser?.activeInfusions ?? {};
        const newInfusionsOnInfuser = { ...priorInfusionsOnInfuser };
        if (targetUuid) {
          delete newInfusionsOnInfuser[targetUuid];
        }

        if (actor.flags) {
          ((actor.flags.ak5e ??= {}).infuser ??= {}).activeInfusions = newInfusionsOnInfuser;
        }

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.infuser.activeInfusions",
          before: structuredClone(priorInfusionsOnInfuser),
          after: structuredClone(newInfusionsOnInfuser),
          beforePresent: actor.flags?.ak5e?.infuser?.activeInfusions !== undefined
        });

        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.priorInfusion = priorInfusion;

        const updates = {
          "==flags.ak5e.infuser.activeInfusions": newInfusionsOnInfuser
        };

        receipt.summary = `${actor.name} cleared the active Infusion from ${targetName}.`;
        receipt.result = { targetUuid, targetName, cleared: true };
        return updates;
      }
    };
  }
};

INFUSER_PLANS.applyInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INFUSER_PLANS.leverageInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INFUSER_PLANS.clearInfusion.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INFUSER_PLANS.toDefyScience.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INFUSER_PLANS.doubleBlindTrial.validateTarget = () => false;

export const HOOKMASTER_READINGS = {
  hookmasterTwoHandedConversion: {
    label: "Hooked Weapon Two-Handed Conversion",
    options: [
      { value: "gainsTwoHanded", label: "Melee weapon without Two-Handed gains Two-Handed property upon conversion (default)" },
      { value: "replacesVersatile", label: "Versatile weapons lose one-handed mode upon gaining Two-Handed" }
    ]
  },
  wranglerSharedSpace: {
    label: "Wrangler Shared Space Mechanics",
    options: [
      { value: "latchSharesSpace", label: "Specialist occupies same grid space and moves with target without consuming movement (default)" },
      { value: "mountedRider", label: "Specialist acts as a clinging rider on the larger creature" }
    ]
  }
};

export const INFUSER_READINGS = {
  infuserDcReading: {
    label: "Infuser DC Calculation Formula",
    options: [
      { value: "inverted", label: "20 - INT - PB (Source default, higher chemist skill eases DC for allies)" },
      { value: "standard", label: "8 + INT + PB (Standard D&D5e DC convention)" }
    ]
  }
};

export function hookmasterCleanup(state, receipt, actor) {
  if (receipt.command === "convertHookedWeapon") {
    const itemId = receipt.data?.itemId ?? receipt.result?.itemId;
    const item = actor.items?.get?.(itemId) ?? listItems(actor.items).find(i => i.id === itemId || i.uuid === itemId);
    if (item && receipt.originalItemState) {
      const origProps = receipt.originalItemState.properties;
      const restored = origProps instanceof Set ? origProps :
                       Array.isArray(origProps) ? (item.system?.properties instanceof Set ? new Set(origProps) : [...origProps]) :
                       (item.system?.properties instanceof Set ? new Set() : []);
      if (typeof item.update === "function") {
        item.update({
          "system.properties": restored,
          "system.range": receipt.originalItemState.range,
          "flags.ak5e.isHooked": null,
          "flags.ak5e.hookmaster.isHooked": null
        });
      } else {
        item.system.properties = restored;
        item.system.range = receipt.originalItemState.range;
        if (item.flags?.ak5e) {
          delete item.flags.ak5e.isHooked;
          if (item.flags.ak5e.hookmaster) delete item.flags.ak5e.hookmaster.isHooked;
        }
      }
    }
  } else if (receipt.command === "revertHookedWeapon") {
    const itemId = receipt.data?.itemId ?? receipt.result?.itemId;
    const item = actor.items?.get?.(itemId) ?? listItems(actor.items).find(i => i.id === itemId || i.uuid === itemId);
    if (item) {
      const rangeVal = calculateHookRange(actor);
      let newProps;
      const currentProps = item.system?.properties;
      if (currentProps instanceof Set) {
        newProps = new Set(currentProps);
        newProps.add("two");
        newProps.add("thr");
      } else if (Array.isArray(currentProps)) {
        newProps = Array.from(new Set([...currentProps, "two", "thr"]));
      } else {
        newProps = new Set(["two", "thr"]);
      }
      if (typeof item.update === "function") {
        item.update({
          "system.properties": newProps,
          "system.range.value": rangeVal,
          "system.range.long": null,
          "flags.ak5e.isHooked": true,
          "flags.ak5e.hookmaster.isHooked": true
        });
      } else {
        item.system.properties = newProps;
        item.system.range = { value: rangeVal, long: null };
        ((item.flags ??= {}).ak5e ??= {}).isHooked = true;
        (item.flags.ak5e.hookmaster ??= {}).isHooked = true;
      }
    }
  }
}

export function infuserCleanup(state, receipt, actor) {
  if (receipt.command === "applyInfusion") {
    const targetUuid = receipt.targetUuid ?? receipt.result?.targetUuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;
    if (targetActor) {
      if (typeof targetActor.update === "function") {
        targetActor.update({
          "flags.ak5e.infuser.activeInfusion": receipt.priorInfusion ?? null,
          "flags.ak5e.infuser.leverageLockout": false
        });
      } else if (targetActor.flags?.ak5e?.infuser) {
        targetActor.flags.ak5e.infuser.activeInfusion = receipt.priorInfusion ?? null;
        targetActor.flags.ak5e.infuser.leverageLockout = false;
      }
    }
    if (actor.flags?.ak5e?.infuser?.activeInfusions && targetUuid) {
      if (receipt.priorInfusion) {
        actor.flags.ak5e.infuser.activeInfusions[targetUuid] = {
          type: receipt.priorInfusion.type,
          name: receipt.priorInfusion.name,
          targetUuid,
          targetName: receipt.targetName,
          appliedAt: receipt.priorInfusion.appliedAt
        };
      } else {
        delete actor.flags.ak5e.infuser.activeInfusions[targetUuid];
      }
      if (typeof actor.update === "function") {
        actor.update({ "==flags.ak5e.infuser.activeInfusions": { ...actor.flags.ak5e.infuser.activeInfusions } });
      }
    }
  } else if (receipt.command === "clearInfusion") {
    const targetUuid = receipt.targetUuid ?? receipt.result?.targetUuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;
    if (targetActor && receipt.priorInfusion) {
      if (typeof targetActor.update === "function") {
        targetActor.update({
          "flags.ak5e.infuser.activeInfusion": receipt.priorInfusion,
          "flags.ak5e.infuser.leverageLockout": false
        });
      } else if (targetActor.flags?.ak5e?.infuser) {
        targetActor.flags.ak5e.infuser.activeInfusion = receipt.priorInfusion;
        targetActor.flags.ak5e.infuser.leverageLockout = false;
      }
    }
    if (actor.flags?.ak5e?.infuser?.activeInfusions && targetUuid && receipt.priorInfusion) {
      actor.flags.ak5e.infuser.activeInfusions[targetUuid] = {
        type: receipt.priorInfusion.type,
        name: receipt.priorInfusion.name,
        targetUuid,
        targetName: receipt.targetName,
        appliedAt: receipt.priorInfusion.appliedAt
      };
      if (typeof actor.update === "function") {
        actor.update({ "==flags.ak5e.infuser.activeInfusions": { ...actor.flags.ak5e.infuser.activeInfusions } });
      }
    }
  } else if (receipt.command === "leverageInfusion") {
    const targetUuid = receipt.targetUuid ?? receipt.result?.targetUuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;
    if (targetActor) {
      if (typeof targetActor.update === "function") {
        targetActor.update({
          "flags.ak5e.infuser.leverageLockout": false,
          "flags.ak5e.infuser.sensationNullingDR": 0,
          "flags.ak5e.infuser.muscleStrengthenerActive": false
        });
      } else if (targetActor.flags?.ak5e?.infuser) {
        targetActor.flags.ak5e.infuser.leverageLockout = false;
        targetActor.flags.ak5e.infuser.sensationNullingDR = 0;
        targetActor.flags.ak5e.infuser.muscleStrengthenerActive = false;
      }
      if (receipt.result?.dazedApplied) {
        if (typeof targetActor.toggleStatusEffect === "function") {
          targetActor.toggleStatusEffect("dazed", { active: false }).catch(() => {});
        } else if (targetActor.flags?.ak5e) {
          targetActor.flags.ak5e.dazed = false;
        }
      }
    }
  } else if (receipt.command === "doubleBlindTrial") {
    if (typeof actor.update === "function") {
      actor.update({ "flags.ak5e.appliedToxin": null });
    }
    if (actor.flags?.ak5e) {
      actor.flags.ak5e.appliedToxin = null;
    }
  } else if (receipt.command === "toDefyScience") {
    const targetUuid = receipt.targetUuid ?? receipt.result?.targetUuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : null;
    if (targetActor) {
      if (typeof targetActor.update === "function") {
        targetActor.update({
          "flags.ak5e.infuser.invulnerable": false,
          "flags.ak5e.infuser.invulnerableUntil": null
        });
      } else if (targetActor.flags?.ak5e?.infuser) {
        targetActor.flags.ak5e.infuser.invulnerable = false;
        targetActor.flags.ak5e.infuser.invulnerableUntil = null;
      }
    }
  }
}

export const INVENTOR_PLANS = {
  applyModification(actor, state, data) {
    need(specialistEnabled(actor), "Equipment Modification requires the Specialist class.");
    need(isInventor(actor), "Equipment Modification is an Inventor feature.");
    const warnings = [];

    const itemId = data.itemId ?? data.itemUuid;
    const targetUuid = data.targetUuid ?? actor.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : actor;
    const item = (itemId && targetActor?.items) ?
                 (targetActor.items.get?.(itemId) ?? listItems(targetActor.items).find(i => i.id === itemId || i.uuid === itemId)) :
                 (itemId && globalThis.fromUuidSync?.(itemId));

    if (!item) {
      warn(warnings, "item", "Choose an owned weapon or piece of armor to modify.");
    } else {
      if (!isModifiableEquipment(item)) {
        warn(warnings, "equipment", "Item must be a weapon or piece of armor.");
      }
      if (isMagicalEquipment(item)) {
        warn(warnings, "magical", "Cannot apply modifications to magical equipment.");
      }
    }

    const modId = data.modificationId ?? data.modId;
    const mod = modId ? getModification(modId) : null;
    if (!mod) {
      warn(warnings, "modification", "Choose a valid modification to apply.");
    } else if (item && isModifiableEquipment(item)) {
      const existing = getItemModifications(item);
      if (existing.some(m => m.id === mod.id)) {
        warn(warnings, "duplicate", `Equipment already has modification "${mod.name}".`);
      }
      if (mod.category === MODIFICATION_CATEGORIES.MELEE && !isWeapon(item)) {
        warn(warnings, "category", `Modification "${mod.name}" can only be applied to a Melee Weapon.`);
      } else if (mod.category === MODIFICATION_CATEGORIES.RANGED && !isWeapon(item)) {
        warn(warnings, "category", `Modification "${mod.name}" can only be applied to a Ranged Weapon.`);
      } else if (mod.category === MODIFICATION_CATEGORIES.ARMOR && !isArmor(item)) {
        warn(warnings, "category", `Modification "${mod.name}" can only be applied to Armor.`);
      }
    }

    const pool = getPool(actor, "inventions");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Inventions pool is empty (0 remaining).");
    }

    return {
      title: `Apply Modification: ${mod?.name ?? modId ?? "Mod"} -> ${item?.name ?? "Equipment"}`,
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "inventions", amount: 1, label: "Inventions" });

        const priorMods = item ? structuredClone(getItemModifications(item)) : [];
        receipt.priorModifications = priorMods;
        receipt.targetUuid = targetActor?.uuid ?? actor.uuid;
        receipt.targetName = targetActor?.name ?? actor.name;
        receipt.itemUuid = item?.uuid ?? item?.id ?? itemId;
        receipt.itemName = item?.name ?? "Equipment";
        receipt.modificationId = mod?.id ?? modId;
        receipt.modificationName = mod?.name ?? modId;
        receipt.isDangerous = Boolean(mod?.isDangerous);

        if (item && mod) {
          await applyEquipmentModification(item, mod.id, {
            ...data,
            actor,
            inventorActor: actor,
            force: true,
            skipPoolSpend: true
          });
        }

        const instability = item ? calculateInstability(item, actor, data) : 3;
        receipt.instability = instability;

        receipt.summary = `${actor.name} applied ${mod?.name ?? modId} to ${item?.name ?? "Equipment"} (${receipt.isDangerous ? "Dangerous Modification, " : ""}Instability ${instability}, 1 Invention locked).`;
        receipt.result = {
          itemUuid: receipt.itemUuid,
          modificationId: receipt.modificationId,
          instability,
          targetUuid: receipt.targetUuid
        };

        return spendUpdate;
      }
    };
  },

  removeModification(actor, state, data) {
    need(specialistEnabled(actor), "Equipment Modification requires the Specialist class.");
    need(isInventor(actor), "Equipment Modification is an Inventor feature.");
    const warnings = [];

    const itemId = data.itemId ?? data.itemUuid;
    const targetUuid = data.targetUuid ?? actor.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : actor;
    const item = (itemId && targetActor?.items) ?
                 (targetActor.items.get?.(itemId) ?? listItems(targetActor.items).find(i => i.id === itemId || i.uuid === itemId)) :
                 (itemId && globalThis.fromUuidSync?.(itemId));

    if (!item) {
      warn(warnings, "item", "Choose an owned piece of modified equipment.");
    }

    const modId = data.modificationId ?? data.modId;
    const existingMods = item ? getItemModifications(item) : [];
    const foundMod = existingMods.find(m => m.id === modId);
    if (!foundMod) {
      warn(warnings, "modification", `Modification "${modId}" is not installed on this equipment.`);
    }

    return {
      title: `Remove Modification: ${foundMod?.name ?? modId ?? "Mod"} -> ${item?.name ?? "Equipment"}`,
      warnings,
      async apply(state, receipt) {
        const priorMods = structuredClone(existingMods);
        receipt.priorModifications = priorMods;
        receipt.targetUuid = targetActor?.uuid ?? actor.uuid;
        receipt.targetName = targetActor?.name ?? actor.name;
        receipt.itemUuid = item?.uuid ?? item?.id ?? itemId;
        receipt.itemName = item?.name ?? "Equipment";
        receipt.modificationId = foundMod?.id ?? modId;
        receipt.modificationName = foundMod?.name ?? modId;
        receipt.removedModification = foundMod;

        const isMobileMod = Boolean(foundMod?.isMobileModding);
        let refundUpdate = {};

        if (!isMobileMod) {
          const pool = getPool(actor, "inventions");
          const before = pool.value;
          const after = Math.min(pool.max, before + 1);
          const resourcePath = "flags.ak5e.resourcePools.inventions.value";
          (receipt.resources ??= []).push({
            pool: "inventions",
            path: resourcePath,
            before,
            after,
            max: pool.max,
            label: "Inventions"
          });
          refundUpdate[resourcePath] = after;
        }

        if (item && modId) {
          await removeEquipmentModification(item, modId, {
            ...data,
            actor,
            inventorActor: actor,
            force: true
          });
        }

        const instability = item ? calculateInstability(item, actor, data) : 0;
        receipt.instability = instability;

        receipt.summary = `${actor.name} removed ${foundMod?.name ?? modId} from ${item?.name ?? "Equipment"} (${isMobileMod ? "Temporary Mobile Mod removed" : "1 Invention refunded"}, Instability now ${instability}).`;
        receipt.result = {
          itemUuid: receipt.itemUuid,
          modificationId: receipt.modificationId,
          refunded: !isMobileMod,
          instability
        };

        return refundUpdate;
      }
    };
  },

  activateModification(actor, state, data) {
    need(specialistEnabled(actor), "Equipment Modification requires the Specialist class.");
    const warnings = [];

    const itemId = data.itemId ?? data.itemUuid;
    const targetUuid = data.targetUuid ?? actor.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : actor;
    const item = (itemId && targetActor?.items) ?
                 (targetActor.items.get?.(itemId) ?? listItems(targetActor.items).find(i => i.id === itemId || i.uuid === itemId)) :
                 (itemId && globalThis.fromUuidSync?.(itemId));

    if (!item) {
      warn(warnings, "item", "Choose an owned piece of modified equipment.");
    } else if (isBrokenEquipment(item)) {
      warn(warnings, "broken", `Equipment "${item.name}" is broken and must be repaired before activating modifications.`);
    }

    const modId = data.modificationId ?? data.modId;
    const mod = modId ? getModification(modId) : null;
    const installedMods = item ? getItemModifications(item) : [];
    const isInstalled = installedMods.some(m => m.id === modId);

    if (!isInstalled) {
      warn(warnings, "installed", `Modification "${mod?.name ?? modId}" is not installed on this equipment.`);
    }

    if (mod?.id === "life-support") {
      const curHP = actor.system?.attributes?.hp?.value;
      const maxHP = actor.system?.attributes?.hp?.max;
      if (curHP !== undefined && maxHP !== undefined && curHP >= Math.ceil(maxHP / 2)) {
        warn(warnings, "lifeSupportHP", `Life Support requires wearer to be below half maximum HP (current: ${curHP}/${maxHP}).`);
      }
    }

    if (mod?.id === "adrenal-overloader") {
      const srUsed = actor.flags?.ak5e?.inventor?.adrenalOverloaderUsedSR;
      const turnUsed = actor.flags?.ak5e?.inventor?.adrenalOverloaderUsedTurn;
      if (srUsed || turnUsed) {
        warn(warnings, "frequency", "Adrenal Overloader is limited to 1/Short Rest and 1/turn.");
      }
    }

    const instability = item ? calculateInstability(item, actor, data) : 3;
    const dc = calculateInventorDC(actor, data);

    return {
      title: `Activate Modification: ${mod?.name ?? modId} (${item?.name ?? "Equipment"})`,
      warnings,
      async apply(state, receipt) {
        receipt.targetUuid = targetActor?.uuid ?? actor.uuid;
        receipt.targetName = targetActor?.name ?? actor.name;
        receipt.itemUuid = item?.uuid ?? item?.id ?? itemId;
        receipt.itemName = item?.name ?? "Equipment";
        receipt.modificationId = mod?.id ?? modId;
        receipt.modificationName = mod?.name ?? modId;
        receipt.instability = instability;
        receipt.dc = dc;
        receipt.isDangerous = Boolean(mod?.isDangerous);

        // Interactive card roll button for Instability Breakdown (never auto-rolled)
        receipt.formula = `${instability}d6`;
        receipt.rollLabel = `Instability Breakdown Roll (${mod?.name ?? modId})`;
        receipt.breakdownPossible = true;
        receipt.breakdownDamageFormula = "1d6";

        let brokeEquipment = false;
        if (data.breakdown && mod?.isDangerous) {
          brokeEquipment = true;
          receipt.brokeEquipment = true;
          if (item) {
            if (typeof item.update === "function") {
              await item.update({ "flags.ak5e.isBroken": true, "flags.ak5e.inventor.isBroken": true });
            } else if (item.flags) {
              ((item.flags.ak5e ??= {}).inventor ??= {}).isBroken = true;
              item.flags.ak5e.isBroken = true;
            }
          }
        }

        const priorActive = actor.flags?.ak5e?.inventor?.activatedModsThisTurn ?? [];
        const newActive = [
          ...priorActive,
          {
            modId: mod?.id ?? modId,
            itemUuid: receipt.itemUuid,
            timestamp: Date.now()
          }
        ];

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.inventor.activatedModsThisTurn",
          before: structuredClone(priorActive),
          after: structuredClone(newActive),
          beforePresent: actor.flags?.ak5e?.inventor?.activatedModsThisTurn !== undefined
        });

        const updates = {
          "flags.ak5e.inventor.activatedModsThisTurn": newActive
        };

        const dangerNote = mod?.isDangerous ? " [DANGEROUS: matching duplicate dice disable equipment until repaired]" : "";
        receipt.summary = `${actor.name} activates ${mod?.name ?? modId} on ${item?.name ?? "Equipment"}: Instability ${instability} (interactive roll: ${instability}d6).${dangerNote}${brokeEquipment ? " Breakdown occurred: equipment is BROKEN." : ""}`;
        receipt.result = {
          itemUuid: receipt.itemUuid,
          modificationId: receipt.modificationId,
          instability,
          dc,
          formula: `${instability}d6`,
          status: "awaitingRoll",
          brokeEquipment
        };

        return updates;
      }
    };
  },

  mobileModding(actor, state, data) {
    need(specialistEnabled(actor), "Mobile Modding requires the Specialist class.");
    need(isInventor(actor), "Mobile Modding is an Inventor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Mobile Modding");

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    const targetUuid = data.targetUuid ?? actor.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : actor;
    const targetName = data.targetName ?? targetActor?.name ?? "Target";

    if (data.distance !== undefined && Number(data.distance) > 5) {
      warn(warnings, "range", "Target creature must be within 5 feet for Mobile Modding.");
    }
    if (data.willing === false) {
      warn(warnings, "willing", "Target creature must be willing for Mobile Modding.");
    }

    const itemId = data.itemId ?? data.itemUuid;
    const item = (itemId && targetActor?.items) ?
                 (targetActor.items.get?.(itemId) ?? listItems(targetActor.items).find(i => i.id === itemId || i.uuid === itemId)) :
                 (itemId && globalThis.fromUuidSync?.(itemId));

    if (!item) {
      warn(warnings, "item", "Choose a weapon or piece of armor to modify.");
    }

    const modId = data.modificationId ?? data.modId;
    const mod = modId ? getModification(modId) : null;
    if (!mod) {
      warn(warnings, "modification", "Choose a valid modification to apply.");
    }

    return {
      title: `Mobile Modding: ${mod?.name ?? modId} -> ${targetName}'s ${item?.name ?? "Equipment"}`,
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });

        const priorMods = item ? structuredClone(getItemModifications(item)) : [];
        receipt.priorModifications = priorMods;
        receipt.targetUuid = targetUuid;
        receipt.targetName = targetName;
        receipt.itemUuid = item?.uuid ?? item?.id ?? itemId;
        receipt.itemName = item?.name ?? "Equipment";
        receipt.modificationId = mod?.id ?? modId;
        receipt.modificationName = mod?.name ?? modId;
        receipt.isMobileModding = true;
        receipt.temporary = true;
        receipt.duration = "1min";

        if (item && mod) {
          await applyEquipmentModification(item, mod.id, {
            ...data,
            actor,
            inventorActor: actor,
            isMobileModding: true,
            temporary: true,
            duration: "1min",
            force: true
          });
        }

        const instability = item ? calculateInstability(item, actor, data) : 3;
        receipt.instability = instability;

        receipt.summary = `${actor.name} expended 1 Prowess for Mobile Modding: applied ${mod?.name ?? modId} to ${targetName}'s ${item?.name ?? "Equipment"} for 1 minute (0 Inventions cost, Instability ${instability}).`;
        receipt.result = {
          targetUuid,
          itemUuid: receipt.itemUuid,
          modificationId: receipt.modificationId,
          instability,
          prowessSpent: 1,
          costInventions: 0,
          duration: "1min"
        };

        return spendUpdate;
      }
    };
  },

  strangeContraption(actor, state, data) {
    need(specialistEnabled(actor), "Strange Contraption requires the Specialist class.");
    need(isInventor(actor), "Strange Contraption is an Inventor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 5, "Strange Contraption");

    const cid = data.contraptionId ?? data.id;
    const contraption = cid ? getContraption(cid) : null;
    if (!contraption) {
      warn(warnings, "contraption", "Choose a valid Strange Contraption to deploy.");
    }

    if (data.distance !== undefined && Number(data.distance) > 30) {
      warn(warnings, "range", `Target location (${data.distance} ft) exceeds 30 ft throw range.`);
    }

    const used = actor.flags?.ak5e?.inventor?.usedContraptions ?? [];
    if (cid && used.includes(cid)) {
      warn(warnings, "alreadyUsed", `Strange Contraption "${contraption?.name ?? cid}" has already been used since the last Long Rest.`);
    }

    const dc = calculateInventorDC(actor, data);

    return {
      title: `Strange Contraption: ${contraption?.name ?? cid ?? "Contraption"} (30 ft throw)`,
      warnings,
      apply(state, receipt) {
        const contraptionId = contraption?.id ?? cid;
        receipt.contraptionId = contraptionId;
        receipt.contraptionName = contraption?.name ?? cid;
        receipt.dc = dc;
        receipt.throwRange = 30;
        receipt.saveAbility = contraption?.saveAbility ?? "dex";

        if (contraption?.damageFormula) {
          receipt.formula = contraption.damageFormula;
          receipt.rollLabel = `${contraption.name} Damage`;
        }

        const priorUsed = structuredClone(used);
        const newUsed = [...priorUsed, contraptionId];

        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.inventor.usedContraptions",
          before: priorUsed,
          after: newUsed,
          beforePresent: actor.flags?.ak5e?.inventor?.usedContraptions !== undefined
        });

        const updates = {
          "flags.ak5e.inventor.usedContraptions": newUsed
        };

        const targetName = data.targetName ?? "target area";
        receipt.summary = `${actor.name} deployed Strange Contraption [${contraption?.name ?? cid}] at ${targetName} (Action, 30 ft throw, 1/Long Rest, DC ${dc}).`;
        receipt.result = {
          contraptionId,
          contraptionName: contraption?.name ?? cid,
          dc,
          saveDc: dc,
          formula: receipt.formula,
          status: receipt.formula ? "awaitingRoll" : "complete",
          throwRange: 30
        };

        return updates;
      }
    };
  },

  theBigOne(actor, state, data) {
    need(specialistEnabled(actor), "The Big One requires the Specialist class.");
    need(isInventor(actor), "The Big One is an Inventor feature.");
    const warnings = [];

    levelWarning(warnings, actor, 20, "The Big One");

    const pool = getPool(actor, "theBigOne");
    const used = pool ? pool.value < 1 : Boolean(actor.flags?.ak5e?.inventor?.theBigOneUsed);
    if (used) {
      warn(warnings, "alreadyUsed", "The Big One has already been used since the last Long Rest.");
    }

    const mode = String(data.mode ?? "FLASH").toUpperCase();
    if (!["FLASH", "SHARD", "QUASAR"].includes(mode)) {
      warn(warnings, "mode", `Invalid mode "${mode}" for The Big One. Choose FLASH, SHARD, or QUASAR.`);
    }

    const dc = calculateInventorDC(actor, data);

    return {
      title: `The Big One: [${mode}] (1/LR, DC ${dc})`,
      warnings,
      apply(state, receipt) {
        let spendUpdate = {};
        if (pool && pool.value > 0) {
          spendUpdate = spendResource(actor, receipt, { pool: "theBigOne", amount: 1, label: "The Big One" });
        }

        const priorUsed = Boolean(actor.flags?.ak5e?.inventor?.theBigOneUsed);
        (receipt.flagChanges ??= []).push({
          path: "flags.ak5e.inventor.theBigOneUsed",
          before: priorUsed,
          after: true,
          beforePresent: actor.flags?.ak5e?.inventor?.theBigOneUsed !== undefined
        });

        let formula = "8d6";
        let damageType = "thunder";
        let condition = "burning";
        let ignoresCover = false;
        let areaDesc = "Up to 4 locations within 100 ft, 10 ft radius";

        if (mode === "SHARD") {
          formula = "10d6";
          damageType = "slashing";
          condition = "bleeding";
          ignoresCover = true;
          areaDesc = "50 ft cone";
        } else if (mode === "QUASAR") {
          formula = "14d6";
          damageType = "radiant";
          condition = null;
          ignoresCover = false;
          areaDesc = "100x10 ft line";
        }

        receipt.mode = mode;
        receipt.formula = formula;
        receipt.damageType = damageType;
        receipt.condition = condition;
        receipt.ignoresCover = ignoresCover;
        receipt.dc = dc;
        receipt.saveAbility = "dex";
        receipt.areaDesc = areaDesc;
        receipt.rollLabel = `The Big One [${mode}] Damage (${formula} ${damageType})`;

        const updates = {
          ...spendUpdate,
          "flags.ak5e.inventor.theBigOneUsed": true
        };

        receipt.summary = `${actor.name} activates The Big One [${mode}] (Action, 1/Long Rest): Area: ${areaDesc}. Interactive ${formula} ${damageType} damage, DEX Save vs DC ${dc} for half damage.${condition ? ` Failed save inflicts ${condition.toUpperCase()}.` : ""}${ignoresCover ? " Ignores Cover." : ""}`;
        receipt.result = {
          mode,
          formula,
          damageType,
          condition,
          ignoresCover,
          dc
        };

        return updates;
      }
    };
  }
};

INVENTOR_PLANS.applyModification.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INVENTOR_PLANS.removeModification.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INVENTOR_PLANS.activateModification.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INVENTOR_PLANS.mobileModding.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INVENTOR_PLANS.strangeContraption.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
INVENTOR_PLANS.theBigOne.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;

export function inventorCleanup(state, receipt, actor) {
  if (receipt.command === "applyModification") {
    const itemUuid = receipt.itemUuid ?? receipt.data?.itemId ?? receipt.data?.itemUuid;
    const target = (receipt.targetUuid && globalThis.fromUuidSync?.(receipt.targetUuid)) ?? actor;
    const item = (itemUuid && globalThis.fromUuidSync?.(itemUuid)) ??
                 target?.items?.get?.(itemUuid) ??
                 listItems(target?.items ?? []).find(i => i.id === itemUuid || i.uuid === itemUuid);
    const modId = receipt.modificationId ?? receipt.data?.modificationId ?? receipt.data?.modId;
    if (item && modId) {
      const currentMods = getItemModifications(item);
      const filtered = currentMods.filter(m => m.id !== modId);
      if (item.flags?.ak5e) {
        if (item.flags.ak5e.inventor) item.flags.ak5e.inventor.modifications = filtered;
        if (item.flags.ak5e["inventor.modifications"]) item.flags.ak5e["inventor.modifications"] = filtered;
      }
      if (typeof item.update === "function") {
        item.update({ "flags.ak5e.inventor.modifications": filtered });
      } else if (item.flags) {
        ((item.flags.ak5e ??= {}).inventor ??= {}).modifications = filtered;
      }
    }
  } else if (receipt.command === "removeModification") {
    const itemUuid = receipt.itemUuid ?? receipt.data?.itemId ?? receipt.data?.itemUuid;
    const target = (receipt.targetUuid && globalThis.fromUuidSync?.(receipt.targetUuid)) ?? actor;
    const item = (itemUuid && globalThis.fromUuidSync?.(itemUuid)) ??
                 target?.items?.get?.(itemUuid) ??
                 listItems(target?.items ?? []).find(i => i.id === itemUuid || i.uuid === itemUuid);
    if (item && receipt.priorModifications) {
      if (item.flags?.ak5e) {
        if (item.flags.ak5e.inventor) item.flags.ak5e.inventor.modifications = receipt.priorModifications;
        if (item.flags.ak5e["inventor.modifications"]) item.flags.ak5e["inventor.modifications"] = receipt.priorModifications;
      }
      if (typeof item.update === "function") {
        item.update({ "flags.ak5e.inventor.modifications": receipt.priorModifications });
      } else if (item.flags) {
        ((item.flags.ak5e ??= {}).inventor ??= {}).modifications = receipt.priorModifications;
      }
    }
  } else if (receipt.command === "activateModification") {
    if (receipt.brokeEquipment) {
      const itemUuid = receipt.itemUuid ?? receipt.data?.itemId ?? receipt.data?.itemUuid;
      const target = (receipt.targetUuid && globalThis.fromUuidSync?.(receipt.targetUuid)) ?? actor;
      const item = (itemUuid && globalThis.fromUuidSync?.(itemUuid)) ??
                   target?.items?.get?.(itemUuid) ??
                   listItems(target?.items ?? []).find(i => i.id === itemUuid || i.uuid === itemUuid);
      if (item) {
        if (typeof item.update === "function") {
          item.update({ "flags.ak5e.isBroken": false, "flags.ak5e.inventor.isBroken": false });
        } else if (item.flags?.ak5e) {
          item.flags.ak5e.isBroken = false;
          if (item.flags.ak5e.inventor) item.flags.ak5e.inventor.isBroken = false;
        }
      }
    }
  } else if (receipt.command === "mobileModding") {
    const itemUuid = receipt.itemUuid ?? receipt.data?.itemId ?? receipt.data?.itemUuid;
    const targetUuid = receipt.targetUuid ?? receipt.data?.targetUuid;
    const target = (targetUuid && globalThis.fromUuidSync?.(targetUuid)) ?? actor;
    const item = (itemUuid && globalThis.fromUuidSync?.(itemUuid)) ??
                 target?.items?.get?.(itemUuid) ??
                 listItems(target?.items ?? []).find(i => i.id === itemUuid || i.uuid === itemUuid);
    const modId = receipt.modificationId ?? receipt.data?.modificationId ?? receipt.data?.modId;
    if (item && modId) {
      const currentMods = getItemModifications(item);
      const filtered = currentMods.filter(m => m.id !== modId && !m.isMobileModding);
      if (typeof item.update === "function") {
        item.update({ "flags.ak5e.inventor.modifications": filtered });
      } else if (item.flags) {
        ((item.flags.ak5e ??= {}).inventor ??= {}).modifications = filtered;
      }
    }
  } else if (receipt.command === "strangeContraption") {
    const cid = receipt.contraptionId ?? receipt.data?.contraptionId;
    if (cid && actor.flags?.ak5e?.inventor?.usedContraptions) {
      const updated = actor.flags.ak5e.inventor.usedContraptions.filter(id => id !== cid);
      if (typeof actor.update === "function") {
        actor.update({ "flags.ak5e.inventor.usedContraptions": updated });
      } else {
        actor.flags.ak5e.inventor.usedContraptions = updated;
      }
    }
  } else if (receipt.command === "theBigOne") {
    if (typeof actor.update === "function") {
      actor.update({ "flags.ak5e.inventor.theBigOneUsed": false });
    } else if (actor.flags?.ak5e?.inventor) {
      actor.flags.ak5e.inventor.theBigOneUsed = false;
    }
  }
}

export const SKYRANGER_PLANS = {
  takeOff(actor, state, data) {
    need(specialistEnabled(actor), "Take Off requires the Specialist class.");
    need(isSkyranger(actor), "Take Off is a Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 1, "Take Off");

    if (!isWearingFlightSuit(actor)) {
      warn(warnings, "flightSuit", "Take Off requires wearing a Flight Suit.");
    }

    const freeFuel = isSkyscreamerActive(actor);
    const fuelPool = getPool(actor, "fuel");
    if (!freeFuel && fuelPool.value < 1) {
      warn(warnings, "shortfall", "Fuel pool is empty (0 remaining).");
    }

    return {
      title: "Take Off (1 Fuel)",
      warnings,
      async apply(state, receipt) {
        let spendUpdate = {};
        if (!freeFuel) {
          spendUpdate = spendResource(actor, receipt, { pool: "fuel", amount: 1, label: "Fuel" });
        }
        receipt.cost = freeFuel ? 0 : 1;
        receipt.isFlying = true;
        receipt.durationSeconds = 60;
        receipt.priorFlying = Boolean(actor.flags?.ak5e?.skyranger?.isFlying);

        if (typeof actor.setFlag === "function") {
          await actor.setFlag("ak5e", "skyranger.isFlying", true);
        } else {
          actor.flags ??= {};
          actor.flags.ak5e ??= {};
          actor.flags.ak5e.skyranger ??= {};
          actor.flags.ak5e.skyranger.isFlying = true;
        }

        receipt.summary = `${actor.name} activated Take Off, gaining Flying Speed equal to Walking Speed for 1 minute${freeFuel ? " (free Fuel via Skyscreamer)" : ""}.`;
        receipt.result = { isFlying: true, freeFuel };
        return spendUpdate;
      }
    };
  },

  selectDoctrine(actor, state, data) {
    need(specialistEnabled(actor), "Select Doctrine requires the Specialist class.");
    need(isSkyranger(actor), "Air Doctrine is a Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Air Doctrine");

    const doctrine = data.doctrine ?? data.choice ?? AIR_DOCTRINES.AIR_SUPERIORITY;
    const doctrineName = AIR_DOCTRINE_NAMES[doctrine] ?? doctrine;

    return {
      title: `Select Air Doctrine: ${doctrineName}`,
      warnings,
      async apply(state, receipt) {
        const prior = actor.flags?.ak5e?.skyranger?.doctrine ?? null;
        receipt.priorDoctrine = prior;
        receipt.doctrine = doctrine;

        if (typeof actor.setFlag === "function") {
          await actor.setFlag("ak5e", "skyranger.doctrine", doctrine);
        } else {
          actor.flags ??= {};
          actor.flags.ak5e ??= {};
          actor.flags.ak5e.skyranger ??= {};
          actor.flags.ak5e.skyranger.doctrine = doctrine;
        }

        receipt.summary = `${actor.name} selected Air Doctrine: ${doctrineName}.`;
        receipt.result = { doctrine, priorDoctrine: prior };
        return {};
      }
    };
  },

  aaMissile(actor, state, data) {
    need(specialistEnabled(actor), "AA Missile requires the Specialist class.");
    need(isSkyranger(actor), "AA Missile is an Air Superiority Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "AA Missile");

    if (!hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY)) {
      warn(warnings, "doctrine", "AA Missile requires the Air Superiority Doctrine.");
    }

    const freeFuel = isSkyscreamerActive(actor);
    const fuelPool = getPool(actor, "fuel");
    if (!freeFuel && fuelPool.value < 1) {
      warn(warnings, "shortfall", "Fuel pool is empty (0 remaining).");
    }

    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : (data.target ?? null);
    if (!targetActor) {
      warn(warnings, "target", "Target creature within 100 ft is required.");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const diceCount = getStrafeDamageDiceCount(lvl);
    const isAerial = targetActor ? isTargetAerial(targetActor) : false;
    const formula = isAerial ? `${diceCount * 8}` : getStrafeDamageFormula(lvl);
    const dc = martialDC(actor);

    return {
      title: "AA Missile (100 ft, DEX Save)",
      warnings,
      async apply(state, receipt) {
        let spendUpdate = {};
        if (!freeFuel) {
          spendUpdate = spendResource(actor, receipt, { pool: "fuel", amount: 1, label: "Fuel" });
        }
        receipt.targetUuid = targetActor?.uuid ?? targetUuid;
        receipt.targetName = targetActor?.name ?? "Target";
        receipt.dc = dc;
        receipt.saveAbility = "dex";
        receipt.formula = formula;
        receipt.damageType = "thunder";
        receipt.isAerial = isAerial;

        receipt.summary = `${actor.name} launched an AA Missile at ${receipt.targetName} (DC ${dc} DEX save vs ${formula} Thunder damage${isAerial ? ", maximized vs aerial target" : ""}).`;
        receipt.result = { targetUuid: receipt.targetUuid, formula, dc, isAerial };
        return spendUpdate;
      }
    };
  },

  bombingRun(actor, state, data) {
    need(specialistEnabled(actor), "Bombing Run requires the Specialist class.");
    need(isSkyranger(actor), "Bombing Run is a Bombardment Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Bombing Run");

    if (!hasAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT)) {
      warn(warnings, "doctrine", "Bombing Run requires the Bombardment Doctrine.");
    }

    const freeFuel = isSkyscreamerActive(actor);
    const fuelPool = getPool(actor, "fuel");
    if (!freeFuel && fuelPool.value < 1) {
      warn(warnings, "shortfall", "Fuel pool is empty (0 remaining).");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const mode = data.mode ?? "standard";
    let diceCount = getStrafeDamageDiceCount(lvl);
    let damageType = "thunder";
    if (lvl >= 11 && (mode === "firebomb" || mode === "gasStrike")) {
      diceCount = Math.max(1, diceCount - 3);
      damageType = mode === "firebomb" ? "fire" : "poison";
    }
    const formula = `${diceCount}d8`;
    const dc = martialDC(actor);

    return {
      title: `Bombing Run (${damageType.toUpperCase()} AoE, DEX Save)`,
      warnings,
      async apply(state, receipt) {
        let spendUpdate = {};
        if (!freeFuel) {
          spendUpdate = spendResource(actor, receipt, { pool: "fuel", amount: 1, label: "Fuel" });
        }
        receipt.dc = dc;
        receipt.saveAbility = "dex";
        receipt.formula = formula;
        receipt.damageType = damageType;
        receipt.mode = mode;

        receipt.summary = `${actor.name} executed a Bombing Run in a 15-ft radius sphere (DC ${dc} DEX save vs ${formula} ${damageType} damage${mode !== "standard" ? ` [${mode}]` : ""}).`;
        receipt.result = { formula, dc, damageType, mode };
        return spendUpdate;
      }
    };
  },

  swoopingDive(actor, state, data) {
    need(specialistEnabled(actor), "Swooping Dive requires the Specialist class.");
    need(isSkyranger(actor), "Swooping Dive is a Close Air Support Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Swooping Dive");

    if (!hasAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT)) {
      warn(warnings, "doctrine", "Swooping Dive requires Close Air Support Doctrine.");
    }

    const freeFuel = isSkyscreamerActive(actor);
    const fuelPool = getPool(actor, "fuel");
    if (!freeFuel && fuelPool.value < 1) {
      warn(warnings, "shortfall", "Fuel pool is empty (0 remaining).");
    }

    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : (data.target ?? null);

    const lvl = specialistLevel(actor) ?? 1;
    const formula = getStrafeDamageFormula(lvl);
    const dc = martialDC(actor);

    return {
      title: "Swooping Dive (Advantage & +Strafe Damage)",
      warnings,
      async apply(state, receipt) {
        let spendUpdate = {};
        if (!freeFuel) {
          spendUpdate = spendResource(actor, receipt, { pool: "fuel", amount: 1, label: "Fuel" });
        }
        receipt.targetUuid = targetActor?.uuid ?? targetUuid;
        receipt.targetName = targetActor?.name ?? "Target";
        receipt.formula = formula;
        receipt.damageType = "thunder";
        receipt.dc = dc;
        receipt.saveAbility = "wis";

        receipt.summary = `${actor.name} executed Swooping Dive against ${receipt.targetName} (Advantage within 10 ft, +${formula} Thunder damage; at Lv 11 DC ${dc} WIS save vs Frightened).`;
        receipt.result = { targetUuid: receipt.targetUuid, formula, dc };
        return spendUpdate;
      }
    };
  },

  evasiveManoeuvres(actor, state, data) {
    need(specialistEnabled(actor), "Evasive Manoeuvres requires the Specialist class.");
    need(isSkyranger(actor), "Evasive Manoeuvres is a Skyranger Jink feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Jink (Evasive Manoeuvres)");

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const pb = pbForLevel(lvl);

    return {
      title: `Evasive Manoeuvres (+${pb} AC, Reaction)`,
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.acBonus = pb;
        receipt.halveDamageIfHit = true;

        if (typeof actor.setFlag === "function") {
          await actor.setFlag("ak5e", "skyranger.evasiveManoeuvres", true);
        } else {
          actor.flags ??= {};
          actor.flags.ak5e ??= {};
          actor.flags.ak5e.skyranger ??= {};
          actor.flags.ak5e.skyranger.evasiveManoeuvres = true;
        }

        receipt.summary = `${actor.name} expended 1 Prowess on Evasive Manoeuvres (+${pb} AC until start of next turn; if the attack still hits, damage is halved${lvl >= 15 ? "; Afterburners: move up to Speed" : ""}).`;
        receipt.result = { acBonus: pb, halveDamageIfHit: true };
        return spendUpdate;
      }
    };
  },

  afterburnersAura(actor, state, data) {
    need(specialistEnabled(actor), "Afterburners requires the Specialist class.");
    need(isSkyranger(actor), "Afterburners is a Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 15, "Afterburners");

    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : (data.target ?? null);

    const lvl = specialistLevel(actor) ?? 1;
    const formula = getStrafeDamageFormula(lvl);
    const dc = martialDC(actor);

    return {
      title: `Afterburners Fire Aura (DC ${dc} DEX Save)`,
      warnings,
      async apply(state, receipt) {
        receipt.targetUuid = targetActor?.uuid ?? targetUuid;
        receipt.targetName = targetActor?.name ?? "Target";
        receipt.dc = dc;
        receipt.saveAbility = "dex";
        receipt.formula = formula;
        receipt.damageType = "fire";

        receipt.summary = `${actor.name} moved within 10 ft with Afterburners, forcing ${receipt.targetName} to make a DC ${dc} DEX save vs ${formula} Fire damage.`;
        receipt.result = { targetUuid: receipt.targetUuid, formula, dc };
        return {};
      }
    };
  },

  activateSkyscreamer(actor, state, data) {
    need(specialistEnabled(actor), "Skyscreamer requires the Specialist class.");
    need(isSkyranger(actor), "Skyscreamer is a 20th-level Skyranger feature.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "Skyscreamer");

    if (!isWearingFlightSuit(actor)) {
      warn(warnings, "flightSuit", "Skyscreamer requires wearing a Flight Suit.");
    }

    const pool = getPool(actor, "skyscreamer");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Skyscreamer has already been used since last Long Rest.");
    }

    return {
      title: "Activate Skyscreamer Combat Mode (1/LR)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "skyscreamer", amount: 1, label: "Skyscreamer" });
        await activateSkyscreamer(actor, { override: true, skipPoolSpend: true });
        receipt.summary = `${actor.name} entered Skyscreamer Combat Mode for 1 minute: multirole doctrines active, free Fuel for Air Doctrine features, and Core Cannon & Core Saber armed!`;
        receipt.result = { combatMode: true };
        return spendUpdate;
      }
    };
  }
};

export const DOLLKEEPER_PLANS = {
  commandDoll(actor, state, data) {
    need(specialistEnabled(actor), "Command Doll requires the Specialist class.");
    need(isDollkeeper(actor), "Command Doll is a Dollkeeper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 1, "Living Doll");

    const command = data.command ?? "strike";
    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : (data.target ?? null);

    const lvl = getDollkeeperLevel(actor);
    const numAttacks = lvl >= 20 ? 3 : (lvl >= 11 ? 2 : 1);
    const formula = "1d8 + 3";

    return {
      title: `Command Doll: ${command.toUpperCase()}${command === "strike" ? ` (${numAttacks}x ${formula})` : ""}`,
      warnings,
      async apply(state, receipt) {
        receipt.command = command;
        receipt.targetUuid = targetActor?.uuid ?? targetUuid;
        receipt.targetName = targetActor?.name ?? "Target";
        receipt.numAttacks = numAttacks;
        if (command === "strike") {
          receipt.formula = formula;
          receipt.bonus = 3 + pbForLevel(lvl);
        }

        receipt.summary = `${actor.name} commanded their Living Doll to ${command.toUpperCase()}${command === "strike" ? ` against ${receipt.targetName} (${numAttacks} Strike attack(s) at +${receipt.bonus}, ${formula} damage each)` : ""}.`;
        receipt.result = { command, numAttacks, formula };
        return {};
      }
    };
  },

  musicalChairs(actor, state, data) {
    need(specialistEnabled(actor), "Musical Chairs requires the Specialist class.");
    need(isDollkeeper(actor), "Musical Chairs is a Dollkeeper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Musical Chairs");

    const pool = getPool(actor, "prowess");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    return {
      title: "Musical Chairs (1 Prowess Position Swap)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        receipt.summary = `${actor.name} expended 1 Prowess on Musical Chairs, instantly swapping positions with their Living Doll up to 60 ft away without provoking Opportunity Attacks.`;
        receipt.result = { swapped: true };
        return spendUpdate;
      }
    };
  },

  marionette(actor, state, data) {
    need(specialistEnabled(actor), "Marionette requires the Specialist class.");
    need(isDollkeeper(actor), "Marionette is a Dollkeeper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Pull the Strings (Marionette)");

    const pool = getPool(actor, "marionette");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Marionette has already been used since last Long Rest.");
    }

    const damage = Number(data.damage ?? 0);

    return {
      title: "Marionette (0 HP Lethal Substitution)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "marionette", amount: 1, label: "Marionette" });
        receipt.priorHP = actor.system?.attributes?.hp?.value ?? 0;
        receipt.damage = damage;

        receipt.summary = `${actor.name} triggered Marionette: dropped to 1 HP instead of 0, swapped places with Living Doll, and the Doll suffered the incoming damage!`;
        receipt.result = { substituted: true, priorHP: receipt.priorHP };
        return spendUpdate;
      }
    };
  },

  mistakenIdentity(actor, state, data) {
    need(specialistEnabled(actor), "Mistaken Identity requires the Specialist class.");
    need(isDollkeeper(actor), "Mistaken Identity is a Dollkeeper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 11, "Masquerade (Mistaken Identity)");

    const pool = getPool(actor, "mistakenIdentity");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Mistaken Identity uses pool is empty (0 remaining).");
    }

    const attackerUuid = data.attackerUuid ?? data.targetUuid;
    const attackerActor = attackerUuid ? (globalThis.fromUuidSync?.(attackerUuid)?.actor ?? globalThis.fromUuidSync?.(attackerUuid)) : null;

    return {
      title: "Mistaken Identity (Reaction Attack Redirection)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "mistakenIdentity", amount: 1, label: "Mistaken Identity" });
        receipt.attackerUuid = attackerActor?.uuid ?? attackerUuid;
        receipt.attackerName = attackerActor?.name ?? "Attacker";
        receipt.dc = 18;
        receipt.checkType = "prc";

        receipt.summary = `${actor.name} used Mistaken Identity against ${receipt.attackerName}'s attack (DC 18 Perception check: on fail, attack redirected to Living Doll; on pass, attacker gains 1-hour immunity).`;
        receipt.result = { attackerUuid: receipt.attackerUuid, dc: 18 };
        return spendUpdate;
      }
    };
  },

  dollRaid(actor, state, data) {
    need(specialistEnabled(actor), "Doll Raid requires the Specialist class.");
    need(isDollkeeper(actor), "Doll Raid is a Dollkeeper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "Artistry is Violence (Doll Raid)");

    const pool = getPool(actor, "dollRaid");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Doll Raid has already been used since last Long Rest.");
    }

    return {
      title: "Doll Raid (1/LR Simultaneous Full Turn)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "dollRaid", amount: 1, label: "Doll Raid" });
        receipt.attacks = 3;
        receipt.formula = "1d8 + 3";

        receipt.summary = `${actor.name} triggered Doll Raid (1/LR): Living Doll immediately takes a full turn, executing 3 Strike attacks!`;
        receipt.result = { raid: true, attacks: 3 };
        return spendUpdate;
      }
    };
  }
};

export const TRAPMASTER_PLANS = {
  placeTrap(actor, state, data) {
    need(specialistEnabled(actor), "Place Trap requires the Specialist class.");
    need(isTrapmaster(actor), "Environmental Warfare is a Trapmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 1, "Environmental Warfare");

    const trapId = data.trapId ?? "explosive";
    const trap = getTrap(trapId);
    if (!trap) {
      warn(warnings, "trap", `Unknown trap ID "${trapId}".`);
    }

    const freeTraps = Boolean(data.freeTrap || data.skipPoolSpend);
    const pool = getPool(actor, "traps");
    if (!freeTraps && pool.value < 1) {
      warn(warnings, "shortfall", "Traps pool is empty (0 remaining).");
    }

    const lvl = specialistLevel(actor) ?? 1;
    const trapDC = calculateTrapDC(actor);
    const formula = getTrapDamageFormula(trapId, lvl);
    const damageType = getTrapDamageType(trapId);
    const saveInfo = getTrapSaveInfo(trapId);

    return {
      title: `Place Trap: ${trap?.name ?? trapId}`,
      warnings,
      async apply(state, receipt) {
        let spendUpdate = {};
        if (!freeTraps) {
          spendUpdate = spendResource(actor, receipt, { pool: "traps", amount: 1, label: "Traps" });
        }
        receipt.trapId = trapId;
        receipt.trapName = trap?.name ?? trapId;
        receipt.trapDC = trapDC;
        receipt.formula = formula;
        receipt.damageType = damageType;
        receipt.saveAbility = saveInfo?.saveAbility ?? null;

        const plantResult = await plantTrap(actor, {
          trapId,
          level: lvl,
          skipPoolSpend: true,
          ...data
        });
        const trapInstance = plantResult?.trap ?? plantResult;
        receipt.trapInstanceId = trapInstance?.id ?? trapInstance?.trapInstanceId ?? trapInstance?.name;

        receipt.summary = `${actor.name} planted a ${receipt.trapName} (Trap DC ${trapDC}${formula ? `, ${formula} ${damageType ?? ""}` : ""}${saveInfo?.saveAbility ? `, ${saveInfo.saveAbility.toUpperCase()} save` : ""}).`;
        receipt.result = { trapId, trapDC, formula, trapInstanceId: receipt.trapInstanceId };
        return spendUpdate;
      }
    };
  },

  devilsOwnLuck(actor, state, data) {
    need(specialistEnabled(actor), "Devil's Own Luck requires the Specialist class.");
    need(isTrapmaster(actor), "Devil's Own Luck is a Trapmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 1, "Devil's Own Luck");

    const pool = getPool(actor, "devilsOwnLuck");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Devil's Own Luck has already been used since last rest.");
    }

    const trapId = data.trapId ?? "explosive";
    if (trapId === "timedExplosive") {
      warn(warnings, "trap", "Devil's Own Luck cannot be used to place a Timed Explosive per source rules.");
    }

    return {
      title: "Devil's Own Luck (Environmental Trap Suggestion)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "devilsOwnLuck", amount: 1, label: "Devil's Own Luck" });
        await executeDevilsOwnLuck(actor, { trapId, ...data, skipPoolSpend: true });
        receipt.trapId = trapId;
        receipt.summary = `${actor.name} utilized Devil's Own Luck to suggest an environmental ${trapId} trap without expending a trap use.`;
        receipt.result = { trapId, devilsOwnLuck: true };
        return spendUpdate;
      }
    };
  },

  heresOneIMadeEarlier(actor, state, data) {
    need(specialistEnabled(actor), "Here's One I Made Earlier requires the Specialist class.");
    need(isTrapmaster(actor), "Here's One I Made Earlier is a Trapmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Here's One I Made Earlier");

    const prowessPool = getPool(actor, "prowess");
    if (prowessPool.value < 1) {
      warn(warnings, "shortfall", "Prowess pool is empty (0 remaining).");
    }

    const trapsPool = getPool(actor, "traps");
    if (trapsPool.value < 1) {
      warn(warnings, "shortfall", "Traps pool is empty (0 remaining).");
    }

    const trapId = data.trapId ?? "explosive";
    const trap = getTrap(trapId);

    return {
      title: "Here's One I Made Earlier (60 ft Trap Placement)",
      warnings,
      async apply(state, receipt) {
        const prowessSpend = spendResource(actor, receipt, { pool: "prowess", amount: 1, label: "Prowess" });
        const trapsSpend = spendResource(actor, receipt, { pool: "traps", amount: 1, label: "Traps" });
        receipt.trapId = trapId;
        receipt.rangeLimit = 60;

        const plantResult = await plantTrap(actor, {
          trapId,
          rangeLimit: 60,
          prowessCost: 1,
          skipPoolSpend: true,
          ...data
        });
        const trapInstance = plantResult?.trap ?? plantResult;
        receipt.trapInstanceId = trapInstance?.id ?? trapInstance?.trapInstanceId ?? trapInstance?.name;

        receipt.summary = `${actor.name} expended 1 Prowess and 1 Trap use on Here's One I Made Earlier, planting a ${trap?.name ?? trapId} at up to 60 ft range.`;
        receipt.result = { trapId, prowessCost: 1, trapInstanceId: receipt.trapInstanceId };
        return { ...prowessSpend, ...trapsSpend };
      }
    };
  },

  warningPoint(actor, state, data) {
    need(specialistEnabled(actor), "Warning Point requires the Specialist class.");
    need(isTrapmaster(actor), "Warning Point is a Trapmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 5, "Panic Inducer (Warning Point)");

    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : (data.target ?? null);
    if (!targetActor) {
      warn(warnings, "target", "Target moving creature within 60 ft is required.");
    }

    const trapDC = calculateTrapDC(actor);

    return {
      title: `Warning Point (Reaction, INT Save vs DC ${trapDC})`,
      warnings,
      async apply(state, receipt) {
        receipt.targetUuid = targetActor?.uuid ?? targetUuid;
        receipt.targetName = targetActor?.name ?? "Target";
        receipt.dc = trapDC;
        receipt.saveAbility = "int";

        receipt.summary = `${actor.name} used Warning Point on ${receipt.targetName} (DC ${trapDC} INT save: on fail, speed reduced to 0 until end of turn and trap trigger is delayed).`;
        receipt.result = { targetUuid: receipt.targetUuid, dc: trapDC };
        return {};
      }
    };
  },

  comeAndGetMe(actor, state, data) {
    need(specialistEnabled(actor), "Come and Get Me requires the Specialist class.");
    need(isTrapmaster(actor), "Come and Get Me is a Bait the Trap feature.");
    const warnings = [];
    levelWarning(warnings, actor, 11, "Bait the Trap (Come and Get Me)");

    const pool = getPool(actor, "comeAndGetMe");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Come and Get Me uses pool is empty (0 remaining).");
    }

    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const targetActor = targetUuid ? (globalThis.fromUuidSync?.(targetUuid)?.actor ?? globalThis.fromUuidSync?.(targetUuid)) : (data.target ?? null);

    const trapDC = calculateTrapDC(actor);

    return {
      title: `Come and Get Me (DC ${trapDC} WIS Save)`,
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "comeAndGetMe", amount: 1, label: "Come and Get Me" });
        receipt.targetUuid = targetActor?.uuid ?? targetUuid;
        receipt.targetName = targetActor?.name ?? "Target";
        receipt.dc = trapDC;
        receipt.saveAbility = "wis";

        receipt.summary = `${actor.name} taunted ${receipt.targetName} with Come and Get Me (DC ${trapDC} WIS save: on fail, creature must move towards designated position).`;
        receipt.result = { targetUuid: receipt.targetUuid, dc: trapDC };
        return spendUpdate;
      }
    };
  },

  partyFavours(actor, state, data) {
    need(specialistEnabled(actor), "Party Favours requires the Specialist class.");
    need(isTrapmaster(actor), "Party Favours is a House of Horrors feature.");
    const warnings = [];
    levelWarning(warnings, actor, 20, "House of Horrors (Party Favours)");

    const pool = getPool(actor, "partyFavours");
    if (pool.value < 1) {
      warn(warnings, "shortfall", "Party Favours has already been used since last Long Rest.");
    }

    return {
      title: "Party Favours (1/LR, 6 Hidden Traps at 100 ft)",
      warnings,
      async apply(state, receipt) {
        const spendUpdate = spendResource(actor, receipt, { pool: "partyFavours", amount: 1, label: "Party Favours" });
        await executePartyFavours(actor, { skipPoolSpend: true, ...data });
        receipt.trapsPlaced = 6;
        receipt.rangeLimit = 100;

        receipt.summary = `${actor.name} activated Party Favours (1/LR), simultaneously placing 6 hidden traps within 100 ft without expending the Traps pool!`;
        receipt.result = { partyFavours: true, trapsPlaced: 6 };
        return spendUpdate;
      }
    };
  }
};

SKYRANGER_PLANS.takeOff.validateTarget = () => false;
SKYRANGER_PLANS.selectDoctrine.validateTarget = () => false;
SKYRANGER_PLANS.aaMissile.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
SKYRANGER_PLANS.bombingRun.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
SKYRANGER_PLANS.swoopingDive.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
SKYRANGER_PLANS.evasiveManoeuvres.validateTarget = () => false;
SKYRANGER_PLANS.afterburnersAura.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
SKYRANGER_PLANS.activateSkyscreamer.validateTarget = () => false;

DOLLKEEPER_PLANS.commandDoll.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
DOLLKEEPER_PLANS.musicalChairs.validateTarget = () => false;
DOLLKEEPER_PLANS.marionette.validateTarget = () => false;
DOLLKEEPER_PLANS.mistakenIdentity.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
DOLLKEEPER_PLANS.dollRaid.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;

TRAPMASTER_PLANS.placeTrap.validateTarget = () => false;
TRAPMASTER_PLANS.devilsOwnLuck.validateTarget = () => false;
TRAPMASTER_PLANS.heresOneIMadeEarlier.validateTarget = () => false;
TRAPMASTER_PLANS.warningPoint.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
TRAPMASTER_PLANS.comeAndGetMe.validateTarget = (source, receipt, entry, target) => (entry?.uuid ?? receipt?.targetUuid) === target.uuid;
TRAPMASTER_PLANS.partyFavours.validateTarget = () => false;

export function skyrangerCleanup(state, receipt, actor) {
  if (receipt.command === "takeOff") {
    if (typeof actor.setFlag === "function") {
      actor.setFlag("ak5e", "skyranger.isFlying", receipt.priorFlying ?? false);
    } else if (actor.flags?.ak5e?.skyranger) {
      actor.flags.ak5e.skyranger.isFlying = receipt.priorFlying ?? false;
    }
  } else if (receipt.command === "selectDoctrine") {
    if (receipt.priorDoctrine !== undefined) {
      if (typeof actor.setFlag === "function") {
        actor.setFlag("ak5e", "skyranger.doctrine", receipt.priorDoctrine);
      } else if (actor.flags?.ak5e?.skyranger) {
        actor.flags.ak5e.skyranger.doctrine = receipt.priorDoctrine;
      }
    }
  } else if (receipt.command === "evasiveManoeuvres") {
    if (typeof actor.setFlag === "function") {
      actor.setFlag("ak5e", "skyranger.evasiveManoeuvres", false);
    } else if (actor.flags?.ak5e?.skyranger) {
      actor.flags.ak5e.skyranger.evasiveManoeuvres = false;
    }
  } else if (receipt.command === "activateSkyscreamer") {
    deactivateSkyscreamer(actor);
  }
}

export function dollkeeperCleanup(state, receipt, actor) {
  undoDollkeeperAction(actor, receipt);
}

export function trapmasterCleanup(state, receipt, actor) {
  if (receipt?.trapInstanceId && actor?.flags?.ak5e?.trapmaster?.plantedTraps) {
    actor.flags.ak5e.trapmaster.plantedTraps = actor.flags.ak5e.trapmaster.plantedTraps.filter(
      t => (t.id ?? t.trapInstanceId ?? t.name) !== receipt.trapInstanceId
    );
  }
  undoTrapmasterOperation(actor, receipt);
}

export function specialistCleanup(state, receipt, actor) {
  hookmasterCleanup(state, receipt, actor);
  infuserCleanup(state, receipt, actor);
  inventorCleanup(state, receipt, actor);
  skyrangerCleanup(state, receipt, actor);
  dollkeeperCleanup(state, receipt, actor);
  trapmasterCleanup(state, receipt, actor);
}

export const INVENTOR_READINGS = {
  dangerousModInstability: {
    label: "Dangerous Modification Instability Penalty",
    options: [
      { value: "plusOne", label: "+1 Instability per Dangerous Modification (Default)" },
      { value: "plusTwo", label: "+2 Instability per Dangerous Modification" }
    ]
  }
};

export const EXECUTOR_READINGS = {
  deathmarkTransferTiming: {
    label: "Deathmark Transfer Timing",
    options: [
      { value: "onAttackRoll", label: "Transfers immediately when an Attack Roll is made against the target" },
      { value: "onHitOnly", label: "Transfers only when an Attack hits the target" }
    ]
  },
  mortalBlowReading: {
    label: "Mortal Blow HP Loss Application",
    options: [
      { value: "bypassDRResist", label: "Bypasses Damage Reduction and Resistance (standard Hit Point loss)" },
      { value: "bypassAll", label: "Bypasses all damage mitigations and directly subtracts from current Hit Points" }
    ]
  }
};

const ALL_PLANS = {
  ...CORE_PLANS,
  ...EXECUTOR_PLANS,
  ...HOOKMASTER_PLANS,
  ...INFUSER_PLANS,
  ...INVENTOR_PLANS,
  ...SKYRANGER_PLANS,
  ...DOLLKEEPER_PLANS,
  ...TRAPMASTER_PLANS
};
const ALL_READINGS = { ...EXECUTOR_READINGS, ...HOOKMASTER_READINGS, ...INFUSER_READINGS, ...INVENTOR_READINGS };

specialistUses.register({
  plans: ALL_PLANS,
  readings: ALL_READINGS,
  cleanup: specialistCleanup
});


const rawRegister = specialistUses.register.bind(specialistUses);
specialistUses.register = function(options = {}) {
  if (options.plans) {
    Object.assign(ALL_PLANS, options.plans);
  }
  return rawRegister(options);
};

const rawCommand = specialistUses.command.bind(specialistUses);

specialistUses.command = async function(actor, name, data = {}, operationId) {
  return await rawCommand(actor, name, data, operationId);
};

specialistUses.execute = async function(actor, name, data = {}, opId) {
  const res = await specialistUses.command(actor, name, { confirmed: true, ...data }, opId);
  const undoList = actor?.flags?.ak5e?.specialistUses?.undo ?? [];
  const latestReceipt = undoList[undoList.length - 1];
  if (latestReceipt) {
    if (typeof res === "object" && res !== null) {
      return Object.assign(Object.create(latestReceipt), latestReceipt, res);
    }
    return latestReceipt;
  }
  return res;
};

specialistUses.undo = async function(actor, useId) {
  const id = typeof useId === "object" ? useId.useId : useId;
  return await specialistUses.command(actor, "undoUse", { useId: id });
};

specialistUses.plan = function(actor, name, data = {}) {
  const planFn = ALL_PLANS[name];
  need(planFn, `Unknown Specialist plan ${name}.`);
  const state = specialistUses.state(actor);
  const plan = planFn(actor, state, data);
  if (data.checkOnly) return plan;
  if (plan.warnings?.length) {
    requireOverrides(plan.warnings, data.overrides ?? data.overridden);
  }
  return plan;
};

export { CORE_PLANS };

