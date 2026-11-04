/**
 * Core Caster UI: the rendered dialogs for the Core branch commands. The module only presents the
 * choices the Core layer (caster-core.mjs) validates again on submission; it performs no write itself,
 * so closing or cancelling a dialog leaves the Actor untouched.
 *
 * Nothing here touches Foundry at import time: every dialog is created when a user opens it. The Caster
 * sheet wires these dialogs when the parent extraction lands (M0); until then the module is the Core
 * branch's presentation layer, called with the same view data the sheet already builds.
 */
import { need } from "./operation-kernel.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

/** Printed Core feature names (Ch.3 L393–443), used as dialog titles. */
export const CORE_LABELS = Object.freeze({
  rabbit: "Rabbit from the Hat",
  powerWithin: "Power from Within",
  empower: "Empowered Arts",
  signature: "Savant Signature Art",
  signatureDice: "Savant Signature reroll"
});

const intList = (value, label) => {
  const parts = String(value ?? "").split(",").map(part => part.trim()).filter(Boolean);
  need(parts.length > 0, `${label} must list at least one position.`);
  const numbers = parts.map(part => Number(part));
  need(numbers.every(number => Number.isSafeInteger(number) && number >= 0), `${label} must list whole numbers.`);
  return numbers;
};

/** Standard-pool Arts within the Caster's Maximum Art Level, as dialog options. */
export function coreArtOptions(arts = []) {
  return (Array.isArray(arts) ? arts : []).filter(art => art?.name)
    .map(art => ({ value: art.name, label: `${art.pool ? `${art.pool}: ` : ""}${art.name} (${Number(art.level) === 0 ? "Cantrip" : `level ${art.level}`})` }));
}

/** Completed Art casts on the Caster's current Turn, as dialog options. */
export function coreCastOptions(casts = []) {
  return (Array.isArray(casts) ? casts : []).filter(cast => cast?.id)
    .map(cast => ({ value: cast.id, label: `${cast.artName ?? cast.itemName ?? "Cast"} (${cast.summary ?? cast.id})` }));
}

/**
 * The dice of the actual damage roll handed over by the card, in card order. The Savant reroll reads its
 * faces and current results from here; the dialog never asks the player to type a die size or value.
 *
 * Positions are flattened per active RESULT, exactly as the Core layer selects them: a Die term carrying
 * several results (2d6 is one term with two results) contributes one position per result, so position `i`
 * here is the same die that reroll position `i` rerolls. Inactive results are skipped, never shown.
 */
export function coreDamageDice(view = {}) {
  const raw = view.roll ?? view.rolls ?? null;
  const rolls = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean);
  const dice = [];
  for (const roll of rolls) {
    const terms = Array.isArray(roll?.dice) && roll.dice.length ? roll.dice : (roll?.terms ?? []);
    for (const term of terms) {
      if (!Number.isInteger(term?.faces) || !Array.isArray(term.results)) continue;
      for (const result of term.results) {
        if (result?.active === false || result?.discarded === true) continue;
        const value = Number(result?.result);
        dice.push({ index: dice.length, faces: Number(term.faces), result: Number.isInteger(value) ? value : null });
      }
    }
  }
  return dice;
}
const diceList = dice => dice.length
  ? `<ul class="ak5e-caster-dice">${dice.map(die => `<li>Position ${esc(die.index)}: d${esc(die.faces)} = <strong>${die.result === null ? "unresolved" : esc(die.result)}</strong>${Number.isInteger(die.result) && die.result <= 3 ? " (may reroll)" : ""}</li>`).join("")}</ul>`
  : note("No damage roll is attached to this dialog; open it from the Art's damage card.");

function select(name, label, options, { required = true } = {}) {
  need(options.length > 0, `${label} has no eligible choice; review the source requirement first.`);
  return `<label class="ak5e-caster-field"><span>${esc(label)}</span><select name="${esc(name)}"${required ? " required" : ""}>${options
    .map(option => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join("")}</select></label>`;
}
const check = (name, label) => `<label class="ak5e-caster-field"><input type="checkbox" name="${esc(name)}" required><span>${esc(label)}</span></label>`;
const field = (name, label, { type = "text", value = "", min = null, max = null } = {}) =>
  `<label class="ak5e-caster-field"><span>${esc(label)}</span><input type="${esc(type)}" name="${esc(name)}" value="${esc(value)}"${min === null ? "" : ` min="${esc(min)}"`}${max === null ? "" : ` max="${esc(max)}"`} required></label>`;
const note = text => `<p class="ak5e-caster-note">${esc(text)}</p>`;

/** Dialog body for one Core command. `view` carries the eligible choices the sheet already computed. */
export function coreDialogContent(command, view = {}) {
  switch (command) {
    case "rabbit":
      return `${select("poolArtName", "Standard-pool Art to borrow", coreArtOptions(view.arts))}${note("Once per Long Rest. The grant lasts until the next Long Rest; Arts you already know keep their own grants.")}${check("confirmed", "I reviewed the Art and its source requirement")}`;
    case "powerWithin":
      return `${note("A Short Rest activity, as if casting an Art as a Ritual. Regain half your Caster level (rounded up) in expended Arts Points, once per Long Rest.")}${check("restCompleted", "The Short Rest meditation is completed")}${check("confirmed", "I reviewed the source requirement")}`;
    case "empower":
      return `${select("castId", "Art cast this Turn", coreCastOptions(view.casts))}${note("Once per Turn. The bonus is added to the damage roll from that cast's card: Proficiency Bonus, plus the Spellcasting Ability Modifier for a Levelled Art. Nothing is rolled here.")}${check("confirmed", "I reviewed the source requirement")}`;
    case "signature":
      return `${select("itemId", "Known Art of level 5 or less", coreSignatureOptions(view.arts))}
        <label class="ak5e-caster-field"><span>Can this Art deal Damage?</span><select name="damaging" required><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></select></label>
        ${note("A non-damaging Signature costs 2 fewer Arts Points, to a minimum of 0. A Cantrip needs the GM's recorded ruling. Only one Signature Art exists at a time.")}
        ${check("restCompleted", "The Long Rest selection ritual is completed")}${check("confirmed", "I reviewed the source requirement")}`;
    case "signatureDice":
      return `${select("castId", "Signature Art damage roll", coreCastOptions(view.casts))}
        ${diceList(coreDamageDice(view))}
        ${field("indices", "Positions to reroll (0 = first die, comma separated)", { value: "" })}
        ${note("Only dice showing 3 or less may be rerolled, and the new result must be used. The dice, their faces and their values come from the actual damage roll. Reroll repetition follows the GM's recorded policy.")}
        ${check("confirmed", "I reviewed the source requirement")}`;
    default:
      return need(false, "Choose a Core feature.");
  }
}

/** Known Arts of level 5 or less for the Signature chooser. */
export function coreSignatureOptions(arts = []) {
  return (Array.isArray(arts) ? arts : []).filter(art => art?.id && Number(art.level) <= 5)
    .map(art => ({ value: art.id, label: `${art.name} (${Number(art.level) === 0 ? "Cantrip" : `level ${art.level}`})` }));
}

/** The command payload a dialog form submits; revalidated by the Core layer. */
export function coreCommandData(command, form, view = {}) {
  const value = name => String(form?.elements?.[name]?.value ?? "").trim();
  const checked = name => form?.elements?.[name]?.checked === true;
  switch (command) {
    case "rabbit": return { poolArtName: value("poolArtName"), confirmed: checked("confirmed") };
    case "powerWithin": return { restCompleted: checked("restCompleted"), confirmed: checked("confirmed") };
    case "empower": return { castId: value("castId"), confirmed: checked("confirmed") };
    case "signature": {
      const damaging = value("damaging");
      need(damaging === "true" || damaging === "false", "Confirm whether this Art can deal Damage.");
      return { itemId: value("itemId"), damaging: damaging === "true", restCompleted: checked("restCompleted"), confirmed: checked("confirmed") };
    }
    case "signatureDice": return { castId: value("castId"), indices: intList(value("indices"), "Reroll positions"),
      roll: view.roll ?? view.rolls ?? null, confirmed: checked("confirmed") };
    default: return need(false, "Choose a Core feature.");
  }
}

async function dialog(title, content, buttons) {
  let closed = Promise.resolve();
  const result = await foundry.applications.api.DialogV2.wait({ window: { title }, position: { width: 560 }, classes: ["ak5e-core-dialog", "ak5e-caster-dialog"],
    rejectClose: false, content: `<section class="ak5e-caster-dialog-content">${content}</section>`, buttons,
    render: (_event, app) => { closed = new Promise(resolve => app.addEventListener("close", resolve, { once: true })); } });
  await closed;
  return typeof result === "string" && buttons.some(entry => entry.action === result) ? null : result;
}

/**
 * Open one Core feature dialog. `onConfirm(data)` runs only after the player submits; a cancel or a
 * rejected form returns null and calls nothing, so the dialog itself never changes the Actor.
 */
export async function openCoreFeature(command, { actorName = "Caster", view = {}, onConfirm } = {}) {
  need(Object.hasOwn(CORE_LABELS, command), "Choose a Core feature.");
  need(typeof onConfirm === "function", "A confirmed Core use needs a handler.");
  const content = coreDialogContent(command, view);
  const submitted = await dialog(`${CORE_LABELS[command]} — ${actorName}`, content, [
    { action: "confirm", label: "Use", default: true, callback: (_event, button) => {
      try { return coreCommandData(command, button.form, view); } catch (error) { ui.notifications.warn(error.message); return false; }
    } },
    { action: "cancel", label: "Cancel", callback: () => null }
  ]);
  if (!submitted) return null;
  return onConfirm(submitted);
}

/** Receipt rows shared by the sheet's confirmation card. */
export function coreReceiptRows(receipt = {}) {
  const rows = [];
  if (receipt.recovered !== undefined) rows.push({ key: "recovered", label: "Arts Points regained", value: receipt.recovered });
  if (receipt.itemId) rows.push({ key: "item", label: "Borrowed Art", value: receipt.name ?? receipt.itemId });
  if (receipt.armed) rows.push({ key: "armed", label: "Empowered cast", value: receipt.armed });
  if (receipt.replacements?.length) rows.push({ key: "rerolls", label: "Rerolled dice", value: receipt.replacements.map(entry => `${entry.index + 1}: ${entry.value}`).join(", ") });
  return rows;
}
