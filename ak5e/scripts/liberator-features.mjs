/**
 * Liberator subclass features (Ch. 3 L2937–3093):
 * Essence of the Liberator (Liberty pool 0–6, combat inaction generation, Guide the Masses: Advocate, Empower, Uplift),
 * Righteous Outburst (Flash of Anger d6/d10 with kill refund & Caught in the Crossfire 10-ft splash, The Right Moment),
 * Rising Tide (Automatic, Offensive, Defensive charging for skills at 4th level),
 * Praxis (Far Reaching Guidance 40 ft, Improved Liberty d10, Press the Attack: Face Me 2 Aggression at 10th level),
 * Smouldering Anger (Cannot be Denied Force/Arts damage, Caught in the Crossfire splash at 13th level),
 * Révolution (1/LR burst save vs Martial DC for 1d12 Force per Liberty, 10-minute Champion of the Worthy,
 * Shield of Belief, Time to Act at 17th level).
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */

import {
  GUARD_CLASS_ID,
  guardEnabled,
  guardLevel,
  guardBranch,
  martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { defineGuardPools } from "./guard-features.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { need, flag, values } from "./operation-kernel.mjs";

/** Whether the given Actor is an active Guard with the Liberator subclass. */
export const isLiberator = actor => Boolean(guardEnabled(actor) && guardBranch(actor) === "liberator");

/** Defines the Liberty (0-6) and Révolution (1/LR at 17th) resource pools. */
export function defineLiberatorPools() {
  defineGuardPools();
  if (!getPoolDefinition("liberty")) {
    definePool({
      id: "liberty",
      label: "Liberty",
      max: 6,
      min: 0,
      initial: 0,
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isLiberator(actor),
      recovery: []
    });
  }
  if (!getPoolDefinition("revolution")) {
    definePool({
      id: "revolution",
      label: "Révolution",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isLiberator(actor) && (guardLevel(actor) ?? 1) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

/** Gain a resource for a use, recording before/after in receipt.resources so encounter-window undo removes it cleanly. */
export function gainResource(actor, receipt, { pool, path, amount, label, max }) {
  const record = pool && getPoolDefinition(pool) ? getPool(actor, pool) : null;
  const resourcePath = pool ? `flags.ak5e.resourcePools.${pool}.value` : path;
  const poolMax = record?.max ?? max ?? 6;
  const before = record ? record.value : Number(actor?.getFlag?.("ak5e", path) ?? 0);
  const after = Math.min(poolMax, before + amount);
  (receipt.resources ??= []).push({
    pool: pool ?? null,
    path: resourcePath,
    before,
    after,
    max: poolMax,
    label
  });
  return { [resourcePath]: after };
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Liberator level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const aggressionCheck = (warnings, actor, amount) => {
  const available = resourceValue(actor, { pool: "aggression" });
  if (available < amount) {
    warn(warnings, "aggression", `${amount} Aggression needed and ${available} remain; Aggression clamps at 0.`);
  }
};

/** Checks if the 10-minute benefits of Révolution are currently active on the Actor. */
export function isRevolutionActive(actor) {
  return Boolean(
    flag(actor, "guard")?.liberator?.revolution?.active ??
    flag(actor, "liberator")?.revolution?.active
  );
}

/** 17th level Time to Act: whenever gaining or refunded Liberty, gain 1 more. */
export function hasTimeToAct(actor) {
  return (guardLevel(actor) ?? 1) >= 17 && isRevolutionActive(actor);
}

/** 17th level Champion of the Worthy: free Guide the Masses without expending an Action. */
export function hasChampionOfTheWorthy(actor) {
  return (guardLevel(actor) ?? 1) >= 17 && isRevolutionActive(actor);
}

/** 17th level Shield of Belief: Temporary HP equal to Guard level at turn start. */
export function shieldOfBeliefTHP(actor) {
  return isRevolutionActive(actor) ? (guardLevel(actor) ?? 1) : 0;
}

/** 4th level Rising Tide: skills count as Automatic, Offensive, and Defensive charging. */
export function hasRisingTide(actor) {
  return isLiberator(actor) && (guardLevel(actor) ?? 1) >= 4;
}

/** Returns the charging methods enabled by Rising Tide. */
export function risingTideChargingMethods(actor) {
  return hasRisingTide(actor) ? ["automatic", "offensive", "defensive"] : [];
}

/** Calculates the formula for Flash of Anger based on level and Liberty expended. */
export function flashOfAngerFormula(actor, libertyExpended) {
  const dieSize = (guardLevel(actor) ?? 1) >= 10 ? 10 : 6;
  return `${libertyExpended}d${dieSize}`;
}

/** Calculates Guide the Masses bonus value by mode. */
export function guideTheMassesBonus(actor, mode) {
  const pb = Number(actor.system?.attributes?.prof ?? 2);
  const liberty = resourceValue(actor, { pool: "liberty" });
  if (mode === "advocate") {
    return Math.max(2 * pb, 2 * liberty);
  }
  return Math.max(pb, liberty);
}

function findFeatSource(actor) {
  const feat = values(actor?.items).find(i =>
    i.type === "feat" && flag(i, "chapterThreeId")?.startsWith("subclass-feature-guard-liberator")
  ) ?? values(actor?.items).find(i => i.type === "feat");
  return {
    item: feat,
    featureId: flag(feat, "chapterThreeId") ?? "subclass-feature-guard-liberator-1st-level-essence-of-the-liberator-1175",
    ready: Boolean(feat)
  };
}

/* ---------------------------------------------------------------- Liberator Plans */

export const LIBERATOR_PLANS = {
  guideTheMasses(actor, state, data) {
    need(isLiberator(actor), "Guide the Masses is a Liberator feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;

    const mode = String(data.mode ?? data.option ?? "advocate").toLowerCase();
    need(["advocate", "empower", "uplift"].includes(mode), "Choose a valid mode for Guide the Masses: advocate, empower, uplift.");

    const maxRange = level >= 10 ? 40 : 20;
    if (data.distance !== undefined && Number(data.distance) > maxRange) {
      warn(warnings, "range", `Target is out of range (${data.distance} ft; maximum is ${maxRange} ft).`);
    }

    const isBonusAction = Boolean(data.bonusAction || data.actionType === "bonus");
    const isFree = Boolean(data.free || data.actionType === "free");

    if (isBonusAction) {
      levelWarning(warnings, actor, 7, "Bonus Action Guide the Masses");
      const actionUsed = state.data?.guideTheMassesActionTurn;
      const combat = globalThis.game?.combat;
      const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
      if (currentTurnKey && actionUsed !== currentTurnKey && !data.hasActionUsed) {
        warn(warnings, "action", "Bonus Action Guide the Masses requires having used Guide the Masses as an Action this Turn.");
      }
      const priorTargetUuid = state.data?.guideTheMassesActionTarget;
      if (priorTargetUuid && data.targetUuid && priorTargetUuid === data.targetUuid) {
        warn(warnings, "target", "Bonus Action Guide the Masses must choose a different Creature than the Action use.");
      }
    }

    if (isFree) {
      if (!hasChampionOfTheWorthy(actor) && !data.championOverride) {
        warn(warnings, "champion", "Free Guide the Masses requires Champion of the Worthy (Level 17 Révolution).");
      }
      const lastFreeTurn = state.data?.guideTheMassesFreeTurn;
      const combat = globalThis.game?.combat;
      const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
      if (currentTurnKey && lastFreeTurn === currentTurnKey) {
        warn(warnings, "frequency", "Champion of the Worthy free Guide the Masses can only be used once per Turn.");
      }
    }

    const bonusValue = guideTheMassesBonus(actor, mode);
    const modeLabels = {
      advocate: "Advocate (Bonus Healing / THP)",
      empower: "Empower (Damage Reduction)",
      uplift: "Uplift (Bonus Damage)"
    };
    const modeLabel = modeLabels[mode];

    // Liberty generation: gains 1 Liberty as Action (or Champion free action); +1 extra with Time to Act
    const gainsLiberty = !isBonusAction || Boolean(data.grantLiberty);
    const timeToAct = hasTimeToAct(actor) || Boolean(data.timeToAct);
    const libertyGain = gainsLiberty ? (timeToAct ? 2 : 1) : 0;

    const targetUuid = data.targetUuid ?? null;
    const targetDoc = targetUuid ? globalThis.fromUuidSync?.(targetUuid) : null;
    const targetName = targetDoc?.name ?? data.targetName ?? "Ally";

    return {
      warnings,
      title: `Guide the Masses: ${modeLabel}`,
      apply(next, receipt) {
        next.data ??= {};
        const combat = globalThis.game?.combat;
        const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;

        if (!isBonusAction && !isFree && currentTurnKey) {
          next.data.guideTheMassesActionTurn = currentTurnKey;
          next.data.guideTheMassesActionTarget = targetUuid;
        }
        if (isFree && currentTurnKey) {
          next.data.guideTheMassesFreeTurn = currentTurnKey;
        }

        let updates = {};
        if (libertyGain > 0) {
          updates = gainResource(actor, receipt, { pool: "liberty", amount: libertyGain, label: "Liberty" });
        }

        receipt.summary = `${actor.name} guides ${targetName} with ${modeLabel}: +${bonusValue} bonus until the start of ${actor.name}'s next Turn.${libertyGain > 0 ? ` (+${libertyGain} Liberty gained)` : ""}`;
        receipt.result = { mode, bonus: bonusValue, libertyGained: libertyGain, targetUuid, maxRange };

        if (targetUuid) {
          const sourceInfo = findFeatSource(actor);
          receipt.targets.push({
            uuid: targetUuid,
            name: targetName,
            kind: "effect",
            featureId: sourceInfo.featureId,
            tag: {
              label: `Guide the Masses (${mode.charAt(0).toUpperCase() + mode.slice(1)})`,
              trigger: "turnStart",
              expiryActor: "source",
              instructions: `Bonus: +${bonusValue} (${mode}) until the beginning of ${actor.name}'s next Turn.`
            },
            ready: sourceInfo.ready,
            meta: { mode, bonus: bonusValue }
          });
        }

        return updates;
      },
      validateTarget(_source, _receipt, entry, target) {
        return Boolean(target && entry?.kind === "effect");
      }
    };
  },

  flashOfAnger(actor, _state, data) {
    need(isLiberator(actor), "Flash of Anger is a Liberator feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;

    const requested = Number(data.liberty ?? 1);
    need(Number.isInteger(requested) && requested >= 1, "Choose how much Liberty to expend (at least 1).");

    const available = resourceValue(actor, { pool: "liberty" });
    if (available < requested) {
      warn(warnings, "liberty", `${requested} Liberty needed and ${available} remain; Liberty clamps at 0.`);
    }

    if (data.secondaryTargetUuid && level < 13) {
      warn(warnings, "level", "Caught in the Crossfire (10-ft splash to secondary Creature) requires Liberator level 13.");
    }

    if (data.secondaryDistance !== undefined && Number(data.secondaryDistance) > 10) {
      warn(warnings, "secondaryRange", `Caught in the Crossfire secondary Creature must be within 10 ft of target (${data.secondaryDistance} ft given).`);
    }

    const dieSize = level >= 10 ? 10 : 6;
    const formula = `${requested}d${dieSize}`;

    // Level 13+ Cannot be Denied: Force damage or chosen Arts damage type
    const damageType = level >= 13 ? (data.damageType ?? "force") : (data.damageType ?? "untyped");

    const isKill = Boolean(data.kill);
    const timeToAct = hasTimeToAct(actor) || Boolean(data.timeToAct);
    const refundAmount = isKill ? (timeToAct ? 2 : 1) : 0;

    const secondaryTargetUuid = data.secondaryTargetUuid ?? null;

    return {
      warnings,
      title: "Flash of Anger",
      rolls: [
        { id: "flashOfAngerDamage", label: `Flash of Anger (${formula} ${damageType})`, formula }
      ],
      apply(next, receipt) {
        const poolMax = 6;
        const before = available;
        const netSpend = Math.max(0, requested - refundAmount);
        const after = Math.min(poolMax, Math.max(0, before - netSpend));

        (receipt.resources ??= []).push({
          pool: "liberty",
          path: "flags.ak5e.resourcePools.liberty.value",
          before,
          after,
          max: poolMax,
          label: "Liberty"
        });

        if (requested > before) {
          receipt.shortfalls = [...(receipt.shortfalls ?? []), `Liberty short by ${requested - before}`];
        }

        receipt.formula = formula;
        receipt.rollLabel = `Flash of Anger Damage (${formula} ${damageType})`;
        receipt.summary = `${actor.name} expends ${requested} Liberty on Flash of Anger: deals +${formula} ${damageType} Damage (cannot crit).${isKill ? ` Target reduced to 0 HP: refunded ${refundAmount} Liberty.` : ""}${secondaryTargetUuid ? " Caught in the Crossfire: secondary Creature within 10 ft also takes this damage." : ""}`;
        receipt.result = {
          libertySpent: requested,
          libertyRefunded: refundAmount,
          netSpent: netSpend,
          damageFormula: formula,
          damageType,
          dieSize,
          isKill,
          secondaryTargetUuid
        };

        if (secondaryTargetUuid && level >= 13) {
          const secDoc = globalThis.fromUuidSync?.(secondaryTargetUuid);
          const secName = secDoc?.name ?? data.secondaryTargetName ?? "Secondary Target";
          const sourceInfo = findFeatSource(actor);
          receipt.targets.push({
            uuid: secondaryTargetUuid,
            name: secName,
            kind: "effect",
            featureId: sourceInfo.featureId,
            tag: {
              label: "Caught in the Crossfire",
              trigger: "manual",
              instructions: `Takes +${formula} ${damageType} damage from Flash of Anger splash.`
            },
            ready: sourceInfo.ready,
            meta: { formula, damageType }
          });
        }

        return { "flags.ak5e.resourcePools.liberty.value": after };
      },
      validateTarget(_source, _receipt, entry, target) {
        return Boolean(target && entry?.kind === "effect");
      }
    };
  },

  flashOfAngerRefund(actor, _state, data) {
    need(isLiberator(actor), "Flash of Anger Refund is a Liberator feature.");
    const timeToAct = hasTimeToAct(actor) || Boolean(data.timeToAct);
    const refundAmount = timeToAct ? 2 : 1;

    return {
      warnings: [],
      title: "Flash of Anger: Kill Refund",
      apply(next, receipt) {
        const updates = gainResource(actor, receipt, { pool: "liberty", amount: refundAmount, label: "Liberty" });
        receipt.summary = `${actor.name} gains a refund of ${refundAmount} Liberty from reducing a Creature to 0 HP with Flash of Anger.`;
        receipt.result = { refundAmount };
        return updates;
      }
    };
  },

  theRightMoment(actor, _state, data) {
    need(isLiberator(actor), "The Right Moment is a Liberator feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;

    const currentLiberty = resourceValue(actor, { pool: "liberty" });
    const consumed = data.liberty !== undefined ? Number(data.liberty) : currentLiberty;

    if (consumed < 1) {
      warn(warnings, "liberty", "The Right Moment consumes all Liberty, but current Liberty is 0; grants no bonus damage.");
    }

    const dieSize = level >= 10 ? 10 : 6;
    const saveFormula = consumed > 0 ? `${consumed}d${dieSize}` : "0";
    const meleeDice = Math.floor(consumed / 2);
    const meleeFormula = meleeDice > 0 ? `${meleeDice}d${dieSize}` : "0";

    return {
      warnings,
      title: "The Right Moment",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "liberty", amount: consumed, label: "Liberty" });

        const statePayload = {
          active: true,
          consumed,
          dieSize,
          saveFormula,
          meleeFormula,
          opId: receipt.id
        };

        updates["flags.ak5e.guard.liberator.rightMoment"] = statePayload;

        receipt.summary = `${actor.name} activates The Right Moment, consuming all ${consumed} Liberty: saving throw skills deal +${saveFormula} damage, melee weapon attacks deal +${meleeFormula} damage during the active Operator Skill.`;
        receipt.result = { consumed, dieSize, saveFormula, meleeFormula, active: true };

        return updates;
      }
    };
  },

  clearRightMoment(actor, _state, _data) {
    need(isLiberator(actor), "The Right Moment is a Liberator feature.");
    return {
      warnings: [],
      title: "End The Right Moment",
      apply(next, receipt) {
        receipt.summary = `${actor.name}'s The Right Moment active skill bonus has ended.`;
        return {
          "flags.ak5e.guard.liberator.rightMoment": {
            active: false,
            consumed: 0,
            saveFormula: "0",
            meleeFormula: "0"
          }
        };
      }
    };
  },

  faceMe(actor, _state, data) {
    need(isLiberator(actor), "Face Me is a Liberator feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Press the Attack: Face Me");
    aggressionCheck(warnings, actor, 2);

    const mDC = martialDC(actor);
    const targetUuid = data.targetUuid ?? null;

    return {
      warnings,
      title: "Press the Attack: Face Me",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} uses Press the Attack: Face Me (2 Aggression) as a Bonus Action: casts Compelled Duel (ignoring Somatic components) with Martial DC ${mDC}.`;
        receipt.result = { aggressionSpent: 2, martialDC: mDC, targetUuid };

        if (targetUuid) {
          const targetDoc = globalThis.fromUuidSync?.(targetUuid);
          const targetName = targetDoc?.name ?? data.targetName ?? "Target";
          const sourceInfo = findFeatSource(actor);
          receipt.targets.push({
            uuid: targetUuid,
            name: targetName,
            kind: "effect",
            featureId: sourceInfo.featureId,
            tag: {
              label: "Compelled Duel (Face Me)",
              trigger: "manual",
              instructions: `WIS saving throw DC ${mDC} to resist.`
            },
            ready: sourceInfo.ready
          });
        }

        return updates;
      },
      validateTarget(_source, _receipt, entry, target) {
        return Boolean(target && entry?.kind === "effect");
      }
    };
  },

  revolution(actor, _state, data) {
    need(isLiberator(actor), "Révolution is a Liberator feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Révolution");

    const availableRev = resourceValue(actor, { pool: "revolution" });
    if (availableRev < 1) {
      warn(warnings, "revolution", `1 use of Révolution needed and ${availableRev} remain; Révolution recovers on a Long Rest.`);
    }

    const currentLiberty = resourceValue(actor, { pool: "liberty" });
    const libertyExpended = data.liberty !== undefined ? Number(data.liberty) : currentLiberty;
    const formula = `${libertyExpended}d12`;
    const mDC = martialDC(actor);

    return {
      warnings,
      title: "Révolution",
      rolls: [
        { id: "revolutionBurst", label: `Révolution Burst (${formula} Force)`, formula }
      ],
      apply(next, receipt) {
        const revUpdates = spendResource(actor, receipt, { pool: "revolution", amount: 1, label: "Révolution" });
        const libUpdates = spendResource(actor, receipt, { pool: "liberty", amount: libertyExpended, label: "Liberty" });

        const revState = {
          active: true,
          activatedAt: globalThis.game?.time?.worldTime ?? 0,
          libertyExpended,
          opId: receipt.id
        };

        const updates = {
          ...revUpdates,
          ...libUpdates,
          "flags.ak5e.guard.liberator.revolution": revState
        };

        receipt.formula = formula;
        receipt.rollLabel = `Révolution Burst Damage (${formula} Force)`;
        receipt.summary = `${actor.name} unleashes Révolution: all ${libertyExpended} Liberty expended in a 20-ft burst; hostile creatures make a DEX save (DC ${mDC}) or take ${formula} Force damage. Gains Champion of the Worthy, Shield of Belief, and Time to Act for 10 minutes.`;
        receipt.result = {
          libertyExpended,
          martialDC: mDC,
          damageFormula: formula,
          benefits: ["championOfTheWorthy", "shieldOfBelief", "timeToAct"],
          active: true
        };

        return updates;
      }
    };
  },

  endRevolution(actor, _state, _data) {
    need(isLiberator(actor), "Révolution is a Liberator feature.");
    return {
      warnings: [],
      title: "End Révolution Benefits",
      apply(next, receipt) {
        receipt.summary = `${actor.name}'s Révolution 10-minute benefits have ended.`;
        return {
          "flags.ak5e.guard.liberator.revolution": { active: false }
        };
      }
    };
  },

  shieldOfBelief(actor, _state, _data) {
    need(isLiberator(actor), "Shield of Belief is a Liberator feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Shield of Belief");
    if (!isRevolutionActive(actor)) {
      warn(warnings, "revolution", "Shield of Belief is only active during the 10 minutes of Révolution.");
    }

    const thp = shieldOfBeliefTHP(actor);

    return {
      warnings,
      title: "Shield of Belief",
      apply(next, receipt) {
        const currentTHP = Number(actor.system?.attributes?.hp?.temp ?? 0);
        const newTHP = Math.max(currentTHP, thp);
        receipt.summary = `${actor.name} gains ${thp} Temporary Hit Points from Shield of Belief at the start of their Turn (THP: ${currentTHP} → ${newTHP}).`;
        receipt.result = { thpGranted: thp, priorTemp: currentTHP, newTemp: newTHP };
        return { "system.attributes.hp.temp": newTHP };
      }
    };
  },

  libertyInaction(actor, _state, data) {
    need(isLiberator(actor), "Liberty Inaction is a Liberator feature.");
    const warnings = [];

    const inCombat = Boolean(globalThis.game?.combat?.started || data.inCombat);
    if (!inCombat) {
      warn(warnings, "combat", "Liberty can only be generated during Combat.");
    }

    if (data.attacked || data.castArt || data.activeSkill || data.acted) {
      warn(warnings, "inaction", "Cannot gain Liberty if an Attack Roll was made, an Art was cast, or an Operator Skill was activated/active this Turn.");
    }

    const timeToAct = hasTimeToAct(actor) || Boolean(data.timeToAct);
    const amount = timeToAct ? 2 : 1;

    return {
      warnings,
      title: "Liberty: Combat Inaction",
      apply(next, receipt) {
        const updates = gainResource(actor, receipt, { pool: "liberty", amount, label: "Liberty" });
        receipt.summary = `${actor.name} gains ${amount} Liberty from inaction at the end of their Turn in Combat.`;
        receipt.result = { libertyGained: amount, inCombat };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: LIBERATOR_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function liberatorPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject;
  const actor = activity?.actor ?? config?.actor;
  if (!actor || !isLiberator(actor)) return;
  const roll = config?.rolls?.[0];
  if (!roll?.parts) return;

  const rightMoment = flag(actor, "guard")?.liberator?.rightMoment ??
    flag(actor, "liberator")?.rightMoment;
  if (!rightMoment?.active) return;

  const isMeleeWeapon = activity?.actionType === "mwak" ||
    activity?.item?.system?.actionType === "mwak" ||
    config?.attackType === "meleeWeapon" ||
    activity?.attack?.type?.value === "meleeWeapon";

  const isSaveSkill = (activity?.actionType === "save" || activity?.type === "save") &&
    (flag(activity?.item, "operatorSkill") || Boolean(config?.isOperatorSkill));

  if (isMeleeWeapon && rightMoment.meleeFormula && rightMoment.meleeFormula !== "0") {
    roll.parts.push(rightMoment.meleeFormula);
  } else if (isSaveSkill && rightMoment.saveFormula && rightMoment.saveFormula !== "0") {
    roll.parts.push(rightMoment.saveFormula);
  }
}

export function registerLiberatorHooks() {
  defineLiberatorPools();
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollDamageV2", liberatorPreRollDamage);
  }
}

defineLiberatorPools();
