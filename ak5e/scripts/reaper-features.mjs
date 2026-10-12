/**
 * Reaper subclass features (Ch. 3 L3330-3433):
 * Reaper's Ruin (0-10 Ruin pool, gain on crit/kill, decay on no damage, lose at 0 HP, Lingering Violence),
 * Reaper Table (cumulative benefits, Reap & Curtainfall crit ranges, healing penalties),
 * Death's Design (Reap 15-ft cone Dex save vs Martial DC, Curtainfall +1d6 per Ruin melee strike),
 * Crescendo of Violence (4th Level: Critical Death's Design, Vulnerability on Reap crit, ignore DR on Curtainfall crit),
 * Fear the Reaper (10th Level: 1/LR 1-hour Reaper's Mark, 1d6 Psychic on Ruin gain, invisibility piercing),
 * Reaper Prime (13th Level: 15-ft cone or 10-ft sphere, full damage on failed save),
 * Memento Mori (17th Level: Vulnerability + ignore DR or 10-ft splash 1d6 Psychic).
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { need, values, flag } from "./operation-kernel.mjs";

export const isReaper = actor => Boolean(guardEnabled(actor) && guardBranch(actor) === "reaper");

export const REAPER_TABLE = Object.freeze([
  { ruin: 0, reapCritBonus: 10, curtainfallCritBonus: 0, healingPenalty: 0, effect: null },
  { ruin: 1, reapCritBonus: 9, curtainfallCritBonus: 1, healingPenalty: 2, effect: null },
  { ruin: 2, reapCritBonus: 8, curtainfallCritBonus: 2, healingPenalty: 4, effect: "Reroll 1s on damage dice (must use new result)." },
  { ruin: 3, reapCritBonus: 7, curtainfallCritBonus: 3, healingPenalty: 6, effect: null },
  { ruin: 4, reapCritBonus: 6, curtainfallCritBonus: 4, healingPenalty: 8, effect: "Movement does not provoke Opportunity Attacks from non-Elite or Leader creatures." },
  { ruin: 5, reapCritBonus: 5, curtainfallCritBonus: 5, healingPenalty: 10, effect: null },
  { ruin: 6, reapCritBonus: 4, curtainfallCritBonus: 6, healingPenalty: 12, effect: "Can move through space of hostile creatures (treated as difficult terrain)." },
  { ruin: 7, reapCritBonus: 3, curtainfallCritBonus: 7, healingPenalty: 14, effect: null },
  { ruin: 8, reapCritBonus: 2, curtainfallCritBonus: 8, healingPenalty: 16, effect: "When rolling damage, may roll an additional time and choose either total." },
  { ruin: 9, reapCritBonus: 1, curtainfallCritBonus: 9, healingPenalty: 18, effect: null },
  { ruin: 10, reapCritBonus: 0, curtainfallCritBonus: 10, healingPenalty: 20, effect: "Attacks or Reap reducing a creature to < (5 + Guard Level) HP kill it outright." }
]);

export function getReaperTableEntry(ruin) {
  const clamped = Math.max(0, Math.min(10, Number(ruin ?? 0)));
  return REAPER_TABLE[clamped];
}

/**
 * Returns current Ruin points (0 to 10).
 */
export function getRuin(actor) {
  if (!isReaper(actor)) return 0;
  return resourceValue(actor, { pool: "reaperRuin" });
}

/**
 * Returns healing penalty for Reaper based on current Ruin (2 * Ruin, max 20).
 */
export function getReaperHealingPenalty(actor) {
  if (!isReaper(actor)) return 0;
  return getReaperTableEntry(getRuin(actor)).healingPenalty;
}

/**
 * Calculates number of kills earned against a Swarm/Horde (Ch. 3 L3405–3408).
 * The max Hit Points of the unit composing the Swarm is the threshold for earning 1 kill.
 * Double that threshold earns 2 kills, triple earns 3 kills, etc.
 */
export function calculateSwarmKills(damageDealt, swarmUnitMaxHp) {
  const threshold = Number(swarmUnitMaxHp);
  const damage = Number(damageDealt);
  if (!Number.isFinite(threshold) || threshold <= 0) return 0;
  if (!Number.isFinite(damage) || damage < threshold) return 0;
  return Math.floor(damage / threshold);
}

/**
 * Critical hit threshold for Reap at Level 4+ (Ch. 3 L3350, L3396).
 * Threshold = 20 - reapCritBonus (e.g. Ruin 0: 20 - 10 = 10; Ruin 10: 20 - 0 = 20).
 */
export function getReapCritThreshold(actor) {
  const level = guardLevel(actor) ?? 1;
  if (level < 4) return 20;
  const ruin = getRuin(actor);
  const bonus = getReaperTableEntry(ruin).reapCritBonus;
  return 20 - bonus;
}

/**
 * Critical hit threshold for Curtainfall at Level 4+ (Ch. 3 L3350, L3396).
 * Threshold = 20 - curtainfallCritBonus (e.g. Ruin 0: 20 - 0 = 20; Ruin 10: 20 - 10 = 10).
 */
export function getCurtainfallCritThreshold(actor) {
  const level = guardLevel(actor) ?? 1;
  if (level < 4) return 20;
  const ruin = getRuin(actor);
  const bonus = getReaperTableEntry(ruin).curtainfallCritBonus;
  return 20 - bonus;
}

export function defineReaperPools() {
  if (!getPoolDefinition("reaperRuin")) {
    definePool({
      id: "reaperRuin",
      label: "Ruin",
      max: 10,
      min: 0,
      initial: 0,
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isReaper(actor)
    });
  }

  if (!getPoolDefinition("fearTheReaper")) {
    definePool({
      id: "fearTheReaper",
      label: "Fear the Reaper",
      max: 1,
      min: 0,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isReaper(actor) && (guardLevel(actor) ?? 1) >= 10,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Reaper level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Reaper Plans */

export const REAPER_PLANS = {
  /**
   * Gain Ruin (1st Level, Ch. 3 L3336):
   * Triggered on Critical Hit or reducing creature to 0 HP.
   */
  reaperGainRuin(actor, state, data) {
    need(isReaper(actor), "Reaper's Ruin is a Reaper feature.");
    const warnings = [];
    const current = getRuin(actor);
    const amount = Number(data.amount ?? 1);
    const reason = data.reason ?? "Critical Hit or 0 HP Kill";

    if (current + amount > 10) {
      warn(warnings, "ruin", `Ruin max is 10; gaining ${amount} caps at 10.`);
    }

    return {
      warnings,
      title: "Gain Ruin",
      apply(next, receipt) {
        receipt.previousRuin = current;
        receipt.amount = amount;
        receipt.reason = reason;

        const updates = spendResource(actor, receipt, { pool: "reaperRuin", amount: -amount, label: "Ruin" });
        const newRuin = Math.min(10, current + amount);
        const entry = getReaperTableEntry(newRuin);

        receipt.summary = `${actor.name} gains +${amount} Ruin (Total: ${newRuin}/10) from ${reason}. Reap Crit: ${20 - entry.reapCritBonus}+, Curtainfall Crit: ${20 - entry.curtainfallCritBonus}+, Healing penalty: -${entry.healingPenalty}.${entry.effect ? ` [${entry.effect}]` : ""}`;
        receipt.result = { amount, newRuin, previousRuin: current, entry };
        return updates;
      }
    };
  },

  /**
   * Decay Ruin (1st Level, Ch. 3 L3336):
   * At end of turn if no damage dealt to hostile.
   */
  reaperDecayRuin(actor, state, data) {
    need(isReaper(actor), "Reaper's Ruin is a Reaper feature.");
    const warnings = [];
    const current = getRuin(actor);
    if (current <= 0) {
      warn(warnings, "ruin", `${actor.name} has 0 Ruin; cannot decay further.`);
    }

    return {
      warnings,
      title: "Ruin Decay",
      apply(next, receipt) {
        receipt.previousRuin = current;
        const updates = spendResource(actor, receipt, { pool: "reaperRuin", amount: 1, label: "Ruin" });
        const newRuin = Math.max(0, current - 1);

        receipt.summary = `At end of turn with no damage dealt to a hostile creature, ${actor.name} loses 1 Ruin (Now: ${newRuin}/10).`;
        receipt.result = { previousRuin: current, newRuin };
        return updates;
      }
    };
  },

  /**
   * Press the Attack: Lingering Violence (1st Level, Ch. 3 L3342):
   * Spends 1 Aggression to prevent 1 Ruin decay at end of turn.
   */
  reaperLingeringViolence(actor, state, data) {
    need(isReaper(actor), "Lingering Violence is a Reaper feature.");
    const warnings = [];
    const aggressionCost = 1;
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < aggressionCost) {
      warn(warnings, "aggression", `${aggressionCost} Aggression needed for Lingering Violence and ${available} remain; Aggression clamps at 0.`);
    }

    return {
      warnings,
      title: "Press the Attack: Lingering Violence",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: aggressionCost, label: "Aggression" });
        const currentRuin = getRuin(actor);

        receipt.summary = `${actor.name} spends 1 Aggression for Lingering Violence to prevent Ruin decay (remains at ${currentRuin}/10).`;
        receipt.result = { aggressionSpent: aggressionCost, ruin: currentRuin };
        return updates;
      }
    };
  },

  /**
   * Reap (1st Level, Ch. 3 L3388, 13th Level L3422):
   * Replaces Attack Action. 15-ft cone (or 10-ft sphere at 13th level).
   * DEX save vs Martial DC.
   * Half damage on fail (full damage at 13th level). 0 on save.
   * Level 4+ crit d20: if crit, non-elites Vulnerable.
   */
  reaperReap(actor, state, data) {
    need(isReaper(actor), "Reap is a Reaper feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const mDC = martialDC(actor);
    const ruin = getRuin(actor);
    const critThreshold = getReapCritThreshold(actor);
    const isPrime = level >= 13;
    const area = data.area ?? (isPrime && data.areaSphere ? "10-foot sphere" : "15-foot cone");
    const weaponName = data.weaponName ?? "Equipped Melee Weapon";

    return {
      warnings,
      title: "Death's Design: Reap",
      apply(next, receipt) {
        receipt.ruin = ruin;
        receipt.critThreshold = critThreshold;
        receipt.dc = mDC;
        receipt.isPrime = isPrime;

        receipt.summary = `${actor.name} swings ${weaponName} for Reap (${area}). DC ${mDC} Dexterity save. ${isPrime ? "Full damage on fail (Reaper Prime)" : "Half damage on fail"}.${level >= 4 ? ` Crits on ${critThreshold}+ (targets gain Vulnerability).` : ""}`;
        receipt.result = { area, critThreshold, dc: mDC, isPrime, ruin };
        return {};
      }
    };
  },

  /**
   * Curtainfall (1st Level, Ch. 3 L3390):
   * Replaces Attack Action. Melee attack dealing +1d6 per Ruin.
   * Expends all Ruin after dealing damage.
   * Level 4+ crit: ignores Physical Resistance.
   */
  reaperCurtainfall(actor, state, data) {
    need(isReaper(actor), "Curtainfall is a Reaper feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const currentRuin = getRuin(actor);
    const critThreshold = getCurtainfallCritThreshold(actor);
    const bonusDice = `${currentRuin}d6`;
    const targetName = data.targetName ?? "Target Creature";

    if (currentRuin <= 0) {
      warn(warnings, "ruin", `${actor.name} has 0 Ruin; Curtainfall deals 0 bonus damage.`);
    }

    return {
      warnings,
      title: "Death's Design: Curtainfall",
      apply(next, receipt) {
        receipt.ruinSpent = currentRuin;
        receipt.bonusDice = bonusDice;
        receipt.formula = currentRuin > 0 ? bonusDice : null;
        receipt.rollFlavor = "Curtainfall Bonus Damage";
        receipt.rollLabel = "Damage";

        const updates = currentRuin > 0
          ? spendResource(actor, receipt, { pool: "reaperRuin", amount: currentRuin, label: "Ruin" })
          : {};

        receipt.summary = `${actor.name} unleashes Curtainfall against ${targetName}: +${currentRuin}d6 bonus damage. All ${currentRuin} Ruin is expended.${level >= 4 ? ` Crits on ${critThreshold}+ (ignores Physical Resistance).` : ""}`;
        receipt.result = { ruinSpent: currentRuin, bonusDice, critThreshold, targetName };
        return updates;
      }
    };
  },

  /**
   * Fear the Reaper (10th Level, Ch. 3 L3414):
   * Bonus Action. 1/Long Rest. Mark hostile creature with Reaper's Mark for 1 hour.
   * Takes 1d6 Psychic on seeing/hearing Reaper gain Ruin. Senses direction, sees invisible.
   */
  reaperFearTheReaper(actor, state, data) {
    need(isReaper(actor), "Fear the Reaper is a Reaper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Fear the Reaper");

    const poolVal = resourceValue(actor, { pool: "fearTheReaper" });
    if (poolVal < 1) {
      warn(warnings, "fearTheReaper", `Fear the Reaper requires 1 use and 0 remain; requires Long Rest.`);
    }

    const targetName = data.targetName ?? "Hostile Creature";

    return {
      warnings,
      title: "Fear the Reaper",
      apply(next, receipt) {
        receipt.targetName = targetName;
        const updates = spendResource(actor, receipt, { pool: "fearTheReaper", amount: 1, label: "Fear the Reaper" });

        receipt.summary = `${actor.name} marks ${targetName} with Reaper's Mark for 1 hour. Deals 1d6 Psychic on seeing/hearing Ruin gain, senses direction & movement, sees through Invisible.`;
        receipt.result = { targetName };
        return {
          ...updates,
          "flags.ak5e.reaper.reaperMarkTarget": targetName
        };
      }
    };
  },

  /**
   * Memento Mori (17th Level, Ch. 3 L3424):
   * When marked creature takes Psychic damage, choose:
   * 1. Target Vulnerable and ignores DR.
   * 2. Other hostiles within 10 ft take 1d6 Psychic.
   */
  reaperMementoMori(actor, state, data) {
    need(isReaper(actor), "Memento Mori is a Reaper feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Memento Mori");

    const mode = data.mode ?? "vulnerability"; // "vulnerability" or "splash"
    const targetName = flag(actor, "reaper")?.reaperMarkTarget ?? data.targetName ?? "Marked Target";

    return {
      warnings,
      title: "Memento Mori",
      apply(next, receipt) {
        receipt.mode = mode;
        receipt.summary = mode === "vulnerability"
          ? `Memento Mori: ${targetName} is Vulnerable to this psychic damage and ignores DR.`
          : `Memento Mori: psychic agony ripples to other hostile creatures within 10 ft of ${targetName} (1d6 Psychic).`;
        receipt.result = { mode, targetName };
        return {};
      }
    };
  }
};

/**
 * Reaper Table Healing Penalty Hook (Ch. 3 L3340, L3361):
 * When another Creature attempts to restore Hit Points to the Reaper,
 * the amount of Hit Points restored is reduced by the value shown in the
 * "Healing Received" column of the Reaper Table (2 * Ruin, up to 20).
 * Flooring: Healing is reduced to a minimum of 0 (cannot become damage).
 */
export function reaperPreApplyDamageHook(actor, amount, updates, options) {
  if (!isReaper(actor)) return true;

  const currentHp = Number(actor.system?.attributes?.hp?.value ?? 0);
  const newHp = typeof updates?.["system.attributes.hp.value"] === "number" ? updates["system.attributes.hp.value"] : null;
  const isHealing = (typeof amount === "number" && amount < 0) || (newHp !== null && newHp > currentHp) || options?.type === "healing";
  if (!isHealing) return true;

  // Self-healing or local feature exemption
  const isSelf = options?.ak5eSelfHeal || options?.source === actor.id || options?.origin === actor.uuid || options?.subject?.actor?.uuid === actor.uuid;
  if (isSelf) return true;

  const penalty = getReaperHealingPenalty(actor);
  if (penalty <= 0) return true;

  const incomingHeal = typeof amount === "number" && amount < 0
    ? Math.abs(amount)
    : (newHp !== null && newHp > currentHp ? (newHp - currentHp) : 0);

  if (incomingHeal > 0) {
    const netHeal = Math.max(0, incomingHeal - penalty);
    if (updates && "system.attributes.hp.value" in updates) {
      updates["system.attributes.hp.value"] = currentHp + netHeal;
    }
    if (globalThis.ChatMessage?.implementation?.create) {
      ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
        content: `<p><strong>AK5e Reaper: Reaper Table Healing Penalty.</strong> Outside healing was penalized by -${penalty} (Ruin ${getRuin(actor)}). Recovered: ${netHeal} HP (from ${incomingHeal}).</p>`,
        flags: { ak5e: { reaperHealingPenalty: true } }
      }).catch(() => {});
    }
  }
  return true;
}

export function registerReaperHooks() {
  defineReaperPools();

  // Reset Ruin to 0 if actor is reduced to 0 HP (Ch. 3 L3336)
  Hooks.on("updateActor", (actor, diff) => {
    if (!isReaper(actor)) return;
    const hp = actor.system?.attributes?.hp;
    if (hp && typeof hp.value === "number" && hp.value <= 0) {
      const currentRuin = getRuin(actor);
      if (currentRuin > 0) {
        actor.update({ "flags.ak5e.resourcePools.reaperRuin.value": 0 });
      }
    }
  });

  // Healing penalty hook (Ch. 3 L3340, L3361)
  Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
    return reaperPreApplyDamageHook(actor, amount, updates, options);
  });

  // Register plans with guardUses
  guardUses.register({ plans: REAPER_PLANS });
}

guardUses.register({ plans: REAPER_PLANS });
