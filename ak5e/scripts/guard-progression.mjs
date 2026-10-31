/** Native, previewed Guard character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in defender-progression.mjs.
 * Pure and previewed: opening or inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS } from "./chapter-five-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { standardPools } from "./caster-rules.mjs";
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
  startingEquipmentSlots: [],
  artsTouchedApplied: false,
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

function equipmentData(entry, slot) {
  const source = worldItem(entry.id);
  let data;
  if (source) {
    data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
  } else {
    data = sourceEntryData(entry);
    data.flags ??= {};
    data.flags.ak5e ??= {};
  }
  data.flags.ak5e.guardProgressionGrant = { sourceId: entry.id, kind: "startingEquipment", slot };
  data.flags.ak5e.guardStartingSlot = slot;
  return data;
}

function manualArtsItem(member, pools) {
  const pool = pools[0];
  const key = `manual:${member.name.toLowerCase()}`;
  return {
    name: member.name,
    type: "spell",
    img: "icons/svg/book.svg",
    system: { level: Number(member.level), description: { value: `<p>AK5e ${pool.name}, level ${member.level} Art.</p><p>This manual source entry records the printed Art name and level because the source registry has no native Art Item for it. Resolve the Art from the AK5e source text or an owner supplied rules source. Do not substitute a different Art.</p>` } },
    flags: { ak5e: {
      guardProgressionGrant: { kind: "artsbladeArt", poolIds: pools.map(value => value.id), artLevel: Number(member.level), manual: true },
      guardManualArtKey: key,
      guardArtsPools: pools.map(value => value.id),
      artsKind: "manual-source-art",
      sourceHeading: pool.name,
      rawSource: `${member.name} (${member.level === 0 ? "Cantrip" : `Level ${member.level}`})`
    } }
  };
}

function artsbladePoolItems(actor, choices, level) {
  // Sword and Sorcery grants levelled Arts through fifth level; Sharpened
  // Mind's two additional pools grant only levelled Arts through third level.
  // Keep each pool's legitimate ceiling before deduplicating shared members.
  const ceilings = new Map();
  for (const key of choices.artPools ?? []) ceilings.set(String(key).toLowerCase(), 5);
  if (level >= 10) for (const key of choices.additionalArtPools ?? []) {
    const poolKey = String(key).toLowerCase();
    ceilings.set(poolKey, Math.max(ceilings.get(poolKey) ?? 0, 3));
  }
  const pools = [...ceilings].map(([key, ceiling]) => ({
    pool: standardPools.find(pool => pool.id.includes(`-${key}-arts-`)), ceiling
  })).filter(entry => entry.pool);
  const sourceIds = new Set(entries(actor.items).map(item => flag(item, "chapterFiveId")).filter(Boolean));
  const names = new Set(entries(actor.items).filter(item => item.type === "spell").map(item => item.name?.toLowerCase()));
  const members = new Map();
  for (const { pool, ceiling } of pools) for (const member of pool.members) {
    if (Number(member.level) < 1 || Number(member.level) > ceiling) continue;
    const key = member.sourceId ? `source:${member.sourceId}` : `manual:${member.name.toLowerCase()}`;
    const current = members.get(key) ?? { member, pools: [] };
    current.pools.push(pool);
    members.set(key, current);
  }
  const result = [];
  for (const { member, pools: memberPools } of members.values()) {
    if (member.sourceId) {
      if (sourceIds.has(member.sourceId)) continue;
      const entry = CHAPTER_FIVE_ARTS.find(candidate => candidate.id === member.sourceId && candidate.kind === "art");
      if (!entry) continue;
      const data = sourceEntryData(entry);
      data.flags.ak5e.guardProgressionGrant = { kind: "artsbladeArt", sourceId: entry.id, poolIds: memberPools.map(pool => pool.id), artLevel: Number(member.level) };
      data.flags.ak5e.guardArtsPools = memberPools.map(pool => pool.id);
      result.push(data);
    } else {
      // An existing same-name spell is retained as the Actor's authored Art.
      if (names.has(member.name.toLowerCase())) continue;
      result.push(manualArtsItem(member, memberPools));
    }
  }
  return result;
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
  result.artPools = [...(supplied.artPools ?? saved.artPools ?? [])];
  result.additionalArtPools = [...(supplied.additionalArtPools ?? saved.additionalArtPools ?? [])];
  result.fightingStyle = supplied.fightingStyle ?? saved.fightingStyle ?? null;
  result.weaponmasterAdditionalFightingStyle = supplied.weaponmasterAdditionalFightingStyle ?? saved.weaponmasterAdditionalFightingStyle ?? null;
  result.martialDCAbility = supplied.martialDCAbility ?? saved.martialDCAbility ?? null;
  // HP and ASI levels are NOT defaulted here. A level counts as taken only when its choice was actually supplied
  // (an explicit { mode: "existing" } is a supplied choice); the sheet shows "existing" as the unselected default.
  return result;
}

const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const HIT_DIE = 10;

/**
 * Validate supplied choices against the class options before anything is previewed or written. Throws on malformed
 * input; out-of-range HP rolls are clamped and unavailable levels are ignored, both with a warning. Returns the
 * normalised HP rolls and the supplied levels to mark as taken.
 */
function validateGuardChoices(choices, level, warnings) {
  const reject = message => { throw new Error(`Invalid Guard progression choice: ${message}`); };
  const saves = Array.isArray(choices.saves) ? choices.saves : [choices.saves];
  const saveKeys = SAVES.map(([, key]) => key);
  if (saves.some(value => value !== undefined && value !== null)) {
    if (saves.length !== 1 || !saveKeys.includes(saves[0])) reject(`choose one saving throw from ${saveKeys.join(", ")} (Strength is automatic).`);
  }
  const skillKeys = SKILLS.map(([, key]) => key);
  const skills = choices.skills ?? [];
  if (!Array.isArray(skills)) reject("skills must be a list.");
  if (skills.some(key => !skillKeys.includes(key))) reject(`skills must come from the Guard list: ${skillKeys.join(", ")}.`);
  if (new Set(skills).size !== skills.length) reject("the same skill was chosen more than once.");
  if (skills.length > 3) reject("choose three skills.");
  if (choices.tool != null && !TOOLS.includes(choices.tool)) reject(`${choices.tool} is not a listed Kit proficiency.`);
  if (choices.fightingStyle != null && !Object.hasOwn(FIGHTING_STYLES, choices.fightingStyle)) reject(`${choices.fightingStyle} is not a Guard Fighting Style.`);
  if (choices.branch != null && !Object.hasOwn(GUARD_BRANCH_IDS, choices.branch)) reject(`${choices.branch} is not a Guard Branch.`);
  if (choices.martialDCAbility != null && !["str", "dex"].includes(choices.martialDCAbility)) reject("the Martial DC ability must be Strength or Dexterity.");

  const asi = {}, hp = {}, hpLevels = [], asiLevels = [];
  for (const [key, choice] of Object.entries(choices.asi ?? {})) {
    const n = Number(key);
    if (!ASI_LEVELS.includes(n)) reject(`level ${key} is not an Ability Score Improvement level.`);
    if (n > level) { warnings.push(`Ignoring the level ${n} Ability Score Improvement: this character is level ${level}.`); continue; }
    if (choice?.mode === "existing" && !choice.increases) { asi[n] = { mode: "existing" }; asiLevels.push(n); continue; }
    const increases = choice?.increases;
    const valid = Array.isArray(increases) && increases.every(item => item && ABILITY_KEYS.includes(item.ability) && Number.isInteger(item.amount))
      && new Set(increases.map(item => item.ability)).size === increases.length
      && ((increases.length === 1 && increases[0].amount === 2) || (increases.length === 2 && increases.every(item => item.amount === 1)));
    if (!valid) reject(`level ${n} Ability Score Improvement must be +2 to one ability or +1 to two different abilities (str, dex, con, int, wis, cha).`);
    asi[n] = { increases: increases.map(({ ability, amount }) => ({ ability, amount })) };
    asiLevels.push(n);
  }
  for (const [key, choice] of Object.entries(choices.hp ?? {})) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1) reject(`${key} is not a Guard level.`);
    if (n > level) { warnings.push(`Ignoring the level ${n} Hit Point choice: this character is level ${level}.`); continue; }
    if (choice?.mode === "existing") { hp[n] = { mode: "existing" }; hpLevels.push(n); continue; }
    if (!["fixed", "rolled"].includes(choice?.mode)) reject(`level ${n} Hit Points must be existing, fixed or rolled.`);
    const raw = choice.roll ?? (n === 1 ? HIT_DIE : 6);
    const roll = Number(raw);
    if (raw === null || raw === "" || typeof raw === "boolean" || !Number.isFinite(roll)) reject(`level ${n} Hit Point roll "${raw}" is not a number.`);
    const clamped = Math.min(HIT_DIE, Math.max(1, Math.floor(roll)));
    if (clamped !== roll) warnings.push(`Level ${n} Hit Point roll ${roll} is outside 1 to ${HIT_DIE} (the Guard Hit Die); using ${clamped}.`);
    hp[n] = { mode: choice.mode, roll: clamped };
    hpLevels.push(n);
  }
  return { asi, hp, asiLevels, hpLevels };
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
  const isArtsblade = currentChoices.branch === "subclass-guard-artsblade" || attached?.name?.toLowerCase().includes("artsblade");
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(GUARD_BRANCH_IDS).map(([id, name]) => option(id, name.charAt(0).toUpperCase() + name.slice(1)));
    fields.push(field("branch", "Choose your Guard Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  fields.push(field("fightingStyle", "Choose your Fighting Style", Object.entries(FIGHTING_STYLES).map(([key, style]) => option(key, `${style.name}: ${style.description}`)), 1, currentChoices.fightingStyle ?? null));
  if (isWeaponmaster) {
    fields.push(field("weaponmasterAdditionalFightingStyle", "Art of War: Additional Fighting Style (Guard or Marksman, swappable on Long Rest)", Object.entries(WEAPONMASTER_FIGHTING_STYLES).map(([key, style]) => option(key, `${style.name}: ${style.description}`)), 1, currentChoices.weaponmasterAdditionalFightingStyle ?? null));
  }
  if (isArtsblade) {
    const pools = ["corrosion", "crude", "earth", "electric", "flame", "fluid", "frost", "light", "psychic", "spatial", "wind"];
    fields.push(field("artPools", "Sword and Sorcery: Choose one Standard Arts Pool", pools.map(key => option(key, key[0].toUpperCase() + key.slice(1))), 1, currentChoices.artPools?.[0] ?? null));
    if (level >= 10) fields.push(field("additionalArtPools", "Sharpened Mind, Sharpened Weapon: Choose two other Standard Arts Pools", pools.filter(key => key !== currentChoices.artPools?.[0]).map(key => option(key, key[0].toUpperCase() + key.slice(1))), 2, currentChoices.additionalArtPools ?? []));
  }
  fields.push(field("saves", "Choose one additional Saving Throw proficiency (Strength is automatic)", SAVES.map(([name, key]) => option(key, name)), 1, currentChoices.saves?.[0] ?? null));
  fields.push(field("skills", "Choose three Guard skills", SKILLS.map(([name, key]) => option(key, name)), 3, currentChoices.skills ?? []));
  fields.push(field("martialDCAbility", "Martial DC: Strength or Dexterity modifier (your choice; Chapter 1)", [option("str", "Strength"), option("dex", "Dexterity")], 1, currentChoices.martialDCAbility ?? null));
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
  const itemState = entries(actor?.items).map(item => {
    const data = item?.toObject ? item.toObject() : item;
    return {
      id: item.id ?? data?._id ?? null,
      type: item.type ?? data?.type ?? null,
      name: item.name ?? data?.name ?? null,
      system: data?.system ?? item.system ?? {},
      flags: data?.flags ?? item.flags ?? {},
      source: {
        chapterThreeId: flag(item, "chapterThreeId"),
        chapterFourId: flag(item, "chapterFourId"),
        chapterFiveId: flag(item, "chapterFiveId"),
        guardStartingSlot: flag(item, "guardStartingSlot"),
        guardProgressionGrant: flag(item, "guardProgressionGrant"),
        guardManualArtKey: flag(item, "guardManualArtKey")
      }
    };
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify([
    actor.uuid,
    profile.level,
    profile.branch,
    sourceSystem(actor),
    actor.flags?.ak5e ?? actor._source?.flags?.ak5e ?? { guardProgression: flag(actor, GUARD_PROGRESS_FLAG) ?? null },
    itemState,
    choices.saves,
    choices.skills,
    choices.tool,
    choices.fightingStyle,
    choices.startingEquipment,
    choices.hp,
    choices.asi,
    choices.talents
    , choices.artPools,
    choices.additionalArtPools
  ]);
}

/** Pure preview of Guard progression. Writes nothing. */
export async function previewGuardProgression(actor, suppliedChoices = {}) {
  const profile = guardProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Guard class.");
  const level = profile.level;
  const choices = guardChoices(actor, suppliedChoices);
  const pending = [], warnings = [], writes = {}, createItems = [], updateItems = [];
  const priorState = readState(actor);
  // Malformed input is rejected here, before anything is previewed, applied or written.
  const checked = validateGuardChoices(choices, level, warnings);
  choices.asi = checked.asi;
  choices.hp = checked.hp;

  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? flag(attachedBranch, "chapterThreeId") : null);
  const isCrusher = selectedBranchId === "subclass-guard-crusher";
  const isArtsblade = selectedBranchId === "subclass-guard-artsblade";
  if (isArtsblade && !choices.artPools?.[0]) pending.push("artPools");
  if (isArtsblade && level >= 10 && choices.additionalArtPools?.length !== 2) pending.push("additionalArtPools");

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

  // Grant the source Artsblade feature Items at their actual Guard levels. The chosen
  // Standard Pools remain in progression state so the play panel can restrict choices.
  if (isArtsblade) {
    const artsbladeFeatures = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "subclass-feature" && entry.parentBranch === "Artsblade"
      && ((entry.level != null && entry.level <= level) || entry.id === "subclass-feature-guard-artsblade-blade-art-6708"
        || entry.id === "subclass-feature-guard-artsblade-artsblade-table-1152"
        || entry.id === "subclass-feature-guard-artsblade-resolving-spellsword-arts-2822"));
    for (const entry of artsbladeFeatures) {
      if (entries(actor.items).some(item => flag(item, "chapterThreeId") === entry.id)) continue;
      createItems.push(sourceData(entry, "subclassFeature"));
    }
    if (!priorState.artsTouchedApplied) {
      const currentArts = Number(sourceSystem(actor).skills?.arc?.value ?? 0);
      writes["system.skills.arc.value"] = currentArts >= 1 ? 2 : 1;
    }
    createItems.push(...artsbladePoolItems(actor, choices, level));
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
  const startingSlotsAdded = [];
  if (choices.startingEquipment?.mode === "items") {
    const eqKeys = ["weapon1", "weapon2", "armour"];
    for (const key of eqKeys) {
      const eqId = choices.startingEquipment[key];
      if (eqId && !priorState.startingEquipmentSlots.includes(key)
        && !entries(actor.items).some(item => flag(item, "guardStartingSlot") === key)) {
        const eqEntry = EQUIPMENT.find(e => e.id === eqId);
        if (eqEntry) { createItems.push(equipmentData(eqEntry, key)); startingSlotsAdded.push(key); }
      }
    }
    // Grant Maintenance kit
    const kitEntry = EQUIPMENT.find(e => e.id === "tool-maintenance-kit-5");
    if (kitEntry && !priorState.startingEquipmentSlots.includes("kit")
      && !entries(actor.items).some(item => flag(item, "guardStartingSlot") === "kit")) {
      createItems.push(equipmentData(kitEntry, "kit")); startingSlotsAdded.push("kit");
    }
  } else if (choices.startingEquipment?.mode === "cash" && !priorState.startingEquipmentApplied) {
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
  if (choices.martialDCAbility) writes["flags.ak5e.guard.martialDCAbility"] = choices.martialDCAbility;

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
    if (priorState.asiLevels.includes(n)) continue;
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
      if (current + inc > 20) warnings.push(`${abl.toUpperCase()} ${current} + ${inc} is above 20; Ability Score Improvement cannot raise a score above 20.`);
      writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
    }
  }

  // HP calculations
  let hpGainTotal = 0;
  const conMod = Math.floor((currentAbility(actor, "con") + abilityIncreases.con - 10) / 2);
  for (let n = 1; n <= level; n++) {
    if (priorState.hpLevels.includes(n)) continue;
    const hpChoice = choices.hp?.[n];
    // An unsupplied level adds nothing and stays untaken; only a supplied, non-"existing" choice adds Hit Points.
    if (hpChoice && hpChoice.mode !== "existing") {
      hpGainTotal += Math.max(1, hpChoice.roll + conMod);
      // Maximum Bulk: +3 HP per level
      if (isCrusher) hpGainTotal += 3;
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

  // Setup retries and level-up previews can encounter source Items already owned.
  // Deduplicate every planned grant by stable source ID, including equipment.
  const existingSourceIds = new Set(entries(actor.items).filter(item => !flag(item, "guardStartingSlot"))
    .flatMap(item => [flag(item, "chapterThreeId"), flag(item, "chapterFourId")]).filter(Boolean));
  const plannedSourceIds = new Set();
  for (let index = createItems.length - 1; index >= 0; index--) {
    const item = createItems[index], sourceId = item.flags?.ak5e?.chapterThreeId ?? item.flags?.ak5e?.chapterFourId;
    const slot = item.flags?.ak5e?.guardStartingSlot;
    if (slot) continue;
    if (sourceId && (existingSourceIds.has(sourceId) || plannedSourceIds.has(sourceId))) createItems.splice(index, 1);
    else if (sourceId) plannedSourceIds.add(sourceId);
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
      hpLevels: checked.hpLevels.filter(n => !priorState.hpLevels.includes(n)),
      asiLevels: checked.asiLevels.filter(n => !priorState.asiLevels.includes(n)),
      startingEquipmentApplied: !priorState.startingEquipmentApplied && Boolean(choices.startingEquipment?.mode),
      startingEquipmentSlots: startingSlotsAdded,
      artsTouchedApplied: isArtsblade && !priorState.artsTouchedApplied,
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
  // Cash is written atomically with this state update. Item grants are marked
  // only after their embedded documents have been created; on a partial batch
  // failure the next preview can safely grant only the still-missing source IDs.
  state.startingEquipmentApplied ||= plan.choices.startingEquipment?.mode === "cash";
  state.artsTouchedApplied ||= plan.progression.artsTouchedApplied;

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
  if (plan.choices.startingEquipment?.mode === "items") {
    state.startingEquipmentSlots = [...new Set([...state.startingEquipmentSlots, ...plan.progression.startingEquipmentSlots])];
    if (["weapon1", "weapon2", "armour", "kit"].every(slot => state.startingEquipmentSlots.includes(slot))) state.startingEquipmentApplied = true;
    await actor.update({ [`flags.ak5e.${GUARD_PROGRESS_FLAG}`]: state });
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
