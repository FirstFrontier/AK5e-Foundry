/** Vanguard class rules (Ch. 3 L7904–8085).
 * Pure and functional: Hit dice, HP formulas, level step tables, DCs,
 * saving throw options, weapon/armor/tool proficiencies, and profile checks.
 * Zero database writes and zero Foundry globals required at import time.
 */

export const VANGUARD_CLASS_ID = "class-vanguard";

export const VANGUARD_BRANCH_IDS = Object.freeze({
  "subclass-vanguard-agent": "agent",
  "subclass-vanguard-charger": "charger",
  "subclass-vanguard-pioneer": "pioneer",
  "subclass-vanguard-standard-bearer": "standardBearer",
  "subclass-vanguard-tactician": "tactician"
});

export const IMPLEMENTED_VANGUARD_BRANCHES = Object.freeze([
  "agent",
  "charger",
  "pioneer",
  "standardBearer",
  "tactician"
]);

export const VANGUARD_SKILLS = Object.freeze([
  ["Acrobatics", "acr"],
  ["Athletics", "ath"],
  ["Perception", "prc"],
  ["Persuasion", "per"],
  ["Stealth", "ste"],
  ["Wilderness", "ak5ewilderness"]
]);

export const VANGUARD_SAVES = Object.freeze({
  automatic: "dex",
  choices: [
    ["Strength", "str"],
    ["Charisma", "cha"]
  ]
});

export const VANGUARD_ARMOR_PROFS = Object.freeze(["lgt", "shl"]);
export const VANGUARD_WEAPON_PROFS = Object.freeze(["Light Melee"]);
export const VANGUARD_TOOL_PROFS = Object.freeze(["Messenger Kit"]);

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

export const VANGUARD_LEVEL_STEPS = Object.freeze({
  1: { level: 1, pb: 2, features: ["Elite 0- Vanguard Branch", "Landstrider", "Tip of the Spear"] },
  2: { level: 2, pb: 2, features: ["Basic Skill"] },
  3: { level: 3, pb: 2, features: ["Basic Talent", "Quick off the Mark"] },
  4: { level: 4, pb: 2, features: ["Ability Score Improvement", "Branch Feature"] },
  5: { level: 5, pb: 3, features: ["Extra Attack"] },
  6: { level: 6, pb: 3, features: ["Ability Score Improvement"] },
  7: { level: 7, pb: 3, features: ["Elite 1- Advanced Skill"] },
  8: { level: 8, pb: 3, features: ["Ability Score Improvement", "Basic Talent Module"] },
  9: { level: 9, pb: 4, features: ["Advanced Talent"] },
  10: { level: 10, pb: 4, features: ["Ability Score Improvement", "Branch Feature"] },
  11: { level: 11, pb: 4, features: ["Uncanny Dodge"] },
  12: { level: 12, pb: 4, features: ["Ability Score Improvement"] },
  13: { level: 13, pb: 5, features: ["Advanced Talent Module", "Branch Feature"] },
  14: { level: 14, pb: 5, features: ["Elite 2- Elite Skill"] },
  15: { level: 15, pb: 5, features: ["Directed Engagement"] },
  16: { level: 16, pb: 5, features: ["Ability Score Improvement"] },
  17: { level: 17, pb: 6, features: ["Branch Feature"] },
  18: { level: 18, pb: 6, features: ["Lightspeed"] },
  19: { level: 19, pb: 6, features: ["Ability Score Improvement"] },
  20: { level: 20, pb: 6, features: ["Approaching Storm"] }
});

export const STARTING_EQUIPMENT_OPTIONS = Object.freeze({
  fixedWeapon: "1x Light Melee Weapon",
  choiceWeaponShield: {
    a: "1x Light Melee Weapon",
    b: "1x Light Shield"
  },
  choiceOutfit: {
    a: "Reinforced Outfit",
    b: "Light Combat Gear"
  },
  toolKit: "Messenger Kit (or Tool Kit proficient with)",
  cashOptionLMD: 1300
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  operations: [],
  events: [],
  uses: {},
  rulings: {}
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key)
  ?? String(key).split(".").reduce((value, part) => value?.[part], document?.flags?.ak5e);
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

/** Parse a stored class level without coercing booleans, arrays or objects. */
function levelValue(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean" ||
      Array.isArray(value) || typeof value === "object") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

export function checkLevel(level) {
  const n = levelValue(level);
  if (n === null) {
    throw new RangeError("Vanguard level must be an integer from 1 to 20.");
  }
  return n;
}

export function pbForLevel(level) {
  const lvl = checkLevel(level);
  return Math.floor((lvl - 1) / 4) + 2;
}

function finiteNumber(value, label) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") {
    throw new RangeError(`${label} must be a finite number.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be a finite number.`);
  return n;
}

function wholeNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  const n = finiteNumber(value, label);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new RangeError(`${label} must be an integer${Number.isFinite(min) ? ` from ${min}` : ""}${Number.isFinite(max) ? ` to ${max}` : ""}.`);
  }
  return n;
}

/** Shared D&D5e Proficiency Bonus kept on the Actor; falls back to the Vanguard
 * level's PB only when the Actor record has no value at all. */
function sharedProficiencyBonus(actor) {
  const raw = actor?.system?.attributes?.prof;
  if (raw === undefined) return pbForLevel(vanguardLevel(actor) ?? 1);
  return wholeNumber(raw, "Proficiency Bonus", { min: 0 });
}

/** Hit Points calculation (Ch. 3 L7918–7920):
 * Base HP at 1st level: 8 + CON modifier.
 * HP per level after 1st: 5 (fixed) or rolled 1d8 + CON modifier.
 */
export function hitPointsAtLevel(level, conMod = 0, { mode = "fixed", rolls = [] } = {}) {
  const lvl = checkLevel(level);
  const con = wholeNumber(conMod, "Constitution modifier");
  if (mode !== "fixed" && mode !== "rolled") {
    throw new RangeError(`Unknown Hit Point mode: ${String(mode)}.`);
  }
  if (mode === "rolled") {
    if (!Array.isArray(rolls)) throw new RangeError("Rolled Hit Points require an array of recorded d8 results.");
    if (rolls.length < lvl - 1) {
      throw new RangeError(`Rolled Hit Points require ${lvl - 1} recorded d8 result(s) for Vanguard level ${lvl}.`);
    }
    for (let index = 0; index < lvl - 1; index++) {
      const roll = rolls[index];
      if (typeof roll !== "number" || !Number.isInteger(roll) || roll < 1 || roll > 8) {
        throw new RangeError(`Hit Point roll ${index + 1} must be a recorded d8 result from 1 to 8.`);
      }
    }
  }
  let total = Math.max(1, 8 + con);
  for (let i = 2; i <= lvl; i++) {
    const gained = mode === "rolled" ? rolls[i - 2] : 5;
    total += Math.max(1, gained + con);
  }
  return Math.max(1, total);
}

/** Approaching Storm damage bonus (Ch. 3 L8057): half Vanguard level (floor(Level / 2)). */
export function approachingStormBonus(level) {
  return Math.floor(checkLevel(level) / 2);
}

/** Landstrider bonus walking speed (Ch. 3 L7990): 10 feet. */
export function landstriderSpeedBonus() {
  return 10;
}

/** Martial DC (Ch. 1 L211): 8 + shared PB + the character's chosen STR or DEX modifier. */
export function martialDC(actor, ability = flag(actor, "vanguard")?.martialDCAbility) {
  if (ability !== "str" && ability !== "dex") return null;
  const system = actor?.system ?? {};
  const pb = sharedProficiencyBonus(actor);
  const modifier = wholeNumber(system.abilities?.[ability]?.mod,
    `${ability === "str" ? "Strength" : "Dexterity"} modifier`);
  return 8 + pb + modifier;
}

/** Vanguard DC (standard DC using Dexterity or Martial DC): 8 + PB + DEX modifier. */
export function vanguardDC(actor) {
  const system = actor?.system ?? {};
  const pb = sharedProficiencyBonus(actor);
  const dex = wholeNumber(system.abilities?.dex?.mod, "Dexterity modifier");
  return 8 + pb + dex;
}

export function vanguardState(actor) {
  const raw = flag(actor, "vanguard");
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: Array.isArray(stored.operations) ? [...stored.operations] : [],
    events: Array.isArray(stored.events) ? [...stored.events] : [],
    uses: stored.uses && typeof stored.uses === "object" && !Array.isArray(stored.uses) ? { ...stored.uses } : {},
    rulings: stored.rulings && typeof stored.rulings === "object" && !Array.isArray(stored.rulings) ? { ...stored.rulings } : {}
  };
}

/** Pure inspection of Vanguard class and branch identity on an Actor. */
export function vanguardProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const vClass = classes.find(i => flag(i, "chapterThreeId") === VANGUARD_CLASS_ID || i.name === "Vanguard");
  if (!vClass) return empty;
  // A Vanguard may multiclass. Vanguard feature gates always use Vanguard
  // class levels, while the Actor keeps its shared D&D5e proficiency bonus.
  const level = levelValue(vClass.system?.levels);
  if (level === null) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };

  const identifier = vClass.system?.identifier ?? vClass.system?.classIdentifier ?? "vanguard";
  const branches = items.filter(i => i.type === "subclass" && (
    i.system?.classIdentifier === identifier || flag(i, "parentClass") === "Vanguard" || flag(i, "classIdentifier") === identifier
  ));
  const uniqueBranchIds = new Set(branches.map(item => flag(item, "chapterThreeId") ?? item.system?.identifier).filter(Boolean));
  if (uniqueBranchIds.size > 1) return { ...empty, applicable: true, level, classItem: vClass, blocked: ["ConflictingVanguardBranches"] };
  const branchItem = branches[0] ?? null;
  let branch = null, branchId = null;
  if (branchItem) {
    const storedBranchId = flag(branchItem, "chapterThreeId") ?? null;
    if (storedBranchId !== null && (typeof storedBranchId !== "string" || !storedBranchId.trim())) {
      return { ...empty, applicable: true, level, classItem: vClass, branchItem, blocked: ["UnknownBranch"] };
    }
    branchId = storedBranchId;
    // Object.hasOwn prevents inherited keys ("constructor", "__proto__", ...)
    // from ever resolving as a branch function/object.
    branch = typeof branchId === "string" && Object.hasOwn(VANGUARD_BRANCH_IDS, branchId)
      ? VANGUARD_BRANCH_IDS[branchId]
      : null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Vanguard:\s*/i, "").trim().toLowerCase();
      const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
      const standardMatch = Object.entries(VANGUARD_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
      if (standardMatch) {
        branchId = standardMatch[0];
        branch = standardMatch[1];
      }
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: vClass, branchItem, blocked: ["UnknownBranch"] };
  }

  const state = vanguardState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: vClass,
    branchItem,
    blocked: []
  };
}

export function vanguardEnabled(actor) {
  const profile = vanguardProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function vanguardLevel(actor) {
  return vanguardProfile(actor).level;
}

export function vanguardBranch(actor) {
  return vanguardProfile(actor).branch;
}

/** Pure profile calculation returning complete profile object adhering to PROJECT.md interface contract. */
export function calculateVanguardProfile(actor) {
  const profile = vanguardProfile(actor);
  const level = profile.level ?? 1;
  const pb = sharedProficiencyBonus(actor);
  const system = actor?.system ?? {};
  const conMod = wholeNumber(system.abilities?.con?.mod ?? 0, "Constitution modifier");
  const dexMod = wholeNumber(system.abilities?.dex?.mod ?? 0, "Dexterity modifier");
  const strMod = wholeNumber(system.abilities?.str?.mod ?? 0, "Strength modifier");
  // strMod is part of the public profile's ability contract even though the
  // current DCs use DEX; validate it so malformed actors cannot leak Infinity.
  void strMod;

  const features = [];
  for (let l = 1; l <= level; l++) {
    const step = VANGUARD_LEVEL_STEPS[l];
    if (step?.features) features.push(...step.features);
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
      choiceOptions: ["str", "cha"]
    },
    proficiencies: {
      armor: [...VANGUARD_ARMOR_PROFS],
      weapons: [...VANGUARD_WEAPON_PROFS],
      tools: [...VANGUARD_TOOL_PROFS],
      skills: VANGUARD_SKILLS.map(([_, key]) => key)
    },
    resources: {},
    features,
    dc: {
      vanguard: 8 + pb + dexMod,
      martial: martialDC(actor)
    },
    branch: profile.branch,
    branchId: profile.branchId,
    classItem: profile.classItem,
    branchItem: profile.branchItem
  };
}
