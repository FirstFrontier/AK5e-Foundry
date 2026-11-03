/**
 * Therapist Branch runtime (AK5e v1.3.1 Ch. 3 C3:4923-5004).
 *
 * Nine Therapies modify a native Art cast through the shared Arts cast-option contract
 * (`registerArtCastOptions`). All rules maths lives in the pure `therapist-rules.mjs` catalog;
 * this module only reads the Actor/Item, quotes the pending native cast, joins the cast's own
 * Actor update, and records durable riders.
 *
 * Table-play policy (WORKFLOW §3.2): every use is confirmed once, warnings never block, no
 * module-started dice, every change has an undo path (the cast receipt or a play-use receipt),
 * and changes to Creatures the user cannot write go through the Medic play-use GM relay.
 * Measurements are warnings only; only malformed input (an unknown Therapy id) throws.
 */
import {
  medicEnabled,
  medicLevel,
  medicBranch,
  pbForLevel,
  medicSpellcastingAbility,
  flag
} from "./medic-rules.mjs";
import { medicUses } from "./medic-uses.mjs";
import { need, opaqueKey, gmActive } from "./operation-kernel.mjs";
import { warn } from "./play-uses.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { registerArtCastOptions, artCastTargetUuids } from "./arts-casting.mjs";
import {
  getReactions,
  consumeRider,
  removeRider,
  onAk5eEvent,
  riderRecords
} from "./trigger-events.mjs";
import { appendLinkedReceipt, registerRelayOperation } from "./arts-ledger.mjs";
import {
  THERAPIES,
  therapyById,
  therapyEligibility,
  validateSelection,
  activateDoctorIsIn,
  doctorIsInActive,
  quoteTherapies,
  riderFor,
  riderExpired,
  recuperativeHeal,
  earlyOnsetCheck,
  earlyOnsetUses
} from "./therapist-rules.mjs";

/** Cast-option id stored on the native cast receipt as `receipt.options[THERAPIST_OPTION_ID]`. */
export const THERAPIST_OPTION_ID = "therapist-therapy";
/** Durable Therapist state lives beside the other Medic flags. */
export const THERAPIST_FLAG_PATH = "flags.ak5e.medic.therapist";
export const THERAPIST_CARD_FLAG = "therapistCard";
const RIDER_PREFIX = "therapist";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const worldTime = () => {
  const value = Number(globalThis.game?.time?.worldTime ?? 0);
  return Number.isFinite(value) ? value : 0;
};
const documentFor = uuid => {
  if (!uuid || typeof uuid !== "string") return null;
  const direct = globalThis.fromUuidSync?.(uuid);
  if (direct) return direct;
  return null;
};
/** Actor for an Actor uuid, a Token uuid or a D&D5e `token.Actor` composite target uuid. */
const actorFor = uuid => {
  if (!uuid || typeof uuid !== "string") return null;
  const parts = uuid.split(".");
  const index = parts.lastIndexOf("Actor");
  // A composite `Token.Actor` uuid resolves through the World Actor collection, which is the
  // document a rider write needs.
  if (index >= 0 && parts[index + 1]) {
    const actor = globalThis.game?.actors?.get?.(parts[index + 1]);
    if (actor?.documentName === "Actor") return actor;
  }
  const doc = documentFor(uuid);
  if (doc?.documentName === "Actor") return doc;
  if (doc?.actor?.documentName === "Actor") return doc.actor;
  return globalThis.game?.actors?.get?.(parts.at(-1)) ?? null;
};
const isConstruct = actor => String(actor?.system?.details?.type?.value ?? "").toLowerCase() === "construct";
const spellMod = actor => Number(actor?.system?.abilities?.[medicSpellcastingAbility(actor)]?.mod ?? 0) || 0;

/* ---------------------------------------------------------------- State */

export const isTherapist = actor => Boolean(medicEnabled(actor) && medicBranch(actor) === "therapist");

/** Durable Therapist state: the Doctor Is In window, the concentrated allowance and Early Onset uses. */
export function therapistState(actor) {
  const stored = flag(actor, "medic")?.therapist ?? {};
  const doctor = stored.doctorIsIn && typeof stored.doctorIsIn === "object" ? stored.doctorIsIn : null;
  const early = stored.earlyOnset && typeof stored.earlyOnset === "object" ? stored.earlyOnset : {};
  return {
    level: medicLevel(actor) ?? 0,
    doctorIsIn: doctor ? { chosenId: doctor.chosenId ?? null, expiresAt: Number(doctor.expiresAt ?? 0) } : null,
    concentratedAllowance: Math.max(0, Math.trunc(Number(stored.concentratedAllowance) || 0)),
    usedSinceLongRest: stored.usedSinceLongRest === true,
    earlyOnsetUsed: Math.max(0, Math.trunc(Number(early.used) || 0)),
    earlyOnsetPending: early.pending && typeof early.pending === "object" ? early.pending : null
  };
}

/** Doctor Is In is active strictly before its 60-second expiry. */
export const doctorActive = (state, now = worldTime()) => Boolean(state?.doctorIsIn) && doctorIsInActive({ doctorIsIn: state.doctorIsIn }, now);

/** The stored flag object, merged with an update; never mutates the Actor. */
const mergeTherapistState = (actor, update = {}) => {
  const stored = flag(actor, "medic")?.therapist ?? {};
  const next = { ...stored, ...update };
  if (update.earlyOnset) next.earlyOnset = { ...(stored.earlyOnset ?? {}), ...update.earlyOnset };
  return next;
};

/** Life Support from the pending cast update when one exists, otherwise the Actor's current pool. */
function lifeSupportBudget(actor, updates) {
  const path = "flags.ak5e.resourcePools.lifeSupport.value";
  const pending = Number(updates?.actor?.[path]);
  if (Number.isFinite(pending)) return pending;
  return Number(actor?.flags?.ak5e?.resourcePools?.lifeSupport?.value ?? 0) || 0;
}

/* ---------------------------------------------------------------- Art facts */

const DESCRIPTION_LIMIT = 4000;

/** The Art description text without markup, used only for advisory "restores Hit Points" guidance. */
function plainDescription(item) {
  const raw = item?.system?.description?.value ?? item?.system?.description ?? "";
  return String(raw).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").slice(0, DESCRIPTION_LIMIT);
}

/**
 * Advisory "this Art restores Hit Points" reading. An explicitly negated clause ("does not
 * restore Hit Points") never counts; an unknown description stays false so the Therapy shows a
 * visible prerequisite warning instead of inventing an effect.
 */
export function descriptionRestoresHP(item) {
  const text = plainDescription(item);
  if (!text.trim()) return false;
  const pattern = /(restor\w*|regain\w*|heal\w*)\b[^.;]{0,60}?hit points/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 24), match.index).toLowerCase();
    if (/\b(not|never|no|cannot|can't|without)\b[^.;]{0,12}$/.test(before)) continue;
    return true;
  }
  return false;
}

const DURATION_SECONDS = { second: 1, round: 6, turn: 6, minute: 60, hour: 3600, day: 86400, month: 2592000, year: 31536000 };
const AREA_TARGETS = new Set(["sphere", "cone", "cube", "cylinder", "line", "radius", "square", "circle", "wall"]);

/** D&D5e 5.x spells carry the target as `system.target.affects`; older data used `{ type, value }`. */
function targetAffects(target = {}) {
  const affects = target.affects ?? target;
  const type = String(affects.type ?? "").toLowerCase();
  const count = Number(affects.count ?? affects.value);
  return { type, count: Number.isFinite(count) && count > 0 ? count : null, area: AREA_TARGETS.has(type) || Boolean(target.template?.size) };
}
const firstActivityOf = item => Array.from(item?.system?.activities ?? [])[0] ?? null;
const propertiesHas = properties => {
  if (!properties) return false;
  if (typeof properties.has === "function") return properties.has("concentration");
  if (Array.isArray(properties)) return properties.includes("concentration");
  return properties.concentration === true;
};

/** The Art measurements the Therapy eligibility checks consume (unknown values stay null). */
export function artFacts(item) {
  const system = item?.system ?? {};
  const activity = firstActivityOf(item);
  const target = system.target?.affects ? system.target : (activity?.target ?? system.target ?? {});
  const range = system.range?.units || system.range?.value !== undefined ? system.range ?? {} : (activity?.range ?? system.range ?? {});
  const duration = system.duration?.units || system.duration?.value !== undefined ? system.duration ?? {} : (activity?.duration ?? system.duration ?? {});
  const affects = targetAffects(target);
  const units = String(range.units ?? "").toLowerCase();
  const rangeTouch = units === "touch" || affects.type === "touch";
  const rangeValue = Number(range.value);
  const rangeFeet = rangeTouch ? 0
    : units === "self" || units === "spec" || units === "any" ? null
      : Number.isFinite(rangeValue) && rangeValue > 0
        ? (units === "mi" ? rangeValue * 5280 : units === "km" ? rangeValue * 3280.84 : rangeValue)
        : null;
  const targetCount = affects.count !== null ? affects.count
    : affects.area ? null
      : ["self", "creature", "ally", "enemy", "object"].includes(affects.type) ? 1 : null;
  const durationUnits = String(duration.units ?? "").toLowerCase();
  const durationValue = Number(duration.value);
  const durationSeconds = durationUnits === "inst" || durationUnits === "instantaneous" ? 0
    : Number.isFinite(durationValue) && DURATION_SECONDS[durationUnits] !== undefined ? durationValue * DURATION_SECONDS[durationUnits]
      : null;
  return {
    levelled: Number(system.level ?? 0) > 0,
    level: Number(system.level ?? 0) || 0,
    targetCount,
    rangeFeet,
    rangeTouch,
    durationSeconds,
    concentration: propertiesHas(system.properties) || propertiesHas(activity?.properties),
    restoresHP: descriptionRestoresHP(item)
  };
}

/* ---------------------------------------------------------------- Selection and warnings */

const THERAPY_TEXT = {
  tooManyTherapies: "Only one Therapy option can be used on an Art unless The Doctor Is In is active; it allows a second, different Therapy.",
  duplicateTherapy: "The same Therapy option cannot be used twice on one Art, even with The Doctor Is In.",
  advancedTherapyLocked: "Advanced Therapies (Cleansing, Regenerative, Resistance) are a Therapist level 11 feature.",
  notSingleTarget: "this Therapy requires an Art that targets only one Creature.",
  noHealing: "this Therapy requires an Art that restores Hit Points.",
  rangeTooShort: "this Therapy requires an Art with a range of at least 5 feet (or Touch).",
  durationTooShort: "this Therapy requires an Art with a duration of 1 minute or longer.",
  unknownTargets: "the Art's target count is unclear; check the Therapy's target prerequisite at the table.",
  unknownRange: "the Art's range is unclear; check the Therapy's range prerequisite at the table.",
  unknownDuration: "the Art's duration is unclear; check the Therapy's duration prerequisite at the table."
};

const EARLY_ONSET_TEXT = {
  castingTimeNotActionOrBonus: "Early Onset Treatment casts an Art whose Casting Time is an Action or a Bonus Action as a Reaction; this Art's Casting Time is neither.",
  mustTargetDamaged: "The Art must target the Creature that took the Damage.",
  notAlly: "Early Onset Treatment responds to an allied Creature taking Damage.",
  notVisible: "The damaged allied Creature must be one you can see.",
  noUsesLeft: "No Early Onset Treatment uses remain until the next Long Rest."
};

/** Accepted selection shapes: `{ therapy, secondaryTherapy }` from the native dialog, or a list. */
export function therapySelectionIds(selection) {
  if (Array.isArray(selection)) return selection.map(value => String(value ?? "").trim()).filter(value => value && value !== "none");
  if (!selection || typeof selection !== "object") return [];
  const out = [];
  for (const key of ["therapy", "secondaryTherapy"]) {
    const value = selection[key];
    if (Array.isArray(value)) out.push(...value.map(entry => String(entry ?? "").trim()));
    else if (typeof value === "string") out.push(value.trim());
    else if (value === true && therapyById(key)) out.push(key);
  }
  return out.filter(value => value && value !== "none");
}

/** Malformed input (an unknown Therapy id) throws; every rule prerequisite is an advisory warning. */
function assertKnownTherapies(ids) {
  for (const id of ids) if (!therapyById(id)) throw new TypeError(`Unknown Therapy: ${String(id)}.`);
}

function therapyOptionFields() {
  // The shared dialog field model drops empty option values, so the "no Therapy" choice uses an
  // explicit sentinel; the default must never select a Therapy the player did not choose.
  const options = [{ value: "none", label: "No Therapy" }, ...THERAPIES.map(therapy => ({
    value: therapy.id,
    label: `${therapy.name} — ${therapy.lifeSupportCost} Life Support${therapy.minLevel > 1 ? ` (level ${therapy.minLevel})` : ""}`
  }))];
  return [
    { name: "therapy", label: "Therapy", type: "select", options },
    { name: "secondaryTherapy", label: "Second Therapy (The Doctor Is In only; cannot repeat)", type: "select", options }
  ];
}

function doctorSelectionState(state, now) {
  return doctorActive(state, now) ? { active: true, chosenId: state.doctorIsIn?.chosenId ?? null } : { active: false };
}

/** Advisory warnings for one Therapy selection (never blocks, never writes). */
export function therapistSelectionWarnings(actor, item, ids) {
  const facts = artFacts(item);
  const level = medicLevel(actor) ?? 1;
  const state = therapistState(actor);
  const now = worldTime();
  const warnings = [];
  const add = (id, text) => { if (!warnings.some(entry => entry.id === id)) warnings.push({ id, text }); };
  for (const code of validateSelection({ selection: ids, medicLevel: level, doctorIsIn: doctorSelectionState(state, now) }).warnings) {
    add(code, THERAPY_TEXT[code] ?? code);
  }
  for (const id of ids) {
    const therapy = therapyById(id);
    if (level < therapy.minLevel) add(`level:${id}`, `${therapy.name} is a Therapist level ${therapy.minLevel} option; this character is level ${level}.`);
    const check = therapyEligibility(id, facts);
    for (const code of check.warnings) add(`${id}:${code}`, `${therapy.name}: ${THERAPY_TEXT[code] ?? code}`);
  }
  const quote = quoteTherapies({ selection: ids, art: facts, state, worldTime: now, lifeSupport: lifeSupportBudget(actor, null) });
  if (quote.shortfall > 0) add("lifeSupport", `This selection needs ${quote.lifeSupportCost} Life Support and ${lifeSupportBudget(actor, null)} remain; the rest is not charged (Life Support clamps at 0).`);
  return warnings;
}

/* ---------------------------------------------------------------- Native cast option */

function therapistQuote(actor, item, selection) {
  const ids = therapySelectionIds(selection);
  const facts = artFacts(item);
  const state = therapistState(actor);
  const quote = quoteTherapies({ selection: ids, art: { ...facts, apSpent: 0 }, state, worldTime: worldTime(), lifeSupport: lifeSupportBudget(actor, null) });
  return { ...quote, therapies: ids };
}

/**
 * Join the native cast's own Actor update: every pending change is composed from the pending
 * value, never overwritten from an older Actor snapshot, and the final actual AP is the cost the
 * cast receipt already carries after every discount.
 */
function therapistConsume(actor, item, selection, updates, receipt) {
  const ids = therapySelectionIds(selection);
  if (!ids.length) return;
  assertKnownTherapies(ids);
  const facts = artFacts(item);
  const state = therapistState(actor);
  const apSpent = Math.max(0, Math.trunc(Number(receipt?.cost ?? 0) || 0));
  const budget = lifeSupportBudget(actor, updates);
  const quote = quoteTherapies({ selection: ids, art: { ...facts, apSpent }, state, worldTime: worldTime(), lifeSupport: budget });
  updates.actor ??= {};
  if (quote.lifeSupportCost > 0) {
    updates.actor["flags.ak5e.resourcePools.lifeSupport.value"] = Math.max(0, budget - quote.lifeSupportCost);
  }
  updates.actor[THERAPIST_FLAG_PATH] = mergeTherapistState(actor, {
    concentratedAllowance: quote.allowanceAfter,
    ...(state.earlyOnsetPending ? { earlyOnset: { pending: null } } : {})
  });
  if (!receipt) return;
  receipt.therapist = {
    selection: ids,
    apSpent,
    lifeSupportCost: quote.lifeSupportCost,
    lifeSupportShortfall: quote.shortfall,
    allowanceUsed: quote.allowanceUsed,
    allowanceAfter: quote.allowanceAfter,
    healingPackages: quote.healingPackages,
    // Immediate E6 outcomes are part of the committed cast: compute them here, beside the
    // quote, so they land on the ledger receipt. syncCastRiders only posts their cards.
    instant: instantTherapyEffects(actor, { id: receipt.id, cost: apSpent, itemId: item?.id },
      ids.filter(id => INSTANT_THERAPIES.has(id)), artCastTargetUuids())
  };
  if (quote.shortfall > 0) {
    receipt.warnings = [...(receipt.warnings ?? []), `Life Support short by ${quote.shortfall}; the Therapy cost clamps at 0.`];
  }
}

/** One native cast-option provider for the Therapist branch (registered once). */
export function therapistCastOptions(actor, item) {
  if (!isTherapist(actor)) return null;
  return {
    id: THERAPIST_OPTION_ID,
    label: "Therapist Therapy",
    fields: therapyOptionFields(),
    validate(selection) {
      const ids = therapySelectionIds(selection);
      assertKnownTherapies(ids);
      return { warnings: therapistSelectionWarnings(actor, item, ids), errors: [] };
    },
    quote(selection) {
      return therapistQuote(actor, item, selection);
    },
    consume(selection, updates, receipt) {
      therapistConsume(actor, item, selection, updates, receipt);
    }
  };
}

/* ---------------------------------------------------------------- Shared helpers */

function branchWarning(warnings, actor) {
  if (medicBranch(actor) !== "therapist") {
    warn(warnings, "branch", `This feature belongs to the Therapist branch; this character has ${medicBranch(actor) ?? "no branch"}.`);
  }
}
function levelWarning(warnings, actor, required, name) {
  const level = medicLevel(actor) ?? 1;
  if (level < required) warn(warnings, "level", `${name} is a Therapist level ${required} feature; this character is level ${level}.`);
}
const targetList = data => {
  if (Array.isArray(data?.targetUuids)) return data.targetUuids.filter(Boolean);
  if (typeof data?.targetUuid === "string" && data.targetUuid) return [data.targetUuid];
  if (typeof data?.requiredTargetUuid === "string" && data.requiredTargetUuid) return [data.requiredTargetUuid];
  return artCastTargetUuids();
};

/* ---------------------------------------------------------------- Play-use plans */

/* Relay validators live here as named functions: the play-use engine reads
 * `validateTarget`/`validateRevert` as static properties of the plan factory
 * (`PLANS[name].validateTarget`), never from the object the factory returns.
 * A validator defined only on the returned object is unreachable, so the GM
 * relay rejects every apply with "not one this use can make". Both spellings
 * below reference the same function so the two can never drift apart.
 *
 * Every validator pins the relayed target to the recorded Creature: the engine
 * matches the entry by the uuid in the request, so a tampered entry uuid would
 * otherwise redirect the write onto an unrecorded Creature. Healing and
 * condition entries pin against the receipt's recorded target; rider entries pin
 * against the per-rider target list captured at record time. */
const therapistRiderTargets = entry =>
  (entry.riders ?? []).map(rider => rider?.effectRef?.rider?.targetUuids ?? []).flat();
const validateTherapistHealTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "therapistHeal" && entry.uuid === receipt.result?.targetUuid
    && Number(entry.amount) === Number(receipt.result?.amount));
const validateTherapistConditionTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry.kind === "therapistCondition" && entry.uuid === receipt.result?.targetUuid
    && entry.effectId === receipt.result?.conditionId);
// Revert validators: the engine re-checks relayed reverts only when the plan supplies
// `validateRevert`. Without one, a tampered entry uuid would redirect an undo onto an
// unrecorded Creature. The same pins as the apply side, compared against the recorded receipt.
const validateTherapistRiderTarget = (source, receipt, entry, targetDoc) => {
  if (!targetDoc || entry.kind !== "therapistRider" || entry.castId !== receipt.result?.castId) return false;
  if (!Array.isArray(entry.riders) || !entry.riders.length) return false;
  if (!entry.riders.every(rider => typeof rider?.id === "string" && rider.id)) return false;
  // The relayed target must be one of the Creatures recorded at record time: the tampered
  // entry uuid in the request is otherwise the only identity the engine checks.
  const recorded = therapistRiderTargets(entry);
  if (!recorded.includes(entry.uuid)) return false;
  return true;
};

export const THERAPIST_PLANS = {
  /** The Doctor Is In (C3:4934-4949): Bonus Action, one Basic Therapy free for a minute, once per Long Rest. */
  doctorIsIn(actor, _state, data = {}) {
    need(medicEnabled(actor), "The Doctor Is In is a Medic feature.");
    const chosenId = data.chosenId ?? null;
    const chosen = therapyById(chosenId);
    need(Boolean(chosen) && chosen.tier === "basic", "Choose one of the Therapist's Basic Therapies for The Doctor Is In.");
    const warnings = [];
    branchWarning(warnings, actor);
    levelWarning(warnings, actor, 4, "The Doctor Is In");
    const current = therapistState(actor);
    if (current.usedSinceLongRest) {
      warn(warnings, "oncePerLongRest", "The Doctor Is In is a Bonus Action usable once per Long Rest, and it has already been used since the last Long Rest. Use anyway only if the table allows another activation.");
    }
    if (doctorActive(current)) {
      warn(warnings, "alreadyActive", `The Doctor Is In is already active until ${Math.max(0, Math.round(current.doctorIsIn.expiresAt - worldTime()))} more seconds of world time; this activation replaces that window.`);
    }
    return {
      warnings,
      title: "The Doctor Is In",
      costs: [{ label: "Bonus Action", amount: 1 }],
      async apply(_next, receipt) {
        const activated = activateDoctorIsIn({ chosenId, worldTime: worldTime(), medicLevel: medicLevel(actor) ?? 1, state: current });
        receipt.summary = `${actor.name} uses The Doctor Is In (Bonus Action): ${chosen.name} costs no Life Support for 1 minute, and one additional different Therapy may join it on each Art.${activated.concentratedAllowance ? ` Concentrated Treatment: ${activated.concentratedAllowance} free Therapies.` : ""}`;
        receipt.result = { chosenId, expiresAt: activated.doctorIsIn.expiresAt, concentratedAllowance: activated.concentratedAllowance };
        return {
          [THERAPIST_FLAG_PATH]: mergeTherapistState(actor, {
            doctorIsIn: activated.doctorIsIn,
            concentratedAllowance: activated.concentratedAllowance,
            usedSinceLongRest: true
          })
        };
      }
    };
  },

  /** Early Onset Treatment (C3:4938-4941): cast an Action/Bonus Action Art as a Reaction at the damaged ally.
   * The confirmed use records the Reaction intent, the use count, and the chosen Art — it never
   * spends the Reaction itself. The Reaction is spent by the native Art cast that follows
   * (post-commit, with recovery), opened via openEarlyOnsetCast; confirming without casting spends
   * nothing but the use count. */
  earlyOnset(actor, _state, data = {}) {
    need(medicEnabled(actor), "Early Onset Treatment is a Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor);
    levelWarning(warnings, actor, 7, "Early Onset Treatment");
    const level = medicLevel(actor) ?? 1;
    const usesTotal = earlyOnsetUses(pbForLevel(level));
    const state = therapistState(actor);
    const usesRemaining = Math.max(0, usesTotal - state.earlyOnsetUsed);
    const artItemId = typeof data.artItemId === "string" && data.artItemId ? data.artItemId : null;
    const artItem = artItemId ? actor.items?.get?.(artItemId) ?? null : null;
    if (artItemId && !artItem) {
      warn(warnings, "artUnknown", "The chosen Art is no longer on this character; pick one when casting, or cast manually.");
    }
    const activity = artItem ? (Array.from(artItem.system?.activities ?? [])[0] ?? null) : null;
    if (artItem && !activity) {
      warn(warnings, "artNotCastable", `${artItem.name ?? "The chosen Art"} has no native cast activity; cast it manually as a Reaction.`);
    }
    // The Art's own Casting Time governs; the label is only a fallback when no Art is chosen.
    const castingTime = String(activity?.activation?.type ?? data.castingTime ?? "");
    const damagedUuid = data.damagedUuid ?? data.requiredTargetUuid ?? null;
    const targets = targetList(data);
    if (!castingTime) warn(warnings, "castingTimeUnknown", "Choose the Art to react with (its Casting Time must be an Action or a Bonus Action).");
    if (!damagedUuid) warn(warnings, "damagedUnknown", "Choose the allied Creature that just took Damage.");
    for (const code of earlyOnsetCheck({ castingTime, targetUuids: targets, damagedUuid, damagedIsAlly: data.damagedIsAlly,
      canSee: data.canSee, usesRemaining }).warnings) {
      warn(warnings, code, EARLY_ONSET_TEXT[code] ?? code);
    }
    if (getReactions(actor).available < 1) warn(warnings, "reaction", "No Reaction is available; the native reaction cast will warn again and the use still records.");
    const target = actorFor(damagedUuid);
    return {
      warnings,
      title: "Early Onset Treatment",
      costs: [{ label: "Reaction", amount: 1 }, { label: "Early Onset use", amount: 1 }],
      targets: target ? [{ uuid: target.uuid, name: target.name }] : damagedUuid ? [{ uuid: damagedUuid, name: damagedUuid }] : [],
      async apply(_next, receipt) {
        const triggerEventId = data.triggerEventId ?? `${receipt.id}-earlyOnset`;
        // Never derive the stored count from a clamped remainder: an overridden 6th use must store 6.
        const used = state.earlyOnsetUsed + 1;
        const artName = artItem?.name ?? null;
        receipt.summary = `${actor.name} uses Early Onset Treatment (Reaction, triggered by ${triggerEventId})${artName ? ` to cast ${artName}` : ""}, targeting ${target?.name ?? "the damaged ally"}. ${Math.max(0, usesTotal - used)} of ${usesTotal} uses remain. The Reaction itself is spent by the Art's native cast, not by this use.`;
        receipt.result = { triggerEventId, requiredTargetUuid: damagedUuid ?? null, usesRemaining: Math.max(0, usesTotal - used), usesTotal,
          artItemId, activityId: activity?.id ?? null, castingTime: castingTime || null };
        return {
          [THERAPIST_FLAG_PATH]: mergeTherapistState(actor, {
            earlyOnset: {
              used,
              pending: damagedUuid ? { triggerEventId, requiredTargetUuid: damagedUuid, expiresAt: worldTime() + 60 } : null
            }
          })
        };
      }
    };
  },

  /** Recuperative / Regenerative healing: the owner-clicked amount applied through the Medic relay.
   * A linked rider (`data.riderId`) is consumed where the write happens (the target-kind apply),
   * because the clicking client often cannot write the patient's flags. */
  therapistHeal(actor, _state, data = {}) {
    need(isTherapist(actor), "Therapist healing comes from the Therapist branch.");
    const amount = Math.trunc(Number(data.amount ?? 0));
    need(Number.isInteger(amount) && amount > 0, "Choose the Hit Points to restore.");
    const label = String(data.label ?? "Therapist Therapy");
    const riderId = typeof data.riderId === "string" && data.riderId ? data.riderId : null;
    const target = actorFor(data.targetUuid);
    const targetName = String(data.targetName ?? target?.name ?? data.targetUuid ?? "the target");
    const warnings = [];
    if (!target) warn(warnings, "target", "No creature target is recorded for this healing.");
    else if (isConstruct(target)) warn(warnings, "construct", "Constructs cannot regain Hit Points from class features or Healing Arts (Ch. 1 L138).");
    return {
      warnings,
      title: label,
      targets: data.targetUuid ? [{ uuid: data.targetUuid, name: targetName }] : [],
      validateTarget: validateTherapistHealTarget,
      async apply(_next, receipt) {
        if (target) receipt.targets = [{ kind: "therapistHeal", uuid: target.uuid, name: target.name, amount, ready: true,
          ...(riderId ? { riderId } : {}) }];
        receipt.summary = `${actor.name}: ${label} restores ${amount} Hit Points to ${targetName} (owner-clicked, applied by the table).`;
        receipt.result = { amount, targetUuid: target?.uuid ?? null, label };
        return {};
      }
    };
  },

  /** Cleansing Therapy (C3:4990): end one chosen Status Condition on the Art's target. */
  therapistCleansing(actor, _state, data = {}) {
    need(isTherapist(actor), "Cleansing Therapy is a Therapist branch feature.");
    const conditionId = typeof data.conditionId === "string" ? data.conditionId : "";
    need(Boolean(conditionId), "Choose one Status Condition to end.");
    const label = String(data.label ?? "Cleansing Therapy");
    const target = actorFor(data.targetUuid);
    const warnings = [];
    // Advanced Therapies are an 11th-level feature. The sheet hides the control below 11; a table that
    // reaches this plan anyway gets the same visible, overridable warning as the cast dialog.
    if ((medicLevel(actor) ?? 1) < 11) {
      warn(warnings, "advancedTherapyLocked", "Cleansing Therapy is an Advanced Therapy: a Therapist level 11 feature.");
    }
    if (!target) warn(warnings, "target", "No creature target is recorded for Cleansing Therapy.");
    return {
      warnings,
      title: label,
      validateTarget: validateTherapistConditionTarget,
      async apply(_next, receipt) {
        if (target) receipt.targets = [{ kind: "therapistCondition", uuid: target.uuid, name: target.name, effectId: conditionId, ready: true }];
        receipt.summary = `${actor.name}: ${label} ends one Status Condition on ${target?.name ?? "the target"}.`;
        receipt.result = { conditionId, targetUuid: target?.uuid ?? null };
        return {};
      }
    };
  },

  /**
   * Durable Therapy riders for one cast. This is a play-use so a rider on a Creature the caster
   * cannot write travels through the Medic GM relay (WORKFLOW §3.2) and undo removes exactly the
   * riders this use recorded - never a bare ownership check on the casting client.
   */
  therapistRider(actor, _state, data = {}) {
    need(isTherapist(actor), "Therapist riders come from the Therapist branch.");
    const castId = String(data.castId ?? "");
    need(Boolean(castId), "A cast receipt is required to record its Therapy riders.");
    const entries = Array.isArray(data.targets) ? data.targets.filter(entry => entry && entry.uuid && Array.isArray(entry.riders) && entry.riders.length) : [];
    need(entries.length > 0, "A Therapy rider needs at least one recorded target.");
    const riderCount = entries.reduce((total, entry) => total + entry.riders.length, 0);
    return {
      warnings: [],
      title: "Therapist Therapy riders",
      targets: entries.map(entry => ({ uuid: entry.uuid, name: entry.name ?? entry.uuid })),
      validateTarget: validateTherapistRiderTarget,
      async apply(_next, receipt) {
        receipt.targets = entries.map(entry => ({ kind: "therapistRider", uuid: entry.uuid, name: entry.name ?? entry.uuid,
          castId, riders: structuredClone(entry.riders), ready: true }));
        receipt.summary = `${actor.name}: records ${riderCount} Therapy rider${riderCount === 1 ? "" : "s"} on ${entries.length} Creature${entries.length === 1 ? "" : "s"} for cast ${castId}.`;
        receipt.result = { castId, riderCount, targetCount: entries.length };
        return {};
      }
    };
  }
};

// Static copies for the GM relay (see the note above THERAPIST_PLANS).
THERAPIST_PLANS.therapistHeal.validateTarget = validateTherapistHealTarget;
THERAPIST_PLANS.therapistCleansing.validateTarget = validateTherapistConditionTarget;
THERAPIST_PLANS.therapistRider.validateTarget = validateTherapistRiderTarget;
// Static revert validators: the engine re-checks a relayed revert only when the plan
// supplies one. Same target pins as the apply side, so a tampered entry uuid cannot
// redirect an undo onto an unrecorded Creature's documents.
THERAPIST_PLANS.therapistHeal.validateRevert = validateTherapistHealTarget;
THERAPIST_PLANS.therapistCleansing.validateRevert = validateTherapistConditionTarget;
THERAPIST_PLANS.therapistRider.validateRevert = validateTherapistRiderTarget;

/** Castable Arts for the Early Onset choice: spell Items with at least one native activity. */
export function castableTherapistArts(actor) {
  return Array.from(actor?.items ?? [])
    .filter(item => item?.type === "spell" && (item.system?.activities?.size ?? Array.from(item.system?.activities ?? []).length) > 0)
    .map(item => {
      const activity = Array.from(item.system.activities)[0] ?? null;
      return { id: item.id, name: item.name ?? item.id,
        activation: activity?.activation?.type ?? item.system?.activation?.type ?? "",
        level: Number(item.system?.level ?? 0) || 0 };
    });
}

/** Open the chosen Art's native cast dialog with Early Onset's reaction context: the cast
 * proceeds natively (confirm/cancel there) and its Reaction is spent post-commit by the Arts
 * finalizer, never by the Early Onset use. Best-effort targeting; the dialog warns when the
 * required damaged target is not targeted. Returns the native result, or null when the Art
 * cannot be opened (the use receipt stays recorded and the table casts manually). */
export async function openEarlyOnsetCast(actor, options = {}) {
  const item = actor?.items?.get?.(options.artItemId ?? "");
  const activities = item ? Array.from(item.system?.activities ?? []) : [];
  const activity = activities.find(entry => entry?.id === options.activityId) ?? activities[0] ?? null;
  if (!activity || typeof activity.use !== "function") {
    globalThis.ui?.notifications?.warn?.("Choose the Art to cast as a Reaction; it could not be opened automatically.");
    return null;
  }
  try {
    const targetUuid = options.requiredTargetUuid;
    const already = Array.from(globalThis.game?.user?.targets ?? [])
      .some(token => token.actor?.uuid === targetUuid || token.uuid === targetUuid);
    if (targetUuid && !already) {
      const doc = globalThis.fromUuidSync?.(targetUuid);
      const token = doc?.object
        ?? (globalThis.canvas?.tokens?.placeables ?? []).find(placeable => placeable.actor?.uuid === targetUuid || placeable.document?.uuid === targetUuid)?.object
        ?? null;
      token?.setTarget?.(true, { releaseOthers: true });
    }
  } catch (error) { console.warn("AK5e | Early Onset targeting", error); }
  return activity.use({ ak5eContext: { castingTime: "reaction",
    triggerEventId: options.triggerEventId ?? `earlyOnset:${foundry.utils.randomID()}`,
    requiredTargetUuid: options.requiredTargetUuid ?? null } }, { configure: true });
}

/** The Early Onset cast card: names the chosen Art/target and offers the native reaction cast
 * to this or any later client (the confirming client also opens it immediately). */
export async function postEarlyOnsetCastCard(actor, cast = {}) {
  const artName = cast.artName ?? "the chosen Art";
  const targetName = cast.targetName ?? "the damaged ally";
  const hasArt = Boolean(cast.artItemId);
  return postTherapistCard(actor, "Early Onset Treatment",
    `<p>${esc(actor.name)} confirmed Early Onset Treatment (uses recorded: ${esc(cast.usesRemaining ?? "?")} of ${esc(cast.usesTotal ?? "?")} remain). Cast <strong>${esc(artName)}</strong> as a Reaction at <strong>${esc(targetName)}</strong>; the Reaction is spent by that native cast.</p>
     ${hasArt ? `<p><button type="button" data-ak5e-therapist-early="1" data-actor="${esc(actor.uuid)}" data-art-item="${esc(cast.artItemId)}" data-activity="${esc(cast.activityId ?? "")}" data-trigger="${esc(cast.triggerEventId ?? "")}" data-target="${esc(cast.requiredTargetUuid ?? "")}">Cast ${esc(artName)} as a Reaction now</button></p>` : `<p>No Art was chosen: open the Art's sheet and cast it as a Reaction manually.</p>`}`,
    { casterUuid: actor.uuid, eventId: `earlyOnset:${cast.triggerEventId ?? "manual"}` });
}


/* ---------------------------------------------------------------- Target kinds */

const APPLIED_KEY = "therapistApplied";
const targetKey = (source, useId) => opaqueKey(`${useId}:${source.uuid}`);

const THERAPIST_TARGET_KINDS = {
  therapistHeal: {
    async apply(source, useId, entry, target) {
      const hp = target.system?.attributes?.hp ?? {};
      const before = Number(hp.value) || 0;
      const max = Number(hp.max) || before;
      const amount = Math.max(0, Number(entry.amount) || 0);
      const after = Math.min(max, before + amount);
      // Snapshot a linked rider BEFORE consuming it so undo can restore the exact record.
      const riderId = typeof entry.riderId === "string" && entry.riderId ? entry.riderId : null;
      const snapshot = riderId
        ? structuredClone(riderRecords(target).find(record => record.id === riderId) ?? null)
        : null;
      const applied = { before, after, healed: after - before, rider: snapshot, riderId, consumeReceipt: riderId ? String(useId) : null };
      await target.update({ "system.attributes.hp.value": after, [`flags.ak5e.${APPLIED_KEY}.${targetKey(source, useId)}`]: applied });
      // Consume the linked rider where the write happens: this client just proved it can
      // write the patient (directly or through the GM relay). Best effort only; expiry
      // still bounds every rider, and a missed consume never invents healing.
      if (riderId) {
        try { await consumeRider(riderId, { actor: target, receipt: String(useId) }); }
        catch (error) { console.error("AK5e | Therapist linked rider", error); }
      }
      return applied;
    },
    async revert(source, useId, entry, target) {
      const key = targetKey(source, useId);
      const applied = target.flags?.ak5e?.[APPLIED_KEY]?.[key];
      const current = Number(target.system?.attributes?.hp?.value) || 0;
      const restored = applied ? applied.before : Math.max(0, current - (Number(entry.amount) || 0));
      const update = { "system.attributes.hp.value": restored, [`flags.ak5e.${APPLIED_KEY}.-=${key}`]: null };
      // Restore a rider this use consumed, but only when nothing else has touched it since:
      // missing entirely, or consumed with no receipts beyond the snapshot and this undo's own.
      // Anything else changed means another use owns that record now; leave it and log.
      const riderId = applied?.riderId ?? null;
      if (riderId && applied && "rider" in applied) {
        const path = `flags.ak5e.triggerRiders.${riderId}`;
        const snapshot = applied.rider ?? null;
        const currentRecord = target.getFlag?.("ak5e", "triggerRiders")?.[riderId]
          ?? target.flags?.ak5e?.triggerRiders?.[riderId] ?? null;
        const snapshotKeys = Object.keys(snapshot?.receipts ?? {});
        const currentKeys = Object.keys(currentRecord?.receipts ?? {});
        const ours = applied.consumeReceipt;
        const untouched = currentRecord == null
          || (currentRecord.status !== "active"
            && currentKeys.every(receipt => snapshotKeys.includes(receipt) || (ours != null && receipt === ours)));
        if (untouched && snapshot) {
          update[path] = structuredClone(snapshot);
        } else if (untouched) {
          const parts = path.split("."), last = parts.pop();
          update[`${parts.join(".")}.-=${last}`] = null;
        } else {
          console.error("AK5e | Therapist linked rider", `rider ${riderId} changed since this use; leaving it in place`);
        }
      }
      await target.update(update);
      return { removed: true };
    },
    preview(_source, _receipt, entry, target) {
      return `${target?.name ?? "Target"}: reverts ${entry.amount ?? 0} Hit Points restored by this Therapy.`;
    }
  },
  therapistCondition: {
    async apply(source, useId, entry, target) {
      const effect = target.effects?.get?.(entry.effectId) ?? Array.from(target.effects ?? []).find(value => value.id === entry.effectId);
      if (!effect) return { missing: true };
      const snapshot = typeof effect.toObject === "function" ? effect.toObject() : structuredClone(effect);
      await target.deleteEmbeddedDocuments("ActiveEffect", [entry.effectId]);
      await target.update({ [`flags.ak5e.${APPLIED_KEY}.${targetKey(source, useId)}`]: { effect: snapshot } });
      return { removed: true, name: snapshot.name ?? entry.effectId };
    },
    async revert(source, useId, _entry, target) {
      const key = targetKey(source, useId);
      const applied = target.flags?.ak5e?.[APPLIED_KEY]?.[key];
      if (applied?.effect) await target.createEmbeddedDocuments("ActiveEffect", [applied.effect]);
      await target.update({ [`flags.ak5e.${APPLIED_KEY}.-=${key}`]: null });
      return { removed: true };
    },
    preview(_source, _receipt, entry, target) {
      return `${target?.name ?? "Target"}: restores the Status Condition ended by this Therapy.`;
    }
  },
  /** Writes the durable rider records this use recorded. Relay-safe: only recorded riders are applied. */
  therapistRider: {
    async apply(source, _useId, entry, target) {
      const updates = {};
      for (const rider of entry.riders ?? []) {
        updates[`flags.ak5e.triggerRiders.${rider.id}`] = therapistRiderRecord(target, source.uuid, source.name, rider);
      }
      if (!Object.keys(updates).length) return { ids: [] };
      await target.update(updates);
      return { ids: (entry.riders ?? []).map(rider => rider.id) };
    },
    async revert(source, _useId, entry, target) {
      const updates = {};
      for (const rider of entry.riders ?? []) updates[`flags.ak5e.triggerRiders.-=${rider.id}`] = null;
      if (!Object.keys(updates).length) return { removed: true };
      await target.update(updates);
      return { removed: true };
    },
    preview(_source, _receipt, entry, target) {
      return `${target?.name ?? "Target"}: removes the ${entry.riders?.length ?? 0} Therapy rider(s) it recorded.`;
    }
  }
};

/* ---------------------------------------------------------------- Cards */

async function postTherapistCard(actor, title, body, flags = {}) {
  const ChatMessageClass = globalThis.ChatMessage?.implementation;
  if (!ChatMessageClass?.create) return null;
  return ChatMessageClass.create({
    speaker: ChatMessageClass.getSpeaker?.({ actor }) ?? undefined,
    content: `<div class="ak5e-therapist-card"><h3>${esc(title)}</h3>${body}</div>`,
    flags: { ak5e: { [THERAPIST_CARD_FLAG]: { actorUuid: actor.uuid, ...flags } } }
  });
}

function healButton(actor, { amount, targetUuid, label }) {
  return `<p><button type="button" data-ak5e-therapist-heal="${Number(amount)}" data-target-uuid="${esc(targetUuid)}" data-target-name="${esc(label)}" data-label="${esc(label)}" data-actor="${esc(actor.uuid)}">Apply ${Number(amount)} Hit Points to ${esc(label)}</button></p>`;
}

function rollButton(actor, { formula, targetUuid, label, riderId }) {
  return `<p><button type="button" data-ak5e-therapist-roll="${esc(formula)}" data-target-uuid="${esc(targetUuid)}" data-label="${esc(label)}" data-rider="${esc(riderId)}" data-actor="${esc(actor.uuid)}">Roll ${esc(formula)} (${esc(label)})</button></p>`;
}

/** The Concentrated Treatment package control: one explicit owner roll per package. */
function packageButton(actor, { formula, targetUuid, label, riderId }) {
  return `<button type="button" data-ak5e-therapist-package="${esc(formula)}" data-target-uuid="${esc(targetUuid)}" data-label="${esc(label)}" data-rider="${esc(riderId)}" data-actor="${esc(actor.uuid)}">Roll ${esc(formula)} for ${esc(label)}</button>`;
}

/* ---------------------------------------------------------------- Riders */

const riderId = (therapyId, castId, index) => `${RIDER_PREFIX}:${therapyId}:${castId}:${index}`.replace(/[^A-Za-z0-9_:-]/g, "_");

const RIDER_THERAPIES = new Set(["empowering", "psychological", "recuperative", "regenerative", "resistance"]);
/** Durable caster-side riders: the effect belongs to the caster, not the Art's target. */
const CASTER_RIDER_THERAPIES = new Set(["longTerm"]);
/** Immediate effects: no durable rider, but a real runtime outcome recorded on the receipt and card. */
const INSTANT_THERAPIES = new Set(["energising", "longDistance", "longTerm"]);

/** Caster-next-turn expiry for a rider that ends at the beginning of the caster's next Turn. */
function casterTurnExpiry(caster) {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return null;
  const index = (combat.turns ?? []).findIndex(entry => entry?.actor?.uuid === caster?.uuid);
  if (index < 0 || combat.turn === null || combat.turn === undefined) return null;
  return {
    trigger: "turnStart",
    actorUuid: caster.uuid,
    combatUuid: combat.uuid,
    combatantId: combat.turns[index].id,
    round: Number(combat.round ?? 0) + (index <= Number(combat.turn) ? 1 : 0)
  };
}

/** Target uuids recorded by the native cast, falling back to the current targets of this client. */
function castTargetUuids(message) {
  const stored = message?.flags?.dnd5e?.targets ?? message?.data?.flags?.dnd5e?.targets;
  if (Array.isArray(stored)) {
    const uuids = stored.map(entry => {
      const reference = typeof entry === "string" ? entry : entry?.uuid;
      return actorFor(reference)?.uuid ?? reference;
    }).filter(Boolean);
    if (uuids.length) return [...new Set(uuids)];
  }
  return artCastTargetUuids();
}

/** One durable rider record. Shared by the play-use target kind and the Arts linked-relay
 * operation so both writers produce byte-identical records (no drift between apply paths). */
function therapistRiderRecord(target, sourceUuid, sourceName, rider) {
  return {
    id: rider.id, kind: "rider", targetActorUuid: target.uuid, sourceActorUuid: sourceUuid,
    label: String(rider.label ?? "Therapist Therapy"), trigger: String(rider.trigger ?? "manual"),
    consume: rider.consume === "untilExpiry" ? "untilExpiry" : "once", matcher: null, transientMatch: false,
    expiry: structuredClone(rider.expiry ?? { trigger: "manual" }), effectRef: structuredClone(rider.effectRef ?? null),
    status: "active", receipts: {}
  };
}

/** One durable rider spec for a Therapy on one target (recorded by the Therapist rider play-use). */
function therapistRiderSpec(actor, receipt, therapyId, target, index) {
  const facts = artFacts(actor.items?.get?.(receipt.itemId));
  const rider = riderFor(therapyId, {
    spellMod: spellMod(actor), art: { ...facts, apSpent: Number(receipt.cost) || 0 },
    castId: receipt.id, casterUuid: actor.uuid, targetUuids: [target.uuid], worldTime: worldTime()
  });
  // A caster-next-turn expiry needs a live combat turn to anchor to. Outside combat (or when the
  // caster is not a combatant) the rider waits for the caster's next Turn instead of becoming
  // permanent: the first turnStart naming the caster expires it (see expireAwaitingCasterTurn).
  const turnExpiry = rider.expires?.casterNextTurnStart ? casterTurnExpiry(actor) : null;
  const expiry = turnExpiry
    ?? (rider.expires?.worldTime ? { trigger: "time", worldTime: rider.expires.worldTime, actorUuid: target.uuid }
      : { trigger: "time", worldTime: worldTime() + 60, actorUuid: target.uuid });
  const awaitCasterTurn = (!turnExpiry && (therapyId === "psychological" || therapyId === "resistance")) ? actor.uuid : null;
  const trigger = therapyId === "recuperative" ? "hitTaken" : therapyId === "regenerative" ? "turnStart"
    : therapyId === "empowering" ? "attack" : "save";
  const name = therapyById(therapyId)?.name ?? therapyId;
  return {
    id: riderId(therapyId, receipt.id, index), trigger,
    consume: therapyId === "recuperative" || therapyId === "regenerative" ? "untilExpiry" : "once",
    expiry, effectRef: { rider, therapyId, castId: receipt.id, casterUuid: actor.uuid, label: name,
      ...(awaitCasterTurn ? { awaitCasterTurn } : {}) },
    label: `${name} (${actor.name})`
  };
}

/** One delivered Concentrated Treatment package: an explicit owner-clicked 1d6 per final AP. */
function therapistPackageSpec(actor, receipt, pkg, target, index, packageIndex) {
  const name = therapyById(pkg?.therapyId)?.name ?? String(pkg?.therapyId ?? "Therapy");
  const formula = String(pkg?.formula ?? "");
  return {
    id: `therapist:package:${receipt.id}:${index}:${packageIndex}`.replace(/[^A-Za-z0-9_:-]/g, "_"),
    trigger: "hpRestored", consume: "once", expiry: { trigger: "manual" },
    effectRef: {
      rider: { kind: "healPackage", therapyId: pkg?.therapyId ?? null, formula, castId: receipt.id,
        casterUuid: actor.uuid, targetUuids: [target.uuid], expires: null },
      package: true, therapyId: pkg?.therapyId ?? null, castId: receipt.id, casterUuid: actor.uuid, label: name
    },
    label: `Concentrated Treatment: ${formula} (${name})`
  };
}

/** Card-level idempotency: the same committed cast may be processed twice (replay, second
 * client); the flagged eventId is stamped on every post, and a second post with the same
 * castId+eventId is skipped so owner-roll controls are never duplicated. */
function therapistCardPosted(castId, eventId) {
  // game.messages is a plain array in node fixtures but a Foundry Collection (Map-like,
  // iterating to [key, value] pairs) in live worlds: read values in both shapes so the
  // replay guard actually fires outside tests.
  const messages = globalThis.game?.messages;
  const list = Array.isArray(messages) ? messages
    : (messages && typeof messages.values === "function" ? [...messages.values()] : [...(messages ?? [])]);
  return list.some(message => {
    const flag = message.getFlag?.("ak5e", "therapistCard") ?? message.flags?.ak5e?.therapistCard;
    return flag && String(flag.castId ?? "") === String(castId ?? "") && String(flag.eventId ?? "") === String(eventId ?? "");
  });
}

/** The explicit roll controls for Concentrated Treatment packages delivered by one cast. */
async function postPackageCard(actor, receipt, packages, delivered) {
  if (!packages.length || !receipt?.id) return;
  if (therapistCardPosted(receipt.id, `packages:${receipt.id}`)) return;
  const rows = [];
  for (const entry of delivered) {
    for (const [packageIndex, pkg] of packages.entries()) {
      const rider = entry.riders.find(candidate => candidate.id === `therapist:package:${receipt.id}:${entry.index}:${packageIndex}`.replace(/[^A-Za-z0-9_:-]/g, "_"));
      if (!rider) continue;
      const name = therapyById(pkg?.therapyId)?.name ?? String(pkg?.therapyId ?? "Therapy");
      rows.push(`<li>${esc(name)}: <strong>${esc(pkg.formula)}</strong> ${packageButton(actor, { formula: pkg.formula, targetUuid: entry.uuid, label: entry.name, riderId: rider.id })}</li>`);
    }
  }
  if (!rows.length) return;
  await postTherapistCard(actor, "Concentrated Treatment",
    `<p>Each free Therapy on an Art that restores Hit Points adds its own 1d6 per final Arts Point spent. Each package below is a separate owner-clicked roll.</p>
     <ul>${rows.join("")}</ul><p>The module rolls nothing until you click; cancelling the confirmation applies no healing.</p>`,
    { castId: String(receipt.id), casterUuid: actor.uuid, eventId: `packages:${receipt.id}` });
}

/**
 * Record the cast's durable riders and deliver its Concentrated Treatment packages. The native cast
 * receipt is already in the ledger when its ChatMessage is created. Rider writes go through the
 * Therapist rider play-use, so a Creature the caster cannot write is relayed by the active GM
 * instead of being skipped; an interruption leaves the cast itself unaffected (idempotent IDs).
 */
/** Exactly one client acts for a cast: the lowest-id active client that can write the actor
 * (owner or GM). Every other client skips silently. Without this, each client records the same
 * deterministic use, posts its own cards, and tries to update the other client's use card
 * (a ChatMessage permission error on every cast). With several active owners of the same Actor,
 * election still yields exactly one recorder. When no active-user information exists (node
 * fixtures), fall back to the legacy owner-or-GM rule so headless tests keep running. */
function electPoster(actor) {
  const me = globalThis.game?.user;
  if (!actor || !me) return false;
  const users = Array.from(globalThis.game?.users?.values?.() ?? globalThis.game?.users ?? []);
  const activeWriters = users.filter(user => user && user.active === true
    && (user.isGM || actor.testUserPermission?.(user, "OWNER")));
  if (!activeWriters.length) return Boolean(me.isGM || actor.isOwner);
  activeWriters.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  return activeWriters[0].id === me.id;
}

async function syncCastRiders(actor, receipt, targets) {
  const selection = therapySelectionIds(receipt?.options?.[THERAPIST_OPTION_ID]);
  if (!selection.length) return { riders: [], packages: 0 };
  if (!electPoster(actor)) return { riders: [], packages: 0 };
  const riderTherapies = selection.filter(id => RIDER_THERAPIES.has(id));
  const casterTherapies = selection.filter(id => CASTER_RIDER_THERAPIES.has(id));
  const instantTherapies = selection.filter(id => INSTANT_THERAPIES.has(id));
  const packages = Array.isArray(receipt?.therapist?.healingPackages) ? receipt.therapist.healingPackages.filter(pkg => pkg?.formula) : [];
  if (!riderTherapies.length && !casterTherapies.length && !packages.length && !instantTherapies.length) return { riders: [], packages: 0 };
  const usedNames = [...new Set([...riderTherapies, ...casterTherapies, ...instantTherapies, ...packages.map(pkg => pkg.therapyId)])]
    .map(id => esc(therapyById(id)?.name ?? id));
  if (!targets.length) {
    await postTherapistCard(actor, "Therapist Therapy riders",
      `<p>${esc(actor.name)} used ${usedNames.join(", ")}, but this cast recorded no target. Apply the rider's effect manually on the intended Creature.</p>
       ${packages.length ? `<p>Concentrated Treatment healing: ${packages.map(pkg => `${esc(pkg.formula)} for ${esc(therapyById(pkg.therapyId)?.name ?? pkg.therapyId)}`).join(", ")} (owner-rolled).</p>` : ""}
       <p>This card makes no automatic change.</p>`,
      { castId: String(receipt.id ?? ""), casterUuid: actor.uuid, eventId: `no-target:${receipt.id ?? ""}` });
    return { riders: [], packages: 0 };
  }
  const resolvedTargets = [];
  for (const uuid of targets) {
    const target = actorFor(uuid);
    if (target?.documentName) resolvedTargets.push(target);
  }
  const delivered = [];
  for (const [index, target] of resolvedTargets.entries()) {
    const riders = riderTherapies.map(therapyId => therapistRiderSpec(actor, receipt, therapyId, target, index));
    for (const [packageIndex, pkg] of packages.entries()) riders.push(therapistPackageSpec(actor, receipt, pkg, target, index, packageIndex));
    if (riders.length) delivered.push({ uuid: target.uuid, name: target.name, riders, index });
  }
  // Caster-side durable riders (Long-Term duration/concentration). They live on the caster,
  // so their linked child targets the caster and their undo never touches the patient.
  if (casterTherapies.length) {
    const riders = casterTherapies.map((therapyId, offset) => therapistRiderSpec(actor, receipt, therapyId, actor, delivered.length + offset));
    if (riders.length) delivered.push({ uuid: actor.uuid, name: actor.name, riders, index: delivered.length, caster: true });
  }
  if (!delivered.length && !instantTherapies.length) {
    await postTherapistCard(actor, "Therapist Therapy riders",
      `<p>${esc(actor.name)} used ${usedNames.join(", ")}, but no target Creature could be resolved for this cast. Apply the rider's effect manually.</p><p>This card changes nothing.</p>`,
      { castId: String(receipt.id ?? ""), casterUuid: actor.uuid, eventId: `unresolved:${receipt.id ?? ""}` });
    return { riders: [], packages: 0 };
  }
  // Immediate runtime effects live on the committed receipt (therapistConsume wrote them
  // pre-commit); a direct call without a native commit computes them here instead.
  const instant = Array.isArray(receipt?.therapist?.instant) && receipt.therapist.instant.length
    ? receipt.therapist.instant
    : instantTherapyEffects(actor, receipt, instantTherapies, targets);
  // Linked children FIRST: the Arts relay captures the true before-state (owned: supplied maps;
  // unowned: the elected GM applies and records it), so parent undo removes exactly these riders.
  // The play-use command after it rewrites identical values and stays the retry/record path.
  // Instant-only casts record no riders: they skip both and go straight to the guidance card.
  if (delivered.length) {
    for (const entry of delivered) await appendTherapistRiderChild(actor, receipt, entry);
    const riderIds = delivered.flatMap(entry => entry.riders.map(rider => rider.id));
    try {
      await medicUses.command(actor, "therapistRider", { confirmed: true, castId: receipt.id, targets: delivered },
        `therapistRiders-${String(receipt.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 44)}`);
    } catch (error) {
      // An unowned target without an active GM stays pending on the play-use receipt and is retried from
      // the panel; the cast and its Life Support/AP changes are already recorded and undoable.
      console.error("AK5e | Therapist riders", error);
      await postTherapistCard(actor, "Therapist Therapy riders not recorded yet",
        `<p>${esc(actor.name)}'s Therapy riders could not be applied: ${esc(error?.message ?? String(error))}.</p>
         <p>Retry the recorded use from the Medic panel when a GM is connected, or apply the rider's effect manually.</p>`,
        { castId: String(receipt.id ?? ""), casterUuid: actor.uuid, eventId: `pending:${receipt.id ?? ""}` });
    }
    await postPackageCard(actor, receipt, packages, delivered);
    await postInstantTherapyCards(actor, receipt, instant, resolvedTargets);
    return { riders: riderIds, packages: delivered.length * packages.length };
  }
  await postInstantTherapyCards(actor, receipt, instant, resolvedTargets);
  return { riders: [], packages: 0 };
}

/** Immediate E6 outcomes for Energising/Long-Distance/Long-Term, from the pure rules layer. */
function instantTherapyEffects(actor, receipt, therapyIds, targets) {
  if (!therapyIds.length) return [];
  const facts = artFacts(actor.items?.get?.(receipt.itemId));
  const art = { ...facts, apSpent: Number(receipt.cost) || 0 };
  const context = { spellMod: spellMod(actor), art, castId: receipt.id, casterUuid: actor.uuid,
    targetUuids: [...targets], worldTime: worldTime() };
  const out = [];
  for (const therapyId of therapyIds) {
    if (therapyId === "longDistance") {
      const rider = riderFor("longDistance", context);
      out.push({ therapyId, kind: "range", rangeFeet: rider.rangeFeet, wasTouch: facts.rangeTouch === true });
    } else if (therapyId === "longTerm") {
      const rider = riderFor("longTerm", context);
      out.push({ therapyId, kind: "duration", durationSeconds: rider.durationSeconds,
        concentrationAdvantage: rider.concentrationAdvantage === true });
    } else if (therapyId === "energising") {
      out.push({ therapyId, kind: "move" });
    }
  }
  return out;
}

const formatDuration = seconds => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "its normal duration";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minute${seconds >= 120 ? "s" : ""}`;
  return `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? "s" : ""}`;
};

/** Guidance cards for the immediate E6 outcomes. Energising movement is performed by moving
 * the token (natively undoable); range/duration are recorded on the cast receipt above. */
async function postInstantTherapyCards(actor, receipt, instant, targets) {
  if (!instant.length || !receipt?.id) return;
  if (therapistCardPosted(receipt.id, `instant:${receipt.id}`)) return;
  const rows = [];
  for (const item of instant) {
    if (item.kind === "range") {
      rows.push(`<li><strong>Long-Distance Therapy:</strong> this cast's range is ${item.wasTouch
        ? "Touch becomes <strong>30 feet</strong>" : `doubled to <strong>${esc(item.rangeFeet)} feet</strong>`}.</li>`);
    } else if (item.kind === "duration") {
      rows.push(`<li><strong>Long-Term Therapy:</strong> this cast's duration is doubled to <strong>${esc(formatDuration(item.durationSeconds))}</strong> (maximum 24 hours).${item.concentrationAdvantage ? " Roll Concentration saves to maintain it with <strong>Advantage</strong> (choose Advantage on the native save dialog)." : ""}</li>`);
    } else if (item.kind === "move") {
      for (const target of targets) {
        const walk = Number(target?.system?.attributes?.movement?.walk);
        rows.push(`<li><strong>Energising Therapy:</strong> ${esc(target?.name ?? "the target")} can immediately move up to <strong>${Number.isFinite(walk) && walk > 0 ? `${esc(Math.floor(walk / 2))} feet (half Speed)` : "up to half its Speed (measure manually)"}</strong> after the Art. Move the token now.</li>`);
      }
    }
  }
  if (!rows.length) return;
  await postTherapistCard(actor, "Therapist Therapy effects",
    `<ul>${rows.join("")}</ul><p>Ranges, durations and movement above belong to this cast; the cast receipt records them and its undo reverses the recorded Life Support and riders.</p>`,
    { castId: String(receipt.id), casterUuid: actor.uuid, eventId: `instant:${receipt.id}` });
}

/** One linked Arts child per delivered target, carrying the relay descriptor parent undo needs.
 * Owned (this client can write the target): caller-supplied before/after maps, no kernel crossing.
 * Unowned with an active GM: the named operation is applied and before-stated by the elected GM.
 * Neither (no GM, unowned target): a plain child, exactly as before; the play-use retry path
 * covers the application, and a later GM-backed cast records the full descriptor. */
async function appendTherapistRiderChild(actor, receipt, entry) {
  const base = { id: `therapist-${receipt.id}-${entry.index}`, kind: "therapistRider",
    name: `Therapist Therapy rider → ${entry.name}`,
    description: entry.riders.map(rider => therapyById(rider.effectRef?.therapyId)?.name ?? rider.id).join(", ") };
  const target = actorFor(entry.uuid);
  const me = globalThis.game?.user;
  const writable = Boolean(target?.documentName === "Actor" && (me?.isGM || target.isOwner));
  const operation = { id: "therapist-rider-record",
    data: { castId: String(receipt.id), sourceUuid: actor.uuid, sourceName: actor.name, targetUuid: entry.uuid,
      riders: entry.riders.map(rider => ({ id: rider.id, label: rider.label, trigger: rider.trigger,
        consume: rider.consume, expiry: rider.expiry, effectRef: rider.effectRef })) } };
  if (!target?.documentName) return appendLinkedReceipt(actor, receipt.id, base, []);
  if (writable) {
    const changes = {}, restore = {}, absent = [];
    for (const rider of entry.riders) {
      const path = `flags.ak5e.triggerRiders.${rider.id}`;
      const current = target.getFlag?.("ak5e", "triggerRiders")?.[rider.id] ?? target.flags?.ak5e?.triggerRiders?.[rider.id];
      // A path that did not exist is recorded as a null restore value, not as an empty
      // restore map: the ledger persists restoreEntries from `restore`, and an empty map
      // serialises to an empty entry list that later reads mistake for "nothing to restore",
      // silently skipping the revert while the parent refund succeeds.
      if (current === undefined) { absent.push(path); restore[path] = null; }
      else restore[path] = structuredClone(current);
      changes[path] = therapistRiderRecord(target, actor.uuid, actor.name, rider);
    }
    return appendLinkedReceipt(actor, receipt.id, { ...base,
      relay: { targetUuid: target.uuid, operation, changes, restore, ...(absent.length ? { restoreAbsent: absent } : {}) } }, []);
  }
  if (!globalThis.game?.users?.activeGM) return appendLinkedReceipt(actor, receipt.id, base, []);
  return appendLinkedReceipt(actor, receipt.id, { ...base,
    relay: { targetUuid: target.uuid, operation } }, []);
}

function therapistRidersOn(actor) {
  return riderRecords(actor).filter(record => String(record.id).startsWith(`${RIDER_PREFIX}:`));
}

/** Active Therapist riders on one Actor, with their pure rider data (for the sheet and cards). */
export function therapistRiders(actor) {
  return therapistRidersOn(actor).filter(record => record.status === "active").map(record => ({
    id: record.id,
    therapyId: record.effectRef?.therapyId ?? null,
    label: record.label,
    casterUuid: record.effectRef?.casterUuid ?? record.sourceActorUuid ?? null,
    castId: record.effectRef?.castId ?? null,
    rider: record.effectRef?.rider ?? null,
    package: record.effectRef?.package === true,
    expired: record.effectRef?.package === true ? false
      : record.effectRef?.rider ? riderExpired(record.effectRef.rider, { worldTime: worldTime() }) : false
  })).filter(entry => !entry.expired);
}

/* ---------------------------------------------------------------- Event handlers */

/** Receipt keys must survive a flags round-trip: Foundry expands dots in flag object
 * keys, so an event id containing dots would come back nested and the replay guard would
 * never match it. Sanitize every event-derived receipt id at the call boundary. */
const receiptKey = eventId => String(eventId ?? "").replace(/[.:]/g, "_");

/** Empowering Therapy: the affected Creature's next successful Attack consumes the rider (no die is touched). */
async function onTherapistAttack(event) {
  const actor = actorFor(event?.actorUuid);
  if (!actor?.isOwner && !globalThis.game?.user?.isGM) return;
  const records = therapistRidersOn(actor).filter(record => record.status === "active" && record.effectRef?.therapyId === "empowering");
  if (!records.length) return;
  const hits = (event?.targets ?? []).filter(target => target?.hit === true);
  if (!hits.length) return;
  for (const record of records) {
    const consumed = await consumeRider(record.id, { actor, receipt: receiptKey(event.eventId) });
    if (!consumed?.ok || consumed.replayed) continue;
    const amount = Number(record.effectRef?.rider?.amount ?? 0);
    await postTherapistCard(actor, "Empowering Therapy",
      `<p>${esc(actor.name)}'s next successful Attack carries the Empowering Therapy bonus: <strong>+${esc(amount)} Damage</strong>. Add it with the native damage controls; this card rolls nothing.</p>`);
  }
}

/** Recuperative Therapy: one healing offer per committed hostile damage application (no automatic heal). */
async function onTherapistHitTaken(event) {
  const actor = actorFor(event?.actorUuid);
  if (!actor?.isOwner && !globalThis.game?.user?.isGM) return;
  const records = therapistRidersOn(actor).filter(record => record.status === "active" && record.effectRef?.therapyId === "recuperative");
  for (const record of records) {
    const rider = record.effectRef?.rider;
    if (!rider) continue;
    const seen = Object.keys(record.receipts ?? {});
    const result = recuperativeHeal(rider, {
      id: String(event?.eventId ?? ""),
      targetUuid: event?.actorUuid,
      hostile: event?.hostile === true,
      amount: Number(event?.amount ?? 0)
    }, seen);
    if (!result.heal) continue;
    const consumed = await consumeRider(record.id, { actor, receipt: receiptKey(event?.eventId) });
    if (!consumed?.ok || consumed.replayed) continue;
    await postTherapistCard(actor, "Recuperative Therapy",
      `<p>${esc(actor.name)} took hostile Damage from a committed application. Recuperative Therapy restores <strong>${esc(result.heal)} Hit Points</strong> once for this application.</p>${healButton(actor, { amount: result.heal, targetUuid: actor.uuid, label: actor.name })}<p>The button applies the printed, flat amount; it rolls nothing.</p>`,
      { casterUuid: record.effectRef?.casterUuid ?? null, eventId: String(event?.eventId ?? "") });
  }
}

/** Regenerative Therapy: at the target's Turn start, offer the explicit owner 1d6 roll.
 * Real combat turns emit only on the GM client, so the GM posts exactly once there; local or
 * synthetic events post only on the elected writer. The offer is persisted on the rider record
 * before the card posts, so a repeated delivery of the same event replays instead of double-posting. */
async function onTherapistTurnStart(event) {
  const actor = actorFor(event?.actorUuid);
  if (!actor) return;
  const me = globalThis.game?.user;
  if (event?.combatUuid) { if (!me?.isGM) return; }
  else if (!electPoster(actor)) return;
  await expireAwaitingCasterTurn(String(event?.actorUuid ?? ""));
  const records = therapistRidersOn(actor).filter(record => record.status === "active" && record.effectRef?.therapyId === "regenerative");
  if (!records.length) return;
  const eventId = String(event?.eventId ?? "");
  if (!eventId) return;
  for (const record of records) {
    // Until-expiry riders only record the receipt here; the rider stays for future turns.
    // The key is sanitized for the flags round-trip (see receiptKey).
    const consumed = await consumeRider(record.id, { actor, receipt: receiptKey(eventId) }).catch(() => null);
    if (!consumed?.ok || consumed.replayed) continue;
    await postTherapistCard(actor, "Regenerative Therapy",
      `<p>At the start of ${esc(actor.name)}'s Turn, Regenerative Therapy restores 1d6 Hit Points.</p>${rollButton(actor, { formula: "1d6", targetUuid: actor.uuid, label: actor.name, riderId: record.id })}<p>The owner clicks this roll; the module never rolls it.</p>`,
      { casterUuid: record.effectRef?.casterUuid ?? null, eventId });
  }
}

/** Out-of-combat caster-turn riders (Psychological/Resistance created while their caster had no
 * next turn) expire at the caster's next Turn start: the first turnStart naming the caster ends
 * every manual-expiry rider still awaiting it. Runs wherever the turn event lands; per-record
 * errors never stop the sweep. */
async function expireAwaitingCasterTurn(actorUuid) {
  const caster = actorFor(actorUuid);
  const casterId = caster?.uuid ?? null;
  if (!casterId) return;
  for (const actor of globalThis.game?.actors ?? []) {
    if (actor?.documentName !== "Actor") continue;
    for (const record of therapistRidersOn(actor)) {
      if (record.status !== "active") continue;
      if (record.effectRef?.awaitCasterTurn !== casterId) continue;
      if (!["psychological", "resistance"].includes(record.effectRef?.therapyId)) continue;
      try { await removeRider(actor, record.id); }
      catch (error) { console.error("AK5e | Therapist expiry transition", error); }
    }
  }
}

/** Psychological Therapy: offer the owner-confirmed automatic pass on a qualifying save.
 * The receiving client posts when it can write the affected Actor (save events emit on the
 * rolling client only). A module-scope posted-set stops a repeated delivery of one event from
 * rendering twice; confirming consumes the rider through the reversible pass flow. */
const postedSaveCards = new Set();
async function onTherapistSave(event) {
  const actor = actorFor(event?.actorUuid);
  if (!actor) return;
  const me = globalThis.game?.user;
  if (!me?.isGM && !actor.isOwner) return;
  const ability = String(event?.ability ?? "").toLowerCase();
  if (!["int", "wis", "cha"].includes(ability)) return;
  const records = therapistRidersOn(actor).filter(record => record.status === "active" && record.effectRef?.therapyId === "psychological");
  if (!records.length) return;
  const eventId = String(event?.eventId ?? "");
  if (!eventId || records.some(record => postedSaveCards.has(`${record.id}:${eventId}`))) return;
  if (postedSaveCards.size > 500) postedSaveCards.clear();
  for (const record of records) postedSaveCards.add(`${record.id}:${eventId}`);
  await postTherapistCard(actor, "Psychological Therapy",
    `<p>${esc(actor.name)} makes a ${esc(ability.toUpperCase())} saving throw. Psychological Therapy lets the affected Creature automatically pass the next Intelligence, Wisdom, or Charisma save it makes before the beginning of the caster's next Turn.</p>
     <p><button type="button" data-ak5e-therapist-pass="psychological" data-actor="${esc(actor.uuid)}" data-event="${esc(event?.eventId)}">Confirm: this save automatically passes (Psychological Therapy)</button></p>
     <p>The module does not change the roll; confirming records the pass and consumes the rider.</p>`);
}

/** Long Rest: The Doctor Is In and Early Onset uses refresh. Unspent concentrated allowances are kept (no invented loss). */
async function onTherapistRest(actor, result, config = {}) {
  if (!isTherapist(actor) || !actor.isOwner) return;
  const type = config?.type ?? result?.type ?? (config?.longRest ? "long" : null);
  if (type !== "long") return;
  const state = therapistState(actor);
  if (!state.usedSinceLongRest && !state.earlyOnsetUsed && !state.earlyOnsetPending) return;
  await actor.update({
    [THERAPIST_FLAG_PATH]: mergeTherapistState(actor, {
      usedSinceLongRest: false,
      doctorIsIn: state.doctorIsIn && doctorActive(state) ? state.doctorIsIn : null,
      earlyOnset: { used: 0, pending: null }
    })
  });
}

/* ---------------------------------------------------------------- Card controls */

/** Confirmed owner-clicked healing: the card button opens the standard Medic confirm loop first.
 * A linked rider travels in the use data and is consumed where the heal is applied (see the
 * therapistHeal target kind), never by the clicking client, which often cannot write the patient. */
function confirmTherapistHeal(caster, { title, amount, targetUuid, targetName, label, riderIdValue = null, ...extra } = {}) {
  return confirmPlayUse(title, rest => medicUses.command(caster, "therapistHeal",
    { confirmed: true, amount, targetUuid, targetName, label, riderId: riderIdValue ?? rest.riderId ?? null, ...rest }, `therapist-heal-${foundry.utils.randomID()}`.slice(0, 60)), {
    preview: rest => medicUses.preview(caster, "therapistHeal", { amount, targetUuid, targetName, label, ...rest })
  });
}

/** The card's action belongs to the Medic (caster); the patient is only the target. */
async function applyHealFromCard(caster, button) {
  const amount = Number(button.dataset.ak5eTherapistHeal);
  const targetUuid = button.dataset.targetUuid;
  const label = button.dataset.label ?? "Therapist Therapy";
  const targetName = button.dataset.targetName ?? label;
  if (!Number.isInteger(amount) || amount <= 0 || !targetUuid) return;
  const result = await confirmTherapistHeal(caster, { title: label, amount, targetUuid, targetName, label });
  if (result) button.disabled = true;
}

async function rollFromCard(caster, button, eventId = null) {
  const formula = button.dataset.ak5eTherapistRoll;
  const targetUuid = button.dataset.targetUuid;
  const riderIdValue = button.dataset.rider;
  if (!formula || !targetUuid) return;
  // The click rolls the die; applying the result is still confirmed (cancelling applies nothing).
  const roll = await new Roll(formula, caster.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor: caster }), flavor: "Regenerative Therapy" });
  const amount = Math.max(1, Number(roll.total) || 1);
  const result = await confirmTherapistHeal(caster, { title: "Regenerative Therapy", amount, targetUuid,
    targetName: actorFor(targetUuid)?.name ?? "the target", label: "Regenerative Therapy", riderIdValue, receiptId: eventId });
  if (result) button.disabled = true;
}

/** Concentrated Treatment: one explicit roll per package, then the confirmed heal. */
async function rollPackageFromCard(caster, button, castId = null) {
  const formula = button.dataset.ak5eTherapistPackage;
  const targetUuid = button.dataset.targetUuid;
  const riderIdValue = button.dataset.rider;
  if (!formula || !targetUuid) return;
  const roll = await new Roll(formula, caster.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor: caster }), flavor: "Concentrated Treatment" });
  const amount = Math.max(1, Number(roll.total) || 1);
  const result = await confirmTherapistHeal(caster, { title: "Concentrated Treatment", amount, targetUuid,
    targetName: actorFor(targetUuid)?.name ?? "the target", label: "Concentrated Treatment", riderIdValue, receiptId: castId });
  if (result) button.disabled = true;
}

/** Reversible automatic-pass confirmations. Consuming a rider is a one-way write, so every
 * confirm snapshots each rider record onto the patient first (`flags.ak5e.therapistPass.<key>`);
 * the card's Undo button (and the sheet's restore control) reinstates exactly those snapshots and
 * then deletes the marker. A rider changed by anyone else since is left in place and logged. */
const therapistPassMarker = (actorDoc, key) =>
  actorDoc?.getFlag?.("ak5e", "therapistPass")?.[key] ?? actorDoc?.flags?.ak5e?.therapistPass?.[key] ?? null;
export const therapistPassMarkers = actorDoc =>
  actorDoc?.getFlag?.("ak5e", "therapistPass") ?? actorDoc?.flags?.ak5e?.therapistPass ?? {};

export async function confirmTherapistPasses(actorDoc, eventId, riderIds = null) {
  if (!actorDoc?.isOwner && !globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.info?.("Only the affected Creature's owner (or the GM) can confirm this automatic pass.");
    return null;
  }
  const wanted = Array.isArray(riderIds) ? new Set(riderIds.filter(id => typeof id === "string")) : null;
  const riders = therapistRiders(actorDoc).filter(rider => ["psychological", "resistance"].includes(rider.therapyId)
    && (!wanted || wanted.has(rider.id)));
  if (!riders.length) return null;
  const key = opaqueKey(`therapist-pass:${eventId}`);
  const snapshots = riders.map(rider => ({ id: rider.id,
    snapshot: structuredClone(therapistRidersOn(actorDoc).find(record => record.id === rider.id) ?? null) }));
  await actorDoc.update({ [`flags.ak5e.therapistPass.${key}`]: { riders: snapshots, eventId, at: Date.now() } });
  const performed = [];
  for (const rider of riders) {
    await consumeRider(rider.id, { actor: actorDoc, receipt: eventId });
    performed.push(rider.label);
  }
  await postTherapistCard(actorDoc, "Therapy: automatic pass",
    `<p><strong>Automatically passes (${esc(performed.join(", "))}).</strong> The saving throw is treated as a success; the module changed no die.</p>
     <p><button type="button" data-ak5e-therapist-pass-undo="${esc(key)}" data-actor="${esc(actorDoc.uuid)}">Undo this pass (restore the rider)</button></p>`,
    { casterUuid: riders[0]?.casterUuid ?? null, eventId });
  return { performed, markerKey: key };
}

/** Restore a consumed pass from its marker. Exported for the sheet restore control. */
export async function restoreTherapistPass(actorDoc, markerKey) {
  const marker = markerKey ? therapistPassMarker(actorDoc, markerKey) : null;
  if (!marker) {
    globalThis.ui?.notifications?.info?.("No recorded automatic pass matches that restore control.");
    return null;
  }
  if (!actorDoc?.isOwner && !globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.info?.("Only the affected Creature's owner (or the GM) can restore this pass.");
    return null;
  }
  const updates = {};
  const restored = [], skipped = [];
  for (const { id, snapshot } of marker.riders ?? []) {
    const path = `flags.ak5e.triggerRiders.${id}`;
    const current = actorDoc.getFlag?.("ak5e", "triggerRiders")?.[id] ?? actorDoc.flags?.ak5e?.triggerRiders?.[id] ?? null;
    const snapshotKeys = Object.keys(snapshot?.receipts ?? {});
    const currentKeys = Object.keys(current?.receipts ?? {});
    const untouched = current == null
      || (current.status !== "active" && currentKeys.every(receipt => snapshotKeys.includes(receipt) || receipt === marker.eventId));
    if (!untouched) {
      console.error("AK5e | Therapist pass restore", `rider ${id} changed since this pass; leaving it in place`);
      skipped.push(id);
      continue;
    }
    if (snapshot) updates[path] = structuredClone(snapshot);
    else {
      const parts = path.split("."), last = parts.pop();
      updates[`${parts.join(".")}.-=${last}`] = null;
    }
    restored.push(id);
  }
  updates[`flags.ak5e.therapistPass.-=${markerKey}`] = null;
  await actorDoc.update(updates);
  await postTherapistCard(actorDoc, "Therapy: pass restored",
    `<p>The confirmed automatic pass was undone${restored.length ? `; ${esc(restored.length)} rider${restored.length === 1 ? "" : "s"} restored` : ""}${skipped.length ? `; ${esc(skipped.length)} changed since and left in place` : ""}.</p>`,
    { eventId: `${marker.eventId}:restored` });
  return { restored, skipped };
}

/** Psychological/Resistance pass: only the affected Creature's owner (or the GM) confirms. */
async function confirmPassFromCard(actor, button) {
  const actorDoc = actorFor(button.dataset.actor) ?? actor;
  const result = await confirmTherapistPasses(actorDoc, String(button.dataset.event ?? `pass:${foundry.utils.randomID()}`));
  if (result) button.disabled = true;
  return result;
}

function wireTherapistCard(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
  if (!root?.querySelectorAll) return;
  const card = flag(message, THERAPIST_CARD_FLAG) ?? {};
  const patient = actorFor(card.actorUuid ?? flag(message, "artCast")?.actorUuid);
  const caster = actorFor(card.casterUuid) ?? patient;
  const actor = caster;
  if (!actor) return;
  root.querySelectorAll("[data-ak5e-therapist-heal]").forEach(button => {
    if (button.dataset.ak5eWired) return;
    button.dataset.ak5eWired = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      Promise.resolve(applyHealFromCard(actor, button)).catch(error => {
        console.error("AK5e | Therapist heal", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
  });
  root.querySelectorAll("[data-ak5e-therapist-roll]").forEach(button => {
    if (button.dataset.ak5eWired) return;
    button.dataset.ak5eWired = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      Promise.resolve(rollFromCard(actor, button, card.eventId ?? null)).catch(error => {
        console.error("AK5e | Therapist roll", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
  });
  root.querySelectorAll("[data-ak5e-therapist-package]").forEach(button => {
    if (button.dataset.ak5eWired) return;
    button.dataset.ak5eWired = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      Promise.resolve(rollPackageFromCard(actor, button, card.castId ?? null)).catch(error => {
        console.error("AK5e | Therapist package", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
  });
  root.querySelectorAll("[data-ak5e-therapist-pass]").forEach(button => {
    if (button.dataset.ak5eWired) return;
    button.dataset.ak5eWired = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      Promise.resolve(confirmPassFromCard(actor, button)).catch(error => {
        console.error("AK5e | Therapist pass", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
  });
  root.querySelectorAll("[data-ak5e-therapist-pass-undo]").forEach(button => {
    if (button.dataset.ak5eWired) return;
    button.dataset.ak5eWired = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      Promise.resolve((async () => {
        const patient = actorFor(button.dataset.actor) ?? actor;
        const result = await restoreTherapistPass(patient, button.dataset.ak5eTherapistPassUndo);
        if (result) button.disabled = true;
        return result;
      })()).catch(error => {
        console.error("AK5e | Therapist pass restore", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
  });
  root.querySelectorAll("[data-ak5e-therapist-early]").forEach(button => {
    if (button.dataset.ak5eWired) return;
    button.dataset.ak5eWired = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      Promise.resolve(openEarlyOnsetCast(actorFor(button.dataset.actor) ?? actor, {
        artItemId: button.dataset.artItem ?? null,
        activityId: button.dataset.activity ?? null,
        triggerEventId: button.dataset.trigger ?? null,
        requiredTargetUuid: button.dataset.target ?? null
      })).catch(error => {
        console.error("AK5e | Therapist Early Onset cast", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
  });
}

let installed = false;
let castCardsWired = false;
const handledCasts = new Set();

/**
 * Idempotent registration: the native cast option, the Therapist play-use plans and their target
 * kinds, the rider/event handlers and the card controls. Calling it twice is a no-op and cannot
 * duplicate the cast option, a plan or an event handler.
 */
export function registerTherapistHooks() {
  if (installed) return false;
  installed = true;
  registerArtCastOptions(therapistCastOptions);
  medicUses.register({ plans: THERAPIST_PLANS, targetKinds: THERAPIST_TARGET_KINDS });
  // Named relay operation for the Arts linked-child path (finding: parent undo must remove the
  // applied riders). The GM recomputes `apply` from the descriptor, captures the true
  // before-state, and reverts through it; `validateUpdate` approves exactly this operation's
  // rider-record paths on both phases. Duplicate registration is a no-op (returns false).
  registerRelayOperation("therapist-rider-record", {
    label: "Therapist Therapy rider",
    validate: (target, data) => Boolean(target?.documentName === "Actor"
      && typeof data?.castId === "string" && data.castId
      && typeof data?.targetUuid === "string" && data.targetUuid === target.uuid
      && Array.isArray(data?.riders) && data.riders.length > 0
      && data.riders.every(rider => rider && typeof rider.id === "string" && rider.id && typeof rider.label === "string")),
    apply: (target, data) => {
      const updates = {};
      for (const rider of data.riders ?? []) {
        updates[`flags.ak5e.triggerRiders.${rider.id}`] = therapistRiderRecord(target, data.sourceUuid, data.sourceName, rider);
      }
      return updates;
    },
    validateUpdate: (target, updates, context) => {
      const data = context?.data ?? {};
      const ids = new Set((data.riders ?? []).map(rider => rider?.id).filter(id => typeof id === "string" && id));
      if (target?.documentName !== "Actor" || !ids.size) return false;
      const entries = Object.entries(updates ?? {});
      if (!entries.length) return false;
      for (const [path, value] of entries) {
        const match = /^flags\.ak5e\.triggerRiders\.([A-Za-z0-9_.:-]{1,80})$/.exec(path);
        if (!match || !ids.has(match[1])) return false;
        if (context?.phase === "restore") {
          if (value !== null && (typeof value !== "object" || Array.isArray(value))) return false;
          if (value !== null && typeof value.id === "string" && value.id !== match[1]) return false;
        } else {
          if (!value || typeof value !== "object" || value.id !== match[1]) return false;
          if (typeof value.label !== "string" || typeof value.trigger !== "string") return false;
        }
      }
      return true;
    }
  });
  onAk5eEvent("attack", event => onTherapistAttack(event));
  onAk5eEvent("hitTaken", event => onTherapistHitTaken(event));
  onAk5eEvent("turnStart", event => onTherapistTurnStart(event));
  onAk5eEvent("save", event => onTherapistSave(event));
  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      Promise.resolve(onTherapistRest(actor, result, config)).catch(error => console.error("AK5e | Therapist rest", error));
    });
    if (!castCardsWired) {
      castCardsWired = true;
      globalThis.Hooks.on("createChatMessage", message => {
        const receipt = flag(message, "artCast");
        if (!receipt?.id || handledCasts.has(receipt.id)) return;
        const selection = therapySelectionIds(receipt.options?.[THERAPIST_OPTION_ID]);
        if (!selection.length) return;
        handledCasts.add(receipt.id);
        const actor = actorFor(receipt.actorUuid);
        if (!actor) return;
        Promise.resolve(syncCastRiders(actor, receipt, castTargetUuids(message)))
          .catch(error => console.error("AK5e | Therapist cast riders", error));
      });
      globalThis.Hooks.on("renderChatMessageHTML", (message, html) => {
        try { wireTherapistCard(message, html); }
        catch (error) { console.error("AK5e | Therapist card", error); }
      });
    }
  }
  return true;
}

/** Test/UI seam: the cast hook is idempotent per cast id; a fresh world may replay it explicitly. */
export async function syncTherapistCast(actor, receipt, targets = []) {
  return syncCastRiders(actor, receipt, targets);
}

