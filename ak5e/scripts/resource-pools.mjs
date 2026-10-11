/** SI-2 resource-pool kernel: class-table / level / PB / ability maxima, over-maximum values,
 * recovery triggers, delta-based spend / refund, and a once-per-turn/round limiter.
 * Registry entries (definePool) are code; actor state lives only under
 * flags.ak5e.resourcePools.<poolId> = { value, last, receipts } and
 * flags.ak5e.resourcePools._limits.<key> = { cycle, who }. Pool ids must start with a letter,
 * so "_limits" can never collide. Reading never writes. Nothing here touches
 * flags.ak5e.featureTracking or native system.uses, and nothing registers at import time.
 *
 * Semantics (documented, see DECISIONS proposals in the SI-2 report):
 *  - spend: delta; rejected (zero writes) when amount is not a whole number >= 0 or exceeds value.
 *    With overMax the value includes the excess, so spending always consumes the excess first.
 *  - refund / gain: clamped to max unless overMax (then it may exceed max). setPool clamps likewise.
 *  - recovery amount: 'full' raises to max (never lowers), 'toMax' sets to max exactly (drops any
 *    excess), 'toInitial' sets to the initial value, a whole number n adds n (clamp as refund).
 *    Per pool and call, only the FIRST matching recovery entry applies.
 */
import { flag, values, need, gmActive, keyedSerial } from "./operation-kernel.mjs";

export const TRIGGERS = ["sr", "lr", "initiative", "turnStart", "turnEnd", "combatEnd"];
export const LIMITER_SCOPES = ["turn", "round", "creaturePerTurn"];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const VARIABLE = /^(prof|level|classLevel|details\.level|attributes\.prof|abilities\.(str|dex|con|int|wis|cha)\.(mod|value))$/;
const RECEIPT_LIMIT = 24;
const serial = keyedSerial();

/* ---------------------------------------------------------------- safe formulas */

const FUNCTIONS = { min: [1, Infinity, Math.min], max: [1, Infinity, Math.max], floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil] };
const TOKEN = /(\d+(?:\.\d+)?)|@([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|([A-Za-z_]\w*)|([-+*/(),])/y;

function tokenize(text) {
  need(typeof text === "string" && text.trim().length > 0, "A formula must be a non-empty string.");
  need(text.length <= 200, "A formula may not exceed 200 characters.");
  const tokens = [];
  let at = 0;
  for (;;) {
    const rest = text.slice(at);
    if (/^\s*$/.test(rest)) return tokens;
    TOKEN.lastIndex = at + rest.search(/\S/);
    const match = TOKEN.exec(text);
    need(match, `Unexpected character '${rest.trim()[0]}' in formula "${text}".`);
    at = TOKEN.lastIndex;
    if (match[1] !== undefined) tokens.push({ type: "number", value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ type: "variable", value: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: "name", value: match[3] });
    else tokens.push({ type: "op", value: match[4] });
  }
}

/** Recursive descent: expr = term {(+|-) term}; term = unary {(*|/) unary}; unary = [+|-] unary | primary. */
function parse(text) {
  const tokens = tokenize(text);
  let at = 0, depth = 0;
  const peek = () => tokens[at];
  const isOp = value => peek()?.type === "op" && peek().value === value;
  const expect = value => { need(isOp(value), `Malformed formula "${text}": expected '${value}'.`); at += 1; };
  function nest(fn) { depth += 1; need(depth <= 32, "Formula is nested too deeply."); try { return fn(); } finally { depth -= 1; } }
  const expression = () => nest(() => {
    let left = term();
    while (isOp("+") || isOp("-")) { const op = tokens[at++].value; left = { op, left, right: term() }; }
    return left;
  });
  const term = () => {
    let left = unary();
    while (isOp("*") || isOp("/")) { const op = tokens[at++].value; left = { op, left, right: unary() }; }
    return left;
  };
  const unary = () => nest(() => {
    if (isOp("-")) { at += 1; return { op: "neg", operand: unary() }; }
    if (isOp("+")) { at += 1; return unary(); }
    return primary();
  });
  function primary() {
    const token = tokens[at++];
    need(token, `Malformed formula "${text}": it ends unexpectedly.`);
    if (token.type === "number") return { number: token.value };
    if (token.type === "variable") return { variable: token.value };
    if (token.type === "op" && token.value === "(") { const inner = expression(); expect(")"); return inner; }
    if (token.type === "name") {
      const spec = Object.hasOwn(FUNCTIONS, token.value) ? FUNCTIONS[token.value] : null;
      need(spec, `Unknown function "${token.value}" in formula "${text}".`);
      expect("(");
      const args = [expression()];
      while (isOp(",")) { at += 1; args.push(expression()); }
      expect(")");
      need(args.length >= spec[0] && args.length <= spec[1], `${token.value}() takes ${spec[0] === spec[1] ? spec[0] : `at least ${spec[0]}`} argument(s).`);
      return { call: spec[2], name: token.value, args };
    }
    throw new Error(`Malformed formula "${text}": unexpected '${token.value}'.`);
  }
  const tree = expression();
  need(at === tokens.length, `Malformed formula "${text}": unexpected '${tokens[at]?.value}'.`);
  return tree;
}

function lookup(variables, path) {
  let current = variables;
  for (const part of path.split(".")) {
    need(current !== null && typeof current === "object" && Object.hasOwn(current, part), `Unknown variable @${path}.`);
    current = current[part];
  }
  need(typeof current === "number" && Number.isFinite(current), `Variable @${path} is not a number.`);
  return current;
}

function run(node, variables) {
  if ("number" in node) return node.number;
  if ("variable" in node) return lookup(variables, node.variable);
  if (node.op === "neg") return -run(node.operand, variables);
  if (node.call) return node.call(...node.args.map(arg => run(arg, variables)));
  const left = run(node.left, variables), right = run(node.right, variables);
  if (node.op === "+") return left + right;
  if (node.op === "-") return left - right;
  if (node.op === "*") return left * right;
  need(right !== 0, "Division by zero in formula.");
  return left / right;
}

/** Compile once (throws on malformed text); evaluate against a plain variable object. Never uses eval/Function. */
export function compileFormula(text) {
  const tree = parse(text);
  const names = [];
  (function collect(node) { if ("variable" in node) names.push(node.variable); for (const k of ["operand", "left", "right"]) if (node[k]) collect(node[k]); node.args?.forEach(collect); })(tree);
  return { source: text, variables: [...new Set(names)], evaluate(variables = {}) {
    const result = run(tree, variables);
    need(Number.isFinite(result), `Formula "${text}" did not produce a finite number.`);
    return result;
  } };
}
export const evaluateFormula = (text, variables) => compileFormula(text).evaluate(variables);

/* ---------------------------------------------------------------- definitions */

const whole = (value, label) => { need(typeof value === "number" && Number.isInteger(value) && value >= 0, `${label} must be a whole number of 0 or more.`); return value; };

function normalizeMax(max, id) {
  if (typeof max === "number") return { kind: "fixed", value: whole(max, `Pool ${id} max`) };
  if (typeof max === "string") {
    const formula = compileFormula(max);
    for (const name of formula.variables) need(VARIABLE.test(name), `Unknown variable @${name} in the max of pool ${id}.`);
    return { kind: "formula", formula };
  }
  if (Array.isArray(max)) {
    need(max.length > 0, `Pool ${id} level table is empty.`);
    return { kind: "array", table: max.map((v, i) => whole(v, `Pool ${id} level ${i + 1}`)) };
  }
  need(max && typeof max === "object", `Pool ${id} needs a max (integer, level table or formula).`);
  const rows = Object.entries(max).map(([level, v]) => {
    need(/^[1-9]\d*$/.test(level), `Pool ${id} level keys must be positive whole numbers.`);
    return [Number(level), whole(v, `Pool ${id} level ${level}`)];
  }).sort((a, b) => a[0] - b[0]);
  need(rows.length > 0, `Pool ${id} level table is empty.`);
  return { kind: "steps", rows };
}

function normalizeRecovery(entry, id) {
  need(entry && TRIGGERS.includes(entry.on), `Pool ${id}: recovery trigger must be one of ${TRIGGERS.join(", ")}.`);
  const amount = entry.amount ?? "full";
  need(["full", "toMax", "toInitial"].includes(amount) || (Number.isInteger(amount) && amount > 0),
    `Pool ${id}: recovery amount must be 'full', 'toMax', 'toInitial' or a positive whole number.`);
  need(entry.when === undefined || typeof entry.when === "function", `Pool ${id}: recovery 'when' must be a function.`);
  return Object.freeze({ on: entry.on, amount, when: entry.when });
}

const registry = new Map();

/** Register a pool. Re-defining an id throws unless { replace: true }. */
export function definePool(definition, { replace = false } = {}) {
  const id = definition?.id;
  need(typeof id === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id), "A pool id must start with a letter and use only letters, digits, '_' or '-'.");
  need(replace || !registry.has(id), `Pool ${id} is already defined.`);
  need(definition.initial === undefined || definition.initial === "max" || Number.isInteger(definition.initial) && definition.initial >= 0, `Pool ${id}: initial must be 'max' or a whole number.`);
  need(definition.appliesTo === undefined || typeof definition.appliesTo === "function", `Pool ${id}: appliesTo must be a function.`);
  const normalized = Object.freeze({
    id, label: String(definition.label ?? id), max: normalizeMax(definition.max, id), overMax: definition.overMax === true,
    initial: definition.initial ?? "max", recovery: Object.freeze((definition.recovery ?? []).map(entry => normalizeRecovery(entry, id))),
    classId: definition.classId, levelBasis: definition.levelBasis, appliesTo: definition.appliesTo });
  need(normalized.levelBasis === undefined || ["level", "classLevel"].includes(normalized.levelBasis), `Pool ${id}: levelBasis must be 'level' or 'classLevel'.`);
  registry.set(id, normalized);
  return normalized;
}
export const getPoolDefinition = id => registry.get(id);
export const listPoolDefinitions = () => [...registry.values()];
export const clearPoolRegistry = () => registry.clear();
function requirePool(id) { const def = registry.get(id); need(def, `Unknown resource pool "${id}".`); return def; }

/* ---------------------------------------------------------------- reading */

function classLevel(actor, classId) {
  return values(actor?.items).filter(i => i.type === "class" && (flag(i, "chapterThreeId") === classId || i.system?.identifier === classId))
    .reduce((sum, i) => sum + (Number(i.system?.levels) || 0), 0);
}

/** Variables available to max formulas. Missing data is left out, so using it throws "Unknown variable". */
export function poolVariables(actor, def = {}) {
  const variables = { abilities: {} }, system = actor?.system ?? {};
  const prof = Number(system.attributes?.prof), level = Number(system.details?.level);
  if (Number.isFinite(prof) && system.attributes?.prof !== undefined) { variables.prof = prof; variables.attributes = { prof }; }
  if (Number.isFinite(level) && system.details?.level !== undefined) { variables.level = level; variables.details = { level }; }
  if (def.classId) variables.classLevel = classLevel(actor, def.classId);
  for (const key of ABILITIES) {
    const ability = system.abilities?.[key];
    if (ability && Number.isFinite(Number(ability.mod))) variables.abilities[key] = { mod: Number(ability.mod), ...(Number.isFinite(Number(ability.value)) ? { value: Number(ability.value) } : {}) };
  }
  return variables;
}

export function resolveMax(def, actor) {
  const { max } = def;
  let result;
  if (max.kind === "fixed") result = max.value;
  else if (max.kind === "formula") result = max.formula.evaluate(poolVariables(actor, def));
  else {
    const basis = def.levelBasis ?? (def.classId ? "classLevel" : "level");
    const level = Math.floor(Number(poolVariables(actor, def)[basis]));
    need(Number.isFinite(level), `Pool ${def.id}: the Actor's ${basis} is unknown.`);
    if (max.kind === "array") result = level < 1 ? 0 : max.table[Math.min(level, max.table.length) - 1];
    else result = max.rows.filter(([from]) => from <= level).at(-1)?.[1] ?? 0;
  }
  need(Number.isInteger(result) && result >= 0, `Pool ${def.id}: max ${result} is not a whole number of 0 or more (wrap divisions in floor() or ceil()).`);
  return result;
}

const stored = (actor, id) => flag(actor, "resourcePools")?.[id] ?? {};

function snapshot(actor, def) {
  const max = resolveMax(def, actor), record = stored(actor, def.id);
  const raw = Number.isInteger(record.value) && record.value >= 0 ? record.value : def.initial === "max" ? max : def.initial;
  const value = def.overMax ? raw : Math.min(raw, max);
  return { max, value, over: Math.max(0, value - max), initial: def.initial === "max" ? max : def.initial, record };
}

/** Current state of one pool. Never writes. */
export function getPool(actor, id) {
  const def = requirePool(id), { max, value, over } = snapshot(actor, def);
  return { id, label: def.label, value, max, over, overMax: def.overMax };
}

/** Whether the pool belongs to this Actor: def.appliesTo(actor) or, absent that, stored state exists. */
export const hasPool = (actor, def) => def.appliesTo ? Boolean(def.appliesTo(actor)) : stored(actor, def.id).value !== undefined;

/* ---------------------------------------------------------------- writing */

async function write(actor, update) {
  const result = await actor.update(update, actor.isToken ? { diff: false } : {});
  need(result, "The resource pool could not be saved.");
}
function checkActor(actor) { need(actor && typeof actor.update === "function" && !actor.pack, "Choose a live Actor."); }
const poolPath = id => `flags.ak5e.resourcePools.${id}`;
const remember = (record, receipts) => ({ ...record, receipts });

function amountOf(amount) {
  need(typeof amount === "number" && Number.isInteger(amount) && amount >= 0, "Enter a whole number of 0 or more.");
  return amount;
}

async function change(actor, id, op, amount, { reason = "" } = {}) {
  checkActor(actor);
  const n = amountOf(amount);
  return serial(actor, async () => {
    const def = requirePool(id), before = snapshot(actor, def);
    let value;
    if (op === "spend") { need(n <= before.value, `Not enough ${def.label}: ${n} needed, ${before.value} available.`); value = before.value - n; }
    else if (op === "set") value = def.overMax ? n : Math.min(before.max, n);
    else value = def.overMax ? before.value + n : Math.min(before.max, before.value + n);
    if (value !== before.value) {
      await write(actor, { [poolPath(id)]: { ...before.record, value, last: { op, amount: n, reason: String(reason).slice(0, 200), before: before.value, after: value } } });
    }
    return { id, op, before: before.value, after: value, applied: value - before.value, max: before.max, over: Math.max(0, value - before.max) };
  });
}
export const spendPool = (actor, id, amount, options) => change(actor, id, "spend", amount, options);
export const refundPool = (actor, id, amount, options) => change(actor, id, "refund", amount, options);
export const setPool = (actor, id, value, options) => change(actor, id, "set", value, options);

function applyRecovery(entry, before, def) {
  if (entry.amount === "full") return Math.max(before.value, before.max);
  if (entry.amount === "toMax") return before.max;
  if (entry.amount === "toInitial") return def.overMax ? before.initial : Math.min(before.initial, before.max);
  return def.overMax ? before.value + entry.amount : Math.min(before.max, before.value + entry.amount);
}

/**
 * Apply recovery for one trigger (or a list of triggers, e.g. a long rest = ['lr','sr']) to the
 * Actor's pools. options: { poolIds, eventKey, context }. A repeated eventKey is a no-op for that
 * pool (the receipt is written in the same update as the new value). Returns one result per
 * participating pool; a pool whose max/when throws yields { id, error } and does not block others.
 */
export async function recoverPool(actor, trigger, { poolIds, eventKey, context = {} } = {}) {
  checkActor(actor);
  const triggers = [trigger].flat();
  need(triggers.length > 0 && triggers.every(t => TRIGGERS.includes(t)), `Recovery trigger must be one of ${TRIGGERS.join(", ")}.`);
  need(eventKey === undefined || typeof eventKey === "string" && eventKey.length > 0 && eventKey.length <= 200, "An event key must be a short string.");
  const defs = (poolIds ? poolIds.map(requirePool) : listPoolDefinitions().filter(def => hasPool(actor, def)))
    .filter(def => def.recovery.some(r => triggers.includes(r.on)));
  if (!defs.length) return [];
  return serial(actor, async () => {
    const update = {}, results = [];
    for (const def of defs) {
      try {
        const before = snapshot(actor, def), receipts = Array.isArray(before.record.receipts) ? before.record.receipts : [];
        if (eventKey && receipts.includes(eventKey)) { results.push({ id: def.id, skipped: "receipt", before: before.value, after: before.value }); continue; }
        const entry = def.recovery.find(r => triggers.includes(r.on) && (!r.when || r.when(actor, { trigger: r.on, eventKey, ...context })));
        if (!entry) continue;
        const value = applyRecovery(entry, before, def);
        if (value !== before.value || eventKey) {
          update[poolPath(def.id)] = remember({ ...before.record, value, last: { op: "recover", trigger: entry.on, amount: entry.amount, before: before.value, after: value } },
            eventKey ? [...receipts, eventKey].slice(-RECEIPT_LIMIT) : receipts);
        }
        results.push({ id: def.id, trigger: entry.on, before: before.value, after: value, applied: value - before.value, max: before.max });
      } catch (error) { results.push({ id: def.id, error: error.message }); }
    }
    if (Object.keys(update).length) await write(actor, update);
    return results;
  });
}

/* ---------------------------------------------------------------- limiter */

/**
 * Pure cycle key generalising Standard Bearer's turnCycle (standard-bearer.mjs:45).
 *  - 'turn' / 'creaturePerTurn': the Actor's own turn cycle, reset at the start of the Actor's own
 *    Turn: `${combat.uuid}:${round - (combat.turn < index ? 1 : 0)}`.
 *  - 'round': `${combat.uuid}:r${round}`.
 * No-combat fallback (combat missing, not started, no current turn, or the Actor is not a
 * combatant): a world-time bucket `time:${floor(worldTime / roundTime)}` (roundTime defaults to 6 s,
 * CONFIG.time.roundTime), or the explicit constant 'outOfCombat' when no world time is supplied.
 * Those keys can never equal a combat key, so entering combat always starts a fresh cycle.
 */
export function limiterCycle(combat, actor, scope, { worldTime, roundTime = 6 } = {}) {
  need(LIMITER_SCOPES.includes(scope), `Limiter scope must be one of ${LIMITER_SCOPES.join(", ")}.`);
  const turns = Array.from(combat?.turns ?? []), index = turns.findIndex(t => t.actor?.uuid === actor?.uuid);
  const live = combat && combat.started !== false && Number(combat.round) > 0 && combat.turn !== null && combat.turn !== undefined;
  if (live && scope === "round") return `${combat.uuid}:r${combat.round}`;
  if (live && index >= 0) return `${combat.uuid}:${combat.round - (combat.turn < index ? 1 : 0)}`;
  return Number.isFinite(worldTime) ? `time:${Math.floor(worldTime / roundTime)}` : "outOfCombat";
}

const activeCombat = actor => values(globalThis.game?.combats).find(c => c.started && c.turns?.some(t => t.actor?.uuid === actor?.uuid)) ?? null;

/** once({ scope, key }) -> { check(actor, ctx), mark(actor, ctx), use(actor, ctx) }; ctx = { creature, combat, worldTime }. */
export function once({ scope, key }) {
  need(LIMITER_SCOPES.includes(scope), `Limiter scope must be one of ${LIMITER_SCOPES.join(", ")}.`);
  need(typeof key === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(key), "A limiter key may use letters, digits, '_' and '-' (1-80 characters).");
  const context = (actor, ctx = {}) => {
    need(scope !== "creaturePerTurn" || typeof ctx.creature === "string" && ctx.creature, "This limiter needs ctx.creature (a creature id or UUID).");
    return { cycle: limiterCycle(ctx.combat ?? activeCombat(actor), actor, scope, { worldTime: ctx.worldTime ?? globalThis.game?.time?.worldTime }), creature: ctx.creature };
  };
  const blocked = (actor, c) => {
    const mark = flag(actor, "resourcePools")?._limits?.[key];
    return mark?.cycle === c.cycle && (scope !== "creaturePerTurn" || (mark.who ?? []).includes(c.creature));
  };
  const mark = async (actor, ctx) => {
    checkActor(actor);
    return serial(actor, async () => {
      const c = context(actor, ctx);
      if (blocked(actor, c)) return false;
      const previous = flag(actor, "resourcePools")?._limits?.[key];
      const who = scope === "creaturePerTurn" ? [...(previous?.cycle === c.cycle ? previous.who ?? [] : []), c.creature] : [];
      await write(actor, { "flags.ak5e.resourcePools._limits": { [key]: { cycle: c.cycle, who } } });
      return true;
    });
  };
  /** True when the action is still available in the current cycle. Never writes. */
  const check = (actor, ctx) => !blocked(actor, context(actor, ctx));
  return { scope, key, check, mark, use: mark };
}

/* ---------------------------------------------------------------- hooks */

const log = error => { console.error("AK5e | Resource pools", error); globalThis.ui?.notifications?.error?.(error.message); };
const safely = promise => Promise.resolve(promise).then(results => { for (const r of [results].flat()) if (r?.error) log(new Error(`${r.id}: ${r.error}`)); }).catch(log);
const seenRests = new WeakSet();
/** A synchronous failure in a hook handler is logged, never thrown into Foundry's hook dispatcher. */
const guarded = handler => (...args) => { try { return handler(...args); } catch (error) { log(error); } };

/** Triggers a finished dnd5e rest should fire: the rest type's own recoverPeriods (long = lr + sr). */
export function restTriggers(config = {}) {
  const periods = new Set(globalThis.CONFIG?.DND5E?.restTypes?.[config.type]?.recoverPeriods ?? { short: ["sr"], long: ["lr", "sr"] }[config.type] ?? []);
  if (config.recoverShortRestUses) periods.add("sr");
  if (config.recoverLongRestUses) periods.add("lr");
  return ["lr", "sr"].filter(p => periods.has(p));
}

const event = (...parts) => parts.join(":");
const poolRun = (actor, trigger, eventKey, context) => actor ? safely(recoverPool(actor, trigger, { eventKey, context })) : undefined;

/** updateCombat(combat, changed, options, userId): Foundry sets combat.previous / combat.current before this hook fires. */
export const onUpdateCombat = guarded(function onUpdateCombat(combat, changed, options) {
  if (!gmActive() || !combat?.started || options?.turnEvents === false || !(changed && ("turn" in changed || "round" in changed))) return;
  const { previous, current } = combat;
  if (!previous || !current || (previous.round === current.round && previous.combatantId === current.combatantId)) return; // same combatant, same round: an index shift (combatant added/removed, initiative changed), not a new turn
  const runs = [];
  const ended = previous.round > 0 && previous.combatantId ? combat.combatants.get(previous.combatantId) : null;
  if (ended) runs.push(poolRun(ended.actor, "turnEnd", event("turnEnd", combat.id, previous.round, previous.turn, ended.id), { combat, combatant: ended }));
  const started = current.combatantId ? combat.combatants.get(current.combatantId) : null;
  if (started) runs.push(poolRun(started.actor, "turnStart", event("turnStart", combat.id, current.round, current.turn, started.id), { combat, combatant: started }));
  return Promise.all(runs);
});

/** updateCombatant(combatant, changed, options, userId): an initiative value being set (not cleared). */
export const onUpdateCombatant = guarded(function onUpdateCombatant(combatant, changed) {
  if (!gmActive() || typeof changed?.initiative !== "number" || !Number.isFinite(changed.initiative)) return;
  const combat = combatant.parent ?? combatant.combat;
  return poolRun(combatant.actor, "initiative", event("initiative", combat?.id, combatant.id), { combat, combatant });
});

/** deleteCombat(combat, options, userId): combat ended; recover every combatant's Actor. */
export const onDeleteCombat = guarded(function onDeleteCombat(combat) {
  if (!gmActive() || !combat?.started) return;
  return Promise.all(values(combat.combatants).map(c => poolRun(c.actor, "combatEnd", event("combatEnd", combat.id, c.id), { combat, combatant: c })));
});

/**
 * dnd5e.restCompleted(actor, result, config). The system calls this only on the client that ran the
 * rest (a player's own client for a player rest), so a GM-only gate would miss it; like
 * recoverFeatureTrackers it requires ownership instead. The same result object is applied once.
 */
export const onRestCompleted = guarded(function onRestCompleted(actor, result, config = {}) {
  if (!actor?.isOwner) return;
  const token = result && typeof result === "object" ? result : config;
  if (token && typeof token === "object") { if (seenRests.has(token)) return; seenRests.add(token); }
  const triggers = restTriggers(config);
  if (triggers.length) return poolRun(actor, triggers, undefined, { rest: config });
});

let registeredOn = null;
/** One handler per hook; calling it again is a no-op. Not called at import time. */
export function registerResourcePoolHooks() {
  if (registeredOn === globalThis.Hooks) return false;
  registeredOn = globalThis.Hooks;
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("updateCombatant", onUpdateCombatant);
  Hooks.on("deleteCombat", onDeleteCombat);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  return true;
}
