/** Tip of the Spear (Chapter 3, Vanguard 1st Level, source L7994-8008).
 *
 * Extracted from standard-bearer.mjs (SI-12). Everything stateful is injected
 * (dice, tagged, temporaryHP, grantSP, withinFeet); this module registers no
 * hooks and reads no Foundry globals at import time. Effect options, ids,
 * labels and metadata are byte-compatible with the pre-extraction Standard
 * Bearer code so existing receipts and effects replay unchanged.
 *
 * Classification (WORKFLOW.md section 2.7):
 *  - explicit rule: the six-row table, 60 feet, "until the start of your next
 *    Turn", cumulative effects.
 *  - faithful representation: the effect options built here (tagged feature
 *    effects with scoped changes; Temporary HP applied additively).
 *  - manual play procedure: outcome 1 (one Damage Roll) and outcome 6 (extra
 *    Skill Point) are confirmed by the table; see TIP_INSTRUCTIONS.
 *  - proposed interpretation: see TIP_VARIANTS "manual" entries.
 */
import { TIP_INSTRUCTIONS, integer, tokenPoint } from "./standard-bearer-rules.mjs";
import { flag, values } from "./operation-kernel.mjs";

const need = (condition, message) => { if (!condition) throw new Error(message); };

// --- Change builders (identical to the former module-local helpers) --------
export const change = (key, value, mode = 2) => ({ key, value: String(value), mode, priority: mode === 5 ? 99 : 20 });
export const speedChanges = (actor, value, mode = 2) => ["walk", "fly", "swim", "climb", "burrow"]
  .filter(key => Number(actor.system?.attributes?.movement?.[key]) > 0).map(key => change(`system.attributes.movement.${key}`, value, mode));
export const attackChanges = value => ["mwak", "rwak", "msak", "rsak"].map(type => change(`system.bonuses.${type}.attack`, value));

// --- The six outcomes (source table L8000-8007) ------------------------------
const outcome = (n, extra = {}) => Object.freeze({
  n, id: `tip${n}`, label: `Tip of the Spear (${n})`, instructions: TIP_INSTRUCTIONS[n - 1],
  trigger: "turnStart", expiryActor: "source", kind: `tip${n}`,
  /** Benefit metadata value: Proficiency Bonus of the bearer for outcome 1, else 1. */
  value: bearer => n === 1 ? Number(bearer.system.attributes.prof) : 1,
  /** Active Effect changes for the recipient. */
  changes: () => [],
  actions: n === 1 ? ["used"] : [],
  ...extra
});
export const TIP_OUTCOMES = Object.freeze([
  outcome(1),
  // Outcome 2 is not an effect: additive 1d6 Temporary Hit Points.
  outcome(2, { temporaryHP: Object.freeze({ formula: "1d6", additive: true }) }),
  outcome(3, { changes: recipient => speedChanges(recipient, 10) }),
  outcome(4, { changes: () => attackChanges(2) }),
  outcome(5),
  outcome(6)
]);

/** Resolve a 1..6 outcome number to its data, or throw with the existing wording. */
export function tipOutcome(n) {
  need(n <= 6 && n >= 1, "Tip choices range from 1 to 6.");
  return TIP_OUTCOMES[n - 1];
}
export const tipEffectId = (op, target, index = 0) => `${op.id}:${target.actor.uuid}:tip:${index}`;
/** The options passed to tagged() for an effect outcome (not used for outcome 2). */
export function tipTagOptions(data, bearer, recipient) {
  return { label: data.label, trigger: data.trigger, expiryActor: data.expiryActor,
    changes: data.changes(recipient), instructions: data.instructions, actions: [...data.actions] };
}
export const tipTagMetadata = (data, bearer) => ({ kind: data.kind, value: data.value(bearer) });

/**
 * One use of the Feature. `directed` true means Directed Engagement (L8047)
 * is active and the player chooses rather than rolls.
 * helpers: dice(op, key, formula, actor), tagged(actor, item, targetActor, id, options, metadata),
 * temporaryHP(targetActor, amount, additive, id, actor).
 */
export async function useTip({ actor, item, target, op, directed = false, choice, index = 0, helpers }) {
  const { dice, tagged, temporaryHP } = helpers;
  const rolled = directed ? integer(choice, "Tip choice", 1) : await dice(op, `tip:${index}`, "1d6", actor);
  const data = tipOutcome(rolled);
  const id = tipEffectId(op, target, index);
  if (data.temporaryHP) {
    await temporaryHP(target.actor, await dice(op, id, data.temporaryHP.formula, actor), data.temporaryHP.additive, id, actor);
    return { outcome: data.n, id, effect: null };
  }
  const effect = await tagged(actor, item, target.actor, id, tipTagOptions(data, actor, target.actor), tipTagMetadata(data, actor));
  return { outcome: data.n, id, effect };
}

// --- Source variants (default behaviour is unchanged) ------------------------
export const TIP_RANGE = 60;
/**
 * Range check. Default 60 feet (L7997). Tactician (L8707) says "regardless of
 * range": pass Infinity. Visibility/allegiance are NOT checked here.
 */
export function validateTipTarget({ source, target, range = TIP_RANGE, helpers = {} }) {
  if (range === Infinity) return true;
  need(Number.isFinite(range) && range > 0, "Tip range must be a positive number of feet or Infinity.");
  const { withinFeet, tokenPoint: point = tokenPoint } = helpers;
  need(typeof withinFeet === "function", "A distance helper is required to validate Tip range.");
  need(withinFeet(source.parent, point(source), target, range),
    `Tip of the Spear requires a visible ally within ${range} feet; no planted exception is invented.`);
  return true;
}
/** Number of uses granted by a variant ("twice" at L8091); a positive integer. */
export const tipCount = n => integer(n, "Tip count", 1);

/**
 * Generic variant runner. Uses are numbered sequentially (index 0, 1, ...) so
 * ids match the existing `tip:<index>` convention. With repeatOnSameTarget
 * (Last Stand, L8585) each use is immediately followed by one additional use on
 * the same creature. `targets` optionally gives a different creature per counted
 * use (the source does not say Leading Lance's two uses share a target);
 * otherwise `target` receives every use. `choice` may be a scalar (reused, as
 * today) or an array indexed by sequential use.
 */
export async function useTipVariant({ actor, item, target, targets, op, directed = false, choice, count = 1,
  repeatOnSameTarget = false, range = TIP_RANGE, source, startIndex = 0, helpers }) {
  const uses = targets ? targets.length : tipCount(count);
  if (targets && count !== 1) need(tipCount(count) === targets.length, "Tip count must equal the number of chosen targets.");
  need(targets || target, "Choose a creature to receive Tip of the Spear.");
  const results = [];
  let index = startIndex;
  for (let use = 0; use < uses; use++) {
    const recipient = targets ? targets[use] : target;
    if (source) validateTipTarget({ source, target: recipient, range, helpers });
    for (let repeat = 0; repeat < (repeatOnSameTarget ? 2 : 1); repeat++, index++)
      results.push(await useTip({ actor, item, target: recipient, op, directed,
        choice: Array.isArray(choice) ? choice[index - startIndex] : choice, index, helpers }));
  }
  return results;
}

/**
 * Named entry shapes. Each only fixes count/range and calls useTipVariant.
 * `manual` lists source conditions this module does NOT enforce.
 */
export const TIP_VARIANTS = Object.freeze({
  agent: Object.freeze({ source: "L8249 Agent: Shadowstrike", quote: "When you hit with an Attack, you may use your Tip of the Spear Feature",
    manual: ["Invisible Condition during the Attack Action", "hit with an Attack"] }),
  charger: Object.freeze({ source: "L8334 Charger: Mark for Elimination", quote: "reduced to 0 Hit Points, you can immediately use your Tip of the Spear Feature",
    manual: ["Marked Creature status", "reduced to 0 Hit Points"] }),
  devastatingBlow: Object.freeze({ source: "L8111 Devastating Blow", quote: "you can immediately use your Tip of the Spear Feature (no Action required)",
    manual: ["hit with a Melee Attack", "Skill use"] }),
  leadingLance: Object.freeze({ source: "L8091 Leading Lance", count: 2, quote: "you can immediately use your Tip of the Spear Feature (no Action required) twice",
    manual: ["Attack hit and reducing a Creature to 0 Hit Points", "10 Skill Points gain", "whether both uses share a target (source silent)"] }),
  pioneer: Object.freeze({ source: "L8434 Aura / L8451 Tactical Burst", quote: "For every 10 Skill Points you spent to activate that Skill",
    manual: ["Skill Point accounting (per 20 SP / per 10 SP)", "count must be supplied by the caller"] }),
  tactician: Object.freeze({ source: "L8707 Tactician", range: Infinity, quote: "use your Tip of the Spear Feature on that Creature regardless of range",
    manual: ["eligibility 'From 4th Level' (TODO L629-630 ruling pending)", "Reaction expended in response to a Tactic", "creature within the Strategic Zone"] })
});
/** Agent (L8249). The Invisible clause is NOT enforced. */
export const agentTip = options => useTipVariant({ ...options });
/** Charger (L8334). Mark / 0 HP trigger is NOT enforced. */
export const chargerTip = options => useTipVariant({ ...options });
/** Devastating Blow (L8111). Trigger is NOT enforced. */
export const devastatingBlowTip = options => useTipVariant({ ...options });
/** Leading Lance (L8091): twice. Pass `targets` for different recipients, else `target` gets both. */
export const leadingLanceTip = options => useTipVariant({ count: TIP_VARIANTS.leadingLance.count, ...options });
/** Pioneer (L8434/L8451). Caller supplies `count`; no SP accounting is performed. */
export const pioneerTip = options => useTipVariant({ ...options });
/** Tactician (L8707): range Infinity. The "From 4th Level" gate is NOT enforced (manual). */
export const tacticianTip = options => useTipVariant({ ...options, range: TIP_VARIANTS.tactician.range });

// --- Outcome 6: extra Skill Points ------------------------------------------
export const activeTipEffects = (actor, kind) =>
  values(actor?.effects).filter(e => !e.disabled && flag(e, "standardBenefit")?.kind === kind);
/** grantSP(targetActor, amount, id, reason, exception, bearerActor) is injected. */
export async function useTipSP({ target, amount, op, grantSP, actor }) {
  const effects = activeTipEffects(target, "tip6");
  need(effects.length > 0, "The recipient has no active Tip SP benefit.");
  await grantSP(target, integer(amount, "Qualifying points", 1) * effects.length, op.id,
    "Tip of the Spear: confirmed extra SP for qualifying gains", false, actor);
}

// --- Outcome 5: critical range ----------------------------------------------
export const tipCritReduction = actor => activeTipEffects(actor, "tip5").length;
/** Lowered critical threshold for a base value (default 20), never below 1. */
export const tipCritThreshold = (actor, base = 20) => Math.max(1, base - tipCritReduction(actor));
/** Body of the dnd5e.preRollAttackV2 hook; mutates and returns `config`. */
export function adjustAttackConfig(config, actor = config.subject?.actor ?? config.subject) {
  const count = tipCritReduction(actor);
  if (count) for (const roll of config.rolls ?? []) { roll.options ??= {}; roll.options.criticalSuccess = Math.max(1, (roll.options.criticalSuccess ?? 20) - count); }
  return config;
}
