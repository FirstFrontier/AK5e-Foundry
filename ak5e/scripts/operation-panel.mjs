/** SI-1 sheet-window helpers shared by operation-based branches: DOM builders, error
 * surfacing, the retry-with-same-ID tracker, and the open-once guard. Branch dialogs,
 * wording and action lists stay with the branch. */
import { esc, uuid } from "./operation-kernel.mjs";

export const node = (tag, cls, content) => { const el = document.createElement(tag); if (cls) el.className = cls; if (content != null) el.textContent = content; return el; };
export const choices = (name, pairs) => `<select name="${esc(name)}">${pairs.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("")}</select>`;

/** `submit(actor, command, data, id)` is the branch's kernel submit; `label` prefixes UI errors. */
export function createOperationPanel({ label, submit }) {
  const retained = new Map(), opening = new Map();
  const safe = fn => Promise.resolve().then(fn).catch(error => { console.error(`AK5e | ${label} UI`, error); ui.notifications.error(error.message); });
  const button = (text, handler, cls = "") => {
    const el = node("button", cls, text); el.type = "button";
    el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
    return el;
  };
  /** Identical command + choices reuse the retained operation ID so a retry replays, never duplicates. */
  async function run(actor, command, data) {
    const retry = retained.get(actor.uuid);
    const id = retry?.command === command && JSON.stringify(retry.data) === JSON.stringify(data) ? retry.id : uuid();
    try {
      const result = await submit(actor, command, data, id);
      retained.delete(actor.uuid); return result;
    } catch (error) {
      retained.set(actor.uuid, { id, command, data });
      throw error;
    }
  }
  /** The retained request, if the GM-side state still lists it as prepared. */
  const pendingRetry = (actor, pending) => {
    const retry = retained.get(actor.uuid);
    return retry && pending?.some(operation => operation.id === retry.id) ? retry : null;
  };
  async function retryPending(actor, retry) {
    await submit(actor, retry.command, retry.data, retry.id); retained.delete(actor.uuid);
  }
  function openOnce(actor, task) {
    if (opening.has(actor.uuid)) return opening.get(actor.uuid);
    const running = task().finally(() => opening.delete(actor.uuid)); opening.set(actor.uuid, running); return running;
  }
  return { safe, button, run, pendingRetry, retryPending, openOnce };
}
