/** Native, previewed Medic character progression (Ch. 3 L4560–5050).
 * Follows WORKFLOW.md §3.2 and the established pattern in guard-progression.mjs and defender-progression.mjs.
 * Pure and previewed: inspecting choices never writes Actor or Item data.
 * Applying progression is idempotent with stable contextKey hashing.
 */
import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "./chapter-four-content.mjs";
import { sourceEntryData } from "./caster-setup.mjs";
import {
  MEDIC_CLASS_ID,
  MEDIC_BRANCH_IDS,
  MEDIC_SKILLS,
  MEDIC_SKILL_CHOICES,
  MEDIC_SAVES,
  MEDIC_TOOL_CHOICES,
  MEDIC_ARMOR_PROFS,
  MEDIC_WEAPON_PROFS,
  checkLevel,
  medicProfile,
  hitPointsAtLevel
} from "./medic-rules.mjs";
import { defineMedicPools } from "./medic-features.mjs";
import { need } from "./operation-kernel.mjs";

export const MEDIC_PROGRESS_FLAG = "medicProgression";
export const MEDIC_TALENT_FLAG = "medicTalent";

export const ASI_LEVELS = Object.freeze([4, 6, 8, 10, 12, 16, 19]);

const TALENTS = CHAPTER_THREE_CLASSES.filter(
  entry => entry.kind === "class-option" && entry.parentClass === "Medic" && entry.classOption?.category === "talent"
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
  const stored = flag(actor, MEDIC_PROGRESS_FLAG) ?? {};
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

function medicClass(actor) {
  return classItems(actor).find(
    item => flag(item, "chapterThreeId") === MEDIC_CLASS_ID || item.name === "Medic"
  ) ?? null;
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
  data.flags.ak5e.medicProgressionGrant = { sourceId: entry?.id ?? sourceId(source), kind };
  return data;
}

function sourceData(entry, kind = "feature") {
  const world = worldItem(entry.id);
  if (world) return actorItemData(world, entry, kind);
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.medicProgressionGrant = { sourceId: entry.id, kind };
  return data;
}

function equipmentData(entry) {
  const source = worldItem(entry.id);
  if (source) {
    const data = toSource(source);
    data.flags ??= {};
    data.flags.ak5e ??= {};
    data.flags.ak5e.medicProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
    return data;
  }
  const data = sourceEntryData(entry);
  data.flags ??= {};
  data.flags.ak5e ??= {};
  data.flags.ak5e.medicProgressionGrant = { sourceId: entry.id, kind: "startingEquipment" };
  return data;
}

function currentAbility(actor, ability) {
  const raw = Number(sourceSystem(actor).abilities?.[ability]?.value);
  return Number.isFinite(raw) ? raw : 10;
}

const option = (value, label, details = {}) => ({ value, label, ...details });
const field = (key, label, options, count = 1, selected = null, requiredAt = 1) => ({
  key, label, options, count, selected, requiredAt
});

export function medicChoices(actor, supplied = {}) {
  const state = readState(actor), saved = state.choices ?? {};
  const result = { ...structuredClone(saved), ...structuredClone(supplied ?? {}) };
  result.skills = [...(Array.isArray(supplied.skills) ? supplied.skills : saved.skills ?? [])];
  const saves = supplied.saves ?? saved.saves ?? [];
  result.saves = Array.isArray(saves) ? [...saves] : (saves ? [saves] : []);
  result.tool = supplied.tool ?? saved.tool ?? "Medical Kit";
  result.spellcastingAbility = supplied.spellcastingAbility ?? saved.spellcastingAbility ?? "int";
  result.asi = { ...(saved.asi ?? {}), ...(supplied.asi ?? {}) };
  result.hp = { ...(saved.hp ?? {}), ...(supplied.hp ?? {}) };
  result.startingEquipment = { ...(saved.startingEquipment ?? {}), ...(supplied.startingEquipment ?? {}) };
  if (state.startingEquipmentGranted && !supplied.startingEquipment?.mode) {
    result.startingEquipment.mode = "existing";
  }
  result.talents = { ...(saved.talents ?? {}), ...(supplied.talents ?? {}) };

  const level = levelOf(medicClass(actor));
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
        result.push(
          option(
            { increases: [{ ability: a, amount: 1 }, { ability: b, amount: 1 }] },
            `+1 ${a.toUpperCase()} and +1 ${b.toUpperCase()}`
          )
        );
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
  return TALENTS.filter(entry => entry.classOption.tier.toLowerCase() === tier.toLowerCase()).map(
    entry => option(entry.id, entry.name, {
      sourceId: entry.id,
      effect: entry.classOption?.effect,
      moduleEffect: entry.classOption?.moduleEffect
    })
  );
}

function equipmentOptions(predicate) {
  return EQUIPMENT.filter(predicate).map(entry => option(entry.id, entry.name, { sourceId: entry.id }));
}

export function inspectMedicFields(actor, choices = {}) {
  const level = levelOf(medicClass(actor)) ?? 1;
  const attached = branchItem(actor);
  const currentChoices = medicChoices(actor, choices);
  const fields = [];

  if (!attached) {
    const branchOptions = Object.entries(MEDIC_BRANCH_IDS).map(([id, name]) =>
      option(id, name.charAt(0).toUpperCase() + name.slice(1))
    );
    fields.push(field("branch", "Choose your Medic Branch", branchOptions, 1, currentChoices.branch ?? null));
  }

  fields.push(
    field(
      "spellcastingAbility",
      "Choose Spellcasting Ability",
      [option("int", "Intelligence"), option("wis", "Wisdom")],
      1,
      currentChoices.spellcastingAbility ?? "int"
    )
  );

  fields.push(
    field(
      "saves",
      "Choose two Saving Throw proficiencies from Con, Int, Wis (Ch. 3 L4588)",
      MEDIC_SAVES.choices.map(([name, key]) => option(key, name)),
      2,
      currentChoices.saves ?? []
    )
  );

  fields.push(
    field(
      "skills",
      "Choose two Medic skills (Medicine is automatic with Expertise)",
      MEDIC_SKILL_CHOICES.map(([name, key]) => option(key, name)),
      2,
      currentChoices.skills ?? []
    )
  );

  fields.push(
    field(
      "tool",
      "Choose a Kit proficiency (Medical Kit is standard)",
      MEDIC_TOOL_CHOICES.map(name => option(name, name)),
      1,
      currentChoices.tool ?? "Medical Kit"
    )
  );

  fields.push(
    field(
      "startingEquipment.mode",
      "Choose printed starting equipment or 1300 LMD",
      [option("items", "Starting equipment"), option("cash", "1300 LMD")],
      1,
      currentChoices.startingEquipment?.mode ?? null
    )
  );

  if (currentChoices.startingEquipment?.mode === "items") {
    const lightMelee = equipmentOptions(
      entry => entry.kind === "weapon" && entry.tableData?.category === "Light Melee Weapons"
    );
    const lightShields = equipmentOptions(
      entry => entry.kind === "equipment" && entry.tableData?.category === "Light Shields"
    );
    const foci = equipmentOptions(
      entry => entry.id === "weapon-arts-wand-1" || entry.id === "weapon-arts-staff-1"
    );

    fields.push(
      field(
        "startingEquipment.weapon1",
        "1x Light Melee Weapon",
        lightMelee,
        1,
        currentChoices.startingEquipment?.weapon1 ?? null
      )
    );
    fields.push(
      field(
        "startingEquipment.shieldFocus",
        "1x Light Shield OR Arts Wand/Staff",
        [...lightShields, ...foci],
        1,
        currentChoices.startingEquipment?.shieldFocus ?? null
      )
    );
  }

  // Hit Points
  for (let n = 1; n <= level; n++) {
    fields.push(
      field(`hp.${n}`, `Level ${n} Hit Points`, hpOptions(n), 1, currentChoices.hp?.[n] ?? { mode: "existing" })
    );
  }

  // ASIs
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    fields.push(
      field(`asi.${n}`, `Level ${n} Ability Score Improvement`, asiOptions(actor), 1, currentChoices.asi?.[n] ?? { mode: "existing" })
    );
  }

  // Talents
  if (level >= 3) {
    fields.push(
      field("talents.basic", "Level 3: Basic Talent", talentOptions("basic"), 1, currentChoices.talents?.basic ?? null)
    );
  }
  if (level >= 8) {
    fields.push(
      field("talents.basicModule", "Level 8: Basic Talent Module Upgrade or New Basic Talent", [
        option("upgrade", "Upgrade chosen Basic Talent (gain Module Effect)"),
        ...talentOptions("basic")
      ], 1, currentChoices.talents?.basicModule ?? null)
    );
  }
  if (level >= 9) {
    fields.push(
      field("talents.advanced", "Level 9: Advanced Talent", talentOptions("advanced"), 1, currentChoices.talents?.advanced ?? null)
    );
  }
  if (level >= 13) {
    fields.push(
      field("talents.advancedModule", "Level 13: Advanced Talent Module Upgrade or New Advanced Talent", [
        option("upgrade", "Upgrade chosen Advanced Talent (gain Module Effect)"),
        ...talentOptions("advanced")
      ], 1, currentChoices.talents?.advancedModule ?? null)
    );
  }

  return { level, fields, choices: currentChoices };
}

export async function previewMedicProgression(actor, suppliedChoices = {}) {
  const mClass = medicClass(actor);
  need(actor?.isOwner && mClass, "Choose an owned character with the Medic class.");
  const level = levelOf(mClass) ?? 1;
  const state = readState(actor);
  const choices = medicChoices(actor, suppliedChoices);
  const attachedBranch = branchItem(actor);
  const selectedBranchId = choices.branch ?? (attachedBranch ? sourceId(attachedBranch) : null);

  const pending = [];
  const warnings = [];
  const writes = {};
  const createItems = [];
  const kept = [];

  // Branch item
  if (!attachedBranch && selectedBranchId) {
    const branchEntry = CHAPTER_THREE_CLASSES.find(e => e.id === selectedBranchId);
    if (branchEntry) {
      createItems.push(sourceData(branchEntry, "subclass"));
    }
  }

  // Starting equipment
  if (!state.startingEquipmentGranted && choices.startingEquipment?.mode !== "existing") {
    if (choices.startingEquipment?.mode === "items") {
      const eqKeys = ["weapon1", "shieldFocus"];
      for (const key of eqKeys) {
        const eqId = choices.startingEquipment[key];
        if (eqId) {
          const eqEntry = EQUIPMENT.find(e => e.id === eqId);
          if (eqEntry) createItems.push(equipmentData(eqEntry));
        }
      }
      // Medical kit is standard for medics (tool-medical-kit-8)
      const kitEntry = EQUIPMENT.find(e => e.id === "tool-medical-kit-8");
      if (kitEntry) createItems.push(equipmentData(kitEntry));
    } else if (choices.startingEquipment?.mode === "cash") {
      const beforeCp = Number(sourceSystem(actor).currency?.cp ?? 0);
      writes["system.currency.cp"] = beforeCp + 1300;
    }
  }

  // Proficiencies updates
  const system = sourceSystem(actor);

  // Saves (exactly 2 choices from con, int, wis)
  const chosenSaves = Array.isArray(choices.saves) ? choices.saves : (choices.saves ? [choices.saves] : []);
  const validSavesList = ["con", "int", "wis"];
  const uniqueSaves = new Set(chosenSaves);
  const validSaves = chosenSaves.length === 2 &&
    uniqueSaves.size === 2 &&
    chosenSaves.every(s => validSavesList.includes(s));

  if (!validSaves) {
    pending.push("saves");
  } else {
    const currentSaves = new Set(system.traits?.saves?.value ?? []);
    for (const s of chosenSaves) currentSaves.add(s);
    writes["system.traits.saves.value"] = Array.from(currentSaves);
  }

  // Armour: Light shields ONLY (Ch. 3 L4588)
  const currentArmour = new Set(system.traits?.armorProf?.value ?? []);
  currentArmour.add("shl");
  writes["system.traits.armorProf.value"] = Array.from(currentArmour);

  // Weapons: Light Melee Weapons
  let currentCustomWeapons = String(system.traits?.weaponProf?.custom ?? "").trim();
  if (!currentCustomWeapons.includes("Light Melee Weapons")) {
    currentCustomWeapons = currentCustomWeapons ? `${currentCustomWeapons}; Light Melee Weapons` : "Light Melee Weapons";
  }
  writes["system.traits.weaponProf.custom"] = currentCustomWeapons;

  // Skills: Medicine is automatic with Expertise (value = 2, Medical Expertise Ch. 3 L4658)
  writes["system.skills.med.value"] = 2;
  const allowedSkillKeys = MEDIC_SKILL_CHOICES.map(([_, k]) => k); // ["arc", "ak5elore", "ak5etech", "ins", "prc", "per"]
  const chosenSkills = Array.isArray(choices.skills) ? choices.skills : (choices.skills ? [choices.skills] : []);
  const uniqueSkills = new Set(chosenSkills);
  const validSkills = chosenSkills.length === 2 &&
    uniqueSkills.size === 2 &&
    chosenSkills.every(s => allowedSkillKeys.includes(s));

  if (!validSkills) {
    pending.push("skills");
  } else {
    for (const skillKey of uniqueSkills) {
      writes[`system.skills.${skillKey}.value`] = Math.max(1, Number(system.skills?.[skillKey]?.value ?? 0));
    }
  }

  // Ability score increases
  const validAbilities = ["str", "dex", "con", "int", "wis", "cha"];
  const abilityIncreases = {};
  for (const n of ASI_LEVELS.filter(v => v <= level)) {
    const asiChoice = choices.asi?.[n];
    if (!asiChoice) {
      pending.push(`asi.${n}`);
      continue;
    }
    if (asiChoice.mode === "existing") continue;
    if (asiChoice.mode === "feat" || asiChoice.featId) {
      pending.push(`asi.${n}`);
      continue;
    }
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
    if (state.asiLevels?.includes(n)) continue;
    for (const inc of increases) {
      abilityIncreases[inc.ability] = (abilityIncreases[inc.ability] ?? 0) + Math.min(2, Math.max(1, inc.amount));
    }
  }
  for (const [abl, inc] of Object.entries(abilityIncreases)) {
    if (inc > 0) {
      const current = currentAbility(actor, abl);
      writes[`system.abilities.${abl}.value`] = Math.min(20, current + inc);
    }
  }

  // Hit Points calculations (incremental per newly gained level)
  const conMod = Number(system.abilities?.con?.mod ?? 0);
  let hpGainTotal = 0;
  for (let n = 1; n <= level; n++) {
    const hpChoice = choices.hp?.[n];
    if (!hpChoice || hpChoice.mode === "existing") continue;
    if (state.hpLevels?.includes(n)) continue;
    if (n === 1) {
      hpGainTotal += Math.max(1, 6 + conMod);
    } else {
      const rawRoll = Number(hpChoice.roll);
      const rolled = (hpChoice.mode === "rolled" && Number.isFinite(rawRoll))
        ? Math.min(6, Math.max(1, Math.round(rawRoll)))
        : 4;
      hpGainTotal += Math.max(1, rolled + conMod);
    }
  }
  if (hpGainTotal > 0) {
    const currentMaxHp = Number(system.attributes?.hp?.max ?? 0);
    writes["system.attributes.hp.max"] = currentMaxHp + hpGainTotal;
  }

  // Flags updates
  writes["flags.ak5e.medic.enabled"] = true;
  writes["flags.ak5e.medic.spellcastingAbility"] = choices.spellcastingAbility ?? "int";

  const contextKey = JSON.stringify([
    actor.uuid,
    level,
    selectedBranchId,
    pending.sort(),
    Object.keys(writes).sort(),
    createItems.map(c => c.name).sort()
  ]);

  return {
    level,
    branch: selectedBranchId,
    writes,
    createItems,
    kept,
    contextKey,
    choices,
    pending,
    warnings
  };
}

export async function applyMedicProgression(actor, { confirmed, contextKey, choices = {} } = {}) {
  need(confirmed === true, "Confirm the previewed Medic progression first.");
  const plan = await previewMedicProgression(actor, choices);
  need(
    plan.contextKey === contextKey,
    "The character changed since the preview; preview the Medic progression again."
  );
  need(plan.pending.length === 0, `Complete all required choices before applying progression: ${plan.pending.join(", ")}`);

  defineMedicPools();

  await actor.update(plan.writes);
  if (plan.createItems.length) {
    await actor.createEmbeddedDocuments("Item", plan.createItems);
  }

  // Update durable progression state
  const state = readState(actor);
  const hpLevelsGranted = Object.entries(plan.choices.hp ?? {})
    .filter(([_, opt]) => opt && opt.mode !== "existing")
    .map(([lvl]) => Number(lvl));
  const asiLevelsGranted = Object.entries(plan.choices.asi ?? {})
    .filter(([_, opt]) => opt && opt.mode !== "existing" && opt.increases?.length)
    .map(([lvl]) => Number(lvl));

  const updatedHpLevels = [...new Set([...state.hpLevels, ...hpLevelsGranted])];
  const updatedAsiLevels = [...new Set([...state.asiLevels, ...asiLevelsGranted])];

  const updatedChoices = structuredClone(plan.choices);
  for (const n of updatedHpLevels) {
    updatedChoices.hp ??= {};
    updatedChoices.hp[n] = { mode: "existing" };
  }
  for (const n of updatedAsiLevels) {
    updatedChoices.asi ??= {};
    updatedChoices.asi[n] = { mode: "existing" };
  }

  await actor.update({
    [`flags.ak5e.${MEDIC_PROGRESS_FLAG}`]: {
      ...state,
      choices: updatedChoices,
      hpLevels: updatedHpLevels,
      asiLevels: updatedAsiLevels,
      startingEquipmentGranted: state.startingEquipmentGranted || Boolean(plan.choices.startingEquipment?.mode)
    }
  });

  return {
    level: plan.level,
    branch: plan.branch,
    created: plan.createItems.map(c => c.name),
    writes: plan.writes
  };
}
