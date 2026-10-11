import { CHAPTER_THREE_CLASSES } from "./chapter-three-content.mjs";
import { actorOperatorSkills, getIntegratedOperatorState, isOperatorActor, operatorActors, submitOperatorCommand,
  activateIntegratedSkill, endIntegratedSkill, recordSkillPointEvent, configureOperatorSkill, adjustOperatorSP,
  recoverOperatorSkills, spText, getOperatorSkillChoices, isLiveProgressionActor, resolveOperatorSkillPhase } from "./operator-skills.mjs";
import { profileForSkill, updateOperatorSkills } from "./operator-targeting.mjs";
import { CHARGING_METHODS } from "./operator-rules.mjs";
import { operatorChoiceUser } from "./operator-progression.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const safely = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Operator Skills UI", error); ui.notifications.error(error.message); });
const field = (key, input) => `<label>${esc(spText(key))}${input}</label>`;
const select = (name, options, current = "") => `<select name="${name}">${options.map(([value, label]) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
const checkbox = (name, checked = false) => `<input type="checkbox" name="${name}"${checked ? " checked" : ""}>`;
const input = (name, value, attributes = "") => `<input name="${name}" value="${esc(value)}" ${attributes}>`;

async function dialog(title, content, buttons, options = {}) {
  let closed;
  const result = await foundry.applications.api.DialogV2.wait({ ...options, window: { title }, content: `<div class="ak5e-operator-dialog">${content}</div>`,
    rejectClose: false, buttons, render: (event, application) => {
      closed = new Promise(resolve => application.addEventListener("close", resolve, { once: true }));
      options.render?.(event, application);
    } });
  if (closed) await closed;
  return result;
}

const choiceDialogs = new Map(), choiceApplications = new Map(), seenPrompts = new Map(), progressionTimers = new Map(), advancingActors = new Set(), seenSheets = new Set();

export function openOperatorSkillChoices(actor, { automatic = false } = {}) {
  if (!actor?.isOwner || !isLiveProgressionActor(actor)) return Promise.reject(new Error(spText("ChoiceActorRequired")));
  if (advancingActors.has(actor.uuid)) return automatic ? Promise.resolve(false) : Promise.reject(new Error(spText("FinishAdvancement")));
  if (choiceDialogs.has(actor.uuid)) return choiceDialogs.get(actor.uuid);
  const view = getOperatorSkillChoices(actor);
  if (!view.applicable || !view.pending.length && !view.blocked.length && !view.slots.some(slot => slot.recovery)) return Promise.resolve(false);
  const signature = JSON.stringify([view.classId, view.branchName, view.pending.map(slot => slot.key), view.blocked,
    view.slots.filter(slot => slot.recovery).map(slot => slot.key)]);
  if (automatic && (advancingActors.has(actor.uuid) || seenPrompts.get(actor.uuid)?.has(signature))) return Promise.resolve(false);
  const seen = seenPrompts.get(actor.uuid) ?? new Set();
  const task = Promise.resolve().then(() => {
    // Document render can precede its update hook: check again after that hook marked advancement in progress.
    if (advancingActors.has(actor.uuid)) {
      if (automatic) return false;
      throw new Error(spText("FinishAdvancement"));
    }
    seen.add(signature); seenPrompts.set(actor.uuid, seen);
    return skillChoicesDialog(actor);
  }).finally(() => { choiceDialogs.delete(actor.uuid); choiceApplications.delete(actor.uuid); });
  choiceDialogs.set(actor.uuid, task);
  return task;
}

async function skillChoicesDialog(actor) {
  const selected = new Map();
  for (;;) {
    const view = getOperatorSkillChoices(actor);
    if (!actor.isOwner || !isLiveProgressionActor(actor)) throw new Error(spText("OwnerRequired"));
    const offered = view.slots.filter(slot => slot.status === "pending" || slot.recovery);
    if (!view.applicable || !offered.length && !view.blocked.length) return false;
    for (const slot of offered) if (slot.recovery) selected.set(slot.key, slot.selection.sourceId);
    const content = `<div class="ak5e-skill-choices"><p>${esc(spText("ChoiceHint"))}</p>
      ${!view.branchName ? `<p>${esc(spText("BranchHint"))}</p>` : ""}
      ${view.blocked.map(reason => `<p class="ak5e-choice-warning" role="alert">${esc(spText(reason))}</p>`).join("")}
      ${offered.map(slot => `<section><h3>${esc(spText(slot.tier))} · ${esc(spText("Level"))} ${slot.level}</h3>
        ${field("Skill", select(`skill-${slot.tier.toLowerCase()}`, [["", spText("SelectSkill")], ...(slot.recovery ? CHAPTER_THREE_CLASSES.filter(entry => entry.id === slot.selection.sourceId) : slot.options).map(entry => [entry.id, `${entry.name} (${entry.operatorSkill.cost} SP; ${entry.operatorSkill.source})`])], selected.get(slot.key) ?? ""))}
        <article class="ak5e-choice-preview" data-tier="${slot.tier}" aria-live="polite"></article></section>`).join("")}</div>`;
    const result = await dialog(`${spText("ChooseSkills")} — ${actor.name}`, content, [
      { action: "learnSkills", label: spText("LearnSkills"), callback: (_event, button) => offered.map(slot => ({ key: slot.key,
        sourceId: button.form.elements[`skill-${slot.tier.toLowerCase()}`].value })) },
      { action: "later", label: spText("ChooseLater"), callback: () => null }
    ], { position: { width: 680 }, render: (_event, app) => {
      choiceApplications.set(actor.uuid, app);
      const update = () => {
        let complete = offered.length > 0 && !view.blocked.length;
        for (const slot of offered) {
          const control = app.element.querySelector(`[name="skill-${slot.tier.toLowerCase()}"]`);
          control.disabled = slot.recovery;
          const entry = (slot.recovery ? CHAPTER_THREE_CLASSES : slot.options).find(entry => entry.id === control.value);
          app.element.querySelector(`[data-tier="${slot.tier}"]`).innerHTML = entry?.content ?? "";
          complete &&= Boolean(entry);
        }
        app.element.querySelector('[data-action="learnSkills"]').disabled = !complete;
        app.setPosition?.({ height: "auto", top: Math.max(0, ((globalThis.innerHeight ?? 1000) - app.element.offsetHeight) / 2) });
      };
      for (const control of app.element.querySelectorAll(".ak5e-skill-choices select")) control.addEventListener("change", update);
      update();
    } });
    if (!Array.isArray(result)) return false;
    for (const choice of result) selected.set(choice.key, choice.sourceId);
    try {
      await submitOperatorCommand(actor, "chooseSkills", { contextKey: view.contextKey, selections: result });
      return true;
    } catch (error) {
      ui.notifications.error(error.message);
      // Re-read eligibility and retain only still-legal selections when reopening after failure.
      const current = getOperatorSkillChoices(actor);
      for (const slot of current.pending) if (!slot.options.some(entry => entry.id === selected.get(slot.key))) selected.delete(slot.key);
    }
  }
}

function promptChoiceOwner(actor) {
  if (isLiveProgressionActor(actor) && actor.isOwner && operatorChoiceUser(actor, game.users)?.id === game.user.id) {
    safely(openOperatorSkillChoices(actor, { automatic: true }));
  }
}

function queueProgressionCheck(actor, userId, data = {}) {
  if (userId !== game.user.id || !isLiveProgressionActor(actor) || !getOperatorSkillChoices(actor).applicable) return;
  clearTimeout(progressionTimers.get(actor.uuid));
  progressionTimers.set(actor.uuid, setTimeout(() => {
    progressionTimers.delete(actor.uuid);
    if (isLiveProgressionActor(actor)) safely(submitOperatorCommand(actor, "checkChoices", data));
  }, 100));
}

export async function openOperatorSkills(actor) {
  if (!actor?.isOwner || actor.pack) throw new Error(spText("OwnerRequired"));
  const state = getIntegratedOperatorState(actor);
  const skills = actorOperatorSkills(actor);
  const content = `<p>${esc(spText("SetupHint"))}</p><p>${state.points}/${state.maximum} SP · ${esc(spText("Start"))}: ${state.start}</p>
    ${field("Enable", checkbox("enabled", state.enabled))}<ul>${skills.map(skill => `<li>${esc(skill.name)} (${skill.cost} SP; ${skill.methods.map(method => esc(spText(method))).join(", ") || "—"})</li>`).join("")}</ul>`;
  const result = await dialog(spText("Title"), content, [
    { action: "save", label: spText("Save"), default: true, callback: async (_event, button) => { await submitOperatorCommand(actor, "enable", { enabled: button.form.elements.enabled.checked }); return "save"; } },
    { action: "learn", label: actor.type === "character" && !game.user.isGM ? spText("ChooseSkills") : spText("Learn"), callback: () => "learn" },
    ...(game.user.isGM ? [{ action: "configure", label: spText("Configure"), callback: () => "configure" }] : [])
  ]);
  if (result === "learn") {
    if (actor.type === "character" && !game.user.isGM) await openOperatorSkillChoices(actor);
    else await learnSkillDialog(actor);
  }
  if (result === "configure") await configureSkillDialog(actor);
}

async function learnSkillDialog(actor) {
  const catalogue = CHAPTER_THREE_CLASSES.filter(entry => entry.operatorSkill);
  const groups = [...new Set(catalogue.map(entry => `${entry.parentClass}${entry.parentBranch ? `: ${entry.parentBranch}` : ""}`))];
  const group = await dialog(spText("Learn"), field("Class", select("group", groups.map(group => [group, group]))), [
    { action: "next", label: spText("Next"), default: true, callback: (_event, button) => button.form.elements.group.value }
  ]);
  if (!group) return;
  const entries = catalogue.filter(entry => `${entry.parentClass}${entry.parentBranch ? `: ${entry.parentBranch}` : ""}` === group);
  const sourceId = await dialog(spText("Learn"), `<p>${esc(spText("EligibilityHint"))}</p>${field("Skill", select("skill", entries.map(entry => [entry.id, `${entry.operatorSkill.tier}: ${entry.name} (${entry.operatorSkill.cost} SP)`])))}`, [
    { action: "review", label: spText("Review"), default: true, callback: (_event, button) => button.form.elements.skill.value }
  ]);
  if (!sourceId) return;
  const entry = entries.find(entry => entry.id === sourceId);
  await dialog(entry.name, entry.content, [{ action: "learn", label: spText("Learn"), default: true,
    callback: async () => { await submitOperatorCommand(actor, "learn", { sourceId }); return true; } }]);
}

async function configureSkillDialog(actor) {
  const items = Array.from(actor.items.values()).filter(item => item.type === "feat");
  if (!items.length) return;
  const itemId = await dialog(spText("Configure"), field("Skill", select("item", items.map(item => [item.id, item.name]))), [
    { action: "next", label: spText("Next"), default: true, callback: (_event, button) => button.form.elements.item.value }
  ]);
  if (!itemId) return;
  const item = actor.items.get(itemId);
  const previous = item.getFlag("ak5e", "operatorSkill") ?? {};
  await dialog(item.name, `<p>${esc(spText("ConfigureHint"))}</p>
    ${field("Cost", input("cost", previous.cost ?? 0, 'type="number" min="0" step="1" required'))}
    ${field("Start", input("start", previous.start ?? 0, 'type="number" min="0" step="1" required'))}
    ${CHARGING_METHODS.map(method => field(method, checkbox(method, previous.methods?.includes(method)))).join("")}
    ${field("Activation", select("activation", ["Action", "Bonus Action", "Reaction", "No Action Required"].map(value => [value, value]), previous.activation ?? "Action"))}
    ${field("Duration", input("duration", previous.duration ?? "Manual", 'required'))}
    ${field("Source", input("source", previous.source ?? item.getFlag("ak5e", "sourceHeading") ?? "", 'required maxlength="2000"'))}`, [
    { action: "save", label: spText("Save"), default: true, callback: async (_event, button) => {
      const form = button.form.elements;
      await configureOperatorSkill(item, { cost: Number(form.cost.value), start: Number(form.start.value),
        methods: CHARGING_METHODS.filter(method => form[method].checked), activation: form.activation.value,
        duration: form.duration.value, source: form.source.value });
      return true;
    } }
  ]);
}

async function adjustDialog(actor) {
  await dialog(spText("Adjust"), `${field("Amount", input("amount", 0, 'type="number" step="1" required'))}
    ${field("Source", input("reason", "", 'required maxlength="2000"'))}${field("Exception", checkbox("exception"))}`, [
    { action: "save", label: spText("Save"), default: true, callback: async (_event, button) => {
      const form = button.form.elements;
      await adjustOperatorSP(actor, Number(form.amount.value), { reason: form.reason.value, exception: form.exception.checked }); return true;
    } }
  ]);
}

async function extendDialog(actor) {
  await dialog(spText("Extend"), `${field("Rounds", input("rounds", 1, 'type="number" min="1" step="1" required'))}${field("Source", input("reason", "", 'required maxlength="2000"'))}`, [
    { action: "save", label: spText("Save"), default: true, callback: async (_event, button) => {
      await submitOperatorCommand(actor, "extend", { rounds: Number(button.form.elements.rounds.value), reason: button.form.elements.reason.value }); return true;
    } }
  ]);
}

export async function confirmOperatorEvent(actor, pending) {
  const id = pending?.id ?? foundry.utils.randomID();
  const targets = operatorActors().filter(target => target.uuid !== actor.uuid);
  const attacks = Array.from(game.messages?.values?.() ?? []).filter(message => message.flags?.dnd5e?.roll?.type === "attack")
    .slice(-30).map(message => [message.uuid, message.flavor || message.id]);
  const types = ["offensiveDamage", "offensiveHealing", "offensiveTemp", "defensiveAttack", "defensiveDamage"];
  await dialog(spText("Confirm"), `<p>${esc(spText("ConfirmHint"))}</p>${pending ? `<p>${esc(pending.label)}</p>` : ""}
    ${field("Trigger", select("type", types.map(type => [type, spText(type)]), pending?.type ?? "offensiveDamage"))}
    ${field("Target", select("target", [["", spText("Choose")], ...targets.map(target => [target.uuid, target.name])], pending?.targetUuid ?? ""))}
    ${field("AttackReference", select("attackId", [["", spText("ManualAttack")], ...attacks], pending?.attackId ?? ""))}
    ${field("Hostile", checkbox("hostile", pending?.hostile !== false))}
    ${field("IsAttack", checkbox("attack", pending?.attack === true || pending?.type === "defensiveAttack"))}
    ${field("ActualChange", checkbox("positive", true))}${field("FromArt", checkbox("art", pending?.type === "offensiveTemp"))}
    ${field("FromSkill", checkbox("skillOrigin", Boolean(pending?.skillOrigin)))}`, [
    { action: "confirm", label: spText("Confirm"), default: true, callback: async (_event, button) => {
      const form = button.form.elements;
      await recordSkillPointEvent(actor, { id, type: pending?.type ?? form.type.value, targetUuid: form.target.value || pending?.targetUuid,
        attackId: form.attackId.value || pending?.attackId, attack: form.attack.checked, hostile: form.hostile.checked,
        positive: form.positive.checked, art: form.art.checked, skillOrigin: form.skillOrigin.checked }); return true;
    } },
    ...(pending ? [{ action: "dismiss", label: spText("Dismiss"), callback: async () => { await submitOperatorCommand(actor, "dismiss", { eventId: pending.id }); return true; } }] : [])
  ]);
}

function button(label, action) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = spText(label);
  element.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    element.disabled = true;
    safely(Promise.resolve().then(action).finally(() => { element.disabled = false; }));
  });
  return element;
}

export function renderOperatorSkills(app, element) {
  const actor = app?.document?.documentName === "Actor" ? app.document : app?.actor;
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !["character", "npc"].includes(actor?.type)
    || actor.limited && !actor.isOwner || !element?.querySelector) return;
  for (const old of element.querySelectorAll(".ak5e-operator-skills")) old.remove();
  const skills = actorOperatorSkills(actor);
  const choices = getOperatorSkillChoices(actor);
  if (actor.isOwner && isLiveProgressionActor(actor) && !seenSheets.has(actor.uuid)) {
    seenSheets.add(actor.uuid);
    safely(openOperatorSkillChoices(actor, { automatic: true }));
  }
  if (!skills.length && !isOperatorActor(actor) && !choices.applicable) return;
  const details = element.matches?.('.tab[data-tab="details"]') ? element : element.querySelector('.tab[data-tab="details"]');
  // NPC sheets do not share the character Details sidebar.
  const target = details?.querySelector(":scope > .right") ?? (actor.type === "npc" ? element.querySelector(".sheet-header .right") : null);
  if (!target) return;
  const state = getIntegratedOperatorState(actor);
  const section = document.createElement("section");
  section.className = "ak5e-operator-skills";
  const heading = document.createElement("h3"); heading.textContent = spText("Title"); section.append(heading);
  if (actor.isOwner && choices.applicable) {
    for (const reason of choices.blocked) { const warning = document.createElement("p"); warning.textContent = spText(reason); section.append(warning); }
    if (choices.pending.length || choices.blocked.length || choices.slots.some(slot => slot.recovery)) section.append(button("ChooseSkills", () => openOperatorSkillChoices(actor)));
  }
  const summary = document.createElement("p");
  summary.textContent = `${state.points}/${state.maximum} SP · ${spText("Start")}: ${state.start}`;
  section.append(summary);
  const rates = document.createElement("p");
  rates.textContent = CHARGING_METHODS.map(method => `${spText(method)} +${state.rates[method]}`).join(" · ");
  section.append(rates);
  if (!state.enabled) { const hint = document.createElement("p"); hint.textContent = spText("EnableHint"); section.append(hint); }
  if (state.active) {
    const active = document.createElement("p");
    active.textContent = `${spText("Active")}: ${state.active.name} · ${state.active.duration ?? "Manual"}`;
    if (state.active.expiry?.kind === "rounds") active.textContent += ` (${state.active.expiry.rounds} ${spText("Rounds")})`;
    section.append(active);
    if (actor.isOwner) {
      section.append(button("End", () => endIntegratedSkill(actor)));
      if (state.active.expiry?.kind === "rounds") section.append(button("Extend", () => extendDialog(actor)));
    }
  }
  for (const skill of skills) {
    const row = document.createElement("div"); row.className = "ak5e-operator-skill";
    const label = document.createElement("span"); label.textContent = `${skill.name} · ${skill.cost} SP · ${skill.activation} · ${skill.duration}`; row.append(label);
    if (actor.isOwner) {
      row.append(button("Rules", () => actor.items.get(skill.itemId)?.sheet.render(true)));
      const activate = button("Activate", async () => { await activateIntegratedSkill(actor, skill.itemId); await actor.items.get(skill.itemId)?.sheet.render(true); });
      activate.disabled = !state.enabled || Boolean(state.active) || state.points < skill.cost;
      row.append(activate);
      if (state.enabled) row.append(button("ResolveSkill", () => submitOperatorCommand(actor, "origin", { itemId: skill.itemId })));
    }
    section.append(row);
  }
  if (state.pendingOrigin) {
    const origin = document.createElement("p"); origin.textContent = `${spText("NextSkillAction")}: ${state.pendingOrigin.name}`; section.append(origin);
    if (actor.isOwner) section.append(button("Clear", () => submitOperatorCommand(actor, "clearOrigin")));
  }
  if (actor.isOwner && state.enabled) {
    const receipts = state.resolutions?.filter(receipt => receipt.status === "committed") ?? [];
    for (const receipt of receipts.slice(-10)) {
      const item = actor.items.get(receipt.itemId), profile = profileForSkill(item);
      if (!profile) continue;
      for (const phase of profile.phases.filter(phase => !receipt.ended && ["activation", "optional"].includes(phase.when))) {
        const control = button("ResolveSkill", () => resolveOperatorSkillPhase(actor, { activationId: receipt.activationId, phaseId: phase.id }));
        control.textContent = `${item.name}: ${phase.id}`; section.append(control);
      }
      const finish = button("End", async () => {
        if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Finish retained Skill effects" }, rejectClose: false,
          content: `<p>${esc(profile.sourceEffect)}</p><p>Confirm that the retained effect has ended under its source rules. This removes its templates and future prompts.</p>` })) {
          await submitOperatorCommand(actor, "completeResolution", { activationId: receipt.activationId, confirmation: true });
        }
      });
      finish.textContent = `${item.name}: finish retained effects`; section.append(finish);
    }
    for (const prompt of state.phasePrompts ?? []) {
      const receipt = receipts.find(receipt => receipt.activationId === prompt.activationId), item = actor.items.get(receipt?.itemId);
      const control = button("ReviewEvent", () => resolveOperatorSkillPhase(actor, { activationId: prompt.activationId, phaseId: prompt.phaseId, eventKey: prompt.key }));
      control.textContent = `${item?.name ?? "Skill"}: ${prompt.phaseId}`; section.append(control);
    }
    if (game.user.isGM) {
      const control = button("Setup", async () => {
        const changes = await updateOperatorSkills(actor);
        if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Update managed Skills" }, rejectClose: false,
          content: `<p>Add reviewed profiles and missing phase activities. Existing activities, SP, counters, choices, and IDs are preserved.</p><ul>${changes.map(change => `<li>${esc(change.name)}: ${change.activities.length} additions</li>`).join("")}</ul>` })) await updateOperatorSkills(actor, { preview: false });
      }); control.textContent = "Preview Skill update"; section.append(control);
    }
  }
  if (actor.isOwner) {
    section.append(button("Setup", () => openOperatorSkills(actor)));
    if (state.enabled) {
      section.append(button("Confirm", () => confirmOperatorEvent(actor)));
      section.append(button("Rest", () => recoverOperatorSkills(actor)));
      for (const pending of state.pendingEvents) section.append(button("ReviewEvent", () => confirmOperatorEvent(actor, pending)));
    }
    if (game.user.isGM) section.append(button("Adjust", () => adjustDialog(actor)));
  }
  target.append(section);
}

export function registerOperatorSheetHooks() {
  Hooks.on("renderActorSheetV2", renderOperatorSkills);
  Hooks.on("dnd5e.preAdvancementManagerRender", manager => {
    if (isLiveProgressionActor(manager.actor)) {
      advancingActors.add(manager.actor.uuid);
      safely(choiceApplications.get(manager.actor.uuid)?.close?.());
    }
  });
  Hooks.on("dnd5e.preAdvancementManagerComplete", (manager, updates, _toCreate, toUpdate, toDelete) => {
    const actor = manager.actor;
    if (!isLiveProgressionActor(actor) || !getOperatorSkillChoices(actor).applicable) return;
    // Native advancement commits an earlier Actor clone. Keep current AK5e state and
    // grants learned since that snapshot instead of reverting choices or spent SP.
    const current = actor.getFlag("ak5e", "operatorSkills");
    if (current) {
      updates.flags ??= {}; updates.flags.ak5e ??= {};
      updates.flags.ak5e.operatorSkills = structuredClone(current);
    }
    const chosenIds = new Set(getOperatorSkillChoices(actor).slots.map(slot => slot.selection?.itemId).filter(Boolean));
    for (const item of actor.items.values()) if (item.getFlag("ak5e", "operatorSkillChoice")) chosenIds.add(item.id);
    for (let index = toDelete.length - 1; index >= 0; index--) if (chosenIds.has(toDelete[index])) toDelete.splice(index, 1);
    for (const update of toUpdate) {
      const marker = actor.items.get(update._id)?.getFlag("ak5e", "operatorSkillChoice");
      if (!marker) continue;
      update.flags ??= {}; update.flags.ak5e ??= {};
      update.flags.ak5e.operatorSkillChoice = structuredClone(marker);
    }
  });
  Hooks.on("dnd5e.advancementManagerComplete", manager => {
    advancingActors.delete(manager.actor?.uuid);
    queueProgressionCheck(manager.actor, game.user.id, { advancementComplete: true });
  });
  Hooks.on("closeAdvancementManager", manager => { advancingActors.delete(manager.actor?.uuid); });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, (item, ...args) => {
    const [options, userId] = args.slice(-2);
    if (options?.isAdvancement && isLiveProgressionActor(item.parent)) advancingActors.add(item.parent.uuid);
    if (["class", "subclass"].includes(item.type) && !options?.isAdvancement) queueProgressionCheck(item.parent, userId);
  });
  Hooks.on("updateActor", (actor, changed, options) => {
    if (options?.isAdvancement && isLiveProgressionActor(actor)) advancingActors.add(actor.uuid);
    if (changed.flags?.ak5e?.operatorSkills?.progression || changed["flags.ak5e.operatorSkills"]?.progression
      || changed["flags.ak5e.operatorSkills.progression"]) {
      advancingActors.delete(actor.uuid);
      promptChoiceOwner(actor);
    }
  });
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = app.document;
    if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !actor?.isOwner
      || !["character", "npc"].includes(actor.type) || !actorOperatorSkills(actor).length && !isOperatorActor(actor) && !getOperatorSkillChoices(actor).applicable) return;
    if (!controls.some(control => control.action === "ak5eOperatorSkills")) controls.push({ label: spText("Title"), icon: "fa-solid fa-bolt", action: "ak5eOperatorSkills", onClick: () => safely(openOperatorSkills(actor)) });
    const choices = getOperatorSkillChoices(actor);
    if ((choices.pending.length || choices.blocked.length || choices.slots.some(slot => slot.recovery)) && !controls.some(control => control.action === "ak5eChooseSkills")) controls.push({ label: spText("ChooseSkills"), icon: "fa-solid fa-list-check", action: "ak5eChooseSkills", onClick: () => safely(openOperatorSkillChoices(actor)) });
  });
}
