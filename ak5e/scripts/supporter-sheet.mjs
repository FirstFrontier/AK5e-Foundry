/**
 * Supporter sheet UI: header control and Features-tab panel (mirrors medic-sheet.mjs).
 * Opening the panel or dialogs never writes Actor state. WORKFLOW.md §3.2: every use opens a confirm step that
 * summarises the cost, target and warnings before anything is spent; Cancel changes nothing.
 * Damage, healing and feature dice are never rolled here; uses post roll buttons on their cards.
 */
import {
  supporterProfile, supporterLevel, aidDieSize, pbForLevel
} from "./supporter-rules.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";
import { supporterUses } from "./supporter-uses.mjs";
import { confirmPlayUse, openPlayUndoList, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { SUPPORTER_BRANCH_MODULES } from "./supporter-branches.mjs";
import {
  SUPPORTER_TALENT_IDS, SUPPORTER_TALENT_RULES, ownedTalent, supporterTalentManualCard
} from "./supporter-talents.mjs";
import { previewSupporterSetup, applySupporterSetup } from "./supporter-setup.mjs";
import { previewSupporterProgression, applySupporterProgression } from "./supporter-progression.mjs";

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

/** Confirm step for every use or setup. Resolves true only on Confirm. */
async function confirmSupporterUse(title, lines) {
  const content = `<div class="ak5e-supporter-confirm">${lines.map(line => `<p>${esc(line)}</p>`).join("")}</div>`;
  const result = await DialogV2().wait({
    window: { title },
    position: { width: 480 },
    rejectClose: false,
    content,
    buttons: [
      { action: "confirm", label: "Confirm", default: true, callback: () => true },
      { action: "cancel", label: "Cancel", callback: () => false }
    ]
  });
  return result === true;
}

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

const targetUuidFromUser = () => Array.from(game.user?.targets ?? [])[0]?.actor?.uuid ?? null;
const targetNameFromUser = () => Array.from(game.user?.targets ?? [])[0]?.actor?.name ?? "";

async function chooseAlly(actor, title) {
  const allies = Array.from(game.actors?.contents ?? game.actors ?? [])
    .filter(candidate => candidate.type === "character" && candidate.id !== actor.id && !candidate.pack);
  if (!allies.length) { ui.notifications.warn("No other character is available as the recipient."); return null; }
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
  return confirmPlayUse(title, extra => supporterUses.command(actor, plan, { confirmed: true, ...data, ...extra }, operationId()));
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
    const preview = await previewSupporterSetup(actor);
    const names = preview.creates.map(item => item.name);
    const confirmed = await confirmSupporterUse("Set up Supporter features", [
      `Grants ${names.length} core feature${names.length === 1 ? "" : "s"} for level ${preview.level}.`,
      names.length ? names.join(", ") : "Nothing new; the features are already present."
    ]);
    if (!confirmed) return null;
    const result = await applySupporterSetup(actor, { confirmed: true, contextKey: preview.contextKey });
    ui.notifications.info(`Supporter features set up (${result.createdCount} added).`);
    return result;
  }

  if (cmd === "__progression") {
    const preview = await previewSupporterProgression(actor);
    const confirmed = await confirmSupporterUse("Supporter progression", [
      `Applies Supporter progression for level ${preview.level}.`,
      preview.pending.length ? `Still needed: ${preview.pending.join(", ")}.` : "All required choices are present.",
      ...preview.warnings
    ]);
    if (!confirmed) return null;
    return applySupporterProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices: preview.choices });
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

/**
 * The Features-tab panel as HTML: the single source for the panel, so the DOM hook and any other caller cannot drift.
 * Returns "" for a non-character or a non-Supporter. Action and talent buttons appear only for the Actor's owner.
 * Needs no `game` and no defined pool: supporterAidDieView reports "not set up" in that case.
 */
export function supporterPanelHtml(actor) {
  if (!eligible(actor)) return "";
  const profile = supporterProfile(actor);
  const view = supporterAidDieView(actor);
  const branch = profile.branch;
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
  if (actor.isOwner && profile.configured) {
    parts.push(`<div class="ak5e-supporter-button-row">${supporterActions(actor).map(action => cmdButton(action.cmd, action.label)).join("")}${cmdButton("undo", "Review / Undo Recent Uses")}</div>`);
    const talents = supporterTalentActions(actor);
    if (talents.length) parts.push(`<div class="ak5e-supporter-button-row ak5e-supporter-talents">${talents.map(action => cmdButton(action.cmd, action.label)).join("")}</div>`);
  }
  const branchHtml = branch ? SUPPORTER_BRANCH_MODULES.get(branch)?.sheetPanel?.(actor) : null;
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
