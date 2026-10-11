/** Native, previewed Defender character progression. This module is deliberately
 * separate from defender-setup: opening it never writes Actor or Item data. */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import { createOperationKernel } from "./operation-kernel.mjs";

export const DEFENDER_PROGRESS_FLAG = "defenderProgression";
export const DEFENDER_TALENT_FLAG = "defenderTalent";
const CLASS_ID = "class-defender";
const BRANCHES = Object.freeze({
  "subclass-defender-artshield": "Artshield",
  "subclass-defender-dreadnought": "Dreadnought",
  "subclass-defender-fortress": "Fortress",
  "subclass-defender-guardian": "Guardian",
  "subclass-defender-juggernaut": "Juggernaut",
  "subclass-defender-protector": "Protector",
  "subclass-defender-sentry": "Sentry"
});
const CHOICE_BRANCHES = Object.freeze(["subclass-defender-artshield", "subclass-defender-dreadnought", "subclass-defender-fortress", "subclass-defender-guardian",
  "subclass-defender-juggernaut", "subclass-defender-protector", "subclass-defender-sentry"]);
const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);
const FORTRESS_ID = "subclass-defender-fortress", GRENADE_LAUNCHER_ID = "weapon-grenade-launcher-12";
const SENTRY_ID = "subclass-defender-sentry";
/** Sentry Marksman Training (Ch.3 L1701): a Fighting Style from the Marksman Class (Ch.3 L3615-3642), granted as its feature Item. */
const MARKSMAN_STYLE_NAMES = Object.freeze(["Braced for Action", "Close and Personal", "Cone of Fire", "Deadly Fighter", "Defensive", "Ranger", "Smooth Operator", "Two-Weapon Fighting"]);
const MARKSMAN_STYLES = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-feature" && entry.parentClass === "Marksman" && MARKSMAN_STYLE_NAMES.includes(entry.name));
/** Sentry Equipment Exchange (Ch.3 L1684): a Light or Heavy Ranged Weapon without the Firearm Property. */
const sentryExchangeWeapon = entry => entry.kind === "weapon" && ["Light Ranged Weapons", "Heavy Ranged Weapons"].includes(entry.tableData?.category) && !/\bFirearm\b/i.test(String(entry.tableData?.properties ?? ""));
const SKILLS = Object.freeze([
  ["Athletics", "ath"], ["Lore", "ak5elore"], ["Tech", "ak5etech"],
  ["Perception", "prc"], ["Intimidation", "itm"], ["Wilderness", "ak5ewilderness"]
]);
const TOOLS = Object.freeze([
  "Art Kit", "Brewing Kit", "Cooking Kit", "Engineering Kit", "Maintenance Kit", "Makeup Kit",
  "Mechanism Kit", "Medical Kit", "Messenger Kit", "Pharmacology Kit", "Tailoring Kit", "Woodwork Kit",
  "Land Vehicles", "Vehicles (Drones)"
]);
const TALENTS = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-option" && entry.parentClass === "Defender" && entry.classOption?.category === "talent");
const EQUIPMENT = CHAPTER_FOUR_EQUIPMENT;
const DEFAULT_STATE = Object.freeze({ version: 1, choices: {}, hpLevels: [], asiLevels: [], operations: [], receipts: {}, plans: {} });

const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normalizedName = value => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const toolKey = name => `ak5e${normalizedName(name)}`;
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });
const option = (value, label, details = {}) => ({ value, label, ...details });
function readState(actor) {
  const stored = flag(actor, DEFENDER_PROGRESS_FLAG) ?? {};
  return { ...structuredClone(DEFAULT_STATE), ...structuredClone(stored), choices: structuredClone(stored.choices ?? {}),
    hpLevels: [...(stored.hpLevels ?? [])], asiLevels: [...(stored.asiLevels ?? [])], operations: [...(stored.operations ?? [])], receipts: { ...(stored.receipts ?? {}) }, plans: { ...(stored.plans ?? {}) } };
}
function classItems(actor) { return entries(actor?.items).filter(item => item.type === "class"); }
function defenderClass(actor) { return classItems(actor).find(item => flag(item, "chapterThreeId") === CLASS_ID) ?? null; }
function branchItem(actor) { return entries(actor?.items).find(item => item.type === "subclass") ?? null; }
function levelOf(item) { const level = Number(item?.system?.levels); return Number.isInteger(level) && level >= 1 && level <= 20 ? level : null; }
function sourceId(item) { return flag(item, "chapterThreeId") ?? flag(item, "chapterFourId"); }
function actorSourceItem(actor, id) { return entries(actor?.items).find(item => sourceId(item) === id); }
function worldItem(sourceIdValue) { return entries(globalThis.game?.items).find(item => sourceId(item) === sourceIdValue) ?? null; }
function toSource(item) {
  const data = item?.toObject ? item.toObject() : structuredClone(item ?? {});
  delete data._id; delete data.id; delete data.folder; delete data.sort;
  return data;
}
function actorItemData(source, entry, kind = "feature") {
  const data = toSource(source);
  data.flags ??= {}; data.flags.ak5e ??= {};
  if (entry) data.flags.ak5e = { ...data.flags.ak5e, chapterThreeId: entry.id, classContentKind: entry.kind,
    parentClass: entry.parentClass, parentBranch: entry.parentBranch, classLevel: entry.level, sourceHeading: entry.sourceHeading,
    sourceFile: entry.sourceFile ?? "03_chapter_3_character_classes.txt", sourceLine: entry.sourceLine ?? null };
  data.flags.ak5e.defenderProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}
function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {}; data.flags.ak5e ??= {};
  data.flags.ak5e.defenderProgressionGrant = { sourceId: entry.id, kind };
  return data;
}
function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (!source) return null;
  const data = toSource(source); data.flags ??= {}; data.flags.ak5e ??= {};
  data.flags.ak5e.defenderProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}
function choicesFrom(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : [saves];
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  const level = levelOf(defenderClass(actor));
  if (level) {
    result.asi ??= {}; result.hp ??= {};
    for (const n of ASI_LEVELS.filter(value => value <= level)) result.asi[n] ??= { mode: "existing" };
    for (let n = 1; n <= level; n++) result.hp[n] ??= { mode: "existing" };
  }
  return result;
}
function attachedTalentChoices(actor) {
  const selected = { basic: [], advanced: [] };
  for (const item of entries(actor?.items)) {
    const data = flag(item, DEFENDER_TALENT_FLAG);
    if (data?.sourceId && selected[data.tier]) selected[data.tier].push(data.sourceId);
  }
  return selected;
}
function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}
function asiOptions(actor) {
  const abilities = ["str", "dex", "con", "int", "wis", "cha"], result = [];
  for (const ability of abilities) if (currentAbility(actor, ability) + 2 <= 20)
    result.push(option({ increases: [{ ability, amount: 2 }] }, `+2 ${ability.toUpperCase()}`));
  for (let i = 0; i < abilities.length; i++) for (let j = i + 1; j < abilities.length; j++) {
    const [a, b] = [abilities[i], abilities[j]];
    if (currentAbility(actor, a) < 20 && currentAbility(actor, b) < 20)
      result.push(option({ increases: [{ ability: a, amount: 1 }, { ability: b, amount: 1 }] }, `+1 ${a.toUpperCase()} and +1 ${b.toUpperCase()}`));
  }
  return result;
}
function hpOptions(level) {
  if (level === 1) return [option({ mode: "existing" }, "Already included in current Hit Point maximum"), option({ mode: "fixed", roll: 12 }, "Fixed 12 at 1st level")];
  return [option({ mode: "existing" }, "Already included in current Hit Point maximum"), option({ mode: "fixed", roll: 7 }, "Fixed average (7)"),
    ...Array.from({ length: 12 }, (_, i) => option({ mode: "rolled", roll: i + 1 }, `Rolled d12: ${i + 1}`))];
}
function talentOptions(tier) {
  return TALENTS.filter(entry => entry.classOption.tier.toLowerCase() === tier)
    .map(entry => {
      const workflow = ["Power Plant", "Refreshment", "Sword and Shield", "Tactical Defence"].includes(entry.classOption.name ?? entry.name.replace(/^.*Talent: /, ""))
        || /-(power-plant|refreshment|sword-and-shield|tactical-defence)$/.test(entry.id);
      const sheltered = entry.id.endsWith("-interlocking-shields");
      return option(entry.id, `${entry.name} (${workflow ? "SP workflow" : sheltered ? "guided Shelter DR" : "manual effect"})`, {
        sourceId: entry.id, effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect, manual: !workflow,
        automation: workflow ? "SP workflow" : sheltered ? "guided Shelter DR" : "manual effect" });
    });
}
function equipmentOptions(predicate) { return EQUIPMENT.filter(predicate).map(entry => option(entry.id, entry.name, { sourceId: entry.id })); }
function buildFields(actor, choices, level, branchId) {
  const fields = [];
  const attached = branchItem(actor), savedTalent = attachedTalentChoices(actor);
  if (!attached) fields.push(field("branch", "Choose your Defender Branch", CHOICE_BRANCHES.map(id => option(id, BRANCHES[id])), 1, choices.branch ?? null));
  fields.push(field("saves", "Choose one additional Saving Throw proficiency (Constitution is automatic)", [option("str", "Strength"), option("wis", "Wisdom")], 1, choices.saves?.[0] ?? null));
  fields.push(field("skills", "Choose three Defender skills", SKILLS.map(([name, key]) => option(key, name)), 3, choices.skills ?? []));
  fields.push(field("tool", "Choose a Tool Kit or Vehicle proficiency", TOOLS.map(name => option(name, name)), 1, choices.tool ?? null));
  fields.push(field("startingEquipment.mode", "Choose printed starting equipment or 1300 LMD", [option("items", "Starting equipment"), option("cash", "1300 LMD")], 1, choices.startingEquipment.mode ?? null));
  if (choices.startingEquipment.mode === "items") {
    const lightMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons");
    const lightShields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields");
    const heavyMelee = equipmentOptions(entry => entry.kind === "weapon" && entry.tableData?.category === "Heavy Melee Weapons");
    const shields = equipmentOptions(entry => entry.kind === "equipment" && entry.tableData?.category === "Heavy Shields");
    const armours = equipmentOptions(entry => entry.kind === "equipment" && entry.name === "Combat Gear" || entry.kind === "equipment" && entry.name === "Defender Armour");
    const availableTools = EQUIPMENT.filter(entry => entry.kind === "tool" && entry.name !== "Instrument (X)");
    const alreadyProficient = availableTools.filter(entry => Number(sourceSystem(actor).tools?.[toolKey(entry.name)]?.value) >= 1).map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
    const selectedToolkit = TOOLS.includes(choices.tool) ? availableTools.find(entry => entry.name === choices.tool) : null;
    const toolkitOptions = [...alreadyProficient, ...(selectedToolkit ? [option(selectedToolkit.id, selectedToolkit.name, { sourceId: selectedToolkit.id })] : [])]
      .filter((candidate, index, all) => all.findIndex(row => row.value === candidate.value) === index);
    fields.push(field("startingEquipment.weaponOrShield", "Choose one Light Melee Weapon or Light Shield", [...lightMelee, ...lightShields], 1, choices.startingEquipment.weaponOrShield ?? null));
    fields.push(field("startingEquipment.heavyWeaponOrShield", "Choose one Heavy Melee Weapon, Light Shield, or Heavy Shield", [...heavyMelee, ...lightShields, ...shields], 1, choices.startingEquipment.heavyWeaponOrShield ?? null));
    fields.push(field("startingEquipment.armour", "Choose Combat Gear or Defender Armour", armours, 1, choices.startingEquipment.armour ?? null));
    fields.push(field("startingEquipment.toolkit", "Choose a Tool Kit you are proficient with", toolkitOptions, 1, choices.startingEquipment.toolkit ?? null));
    if (branchId === FORTRESS_ID) fields.push(field("startingEquipment.fortressExchange", "Fortress Equipment Exchange: keep the Light Melee Weapon or Light Shield, or exchange it for a Grenade Launcher",
      [option("keep", "Keep it"), option("grenadeLauncher", "Exchange it for a Grenade Launcher")], 1, choices.startingEquipment.fortressExchange ?? null));
    if (branchId === SENTRY_ID) fields.push(field("startingEquipment.sentryExchange", "Sentry Equipment Exchange: keep the Light Melee Weapon or Light Shield, or exchange it for a Light or Heavy Ranged Weapon (not a Firearm)",
      [option("keep", "Keep it"), ...equipmentOptions(sentryExchangeWeapon).map(entry => ({ ...entry, label: `Exchange it for: ${entry.label}` }))], 1, choices.startingEquipment.sentryExchange ?? null));
  }
  if (branchId === SENTRY_ID && level >= 4) {
    const owned = MARKSMAN_STYLES.find(entry => actorSourceItem(actor, entry.id))?.id ?? null;
    fields.push(field("sentryFightingStyle", "Marksman Training: choose a Fighting Style available to the Marksman Class", MARKSMAN_STYLES.map(entry => option(entry.id, entry.name, { sourceId: entry.id })), 1, choices.sentryFightingStyle ?? owned, 4));
  }
  const talents = { ...savedTalent, ...(choices.talents ?? {}) };
  const basic = talents.basic ?? savedTalent.basic?.[0] ?? null;
  const advanced = talents.advanced ?? savedTalent.advanced?.[0] ?? null;
  if (level >= 3 && !(savedTalent.basic?.length)) fields.push(field("talents.basic", "Choose a Basic Defender Talent", talentOptions("basic"), 1, basic, 3));
  if (level >= 8 && basic) {
    const base = talentOptions("basic");
    fields.push(field("talents.basicAt8", "At level 8, upgrade the Basic Talent or gain a different Basic Talent",
      [option({ mode: "upgrade", sourceId: basic }, `Upgrade ${base.find(item => item.value === basic)?.label ?? basic} with its Module Effect`),
        ...base.filter(item => item.value !== basic).map(item => option({ mode: "new", sourceId: item.value }, `Gain additional Basic Talent: ${item.label}`))],
      1, talents.basicAt8 ?? null, 8));
  }
  if (level >= 9 && !(savedTalent.advanced?.length)) fields.push(field("talents.advanced", "Choose an Advanced Defender Talent", talentOptions("advanced"), 1, advanced, 9));
  if (level >= 13 && advanced) {
    const base = talentOptions("advanced");
    fields.push(field("talents.advancedAt13", "At level 13, upgrade the Advanced Talent or gain a different Advanced Talent",
      [option({ mode: "upgrade", sourceId: advanced }, `Upgrade ${base.find(item => item.value === advanced)?.label ?? advanced} with its Module Effect`),
        ...base.filter(item => item.value !== advanced).map(item => option({ mode: "new", sourceId: item.value }, `Gain additional Advanced Talent: ${item.label}`))],
      1, talents.advancedAt13 ?? null, 13));
  }
  const state = readState(actor);
  for (const n of ASI_LEVELS.filter(n => n <= level && !state.asiLevels.includes(n)))
    fields.push(field(`asi.${n}`, `Choose the Ability Score Improvement at Defender level ${n}`, [option({ mode: "existing" }, "Already included in current ability scores"), ...asiOptions(actor)], 1, choices.asi[n] ?? { mode: "existing" }, n));
  for (let n = 1; n <= level; n++) if (!state.hpLevels.includes(n))
    fields.push(field(`hp.${n}`, `Choose Hit Point gain for Defender level ${n}`, hpOptions(n), 1, choices.hp[n] ?? { mode: "existing" }, n));
  return fields;
}
function getPath(root, path) { return path.split(".").reduce((value, key) => value?.[key], root); }
function collect(actor, choices, level) {
  const pending = [];
  for (const descriptor of buildFields(actor, choices, level, choices.branch)) {
    const value = descriptor.key === "saves" ? choices.saves?.[0] : descriptor.key.startsWith("asi.") ? choices.asi[descriptor.key.slice(4)] : descriptor.key.startsWith("hp.") ? choices.hp[descriptor.key.slice(3)] :
      descriptor.key.startsWith("talents.") ? getPath(choices, descriptor.key) : descriptor.key.startsWith("startingEquipment.") ? getPath(choices, descriptor.key) : choices[descriptor.key];
    const selected = descriptor.count > 1 ? value : [value];
    const values = descriptor.count > 1 ? (Array.isArray(value) ? value : []) : [value];
    const valid = values.length === descriptor.count && values.every(v => descriptor.options.some(candidate => same(candidate.value, v))) &&
      new Set(values.map(v => JSON.stringify(v))).size === values.length;
    if (!valid) pending.push(descriptor.key);
  }
  return pending;
}
function mergeCustom(current, values) { return [...new Set([...(String(current ?? "").split(";").map(v => v.trim()).filter(Boolean)), ...values])].join("; "); }
function snapshot(actor, choices) {
  const system = sourceSystem(actor), state = readState(actor);
  return JSON.stringify({ class: defenderClass(actor)?.id, level: levelOf(defenderClass(actor)), branch: branchItem(actor)?.id ?? choices.branch ?? null,
    scores: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(k => [k, Number(system.abilities?.[k]?.value) || 10])),
    hp: { max: system.attributes?.hp?.max, value: system.attributes?.hp?.value }, currency: system.currency?.cp,
    skills: system.skills, tools: system.tools, traits: system.traits, state: { hpLevels: state.hpLevels, asiLevels: state.asiLevels },
    items: entries(actor.items).map(item => [item.id, item.type, sourceId(item), flag(item, DEFENDER_TALENT_FLAG) ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), choices });
}
function validateActor(actor, choices) {
  if (actor?.documentName !== "Actor" || actor.type !== "character" || actor.pack) throw new Error("Choose a live character Actor.");
  const classes = classItems(actor), attached = defenderClass(actor);
  if (!attached || classes.length !== 1) throw new Error("Attach exactly one Defender class before opening Defender progression.");
  const level = levelOf(attached); if (!level) throw new Error("Defender level must be an integer from 1 to 20.");
  const branches = entries(actor.items).filter(item => item.type === "subclass"), existing = branches[0];
  if (branches.length > 1) throw new Error("This character has multiple subclass Items; review them before applying Defender progression.");
  const existingId = existing && flag(existing, "chapterThreeId");
  if (existing && !BRANCHES[existingId]) throw new Error("The attached subclass is not a recognized Defender Branch.");
  const branch = existingId ?? choices.branch;
  if (!branch || !BRANCHES[branch]) throw new Error(`Choose ${CHOICE_BRANCHES.map(id => BRANCHES[id]).join(", ")} when no Defender Branch is attached.`);
  if (existingId && choices.branch && choices.branch !== existingId) throw new Error("The attached Defender Branch cannot be replaced in setup.");
  if (!existingId && !CHOICE_BRANCHES.includes(branch)) throw new Error(`A new Defender Branch must be ${CHOICE_BRANCHES.map(id => BRANCHES[id]).join(", ")}.`);
  return { level, branch, existingBranchId: existingId ?? null };
}
function validateChoices(actor, choices, profile) {
  const pending = collect(actor, choices, profile.level);
  if (pending.length) throw new Error(`Complete these Defender setup choices: ${pending.join(", ")}.`);
  if (!['str', 'wis'].includes(choices.saves?.[0])) throw new Error("Choose Strength or Wisdom as the additional Saving Throw proficiency.");
  if (choices.skills.length !== 3 || new Set(choices.skills).size !== 3 || choices.skills.some(key => !SKILLS.some(([, skill]) => skill === key))) throw new Error("Choose three different skills from the Defender list.");
  if (!TOOLS.includes(choices.tool)) throw new Error("Choose a listed Tool Kit or Vehicle proficiency.");
  for (const n of ASI_LEVELS.filter(n => n <= profile.level && !readState(actor).asiLevels.includes(n))) {
    const choice = choices.asi[n]; if (choice?.mode === "existing") continue;
    const increases = choice?.increases;
    if (!Array.isArray(increases) || ![1, 2].includes(increases.length) || increases.reduce((sum, item) => sum + Number(item.amount), 0) !== 2 ||
      new Set(increases.map(item => item.ability)).size !== increases.length || increases.some(item => !["str", "dex", "con", "int", "wis", "cha"].includes(item.ability) || ![1, 2].includes(item.amount)))
      throw new Error(`Invalid Ability Score Improvement at level ${n}.`);
  }
  const system = sourceSystem(actor), asiTotals = {};
  for (const n of ASI_LEVELS.filter(n => n <= profile.level && !readState(actor).asiLevels.includes(n))) for (const increase of choices.asi[n]?.increases ?? [])
    asiTotals[increase.ability] = (asiTotals[increase.ability] ?? 0) + increase.amount;
  for (const [ability, increase] of Object.entries(asiTotals)) if (currentAbility(actor, ability) + increase > 20)
    throw new Error(`Ability Score Improvements would raise ${ability.toUpperCase()} above 20.`);
  const equipment = choices.startingEquipment;
  if (!["items", "cash"].includes(equipment.mode)) throw new Error("Choose starting equipment or 1300 LMD.");
  if (equipment.mode === "items") {
    const groups = ["weaponOrShield", "heavyWeaponOrShield", "armour", "toolkit"];
    for (const key of groups) {
      const selected = EQUIPMENT.find(entry => entry.id === equipment[key]);
      if (!selected || !equipmentData(selected)) throw new Error(`The selected ${key} source Item is missing from the World; install its real Chapter 4 Item before applying setup.`);
    }
    const first = EQUIPMENT.find(entry => entry.id === equipment.weaponOrShield), second = EQUIPMENT.find(entry => entry.id === equipment.heavyWeaponOrShield);
    const armour = EQUIPMENT.find(entry => entry.id === equipment.armour), toolkit = EQUIPMENT.find(entry => entry.id === equipment.toolkit);
    if (!(first.kind === "weapon" && first.tableData?.category === "Light Melee Weapons" || first.kind === "equipment" && first.tableData?.category === "Light Shields")) throw new Error("First equipment choice must be a Light Melee Weapon or Light Shield.");
    if (!(second.kind === "weapon" && second.tableData?.category === "Heavy Melee Weapons" || second.kind === "equipment" && ["Light Shields", "Heavy Shields"].includes(second.tableData?.category))) throw new Error("Second equipment choice must be a Heavy Melee Weapon, Light Shield or Heavy Shield.");
    if (!(["Combat Gear", "Defender Armour"].includes(armour.name))) throw new Error("Choose Combat Gear or Defender Armour.");
    if (toolkit.kind !== "tool") throw new Error("Choose a real Chapter 4 Tool Kit.");
    if (toolkit.name !== choices.tool && Number(system.tools?.[toolKey(toolkit.name)]?.value) < 1) throw new Error("You must be proficient with the selected starting Tool Kit.");
  }
  for (const n of Array.from({ length: profile.level }, (_, i) => i + 1).filter(n => !readState(actor).hpLevels.includes(n))) {
    const choice = choices.hp[n];
    if (choice?.mode === "existing") continue;
    if (!choice || !["fixed", "rolled"].includes(choice.mode) || !Number.isInteger(choice.roll) || choice.roll < 1 || choice.roll > 12 ||
      n === 1 && (choice.mode !== "fixed" || choice.roll !== 12) || n > 1 && choice.mode === "fixed" && choice.roll !== 7)
      throw new Error(`Invalid Hit Point gain at level ${n}.`);
  }
  for (const [tier, atKey] of [["basic", "basicAt8"], ["advanced", "advancedAt13"]]) {
    const requiredLevel = tier === "basic" ? 3 : 9, upgradeLevel = tier === "basic" ? 8 : 13;
    const currently = attachedTalentChoices(actor)[tier];
    const selected = choices.talents[tier] ?? currently[0];
    const recorded = readState(actor).choices.talents ?? {};
    const original = recorded[tier] ?? currently[0];
    if (original && selected !== original) throw new Error(`The original ${tier} Talent is already selected; setup preserves it.`);
    if (profile.level < requiredLevel && selected) throw new Error(`The ${tier} Talent is available at level ${requiredLevel}.`);
    if (profile.level < upgradeLevel && choices.talents[atKey]) throw new Error(`The ${tier} Talent Module choice is available at level ${upgradeLevel}.`);
    if (recorded[atKey] && !same(recorded[atKey], choices.talents[atKey])) throw new Error(`The level ${upgradeLevel} Talent choice is already recorded; setup preserves it.`);
    if (choices.talents[tier] && profile.level < requiredLevel) throw new Error(`${tier} Defender Talents are not available before level ${requiredLevel}.`);
    if (currently.length && choices.talents[tier] && choices.talents[tier] !== currently[0]) throw new Error(`Your selected ${tier} Defender Talent is permanent; the later choice adds a different Talent or its Module.`);
    if (choices.talents[atKey] && profile.level < upgradeLevel) throw new Error(`${tier} Defender Talent Modules are not available before level ${upgradeLevel}.`);
    if (profile.level >= requiredLevel && !selected && !TALENTS.some(entry => entry.id === selected)) throw new Error(`Choose a ${tier} Defender Talent.`);
    if (selected && !TALENTS.some(entry => entry.id === selected && entry.classOption.tier.toLowerCase() === tier)) throw new Error(`Choose a source-listed ${tier} Defender Talent.`);
    const advancedChoice = choices.talents[atKey];
    if (profile.level >= upgradeLevel && selected && (!advancedChoice || !["upgrade", "new"].includes(advancedChoice.mode) ||
      advancedChoice.mode === "new" && (!TALENTS.some(entry => entry.id === advancedChoice.sourceId && entry.classOption.tier.toLowerCase() === tier) || advancedChoice.sourceId === selected) ||
      advancedChoice.mode === "upgrade" && advancedChoice.sourceId !== selected)) throw new Error(`Choose a valid ${tier} Talent Module upgrade or different talent at level ${upgradeLevel}.`);
  }
}
function validateTalentLedger(actor, choices, level) {
  const initial = readState(actor).choices;
  for (const key of ["saves", "skills", "tool", "startingEquipment", "sentryFightingStyle"]) {
    if (initial[key] !== undefined && !same(initial[key], choices[key])) throw new Error(`The original ${key} choice is already recorded; setup preserves it.`);
  }
  const recorded = readState(actor).choices.talents ?? {}, attached = attachedTalentChoices(actor);
  for (const [tier, atKey, required, moduleLevel] of [["basic", "basicAt8", 3, 8], ["advanced", "advancedAt13", 9, 13]]) {
    const original = recorded[tier] ?? attached[tier][0], selected = choices.talents[tier] ?? original;
    if (original && selected !== original) throw new Error(`The original ${tier} Talent is already selected; setup preserves it.`);
    if (level < required && selected) throw new Error(`The ${tier} Talent is available at level ${required}.`);
    if (level < moduleLevel && choices.talents[atKey]) throw new Error(`The ${tier} Talent Module choice is available at level ${moduleLevel}.`);
    if (recorded[atKey] && !same(recorded[atKey], choices.talents[atKey])) throw new Error(`The level ${moduleLevel} Talent choice is already recorded; setup preserves it.`);
  }
}
function appendSystemWrites(actor, choices, profile) {
  const system = sourceSystem(actor), writes = [], planned = {}, applied = readState(actor).receipts;
  // A later write to the same path (Fortress/Sentry weapon proficiencies after the class's own) starts from the earlier
  // write's planned value, because apply checks each write's "before" against the Actor as it goes. A write that already has
  // a receipt is skipped at apply, so it does not change what the next write will find.
  const add = (key, path, before, after) => {
    writes.push({ key, path, before: Object.hasOwn(planned, path) ? planned[path] : before, after });
    if (!applied[key]) planned[path] = after;
  };
  add("save:con", "system.abilities.con.proficient", system.abilities?.con?.proficient ?? 0, Math.max(1, Number(system.abilities?.con?.proficient) || 0));
  if (choices.saves[0]) add("save:chosen", `system.abilities.${choices.saves[0]}.proficient`, system.abilities?.[choices.saves[0]]?.proficient ?? 0, Math.max(1, Number(system.abilities?.[choices.saves[0]]?.proficient) || 0));
  for (const [, skill] of SKILLS.filter(([, key]) => choices.skills.includes(key))) add(`skill:${skill}`, `system.skills.${skill}.value`, system.skills?.[skill]?.value ?? 0, Math.max(1, Number(system.skills?.[skill]?.value) || 0));
  const tool = choices.tool, toolCode = toolKey(tool), configuredAbility = globalThis.CONFIG?.DND5E?.tools?.[toolCode]?.ability ?? system.tools?.[toolCode]?.ability;
  const toolData = { ...(system.tools?.[toolCode] ?? {}), value: Math.max(1, Number(system.tools?.[toolCode]?.value) || 0) };
  if (!system.tools?.[toolCode] && configuredAbility) toolData.ability = configuredAbility;
  if (tool) add(`tool:${toolCode}`, `system.tools.${toolCode}`, system.tools?.[toolCode], toolData);
  add("proficiency:weapons", "system.traits.weaponProf.custom", system.traits?.weaponProf?.custom ?? "", mergeCustom(system.traits?.weaponProf?.custom, ["All Melee Weapons"]));
  // Fortress Fire Support Platform (Ch.3 L1400): its own receipt key, so a character set up before choosing Fortress still gets it.
  if (profile.branch === FORTRESS_ID) add("proficiency:fortress", "system.traits.weaponProf.custom", system.traits?.weaponProf?.custom ?? "", mergeCustom(mergeCustom(system.traits?.weaponProf?.custom, ["All Melee Weapons"]), ["Grenade Launcher", "Rocket Launcher"]));
  // Sentry Pavise (Ch.3 L1690): Light and Heavy Ranged Weapons, on its own receipt key like Fortress.
  if (profile.branch === SENTRY_ID) add("proficiency:sentry", "system.traits.weaponProf.custom", system.traits?.weaponProf?.custom ?? "", mergeCustom(mergeCustom(system.traits?.weaponProf?.custom, ["All Melee Weapons"]), ["Light Ranged Weapons", "Heavy Ranged Weapons"]));
  add("proficiency:armour", "system.traits.armorProf.custom", system.traits?.armorProf?.custom ?? "", mergeCustom(system.traits?.armorProf?.custom, ["All Armour", "All Shields"]));
  const armourGroups = Array.isArray(system.traits?.armorProf?.value) ? system.traits.armorProf.value : Array.from(system.traits?.armorProf?.value ?? []);
  const armourConfig = globalThis.CONFIG?.DND5E?.armorProficiencies;
  const configuredGroups = (config, requested) => config && typeof config === "object" ? requested.filter(code => Object.hasOwn(config, code)) : [];
  const nativeArmour = configuredGroups(armourConfig, ["lgt", "med", "hvy", "shl"]);
  if (nativeArmour.length) add("proficiency:armourGroups", "system.traits.armorProf.value", armourGroups, [...new Set([...armourGroups, ...nativeArmour])]);
  if (choices.startingEquipment.mode === "cash" && !readState(actor).receipts.cash) {
    const before = Number(system.currency?.cp) || 0;
    add("cash", "system.currency.cp", before, before + 1300);
  }
  const conAsiLevels = ASI_LEVELS.filter(n => n <= profile.level && !readState(actor).asiLevels.includes(n)
    && choices.asi[n]?.increases?.some(increase => increase.ability === "con"));
  const conIncrease = conAsiLevels.reduce((sum, n) => sum + choices.asi[n].increases.filter(increase => increase.ability === "con").reduce((total, increase) => total + increase.amount, 0), 0);
  const oldCon = Math.floor((currentAbility(actor, "con") - 10) / 2), con = Math.floor((currentAbility(actor, "con") + conIncrease - 10) / 2);
  let plannedMax = Number(system.attributes?.hp?.max) || 0;
  for (let n = 1; n <= profile.level; n++) if (!readState(actor).hpLevels.includes(n)) {
    const choice = choices.hp[n], amount = choice.mode === "existing" ? 0 : Number(choice.roll) + con;
    const before = plannedMax;
    const previousHP = Number(system.attributes?.hp?.value) || 0;
    plannedMax = Math.max(0, before + amount);
    add(`hp:${n}`, `system.attributes.hp.max`, before, plannedMax);
    if (choice.mode !== "existing") add(`hpCurrent:${n}`, "system.attributes.hp.value", previousHP, previousHP);
  }
  // A newly applied Constitution modifier increase also affects every level whose
  // ordinary HP is already included. New gains above already use the final modifier.
  const includedLevels = Array.from({ length: profile.level }, (_, i) => i + 1)
    .filter(n => readState(actor).hpLevels.includes(n) || choices.hp[n]?.mode === "existing").length;
  if (con !== oldCon && includedLevels) {
    add(`conHP:${conAsiLevels.join("_")}`, "system.attributes.hp.max", plannedMax, plannedMax + (con - oldCon) * includedLevels);
  }
  const totals = {};
  for (const n of ASI_LEVELS.filter(n => n <= profile.level && !readState(actor).asiLevels.includes(n))) {
    const choice = choices.asi[n];
    if (choice.mode === "existing") continue;
    for (const increase of choice.increases) totals[increase.ability] = (totals[increase.ability] ?? 0) + increase.amount;
  }
  for (const [ability, increase] of Object.entries(totals)) {
    const levels = ASI_LEVELS.filter(n => n <= profile.level && !readState(actor).asiLevels.includes(n)
      && choices.asi[n]?.increases?.some(entry => entry.ability === ability));
    add(`asi:${levels.join("_")}:${ability}`, `system.abilities.${ability}.value`, currentAbility(actor, ability), currentAbility(actor, ability) + increase);
  }
  return writes;
}
function featureEntries(branchId, level) {
  return CHAPTER_THREE_CLASSES.filter(entry => entry.parentClass === "Defender" &&
    ((entry.kind === "class-feature" && (entry.level == null || entry.level <= level) && (["Hit Points", "Proficiencies", "Equipment"].includes(entry.name) || Number(entry.level) > 0)) ||
     (entry.kind === "subclass-feature" && entry.parentBranch === BRANCHES[branchId] && Number(entry.level) > 0 && entry.level <= level)));
}
function planItems(actor, choices, profile) {
  const createItems = [], updateItems = [], missing = [], existing = new Set(entries(actor.items).map(sourceId).filter(Boolean));
  if (!profile.existingBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(candidate => candidate.id === profile.branch);
    const doc = branchEntry && worldItem(branchEntry.id);
    if (doc && !existing.has(profile.branch)) createItems.push(actorItemData(doc, branchEntry, "branch"));
    else if (branchEntry && !existing.has(profile.branch)) createItems.push(sourceData(branchEntry, "branch"));
    else if (!branchEntry) missing.push({ sourceId: profile.branch, name: BRANCHES[profile.branch], reason: "BranchSourceUnavailable" });
  }
  for (const entry of featureEntries(profile.branch, profile.level)) {
    if (existing.has(entry.id)) continue;
    const source = worldItem(entry.id);
    if (source) createItems.push(actorItemData(source, entry));
    else {
      // Class/branch feature source Items can be reconstructed from the exact generated source record.
      createItems.push(sourceData(entry));
    }
  }
  const talentSelections = selectedTalentState(actor, choices, profile.level);
  for (const selected of talentSelections) {
    const entry = TALENTS.find(candidate => candidate.id === selected.sourceId);
    if (!entry) continue;
    const item = actorSourceItem(actor, entry.id);
    const talentFlag = { sourceId: entry.id, tier: selected.tier, moduleActive: selected.moduleActive, active: true };
    if (item) {
      if (!same(flag(item, DEFENDER_TALENT_FLAG), talentFlag)) updateItems.push({ itemId: item.id, changes: { [`flags.ak5e.${DEFENDER_TALENT_FLAG}`]: talentFlag } });
    } else {
      const world = worldItem(entry.id), data = world ? actorItemData(world, entry, "talent") : sourceEntryData(entry);
      data.flags ??= {}; data.flags.ak5e ??= {};
      data.flags.ak5e.defenderProgressionGrant = { sourceId: entry.id, kind: "talent" };
      data.flags.ak5e[DEFENDER_TALENT_FLAG] = talentFlag;
      createItems.push(data);
    }
  }
  // Fortress Equipment Exchange (Ch.3 L1390-1392): the Light Melee Weapon or Light Shield becomes a Grenade Launcher.
  const equipment = { ...choices.startingEquipment, ...(profile.branch === FORTRESS_ID && choices.startingEquipment.fortressExchange === "grenadeLauncher" ? { weaponOrShield: GRENADE_LAUNCHER_ID } : {}),
    // Sentry Equipment Exchange (Ch.3 L1683-1684): the Light Melee Weapon or Light Shield becomes the chosen Ranged Weapon.
    ...(profile.branch === SENTRY_ID && EQUIPMENT.some(entry => entry.id === choices.startingEquipment.sentryExchange && sentryExchangeWeapon(entry)) ? { weaponOrShield: choices.startingEquipment.sentryExchange } : {}) };
  // Sentry Marksman Training: the chosen Fighting Style's feature Item.
  const style = profile.branch === SENTRY_ID && profile.level >= 4 ? MARKSMAN_STYLES.find(entry => entry.id === choices.sentryFightingStyle) : null;
  if (style && !existing.has(style.id)) {
    const world = worldItem(style.id), data = world ? actorItemData(world, style) : sourceData(style);
    data.flags ??= {}; data.flags.ak5e ??= {};
    data.flags.ak5e.defenderProgressionGrant = { sourceId: style.id, kind: "sentryFightingStyle" };
    createItems.push(data);
  }
  if (choices.startingEquipment.mode === "items") for (const id of new Set(["weaponOrShield", "heavyWeaponOrShield", "armour", "toolkit"].map(key => equipment[key]))) {
    const requested = ["weaponOrShield", "heavyWeaponOrShield", "armour", "toolkit"].filter(key => equipment[key] === id).length;
    const owned = entries(actor.items).filter(item => sourceId(item) === id).reduce((sum, item) => sum + Math.max(1, Number(item.system?.quantity) || 1), 0);
    if (owned >= requested || entries(actor.items).some(item => flag(item, "defenderProgressionGrant")?.equipmentKey === id)) continue;
    const entry = EQUIPMENT.find(candidate => candidate.id === id), data = entry && equipmentData(entry);
    if (data) {
      data.system ??= {}; data.system.quantity = requested - owned;
      data.flags.ak5e.defenderProgressionGrant.equipmentKey = id;
      createItems.push(data);
    }
    else if (entry) missing.push({ sourceId: id, name: entry.name, reason: "EquipmentSourceNotInstalled" });
  }
  return { createItems, updateItems, missing, talentSelections };
}
function selectedTalentState(actor, choices, level) {
  const current = attachedTalentChoices(actor), result = [];
  for (const [tier, atKey, requiredLevel, moduleLevel] of [["basic", "basicAt8", 3, 8], ["advanced", "advancedAt13", 9, 13]]) {
    const saved = current[tier].map(id => ({ sourceId: id, tier, moduleActive: flag(actorSourceItem(actor, id), DEFENDER_TALENT_FLAG)?.moduleActive === true }));
    const originalId = choices.talents[tier] ?? saved[0]?.sourceId;
    if (level < requiredLevel || !originalId) { result.push(...saved); continue; }
    const upgrade = choices.talents[atKey];
    const addNew = upgrade?.mode === "new" && upgrade.sourceId;
    result.push({ sourceId: originalId, tier, moduleActive: upgrade?.mode === "upgrade" || saved.find(value => value.sourceId === originalId)?.moduleActive === true });
    for (const value of saved) if (value.sourceId !== originalId && value.sourceId !== addNew) result.push(value);
    if (addNew) result.push({ sourceId: addNew, tier, moduleActive: false });
  }
  return [...new Map(result.map(value => [value.sourceId, value])).values()];
}
function actorSnapshotKey(actor, choices, profile) { return snapshot(actor, { ...choices, resolvedBranch: profile.branch }); }
function scalarValue(actor, path) {
  const keys = path.split(".").slice(1); return keys.reduce((value, key) => value?.[key], sourceSystem(actor));
}
/** Return the choice schema for the attached Defender, optionally seeded by choices. */
export function defenderChoices(actor, options = {}) {
  const choices = choicesFrom(actor, options.choices ?? {}), empty = { applicable: false, configured: false, level: null, branch: null, branchId: null, choices, pending: [], blocked: [], missing: [] };
  if (actor?.type !== "character" || actor.pack || !defenderClass(actor)) return empty;
  if (classItems(actor).length !== 1) return { ...empty, applicable: true, blocked: ["Attach exactly one Defender class before opening Defender progression."] };
  const subclasses = entries(actor.items).filter(item => item.type === "subclass");
  if (subclasses.length > 1) return { ...empty, applicable: true, blocked: ["Multiple subclass Items require GM review before Defender progression."] };
  if (subclasses.length === 1 && !BRANCHES[flag(subclasses[0], "chapterThreeId")])
    return { ...empty, applicable: true, blocked: ["The attached subclass is not a recognized Defender Branch."] };
  if (!levelOf(defenderClass(actor))) return { ...empty, applicable: true, blocked: ["Defender level must be an integer from 1 to 20."] };
  let profile;
  try { profile = validateActor(actor, choices); } catch (error) {
    const attached = defenderClass(actor), level = levelOf(attached), branches = entries(actor.items).filter(item => item.type === "subclass");
    const branch = branches.length === 1 ? flag(branches[0], "chapterThreeId") : choices.branch;
    if (!level) return { ...empty, applicable: true, level, blocked: [error.message] };
    profile = { level, branch: branch ?? CHOICE_BRANCHES[0], existingBranchId: branches.length ? branch : null };
  }
  const pending = collect(actor, choices, profile.level);
  return { applicable: true, configured: readState(actor).progressionComplete === true, level: profile.level,
    branch: BRANCHES[profile.branch], branchId: profile.branch, contextKey: actorSnapshotKey(actor, choices, profile),
    choices: { ...choices, summary: [`${profile.level}-level Defender`, `${BRANCHES[profile.branch]} branch`, `${pending.length} choices pending`] },
    fields: buildFields(actor, choices, profile.level, profile.branch), pending: pending.map(key => buildFields(actor, choices, profile.level, profile.branch).find(item => item.key === key)), blocked: [], missing: [] };
}

/** Pure preview: all writes and copy requirements are listed; nothing is mutated. */
export function previewDefenderProgression(actor, options = {}) {
  const choices = choicesFrom(actor, options.choices ?? {}), profile = validateActor(actor, choices);
  validateTalentLedger(actor, choices, profile.level);
  const pending = collect(actor, choices, profile.level);
  if (!pending.length) validateChoices(actor, choices, profile);
  const items = planItems(actor, choices, profile);
  const writes = appendSystemWrites(actor, choices, profile);
  const warnings = [];
  warnings.push("D&D5e's Simple and Martial weapon groups also grant ranged proficiency, so all-melee proficiency is recorded in the custom proficiency note for manual checks.");
  if (!globalThis.CONFIG?.DND5E?.armorProficiencies) warnings.push("The D&D5e armour proficiency catalogue is unavailable; all-armour and shield proficiency are also written as visible custom proficiency notes.");
  const selectedTool = toolKey(choices.tool);
  if (choices.tool && !globalThis.CONFIG?.DND5E?.tools?.[selectedTool]?.ability && !sourceSystem(actor).tools?.[selectedTool]?.ability)
    warnings.push(`No configured ability was found for ${choices.tool}; its proficiency is recorded, and the GM should confirm the check ability.`);
  if (!CHOICE_BRANCHES.includes(profile.branch)) warnings.push(`${BRANCHES[profile.branch]} keeps Defender chassis progression; its branch features are descriptive/manual.`);
  if (profile.branch === SENTRY_ID && profile.level >= 4) warnings.push("Marksman Training: the chosen Fighting Style is granted as its feature Item; its effect follows the Marksman Fighting Style automation, where present, or its printed text.");
  if (profile.branch === "subclass-defender-guardian") warnings.push("Guardian Arts (casting ability, Arts Points and the Healing Arts pool) are set up from the Defender panel: Guardian Arts setup.");
  if (choices.talents.basic || choices.talents.advanced) warnings.push("Defender Talent effects are manual unless a separate feature workflow explicitly automates them.");
  if (choices.startingEquipment.mode === "cash") warnings.push("1300 LMD is stored as 1300 D&D5e copper pieces (1 CP = 1 LMD). Existing currency is preserved.");
  const state = readState(actor);
  const plan = { version: 1, level: profile.level, branch: profile.branch, branchName: BRANCHES[profile.branch], choices, pending,
    blocked: [], missing: items.missing, warnings, writes, createItems: items.createItems, updateItems: items.updateItems,
    progression: { hpLevels: [...state.hpLevels], asiLevels: [...state.asiLevels], talentSelections: items.talentSelections },
    contextKey: actorSnapshotKey(actor, choices, profile) };
  plan.empty = !writes.some(write => !state.receipts[write.key]) && !items.createItems.length && !items.updateItems.length && state.progressionComplete === true;
  return plan;
}

async function actorUpdate(actor, changes) {
  const result = await actor.update(changes);
  if (result === false) throw new Error("Defender progression update was prevented; retry the same operation.");
}
async function createMissing(actor, items) {
  const created = [];
  for (const data of items) {
    const sid = data.flags?.ak5e?.chapterThreeId ?? data.flags?.ak5e?.chapterFourId;
    const metadata = data.flags?.ak5e?.defenderProgressionGrant, grant = metadata?.sourceId;
    if (metadata?.equipmentKey
      ? entries(actor.items).some(item => flag(item, "defenderProgressionGrant")?.equipmentKey === metadata.equipmentKey)
      : entries(actor.items).some(item => (sid && sourceId(item) === sid) || grant && flag(item, "defenderProgressionGrant")?.sourceId === grant)) continue;
    const docs = await actor.createEmbeddedDocuments("Item", [data]);
    if (!docs || docs.length !== 1) throw new Error(`Could not create ${data.name}; retry with the same operation ID to resume setup.`);
    created.push(...docs);
  }
  return created;
}
function checkOwner(actor) {
  if (!actor?.isOwner && !globalThis.game?.user?.isGM) throw new Error("You must own this Defender character to request setup.");
  if (actor?.documentName !== "Actor" || actor.type !== "character" || actor.pack) throw new Error("Choose a live character Actor.");
}
const REQUEST_FLAG = "defenderProgressionRequest";
const RESPONSE_FLAG = "defenderProgressionResponse";
let progressionKernel;
async function performProgression(actor, data, operation, state) {
  const operationId = operation.id;
  let plan = state.plans[operationId];
  if (!plan) {
    plan = previewDefenderProgression(actor, { choices: data.choices ?? {} });
    if (data.contextKey !== plan.contextKey) throw new Error("The character changed after the preview. Review the updated Defender setup before applying it.");
    if (plan.pending.length) throw new Error(`Complete all Defender setup choices before applying: ${plan.pending.join(", ")}.`);
    if (plan.missing.length) throw new Error(`Defender setup requires installed source Items: ${plan.missing.map(item => item.name ?? item.sourceId).join(", ")}.`);
    state.plans[operationId] = structuredClone(plan);
    state.choices = structuredClone(plan.choices);
    progressionKernel.noteMutation(actor);
    await progressionKernel.saveState(actor, state);
  } else {
    plan = structuredClone(plan);
    if (!same(plan.choices, choicesFrom(actor, data.choices ?? {}))) throw new Error("Retry this pending Defender operation with its original choices.");
  }
  const selection = validateActor(actor, plan.choices);
  if (selection.branch !== plan.branch || selection.level !== plan.level) throw new Error("Defender class or branch changed during setup; review a new preview.");
  for (const write of plan.writes) {
    if (state.receipts[write.key]) continue;
    const current = scalarValue(actor, write.path);
    const observed = current === undefined
      ? (write.before === 0 || write.before === "" || Array.isArray(write.before) && write.before.length === 0 ? write.before : null)
      : current ?? null;
    if (!same(observed, write.before ?? null)) throw new Error(`Defender setup field ${write.path} changed after preview; review a new preview.`);
    state.receipts[write.key] = { operationId, before: write.before ?? null, after: write.after ?? null };
    if (write.key.startsWith("hp:")) state.hpLevels = [...new Set([...state.hpLevels, Number(write.key.slice(3))])].sort((a, b) => a - b);
    progressionKernel.noteMutation(actor);
    await actorUpdate(actor, { [write.path]: write.after, [`flags.ak5e.${DEFENDER_PROGRESS_FLAG}`]: structuredClone(state) });
  }
  progressionKernel.noteMutation(actor);
  const created = await createMissing(actor, plan.createItems);
  let updated = 0;
  for (const update of plan.updateItems) {
    const item = entries(actor.items).find(candidate => candidate.id === update.itemId);
    if (!item || same(flag(item, DEFENDER_TALENT_FLAG), update.changes[`flags.ak5e.${DEFENDER_TALENT_FLAG}`])) continue;
    progressionKernel.noteMutation(actor);
    const result = await item.update(update.changes); if (result === false) throw new Error("A Defender Talent Item was not updated; retry the same operation.");
    updated += 1;
  }
  state.asiLevels = [...new Set([...state.asiLevels, ...ASI_LEVELS.filter(n => n <= plan.level)])].sort((a, b) => a - b);
  state.progressionComplete = true; state.choices = structuredClone(plan.choices); delete state.plans[operationId];
  state.lastResult = { operationId, created: created.length, updated, progression: { hpLevels: [...state.hpLevels], asiLevels: [...state.asiLevels], talentSelections: structuredClone(plan.progression.talentSelections) } };
  delete state.plans[operationId];
  progressionKernel.noteMutation(actor);
  return state;
}
progressionKernel = createOperationKernel({
  label: "Defender progression", stateFlag: DEFENDER_PROGRESS_FLAG, requestFlag: REQUEST_FLAG, responseFlag: RESPONSE_FLAG,
  receiptFlag: "defenderProgressionReceipt", benefitFlag: "defenderProgressionBenefit", rollFlag: "defenderProgressionRoll", tagPreset: "defender",
  getState: readState, isMember: actor => actor?.type === "character" && !!defenderClass(actor),
  gate: actor => { if (classItems(actor).length !== 1) throw new Error("Attach exactly one Defender class before applying progression."); },
  perform: (actor, command, data, operation, state) => {
    if (command !== "apply") throw new Error("Unknown Defender progression operation.");
    return performProgression(actor, data, operation, state);
  }
});
export function registerDefenderProgressionHooks() {
  if (registerDefenderProgressionHooks.installed) return;
  registerDefenderProgressionHooks.installed = true;
  globalThis.Hooks?.on?.("createChatMessage", (...args) => progressionKernel.handle(...args));
}

/** Route every new mutation through the elected GM. */
export async function applyDefenderProgression(actor, options = {}) {
  checkOwner(actor);
  if (options.confirmed !== true) throw new Error("Confirm the Defender progression preview before applying it.");
  const operationId = options.operationId ?? globalThis.foundry?.utils?.randomID?.();
  if (!operationId) throw new Error("A stable Defender progression operation ID is required.");
  return progressionKernel.submit(actor, "apply", { confirmation: true, contextKey: options.contextKey, choices: choicesFrom(actor, options.choices ?? {}) }, operationId);
}

/** Exact class/branch source data factory used by the standalone setup form. */
export const defenderProgressionCatalogue = Object.freeze({ talents: TALENTS.map(entry => ({ id: entry.id, name: entry.name, tier: entry.classOption.tier,
  effect: entry.classOption.effect, moduleEffect: entry.classOption.moduleEffect })) });
