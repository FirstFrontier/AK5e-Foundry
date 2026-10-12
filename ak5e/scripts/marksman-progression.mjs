/**
 * Previewed Marksman progression. Existing HP and ability scores are treated as
 * already containing prior class gains; only explicitly selected new gains are
 * added. Choices and applied level receipts make retries idempotent.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
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
const DEFAULT_STATE = Object.freeze({ version: 2, choices: {}, hpLevels: [], asiLevels: [], hpGains: {}, asiGains: {} });
const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const sourceSystem = actor => actor?._source?.system ?? actor?.system ?? {};
const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({ key, label, options, count, selected, requiredAt });
const normalizedName = value => String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const toolKey = name => `ak5e${normalizedName(name)}`;
const mergeCustom = (current, values) => [...new Set([...(String(current ?? "").split(";").map(v => v.trim()).filter(Boolean)), ...values])].join("; ");

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
  result.fightingStyle = supplied.fightingStyle ?? saved.fightingStyle ?? null;
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };
  result.equipment = { ...(saved.equipment ?? {}), ...(supplied.equipment ?? {}) };
  result.save = supplied.save ?? saved.save ?? null;
  result.tool = supplied.tool ?? saved.tool ?? null;
  return result;
}

export function inspectMarksmanFields(actor, choices = {}) {
  const profile = marksmanProfile(actor);
  if (!profile.applicable) return { applicable: false };
  const level = profile.level ?? 1, selected = selectedChoices(actor, choices);
  return {
    applicable: true, level, branch: profile.branch, configured: Boolean(readState(actor).choices),
    skills: SKILLS, saves: SAVES, tools: TOOLS,
    fightingStyles: STYLES.map(([key, style]) => ({ key, name: style.name, description: style.description })),
    talents: TALENTS.map(t => ({ id: t.id, name: t.name, tier: t.classOption?.tier, category: t.classOption?.category })),
    asiLevels: ASI_LEVELS.filter(l => l <= level), choices: selected,
    manualInstructions: manualInstructions(level, profile.branch)
  };
}

function manualInstructions(level, branch) {
  const instructions = [
    `Choose and add one Marksman Fighting Style at 1st level as a feature Item (${STYLES.map(([, style]) => style.name).join(", ")}). The source grants its printed benefit; use the module hook when one exists, otherwise follow the printed text manually.`,
    "Choose three different Marksman class skills from Acrobatics, Athletics, Perception, Sleight of Hand, Stealth, and Wilderness; apply any skill proficiency not shown in the progression preview.",
    "Choose one Tool Kit or Vehicle proficiency. The selected tool proficiency is applied by this setup; add the matching Chapter 4 tool Item only if you want it in inventory.",
    "Starting equipment choice: take 1 Light Ranged Weapon, 1 Heavy Ranged Weapon, or 1 Grenade Launcher; then take 1 Light Melee Weapon or 1 Light Shield; then Protective Clothing or Underarmour; then 1 Tool Kit you are proficient with. Alternatively take 1300 LMD. Add the chosen real Chapter 4 Items/currency manually; include background equipment separately."
  ];
  if (branch === "artilleryman") instructions.push("Artilleryman gains Grenade Launcher and Rocket Launcher proficiency automatically. Add selected starting equipment separately; the branch does not grant both launchers as inventory.");
  if (level >= 3) instructions.push(`At 3rd level choose one Basic Marksman Talent (${TALENTS.filter(t => t.classOption.tier === "Basic").map(t => t.name).join(", ")}) and add its feature Item. At 8th level either choose a different Basic Talent or upgrade the chosen Basic Talent by adding its printed Module Effect.`);
  if (level >= 9) instructions.push(`At 9th level choose one Advanced Marksman Talent (${TALENTS.filter(t => t.classOption.tier === "Advanced").map(t => t.name).join(", ")}) and add its feature Item. At 13th level either choose a different Advanced Talent or upgrade the chosen Advanced Talent by adding its printed Module Effect.`);
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
  if (choices.fightingStyle != null && !Object.hasOwn(FIGHTING_STYLES, choices.fightingStyle)) throw new Error("Choose a listed Marksman Fighting Style.");
  if (!choices.fightingStyle) warnings.push("Choose one Marksman Fighting Style.");

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
    if (!Number.isInteger(roll) || roll < 1 || roll > 8 || n === 1 && roll !== 8) throw new Error(`Invalid Marksman Hit Point gain at level ${n}; use 8 at 1st level or a d8 result from 1 to 8.`);
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

  const contextKey = JSON.stringify({
    actor: actor.uuid, level, branch: profile.branch, choices,
    current: {
      hp: current.attributes?.hp?.max,
      abilities: current.abilities,
      skills: current.skills,
      tools: current.tools,
      traits: current.traits
    },
    state: { hpLevels: state.hpLevels, asiLevels: state.asiLevels, hpGains: state.hpGains, asiGains: state.asiGains },
    actorUpdates
  });

  return {
    version: 2, level, branch: profile.branch, choices, pending, hpDetail, totalHpGain,
    actorUpdates, warnings, manualInstructions: manualInstructions(level, profile.branch), contextKey
  };
}

export async function applyMarksmanProgression(actor, { confirmed, choices = {}, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Marksman progression first.");
  const plan = await previewMarksmanProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character or selected values changed since the preview; preview the Marksman progression again.");

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
  await actor.update({
    ...plan.actorUpdates,
    [`flags.ak5e.${MARKSMAN_PROGRESS_FLAG}`]: state,
    "flags.ak5e.marksman.enabled": true,
    ...(plan.choices.fightingStyle ? { "flags.ak5e.marksman.fightingStyle": plan.choices.fightingStyle } : {})
  });
  return { success: true, level: plan.level, maxHpGain: plan.totalHpGain, warnings: plan.warnings, manualInstructions: plan.manualInstructions };
}
