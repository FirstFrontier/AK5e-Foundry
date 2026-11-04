/**
 * Mystic Caster UI: the rendered controls for the charging ritual and the branch pool. The dialog only
 * collects the user's confirmations and returns them to `onCommand`; it performs no write itself, so
 * Cancel leaves the Actor untouched. It is created when a user opens it and touches no Foundry API at
 * import time.
 *
 * Source: Ch.3 L672-720. The ritual is one minute, stationary, as if concentrating on a Spell, and may
 * expend up to 3 Arts Points for 1 Mystic Charge each (C3:685). Nothing here rolls dice or applies
 * Damage; Potent Cantrip's reviewed Damage comes from the use plan in `caster-mystic.mjs`.
 */
import { need } from "./operation-kernel.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
function whole(value, label, min, max) {
  need(Number.isInteger(value) && value >= min && value <= max, `${label} must be an integer from ${min} to ${max}.`);
  return value;
}

/** The read-only rows the panel shows: the stored/printed Charge and the pending ritual state. */
export function mysticControlRows({ charge = null, ritual = null } = {}) {
  const rows = [];
  if (charge !== null) {
    need(charge && typeof charge === "object" && !Array.isArray(charge), "The Mystic Charge read is required.");
    const value = whole(charge.value, "Mystic Charge", 0, 99), max = whole(charge.max, "Maximum Mystic Charge", 0, 99);
    need(value <= max, "Stored Mystic Charge cannot exceed its maximum.");
    rows.push({ key: "charge", label: "Mystic Charge", value: `${value} / ${max}` });
  }
  if (ritual) {
    const start = Number(ritual.start);
    need(Number.isFinite(start), "The pending ritual has no recorded start time.");
    rows.push({ key: "ritual", label: "Charging ritual", value: ritual.interrupted ? "Interrupted (cannot be completed)" : `In progress since World time ${start}` });
  } else rows.push({ key: "ritual", label: "Charging ritual", value: "Not started" });
  return rows;
}

function rowsMarkup(rows) {
  return `<table class="ak5e-caster-quote"><tbody>${rows.map(row =>
    `<tr data-field="${esc(row.key)}"><th>${esc(row.label)}</th><td>${esc(row.value)}</td></tr>`).join("")}</tbody></table>`;
}

function ritualFields() {
  return `<fieldset class="ak5e-caster-fields"><legend>Ritual completion</legend>
    <label class="ak5e-caster-field"><span>Arts Points to expend (0-3)</span>
      <input type="number" name="ap" min="0" max="3" step="1" value="1"></label>
    <label class="ak5e-caster-check"><input type="checkbox" name="stationary"> I remained stationary for the full minute</label>
    <label class="ak5e-caster-check"><input type="checkbox" name="concentration"> I treated the ritual as concentration on a Spell</label>
    <label class="ak5e-caster-check"><input type="checkbox" name="minuteCompleted"> The printed minute has passed (World time advanced)</label>
  </fieldset>`;
}

async function dialog(title, content, buttons) {
  let closed = Promise.resolve();
  const result = await foundry.applications.api.DialogV2.wait({ window: { title }, position: { width: 560 }, classes: ["ak5e-caster-dialog"],
    rejectClose: false, content: `<section class="ak5e-caster-dialog-content">${content}</section>`, buttons,
    render: (_event, app) => { closed = new Promise(resolve => app.addEventListener("close", resolve, { once: true })); } });
  await closed;
  return typeof result === "string" && buttons.some(entry => entry.action === result) ? null : result;
}

/**
 * Open the Mystic controls. Buttons offered depend on the pending ritual: Begin when none is pending;
 * Finish and Cancel when one is. `onCommand` receives `{ command, ap, stationary, concentration,
 * minuteCompleted }` for a confirmed control; Cancel and a closed dialog return null without calling it.
 */
export async function openMysticControls({ actorName = "Caster", charge = null, ritual = null, onCommand } = {}) {
  need(typeof onCommand === "function", "A confirmed Mystic control needs a handler.");
  need(typeof actorName === "string" && actorName.trim() !== "", "A Caster name is required to show its controls.");
  const rows = mysticControlRows({ charge, ritual });
  const content = `${rowsMarkup(rows)}${ritual ? ritualFields() : `<p>Begin the one-minute charging ritual when you are stationary and can concentrate on it.</p>`}`;
  const buttons = ritual
    ? [
        { action: "finish", label: "Finish ritual", default: true, callback: (_event, button) => {
          try {
            const form = button.form.elements, ap = Number(form.ap?.value);
            whole(ap, "Ritual AP", 0, 3);
            return { command: "finishRitual", ap, stationary: form.stationary?.checked === true,
              concentration: form.concentration?.checked === true, minuteCompleted: form.minuteCompleted?.checked === true };
          } catch (error) { ui.notifications.warn(error.message); return false; }
        } },
        { action: "cancel", label: "Cancel ritual", callback: () => ({ command: "cancelRitual" }) },
        { action: "dismiss", label: "Close", callback: () => null }
      ]
    : [
        { action: "begin", label: "Begin ritual", default: true, callback: () => ({ command: "beginRitual" }) },
        { action: "dismiss", label: "Close", callback: () => null }
      ];
  const confirmation = await dialog(`Mystic Charge — ${actorName}`, content, buttons);
  if (!confirmation) return null;
  return onCommand(confirmation);
}
