/** Medic class rules (Ch. 3 L4560–4870).
 * Pure and functional: Hit dice, HP formulas, level step tables, DCs,
 * saving throw options, weapon/armor/tool proficiencies, and profile checks.
 * Zero database writes and zero Foundry globals required at import time.
 */

export const MEDIC_CLASS_ID = "class-medic";

export const MEDIC_BRANCH_IDS = Object.freeze({
  "subclass-medic-physician": "physician",
  "subclass-medic-therapist": "therapist",
  "subclass-medic-triage": "triage",
  "subclass-medic-ward": "ward",
  "subclass-medic-witchcraft": "witchcraft"
});

export const IMPLEMENTED_MEDIC_BRANCHES = Object.freeze([
  "physician",
  "triage"
]);

export const MEDIC_SKILLS = Object.freeze([
  ["Medicine", "med"],
  ["Arts", "arc"],
  ["Lore", "ak5elore"],
  ["Tech", "ak5etech"],
  ["Insight", "ins"],
  ["Perception", "prc"],
  ["Persuasion", "per"]
]);

export const MEDIC_SKILL_CHOICES = Object.freeze([
  ["Arts", "arc"],
  ["Lore", "ak5elore"],
  ["Tech", "ak5etech"],
  ["Insight", "ins"],
  ["Perception", "prc"],
  ["Persuasion", "per"]
]);

export const MEDIC_SAVES = Object.freeze({
  choices: [
    ["Constitution", "con"],
    ["Intelligence", "int"],
    ["Wisdom", "wis"]
  ]
});

// Medics have NO light, medium, or heavy armor proficiencies. Armor proficiency is strictly Light Shields only (Ch. 3 L4588).
export const MEDIC_ARMOR_PROFS = Object.freeze(["shl"]);
export const MEDIC_WEAPON_PROFS = Object.freeze(["Light Melee"]);
export const MEDIC_TOOL_CHOICES = Object.freeze(["Tool Kit", "Vehicle"]);

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

export const LIFE_SUPPORT_STEPS = Object.freeze({
  1: 20, 2: 35, 3: 35, 4: 50, 5: 50, 6: 65, 7: 65, 8: 80, 9: 80, 10: 95,
  11: 95, 12: 110, 13: 110, 14: 125, 15: 125, 16: 140, 17: 140, 18: 155, 19: 155, 20: 170
});

export const ARTS_POINTS_TABLE = Object.freeze({
  1: 3, 2: 4, 3: 6, 4: 7, 5: 10, 6: 11, 7: 12, 8: 15, 9: 16, 10: 17,
  11: 20, 12: 21, 13: 22, 14: 25, 15: 26, 16: 27, 17: 30, 18: 31, 19: 32, 20: 35
});

export const MAX_ART_LEVEL_TABLE = Object.freeze({
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5,
  11: 6, 12: 6, 13: 7, 14: 7, 15: 8, 16: 8, 17: 9, 18: 9, 19: 9, 20: 9
});

export const MEDIC_LEVEL_STEPS = Object.freeze({
  1: { level: 1, pb: 2, maxArtLevel: 1, ap: 3, lifeSupport: 20, features: ["Elite 0- Arts Casting", "Life Support", "Medical Expertise", "Medic Branch"] },
  2: { level: 2, pb: 2, maxArtLevel: 1, ap: 4, lifeSupport: 35, features: ["Basic Operator Skill"] },
  3: { level: 3, pb: 2, maxArtLevel: 2, ap: 6, lifeSupport: 35, features: ["Basic Talent"] },
  4: { level: 4, pb: 2, maxArtLevel: 2, ap: 7, lifeSupport: 50, features: ["Ability Score Improvement", "Branch Feature"] },
  5: { level: 5, pb: 3, maxArtLevel: 3, ap: 10, lifeSupport: 50, features: ["Self-Defence Protocol"] },
  6: { level: 6, pb: 3, maxArtLevel: 3, ap: 11, lifeSupport: 65, features: ["Ability Score Improvement"] },
  7: { level: 7, pb: 3, maxArtLevel: 4, ap: 12, lifeSupport: 65, features: ["Elite 1- Branch Feature", "Advanced Operator Skill"] },
  8: { level: 8, pb: 3, maxArtLevel: 4, ap: 15, lifeSupport: 80, features: ["Ability Score Improvement", "Basic Talent Module"] },
  9: { level: 9, pb: 4, maxArtLevel: 5, ap: 16, lifeSupport: 80, features: ["Advanced Talent"] },
  10: { level: 10, pb: 4, maxArtLevel: 5, ap: 17, lifeSupport: 95, features: ["Ability Score Improvement"] },
  11: { level: 11, pb: 4, maxArtLevel: 6, ap: 20, lifeSupport: 95, features: ["Branch Feature"] },
  12: { level: 12, pb: 4, maxArtLevel: 6, ap: 21, lifeSupport: 110, features: ["Ability Score Improvement", "Resuscitation"] },
  13: { level: 13, pb: 5, maxArtLevel: 7, ap: 22, lifeSupport: 110, features: ["Advanced Talent Mastery"] },
  14: { level: 14, pb: 5, maxArtLevel: 7, ap: 25, lifeSupport: 125, features: ["Elite 2- Elite Operator Skill"] },
  15: { level: 15, pb: 5, maxArtLevel: 8, ap: 26, lifeSupport: 125, features: ["Branch Feature"] },
  16: { level: 16, pb: 5, maxArtLevel: 8, ap: 27, lifeSupport: 140, features: ["Ability Score Improvement"] },
  17: { level: 17, pb: 6, maxArtLevel: 9, ap: 30, lifeSupport: 140, features: ["9th Level Arts"] },
  18: { level: 18, pb: 6, maxArtLevel: 9, ap: 31, lifeSupport: 155, features: ["To Rob the Ferryman"] },
  19: { level: 19, pb: 6, maxArtLevel: 9, ap: 32, lifeSupport: 155, features: ["Ability Score Improvement"] },
  20: { level: 20, pb: 6, maxArtLevel: 9, ap: 35, lifeSupport: 170, features: ["Chosen of Asclepius"] }
});

export const STARTING_EQUIPMENT_OPTIONS = Object.freeze({
  choiceWeaponShield: {
    a: "1x Light Melee Weapon",
    b: "1x Light Shield"
  },
  choiceFocus: {
    a: "Arts Wand",
    b: "Arts Staff"
  },
  tools: "One Tool Kit you are Proficient with",
  cashOptionLMD: 1300
});

const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  operations: [],
  events: [],
  uses: {},
  rulings: {},
  spellcastingAbility: "wis"
});

export const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);

export function checkLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError("Medic level must be an integer from 1 to 20.");
  }
  return n;
}

export function pbForLevel(level) {
  const lvl = checkLevel(level);
  return Math.floor((lvl - 1) / 4) + 2;
}

/** Hit Points calculation (Ch. 3 L4583–4585):
 * Base HP at 1st level: 6 + CON modifier.
 * HP per level after 1st: 4 (fixed) or rolled 1d6 + CON modifier.
 * Always clamped at minimum 1 HP gain per level.
 */
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

/** Life Support maximum closed formula (Ch. 3 L4620–4648):
 * 20 + 15 * floor(Level / 2), scaling from 20 (Lv 1) to 170 (Lv 20).
 */
export function lifeSupportMax(level) {
  const lvl = checkLevel(level);
  return 20 + 15 * Math.floor(lvl / 2);
}

export function maxArtLevel(level) {
  const lvl = checkLevel(level);
  return MAX_ART_LEVEL_TABLE[lvl] ?? 1;
}

export function artsPointsForLevel(level) {
  const lvl = checkLevel(level);
  return ARTS_POINTS_TABLE[lvl] ?? 3;
}

/** Spellcasting Ability (Ch. 3 L4614): Intelligence or Wisdom. Defaults to Wisdom if unspecified. */
export function medicSpellcastingAbility(actor) {
  const stored = flag(actor, "medic")?.spellcastingAbility;
  if (stored === "int" || stored === "wis") return stored;
  const progressionChoice = flag(actor, "medicProgression")?.choices?.spellcastingAbility;
  if (progressionChoice === "int" || progressionChoice === "wis") return progressionChoice;
  const system = actor?.system ?? {};
  const intMod = Number(system.abilities?.int?.mod ?? 0);
  const wisMod = Number(system.abilities?.wis?.mod ?? 0);
  return intMod > wisMod ? "int" : "wis";
}

/** Spell Save DC: 8 + PB + Spellcasting Ability Modifier (INT or WIS). */
export function medicSpellDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const abl = medicSpellcastingAbility(actor);
  const mod = Number(system.abilities?.[abl]?.mod ?? 0);
  return 8 + pb + mod;
}

/** Spell Attack Modifier: PB + Spellcasting Ability Modifier (INT or WIS). */
export function medicSpellAttackMod(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const abl = medicSpellcastingAbility(actor);
  const mod = Number(system.abilities?.[abl]?.mod ?? 0);
  return pb + mod;
}

/** Martial DC (Ch. 1 L211): 8 + PB + higher of STR or DEX modifier. */
export function martialDC(actor) {
  const system = actor?.system ?? {};
  const pb = Number(system.attributes?.prof ?? 2);
  const strMod = Number(system.abilities?.str?.mod ?? 0);
  const dexMod = Number(system.abilities?.dex?.mod ?? 0);
  return 8 + pb + Math.max(strMod, dexMod);
}

export function medicState(actor) {
  const stored = flag(actor, "medic") ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    operations: [...(stored.operations ?? [])],
    events: [...(stored.events ?? [])],
    uses: { ...(stored.uses ?? {}) },
    rulings: { ...(stored.rulings ?? {}) }
  };
}

/** Pure inspection of Medic class and branch identity on an Actor. */
export function medicProfile(actor) {
  const empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, classItem: null, branchItem: null, blocked: [] };
  if (actor?.type !== "character" || actor.pack) return empty;
  const items = list(actor.items);
  const classes = items.filter(i => i.type === "class");
  const mClass = classes.find(i => flag(i, "chapterThreeId") === MEDIC_CLASS_ID || i.name === "Medic");
  if (!mClass) return empty;
  if (classes.length > 1) return { ...empty, applicable: true, blocked: ["MultipleClasses"] };

  const rawLevel = Number(mClass.system?.levels);
  const level = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= 20 ? rawLevel : null;
  if (level === null) return { ...empty, applicable: true, blocked: ["InvalidClassLevel"] };

  const branches = items.filter(i => i.type === "subclass");
  const branchItem = branches[0] ?? null;
  let branch = null, branchId = null;
  if (branchItem) {
    branchId = flag(branchItem, "chapterThreeId") ?? null;
    branch = MEDIC_BRANCH_IDS[branchId] ?? null;
    if (!branch && branchItem.name) {
      const match = branchItem.name.replace(/^Medic:\s*/i, "").trim().toLowerCase();
      const normalized = match.replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
      const standardMatch = Object.entries(MEDIC_BRANCH_IDS).find(([_, name]) => name.toLowerCase() === match || name.toLowerCase() === normalized);
      branch = standardMatch ? standardMatch[1] : null;
    }
    if (!branch) return { ...empty, applicable: true, level, classItem: mClass, branchItem, blocked: ["UnknownBranch"] };
  }

  const state = medicState(actor);
  return {
    applicable: true,
    configured: Boolean(state.enabled),
    level,
    branch,
    branchId,
    classItem: mClass,
    branchItem,
    blocked: []
  };
}

export function medicEnabled(actor) {
  const profile = medicProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}

export function medicLevel(actor) {
  return medicProfile(actor).level;
}

export function medicBranch(actor) {
  return medicProfile(actor).branch;
}

export function isMedic(actor) {
  return Boolean(medicEnabled(actor));
}

export function isPhysician(actor) {
  return Boolean(medicEnabled(actor) && medicBranch(actor) === "physician");
}

export function isTriage(actor) {
  return Boolean(medicEnabled(actor) && medicBranch(actor) === "triage");
}

/** Pure profile calculation returning complete profile object adhering to PROJECT.md interface contract. */
export function calculateMedicProfile(actor) {
  const profile = medicProfile(actor);
  const level = profile.level ?? 1;
  const pb = pbForLevel(level);
  const system = actor?.system ?? {};
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  const spellAbility = medicSpellcastingAbility(actor);
  const spellMod = Number(system.abilities?.[spellAbility]?.mod ?? 0);

  const features = [];
  for (let l = 1; l <= level; l++) {
    const step = MEDIC_LEVEL_STEPS[l];
    if (step?.features) features.push(...step.features);
  }

  return {
    level,
    pb,
    spellcastingAbility: spellAbility,
    hp: {
      hitDice: `${level}d6`,
      base: 6 + conMod,
      averagePerLevel: 4 + conMod,
      totalFixed: hitPointsAtLevel(level, conMod, { mode: "fixed" })
    },
    saves: {
      choiceOptions: ["con", "int", "wis"]
    },
    proficiencies: {
      armor: [...MEDIC_ARMOR_PROFS],
      weapons: [...MEDIC_WEAPON_PROFS],
      tools: [...MEDIC_TOOL_CHOICES],
      skills: ["med", ...MEDIC_SKILL_CHOICES.map(([_, key]) => key)]
    },
    resources: {
      lifeSupport: {
        max: lifeSupportMax(level),
        overMax: true,
        recovery: "toMax"
      },
      artsPoints: {
        max: artsPointsForLevel(level),
        maxArtLevel: maxArtLevel(level),
        recovery: "max"
      }
    },
    features,
    dc: {
      spell: 8 + pb + spellMod,
      martial: martialDC(actor)
    },
    branch: profile.branch,
    branchId: profile.branchId,
    classItem: profile.classItem,
    branchItem: profile.branchItem
  };
}
