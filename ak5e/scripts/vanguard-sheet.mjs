/** Owner-facing Vanguard controls. Opening controls is read-only; each use is confirmed. */
import { vanguardProfile, vanguardEnabled, vanguardState } from "./vanguard-rules.mjs";
import { previewVanguardSetup, applyVanguardSetup } from "./vanguard-setup.mjs";
import { vanguardChoices, previewVanguardProgression, applyVanguardProgression, inspectVanguardFields } from "./vanguard-progression.mjs";
import { vanguardUses, recordVanguardRuling, registerTipTemporaryHpHooks, TIP_GRANT_KIND_LEADING_LANCE, TIP_GRANT_KIND_DEVASTATING_BLOW } from "./vanguard-uses.mjs";
import { extraAttacksCount } from "./vanguard-features.mjs";
import { confirmPlayUse, openPlayUndoList, renderPlayUseCard, refreshChatMessages, registerPlayUseCardRefresh } from "./play-uses-sheet.mjs";
import { isLocked } from "./play-undo.mjs";
import { vanguardExtensionContext, vanguardOwnerControls, vanguardAttackActionBonus, checkVanguardTipGrant } from "./vanguard-extensions.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actors = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const items = collection => Array.from(collection?.values?.() ?? collection ?? []);
const targetToken = () => items(globalThis.game?.user?.targets)[0] ?? null;
const encode = value => value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
const decode = value => { try { return JSON.parse(value); } catch { return value; } };
function setPath(root, path, value) { const parts = path.split("."), leaf = parts.pop(); let node = root; for (const part of parts) node = node[part] ??= {}; node[leaf] = value; }
let installed = false;

/** The public boundary card is an owner request, never a GM approval gate. */
function renderTipTemporaryHpReconciliation(message, html) {
  const evidence = message.getFlag?.("ak5e", "vanguardTipTemporaryHp") ?? message.flags?.ak5e?.vanguardTipTemporaryHp;
  if (!evidence || html.querySelector(".ak5e-tip-thp-reconcile")) return;
  const actor = globalThis.fromUuidSync?.(evidence.actorUuid);
  if (!actor?.isOwner) return;
  const use = vanguardUses.receipt(actor, evidence.useId);
  if (!use || use.status === "undone") return;
  const locked = isLocked(use) && !game.user.isGM;
  const button = document.createElement("button");
  button.type = "button"; button.className = "ak5e-tip-thp-reconcile"; button.disabled = locked;
  button.textContent = locked ? "Locked (encounter window ended)" : "Reconcile remaining Tip HP";
  button.addEventListener("click", async event => {
    event.preventDefault(); event.stopPropagation(); button.disabled = true;
    try {
      const manual = !use.tipBoundaryReached;
      const selected = await foundry.applications.api.DialogV2.wait({
        window: { title: "Confirm Tip temporary HP reconciliation" }, position: { width: 560 }, rejectClose: false,
        content: `<p>${esc(actor.name)} — ${esc(use.targetName)}. Reading: ${esc(evidence.readingValue)}.</p><p>The source's next Turn deadline was captured on the original use. Current snapshot: ${esc(evidence.expectedTemp)} Temporary HP. Any intervening write requires a fresh snapshot.</p><p>Choose only this grant's remaining contribution. Zero preserves the entire pool; unrelated HP is preserved. This choice is public and undoable.</p><label>Remaining Tip HP (0–${esc(evidence.max)}) <input name="remaining" type="number" min="0" max="${esc(evidence.max)}" step="1" value="0" required></label><label>Reason <input name="reason" type="text" minlength="10" required></label>${manual ? '<label><input name="manualBoundary" type="checkbox" required> I confirm that the source\'s next Turn boundary occurred manually; my reason explains it.</label>' : ""}`,
        buttons: [{ action: "settle", label: "Confirm settlement", callback: (_event, target) => {
          const form = target.form;
          if (form.reportValidity && !form.reportValidity()) return false;
          return { remaining: Number(form.elements.remaining.value), reason: form.elements.reason.value,
            manualBoundary: manual && form.elements.manualBoundary.checked };
        } }, { action: "cancel", label: "Cancel", default: true, callback: () => false }]
      });
      if (!selected || typeof selected !== "object") return;
      const operationId = foundry.utils.randomID();
      await confirmPlayUse("Settle Tip temporary HP", extra => vanguardUses.command(actor, "settleTipTemporaryHp", {
        useId: evidence.useId, remaining: selected.remaining, reason: selected.reason,
        expectedTemp: evidence.expectedTemp, expectedRevision: evidence.expectedRevision,
        manualBoundary: selected.manualBoundary, ...extra
      }, operationId), { confirmed: true });
    } catch (error) {
      console.error("AK5e | Tip temporary HP reconciliation", error);
      ui.notifications.error(error.message);
    } finally { button.disabled = locked; }
  });
  html.querySelector(".message-content")?.append(button);
}

async function prompt(title, content, field) {
  return foundry.applications.api.DialogV2.prompt({ window: { title }, rejectClose: false, content,
    ok: { label: "Continue", callback: (_event, target) => field(target.form ?? target.closest("form")) } });
}

function visibleTipTokens(actor) {
  return items(globalThis.canvas?.tokens?.placeables).filter(token => token.actor && token.actor.uuid !== actor.uuid
    && !token.document?.hidden && token.isVisible !== false);
}

/**
 * Pick the recipient of one individual granted Tip (visible token other than the Vanguard); resolves
 * `{ uuid, name }` or null when cancelled. Exported for branch controls (Pioneer, Charger, ...).
 */
export async function chooseTipTarget(actor, title) {
  const tokens = visibleTipTokens(actor);
  if (!tokens.length) throw new Error("Place or reveal an allied target token before using Tip of the Spear.");
  return prompt(title, `<p>Choose the recipient for this individual Tip of the Spear grant.</p><label>Target <select name="target">${tokens.map(token => `<option value="${esc(token.actor.uuid)}">${esc(token.name)}</option>`).join("")}</select></label>`, form => {
    const uuid = form.elements.target.value, token = tokens.find(candidate => candidate.actor.uuid === uuid);
    return token ? { uuid, name: token.name } : null;
  });
}

async function directedTipChoice(actor) {
  if (actor.getFlag?.("ak5e", "vanguard")?.directedEngagementActive !== true) return null;
  return prompt("Directed Engagement: choose Tip outcome", `<label>Outcome <select name="choice">${[1,2,3,4,5,6].map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>`, form => Number(form.elements.choice.value));
}

/**
 * One confirmed, granted Tip of the Spear use. `extra` identifies the grant: `{ grantKind, sourceEventId, grantIndex }`
 * (kind registered through registerVanguardTipGrantSource). A live receipt for the same grant is resumed rather than
 * duplicated; an invented or already-undone-source grant is rejected before any dialog opens. Resolves the command
 * result, or null when the player cancels. Exported for branch controls.
 */
export async function useGrantedTip(actor, target, id, extra = {}) {
  const prior = vanguardUses.uses(actor).filter(use => use.command === "tipOfTheSpear"
    && use.data?.sourceEventId === extra.sourceEventId && use.data?.grantIndex === extra.grantIndex
    && (extra.grantKind === undefined || use.data?.grantKind === extra.grantKind));
  const live = prior.find(use => use.status !== "undone");
  const operationId = live?.id ?? `${id}-attempt-${prior.length + 1}`;
  if (!live && extra.grantKind !== undefined) {
    const checked = checkVanguardTipGrant(extra.grantKind, actor, extra.sourceEventId, extra.grantIndex);
    if (!checked.ok) throw new Error(checked.reason);
  }
  const choice = await directedTipChoice(actor);
  if (actor.getFlag?.("ak5e", "vanguard")?.directedEngagementActive === true && choice === null) return null;
  const approved = await foundry.applications.api.DialogV2.confirm({ window: { title: "Confirm granted Tip of the Spear use" }, rejectClose: false,
    content: `<p>Confirm one granted Tip use by ${esc(actor.name)} on ${esc(target.name)}. The recipient still chooses any required native die results.</p>`,
    yes: { label: "Confirm Tip use" }, no: { label: "Cancel", default: true } });
  if (!approved) return null;
  return confirmPlayUse("Tip of the Spear", options => vanguardUses.command(actor, "tipOfTheSpear", {
    ...options, ...extra, target, confirmed: true,
    ...(choice === null ? {} : { directed: true, choice })
  }, operationId));
}

async function resolveOperatorSkillTrigger(actor, item, origin) {
  const sourceId = item?.getFlag?.("ak5e", "chapterThreeId") ?? item?.flags?.ak5e?.chapterThreeId;
  const activationId = origin?.activationId;
  if (!activationId) throw new Error("This Operator Skill card has no committed activation receipt.");
  if (sourceId === "operator-skill-vanguard-basic-leading-lance") {
    const qualifies = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Leading Lance: confirm qualifying kill" }, rejectClose: false,
      content: `<p>Confirm that the Leading Lance Melee Weapon Attack hit and reduced its target to 0 Hit Points. The bonus weapon damage die remains a player-rolled native damage component.</p>`,
      yes: { label: "Confirm hit and kill" }, no: { label: "No qualifying kill" }
    });
    if (!qualifies) return null;
    for (let index = 0; index < 2; index++) {
      const target = await chooseTipTarget(actor, `Leading Lance — Tip ${index + 1} of 2`);
      if (!target) return null;
      const id = `vanguard-lance-${activationId}-tip-${index + 1}`;
      await useGrantedTip(actor, target, id, { grantKind: TIP_GRANT_KIND_LEADING_LANCE, sourceEventId: activationId, grantIndex: index + 1 });
    }
    const id = `vanguard-lance-${activationId}-sp`;
    const approved = await foundry.applications.api.DialogV2.confirm({ window: { title: "Confirm Leading Lance Skill Point grant" }, rejectClose: false,
      content: `<p>Confirm recording the committed Leading Lance qualifying kill. The shared Operator Skill Point pool receives up to 10, capped at its existing maximum.</p>`,
      yes: { label: "Confirm 10 SP grant" }, no: { label: "Cancel", default: true } });
    if (!approved) return null;
    return confirmPlayUse("leadingLanceSP", extra => vanguardUses.command(actor, "leadingLanceSP", {
      ...extra, confirmed: true, eventId: activationId
    }, id));
  }
  if (sourceId === "operator-skill-vanguard-advanced-devastating-blow") {
    const qualifies = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Devastating Blow: confirm hit" }, rejectClose: false,
      content: `<p>Confirm that you hit with a Melee Attack using Devastating Blow. This workflow does not roll or apply the source's area damage.</p>`,
      yes: { label: "Confirm Melee hit" }, no: { label: "No qualifying hit" }
    });
    if (!qualifies) return null;
    const target = await chooseTipTarget(actor, "Devastating Blow — Tip of the Spear");
    if (!target) return null;
    return useGrantedTip(actor, target, `vanguard-devastating-${activationId}-tip`, { grantKind: TIP_GRANT_KIND_DEVASTATING_BLOW, sourceEventId: activationId, grantIndex: 1 });
  }
  throw new Error("This Operator Skill has no Vanguard Tip trigger bridge.");
}

export async function openVanguardSetup(actor) {
  const plan = await previewVanguardSetup(actor);
  const summary = [...plan.creates.map(item => `Grant ${item.name}`), ...plan.kept.map(name => `Already present: ${name}`)];
  const approved = await foundry.applications.api.DialogV2.confirm({
    window: { title: `Vanguard setup — ${actor.name}` }, rejectClose: false,
    content: `<p>Preview only. Confirm to add the listed core and selected branch Features.</p><ul>${summary.map(row => `<li>${esc(row)}</li>`).join("")}</ul>`,
    yes: { label: "Apply setup" }, no: { label: "Cancel" }
  });
  if (!approved) return null;
  return applyVanguardSetup(actor, { confirmed: true, contextKey: plan.contextKey });
}

export async function openVanguardProgression(actor, choices = {}) {
  let error = "";
  for (;;) {
    const selectedChoices = vanguardChoices(actor, choices), fields = inspectVanguardFields(actor, selectedChoices);
    const controls = fields.map(descriptor => {
      const multi = descriptor.count > 1, selected = Array.isArray(descriptor.selected) ? descriptor.selected : descriptor.selected == null ? [] : [descriptor.selected];
      const options = descriptor.options.map(option => {
        const value = encode(option.value), checked = selected.some(item => encode(item) === value);
        return multi ? `<label><input type="checkbox" name="${esc(descriptor.key)}" value="${esc(value)}"${checked ? " checked" : ""}> ${esc(option.label)}</label>`
          : `<option value="${esc(value)}"${checked ? " selected" : ""}>${esc(option.label)}</option>`;
      }).join("");
      const sourceNotes = descriptor.options.filter(option => option.effect || option.moduleEffect);
      const details = sourceNotes.length ? `<details><summary>Source effects</summary><ul>${sourceNotes.map(option => `<li><strong>${esc(option.label)}</strong>: ${esc(option.effect ?? "")}${option.moduleEffect ? ` <em>Module:</em> ${esc(option.moduleEffect)}` : ""}</li>`).join("")}</ul></details>` : "";
      return `<fieldset><legend>${esc(descriptor.label)}</legend>${multi ? options : `<select name="${esc(descriptor.key)}"><option value="">Choose…</option>${options}</select>`}${details}</fieldset>`;
    }).join("");
    const selected = await foundry.applications.api.DialogV2.wait({ window: { title: `Vanguard progression — ${actor.name}` }, position: { width: 780 }, rejectClose: false,
      content: `<section class="ak5e-vanguard-progression">${error ? `<p role="alert">${esc(error)}</p>` : ""}<p>Choose only the options supported by the source. HP uses your already rolled result or fixed average; no dice are rolled here.</p>${controls}</section>`,
      buttons: [{ action: "preview", label: "Preview changes", default: true, callback: (_event, button) => {
        const next = structuredClone(selectedChoices);
        for (const descriptor of fields) {
          const nodes = [...button.form.querySelectorAll(`[name="${CSS.escape(descriptor.key)}"]`)];
          const values = nodes.filter(node => node.type === "checkbox" ? node.checked : node.value !== "").map(node => decode(node.value));
          if (values.length) setPath(next, descriptor.key, descriptor.count > 1 ? values : values[0]);
        }
        return next;
      } }, { action: "cancel", label: "Cancel", callback: () => false }] });
    if (!selected || typeof selected !== "object") return null;
    choices = selected;
    const plan = await previewVanguardProgression(actor, choices);
    const changes = [...Object.entries(plan.writes).map(([key, value]) => `${key} → ${JSON.stringify(value)}`),
      ...plan.createItems.map(item => `Add ${item.name}`), ...plan.updateItems.map(item => `Update ${item._id}`)];
    const decision = await foundry.applications.api.DialogV2.wait({ window: { title: `Review Vanguard progression — ${actor.name}` }, position: { width: 680 }, rejectClose: false,
      content: `<p>Vanguard level ${plan.level}</p>${plan.warnings.length ? `<ul role="status">${plan.warnings.map(warning => `<li>${esc(warning)}</li>`).join("")}</ul>` : ""}<ul>${changes.map(change => `<li>${esc(change)}</li>`).join("") || "<li>No changes</li>"}</ul>${plan.pending.length ? `<p role="alert">Still needed: ${esc(plan.pending.join(", "))}</p>` : ""}<label><input name="confirm" type="checkbox"> I reviewed these exact changes.</label>`,
      buttons: [{ action: "apply", label: "Apply progression", default: true, callback: (_event, button) => button.form.elements.confirm?.checked ? true : "edit" },
        { action: "edit", label: "Edit choices", callback: () => "edit" }, { action: "cancel", label: "Cancel", callback: () => false }] });
    if (decision === "edit") { error = "Review the progression choices."; continue; }
    if (decision !== true) return null;
    if (plan.pending.length) { error = `Complete all required choices: ${plan.pending.join(", ")}.`; continue; }
    const result = await applyVanguardProgression(actor, { confirmed: true, contextKey: plan.contextKey, choices: plan.choices });
    await openVanguardSetup(actor);
    return result;
  }
}

export async function openVanguardControls(actor) {
  if (!actor?.isOwner) throw new Error("Vanguard controls are available to the Actor's owner.");
  const profile = vanguardProfile(actor), state = vanguardState(actor);
  const descriptors = vanguardOwnerControls(vanguardExtensionContext(actor, { branchId: profile.branchId, level: profile.level,
    profile, choices: vanguardChoices(actor), purpose: "controls" }));
  const extensionControls = new Map();
  for (const descriptor of descriptors) {
    if (!descriptor.id?.startsWith(`${profile.branchId}:`) || extensionControls.has(descriptor.id) || !["use", "dialog"].includes(descriptor.kind)) throw new Error("Invalid Vanguard extension control.");
    extensionControls.set(descriptor.id, descriptor);
  }
  const extensionHtml = [...extensionControls.values()].map((descriptor, index) => `<button type="button" data-extension-index="${index}">${esc(descriptor.label)}</button>${descriptor.hint ? `<p>${esc(descriptor.hint)}</p>` : ""}`).join("");
  const buttons = vanguardEnabled(actor)
    ? `<button type="button" data-action="setup">Refresh class features</button>
       <button type="button" data-action="progression">Progression and choices</button>
       <button type="button" data-action="operatorSkills">Operator Skills</button>
       <button type="button" data-action="quickOffTheMark">Quick off the Mark: choose +PB for next Initiative roll</button>
       <button type="button" data-action="attackAction">Attack Action procedure</button>
       <button type="button" data-action="tip">Tip of the Spear</button>
       <button type="button" data-action="nimble">Record Nimble hit</button>
       <button type="button" data-action="clearTurnProtection">Clear end-of-turn records</button>
       <button type="button" data-action="uncanny">Uncanny Dodge</button>
       <button type="button" data-action="directed">Directed Engagement</button>
       <button type="button" data-action="lightspeed">Lightspeed checklist</button>
       <button type="button" data-action="storm">Approaching Storm</button>
       <button type="button" data-action="undoOperatorActivation">Undo a Vanguard Operator Skill activation</button>
       <button type="button" data-action="undo">Undo recent use</button>`
    : `<button type="button" data-action="progression">Choose branch and progression</button>
       <button type="button" data-action="setup">Preview and apply setup</button>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Vanguard — ${actor.name}` }, position: { width: 560 }, rejectClose: false,
    content: `<section class="ak5e-vanguard-controls"><h3>${esc(actor.name)} — Vanguard ${profile.level ?? "?"}</h3>
      <p>Martial DC ability: ${esc(state.martialDCAbility ?? "choose in setup")} · Branch: ${esc(profile.branch ?? "unselected")}</p>
      ${buttons}${extensionHtml}<p>Roll and save dice only from owner-clicked chat controls. Uncanny Dodge applies half damage in place of the full native damage card. Lightspeed requires the table to track its extra turn and normal refreshes manually.</p></section>`,
    buttons: [{ action: "close", label: "Close" }],
    render: (_event, app) => { app.element.querySelectorAll("[data-extension-index]").forEach(button => button.addEventListener("click", async event => {
      event.preventDefault(); button.disabled = true;
      try {
        const id = [...extensionControls.keys()][Number(button.dataset.extensionIndex)];
        const currentActor = await globalThis.fromUuid(actor.uuid);
        if (!currentActor?.isOwner || currentActor.uuid !== actor.uuid) throw new Error("Actor ownership changed.");
        const currentProfile = vanguardProfile(currentActor);
        const current = vanguardOwnerControls(vanguardExtensionContext(currentActor, { branchId: currentProfile.branchId, level: currentProfile.level,
          profile: currentProfile, choices: vanguardChoices(currentActor), purpose: "controls" })).find(control => control.id === id);
        if (!current || current.kind !== extensionControls.get(id)?.kind) throw new Error("Vanguard control is no longer available.");
        if (current.kind === "dialog") return await current.open({ actor: currentActor, actorUuid: currentActor.uuid });
        if (typeof current.command !== "string" || !current.command) throw new Error("Invalid Vanguard extension command.");
        const operationId = foundry.utils.randomID();
        const data = current.prepare ? await current.prepare({ actor: currentActor, actorUuid: currentActor.uuid, operationId }) : {};
        if (data === null) return null;
        return await confirmPlayUse(current.label, extra => vanguardUses.command(currentActor, current.command, { ...data, ...extra, confirmed: true }, operationId));
      } catch (error) { console.error("AK5e | Vanguard extension control", error); ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    })); app.element.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation(); button.disabled = true;
      try {
        const action = button.dataset.action;
        if (action === "setup") return await openVanguardSetup(actor);
        if (action === "progression") return await openVanguardProgression(actor);
        if (action === "operatorSkills") {
          const module = await import("./operator-sheet.mjs");
          return await module.openOperatorSkillChoices(actor);
        }
        if (action === "attackAction") {
          const profile = vanguardProfile(actor);
          const count = 1 + extraAttacksCount(actor) + vanguardAttackActionBonus(actor, { branchId: profile.branchId, level: profile.level,
            profile, choices: vanguardChoices(actor) });
          return await foundry.applications.api.DialogV2.wait({ window: { title: "Vanguard Attack Action" }, rejectClose: false,
            content: `<p>Make up to <strong>${count}</strong> individual native weapon attacks as part of this Attack Action.</p><p>Roll each attack using its weapon's normal sheet control. This procedure records no die results and does not enforce Attack Action counts.</p>`,
            buttons: [{ action: "close", label: "Close" }] });
        }
        if (action === "undo") return await openPlayUndoList(vanguardUses, actor);
        const token = targetToken();
        const target = token?.actor;
        const operationId = foundry.utils.randomID();
        const confirmed = async (name, data = {}) => {
          const label = name === "tipOfTheSpear" ? "Tip of the Spear" : name;
          const targetName = data.target?.name ?? data.attacker?.name ?? "chosen target";
          const approved = await foundry.applications.api.DialogV2.confirm({ window: { title: `Confirm ${label}` }, rejectClose: false,
            content: `<p>Confirm this ${esc(label)} use by ${esc(actor.name)}${data.target || data.attacker ? ` on ${esc(targetName)}` : ""}. Review the recorded action and target before continuing.</p>`,
            yes: { label: "Confirm use" }, no: { label: "Cancel", default: true } });
          if (!approved) return null;
          return confirmPlayUse(label, extra => vanguardUses.command(actor, name, { ...data, ...extra, confirmed: true }, operationId));
        };
        if (action === "tip") {
          if (!target) throw new Error("Target an allied creature token first.");
          const qualified = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Tip of the Spear: confirm trigger" }, rejectClose: false,
            content: `<p>Confirm that a source rule grants this use of Tip of the Spear. The target and any eligibility exception are checked separately; this prompt records the trigger you observed.</p>`,
            yes: { label: "Confirm qualifying trigger" }, no: { label: "Cancel" }
          });
          if (!qualified) return;
          const choice = await directedTipChoice(actor);
          if (actor.getFlag?.("ak5e", "vanguard")?.directedEngagementActive === true && choice === null) return;
          return await confirmed("tipOfTheSpear", { target: { uuid: target.uuid, name: target.name }, ...(choice === null ? {} : { directed: true, choice }) });
        }
        if (action === "nimble") {
          if (!target) throw new Error("Target the creature you hit first.");
          return await confirmed("nimble", { target: { uuid: target.uuid, name: target.name } });
        }
        if (action === "clearTurnProtection") return await confirmed("clearTurnProtection");
        if (action === "quickOffTheMark") return await confirmed("quickOffTheMark");
        if (action === "undoOperatorActivation") {
          const ledger = actor.getFlag?.("ak5e", "operatorSkills")?.operatorEvents ?? [];
          const activations = ledger.filter(event => event.kind === "activation" && event.committed === true
            && String(event.sourceId ?? "").startsWith("operator-skill-vanguard-"));
          if (!activations.length) throw new Error("There is no committed Vanguard Operator Skill activation to undo.");
          const selected = await prompt("Undo a Vanguard Operator Skill activation", `<label>Activation <select name="activationId">${activations.map(event => `<option value="${esc(event.activationId)}">${esc(event.name ?? event.sourceId)} — ${esc(event.activationId)}</option>`).join("")}</select></label>`, form => form.elements.activationId.value);
          if (!selected) return;
          const dependencies = vanguardUses.state(actor).undo.filter(receipt => receipt.status !== "undone" && (
            receipt.command === "leadingLanceSP" && receipt.eventId === selected || receipt.operatorSources?.some(source => source.actorUuid === actor.uuid && source.activationId === selected)
          )).reverse();
          if (dependencies.length) {
            const next = await foundry.applications.api.DialogV2.wait({ window: { title: "Undo dependent uses first" }, rejectClose: false,
              content: `<p>Undo these dependent uses in the order shown, then retry the activation undo:</p><ol>${dependencies.map(receipt => `<li>${esc(receipt.command)} — ${esc(receipt.id)}</li>`).join("")}</ol>`,
              buttons: [{ action: "list", label: "Open recent uses", callback: () => true }, { action: "cancel", label: "Cancel", default: true, callback: () => false }] });
            if (next) return await openPlayUndoList(vanguardUses, actor);
            return;
          }
          return await confirmed("undoOperatorActivation", { activationId: selected });
        }
        if (action === "uncanny") {
          const hp = actor.system?.attributes?.hp ?? {};
          const attackerToken = targetToken();
          const damage = await prompt("Uncanny Dodge — final damage", `<p>Confirm the incoming Attack hit this character. Enter the final damage after resistance, vulnerability, and other reductions. No damage is rolled here.</p><p>Attack source: ${esc(attackerToken?.name ?? "not recorded; confirm visibility and source")}</p><p>Current HP: ${esc(hp.value)} · Current Temporary HP: ${esc(hp.temp ?? 0)}</p><p>Apply only half the entered damage (rounded down) to HP/Temporary HP. Do not also apply the full damage from the native card.</p><label>Final damage <input name="damage" type="number" min="0" required></label>`, form => Number(form.elements.damage.value));
          if (damage === null) return;
          return await confirmed("uncannyDodge", { damage, attacker: attackerToken?.actor ? { uuid: attackerToken.actor.uuid, name: attackerToken.actor.name } : null });
        }
        if (action === "directed") {
          const choice = await prompt("Directed Engagement", `<label>Choose a Tip result <select name="choice">${[1,2,3,4,5,6].map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>`, form => Number(form.elements.choice.value));
          if (!choice || !target) throw new Error("Target an allied creature before using Directed Engagement.");
          return await confirmed("tipOfTheSpear", { directed: true, choice, target: { uuid: target.uuid, name: target.name } });
        }
        if (action === "storm") {
          const componentIndex = await prompt("Approaching Storm component", `<p>Choose which native Damage Roll component receives the bonus for the “once” reading. Component 0 is the first; the default is 0. “Per roll” uses every distinct component.</p><label>Component index <input name="index" type="number" min="0" step="1" value="0"></label>`, form => Number(form.elements.index.value));
          if (componentIndex === null) return;
          return await confirmed("approachingStorm", { round: game.combat?.round ?? 1, componentIndex });
        }
        if (action === "lightspeed") {
          const initiative = items(game.combat?.turns).find(entry => entry.actor?.uuid === actor.uuid)?.initiative;
          const step = await prompt("Lightspeed — guided procedure", `<p>Record the extra turn. No Combatant is created and no synthetic turn event is emitted. The table must complete this turn and perform normal refreshes/expiry manually.</p><label>Step <select name="phase"><option value="begin">Begin second turn</option><option value="complete">Complete second turn</option></select></label><label>First-turn Initiative <input name="initiative" type="number" value="${esc(initiative ?? "")}"></label>`, form => ({ phase: form.elements.phase.value, initiative: form.elements.initiative.value === "" ? undefined : Number(form.elements.initiative.value) }));
          if (!step) return;
          return await confirmed("lightspeed", step);
        }
      } catch (error) { console.error("AK5e | Vanguard control action failed", error); ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    })); }
  });
}

const TRIGGER_SKILLS = ["operator-skill-vanguard-basic-leading-lance", "operator-skill-vanguard-advanced-devastating-blow"];
const messageFlag = (message, key) => message.getFlag?.("ak5e", key) ?? message.flags?.ak5e?.[key];
/**
 * Re-render the displayed Vanguard chat cards (use cards, Tip temporary HP reconciliation, Operator Skill trigger cards).
 * Foundry V13 draws the chat log before `ready`, when these render hooks did not exist yet, so cards already on screen
 * lacked their Roll / Retry / Undo controls (B-308). Re-rendering is idempotent: a fresh render replaces the element.
 */
export function refreshVanguardCards() {
  return refreshChatMessages(message => {
    if (messageFlag(message, vanguardUses.cardFlag) || messageFlag(message, "vanguardTipTemporaryHp")) return true;
    const origin = messageFlag(message, "skillOrigin");
    if (!origin?.skillUuid || !origin.activationId) return false;
    const item = globalThis.fromUuidSync?.(origin.skillUuid);
    return TRIGGER_SKILLS.includes(item?.getFlag?.("ak5e", "chapterThreeId") ?? item?.flags?.ak5e?.chapterThreeId);
  });
}

export function registerVanguardSheetHooks() {
  registerTipTemporaryHpHooks();
  if (installed) return;
  installed = true;
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actors(app);
    if (!actor?.isOwner || !vanguardProfile(actor).applicable || controls.some(control => control.action === "ak5eVanguard")) return;
    controls.unshift({ action: "ak5eVanguard", icon: "fa-solid fa-person-running", label: "Vanguard", ownership: "OWNER", onClick: () => openVanguardControls(actor) });
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    renderTipTemporaryHpReconciliation(message, html);
    renderPlayUseCard(vanguardUses, message, html);
    const origin = message.getFlag?.("ak5e", "skillOrigin") ?? message.flags?.ak5e?.skillOrigin;
    const item = origin?.skillUuid ? globalThis.fromUuidSync?.(origin.skillUuid) : null;
    const sourceId = item?.getFlag?.("ak5e", "chapterThreeId") ?? item?.flags?.ak5e?.chapterThreeId;
    if (!origin?.activationId || !TRIGGER_SKILLS.includes(sourceId)) return;
    const actor = item.parent;
    if (!actor?.isOwner || html.querySelector(".ak5e-vanguard-skill-trigger")) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "ak5e-vanguard-skill-trigger";
    button.textContent = sourceId === "operator-skill-vanguard-basic-leading-lance" ? "Resolve Leading Lance hit / kill" : "Resolve Devastating Blow hit";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await resolveOperatorSkillTrigger(actor, item, origin); }
      catch (error) { console.error("AK5e | Vanguard Operator Skill trigger failed", error); ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
    html.querySelector(".message-content")?.append(button);
  });
  Hooks.on("createChatMessage", (message, options, userId) => Promise.resolve(vanguardUses.handleRelay(message, options, userId)).catch(error => console.error("AK5e | Vanguard relay", error)));
  // The receipt is the card's source of truth: follow it (Roll appears, Retry/Undo update) whoever changes it.
  registerPlayUseCardRefresh(vanguardUses);
  // Cards drawn before this hook existed (the log renders before `ready`) get their controls now; once more if the log
  // itself has not finished its first render.
  refreshVanguardCards();
  if (globalThis.ui?.chat?.rendered === false && typeof Hooks.once === "function") Hooks.once("renderChatLog", () => refreshVanguardCards());
}

export const vanguardSheetApi = Object.freeze({ open: openVanguardControls, openSetup: openVanguardSetup, openProgression: openVanguardProgression });
export { vanguardUses, recordVanguardRuling };
