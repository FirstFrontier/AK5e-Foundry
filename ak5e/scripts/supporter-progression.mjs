/** Native, previewed Supporter character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in vanguard-progression.mjs.
 * Pure and previewed: opening or inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  SUPPORTER_CLASS_ID, SUPPORTER_BRANCH_IDS, SUPPORTER_SKILLS, SUPPORTER_SAVES,
  SUPPORTER_ARMOR_PROFS, SUPPORTER_WEAPON_PROFS, SUPPORTER_TOOL_CHOICES,
  ASI_LEVELS, checkLevel, supporterProfile, supporterState
} from "./supporter-rules.mjs";
import { need } from "./operation-kernel.mjs";

export const SUPPORTER_PROGRESS_FLAG = "supporterProgression";
export const SUPPORTER_TALENT_FLAG = "supporterTalent";

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry =>
  entry.kind === "class-option" && entry.parentClass === "Supporter" && entry.classOption?.category === "talent"
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
  const stored = flag(actor, SUPPORTER_PROGRESS_FLAG) ?? {};
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

function supporterClass(actor) {
  return classItems(actor).find(item => flag(item, "chapterThreeId") === SUPPORTER_CLASS_ID || item.name === "Supporter") ?? null;
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
  data.flags.ak5e.supporterProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.supporterProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.supporterProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.supporterProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });

export function supporterChoices(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : [saves];
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  if (state.startingEquipmentGranted && !supplied.startingEquipment?.mode) {
    result.startingEquipment.mode = "existing";
  }
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.branch = supplied.branch ?? saved.branch ?? null;
  result.aidAbility = supplied.aidAbility ?? saved.aidAbility ?? "cha";
  result.tool = supplied.tool ?? saved.tool ?? "Tool Kit";

  const level = levelOf(supporterClass(actor));
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
      option({ mode: "fixed", roll: 6 }, "Fixed 6 at 1st level")
    ];
  }
  const fixedRoll = 4;
  const rolledOptions = Array.from({ length: 6 }, (_, i) => {
    const roll = i + 1;
    return option({ mode: "rolled", roll }, `Rolled d6: ${roll}`);
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

export function inspectSupporterFields(actor, choices = {}) {
  const level = levelOf(supporterClass(actor)) ?? 1;
  const attached = branchItem(actor);
  const currentChoices = supporterChoices(actor, choices);
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(SUPPORTER_BRANCH_IDS).map(([id, name]) => option(id, name.charAt(0).toUpperCase() + name.slice(1)));
    fields.push(field("branch", "Choose your Supporter Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  // Choose two saving throws from Con, Cha, Wis
  fields.push(field("saves", "Choose two Saving Throw proficiencies", SUPPORTER_SAVES.choices.map(([name, key]) => option(key, name)), 2, currentChoices.saves ?? []));

  // Choose three skills from Arts, Lore, Tech, Insight, Deception, Persuasion
  fields.push(field("skills", "Choose three Supporter skills", SUPPORTER_SKILLS.map(([name, key]) => option(key, name)), 3, currentChoices.skills ?? []));

  // Aid Die Ability: Int, Wis, or Cha
  fields.push(field("aidAbility", "Choose ability modifier for Aid Dice uses", [
    option("int", "Intelligence"),
    option("wis", "Wisdom"),
    option("cha", "Charisma")
  ], 1, currentChoices.aidAbility ?? "cha"));

  // Tool / Vehicle proficiency
  fields.push(field("tool", "Choose a Tool Kit or Vehicle proficiency", [
    option("Tool Kit", "Tool Kit"),
    option("Vehicle", "Vehicle")
  ], 1, currentChoices.tool ?? "Tool Kit"));

  // Starting Equipment
  fields.push(field("startingEquipment.mode", "Choose starting equipment or 1300 LMD", [
    option("items", "Starting equipment"),
    option("cash", "1300 LMD")
  ], 1, currentChoices.startingEquipment?.mode ?? null));

  if (currentChoices.startingEquipment?.mode === "items") {
    const lightMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons");
    const lightShields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
    const toolKits = equipmentOptions(entry => entry.kind === "tool");

    fields.push(field("startingEquipment.weapon1", "1x Light Melee Weapon", lightMelee, 1, currentChoices.startingEquipment?.weapon1 ?? null));
    fields.push(field("startingEquipment.weapon2", "1x Light Melee Weapon OR 1x Light Shield", [...lightMelee, ...lightShields], 1, currentChoices.startingEquipment?.weapon2 ?? null));
    fields.push(field("startingEquipment.tool1", "Tool Kit 1", toolKits, 1, currentChoices.startingEquipment?.tool1 ?? null));
    fields.push(field("startingEquipment.tool2", "Tool Kit 2", toolKits, 1, currentChoices.startingEquipment?.tool2 ?? null));
  }

  // Hit Points
  for (let n = 1; n <= level; n++) {
    fields.push(field(`hp.${n}`, `Level ${n} Hit Points`, hpOptions(n), 1, currentChoices.hp?.[n] ?? { mode: "existing" }));
  }

  // ASIs
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    fields.push(field(`asi.${n}`, `Level ${n} Ability Score Improvement`, asiOptions(actor), 1, currentChoices.asi?.[n] ?? { mode: "existing" }));
  }

  // Talents
  if (level >= 3) {
    fields.push(field("talents.basic", "Level 3: Basic Talent", talentOptions("basic"), 1, currentChoices.talents?.basic ?? null));
  }
  if (level >= 8) {
    fields.push(field("talents.basicModule", "Level 8: Basic Talent Module Upgrade or New Basic Talent", [
      option("upgrade", "Upgrade chosen Basic Talent (gain Module Effect)"),
      ...talentOptions("basic")
    ], 1, currentChoices.talents?.basicModule ?? null));
  }
  if (level >= 9) {
    fields.push(field("talents.advanced", "Level 9: Advanced Talent", talentOptions("advanced"), 1, currentChoices.talents?.advanced ?? null));
  }
  if (level >= 13) {
    fields.push(field("talents.advancedModule", "Level 13: Advanced Talent Module Upgrade or New Advanced Talent", [
      option("upgrade", "Upgrade chosen Advanced Talent (gain Module Effect)"),
      ...talentOptions("advanced")
    ], 1, currentChoices.talents?.advancedModule ?? null));
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
    choices.aidAbility,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents
  ]);
}

export async function previewSupporterProgression(actor, suppliedChoices = {}) {
  const profile = supporterProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Supporter class.");
  const level = profile.level;
  const choices = supporterChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);

  const state = readState(actor);
  const alreadyGrantedEquipment = Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode === "existing");

  // Validate branch
  if (!attachedBranch && !choices.branch) pending.push("branch");

  // Validate saves: exactly two unique from ["con", "cha", "wis"]
  const allowedSaves = new Set(SUPPORTER_SAVES.choices.map(([_, key]) => key));
  const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
  const uniqueChosenSaves = new Set(chosenSaves);
  const validSaves = chosenSaves.length === 2 &&
    uniqueChosenSaves.size === 2 &&
    chosenSaves.every(s => allowedSaves.has(s));

  if (!validSaves) {
    pending.push("saves");
  }

  // Validate skills: exactly 3 unique skills from SUPPORTER_SKILLS
  const allowedSkills = new Set(SUPPORTER_SKILLS.map(([_, key]) => key));
  const chosenSkillsList = Array.isArray(choices.skills) ? choices.skills : [];
  const uniqueChosenSkills = new Set(chosenSkillsList);
  const validSkills = chosenSkillsList.length === 3 &&
    uniqueChosenSkills.size === 3 &&
    chosenSkillsList.every(s => allowedSkills.has(s));

  if (!validSkills) {
    pending.push("skills");
  }

  // Validate starting equipment
  if (!alreadyGrantedEquipment) {
    if (!choices.startingEquipment?.mode) pending.push("startingEquipment.mode");
    else if (choices.startingEquipment.mode === "items") {
      if (!choices.startingEquipment.weapon1) pending.push("startingEquipment.weapon1");
      if (!choices.startingEquipment.weapon2) pending.push("startingEquipment.weapon2");
      if (!choices.startingEquipment.tool1) pending.push("startingEquipment.tool1");
      if (!choices.startingEquipment.tool2) pending.push("startingEquipment.tool2");
    }
  }

  // Branch item
  if (!attachedBranch && selectedBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(e => e.id === selectedBranchId);
    if (branchEntry) {
      createItems.push(sourceData(branchEntry, "subclass"));
    }
  }

  // Starting equipment items / cash
  if (!alreadyGrantedEquipment) {
    if (choices.startingEquipment?.mode === "items") {
      const eqKeys = ["weapon1", "weapon2", "tool1", "tool2"];
      for (const key of eqKeys) {
        const eqId = choices.startingEquipment[key];
        if (eqId) {
          const eqEntry = EQUIPMENT.find(e => e.id === eqId);
          if (eqEntry) createItems.push(equipmentData(eqEntry));
        }
      }
      // Protective Clothing
      const prot = EQUIPMENT.find(e => e.id === "equipment-protective-clothing-0");
      if (prot) createItems.push(equipmentData(prot));
    } else if (choices.startingEquipment?.mode === "cash") {
      const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
      writes["system.currency.cp"] = beforeCp + 1300;
    }
  }

  // Proficiencies updates
  const system = sourceSystem(actor);
  // Saves: Exactly the two chosen saves
  const currentSaves = new Set(system.traits?.saves?.value ?? []);
  if (validSaves) {
    for (const s of uniqueChosenSaves) currentSaves.add(s);
  }
  writes["system.traits.saves.value"] = Array.from(currentSaves);

  // Armor: Light Armor, Light Shield
  const currentArmor = new Set(system.traits?.armorProf?.value ?? []);
  for (const prof of SUPPORTER_ARMOR_PROFS) currentArmor.add(prof);
  writes["system.traits.armorProf.value"] = Array.from(currentArmor);

  // Weapons: Light Melee
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
      hpIncrease += Math.max(1, 6 + conMod);
    } else {
      const rawRoll = Number(hpChoice.roll);
      const rolled = Number.isFinite(rawRoll) ? Math.min(6, Math.max(1, Math.round(rawRoll))) : 4;
      hpIncrease += Math.max(1, rolled + conMod);
    }
  }
  if (hpIncrease > 0) {
    const currentMax = Number(system.attributes?.hp?.max ?? 0);
    writes["system.attributes.hp.max"] = currentMax + hpIncrease;
  }

  // Ability Score Improvements
  const validAbilities = ["str", "dex", "con", "int", "wis", "cha"];
  const abilityIncreases = {};
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    const asiChoice = choices.asi?.[n];
    if (!asiChoice) {
      pending.push(`asi.${n}`);
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
      pending.push(`asi.${n}`);
      continue;
    }
    for (const inc of increases) {
      abilityIncreases[inc.ability] = (abilityIncreases[inc.ability] ?? 0) + Math.min(2, Math.max(1, inc.amount));
    }
  }
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
      data.flags.ak5e[SUPPORTER_TALENT_FLAG] = { sourceId: talentId, tier };
      createItems.push(data);
      existingIds.add(talentId);
    }
  };

  if (choices.talents?.basic) grantTalent(choices.talents.basic, "basic");
  if (choices.talents?.basicModule && choices.talents.basicModule !== "upgrade") grantTalent(choices.talents.basicModule, "basic");
  if (choices.talents?.advanced) grantTalent(choices.talents.advanced, "advanced");
  if (choices.talents?.advancedModule && choices.talents.advancedModule !== "upgrade") grantTalent(choices.talents.advancedModule, "advanced");

  // Save chosen aidAbility under flags.ak5e.supporter
  if (["int", "wis", "cha"].includes(choices.aidAbility)) {
    writes["flags.ak5e.supporter.aidAbility"] = choices.aidAbility;
  }

  const contextKey = actorSnapshotKey(actor, choices, profile);

  return {
    level,
    choices,
    pending,
    warnings,
    writes,
    createItems,
    updateItems,
    contextKey
  };
}

export async function applySupporterProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
  need(confirmed === true, "Confirm the previewed Supporter progression first.");
  const plan = await previewSupporterProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview Supporter progression again.");
  need(plan.pending.length === 0, `Complete all required choices before applying progression: ${plan.pending.join(", ")}`);

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
    [`flags.ak5e.${SUPPORTER_PROGRESS_FLAG}`]: state
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
