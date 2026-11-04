import { ARTS_METHOD, ArtsRuleError, adoptedSpellData, artsChoices, artsState, castingConfig, integer, quoteArt, recoveryValue, restArtsUpdates } from "./arts-rules.mjs";
import { worldRulesEnabled } from "./world-rule-state.mjs";
import { registerArtsSheetHooks } from "./arts-sheet.mjs";
import { casterEnabled, casterGrant, casterQuoteOptions, prepareCasterActivity, casterConsumption, completeCasterConsumption, completeCasterUse, markCasterCastFailure, validateCasterContext } from "./caster-casting.mjs";
import { casterStateSerial } from "./caster-primal-splash.mjs";
import { artReceiptUndoAllowed, artReceiptWindow, appendArtReceipt, captureArtChanges, previewArtUndo, previewLinkedArtUndo, revertLinkedRelay, undoArtChanges } from "./arts-ledger.mjs";
import { isLocked, requireOverrides } from "./play-undo.mjs";
import { getReactions, refundReaction, spendReaction, REACTION_FLAG } from "./trigger-events.mjs";
export { renderArtsControls } from "./arts-sheet.mjs";

const sessions = new Map();
const busy = new Set();
const patched = new WeakSet();
const wiredArtCards = new WeakSet();
let installed = false;
let available = false;
const flags = document => document?.getFlag?.("ak5e", "art") ?? {};
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notice = error => { console.error("AK5e | Arts", error); ui.notifications.error(error.message ?? String(error)); };
const safely = promise => Promise.resolve(promise).catch(notice);
export const artsText = (key, data) => data === undefined ? game.i18n.localize(`AK5E.Arts.${key}`) : game.i18n.format(`AK5E.Arts.${key}`, data);
export const artsErrorText = error => error?.key ? artsText(error.key, error.data) : error?.message ?? String(error);

/**
 * Class modules outside the Caster add quote options (e.g. Guardian's Not Today discount) and record what a cast
 * consumed in the same Actor update as its AP. `options(actor, item, usage)` returns quote options; `consume(activity,
 * usage, updates, receipt)` may add `updates.actor` entries. Both must be pure apart from those updates.
 */
const quoteSources = [], grantSources = [], consumers = [], castOptionSources = [];
export function registerArtQuoteOptions(source) { if (!quoteSources.includes(source)) quoteSources.push(source); }
/** Register a transient source-backed grant. Return no grant unless its feature is valid for this exact use. */
export function registerArtGrant(source) { if (typeof source !== "function") throw new TypeError("Art grant source must be a function."); if (!grantSources.includes(source)) grantSources.push(source); }
export function registerArtConsumption(consumer) { if (!consumers.includes(consumer)) consumers.push(consumer); }
/** Register a cast-option provider (contract item 2). `source(actor, item, activity, context)` returns
 * null or `{ id, label, fields, validate(selection), quote(selection), consume(selection, updates, receipt) }`.
 * Providers are consulted in registration order; registering the same function twice is a no-op. */
export function registerArtCastOptions(source) {
  if (typeof source !== "function") throw new TypeError("Art cast option provider must be a function.");
  if (!castOptionSources.includes(source)) castOptionSources.push(source);
}

const warningList = (id, warnings) => (warnings ?? []).map(entry => typeof entry === "string"
  ? { id, text: entry } : { id: entry.id ?? id, text: entry.text ?? "" });
const selectionMap = selection => selection?.ak5eOptions && typeof selection.ak5eOptions === "object"
  ? selection.ak5eOptions : (selection && typeof selection === "object" ? selection : {});
const OPTION_FIELD_TYPES = new Set(["number", "text", "checkbox", "select", "hidden"]);
const OPTION_NAME = /^[A-Za-z0-9_-]{1,64}$/;
/** Option ids and field names ride in form paths and object keys; never let one resolve to a prototype member. */
const OPTION_SEGMENT_DENY = new Set(["__proto__", "prototype", "constructor"]);

/** Template-facing contract for one provider field. `entry.fields` stays exactly as the provider
 * returned it; this richer copy is what the shared `arts-usage.hbs` renders and what the submit
 * normaliser reads back. */
export function artCastOptionField(field, optionId) {
  const name = String(field?.name ?? "").trim();
  if (!name || !OPTION_NAME.test(name)) return null;
  const type = OPTION_FIELD_TYPES.has(field?.type) ? field.type
    : (Array.isArray(field?.options) ? "select" : "text");
  const options = type === "select" ? (field.options ?? []).map(entry => Array.isArray(entry)
    ? { value: String(entry[0]), label: String(entry[1] ?? entry[0]) }
    : { value: String(entry?.value ?? entry?.id ?? ""), label: String(entry?.label ?? entry?.value ?? entry?.id ?? "") })
    .filter(entry => entry.value !== "") : null;
  const fallback = field?.value ?? (type === "checkbox" ? false : type === "number" ? (field?.min ?? 0) : (options?.[0]?.value ?? ""));
  return { name, inputName: `ak5eOptions.${optionId}.${name}`, label: String(field?.label ?? name), type,
    value: fallback, min: field?.min, max: field?.max, step: field?.step, options,
    hint: field?.hint === undefined ? "" : String(field.hint) };
}

function optionFieldModel(entry, selection) {
  const chosen = selection && typeof selection === "object" ? selection : {};
  return (entry.fields ?? []).map(field => artCastOptionField(field, entry.id)).filter(Boolean).map(field => {
    const value = Object.hasOwn(chosen, field.name) ? chosen[field.name] : field.value;
    return { ...field, value };
  });
}

/** Accept both the expanded form object (`ak5eOptions.<id>.<field>`) and the flat FormData view used
 * by the native application. Values are coerced with the provider's own field types. */
export function collectArtCastOptionSelections(formData) {
  const selections = {};
  const assign = (path, value) => {
    const parts = String(path).split(".");
    if (parts[0] !== "ak5eOptions" || parts.length !== 3) return;
    const [, id, field] = parts;
    if (!OPTION_NAME.test(id) || !OPTION_NAME.test(field)) return;
    if (OPTION_SEGMENT_DENY.has(id) || OPTION_SEGMENT_DENY.has(field)) return;
    (selections[id] ??= {})[field] = value;
  };
  const walk = (prefix, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) walk(prefix ? `${prefix}.${key}` : key, child);
      return;
    }
    assign(prefix, value);
  };
  if (typeof FormData !== "undefined" && formData instanceof FormData) for (const [key, value] of formData.entries()) assign(key, value);
  else if (Array.isArray(formData?.entries)) for (const [key, value] of formData.entries) assign(key, value);
  else if (formData && typeof formData === "object") {
    const nested = formData.ak5eOptions;
    if (nested && typeof nested === "object") walk("ak5eOptions", nested);
    else for (const [key, value] of Object.entries(formData)) if (key.startsWith("ak5eOptions.")) assign(key, value);
  }
  for (const values of Object.values(selections)) for (const [field, value] of Object.entries(values)) {
    if (value === "on") values[field] = true;
    else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) values[field] = Number(value);
  }
  return selections;
}

/** A usage or explicit selection object, whichever shape the caller used. */
function selectionEntries(selection) {
  if (!selection || typeof selection !== "object") return {};
  const nested = selection.ak5eOptions;
  return nested && typeof nested === "object" ? nested : selection;
}

function optionSelections(usage) {
  const provided = selectionEntries(selectionMap(usage));
  const merged = {};
  for (const [id, values] of Object.entries(provided)) {
    if (OPTION_SEGMENT_DENY.has(id)) continue;
    merged[id] = values;
  }
  for (const [id, values] of Object.entries(collectArtCastOptionSelections(usage?.ak5eOptions))) {
    merged[id] = { ...(merged[id] ?? {}), ...values };
  }
  return merged;
}
const optionProviderFailed = (error, id = "cast-option") => {
  console.warn("AK5e | Arts cast option provider failed", error);
  return { id, text: `A cast option provider failed: ${error?.message ?? String(error)}` };
};
/** Resolve one provider for this use. Returns `{ entry }`, `{ warning }` or `{}` (not applicable). */
function optionProvider(source, actor, item, activity, context) {
  let result;
  try { result = source(actor, item, activity, context); }
  catch (error) { return { warning: optionProviderFailed(error) }; }
  if (result && typeof result.then === "function") {
    console.warn("AK5e | Arts cast option provider returned a Promise; cast options must resolve synchronously.");
    return { warning: { id: "cast-option", text: "A cast option provider returned a Promise and was ignored; cast options must resolve synchronously." } };
  }
  if (!result || typeof result !== "object") return {};
  const id = String(result.id ?? "").trim();
  if (!id) return {};
  return { entry: { id, label: String(result.label ?? id), fields: Array.isArray(result.fields) ? result.fields : [], provider: result } };
}
/** Dialog model for the cast confirm step (contract 2). Never writes and never blocks. */
export async function artCastOptionsFor(actor, item, activity, context = {}) {
  const options = [], warnings = [];
  const selections = optionSelections(context?.usage ?? context);
  for (const source of castOptionSources) {
    const { entry, warning } = optionProvider(source, actor, item, activity, context);
    if (warning) { warnings.push(warning); continue; }
    if (!entry || options.some(option => option.id === entry.id)) continue;
    const selection = selections[entry.id] ?? {};
    try {
      const checked = entry.provider.validate?.(selection) ?? {};
      warnings.push(...warningList(entry.id, checked.warnings));
    } catch (error) { warnings.push(optionProviderFailed(error, `option:${entry.id}`)); }
    try { entry.preview = entry.provider.quote?.(selection) ?? {}; }
    catch (error) { warnings.push(optionProviderFailed(error, `option:${entry.id}`)); }
    entry.selection = structuredClone(selection);
    entry.fieldsModel = optionFieldModel(entry, selection);
    options.push(entry);
  }
  return { options, warnings };
}
/** Collect provider warnings/errors for the pending selection. Warnings never block (WORKFLOW §3.2). */
export async function validateArtCastOptions(actor, item, activity, selection, context = {}) {
  return validateArtCastOptionSelection(actor, item, activity, selection, context);
}

function validateArtCastOptionSelection(actor, item, activity, selection, context = {}) {
  const warnings = [], errors = [];
  const selections = selectionEntries(selection);
  for (const source of castOptionSources) {
    const { entry, warning } = optionProvider(source, actor, item, activity, context);
    if (warning) { warnings.push(warning); continue; }
    if (!entry || selections[entry.id] === undefined) continue;
    try {
      const checked = entry.provider.validate?.(selections[entry.id]) ?? {};
      warnings.push(...warningList(entry.id, checked.warnings));
      errors.push(...warningList(entry.id, checked.errors));
    } catch (error) { warnings.push(optionProviderFailed(error, `option:${entry.id}`)); }
  }
  return { warnings, errors };
}
/** Run the selected providers' consumption inside the cast's own Actor update and store the selection.
 * Synchronous by contract: it is called from dnd5e's synchronous consumption hook, so every provider
 * change joins the same Actor update and no provider can leave a partial, unreceipted mutation behind. */
export function applyArtCastOptions(activity, usage, updates, receipt) {
  const actor = activity?.actor, item = activity?.item;
  if (!actor || !item || !updates || !receipt) return [];
  const selections = optionSelections(usage);
  const warnings = [], consumed = [];
  const poolKey = "flags.ak5e.resourcePools.lifeSupport.value";
  // A value staged before this loop (e.g. a gain from an earlier consumer in the same update)
  // is outside the live-based quotes' knowledge: reconciling it against live would destroy it.
  const stagedBeforeLoop = updates.actor?.[poolKey];
  for (const source of castOptionSources) {
    const { entry, warning } = optionProvider(source, actor, item, activity, { usage });
    if (warning) { warnings.push(warning); continue; }
    if (!entry || selections[entry.id] === undefined) continue;
    const actorBefore = structuredClone(updates.actor ?? {}), receiptBefore = structuredClone(receipt);
    try {
      updates.actor ??= {};
      entry.provider.consume?.(selections[entry.id], updates, receipt);
      receipt.options ??= {};
      receipt.options[entry.id] = structuredClone(selections[entry.id]);
      consumed.push({ entry, selection: selections[entry.id] });
    } catch (error) {
      // Roll the failed provider's partial change back; the cast itself still proceeds (warn, never block).
      for (const key of Object.keys(updates.actor ?? {})) if (!Object.hasOwn(actorBefore, key)) delete updates.actor[key];
      for (const [key, value] of Object.entries(actorBefore)) updates.actor[key] = value;
      for (const key of Object.keys(receipt)) if (!Object.hasOwn(receiptBefore, key)) delete receipt[key];
      for (const [key, value] of Object.entries(receiptBefore)) receipt[key] = value;
      warnings.push(optionProviderFailed(error, `option:${entry.id}`));
    }
  }
  // The quoted aggregate is source of truth: reconcile the Life Support pool key to live minus the
  // quoted total, so two absolute provider writes cannot silently lose one spend. A provider whose
  // consume threw was rolled back above and contributes nothing. Single-provider staged writes
  // already equal the target, so this changes neither value nor warnings for them.
  let quotedTotal = 0;
  for (const record of consumed) {
    let quoted;
    try { quoted = record.entry.provider.quote?.(record.selection) ?? {}; }
    catch { quoted = {}; }
    quotedTotal += Number(quoted.lifeSupportCost) || 0;
  }
  if (quotedTotal > 0 && stagedBeforeLoop === undefined) {
    const liveRaw = Number(actor?.flags?.ak5e?.resourcePools?.lifeSupport?.value);
    const live = Number.isFinite(liveRaw) ? liveRaw : 0;
    const target = Math.max(0, live - quotedTotal);
    if (updates.actor?.[poolKey] !== target) {
      updates.actor ??= {};
      updates.actor[poolKey] = target;
      warnings.push({ id: "life-support-reconcile",
        text: `Life Support pool writes reconciled to the quoted total (${quotedTotal}); a provider staged write was superseded.` });
    }
  }
  return warnings;
}
/** Resolve the cast context a native use carries (contract 3). Explicit `usage.ak5eContext` wins; a
 * native Reaction activity supplies `castingTime: "reaction"` on its own. */
export function artCastContextFor(activity, usage = {}) {
  const explicit = usage?.ak5eContext ?? usage?.context ?? {};
  const context = { ...(explicit && typeof explicit === "object" ? explicit : {}) };
  const activation = activity?.activation?.type ?? activity?.system?.activation?.type ?? "";
  if (!context.castingTime && activation === "reaction") context.castingTime = "reaction";
  return context;
}

/** Every Actor and Token uuid currently targeted by this client, so a required target matches either. */
export function artCastTargetUuids() {
  const uuids = new Set();
  for (const token of globalThis.game?.user?.targets ?? []) {
    if (token?.uuid) uuids.add(token.uuid);
    if (token?.actor?.uuid) uuids.add(token.actor.uuid);
  }
  return [...uuids];
}

/** Pre-confirm warnings for a cast context. Pure: no Reaction is spent and nothing is written. */
export function artCastContextWarnings(actor, context = {}, targetUuids = []) {
  const warnings = [];
  if (context?.castingTime === "reaction") {
    const state = getReactions(actor);
    if (state.available <= 0) warnings.push({ id: "reaction", text: "No Reaction is available; the cast may still proceed (warning only)." });
  }
  const required = context?.requiredTargetUuid;
  if (required && !Array.from(targetUuids ?? []).includes(required)) {
    warnings.push({ id: "required-target", text: `The required target ${required} is not among the cast targets.` });
  }
  return warnings;
}

/** Start a cast context (contract 3): spend a Reaction and check the required target. Warnings never block. */
export async function beginArtCastContext(actor, context = {}, targetUuids = []) {
  const warnings = artCastContextWarnings(actor, context, targetUuids).filter(warning => warning.id !== "reaction");
  let reaction = null;
  if (context.castingTime === "reaction") {
    // A cast supplies its receipt ID so an unreceipted spend can be refunded exactly once.
    reaction = await spendReaction(actor, { triggerId: context.triggerEventId ?? "art-cast-reaction",
      ...(typeof context.reactionReceiptId === "string" && context.reactionReceiptId ? { receipt: context.reactionReceiptId } : {}) });
    if (!reaction?.ok) warnings.push({ id: "reaction", text: `No Reaction is available (${reaction?.reason ?? "exhausted"}); the cast may still proceed.` });
  }
  return { warnings, reaction, allowed: true };
}
function combinedQuoteOptions(...sources) {
  const options = Object.assign({}, ...sources), discounts = [];
  for (const source of sources) {
    discounts.push(...(source?.discounts ?? []));
    if (source?.discount) discounts.push({ amount: source.discount, source: source.discountSource });
  }
  delete options.discount; delete options.discountSource;
  if (discounts.length) options.discounts = discounts;
  return options;
}
function quoteOptions(actor, item, usage) {
  const options = combinedQuoteOptions(casterQuoteOptions(actor, item, usage), optionQuote(actor, item, usage),
    ...quoteSources.map(source => source(actor, item, usage) ?? {}), usage);
  // A caller, provider or provider-returned override is never authority: only this session's approved tuple is.
  delete options.limitOverride;
  const approval = sessionApproval(actor, item, usage);
  if (approval) options.limitOverride = limitOverride(approval.level, approval.mode, approval.keys);
  return options;
}

/** Quote contributions (discounts, lifeSupportCost) from registered cast-option providers. */
function optionQuote(actor, item, usage) {
  const selections = optionSelections(usage);
  const collected = { discounts: [] };
  for (const source of castOptionSources) {
    const { entry, warning } = optionProvider(source, actor, item, null, { usage });
    if (warning || !entry || selections[entry.id] === undefined) continue;
    let quote;
    try { quote = entry.provider.quote?.(selections[entry.id]) ?? {}; }
    catch (error) { optionProviderFailed(error, `option:${entry.id}`); continue; }
    collected.discounts.push(...(quote.discounts ?? []));
    if (quote.discount) collected.discounts.push({ amount: quote.discount, source: quote.discountSource });
    if (quote.lifeSupportCost !== undefined) {
      collected.lifeSupportCost = (Number(collected.lifeSupportCost) || 0) + (Number(quote.lifeSupportCost) || 0);
    }
  }
  if (!collected.discounts.length) delete collected.discounts;
  return collected;
}

/* ---------------------------------------------------------------------------------------------
 * CR2: confirmed per-use source-limit seam (WORKFLOW.md §3.2 "Use anyway").
 *
 * A Caster's confirmed LevelCap / NinthUsed warning is carried by `usage.ak5eCaster.overrides`, the
 * existing Caster confirmation protocol. This seam inspects the selected native tuple with an internal
 * two-key quote override, asks for every warning the owner has not accepted, and stores the approval on
 * the in-memory cast session only. Nothing here is a setting, grant, Actor flag or stored ruling.
 * ------------------------------------------------------------------------------------------- */
const CAST_MODES = new Set(["ap", "free", "ritual"]);
const SEAM_LIMIT_KEYS = { maximumArtLevel: "LevelCap", ninthLevel: "NinthUsed" };
const SEAM_MESSAGE_IDS = new Set(["maximumArtLevel", "ninthLevel", "apShortfall"]);
const shortfallText = quote => `Not enough Arts Points for this cast: ${quote.cost} required, ${quote.shortfall} short. Use anyway to spend every remaining Arts Point.`;
/** The seam labels a quote actually produces: cap/ninth first, then an accepted shortfall. */
const seamWarningsFor = quote => [...(quote.limitWarnings ?? []),
  ...((quote.limitWarnings?.length && quote.shortfall > 0) ? [{ id: "apShortfall", text: shortfallText(quote) }] : [])];
const plainData = value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const castMode = value => { if (!CAST_MODES.has(value)) throw new Error("Unknown casting mode."); return value; };
const limitOverride = (level, mode, keys) => ({ level, mode, keys: [...keys] });

/** Read-only quote of this native tuple with both limit keys relaxed: every applicable cap/ninth warning, never state. */
function seamLimitReview(actor, item, usage, base) {
  const level = integer(usage.ak5eLevel ?? usage.level ?? item.system.level, "Cast level", base, 9);
  const mode = castMode(usage.ak5eMode ?? usage.mode ?? "ap");
  const state = artsState(actor), grant = grantFor(item, actor, usage);
  const quote = quoteArt(state, base, level, grant, { ...quoteOptions(actor, item, usage), mode,
    limitOverride: limitOverride(level, mode, ["LevelCap", "NinthUsed"]) });
  const warnings = seamWarningsFor(quote);
  return { level, mode, state, grant, quote, warnings };
}

/** The source-limit facts an approval is bound to (spec §3.4); missing grant ceilings are `null`. */
function limitFacts(state, grant, mode) {
  return { actorMaximumArtLevel: state.maximumArtLevel, casterMaximumArtLevel: grant.caster?.maximumArtLevel ?? null,
    freeMaximumArtLevel: mode === "free" ? (grant.free?.level ?? null) : null, ninthLevelCast: state.ninthLevelCast };
}
const sameFacts = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Replace only this seam's warning ids/labels in a Caster context; independently validated branch warnings stay. */
function mergeSeamLabels(context, warnings = []) {
  if (!context || typeof context !== "object") return context;
  const texts = warnings.map(warning => warning.text);
  const keptWarnings = (Array.isArray(context.warnings) ? context.warnings : [])
    .filter(warning => !(warning && typeof warning === "object" && SEAM_MESSAGE_IDS.has(warning.id)))
    .filter(warning => !(typeof warning === "string" && texts.includes(warning)));
  const keptOverridden = (Array.isArray(context.overridden) ? context.overridden : []).filter(text => !texts.includes(text));
  context.warnings = [...keptWarnings, ...warnings.map(warning => ({ id: warning.id, text: warning.text }))];
  context.overridden = [...new Set([...keptOverridden, ...texts])];
  return context;
}

/** The live session approval for this exact Actor/Item/base level, if one is being cast. */
function sessionApproval(actor, item, usage) {
  const approval = sessions.get(usage?.ak5eCastId)?.limitApproval;
  if (!approval) return null;
  if (approval.actorUuid !== actor?.uuid || approval.itemId !== item?.id || approval.baseLevel !== item?.system?.level) return null;
  return approval;
}

/** The approved tuple from the live cast session only; never caller-supplied display data. */
function liveReviewedLimit(actor, item, usage) {
  const approval = sessionApproval(actor, item, usage);
  if (!approval) return null;
  return { actorUuid: actor.uuid, itemId: item.id, baseLevel: approval.baseLevel, level: approval.level, mode: approval.mode, warnings: approval.warnings };
}

/** Reviewed tuple/warnings for the native dialog. Display only: it never authorizes a debit. */
function reviewedLimit(actor, item, usage) {
  const live = liveReviewedLimit(actor, item, usage);
  if (live) return live;
  // Residual display data may still label a dialog, but only a live session approval fixes a catalogue
  // tuple or widens availability (see artAvailability).
  const review = usage?.ak5eLimitReview;
  if (!plainData(review) || review.actorUuid !== actor?.uuid || review.itemId !== item?.id || review.baseLevel !== item?.system?.level) return null;
  if (!Number.isSafeInteger(review.level) || !CAST_MODES.has(review.mode) || !Array.isArray(review.warnings)) return null;
  return review;
}
const reviewKeys = review => [...new Set((review?.warnings ?? [])
  .map(warning => Object.hasOwn(SEAM_LIMIT_KEYS, warning?.id) ? SEAM_LIMIT_KEYS[warning.id] : null).filter(Boolean))];

/** The pre-CR2 preflight probe: an ordinary strict quote of this tuple (spec §3.3 close). */
function strictArtProbe(activity, usage, session) {
  const { item } = activity;
  quoteArt(artsState(activity.actor), session.baseLevel,
    usage.ak5eLevel ?? usage.level ?? item.system.level,
    grantFor(item, activity.actor, usage),
    { ...quoteOptions(activity.actor, item, usage), mode: usage.ak5eMode ?? usage.mode ?? "ap" });
}

/**
 * Stage 1–4 of the seam: revalidate the carried Caster context at the actual native tuple, inspect the
 * source limits, require every unaccepted warning, then store the session-bound approval.
 */
function casterLimitReview(activity, usage, session) {
  delete usage.ak5eLimitReview;
  const supplied = usage.ak5eCaster;
  if (!casterEnabled(activity.actor)) {
    // A non-Caster cannot activate this seam by injecting Caster context.
    if (supplied !== undefined) throw new Error("Only a configured AK5e Caster can use a Caster cast context.");
    strictArtProbe(activity, usage, session);
    return null;
  }
  if (!plainData(supplied)) {
    // Direct native use without the Caster facade stays strictly quoted: probe before any dialog.
    strictArtProbe(activity, usage, session);
    return null;
  }
  const base = session.baseLevel;
  const level = integer(usage.ak5eLevel ?? usage.level ?? activity.item.system.level, "Cast level", base, 9);
  const mode = castMode(usage.ak5eMode ?? usage.mode ?? "ap");
  const context = validateCasterContext(activity.actor, activity.item, { ...supplied, level, mode });
  // A caller's override object is never authority; only this seam's validated quote options are.
  delete context.limitOverride; delete context.ak5eLimitOverride; delete context.ak5eLimitReview;
  usage.ak5eLevel = level; usage.ak5eMode = mode;
  const review = seamLimitReview(activity.actor, activity.item, usage, base);
  const accepted = requireOverrides(review.warnings, context.overrides);
  if (!review.warnings.length) { usage.ak5eCaster = context; return context; }
  session.limitApproval = { castId: usage.ak5eCastId, actorUuid: activity.actor.uuid, itemId: activity.item.id, baseLevel: base,
    level: review.level, mode: review.mode, keys: reviewKeys(review),
    warnings: accepted.map(warning => ({ id: warning.id, text: warning.text })),
    limitFacts: limitFacts(review.state, review.grant, review.mode) };
  // Display-only review data for the native dialog; the live session approval remains the only authority.
  usage.ak5eLimitReview = { actorUuid: session.limitApproval.actorUuid, itemId: session.limitApproval.itemId, baseLevel: base,
    level: review.level, mode: review.mode, warnings: session.limitApproval.warnings.map(warning => ({ ...warning })) };
  mergeSeamLabels(context, session.limitApproval.warnings);
  usage.ak5eCaster = context;
  return context;
}

/** Stage 7: a changed tuple or changed source-limit facts needs fresh review; nothing is proposed. */
function staleApproval(approval, activity, usage) {
  const { actor, item } = activity;
  const stale = message => {
    const error = new Error(message);
    error.name = "AK5eStaleCast";
    error.key = approval.keys.includes("LevelCap") ? "LevelCap" : "NinthUsed";
    return error;
  };
  const base = item.system.level;
  if (approval.actorUuid !== actor.uuid || approval.itemId !== item.id || approval.baseLevel !== base)
    return stale("This Art cast was reviewed for a different Art or caster. Review the cast again before using it.");
  let level, mode;
  try { level = integer(usage.ak5eLevel ?? base, "Cast level", base, 9); mode = castMode(usage.ak5eMode ?? "ap"); }
  catch (error) { return stale(`${error.message ?? error} Review the cast again before using it.`); }
  if (approval.level !== level || approval.mode !== mode)
    return stale(`This cast was reviewed at level ${approval.level} (${approval.mode}). Review the cast again before using it.`);
  const state = artsState(actor), grant = grantFor(item, actor, usage);
  if (!sameFacts(limitFacts(state, grant, mode), approval.limitFacts))
    return stale("The Art limits for this cast changed after review. Review the cast again before using it.");
  let review;
  try { review = seamLimitReview(actor, item, { ...usage, ak5eLevel: level, ak5eMode: mode }, base); }
  catch (error) { return stale(`${error.message ?? error} Review the cast again before using it.`); }
  const approved = new Map(approval.warnings.map(warning => [warning.id, warning.text]));
  const current = new Map(review.warnings.map(warning => [warning.id, warning.text]));
  const unconfirmed = review.warnings.filter(warning => !approved.has(warning.id));
  if (unconfirmed.length) return stale(`${unconfirmed.map(warning => warning.text).join(" ")} Review the cast again before using it.`);
  // A changed label is a changed reviewed condition (for example a larger AP shortfall): the old text
  // must not be republished as if it described this cast.
  if (review.warnings.some(warning => approved.get(warning.id) !== warning.text) || approval.warnings.some(warning => !current.has(warning.id)))
    return stale("The warnings for this cast changed after review. Review the cast again before using it.");
  return null;
}

export function registerArtsConfig() {
  if (!CONFIG.DND5E) return;
  // D&D5e creates spellcasting models at i18nInit. This method intentionally has no slots.
  CONFIG.DND5E.spellcasting ??= {};
  CONFIG.DND5E.spellcasting[ARTS_METHOD] = { label: "AK5e Arts", order: 30 };
}

export function isArtsActor(actor) {
  return worldRulesEnabled() ? actor?.documentName === "Actor" && ["character", "npc"].includes(actor.type)
    : actor?.getFlag?.("ak5e", "casting")?.enabled === true;
}

export function hasArtsContent(actor) {
  if (worldRulesEnabled()) return Boolean(actor?.getFlag?.("ak5e", "artsPoints") ||
    list(actor?.items).some(item => item.type === "spell" ||
      (item.type === "class" && item.system?.spellcasting?.progression && item.system.spellcasting.progression !== "none")));
  return isArtsActor(actor) || list(actor?.items).some(item =>
    item?.getFlag?.("ak5e", "chapterFiveId") || item?.getFlag?.("ak5e", "chapterThreeId") ||
    item?.flags?.ak5e?.chapterFiveId || item?.flags?.ak5e?.chapterThreeId);
}

export function isArt(activity) {
  return activity?.item?.type === "spell" && isArtsActor(activity.actor) &&
    (worldRulesEnabled() || flags(activity.item).enabled !== false);
}

function own(actor) {
  if (actor?.documentName !== "Actor" || !actor.isOwner) throw new Error("Choose an actor you own.");
  if (actor.pack) throw new Error("Import this actor into the World before configuring Arts.");
}

function idle(actor) {
  if (busy.has(actor.uuid)) throw new Error("Finish the current Arts operation for this actor first.");
}

export function grantFor(item, actor = item.actor, usage = {}) {
  const grant = flags(item);
  let result = casterGrant(actor, item, { ...grant, free: grant.free ? { ...grant.free, spent: actor?.getFlag("ak5e", "artFreeUses")?.[item.id] ?? 0 } : undefined });
  const costOrderReading = usage?.ak5eCostOrder ?? usage?.readings?.costOrder ?? (usage?.readingKey === "costOrder" ? usage?.reading : undefined) ?? usage?.costOrder;
  if (["discountsThenSurcharge", "surchargeThenDiscounts"].includes(costOrderReading)) {
    result = { ...result, caster: { ...(result.caster ?? {}), costOrder: costOrderReading } };
  }
  for (const source of grantSources) {
    const extra = source(actor, item, usage) ?? {};
    // Overlapping grants take the larger AP reduction; they never sum (ruling U3-4).
    const previousReduction = Number(result.reduction) || 0;
    const reduction = extra.reduction === undefined ? null : Math.max(0, Number(extra.reduction) || 0);
    result = { ...result, ...extra };
    if (reduction !== null) result.reduction = Math.max(previousReduction, reduction);
  }
  if (result.free && result.free.spent === undefined) result.free = { ...result.free, spent: actor?.getFlag("ak5e", "artFreeUses")?.[item.id] ?? 0 };
  return result;
}

function checkFocus(actor, item) {
  if (actor.statuses?.has("ak5e-silenced")) throw new ArtsRuleError("Silenced", "Silenced creatures cannot cast Arts.");
  if (worldRulesEnabled() && !artsState(actor).configured) {
    throw new ArtsRuleError("UnconfiguredAP", "The GM must set Arts Points and a maximum Art level before this creature can cast.");
  }
  if (flags(item).noCastingUnit === true || actor.getFlag?.("ak5e", "oripathy")?.infected === true) return;
  const focusId = artsState(actor).castingUnit;
  // Guardian of Life (Ch.3 L1506): shields the Guardian equips gain the Casting Unit property.
  if (focusId === "shield") {
    if (!list(actor.items).some(entry => entry.type === "equipment" && entry.system?.type?.value === "shield" && entry.system?.equipped === true))
      throw new ArtsRuleError("FocusMissing", "Equip a shield: a shield you equip is your Casting Unit (Guardian of Life).");
    return;
  }
  const focus = actor.items.get(focusId);
  if (!focus || focus.system.equipped !== true) throw new ArtsRuleError("FocusMissing", "Equip the Casting Unit selected in Arts setup, or configure this Art's source-defined exception.");
  const properties = focus.getFlag?.("ak5e", "tableData")?.properties ?? focus.flags?.ak5e?.tableData?.properties ?? "";
  if (worldRulesEnabled() && !/\bCasting Unit\b/i.test(properties)) {
    throw new ArtsRuleError("FocusInvalid", "The selected equipment must have the Casting Unit property.");
  }
}

export function artAvailability(actor, item, selection = {}) {
  let blocker;
  try { checkFocus(actor, item); } catch (error) { blocker = error; }
  // An approved session shows only the reviewed tuple: never a silent lower level or another mode.
  // Out of session the catalogue stays strict even if a caller supplies residual display review data.
  if (!blocker) {
    const review = liveReviewedLimit(actor, item, selection);
    if (review) {
      const keys = reviewKeys(review);
      try {
        const options = quoteOptions(actor, item, selection);
        const grant = grantFor(item, actor, selection);
        const quote = quoteArt(artsState(actor), review.baseLevel, review.level, grant,
          { ...options, mode: review.mode, limitOverride: limitOverride(review.level, review.mode, keys) });
        if (options.lifeSupportCost !== undefined) return approvedAvailability(review, { ...quote, lifeSupportCost: options.lifeSupportCost });
        return approvedAvailability(review, quote);
      } catch (error) { console.warn("AK5e | Arts approved availability", error); }
    }
  }
  const options = quoteOptions(actor, item, selection);
  const choices = artsChoices(artsState(actor), item.system.level, grantFor(item, actor, selection), { ...options, blocker });
  // Provider contributions such as Urgency of Treatment's Life Support cost travel with the quote.
  if (choices.quote && options.lifeSupportCost !== undefined) choices.quote = { ...choices.quote, lifeSupportCost: options.lifeSupportCost };
  return choices;
}

/** One reviewed tuple only: the level/mode the owner already confirmed for this use. */
function approvedAvailability(review, quote) {
  const entry = { value: review.mode, quotes: [quote], error: null };
  return { modes: [entry], mode: review.mode, quotes: [quote], quote, level: review.level, error: null, castable: true };
}

/** Review data only. No World/Actor writes until configureActorArts is explicitly invoked. */
export function previewActorArts(actor, options = {}) {
  own(actor);
  const state = artsState(actor);
  const previous = actor.getFlag("ak5e", "casting") ?? {};
  const config = castingConfig(options, previous);
  const maximum = integer(options.maximum ?? state.maximum, "Maximum Arts Points");
  const value = integer(options.value ?? state.value, "Arts Points");
  const maximumArtLevel = integer(options.maximumArtLevel ?? state.maximumArtLevel, "Maximum Art level", 0, 9);
  if (value > Math.max(maximum, state.value)) throw new Error("Use an explicit over-cap recovery for temporary AP above the maximum.");
  const items = options.adopt === false ? [] : list(actor.items).filter(item => item.type === "spell" && flags(item).enabled !== false);
  return {
    actor: { "flags.ak5e.casting": config, "flags.ak5e.artsPoints": {
      ...(actor.getFlag("ak5e", "artsPoints") ?? {}), maximum, value, maximumArtLevel,
      ninthLevelCast: state.ninthLevelCast
    } },
    items: items.map(item => ({ ...adoptedSpellData(item), "system.ability": item.system.ability || config.ability })),
    names: items.map(item => item.name)
  };
}

export async function configureActorArts(actor, options = {}) {
  own(actor); idle(actor);
  if (worldRulesEnabled() && !game.user.isGM && !list(actor.items).some(item =>
    item.type === "class" && (item.getFlag?.("ak5e", "chapterThreeId") || item.flags?.ak5e?.chapterThreeId))) {
    throw new Error("The GM must assign Arts Points for a caster without an AK5e class.");
  }
  if (!available) throw new Error("Arts integration requires the supported D&D5e activity API (tested with 5.3.3).");
  const plan = previewActorArts(actor, options);
  busy.add(actor.uuid);
  try {
    if (options.adopt === false) {
      await actor.update({ ...plan.actor, "flags.ak5e.lastArtCast": null });
      return artsState(actor);
    }
    // Preserve a recovery record before a multi-document adoption. Retrying is idempotent.
    await actor.update({ "flags.ak5e.artsSetup": { status: "pending", itemIds: plan.items.map(i => i._id) } });
    if (plan.items.length) await actor.updateEmbeddedDocuments("Item", plan.items);
    await actor.update({ ...plan.actor, "flags.ak5e.artsSetup.status": "complete", "flags.ak5e.lastArtCast": null });
    return artsState(actor);
  } finally { busy.delete(actor.uuid); }
}

export async function adjustActorArts(actor, amount, options = {}) {
  own(actor); idle(actor);
  const state = artsState(actor);
  if (!state.enabled) throw new Error("Enable AK5e Arts on this actor first.");
  const value = recoveryValue(state, amount, options);
  busy.add(actor.uuid);
  try {
    await actor.update({ "flags.ak5e.artsPoints.value": value, "flags.ak5e.lastArtCast": null });
    return artsState(actor);
  } finally { busy.delete(actor.uuid); }
}

export async function setActorArtsValue(actor, value) {
  own(actor); idle(actor);
  const state = artsState(actor);
  const next = integer(value, "Arts Points");
  if (next > Math.max(state.maximum, state.value)) throw new Error(artsText("NoOverflow"));
  return adjustActorArts(actor, next - state.value);
}

function artsRecoveryUpdates(actor, type) {
  const updates = { ...restArtsUpdates(actor, type), "flags.ak5e.lastArtCast": null };
  for (const item of list(actor.items)) {
    const free = flags(item).free;
    if (!free || free.recovery === "manual" || (type !== "long" && free.recovery !== "short")) continue;
    updates[`flags.ak5e.artFreeUses.${item.id}`] = 0;
  }
  return updates;
}

export async function recoverActorArts(actor, type) {
  own(actor); idle(actor);
  if (!isArtsActor(actor)) throw new Error(artsText("EnableFirst"));
  if (!["short", "long"].includes(type)) throw new Error(artsText("ChooseRest"));
  busy.add(actor.uuid);
  try { await actor.update(artsRecoveryUpdates(actor, type)); return artsState(actor); }
  finally { busy.delete(actor.uuid); }
}

export async function equipActorCastingUnit(actor) {
  own(actor); idle(actor);
  const item = actor.items.get(artsState(actor).castingUnit);
  if (!isArtsActor(actor) || !item || !["weapon", "equipment", "tool"].includes(item.type)) throw new Error(artsText("FocusMissing"));
  busy.add(actor.uuid);
  try { await item.update({ "system.equipped": true }); }
  finally { busy.delete(actor.uuid); }
}

/** Explicit GM rule configuration; a free cast is a documented grant, not a consumption bypass. */
export async function configureArt(item, options) {
  own(item.actor); idle(item.actor);
  if (!game.user.isGM) throw new Error("Only the GM can configure an Art's rule exceptions.");
  if (item.type !== "spell") throw new Error("Select a spell Item.");
  const previous = flags(item);
  const grant = {
    ...previous, enabled: options.enabled !== false,
    noCastingUnit: options.noCastingUnit === true,
    ritual: options.ritual === true,
    onlyFree: options.onlyFree === true,
    reduction: integer(options.reduction ?? 0, "AP reduction", 0, 9),
    minimumCost: integer(options.minimumCost ?? 0, "Minimum AP cost", 0, 9),
    source: String(options.source ?? "").trim(),
    blocked: String(options.blocked ?? "").trim()
  };
  if (options.free) {
    const free = options.free;
    const level = integer(free.level, "Free cast maximum level", item.system.level, 9);
    const maximum = free.maximum === null ? null : integer(free.maximum, "Free uses", 1);
    if (!["short", "long", "manual"].includes(free.recovery)) throw new Error("Select free-use recovery.");
    grant.free = { level, maximum, recovery: free.recovery };
  } else grant.free = null;
  if ((grant.free || grant.noCastingUnit || grant.reduction || grant.ritual || grant.onlyFree) && !grant.source) {
    throw new Error("Record the source feature or GM ruling for these casting exceptions.");
  }
  busy.add(item.actor.uuid);
  try { await item.update({ "flags.ak5e.art": grant }); }
  finally { busy.delete(item.actor.uuid); }
}

function artReceipts(actor) { return actor.getFlag("ak5e", "artReceipts") ?? []; }
function receiptWindowCurrent(_actor, receipt) { return Boolean(receipt) && !isLocked(receipt); }
function actorByUuid(uuid) { return globalThis.fromUuidSync?.(uuid) ?? list(game.actors).find(actor => actor.uuid === uuid); }
function receiptFromMessage(actor, message) {
  const data = message?.data ?? message;
  const receipt = data?.flags?.ak5e?.artCast ?? message?.getFlag?.("ak5e", "artCast");
  if (!receipt || data?.speaker?.actor !== actor.id || receipt.actorUuid !== actor.uuid) throw new Error("This cast card does not belong to the selected Actor.");
  return receipt;
}

export async function undoArtReceipt(actor, receiptId, { message } = {}) {
  if (!actor || actor.documentName !== "Actor") throw new Error("Select the Actor that made this cast.");
  if (!(game.user.isGM || actor.isOwner)) throw new Error("You must own this Actor or be a GM to undo its cast.");
  idle(actor);
  const ledger = artReceipts(actor);
  const entry = ledger.find(receipt => receipt.id === receiptId);
  if (!entry || !artReceiptUndoAllowed(actor, entry)) throw new Error("This cast receipt is missing, already undone, or locked.");
  if (!receiptWindowCurrent(actor, entry)) throw new Error("This cast belongs to a previous encounter window and is locked.");
  // A child belongs to its parent's window: a locked parent locks every child (contract item 4).
  if (entry.parentReceiptId) {
    const parent = ledger.find(receipt => receipt.id === entry.parentReceiptId);
    if (parent && isLocked(parent)) throw new Error("This cast is locked because its parent cast belongs to a previous encounter window.");
  }
  if (message) {
    const cardReceipt = receiptFromMessage(actor, message);
    if (cardReceipt.id !== entry.id) throw new Error("The chat card receipt does not match this cast.");
  }
  const { previews } = previewLinkedArtUndo(actor, entry, ledger);
  const update = {};
  const merged = { restore: [], conflicts: [], itemRemovals: [], itemConflicts: [],
    safeCount: 0, conflictCount: 0, itemSafeCount: 0, itemConflictCount: 0 };
  const undone = new Set(previews.map(p => p.receipt.id));
  busy.add(actor.uuid);
  try {
    // Commit targets first, in the same reverse causal order as the review; each path is checked again.
    // A failure remains available with sourceUndone so retry cannot refund source resources twice.
    const pending = new Set(), outcomes = new Map();
    for (const { receipt } of previews.filter(p => p.receipt.relay)) {
      let result;
      try { result = await revertLinkedRelay(actor, receipt); }
      catch (error) { result = { ok: false, reason: error.message ?? String(error) }; }
      outcomes.set(receipt.id, result);
      if (!result.ok) {
        pending.add(receipt.id);
        const conflicts = result.conflicts?.length ? result.conflicts : [{ path: receipt.relay.targetUuid, reason: result.reason }];
        merged.conflicts.push(...conflicts);
        ui.notifications.warn(`Target undo for ${receipt.id} remains pending: ${result.reason ?? "target conflict"}. Preserved ${conflicts.map(c => c.path).join(", ")}; review/retry from Arts cast receipts.`);
      }
      for (const path of result.restored ?? []) merged.restore.push({ path, targetUuid: receipt.relay.targetUuid });
    }
    for (const { receipt } of previews) if (pending.has(receipt.id)) {
      let parent = receipt.parentReceiptId;
      while (parent && undone.has(parent)) { pending.add(parent); parent = ledger.find(r => r.id === parent)?.parentReceiptId; }
    }
    // Relay transport awaited another client; project source changes again immediately before this
    // Actor write so independent later resource/state edits are not replaced by a stale preview.
    const liveLedger = artReceipts(actor);
    const liveEntry = liveLedger.find(r => r.id === entry.id);
    if (!liveEntry || !artReceiptUndoAllowed(actor, liveEntry)) throw new Error("This receipt was undone or locked while target undo was in progress. Review the current receipts.");
    const fresh = previewLinkedArtUndo(actor, liveEntry, liveLedger);
    if (fresh.previews.some(p => !undone.has(p.receipt.id))) throw new Error("New linked uses arrived during target undo. Review undo again; completed target reversals are recorded.");
    Object.assign(update, fresh.update);
    for (const item of fresh.previews) {
      const original = previews.find(p => p.receipt.id === item.receipt.id);
      if (original) original.preview = item.preview;
      merged.restore.push(...item.preview.restore);
      merged.conflicts.push(...item.preview.conflicts);
      merged.itemRemovals.push(...item.preview.itemRemovals);
      merged.itemConflicts.push(...item.preview.itemConflicts);
    }
    if (actor.getFlag("ak5e", "lastArtCast")?.id === entry.id) {
      update["flags.ak5e.lastArtCast"] = [...liveLedger].reverse().find(r => !undone.has(r.id) && r.status === "available" && !isLocked(r)) ?? null;
    }
    const receipts = liveLedger.map(receipt => {
      const item = previews.find(p => p.receipt.id === receipt.id);
      if (!item) return receipt;
      return { ...receipt, sourceUndone: true, status: pending.has(receipt.id) ? "available" : "undone",
        undoneBy: game.user.id, undoneAt: Date.now(), targetUndoPending: pending.has(receipt.id),
        targetUndoOutcome: outcomes.get(receipt.id) ?? receipt.targetUndoOutcome ?? null,
        conflicts: item.preview.conflicts.map(c => c.path), restored: item.preview.restore.map(c => c.path) };
    });
    merged.safeCount = merged.restore.length;
    merged.conflictCount = merged.conflicts.length;
    merged.itemSafeCount = merged.itemRemovals.length;
    merged.itemConflictCount = merged.itemConflicts.length;
    await actor.update({ ...update, "flags.ak5e.artReceipts": receipts });

    // Items this use created are removed, unless their provenance changed after the use (preserved and
    // reported as an unsafe conflict).
    if (merged.itemRemovals.length) {
      try { await actor.deleteEmbeddedDocuments("Item", [...new Set(merged.itemRemovals)]); }
      catch (error) {
        console.warn("AK5e | Arts undo could not remove granted Items", error);
        ui.notifications.warn(`Some granted Items could not be removed: ${error.message ?? error}. Remove them manually.`);
      }
    }
    // Preserved Items are announced publicly (not only to the undoing user) so the table can recover them.
    if (merged.itemConflicts.length) {
      try {
        await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
          content: `<p class="ak5e-art-undo-conflict" role="alert">${escape(entry.name)} undone by ${escape(game.user.name ?? game.user.id)}. ` +
            `Preserved ${merged.itemConflicts.length} granted Item${merged.itemConflicts.length === 1 ? "" : "s"} that changed after this use or could not be shown to be unedited: ` +
            `${merged.itemConflicts.map(conflict => escape(conflict.name ?? conflict.id)).join(", ")}. Remove any that are not wanted manually.</p>` });
      } catch (error) { console.warn("AK5e | Arts undo conflict card failed", error); }
    }
    for (const conflict of merged.itemConflicts) {
      const text = conflict.unverified
        ? `The granted Item ${conflict.name ?? conflict.id} has no saved source baseline, so it cannot be shown to be unedited and was preserved; remove it manually if needed.`
        : `The granted Item ${conflict.name ?? conflict.id} changed after this use and was preserved; remove it manually if needed.`;
      console.warn("AK5e | Arts undo preserved a modified granted Item", text);
      ui.notifications.warn(text);
    }
    const castCard = message ?? list(game.messages).find(candidate => {
      const data = candidate?.data ?? candidate;
      const cardReceipt = data?.flags?.ak5e?.artCast ?? candidate?.getFlag?.("ak5e", "artCast");
      return cardReceipt?.id === entry.id && cardReceipt?.actorUuid === actor.uuid;
    });
    if (castCard?.update) {
      try { await castCard.update({ "flags.ak5e.artCast.status": pending.size ? "available" : "undone", "flags.ak5e.artCast.undoneBy": game.user.id }); }
      catch {
        await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
          content: `<p>${escape(entry.name)} undo ${pending.size ? "incomplete; target recovery remains available" : "complete"}. Restored ${merged.safeCount} fields; preserved ${merged.conflictCount} changed fields.</p>` });
      }
    }
    // Linked parent/child changes to one path are composed into one restored value; list each field once.
    const restoredPaths = [...new Set(merged.restore.map(c => c.path))];
    const outcomeText = `${entry.name ?? entry.id}: undo ${pending.size ? "incomplete; target recovery remains available" : "complete"}. ` +
      `Restored ${restoredPaths.length} fields (${restoredPaths.join(", ") || "none"}); ` +
      `preserved ${merged.conflictCount} fields (${merged.conflicts.map(c => `${c.path}: ${c.reason ?? "later change"}`).join(", ") || "none"}). ` +
      `Removed ${merged.itemSafeCount} granted Items; preserved ${merged.itemConflictCount} modified/unverified Items.`;
    try { await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<p class="ak5e-art-undo-outcome" role="status">${escape(outcomeText)}</p>` }); }
    catch (error) { console.warn("AK5e | Arts undo public outcome failed", error); }
    ui.notifications.info(outcomeText);
    return { ...merged, receipt: entry };
  } finally { busy.delete(actor.uuid); }
}

/** Backwards-compatible entry point: now presents all current-window casts, with ownership checks. */
export async function undoLastArt(actor) {
  return openArtUndoList(actor);
}

function recentArtReceipts(actor) {
  return [...artReceipts(actor)].reverse().map(receipt => ({ receipt, current: receiptWindowCurrent(actor, receipt) }));
}

function artUndoReview(actor, entry) {
  const { previews } = previewLinkedArtUndo(actor, entry, artReceipts(actor));
  return previews.map(({ receipt, preview, targetPreview }) => `<section><h3>${escape(receipt.name ?? receipt.id)} — ${escape(receipt.id)}</h3>` +
    `<p>${receipt.parentReceiptId ? `Linked child of ${escape(receipt.parentReceiptId)}` : "Selected receipt"}${receipt.sourceUndone ? "; source already restored (retry targets only)" : ""}.</p>` +
    `<p>Source: will restore ${preview.restore.map(c => escape(c.path)).join(", ") || "none"}; preserve ${preview.conflicts.map(c => escape(c.path)).join(", ") || "none"}.</p>` +
    `<p>Granted Items: remove ${preview.itemRemovals.map(escape).join(", ") || "none"}; preserve ${preview.itemConflicts.map(c => escape(c.name ?? c.id)).join(", ") || "none"}.</p>` +
    (targetPreview ? `<p>Target ${escape(receipt.relay.targetUuid)}: will restore ${targetPreview.conflicts.length ? "none (target recovery pending)" : targetPreview.restore.map(c => escape(c.path)).join(", ") || "none"}; ` +
      `preserve ${targetPreview.conflicts.map(c => `${escape(c.path)} (${escape(c.reason)})`).join(", ") || "none"}.</p>` : "") + "</section>").join("") +
    "<p>Values are checked again when you confirm. Later changes are preserved and reported publicly; failed target undo remains available for retry.</p>";
}

export async function openArtUndoList(actor) {
  if (!(game.user.isGM || actor?.isOwner)) throw new Error("You must own this Actor or be a GM to review its casts.");
  const entries = recentArtReceipts(actor);
  if (!entries.length) throw new Error("This Actor has no recorded Art casts.");
  const content = "<ul>" + entries.map(({ receipt, current }) => `<li>${escape(receipt.name)} — ${escape(receipt.status)}${current ? " (current window)" : " (locked)"}: ${escape(receipt.cost)} AP</li>`).join("") + "</ul>";
  const choice = await dialogPage("Arts cast receipts", content + '<label>Cast <select name="receipt">' + entries.map(({ receipt, current }) => `<option value="${escape(receipt.id)}" ${receipt.status !== "available" || !current ? "disabled" : ""}>${escape(receipt.name)} — ${escape(receipt.id)}</option>`).join("") + "</select></label>", [
    { action: "undo", label: "Review undo", default: true, callback: (_event, button) => button.form.elements.receipt.value },
    { action: "cancel", label: "Close" }
  ]);
  if (!choice || choice === "cancel") return;
  const entry = artReceipts(actor).find(receipt => receipt.id === choice);
  if (!entry || entry.status !== "available" || !receiptWindowCurrent(actor, entry)) return;
  const detail = artUndoReview(actor, entry);
  const confirmed = await dialogPage("Confirm cast undo", detail, [
    { action: "restore", label: "Restore safe changes", default: true, callback: () => true },
    { action: "cancel", label: "Cancel" }
  ]);
  if (confirmed === true) return undoArtReceipt(actor, choice);
}

export async function renderArtReceiptControls(message, html) {
  const data = message?.data ?? message, receipt = data?.flags?.ak5e?.artCast;
  if (!receipt?.actorUuid || !receipt?.id) return;
  const actor = actorByUuid(receipt.actorUuid);
  if (!actor || !(game.user.isGM || actor.isOwner)) return;
  const locked = !artReceipts(actor).some(entry => entry.id === receipt.id && entry.status === "available" && receiptWindowCurrent(actor, entry));
  const shortfall = Number(receipt.shortfall ?? 0);
  const entry = artReceipts(actor).find(candidate => candidate.id === receipt.id);
  // Overridden and provider warnings are public (WORKFLOW §3.2): list them on the cast card.
  const warnings = [...new Set([...(receipt.warnings ?? []), ...((entry?.warnings) ?? [])].filter(Boolean))];
  const warning = [shortfall ? `<p role="alert">AP short by ${shortfall}; resource was clamped at 0.</p>` : "",
    ...warnings.map(text => `<p role="alert" class="ak5e-art-cast-warning">${escape(text)}</p>`)].join("");
  // A recorded Life Support spend supersedes the raw request on the public card: show what the
  // pool actually gave and the shortfall, not the requested amount (FINDING-6).
  const lsCost = Number(receipt.lifeSupportCost), lsShort = Number(receipt.lifeSupportShortfall),
    lsReq = Number(receipt.lifeSupportRequested);
  const lifeSupportRecorded = Number.isFinite(lsCost) && lsReq > 0;
  const chosen = Object.entries(receipt.options ?? {}).map(([id, values]) => {
    const shown = Object.entries(values ?? {}).filter(([key, value]) => value !== "" && value !== null && value !== undefined
        && !(lifeSupportRecorded && key === "lifeSupport"))
      .map(([key, value]) => `${escape(key)}: ${escape(value)}`).join(", ");
    return shown ? `<p class="ak5e-art-cast-option">${escape(id)} — ${shown}</p>` : "";
  }).join("");
  const lifeSupport = lifeSupportRecorded
    ? `<p class="ak5e-art-cast-option">Life Support — spent ${lsCost}${lsShort > 0 ? ` (short ${lsShort})` : ""}</p>` : "";
  const button = entry?.status === "undone" ? `<span class="ak5e-art-receipt-undone">Cast undone by ${escape(game.users?.get?.(entry.undoneBy)?.name ?? entry.undoneBy ?? "a user")}</span>`
    : locked ? '<span class="ak5e-art-receipt-locked">Cast undo locked</span>'
    : `<button type="button" data-ak5e-art-undo="${escape(receipt.id)}">Undo this cast</button>`;
  const root = html;
  if (!root?.querySelector) return;
  // D&D5e activity cards rebuild .message-content after renderChatMessageHTML, so this also runs on
  // dnd5e.renderChatMessage: insert when missing, but wire the (stable) root click listener only once.
  if (!root.querySelector(".ak5e-art-receipt-controls")) {
    root.querySelector(".message-content")?.insertAdjacentHTML("beforeend", `<div class="ak5e-art-receipt-controls">${warning}${chosen}${lifeSupport}${button}</div>`);
  }
  if (wiredArtCards.has(root)) return;
  wiredArtCards.add(root);
  root.addEventListener("click", async event => {
    const undoButton = event.target?.closest?.("[data-ak5e-art-undo]");
    if (!undoButton || !root.contains(undoButton)) return;
    event.preventDefault();
    try {
      const detail = artUndoReview(actor, artReceipts(actor).find(entry => entry.id === receipt.id));
      const confirmed = await dialogPage("Confirm cast undo", detail, [
        { action: "restore", label: "Restore safe changes", default: true, callback: () => true },
        { action: "cancel", label: "Cancel" }
      ]);
      if (confirmed === true) await undoArtReceipt(actor, undoButton.dataset.ak5eArtUndo, { message });
    } catch (error) { ui.notifications.warn(error.message); }
  });
}

export function prepareArtUse(activity, usage, dialog, message) {
  if (!isArt(activity)) return;
  const session = sessions.get(usage.ak5eCastId);
  if (!session) { ui.notifications.error("Arts casting must use the activity's Cast action."); return false; }
  try { own(activity.actor); }
  catch (error) { ui.notifications.warn(artsErrorText(error)); return false; }
  usage.consume = { ...(typeof usage.consume === "object" ? usage.consume : {}), spellSlot: false };
  // Do not let a stale D&D5e slot name replace our numeric scaling later.
  delete usage.spell;
  usage.scaling = 0;
  usage.ak5eLevel ??= activity.item.system.level;
  usage.ak5eContext = artCastContextFor(activity, usage);
  usage.hasConsumption = true;
  dialog.configure = true;
  dialog.applicationClass = artsDialogClass(dialog.applicationClass);
  message.hasConsumption = true;
  session.activity = activity;
  try { prepareCasterActivity(activity, usage, message); }
  catch (error) { ui.notifications.warn(artsErrorText(error)); return false; }
  attachSeamLabels(session, activity, usage, message);
}

/** Reattach the session's approved labels after a Caster context revalidation rewrites `usage.ak5eCaster`. */
function attachSeamLabels(session, activity, usage, message) {
  const approval = session?.limitApproval;
  if (!approval) return;
  if (approval.actorUuid !== activity.actor?.uuid || approval.itemId !== activity.item?.id) return;
  mergeSeamLabels(usage.ak5eCaster, approval.warnings);
  const mirrored = message?.data?.flags?.ak5e?.casterCast;
  if (mirrored && mirrored !== usage.ak5eCaster) mergeSeamLabels(mirrored, approval.warnings);
}

export function consumeArt(activity, usage, message, updates) {
  if (!isArt(activity)) return;
  try {
    const session = sessions.get(usage.ak5eCastId);
    if (!session || session.committed) throw new Error("This cast has already been processed or is no longer active.");
    own(activity.actor); checkFocus(activity.actor, activity.item);
    const state = artsState(activity.actor);
    const approval = session.limitApproval;
    if (approval) {
      const stale = staleApproval(approval, activity, usage);
      if (stale) { session.refusal = stale; ui.notifications.warn(stale.message); return false; }
    }
    const level = integer(usage.ak5eLevel ?? activity.item.system.level, "Cast level", session.baseLevel, 9);
    const mode = castMode(usage.ak5eMode ?? "ap");
    const quote = quoteArt(state, session.baseLevel, level, grantFor(activity.item, activity.actor, usage), { ...quoteOptions(activity.actor, activity.item, usage), mode });
    // The published labels must describe the committed quote, not only the review-time quote: a changed
    // shortfall text (same id) is a changed condition and needs fresh confirmation.
    if (approval) {
      const expected = seamWarningsFor(quote), approved = new Map(approval.warnings.map(warning => [warning.id, warning.text]));
      if (expected.length !== approval.warnings.length || expected.some(warning => approved.get(warning.id) !== warning.text)) {
        const stale = new Error("The warnings for this cast changed after review. Review the cast again before using it.");
        stale.name = "AK5eStaleCast";
        stale.key = approval.keys.includes("LevelCap") ? "LevelCap" : "NinthUsed";
        session.refusal = stale;
        ui.notifications.warn(stale.message);
        return false;
      }
    }
    const freeSpent = quote.mode === "free" && quote.freeRemaining !== null
      ? (activity.actor.getFlag("ak5e", "artFreeUses")?.[activity.item.id] ?? 0) : null;
    const receipt = {
      id: usage.ak5eCastId, itemId: activity.item.id, name: activity.item.name,
      level: quote.level, cost: quote.cost, mode: quote.mode,
      before: state.value, after: Math.max(0, state.value - quote.cost), shortfall: quote.shortfall,
      ninthBefore: state.ninthLevelCast, ninthAfter: quote.ninthLevelCast, freeSpent,
      previousLastArtCastId: activity.actor.getFlag("ak5e", "lastArtCast")?.id ?? null,
      warnings: []
    };
    const context = artCastContextFor(activity, usage);
    if (approval) receipt.actualCost = receipt.before - receipt.after;
    receipt.warnings.push(...artCastContextWarnings(activity.actor, context, artCastTargetUuids()).map(warning => warning.text));
    // Confirm-step warnings are published on the card (overrides and provider warnings are public).
    receipt.warnings.push(...(usage.ak5eCastOptionWarnings ?? []).map(text => typeof text === "string" ? text : text?.text).filter(Boolean));
    updates.actor ??= {};
    // Fail on unexpected explicit slot targets, rather than silently charging both systems.
    if (Object.keys(updates.actor).some(key => key.startsWith("system.spells.")) || updates.actor.system?.spells) {
      throw new Error("This activity has an explicit spell-slot consumption target. Remove that target before casting as an Art.");
    }
    Object.assign(updates.actor, {
      "flags.ak5e.artsPoints.value": receipt.after,
      "flags.ak5e.artsPoints.ninthLevelCast": receipt.ninthAfter,
      "flags.ak5e.lastArtCast": receipt
    });
    if (freeSpent !== null) {
      updates.actor[`flags.ak5e.artFreeUses.${activity.item.id}`] = freeSpent + 1;
    }
    casterConsumption(activity, usage, updates, receipt);
    // Both prepare and consumption revalidate their Caster context; the approved labels are reattached here.
    if (approval && receipt.caster?.context) mergeSeamLabels(receipt.caster.context, approval.warnings);
    for (const consumer of consumers) consumer(activity, usage, updates, receipt, quote);
    // Cast-option consumption joins the same Actor update, so undoing the cast reverses it too.
    const optionWarnings = applyArtCastOptions(activity, usage, updates, receipt);
    receipt.warnings.push(...optionWarnings.map(warning => warning.text));
    // Provider warnings for the committed selection are public, even when the dialog did not render
    // the fields (for example a cast driven by the legacy card path).
    const checked = validateArtCastOptionSelection(activity.actor, activity.item, activity, optionSelections(usage), { usage });
    receipt.warnings.push(...checked.warnings.map(warning => warning.text));
    if (approval) receipt.warnings.push(...approval.warnings.map(warning => warning.text));
    receipt.warnings = [...new Set(receipt.warnings)];
    receipt.options ??= {};
    const changes = captureArtChanges(activity.actor, updates.actor);
    receipt.actorUuid = activity.actor.uuid;
    receipt.windowId = artReceiptWindow(activity.actor).id;
    receipt.changes = changes;
    updates.actor["flags.ak5e.artReceipts"] = appendArtReceipt(activity.actor, receipt, changes);
    message.data ??= {};
    message.data.flags ??= {};
    message.data.flags.ak5e = { ...message.data.flags.ak5e, artCast: structuredClone(receipt), castId: receipt.id };
    message.data.system ??= {};
    message.data.system.spellLevel = quote.level;
    session.receipt = receipt;
    session.committed = true;
  } catch (error) { ui.notifications.warn(artsErrorText(error)); return false; }
}

export function completeArtsRest(actor, result, config) {
  if (!isArtsActor(actor) || (worldRulesEnabled() && !artsState(actor).configured)) return;
  if (busy.has(actor.uuid)) { ui.notifications.warn("Finish the current Arts operation before resting."); return false; }
  const type = config.type ?? result.type;
  if (!["short", "long"].includes(type)) return;
  result.updateData ??= {};
  Object.assign(result.updateData, artsRecoveryUpdates(actor, type));
}

/** The dialog persists the cast level/mode as ak5eLevel/ak5eMode; the rules catalogue reads
 * level/mode. Map them so a selected upcast survives re-renders, footer quotes and confirms. */
function dialogUsage(config = {}) {
  const usage = { ...config };
  if (usage.level === undefined && usage.ak5eLevel !== undefined) usage.level = usage.ak5eLevel;
  if (usage.mode === undefined && usage.ak5eMode !== undefined) usage.mode = usage.ak5eMode;
  return usage;
}

const dialogClasses = new WeakMap();
export function artsDialogClass(Base) {
  if (dialogClasses.has(Base)) return dialogClasses.get(Base);
  class ArtsUsageDialog extends Base {
    async _prepareScalingContext(context) {
      const state = artsState(this.actor);
      const usage = dialogUsage(this.config);
      const grant = grantFor(this.item, this.actor, usage);
      const choices = artAvailability(this.actor, this.item, usage);
      this.config.ak5eMode = choices.mode;
      this.config.ak5eLevel = choices.level;
      const modes = choices.modes.map(m => ({ value: m.value, label: artsText(`Mode.${m.value}`) }));
      const options = choices.quotes.map(q => ({ value: String(q.level), label: artsText(q.level === 0 ? "CantripCost" : "LevelCost", q) }));
      const castContext = artCastContextFor(this.activity ?? this.item, usage);
      const targetUuids = artCastTargetUuids();
      const castOptions = await artCastOptionsFor(this.actor, this.item, this.activity ?? null, { usage });
      const optionWarnings = await validateArtCastOptions(this.actor, this.item, this.activity ?? null,
        castOptions.options.reduce((all, option) => { all[option.id] = option.selection ?? {}; return all; }, {}), { usage });
      const contextWarnings = artCastContextWarnings(this.actor, castContext, targetUuids);
      const review = reviewedLimit(this.actor, this.item, usage);
      this.config.ak5eContext = castContext;
      return { ...context, hasScaling: true, spellSlots: null, scaling: null,
        ak5eArts: { modes, mode: choices.mode, options, level: String(choices.level),
          modeLabel: artsText(`Mode.${choices.mode}`), levelLabel: options.find(o => Number(o.value) === choices.level)?.label,
          chooseMode: modes.length > 1, chooseLevel: options.length > 1,
          cost: choices.quote?.cost, shortfall: choices.quote?.shortfall ?? 0, remaining: choices.quote?.remaining ?? null,
          modifiers: choices.quote?.modifiers ?? [], origin: choices.quote?.origin ?? null,
          castOptions: castOptions.options, castOptionWarnings: castOptions.warnings,
          // Provider validate warnings already appear in castOptionWarnings; the template renders
          // both lists, so only context warnings and validate warnings not shown above travel here.
          castContextWarnings: [...contextWarnings, ...optionWarnings.warnings.filter(warning =>
            !castOptions.warnings.some(shown => shown.text === warning.text)),
            ...(review ? review.warnings.map(warning => ({ id: warning.id, text: warning.text })) : [])]
            .filter((warning, index, all) => all.findIndex(other => other.text === warning.text) === index),
          value: state.value, maximum: state.maximum, source: [grant.source, choices.quote?.shortfall ? `Warning: AP short by ${choices.quote.shortfall}; Use anyway clamps AP to 0.` : ""].filter(Boolean).join(" — "),
          ritual: choices.mode === "ritual", unavailable: !choices.quote,
          reason: choices.error ? artsErrorText(choices.error) : "" } };
    }

    async _prepareSubmitData(event, formData) {
      const data = await super._prepareSubmitData(event, formData);
      const base = sessions.get(this.config.ak5eCastId)?.baseLevel ?? this.item.system.level;
      const selected = { ...this.config, ...data, mode: data.ak5eMode ?? this.config.ak5eMode, level: data.ak5eLevel ?? this.config.ak5eLevel };
      // Rebuild provider selections from the rendered fields; a dialog without them keeps the
      // selections the caller already supplied rather than silently dropping them.
      const collected = collectArtCastOptionSelections(formData);
      const selections = { ...selectionEntries(this.config.ak5eOptions), ...selectionEntries(data.ak5eOptions) };
      for (const [id, values] of Object.entries(collected)) selections[id] = { ...(selections[id] ?? {}), ...values };
      if (Object.keys(selections).length) { selected.ak5eOptions = selections; data.ak5eOptions = selections; }
      // Native change events recalculate choices. Confirmation retains the requested cast:
      // consumption must reject a stale selection rather than silently cast at a lower level.
      const choices = event?.type === "click"
        ? { mode: selected.mode, level: integer(selected.level, "Cast level", base, 9) }
        : artAvailability(this.actor, this.item, selected);
      data.ak5eLevel = choices.level;
      data.ak5eMode = choices.mode;
      // The reviewed level/mode are fixed for this overridden use only; changing them means Cancel and re-quote.
      const review = reviewedLimit(this.actor, this.item, selected);
      if (review) { data.ak5eLevel = review.level; data.ak5eMode = review.mode; }
      data.ak5eContext = artCastContextFor(this.activity ?? this.item, selected);
      // Warnings are shown on the confirm step and public card; they never block the cast.
      const validation = await validateArtCastOptions(this.actor, this.item, this.activity ?? null, selections, { usage: selected });
      data.ak5eCastOptionWarnings = validation.warnings.map(warning => warning.text);
      data.ak5eContextWarnings = artCastContextWarnings(this.actor, data.ak5eContext, artCastTargetUuids()).map(warning => warning.text);
      data.scaling = data.ak5eLevel - base;
      // Parent usage scaling must receive a level delta, never a fabricated slot.
      delete data.spell;
      data.consume = { ...(data.consume ?? this.config.consume ?? {}), spellSlot: false };
      this.config.ak5eOptions = selections;
      this.config.ak5eContext = data.ak5eContext;
      this.config.ak5eCastOptionWarnings = data.ak5eCastOptionWarnings;
      return data;
    }

    async _prepareConsumptionContext(context, options) {
      const result = await super._prepareConsumptionContext(context, options);
      result.fields = (result.fields ?? []).filter(field => field.name !== "consume.spellSlot");
      result.hasConsumption = result.fields.length > 0;
      return result;
    }

    async _prepareFooterContext(context, options) {
      const result = await super._prepareFooterContext(context, options);
      const usage = dialogUsage(this.config);
      const choices = artAvailability(this.actor, this.item, usage);
      // A confirmed source-limit use is always labelled honestly, even when AP is sufficient.
      const review = reviewedLimit(this.actor, this.item, usage);
      for (const button of result.buttons ?? []) if (button.action === "use") {
        button.label = review || choices.quote?.shortfall ? "Use anyway" : artsText("Cast");
        button.disabled = !choices.quote;
      }
      return result;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      const choices = artAvailability(this.actor, this.item, dialogUsage(this.config));
      const button = this.element.querySelector('[data-action="use"]');
      if (button) button.disabled = !choices.quote;
    }

    static PARTS = { ...Base.PARTS, scaling: { template: "modules/ak5e/templates/arts-usage.hbs" } };
  }
  dialogClasses.set(Base, ArtsUsageDialog);
  return ArtsUsageDialog;
}

/* Reaction recovery. A Reaction is spent through `spendReaction` (its own Actor write), then folded into
 * the cast receipt (a second write). Between those writes the spend is not yet reversible by cast undo, so a
 * durable recovery record is persisted first and removed only when the receipt holds the change. */
const RECOVERY_FLAG = "medicReactionRecovery";
const recoveryPath = castId => `flags.ak5e.${RECOVERY_FLAG}.${castId}`;
const reactionNotice = (level, text) => {
  console.warn("AK5e | Arts Reaction", text);
  try { ui.notifications?.[level]?.(text); } catch { /* Notifications are optional. */ }
};
async function markRecovery(actor, castId, patch) {
  try { await actor.update({ [recoveryPath(castId)]: patch }); return true; }
  catch (error) { console.warn("AK5e | Arts Reaction recovery record could not be updated", error); return false; }
}

/** Spend a Reaction cast's Reaction after the native use committed, and fold the resulting
 * `flags.ak5e.reactionBudget` change into the cast receipt so the same undo restores it. Warnings are
 * kept on the receipt and shown on the public card; a missing Reaction never blocks the cast. */
async function finalizeArtCastContext(activity, session, context, result) {
  const receipt = session.receipt;
  if (!receipt || context?.castingTime !== "reaction") return;
  const actor = activity.actor;
  const spentBefore = getReactions(actor).spent;
  const before = structuredClone(actor.getFlag("ak5e", "reactionBudget") ?? null);
  // 1. Persist the recovery intent first. If it cannot be stored, a spend could become unexplained, so
  //    the Reaction is not spent; the committed cast stays and the table is told to spend it by hand.
  const intent = { status: "pending", receiptId: receipt.id, castId: receipt.id, reactionPool: null,
    triggerId: context.triggerEventId ?? `art-cast:${receipt.id}`, spentBefore, at: Date.now() };
  let began = { warnings: [], reaction: null };
  let spendAttempted = true;
  try { await actor.update({ [recoveryPath(receipt.id)]: intent }); }
  catch (error) {
    spendAttempted = false;
    console.warn("AK5e | Arts Reaction recovery record could not be saved", error);
    began.warnings.push({ id: "reaction", text: "The Reaction was not spent: its recovery record could not be saved. The cast stands; spend the Reaction manually." });
    reactionNotice("warn", began.warnings[0].text);
  }
  if (spendAttempted) {
    try {
      began = await beginArtCastContext(actor, { ...context, triggerEventId: intent.triggerId, reactionReceiptId: receipt.id }, artCastTargetUuids());
    } catch (error) {
      console.warn("AK5e | Arts Reaction spend failed", error);
      began = { warnings: [{ id: "reaction", text: `The Reaction could not be spent: ${error.message ?? error}` }], reaction: null };
    }
  }
  const warnings = [...new Set([...(receipt.warnings ?? []), ...(began.warnings ?? []).map(warning => warning.text)])];
  const after = structuredClone(actor.getFlag("ak5e", "reactionBudget") ?? null);
  const changes = [...(receipt.changes ?? [])];
  const spent = JSON.stringify(before) !== JSON.stringify(after);
  if (spent) changes.push({ path: `flags.ak5e.${REACTION_FLAG}`, before, after, beforeMissing: before === null, afterMissing: after === null });
  const pool = began.reaction?.pool ?? "base";
  const persistReceipt = async () => {
    const ledger = actor.getFlag("ak5e", "artReceipts") ?? [];
    await actor.update({ "flags.ak5e.artReceipts": ledger.map(entry => entry.id === receipt.id ? { ...entry, warnings, changes } : entry) });
  };
  // 2. The Actor receipt is the durable record. Only its failure is a recovery matter.
  let receipted = false;
  try { await persistReceipt(); receipted = true; }
  catch (error) {
    console.warn("AK5e | Arts cast context could not be recorded", error);
    try { await persistReceipt(); receipted = true; } catch { /* Fall through to compensation below. */ }
  }
  if (!receipted && spent) {
    // The spend has no receipt, so cast undo could never restore it. Refund exactly this spend, and
    // say so publicly; never discard the committed cast. If the refund fails too, the persisted
    // recovery record (bound to this cast) is the durable explanation and the table is told.
    let refunded = false;
    try { refunded = (await refundReaction(actor, { receipt: receipt.id, clearTrigger: true }))?.ok === true; }
    catch (refundError) { console.warn("AK5e | Arts Reaction compensation failed", refundError); }
    const status = refunded ? "refunded" : "unreceipted";
    const marked = await markRecovery(actor, receipt.id, { ...intent, reactionPool: pool, status });
    // `marked` is false when the status write failed: the original pending recovery intent then remains
    // the only record, and the table must be told it still reads "pending".
    const retained = marked ? "" : " The recovery status could not be updated; the original pending recovery record for this cast remains and must be reconciled manually.";
    if (refunded) {
      reactionNotice("warn", "The Reaction spend could not be recorded on the cast receipt, so the Reaction was refunded. The cast itself remains committed." + retained);
    } else {
      reactionNotice("error", "A Reaction was spent but its cast receipt could not be updated and the spend could not be refunded." +
        (marked ? " It is recorded as unreceipted for manual correction; do not treat it as refunded." : retained + " Do not treat it as refunded."));
    }
  } else if (spent || spendAttempted) {
    // Receipt holds the change (or nothing was spent): the recovery record has served its purpose.
    try { await actor.update({ [`flags.ak5e.${RECOVERY_FLAG}.-=${receipt.id}`]: null }); }
    catch {
      // The receipt holds the spend, so undo works; only the housekeeping record could not be cleared.
      await markRecovery(actor, receipt.id, { ...intent, reactionPool: pool, status: "receipted" });
    }
  }
  // 3. The chat card is display only. Its failure must never refund a spend the Actor receipt holds.
  const message = result?.message;
  if (receipted && message?.update) {
    try {
      await message.update({ "flags.ak5e.castId": receipt.id,
        "flags.ak5e.artCast.warnings": warnings, "flags.ak5e.artCast.changes": changes });
    } catch (error) {
      reactionNotice("warn", `The cast card could not be updated with the Reaction record (${error?.message ?? error}); the cast receipt is saved and undo still works.`);
    }
  }
  session.receipt = { ...receipt, warnings, changes: receipted ? changes : receipt.changes };
}

/** Wrap only the native activity mixin use boundary: ensures finally cleanup on errors.
 * Rules and document changes still run in D&D5e's supported configuration/consumption hooks.
 * Each actor has at most one pending cast on this client; cross-client ownership is documented.
 */
export function wrapActivityUse(prototype) {
  if (patched.has(prototype)) return;
  patched.add(prototype);
  const original = prototype.use;
  prototype.use = async function(usage = {}, dialog = {}, message = {}) {
    if (!isArt(this)) return original.call(this, usage, dialog, message);
    own(this.actor);
    if (busy.has(this.actor.uuid)) { ui.notifications.warn("Finish the current Arts operation for this actor first."); return; }
    const id = foundry.utils.randomID();
    const session = { actor: this.actor, baseLevel: this.item.system.level, committed: false };
    sessions.set(id, session);
    busy.add(this.actor.uuid);
    try {
      // Combined modifiers need an explicit per-use cost-order reading (no silent default, no GM block).
      // If the quote throws PlayReading, ask the player now and carry the pick as ak5eCostOrder.
      const useConfig = { ...usage, ak5eCastId: id, subsequentActions: false };
      try { casterLimitReview(this, useConfig, session); }
      catch (probe) {
        const { isPlayReading } = await import("./play-undo.mjs");
        if (isPlayReading(probe) && probe.key === "costOrder") {
          const picked = await dialogPage("No GM ruling — cost order", `<p>${probe.label}: the GM has not ruled on this. Choose a reading for this use only. It is shown on the chat card and is not saved as a ruling.</p><fieldset>${probe.options.map((o, i) => `<label><input type="radio" name="costOrder" value="${o.value}"${i === 0 ? " checked" : ""}> ${o.label}</label>`).join("")}</fieldset>`, [
            { action: "read", label: "Use this reading", default: true, callback: (_e, btn) => btn.form?.elements?.costOrder?.value ?? null },
            { action: "cancel", label: "Cancel", callback: () => null }
          ]);
          if (!picked) { sessions.delete(id); busy.delete(this.actor.uuid); return null; }
          useConfig.ak5eCostOrder = picked;
          // Re-probe after the named reading rather than assuming the quote now succeeds.
          casterLimitReview(this, useConfig, session);
        } else throw probe;
      }
      const result = await casterStateSerial(this.actor, () => original.call(this, useConfig, { ...dialog, configure: true }, message));
      // A stale approved payload is refused visibly; the refused session proposed no updates.
      if (!result && session.refusal) throw session.refusal;
      if (session.receipt) {
        await completeCasterConsumption(this.actor, session.receipt);
        if (result) await completeCasterUse(this.actor, session.receipt);
        else await markCasterCastFailure(this.actor, session.receipt);
        // A Reaction is spent only after the native use has actually committed (never on cancel).
        if (result) await finalizeArtCastContext(this, session, artCastContextFor(this, useConfig), result);
      }
      return result;
    } catch (error) {
      if (session.receipt) {
        try { await completeCasterConsumption(this.actor, session.receipt); } catch { /* Retain the original failure and consumed receipt. */ }
        await markCasterCastFailure(this.actor, session.receipt, error);
      }
      // Native use may have completed consumption before concentration/chat fails. Keep the receipt
      // for explicit undo; automatic refunds here would risk making an already-resolved cast free.
      if (session.receipt && this.actor.getFlag("ak5e", "lastArtCast")?.id === id) {
        ui.notifications.error("The cast encountered an error after resource consumption. Review the cast and use Arts → Undo last cast if needed.");
      }
      throw error;
    } finally { sessions.delete(id); busy.delete(this.actor.uuid); }
  };
  const refund = prototype.refund;
  if (refund) prototype.refund = async function(consumed) {
    if (isArt(this) && (consumed?.actor ?? []).some(delta => delta.keyPath?.startsWith("flags.ak5e."))) {
      ui.notifications.warn("Use Arts → Undo last cast to restore AP and the 9th-level limit together.");
      return;
    }
    return refund.call(this, consumed);
  };
}

function refreshArtCastCards(actor = null) {
  if (typeof ui === "undefined" || !ui.chat?.updateMessage) return;
  for (const message of list(game.messages)) {
    const card = message?.flags?.ak5e?.artCast;
    if (!card?.id || !card.actorUuid || (actor && card.actorUuid !== actor.uuid)) continue;
    const owner = actor ?? actorByUuid(card.actorUuid);
    if (!owner || !artReceipts(owner).some(entry => entry.id === card.id)) continue;
    safely(ui.chat.updateMessage(message));
  }
}

export function registerArtsHooks() {
  if (installed) return;
  installed = true;
  const types = Object.values(CONFIG.DND5E?.activityTypes ?? {});
  for (const type of types) {
    for (let prototype = type.documentClass?.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
      if (Object.hasOwn(prototype, "use") && Object.hasOwn(prototype, "consume") && Object.hasOwn(prototype, "_prepareUsageConfig")) {
        wrapActivityUse(prototype); available = true; break;
      }
    }
  }
  Hooks.on("dnd5e.preUseActivity", prepareArtUse);
  Hooks.on("dnd5e.activityConsumption", consumeArt);
  Hooks.on("dnd5e.preRestCompleted", completeArtsRest);
  Hooks.on("renderChatMessageHTML", (message, html) => safely(renderArtReceiptControls(message, html)));
  Hooks.on("dnd5e.renderChatMessage", (message, html) => safely(renderArtReceiptControls(message, html)));
  // A cast card renders before its ledger receipt is saved (and pre-ready cards before these hooks exist), so
  // refresh an Actor's current cast cards whenever its receipts change, and once now for the loaded log.
  Hooks.on("updateActor", (actor, changes) => {
    if (Object.hasOwn(changes?.flags?.ak5e ?? {}, "artReceipts") || Object.hasOwn(changes ?? {}, "flags.ak5e.artReceipts")) refreshArtCastCards(actor);
  });
  refreshArtCastCards();
  for (const hook of ["dnd5e.preShortRest", "dnd5e.preLongRest"]) Hooks.on(hook, actor => {
    if (isArtsActor(actor) && busy.has(actor.uuid)) { ui.notifications.warn("Finish the current Arts operation before resting."); return false; }
  });
  Hooks.on("preCreateItem", item => {
    if (item.type !== "spell" || !isArtsActor(item.parent) || !item.parent.isOwner || flags(item).enabled === false) return;
    const data = adoptedSpellData(item);
    delete data._id;
    data["system.ability"] = item.system.ability || artsState(item.parent).ability;
    item.updateSource(data);
  });
  registerArtsSheetHooks();
}

async function dialogPage(title, content, buttons) {
  let closed;
  const result = await foundry.applications.api.DialogV2.wait({ window: { title }, content: `<div class="ak5e-arts-dialog">${content}</div>`, buttons, rejectClose: false,
    render: (_event, dialog) => { closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true })); } });
  if (closed) await closed;
  return result;
}

function input(name, value, attributes = "") {
  return '<input name="' + name + '" value="' + escape(value) + '" ' + attributes + '>';
}
function field(key, control) { return '<label>' + escape(artsText(key)) + control + '</label>'; }
function select(name, current, options) {
  return '<select name="' + name + '">' + options.map(([value, label]) => '<option value="' + escape(value) + '"' +
    (value === current ? ' selected' : '') + '>' + escape(label) + '</option>').join("") + '</select>';
}
function check(name, value) { return input(name, "on", 'type="checkbox"' + (value ? ' checked' : '')); }

export async function openActorArts(actor) {
  own(actor); idle(actor);
  return openArtsSetup(actor, { adopt: !isArtsActor(actor) || actor.getFlag("ak5e", "artsSetup")?.status === "pending" });
}

export async function openArtsSetup(actor, { adopt = true } = {}) {
  own(actor); idle(actor);
  if (!available) throw new Error(artsText("Unsupported"));
  const state = artsState(actor);
  const initial = !state.enabled || actor.getFlag("ak5e", "artsSetup")?.status === "pending";
  const units = list(actor.items).filter(item => ["weapon", "equipment", "tool"].includes(item.type));
  const receipt = actor.getFlag("ak5e", "lastArtCast");
  const hasUndoableCast = (game.user.isGM || actor.isOwner) && artReceipts(actor).some(entry => entry.status === "available" && receiptWindowCurrent(actor, entry));
  const content = '<p>' + escape(artsText("ConfigurationHint")) + '</p>' +
    field("Ability", select("ability", state.ability, ["int", "wis", "cha"].map(key => [key, CONFIG.DND5E.abilities?.[key]?.label ?? key]))) +
    '<p>' + escape(artsText("AbilityHint")) + '</p>' +
    field("MaximumAP", input("maximum", state.maximum, 'type="number" min="0" step="1" required')) +
    (initial ? field("CurrentAP", input("value", state.value, 'type="number" min="0" step="1" required')) : '') +
    field("MaximumArtLevel", input("maximumArtLevel", state.maximumArtLevel, 'type="number" min="0" max="9" step="1" required')) +
    field("RecoveryLabel", select("recovery", state.recovery, ["long", "short", "manual"].map(key => [key, artsText("Recovery." + key)]))) +
    field("CastingUnit", select("castingUnit", state.castingUnit, [["", artsText("None")], ...units.map(item => [item.id, item.name])])) +
    '<p>' + escape(artsText("UnitHint")) + '</p>' +
    (!initial ? '<details><summary>' + escape(artsText("Advanced")) + '</summary>' +
      field("Adjustment", input("adjustment", 0, 'type="number" step="1"')) +
      field("Overflow", check("overflow", false)) +
      (receipt ? '<p>' + escape(artsText("LastCast", receipt)) + '</p>' : '') + '</details>' : '');
  const collect = button => ({ kind: "save", values: Object.fromEntries(new FormData(button.form)) });
  const action = await dialogPage(artsText(initial ? "Setup" : "Settings"), content, [
    { action: "save", label: artsText(initial || adopt ? "Review" : "SaveConfiguration"), default: true, callback: (_event, button) => ({ ...collect(button), adopt: initial || adopt }) },
    ...(!initial ? [
      { action: "adopt", label: artsText("Adopt"), callback: (_event, button) => ({ ...collect(button), adopt: true }) },
      { action: "adjust", label: artsText("Adjust"), callback: (_event, button) => ({
        kind: "adjust", amount: button.form.elements.adjustment.value, overflow: button.form.elements.overflow.checked
      }) },
      ...(game.user.isGM ? [
        { action: "rules", label: artsText("CastingRules"), callback: () => ({ kind: "rules" }) }
      ] : []),
      ...(hasUndoableCast ? [{ action: "undo", label: "Undo a recent use", callback: () => ({ kind: "undo" }) }] : [])
    ] : []),
    { action: "cancel", label: artsText("Cancel") }
  ]);
  if (action?.kind === "adjust") return adjustActorArts(actor, action.amount, { overflow: action.overflow });
  if (action?.kind === "rules") return openArtRules(actor);
  if (action?.kind === "undo") return undoLastArt(actor);
  if (action?.kind !== "save") return;
  // Read current counters at Apply time; settings do not restore a stale form snapshot.
  const options = { ...action.values, adopt: action.adopt };
  if (!initial) delete options.value;
  const plan = previewActorArts(actor, options);
  if (!action.adopt) return configureActorArts(actor, options);
  const confirmed = await dialogPage(artsText("Review"), '<p>' +
    escape(artsText("ReviewSummary", { ...options, value: plan.actor["flags.ak5e.artsPoints"].value })) + '</p><p>' +
    escape(artsText("AdoptionHint", { count: plan.items.length })) + '</p><ul>' +
    plan.names.map(name => '<li>' + escape(name) + '</li>').join("") + '</ul>', [
    { action: "apply", label: artsText("Apply"), callback: () => true },
    { action: "cancel", label: artsText("Cancel"), default: true }
  ]);
  if (confirmed === true) {
    if (!initial) delete options.value;
    return configureActorArts(actor, options);
  }
}

export async function openArtRules(actor, itemId) {
  own(actor); idle(actor);
  if (!game.user.isGM) throw new Error(artsText("GMOnly"));
  const items = list(actor.items).filter(item => item.type === "spell");
  if (!items.length) throw new Error(artsText("AddFirst"));
  const id = itemId ?? await dialogPage(artsText("ChooseArt"), field("Art", select("item", "", items.map(item => [item.id, item.name]))), [
    { action: "choose", label: artsText("Settings"), default: true, callback: (_event, button) => button.form.elements.item.value },
    { action: "cancel", label: artsText("Cancel") }
  ]);
  const item = actor.items.get(id);
  if (!item || item.type !== "spell") return;
  const grant = flags(item);
  const content = field("Source", input("source", grant.source)) +
    field("Enabled", check("enabled", grant.enabled !== false)) +
    field("NoUnit", check("noCastingUnit", grant.noCastingUnit)) +
    field("Ritual", check("ritual", grant.ritual)) +
    field("OnlyFreeLabel", check("onlyFree", grant.onlyFree)) +
    field("Reduction", input("reduction", grant.reduction ?? 0, 'type="number" min="0" max="9" step="1"')) +
    field("MinimumCost", input("minimumCost", grant.minimumCost ?? 0, 'type="number" min="0" max="9" step="1"')) +
    field("FreeMaximum", input("freeMaximum", grant.free ? grant.free.maximum ?? 0 : "", 'type="number" min="0" step="1"')) +
    field("FreeLevel", input("freeLevel", grant.free?.level ?? item.system.level, 'type="number" min="' + item.system.level + '" max="9" step="1"')) +
    field("FreeRecovery", select("freeRecovery", grant.free?.recovery ?? "long", ["long", "short", "manual"].map(key => [key, artsText("Recovery." + key)]))) +
    field("BlockReason", input("blocked", grant.blocked)) + '<p>' + escape(artsText("ExceptionHint")) + '</p>';
  const value = await dialogPage(artsText("RulesTitle", { name: item.name }), content, [
    { action: "apply", label: artsText("SaveRules"), callback: (_event, button) => {
      const form = button.form.elements;
      return { source: form.source.value, enabled: form.enabled.checked,
        noCastingUnit: form.noCastingUnit.checked, ritual: form.ritual.checked,
        onlyFree: form.onlyFree.checked, reduction: form.reduction.value, minimumCost: form.minimumCost.value, blocked: form.blocked.value,
        free: form.freeMaximum.value === "" ? null : { maximum: Number(form.freeMaximum.value) === 0 ? null : form.freeMaximum.value, level: form.freeLevel.value, recovery: form.freeRecovery.value } };
    } },
    { action: "cancel", label: artsText("Cancel"), default: true }
  ]);
  if (value && typeof value === "object") return configureArt(item, value);
}
