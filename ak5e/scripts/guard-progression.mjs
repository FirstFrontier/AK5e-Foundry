/** Native, previewed Guard character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in defender-progression.mjs.
 * Pure and previewed: opening or inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  GUARD_CLASS_ID, GUARD_BRANCH_IDS, FIGHTING_STYLES, checkLevel, guardProfile,
  guardState, flag as guardFlag
} from "./guard-rules.mjs";
import { WEAPONMASTER_FIGHTING_STYLES } from "./weaponmaster-features.mjs";
import { need } from "./operation-kernel.mjs";

export const GUARD_PROGRESS_FLAG = "guardProgression";
export const GUARD_TALENT_FLAG = "guardTalent";

const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

const SKILLS = Object.freeze([
  ["Acrobatics", "acr"],
  ["Athletics", "ath"],
  ["Lore", "ak5elore"],
  ["Insight", "ins"],
  ["Intimidation", "itm"],
  ["Wilderness", "ak5ewilderness"]
]);

const SAVES = Object.freeze([
  ["Constitution", "con"],
  ["Dexterity", "dex"]
]);

const TOOLS = Object.freeze([
  "Maintenance Kit", "Art Kit", "Brewing Kit", "Cooking Kit", "Engineering Kit", "Makeup Kit",
  "Mechanism Kit", "Medical Kit", "Messenger Kit", "Pharmacology Kit", "Tailoring Kit", "Woodwork Kit"
]);

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-option" && entry.parentClass === "Guard" && entry.classOption?.category === "talent");
const EQUIPMENT = CHAPTER_FOUR_EQUIPMENT;

const DEFAULT_STATE = Object.freeze({
  version: 1,
  choices: {},
  hpLevels: [],
  asiLevels: [],
  operations: [],
  receipts: {},
  plans: {}
});

const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};

function readState(actor) {
  const stored = flag(actor, GUARD_PROGRESS_FLAG) ?? {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...structuredClone(stored),
    choices: structuredClone(stored.choices ?? {}),
    hpLevels: [...(stored.hpLevels ?? [])],
    asiLevels: [...(stored.asiLevels ?? [])],
    operations: [...(stored.operations ?? [])],
    receipts: { ...(stored.receipts ?? {}) },
    plans: { ...(stored.plans ?? {}) }
  };
}

function classItems(actor) {
  return entries(actor?.items).filter(item => item.type === "class");
}

function guardClass(actor) {
  return classItems(actor).find(item => flag(item, "chapterThreeId") === GUARD_CLASS_ID || item.name === "Guard") ?? null;
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
  data.flags.ak5e.guardProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.guardProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.guardProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.guardProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}

function attachedTalentChoices(actor) {
  const selected = { basic: [], advanced: [] };
  for (const item of entries(actor?.items)) {
    const data = flag(item, GUARD_TALENT_FLAG);
    if (data?.sourceId && selected[data.tier]) selected[data.tier].push(data.sourceId);
  }
  return selected;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });

export function guardChoices(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : [saves];
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.fightingStyle = supplied.fightingStyle ?? saved.fightingStyle ?? null;
  result.weaponmasterAdditionalFightingStyle = supplied.weaponmasterAdditionalFightingStyle ?? saved.weaponmasterAdditionalFightingStyle ?? null;
  const level = levelOf(guardClass(actor));
  if (level) {
    result.asi ??= {};
    result.hp ??= {};
    for (const n of ASI_LEVELS.filter(v => v <= level)) result.asi[n] ??= { mode: "existing" };
    for (let n = 1; n <= level; n++) result.hp[n] ??= { mode: "existing" };
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

function hpOptions(level, isCrusher = false) {
  if (level === 1) {
    const base = isCrusher ? "Fixed 10 at 1st level (+3 Maximum Bulk)" : "Fixed 10 at 1st level";
    return [
      option({ mode: "existing" }, "Already included in current Hit Point maximum"),
      option({ mode: "fixed", roll: 10 }, base)
    ];
  }
  const fixedRoll = 6;
  const rolledOptions = Array.from({ length: 10 }, (_, i) => {
    const roll = i + 1;
    const label = isCrusher ? `Rolled d10: ${roll} (Extreme Fortitude: best of two dice)` : `Rolled d10: ${roll}`;
    return option({ mode: "rolled", roll }, label);
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

export function inspectGuardFields(actor, choices = {}) {
  const level = levelOf(guardClass(actor)) ?? 1;
  const attached = branchItem(actor);
  const currentChoices = guardChoices(actor, choices);
  const isCrusher = currentChoices.branch === "subclass-guard-crusher" || attached?.name?.toLowerCase().includes("crusher");
  const isWeaponmaster = currentChoices.branch === "subclass-guard-weaponmaster" || attached?.name?.toLowerCase().includes("weaponmaster");
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(GUARD_BRANCH_IDS).map(([id, name]) => option(id, name.charAt(0).toUpperCase() + name.slice(1)));
    fields.push(field("branch", "Choose your Guard Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  fields.push(field("fightingStyle", "Choose your Fighting Style", Object.entries(FIGHTING_STYLES).map(([key, style]) => option(key, `${style.name}: ${style.description}`)), 1, currentChoices.fightingStyle ?? null));
  if (isWeaponmaster) {
    fields.push(field("weaponmasterAdditionalFightingStyle", "Art of War: Additional Fighting Style (Guard or Marksman, swappable on Long Rest)", Object.entries(WEAPONMASTER_FIGHTING_STYLES).map(([key, style]) => option(key, `${style.name}: ${style.description}`)), 1, currentChoices.weaponmasterAdditionalFightingStyle ?? null));
  }
  fields.push(field("saves", "Choose one additional Saving Throw proficiency (Strength is automatic)", SAVES.map(([name, key]) => option(key, name)), 1, currentChoices.saves?.[0] ?? null));
  fields.push(field("skills", "Choose three Guard skills", SKILLS.map(([name, key]) => option(key, name)), 3, currentChoices.skills ?? []));
  fields.push(field("tool", "Choose a Kit proficiency (Maintenance Kit is standard)", TOOLS.map(name => option(name, name)), 1, currentChoices.tool ?? "Maintenance Kit"));

  fields.push(field("startingEquipment.mode", "Choose printed starting equipment or 1300 LMD", [option("items", "Starting equipment"), option("cash", "1300 LMD")], 1, currentChoices.startingEquipment?.mode ?? null));
  if (currentChoices.startingEquipment?.mode === "items") {
    const heavyMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Heavy Melee Weapons");
    const lightMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons");
    const lightShields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
    const armours = equipmentOptions(entry => ["equipment-reinforced-outfit-1", "equipment-combat-gear-5"].includes(entry.id));

    fields.push(field("startingEquipment.weapon1", "1x Heavy Melee Weapon OR 1x Light Melee Weapon", [...heavyMelee, ...lightMelee], 1, currentChoices.startingEquipment?.weapon1 ?? null));
    fields.push(field("startingEquipment.weapon2", "1x Light Melee Weapon OR 1x Light Shield", [...lightMelee, ...lightShields], 1, currentChoices.startingEquipment?.weapon2 ?? null));
    fields.push(field("startingEquipment.armour", "Reinforced Outfit OR Combat Gear", armours, 1, currentChoices.startingEquipment?.armour ?? null));
  }

  // Hit Points
  for (let n = 1; n <= level; n++) {
    fields.push(field(`hp.${n}`, `Level ${n} Hit Points`, hpOptions(n, isCrusher), 1, currentChoices.hp?.[n] ?? { mode: "existing" }));
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
    choices.saves,
    choices.skills,
    choices.tool,
    choices.fightingStyle,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents
  ]);
}

/** Pure preview of Guard progression. Writes nothing. */
export async function previewGuardProgression(actor, suppliedChoices = {}) {
  const profile = guardProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Guard class.");
  const level = profile.level;
  const choices = guardChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);
  const isCrusher = selectedBranchId === "subclass-guard-crusher";

  // Validate saves
  if (!choices.saves?.length) pending.push("saves");
  // Validate skills
  if ((choices.skills ?? []).length !== 3) pending.push("skills");
  // Validate fighting style
  if (!choices.fightingStyle) pending.push("fightingStyle");
  // Validate starting equipment
  if (!choices.startingEquipment?.mode) pending.push("startingEquipment.mode");
  else if (choices.startingEquipment.mode === "items") {
    if (!choices.startingEquipment.weapon1) pending.push("startingEquipment.weapon1");
    if (!choices.startingEquipment.weapon2) pending.push("startingEquipment.weapon2");
    if (!choices.startingEquipment.armour) pending.push("startingEquipment.armour");
  }

  // Branch item
  if (!attachedBranch && selectedBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(e => e.id === selectedBranchId);
    if (branchEntry) {
      createItems.push(sourceData(branchEntry, "subclass"));
    }
  }

  // Fighting Style item
  if (choices.fightingStyle) {
    const styleDef = FIGHTING_STYLES[choices.fightingStyle];
    if (styleDef) {
      const existingStyle = entries(actor.items).find(i => i.type === "feat" && (flag(i, "chapterThreeId") === styleDef.id || i.name === styleDef.name));
      if (!existingStyle) {
        const styleEntry = CHAPTER_THREE_CLASSES.find(e => e.id === styleDef.id);
        if (styleEntry) createItems.push(sourceData(styleEntry, "fightingStyle"));
      }
    }
  }

  // Starting equipment items
  if (choices.startingEquipment?.mode === "items") {
    const eqKeys = ["weapon1", "weapon2", "armour"];
    for (const key of eqKeys) {
      const eqId = choices.startingEquipment[key];
      if (eqId) {
        const eqEntry = EQUIPMENT.find(e => e.id === eqId);
        if (eqEntry) createItems.push(equipmentData(eqEntry));
      }
    }
    // Grant Maintenance kit
    const kitEntry = EQUIPMENT.find(e => e.id === "tool-maintenance-kit-5");
    if (kitEntry) createItems.push(equipmentData(kitEntry));
  } else if (choices.startingEquipment?.mode === "cash") {
    const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
    writes["system.currency.cp"] = beforeCp + 1300;
  }

  // Proficiencies updates
  const system = sourceSystem(actor);
  // Saves
  const currentSaves = new Set(system.traits?.saves?.value ?? []);
  currentSaves.add("str");
  if (choices.saves?.[0]) currentSaves.add(choices.saves[0]);
  // Musha Enduring Resolve: Wisdom Saving Throw proficiency (Ch. 3 L3271)
  if (selectedBranchId === "subclass-guard-musha") {
    currentSaves.add("wis");
  }
  writes["system.traits.saves.value"] = Array.from(currentSaves);

  // Armour: light, medium, shield
  const currentArmour = new Set(system.traits?.armorProf?.value ?? []);
  currentArmour.add("lgt");
  currentArmour.add("med");
  currentArmour.add("shl");
  writes["system.traits.armorProf.value"] = Array.from(currentArmour);

  // Weapons: custom note "All Melee Weapons"
  let currentCustomWeapons = String(system.traits?.weaponProf?.custom ?? "").trim();
  if (!currentCustomWeapons.includes("All Melee Weapons")) {
    currentCustomWeapons = currentCustomWeapons ? `${currentCustomWeapons}; All Melee Weapons` : "All Melee Weapons";
  }

  // Weaponmaster Art of War: All Light Ranged and Heavy Ranged weapons proficiency (Ch. 3 L3440)
  if (selectedBranchId === "subclass-guard-weaponmaster") {
    if (!currentCustomWeapons.includes("All Light Ranged Weapons")) {
      currentCustomWeapons += "; All Light Ranged Weapons";
    }
    if (!currentCustomWeapons.includes("All Heavy Ranged Weapons")) {
      currentCustomWeapons += "; All Heavy Ranged Weapons";
    }
    if (choices.weaponmasterAdditionalFightingStyle) {
      writes["flags.ak5e.weaponmaster.additionalFightingStyle"] = choices.weaponmasterAdditionalFightingStyle;
    }
  }
  writes["system.traits.weaponProf.custom"] = currentCustomWeapons;

  // Skills
  for (const skillKey of (choices.skills ?? [])) {
    writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
  }

  // Centurion Shock Trooper Intimidation proficiency (or Expertise if already proficient)
  if (selectedBranchId === "subclass-guard-centurion") {
    const currentItm = Number(system.skills?.itm?.value ?? 0);
    writes["system.skills.itm.value"] = currentItm >= 1 ? 2 : 1;
  }

  // Ability score increases
  const abilityIncreases = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    const asiChoice = choices.asi?.[n];
    if (asiChoice?.increases) {
      for (const inc of asiChoice.increases) {
        abilityIncreases[inc.ability] += inc.amount;
      }
    }
  }
  for (const [abl, inc] of Object.entries(abilityIncreases)) {
    if (inc > 0) {
      const current = currentAbility(actor, abl);
      writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
    }
  }

  // HP calculations
  let hpGainTotal = 0;
  const conMod = Math.floor((currentAbility(actor, "con") + abilityIncreases.con - 10) / 2);
  for (let n = 1; n <= level; n++) {
    const hpChoice = choices.hp?.[n];
    if (hpChoice && hpChoice.mode !== "existing") {
      const roll = Number(hpChoice.roll ?? (n === 1 ? 10 : 6));
      hpGainTotal += Math.max(1, roll + conMod);
    }
    if (isCrusher && hpChoice?.mode !== "existing") {
      // Maximum Bulk: +3 HP per level
      hpGainTotal += 3;
    }
  }
  if (hpGainTotal > 0) {
    const currentMax = Number(system.attributes?.hp?.max ?? 0);
    writes["system.attributes.hp.max"] = currentMax + hpGainTotal;
  }

  // Talents
  const talentSelections = [];
  if (level >= 3 && choices.talents?.basic) {
    const entry = TALENTS.find(e => e.id === choices.talents.basic);
    if (entry) {
      const item = sourceData(entry, "talent");
      item.flags.ak5e[GUARD_TALENT_FLAG] = { sourceId: entry.id, tier: "basic", moduleActive: choices.talents?.basicModule === "upgrade" };
      createItems.push(item);
      talentSelections.push({ id: entry.id, tier: "basic" });
    }
  }
  if (level >= 8 && choices.talents?.basicModule && choices.talents.basicModule !== "upgrade") {
    const entry = TALENTS.find(e => e.id === choices.talents.basicModule);
    if (entry) {
      const item = sourceData(entry, "talent");
      item.flags.ak5e[GUARD_TALENT_FLAG] = { sourceId: entry.id, tier: "basic", moduleActive: false };
      createItems.push(item);
      talentSelections.push({ id: entry.id, tier: "basicModule" });
    }
  }
  if (level >= 9 && choices.talents?.advanced) {
    const entry = TALENTS.find(e => e.id === choices.talents.advanced);
    if (entry) {
      const item = sourceData(entry, "talent");
      item.flags.ak5e[GUARD_TALENT_FLAG] = { sourceId: entry.id, tier: "advanced", moduleActive: choices.talents?.advancedModule === "upgrade" };
      createItems.push(item);
      talentSelections.push({ id: entry.id, tier: "advanced" });
    }
  }
  if (level >= 13 && choices.talents?.advancedModule && choices.talents.advancedModule !== "upgrade") {
    const entry = TALENTS.find(e => e.id === choices.talents.advancedModule);
    if (entry) {
      const item = sourceData(entry, "talent");
      item.flags.ak5e[GUARD_TALENT_FLAG] = { sourceId: entry.id, tier: "advanced", moduleActive: false };
      createItems.push(item);
      talentSelections.push({ id: entry.id, tier: "advancedModule" });
    }
  }

  // Context key for verification
  const contextKey = actorSnapshotKey(actor, choices, profile);

  return {
    version: 1,
    level,
    branch: selectedBranchId,
    branchName: GUARD_BRANCH_IDS[selectedBranchId] ?? "Guard",
    choices,
    pending,
    blocked: [],
    missing: [],
    warnings,
    writes,
    createItems,
    updateItems,
    progression: {
      hpLevels: Object.keys(choices.hp ?? {}).map(Number),
      asiLevels: Object.keys(choices.asi ?? {}).map(Number),
      talentSelections
    },
    contextKey
  };
}

/** Apply Guard progression. Idempotent and validates confirmation and contextKey. */
export async function applyGuardProgression(actor, { confirmed, contextKey, ...suppliedChoices } = {}) {
  need(confirmed === true, "Confirm the previewed Guard progression setup first.");
  const plan = await previewGuardProgression(actor, suppliedChoices);
  need(!plan.pending.length, `Complete all pending Guard choices before applying: ${plan.pending.join(", ")}`);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Guard progression setup again.");

  const state = readState(actor);
  state.choices = plan.choices;
  state.hpLevels = [...new Set([...state.hpLevels, ...plan.progression.hpLevels])];
  state.asiLevels = [...new Set([...state.asiLevels, ...plan.progression.asiLevels])];

  const actorUpdates = {
    ...plan.writes,
    [`flags.ak5e.${GUARD_PROGRESS_FLAG}`]: state,
    "flags.ak5e.guard.enabled": true,
    "flags.ak5e.guard.fightingStyle": plan.choices.fightingStyle
  };

  await actor.update(actorUpdates);

  if (plan.createItems.length) {
    await actor.createEmbeddedDocuments("Item", plan.createItems);
  }
  if (plan.updateItems.length) {
    await actor.updateEmbeddedDocuments("Item", plan.updateItems);
  }

  return {
    level: plan.level,
    branch: plan.branchName,
    created: plan.createItems.map(i => i.name),
    updated: plan.updateItems.map(i => i.name)
  };
}
