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
import { createPlayUses, warn } from "./play-uses.mjs";
import {
  supporterEnabled, supporterLevel, supporterState, flag, aidDieSize, aidDieMax, pbForLevel
} from "./supporter-rules.mjs";
import {
  hasAdvancedAid, hasWillIntoBeing,
  hasSelfSupportDie, spendAidDice, findAidDieEffect, actorFromUuid,
  rollAidDieButton, advancedAidOffers, registerAidCritRider, removeAidRider
} from "./supporter-features.mjs";
import { need, values } from "./operation-kernel.mjs";
import { getReactions } from "./trigger-events.mjs";
import { requireOverrides } from "./play-undo.mjs";
import { getPool } from "./resource-pools.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";

const ROLL_TYPES = Object.freeze(["attack", "skill", "save", "damage", "healing"]);

export const supporterUses = createPlayUses({
  ns: "supporterUses",
  label: "Supporter",
  // A holder of an Aid Die (not necessarily a Supporter) runs useAidDie on its own Actor.
  isMember: actor => supporterEnabled(actor) || Boolean(findAidDieEffect(actor)),
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

/** Roll type and death-save checks shared by every use that rolls an Aid Die (warn, never block). */
function checkAidRoll(warnings, rollType, data) {
  if (!ROLL_TYPES.includes(rollType)) {
    warn(warnings, "invalidRollType", `Invalid roll type: ${rollType || "(none)"}. Must be one of ${ROLL_TYPES.join(", ")}.`);
  }
  if (data.isDeathSave) {
    warn(warnings, "deathSave", "Aid Die cannot be used on Death Saving Throws.");
  }
}

/** Expended-effect and rider changes are made by the holder's own client. Only the recorded change can be relayed. */
const relayable = (receipt, entry, target) => entry.kind === "effect" && entry.meta?.aidDie === true && target?.uuid === entry.uuid && receipt.result?.dieSize === entry.tag?.data?.dieSize;

const CORE_PLANS = {
  provideAid(actor, state, data) {
    need(supporterEnabled(actor), "Provide Aid requires the Supporter class.");
    const warnings = [];
    const level = supporterLevel(actor) ?? 1;
    const pb = pbForLevel(level);
    const die = aidDieSize(level);

    const targetUuid = data.targetUuid ?? data.target?.uuid ?? null;
    const targetName = data.targetName ?? data.target?.name ?? "target creature";
    const target = data.target ?? actorFromUuid(targetUuid);

    // Range warning (60 ft)
    const distance = Number(data.distance ?? 0);
    if (distance > 60) {
      warn(warnings, "range", `${targetName} is beyond 60 feet (Provide Aid range).`);
    }

    // Target cannot already have an Aid Die (checked against the Active Effect it holds)
    if (findAidDieEffect(target) || data.targetHasAidDie) {
      warn(warnings, "targetHasAidDie", `${targetName} already has an Aid Die; a creature can only have one Aid Die at a time.`);
    }

    if (aidDieMax(actor) <= 0) {
      warn(warnings, "aidMax", "Your Aid Die maximum is 0 (chosen ability modifier 0 or lower); the GM resolves this.");
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
        const spendUpdate = spendAidDice(actor, 1, receipt);

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
            meta: { aidDie: true, dieSize: die },
            ready: true
          }];
        }

        return spendUpdate;
      }
    };
  },

  /** The holder expends the Aid Die Active Effect (kept in the receipt for undo) and rolls it from the card's button. */
  useAidDie(actor, state, data) {
    const warnings = [];
    const rollType = String(data.rollType ?? "").toLowerCase();
    checkAidRoll(warnings, rollType, data);

    const effect = findAidDieEffect(actor);
    if (!effect) {
      warn(warnings, "noAidDie", `${actor.name} holds no Aid Die; this roll uses no Aid Die.`);
    }
    const aid = flag(effect, "featureTag")?.data ?? {};
    const lvl = Number(aid.supporterLevel ?? data.supporterLevel ?? supporterLevel(actor) ?? 1);
    const dieSize = aid.dieSize ?? data.dieSize ?? aidDieSize(lvl);
    const advanced = (aid.advancedAid ?? lvl >= 5) === true;
    const pb = Number(aid.supporterPB ?? data.supporterPB ?? pbForLevel(lvl));
    const willEligible = (aid.willIntoBeing ?? lvl >= 20) === true && pb > 0;
    const willOn = willEligible && data.willIntoBeing === true;
    // Advanced Aid crit rider (R6) is registered only when the user picks it.
    const critRider = advanced && rollType === "attack" && data.rider === "crit";
    const formula = `1${dieSize}${willOn ? ` + ${pb}` : ""}`;
    const offers = advanced ? advancedAidOffers(rollType) : [];

    return {
      title: `Expend Aid Die (${dieSize}) for ${rollType.toUpperCase()}`,
      warnings,
      apply(next, receipt) {
        const riderId = `aidcrit-${receipt.id}`;
        const targets = [];
        if (effect) {
          targets.push({ uuid: actor.uuid, name: actor.name, kind: "aidDieEffect", effectId: effect.id,
            snapshot: typeof effect.toObject === "function" ? effect.toObject() : null, ready: true });
        }
        if (critRider) {
          targets.push({ uuid: actor.uuid, name: actor.name, kind: "aidRider", riderId, label: "Advanced Aid: critical range +1 (this attack)", ready: true });
        }
        if (targets.length) receipt.targets = targets;
        receipt.formula = formula;
        receipt.rollLabel = `Aid Die (${dieSize})`;
        receipt.html = true;
        receipt.summary = `${actor.name} expended an Aid Die (${dieSize}) on ${rollType}.` + rollAidDieButton({
          actor, label: "Roll Aid Die", formula,
          extra: { willIntoBeingPB: !willOn && willEligible ? pb : 0, riders: offers }
        });
        receipt.result = {
          dieSize,
          rollType,
          willBonus: willOn ? pb : 0,
          advancedEffect: advanced ? rollType : null,
          critRider: critRider ? riderId : null
        };
        return {};
      }
    };
  },

  /** Self-Supportive die (L18+): the Supporter's own per-Turn die, expended as if it were Provide Aid to self. */
  selfSupportiveDie(actor, state, data) {
    need(supporterEnabled(actor), "The Self-Supportive die requires the Supporter class.");
    const warnings = [];
    levelWarning(warnings, actor, 18, "Self-Supportive");
    const rollType = String(data.rollType ?? "").toLowerCase();
    checkAidRoll(warnings, rollType, data);
    if (!hasSelfSupportDie(actor)) {
      warn(warnings, "noSelfSupportDie", "No Self-Supportive Aid Die is held this Turn; it is granted at the start of your Turn.");
    }
    const lvl = supporterLevel(actor) ?? 1;
    const dieSize = aidDieSize(lvl);
    const pb = pbForLevel(lvl);
    const willOn = hasWillIntoBeing(actor) && data.willIntoBeing === true;
    const formula = `1${dieSize}${willOn ? ` + ${pb}` : ""}`;

    return {
      title: `Self-Supportive Aid Die (${dieSize}) for ${rollType.toUpperCase()}`,
      warnings,
      apply(next, receipt) {
        receipt.formula = formula;
        receipt.rollLabel = `Self-Supportive Aid Die (${dieSize})`;
        receipt.html = true;
        receipt.summary = `${actor.name} expended the Self-Supportive Aid Die (${dieSize}) on ${rollType}.` + rollAidDieButton({
          actor, label: "Roll Aid Die", formula,
          extra: { riders: hasAdvancedAid(actor) ? advancedAidOffers(rollType) : [] }
        });
        receipt.result = { dieSize, rollType, selfSupportive: true, willBonus: willOn ? pb : 0,
          advancedEffect: hasAdvancedAid(actor) ? rollType : null };
        return { "flags.ak5e.supporter.selfSupportDie": false };
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
    const newTarget = data.newTarget ?? data.target ?? actorFromUuid(newTargetUuid);

    if (newTargetUuid === actor.uuid) {
      warn(warnings, "selfTarget", "Lighten the Load cannot target yourself.");
    }
    if (newTargetUuid === triggerUuid) {
      warn(warnings, "sameTarget", "Lighten the Load must choose a different creature.");
    }
    // R3: the bonus die may go to a creature already holding one; warn and allow.
    if (findAidDieEffect(newTarget)) {
      warn(warnings, "targetHasAidDie", `${newTargetName} already holds an Aid Die; a creature can only have one Aid Die at a time.`);
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
        // The bonus die is free: no pool spend. finish() spends the Reaction via spendReaction (refunded on undo).
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
            meta: { aidDie: true, dieSize: die, supplementary: true },
            ready: true
          }];
        }
        return {};
      }
    };
  }
};
CORE_PLANS.provideAid.validateTarget = (source, receipt, entry, target) => relayable(receipt, entry, target);
CORE_PLANS.lightenTheLoad.validateTarget = (source, receipt, entry, target) => relayable(receipt, entry, target);

/** Plans and readings registered so far. Branch modules add theirs through registerSupporterPlans(). */
const ALL_PLANS = { ...CORE_PLANS };
const ALL_READINGS = {};

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
    },
    // The holder's own Aid Die Active Effect, expended on use. The snapshot lets undo recreate it.
    aidDieEffect: {
      local: true,
      documentName: "Actor",
      async apply(source, useId, entry, target) {
        if (values(target.effects).some(effect => effect.id === entry.effectId)) {
          await target.deleteEmbeddedDocuments("ActiveEffect", [entry.effectId]);
        }
        return { expended: entry.effectId };
      },
      async revert(source, useId, entry, target) {
        if (!values(target.effects).some(effect => effect.id === entry.effectId) && entry.snapshot) {
          await target.createEmbeddedDocuments("ActiveEffect", [entry.snapshot]);
        }
        return { restored: true };
      },
      preview(_source, _receipt, entry) {
        return `${entry.name}: the expended Aid Die is restored.`;
      }
    },
    // One-shot attack rider (R6): registered on the holder, removed on undo.
    aidRider: {
      local: true,
      documentName: "Actor",
      async apply(source, useId, entry, target) {
        await registerAidCritRider(target, entry.riderId, entry.label);
        return { registered: entry.riderId };
      },
      async revert(source, useId, entry, target) {
        await removeAidRider(target, entry.riderId);
        return { removed: entry.riderId };
      },
      preview(_source, _receipt, entry) {
        return `${entry.name}: the critical-range rider is removed.`;
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

/**
 * Register Supporter plans and readings (branch modules: Artificer, Bard, Hexer). Duplicate plan or
 * reading names throw. Merged into the engine, so .plan, .execute, .undo and handleRelay see them.
 */
export function registerSupporterPlans({ plans = {}, readings = {}, cleanup } = {}) {
  for (const name of Object.keys(plans)) need(!Object.hasOwn(ALL_PLANS, name), `Supporter plan ${name} is already registered.`);
  for (const name of Object.keys(readings)) need(!Object.hasOwn(ALL_READINGS, name), `Supporter reading ${name} is already registered.`);
  Object.assign(ALL_PLANS, plans);
  Object.assign(ALL_READINGS, readings);
  supporterUses.register({ plans, readings, cleanup });
}

supporterUses.plan = function(actor, name, data = {}) {
  need(Object.hasOwn(ALL_PLANS, name), `Unknown Supporter plan ${name}.`);
  const planFn = ALL_PLANS[name];
  const state = supporterUses.state(actor);
  const plan = planFn(actor, state, data);
  if (plan.warnings?.length) {
    requireOverrides(plan.warnings, data.overrides ?? data.overridden);
  }
  return plan;
};
