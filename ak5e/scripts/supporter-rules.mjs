/** Supporter class rules (Ch. 3 L6548–6692).
 * Pure and functional: Hit dice, HP formulas, level step tables, DCs,
 * saving throw options, weapon/armor/tool proficiencies, and profile checks.
 * Zero database writes and zero Foundry globals required at import time.
 */

export const SUPPORTER_CLASS_ID = "class-supporter";

export const SUPPORTER_BRANCH_IDS = Object.freeze({
  "subclass-supporter-artificer": "artificer",
  "subclass-supporter-bard": "bard",
  "subclass-supporter-hexer": "hexer",
  "subclass-supporter-ritualist": "ritualist",
  "subclass-supporter-summoner": "summoner"
});

export const IMPLEMENTED_SUPPORTER_BRANCHES = Object.freeze([
  "artificer",
  "bard",
  "hexer",
  "ritualist",
  "summoner"
]);

export const SUPPORTER_SKILLS = Object.freeze([
  ["Arts", "arc"],
  ["Lore", "ak5elore"],
  ["Tech", "ak5etech"],
  ["Insight", "ins"],
  ["Deception", "dec"],
  ["Persuasion", "per"]
]);

export const SUPPORTER_SAVES = Object.freeze({
  choices: [
    ["Constitution", "con"],
    ["Charisma", "cha"],
    ["Wisdom", "wis"]
  ]
});

export const SUPPORTER_ARMOR_PROFS = Object.freeze(["lgt", "shl"]);
export const SUPPORTER_WEAPON_PROFS = Object.freeze(["Light Melee"]);
export const SUPPORTER_TOOL_CHOICES = Object.freeze(["Tool Kit", "Vehicle"]);

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

export const SUPPORTER_LEVEL_STEPS = Object.freeze({
  1: { level: 1, pb: 2, aidDie: "d8", features: ["Elite 0- Supporter Branch", "Provide Aid"] },
  2: { level: 2, pb: 2, aidDie: "d8", features: ["Basic Skill"] },
  3: { level: 3, pb: 2, aidDie: "d8", features: ["Basic Talent"] },
  4: { level: 4, pb: 2, aidDie: "d8", features: ["Ability Score Improvement", "Branch Feature"] },
  5: { level: 5, pb: 3, aidDie: "d8", features: ["Advanced Aid"] },
  6: { level: 6, pb: 3, aidDie: "d8", features: ["Ability Score Improvement"] },
  7: { level: 7, pb: 3, aidDie: "d10", features: ["Elite 1- Advanced Skill"] },
  8: { level: 8, pb: 3, aidDie: "d10", features: ["Ability Score Improvement", "Basic Talent Module"] },
  9: { level: 9, pb: 4, aidDie: "d10", features: ["Advanced Talent"] },
  10: { level: 10, pb: 4, aidDie: "d10", features: ["Ability Score Improvement", "Branch Feature"] },
  11: { level: 11, pb: 4, aidDie: "d10", features: ["Lighten the Load"] },
  12: { level: 12, pb: 4, aidDie: "d10", features: ["Ability Score Improvement"] },
  13: { level: 13, pb: 5, aidDie: "d10", features: ["Branch Feature", "Advanced Talent Module"] },
  14: { level: 14, pb: 5, aidDie: "d12", features: ["Elite 2- Elite Skill"] },
  15: { level: 15, pb: 5, aidDie: "d12", features: ["Ever Reliable"] },
  16: { level: 16, pb: 5, aidDie: "d12", features: ["Ability Score Improvement"] },
  17: { level: 17, pb: 6, aidDie: "d12", features: ["Branch Feature"] },
  18: { level: 18, pb: 6, aidDie: "d12", features: ["Self-Supportive"] },
  19: { level: 19, pb: 6, aidDie: "d12", features: ["Ability Score Improvement"] },
  20: { level: 20, pb: 6, aidDie: "d12", features: ["Will Into Being"] }
});

export const STARTING_EQUIPMENT_OPTIONS = Object.freeze({
  fixedWeapon: "1x Light Melee Weapon",
  choiceWeaponShield: {
    a: "1x Light Melee Weapon",
    b: "1x Light Shield"
  },
  outfit: "Protective Clothing",
  tools: "Two Tool Kits you are Proficient with",
  cashOptionLMD: 1300
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  operations: [],
  events: [],
  uses: {},
  rulings: {},
  aidAbility: "cha"
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError("Supporter level must be an integer from 1 to 20.");
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
  let total = Math.max(1, 6 + con);
  for (let i = 2; i <= lvl; i++) {
    const rollIndex = i - 2;
    const gained = (mode === "rolled" && Number.isInteger(rolls[rollIndex])) ? rolls[rollIndex] : 4;
    total += Math.max(1, gained + con);
  }
  return Math.max(1, total);
}

export function aidDieSize(level) {
  const lvl = checkLevel(level);
  if (lvl >= 14) return "d12";
  if (lvl >= 7) return "d10";
  return "d8";
}

export function martialDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const strMod = Number(system.abilities?.str?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + Math.max(strMod, dexMod);
}

/** Artificer DC (Ch. 3 L6958): 8 + Intelligence modifier + Proficiency Bonus; usable in place of the Martial DC. */
export function artificerDC(actor) {
  const system = actor?.system ?? {};
  return 8 + Number(system.attributes?.prof ?? 2) + Number(system.abilities?.int?.mod ?? 0);
}

/** Tie order for the highest-modifier fallback: cha, then wis, then int. */
const AID_ABILITY_TIE_ORDER = Object.freeze(["cha", "wis", "int"]);

/** The highest of the INT/WIS/CHA modifiers; ties resolve cha, then wis, then int. */
export function highestAidAbility(actor) {
  const abilities = actor?.system?.abilities ?? {};
  let best = null;
  for (const key of AID_ABILITY_TIE_ORDER) {
    const mod = Number(abilities[key]?.mod ?? 0) || 0;
    if (best === null || mod > best.mod) best = { key, mod };
  }
  return best.key;
}

/**
 * The Aid Ability: the stored "int", "wis" or "cha" choice. When none is stored, the highest of the
 * INT/WIS/CHA modifiers is used (F-R5); the sheet tells the owner to choose.
 */
export function aidAbilityKey(actor) {
  const key = flag(actor, "supporter")?.aidAbility;
  return key === "int" || key === "wis" || key === "cha" ? key : highestAidAbility(actor);
}

/** True when the owner has stored an explicit Aid Ability choice. */
export function hasAidAbilityChoice(actor) {
  const key = flag(actor, "supporter")?.aidAbility;
  return key === "int" || key === "wis" || key === "cha";
}

/** Aid Die maximum (C3:6637): the chosen ability modifier, never below 0 (R1). Warn at 0; the GM resolves. */
export function aidDieMax(actor) {
  const mod = Number(actor?.system?.abilities?.[aidAbilityKey(actor)]?.mod ?? 0);
  return Number.isFinite(mod) ? Math.max(0, Math.trunc(mod)) : 0;
}

const BRANCH_SUBCLASS_IDS = Object.freeze({
  artificer: "subclass-supporter-artificer",
  bard: "subclass-supporter-bard",
  hexer: "subclass-supporter-hexer"
});

/** Mirrors isTrapmaster(): the stored branch flag first, then the subclass item (ID, identifier, name). */
function hasBranch(actor, key) {
  if (flag(actor, "supporter")?.branch === key) return true;
  return list(actor?.items).some(i => i.type === "subclass" && (
    flag(i, "chapterThreeId") === BRANCH_SUBCLASS_IDS[key] ||
    i.identifier === key ||
    i.system?.identifier === key ||
    i.name?.toLowerCase().includes(key)
  ));
}
export const isArtificer = actor => hasBranch(actor, "artificer");
export const isBard = actor => hasBranch(actor, "bard");
export const isHexer = actor => hasBranch(actor, "hexer");

export function supporterState(actor) {
  const stored = flag(actor, "supporter") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
  };
}

export function supporterProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const sClass = classes.find(i => flag(i, "chapterThreeId") === SUPPORTER_CLASS_ID || i.name === "Supporter");
  if (!sClass) return empty;
  if (classes.length > 1) return { ...empty, applicable: true, blocked: ["MultipleClasses"] };

  const rawLevel = Number(sClass.system?.levels);
  const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 20 ? rawLevel : null;
  if (level === null) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };

  const branches = items.filter(i => i.type === "subclass");
  const branchItem = branches[0] ?? null;
  let branch = null, branchId = null;
  if (branchItem) {
    branchId = flag(branchItem, "chapterThreeId") ?? null;
    branch = SUPPORTER_BRANCH_IDS[branchId] ?? null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Supporter:\s*/i, "").trim().toLowerCase();
      const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
      const standardMatch = Object.entries(SUPPORTER_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
      branch = standardMatch ? standardMatch[1] : null;
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: sClass, branchItem, blocked: ["UnknownBranch"] };
  }

  const state = supporterState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: sClass,
    branchItem,
    blocked: []
  };
}

export function supporterEnabled(actor) {
  const profile = supporterProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function supporterLevel(actor) {
  return supporterProfile(actor).level;
}

export function supporterBranch(actor) {
  return supporterProfile(actor).branch;
}

/** Pure profile calculation returning complete profile object adhering to PROJECT.md interface contract. */
export function calculateSupporterProfile(actor) {
  const profile = supporterProfile(actor);
  const level = profile.level ?? 1;
  const pb = pbForLevel(level);
  const system = actor?.system ?? {};
  const conMod = Number(system.abilities?.con?.mod ?? 0);

  const features = [];
  for (let l = 1; l <= level; l++) {
    const step = SUPPORTER_LEVEL_STEPS[l];
    if (step?.features) features.push(...step.features);
  }

  return {
    level,
    pb,
    hp: {
      hitDice: `${level}d6`,
      base: 6 + conMod,
      averagePerLevel: 4 + conMod,
      totalFixed: hitPointsAtLevel(level, conMod, { mode: "fixed" })
    },
    saves: {
      choiceOptions: ["con", "cha", "wis"]
    },
    proficiencies: {
      armor: [...SUPPORTER_ARMOR_PROFS],
      weapons: [...SUPPORTER_WEAPON_PROFS],
      tools: [...SUPPORTER_TOOL_CHOICES],
      skills: SUPPORTER_SKILLS.map(([_, key]) => key)
    },
    resources: {
      aidDie: {
        size: aidDieSize(level),
        maxFormula: `max(0, @abilities.${aidAbilityKey(actor)}.mod)`,
        max: aidDieMax(actor),
        warnings: aidDieMax(actor) === 0 ? ["0 Aid Dice — GM resolves"] : []
      }
    },
    features,
    dc: {
      martial: martialDC(actor)
    },
    branch: profile.branch,
    branchId: profile.branchId,
    classItem: profile.classItem,
    branchItem: profile.branchItem
  };
}
