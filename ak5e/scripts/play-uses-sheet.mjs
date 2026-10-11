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
 * Warnings are listed with "Use anyway"; a missing GM ruling offers its readings for this use only. Each answer
 * resubmits the same attempt with `overrides` / `reading`; cancelling returns null and changes nothing.
 */
export async function confirmPlayUse(title, attempt) {
  let extra = {};
  while (true) {
    try { return await attempt(extra); }
    catch (error) {
      if (isPlayWarnings(error)) {
        const accepted = await dialog(`${title}: check before use`, `<p>The source rules flag the following:</p><ul>${error.warnings.map(warning => `<li>${esc(warning.text)}</li>`).join("")}</ul><p>If you use it anyway, these are listed on the public chat card.</p>`, [
          { action: "anyway", label: "Use anyway", callback: () => true }, { action: "cancel", label: "Cancel", default: true, callback: () => null }]);
        if (!accepted) return null;
        extra = { ...extra, overrides: [...new Set([...(extra.overrides ?? []), ...error.warnings.map(warning => warning.id)])] };
      } else if (isPlayReading(error)) {
        const options = error.options.map((option, index) => `<label class="ak5e-play-use-choice"><input type="radio" name="reading" value="${esc(option.value)}"${index === 0 ? " checked" : ""}> <span>${esc(option.label)}</span></label>`).join("");
        const reading = await dialog(`${title}: no GM ruling`, `<p>${esc(error.label)}: the GM has not ruled on this. Choose a reading for this use only. It is shown on the chat card and is not saved as a ruling.</p><fieldset>${options}</fieldset>`, [
          { action: "read", label: "Use this reading", default: true, callback: (_event, button) => button.form.elements.reading?.value || null }, { action: "cancel", label: "Cancel", callback: () => null }]);
        if (!reading) return null;
        extra = { ...extra, reading, readings: { ...(extra.readings ?? {}), [error.key]: reading } };
      } else throw error;
    }
  }
}
function refreshCards(engine, useId) {
  for (const message of Array.from(game.messages?.values?.() ?? game.messages ?? [])) if (flag(message, engine.cardFlag)?.useId === useId) ui.chat?.updateMessage?.(message);
}
/** What an undo will and will not restore, then the undo itself (noted on the public card). */
export async function openPlayUndo(engine, actor, useId) {
  const preview = engine.previewUndo(actor, useId);
  const accepted = await dialog(`Undo — ${actor.name}`, `<ul>${preview.lines.map(line => `<li>${esc(line)}</li>`).join("")}</ul>${preview.blocked ? "" : "<p>The undo is noted on the public chat card.</p>"}`,
    preview.blocked ? [{ action: "close", label: "Close", default: true, callback: () => null }]
      : [{ action: "undo", label: "Undo this use", callback: () => true }, { action: "cancel", label: "Cancel", default: true, callback: () => null }]);
  if (!accepted) return null;
  const result = await engine.command(actor, "undoUse", { useId }, operationId());
  refreshCards(engine, useId);
  return result;
}
export async function openPlayUndoList(engine, actor) {
  const uses = engine.uses(actor).filter(use => use.status !== "undone");
  if (!uses.length) { ui.notifications.info("There is no recorded use to undo."); return null; }
  const options = uses.map((use, index) => `<label class="ak5e-play-use-choice"><input type="radio" name="useId" value="${esc(use.id)}"${index === 0 ? " checked" : ""}${use.locked && !game.user.isGM ? " disabled" : ""}> <span>${esc(use.title)}: ${esc(use.summary ?? "")}${use.locked ? " (locked: earlier encounter window)" : ""}${use.status === "pending" ? " (not applied yet)" : ""}</span></label>`).join("");
  const useId = await dialog(`Undo a recent use — ${actor.name}`, `<fieldset>${options}</fieldset>`, [
    { action: "choose", label: "Review undo", default: true, callback: (_event, button) => button.form.elements.useId?.value || null }, { action: "cancel", label: "Cancel", callback: () => null }]);
  return useId ? openPlayUndo(engine, actor, useId) : null;
}
/** Retry a use left "Not applied yet" (for example while no GM was connected); the same receipt is resumed. */
export function retryPlayUse(engine, actor, use) {
  return confirmPlayUse(use.title, extra => engine.command(actor, use.command, { ...use.data, ...extra }, use.id));
}
/** Roll, Retry and Undo controls on a use card, for the source Actor's owners and the GM. */
export function renderPlayUseCard(engine, message, html) {
  const use = flag(message, engine.cardFlag);
  if (!use || html.querySelector(`.ak5e-play-use-controls[data-ns="${engine.ns}"]`)) return;
  const actor = globalThis.fromUuidSync?.(use.actorUuid);
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
