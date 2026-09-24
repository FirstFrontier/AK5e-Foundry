import { ARTS_METHOD, adoptedSpellData, artsState, castingConfig, integer, quoteArt, recoveryValue, restArtsUpdates } from "./arts-rules.mjs";

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

export function registerArtsConfig() {
  if (!CONFIG.DND5E) return;
  // D&D5e creates spellcasting models at i18nInit. This method intentionally has no slots.
  CONFIG.DND5E.spellcasting ??= {};
  CONFIG.DND5E.spellcasting[ARTS_METHOD] = { label: "AK5e Arts", order: 30 };
}

export function isArtsActor(actor) {
  return actor?.getFlag?.("ak5e", "casting")?.enabled === true;
}

export function hasArtsContent(actor) {
  return isArtsActor(actor) || list(actor?.items).some(item =>
    item?.getFlag?.("ak5e", "chapterFiveId") || item?.getFlag?.("ak5e", "chapterThreeId") ||
    item?.flags?.ak5e?.chapterFiveId || item?.flags?.ak5e?.chapterThreeId);
}

export function isArt(activity) {
  return activity?.item?.type === "spell" && isArtsActor(activity.actor) && flags(activity.item).enabled !== false;
}

function own(actor) {
  if (actor?.documentName !== "Actor" || !actor.isOwner) throw new Error("Choose an actor you own.");
  if (actor.pack) throw new Error("Import this actor into the World before configuring Arts.");
}

function idle(actor) {
  if (busy.has(actor.uuid)) throw new Error("Finish the current Arts operation for this actor first.");
}

function grantFor(item) {
  const grant = flags(item);
  return { ...grant, free: grant.free ? { ...grant.free, spent: item.actor?.getFlag("ak5e", "artFreeUses")?.[item.id] ?? 0 } : undefined };
}

function checkFocus(actor, item) {
  if (actor.statuses?.has("ak5e-silenced")) throw new Error("Silenced creatures cannot cast Arts.");
  if (flags(item).noCastingUnit === true) return;
  const focusId = artsState(actor).castingUnit;
  const focus = actor.items.get(focusId);
  if (!focus || focus.system.equipped !== true) throw new Error("Equip the Casting Unit selected in Arts setup, or configure this Art's source-defined exception.");
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
  const items = list(actor.items).filter(item => item.type === "spell" && flags(item).enabled !== false);
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
  if (!available) throw new Error("Arts integration requires the supported D&D5e activity API (tested with 5.3.3).");
  const plan = previewActorArts(actor, options);
  busy.add(actor.uuid);
  try {
    // Preserve a recovery record before a multi-document adoption. Retrying is idempotent.
    await actor.update({ "flags.ak5e.artsSetup": { status: "pending", itemIds: plan.items.map(i => i._id) } });
    if (plan.items.length) await actor.updateEmbeddedDocuments("Item", plan.items);
    await actor.update({ ...plan.actor, "flags.ak5e.artsSetup.status": "complete" });
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
  try { own(activity.actor); checkFocus(activity.actor, activity.item); }
  catch (error) { ui.notifications.warn(error.message); return false; }
  usage.consume = { ...(typeof usage.consume === "object" ? usage.consume : {}), spellSlot: false };
  // Do not let a stale D&D5e slot name replace our numeric scaling later.
  delete usage.spell;
  usage.scaling = 0;
  usage.ak5eLevel ??= activity.item.system.level;
  usage.ak5eMode ??= "ap";
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
  } catch (error) { ui.notifications.warn(error.message); return false; }
}

export function completeArtsRest(actor, result, config) {
  if (!isArtsActor(actor)) return;
  if (busy.has(actor.uuid)) { ui.notifications.warn("Finish the current Arts operation before resting."); return false; }
  const type = config.type ?? result.type;
  const updates = restArtsUpdates(actor, type);
  if (!["short", "long"].includes(type)) return;
  result.updateData ??= {};
  Object.assign(result.updateData, updates, { "flags.ak5e.lastArtCast": null });
  for (const item of list(actor.items)) {
    const free = flags(item).free;
    if (!free || free.recovery === "manual" || (type !== "long" && free.recovery !== "short")) continue;
    result.updateData[`flags.ak5e.artFreeUses.${item.id}`] = 0;
  }
}

const dialogClasses = new WeakMap();
export function artsDialogClass(Base) {
  if (dialogClasses.has(Base)) return dialogClasses.get(Base);
  class ArtsUsageDialog extends Base {
    async _prepareScalingContext(context) {
      const state = artsState(this.actor);
      const base = sessions.get(this.config.ak5eCastId)?.baseLevel ?? this.item.system.level;
      const grant = grantFor(this.item);
      const mode = this.config.ak5eMode ?? "ap";
      const modes = [{ value: "ap", label: "Arts Points" }];
      if (grant.free) modes.push({ value: "free", label: "Free cast — source grant" });
      if (grant.ritual) modes.push({ value: "ritual", label: "Ritual — base level, +10 minutes" });
      const options = [];
      for (let level = base; level <= (base === 0 ? 0 : 9); level++) {
        try {
          const quote = quoteArt(state, base, level, grant, { mode });
          options.push({ value: String(level), label: `${level === 0 ? "Cantrip" : `Level ${level}`} — ${quote.cost} AP` });
        } catch { /* Invalid levels are shown through the no-legal-cast notice. */ }
      }
      return { ...context, hasScaling: true, spellSlots: null, scaling: null,
        ak5eArts: { modes, mode, options, level: String(this.config.ak5eLevel ?? base),
          value: state.value, maximum: state.maximum, source: grant.source ?? "",
          unavailable: !options.length } };
    }

    async _prepareSubmitData(event, formData) {
      const data = await super._prepareSubmitData(event, formData);
      const base = sessions.get(this.config.ak5eCastId)?.baseLevel ?? this.item.system.level;
      const level = Number(data.ak5eLevel ?? base);
      const mode = data.ak5eMode ?? "ap";
      data.ak5eLevel = level;
      data.ak5eMode = mode;
      data.scaling = level - base;
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
      for (const button of result.buttons ?? []) if (button.action === "use") button.label = "Cast Art";
      return result;
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
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = sheetActor(app);
    if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !actor?.isOwner ||
        !hasArtsContent(actor) || controls.some(c => c.action === "ak5eArts")) return;
    controls.unshift({ action: "ak5eArts", icon: "fa-solid fa-wand-magic-sparkles", label: "AK5e Arts", ownership: "OWNER", onClick: () => safely(openActorArts(actor)) });
  });
  Hooks.on("renderActorSheetV2", renderArtsControls);
}

function sheetActor(app) {
  const actor = app?.document?.documentName === "Actor" ? app.document : null;
  return ["character", "npc"].includes(actor?.type) ? actor : null;
}

export function renderArtsControls(app, element) {
  const actor = sheetActor(app);
  if (!actor || !element?.querySelector) return;
  const relevant = hasArtsContent(actor);
  const state = artsState(actor);
  // The spells part may render without the header (including an empty spell list).
  const spells = element.matches?.('.tab[data-tab="spells"]') ? element
    : element.querySelector('.tab[data-tab="spells"]');
  element.classList.toggle("ak5e-arts-enabled", relevant && state.enabled);
  for (const control of element.querySelectorAll(".ak5e-arts-controls")) control.remove();
  if (!relevant || !spells || (!state.enabled && !actor.isOwner)) return;
  const div = document.createElement("div");
  div.className = "ak5e-arts-controls";
  const summary = document.createElement("span");
  summary.textContent = state.enabled
    ? `Arts Points: ${state.value} / ${state.maximum} · Maximum Art level: ${state.maximumArtLevel}`
    : "Arts Points have not been configured. Set up Arts using your class or branch values.";
  div.append(summary);
  if (actor.isOwner) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gold-button";
    button.textContent = state.enabled ? "Manage Arts Points" : "Set up AK5e Arts";
    button.addEventListener("click", event => { event.preventDefault(); safely(openActorArts(actor)); });
    div.append(button);
  }
  if (state.enabled && state.maximumArtLevel === 9) {
    const span = document.createElement("span");
    span.textContent = state.ninthLevelCast ? "9th-level Art used" : "9th-level Art available";
    div.append(span);
  }
  spells.prepend(div);
}

async function dialogPage(title, content, buttons) {
  return foundry.applications.api.DialogV2.wait({ window: { title }, content: `<div class="ak5e-arts-dialog">${content}</div>`, buttons, rejectClose: false });
}

export async function openActorArts(actor) {
  own(actor); idle(actor);
  if (!available) throw new Error("Arts casting could not find the supported D&D5e activity API. Use D&D5e 5.3.3.");
  const state = artsState(actor);
  if (!state.enabled || actor.getFlag("ak5e", "artsSetup")?.status === "pending") return openArtsSetup(actor);
  const receipt = actor.getFlag("ak5e", "lastArtCast");
  const content = `<p><strong>${escape(actor.name)}</strong>: ${state.value}/${state.maximum} AP. Maximum Art level ${state.maximumArtLevel}.</p>
    <p>${state.ninthLevelCast ? "9th-level Art used since the last Long Rest." : "No 9th-level Art used since the last Long Rest."}</p>
    <p>Recovery: ${escape(state.recovery)} rest. Cast Arts from the sheet's spell list.</p>
    <label>AP adjustment<input name="adjustment" type="number" step="1" value="0"></label>
    <label><input name="overflow" type="checkbox"> Allow temporary AP above maximum (source feature required)</label>
    ${receipt ? `<p>Last cast: ${escape(receipt.name)}, level ${receipt.level}, ${receipt.cost} AP.</p>` : ""}`;
  const action = await dialogPage("AK5e Arts", content, [
    { action: "adjust", label: "Adjust AP", callback: (_event, button) => ({ kind: "adjust", amount: button.form.elements.adjustment.value, overflow: button.form.elements.overflow.checked }) },
    { action: "setup", label: "Configure / adopt spells", callback: () => ({ kind: "setup" }) },
    ...(game.user.isGM ? [{ action: "rules", label: "Art grants / exceptions", callback: () => ({ kind: "rules" }) },
      ...(receipt ? [{ action: "undo", label: "Undo last cast", callback: () => ({ kind: "undo" }) }] : [])] : []),
    { action: "close", label: "Close", default: true }
  ]);
  if (action?.kind === "adjust") await adjustActorArts(actor, action.amount, { overflow: action.overflow });
  if (action?.kind === "setup") await openArtsSetup(actor);
  if (action?.kind === "undo") await undoLastArt(actor);
  if (action?.kind === "rules") await openArtRules(actor);
}

export async function openArtsSetup(actor) {
  own(actor); idle(actor);
  const state = artsState(actor);
  const options = list(actor.items).filter(item => ["weapon", "equipment", "tool"].includes(item.type));
  const selected = (value, current) => value === current ? " selected" : "";
  const content = `<p>Configure values from your AK5e class/branch or NPC stat block. Changing configuration does not refill AP or clear the 9th-level limit.</p>
    <label>Casting ability<select name="ability">${["int", "wis", "cha"].map(key => `<option value="${key}"${selected(key, state.ability)}>${escape(CONFIG.DND5E.abilities?.[key]?.label ?? key)}</option>`).join("")}</select></label>
    <label>Maximum AP<input name="maximum" type="number" min="0" step="1" value="${state.maximum}"></label>
    <label>Current AP<input name="value" type="number" min="0" step="1" value="${state.value}"></label>
    <label>Maximum Art level<input name="maximumArtLevel" type="number" min="0" max="9" step="1" value="${state.maximumArtLevel}"></label>
    <label>AP recovery<select name="recovery">${[["long", "Long Rest"], ["short", "Short or Long Rest"], ["manual", "Manual"]].map(([key, label]) => `<option value="${key}"${selected(key, state.recovery)}>${label}</option>`).join("")}</select></label>
    <label>Casting Unit<select name="castingUnit"><option value="">None (requires an Art-specific exception)</option>${options.map(item => `<option value="${escape(item.id)}"${selected(item.id, state.castingUnit)}>${escape(item.name)}</option>`).join("")}</select></label>
    <p>The selected item must have the Casting Unit property in its rules and be equipped. Rule-granted exceptions can be configured by the GM.</p>`;
  const values = await dialogPage("AK5e Arts setup", content, [
    { action: "review", label: "Review changes", default: true, callback: (_event, button) => Object.fromEntries(new FormData(button.form)) },
    { action: "cancel", label: "Cancel" }
  ]);
  if (!values || typeof values !== "object") return;
  const plan = previewActorArts(actor, values);
  const confirmed = await dialogPage("Review Arts setup", `<p>Set AP to ${escape(values.value)}/${escape(values.maximum)}, maximum Art level ${escape(values.maximumArtLevel)}.</p>
    <p>Adopt ${plan.items.length} spell Items as always-prepared Arts without material components or spell-slot costs. Their original casting fields are retained in AK5e flags.</p>
    <ul>${plan.names.map(name => `<li>${escape(name)}</li>`).join("")}</ul>
    <p>Class/pool selection and individual Art effects remain as configured on the Items.</p>`, [
    { action: "apply", label: "Apply Arts setup", callback: () => true }, { action: "cancel", label: "Cancel", default: true }
  ]);
  if (confirmed === true) await configureActorArts(actor, values);
}

async function openArtRules(actor) {
  const items = list(actor.items).filter(item => item.type === "spell");
  if (!items.length) throw new Error("Add an Art to this actor first.");
  const id = await dialogPage("Choose Art", `<label>Art<select name="item">${items.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join("")}</select></label>`, [
    { action: "choose", label: "Configure", default: true, callback: (_event, button) => button.form.elements.item.value }, { action: "cancel", label: "Cancel" }
  ]);
  const item = actor.items.get(id);
  if (!item) return;
  const grant = flags(item);
  const checked = value => value ? " checked" : "";
  const value = await dialogPage(`Casting rules: ${item.name}`, `
    <label>Source feature / GM ruling<input name="source" value="${escape(grant.source)}"></label>
    <label><input name="noCastingUnit" type="checkbox"${checked(grant.noCastingUnit)}> Does not require a Casting Unit</label>
    <label><input name="ritual" type="checkbox"${checked(grant.ritual)}> Can be cast as a ritual</label>
    <label><input name="onlyFree" type="checkbox"${checked(grant.onlyFree)}> Only through the free casting grant</label>
    <label>AP reduction<input name="reduction" type="number" min="0" max="9" value="${grant.reduction ?? 0}"></label>
    <label>Minimum AP cost<input name="minimumCost" type="number" min="0" max="9" value="${grant.minimumCost ?? 0}"></label>
    <label>Free casts per rest (blank = no grant, 0 = unlimited)<input name="freeMaximum" type="number" min="0" value="${grant.free ? grant.free.maximum ?? 0 : ""}"></label>
    <label>Free cast maximum level<input name="freeLevel" type="number" min="${item.system.level}" max="9" value="${grant.free?.level ?? item.system.level}"></label>
    <label>Free-use recovery<select name="freeRecovery">${["long", "short", "manual"].map(key => `<option value="${key}"${key === grant.free?.recovery ? " selected" : ""}>${key}</option>`).join("")}</select></label>
    <label>Block ordinary casting with this explanation (special workflows)<input name="blocked" value="${escape(grant.blocked)}"></label>
    <p>Use these controls for source-defined exceptions. Spellsword attacks and Bard performances require their own resolution; a free grant alone does not automate them.</p>`, [
    { action: "apply", label: "Save casting rules", callback: (_event, button) => {
      const form = button.form.elements;
      return { source: form.source.value, noCastingUnit: form.noCastingUnit.checked, ritual: form.ritual.checked,
        onlyFree: form.onlyFree.checked, reduction: form.reduction.value, minimumCost: form.minimumCost.value, blocked: form.blocked.value,
        free: form.freeMaximum.value === "" ? null : { maximum: Number(form.freeMaximum.value) === 0 ? null : form.freeMaximum.value, level: form.freeLevel.value, recovery: form.freeRecovery.value } };
    } }, { action: "cancel", label: "Cancel", default: true }
  ]);
  if (value && typeof value === "object") await configureArt(item, value);
}
