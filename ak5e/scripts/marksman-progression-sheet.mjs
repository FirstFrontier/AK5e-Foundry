import { applyMarksmanProgression, marksmanProgressionChoices, previewMarksmanProgression } from "./marksman-progression.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const encode = value => typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
const decode = value => { try { return JSON.parse(value); } catch { return value; } };
function setPath(root, path, value) {
  const parts = path.split("."), leaf = parts.pop();
  let node = root;
  for (const part of parts) node = node[part] ??= {};
  node[leaf] = value;
}
export function renderMarksmanProgressionChoices(view, error = "") {
  const fields = view.fields.map(descriptor => {
    const multi = descriptor.count > 1;
    const selected = Array.isArray(descriptor.selected) ? descriptor.selected : descriptor.selected == null ? [] : [descriptor.selected];
    const options = descriptor.options.map(item => {
      const value = encode(item.value), checked = selected.some(entry => encode(entry) === value);
      return multi
        ? `<label><input type="checkbox" name="${esc(descriptor.key)}" value="${esc(value)}"${checked ? " checked" : ""}> ${esc(item.label)}</label>`
        : `<option value="${esc(value)}"${checked ? " selected" : ""}>${esc(item.label)}</option>`;
    }).join("");
    const control = multi ? `<div class="ak5e-marksman-choice-grid">${options}</div>` : `<select name="${esc(descriptor.key)}"><option value="">Choose…</option>${options}</select>`;
    const descriptions = descriptor.options.some(item => item.effect || item.moduleEffect)
      ? `<details><summary>Source effects and Module Effects</summary><ul>${descriptor.options.filter(item => item.effect || item.moduleEffect).map(item => `<li><strong>${esc(item.label)}</strong>: ${esc(item.effect ?? "")}${item.moduleEffect ? ` <em>Module:</em> ${esc(item.moduleEffect)}` : ""}</li>`).join("")}</ul></details>` : "";
    return `<fieldset><legend>${esc(descriptor.label)}</legend>${control}${descriptions}</fieldset>`;
  }).join("");
  return `<section class="ak5e-marksman-progression"><p>${esc(view.level)}-level Marksman · ${esc(view.branch ?? "Branch not set")}</p>${error ? `<p role="alert">${esc(error)}</p>` : ""}${fields}<button type="button" data-action="operator-skills">Open Operator Skills</button></section>`;
}

function readChoices(form, view) {
  const choices = structuredClone(view.choices);
  for (const descriptor of view.fields) {
    const nodes = [...form.querySelectorAll(`[name="${CSS.escape(descriptor.key)}"]`)];
    const selected = nodes.filter(node => node.type === "checkbox" ? node.checked : node.value !== "").map(node => decode(node.value));
    const value = descriptor.count > 1 ? selected : selected[0];
    if (value !== undefined) setPath(choices, descriptor.key, value);
  }
  return choices;
}

async function choiceDialog(actor, view, error) {
  return foundry.applications.api.DialogV2.wait({ window: { title: `Marksman progression — ${actor.name}` }, position: { width: 780 }, rejectClose: false,
    content: renderMarksmanProgressionChoices(view, error), buttons: [
      { action: "preview", label: "Preview changes", default: true, callback: (_event, button) => readChoices(button.form, view) },
      { action: "cancel", label: "Cancel", callback: () => null }
    ], render: (_event, app) => app.element.querySelector('[data-action="operator-skills"]')?.addEventListener("click", async () => {
      const { openOperatorSkillChoices } = await import("./operator-sheet.mjs");
      await openOperatorSkillChoices(actor);
    })
  });
}

function previewContent(plan) {
  const updates = Object.entries(plan.actorUpdates).map(([path, value]) => `<li>${esc(path)} → ${esc(JSON.stringify(value))}</li>`).join("");
  const itemRows = [...plan.createItems.map(item => `Add ${item.name}`), ...plan.updateItems.map(item => `Update ${item._id}`)].map(row => `<li>${esc(row)}</li>`).join("");
  return `<section class="ak5e-marksman-progression-preview"><h3>Character updates</h3><ul>${updates || "<li>No system-field changes</li>"}</ul><h3>Items</h3><ul>${itemRows || "<li>No item changes</li>"}</ul>${plan.pending.length ? `<p role="alert">Choices still needed: ${esc(plan.pending.join(", "))}</p>` : ""}${plan.warnings.length ? `<h3>Review notes</h3><ul>${plan.warnings.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}<label><input name="confirm" type="checkbox"> I reviewed and confirm these exact changes.</label></section>`;
}

async function previewDialog(actor, plan) {
  return foundry.applications.api.DialogV2.wait({ window: { title: `Review Marksman progression — ${actor.name}` }, position: { width: 680 }, rejectClose: false,
    content: previewContent(plan), buttons: [
      { action: "apply", label: "Apply progression", default: true, callback: (_event, button) => button.form.elements.confirm?.checked === true },
      { action: "edit", label: "Edit choices", callback: () => "edit" },
      { action: "cancel", label: "Cancel", callback: () => null }
    ]
  });
}

/** Owner-facing, previewed character progression. It never rolls dice or writes before confirmation. */
export async function openMarksmanProgression(actor) {
  if (!actor?.isOwner || actor?.type !== "character" || actor.pack) throw new Error("Open Marksman progression on a live character you own.");
  let choices = {}, error = "";
  for (;;) {
    const view = marksmanProgressionChoices(actor, choices);
    if (!view.applicable) throw new Error("Attach the Marksman class before opening Marksman progression.");
    const selected = await choiceDialog(actor, view, error);
    error = "";
    if (!selected || typeof selected !== "object") return null;
    choices = selected;
    const plan = await previewMarksmanProgression(actor, choices);
    const decision = await previewDialog(actor, plan);
    if (decision === "edit") continue;
    if (decision !== true) return null;
    if (plan.pending.length) { error = `Complete every required choice: ${plan.pending.join(", ")}.`; continue; }
    return applyMarksmanProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: plan.choices });
  }
}
