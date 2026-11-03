/** Native, previewed Specialist character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in vanguard/supporter progression.
 * Pure and previewed: inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  SPECIALIST_CLASS_ID, SPECIALIST_BRANCH_IDS, SPECIALIST_SKILLS, SPECIALIST_SAVES,
  SPECIALIST_ARMOR_PROFS, SPECIALIST_WEAPON_PROFS, SPECIALIST_TOOL_CHOICES,
  ASI_LEVELS, WEAPON_SPECIALISATION_CATEGORIES, MELEE_FIGHTING_STYLES, RANGED_FIGHTING_STYLES,
  checkLevel, specialistProfile, specialistState, isInventor,
  isSkyranger, isDollkeeper, isTrapmaster
} from "./specialist-rules.mjs";
import { createFlightSuitItem, isFlightSuit } from "./skyranger-features.mjs";
import { need } from "./operation-kernel.mjs";

export const SPECIALIST_PROGRESS_FLAG = "specialistProgression";
export const SPECIALIST_TALENT_FLAG = "specialistTalent";

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry =>
  entry.kind === "class-option" && entry.parentClass === "Specialist" && entry.classOption?.category === "talent"
);
const EQUIPMENT = CHAPTER_FOUR_EQUIPMENT;

const DEFAULT_STATE = Object.freeze({
  version: 1,
  choices: {},
  hpLevels: [],
  asiLevels: [],
  startingEquipmentGranted: false,
  operations: [],
  receipts: {},
  plans: {}
});

const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};

function readState(actor) {
  const stored = flag(actor, SPECIALIST_PROGRESS_FLAG) ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    choices: structuredClone(stored.choices ?? {}),
    hpLevels: [...(stored.hpLevels ?? [])],
    asiLevels: [...(stored.asiLevels ?? [])],
    startingEquipmentGranted: Boolean(stored.startingEquipmentGranted),
    operations: [...(stored.operations ?? [])],
    receipts: { ...(stored.receipts ?? {}) },
    plans: { ...(stored.plans ?? {}) }
  };
}

function classItems(actor) {
  return entries(actor?.items).filter(item => item.type === "class");
}

function specialistClass(actor) {
  return classItems(actor).find(item => flag(item, "chapterThreeId") === SPECIALIST_CLASS_ID || item.name === "Specialist") ?? null;
}

function branchItem(actor) {
  return entries(actor?.items).find(item => item.type === "subclass") ?? null;
}

function levelOf(item) {
  const level = Number(item?.system?.levels);
  return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null;
}

function sourceId(item) {
  return flag(item, "chapterThreeId") ?? flag(item, "chapterFourId");
}

function worldItem(sourceIdValue) {
  return entries(globalThis.game?.items).find(item => sourceId(item) === sourceIdValue) ?? null;
}

function toSource(item) {
  const data = item?.toObject ? item.toObject() : structuredClone(item ?? {});
  delete data._id;
  delete data.id;
  delete data.folder;
  delete data.sort;
  return data;
}

function actorItemData(source, entry, kind = "feature") {
  const data = toSource(source);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  if (entry) {
    data.flags.ak5e = {
      ...data.flags.ak5e,
      chapterThreeId: entry.id,
      classContentKind: entry.kind,
      parentClass: entry.parentClass,
      parentBranch: entry.parentBranch,
      classLevel: entry.level,
      sourceHeading: entry.sourceHeading,
      sourceFile: entry.sourceFile ?? "03_chapter_3_character_classes.txt",
      sourceLine: entry.sourceLine ?? null
    };
  }
  data.flags.ak5e.specialistProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.specialistProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.specialistProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.specialistProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });

export function specialistChoices(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : [saves];
  result.weaponCategory = supplied.weaponCategory ?? saved.weaponCategory ?? null;
  result.fightingStyle = supplied.fightingStyle ?? saved.fightingStyle ?? null;
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  if (state.startingEquipmentGranted && !supplied.startingEquipment?.mode) {
    result.startingEquipment.mode = "existing";
  }
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.branch = supplied.branch ?? saved.branch ?? null;
  result.airDoctrine = supplied.airDoctrine ?? saved.airDoctrine ?? null;
  result.tools = [...(Array.isArray(supplied.tools) ? supplied.tools : saved.tools ?? [])];

  const level = levelOf(specialistClass(actor));
  if (level) {
    result.asi ??= {};
    result.hp ??= {};
    for (const n of ASI_LEVELS.filter(v => v <= level)) {
      if (state.asiLevels?.includes(n) && !supplied.asi?.[n]) {
        result.asi[n] = { mode: "existing" };
      } else {
        result.asi[n] ??= { mode: "existing" };
      }
    }
    for (let n = 1; n <= level; n++) {
      if (state.hpLevels?.includes(n) && !supplied.hp?.[n]) {
        result.hp[n] = { mode: "existing" };
      } else {
        result.hp[n] ??= { mode: "existing" };
      }
    }
  }
  return result;
}

function asiOptions(actor) {
  const abilities = ["str", "dex", "con", "int", "wis", "cha"], result = [];
  for (const ability of abilities) {
    if (currentAbility(actor, ability) + 2 <= 20) {
      result.push(option({ increases: [{ ability, amount: 2 }] }, `+2 ${ability.toUpperCase()}`));
    }
  }
  for (let i = 0; i < abilities.length; i++) {
    for (let j = i + 1; j < abilities.length; j++) {
      const [a, b] = [abilities[i], abilities[j]];
      if (currentAbility(actor, a) < 20 && currentAbility(actor, b) < 20) {
        result.push(option({ increases: [{ ability: a, amount: 1 }, { ability: b, amount: 1 }] }, `+1 ${a.toUpperCase()} and +1 ${b.toUpperCase()}`));
      }
    }
  }
  return result;
}

function hpOptions(level) {
  if (level === 1) {
    return [
      option({ mode: "existing" }, "Already included in current Hit Point maximum"),
      option({ mode: "fixed", roll: 8 }, "Fixed 8 at 1st level")
    ];
  }
  const fixedRoll = 5;
  const rolledOptions = Array.from({ length: 8 }, (_, i) => {
    const roll = i + 1;
    return option({ mode: "rolled", roll }, `Rolled d8: ${roll}`);
  });
  return [
    option({ mode: "existing" }, "Already included in current Hit Point maximum"),
    option({ mode: "fixed", roll: fixedRoll }, `Fixed average (${fixedRoll})`),
    ...rolledOptions
  ];
}

function talentOptions(tier) {
  return TALENTS.filter(entry => entry.classOption.tier.toLowerCase() === tier.toLowerCase())
    .map(entry => option(entry.id, entry.name, {
      sourceId: entry.id,
      effect: entry.classOption.effect,
      moduleEffect: entry.classOption.moduleEffect
    }));
}

function equipmentOptions(predicate) {
  return EQUIPMENT.filter(predicate).map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
}

export const INVENTOR_PROGRESSION_FEATURES = Object.freeze({
  1: [
    { id: "subclass-feature-specialist-inventor-1st-level-equipment-modification-423", name: "1st Level: Equipment Modification", level: 1 }
  ],
  3: [
    { id: "subclass-feature-specialist-inventor-1st-level-equipment-modification-423", name: "Equipment Modification", level: 3 }
  ],
  5: [
    { id: "subclass-feature-specialist-inventor-5th-level-strange-contraption-2229", name: "5th Level: Strange Contraption", level: 5 },
    { id: "subclass-feature-specialist-inventor-5th-level-mobile-modding-5570", name: "5th Level: Mobile Modding", level: 5 }
  ],
  11: [
    { id: "subclass-feature-specialist-inventor-11th-level-risk-assessment-6113", name: "11th Level: Risk Assessment", level: 11 }
  ],
  15: [
    { id: "subclass-feature-specialist-inventor-15th-level-stranger-contraptions-6535", name: "15th Level: Stranger Contraptions", level: 15 }
  ],
  20: [
    { id: "subclass-feature-specialist-inventor-20th-level-the-big-one-7688", name: "20th Level: The Big One", level: 20 }
  ]
});

export function getInventorProgressionFeatures(level = 20) {
  const result = [];
  const addedIds = new Set();
  for (const [lvlStr, feats] of Object.entries(INVENTOR_PROGRESSION_FEATURES)) {
    if (Number(lvlStr) <= Number(level)) {
      for (const f of feats) {
        if (!addedIds.has(f.id)) {
          addedIds.add(f.id);
          result.push(f);
        }
      }
    }
  }
  return result;
}

export const SKYRANGER_PROGRESSION_FEATURES = Object.freeze({
  1: [
    { id: "subclass-feature-specialist-skyranger-1st-level-take-flight-364", name: "1st Level: Take Flight", level: 1 }
  ],
  5: [
    { id: "subclass-feature-specialist-skyranger-5th-level-air-doctrine-2119", name: "5th Level: Air Doctrine", level: 5 },
    { id: "subclass-feature-specialist-skyranger-5th-level-jink-3857", name: "5th Level: Jink", level: 5 }
  ],
  11: [
    { id: "subclass-feature-specialist-skyranger-11th-level-advanced-doctrine-4751", name: "11th Level: Advanced Doctrine", level: 11 }
  ],
  15: [
    { id: "subclass-feature-specialist-skyranger-15th-level-afterburners-6296", name: "15th Level: Afterburners", level: 15 }
  ],
  20: [
    { id: "subclass-feature-specialist-skyranger-20th-level-skyscreamer-6737", name: "20th Level: Skyscreamer", level: 20 }
  ]
});

export function getSkyrangerProgressionFeatures(level = 20) {
  const result = [];
  const addedIds = new Set();
  for (const [lvlStr, feats] of Object.entries(SKYRANGER_PROGRESSION_FEATURES)) {
    if (Number(lvlStr) <= Number(level)) {
      for (const f of feats) {
        if (!addedIds.has(f.id)) {
          addedIds.add(f.id);
          result.push(f);
        }
      }
    }
  }
  return result;
}

export const DOLLKEEPER_PROGRESSION_FEATURES = Object.freeze({
  1: [
    { id: "subclass-feature-specialist-dollkeeper-1st-level-living-doll-385", name: "1st Level: Living Doll", level: 1 }
  ],
  5: [
    { id: "subclass-feature-specialist-dollkeeper-5th-level-pull-the-strings-3575", name: "5th Level: Pull the Strings", level: 5 },
    { id: "subclass-feature-specialist-dollkeeper-5th-level-musical-chairs-4211", name: "5th Level: Musical Chairs", level: 5 }
  ],
  11: [
    { id: "subclass-feature-specialist-dollkeeper-11th-level-masquerade-4696", name: "11th Level: Masquerade", level: 11 }
  ],
  15: [
    { id: "subclass-feature-specialist-dollkeeper-15th-level-living-doll-5631", name: "15th Level: Living Doll", level: 15 }
  ],
  20: [
    { id: "subclass-feature-specialist-dollkeeper-20th-level-artistry-is-violence-6112", name: "20th Level: Artistry is Violence", level: 20 }
  ]
});

export function getDollkeeperProgressionFeatures(level = 20) {
  const result = [];
  const addedIds = new Set();
  for (const [lvlStr, feats] of Object.entries(DOLLKEEPER_PROGRESSION_FEATURES)) {
    if (Number(lvlStr) <= Number(level)) {
      for (const f of feats) {
        if (!addedIds.has(f.id)) {
          addedIds.add(f.id);
          result.push(f);
        }
      }
    }
  }
  return result;
}

export const TRAPMASTER_PROGRESSION_FEATURES = Object.freeze({
  1: [
    { id: "subclass-feature-specialist-trapmaster-1st-level-environmental-warfare-250", name: "1st Level: Environmental Warfare", level: 1 }
  ],
  5: [
    { id: "subclass-feature-specialist-trapmaster-5th-level-panic-inducer-2694", name: "5th Level: Panic Inducer", level: 5 },
    { id: "subclass-feature-specialist-trapmaster-5th-level-here-s-one-i-made-earlier-3911", name: "5th Level: Here's One I Made Earlier", level: 5 }
  ],
  11: [
    { id: "subclass-feature-specialist-trapmaster-11th-level-bait-the-trap-4507", name: "11th Level: Bait the Trap", level: 11 }
  ],
  15: [
    { id: "subclass-feature-specialist-trapmaster-15th-level-agent-of-chaos-5089", name: "15th Level: Agent of Chaos", level: 15 }
  ],
  20: [
    { id: "subclass-feature-specialist-trapmaster-20th-level-house-of-horrors-5351", name: "20th Level: House of Horrors", level: 20 }
  ]
});

export function getTrapmasterProgressionFeatures(level = 20) {
  const result = [];
  const addedIds = new Set();
  for (const [lvlStr, feats] of Object.entries(TRAPMASTER_PROGRESSION_FEATURES)) {
    if (Number(lvlStr) <= Number(level)) {
      for (const f of feats) {
        if (!addedIds.has(f.id)) {
          addedIds.add(f.id);
          result.push(f);
        }
      }
    }
  }
  return result;
}

export function inspectSpecialistFields(actor, choices = {}) {
  const level = levelOf(specialistClass(actor)) ?? 1;
  const attached = branchItem(actor);
  const currentChoices = specialistChoices(actor, choices);
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(SPECIALIST_BRANCH_IDS).map(([id, name]) =>
      option(id, name.charAt(0).toUpperCase() + name.slice(1))
    );
    fields.push(field("branch", "Choose your Specialist Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  // Saving Throws: Choice between Wisdom and Charisma (Dex is automatic)
  fields.push(field(
    "saves",
    "Choose 1 Saving Throw proficiency (Dexterity is automatic)",
    SPECIALIST_SAVES.choices.map(([name, key]) => option(key, name)),
    1,
    currentChoices.saves?.[0] ?? currentChoices.saves ?? null,
    1
  ));

  // Skills: Choose 3 from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness
  fields.push(field(
    "skills",
    "Choose 3 Skill proficiencies",
    SPECIALIST_SKILLS.map(([name, key]) => option(key, name)),
    3,
    currentChoices.skills ?? [],
    1
  ));

  // Weapon Specialisation: Category (Melee or Ranged) + Fighting Style
  fields.push(field(
    "weaponCategory",
    "Choose Weapon Specialisation (Melee Combat or Ranged Combat)",
    [
      option("melee", "Melee Combat"),
      option("ranged", "Ranged Combat")
    ],
    1,
    currentChoices.weaponCategory ?? null,
    1
  ));

  const chosenCat = currentChoices.weaponCategory ?? "melee";
  const availableStyles = chosenCat === "ranged" ? RANGED_FIGHTING_STYLES : MELEE_FIGHTING_STYLES;
  fields.push(field(
    "fightingStyle",
    `Choose Fighting Style (${chosenCat === "ranged" ? "Ranged" : "Melee"})`,
    availableStyles.map(s => option(s.id, s.name, { summary: s.summary, chapterThreeId: s.chapterThreeId })),
    1,
    currentChoices.fightingStyle ?? null,
    1
  ));

  // Starting Equipment
  fields.push(field(
    "startingEquipment.mode",
    "Starting Equipment or 1300 LMD",
    [
      option("items", "Starting Equipment Package"),
      option("cash", "1300 LMD")
    ],
    1,
    currentChoices.startingEquipment?.mode ?? null,
    1
  ));

  if (currentChoices.startingEquipment?.mode === "items") {
    const lightMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons");
    const lightRanged = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Ranged Weapons");
    const lightShields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
    const outfits = equipmentOptions(entry => entry.kind === "equipment" && ["Reinforced Outfit", "Underarmour"].includes(entry.name));
    const toolKits = equipmentOptions(entry => entry.kind === "tool");

    fields.push(field(
      "startingEquipment.choice1",
      "Choice 1: 1x Light Melee Weapon OR 1x Light Ranged Weapon",
      [...lightMelee, ...lightRanged],
      1,
      currentChoices.startingEquipment?.choice1 ?? null,
      1
    ));
    fields.push(field(
      "startingEquipment.choice2",
      "Choice 2: 1x Light Melee Weapon OR 1x Light Shield",
      [...lightMelee, ...lightShields],
      1,
      currentChoices.startingEquipment?.choice2 ?? null,
      1
    ));
    fields.push(field(
      "startingEquipment.choice3",
      "Choice 3: Reinforced Outfit OR Underarmour",
      outfits.length ? outfits : [
        option("equipment-reinforced-outfit-1", "Reinforced Outfit"),
        option("equipment-underarmour-4", "Underarmour")
      ],
      1,
      currentChoices.startingEquipment?.choice3 ?? null,
      1
    ));
    fields.push(field(
      "startingEquipment.toolKit",
      "Choice 4: 1x Tool Kit proficient with",
      toolKits,
      1,
      currentChoices.startingEquipment?.toolKit ?? null,
      1
    ));
  }

  // Hit Points per level
  for (let n = 1; n <= level; n++) {
    fields.push(field(
      `hp.${n}`,
      `Hit Points Level ${n} (${n === 1 ? "Max: 8 + CON" : "Fixed 5 or 1d8"})`,
      hpOptions(n),
      1,
      currentChoices.hp?.[n] ?? { mode: "existing" },
      n
    ));
  }

  // Ability Score Improvements (Levels 4, 6, 8, 10, 12, 16, 19)
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    fields.push(field(
      `asi.${n}`,
      `Ability Score Improvement (Level ${n})`,
      asiOptions(actor),
      1,
      currentChoices.asi?.[n] ?? { mode: "existing" },
      n
    ));
  }

  // Talents
  if (level >= 3) {
    fields.push(field("talents.basic", "Level 3: Basic Talent", talentOptions("basic"), 1, currentChoices.talents?.basic ?? null, 3));
  }
  if (level >= 8) {
    fields.push(field("talents.basicModule", "Level 8: Basic Talent Module Upgrade or New Basic Talent", [
      option("upgrade", "Upgrade chosen Basic Talent (gain Module Effect)"),
      ...talentOptions("basic")
    ], 1, currentChoices.talents?.basicModule ?? null, 8));
  }
  if (level >= 9) {
    fields.push(field("talents.advanced", "Level 9: Advanced Talent", talentOptions("advanced"), 1, currentChoices.talents?.advanced ?? null, 9));
  }
  if (level >= 13) {
    fields.push(field("talents.advancedModule", "Level 13: Advanced Talent Module Upgrade or New Advanced Talent", [
      option("upgrade", "Upgrade chosen Advanced Talent (gain Module Effect)"),
      ...talentOptions("advanced")
    ], 1, currentChoices.talents?.advancedModule ?? null, 13));
  }

  // Air Doctrine for Skyranger (at level >= 5)
  const isSkyrangerSubclass = attached ?
    (flag(attached, "chapterThreeId") === "subclass-specialist-skyranger" || attached.identifier === "skyranger") :
    (currentChoices.branch === "skyranger" || currentChoices.branch === "subclass-specialist-skyranger" || isSkyranger(actor));
  if (isSkyrangerSubclass && level >= 5) {
    fields.push(field(
      "airDoctrine",
      "Air Doctrine Selection (Short or Long Rest)",
      [
        option("airSuperiority", "Air Superiority (AA Missile)"),
        option("bombardment", "Bombardment (Bombing Run)"),
        option("closeAirSupport", "Close Air Support (Swooping Dive)")
      ],
      1,
      currentChoices.airDoctrine ?? "airSuperiority",
      5
    ));
  }

  return fields;
}

function actorSnapshotKey(actor, choices, profile) {
  return JSON.stringify([
    actor.uuid,
    profile.level,
    profile.branch,
    choices.branch,
    choices.saves,
    choices.skills,
    choices.weaponCategory,
    choices.fightingStyle,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents,
    choices.airDoctrine
  ]);
}

export async function previewSpecialistProgression(actor, suppliedChoices = {}) {
  const profile = specialistProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Specialist class.");
  const level = profile.level ?? 1;
  const choices = specialistChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);

  const state = readState(actor);
  const alreadyGrantedEquipment = Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode === "existing");

  // 1. Branch validation
  if (!attachedBranch && !choices.branch) pending.push("branch");

  // 2. Saves validation: Dexterity is automatic; 1 choice from Wis/Cha
  const allowedSaves = new Set(SPECIALIST_SAVES.choices.map(([_, key]) => key));
  const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
  const validSaves = chosenSaves.length === 1 && allowedSaves.has(chosenSaves[0]);
  if (!validSaves) pending.push("saves");

  // 3. Skills validation: exactly 3 unique skills from SPECIALIST_SKILLS
  const allowedSkills = new Set(SPECIALIST_SKILLS.map(([_, key]) => key));
  const chosenSkillsList = Array.isArray(choices.skills) ? choices.skills : [];
  const uniqueChosenSkills = Array.from(new Set(chosenSkillsList));
  const validSkills = chosenSkillsList.length === 3 &&
    uniqueChosenSkills.length === 3 &&
    chosenSkillsList.every(s => allowedSkills.has(s));
  if (!validSkills) pending.push("skills");

  // 4. Weapon Specialisation validation
  const weaponCat = choices.weaponCategory;
  if (!weaponCat || !["melee", "ranged"].includes(weaponCat)) {
    pending.push("weaponCategory");
  }
  const style = choices.fightingStyle;
  const categoryStyles = weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : (weaponCat === "melee" ? MELEE_FIGHTING_STYLES : []);
  const styleObj = categoryStyles.find(s => s.id === style);
  if (!style || !styleObj) {
    pending.push("fightingStyle");
  }

  // 5. Starting Equipment validation
  if (!alreadyGrantedEquipment) {
    if (!choices.startingEquipment?.mode) {
      pending.push("startingEquipment.mode");
    } else if (choices.startingEquipment.mode === "items") {
      if (!choices.startingEquipment.choice1) pending.push("startingEquipment.choice1");
      if (!choices.startingEquipment.choice2) pending.push("startingEquipment.choice2");
      if (!choices.startingEquipment.choice3) pending.push("startingEquipment.choice3");
    }
  }

  // 6. HP validation
  for (let n = 1; n <= level; n++) {
    const hpChoice = choices.hp?.[n];
    if (!hpChoice || (!state.hpLevels.includes(n) && hpChoice.mode === "existing" && n > 1 && !actor._source?.system?.attributes?.hp?.max)) {
      // Allow existing if state already includes it or actor has HP
    }
    if (!hpChoice && !state.hpLevels.includes(n)) {
      pending.push(`hp.${n}`);
    }
  }

  // 7. ASI validation
  const validAbilities = ["str", "dex", "con", "int", "wis", "cha"];
  const abilityIncreases = {};
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    const asiChoice = choices.asi?.[n];
    if (!asiChoice) {
      if (!state.asiLevels.includes(n)) pending.push(`asi.${n}`);
      continue;
    }
    if (asiChoice.mode === "existing") continue;
    const increases = Array.isArray(asiChoice.increases) ? asiChoice.increases : [];
    const isValidScheme = (
      (increases.length === 1 && increases[0].amount === 2 && validAbilities.includes(increases[0].ability)) ||
      (increases.length === 2 &&
       increases[0].amount === 1 &&
       increases[1].amount === 1 &&
       increases[0].ability !== increases[1].ability &&
       validAbilities.includes(increases[0].ability) &&
       validAbilities.includes(increases[1].ability))
    );
    if (!isValidScheme) {
      if (!state.asiLevels.includes(n)) pending.push(`asi.${n}`);
      continue;
    }
    for (const inc of increases) {
      abilityIncreases[inc.ability] = (abilityIncreases[inc.ability] ?? 0) + Math.min(2, Math.max(1, inc.amount));
    }
  }

  // Items to create: Branch item
  if (!attachedBranch && selectedBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(e => e.id === selectedBranchId);
    if (branchEntry) {
      createItems.push(sourceData(branchEntry, "subclass"));
    }
  }

  const system = sourceSystem(actor);

  // Items to create: Inventor branch features
  const isInventorBranch = selectedBranchId === "subclass-specialist-inventor" ||
                           choices.branch === "inventor" ||
                           choices.branch === "subclass-specialist-inventor" ||
                           isInventor(actor);
  if (isInventorBranch) {
    const inventorFeatures = getInventorProgressionFeatures(level);
    for (const feat of inventorFeatures) {
      const owned = entries(actor.items).some(i => flag(i, "chapterThreeId") === feat.id);
      const inCreates = createItems.some(i => flag(i, "chapterThreeId") === feat.id);
      if (!owned && !inCreates) {
        const entry = CHAPTER_THREE_CLASSES.find(e => e.id === feat.id);
        if (entry) {
          createItems.push(sourceData(entry, "branchFeature"));
        }
      }
    }
  }

  // Items to create: Skyranger branch features & Flight Suit
  const isSkyrangerBranch = selectedBranchId === "subclass-specialist-skyranger" ||
                           choices.branch === "skyranger" ||
                           choices.branch === "subclass-specialist-skyranger" ||
                           isSkyranger(actor);
  if (isSkyrangerBranch) {
    const skyrangerFeatures = getSkyrangerProgressionFeatures(level);
    for (const feat of skyrangerFeatures) {
      const owned = entries(actor.items).some(i => flag(i, "chapterThreeId") === feat.id);
      const inCreates = createItems.some(i => flag(i, "chapterThreeId") === feat.id);
      if (!owned && !inCreates) {
        const entry = CHAPTER_THREE_CLASSES.find(e => e.id === feat.id);
        if (entry) {
          createItems.push(sourceData(entry, "branchFeature"));
        }
      }
    }
    const hasFlightSuit = entries(actor.items).some(i => isFlightSuit(i) || i.name === "Flight Suit") ||
                          createItems.some(i => isFlightSuit(i) || i.name === "Flight Suit");
    if (!hasFlightSuit) {
      createItems.push(createFlightSuitItem());
    }
    if (choices.airDoctrine) {
      writes["flags.ak5e.skyranger.doctrine"] = choices.airDoctrine;
    } else if (!actor.flags?.ak5e?.skyranger?.doctrine) {
      writes["flags.ak5e.skyranger.doctrine"] = "airSuperiority";
    }
  }

  // Items to create: Dollkeeper branch features & companion linkage state
  const isDollkeeperBranch = selectedBranchId === "subclass-specialist-dollkeeper" ||
                            choices.branch === "dollkeeper" ||
                            choices.branch === "subclass-specialist-dollkeeper" ||
                            isDollkeeper(actor);
  if (isDollkeeperBranch) {
    const dollkeeperFeatures = getDollkeeperProgressionFeatures(level);
    for (const feat of dollkeeperFeatures) {
      const owned = entries(actor.items).some(i => flag(i, "chapterThreeId") === feat.id);
      const inCreates = createItems.some(i => flag(i, "chapterThreeId") === feat.id);
      if (!owned && !inCreates) {
        const entry = CHAPTER_THREE_CLASSES.find(e => e.id === feat.id);
        if (entry) {
          createItems.push(sourceData(entry, "branchFeature"));
        }
      }
    }
    if (!actor.flags?.ak5e?.dollkeeper?.hasDoll) {
      writes["flags.ak5e.dollkeeper.hasDoll"] = true;
      writes["flags.ak5e.dollkeeper.dollState"] = "active";
    }
  }

  // Items to create: Trapmaster branch features & Sleight of Hand expertise
  const isTrapmasterBranch = selectedBranchId === "subclass-specialist-trapmaster" ||
                            choices.branch === "trapmaster" ||
                            choices.branch === "subclass-specialist-trapmaster" ||
                            isTrapmaster(actor);
  if (isTrapmasterBranch) {
    const trapmasterFeatures = getTrapmasterProgressionFeatures(level);
    for (const feat of trapmasterFeatures) {
      const owned = entries(actor.items).some(i => flag(i, "chapterThreeId") === feat.id);
      const inCreates = createItems.some(i => flag(i, "chapterThreeId") === feat.id);
      if (!owned && !inCreates) {
        const entry = CHAPTER_THREE_CLASSES.find(e => e.id === feat.id);
        if (entry) {
          createItems.push(sourceData(entry, "branchFeature"));
        }
      }
    }
    const currentSlt = Number(system.skills?.slt?.value ?? 0);
    const targetSlt = currentSlt >= 1 ? 2 : 1;
    if (currentSlt < targetSlt) {
      writes["system.skills.slt.value"] = targetSlt;
    }
  }

  // Items to create: Fighting style feature
  if (styleObj) {
    const styleEntry = CHAPTER_THREE_CLASSES.find(e => e.id === styleObj.chapterThreeId);
    if (styleEntry) {
      const owned = entries(actor.items).some(i => flag(i, "chapterThreeId") === styleObj.chapterThreeId);
      if (!owned) createItems.push(sourceData(styleEntry, "fightingStyle"));
    }
  }

  // Starting equipment items / cash
  if (!alreadyGrantedEquipment) {
    if (choices.startingEquipment?.mode === "items") {
      const eqKeys = ["choice1", "choice2", "choice3", "toolKit"];
      for (const key of eqKeys) {
        const eqId = choices.startingEquipment[key];
        if (eqId) {
          const eqEntry = EQUIPMENT.find(e => e.id === eqId);
          if (eqEntry) createItems.push(equipmentData(eqEntry));
        }
      }
    } else if (choices.startingEquipment?.mode === "cash") {
      const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
      writes["system.currency.cp"] = beforeCp + 1300;
    }
  }

  // Proficiencies updates
  writes["flags.ak5e.specialist.enabled"] = true;
  if (weaponCat) writes["flags.ak5e.specialist.weaponCategory"] = weaponCat;
  if (style) writes["flags.ak5e.specialist.fightingStyle"] = style;

  // Saves: Dex automatic + chosen save
  const currentSaves = new Set(system.traits?.saves?.value ?? []);
  currentSaves.add(SPECIALIST_SAVES.automatic);
  if (validSaves) currentSaves.add(chosenSaves[0]);
  writes["system.traits.saves.value"] = Array.from(currentSaves);

  // Armor: Light, Medium, Light Shield
  const currentArmor = new Set(system.traits?.armorProf?.value ?? []);
  for (const prof of SPECIALIST_ARMOR_PROFS) currentArmor.add(prof);
  writes["system.traits.armorProf.value"] = Array.from(currentArmor);

  // Weapons: Light Melee, Light Ranged
  const currentWeapons = new Set(system.traits?.weaponProf?.value ?? []);
  currentWeapons.add("sim");
  writes["system.traits.weaponProf.value"] = Array.from(currentWeapons);

  // Skills
  if (validSkills) {
    for (const skillKey of uniqueChosenSkills) {
      writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
    }
  }

  // Hit Points calculations
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  let hpIncrease = 0;
  for (let n = 1; n <= level; n++) {
    const hpChoice = choices.hp?.[n];
    if (!hpChoice || hpChoice.mode === "existing") continue;
    if (n === 1) {
      hpIncrease += Math.max(1, 8 + conMod);
    } else {
      const rawRoll = Number(hpChoice.roll);
      const rolled = Number.isFinite(rawRoll) ? Math.min(8, Math.max(1, Math.round(rawRoll))) : 5;
      hpIncrease += Math.max(1, rolled + conMod);
    }
  }
  if (hpIncrease > 0) {
    const currentMax = Number(system.attributes?.hp?.max ?? 0);
    writes["system.attributes.hp.max"] = currentMax + hpIncrease;
  }

  // Ability increases
  for (const [abl, inc] of Object.entries(abilityIncreases)) {
    const current = currentAbility(actor, abl);
    writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
  }

  // Talents
  const existingTalents = entries(actor.items).filter(i => flag(i, "classContentKind") === "class-option");
  const existingIds = new Set(existingTalents.map(i => flag(i, "chapterThreeId")));

  const grantTalent = (talentId, tier) => {
    if (!talentId || talentId === "upgrade" || existingIds.has(talentId)) return;
    const talentEntry = TALENTS.find(t => t.id === talentId);
    if (talentEntry) {
      const data = sourceData(talentEntry, "talent");
      data.flags.ak5e[SPECIALIST_TALENT_FLAG] = { sourceId: talentId, tier };
      createItems.push(data);
      existingIds.add(talentId);
    }
  };

  if (choices.talents?.basic) grantTalent(choices.talents.basic, "basic");
  if (choices.talents?.basicModule && choices.talents.basicModule !== "upgrade") grantTalent(choices.talents.basicModule, "basic");
  if (choices.talents?.advanced) grantTalent(choices.talents.advanced, "advanced");
  if (choices.talents?.advancedModule && choices.talents.advancedModule !== "upgrade") grantTalent(choices.talents.advancedModule, "advanced");

  const contextKey = actorSnapshotKey(actor, choices, profile);

  return {
    level,
    choices,
    pending,
    warnings,
    writes,
    createItems,
    updateItems,
    contextKey,
    valid: pending.length === 0
  };
}

export async function applySpecialistProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
  need(confirmed === true, "Confirm the previewed Specialist progression first.");
  const plan = await previewSpecialistProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview Specialist progression again.");
  need(plan.valid, `Complete all required choices before applying progression: ${plan.pending.join(", ")}`);

  const state = readState(actor);
  state.choices = structuredClone(plan.choices);

  const hpLevelsGranted = Object.entries(plan.choices.hp ?? {})
    .filter(([_, opt]) => opt && opt.mode !== "existing")
    .map(([lvl]) => Number(lvl));
  const asiLevelsGranted = Object.entries(plan.choices.asi ?? {})
    .filter(([_, opt]) => opt && opt.mode !== "existing" && opt.increases?.length)
    .map(([lvl]) => Number(lvl));

  state.hpLevels = [...new Set([...(state.hpLevels ?? []), ...hpLevelsGranted])];
  state.asiLevels = [...new Set([...(state.asiLevels ?? []), ...asiLevelsGranted])];

  for (const n of hpLevelsGranted) state.choices.hp[n] = { mode: "existing" };
  for (const n of asiLevelsGranted) state.choices.asi[n] = { mode: "existing" };
  if (!state.startingEquipmentGranted && (plan.choices.startingEquipment?.mode === "items" || plan.choices.startingEquipment?.mode === "cash")) {
    state.startingEquipmentGranted = true;
  }
  if (state.startingEquipmentGranted) {
    state.choices.startingEquipment = { mode: "existing" };
  }

  const updates = {
    ...plan.writes,
    [`flags.ak5e.${SPECIALIST_PROGRESS_FLAG}`]: state
  };
  await actor.update(updates);

  if (plan.createItems.length) {
    await actor.createEmbeddedDocuments("Item", plan.createItems);
  }

  return {
    success: true,
    level: plan.level,
    updatedFields: Object.keys(plan.writes),
    created: plan.createItems.map(c => c.name)
  };
}
