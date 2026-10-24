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
import { hasWeaponProperty, weaponDamageParts, weaponPropertyValue, weaponRange } from "./weapon-properties.mjs";

export const isArtilleryman = actor => marksmanEnabled(actor) && marksmanBranch(actor) === "artilleryman";
const now = () => Number(globalThis.game?.time?.worldTime ?? Date.now() / 1000);
const pointOf = data => {
  if (data.point == null) return null; // The table chooses a point manually; never silently aim at (0,0).
  need(Number.isFinite(data.point.x) && Number.isFinite(data.point.y), "Choose a valid blast point.");
  return { x: data.point.x, y: data.point.y };
};
const splashProcedure = (actor, secondary = false, data = {}) => {
  const baseDC = splashBaseDC(actor, data), exampleDC = artillerymanSplashDC(actor, null, baseDC);
  return `Choose the visible point and affected Creatures on the map. No Attack Roll is made. The target owner rolls the Dexterity save against ${exampleDC == null ? "the chosen Martial DC" : `Splash DC ${exampleDC}`}; non-proficiency grants Advantage. Roll weapon Damage plus its Ability Modifier from this card, then Apply each target's reviewed outcome. ${secondary ? "Secondary Damage is halved; successful saves take NO Damage." : "Successful saves take half Damage."} The card includes target-specific Controlled Demolition, Sharpened Shrapnel and typed Explosive Expertise. Mark Vehicles/Structures when applying Siege Attacker. At level 18, Grenade/Rocket Launchers ignore Loading and Thunder defenses retain this Actor as the source. Area geometry, movement and collision are reviewed by the table.`;
};
const addStep = (receipt, step) => { (receipt.resolution ??= { version: 1, steps: [] }).steps.push(step); };
const weaponFor = (actor, data) => actor.items?.get?.(data.weaponId) ?? Array.from(actor.items?.values?.() ?? actor.items ?? []).find(item =>
  Boolean(data.weaponUuid && item.uuid === data.weaponUuid) || Boolean(data.weaponId && item.id === data.weaponId));
const abilityModifier = (actor, weapon, data) => {
  const selected = data.ability ?? weapon?.system?.ability ?? "dex";
  if (Number.isFinite(Number(data.abilityModifier))) return Number(data.abilityModifier);
  return Number(actor.system?.abilities?.[selected]?.mod ?? 0);
};
function splashBaseDC(actor, data) {
  const dc = data.manualDC == null
    ? martialDC(actor, data.martialDcAbility ?? flag(actor, "marksman")?.martialDcAbility)
    : Number(data.manualDC);
  if (dc != null && (!Number.isInteger(dc) || dc < 1 || dc > 99)) throw new Error("Enter a valid whole-number Martial DC.");
  return dc;
}

function addSplashSteps(actor, receipt, data, weapon, { secondary = false, scale = 1, munition = null, originalDamage = null } = {}) {
  const radiusValue = weaponPropertyValue(weapon, "splash", 0) || Number(data.manualSplashRadius ?? munition?.radiusFt ?? 0);
  need(Number.isFinite(radiusValue) && radiusValue > 0, "Enter a positive Splash radius for this use.");
  const splash = radiusValue;
  const enhanced = !secondary && data.enhancedPayload === true && marksmanLevel(actor) >= 10 && data.attackAction === true;
  const radius = splash * (enhanced ? 2 : 1), baseParts = weaponDamageParts(weapon);
  need(baseParts.length > 0, "The selected Splash weapon has no typed damage part.");
  const expertise = baseParts.some(part => part.type === "thunder") ? explosiveExpertiseDice(actor) : 0;
  const ability = abilityModifier(actor, weapon, data), targets = [...new Set((data.targetUuids ?? []).filter(Boolean))];
  const baseDC = splashBaseDC(actor, data);
  for (const targetUuid of targets) {
    const dc = artillerymanSplashDC(actor, targetUuid, baseDC);
    const fixedSource = data.originalDamageByTarget?.[targetUuid] ?? originalDamage;
    const fixed = Number(fixedSource), hasFixedDamage = fixedSource != null && Number.isFinite(fixed);
    const parts = hasFixedDamage
      ? [{ amount: Math.floor(fixed / 2), type: baseParts.find(part => part.type === "thunder")?.type ?? baseParts[0].type }]
      : baseParts.map((part, index) => ({ formula: `${part.formula}${index === 0 && ability ? ` + ${ability}` : ""}${part.type === "thunder" && expertise ? ` + ${expertise}d${(part.formula.match(/d(\d+)/i) ?? [null, 8])[1]}` : ""}`, type: part.type }));
    const id = `${secondary ? "secondary" : munition ? "delayed" : "splash"}-${encodeURIComponent(targetUuid)}`;
    addStep(receipt, { id, kind: "damage", label: secondary ? "Secondary Detonation" : munition ? "Delayed Detonation" : "Splash", targetUuids: [targetUuid],
      damageParts: parts, rollGroupId: secondary ? "secondary-blast" : "splash-blast", damageScale: hasFixedDamage ? 1 : scale, save: { ability: "dex", dc, success: secondary ? "zero" : "half",
        ...(weapon.system?.proficient === false || Number(weapon.system?.proficient) === 0 ? { advantage: true } : {}) },
      ...(marksmanLevel(actor) >= 15 && baseParts.some(part => part.type === "thunder") ? { siegeAttacker: true } : {}),
      originUseId: data.originUseId ?? null, sourceActorUuid: actor.uuid, weaponUuid: weapon.uuid, activityId: data.activityId,
      splash: { point: data.point ?? munition?.point ?? null, radiusFt: radius, noAttackRoll: true, nonProficientSaveAdvantage: true,
        enhancedPayload: enhanced, secondary, originalUseId: data.originUseId ?? null } });
  }
}

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
export function artillerymanSplashDC(actor, targetUuid = null, baseDC = martialDC(actor)) {
  let dc = baseDC;
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
  splash(actor, _state, data) {
    need(isArtilleryman(actor), "Splash is an Artilleryman feature.");
    const warnings = [], weapon = weaponFor(actor, data);
    need(weapon, "Choose an owned Splash weapon.");
    const range = weaponRange(weapon), point = pointOf(data);
    if (!hasWeaponProperty(weapon, "splash") && !(Number(data.manualSplashRadius) > 0)) warn(warnings, "splashProperty", "This weapon has no recorded Splash(X) value; enter the table-approved radius for this use.");
    if (!point) warn(warnings, "point", "Choose the visible blast point within the weapon's range.");
    if (point && data.rangeFt != null && Number(data.rangeFt) > (range.long || range.normal)) warn(warnings, "range", `Blast point is beyond the weapon's long range (${range.long || range.normal} ft).`);
    if (!data.targetUuids?.length) warn(warnings, "targets", "Select the Creatures in the Splash area; area geometry remains a table decision.");
    const dc = splashBaseDC(actor, data);
    if (dc == null) warn(warnings, "martialDC", "Choose Strength or Dexterity for Martial DC, or enter a manual DC for this use.");
    if (data.enhancedPayload === true && !(marksmanLevel(actor) >= 10 && data.attackAction === true)) warn(warnings, "enhancedPayload", "Enhanced Payload doubles Splash(X) only for weapons you wield when taking the Attack Action.");
    return { warnings, title: "Splash", apply(_next, receipt) {
      receipt.weaponUuid = weapon.uuid;
      receipt.result = { noAttackRoll: true, point, radiusFt: (weaponPropertyValue(weapon, "splash", 0) || Number(data.manualSplashRadius ?? 0)) * (data.enhancedPayload && marksmanLevel(actor) >= 10 && data.attackAction ? 2 : 1), dc };
      receipt.summary = `${actor.name} resolves Splash from ${weapon.name} at the chosen point. No Attack Roll; each selected Creature rolls its Dexterity save. ${splashProcedure(actor, false, data)}`;
      addSplashSteps(actor, receipt, data, weapon);
      return {};
    } };
  },

  delayedDetonation(actor, _state, data) {
    need(isArtilleryman(actor), "Delayed Detonation is an Artilleryman feature.");
    const warnings = [];
    const weapon = weaponFor(actor, data);
    need(weapon, "Choose the owned weapon used to deploy the munition.");
    if (!hasWeaponProperty(weapon, "splash") && !(Number(data.manualSplashRadius) > 0)) warn(warnings, "splashProperty", "This weapon has no recorded Splash(X) value; enter the table-approved radius for this use.");
    const range = weaponRange(weapon);
    const available = resourceValue(actor, { pool: "delayedDetonation" });
    if (available < 1) {
      warn(warnings, "delayedDetonation", "Delayed Detonation has already been used; uses clamp at 0.");
    }

    const point = pointOf(data);
    if (!point && !data.resolutionNotes) warn(warnings, "point", "Choose a visible grounded point within your Splash weapon's range; record it in the resolution notes.");
    if (point && data.rangeFt != null && Number(data.rangeFt) > (range.normal || range.long)) warn(warnings, "range", `The grounded point is beyond the weapon's normal range (${range.normal || range.long} ft).`);
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Delayed Detonation replaces an Attack using a Splash(X) weapon.");
    const weaponName = data.weaponName ?? "Launcher";

    return {
      warnings,
      title: "Delayed Detonation (Deploy)",
      apply(next, receipt) {
        const updates = spendResource(actor, receipt, { pool: "delayedDetonation", amount: 1, label: "Delayed Detonation" });
        const munitionId = String(data.munitionId ?? `${receipt.id}-munition`);
        const munitions = Array.isArray(flag(actor, "marksman")?.delayedMunitions) ? [...flag(actor, "marksman").delayedMunitions] : [];
        updates["flags.ak5e.marksman.delayedMunitions"] = [...munitions.filter(entry => entry.id !== munitionId), {
          id: munitionId, active: true,
          point,
          radiusFt: weaponPropertyValue(weapon, "splash", 0) || Number(data.manualSplashRadius ?? 0),
          weaponName,
          weaponUuid: weapon.uuid,
          activityId: data.activityId ?? null,
          sourceActorUuid: actor.uuid,
          deploymentUseId: receipt.id,
          resolutionNotes: data.resolutionNotes ?? "Point tracked manually by the table",
          placedAt: now(),
          detonatesAt: now() + 600
        }];
        receipt.summary = `${actor.name} burrows a specially fused munition into a visible grounded point within the weapon's range. Record an invisible marker and a ten-minute timer by hand. As a Reaction to a Creature moving, detonate with the panel; otherwise resolve its automatic detonation at the ten-minute mark without spending a Reaction. Disarm as an Action while within 5 feet using the panel. The timer, marker, saves and damage application are manual. ${splashProcedure(actor, false, data)}`;
        receipt.result = { munitionId, point, weaponName };
        addStep(receipt, { id: `timer-${encodeURIComponent(munitionId)}`, kind: "effect", label: `Delayed munition ${munitionId}: ten-minute timer`, targetUuids: [actor.uuid],
          trigger: { event: "worldTime", at: now() + 600 }, sourceActorUuid: actor.uuid, munitionId });
        if (data.resolutionNotes) receipt.summary += ` Resolution notes: ${data.resolutionNotes}`;
        return updates;
      }
    };
  },

  detonateMunition(actor, _state, data) {
    need(isArtilleryman(actor), "Delayed Detonation is an Artilleryman feature.");
    const warnings = [];
    const state = flag(actor, "marksman") ?? {};
    const munition = (state.delayedMunitions ?? []).find(entry => entry.active && (entry.id === data.munitionId ||
      (data.originUseId && (entry.deploymentUseId === data.originUseId || entry.originUseId === data.originUseId)))) ??
      (state.delayedMunition?.active && (!data.munitionId || state.delayedMunition.id === data.munitionId) ? state.delayedMunition : null);
    if (!munition || !munition.active) {
      warn(warnings, "munition", "No active burrowed munition is currently deployed.");
    }
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm a Creature moved, or that the ten-minute automatic detonation is due.");
    if (munition && !(weaponPropertyValue(weaponFor(actor, { weaponUuid: munition.weaponUuid }), "splash", 0) || munition.radiusFt > 0)) warn(warnings, "radius", "Enter the table-approved Splash radius for this munition.");
    if (splashBaseDC(actor, data) == null) warn(warnings, "martialDC", "Choose STR or DEX for Martial DC, or enter a manual DC for this detonation.");
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
        const updates = { "flags.ak5e.marksman.delayedMunitions": (state.delayedMunitions ?? []).map(entry => entry.id === munition?.id ? { ...entry, active: false } : entry) };
        if (state.delayedMunition?.active && (!munition?.id || state.delayedMunition.id === munition.id)) updates["flags.ak5e.marksman.delayedMunition.active"] = false;
        receipt.summary = `${actor.name} detonates the burrowed munition ${automatic ? "at the ten-minute timer (no Reaction)" : "as a Reaction to movement"}. ${splashProcedure(actor, false, data)}`;
        receipt.weaponUuid = munition?.weaponUuid;
        receipt.result = { detonated: true, point: munition?.point };
        const weapon = weaponFor(actor, { weaponUuid: munition?.weaponUuid });
        if (weapon && data.targetUuids?.length) addSplashSteps(actor, receipt, { ...data, munitionId: munition?.id, point: munition?.point }, weapon, { munition });
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
    const state = flag(actor, "marksman") ?? {};
    const munition = (state.delayedMunitions ?? []).find(entry => entry.active && (entry.id === data.munitionId ||
      (data.originUseId && entry.deploymentUseId === data.originUseId))) ?? (state.delayedMunition?.active ? state.delayedMunition : null);
    if (!munition) warn(warnings, "munition", "No active munition is deployed.");
    return { warnings, title: "Disarm Munition", apply(_next, receipt) {
      receipt.summary = `${actor.name} disarms the munition as an Action while within 5 feet. Remove its manual marker and timer.`;
      return { "flags.ak5e.marksman.delayedMunitions": (state.delayedMunitions ?? []).map(entry => entry.id === munition?.id ? { ...entry, active: false } : entry),
        ...(state.delayedMunition?.active && (!data.munitionId || state.delayedMunition.id === data.munitionId) ? { "flags.ak5e.marksman.delayedMunition.active": false } : {}) };
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
    const weapon = weaponFor(actor, data);
    if (!weapon) warn(warnings, "weapon", "Select the weapon that caused the qualifying Thunder Damage.");
    if (weapon && !hasWeaponProperty(weapon, "splash") && !(Number(data.manualSplashRadius) > 0)) warn(warnings, "splashProperty", "This weapon has no recorded Splash(X) value; enter the table-approved radius for this use.");
    if (!data.originUseId) warn(warnings, "origin", "Bind this Secondary Detonation to its originating Splash/Trap use to prevent chaining.");
    if (splashBaseDC(actor, data) == null) warn(warnings, "martialDC", "Choose STR or DEX for Martial DC, or enter a manual DC for this detonation.");
    if (!data.triggerConfirmed) warn(warnings, "trigger", "Confirm Thunder damage from a Splash(X) weapon, a visible new centre within 15 feet of the original, and that this is not already a Secondary Detonation.");
    const originalDamage = data.originalDamage == null ? null : Number(data.originalDamage);
    need(originalDamage === null || Number.isSafeInteger(originalDamage) && originalDamage >= 0, "Enter actual original damage as a nonnegative whole number.");
    const secondaryDamage = originalDamage === null ? null : Math.floor(originalDamage / 2);
    const original = data.originUseId && marksmanUses.receipt(actor, data.originUseId);
    if (original?.command === "secondaryDetonation" || original?.result?.noChaining) warn(warnings, "secondaryChain", "A Secondary Detonation cannot generate another Secondary Detonation.");
    if (original?.result?.point && point) {
      const grid = globalThis.canvas?.grid;
      const distance = grid?.size ? Math.hypot(point.x - original.result.point.x, point.y - original.result.point.y) / grid.size * Number(grid.distance ?? 5) : null;
      if (distance != null && distance > 15) warn(warnings, "centreRange", `Secondary centre is ${Math.round(distance)} feet from the original; the source allows 15 feet.`);
    }

    return {
      warnings,
      title: "Secondary Detonation",
      reading: "secondaryDetonationDamage",
      apply(next, receipt, reading) {
        const updates = spendResource(actor, receipt, { pool: "secondaryDetonation", amount: 1, label: "Secondary Detonation" });
        const useOriginal = reading?.value === "originalTotal" || reading === "originalTotal";
        const priorRoll = original && marksmanUses.state(actor).undo.find(entry => entry.parentUseId === original.id && entry.command === "rollResolution" && Number.isFinite(entry.roll));
        const chosenOriginal = originalDamage ?? priorRoll?.roll ?? null;
        need(!useOriginal || chosenOriginal !== null || data.targetUuids?.every(uuid => Number.isFinite(data.originalDamageByTarget?.[uuid])), "Enter or select the original rolled Damage before reusing its total.");
        receipt.summary = `${actor.name} causes a Secondary Detonation. Select only Creatures in the new centre within 15 feet of the originating blast. ${useOriginal ? `Reuse the original Damage total${originalDamage == null ? " after recording it" : ` (${originalDamage})`}, then halve it.` : "Roll the original Attack or Trap's Damage again, then halve the new total."} Successful saves take no Damage. This blast cannot generate another Secondary Detonation. ${splashProcedure(actor, true, data)}`;
        receipt.weaponUuid = data.weaponUuid;
        receipt.result = { point, originalDamage, secondaryDamage: originalDamage == null ? null : Math.floor(originalDamage / 2),
          damageReading: useOriginal ? "originalTotal" : "freshRoll", noChaining: true };
        if (weapon && data.targetUuids?.length) addSplashSteps(actor, receipt, data, weapon, { secondary: true, scale: 0.5,
          ...(useOriginal ? { originalDamage: chosenOriginal } : {}) });
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
        const collisions = [...new Set((data.collisionTargetUuids ?? []).filter(uuid => (data.targetUuids ?? []).includes(uuid)))];
        for (const targetUuid of collisions) addStep(receipt, { id: `scatter-collision-${encodeURIComponent(targetUuid)}`, kind: "damage",
          label: "Scatter Them: collision damage", targetUuids: [targetUuid], damageParts: [{ formula: "4d8", type: "bludgeoning" }],
          sourceActorUuid: actor.uuid, originUseId: data.originUseId ?? null });
        return updates;
      }
    };
  }
};

export const ARTILLERYMAN_READINGS = Object.freeze({
  secondaryDetonationDamage: Object.freeze({ label: "Secondary Detonation damage roll", options: Object.freeze([
    Object.freeze({ value: "freshRoll", label: "Roll the originating weapon/Trap damage again, then halve it" }),
    Object.freeze({ value: "originalTotal", label: "Reuse the originating damage total, then halve it" })
  ]) })
});
ARTILLERYMAN_PLANS.splashAttack = ARTILLERYMAN_PLANS.splash;
marksmanUses.register({ plans: ARTILLERYMAN_PLANS, readings: ARTILLERYMAN_READINGS });

/* ---------------------------------------------------------------- Hooks */

export function artillerymanPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isArtilleryman(actor)) return;
  const rolls = config.rolls ?? [];

  const weapon = activity.item;
  const isSplash = hasWeaponProperty(weapon, "splash");

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

  // Siege Attacker is recipient-specific; the recorded Splash step doubles only
  // Thunder damage against each Vehicle or Structure target independently.
  }
}

/** Used by the native activity adapter to exempt launchers from Loading at 18th level. */
export function artillerymanIgnoresLoading(actor, weapon) {
  return isArtilleryman(actor) && marksmanLevel(actor) >= 18 && hasWeaponProperty(weapon, "loading")
    && /grenade|rocket/i.test(String(weapon?.name ?? ""));
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
