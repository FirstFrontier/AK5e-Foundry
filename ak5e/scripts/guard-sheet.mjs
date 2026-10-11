/**
 * Guard sheet UI: header control and Features-tab panel that open guided dialogs.
 * Opening the panel or dialogs never writes to Actor state (WORKFLOW.md §3.2: confirm before use).
 */
import { guardProfile, guardLevel, guardBranch, guardState, martialDC, centurionDC } from "./guard-rules.mjs";
import { getGuardView } from "./guard-features.mjs";
import { applyGuardSetup } from "./guard-setup.mjs";
import { previewGuardProgression, applyGuardProgression, inspectGuardFields } from "./guard-progression.mjs";
import { guardUses } from "./guard-uses.mjs";
import { confirmPlayUse, openPlayUndoList, retryPlayUse, renderPlayUseCard } from "./play-uses-sheet.mjs";
import { isCenturion } from "./centurion-features.mjs";
import { isCrusher } from "./crusher-features.mjs";
import { isInstructor, INSTRUCTIONS } from "./instructor-features.mjs";

let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Guard UI", error); ui.notifications.error(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const operationId = () => foundry.utils.randomID();

export async function openGuardControls(actor) {
  const view = getGuardView(actor);
  const profile = view.profile;
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const state = guardState(actor);
  const mDC = martialDC(actor);

  const sections = [];

  // Summary section
  sections.push(`
    <div class="ak5e-guard-status">
      <h4>${esc(actor.name)} — Guard Level ${level}${branch ? ` (${branch.toUpperCase()})` : ""}</h4>
      <p><strong>Martial DC:</strong> ${mDC}${branch === "centurion" ? ` · <strong>Centurion DC:</strong> ${centurionDC(actor)}` : ""}</p>
      <div class="ak5e-guard-pools-summary">
        ${view.aggression ? `<span class="ak5e-pool-badge">Aggression: ${view.aggression.value} / ${view.aggression.max}</span>` : ""}
        ${view.unrelenting ? `<span class="ak5e-pool-badge">Unrelenting: ${view.unrelenting.value} / ${view.unrelenting.max}</span>` : ""}
      </div>
    </div>
  `);

  if (!profile.configured) {
    sections.push(`
      <div class="ak5e-guard-unconfigured">
        <p>This character is not yet configured with Guard class features.</p>
        <button type="button" data-guard-act="__setup">Grant Core Guard Features</button>
      </div>
    `);
  } else {
    // Core Guard Actions
    sections.push(`
      <div class="ak5e-guard-action-group">
        <h5>Press the Attack & Guard Features</h5>
        <div class="ak5e-button-row">
          <button type="button" data-guard-cmd="forestall">Forestall (1-3 Aggression, Reaction)</button>
          <button type="button" data-guard-cmd="smite">Smite (1-3 Aggression)</button>
          <button type="button" data-guard-cmd="strikeTrue">Strike True (1-3 Aggression)</button>
        </div>
        ${level >= 3 ? `
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="unrelenting">Unrelenting (1 Use)</button>
            <button type="button" data-guard-cmd="pursuitUnrelenting">Pursuit Unrelenting (2 Uses)</button>
          </div>
        ` : ""}
        ${level >= 15 ? `
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="unrelentingAggression">Unrelenting Aggression (2 Aggression)</button>
          </div>
        ` : ""}
      </div>
    `);

    // Subclass: Centurion
    if (isCenturion(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Centurion Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="cycloneStrike">Cyclone Strike</button>
            <button type="button" data-guard-cmd="brutalExecution">Brutal Execution (2 Aggression)</button>
            ${level >= 4 ? `<button type="button" data-guard-cmd="ferociousFling">Ferocious Fling</button>` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="guillotine">Guillotine</button>
              ${level >= 13 ? `<button type="button" data-guard-cmd="shredder">Shredder</button>` : ""}
              ${level >= 17 ? `<button type="button" data-guard-cmd="stormOfBlood">Storm of Blood</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Crusher
    if (isCrusher(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Crusher Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="deathPassing">Death's Passing (half Thunder on miss)</button>
            ${level >= 4 ? `
              <button type="button" data-guard-cmd="foecrusher">Foecrusher (1 Use)</button>
              <button type="button" data-guard-cmd="overbear">Overbear (2 Aggression)</button>
            ` : ""}
          </div>
          ${level >= 10 ? `
            <div class="ak5e-button-row">
              <button type="button" data-guard-cmd="hordeBreaker">Horde Breaker</button>
              ${level >= 13 ? `<button type="button" data-guard-cmd="heroicBlow">Heroic Blow (1 Foecrusher)</button>` : ""}
              ${level >= 17 ? `<button type="button" data-guard-cmd="heroicKillingBlow">Heroic Killing Blow</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Subclass: Instructor
    if (isInstructor(actor)) {
      sections.push(`
        <div class="ak5e-guard-action-group">
          <h5>Instructor Features</h5>
          <div class="ak5e-button-row">
            <button type="button" data-guard-cmd="instruction">Issue Instruction (1 Die)</button>
            ${level >= 4 ? `<button type="button" data-guard-cmd="teachFromExperience">Teach from Experience (Self, Free)</button>` : ""}
            ${level >= 17 ? `<button type="button" data-guard-cmd="onceMoreUntoTheBreach">Once More Unto The Breach (1/LR)</button>` : ""}
          </div>
        </div>
      `);
    }

    // Undo & Management
    sections.push(`
      <div class="ak5e-guard-management">
        <button type="button" data-guard-act="__undo">Undo Recent Use</button>
      </div>
    `);
  }

  const content = `<div class="ak5e-guard-dialog">${sections.join("")}</div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: `Guard Controls — ${actor.name}` },
    position: { width: 620 },
    rejectClose: false,
    content,
    buttons: [{ action: "close", label: "Close" }],
    render: (_event, app) => {
      for (const el of app.element.querySelectorAll("[data-guard-act]")) {
        el.addEventListener("click", event => {
          event.preventDefault();
          const act = el.dataset.guardAct;
          safe(async () => {
            if (act === "__setup") {
              await applyGuardSetup(actor, { confirmed: true });
              ui.notifications.info("Guard core features granted.");
              app.close();
            } else if (act === "__undo") {
              await openPlayUndoList(guardUses, actor);
            }
          });
        });
      }
      for (const el of app.element.querySelectorAll("[data-guard-cmd]")) {
        el.addEventListener("click", event => {
          event.preventDefault();
          const cmd = el.dataset.guardCmd;
          safe(() => executeGuardDialog(actor, cmd));
        });
      }
    }
  });
}

async function executeGuardDialog(actor, cmd) {
  const level = guardLevel(actor) ?? 1;

  if (cmd === "forestall" || cmd === "smite" || cmd === "strikeTrue") {
    const amount = await foundry.applications.api.DialogV2.prompt({
      window: { title: `Press the Attack: ${cmd}` },
      rejectClose: false,
      content: `<label>Aggression to spend: <input type="number" name="amount" min="1" max="3" value="1"></label>`,
      ok: { label: "Confirm", callback: (_e, target) => Number((target.form ?? target.closest("form"))?.elements?.amount?.value ?? 1) }
    });
    if (!amount) return;
    return confirmPlayUse(`Press the Attack: ${cmd}`, extra => guardUses.command(actor, cmd, { amount, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "foecrusher") {
    const rider = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Foecrusher Strike" },
      rejectClose: false,
      content: `
        <label>Select strike rider:
          <select name="rider">
            <option value="staggering">Staggering Strike (Speed halved)</option>
            <option value="dazing">Dazing Strike (Dazed condition)</option>
            <option value="renewing">Renewing Strike (Hit Die + CON healing)</option>
            <option value="smashing">Smashing Strike (Push 15 ft + advance)</option>
          </select>
        </label>`,
      ok: { label: "Confirm", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.rider?.value }
    });
    if (!rider) return;
    return confirmPlayUse("Foecrusher", extra => guardUses.command(actor, "foecrusher", { rider, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "overbear") {
    const riders = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Press the Attack: Overbear (2 Aggression)" },
      rejectClose: false,
      content: `
        <p>Deals +1d10 damage and applies two distinct Foecrusher riders:</p>
        <label>Primary Rider:
          <select name="primaryRider">
            <option value="staggering">Staggering Strike</option>
            <option value="dazing">Dazing Strike</option>
            <option value="renewing">Renewing Strike</option>
            <option value="smashing">Smashing Strike</option>
          </select>
        </label>
        <label>Secondary Rider:
          <select name="secondaryRider">
            <option value="dazing">Dazing Strike</option>
            <option value="staggering">Staggering Strike</option>
            <option value="renewing">Renewing Strike</option>
            <option value="smashing">Smashing Strike</option>
          </select>
        </label>`,
      ok: {
        label: "Confirm",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return { primaryRider: form.elements.primaryRider.value, secondaryRider: form.elements.secondaryRider.value };
        }
      }
    });
    if (!riders) return;
    return confirmPlayUse("Overbear", extra => guardUses.command(actor, "overbear", { ...riders, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "instruction") {
    const optionsHtml = Object.entries(INSTRUCTIONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
    const data = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Issue Instruction (1 Instruction Die)" },
      rejectClose: false,
      content: `
        <label>Instruction:
          <select name="instruction">${optionsHtml}</select>
        </label>
        <label><input type="checkbox" name="cooperativeCombat"> Cooperative Combat (1 Aggression, Instructor also benefits)</label>
        ${level >= 10 ? `<label><input type="checkbox" name="isKingmaker"> Kingmaker (Second ally, free, fixed d6)</label>` : ""}`,
      ok: {
        label: "Issue Instruction",
        callback: (_e, target) => {
          const form = target.form ?? target.closest("form");
          return {
            instruction: form.elements.instruction.value,
            cooperativeCombat: Boolean(form.elements.cooperativeCombat?.checked),
            isKingmaker: Boolean(form.elements.isKingmaker?.checked)
          };
        }
      }
    });
    if (!data) return;
    return confirmPlayUse("Instruction", extra => guardUses.command(actor, "instruction", { ...data, confirmed: true, ...extra }, operationId()));
  }

  if (cmd === "teachFromExperience") {
    const optionsHtml = Object.entries(INSTRUCTIONS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
    const instruction = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Teach from Experience (Turn Start, Self)" },
      rejectClose: false,
      content: `<label>Choose Instruction: <select name="instruction">${optionsHtml}</select></label>`,
      ok: { label: "Apply to Self", callback: (_e, target) => (target.form ?? target.closest("form"))?.elements?.instruction?.value }
    });
    if (!instruction) return;
    return confirmPlayUse("Teach from Experience", extra => guardUses.command(actor, "teachFromExperience", { instruction, confirmed: true, ...extra }, operationId()));
  }

  // Default simple execution for other commands
  return confirmPlayUse(cmd, extra => guardUses.command(actor, cmd, { confirmed: true, ...extra }, operationId()));
}

const eligible = actor => actor?.type === "character" && guardProfile(actor).applicable;

export function renderGuardControls(app, element) {
  const actor = actorFor(app);
  if (!eligible(actor) || (!actor.isOwner && !game.user?.isGM)) return;

  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-guard-sheet-panel")) old.remove();
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (!features) continue;

    const view = getGuardView(actor);
    const panel = node("section", null, "ak5e-guard-sheet-panel");
    panel.append(node("h3", "Guard"));

    if (view.profile.configured && view.aggression) {
      panel.append(node("p", `Aggression: ${view.aggression.value} / ${view.aggression.max}${view.unrelenting ? ` · Unrelenting: ${view.unrelenting.value} / ${view.unrelenting.max}` : ""}`, "ak5e-guard-summary"));
    }

    if (actor.isOwner) {
      panel.append(button(view.profile.configured ? "Open Guard Controls" : "Set up Guard", () => openGuardControls(actor)));
    }

    panel.append(node("p", "Opening this panel makes no changes (confirm before use).", "ak5e-guard-note"));
    features.prepend(panel);
  }
}

export function registerGuardSheetHooks() {
  if (installed) return;
  installed = true;

  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!eligible(actor) || !actor.isOwner || controls.some(c => c.action === "ak5eGuard")) return;
    controls.unshift({
      action: "ak5eGuard",
      icon: "fa-solid fa-shield",
      label: "Guard",
      ownership: "OWNER",
      onClick: () => safe(() => openGuardControls(actor))
    });
  });

  Hooks.on("renderActorSheetV2", renderGuardControls);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      renderPlayUseCard(guardUses, message, html);
    } catch (error) {
      console.error("AK5e | Guard use card", error);
    }
  });
}
