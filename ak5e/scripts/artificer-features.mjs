/**
 * Artificer Supporter branch (Ch. 3 L6858-6960; Ch. 6 L6583-6685 Automaton statblocks).
 *
 * Tools of Creation and Destruction (L1): Heavy Melee proficiency, As One (action tracking, warned only),
 *   Calculated Strikes (a flag and a reminder; dnd5e has no global per-weapon ability override).
 * Master of Machines (L1): Expert Touch, Fort Builder (a pool and portable cover records), Professional Engineer
 *   (a custom Automaton actor built from the Ch. 6 template and created through the GM relay), Control, Replacement.
 * Concussive Maintenance (L10), Rise of the Machines (L13: cap 2, Advanced Personality Matrix), Armoured Core (L17).
 *
 * Rulings applied: A1 cap warns (Ch. 4 Turret and Protocol constructs are exempt via flags.ak5e.automaton.exempt),
 * A2 action economy is tracked and warned only, A3 rebuild is a confirmed Long Rest or 500 LMD (system.currency.cp),
 * A6 "N rolls of your Aid Die" are dice of the current size and are not expended (only Concussive Maintenance expends).
 * Dice are never rolled automatically: every roll is a button the owner clicks.
 */
import { CHAPTER_SIX_CREATURES } from "./chapter-six-content.mjs";
import {
  isArtificer, supporterLevel, pbForLevel, artificerDC as artificerDCRule, flag, SUPPORTER_CLASS_ID
} from "./supporter-rules.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { need, esc, opaqueKey, gmActive, createOperationKernel } from "./operation-kernel.mjs";
import { spendResource, warn, resourceValue } from "./play-uses.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { actorFromUuid, spendAidDice, aidDieFormula } from "./supporter-features.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { confirmSupporterUse } from "./supporter-sheet.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { tokenDistanceFeet } from "./supporter-measure.mjs";

export const ARTIFICER_BRANCH = "artificer";
export const AUTOMATON_BASE_HP = 25;
export const COMMAND_RANGE_FT = 100;
export const REBUILD_LMD = 500;
export const FORT_COVER = Object.freeze({ dimensions: "5 ft x 3 ft x 1 ft", cover: "Half Cover" });
const RIDER_SAVE_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const ABILITY_KEYS = RIDER_SAVE_KEYS;
const MATRIX_KEYS = Object.freeze(["int", "wis", "cha"]);
const HEAVY_MELEE = "Heavy Melee Weapons";
const VEHICLE_DRONES = "Vehicles (Drones)";
const MOD_PROFICIENCY_NOTE = "Automaton attack bonus = Intelligence modifier + Proficiency Bonus (Professional Engineer).";

/** Automaton variants (Ch. 6 statblocks). `actions` lists the stat-block Actions a command may take. */
export const AUTOMATON_VARIANTS = Object.freeze({
  platform: { label: "Platform", templateId: "creature-automaton-platform-310521", moves: true, actions: ["ram"] },
  airSupport: { label: "Air Support", templateId: "creature-automaton-air-support-312211", moves: true, actions: ["crossbow"] },
  turret: { label: "Turret", templateId: "creature-automaton-turret-313188", moves: false, actions: ["multiattack", "crossbow"] }
});

/** The Attack Actions the sheet can roll. Damage is the printed statblock damage (1d8 + 2). */
const ACTION_DEFS = Object.freeze({
  ram: { label: "Ram", attacks: 1, damage: "1d8 + 2", damageType: "bludgeoning", kind: "melee", reach: 5 },
  crossbow: { label: "Crossbow", attacks: 1, damage: "1d8 + 2", damageType: "piercing", kind: "ranged", range: [100, 300] },
  multiattack: { label: "Multiattack (two Crossbow Attacks)", attacks: 2, damage: "1d8 + 2", damageType: "piercing", kind: "ranged", range: [100, 300] }
});

/** Automaton features that the activity items below replace (the rest are copied as text). */
const ATTACK_FEATURES = Object.freeze({ Ram: "ram", Crossbow: "crossbow" });

const ABILITY_NAMES = Object.freeze({ str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" });

/* ------------------------------------------------------------------ state and lookups */

export const artificerState = actor => ({ automatons: [], covers: [], professionalVariant: null, ...(flag(actor, "artificer") ?? {}) });
export const coversOf = actor => [...(artificerState(actor).covers ?? [])];
const artificerTurn = actor => flag(actor, "artificer")?.turn ?? {};
const isAutomatonFlagged = doc => flag(doc, "automaton") !== undefined && flag(doc, "automaton") !== null;
const automatonFlag = doc => flag(doc, "automaton") ?? {};
const hpOf = doc => Number(doc?.system?.attributes?.hp?.value ?? 0);
const hpMaxOf = doc => Number(doc?.system?.attributes?.hp?.max ?? 0);

/** True when the Automaton is destroyed (flag set, or 0 HP before the flag is written). */
export function isDestroyedAutomaton(doc) {
  return automatonFlag(doc).destroyed === true || hpOf(doc) <= 0;
}

/** Every Automaton this Artificer created that still exists, destroyed or not. */
function rawAutomatons(actor) {
  return (artificerState(actor).automatons ?? []).map(uuid => globalThis.fromUuidSync?.(uuid) ?? null)
    .filter(doc => doc?.documentName === "Actor");
}

/** Live Automatons (not destroyed). */
export function automatonsOf(actor) {
  return rawAutomatons(actor).filter(doc => !isDestroyedAutomaton(doc));
}

/** Cap counting rule: an explicit exemption (Ch. 4 Turret, Protocol constructs) never counts. */
export const countsAgainstCap = automaton => automatonFlag(automaton).exempt !== true && !isDestroyedAutomaton(automaton);

/** Automaton maximum (C3:6895 one; C3:6938 two at Supporter level 13). */
export function automatonCap(actor) {
  return (supporterLevel(actor) ?? 1) >= 13 ? 2 : 1;
}

/** Heavy Duty Upgrades per Automaton (C3:6925 two; C3:6945 three at level 17). U6 uses the same rule. */
export function upgradeCapFor(actor) {
  return (supporterLevel(actor) ?? 1) >= 17 ? 3 : 2;
}

const levelWarning = (warnings, actor, required, name) => {
  const current = supporterLevel(actor) ?? 1;
  if (current < required) warn(warnings, "level", `${name} is a Supporter level ${required} feature; this character is level ${current}.`);
};

const distanceWarning = (warnings, distance, limit, text) => {
  if (Number.isFinite(Number(distance)) && distance !== null && distance !== undefined && Number(distance) > limit) warn(warnings, "range", text);
};

/**
 * Resolves an Automaton by UUID. A missing UUID, a UUID that resolves to nothing, or a document that is not an
 * Automaton is a hard error. An Automaton created by another Artificer, or with no creator, is a warning (id
 * "creator") that the user may override (WORKFLOW §3.2).
 */
const automatonAt = (actor, uuid, warnings = []) => {
  need(uuid, "Choose an Automaton.");
  const doc = globalThis.fromUuidSync?.(uuid) ?? null;
  need(doc?.documentName === "Actor", "That Automaton no longer exists.");
  need(isAutomatonFlagged(doc), "That Creature is not an Automaton.");
  const creator = automatonFlag(doc).creator;
  // The Artificer's own automatons list is authoritative for ownership (buildAutomaton writes it); the creator flag is the fallback.
  const listed = (artificerState(actor).automatons ?? []).includes(doc.uuid);
  if (!listed && creator !== actor.uuid) {
    warn(warnings, "creator", creator
      ? `${doc.name} was created by another Artificer (${creator}); it is not in this Artificer's Automaton list.`
      : `${doc.name} has no recorded creator.`);
  }
  return doc;
};

const pbOf = actor => Number(actor?.system?.attributes?.prof ?? pbForLevel(supporterLevel(actor) ?? 1));

/* ------------------------------------------------------------------ pools and readings */

export function defineArtificerPools() {
  if (!getPoolDefinition("artificerFortBuilder")) {
    definePool({
      id: "artificerFortBuilder", label: "Fort Builder uses", max: "@attributes.prof", initial: "max",
      classId: SUPPORTER_CLASS_ID, appliesTo: isArtificer, recovery: [{ on: "lr", amount: "full" }]
    });
  }
}

/** The Technology Modifier reading (C3:6887 Automaton bonus HP; the same phrase as the Caster drone at C3:584). */
export const artificerReadings = Object.freeze({
  technologyModifier: {
    label: "Technology Modifier in the Automaton's Hit Points",
    options: [
      { value: "techTotal", label: "Total Technology skill modifier" },
      { value: "intMod", label: "Intelligence modifier" }
    ]
  }
});

/** The chosen reading to a number: the Technology skill total, or the Intelligence modifier. */
export function technologyModifierValue(actor, choice) {
  const value = choice === "techTotal" ? Number(actor?.system?.skills?.ak5etech?.total) : Number(actor?.system?.abilities?.int?.mod);
  need(Number.isFinite(value), "Review the Technology skill and Intelligence values before creating the Automaton.");
  return value;
}

/* ------------------------------------------------------------------ target kinds (engine change records) */

/** Writes a set of fields on one Actor and restores the recorded prior values on undo. Owners apply it themselves. */
const ARTIFICER_KINDS = Object.freeze({
  artificerFields: {
    documentName: "Actor",
    async apply(_source, _useId, entry, target) {
      await target.update(structuredClone(entry.set));
      return { applied: true };
    },
    async revert(source, _useId, entry, target) {
      // A tampered record is refused again here before any write: whitelist, value ranges and the target's ownership.
      need(fieldsValidate(source, null, entry, target), "The recorded field changes are not on the Artificer whitelist for this target; nothing is restored.");
      await target.update(structuredClone(entry.before));
      return { restored: true };
    },
    preview(_source, _receipt, entry) {
      return `${entry.name}: the recorded values are restored.`;
    }
  },
  // The Automaton created by buildAutomaton. Its creation happens through the GM relay before this entry is recorded.
  artificerAutomaton: {
    documentName: "Actor",
    async apply(_source, _useId, _entry, target) {
      need(target, "The Automaton does not exist yet; the GM must create it.");
      return { exists: true };
    },
    // Deletes the Automaton only when its ID is derived from this use's opId and it is flagged as built by this source.
    async revert(source, useId, _entry, target) {
      need(Boolean(target) && target.id === automatonIdFor(useId) && automatonFlag(target).creator === source.uuid,
        "This Automaton was not built by this use; it is not deleted.");
      // A Player cannot delete a World Actor even when they own it (found in the U4 live test), so the GM client deletes it.
      if (game.user?.isGM) await target.delete();
      else await artificerRelay.submit(source, "deleteAutomaton", { confirmation: true, automatonId: target.id, useId }, `${useId}-delete-automaton`);
      return { removed: true };
    },
    preview(_source, _receipt, entry) {
      return `${entry.name}: the Automaton is deleted and its state entry removed.`;
    }
  }
});
supporterUses.register({ targetKinds: ARTIFICER_KINDS });

/*
 * Relay whitelist for artificerFields (F-R7). Only the paths the Artificer plans write may be relayed:
 *  - setup (setupPlan) writes the Artificer's own Actor: Heavy Melee, Vehicles (Drones) and Tech skill;
 *  - Automaton plans (Rebuild, Advanced Personality Matrix) write one Automaton made by this Artificer.
 */
const SOURCE_FIELD_PATHS = Object.freeze(["system.traits.weaponProf.custom", "system.traits.toolProf.custom", "system.skills.ak5etech.value"]);
const AUTOMATON_FIELD_PATHS = Object.freeze(["flags.ak5e.automaton.destroyed", "system.attributes.hp.value"]);
const ABILITY_FIELD_PATH = /^system\.abilities\.(str|dex|con|int|wis|cha)\.(value|proficient)$/;
const plainFieldValue = value => ["number", "string", "boolean"].includes(typeof value);
const isPlainRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isWhitelistedPath = path => SOURCE_FIELD_PATHS.includes(path) || AUTOMATON_FIELD_PATHS.includes(path) || ABILITY_FIELD_PATH.test(path);

/**
 * Per-path value rules for a field record: a forged receipt may not push an out-of-range value through the relay.
 * `target` (when known) tightens Hit Points to the Automaton's own maximum.
 */
const pathValueOk = (path, value, target) => {
  if (path === "system.traits.weaponProf.custom" || path === "system.traits.toolProf.custom") return typeof value === "string" && value.length <= 500;
  if (path === "system.skills.ak5etech.value") return [0, 0.5, 1, 2].includes(value);
  if (path === "flags.ak5e.automaton.destroyed") return typeof value === "boolean";
  if (path === "system.attributes.hp.value") {
    const ceiling = target ? Math.max(0, hpMaxOf(target)) : 1000;
    return Number.isInteger(value) && value >= 0 && value <= ceiling;
  }
  if (path.endsWith(".value")) return Number.isInteger(value) && value >= 0 && value <= 30;
  if (path.endsWith(".proficient")) return value === 0 || value === 1 || typeof value === "boolean";
  return false;
};

/** Shape of a field record: same non-empty path set in `set` and `before`, all whitelisted, primitive in-range values only. */
const fieldRecordShapeOk = (entry, target = null) => {
  if (!isPlainRecord(entry?.set) || !isPlainRecord(entry?.before)) return false;
  const setPaths = Object.keys(entry.set), beforePaths = Object.keys(entry.before);
  if (!setPaths.length || [...setPaths].sort().join("\n") !== [...beforePaths].sort().join("\n")) return false;
  if (![...Object.values(entry.set), ...Object.values(entry.before)].every(plainFieldValue)) return false;
  if (!setPaths.every(isWhitelistedPath)) return false;
  return setPaths.every(path => pathValueOk(path, entry.set[path], target) && pathValueOk(path, entry.before[path], target));
};

/**
 * A relayed artificerFields entry (checked for apply AND revert): a whitelisted path set, primitive in-range values, and a
 * target that matches its paths. Setup fields belong to the Artificer itself. Automaton fields belong to an Actor that
 * carries the Automaton record and was built by this Artificer (creator flag) or is on the Artificer's own list (head ruling
 * H4: a listed Automaton is accepted whatever its creator flag). The Artificer itself and an unflagged Actor never pass, and
 * every value is range-checked, so a forged receipt cannot write arbitrary values to an arbitrary Actor.
 */
const fieldsValidate = (source, _receipt, entry, target) => {
  if (entry?.kind !== "artificerFields" || !target || target.uuid !== entry.uuid) return false;
  if (!fieldRecordShapeOk(entry, target)) return false;
  const setPaths = Object.keys(entry.set);
  if (setPaths.every(path => SOURCE_FIELD_PATHS.includes(path))) return target.uuid === source.uuid;
  if (setPaths.every(path => !SOURCE_FIELD_PATHS.includes(path))) {
    if (target.uuid === source.uuid || !isAutomatonFlagged(target)) return false;
    return automatonFlag(target).creator === source.uuid || (artificerState(source).automatons ?? []).includes(target.uuid);
  }
  return false;
};

/* ------------------------------------------------------------------ Automaton actor data (Ch. 6 template) */

function templateEntry(variant) {
  const entry = CHAPTER_SIX_CREATURES.find(candidate => candidate.id === AUTOMATON_VARIANTS[variant].templateId);
  need(entry?.statblock, `The Ch. 6 template for the ${variant} Automaton is missing.`);
  return entry;
}

function attackItem(action, bonus) {
  const def = ACTION_DEFS[action];
  const ranged = def.kind === "ranged";
  const range = ranged ? { override: true, value: def.range[0], long: def.range[1], units: "ft" } : { override: true, value: def.reach, units: "ft" };
  return {
    name: def.label, type: "feat", img: "icons/svg/sword.svg",
    system: {
      description: { value: `<p>${esc(def.label)}: ${esc(def.damage)} ${esc(def.damageType)} damage.</p>`, chat: "" },
      activities: { ak5eAttack000001: {
        _id: "ak5eAttack000001", type: "attack", name: def.label, activation: { type: "action", value: 1 },
        attack: { ability: "none", flat: true, bonus: String(bonus), type: { value: ranged ? "ranged" : "melee", classification: "weapon" } },
        range, target: { affects: { type: "creature", count: "1" } },
        damage: { parts: [{ number: 1, denomination: 8, bonus: "2", types: [def.damageType] }] }, consumption: { targets: [] }
      } }
    },
    flags: { ak5e: { automatonAttack: action } }
  };
}

/**
 * The Automaton actor data for a Professional Engineer build. `stats` is computed on the requesting client:
 * hpMax (25 + the Technology reading), pb (the Artificer's PB, applied as an Active Effect) and attackBonus (INT + PB).
 */
export function automatonActorData(creator, spec) {
  const variant = spec.variant, def = AUTOMATON_VARIANTS[variant];
  need(def, "Choose an Automaton variant: platform, airSupport or turret.");
  const entry = templateEntry(variant), statblock = entry.statblock;
  const abilities = Object.fromEntries(ABILITY_KEYS.map((key, index) => [key, statblock.abilityScores[index]])
    .filter(([, score]) => score !== null && score !== undefined).map(([key, value]) => [key, { value }]));
  const hpMax = Number(spec.stats?.hpMax), pb = Number(spec.stats?.pb), attackBonus = Number(spec.stats?.attackBonus);
  need([hpMax, pb, attackBonus].every(Number.isFinite) && hpMax >= 1, "The Automaton statistics are incomplete.");
  const attacks = def.actions.filter(action => ACTION_DEFS[action].kind && action !== "multiattack").map(action => attackItem(action, attackBonus));
  const textFeatures = (entry.features ?? []).filter(feature => !(feature.section === "Actions" && ATTACK_FEATURES[feature.name]))
    .map(feature => ({ name: feature.name, type: "feat", img: "icons/svg/mystery-man.svg",
      system: { description: { value: feature.content ?? "", chat: "" } }, flags: { ak5e: { automatonFeature: feature.section } } }));
  return {
    _id: spec.automatonId,
    name: `${def.label} Automaton (${creator.name})`,
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    ownership: { ...(creator.ownership ?? {}) },
    prototypeToken: { actorLink: true, name: `${def.label} Automaton`, width: 1, height: 1 },
    system: {
      abilities,
      attributes: {
        ac: { flat: statblock.armorClass.value, calc: "flat" },
        hp: { value: hpMax, max: hpMax, formula: "" },
        movement: { walk: statblock.movement.walk, fly: statblock.movement.fly, hover: statblock.movement.hover, units: "ft" },
        senses: { ranges: { darkvision: 60 } }
      },
      details: { type: { value: "construct", subtype: "Drone" }, alignment: "Neutral", cr: 2,
        biography: { value: entry.content ?? "", public: entry.content ?? "" } },
      traits: { size: "sm", di: { value: ["poison", "necrotic"] }, ci: { value: ["charmed", "frightened", "poisoned"], custom: "Necrotised; Nervous Impairment" } }
    },
    items: [...attacks, ...textFeatures],
    effects: [{ name: "Creator proficiency", changes: [{ key: "system.attributes.prof", mode: 5, value: String(pb) }], flags: { ak5e: { automatonStats: true } } }],
    flags: { ak5e: {
      automaton: { creator: creator.uuid, variant, upgrades: [], personality: null, destroyed: false, exempt: false, attackBonus },
      chapterSixId: entry.id,
      sourceFile: "06_chapter_6_dwellers_of_terra.txt"
    } }
  };
}

/* ------------------------------------------------------------------ GM relay for world-document creation */

export const automatonIdFor = operationId => opaqueKey(`${operationId}:automaton`);

/**
 * Automaton statistics from the Artificer's own sheet: HP = 25 + the Technology Modifier reading (C3:6887), PB, and
 * attack bonus = INT modifier + PB (Professional Engineer). The GM client recomputes these from the Artificer's Actor,
 * so a client cannot ask the relay for a different HP total or attack bonus than the rules give.
 */
export function automatonStatsFor(actor, choice) {
  need(["techTotal", "intMod"].includes(choice), "Choose how the Technology Modifier is read before creating the Automaton.");
  const techMod = technologyModifierValue(actor, choice);
  const pb = pbOf(actor), intMod = Number(actor.system?.abilities?.int?.mod ?? 0);
  need(Number.isFinite(intMod) && Number.isFinite(pb), "Review your Intelligence modifier before creating the Automaton.");
  return { hpMax: Math.max(1, AUTOMATON_BASE_HP + techMod), pb, attackBonus: intMod + pb, technologyModifier: choice, techMod };
}

/** GM-client creation of a World Actor. Players submit through the relay; the GM's client writes the document. */
export const artificerRelay = createOperationKernel({
  label: "Artificer", stateFlag: "artificerRelay", requestFlag: "artificerRelayRequest", responseFlag: "artificerRelayResponse",
  receiptFlag: "artificerRelayReceipts", benefitFlag: "artificerRelayBenefit", rollFlag: "artificerRelayRoll", tagPreset: "custom",
  getState: actor => ({ operations: [], ...structuredClone(flag(actor, "artificerRelay") ?? {}) }),
  isMember: isArtificer,
  perform: async (actor, command, data, _op, state) => {
    need(["createAutomaton", "deleteAutomaton"].includes(command), "Unknown Artificer relay command.");
    need(isArtificer(actor), "The Artificer relay needs the Artificer branch.");
    need(gmActive(), "Only the elected GM client may create or delete an Automaton.");
    need(/^[A-Za-z0-9]{16}$/.test(String(data.automatonId ?? "")), "A valid Automaton ID is required.");
    if (command === "deleteAutomaton") {
      // Only the Automaton this use built, and only if this Artificer made it (the same check the owner's own undo makes).
      const target = game.actors?.get?.(data.automatonId);
      need(target && data.useId && target.id === automatonIdFor(data.useId) && automatonFlag(target).creator === actor.uuid,
        "This Automaton was not built by this use; it is not deleted.");
      await target.delete();
      return state;
    }
    if (!game.actors?.get?.(data.automatonId)) {
      // The client's numbers are not trusted: the GM recomputes HP, PB and the attack bonus from the Artificer's own sheet.
      const stats = automatonStatsFor(actor, data.stats?.technologyModifier);
      await Actor.implementation.create(automatonActorData(actor, { ...data, stats }), { keepId: true });
    }
    return state;
  }
});

/* ------------------------------------------------------------------ plans */

function setupPlan(actor, state, data = {}) {
  need(isArtificer(actor), "Tools of Creation and Destruction is an Artificer feature.");
  const warnings = [];
  const skill = actor.system?.skills?.ak5etech ?? {};
  const setup = artificerState(actor).setup ?? {};
  const expertTouch = setup.expertTouch !== true;
  const fields = {}, before = {};
  // Heavy Melee proficiency: the custom weapon-proficiency text, merged without duplicates (supporter convention).
  const weaponText = actor.system?.traits?.weaponProf?.custom ?? "";
  const weaponSet = [...new Set([...String(weaponText).split(";").map(v => v.trim()).filter(Boolean), HEAVY_MELEE])].join("; ");
  fields["system.traits.weaponProf.custom"] = weaponSet;
  before["system.traits.weaponProf.custom"] = weaponText;
  // Expert Touch: Tech proficiency, or Expertise when already proficient; applied once (idempotent).
  if (expertTouch) {
    const current = Number(skill.value ?? 0);
    fields["system.skills.ak5etech.value"] = current >= 1 ? Math.max(2, current) : 1;
    before["system.skills.ak5etech.value"] = current;
  }
  // Vehicles (Drones): recorded as custom tool text.
  const toolText = actor.system?.traits?.toolProf?.custom ?? "";
  const toolSet = [...new Set([...String(toolText).split(";").map(v => v.trim()).filter(Boolean), VEHICLE_DRONES])].join("; ");
  fields["system.traits.toolProf.custom"] = toolSet;
  before["system.traits.toolProf.custom"] = toolText;
  return {
    title: "Artificer setup: Heavy Melee, Expert Touch, Vehicles (Drones), Calculated Strikes",
    warnings,
    apply(_next, receipt) {
      receipt.targets = [{ kind: "artificerFields", uuid: actor.uuid, name: actor.name, ready: true, set: fields, before }];
      receipt.summary = `${actor.name} gains Heavy Melee Weapon proficiency, Tech ${expertTouch ? "proficiency or Expertise" : "(already applied)"}, Vehicles (Drones), and Calculated Strikes (reminder: use INT for Weapon Attack and damage rolls).`;
      receipt.result = { weaponProficiency: "Heavy Melee Weapons", vehicles: "Vehicles (Drones)", calculatedStrikes: true };
      const updates = { "flags.ak5e.artificer.calculatedStrikes": true };
      if (expertTouch) updates["flags.ak5e.artificer.setup"] = { ...setup, expertTouch: true };
      return updates;
    },
  };
}
// The relay reads validateTarget from the plan function (PLANS[command]), not from the plan it returns.
setupPlan.validateTarget = fieldsValidate;
setupPlan.validateRevert = fieldsValidate;

/** As One (L1): each Automaton may take an Action when you take the Attack Action; it cannot repeat that Action until your next Turn. */
function asOnePlan(actor, state, data = {}) {
  need(isArtificer(actor), "As One is an Artificer feature.");
  const warnings = [];
  const automaton = automatonAt(actor, data.automatonUuid, warnings);
  const variant = automatonFlag(automaton).variant;
  const action = String(data.action ?? "");
  need(AUTOMATON_VARIANTS[variant]?.actions.includes(action), "Choose an Action in that Automaton's stat block.");
  if (data.attackAction !== true) warn(warnings, "attackAction", "As One is used when you take the Attack Action during your Turn.");
  if (isDestroyedAutomaton(automaton)) warn(warnings, "destroyed", `${automaton.name} is destroyed (0 HP).`);
  const key = opaqueKey(automaton.uuid);
  const taken = artificerTurn(actor).asOne?.[key] ?? [];
  if (taken.includes(action)) warn(warnings, "repeat", `${automaton.name} already took ${ACTION_DEFS[action].label} this Turn cycle; it cannot repeat that Action until your next Turn.`);
  return {
    title: `As One: ${automaton.name} takes ${ACTION_DEFS[action].label}`,
    warnings,
    apply(_next, receipt) {
      const turn = artificerTurn(actor);
      const asOne = { ...(turn.asOne ?? {}), [key]: [...taken, action] };
      receipt.html = true;
      receipt.summary = `${esc(actor.name)} used As One: ${esc(automaton.name)} takes ${esc(ACTION_DEFS[action].label)}.${actionCardHtml(automaton, action, automatonFlag(automaton).attackBonus)}`;
      receipt.result = { automaton: automaton.uuid, action };
      return { "flags.ak5e.artificer.turn": { ...turn, asOne } };
    }
  };
}

function fortBuilderPlan(actor, state, data = {}) {
  need(isArtificer(actor), "Fort Builder is an Artificer feature.");
  const pool = getPool(actor, "artificerFortBuilder");
  const warnings = [];
  if (pool.value < 1) warn(warnings, "shortfall", `Fort Builder uses are spent (0 of ${pool.max} until your Long Rest).`);
  return {
    title: "Fort Builder: deploy portable cover",
    warnings,
    apply(_next, receipt) {
      const spend = spendResource(actor, receipt, { pool: "artificerFortBuilder", amount: 1, label: "Fort Builder use" });
      const cover = {
        id: `cover-${receipt.id}`, label: `Portable cover (${FORT_COVER.dimensions}, ${FORT_COVER.cover})`, upgrades: [],
        deployedAt: { sceneId: data.sceneId ?? null, x: data.x ?? null, y: data.y ?? null }
      };
      receipt.summary = `${actor.name} deployed portable cover (${FORT_COVER.dimensions}, ${FORT_COVER.cover}) to an unoccupied space within 5 feet.`;
      receipt.result = { cover: cover.id };
      return { ...spend, "flags.ak5e.artificer.covers": [...coversOf(actor), cover] };
    }
  };
}

/** Professional Engineer: an Automaton actor from the Ch. 6 template, created through the GM relay. */
function buildAutomatonPlan(actor, state, data = {}) {
  need(isArtificer(actor), "Professional Engineer is an Artificer feature.");
  need(AUTOMATON_VARIANTS[data.variant], "Choose an Automaton variant: platform, airSupport or turret.");
  // The reading decides the Technology Modifier: a recorded GM ruling, else the player's choice (data.technologyModifier).
  if (data.technologyModifier !== undefined && data.readings?.technologyModifier === undefined) {
    data.readings = { ...(data.readings ?? {}), technologyModifier: data.technologyModifier };
  }
  const warnings = [];
  const counting = automatonsOf(actor).filter(countsAgainstCap).length, cap = automatonCap(actor);
  if (counting + 1 > cap) {
    warn(warnings, "cap", `Your Automaton maximum is ${cap}; this makes ${counting + 1}. The source says the earlier Automaton then crumbles to uselessness. Nothing is changed automatically.`);
  }
  if (!game.user?.isGM && !game.users?.activeGM) {
    warn(warnings, "noGM", "No GM is connected, so the Automaton cannot be created until a GM is connected. Nothing will change.");
  }
  const variant = data.variant;
  return {
    title: `Professional Engineer: build a ${AUTOMATON_VARIANTS[variant].label} Automaton`,
    warnings,
    reading: "technologyModifier",
    async apply(_next, receipt, choice) {
      const { techMod, ...stats } = automatonStatsFor(actor, choice);
      const { pb } = stats;
      const automatonId = automatonIdFor(receipt.id), uuid = `Actor.${automatonId}`;
      const name = `${AUTOMATON_VARIANTS[variant].label} Automaton (${actor.name})`;
      const summary = `${actor.name} built ${name}: ${stats.hpMax} HP (${AUTOMATON_BASE_HP} + Technology ${techMod} via ${choice === "techTotal" ? "the Technology total" : "Intelligence modifier"}), Proficiency Bonus ${pb}, attack +${stats.attackBonus} (Intelligence + PB).`;
      // F-R8: every fallible step is done before the world Actor exists. The relay is idempotent per opId (the Actor ID
      // derives from it), so a retry with the same opId adopts the Automaton and never creates a second one.
      const list = artificerState(actor).automatons ?? [];
      await artificerRelay.submit(actor, "createAutomaton", { confirmation: true, variant, automatonId, stats }, `${receipt.id}-create`);
      // attempted: the create ran, so undo of this receipt (even one left pending by a later failed write) deletes it.
      receipt.targets = [{ kind: "artificerAutomaton", uuid, name, ready: true, attempted: true }];
      receipt.summary = summary;
      receipt.result = { automatonUuid: uuid, ...stats, variant };
      return { "flags.ak5e.artificer.automatons": [...list, uuid] };
    }
  };
}

/** Attack-card markup: attack and damage buttons only. Nothing rolls until a click. */
function actionCardHtml(automaton, action, attackBonus = 0) {
  const def = ACTION_DEFS[action];
  if (!def) return "";
  const bonus = Number(attackBonus) || 0;
  const attack = `1d20 ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`;
  const buttons = [];
  for (let i = 0; i < def.attacks; i++) {
    const suffix = def.attacks > 1 ? ` ${i + 1}` : "";
    buttons.push(`<button type="button" data-ak5e-automaton-roll="attack" data-automaton="${esc(automaton.uuid)}" data-formula="${esc(attack)}" data-label="${esc(`${automaton.name}: ${def.label} attack`)}">Roll attack${esc(suffix)}</button>`);
    buttons.push(`<button type="button" data-ak5e-automaton-roll="damage" data-automaton="${esc(automaton.uuid)}" data-formula="${esc(def.damage)}" data-label="${esc(`${automaton.name}: ${def.label} damage`)}">Roll damage${esc(suffix)}</button>`);
  }
  return `<div class="ak5e-automaton-action"><p>${esc(automaton.name)}: ${esc(def.label)}</p>${buttons.join("")}</div>`;
}

/** Control (L1): a Bonus Action command. Level 13+ commands all Automatons, each may move and take an Action. */
function commandAutomatonPlan(actor, state, data = {}) {
  need(isArtificer(actor), "Commanding an Automaton is an Artificer feature.");
  const level = supporterLevel(actor) ?? 1, advanced = level >= 13;
  const move = data.move === true, action = data.action ? String(data.action) : null;
  need(move || action, "Choose a move or one Action in the stat block.");
  const warnings = [];
  const targets = data.all === true ? rawAutomatons(actor) : [automatonAt(actor, data.automatonUuid, warnings)];
  need(targets.length, "You have no Automaton to command.");
  if (data.all === true) levelWarning(warnings, actor, 13, "Commanding all Automatons at once");
  if (move && action && !advanced) levelWarning(warnings, actor, 13, "Moving and taking an Action with one command");
  if (move && targets.some(t => !AUTOMATON_VARIANTS[automatonFlag(t).variant]?.moves)) {
    warn(warnings, "speed", "A Turret has speed 0 ft; it cannot move.");
  }
  for (const t of targets) {
    const variant = automatonFlag(t).variant;
    if (action) need(AUTOMATON_VARIANTS[variant]?.actions.includes(action), `${t.name} has no ${action} Action in its stat block.`);
    if (isDestroyedAutomaton(t)) warn(warnings, "destroyed", `${t.name} is destroyed (0 HP); rebuild it first.`);
  }
  distanceWarning(warnings, data.distance, COMMAND_RANGE_FT, `The Automaton is beyond ${COMMAND_RANGE_FT} feet (${Math.round(Number(data.distance))} ft).`);
  const turn = artificerTurn(actor);
  if (turn.bonusUsed === true) warn(warnings, "bonusAction", "You already used your Bonus Action this Turn to command an Automaton.");
  return {
    title: data.all === true ? "Command all Automatons" : `Command ${targets[0].name}`,
    warnings,
    apply(_next, receipt) {
      const parts = targets.map(t => {
        const lines = [];
        if (move) lines.push(`<p>${esc(t.name)} moves to a location of your choice (verbal command).</p>`);
        if (action) lines.push(actionCardHtml(t, action, automatonFlag(t).attackBonus));
        return lines.join("");
      });
      receipt.html = true;
      receipt.summary = `${esc(actor.name)} commanded ${targets.length > 1 ? "all Automatons" : esc(targets[0].name)} with a Bonus Action.${parts.join("")}`;
      receipt.result = { commanded: targets.map(t => t.uuid), move, action };
      return { "flags.ak5e.artificer.turn": { ...turn, bonusUsed: true } };
    }
  };
}

/** Replacement (L1): a destroyed Automaton is rebuilt by a confirmed Long Rest, or for 500 LMD (clamped at 0). */
function rebuildPlan(actor, state, data = {}) {
  need(isArtificer(actor), "Rebuilding an Automaton is an Artificer feature.");
  need(["longRest", "lmd"].includes(data.method), "Choose a Long Rest rebuild or 500 LMD.");
  const warnings = [];
  const automaton = automatonAt(actor, data.automatonUuid, warnings);
  if (!isDestroyedAutomaton(automaton)) warn(warnings, "notDestroyed", `${automaton.name} is not destroyed; a rebuild is for a destroyed Automaton.`);
  if (data.method === "lmd" && Number(actor.system?.currency?.cp ?? 0) < REBUILD_LMD) {
    warn(warnings, "shortfall", `Rebuilding costs ${REBUILD_LMD} LMD; the character has ${Number(actor.system?.currency?.cp ?? 0)} LMD (shortfall ${REBUILD_LMD - Number(actor.system?.currency?.cp ?? 0)} LMD).`);
  }
  const max = hpMaxOf(automaton);
  return {
    title: `Rebuild ${automaton.name} (${data.method === "lmd" ? `${REBUILD_LMD} LMD` : "Long Rest"})`,
    warnings,
    apply(_next, receipt) {
      const set = { "flags.ak5e.automaton.destroyed": false, "system.attributes.hp.value": max };
      const before = { "flags.ak5e.automaton.destroyed": automatonFlag(automaton).destroyed === true, "system.attributes.hp.value": hpOf(automaton) };
      receipt.targets = [{ kind: "artificerFields", uuid: automaton.uuid, name: automaton.name, ready: true, set, before }];
      const updates = data.method === "lmd"
        ? spendResource(actor, receipt, { path: "system.currency.cp", amount: REBUILD_LMD, label: "LMD" })
        : {};
      receipt.summary = data.method === "lmd"
        ? `${actor.name} rebuilt ${automaton.name} for ${REBUILD_LMD} LMD (replacement components).`
        : `${actor.name} rebuilt ${automaton.name} as a Long Rest Activity, keeping its retained components.`;
      receipt.result = { automaton: automaton.uuid, method: data.method, hp: max };
      return updates;
    }
  };
}

/** Concussive Maintenance (L10): sacrifice one Attack, expend one Aid Die; roll Aid Die x PB as a heal the owner clicks. */
function concussivePlan(actor, state, data = {}) {
  need(isArtificer(actor), "Concussive Maintenance is an Artificer feature.");
  const warnings = [];
  const automaton = automatonAt(actor, data.automatonUuid, warnings);
  levelWarning(warnings, actor, 10, "Concussive Maintenance");
  distanceWarning(warnings, data.distance, 5, "The Automaton is outside your Reach (5 ft).");
  if (isDestroyedAutomaton(automaton)) warn(warnings, "destroyed", `${automaton.name} is destroyed (0 HP); a destroyed Automaton cannot be healed. Rebuild it first.`);
  if (resourceValue(actor, { pool: "aidDie" }) < 1) warn(warnings, "shortfall", "Aid Dice pool is empty (0 remaining).");
  const die = aidDieFormula(actor), pb = pbOf(actor);
  return {
    title: `Concussive Maintenance -> ${automaton.name}`,
    warnings,
    apply(_next, receipt) {
      const spend = spendAidDice(actor, 1, receipt);
      receipt.formula = `${die} * ${pb}`;
      receipt.rollLabel = "Concussive Maintenance (Aid Die x PB)";
      receipt.html = true;
      receipt.targets = [{ kind: "heal", uuid: automaton.uuid, name: automaton.name, amount: 0, ready: false,
        healingSource: "classFeature", constructException: true, recordTag: "concussiveMaintenance" }];
      receipt.summary = `${esc(actor.name)} sacrificed one Attack to bash ${esc(automaton.name)} into shape and expended one Aid Die. `
        + `<button type="button" data-ak5e-artificer-roll="${esc(receipt.id)}" data-actor="${esc(actor.uuid)}">Roll ${esc(die)} x ${esc(pb)} (heal ${esc(automaton.name)})</button>`
        + "<p>Healing applies only when you roll.</p>";
      receipt.result = { die, pb, automaton: automaton.uuid };
      return spend;
    }
  };
}

/** Rise of the Machines (L13): INT, WIS and CHA become 10, and two chosen saving throws become proficient. */
function advancedMatrixPlan(actor, state, data = {}) {
  need(isArtificer(actor), "The Advanced Personality Matrix is an Artificer feature.");
  const saves = Array.isArray(data.saves) ? data.saves : [];
  need(saves.length === 2 && new Set(saves).size === 2 && saves.every(key => ABILITY_KEYS.includes(key)), "Choose two different saving throws.");
  const warnings = [];
  const automatons = data.automatonUuid ? [automatonAt(actor, data.automatonUuid, warnings)] : automatonsOf(actor);
  need(automatons.length, "You have no live Automaton to upgrade.");
  levelWarning(warnings, actor, 13, "The Advanced Personality Matrix");
  return {
    title: "Advanced Personality Matrix",
    warnings,
    apply(_next, receipt) {
      receipt.targets = automatons.map(automaton => {
        const set = {}, prior = {};
        for (const key of MATRIX_KEYS) {
          set[`system.abilities.${key}.value`] = 10;
          prior[`system.abilities.${key}.value`] = Number(automaton.system?.abilities?.[key]?.value ?? 0);
        }
        for (const key of saves) {
          set[`system.abilities.${key}.proficient`] = 1;
          prior[`system.abilities.${key}.proficient`] = Number(automaton.system?.abilities?.[key]?.proficient ?? 0);
        }
        return { kind: "artificerFields", uuid: automaton.uuid, name: automaton.name, ready: true, set, before: prior };
      });
      receipt.summary = `${actor.name}'s Automatons gain the Advanced Personality Matrix: INT, WIS and CHA 10; proficiency in ${saves.map(key => ABILITY_NAMES[key]).join(" and ")} saving throws.`;
      receipt.result = { saves, automatons: automatons.map(a => a.uuid) };
      return {};
    }
  };
}

// The relay reads validateTarget from the plan function (PLANS[command]), so each relayable plan carries its check here.
rebuildPlan.validateTarget = fieldsValidate;
rebuildPlan.validateRevert = fieldsValidate;
advancedMatrixPlan.validateTarget = fieldsValidate;
advancedMatrixPlan.validateRevert = fieldsValidate;
// The Automaton a build created: its ID derives from this use's opId, and it is flagged as built by this source.
buildAutomatonPlan.validateTarget = (source, receipt, entry, target) => entry?.kind === "artificerAutomaton"
  && target?.uuid === entry.uuid && target.id === automatonIdFor(receipt.id) && automatonFlag(target).creator === source.uuid;
buildAutomatonPlan.validateRevert = buildAutomatonPlan.validateTarget;

export const artificerPlans = Object.freeze({
  artificerSetup: setupPlan,
  asOne: asOnePlan,
  fortBuilder: fortBuilderPlan,
  buildAutomaton: buildAutomatonPlan,
  commandAutomaton: commandAutomatonPlan,
  rebuildAutomaton: rebuildPlan,
  concussiveMaintenance: concussivePlan,
  advancedPersonalityMatrix: advancedMatrixPlan
});

/* ------------------------------------------------------------------ panel */

const PANEL_BUTTONS = Object.freeze([
  ["artificerSetup", "Set up Artificer proficiencies"],
  ["buildAutomaton", "Build Automaton (Professional Engineer)"],
  ["commandAutomaton", "Command Automaton (Bonus Action)"],
  ["asOne", "As One (Attack Action)"],
  ["fortBuilder", "Fort Builder (Action)"],
  ["concussiveMaintenance", "Concussive Maintenance"],
  ["rebuildAutomaton", "Rebuild destroyed Automaton"],
  ["advancedPersonalityMatrix", "Advanced Personality Matrix"]
]);

export function artificerPanel(actor) {
  if (!isArtificer(actor)) return "";
  const level = supporterLevel(actor) ?? 1, cap = automatonCap(actor);
  const counting = automatonsOf(actor).filter(countsAgainstCap).length;
  const rows = rawAutomatons(actor).map(a => {
    const flags = automatonFlag(a);
    const status = isDestroyedAutomaton(a) ? " (destroyed)" : "";
    const exempt = flags.exempt === true ? " (exempt from the cap)" : "";
    return `<li>${esc(a.name)} (${esc(AUTOMATON_VARIANTS[flags.variant]?.label ?? flags.variant)}): HP ${esc(hpOf(a))} / ${esc(hpMaxOf(a))}, attack +${esc(flags.attackBonus ?? 0)}${esc(status)}${esc(exempt)}</li>`;
  }).join("");
  const pool = getPool(actor, "artificerFortBuilder");
  const buttons = PANEL_BUTTONS.map(([cmd, label]) => `<button type="button" data-supporter-cmd="${esc(cmd)}">${esc(label)}</button>`).join("");
  return `<section class="ak5e-artificer-panel">`
    + `<div class="ak5e-artificer-badges"><span class="ak5e-artificer-badge">Artificer DC ${esc(artificerDCRule(actor))}</span>`
    + `<span class="ak5e-artificer-badge">Automatons ${esc(counting)} / ${esc(cap)}</span>`
    + `<span class="ak5e-artificer-badge">Fort Builder ${esc(pool.value)} / ${esc(pool.max)}</span></div>`
    + (rows ? `<ul class="ak5e-artificer-automatons">${rows}</ul>` : "<p>No Automaton yet.</p>")
    + (artificerState(actor).calculatedStrikes ? "<p class=\"ak5e-artificer-note\">Calculated Strikes is a reminder: use Intelligence for your Weapon Attack and damage rolls by setting the ability on each weapon yourself.</p>" : "")
    + (level >= 17 ? `<p class="ak5e-artificer-note">Armoured Core: up to ${esc(upgradeCapFor(actor))} Upgrades per Automaton.</p>` : "")
    + `<p class="ak5e-artificer-note">${esc(MOD_PROFICIENCY_NOTE)}</p>`
    + `<div class="ak5e-artificer-button-row">${buttons}</div></section>`;
}

/* ------------------------------------------------------------------ buttons and dialogs */

async function askForm(title, content, read) {
  return foundry.applications.api.DialogV2.wait({
    window: { title }, position: { width: 440 }, rejectClose: false, content,
    buttons: [
      { action: "ok", label: "Confirm", default: true, callback: (_event, button) => read(button.form.elements) ?? false },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
}

const selectOptions = pairs => pairs.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
const automatonOptions = list => selectOptions(list.map(a => [a.uuid, a.name]));

/** Distance in feet from the Artificer's token to an Automaton's token on the current scene, when both are placed. */
function tokenDistance(actor, automaton) {
  // Measured on the grid between the two tokens; undefined (no warning) when either token is not on the viewed scene.
  return tokenDistanceFeet(actor.uuid, automaton.uuid);
}

/** Runs a confirmed use: one stable operation ID per click, so a retry resumes the same receipt. */
function runUse(actor, title, name, data) {
  const opId = foundry.utils.randomID();
  return confirmPlayUse(title, extra => supporterUses.execute(actor, name, { ...data, ...extra }, opId), { confirmed: true });
}

/** A use with no form of its own: the confirm summary comes first, and Cancel writes nothing (WORKFLOW §3.2). */
async function confirmedRunUse(actor, title, lines, name, data) {
  if (!await confirmSupporterUse(title, lines)) return null;
  return runUse(actor, title, name, data);
}

/** Command an Artificer control from its panel. Returns undefined for commands this branch does not own. */
export async function artificerCommand(actor, cmd) {
  const owned = ["artificerSetup", "buildAutomaton", "commandAutomaton", "asOne", "fortBuilder", "concussiveMaintenance", "rebuildAutomaton", "advancedPersonalityMatrix"];
  if (!owned.includes(cmd)) return undefined;
  need(isArtificer(actor), "Artificer commands need the Artificer branch.");
  if (cmd === "artificerSetup") return confirmedRunUse(actor, "Artificer setup",
    ["Records the Artificer setup on this character: Heavy Melee Weapons proficiency and the Tools of Creation and Destruction features."], "artificerSetup", {});
  if (cmd === "fortBuilder") return confirmedRunUse(actor, "Fort Builder",
    [`Deploys a portable cover (${FORT_COVER.dimensions}, ${FORT_COVER.cover}) to an unoccupied space within 5 feet.`, "Spends one Fort Builder use (Action); uses return on a Long Rest."], "fortBuilder", {});
  if (cmd === "buildAutomaton") {
    const choice = await askForm("Professional Engineer: build an Automaton",
      `<label>Variant <select name="variant">${selectOptions(Object.entries(AUTOMATON_VARIANTS).map(([k, v]) => [k, v.label]))}</select></label>`,
      el => ({ variant: el.variant.value }));
    return choice ? runUse(actor, "Build Automaton", "buildAutomaton", choice) : null;
  }
  const list = automatonsOf(actor);
  if (cmd === "commandAutomaton") {
    need(list.length, "You have no live Automaton to command.");
    const choice = await askForm("Command Automaton (Bonus Action)",
      `<label>Automaton <select name="automaton">${automatonOptions(list)}</select></label>`
      + `<label><input type="checkbox" name="move"> Move to a location of your choice</label>`
      + `<label>Stat-block Action <select name="action"><option value="">(none)</option>${selectOptions(["ram", "crossbow", "multiattack"].map(k => [k, ACTION_DEFS[k].label]))}</select></label>`,
      el => ({ automatonUuid: el.automaton.value, move: el.move.checked, action: el.action.value || null }));
    if (!choice) return null;
    const automaton = automatonAt(actor, choice.automatonUuid);
    return runUse(actor, "Command Automaton", "commandAutomaton", { ...choice, distance: tokenDistance(actor, automaton) });
  }
  if (cmd === "asOne") {
    need(list.length, "You have no live Automaton.");
    const choice = await askForm("As One: an Automaton takes an Action",
      `<label>Automaton <select name="automaton">${automatonOptions(list)}</select></label>`
      + `<label>Action <select name="action">${selectOptions(["ram", "crossbow", "multiattack"].map(k => [k, ACTION_DEFS[k].label]))}</select></label>`,
      el => ({ automatonUuid: el.automaton.value, action: el.action.value }));
    return choice ? runUse(actor, "As One", "asOne", { ...choice, attackAction: true }) : null;
  }
  if (cmd === "concussiveMaintenance") {
    need(list.length, "You have no live Automaton to repair.");
    const choice = await askForm("Concussive Maintenance",
      `<label>Automaton (within your Reach) <select name="automaton">${automatonOptions(list)}</select></label>`,
      el => ({ automatonUuid: el.automaton.value }));
    if (!choice) return null;
    return runUse(actor, "Concussive Maintenance", "concussiveMaintenance", { ...choice, distance: tokenDistance(actor, automatonAt(actor, choice.automatonUuid)) });
  }
  if (cmd === "rebuildAutomaton") {
    const destroyed = rawAutomatons(actor).filter(isDestroyedAutomaton);
    need(destroyed.length, "No destroyed Automaton to rebuild.");
    const choice = await askForm("Rebuild a destroyed Automaton",
      `<label>Automaton <select name="automaton">${automatonOptions(destroyed)}</select></label>`
      + `<label>Method <select name="method"><option value="longRest">Long Rest Activity (components retained)</option><option value="lmd">${REBUILD_LMD} LMD (components replaced)</option></select></label>`,
      el => ({ automatonUuid: el.automaton.value, method: el.method.value }));
    return choice ? runUse(actor, "Rebuild Automaton", "rebuildAutomaton", choice) : null;
  }
  // advancedPersonalityMatrix
  const saveOptions = selectOptions(RIDER_SAVE_KEYS.map(k => [k, ABILITY_NAMES[k]]));
  const choice = await askForm("Advanced Personality Matrix: two saving throws",
    `<label>First save <select name="a">${saveOptions}</select></label><label>Second save <select name="b">${saveOptions}</select></label>`,
    el => ({ saves: [el.a.value, el.b.value] }));
  return choice ? runUse(actor, "Advanced Personality Matrix", "advancedPersonalityMatrix", choice) : null;
}

/** Roll buttons on Automaton cards. A click rolls; nothing rolls on render. */
async function clickAutomatonRoll(button) {
  const actor = actorFromUuid(button.dataset.automaton);
  need(actor, "The Automaton no longer exists.");
  const owner = actor.isOwner || game.user.isGM;
  need(owner, "Only the Automaton's owner may roll its dice.");
  const roll = await new Roll(button.dataset.formula, actor.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: button.dataset.label ?? "Automaton roll" });
}

/** Heal roll for Concussive Maintenance: the engine's useRoll rolls, then applies the recorded heal. */
async function clickArtificerRoll(button) {
  const actor = actorFromUuid(button.dataset.actor);
  need(actor?.isOwner, "Only the Artificer's owner may roll this.");
  return supporterUses.command(actor, "useRoll", { useId: button.dataset.ak5eArtificerRoll }, foundry.utils.randomID());
}

export function renderArtificerCardButtons(message, html) {
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root?.querySelectorAll) return;
  const useId = message?.flags?.ak5e?.[supporterUses.cardFlag]?.useId ?? null;
  for (const button of root.querySelectorAll("[data-ak5e-automaton-roll], [data-ak5e-artificer-roll]")) {
    if (button.dataset.ak5eBound) continue;
    button.dataset.ak5eBound = "1";
    button.dataset.useId = useId ?? "";
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      button.disabled = true;
      const run = button.hasAttribute("data-ak5e-automaton-roll") ? clickAutomatonRoll(button) : clickArtificerRoll(button);
      Promise.resolve(run).catch(error => { console.error("AK5e | Artificer card", error); globalThis.ui?.notifications?.error?.(error.message); })
        .finally(() => { button.disabled = false; });
    });
  }
}

/* ------------------------------------------------------------------ hooks */

let hooksInstalled = false;

/** Turn start resets the Bonus Action and As One record (A2: tracked and warned only). */
const turnStart = async event => {
  const actor = actorFromUuid(event?.actorUuid);
  if (!actor || !isArtificer(actor) || !actor.isOwner) return;
  await actor.update({ "flags.ak5e.artificer.turn": null });
};

/**
 * At 0 HP an Automaton is destroyed (the flag is kept, the actor stays). Exactly one client writes it: the active GM's when a
 * GM is connected (so several clients never race on the same flag), else the client of the user who changed the HP.
 */
const autoDestroy = (actor, changes, _options, userId) => {
  const gm = globalThis.game?.users?.activeGM;
  if (gm ? gm.id !== game.user?.id : userId !== game.user?.id) return;
  if (!isAutomatonFlagged(actor) || automatonFlag(actor).destroyed === true || hpOf(actor) > 0) return;
  if (!actor.isOwner) return;
  Promise.resolve(actor.update({ "flags.ak5e.automaton.destroyed": true })).catch(error => console.error("AK5e | Automaton destroyed", error));
};

/** Idempotent: installs the turn reset, the destroyed check, card buttons and the GM relay listener once. */
export function registerArtificerHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineArtificerPools();
  onAk5eEvent("turnStart", turnStart);
  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("updateActor", autoDestroy);
    globalThis.Hooks.on("renderChatMessageHTML", (message, html) => {
      try { renderArtificerCardButtons(message, html); }
      catch (error) { console.error("AK5e | Artificer card", error); }
    });
    globalThis.Hooks.on("createChatMessage", (message, options, userId) => {
      Promise.resolve(artificerRelay.handle(message, options, userId)).catch(error => console.error("AK5e | Artificer relay", error));
    });
  }
}

export const artificerApi = Object.freeze({
  automatonsOf,
  coversOf,
  automatonCap,
  upgradeCapFor,
  countsAgainstCap,
  isDestroyedAutomaton,
  artificerDC: actor => artificerDCRule(actor),
  variants: AUTOMATON_VARIANTS,
  readings: artificerReadings
});
