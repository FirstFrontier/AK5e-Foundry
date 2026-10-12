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
import { getReactions } from "./trigger-events.mjs";
import { need, flag } from "./operation-kernel.mjs";

export const isArtilleryman = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "artilleryman";
const now = () => Number(globalThis.game?.time?.worldTime ?? Date.now() / 1000);
const pointOf = data => {
  if (data.point == null) return null; // The table chooses a point manually; never silently aim at (0,0).
  need(Number.isFinite(data.point.x) && Number.isFinite(data.point.y), "Choose a valid blast point.");
  return { x: data.point.x, y: data.point.y };
};
const splashProcedure = (actor, secondary = false) => `Manual Splash resolution: choose a point within the weapon's range. No Attack Roll is made. Each Creature within Splash(X) makes a Dexterity save against ${martialDC(actor) == null ? "your chosen Martial DC (select STR/DEX from the panel)" : `Martial DC ${martialDC(actor)}`} (target owner rolls); non-proficiency grants Advantage. Roll weapon damage plus its Ability Modifier; ${secondary ? "halve this Secondary Detonation's damage; successful saves take NO damage" : "failed saves take full damage, successful saves half"}. Controlled Demolition adds the Target Lock bonus to that Target's trap/Splash save DC; use the trap's existing DC. At level 10+, Splash DC gains +2 and you may double X for weapons wielded during your Attack Action. At level 15+, double only Thunder damage against Vehicles/Structures. At level 18+, ignore Loading for your Grenade/Rocket Launchers; apply Thunder Resistance and immunity to your own Thunder damage, including delayed/secondary blasts, by hand. These DC, radius, Loading and defense rules are manual; native controls do not apply them automatically.`;

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
  if (dc == null) return null;
  const level = marksmanLevel(actor);

  // Sharpened Shrapnel (10th level): +2 Martial DC for Splash(X)
  if (level >= 10) dc += 2;

  // Controlled Demolition (1st level): +Target Lock bonus against locked target
  if (targetUuid && isTargetLocked(actor, targetUuid)) {
    dc += flag(actor, "marksman")?.targetLock?.bonus ?? targetLockBonus(actor);
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

    const point = pointOf(data);
    if (!point && !data.resolutionNotes) warn(warnings, "point", "Choose a visible grounded point within your Splash weapon's range; record it in the resolution notes.");
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Delayed Detonation replaces an Attack using a Splash(X) weapon.");
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
          weaponUuid: data.weaponUuid ?? null,
          sourceActorUuid: actor.uuid,
          resolutionNotes: data.resolutionNotes ?? "Point tracked manually by the table",
          placedAt: now(),
          detonatesAt: now() + 600
        };
        receipt.summary = `${actor.name} burrows a specially fused munition into a visible grounded point within the weapon's range. Record an invisible marker and a ten-minute timer by hand. As a Reaction to a Creature moving, detonate with the panel; otherwise resolve its automatic detonation at the ten-minute mark without spending a Reaction. Disarm as an Action while within 5 feet using the panel. The timer, marker, saves and damage application are manual. ${splashProcedure(actor)}`;
        receipt.result = { point, weaponName };
        if (data.resolutionNotes) receipt.summary += ` Resolution notes: ${data.resolutionNotes}`;
        return updates;
      }
    };
  },

  detonateMunition(actor, _state, data) {
    need(isArtilleryman(actor), "Delayed Detonation is an Artilleryman feature.");
    const warnings = [];
    const munition = flag(actor, "marksman")?.delayedMunition;
    if (!munition || !munition.active) {
      warn(warnings, "munition", "No active burrowed munition is currently deployed.");
    }
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm a Creature moved, or that the ten-minute automatic detonation is due.");
    const automatic = data.automatic === true;
    if (automatic && now() < Number(munition?.detonatesAt ?? Infinity)) warn(warnings, "timer", "The munition's ten-minute timer has not elapsed.");
    const reactions = getReactions(actor);
    if (!automatic && reactions?.available < 1) {
      warn(warnings, "reaction", `${actor.name} has no Reaction remaining.`);
    }

    return {
      warnings,
      title: "Delayed Detonation (Detonate)",
      apply(next, receipt) {
        if (!automatic) receipt.reaction = { requested: true, triggerId: `${receipt.id}-detonate` };
        const updates = {
          "flags.ak5e.marksman.delayedMunition.active": false
        };
        receipt.summary = `${actor.name} detonates the burrowed munition ${automatic ? "at the ten-minute timer (no Reaction)" : "as a Reaction to movement"}. ${splashProcedure(actor)}`;
        receipt.weaponUuid = munition?.weaponUuid;
        receipt.result = { detonated: true, point: munition?.point };
        if (munition?.resolutionNotes) receipt.summary += ` Deployment notes: ${munition.resolutionNotes}`;
        if (data.resolutionNotes) receipt.summary += ` Resolution notes: ${data.resolutionNotes}`;
        return updates;
      }
    };
  },

  disarmMunition(actor, _state, data) {
    need(isArtilleryman(actor), "Delayed Detonation is an Artilleryman feature.");
    const warnings = [];
    if (!data.triggerConfirmed) warn(warnings, "distance", "Disarming uses an Action while within 5 feet of the munition.");
    if (!flag(actor, "marksman")?.delayedMunition?.active) warn(warnings, "munition", "No active munition is deployed.");
    return { warnings, title: "Disarm Munition", apply(_next, receipt) {
      receipt.summary = `${actor.name} disarms the munition as an Action while within 5 feet. Remove its manual marker and timer.`;
      return { "flags.ak5e.marksman.delayedMunition.active": false };
    } };
  },

  secondaryDetonation(actor, _state, data) {
    need(isArtilleryman(actor), "Secondary Detonation is an Artilleryman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 4, "Secondary Detonation");
    const available = resourceValue(actor, { pool: "secondaryDetonation" });
    if (available < 1) {
      warn(warnings, "secondaryDetonation", "Secondary Detonation uses exhausted; uses clamp at 0.");
    }

    const point = pointOf(data);
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm Thunder damage from a Splash(X) weapon, a visible new centre within 15 feet of the original, and that this is not already a Secondary Detonation.");
    const originalDamage = data.originalDamage == null ? null : Number(data.originalDamage);
    need(originalDamage === null || Number.isSafeInteger(originalDamage) && originalDamage >= 0, "Enter actual original damage as a nonnegative whole number.");
    const secondaryDamage = originalDamage === null ? null : Math.floor(originalDamage / 2);

    return {
      warnings,
      title: "Secondary Detonation",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "secondaryDetonation", amount: 1, label: "Secondary Detonation" });
        receipt.summary = `${actor.name} causes a Secondary Detonation. Manual resolution: choose a visible new centre within 15 feet of the original blast; resolve the original Attack or Trap again at that point, halving its damage${secondaryDamage === null ? "" : ` (original ${originalDamage}, halved ${secondaryDamage})`}. Successful saves take NO damage. This blast cannot generate Secondary Detonations. Retain ${actor.name} as the damage source for self-immunity. ${splashProcedure(actor, true)}`;
        receipt.weaponUuid = data.weaponUuid;
        receipt.result = { point, secondaryDamage };
        if (data.resolutionNotes) receipt.summary += ` Resolution notes: ${data.resolutionNotes}`;
        return updates;
      }
    };
  },

  scatterThem(actor, _state, data) {
    need(isArtilleryman(actor), "Scatter Them is an Artilleryman feature.");
    const warnings = [];
    levelWarning(warnings, actor, 15, "Scatter Them");
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm Thunder damage from a Splash(X) weapon; only Creatures taking that damage are flung.");
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
        receipt.summary += " Manual resolution: move every Creature that took that Thunder damage directly away from the blast centre by 30 feet. On collision with a solid surface, roll 4d8 Bludgeoning from this card and apply with native controls; no collision means no additional damage.";
        receipt.formula = "4d8";
        receipt.damageParts = [{ formula: "4d8", type: "bludgeoning" }];
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
  const rolls = config.rolls ?? [];

  const weapon = activity.item;
  const isSplash = Boolean(weapon?.system?.properties?.has?.("splash") || flag(weapon, "splash"));

  // Explosive Expertise: +1d / +2d / +3d Thunder damage on Splash(X) weapons dealing Thunder damage
  for (const roll of rolls) {
    const types = roll.options?.types ?? (roll.options?.type ? [roll.options.type] : []);
    if (!roll.parts || !types.includes("thunder") || types.some(type => type !== "thunder")) continue;
  if (isSplash) {
    const diceCount = explosiveExpertiseDice(actor);
    if (diceCount > 0) {
      // Find weapon damage die (e.g. 1d8 from Grenade Launcher)
      const formula = roll.parts.find(part => typeof part === "string" && /d\d+/.test(part)) ?? "";
      const dieMatch = formula.match(/d(\d+)/);
      if (dieMatch) roll.parts.push(`${diceCount}d${dieMatch[1]}`);
    }
  }

  // Siege Attacker is recipient-specific: apply its Thunder doubling by hand,
  // including mixed blast targets. DamageRoll has no options.multiply consumer.
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
