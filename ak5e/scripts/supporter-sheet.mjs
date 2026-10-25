/**
 * Supporter sheet UI: header control and Features-tab panel (mirrors medic-sheet.mjs).
 * Opening the panel or dialogs never writes Actor state. WORKFLOW.md §3.2: every use opens a confirm step that
 * summarises the cost, target and warnings before anything is spent; Cancel changes nothing.
 * Damage, healing and feature dice are never rolled here; uses post roll buttons on their cards.
 */
import {
  supporterProfile, supporterLevel, aidDieSize, pbForLevel, flag, aidAbilityKey, hasAidAbilityChoice
} from "./supporter-rules.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";
import { need } from "./operation-kernel.mjs";
import { supporterUses, confirmSupporterUse } from "./supporter-uses.mjs";
export { confirmSupporterUse };
import { confirmPlayUse, openPlayUndoList, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { SUPPORTER_BRANCH_MODULES } from "./supporter-branches.mjs";
import {
  SUPPORTER_TALENT_IDS, SUPPORTER_TALENT_RULES, ownedTalent, supporterTalentManualCard
} from "./supporter-talents.mjs";
import { previewSupporterSetup, applySupporterSetup } from "./supporter-setup.mjs";
import {
  previewSupporterProgression, applySupporterProgression, inspectSupporterFields
} from "./supporter-progression.mjs";

let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Supporter UI", error); ui?.notifications?.error?.(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const operationId = () => foundry.utils.randomID();
const DialogV2 = () => foundry.applications.api.DialogV2;

const eligible = actor => actor?.type === "character" && supporterProfile(actor).applicable;
const branchName = branch => branch ? branch.charAt(0).toUpperCase() + branch.slice(1) : "None";

/** Aid Die pool state for the panel; null when the pool is not defined yet. */
export function supporterAidDieView(actor) {
  const level = supporterLevel(actor) ?? 1;
  const size = aidDieSize(level);
  if (!getPoolDefinition("aidDie")) return { value: null, max: null, size, pb: pbForLevel(level), level };
  const pool = getPool(actor, "aidDie");
  return { value: pool.value, max: pool.max, over: pool.over, size, pb: pbForLevel(level), level };
}

/** F-R5 warning line for an Actor with no stored Aid Die ability; the owner gets the control to choose one. */
export function aidAbilityWarningHtml(actor, withButton = false) {
  const using = aidAbilityKey(actor).toUpperCase();
  const button = withButton ? `<button type="button" data-supporter-cmd="__aidAbility">Choose Aid ability</button>` : "";
  return `<div class="ak5e-supporter-warning ak5e-supporter-aid-ability">Aid ability not chosen — using ${esc(using)}. ${button}</div>`;
}

/** Which action rows are shown: each is gated by its Supporter level, and every one is confirmable. */
export function supporterActions(actor) {
  const level = supporterLevel(actor) ?? 1;
  const actions = [
    { cmd: "provideAid", label: "Provide Aid (Bonus Action)", level: 1 },
    { cmd: "useAidDie", label: "Expend Aid Die on a Roll", level: 1 },
    { cmd: "lightenTheLoad", label: "Lighten the Load (Reaction)", level: 11 },
    { cmd: "selfSupportiveDie", label: "Self-Supportive Die", level: 18 }
  ];
  return actions.filter(action => level >= action.level);
}

/** Talent use buttons for owned talents: plan talents run a use, manual talents post their card. */
export function supporterTalentActions(actor) {
  const result = [];
  for (const [key, talentId] of Object.entries(SUPPORTER_TALENT_IDS)) {
    if (!ownedTalent(actor, talentId)) continue;
    const rule = SUPPORTER_TALENT_RULES[talentId];
    if (rule?.mode === "plan") result.push({ cmd: rule.plan, label: `${key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())} (talent use)`, mode: "plan" });
    else if (rule?.mode === "manual") result.push({ cmd: `manual:${talentId}`, label: `${key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())} (manual card)`, mode: "manual" });
  }
  return result;
}

const ABILITY_KEYS = Object.freeze(["int", "wis", "cha"]);

/** A select of INT/WIS/CHA for the Aid Die ability, preselecting `selected`. */
const aidAbilitySelect = selected => `<label>Aid Die ability (chosen modifier)
  <select name="aidAbility">${ABILITY_KEYS.map(key => `<option value="${key}"${key === selected ? " selected" : ""}>${key.toUpperCase()}</option>`).join("")}</select>
</label>`;

/** A small details prompt (text, number, checkbox or select fields). Cancel resolves null and changes nothing. */
async function detailsPrompt(title, fieldsHtml, read) {
  return DialogV2().prompt({
    window: { title },
    rejectClose: false,
    content: `<div class="ak5e-supporter-details">${fieldsHtml}</div>`,
    ok: { label: "Continue", callback: (_event, button) => read(button.form.elements) }
  });
}

/** The roll an Aid Die is spent on. Values match the roll types the Aid Die engine accepts. */
async function promptRollType(title) {
  return detailsPrompt(title, `
    <label>Roll it is for
      <select name="rollType">
        <option value="skill">Skill check</option><option value="attack">Attack roll</option>
        <option value="save">Saving throw</option><option value="damage">Damage roll</option><option value="healing">Healing roll</option>
      </select>
    </label>`, elements => elements.rollType?.value ?? null);
}

/** F-R6: one control per progression field. Single choices are option indexes; a blank hp/asi choice keeps the existing one. */
function progressionFieldHtml(field) {
  if (field.count > 1) {
    const chosen = Array.isArray(field.selected) ? field.selected : [];
    const boxes = field.options.map(option => `<label><input type="checkbox" name="${esc(field.key)}" value="${esc(option.value)}"${chosen.includes(option.value) ? " checked" : ""}> ${esc(option.label)}</label>`).join("");
    return `<fieldset><legend>${esc(field.label)}</legend>${boxes}</fieldset>`;
  }
  const selectedJson = JSON.stringify(field.selected ?? null);
  const matched = field.options.some(option => JSON.stringify(option.value) === selectedJson);
  const keepsExisting = field.key.startsWith("hp.") || field.key.startsWith("asi.");
  const blank = `<option value=""${matched ? "" : " selected"}>${keepsExisting ? "Already included (keep)" : "Not chosen"}</option>`;
  const options = field.options.map((option, index) => `<option value="${index}"${JSON.stringify(option.value) === selectedJson ? " selected" : ""}>${esc(option.label)}</option>`).join("");
  return `<label class="ak5e-supporter-field">${esc(field.label)} <select name="${esc(field.key)}">${blank}${options}</select></label>`;
}

/** Writes `value` at a dotted key path ("hp.2", "startingEquipment.weapon1") of `target`. */
function setChoicePath(target, key, value) {
  const parts = key.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts.at(-1)] = value;
}

/** Reads the progression controls into a choices object (only fields the owner set are written). */
function readProgressionChoices(elements, fields) {
  const choices = {};
  for (const field of fields) {
    const control = elements.namedItem(field.key);
    if (field.count > 1) {
      const boxes = control ? (control.length !== undefined && !control.tagName ? Array.from(control) : [control]) : [];
      setChoicePath(choices, field.key, boxes.filter(box => box.checked).map(box => box.value));
      continue;
    }
    const index = control?.value ?? "";
    if (index === "") {
      if (field.key.startsWith("hp.") || field.key.startsWith("asi.")) setChoicePath(choices, field.key, { mode: "existing" });
      continue;
    }
    setChoicePath(choices, field.key, field.options[Number(index)]?.value);
  }
  return choices;
}

/** The progression choice fields (the same ones the preview builds). Cancel resolves null and changes nothing. */
async function progressionChoicesPrompt(actor, savedChoices) {
  const fields = inspectSupporterFields(actor, savedChoices);
  const fieldsHtml = fields.map(progressionFieldHtml).join("");
  return detailsPrompt("Supporter progression", fieldsHtml, elements => readProgressionChoices(elements, fields));
}

const targetUuidFromUser = () => Array.from(game.user?.targets ?? [])[0]?.actor?.uuid ?? null;
const targetNameFromUser = () => Array.from(game.user?.targets ?? [])[0]?.actor?.name ?? "";

/**
 * Every recipient the user can see (characters, NPCs, Automatons) plus the actors of the user's targeted tokens,
 * including unlinked token actors (addressed by their own uuid). Excludes the giver, compendium Actors and duplicates.
 */
export function recipientCandidates(actor, { actors = [], targetActors = [], canSee = () => true } = {}) {
  const found = new Map();
  const add = candidate => {
    if (!candidate?.uuid || candidate.uuid === actor?.uuid || candidate.pack || found.has(candidate.uuid)) return;
    found.set(candidate.uuid, candidate);
  };
  for (const candidate of actors) if (canSee(candidate)) add(candidate);
  for (const candidate of targetActors) add(candidate);
  return [...found.values()];
}

async function chooseAlly(actor, title) {
  const targetActors = Array.from(game.user?.targets ?? []).map(token => token.actor).filter(Boolean);
  const allies = recipientCandidates(actor, {
    actors: Array.from(game.actors?.contents ?? game.actors ?? []),
    targetActors,
    canSee: candidate => Boolean(game.user?.isGM) || candidate.testUserPermission?.(game.user, "LIMITED") === true
  });
  if (!allies.length) { ui.notifications.warn("No other actor is available as the recipient."); return null; }
  // F-R4: the first targeted creature is preselected.
  const preselect = targetUuidFromUser();
  const options = allies.map(candidate => `<option value="${esc(candidate.uuid)}"${candidate.uuid === preselect ? " selected" : ""}>${esc(candidate.name)}</option>`).join("");
  return detailsPrompt(title, `<label>Recipient <select name="target">${options}</select></label>`, elements => {
    const uuid = elements.target?.value;
    const picked = allies.find(candidate => candidate.uuid === uuid);
    return picked ? { targetUuid: picked.uuid, targetName: picked.name } : null;
  });
}

/** Runs one Supporter use: confirm first, then the engine with its own warning and reading prompts. */
async function runSupporterUse(actor, plan, title, data, summaryLines) {
  const confirmed = await confirmSupporterUse(title, summaryLines);
  if (!confirmed) return null;
  return confirmPlayUse(title, extra => supporterUses.command(actor, plan, { confirmed: true, ...data, ...extra }, operationId()), { confirmed: true });
}

async function postManualCard(actor, talentId) {
  const card = supporterTalentManualCard(talentId);
  const body = [
    `<h3>${esc(card.name)} (manual)</h3>`,
    card.ruling ? `<p><strong>Ruling ${esc(card.ruling)}:</strong> cross-class borrow; the GM rules on this card.</p>` : "",
    `<p><em>${esc(card.reason)}</em></p>`,
    card.effect ? `<p><strong>Effect:</strong> ${esc(card.effect)}</p>` : "",
    card.moduleEffect ? `<p><strong>Module Effect:</strong> ${esc(card.moduleEffect)}</p>` : ""
  ].join("");
  return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: body });
}

/** Central command dispatcher used by both the panel and the controls dialog. */
export async function handleSupporterCommand(actor, cmd) {
  if (cmd === "provideAid") {
    const ally = await chooseAlly(actor, "Provide Aid: recipient");
    if (!ally) return null;
    const die = aidDieSize(supporterLevel(actor) ?? 1);
    return runSupporterUse(actor, "provideAid", "Provide Aid", { targetUuid: ally.targetUuid, targetName: ally.targetName, distance: 0 }, [
      `${actor.name} spends one Aid Die (${die}) on ${ally.targetName}.`,
      "The recipient may expend it on an Attack, Skill Check, Saving Throw, Damage or Healing Roll within 10 minutes."
    ]);
  }

  if (cmd === "useAidDie") {
    const rollType = await promptRollType("Expend Aid Die");
    if (!rollType) return null;
    const die = aidDieSize(supporterLevel(actor) ?? 1);
    return runSupporterUse(actor, "useAidDie", "Expend Aid Die", { rollType, dieSize: die }, [
      `${actor.name} expends one Aid Die (${die}) on a ${rollType} roll.`,
      "The roll itself is made by the owner, from the roll card; nothing is rolled here."
    ]);
  }

  if (cmd === "lightenTheLoad") {
    const ally = await chooseAlly(actor, "Lighten the Load: new recipient");
    if (!ally) return null;
    return runSupporterUse(actor, "lightenTheLoad", "Lighten the Load", { targetUuid: ally.targetUuid, targetName: ally.targetName, distance: 0 }, [
      `${actor.name} uses a Reaction to grant ${ally.targetName} a free Aid Die.`,
      "The Aid Die is not expended and cannot be used on a supplementary Aid Die."
    ]);
  }

  if (cmd === "selfSupportiveDie") {
    const rollType = await promptRollType("Self-Supportive Die");
    if (!rollType) return null;
    return runSupporterUse(actor, "selfSupportiveDie", "Self-Supportive Die", { rollType }, [
      `${actor.name} expends the Self-Supportive Die granted at the start of this Turn, as if targeted by your own Provide Aid.`,
      `The roll is a ${rollType} roll; it is made by the owner from the roll card.`
    ]);
  }

  if (cmd === "lucky") {
    const mode = await detailsPrompt("Lucky", `
      <label>Use the Luck Point for
        <select name="mode"><option value="advantage">Advantage on a d20 roll (yours)</option><option value="disadvantage">Disadvantage on an enemy's Attack Roll</option></select>
      </label>`, elements => elements.mode?.value ?? "advantage");
    if (!mode) return null;
    return runSupporterUse(actor, "lucky", "Lucky", { mode }, [`${actor.name} spends one Luck Point.`]);
  }

  if (["preservingSanctuary", "accelerando", "mirrorMove", "painfulLesson", "artOfBinding"].includes(cmd)) {
    const details = await detailsPrompt(supporterTalentTitle(cmd), `
      <label>Creature <input type="text" name="targetName" value="${esc(targetNameFromUser())}" /></label>
      <label>Distance (ft) <input type="number" name="distance" min="0" value="0" /></label>
      <label><input type="checkbox" name="flag" /> ${esc(flagLabel(cmd))}</label>`, elements => ({
      targetName: String(elements.targetName?.value ?? "").trim(),
      distance: Number(elements.distance?.value ?? 0),
      flag: Boolean(elements.flag?.checked)
    }));
    if (!details) return null;
    const data = { targetUuid: targetUuidFromUser(), targetName: details.targetName || undefined, distance: details.distance, ...flagData(cmd, details.flag) };
    return runSupporterUse(actor, cmd, supporterTalentTitle(cmd), data, [`${actor.name} uses ${supporterTalentTitle(cmd)}.`, "Damage is rolled only when the owner clicks the card's roll button."]);
  }

  if (cmd === "ignition") {
    const ap = await detailsPrompt("Ignition", `<label>Arts Points expended on the Art <input type="number" name="ap" min="1" value="1" /></label>`,
      elements => Number(elements.ap?.value ?? 1));
    if (!ap) return null;
    return runSupporterUse(actor, "ignition", "Ignition", { apSpent: ap }, [`${actor.name} uses a Reaction after casting an Art with ${ap} Arts Points.`]);
  }

  if (cmd.startsWith("manual:")) return postManualCard(actor, cmd.slice("manual:".length));

  if (cmd === "undo") return openPlayUndoList(supporterUses, actor);

  if (cmd === "__open") return openSupporterControls(actor);

  if (cmd === "__setup") {
    // F-R5: the chooser defaults to the stored Aid Die ability, else the highest of INT/WIS/CHA.
    const initial = await previewSupporterSetup(actor);
    const aidAbility = await detailsPrompt("Set up Supporter features", aidAbilitySelect(initial.aidAbility),
      elements => elements.aidAbility?.value ?? null);
    if (!aidAbility) return null;
    const preview = await previewSupporterSetup(actor, { aidAbility });
    const names = preview.creates.map(item => item.name);
    const confirmed = await confirmSupporterUse("Set up Supporter features", [
      `Grants ${names.length} core feature${names.length === 1 ? "" : "s"} for level ${preview.level}.`,
      names.length ? names.join(", ") : "Nothing new; the features are already present.",
      `Aid Dice use the ${aidAbility.toUpperCase()} modifier.`
    ]);
    if (!confirmed) return null;
    const result = await applySupporterSetup(actor, { confirmed: true, contextKey: preview.contextKey, aidAbility });
    ui.notifications.info(`Supporter features set up (${result.createdCount} added).`);
    return result;
  }

  if (cmd === "__aidAbility") {
    need(actor.isOwner, "Only the owner may choose this Supporter's Aid Die ability.");
    const current = aidAbilityKey(actor);
    const picked = await detailsPrompt("Aid Die ability", aidAbilitySelect(current), elements => elements.aidAbility?.value ?? null);
    if (!ABILITY_KEYS.includes(picked)) return null;
    await actor.update({ "flags.ak5e.supporter.aidAbility": picked });
    ui.notifications.info(`Aid Dice now use the ${picked.toUpperCase()} modifier.`);
    return picked;
  }

  if (cmd === "__progression") {
    // F-R6: the owner picks each choice field (the same fields the progression preview builds), then confirms.
    const preview = await previewSupporterProgression(actor);
    const picked = await progressionChoicesPrompt(actor, preview.choices);
    if (!picked) return null;
    const next = await previewSupporterProgression(actor, picked);
    if (next.pending.length) {
      ui.notifications.warn(`Choose the remaining Supporter progression fields first: ${next.pending.join(", ")}.`);
      return null;
    }
    const confirmed = await confirmSupporterUse("Supporter progression", [
      `Applies Supporter progression for level ${next.level}.`,
      "All required choices are present.",
      ...next.warnings
    ]);
    if (!confirmed) return null;
    return applySupporterProgression(actor, { confirmed: true, contextKey: next.contextKey, choices: picked });
  }

  // Branch controls: the registered branch module's command() returns undefined for a control it does not own.
  const branchCommand = SUPPORTER_BRANCH_MODULES.get(panelBranch(actor))?.command;
  if (branchCommand) {
    const handled = await branchCommand(actor, cmd);
    if (handled !== undefined) return handled;
  }

  throw new Error(`Unknown Supporter control ${cmd}.`);
}

function supporterTalentTitle(cmd) {
  return {
    preservingSanctuary: "Preserving Sanctuary",
    accelerando: "Accelerando",
    mirrorMove: "Mirror Move",
    painfulLesson: "Painful Lesson",
    artOfBinding: "Art of Binding"
  }[cmd] ?? cmd;
}
function flagLabel(cmd) {
  return {
    preservingSanctuary: "The protected Creature has more than half its maximum Hit Points",
    accelerando: "The Attack Roll is an allied Creature's",
    mirrorMove: "The damage taken is Arts Damage",
    painfulLesson: "The attacker has a detrimental Status Condition",
    artOfBinding: "The Creature's Speed has been reduced by you"
  }[cmd];
}
function flagData(cmd, value) {
  const key = {
    preservingSanctuary: "targetHalfHpOrMore",
    accelerando: "allyAttack",
    mirrorMove: "artDamage",
    painfulLesson: "hasDetrimentalCondition",
    artOfBinding: "speedReduced"
  }[cmd];
  return key ? { [key]: value } : {};
}

/** The branch subclass Item is authoritative; the stored branch (set by setup before a subclass exists) is the fallback. */
function panelBranch(actor, profile = supporterProfile(actor)) {
  return profile.branch ?? (flag(actor, "supporter")?.branch || null);
}

/**
 * The Features-tab panel as HTML: the single source for the panel, so the DOM hook and any other caller cannot drift.
 * Returns "" for a non-character or a non-Supporter. Action and talent buttons appear only for the Actor's owner.
 * Needs no `game` and no defined pool: supporterAidDieView reports "not set up" in that case.
 */
export function supporterPanelHtml(actor) {
  if (!eligible(actor)) return "";
  const profile = supporterProfile(actor);
  const view = supporterAidDieView(actor);
  const branch = panelBranch(actor, profile);
  const aid = view.max === null ? "Aid Dice: not set up"
    : `Aid Dice: ${view.value} / ${view.max}${view.over > 0 ? ` (+${view.over})` : ""} · ${view.size}`;
  const cmdButton = (cmd, label) => `<button type="button" data-supporter-cmd="${esc(cmd)}">${esc(label)}</button>`;
  const parts = [
    "<h3>Supporter</h3>",
    `<div class="ak5e-supporter-badges"><span class="ak5e-supporter-badge ak5e-supporter-badge-aid">${esc(aid)}</span>`
      + `<span class="ak5e-supporter-badge ak5e-supporter-badge-branch">Branch: ${esc(branchName(branch))}</span></div>`
  ];
  // R1: at 0 or below the sheet warns; the GM resolves.
  if (view.max !== null && view.max <= 0) parts.push(`<div class="ak5e-supporter-warning">${esc(Math.max(0, view.max))} Aid Dice — GM resolves</div>`);
  if (profile.configured && !hasAidAbilityChoice(actor)) parts.push(aidAbilityWarningHtml(actor, actor.isOwner));
  if (actor.isOwner && profile.configured) {
    parts.push(`<div class="ak5e-supporter-button-row">${supporterActions(actor).map(action => cmdButton(action.cmd, action.label)).join("")}${cmdButton("undo", "Review / Undo Recent Uses")}</div>`);
    const talents = supporterTalentActions(actor);
    if (talents.length) parts.push(`<div class="ak5e-supporter-button-row ak5e-supporter-talents">${talents.map(action => cmdButton(action.cmd, action.label)).join("")}</div>`);
  }
  const branchHtml = actor.isOwner && branch ? SUPPORTER_BRANCH_MODULES.get(branch)?.sheetPanel?.(actor) : null;
  if (typeof branchHtml === "string" && branchHtml.length) parts.push(`<div class="ak5e-supporter-branch-slot">${branchHtml}</div>`);
  if (actor.isOwner) parts.push(cmdButton(profile.configured ? "__open" : "__setup", profile.configured ? "Open Supporter Controls" : "Set up Supporter"));
  parts.push('<p class="ak5e-supporter-note">Opening this panel makes no changes (confirm before use).</p>');
  return `<section class="ak5e-supporter-sheet-panel">${parts.join("")}</section>`;
}

export async function openSupporterControls(actor) {
  const profile = supporterProfile(actor);
  const view = supporterAidDieView(actor);
  const sections = [];
  sections.push(`
    <div class="ak5e-supporter-status">
      <h4>${esc(actor.name)} — Supporter Level ${profile.level ?? 1}${profile.branch ? ` (${esc(branchName(profile.branch))})` : ""}</h4>
      <p><strong>Aid Dice:</strong> ${view.max === null ? "not set up" : `${view.value} / ${view.max}`} · <strong>Die:</strong> ${esc(view.size)}</p>
      ${view.max !== null && view.max <= 0 ? `<p class="ak5e-supporter-warning">${Math.max(0, view.max)} Aid Dice — GM resolves</p>` : ""}
      ${profile.configured && !hasAidAbilityChoice(actor) ? aidAbilityWarningHtml(actor, actor.isOwner) : ""}
    </div>`);

  if (!profile.configured) {
    sections.push(`
      <div class="ak5e-supporter-unconfigured">
        <p>This character is not yet configured with Supporter class features.</p>
        <button type="button" data-supporter-cmd="__setup">Grant Core Supporter Features</button>
      </div>`);
  } else {
    const actions = supporterActions(actor).map(action => `<button type="button" data-supporter-cmd="${esc(action.cmd)}">${esc(action.label)}</button>`).join("");
    const talents = supporterTalentActions(actor).map(action => `<button type="button" data-supporter-cmd="${esc(action.cmd)}">${esc(action.label)}</button>`).join("");
    sections.push(`<div class="ak5e-supporter-action-group"><h5>Supporter Actions</h5><div class="ak5e-supporter-button-row">${actions}</div></div>`);
    if (talents) sections.push(`<div class="ak5e-supporter-action-group"><h5>Talent Uses</h5><div class="ak5e-supporter-button-row">${talents}</div></div>`);
    sections.push(`<div class="ak5e-supporter-action-group ak5e-supporter-admin-row">
      <button type="button" data-supporter-cmd="undo">Review / Undo Recent Uses</button>
      <button type="button" data-supporter-cmd="__progression">Supporter Progression</button>
    </div>`);
  }
  sections.push(`<div class="ak5e-supporter-notes"><p><em>WORKFLOW §3.2: Confirm before use. Warnings offer "Use anyway". Shortfalls clamp at 0 and are shown on the card. Damage and feature dice are rolled only by the owner.</em></p></div>`);

  const dlg = new (DialogV2())({
    window: { title: `${actor.name} — Supporter Controls` },
    position: { width: 560 },
    content: `<div class="ak5e-supporter-controls-dialog">${sections.join("")}</div>`,
    buttons: [{ action: "close", label: "Close", default: true }]
  });
  dlg.render(true);

  setTimeout(() => {
    const el = dlg.element;
    if (!el) return;
    el.querySelectorAll("[data-supporter-cmd]").forEach(btn => {
      btn.addEventListener("click", async event => {
        event.preventDefault();
        const cmd = btn.dataset.supporterCmd;
        await safe(() => handleSupporterCommand(actor, cmd));
        if (cmd !== "undo") dlg.close();
      });
    });
  }, 50);
}

const eligibleForPanel = (actor, app) => eligible(actor) && (actor.isOwner || game.user?.isGM);

/** Features-tab DOM hook. Builds from supporterPanelHtml, then binds each [data-supporter-cmd] button to the dispatcher. */
export function renderSupporterControls(app, element) {
  const actor = actorFor(app);
  if (!eligibleForPanel(actor, app)) return;
  const html = supporterPanelHtml(actor);
  if (!html) return;

  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-supporter-sheet-panel")) old.remove();
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (!features) continue;

    const holder = document.createElement("div");
    holder.innerHTML = html;
    const panel = holder.firstElementChild;
    for (const btn of panel.querySelectorAll("[data-supporter-cmd]")) {
      btn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        btn.disabled = true;
        safe(() => handleSupporterCommand(actor, btn.dataset.supporterCmd)).finally(() => { btn.disabled = false; });
      });
    }
    features.prepend(panel);
  }
}

export function registerSupporterSheetHooks() {
  if (installed) return;
  installed = true;

  if (globalThis.Hooks?.on) {
    Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
      const actor = actorFor(app);
      if (!eligible(actor) || !actor.isOwner || controls.some(c => c.action === "ak5eSupporter")) return;
      controls.unshift({
        action: "ak5eSupporter",
        icon: "fa-solid fa-hand-holding-heart",
        label: "Supporter",
        ownership: "OWNER",
        onClick: () => safe(() => openSupporterControls(actor))
      });
    });

    Hooks.on("renderActorSheetV2", renderSupporterControls);
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try {
        renderPlayUseCard(supporterUses, message, html);
      } catch (error) {
        console.error("AK5e | Supporter use card", error);
      }
    });
  }
}
