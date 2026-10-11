import { casterLevel, casterBranch, casterState, standardPools } from "./caster-rules.mjs";
import { coreDamageTypes } from "./caster-casting.mjs";
import { previewCasterSetup, applyCasterSetup, getCasterSetupChoices, configureCasterMapping, casterScalarRecords } from "./caster-setup.mjs";
import { getCasterView, casterCommand, castCasterArt, recordCasterRuling, syncCasterDrones, PRIMAL_CONDITIONS, PRIMAL_CONDITION_NAMES, SPARK_EFFECTS, CHAIN_READINGS, MECH_READINGS, requestCasterDrone } from "./caster-features.mjs";
import { previewUndo } from "./caster-primal-splash.mjs";
import { isPlayWarnings, isPlayReading, isLocked } from "./play-undo.mjs";

const active = new Set();
let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const entries = value => {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value[Symbol.iterator] === "function") return Array.from(value);
  if (typeof value === "object") return Object.values(value);
  return [];
};
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const keyText = key => {
  const path = `AK5E.Caster.${key}`, localized = game.i18n?.localize?.(path);
  if (localized && localized !== path) return localized;
  return ({
    Title: "Caster", Setup: "Caster setup", Update: "Review or update Caster", Open: "Open Caster controls",
    Apply: "Apply setup", Confirm: "I reviewed this setup and want to apply it", Cancel: "Cancel", Continue: "Continue",
    Cast: "Cast an Art", Art: "Art", Level: "Cast level", Mode: "Casting mode", Normal: "Normal", Ritual: "Ritual",
    Manual: "Manual procedure", Learned: "Learned Arts", Branch: "Branch features", Features: "Caster features",
    History: "Recent Caster activity", Pending: "Needs review", Rulings: "GM rulings", SaveRuling: "Record ruling",
    Source: "Source / reason", Value: "Ruling", Target: "Target", AP: "Arts Points", Charge: "Mystic Charge",
    NoArt: "No eligible Arts are currently available.", NoControls: "Caster controls are unavailable for this Actor.",
    Visibility: "Owners control their Caster and drones. GM-only setup and rulings are shown to GMs.",
    ActionEconomy: "Track Action, Bonus Action, Reaction, rest completion, visibility, and target eligibility manually.",
    RestAction: "Complete the full rest while performing this Rest Action. Only one Rest Action can be performed at a time.",
    SetupPreview: "Preview changes", Mapping: "Resolve Art mapping", SaveMapping: "Save reviewed mapping",
    HP: "Hit Points per new level", Fixed: "Fixed (4)", Rolled: "Rolled die", Choices: "Character choices",
    Missing: "Missing Art mappings", Warnings: "Review notes", CreateDrone: "Create or link Arts Master",
    SyncDrones: "Refresh Arts Master links", CommandDrone: "Command Arts Masters", SourceCheck: "Confirm source requirements",
    DamageReview: "I reviewed the damage and outcome from the roll", Choose: "Choose", None: "None", Submit: "Confirm",
    Reconcile: "Reviewed recovery", ReconcileReason: "Reason for GM reconciliation", Components: "Destroyed components retained",
    Stationary: "I remained stationary for the full minute", Concentration: "I maintained concentration for the full minute",
    Minute: "The full minute was completed", RestComplete: "I completed this Rest Action", Visible: "The drone is visible and within 100 feet",
    Equipment: "Starting equipment", Cash: "1300 LMD", ItemSet: "Starting items", Empowered: "Apply Empowered Arts once this Turn",
    SignatureReroll: "Use Savant eligible die rerolls", Maverick: "Maverick damage type", DroneOrigin: "Cast from drone space",
    Gain: "No actions are applied while opening this panel.", Save: "Save", Close: "Close", Residual: "Residual Suffering",
    Overwhelm: "Overwhelming Detonation: additional AP (0 for none)", SafeZone: "Safe Zone: Creatures that automatically succeed",
    AllConsuming: "All-Consuming: Disadvantage on Saving Throws against this Art this Turn (once per Short Rest)"
  }[key] ?? key);
};
const safe = fn => Promise.resolve().then(fn).catch(error => {
  console.error("AK5e | Caster UI", error);
  ui.notifications.error(error?.message ?? String(error));
});
const docNode = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = String(text); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = docNode("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const assertOwner = actor => { if (!(actor?.isOwner || game.user?.isGM) || actor.type !== "character") throw new Error("Open Caster controls on a character you own."); };
const sourceId = option => typeof option === "string" ? option : String(option?.sourceId ?? option?.id ?? option?.value ?? option?.uuid ?? "");
const optionLabel = option => typeof option === "string" ? option : String(option?.label ?? option?.name ?? option?.title ?? sourceId(option));
const optionPairs = options => entries(options).map(option => [sourceId(option), optionLabel(option)]).filter(([value]) => value);
const operationId = () => foundry.utils.randomID();
const valueFor = option => typeof option === "object" && option !== null && Object.hasOwn(option, "value") ? option.value : option;
const formValue = value => { try { return JSON.parse(value); } catch { return value; } };

function pairsFor(key, choices) {
  if (Array.isArray(choices?.[key])) return optionPairs(choices[key]);
  if (key === "branch") return ["Core", "Mystic", "Mech-Accord", "Primal", "Splash", "Chain"].map(name => {
    const entry = entries(choices?.branches ?? casterBranch.catalogue ?? []).find(item => item.name === name || item.branch === name);
    return [sourceId(entry) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name];
  });
  if (key === "pools" || key.startsWith("pools.")) return entries(standardPools).map(pool => [sourceId(pool), optionLabel(pool)]);
  if (key === "ability" || key.startsWith("asi.")) return [["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
  if (key === "saves") return [["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
  if (key === "skills") return [["arc", "Arts"], ["ak5elore", "Lore"], ["inv", "Investigation"], ["ak5etech", "Tech"], ["ins", "Insight"], ["prc", "Perception"]];
  if (key === "hp") return [["fixed", keyText("Fixed")], ["rolled", keyText("Rolled")]];
  return [];
}

function selectedValues(form, name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(input => formValue(input.value));
}
function setPath(root, path, value) {
  const parts = path.split("."), last = parts.pop(); let current = root;
  for (const part of parts) current = current[part] ??= {};
  current[last] = value;
}
function setupFields(setup) {
  const pending = entries(setup?.pending ?? setup?.choices?.pending ?? setup?.choices).filter(field => field && typeof field === "object" && field.key && field.label);
  return pending;
}
function setupStage(pending, choices) {
  const rows = entries(pending), keys = new Set(rows.map(field => field.key));
  const selectKeys = (...wanted) => rows.filter(field => wanted.includes(field.key));
  if (keys.has("branch") && !choices.branch) return selectKeys("branch");
  const base = selectKeys("ability", "pools", "saves", "skills", "tool", "startingEquipment.mode");
  if (base.length) return base;
  if (choices.startingEquipment?.mode === "items") {
    const equipment = rows.filter(field => field.key.startsWith("startingEquipment."));
    if (equipment.length) return equipment;
  }
  if (keys.has("castingUnit")) return selectKeys("castingUnit");
  if (keys.has("talents.basic")) return selectKeys("talents.basic");
  if (keys.has("talents.basicAt8")) return selectKeys("talents.basicAt8");
  if (keys.has("talents.advanced")) return selectKeys("talents.advanced");
  if (keys.has("talents.advancedAt13")) return selectKeys("talents.advancedAt13");
  const classOptions = rows.filter(field => field.key.startsWith("mechExchange."));
  const progression = rows.filter(field => field.key.startsWith("asi.") || field.key.startsWith("hp."));
  if (classOptions.length || progression.length) return [...classOptions, ...progression];
  return rows;
}
function renderSetupField(field, choices) {
  const key = String(field.key), name = key;
  const rawOptions = entries(field.options ?? choices?.[key]?.options ?? []);
  let options = rawOptions.map(option => ({ value: valueFor(option), label: optionLabel(option) }));
  if (!options.length) options = pairsFor(key, choices).map(([value, label]) => ({ value, label }));
  if (key.startsWith("hp.")) {
    const level = key.split(".")[1];
    const hpModes = [...new Map(options.map(option => [typeof option.value === "object" ? option.value.mode : option.value, option.label])).entries()];
    return `<fieldset class="ak5e-caster-choice"><legend>${esc(field.label)} — Caster Level ${esc(level)}</legend>${inputMarkup(`hp-mode-${level}`, "Hit Point method", { type: "select", options: [["", keyText("Choose")], ...hpModes] })}${Number(level) === 1 ? "" : inputMarkup(`hp-roll-${level}`, "Hit Die result (if rolled)", { type: "number", min: 1, max: 6, step: 1 })}</fieldset>`;
  }
  const count = Math.max(1, Number(field.count ?? 1)), selected = Array.isArray(field.selected) ? field.selected.map(sourceId) : field.selected ? [sourceId(field.selected)] : [];
  const multi = count > 1 || ["pools", "saves", "skills"].includes(key) || key.startsWith("pools.");
  const fieldset = docNode("fieldset", null, "ak5e-caster-choice");
  fieldset.append(docNode("legend", `${field.label}${multi ? ` — choose ${count}` : ""}`));
  const wrap = docNode("div", null, "ak5e-caster-options");
  for (const option of options) {
    const value = typeof option.value === "object" ? JSON.stringify(option.value) : String(option.value);
    const labelNode = docNode("label"), input = docNode("input");
    input.type = multi ? "checkbox" : "radio"; input.name = name; input.value = value;
    const selectedOption = field.selected != null && JSON.stringify(field.selected) === JSON.stringify(option.value);
    input.checked = selectedOption || (Array.isArray(field.selected) && field.selected.some(value => JSON.stringify(value) === JSON.stringify(option.value)));
    labelNode.append(input, docNode("span", option.label)); wrap.append(labelNode);
  }
  if (!options.length) fieldset.append(docNode("p", "No eligible choices are available. The setup cannot be applied until the source choices are available."));
  else fieldset.append(wrap);
  if (field.requiredAt != null) fieldset.append(docNode("small", `Available at Caster Level ${field.requiredAt}.`));
  return fieldset.outerHTML;
}
function collectSetup(form, setup) {
  const choices = structuredClone(setup?.choices ?? {});
  delete choices.summary;
  for (const field of setupFields(setup)) {
    if (String(field.key).startsWith("hp.")) {
      const level = String(field.key).split(".")[1], mode = form.elements.namedItem(`hp-mode-${level}`)?.value;
      if (mode) {
        const roll = mode === "existing" ? 0 : Number(level) === 1 ? 6 : mode === "fixed" ? 4 : Number(form.elements.namedItem(`hp-roll-${level}`)?.value);
        setPath(choices, field.key, { mode, roll });
      }
      continue;
    }
    const values = selectedValues(form, field.key);
    const multi = Number(field.count ?? 1) > 1 || ["pools", "saves", "skills"].includes(field.key) || field.key.startsWith("pools.");
    const selected = form.elements.namedItem(field.key)?.value;
    setPath(choices, field.key, multi ? values : (selected ? formValue(selected) : values[0] ?? ""));
  }
  return choices;
}

function inputMarkup(name, label, { type = "text", value = "", min, max, step, required = false, options = [] } = {}) {
  const selectOptions = type === "select" && !options.some(([option]) => String(option) === "")
    ? [["", keyText("Choose")], ...options] : options;
  const control = type === "select"
    ? `<select name="${esc(name)}">${selectOptions.map(([v, text]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(text)}</option>`).join("")}</select>`
    : `<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}"${min != null ? ` min="${esc(min)}"` : ""}${max != null ? ` max="${esc(max)}"` : ""}${step != null ? ` step="${esc(step)}"` : ""}${required ? " required" : ""}>`;
  return `<label class="ak5e-caster-field"><span>${esc(label)}</span>${control}</label>`;
}
function checkMarkup(name, label, { required = false } = {}) {
  return `<label class="ak5e-caster-check"><input name="${esc(name)}" type="checkbox"${required ? " required" : ""}><span>${esc(label)}</span></label>`;
}
async function dialog(title, content, buttons, { width = 680, onRender } = {}) {
  let closed = Promise.resolve();
  const result = await foundry.applications.api.DialogV2.wait({ window: { title }, position: { width }, classes: ["ak5e-caster-dialog"], rejectClose: false,
    content: `<section class="ak5e-caster-dialog-content">${content}</section>`, buttons,
    render: (_event, app) => { closed = new Promise(resolve => app.addEventListener("close", resolve, { once: true })); onRender?.(app); } });
  await closed;
  // DialogV2 substitutes the button's action name when its callback returns null; a cancel/skip is not a submission.
  return typeof result === "string" && buttons.some(entry => entry.action === result) ? null : result;
}
function showList(title, values) {
  const rows = entries(values);
  return rows.length ? `<h3>${esc(title)}</h3><ul>${rows.map(value => `<li>${esc(typeof value === "string" ? value : value?.label ?? value?.name ?? JSON.stringify(value))}</li>`).join("")}</ul>` : "";
}

function cleanSetupChoices(choices = {}) { const result = structuredClone(choices); delete result.summary; return result; }
async function chooseSetupStage(actor, fields, choices, current) {
  const content = `<h2>${esc(keyText("Choices"))}</h2><p>Choices stay local until the final preview is confirmed. Cancelling any step applies nothing.</p>${fields.map(field => renderSetupField(field, current)).join("")}${checkMarkup("sourceConfirmed", keyText("SourceCheck"), { required: true })}`;
  const submitted = await dialog(`${keyText("Setup")} — ${actor.name}`, content, [
    { action: "continue", label: keyText("Continue"), default: true, callback: (_event, button) => {
      try { validateSetupStage(button.form, fields); return collectSetup(button.form, { choices, pending: fields }); }
      catch (error) { ui.notifications.warn(error.message); return false; }
    } }, { action: "cancel", label: keyText("Cancel"), callback: () => null }
  ]);
  return submitted ? cleanSetupChoices(submitted) : null;
}
function validateSetupStage(form, fields) {
  if (!form.elements.sourceConfirmed?.checked) throw new Error("Confirm the source choices before continuing.");
  for (const field of fields) {
    if (field.key.startsWith("hp.")) {
      const level = field.key.split(".")[1], mode = form.elements.namedItem(`hp-mode-${level}`)?.value, roll = Number(form.elements.namedItem(`hp-roll-${level}`)?.value);
      if (!mode || (mode === "rolled" && (!Number.isSafeInteger(roll) || roll < 1 || roll > 6))) throw new Error(`Choose valid Hit Points for Caster Level ${level}.`);
      continue;
    }
    const count = Math.max(1, Number(field.count ?? 1)), values = selectedValues(form, field.key);
    if (values.length !== count) throw new Error(`Choose exactly ${count} option${count === 1 ? "" : "s"} for ${field.label}.`);
  }
}
function previewSummary(preview, choices) {
  const addedItems = entries(preview.createItems).map(item => `Add ${item.name ?? "managed Caster Item"}`);
  const updatedItems = entries(preview.updateItems).map(item => `Update ${item.item?.name ?? item.name ?? "managed Caster Item"}`);
  const addedEffects = entries(preview.createEffects).map(effect => `Add ${effect.name ?? "managed effect"}`);
  const updatedEffects = entries(preview.updateEffects).map(update => {
    const name = update.effect?.name ?? "managed effect", changes = update.changes ?? {};
    if (changes.disabled === true) return `Disable ${name} because it is no longer eligible; review the effect and its preserved changes.`;
    if (changes.disabled === false) return `Re-enable ${name} for the selected eligible branch and level.`;
    return `Update ${name} to match the selected source features; customized changes require review.`;
  });
  const scalarChanges = [];
  const progression = Object.fromEntries(casterScalarRecords(preview.progression?.scalarPlan).map(scalar=>[scalar.path,scalar]));
  const hp = progression["system.attributes.hp.max"];
  if (hp && hp.before !== hp.after) scalarChanges.push(`Hit Point maximum ${hp.before} → ${hp.after}; current Hit Points are preserved.`);
  const abilityNames = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  for (const [path, value] of Object.entries(progression)) {
    const ability = path.match(/^system\.abilities\.(str|dex|con|int|wis|cha)\.value$/)?.[1];
    if (ability && value.before !== value.after) scalarChanges.push(`${abilityNames[ability]} ${value.before} → ${value.after}.`);
  }
  const setupNotes = [
    `${choices.ability?.toUpperCase() ?? "Spellcasting ability not selected"}; ${entries(choices.pools).length} Standard Arts Pool(s).`,
    choices.startingEquipment?.mode === "cash" ? "Starting funds: 1300 LMD." : choices.startingEquipment?.mode === "items" ? "Starting equipment choices are included in the managed Items list." : "Starting equipment choice pending.",
    "The current AP balance and spent resource uses are preserved."
  ];
  const missing = entries(preview.missing).map(entry => `${entry.name ?? entry.label ?? "Source entry"}${entry.reason ? ` — ${entry.reason}` : ""}${entry.expectedLevel != null ? ` (expected level ${entry.expectedLevel})` : ""}`);
  return `<h2>${esc(keyText("SetupPreview"))}</h2>${showList("Setup", [...entries(preview.summary), ...setupNotes])}${showList("Items to add", addedItems)}${showList("Items to update", updatedItems)}${showList("Effects to add", addedEffects)}${showList("Effects to update", updatedEffects)}${showList("Character progression", scalarChanges)}${showList(keyText("Missing"), missing)}${showList(keyText("Warnings"), preview.warnings)}${preview.missing?.length ? "<p>Unresolved required source mappings must be reviewed before applying setup.</p>" : ""}`;
}
async function reviewPreview(actor, preview, choices, setupOperationId) {
  const needsMapping = entries(preview.missing).some(entry => entry.kind === "mapping");
  const hasUnresolved = entries(preview.missing).length > 0 || entries(preview.pending).length > 0 || entries(preview.blocked).length > 0;
  const content = `${previewSummary(preview, choices)}${hasUnresolved ? "" : checkMarkup("confirmed", keyText("Confirm"), { required: true })}`;
  const buttons = [];
  if (needsMapping && game.user.isGM) buttons.push({ action: "mappings", label: "Review missing Art mappings", default: true, callback: () => "mappings" });
  if (!hasUnresolved) buttons.push({ action: "apply", label: keyText("Apply"), default: !needsMapping, callback: (_event, button) => {
    if (!button.form.elements.confirmed?.checked) { ui.notifications.warn("Review and confirm the setup preview before applying it."); return false; }
    return "apply";
  } });
  buttons.push({ action: "cancel", label: keyText("Cancel"), callback: () => null });
  const result = await dialog(`${keyText("SetupPreview")} — ${actor.name}`, content, buttons);
  if (result === "mappings") {
    const mappings = await openMappings(actor, preview);
    if (mappings?.saved) return "refresh";
    await dialog("Caster setup remains unapplied", `${previewSummary(preview, choices)}<p>No Art mapping was saved. Resolve the mapping through GM review, then reopen setup to preview the retained choices again.</p>`, [
      { action: "close", label: keyText("Close"), default: true, callback: () => true }
    ]);
    return { status: "needs-review", operationId: setupOperationId, unresolved: mappings?.unresolved ?? entries(preview.missing).length };
  }
  if (result !== "apply") return null;

  let fresh = preview;
  while (true) {
    try {
      const receipt = await applyCasterSetup(actor, { choices, contextKey: fresh.contextKey, confirmed: true, operationId: setupOperationId });
      await dialog("Caster setup applied", `<p>Caster setup completed. Operation receipt: <code>${esc(receipt.operationId)}</code>.</p><p>If the client lost contact during this operation, retry setup with this same operation ID or ask the GM to review the Actor's Caster setup receipt before reconciling.</p>`, [
        { action: "close", label: keyText("Close"), default: true, callback: () => true }
      ]);
      return receipt;
    } catch (error) {
      ui.notifications.error(error?.message ?? String(error));
      fresh = await previewCasterSetup(actor, { choices, operationId: setupOperationId });
      const retryContent = `<p>The setup operation did not complete: ${esc(error?.message ?? error)}.</p><p>Operation receipt: <code>${esc(setupOperationId)}</code>. Review the same Actor choices and retry with this same ID so completed grants are not duplicated. If its receipt cannot be safely resumed, a GM must reconcile it.</p>${checkMarkup("retryConfirmed", "I reviewed the receipt and want to retry this same operation", { required: true })}`;
      const retry = await dialog("Caster setup recovery", retryContent, [
        { action: "retry", label: "Retry same operation", default: false, callback: (_event, button) => button.form.elements.retryConfirmed?.checked ? true : false },
        { action: "cancel", label: keyText("Close"), callback: () => null }
      ]);
      if (!retry) return { operationId: setupOperationId, status: "needs-review", error: error.message };
      if (fresh.pending?.length || fresh.blocked?.length || fresh.missing?.length) {
        await dialog("Caster setup needs GM review", `${previewSummary(fresh, choices)}<p>Operation receipt: <code>${esc(setupOperationId)}</code>. Keep this ID and ask the GM to review the recorded setup operation; no new operation was started.</p>`, [
          { action: "close", label: keyText("Close"), default: true, callback: () => true }
        ]);
        return { operationId: setupOperationId, status: "needs-review", error: fresh.pending?.[0]?.label ?? error.message };
      }
    }
  }
}

export async function openCasterSetup(actor, resume = {}) {
  assertOwner(actor);
  let current = await getCasterSetupChoices(actor);
  if (current.blocked?.length) throw new Error(entries(current.blocked).map(value => typeof value === "string" ? value : value.message ?? value.label).join(" "));
  let choices = cleanSetupChoices(current.choices);
  const setupOperationId = resume.operationId ?? operationId();
  if (resume.choices) choices = cleanSetupChoices(resume.choices);
  for (let step = 0; step < 32; step++) {
    current = await getCasterSetupChoices(actor, { choices });
    if (current.blocked?.length) throw new Error(entries(current.blocked).map(value => typeof value === "string" ? value : value.message ?? value.label).join(" "));
    choices = cleanSetupChoices(current.choices ?? choices);
    const pending = setupFields(current);
    if (pending.length) {
      const fields = setupStage(pending, choices);
      const submitted = await chooseSetupStage(actor, fields, choices, current);
      if (!submitted) return null;
      choices = submitted;
      continue;
    }

    const preview = await previewCasterSetup(actor, { choices, operationId: setupOperationId });
    if (preview.pending?.length) {
      const actionable = setupStage(preview.pending, choices);
      if (actionable.length && actionable.every(field => field.options?.length)) {
        const submitted = await chooseSetupStage(actor, actionable, choices, preview);
        if (!submitted) return null;
        choices = submitted;
        continue;
      }
      await dialog("Caster setup requires review", `${previewSummary(preview, choices)}<p>Setup remains unapplied. Resolve these issues in the listed Actor choices or ask a GM to review progression recovery.</p>`, [
        { action: "close", label: keyText("Close"), default: true, callback: () => true }
      ]);
      return { status: "needs-review", operationId: setupOperationId };
    }
    const result = await reviewPreview(actor, preview, choices, setupOperationId);
    if (result === "refresh") continue;
    return result;
  }
  throw new Error("Caster setup has too many dependent choice stages; no changes were applied.");
}

/** "Cantrip", "1st level", "2nd level", "3rd level", "4th level" … */
function artLevelLabel(level) {
  const n = Number(level);
  return n === 0 ? "Cantrip" : `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n] ?? "th"} level`;
}
const ART_LEVELS = Array.from({ length: 10 }, (_, level) => [String(level), artLevelLabel(level)]);
function arts(view, actor) {
  const owned = entries(actor?.items).filter(item => item.type === "spell" && flag(item, "art")?.enabled !== false)
    .map(item => ({ id: item.id, name: item.name, level: Number(item.system?.level ?? 0), uuid: item.uuid,
      source: flag(item, "sourceHeading") ?? flag(item, "chapterFiveId") ?? (flag(item, "casterBorrowed") ? "Rabbit from the Hat" : "Actor-owned Art"),
      castingTime: entries(item.system?.activities).find(activity => activity.activation?.type === "action") ? "Action" : "" }));
  return owned.length ? owned : entries(view?.arts ?? []).map(value => ({ id: value.id ?? value.itemId ?? value._id, name: value.name, level: Number(value.level ?? value.system?.level ?? 0), uuid: value.uuid, source: value.source ?? "learned", castingTime: value.castingTime })).filter(value => value.id && value.name);
}
function pools() { return entries(standardPools).map(pool => ({ id: sourceId(pool), name: optionLabel(pool), members: entries(pool.members) })); }
function controlsForBranch(branch) {
  const value = String(branch ?? "").toLowerCase();
  if (value.includes("core")) return [
    ["rabbit", "Rabbit from the Hat"], ["powerWithin", "Power from Within"], ["signature", "Choose Savant Signature Art"],
    ["signatureDice", "Review Savant dice"], ["damage", "Apply reviewed Art damage"], ["empower", "Empowered Arts"], ["unending", "Review Unending refund"], ["doublecast", "Doublecast"]
  ];
  if (value.includes("mystic")) return [
    ["beginRitual", "Begin Mystic charging ritual"], ["finishRitual", "Complete Mystic charging ritual"], ["cancelRitual", "Cancel interrupted ritual"],
    ["burst", "Mystic Charge burst"], ["nextBurst", "Resolve next cantrip use"], ["potent", "Potent Cantrip outcome"]
  ];
  if (value.includes("mech")) return [
    ["createDrone", keyText("CreateDrone")], ["syncDrones", keyText("SyncDrones")], ["commandDrones", "Command Arts Masters"], ["juryRig", "Jury Rigging"],
    ["wolfpack", "Wolfpack Doctrine reaction"], ["duplicate", "Cantrip Duplication"], ["deathAbove", "Death from Above"], ["rebuild", "Rebuild destroyed Arts Master"],
    ["residualReading", "Residual Energy: choose a reading"]
  ];
  if (value.includes("primal")) return [
    ["residual", "Residual Suffering"], ["debilitate", "Debilitate and Destroy"], ["elementalBurst", "Elemental Burst"], ["burstCondition", "Elemental Burst: apply Condition"]
  ];
  if (value.includes("splash")) return [["splashCantrip", "Splashing Cantrips"], ["damage", "Apply reviewed area Damage"]];
  if (value.includes("chain")) return [["spark", "Subtle Spark"], ["sparkCondition", "Subtle Spark: apply to a failed save"]];
  return [];
}
function availableControls(branch, level, state = {}) {
  // Primal, Splash, Chain and Mech-Accord features stay visible at any level; their level is a warning at use (WORKFLOW.md §3.2).
  const required = { powerWithin: 3, empower: 6, signature: 15, signatureDice: 15, damage: String(branch).includes("splash") ? 1 : 15, unending: 18, doublecast: 20, potent: 3 };
  return controlsForBranch(branch).filter(([action]) => level >= (required[action] ?? 1) &&
    !(action === "residualReading" && (!(state.residual?.active && state.residual.amounts?.length > 1) || state.rulings?.residualStacking)) &&
    !(action === "signatureDice" && !state.signature) && !(action === "burstCondition" && !state.primal?.burst) &&
    !(action === "sparkCondition" && !(state.chain?.sparks ?? []).some(spark => spark.save)));
}
function manualRows(view) {
  const rows = entries(view?.manual);
  return [...rows, keyText("ActionEconomy"), keyText("RestAction")];
}
function appendControls(panel, actor, view) {
  const top = docNode("div", null, "ak5e-caster-summary");
  const level = Number(view?.profile?.level ?? view?.level ?? casterLevel(actor) ?? 0);
  const state = view?.state ?? casterState(actor) ?? {};
  top.append(docNode("strong", `${keyText("Title")} ${level ? `— Level ${level}` : ""}`));
  if (view?.ap) top.append(docNode("span", `${keyText("AP")}: ${view.ap.value ?? view.ap.current ?? 0} / ${view.ap.maximum ?? view.ap.max ?? 0}`));
  if (view?.charge) top.append(docNode("span", `${keyText("Charge")}: ${view.charge.value ?? 0} / ${view.charge.max ?? 0}`));
  if (view?.residual) top.append(docNode("span", `${keyText("Residual")}: ${view.residual.value ?? 0} / ${view.residual.max ?? 0}`));
  if (view?.chain) top.append(docNode("span", `Chain Art: ${view.chain.chainArt.value} / ${view.chain.chainArt.max} · Sparks: ${view.chain.sparks.value} / ${view.chain.sparks.max}`));
  panel.append(top, docNode("p", keyText("Visibility"), "ak5e-caster-note"));
  const owner = actor.isOwner, branch = view?.profile?.branch ?? view?.branch ?? casterBranch(actor);
  if (owner) panel.append(button(keyText("Cast"), () => openCast(actor, view), "ak5e-caster-main-button"));
    if (owner) for (const [command, label] of availableControls(branch, level, view?.state)) {
    panel.append(button(label, () => openCommand(actor, view, command), "ak5e-caster-command"));
  }
  if (owner) panel.append(button(keyText("Update"), () => openCasterSetup(actor), "ak5e-caster-setup-button"));
  panel.append(docNode("p", keyText("ActionEconomy"), "ak5e-caster-manual"));
  const learned = arts(view, actor);
  if (learned.length) {
    const section = docNode("details", null, "ak5e-caster-learned");
    const summary = docNode("summary", keyText("Learned")); section.append(summary);
    const list = docNode("ul");
    for (const art of learned) { const row = docNode("li", `${art.name} — ${artLevelLabel(art.level)} · ${art.source}`); list.append(row); }
    section.append(list); panel.append(section);
  }
  const history = entries(view?.casts).concat(entries(view?.spends)).slice(-12);
  if (history.length) panel.append(htmlSection(keyText("History"), history.map(entry => `${entry.kind ?? entry.event ?? "Activity"}: ${entry.summary ?? entry.artName ?? entry.amount ?? entry.status ?? "recorded"}${entry.status === "prepared" ? " — recovery review required" : ""}`)));
  const pending = entries(view?.pending);
  if (pending.length) {
    panel.append(htmlSection(keyText("Pending"), pending.map(entry => `${entry.label ?? entry.kind ?? "Operation"}: ${entry.status ?? "needs review"} (${entry.operationId ?? entry.id ?? "receipt retained"})`)));
    if (owner && game.user.isGM) for (const entry of pending) panel.append(button(`Review recovery ${entry.operationId ?? entry.id ?? "operation"}`, () => openCommand(actor, view, "reconcile", entry), "ak5e-caster-gm-button"));
  }
  if (owner && game.user.isGM) panel.append(button(keyText("Rulings"), () => openRuling(actor), "ak5e-caster-gm-button"));
  if (!owner && actor.limited && !game.user.isGM) return null;
  return panel;
}
function htmlSection(title, rows) {
  const section = docNode("details", null, "ak5e-caster-history"), summary = docNode("summary", title), list = docNode("ul");
  section.append(summary); for (const row of rows) list.append(docNode("li", row)); section.append(list); return section;
}

async function openCast(actor, view) {
  assertOwner(actor);
  const list = arts(view, actor), coreTypes = coreDamageTypes(casterState(actor).pools);
  const level = Number(casterLevel(actor) ?? 0), splash = casterBranch(actor) === "splash", prof = Number(actor.system?.attributes?.prof ?? 0);
  const targets = entries(game.user?.targets).map(token => [token.actor?.uuid, token.name ?? token.actor?.name ?? "Target"]).filter(([uuid]) => uuid);
  const tokenTargets = entries(game.user?.targets).map(token => [token.document?.uuid ?? token.uuid, token.name ?? token.actor?.name ?? "Target"]).filter(([uuid]) => uuid);
  const chainFields = casterBranch(actor) !== "chain" ? "" : `<fieldset><legend>Chain Art (${esc(view?.chain?.chainArt?.value ?? 0)} use(s) left)</legend>${inputMarkup("chainMode", "Chain Art option", { type: "select", value: "none", options: [["none", keyText("None")], ["chain", `Chain to up to ${level >= 15 ? 3 : 2} other Creatures within 15 feet`], ["ouroboros", "Ouroboros: Disadvantage on Saving Throws against this Art this Turn (level 6)"]] })}${inputMarkup("chainOriginal", "Original target", { type: "select", options: [["", keyText("Choose")], ...tokenTargets] })}<p>Chain to:</p>${tokenTargets.map(([uuid, label]) => `<label class="ak5e-caster-check"><input name="chainTo" type="checkbox" value="${esc(uuid)}"><span>${esc(label)}</span></label>`).join("") || "<p>Target the original and chained Creatures on the map before opening this form.</p>"}${checkMarkup("chainSingle", "This Art can only affect a single Creature (Ch.3 L465)")}</fieldset>`;
  const splashFields = !splash || level < 6 ? "" : `${inputMarkup("overwhelm", keyText("Overwhelm"), { type: "number", min: 0, max: 2 * prof, step: 1, value: 0 })}<fieldset><legend>${esc(keyText("SafeZone"))}</legend>${targets.map(([uuid, label]) => `<label class="ak5e-caster-check"><input name="safeZone" type="checkbox" value="${esc(uuid)}"><span>${esc(label)}</span></label>`).join("") || "<p>Target Creatures on the map to choose Safe Zone Creatures (up to 1 + the cast level).</p>"}</fieldset>${level >= 15 ? checkMarkup("allConsuming", keyText("AllConsuming")) : ""}`;
  const damageNames = { acid: "Acid", cold: "Cold", fire: "Fire", force: "Force", lightning: "Lightning", necrotic: "Necrotic", poison: "Poison", psychic: "Psychic", radiant: "Radiant", thunder: "Thunder", bludgeoning: "Bludgeoning", piercing: "Piercing", slashing: "Slashing" };
  const content = `<p>Confirm the Art, cast level, and source requirements. The sheet will revalidate the choice when submitted.</p>${inputMarkup("itemId", keyText("Art"), { type: "select", required: true, options: list.map(art => [art.id, `${art.name} (${art.level === 0 ? "Cantrip" : `level ${art.level}`})`]) })}${inputMarkup("level", keyText("Level"), { type: "select", options: ART_LEVELS })}${inputMarkup("mode", keyText("Mode"), { type: "select", value: "ap", options: [["ap", keyText("Normal")], ["free", "Free (only when granted)"], ["ritual", keyText("Ritual")]] })}${inputMarkup("droneTokenUuid", keyText("DroneOrigin"), { type: "select", options: [["", keyText("None")], ...entries(view?.drones).flatMap(drone => entries(drone.tokens).map(token => [token.uuid, token.name]))] })}${checkMarkup("empowered", keyText("Empowered"))}${checkMarkup("signatureReroll", keyText("SignatureReroll"))}${inputMarkup("maverick", keyText("Maverick"), { type: "select", options: [["", keyText("None")], ...coreTypes.map(type => [type, damageNames[type] ?? type])] })}${splashFields}${chainFields}${checkMarkup("confirmed", keyText("SourceCheck"), { required: true })}`;
  const selection = await dialog(`${keyText("Cast")} — ${actor.name}`, content, [
    { action: "cast", label: keyText("Submit"), default: true, callback: (_event, button) => {
      const form = button.form; if (!form.elements.confirmed?.checked || !form.elements.itemId?.value) { ui.notifications.warn("Choose an Art and confirm its source requirements."); return false; }
      const level = Number(form.elements.level.value); if (!form.elements.level.value || !Number.isSafeInteger(level) || level < 0 || level > 9) { ui.notifications.warn("Choose an Art level from 0 to 9."); return false; }
      const overwhelm = Number(form.elements.overwhelm?.value || 0);
      if (!Number.isSafeInteger(overwhelm) || overwhelm < 0 || overwhelm > 2 * prof) { ui.notifications.warn(`Overwhelming Detonation allows 0 to ${2 * prof} additional AP.`); return false; }
      const safeZone = selectedValues(form, "safeZone").map(String), chainMode = form.elements.chainMode?.value || "none";
      if (chainMode !== "none" && !form.elements.chainOriginal?.value) { ui.notifications.warn("Choose the Art's original target for Chain Art or Ouroboros."); return false; }
      const chain = chainMode === "none" ? null : { mode: chainMode, originalTokenUuid: form.elements.chainOriginal.value,
        chainedTokenUuids: chainMode === "chain" ? selectedValues(form, "chainTo").map(String).filter(uuid => uuid !== form.elements.chainOriginal.value) : [], singleTarget: form.elements.chainSingle?.checked === true };
      return { itemId: form.elements.itemId.value, options: { level, mode: form.elements.mode.value, droneTokenUuid: form.elements.droneTokenUuid.value || undefined,
        empowered: form.elements.empowered.checked, signatureReroll: form.elements.signatureReroll.checked, maverick: form.elements.maverick.value || undefined,
        ...(overwhelm ? { overwhelm } : {}), ...(safeZone.length ? { safeZone } : {}), ...(form.elements.allConsuming?.checked ? { allConsuming: true } : {}), ...(chain ? { chain } : {}) } };
    } }, { action: "cancel", label: keyText("Cancel"), callback: () => null }
  ]);
  if (!selection) return null;
  const result = await confirmUse("Cast an Art", extra => castCasterArt(actor, selection.itemId, { ...selection.options, ...extra }));
  if (!result) return null;
  ui.notifications.info(`AK5e: ${result?.summary ?? "Art use recorded."}`); return result;
}

function actionSpecs(command, actor, view, extra = {}) {
  const dronePairs = entries(view?.drones).map(drone => [drone.uuid ?? drone.actorUuid, drone.name ?? drone.label ?? "Arts Master"]).filter(([id]) => id);
  const artList = arts(view, actor), artPairs = artList.map(art => [art.id, art.name]);
  const maximumArtLevel = Number(view?.state?.maximumArtLevel ?? view?.profile?.maximumArtLevel ?? view?.profile?.maxArtLevel ?? 9);
  const eligibleKnown = artList.filter(art => art.level <= 5);
  const spendPairs = entries(view?.spends).map(spend => [spend.id ?? spend.operationId, spend.summary ?? `${spend.amount ?? ""} AP spent`]).filter(([id]) => id);
  const tokenPairs = entries(view?.drones).flatMap(drone => entries(drone.tokens).map(token => [token.uuid, `${drone.name ?? "Arts Master"}: ${token.name}`]));
  const creatorDronePairs = entries(game.actors).filter(candidate => flag(candidate, "artsMaster")?.creatorUuid === actor.uuid).map(candidate => [candidate.uuid, candidate.name]);
  const scenePairs = entries(game.scenes).map(scene => [scene.id, scene.name]);
  const textField = (name, label, opts) => inputMarkup(name, label, opts);
  const select = (name, label, pairs, required = true) => textField(name, label, { type: "select", options: [["", keyText("Choose")], ...pairs], required });
  const confirmed = checkMarkup("confirmed", keyText("SourceCheck"), { required: true });
  const rest = checkMarkup("restCompleted", keyText("RestComplete"));
  const visible = checkMarkup("visible", keyText("Visible"));
  const droneChecks = `<fieldset><legend>${esc(keyText("Target"))}</legend>${tokenPairs.map(([uuid, label]) => `<label class="ak5e-caster-check"><input name="tokenUuids" type="checkbox" value="${esc(uuid)}"><span>${esc(label)}</span></label>`).join("") || "<p>No linked Arts Master tokens are visible.</p>"}</fieldset>`;
  const targetPairs = entries(game.user?.targets).map(token => [token.actor?.uuid, token.name ?? token.actor?.name ?? "Target"]).filter(([uuid]) => uuid);
  const castPairs = (filter = () => true) => entries(view?.casts).filter(entry => entry.completed !== false && filter(entry))
    .map(entry => [entry.id ?? entry.operationId, `${entry.name ?? "Art"} (${Number(entry.level) === 0 ? "Cantrip" : `level ${entry.level}`})`]);
  const conditionPairs = Object.entries(PRIMAL_CONDITION_NAMES);
  const damageTypes = Object.entries(PRIMAL_CONDITIONS).map(([type, status]) => [type, `${type[0].toUpperCase()}${type.slice(1)} → ${PRIMAL_CONDITION_NAMES[status]}`]);
  const branchLevel = Number(casterLevel(actor) ?? 0), splashBranch = casterBranch(actor) === "splash";
  const splashDamageFields = !splashBranch ? "" : `${textField("saveOutcome", "Area Art Saving Throw result", { type: "select", options: [["failed", "Failed"], ["succeeded", "Succeeded"], ["noSave", "This Art allows no Saving Throw"]] })}${textField("onSuccess", "On a successful Saving Throw this Art deals", { type: "select", options: [["half", "Half Damage"], ["none", "No Damage"]] })}${select("splashOf", "Or: Splashing Cantrips receipt", entries(view?.state?.splash).map(entry => [entry.castId, `Halved Damage ${entry.halved}, DC ${entry.dc}`]), false)}${textField("splashRole", "Splashing Cantrips: this Creature is", { type: "select", options: [["primary", "The original target"], ["failed", "Within 10 feet; failed the Saving Throw"], ["succeeded", "Within 10 feet; succeeded"]] })}<p>Leave the Splashing Cantrips receipt empty for an area Art. ${branchLevel >= 15 ? "Maximum Burst keeps Damage at no less than half the rolled total unless the target is immune." : ""}</p>`;
  switch (command) {
    case "rabbit": return `${select("poolArtName", keyText("Art"), pools().flatMap(pool => pool.members.filter(member => Number(member.level ?? member.system?.level ?? 0) <= maximumArtLevel).map(member => [member.name ?? member, `${pool.name}: ${member.name ?? member} (within current maximum level)`])))}${confirmed}`;
    case "powerWithin": return `${rest}${confirmed}`;
    case "signature": return `${select("itemId", keyText("Art"), eligibleKnown.map(art => [art.id, `${art.name} (Level ${art.level}; eligible up to level 5)`]))}${textField("damaging", "Can this Art deal Damage?", { type: "select", options: [["true", "Yes"], ["false", "No"]] })}${rest}${confirmed}`;
    case "signatureDice": return `${select("castId", "Cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Cast"]))}${textField("results", "Rolled damage dice results (comma separated)", { required: true })}${textField("faces", "Die faces", { type: "number", min: 2, max: 100, step: 1, value: 6 })}${textField("indices", "Dice positions to reroll (comma separated)", { required: true })}${confirmed}`;
    case "empower": return `${select("castId", "Cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Cast"]))}${confirmed}`;
    case "unending": return `${select("spendId", "AP spend receipt", spendPairs)}<p>The helper rolls the source d6 once and stores the result with the receipt. Review the result in Caster activity history.</p>${confirmed}`;
    case "doublecast": return `${select("castId", "First cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Cast"]))}${select("itemId", keyText("Art"), artPairs)}${textField("level", keyText("Level"), { type: "select", value: "0", options: ART_LEVELS })}${confirmed}`;
    case "beginRitual": return confirmed;
    case "finishRitual": return `${textField("ap", "Arts Points expended (0–3)", { type: "number", min: 0, max: 3, step: 1, required: true })}${checkMarkup("stationary", keyText("Stationary"))}${checkMarkup("concentration", keyText("Concentration"))}${checkMarkup("minuteCompleted", keyText("Minute"))}${confirmed}`;
    case "cancelRitual": return `${textField("reason", "Interruption reason", { required: true })}${confirmed}`;
    case "burst": return `${select("itemId", "Action cantrip (verify Casting Time is Action)", artList.filter(art => art.level === 0 && (!art.castingTime || /action/i.test(art.castingTime))).map(art => [art.id, `${art.name} (Cantrip)`]))}${confirmed}`;
    case "nextBurst": return confirmed;
    case "damage": return `${select("castId", "Art cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Art"]))}${select("targetUuid", keyText("Target"), targetPairs)}${textField("amount", "Final rolled damage before defenses", { type: "number", min: 0, max: 10000, step: 1, required: true })}${textField("type", "Damage type", { type: "select", options: Object.entries({ acid: "Acid", bludgeoning: "Bludgeoning", cold: "Cold", fire: "Fire", force: "Force", lightning: "Lightning", necrotic: "Necrotic", piercing: "Piercing", poison: "Poison", psychic: "Psychic", radiant: "Radiant", slashing: "Slashing", thunder: "Thunder" }) })}${textField("reduction", "Target Damage Reduction", { type: "number", min: 0, max: 10000, step: 1, required: true })}${checkMarkup("resistance", "Target has Resistance to this Damage Type")}${checkMarkup("vulnerability", "Target has Vulnerability to this Damage Type")}${checkMarkup("immunity", "Target has Immunity to this Damage Type")}${splashDamageFields}${checkMarkup("damageReviewed", keyText("DamageReview"), { required: true })}${confirmed}`;
    case "potent": return `${select("castId", "Cantrip cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Cantrip"]))}${textField("outcome", "Outcome", { type: "select", options: [["miss", "Attack missed"], ["save", "Target succeeded on save"]] })}${select("targetUuid", keyText("Target"), targetPairs)}${textField("amount", "Cantrip damage before applying half damage", { type: "number", min: 0, max: 10000, step: 1, required: true })}${textField("type", "Damage type", { type: "select", options: Object.entries({ acid: "Acid", bludgeoning: "Bludgeoning", cold: "Cold", fire: "Fire", force: "Force", lightning: "Lightning", necrotic: "Necrotic", piercing: "Piercing", poison: "Poison", psychic: "Psychic", radiant: "Radiant", slashing: "Slashing", thunder: "Thunder" }) })}${textField("reduction", "Target Damage Reduction", { type: "number", min: 0, max: 10000, step: 1, required: true })}${checkMarkup("resistance", "Target has Resistance to this Damage Type")}${checkMarkup("vulnerability", "Target has Vulnerability to this Damage Type")}${checkMarkup("immunity", "Target has Immunity to this Damage Type")}${checkMarkup("multiAttack", "This Cantrip has multiple attacks or damage instances")}${checkMarkup("damageReviewed", keyText("DamageReview"), { required: true })}${confirmed}`;
    case "createDrone": return `${select("mode", "Arts Master operation", [["create", "Create and place a new Arts Master"], ["link", "Link an existing Arts Master"]])}${select("droneUuid", "Existing Arts Master", creatorDronePairs, false)}${select("sceneId", "Scene for new Arts Master token", scenePairs, false)}${textField("x", "Placement X (scene coordinates)", { type: "number", step: 1 })}${textField("y", "Placement Y (scene coordinates)", { type: "number", step: 1 })}<p>New Actors are named from the Caster and receive the source statblock. Linking is limited to an Arts Master already created for this Caster. ${game.user?.isGM ? "" : "The GM's client creates or links it automatically; a GM must be connected. "}After linking, place its token through Foundry's normal token placement, then use “Refresh Arts Master links.”</p>${confirmed}`;
    case "syncDrones": return confirmed;
    case "commandDrones": return `${droneChecks}${textField("mode", "Command", { type: "select", options: [["move", "Move"], ["action", "Take one statblock Action"]] })}${textField("x", "Move destination X (scene coordinates)", { type: "number", step: 1 })}${textField("y", "Move destination Y (scene coordinates)", { type: "number", step: 1 })}${confirmed}`;
    case "juryRig": return `${select("droneUuid", keyText("Target"), dronePairs)}${textField("ap", "AP to spend (up to twice proficiency bonus)", { type: "number", min: 1, max: 12, step: 1, required: true })}${visible}${confirmed}`;
    case "wolfpack": return `${select("droneUuid", keyText("Target"), dronePairs)}${select("castId", "Qualifying Art receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Cast"]))}${visible}${confirmed}`;
    case "duplicate": return `${select("castId", "Cantrip cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Cantrip"]))}${select("droneTokenUuid", "Drone token", tokenPairs)}${checkMarkup("sameTargets", "The current target selection is the same Creature or area as the original cast")}${visible}${confirmed}`;
    case "deathAbove": return `${select("castId", "Action Art cast receipt", entries(view?.casts).map(entry => [entry.id ?? entry.operationId, entry.summary ?? entry.artName ?? "Art"]))}${select("droneTokenUuid", "Drone token", tokenPairs)}${confirmed}`;
    case "residual": return `${select("castId", "Art cast receipt", castPairs())}${select("targetUuid", keyText("Target"), targetPairs)}${textField("damageType", "Damage Type dealt by the Art", { type: "select", options: damageTypes })}${textField("outcome", "Qualifying result", { type: "select", options: [["hit", "Spell Attack hit"], ["failedSave", "Target failed its Saving Throw"], ...(branchLevel >= 15 ? [["succeededSave", "Target succeeded (Suffering Unmatched)"]] : [])] })}<p>Poison has no Residual Suffering row, so nothing is applied for Poison Damage.</p>${confirmed}`;
    case "debilitate": return `${select("targetUuid", keyText("Target"), entries(game.user?.targets).map(token => [token.actor?.uuid, `${token.name ?? token.actor?.name ?? "Target"}${token.actor?.statuses?.size ? ` — ${[...token.actor.statuses].join(", ")}` : " — no Conditions"}`]).filter(([uuid]) => uuid))}${checkMarkup("damageDealt", "I dealt Damage to this Creature")}${checkMarkup("negativeConfirmed", "This Creature has a negative Status Condition")}${confirmed}`;
    case "elementalBurst": return `${textField("condition", "Condition (Dexterity Saving Throw, 20-foot-radius Sphere within 100 feet)", { type: "select", options: conditionPairs })}<p>Bonus Action; once per Short Rest.</p>${confirmed}`;
    case "burstCondition": { const burst = view?.state?.primal?.burst; return `${textField("burstId", "Elemental Burst", { type: "select", value: burst?.id, options: burst ? [[burst.id, `${PRIMAL_CONDITION_NAMES[burst.status] ?? burst.status}, DC ${burst.dc}`]] : [] })}${select("targetUuid", keyText("Target"), targetPairs)}${checkMarkup("failedSave", "This Creature failed its Dexterity Saving Throw")}${confirmed}`; }
    case "splashCantrip": return `${select("castId", "Damaging Cantrip receipt", castPairs(entry => Number(entry.level) === 0))}${select("primaryTargetUuid", "Original target", targetPairs)}${textField("amount", "Rolled Cantrip Damage before halving", { type: "number", min: 0, max: 10000, step: 1, required: true })}${checkMarkup("singleTarget", "The Cantrip would deal Damage to only one Creature")}${confirmed}`;
    case "spark": {
      return `${select("castId", "Art cast receipt", castPairs())}${textField("effect", "Additional effect", { type: "select", options: Object.entries(SPARK_EFFECTS).map(([key, effect]) => [key, `${effect.name}${effect.save ? " (Constitution save)" : ""}: ${effect.text}`]) })}${checkMarkup("upgraded", "Apply the upgraded effect (Subtle Spark Upgraded, level 10)")}<fieldset><legend>Creatures the Art affected</legend>${targetPairs.map(([uuid, label]) => `<label class="ak5e-caster-check"><input name="targetUuids" type="checkbox" value="${esc(uuid)}" checked><span>${esc(label)}</span></label>`).join("") || "<p>Target the affected Creatures on the map first.</p>"}</fieldset>${checkMarkup("singleTarget", "This Art can only affect a single Creature (Ch.3 L465)")}<p>Effects last until the start of your next Turn. Saving Throw effects post a save button; apply them to each Creature that failed.</p>${confirmed}`;
    }
    case "sparkCondition": { const sparks = entries(view?.state?.chain?.sparks).filter(spark => spark.save); return `${textField("sparkId", "Subtle Spark", { type: "select", options: sparks.map(spark => [spark.id, `${SPARK_EFFECTS[spark.effect]?.name ?? spark.effect}${spark.upgraded ? " (upgraded)" : ""}, DC ${spark.dc}`]) })}${select("targetUuid", keyText("Target"), targetPairs)}${checkMarkup("failedSave", "This Creature failed its Constitution Saving Throw")}${confirmed}`; }
    case "residualReading": { const amounts = entries(view?.state?.residual?.amounts); return `<p>${esc(MECH_READINGS.residualStacking.label)}: levelled Arts this Turn spent ${esc(amounts.join(", "))} AP. The GM has not ruled; your reading applies to this Turn only and is shown on the card.</p>${textField("reading", "Reading", { type: "select", value: "latest", options: MECH_READINGS.residualStacking.options.map(option => [option.value, `${option.label} (${option.value === "sum" ? amounts.reduce((sum, value) => sum + Number(value), 0) : amounts.at(-1)})`]) })}${confirmed}`; }
    case "rebuild": return `${select("droneUuid", keyText("Target"), dronePairs)}${rest}${textField("components", keyText("Components"), { type: "select", options: [["true", "Components were retained"], ["false", "Replace missing components (500 LMD)" ]] })}${confirmed}`;
    case "reconcile": { const id = extra.operationId ?? extra.id; return `${textField("operationId", "Pending operation", { type: "select", options: [[id, extra.label ?? id]] })}${textField("reason", keyText("ReconcileReason"), { required: true })}${confirmed}`; }
    default: return confirmed;
  }
}
function commandData(command, form, extra = {}) {
  const value = name => form.elements.namedItem(name)?.value ?? "";
  const checked = name => form.elements.namedItem(name)?.checked === true;
  const confirmed = checked("confirmed");
  if (!confirmed) throw new Error("Confirm the source requirements before submitting.");
  switch (command) {
    case "rabbit": return { poolArtName: value("poolArtName"), confirmed };
    case "powerWithin": return { restCompleted: checked("restCompleted"), confirmed };
    case "signature": return { itemId: value("itemId"), damaging: value("damaging") === "true", restCompleted: checked("restCompleted"), confirmed };
    case "signatureDice": {
      const results = value("results").split(/[ ,]+/).filter(Boolean).map(Number), indices = value("indices").split(/[ ,]+/).filter(Boolean).map(Number), faces = Number(value("faces"));
      if (!results.length || results.some(result => !Number.isSafeInteger(result) || result < 1 || result > faces) || !indices.length || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= results.length)) throw new Error("Enter valid die results and zero-based reroll positions.");
      return { castId: value("castId"), results, faces, indices, confirmed };
    }
    case "empower": return { castId: value("castId"), confirmed };
    case "unending": return { spendId: value("spendId"), confirmed };
    case "doublecast": if (!value("level")) throw new Error("Choose the Art level for the repeated cast."); return { castId: value("castId"), itemId: value("itemId"), level: Number(value("level")), confirmed };
    case "beginRitual": return { confirmed };
    case "finishRitual": return { ap: Number(value("ap")), stationary: checked("stationary"), concentration: checked("concentration"), minuteCompleted: checked("minuteCompleted"), confirmed };
    case "cancelRitual": return { reason: value("reason"), confirmed };
    case "burst": return { itemId: value("itemId"), confirmed };
    case "nextBurst": return { confirmed };
    case "damage": {
      if (!checked("damageReviewed")) throw new Error("Confirm the reviewed roll, target defenses and final damage before applying it.");
      const splashOf = value("splashOf"), splash = form.elements.namedItem("saveOutcome") ? (splashOf ? { splashOf, splashRole: value("splashRole") } : { saveOutcome: value("saveOutcome"), onSuccess: value("onSuccess") }) : {};
      return { castId: splashOf || value("castId"), targetUuid: value("targetUuid"), amount: splashOf && value("amount") === "" ? 0 : Number(value("amount")), type: value("type"), reduction: Number(value("reduction")), resistance: checked("resistance"), vulnerability: checked("vulnerability"), immunity: checked("immunity"), ...splash, damageReviewed: true, confirmed };
    }
    case "residual": return { castId: value("castId"), targetUuid: value("targetUuid"), damageType: value("damageType"), outcome: value("outcome"), confirmed };
    case "debilitate": return { targetUuid: value("targetUuid"), damageDealt: checked("damageDealt"), negativeConfirmed: checked("negativeConfirmed"), confirmed };
    case "elementalBurst": return { condition: value("condition"), confirmed };
    case "burstCondition": return { burstId: value("burstId"), targetUuid: value("targetUuid"), failedSave: checked("failedSave"), confirmed };
    case "spark": return { castId: value("castId"), effect: value("effect"), upgraded: checked("upgraded"),
      targetUuids: selectedValues(form, "targetUuids").map(String), singleTarget: checked("singleTarget"), confirmed };
    case "sparkCondition": return { sparkId: value("sparkId"), targetUuid: value("targetUuid"), failedSave: checked("failedSave"), confirmed };
    case "splashCantrip": return { castId: value("castId"), primaryTargetUuid: value("primaryTargetUuid"), amount: Number(value("amount")), singleTarget: checked("singleTarget"), confirmed };
    case "potent": if (!checked("damageReviewed")) throw new Error("Confirm the reviewed roll and damage before recording Potent Cantrip."); if (!["miss", "save"].includes(value("outcome")) || !value("type") || !value("targetUuid")) throw new Error("Choose a qualifying miss or successful save, target and Damage Type."); return { castId: value("castId"), targetUuid: value("targetUuid"), outcome: value("outcome"), amount: Number(value("amount")), type: value("type"), reduction: Number(value("reduction")), resistance: checked("resistance"), vulnerability: checked("vulnerability"), immunity: checked("immunity"), multiAttack: checked("multiAttack"), damageReviewed: true, confirmed };
    case "createDrone": {
      const mode = value("mode");
      if (mode === "link") {
        if (!value("droneUuid")) throw new Error("Choose an existing Arts Master created for this Caster.");
        return { mode, droneUuid: value("droneUuid"), confirmed };
      }
      if (mode !== "create") throw new Error("Choose Create or Link.");
      const x = Number(value("x")), y = Number(value("y"));
      if (!value("sceneId") || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Choose a Scene and both coordinates to place the Arts Master token.");
      return { mode, sceneId: value("sceneId"), x, y, confirmed };
    }
    case "syncDrones": return { confirmed };
    case "commandDrones": {
      const tokenUuids = selectedValues(form, "tokenUuids"), mode = value("mode");
      if (!tokenUuids.length) throw new Error("Choose at least one Arts Master token.");
      if (mode === "move") {
        const x = Number(value("x")), y = Number(value("y")); if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Enter a valid scene X and Y destination.");
        return { tokenUuids, mode, destination: { x, y }, confirmed };
      }
      return { tokenUuids, mode, confirmed };
    }
    case "juryRig": { const ap = Number(value("ap")); if (!Number.isSafeInteger(ap) || ap < 1 || ap > 12) throw new Error("Choose a positive AP amount no higher than twice your proficiency bonus."); return { droneUuid: value("droneUuid"), ap, visible: checked("visible"), confirmed }; }
    case "wolfpack": return { droneUuid: value("droneUuid"), castId: value("castId"), visible: checked("visible"), confirmed };
    case "duplicate": return { castId: value("castId"), droneTokenUuid: value("droneTokenUuid"), sameTargets: checked("sameTargets"), visible: checked("visible"), confirmed };
    case "deathAbove": return { castId: value("castId"), droneTokenUuid: value("droneTokenUuid"), confirmed };
    case "residualReading": return { reading: value("reading"), confirmed };
    case "rebuild": return { droneUuid: value("droneUuid"), restCompleted: checked("restCompleted"), components: value("components") === "true", confirmed };
    case "reconcile": return { operationId: value("operationId") || extra.operationId || extra.id, reason: value("reason"), confirmed };
    default: return { confirmed };
  }
}
function commandName(action) {
  return ({ powerWithin: "powerWithin", beginRitual: "beginRitual", finishRitual: "finishRitual", cancelRitual: "cancelRitual", nextBurst: "nextBurst", initiative: "initiative", syncDrones: "syncDrones", commandDrones: "commandDrones", juryRig: "juryRig", duplicate: "duplicate", wolfpack: "wolfpack", deathAbove: "deathAbove", rebuild: "rebuild", reconcile: "reconcile", potent: "potent", signatureDice: "signatureDice", empower: "empower", unending: "unending", doublecast: "doublecast", rabbit: "rabbit", signature: "signature", burst: "burst" }[action] ?? action);
}
async function openCommand(actor, view, command, extra = {}) {
  assertOwner(actor);
  if (command === "reconcile" && !game.user.isGM) throw new Error("This control is available to a GM only.");
  if (command === "createDrone") {
    // WORKFLOW.md §3.2: the owner requests it; creating a World Actor needs GM permission, so the GM's client performs it.
    const accepted = await dialog(`${keyText("CreateDrone")} — ${actor.name}`, actionSpecs(command, actor, view), [
      { action: "create", label: keyText("Submit"), default: true, callback: (_event, button) => {
        try { return commandData(command, button.form); } catch (error) { ui.notifications.warn(error.message); return false; }
      } }, { action: "cancel", label: keyText("Cancel"), callback: () => null }
    ]);
    if (!accepted) return null;
    const createOperationId = operationId();
    while (true) {
      try {
        const drone = await confirmUse(keyText("CreateDrone"), extra => requestCasterDrone(actor, accepted.mode, { ...accepted, operationId: createOperationId, ...extra }));
        if (!drone) return null;
        await dialog("Arts Master request complete", `<p>${drone.name ? `Arts Master ${esc(drone.name)} is linked to this Caster.` : "The GM's client created or linked the Arts Master."}</p>${drone.technologyModifier ? `<p><strong>Your reading for this use (no GM ruling):</strong> ${esc(drone.technologyModifier)}</p>` : ""}<p>Operation receipt: <code>${esc(createOperationId)}</code>. If placement was interrupted, retry with this receipt; a partially created Arts Master is reused.</p>`, [
          { action: "close", label: keyText("Close"), default: true, callback: () => true }
        ]);
        return drone;
      } catch (error) {
        ui.notifications.error(error?.message ?? String(error));
        const confirmed = await dialog("Arts Master creation recovery", `<p>Creation or token placement did not finish: ${esc(error?.message ?? error)}.</p><p>Receipt: <code>${esc(createOperationId)}</code>. Retrying uses the same ID, so a partially created Arts Master will be reused.</p>${checkMarkup("retryConfirmed", "I reviewed the receipt and want to retry", { required: true })}`, [
          { action: "retry", label: "Retry same operation", default: false, callback: (_event, button) => button.form.elements.retryConfirmed?.checked ? true : false },
          { action: "close", label: keyText("Close"), callback: () => null }
        ]);
        if (!confirmed) return { operationId: createOperationId, status: "needs-review", error: error.message };
      }
    }
  }
  const content = `${actionSpecs(command, actor, view, extra)}${command === "rabbit" || command === "signature" ? "<p>Review the source eligibility listed above. The helper rechecks eligibility on submission.</p>" : ""}`;
  const data = await dialog(`${command.replace(/[A-Z]/g, c => ` ${c}`).replace(/^./, c => c.toUpperCase())} — ${actor.name}`, content, [
    { action: "submit", label: keyText("Submit"), default: true, callback: (_event, button) => {
      try { return commandData(command, button.form, extra); } catch (error) { ui.notifications.warn(error.message); return false; }
    } }, { action: "cancel", label: keyText("Cancel"), callback: () => null }
  ]);
  if (!data) return null;
  if (command === "syncDrones") return confirmUse("Refresh Arts Master links", extra => syncCasterDrones(actor, extra));
  const id = operationId(), title = command.replace(/[A-Z]/g, c => ` ${c}`).replace(/^./, c => c.toUpperCase());
  return confirmUse(title, extra => casterCommand(actor, commandName(command), { ...data, ...extra }, id));
}
/**
 * WORKFLOW.md §3.2 confirm loop: warnings are listed with "Use anyway", and a missing GM ruling offers the readings
 * for this use only. Each answer resubmits the same operation; cancelling changes nothing.
 */
async function confirmUse(title, attempt) {
  let extra = {};
  while (true) {
    try { return await attempt(extra); }
    catch (error) {
      if (isPlayWarnings(error)) {
        const accepted = await dialog(`${title}: check before use`, `<p>The source rules flag the following:</p><ul>${error.warnings.map(warning => `<li>${esc(warning.text)}</li>`).join("")}</ul><p>If you use it anyway, these are listed on the public chat card.</p>`, [
          { action: "anyway", label: "Use anyway", callback: () => true }, { action: "cancel", label: keyText("Cancel"), default: true, callback: () => null }]);
        if (!accepted) return null;
        extra = { ...extra, overrides: [...new Set([...(extra.overrides ?? []), ...error.warnings.map(warning => warning.id)])] };
      } else if (isPlayReading(error)) {
        const options = error.options.map((option, index) => `<label class="ak5e-caster-check"><input type="radio" name="reading" value="${esc(option.value)}"${index === 0 ? " checked" : ""}><span>${esc(option.label)}</span></label>`).join("");
        const reading = await dialog(`${title}: no GM ruling`, `<p>${esc(error.label)}: the GM has not ruled on this. Choose a reading for this use only. It is shown on the chat card and is not saved as a ruling.</p><fieldset>${options}</fieldset>`, [
          { action: "read", label: "Use this reading", default: true, callback: (_event, button) => button.form.elements.reading?.value || null }, { action: "cancel", label: keyText("Cancel"), callback: () => null }]);
        if (!reading) return null;
        // Keyed, so one use can carry two readings (for example the Spark cost and an upgrade's Speed change).
        extra = { ...extra, reading, readings: { ...(extra.readings ?? {}), [error.key]: reading } };
      } else throw error;
    }
  }
}
/** What an undo will and will not restore, then the undo itself. */
async function openUndo(actor, useId) {
  const preview = previewUndo(actor, useId);
  const content = `<ul>${preview.lines.map(line => `<li>${esc(line)}</li>`).join("")}</ul>${preview.blocked ? "" : "<p>The undo is noted on the public chat card.</p>"}`;
  const accepted = await dialog(`Undo — ${actor.name}`, content, preview.blocked ? [{ action: "close", label: keyText("Close"), default: true, callback: () => null }]
    : [{ action: "undo", label: "Undo this use", callback: () => true }, { action: "cancel", label: keyText("Cancel"), default: true, callback: () => null }]);
  if (!accepted) return null;
  const result = await casterCommand(actor, "undoUse", { useId }, operationId());
  refreshUseCards(useId);
  return result;
}
async function openUndoList(actor, view) {
  const uses = entries(view?.uses).filter(use => use.status !== "undone");
  if (!uses.length) { ui.notifications.info("There is no recorded use to undo."); return null; }
  const options = uses.map((use, index) => `<label class="ak5e-caster-check"><input type="radio" name="useId" value="${esc(use.id)}"${index === 0 ? " checked" : ""}${use.locked && !game.user.isGM ? " disabled" : ""}><span>${esc(use.title)}: ${esc(use.summary ?? "")}${use.locked ? " (locked: earlier encounter window)" : ""}${use.status === "pending" ? " (not applied yet)" : ""}</span></label>`).join("");
  const useId = await dialog(`Undo a recent use — ${actor.name}`, `<fieldset>${options}</fieldset>`, [
    { action: "choose", label: "Review undo", default: true, callback: (_event, button) => button.form.elements.useId?.value || null }, { action: "cancel", label: keyText("Cancel"), callback: () => null }]);
  return useId ? openUndo(actor, useId) : null;
}
function refreshUseCards(useId) {
  for (const message of entries(game.messages)) if (flag(message, "casterUse")?.useId === useId) ui.chat?.updateMessage?.(message);
}
/** Roll, Retry and Undo controls on a Primal/Splash use card, for the Caster's owners and the GM. */
function renderCasterUseCard(message, html) {
  const use = flag(message, "casterUse");
  if (!use || html.querySelector(".ak5e-caster-use-controls")) return;
  const actor = globalThis.fromUuidSync?.(use.actorUuid);
  if (!actor?.isOwner) return;
  const receipt = casterState(actor).undo?.find(entry => entry.id === use.useId);
  if (!receipt) return;
  const box = docNode("div", null, "ak5e-caster-use-controls");
  if (receipt.status === "awaitingRoll") box.append(button(`Roll ${receipt.formula} ${receipt.rollLabel ?? "Hit Point loss"}`, async () => {
    await confirmUse(receipt.title, () => casterCommand(actor, "useRoll", { useId: receipt.id }, operationId())); refreshUseCards(receipt.id);
  }, "ak5e-caster-roll"));
  if (receipt.status === "pending") box.append(button("Retry", async () => {
    await confirmUse(receipt.title, extra => casterCommand(actor, receipt.command, { ...receipt.data, ...extra }, receipt.id)); refreshUseCards(receipt.id);
  }, "ak5e-caster-retry"));
  const locked = isLocked(receipt) && !game.user.isGM, undone = receipt.status === "undone";
  const undo = button(undone ? "Undone" : locked ? "Locked (encounter window ended)" : "Undo", () => openUndo(actor, receipt.id), "ak5e-caster-undo");
  if (undone || locked) undo.disabled = true;
  box.append(undo);
  html.querySelector(".message-content")?.append(box);
}
async function resumeSetupReceipt(actor, entry) {
  const id = entry?.operationId ?? entry?.id;
  if (!id) throw new Error("This setup receipt has no operation ID and cannot be resumed safely.");
  if (!entry.choices) {
    const confirmed = await dialog("Older Caster setup receipt", `<p>This applying receipt predates saved setup choices. Review or re-enter the Caster choices under this same operation ID; the UI will show a fresh preview and require confirmation before applying.</p><p>Receipt: <code>${esc(id)}</code>.</p>${checkMarkup("reentryConfirmed", "I reviewed this older receipt and want to re-enter setup choices", { required: true })}`, [
      { action: "continue", label: keyText("Continue"), default: false, callback: (_event, button) => button.form.elements.reentryConfirmed?.checked ? true : false },
      { action: "cancel", label: keyText("Cancel"), callback: () => null }
    ]);
    if (!confirmed) return null;
  }
  return openCasterSetup(actor, { operationId: id, choices: entry.choices });
}

const RULINGS = [
  ["costOrder", "Discount and surcharge order", [["discountsThenSurcharge", "Apply discounts before surcharge"], ["surchargeThenDiscounts", "Apply surcharge before discounts"]]],
  ["unendingBasis", "Unending refund basis", [["actualSpend", "Compare against actual AP spent"]]],
  ["doublecastCost", "Doublecast second Art cost", [["normal", "Pay normal cost"], ["free", "No AP cost"]]],
  ["deathAboveCost", "Death from Above repeat cost", [["normal", "Pay normal cost"], ["free", "No AP cost"]]],
  ["signatureCantrips", "Cantrip eligibility for Savant", [["true", "Cantrips are eligible"], ["false", "Cantrips are not eligible"]]],
  ["signatureRerollOnce", "Savant rerolls per die", [["true", "Each eligible die may reroll once"], ["false", "No additional reroll limit is applied"]]],
  ["technologyModifier", "Technology modifier for drone HP", [["techTotal", "Use total Technology modifier"], ["intMod", "Use Intelligence modifier"]]],
  ["residualStacking", "Residual Energy Recyclers", [["latest", "Use the latest qualifying cast"], ["sum", "Add qualifying cast expenditures"]]],
  ["juryTempHP", "Excess Jury Rigging healing", [["replace", "Replace current temporary HP"], ["add", "Add to current temporary HP"]]],
  ["duplicationCost", "Cantrip Duplication AP cost", [["1", "Spend 1 AP"], ["2", "Spend 2 AP"]]],
  ["potentMultiAttack", "Potent Cantrip multi-attack resolution", [["true", "Allow reviewed damage entry"], ["false", "Resolve multi-attack cantrips manually"]]],
  ["droneReactionTiming", "Drone reaction timing", [["ownBudget", "Each drone tracks its own Reaction"]]],
  ["poolReplacement", "Exception: replace a recorded Standard Pool", [["retainKnownArts", "Permit replacement while retaining previously known Arts (GM exception)"]]],
  ["debilitateLoss", "Debilitate and Destroy Hit Point loss", [["bypassDRResist", "Ignores DR and Resistance; Temporary HP absorbs it"], ["bypassAll", "Ignores DR, Resistance and Temporary HP"]]],
  ["safeZoneVsMaximumBurst", "Safe Zone and Maximum Burst on the same Creature", [["safeZone", "Safe Zone: no Damage"], ["maximumBurst", "Maximum Burst: at least half the rolled Damage"]]],
  ...Object.entries(CHAIN_READINGS).map(([key, reading]) => [key, reading.label, reading.options.map(option => [option.value, option.label])])
];
async function openRuling(actor) {
  if (!game.user.isGM) throw new Error("Only a GM can record Caster rulings.");
  const content = `${inputMarkup("key", "Rule", { type: "select", options: RULINGS.map(([key, label]) => [key, label]) })}${inputMarkup("value", keyText("Ruling"), { type: "select", options: RULINGS[0][2] })}${inputMarkup("source", keyText("Source"), { type: "text", required: true })}`;
  const accepted = await dialog(keyText("Rulings"), content, [
    { action: "save", label: keyText("SaveRuling"), default: true, callback: (_event, button) => {
      const form = button.form, key = form.elements.key.value, selected = RULINGS.find(row => row[0] === key), value = form.elements.value.value;
      if (form.elements.source.value.trim().length < 10 || !selected?.[2].some(([allowed]) => String(allowed) === value)) { ui.notifications.warn("Choose an available ruling value and record at least 10 characters of source or reason."); return false; }
      return { key, value: value === "true" ? true : value === "false" ? false : Number.isFinite(Number(value)) && /^\d+$/.test(value) ? Number(value) : value, source: form.elements.source.value.trim() };
    } }, { action: "cancel", label: keyText("Cancel"), callback: () => null }
  ], { width: 600, onRender: app => {
    const form = app.element.querySelector("form"), keySelect = form?.elements.namedItem("key"), valueSelect = form?.elements.namedItem("value");
    if (!keySelect || !valueSelect) return;
    const refresh = () => {
      const values = RULINGS.find(row => row[0] === keySelect.value)?.[2] ?? [];
      const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = keyText("Choose");
      valueSelect.replaceChildren(placeholder, ...values.map(([value, label]) => { const option = document.createElement("option"); option.value = String(value); option.textContent = label; return option; }));
      valueSelect.value = "";
    };
    keySelect.addEventListener("change", refresh); refresh();
  } });
  if (accepted) return recordCasterRuling(actor, accepted.key, accepted.value, accepted.source);
}

/** GM-only: approve spell mappings for Arts without an AK5e record (also used by Guardian Arts setup for Healing Arts). */
export async function openMappings(actor, view) {
  if (!game.user.isGM) throw new Error("Only a GM can approve Art mappings.");
  const missing = entries(view?.missing ?? view?.setup?.missing).filter(entry => entry.kind === "mapping");
  if (!missing.length) { ui.notifications.info("No missing Art mappings were reported."); return; }
  let saved = 0;
  for (const entry of missing) {
    const candidates = entries(entry.candidates ?? await mappingCandidates(entry.name));
    const content = `${inputMarkup("uuid", "Candidate spell", { type: "select", options: candidates.map(candidate => [candidate.uuid, `${candidate.name} (level ${candidate.level ?? "?"})`]) })}<button type="button" data-preview-candidate>Preview selected spell</button><section data-candidate-details aria-live="polite"><p>Select a candidate, then preview its actual Foundry Item sheet and level.</p></section>${inputMarkup("source", keyText("Source"), { required: true })}${checkMarkup("reviewedCandidate", "I reviewed this spell's actual Foundry sheet, name and source level", { required: true })}`;
    const accepted = await dialog(`${keyText("Mapping")} — ${entry.name ?? entry.label}`, content, [
      { action: "save", label: keyText("SaveMapping"), default: true, callback: (_event, button) => {
        const form = button.form, uuid = form.elements.uuid.value, source = form.elements.source.value.trim();
        if (!uuid || !source || !form.elements.reviewedCandidate?.checked) { ui.notifications.warn("Preview and review the actual candidate spell, record its source, and check the review confirmation."); return false; }
        if (source.length < 10) { ui.notifications.warn("Record at least 10 characters describing the reviewed mapping source."); return false; }
        return { uuid, source };
      } }, { action: "skip", label: "Leave unresolved", callback: () => null }
    ], { onRender: app => {
      const root = app.element, form = root.querySelector("form"), select = form?.elements.namedItem("uuid");
      const previewButton = root.querySelector("[data-preview-candidate]"), details = root.querySelector("[data-candidate-details]");
      previewButton?.addEventListener("click", async event => {
        event.preventDefault(); event.stopPropagation();
        const uuid = select?.value;
        if (!uuid) { ui.notifications.warn("Choose a candidate spell before previewing."); return; }
        try {
          const candidate = await fromUuid(uuid);
          if (!candidate || candidate.type !== "spell") throw new Error("The selected UUID did not resolve to a spell Item.");
          if (details) details.replaceChildren(docNode("p", `${candidate.name} — spell level ${Number(candidate.system?.level ?? "?")}. Compare this document with ${entry.name ?? "the source Art"}.`));
          if (!candidate.sheet?.render) throw new Error("The candidate has no available Foundry Item sheet to preview.");
          candidate.sheet.render(true);
        } catch (error) { ui.notifications.warn(error.message); }
      });
    } });
    if (!accepted) continue;
    await configureCasterMapping(entry.name ?? entry.key, accepted.uuid, accepted.source);
    saved += 1;
  }
  return { saved, unresolved: missing.length - saved };
}

function normalizeName(value) { return String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, ""); }
async function mappingCandidates(name) {
  const wanted = normalizeName(name), exact = [], similar = [];
  for (const item of entries(game.items)) if (item.type === "spell") {
      const candidate = { name: item.name, uuid: item.uuid, level: Number(item.system?.level ?? 0) };
    if (normalizeName(item.name) === wanted) exact.push(candidate);
    else if (normalizeName(item.name).includes(wanted) || wanted.includes(normalizeName(item.name))) similar.push(candidate);
  }
  for (const pack of entries(game.packs)) {
    if (pack.documentName !== "Item" && !/item/i.test(pack.metadata?.type ?? "")) continue;
    let index = [];
    try { index = await pack.getIndex(); } catch { continue; }
    for (const row of entries(index)) {
      if (row.type !== "spell" && row.system?.type?.value !== "spell") continue;
      const candidate = { name: row.name, uuid: pack.getUuid?.(row._id) ?? `${pack.collection}.${row._id}`, level: Number(row.system?.level ?? row.system?.details?.level ?? 0) };
      if (normalizeName(row.name) === wanted) exact.push(candidate);
      else if (normalizeName(row.name).includes(wanted) || wanted.includes(normalizeName(row.name))) similar.push(candidate);
    }
  }
  return (exact.length ? exact : similar).slice(0, 12);
}

export async function openCasterControls(actor) {
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") throw new Error("Select a character Actor to open Caster controls.");
  if (active.has(actor.uuid)) return;
  active.add(actor.uuid);
  try {
    if (!actor.isOwner && !game.user.isGM) throw new Error(keyText("NoControls"));
    if (!Number(casterLevel(actor))) {
      const choice = await getCasterSetupChoices(actor);
      if (!actor.isOwner) throw new Error(keyText("NoControls"));
      if (choice.applicable) return openCasterSetup(actor);
      throw new Error(keyText("NoControls"));
    }
    const view = await getCasterView(actor);
    if (actor.isOwner && view?.profile?.configured === false) return openCasterSetup(actor);
    let missing = entries(view?.missing ?? view?.setup?.missing);
    if (game.user.isGM) {
      const setupView = await getCasterSetupChoices(actor);
      if (Number(setupView.level) > 0 && !setupView.blocked?.length && !setupView.pending?.length) {
        const choices = structuredClone(setupView.choices ?? {}); delete choices.summary;
        try { missing = entries((await previewCasterSetup(actor, { choices })).missing); } catch (error) { console.warn("AK5E | Caster mapping preview", error); }
      }
    }
    const inspectedView = { ...view, missing };
    const level = Number(view?.profile?.level ?? view?.level ?? casterLevel(actor) ?? 0), branch = view?.profile?.branch ?? view?.branch ?? casterBranch(actor);
    const artList = arts(view, actor), pending = entries(view?.pending), history = entries(view?.casts).concat(entries(view?.spends)).slice(-12);
    const buttons = actor.isOwner ? [{ action: "cast", label: keyText("Cast") }, ...availableControls(branch, level, view?.state).map(([action, label]) => ({ action, label }))] : [];
    if (actor.isOwner) buttons.push({ action: "setup", label: keyText("Update") });
    const uses = entries(view?.uses);
    if (actor.isOwner) for (const use of uses.filter(entry => entry.status === "pending")) buttons.push({ action: "retryUse", label: `Retry: ${use.title}`, operationId: use.id });
    if (actor.isOwner && uses.some(entry => entry.status !== "undone")) buttons.push({ action: "undoList", label: "Undo a recent use" });
    for (const entry of pending) {
      if (actor.isOwner && entry.status === "applying" && (entry.progression || entry.command === "setup" || entry.kind === "casterSetup")) {
        buttons.push({ action: "resumeSetup", label: `Resume setup receipt ${entry.operationId ?? entry.id}`, operationId: entry.operationId ?? entry.id, entry });
      } else if (game.user.isGM && ["prepared","failed","eventFailed","interrupted"].includes(entry.status)) {
        buttons.push({ action: "reconcile", label: `Review recovery: ${entry.label ?? entry.operationId ?? entry.id ?? "operation"}`, operationId: entry.operationId ?? entry.id, entry });
      }
    }
    if (game.user.isGM) {
      buttons.push({ action: "rulings", label: keyText("Rulings") });
      if (missing.some(entry => entry.kind === "mapping")) buttons.push({ action: "mappings", label: keyText("Mapping") });
    }
    const menu = `<section class="ak5e-caster-panel"><h2>${esc(keyText("Title"))} — Level ${level}</h2><p>${esc(keyText("Visibility"))}</p><p><strong>${esc(keyText("AP"))}:</strong> ${esc(view?.ap?.value ?? view?.ap?.current ?? 0)} / ${esc(view?.ap?.maximum ?? view?.ap?.max ?? 0)}${view?.charge ? ` · <strong>${esc(keyText("Charge"))}:</strong> ${esc(view.charge.value ?? 0)} / ${esc(view.charge.max ?? 0)}` : ""}${view?.residual ? ` · <strong>${esc(keyText("Residual"))}:</strong> ${esc(view.residual.value ?? 0)} / ${esc(view.residual.max ?? 0)}` : ""}${view?.chain ? ` · <strong>Chain Art:</strong> ${esc(view.chain.chainArt.value)} / ${esc(view.chain.chainArt.max)} · <strong>Sparks:</strong> ${esc(view.chain.sparks.value)} / ${esc(view.chain.sparks.max)}` : ""}</p><nav>${buttons.map(spec => `<button type="button" data-caster-ui="${esc(spec.action)}"${spec.operationId ? ` data-operation-id="${esc(spec.operationId)}"` : ""}>${esc(spec.label)}</button>`).join("")}</nav>${showList(keyText("Learned"), artList.map(art => `${art.name} — ${artLevelLabel(art.level)} · ${art.source}`))}${showList(keyText("History"), history.map(entry => `${entry.kind ?? entry.event ?? "Activity"}: ${entry.summary ?? entry.artName ?? entry.amount ?? entry.status ?? "recorded"}`))}${showList(keyText("Pending"), pending.map(entry => `${entry.label ?? entry.kind ?? "Operation"}: ${entry.status ?? "needs review"} (${entry.operationId ?? entry.id ?? "receipt retained"})`))}${showList(keyText("Manual"), manualRows(view))}</section>`;
    await foundry.applications.api.DialogV2.wait({ window: { title: `${keyText("Title")} — ${actor.name}` }, position: { width: 680 }, classes: ["ak5e-caster-dialog"], rejectClose: false,
      content: menu, buttons: [{ action: "close", label: keyText("Close") }], render: (_event, app) => {
        for (const control of app.element.querySelectorAll("[data-caster-ui]")) control.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          const action = control.dataset.casterUi, pendingEntry = pending.find(entry => String(entry.operationId ?? entry.id) === control.dataset.operationId);
          const run = action === "cast" ? () => openCast(actor, view) : action === "setup" ? () => openCasterSetup(actor)
            : action === "resumeSetup" ? () => resumeSetupReceipt(actor, pendingEntry)
            : action === "rulings" ? () => openRuling(actor) : action === "mappings" ? () => openMappings(actor, inspectedView)
            : action === "undoList" ? () => openUndoList(actor, view)
            : action === "retryUse" ? () => { const use = uses.find(entry => entry.id === control.dataset.operationId);
              return confirmUse(use.title, extra => casterCommand(actor, use.command, { ...use.data, ...extra }, use.id)); }
              : () => openCommand(actor, inspectedView, action, pendingEntry);
          safe(run);
        });
      }
    });
  } finally { active.delete(actor.uuid); }
}

function casterEligible(actor) {
  return actor?.type === "character" && (Number(casterLevel(actor)) > 0 || entries(actor.items).some(item => /caster/i.test(item.name ?? "") && item.type === "class"));
}
export function renderCasterControls(app, element) {
  const actor = actorFor(app);
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !actor || !element?.querySelector || !casterEligible(actor)) return;
  if (!actor.isOwner && !game.user.isGM) return;
  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-caster-sheet-panel")) old.remove();
    if (actor.limited && !game.user.isGM) continue;
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (features) {
      const panel = docNode("section", null, "ak5e-caster-sheet-panel ak5e-caster-features");
      panel.append(docNode("h3", keyText("Features")));
      if (actor.isOwner) panel.append(button(keyText("Open"), () => openCasterControls(actor)));
      panel.append(docNode("p", keyText("Gain")));
      features.prepend(panel);
    }
    const artsTab = root.matches?.('.tab[data-tab="spells"]') ? root : root.querySelector('.tab[data-tab="spells"]');
    if (artsTab) {
      const panel = docNode("section", null, "ak5e-caster-sheet-panel ak5e-caster-arts");
      panel.append(docNode("h3", keyText("Title")));
      if (actor.isOwner) panel.append(button(keyText("Open"), () => openCasterControls(actor)));
      artsTab.prepend(panel);
    }
  }
}
export function registerCasterSheetHooks() {
  if (installed) return;
  installed = true;
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !casterEligible(actor) || !actor.isOwner || controls.some(control => control.action === "ak5eCaster")) return;
    controls.unshift({ action: "ak5eCaster", icon: "fa-solid fa-wand-sparkles", label: keyText("Title"), ownership: "OWNER", onClick: () => safe(() => openCasterControls(actor)) });
  });
  Hooks.on("renderActorSheetV2", renderCasterControls);
  Hooks.on("renderChatMessageHTML", (message, html) => { try { renderCasterUseCard(message, html); } catch (error) { console.error("AK5e | Caster use card", error); } });
}
