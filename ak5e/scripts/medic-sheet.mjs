/**
 * Medic sheet UI: header control and Features-tab panel that open guided dialogs.
 * Opening the panel or dialogs never writes to Actor state (WORKFLOW.md §3.2: confirm before use).
 */
import {
  medicProfile,
  medicLevel,
  medicBranch,
  medicState,
  medicSpellDC,
  medicSpellAttackMod,
  martialDC,
  pbForLevel,
  flag
} from "./medic-rules.mjs";
import { getMedicView, lifeSupport, resuscitation, mobileHospital } from "./medic-features.mjs";
import { previewMedicSetup, applyMedicSetup } from "./medic-setup.mjs";
import { previewMedicProgression, applyMedicProgression, inspectMedicFields } from "./medic-progression.mjs";
import { medicUses } from "./medic-uses.mjs";
import { confirmPlayUse, openPlayUndoList, renderPlayUseCard } from "./play-uses-sheet.mjs";

let installed = false;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Medic UI", error); ui?.notifications?.error?.(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const operationId = () => foundry.utils.randomID();

export async function openMedicControls(actor) {
  const view = getMedicView(actor);
  const profile = view.profile;
  const level = profile.level ?? 1;
  const branch = profile.branch;
  const sDC = medicSpellDC(actor);
  const mDC = martialDC(actor);

  const sections = [];

  // Summary section
  sections.push(`
    <div class="ak5e-medic-status">
      <h4>${esc(actor.name)} — Medic Level ${level}${branch ? ` (${branch.toUpperCase()})` : ""}</h4>
      <p><strong>Spell Save DC:</strong> ${sDC} · <strong>Martial DC:</strong> ${mDC}</p>
      <div class="ak5e-medic-pools-summary">
        ${view.lifeSupport ? `<span class="ak5e-pool-badge">Life Support: ${view.lifeSupport.value} / ${view.lifeSupport.max}${view.lifeSupport.over > 0 ? ` (+${view.lifeSupport.over} OverMax)` : ""}</span>` : ""}
        ${view.resuscitation ? `<span class="ak5e-pool-badge">Resuscitation: ${view.resuscitation.value} / ${view.resuscitation.max}</span>` : ""}
        ${view.mobileHospital ? `<span class="ak5e-pool-badge">Mobile Hospital: ${view.mobileHospital.value} / ${view.mobileHospital.max}</span>` : ""}
      </div>
    </div>
  `);

  if (!profile.configured) {
    sections.push(`
      <div class="ak5e-medic-unconfigured">
        <p>This character is not yet configured with Medic class features.</p>
        <button type="button" data-medic-act="__setup">Grant Core Medic Features</button>
      </div>
    `);
  } else {
    // Core Medic Actions
    sections.push(`
      <div class="ak5e-medic-action-group">
        <h5>Core Medic Actions</h5>
        <div class="ak5e-button-row">
          <button type="button" data-medic-cmd="touchHeal">Touch Heal (Spend Life Support)</button>
          <button type="button" data-medic-cmd="preserver">Preserver (5 LS Reroll)</button>
          <button type="button" data-medic-cmd="urgencyOfTreatment">Urgency of Treatment (-AP)</button>
        </div>
        ${level >= 12 ? `
          <div class="ak5e-button-row">
            <button type="button" data-medic-cmd="resuscitation">Resuscitation (Free Revivify)</button>
          </div>
        ` : ""}
        ${level >= 20 ? `
          <div class="ak5e-button-row">
            <button type="button" data-medic-cmd="chosenOfAsclepius">Chosen of Asclepius (Max Healing Dice)</button>
          </div>
        ` : ""}
      </div>
    `);

    // Physician Actions
    if (branch === "physician") {
      sections.push(`
        <div class="ak5e-medic-action-group">
          <h5>Physician Actions</h5>
          <div class="ak5e-button-row">
            <button type="button" data-medic-cmd="focusedTreatment">Focused Treatment (+PB Heal/Harm)</button>
            ${level >= 4 ? `<button type="button" data-medic-cmd="intravenousLine">Intravenous Line (10 LS)</button>` : ""}
            ${level >= 7 ? `<button type="button" data-medic-cmd="hypocriticOath">Hypocritic Oath (Heal-to-Harm)</button>` : ""}
          </div>
          ${level >= 11 ? `
            <div class="ak5e-button-row">
              <button type="button" data-medic-cmd="inpatientCare">Inpatient Care (Reaction, 15 LS)</button>
              ${level >= 15 ? `<button type="button" data-medic-cmd="surgeonGeneral">Surgeon-General (Double Healing)</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Triage Actions
    if (branch === "triage") {
      sections.push(`
        <div class="ak5e-medic-action-group">
          <h5>Triage Actions</h5>
          <div class="ak5e-button-row">
            <button type="button" data-medic-cmd="onTheScene">On the Scene (10 LS, Move &amp; Heal/Harm)</button>
            ${level >= 4 ? `<button type="button" data-medic-cmd="urgentCareCentre">Urgent Care Centre (10 ft AOE)</button>` : ""}
            ${level >= 7 ? `<button type="button" data-medic-cmd="stopTheFlow">Stop the Flow (20 LS, 6 Mettle)</button>` : ""}
          </div>
          ${level >= 11 ? `
            <div class="ak5e-button-row">
              <button type="button" data-medic-cmd="touchOfLifeAndDeath">Touch of Life and Death Rider</button>
              ${level >= 15 ? `<button type="button" data-medic-cmd="mobileHospital">Mobile Hospital (1/LR 30 ft Aura)</button>` : ""}
            </div>
          ` : ""}
        </div>
      `);
    }

    // Progression and Undo Management
    sections.push(`
      <div class="ak5e-medic-action-group ak5e-medic-admin-row">
        <button type="button" data-medic-act="__progression">Medic Progression</button>
        <button type="button" data-medic-act="__undoList">Review / Undo Recent Uses</button>
      </div>
    `);
  }

  // Guidance notes
  sections.push(`
    <div class="ak5e-medic-notes">
      <p><em>WORKFLOW §3.2: Confirm before use. Warnings emit "Use anyway". Resource shortfalls clamp at 0 and are tracked on receipts.</em></p>
    </div>
  `);

  const content = `<div class="ak5e-medic-controls-dialog">${sections.join("")}</div>`;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: `${actor.name} — Medic Controls` },
    position: { width: 560 },
    content,
    buttons: [{ action: "close", label: "Close", default: true }]
  });

  dlg.render(true);

  // Bind dialog button actions after render
  setTimeout(() => {
    const el = dlg.element;
    if (!el) return;

    el.querySelectorAll("[data-medic-cmd]").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.preventDefault();
        const cmd = btn.dataset.medicCmd;
        await handleMedicCommand(actor, cmd);
        dlg.close();
      });
    });

    el.querySelectorAll("[data-medic-act]").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.preventDefault();
        const act = btn.dataset.medicAct;
        if (act === "__setup") {
          const preview = await previewMedicSetup(actor);
          await applyMedicSetup(actor, { confirmed: true, contextKey: preview.contextKey });
          ui.notifications.info("Core Medic features granted.");
          dlg.close();
        } else if (act === "__progression") {
          dlg.close();
          const p = await previewMedicProgression(actor);
          await applyMedicProgression(actor, { confirmed: true, contextKey: p.contextKey });
          ui.notifications.info("Medic progression updated.");
        } else if (act === "__undoList") {
          openPlayUndoList(medicUses, actor);
        }
      });
    });
  }, 50);
}

export async function handleMedicCommand(actor, cmd) {
  if (cmd === "touchHeal") {
    const targets = Array.from(game.user.targets ?? []);
    const target = targets[0]?.actor;
    const amountVal = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Touch Heal" },
      rejectClose: false,
      content: `
        <label>Life Support to Spend:
          <input type="number" name="amount" min="1" max="170" value="10" required />
        </label>
        <p>${target ? `Target: <strong>${esc(target.name)}</strong> (${target.system?.attributes?.hp?.value ?? 0}/${target.system?.attributes?.hp?.max ?? 0} HP)` : "<em>No token targeted. Select a target first or proceed to manually target.</em>"}</p>
      `,
      ok: { label: "Confirm", callback: (_e, button) => Number(button.form?.elements?.amount?.value || 10) }
    });
    if (!amountVal) return;
    return confirmPlayUse("Touch Heal", extra =>
      medicUses.command(actor, "touchHeal", {
        confirmed: true,
        amount: amountVal,
        targetUuid: target?.uuid ?? null,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "urgencyOfTreatment") {
    const spentLSVal = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Urgency of Treatment" },
      rejectClose: false,
      content: `
        <label>Life Support to Spend (Multiples of 10):
          <select name="spentLS">
            <option value="10">10 LS (-1 AP)</option>
            <option value="20">20 LS (-2 AP)</option>
            <option value="30">30 LS (-3 AP)</option>
          </select>
        </label>
      `,
      ok: { label: "Confirm", callback: (_e, button) => Number(button.form?.elements?.spentLS?.value || 10) }
    });
    if (!spentLSVal) return;
    return confirmPlayUse("Urgency of Treatment", extra =>
      medicUses.command(actor, "urgencyOfTreatment", {
        confirmed: true,
        spentLS: spentLSVal,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "resuscitation") {
    const targets = Array.from(game.user.targets ?? []);
    const target = targets[0]?.actor;
    return confirmPlayUse("Resuscitation", extra =>
      medicUses.command(actor, "resuscitation", {
        confirmed: true,
        targetUuid: target?.uuid ?? null,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "intravenousLine") {
    const targets = Array.from(game.user.targets ?? []);
    const target = targets[0]?.actor;
    const isUnwilling = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Intravenous Line" },
      rejectClose: false,
      content: `
        <label><input type="checkbox" name="isUnwilling" value="true" /> Target is unwilling (requires CON saving throw)</label>
      `,
      ok: { label: "Proceed", callback: (_e, button) => Boolean(button.form?.elements?.isUnwilling?.checked) }
    });
    return confirmPlayUse("Intravenous Line", extra =>
      medicUses.command(actor, "intravenousLine", {
        confirmed: true,
        targetUuid: target?.uuid ?? null,
        isUnwilling,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "stopTheFlow") {
    const targets = Array.from(game.user.targets ?? []);
    const target = targets[0]?.actor;
    return confirmPlayUse("Stop the Flow", extra =>
      medicUses.command(actor, "stopTheFlow", {
        confirmed: true,
        targetUuid: target?.uuid ?? null,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "onTheScene") {
    const withTouchOfLifeAndDeath = medicLevel(actor) >= 11;
    return confirmPlayUse("On the Scene", extra =>
      medicUses.command(actor, "onTheScene", {
        confirmed: true,
        withTouchOfLifeAndDeath,
        ...extra
      }, operationId())
    );
  }

  if (cmd === "inpatientCare") {
    const targets = Array.from(game.user?.targets ?? []);
    const target = targets[0]?.actor;
    return confirmPlayUse("Inpatient Care", extra =>
      medicUses.command(actor, "inpatientCare", {
        confirmed: true,
        targetUuid: target?.uuid ?? null,
        healedAmount: Number(extra?.healedAmount ?? 30),
        ...extra
      }, operationId())
    );
  }

  if (cmd === "urgentCareCentre") {
    return confirmPlayUse("Urgent Care Centre", extra =>
      medicUses.command(actor, "urgentCareCentre", {
        confirmed: true,
        isCantrip: false,
        artLevel: 1,
        rolledHealing: Number(extra?.rolledHealing ?? 10),
        ...extra
      }, operationId())
    );
  }

  // Default simple execution for other commands
  return confirmPlayUse(cmd, extra =>
    medicUses.command(actor, cmd, { confirmed: true, ...extra }, operationId())
  );
}

const eligible = actor => actor?.type === "character" && medicProfile(actor).applicable;

export function renderMedicControls(app, element) {
  const actor = actorFor(app);
  if (!eligible(actor) || (!actor.isOwner && !game.user?.isGM)) return;

  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-medic-sheet-panel")) old.remove();
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (!features) continue;

    const view = getMedicView(actor);
    const panel = node("section", null, "ak5e-medic-sheet-panel");
    panel.append(node("h3", "Medic"));

    if (view.profile.configured) {
      const summary = node("div", null, "ak5e-medic-summary ak5e-medic-badges");
      const lsText = view.lifeSupport
        ? `Life Support: ${view.lifeSupport.value} / ${view.lifeSupport.max}${view.lifeSupport.over > 0 ? ` (+${view.lifeSupport.over})` : ""}${view.resuscitation ? ` · Resuscitation: ${view.resuscitation.value}` : ""}`
        : "Life Support: 0 / 0";
      summary.append(node("span", lsText, "ak5e-medic-badge ak5e-medic-badge-ls"));

      const sDC = medicSpellDC(actor);
      summary.append(node("span", `Spell Save DC: ${sDC}`, "ak5e-medic-badge ak5e-medic-badge-dc"));

      const subclassName = view.branch
        ? view.branch.charAt(0).toUpperCase() + view.branch.slice(1)
        : "None";
      summary.append(node("span", `Subclass: ${subclassName}`, "ak5e-medic-badge ak5e-medic-badge-subclass"));

      const tuned = flag(actor, "medic")?.tuned;
      const currentWorldTime = globalThis.game?.time?.worldTime;
      const isExpired = Boolean(
        (tuned?.worldTimeExpires && currentWorldTime && currentWorldTime > tuned.worldTimeExpires) ||
        (tuned?.expiresAt && Date.now() > tuned.expiresAt)
      );
      const tuningText = (tuned?.name && !isExpired)
        ? `Tuned: ${tuned.name}${tuned.bonusDie ? ` (+${tuned.bonusDie})` : ""}`
        : "Tuned: Inactive";
      summary.append(node("span", tuningText, "ak5e-medic-badge ak5e-medic-badge-tuning"));

      panel.append(summary);
    }

    if (actor.isOwner) {
      panel.append(
        button(view.profile.configured ? "Open Medic Controls" : "Set up Medic", () => openMedicControls(actor))
      );
    }

    panel.append(node("p", "Opening this panel makes no changes (confirm before use).", "ak5e-medic-note"));
    features.prepend(panel);
  }
}

export function registerMedicSheetHooks() {
  if (installed) return;
  installed = true;

  if (globalThis.Hooks?.on) {
    Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
      const actor = actorFor(app);
      if (!eligible(actor) || !actor.isOwner || controls.some(c => c.action === "ak5eMedic")) return;
      controls.unshift({
        action: "ak5eMedic",
        icon: "fa-solid fa-notes-medical",
        label: "Medic",
        ownership: "OWNER",
        onClick: () => safe(() => openMedicControls(actor))
      });
    });

    Hooks.on("renderActorSheetV2", renderMedicControls);
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try {
        renderPlayUseCard(medicUses, message, html);
      } catch (error) {
        console.error("AK5e | Medic use card", error);
      }
    });
  }
}
