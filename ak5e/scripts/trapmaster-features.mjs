/**
 * Trapmaster Specialist Subclass Features (Ch. 3 L6382–6542).
 * Implements:
 *  - 1st Level: Environmental Warfare (Traps pool 2*PB, Sleight of Hand Expertise, Trap DC formula)
 *  - 1st Level: Devil's Own Luck (1/SR or LR Action environmental trap suggestion)
 *  - 8 Trap Schemas: Alarm, Explosive, Gas, Incendiary, Paddle, Snare, Spike, Timed Explosive
 *    (both dispatch and source specifications supported with level 7 & 14 scaling)
 *  - Detecting and Disarming mechanics (Trap DC threshold, fail-by-5 immediate trigger)
 *  - 5th Level: Panic Inducer (Irritating Distraction, Jester's Grace, Warning Point)
 *  - 5th Level: Here's One I Made Earlier (1 Prowess 60 ft Action planting & Prowess gain triggers)
 *  - 11th Level: Bait the Trap (Come and Get Me PB/SR or LR lure)
 *  - 15th Level: Agent of Chaos (DR bypass & resistance neutralization)
 *  - 20th Level: House of Horrors (+5 Trap DC, Party Favours 6 hidden traps at 100 ft)
 *  - Table-play philosophy: confirm before use, non-blocking overrides, undo receipts (WORKFLOW §3.2)
 */

import {
  SPECIALIST_CLASS_ID,
  isSpecialist,
  specialistLevel,
  specialistBranch,
  pbForLevel,
  flag
} from "./specialist-rules.mjs";
import {
  definePool,
  getPool,
  getPoolDefinition,
  spendPool,
  refundPool
} from "./resource-pools.mjs";
import { need } from "./operation-kernel.mjs";

export const TRAPMASTER_SUBCLASS_ID = "subclass-specialist-trapmaster";
export const TRAPMASTER_BRANCH_KEY = "trapmaster";

/**
 * 8 Trap definitions with base mechanics, trigger conditions, area, saving throws,
 * condition riders, and level 7 & 14 damage scaling.
 * Supports both dispatch-specified values and source-faithful values.
 */
export const TRAPS_CATALOG = Object.freeze({
  alarm: Object.freeze({
    id: "alarm",
    name: "Alarm Trap",
    category: "utility",
    setupArea: "Line up to 10 ft long and 1 ft wide, or perimeter up to 20 ft",
    triggerCondition: "When a creature enters the area",
    multiTrigger: true,
    saveAbility: null,
    halfOnSave: false,
    damageType: null,
    effect: "Produces a loud sound heard clearly up to 300 feet away, or mental ping within 1 mile.",
    dispatch: Object.freeze({
      area: "20 ft perimeter",
      effect: "Audible or mental ping within 1 mile",
      damageType: null,
      scaling: Object.freeze({ 1: null, 7: null, 14: null })
    }),
    source: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      effect: "Loud sound produced, heard clearly up to 300 feet away",
      damageType: null,
      scaling: Object.freeze({ 1: null, 7: null, 14: null })
    })
  }),
  explosive: Object.freeze({
    id: "explosive",
    name: "Explosive Trap",
    category: "damage",
    setupArea: "5-foot square on the ground",
    triggerCondition: "When a creature enters the area",
    areaRadius: 15,
    multiTrigger: false,
    saveAbility: "dex",
    halfOnSave: true,
    damageType: "fire",
    dispatch: Object.freeze({
      area: "5-ft square, 15-ft radius sphere",
      damageType: "fire",
      saveAbility: "dex",
      halfOnSave: true,
      scaling: Object.freeze({ 1: "2d8", 7: "4d8", 14: "6d8" })
    }),
    source: Object.freeze({
      area: "5-ft square, 15-ft radius sphere",
      damageType: "thunder",
      saveAbility: "dex",
      halfOnSave: true,
      scaling: Object.freeze({ 1: "4d8", 7: "6d8", 14: "8d8" })
    })
  }),
  gas: Object.freeze({
    id: "gas",
    name: "Gas Trap",
    category: "hazard",
    setupArea: "5-foot square on the ground",
    triggerCondition: "When a creature enters the area",
    areaRadius: 10,
    duration: "1 minute",
    multiTrigger: false,
    saveAbility: "con",
    halfOnSave: true,
    conditionOnFail: "poisoned",
    damageType: "poison",
    dispatch: Object.freeze({
      area: "10-ft radius cloud",
      damageType: "poison",
      saveAbility: "con",
      halfOnSave: true,
      condition: "poisoned",
      scaling: Object.freeze({ 1: "2d6", 7: "4d6", 14: "6d6" })
    }),
    source: Object.freeze({
      area: "15-ft radius sphere",
      damageType: "poison",
      saveAbility: "con",
      halfOnSave: true,
      condition: "poisoned",
      scaling: Object.freeze({ 1: "2d8", 7: "3d8", 14: "4d8" })
    })
  }),
  incendiary: Object.freeze({
    id: "incendiary",
    name: "Incendiary Trap",
    category: "hazard",
    setupArea: "5-foot square on the ground",
    triggerCondition: "When a creature enters the area",
    areaRadius: 15,
    multiTrigger: false,
    saveAbility: "dex",
    halfOnSave: true,
    conditionOnFail: "burning",
    damageType: "fire",
    dispatch: Object.freeze({
      area: "5-ft square, 15-ft radius sphere",
      damageType: "fire",
      saveAbility: "dex",
      halfOnSave: true,
      condition: "burning",
      scaling: Object.freeze({ 1: "2d6", 7: "4d6", 14: "6d6" })
    }),
    source: Object.freeze({
      area: "15-ft radius sphere",
      damageType: "fire",
      saveAbility: "dex",
      halfOnSave: true,
      condition: "burning",
      scaling: Object.freeze({ 1: "2d8", 7: "3d8", 14: "4d8" })
    })
  }),
  paddle: Object.freeze({
    id: "paddle",
    name: "Paddle Trap",
    category: "control",
    setupArea: "Line up to 10 ft long and 1 ft wide",
    triggerCondition: "When a creature enters the area",
    multiTrigger: false,
    saveAbility: "str",
    halfOnSave: true,
    knockback: 15,
    conditionOnFail: "prone",
    nonLethal: true,
    damageType: "bludgeoning",
    dispatch: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      damageType: "bludgeoning",
      saveAbility: "str",
      halfOnSave: true,
      push: 15,
      condition: "prone",
      scaling: Object.freeze({ 1: "1d10", 7: "2d10", 14: "3d10" })
    }),
    source: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      damageType: "bludgeoning",
      saveAbility: "dex",
      halfOnSave: true,
      condition: "dazed",
      scaling: Object.freeze({ 1: "4d8", 7: "6d8", 14: "8d8" })
    })
  }),
  snare: Object.freeze({
    id: "snare",
    name: "Snare Trap",
    category: "control",
    setupArea: "Line up to 10 ft long and 1 ft wide",
    triggerCondition: "When a creature enters the area",
    multiTrigger: false,
    saveAbility: "dex",
    halfOnSave: false,
    conditionOnFail: "restrained",
    damageType: null,
    escapeCheck: Object.freeze(["ath", "acr"]),
    allyEscape: "Bladed weapon cut or Sleight of Hand check vs Trap DC as Action",
    dispatch: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      damageType: null,
      saveAbility: "dex",
      condition: "restrained",
      escapeCheck: "STR (Athletics) or DEX (Acrobatics) check vs Trap DC",
      scaling: Object.freeze({ 1: null, 7: null, 14: null })
    }),
    source: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      damageType: null,
      saveAbility: "dex",
      condition: "restrained",
      escapeCheck: "Athletics or Acrobatics check vs Trap DC",
      scaling: Object.freeze({ 1: null, 7: null, 14: null })
    })
  }),
  spike: Object.freeze({
    id: "spike",
    name: "Spike Trap",
    category: "damage",
    setupArea: "Line up to 10 ft long and 1 ft wide",
    triggerCondition: "When a creature enters the area",
    multiTrigger: true,
    saveAbility: "dex",
    halfOnSave: false,
    conditionOnFail: "bleeding",
    speedEffect: "halved",
    damageType: "piercing",
    dispatch: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      damageType: "piercing",
      saveAbility: "dex",
      condition: "bleeding",
      speedEffect: "movement speed halved on failed save",
      scaling: Object.freeze({ 1: "2d10", 7: "4d10", 14: "6d10" })
    }),
    source: Object.freeze({
      area: "Line up to 10 ft long and 1 ft wide",
      damageType: "piercing",
      saveAbility: "dex",
      condition: "bleeding",
      speedEffect: "-10 ft speed at 7th level until healed",
      scaling: Object.freeze({ 1: "1d8", 7: "1d8", 14: "1d8" })
    })
  }),
  timedExplosive: Object.freeze({
    id: "timedExplosive",
    name: "Timed Explosive",
    category: "damage",
    setupArea: "Plant a bomb with 1-5 rounds (or 10s to 1h) countdown",
    triggerCondition: "When countdown expires",
    areaRadius: 15,
    multiTrigger: false,
    saveAbility: "dex",
    halfOnSave: true,
    doubleToVehiclesAndStructures: true,
    damageType: "force",
    dispatch: Object.freeze({
      area: "15-ft radius sphere",
      damageType: "force",
      saveAbility: "dex",
      halfOnSave: true,
      countdown: "1-5 rounds",
      scaling: Object.freeze({ 1: "3d8", 7: "6d8", 14: "9d8" })
    }),
    source: Object.freeze({
      area: "20-ft radius sphere (goes around corners, 2x to vehicles/structures)",
      damageType: "thunder",
      saveAbility: "dex",
      halfOnSave: true,
      countdown: "10s to 1 hour",
      scaling: Object.freeze({ 1: "6d10", 7: "6d10", 14: "6d10" })
    })
  })
});

/**
 * Predicate to check if an actor is a Trapmaster.
 */
export function isTrapmaster(actor) {
  if (!actor) return false;
  if (!isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === "trapmaster") return true;

  const items = Array.from(actor.items?.values?.() ?? actor.items ?? []);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === TRAPMASTER_SUBCLASS_ID ||
    i.identifier === "trapmaster" ||
    i.system?.identifier === "trapmaster" ||
    i.name?.toLowerCase().includes("trapmaster")
  ));
}

/**
 * Level feature predicates.
 */
export function hasEnvironmentalWarfare(actor) {
  return isTrapmaster(actor) && (specialistLevel(actor) ?? 1) >= 1;
}

export function hasPanicInducer(actor) {
  return isTrapmaster(actor) && (specialistLevel(actor) ?? 1) >= 5;
}

export function hasHeresOneIMadeEarlier(actor) {
  return isTrapmaster(actor) && (specialistLevel(actor) ?? 1) >= 5;
}

export function hasBaitTheTrap(actor) {
  return isTrapmaster(actor) && (specialistLevel(actor) ?? 1) >= 11;
}

export function hasAgentOfChaos(actor) {
  return isTrapmaster(actor) && (specialistLevel(actor) ?? 1) >= 15;
}

export function hasHouseOfHorrors(actor) {
  return isTrapmaster(actor) && (specialistLevel(actor) ?? 1) >= 20;
}

/**
 * Calculates the Trap DC for an actor.
 * Formula: 8 + PB + max(Dex, Int) [+ 5 if 20th level House of Horrors].
 * Supports explicit ability choice override if specified.
 */
export function calculateTrapDC(actor, { ability = null, houseOfHorrors = false } = {}) {
  const system = actor?.system ?? {};
  const lvl = specialistLevel(actor) ?? Number(system.details?.level ?? 1);
  const pb = Number(system.attributes?.prof ?? pbForLevel(lvl));
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  const intMod = Number(system.abilities?.int?.mod ?? 0);

  const chosenAbility = ability || actor?.flags?.ak5e?.trapmaster?.dcAbility;
  let abilityMod;
  if (chosenAbility === "dex") abilityMod = dexMod;
  else if (chosenAbility === "int") abilityMod = intMod;
  else abilityMod = Math.max(dexMod, intMod);

  const baseDC = 8 + pb + abilityMod;
  const isLv20 = lvl >= 20 || houseOfHorrors || hasHouseOfHorrors(actor);
  const bonus = isLv20 ? 5 : 0;

  return Math.max(1, baseDC + bonus);
}

/**
 * Detection DC equals Trap DC.
 */
export function calculateDetectionDC(actor, options = {}) {
  return calculateTrapDC(actor, options);
}

/**
 * Disarm DC equals Trap DC.
 */
export function calculateDisarmDC(actor, options = {}) {
  return calculateTrapDC(actor, options);
}

/**
 * Retrieves a trap definition from the catalog.
 */
export function getTrap(trapId) {
  return TRAPS_CATALOG[trapId] ?? null;
}

/**
 * Resolves damage formula for a trap based on character level and schema variant.
 * Variants: "dispatch" (default) or "source".
 */
export function getTrapDamageFormula(trapId, level = 1, { variant = "dispatch" } = {}) {
  const trap = getTrap(trapId);
  if (!trap) return null;

  const schema = variant === "source" ? trap.source : trap.dispatch;
  if (!schema?.scaling) return null;

  const lvl = Number(level) || 1;
  if (lvl >= 14) return schema.scaling[14];
  if (lvl >= 7) return schema.scaling[7];
  return schema.scaling[1];
}

/**
 * Resolves damage type for a trap based on schema variant.
 */
export function getTrapDamageType(trapId, { variant = "dispatch" } = {}) {
  const trap = getTrap(trapId);
  if (!trap) return null;
  const schema = variant === "source" ? trap.source : trap.dispatch;
  return schema?.damageType ?? trap.damageType ?? null;
}

/**
 * Resolves save information for a trap.
 */
export function getTrapSaveInfo(trapId, { variant = "dispatch" } = {}) {
  const trap = getTrap(trapId);
  if (!trap) return null;
  const schema = variant === "source" ? trap.source : trap.dispatch;
  return {
    saveAbility: schema?.saveAbility ?? trap.saveAbility ?? null,
    halfOnSave: schema?.halfOnSave ?? trap.halfOnSave ?? false,
    condition: schema?.condition ?? trap.conditionOnFail ?? null
  };
}

/**
 * Evaluates trap detection attempt.
 * Detection succeeds if passivePerception >= trapDC or activeCheckRoll >= trapDC.
 */
export function checkTrapDetection({ trapDC, passivePerception = 0, activeCheckRoll = null, skill = "perception" } = {}) {
  need(Number.isFinite(trapDC), "trapDC must be a finite number");

  const byPassive = Number(passivePerception) >= trapDC;
  const byActive = activeCheckRoll !== null && Number(activeCheckRoll) >= trapDC;
  const detected = byPassive || byActive;
  const bestValue = activeCheckRoll !== null ? Math.max(Number(passivePerception), Number(activeCheckRoll)) : Number(passivePerception);

  return {
    detected,
    byPassive,
    byActive,
    trapDC,
    margin: bestValue - trapDC,
    skillUsed: activeCheckRoll !== null ? skill : "passivePerception"
  };
}

/**
 * Evaluates trap disarming attempt.
 * Requires Sleight of Hand check vs Trap DC within 5 ft.
 * Failing by 5 or more immediately triggers the trap.
 */
export function evaluateDisarmAttempt({ trapDC, sleightOfHandRoll, trapId = null } = {}) {
  need(Number.isFinite(trapDC), "trapDC must be a finite number");
  need(Number.isFinite(sleightOfHandRoll), "sleightOfHandRoll must be a finite number");

  const margin = Number(sleightOfHandRoll) - trapDC;
  const success = margin >= 0;
  const triggered = !success && margin <= -5;

  let message = "";
  if (success) {
    message = "Trap successfully disarmed.";
  } else if (triggered) {
    message = `Disarm failed critically (margin ${margin}). The trap immediately triggers!`;
  } else {
    message = `Disarm failed (margin ${margin}), but trap was not triggered.`;
  }

  return {
    success,
    triggered,
    margin,
    trapDC,
    sleightOfHandRoll: Number(sleightOfHandRoll),
    trapId,
    message
  };
}

/**
 * Checks Sleight of Hand expertise on an actor.
 */
export function hasSleightOfHandExpertise(actor) {
  const slt = actor?.system?.skills?.slt;
  return Number(slt?.value ?? 0) >= 2;
}

/**
 * Grants Sleight of Hand Expertise to the actor per Environmental Warfare.
 * If already proficient (value >= 1), upgrades to expertise (value = 2).
 * If not proficient (value = 0), grants proficiency (value = 1).
 */
export async function applySleightOfHandGrant(actor) {
  if (!actor?.update) return null;
  const slt = actor.system?.skills?.slt;
  const currentVal = Number(slt?.value ?? 0);
  const newVal = currentVal >= 1 ? 2 : 1;
  if (currentVal !== newVal) {
    await actor.update({ "system.skills.slt.value": newVal });
  }
  return newVal;
}

/**
 * Registers all Trapmaster resource pools:
 *  - traps: Max = 2 * PB, Long Rest recovery to max
 *  - devilsOwnLuck: Max = 1, Short or Long Rest recovery
 *  - comeAndGetMe: Max = PB, Short or Long Rest recovery (Level 11+)
 *  - partyFavours: Max = 1, Long Rest recovery (Level 20+)
 */
export function defineTrapmasterPools() {
  if (!getPoolDefinition("traps")) {
    definePool({
      id: "traps",
      label: "Traps",
      max: "@prof * 2",
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isTrapmaster(actor),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }

  if (!getPoolDefinition("devilsOwnLuck")) {
    definePool({
      id: "devilsOwnLuck",
      label: "Devil's Own Luck",
      max: 1,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isTrapmaster(actor),
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }

  if (!getPoolDefinition("comeAndGetMe")) {
    definePool({
      id: "comeAndGetMe",
      label: "Come and Get Me",
      max: "@prof",
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isTrapmaster(actor) && (specialistLevel(actor) >= 11),
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }

  if (!getPoolDefinition("partyFavours")) {
    definePool({
      id: "partyFavours",
      label: "Party Favours",
      max: 1,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isTrapmaster(actor) && (specialistLevel(actor) >= 20),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

export const registerTrapmasterPools = defineTrapmasterPools;

/**
 * Validates trap placement rules based on specialist level and capabilities.
 *  - Standard: within 5 ft, takes 10 seconds (2 rounds).
 *  - Here's One I Made Earlier (Lv 5): 1 Prowess Action, range up to 60 ft, hidden.
 *  - Party Favours (Lv 20): 1/LR Action, range up to 100 ft, up to 6 traps, hidden.
 */
export function validateTrapPlacement(actor, {
  distance = 5,
  isCombat = false,
  spendProwess = false,
  isPartyFavours = false,
  unoccupied = true
} = {}) {
  const dist = Number(distance);
  const warnings = [];

  if (!unoccupied) {
    warnings.push("Trap space is not unoccupied.");
  }

  let maxRange = 5;
  let actionCost = "10 seconds (2 rounds)";
  let prowessCost = 0;

  if (isPartyFavours) {
    if (!hasHouseOfHorrors(actor)) {
      warnings.push("Party Favours requires 20th level House of Horrors.");
    }
    maxRange = 100;
    actionCost = "Action";
  } else if (spendProwess) {
    if (!hasHeresOneIMadeEarlier(actor)) {
      warnings.push("Here's One I Made Earlier requires 5th level.");
    }
    maxRange = 60;
    actionCost = "Action";
    prowessCost = 1;
  } else {
    maxRange = 5;
    actionCost = isCombat ? "2 rounds" : "10 seconds";
  }

  if (dist > maxRange) {
    warnings.push(`Distance ${dist} ft exceeds maximum placement range of ${maxRange} ft.`);
  }

  return {
    valid: warnings.length === 0,
    maxRange,
    actionCost,
    prowessCost,
    warnings
  };
}

/**
 * Plants a trap instance on an actor's ledger.
 * Manages resource expenditure (traps pool and prowess pool).
 */
export async function plantTrap(actor, {
  trapId,
  location = "ground",
  distance = 5,
  useProwess = false,
  isPartyFavours = false,
  customTrigger = null,
  countdown = null,
  variant = "dispatch",
  skipPartyFavoursSpend = false
} = {}) {
  need(isTrapmaster(actor), "Actor must be a Trapmaster to plant traps.");
  const trapDef = getTrap(trapId);
  need(trapDef, `Unknown trap identifier: ${trapId}`);

  const validation = validateTrapPlacement(actor, {
    distance,
    spendProwess: useProwess,
    isPartyFavours
  });

  const trapmasterFlags = actor.flags?.ak5e?.trapmaster ?? {};
  const currentPlanted = [...(trapmasterFlags.plantedTraps ?? [])];

  // Resource deduction with shortfall clamping (WORKFLOW §3.2)
  let trapsSpent = 0;
  let prowessSpent = 0;
  let partyFavoursSpent = 0;
  let shortfall = 0;

  if (isPartyFavours) {
    if (!skipPartyFavoursSpend) {
      const curPF = getPool(actor, "partyFavours")?.value ?? 0;
      if (curPF >= 1) {
        if (actor.update) await spendPool(actor, "partyFavours", 1);
        partyFavoursSpent = 1;
      } else {
        shortfall = 1;
        validation.warnings.push("Party Favours shortfall: 0 available.");
      }
    }
  } else {
    const curTraps = getPool(actor, "traps")?.value ?? 0;
    if (curTraps >= 1) {
      if (actor.update) await spendPool(actor, "traps", 1);
      trapsSpent = 1;
    } else {
      shortfall = 1;
      validation.warnings.push("Traps pool shortfall: 0 available.");
    }

    if (useProwess) {
      const curProwess = getPool(actor, "prowess")?.value ?? 0;
      if (curProwess >= 1) {
        if (actor.update) await spendPool(actor, "prowess", 1);
        prowessSpent = 1;
      } else {
        shortfall = 1;
        validation.warnings.push("Prowess shortfall: 0 available.");
      }
    }
  }

  const trapInstance = {
    id: `trap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trapId,
    name: trapDef.name,
    ownerId: actor.id ?? "actor-self",
    ownerName: actor.name ?? "Trapmaster",
    dc: calculateTrapDC(actor),
    distance,
    location,
    useProwess,
    isPartyFavours,
    customTrigger,
    countdown,
    variant,
    triggered: false,
    delayed: false,
    disarmed: false,
    timestamp: Date.now()
  };

  currentPlanted.push(trapInstance);

  if (actor.update) {
    await actor.update({
      "flags.ak5e.trapmaster.plantedTraps": currentPlanted
    });
  }

  const receipt = {
    type: "plantTrap",
    trapInstanceId: trapInstance.id,
    trapId,
    trapsSpent,
    prowessSpent,
    partyFavoursSpent,
    warnings: validation.warnings
  };

  return { trap: trapInstance, receipt, validation };
}

/**
 * Devil's Own Luck: 1/SR or LR Action to suggest an environmental object as a Trap.
 * Cannot choose Timed Explosive.
 */
export async function executeDevilsOwnLuck(actor, {
  objectDescription = "environmental object",
  trapChoice = "explosive",
  triggerCondition = "Action actively performed",
  gmAgreed = true
} = {}) {
  need(isTrapmaster(actor), "Actor must be a Trapmaster.");
  need(trapChoice !== "timedExplosive", "Devil's Own Luck cannot mimic Timed Explosive.");
  const trapDef = getTrap(trapChoice);
  need(trapDef, `Unknown trap choice: ${trapChoice}`);

  const warnings = [];
  if (!gmAgreed) {
    warnings.push("GM did not agree to the Devil's Own Luck suggestion.");
  }

  if (actor.update) {
    await spendPool(actor, "devilsOwnLuck", 1, { allowShortfall: true });
  }

  const record = {
    objectDescription,
    trapChoice,
    triggerCondition,
    gmAgreed,
    dc: calculateTrapDC(actor),
    timestamp: Date.now()
  };

  if (actor.update) {
    await actor.update({
      "flags.ak5e.trapmaster.activeDevilsOwnLuck": record
    });
  }

  const receipt = {
    type: "devilsOwnLuck",
    record,
    devilsOwnLuckSpent: 1,
    warnings
  };

  return { record, receipt };
}

/**
 * Panic Inducer: Irritating Distraction.
 * When the Trapmaster attacks a creature, that creature has Disadvantage on saving throws
 * against traps and Warning Point until start of Trapmaster's next turn.
 */
export async function applyIrritatingDistraction(trapmasterActor, targetActor) {
  if (!hasPanicInducer(trapmasterActor)) return false;
  if (!targetActor) return false;

  const currentList = Array.isArray(targetActor.flags?.ak5e?.irritatingDistractions)
    ? [...targetActor.flags.ak5e.irritatingDistractions]
    : [];

  const entry = {
    sourceActorId: trapmasterActor.id ?? "trapmaster-self",
    appliedAt: Date.now()
  };

  if (!currentList.some(e => e.sourceActorId === entry.sourceActorId)) {
    currentList.push(entry);
    if (targetActor.update) {
      await targetActor.update({ "flags.ak5e.irritatingDistractions": currentList });
    }
  }

  return true;
}

/**
 * Checks if a target has Irritating Distraction active from a Trapmaster.
 */
export function hasIrritatingDistraction(targetActor, trapmasterActor) {
  if (!targetActor || !trapmasterActor) return false;
  const list = targetActor.flags?.ak5e?.irritatingDistractions;
  if (!Array.isArray(list)) return false;
  return list.some(e => e.sourceActorId === trapmasterActor.id);
}

/**
 * Evaluates trap saving throw options for a target, applying disadvantage if Irritating Distraction is active.
 */
export function evaluateTrapSaveRollOptions(targetActor, trapmasterActor, baseOptions = {}) {
  const options = { ...baseOptions };
  if (hasIrritatingDistraction(targetActor, trapmasterActor)) {
    options.disadvantage = true;
  }
  if (checkJesterGraceSaveAdvantage(targetActor, trapmasterActor)) {
    options.advantage = true;
  }
  return options;
}

/**
 * Panic Inducer: Jester's Grace.
 * Trapmaster is immune to their own traps and ally-placed traps (does not trigger them).
 * Has Advantage on saving throws against own traps and all other traps.
 */
export function checkJesterGraceTriggerImmunity(creatureActor, trapOwnerActor, { allyIds = [] } = {}) {
  if (!hasPanicInducer(creatureActor)) return false;
  if (!trapOwnerActor) return false;

  const isSelf = creatureActor.id === trapOwnerActor.id;
  const isAlly = allyIds.includes(trapOwnerActor.id);
  return isSelf || isAlly;
}

export function checkJesterGraceSaveAdvantage(creatureActor, trapOwnerActor = null) {
  if (!hasPanicInducer(creatureActor)) return false;
  // Advantage on any save against traps placed by self or other traps
  return true;
}

/**
 * Panic Inducer: Warning Point.
 * When a creature would trigger a trap (or moves within 30 ft of a trap):
 * Trapmaster can force an INT Saving Throw vs Trap DC or have speed reduced to 0 until start of next turn.
 * The trap activation is delayed and can be triggered later as a Reaction.
 */
export async function executeWarningPoint(trapmasterActor, targetActor, trapInstance, {
  intSaveResult = null,
  dc = null
} = {}) {
  need(hasPanicInducer(trapmasterActor), "Warning Point requires 5th level Panic Inducer.");

  const trapDC = dc ?? trapInstance?.dc ?? calculateTrapDC(trapmasterActor);
  let saveFailed = true;

  if (intSaveResult !== null) {
    saveFailed = Number(intSaveResult) < trapDC;
  }

  const trapmasterFlags = trapmasterActor.flags?.ak5e?.trapmaster ?? {};
  const delayedTraps = [...(trapmasterFlags.delayedTraps ?? [])];

  if (trapInstance && !delayedTraps.some(d => d.id === trapInstance.id)) {
    delayedTraps.push({
      ...trapInstance,
      delayed: true,
      targetId: targetActor?.id ?? null
    });
  }

  if (trapmasterActor.update) {
    await trapmasterActor.update({
      "flags.ak5e.trapmaster.delayedTraps": delayedTraps
    });
  }

  if (targetActor?.update && saveFailed) {
    await targetActor.update({
      "flags.ak5e.speedReducedToZero": true,
      "flags.ak5e.warningPointLock": {
        trapmasterId: trapmasterActor.id,
        appliedAt: Date.now()
      }
    });
  }

  return {
    saveFailed,
    speedLocked: saveFailed,
    delayedTrap: trapInstance,
    trapDC
  };
}

/**
 * Reaction trigger for a delayed trap under Warning Point.
 */
export async function triggerDelayedTrap(trapmasterActor, trapInstanceId, targetActors = []) {
  need(hasPanicInducer(trapmasterActor), "Warning Point delayed trigger requires 5th level.");

  const trapmasterFlags = trapmasterActor.flags?.ak5e?.trapmaster ?? {};
  const delayedTraps = [...(trapmasterFlags.delayedTraps ?? [])];
  const trapIdx = delayedTraps.findIndex(d => d.id === trapInstanceId);

  need(trapIdx !== -1, `Delayed trap instance ${trapInstanceId} not found.`);
  const [trap] = delayedTraps.splice(trapIdx, 1);
  trap.triggered = true;
  trap.delayed = false;

  if (trapmasterActor.update) {
    await trapmasterActor.update({
      "flags.ak5e.trapmaster.delayedTraps": delayedTraps
    });
  }

  return {
    triggered: true,
    trap,
    targets: targetActors
  };
}

/**
 * Tracks saving throw failures against Trapmaster traps to support Prowess generation.
 * Generates 1 Prowess when a creature fails by 5+ or at turn start if 2+ creatures failed since last turn.
 */
export async function recordTrapSaveFailure(trapmasterActor, targetId, { margin = 0 } = {}) {
  if (!isTrapmaster(trapmasterActor) || !hasHeresOneIMadeEarlier(trapmasterActor)) {
    return { prowessAwarded: 0 };
  }

  const trapmasterFlags = trapmasterActor.flags?.ak5e?.trapmaster ?? {};
  const saveFailures = [...(trapmasterFlags.saveFailuresSinceLastTurn ?? [])];
  saveFailures.push({ targetId, margin, timestamp: Date.now() });

  let prowessAwarded = 0;
  // If failed by 5 or more: gain 1 prowess immediately (1/turn)
  if (margin <= -5 && !trapmasterFlags.prowessAwardedThisTurn) {
    prowessAwarded = 1;
    if (trapmasterActor.update) {
      await refundPool(trapmasterActor, "prowess", 1);
    }
  }

  if (trapmasterActor.update) {
    await trapmasterActor.update({
      "flags.ak5e.trapmaster.saveFailuresSinceLastTurn": saveFailures,
      ...(prowessAwarded ? { "flags.ak5e.trapmaster.prowessAwardedThisTurn": true } : {})
    });
  }

  return { saveFailuresCount: saveFailures.length, prowessAwarded };
}

/**
 * Evaluates Turn Start prowess gain for Trapmaster:
 * Gain 1 Prowess if two or more creatures have failed a save against your traps since your last turn.
 */
export async function checkTurnStartProwessGain(trapmasterActor) {
  if (!isTrapmaster(trapmasterActor) || !hasHeresOneIMadeEarlier(trapmasterActor)) {
    return { gained: false, prowessAwarded: 0 };
  }

  const trapmasterFlags = trapmasterActor.flags?.ak5e?.trapmaster ?? {};
  const saveFailures = trapmasterFlags.saveFailuresSinceLastTurn ?? [];
  const uniqueTargets = new Set(saveFailures.map(f => f.targetId));

  let gained = false;
  if (uniqueTargets.size >= 2 || saveFailures.length >= 2) {
    gained = true;
    if (trapmasterActor.update) {
      await refundPool(trapmasterActor, "prowess", 1);
    }
  }

  if (trapmasterActor.update) {
    await trapmasterActor.update({
      "flags.ak5e.trapmaster.saveFailuresSinceLastTurn": [],
      "flags.ak5e.trapmaster.prowessAwardedThisTurn": false
    });
  }

  return { gained, prowessAwarded: gained ? 1 : 0 };
}

/**
 * Prowess trigger on creature reduced to 0 HP by a trap (1/turn).
 */
export async function onCreatureReducedToZeroByTrap(trapmasterActor, targetActor) {
  if (!isTrapmaster(trapmasterActor) || !hasHeresOneIMadeEarlier(trapmasterActor)) {
    return { prowessAwarded: 0 };
  }

  const trapmasterFlags = trapmasterActor.flags?.ak5e?.trapmaster ?? {};
  if (trapmasterFlags.zeroHPProwessAwardedThisTurn) {
    return { prowessAwarded: 0, reason: "Already awarded this turn" };
  }

  if (trapmasterActor.update) {
    await refundPool(trapmasterActor, "prowess", 1);
    await trapmasterActor.update({
      "flags.ak5e.trapmaster.zeroHPProwessAwardedThisTurn": true
    });
  }

  return { prowessAwarded: 1 };
}

/**
 * 11th Level: Bait the Trap (Come and Get Me).
 * PB/SR or LR Action to taunt a creature within 60 ft; WIS save vs Trap DC or must head towards Trapmaster.
 */
export async function executeComeAndGetMe(trapmasterActor, targetActor, {
  wisSaveResult = null,
  designatedPoint = null
} = {}) {
  need(hasBaitTheTrap(trapmasterActor), "Come and Get Me requires 11th level Bait the Trap.");
  need(targetActor, "Target creature is required.");

  const dc = calculateTrapDC(trapmasterActor);
  let saveFailed = true;

  if (wisSaveResult !== null) {
    saveFailed = Number(wisSaveResult) < dc;
  }

  if (trapmasterActor.update) {
    await spendPool(trapmasterActor, "comeAndGetMe", 1, { allowShortfall: true });
  }

  if (targetActor.update && saveFailed) {
    await targetActor.update({
      "flags.ak5e.comeAndGetMeLure": {
        trapmasterId: trapmasterActor.id,
        designatedPoint: designatedPoint ?? "trapmaster",
        appliedAt: Date.now()
      }
    });
  }

  const receipt = {
    type: "comeAndGetMe",
    targetId: targetActor.id,
    saveFailed,
    dc
  };

  return { saveFailed, dc, receipt };
}

/**
 * 15th Level: Agent of Chaos.
 * Strips damage reduction and damage resistance against the trap's damage type until next turn start.
 */
export async function applyAgentOfChaos(targetActor, { damageType, trapId = null } = {}) {
  if (!targetActor) return null;

  const currentStripped = Array.isArray(targetActor.flags?.ak5e?.agentOfChaosStripped)
    ? [...targetActor.flags.ak5e.agentOfChaosStripped]
    : [];

  const record = {
    damageType,
    trapId,
    appliedAt: Date.now()
  };

  currentStripped.push(record);

  if (targetActor.update) {
    await targetActor.update({
      "flags.ak5e.agentOfChaosStripped": currentStripped
    });
  }

  return record;
}

/**
 * Checks if target's DR and resistance are bypassed under Agent of Chaos.
 */
export function checkAgentOfChaosBypass(targetActor, damageType) {
  if (!targetActor) return false;
  const stripped = targetActor.flags?.ak5e?.agentOfChaosStripped;
  if (!Array.isArray(stripped)) return false;
  return stripped.some(s => s.damageType === damageType || s.damageType === "all");
}

/**
 * Evaluates damage with Agent of Chaos bypass applied.
 * Ignores Damage Reduction (DR = 0) and treats Damage Resistance as normal damage (no halving).
 */
export function evaluateAgentOfChaosDamage(targetActor, {
  damageType,
  rawDamage,
  hasResistance = false,
  damageReduction = 0
} = {}) {
  const isBypassed = checkAgentOfChaosBypass(targetActor, damageType);

  let effectiveDR = damageReduction;
  let effectiveResistance = hasResistance;

  if (isBypassed) {
    effectiveDR = 0;
    effectiveResistance = false;
  }

  let finalDamage = Math.max(0, rawDamage - effectiveDR);
  if (effectiveResistance) {
    finalDamage = Math.floor(finalDamage / 2);
  }

  return {
    rawDamage,
    finalDamage,
    isBypassed,
    damageReductionIgnored: isBypassed && damageReduction > 0,
    resistanceIgnored: isBypassed && hasResistance
  };
}

/**
 * 20th Level: House of Horrors — Party Favours.
 * 1/LR Action to immediately set up to 6 hidden traps simultaneously anywhere within 100 ft
 * without expending Traps pool uses.
 */
export async function executePartyFavours(trapmasterActor, {
  trapsList = [],
  targetLocations = []
} = {}) {
  need(hasHouseOfHorrors(trapmasterActor), "Party Favours requires 20th level House of Horrors.");
  need(Array.isArray(trapsList) && trapsList.length > 0, "trapsList must be a non-empty array.");
  need(trapsList.length <= 6, "Party Favours allows a maximum of 6 traps simultaneously.");

  if (trapmasterActor.update) {
    await spendPool(trapmasterActor, "partyFavours", 1, { allowShortfall: true });
  }

  const planted = [];
  for (let i = 0; i < trapsList.length; i++) {
    const item = trapsList[i];
    const trapId = typeof item === "string" ? item : item.trapId;
    const location = targetLocations[i] ?? item?.location ?? "ground";
    const distance = item?.distance ?? 100;

    const res = await plantTrap(trapmasterActor, {
      trapId,
      location,
      distance,
      isPartyFavours: true,
      skipPartyFavoursSpend: true
    });
    planted.push(res.trap);
  }

  const receipt = {
    type: "partyFavours",
    partyFavoursSpent: 1,
    trapsCount: planted.length,
    traps: planted.map(t => t.id)
  };

  return { planted, receipt };
}

/**
 * Reverses a Trapmaster operation receipt for encounter-window undo (WORKFLOW §3.2).
 */
export async function undoTrapmasterOperation(actor, receipt) {
  if (!actor || !receipt) return { undone: false };

  if (receipt.trapsSpent && actor.update) {
    await refundPool(actor, "traps", receipt.trapsSpent);
  }
  if (receipt.prowessSpent && actor.update) {
    await refundPool(actor, "prowess", receipt.prowessSpent);
  }
  if (receipt.partyFavoursSpent && actor.update) {
    await refundPool(actor, "partyFavours", receipt.partyFavoursSpent);
  }
  if (receipt.devilsOwnLuckSpent && actor.update) {
    await refundPool(actor, "devilsOwnLuck", receipt.devilsOwnLuckSpent);
  }

  // If plantTrap, remove the planted trap instance:
  if (receipt.trapInstanceId && actor.update) {
    const trapmasterFlags = actor.flags?.ak5e?.trapmaster ?? {};
    const currentPlanted = (trapmasterFlags.plantedTraps ?? []).filter(t => t.id !== receipt.trapInstanceId);
    await actor.update({
      "flags.ak5e.trapmaster.plantedTraps": currentPlanted
    });
  }

  // If partyFavours, remove all planted instances:
  if (receipt.type === "partyFavours" && Array.isArray(receipt.traps) && actor.update) {
    const trapmasterFlags = actor.flags?.ak5e?.trapmaster ?? {};
    const currentPlanted = (trapmasterFlags.plantedTraps ?? []).filter(t => !receipt.traps.includes(t.id));
    await actor.update({
      "flags.ak5e.trapmaster.plantedTraps": currentPlanted
    });
  }

  return { undone: true, receipt };
}

/**
 * Hook registration and safe exposure on game.ak5e.specialist.trapmaster.
 */
let trapmasterHooksInstalled = false;

export function registerTrapmasterHooks() {
  defineTrapmasterPools();

  if (globalThis.game && !globalThis.game?.ak5e?.specialist?.trapmaster) {
    try {
      if (!Object.isFrozen(globalThis.game.ak5e ?? {}) && !Object.isFrozen(globalThis.game.ak5e?.specialist ?? {})) {
        globalThis.game.ak5e ??= {};
        globalThis.game.ak5e.specialist ??= {};
        globalThis.game.ak5e.specialist.trapmaster = {
          isTrapmaster,
          calculateTrapDC,
          calculateDetectionDC,
          calculateDisarmDC,
          checkTrapDetection,
          evaluateDisarmAttempt,
          applySleightOfHandGrant,
          hasSleightOfHandExpertise,
          validateTrapPlacement,
          plantTrap,
          executeDevilsOwnLuck,
          applyIrritatingDistraction,
          hasIrritatingDistraction,
          evaluateTrapSaveRollOptions,
          checkJesterGraceTriggerImmunity,
          checkJesterGraceSaveAdvantage,
          executeWarningPoint,
          triggerDelayedTrap,
          recordTrapSaveFailure,
          checkTurnStartProwessGain,
          onCreatureReducedToZeroByTrap,
          executeComeAndGetMe,
          applyAgentOfChaos,
          checkAgentOfChaosBypass,
          evaluateAgentOfChaosDamage,
          executePartyFavours,
          undoTrapmasterOperation,
          TRAPS_CATALOG,
          getTrap,
          getTrapDamageFormula,
          getTrapDamageType,
          getTrapSaveInfo
        };
      }
    } catch {
      // Ignored if game.ak5e or game.ak5e.specialist is frozen
    }
  }

  if (trapmasterHooksInstalled) return;
  trapmasterHooksInstalled = true;

  if (globalThis.Hooks?.on) {
    globalThis.Hooks.on("dnd5e.restCompleted", async (actor, data) => {
      if (data?.longRest && isTrapmaster(actor) && actor.update) {
        await actor.update({
          "flags.ak5e.trapmaster.saveFailuresSinceLastTurn": [],
          "flags.ak5e.trapmaster.prowessAwardedThisTurn": false,
          "flags.ak5e.trapmaster.zeroHPProwessAwardedThisTurn": false
        });
      }
    });
  }
}
