/**
 * Infuser Specialist Subclass features (Ch. 3 L5688–5823 & DECISIONS.md L465).
 * Pure and functional logic, state inspection, resource pools, and mechanical hooks.
 * Supports Infuser DC (20 - INT - PB default with standard toggle), Principle of Double Effect,
 * all 8 Alchemical Infusions, Leverage CON save workflow & Lockout, New Concoctions,
 * Double-Blind Trial, Infuser Prowess gain triggers, Stimpack, Excessive Dosing,
 * and To Defy Science.
 */
import {
  SPECIALIST_CLASS_ID,
  isInfuser as checkIsInfuser,
  specialistLevel,
  specialistEnabled,
  pbForLevel,
  flag
} from "./specialist-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { need } from "./operation-kernel.mjs";

export const INFUSER_SUBCLASS_ID = "subclass-specialist-infuser";

/**
 * 8 Alchemical Infusions (Ch. 3 L5782–5823).
 * Frozen dictionary of all infusions and their leverage conditions/effects.
 */
export const INFUSIONS = Object.freeze({
  adrenalineTrigger: Object.freeze({
    id: "adrenalineTrigger",
    name: "Adrenaline Trigger",
    trigger: "Reaction when Creature fails STR Skill Check, Saving Throw, or misses Melee Attack",
    leverageCondition: "As a Reaction when the Creature fails a Strength Skill Check, Saving Throw, or misses a Melee Attack.",
    actionType: "reaction",
    leverageType: "reaction",
    formula: "1d6",
    effect: "The Creature rolls 1d6 and adds the result to their total result, possibly changing a failure into a Success."
  }),
  flightReflexStimulant: Object.freeze({
    id: "flightReflexStimulant",
    name: "Flight Reflex Stimulant",
    trigger: "Reaction when Creature fails any Saving Throw",
    leverageCondition: "As a Reaction when the Creature fails any Saving Throw.",
    actionType: "reaction",
    leverageType: "reaction",
    formula: null,
    effect: "The Creature adds your Intelligence Bonus to the result of that Saving Throw, possibly changing a failure into a Success."
  }),
  focusHeightener: Object.freeze({
    id: "focusHeightener",
    name: "Focus Heightener",
    trigger: "Reaction when Creature fails DEX Skill Check, Saving Throw, or misses Ranged Attack",
    leverageCondition: "As a Reaction when the Creature fails a Dexterity Skill Check, Saving Throw, or misses a Ranged Attack.",
    actionType: "reaction",
    leverageType: "reaction",
    formula: "1d6",
    effect: "The Creature rolls 1d6 and adds the result to their total result, possibly changing a failure into a Success."
  }),
  hesitationSuppressor: Object.freeze({
    id: "hesitationSuppressor",
    name: "Hesitation Suppressor",
    trigger: "Reaction when Creature forces a hostile Creature to make a Saving Throw",
    leverageCondition: "As a Reaction when the Creature forces a hostile Creature to make a Saving Throw.",
    actionType: "reaction",
    leverageType: "reaction",
    formula: "1d4",
    effect: "The Creature rolls 1d4; the DC of that Saving Throw is increased by the amount rolled."
  }),
  muscleStrengthener: Object.freeze({
    id: "muscleStrengthener",
    name: "Muscle Strengthener",
    trigger: "Reaction when Creature hits a Creature with a Melee Attack",
    leverageCondition: "As a Reaction when the Creature hits a Creature with a Melee Attack.",
    actionType: "reaction",
    leverageType: "reaction",
    formula: null,
    effect: "The Damage of that Melee Attack is increased by a value equal to your Intelligence Bonus."
  }),
  procoagulant: Object.freeze({
    id: "procoagulant",
    name: "Procoagulant",
    trigger: "Bonus Action",
    leverageCondition: "As a Bonus Action.",
    actionType: "bonus",
    leverageType: "bonus",
    formula: "1hd + @conMod",
    effect: "The Creature rolls one of their Hit Dice (this does not expend that Hit Dice) and adds their Constitution Modifier; they gain that many Temporary Hit Points. Additionally, if they have the Bleeding Condition, it is removed."
  }),
  respirationStimulant: Object.freeze({
    id: "respirationStimulant",
    name: "Respiration Stimulant",
    trigger: "Bonus Action",
    leverageCondition: "As a Bonus Action.",
    actionType: "bonus",
    leverageType: "bonus",
    formula: null,
    effect: "The Creature's Speed is increased by 10 feet until the end of the Turn."
  }),
  sensationNulling: Object.freeze({
    id: "sensationNulling",
    name: "Sensation Nulling",
    trigger: "Reaction when Creature takes Damage",
    leverageCondition: "As a Reaction when the Creature takes Damage.",
    actionType: "reaction",
    leverageType: "reaction",
    formula: "1d6",
    effect: "The Creature rolls 1d6; they gain Damage Reduction against all Damage equal to the result until the end of that Turn."
  })
});

/**
 * Double-Blind Trial 1d6 mapping (Ch. 3 L5735–5743).
 */
export const DOUBLE_BLIND_TABLE = Object.freeze({
  1: "Neurological Inhibitor",
  2: "Necrotoxin",
  3: "Haemotoxin",
  4: "Cytotoxin",
  5: "Neurotoxin",
  6: "Bungarotoxin"
});

let hooksInstalled = null;
let ak5eEventsInstalled = false;

export function getGameActors() {
  const actors = globalThis.game?.actors;
  if (!actors) return [];
  if (Array.isArray(actors)) return actors;
  if (Array.isArray(actors.contents)) return actors.contents;
  if (typeof actors.values === "function") return Array.from(actors.values());
  if (typeof actors[Symbol.iterator] === "function") {
    const list = Array.from(actors);
    if (list.length > 0 && Array.isArray(list[0]) && list[0].length === 2 && typeof list[0][1] === "object") {
      return list.map(entry => entry[1]);
    }
    return list;
  }
  return [];
}

/* ---------------------------------------------------------------- Identification & Predicates */

export function isInfuser(actor) {
  if (!actor) return false;
  return checkIsInfuser(actor);
}

/**
 * Calculates Infuser DC (Ch. 3 L5689 & DECISIONS.md L465).
 * Formula: 20 - INT mod - PB.
 * Eases DC for allies making the CON save to avoid Dazed & Lockout.
 * If useStandardFormula is true or GM ruling is 'standard', uses 8 + INT + PB.
 * Enforces Math.max(1, dc).
 */
export function calculateInfuserDC(actor, { useStandardFormula = false } = {}) {
  if (!actor) return 10;
  const intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
  const lvl = specialistLevel(actor) ?? 1;
  const pb = Number(actor.system?.attributes?.prof ?? pbForLevel(lvl));

  const ruling = actor.getFlag?.("ak5e", "specialist")?.rulings?.infuserDcReading?.value ??
                 actor.flags?.ak5e?.specialist?.rulings?.infuserDcReading?.value ??
                 actor.flags?.ak5e?.specialist?.rulings?.infuserDcReading ??
                 actor.flags?.ak5e?.specialist?.rulings?.infuserDcFormula ??
                 actor.flags?.ak5e?.infuserDcReading;

  if (useStandardFormula || ruling === "standard") {
    return Math.max(1, 8 + intMod + pb);
  }
  return Math.max(1, 20 - intMod - pb);
}

/**
 * Infusion range: 5 ft base, increased to 30 ft at level 11 (Delivery Service, Ch. 3 L5750).
 */
export function calculateInfusionRange(actor) {
  const lvl = specialistLevel(actor) ?? 1;
  return lvl >= 11 ? 30 : 5;
}

/**
 * Gets active infusion on target creature from flags.ak5e.infuser.activeInfusion.
 */
export function getActiveInfusion(target) {
  if (!target) return null;
  return target.getFlag?.("ak5e", "infuser")?.activeInfusion ??
         target.flags?.ak5e?.infuser?.activeInfusion ??
         null;
}

export function hasPrincipleOfDoubleEffect(actor) {
  return Boolean(isInfuser(actor) && specialistLevel(actor) >= 1);
}

export function hasNewConcoctions(actor) {
  return Boolean(isInfuser(actor) && specialistLevel(actor) >= 5);
}

export function hasDoubleBlindTrial(actor) {
  return Boolean(isInfuser(actor) && specialistLevel(actor) >= 5);
}

export function hasStimpack(actor) {
  return Boolean(isInfuser(actor) && specialistLevel(actor) >= 11);
}

export function hasExcessiveDosing(actor) {
  return Boolean(isInfuser(actor) && specialistLevel(actor) >= 15);
}

export function hasToDefyScience(actor) {
  return Boolean(isInfuser(actor) && specialistLevel(actor) >= 20);
}

/**
 * Toxin DC: Base 15, increased by PB with Excessive Dosing (Succumb, Ch. 3 L5761).
 */
export function getToxinDC(actor, baseDC = 15) {
  if (hasExcessiveDosing(actor)) {
    const pb = Number(actor.system?.attributes?.prof ?? pbForLevel(specialistLevel(actor) ?? 1));
    return baseDC + pb;
  }
  return baseDC;
}

/* ---------------------------------------------------------------- Resource Pools */

export function defineInfuserPools() {
  if (!getPoolDefinition("alchemicalInfusions")) {
    definePool({
      id: "alchemicalInfusions",
      label: "Alchemical Infusions",
      max: "2 * @prof",
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isInfuser(actor),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("toDefyScience")) {
    definePool({
      id: "toDefyScience",
      label: "To Defy Science",
      max: 1,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isInfuser(actor) && (specialistLevel(actor) >= 20),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

/* ---------------------------------------------------------------- Hook Implementations */

/**
 * Muscle Strengthener bonus (+INT mod to Melee Attack Damage, Ch. 3 L5805)
 * and Cytotoxin bonus (+1d6 poison damage on weapon attack, Ch. 3 L5740).
 */
export function infuserPreRollDamage(configOrRoll, maybeConfig) {
  const config = configOrRoll?.rolls ? configOrRoll : (maybeConfig?.rolls ? maybeConfig : configOrRoll);
  const actor = config?.subject?.actor ?? config?.actor;
  if (!actor) return;

  const roll = config?.rolls?.[0];
  if (!roll) return;
  roll.options ??= {};
  if (roll.options._ak5eInfuserDamageApplied) return;
  roll.options._ak5eInfuserDamageApplied = true;
  roll.parts ??= [];

  // 1. Muscle Strengthener: +INT bonus to melee attack damage
  const activeInf = getActiveInfusion(actor);
  const isMuscleStrengthener = (activeInf?.type === "muscleStrengthener" && actor.flags?.ak5e?.infuser?.muscleStrengthenerActive) ||
                              roll.options?._ak5eMuscleStrengthener ||
                              config.isMuscleStrengthener;
  if (isMuscleStrengthener && (config.actionType === "mwak" || config.isMelee || roll.options?.actionType === "mwak")) {
    const intBonus = Number(activeInf?.infuserIntBonus ?? activeInf?.intBonus ?? actor.system?.abilities?.int?.mod ?? 0);
    if (intBonus > 0 && !roll._ak5eMuscleStrengthenerApplied) {
      roll._ak5eMuscleStrengthenerApplied = true;
      roll.parts.push(`${intBonus}`);
    }
  }

  // 2. Cytotoxin: +1d6 poison damage on weapon attack
  const appliedToxin = actor.getFlag?.("ak5e", "appliedToxin") ?? actor.flags?.ak5e?.appliedToxin;
  if (appliedToxin?.type === "Cytotoxin" || appliedToxin?.name === "Cytotoxin") {
    if (!roll._ak5eCytotoxinApplied) {
      roll._ak5eCytotoxinApplied = true;
      roll.parts.push("1d6[poison]");
    }
  }
}

/**
 * Pre-apply damage hook:
 * 1. To Defy Science: Invulnerability - target cannot lose Hit Points for 1 minute (Ch. 3 L5768).
 * 2. Sensation Nulling: Damage Reduction equal to rolled 1d6 against all damage until end of turn (Ch. 3 L5822).
 */
export function infuserPreApplyDamage(actor, amount, updates, options) {
  if (!actor) return true;

  // 1. To Defy Science Invulnerability
  const invulnerable = actor.getFlag?.("ak5e", "infuser")?.invulnerable ?? actor.flags?.ak5e?.infuser?.invulnerable;
  if (invulnerable) {
    const currentHp = Number(actor.system?.attributes?.hp?.value ?? 0);
    const currentTemp = Number(actor.system?.attributes?.hp?.temp ?? 0);
    if (updates) {
      if ("system.attributes.hp.value" in updates) updates["system.attributes.hp.value"] = currentHp;
      if ("system.attributes.hp.temp" in updates) updates["system.attributes.hp.temp"] = currentTemp;
    }
    return false;
  }

  // 2. Sensation Nulling DR
  const dr = Number(actor.getFlag?.("ak5e", "infuser")?.sensationNullingDR ?? actor.flags?.ak5e?.infuser?.sensationNullingDR ?? 0);
  if (dr > 0 && updates) {
    const currentHp = Number(actor.system?.attributes?.hp?.value ?? 0);
    const newHp = updates["system.attributes.hp.value"];
    if (typeof newHp === "number" && newHp < currentHp) {
      const damageTaken = currentHp - newHp;
      const mitigated = Math.max(0, damageTaken - dr);
      updates["system.attributes.hp.value"] = currentHp - mitigated;
    }
  }

  return true;
}

/* ---------------------------------------------------------------- Lifecycle & Event Hooks */

export function registerInfuserHooks() {
  defineInfuserPools();

  if (globalThis.Hooks?.on && hooksInstalled !== globalThis.Hooks) {
    hooksInstalled = globalThis.Hooks;
    Hooks.on("dnd5e.preRollDamageV2", infuserPreRollDamage);
    Hooks.on("dnd5e.preApplyDamage", infuserPreApplyDamage);
  }

  if (ak5eEventsInstalled) return;
  ak5eEventsInstalled = true;

  // 1. Kill event: Poisoned or Toxined creature drops to 0 HP -> +1 Prowess (Ch. 3 L5745)
  onAk5eEvent("kill", async event => {
    const deadUuid = event.actorUuid ?? event.tokenUuid;
    if (!deadUuid) return;

    const deadActor = event.raw?.actor ?? (deadUuid ? globalThis.fromUuidSync?.(deadUuid) : null);
    const isPoisoned = Boolean(
      deadActor?.statuses?.has?.("poisoned") ||
      deadActor?.flags?.ak5e?.poisoned ||
      event.poisoned ||
      event.isPoisoned ||
      deadActor?.effects?.some?.(e => e.statuses?.has?.("poisoned") || e.name?.toLowerCase().includes("poison"))
    );
    const hasToxin = Boolean(
      deadActor?.flags?.ak5e?.toxin ||
      deadActor?.flags?.ak5e?.appliedToxin ||
      event.toxined ||
      event.isToxined
    );

    if (isPoisoned || hasToxin) {
      const actors = getGameActors();
      for (const infuser of actors) {
        if (!isInfuser(infuser)) continue;
        await refundPool(infuser, "prowess", 1, { reason: "Poisoned/Toxined creature reduced to 0 HP" });
      }
    }
  });

  // 2. Turn start: reset per-turn/per-round flags and leverage lockout if no longer Dazed
  onAk5eEvent("turnStart", async event => {
    const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
    if (!actor) return;

    const updates = {};
    if (isInfuser(actor)) {
      updates["flags.ak5e.infuser.prowessGainedFromInfusionThisRound"] = false;
    }

    const isDazed = Boolean(actor.statuses?.has?.("dazed") || actor.flags?.ak5e?.dazed);
    if (!isDazed && (actor.flags?.ak5e?.infuser?.leverageLockout || actor.flags?.ak5e?.infuser?.sensationNullingDR)) {
      updates["flags.ak5e.infuser.leverageLockout"] = false;
      updates["flags.ak5e.infuser.sensationNullingDR"] = 0;
      updates["flags.ak5e.infuser.muscleStrengthenerActive"] = false;
    }

    if (Object.keys(updates).length > 0) {
      if (typeof actor.update === "function") {
        await actor.update(updates);
      } else if (actor.flags?.ak5e?.infuser) {
        if (updates["flags.ak5e.infuser.prowessGainedFromInfusionThisRound"] !== undefined) {
          actor.flags.ak5e.infuser.prowessGainedFromInfusionThisRound = false;
        }
        if (updates["flags.ak5e.infuser.leverageLockout"] !== undefined) {
          actor.flags.ak5e.infuser.leverageLockout = false;
        }
        if (updates["flags.ak5e.infuser.sensationNullingDR"] !== undefined) {
          actor.flags.ak5e.infuser.sensationNullingDR = 0;
        }
        if (updates["flags.ak5e.infuser.muscleStrengthenerActive"] !== undefined) {
          actor.flags.ak5e.infuser.muscleStrengthenerActive = false;
        }
      }
    }
  });
}
