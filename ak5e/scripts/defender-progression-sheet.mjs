import { defenderChoices, previewDefenderProgression, applyDefenderProgression } from "./defender-progression.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const list = value => Array.from(value?.values?.() ?? value ?? []);
const asValue = value => typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
const fromValue = value => { try { return JSON.parse(value); } catch { return value; } };
const at = (root, path) => path.split(".").reduce((current, key) => current?.[key], root);
function writePath(root, path, value) { const parts = path.split("."), leaf = parts.pop(); let target = root; for (const part of parts) target = target[part] ??= {}; target[leaf] = value; }

function renderField(descriptor) {
  const multi = descriptor.count > 1;
  const selected = Array.isArray(descriptor.selected) ? descriptor.selected : descriptor.selected == null ? [] : [descriptor.selected];
  const options = (descriptor.options ?? []).map(candidate => {
    const value = asValue(candidate.value), checked = selected.some(entry => asValue(entry) === value);
    if (multi) return `<label class="ak5e-defender-choice-option"><input type="checkbox" name="${esc(descriptor.key)}" value="${esc(value)}"${checked ? " checked" : ""}><span>${esc(candidate.label)}</span></label>`;
    return `<option value="${esc(value)}"${checked ? " selected" : ""}>${esc(candidate.label)}</option>`;
  }).join("");
  const choice = multi
    ? `<div class="ak5e-defender-choice-grid">${options || "<p>No eligible choices are available.</p>"}</div>`
    : `<select name="${esc(descriptor.key)}"><option value="">Choose…</option>${options}</select>`;
  const explanations = descriptor.options?.some(option => option.effect || option.moduleEffect)
    ? `<details><summary>Source effect and Module text</summary><ul>${descriptor.options.filter(option => option.effect || option.moduleEffect).map(option => `<li><strong>${esc(option.label)}</strong>: ${esc(option.effect ?? "")}${option.moduleEffect ? ` <em>Module:</em> ${esc(option.moduleEffect)}` : ""}</li>`).join("")}</ul></details>` : "";
  return `<fieldset class="ak5e-defender-progression-field"><legend>${esc(descriptor.label)}</legend>${choice}${explanations}<small>Available at Defender level ${esc(descriptor.requiredAt ?? 1)}.</small></fieldset>`;
}
function collect(form, setup) {
  const choices = structuredClone(setup.choices ?? {}); delete choices.summary;
  for (const descriptor of setup.fields ?? []) {
    const nodes = [...form.querySelectorAll(`[name="${CSS.escape(descriptor.key)}"]`)];
    const selected = nodes.filter(node => node.type === "checkbox" ? node.checked : node.value !== "").map(node => fromValue(node.value));
    const value = descriptor.count > 1 ? selected : selected[0];
    if (value !== undefined) {
      const key = descriptor.key;
      if (key.startsWith("asi.")) choices.asi[key.slice(4)] = value;
      else if (key.startsWith("hp.")) choices.hp[key.slice(3)] = value;
      else if (key.startsWith("talents.")) writePath(choices, key, value);
      else if (key.startsWith("startingEquipment.")) writePath(choices, key, value);
      else choices[key] = value;
    }
  }
  return choices;
}
function statusBlock(setup, error = "") {
  const messages = [error, ...(setup.pending?.length ? [`Selections still required: ${setup.pending.map(item => typeof item === "string" ? item : item.key).join(", ")}.`] : []), ...(setup.blocked ?? [])].filter(Boolean);
  return messages.length ? `<aside class="ak5e-defender-progression-status">${messages.map(message => `<p>${esc(message)}</p>`).join("")}</aside>` : "";
}
async function choiceDialog(actor, setup, error) {
  const summary = setup.choices?.summary ?? [`${setup.level ?? "?"}-level Defender`, setup.branch ?? "Choose a branch"];
  const content = `<section class="ak5e-defender-progression-form"><p>${summary.map(esc).join(" · ")}</p><p>Review the source-derived progression. Talent and equipment effects that are not automated remain visible as table procedures.</p>${statusBlock(setup, error)}${(setup.fields ?? []).map(renderField).join("")}</section>`;
  return foundry.applications.api.DialogV2.wait({ window: { title: `Defender setup — ${actor.name}` }, position: { width: 760 }, classes: ["ak5e-defender-dialog"], rejectClose: false, content,
    buttons: [
      { action: "preview", label: "Preview changes", default: true, callback: (_event, button) => collect(button.form, setup) },
      { action: "cancel", label: "Cancel", callback: () => null }
    ] });
}
function previewDialog(actor, plan) {
  const writes = plan.writes.map(write => `${write.path}: ${String(write.before ?? "—")} → ${String(write.after ?? "—")}`);
  const items = [...plan.createItems.map(item => `Add ${item.name}`), ...plan.updateItems.map(item => `Update ${item.itemId}'s Talent selection`)];
  const content = `<section class="ak5e-defender-progression-preview"><p><strong>${esc(plan.level)}-level ${esc(plan.branchName)} Defender</strong></p><p>HP gains already recorded: ${plan.progression.hpLevels.join(", ") || "none"}; ASIs already recorded: ${plan.progression.asiLevels.join(", ") || "none"}.</p>${plan.pending.length ? `<p>Incomplete: ${esc(plan.pending.join(", "))}</p>` : ""}${plan.missing.length ? `<h3>Required installed source Items</h3><ul>${plan.missing.map(row => `<li>${esc(row.name ?? row.sourceId)} — ${esc(row.reason)}</li>`).join("")}</ul>` : ""}<h3>Character changes</h3><ul>${writes.map(row => `<li>${esc(row)}</li>`).join("")}</ul><h3>Items</h3><ul>${items.map(row => `<li>${esc(row)}</li>`).join("") || "<li>No new Items</li>"}</ul>${plan.warnings.length ? `<h3>Notes</h3><ul>${plan.warnings.map(row => `<li>${esc(row)}</li>`).join("")}</ul>` : ""}<label><input name="confirm" type="checkbox"> I reviewed the exact changes above and want the active GM to apply them.</label></section>`;
  return foundry.applications.api.DialogV2.wait({ window: { title: `Review Defender setup — ${actor.name}` }, position: { width: 680 }, classes: ["ak5e-defender-dialog"], rejectClose: false, content,
    buttons: [
      { action: "apply", label: "Apply setup", default: true, callback: (_event, button) => button.form.elements.confirm?.checked === true },
      { action: "edit", label: "Edit choices", callback: () => "edit" },
      { action: "cancel", label: "Cancel", callback: () => null }
    ] });
}

/** Open a no-write choice flow, then require confirmation of an exact preview. */
export async function openDefenderSetup(actor) {
  if (!(actor?.isOwner || game.user?.isGM) || actor?.type !== "character") throw new Error("Open Defender setup on a character you own.");
  let choices = {}, error = "";
  while (true) {
    const setup = defenderChoices(actor, { choices });
    if (!setup.applicable) throw new Error("Attach the AK5e Defender class before opening Defender setup.");
    if (setup.blocked?.length) throw new Error(setup.blocked.join(" "));
    const selected = await choiceDialog(actor, setup, error); error = "";
    if (!selected || typeof selected !== "object") return null;
    choices = selected;
    let plan;
    try { plan = previewDefenderProgression(actor, { choices }); }
    catch (reason) { error = reason.message; continue; }
    const decision = await previewDialog(actor, plan);
    if (decision === "edit") continue;
    if (decision !== true) return null;
    if (plan.pending.length || plan.missing.length) { error = plan.missing.length ? `Install the required source Items: ${plan.missing.map(item => item.name).join(", ")}.` : "Complete every required choice before applying."; continue; }
    const operationId = foundry.utils.randomID();
    return applyDefenderProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: plan.choices, operationId });
  }
}
