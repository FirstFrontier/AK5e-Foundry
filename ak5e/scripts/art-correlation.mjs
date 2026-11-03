/** Art damage correlation and pre-application reductions (contract item 6, work package A8).
 *
 * Resolvers run synchronously inside `dnd5e.preApplyDamage`, read only outcomes the player already
 * confirmed on a card, and never open dialogs or start dice. A reduction is applied after DR and
 * Resistance/Vulnerability, before temporary HP, with a floor of 0 (2026-10-28 Collective Ward ruling).
 * An outcome confirmed after damage was applied is reported as late with manual-correction instructions;
 * damage is never silently reversed.
 *
 * Nothing registers at import time: the main agent wires `registerArtCorrelation()` from ak5e.mjs.
 */
import { need } from "./operation-kernel.mjs";
import { castIdForMessage } from "./trigger-events.mjs";

const resolvers = [];
const applied = new Map();      // "messageUuid|targetUuid" -> { amount, at }
const confirmed = new Map();    // "messageUuid|targetUuid" -> confirmed outcome
const installedOn = new WeakSet();

/** Register a synchronous pre-application resolver: `fn(context) -> { reduce?, resistTypes?, note? }`. */
export function registerDamageResolver(fn) {
  need(typeof fn === "function", "A damage resolver must be a function.");
  if (!resolvers.includes(fn)) resolvers.push(fn);
  return fn;
}

const correlationKey = (messageUuid, targetUuid) => `${messageUuid ?? ""}|${targetUuid ?? ""}`;
const messageOf = options => options?.originatingMessage ?? options?.origin ?? null;

/** Per-type totals from the originating damage card. `unknown` means at least one rolled part has no
 * type, so the split cannot be trusted; the caller then warns instead of guessing. */
function typedDamage(message) {
  const rolls = message?.rolls ?? message?.data?.rolls ?? [];
  const totals = new Map();
  let unknown = false, total = 0;
  for (const roll of Array.from(rolls)) {
    const value = Number(roll?.total) || 0;
    if (value <= 0) continue;
    const types = [...new Set([roll?.options?.type, ...(roll?.options?.types ?? [])].filter(type => typeof type === "string" && type))];
    if (!types.length) { unknown = true; total += value; continue; }
    for (const type of types) totals.set(type, (totals.get(type) ?? 0) + value / types.length);
    total += value;
  }
  return { totals, total, unknown };
}

/* Exact native per-type damage. dnd5e's `Actor5e#calculateDamage` fires `dnd5e.calculateDamage` after it
 * has applied modification, Immunity, Resistance, Vulnerability and the threshold to each damage part
 * (dnd5e.mjs, calculateDamage ~36774-36889), and `applyDamage` then calls `preApplyDamage` with the same
 * `options` object and the summary's `amount`. The post-native parts are retained here, keyed by that
 * options object and the actor, and are read only by the synchronous `preApplyDamage` resolver pass for
 * the same actor and aggregate. They are never reused for another actor, options object or total. */
const nativeDamage = new WeakMap();   // options -> Map(actor uuid -> { parts, aggregate })
const NON_HP_TYPES = new Set(["temphp", "maximum"]);

/** `dnd5e.calculateDamage` adapter. Reads only; never returns false and never mutates the summary. */
export function captureNativeDamage(actor, damages, options) {
  if (!actor?.uuid || !options || typeof options !== "object" || !damages) return;
  let parts;
  try {
    parts = Array.from(damages).map(entry => ({
      type: typeof entry?.type === "string" ? entry.type : "",
      value: Number(entry?.value) || 0,
      // Native marks a part it resisted in `active.type|all.resistance`; absent `active` means unknown.
      resisted: entry?.active ? Boolean(entry.active.type?.resistance || entry.active.all?.resistance) : null
    }));
  } catch { return; }
  const hpParts = parts.filter(part => !NON_HP_TYPES.has(part.type));
  const sum = hpParts.reduce((total, part) => total + part.value, 0);
  const summary = Number(damages.amount);
  const aggregate = Number.isFinite(summary) ? summary : sum;
  const map = nativeDamage.get(options) ?? new Map();
  map.set(actor.uuid, { parts: hpParts, aggregate, exact: Math.abs(sum - aggregate) < 0.001 });
  nativeDamage.set(options, map);
}

/** Retained native parts for this exact actor/options pair, only while they still describe `amount`. */
function takeNativeDamage(actor, options, amount) {
  const map = options && typeof options === "object" ? nativeDamage.get(options) : null;
  const entry = map?.get(actor.uuid);
  if (!entry) return { observed: false, parts: null };
  map.delete(actor.uuid);
  if (!entry.exact || Math.abs(entry.aggregate - Number(amount)) > 0.001) return { observed: true, parts: null };
  return { observed: true, parts: entry.parts };
}

/** Existing permanent Resistance on the target, used only when native did not report per-part state. */
function nativelyResistant(actor, type) {
  const traits = actor?.system?.traits ?? {};
  const list = value => Array.isArray(value) ? value : Array.isArray(value?.value) ? value.value : [];
  return list(traits.dr).includes(type) || list(traits.di).includes(type);
}

const CANNOT_SPLIT = "A resolver grants Resistance, but this damage has no exact per-type native total. " +
  "The native total was left unchanged; apply the Resistance manually if it is still owed.";

/** Resistance granted by a resolver (Warding Surge), applied to the exact native per-type values. An
 * already-resisted part is not halved again (no double Resistance); native `Math.trunc(value / 2)` is
 * mirrored. Without exact native parts the pending native aggregate is never rescaled from raw roll
 * totals: a single named component may use the aggregate, anything else leaves it unchanged with a
 * visible manual-correction warning. */
function resistantTotal(actor, aggregate, pending, damage, resistTypes, native) {
  if (!resistTypes.size) return { total: aggregate, applied: false, warning: null };
  const wanted = [...resistTypes];
  if (native.parts) {
    let adjusted = 0, applied = false;
    for (const part of native.parts) {
      const already = part.resisted ?? nativelyResistant(actor, part.type);
      if (wanted.includes(part.type) && !already && part.value > 0) { adjusted += Math.trunc(part.value / 2); applied = true; }
      else adjusted += part.value;
    }
    return applied ? { total: adjusted, applied: true, warning: null } : { total: aggregate, applied: false, warning: null };
  }
  const effective = wanted.filter(type => !nativelyResistant(actor, type));
  if (!effective.length) return { total: aggregate, applied: false, warning: null };
  if (damage.unknown || !damage.totals.size) return { total: aggregate, applied: false, warning: CANNOT_SPLIT };
  if (native.observed) return { total: aggregate, applied: false, warning: CANNOT_SPLIT };
  // A single named damage component: the whole native aggregate is that type.
  if (damage.totals.size === 1) {
    const [type] = damage.totals.keys();
    return effective.includes(type) ? { total: Math.trunc(aggregate / 2), applied: true, warning: null }
      : { total: aggregate, applied: false, warning: null };
  }
  // Mixed types without exact actor/application-bound native parts: raw card totals, even when they equal
  // the pending aggregate, never prove the per-type native values (offsetting changes). Keep the native
  // aggregate and require a manual Resistance correction.
  return { total: aggregate, applied: false, warning: CANNOT_SPLIT };
}

/** Pure: derive the post-reduction HP and temporary HP the pending update should carry. */
function reduceDamage(actor, total, updates, reduce) {
  const hp = actor?.system?.attributes?.hp;
  if (!hp || !updates || typeof updates !== "object") return;
  const current = Number(hp.value) || 0, currentTemp = Number(hp.temp) || 0;
  const after = Math.max(0, Math.max(0, Number(total) || 0) - Math.max(0, reduce));
  const absorbed = Math.min(currentTemp, after);
  updates["system.attributes.hp.temp"] = currentTemp - absorbed;
  updates["system.attributes.hp.value"] = Math.max(0, current - (after - absorbed));
}

/** Record a card-confirmed outcome so a later resolver can read it during application. */
export async function confirmArtOutcome(outcome = {}) {
  const key = correlationKey(outcome.messageUuid ?? outcome.message?.uuid, outcome.targetUuid);
  if (applied.has(key)) {
    console.warn("AK5e | Art correlation: outcome confirmed after the damage was applied — timing warning. " +
      "Do not reverse the damage; correct the affected Actor manually.");
    try {
      globalThis.ui?.notifications?.warn("A Ward outcome arrived after the damage was applied. The damage was not reversed; " +
        "correct the affected creature's hit points manually if the outcome still applies.");
    } catch { /* Notifications are optional in tests. */ }
    return { late: true, key, manualCorrection: true };
  }
  confirmed.set(key, { ...outcome, confirmedAt: Date.now() });
  return { late: false, key };
}

function showManualWarning(text) {
  console.warn(`AK5e | Art correlation: ${text}`);
  try { globalThis.ui?.notifications?.warn(text); } catch { /* Notifications are optional in tests. */ }
}

export function applyArtDamageResolvers(actor, amount, updates, options) {
  const value = Number(amount);
  if (!actor?.uuid || !Number.isFinite(value) || value <= 0) return;
  const message = messageOf(options);
  const native = takeNativeDamage(actor, options, value);   // consumed once per application, used or not
  const key = correlationKey(message?.uuid, actor.uuid);
  applied.set(key, { amount: value, at: Date.now() });
  const outcome = confirmed.get(key) ?? null;
  const damage = typedDamage(message);
  const context = { actor, amount: value, updates, options, message, messageUuid: message?.uuid ?? null,
    castId: castIdForMessage(message), outcome, confirmed: Boolean(outcome),
    types: [...damage.totals.keys()], resistTypes: [] };
  let reduce = 0;
  const resistTypes = new Set();
  for (const resolver of [...resolvers]) {
    let result;
    try { result = resolver(context); }
    catch (error) { console.warn("AK5e | Art damage resolver failed:", error); continue; }
    if (result && typeof result.then === "function") {
      console.warn("AK5e | Art damage resolver returned a Promise; asynchronous resolvers are not supported and were ignored.");
      continue;
    }
    if (!result || typeof result !== "object") continue;
    const amountReduced = Number(result.reduce);
    if (Number.isFinite(amountReduced) && amountReduced > 0) reduce += amountReduced;
    for (const type of Array.isArray(result.resistTypes) ? result.resistTypes : []) {
      if (typeof type === "string" && type) resistTypes.add(type);
    }
  }
  context.resistTypes = [...resistTypes];
  if (!reduce && !resistTypes.size) return;
  const hp = actor?.system?.attributes?.hp;
  if (!hp || !updates || typeof updates !== "object") return;
  // `amount` is dnd5e's native post-DR/Resistance total before temporary HP and before HP clamping.
  // Reducing it (rather than the clamped HP loss) preserves overkill.
  const current = Number(hp.value) || 0, currentTemp = Number(hp.temp) || 0;
  const proposedValue = Number.isFinite(Number(updates["system.attributes.hp.value"]))
    ? Number(updates["system.attributes.hp.value"]) : current;
  const proposedTemp = Number.isFinite(Number(updates["system.attributes.hp.temp"]))
    ? Number(updates["system.attributes.hp.temp"]) : currentTemp;
  const pending = Math.max(0, currentTemp - proposedTemp) + Math.max(0, current - proposedValue);
  const resisted = resistantTotal(actor, value, pending, damage, resistTypes, native);
  if (resisted.warning) showManualWarning(resisted.warning);
  if (!reduce && !resisted.applied) return;
  reduceDamage(actor, resisted.total, updates, reduce);
}

/** Idempotent per Hooks registry. Call after `ready` from the main agent's wiring. */
export function registerArtCorrelation() {
  const registry = globalThis.Hooks;
  if (!registry || installedOn.has(registry)) return false;
  installedOn.add(registry);
  registry.on("dnd5e.calculateDamage", (actor, damages, options) => { captureNativeDamage(actor, damages, options); });
  registry.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => applyArtDamageResolvers(actor, amount, updates, options));
  return true;
}
