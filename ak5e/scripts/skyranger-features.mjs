/**
 * AK5e Skyranger Specialist Subclass Features (Ch. 3 L6145–6262).
 * Implements:
 *  - 1st Level: Take Flight (Flight Suit starting equipment, Fuel pool 2–8, Take Off bonus action).
 *  - 5th Level: Air Doctrine (Air Superiority AA Missile, Bombardment Bombing Run, Close Air Support Swooping Dive).
 *  - 5th Level: Jink (Evasive Manoeuvres reaction AC bonus + damage halving, aerial Prowess gain triggers).
 *  - 11th Level: Advanced Doctrine (Air Superiority Crash AoE, Bombardment Firebomb / Gas Strike, CAS Frighten).
 *  - 15th Level: Afterburners (Evasive reaction movement & fire aura damage).
 *  - 20th Level: Skyscreamer (Combat Mode 1/LR, Multirole doctrine, free Fuel, Core Cannon & Core Saber special weapons).
 *  - Resource Pools: Fuel (2..8 Long Rest), Skyscreamer (1/LR).
 *  - Table-play philosophy (WORKFLOW.md §3.2): Confirm before use, non-blocking warning overrides,
 *    zero shortfall clamping, interactive roll buttons, and encounter-window undo receipts.
 */

import {
  SPECIALIST_CLASS_ID,
  isSpecialist,
  specialistLevel,
  specialistProfile,
  specialistBranch,
  pbForLevel,
  martialDC,
  specialistDC,
  flag as getAk5eFlag
} from "./specialist-rules.mjs";
import {
  definePool,
  getPoolDefinition,
  getPool,
  spendPool,
  refundPool,
  registerProwessPool
} from "./resource-pools.mjs";
import { need } from "./operation-kernel.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";

export const SKYRANGER_SUBCLASS_ID = "subclass-specialist-skyranger";
export const SKYRANGER_BRANCH_KEY = "skyranger";

/* ---------------------------------------------------------------- Constants */

export const AIR_DOCTRINES = Object.freeze({
  AIR_SUPERIORITY: "airSuperiority",
  BOMBARDMENT: "bombardment",
  CLOSE_AIR_SUPPORT: "closeAirSupport"
});

export const AIR_DOCTRINE_NAMES = Object.freeze({
  airSuperiority: "Air Superiority",
  bombardment: "Bombardment",
  closeAirSupport: "Close Air Support"
});

export const ALL_AIR_DOCTRINES = Object.freeze([
  AIR_DOCTRINES.AIR_SUPERIORITY,
  AIR_DOCTRINES.BOMBARDMENT,
  AIR_DOCTRINES.CLOSE_AIR_SUPPORT
]);

/**
 * Fuel progression by Specialist level (Ch. 3 L6161–6184).
 * Level 1-2: 2, 3-5: 3, 6-8: 4, 9-11: 5, 12-14: 6, 15-17: 7, 18-20: 8.
 */
export const FUEL_PROGRESSION_TABLE = Object.freeze([
  2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8
]);

/**
 * Strafe Damage dice progression by Specialist level (Ch. 3 L6161–6184).
 * Level 1-4: 0, 5-7: 5d8, 8-10: 6d8, 11-13: 7d8, 14-16: 8d8, 17-19: 9d8, 20: 10d8.
 */
export const STRAFE_DAMAGE_PROGRESSION = Object.freeze({
  1: { dice: 0, formula: null },
  2: { dice: 0, formula: null },
  3: { dice: 0, formula: null },
  4: { dice: 0, formula: null },
  5: { dice: 5, formula: "5d8" },
  6: { dice: 5, formula: "5d8" },
  7: { dice: 5, formula: "5d8" },
  8: { dice: 6, formula: "6d8" },
  9: { dice: 6, formula: "6d8" },
  10: { dice: 6, formula: "6d8" },
  11: { dice: 7, formula: "7d8" },
  12: { dice: 7, formula: "7d8" },
  13: { dice: 7, formula: "7d8" },
  14: { dice: 8, formula: "8d8" },
  15: { dice: 8, formula: "8d8" },
  16: { dice: 8, formula: "8d8" },
  17: { dice: 9, formula: "9d8" },
  18: { dice: 9, formula: "9d8" },
  19: { dice: 9, formula: "9d8" },
  20: { dice: 10, formula: "10d8" }
});

export const FLIGHT_SUIT_CONSTANTS = Object.freeze({
  AC_BASE: 12,
  ARMOR_TYPE: "light",
  DR: 0,
  WEIGHT: 25,
  COST_LMD: 650,
  CRAFTING_HOURS: 24
});

export const SKYRANGER_PROGRESSION_FEATURES = Object.freeze({
  1: Object.freeze(["subclass-feature-specialist-skyranger-1st-level-take-flight-6148"]),
  5: Object.freeze([
    "subclass-feature-specialist-skyranger-5th-level-air-doctrine-6188",
    "subclass-feature-specialist-skyranger-5th-level-jink-6199"
  ]),
  11: Object.freeze(["subclass-feature-specialist-skyranger-11th-level-advanced-doctrine-6211"]),
  15: Object.freeze(["subclass-feature-specialist-skyranger-15th-level-afterburners-6222"]),
  20: Object.freeze(["subclass-feature-specialist-skyranger-20th-level-skyscreamer-6227"])
});

/* ---------------------------------------------------------------- Internal Helpers */

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

const flag = (doc, key) => getAk5eFlag(doc, key);

function setActorFlagState(actor, path, value) {
  if (!actor) return;
  if (typeof actor.setFlag === "function") {
    actor.setFlag("ak5e", path, value);
    return;
  }
  actor.flags ??= {};
  actor.flags.ak5e ??= {};
  const parts = path.split(".");
  let cur = actor.flags.ak5e;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getActorFlagState(actor, path) {
  if (!actor) return undefined;
  if (typeof actor.getFlag === "function") {
    const val = actor.getFlag("ak5e", path);
    if (val !== undefined) return val;
  }
  const root = actor.flags?.ak5e;
  if (!root) return undefined;
  const parts = path.split(".");
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

/* ---------------------------------------------------------------- Subclass & Feature Predicates */

export function isSkyranger(actor) {
  if (!actor || !isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === SKYRANGER_BRANCH_KEY) return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === SKYRANGER_SUBCLASS_ID ||
    i.identifier === SKYRANGER_BRANCH_KEY ||
    i.system?.identifier === SKYRANGER_BRANCH_KEY ||
    i.name?.toLowerCase().includes("skyranger")
  ));
}

export function hasTakeFlight(actor) {
  return isSkyranger(actor) && (specialistLevel(actor) ?? 1) >= 1;
}

export function hasAirDoctrineFeature(actor) {
  return isSkyranger(actor) && (specialistLevel(actor) ?? 1) >= 5;
}

export function hasJink(actor) {
  return isSkyranger(actor) && (specialistLevel(actor) ?? 1) >= 5;
}

export function hasAdvancedDoctrine(actor) {
  return isSkyranger(actor) && (specialistLevel(actor) ?? 1) >= 11;
}

export function hasAfterburners(actor) {
  return isSkyranger(actor) && (specialistLevel(actor) ?? 1) >= 15;
}

export function hasSkyscreamer(actor) {
  return isSkyranger(actor) && (specialistLevel(actor) ?? 1) >= 20;
}

export function getSkyrangerProgressionFeatures(level) {
  const lvl = Math.min(20, Math.max(1, Number(level) || 1));
  const granted = [];
  for (let l = 1; l <= lvl; l++) {
    const features = SKYRANGER_PROGRESSION_FEATURES[l];
    if (features) granted.push(...features);
  }
  return granted;
}

/* ---------------------------------------------------------------- Flight Suit */

export function isFlightSuit(item) {
  if (!item) return false;
  if (flag(item, "isFlightSuit") === true) return true;
  const c3Id = flag(item, "chapterThreeId");
  if (c3Id && c3Id.includes("flight-suit")) return true;
  const name = String(item.name ?? "").toLowerCase();
  return name.includes("flight suit");
}

export function isWearingFlightSuit(actor) {
  if (!actor) return false;
  const items = list(actor.items);
  return items.some(i => isFlightSuit(i) && (i.system?.equipped === true || i.equipped === true));
}

export function canUseFlightSuitToFly(actor) {
  return isWearingFlightSuit(actor) && hasTakeFlight(actor);
}

export function createFlightSuitItem(overrides = {}) {
  return {
    name: "Flight Suit",
    type: "equipment",
    system: {
      armor: {
        value: FLIGHT_SUIT_CONSTANTS.AC_BASE,
        type: FLIGHT_SUIT_CONSTANTS.ARMOR_TYPE,
        dex: null
      },
      damageReduction: FLIGHT_SUIT_CONSTANTS.DR,
      weight: {
        value: FLIGHT_SUIT_CONSTANTS.WEIGHT,
        units: "lb"
      },
      price: {
        value: FLIGHT_SUIT_CONSTANTS.COST_LMD,
        denomination: "lmd"
      },
      equipped: false,
      proficient: true,
      description: {
        value: "<p>A Flight Suit is Light Armour with an AC of 12 + your Dexterity Modifier, 0 DR, and a weight of 25lb. While any Creature with Light Armour Proficiency can wear a Flight Suit, only Creatures with the Take Flight Feature can use it to fly.</p>"
      }
    },
    flags: {
      ak5e: {
        isFlightSuit: true,
        chapterThreeId: "subclass-feature-specialist-skyranger-1st-level-take-flight-flight-suit-6151",
        dr: FLIGHT_SUIT_CONSTANTS.DR,
        craftingHours: FLIGHT_SUIT_CONSTANTS.CRAFTING_HOURS
      }
    },
    ...overrides
  };
}

/* ---------------------------------------------------------------- Fuel Resource Pool */

export function calculateFuelMax(level) {
  const lvl = Math.min(20, Math.max(1, Number(level) || 1));
  return FUEL_PROGRESSION_TABLE[lvl - 1];
}

export function defineSkyrangerPools() {
  registerProwessPool();

  if (!getPoolDefinition("fuel")) {
    definePool({
      id: "fuel",
      label: "Fuel",
      max: FUEL_PROGRESSION_TABLE,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isSkyranger(actor),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }

  if (!getPoolDefinition("skyscreamer")) {
    definePool({
      id: "skyscreamer",
      label: "Skyscreamer Combat Mode",
      max: 1,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isSkyranger(actor) && (specialistLevel(actor) >= 20),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

export const registerSkyrangerPools = defineSkyrangerPools;

export function getFuel(actor) {
  defineSkyrangerPools();
  return getPool(actor, "fuel")?.value ?? 0;
}

export function getFuelMax(actor) {
  defineSkyrangerPools();
  return getPool(actor, "fuel")?.max ?? calculateFuelMax(specialistLevel(actor) ?? 1);
}

export async function spendFuel(actor, amount = 1, options = {}) {
  defineSkyrangerPools();
  need(actor, "Actor is required for spendFuel.");
  const qty = Number(amount) || 0;
  if (qty <= 0) return { spent: 0, shortfall: 0, value: getFuel(actor) };

  const pool = getPool(actor, "fuel");
  const current = pool?.value ?? 0;
  const shortfall = Math.max(0, qty - current);

  if (shortfall > 0 && !options.override && !options.force) {
    if (options.strict) {
      throw new Error(`Fuel shortfall: required ${qty}, but current Fuel is ${current}.`);
    }
  }

  const spendActual = Math.min(current, qty);
  let result = null;
  if (spendActual > 0) {
    result = await spendPool(actor, "fuel", spendActual, { reason: options.reason || "Skyranger Action" });
  }

  return {
    spent: spendActual,
    shortfall,
    value: getPool(actor, "fuel")?.value ?? 0,
    result
  };
}

export async function refundFuel(actor, amount = 1, options = {}) {
  defineSkyrangerPools();
  need(actor, "Actor is required for refundFuel.");
  const qty = Number(amount) || 0;
  if (qty <= 0) return { refunded: 0, value: getFuel(actor) };
  const res = await refundPool(actor, "fuel", qty, { reason: options.reason || "Skyranger Refund" });
  return { refunded: qty, result: res, value: getPool(actor, "fuel")?.value ?? 0 };
}

/* ---------------------------------------------------------------- Strafe Damage */

export function getStrafeDamageDiceCount(level) {
  const lvl = Math.min(20, Math.max(1, Number(level) || 1));
  return STRAFE_DAMAGE_PROGRESSION[lvl]?.dice ?? 0;
}

export function getStrafeDamageFormula(level) {
  const lvl = Math.min(20, Math.max(1, Number(level) || 1));
  return STRAFE_DAMAGE_PROGRESSION[lvl]?.formula ?? null;
}

export function calculateStrafeDamage(level, options = {}) {
  const lvl = Math.min(20, Math.max(1, Number(level) || 1));
  const baseDice = getStrafeDamageDiceCount(lvl);
  const reduced = Number(options.reducedDice) || 0;
  const diceCount = Math.max(0, baseDice - reduced);
  const damageType = options.damageType || "thunder";
  const isMaximized = Boolean(options.maxDice);

  if (diceCount === 0) {
    return {
      level: lvl,
      diceCount: 0,
      formula: "0",
      displayFormula: "0",
      damageType,
      isMaximized: false,
      maxDamage: 0
    };
  }

  const formula = `${diceCount}d8`;
  const maxDamage = diceCount * 8;
  const displayFormula = isMaximized ? `${maxDamage}` : formula;

  return {
    level: lvl,
    diceCount,
    formula,
    displayFormula,
    damageType,
    isMaximized,
    maxDamage
  };
}

/* ---------------------------------------------------------------- Flight & Take Off */

export function isFlying(actor) {
  if (!actor) return false;
  const skyrangerFlight = getActorFlagState(actor, "skyranger.isFlying");
  if (skyrangerFlight === true) return true;
  const statuses = actor.statuses;
  if (statuses?.has?.("flying")) return true;
  return Boolean(actor.flags?.ak5e?.isFlying);
}

export function getFlyingSpeed(actor) {
  if (!actor) return 0;
  const walking = Number(actor.system?.attributes?.movement?.walk ?? 30);
  return Number(actor.system?.attributes?.movement?.fly ?? walking);
}

export function isTargetAerial(target, token = null) {
  if (!target && !token) return false;
  // Elevation check
  const elev = Number(token?.elevation ?? token?.document?.elevation ?? target?.system?.attributes?.movement?.elevation ?? 0);
  if (elev > 0) return true;
  // Flying state or status
  if (isFlying(target)) return true;
  if (target?.statuses?.has?.("flying")) return true;
  const flySpeed = Number(target?.system?.attributes?.movement?.fly ?? 0);
  if (target?.flags?.ak5e?.isAerial || target?.flags?.ak5e?.notTouchingGround) return true;
  if (token?.document?.flags?.ak5e?.isAerial || token?.document?.flags?.ak5e?.notTouchingGround) return true;
  return false;
}

export async function executeTakeOff(actor, options = {}) {
  need(actor, "Actor is required for executeTakeOff.");
  const warnings = [];

  if (!isWearingFlightSuit(actor)) {
    warnings.push("Actor is not wearing a Flight Suit.");
    if (!options.override && !options.force) {
      throw new Error("Take Off requires wearing your Flight Suit.");
    }
  }

  const currentFuel = getFuel(actor);
  const freeFuel = isSkyscreamerActive(actor);
  const fuelCost = freeFuel ? 0 : 1;
  let spentFuel = 0;
  let shortfall = 0;

  if (fuelCost > 0) {
    if (currentFuel < fuelCost) {
      warnings.push(`Fuel shortfall (have ${currentFuel}, need ${fuelCost}).`);
      shortfall = fuelCost - currentFuel;
      if (!options.override && !options.force) {
        throw new Error("Take Off requires 1 Fuel.");
      }
    }
    const spendRes = await spendFuel(actor, fuelCost, { override: true, reason: "Take Off" });
    spentFuel = spendRes.spent;
  }

  const walkingSpeed = Number(actor.system?.attributes?.movement?.walk ?? 30);
  const priorFlyingState = Boolean(getActorFlagState(actor, "skyranger.isFlying"));
  const priorFlySpeed = actor.system?.attributes?.movement?.fly;

  setActorFlagState(actor, "skyranger.isFlying", true);
  setActorFlagState(actor, "skyranger.flyingSpeed", walkingSpeed);
  setActorFlagState(actor, "skyranger.flightDuration", 60);

  const receipt = {
    action: "takeOff",
    actorUuid: actor.uuid,
    spentFuel,
    shortfall,
    priorFlyingState,
    priorFlySpeed,
    timestamp: Date.now(),
    undo: async () => {
      setActorFlagState(actor, "skyranger.isFlying", priorFlyingState);
      if (spentFuel > 0) {
        await refundFuel(actor, spentFuel, { reason: "Undo Take Off" });
      }
    }
  };

  return {
    success: true,
    spentFuel,
    shortfall,
    freeFuel,
    flyingSpeed: walkingSpeed,
    durationSeconds: 60,
    warnings,
    receipt
  };
}

export async function endFlight(actor) {
  if (!actor) return;
  setActorFlagState(actor, "skyranger.isFlying", false);
}

/* ---------------------------------------------------------------- Air Doctrines */

export function selectAirDoctrine(actor, doctrine) {
  need(actor, "Actor is required for selectAirDoctrine.");
  need(ALL_AIR_DOCTRINES.includes(doctrine), `Invalid doctrine "${doctrine}". Must be one of: ${ALL_AIR_DOCTRINES.join(", ")}`);

  const prior = getActorFlagState(actor, "skyranger.doctrine");
  setActorFlagState(actor, "skyranger.doctrine", doctrine);

  return {
    doctrine,
    name: AIR_DOCTRINE_NAMES[doctrine],
    priorDoctrine: prior,
    undo: async () => {
      setActorFlagState(actor, "skyranger.doctrine", prior ?? null);
    }
  };
}

export function getActiveAirDoctrines(actor) {
  if (!actor) return [];
  if (isSkyscreamerActive(actor)) {
    return [...ALL_AIR_DOCTRINES];
  }
  const current = getActorFlagState(actor, "skyranger.doctrine");
  return current ? [current] : [];
}

export function hasAirDoctrine(actor, doctrine) {
  const active = getActiveAirDoctrines(actor);
  return active.includes(doctrine);
}

export function getAirDoctrineFuelCost(actor) {
  return isSkyscreamerActive(actor) ? 0 : 1;
}

/* ---------------------------------------------------------------- AA Missile (Air Superiority) */

export async function executeAAMissile(actor, target, options = {}) {
  need(actor, "Actor is required for executeAAMissile.");
  const warnings = [];

  if (!isWearingFlightSuit(actor)) {
    warnings.push("Actor is not wearing a Flight Suit.");
    if (!options.override && !options.force) {
      throw new Error("AA Missile requires wearing your Flight Suit.");
    }
  }

  if (!hasAirDoctrine(actor, AIR_DOCTRINES.AIR_SUPERIORITY) && !options.override && !options.force) {
    warnings.push("Actor does not have Air Superiority Doctrine active.");
    if (!options.allowAnyDoctrine) {
      throw new Error("AA Missile requires the Air Superiority Doctrine.");
    }
  }

  const distance = Number(options.distance ?? 0);
  if (distance > 100) {
    warnings.push(`Target is at ${distance} ft; AA Missile range is 100 ft.`);
    if (!options.override && !options.force) {
      throw new Error("Target exceeds 100 ft range.");
    }
  }

  const fuelCost = getAirDoctrineFuelCost(actor);
  let spentFuel = 0;
  let shortfall = 0;

  if (fuelCost > 0) {
    const curFuel = getFuel(actor);
    if (curFuel < fuelCost) {
      warnings.push(`Fuel shortfall (have ${curFuel}, need ${fuelCost}).`);
      shortfall = fuelCost - curFuel;
      if (!options.override && !options.force) {
        throw new Error("AA Missile requires 1 Fuel.");
      }
    }
    const spendRes = await spendFuel(actor, fuelCost, { override: true, reason: "AA Missile" });
    spentFuel = spendRes.spent;
  }

  const lvl = specialistLevel(actor) ?? 1;
  const isAerial = Boolean(options.isAerial ?? isTargetAerial(target, options.token));
  const strafe = calculateStrafeDamage(lvl, { maxDice: isAerial, damageType: "thunder" });
  const dc = martialDC(actor);

  const receipt = {
    action: "aaMissile",
    actorUuid: actor.uuid,
    targetUuid: target?.uuid ?? null,
    spentFuel,
    shortfall,
    isAerial,
    timestamp: Date.now(),
    undo: async () => {
      if (spentFuel > 0) {
        await refundFuel(actor, spentFuel, { reason: "Undo AA Missile" });
      }
    }
  };

  return {
    success: true,
    action: "aaMissile",
    doctrine: AIR_DOCTRINES.AIR_SUPERIORITY,
    spentFuel,
    shortfall,
    isAerial,
    save: {
      ability: "dex",
      dc,
      halfOnSuccess: true
    },
    damage: strafe,
    range: 100,
    warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- Bombing Run (Bombardment) */

export async function executeBombingRun(actor, targetPoint = null, options = {}) {
  need(actor, "Actor is required for executeBombingRun.");
  const warnings = [];

  if (!isWearingFlightSuit(actor)) {
    warnings.push("Actor is not wearing a Flight Suit.");
    if (!options.override && !options.force) {
      throw new Error("Bombing Run requires wearing your Flight Suit.");
    }
  }

  if (!hasAirDoctrine(actor, AIR_DOCTRINES.BOMBARDMENT) && !options.override && !options.force) {
    warnings.push("Actor does not have Bombardment Doctrine active.");
    if (!options.allowAnyDoctrine) {
      throw new Error("Bombing Run requires the Bombardment Doctrine.");
    }
  }

  const currentlyFlying = isFlying(actor);
  const maxRange = currentlyFlying ? 120 : 30;
  const distance = Number(options.distance ?? 0);
  if (distance > maxRange) {
    warnings.push(`Target point is at ${distance} ft; maximum range is ${maxRange} ft.`);
    if (!options.override && !options.force) {
      throw new Error(`Target point exceeds ${maxRange} ft range.`);
    }
  }

  const fuelCost = getAirDoctrineFuelCost(actor);
  let spentFuel = 0;
  let shortfall = 0;

  if (fuelCost > 0) {
    const curFuel = getFuel(actor);
    if (curFuel < fuelCost) {
      warnings.push(`Fuel shortfall (have ${curFuel}, need ${fuelCost}).`);
      shortfall = fuelCost - curFuel;
      if (!options.override && !options.force) {
        throw new Error("Bombing Run requires 1 Fuel.");
      }
    }
    const spendRes = await spendFuel(actor, fuelCost, { override: true, reason: "Bombing Run" });
    spentFuel = spendRes.spent;
  }

  const lvl = specialistLevel(actor) ?? 1;
  const dc = martialDC(actor);
  const modification = options.modification || null; // "firebomb" | "gasStrike" | null
  const isAdvanced = hasAdvancedDoctrine(actor);

  let reducedDice = 0;
  let damageType = "thunder";
  let conditionRider = null;
  let terrainRider = null;

  if (modification && isAdvanced) {
    reducedDice = 3;
    if (modification === "firebomb") {
      damageType = "fire";
      conditionRider = { condition: "burning", onSaveFailure: true };
    } else if (modification === "gasStrike") {
      damageType = "poison";
      conditionRider = { condition: "poisoned", duration: "endOfTargetNextTurn", onSaveFailure: true };
      terrainRider = { type: "difficultTerrain", radius: 15, duration: "endOfSkyrangerNextTurn", breathingOnly: true };
    }
  }

  const strafe = calculateStrafeDamage(lvl, { reducedDice, damageType });

  const receipt = {
    action: "bombingRun",
    actorUuid: actor.uuid,
    spentFuel,
    shortfall,
    modification,
    maxRange,
    timestamp: Date.now(),
    undo: async () => {
      if (spentFuel > 0) {
        await refundFuel(actor, spentFuel, { reason: "Undo Bombing Run" });
      }
    }
  };

  return {
    success: true,
    action: "bombingRun",
    doctrine: AIR_DOCTRINES.BOMBARDMENT,
    spentFuel,
    shortfall,
    range: maxRange,
    radius: 15,
    save: {
      ability: "dex",
      dc,
      halfOnSuccess: true
    },
    damage: strafe,
    modification,
    conditionRider,
    terrainRider,
    warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- Swooping Dive (Close Air Support) */

export async function executeSwoopingDive(actor, target = null, options = {}) {
  need(actor, "Actor is required for executeSwoopingDive.");
  const warnings = [];

  if (!isWearingFlightSuit(actor)) {
    warnings.push("Actor is not wearing a Flight Suit.");
    if (!options.override && !options.force) {
      throw new Error("Swooping Dive requires wearing your Flight Suit.");
    }
  }

  if (!hasAirDoctrine(actor, AIR_DOCTRINES.CLOSE_AIR_SUPPORT) && !options.override && !options.force) {
    warnings.push("Actor does not have Close Air Support Doctrine active.");
    if (!options.allowAnyDoctrine) {
      throw new Error("Swooping Dive requires the Close Air Support Doctrine.");
    }
  }

  const fuelCost = getAirDoctrineFuelCost(actor);
  let spentFuel = 0;
  let shortfall = 0;

  if (fuelCost > 0) {
    const curFuel = getFuel(actor);
    if (curFuel < fuelCost) {
      warnings.push(`Fuel shortfall (have ${curFuel}, need ${fuelCost}).`);
      shortfall = fuelCost - curFuel;
      if (!options.override && !options.force) {
        throw new Error("Swooping Dive requires 1 Fuel.");
      }
    }
    const spendRes = await spendFuel(actor, fuelCost, { override: true, reason: "Swooping Dive" });
    spentFuel = spendRes.spent;
  }

  const speed = Number(actor.system?.attributes?.movement?.walk ?? 30);
  const lvl = specialistLevel(actor) ?? 1;
  const strafe = calculateStrafeDamage(lvl, { damageType: "thunder" });
  const isAdvanced = hasAdvancedDoctrine(actor);
  const dc = martialDC(actor);

  const targetId = target?.id ?? target?.uuid ?? options.targetId;
  const hitCreaturesThisTurn = getActorFlagState(actor, "skyranger.swoopingDiveHits") ?? [];
  const alreadyDamagedTarget = targetId && hitCreaturesThisTurn.includes(targetId);

  if (targetId && !alreadyDamagedTarget) {
    setActorFlagState(actor, "skyranger.swoopingDiveHits", [...hitCreaturesThisTurn, targetId]);
  }

  const receipt = {
    action: "swoopingDive",
    actorUuid: actor.uuid,
    targetId,
    spentFuel,
    shortfall,
    priorHits: hitCreaturesThisTurn,
    timestamp: Date.now(),
    undo: async () => {
      setActorFlagState(actor, "skyranger.swoopingDiveHits", hitCreaturesThisTurn);
      if (spentFuel > 0) {
        await refundFuel(actor, spentFuel, { reason: "Undo Swooping Dive" });
      }
    }
  };

  return {
    success: true,
    action: "swoopingDive",
    doctrine: AIR_DOCTRINES.CLOSE_AIR_SUPPORT,
    spentFuel,
    shortfall,
    movementGranted: speed,
    advantageOnAttack: true,
    maxDistanceForAdvantage: 10,
    bonusDamage: strafe,
    alreadyDamagedTargetThisTurn: Boolean(alreadyDamagedTarget),
    advancedDoctrine: isAdvanced ? {
      disadvantageOnAttacksAgainstSkyranger: true,
      frightenSave: {
        ability: "wis",
        dc,
        condition: "frightened",
        duration: "endOfTargetNextTurn"
      }
    } : null,
    warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- Jink & Evasive Manoeuvres (5th Level) */

export function isEvasiveManoeuvresActive(actor) {
  if (!actor) return false;
  const em = getActorFlagState(actor, "skyranger.evasiveManoeuvres");
  return Boolean(em?.active);
}

export async function executeEvasiveManoeuvres(actor, options = {}) {
  need(actor, "Actor is required for executeEvasiveManoeuvres.");
  const warnings = [];

  if (!hasJink(actor) && !options.override && !options.force) {
    warnings.push("Actor does not have the Jink feature (requires 5th level Skyranger).");
    throw new Error("Evasive Manoeuvres requires 5th level Skyranger.");
  }

  if (!isWearingFlightSuit(actor)) {
    warnings.push("Actor is not wearing a Flight Suit.");
    if (!options.override && !options.force) {
      throw new Error("Evasive Manoeuvres requires wearing your Flight Suit.");
    }
  }

  registerProwessPool();
  const pool = getPool(actor, "prowess");
  const prowess = pool?.value ?? 0;
  let spentProwess = 0;
  let shortfall = 0;

  if (prowess < 1) {
    warnings.push("Prowess pool is empty (0 remaining).");
    shortfall = 1;
    if (!options.override && !options.force) {
      throw new Error("Evasive Manoeuvres requires 1 Prowess.");
    }
  } else {
    await spendPool(actor, "prowess", 1, { reason: "Evasive Manoeuvres" });
    spentProwess = 1;
  }

  const lvl = specialistLevel(actor) ?? 1;
  const pb = pbForLevel(lvl);
  const hasAfterburn = hasAfterburners(actor);
  const speed = Number(actor.system?.attributes?.movement?.walk ?? 30);

  const priorEM = getActorFlagState(actor, "skyranger.evasiveManoeuvres");

  const newEM = {
    active: true,
    acBonus: pb,
    halveTriggeringDamage: true,
    expiresAt: "turnStart",
    timestamp: Date.now()
  };

  setActorFlagState(actor, "skyranger.evasiveManoeuvres", newEM);

  const receipt = {
    action: "evasiveManoeuvres",
    actorUuid: actor.uuid,
    spentProwess,
    shortfall,
    acBonus: pb,
    priorEM,
    timestamp: Date.now(),
    undo: async () => {
      setActorFlagState(actor, "skyranger.evasiveManoeuvres", priorEM ?? null);
      if (spentProwess > 0) {
        await refundPool(actor, "prowess", spentProwess, { reason: "Undo Evasive Manoeuvres" });
      }
    }
  };

  return {
    success: true,
    action: "evasiveManoeuvres",
    spentProwess,
    shortfall,
    acBonus: pb,
    halveTriggeringDamage: true,
    reactionMovementGranted: hasAfterburn ? speed : 0,
    hasAfterburners: hasAfterburn,
    warnings,
    receipt
  };
}

/**
 * Evaluates whether an incoming attack hits and computes the final damage taken
 * according to the source rule:
 * "+PB AC until start of next turn; if the triggering attack still hits despite AC bonus, damage is halved!"
 */
export function resolveEvasiveManoeuvresIncomingAttack(actor, attackRoll, originalAC, incomingDamage) {
  const lvl = specialistLevel(actor) ?? 1;
  const pb = pbForLevel(lvl);
  const acWithBonus = originalAC + pb;
  const roll = Number(attackRoll) || 0;
  const rawDamage = Number(incomingDamage) || 0;

  if (roll < originalAC) {
    return {
      hit: false,
      turnedToMiss: false,
      finalDamage: 0,
      acWithBonus
    };
  }

  if (roll < acWithBonus) {
    return {
      hit: false,
      turnedToMiss: true,
      finalDamage: 0,
      acWithBonus
    };
  }

  // Still hits despite AC bonus: damage is halved!
  const finalDamage = Math.floor(rawDamage / 2);
  return {
    hit: true,
    turnedToMiss: false,
    finalDamage,
    acWithBonus
  };
}

/* ---------------------------------------------------------------- Aerial Prowess Gain Triggers */

export async function checkSkyrangerProwessGain(actor, target, context = {}) {
  if (!actor || !hasJink(actor)) return { eligible: false, reason: "noJink" };

  const usedThisTurn = Boolean(getActorFlagState(actor, "skyranger.aerialProwessUsedThisTurn"));
  if (usedThisTurn && !context.override) {
    return { eligible: false, reason: "alreadyUsedThisTurn" };
  }

  const damagedSinceLastTurn = Boolean(context.damagedSinceLastTurn ?? true);
  if (!damagedSinceLastTurn) {
    return { eligible: false, reason: "notDamagedSinceLastTurn" };
  }

  const skyrangerFlying = isFlying(actor);
  const targetAerial = isTargetAerial(target, context.token);

  // Trigger 1: While Flying, ground creature damaged since last turn is reduced to 0 HP
  const trigger1 = skyrangerFlying && !targetAerial;

  // Trigger 2: Creature not touching ground damaged since last turn is reduced to 0 HP
  const trigger2 = targetAerial;

  // Extra helper: taking off or dealing damage while flying trigger support
  const trigger3 = Boolean(context.onTakeOff || (context.onDamageDealt && (skyrangerFlying || targetAerial)));

  if (!trigger1 && !trigger2 && !trigger3) {
    return { eligible: false, reason: "conditionsNotMet" };
  }

  registerProwessPool();
  await refundPool(actor, "prowess", 1, { reason: "Skyranger Aerial Trigger" });
  setActorFlagState(actor, "skyranger.aerialProwessUsedThisTurn", true);

  return {
    eligible: true,
    prowessGained: 1,
    matchedTrigger: trigger1 ? "flyingGroundTargetKilled" : (trigger2 ? "aerialTargetKilled" : "aerialActivity"),
    undo: async () => {
      setActorFlagState(actor, "skyranger.aerialProwessUsedThisTurn", usedThisTurn);
      await spendPool(actor, "prowess", 1, { reason: "Undo Skyranger Prowess Gain" });
    }
  };
}

/* ---------------------------------------------------------------- Advanced Doctrine: Crash AoE (11th Level) */

export async function executeCrashAoE(actor, target, groundPoint = null, targetHeight = 10, options = {}) {
  need(actor, "Actor is required for executeCrashAoE.");
  const warnings = [];

  if (!hasAdvancedDoctrine(actor) && !options.override && !options.force) {
    warnings.push("Crash AoE requires 11th level Skyranger Advanced Doctrine.");
    throw new Error("Crash AoE requires 11th level Skyranger.");
  }

  const height = Math.max(0, Number(targetHeight) || 0);
  const maxDistance = 2 * height;
  const distance = Number(options.distance ?? 0);

  if (distance > maxDistance && maxDistance > 0) {
    warnings.push(`Crash point is at ${distance} ft; maximum distance is ${maxDistance} ft (2x height).`);
    if (!options.override && !options.force) {
      throw new Error(`Crash point exceeds maximum distance of ${maxDistance} ft.`);
    }
  }

  const lvl = specialistLevel(actor) ?? 1;
  const strafe = calculateStrafeDamage(lvl, { damageType: "thunder" });
  const halfDice = Math.max(1, Math.floor(strafe.diceCount / 2));
  const crashFormula = `${halfDice}d8`;
  const dc = martialDC(actor);

  return {
    success: true,
    action: "crashAoE",
    maxDistance,
    radius: 10,
    save: {
      ability: "dex",
      dc,
      halfOnSuccess: false
    },
    damage: {
      formula: crashFormula,
      diceCount: halfDice,
      damageType: "thunder"
    },
    warnings
  };
}

/* ---------------------------------------------------------------- Afterburners (15th Level) */

export async function executeAfterburnersAura(actor, target, options = {}) {
  need(actor, "Actor is required for executeAfterburnersAura.");
  const warnings = [];

  if (!hasAfterburners(actor) && !options.override && !options.force) {
    warnings.push("Afterburners requires 15th level Skyranger.");
    throw new Error("Afterburners requires 15th level Skyranger.");
  }

  if (!isEvasiveManoeuvresActive(actor) && !options.override && !options.force) {
    warnings.push("Afterburners aura requires active Evasive Manoeuvres AC boost.");
    throw new Error("Afterburners aura is only active while Armour Class is increased by Evasive Manoeuvres.");
  }

  const usedThisTurn = Boolean(getActorFlagState(actor, "skyranger.afterburnersUsedThisTurn"));
  if (usedThisTurn && !options.override && !options.force) {
    warnings.push("Afterburners aura can only be used once per turn.");
    throw new Error("Afterburners aura has already been triggered this turn.");
  }

  setActorFlagState(actor, "skyranger.afterburnersUsedThisTurn", true);

  const lvl = specialistLevel(actor) ?? 1;
  const strafe = calculateStrafeDamage(lvl, { damageType: "fire" });
  const dc = martialDC(actor);

  const receipt = {
    action: "afterburnersAura",
    actorUuid: actor.uuid,
    targetUuid: target?.uuid ?? null,
    priorUsedThisTurn: usedThisTurn,
    timestamp: Date.now(),
    undo: async () => {
      setActorFlagState(actor, "skyranger.afterburnersUsedThisTurn", usedThisTurn);
    }
  };

  return {
    success: true,
    action: "afterburnersAura",
    maxRange: 10,
    save: {
      ability: "dex",
      dc,
      halfOnSuccess: false
    },
    damage: strafe,
    warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- Skyscreamer (20th Level) */

export function isSkyscreamerActive(actor) {
  if (!actor) return false;
  return Boolean(getActorFlagState(actor, "skyranger.skyscreamerActive"));
}

export function createCoreCannonItem(overrides = {}) {
  return {
    name: "Core Cannon",
    type: "weapon",
    system: {
      weaponType: "rangedLight",
      actionType: "rwak",
      equipped: true,
      proficient: true,
      damage: {
        base: {
          number: 3,
          denomination: 8,
          types: ["force"]
        }
      },
      range: {
        value: 100,
        long: 300,
        units: "ft"
      },
      properties: ["lgt", "rapidFire"],
      price: { value: 0, denomination: "lmd" },
      weight: { value: 0, units: "lb" },
      description: {
        value: "<p><strong>Core Cannon</strong> (Light Ranged). Damage: 3d8 Force. Properties: Range (100/300), Rapid Fire, Light. Skyscreamer Special Weapon.</p>"
      }
    },
    flags: {
      ak5e: {
        isSpecialWeapon: true,
        weaponCategory: "Light Ranged",
        tableData: {
          damage: "3d8 Force",
          properties: "Range (100/300), Rapid Fire, Light"
        }
      }
    },
    ...overrides
  };
}

export function createCoreSaberItem(overrides = {}) {
  return {
    name: "Core Saber",
    type: "weapon",
    system: {
      weaponType: "meleeLight",
      actionType: "mwak",
      equipped: true,
      proficient: true,
      damage: {
        base: {
          number: 3,
          denomination: 8,
          types: ["force"]
        }
      },
      properties: ["lgt", "fin", "rch", "deadly"],
      price: { value: 0, denomination: "lmd" },
      weight: { value: 0, units: "lb" },
      description: {
        value: "<p><strong>Core Saber</strong> (Light Melee). Damage: 3d8 Force. Properties: Deadly, Finesse, Reach, Light. Skyscreamer Special Weapon.</p>"
      }
    },
    flags: {
      ak5e: {
        isSpecialWeapon: true,
        weaponCategory: "Light Melee",
        tableData: {
          damage: "3d8 Force",
          properties: "Deadly, Finesse, Reach, Light"
        }
      }
    },
    ...overrides
  };
}

export async function activateSkyscreamer(actor, options = {}) {
  need(actor, "Actor is required for activateSkyscreamer.");
  const warnings = [];

  if (!hasSkyscreamer(actor) && !options.override && !options.force) {
    warnings.push("Skyscreamer requires 20th level Skyranger.");
    throw new Error("Skyscreamer requires 20th level Skyranger.");
  }

  if (!isWearingFlightSuit(actor)) {
    warnings.push("Actor is not wearing a Flight Suit.");
    if (!options.override && !options.force) {
      throw new Error("Skyscreamer requires wearing your Flight Suit.");
    }
  }

  defineSkyrangerPools();
  const pool = getPool(actor, "skyscreamer");
  const uses = pool?.value ?? 1;

  if (uses < 1) {
    warnings.push("Skyscreamer has already been used since last Long Rest.");
    if (!options.override && !options.force) {
      throw new Error("Skyscreamer is limited to once per Long Rest.");
    }
  }

  if (uses >= 1) {
    await spendPool(actor, "skyscreamer", 1, { reason: "Skyscreamer Activation" });
  }

  setActorFlagState(actor, "skyranger.skyscreamerActive", true);
  setActorFlagState(actor, "skyranger.skyscreamerDuration", 60);

  const cannon = createCoreCannonItem();
  const saber = createCoreSaberItem();

  const receipt = {
    action: "activateSkyscreamer",
    actorUuid: actor.uuid,
    spentUses: uses >= 1 ? 1 : 0,
    timestamp: Date.now(),
    undo: async () => {
      setActorFlagState(actor, "skyranger.skyscreamerActive", false);
      if (uses >= 1) {
        await refundPool(actor, "skyscreamer", 1, { reason: "Undo Skyscreamer" });
      }
    }
  };

  return {
    success: true,
    action: "activateSkyscreamer",
    durationSeconds: 60,
    multiroleActive: true,
    freeDoctrineFuel: true,
    specialWeapons: {
      cannon,
      saber
    },
    warnings,
    receipt
  };
}

export async function deactivateSkyscreamer(actor) {
  if (!actor) return;
  setActorFlagState(actor, "skyranger.skyscreamerActive", false);
}

/* ---------------------------------------------------------------- Reversible Undo Handler */

export async function undoSkyrangerAction(actor, receipt) {
  need(actor, "Actor is required for undoSkyrangerAction.");
  need(receipt, "Receipt is required for undoSkyrangerAction.");
  if (typeof receipt.undo === "function") {
    await receipt.undo();
    return { success: true };
  }
  return { success: false, reason: "No undo callback in receipt." };
}

/* ---------------------------------------------------------------- Hooks & Event Handlers */

let hooksRegistered = false;

export function skyrangerPreApplyDamage(actor, amount, updates, options) {
  if (!actor) return true;
  const em = getActorFlagState(actor, "skyranger.evasiveManoeuvres");
  if (em?.active && em?.halveTriggeringDamage) {
    // Halve the incoming damage and clear the triggering damage flag
    const currentHp = Number(actor.system?.attributes?.hp?.value ?? 0);
    const newHp = updates?.["system.attributes.hp.value"];
    if (typeof newHp === "number" && newHp < currentHp) {
      const damageTaken = currentHp - newHp;
      const halved = Math.floor(damageTaken / 2);
      updates["system.attributes.hp.value"] = currentHp - halved;
    }
    // Clear the one-time damage halving for subsequent attacks
    em.halveTriggeringDamage = false;
    setActorFlagState(actor, "skyranger.evasiveManoeuvres", em);
  }
  return true;
}

export function resetSkyrangerTurnTriggers(actor) {
  if (!actor) return;
  // Reset per-turn trackers
  setActorFlagState(actor, "skyranger.aerialProwessUsedThisTurn", false);
  setActorFlagState(actor, "skyranger.afterburnersUsedThisTurn", false);
  setActorFlagState(actor, "skyranger.swoopingDiveHits", []);

  // Expire Evasive Manoeuvres AC boost if expired
  const em = getActorFlagState(actor, "skyranger.evasiveManoeuvres");
  if (em?.active && em?.expiresAt === "turnStart") {
    setActorFlagState(actor, "skyranger.evasiveManoeuvres", null);
  }
}

export function resetSkyrangerRestTriggers(actor, isLongRest = false) {
  if (!actor) return;
  resetSkyrangerTurnTriggers(actor);
  if (isLongRest) {
    deactivateSkyscreamer(actor);
    endFlight(actor);
  }
}

export function registerSkyrangerHooks() {
  defineSkyrangerPools();

  if (globalThis.game && !globalThis.game?.ak5e?.specialist?.skyranger) {
    try {
      if (!Object.isFrozen(globalThis.game.ak5e ?? {}) && !Object.isFrozen(globalThis.game.ak5e?.specialist ?? {})) {
        globalThis.game.ak5e ??= {};
        globalThis.game.ak5e.specialist ??= {};
        globalThis.game.ak5e.specialist.skyranger = {
          isSkyranger,
          isWearingFlightSuit,
          canUseFlightSuitToFly,
          createFlightSuitItem,
          calculateFuelMax,
          getFuel,
          getFuelMax,
          spendFuel,
          refundFuel,
          getStrafeDamageFormula,
          getStrafeDamageDiceCount,
          calculateStrafeDamage,
          isFlying,
          getFlyingSpeed,
          isTargetAerial,
          executeTakeOff,
          endFlight,
          selectAirDoctrine,
          getActiveAirDoctrines,
          hasAirDoctrine,
          executeAAMissile,
          executeBombingRun,
          executeSwoopingDive,
          executeEvasiveManoeuvres,
          resolveEvasiveManoeuvresIncomingAttack,
          checkSkyrangerProwessGain,
          executeCrashAoE,
          executeAfterburnersAura,
          activateSkyscreamer,
          deactivateSkyscreamer,
          createCoreCannonItem,
          createCoreSaberItem,
          undoSkyrangerAction
        };
      }
    } catch {
      // Ignored if game.ak5e is frozen
    }
  }

  if (hooksRegistered) return;
  hooksRegistered = true;

  if (globalThis.Hooks?.on) {
    globalThis.Hooks.on("dnd5e.preApplyDamage", skyrangerPreApplyDamage);

    globalThis.Hooks.on("dnd5e.restCompleted", (actor, data) => {
      if (isSkyranger(actor)) {
        resetSkyrangerRestTriggers(actor, Boolean(data?.longRest));
      }
    });
  }

  try {
    onAk5eEvent("turnStart", async event => {
      const actor = event?.raw?.actor ?? (event?.actorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.actorUuid) : null);
      if (actor && isSkyranger(actor)) {
        resetSkyrangerTurnTriggers(actor);
      }
    });

    onAk5eEvent("longRest", async event => {
      const actor = event?.raw?.actor ?? (event?.actorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.actorUuid) : null);
      if (actor && isSkyranger(actor)) {
        resetSkyrangerRestTriggers(actor, true);
      }
    });

    onAk5eEvent("kill", async event => {
      const killer = event?.raw?.sourceActor ?? (event?.sourceActorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.sourceActorUuid) : null);
      const dead = event?.raw?.actor ?? (event?.actorUuid && globalThis.fromUuidSync ? globalThis.fromUuidSync(event.actorUuid) : null);
      if (killer && dead && isSkyranger(killer)) {
        await checkSkyrangerProwessGain(killer, dead, event);
      }
    });
  } catch {
    // Non-fatal if trigger events are uninitialized in standalone tests
  }
}
