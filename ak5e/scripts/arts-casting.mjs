import { ARTS_METHOD, ArtsRuleError, adoptedSpellData, artsChoices, artsState, castingConfig, integer, quoteArt, recoveryValue, restArtsUpdates } from "./arts-rules.mjs";
import { worldRulesEnabled } from "./world-rule-state.mjs";
import { registerArtsSheetHooks } from "./arts-sheet.mjs";
export { renderArtsControls } from "./arts-sheet.mjs";

const sessions = new Map();
const busy = new Set();
const patched = new WeakSet();
let installed = false;
let available = false;
const flags = document => document?.getFlag?.("ak5e", "art") ?? {};
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notice = error => { console.error("AK5e | Arts", error); ui.notifications.error(error.message ?? String(error)); };
const safely = promise => Promise.resolve(promise).catch(notice);
export const artsText = (key, data) => data === undefined ? game.i18n.localize(`AK5E.Arts.${key}`) : game.i18n.format(`AK5E.Arts.${key}`, data);
export const artsErrorText = error => error?.key ? artsText(error.key, error.data) : error?.message ?? String(error);

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

export function grantFor(item, actor = item.actor) {
  const grant = flags(item);
  return { ...grant, free: grant.free ? { ...grant.free, spent: actor?.getFlag("ak5e", "artFreeUses")?.[item.id] ?? 0 } : undefined };
}

function checkFocus(actor, item) {
  if (actor.statuses?.has("ak5e-silenced")) throw new ArtsRuleError("Silenced", "Silenced creatures cannot cast Arts.");
  if (worldRulesEnabled() && !artsState(actor).configured) {
    throw new ArtsRuleError("UnconfiguredAP", "The GM must set Arts Points and a maximum Art level before this creature can cast.");
  }
  if (flags(item).noCastingUnit === true || actor.getFlag?.("ak5e", "oripathy")?.infected === true) return;
  const focusId = artsState(actor).castingUnit;
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
  return artsChoices(artsState(actor), item.system.level, grantFor(item, actor), { ...selection, blocker });
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

/** Guarded undo: only the most recent cast, before intervening resource edits/rests. */
export async function undoLastArt(actor) {
  own(actor); idle(actor);
  if (!game.user.isGM) throw new Error("Only the GM can undo a cast.");
  const receipt = actor.getFlag("ak5e", "lastArtCast");
  if (!receipt) throw new Error("There is no cast to undo.");
  const state = artsState(actor);
  if (state.value !== receipt.after || state.ninthLevelCast !== receipt.ninthAfter) throw new Error("Arts resources changed after this cast; adjust them manually.");
  const item = receipt.freeSpent === null ? null : actor.items.get(receipt.itemId);
  if (receipt.freeSpent !== null && (!item || actor.getFlag("ak5e", "artFreeUses")?.[item.id] !== receipt.freeSpent + 1)) {
    throw new Error("Free uses changed after this cast; adjust them manually.");
  }
  busy.add(actor.uuid);
  try {
    await actor.update({ "flags.ak5e.artsPoints.value": receipt.before,
      "flags.ak5e.artsPoints.ninthLevelCast": receipt.ninthBefore, "flags.ak5e.lastArtCast": null,
      ...(item ? { [`flags.ak5e.artFreeUses.${item.id}`]: receipt.freeSpent } : {}) });
    ui.notifications.info("Arts resources restored. Remove any resulting effects or chat cards separately.");
  } finally { busy.delete(actor.uuid); }
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
  usage.hasConsumption = true;
  dialog.configure = true;
  dialog.applicationClass = artsDialogClass(dialog.applicationClass);
  message.hasConsumption = true;
  session.activity = activity;
}

export function consumeArt(activity, usage, message, updates) {
  if (!isArt(activity)) return;
  try {
    const session = sessions.get(usage.ak5eCastId);
    if (!session || session.committed) throw new Error("This cast has already been processed or is no longer active.");
    own(activity.actor); checkFocus(activity.actor, activity.item);
    const state = artsState(activity.actor);
    const quote = quoteArt(state, session.baseLevel, usage.ak5eLevel, grantFor(activity.item), { mode: usage.ak5eMode });
    const freeSpent = quote.mode === "free" && quote.freeRemaining !== null
      ? (activity.actor.getFlag("ak5e", "artFreeUses")?.[activity.item.id] ?? 0) : null;
    const receipt = {
      id: usage.ak5eCastId, itemId: activity.item.id, name: activity.item.name,
      level: quote.level, cost: quote.cost, mode: quote.mode,
      before: state.value, after: state.value - quote.cost,
      ninthBefore: state.ninthLevelCast, ninthAfter: quote.ninthLevelCast, freeSpent
    };
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
    message.data ??= {};
    message.data.flags ??= {};
    message.data.flags.ak5e = { ...message.data.flags.ak5e, artCast: receipt };
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

const dialogClasses = new WeakMap();
export function artsDialogClass(Base) {
  if (dialogClasses.has(Base)) return dialogClasses.get(Base);
  class ArtsUsageDialog extends Base {
    async _prepareScalingContext(context) {
      const state = artsState(this.actor);
      const grant = grantFor(this.item);
      const choices = artAvailability(this.actor, this.item, { mode: this.config.ak5eMode, level: this.config.ak5eLevel });
      this.config.ak5eMode = choices.mode;
      this.config.ak5eLevel = choices.level;
      const modes = choices.modes.map(m => ({ value: m.value, label: artsText(`Mode.${m.value}`) }));
      const options = choices.quotes.map(q => ({ value: String(q.level), label: artsText(q.level === 0 ? "CantripCost" : "LevelCost", q) }));
      return { ...context, hasScaling: true, spellSlots: null, scaling: null,
        ak5eArts: { modes, mode: choices.mode, options, level: String(choices.level),
          modeLabel: artsText(`Mode.${choices.mode}`), levelLabel: options.find(o => Number(o.value) === choices.level)?.label,
          chooseMode: modes.length > 1, chooseLevel: options.length > 1,
          cost: choices.quote?.cost, remaining: choices.quote ? state.value - choices.quote.cost : null,
          value: state.value, maximum: state.maximum, source: grant.source ?? "",
          ritual: choices.mode === "ritual", unavailable: !choices.quote,
          reason: choices.error ? artsErrorText(choices.error) : "" } };
    }

    async _prepareSubmitData(event, formData) {
      const data = await super._prepareSubmitData(event, formData);
      const base = sessions.get(this.config.ak5eCastId)?.baseLevel ?? this.item.system.level;
      const selected = { mode: data.ak5eMode ?? this.config.ak5eMode, level: data.ak5eLevel ?? this.config.ak5eLevel };
      // Native change events recalculate choices. Confirmation retains the requested cast:
      // consumption must reject a stale selection rather than silently cast at a lower level.
      const choices = event?.type === "click"
        ? { mode: selected.mode, level: integer(selected.level, "Cast level", base, 9) }
        : artAvailability(this.actor, this.item, selected);
      data.ak5eLevel = choices.level;
      data.ak5eMode = choices.mode;
      data.scaling = choices.level - base;
      // Parent usage scaling must receive a level delta, never a fabricated slot.
      delete data.spell;
      data.consume = { ...(data.consume ?? this.config.consume ?? {}), spellSlot: false };
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
      const choices = artAvailability(this.actor, this.item, { mode: this.config.ak5eMode, level: this.config.ak5eLevel });
      for (const button of result.buttons ?? []) if (button.action === "use") {
        button.label = artsText("Cast");
        button.disabled = !choices.quote;
      }
      return result;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      const choices = artAvailability(this.actor, this.item, { mode: this.config.ak5eMode, level: this.config.ak5eLevel });
      const button = this.element.querySelector('[data-action="use"]');
      if (button) button.disabled = !choices.quote;
    }

    static PARTS = { ...Base.PARTS, scaling: { template: "modules/ak5e/templates/arts-usage.hbs" } };
  }
  dialogClasses.set(Base, ArtsUsageDialog);
  return ArtsUsageDialog;
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
      return await original.call(this, { ...usage, ak5eCastId: id }, dialog, message);
    } catch (error) {
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
        { action: "rules", label: artsText("CastingRules"), callback: () => ({ kind: "rules" }) },
        ...(receipt ? [{ action: "undo", label: artsText("Undo"), callback: () => ({ kind: "undo" }) }] : [])
      ] : [])
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
