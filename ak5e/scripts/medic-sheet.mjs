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
import { renderTherapistSection, handleTherapistCommand, isTherapistCommand } from "./therapist-sheet.mjs";
import { renderWardSection, handleWardCommand, WARD_COMMANDS } from "./ward-sheet.mjs";
import { renderWitchcraftSection, handleWitchcraftCommand } from "./witchcraft-sheet.mjs";
import { getMedicView, lifeSupport, resuscitation, mobileHospital } from "./medic-features.mjs";
import { previewMedicSetup, applyMedicSetup } from "./medic-setup.mjs";
import { previewMedicProgression, applyMedicProgression, inspectMedicFields, medicChoices } from "./medic-progression.mjs";
import { openArtUndoList } from "./arts-casting.mjs";
import { standardPools } from "./caster-rules.mjs";
import { medicUses } from "./medic-uses.mjs";
import { confirmPlayUse, openPlayUndoList, renderPlayUseCard, refreshChatMessages, registerPlayUseCardRefresh } from "./play-uses-sheet.mjs";

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
const medicText = key => game.i18n.localize(`AK5E.Medic.${key}`);

const planDetails = plan => {
  const creates = plan.creates ?? plan.createItems ?? [];
  const writes = plan.actorUpdates ?? plan.writes ?? {};
  const arts = writes["flags.ak5e.artsPoints"];
  return `<p>${esc(medicText("ReviewHint"))}</p>
    <p>Medic level ${esc(plan.level)}${arts ? ` · Arts Points maximum ${esc(arts.maximum)} · maximum Art level ${esc(arts.maximumArtLevel)}` : ""}</p>
    <ul>${creates.map(item => `<li>Grant ${esc(item.name)}</li>`).join("")}</ul>
    ${writes["system.attributes.hp.max"] !== undefined ? `<p>Hit Point maximum: ${esc(writes["system.attributes.hp.max"])}</p>` : ""}
    ${(plan.warnings ?? []).map(warning => `<p role="alert">${esc(warning)}</p>`).join("")}`;
};

async function confirmMedicSetup(actor) {
  const plan = await previewMedicSetup(actor);
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: medicText("ReviewSetup") }, rejectClose: false,
    content: planDetails(plan),
    buttons: [
      { action: "apply", label: medicText("ConfirmSetup"), callback: () => "apply" },
      { action: "cancel", label: medicText("Cancel"), default: true, callback: () => "cancel" }
    ]
  });
  if (choice !== "apply") return null;
  return applyMedicSetup(actor, { confirmed: true, contextKey: plan.contextKey });
}

/** Choices remain local through editing and review; only the final explicit Apply writes. */
export async function openMedicProgression(actor) {
  let choices = medicChoices(actor);
  while (true) {
    const fields = inspectMedicFields(actor, choices).fields.map(field => {
      const options = [...field.options];
      if (field.count === 1 && field.selected?.mode === "existing" && !options.some(option => JSON.stringify(option.value) === JSON.stringify(field.selected))) {
        options.push({ value: field.selected, label: medicText("KeepSelection") });
      }
      return { ...field, options };
    });
    const edited = await foundry.applications.api.DialogV2.wait({
      window: { title: medicText("ProgressionChoices") }, position: { width: 600 }, rejectClose: false,
      content: `<p>${esc(medicText("ProgressionHint"))}</p>
        ${fields.map((field, index) => `<label>${esc(field.label)}${field.count > 1 ? ` (choose ${field.count})` : ""}
          <select name="medicChoice${index}" ${field.count > 1 ? `multiple size="${Math.min(6, field.options.length)}"` : ""}>
            ${field.count === 1 ? '<option value="">Choose…</option>' : ""}
            ${field.options.map((option, valueIndex) => {
              const selected = field.count > 1 ? (field.selected ?? []).some(value => JSON.stringify(value) === JSON.stringify(option.value))
                : JSON.stringify(field.selected) === JSON.stringify(option.value);
              return `<option value="${valueIndex}" ${selected ? "selected" : ""}>${esc(option.label)}</option>`;
            }).join("")}
          </select></label>`).join("")}`,
      buttons: [
        { action: "review", label: medicText("ReviewChoices"), callback: (_event, button) => {
          const next = structuredClone(choices);
          fields.forEach((field, index) => {
            const select = button.form.elements[`medicChoice${index}`];
            const values = [...select.selectedOptions].filter(option => option.value !== "")
              .map(option => structuredClone(field.options[Number(option.value)].value));
            const keys = field.key.split(".");
            const leaf = keys.pop();
            let target = next;
            for (const key of keys) target = target[key] ??= {};
            target[leaf] = field.count > 1 ? values : values[0] ?? null;
          });
          return { choices: next };
        } },
        { action: "cancel", label: medicText("Cancel"), default: true, callback: () => "cancel" }
      ]
    });
    if (!edited?.choices) return null;
    choices = edited.choices;
    const plan = await previewMedicProgression(actor, choices);
    const buttons = [{ action: "edit", label: medicText("EditChoices"), callback: () => "edit" }];
    if (!plan.pending.length) buttons.push({ action: "apply", label: medicText("ConfirmProgression"), callback: () => "apply" });
    buttons.push({ action: "cancel", label: medicText("Cancel"), default: true, callback: () => "cancel" });
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: medicText("ReviewProgression") }, position: { width: 600 }, rejectClose: false,
      content: `${plan.pending.length ? `<p role="alert">Complete choices: ${esc(plan.pending.map(key => fields.find(field => field.key === key)?.label ?? "Additional equipment choice").join(", "))}. Edit to see any additional equipment choices.</p>` : ""}${planDetails(plan)}
        <h4>Selected choices</h4><ul>${fields.map(field => {
          const keys = field.key.split(".");
          const value = keys.reduce((current, key) => current?.[key], choices);
          const chosen = field.count > 1 ? value ?? [] : [value];
          const labels = chosen.map(entry => field.options.find(option => JSON.stringify(option.value) === JSON.stringify(entry))?.label ?? "Not selected");
          return `<li>${esc(field.label)}: ${esc(labels.join(", "))}</li>`;
        }).join("")}</ul>`,
      buttons
    });
    if (action === "edit") continue;
    if (action !== "apply") return null;
    return applyMedicProgression(actor, { confirmed: true, choices, contextKey: plan.contextKey });
  }
}

/** Preview a pool locally, then confirm the exact grants and any prerequisite overrides. */
export async function openMedicSelfDefence(actor) {
  const selected = await foundry.applications.api.DialogV2.wait({
    window: { title: medicText("SelfDefence") }, rejectClose: false,
    content: `<p>${esc(medicText("SelfDefenceHint"))}</p><label>${esc(medicText("StandardPool"))}
      <select name="poolId"><option value="">${esc(medicText("ChoosePool"))}</option>
        ${standardPools.map(pool => `<option value="${esc(pool.id)}">${esc(pool.name)}</option>`).join("")}
      </select></label>`,
    buttons: [
      { action: "review", label: medicText("ReviewChoices"), callback: (_event, button) => ({ poolId: button.form.elements.poolId.value }) },
      { action: "cancel", label: medicText("Cancel"), default: true, callback: () => false }
    ]
  });
  if (!selected?.poolId) return null;
  const { previewSelfDefenceProtocol, applySelfDefenceProtocol } = await import("./medic-features.mjs");
  const plan = await previewSelfDefenceProtocol(actor, { poolId: selected.poolId });
  const pool = standardPools.find(entry => entry.id === selected.poolId);
  const warnings = (plan.warnings ?? []).map(warning => typeof warning === "string" ? warning : warning.text ?? String(warning));
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: medicText("SelfDefence") }, position: { width: 600 }, rejectClose: false,
    content: `<p>${esc(pool?.name ?? selected.poolId)} · ${esc(medicText("ArtsReduction"))}: ${esc(plan.reduction)}</p>
      <p>${esc(medicText("ReviewHint"))}</p>
      <ul>${(plan.creates ?? []).map(item => `<li>${esc(item.name)}</li>`).join("")}</ul>
      ${warnings.length ? `<ul role="alert">${warnings.map(warning => `<li>${esc(warning)}</li>`).join("")}</ul>` : ""}`,
    buttons: [
      { action: "apply", label: medicText(warnings.length ? "UseAnyway" : "ConfirmSelfDefence"), callback: () => "apply" },
      { action: "cancel", label: medicText("Cancel"), default: true, callback: () => "cancel" }
    ]
  });
  if (action !== "apply") return null;
  const result = await applySelfDefenceProtocol(actor, { poolId: selected.poolId, confirmed: true, contextKey: plan.contextKey });
  try {
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<h3>${esc(medicText("SelfDefence"))}</h3><p>${esc(pool?.name ?? selected.poolId)} · ${esc(medicText("ArtsReduction"))}: ${esc(plan.reduction)}</p>
        ${warnings.length ? `<p>${esc(medicText("OverriddenWarnings"))}</p><ul>${warnings.map(warning => `<li>${esc(warning)}</li>`).join("")}</ul>` : ""}
        <p>${esc(medicText("ArtsUndo"))}</p>`,
      flags: { ak5e: { medicSelfDefence: { actorUuid: actor.uuid, receiptId: result.receipt?.id ?? null, poolId: selected.poolId, warnings } } }
    });
  } catch (error) {
    console.error("AK5e | Self-Defence public card", error);
    ui.notifications.warn(medicText("SelfDefenceCardFailed"));
  }
  return result;
}

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
          <button type="button" data-medic-cmd="urgencyOfTreatment">${esc(medicText("UseUrgency"))}</button>
          <button type="button" data-medic-act="__selfDefence">${esc(medicText("SelfDefence"))}</button>
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

    // Branch sections (Therapist, Ward) — each module owns its markup and commands.
    if (branch === "therapist") {
      sections.push(renderTherapistSection(actor));
    }
    if (branch === "ward") {
      sections.push(renderWardSection(actor));
    }
    if (branch === "witchcraft") {
      sections.push(renderWitchcraftSection(actor));
    }

    // Progression and Undo Management
    sections.push(`
      <div class="ak5e-medic-action-group ak5e-medic-admin-row">
        <button type="button" data-medic-act="__progression">Medic Progression</button>
        <button type="button" data-medic-act="__undoList">Review / Undo Recent Uses</button>
        <button type="button" data-medic-act="__artsUndoList">${esc(medicText("ArtsUndo"))}</button>
      </div>
    `);
  }

  // Guidance notes
  sections.push(`
    <div class="ak5e-medic-notes">
      <p><em>${esc(medicText("ControlsNote"))}</em></p>
    </div>
  `);

  // Eight Ward controls plus sibling branch sections can exceed short viewports: keep the
  // dialog inside the viewport with an internal scroll instead of clipping controls away.
  const content = `<div class="ak5e-medic-controls-dialog" style="max-height:72vh;overflow-y:auto">${sections.join("")}</div>`;

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: `${actor.name} — Medic Controls` },
    position: { width: 560 },
    content,
    buttons: [{ action: "close", label: "Close", default: true }]
  });

  await dlg.render(true);

  // ApplicationV2 render resolves after the controls exist; no timing-dependent binding.
  {
    const el = dlg.element;
    if (!el) return;

    el.querySelectorAll("[data-medic-cmd]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        btn.disabled = true;
        safe(async () => {
          await handleMedicCommand(actor, btn.dataset.medicCmd);
          await dlg.close();
        }).finally(() => { btn.disabled = false; });
      });
    });

    el.querySelectorAll("[data-medic-act]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        btn.disabled = true;
        safe(async () => {
        const act = btn.dataset.medicAct;
        if (act === "__setup") {
          const result = await confirmMedicSetup(actor);
          if (result) ui.notifications.info("Core Medic features granted.");
          dlg.close();
        } else if (act === "__progression") {
          dlg.close();
          const result = await openMedicProgression(actor);
          if (result) ui.notifications.info("Medic progression updated.");
        } else if (act === "__undoList") {
          await openPlayUndoList(medicUses, actor);
        } else if (act === "__artsUndoList") {
          await openArtUndoList(actor);
        } else if (act === "__selfDefence") {
          await openMedicSelfDefence(actor);
        }
        }).finally(() => { btn.disabled = false; });
      });
    });
  }
}

export async function handleMedicCommand(actor, cmd, context = {}) {
  if (isTherapistCommand(cmd)) return handleTherapistCommand(actor, cmd, context);
  if (WARD_COMMANDS.includes(cmd)) return handleWardCommand(actor, cmd, context);
  if (await handleWitchcraftCommand(actor, cmd, context)) return true;
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
    return foundry.applications.api.DialogV2.wait({
      window: { title: "Urgency of Treatment" },
      rejectClose: false,
      content: `<p>${esc(medicText("UrgencyGuidance"))}</p><p>${esc(medicText("UrgencyUndoHint"))}</p>`,
      buttons: [{ action: "close", label: medicText("Close"), default: true, callback: () => "close" }]
    });
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
  // Ward F6: a Treat-the-Cause entry point on D&D5e attack cards. The button carries the
  // attack message UUID into the Ward dialog so the plan can correlate the source-bound
  // forced miss to the actual attack card (WORKFLOW.md §3.2: no auto dice; the dialog still
  // confirms before anything is written). The warded target comes from the user's current
  // targets at click time; the attacker stays a manual dialog input.
  function wardTreatCandidates() {
    const actors = globalThis.game?.actors;
    const list = typeof actors?.filter === "function" ? actors.filter(actor =>
      actor?.isOwner && !actor.pack
      && medicBranch(actor) === "ward" && (medicLevel(actor) ?? 1) >= 7) : [];
    return list;
  }
  function renderTreatTheCauseButton(message, html) {
    if (message?.flags?.dnd5e?.roll?.type !== "attack") return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root?.querySelectorAll || root.querySelector("[data-ak5e-treat-cause]")) return;
    if (wardTreatCandidates().length === 0) return;
    const host = root.querySelector(".message-content") ?? root.querySelector(".card-buttons") ?? root;
    const el = node("button", "Treat the Cause (Ward)", "ak5e-treat-cause-button");
    el.type = "button";
    el.dataset.ak5eTreatCause = message.uuid;
    el.title = "Open Treat the Cause with this attack card bound as the trigger";
    el.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      el.disabled = true;
      safe(async () => {
        const candidates = wardTreatCandidates();
        if (candidates.length === 0) {
          ui?.notifications?.warn?.("No owned Ward Medic (level 7+) can answer this attack.");
          return;
        }
        if (candidates.length > 1) {
          ui?.notifications?.warn?.(`Several Ward Medics (${candidates.map(m => m.name).join(", ")}) could answer; open Treat the Cause from the acting Medic's own Medic panel so the right Medic spends the Reaction.`);
          return;
        }
        await handleWardCommand(candidates[0], "treatTheCause", { attackMessageUuid: message.uuid });
      }).finally(() => { el.disabled = false; });
    });
    host.append(el);
  }

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
      try {
        renderTreatTheCauseButton(message, html);
      } catch (error) {
        console.error("AK5e | Treat the Cause card button", error);
      }
    });
    // Chat was rendered before ready; redraw already-displayed attack and Medic cards.
    registerPlayUseCardRefresh(medicUses);
    refreshChatMessages(message => message?.flags?.dnd5e?.roll?.type === "attack"
      || Boolean(message?.flags?.ak5e?.[medicUses.cardFlag]));
  }
}
