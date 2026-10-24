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
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.vanguardProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
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
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  if (state.startingEquipmentGranted && !supplied.startingEquipment?.mode) {
    result.startingEquipment.mode = "existing";
  }
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.branch = supplied.branch ?? saved.branch ?? null;
  result.tool = supplied.tool ?? saved.tool ?? "Messenger Kit";

  const level = levelOf(vanguardClass(actor));
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
  return JSON.stringify([
    actor.uuid,
    profile.level,
    profile.branch,
    choices.branch,
    choices.saves,
    choices.skills,
    choices.tool,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents
  ]);
}

/** Pure preview of Vanguard progression. Writes nothing. */
export async function previewVanguardProgression(actor, suppliedChoices = {}) {
  const profile = vanguardProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Vanguard class.");
  const level = profile.level;
  const choices = vanguardChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);

  const state = readState(actor);
  const alreadyGrantedEquipment = Boolean(state.startingEquipmentGranted || choices.startingEquipment?.mode === "existing");

  // Validate branch
  if (!attachedBranch && !choices.branch) pending.push("branch");

  // Validate saves: Dexterity is automatic; exactly 1 choice from ["str", "cha"]
  const allowedSaves = VANGUARD_SAVES.choices.map(([_, key]) => key);
  const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
  const validSaves = chosenSaves.length === 1 && allowedSaves.includes(chosenSaves[0]);
  if (!validSaves) {
    pending.push("saves");
  }

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
    if (!choices.startingEquipment?.mode) pending.push("startingEquipment.mode");
    else if (choices.startingEquipment.mode === "items") {
      if (!choices.startingEquipment.weapon1) pending.push("startingEquipment.weapon1");
      if (!choices.startingEquipment.weapon2) pending.push("startingEquipment.weapon2");
      if (!choices.startingEquipment.armour) pending.push("startingEquipment.armour");
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
  currentWeapons.add("sim"); // light melee categorized under simple/martial or custom
  writes["system.traits.weaponProf.value"] = Array.from(currentWeapons);

  // Tools: Messenger Kit
  const currentTools = new Set(system.traits?.toolProf?.value ?? []);
  currentTools.add("messenger");
  writes["system.traits.toolProf.value"] = Array.from(currentTools);

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
      data.flags.ak5e[VANGUARD_TALENT_FLAG] = { sourceId: talentId, tier };
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
  await actor.update(updates);

  // Create embedded items
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
