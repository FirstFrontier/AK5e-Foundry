/**
 * Artilleryman subclass features (Ch.3 L3968-4035):
 * Tools of the Trade (Controlled Demolition, Explosive Expertise), Delayed Detonation,
 * Secondary Detonation, Bigger Booms (Enhanced Payload, Sharpened Shrapnel),
 * Force of Nature (Scatter Them, Siege Attacker), and Explosive Dawn (God of Destruction, Last Maniac Standing).
 * Follows WORKFLOW.md §3.2 and integrates with marksmanUses and resource-pools.mjs.
 */
import {
  MARKSMAN_CLASS_ID, marksmanEnabled, marksmanLevel, marksmanBranch,
  martialDC, targetLockBonus, isTargetLocked, explosiveExpertiseDice
} from "./marksman-rules.mjs";
import { marksmanUses } from "./marksman-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isArtilleryman = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "artilleryman";

export function defineArtillerymanPools() {
  if (!getPoolDefinition("delayedDetonation")) {
    definePool({
      id: "delayedDetonation",
      label: "Delayed Detonation",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isArtilleryman(actor),
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("secondaryDetonation")) {
    definePool({
      id: "secondaryDetonation",
      label: "Secondary Detonation",
      max: "@prof",
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isArtilleryman(actor) && marksmanLevel(actor) >= 4,
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("scatterThem")) {
    definePool({
      id: "scatterThem",
      label: "Scatter Them",
      max: 1,
      initial: "max",
      classId: MARKSMAN_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isArtilleryman(actor) && marksmanLevel(actor) >= 15,
      recovery: [
        { on: "sr", amount: "toMax" }
      ]
    });
  }
}

const levelWarning = (warnings, actor, requiredLevel, name) => {
  const current = marksmanLevel(actor) ?? 1;
  if (current < requiredLevel) {
    warn(warnings, "level", `${name} is an Artilleryman level ${requiredLevel} feature; this character is level ${current}.`);
  }
};

/** Calculates the effective Splash(X) DC for an Artilleryman, accounting for Sharpened Shrapnel and Controlled Demolition. */
export function artillerymanSplashDC(actor, targetUuid = null) {
  let dc = martialDC(actor);
  const level = marksmanLevel(actor);

  // Sharpened Shrapnel (10th level): +2 Martial DC for Splash(X)
  if (level >= 10) dc += 2;

  // Controlled Demolition (1st level): +Target Lock bonus against locked target
  if (targetUuid && isTargetLocked(actor, targetUuid)) {
    dc += targetLockBonus(actor);
  }

  return dc;
}

/* ---------------------------------------------------------------- Artilleryman Plans */

export const ARTILLERYMAN_PLANS = {
  delayedDetonation(actor, _state, data) {
    need(isArtilleryman(actor), "Delayed Detonation is an Artilleryman feature.");
    const warnings = [];
    const available = resourceValue(actor, { pool: "delayedDetonation" });
    if (available < 1) {
      warn(warnings, "delayedDetonation", "Delayed Detonation has already been used; uses clamp at 0.");
    }

    const point = data.point ?? { x: 0, y: 0 };
    const weaponName = data.weaponName ?? "Launcher";

    return {
      warnings,
      title: "Delayed Detonation (Deploy)",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "delayedDetonation", amount: 1, label: "Delayed Detonation" });
        updates["flags.ak5e.marksman.delayedMunition"] = {
          active: true,
          point,
          weaponName,
          placedAt: Date.now()
        };
        receipt.summary = `${actor.name} burrows a specially fused munition into the ground. It can be detonated as a Reaction when a Creature moves, or after 10 minutes.`;
        receipt.result = { point, weaponName };
        return updates;
      }
    };
  },

  detonateMunition(actor, _state, _data) {
    need(isArtilleryman(actor), "Delayed Detonation is an Artilleryman feature.");
    const warnings = [];
    const munition = flag(actor, "marksman")?.delayedMunition;
    if (!munition || !munition.active) {
      warn(warnings, "munition", "No active burrowed munition is currently deployed.");
    }
    const reactions = getReactions(actor);
    if (reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    return {
      warnings,
      title: "Delayed Detonation (Detonate)",
      async apply(next, receipt) {
        const rx = await spendReaction(actor, { triggerId: `${receipt.id}-detonate`, receipt: receipt.id });
        receipt.reaction = { requested: true, spent: rx.ok, receiptId: receipt.id };
        const updates = {
          "flags.ak5e.marksman.delayedMunition.active": false
        };
        receipt.summary = `${actor.name} detonates the burrowed munition as a Reaction!`;
        receipt.result = { detonated: true, point: munition?.point };
        return updates;
      }
    };
  },

  secondaryDetonation(actor, _state, data) {
    need(isArtilleryman(actor), "Secondary Detonation is an Artilleryman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Secondary Detonation");
    const available = resourceValue(actor, { pool: "secondaryDetonation" });
    if (available < 1) {
      warn(warnings, "secondaryDetonation", "Secondary Detonation uses exhausted; uses clamp at 0.");
    }

    const point = data.point ?? { x: 0, y: 0 };
    const originalDamage = Number(data.originalDamage ?? 0);
    const secondaryDamage = Math.floor(originalDamage / 2);

    return {
      warnings,
      title: "Secondary Detonation",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "secondaryDetonation", amount: 1, label: "Secondary Detonation" });
        receipt.summary = `${actor.name} causes a Secondary Detonation within 15 ft of the blast (${secondaryDamage} Thunder Damage, Save for NO Damage).`;
        receipt.result = { point, secondaryDamage };
        return updates;
      }
    };
  },

  scatterThem(actor, _state, data) {
    need(isArtilleryman(actor), "Scatter Them is an Artilleryman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 15, "Scatter Them");
    const available = resourceValue(actor, { pool: "scatterThem" });
    if (available < 1) {
      warn(warnings, "scatterThem", "Scatter Them has already been used; uses clamp at 0.");
    }

    const targetCount = Array.isArray(data.targetUuids) ? data.targetUuids.length : 1;

    return {
      warnings,
      title: "Scatter Them",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "scatterThem", amount: 1, label: "Scatter Them" });
        receipt.summary = `${actor.name} flings ${targetCount} Creature(s) 30 feet away from the blast center (4d8 Bludgeoning Damage on solid surface collision).`;
        receipt.result = { targetCount, flingDistance: 30, collisionFormula: "4d8" };
        return updates;
      }
    };
  }
};

marksmanUses.register({ plans: ARTILLERYMAN_PLANS });

/* ---------------------------------------------------------------- Hooks */

export function artillerymanPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isArtilleryman(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;

  const weapon = activity.item;
  const isSplash = Boolean(weapon?.system?.properties?.has?.("splash") || flag(weapon, "splash"));

  // Explosive Expertise: +1d / +2d / +3d Thunder damage on Splash(X) weapons dealing Thunder damage
  if (isSplash) {
    const diceCount = explosiveExpertiseDice(actor);
    if (diceCount > 0) {
      // Find weapon damage die (e.g. 1d8 from Grenade Launcher)
      const formula = weapon?.system?.damage?.base?.formula || activity.damage?.parts?.[0]?.formula || "1d8";
      const dieMatch = formula.match(/d(\d+)/);
      const faces = dieMatch ? dieMatch[1] : "8";
      roll.parts.push(`${diceCount}d${faces}`);
    }
  }

  // Force of Nature: Siege Attacker (15th level): double Thunder damage against Vehicles or Structures
  if (marksmanLevel(actor) >= 15) {
    const targets = globalThis.game?.user?.targets;
    const targetActor = targets?.first?.()?.actor;
    const isVehicleOrStructure = targetActor?.type === "vehicle" || targetActor?.system?.details?.type?.value === "structure";
    if (isVehicleOrStructure) {
      roll.options ??= {};
      roll.options.multiply = (roll.options.multiply ?? 1) * 2;
    }
  }
}

let installed = false;
export function registerArtillerymanHooks() {
  if (installed) return;
  installed = true;

  defineArtillerymanPools();

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollDamageV2", artillerymanPreRollDamage);
  }
}

defineArtillerymanPools();
