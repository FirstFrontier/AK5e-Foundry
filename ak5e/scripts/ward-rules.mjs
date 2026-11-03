/** Ward Medic rules (AK5e v1.3.1 Ch. 3, Ward section C3:5049-5087).
 * Pure and deterministic: no VTT globals, no I/O, no randomness, no dice rolled.
 * Every function returns plain data, never mutates its arguments, and reports
 * rules failures as warning codes instead of throwing. Only malformed input
 * (non-numeric values, negative amounts, unknown enum values, out-of-range
 * levels) throws: TypeError for the wrong type, RangeError for a bad value.
 * Dice exist only as formula strings for the owner to roll later.
 */

export const WARD_FEATURES = Object.freeze({
  preventionNotCure: 1,
  statusResistance: 4,
  treatTheCause: 7,
  wardingSurge: 11,
  communityCare: 15
});

/** Action types that qualify for the Additional Temporary Hit Points die (C3:5061). */
const DIE_ACTION_TYPES = Object.freeze(["action", "bonus"]);
const ACTION_TYPES = Object.freeze(["action", "bonus", "reaction", "other"]);
const POOL_CHOICES = Object.freeze(["keep", "replace"]);

const EXTRA_DIE = "1d8";
const TREAT_THE_CAUSE_FORMULA = "2d10";
const TREAT_THE_CAUSE_TYPE = "force";
const TREAT_THE_CAUSE_RANGE_FEET = 30;
const COLLECTIVE_WARD_RANGE_FEET = 30;
const WARDING_SURGE_COST = 10;
const RESTORE_REACTION_COST = 15;
const WARD_REGENERATION_LEVEL = 15;
const MEDIC_MIN_LEVEL = 1;
const MEDIC_MAX_LEVEL = 20;

// ------------------------------------------------------------------ guards

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function requireNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

/** Whole, non-negative amount (Hit Points, temporary HP, Arts Points, Life Support). */
function requireAmount(value, name) {
  requireNumber(value, name);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be a whole number`);
  if (value < 0) throw new RangeError(`${name} must not be negative`);
  return value;
}

/** Whole number that may be negative (a temp-HP total after damage). */
function requireSignedInteger(value, name) {
  requireNumber(value, name);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be a whole number`);
  return value;
}

/** Distance in feet: `null`/`undefined` means unknown, otherwise a non-negative number. */
function requireDistance(value, name) {
  if (value === null || value === undefined) return null;
  requireNumber(value, name);
  if (value < 0) throw new RangeError(`${name} must not be negative`);
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new RangeError(`${name} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

/** A turn key is a string like "combatId:round:turn"; `null` means outside combat. */
function requireTurnKey(value, name) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new TypeError(`${name} must be a string or null`);
  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

function pushOnce(list, code) {
  if (!list.includes(code)) list.push(code);
}

const isAtMost = (distance, limit) => distance === null || distance <= limit;

// ------------------------------------------------------- grant and pools

/**
 * Additional Temporary Hit Points (C3:5061): the 1d8 applies to temporary HP
 * granted by an Action or Bonus Action, and the Arts Point bonus applies to
 * those same temporary HP only when an Art produced them.
 */
function extraTempHPParts({ actionType, fromArt, apSpent }) {
  requireEnum(actionType, ACTION_TYPES, "actionType");
  const dieFormula = DIE_ACTION_TYPES.includes(actionType) ? EXTRA_DIE : null;
  const spent = apSpent === undefined || apSpent === null ? 0 : requireAmount(apSpent, "apSpent");
  const apBonus = fromArt === true && dieFormula !== null ? spent : 0;
  return { dieFormula, apBonus };
}

/**
 * Converts an already-rolled healing amount into Ward temporary HP (C3:5059-5061).
 * Returns the parts and a formula string; the 1d8 is rolled by the owner later.
 */
export function wardGrant({ healingAmount, actionType, fromArt, apSpent } = {}) {
  const base = requireAmount(healingAmount, "healingAmount");
  const { dieFormula, apBonus } = extraTempHPParts({ actionType, fromArt, apSpent });
  const parts = [];
  if (base !== 0) parts.push(String(base));
  if (dieFormula !== null) parts.push(dieFormula);
  if (apBonus !== 0) parts.push(String(apBonus));
  return {
    base,
    dieFormula,
    apBonus,
    formula: parts.length > 0 ? parts.join(" + ") : "0"
  };
}

/** The same Additional Temporary Hit Points rule for any temporary HP this Medic grants. */
export function extraTempHP({ actionType, fromArt, apSpent } = {}) {
  return extraTempHPParts({ actionType, fromArt, apSpent });
}

/**
 * Ward pool selection (ruling 2026-10-28): pools never stack. The recipient
 * keeps the existing pool or replaces it with the incoming Ward; the suggestion
 * is display-only and ignores the choice already made.
 */
export function choosePool({
  currentTemp,
  currentTag,
  incomingAmount,
  medicUuid,
  choice = null
} = {}) {
  const temp = requireAmount(currentTemp, "currentTemp");
  const incoming = requireAmount(incomingAmount, "incomingAmount");
  const selected = choice === undefined ? null : choice;
  if (selected !== null) requireEnum(selected, POOL_CHOICES, "choice");

  const suggestion = incoming > temp ? "replace" : "keep";
  if (selected !== "replace") {
    return { temp, tag: currentTag ?? null, changed: false, suggestion };
  }

  requireString(medicUuid, "medicUuid");
  return {
    temp: incoming,
    tag: { medicUuid, grantedAt: null, amount: incoming },
    changed: true,
    suggestion
  };
}

/** Remaining Ward HP granted by this Medic: live temp HP of a tagged pool, else 0. */
export function wardOf({ temp, tag } = {}, medicUuid) {
  const remaining = requireAmount(temp, "temp");
  // Only a named Medic owns Ward (ruling 2026-10-28). A missing or empty
  // identity is not a Medic, so it must not match a tag that is itself missing
  // its owner.
  if (typeof medicUuid !== "string" || medicUuid.length === 0) return 0;
  if (!isPlainObject(tag) || tag.medicUuid !== medicUuid) return 0;
  return remaining > 0 ? remaining : 0;
}

/**
 * Tag after a native temporary-HP change: depleted pools and pools replaced by
 * a non-Ward grant lose the tag; partial depletion and Ward growth keep it.
 */
export function reconcileTag({ tempBefore, tempAfter, tag, grantedByWard } = {}) {
  const before = requireSignedInteger(tempBefore, "tempBefore");
  const after = requireSignedInteger(tempAfter, "tempAfter");
  if (tag !== null && tag !== undefined && !isPlainObject(tag)) {
    throw new TypeError("tag must be a Ward tag object or null");
  }
  const currentTag = tag ?? null;
  if (after <= 0) return null;
  if (after > before && grantedByWard !== true) return null;
  return currentTag;
}

// ------------------------------------------------------------ status save

/**
 * Status Resistance (C3:5063-5064): the first save each Turn against a Status
 * Condition has Advantage while the creature has this Medic's Ward. Outside
 * combat there is no turn key, so the Advantage is never consumed.
 */
export function statusResistance({
  hasWard,
  savingVsStatusCondition,
  turnKey,
  usedTurnKey
} = {}) {
  const key = requireTurnKey(turnKey, "turnKey");
  const used = requireTurnKey(usedTurnKey, "usedTurnKey");
  const qualifies = Boolean(hasWard) && Boolean(savingVsStatusCondition);
  if (!qualifies) return { advantage: false, usedTurnKey: used };
  if (key === null) return { advantage: true, usedTurnKey: used };
  if (key === used) return { advantage: false, usedTurnKey: used };
  return { advantage: true, usedTurnKey: key };
}

// -------------------------------------------------------- Treat the Cause

/**
 * Treat the Cause, not the Symptom (C3:5066-5069). Broken preconditions are
 * warnings; the card is still produced so the table can see what was attempted.
 */
export function treatTheCause({
  targetHasWard,
  attackerDistanceFeet,
  reactionAvailable,
  saveDC
} = {}) {
  const dc = requireNumber(saveDC, "saveDC");
  if (dc < 0) throw new RangeError("saveDC must not be negative");
  const distance = requireDistance(attackerDistanceFeet, "attackerDistanceFeet");

  const warnings = [];
  if (!targetHasWard) pushOnce(warnings, "targetHasNoWard");
  if (distance === null) pushOnce(warnings, "attackerRangeUnknown");
  else if (distance > TREAT_THE_CAUSE_RANGE_FEET) pushOnce(warnings, "attackerOutOfRange");
  if (!reactionAvailable) pushOnce(warnings, "noReaction");

  return {
    warnings,
    save: { ability: "dex", dc },
    damage: { formula: TREAT_THE_CAUSE_FORMULA, type: TREAT_THE_CAUSE_TYPE },
    onFail: { damage: "full", forcedMiss: true },
    onSuccess: { damage: "half", forcedMiss: false },
    restoreReactionCost: RESTORE_REACTION_COST
  };
}

/** Damage and forced miss from a confirmed save outcome; half damage rounds down. */
export function treatTheCauseOutcome({ saveSucceeded, damageRolled } = {}) {
  const rolled = requireAmount(damageRolled, "damageRolled");
  if (saveSucceeded) return { damage: Math.floor(rolled / 2), forcedMiss: false };
  return { damage: rolled, forcedMiss: true };
}

// ------------------------------------------------------------ Warding Surge

/**
 * Warding Surge (C3:5071-5076): 10 Life Support for Resistance to the listed
 * Damage Types until the end of the current Turn. Overspending clamps at 0.
 */
export function wardingSurge({
  targetHasWard,
  reactionAvailable,
  lifeSupport,
  damageTypes
} = {}) {
  const pool = requireAmount(lifeSupport, "lifeSupport");
  const types = requireArray(damageTypes, "damageTypes");
  const resistTypes = [];
  for (const type of types) {
    const name = requireString(type, "damageTypes entry");
    if (!resistTypes.includes(name)) resistTypes.push(name);
  }

  const warnings = [];
  if (!targetHasWard) pushOnce(warnings, "targetHasNoWard");
  if (!reactionAvailable) pushOnce(warnings, "noReaction");
  const shortfall = Math.max(0, WARDING_SURGE_COST - pool);
  if (shortfall > 0) pushOnce(warnings, "lifeSupportShort");

  return {
    warnings,
    cost: WARDING_SURGE_COST,
    lifeSupportAfter: Math.max(0, pool - WARDING_SURGE_COST),
    shortfall,
    resistTypes,
    expires: "endOfCurrentTurn",
    restoreReactionCost: RESTORE_REACTION_COST
  };
}

/** Spend 15 Life Support to restore use of the Reaction (C3:5069, C3:5076). */
export function restoreReaction({ lifeSupport } = {}) {
  const pool = requireAmount(lifeSupport, "lifeSupport");
  const shortfall = Math.max(0, RESTORE_REACTION_COST - pool);
  const warnings = [];
  if (shortfall > 0) pushOnce(warnings, "lifeSupportShort");
  return {
    cost: RESTORE_REACTION_COST,
    lifeSupportAfter: Math.max(0, pool - RESTORE_REACTION_COST),
    shortfall,
    warnings
  };
}

// ------------------------------------------------------ Collective Ward

function requireDonor(donor, index) {
  if (!isPlainObject(donor)) throw new TypeError(`donors[${index}] must be an object`);
  const uuid = requireString(donor.uuid, `donors[${index}].uuid`);
  const ward = requireAmount(donor.ward, `donors[${index}].ward`);
  const distanceFeet = requireDistance(donor.distanceFeet, `donors[${index}].distanceFeet`);
  return { uuid, ward, distanceFeet };
}

/**
 * Collective Ward settlement (C3:5083, ordering ruling 2026-10-28).
 * `damage` is the amount left after DR and Resistance/Vulnerability. Ward
 * removed from donors reduces that damage before the recipient's own temporary
 * HP absorb anything; donor Ward is consumed, never transferred. Out-of-range
 * or unknown-range participants warn but still settle.
 */
export function collectiveWardSettlement({
  damage,
  recipientTemp,
  recipientHasWard,
  recipientDistanceFeet,
  donors,
  removals
} = {}) {
  const totalDamage = requireAmount(damage, "damage");
  const temp = requireAmount(recipientTemp, "recipientTemp");
  const recipientDistance = requireDistance(recipientDistanceFeet, "recipientDistanceFeet");
  const donorList = requireArray(donors, "donors");
  if (!isPlainObject(removals)) throw new TypeError("removals must be an object");
  // The whole removal map is player input: every entry is validated, including
  // an entry for a uuid that is not a listed donor, so a caller bug cannot hide
  // behind a dropped entry. Own keys only: inherited names like "constructor"
  // are not removals.
  for (const uuid of Object.keys(removals)) {
    requireAmount(removals[uuid], `removals[${uuid}]`);
  }

  const warnings = [];
  if (!recipientHasWard) pushOnce(warnings, "recipientHasNoWard");
  if (!isAtMost(recipientDistance, COLLECTIVE_WARD_RANGE_FEET)) {
    pushOnce(warnings, "recipientOutOfRange");
  }

  let removed = 0;
  const donorUpdates = [];
  const seenDonorUuids = new Set();
  for (let index = 0; index < donorList.length; index += 1) {
    const donor = requireDonor(donorList[index], index);
    // Two entries are one creature and one Ward pool. Settling both would spend
    // that creature's Ward twice, so a duplicate listing is malformed input.
    if (seenDonorUuids.has(donor.uuid)) {
      throw new TypeError(`donors[${index}].uuid "${donor.uuid}" is listed more than once`);
    }
    seenDonorUuids.add(donor.uuid);

    if (!Object.hasOwn(removals, donor.uuid)) continue;
    const requested = removals[donor.uuid];
    const wanted = requireAmount(requested, `removals[${donor.uuid}]`);

    if (donor.distanceFeet === null) pushOnce(warnings, "donorRangeUnknown");
    else if (donor.distanceFeet > COLLECTIVE_WARD_RANGE_FEET) pushOnce(warnings, "donorOutOfRange");

    const taken = Math.min(wanted, donor.ward);
    if (wanted > donor.ward) pushOnce(warnings, "removalExceedsWard");
    if (taken <= 0) continue;

    removed += taken;
    donorUpdates.push({
      uuid: donor.uuid,
      wardBefore: donor.ward,
      wardAfter: donor.ward - taken
    });
  }

  const damageAfterWard = Math.max(0, totalDamage - removed);
  const wasted = Math.max(0, removed - totalDamage);
  if (wasted > 0) pushOnce(warnings, "wardWasted");
  const tempAbsorbed = Math.min(temp, damageAfterWard);

  return {
    removed,
    damageAfterWard,
    wasted,
    tempAbsorbed,
    hpLoss: damageAfterWard - tempAbsorbed,
    donorUpdates,
    warnings
  };
}

// ------------------------------------------------------ Ward Regeneration

/**
 * Ward Regeneration (C3:5085): at 15th level, starting your Turn without your
 * Ward grants temporary HP equal to half your Medic level, rounded up. An
 * existing pool is a keep/replace choice for the owner, not a stack.
 */
export function wardRegeneration({ medicLevel, hasOwnWard, currentTemp } = {}) {
  requireNumber(medicLevel, "medicLevel");
  if (!Number.isInteger(medicLevel)) throw new RangeError("medicLevel must be a whole number");
  if (medicLevel < MEDIC_MIN_LEVEL || medicLevel > MEDIC_MAX_LEVEL) {
    throw new RangeError(`medicLevel must be between ${MEDIC_MIN_LEVEL} and ${MEDIC_MAX_LEVEL}`);
  }
  const temp = requireAmount(currentTemp, "currentTemp");

  const warnings = [];
  if (temp > 0) pushOnce(warnings, "replacesOtherTemp");

  return {
    eligible: medicLevel >= WARD_REGENERATION_LEVEL && !hasOwnWard,
    amount: Math.ceil(medicLevel / 2),
    warnings
  };
}
