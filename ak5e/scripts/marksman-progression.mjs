/**
 * Native, previewed Marksman character progression.
 * Follows WORKFLOW.md §3.2 and the established pattern in guard-progression.mjs.
 * Pure and previewed: opening or inspecting choices never writes Actor or Item data.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  MARKSMAN_CLASS_ID, MARKSMAN_BRANCH_IDS, FIGHTING_STYLES, checkLevel, marksmanProfile,
  marksmanState, flag as marksmanFlag
} from "./marksman-rules.mjs";
import { need } from "./operation-kernel.mjs";

export const MARKSMAN_PROGRESS_FLAG = "marksmanProgression";
export const MARKSMAN_TALENT_FLAG = "marksmanTalent";

const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

const SKILLS = Object.freeze([
  ["Acrobatics", "acr"],
  ["Athletics", "ath"],
  ["Perception", "prc"],
  ["Sleight of Hand", "slt"],
  ["Stealth", "ste"],
  ["Wilderness", "ak5ewilderness"]
]);

const SAVES = Object.freeze([
  ["Dexterity", "dex"],
  ["Wisdom", "wis"],
  ["Charisma", "cha"]
]);

const TOOLS = Object.freeze([
  "Maintenance Kit", "Art Kit", "Brewing Kit", "Cooking Kit", "Engineering Kit", "Makeup Kit",
  "Mechanism Kit", "Medical Kit", "Messenger Kit", "Pharmacology Kit", "Tailoring Kit", "Woodwork Kit",
  "Land Vehicles", "Vehicles (Drones)"
]);

const TALENTS = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class-option" && entry.parentClass === "Marksman" && entry.classOption?.category === "talent");
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
  const stored = flag(actor, MARKSMAN_PROGRESS_FLAG) ?? {};
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

export function inspectMarksmanFields(actor) {
  const profile = marksmanProfile(actor);
  if (!profile.applicable) return { applicable: false };
  const level = profile.level ?? 1;
  const state = readState(actor);
  const choices = state.choices;

  return {
    applicable: true,
    level,
    branch: profile.branch,
    configured: Boolean(state.hpLevels?.length),
    skills: SKILLS,
    saves: SAVES,
    tools: TOOLS,
    fightingStyles: Object.entries(FIGHTING_STYLES).map(([key, val]) => ({ key, name: val.name, description: val.description })),
    talents: TALENTS.map(t => ({ id: t.id, name: t.name, tier: t.classOption?.tier, category: t.classOption?.category })),
    asiLevels: ASI_LEVELS.filter(l => l <= level),
    choices
  };
}

export async function previewMarksmanProgression(actor, proposedChoices = {}) {
  const profile = marksmanProfile(actor);
  need(actor?.isOwner && profile.applicable, "Choose an owned character with the Marksman class.");
  const level = profile.level ?? 1;
  const state = readState(actor);
  const current = sourceSystem(actor);
  const warnings = [];

  const conMod = Number(current.abilities?.con?.mod ?? 0);
  let totalHpGain = 0;
  const hpDetail = [];

  for (let l = 1; l <= level; l++) {
    if (l === 1) {
      const base = 8 + conMod;
      hpDetail.push({ level: 1, base, hp: base });
      totalHpGain += base;
    } else {
      const entered = proposedChoices.hp?.[l];
      const roll = Number.isInteger(entered) && entered >= 1 && entered <= 8 ? entered : 5;
      const gain = Math.max(1, roll + conMod);
      hpDetail.push({ level: l, roll, hp: gain });
      totalHpGain += gain;
    }
  }

  const actorUpdates = {};
  const newMaxHp = totalHpGain;
  actorUpdates["system.attributes.hp.max"] = newMaxHp;

  // Proficiencies
  const skillsToGrant = proposedChoices.skills ?? ["acr", "prc", "ste"];
  for (const sk of skillsToGrant) {
    actorUpdates[`system.skills.${sk}.value`] = Math.max(1, Number(current.skills?.[sk]?.value ?? 0));
  }

  // Saves: Dex always + choice (wis or cha)
  actorUpdates["system.abilities.dex.proficient"] = 1;
  const secondSave = proposedChoices.save === "cha" ? "cha" : "wis";
  actorUpdates[`system.abilities.${secondSave}.proficient`] = 1;

  // Custom armor / weapon proficiencies note
  const existingArmor = current.traits?.armorProf?.custom ?? "";
  const existingWeapon = current.traits?.weaponProf?.custom ?? "";
  const armorParts = new Set(existingArmor.split(";").map(s => s.trim()).filter(Boolean));
  armorParts.add("Light Shields");
  actorUpdates["system.traits.armorProf.custom"] = Array.from(armorParts).join("; ");

  const weaponParts = new Set(existingWeapon.split(";").map(s => s.trim()).filter(Boolean));
  weaponParts.add("Light Melee");
  weaponParts.add("Light Ranged");
  weaponParts.add("Heavy Ranged");
  actorUpdates["system.traits.weaponProf.custom"] = Array.from(weaponParts).join("; ");

  // Armor light & medium
  const armorValues = new Set(current.traits?.armorProf?.value ?? []);
  armorValues.add("lgt");
  armorValues.add("med");
  actorUpdates["system.traits.armorProf.value"] = Array.from(armorValues);

  // ASIs
  const asiUpdates = {};
  for (const asiLevel of ASI_LEVELS) {
    if (asiLevel > level) continue;
    const choice = proposedChoices.asi?.[asiLevel];
    if (choice) {
      for (const [abl, inc] of Object.entries(choice)) {
        if (["str", "dex", "con", "int", "wis", "cha"].includes(abl)) {
          const prev = Number(asiUpdates[`system.abilities.${abl}.value`] ?? current.abilities?.[abl]?.value ?? 10);
          asiUpdates[`system.abilities.${abl}.value`] = Math.min(20, prev + Number(inc));
        }
      }
    }
  }
  Object.assign(actorUpdates, asiUpdates);

  const contextKey = JSON.stringify([actor.uuid, level, totalHpGain, Object.keys(actorUpdates).sort()]);

  return {
    level,
    hpDetail,
    totalHpGain,
    actorUpdates,
    warnings,
    contextKey
  };
}

export async function applyMarksmanProgression(actor, { confirmed, choices = {}, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Marksman progression first.");
  const plan = await previewMarksmanProgression(actor, choices);
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Marksman progression again.");

  const state = readState(actor);
  state.choices = structuredClone(choices);
  state.hpLevels = plan.hpDetail.map(d => d.level);

  await actor.update({
    ...plan.actorUpdates,
    [`flags.ak5e.${MARKSMAN_PROGRESS_FLAG}`]: state
  });

  return {
    success: true,
    level: plan.level,
    maxHp: plan.totalHpGain
  };
}

