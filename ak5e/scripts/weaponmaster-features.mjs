/**
 * Weaponmaster subclass features (Ch. 3 L3438-3510):
 * Art of War (Additional Fighting Style swappable on LR, Light & Heavy Ranged proficiency, Martial Mastery table),
 * Dualstrike (Fast Hands: extra draw/stow object interaction, Steelwind: TWF attack as part of Attack action),
 * Judgement Cut (4th Level: 1/SR mark tracks weapon damage for 2 turns; on end deals half as Slashing damage),
 * A Master's Weapon (10th Level: Signature Weapon gains +1 attack/damage, Every Part of the Weapon swaps mastery as BA),
 * Untouchable (13th Level: 2/LR Reaction melee strike when attacked; if deals damage, enemy attack automatically misses),
 * Song of Steel (17th Level: 1/LR 1-minute stance for +1 crit range, crits ignore Physical DR, advantage with Signature Weapon).
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch,
  FIGHTING_STYLES as GUARD_FIGHTING_STYLES
} from "./guard-rules.mjs";
import { FIGHTING_STYLES as MARKSMAN_FIGHTING_STYLES } from "./marksman-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { spendReaction, getReactions, refundReaction } from "./trigger-events.mjs";
import { need, values, flag } from "./operation-kernel.mjs";

export const isWeaponmaster = actor => Boolean(guardEnabled(actor) && guardBranch(actor) === "weaponmaster");

export const WEAPONMASTER_FIGHTING_STYLES = Object.freeze({
  ...GUARD_FIGHTING_STYLES,
  ...MARKSMAN_FIGHTING_STYLES
});

/**
 * Checks if a Weaponmaster is proficient with a weapon.
 * Art of War grants proficiency with all Light Ranged and Heavy Ranged weapons,
 * in addition to all Melee weapons from the base Guard class.
 */
export function isWeaponmasterProficient(actor, item) {
  if (!item || !isWeaponmaster(actor)) return false;
  return item.type === "weapon";
}

/**
 * Returns read-only view of Weaponmaster status and features.
 */
export function getWeaponmasterView(actor) {
  if (!isWeaponmaster(actor)) return null;
  const wmFlag = flag(actor, "weaponmaster") ?? {};
  return {
    isWeaponmaster: true,
    signatureWeaponId: wmFlag.signatureWeaponId ?? null,
    songOfSteelActive: Boolean(wmFlag.songOfSteelActive),
    additionalFightingStyle: wmFlag.additionalFightingStyle ?? null,
    fastHands: true,
    steelwind: true,
    weaponProficiencies: ["All Light Ranged Weapons", "All Heavy Ranged Weapons"],
    judgementCut: getPool(actor, "judgementCut"),
    untouchable: getPool(actor, "untouchable"),
    songOfSteel: getPool(actor, "songOfSteel")
  };
}

export const MARTIAL_MASTERY_TABLE = Object.freeze({
  canOpener: {
    name: "Can Opener",
    weapons: ["crossbow", "hammer", "heavy crossbow", "heavy hammer", "rifle"],
    effect: "When you hit a creature with Physical DR, deals an additional 1d6 damage."
  },
  cornering: {
    name: "Cornering",
    weapons: ["bow", "greatbow", "machine gun", "nailgun"],
    effect: "When you hit a creature, its Speed is reduced by 5 feet until the end of their next turn."
  },
  drive: {
    name: "Drive",
    weapons: ["spear", "polearm", "whip"],
    effect: "When you hit a creature, you can move it up to 10 feet in a direction of your choice (no AoO)."
  },
  executioner: {
    name: "Executioner",
    weapons: ["knife", "shotgun"],
    effect: "When you hit a creature that has Incapacitated or Prone condition, deals an additional 2d6 damage."
  },
  flourish: {
    name: "Flourish",
    weapons: ["sword", "greatsword", "heavy throwing disc", "throwing disc"],
    effect: "When you miss with an attack, roll 1d6 and add to result (potentially turning miss into hit; 1/turn on hit)."
  },
  lethality: {
    name: "Lethality",
    weapons: ["axe", "greataxe", "hand crossbow", "handgun"],
    effect: "When you hit a creature that does not have any Physical DR, deals an additional 1d6 damage."
  }
});

/**
 * Determine default Martial Mastery property for a weapon item.
 */
export function getWeaponMasteryProperty(item) {
  if (!item) return null;
  const base = String(item.system?.type?.baseItem ?? item.system?.baseItem ?? "").toLowerCase();
  const name = String(item.name ?? "").toLowerCase();

  for (const [key, prop] of Object.entries(MARTIAL_MASTERY_TABLE)) {
    if (prop.weapons.some(w => base === w || name.includes(w))) {
      return key;
    }
  }
  return null;
}

export function defineWeaponmasterPools() {
  if (!getPoolDefinition("judgementCut")) {
    definePool({
      id: "judgementCut",
      label: "Judgement Cut",
      max: 1,
      min: 0,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isWeaponmaster(actor) && (guardLevel(actor) ?? 1) >= 4,
      recovery: [{ on: "sr", amount: "toMax" }, { on: "lr", amount: "toMax" }]
    });
  }

  if (!getPoolDefinition("untouchable")) {
    definePool({
      id: "untouchable",
      label: "Untouchable",
      max: 2,
      min: 0,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isWeaponmaster(actor) && (guardLevel(actor) ?? 1) >= 13,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }

  if (!getPoolDefinition("songOfSteel")) {
    definePool({
      id: "songOfSteel",
      label: "Song of Steel",
      max: 1,
      min: 0,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isWeaponmaster(actor) && (guardLevel(actor) ?? 1) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Weaponmaster level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Weaponmaster Plans */

export const WEAPONMASTER_PLANS = {
  /**
   * Judgement Cut (4th Level, Ch. 3 L3486):
   * Bonus Action on melee hit: mark creature. Lasts 2 turns or until weapon stowed.
   * Tracks accumulated weapon damage dealt to that creature.
   * When mark ends: deals Slashing damage equal to half of accumulated weapon damage.
   */
  weaponmasterJudgementCut(actor, state, data) {
    need(isWeaponmaster(actor), "Judgement Cut is a Weaponmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Judgement Cut");

    const poolVal = resourceValue(actor, { pool: "judgementCut" });
    if (poolVal < 1) {
      warn(warnings, "judgementCut", `Judgement Cut requires 1 use and 0 remain; requires Short or Long Rest.`);
    }

    const targetName = data.targetName ?? "Hit Creature";

    return {
      warnings,
      title: "Judgement Cut: Mark",
      apply(next, receipt) {
        receipt.targetName = targetName;
        const updates = spendResource(actor, receipt, { pool: "judgementCut", amount: 1, label: "Judgement Cut" });
        receipt.summary = `${actor.name} marks ${targetName} for Judgement Cut (2 turns or until weapon stowed; deals half of total weapon damage dealt).`;
        receipt.result = { targetName };
        return {
          ...updates,
          "flags.ak5e.weaponmaster.judgementCut": {
            active: true,
            targetName,
            accumulatedDamage: 0,
            turnActivated: globalThis.game?.combat?.turn ?? 0,
            roundActivated: globalThis.game?.combat?.round ?? 0
          }
        };
      }
    };
  },

  /**
   * Detonate / End Judgement Cut (4th Level, Ch. 3 L3486):
   * Deals half accumulated damage as Slashing damage.
   */
  weaponmasterDetonateJudgementCut(actor, state, data) {
    need(isWeaponmaster(actor), "Judgement Cut is a Weaponmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Judgement Cut");

    const jc = flag(actor, "weaponmaster")?.judgementCut;
    const targetName = jc?.targetName ?? data.targetName ?? "Marked Creature";
    const totalDamage = Number(data.totalDamage ?? jc?.accumulatedDamage ?? 0);
    const detonationDamage = Math.floor(totalDamage / 2);

    return {
      warnings,
      title: "Judgement Cut: Detonate",
      apply(next, receipt) {
        receipt.targetName = targetName;
        receipt.totalDamage = totalDamage;
        receipt.detonationDamage = detonationDamage;
        receipt.summary = `${actor.name} concludes Judgement Cut against ${targetName}: ${totalDamage} total damage dealt -> ${detonationDamage} Slashing Damage dealt.`;
        receipt.result = { targetName, totalDamage, detonationDamage };
        return {
          "flags.ak5e.weaponmaster.judgementCut": null
        };
      }
    };
  },

  /**
   * Set Signature Weapon (10th Level, Ch. 3 L3491):
   * Long Rest Action: familiarise with weapon in possession.
   */
  weaponmasterSetSignatureWeapon(actor, state, data) {
    need(isWeaponmaster(actor), "A Master's Weapon is a Weaponmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "A Master's Weapon");

    const weaponId = data.weaponId;
    const weaponName = data.weaponName ?? "Selected Weapon";
    need(weaponId, "Select a weapon in possession to be your Signature Weapon.");

    return {
      warnings,
      title: "Designate Signature Weapon",
      apply(next, receipt) {
        receipt.weaponId = weaponId;
        receipt.weaponName = weaponName;
        receipt.summary = `${actor.name} completes Long Rest training designating ${weaponName} as their Signature Weapon (+1 Attack/Damage, Every Part of the Weapon).`;
        receipt.result = { weaponId, weaponName };
        return {
          "flags.ak5e.weaponmaster.signatureWeaponId": weaponId,
          "flags.ak5e.weaponmaster.signatureWeaponName": weaponName
        };
      }
    };
  },

  /**
   * Every Part of the Weapon (10th Level, Ch. 3 L3493):
   * Bonus Action to change Martial Mastery on Signature Weapon until end of turn.
   */
  weaponmasterEveryPartOfTheWeapon(actor, state, data) {
    need(isWeaponmaster(actor), "Every Part of the Weapon is a Weaponmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Every Part of the Weapon");

    const newPropertyKey = data.propertyKey;
    need(MARTIAL_MASTERY_TABLE[newPropertyKey], "Choose a valid Martial Mastery property.");
    const prop = MARTIAL_MASTERY_TABLE[newPropertyKey];
    const signatureName = flag(actor, "weaponmaster")?.signatureWeaponName ?? "Signature Weapon";

    return {
      warnings,
      title: "Every Part of the Weapon",
      apply(next, receipt) {
        receipt.propertyKey = newPropertyKey;
        receipt.summary = `As a Bonus Action, ${actor.name} shifts their grip on ${signatureName}, changing its Martial Mastery effect to ${prop.name} (${prop.effect}) until end of turn.`;
        receipt.result = { propertyKey: newPropertyKey, propertyName: prop.name };
        return {
          "flags.ak5e.weaponmaster.activeMasteryOverride": newPropertyKey
        };
      }
    };
  },

  /**
   * Untouchable (13th Level, Ch. 3 L3496):
   * Reaction when creature in reach attacks you. Make melee attack.
   * If deals damage, attacker's attack automatically misses! (2/LR).
   */
  weaponmasterUntouchable(actor, state, data) {
    need(isWeaponmaster(actor), "Untouchable is a Weaponmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 13, "Untouchable");

    const poolVal = resourceValue(actor, { pool: "untouchable" });
    if (poolVal < 1) {
      warn(warnings, "untouchable", `Untouchable requires 1 use and 0 remain; requires Long Rest.`);
    }

    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    const attackerName = data.attackerName ?? "Attacker";

    return {
      warnings,
      title: "Untouchable",
      async apply(next, receipt) {
        receipt.attackerName = attackerName;
        const updates = spendResource(actor, receipt, { pool: "untouchable", amount: 1, label: "Untouchable" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-untouchable`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId: `${receipt.id}-untouchable` };
        receipt.summary = `Untouchable: ${actor.name} makes a melee attack against ${attackerName} as a Reaction. If it deals damage, attacker's attack automatically misses!`;
        receipt.result = { attackerName, reactionSpent: rx.ok };
        return updates;
      }
    };
  },

  /**
   * Song of Steel (17th Level, Ch. 3 L3503):
   * Bonus Action 1/Long Rest. Duration 1 minute:
   * +1 Critical Range, Crits ignore Physical Resistance, Advantage with Signature Weapon.
   */
  weaponmasterSongOfSteel(actor, state, data) {
    need(isWeaponmaster(actor), "Song of Steel is a Weaponmaster feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Song of Steel");

    const poolVal = resourceValue(actor, { pool: "songOfSteel" });
    if (poolVal < 1) {
      warn(warnings, "songOfSteel", `Song of Steel requires 1 use and 0 remain; requires Long Rest.`);
    }

    return {
      warnings,
      title: "Song of Steel",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "songOfSteel", amount: 1, label: "Song of Steel" });
        receipt.summary = `Song of Steel (1 Minute): +1 Critical Range, Crits ignore Physical Damage Resistance, Advantage with Signature Weapon.`;
        receipt.result = { active: true };
        return {
          ...updates,
          "flags.ak5e.weaponmaster.songOfSteelActive": true
        };
      }
    };
  },

  /**
   * Swap Additional Fighting Style (1st Level Art of War, Ch. 3 L3442).
   * Weaponmaster can exchange their additional Fighting Style whenever completing a Long Rest.
   */
  weaponmasterSwapFightingStyle(actor, state, data) {
    need(isWeaponmaster(actor), "Swap Fighting Style is a Weaponmaster feature.");
    const warnings = [];
    const newStyle = data.styleKey ?? data.style;
    if (!newStyle || !WEAPONMASTER_FIGHTING_STYLES[newStyle]) {
      warn(warnings, "style", `Invalid or missing Fighting Style key: ${newStyle}`);
    }
    const currentStyle = flag(actor, "weaponmaster")?.additionalFightingStyle ?? null;
    const styleDef = WEAPONMASTER_FIGHTING_STYLES[newStyle];
    return {
      warnings,
      title: "Swap Fighting Style",
      apply(next, receipt) {
        receipt.previousStyle = currentStyle;
        receipt.newStyle = newStyle;
        receipt.summary = `${actor.name} exchanges Art of War Fighting Style: now ${styleDef?.name ?? newStyle}.`;
        receipt.result = { previousStyle: currentStyle, newStyle };
        return {
          "flags.ak5e.weaponmaster.additionalFightingStyle": newStyle
        };
      }
    };
  },

  /**
   * Steelwind (1st Level Dualstrike, Ch. 3 L3472):
   * When taking the Attack Action wielding two weapons capable of TWF,
   * make the additional TWF attack as part of that Action (no Bonus Action required).
   */
  weaponmasterSteelwind(actor, state, data) {
    need(isWeaponmaster(actor), "Steelwind is a Weaponmaster Dualstrike feature.");
    const warnings = [];
    return {
      warnings,
      title: "Steelwind (Dualstrike)",
      apply(next, receipt) {
        receipt.summary = `${actor.name} executes Steelwind: makes the additional Two-Weapon Fighting attack as part of the Attack Action (Bonus Action preserved).`;
        receipt.result = { attackMade: true, preservedBonusAction: true };
        return {};
      }
    };
  }
};

export function weaponmasterPreRollAttack(item, config) {
  const actor = item?.actor;
  if (!isWeaponmaster(actor)) return;

  const signatureWeaponId = flag(actor, "weaponmaster")?.signatureWeaponId;
  const isSignature = item.id === signatureWeaponId;
  const songOfSteel = flag(actor, "weaponmaster")?.songOfSteelActive;

  if (isSignature) {
    // In Trained Hands (+1 attack bonus)
    config.bonus = (config.bonus ? `${config.bonus} + ` : "") + "1";
  }

  if (songOfSteel && isSignature) {
    config.advantage = true;
  }
}

export function weaponmasterPreRollDamage(item, config) {
  const actor = item?.actor;
  if (!isWeaponmaster(actor)) return;

  const signatureWeaponId = flag(actor, "weaponmaster")?.signatureWeaponId;
  if (item.id === signatureWeaponId) {
    // In Trained Hands (+1 damage bonus)
    config.bonus = (config.bonus ? `${config.bonus} + ` : "") + "1";
  }
}

export function registerWeaponmasterHooks() {
  defineWeaponmasterPools();

  // Attack and Damage roll modifications for Signature Weapon & Song of Steel
  Hooks.on("dnd5e.preRollAttack", (item, config) => weaponmasterPreRollAttack(item, config));
  Hooks.on("dnd5e.preRollDamage", (item, config) => weaponmasterPreRollDamage(item, config));

  // Register plans with guardUses
  guardUses.register({ plans: WEAPONMASTER_PLANS });
}

guardUses.register({ plans: WEAPONMASTER_PLANS });
