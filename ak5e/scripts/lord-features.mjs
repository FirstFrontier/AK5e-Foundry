/**
 * Lord subclass features (Ch. 3 L3109–3248):
 * Authoritative (Overruled saves, Position of Power / Authority state, Manifest Destiny),
 * Manifest Will (Manifestation pool @prof, 30-ft melee range, STR ranged scaling, +CHA damage, Will Attunement, Authority Marks),
 * King's Domain (4th Level: Castle Doctrine, Pursuit of Power),
 * By Lordly Decree (10th Level: Make It So, Press the Attack: A Leader Leads),
 * Force of Will (13th Level: PB/LR uses, 3 damage element groups: 3d6 burst, 8d6 line, 6d6 melee hit),
 * Divine Right (17th Level: Mark splash, Castle Doctrine WIS save, Pursuit of Power aura, Make It So reroll).
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
import { spendReaction, getReactions, refundReaction } from "./trigger-events.mjs";
import { need, flag, values } from "./operation-kernel.mjs";

/** Whether the given Actor is an active Guard with the Lord subclass. */
export const isLord = actor => Boolean(guardEnabled(actor) && guardBranch(actor) === "lord");

/** Whether the given Actor is eligible for the Force of Will pool (level >= 13). */
export const hasForceOfWill = actor => Boolean(isLord(actor) && (guardLevel(actor) ?? 1) >= 13);

/** Defines Manifestation (@prof uses) and Force of Will (@prof uses at 13th level) pools. */
export function defineLordPools() {
  defineGuardPools();
  if (!getPoolDefinition("manifestation")) {
    definePool({
      id: "manifestation",
      label: "Manifestation",
      max: "@prof",
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isLord(actor),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("forceOfWill")) {
    definePool({
      id: "forceOfWill",
      label: "Force of Will",
      max: "@prof",
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isLord(actor) && (guardLevel(actor) ?? 1) >= 13,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

/** Check if the actor currently holds Authority. */
export function hasAuthority(actor) {
  return Boolean(flag(actor, "guard")?.lord?.hasAuthority ?? flag(actor, "lord")?.hasAuthority);
}

/** Check if Manifestation is currently active on the actor. */
export function isManifestationActive(actor) {
  const manif = flag(actor, "guard")?.lord?.manifestation ?? flag(actor, "lord")?.manifestation;
  return Boolean(manif?.active);
}

/** Returns the current Manifestation damage type (default "force"). */
export function manifestationDamageType(actor) {
  return String(
    flag(actor, "guard")?.lord?.manifestationDamageType ??
    flag(actor, "lord")?.manifestationDamageType ??
    "force"
  ).toLowerCase();
}

/** Returns the active King's Domain mode ("castle" or "pursuit"), or null if inactive/unselected. */
export function kingsDomainMode(actor) {
  const manif = flag(actor, "guard")?.lord?.manifestation ?? flag(actor, "lord")?.manifestation;
  return manif?.domainMode ?? null;
}

/** Returns true if an ability is eligible for Overruled saves (INT, WIS, CHA). */
export function isOverruledEligible(ability) {
  return ["int", "wis", "cha"].includes(String(ability).toLowerCase());
}

/** Force of Will damage category matrix (Ch. 3 L3215–3220). */
export const FORCE_OF_WILL_CATEGORIES = Object.freeze({
  group1: Object.freeze(["fire", "psychic", "force", "thunder"]),
  group2: Object.freeze(["bludgeoning", "piercing", "slashing", "radiant"]),
  group3: Object.freeze(["acid", "cold", "lightning", "necrotic", "poison"])
});

/** Returns the Force of Will configuration for a given damage type. */
export function forceOfWillCategory(damageType = "force") {
  const type = String(damageType).toLowerCase();
  if (FORCE_OF_WILL_CATEGORIES.group1.includes(type)) {
    return {
      group: 1,
      name: "Explosive Surge",
      area: "10-foot burst",
      trigger: "weaponHit",
      saveType: "dex",
      dice: "3d6",
      description: "Creatures within 10 feet of target must make a DEX save vs Martial DC or take 3d6 damage (half on save)."
    };
  }
  if (FORCE_OF_WILL_CATEGORIES.group2.includes(type)) {
    return {
      group: 2,
      name: "Slash of Arts Energy",
      area: "50-foot line (5-foot wide)",
      trigger: "action",
      saveType: "dex",
      dice: "8d6",
      description: "Creatures in a 50-ft long, 5-ft wide line must make a DEX save vs Martial DC or take 8d6 damage (half on save)."
    };
  }
  if (FORCE_OF_WILL_CATEGORIES.group3.includes(type)) {
    return {
      group: 3,
      name: "Mortal Blow",
      area: "singleTarget",
      trigger: "meleeHit",
      saveType: "con",
      dice: "6d6",
      description: "Target creature must make a CON save vs Martial DC or take 6d6 damage (half on save)."
    };
  }
  return {
    group: 1,
    name: "Explosive Surge",
    area: "10-foot burst",
    trigger: "weaponHit",
    saveType: "dex",
    dice: "3d6",
    description: "Creatures within 10 feet of target must make a DEX save vs Martial DC or take 3d6 damage (half on save)."
  };
}

/**
 * Calculates Make It So bonus breakdown.
 * Base: Adds CHA mod, treated as proficient (+PB).
 * Authority: If already proficient, treated as having Expertise (+2*PB).
 */
export function makeItSoBonus(actor, { isProficient = false, normalMod = 0, hasAuth = null } = {}) {
  const chaMod = Number(actor.system?.abilities?.cha?.mod ?? 0);
  const pb = Number(actor.system?.attributes?.prof ?? 2);
  const authority = hasAuth ?? hasAuthority(actor);

  const effectivePB = (authority || isProficient) ? 2 * pb : pb;
  const netBonus = chaMod + effectivePB - normalMod;
  return {
    chaMod,
    pb,
    effectivePB,
    expertise: authority || isProficient,
    netBonus
  };
}

/** Retrieves a Lord Mark ("ranged" or "melee") on a target creature. */
export function getLordMark(actor, targetOrUuid) {
  const uuid = typeof targetOrUuid === "string" ? targetOrUuid : (targetOrUuid?.uuid ?? targetOrUuid?.id);
  if (!uuid) return null;
  const marks = flag(actor, "guard")?.lord?.marks ?? flag(actor, "lord")?.marks;
  if (marks?.[uuid]) return marks[uuid];
  if (typeof targetOrUuid === "object" && targetOrUuid?.flags?.ak5e?.lordMark) {
    return targetOrUuid.flags.ak5e.lordMark;
  }
  return null;
}

/** Returns updates setting a Lord Mark on a target. */
export function setLordMark(actor, targetOrUuid, markType) {
  const uuid = typeof targetOrUuid === "string" ? targetOrUuid : (targetOrUuid?.uuid ?? targetOrUuid?.id);
  if (!uuid) return {};
  const currentMarks = {
    ...(flag(actor, "lord")?.marks ?? {}),
    ...(flag(actor, "guard")?.lord?.marks ?? {})
  };
  currentMarks[uuid] = markType;
  return {
    "flags.ak5e.lord.marks": currentMarks,
    "flags.ak5e.guard.lord.marks": currentMarks
  };
}

/** Returns updates clearing a Lord Mark from a target. */
export function clearLordMark(actor, targetOrUuid) {
  const uuid = typeof targetOrUuid === "string" ? targetOrUuid : (targetOrUuid?.uuid ?? targetOrUuid?.id);
  if (!uuid) return {};
  const currentMarks = {
    ...(flag(actor, "lord")?.marks ?? {}),
    ...(flag(actor, "guard")?.lord?.marks ?? {})
  };
  delete currentMarks[uuid];
  return {
    "flags.ak5e.lord.marks": currentMarks,
    "flags.ak5e.guard.lord.marks": currentMarks
  };
}

/* ---------------------------------------------------------------- Lord Plans */

export const LORD_PLANS = {
  /**
   * Authority toggle (gain or loss).
   * Gain triggers: Elite/Leader kill damaged since last turn, 2+ kills in turn, 1-shot full HP kill.
   * Loss triggers: 0 HP, end-of-turn save affliction, Prone at end of turn, Initiative roll.
   */
  toggleAuthority(actor, state, data) {
    need(isLord(actor), "Authority is a Lord feature.");
    const active = Boolean(data.active);
    const reason = data.reason ?? (active ? "gain" : "loss");

    return {
      warnings: [],
      title: active ? "Gain Authority" : "Lose Authority",
      apply(next, receipt) {
        const updates = {
          "flags.ak5e.lord.hasAuthority": active,
          "flags.ak5e.guard.lord.hasAuthority": active
        };

        receipt.summary = active
          ? `${actor.name} gains Authority (${reason})! Position of Power active (1d8 turn-start THP, Overruled saves).`
          : `${actor.name} loses Authority (${reason}).`;
        receipt.result = { hasAuthority: active, reason };

        return updates;
      }
    };
  },

  /**
   * Position of Power: Turn-start 1d8 Temporary HP while holding Authority.
   */
  authorityTurnStartTHP(actor, state, data) {
    need(isLord(actor), "Authority is a Lord feature.");
    const warnings = [];
    if (!hasAuthority(actor)) {
      warn(warnings, "authority", "Gaining 1d8 Temporary Hit Points requires Authority.");
    }

    return {
      warnings,
      title: "Authority: Position of Power (Turn Start)",
      formula: "1d8",
      rollLabel: "Temporary Hit Points",
      apply(next, receipt) {
        receipt.formula = "1d8";
        receipt.summary = `${actor.name} invokes Position of Power at the start of their turn to gain 1d8 Temporary Hit Points.`;
        receipt.result = { formula: "1d8", hasAuthority: true };
        return {};
      }
    };
  },

  /**
   * Press the Attack: Manifest Destiny (3 Aggression).
   * Used when Authority would be lost to prevent losing Authority.
   */
  manifestDestiny(actor, state, data) {
    need(isLord(actor), "Manifest Destiny is a Lord feature.");
    const warnings = [];

    const aggPool = getPool(actor, "aggression");
    if (!aggPool || aggPool.value < 3) {
      warn(warnings, "aggression", `Manifest Destiny requires 3 Aggression; character has ${aggPool?.value ?? 0}.`);
    }

    return {
      warnings,
      title: "Press the Attack: Manifest Destiny",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, {
          pool: "aggression",
          amount: 3,
          label: "Aggression"
        });

        updates["flags.ak5e.lord.hasAuthority"] = true;
        updates["flags.ak5e.guard.lord.hasAuthority"] = true;

        receipt.summary = `${actor.name} expends 3 Aggression to invoke Manifest Destiny, retaining Authority!`;
        receipt.result = { retained: true, hasAuthority: true };

        return updates;
      }
    };
  },

  /**
   * Manifest Will: Spends 1 Manifestation use, activates 1-minute state.
   * Mode selection: King's Domain mode ("castle" or "pursuit").
   */
  manifestWill(actor, state, data) {
    need(isLord(actor), "Manifest Will is a Lord feature.");
    const warnings = [];

    const manifPool = getPool(actor, "manifestation");
    if (!manifPool || manifPool.value < 1) {
      warn(warnings, "manifestation", "Manifest Will requires 1 Manifestation use.");
    }

    const level = guardLevel(actor) ?? 1;
    const chosenMode = data.mode ?? "castle";
    if (level < 4 && data.mode) {
      warn(warnings, "level", "King's Domain modes (Castle Doctrine and Pursuit of Power) require Guard level 4.");
    }

    return {
      warnings,
      title: "Manifest Will",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, {
          pool: "manifestation",
          amount: 1,
          label: "Manifestation"
        });

        const mode = level >= 4 ? chosenMode : null;
        const manifState = {
          active: true,
          duration: 60,
          domainMode: mode,
          startedAt: Date.now()
        };

        updates["flags.ak5e.lord.manifestation"] = manifState;
        updates["flags.ak5e.guard.lord.manifestation"] = manifState;

        receipt.summary = `${actor.name} manifests their Will for 1 minute${mode ? ` (Domain: ${mode === "castle" ? "Castle Doctrine" : "Pursuit of Power"})` : ""}. Melee weapons gain Range (30/-), use STR for ranged attack and damage rolls, and add +CHA modifier Force damage.`;
        receipt.result = { manifestation: manifState };

        return updates;
      }
    };
  },

  /**
   * Will Attunement (10-minute Ritual):
   * Changes Manifestation damage type to an owned Operator Skill damage type.
   */
  willAttunement(actor, state, data) {
    need(isLord(actor), "Will Attunement is a Lord feature.");
    const damageType = String(data.damageType ?? "force").toLowerCase();

    return {
      warnings: [],
      title: "Will Attunement (10-minute Ritual)",
      apply(next, receipt) {
        const prevType = manifestationDamageType(actor);
        const updates = {
          "flags.ak5e.lord.manifestationDamageType": damageType,
          "flags.ak5e.guard.lord.manifestationDamageType": damageType
        };

        receipt.summary = `${actor.name} completes a 10-minute Will Attunement ritual, changing Manifestation damage type from ${prevType} to ${damageType}.`;
        receipt.result = { damageType, previousDamageType: prevType };

        return updates;
      }
    };
  },

  /**
   * By Lordly Decree: Make It So (10th Level).
   * Spends 1 Manifestation use to add CHA mod to d20 roll, treated as Proficient.
   * With Authority: treated as having Expertise (+2*PB).
   * At 17th level: reroll once on failure.
   */
  makeItSo(actor, state, data) {
    need(isLord(actor), "Make It So is a Lord feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (level < 10) {
      warn(warnings, "level", `Make It So is a Lord level 10 feature; character is level ${level}.`);
    }

    const manifPool = getPool(actor, "manifestation");
    if (!manifPool || manifPool.value < 1) {
      warn(warnings, "manifestation", "Make It So requires 1 Manifestation use.");
    }

    const rollType = data.rollType ?? "check";
    const ability = data.ability ?? "str";
    const isProficient = Boolean(data.isProficient);
    const auth = hasAuthority(actor);
    const bonusInfo = makeItSoBonus(actor, { isProficient, normalMod: Number(data.normalMod) || 0, hasAuth: auth });

    return {
      warnings,
      title: "Make It So",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, {
          pool: "manifestation",
          amount: 1,
          label: "Manifestation"
        });

        receipt.summary = `${actor.name} expends 1 Manifestation use to invoke Make It So on a ${rollType} roll, substituting CHA modifier (+${bonusInfo.chaMod}) and gaining ${bonusInfo.expertise ? "Expertise (+2*PB)" : "Proficiency (+PB)"}.`;
        receipt.result = {
          rollType,
          ability,
          bonusInfo,
          rerollAllowed: level >= 17
        };
        return updates;
      }
    };
  },

  /**
   * Press the Attack: A Leader Leads (10th Level).
   * Spends 1+ Aggression on Authority gain to grant Special Inspiration to allies (1 minute).
   */
  aLeaderLeads(actor, state, data) {
    need(isLord(actor), "A Leader Leads is a Lord feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (level < 10) {
      warn(warnings, "level", `A Leader Leads is a Lord level 10 feature; character is level ${level}.`);
    }

    const aggressionSpent = Math.max(1, Number(data.aggression) || 1);
    const aggPool = getPool(actor, "aggression");
    if (!aggPool || aggPool.value < aggressionSpent) {
      warn(warnings, "aggression", `A Leader Leads requires ${aggressionSpent} Aggression; character has ${aggPool?.value ?? 0}.`);
    }

    const targets = Array.isArray(data.targetUuids) ? data.targetUuids : (data.targetUuid ? [data.targetUuid] : []);
    if (targets.length > aggressionSpent) {
      warn(warnings, "targetCount", `Can inspire at most ${aggressionSpent} allies with ${aggressionSpent} Aggression spent.`);
    }

    return {
      warnings,
      title: "Press the Attack: A Leader Leads",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, {
          pool: "aggression",
          amount: aggressionSpent,
          label: "Aggression"
        });

        receipt.summary = `${actor.name} expends ${aggressionSpent} Aggression to grant Special Inspiration (1 minute) to ${targets.length} ally/allies.`;
        receipt.result = { aggressionSpent, targets };

        for (const targetUuid of targets) {
          receipt.targets = [...(receipt.targets ?? []), {
            uuid: targetUuid,
            kind: "effect",
            name: "Special Inspiration",
            data: {
              duration: 60,
              source: actor.uuid,
              label: "Special Inspiration"
            }
          }];
        }

        return updates;
      }
    };
  },

  /**
   * Force of Will (13th Level): Spends 1 Force of Will use, 1/turn.
   * Group 1 (Fire/Psychic/Force/Thunder): 10-ft burst 3d6 DEX save vs Martial DC.
   * Group 2 (Bludgeoning/Piercing/Slashing/Radiant): 50-ft line 8d6 DEX save vs Martial DC.
   * Group 3 (Acid/Cold/Lightning/Necrotic/Poison): Melee hit rider 6d6 CON save vs Martial DC.
   */
  forceOfWill(actor, state, data) {
    need(isLord(actor), "Force of Will is a Lord feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (level < 13) {
      warn(warnings, "level", `Force of Will is a Lord level 13 feature; character is level ${level}.`);
    }

    const fowPool = getPool(actor, "forceOfWill");
    if (!fowPool || fowPool.value < 1) {
      warn(warnings, "forceOfWill", "Force of Will requires 1 Force of Will use.");
    }

    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const lastUsedTurn = state.data?.forceOfWillTurn;
    if (currentTurnKey && lastUsedTurn === currentTurnKey) {
      warn(warnings, "frequency", "Force of Will has already been used this Turn.");
    }

    const damageType = manifestationDamageType(actor);
    const category = forceOfWillCategory(damageType);
    const mDC = martialDC(actor);

    return {
      warnings,
      title: `Force of Will: ${category.name}`,
      formula: category.dice,
      rollLabel: `${category.name} (${damageType})`,
      dc: mDC,
      saveType: category.saveType,
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, {
          pool: "forceOfWill",
          amount: 1,
          label: "Force of Will"
        });

        next.data ??= {};
        next.data.forceOfWillTurn = currentTurnKey;

        receipt.formula = category.dice;
        receipt.dc = mDC;
        receipt.saveType = category.saveType;
        receipt.summary = `${actor.name} expends 1 Force of Will use: ${category.name} (${category.area}) dealing ${category.dice} ${damageType} damage (DC ${mDC} ${category.saveType.toUpperCase()} save for half).`;
        receipt.result = {
          damageType,
          category,
          dc: mDC
        };

        return updates;
      }
    };
  },

  /**
   * King's Domain: Castle Doctrine (4th Level).
   * 15-ft zone. Reaction move half speed and melee attack, refund reaction on non-elite hit.
   * Authority reduces target speed by half (or WIS save vs Martial DC for speed 0 at 17th level).
   */
  castleDoctrine(actor, state, data) {
    need(isLord(actor), "Castle Doctrine is a Lord feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (level < 4) {
      warn(warnings, "level", `Castle Doctrine requires Guard level 4; character is level ${level}.`);
    }

    const reactions = getReactions(actor);
    if (!reactions.available) {
      warn(warnings, "reaction", "Castle Doctrine requires a Reaction, but no Reaction is available.");
    }

    const nonEliteHit = Boolean(data.nonEliteHit);
    const auth = hasAuthority(actor);
    const mDC = martialDC(actor);

    return {
      warnings,
      title: "King's Domain: Castle Doctrine",
      apply: async (next, receipt) => {
        const updates = {};
        const reactionSpend = await spendReaction(actor, {
          triggerId: `${receipt.id}-castleDoctrine`,
          receipt: receipt.id
        });
        receipt.reaction = {
          spent: Boolean(reactionSpend?.ok),
          receiptId: receipt.id,
          refunded: false
        };

        let refunded = false;
        if (nonEliteHit) {
          const refRes = await refundReaction(actor, { receipt: receipt.id });
          if (!refRes?.ok) {
            await refundReaction(actor, { pool: "base" });
          }
          receipt.reaction.refunded = true;
          refunded = true;
        }

        receipt.summary = `${actor.name} reacts with Castle Doctrine: moves up to half Speed towards hostile creature and makes a Melee Attack.${refunded ? " (Hit non-elite: Reaction refunded!)" : ""}${auth ? (level >= 17 ? ` (Divine Right: Target must make DC ${mDC} WIS save: speed 0 on fail, halved on save)` : " (Authority: Target speed halved until end of their turn)") : ""}`;
        receipt.result = {
          refunded,
          hasAuthority: auth,
          speedReduced: auth,
          dc: level >= 17 ? mDC : null
        };

        return updates;
      }
    };
  },

  /**
   * King's Domain: Pursuit of Power (4th Level).
   * 1/turn on hit, full movement without AoO, 2x jump. Authority removes 1/turn limit.
   * At 17th level: passive CHA damage to adjacent foes (within 5 ft).
   */
  pursuitOfPower(actor, state, data) {
    need(isLord(actor), "Pursuit of Power is a Lord feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (level < 4) {
      warn(warnings, "level", `Pursuit of Power requires Guard level 4; character is level ${level}.`);
    }

    const auth = hasAuthority(actor);
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    const lastUsedTurn = state.data?.pursuitOfPowerTurn;

    if (!auth && currentTurnKey && lastUsedTurn === currentTurnKey) {
      warn(warnings, "frequency", "Pursuit of Power is limited to once per Turn without Authority.");
    }

    const chaMod = Number(actor.system?.abilities?.cha?.mod ?? 0);
    const damageType = manifestationDamageType(actor);

    return {
      warnings,
      title: "King's Domain: Pursuit of Power",
      apply(next, receipt) {
        next.data ??= {};
        next.data.pursuitOfPowerTurn = currentTurnKey;

        receipt.summary = `${actor.name} moves up to full Speed without provoking Opportunity Attacks, jump distance doubled.${auth ? " (Authority: Unlimited per turn)" : ""}${level >= 17 ? ` (Divine Right: Creatures passed within 5 ft take ${chaMod} ${damageType} damage)` : ""}`;
        receipt.result = {
          unlimited: auth,
          auraDamage: level >= 17 ? chaMod : 0,
          damageType
        };

        return {};
      }
    };
  },

  /**
   * Divine Right (17th Level):
   * Upgrades Authority features (Mark splash, Castle Doctrine WIS save, Pursuit aura, Make It So reroll).
   */
  divineRight(actor, state, data) {
    need(isLord(actor), "Divine Right is a Lord feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    if (level < 17) {
      warn(warnings, "level", `Divine Right requires Guard level 17; character is level ${level}.`);
    }

    return {
      warnings,
      title: "Divine Right (17th Level)",
      apply(next, receipt) {
        receipt.summary = `${actor.name}'s Authority features are upgraded by Divine Right (10-ft mark splash, Castle Doctrine WIS save vs speed 0, Pursuit of Power damage aura, Make It So reroll on failure).`;
        receipt.result = { active: true, level };
        return {
          "flags.ak5e.lord.divineRight": true,
          "flags.ak5e.guard.lord.divineRight": true
        };
      }
    };
  },

  /**
   * Authority Marks: Apply Ranged or Melee Mark.
   */
  applyLordMark(actor, state, data) {
    need(isLord(actor), "Authority Marks is a Lord feature.");
    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const markType = String(data.markType ?? "melee").toLowerCase();
    need(targetUuid, "Target UUID is required to apply a Lord Mark.");

    return {
      warnings: [],
      title: `Apply Lord Mark (${markType})`,
      apply(next, receipt) {
        next.data ??= {};
        next.data.marks ??= {};
        next.data.marks[targetUuid] = markType;

        receipt.summary = `${actor.name} marks target with a ${markType.toUpperCase()} Mark until end of next turn.`;
        receipt.result = { targetUuid, markType };

        receipt.targets = [{
          uuid: targetUuid,
          kind: "effect",
          name: `Lord Mark: ${markType}`,
          data: { markType, source: actor.uuid }
        }];

        const currentMarks = {
          ...(flag(actor, "lord")?.marks ?? {}),
          ...(flag(actor, "guard")?.lord?.marks ?? {})
        };
        currentMarks[targetUuid] = markType;

        return {
          "flags.ak5e.lord.marks": currentMarks,
          "flags.ak5e.guard.lord.marks": currentMarks
        };
      }
    };
  },

  /**
   * Authority Marks: Consume Mark on opposite attack (+1d6 damage, 10-ft splash at 17th).
   */
  consumeLordMark(actor, state, data) {
    need(isLord(actor), "Authority Marks is a Lord feature.");
    const targetUuid = data.targetUuid ?? data.target?.uuid;
    const attackType = String(data.attackType ?? "melee").toLowerCase();
    const storedMark = getLordMark(actor, targetUuid);

    const warnings = [];
    if (!storedMark) {
      warn(warnings, "noMark", "Target does not have a Lord Mark.");
    } else if (storedMark === attackType) {
      warn(warnings, "sameMark", `Target has a ${storedMark} Mark; consuming requires the opposite attack type.`);
    }

    const level = guardLevel(actor) ?? 1;
    const damageType = manifestationDamageType(actor);

    return {
      warnings,
      title: "Consume Lord Mark (+1d6 Damage)",
      formula: "1d6",
      rollLabel: `Mark Damage (${damageType})`,
      apply(next, receipt) {
        next.data ??= {};
        next.data.marks ??= {};
        delete next.data.marks[targetUuid];

        receipt.formula = "1d6";
        receipt.summary = `${actor.name} consumes ${storedMark} Mark with a ${attackType} attack for 1d6 additional ${damageType} damage${level >= 17 ? " (Divine Right: splashes to other creatures within 10 ft)!" : "!"}`;
        receipt.result = {
          consumedMark: storedMark,
          attackType,
          damageType,
          splash: level >= 17
        };

        const currentMarks = {
          ...(flag(actor, "lord")?.marks ?? {}),
          ...(flag(actor, "guard")?.lord?.marks ?? {})
        };
        delete currentMarks[targetUuid];

        return {
          "flags.ak5e.lord.marks": currentMarks,
          "flags.ak5e.guard.lord.marks": currentMarks
        };
      }
    };
  },

  /**
   * Overruled Saving Throw (INT, WIS, CHA).
   */
  overruledSave(actor, state, data) {
    need(isLord(actor), "Overruled is a Lord feature.");
    const ability = String(data.ability ?? "wis").toLowerCase();
    const warnings = [];
    if (!isOverruledEligible(ability)) {
      warn(warnings, "ability", `Overruled applies to Intelligence, Wisdom, or Charisma saving throws; not ${ability.toUpperCase()}.`);
    }

    return {
      warnings,
      title: `Overruled (${ability.toUpperCase()} Save)`,
      apply(next, receipt) {
        receipt.summary = `${actor.name} invokes Overruled to make an additional ${ability.toUpperCase()} Saving Throw at the ${data.timing ?? "start and end"} of their Turn to end an affliction.`;
        receipt.result = { ability, timing: data.timing ?? "both" };
        return {};
      }
    };
  }
};

guardUses.register({ plans: LORD_PLANS });

/* ---------------------------------------------------------------- Hooks */

/**
 * dnd5e.preRollAttackV2:
 * When Manifestation is active:
 * - Melee weapons gain Range 30/-.
 * - Ranged attacks using melee weapons use Strength modifier instead of Dexterity.
 */
export function lordPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject;
  const actor = activity?.actor ?? config?.actor;
  if (!actor || !isLord(actor)) return;
  if (!isManifestationActive(actor)) return;

  const item = activity?.item ?? config?.item;
  const isMelee = item?.system?.actionType === "mwak" ||
    item?.system?.type?.value === "melee" ||
    item?.system?.weaponType === "martialM" ||
    item?.system?.weaponType === "simpleM";
  if (!isMelee) return;

  // Melee weapons gain Range (30/-)
  if (item?.system?.range) {
    item.system.range.value = Math.max(Number(item.system.range.value) || 0, 30);
    item.system.range.units = "ft";
  } else if (item?.system) {
    item.system.range = { value: 30, units: "ft" };
  }

  // When you make a Ranged Attack using these weapons, use STR instead of DEX
  const isRangedAttack = activity?.actionType === "rwak" ||
    config?.attackType === "ranged" ||
    config?.attackType === "rangedWeapon";
  const roll = config?.rolls?.[0];
  if (isRangedAttack && roll?.parts) {
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
    if (strMod > dexMod) {
      const diff = strMod - dexMod;
      roll.parts.push(String(diff));
    }
  }
}

/**
 * dnd5e.preRollDamageV2:
 * When Manifestation is active:
 * - Weapon attacks add +CHA mod Force (or attuned) damage.
 * - Ranged attacks using melee weapons use Strength modifier instead of Dexterity.
 * - When holding Authority, opposite attack on marked target deals +1d6 damage.
 */
export function lordPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject;
  const actor = activity?.actor ?? config?.actor;
  if (!actor || !isLord(actor)) return;
  if (!isManifestationActive(actor)) return;

  const roll = config?.rolls?.[0];
  if (!roll?.parts) return;

  const item = activity?.item ?? config?.item;
  const isWeapon = item?.type === "weapon" || activity?.actionType === "mwak" || activity?.actionType === "rwak";
  if (!isWeapon) return;

  const isMelee = item?.system?.actionType === "mwak" ||
    item?.system?.type?.value === "melee" ||
    item?.system?.weaponType === "martialM" ||
    item?.system?.weaponType === "simpleM";
  const isRangedAttack = activity?.actionType === "rwak" ||
    config?.attackType === "ranged" ||
    config?.attackType === "rangedWeapon";

  if (isMelee && isRangedAttack) {
    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
    if (strMod > dexMod) {
      const diff = strMod - dexMod;
      roll.parts.push(String(diff));
    }
  }

  // Weapon attacks add +CHA mod Force (or attuned) damage during Manifestation
  const chaMod = Number(actor.system?.abilities?.cha?.mod ?? 0);
  if (chaMod > 0) {
    roll.parts.push(String(chaMod));
  }

  // Mark consumption: If holding Authority and target has opposite mark
  if (hasAuthority(actor)) {
    const target = config?.target ?? Array.from(globalThis.game?.user?.targets ?? [])[0]?.actor;
    if (target) {
      const mark = getLordMark(actor, target);
      const attackKind = isRangedAttack ? "ranged" : "melee";
      if (mark && mark !== attackKind) {
        roll.parts.push("1d6");
      }
    }
  }
}

/** Registers Lord resource pools, plans, and attack/damage hooks. */
export function registerLordHooks() {
  defineLordPools();
  guardUses.register({ plans: LORD_PLANS });
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", lordPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", lordPreRollDamage);
  }
}

defineLordPools();
