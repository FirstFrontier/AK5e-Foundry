/**
 * AK5e Dollkeeper Specialist Subclass Features & Construct Engine (Ch. 3 L6266–6377).
 * Pure and functional logic, state inspection, resource pools, companion construct synchronization,
 * and table-play command/reaction mechanics.
 *
 * Implements:
 *  - 1st Level: Living Doll companion construct (Construct, Medium/Small, Neutral, stats, immunities, senses, sync, Strike attack)
 *  - 1st Level: Command in Combat (Bonus action <=100 ft) & Restoring/Replacing (Hit Dice linkage, LR ritual / 500 LMD rebuild)
 *  - 5th Level: Pull the Strings (Doll's Dance skill origin, Look in the Mirror weapon traits, Marionette 1/LR 0 HP substitution)
 *  - 5th Level: Musical Chairs (1 Prowess position swapping <=60 ft, Joint Prowess 1/turn triggers)
 *  - 11th Level: Masquerade (Doll Multiattack 2 attacks, Mistaken Identity PB/rest redirection, Talking Heads telepathy)
 *  - 15th Level: Living Doll (Reciprocity temp HP sharing, Share Arts non-damaging/buff simultaneous application)
 *  - 20th Level: Artistry is Violence (Doll Multiattack 3 attacks, Doll Raid 1/LR simultaneous action)
 *  - Full encounter-window undo reversibility (WORKFLOW §3.2)
 */

import {
  SPECIALIST_CLASS_ID,
  isSpecialist,
  specialistLevel,
  specialistProfile,
  pbForLevel,
  martialDC,
  specialistDC,
  weaponMasteryMeleeBonus,
  weaponMasteryRangedBonus
} from "./specialist-rules.mjs";
import {
  definePool,
  getPool,
  getPoolDefinition,
  spendPool,
  refundPool,
  registerProwessPool
} from "./resource-pools.mjs";
import { need, flag, gmActive } from "./operation-kernel.mjs";
import {
  hasWeaponSpecialisation,
  getWeaponSpecialisation,
  hasWeaponAdept,
  hasWeaponExpertise,
  hasWeaponMastery
} from "./specialist-features.mjs";

export const DOLLKEEPER_SUBCLASS_ID = "subclass-specialist-dollkeeper";
export const DOLLKEEPER_BRANCH_KEY = "dollkeeper";

export const DOLLKEEPER_FEATURE_IDS = Object.freeze({
  LIVING_DOLL_1: "subclass-feature-specialist-dollkeeper-1st-level-living-doll-385",
  PULL_THE_STRINGS_5: "subclass-feature-specialist-dollkeeper-5th-level-pull-the-strings-4395",
  MUSICAL_CHAIRS_5: "subclass-feature-specialist-dollkeeper-5th-level-musical-chairs-4396",
  MASQUERADE_11: "subclass-feature-specialist-dollkeeper-11th-level-masquerade-5100",
  LIVING_DOLL_15: "subclass-feature-specialist-dollkeeper-15th-level-living-doll-5631",
  ARTISTRY_IS_VIOLENCE_20: "subclass-feature-specialist-dollkeeper-20th-level-artistry-is-violence-6360"
});

export const DOLL_BASE_STATS = Object.freeze({
  str: 16,
  dex: 16,
  con: 14,
  int: 1,
  wis: 10,
  cha: 4
});

export const DOLL_BASE_MODIFIERS = Object.freeze({
  str: 3,
  dex: 3,
  con: 2,
  int: -5,
  wis: 0,
  cha: -3
});

export const DOLL_DAMAGE_IMMUNITIES = Object.freeze([
  "poison",
  "necrotic"
]);

export const DOLL_CONDITION_IMMUNITIES = Object.freeze([
  "charmed",
  "frightened",
  "poisoned",
  "necrotised",
  "nervousImpairment",
  "exhaustion"
]);

export const DOLL_COMMAND_ACTIONS = Object.freeze([
  "strike",
  "dash",
  "disengage",
  "dodge",
  "help",
  "move"
]);

let hooksInstalled = null;

/* ---------------------------------------------------------------- Identification & Helpers */

function list(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === "function") return Array.from(collection);
  return [];
}

export function isDollkeeper(actor) {
  if (!actor) return false;
  const items = list(actor.items);
  const hasSubclass = items.some(i => i.type === "subclass" && (
    (typeof i.getFlag === "function" ? i.getFlag("ak5e", "chapterThreeId") : i.flags?.ak5e?.chapterThreeId) === DOLLKEEPER_SUBCLASS_ID ||
    i.identifier === DOLLKEEPER_BRANCH_KEY ||
    i.system?.identifier === DOLLKEEPER_BRANCH_KEY ||
    i.name?.toLowerCase().includes("dollkeeper")
  ));
  if (hasSubclass) return true;

  const branchFlag = (typeof actor.getFlag === "function" ? actor.getFlag("ak5e", "specialist") : actor.flags?.ak5e?.specialist)?.branch;
  if (branchFlag === DOLLKEEPER_BRANCH_KEY) return true;

  const profile = specialistProfile(actor);
  if (profile.branch === DOLLKEEPER_BRANCH_KEY || profile.branchId === DOLLKEEPER_SUBCLASS_ID) return true;

  return false;
}

export function getDollkeeperLevel(actor) {
  if (!actor) return 0;
  const sLevel = specialistLevel(actor);
  if (Number.isInteger(sLevel) && sLevel >= 1) return sLevel;
  const sysLevel = Number(actor.system?.details?.level);
  if (Number.isInteger(sysLevel) && sysLevel >= 1) return sysLevel;
  return 1;
}

export function getOwnerPB(actor) {
  const prof = Number(actor?.system?.attributes?.prof);
  if (Number.isInteger(prof) && prof > 0) return prof;
  const lvl = getDollkeeperLevel(actor);
  return pbForLevel(lvl);
}

export function hasLivingDoll(actor) {
  return isDollkeeper(actor) && getDollkeeperLevel(actor) >= 1;
}

export function hasPullTheStrings(actor) {
  return isDollkeeper(actor) && getDollkeeperLevel(actor) >= 5;
}

export function hasMusicalChairs(actor) {
  return isDollkeeper(actor) && getDollkeeperLevel(actor) >= 5;
}

export function hasMasquerade(actor) {
  return isDollkeeper(actor) && getDollkeeperLevel(actor) >= 11;
}

export function hasLivingDoll15(actor) {
  return isDollkeeper(actor) && getDollkeeperLevel(actor) >= 15;
}

export function hasArtistryIsViolence(actor) {
  return isDollkeeper(actor) && getDollkeeperLevel(actor) >= 20;
}

/* ---------------------------------------------------------------- Distance & Positions */

export function getActorPosition(actor) {
  if (!actor) return { x: 0, y: 0, elevation: 0 };
  const flagPos = actor.flags?.ak5e?.position ?? (typeof actor.getFlag === "function" ? actor.getFlag("ak5e", "position") : null);
  if (flagPos && typeof flagPos.x === "number" && typeof flagPos.y === "number") {
    return { x: flagPos.x, y: flagPos.y, elevation: flagPos.elevation ?? 0 };
  }
  const token = actor.token ?? actor.getActiveTokens?.()?.[0];
  if (token && typeof token.x === "number" && typeof token.y === "number") {
    return { x: token.x, y: token.y, elevation: token.elevation ?? 0 };
  }
  return { x: 0, y: 0, elevation: 0 };
}

export async function setActorPosition(actor, pos) {
  if (!actor || !pos) return;
  const newPos = { x: Number(pos.x) || 0, y: Number(pos.y) || 0, elevation: Number(pos.elevation) || 0 };
  if (typeof actor.setFlag === "function") {
    await actor.setFlag("ak5e", "position", newPos);
  } else {
    actor.flags ??= {};
    actor.flags.ak5e ??= {};
    actor.flags.ak5e.position = newPos;
  }
  const token = actor.token ?? actor.getActiveTokens?.()?.[0];
  if (token && typeof token.update === "function") {
    await token.update(newPos);
  } else if (token) {
    token.x = newPos.x;
    token.y = newPos.y;
    token.elevation = newPos.elevation;
  }
}

export function calculateDistance(actorA, actorB, options = {}) {
  if (typeof options.distance === "number") return options.distance;
  const posA = getActorPosition(actorA);
  const posB = getActorPosition(actorB);
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;
  return Math.hypot(dx, dy);
}

/* ---------------------------------------------------------------- Resource Pools */

export function defineDollkeeperPools() {
  registerProwessPool();

  if (!getPoolDefinition("mistakenIdentity")) {
    definePool({
      id: "mistakenIdentity",
      label: "Mistaken Identity",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      max: "@prof",
      initial: "max",
      appliesTo: actor => isDollkeeper(actor) && (getDollkeeperLevel(actor) >= 11),
      recovery: [
        { on: "lr", amount: "toMax" },
        { on: "sr", amount: "toMax" }
      ]
    });
  }

  if (!getPoolDefinition("marionette")) {
    definePool({
      id: "marionette",
      label: "Marionette",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      max: 1,
      initial: "max",
      appliesTo: actor => isDollkeeper(actor) && (getDollkeeperLevel(actor) >= 5),
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }

  if (!getPoolDefinition("dollRaid")) {
    definePool({
      id: "dollRaid",
      label: "Doll Raid",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      max: 1,
      initial: "max",
      appliesTo: actor => isDollkeeper(actor) && (getDollkeeperLevel(actor) >= 20),
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

export const registerDollkeeperPools = defineDollkeeperPools;

/* ---------------------------------------------------------------- Companion Construct */

export function isLivingDoll(actor) {
  if (!actor) return false;
  if (actor.flags?.ak5e?.isLivingDoll === true) return true;
  if (typeof actor.getFlag === "function" && actor.getFlag("ak5e", "isLivingDoll") === true) return true;
  return actor.system?.details?.creatureType?.toLowerCase?.() === "construct" &&
    actor.name?.toLowerCase?.().includes("doll");
}

export function createDollCompanionData(ownerActor, options = {}) {
  const ownerName = ownerActor?.name ?? "Specialist";
  const ownerSize = ownerActor?.system?.traits?.size ?? "med";
  const ownerMaxHp = Math.max(1, Number(ownerActor?.system?.attributes?.hp?.max ?? 10));
  const ownerSpeed = Math.max(0, Number(ownerActor?.system?.attributes?.movement?.walk ?? 30));
  const ownerPb = getOwnerPB(ownerActor);

  const weaponProfs = ownerActor?.system?.traits?.weaponProf?.value ?? ["lgt", "simple"];
  const armorProfs = ownerActor?.system?.traits?.armorProf?.value ?? ["lgt", "med", "shl"];

  return {
    name: options.name ?? `${ownerName}'s Living Doll`,
    type: "npc",
    system: {
      details: {
        alignment: "Neutral",
        type: { value: "construct" },
        creatureType: "construct",
        biography: {
          value: "A Living Doll companion animated by Arts or intricate construct engineering. Visually identical to its owner but cannot speak without advanced upgrades."
        }
      },
      traits: {
        size: ownerSize,
        di: { value: [...DOLL_DAMAGE_IMMUNITIES] },
        ci: { value: [...DOLL_CONDITION_IMMUNITIES] },
        languages: {
          value: ownerActor?.system?.traits?.languages?.value ?? ["common"],
          custom: "Understands languages owner speaks, cannot speak"
        },
        weaponProf: { value: Array.from(weaponProfs) },
        armorProf: { value: Array.from(armorProfs) }
      },
      abilities: {
        str: { value: DOLL_BASE_STATS.str, mod: DOLL_BASE_MODIFIERS.str },
        dex: { value: DOLL_BASE_STATS.dex, mod: DOLL_BASE_MODIFIERS.dex },
        con: { value: DOLL_BASE_STATS.con, mod: DOLL_BASE_MODIFIERS.con },
        int: { value: DOLL_BASE_STATS.int, mod: DOLL_BASE_MODIFIERS.int },
        wis: { value: DOLL_BASE_STATS.wis, mod: DOLL_BASE_MODIFIERS.wis },
        cha: { value: DOLL_BASE_STATS.cha, mod: DOLL_BASE_MODIFIERS.cha }
      },
      attributes: {
        ac: { calc: "flat", flat: 10 + DOLL_BASE_MODIFIERS.dex },
        hp: {
          value: options.hp ?? ownerMaxHp,
          max: ownerMaxHp,
          temp: 0
        },
        movement: {
          walk: ownerSpeed
        },
        senses: {
          darkvision: 60,
          passivePerception: 8 + ownerPb
        },
        prof: ownerPb
      }
    },
    flags: {
      ak5e: {
        isLivingDoll: true,
        ownerId: ownerActor?.id ?? null,
        ownerUuid: ownerActor?.uuid ?? null,
        perceptionDC: 18,
        traits: ["artificial", "selfRejuvenation", "murderousMarionette"]
      }
    }
  };
}

export async function synchronizeDoll(ownerActor, dollActor) {
  if (!ownerActor || !dollActor) return null;

  const ownerMaxHp = Math.max(1, Number(ownerActor.system?.attributes?.hp?.max ?? 10));
  const ownerSpeed = Math.max(0, Number(ownerActor.system?.attributes?.movement?.walk ?? 30));
  const ownerPb = getOwnerPB(ownerActor);

  const updates = {
    "system.attributes.hp.max": ownerMaxHp,
    "system.attributes.movement.walk": ownerSpeed,
    "system.attributes.prof": ownerPb,
    "system.attributes.senses.darkvision": 60,
    "system.attributes.senses.passivePerception": 8 + ownerPb
  };

  const dollCurHp = Number(dollActor.system?.attributes?.hp?.value ?? ownerMaxHp);
  if (dollCurHp > ownerMaxHp) {
    updates["system.attributes.hp.value"] = ownerMaxHp;
  }

  // Copy weapon & armor proficiencies from owner
  if (ownerActor.system?.traits?.weaponProf?.value) {
    updates["system.traits.weaponProf.value"] = Array.from(ownerActor.system.traits.weaponProf.value);
  }
  if (ownerActor.system?.traits?.armorProf?.value) {
    updates["system.traits.armorProf.value"] = Array.from(ownerActor.system.traits.armorProf.value);
  }

  if (typeof dollActor.update === "function") {
    await dollActor.update(updates);
  } else {
    dollActor.system ??= {};
    dollActor.system.attributes ??= {};
    dollActor.system.attributes.hp ??= {};
    dollActor.system.attributes.hp.max = ownerMaxHp;
    if (dollCurHp > ownerMaxHp) dollActor.system.attributes.hp.value = ownerMaxHp;
    dollActor.system.attributes.movement ??= {};
    dollActor.system.attributes.movement.walk = ownerSpeed;
    dollActor.system.attributes.prof = ownerPb;
    dollActor.system.attributes.senses ??= {};
    dollActor.system.attributes.senses.darkvision = 60;
    dollActor.system.attributes.senses.passivePerception = 8 + ownerPb;
  }

  return {
    synchronized: true,
    ownerMaxHp,
    ownerSpeed,
    ownerPb,
    updates
  };
}

/* ---------------------------------------------------------------- Strike Action & Combat */

export function getDollStrikeAttackCount(ownerActor) {
  const lvl = getDollkeeperLevel(ownerActor);
  if (lvl >= 20) return 3; // Artistry is Violence
  if (lvl >= 11) return 2; // Masquerade
  return 1;
}

export function calculateDollStrikeBonus(ownerActor, dollActor, weapon = null) {
  const pb = getOwnerPB(ownerActor);
  const dollDexMod = Number(dollActor?.system?.abilities?.dex?.mod ?? DOLL_BASE_MODIFIERS.dex);
  const dollStrMod = Number(dollActor?.system?.abilities?.str?.mod ?? DOLL_BASE_MODIFIERS.str);

  let abilityMod = Math.max(dollDexMod, dollStrMod);
  if (weapon?.system?.actionType === "rwak") {
    abilityMod = dollDexMod;
  }

  let bonus = abilityMod + pb;

  // Look in the Mirror (Level 5): shares Weapon Specialisation and Adept
  if (hasPullTheStrings(ownerActor)) {
    const spec = getWeaponSpecialisation(ownerActor);
    if (spec?.style === "Archery" && weapon?.system?.actionType === "rwak") {
      bonus += 2;
    }
    if (hasWeaponAdept(ownerActor)) {
      bonus += 1;
    }
  }

  return bonus;
}

export function calculateDollStrikeDamageFormula(ownerActor, dollActor, weapon = null, options = {}) {
  const dollDexMod = Number(dollActor?.system?.abilities?.dex?.mod ?? DOLL_BASE_MODIFIERS.dex);
  const dollStrMod = Number(dollActor?.system?.abilities?.str?.mod ?? DOLL_BASE_MODIFIERS.str);

  let baseMod = Math.max(dollDexMod, dollStrMod);
  let baseDice = "1d8";
  let damageType = options.damageType ?? "bludgeoning";

  if (weapon?.system?.damage?.parts?.[0]?.[0]) {
    baseDice = weapon.system.damage.parts[0][0];
    damageType = weapon.system.damage.parts[0][1] ?? damageType;
  }

  let totalMod = baseMod;

  // Look in the Mirror (Level 5): shares Weapon Specialisation and Weapon Mastery
  if (hasPullTheStrings(ownerActor)) {
    const spec = getWeaponSpecialisation(ownerActor);
    if (spec?.style === "Dueling" && (!weapon || weapon.system?.type !== "twoHanded")) {
      totalMod += 2;
    }
    if (hasWeaponMastery(ownerActor)) {
      const lvl = getDollkeeperLevel(ownerActor);
      if (weapon?.system?.actionType === "rwak") {
        totalMod += getOwnerPB(ownerActor);
      } else {
        totalMod += Math.floor(lvl / 2);
      }
    }
  }

  const sign = totalMod >= 0 ? "+" : "-";
  return {
    formula: `${baseDice} ${sign} ${Math.abs(totalMod)}`,
    damageType,
    dice: baseDice,
    mod: totalMod,
    baseMod
  };
}

export function hasMurderousMarionetteAdvantage(ownerActor, dollActor, targetActor, options = {}) {
  if (options.hasAdvantage !== undefined) return options.hasAdvantage;
  const ownerReach = Number(options.ownerReach ?? 5);
  const distanceToOwner = calculateDistance(ownerActor, targetActor, options);
  return distanceToOwner <= ownerReach;
}

/* ---------------------------------------------------------------- Command in Combat */

export function validateDollCommand(ownerActor, dollActor, command, options = {}) {
  const warnings = [];
  const normalizedCommand = String(command).toLowerCase();

  if (!DOLL_COMMAND_ACTIONS.includes(normalizedCommand)) {
    warnings.push(`Unknown command "${command}". Valid commands are: ${DOLL_COMMAND_ACTIONS.join(", ")}.`);
  }

  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) {
    warnings.push("Doll is destroyed (0 HP).");
  }

  const distance = calculateDistance(ownerActor, dollActor, options);
  if (distance > 100) {
    warnings.push(`Doll is beyond 100 ft command range (${Math.round(distance)} ft).`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    command: normalizedCommand,
    distance,
    dollHp
  };
}

export async function executeDollCommand(ownerActor, dollActor, command, options = {}) {
  const check = validateDollCommand(ownerActor, dollActor, command, options);
  if (!check.valid && !options.override) {
    return {
      success: false,
      warnings: check.warnings,
      receipt: null
    };
  }

  const attackCount = check.command === "strike" ? getDollStrikeAttackCount(ownerActor) : 0;
  const attackBonus = check.command === "strike" ? calculateDollStrikeBonus(ownerActor, dollActor, options.weapon) : null;
  const damageFormula = check.command === "strike" ? calculateDollStrikeDamageFormula(ownerActor, dollActor, options.weapon, options) : null;

  const receipt = {
    action: "dollCommand",
    command: check.command,
    distance: check.distance,
    attackCount,
    attackBonus,
    damageFormula: damageFormula?.formula ?? null,
    damageType: damageFormula?.damageType ?? null,
    warnings: [...check.warnings],
    timestamp: Date.now()
  };

  return {
    success: true,
    command: check.command,
    attackCount,
    attackBonus,
    damageFormula: damageFormula?.formula,
    warnings: check.warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- Restoring & Replacing */

export function linkHitDiceHealing(ownerActor, dollActor, rollResult, options = {}) {
  const dollCurHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  const dollMaxHp = Number(dollActor?.system?.attributes?.hp?.max ?? 10);

  if (dollCurHp <= 0) {
    return {
      healed: 0,
      dollDestroyed: true,
      priorHp: 0,
      newHp: 0,
      warnings: ["Doll has 0 HP and cannot regain Hit Points via Hit Dice healing."]
    };
  }

  const conMod = Number(ownerActor?.system?.abilities?.con?.mod ?? 0);
  const amountToHeal = Math.max(0, Number(rollResult) + conMod);
  const newHp = Math.min(dollMaxHp, dollCurHp + amountToHeal);
  const actualRestored = newHp - dollCurHp;

  if (dollActor.system?.attributes?.hp) {
    dollActor.system.attributes.hp.value = newHp;
  }

  return {
    healed: actualRestored,
    amountRolled: Number(rollResult),
    ownerConMod: conMod,
    priorHp: dollCurHp,
    newHp,
    maxHp: dollMaxHp,
    receipt: {
      action: "hitDiceHealing",
      priorHp: dollCurHp,
      newHp,
      healed: actualRestored,
      amountToHeal
    }
  };
}

export function rebuildDoll(ownerActor, dollActor, options = {}) {
  const hasComponents = options.hasComponents ?? true;
  const lmdSpent = Number(options.lmdSpent ?? (hasComponents ? 0 : 500));
  const warnings = [];

  if (!hasComponents && lmdSpent < 500) {
    warnings.push(`Replacing doll components requires 500 LMD (shortfall: ${500 - lmdSpent} LMD).`);
    if (!options.override) {
      return {
        success: false,
        warnings,
        receipt: null
      };
    }
  }

  const maxHp = Number(ownerActor?.system?.attributes?.hp?.max ?? 10);
  const priorHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);

  if (dollActor?.system?.attributes?.hp) {
    dollActor.system.attributes.hp.value = maxHp;
    dollActor.system.attributes.hp.max = maxHp;
  }

  const receipt = {
    action: "rebuildDoll",
    hasComponents,
    lmdSpent,
    priorHp,
    newHp: maxHp,
    warnings: [...warnings],
    timestamp: Date.now()
  };

  return {
    success: true,
    priorHp,
    newHp: maxHp,
    lmdSpent,
    warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- 5th Level: Pull the Strings */

export function canUseDollsDance(ownerActor, dollActor, skill = {}) {
  if (!hasPullTheStrings(ownerActor)) return false;
  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) return false;

  const duration = skill.duration ?? skill.system?.duration?.units ?? "inst";
  const isInstant = duration === "instant" || duration === "inst" || duration === "round";
  return isInstant;
}

export function applyLookInTheMirror(ownerActor, dollActor) {
  if (!hasPullTheStrings(ownerActor)) {
    return { active: false, bonuses: {} };
  }

  const spec = getWeaponSpecialisation(ownerActor);
  const adept = hasWeaponAdept(ownerActor);
  const expertise = hasWeaponExpertise(ownerActor);
  const mastery = hasWeaponMastery(ownerActor);
  const lvl = getDollkeeperLevel(ownerActor);

  return {
    active: true,
    specialisation: spec,
    adept,
    expertise,
    mastery,
    meleeMasteryBonus: Math.floor(lvl / 2),
    rangedMasteryBonus: getOwnerPB(ownerActor)
  };
}

export function validateMarionette(ownerActor, dollActor, incomingDamage, options = {}) {
  const warnings = [];

  if (!hasPullTheStrings(ownerActor)) {
    warnings.push("Requires Dollkeeper Level 5 (Pull the Strings: Marionette).");
  }

  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) {
    warnings.push("Doll is already destroyed (0 HP).");
  }

  const distance = calculateDistance(ownerActor, dollActor, options);
  if (distance > 100) {
    warnings.push(`Doll is beyond 100 ft range for Marionette (${Math.round(distance)} ft).`);
  }

  const marionettePool = getPool(ownerActor, "marionette");
  if (marionettePool && marionettePool.value < 1) {
    warnings.push("Marionette use already expended (1/Long Rest).");
  }

  return {
    valid: warnings.length === 0,
    warnings,
    distance,
    dollHp,
    incomingDamage: Number(incomingDamage) || 0
  };
}

export async function executeMarionette(ownerActor, dollActor, incomingDamage, options = {}) {
  const check = validateMarionette(ownerActor, dollActor, incomingDamage, options);
  if (!check.valid && !options.override) {
    return {
      success: false,
      warnings: check.warnings,
      receipt: null
    };
  }

  const ownerPriorHp = Number(ownerActor.system?.attributes?.hp?.value ?? 0);
  const dollPriorHp = Number(dollActor.system?.attributes?.hp?.value ?? 0);

  const ownerPriorPos = getActorPosition(ownerActor);
  const dollPriorPos = getActorPosition(dollActor);

  // Spend Marionette 1/LR pool
  let usesSpent = 0;
  try {
    const spendRes = await spendPool(ownerActor, "marionette", 1);
    if (!spendRes?.error) usesSpent = 1;
  } catch {
    usesSpent = 1;
  }

  // Swap positions
  await setActorPosition(ownerActor, dollPriorPos);
  await setActorPosition(dollActor, ownerPriorPos);

  // Owner avoids dropping to 0: stays at 1 HP
  const ownerNewHp = 1;
  if (ownerActor.system?.attributes?.hp) {
    ownerActor.system.attributes.hp.value = ownerNewHp;
  }

  // Doll takes the damage in owner's place
  const dmg = Number(incomingDamage) || 0;
  const dollNewHp = Math.max(0, dollPriorHp - dmg);
  if (dollActor.system?.attributes?.hp) {
    dollActor.system.attributes.hp.value = dollNewHp;
  }

  const dollDestroyed = dollNewHp <= 0;

  const receipt = {
    action: "marionette",
    incomingDamage: dmg,
    ownerPriorHp,
    ownerNewHp,
    dollPriorHp,
    dollNewHp,
    dollDestroyed,
    ownerPriorPos,
    dollPriorPos,
    usesSpent,
    warnings: [...check.warnings],
    timestamp: Date.now()
  };

  return {
    success: true,
    ownerNewHp,
    dollNewHp,
    dollDestroyed,
    swappedPositions: true,
    warnings: check.warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- 5th Level: Musical Chairs */

export function validateMusicalChairs(ownerActor, dollActor, options = {}) {
  const warnings = [];

  if (!hasMusicalChairs(ownerActor)) {
    warnings.push("Requires Dollkeeper Level 5 (Musical Chairs).");
  }

  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) {
    warnings.push("Doll is destroyed (0 HP).");
  }

  const distance = calculateDistance(ownerActor, dollActor, options);
  if (distance > 60) {
    warnings.push(`Doll is beyond 60 ft Musical Chairs range (${Math.round(distance)} ft).`);
  }

  const prowessPool = getPool(ownerActor, "prowess");
  const prowess = prowessPool?.value ?? 0;
  if (prowess < 1) {
    warnings.push(`Insufficient Prowess for Musical Chairs (required: 1, available: ${prowess}).`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    distance,
    prowess,
    dollHp
  };
}

export async function executeMusicalChairs(ownerActor, dollActor, options = {}) {
  const check = validateMusicalChairs(ownerActor, dollActor, options);
  if (!check.valid && !options.override) {
    return {
      success: false,
      warnings: check.warnings,
      receipt: null
    };
  }

  const ownerPriorPos = getActorPosition(ownerActor);
  const dollPriorPos = getActorPosition(dollActor);

  // Spend 1 Prowess (clamped at 0 on shortfall)
  let prowessSpent = 0;
  let shortfall = 0;
  try {
    const spendRes = await spendPool(ownerActor, "prowess", 1);
    if (!spendRes?.error) {
      prowessSpent = 1;
    } else {
      shortfall = 1;
    }
  } catch {
    shortfall = 1;
  }

  // Swap positions without provoking opportunity attacks
  await setActorPosition(ownerActor, dollPriorPos);
  await setActorPosition(dollActor, ownerPriorPos);

  const receipt = {
    action: "musicalChairs",
    prowessSpent,
    shortfall,
    distance: check.distance,
    ownerPriorPos,
    dollPriorPos,
    warnings: [...check.warnings],
    timestamp: Date.now()
  };

  return {
    success: true,
    swappedPositions: true,
    prowessSpent,
    shortfall,
    warnings: check.warnings,
    receipt
  };
}

export async function checkDollkeeperProwessGain(ownerActor, dollActor, triggerEvent = {}) {
  if (!hasMusicalChairs(ownerActor)) {
    return { gained: false, reason: "Requires Dollkeeper Level 5 (Musical Chairs)." };
  }

  // Track 1/turn limit
  const flagData = ownerActor.flags?.ak5e?.dollkeeper ?? {};
  if (flagData.prowessGainedThisTurn === true && !triggerEvent.ignoreTurnLimit) {
    return { gained: false, reason: "Prowess already gained this turn from Dollkeeper feature (1/turn max)." };
  }

  let qualifies = false;
  let reason = "";

  // Trigger 1: Owner reduces creature to 0 HP that took damage from doll since start of owner's last turn
  if (triggerEvent.targetReducedToZero && triggerEvent.creatureDamagedByDoll) {
    qualifies = true;
    reason = "Owner reduced creature to 0 HP who took damage from Doll since start of last turn.";
  }

  // Trigger 2: Doll reduces creature to 0 HP
  if (!qualifies && triggerEvent.source === "doll" && triggerEvent.targetReducedToZero) {
    qualifies = true;
    reason = "Doll reduced creature to 0 HP.";
  }

  // Trigger 3: Joint proximity crit or 0 HP within 10 ft
  if (!qualifies && typeof triggerEvent.distance === "number" && triggerEvent.distance <= 10) {
    if (triggerEvent.targetReducedToZero || triggerEvent.isCrit) {
      qualifies = true;
      reason = "Owner and Doll fought together within 10 ft (0 HP or Critical Hit).";
    }
  }

  if (!qualifies) {
    return { gained: false, reason: "No Dollkeeper Prowess trigger conditions met." };
  }

  // Grant 1 Prowess
  let gained = false;
  try {
    const refundRes = await refundPool(ownerActor, "prowess", 1);
    if (!refundRes?.error) gained = true;
  } catch {
    gained = true;
  }

  if (ownerActor.flags?.ak5e?.dollkeeper) {
    ownerActor.flags.ak5e.dollkeeper.prowessGainedThisTurn = true;
  }

  return {
    gained: true,
    amount: 1,
    reason,
    receipt: {
      action: "jointProwessGain",
      amount: 1,
      reason,
      timestamp: Date.now()
    }
  };
}

/* ---------------------------------------------------------------- 11th Level: Masquerade */

export function validateMistakenIdentity(ownerActor, dollActor, attackerActor, options = {}) {
  const warnings = [];

  if (!hasMasquerade(ownerActor)) {
    warnings.push("Requires Dollkeeper Level 11 (Masquerade: Mistaken Identity).");
  }

  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) {
    warnings.push("Doll is destroyed (0 HP).");
  }

  const distance = calculateDistance(ownerActor, dollActor, options);
  if (distance > 100) {
    warnings.push(`Doll is beyond range (${Math.round(distance)} ft).`);
  }

  // Attacker immunity check (1 hour immunity if passed DC 18 perception)
  const isImmune = attackerActor?.flags?.ak5e?.mistakenIdentityImmune === true;
  if (isImmune) {
    warnings.push("Attacker is immune to Mistaken Identity for 1 hour.");
  }

  const pool = getPool(ownerActor, "mistakenIdentity");
  const uses = pool?.value ?? 0;
  if (uses < 1) {
    warnings.push(`No Mistaken Identity uses remaining (shortfall: 1).`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    uses,
    isImmune,
    distance
  };
}

export async function executeMistakenIdentity(ownerActor, dollActor, attackerActor, options = {}) {
  const check = validateMistakenIdentity(ownerActor, dollActor, attackerActor, options);
  if (!check.valid && !options.override) {
    return {
      success: false,
      warnings: check.warnings,
      receipt: null
    };
  }

  // Spend 1 use from mistakenIdentity pool
  let usesSpent = 0;
  let shortfall = 0;
  try {
    const spendRes = await spendPool(ownerActor, "mistakenIdentity", 1);
    if (!spendRes?.error) {
      usesSpent = 1;
    } else {
      shortfall = 1;
    }
  } catch {
    shortfall = 1;
  }

  const dc = 18;
  const perceptionCheckResult = options.perceptionCheckResult ?? null;
  let redirected = false;
  let attackerImmune = false;
  let chosenTarget = options.redirectTarget ?? (options.originalTarget === "owner" ? "doll" : "owner");

  if (perceptionCheckResult !== null) {
    if (perceptionCheckResult < dc) {
      // Failed check: redirection successful
      redirected = true;
    } else {
      // Succeeded check: attacker becomes immune for 1 hour
      attackerImmune = true;
      if (attackerActor) {
        attackerActor.flags ??= {};
        attackerActor.flags.ak5e ??= {};
        attackerActor.flags.ak5e.mistakenIdentityImmune = true;
      }
      chosenTarget = options.originalTarget ?? "owner";
    }
  }

  const receipt = {
    action: "mistakenIdentity",
    dc,
    perceptionCheckResult,
    redirected,
    attackerImmune,
    chosenTarget,
    usesSpent,
    shortfall,
    warnings: [...check.warnings],
    timestamp: Date.now()
  };

  return {
    success: true,
    dc,
    perceptionFormula: "1d20 + @abilities.wis.mod + @prof",
    redirected,
    attackerImmune,
    chosenTarget,
    usesSpent,
    shortfall,
    warnings: check.warnings,
    receipt
  };
}

export function executeTalkingHeads(ownerActor, dollActor, message, options = {}) {
  if (!hasMasquerade(ownerActor)) {
    return {
      success: false,
      warnings: ["Requires Dollkeeper Level 11 (Masquerade: Talking Heads)."]
    };
  }

  const distance = calculateDistance(ownerActor, dollActor, options);
  const inRange = distance <= 100;
  const warnings = inRange ? [] : [`Doll is beyond 100 ft telepathic range (${Math.round(distance)} ft).`];

  return {
    success: true,
    message: String(message ?? ""),
    speaker: dollActor?.name ?? "Doll",
    voiceOf: ownerActor?.name ?? "Specialist",
    telepathic: inRange,
    inRange,
    warnings,
    receipt: {
      action: "talkingHeads",
      message,
      inRange,
      warnings,
      timestamp: Date.now()
    }
  };
}

/* ---------------------------------------------------------------- 15th Level: Living Doll */

export function executeReciprocity(ownerActor, dollActor, eventData = {}, options = {}) {
  if (!hasLivingDoll15(ownerActor)) {
    return {
      success: false,
      warnings: ["Requires Dollkeeper Level 15 (Living Doll: Reciprocity)."]
    };
  }

  // Exclude resting HP recovery
  if (eventData.isResting === true) {
    return {
      success: false,
      ignored: true,
      reason: "Reciprocity does not trigger on resting HP recovery."
    };
  }

  const hpRecovered = Number(eventData.hpRecovered ?? 0);
  const tempHpGained = Number(eventData.tempHpGained ?? 0);
  const amount = Math.max(hpRecovered, tempHpGained);

  if (amount <= 0) {
    return {
      success: false,
      amount: 0,
      reason: "No HP recovered or Temporary HP gained."
    };
  }

  // Identify recipient: if source was owner, recipient is doll; if doll, recipient is owner
  const isOwnerSource = eventData.source === "owner" || eventData.actorId === ownerActor?.id;
  const recipient = isOwnerSource ? dollActor : ownerActor;

  const priorTempHp = Number(recipient?.system?.attributes?.hp?.temp ?? 0);
  const newTempHp = Math.max(priorTempHp, amount);

  if (recipient?.system?.attributes?.hp) {
    recipient.system.attributes.hp.temp = newTempHp;
  }

  const receipt = {
    action: "reciprocity",
    source: isOwnerSource ? "owner" : "doll",
    recipient: isOwnerSource ? "doll" : "owner",
    amount,
    priorTempHp,
    newTempHp,
    timestamp: Date.now()
  };

  return {
    success: true,
    amount,
    priorTempHp,
    newTempHp,
    receipt
  };
}

export function canShareArts(ownerActor, dollActor, artData = {}) {
  if (!hasLivingDoll15(ownerActor)) return false;
  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) return false;

  // Source rule: "an Art that does not restore Hit Points or deal Damage"
  if (artData.dealsDamage === true || artData.restoresHp === true) return false;
  if (artData.system?.actionType === "damage" || artData.system?.actionType === "heal") return false;

  return true;
}

export function executeShareArts(ownerActor, dollActor, artData = {}, options = {}) {
  const canShare = canShareArts(ownerActor, dollActor, artData);
  if (!canShare && !options.override) {
    return {
      success: false,
      warnings: ["Art deals damage or restores HP, or doll is destroyed."],
      receipt: null
    };
  }

  const receipt = {
    action: "shareArts",
    artName: artData.name ?? "Art",
    targets: [ownerActor?.name ?? "Owner", dollActor?.name ?? "Doll"],
    shared: true,
    timestamp: Date.now()
  };

  return {
    success: true,
    shared: true,
    targets: receipt.targets,
    receipt
  };
}

/* ---------------------------------------------------------------- 20th Level: Artistry is Violence */

export function validateDollRaid(ownerActor, dollActor, options = {}) {
  const warnings = [];

  if (!hasArtistryIsViolence(ownerActor)) {
    warnings.push("Requires Dollkeeper Level 20 (Artistry is Violence: Doll Raid).");
  }

  const dollHp = Number(dollActor?.system?.attributes?.hp?.value ?? 0);
  if (dollHp <= 0) {
    warnings.push("Doll is destroyed (0 HP).");
  }

  const pool = getPool(ownerActor, "dollRaid");
  const uses = pool?.value ?? 0;
  if (uses < 1) {
    warnings.push("Doll Raid already expended (1/Long Rest).");
  }

  return {
    valid: warnings.length === 0,
    warnings,
    uses,
    dollHp
  };
}

export async function executeDollRaid(ownerActor, dollActor, options = {}) {
  const check = validateDollRaid(ownerActor, dollActor, options);
  if (!check.valid && !options.override) {
    return {
      success: false,
      warnings: check.warnings,
      receipt: null
    };
  }

  // Spend 1 use of dollRaid pool
  let usesSpent = 0;
  let shortfall = 0;
  try {
    const spendRes = await spendPool(ownerActor, "dollRaid", 1);
    if (!spendRes?.error) {
      usesSpent = 1;
    } else {
      shortfall = 1;
    }
  } catch {
    shortfall = 1;
  }

  const strikeAttacks = getDollStrikeAttackCount(ownerActor); // 3 at level 20

  const receipt = {
    action: "dollRaid",
    usesSpent,
    shortfall,
    strikeAttacks,
    simultaneousTurns: true,
    warnings: [...check.warnings],
    timestamp: Date.now()
  };

  return {
    success: true,
    strikeAttacks,
    simultaneousTurns: true,
    usesSpent,
    shortfall,
    warnings: check.warnings,
    receipt
  };
}

/* ---------------------------------------------------------------- Reversibility & Undo */

function lookupDollActor(ownerActor) {
  if (!ownerActor) return null;
  const dollId = (typeof ownerActor.getFlag === "function" ? ownerActor.getFlag("ak5e", "dollkeeper") : ownerActor.flags?.ak5e?.dollkeeper)?.dollId;
  if (dollId) {
    if (globalThis.game?.actors?.get) {
      const a = globalThis.game.actors.get(dollId);
      if (a) return a;
    }
    const token = globalThis.canvas?.tokens?.placeables?.find(t => t.actor?.id === dollId);
    if (token?.actor) return token.actor;
  }
  if (globalThis.game?.actors?.find) {
    const a = globalThis.game.actors.find(act => {
      const f = act.flags?.ak5e;
      return f?.isLivingDoll && (f?.ownerId === ownerActor.id || f?.ownerUuid === ownerActor.uuid);
    });
    if (a) return a;
  }
  if (globalThis.canvas?.tokens?.placeables) {
    const token = globalThis.canvas.tokens.placeables.find(t => {
      const f = t.actor?.flags?.ak5e;
      return f?.isLivingDoll && (f?.ownerId === ownerActor.id || f?.ownerUuid === ownerActor.uuid);
    });
    if (token?.actor) return token.actor;
  }
  return null;
}

export async function undoDollkeeperAction(ownerActor, dollActor, receipt) {
  if (!receipt && dollActor && (dollActor.action || dollActor.spends || dollActor.receiptId || dollActor.command || dollActor.title || dollActor.priorHP !== undefined || dollActor.ownerPriorPos !== undefined)) {
    receipt = dollActor;
    dollActor = null;
  }

  if (!receipt || typeof receipt !== "object") {
    return { reverted: false, error: "Invalid receipt." };
  }

  if (!dollActor && ownerActor) {
    dollActor = lookupDollActor(ownerActor);
  }

  const action = receipt.action || receipt.command;
  switch (action) {
    case "marionette": {
      if (ownerActor?.system?.attributes?.hp && receipt.ownerPriorHp !== undefined) {
        ownerActor.system.attributes.hp.value = receipt.ownerPriorHp;
      }
      if (dollActor?.system?.attributes?.hp && receipt.dollPriorHp !== undefined) {
        dollActor.system.attributes.hp.value = receipt.dollPriorHp;
      }
      if (receipt.ownerPriorPos) await setActorPosition(ownerActor, receipt.ownerPriorPos);
      if (receipt.dollPriorPos && dollActor) await setActorPosition(dollActor, receipt.dollPriorPos);
      if (receipt.usesSpent) await refundPool(ownerActor, "marionette", receipt.usesSpent);
      return { reverted: true, action: "marionette" };
    }

    case "musicalChairs": {
      if (receipt.ownerPriorPos) await setActorPosition(ownerActor, receipt.ownerPriorPos);
      if (receipt.dollPriorPos && dollActor) await setActorPosition(dollActor, receipt.dollPriorPos);
      if (receipt.prowessSpent) await refundPool(ownerActor, "prowess", receipt.prowessSpent);
      return { reverted: true, action: "musicalChairs" };
    }

    case "mistakenIdentity": {
      if (receipt.usesSpent) await refundPool(ownerActor, "mistakenIdentity", receipt.usesSpent);
      return { reverted: true, action: "mistakenIdentity" };
    }

    case "dollRaid": {
      if (receipt.usesSpent) await refundPool(ownerActor, "dollRaid", receipt.usesSpent);
      return { reverted: true, action: "dollRaid" };
    }

    case "reciprocity": {
      const recipient = receipt.recipient === "owner" ? ownerActor : dollActor;
      if (recipient?.system?.attributes?.hp && receipt.priorTempHp !== undefined) {
        recipient.system.attributes.hp.temp = receipt.priorTempHp;
      }
      return { reverted: true, action: "reciprocity" };
    }

    case "hitDiceHealing": {
      if (dollActor?.system?.attributes?.hp && receipt.priorHp !== undefined) {
        dollActor.system.attributes.hp.value = receipt.priorHp;
      }
      return { reverted: true, action: "hitDiceHealing" };
    }

    case "rebuildDoll": {
      if (dollActor?.system?.attributes?.hp && receipt.priorHp !== undefined) {
        dollActor.system.attributes.hp.value = receipt.priorHp;
      }
      return { reverted: true, action: "rebuildDoll" };
    }

    case "dollCommand":
    case "talkingHeads":
    case "shareArts": {
      return { reverted: true, action: action };
    }

    default:
      return { reverted: false, error: `Unknown receipt action: ${action}` };
  }
}

/* ---------------------------------------------------------------- Hook Registrations */

export function registerDollkeeperHooks() {
  defineDollkeeperPools();

  if (globalThis.game) {
    try {
      if (!Object.isFrozen(globalThis.game.ak5e ?? {}) && !Object.isFrozen(globalThis.game.ak5e?.specialist ?? {})) {
        globalThis.game.ak5e ??= {};
        globalThis.game.ak5e.specialist ??= {};
        globalThis.game.ak5e.specialist.dollkeeper = {
          isDollkeeper,
          hasLivingDoll,
          hasPullTheStrings,
          hasMusicalChairs,
          hasMasquerade,
          hasLivingDoll15,
          hasArtistryIsViolence,
          createDollCompanionData,
          synchronizeDoll,
          calculateDollStrikeBonus,
          calculateDollStrikeDamageFormula,
          getDollStrikeAttackCount,
          commandDoll: executeDollCommand,
          rebuildDoll,
          linkHitDiceHealing,
          executeMarionette,
          executeMusicalChairs,
          checkDollkeeperProwessGain,
          executeMistakenIdentity,
          executeTalkingHeads,
          executeReciprocity,
          canShareArts,
          executeShareArts,
          executeDollRaid,
          undoDollkeeperAction
        };
      }
    } catch {
      // Ignore if frozen
    }
  }

  if (hooksInstalled === globalThis.Hooks) return;
  hooksInstalled = globalThis.Hooks;

  if (globalThis.Hooks?.on) {
    globalThis.Hooks.on("dnd5e.restCompleted", async (actor, data) => {
      if (isDollkeeper(actor)) {
        if (data?.longRest) {
          // Self-Rejuvenation: If Doll has > 1 HP, regains all missing HP
          const doll = actor.flags?.ak5e?.dollkeeper?.dollActor;
          if (doll?.system?.attributes?.hp) {
            const cur = Number(doll.system.attributes.hp.value ?? 0);
            const max = Number(doll.system.attributes.hp.max ?? 10);
            if (cur > 1 && cur < max) {
              doll.system.attributes.hp.value = max;
            }
          }
        }
      }
    });

    globalThis.Hooks.on("combatTurnChange", (combat, previous, current) => {
      // Reset 1/turn prowess gain tracker at start of turn
      const currentCombatant = combat?.combatants?.get?.(current?.combatantId);
      const actor = currentCombatant?.actor;
      if (actor?.flags?.ak5e?.dollkeeper) {
        actor.flags.ak5e.dollkeeper.prowessGainedThisTurn = false;
      }
    });
  }
}
