/**
 * Duellist subclass features (Ch. 3 L2739-2845):
 * Singular Foe (Duelling Blades, Rules of Engagement: Opponent declaration & Points ledger),
 * Parry & Riposte, Principles of Defence (4th Level: Every Victory, Lightning Reflexes, Punish Every Opening),
 * Duellist's Advance (10th Level), Grand Challenge (13th Level: Corps à Corps, Displacement, Coup de Grâce),
 * Master Duellist (17th Level), and 9 Engagements.
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { spendReaction, getReactions, refundReaction, onAk5eEvent } from "./trigger-events.mjs";
import { need, values, flag } from "./operation-kernel.mjs";

export const isDuellist = actor => Boolean(guardEnabled(actor) && guardBranch(actor) === "duellist");

export const POLEARM_BASE_ITEMS = Object.freeze(["glaive", "halberd", "pike", "spear", "quarterstaff"]);

/**
 * Returns true if the weapon is a Greatsword or Polearm.
 * Duelling Blades (Ch. 3 L2746): Greatswords and Polearms are considered to have the Finesse property.
 */
export function isDuellingBladeWeapon(item) {
  if (!item) return false;
  const base = String(item.system?.type?.baseItem ?? item.system?.baseItem ?? "").toLowerCase();
  const name = String(item.name ?? "").toLowerCase();

  const isGreatsword = base === "greatsword" || name.includes("greatsword");
  const isPolearm = POLEARM_BASE_ITEMS.includes(base) || POLEARM_BASE_ITEMS.some(p => name.includes(p));

  return isGreatsword || isPolearm;
}

/**
 * Check if the actor is wielding a Heavy Melee Weapon.
 * (Rules of Engagement: +1 extra Point if NOT wielding a Heavy Melee Weapon).
 */
export function isWieldingHeavyMeleeWeapon(actor) {
  const items = Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
  return items.some(item => {
    if (item.type !== "weapon" || !item.system?.equipped) return false;
    const isMelee = item.system?.actionType === "mwak" ||
      item.system?.type?.value === "melee" ||
      item.system?.weaponType === "martialM" ||
      item.system?.weaponType === "simpleM";
    const properties = item.system?.properties;
    const isHeavy = properties instanceof Set
      ? properties.has("hvy")
      : (Array.isArray(properties) ? properties.includes("hvy") : Boolean(properties?.hvy));
    return isMelee && isHeavy;
  });
}

export function defineDuellistPools() {
  if (!getPoolDefinition("duellistPoints")) {
    definePool({
      id: "duellistPoints",
      label: "Duel Points",
      max: 10,
      min: 0,
      initial: 0,
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isDuellist(actor)
    });
  }
  if (!getPoolDefinition("grandChallenge")) {
    definePool({
      id: "grandChallenge",
      label: "Grand Challenge",
      max: 1,
      min: 0,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isDuellist(actor) && (guardLevel(actor) ?? 1) >= 13,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Duellist level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

const pointsCheck = (warnings, actor, cost, name) => {
  const available = resourceValue(actor, { pool: "duellistPoints" });
  if (available < cost) {
    warn(warnings, "duellistPoints", `${cost} Duel Point(s) needed for ${name} and ${available} remain; Duel Points clamp at 0.`);
  }
};

const checkEngagementTurnLimit = (warnings, state, planName, title, data) => {
  const combat = globalThis.game?.combat;
  const turnKey = combat?.started
    ? `${combat.id}:${combat.round}:${combat.turn}`
    : (data?.turnKey ?? null);
  if (turnKey) {
    const usedThisTurn = (state.undo ?? []).some(
      r => (r.command === planName || r.canonicalCommand === planName) &&
        r.status !== "undone" &&
        r.turnKey === turnKey
    );
    if (usedThisTurn) {
      warn(warnings, "frequency", `${title} has already been used this Turn.`);
    }
  }
  return turnKey;
};

/* ---------------------------------------------------------------- Duellist Plans */

export const DUELLIST_PLANS = {
  // --- 1st Level: Rules of Engagement ---
  declareOpponent(actor, state, data) {
    need(isDuellist(actor), "Rules of Engagement is a Duellist feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const isMaster = level >= 17;

    const opponentUuid = data.targetUuid ?? data.uuid ?? null;
    const opponentName = data.targetName ?? data.name ?? (opponentUuid ? "Opponent" : "Unknown Opponent");

    // Bonus Action cost unless 17th level (Master Duellist: no action required)
    const actionCost = isMaster ? "Free Action" : "Bonus Action";

    // Points calculation: +1 on declaration (+2 if level >= 10), +1 extra if NOT wielding Heavy Melee Weapon
    const baseGain = level >= 10 ? 2 : 1;
    const heavy = isWieldingHeavyMeleeWeapon(actor);
    const nonHeavyBonus = heavy ? 0 : 1;
    const pointsGained = baseGain + nonHeavyBonus;

    return {
      warnings,
      title: "Rules of Engagement: Declare Opponent",
      apply(next, receipt) {
        const pool = getPool(actor, "duellistPoints");
        const currentPoints = pool?.value ?? 0;
        // At 17th level, retain current points when declaring an opponent (without grand challenge) or on death/surrender
        const newPoints = isMaster
          ? Math.min(10, currentPoints + pointsGained)
          : Math.min(10, pointsGained);

        receipt.resources ??= [];
        receipt.resources.push({
          pool: "duellistPoints",
          path: "flags.ak5e.resourcePools.duellistPoints.value",
          before: currentPoints,
          after: newPoints,
          max: 10,
          label: "Duel Points"
        });

        const updates = {
          "flags.ak5e.resourcePools.duellistPoints.value": newPoints,
          "flags.ak5e.guard.duellist.opponent": {
            uuid: opponentUuid,
            name: opponentName,
            declaredAt: Date.now()
          }
        };

        receipt.summary = `${actor.name} declares ${opponentName} as their Opponent (${actionCost}). Gained ${pointsGained} Duel Point(s) (total: ${newPoints}).`;
        receipt.result = {
          opponent: { uuid: opponentUuid, name: opponentName },
          pointsGained,
          totalPoints: newPoints,
          actionCost
        };
        return updates;
      }
    };
  },

  // Turn-start ledger helper: +1 (+2 at 10th) if damaged opponent, +1 if opponent did not damage you
  duelTurnStart(actor, _state, data) {
    need(isDuellist(actor), "Rules of Engagement is a Duellist feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const damagedOpponent = data.damagedOpponent !== false;
    const opponentDamagedSelf = Boolean(data.opponentDamagedSelf);

    let gained = 0;
    if (damagedOpponent) {
      gained += (level >= 10 ? 2 : 1);
    }
    if (!opponentDamagedSelf) {
      gained += 1;
    }

    return {
      warnings,
      title: "Rules of Engagement: Turn Start Points",
      apply(next, receipt) {
        const pool = getPool(actor, "duellistPoints");
        const current = pool?.value ?? 0;
        const newPoints = Math.min(10, current + gained);

        receipt.resources ??= [];
        receipt.resources.push({
          pool: "duellistPoints",
          path: "flags.ak5e.resourcePools.duellistPoints.value",
          before: current,
          after: newPoints,
          max: 10,
          label: "Duel Points"
        });

        const updates = {
          "flags.ak5e.resourcePools.duellistPoints.value": newPoints
        };

        receipt.summary = `${actor.name} gains ${gained} Duel Point(s) at turn start (total: ${newPoints}).`;
        receipt.result = { gained, totalPoints: newPoints };
        return updates;
      }
    };
  },

  // --- 1st Level: Press the Attack: Riposte (1 Aggression, Reaction) ---
  riposte(actor, _state, _data) {
    need(isDuellist(actor), "Riposte is a Duellist feature.");
    const warnings = [];
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 1) {
      warn(warnings, "aggression", `1 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    return {
      warnings,
      title: "Press the Attack: Riposte",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-riposte`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId: `${receipt.id}-riposte` };
        receipt.summary = `${actor.name} uses Press the Attack: Riposte (1 Aggression, Reaction) to make an Attack of Opportunity against the attacking creature within reach that missed.`;
        receipt.result = { aggressionSpent: 1, reactionSpent: rx.ok };
        return updates;
      }
    };
  },

  // --- 4th Level: Principles of Defence ---
  lightningReflexes(actor, _state, _data) {
    need(isDuellist(actor), "Lightning Reflexes is a Duellist feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Lightning Reflexes");
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 1) {
      warn(warnings, "aggression", `1 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    return {
      warnings,
      title: "Press the Attack: Lightning Reflexes",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-lightningReflexes`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId: `${receipt.id}-lightningReflexes` };
        receipt.summary = `${actor.name} uses Press the Attack: Lightning Reflexes (1 Aggression, Reaction) to make a Dexterity Saving Throw against the seen effect instead of the required Saving Throw.`;
        receipt.result = { aggressionSpent: 1, reactionSpent: rx.ok, save: "dex" };
        return updates;
      }
    };
  },

  punishOpening(actor, _state, _data) {
    need(isDuellist(actor), "Punish Every Opening is a Duellist feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Punish Every Opening");
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 1) {
      warn(warnings, "aggression", `1 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }

    return {
      warnings,
      title: "Punish Every Opening (Free Riposte)",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 1, label: "Aggression" });
        receipt.reaction = { requested: false, spent: false, punishOpening: true };
        receipt.summary = `${actor.name} uses Punish Every Opening (1 Aggression, no Reaction) to make a free Riposte Attack of Opportunity against the creature within reach following a successful Saving Throw.`;
        receipt.result = { aggressionSpent: 1, reactionSpent: false };
        return updates;
      }
    };
  },

  everyVictory(actor, _state, _data) {
    need(isDuellist(actor), "Every Victory, Another Step is a Duellist feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Every Victory, Another Step");
    const level = guardLevel(actor) ?? 1;
    const isMaster = level >= 17;

    return {
      warnings,
      title: "Every Victory, Another Step",
      async apply(next, receipt) {
        // Regain 1 expended Aggression
        const pool = getPool(actor, "aggression");
        const currentAgg = pool?.value ?? 0;
        const maxAgg = pool?.max ?? 4;
        const newAgg = Math.min(maxAgg, currentAgg + 1);

        receipt.resources ??= [];
        receipt.resources.push({
          pool: "aggression",
          path: "flags.ak5e.resourcePools.aggression.value",
          before: currentAgg,
          after: newAgg,
          max: maxAgg,
          label: "Aggression"
        });

        const updates = {
          "flags.ak5e.resourcePools.aggression.value": newAgg
        };

        if (!isMaster) {
          // Lose points when opponent is reduced to 0 HP or surrenders
          const dPool = getPool(actor, "duellistPoints");
          const beforePoints = dPool?.value ?? 0;
          receipt.resources.push({
            pool: "duellistPoints",
            path: "flags.ak5e.resourcePools.duellistPoints.value",
            before: beforePoints,
            after: 0,
            max: 10,
            label: "Duel Points"
          });
          updates["flags.ak5e.resourcePools.duellistPoints.value"] = 0;
          updates["flags.ak5e.guard.duellist.opponent"] = null;
        }

        receipt.summary = `${actor.name}'s Opponent was defeated or surrendered. Regained 1 Aggression${isMaster ? " (Master Duellist: Duel Points retained)" : "; Duel Points reset to 0"}.`;
        receipt.result = { aggressionRegained: 1, pointsRetained: isMaster };
        return updates;
      }
    };
  },

  // --- 9 Engagements ---

  engagementAnalysis(actor, state, data) {
    need(isDuellist(actor), "Analysis is a Duellist Engagement.");
    const warnings = [];
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementAnalysis", "Engagement: Analysis", data);

    return {
      warnings,
      title: "Engagement: Analysis",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = {
          "flags.ak5e.guard.duellist.analysis": { active: true, turnKey }
        };
        receipt.summary = `${actor.name} uses Engagement: Analysis (0 Points, Action). Once during next Turn, if gaining Duel Points, gains 1 additional Point.`;
        receipt.result = { pointsSpent: 0 };
        return updates;
      }
    };
  },

  engagementBalestra(actor, state, data) {
    need(isDuellist(actor), "Balestra is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 2, "Balestra");
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementBalestra", "Engagement: Balestra", data);

    return {
      warnings,
      title: "Engagement: Balestra",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 2, label: "Duel Points" });
        receipt.summary = `${actor.name} uses Engagement: Balestra (2 Points, no Action). Next Melee Attack before end of next Turn has Reach increased by 10 ft; moves 10 ft towards creature after attacking; bypasses Damage Reduction if target was > 10 ft away.`;
        receipt.result = { pointsSpent: 2, reachBonus: 10, bypassesDR: true };
        return updates;
      }
    };
  },

  engagementDerobement(actor, state, data) {
    need(isDuellist(actor), "Derobement is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 1, "Derobement");
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementDerobement", "Engagement: Derobement", data);

    return {
      warnings,
      title: "Engagement: Derobement",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 1, label: "Duel Points" });
        receipt.summary = `${actor.name} uses Engagement: Derobement (1 Point, no Action). Attack Damage is halved; if it hits, target has Disadvantage on Attack Rolls against ${actor.name} until start of next Turn.`;
        receipt.result = { pointsSpent: 1, halvedDamage: true, disadvantageOnAttacks: true };
        return updates;
      }
    };
  },

  engagementDisplacement(actor, state, data) {
    need(isDuellist(actor), "Displacement is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 1, "Displacement");
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementDisplacement", "Engagement: Displacement", data);

    return {
      warnings,
      title: "Engagement: Displacement",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 1, label: "Duel Points" });
        receipt.summary = `${actor.name} uses Engagement: Displacement (1 Point, no Action). Attack Damage is halved; if it hits, ${actor.name} can move up to 10 feet directly away without provoking Opportunity Attacks from target.`;
        receipt.result = { pointsSpent: 1, halvedDamage: true, retreatFeet: 10 };
        return updates;
      }
    };
  },

  engagementEnGarde(actor, state, data) {
    need(isDuellist(actor), "En Garde is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 1, "En Garde");
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementEnGarde", "Engagement: En Garde", data);

    return {
      warnings,
      title: "Engagement: En Garde",
      async apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 1, label: "Duel Points" });
        await refundReaction(actor, { receipt: receipt.id });
        receipt.reaction = { refunded: true, receiptId: receipt.id };
        receipt.summary = `${actor.name} uses Engagement: En Garde (1 Point, no Action). Returns to a guarding stance, refunding the Reaction expended for Riposte or Lightning Reflexes.`;
        receipt.result = { pointsSpent: 1, reactionRefunded: true };
        return updates;
      }
    };
  },

  engagementFeint(actor, state, data) {
    need(isDuellist(actor), "Feint is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 1, "Feint");
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementFeint", "Engagement: Feint", data);

    return {
      warnings,
      title: "Engagement: Feint",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 1, label: "Duel Points" });
        receipt.summary = `${actor.name} uses Engagement: Feint (1 Point, Bonus Action). Next Melee Attack against seen target before end of next Turn has Advantage (target must be able to see ${actor.name}).`;
        receipt.result = { pointsSpent: 1, grantAdvantage: true };
        return updates;
      }
    };
  },

  engagementFleche(actor, state, data) {
    need(isDuellist(actor), "Fleche is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 2, "Fleche");
    const level = guardLevel(actor) ?? 1;
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementFleche", "Engagement: Fleche", data);

    return {
      warnings,
      title: "Engagement: Fleche",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 2, label: "Duel Points" });
        receipt.summary = `${actor.name} uses Engagement: Fleche (2 Points, Bonus Action). Next Melee Attack this Turn deals ${level} additional Damage (equal to Guard Level).`;
        receipt.result = { pointsSpent: 2, damageBonus: level };
        return updates;
      }
    };
  },

  engagementRedoublement(actor, state, data) {
    need(isDuellist(actor), "Redoublement is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 1, "Redoublement");
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementRedoublement", "Engagement: Redoublement", data);

    return {
      warnings,
      title: "Engagement: Redoublement",
      async apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 1, label: "Duel Points" });
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-redoublement`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id, triggerId: `${receipt.id}-redoublement` };
        receipt.summary = `${actor.name} uses Engagement: Redoublement (1 Point, Reaction). Rerolls the missed Melee Attack Roll; if it hits, Damage is halved.`;
        receipt.result = { pointsSpent: 1, reactionSpent: rx.ok, halvedDamage: true };
        return updates;
      }
    };
  },

  engagementScore(actor, state, data) {
    need(isDuellist(actor), "Score is a Duellist Engagement.");
    const warnings = [];
    pointsCheck(warnings, actor, 1, "Score");
    const turnKey = checkEngagementTurnLimit(warnings, state, "engagementScore", "Engagement: Score", data);

    return {
      warnings,
      title: "Engagement: Score",
      apply(next, receipt) {
        receipt.turnKey = turnKey;
        const updates = spendResource(actor, receipt, { pool: "duellistPoints", amount: 1, label: "Duel Points" });
        receipt.summary = `${actor.name} uses Engagement: Score (1 Point, no Action). Attack Damage is halved; if it hits, target suffers the Bleeding Condition.`;
        receipt.result = { pointsSpent: 1, halvedDamage: true, inflictsBleeding: true };
        return updates;
      }
    };
  },

  // --- 13th Level: Grand Challenge & Coup de Grâce ---
  grandChallenge(actor, _state, data) {
    need(isDuellist(actor), "Grand Challenge is a Duellist feature.");
    const warnings = [];
    levelWarning(warnings, actor, 13, "Grand Challenge");
    const available = resourceValue(actor, { pool: "grandChallenge" });
    if (available < 1) {
      warn(warnings, "grandChallenge", `1 use of Grand Challenge needed and ${available} remain.`);
    }

    const opponentUuid = data.targetUuid ?? flag(actor, "guard")?.duellist?.opponent?.uuid ?? null;
    const opponentName = data.targetName ?? flag(actor, "guard")?.duellist?.opponent?.name ?? "Opponent";

    return {
      warnings,
      title: "Grand Challenge",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "grandChallenge", amount: 1, label: "Grand Challenge" });
        updates["flags.ak5e.guard.duellist.grandChallenge"] = {
          active: true,
          opponentUuid,
          opponentName,
          startedAt: Date.now()
        };
        receipt.summary = `${actor.name} declares a Grand Challenge against ${opponentName} (1/Long Rest, no Action). For 1 minute: Corps à Corps (AoO when opponent attacks others) and Displacement (Resistance to all damage from creatures other than Opponent).`;
        receipt.result = { active: true, opponentUuid, opponentName };
        return updates;
      }
    };
  },

  coupDeGrace(actor, _state, _data) {
    need(isDuellist(actor), "Coup de Grâce is a Duellist feature.");
    const warnings = [];
    levelWarning(warnings, actor, 13, "Coup de Grâce");
    const points = resourceValue(actor, { pool: "duellistPoints" });
    if (points < 10) {
      warn(warnings, "duellistPoints", `10 Duel Points needed for Coup de Grâce and ${points} available; short by ${10 - points}.`);
    }

    const formula = "8d8";

    return {
      warnings,
      title: "Coup de Grâce",
      rolls: [
        { id: "coupDeGrace", label: "Coup de Grâce Damage (8d8 Slashing or Piercing)", formula }
      ],
      apply(next, receipt) {
        const updates = {
          "flags.ak5e.guard.duellist.grandChallenge.active": false
        };
        receipt.formula = formula;
        receipt.summary = `${actor.name} delivers a Coup de Grâce on a hit at 10 Duel Points! The Attack deals 8d8 Slashing or Piercing Damage (unreduced by Resistance or Damage Reduction), and the Grand Challenge ends.`;
        receipt.result = { damageFormula: formula, grandChallengeEnded: true };
        return updates;
      }
    };
  }
};

// Aliases for user and UI convenience
DUELLIST_PLANS.rulesOfEngagement = DUELLIST_PLANS.declareOpponent;
DUELLIST_PLANS.punishEveryOpening = DUELLIST_PLANS.punishOpening;
DUELLIST_PLANS.analysis = DUELLIST_PLANS.engagementAnalysis;
DUELLIST_PLANS.balestra = DUELLIST_PLANS.engagementBalestra;
DUELLIST_PLANS.derobement = DUELLIST_PLANS.engagementDerobement;
DUELLIST_PLANS.displacement = DUELLIST_PLANS.engagementDisplacement;
DUELLIST_PLANS.enGarde = DUELLIST_PLANS.engagementEnGarde;
DUELLIST_PLANS.feint = DUELLIST_PLANS.engagementFeint;
DUELLIST_PLANS.fleche = DUELLIST_PLANS.engagementFleche;
DUELLIST_PLANS.redoublement = DUELLIST_PLANS.engagementRedoublement;
DUELLIST_PLANS.score = DUELLIST_PLANS.engagementScore;

guardUses.register({ plans: DUELLIST_PLANS });

/* ---------------------------------------------------------------- Hooks & Event Handlers */

export function duellistPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isDuellist(actor)) return;
  const item = activity.item ?? config.item;
  if (!isDuellingBladeWeapon(item)) return;

  // Duelling Blades: Greatswords and Polearms gain the Finesse property
  if (item?.system?.properties) {
    if (item.system.properties instanceof Set) item.system.properties.add("fin");
    else if (Array.isArray(item.system.properties) && !item.system.properties.includes("fin")) {
      item.system.properties.push("fin");
    }
  }

  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  // If DEX > STR, apply bonus difference if not already using DEX
  const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
  const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
  if (dexMod > strMod && activity.ability !== "dex") {
    const diff = dexMod - strMod;
    roll.parts.push(String(diff));
  }
}

export function duellistPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isDuellist(actor)) return;
  const item = activity.item ?? config.item;
  if (!isDuellingBladeWeapon(item)) return;

  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  // If DEX > STR, apply bonus difference if not already using DEX
  const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
  const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
  if (dexMod > strMod && activity.ability !== "dex") {
    const diff = dexMod - strMod;
    roll.parts.push(String(diff));
  }
}

let installed = false;

export function registerDuellistHooks() {
  if (installed) return;
  installed = true;

  defineDuellistPools();
  guardUses.register({ plans: DUELLIST_PLANS });

  // Combat turn-start: Rules of Engagement check
  onAk5eEvent("turnStart", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : (event?.actor ?? event));
    if (!actor || !isDuellist(actor)) return;
    // Analysis bonus consumption check: if Analysis was used last turn, clear active flag
    const stored = flag(actor, "guard")?.duellist;
    if (stored?.analysis?.active) {
      await actor.update?.({ "flags.ak5e.guard.duellist.analysis.active": false });
    }
  });

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", duellistPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", duellistPreRollDamage);
  }
}

defineDuellistPools();
