/**
 * AK5e damage, HP loss, healing and dice-rule calculations (TODO SI-4).
 *
 * Calculation only: this module registers no hooks and writes no documents.
 * Callers (Standard Bearer, world rules, sheets) decide when and how to apply
 * the returned values. Unresolved source rulings are REQUIRED parameters; the
 * module throws rather than guessing.
 *
 * Source authority (AK5e 1.3.1):
 * - Ch.1 L207-209: DR applies BEFORE Resistance/Vulnerability; DR cannot reduce
 *   Damage below 1. DR may be type-, class- (Physical/Arts) or all-scoped.
 * - Ch.1 L234: Corroded halves DR (rounding down). Ch.3 L790 (Enduring
 *   Affliction overlay): Corroded sets DR to 0.
 * - Ch.1 L137-138: Constructs cannot restore HP from Healing Arts, Operator
 *   Skills, Class Features or the Medicine Skill unless specified otherwise.
 * - Ch.3 L3287 Blood Price: HP loss that "cannot be reduced in any way" and may
 *   not expend Temporary HP.
 *
 * Compatibility: for kind "damage" without Temp HP / floors, `final` equals
 * standard-bearer-rules.mjs `reductionPreview(amount, dr, {resistance,
 * vulnerability})`, including its minimum-1 after Resistance. Note that the
 * minimum-1 after Resistance (e.g. 1 Damage with Resistance -> 1) is the
 * existing code's representation; the source only states the DR minimum.
 */
export { isConstruct } from "./world-rule-state.mjs";

/** Mirrors ak5e.mjs PHYSICAL_DAMAGE / ARTS_DAMAGE (drift-checked by tests). */
export const PHYSICAL_DAMAGE_TYPES = Object.freeze(["bludgeoning", "piercing", "slashing", "thunder"]);
export const ARTS_DAMAGE_TYPES = Object.freeze(["acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant"]);

export function damageCategory(type) {
  const normalized = String(type ?? "").toLowerCase();
  if (PHYSICAL_DAMAGE_TYPES.includes(normalized)) return "physical";
  if (ARTS_DAMAGE_TYPES.includes(normalized)) return "arts";
  return null;
}

/**
 * HP-loss presets exist ONLY where the source states the policy explicitly.
 * Debilitate and Destroy, Godpiercer, Mortal Blow and Nervous Impairment have
 * no stated DR / Temp HP policy and deliberately have no preset.
 */
export const HP_LOSS_PRESETS = Object.freeze({
  BLOOD_PRICE: Object.freeze({ bypassDR: true, bypassResistance: true, bypassTemp: true,
    source: "Ch.3 L3287: cannot be reduced in any way; may not expend Temporary Hit Points." })
});

/** Ch.1 L138 restricted healing sources for Constructs. */
export const RESTRICTED_HEALING_SOURCES = Object.freeze(["healingArt", "operatorSkill", "classFeature", "medicine"]);
export const HEALING_SOURCES = Object.freeze([...RESTRICTED_HEALING_SOURCES, "other"]);

const fail = message => { throw new Error(`AK5e damage pipeline: ${message}`); };
function nonnegative(value, label) {
  const n = Number(value);
  if (value === null || value === "" || typeof value === "boolean" || !Number.isFinite(n) || n < 0) fail(`${label} must be a nonnegative finite number.`);
  return n;
}
function bool(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be explicitly true or false (no default; source ruling required).`);
  return value;
}

function reductionApplies(scope, type) {
  const scopes = (Array.isArray(scope) ? scope : [scope]).map(s => String(s ?? "").toLowerCase());
  const normalized = String(type ?? "").toLowerCase();
  const category = damageCategory(normalized);
  return scopes.some(s => s === "all" || (category && s === category) || (normalized && s === normalized));
}

/**
 * Resolve the DR total. Multiple applicable sources are not defined by the
 * source: require policy.stacking "sum", otherwise report requiresGM.
 */
function resolveReduction({ reduction, reductions, type, policy }) {
  if (reduction !== undefined && reductions !== undefined) fail("Pass either a pre-resolved `reduction` total or `reductions`, not both.");
  if (reduction !== undefined) return { total: nonnegative(reduction, "reduction"), sources: [], note: "pre-resolved DR total" };
  const list = reductions ?? [];
  if (!Array.isArray(list)) fail("`reductions` must be an array of {value, scope}.");
  const applicable = list.filter(r => reductionApplies(r?.scope, type))
    .map(r => ({ ...r, value: nonnegative(r.value, "reduction value") }));
  if (applicable.length <= 1) return { total: applicable[0]?.value ?? 0, sources: applicable, note: applicable.length ? "single applicable DR source" : "no applicable DR" };
  const stacking = policy?.stacking;
  if (stacking === "sum") return { total: applicable.reduce((s, r) => s + r.value, 0), sources: applicable, note: "multiple DR sources summed (explicit policy.stacking 'sum')" };
  if (stacking !== undefined && stacking !== "gm") fail("policy.stacking must be 'sum' or 'gm'.");
  return { total: null, sources: applicable, requiresGM: true,
    note: "Multiple applicable DR sources; the source does not define stacking. Ask the GM for a DR total." };
}

function absorb(amount, hp, bypassTemp, steps) {
  if (!hp) return { absorbedByTemp: 0, hpLost: amount, newHp: null, newTemp: null };
  const value = nonnegative(hp.value, "hp.value");
  const temp = hp.temp === undefined || hp.temp === null ? 0 : nonnegative(hp.temp, "hp.temp");
  const absorbedByTemp = bypassTemp ? 0 : Math.min(temp, amount);
  const newTemp = temp - absorbedByTemp;
  steps.push({ step: "temporaryHP", before: amount, after: amount - absorbedByTemp,
    note: bypassTemp ? "Temporary HP bypassed by policy" : `Temporary HP absorbed ${absorbedByTemp} (${temp} -> ${newTemp})` });
  const remainder = amount - absorbedByTemp;
  const newHp = Math.max(0, value - remainder);
  steps.push({ step: "hitPoints", before: value, after: newHp, note: `HP reduced by ${remainder}, floor 0` });
  return { absorbedByTemp, hpLost: value - newHp, newHp, newTemp };
}

/**
 * Pure damage / HP-loss resolution with an ordered audit trail.
 * @param {object} input
 * @param {number} input.amount                 Rolled amount (nonnegative).
 * @param {string} [input.type]                 Damage type (scopes DR).
 * @param {"damage"|"hpLoss"} [input.kind="damage"]
 * @param {number} [input.reduction]            Pre-resolved DR total (GM override).
 * @param {{value:number, scope:string|string[]}[]} [input.reductions]  Scoped DR sources.
 * @param {boolean} [input.ignoreDR]            e.g. Savant, Wrecking Wall.
 * @param {boolean} [input.ignoreResistance]    Ignores Resistance only; Vulnerability still applies.
 * @param {boolean} [input.resistance]
 * @param {boolean} [input.vulnerability]
 * @param {false|true|"halve"|"zero"} [input.corroded]  true/"halve": Ch.1 L234; "zero": Ch.3 L790 overlay.
 * @param {number} [input.adjustment]           Signed change to the resolved DR total (Subtle Spark Bolster +2/+4, Shred −2/−4); DR never drops below 0.
 * @param {number} [input.minimumTaken]         Caller-computed floor (e.g. Maximum Burst "half of the rolled Damage"; rounding is the caller's ruling).
 * @param {{value:number, max?:number, temp?:number}} [input.hp]
 * @param {object} [input.policy]               {stacking?: "sum"|"gm"}; for hpLoss also REQUIRED {bypassDR, bypassResistance, bypassTemp}.
 */
export function resolveDamage({ amount, type, kind = "damage", reduction, reductions, ignoreDR = false, ignoreResistance = false,
  resistance = false, vulnerability = false, corroded = false, adjustment = 0, minimumTaken, hp, policy } = {}) {
  if (!Number.isInteger(adjustment)) fail("adjustment must be a whole number.");
  if (!["damage", "hpLoss"].includes(kind)) fail("kind must be 'damage' or 'hpLoss'.");
  const input = nonnegative(amount, "amount");
  let bypassDR = Boolean(ignoreDR), bypassResistance = Boolean(ignoreResistance), bypassTemp = false;
  if (kind === "hpLoss") {
    if (!policy || typeof policy !== "object") fail("HP loss requires an explicit policy {bypassDR, bypassResistance, bypassTemp}; the source does not state one for most HP-loss effects.");
    bypassDR = bool(policy.bypassDR, "policy.bypassDR") || bypassDR;
    bypassResistance = bool(policy.bypassResistance, "policy.bypassResistance") || bypassResistance;
    bypassTemp = bool(policy.bypassTemp, "policy.bypassTemp");
  }
  if (![false, true, "halve", "zero"].includes(corroded)) fail("corroded must be false, true, 'halve' or 'zero'.");
  const steps = [{ step: "input", before: input, after: input, note: `${kind}${type ? ` (${type})` : ""}` }];
  const base = { kind, steps, requiresGM: false };

  // 1. Damage Reduction (before Resistance/Vulnerability; minimum 1).
  let current = input;
  if (bypassDR) steps.push({ step: "damageReduction", before: current, after: current, note: kind === "hpLoss" ? "DR bypassed by HP-loss policy" : "DR ignored" });
  else {
    const dr = resolveReduction({ reduction, reductions, type, policy });
    if (dr.requiresGM) {
      steps.push({ step: "damageReduction", before: current, after: null, note: dr.note });
      return { ...base, requiresGM: true, reductionSources: dr.sources, final: null, absorbedByTemp: null, hpLost: null, newHp: null, newTemp: null };
    }
    let total = dr.total, note = dr.note;
    if (adjustment) { note += `; adjustment ${adjustment > 0 ? "+" : ""}${adjustment} -> ${Math.max(0, total + adjustment)}`; total = Math.max(0, total + adjustment); }
    if (corroded === true || corroded === "halve") { note += `; Corroded halves DR ${total} -> ${Math.floor(total / 2)}`; total = Math.floor(total / 2); }
    else if (corroded === "zero") { note += `; Corroded overlay sets DR ${total} -> 0`; total = 0; }
    const after = current > 0 ? Math.max(1, current - total) : 0;
    steps.push({ step: "damageReduction", before: current, after, note: `${note}; DR ${total}${current > 0 && current - total < 1 ? " (minimum 1)" : ""}` });
    current = after;
  }

  // 2. Resistance / Vulnerability (floor; minimum 1 when amount > 0, as reductionPreview).
  const resist = resistance && !bypassResistance, vuln = vulnerability && !(kind === "hpLoss" && bypassResistance);
  const multiplier = (resist ? 0.5 : 1) * (vuln ? 2 : 1);
  const afterResist = input > 0 ? Math.max(1, Math.floor(current * multiplier)) : 0;
  steps.push({ step: "resistanceVulnerability", before: current, after: afterResist,
    note: `x${multiplier}${resistance && bypassResistance ? " (Resistance ignored)" : ""}${vulnerability && !vuln ? " (Vulnerability bypassed)" : ""}; floor, minimum 1` });
  current = afterResist;

  // 3. Optional caller floor (e.g. Maximum Burst).
  if (minimumTaken !== undefined) {
    const floor = nonnegative(minimumTaken, "minimumTaken");
    if (floor > input) fail("minimumTaken cannot exceed the rolled amount.");
    const after = Math.max(current, Math.floor(floor));
    steps.push({ step: "minimumTaken", before: current, after, note: `floor ${Math.floor(floor)}` });
    current = after;
  }

  // 4. Temporary HP then HP (Standard Bearer confirmedDamage order).
  const applied = absorb(current, hp, bypassTemp, steps);
  return { ...base, final: current, ...applied };
}

/** Temporary HP gain: Standard Bearer temporaryHP (additive vs replace). */
export function applyTempHP(current, amount, mode) {
  const temp = Number(current ?? 0), gain = Number(amount);
  if (!Number.isFinite(temp) || !Number.isFinite(gain)) fail("Temporary HP values must be finite numbers.");
  if (mode === "additive") return temp + Math.max(0, gain);
  if (mode === "replace") return Math.max(temp, gain, 0);
  fail("Temporary HP mode must be 'additive' or 'replace' (decided per source; see DECISIONS.md).");
}

/**
 * Healing. HP is capped at hp.effectiveMax ?? hp.max exactly as Standard
 * Bearer hitDie (Math.min(cap, value + amount)).
 * @returns {{blocked:boolean, reason?:string, newHp:number, restored:number}}
 */
export function applyHealing(hp, amount, { source, isConstruct, constructException = false } = {}) {
  if (!HEALING_SOURCES.includes(source)) fail(`healing source must be one of ${HEALING_SOURCES.join(", ")}.`);
  bool(isConstruct, "isConstruct");
  const value = Number(hp?.value), cap = Number(hp?.effectiveMax ?? hp?.max);
  if (!Number.isFinite(value) || !Number.isFinite(cap)) fail("hp.value and hp.max must be finite numbers.");
  const gain = nonnegative(amount, "healing amount");
  if (isConstruct && RESTRICTED_HEALING_SOURCES.includes(source) && !constructException) {
    return { blocked: true, reason: "Ch.1 L138: Constructs cannot restore HP from Healing Arts, Operator Skills, Class Features or the Medicine Skill unless specified otherwise.",
      newHp: value, restored: 0 };
  }
  const newHp = Math.max(value, Math.min(cap, value + gain));    // healing never lowers HP (e.g. HP above a reduced effective max)
  return { blocked: false, newHp, restored: newHp - value };
}

/* -------------------------------------------------------------------------- */
/*  Dice rules over evaluated results                                          */
/* -------------------------------------------------------------------------- */

function rollDie(faces, rng) {
  const r = Number(rng());
  if (!(r >= 0 && r < 1)) fail("rng must return a number in [0, 1).");
  return 1 + Math.floor(r * faces);
}

/**
 * Apply AK5e dice rules to already-evaluated die results of ONE die size.
 * Order (matches the Foundry modifier order emitted by diceRuleModifiers):
 * reroll -> explode -> minimum; `max` (maximize) is exclusive of reroll/explode.
 * @param {number[]} results
 * @param {object} rules
 * @param {number} rules.faces
 * @param {number} [rules.min]                Each result below becomes this (Deadshot "Make it Count": 3).
 * @param {boolean} [rules.max]               Maximize: every die scores its maximum (Heartseeker, Chosen of Asclepius).
 * @param {{limit:number, recursive:boolean, on?:number}} [rules.explode]  Weapon Tuning; `recursive` is a required ruling.
 * @param {number} [rules.rerollAtOrBelow]    Savant "3 or less"; must use the new result.
 * @param {boolean} [rules.rerollOnce]        REQUIRED with rerollAtOrBelow.
 * @param {number[]} [rules.rerollIndices]    Player-chosen dice to reroll once (Savage Shots, Preserver).
 * @param {number} [rules.floorTotal]         Minimum total of these dice.
 * @param {() => number} [rng=Math.random]
 */
export function applyDiceRules(results, rules = {}, rng = Math.random) {
  const faces = Number(rules.faces);
  if (!Number.isInteger(faces) || faces < 1) fail("faces must be a positive integer.");
  if (!Array.isArray(results) || results.some(r => !Number.isInteger(r) || r < 1 || r > faces)) fail(`results must be integers from 1 to ${faces}.`);
  const dice = results.map(r => ({ result: r, initial: r, active: true, rerolled: false, exploded: false, added: false }));
  const log = [];
  if (rules.max !== undefined && typeof rules.max !== "boolean") fail("max is the maximize toggle and must be boolean.");
  if (rules.max && (rules.explode || rules.rerollAtOrBelow !== undefined || rules.rerollIndices?.length)) {
    fail("Maximized dice combined with rerolls or exploding dice needs a ruling (TODO L456 Heartseeker with exploding dice).");
  }
  const reroll = die => {
    die.active = false; die.rerolled = true;
    const next = { result: rollDie(faces, rng), initial: null, active: true, rerolled: false, exploded: false, added: false, from: die.result };
    dice.push(next); log.push(`reroll ${die.result} -> ${next.result}`); return next;
  };
  if (rules.rerollIndices?.length) {
    const chosen = [...new Set(rules.rerollIndices)];
    if (chosen.some(i => !Number.isInteger(i) || i < 0 || i >= results.length)) fail("rerollIndices must index the original results.");
    for (const i of chosen) reroll(dice[i]);
  }
  if (rules.rerollAtOrBelow !== undefined) {
    const at = Number(rules.rerollAtOrBelow);
    if (!Number.isInteger(at) || at < 1) fail("rerollAtOrBelow must be a positive integer.");
    const once = bool(rules.rerollOnce, "rerollOnce");
    if (!once && at >= faces) fail("Recursive reroll threshold must be below the die size.");
    const initial = dice.filter(d => d.active);
    for (const die of initial) {
      let current = die, guard = 0;
      while (current.result <= at) {
        current = reroll(current);
        if (once) break;
        if (++guard > 1000) fail("Maximum reroll depth exceeded.");
      }
    }
  }
  if (rules.explode) {
    const limit = Number(rules.explode.limit), on = Number(rules.explode.on ?? faces);
    if (!Number.isInteger(limit) || limit < 0) fail("explode.limit must be a nonnegative integer (Weapon Tuning: Proficiency Bonus).");
    const recursive = bool(rules.explode.recursive, "explode.recursive");
    if (!Number.isInteger(on) || on < 1 || on > faces) fail("explode.on must be a face value.");
    let added = 0;
    const queue = dice.filter(d => d.active);
    for (let i = 0; i < queue.length && added < limit; i++) {
      if (queue[i].result !== on) continue;
      queue[i].exploded = true;
      const extra = { result: rollDie(faces, rng), initial: null, active: true, rerolled: false, exploded: false, added: true };
      dice.push(extra); added++; log.push(`explode ${on} -> +${extra.result}`);
      if (recursive) queue.push(extra);
    }
  }
  if (rules.max) for (const d of dice) { if (d.result !== faces) log.push(`maximize ${d.result} -> ${faces}`); d.result = faces; }
  if (rules.min !== undefined) {
    const min = Number(rules.min);
    if (!Number.isInteger(min) || min < 1) fail("min must be a positive integer.");
    for (const d of dice) if (d.active && d.result < min) { log.push(`minimum ${d.result} -> ${min}`); d.result = min; }
  }
  let total = dice.filter(d => d.active).reduce((s, d) => s + d.result, 0);
  if (rules.floorTotal !== undefined) {
    const floor = nonnegative(rules.floorTotal, "floorTotal");
    if (total < floor) { log.push(`floorTotal ${total} -> ${floor}`); total = floor; }
  }
  return { dice, total, log };
}

/* -------------------------------------------------------------------------- */
/*  Foundry dice-term adapter (no hook registration here)                      */
/* -------------------------------------------------------------------------- */

/**
 * Translate deterministic rules into Foundry V13 Die modifier strings
 * (client/dice/terms/die.mjs MODIFIERS: r, rr, x, xo, min). Player-choice
 * rules (rerollIndices, Savage Shots) cannot be expressed pre-roll and throw.
 */
export function diceRuleModifiers(rules = {}, faces) {
  faces = Number(faces);
  if (!Number.isInteger(faces) || faces < 1) fail("faces must be a positive integer.");
  if (rules.rerollIndices?.length) fail("Player-chosen rerolls must be resolved after the roll (manual).");
  if (rules.floorTotal !== undefined) fail("floorTotal has no dice-term modifier; apply it to the result.");
  if (rules.max && (rules.explode || rules.rerollAtOrBelow !== undefined)) fail("Maximized dice combined with rerolls or exploding dice needs a ruling.");
  const mods = [];
  if (rules.rerollAtOrBelow !== undefined) mods.push(`${bool(rules.rerollOnce, "rerollOnce") ? "r" : "rr"}<=${Number(rules.rerollAtOrBelow)}`);
  if (rules.explode) mods.push(`${bool(rules.explode.recursive, "explode.recursive") ? "x" : "xo"}${Number(rules.explode.limit)}=${Number(rules.explode.on ?? faces)}`);
  if (rules.max) mods.push(`min${faces}`);
  if (rules.min !== undefined) mods.push(`min${Number(rules.min)}`);
  return mods;
}

/**
 * Append modifiers to unevaluated Die terms of constructed dnd5e DamageRolls.
 * Intended for `dnd5e.postDamageRollConfiguration(rolls, config, dialog, message)`
 * (dnd5e 5.3.3 BasicRoll.buildConfigure), which fires after configuration and
 * before evaluation. Never returns false, so the roll is not cancelled.
 * Exploding limits are per Foundry term while Weapon Tuning's limit is per
 * Damage Roll, so explode is refused when more than one Die term is present.
 * @returns {{modified:number, terms:string[]}}
 */
export function applyDiceRulesToRolls(rolls, rules = {}) {
  const dieTerms = [];
  for (const roll of rolls ?? []) {
    if (roll?._evaluated) fail("Rolls are already evaluated; use applyDiceRules on the results instead.");
    for (const term of roll?.terms ?? []) {
      if (Number.isInteger(term?.faces) && Array.isArray(term?.modifiers)) dieTerms.push({ roll, term });
    }
  }
  if (rules.explode && dieTerms.length > 1) fail("Weapon Tuning's added-dice limit spans the whole Damage Roll; resolve explosions manually for multi-term rolls.");
  const touched = new Set(), terms = [];
  for (const { roll, term } of dieTerms) {
    const mods = diceRuleModifiers(rules, term.faces);
    if (!mods.length) continue;
    term.modifiers.push(...mods);
    touched.add(roll);
    terms.push(`d${term.faces}${mods.join("")}`);
  }
  for (const roll of touched) roll.resetFormula?.();
  return { modified: terms.length, terms };
}

/* -------------------------------------------------------------------------- */
/*  Discrepancy surfacing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compare reduction implementations over input cases without merging them.
 * Implementations are injected to avoid import cycles with callers.
 * @param {{amount:number, reduction:number, resistance?:boolean, vulnerability?:boolean}[]} cases
 * @param {{reductionPreview?:Function, damageAfterReduction?:Function}} impls
 * @returns {{input:object, results:object, differs:boolean}[]}
 */
export function compareReductionImplementations(cases, impls = {}) {
  return cases.map(input => {
    const opts = { resistance: Boolean(input.resistance), vulnerability: Boolean(input.vulnerability) };
    const results = {};
    for (const [name, fn] of Object.entries(impls)) {
      try { results[name] = fn(input.amount, input.reduction, opts); } catch (error) { results[name] = `throws: ${error.message}`; }
    }
    try { results.resolveDamage = resolveDamage({ amount: input.amount, reduction: input.reduction, ...opts }).final; }
    catch (error) { results.resolveDamage = `throws: ${error.message}`; }
    const values = Object.values(results).map(v => (Number.isNaN(v) ? "NaN" : v));
    return { input, results, differs: new Set(values).size > 1 };
  });
}
