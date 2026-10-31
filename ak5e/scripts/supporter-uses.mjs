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
  hasWillIntoBeing, hasSelfSupportDie, spendAidDice, findAidDieEffect, actorFromUuid,
  rollAidDieButton, advancedAidOffers, registerAidCritRider, removeAidRider
} from "./supporter-features.mjs";
import { need, values, esc } from "./operation-kernel.mjs";
import { getReactions } from "./trigger-events.mjs";
import { requireOverrides } from "./play-undo.mjs";
import { getPool } from "./resource-pools.mjs";
import { applyFeatureTag, tagExpiry } from "./feature-tags.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";

const ROLL_TYPES = Object.freeze(["attack", "skill", "save", "damage", "healing"]);
const AID_USE_COMMANDS = Object.freeze(["useAidDie", "selfSupportiveDie"]);

export const supporterUses = createPlayUses({
  ns: "supporterUses",
  label: "Supporter",
  // A holder of an Aid Die (not necessarily a Supporter) runs useAidDie on its own Actor, and may
  // still roll or claim a use after its Aid Die effect has been expended.
  isMember: actor => supporterEnabled(actor) || Boolean(findAidDieEffect(actor)) || hasOpenAidUse(actor),
  ruling: (actor, key) => {
    const record = supporterState(actor).rulings?.[key];
    return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
  }
});

function hasOpenAidUse(actor) {
  return (flag(actor, "supporterUses")?.undo ?? []).some(r => AID_USE_COMMANDS.includes(r.command) && r.status !== "undone");
}

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

/** The only keys this module writes into a feature tag, its data, and a relayed entry (F-R7). */
const AID_TAG_KEYS = Object.freeze(["label", "trigger", "seconds", "expiryActor", "data", "instructions"]);
const AID_TAG_DATA_KEYS = Object.freeze(["supporterUuid", "dieSize", "supporterLevel", "supporterPB", "advancedAid", "willIntoBeing", "supplementary"]);
const AID_META_KEYS = Object.freeze(["aidDie", "dieSize", "supplementary"]);
const AID_FEATURE_IDS = Object.freeze(["class-feature-supporter-1st-level-provide-aid-2284", "class-feature-supporter-11th-level-lighten-the-load-5608"]);
/** Aid Die duration (C3:6635): the recipient has ten minutes of world time, in and out of combat. */
const AID_DIE_SECONDS = 600;
const onlyKeys = (object, allowed) => Boolean(object) && typeof object === "object" && !Array.isArray(object)
  && Object.keys(object).every(key => allowed.includes(key));

/**
 * Expended-effect and rider changes are made by the holder's own client. Only the recorded change can be relayed,
 * and only when its content is the shape this module creates (F-R7): no changes, condition or foreign keys, the
 * module's own feature, a 600 s time expiry and the same die size as the receipt.
 */
const relayable = (source, receipt, entry, target) => {
  const tag = entry.tag ?? {}, dieSize = receipt.result?.dieSize;
  // The receipt and its entries are owner-writable: the die size and supporter are checked against the giver's own state.
  return entry.kind === "effect" && target?.uuid === entry.uuid && entry.standardBenefit === undefined
    && tag.data?.supporterUuid === source?.uuid && tag.data?.dieSize === aidDieSize(supporterLevel(source) ?? 1)
    && entry.meta?.aidDie === true && onlyKeys(entry.meta, AID_META_KEYS)
    && AID_FEATURE_IDS.includes(entry.featureId)
    && onlyKeys(tag, AID_TAG_KEYS) && onlyKeys(tag.data, AID_TAG_DATA_KEYS)
    && typeof tag.label === "string" && tag.label.length <= 160
    && tag.trigger === "time" && tag.seconds === AID_DIE_SECONDS
    && (tag.expiryActor === undefined || tag.expiryActor === "source" || tag.expiryActor === "target")
    && (tag.instructions === undefined || typeof tag.instructions === "string")
    && typeof dieSize === "string" && entry.meta.dieSize === dieSize && tag.data?.dieSize === dieSize;
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
    const target = data.target ?? actorFromUuid(targetUuid);

    // Range warning (60 ft)
    const distance = Number(data.distance ?? 0);
    if (distance > 60) {
      warn(warnings, "range", `${targetName} is beyond 60 feet (Provide Aid range).`);
    }

    // C3:6633 says "another Creature": targeting yourself warns (PA-3), never blocks.
    if (targetUuid === actor.uuid || target?.uuid === actor.uuid) {
      warn(warnings, "selfTarget", "Provide Aid is for another Creature; you cannot give an Aid Die to yourself (Self-Supportive is separate).");
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
              trigger: "time",
              seconds: AID_DIE_SECONDS,
              expiryActor: "source",
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

  /**
   * The holder expends the Aid Die Active Effect (kept in the receipt for undo) and rolls it from the card.
   * Advanced Aid and Will Into Being are gated on the GIVER's Supporter level (the effect, else data).
   */
  useAidDie(actor, state, data) {
    const warnings = [];
    const rollType = String(data.rollType ?? "").toLowerCase();
    checkAidRoll(warnings, rollType, data);

    const effect = findAidDieEffect(actor);
    if (!effect) {
      warn(warnings, "noAidDie", `${actor.name} holds no Aid Die; this roll uses no Aid Die.`);
    }
    const aid = flag(effect, "featureTag")?.data ?? {};
    const giver = Number(aid.supporterLevel ?? data.supporterLevel ?? 1);
    const dieSize = aid.dieSize ?? data.dieSize ?? aidDieSize(giver);
    const pb = Number(aid.supporterPB ?? data.supporterPB ?? pbForLevel(giver));
    const advanced = giver >= 5;
    const willEligible = giver >= 20;
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
        const card = rollAidDieButton({
          actor, label: "Roll Aid Die", formula, useId: receipt.id, rollType,
          extra: { willIntoBeingPB: willEligible ? pb : 0, riders: offers }
        });
        receipt.summary = `${esc(actor.name)} expended an Aid Die (${esc(dieSize)}) on ${esc(rollType)}.` + card;
        receipt.result = {
          dieSize,
          rollType,
          card,
          giverLevel: giver,
          pb,
          willBonus: willOn ? pb : 0,
          advancedEffect: advanced ? rollType : null,
          ...(critRider ? { critRider: riderId } : {})
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
    const advanced = lvl >= 5;
    const willEligible = lvl >= 20 && hasWillIntoBeing(actor);
    const willOn = willEligible && data.willIntoBeing === true;
    const formula = `1${dieSize}${willOn ? ` + ${pb}` : ""}`;

    return {
      title: `Self-Supportive Aid Die (${dieSize}) for ${rollType.toUpperCase()}`,
      warnings,
      apply(next, receipt) {
        receipt.formula = formula;
        receipt.rollLabel = `Self-Supportive Aid Die (${dieSize})`;
        receipt.html = true;
        const card = rollAidDieButton({
          actor, label: "Roll Aid Die", formula, useId: receipt.id, rollType,
          extra: { willIntoBeingPB: willEligible ? pb : 0, riders: advanced ? advancedAidOffers(rollType) : [] }
        });
        receipt.summary = `${esc(actor.name)} expended the Self-Supportive Aid Die (${esc(dieSize)}) on ${esc(rollType)}.` + card;
        receipt.result = { dieSize, rollType, card, giverLevel: lvl, pb, selfSupportive: true, willBonus: willOn ? pb : 0,
          advancedEffect: advanced ? rollType : null };
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
              trigger: "time",
              seconds: AID_DIE_SECONDS,
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
CORE_PLANS.provideAid.validateTarget = (source, receipt, entry, target) => relayable(source, receipt, entry, target);
CORE_PLANS.lightenTheLoad.validateTarget = (source, receipt, entry, target) => relayable(source, receipt, entry, target);

/**
 * Rider temp HP (save, healing): a change to the clicked creature, which may be unowned, so it goes
 * through the relay as a tempHP target. Temp HP is the amount the card computed from the stored roll.
 */
/** Largest Aid Die face (d12) plus the largest Proficiency Bonus: no Advanced Aid Temporary HP grant can exceed it. */
const AID_TEMP_HP_CEILING = 12 + 6;

/**
 * What Advanced Aid allows for one expended Aid Die (C3:6660-6662): the amount rolled, plus the Proficiency Bonus for a
 * Saving Throw. `null` until the Aid Die has been rolled, and for a roll type that grants no Temporary HP.
 */
export function aidTempHPAllowance(parent) {
  const rollType = parent?.result?.rollType;
  if (!["save", "healing"].includes(rollType) || !Number.isInteger(Number(parent?.roll)) || parent?.roll === undefined) return null;
  return Number(parent.roll) + (rollType === "save" ? Number(parent.result?.pb ?? 0) : 0);
}

const AID_TEMP_HP_PLAN = {
  aidTempHP(actor, state, data) {
    const amount = Number(data.amount);
    need(Number.isInteger(amount) && amount > 0, "Temporary HP must be a positive whole number.");
    need(amount <= AID_TEMP_HP_CEILING, `Advanced Aid never grants more than ${AID_TEMP_HP_CEILING} Temporary Hit Points.`);
    const name = data.targetName ?? "target creature";
    const warnings = [];
    // Pool debit: the grant belongs to one expended Aid Die use. Without a link, or beyond what that die allows, it warns.
    const undo = state.undo ?? [];
    const parent = data.useId ? undo.find(entry => entry.id === data.useId && AID_USE_COMMANDS.includes(entry.command)) ?? null : null;
    if (data.useId) {
      if (!parent || parent.status === "undone") {
        warn(warnings, "parentUse", "The Aid Die use this Temporary HP belongs to is missing or was undone.");
      } else {
        const allowance = aidTempHPAllowance(parent);
        if (allowance === null) warn(warnings, "noAllowance", "Advanced Aid grants Temporary HP only for a rolled Saving Throw or Healing Roll Aid Die.");
        else if (amount > allowance) warn(warnings, "exceedsRoll", `Advanced Aid allows ${allowance} Temporary Hit Points for this Aid Die; ${amount} is more.`);
        if (undo.some(entry => entry.command === "aidTempHP" && entry.status !== "undone" && entry.parentUseId === data.useId)) {
          warn(warnings, "alreadyGranted", "Temporary Hit Points were already granted for this Aid Die.");
        }
      }
    }
    return {
      title: `Temporary HP ${amount} -> ${name}`,
      warnings,
      apply(next, receipt) {
        receipt.targets = [{ uuid: data.targetUuid, name, kind: "tempHP", amount, mode: "replace", ready: true }];
        if (parent && parent.status !== "undone") receipt.parentUseId = data.useId;
        receipt.summary = `${actor.name} granted ${name} ${amount} Temporary Hit Points (Advanced Aid).`;
        receipt.result = { amount, targetUuid: data.targetUuid, targetName: name };
        return {};
      }
    };
  }
};
/**
 * The GM relay applies this to a Creature its owner cannot write, from a receipt the giver can edit, so the grant is
 * re-checked here against the giver's own recorded Aid Die: a live parent use that rolled a Saving Throw or Healing Roll,
 * with an amount no larger than Advanced Aid allows (and never above the absolute ceiling).
 */
AID_TEMP_HP_PLAN.aidTempHP.validateTarget = (source, receipt, entry, target) => {
  if (entry.kind !== "tempHP" || entry.mode !== "replace" || target?.uuid !== entry.uuid) return false;
  if (!Number.isInteger(entry.amount) || entry.amount < 1 || entry.amount > AID_TEMP_HP_CEILING || entry.amount !== receipt.result?.amount) return false;
  const parent = (supporterUses.state(source).undo ?? []).find(candidate => candidate.id === receipt.parentUseId);
  const allowance = parent && parent.status !== "undone" && AID_USE_COMMANDS.includes(parent.command) ? aidTempHPAllowance(parent) : null;
  return allowance !== null && entry.amount <= allowance;
};

/**
 * Advanced Aid card riders (F-R3). Each click is its own recorded use, so undo removes what it added. A missing or
 * undone Aid Die use, or a rider already recorded for it, warns (never blocks).
 */
/** True when a live aidSecondRoll receipt already records a second roll for this Aid Die use. */
function aidSecondRollRecorded(state, useId) {
  return (state.undo ?? []).some(entry => entry.command === "aidSecondRoll" && entry.status !== "undone" && entry.data?.useId === useId);
}

/**
 * The actor's latest native attack roll made at or after `since` (ms), as { natural, threshold, critical }; null when there is
 * none or when its d20 cannot be read. Used so the Advanced Aid crit rider judges the attack the Aid Die was spent on when
 * that attack has already been rolled, instead of silently waiting for the next one.
 */
export function attackRollSince(actor, since, messages = globalThis.game?.messages) {
  if (!Number.isFinite(Number(since))) return null;
  let found = null;
  for (const message of values(messages)) {
    if (message?.flags?.dnd5e?.roll?.type !== "attack" || message?.speaker?.actor !== actor.id) continue;
    const time = Number(message.timestamp ?? 0);
    if (time < Number(since) || (found && time <= found.time)) continue;
    const roll = message.rolls?.[0];
    const d20 = roll?.dice?.find(die => die.faces === 20);
    const natural = Number(d20?.results?.find(result => result.active !== false)?.result ?? d20?.total);
    if (!Number.isFinite(natural)) continue;
    found = { time, natural, threshold: Number(roll.options?.criticalSuccess ?? 20), critical: roll.isCritical === true };
  }
  return found;
}

const AID_CARD_PLANS = {
  aidCritRider(actor, state, data) {
    const undo = state.undo ?? [];
    const parent = undo.find(entry => entry.id === data.useId) ?? null;
    const riderId = `aidcrit-${data.useId}`;
    const label = "Advanced Aid: critical range +1 (this attack)";
    const warnings = [];
    if (!parent || parent.status === "undone") {
      warn(warnings, "parentUse", "The Aid Die use this rider belongs to is missing or was undone; the rider is recorded on its own.");
    }
    if (undo.some(entry => entry.status !== "undone" && entry.targets?.some(target => target.riderId === riderId))) {
      warn(warnings, "riderPresent", "The critical-range rider for this Aid Die is already recorded.");
    }
    // The attack this Aid Die was spent on may already be rolled. If so the rider belongs to THAT attack (a native roll
    // cannot be changed after the fact, so the card states the result) and is not carried over to the next attack.
    const rolled = parent && parent.status !== "undone" ? attackRollSince(actor, parent.createdAt) : null;
    return {
      title: label,
      warnings,
      apply(next, receipt) {
        // Undoing the Aid Die use also undoes this child receipt, which removes the rider.
        if (parent && parent.status !== "undone") receipt.parentUseId = data.useId;
        if (rolled) {
          const widened = rolled.threshold - 1;
          const verdict = rolled.critical ? `already a critical hit (natural ${rolled.natural})`
            : rolled.natural >= widened ? `now a critical hit (natural ${rolled.natural}, critical range ${widened} to 20): use the critical damage` : `not a critical hit (natural ${rolled.natural}, critical range ${widened} to 20)`;
          receipt.summary = `${actor.name} widens the critical range by 1 (Advanced Aid). The attack already rolled is ${verdict}.`;
          receipt.result = { critRider: riderId, useId: data.useId, appliedTo: "rolledAttack", natural: rolled.natural, threshold: widened };
          return {};
        }
        receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "aidRider", riderId, label, ready: true }];
        receipt.summary = `${actor.name} widens the critical range by 1 for the attack this Aid Die is spent on (Advanced Aid): the next attack roll, since none has been rolled for it yet.`;
        receipt.result = { critRider: riderId, useId: data.useId, appliedTo: "nextAttack" };
        return {};
      }
    };
  },
  /** Once per Aid Die: records the second roll; the owner then rolls the stored formula on the click. */
  aidSecondRoll(actor, state, data) {
    const undo = state.undo ?? [];
    const parent = undo.find(entry => entry.id === data.useId && AID_USE_COMMANDS.includes(entry.command)) ?? null;
    need(parent?.formula, "Choose an Aid Die use to roll again.");
    const warnings = [];
    if (parent.status === "undone") warn(warnings, "parentUse", "This Aid Die use was undone.");
    if (aidSecondRollRecorded(state, data.useId)) {
      warn(warnings, "alreadyRolled", "Already rolled: this Aid Die has been rolled again. Advanced Aid allows one second roll per Aid Die.");
    }
    return {
      title: "Advanced Aid: second roll",
      warnings,
      apply(next, receipt) {
        receipt.summary = `${actor.name} rolls the Aid Die again (${parent.formula}); the owner chooses which result to use.`;
        receipt.result = { formula: parent.formula, useId: data.useId, rollType: parent.result?.rollType ?? null };
        return {};
      }
    };
  }
};

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
        // The Aid Die data (giver level, die size, PB) is kept on the effect's featureTag.data on both paths.
        const updates = { [`flags.ak5e.${supporterUses.effectFlag}`]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) } };
        if (tag.data) updates["flags.ak5e.featureTag"] = { data: structuredClone(tag.data) };
        if (entry.standardBenefit) {
          updates["flags.ak5e.standardBenefit"] = entry.standardBenefit;
        }
        if (item) {
          const effect = await applyFeatureTag(source, item, target, tag);
          try { await effect.update(updates); }
          catch (error) { await effect.delete(); throw error; }
        } else {
          // No feature Item (setup not run): a tracked effect with a computed expiry, so expireFeatureTags removes it.
          const temporaryTag = {
            id: foundry.utils.randomID(), sourceActorUuid: source.uuid, sourceItemUuid: null,
            targetActorUuid: target.uuid, targetItemUuid: null, label: String(tag.label ?? "Aid Die"),
            sourceName: source.name, sourceItemName: null, targetItemName: null, expiry: tagExpiry(source, target, tag),
            relationship: false, sourceDeletion: "remove", preset: null, actions: [],
            instructions: String(tag.instructions ?? ""), counters: {}
          };
          const effectData = {
            name: temporaryTag.label,
            icon: "icons/magic/control/buff-flight-wings-runes-purple.webp",
            ...(tag.trigger === "time" ? { duration: { seconds: Number(tag.seconds), startTime: game.time.worldTime } } : {}),
            flags: {
              ak5e: {
                [supporterUses.effectFlag]: { opId: useId, sourceUuid: source.uuid, ...(entry.meta ?? {}) },
                ...(tag.data ? { featureTag: { data: structuredClone(tag.data) } } : {}),
                ...(entry.standardBenefit ? { standardBenefit: entry.standardBenefit } : {}),
                temporaryTag
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

registerSupporterPlans({ plans: { ...AID_TEMP_HP_PLAN, ...AID_CARD_PLANS } });

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

/* ---------------------------------------------------------------- card buttons */

const notify = error => {
  console.error("AK5e | Supporter Aid card", error);
  globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
};

/** Confirm step for every Supporter use (WORKFLOW §3.2). Resolves true only on Confirm; Cancel changes nothing. */
export async function confirmSupporterUse(title, lines) {
  const content = `<div class="ak5e-supporter-confirm">${lines.map(line => `<p>${esc(line)}</p>`).join("")}</div>`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 480 },
    rejectClose: false,
    content,
    buttons: [
      { action: "confirm", label: "Confirm", default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  return result === true;
}

/** Roll the Aid Die on the user's click only: the engine's useRoll posts the result. */
async function clickRoll(actor, useId) {
  return confirmPlayUse("Roll Aid Die", () => supporterUses.command(actor, "useRoll", { useId }, foundry.utils.randomID()));
}

/** Temp HP = the stored Aid Die roll (+PB for a save), applied to the chosen creature through the relay. Always confirmed (F-R3). */
async function clickTempHP(actor, useId) {
  const receipt = supporterUses.receipt(actor, useId);
  need(receipt?.roll !== undefined, "Roll the Aid Die first.");
  const amount = Number(receipt.roll) + (receipt.result?.rollType === "save" ? Number(receipt.result?.pb ?? 0) : 0);
  const target = globalThis.game?.user?.targets?.first?.()?.actor ?? actor;
  const confirmed = await confirmSupporterUse("Temporary HP", [
    `${target.name} gains ${amount} Temporary Hit Points (Advanced Aid).`,
    "Temporary Hit Points do not stack: the higher value is kept. Undo restores the previous value."
  ]);
  if (!confirmed) return null;
  const opId = foundry.utils.randomID();
  return confirmPlayUse("Temporary HP", extra => supporterUses.execute(actor, "aidTempHP",
    { targetUuid: target.uuid, targetName: target.name, amount, useId, ...extra }, opId), { confirmed: true });
}

/** Advanced Aid second roll (once per Aid Die): recorded as a use first, then rolled on this click only. */
async function clickSecondRoll(actor, useId) {
  // One dialog: a repeat click's warning is the confirm itself, and the recorded override lets the use proceed.
  const repeat = aidSecondRollRecorded(supporterUses.state(actor), useId);
  const confirmed = await confirmSupporterUse("Advanced Aid: second roll", repeat
    ? ["Already rolled: this Aid Die has been rolled again. Confirm to roll once more anyway.", `${actor.name} rolls the Aid Die again; you choose which result to use.`]
    : [`${actor.name} rolls the Aid Die again; you choose which result to use.`, "Advanced Aid allows one second roll per Aid Die."]);
  if (!confirmed) return null;
  const result = await confirmPlayUse("Advanced Aid: second roll", extra => supporterUses.command(actor, "aidSecondRoll",
    { useId, confirmed: true, ...extra, overrides: [...(repeat ? ["alreadyRolled"] : []), ...(extra.overrides ?? [])] }, foundry.utils.randomID()), { confirmed: true });
  if (!result) return null;
  const roll = await new Roll(result.formula, actor.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: "Advanced Aid: second Aid Die roll (choose the result to use)" });
  return roll;
}

async function clickForce(actor, useId) {
  const receipt = supporterUses.receipt(actor, useId);
  need(receipt?.roll !== undefined, "Roll the Aid Die first.");
  const target = globalThis.game?.user?.targets?.first?.()?.actor ?? null;
  const name = target?.name ?? "a creature within 10 ft";
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<p>Advanced Aid: ${esc(receipt.roll)} Force damage to ${esc(name)} (within 10 ft of the creature damaged). Apply it with the native damage controls.</p>` });
}

/** Advanced Aid crit rider from the card: confirmed, then recorded as its own use so undo removes the rider (F-R3). */
async function clickCrit(actor, useId) {
  const confirmed = await confirmSupporterUse("Advanced Aid: critical range", [
    `${actor.name} widens the critical range by 1 (20 becomes 19) for the attack this Aid Die is spent on. If that attack is already rolled, the card states whether it is now a critical hit; otherwise the next attack is used.`,
    "Undoing this use removes the rider."
  ]);
  if (!confirmed) return null;
  return confirmPlayUse("Advanced Aid: critical range", extra => supporterUses.command(actor, "aidCritRider",
    { useId, confirmed: true, ...extra }, foundry.utils.randomID()), { confirmed: true });
}

async function clickWill(actor, pb) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<p>Will Into Being: +${esc(pb)} (Proficiency Bonus) noted for this Aid Die roll.</p>` });
}

async function handleAidClick(button) {
  const actor = actorFromUuid(button.dataset.actor);
  const useId = button.dataset.useId;
  need(actor?.isOwner, "Only the owner of this Aid Die may use these buttons.");
  if (button.dataset.ak5eAidRoll !== undefined) return clickRoll(actor, useId);
  if (button.dataset.ak5eWillIntoBeing !== undefined) return clickWill(actor, button.dataset.ak5eWillIntoBeing);
  switch (button.dataset.ak5eRider) {
    case "crit": return clickCrit(actor, useId);
    case "second": return clickSecondRoll(actor, useId);
    case "tempHP": return clickTempHP(actor, useId);
    case "force": return clickForce(actor, useId);
    default: throw new Error(`Unknown Advanced Aid rider ${button.dataset.ak5eRider ?? ""}.`);
  }
}

/** renderChatMessageHTML: wires each Aid Die card button once. Nothing rolls until a click. */
export function renderAidCardButtons(message, html) {
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root?.querySelectorAll) return;
  const useId = message?.flags?.ak5e?.[supporterUses.cardFlag]?.useId ?? null;
  for (const button of root.querySelectorAll("[data-ak5e-aid-roll], [data-ak5e-will-into-being], [data-ak5e-rider]")) {
    if (button.dataset.ak5eBound) continue;
    button.dataset.ak5eBound = "1";
    button.dataset.useId = useId ?? "";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      Promise.resolve().then(() => handleAidClick(button)).catch(notify).finally(() => { button.disabled = false; });
    });
  }
}

