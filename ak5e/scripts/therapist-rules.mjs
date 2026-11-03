/**
 * Therapist Branch rules (AK5e v1.3.1, Ch. 3 C3:4923-5004).
 *
 * Pure and deterministic: no Foundry globals, no hooks, no rolls, no randomness
 * and no I/O. Every export returns a fresh object/array and
 * never mutates its inputs. Dice appear only as formula strings; nothing is rolled.
 *
 * Table-play policy (WORKFLOW §3.2): a legal-but-unsatisfied therapy condition is a
 * warning, never an error. Only malformed input (an unknown therapy id, a
 * non-numeric level) throws.
 */

const THERAPY_TABLE = [
  { id: "empowering", name: "Empowering Therapy", tier: "basic", lifeSupportCost: 5, minLevel: 1 },
  { id: "energising", name: "Energising Therapy", tier: "basic", lifeSupportCost: 5, minLevel: 1 },
  { id: "longDistance", name: "Long-Distance Therapy", tier: "basic", lifeSupportCost: 5, minLevel: 1 },
  { id: "longTerm", name: "Long-Term Therapy", tier: "basic", lifeSupportCost: 5, minLevel: 1 },
  { id: "psychological", name: "Psychological Therapy", tier: "basic", lifeSupportCost: 5, minLevel: 1 },
  { id: "recuperative", name: "Recuperative Therapy", tier: "basic", lifeSupportCost: 5, minLevel: 1 },
  { id: "cleansing", name: "Cleansing Therapy", tier: "advanced", lifeSupportCost: 10, minLevel: 11 },
  { id: "regenerative", name: "Regenerative Therapy", tier: "advanced", lifeSupportCost: 10, minLevel: 11 },
  { id: "resistance", name: "Resistance Therapy", tier: "advanced", lifeSupportCost: 10, minLevel: 11 }
];

/** Basic (C3:4952-4985) then Advanced (C3:4989-5002) Therapies, alphabetical within each tier. */
export const THERAPIES = Object.freeze(THERAPY_TABLE.map(entry => Object.freeze(entry)));

/** Therapist feature levels (C3:4925-4951). */
export const THERAPIST_FEATURES = Object.freeze({
  basicTherapy: 1,
  doctorIsIn: 4,
  earlyOnset: 7,
  advancedTherapy: 11,
  concentratedTreatment: 15
});

/** The therapy whose id matches, or `null`. Ids are case-sensitive. */
export function therapyById(id) {
  return THERAPIES.find(entry => entry.id === id) ?? null;
}

/** Therapy ids available at this Medic level (Basic from 1st, Advanced from 11th). */
export function availableTherapies(medicLevel) {
  if (typeof medicLevel !== "number" || !Number.isInteger(medicLevel) || medicLevel < 1) {
    throw new RangeError("Medic level must be an integer of at least 1.");
  }
  return THERAPIES.filter(entry => entry.minLevel <= medicLevel).map(entry => entry.id);
}

const UNKNOWN = value => value === null || value === undefined;
const eligibleResult = () => ({ eligible: true, warnings: [] });

/** Malformed-input guard (SPEC L5): numeric inputs must be finite numbers, never strings. */
function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}

/** A finite number, or `fallback` when the optional value is omitted (null/undefined). */
function finiteOrDefault(value, label, fallback) {
  if (UNKNOWN(value)) return fallback;
  assertFiniteNumber(value, label);
  return value;
}

/** A datum that may be unknown (null/undefined → null); anything supplied must be finite. */
function finiteOrUnknown(value, label) {
  return finiteOrDefault(value, label, null);
}

/**
 * Check one Therapy against the Art it would modify.
 * `eligible: null` means the Art did not supply the datum the check needs;
 * a definite failure always outranks an unknown one.
 */
export function therapyEligibility(id, art = {}) {
  if (!therapyById(id)) throw new TypeError(`Unknown Therapy: ${String(id)}.`);
  const a = art ?? {};
  switch (id) {
    case "empowering":
    case "resistance":
      return eligibleResult();
    case "energising":
    case "recuperative":
      // C3:4972, C3:4983 — "targets only one Creature".
      {
        const targetCount = finiteOrUnknown(a.targetCount, "Art target count");
        if (targetCount === null) return { eligible: null, warnings: ["unknownTargets"] };
        if (targetCount !== 1) return { eligible: false, warnings: ["notSingleTarget"] };
        return eligibleResult();
      }
    case "longDistance":
      // C3:4967 — at least 5 feet, or Touch (which becomes 30 feet).
      if (a.rangeTouch === true) return eligibleResult();
      {
        const rangeFeet = finiteOrUnknown(a.rangeFeet, "Art range");
        if (rangeFeet === null) return { eligible: null, warnings: ["unknownRange"] };
        if (!(rangeFeet >= 5)) return { eligible: false, warnings: ["rangeTooShort"] };
        return eligibleResult();
      }
    case "longTerm": {
      // C3:4974 — a duration of 1 minute (60 seconds) or longer.
      const durationSeconds = finiteOrUnknown(a.durationSeconds, "Art duration");
      if (durationSeconds === null) return { eligible: null, warnings: ["unknownDuration"] };
      if (!(durationSeconds >= 60)) return { eligible: false, warnings: ["durationTooShort"] };
      return eligibleResult();
    }
    case "psychological":
      // C3:4977 — an Art that restores Hit Points.
      if (a.restoresHP !== true) return { eligible: false, warnings: ["noHealing"] };
      return eligibleResult();
    case "cleansing":
    case "regenerative": {
      // C3:4990, C3:4995 — restores Hit Points to a single Creature.
      const warnings = [];
      let failed = false;
      let unknown = false;
      if (a.restoresHP !== true) { failed = true; warnings.push("noHealing"); }
      const targetCount = finiteOrUnknown(a.targetCount, "Art target count");
      if (targetCount === null) { unknown = true; warnings.push("unknownTargets"); }
      else if (targetCount !== 1) { failed = true; warnings.push("notSingleTarget"); }
      return { eligible: failed ? false : unknown ? null : true, warnings };
    }
    default:
      throw new TypeError(`Unknown Therapy: ${String(id)}.`);
  }
}

/**
 * Validate a cast's Therapy selection (C3:4934-4937, ruling 2026-11-01 #3).
 * The Doctor Is In free Therapy is one of the two allowed options.
 */
export function validateSelection({ selection, medicLevel, doctorIsIn } = {}) {
  if (!Array.isArray(selection)) throw new TypeError("Therapy selection must be an array.");
  assertFiniteNumber(medicLevel, "Medic level");
  const ids = selection;
  for (const id of ids) {
    if (!therapyById(id)) throw new TypeError(`Unknown Therapy: ${String(id)}.`);
  }
  const warnings = [];
  const add = code => { if (!warnings.includes(code)) warnings.push(code); };
  const allowed = doctorIsIn?.active === true ? 2 : 1;
  if (ids.length > allowed) add("tooManyTherapies");
  if (new Set(ids).size !== ids.length) add("duplicateTherapy");
  const usesAdvanced = ids.some(id => therapyById(id).tier === "advanced");
  if (usesAdvanced && !(medicLevel >= 11)) add("advancedTherapyLocked");
  return { warnings };
}

/**
 * Activate The Doctor Is In (C3:4934-4949): a Basic Therapy for one minute, plus the
 * Concentrated Treatment allowance at 15th level (replaced, never accumulated).
 */
export function activateDoctorIsIn({ chosenId, worldTime, medicLevel, state } = {}) {
  assertFiniteNumber(worldTime, "World time");
  assertFiniteNumber(medicLevel, "Medic level");
  const therapy = therapyById(chosenId);
  if (!therapy || therapy.tier !== "basic") {
    throw new TypeError(`The Doctor Is In requires a Basic Therapy, not ${String(chosenId)}.`);
  }
  const concentratedAllowance = medicLevel >= 15
    ? 3
    : finiteOrDefault(state?.concentratedAllowance, "Concentrated Treatment allowance", 0);
  return {
    doctorIsIn: { chosenId: therapy.id, expiresAt: worldTime + 60 },
    concentratedAllowance
  };
}

/** The Doctor Is In window is open strictly before its expiry instant. */
export function doctorIsInActive(state, worldTime) {
  assertFiniteNumber(worldTime, "World time");
  if (!state?.doctorIsIn) return false;
  assertFiniteNumber(state.doctorIsIn.expiresAt, "Doctor Is In expiry");
  return worldTime < state.doctorIsIn.expiresAt;
}

/**
 * Quote a selection: which activations are free and what Life Support they cost.
 * Allowances persist after the minute ends (ruling 2026-10-28) and the chosen
 * Therapy never consumes one.
 */
export function quoteTherapies({ selection, art = {}, state = null, worldTime = 0, lifeSupport = 0 } = {}) {
  if (!Array.isArray(selection)) throw new TypeError("Therapy selection must be an array.");
  const ids = selection;
  for (const id of ids) {
    if (!therapyById(id)) throw new TypeError(`Unknown Therapy: ${String(id)}.`);
  }
  const chosenId = state?.doctorIsIn?.chosenId ?? null;
  const active = doctorIsInActive(state, worldTime);
  let allowance = finiteOrDefault(state?.concentratedAllowance, "Concentrated Treatment allowance", 0);
  let allowanceUsed = 0;
  const items = [];
  const healingPackages = [];
  const restoresHP = art?.restoresHP === true;
  const apSpent = finiteOrDefault(art?.apSpent, "Art AP spent", 0);

  for (const id of ids) {
    const therapy = therapyById(id);
    if (active && id === chosenId) {
      items.push({ id, cost: 0, free: "doctorIsIn" });
      continue;
    }
    if (id !== chosenId && allowance > 0) {
      allowance -= 1;
      allowanceUsed += 1;
      items.push({ id, cost: 0, free: "concentrated" });
      // C3:4949 — each free Therapy on a healing Art adds its own package.
      if (restoresHP && apSpent > 0) healingPackages.push({ therapyId: id, formula: `${apSpent}d6` });
      continue;
    }
    items.push({ id, cost: therapy.lifeSupportCost, free: null });
  }

  const lifeSupportCost = items.reduce((sum, item) => sum + item.cost, 0);
  const budget = finiteOrDefault(lifeSupport, "Life Support", 0);
  return {
    items,
    lifeSupportCost,
    lifeSupportAfter: Math.max(0, budget - lifeSupportCost),
    shortfall: Math.max(0, lifeSupportCost - budget),
    allowanceUsed,
    allowanceAfter: allowance,
    healingPackages
  };
}

/** Describe the rider a Therapy attaches to the Art's target (durations in seconds). */
export function riderFor(id, ctx = {}) {
  if (!therapyById(id)) throw new TypeError(`Unknown Therapy: ${String(id)}.`);
  const { spellMod = 0, art = {}, castId = null, casterUuid = null, targetUuids = [], worldTime = 0 } = ctx ?? {};
  assertFiniteNumber(worldTime, "World time");
  const a = art ?? {};
  const base = {
    therapyId: id,
    castId,
    casterUuid,
    targetUuids: Array.isArray(targetUuids) ? [...targetUuids] : []
  };
  const inAMinute = { worldTime: worldTime + 60 };
  switch (id) {
    case "empowering":
      // C3:4955 — bonus damage on the next successful Attack within 1 minute.
      assertFiniteNumber(spellMod, "Spell modifier");
      return { ...base, kind: "damageBonus", amount: spellMod, consume: "nextSuccessfulAttack", expires: inAMinute };
    case "energising":
      // C3:4962 — an immediate half-Speed move, no lasting effect.
      return { ...base, kind: "moveHalfSpeed", expires: null };
    case "longDistance": {
      // C3:4967 — Touch becomes 30 feet; otherwise the range doubles.
      const usedRange = a.rangeTouch === true ? null : finiteOrUnknown(a.rangeFeet, "Art range");
      const rangeFeet = a.rangeTouch === true ? 30 : usedRange === null ? null : usedRange * 2;
      return { ...base, kind: "range", rangeFeet, expires: null };
    }
    case "longTerm": {
      // C3:4974-4976 — duration doubles, capped at 24 hours; Concentration advantage.
      const duration = finiteOrUnknown(a.durationSeconds, "Art duration");
      return {
        ...base,
        kind: "duration",
        durationSeconds: duration === null ? null : Math.min(duration * 2, 86400),
        concentrationAdvantage: a.concentration === true,
        expires: null
      };
    }
    case "psychological":
      // C3:4977 — the next Int/Wis/Cha save before the caster's next turn.
      return { ...base, kind: "autoPassSave", abilities: ["int", "wis", "cha"], uses: 1, expires: { casterNextTurnStart: true } };
    case "recuperative":
      // C3:4983 — heal after hostile damage for the next minute.
      assertFiniteNumber(spellMod, "Spell modifier");
      return { ...base, kind: "healOnHostileDamage", amount: spellMod, expires: inAMinute };
    case "cleansing":
      // C3:4990 — end one Status Condition immediately.
      return { ...base, kind: "endCondition", count: 1, expires: null };
    case "regenerative":
      // C3:4995 — 1d6 at the start of each of the target's turns for 1 minute.
      return { ...base, kind: "turnStartHeal", formula: "1d6", expires: inAMinute };
    case "resistance":
      // C3:4998 — unlimited auto-passes against Arts until the caster's next turn.
      return { ...base, kind: "autoPassSave", against: "arts", uses: null, expires: { casterNextTurnStart: true } };
    default:
      throw new TypeError(`Unknown Therapy: ${String(id)}.`);
  }
}

/** True once a rider's world-time or caster-turn window has passed; immediate riders count as spent. */
export function riderExpired(rider, { worldTime = 0, casterTurnStarted = false } = {}) {
  const expires = rider?.expires;
  if (expires === null || expires === undefined) return true;
  if (expires.casterNextTurnStart === true) return casterTurnStarted === true;
  if (expires.worldTime !== undefined) {
    assertFiniteNumber(expires.worldTime, "Rider expiry");
    assertFiniteNumber(worldTime, "World time");
    return worldTime >= expires.worldTime;
  }
  return true;
}

/**
 * Recuperative Therapy (C3:4983, ruling 2026-10-28): heal once per committed hostile
 * damage application that actually damages the rider's target.
 */
export function recuperativeHeal(rider, application = {}, seen = []) {
  const handled = Array.isArray(seen) ? [...seen] : [];
  const targets = Array.isArray(rider?.targetUuids) ? rider.targetUuids : [];
  const id = application?.id;
  const amount = finiteOrDefault(application?.amount, "Damage amount", 0);
  if (application?.hostile !== true) return { heal: 0, seen: handled };
  const applies = amount > 0
    && targets.includes(application.targetUuid)
    && !handled.includes(id);
  if (!applies) return { heal: 0, seen: handled };
  assertFiniteNumber(rider?.amount, "Rider amount");
  handled.push(id);
  return { heal: rider.amount, seen: handled };
}

const ACTION_CASTING_TIMES = Object.freeze(["action", "bonus"]);

/** Early Onset Treatment (C3:4938-4941): every broken condition is reported at once. */
export function earlyOnsetCheck({ castingTime, targetUuids, damagedUuid, damagedIsAlly, canSee, usesRemaining } = {}) {
  assertFiniteNumber(usesRemaining, "Uses remaining");
  const warnings = [];
  if (!ACTION_CASTING_TIMES.includes(castingTime)) warnings.push("castingTimeNotActionOrBonus");
  if (!(Array.isArray(targetUuids) ? targetUuids : []).includes(damagedUuid)) warnings.push("mustTargetDamaged");
  if (damagedIsAlly !== true) warnings.push("notAlly");
  if (canSee !== true) warnings.push("notVisible");
  if (!(Number(usesRemaining) > 0)) warnings.push("noUsesLeft");
  return { warnings };
}

/** Early Onset Treatment has a number of uses equal to Proficiency Bonus (C3:4941). */
export function earlyOnsetUses(proficiencyBonus) {
  if (typeof proficiencyBonus !== "number" || !Number.isFinite(proficiencyBonus)) {
    throw new TypeError("Proficiency Bonus must be a finite number.");
  }
  return proficiencyBonus;
}
