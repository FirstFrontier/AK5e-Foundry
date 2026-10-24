/**
 * Supporter table-play use engine (WORKFLOW.md §3.2, play-uses.mjs).
 * Enforces:
 *  - Confirm before use;
 *  - Non-blocking warnings with "Use anyway" overrides;
 *  - Zero-clamping on resource shortfalls;
 *  - Automatic GM relay for unowned target modifications;
 *  - Interactive roll buttons on chat cards (no auto-rolled dice);
 *  - Encounter-window undo receipts in `flags.ak5e.supporterUses`.
 */
import { createPlayUses, warn, spendResource, resourceValue } from "./play-uses.mjs";
import {
  supporterEnabled, supporterLevel, supporterState, checkLevel,
  aidDieSize, flag, pbForLevel
} from "./supporter-rules.mjs";
import {
  hasProvideAid, hasAdvancedAid, hasLightenTheLoad,
  hasEverReliable, hasSelfSupportive, hasWillIntoBeing,
  willIntoBeingBonus
} from "./supporter-features.mjs";
import { need, opaqueKey, values } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { requireOverrides, isPlayWarnings } from "./play-undo.mjs";
import { getPool } from "./resource-pools.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";

export const supporterUses = createPlayUses({
  ns: "supporterUses",
  label: "Supporter",
  isMember: actor => supporterEnabled(actor),
  ruling: (actor, key) => {
    const record = supporterState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

/** GM-only: record a ruling for an unresolved reading. */
export async function recordSupporterRuling(actor, key, value, source) {
  need(game.user.isGM && actor?.isOwner, "Only the GM may record Supporter rulings.");
  const reading = supporterUses.readings()[key];
  need(reading?.options.some(option => option.value === value), "Choose a supported ruling value.");
  need(typeof source === "string" && source.trim().length >= 10, "Record the source and reason for this ruling (at least 10 characters).");
  await actor.update({ [`flags.ak5e.supporter.rulings.${key}`]: { value, source: source.trim(), approvedBy: game.user.id } });
  return supporterState(actor).rulings[key];
}

const levelWarning = (warnings, actor, requiredLevel, featureName) => {
  const current = supporterLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${featureName} is a Supporter level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const CORE_PLANS = {
  provideAid(actor, state, data) {
    need(supporterEnabled(actor), "Provide Aid requires the Supporter class.");
    const warnings = [];
    const level = supporterLevel(actor) ?? 1;
    const pb = pbForLevel(level);
    const die = aidDieSize(level);

    const targetUuid = data.targetUuid ?? data.target?.uuid ?? null;
    const targetName = data.targetName ?? data.target?.name ?? "target creature";
    const target = data.target ?? (targetUuid ? globalThis.game?.actors?.get?.(targetUuid) : null);

    // Range warning (60 ft)
    const distance = Number(data.distance ?? 0);
    if (distance > 60) {
      warn(warnings, "range", `${targetName} is beyond 60 feet (Provide Aid range).`);
    }

    // Target cannot already have an Aid Die
    const existingDie = target ? flag(target, "aidDie") : null;
    if (existingDie || data.targetHasAidDie) {
      warn(warnings, "targetHasAidDie", `${targetName} already has an Aid Die; a creature can only have one Aid Die at a time.`);
    }

    // Resource check: Aid Die pool
    const pool = getPool(actor, "aidDie");
    if (pool.value < 1) {
      warn(warnings, "shortfall", `Aid Dice pool is empty (0 remaining).`);
    }

    return {
      title: `Provide Aid (${die}) -> ${targetName}`,
      warnings,
      apply(state, receipt) {
        // Spend 1 Aid Die with clamping
        const spendUpdate = spendResource(actor, receipt, { pool: "aidDie", amount: 1, label: "Aid Die" });

        receipt.summary = `${actor.name} granted a ${die} Aid Die to ${targetName} for 10 minutes.`;
        receipt.result = { dieSize: die, targetUuid, targetName, durationSeconds: 600 };

        if (targetUuid) {
          receipt.targets = [{
            uuid: targetUuid,
            name: targetName,
            kind: "effect",
            featureId: "class-feature-supporter-1st-level-provide-aid-2284",
            tag: {
              label: `Aid Die (${die})`,
              trigger: "turnStart",
              expiryActor: "source",
              duration: 600,
              data: {
                supporterUuid: actor.uuid,
                dieSize: die,
                supporterLevel: level,
                supporterPB: pb,
                advancedAid: level >= 5,
                willIntoBeing: level >= 20
              }
            },
            ready: true
          }];
        }

        return spendUpdate;
      }
    };
  },

  useAidDie(actor, state, data) {
    const warnings = [];
    const rollType = String(data.rollType ?? "check").toLowerCase();
    const validRollTypes = ["attack", "skill", "save", "damage", "healing"];
    if (!validRollTypes.includes(rollType)) {
      warn(warnings, "invalidRollType", `Invalid roll type: ${rollType}. Must be one of attack, skill, save, damage, healing.`);
    }
    if (data.isDeathSave) {
      warn(warnings, "deathSave", "Aid Die cannot be used on Death Saving Throws.");
    }

    const dieSize = data.dieSize ?? "d8";
    const lvl = Number(data.supporterLevel ?? supporterLevel(actor) ?? 1);
    const pb = Number(data.supporterPB ?? pbForLevel(lvl));
    const hasAdv = lvl >= 5;
    const hasWill = lvl >= 20;

    return {
      title: `Expend Aid Die (${dieSize}) for ${rollType.toUpperCase()}`,
      warnings,
      apply(next, receipt) {
        receipt.summary = `Expended Aid Die (${dieSize}) on ${rollType}.`;
        receipt.result = {
          dieSize,
          rollType,
          willBonus: hasWill ? pb : 0,
          advancedEffect: hasAdv ? rollType : null
        };
        return {};
      }
    };
  },

  lightenTheLoad(actor, state, data) {
    need(supporterEnabled(actor), "Lighten the Load requires the Supporter class.");
    const warnings = [];
    levelWarning(warnings, actor, 11, "Lighten the Load");

    const reactions = getReactions(actor);
    if (!reactions?.available) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const triggerUuid = data.triggerUuid ?? null;
    const newTargetUuid = data.targetUuid ?? data.newTargetUuid ?? data.newTarget?.uuid ?? data.target?.uuid ?? null;
    const newTargetName = data.targetName ?? data.newTargetName ?? data.newTarget?.name ?? data.target?.name ?? "second creature";

    if (newTargetUuid === actor.uuid) {
      warn(warnings, "selfTarget", "Lighten the Load cannot target yourself.");
    }
    if (newTargetUuid === triggerUuid) {
      warn(warnings, "sameTarget", "Lighten the Load must choose a different creature.");
    }

    const distance = Number(data.distance ?? 0);
    if (distance > 60) {
      warn(warnings, "range", `${newTargetName} is beyond 60 feet.`);
    }

    if (data.isSupplementary) {
      warn(warnings, "chaining", "Cannot use Lighten the Load on supplementary Aid Dice.");
    }

    const level = supporterLevel(actor) ?? 11;
    const die = aidDieSize(level);

    return {
      title: `Lighten the Load -> ${newTargetName}`,
      warnings,
      apply(state, receipt) {
        receipt.reaction = {
          requested: true,
          triggerId: `lighten-${receipt.id}`,
          receiptId: `lighten-${receipt.id}`
        };

        receipt.summary = `${actor.name} used Reaction to grant a free ${die} Aid Die to ${newTargetName} via Lighten the Load.`;
        receipt.result = { supplementary: true, dieSize: die, targetUuid: newTargetUuid };

        if (newTargetUuid) {
          receipt.targets = [{
            uuid: newTargetUuid,
            name: newTargetName,
            kind: "effect",
            featureId: "class-feature-supporter-11th-level-lighten-the-load-5608",
            tag: {
              label: `Supplementary Aid Die (${die})`,
              trigger: "turnStart",
              duration: 600,
              data: {
                supporterUuid: actor.uuid,
                dieSize: die,
                supporterLevel: level,
                supporterPB: pbForLevel(level),
                supplementary: true
              }
            },
            ready: true
          }];
        }
        return {};
      }
    };
  }
};

supporterUses.register({
  plans: CORE_PLANS,
  targetKinds: {
    effect: {
      async apply(source, useId, entry, target) {
        const existing = values(target.effects).find(effect => flag(effect, supporterUses.effectFlag)?.opId === useId && flag(effect, supporterUses.effectFlag)?.sourceUuid === source.uuid);
        if (existing) return true;
        const item = values(source.items).find(candidate => flag(candidate, "chapterThreeId") === entry.featureId);
        const tag = { ...entry.tag }, expiryActor = tag.expiryActor === "target" ? target : source;
        const inCombat = game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === expiryActor.uuid);
        if (["turnStart", "turnEnd", "nextTurnEnd", "currentTurnEnd", "combatEnd"].includes(tag.trigger) && !inCombat) {
          tag.trigger = "manual";
          tag.instructions = `${tag.instructions ?? ""} Outside combat, remove it manually when it ends.`.trim();
        }
        if (item) {
          const effect = await applyFeatureTag(source, item, target, tag);
          const updates = { [`flags.ak5e.${supporterUses.effectFlag}`]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) } };
          if (entry.standardBenefit) {
            updates["flags.ak5e.standardBenefit"] = entry.standardBenefit;
          }
          try { await effect.update(updates); }
          catch (error) { await effect.delete(); throw error; }
        } else {
          const effectData = {
            name: tag.label ?? "Aid Die",
            icon: "icons/magic/control/buff-flight-wings-runes-purple.webp",
            flags: {
              ak5e: {
                [supporterUses.effectFlag]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) },
                featureTag: tag
              }
            }
          };
          await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }
        return true;
      },
      async revert(source, useId, _entry, target) {
        const effects = values(target.effects).filter(effect => flag(effect, supporterUses.effectFlag)?.opId === useId && flag(effect, supporterUses.effectFlag)?.sourceUuid === source.uuid);
        if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
        return { removed: effects.length };
      },
      preview(_source, receipt, entry, target) {
        const present = values(target?.effects).some(effect => flag(effect, supporterUses.effectFlag)?.opId === receipt.id);
        return present ? `${entry.name}: removes ${entry.tag?.label ?? "the effect"}.` : `${entry.name}: ${entry.tag?.label ?? "the effect"} is already gone; nothing to remove.`;
      }
    }
  }
});

const rawCommand = supporterUses.command.bind(supporterUses);

supporterUses.command = async function(actor, name, data = {}, operationId) {
  return await rawCommand(actor, name, data, operationId);
};

supporterUses.execute = async function(actor, name, data = {}, opId) {
  return await supporterUses.command(actor, name, { confirmed: true, ...data }, opId);
};

supporterUses.undo = async function(actor, useId) {
  return await supporterUses.command(actor, "undoUse", { useId });
};

supporterUses.plan = function(actor, name, data = {}) {
  const planFn = CORE_PLANS[name];
  need(planFn, `Unknown Supporter plan ${name}.`);
  const state = supporterUses.state(actor);
  const plan = planFn(actor, state, data);
  if (plan.warnings?.length) {
    requireOverrides(plan.warnings, data.overrides ?? data.overridden);
  }
  return plan;
};
