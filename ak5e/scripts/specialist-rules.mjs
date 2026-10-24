/** Specialist class rules (Ch. 3 L5161–5493).
 * Pure and functional: Hit dice, HP formulas, level step tables, DCs,
 * saving throw options, weapon/armor/tool proficiencies, fighting styles, and profile checks.
 * Zero database writes and zero Foundry globals required at import time.
 */

export const SPECIALIST_CLASS_ID = "class-specialist";

import { definePool, getPoolDefinition, registerProwessPool } from "./resource-pools.mjs";
import { calculateFuelMax, defineSkyrangerPools } from "./skyranger-features.mjs";
import { defineDollkeeperPools } from "./dollkeeper-features.mjs";
import { defineTrapmasterPools, calculateTrapDC } from "./trapmaster-features.mjs";

export const SPECIALIST_BRANCH_IDS = Object.freeze({
  "subclass-specialist-executor": "executor",
  "subclass-specialist-hookmaster": "hookmaster",
  "subclass-specialist-infuser": "infusion",
  "subclass-specialist-inventor": "inventor",
  "subclass-specialist-skyranger": "skyranger",
  "subclass-specialist-dollkeeper": "dollkeeper",
  "subclass-specialist-trapmaster": "trapmaster"
});

export const IMPLEMENTED_SPECIALIST_BRANCHES = Object.freeze([
  "executor",
  "hookmaster",
  "infusion",
  "inventor",
  "skyranger",
  "dollkeeper",
  "trapmaster"
]);

export const SPECIALIST_SKILLS = Object.freeze([
  ["Acrobatics", "acr"],
  ["Sleight of Hand", "slt"],
  ["Stealth", "ste"],
  ["Tech", "ak5etech"],
  ["Perception", "prc"],
  ["Wilderness", "ak5ewilderness"]
]);

export const SPECIALIST_SAVES = Object.freeze({
  automatic: "dex",
  choices: [
    ["Wisdom", "wis"],
    ["Charisma", "cha"]
  ]
});

export const SPECIALIST_ARMOR_PROFS = Object.freeze(["lgt", "med", "shl"]);
export const SPECIALIST_WEAPON_PROFS = Object.freeze(["Light Melee", "Light Ranged"]);
export const SPECIALIST_TOOL_CHOICES = Object.freeze(["Two Tool Kits of your choice"]);

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

export const WEAPON_SPECIALISATION_CATEGORIES = Object.freeze({
  MELEE: "melee",
  RANGED: "ranged"
});

export const MELEE_FIGHTING_STYLES = Object.freeze([
  { id: "brawler", name: "Brawler", chapterThreeId: "class-feature-specialist-brawler-3599", summary: "Bonus action unarmed strike each turn" },
  { id: "deadlyFighterMelee", name: "Deadly Fighter", chapterThreeId: "class-feature-specialist-deadly-fighter-3687", summary: "+1 Crit range on Deadly weapons first time each turn" },
  { id: "defensive", name: "Defensive", chapterThreeId: "class-feature-specialist-defensive-3852", summary: "Reaction +1d4 AC when hit while wielding melee weapon or shield" },
  { id: "duelling", name: "Duelling", chapterThreeId: "class-feature-specialist-duelling-4073", summary: "+1 attack and damage on first creature attacked each turn" },
  { id: "greatWeaponFighting", name: "Great Weapon Fighting", chapterThreeId: "class-feature-specialist-great-weapon-fighting-4203", summary: "+2 damage with two-handed/versatile melee weapon held in two hands" },
  { id: "lightlyArmed", name: "Lightly Armed", chapterThreeId: "class-feature-specialist-lightly-armed-4421", summary: "+2 attack rolls when wielding one-handed melee weapon and no shield/other weapon" },
  { id: "spearwall", name: "Spearwall", chapterThreeId: "class-feature-specialist-spearwall-4578", summary: "+1 damage die on melee attack when not your turn" },
  { id: "twoWeaponFightingMelee", name: "Two-Weapon Fighting", chapterThreeId: "class-feature-specialist-two-weapon-fighting-4699", summary: "Add ability modifier to offhand damage; draw/stow two weapons" }
]);

export const RANGED_FIGHTING_STYLES = Object.freeze([
  { id: "bracedForAction", name: "Braced for Action", chapterThreeId: "class-feature-specialist-braced-for-action-5111", summary: "1/turn reroll one damage die for Brace weapon" },
  { id: "closeAndPersonal", name: "Close and Personal", chapterThreeId: "class-feature-specialist-close-and-personal-5250", summary: "No disadvantage on ranged attacks within 5 ft of hostile creature" },
  { id: "coneOfFire", name: "Cone of Fire", chapterThreeId: "class-feature-specialist-cone-of-fire-5383", summary: "Spread quality additional damage applies even on miss" },
  { id: "deadlyFighterRanged", name: "Deadly Fighter", chapterThreeId: "class-feature-specialist-deadly-fighter-5519", summary: "+1 Crit range on Deadly weapons first time each turn" },
  { id: "ranger", name: "Ranger", chapterThreeId: "class-feature-specialist-ranger-5684", summary: "+2 attack rolls with ranged or thrown weapons" },
  { id: "smoothOperator", name: "Smooth Operator", chapterThreeId: "class-feature-specialist-smooth-operator-5774", summary: "Rapid Fire bonus action attack adds ability modifier to damage" },
  { id: "twoWeaponFightingRanged", name: "Two-Weapon Fighting", chapterThreeId: "class-feature-specialist-two-weapon-fighting-5953", summary: "Add ability modifier to offhand damage; draw/stow two weapons" }
]);

export const ALL_FIGHTING_STYLES = Object.freeze([...MELEE_FIGHTING_STYLES, ...RANGED_FIGHTING_STYLES]);

export const SPECIALIST_LEVEL_STEPS = Object.freeze({
  1: { level: 1, pb: 2, features: ["Specialist Branch", "Weapon Specialisation"] },
  2: { level: 2, pb: 2, features: ["Basic Operator Skill"] },
  3: { level: 3, pb: 2, features: ["Basic Talent"] },
  4: { level: 4, pb: 2, features: ["Ability Score Improvement", "Show Your Style"] },
  5: { level: 5, pb: 3, features: ["Branch Feature"] },
  6: { level: 6, pb: 3, features: ["Ability Score Improvement", "Weapon Adept"] },
  7: { level: 7, pb: 3, features: ["Elite 1- Advanced Operator Skill"] },
  8: { level: 8, pb: 3, features: ["Ability Score Improvement", "Basic Talent Module"] },
  9: { level: 9, pb: 4, features: ["Advanced Talent"] },
  10: { level: 10, pb: 4, features: ["Ability Score Improvement"] },
  11: { level: 11, pb: 4, features: ["Branch Feature"] },
  12: { level: 12, pb: 4, features: ["Ability Score Improvement", "Weapon Expertise"] },
  13: { level: 13, pb: 5, features: ["Advanced Talent Module"] },
  14: { level: 14, pb: 5, features: ["Elite 2- Elite Operator Skill"] },
  15: { level: 15, pb: 5, features: ["Branch Feature"] },
  16: { level: 16, pb: 5, features: ["Ability Score Improvement"] },
  17: { level: 17, pb: 6, features: ["Falling Upwards"] },
  18: { level: 18, pb: 6, features: ["Weapon Mastery"] },
  19: { level: 19, pb: 6, features: ["Ability Score Improvement"] },
  20: { level: 20, pb: 6, features: ["Branch Feature"] }
});

export const STARTING_EQUIPMENT_OPTIONS = Object.freeze({
  choiceWeapon1: {
    a: "1x Light Melee Weapon",
    b: "1x Light Ranged Weapon"
  },
  choiceWeaponShield: {
    a: "1x Light Melee Weapon",
    b: "1x Light Shield"
  },
  choiceOutfit: {
    a: "Reinforced Outfit",
    b: "Underarmour"
  },
  toolKit: "1x Tool Kit proficient with",
  cashOptionLMD: 1300
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  weaponCategory: null,
  fightingStyle: null,
  operations: [],
  events: [],
  uses: {},
  rulings: {}
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError("Specialist level must be an integer from 1 to 20.");
  }
  return n;
}

export function pbForLevel(level) {
  const lvl = checkLevel(level);
  return Math.floor((lvl - 1) / 4) + 2;
}

export function hitPointsAtLevel(level, conMod = 0, { mode = "fixed", rolls = [] } = {}) {
  const lvl = checkLevel(level);
  const con = Number(conMod) || 0;
  let total = Math.max(1, 8 + con);
  for (let i = 2; i <= lvl; i++) {
    const rollIndex = i - 2;
    const gained = (mode === "rolled" && Number.isInteger(rolls[rollIndex])) ? rolls[rollIndex] : 5;
    total += Math.max(1, gained + con);
  }
  return Math.max(1, total);
}

export function martialDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const strMod = Number(system.abilities?.str?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + Math.max(strMod, dexMod);
}

export function specialistDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + dexMod;
}

export function weaponMasteryMeleeBonus(level) {
  return Math.floor(checkLevel(level) / 2);
}

export function weaponMasteryRangedBonus(actor) {
  const lvl = specialistLevel(actor) ?? 1;
  return pbForLevel(lvl);
}

export function specialistState(actor) {
  const stored = flag(actor, "specialist") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
  };
}

export function specialistProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const sClass = classes.find(i => flag(i, "chapterThreeId") === SPECIALIST_CLASS_ID || i.name === "Specialist" || i.identifier === "specialist" || i.system?.identifier === "specialist");
  if (!sClass) {
    if (actor.flags?.ak5e?.specialist?.enabled) {
      const lvl = Number(actor.system?.details?.level) || 1;
      const branchName = actor.flags.ak5e.specialist.branch || "inventor";
      return {
        applicable: true,
        configured: true,
        level: lvl,
        branch: branchName,
        branchId: Object.entries(SPECIALIST_BRANCH_IDS).find(([_, n]) => n === branchName)?.[0] ?? `subclass-specialist-${branchName}`,
        classItem: null,
        branchItem: null,
        blocked: []
      };
    }
    return empty;
  }
  if (classes.length > 1) return { ...empty, applicable: true, blocked: ["MultipleClasses"] };

  const rawLevel = Number(sClass.system?.levels);
  const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 20 ? rawLevel : null;
  if (level === null) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };

  const branches = items.filter(i => i.type === "subclass");
  const branchItem = branches[0] ?? null;
  let branch = null, branchId = null;
  if (branchItem) {
    branchId = flag(branchItem, "chapterThreeId") ?? null;
    branch = SPECIALIST_BRANCH_IDS[branchId] ?? null;
    if (!branch && (branchId === "subclass-specialist-infuser" || branchId === "subclass-specialist-infusion")) {
      branch = "infusion";
      branchId = "subclass-specialist-infuser";
    }
    const identifier = (branchItem.identifier || branchItem.system?.identifier || "").toLowerCase();
    if (!branch && (identifier === "infuser" || identifier === "infusion")) {
      branch = "infusion";
      branchId ??= "subclass-specialist-infuser";
    }
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Specialist:\s*/i, "").trim().toLowerCase();
      if (match === "infuser" || match === "infusion") {
        branch = "infusion";
        branchId ??= "subclass-specialist-infuser";
      } else {
        const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
        const standardMatch = Object.entries(SPECIALIST_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
        branch = standardMatch ? standardMatch[1] : null;
      }
    }
    if (!branch && identifier) {
      const standardMatch = Object.entries(SPECIALIST_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === identifier);
      branch = standardMatch ? standardMatch[1] : null;
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: sClass, branchItem, blocked: ["UnknownBranch"] };
  } else {
    const state = specialistState(actor);
    if (state.branch) {
      const raw = String(state.branch).toLowerCase();
      if (raw === "infuser" || raw === "infusion" || raw === "subclass-specialist-infuser" || raw === "subclass-specialist-infusion") {
        branch = "infusion";
        branchId = "subclass-specialist-infuser";
      } else {
        branch = SPECIALIST_BRANCH_IDS[state.branch] ?? Object.values(SPECIALIST_BRANCH_IDS).find(n => n.toLowerCase() === raw) ?? null;
        branchId = Object.entries(SPECIALIST_BRANCH_IDS).find(([_, n]) => n === branch)?.[0] ?? null;
      }
    }
  }

  const state = specialistState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: sClass,
    branchItem,
    weaponCategory: state.weaponCategory ?? null,
    fightingStyle: state.fightingStyle ?? null,
    blocked: []
  };
}

export function specialistEnabled(actor) {
  const profile = specialistProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function specialistLevel(actor) {
  return specialistProfile(actor).level;
}

export function specialistBranch(actor) {
  return specialistProfile(actor).branch;
}

export function isSpecialist(actor) {
  if (!actor) return false;
  if (specialistEnabled(actor)) return true;
  const items = list(actor.items);
  return items.some(i => i.type === "class" && (
    flag(i, "chapterThreeId") === SPECIALIST_CLASS_ID ||
    i.identifier === "specialist" ||
    i.system?.identifier === "specialist" ||
    i.name === "Specialist"
  ));
}

export function isExecutor(actor) {
  if (!isSpecialist(actor)) return false;
  if (specialistBranch(actor) === "executor") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-executor" ||
    i.identifier === "executor" ||
    i.system?.identifier === "executor" ||
    i.name?.toLowerCase().includes("executor")
  ));
}

export function isHookmaster(actor) {
  if (!isSpecialist(actor)) return false;
  if (specialistBranch(actor) === "hookmaster") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-hookmaster" ||
    i.identifier === "hookmaster" ||
    i.system?.identifier === "hookmaster" ||
    i.name?.toLowerCase().includes("hookmaster")
  ));
}

export function isInfuser(actor) {
  if (!isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === "infuser" || branch === "infusion") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-infuser" ||
    flag(i, "chapterThreeId") === "subclass-specialist-infusion" ||
    i.identifier === "infuser" ||
    i.identifier === "infusion" ||
    i.system?.identifier === "infuser" ||
    i.system?.identifier === "infusion" ||
    i.name?.toLowerCase().includes("infus")
  ));
}

export function isInventor(actor) {
  if (!isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === "inventor") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-inventor" ||
    i.identifier === "inventor" ||
    i.system?.identifier === "inventor" ||
    i.name?.toLowerCase().includes("inventor")
  ));
}

export function calculateInventorDC(actor) {
  const system = actor?.system ?? {};
  const intMod = Number(system.abilities?.int?.mod ?? 0);
  const pb = Number(system.attributes?.prof ?? pbForLevel(specialistLevel(actor) ?? 1));
  return Math.max(1, 8 + intMod + pb);
}

export function registerInventorPools() {
  registerProwessPool();
  if (!getPoolDefinition("inventions")) {
    definePool({
      id: "inventions",
      label: "Inventions",
      max: "@prof * 2",
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isInventor(actor),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
  if (!getPoolDefinition("theBigOne")) {
    definePool({
      id: "theBigOne",
      label: "The Big One",
      max: 1,
      initial: "max",
      classId: SPECIALIST_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => isInventor(actor) && (specialistLevel(actor) >= 20),
      recovery: [{ on: "lr", amount: "toMax" }]
    });
  }
}

export function isSkyranger(actor) {
  if (!isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === "skyranger") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-skyranger" ||
    i.identifier === "skyranger" ||
    i.system?.identifier === "skyranger" ||
    i.name?.toLowerCase().includes("skyranger")
  ));
}

export function isDollkeeper(actor) {
  if (!isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === "dollkeeper") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-dollkeeper" ||
    i.identifier === "dollkeeper" ||
    i.system?.identifier === "dollkeeper" ||
    i.name?.toLowerCase().includes("dollkeeper")
  ));
}

export function isTrapmaster(actor) {
  if (!isSpecialist(actor)) return false;
  const branch = specialistBranch(actor);
  if (branch === "trapmaster") return true;
  const items = list(actor.items);
  return items.some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === "subclass-specialist-trapmaster" ||
    i.identifier === "trapmaster" ||
    i.system?.identifier === "trapmaster" ||
    i.name?.toLowerCase().includes("trapmaster")
  ));
}

export { calculateTrapDC, defineSkyrangerPools, defineDollkeeperPools, defineTrapmasterPools };

export function registerSpecialistPools() {
  registerProwessPool();
  registerInventorPools();
  defineSkyrangerPools();
  defineDollkeeperPools();
  defineTrapmasterPools();
}

export const defineSpecialistPools = registerSpecialistPools;
export const defineInventorPools = registerInventorPools;

export function prowessEarlyUnlocked(actor) {
  return Boolean(flag(actor, "specialist")?.prowessEarlyUnlocked);
}

export function calculateSpecialistProfile(actor) {
  const profile = specialistProfile(actor);
  const level = profile.level ?? 1;
  const pb = pbForLevel(level);
  const system = actor?.system ?? {};
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  const strMod = Number(system.abilities?.str?.mod ?? 0);
  const intMod = Number(system.abilities?.int?.mod ?? 0);

  const features = [];
  for (let l = 1; l <= level; l++) {
    const step = SPECIALIST_LEVEL_STEPS[l];
    if (step?.features) features.push(...step.features);
  }

  const styles = profile.fightingStyle ? [profile.fightingStyle] : [];
  styles.category = profile.weaponCategory ?? null;
  styles.active = profile.fightingStyle ?? null;
  styles.list = styles;

  const resources = {
    prowess: {
      max: pb,
      recovery: "1 on Short or Long Rest"
    }
  };
  if (isInventor(actor)) {
    resources.inventions = {
      max: pb * 2,
      recovery: "Long Rest"
    };
  }
  if (isSkyranger(actor)) {
    resources.fuel = {
      max: calculateFuelMax(level),
      recovery: "Long Rest"
    };
  }
  if (isDollkeeper(actor) && level >= 11) {
    resources.mistakenIdentity = {
      max: pb,
      recovery: "Short or Long Rest"
    };
  }
  if (isTrapmaster(actor)) {
    resources.traps = {
      max: pb * 2,
      recovery: "Long Rest"
    };
    if (level >= 11) {
      resources.comeAndGetMe = {
        max: pb,
        recovery: "Short or Long Rest"
      };
    }
  }

  return {
    level,
    pb,
    hp: {
      hitDice: `${level}d8`,
      base: 8 + conMod,
      averagePerLevel: 5 + conMod,
      totalFixed: hitPointsAtLevel(level, conMod, { mode: "fixed" })
    },
    saves: {
      automatic: "dex",
      choiceOptions: ["wis", "cha"]
    },
    proficiencies: {
      armor: [...SPECIALIST_ARMOR_PROFS],
      weapons: [...SPECIALIST_WEAPON_PROFS],
      tools: [...SPECIALIST_TOOL_CHOICES],
      skills: SPECIALIST_SKILLS.map(([_, key]) => key)
    },
    resources,
    prowess: {
      max: pb,
      recovery: "1 on Short or Long Rest"
    },
    features,
    dc: {
      specialist: 8 + pb + dexMod,
      martial: 8 + pb + Math.max(strMod, dexMod),
      inventor: 8 + pb + intMod,
      trap: calculateTrapDC(actor)
    },
    weaponCategory: profile.weaponCategory,
    fightingStyle: profile.fightingStyle,
    styles,
    branch: profile.branch,
    branchId: profile.branchId,
    classItem: profile.classItem,
    branchItem: profile.branchItem
  };
}
