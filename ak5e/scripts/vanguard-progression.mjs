/** Native, previewed Vanguard character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in guard-progression.mjs.
 * Pure and previewed: opening or inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  VANGUARD_CLASS_ID, VANGUARD_BRANCH_IDS, VANGUARD_SKILLS, VANGUARD_SAVES,
  VANGUARD_ARMOR_PROFS, VANGUARD_WEAPON_PROFS, VANGUARD_TOOL_PROFS,
  ASI_LEVELS, checkLevel, vanguardProfile, vanguardState
} from "./vanguard-rules.mjs";
import { need } from "./operation-kernel.mjs";

export const VANGUARD_PROGRESS_FLAG = "vanguardProgression";
export const VANGUARD_TALENT_FLAG = "vanguardTalent";

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry =>
  entry.kind === "class-option" && entry.parentClass === "Vanguard" && entry.classOption?.category === "talent"
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
  const stored = flag(actor, VANGUARD_PROGRESS_FLAG) ?? {};
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

function vanguardClass(actor) {
  return classItems(actor).find(item => flag(item, "chapterThreeId") === VANGUARD_CLASS_ID || item.name === "Vanguard") ?? null;
}

function branchItem(actor) {
  const classItem = vanguardClass(actor);
  const identifier = classItem?.system?.identifier ?? classItem?.system?.classIdentifier;
  return entries(actor?.items).find(item => item.type === "subclass" && (
    item.system?.classIdentifier === identifier || flag(item, "parentClass") === "Vanguard" ||
    flag(item, "classIdentifier") === identifier
  )) ?? null;
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
  data.flags.ak5e.vanguardProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.vanguardProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.vanguardProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    if (entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons") data.system.proficient = 1;
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.vanguardProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  if (entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons") data.system.proficient = 1;
  return data;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });

export function vanguardChoices(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : [saves];
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.martialDCAbility = supplied.martialDCAbility ?? saved.martialDCAbility ?? null;
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  if (state.startingEquipmentGranted && !supplied.startingEquipment?.mode) {
    result.startingEquipment.mode = "existing";
  }
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  for (const tier of ["basic", "advanced"]) {
    if (result.talents[tier]) continue;
    const owned = entries(actor?.items).find(item => {
      const id = flag(item, "chapterThreeId");
      return TALENTS.some(entry => entry.id === id && entry.classOption.tier.toLowerCase() === tier);
    });
    if (owned) result.talents[tier] = flag(owned, "chapterThreeId");
  }
  for (const [key, tier] of [["basicModule", "basic"], ["advancedModule", "advanced"]]) {
    if (result.talents[key]) continue;
    const ownedUpgrade = entries(actor?.items).find(item => flag(item, VANGUARD_TALENT_FLAG)?.tier === tier && flag(item, VANGUARD_TALENT_FLAG)?.upgraded);
    if (ownedUpgrade) result.talents[key] = "upgrade";
  }
  result.branch = supplied.branch ?? saved.branch ?? null;
  result.tool = supplied.tool ?? saved.tool ?? "Messenger Kit";

  const level = levelOf(vanguardClass(actor));
  if (level) {
    result.asi ??= {};
    result.hp ??= {};
    for (const n of ASI_LEVELS.filter(v => v <= level)) {
      if (state.asiLevels?.includes(n)) {
        result.asi[n] = { mode: "existing" };
      } else {
        result.asi[n] ??= { mode: "existing" };
      }
    }
    for (let n = 1; n <= level; n++) {
      if (state.hpLevels?.includes(n)) {
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

export function inspectVanguardFields(actor, choices = {}) {
  const level = levelOf(vanguardClass(actor)) ?? 1;
  const attached = branchItem(actor);
  const currentChoices = vanguardChoices(actor, choices);
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(VANGUARD_BRANCH_IDS).map(([id, name]) => option(id, name.charAt(0).toUpperCase() + name.slice(1)));
    fields.push(field("branch", "Choose your Vanguard Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  fields.push(field("saves", "Choose one additional Saving Throw proficiency (Dexterity is automatic)", VANGUARD_SAVES.choices.map(([name, key]) => option(key, name)), 1, currentChoices.saves?.[0] ?? null));
  fields.push(field("skills", "Choose three Vanguard skills", VANGUARD_SKILLS.map(([name, key]) => option(key, name)), 3, currentChoices.skills ?? []));
  fields.push(field("tool", "Tool Kit proficiency (Messenger Kit)", [option("Messenger Kit", "Messenger Kit")], 1, currentChoices.tool ?? "Messenger Kit"));
  fields.push(field("martialDCAbility", "Martial DC ability", [option("str", "Strength"), option("dex", "Dexterity")], 1, currentChoices.martialDCAbility));

  fields.push(field("startingEquipment.mode", "Choose starting equipment or 1300 LMD", [option("items", "Starting equipment"), option("cash", "1300 LMD")], 1, currentChoices.startingEquipment?.mode ?? null));
  if (currentChoices.startingEquipment?.mode === "items") {
    const lightMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons");
    const lightShields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
    const armours = equipmentOptions(entry => ["equipment-reinforced-outfit-1", "equipment-light-combat-gear-2"].includes(entry.id));

    fields.push(field("startingEquipment.weapon1", "1x Light Melee Weapon", lightMelee, 1, currentChoices.startingEquipment?.weapon1 ?? null));
    fields.push(field("startingEquipment.weapon2", "1x Light Melee Weapon OR 1x Light Shield", [...lightMelee, ...lightShields], 1, currentChoices.startingEquipment?.weapon2 ?? null));
    fields.push(field("startingEquipment.armour", "Reinforced Outfit OR Light Combat Gear", armours, 1, currentChoices.startingEquipment?.armour ?? null));
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
  const itemSnapshot = entries(actor.items).map(item => [item.id, item.type, sourceId(item), flag(item, "tableData")?.category,
    item.system?.proficient, flag(item, "vanguardProgressionGrant"), flag(item, "classContentKind")]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([
    actor.uuid,
    profile.level,
    profile.branch,
    choices.branch,
    choices.saves,
    choices.skills,
    choices.tool,
    choices.martialDCAbility,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents,
    sourceSystem(actor),
    itemSnapshot
  ]);
}

/** Pure preview of Vanguard progression. Writes nothing. */
export async function previewVanguardProgression(actor, suppliedChoices = {}) {
  const profile = vanguardProfile(actor);
  need(actor?.isOwner && profile.applicable && !profile.blocked.length, "Choose an owned character with one valid Vanguard branch.");
  const level = profile.level;
  const choices = vanguardChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];
  if (entries(actor.items).some(item => item.type === "weapon" &&
      !["Light Melee Weapons", "Heavy Melee Weapons"].includes(flag(item, "tableData")?.category ?? item._source?.flags?.ak5e?.tableData?.category))) {
    warnings.push("The class gives Light Melee proficiency. AK5e weapons with source-category metadata are marked automatically; check third-party or uncategorized weapons manually.");
  }

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);

  const state = readState(actor);
  const alreadyGrantedEquipment = Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode === "existing");

  // Validate branch
  if (!attachedBranch && !choices.branch) pending.push("branch");
  if (attachedBranch && choices.branch && choices.branch !== flag(attachedBranch, "chapterThreeId")) pending.push("branch");

  // Validate saves: Dexterity is automatic; exactly 1 choice from ["str", "cha"]
  const allowedSaves = VANGUARD_SAVES.choices.map(([_, key]) => key);
  const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
  const validSaves = chosenSaves.length === 1 && allowedSaves.includes(chosenSaves[0]);
  if (!validSaves) {
    pending.push("saves");
  }
  if (!["str", "dex"].includes(choices.martialDCAbility)) pending.push("martialDCAbility");

  // Validate skills: exactly 3 unique skills from VANGUARD_SKILLS
  const allowedSkills = new Set(VANGUARD_SKILLS.map(([_, key]) => key));
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
    const mode = choices.startingEquipment?.mode;
    if (!["items", "cash", "existing"].includes(mode)) pending.push("startingEquipment.mode");
    else if (mode === "items") {
      const weapon1 = EQUIPMENT.find(entry => entry.id === choices.startingEquipment.weapon1);
      const weapon2 = EQUIPMENT.find(entry => entry.id === choices.startingEquipment.weapon2);
      const armour = EQUIPMENT.find(entry => entry.id === choices.startingEquipment.armour);
      if (weapon1?.kind !== "weapon" || weapon1?.tableData?.category !== "Light Melee Weapons") pending.push("startingEquipment.weapon1");
      if (!((weapon2?.kind === "weapon" && weapon2?.tableData?.category === "Light Melee Weapons") ||
        (weapon2?.kind === "equipment" && weapon2?.tableData?.category === "Light Shields"))) pending.push("startingEquipment.weapon2");
      if (!armour || !["equipment-reinforced-outfit-1", "equipment-light-combat-gear-2"].includes(armour.id)) pending.push("startingEquipment.armour");
    }
  }

  // Branch item
  if (!attachedBranch && selectedBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(e => e.id === selectedBranchId);
    if (branchEntry?.kind === "subclass" && branchEntry.parentClass === "Vanguard") {
      createItems.push(sourceData(branchEntry, "subclass"));
    } else pending.push("branch");
  }

  // Starting equipment items / cash
  if (!alreadyGrantedEquipment) {
    if (choices.startingEquipment?.mode === "items") {
      const eqKeys = ["weapon1", "weapon2", "armour"];
      for (const key of eqKeys) {
        const eqId = choices.startingEquipment[key];
        if (eqId) {
          const eqEntry = EQUIPMENT.find(e => e.id === eqId);
          if (eqEntry) createItems.push(equipmentData(eqEntry));
        }
      }
      // Grant Messenger kit
      const kitEntry = EQUIPMENT.find(e => e.id === "tool-messenger-kit-9");
      if (kitEntry) createItems.push(equipmentData(kitEntry));
    } else if (choices.startingEquipment?.mode === "cash") {
      const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
      writes["system.currency.cp"] = beforeCp + 1300; // 1300 LMD = 1300 CP
    }
  }

  // Proficiencies updates
  const system = sourceSystem(actor);
  writes["flags.ak5e.vanguard.martialDCAbility"] = choices.martialDCAbility;
  // Saves: Dexterity automatic + chosen Strength or Charisma
  const currentSaves = new Set(system.traits?.saves?.value ?? []);
  currentSaves.add(VANGUARD_SAVES.automatic);
  if (validSaves) {
    currentSaves.add(chosenSaves[0]);
  }
  writes["system.traits.saves.value"] = Array.from(currentSaves);

  // Armor: Light Armor, Light Shield
  const currentArmor = new Set(system.traits?.armorProf?.value ?? []);
  for (const prof of VANGUARD_ARMOR_PROFS) currentArmor.add(prof);
  writes["system.traits.armorProf.value"] = Array.from(currentArmor);

  // Weapons: Light Melee
  const currentWeapons = new Set(system.traits?.weaponProf?.value ?? []);
  writes["system.traits.weaponProf.value"] = Array.from(currentWeapons);
  const currentWeaponCustom = String(system.traits?.weaponProf?.custom ?? "").split(/[,;]/).map(value => value.trim()).filter(Boolean);
  if (!currentWeaponCustom.some(value => value.toLowerCase() === "light melee")) currentWeaponCustom.push("Light Melee");
  writes["system.traits.weaponProf.custom"] = currentWeaponCustom.join(", ");

  // D&D5e has no native Light Melee category. Mark only AK5e weapons whose
  // source category is exact; third-party items need a manual proficiency note.
  for (const item of entries(actor.items)) {
    const itemCategory = flag(item, "tableData")?.category ?? item._source?.flags?.ak5e?.tableData?.category;
    if (item.type !== "weapon" || itemCategory !== "Light Melee Weapons" || Number(item.system?.proficient) === 1) continue;
    updateItems.push({ _id: item.id, system: { proficient: 1 } });
  }

  // Tools: Messenger Kit
  writes["system.tools.ak5emessengerkit"] = {
    ...(system.tools?.ak5emessengerkit ?? {}), value: Math.max(1, Number(system.tools?.ak5emessengerkit?.value) || 0),
    ability: system.tools?.ak5emessengerkit?.ability ?? "int"
  };

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
    if (!["fixed", "rolled"].includes(hpChoice.mode) || (n === 1 && hpChoice.mode !== "fixed") ||
        (n === 1 && hpChoice.roll !== undefined && Number(hpChoice.roll) !== 8) ||
        (n > 1 && hpChoice.mode === "fixed" && hpChoice.roll !== undefined && Number(hpChoice.roll) !== 5) ||
        (n > 1 && hpChoice.mode === "rolled" && (!Number.isInteger(Number(hpChoice.roll)) || Number(hpChoice.roll) < 1 || Number(hpChoice.roll) > 8))) {
      pending.push(`hp.${n}`);
      continue;
    }
    if (n === 1) {
      hpIncrease += Math.max(1, 8 + conMod);
    } else {
      const rawRoll = hpChoice.mode === "fixed" ? 5 : Number(hpChoice.roll);
      const rolled = Number.isFinite(rawRoll) ? Math.min(8, Math.max(1, Math.round(rawRoll))) : 5;
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
    if (current + inc > 20) {
      pending.push(`asi.cap.${abl}`);
    } else writes[`system.abilities.${abl}.value`] = current + inc;
  }

  // The shared tool catalogue maps AK5e's custom ID to D&D5e's active tool schema.
  if (choices.tool !== "Messenger Kit") pending.push("tool");

  // Talents
  const existingTalents = entries(actor.items).filter(i => flag(i, "classContentKind") === "class-option");
  const existingIds = new Set(existingTalents.map(i => flag(i, "chapterThreeId")));
  const hasTalentTier = tier => existingTalents.some(item => TALENTS.some(entry => entry.id === flag(item, "chapterThreeId") && entry.classOption.tier.toLowerCase() === tier));
  if (level >= 3 && !choices.talents?.basic && !hasTalentTier("basic")) pending.push("talents.basic");
  if (level >= 8 && !choices.talents?.basicModule && !existingTalents.some(item => flag(item, VANGUARD_TALENT_FLAG)?.tier === "basic" && flag(item, VANGUARD_TALENT_FLAG)?.upgraded)) pending.push("talents.basicModule");
  if (level >= 9 && !choices.talents?.advanced && !hasTalentTier("advanced")) pending.push("talents.advanced");
  if (level >= 13 && !choices.talents?.advancedModule && !existingTalents.some(item => flag(item, VANGUARD_TALENT_FLAG)?.tier === "advanced" && flag(item, VANGUARD_TALENT_FLAG)?.upgraded)) pending.push("talents.advancedModule");
  const talentFor = (id, tier) => id
    ? existingTalents.find(item => flag(item, "chapterThreeId") === id) ?? null
    : existingTalents.find(item => flag(item, VANGUARD_TALENT_FLAG)?.tier === tier) ?? null;

  const grantTalent = (talentId, tier) => {
    if (!talentId || talentId === "upgrade" || existingIds.has(talentId)) return;
    const talentEntry = TALENTS.find(t => t.id === talentId);
    if (talentEntry) {
      const data = sourceData(talentEntry, "talent");
      data.flags.ak5e[VANGUARD_TALENT_FLAG] = { sourceId: talentId, tier };
      createItems.push(data);
      existingIds.add(talentId);
    }
  };

  if (choices.talents?.basic) grantTalent(choices.talents.basic, "basic");
  if (choices.talents?.basicModule && choices.talents.basicModule !== "upgrade") grantTalent(choices.talents.basicModule, "basic");
  if (choices.talents?.advanced) grantTalent(choices.talents.advanced, "advanced");
  if (choices.talents?.advancedModule && choices.talents.advancedModule !== "upgrade") grantTalent(choices.talents.advancedModule, "advanced");

  for (const [key, tier] of [["basic", "basic"], ["basicModule", "basic"], ["advanced", "advanced"], ["advancedModule", "advanced"]]) {
    const selected = choices.talents?.[key];
    if (!selected || selected === "upgrade") continue;
    if (!TALENTS.some(entry => entry.id === selected && entry.classOption.tier.toLowerCase() === tier)) pending.push(`talents.${key}`);
  }
  if (choices.talents?.basicModule && choices.talents.basicModule !== "upgrade" && choices.talents.basicModule === choices.talents.basic) pending.push("talents.basicModule");
  if (choices.talents?.advancedModule && choices.talents.advancedModule !== "upgrade" && choices.talents.advancedModule === choices.talents.advanced) pending.push("talents.advancedModule");

  for (const [tier, key] of [["basic", "basicModule"], ["advanced", "advancedModule"]]) {
    if (choices.talents?.[key] !== "upgrade") continue;
    const selectedId = choices.talents?.[tier] ?? state.choices?.talents?.[tier];
    const item = selectedId ? talentFor(selectedId, tier) : talentFor(null, tier);
    const plannedItem = item ?? (selectedId ? createItems.find(candidate => candidate.flags?.ak5e?.chapterThreeId === selectedId) : null);
    const definition = TALENTS.find(entry => entry.id === (selectedId ?? flag(item, "chapterThreeId")));
    if (!plannedItem || !definition?.classOption?.moduleEffect) {
      pending.push(`talents.${key}`);
      continue;
    }
    const sourceText = String(item?.system?.description?.value ?? plannedItem.system?.description?.value ?? "");
    const moduleText = `<p><strong>Module Effect:</strong> ${definition.classOption.moduleEffect}</p>`;
    if (item) updateItems.push({ _id: item.id,
      [`flags.ak5e.${VANGUARD_TALENT_FLAG}.upgraded`]: true,
      [`flags.ak5e.${VANGUARD_TALENT_FLAG}.moduleEffect`]: definition.classOption.moduleEffect,
      ...(sourceText.includes(definition.classOption.moduleEffect) ? {} : { "system.description.value": `${sourceText}${moduleText}` })
    });
    else {
      plannedItem.flags.ak5e[VANGUARD_TALENT_FLAG].upgraded = true;
      plannedItem.flags.ak5e[VANGUARD_TALENT_FLAG].moduleEffect = definition.classOption.moduleEffect;
      if (!sourceText.includes(definition.classOption.moduleEffect)) plannedItem.system.description.value = `${sourceText}${moduleText}`;
    }
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

export async function applyVanguardProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
  need(confirmed === true, "Confirm the previewed Vanguard progression first.");
  const plan = await previewVanguardProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview Vanguard progression again.");
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

  // Mark granted levels as existing in saved state
  for (const n of hpLevelsGranted) {
    state.choices.hp[n] = { mode: "existing" };
  }
  for (const n of asiLevelsGranted) {
    state.choices.asi[n] = { mode: "existing" };
  }
  if (!state.startingEquipmentGranted && (plan.choices.startingEquipment?.mode === "items" || plan.choices.startingEquipment?.mode === "cash")) {
    state.startingEquipmentGranted = true;
  }
  if (state.startingEquipmentGranted) {
    state.choices.startingEquipment = { mode: "existing" };
  }

  // Apply writes to actor
  const updates = {
    ...plan.writes,
    [`flags.ak5e.${VANGUARD_PROGRESS_FLAG}`]: state
  };
  // Reconcile missing stable IDs before committing completion state. A retry
  // after partial failure will find created source Items and not duplicate them.
  const managedCounts = new Map();
  for (const item of entries(actor.items)) {
    const grant = flag(item, "vanguardProgressionGrant");
    if (!grant?.sourceId) continue;
    const key = `${grant.kind}:${grant.sourceId}`;
    managedCounts.set(key, (managedCounts.get(key) ?? 0) + 1);
  }
  const desiredCounts = new Map(), missingItems = [];
  for (const item of plan.createItems) {
    const grant = item.flags?.ak5e?.vanguardProgressionGrant;
    const source = grant?.sourceId ?? item.flags?.ak5e?.chapterThreeId ?? item.flags?.ak5e?.chapterFourId;
    const key = `${grant?.kind ?? "feature"}:${source}`;
    const desired = (desiredCounts.get(key) ?? 0) + 1;
    desiredCounts.set(key, desired);
    if (desired > (managedCounts.get(key) ?? 0)) missingItems.push(item);
  }
  if (missingItems.length) await actor.createEmbeddedDocuments("Item", missingItems);
  if (plan.updateItems.length) await actor.updateEmbeddedDocuments("Item", plan.updateItems);
  await actor.update(updates);

  return {
    success: true,
    level: plan.level,
    updatedFields: Object.keys(plan.writes),
    created: plan.createItems.map(c => c.name)
  };
}
