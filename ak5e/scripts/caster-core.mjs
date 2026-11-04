/**
 * Core Caster branch (Ch.3 L390–450), following WORKFLOW.md §3.2:
 * - Versatile Caster's second pool and its always-Prepared Arts belong to setup (caster-setup.mjs);
 * - Rabbit from the Hat is an owner-confirmed use that creates one managed borrowed Art until the next
 *   Long Rest; an expired grant is blocked by `casterGrant`, never by editing the Art;
 * - Power from Within recovers ceil(Caster level / 2) Arts Points after a completed Short Rest activity,
 *   capped at the maximum, once per Long Rest;
 * - Empowered Arts only arms the Caster's own damage roll (the bonus is applied by `patchCasterDamage`);
 *   nothing is rolled here;
 * - Master of the Elements exposes the frozen pool→Damage Type table, its Elemental Being resistance is a
 *   managed setup effect, and Maverick is a cast-scoped reading validated by the shared cast context;
 * - Savant selection is a Long Rest activity that records one Signature Art and never edits the Art; a
 *   non-damaging Signature discounts the quote through `casterGrant`; rerolls re-roll the dice of the
 *   actual damage roll (never a fresh unrelated die) and follow the recorded once/no-limit policy.
 *
 * Every mutation runs on the Caster's shared per-Actor serial queue, records its intent and result as a
 * replayable operation, validates its input and records an undo receipt with the exact before-state.
 * Rolled replacements commit with their identities on the damage message; their facts survive undo,
 * while the ordinary effect cache remains reversible. Cancel is decided before any write.
 */
import { casterLevel, casterBranch, casterState, standardPools } from "./caster-rules.mjs";
import { casterEnabled, casterTurn, casterRuling, CORE_POOL_TYPES, coreDamageTypes, validateCasterContext } from "./caster-casting.mjs";
import { artsState, integer, recoveryValue } from "./arts-rules.mjs";
import { flag, values, need } from "./operation-kernel.mjs";
import { resolveCasterArtData } from "./caster-setup.mjs";
import { casterStateSerial } from "./caster-primal-splash.mjs";
import { currentEpoch, isLocked } from "./play-undo.mjs";

/** Printed feature ids (Ch.3 L393–443), used by setup, the sheet and the managed Elemental Being effect. */
export const CORE_FEATURES = Object.freeze({
  versatileCaster: "subclass-feature-caster-core-1st-level-versatile-caster-355",
  powerFromWithin: "subclass-feature-caster-core-3rd-level-power-from-within-949",
  empoweredArts: "subclass-feature-caster-core-6th-level-empowered-arts-1268",
  masterOfTheElements: "subclass-feature-caster-core-10th-level-master-of-the-elements-1572",
  savant: "subclass-feature-caster-core-15th-level-savant-2289"
});
/** The printed pool→Damage Type table (L419–430) is owned by the shared casting layer and frozen there. */
export { CORE_POOL_TYPES, coreDamageTypes };

const AP_PATH = "flags.ak5e.artsPoints.value";
const CORE_RABBIT_TITLE = "Rabbit from the Hat";
const stableText = (value, label) => {
  need(typeof value === "string" && value.trim().length > 0 && value.length <= 80, `${label} must be a non-empty name.`);
  return value.trim();
};
const operationId = value => {
  if (value === undefined) return globalThis.foundry?.utils?.randomID?.() ?? `core-${Date.now().toString(36)}`;
  need(typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value), "A stable operation ID is required.");
  return value;
};
/** A Core feature is used by the Caster's owner only; a non-Core branch never sees these commands. */
function coreActor(actor) {
  need(actor?.documentName === "Actor" && actor.isOwner, "Choose a Caster character you own.");
  need(casterBranch(actor) === "core", "This feature belongs to a Core Caster.");
  need(casterEnabled(actor), "Complete Caster setup before using a Core feature.");
  const level = casterLevel(actor);
  need(Number.isInteger(level) && level >= 1, "Complete Caster setup before using a Core feature.");
  return { state: casterState(actor), level };
}
function addUndo(state, entry) {
  state.undo = [...(state.undo ?? []).filter(existing => existing.id !== entry.id), entry].slice(-60);
  return entry;
}
const undoBase = (id, command, title) => ({ id, command, title, epoch: currentEpoch(), createdAt: Date.now(), status: "complete", targets: [] });

/** Operation intents are plain JSON so a retry can prove it repeats the recorded choices exactly. */
const sameIntent = (a, b) => {
  try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
};

/**
 * One Core mutation: shared per-Actor serial queue, replayable operation record (intent + result), a
 * single state write, and a rollback hook for documents created before that write.
 *
 * A retry with the same operation ID and the same intent returns the recorded result instead of applying
 * the use twice (this is what lets Power from Within replay after success). A different operation ID is a
 * new use and still passes the feature's own once-per-rest gates.
 */
async function coreOperation(actor, operation, command, intent, run) {
  return casterStateSerial(actor, async () => {
    const { state, level } = coreActor(actor);
    const previous = (state.operations ?? []).find(entry => entry.id === operation);
    if (previous) {
      need(previous.command === command, "A Core operation ID cannot be reused for a different feature.");
      need(sameIntent(previous.intent, intent), "Retry with the same operation ID and exact choices.");
      if (previous.status === "complete" && previous.result !== undefined) return structuredClone(previous.result);
      need(false, "This Core operation was recorded but never completed; review it with the GM.");
    }
    let outcome;
    try {
      outcome = await run(state, level);
      need(outcome && typeof outcome === "object" && outcome.result !== undefined, "The Core use produced no result.");
      const record = { id: operation, command, intent: structuredClone(intent), status: "complete",
        epoch: currentEpoch(), createdAt: Date.now(), result: structuredClone(outcome.result) };
      state.operations = [...(state.operations ?? []).filter(entry => entry.id !== operation), record].slice(-40);
      await actor.update({ "flags.ak5e.caster": state, ...(outcome.updates ?? {}) });
    } catch (error) {
      if (typeof outcome?.rollback === "function") await outcome.rollback(error);
      throw error;
    }
    return outcome.result;
  });
}

/* ---------------------------------------------------------------- cast context (C5/C4 gates) */

/**
 * The Core cast options. Shared context keeps owning every branch-independent rule; this entry point
 * only validates the Core option shapes so a malformed reading can never reach the shared layer.
 */
export function validateCoreContext(actor, item, input = {}) {
  need(actor?.documentName === "Actor" && actor.isOwner, "Choose a Caster character you own.");
  need(input && typeof input === "object" && !Array.isArray(input), "The Core cast options must be an object.");
  need(item?.type === "spell", "Choose a known Art.");
  if (input.maverick !== undefined)
    need(typeof input.maverick === "string" && input.maverick.trim().length > 0, "Choose a Damage Type associated with a chosen Core pool for Maverick.");
  if (input.mode !== undefined) need(["ap", "free", "ritual"].includes(input.mode), "Choose Arts Points, free or ritual for this cast.");
  if (input.empowered !== undefined) need(input.empowered === true, "Empowered Arts is either armed for this cast or not.");
  if (input.signatureReroll !== undefined) need(input.signatureReroll === true, "Signature rerolls are either used for this cast or not.");
  return validateCasterContext(actor, item, input);
}

/* ---------------------------------------------------------------- Rabbit from the Hat (C3:398) */

/** Pool Arts printed at or below the Caster's current Maximum Art Level, for the chooser. */
export function rabbitArtChoices(actor) {
  const maximumArtLevel = artsState(actor).maximumArtLevel;
  return standardPools.flatMap(pool => pool.members
    .filter(member => Number(member.level) <= maximumArtLevel)
    .map(member => ({ name: member.name, level: Number(member.level), pool: pool.name })));
}

function borrowedFlags(source, operation) {
  return { ...source.flags, ak5e: { ...source.flags?.ak5e, casterBorrowed: true, casterRabbitOperation: operation,
    casterArtGrant: source.flags?.ak5e?.casterArtGrants?.[0], casterArtGrants: ["rabbit"] } };
}

/**
 * Borrow one Standard-pool Art until the next Long Rest. The use is spent only after a grant exists, so a
 * refused Art (above the cap, unmapped) never costs the once-per-Long-Rest use.
 *
 * The borrowed Item is created before the single state write, so the operation owns a rollback: if the
 * state write fails the Item is deleted again, and a retry of the same operation ID reuses (and, on undo,
 * deletes) the Item it created instead of leaving an untracked grant behind.
 */
export async function useRabbitFromHat(actor, data = {}, id = undefined) {
  const operation = operationId(id);
  need(data && typeof data === "object" && !Array.isArray(data), "The Rabbit from the Hat options must be an object.");
  need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  const poolArtName = stableText(data.poolArtName, "Choose a Standard-pool Art.");
  return coreOperation(actor, operation, "rabbit", { poolArtName }, async state => {
    need(state.uses?.rabbit !== true, "Rabbit from the Hat has been used since the last Long Rest; a Long Rest restores it.");
    const art = standardPools.flatMap(pool => pool.members).find(member => member.name === poolArtName);
    need(art, "Choose an Art printed in a Standard Arts Pool.");
    const maximumArtLevel = artsState(actor).maximumArtLevel;
    need(Number(art.level) <= maximumArtLevel, `Choose a Standard-pool Art no higher than your maximum Art level (${maximumArtLevel}).`);
    const removeItem = async item => {
      if (typeof actor.deleteEmbeddedDocuments !== "function") return;
      try { await actor.deleteEmbeddedDocuments("Item", [item.id]); } catch { /* the receipt still records the grant */ }
    };
    let item = values(actor.items).find(candidate => flag(candidate, "casterRabbitOperation") === operation) ?? null;
    let created = Boolean(item), rollback = item ? () => removeItem(item) : null;
    if (!item) {
      item = values(actor.items).find(candidate => flag(candidate, "casterPoolName") === art.name
        || flag(candidate, "casterArtGrant")?.sourceName === art.name
        || flag(candidate, "casterArtGrants")?.some?.(grant => grant?.sourceName === art.name)
        || (!!art.sourceId && flag(candidate, "chapterFiveId") === art.sourceId)) ?? null;
    }
    if (!item) {
      const source = await resolveCasterArtData(art.name);
      need(source, "The GM must review a spell mapping for this Art first.");
      let granted = null;
      try {
        [granted] = await actor.createEmbeddedDocuments("Item", [{ ...source, flags: borrowedFlags(source, operation) }]);
      } catch (error) {
        throw new Error(`The borrowed Art could not be added to this Caster: ${error.message}`);
      }
      need(granted, "The borrowed Art could not be added to this Caster.");
      item = granted; created = true; rollback = () => removeItem(item);
    }
    const before = { borrowed: structuredClone(state.borrowed ?? null), rabbit: state.uses?.rabbit === true };
    state.borrowed = { itemId: item.id, name: art.name };
    state.uses = { ...(state.uses ?? {}), rabbit: true };
    addUndo(state, { ...undoBase(operation, "rabbit", CORE_RABBIT_TITLE),
      caster: { itemId: item.id, created, borrowed: { before: before.borrowed, after: structuredClone(state.borrowed) } },
      uses: { before: { rabbit: before.rabbit } } });
    return { result: { itemId: item.id, name: art.name, operationId: operation }, rollback };
  });
}

/* ---------------------------------------------------------------- Power from Within (C3:403–406) */

/** Regain ceil(Caster level / 2) Arts Points after the completed Short Rest meditation; once per Long Rest. */
export async function powerFromWithin(actor, data = {}, id = undefined) {
  const operation = operationId(id);
  need(data && typeof data === "object" && !Array.isArray(data), "The Power from Within options must be an object.");
  need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  need(data.restCompleted === true, "Complete the Short Rest meditation before applying Power from Within.");
  return coreOperation(actor, operation, "powerWithin", { restCompleted: true }, async (state, level) => {
    need(level >= 3, "Power from Within is a Core 3rd-level feature.");
    need(state.uses?.powerWithin !== true, "Power from Within has been used since the last Long Rest; a Long Rest restores it.");
    const ap = artsState(actor), regained = Math.ceil(level / 2), after = recoveryValue(ap, regained);
    const before = state.uses?.powerWithin === true;
    state.uses = { ...(state.uses ?? {}), powerWithin: true };
    addUndo(state, { ...undoBase(operation, "powerWithin", "Power from Within"),
      caster: { pool: { path: AP_PATH, before: ap.value, after, poolLabel: "Arts Points", unit: "AP" } },
      uses: { before: { powerWithin: before } } });
    return { result: { recovered: after - ap.value, value: after, operationId: operation }, updates: { [AP_PATH]: after } };
  });
}

/* ---------------------------------------------------------------- Empowered Arts (C3:408–410) */

/** Arm the optional bonus for one qualifying damage roll this Turn; the damage roll itself stays the player's. */
export async function armEmpoweredArts(actor, data = {}, id = undefined) {
  const operation = operationId(id);
  need(data && typeof data === "object" && !Array.isArray(data), "The Empowered Arts options must be an object.");
  need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  const castId = stableText(data.castId, "Choose the Art cast made this Turn.");
  return coreOperation(actor, operation, "empower", { castId }, async state => {
    const cast = state.casts?.find(entry => entry.id === castId && entry.completed);
    need(cast, "Choose a recorded Art cast made this Turn.");
    need(cast.turn && cast.turn === casterTurn(actor), "The Art must have been cast during the current Turn.");
    const item = values(actor.items).find(candidate => candidate.id === cast.itemId);
    need(item?.type === "spell", "Choose a recorded Art cast made this Turn.");
    validateCoreContext(actor, item, { empowered: true });
    const before = state.empowerCastId ?? null;
    state.empowerCastId = cast.id;
    addUndo(state, { ...undoBase(operation, "empower", "Empowered Arts"),
      caster: { castId: cast.id, turn: cast.turn, empoweredCastId: { before, after: cast.id } } });
    return { result: { armed: cast.id, operationId: operation,
      instruction: "Roll Damage from this cast's card; the bonus is added once and the use is consumed only when that roll completes." } };
  });
}

/* ---------------------------------------------------------------- Savant (C3:433–443) */

/** Known Arts of 5th level or less, for the Signature chooser. */
export function signatureArtChoices(actor) {
  return values(actor.items).filter(item => item.type === "spell" && Number(item.system?.level) <= 5)
    .map(item => ({ id: item.id, name: item.name, level: Number(item.system?.level ?? 0) }));
}

/**
 * Record the Signature Art chosen by the Long Rest ritual. Only one Signature exists at a time, the Art
 * itself is never edited, and a Cantrip needs the GM's recorded ruling (the Cantrip ruling is still open).
 */
export async function selectSignatureArt(actor, data = {}, id = undefined) {
  const operation = operationId(id);
  need(data && typeof data === "object" && !Array.isArray(data), "The Savant options must be an object.");
  need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  need(data.restCompleted === true, "Complete the Signature selection Long Rest activity before applying Savant.");
  const itemId = stableText(data.itemId, "Choose a known Art of level 5 or less.");
  need(typeof data.damaging === "boolean", "Confirm whether this Art can deal Damage before selecting the Signature.");
  return coreOperation(actor, operation, "signature", { itemId, damaging: data.damaging }, async (state, level) => {
    need(level >= 15, "Savant is a Core 15th-level feature.");
    const item = actor.items?.get?.(itemId) ?? values(actor.items).find(candidate => candidate.id === itemId);
    need(item?.type === "spell", "Choose a known Art of level 5 or less.");
    const artLevel = integer(item.system?.level, "Art level", 0, 9);
    need(artLevel <= 5, "Choose a known Art of level 5 or less.");
    if (artLevel === 0) need(casterRuling(actor, "signatureCantrips") === true, "The GM must record a ruling permitting Cantrip Signature selection.");
    if (state.signature?.itemId === item.id && state.signature?.damaging === data.damaging)
      return { result: { ...state.signature, operationId: operation } };
    const before = state.signature ? structuredClone(state.signature) : null;
    state.signature = { itemId: item.id, damaging: data.damaging };
    addUndo(state, { ...undoBase(operation, "signature", "Savant Signature Art"),
      caster: { signature: { before, after: structuredClone(state.signature) } } });
    return { result: { ...state.signature, operationId: operation } };
  });
}

/* ---------------------------------------------------------------- Savant rerolls (C3:438) */

/** Only persisted roll facts participate in identity; no property is attached to a live Die result. */
const damageTerms = roll => Array.from(roll?.dice?.length ? roll.dice : roll?.terms ?? [])
  .filter(term => Number.isInteger(term?.faces) && Array.isArray(term.results));
const actualRolls = data => {
  const raw = data.roll ?? data.rolls ?? null;
  return Array.isArray(raw) ? raw.filter(Boolean) : raw ? [raw] : [];
};
const rollJSON = roll => {
  const data = roll?.toJSON?.() ?? roll;
  return JSON.parse(typeof data === "string" ? data : JSON.stringify(data));
};
const rollStamp = roll => JSON.stringify(damageTerms(roll).map(term => ({
  faces: Number(term.faces), results: term.results.map(result => ({
    result: Number(result.result), active: result.active !== false,
    discarded: result.discarded === true, rerolled: result.rerolled === true
  }))
})));
/** Restore the durable history without replacing the card's Roll/Die methods or evaluating any dice. */
function restoreRoll(roll, json) {
  const stored = typeof json === "string" ? JSON.parse(json) : json;
  const terms = damageTerms(roll), saved = damageTerms(stored);
  need(terms.length === saved.length && terms.every((term, i) => term.faces === saved[i].faces),
    "The stored damage roll no longer matches this card.");
  terms.forEach((term, i) => { term.results = structuredClone(saved[i].results); });
  if (Number.isFinite(Number(stored.total))) {
    if ("_total" in roll || typeof roll._evaluateTotal === "function") roll._total = Number(stored.total);
    else roll.total = Number(stored.total);
  }
}
function messageCastId(message) {
  const originId = message.flags?.dnd5e?.originatingMessage;
  const origin = message.getOriginatingMessage?.() ?? values(globalThis.game?.messages).find(entry => entry.id === originId) ?? message;
  return flag(origin, "casterCast")?.castId ?? flag(message, "casterCast")?.castId
    ?? flag(origin, "castId") ?? flag(origin, "artCast")?.id;
}
/** A supplied foreign/stale Roll is a selection, not authority to replace the message's stored dice. */
function signatureMessage(actor, castId, data, rolls) {
  const messages = values(globalThis.game?.messages);
  const eligible = message => message.speaker?.actor === actor.id && messageCastId(message) === castId
    && (!message.flags?.dnd5e?.roll?.type || message.flags.dnd5e.roll.type === "damage");
  if (data.messageId !== undefined) {
    const id = stableText(data.messageId, "Choose an existing damage message.");
    const message = messages.find(entry => entry.id === id);
    need(message && eligible(message), "Choose the Signature Art's own damage message.");
    return message;
  }
  const candidates = messages.filter(message => eligible(message) && rolls.length === Array.from(message.rolls ?? []).length
    && rolls.every((roll, i) => {
      const stamp = rollStamp(roll);
      return stamp === rollStamp(message.rolls[i]) || flag(message, "signatureDice")?.sources
        ?.find(source => source.id === `message:${message.id}:${i}`)?.history.some(version => version.stamp === stamp);
    }));
  need(candidates.length <= 1, "Choose a damage message to distinguish identical rolls.");
  return candidates[0] ?? null;
}
function sourceDice(roll, source, keys = source.keys) {
  return damageTerms(roll).flatMap((term, termIndex) => term.results.flatMap((result, resultIndex) =>
    result?.active === false || result?.discarded === true ? [] : [{
      term, result, termIndex, source, key: keys[termIndex]?.[resultIndex],
      faces: Number(term.faces), value: Number(result.result)
    }]));
}
function snapshot(source, roll) {
  const stamp = rollStamp(roll);
  if (!source.history.some(entry => entry.stamp === stamp)) source.history.push({ stamp, keys: structuredClone(source.keys) });
  source.json = rollJSON(roll);
}
/** Append a new fact superseding this physical die; the original result and its value remain recorded. */
async function rerollDamageDie(die, once) {
  const { term, source, termIndex, key } = die, faces = Number(term.faces);
  need(Number.isInteger(faces) && faces >= 1, "The damage die has no usable faces.");
  need(typeof term.roll === "function", "Choose the actual damage roll from the Art's card so its dice can be rerolled.");
  let current = die.result, value = null, guard = 0;
  do {
    need(current && current.active !== false && current.discarded !== true, "The damage roll has no die left to reroll.");
    current.active = false; current.rerolled = true;
    const rolled = await term.roll({ reroll: true });
    const fresh = rolled && rolled !== term && rolled.result !== undefined ? rolled
      : term.results.filter(result => result?.active !== false && result?.discarded !== true).at(-1);
    const position = term.results.indexOf(fresh);
    need(position >= 0 && fresh !== current, "The rerolled die produced no recorded result.");
    source.keys[termIndex][position] = key;
    value = Number(fresh.result);
    need(Number.isInteger(value) && value >= 1 && value <= faces, "The rerolled die produced no usable result.");
    if (once) break;
    need(faces > 3, "Repeated Savant rerolls cannot terminate on dice with three or fewer faces. Resolve this die manually with the GM.");
    current = fresh; guard += 1;
  } while (value <= 3 && guard < 1000);
  need(guard < 1000, "Maximum reroll depth exceeded.");
  return value;
}

/**
 * The message commits roll JSON and its physical-die map together. Actor receipts/caches are ordinary
 * undoable effects; the durable roll ledger is not erased by undo or cache eviction. A second client
 * rebuilds from the message even if the subsequent Actor write failed.
 */
export async function rerollSignatureDice(actor, data = {}, id = undefined) {
  const operation = operationId(id);
  need(data && typeof data === "object" && !Array.isArray(data), "The Savant reroll options must be an object.");
  need(data.confirmed === true, "Confirm this feature's source requirements before applying it.");
  const castId = stableText(data.castId, "Choose a Signature Art damage roll.");
  const indices = data.indices;
  need(Array.isArray(indices) && indices.length > 0, "Choose the positions of the dice to reroll.");
  need(indices.every(index => Number.isSafeInteger(index) && index >= 0), "Choose whole die positions to reroll.");
  need(new Set(indices).size === indices.length, "Choose each die position once.");
  const declaredFaces = data.faces === undefined ? null : integer(data.faces, "Die faces", 2, 100);
  if (data.results !== undefined) {
    need(Array.isArray(data.results) && data.results.length > 0, "Enter the reviewed original die results.");
    need(data.results.every(result => Number.isSafeInteger(result) && result >= 1 && (declaredFaces === null || result <= declaredFaces)),
      "Enter the reviewed original die results.");
    need(indices.every(index => data.results[index] <= 3), "Choose only original dice showing 3 or less.");
  }
  const messageId = data.messageId === undefined ? null : stableText(data.messageId, "Choose an existing damage message.");
  const intent = { castId, indices: [...indices], ...(messageId ? { messageId } : {}) };
  return coreOperation(actor, operation, "signatureDice", intent, async state => {
    const cast = state.casts?.find(entry => entry.id === castId && entry.completed);
    need(cast, "Choose a Signature Art damage roll.");
    need(state.signature?.itemId && cast.itemId === state.signature.itemId, "Only the Signature Art's own damage roll may use the reroll benefit.");
    const supplied = actualRolls(data);
    need(supplied.length > 0, "Choose the actual damage roll from the Art's card; its dice decide the reroll.");
    const message = signatureMessage(actor, castId, data, supplied);
    const rolls = message ? Array.from(message.rolls ?? []) : supplied;
    need(rolls.length === supplied.length, "Review all rolls on the chosen damage message.");
    const savedRolls = state.signatureDamageRolls;
    const facts = structuredClone(savedRolls && Object.hasOwn(savedRolls, cast.id) ? savedRolls[cast.id] : { nextDieKey: 0, sources: [] });
    need(Number.isSafeInteger(facts.nextDieKey) && facts.nextDieKey >= 0 && Array.isArray(facts.sources), "The stored die ledger is malformed.");
    const storedFacts = flag(message, "signatureDice");
    if (storedFacts) {
      need(storedFacts.actorUuid === actor.uuid && storedFacts.castId === cast.id, "The damage message's die identities belong to another cast.");
      need(Number.isSafeInteger(storedFacts.nextDieKey) && storedFacts.nextDieKey >= 0 && Array.isArray(storedFacts.sources),
        "The damage message's die ledger is malformed.");
      for (const source of storedFacts.sources) {
        const saved = facts.sources.find(entry => entry.id === source.id);
        // A message write failure can leave a newer, durable Actor copy awaiting card repair.
        if (saved && source.history.every(version => saved.history.some(entry => entry.stamp === version.stamp))) continue;
        need(!saved || saved.history.every(version => source.history.some(entry => entry.stamp === version.stamp)),
          "The recorded die histories disagree; reconcile this card with the GM.");
        facts.sources = facts.sources.filter(entry => entry.id !== source.id);
        facts.sources.push(structuredClone(source));
      }
      facts.nextDieKey = Math.max(facts.nextDieKey, storedFacts.nextDieKey);
    }
    const beforeMap = state.signatureRerolls ?? {};
    const before = Object.hasOwn(beforeMap, cast.id) ? structuredClone(beforeMap[cast.id]) : null;
    const record = before ? structuredClone(before) : { replacements: {} };
    record.replacements ??= {};
    const complete = (result, dice) => {
      for (const [i, die] of dice.entries()) {
        record.replacements[die.key] = result.replacements[i].value;
        (record.faces ??= {})[die.key] = result.replacements[i].faces;
      }
      state.signatureDamageRolls = { ...(state.signatureDamageRolls ?? {}), [cast.id]: facts };
      state.signatureRerolls = { ...beforeMap, [cast.id]: record };
      addUndo(state, { ...undoBase(operation, "signatureDice", "Savant Signature reroll"),
        caster: { castId: cast.id, faces: result.faces,
          signatureRerolls: { had: before !== null, before, after: structuredClone(record) } } });
      return { result: structuredClone(result) };
    };
    // The card can commit before the final Actor receipt. Replay its operation before interpreting
    // positions against the now-changed card, and repair only the normal Actor cache/undo receipt.
    const replay = storedFacts?.operations?.find(entry => entry.id === operation);
    if (replay) {
      need(sameIntent(replay.intent, intent), "Retry with the same operation ID and exact choices.");
      return complete(replay.result, replay.dice);
    }
    const policy = casterRuling(actor, "signatureRerollOnce");
    need(typeof policy === "boolean", "Record a boolean Signature reroll policy.");
    const selections = [], currentDice = [], sources = [];
    for (const [rollIndex, roll] of rolls.entries()) {
      const stamp = rollStamp(supplied[rollIndex]);
      const sourceId = message ? `message:${message.id}:${rollIndex}` : null;
      const matches = facts.sources.filter(entry => sourceId ? entry.id === sourceId : entry.history.some(version => version.stamp === stamp));
      need(matches.length <= 1, "Choose the stored damage message to distinguish identical roll histories.");
      let source = matches[0];
      if (!source) {
        source = { id: sourceId ?? `roll:${facts.nextDieKey}`, keys: damageTerms(roll).map(term => term.results.map(() => facts.nextDieKey++)),
          replacements: {}, history: [] };
        snapshot(source, roll);
        facts.sources.push(source);
      }
      const version = source.history.find(entry => entry.stamp === stamp);
      need(version, "The supplied dice do not match the stored damage message.");
      sources.push(source);
      selections.push(...sourceDice(supplied[rollIndex], source, version.keys));
      restoreRoll(roll, source.json);
      currentDice.push(...sourceDice(roll, source));
    }
    need(selections.length > 0 && indices.every(index => index < selections.length), "Choose the positions of the dice to reroll.");
    const summary = indices.map(index => {
      const selected = selections[index];
      const die = currentDice.find(entry => entry.key === selected.key && entry.source.id === selected.source.id);
      need(die && Number.isSafeInteger(die.key) && die.key >= 0 && Number.isSafeInteger(die.faces) && die.faces >= 1
        && Number.isSafeInteger(die.value) && die.value >= 1 && die.value <= die.faces, "The damage roll has no die left to reroll.");
      const cached = Object.hasOwn(die.source.replacements, die.key) ? die.source.replacements[die.key] : undefined;
      need(cached !== undefined || typeof die.term.roll === "function", "Choose the actual damage roll from the Art's card so its dice can be rerolled.");
      need(cached !== undefined || !Object.hasOwn(die.source.pending ?? {}, die.key),
        "The previous reroll was not fully recorded; reconcile this card with the GM.");
      need(cached !== undefined || die.value <= 3, "Choose only original dice showing 3 or less.");
      if (declaredFaces !== null) need(declaredFaces === die.faces, "Die faces come from the damage roll, not from typed input.");
      if (policy === false) need(die.faces > 3, "Repeated Savant rerolls cannot terminate on dice with three or fewer faces. Resolve this die manually with the GM.");
      return { index, die, cached };
    });
    if (data.results !== undefined) {
      need(data.results.length === selections.length && selections.every((die, i) => die.value === data.results[i]),
        "The entered die results do not match the actual damage roll.");
    }
    const unrolled = summary.filter(entry => entry.cached === undefined);
    for (const { die } of unrolled) (die.source.pending ??= {})[die.key] = { faces: die.faces };
    state.signatureDamageRolls = { ...(state.signatureDamageRolls ?? {}), [cast.id]: facts };
    if (unrolled.length) {
      // Reserve the physical dice durably before evaluating any of them. If both result writes fail,
      // the surviving intent refuses a retry rather than turning an unknown roll into another chance.
      await actor.update({ "flags.ak5e.caster.signatureDamageRolls": state.signatureDamageRolls });
    }
    const replacements = [];
    for (const { index, die, cached } of summary) {
      const value = cached === undefined ? await rerollDamageDie(die, policy) : cached;
      need(Number.isSafeInteger(value) && value >= 1 && value <= die.faces, "The recorded replacement is not a usable die result.");
      die.source.replacements[die.key] = value;
      if (die.source.pending) delete die.source.pending[die.key];
      replacements.push({ index, faces: die.faces, value });
    }
    const totals = rolls.map((roll, rollIndex) => {
      if (typeof roll._evaluateTotal === "function") roll._total = roll._evaluateTotal();
      snapshot(sources[rollIndex], roll);
      const total = Number(roll.total);
      return Number.isFinite(total) ? total : null;
    });
    const result = { castId: cast.id, replacements, faces: summary.map(entry => entry.die.faces), totals, operationId: operation };
    const dice = summary.map(({ die }) => ({ sourceId: die.source.id, key: die.key }));
    if (message && typeof message.update === "function") {
      try {
        await message.update({ rolls: rolls.map(rollJSON), "flags.ak5e.signatureDice": {
          actorUuid: actor.uuid, castId: cast.id, nextDieKey: facts.nextDieKey, sources,
          operations: [...(storedFacts?.operations ?? []), { id: operation, intent: structuredClone(intent), dice,
            result: structuredClone(result) }]
        } });
      } catch (error) {
        // Never reroll a fact merely because the card write failed. Persist the replacement so the
        // same request can repair the card after reload without evaluating another die.
        await actor.update({ "flags.ak5e.caster.signatureDamageRolls": state.signatureDamageRolls });
        throw error;
      }
    }
    return complete(result, dice);
  });
}

/* ---------------------------------------------------------------- rest and undo */

/** A Short or Long Rest keeps the shared Caster rest handling (uses, borrowed Art, Signature stays). */
export async function coreRest(actor, type) {
  need(actor?.documentName === "Actor" && actor.isOwner, "Choose a Caster character you own.");
  need(["short", "long"].includes(type), "Choose a short or long rest.");
  if (!casterEnabled(actor)) return;
  const { casterRest } = await import("./caster-features.mjs");
  return casterRest(actor, type);
}

/**
 * Undo one recorded Core use. It restores the exact before-state and refuses when anything changed since
 * the use. A receipt from an earlier encounter window is locked for players; the GM may still undo it.
 */
export async function undoCoreUse(actor, id) {
  const useId = stableText(id, "Choose a recorded Core use to undo.");
  return casterStateSerial(actor, async () => {
    const { state } = coreActor(actor);
    const receipt = state.undo?.find(entry => entry.id === useId);
    need(receipt, "That Core use is no longer recorded.");
    need(receipt.status !== "undone", "That Core use was already undone.");
    need(!isLocked(receipt) || globalThis.game?.user?.isGM === true, "This use is locked: its encounter window has ended.");
    const updates = {};
    if (receipt.command === "powerWithin") {
      const ap = artsState(actor), pool = receipt.caster?.pool;
      need(pool && ap.value === pool.after, "The Arts Points changed since this use; reconcile it instead of undoing it.");
      updates[AP_PATH] = pool.before;
      state.uses = { ...(state.uses ?? {}), ...(receipt.uses?.before ?? {}) };
    } else if (receipt.command === "rabbit") {
      need(state.borrowed?.itemId === receipt.caster?.itemId, "The borrowed Art changed since this use; reconcile it instead of undoing it.");
      state.borrowed = receipt.caster?.borrowed?.before ?? null;
      state.uses = { ...(state.uses ?? {}), ...(receipt.uses?.before ?? {}) };
    } else if (receipt.command === "signature") {
      const expected = receipt.caster?.signature?.after ?? null;
      need(JSON.stringify(state.signature ?? null) === JSON.stringify(expected), "The Signature changed since this selection; reconcile it instead of undoing it.");
      state.signature = receipt.caster?.signature?.before ?? null;
    } else if (receipt.command === "empower") {
      const armed = receipt.caster?.empoweredCastId;
      need(armed && (state.empowerCastId ?? null) === armed.after, "The armed cast changed since this use; reconcile it instead of undoing it.");
      need(state.uses?.empowered !== receipt.caster?.turn, "This Empowered Arts use was consumed by a damage roll; reconcile it instead of undoing it.");
      state.empowerCastId = armed.before ?? null;
    } else if (receipt.command === "signatureDice") {
      const entry = receipt.caster?.signatureRerolls;
      need(entry && Object.hasOwn(entry, "after"), "That reroll receipt has no recorded replacements.");
      need(JSON.stringify(state.signatureRerolls?.[receipt.caster.castId] ?? null) === JSON.stringify(entry.after),
        "The recorded rerolls changed since this use; reconcile it instead of undoing it.");
      if (entry.had === true && entry.before !== null) state.signatureRerolls = { ...(state.signatureRerolls ?? {}), [receipt.caster.castId]: entry.before };
      else {
        state.signatureRerolls = { ...(state.signatureRerolls ?? {}) };
        delete state.signatureRerolls[receipt.caster.castId];
      }
    } else {
      need(false, "This Core use cannot be undone here.");
    }
    receipt.status = "undone";
    updates["flags.ak5e.caster"] = state;
    await actor.update(updates);
    if (receipt.command === "rabbit" && receipt.caster?.created === true && typeof actor.deleteEmbeddedDocuments === "function")
      await actor.deleteEmbeddedDocuments("Item", [receipt.caster.itemId]);
    return { undone: receipt.id, command: receipt.command };
  });
}
