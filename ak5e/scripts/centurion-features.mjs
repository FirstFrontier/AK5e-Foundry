/**
 * Centurion subclass features (Ch.3 L2549-2632):
 * Cyclone Strike, Shock Trooper (Intimidation, Long-Arm, Brutal Execution),
 * Mow Them Down (Fearmonger, Ferocious Fling), Guillotine, Shredder, and Storm of Blood.
 * Follows WORKFLOW.md §3.2 and integrates with guardUses and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardEnabled, guardLevel, guardBranch, centurionDC, martialDC
} from "./guard-rules.mjs";
import { guardUses } from "./guard-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { spendReaction, getReactions, refundReaction } from "./trigger-events.mjs";
import { need, values, flag } from "./operation-kernel.mjs";
import { ownTurn } from "./guard-features.mjs";

export const isCenturion = actor => guardEnabled(actor) && guardBranch(actor) === "centurion";

export function defineCenturionPools() {
  if (!getPoolDefinition("ferociousFling")) {
    definePool({
      id: "ferociousFling",
      label: "Ferocious Fling",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCenturion(actor) && guardLevel(actor) >= 4,
      recovery: [{ on: "sr", amount: "toMax" }, { on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("guillotine")) {
    definePool({
      id: "guillotine",
      label: "Guillotine",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCenturion(actor) && guardLevel(actor) >= 10,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("stormOfBlood")) {
    definePool({
      id: "stormOfBlood",
      label: "Storm of Blood",
      max: 1,
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isCenturion(actor) && guardLevel(actor) >= 17,
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = guardLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is a Centurion level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/* ---------------------------------------------------------------- Centurion Plans */

const CENTURION_PLANS = {
  cycloneStrike(actor, state, data) {
    need(isCenturion(actor), "Cyclone Strike is a Centurion feature.");
    const warnings = [];
    const level = guardLevel(actor) ?? 1;
    const maxTargets = level >= 7 ? 2 : 1;

    // Check turn limit
    const lastUsedTurn = state.data?.cycloneStrikeTurn;
    const combat = globalThis.game?.combat;
    const currentTurnKey = combat?.started ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    if (level < 14 && currentTurnKey && lastUsedTurn === currentTurnKey) {
      warn(warnings, "frequency", "Cyclone Strike has already been used this Turn.");
    }

    const secondaryCount = Array.isArray(data.targetUuids) ? data.targetUuids.length : 1;
    if (secondaryCount > maxTargets) {
      warn(warnings, "targetCount", `Cyclone Strike can cleave to at most ${maxTargets} secondary Creature(s) at level ${level}.`);
    }

    return {
      warnings,
      title: "Cyclone Strike (Cleave)",
      apply(next, receipt) {
        next.data ??= {};
        next.data.cycloneStrikeTurn = currentTurnKey;
        receipt.summary = `${actor.name} cleaves with a Melee Weapon Attack to ${secondaryCount} secondary Creature(s).`;
        receipt.result = { secondaryCount, maxTargets };
        return {};
      }
    };
  },

  brutalExecution(actor, _state, data) {
    need(isCenturion(actor), "Brutal Execution is a Centurion feature.");
    const warnings = [];
    const available = resourceValue(actor, { pool: "aggression" });
    if (available < 2) {
      warn(warnings, "aggression", `2 Aggression needed and ${available} remain; Aggression clamps at 0.`);
    }

    const intimidationMod = Number(actor.system?.skills?.itm?.mod ?? (actor.system?.abilities?.cha?.mod ?? 0));
    const dc = centurionDC(actor);
    const targets = Array.isArray(data.targets) ? data.targets : [];

    return {
      warnings,
      title: "Press the Attack: Brutal Execution",
      async apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "aggression", amount: 2, label: "Aggression" });
        receipt.summary = `${actor.name} executes a foe brutally; hostile Creatures within 15 ft make a WIS save (DC ${dc}) or take ${intimidationMod} Psychic Damage and become Frightened until the end of ${actor.name}'s next Turn.`;
        receipt.result = { aggressionSpent: 2, dc, damage: intimidationMod, frightened: true };

        // Attach targets to receipt for GM relay
        for (const t of targets) {
          receipt.targets.push({
            uuid: t.uuid,
            name: t.name,
            kind: "effect",
            featureId: "subclass-feature-guard-centurion-1st-level-shock-trooper-1175",
            tag: { label: "Frightened (Brutal Execution)", trigger: "nextTurnEnd", expiryActor: "source" },
            ready: true
          });
        }

        return updates;
      }
    };
  },

  ferociousFling(actor, _state, data) {
    need(isCenturion(actor), "Ferocious Fling is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Ferocious Fling");

    const available = resourceValue(actor, { pool: "ferociousFling" });
    const isBrutalRefund = Boolean(data.brutalExecution);
    if (!isBrutalRefund && available < 1) {
      warn(warnings, "ferociousFling", `1 use of Ferocious Fling needed and ${available} remain.`);
    }

    const conMod = Math.max(0, Number(data.targetConMod ?? 0));
    const targetUuid = data.targetUuid ?? null;

    return {
      warnings,
      title: "Ferocious Fling",
      rolls: [
        { id: "flingAttack", label: "Fling Ranged Weapon Attack (STR)", formula: "1d20 + @abilities.str.mod + @attributes.prof" },
        { id: "flingDamage", label: "Fling Damage (Constitution Modifier)", formula: String(conMod) }
      ],
      apply(next, receipt) {
        let updates = {};
        if (!isBrutalRefund) {
          updates = spendResource(actor, receipt, { pool: "ferociousFling", amount: 1, label: "Ferocious Fling" });
        }
        receipt.formula = String(conMod);
        receipt.rollLabel = "Fling Damage";
        receipt.summary = `${actor.name} flings a defeated Creature as a projectile at another Creature within 30 ft${isBrutalRefund ? " (use refunded by Brutal Execution)" : ""}.`;
        receipt.result = { targetUuid, conMod, brutalRefund: isBrutalRefund };
        return updates;
      }
    };
  },

  guillotine(actor, _state, data) {
    need(isCenturion(actor), "Guillotine is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 10, "Guillotine");

    const available = resourceValue(actor, { pool: "guillotine" });
    if (available < 1) {
      warn(warnings, "guillotine", `1 use of Guillotine needed and ${available} remain.`);
    }

    const pb = Number(actor.system?.attributes?.prof ?? 2);
    const diceCount = 2 * pb;
    const mDC = martialDC(actor);
    const cDC = centurionDC(actor);
    const isEliteOrLeader = Boolean(data.eliteOrLeader);

    return {
      warnings,
      title: "Guillotine",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "guillotine", amount: 1, label: "Guillotine" });
        receipt.formula = `${diceCount}d6`;
        receipt.rollLabel = `Guillotine Damage (${diceCount}d6)`;
        receipt.summary = `${actor.name} strikes a lethal blow with weapon dice (${diceCount}d6) on a failed DEX save (DC ${mDC}); target begins Bleeding.${isEliteOrLeader ? ` Elite/Leader trigger: hostiles within 30 ft make a WIS save (DC ${cDC}) or become Frightened.` : ""}`;
        receipt.result = { diceCount, martialDC: mDC, centurionDC: cDC, eliteOrLeader: isEliteOrLeader };
        return updates;
      }
    };
  },

  shredder(actor, _state, data) {
    need(isCenturion(actor), "Shredder is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 13, "Shredder");

    const strMod = Number(actor.system?.abilities?.str?.mod ?? 0);
    const isFrightened = Boolean(data.targetFrightened);
    const damage = Math.max(0, isFrightened ? 2 * strMod : strMod);
    const targetUuid = data.targetUuid ?? null;

    return {
      warnings,
      title: "Shredder",
      apply(next, receipt) {
        receipt.summary = `Secondary Creature takes ${damage} Slashing Damage (STR ${strMod}${isFrightened ? " doubled vs Frightened" : ""}).`;
        receipt.result = { damage, targetUuid, isFrightened };
        return {};
      }
    };
  },

  stormOfBlood(actor, _state, data) {
    need(isCenturion(actor), "Storm of Blood is a Centurion feature.");
    const warnings = [];
    levelWarning(warnings, actor, 17, "Storm of Blood");

    const available = resourceValue(actor, { pool: "stormOfBlood" });
    if (available < 1) {
      warn(warnings, "stormOfBlood", `1 use of Storm of Blood needed and ${available} remain.`);
    }

    const mDC = martialDC(actor);

    return {
      warnings,
      title: "Storm of Blood",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "stormOfBlood", amount: 1, label: "Storm of Blood" });
        receipt.formula = "10d8";
        receipt.rollLabel = "Storm of Blood Damage (10d8)";
        receipt.summary = `${actor.name} whirls in a storm of blood; chosen Creatures within 15 ft make a DEX save (DC ${mDC}) taking 10d8 Slashing Damage and becoming Frightened until end of next Turn (must move away). Long-Arm is active off-turn and AoO hits refund Reaction.`;
        receipt.result = { martialDC: mDC, damageFormula: "10d8" };
        return updates;
      }
    };
  }
};

guardUses.register({ plans: CENTURION_PLANS });

/* ---------------------------------------------------------------- Fearmonger & Long-Arm Hooks */

export function centurionPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isCenturion(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;

  const level = guardLevel(actor) ?? 1;

  // Fearmonger (Level 4): Advantage on attack rolls against Frightened creatures
  if (level >= 4) {
    const targets = Array.from(globalThis.game?.user?.targets ?? []);
    const anyFrightened = targets.some(t => {
      const targetActor = t.actor;
      return targetActor?.statuses?.has?.("frightened") || Boolean(flag(targetActor, "frightened"));
    });
    if (anyFrightened) {
      roll.options ??= {};
      roll.options.advantage = true;
    }
  }
}

export function registerCenturionHooks() {
  defineCenturionPools();
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", centurionPreRollAttack);
  }
}

defineCenturionPools();
