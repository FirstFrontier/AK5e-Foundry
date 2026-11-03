/**
 * Ward Medic branch runtime (AK5e v1.3.1 Ch. 3 "Ward", C3:5049-5087; owner rulings
 * `ak5e/DECISIONS.md` 2026-10-28 "Ward pool selection"/"Collective Ward ordering" and
 * 2026-11-01 open readings 1 and 4, plus the 2026-11-01 manager adjudication on the
 * owner 1d8, the Treat-the-Cause Reaction warning and plan-function relay validation).
 *
 * Everything numeric lives in the pure `ward-rules.mjs`; this module only reads the live
 * Actor/Item documents, quotes the rules layer, joins the Actor update the play-use engine
 * already records, and keeps provenance plus durable receipts.
 *
 * Table-play policy (WORKFLOW.md §3.2): each use is confirmed once, warnings never block,
 * no die is ever evaluated by the module (every roll is supplied by the owner), every change
 * has an undo path (the play-use receipt), and changes to Creatures the user cannot write go
 * through the Medic play-use GM relay as named operations with validated arguments. Ward
 * defenses are resolved on their card before the damage is applied; a confirmed outcome is
 * consumed synchronously by `dnd5e.preApplyDamage` through `art-correlation.mjs` and is never
 * rolled or reversed there. When the outcome arrives after application the card shows the
 * timing warning and the manual correction.
 *
 * Provenance: this Medic's Ward lives on the recipient as `flags.ak5e.ward`
 * `{ medicUuid, grantedAt, amount, observedTemp }`. The native `system.attributes.hp.temp`
 * remains the only temporary-HP pool (no parallel pool); the tag is reconciled on every
 * relevant native change and cleared on depletion or a non-Ward replacement.
 */
import { medicEnabled, medicLevel, medicBranch, medicSpellDC } from "./medic-rules.mjs";
import { medicUses } from "./medic-uses.mjs";
import { need, opaqueKey, flag } from "./operation-kernel.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { getReactions, setReactionStore, flagReactionStore, onAk5eEvent } from "./trigger-events.mjs";
import { registerDamageResolver } from "./art-correlation.mjs";
import {
  wardGrant as quoteWardGrant,
  choosePool,
  wardOf,
  reconcileTag,
  statusResistance as quoteStatusResistance,
  treatTheCause as quoteTreatTheCause,
  treatTheCauseOutcome,
  wardingSurge as quoteWardingSurge,
  collectiveWardSettlement,
  wardRegeneration as quoteWardRegeneration
} from "./ward-rules.mjs";

/** Provenance flag on the recipient Actor. */
export const WARD_FLAG = "ward";
/** Applied-operation bookkeeping flag used by the Ward target kinds. */
export const WARD_APPLIED_FLAG = "wardApplied";
/** Live Warding-Surge Resistance marker on the protected Actor. */
export const WARD_RESIST_FLAG = "wardResist";
/** Target kinds this branch registers; generic kinds stay untouched. */
export const WARD_TEMP_KIND = "wardTempPool";
export const WARD_RESIST_KIND = "wardResistance";
/** Per-use reading key for Life Support healing (DECISIONS 2026-11-01 #1). */
export const WARD_READING_KEY = "wardLifeSupportReading";
const RESTORE_REACTION_COST = 15;
const WARDING_SURGE_COST = 10;

const clone = value => value === undefined ? undefined : structuredClone(value);
/** Compare persisted JSON objects independently of property insertion order. */
function sameData(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object"
      || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.keys(left).sort(), b = Object.keys(right).sort();
  return a.length === b.length && a.every((key, index) => key === b[index] && sameData(left[key], right[key]));
}
const messageOrigin = message => {
  const origin = message?.flags?.dnd5e?.originatingMessage;
  return typeof origin === "string" && origin.trim() ? origin : null;
};
const currentTurnKey = () => {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return null;
  return `${combat.uuid ?? combat.id ?? "combat"}:${combat.round ?? 0}:${combat.turn ?? 0}`;
};
const ownershipStamp = () => currentTurnKey() ?? `world:${Number(globalThis.game?.time?.worldTime ?? 0)}`;

/** Fallback for a Creature present in the live Actors collection but not indexed by UUID. */
function fromLiveActor(uuid) {
  const key = String(uuid).split(".").at(-1);
  const actors = Array.from(globalThis.game?.actors?.values?.() ?? []);
  return actors.find(actor => actor?.uuid === uuid) ?? actors.find(actor => actor?.id === key || actor?._id === key) ?? null;
}

/** A retried operation ID may only resume its own recorded receipt; an undone use never returns. */
function blockUndoneRetry(state, data) {
  if (typeof data?.retryOf !== "string" || !data.retryOf) return;
  const previous = state?.undo?.find(entry => entry.id === data.retryOf) ?? null;
  need(previous && previous.status !== "undone",
    `The use ${data.retryOf} is no longer available (${previous ? "undone" : "not recorded"}); record a new use instead of retrying it.`);
}

function resolveActor(uuid) {
  if (!uuid) return null;
  const doc = globalThis.fromUuidSync?.(uuid) ?? (String(uuid).includes(".Token.") ? null : fromLiveActor(uuid));
  if (!doc) return null;
  if (doc.documentName === "Token") return baseActor(doc.actor, doc);
  if (doc.documentName === "Actor") return baseActor(doc);
  return null;
}

/** An explicitly unlinked token owns its synthetic Actor; otherwise use its base Actor. */
function baseActor(actor, token = actor?.token) {
  if (!actor || actor.documentName !== "Actor") return actor ?? null;
  if (token?.actorLink !== false && typeof actor.uuid === "string"
      && actor.uuid.includes(".Token.") && typeof actor.id === "string") {
    return globalThis.game?.actors?.get(actor.id) ?? fromLiveActor(actor.id) ?? actor;
  }
  return actor;
}

/* ------------------------------------------------------- strict input gates */

/**
 * DeepSeek-error sweep: every public plan funnels its numeric input through these gates.
 * Booleans, nullish values, objects and blank strings are never silently coerced
 * (`Number(true) === 1` and `Number("") === 0` both hid bugs in the prior candidate);
 * numeric strings from dialogs are accepted, everything else is rejected with a guided
 * `need()` message instead of a raw pure-layer TypeError.
 */
function toNumber(value) {
  if (typeof value === "boolean" || value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** Whole amount, at least `min` (default 0) and at most `max` (default unbounded). */
function needInt(value, message, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = toNumber(value);
  need(Number.isInteger(parsed) && parsed >= min && parsed <= max, message);
  return parsed;
}

/** Non-negative finite number (a save DC or save total); rejects booleans and blanks. */
function needScore(value, message) {
  const parsed = toNumber(value);
  need(Number.isFinite(parsed) && parsed >= 0, message);
  return parsed;
}

/** Distance in feet: null/undefined means unknown, otherwise a finite number >= 0. */
function needDistance(value, message) {
  if (value === null || value === undefined) return null;
  return needScore(value, message);
}

/** Live temporary HP, provenance tag and this Medic's usable Ward on one Creature. */
export function wardView(actor, medic) {
  const temp = Number(actor?.system?.attributes?.hp?.temp ?? 0);
  const tag = flag(actor, WARD_FLAG) ?? null;
  return { temp, tag, ward: wardOf({ temp, tag }, medic?.uuid), own: Boolean(medic?.uuid && tag?.medicUuid === medic.uuid) };
}

const levelWarning = (warnings, actor, required, feature) => {
  const level = medicLevel(actor) ?? 1;
  if (level < required) warn(warnings, "level", `${feature} is a Medic level ${required} feature; this character is level ${level}.`);
};
const branchWarning = (warnings, actor, feature) => {
  const branch = medicBranch(actor);
  if (branch !== "ward") warn(warnings, "branch", `${feature} requires the Ward subclass; this character has ${branch ?? "no branch"}.`);
};

/**
 * The Reaction budget is a replaceable singleton (`trigger-events.mjs`). The Ward uses read it
 * before they start and spend through the play-use receipt, so an unreadable budget is repaired
 * to the canonical flag-backed store first: the use can then record its spend instead of
 * failing half-way. Returns `{ readable, available }` for the warning decision.
 */
function reactionState(actor) {
  try {
    const state = getReactions(actor);
    return { readable: true, available: Number(state?.available ?? 0) };
  } catch (error) {
    try { setReactionStore(flagReactionStore); } catch { /* the canonical store is already installed */ }
    return { readable: false, available: 0, reason: error?.message ?? String(error) };
  }
}
/** Repair an unreadable shared budget before the engine records a Reaction spend. */
function ensureReactionStore() {
  try { getReactions({}); } catch { try { setReactionStore(flagReactionStore); } catch { /* keep going */ } }
}

/* --------------------------------------------------------------- target kinds */

const appliedKey = (source, useId) => opaqueKey(`${useId}:${source.uuid}`);
const appliedRecord = (target, source, useId) => flag(target, WARD_APPLIED_FLAG)?.[appliedKey(source, useId)] ?? null;

/**
 * The recipient's native temporary-HP pool plus this branch's provenance. Never touches hit
 * points, never invents a second pool, and restores the exact prior pool and tag on undo.
 */
const WARD_TARGET_KINDS = {
  [WARD_TEMP_KIND]: {
    async apply(source, useId, entry, target) {
      const done = appliedRecord(target, source, useId);
      if (done) return done;
      const before = {
        temp: Number(target.system?.attributes?.hp?.temp ?? 0),
        tag: clone(flag(target, WARD_FLAG) ?? null)
      };
      if (entry.collectiveBefore) {
        const expected = entry.collectiveBefore;
        need(before.temp === expected.temp && sameData(before.tag, expected.tag),
          `Collective Ward pool changed before commit on ${target.name}: recorded ${expected.temp}, now ${before.temp}. No stale pool was applied; start a fresh use to recalculate any shortfall.`);
      }
      const updates = { "system.attributes.hp.temp": Number(entry.temp ?? 0) };
      // Force-replace, never merge: a foreign provenance record must not keep this branch's fields.
      if (Object.hasOwn(entry, "tag")) updates[`flags.ak5e.==${WARD_FLAG}`] = clone(entry.tag ?? null);
      updates[`flags.ak5e.${WARD_APPLIED_FLAG}.${appliedKey(source, useId)}`] =
        { before, temp: Number(entry.temp ?? 0), changeNote: entry.changeNote ?? null };
      await target.update(updates);
      return { tempBefore: before.temp, temp: Number(entry.temp ?? 0), tag: clone(entry.tag ?? before.tag) };
    },
    async revert(source, useId, _entry, target) {
      const applied = appliedRecord(target, source, useId);
      if (!applied) return { removed: 0 };
      const current = Number(target.system?.attributes?.hp?.temp ?? 0);
      const updates = {
        "system.attributes.hp.temp": applied.before.temp,
        [`flags.ak5e.==${WARD_FLAG}`]: clone(applied.before.tag ?? null),
        [`flags.ak5e.${WARD_APPLIED_FLAG}.-=${appliedKey(source, useId)}`]: null
      };
      await target.update(updates);
      return { removed: applied.temp - applied.before.temp, restoredTemp: applied.before.temp, poolChangedSince: current !== applied.temp };
    },
    preview(source, receipt, entry, target) {
      const applied = appliedRecord(target, source, receipt.id);
      if (!applied) return `${entry.name}: nothing recorded to restore.`;
      const current = Number(target?.system?.attributes?.hp?.temp ?? 0);
      return `${entry.name}: temporary Hit Points back to ${applied.before.temp}${current !== applied.temp ? " (the pool changed since; the recorded prior pool is restored)" : ""}.`;
    }
  },
  /**
   * Warding Surge Resistance: a live marker the synchronous damage resolver reads. Stores the
   * chosen Damage Types and the turn after which they lapse; undo removes the marker.
   */
  [WARD_RESIST_KIND]: {
    async apply(source, useId, entry, target) {
      const done = appliedRecord(target, source, useId);
      if (done) return done;
      const before = clone(flag(target, WARD_RESIST_FLAG) ?? null);
      const marker = { types: clone(entry.types ?? []), until: entry.until ?? null, medicUuid: source.uuid, useId };
      await target.update({
        [`flags.ak5e.==${WARD_RESIST_FLAG}`]: marker,
        [`flags.ak5e.${WARD_APPLIED_FLAG}.${appliedKey(source, useId)}`]: { before, marker }
      });
      return { types: marker.types, until: marker.until };
    },
    async revert(source, useId, _entry, target) {
      const applied = appliedRecord(target, source, useId);
      if (!applied) return { removed: 0 };
      await target.update({
        [`flags.ak5e.==${WARD_RESIST_FLAG}`]: clone(applied.before ?? null),
        [`flags.ak5e.${WARD_APPLIED_FLAG}.-=${appliedKey(source, useId)}`]: null
      });
      return { removed: 1 };
    },
    preview(source, receipt, entry, target) {
      const applied = appliedRecord(target, source, receipt.id);
      return applied ? `${entry.name}: removes the Warding Surge Resistance.` : `${entry.name}: the Resistance is already gone.`;
    }
  }
};

/* ------------------------------------------------------------------- plans */

const WARD_PLANS = {
  /**
   * F1: the owner replaces an already-rolled healing amount with Ward temporary HP.
   * `healingAmount` is the amount the owner rolled (never evaluated here). The Additional
   * Temporary Hit Points die is included when the caller states the grant came from an Action
   * or Bonus Action (`extraTempHP`) and supplies the owner's own d8 result.
   */
  wardGrant(actor, state, data = {}) {
    need(medicEnabled(actor), "Ward is a Medic branch feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Ward (Prevention, not Cure)");

    const healing = needInt(data.healingAmount ?? 0,
      "Choose the whole amount of rolled healing (0 or more) that becomes Ward Temporary Hit Points.");
    const actionType = data.actionType ?? "action";
    need(["action", "bonus", "reaction", "other"].includes(actionType),
      "Choose the grant's casting time: action, bonus, reaction or other.");
    const fromArt = data.fromArt === true;
    const apSpent = needInt(data.apSpent ?? 0, "Arts Points spent must be a whole number (0 or more).");
    const quote = quoteWardGrant({ healingAmount: healing, actionType, fromArt, apSpent });
    let die = 0;
    if (data.extraTempHP === true && quote.dieFormula) {
      die = needInt(data.ownerRoll1d8,
        `Roll ${quote.dieFormula} for the Additional Temporary Hit Points and enter the owner's result (1-8).`,
        { min: 1, max: 8 });
    }
    const amount = quote.base + quote.apBonus + die;

    // A target that no longer resolves is recorded for manual application; it is never a
    // blocking warning, and nothing is written to an unknown Creature.
    const target = resolveActor(data.targetUuid);
    const pool = target ? quotePool(target, actor, amount, data) : null;

    const dieText = die > 0 ? ` + ${quote.dieFormula} ${die}` : "";
    const apText = quote.apBonus > 0 ? ` + ${quote.apBonus} Arts Points` : "";
    return {
      warnings,
      title: "Ward: convert healing",
      previewTargets: target ? [{ uuid: target.uuid, name: target.name }] : [],
      validateTarget(source, receipt, entry, targetDoc) {
        return wardTempEntryValid(receipt, entry, targetDoc);
      },
      async apply(state, receipt) {
        const summary = `${actor.name} converts ${quote.base} rolled healing${dieText}${apText} into ${amount} Ward Temporary Hit Points for ${target?.name ?? "the chosen Creature"}.`;
        receipt.targets = [];
        if (target && pool) {
          receipt.targets = [{ kind: WARD_TEMP_KIND, uuid: target.uuid, name: target.name, key: "ward", temp: pool.temp, tag: pool.tag, ready: true }];
        }
        receipt.summary = withPoolNote(summary, pool, amount);
        receipt.manualSteps = target ? [] : [`Select the Creature and set its Temporary Hit Points to ${amount}; record the Ward provenance ${actor.name}.`];
        receipt.result = {
          targetUuid: target?.uuid ?? null,
          amount,
          base: quote.base,
          die: die || null,
          apBonus: quote.apBonus,
          temp: pool?.temp ?? null,
          kept: pool?.kept ?? false,
          pooled: pool?.pooled ?? false,
          formula: [String(quote.base), ...(die > 0 ? [quote.dieFormula] : []), ...(quote.apBonus > 0 ? [String(quote.apBonus)] : [])].join(" + "),
          receipt: {
            summary: receipt.summary,
            warnings: pool?.notes ?? [],
            manualSteps: receipt.manualSteps
          }
        };
        return {};
      }
    };
  },

  /**
   * F2: Life Support healing can be offered as Ward per use (DECISIONS 2026-11-01 #1). The
   * reading is chosen for this use only, printed on the card, and never stored as a GM ruling.
   */
  wardLifeSupport(actor, state, data = {}) {
    need(medicEnabled(actor), "Ward is a Medic branch feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Ward (Prevention, not Cure)");

    const amount = needInt(data.amount ?? 0, "Choose a whole number of Life Support to spend (0 or more).");
    const available = resourceValue(actor, { pool: "lifeSupport" });
    if (available < amount) {
      warn(warnings, "lifeSupport", `${amount} Life Support needed and ${available} remain; Life Support clamps at 0.`);
    }

    const actionType = data.actionType ?? "action";
    need(["action", "bonus", "reaction", "other"].includes(actionType),
      "Choose the casting time: action, bonus, reaction or other.");
    const quote = quoteWardGrant({ healingAmount: Math.min(amount, available), actionType, fromArt: false, apSpent: 0 });
    let die = 0;
    if (quote.dieFormula && data.ownerRoll1d8 !== undefined) {
      die = needInt(data.ownerRoll1d8,
        `Roll ${quote.dieFormula} for the Additional Temporary Hit Points and enter the owner's result (1-8).`,
        { min: 1, max: 8 });
    }
    const wardAmount = Math.min(amount, available) + die;

    const target = resolveActor(data.targetUuid);
    const pool = target ? quotePool(target, actor, wardAmount, data) : null;

    return {
      warnings,
      title: "Ward: Life Support healing",
      reading: WARD_READING_KEY,
      previewTargets: target ? [{ uuid: target.uuid, name: target.name }] : [],
      validateTarget(source, receipt, entry, targetDoc) {
        return wardTempEntryValid(receipt, entry, targetDoc);
      },
      async apply(state, receipt, reading) {
        // F2 / open reading 1 (2026-11-01): the default literal reading covers only rolled
        // healing. Life Support touch heal is unrolled, so under "rolledOnly" it cannot
        // become Ward at all — reject with guidance instead of converting it anyway.
        need(reading !== "rolledOnly",
          "The selected reading (only rolled healing can become Ward) does not cover Life Support healing: choose the Life Support reading for this use, or use Touch Heal for ordinary healing.");
        needInt(amount, "Choose a whole number of Life Support to spend (1 or more).", { min: 1 });
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount, label: "Life Support" });
        const spent = Math.min(amount, available);
        const dieText = die > 0 ? ` + ${quote.dieFormula} ${die}` : "";
        const readingText = reading === "rolledOnly"
          ? `Reading (this use only): only rolled healing becomes Ward; the ${spent} Life Support heal is converted as the rolled amount for this use.`
          : `Reading (this use only): Life Support healing can become Ward.`;
        const summary = `${actor.name} expends ${spent} Life Support and grants ${wardAmount} Ward Temporary Hit Points to ${target?.name ?? "the chosen Creature"}${dieText}. ${readingText}`;
        receipt.targets = [];
        if (target && pool) {
          receipt.targets = [{ kind: WARD_TEMP_KIND, uuid: target.uuid, name: target.name, key: "ward", temp: pool.temp, tag: pool.tag, ready: true }];
        }
        receipt.summary = withPoolNote(summary, pool, wardAmount);
        receipt.result = {
          targetUuid: target?.uuid ?? null,
          spentLS: spent,
          amount: wardAmount,
          temp: pool?.temp ?? null,
          kept: pool?.kept ?? false,
          reading: reading ?? null,
          receipt: { summary: receipt.summary, warnings: pool?.notes ?? [], manualSteps: [] }
        };
        return updates;
      }
    };
  },

  /** F5: the first status-condition save of each combat turn has Advantage on the card. */
  statusResistance(actor, state, data = {}) {
    need(medicEnabled(actor), "Status Resistance is a Ward feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Status Resistance");
    levelWarning(warnings, actor, 4, "Status Resistance");

    const target = resolveActor(data.targetUuid);
    if (!target) warn(warnings, "target", "No Creature with this Medic's Ward was chosen.");
    const view = target ? wardView(target, actor) : { ward: 0, own: false };
    if (target && !view.own) warn(warnings, "ward", `${target.name} does not have this Medic's Ward.`);

    const rawTurn = data.turnKey === undefined ? currentTurnKey() : data.turnKey;
    const turnKey = rawTurn === undefined ? null : rawTurn;
    if (turnKey !== null) {
      need(typeof turnKey === "string" && turnKey.length > 0,
        "The combat Turn key must be text (combat:round:turn), or omitted outside combat.");
    }
    const used = target ? state?.data?.wardStatusSave?.[target.uuid] ?? null : null;
    const quote = quoteStatusResistance({
      hasWard: view.own,
      savingVsStatusCondition: data.savingAgainstStatus !== false,
      turnKey,
      usedTurnKey: used
    });
    if (!quote.advantage && quote.usedTurnKey) {
      warn(warnings, "used", `The first Status Condition save of this turn has already been marked as Advantageous for ${target?.name ?? "the Creature"}.`);
    }
    if (turnKey === null) {
      warn(warnings, "noTurn", "Outside combat there is no Turn: the Advantage is not consumed automatically.");
    }

    return {
      warnings,
      title: "Status Resistance",
      previewTargets: target ? [{ uuid: target.uuid, name: target.name }] : [],
      async apply(state, receipt) {
        if (target && quote.usedTurnKey) {
          state.data = { ...(state.data ?? {}) };
          state.data.wardStatusSave = { ...(state.data.wardStatusSave ?? {}), [target.uuid]: quote.usedTurnKey };
        }
        receipt.summary = quote.advantage
          ? `Status Resistance: ${target?.name ?? "The Creature"} has Advantage on this Saving Throw against a Status Condition (first this Turn, usedTurnKey ${quote.usedTurnKey ?? "outside combat"}).`
          : `Status Resistance: ${target?.name ?? "The Creature"} makes this Saving Throw normally; this Turn's first Status Condition save already used the Advantage.`;
        receipt.result = {
          targetUuid: target?.uuid ?? null,
          advantage: quote.advantage,
          usedTurnKey: quote.usedTurnKey,
          turnKey,
          receipt: { summary: receipt.summary, warnings: [], manualSteps: [], usedTurnKey: quote.usedTurnKey ?? null }
        };
        return {};
      }
    };
  },

  /**
   * F6: Treat the Cause. The attacker's Dexterity save and the 2d10 Force damage are the
   * owner's rolls (never evaluated here); a failed save binds a source-bound forced miss.
   */
  treatTheCause(actor, state, data = {}) {
    need(medicEnabled(actor), "Treat the Cause is a Ward feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Treat the Cause, not the Symptom");
    levelWarning(warnings, actor, 7, "Treat the Cause, not the Symptom");

    const target = resolveActor(data.targetUuid);
    if (!target) warn(warnings, "target", "No warded Creature was chosen for Treat the Cause.");
    const attackerUuid = data.attackerUuid ?? null;
    if (attackerUuid !== null) {
      need(typeof attackerUuid === "string" && attackerUuid.length > 0,
        "The attacking Creature reference must be a uuid string.");
    }
    const attacker = resolveActor(attackerUuid);
    if (!attacker) warn(warnings, "attacker", "The attacking Creature is unknown; record the save and damage on the card.");
    const view = target ? wardView(target, actor) : { own: false };
    const reactions = reactionState(actor);
    const dc = data.saveDC === undefined ? medicSpellDC(actor) : needScore(data.saveDC,
      "The Spell Save DC must be a number (0 or more).");
    const restoreReaction = data.restoreReaction === true;
    const distance = needDistance(data.attackerDistanceFeet,
      "The attacker's distance must be a number of feet (0 or more), or left blank when unknown.");
    // F6 attack binding: the triggering attack card's message UUID lets the synchronous
    // resolver correlate the confirmed forced miss to that exact attack. Blank stays
    // supported (manual application), but the card then says so explicitly.
    const attackMessageUuid = data.attackMessageUuid ?? null;
    if (attackMessageUuid !== null) {
      need(typeof attackMessageUuid === "string" && attackMessageUuid.length > 0,
        "The triggering attack card reference must be a message uuid string, or left blank when unknown.");
    }

    const quote = quoteTreatTheCause({
      targetHasWard: view.own,
      attackerDistanceFeet: distance,
      reactionAvailable: reactions.readable && reactions.available > 0,
      saveDC: dc
    });
    for (const code of quote.warnings) {
      if (code === "targetHasNoWard") warn(warnings, "ward", `${target?.name ?? "The Creature"} does not have this Medic's Ward.`);
      else if (code === "attackerRangeUnknown") warn(warnings, "range", "The attacker's distance is unknown; confirm it is within 30 feet of the warded Creature.");
      else if (code === "attackerOutOfRange") warn(warnings, "range", `The attacker is ${distance} feet away; Treat the Cause reaches 30 feet.`);
      else if (code === "noReaction" && !restoreReaction) {
        // No Reaction to spend (or an unreadable budget) is guided, never silently assumed:
        // the table can still use the feature ("Use anyway"). Paying 15 Life Support to restore
        // the Reaction means this use never spends one, so it needs no warning.
        warn(warnings, "noReaction", reactions.readable
          ? "No Reaction remains; use the feature anyway if the table has a Reaction to spend."
          : "The Reaction budget could not be read; confirm the Reaction is available before using Treat the Cause.");
      }
    }
    const lifeSupport = resourceValue(actor, { pool: "lifeSupport" });
    if (restoreReaction && lifeSupport < RESTORE_REACTION_COST) {
      warn(warnings, "lifeSupport", `${RESTORE_REACTION_COST} Life Support needed to restore the Reaction and ${lifeSupport} remain; Life Support clamps at 0.`);
    }

    const damageRoll = needInt(data.ownerRoll2d10,
      "Enter the owner's 2d10 Force damage roll (a whole number, 0 or more).");
    const saveRollRaw = data.ownerRollDexSave ?? data.ownerReactionDexSave;
    const saveRoll = saveRollRaw === undefined || saveRollRaw === null ? null : needScore(saveRollRaw,
      "The owner's Dexterity save total must be a number (0 or more).");
    const saveSucceeded = saveRoll === null ? null : saveRoll >= dc;
    const outcome = saveSucceeded === null
      ? { damage: damageRoll, forcedMiss: false, pending: true }
      : treatTheCauseOutcome({ saveSucceeded, damageRolled: damageRoll });
    const late = data.lateApplication === true;

    return {
      warnings,
      title: "Treat the Cause, not the Symptom",
      previewTargets: attacker ? [{ uuid: attacker.uuid, name: attacker.name }] : [],
      validateTarget(source, receipt, entry, targetDoc) {
        return Boolean(targetDoc && entry.kind === "damage" && Number(entry.amount) <= Number(receipt?.result?.damage ?? 0));
      },
      async apply(state, receipt) {
        const updates = {};
        if (restoreReaction) {
          Object.assign(updates, spendResource(actor, receipt, { pool: "lifeSupport", amount: RESTORE_REACTION_COST, label: "Life Support" }));
        } else {
          ensureReactionStore();
          receipt.reaction = { requested: true, triggerId: `ward-treat-${receipt.id}`, receipt: `playuse_ward_${receipt.id}` };
        }
        const reactionText = restoreReaction
          ? ` ${RESTORE_REACTION_COST} Life Support restores the Reaction (no Reaction is spent by this use).`
          : "";
        const damage = outcome.damage;
        const parts = [
          `${actor.name} uses Treat the Cause: ${attacker?.name ?? "the attacker"} makes a DC ${dc} Dexterity save`,
          saveRoll === null ? "(owner resolution pending)" : `(rolled ${saveRoll}: ${saveSucceeded ? "success" : "failure"})`,
          `and takes ${damage} Force Damage from the owner's 2d10 (${damageRoll}).`
        ];
        if (saveSucceeded === false) parts.push(`The Attack misses ${target?.name ?? "the warded Creature"} regardless of its roll (source-bound forced miss).`);
        else if (saveSucceeded === true) parts.push(`Half damage and no other effect; the Attack is unaffected.`);
        parts.push(reactionText.trim());
        receipt.summary = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        receipt.manualSteps = [];
        if (attackMessageUuid === null) {
          receipt.manualSteps.push(
            "No triggering attack card is bound to this use: apply the source-bound forced miss to the triggering attack manually with the native controls.");
        }
        if (!attacker) {
          receipt.manualSteps.push(
            `Apply ${damage} Force Damage to the attacking Creature with the native damage controls; it is not recorded here because the attacker is unknown.`);
        }
        if (saveSucceeded === null) {
          receipt.manualSteps.push(
            "The attacker's Dexterity save is unresolved: record the owner's roll, then apply the full 2d10 on a failure (the Attack misses) or half on a success.");
        }
        if (late) {
          receipt.manualSteps.push(
            "Timing warning: this defense was resolved after the damage had already been applied.",
            "Do not reverse the applied damage; correct the affected Creature's Hit Points manually."
          );
        }
        receipt.targets = [];
        if (attacker && saveSucceeded !== null && damage >= 0 && globalThis.fromUuidSync?.(attacker.uuid)) {
          receipt.targets = [{
            kind: "damage", uuid: attacker.uuid, name: attacker.name, amount: damage,
            damageType: "force", key: "attacker", ready: true
          }];
        }
        // The receipt is the durable, synchronized source of truth for this attack.
        // A late defense is manual only and must not alter a later application.
        receipt.wardCorrelation = attackMessageUuid && target && !late ? {
          messageUuid: attackMessageUuid,
          originatingMessage: messageOrigin(globalThis.fromUuidSync?.(attackMessageUuid)),
          targetUuid: target.uuid,
          forcedMiss: outcome.forcedMiss === true, damage, saveSucceeded
        } : null;
        receipt.result = {
          targetUuid: target?.uuid ?? null,
          attackerUuid: attacker?.uuid ?? null,
          saveSucceeded,
          saveTotal: saveRoll,
          dc,
          damage,
          formula: "2d10",
          forcedMiss: outcome.forcedMiss === true,
          halved: saveSucceeded === true,
          late,
          receipt: { summary: receipt.summary, warnings: [], manualSteps: receipt.manualSteps }
        };
        return updates;
      }
    };
  },

  /** F7: Warding Surge — 10 Life Support for Resistance to the triggering Damage Types. */
  wardingSurge(actor, state, data = {}) {
    need(medicEnabled(actor), "Warding Surge is a Ward feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Warding Surge");
    levelWarning(warnings, actor, 11, "Warding Surge");

    const target = resolveActor(data.targetUuid);
    if (!target) warn(warnings, "target", "No warded Creature was chosen for Warding Surge.");
    const view = target ? wardView(target, actor) : { own: false };
    const rawTypes = data.damageTypes;
    need(rawTypes === undefined || Array.isArray(rawTypes), "Triggering Damage Types must be a list of Damage type names.");
    const types = (Array.isArray(rawTypes) ? rawTypes : []).filter(type => typeof type === "string" && type);
    if (!types.length) warn(warnings, "damageTypes", "Choose the Damage Types of the triggering Damage.");

    // W2F-1: the live Reaction budget is threaded here — never a hardcoded
    // `reactionAvailable: true`, so the noReaction branch is reachable and the
    // exhausted-reaction table still has to opt in explicitly. The store is repaired
    // first (the same repair the apply path already performs): a corrupted or
    // unreadable store resolves to the canonical flag-backed budget, and the warning
    // then fires exactly when the live budget is exhausted. Treat the Cause keeps its
    // adjudicated read-first order; this plan must not warn when the harness hands it
    // a replaced store that the canonical budget reports as available.
    ensureReactionStore();
    const reactions = reactionState(actor);
    const lifeSupport = resourceValue(actor, { pool: "lifeSupport" });
    const restoreReaction = data.restoreReaction === true;
    const quote = quoteWardingSurge({
      targetHasWard: view.own,
      reactionAvailable: reactions.readable && reactions.available > 0,
      lifeSupport,
      damageTypes: types
    });
    for (const code of quote.warnings) {
      if (code === "targetHasNoWard") warn(warnings, "ward", `${target?.name ?? "The Creature"} does not have this Medic's Ward.`);
      else if (code === "lifeSupportShort") warn(warnings, "lifeSupportShort", `${WARDING_SURGE_COST} Life Support needed and ${lifeSupport} remain; Life Support clamps at 0.`);
      else if (code === "noReaction" && !restoreReaction) {
        warn(warnings, "noReaction", reactions.readable
          ? "No Reaction remains; use the feature anyway if the table has a Reaction to spend."
          : "The Reaction budget could not be read; confirm the Reaction is available before using Warding Surge.");
      }
    }
    if (restoreReaction && lifeSupport < WARDING_SURGE_COST + RESTORE_REACTION_COST) {
      warn(warnings, "lifeSupportShort", `${WARDING_SURGE_COST + RESTORE_REACTION_COST} Life Support needed for the Surge and its Reaction restore; ${lifeSupport} remain.`);
    }
    const until = currentTurnKey();

    return {
      warnings,
      title: "Warding Surge",
      previewTargets: target ? [{ uuid: target.uuid, name: target.name }] : [],
      validateTarget(source, receipt, entry, targetDoc) {
        return surgeEntryValid(receipt, entry, targetDoc);
      },
      async apply(state, receipt) {
        ensureReactionStore();
        // One merged spend: two same-key spendResource updates would overwrite each other
        // (the second is computed from the pre-use pool), persisting 85 instead of 75.
        const totalCost = WARDING_SURGE_COST + (restoreReaction ? RESTORE_REACTION_COST : 0);
        const updates = spendResource(actor, receipt, { pool: "lifeSupport", amount: totalCost, label: "Life Support" });
        if (!restoreReaction) {
          receipt.reaction = { requested: true, triggerId: `ward-surge-${receipt.id}`, receipt: `playuse_ward_${receipt.id}` };
        }
        const restoredText = restoreReaction ? ` ${RESTORE_REACTION_COST} Life Support restores the Reaction.` : "";
        receipt.targets = [];
        if (target) {
          receipt.targets = [{
            kind: WARD_RESIST_KIND, uuid: target.uuid, name: target.name, key: "resist",
            types: quote.resistTypes, until, ready: true
          }];
        }
        receipt.summary = `${actor.name} expends ${WARDING_SURGE_COST} Life Support: ${target?.name ?? "the Creature"} has Resistance to ${quote.resistTypes.join(", ") || "the chosen Damage Types"} until the end of the current Turn.${restoredText}`;
        receipt.result = {
          targetUuid: target?.uuid ?? null,
          resistTypes: quote.resistTypes,
          cost: WARDING_SURGE_COST,
          expires: "endOfCurrentTurn",
          until,
          lifeSupportAfter: Math.max(0, lifeSupport - WARDING_SURGE_COST - (restoreReaction ? RESTORE_REACTION_COST : 0)),
          restoredReaction: restoreReaction,
          receipt: { summary: receipt.summary, warnings: [], manualSteps: [] }
        };
        return updates;
      }
    };
  },

  /**
   * F8: Collective Ward — consume this Medic's Ward from other Creatures within 30 feet
   * (after DR/Resistance, before the recipient's temporary HP), never transferring it.
   */
  collectiveWard(actor, state, data = {}) {
    need(medicEnabled(actor), "Collective Ward is a Ward feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Collective Ward");
    levelWarning(warnings, actor, 15, "Community Care (Collective Ward)");

    const target = resolveActor(data.targetUuid);
    if (!target) warn(warnings, "target", "No warded Creature was chosen for Collective Ward.");
    const view = target ? wardView(target, actor) : { temp: 0, tag: null, own: false };
    const damage = needInt(data.damage ?? 0,
      "Enter the Damage remaining after Damage Reduction and Resistance (a whole number, 0 or more).");

    if (data.donors !== undefined) {
      need(Array.isArray(data.donors), "Collective Ward donors must be a list of Creatures.");
    }
    const listed = Array.isArray(data.donors) ? data.donors : [];
    // A donor uuid contains dots, and Foundry expands dotted keys when a receipt is stored in a
    // flag. Removals are therefore accepted under the opaque key (what the sheet sends) as well as
    // under the raw uuid (a direct API call), and normalised to the uuid for the settlement.
    const rawRemovals = data.removals === undefined || data.removals === null ? {} : data.removals;
    need(rawRemovals && typeof rawRemovals === "object" && !Array.isArray(rawRemovals),
      "Collective Ward removals must map each donor to a whole number of Ward.");
    const requestedFor = uuid => {
      if (Object.hasOwn(rawRemovals, uuid)) return needInt(rawRemovals[uuid],
        `Choose a whole number of Ward to remove from ${uuid} (0 or more).`);
      const key = opaqueKey(String(uuid));
      if (Object.hasOwn(rawRemovals, key)) return needInt(rawRemovals[key],
        `Choose a whole number of Ward to remove from ${uuid} (0 or more).`);
      return 0;
    };
    // W2F-3: donor uuids are normalised unique at plan time. A direct-API caller that lists
    // the same Creature twice must not spend its Ward twice, and an unknown removal key
    // (neither a listed uuid nor its opaque form) is a caller bug, never a silent drop.
    const donors = [];
    const seenDonors = new Set();
    const knownRemovalKeys = new Set();
    for (const candidate of listed) {
      const uuid = candidate?.uuid;
      need(typeof uuid === "string" && uuid.length > 0,
        "Each Collective Ward donor needs its Creature uuid; start a new Collective Ward use.");
      knownRemovalKeys.add(uuid);
      knownRemovalKeys.add(opaqueKey(uuid));
      if (seenDonors.has(uuid)) continue; // first listing wins; one Creature, one Ward pool
      seenDonors.add(uuid);
      const doc = resolveActor(uuid);
      if (!doc) {
        need(false, `The donor Creature ${uuid} no longer exists; start a new Collective Ward use.`);
      }
      // Fresh, actual donor pools only: a spent or undone donor is never re-spent by a retry.
      const fresh = wardView(doc, actor);
      const requested = requestedFor(uuid);
      const distanceFeet = needDistance(candidate?.distanceFeet,
        `The distance for donor ${doc.name} must be a number of feet (0 or more), or left blank when unknown.`);
      if (requested > 0 && fresh.ward <= 0) {
        need(false, `${doc.name} no longer has this Medic's Ward available (0 Ward in a fresh pool); start a new Collective Ward use.`);
      }
      if (requested > fresh.ward) {
        warn(warnings, "removalExceedsWard", `${doc.name} has ${fresh.ward} Ward; the removal is limited to that amount.`);
      }
      need(doc.uuid !== target?.uuid, "The Collective Ward recipient cannot also be a donor.");
      if (donors.some(donor => donor.uuid === doc.uuid)) continue;
      donors.push({ uuid: doc.uuid, name: doc.name, ward: fresh.ward, requested, distanceFeet, doc, before: fresh });
    }
    for (const key of Object.keys(rawRemovals)) {
      need(knownRemovalKeys.has(key),
        `Removal ${key} does not name a listed Collective Ward donor; donor uuids must be unique and listed.`);
    }
    const removals = {};
    for (const donor of donors) removals[donor.uuid] = donor.requested;
    const recipientDistanceFeet = needDistance(data.recipientDistanceFeet,
      "The recipient's distance must be a number of feet (0 or more), or left blank when unknown.");
    const settled = collectiveWardSettlement({
      damage,
      recipientTemp: Math.max(0, Number(view.temp ?? 0)),
      recipientHasWard: view.own,
      recipientDistanceFeet,
      donors: donors.map(donor => ({ uuid: donor.uuid, ward: donor.ward, distanceFeet: donor.distanceFeet })),
      removals
    });
    const warningText = {
      recipientHasNoWard: `${target?.name ?? "The recipient"} does not have this Medic's Ward.`,
      recipientOutOfRange: `The recipient is beyond the 30-foot Collective Ward range.`,
      donorRangeUnknown: "A donor's distance is unknown; confirm it is within 30 feet of the Medic.",
      donorOutOfRange: "A donor is beyond the 30-foot Collective Ward range.",
      removalExceedsWard: "A removal was limited to the donor's actual Ward.",
      wardWasted: "Ward removed beyond the remaining Damage is wasted; it is never stored or transferred."
    };
    for (const code of settled.warnings) warn(warnings, code, warningText[code] ?? code);
    const recipientTemp = Math.max(0, Number(view.temp ?? 0) - settled.tempAbsorbed);
    const recipientTag = view.tag ? reconcileTag({ tempBefore: Math.max(0, Number(view.temp ?? 0)), tempAfter: recipientTemp, tag: view.tag }) : null;

    return {
      warnings,
      title: "Collective Ward",
      previewTargets: [...donors.map(donor => ({ uuid: donor.uuid, name: donor.name })), ...(target ? [{ uuid: target.uuid, name: target.name }] : [])],
      validateTarget(source, receipt, entry, targetDoc) {
        return collectiveEntryValid(receipt, entry, targetDoc);
      },
      async apply(state, receipt) {
        receipt.targets = [];
        const updatesByUuid = new Map(settled.donorUpdates.map(update => [update.uuid, update]));
        for (const donor of donors) {
          const update = updatesByUuid.get(donor.uuid);
          if (!update || update.wardAfter === update.wardBefore) continue;
          const tag = update.wardAfter > 0
            ? { ...(donor.before.tag ?? { medicUuid: actor.uuid }), medicUuid: actor.uuid, amount: update.wardAfter, observedTemp: update.wardAfter }
            : null;
          receipt.targets.push({
            kind: WARD_TEMP_KIND, uuid: donor.uuid, name: donor.name, key: `donor-${donor.uuid}`,
            temp: update.wardAfter, tag, ready: true,
            collectiveBefore: { temp: donor.before.temp, tag: clone(donor.before.tag) }
          });
        }
        if (target && settled.tempAbsorbed > 0) {
          receipt.targets.push({
            kind: WARD_TEMP_KIND, uuid: target.uuid, name: target.name, key: "recipient",
            temp: recipientTemp, tag: recipientTag, ready: true,
            collectiveBefore: { temp: view.temp, tag: clone(view.tag) }
          });
        }
        const donorText = settled.donorUpdates.length
          ? settled.donorUpdates.map(update => `${update.wardBefore - update.wardAfter} from ${donors.find(d => d.uuid === update.uuid)?.name ?? update.uuid}`).join(", ")
          : "none";
        receipt.summary = `${actor.name} uses Collective Ward: ${settled.removed} Ward removed (${donorText}); Damage ${damage} becomes ${settled.damageAfterWard} after Ward, ${settled.tempAbsorbed} is absorbed by ${target?.name ?? "the recipient"}'s Temporary Hit Points, leaving ${settled.hpLoss} Hit Points of Damage for the native damage controls.`;
        receipt.manualSteps = settled.hpLoss > 0
          ? [`Apply ${settled.hpLoss} Hit Points of Damage to ${target?.name ?? "the recipient"} with the native damage controls; Ward only reduced the Damage.`]
          : [];
        receipt.result = {
          targetUuid: target?.uuid ?? null,
          damage,
          removed: settled.removed,
          damageAfterWard: settled.damageAfterWard,
          tempAbsorbed: settled.tempAbsorbed,
          recipientTempBefore: Math.max(0, Number(view.temp ?? 0)),
          recipientTempAfter: recipientTemp,
          hpLoss: settled.hpLoss,
          wasted: settled.wasted,
          donorUpdates: settled.donorUpdates,
          receipt: { summary: receipt.summary, warnings: [], manualSteps: receipt.manualSteps }
        };
        return {};
      }
    };
  },

  /** F9: Ward Regeneration at the start of the Medic's own Turn without their Ward. */
  wardRegeneration(actor, state, data = {}) {
    need(medicEnabled(actor), "Ward Regeneration is a Ward feature.");
    blockUndoneRetry(state, data);
    const warnings = [];
    branchWarning(warnings, actor, "Ward Regeneration");
    levelWarning(warnings, actor, 15, "Community Care (Ward Regeneration)");

    const target = resolveActor(data.targetUuid) ?? actor;
    const view = wardView(target, actor);
    const level = medicLevel(actor) ?? 1;
    const quote = quoteWardRegeneration({ medicLevel: level, hasOwnWard: view.own, currentTemp: view.temp });

    const combat = globalThis.game?.combat;
    const turnKey = currentTurnKey();
    if (turnKey && state?.undo?.some(receipt => receipt.command === "wardRegeneration"
        && receipt.status !== "undone" && receipt.wardRegenerationTurnKey === turnKey
        && receipt.result?.eligible === true)) {
      warn(warnings, "alreadyUsed", "Ward Regeneration was already used this Turn; use again only as a manual table correction.");
    }
    const currentUuid = combat?.combatant?.actor?.uuid ?? combat?.current?.actorUuid
      ?? combat?.current?.actor?.uuid ?? null;
    const offered = data.turnStart === true;
    const currentOffer = offered && typeof data.offerTurnKey === "string"
      && turnKey !== null && data.offerTurnKey === turnKey && currentUuid === actor.uuid;
    const knownTurn = turnKey !== null && typeof currentUuid === "string" && currentUuid.length > 0;
    if ((offered && !currentOffer) || (!offered && knownTurn && currentUuid !== actor.uuid)) {
      warn(warnings, "notTurnStart", offered
        ? "This Ward Regeneration offer is stale or no longer on the Medic's own Turn; use anyway only as a manual table correction."
        : "It is not the Medic's own Turn; Ward Regeneration applies at its start. Use anyway only as a table correction.");
    }
    const offTurnNote = !offered && !knownTurn
      ? "Used outside an encounter turn; confirm this was the start of the Medic's own Turn." : null;

    if (!quote.eligible) {
      warn(warnings, "notEligible", view.own
        ? `${actor.name} already has their own Ward; Ward Regeneration does not apply.`
        : `Ward Regeneration needs a Medic level of 15; this character is level ${level}.`);
    }
    if (quote.warnings.includes("replacesOtherTemp")) {
      warn(warnings, "otherTemp", `${target.name} has ${view.temp} Temporary Hit Points from another source; keeping or replacing them is the owner's explicit choice.`);
    }
    const pool = quote.eligible ? quotePool(target, actor, quote.amount, data) : null;

    return {
      warnings,
      title: "Ward Regeneration",
      previewTargets: target ? [{ uuid: target.uuid, name: target.name }] : [],
      validateTarget(source, receipt, entry, targetDoc) {
        return wardTempEntryValid(receipt, entry, targetDoc);
      },
      async apply(state, receipt) {
        receipt.targets = [];
        if (pool) {
          receipt.targets = [{ kind: WARD_TEMP_KIND, uuid: target.uuid, name: target.name, key: "ward", temp: pool.temp, tag: pool.tag, ready: true }];
        }
        const status = quote.eligible
          ? `${target.name} is eligible for Ward Regeneration (no own Ward at the start of the Turn) and gains ${quote.amount} Ward Temporary Hit Points.`
          : `Ward Regeneration skipped: ${view.own ? "the Medic already has their own Ward" : `Medic level ${level} is below 15`}.`;
        receipt.summary = withPoolNote(status, pool, quote.amount);
        receipt.wardRegenerationTurnKey = turnKey;
        receipt.manualSteps = offTurnNote ? [offTurnNote] : [];
        receipt.result = {
          targetUuid: target.uuid,
          eligible: quote.eligible,
          amount: quote.amount,
          temp: pool?.temp ?? view.temp,
          kept: pool?.kept ?? false,
          receipt: { summary: receipt.summary, warnings: [status], manualSteps: receipt.manualSteps }
        };
        return {};
      }
    };
  },

  /**
   * A replacement pool posted by another source: records the foreign provenance with visible
   * context so this Medic's Ward cannot be assumed to persist. Used when the table applies a
   * temporary-HP change that did not come from this branch.
   */
  reapplyForeignPool(actor, state, data = {}) {
    need(medicEnabled(actor), "This command belongs to the Ward Medic.");
    blockUndoneRetry(state, data);
    const target = resolveActor(data.targetUuid);
    need(target, "The Creature with the replacement Temporary Hit Points was not found.");
    const foreign = data.foreign;
    need(foreign && typeof foreign === "object" && !Array.isArray(foreign)
      && typeof foreign.medicUuid === "string" && foreign.medicUuid,
      "A temporary-HP pool needs its originating source recorded.");
    const amount = needInt(foreign.amount, "The replacement Temporary Hit Points must be a whole number (0 or more).");
    const grantedAt = data.foreign?.grantedAt ?? foreign.grantedAt ?? ownershipStamp();
    need(typeof grantedAt === "string" && grantedAt.length > 0, "The replacement pool needs its grant record.");
    const tag = { medicUuid: foreign.medicUuid, grantedAt, amount, observedTemp: amount };
    const warnings = [];

    return {
      warnings,
      title: "Ward provenance: foreign pool",
      previewTargets: [{ uuid: target.uuid, name: target.name }],
      validateTarget(source, receipt, entry, targetDoc) {
        return wardTempEntryValid(receipt, entry, targetDoc, receipt?.result?.amount);
      },
      async apply(state, receipt) {
        receipt.targets = [{ kind: WARD_TEMP_KIND, uuid: target.uuid, name: target.name, key: "foreign", temp: amount, tag, ready: true }];
        receipt.summary = `${foreign.medicUuid} replaces the Temporary Hit Points on ${target.name} with ${amount}; ${actor.name}'s Ward no longer applies to that pool.`;
        receipt.result = {
          targetUuid: target.uuid,
          amount,
          foreign: clone(foreign),
          receipt: { summary: receipt.summary, warnings: [], manualSteps: [] }
        };
        return {};
      }
    };
  }
};

/* ------------------------------------------------ plan-level relay validation */

/**
 * The GM relay re-checks a recorded target change before it applies it, and it reads the check
 * from the plan *function* (`PLANS[name].validateTarget`), not from the plan object a call
 * returns. Each Ward plan therefore names the change it may make on another player's Creature:
 * Temporary HP pools only for this branch's own grants, Force damage no larger than the card.
 */
WARD_PLANS.wardGrant.validateTarget = (source, receipt, entry, targetDoc) =>
  wardTempEntryValid(receipt, entry, targetDoc);
WARD_PLANS.wardLifeSupport.validateTarget = (source, receipt, entry, targetDoc) =>
  wardTempEntryValid(receipt, entry, targetDoc);
WARD_PLANS.wardRegeneration.validateTarget = (source, receipt, entry, targetDoc) =>
  wardTempEntryValid(receipt, entry, targetDoc);
WARD_PLANS.reapplyForeignPool.validateTarget = (source, receipt, entry, targetDoc) =>
  wardTempEntryValid(receipt, entry, targetDoc, receipt?.result?.amount);
// W2F-2 sibling: the relay may only apply the resistance types the receipt recorded;
// a forged type set is not this use (same pinning rule as the temp-HP plans).
WARD_PLANS.wardingSurge.validateTarget = (source, receipt, entry, targetDoc) =>
  surgeEntryValid(receipt, entry, targetDoc);
WARD_PLANS.treatTheCause.validateTarget = (source, receipt, entry, targetDoc) =>
  Boolean(targetDoc && entry?.kind === "damage" && Number(entry.amount) <= Number(receipt?.result?.damage ?? 0));
// W2F-2: the recipient entry is pinned to the recorded reduced pool, exactly like the
// grant/LS pattern above — a relayed write of any other temp value is not this use.
WARD_PLANS.collectiveWard.validateTarget = (source, receipt, entry, targetDoc) =>
  collectiveEntryValid(receipt, entry, targetDoc);

/**
 * Canonical Damage Type list for set comparison: nonempty, unique strings, sorted. Anything
 * else (a bare string, an empty or duplicated list, a non-string member) is not a recorded set.
 */
function canonicalTypeSet(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const types = [];
  for (const type of value) {
    if (typeof type !== "string" || !type || types.includes(type)) return null;
    types.push(type);
  }
  return types.sort();
}

/** True set equality over canonical, nonempty, duplicate-free Damage Type lists. */
function sameTypeSet(left, right) {
  const a = canonicalTypeSet(left);
  const b = canonicalTypeSet(right);
  return Boolean(a && b && a.length === b.length && a.every((type, index) => type === b[index]));
}

/**
 * Shared target pin for the four Temporary-HP relay plans (wardGrant, wardLifeSupport,
 * wardRegeneration, reapplyForeignPool). The relay may apply only the entry the receipt
 * recorded, to the target the receipt recorded: `entry.uuid` selects the relayed document
 * and the resolved document must be that same recorded target. Without the binding a
 * receipt flag repointed at another Creature would apply this use's pool there.
 *
 * `recorded` is the receipt's recorded pool value (`result.temp`, or `result.amount` for
 * the foreign-pool plan); the plans keep their existing numeric comparison.
 */
function wardTempEntryValid(receipt, entry, targetDoc, recorded = receipt?.result?.temp) {
  const result = receipt?.result;
  if (!targetDoc || !entry || entry.kind !== WARD_TEMP_KIND || !result) return false;
  if (typeof result.targetUuid !== "string" || !result.targetUuid) return false;
  if (entry.uuid !== result.targetUuid || targetDoc.uuid !== result.targetUuid) return false;
  return Number(entry.temp) >= 0 && Number(entry.temp) === Number(recorded ?? entry.temp);
}

/**
 * In-plan and plan-function pin for Warding Surge's recorded Resistance marker. The relay may
 * apply only the marker the receipt recorded: the recorded target (entry.uuid selects the
 * relayed document), the recorded end-of-turn expiry (the resolver treats a null expiry as
 * live), and the exact, canonical, nonempty type set.
 */
function surgeEntryValid(receipt, entry, targetDoc) {
  const result = receipt?.result;
  if (!targetDoc || !entry || entry.kind !== WARD_RESIST_KIND || !result) return false;
  if (typeof result.targetUuid !== "string" || !result.targetUuid) return false;
  if (entry.uuid !== result.targetUuid || targetDoc.uuid !== result.targetUuid) return false;
  if (!Object.hasOwn(entry, "until") || !Object.hasOwn(result, "until") || entry.until !== result.until) return false;
  return sameTypeSet(entry.types, result.resistTypes);
}

/**
 * Shared recipient/donor pin for the in-plan and plan-function Collective Ward checks:
 * a donor entry may only reduce that donor to the Ward actually left; the recipient
 * entry must equal the recorded post-absorption pool, never a donor transfer.
 */
function collectiveEntryValid(receipt, entry, targetDoc) {
  if (!targetDoc || !entry || entry.kind !== WARD_TEMP_KIND) return false;
  const donor = (receipt?.result?.donorUpdates ?? []).find(candidate => candidate.uuid === entry.uuid);
  // A donor entry may only reduce that donor to the Ward actually left; the recipient entry is the
  // recorded temporary-HP reduction (already bounded by the plan), never a donor transfer.
  if (donor) return Number(entry.temp) === Number(donor.wardAfter);
  if (entry.uuid === receipt?.result?.targetUuid) {
    return Number(entry.temp) === Number(receipt?.result?.recipientTempAfter);
  }
  return false;
}

/* --------------------------------------------------------------- pool helper */

/**
 * Explicit keep/replace for a recipient that already has temporary HP (F3/F4/F9). Pools never
 * stack and the generic `tempHP` max-pool replacement is never used: the owner's choice is
 * applied exactly, including a smaller replacement.
 */
function quotePool(target, medic, amount, data) {
  const temp = Number(target?.system?.attributes?.hp?.temp ?? 0);
  const tag = flag(target, WARD_FLAG) ?? null;
  const notes = [];
  const ownerUuid = medic.uuid;
  if (temp > 0) {
    const choice = data.keepOrReplace;
    need(choice === "keep" || choice === "replace",
      `Choose whether to keep the ${temp} existing Temporary Hit Points on ${target.name} or replace them with this Ward (${amount}).`);
    const result = choosePool({ currentTemp: temp, currentTag: tag, incomingAmount: amount, medicUuid: ownerUuid, choice });
    const same = tag?.medicUuid === ownerUuid;
    if (choice === "keep") {
      notes.push(same
        ? `Kept ${target.name}'s existing ${temp} Ward Temporary Hit Points; the new ${amount} Ward is not stacked onto them.`
        : `${target.name}'s existing ${temp} Temporary Hit Points are not this Medic's Ward; they were kept unchanged and no mixed-pool absorption is assumed.`);
      return { temp, tag, kept: true, pooled: true, notes, suggestion: result.suggestion };
    }
    notes.push(`Replaced ${target.name}'s ${temp} Temporary Hit Points with ${amount} Ward.`);
    return { temp: amount, tag: wardTag(medic, amount), kept: false, pooled: true, notes, suggestion: result.suggestion };
  }
  if (tag && tag.medicUuid && tag.medicUuid !== ownerUuid && amount <= 0) {
    notes.push(`${target.name}'s Temporary Hit Points are not this Medic's Ward.`);
  }
  return { temp: amount, tag: wardTag(medic, amount), kept: false, pooled: false, notes };
}

function wardTag(medic, amount) {
  return { medicUuid: medic.uuid, grantedAt: ownershipStamp(), amount, observedTemp: amount };
}

function withPoolNote(summary, pool, amount) {
  if (!pool) return summary;
  const extra = pool.notes?.length ? ` ${pool.notes.join(" ")}` : "";
  return `${summary}${pool.temp === amount ? "" : ` Temporary Hit Points: ${pool.temp}.`}${extra}`.trim();
}

/* ------------------------------------------------------------- damage resolver */

/**
 * Synchronous `dnd5e.preApplyDamage` resolver (channel A contract). Reads only confirmed
 * outcomes and the live Resistance marker; never rolls, never awaits, never reverses damage.
 *  - Treat the Cause's failed save is a source-bound forced miss: the pending damage is fully
 *    reduced without changing the attack roll.
 *  - Warding Surge halves the exact native per-type values it is given (art-correlation handles
 *    the per-type split and refuses to guess when it cannot prove the types).
 */
function recordedWardOutcome(context) {
  if (!context?.actor?.uuid) return null;
  const messageUuid = typeof context.messageUuid === "string" && context.messageUuid ? context.messageUuid : null;
  const origin = messageOrigin(context.message);
  if (!messageUuid && !origin) return null;
  // Actor flags are replicated to all clients; also include synthetic Actors from loaded scenes.
  const actors = [...(globalThis.game?.actors?.values?.() ?? [])];
  for (const scene of globalThis.game?.scenes?.values?.() ?? []) {
    for (const token of scene?.tokens?.values?.() ?? []) if (token.actor) actors.push(token.actor);
  }
  for (const actor of actors) {
    const receipts = flag(actor, "medicUses")?.undo;
    if (!Array.isArray(receipts)) continue;
    for (const receipt of receipts) {
      const outcome = receipt?.wardCorrelation;
      if (receipt.command === "treatTheCause" && receipt.status === "complete"
          && outcome?.targetUuid === context.actor.uuid
          && ((messageUuid && outcome.messageUuid === messageUuid)
            || (origin && outcome.originatingMessage === origin))) return outcome;
    }
  }
  return null;
}

export function wardDamageResolver(context) {
  if (!context?.actor) return null;
  const outcome = recordedWardOutcome(context);
  const results = [];
  if (outcome?.forcedMiss === true) results.push({ reduce: Number(context.amount) || 0, note: "Treat the Cause: source-bound forced miss." });
  const marker = flag(context.actor, WARD_RESIST_FLAG);
  const live = marker && Array.isArray(marker.types) && marker.types.length
    && (marker.until === null || marker.until === undefined || marker.until === currentTurnKey())
    ? marker.types : null;
  const resistTypes = [...new Set([...(live ?? []), ...(Array.isArray(outcome?.resistTypes) ? outcome.resistTypes : [])])];
  if (resistTypes.length) results.push({ resistTypes, note: "Warding Surge: Resistance from the confirmed Ward use." });
  if (!results.length) return null;
  const reduce = results.reduce((sum, result) => sum + (Number(result.reduce) || 0), 0);
  return { reduce, resistTypes, note: results.map(result => result.note).join(" ") };
}

/* ------------------------------------------------------------------- hooks */

function reconcileNativeTemp(actor, changes) {
  const path = "system.attributes.hp.temp";
  if (!changes || typeof changes !== "object" || !Object.hasOwn(changes, path)) return null;
  // Our own target-kind writes (grants, replacements, undo reverts) always carry the tag
  // explicitly under `ward` or its force-replace `==ward` form: they need no reconciliation,
  // and the applied record restores the exact prior pool on undo.
  if (Object.hasOwn(changes, `flags.ak5e.${WARD_FLAG}`)
    || Object.hasOwn(changes, `flags.ak5e.==${WARD_FLAG}`)) return null;
  const tag = flag(actor, WARD_FLAG) ?? null;
  if (!tag) return null;
  const after = Number(changes[path]);
  if (!Number.isFinite(after)) return null;
  const before = Number(tag.observedTemp ?? tag.amount ?? NaN);
  if (!Number.isFinite(before)) return null;
  const kept = reconcileTag({ tempBefore: before, tempAfter: after, tag });
  if (kept === null) {
    const foreign = after > before;
    Promise.resolve(actor.update({ [`flags.ak5e.${WARD_FLAG}`]: null }))
      .then(() => globalThis.ui?.notifications?.warn?.(
        `AK5e | Ward: ${actor.name}'s ${foreign ? "Temporary Hit Points were replaced by another source" : "Ward is depleted"} — the Medic's provenance was cleared.`))
      .catch(error => console.error("AK5e | Ward provenance", error));
    return null;
  }
  if (after !== before) {
    Promise.resolve(actor.update({ [`flags.ak5e.${WARD_FLAG}.observedTemp`]: after }))
      .catch(error => console.error("AK5e | Ward provenance", error));
  }
  return kept;
}

const WARD_TURN_CARD = "wardRegenerationOffer";

/** Own turn start: offer Ward Regeneration when the Medic begins without their Ward. */
async function offerWardRegeneration(actor) {
  if (!medicEnabled(actor) || medicBranch(actor) !== "ward") return null;
  const level = medicLevel(actor) ?? 1;
  if (level < 15) return null;
  const view = wardView(actor, actor);
  if (view.own) return null;
  const quote = quoteWardRegeneration({ medicLevel: level, hasOwnWard: view.own, currentTemp: view.temp });
  if (!quote.eligible) return null;
  const data = {
    speaker: globalThis.ChatMessage?.implementation?.getSpeaker?.({ actor }),
    content: `<h3>Ward Regeneration</h3><p>${actor.name} begins their Turn without their Ward and can gain ${quote.amount} Temporary Hit Points.</p>`
      + `<button type="button" data-medic-cmd="wardRegeneration" data-medic-actor-uuid="${actor.uuid}">Gain ${quote.amount} Ward</button>`,
    flags: { ak5e: { [WARD_TURN_CARD]: { actorUuid: actor.uuid, amount: quote.amount, turnKey: currentTurnKey() } } }
  };
  return globalThis.ChatMessage?.implementation?.create?.(data) ?? null;
}

let installed = false;

/**
 * Idempotent registration: adds the Ward plans, per-use readings and named target kinds to the
 * Medic play-use engine, installs the synchronous damage resolver and the provenance hooks.
 * Nothing here registers at import time.
 */
export function registerWardHooks() {
  if (installed) return false;
  installed = true;
  medicUses.register({ plans: WARD_PLANS, readings: WARD_READINGS, targetKinds: WARD_TARGET_KINDS });
  registerDamageResolver(wardDamageResolver);
  const hooks = globalThis.Hooks;
  if (typeof hooks?.on === "function") {
    hooks.on("updateActor", (actor, changes) => { reconcileNativeTemp(actor, changes); });
    // Wire this branch's own turn-start offer card. The control handler lives in the sheet
    // module (imported lazily to avoid a features<->sheet cycle); the parent may also wire
    // it through its own chat hooks — either path runs the same guided command.
    hooks.on("renderChatMessageHTML", (message, html) => {
      try {
        if (!flag(message, WARD_TURN_CARD)?.actorUuid) return;
        import("./ward-sheet.mjs").then(sheet => {
          try { sheet.wireWardCard(message, html); }
          catch (error) { console.error("AK5e | Ward card", error); }
        }).catch(error => console.error("AK5e | Ward card", error));
      } catch (error) {
        console.error("AK5e | Ward card", error);
      }
    });
  }
  // Own turn start: offer Ward Regeneration (C3:5085) as a card control, never automatically.
  try {
    onAk5eEvent("turnStart", event => {
      const actor = event?.raw?.actor ?? resolveActor(event?.actorUuid);
      if (!actor?.uuid || actor.uuid !== event?.actorUuid) return undefined;
      return offerWardRegeneration(actor);
    });
  } catch (error) {
    console.error("AK5e | Ward turn-start hook", error);
  }
  return true;
}

/** Per-use reading offered for Life Support healing (F2, DECISIONS 2026-11-01 #1). */
export const WARD_READINGS = {
  [WARD_READING_KEY]: {
    label: "Ward and Life Support healing",
    options: [
      { value: "rolledOnly", label: "Only rolled healing can become Ward (default, literal reading)" },
      { value: "lifeSupportToo", label: "Life Support healing can also become Ward" }
    ]
  }
};

export { WARD_PLANS };
