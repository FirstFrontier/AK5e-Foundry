import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS } from "./chapter-five-content.mjs";
import { adoptedSpellData } from "./arts-rules.mjs";
import { classContentFlags } from "./class-content-installation.mjs";
import { casterBranch, casterFeatures, casterLevel, casterProfile, casterState, casterTable, standardPools } from "./caster-rules.mjs";

const CASTER_ID = "class-caster";
const nameKey = value => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const BRANCHES = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "subclass" && entry.parentClass === "Caster" && ["Core", "Mystic", "Mech-Accord", "Primal", "Splash", "Chain"].includes(entry.sourceHeading));
const BRANCH_KEY = new Map(BRANCHES.map(entry => [entry.id, entry.sourceHeading === "Mech-Accord" ? "mech-accord" : entry.sourceHeading.toLowerCase()]));
const CLASS_FEATURES = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-feature" && entry.parentClass === "Caster");
const BRANCH_FEATURES = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "subclass-feature" && entry.parentClass === "Caster");
const ELEMENTAL_BEING = BRANCH_FEATURES.find(entry => entry.id === "subclass-feature-caster-core-10th-level-master-of-the-elements-1572");
const TALENTS = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-option" && entry.parentClass === "Caster" && entry.classOption?.category === "talent");
const ARTS = CHAPTER_FIVE_ARTS.filter(entry => entry.kind === "art");
const ART_BY_ID = new Map(ARTS.map(entry => [entry.id, entry]));
const ART_BY_NAME = new Map(ARTS.map(entry => [nameKey(entry.name), entry]));
const EXTRA_ART_LEVELS = Object.freeze({ "detectmagic": 1, "counterspell": 3, "dispelmagic": 3 });
const EQUIPMENT_BY_ID = new Map(CHAPTER_FOUR_EQUIPMENT.map(entry => [entry.id, entry]));
const EQUIPMENT_BY_NAME = new Map(CHAPTER_FOUR_EQUIPMENT.map(entry => [nameKey(entry.name), entry]));
const CLASS_BY_ID = new Map(CHAPTER_THREE_CLASSES.map(entry => [entry.id, entry]));
const DEFAULT_STATE = Object.freeze({ version: 1, enabled: false, choices: {}, pools: [], operations: [], rulings: {}, uses: {}, turn: {}, drones: [] });
const APPLYING = new Set();
const HASHLESS = new Set();
const SIMPLE_SKILLS = Object.freeze({ Arts: "arc", Lore: "ak5elore", Investigation: "inv", Tech: "ak5etech", Insight: "ins", Perception: "prc" });
const SKILL_NAMES = Object.freeze(Object.keys(SIMPLE_SKILLS));
const ABILITIES = Object.freeze(["int", "wis", "cha"]);
const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);
const TOOL_CHOICES = Object.freeze([
  "Art Kit", "Brewing Kit", "Cooking Kit", "Engineering Kit", "Maintenance Kit", "Makeup Kit", "Mechanism Kit",
  "Medical Kit", "Messenger Kit", "Pharmacology Kit", "Tailoring Kit", "Woodwork Kit", "Land Vehicles", "Vehicles (Drones)"
]);
const flag = (document, key) => document?.getFlag?.("ak5e", key) ?? document?.flags?.ak5e?.[key];
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};
const sourceFlagKey = entry => entry.kind === "art" || entry.kind?.includes("art-pool") ? "chapterFiveId" :
  ["weapon", "equipment", "tool", "loot", "magic-item", "tool-rule", "gear-rule"].includes(entry.kind) ? "chapterFourId" : "chapterThreeId";
const sourceFlags = entry => {
  const namespaceKey = sourceFlagKey(entry);
  if (namespaceKey === "chapterThreeId") return { ak5e: classContentFlags(entry) };
  if (namespaceKey === "chapterFiveId") return { ak5e: {
    chapterFiveId: entry.id, artsKind: entry.kind, sourceHeading: entry.sourceHeading,
    sourceFile: "05_chapter_5_arts.txt", rawSource: entry.rawSource
  } };
  return { ak5e: {
    chapterFourId: entry.id, equipmentKind: entry.kind, sourceHeading: entry.sourceHeading,
    sourceFile: "04_chapter_4_equipment.txt", tableData: entry.tableData, rawSource: entry.rawSource
  } };
};

function dnd5eSchool(value) {
  return ({ abjuration: "abj", conjuration: "con", divination: "div", enchantment: "enc", evocation: "evo", illusion: "ill", necromancy: "nec", transmutation: "trs" })[value] ?? "";
}

/** Build one document from an exact generated source record without consulting Foundry collections. */
export function sourceEntryData(entry) {
  if (!entry?.id || !entry.itemType) throw new Error("A source record with a stable ID and Item type is required.");
  const system = { ...(entry.systemData ?? {}), description: { value: entry.content ?? "", chat: "" } };
  if (entry.kind === "art") {
    system.level = entry.level ?? 0;
    system.school = dnd5eSchool(entry.school);
    Object.assign(system, structuredClone(entry.spellData ?? {}), { method: "ak5e", prepared: 2 });
    system.properties = (system.properties ?? []).filter(property => property !== "material");
    system.materials = { value: "", consumed: false, cost: 0, supply: 0 };
  }
  return {
    name: entry.name,
    type: entry.itemType,
    img: "icons/svg/book.svg",
    system,
    flags: {
      ...sourceFlags(entry),
      dnd5e: { sourceBook: "AK5E" }
    }
  };
}

function docSourceId(item) {
  return flag(item, "chapterThreeId") ?? flag(item, "chapterFourId") ?? flag(item, "chapterFiveId");
}

function actorClass(actor) {
  return list(actor?.items).find(item => item.type === "class" && flag(item, "chapterThreeId") === CASTER_ID) ?? null;
}

function branchSourceId(actor) {
  return list(actor?.items).find(item => item.type === "subclass")?.getFlag?.("ak5e", "chapterThreeId") ??
    list(actor?.items).find(item => item.type === "subclass")?.flags?.ak5e?.chapterThreeId ?? null;
}

function field(key, label, options, count = 1, requiredAt = 1, selected = null) {
  return { key, label, options, count, requiredAt, selected };
}

function option(value, label, details = {}) { return { value, label, ...details }; }

function actorItemBySource(actor, sourceId) {
  return list(actor?.items).find(item => docSourceId(item) === sourceId);
}

function firstChoice(record, key) {
  return record?.[key] ?? null;
}

function currentAbility(actor, ability) {
  const value = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(value) ? value : 10;
}

function asiOptions(actor) {
  const options = [];
  for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
    if (currentAbility(actor, ability) + 2 <= 20) options.push(option({ increases: [{ ability, amount: 2 }] }, `+2 ${ability.toUpperCase()}`));
  }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const a = ["str", "dex", "con", "int", "wis", "cha"][i], b = ["str", "dex", "con", "int", "wis", "cha"][j];
    if (currentAbility(actor, a) < 20 && currentAbility(actor, b) < 20) {
      options.push(option({ increases: [{ ability: a, amount: 1 }, { ability: b, amount: 1 }] }, `+1 ${a.toUpperCase()} and +1 ${b.toUpperCase()}`));
    }
  }
  return options;
}

function hpOptions(level) {
  const existing = option({ mode: "existing", roll: 0 }, "Already included in current Hit Point maximum");
  if (level === 1) return [existing, option({ mode: "fixed", roll: 6 }, "Fixed 6 at 1st level")];
  return [existing, option({ mode: "fixed", roll: 4 }, "Fixed average (4)"), ...[1, 2, 3, 4, 5, 6].map(roll => option({ mode: "rolled", roll }, `Rolled d6: ${roll}`))];
}

function normalizedChoices(actor, supplied = {}) {
  const state = casterState(actor);
  const saved = structuredClone(state.choices ?? {});
  const incoming = structuredClone(supplied ?? {});
  const merged = { ...saved, ...incoming };
  const branchId = branchSourceId(actor) ?? incoming.branch ?? saved.branch ?? null;
  if (branchId) merged.branch = branchId;
  merged.pools = Array.isArray(incoming.pools) ? [...incoming.pools] : [...(saved.pools ?? [])];
  merged.saves = Array.isArray(incoming.saves) ? [...incoming.saves] : [...(saved.saves ?? [])];
  merged.skills = Array.isArray(incoming.skills) ? [...incoming.skills] : [...(saved.skills ?? [])];
  if (Array.isArray(incoming.splashArts) || Array.isArray(saved.splashArts)) merged.splashArts = Array.isArray(incoming.splashArts) ? [...incoming.splashArts] : [...saved.splashArts];
  merged.asi = { ...(saved.asi ?? {}), ...(incoming.asi ?? {}) };
  merged.hp = { ...(saved.hp ?? {}), ...(incoming.hp ?? {}) };
  merged.talents = { ...(saved.talents ?? {}), ...(incoming.talents ?? {}) };
  merged.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(incoming.startingEquipment ?? {}) };
  return merged;
}

function profileForSetup(actor) {
  const profile = casterProfile(actor);
  if (!profile.applicable) throw new Error("Attach the AK5e Caster class before opening Caster setup.");
  if (profile.blocked.some(code => code !== "BranchNotChosen")) throw new Error(`Caster setup is blocked: ${profile.blocked.join(", ")}.`);
  return profile;
}

function selectedBranchId(actor, choices) {
  const actual = branchSourceId(actor);
  if (actual) {
    if (!BRANCH_KEY.has(actual)) return null;
    if (choices.branch && choices.branch !== actual) throw new Error("The attached Caster Branch cannot be replaced in setup.");
    return actual;
  }
  return choices.branch ?? null;
}

function activeOperation(state, operationId) {
  return [...state.operations].reverse().find(operation => operation.id === operationId) ?? null;
}

function progressionSnapshot(state, operationId) {
  const operation = operationId && activeOperation(state, operationId);
  if (operation?.progression) return operation.progression;
  return state.progression ?? [...state.operations].reverse().find(operation => operation.status === "complete" && operation.progression)?.progression ?? { hpLevels: [], asiLevels: [] };
}

function scalarAtActor(actor, path) {
  const value = path.split(".").filter((key, index) => !(index === 0 && key === "system"))
    .reduce((value, key) => value?.[key], sourceSystem(actor));
  if (value !== undefined && value !== null) return value;
  const ability = /^system\.abilities\.([^.]+)\.value$/.exec(path);
  if (ability) return currentAbility(actor, ability[1]);
  if (path === "system.attributes.hp.max") return 0;
  return value;
}
export function casterScalarRecords(plan) {
  if(Array.isArray(plan))return plan;
  const records=[];
  const visit=(node,path=[])=>{
    if(!node||typeof node!=="object")return;
    if(node.before!==undefined && node.after!==undefined) {records.push({path:path.join("."),before:node.before,after:node.after});return;}
    for(const [key,value]of Object.entries(node))visit(value,[...path,key]);
  };
  visit(plan);return records;
}

function settingMappings() {
  try { return game.settings.get("ak5e", "casterArtMappings") ?? {}; } catch { return {}; }
}

function getMappings() {
  return settingMappings();
}

function mappingFor(name) { return getMappings()[nameKey(name)] ?? null; }

function expectedArtLevel(name) {
  const member = standardPools.flatMap(pool => pool.members).find(candidate => nameKey(candidate.name) === nameKey(name));
  return member?.level ?? EXTRA_ART_LEVELS[nameKey(name)] ?? null;
}

function itemsCollection() { return list(globalThis.game?.items); }

function existingWorldSource(sourceId) { return itemsCollection().find(item => docSourceId(item) === sourceId) ?? null; }

function ownedCastingUnitOptions(actor, startingEquipment) {
  const choices = list(actor.items).filter(item => item.type === "weapon" && /\bCasting Unit\b/i.test(String(flag(item, "tableData")?.properties ?? "")))
    .map(item => option(item.id, item.name, { itemId: item.id }));
  if (startingEquipment?.mode === "items") {
    const candidate = EQUIPMENT_BY_ID.get(startingEquipment.wandOrStaff);
    if (candidate && /\bCasting Unit\b/i.test(candidate.tableData?.properties ?? "")) {
      choices.push(option(candidate.id, `${candidate.name} (starting equipment)`, { sourceId: candidate.id, created: true }));
    }
  }
  return choices;
}

/** Implements of Destruction (Ch.3 L851): Arts from any Standard pool not already learned through a chosen pool. */
function splashArtOptions(poolIds = []) {
  const known = new Set(standardPools.filter(pool => poolIds.includes(pool.id)).flatMap(pool => pool.members.map(member => nameKey(member.name))));
  const byName = new Map();
  for (const pool of standardPools) for (const member of pool.members) {
    const key = nameKey(member.name);
    if (known.has(key)) continue;
    const current = byName.get(key) ?? { member, pools: [] };
    current.pools.push(pool.name); byName.set(key, current);
  }
  return [...byName.values()].sort((a, b) => a.member.level - b.member.level || a.member.name.localeCompare(b.member.name))
    .map(({ member, pools }) => option(member.name, `${member.name} (${member.level === 0 ? "Cantrip" : `level ${member.level}`}; ${pools.join(", ")})`, { sourceId: member.sourceId ?? null }));
}

function buildFields(actor, profile, choices) {
  const fields = [];
  const branchId = selectedBranchId(actor, choices);
  const branch = BRANCHES.find(entry => entry.id === branchId);
  const level = profile.level;
  const knownPools = Array.isArray(choices.pools) ? choices.pools : [];
  const requiredPoolCount = 1 + (branch?.sourceHeading === "Core" ? 1 : 0) + (level >= 11 ? 1 : 0);
  const poolOptions = standardPools.map(pool => option(pool.id, pool.name, { sourceId: pool.id, details: `${pool.members.length} source Arts`, members: pool.members }));
  fields.push(field("branch", "Choose a Caster Branch", BRANCHES.map(entry => option(entry.id, entry.sourceHeading, { sourceId: entry.id })), 1, 1, choices.branch ?? null));
  fields.push(field("ability", "Choose your Spellcasting Ability", ABILITIES.map(value => option(value, ({ int: "Intelligence", wis: "Wisdom", cha: "Charisma" })[value])), 1, 1, choices.ability ?? null));
  fields.push(field("pools", "Choose your Standard Arts Pools", poolOptions, requiredPoolCount, level >= 11 ? 11 : 1, knownPools));
  fields.push(field("saves", "Choose two Saving Throw proficiencies", ABILITIES.map(value => option(value, value.toUpperCase())), 2, 1, choices.saves ?? []));
  fields.push(field("skills", "Choose three Caster skills", SKILL_NAMES.map(value => option(value, value === "Tech" ? "Technology (Tech)" : value)), 3, 1, choices.skills ?? []));
  fields.push(field("tool", "Choose a Tool Kit or Vehicle proficiency", TOOL_CHOICES.map(value => option(value, value)), 1, 1, choices.tool ?? null));

  const equipment = choices.startingEquipment ?? {};
  if (!equipment.mode) fields.push(field("startingEquipment.mode", "Choose starting equipment or 1300 LMD", [option("items", "Starting equipment"), option("cash", "1300 LMD")], 1, 1, null));
  if (equipment.mode === "items") {
    const weapons = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons" &&
      !["Arts Wand", "Arts Staff"].includes(entry.name))
      .map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
    const shields = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields")
      .map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
    const casterUnits = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "weapon" && ["Arts Wand", "Arts Staff"].includes(entry.name))
      .map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
    const tools = CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "tool" && entry.name !== "Instrument (X)")
      .map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
    fields.push(field("startingEquipment.weaponOrShield", "Choose one Light Melee weapon or Light Shield", [...weapons, ...shields], 1, 1, equipment.weaponOrShield ?? null));
    fields.push(field("startingEquipment.wandOrStaff", "Choose an Arts Wand or Arts Staff", casterUnits, 1, 1, equipment.wandOrStaff ?? null));
    fields.push(field("startingEquipment.toolkit", "Choose a starting Toolkit", tools, 1, 1, equipment.toolkit ?? null));
  }
  fields.push(field("castingUnit", "Choose your Casting Unit", ownedCastingUnitOptions(actor, equipment), 1, 1, choices.castingUnit ?? null));

  const talents = TALENTS;
  const basicOptions = talents.filter(entry => entry.classOption.tier === "Basic").map(entry => option(entry.id, entry.name, { sourceId: entry.id, effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect }));
  const advancedOptions = talents.filter(entry => entry.classOption.tier === "Advanced").map(entry => option(entry.id, entry.name, { sourceId: entry.id, effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect }));
  if (level >= 3) fields.push(field("talents.basic", "Choose a Basic Caster Talent", basicOptions, 1, 3, choices.talents.basic ?? null));
  if (level >= 8) {
    const currentBasic = choices.talents.basic;
    const moduleChoices = currentBasic ? [
      option({ mode: "upgrade", sourceId: currentBasic }, "Upgrade current Basic Talent with its Module Effect", { sourceId: currentBasic }),
      ...basicOptions.filter(o => o.value !== currentBasic).map(o => option({ mode: "new", sourceId: o.value }, `Choose new Basic Talent: ${o.label}`, { sourceId: o.value, effect: o.effect }))
    ] : [];
    fields.push(field("talents.basicAt8", "At 8th level, upgrade or choose a new Basic Talent", moduleChoices, 1, 8, choices.talents.basicAt8 ?? null));
  }
  if (level >= 9) fields.push(field("talents.advanced", "Choose an Advanced Caster Talent", advancedOptions, 1, 9, choices.talents.advanced ?? null));
  if (level >= 13) {
    const currentAdvanced = choices.talents.advanced;
    const moduleChoices = currentAdvanced ? [
      option({ mode: "upgrade", sourceId: currentAdvanced }, "Upgrade current Advanced Talent with its Module Effect", { sourceId: currentAdvanced }),
      ...advancedOptions.filter(o => o.value !== currentAdvanced).map(o => option({ mode: "new", sourceId: o.value }, `Choose new Advanced Talent: ${o.label}`, { sourceId: o.value, effect: o.effect }))
    ] : [];
    fields.push(field("talents.advancedAt13", "At 13th level, upgrade or choose a new Advanced Talent", moduleChoices, 1, 13, choices.talents.advancedAt13 ?? null));
  }

  const applied = new Set(progressionSnapshot(casterState(actor), null).asiLevels ?? []);
  for (const asiLevel of ASI_LEVELS.filter(value => value <= level && !applied.has(value))) {
    fields.push(field(`asi.${asiLevel}`, `Choose the Ability Score Improvement at level ${asiLevel}`,
      [option({ mode: "existing" }, "Already included in current ability scores"), ...asiOptions(actor)], 1, asiLevel, choices.asi[asiLevel] ?? null));
  }
  const hpApplied = new Set(progressionSnapshot(casterState(actor), null).hpLevels ?? []);
  for (let hpLevel = 1; hpLevel <= level; hpLevel++) {
    if (!hpApplied.has(hpLevel)) fields.push(field(`hp.${hpLevel}`, `Choose Hit Point gain for Caster level ${hpLevel}`, hpOptions(hpLevel), 1, hpLevel, choices.hp[hpLevel] ?? null));
  }
  if (branch?.sourceHeading === "Splash" && level >= 10) {
    fields.push(field("splashArts", "Implements of Destruction: choose two Standard-pool Arts that target an area", splashArtOptions(knownPools), 2, 10, choices.splashArts ?? []));
    fields.push(field("splashArtsReview", "GM review: both chosen Arts target a Sphere, Cone, Cube, Cylinder or Line", [option("reviewed", "GM reviewed: both chosen Arts target an area")], 1, 10, choices.splashArtsReview ?? null));
  }
  if (branch?.sourceHeading === "Mech-Accord") {
    const recordedTools = TOOL_CHOICES.filter(name => (Number(sourceSystem(actor).tools?.[toolKey(name)]?.value) || 0) >= 1 || name === choices.tool);
    const exchangeOptions = [...recordedTools.map(value => option(value, `Exchange ${value} proficiency`)), option("none", "Keep current proficiencies")];
    fields.push(field("mechExchange.proficiency", "Optional Mech-Accord proficiency exchange", exchangeOptions, 1, 1, choices.mechExchange?.proficiency ?? null));
    fields.push(field("mechExchange.startingToolkit", "Exchange your starting toolkit for an Engineering Kit", [option(false, "Keep selected toolkit"), option(true, "Take an Engineering Kit instead")], 1, 1, choices.mechExchange?.startingToolkit ?? null));
  }
  return { fields, branch, requiredPoolCount };
}

function getAtPath(object, path) { return path.split(".").reduce((value, key) => value?.[key], object); }

function isSet(value) { return value !== null && value !== undefined && value !== ""; }

function validateSelected(field, value) {
  const multiChoice = ["pools", "saves", "skills", "splashArts"].includes(field.key);
  const values = !multiChoice && field.count === 1 ? [value] : (Array.isArray(value) ? value : []);
  if (values.length !== field.count || values.some(v => !field.options.some(candidate => JSON.stringify(candidate.value) === JSON.stringify(v)))) return false;
  if (Array.isArray(value) && new Set(value.map(v => JSON.stringify(v))).size !== value.length) return false;
  if (field.key === "pools" && new Set(value).size !== value.length) return false;
  if (field.key === "saves" && new Set(value).size !== value.length) return false;
  if (field.key === "skills" && new Set(value).size !== value.length) return false;
  return true;
}

function findValue(choices, field) {
  if (field.key === "asi.4" || field.key.startsWith("asi.")) return choices.asi[field.key.slice(4)];
  if (field.key.startsWith("hp.")) return choices.hp[field.key.slice(3)];
  if (field.key.startsWith("talents.")) return getAtPath(choices, field.key);
  if (field.key.startsWith("startingEquipment.")) return getAtPath(choices, field.key);
  if (field.key.startsWith("mechExchange.")) return getAtPath(choices, field.key);
  return choices[field.key];
}

function setValue(choices, fieldKey, value) {
  const path = fieldKey.split(".");
  let target = choices;
  for (const segment of path.slice(0, -1)) target = target[segment] ??= {};
  target[path.at(-1)] = structuredClone(value);
}

function completeChoices(actor, supplied, profile, operationId) {
  const choices = normalizedChoices(actor, supplied);
  const branchId = selectedBranchId(actor, choices);
  if (!branchId || !BRANCH_KEY.has(branchId)) throw new Error("Choose one supported Caster Branch before applying setup.");
  const provisional = buildFields(actor, profile, { ...choices, branch: branchId });
  const invalid = [];
  for (const descriptor of provisional.fields) {
    const value = findValue(choices, descriptor);
    if (!isSet(value)) invalid.push(descriptor.key);
    else if (!validateSelected(descriptor, value)) invalid.push(descriptor.key);
  }
  if (invalid.length) throw new Error(`Complete or correct these Caster setup choices: ${invalid.join(", ")}.`);
  if (!ABILITIES.includes(choices.ability)) throw new Error("Choose Intelligence, Wisdom or Charisma as the Caster Spellcasting Ability.");
  for (const selection of [choices.talents.basic, choices.talents.advanced].filter(Boolean)) {
    if (!TALENTS.some(entry => entry.id === selection)) throw new Error("Choose a Caster talent from the source catalogue.");
  }
  for (const key of ["basicAt8", "advancedAt13"]) {
    const selection = choices.talents[key];
    if (selection && (!selection.sourceId || !["upgrade", "new"].includes(selection.mode) || !TALENTS.some(entry => entry.id === selection.sourceId))) {
      throw new Error(`Invalid ${key} talent selection.`);
    }
  }
  const unappliedAbilityChanges = {};
  const alreadyAppliedAsis = new Set(progressionSnapshot(casterState(actor), operationId).asiLevels ?? []);
  for (const [level, entry] of Object.entries(choices.asi ?? {})) {
    if (!ASI_LEVELS.includes(Number(level)) || Number(level) > profile.level) continue;
    if (entry?.mode === "existing") continue;
    const increases = entry?.increases;
    if (!Array.isArray(increases) || ![1, 2].includes(increases.length) || increases.reduce((sum, inc) => sum + Number(inc.amount), 0) !== 2 ||
      new Set(increases.map(inc => inc.ability)).size !== increases.length || increases.some(inc => !["str", "dex", "con", "int", "wis", "cha"].includes(inc.ability) || ![1, 2].includes(inc.amount))) {
      throw new Error(`Invalid Ability Score Improvement choice at level ${level}.`);
    }
    if (!alreadyAppliedAsis.has(Number(level))) {
      for (const increase of increases) {
        unappliedAbilityChanges[increase.ability] = (unappliedAbilityChanges[increase.ability] ?? 0) + increase.amount;
      }
    }
  }
  for (const [ability, increase] of Object.entries(unappliedAbilityChanges)) {
    if (currentAbility(actor, ability) + increase > 20) {
      throw new Error(`Ability Score Improvements would raise ${ability.toUpperCase()} above 20.`);
    }
  }
  if (choices.pools.length !== provisional.requiredPoolCount || new Set(choices.pools).size !== choices.pools.length || choices.pools.some(id => !standardPools.some(pool => pool.id === id))) {
    throw new Error(`Choose exactly ${provisional.requiredPoolCount} different Standard Arts Pools.`);
  }
  const recordedPools = casterState(actor);
  const replacementApproval = recordedPools.rulings.poolReplacement;
  const approvedGM = replacementApproval?.approvedBy && (globalThis.game?.users?.get
    ? game.users.get(replacementApproval.approvedBy)?.isGM === true
    : game?.user?.isGM === true && game.user.id === replacementApproval.approvedBy);
  if (recordedPools.enabled && recordedPools.pools.some(id => !choices.pools.includes(id)) &&
      !(replacementApproval?.value === "retainKnownArts" && replacementApproval.source?.trim().length >= 10 && approvedGM)) {
    throw new Error("Existing Standard Arts Pool choices cannot be replaced automatically. The source supplies no replacement rule; the GM must review and record the retain-known-Arts exception before changing these choices.");
  }
  if (choices.startingEquipment.mode === "items") {
    const startingToolkit = EQUIPMENT_BY_ID.get(choices.startingEquipment.toolkit);
    const mechExchange = BRANCH_KEY.get(branchId) === "mech-accord" && choices.mechExchange?.startingToolkit === true;
    if (!mechExchange && startingToolkit?.name !== choices.tool) {
      throw new Error("Your starting Toolkit must match the Toolkit proficiency you chose, unless you confirm the Mech-Accord Engineering Kit exchange.");
    }
  }
  if (BRANCH_KEY.get(branchId) === "splash" && profile.level >= 10) {
    // The generated Arts carry no native area data, so a GM confirms area eligibility for the exact pair chosen.
    const names = JSON.stringify([...choices.splashArts].map(nameKey).sort());
    if (globalThis.game?.user?.isGM) choices.splashArtsReviewedBy = { userId: game.user.id, names };
    const stamp = choices.splashArtsReviewedBy;
    const reviewer = stamp?.userId && (globalThis.game?.users?.get ? game.users.get(stamp.userId)?.isGM === true : game?.user?.isGM === true && game.user.id === stamp.userId);
    if (stamp?.names !== names || !reviewer) throw new Error("A GM must confirm that both Implements of Destruction Arts target a Sphere, Cone, Cube, Cylinder or Line.");
  }
  const validCastOptions = ownedCastingUnitOptions(actor, choices.startingEquipment);
  if (!validCastOptions.some(candidate => candidate.value === choices.castingUnit)) throw new Error("Choose a Casting Unit you own or selected as starting equipment.");
  for (let level = 1; level <= profile.level; level++) {
    const selection = choices.hp[level];
    const alreadyIncluded = selection?.mode === "existing" && selection.roll === 0;
    if (!alreadyIncluded && (!selection || !["fixed", "rolled"].includes(selection.mode) || !Number.isInteger(selection.roll) || selection.roll < 1 || selection.roll > 6 || level === 1 && (selection.mode !== "fixed" || selection.roll !== 6))) {
      if (!progressionSnapshot(casterState(actor), operationId).hpLevels?.includes(level)) throw new Error(`Choose a valid Hit Point gain for Caster level ${level}.`);
    }
  }
  return choices;
}

function lmdCp(system) { return Number(system.currency?.cp ?? 0) || 0; }

function sourceDataFromWorld(item) {
  const data = item.toObject ? item.toObject() : structuredClone(item);
  delete data._id;
  delete data.id;
  delete data.folder;
  return data;
}

function itemKey(item) {
  const grants = flag(item, "casterArtGrants");
  if (Array.isArray(grants) && grants[0]?.sourceKey) return grants[0].sourceKey;
  const grant = flag(item, "casterArtGrant");
  if (grant?.sourceKey) return grant.sourceKey;
  const chapterFiveId = flag(item, "chapterFiveId");
  return chapterFiveId ? `art:${chapterFiveId}` : null;
}

function itemIds(actor) { return list(actor?.items); }

function skillKey(name) { return SIMPLE_SKILLS[name]; }

function mergeSemicolon(current, additions) {
  return [...new Set([...(String(current ?? "").split(";").map(value => value.trim()).filter(Boolean)), ...additions])].join("; ");
}

function toolKey(name) { return `ak5e${nameKey(name)}`; }

function createArtSource(entry, poolIds) {
  const data = sourceEntryData(entry);
  data.flags.ak5e.art = { enabled: true,
    ...(nameKey(entry.name) === "detectmagic" ? { free: { level: entry.level ?? 1, maximum: null, spent: 0 } } : {}) };
  data.flags.ak5e.casterArtGrants = [{ sourceKey: `art:${entry.id}`, sourceIds: [entry.id, ...poolIds],
    sourceId: entry.id, sourceName: entry.name, poolIds: [...poolIds], kind: "ak5e" }];
  return data;
}

function mappedArtSource(item, member, mapping, poolIds, free = false) {
  const source = adoptedSpellData(item);
  delete source._id;
  const data = sourceDataFromWorld(item);
  data.type = "spell";
  data.name = member.name;
  data.system = { ...data.system,
    method: source["system.method"],
    prepared: source["system.prepared"],
    properties: source["system.properties"],
    materials: source["system.materials"] };
  data.flags ??= {};
  const art = { ...(data.flags.ak5e?.art ?? {}), enabled: true };
  if (free) art.free = { ...(art.free ?? {}), level: 1, maximum: null, spent: Number(art.free?.spent) || 0 };
  data.flags.ak5e = { ...(data.flags.ak5e ?? {}), art, casterArtGrants: [{
    sourceKey: `mapped:${nameKey(member.name)}`, sourceIds: [...poolIds], sourceName: member.name, mappedName: item.name, mappedUuid: mapping.uuid,
    mappingSource: mapping.source, poolIds: [...poolIds], kind: "dnd5e"
  }] };
  return data;
}

async function resolvePoolArts(actor, choices, missing, warnings = []) {
  const poolById = new Map(standardPools.map(pool => [pool.id, pool]));
  const byArt = new Map();
  for (const poolId of choices.pools) {
    const pool = poolById.get(poolId);
    for (const member of pool?.members ?? []) {
      const key = member.sourceId ? `art:${member.sourceId}` : `mapped:${nameKey(member.name)}`;
      const current = byArt.get(key) ?? { member, poolIds: [] };
      current.poolIds.push(poolId);
      byArt.set(key, current);
    }
  }
  const extras = [];
  if (casterLevel(actor) >= 2) extras.push("Detect Magic");
  if (casterLevel(actor) >= 5) extras.push("Counterspell", "Dispel Magic");
  for (const name of extras) {
    const entry = ART_BY_NAME.get(nameKey(name));
    const key = entry ? `art:${entry.id}` : `mapped:${nameKey(name)}`;
    if (!byArt.has(key)) byArt.set(key, { member: { name, level: EXTRA_ART_LEVELS[nameKey(name)], sourceId: entry?.id ?? null }, poolIds: [], feature: true });
  }
  for (const name of choices.splashArts ?? []) {
    const member = standardPools.flatMap(pool => pool.members).find(candidate => nameKey(candidate.name) === nameKey(name));
    if (!member) continue;
    const key = member.sourceId ? `art:${member.sourceId}` : `mapped:${nameKey(member.name)}`;
    const current = byArt.get(key) ?? { member, poolIds: [] };
    current.feature = "implementsOfDestruction";
    byArt.set(key, current);
  }
  const docs = [];
  const updates = [];
  const existingSpell = sourceKey => itemIds(actor).find(item => item.type === "spell" &&
    (itemKey(item) === sourceKey || (Array.isArray(flag(item, "casterArtGrants")) && flag(item, "casterArtGrants").some(grant => grant.sourceKey === sourceKey)) ||
      sourceKey.startsWith("art:") && flag(item, "chapterFiveId") === sourceKey.slice(4)));
  const addExistingGrant = (item, grant, free = false) => {
    const current = flag(item, "casterArtGrants") ?? [];
    const prior = current.find(value => value.sourceKey === grant.sourceKey);
    const mergedGrant = prior ? { ...prior, ...grant,
      sourceIds: [...new Set([...(prior.sourceIds ?? []), ...(grant.sourceIds ?? [])])],
      poolIds: [...new Set([...(prior.poolIds ?? []), ...(grant.poolIds ?? [])])] } : grant;
    const grants = [...current.filter(value => value.sourceKey !== grant.sourceKey), mergedGrant];
    const changes = { "flags.ak5e.casterArtGrants": grants };
    if (free) {
      const art = flag(item, "art") ?? {};
      changes["flags.ak5e.art"] = { ...art, enabled: true,
        free: { ...(art.free ?? {}), level: 1, maximum: null, spent: Number(art.free?.spent) || 0 } };
    }
    updates.push({ item, changes });
  };
  for (const [key, { member, poolIds, feature }] of byArt) {
    // Implements of Destruction grants are recorded on the same grant so they survive pool changes.
    const marked = grant => feature === "implementsOfDestruction" ? { ...grant, feature } : grant;
    const markDoc = () => { if (feature === "implementsOfDestruction") docs.at(-1).flags.ak5e.casterArtGrants = docs.at(-1).flags.ak5e.casterArtGrants.map(marked); };
    if (member.sourceId) {
      const entry = ART_BY_ID.get(member.sourceId);
      if (!entry) { missing.push({ kind: "art", name: member.name, sourceId: member.sourceId, reason: "MissingGeneratedArt" }); continue; }
      const grant = { sourceKey: key, sourceIds: [entry.id, ...poolIds], sourceId: entry.id, sourceName: entry.name, poolIds: [...poolIds], kind: "ak5e" };
      const existing = existingSpell(key);
      if (existing) { addExistingGrant(existing, marked(grant), nameKey(entry.name) === "detectmagic" && casterLevel(actor) >= 2); continue; }
      docs.push(createArtSource(entry, poolIds)); markDoc();
      continue;
    }
    const existing = existingSpell(key);
    const freeDetectMagic = casterLevel(actor) >= 2 && nameKey(member.name) === "detectmagic";
    if (existing) {
      if (Number(existing.system?.level) !== Number(member.level)) {
        missing.push({ kind: "mapping", name: member.name, expectedLevel: member.level, actualLevel: Number(existing.system?.level), reason: "MappedArtLevelMismatch" });
        warnings.push(`Mapped Art ${member.name} has a different level than the source grant; it was not enabled or changed.`);
        continue;
      }
      addExistingGrant(existing, marked({ sourceKey: key, sourceIds: [...poolIds], sourceName: member.name, poolIds: [...poolIds], kind: "dnd5e" }), freeDetectMagic);
      continue;
    }
    const mapping = mappingFor(member.name);
    if (!mapping?.uuid) {
      missing.push({ kind: "mapping", name: member.name, level: member.level, poolIds: [...poolIds], reason: "GmMappingRequired" });
      continue;
    }
    let source;
    try { source = await globalThis.fromUuid?.(mapping.uuid); } catch { source = null; }
    if (!source || source.type !== "spell") {
      missing.push({ kind: "mapping", name: member.name, level: member.level, uuid: mapping.uuid, reason: "MappedSpellUnavailable" });
      continue;
    }
    const expectedLevel = Number(member.level), mappedLevel = Number(source.system?.level);
    if (!Number.isInteger(mappedLevel) || mappedLevel !== expectedLevel) {
      missing.push({ kind: "mapping", name: member.name, expectedLevel, actualLevel: Number.isInteger(mappedLevel) ? mappedLevel : null,
        uuid: mapping.uuid, reason: "MappedArtLevelMismatch" });
      warnings.push(`GM-approved mapping for ${member.name} uses a spell of a different level; no document was imported.`);
      continue;
    }
    if (nameKey(source.name) !== nameKey(member.name)) warnings.push(`GM-approved source-name alias: ${member.name} uses ${source.name} from ${mapping.source}.`);
    docs.push(mappedArtSource(source, member, mapping, poolIds, freeDetectMagic)); markDoc();
  }
  return { docs, updates };
}

function setupContext(actor, profile, branchId, choices) {
  const externalItems = itemIds(actor).filter(item => !flag(item, "chapterThreeId") && !flag(item, "chapterFourId") && !flag(item, "chapterFiveId") && !flag(item, "casterArtGrant") && !flag(item,"casterArtGrants"))
    .map(item => `${item.id}:${item.type}`).sort();
  const stable = [CASTER_ID, actorClass(actor)?.id ?? null, profile.level, branchId,
    externalItems, choices.ability ?? null, choices.pools ?? [], choices.saves ?? [], choices.skills ?? [], choices.tool ?? null,
    choices.castingUnit ?? null, choices.startingEquipment ?? {}, choices.asi ?? {}, choices.hp ?? {}, choices.talents ?? {}, choices.splashArts ?? []];
  return JSON.stringify(stable);
}

function stateWithDefaults(actor) {
  const existing = casterState(actor);
  return { ...structuredClone(DEFAULT_STATE), ...existing, choices: { ...existing.choices }, operations: [...existing.operations] };
}

function checkOwner(actor) {
  if (actor?.documentName !== "Actor" || actor?.type !== "character" || !actor.isOwner || actor.pack) {
    throw new Error("Open Caster setup on a Caster character that you own in the World.");
  }
}

function stateChoicesForView(actor, supplied = {}) {
  const state = casterState(actor);
  const choices = normalizedChoices(actor, supplied);
  const existingBranch = branchSourceId(actor);
  if (existingBranch) choices.branch = existingBranch;
  else if (state.enabled && state.choices.branch) choices.branch = state.choices.branch;
  return choices;
}

export function getCasterSetupChoices(actor, options = {}) {
  const empty = { applicable: false, configured: false, level: null, branch: null, contextKey: null, choices: {}, pending: [], missing: [], blocked: [] };
  if (actor?.type !== "character" || actor?.pack) return empty;
  const profile = casterProfile(actor);
  if (!profile.applicable) return empty;
  const choices = stateChoicesForView(actor, options.choices ?? {});
  const branchId = branchSourceId(actor) ?? choices.branch ?? null;
  const setupProfile = { ...profile, branch: BRANCH_KEY.get(branchId) ?? null };
  const built = buildFields(actor, setupProfile, choices);
  const pending = built.fields.filter(descriptor => {
    const value = findValue(choices, descriptor);
    return !isSet(value) || !validateSelected(descriptor, value);
  });
  const blocked = [...profile.blocked.filter(code => code !== "BranchNotChosen")];
  if (branchId && !BRANCH_KEY.has(branchId)) blocked.push("UnsupportedBranch");
  const choicesView = structuredClone(choices);
  const summary = [
    `${profile.level ?? "?"}-level Caster`,
    built.branch ? `${built.branch.sourceHeading} branch` : "Branch not chosen",
    choices.ability ? `Spellcasting ability: ${choices.ability.toUpperCase()}` : "Spellcasting ability not chosen",
    `${choices.pools?.length ?? 0}/${built.requiredPoolCount} Standard Arts Pools selected`
  ];
  choicesView.summary = summary;
  return {
    applicable: true,
    configured: casterState(actor).enabled,
    level: profile.level,
    branch: built.branch ? BRANCH_KEY.get(built.branch.id) : null,
    branchId: built.branch?.id ?? branchId,
    contextKey: setupContext(actor, profile, branchId, choices),
    choices: choicesView,
    pending,
    missing: [],
    blocked: [...new Set(blocked)]
  };
}

function equipmentCopy(sourceId, missing, { allowCanonicalSource = false } = {}) {
  const entry = EQUIPMENT_BY_ID.get(sourceId);
  if (!entry) { missing.push({ kind: "equipment", sourceId, reason: "UnknownSourceEquipment" }); return null; }
  const source = existingWorldSource(sourceId);
  if (!source && !allowCanonicalSource) { missing.push({ kind: "equipment", sourceId, name: entry.name, reason: "SourceEquipmentNotInstalled" }); return null; }
  const data = source ? sourceDataFromWorld(source) : sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e = { ...(data.flags.ak5e ?? {}), casterGrant: { sourceId, kind: "startingEquipment" } };
  return data;
}

function addProficiencyUpdates(actor, choices, branchHeading, actorUpdate, warnings, state) {
  const system = sourceSystem(actor);
  for (const ability of choices.saves) actorUpdate[`system.abilities.${ability}.proficient`] = Math.max(1, Number(system.abilities?.[ability]?.proficient) || 0);
  for (const skill of choices.skills) {
    const key = skillKey(skill);
    actorUpdate[`system.skills.${key}.value`] = Math.max(1, Number(system.skills?.[key]?.value) || 0);
  }
  const weapons = mergeSemicolon(system.traits?.weaponProf?.custom, ["Light Melee"]);
  const armor = mergeSemicolon(system.traits?.armorProf?.custom, ["Light Shields"]);
  actorUpdate["system.traits.weaponProf.custom"] = weapons;
  actorUpdate["system.traits.armorProf.custom"] = armor;
  const tool = choices.tool;
  if (tool) {
    const key = toolKey(tool);
    actorUpdate[`system.tools.${key}.value`] = Math.max(1, Number(system.tools?.[key]?.value) || 0);
    if (!system.tools?.[key]) actorUpdate[`system.tools.${key}.ability`] = tool.includes("Vehicles") || tool.includes("Land Vehicles") ? "dex" : "int";
  }
  if (branchHeading === "Mech-Accord") {
    const technology = Number(system.skills?.ak5etech?.value) || 0;
    // Technology is granted by Mech-Accord. If this setup also grants an
    // already-held Caster Technology proficiency, D&D5e represents the second
    // grant as expertise. Persist that first decision so reapplying setup does
    // not mistake our own proficiency for an authored duplicate.
    const priorGrant = state.mechTechnologyGrant;
    const technologyGrant = priorGrant?.value === 1 || priorGrant?.value === 2
      ? priorGrant
      : { before: technology, value: technology >= 1 || choices.skills.includes("Tech") ? 2 : 1 };
    actorUpdate["system.skills.ak5etech.value"] = Math.max(technology, technologyGrant.value);
    state.mechTechnologyGrant = structuredClone(technologyGrant);
    actorUpdate["system.tools.ak5evehiclesdrones.value"] = Math.max(1, Number(system.tools?.ak5evehiclesdrones?.value) || 0);
    const exchange = choices.mechExchange?.proficiency;
    if (exchange && exchange !== "none") {
      const exchangeKey = toolKey(exchange);
      const current = Number(system.tools?.[exchangeKey]?.value) || (choices.tool === exchange ? 1 : 0);
      if (current >= 1) {
        actorUpdate[`system.tools.${exchangeKey}.value`] = 0;
        const eng = "ak5eengineeringkit";
        actorUpdate[`system.tools.${eng}.value`] = Math.max(1, Number(system.tools?.[eng]?.value) || 0);
      } else warnings.push(`Cannot exchange ${exchange}: that proficiency is not currently recorded on this Actor.`);
    }
  }
}

function processTalentChoices(actor, choices, createItems, updateItems, warnings) {
  const active = {};
  const selected = [];
  for (const tier of ["basic", "advanced"]) {
    const first = choices.talents[tier];
    if (!first) continue;
    const moduleChoice = choices.talents[tier === "basic" ? "basicAt8" : "advancedAt13"];
    const baseEntry = TALENTS.find(item => item.id === first);
    if (!baseEntry) { warnings.push(`Talent source record ${first} is missing.`); continue; }
    const moduleActive = moduleChoice?.mode === "upgrade";
    active[tier] = { sourceId: first, moduleActive: moduleActive || false };
    selected.push({ entry: baseEntry, tier, moduleActive: moduleActive || false });
    if (moduleChoice?.mode === "new") {
      const moduleEntry = TALENTS.find(item => item.id === moduleChoice.sourceId);
      if (!moduleEntry) { warnings.push(`Talent source record ${moduleChoice.sourceId} is missing.`); continue; }
      // Choosing a different talent gains its base effect. The Module effect
      // belongs only to the explicit upgrade choice for the existing talent.
      active[`${tier}Module`] = { sourceId: moduleEntry.id, moduleActive: false };
      selected.push({ entry: moduleEntry, tier, moduleActive: false });
    }
  }
  for (const selectedTalent of selected) {
    const { entry, tier, moduleActive } = selectedTalent;
    const existing = itemIds(actor).find(item => flag(item, "casterTalent")?.sourceId === entry.id || flag(item, "chapterThreeId") === entry.id);
    if (existing) {
      const currentFlag = flag(existing, "casterTalent") ?? {};
      if (currentFlag.moduleActive !== moduleActive || currentFlag.active === false) {
        updateItems.push({ item: existing, changes: {
          "flags.ak5e.casterTalent": { sourceId: entry.id, tier, moduleActive, active: true,
            effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect }
        } });
      }
      continue;
    }
    const data = sourceEntryData(entry);
    data.flags.ak5e.casterTalent = { sourceId: entry.id, tier, moduleActive, active: true,
      effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect };
    createItems.push(data);
  }
  for (const [tier, talent] of Object.entries(active)) {
    if (!tier.endsWith("Previous")) continue;
    const previous = itemIds(actor).find(item => (flag(item, "casterTalent")?.sourceId ?? flag(item, "chapterThreeId")) === talent.sourceId);
    if (previous) updateItems.push({ item: previous, changes: { "flags.ak5e.casterTalent.active": false, "flags.ak5e.casterTalent.retired": true } });
  }
  const selectedIds = new Set(selected.map(({ entry }) => entry.id));
  for (const item of itemIds(actor)) {
    const managed = flag(item, "casterTalent");
    if (!managed || managed.active === false || selectedIds.has(managed.sourceId)) continue;
    updateItems.push({ item, changes: { "flags.ak5e.casterTalent.active": false, "flags.ak5e.casterTalent.retired": true } });
    warnings.push(`Previously selected managed talent ${managed.sourceId} was disabled; review this changed choice before play.`);
  }
  return active;
}

function addManagedFeatures(actor, branchId, level, createItems) {
  const existing = new Set(itemIds(actor).map(docSourceId).filter(Boolean));
  const entries = [...CLASS_FEATURES.filter(entry => Number.isInteger(entry.level) && entry.level <= level)];
  entries.push(...BRANCH_FEATURES.filter(entry => entry.parentBranch === BRANCHES.find(branch => branch.id === branchId)?.sourceHeading && Number.isInteger(entry.level) && entry.level <= level));
  for (const entry of entries) {
    if (existing.has(entry.id)) continue;
    createItems.push(sourceEntryData(entry));
  }
  const branchEntry = CLASS_BY_ID.get(branchId);
  if (branchEntry && !existing.has(branchEntry.id)) createItems.push(sourceEntryData(branchEntry));
}

const ELEMENTAL_MANAGED_FLAG = "casterManagedEffect";
function elementalBeingDamageTypes() {
  const table = new Map();
  for (const match of String(ELEMENTAL_BEING?.rawSource ?? "").matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)) {
    const pool = nameKey(match[1]).replace(/arts$/, "");
    const type = nameKey(match[2]);
    if (pool && type && pool !== "artspool") table.set(pool, type);
  }
  return table;
}

function normalizedEffectChanges(changes) {
  return (Array.from(changes ?? [])).map(change => ({
    key: change.key, mode: Number(change.mode), value: String(change.value), priority: Number(change.priority ?? 0)
  }));
}

function elementalBeingPlan(actor, branchId, level, poolIds, createEffects, updateEffects, warnings) {
  const poolTypes = elementalBeingDamageTypes();
  const pools = poolIds.map(id => standardPools.find(pool => pool.id === id)).filter(Boolean);
  const attached = branchSourceId(actor) === branchId;
  const initialBranchGrant = branchId === "subclass-caster-core" && !branchSourceId(actor) && !casterState(actor).enabled;
  const eligible = branchId === "subclass-caster-core" && (attached || initialBranchGrant) && level >= 10;
  const damageTypes = eligible ? [...new Set(pools.map(pool => poolTypes.get(nameKey(pool.name).replace(/arts$/, ""))).filter(Boolean))].sort() : [];
  const managedEffects = list(actor?.effects).filter(effect => flag(effect, ELEMENTAL_MANAGED_FLAG)?.sourceId === ELEMENTAL_BEING?.id);
  if (managedEffects.length > 1) warnings.push("More than one Elemental Being managed Active Effect exists; review duplicate effects manually.");
  const effect = managedEffects[0];

  if (!eligible) {
    if (branchId === "subclass-caster-core" && level >= 10 && branchSourceId(actor) !== branchId) {
      warnings.push("The selected Core branch is not attached to the Actor; review the branch before enabling Elemental Being.");
    }
    if (effect && effect.disabled !== true) {
      const current = normalizedEffectChanges(effect.changes ?? effect._source?.changes);
      const managed = flag(effect, ELEMENTAL_MANAGED_FLAG) ?? {};
      const customized = !Array.isArray(managed.managedChanges) || JSON.stringify(current) !== JSON.stringify(normalizedEffectChanges(managed.managedChanges));
      const changes = { disabled: true, [`flags.ak5e.${ELEMENTAL_MANAGED_FLAG}.active`]: false };
      if (customized) {
        changes[`flags.ak5e.${ELEMENTAL_MANAGED_FLAG}.reviewRequired`] = true;
      }
      warnings.push("Elemental Being is no longer eligible. Its managed Active Effect will be disabled for review.");
      if (customized) warnings.push("Customized Elemental Being changes are preserved for GM review.");
      updateEffects.push({ effect, changes });
    }
    return;
  }

  const changes = damageTypes.map(type => ({ key: "system.traits.dr.value", mode: 2, value: type, priority: 20 }));
  const provenance = {
    sourceId: ELEMENTAL_BEING.id,
    source: "Chapter 3, Core: Elemental Being pool-to-damage-type table",
    poolIds: pools.map(pool => pool.id), damageTypes,
    managedChanges: normalizedEffectChanges(changes), active: true, reviewRequired: false
  };
  if (!effect) {
    createEffects.push({
      name: "Caster: Elemental Being Resistance", img: "icons/magic/defensive/shield-barrier-blue.webp",
      disabled: false, transfer: false, changes,
      flags: { ak5e: { [ELEMENTAL_MANAGED_FLAG]: provenance } }
    });
    return;
  }

  const managed = flag(effect, ELEMENTAL_MANAGED_FLAG) ?? {};
  const current = normalizedEffectChanges(effect.changes ?? effect._source?.changes);
  const expectedPrevious = normalizedEffectChanges(managed.managedChanges);
  if (!Array.isArray(managed.managedChanges) || JSON.stringify(current) !== JSON.stringify(expectedPrevious)) {
    warnings.push("Elemental Being Active Effect has changes beyond its managed baseline; its changes were preserved and require GM review.");
    return;
  }
  const update = {};
  if (JSON.stringify(current) !== JSON.stringify(normalizedEffectChanges(changes))) update.changes = changes;
  if (effect.disabled) update.disabled = false;
  if (JSON.stringify(managed) !== JSON.stringify(provenance)) update[`flags.ak5e.${ELEMENTAL_MANAGED_FLAG}`] = provenance;
  if (Object.keys(update).length) updateEffects.push({ effect, changes: update });
}

function buildProgression(actor, choices, level, actorUpdate, warnings, state, operationId) {
  const previous = progressionSnapshot(state, operationId);
  const hpApplied = new Set(previous.hpLevels ?? []);
  const asiApplied = new Set(previous.asiLevels ?? []);
  const progression = { hpLevels: [...hpApplied], asiLevels: [...asiApplied] };
  const system = sourceSystem(actor);
  const con = Number(system.abilities?.con?.mod ?? Math.floor((currentAbility(actor, "con") - 10) / 2)) || 0;
  let hpDelta = 0;
  for (let hpLevel = 1; hpLevel <= level; hpLevel++) {
    if (hpApplied.has(hpLevel)) continue;
    const choice = choices.hp[hpLevel];
    if (!choice) continue;
    if (choice.mode !== "existing") hpDelta += Number(choice.roll) + con;
    progression.hpLevels.push(hpLevel);
  }
  if (hpDelta) {
    const max = Number(system.attributes?.hp?.max) || 0;
    const value = Number(system.attributes?.hp?.value) || 0;
    actorUpdate["system.attributes.hp.max"] = Math.max(0, max + hpDelta);
    // Preserve current HP; setup grants maximum capacity and never heals as a side effect.
    actorUpdate["system.attributes.hp.value"] = value;
  }
  const abilityChanges = {};
  for (const asiLevel of ASI_LEVELS.filter(value => value <= level && !asiApplied.has(value))) {
    const selection = choices.asi[asiLevel];
    if (!selection || (selection.mode !== "existing" && !selection.increases)) continue;
    if (selection.mode === "existing") {
      progression.asiLevels.push(asiLevel);
      continue;
    }
    for (const increase of selection.increases) abilityChanges[increase.ability] = (abilityChanges[increase.ability] ?? 0) + increase.amount;
    progression.asiLevels.push(asiLevel);
  }
  for (const [ability, increase] of Object.entries(abilityChanges)) {
    actorUpdate[`system.abilities.${ability}.value`] = currentAbility(actor, ability) + increase;
  }
  const pendingOperation = operationId && activeOperation(state, operationId);
  const savedScalarPlan = pendingOperation?.progression?.scalarPlan;
  if (savedScalarPlan && typeof savedScalarPlan === "object") {
    progression.scalarPlan = structuredClone(casterScalarRecords(savedScalarPlan));
    progression.recoveryConflicts = [];
    for (const scalar of progression.scalarPlan) {
      const path=scalar.path;
      const current = Number(scalarAtActor(actor, path));
      if (current !== Number(scalar.before) && current !== Number(scalar.after)) {
        progression.recoveryConflicts.push(`${path}: expected ${scalar.before} or ${scalar.after}, found ${current}.`);
        continue;
      }
      actorUpdate[path] = scalar.after;
    }
  } else if (pendingOperation && pendingOperation.status !== "complete" &&
      ((pendingOperation.progression?.hpLevels?.length ?? 0) || (pendingOperation.progression?.asiLevels?.length ?? 0))) {
    progression.recoveryConflicts = ["This pending setup receipt predates absolute Hit Point/Ability Score recovery data; request GM review before retrying."];
  } else {
    progression.scalarPlan = [];
    for (const [path, after] of Object.entries(actorUpdate)) {
      if (path === "system.attributes.hp.max" || /^system\.abilities\.[^.]+\.value$/.test(path)) {
        progression.scalarPlan.push({path, before: Number(scalarAtActor(actor, path)), after: Number(after) });
      }
    }
    progression.recoveryConflicts = [];
  }
  if (level < Math.max(...hpApplied, ...asiApplied, 0)) warnings.push("Caster level was reduced. Previously applied Hit Points and Ability Score Improvements were preserved and require GM review.");
  return progression;
}

function buildActorChanges(actor, profile, choices, branchId, state, operationId, warnings) {
  const actorUpdate = {};
  const table = casterTable(profile.level);
  const previous = sourceSystem(actor);
  const currentAP = flag(actor, "artsPoints") ?? {};
  const initial = !actor.getFlag?.("ak5e", "artsPoints") && !actor.flags?.ak5e?.artsPoints;
  actorUpdate["flags.ak5e.artsPoints"] = {
    ...structuredClone(currentAP), maximum: table.maximum,
    value: initial ? table.maximum : Number(currentAP.value) || 0,
    maximumArtLevel: table.maximumArtLevel,
    ninthLevelCast: currentAP.ninthLevelCast === true
  };
  const casting = flag(actor, "casting") ?? {};
  actorUpdate["flags.ak5e.casting"] = { ...structuredClone(casting), version: 1, enabled: true, ability: choices.ability,
    recovery: "long", castingUnit: choices.castingUnit, controller: actor.id };
  actorUpdate["system.attributes.spellcasting"] = choices.ability;
  // Caster source rules define a d6. Keep authored class data intact if it already conflicts.
  const classItem = actorClass(actor);
  if (classItem?.system?.hd?.denomination !== "d6") warnings.push("The attached class Item does not expose a d6 Hit Die; review its authored Hit Die field.");
  addProficiencyUpdates(actor, choices, BRANCHES.find(entry => entry.id === branchId)?.sourceHeading, actorUpdate, warnings, state);
  const equipment = choices.startingEquipment;
  // The currency option is starting equipment and must never be paid again
  // during a later level-update setup.
  if (equipment.mode === "cash" && !state.enabled) actorUpdate["system.currency.cp"] = lmdCp(previous) + 1300;
  if (equipment.mode === "items" && BRANCHES.find(entry => entry.id === branchId)?.sourceHeading === "Mech-Accord" && choices.mechExchange?.startingToolkit === true) {
    warnings.push("Mech-Accord starting-toolkit exchange is recorded; the Engineering Kit item is added only when its Chapter 4 source record is installed.");
  }
  const progression = buildProgression(actor, choices, profile.level, actorUpdate, warnings, state, operationId);
  return { actorUpdate, progression, mechTechnologyGrant: state.mechTechnologyGrant };
}

function getStoredOperationResult(operation) {
  return { created: operation.created ?? 0, updated: operation.updated ?? 0, missing: operation.missing ?? [], warnings: operation.warnings ?? [], operationId: operation.id, recovered: true };
}

/** Build a no-write preview from the current Actor, explicit selections and reviewed spell mappings. */
export async function previewCasterSetup(actor, options = {}) {
  checkOwner(actor);
  const profile = profileForSetup(actor);
  if (!profile.level) throw new Error("Caster level must be from 1 to 20.");
  const choices = stateChoicesForView(actor, options.choices ?? {});
  const branchId = selectedBranchId(actor, choices);
  const branch = BRANCHES.find(entry => entry.id === branchId);
  const state = stateWithDefaults(actor);
  const pending = [];
  const missing = [];
  const warnings = [];
  if (!branch) pending.push(field("branch", "Choose a supported Caster Branch", BRANCHES.map(entry => option(entry.id, entry.sourceHeading, { sourceId: entry.id })), 1, 1, null));
  let complete = choices;
  if (branch) {
    const provisional = buildFields(actor, profile, { ...choices, branch: branchId });
    for (const descriptor of provisional.fields) {
      const value = findValue(choices, descriptor);
      if (!isSet(value) || !validateSelected(descriptor, value)) pending.push({ ...descriptor, selected: value });
    }
    try { complete = completeChoices(actor, choices, profile, options.operationId); }
    catch (error) {
      warnings.push(error.message);
      pending.push({ key: "choices.validation", label: error.message, options: [], selected: null, invalid: true });
    }
  }
  const createItems = [];
  const updateItems = [];
  const createEffects = [];
  const updateEffects = [];
  let actorUpdate = {};
  let statePlan = state;
  let progression = progressionSnapshot(state, options.operationId);
  if (branch && pending.length === 0) {
    addManagedFeatures(actor, branchId, profile.level, createItems);
    processTalentChoices(actor, complete, createItems, updateItems, warnings);
    const artsPlan = await resolvePoolArts(actor, complete, missing, warnings);
    createItems.push(...artsPlan.docs);
    updateItems.push(...artsPlan.updates);
    if (complete.startingEquipment.mode === "items") {
      for (const id of [complete.startingEquipment.weaponOrShield, complete.startingEquipment.wandOrStaff, complete.startingEquipment.toolkit]) {
        if (BRANCH_KEY.get(branchId) === "mech-accord" && id === complete.startingEquipment.toolkit && complete.mechExchange?.startingToolkit) {
          const engineering = EQUIPMENT_BY_NAME.get("engineeringkit");
          if (engineering) {
            const copy = equipmentCopy(engineering.id, missing, { allowCanonicalSource: true });
            if (copy) createItems.push(copy);
          }
        } else {
          const copy = equipmentCopy(id, missing, { allowCanonicalSource: true });
          if (copy) createItems.push(copy);
        }
      }
    }
    const changes = buildActorChanges(actor, profile, complete, branchId, state, options.operationId, warnings);
    actorUpdate = changes.actorUpdate;
    if (changes.progression.recoveryConflicts?.length) {
      pending.push({ key: "progression.recovery", label: changes.progression.recoveryConflicts.join("; "), options: [], selected: null, invalid: true });
    }
    elementalBeingPlan(actor, branchId, profile.level, complete.pools, createEffects, updateEffects, warnings);
    const operation = activeOperation(state, options.operationId);
    if (operation?.currencyBefore !== undefined && actorUpdate["system.currency.cp"] !== undefined) {
      actorUpdate["system.currency.cp"] = Number(operation.currencyBefore) + 1300;
    }
    progression = changes.progression;
    const finalState = {
      ...state,
      version: 1,
      enabled: true,
      // Keep selections distinct from their derived active Module state. This
      // preserves the original talent and lets the chooser explain the choice.
      choices: { ...complete },
      pools: [...complete.pools]
    };
    statePlan = finalState;
  }
  createItems.splice(0, createItems.length, ...missingCasterItems(actor, createItems));
  const contextKey = setupContext(actor, profile, branchId, complete);
  return {
    actorUpdate,
    createItems,
    updateItems,
    createEffects,
    updateEffects,
    missing,
    warnings,
    state: statePlan,
    progression,
    contextKey,
    branch: branch?.sourceHeading ?? null,
    level: profile.level,
    current: state.enabled ? [`${state.pools.length} Standard Arts Pools recorded`, "Current AP and use counters will be preserved"] : [],
    summary: [
      `Caster level ${profile.level}: ${casterTable(profile.level).maximum} maximum AP and maximum Art level ${casterTable(profile.level).maximumArtLevel}.`,
      branch ? `${branch.sourceHeading} branch; ${complete.pools?.length ?? 0} Standard Arts Pools.` : "Choose a Caster Branch to continue.",
      `${createItems.length} managed Items to add, ${updateItems.length} managed Items to update, ${missing.length} unresolved source entries.`
    ],
    pending,
    blocked: profile.blocked.filter(code => code !== "BranchNotChosen")
  };
}

/** Read-only view required by the public Caster controls. */
export { casterProfile, casterFeatures, casterState, casterLevel, casterBranch, casterTable, standardPools };

/** GM-approved D&D5e source mapping. No mapping is guessed from a name or search result. */
export async function configureCasterMapping(name, uuid, source) {
  if (!globalThis.game?.user?.isGM) throw new Error("Only a GM can configure Caster Art source mappings.");
  if (!String(name ?? "").trim() || !String(uuid ?? "").trim() || !String(source ?? "").trim()) throw new Error("Enter the exact Art name, document UUID and reviewed source.");
  const member = standardPools.flatMap(pool => pool.members).find(candidate => nameKey(candidate.name) === nameKey(name) && !candidate.sourceId);
  const extraName = ["Detect Magic", "Counterspell", "Dispel Magic"].find(candidate => nameKey(candidate) === nameKey(name));
  if (!member && !extraName) throw new Error("Only a named D&D5e Art listed in the Caster source pools or class grants can be mapped.");
  const document = await globalThis.fromUuid?.(uuid);
  if (!document || document.type !== "spell") throw new Error("The mapped UUID must resolve to a D&D5e spell Item.");
  const expectedLevel = expectedArtLevel(name);
  const mappedLevel = Number(document.system?.level);
  if (expectedLevel === null || !Number.isInteger(mappedLevel) || mappedLevel !== expectedLevel) {
    throw new Error(`The mapped spell must match the source Art level ${expectedLevel ?? "unknown"}; found ${Number.isInteger(mappedLevel) ? mappedLevel : "an unspecified level"}.`);
  }
  const mappings = { ...getMappings(), [nameKey(name)]: { requestedName: String(name).trim(), uuid, source: String(source).trim(),
    mappedName: document.name, approvedBy: game.user.id, approvedAt: Date.now() } };
  await game.settings.set("ak5e", "casterArtMappings", mappings);
  return structuredClone(mappings[nameKey(name)]);
}

/** Source-first Art resolver shared with branch features that temporarily grant an Art. */
export async function resolveCasterArtData(name) {
  const normalized = nameKey(name);
  const entry = ART_BY_NAME.get(normalized);
  if (entry) return createArtSource(entry, []);
  const member = standardPools.flatMap(pool => pool.members).find(candidate => nameKey(candidate.name) === normalized && !candidate.sourceId)
    ?? (["Detect Magic", "Counterspell", "Dispel Magic"].some(candidate => nameKey(candidate) === normalized)
      ? { name: String(name), level: 1, sourceId: null } : null);
  if (!member) return null;
  const mapping = mappingFor(member.name);
  if (!mapping?.uuid) return null;
  let document;
  try { document = await globalThis.fromUuid?.(mapping.uuid); } catch { return null; }
  if (!document || document.type !== "spell" || Number(document.system?.level)!==expectedArtLevel(name)) return null;
  if (nameKey(document.name) !== normalized) console.warn(`AK5e | Caster Art mapping: GM approved ${name} as ${document.name}.`);
  return mappedArtSource(document, member, mapping, []);
}

/**
 * Item data for a named Art of a known level from any pool: the AK5e record when one exists, otherwise the
 * GM-approved spell mapping (the same `casterArtMappings` store) whose spell level must match. Null when unresolved.
 */
export async function resolvePoolArtData(name, level, poolIds = []) {
  const entry = ART_BY_NAME.get(nameKey(name));
  if (entry) return createArtSource(entry, poolIds);
  const mapping = mappingFor(name);
  if (!mapping?.uuid) return null;
  let document;
  try { document = await globalThis.fromUuid?.(mapping.uuid); } catch { return null; }
  if (!document || document.type !== "spell" || Number(document.system?.level) !== Number(level)) return null;
  return mappedArtSource(document, { name, level, sourceId: null }, mapping, poolIds);
}

function randomOperationId() {
  return globalThis.foundry?.utils?.randomID?.() ?? `caster-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function applyActorUpdate(actor, changes) {
  if (Object.keys(changes).length) {
    const result = await actor.update(changes);
    if (result === false) throw new Error("Actor changes were not saved. The Caster setup receipt remains available for recovery.");
  }
}

function missingCasterItems(actor, planned) {
  const currentIds = new Set(itemIds(actor).map(docSourceId).filter(Boolean));
  const currentGrantKeys = new Set(itemIds(actor).map(itemKey).filter(Boolean));
  return planned.filter(data => {
    const sourceId = data.flags?.ak5e?.chapterThreeId ?? data.flags?.ak5e?.chapterFourId ?? data.flags?.ak5e?.chapterFiveId;
    const grantKey = itemKey(data);
    const talentId = data.flags?.ak5e?.casterTalent?.sourceId;
    return !(sourceId && currentIds.has(sourceId)) && !(grantKey && currentGrantKeys.has(grantKey)) &&
      !(talentId && itemIds(actor).some(item => flag(item, "casterTalent")?.sourceId === talentId || flag(item, "chapterThreeId") === talentId));
  });
}

async function createMissingItems(actor, planned) {
  const pending = missingCasterItems(actor, planned);
  if (!pending.length) return [];
  const created = await actor.createEmbeddedDocuments("Item", pending);
  if (!created || created.length !== pending.length) throw new Error("Some Caster Items were not created. Retry with the same operation ID to resume safely.");
  return created;
}

async function applyManagedEffects(actor, planned) {
  for (const update of planned.updateEffects ?? []) {
    const result = await update.effect.update(update.changes);
    if (result === false) throw new Error("A managed Caster Active Effect was not updated. The setup receipt remains available for recovery.");
  }
  const existingSources = new Set(list(actor.effects).map(effect => flag(effect, ELEMENTAL_MANAGED_FLAG)?.sourceId).filter(Boolean));
  const pending = (planned.createEffects ?? []).filter(effect => !existingSources.has(effect.flags?.ak5e?.[ELEMENTAL_MANAGED_FLAG]?.sourceId));
  if (!pending.length) return { created: 0, updated: (planned.updateEffects ?? []).length };
  const created = await actor.createEmbeddedDocuments("ActiveEffect", pending);
  if (!created || created.length !== pending.length) throw new Error("The Elemental Being Active Effect was not created. Retry with the same operation ID to resume safely.");
  return { created: created.length, updated: (planned.updateEffects ?? []).length };
}

/** Apply a reviewed preview. It rechecks context, writes a recovery receipt, and safely resumes partial creation. */
export async function applyCasterSetup(actor, options = {}) {
  checkOwner(actor);
  if (options.confirmed !== true) throw new Error("Confirm the Caster setup preview before applying it.");
  const operationId = options.operationId ?? randomOperationId();
  if (APPLYING.has(actor.uuid)) throw new Error("Another Caster setup is already applying to this character.");
  const state = stateWithDefaults(actor);
  const prior = activeOperation(state, operationId);
  if (prior?.status === "complete") return getStoredOperationResult(prior);
  if (state.operations.some(entry => entry.id !== operationId && ["prepared", "applying", "eventFailed"].includes(entry.status)) ||
      (state.casts ?? []).some(entry => entry.status === "failed")) {
    throw new Error("Retry or obtain GM reconciliation for the interrupted Caster operation before changing setup.");
  }
  if (prior?.status === "applying" && options.choices !== undefined &&
      JSON.stringify(options.choices) !== JSON.stringify(prior.choices)) {
    throw new Error("This pending Caster setup operation was recorded with different choices; resume it without changing the original plan.");
  }
  APPLYING.add(actor.uuid);
  try {
    const replayChoices = prior?.status === "applying" ? prior.choices : options.choices ?? {};
    const preview = await previewCasterSetup(actor, { choices: replayChoices, operationId });
    if (preview.pending.length) throw new Error(`Complete all Caster setup choices before applying: ${preview.pending.map(item => item.key).join(", ")}.`);
    if (preview.blocked.length) throw new Error(`Caster setup is blocked: ${preview.blocked.join(", ")}.`);
    if (preview.missing.length) throw new Error(`Caster setup has unresolved required entries: ${preview.missing.map(item => item.name ?? item.sourceId).join(", ")}.`);
    if (!options.contextKey) throw new Error("Review the Caster setup preview and include its context key before applying.");
    if (options.contextKey !== preview.contextKey || (prior?.contextKey && prior.contextKey !== preview.contextKey)) {
      throw new Error("Caster setup changed after the preview. Review the updated preview and confirm again.");
    }
    const operation = prior ?? { id: operationId, contextKey: preview.contextKey, choices:structuredClone(preview.state.choices), status: "applying", created: 0, updated: 0, startedAt: Date.now(), progression: preview.progression,
      currencyBefore: Number(sourceSystem(actor).currency?.cp) || 0 };
    if (!prior) {
      state.mechTechnologyGrant = preview.state.mechTechnologyGrant;
      state.operations = [...state.operations, operation].slice(-20);
      await applyActorUpdate(actor, { "flags.ak5e.caster": state });
    }
    // The receipt is durable before any other Actor or embedded Item mutation.
    // Enable the Caster controls only after their managed Items are present.
    const activationChanges = {
      "flags.ak5e.casting": preview.actorUpdate["flags.ak5e.casting"],
      "system.attributes.spellcasting": preview.actorUpdate["system.attributes.spellcasting"]
    };
    const stagedActorUpdate = { ...preview.actorUpdate };
    delete stagedActorUpdate["flags.ak5e.casting"];
    delete stagedActorUpdate["system.attributes.spellcasting"];
    await applyActorUpdate(actor, stagedActorUpdate);
    for (const update of preview.updateItems) {
      await update.item.update(update.changes);
      operation.updated += 1;
    }
    const created = await createMissingItems(actor, preview.createItems);
    operation.created = Math.max(operation.created ?? 0, created.length);
    const effectResult = await applyManagedEffects(actor, preview);
    operation.created = Math.max(operation.created ?? 0, created.length) + effectResult.created;
    operation.updated += effectResult.updated;
    operation.missing = structuredClone(preview.missing);
    operation.warnings = [...new Set(preview.warnings)];
    operation.progression = structuredClone(preview.progression);
    // Starting equipment choices use canonical source IDs. Casting requires
    // the embedded Item ID assigned by Foundry, resolved only after creation.
    const selectedFocus = preview.state.choices.castingUnit;
    const focus = actor.items.get(selectedFocus) ?? itemIds(actor).find(item => flag(item, "chapterFourId") === selectedFocus);
    if (!focus) throw new Error("The selected Casting Unit was not created. Resume this setup after reviewing the granted equipment.");
    activationChanges["flags.ak5e.casting"].castingUnit = focus.id;
    await applyActorUpdate(actor, activationChanges);
    const final = {
      ...preview.state,
      progression: structuredClone(operation.progression),
      enabled: true,
      choices: { ...preview.state.choices, talents: { ...preview.state.choices.talents } },
      pools: [...preview.state.pools],
      operations: [...state.operations.filter(entry => entry.id !== operationId), operation].slice(-20)
    };
    operation.status = "complete";
    operation.completedAt = Date.now();
    await applyActorUpdate(actor, { "flags.ak5e.caster": final });
    return { created: operation.created, updated: operation.updated, missing: operation.missing, warnings: operation.warnings, operationId };
  } catch (error) {
    // Keep applying status and the original plan so the same operation can resume without duplicating grants.
    const latest = stateWithDefaults(actor);
    const pending = activeOperation(latest, operationId);
    if (pending && pending.status !== "complete") {
      pending.status = "applying";
      pending.error = error.message;
      try { await actor.update({ "flags.ak5e.caster": latest }); } catch { /* Preserve the original failure. */ }
    }
    throw error;
  } finally { APPLYING.delete(actor.uuid); }
}
