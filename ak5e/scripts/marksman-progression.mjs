/**
 * Previewed Marksman progression. Existing HP and ability scores are treated as
 * already containing prior class gains; only explicitly selected new gains are
 * added. Choices and applied level receipts make retries idempotent.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import {
  FIGHTING_STYLES, marksmanProfile, flag as marksmanFlag
} from "./marksman-rules.mjs";
import { need } from "./operation-kernel.mjs";

export const MARKSMAN_PROGRESS_FLAG = "marksmanProgression";
export const MARKSMAN_TALENT_FLAG = "marksmanTalent";

const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);
const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const SKILLS = Object.freeze([
  ["Acrobatics", "acr"], ["Athletics", "ath"], ["Perception", "prc"],
  ["Sleight of Hand", "slt"], ["Stealth", "ste"], ["Wilderness", "ak5ewilderness"]
]);
const SAVES = Object.freeze([["Dexterity", "dex"], ["Wisdom", "wis"], ["Charisma", "cha"]]);
const TOOLS = Object.freeze([
  "Maintenance Kit", "Art Kit", "Brewing Kit", "Cooking Kit", "Engineering Kit", "Makeup Kit",
  "Mechanism Kit", "Medical Kit", "Messenger Kit", "Pharmacology Kit", "Tailoring Kit", "Woodwork Kit",
  "Land Vehicles", "Vehicles (Drones)"
]);
const TALENTS = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-option" && entry.parentClass === "Marksman" && entry.classOption?.category === "talent");
const STYLES = Object.entries(FIGHTING_STYLES);
const STYLE_NAMES = new Set(["Braced for Action", "Close and Personal", "Cone of Fire", "Deadly Fighter", "Defensive", "Ranger", "Smooth Operator", "Two-Weapon Fighting"]);
const STYLE_ENTRIES = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-feature" && entry.parentClass === "Marksman" && STYLE_NAMES.has(entry.name));
const EQUIPMENT = CHAPTER_FOUR_EQUIPMENT;
const DEFAULT_STATE = Object.freeze({ version: 2, choices: {}, hpLevels: [], asiLevels: [], hpGains: {}, asiGains: {} });
const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};
const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });
const normalizedName = value => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const toolKey = name => `ak5e${normalizedName(name)}`;
const mergeCustom = (current, values) => [...new Set([...(String(current ?? "").split(";").map(v => v.trim()).filter(Boolean)), ...values])].join("; ");
const sourceId = item => flag(item, "chapterThreeId") ?? flag(item, "chapterFourId");
const actorItems = actor => entries(actor?.items);
const worldItem = id => entries(globalThis.game?.items).find(item => sourceId(item) === id) ?? null;
function canonicalStyle(value) {
  if (value == null) return null;
  const match = STYLES.find(([key, style]) => key === value || style.id === value || style.name === value);
  return match?.[1].id ?? value;
}
function generatedItem(entry) {
  const existing = worldItem(entry.id);
  const data = existing?.toObject ? existing.toObject() : existing ? structuredClone(existing) : {
    name: entry.name, type: entry.itemType, img: "icons/svg/book.svg",
    system: { ...(entry.systemData ?? {}), description: { value: entry.content ?? "", chat: "" } },
    flags: { ak5e: {} }
  };
  delete data._id; delete data.id; delete data.folder; delete data.sort;
  data.flags ??= {}; data.flags.ak5e ??= {};
  if (["weapon", "equipment", "tool", "loot", "magic-item", "tool-rule", "gear-rule"].includes(entry.kind)) {
    delete data.flags.ak5e.chapterThreeId;
    delete data.flags.ak5e.classContentKind;
    delete data.flags.ak5e.parentClass;
    data.flags.ak5e = { ...data.flags.ak5e, chapterFourId: entry.id, equipmentKind: entry.kind, sourceHeading: entry.sourceHeading,
      sourceFile: "04_chapter_4_equipment.txt", tableData: entry.tableData, rawSource: entry.rawSource };
  } else {
    data.flags.ak5e = { ...data.flags.ak5e, chapterThreeId: entry.id, classContentKind: entry.kind, parentClass: entry.parentClass,
      parentBranch: entry.parentBranch, classLevel: entry.level, sourceHeading: entry.sourceHeading,
      sourceFile: "03_chapter_3_character_classes.txt", ...(entry.classOption ? { classOption: entry.classOption } : {}), rawSource: entry.rawSource };
  }
  if (entry.kind === "class-option" && data.system?.description) data.system.description.value = entry.content ?? data.system.description.value;
  return data;
}

function readState(actor) {
  const stored = flag(actor, MARKSMAN_PROGRESS_FLAG) ?? {};
  // Version 1 persisted selected ASIs after adding them, but never filled asiLevels.
  // Those known-applied choices must not be added a second time during migration.
  const legacyAsi = stored.version === 1 ? stored.choices?.asi ?? {} : {};
  const legacyLevels = Object.keys(legacyAsi).map(Number).filter(level => ASI_LEVELS.includes(level));
  return {
    ...structuredClone(DEFAULT_STATE), ...structuredClone(stored),
    choices: structuredClone(stored.choices ?? {}),
    hpLevels: [...(stored.hpLevels ?? [])], asiLevels: [...new Set([...(stored.asiLevels ?? []), ...legacyLevels])],
    hpGains: { ...(stored.hpGains ?? {}) }, asiGains: { ...legacyAsi, ...(stored.asiGains ?? {}) }
  };
}

function selectedChoices(actor, supplied = {}) {
  const saved = readState(actor).choices;
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = Array.isArray(supplied.skills) ? [...supplied.skills] : [...(saved.skills ?? [])];
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.fightingStyle = canonicalStyle(supplied.fightingStyle ?? saved.fightingStyle ?? null);
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.equipment = { ...(saved.equipment ?? {}), ...(supplied.equipment ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  result.save = supplied.save ?? saved.save ?? null;
  result.tool = supplied.tool ?? saved.tool ?? null;
  return result;
}

function equipmentChoices(group) {
  return EQUIPMENT.filter(entry => {
    const category = entry.tableData?.category;
    if (group === "ranged") return entry.kind === "weapon" && ["Light Ranged Weapons", "Heavy Ranged Weapons"].includes(category) || entry.id === "weapon-grenade-launcher-12";
    if (group === "melee") return entry.kind === "weapon" && category === "Light Melee Weapons" || entry.kind === "equipment" && category === "Light Shields";
    if (group === "armour") return entry.kind === "equipment" && ["Protective Clothing", "Underarmour"].includes(entry.name);
    if (group === "tool") return entry.kind === "tool" && TOOLS.includes(entry.name);
    return false;
  }).map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
}

function talentChoices(tier, exclude = null) {
  return TALENTS.filter(entry => entry.classOption.tier.toLowerCase() === tier && entry.id !== exclude)
    .map(entry => option(entry.id, entry.name, { sourceId: entry.id, effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect }));
}

/** Choice descriptors consumed by the Marksman progression sheet. */
export function marksmanProgressionChoices(actor, choices = {}) {
  const view = inspectMarksmanFields(actor, choices);
  if (!view.applicable) return { applicable: false, fields: [] };
  const selected = view.choices, fields = [
    field("skills", "Choose three Marksman skills", SKILLS.map(([name, key]) => option(key, name)), 3, selected.skills),
    field("save", "Choose one additional Saving Throw proficiency", SAVES.slice(1).map(([name, key]) => option(key, name)), 1, selected.save),
    field("tool", "Choose a Tool Kit or Vehicle proficiency", TOOLS.map(name => option(name, name)), 1, selected.tool),
    field("fightingStyle", "Choose a Marksman Fighting Style", STYLE_ENTRIES.map(entry => option(entry.id, entry.name, {
      sourceId: entry.id, effect: STYLES.find(([, style]) => style.id === entry.id)?.[1].description
    })), 1, selected.fightingStyle),
    field("startingEquipment.mode", "Starting equipment or 1300 LMD", [option("items", "Choose starting equipment"), option("cash", "1300 LMD")], 1, selected.startingEquipment.mode)
  ];
  if (selected.startingEquipment.mode === "items") {
    fields.push(field("startingEquipment.ranged", "Choose a Light Ranged Weapon, Heavy Ranged Weapon, or Grenade Launcher", equipmentChoices("ranged"), 1, selected.startingEquipment.ranged));
    fields.push(field("startingEquipment.melee", "Choose a Light Melee Weapon or Light Shield", equipmentChoices("melee"), 1, selected.startingEquipment.melee));
    fields.push(field("startingEquipment.armour", "Choose Protective Clothing or Underarmour", equipmentChoices("armour"), 1, selected.startingEquipment.armour));
    fields.push(field("startingEquipment.toolkit", "Choose one Tool Kit you are proficient with", equipmentChoices("tool"), 1, selected.startingEquipment.toolkit));
  }
  const savedTalent = selected.talents ?? {};
  if (view.level >= 3) fields.push(field("talents.basic", "Choose one Basic Marksman Talent", talentChoices("basic"), 1, savedTalent.basic));
  if (view.level >= 8 && savedTalent.basic) fields.push(field("talents.basicAt8", "At level 8, upgrade it or gain a different Basic Talent", [
    option({ mode: "upgrade", sourceId: savedTalent.basic }, "Upgrade the chosen Basic Talent with its Module Effect"),
    ...talentChoices("basic", savedTalent.basic).map(entry => option({ mode: "new", sourceId: entry.value }, `Gain another Basic Talent: ${entry.label}`, entry))
  ], 1, savedTalent.basicAt8));
  if (view.level >= 9) fields.push(field("talents.advanced", "Choose one Advanced Marksman Talent", talentChoices("advanced"), 1, savedTalent.advanced));
  if (view.level >= 13 && savedTalent.advanced) fields.push(field("talents.advancedAt13", "At level 13, upgrade it or gain a different Advanced Talent", [
    option({ mode: "upgrade", sourceId: savedTalent.advanced }, "Upgrade the chosen Advanced Talent with its Module Effect"),
    ...talentChoices("advanced", savedTalent.advanced).map(entry => option({ mode: "new", sourceId: entry.value }, `Gain another Advanced Talent: ${entry.label}`, entry))
  ], 1, savedTalent.advancedAt13));
  for (const n of view.asiLevels) fields.push(field(`asi.${n}`, `Choose level ${n} Ability Score Improvement`, [option({ mode: "existing" }, "Already included"), ...ABILITIES.map(ability => option({ [ability]: 2 }, `+2 ${ability.toUpperCase()}`)),
    ...ABILITIES.flatMap((a, i) => ABILITIES.slice(i + 1).map(b => option({ [a]: 1, [b]: 1 }, `+1 ${a.toUpperCase()} and +1 ${b.toUpperCase()}`)))], 1, selected.asi[n] ?? { mode: "existing" }, n));
  for (let n = 1; n <= view.level; n++) fields.push(field(`hp.${n}`, `Choose Hit Point gain for level ${n}`, n === 1
    ? [option({ mode: "existing" }, "Already included"), option({ mode: "fixed", roll: 8 }, "Fixed 8 + Constitution modifier")]
    : [option({ mode: "existing" }, "Already included"), option({ mode: "fixed", roll: 5 }, "Fixed average (5)"), ...Array.from({ length: 8 }, (_, i) => option({ mode: "rolled", roll: i + 1 }, `d8 result: ${i + 1}`))], 1, selected.hp[n] ?? { mode: "existing" }, n));
  return { applicable: true, level: view.level, branch: view.branch, choices: selected, fields };
}

export function inspectMarksmanFields(actor, choices = {}) {
  const profile = marksmanProfile(actor);
  if (!profile.applicable) return { applicable: false };
  const level = profile.level ?? 1, selected = selectedChoices(actor, choices);
  return {
    applicable: true, level, branch: profile.branch, configured: Boolean(readState(actor).choices),
    skills: SKILLS, saves: SAVES, tools: TOOLS,
    fightingStyles: STYLES.map(([key, style]) => ({ key, id: style.id, name: style.name, description: style.description })),
    talents: TALENTS.map(t => ({ id: t.id, name: t.name, tier: t.classOption?.tier, category: t.classOption?.category })),
    asiLevels: ASI_LEVELS.filter(l => l <= level), choices: selected,
    manualInstructions: manualInstructions(level, profile.branch)
  };
}

function manualInstructions(level, branch) {
  const instructions = [
    "The selected Fighting Style and Talents are granted as source-ID feature Items. Their source text is visible on the Item; effects without a dedicated module workflow remain manual.",
    "Choose three different Marksman class skills from Acrobatics, Athletics, Perception, Sleight of Hand, Stealth, and Wilderness; apply any skill proficiency not shown in the progression preview.",
    "Choose one Tool Kit or Vehicle proficiency. The proficiency is applied; a selected Tool Kit Item is added only when taking the starting-equipment option, and vehicle proficiencies do not add inventory.",
    "Starting equipment choice: choose a Light Ranged Weapon, Heavy Ranged Weapon, or Grenade Launcher; a Light Melee Weapon or Light Shield; Protective Clothing or Underarmour; and one Tool Kit you are proficient with. Alternatively receive 1300 LMD. Background equipment is separate."
  ];
  if (branch === "artilleryman") instructions.push("Artilleryman gains Grenade Launcher and Rocket Launcher proficiency automatically. Add selected starting equipment separately; the branch does not grant both launchers as inventory.");
  if (level >= 3) instructions.push("At 3rd level choose a Basic Marksman Talent. At 8th level either add a different Basic Talent or activate the chosen Talent's Module Effect.");
  if (level >= 9) instructions.push("At 9th level choose an Advanced Marksman Talent. At 13th level either add a different Advanced Talent or activate the chosen Talent's Module Effect.");
  return instructions;
}

function validateChoices(choices, level, state, current, warnings) {
  const allowedSkills = new Set(SKILLS.map(([, key]) => key));
  if (choices.skills.some(key => !allowedSkills.has(key))) throw new Error("Choose skills from the Marksman skill list.");
  if (new Set(choices.skills).size !== choices.skills.length) throw new Error("Choose each Marksman skill only once.");
  if (choices.skills.length !== 3) warnings.push(`The Marksman class grants three skill proficiencies; ${choices.skills.length} are selected. Confirm any table-rule change.`);
  if (choices.save != null && !["wis", "cha"].includes(choices.save)) throw new Error("Choose Wisdom or Charisma as the additional saving throw proficiency.");
  if (!choices.save) warnings.push("Choose Wisdom or Charisma for the Marksman's additional saving throw proficiency.");
  if (choices.tool != null && !TOOLS.includes(choices.tool)) throw new Error("Choose a listed Tool Kit or Vehicle proficiency.");
  if (!choices.tool) warnings.push("Choose a Tool Kit or Vehicle proficiency.");
  if (choices.fightingStyle != null && !STYLE_ENTRIES.some(entry => entry.id === choices.fightingStyle)) throw new Error("Choose a source-listed Marksman Fighting Style.");
  if (!choices.fightingStyle) warnings.push("Choose one Marksman Fighting Style.");
  if (state.choices.fightingStyle && choices.fightingStyle !== canonicalStyle(state.choices.fightingStyle)) throw new Error("The selected Fighting Style is already recorded and cannot be replaced.");

  const starting = choices.startingEquipment;
  if (starting.mode != null && !["items", "cash"].includes(starting.mode)) throw new Error("Choose starting equipment or 1300 LMD.");
  if (!starting.mode) warnings.push("Choose starting equipment or 1300 LMD.");
  if (state.choices.startingEquipment?.mode && JSON.stringify(starting) !== JSON.stringify(state.choices.startingEquipment)) throw new Error("Starting equipment choices are already recorded and cannot be changed.");
  if (starting.mode === "items") {
    const groups = { ranged: "ranged", melee: "melee", armour: "armour", toolkit: "tool" };
    for (const [key, group] of Object.entries(groups)) {
      const selected = starting[key];
      if (selected == null) { warnings.push(`Choose starting ${key} equipment.`); continue; }
      if (!equipmentChoices(group).some(entry => entry.value === selected)) throw new Error(`Choose a valid source-listed starting ${key} item.`);
    }
    if (starting.toolkit) {
      const selectedTool = EQUIPMENT.find(entry => entry.id === starting.toolkit);
      if (selectedTool?.name !== choices.tool && Number(current.tools?.[toolKey(selectedTool?.name)]?.value ?? 0) < 1)
        warnings.push(`You selected ${selectedTool?.name}, but the character is not recorded as proficient with it; confirm this table-rule override.`);
    }
  }

  const recordedTalents = state.choices.talents ?? {};
  for (const [tier, key, unlock, moduleKey, moduleLevel] of [["basic", "basic", 3, "basicAt8", 8], ["advanced", "advanced", 9, "advancedAt13", 13]]) {
    const chosen = choices.talents[key];
    if (level < unlock && chosen) throw new Error(`${tier} Marksman Talent is not available before level ${unlock}.`);
    if (chosen && !TALENTS.some(entry => entry.id === chosen && entry.classOption.tier.toLowerCase() === tier)) throw new Error(`Choose a source-listed ${tier} Marksman Talent.`);
    if (recordedTalents[key] && chosen && chosen !== recordedTalents[key]) throw new Error(`The original ${tier} Talent choice is already recorded and cannot be replaced.`);
    if (level >= unlock && !chosen) warnings.push(`Choose one ${tier} Marksman Talent.`);
    const advanced = choices.talents[moduleKey];
    if (level < moduleLevel && advanced) throw new Error(`${tier} Talent upgrade is not available before level ${moduleLevel}.`);
    if (advanced && (!chosen || !["upgrade", "new"].includes(advanced.mode) || advanced.mode === "upgrade" && advanced.sourceId !== chosen ||
      advanced.mode === "new" && (!TALENTS.some(entry => entry.id === advanced.sourceId && entry.classOption.tier.toLowerCase() === tier) || advanced.sourceId === chosen)))
      throw new Error(`Choose a valid ${tier} Talent Module upgrade or different Talent.`);
    if (level >= moduleLevel && chosen && !advanced) warnings.push(`Choose the level ${moduleLevel} ${tier} Talent upgrade or different Talent.`);
    if (recordedTalents[moduleKey] && advanced && JSON.stringify(advanced) !== JSON.stringify(recordedTalents[moduleKey])) throw new Error(`The level ${moduleLevel} ${tier} Talent choice is already recorded and cannot be changed.`);
  }

  const abilityIncreases = {};
  for (const n of ASI_LEVELS.filter(value => value <= level)) {
    const choice = choices.asi[n] ?? choices.asi[String(n)];
    if (state.asiLevels.includes(n)) {
      if (choice != null && JSON.stringify(choice) !== JSON.stringify(state.asiGains[n])) warnings.push(`The level ${n} ASI was already applied; its recorded choice is retained.`);
      continue;
    }
    if (choice == null) { warnings.push(`Choose the level ${n} Ability Score Improvement or mark it already included.`); continue; }
    if (choice?.mode === "existing") continue;
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) throw new Error(`Invalid Ability Score Improvement at level ${n}.`);
    const pairs = Object.entries(choice);
    if (!pairs.length || pairs.some(([ability, amount]) => !ABILITIES.includes(ability) || !Number.isInteger(amount) || amount < 1)) throw new Error(`Invalid Ability Score Improvement at level ${n}.`);
    const budget = pairs.reduce((sum, [, amount]) => sum + amount, 0);
    if (budget !== 2) warnings.push(`Level ${n} ASI spends ${budget} points; the printed budget is 2. Confirm this table-rule override.`);
    for (const [ability, amount] of pairs) abilityIncreases[ability] = (abilityIncreases[ability] ?? 0) + amount;
  }
  for (const [ability, amount] of Object.entries(abilityIncreases)) {
    const before = Number(current.abilities?.[ability]?.value ?? 10);
    if (before + amount > 20) warnings.push(`${ability.toUpperCase()} would become ${before + amount}, above the printed maximum of 20. Confirm this table-rule override.`);
  }

  for (let n = 1; n <= level; n++) {
    if (state.hpLevels.includes(n)) continue;
    const choice = choices.hp[n] ?? choices.hp[String(n)];
    if (choice == null || choice?.mode === "existing") continue;
    const roll = typeof choice === "number" ? choice : choice?.roll;
    if (!Number.isInteger(roll) || roll < 1 || roll > 8 || n === 1 && roll !== 8 || choice?.mode === "fixed" && n > 1 && roll !== 5) throw new Error(`Invalid Marksman Hit Point gain at level ${n}; use 8 at 1st level, fixed 5, or a d8 result from 1 to 8.`);
    if (choice?.mode && !["fixed", "rolled"].includes(choice.mode)) throw new Error(`Invalid Marksman Hit Point choice at level ${n}.`);
  }
  return abilityIncreases;
}

/** Pure preview of Marksman progression. Does not mutate the Actor. */
export async function previewMarksmanProgression(actor, proposedChoices = {}) {
  const profile = marksmanProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Marksman class.");
  const level = profile.level ?? 1, state = readState(actor), current = sourceSystem(actor);
  const choices = selectedChoices(actor, proposedChoices), warnings = [], pending = [];
  const abilityIncreases = validateChoices(choices, level, state, current, warnings);
  if (choices.skills.length !== 3) pending.push("skills");
  if (!choices.save) pending.push("save");
  if (!choices.tool) pending.push("tool");
  if (!choices.fightingStyle) pending.push("fightingStyle");
  if (!choices.startingEquipment.mode) pending.push("startingEquipment.mode");
  if (choices.startingEquipment.mode === "items") for (const key of ["ranged", "melee", "armour", "toolkit"]) if (!choices.startingEquipment[key]) pending.push(`startingEquipment.${key}`);
  for (const [tier, unlock, moduleKey, moduleLevel] of [["basic", 3, "basicAt8", 8], ["advanced", 9, "advancedAt13", 13]]) {
    if (level >= unlock && !choices.talents[tier]) pending.push(`talents.${tier}`);
    if (level >= moduleLevel && choices.talents[tier] && !choices.talents[moduleKey]) pending.push(`talents.${moduleKey}`);
  }
  for (const n of ASI_LEVELS.filter(value => value <= level && !state.asiLevels.includes(value))) if (choices.asi[n] == null) pending.push(`asi.${n}`);
  for (let n = 1; n <= level; n++) if (!state.hpLevels.includes(n) && choices.hp[n] == null) pending.push(`hp.${n}`);

  const actorUpdates = {};
  for (const skill of choices.skills) actorUpdates[`system.skills.${skill}.value`] = Math.max(1, Number(current.skills?.[skill]?.value ?? 0));
  if (!Number(current.abilities?.dex?.proficient)) actorUpdates["system.abilities.dex.proficient"] = 1;
  if (choices.save && !Number(current.abilities?.[choices.save]?.proficient)) actorUpdates[`system.abilities.${choices.save}.proficient`] = 1;

  const armor = new Set(current.traits?.armorProf?.value ?? []);
  armor.add("lgt"); armor.add("med");
  actorUpdates["system.traits.armorProf.value"] = [...armor];
  actorUpdates["system.traits.armorProf.custom"] = mergeCustom(current.traits?.armorProf?.custom, ["Light Shields"]);
  const weaponNotes = ["Light Melee", "Light Ranged", "Heavy Ranged"];
  if (profile.branch === "artilleryman") weaponNotes.push("Grenade Launcher", "Rocket Launcher");
  actorUpdates["system.traits.weaponProf.custom"] = mergeCustom(current.traits?.weaponProf?.custom, weaponNotes);

  for (const [ability, increase] of Object.entries(abilityIncreases)) {
    const base = Number(current.abilities?.[ability]?.value ?? 10);
    actorUpdates[`system.abilities.${ability}.value`] = base + increase;
  }

  let totalHpGain = 0;
  const hpDetail = [];
  const conMod = Number(current.abilities?.con?.mod ?? Math.floor((Number(current.abilities?.con?.value ?? 10) - 10) / 2));
  for (let n = 1; n <= level; n++) {
    const choice = choices.hp[n] ?? choices.hp[String(n)];
    if (state.hpLevels.includes(n) || choice == null || choice?.mode === "existing") {
      hpDetail.push({ level: n, included: true, gain: 0 });
      continue;
    }
    const roll = typeof choice === "number" ? choice : choice.roll;
    const hp = Math.max(1, roll + conMod);
    totalHpGain += hp;
    hpDetail.push({ level: n, roll, hp, included: false });
  }
  if (totalHpGain) actorUpdates["system.attributes.hp.max"] = Number(current.attributes?.hp?.max ?? 0) + totalHpGain;

  if (choices.tool) {
    const key = toolKey(choices.tool), existing = current.tools?.[key] ?? {};
    const configuredAbility = globalThis.CONFIG?.DND5E?.tools?.[key]?.ability ?? existing.ability;
    const toolData = { ...existing, value: Math.max(1, Number(existing.value) || 0) };
    if (!existing.ability && configuredAbility) toolData.ability = configuredAbility;
    actorUpdates[`system.tools.${key}`] = toolData;
  }

  const createItems = [], updateItems = [];
  const enqueue = (entry, marker) => {
    if (!entry) return;
    const existing = actorItems(actor).find(item => sourceId(item) === entry.id);
    if (existing) {
      const previous = flag(existing, marker.key);
      if (JSON.stringify(previous) !== JSON.stringify(marker.value)) updateItems.push({ _id: existing.id ?? existing._id, [`flags.ak5e.${marker.key}`]: marker.value });
      return;
    }
    const data = generatedItem(entry);
    data.flags.ak5e[marker.key] = marker.value;
    createItems.push(data);
  };
  const styleEntry = STYLE_ENTRIES.find(entry => entry.id === choices.fightingStyle);
  if (styleEntry) enqueue(styleEntry, { key: "marksmanProgressionGrant", value: { kind: "fightingStyle", sourceId: styleEntry.id } });
  const selectedTalents = [];
  for (const tier of ["basic", "advanced"]) {
    const originalId = choices.talents[tier];
    if (!originalId) continue;
    const moduleChoice = choices.talents[tier === "basic" ? "basicAt8" : "advancedAt13"];
    const active = moduleChoice?.mode === "upgrade";
    selectedTalents.push({ tier, sourceId: originalId, moduleActive: active });
    if (moduleChoice?.mode === "new") selectedTalents.push({ tier, sourceId: moduleChoice.sourceId, moduleActive: false });
    for (const selection of selectedTalents.filter(item => item.tier === tier)) {
      const entry = TALENTS.find(row => row.id === selection.sourceId);
      enqueue(entry, { key: "marksmanTalent", value: { sourceId: selection.sourceId, tier, moduleActive: selection.moduleActive, active: true } });
      if (entry) {
        const already = actorItems(actor).find(item => sourceId(item) === entry.id);
        if (!already) {
          const data = createItems.at(-1);
          if (data) data.flags.ak5e.marksmanProgressionGrant = { kind: "talent", sourceId: entry.id };
        }
      }
    }
  }
  if (choices.startingEquipment.mode === "items") {
    for (const key of ["ranged", "melee", "armour", "toolkit"]) {
      const entry = EQUIPMENT.find(row => row.id === choices.startingEquipment[key]);
      if (!entry) continue;
      const existing = actorItems(actor).find(item => sourceId(item) === entry.id);
      if (!existing) {
        const data = generatedItem(entry);
        data.flags.ak5e.marksmanProgressionGrant = { kind: "startingEquipment", sourceId: entry.id };
        createItems.push(data);
      }
    }
  } else if (choices.startingEquipment.mode === "cash" && !state.cashGranted) {
    actorUpdates["system.currency.cp"] = Number(current.currency?.cp ?? 0) + 1300;
  }
  const styleKey = STYLES.find(([, style]) => style.id === choices.fightingStyle)?.[0] ?? null;
  if (choices.startingEquipment.mode === "cash") warnings.push("1300 LMD is stored as 1300 D&D5e copper pieces (1 CP = 1 LMD); existing currency is preserved.");
  const selectedToolKey = choices.tool ? toolKey(choices.tool) : null;
  if (selectedToolKey && !globalThis.CONFIG?.DND5E?.tools?.[selectedToolKey]?.ability && !current.tools?.[selectedToolKey]?.ability)
    warnings.push(`No configured ability was found for ${choices.tool}; its proficiency is recorded, and the GM should confirm the check ability.`);

  const contextKey = JSON.stringify({
    actor: actor.uuid, level, branch: profile.branch, choices,
    current: {
      hp: current.attributes?.hp?.max,
      abilities: current.abilities,
      skills: current.skills,
      tools: current.tools,
      traits: current.traits,
      currency: current.currency
    },
    state: { hpLevels: state.hpLevels, asiLevels: state.asiLevels, hpGains: state.hpGains, asiGains: state.asiGains, choices: state.choices, cashGranted: state.cashGranted },
    items: actorItems(actor).map(item => item.toObject ? item.toObject() : item),
    actorUpdates, createItems, updateItems, styleKey
  });

  return {
    version: 2, level, branch: profile.branch, choices, pending, hpDetail, totalHpGain,
    actorUpdates, createItems, updateItems, selectedTalents, styleKey, warnings, manualInstructions: manualInstructions(level, profile.branch), contextKey
  };
}

export async function applyMarksmanProgression(actor, { confirmed, choices = {}, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Marksman progression first.");
  const plan = await previewMarksmanProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character or selected values changed since the preview; preview the Marksman progression again.");
  need(!plan.pending.length, `Complete every Marksman progression choice first: ${plan.pending.join(", ")}.`);

  const state = readState(actor);
  state.choices = structuredClone(plan.choices);
  for (const row of plan.hpDetail) {
    if (!state.hpLevels.includes(row.level)) state.hpLevels.push(row.level);
    if (row.roll != null) state.hpGains[row.level] = row.hp;
  }
  for (const n of ASI_LEVELS.filter(value => value <= plan.level)) {
    const choice = plan.choices.asi[n] ?? plan.choices.asi[String(n)];
    if (choice == null || state.asiLevels.includes(n)) continue;
    state.asiLevels.push(n);
    state.asiGains[n] = structuredClone(choice);
  }
  state.hpLevels.sort((a, b) => a - b);
  state.asiLevels.sort((a, b) => a - b);
  if (plan.choices.startingEquipment.mode === "cash") state.cashGranted = true;
  await actor.update({
    ...plan.actorUpdates,
    [`flags.ak5e.${MARKSMAN_PROGRESS_FLAG}`]: state,
    "flags.ak5e.marksman.enabled": true,
    ...(plan.styleKey ? { "flags.ak5e.marksman.fightingStyle": plan.styleKey } : {})
  });
  if (plan.createItems.length) {
    for (const item of plan.createItems) {
      if (actorItems(actor).some(existing => sourceId(existing) === sourceId({ flags: item.flags }) || flag(existing, "marksmanProgressionGrant")?.sourceId === item.flags?.ak5e?.marksmanProgressionGrant?.sourceId)) continue;
      const created = await actor.createEmbeddedDocuments?.("Item", [item]);
      if (actor.createEmbeddedDocuments && (!created || created.length !== 1)) throw new Error(`Could not add ${item.name}; retry the same Marksman progression to resume.`);
      if (!actor.createEmbeddedDocuments) actor.items = [...actorItems(actor), item];
    }
  }
  if (plan.updateItems.length && actor.updateEmbeddedDocuments) await actor.updateEmbeddedDocuments("Item", plan.updateItems);
  return { success: true, level: plan.level, maxHpGain: plan.totalHpGain, warnings: plan.warnings, manualInstructions: plan.manualInstructions };
}
