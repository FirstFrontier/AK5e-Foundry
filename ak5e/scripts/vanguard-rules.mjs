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

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError("Vanguard level must be an integer from 1 to 20.");
  }
  return n;
}

export function pbForLevel(level) {
  const lvl = checkLevel(level);
  return Math.floor((lvl - 1) / 4) + 2;
}

/** Hit Points calculation (Ch. 3 L7918–7920):
 * Base HP at 1st level: 8 + CON modifier.
 * HP per level after 1st: 5 (fixed) or rolled 1d8 + CON modifier.
 */
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
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const str = Number(system.abilities?.str?.mod ?? 0);
  const dex = Number(system.abilities?.dex?.mod ?? 0);
  if (ability !== "str" && ability !== "dex") return null;
  return 8 + pb + Number(system.abilities?.[ability]?.mod ?? (ability === "str" ? str : dex));
}

/** Vanguard DC (standard DC using Dexterity or Martial DC): 8 + PB + DEX modifier. */
export function vanguardDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const dex = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + dex;
}

export function vanguardState(actor) {
  const stored = flag(actor, "vanguard") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
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
  const rawLevel = Number(vClass.system?.levels);
  const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 20 ? rawLevel : null;
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
    branchId = flag(branchItem, "chapterThreeId") ?? null;
    branch = VANGUARD_BRANCH_IDS[branchId] ?? null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Vanguard:\s*/i, "").trim().toLowerCase();
      const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
      const standardMatch = Object.entries(VANGUARD_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
      branch = standardMatch ? standardMatch[1] : null;
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
  const pb = Number(actor?.system?.attributes?.prof ?? pbForLevel(level));
  const system = actor?.system ?? {};
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  const strMod = Number(system.abilities?.str?.mod ?? 0);

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
