/** SI-3 trigger / rider / reaction layer.
 *
 * Nothing here registers at import time. The main agent wires
 * `registerTriggerEventHooks()` from ak5e.mjs (after `ready`).
 *
 * Verified against installed dnd5e 5.3.3 (dnd5e.mjs) and Foundry 13.351:
 *  - dnd5e.postRollAttack (rolls, { subject })          callAll, roller's client only     dnd5e.mjs:28597, 20416
 *  - dnd5e.rollSavingThrow (rolls, { ability, subject }) callAll, roller's client only    dnd5e.mjs:37534
 *  - dnd5e.rollConcentration (rolls, { subject })        callAll, roller's client only    dnd5e.mjs:37743
 *  - dnd5e.preApplyDamage (actor, amount, updates, options) Hooks.call (CANCELLABLE)       dnd5e.mjs:36739
 *  - dnd5e.applyDamage (actor, amount, options)          callAll, applying client only    dnd5e.mjs:36760
 *  - updateCombatant (combatant, changed, options, userId) callAll, every client           client-backend.mjs:299
 *  - combatTurnChange (combat, previous, current)        callAll, every client             combat.mjs:873
 *  - deleteCombat (combat, options, userId)              callAll, every client             client-backend.mjs:412
 *
 * Emission policy: roll and damage hooks are local to the client that made the
 * roll / applied the damage, so events are emitted there (that user owns the
 * Actor). Combat hooks arrive on every client, so turn, initiative and combat-end
 * events are emitted only on the active GM. No adapter returns a value, so none
 * can cancel a cancellable hook, and no adapter writes to a hook's options/updates. */
import { keyedSerial, gmActive, need, flag } from "./operation-kernel.mjs";
import { tagActors, tagHasExpired } from "./feature-tags.mjs";

export const AK5E_EVENT_KINDS = Object.freeze(["apSpent", "artCast", "attack", "hit", "crit", "hitTaken", "save", "initiative",
  "turnStart", "turnEnd", "kill", "combatEnd"]);
export const RIDER_FLAG = "triggerRiders";
export const REACTION_FLAG = "reactionBudget";
// Same trigger vocabulary as feature-tags tagExpiry(), so tagHasExpired() applies unchanged.
const EXPIRY_TRIGGERS = ["manual", "shortRest", "longRest", "combatEnd", "turnStart", "turnEnd", "nextTurnEnd",
  "currentTurnEnd", "time", "concentration", "attack"];

const serial = keyedSerial();
const log = (...args) => console.error("AK5e | Trigger events", ...args);

/* -------------------------------------------- */
/*  Event layer                                 */
/* -------------------------------------------- */

const handlers = new Map(AK5E_EVENT_KINDS.map(kind => [kind, []]));

export function onAk5eEvent(kind, handler) {
  need(handlers.has(kind), `Unknown AK5e event kind: ${kind}`);
  need(typeof handler === "function", "An AK5e event handler must be a function.");
  handlers.get(kind).push(handler);
  return handler;
}

export function offAk5eEvent(kind, handler) {
  const list = handlers.get(kind);
  const index = list?.indexOf(handler) ?? -1;
  if (index >= 0) list.splice(index, 1);
  return index >= 0;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Payload = frozen structured copy of its plain data. `raw` is a frozen container of
 * LIVE dnd5e/Foundry references (rolls, documents) which are deliberately not copied
 * or frozen; handlers must treat them as read-only. Hook options/updates objects are
 * never exposed. */
export function freezePayload(kind, payload = {}) {
  const { raw = {}, ...plain } = payload;
  return Object.freeze({ ...deepFreeze(structuredClone({ ...plain, kind })), raw: Object.freeze({ ...raw }) });
}

/** Handlers run sequentially in registration order; a throwing/rejecting handler is
 * logged and skipped, never breaking the emitter or later handlers. */
export async function emitAk5eEvent(kind, payload = {}) {
  need(handlers.has(kind), `Unknown AK5e event kind: ${kind}`);
  const event = Object.isFrozen(payload) && payload.kind === kind ? payload : freezePayload(kind, payload);
  let errors = 0;
  for (const handler of [...handlers.get(kind)]) {
    try { await handler(event); }
    catch (error) { errors += 1; log(`handler failed for ${kind}`, error); }
  }
  return { event, errors };
}

/* -------------------------------------------- */
/*  Pure helpers used by the adapters           */
/* -------------------------------------------- */

const combatContext = (combat = game.combat) => combat?.started
  ? { combatUuid: combat.uuid ?? null, round: combat.round ?? null, turn: combat.turn ?? null }
  : { combatUuid: null, round: null, turn: null };

const tokenUuidOf = actor => actor?.isToken ? actor.token?.uuid ?? null : null;

function currentTargets() {
  const describe = globalThis.dnd5e?.utils?.getTargetDescriptors;
  if (typeof describe === "function") return describe();
  // Same shape as dnd5e getTargetDescriptors (dnd5e.mjs:639).
  const targets = new Map();
  for (const token of game.user?.targets ?? []) {
    const actor = token.actor;
    if (actor?.uuid) targets.set(actor.uuid, { name: token.name, uuid: actor.uuid,
      ac: actor.statuses?.has?.("coverTotal") ? null : actor.system?.attributes?.ac?.value ?? null });
  }
  return [...targets.values()];
}

/** Mirrors dnd5e's chat-card evaluation (dnd5e.mjs:69480):
 * miss = !critical && (total < ac || fumble). An unknown AC (null; dnd5e uses null for
 * total cover) is reported as `null` (undetermined) rather than as a hit. */
export function attackHits(roll, ac) {
  if (ac === null || ac === undefined || !Number.isFinite(Number(ac))) return null;
  if (roll.isCritical) return true;
  return !(roll.total < Number(ac) || roll.isFumble);
}

/** Mirror of core Combat##triggerTurnEvents (combat.mjs) computed from the
 * combatTurnChange arguments, so skipped turns are reported in order. */
export function turnTransitions(combat, previous, current) {
  const turns = combat.turns ?? [], out = [];
  if (!previous || !current) return out;
  const intervals = [];
  let roundDelta = current.round - previous.round;
  if (roundDelta === 0) {
    if (current.round > 0 && previous.turn < current.turn) intervals.push([previous.turn + 1, current.turn]);
  } else if (roundDelta > 0) {
    if (previous.round > 0) intervals.push([previous.turn + 1, turns.length - 1]);
    while (--roundDelta) intervals.push([0, turns.length - 1]);
    intervals.push([0, current.turn ?? 0]);
  }
  if (intervals.length) {
    let prior = { combatant: combat.combatants?.get?.(previous.combatantId) ?? null, round: previous.round, turn: previous.turn, skipped: false };
    for (const [from, to] of intervals) for (let turn = from; turn <= to; turn++) {
      const round = prior.round + (turn === 0);
      const next = { combatant: turns[turn], round, turn, skipped: round !== current.round || turn !== current.turn };
      if (prior.combatant) out.push({ kind: "turnEnd", ...prior });
      if (next.combatant) out.push({ kind: "turnStart", ...next });
      prior = next;
    }
  } else if (current.combatantId !== previous.combatantId && current.round === previous.round && current.turn === previous.turn) {
    const prior = combat.combatants?.get?.(previous.combatantId), next = combat.combatant;
    if (prior) out.push({ kind: "turnEnd", combatant: prior, round: current.round, turn: current.turn, skipped: false });
    if (next) out.push({ kind: "turnStart", combatant: next, round: current.round, turn: current.turn, skipped: false });
  }
  return out;
}

/* -------------------------------------------- */
/*  Hook adapters                               */
/* -------------------------------------------- */

const seenRolls = new WeakSet();
const damageBefore = new WeakMap();      // options object -> Map(actorUuid -> { hp, temp })
const damageSeen = new WeakMap();        // options object -> Set(actorUuid)
const lastSeenState = new Map();       // combat uuid -> { round, turn, combatantId } last processed
const lastTurnKey = new Map();           // combat uuid -> last emitted transition key
const endedCombats = new Set();
let attackSequence = 0;

const fire = promise => { promise.catch(error => log("adapter failed", error)); };
const randomId = () => globalThis.foundry?.utils?.randomID?.() ?? `${Date.now().toString(36)}${(++attackSequence).toString(36)}`;

export async function handlePostRollAttack(rolls, data = {}) {
  const roll = rolls?.[0];
  if (!roll || seenRolls.has(roll)) return;               // dedupe: one attack per evaluated roll
  seenRolls.add(roll);
  const subject = data.subject ?? null, actor = subject?.actor ?? null;
  const attackId = randomId();
  const targets = currentTargets().map(t => ({ uuid: t.uuid, name: t.name ?? "", ac: t.ac ?? null, hit: attackHits(roll, t.ac) }));
  const base = { attackId, actorUuid: actor?.uuid ?? null, tokenUuid: tokenUuidOf(actor), itemUuid: subject?.item?.uuid ?? null,
    activityUuid: subject?.uuid ?? null, total: roll.total ?? null, critical: Boolean(roll.isCritical), fumble: Boolean(roll.isFumble),
    targets, targetUuids: targets.map(t => t.uuid), userId: game.user?.id ?? null, ...combatContext(),
    raw: { rolls, subject, actor } };
  await emitAk5eEvent("attack", { ...base, eventId: `attack:${attackId}` });
  for (const target of targets.filter(t => t.hit === true))
    await emitAk5eEvent("hit", { ...base, eventId: `hit:${attackId}:${target.uuid}`, targetUuid: target.uuid, ac: target.ac });
  if (base.critical) await emitAk5eEvent("crit", { ...base, eventId: `crit:${attackId}` });
  // "attack"-expiry riders end after the consumers above have had the chance to consume them.
  if (actor?.isOwner) await expireRiders({ kind: "attack", actorUuid: actor.uuid }, { actors: [actor], operator: true });
}

const concentrationRolls = new WeakSet();
const macrotask = () => new Promise(resolve => setTimeout(resolve, 0));
export async function handleSavingThrow(rolls, data = {}, { concentration = false } = {}) {
  const roll = rolls?.[0];
  if (!roll) return;
  // dnd5e rolls a concentration save through rollSavingThrow, so the same roll arrives first as a plain
  // save. Mark it from rollConcentration and let the plain-save delivery decide after the microtasks settle.
  if (concentration) { concentrationRolls.add(roll); return; }
  if (seenRolls.has(roll)) return;
  seenRolls.add(roll);
  // Death saves go through rollSavingThrow without an ability; they are not "saves" for AK5e triggers.
  if (data.ability === undefined || data.ability === null || data.ability === "death") return;
  await macrotask();
  concentration = concentrationRolls.has(roll);
  const actor = data.subject ?? null, dc = Number.isFinite(Number(roll.options?.target)) ? Number(roll.options.target) : null;
  await emitAk5eEvent("save", { eventId: `save:${randomId()}`, actorUuid: actor?.uuid ?? null, tokenUuid: tokenUuidOf(actor),
    ability: data.ability ?? roll.options?.ability ?? null, concentration, total: roll.total ?? null, dc,
    success: dc === null ? null : Boolean(roll.isSuccess), userId: game.user?.id ?? null, ...combatContext(),
    raw: { rolls, actor } });
}

/** Synchronous; READS ONLY. Never returns false, never writes options or updates. */
export function capturePreApplyDamage(actor, _amount, _updates, options) {
  if (!actor?.uuid || !options || typeof options !== "object") return;
  const hp = actor.system?.attributes?.hp;
  if (!hp) return;
  const map = damageBefore.get(options) ?? new Map();
  map.set(actor.uuid, { hp: Number(hp.value) || 0, temp: Number(hp.temp) || 0 });
  damageBefore.set(options, map);
}

function originActorUuid(message) {
  try {
    const speakerActor = message?.speaker && globalThis.ChatMessage?.implementation?.getSpeakerActor?.(message.speaker);
    return speakerActor?.uuid ?? null;
  } catch { return null; }
}

export async function handleApplyDamage(actor, amount, options) {
  if (!actor?.uuid || !options || typeof options !== "object" || !(Number(amount) > 0)) return;
  const seen = damageSeen.get(options) ?? new Set();
  if (seen.has(actor.uuid)) return;                       // dedupe per (options, actor)
  seen.add(actor.uuid); damageSeen.set(options, seen);
  const before = damageBefore.get(options)?.get(actor.uuid) ?? null;
  const hpAfter = Number(actor.system?.attributes?.hp?.value) || 0;
  const message = options.originatingMessage ?? options.origin ?? null;
  const base = { actorUuid: actor.uuid, tokenUuid: tokenUuidOf(actor), amount: Number(amount),
    hpBefore: before?.hp ?? null, hpAfter, sourceActorUuid: originActorUuid(message), messageUuid: message?.uuid ?? null,
    userId: game.user?.id ?? null, ...combatContext(), raw: { actor, message } };
  const id = randomId();
  await emitAk5eEvent("hitTaken", { ...base, eventId: `hitTaken:${id}` });
  if (before && before.hp > 0 && hpAfter <= 0) await emitAk5eEvent("kill", { ...base, eventId: `kill:${id}` });
}

export async function handleUpdateCombatant(combatant, changed, _options, userId) {
  if (!gmActive() || !changed || !("initiative" in changed) || !Number.isFinite(changed.initiative)) return;
  const combat = combatant.parent ?? combatant.combat ?? null, actor = combatant.actor ?? null;
  await emitAk5eEvent("initiative", { eventId: `initiative:${combatant.uuid}:${randomId()}`, actorUuid: actor?.uuid ?? null,
    tokenUuid: combatant.token?.uuid ?? null, combatantId: combatant.id, initiative: changed.initiative, userId: userId ?? null,
    combatUuid: combat?.uuid ?? null, round: combat?.round ?? null, turn: combat?.turn ?? null, raw: { combatant, combat, actor } });
}

export async function handleCombatTurnChange(combat, previous, current) {
  if (!gmActive() || !combat) return;
  // Foundry mutates combat.previous in place when the GM advances again before the first hook runs, so the
  // arguments can already describe a later state. Walk from the last state this module processed instead.
  const seen = lastSeenState.get(combat.uuid), now = current ? { round: current.round, turn: current.turn, combatantId: current.combatantId } : null;
  if (seen && now && combat.started !== false) previous = seen;
  if (now) lastSeenState.set(combat.uuid, now);
  const key = JSON.stringify([previous?.round, previous?.turn, previous?.combatantId, current?.round, current?.turn, current?.combatantId]);
  // Only an identical consecutive delivery is a duplicate; a GM rewind followed by the
  // same advance is a new transition and is emitted again (core does the same).
  if (lastTurnKey.get(combat.uuid) === key) return;
  lastTurnKey.set(combat.uuid, key);
  const steps = turnTransitions(combat, previous, current);
  if (!steps.length) return;
  for (const step of steps) {
    const combatant = step.combatant, actor = combatant?.actor ?? null;
    // Reactions refresh at the start of the creature's own Turn, before consumers run,
    // so a consumer may grant a fresh restricted Reaction (e.g. Well-Drilled) afterwards.
    if (step.kind === "turnStart" && actor) {
      try { await refreshReactions(actor); } catch (error) { log("reaction refresh failed", error); }
    }
    await emitAk5eEvent(step.kind, { eventId: `${step.kind}:${combat.uuid}:${step.round}:${step.turn}:${combatant?.id}`,
      actorUuid: actor?.uuid ?? null, tokenUuid: combatant?.token?.uuid ?? null, combatantId: combatant?.id ?? null,
      combatUuid: combat.uuid, round: step.round, turn: step.turn, skipped: step.skipped, raw: { combat, combatant, actor } });
  }
  await expireRiders({ kind: "combatTurn", combat });
}

export async function handleDeleteCombat(combat) {
  if (!gmActive() || !combat?.started || endedCombats.has(combat.uuid)) return;
  endedCombats.add(combat.uuid); lastTurnKey.delete(combat.uuid); lastSeenState.delete(combat.uuid);
  await emitAk5eEvent("combatEnd", { eventId: `combatEnd:${combat.uuid}`, combatUuid: combat.uuid, round: combat.round ?? null,
    turn: null, actorUuids: [...(combat.combatants ?? [])].map(c => c.actor?.uuid).filter(Boolean), raw: { combat } });
  await expireRiders({ kind: "combatEnd", combat });
}

const installedOn = new WeakSet();

/** Idempotent per Hooks registry. One additive adapter per hook; adapters return undefined. */
export function registerTriggerEventHooks() {
  const registry = globalThis.Hooks;
  if (!registry || installedOn.has(registry)) return false;
  installedOn.add(registry);
  registry.on("dnd5e.postRollAttack", (rolls, data) => { fire(handlePostRollAttack(rolls, data)); });
  registry.on("dnd5e.rollSavingThrow", (rolls, data) => { fire(handleSavingThrow(rolls, data)); });
  registry.on("dnd5e.rollConcentration", (rolls, data) => { fire(handleSavingThrow(rolls, data, { concentration: true })); });
  registry.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => { capturePreApplyDamage(actor, amount, updates, options); });
  registry.on("dnd5e.applyDamage", (actor, amount, options) => { fire(handleApplyDamage(actor, amount, options)); });
  registry.on("updateCombatant", (combatant, changed, options, userId) => { fire(handleUpdateCombatant(combatant, changed, options, userId)); });
  registry.on("combatTurnChange", (combat, previous, current) => { fire(handleCombatTurnChange(combat, previous, current)); });
  registry.on("deleteCombat", combat => { fire(handleDeleteCombat(combat)); });
  return true;
}

/* -------------------------------------------- */
/*  Permissions and storage helpers             */
/* -------------------------------------------- */

function assertWritable(actor) {
  need(actor?.documentName === "Actor" && !actor.pack, "A live Actor is required.");
  need(actor.isOwner, "You must own this Actor (or be the GM) to change its AK5e trigger state.");
}

const updateOptions = actor => actor.isToken ? { diff: false } : {};

async function resolveActor(actorOrUuid) {
  if (actorOrUuid?.documentName) return actorOrUuid;
  if (typeof actorOrUuid === "string") return fromUuid(actorOrUuid);
  return null;
}

/* -------------------------------------------- */
/*  Riders                                      */
/* -------------------------------------------- */

const matchers = new Map();      // matcher name -> fn (survives reload when re-registered at load)
const transientMatch = new Map(); // rider id -> fn (memory only)

export function registerRiderMatcher(name, fn) {
  need(typeof name === "string" && name && typeof fn === "function", "A matcher needs a name and a function.");
  matchers.set(name, fn);
}

export function riderRecords(actor) {
  return Object.values(structuredClone(flag(actor, RIDER_FLAG) ?? {}));
}

/** tagHasExpired() silently returns false when its anchor fields are missing, which would make a
 * rider immortal; require exactly the fields it reads for each trigger. */
const EXPIRY_FIELDS = { combatEnd: ["combatUuid"], turnStart: ["combatUuid", "combatantId", "round"], turnEnd: ["combatUuid", "combatantId", "round"],
  nextTurnEnd: ["combatUuid", "combatantId", "round"], currentTurnEnd: ["combatUuid", "combatantId", "round"], time: ["worldTime"],
  concentration: ["effectUuid"], attack: ["actorUuid"], shortRest: ["actorUuid"], longRest: ["actorUuid"] };
function validateExpiry(expiry) {
  const value = expiry ?? { trigger: "manual" };
  need(value && EXPIRY_TRIGGERS.includes(value.trigger), "A rider expiry must use a feature-tags expiry trigger.");
  for (const field of EXPIRY_FIELDS[value.trigger] ?? []) need(value[field] !== undefined && value[field] !== null && value[field] !== "",
    `A "${value.trigger}" rider expiry needs ${field} (build it with tagExpiry()); without it the rider would never expire.`);
  return structuredClone(value);
}

/** Durable record in flags.ak5e.triggerRiders[id], using feature-tags' expiry shape
 * (`expiry` / `expiries`) so tagHasExpired() applies. `match` may be a registered
 * matcher name (durable) or a function (memory only; fails closed after reload). */
export async function registerRider({ id, actorUuid, actor, trigger, match = null, consume = "once", expiry, expiries,
  effectRef = null, label = "", sourceActorUuid = null } = {}) {
  need(typeof id === "string" && /^[A-Za-z0-9_:-]{1,120}$/.test(id), "A stable rider ID is required (letters, digits, _ : - only; a dot would split the flag path).");
  need(AK5E_EVENT_KINDS.includes(trigger), `Unknown rider trigger: ${trigger}`);
  need(["once", "untilExpiry"].includes(consume), "Rider consume must be 'once' or 'untilExpiry'.");
  need(match === null || typeof match === "string" || typeof match === "function", "Rider match must be a matcher name or function.");
  const target = await resolveActor(actor ?? actorUuid);
  assertWritable(target);
  const record = { id, kind: "rider", targetActorUuid: target.uuid, sourceActorUuid, label: String(label), trigger, consume,
    matcher: typeof match === "string" ? match : null, transientMatch: typeof match === "function",
    expiry: validateExpiry(expiry), effectRef: structuredClone(effectRef), status: "active", receipts: {} };
  if (expiries) record.expiries = expiries.map(validateExpiry);
  return serial(target, async () => {
    const existing = (flag(target, RIDER_FLAG) ?? {})[id];
    if (existing) return structuredClone(existing);        // idempotent registration
    const result = await target.update({ [`flags.ak5e.${RIDER_FLAG}.${id}`]: record }, updateOptions(target));
    need(result, "The rider could not be saved.");
    if (typeof match === "function") transientMatch.set(id, match);
    return structuredClone(record);
  });
}

function riderMatches(record, payload) {
  if (record.status !== "active" || record.trigger !== payload.kind) return false;
  if (tagHasExpired(record, { kind: "time", worldTime: Number(game.time?.worldTime ?? 0) })) return false;
  const fn = record.matcher ? matchers.get(record.matcher) : record.transientMatch ? transientMatch.get(record.id) : null;
  if ((record.matcher || record.transientMatch) && !fn) return false;   // fail closed after reload
  try { return fn ? Boolean(fn(payload, structuredClone(record))) : true; }
  catch (error) { log("rider matcher failed", record.id, error); return false; }
}

/** Pure read: active, unexpired riders on the payload's Actor whose trigger and matcher accept it. */
export function matchRiders(payload, actor = payload?.raw?.actor ?? payload?.raw?.subject?.actor ??
  (payload?.actorUuid ? globalThis.fromUuidSync?.(payload.actorUuid) : null)) {
  if (!actor) return [];
  return riderRecords(actor).filter(record => riderMatches(record, payload));
}

/** Idempotent: the same receipt (default: the attack ID) replays; a 'once' rider
 * consumed under one receipt refuses every other receipt and writes nothing. */
export async function consumeRider(id, { actor, actorUuid, receipt } = {}) {
  need(typeof receipt === "string" && receipt, "A consumption receipt (e.g. the attack ID) is required.");
  const target = await resolveActor(actor ?? actorUuid) ?? tagActors().find(a => (flag(a, RIDER_FLAG) ?? {})[id]);
  if (!target) return { ok: false, reason: "missing" };
  assertWritable(target);
  return serial(target, async () => {
    const record = structuredClone((flag(target, RIDER_FLAG) ?? {})[id] ?? null);
    if (!record) return { ok: false, reason: "missing" };
    if (record.receipts?.[receipt]) return { ok: true, replayed: true, rider: record };
    if (record.status !== "active") return { ok: false, reason: "consumed" };
    record.receipts = { ...(record.receipts ?? {}), [receipt]: true };
    if (record.consume === "once") { record.status = "consumed"; record.consumedBy = receipt; }
    const result = await target.update({ [`flags.ak5e.${RIDER_FLAG}.${id}`]: record }, updateOptions(target));
    need(result, "The rider consumption could not be saved.");
    return { ok: true, replayed: false, rider: record };
  });
}

export async function removeRider(actor, id) {
  assertWritable(actor);
  return serial(actor, async () => {
    if (!(flag(actor, RIDER_FLAG) ?? {})[id]) return false;
    await actor.update({ [`flags.ak5e.${RIDER_FLAG}.-=${id}`]: null }, updateOptions(actor));
    transientMatch.delete(id);
    return true;
  });
}

/** Removes riders whose feature-tags expiry matches the event (same event shapes as
 * expireFeatureTags). Consumed 'once' riders are pruned on any non-attack event.
 * Runs only where this client is the operator: the active GM, or `operator: true`
 * (the rolling owner for attack expiry). Errors are logged per rider. */
export async function expireRiders(event, { actors = tagActors(), operator = gmActive() } = {}) {
  if (!operator) return [];
  const removed = [];
  for (const actor of actors) {
    if (!actor?.isOwner || actor.pack) continue;
    for (const record of riderRecords(actor)) {
      const prune = record.status === "consumed" && event.kind !== "attack";
      try { if ((prune || tagHasExpired(record, event)) && await removeRider(actor, record.id)) removed.push(record.id); }
      catch (error) { log("rider expiry failed", record.id, error); }
    }
  }
  return removed;
}

/* -------------------------------------------- */
/*  Reaction budget                             */
/* -------------------------------------------- */

/** Base maximum of 1 is INFERRED from Reactive (Ch. 3 L1034, "two Reactions instead of
 * only one"); Chapter 1 does not state it. Override per Actor with setMax(). */
export const DEFAULT_REACTION_MAX = 1;

export function normalizeReactions(stored) {
  const s = structuredClone(stored ?? {});
  return { max: Number.isInteger(s.max) && s.max >= 0 ? s.max : DEFAULT_REACTION_MAX,
    spent: Number.isInteger(s.spent) && s.spent >= 0 ? s.spent : 0,
    extra: Array.isArray(s.extra) ? s.extra.map(e => ({ id: e.id, label: e.label ?? "", count: e.count ?? 1, spent: e.spent ?? 0,
      restrictedTo: [...(e.restrictedTo ?? [])], sourceActorUuid: e.sourceActorUuid ?? null, atTurnStart: e.atTurnStart })) : [],
    triggers: s.triggers ?? {}, receipts: s.receipts ?? {} };
}

export const flagReactionStore = Object.freeze({
  read: actor => flag(actor, REACTION_FLAG),
  write: async (actor, state) => {
    // Flag objects are merged recursively on update, so emptied maps must be force-replaced ("==")
    // or cleared triggers/receipts would persist forever.
    const { triggers, receipts, ...rest } = state;
    const result = await actor.update({ [`flags.ak5e.${REACTION_FLAG}`]: { ...rest, "==triggers": triggers ?? {}, "==receipts": receipts ?? {} } }, updateOptions(actor));
    need(result, "The Reaction state could not be saved.");
  }
});

const usable = (extra, tags) => !extra.restrictedTo.length || extra.restrictedTo.some(tag => tags.includes(tag));

/** Small get/spend/refund/refresh interface over a replaceable store, so the main agent
 * can later back it with an SI-2 resource pool. */
export function createReactionBudget({ store = flagReactionStore } = {}) {
  const get = actor => {
    const state = normalizeReactions(store.read(actor));
    return { ...state, available: Math.max(0, state.max - state.spent) +
      state.extra.reduce((sum, e) => sum + Math.max(0, e.count - e.spent), 0) };
  };
  const mutate = async (actor, change) => {
    assertWritable(actor);
    return serial(actor, async () => {
      const state = normalizeReactions(store.read(actor));
      const result = await change(state);
      if (result.write) await store.write(actor, state);
      return result.value;
    });
  };

  /** pool: "auto" (restricted extras whose tags match, then unrestricted extras, then
   * base), "base", or an extra's id. perTrigger (default true, per Reactive L1034):
   * at most one Reaction per triggerId until the next refresh. Rejections write nothing. */
  const spend = async (actor, { triggerId, tags = [], perTrigger = true, pool = "auto", receipt = null } = {}) => {
    need(typeof triggerId === "string" && triggerId, "A Reaction must name the trigger it responds to (triggerId).");
    need(Array.isArray(tags), "Reaction tags must be a list.");
    return mutate(actor, state => {
    if (receipt && state.receipts[receipt]) return { write: false, value: { ok: true, replayed: true, pool: state.receipts[receipt].pool } };
    if (perTrigger && triggerId && state.triggers[triggerId]) return { write: false, value: { ok: false, reason: "perTrigger" } };
    const open = state.extra.filter(e => e.spent < e.count);
    let chosen = null;
    if (pool === "auto") {
      chosen = open.find(e => e.restrictedTo.length && usable(e, tags)) ?? open.find(e => !e.restrictedTo.length) ??
        (state.spent < state.max ? "base" : null);
      if (!chosen) return { write: false, value: { ok: false, reason: open.length ? "restricted" : "exhausted" } };
    } else if (pool === "base") {
      if (state.spent >= state.max) return { write: false, value: { ok: false, reason: "exhausted" } };
      chosen = "base";
    } else {
      const extra = state.extra.find(e => e.id === pool);
      if (!extra || extra.spent >= extra.count) return { write: false, value: { ok: false, reason: "exhausted" } };
      if (!usable(extra, tags)) return { write: false, value: { ok: false, reason: "restricted" } };
      chosen = extra;
    }
    if (chosen === "base") state.spent += 1; else chosen.spent += 1;
    const used = chosen === "base" ? "base" : chosen.id;
    state.triggers[triggerId] = true;
    if (receipt) state.receipts[receipt] = { pool: used, triggerId };
    return { write: true, value: { ok: true, replayed: false, pool: used } };
    });
  };

  /** "regain use of your Reaction". With a receipt, refunds that spend's pool once. */
  const refund = async (actor, { receipt = null, pool = "base", clearTrigger = false } = {}) => mutate(actor, state => {
    let target = pool, record = null;
    if (receipt) {
      record = state.receipts[receipt];
      if (!record) return { write: false, value: { ok: false, reason: "missing" } };
      if (record.refunded) return { write: false, value: { ok: true, replayed: true } };
      target = record.pool;
    }
    const extra = target === "base" ? null : state.extra.find(e => e.id === target);
    const spent = target === "base" ? state.spent : extra?.spent ?? 0;
    if (spent <= 0) return { write: false, value: { ok: false, reason: "nothingSpent" } };
    if (extra) extra.spent -= 1; else state.spent -= 1;
    if (record) { record.refunded = true; if (clearTrigger && record.triggerId) delete state.triggers[record.triggerId]; }
    return { write: true, value: { ok: true, replayed: false, pool: target } };
  });

  /** atTurnStart is REQUIRED: "regain" (e.g. Automated Defences, Ch. 6 L2186),
   * "expire" or "keep". Re-granting the same id replaces it (no stacking). */
  const grantExtra = async (actor, { id, count = 1, restrictedTo = [], atTurnStart, label = "", sourceActorUuid = null } = {}) => {
    need(typeof id === "string" && id, "An extra Reaction needs a stable id.");
    need(Number.isInteger(count) && count > 0, "An extra Reaction count must be a positive integer.");
    need(["regain", "expire", "keep"].includes(atTurnStart), "Choose what happens to this extra Reaction at turn start.");
    need(Array.isArray(restrictedTo) && restrictedTo.every(t => typeof t === "string"), "restrictedTo must be a list of tags.");
    return mutate(actor, state => {
      state.extra = state.extra.filter(e => e.id !== id);
      state.extra.push({ id, label, count, spent: 0, restrictedTo: [...restrictedTo], sourceActorUuid, atTurnStart });
      return { write: true, value: { ok: true } };
    });
  };

  const refresh = async (actor) => {
    const state = normalizeReactions(store.read(actor));
    const changes = state.spent || Object.keys(state.triggers).length || Object.keys(state.receipts).length ||
      state.extra.some(e => e.atTurnStart === "expire" || (e.atTurnStart === "regain" && e.spent));
    if (!changes) return { ok: true, changed: false };   // no write for untouched Actors
    return mutate(actor, current => {
      current.spent = 0; current.triggers = {}; current.receipts = {};
      current.extra = current.extra.filter(e => e.atTurnStart !== "expire").map(e => e.atTurnStart === "regain" ? { ...e, spent: 0 } : e);
      return { write: true, value: { ok: true, changed: true } };
    });
  };

  const setMax = async (actor, max) => {
    need(Number.isInteger(max) && max >= 0, "A Reaction maximum must be a non-negative integer.");
    return mutate(actor, state => { state.max = max; return { write: true, value: { ok: true } }; });
  };

  return { get, spend, refund, refresh, grantExtra, setMax };
}

let budget = createReactionBudget();
/** Replace the backing store (e.g. an SI-2 resource pool adapter). */
export function setReactionStore(store) { budget = createReactionBudget({ store }); return budget; }
export const getReactions = actor => budget.get(actor);
export const spendReaction = (actor, options) => budget.spend(actor, options);
export const refundReaction = (actor, options) => budget.refund(actor, options);
export const grantExtraReaction = (actor, options) => budget.grantExtra(actor, options);
export const refreshReactions = actor => budget.refresh(actor);
export const setReactionMax = (actor, max) => budget.setMax(actor, max);
