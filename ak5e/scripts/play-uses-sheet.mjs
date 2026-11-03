/**
 * Sheet helpers for play-use engines (play-uses.mjs): the WORKFLOW.md §3.2 confirm loop, undo review dialogs and the
 * Roll / Retry / Undo buttons on use cards. Opening any of these writes nothing; cancelling changes nothing.
 */
import { isPlayWarnings, isPlayReading, isLocked } from "./play-undo.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const operationId = () => foundry.utils.randomID();
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Play use", error); ui.notifications.error(error?.message ?? String(error)); });
async function dialog(title, content, buttons) {
  return foundry.applications.api.DialogV2.wait({ window: { title }, position: { width: 560 }, rejectClose: false, content: `<div class="ak5e-play-use">${content}</div>`, buttons });
}

/**
 * The up-front confirm: stated cost, targets, preview warnings ("Use anyway") and the readings to pick from. Resolves
 * the updated attempt options, or null when the user pressed Cancel or closed the dialog (nothing has been written).
 */
async function upfrontConfirm(title, preview, extra) {
  const plan = preview ? await preview(extra) : { title, costs: [], targets: [], warnings: [], readings: [] };
  const costs = (plan.costs ?? []).map(cost => typeof cost === "string" ? cost : `${cost.amount ?? ""} ${cost.label ?? cost.pool ?? "resource"}`);
  const targets = (plan.targets ?? []).map(target => typeof target === "string" ? target : target.name ?? target.uuid ?? "Target");
  const readings = (plan.readings ?? []).filter(reading => reading.source !== "ruling");
  const fields = readings.map(reading => `<fieldset><legend>${esc(reading.label)}</legend>${reading.options.map((option, index) => `<label><input type="radio" name="${esc(reading.key)}" value="${esc(option.value)}"${index === 0 ? " checked" : ""}> ${esc(option.label)}</label>`).join("")}</fieldset>`).join("");
  const warnings = plan.warnings ?? [];
  const answer = await dialog(plan.title ?? title,
    `<p>${esc(title)}</p>${costs.length ? `<p><strong>Cost:</strong> ${costs.map(esc).join(", ")}</p>` : "<p>Review this feature's stated cost before using it.</p>"}${targets.length ? `<p><strong>Targets:</strong> ${targets.map(esc).join(", ")}</p>` : ""}${warnings.length ? `<ul>${warnings.map(warning => `<li>${esc(warning.text)}</li>`).join("")}</ul>` : ""}${fields}`,
    [{ action: "use", label: warnings.length ? "Use anyway" : "Use", callback: (_event, button) => ({ readings: Object.fromEntries(readings.map(reading => [reading.key, button.form.elements[reading.key]?.value])) }) },
      // DialogV2 resolves `callback() ?? action`: a nullish Cancel callback would resolve to the truthy "cancel".
      { action: "cancel", label: "Cancel", default: true, callback: () => false }]);
  if (!answer || typeof answer !== "object") return null;
  return { ...extra, confirmed: true, overrides: [...new Set([...(extra.overrides ?? []), ...warnings.map(warning => warning.id)])], readings: { ...(extra.readings ?? {}), ...(answer.readings ?? {}) } };
}

/**
 * Every use is confirmed exactly once before anything is committed (WORKFLOW §3.2). The up-front confirm lists the
 * stated cost, targets and warnings; a caller that has already shown its own confirm for this use passes
 * `confirmed: true` to skip it. Afterwards, warnings the engine raises are listed with "Use anyway" and a missing GM
 * ruling offers its readings for this use only. Each answer resubmits the same attempt with `overrides` / `reading`;
 * cancelling (Cancel or closing the dialog) returns null, never runs the attempt and changes nothing.
 */
export async function confirmPlayUse(title, attempt, { preview, confirmed = false } = {}) {
  let extra = confirmed === true ? { confirmed: true } : {};
  let asked = confirmed === true;
  while (true) {
    try {
      if (!asked) {
        const next = await upfrontConfirm(title, preview, extra);
        if (!next) return null;
        extra = next; asked = true;
      }
      return await attempt(extra);
    }
    catch (error) {
      if (isPlayWarnings(error)) {
        const accepted = await dialog(`${title}: check before use`, `<p>The source rules flag the following:</p><ul>${error.warnings.map(warning => `<li>${esc(warning.text)}</li>`).join("")}</ul><p>If you use it anyway, these are listed on the public chat card.</p>`, [
          { action: "anyway", label: "Use anyway", callback: () => true }, { action: "cancel", label: "Cancel", default: true, callback: () => false }]);
        if (accepted !== true) return null;
        extra = { ...extra, overrides: [...new Set([...(extra.overrides ?? []), ...error.warnings.map(warning => warning.id)])] };
      } else if (isPlayReading(error)) {
        const options = error.options.map((option, index) => `<label class="ak5e-play-use-choice"><input type="radio" name="reading" value="${esc(option.value)}"${index === 0 ? " checked" : ""}> <span>${esc(option.label)}</span></label>`).join("");
        const offered = error.options.map(option => option.value);
        const reading = await dialog(`${title}: no GM ruling`, `<p>${esc(error.label)}: the GM has not ruled on this. Choose a reading for this use only. It is shown on the chat card and is not saved as a ruling.</p><fieldset>${options}</fieldset>`, [
          { action: "read", label: "Use this reading", default: true, callback: (_event, button) => button.form.elements.reading?.value ?? false }, { action: "cancel", label: "Cancel", callback: () => false }]);
        if (!offered.includes(reading)) return null;
        extra = { ...extra, reading, readings: { ...(extra.readings ?? {}), [error.key]: reading } };
      } else throw error;
    }
  }
}
/**
 * Chat messages worth re-rendering: when the chat log's DOM can be inspected, only those currently displayed (the log
 * keeps a bounded window), otherwise every message. Foundry V13 draws the log before `ready`, so cards drawn before a
 * hook was registered need one explicit re-render; this keeps that pass cheap.
 */
function displayedMessages() {
  const all = Array.from(globalThis.game?.messages?.values?.() ?? globalThis.game?.messages ?? []);
  const root = globalThis.ui?.chat?.element;
  if (typeof root?.querySelectorAll !== "function") return all;
  const ids = new Set(Array.from(root.querySelectorAll("[data-message-id]"), element => element.dataset?.messageId));
  return all.filter(message => ids.has(message.id));
}
/** Re-render the given chat messages through the normal render hooks; never throws. */
export function rerenderChatMessages(messages) {
  for (const message of messages) {
    try { Promise.resolve(globalThis.ui?.chat?.updateMessage?.(message)).catch(error => console.error("AK5e | Card refresh", error)); }
    catch (error) { console.error("AK5e | Card refresh", error); }
  }
}
/** Re-render the displayed chat messages that satisfy `predicate(message)`; returns how many were refreshed. */
export function refreshChatMessages(predicate) {
  const matches = displayedMessages().filter(message => { try { return predicate(message); } catch { return false; } });
  rerenderChatMessages(matches);
  return matches.length;
}
/** Re-render the displayed use cards of one engine (optionally one use, or every use of one Actor). */
export function refreshPlayUseCards(engine, { useId = null, actorUuid = null } = {}) {
  return refreshChatMessages(message => {
    const use = flag(message, engine.cardFlag);
    return Boolean(use) && (useId === null || use.useId === useId) && (actorUuid === null || use.actorUuid === actorUuid);
  });
}
function refreshCards(engine, useId) { refreshPlayUseCards(engine, { useId }); }
const registeredRefresh = new Set();
/**
 * When an Actor's receipt flag for this engine changes (on any client), re-render that Actor's displayed use cards so
 * the Roll / Retry / Undo controls follow the receipt. Idempotent per engine namespace.
 */
export function registerPlayUseCardRefresh(engine) {
  if (registeredRefresh.has(engine.ns)) return false;
  registeredRefresh.add(engine.ns);
  Hooks.on("updateActor", (actor, changes) => {
    const touched = Object.hasOwn(changes?.flags?.ak5e ?? {}, engine.ns) || changes?.[`flags.ak5e.${engine.ns}`] !== undefined
      || Object.keys(changes ?? {}).some(key => key.startsWith(`flags.ak5e.${engine.ns}.`));
    if (touched) refreshPlayUseCards(engine, { actorUuid: actor?.uuid });
  });
  return true;
}
/** What an undo will and will not restore, then the undo itself (noted on the public card). */
export async function openPlayUndo(engine, actor, useId) {
  const preview = engine.previewUndo(actor, useId);
  const accepted = await dialog(`Undo — ${actor.name}`, `<ul>${preview.lines.map(line => `<li>${esc(line)}</li>`).join("")}</ul>${preview.blocked ? "" : "<p>The undo is noted on the public chat card.</p>"}`,
    preview.blocked ? [{ action: "close", label: "Close", default: true, callback: () => false }]
      : [{ action: "undo", label: "Undo this use", callback: () => true }, { action: "cancel", label: "Cancel", default: true, callback: () => false }]);
  if (accepted !== true) return null;
  const result = await engine.command(actor, "undoUse", { useId }, operationId());
  refreshCards(engine, useId);
  return result;
}
export async function openPlayUndoList(engine, actor) {
  const uses = engine.uses(actor).filter(use => use.status !== "undone");
  if (!uses.length) { ui.notifications.info("There is no recorded use to undo."); return null; }
  const options = uses.map((use, index) => `<label class="ak5e-play-use-choice"><input type="radio" name="useId" value="${esc(use.id)}"${index === 0 ? " checked" : ""}${use.locked && !game.user.isGM ? " disabled" : ""}> <span>${esc(use.title)}: ${esc(use.summary ?? "")}${use.locked ? " (locked: earlier encounter window)" : ""}${use.status === "pending" ? " (not applied yet)" : ""}</span></label>`).join("");
  const offered = uses.map(use => use.id);
  const useId = await dialog(`Undo a recent use — ${actor.name}`, `<fieldset>${options}</fieldset>`, [
    { action: "choose", label: "Review undo", default: true, callback: (_event, button) => button.form.elements.useId?.value ?? false }, { action: "cancel", label: "Cancel", callback: () => false }]);
  return offered.includes(useId) ? openPlayUndo(engine, actor, useId) : null;
}
/** Retry a use left "Not applied yet" (for example while no GM was connected); the same receipt is resumed. */
export function retryPlayUse(engine, actor, use) {
  const preview = use.command === "collectiveWard" ? () => ({
    title: use.title,
    costs: (use.result?.donorUpdates ?? []).map(donor => {
      const name = use.targets?.find(target => target.uuid === donor.uuid)?.name ?? donor.uuid;
      return `${name}: ${donor.wardBefore - donor.wardAfter} Ward`;
    }),
    targets: (use.targets ?? []).filter(target => target.key === "recipient")
  }) : undefined;
  return confirmPlayUse(use.title, extra => engine.command(actor, use.command, { ...use.data, ...extra }, use.id), { preview });
}
/** Roll, Retry and Undo controls on a use card, for the source Actor's owners and the GM. */
export function renderPlayUseCard(engine, message, html) {
  const use = flag(message, engine.cardFlag);
  if (!use || html.querySelector(`.ak5e-play-use-controls[data-ns="${engine.ns}"]`)) return;
  const actor = globalThis.fromUuidSync?.(use.actorUuid);
  // Saves belong to the recipient, even when that user cannot operate the source Actor.
  for (const save of engine.receipt(actor, use.useId)?.saves ?? use.saves ?? []) {
    const target = globalThis.fromUuidSync?.(save.uuid);
    if (!target?.isOwner || save.resolved || (save.afterRoll && engine.receipt(actor, use.useId)?.roll === undefined) || html.querySelector(`[data-play-save="${save.id}"]`)) continue;
    const button = document.createElement("button");
    button.type = "button"; button.dataset.playSave = save.id;
    button.textContent = `${target.name}: ${save.ability.toUpperCase()} save DC ${save.dc}`;
    button.addEventListener("click", event => {
      event.preventDefault(); button.disabled = true;
      safe(async () => {
        // Keep D&D5e's native save dialog; there is no extra feature confirmation here.
        await target.rollSavingThrow({ ability: save.ability, target: save.dc }, {}, { data: { flags: { ak5e: { playSave: {
          ns: engine.ns, sourceUuid: use.actorUuid, useId: use.useId, targetUuid: target.uuid, saveId: save.id
        } } } } });
      }).finally(() => { button.disabled = false; });
    });
    html.querySelector(".message-content")?.append(button);
  }
  if (!actor?.isOwner) return;
  const receipt = engine.receipt(actor, use.useId);
  if (!receipt) return;
  const box = document.createElement("div");
  box.className = "ak5e-play-use-controls"; box.dataset.ns = engine.ns;
  const add = (text, handler, disabled = false) => {
    const el = document.createElement("button"); el.type = "button"; el.textContent = text; el.disabled = disabled;
    el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; refreshCards(engine, receipt.id); }); });
    box.append(el);
  };
  if (receipt.status === "awaitingRoll") add(`Roll ${receipt.formula}${receipt.rollLabel ? ` ${receipt.rollLabel}` : ""}`, () => confirmPlayUse(receipt.title, () => engine.command(actor, "useRoll", { useId: receipt.id }, operationId())));
  if (receipt.status === "pending") add("Retry", () => retryPlayUse(engine, actor, { ...receipt, title: receipt.title }));
  const locked = isLocked(receipt) && !game.user.isGM, undone = receipt.status === "undone";
  add(undone ? "Undone" : locked ? "Locked (encounter window ended)" : "Undo", () => openPlayUndo(engine, actor, receipt.id), undone || locked);
  html.querySelector(".message-content")?.append(box);
}
