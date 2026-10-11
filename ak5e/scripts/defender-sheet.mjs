/** Defender sheet UI: a header control and a Features-tab panel that open one guided dialog per command.
 * Opening a panel never writes. Branch modules add their dialogs with registerDefenderForms(). */
import { defenderProfile, defenderLevel, equippedShields, IMPROVED_SHELTER_FEET, SHELTER_FEET } from "./defender-rules.mjs";
import { getDefenderView, defenderCommand, shelterCandidates, resilience } from "./defender-features.mjs";
import { previewDefenderSetup, applyDefenderSetup } from "./defender-setup.mjs";
import { defenderUses, recordDefenderRuling } from "./defender-uses.mjs";
import { confirmPlayUse, openPlayUndoList, retryPlayUse, renderPlayUseCard } from "./play-uses-sheet.mjs";

let installed = false;
const active = new Set();
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const text = key => {
  const path = `AK5E.Defender.${key}`, localized = game.i18n?.localize?.(path);
  return localized && localized !== path ? localized : key;
};
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Defender UI", error); ui.notifications.error(error?.message ?? String(error)); });
const node = (tag, content, cls) => { const el = document.createElement(tag); if (content != null) el.textContent = String(content); if (cls) el.className = cls; return el; };
const button = (label, handler, cls = "") => {
  const el = node("button", label, cls); el.type = "button";
  el.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); el.disabled = true; safe(handler).finally(() => { el.disabled = false; }); });
  return el;
};
const operationId = () => foundry.utils.randomID();

/**
 * Form registry. field.type: check | number | text | select | tokens (checkbox list of scene tokens).
 * A spec with `engine` (a play-use engine) runs through the WORKFLOW.md §3.2 confirm loop and posts its own card;
 * `anyLevel` keeps it visible at every level (the level is a warning at use); `open(actor)` replaces the form.
 */
const FORMS = new Map(), NOTICES = [];
export function registerDefenderForms(forms) { for (const [command, spec] of Object.entries(forms)) FORMS.set(command, { command, ...spec }); }
/** Branch modules add panel notices (for example a setup to re-run after a level-up): `notice(actor)` returns strings. */
export function registerDefenderNotices(notice) { if (!NOTICES.includes(notice)) NOTICES.push(notice); }

registerDefenderForms({
  shelter: { label: "Take the Shelter Action", level: 1, intro: "Until the beginning of your next Turn, Attacks against allied Creatures (not you) within 5 feet of you are made at Disadvantage. Taking it as a Bonus Action costs 1 Resilience.",
    fields: actor => {
      // Protector Anchor Point (Ch.3 L1644): the undefined Bulwark Property is read as Bastion, so a Bastion shield pre-checks it.
      const anchor = defenderProfile(actor).branch === "protector" && defenderLevel(actor) >= 4, bulwark = anchor && equippedShields(actor.items).some(entry => entry.info.bastion);
      const feet = bulwark ? IMPROVED_SHELTER_FEET : SHELTER_FEET;
      return [
      { name: "activation", type: "select", label: "Activation", options: [["action", "Action"], ["bonus", "Bonus Action (1 Resilience)"]] },
      ...(anchor ? [{ name: "anchorPoint", type: "check", label: "Anchor Point: I am wielding a Shield with the Bulwark Property (Improved Shelter: 10-foot radius)", default: bulwark }] : []),
      { name: "allies", type: "tokens", label: "Allied Creatures (nearby ones are pre-checked; you decide who is an ally)", options: shelterCandidates(actor, feet).map(t => [t.uuid, `${t.name}${t.within ? ` — within ${feet} ft` : ""}`, t.within]) },
      { name: "alliesConfirmed", type: "check", label: "I confirm every checked Creature is my ally" },
      { name: "positionConfirmed", type: "check", label: "My token is not on the map; positions are confirmed at the table" }].filter(f => !f.branch || f.branch === (actor.items && defenderProfile(actor).branch));
    } },
  endShelter: { label: "End Shelter", level: 1, intro: "Ends your Shelter early.", fields: () => [] },
  leapingDefence: { label: "Leaping Defence", level: 11, intro: "Reaction: an allied Creature you can see within half your Speed is hit by an Attack. You become the target and the Attack hits you regardless of your Armour Class.",
    fields: () => [
      { name: "attackId", type: "text", label: "Attack being answered (any short label, one Reaction per Attack)" },
      { name: "attackConfirmed", type: "check", label: "An Attack hit an allied Creature I can see" },
      { name: "rangeConfirmed", type: "check", label: "The ally is within half my Speed (used when tokens cannot be measured)" },
      { name: "moveConfirmed", type: "check", label: "I moved to an unoccupied space within 5 feet of the ally" }] },
  leapingRefund: { label: "Regain Reaction (1 Resilience)", level: 11, intro: "After Leaping Defence, expend 1 Resilience to regain your Reaction.",
    fields: actor => [{ name: "leapOperationId", type: "select", label: "Leaping Defence to refund", options: (actor.getFlag?.("ak5e", "defender")?.operations ?? []).filter(o => o.command === "leapingDefence" && o.status === "complete" && !o.refunded && actor.getFlag?.("ak5e", "reactionBudget")?.receipts?.[`leaping_${o.id}`]).map(o => [o.id, `${o.data?.attackId ?? o.id}`]) }] },
  indestructible: { label: "Indestructible", level: 18, intro: "Reaction when you would take Damage from a hostile action: double any Damage Reduction you have against that instance.",
    fields: () => [
      { name: "damageId", type: "text", label: "Instance of Damage (any short label)" },
      { name: "reduction", type: "number", label: "Damage Reduction you currently have against it", default: 0 },
      { name: "amount", type: "number", label: "Damage before reduction (optional preview)" },
      { name: "type", type: "text", label: "Damage type (optional)" },
      { name: "hostileConfirmed", type: "check", label: "The Damage is the result of a hostile action" }] },
  restoreIndestructible: { label: "Restore Indestructible (2 Resilience)", level: 18, intro: "During your Turn, no Action required: expend 2 Resilience to restore your use of Indestructible.", fields: () => [] },
  resilience: { label: "Adjust Resilience", level: 1, intro: "For effects that spend or restore Resilience that this panel does not run itself.",
    fields: () => [{ name: "mode", type: "select", label: "Change", options: [["spend", "Spend"], ["refund", "Restore"]] }, { name: "amount", type: "number", label: "Amount", default: 1 }, { name: "reason", type: "text", label: "Reason" }] }
});

const TYPES = ["acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"].map(t => [t, t]);
const artMessages = () => Array.from(game.messages?.values?.() ?? game.messages ?? []).filter(m => m.flags?.dnd5e?.item?.type === "spell")
  .map(m => [m.uuid ?? `ChatMessage.${m.id}`, m.name ?? m.flags?.dnd5e?.item?.name ?? m.id]);
registerDefenderForms({
  absorb: { label: "Absorb Arts", branch: "artshield", level: 4, intro: "No Action required: when you take Arts Damage, store some of its energy. One charge is kept until you expel it or finish a Long Rest.",
    fields: () => [{ name: "art", type: "text", label: "Art (optional note)" }, { name: "artsDamageConfirmed", type: "check", label: "I took Damage from an Art" }] },
  confirmSpellshieldArt: { label: "Confirm Art in Sight (Spellshield)", branch: "artshield", level: 1, intro: "Record sight of one Art for the active Shelter. Each Art must be confirmed separately.",
    fields: () => [{ name: "artMessageUuid", type: "select", label: "Art's originating chat message", options: artMessages() }, { name: "visibleConfirmed", type: "check", label: "I can see this Art" }] },
  spellshield: { label: "Spellshield: negate half Damage (2 Resilience)", branch: "artshield", level: 1, intro: "A sheltered ally succeeded on a Save against a confirmed Art in the active Shelter: expend 2 Resilience (no Action required) so they take none.",
    fields: actor => [{ name: "allyTokenUuid", type: "select", label: "Sheltered ally", options: (actor.getFlag?.("ak5e", "defender")?.shelter?.allies ?? []).map(u => [u, globalThis.fromUuidSync?.(u)?.name ?? u]) },
      { name: "artMessageUuid", type: "select", label: "Confirmed Art", options: artMessages() }, { name: "savedConfirmed", type: "check", label: "They succeeded on the Save" }] },
  reactiveDefence: { label: "Reactive Defence", branch: "artshield", level: 9, intro: "A Unit within your Reach casts an Art: make an Attack of Opportunity against them.",
    fields: () => [{ name: "triggerId", type: "text", label: "Art cast (any short label, one Reaction per trigger)" }, { name: "hostileConfirmed", type: "check", label: "The caster is hostile" }, { name: "reachConfirmed", type: "check", label: "The caster is within my Reach" }] },
  stormchaser: { label: "Improved Arts Resistance (DR)", branch: "artshield", level: 12, intro: "Your Damage Reduction against Arts Damage is half your Damage Reduction against Physical Damage, rounded up.",
    fields: () => [{ name: "physicalReduction", type: "number", label: "Your DR against Physical Damage", default: 0 }] },
  leapingWard: { label: "Leaping Ward", branch: "artshield", level: 12, intro: "Reaction: an allied Creature within half your Speed would make a Saving Throw against an Art or Art-like effect. You and they are Resistant to that Art's Damage this Turn.",
    fields: () => [{ name: "triggerId", type: "text", label: "Saving Throw (any short label)" }, { name: "allyActorUuid", type: "text", label: "Ally Actor UUID (drag the Actor here)" },
      { name: "damageTypes", type: "checks", label: "Damage types of the Art", options: TYPES },
      { name: "saveConfirmed", type: "check", label: "An ally I can see is about to make that Save" }, { name: "rangeConfirmed", type: "check", label: "The ally is within half my Speed" }, { name: "moveConfirmed", type: "check", label: "I moved to an unoccupied space within 5 feet of the ally" }] },
  leapingWardRefund: { label: "Regain Reaction after Leaping Ward (1 Resilience)", branch: "artshield", level: 12, intro: "After using Leaping Ward, expend 1 Resilience to regain the Reaction spent on that Ward.",
    fields: actor => { const ward = actor.getFlag?.("ak5e", "defender")?.ward; return [{ name: "wardOperationId", type: "select", label: "Leaping Ward to refund", options: ward && !ward.refunded ? [[ward.operationId, ward.triggerId ?? ward.operationId]] : [] }]; } },
  eyeOfTheStorm: { label: "Eye of the Storm", branch: "artshield", level: 15, intro: "Reaction, once per Long Rest: a silvery barrier of up to 20 feet radius around you until the end of your next Turn. Creatures inside cannot be affected by Arts or Art-like effects or take Arts Damage.",
    fields: () => [{ name: "triggerId", type: "text", label: "What triggered it (any short label)" }, { name: "radius", type: "number", label: "Radius in feet (up to 20)", default: 20 }, { name: "reactionConfirmed", type: "check", label: "I am taking this as a Reaction" }, { name: "positionConfirmed", type: "check", label: "My token is not on the map" }] },
  eyeSweep: { label: "Eye of the Storm: list Arts to end", branch: "artshield", level: 15, intro: "Lists Arts still affecting Creatures inside the barrier. The GM may end them here.",
    fields: () => [{ name: "remove", type: "check", label: "End them now (GM only)" }] }
});
const TIERS = [["normal", "Normal"], ["elite", "Elite"], ["leader", "Leader"]];
registerDefenderForms({
  advance: { label: "Enter the Advance", branch: "dreadnought", level: 1, intro: "Bonus Action: for one minute your Melee Attacks deal extra Damage equal to your Proficiency Bonus and you gain Skill Points when you make or suffer an Attack Roll. It ends early if your Turn ends and you have not made an Attack, dealt Damage, forced a Saving Throw or taken Damage since your last Turn.",
    fields: () => [{ name: "confirmed", type: "check", label: "I am taking this as a Bonus Action" }] },
  endAdvance: { label: "End the Advance", branch: "dreadnought", level: 1, intro: "Ends the Advance and switches its Damage bonus off.", fields: () => [] },
  restoreAdvance: { label: "Restore the Advance (2 Resilience)", branch: "dreadnought", level: 1, intro: "During your Turn, no Action required: expend 2 Resilience to restore your use of the Advance.", fields: () => [] },
  advanceActivity: { label: "Record Advance activity", branch: "dreadnought", level: 1, intro: "Record qualifying activity since your last Turn ended, including activity before you entered the Advance. Attacks and many Damage events are noticed automatically.",
    fields: () => [{ name: "kind", type: "select", label: "What happened", options: [["forcedSave", "I forced a Creature to make a Saving Throw"], ["dealt", "I dealt Damage"], ["tookDamage", "I took Damage"]] }] },
  reinstateAdvance: { label: "Reinstate the Advance (GM)", branch: "dreadnought", level: 1, gm: true, intro: "If the Advance ended because a qualifying action was not detected, the GM may reinstate it for the rest of its minute. No resource is spent or refunded.",
    fields: () => [{ name: "reason", type: "text", label: "Why it should not have ended (10+ characters)" }] },
  leapingOffence: { label: "Leaping Offence", branch: "dreadnought", level: 12, intro: "After Leaping Defence against an Elite or Leader attacker: expend 1 Resilience to make an Attack of Opportunity against them after their Attack (no Action required).",
    fields: actor => [{ name: "leapOperationId", type: "select", label: "Leaping Defence", options: (actor.getFlag?.("ak5e", "defender")?.operations ?? []).filter(o => o.command === "leapingDefence" && o.status === "complete" && !o.offence).map(o => [o.id, `${o.data?.attackId ?? o.id}`]) },
      { name: "tier", type: "select", label: "Attacker's tier", options: TIERS }] },
  tearThemDown: { label: "Tear them Down", branch: "dreadnought", level: 12, intro: "An Elite or Leader Creature within your Reach attacks a Creature that is not you, or forces one to make a Saving Throw: make an Attack of Opportunity against it (no Action required).",
    fields: () => [{ name: "tier", type: "select", label: "Creature's tier", options: TIERS }, { name: "inReach", type: "check", label: "It is within my Reach" }, { name: "otherTarget", type: "check", label: "Its target is not me" }] }
});

function fieldHtml(field) {
  const name = esc(field.name), label = esc(field.label);
  if (field.type === "check") return `<label class="ak5e-defender-check"><input type="checkbox" name="${name}"${field.default === true ? " checked" : ""}> <span>${label}</span></label>`;
  if (field.type === "select") return `<label class="ak5e-defender-field"><span>${label}</span><select name="${name}">${field.options.map(([value, caption]) => `<option value="${esc(value)}"${field.default !== undefined && String(field.default) === String(value) ? " selected" : ""}>${esc(caption)}</option>`).join("")}</select></label>`;
  if (field.type === "checks") return `<fieldset class="ak5e-defender-tokens"><legend>${label}</legend>${field.options.map(([value, caption]) => `<label><input type="checkbox" name="${name}" value="${esc(value)}"> ${esc(caption)}</label>`).join("")}</fieldset>`;
  if (field.type === "tokens") return `<fieldset class="ak5e-defender-tokens"><legend>${label}</legend>${field.options.length ? field.options.map(([value, caption, preset]) => `<label><input type="checkbox" name="${name}" value="${esc(value)}"${preset ? " checked" : ""}> ${esc(caption)}</label>`).join("") : `<p>${esc("No other tokens on this scene.")}</p>`}</fieldset>`;
  return `<label class="ak5e-defender-field"><span>${label}</span><input type="${field.type === "number" ? "number" : "text"}" name="${name}"${field.default !== undefined ? ` value="${esc(field.default)}"` : ""}></label>`;
}
function collect(form, fields) {
  const data = {};
  for (const field of fields) {
    if (field.type === "check") data[field.name] = form.elements[field.name]?.checked === true;
    else if (field.type === "tokens" || field.type === "checks") data[field.name] = Array.from(form.querySelectorAll(`input[name="${field.name}"]:checked`)).map(el => el.value);
    else if (field.type === "number") { const raw = form.elements[field.name]?.value; if (raw !== "" && raw !== undefined) data[field.name] = Number(raw); }
    else data[field.name] = String(form.elements[field.name]?.value ?? "").trim();
  }
  return data;
}
async function report(actor, spec, result) {
  const lines = [result?.instruction, ...(result?.instructions ?? [])].filter(Boolean);
  const body = lines.length ? `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : "<p>Recorded.</p>";
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<p><strong>${esc(spec.label)}</strong></p>${body}` });
}

export async function openDefenderForm(actor, command, defaults = {}) {
  const spec = FORMS.get(command);
  if (!spec) throw new Error("Unknown Defender dialog.");
  if (spec.open) return spec.open(actor);
  const fields = spec.fields(actor).map(field => Object.hasOwn(defaults, field.name) ? { ...field, default: defaults[field.name] } : field);
  if (spec.engine) {
    // WORKFLOW.md §3.2: always a confirm step (even without fields); warnings and missing rulings are asked next.
    const data = await foundry.applications.api.DialogV2.prompt({ window: { title: `${spec.label} — ${actor.name}` }, rejectClose: false, position: { width: 520 },
      content: `<div class="ak5e-defender-form"><p>${esc(spec.intro)}</p>${fields.map(fieldHtml).join("")}<p class="ak5e-defender-note">${esc("Problems with the source requirements are listed next, and you may use it anyway. The chat card can undo it.")}</p></div>`,
      ok: { label: spec.label, callback: (_event, target) => collect(target.form ?? target.closest("form") ?? target, fields) } });
    if (!data) return null;
    const id = operationId();
    return confirmPlayUse(spec.label, extra => spec.engine.command(actor, command, { ...defaults.hidden, ...data, confirmed: true, ...extra }, id));
  }
  if (!fields.length) { const result = await defenderCommand(actor, command, {}, operationId()); return report(actor, spec, result); }
  const data = await foundry.applications.api.DialogV2.prompt({ window: { title: `${spec.label} — ${actor.name}` }, rejectClose: false, position: { width: 520 },
    content: `<div class="ak5e-defender-form"><p>${esc(spec.intro)}</p>${fields.map(fieldHtml).join("")}<p class="ak5e-defender-note">${esc("Confirm action economy, visibility and allegiance at the table; these dialogs record the result and spend the resources.")}</p></div>`,
    ok: { label: spec.label, callback: (_event, target) => collect(target.form ?? target.closest("form") ?? target, fields) } });
  if (!data) return;
  const result = await defenderCommand(actor, command, data, operationId());
  await report(actor, spec, result);
}

export async function openDefenderSetup(actor) {
  const plan = previewDefenderSetup(actor);
  const lines = [];
  if (plan.blocked.length) lines.push(`Blocked: ${plan.blocked.join(", ")}.`);
  if (plan.enable) lines.push("Enable Defender support for this character.");
  if (plan.reactionMax !== null) lines.push(`Set your Reaction maximum to ${plan.reactionMax} (Reactive).`);
  lines.push(...plan.createEffects.map(e => `Add effect: ${e.name}`), ...plan.updateEffects.map(u => `Update managed effect: ${u.effect.name}`), ...plan.addActivities.map(a => `Add activity to ${a.name}: ${a.activity.name}`));
  lines.push(...plan.warnings.map(w => `Note: ${w}`));
  if (plan.empty && !plan.blocked.length) lines.push("Nothing to change; this character is already set up.");
  const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: `Defender setup — ${actor.name}` }, position: { width: 560 }, rejectClose: false,
    content: `<ul class="ak5e-defender-plan">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul><p class="ak5e-defender-note">${esc("Hit points, proficiencies, equipment, Ability Score Improvements, Talents and Operator Skills are not changed.")}</p>`,
    yes: { label: "Apply setup", disabled: plan.blocked.length > 0 || plan.empty } });
  if (!confirmed) return;
  const result = await applyDefenderSetup(actor, { confirmed: true, contextKey: plan.contextKey });
  ui.notifications.info(`Defender setup applied (${result.createdEffects} effects, ${result.addedActivities} activities).`);
}

export async function openDefenderControls(actor) {
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") throw new Error("Select a character Actor to open Defender controls.");
  if (active.has(actor.uuid)) return;
  active.add(actor.uuid);
  try {
    if (!actor.isOwner && !game.user.isGM) throw new Error("Open Defender controls on a character you own.");
    const view = getDefenderView(actor);
    if (!view.profile.applicable) throw new Error("This character has no Defender class.");
    if (!view.profile.configured && actor.isOwner) return openDefenderSetup(actor);
    const level = view.level ?? 0, branch = view.profile.branch;
    const specs = [...FORMS.values()].filter(s => (s.anyLevel || level >= (s.level ?? 1)) && (!s.branch || s.branch === branch) && (!s.gm || game.user.isGM));
    const uses = defenderUses.uses(actor), useButtons = [
      ...uses.filter(use => use.status === "pending").map(use => `<button type="button" data-defender-use-retry="${esc(use.id)}">${esc(`Retry: ${use.title}`)}</button>`),
      uses.some(use => use.status !== "undone") ? `<button type="button" data-defender-ui="__undo">${esc("Undo a recent use")}</button>` : "",
      game.user.isGM && Object.keys(defenderUses.readings()).length ? `<button type="button" data-defender-ui="__rulings">${esc("Record a ruling (GM)")}</button>` : ""].join("");
    const summary = [`Level ${level}${branch ? ` · ${branch[0].toUpperCase()}${branch.slice(1)}` : ""}`, `Resilience ${view.resilience.value} / ${view.resilience.max}`,
      view.indestructible ? `Indestructible ${view.indestructible.value} / ${view.indestructible.max}` : null,
      view.reactions ? `Reactions spent ${view.reactions.spent ?? 0} / ${view.reactions.max ?? 1}` : null].filter(Boolean).join(" · ");
    const shelter = view.state.shelter?.active ? `Shelter active for ${view.state.shelter.allies.length} ${view.state.shelter.allies.length === 1 ? "ally" : "allies"}.` : "";
    const publicDefender = game.ak5e?.defender;
    const progressionButtons = [
      typeof publicDefender?.openSetup === "function" ? `<button type="button" data-defender-ui="__progression">${esc("Class progression setup")}</button>` : "",
      typeof publicDefender?.openTalents === "function" ? `<button type="button" data-defender-ui="__talents">${esc("Defender Talents")}</button>` : ""
    ].join("");
    const content = `<section class="ak5e-defender-panel"><p><strong>${esc(summary)}</strong></p>${shelter ? `<p>${esc(shelter)}</p>` : ""}
      <nav>${specs.map(s => `<button type="button" data-defender-ui="${esc(s.command)}">${esc(s.label)}</button>`).join("")}<button type="button" data-defender-ui="__setup">${esc("Review feature setup")}</button>${progressionButtons}${useButtons}</nav>
      ${view.pending.length ? `<h3>${esc("Needs review")}</h3><p class="ak5e-defender-note">${esc("An earlier command was interrupted after spending a resource. Retry repeats it with the same choices and never spends twice; a GM can mark it reconciled after checking the Actor and map by hand. Other commands wait until this is resolved.")}</p><ul>${view.pending.map(o => `<li>${esc(o.command)} (${esc(o.id)}) — ${esc(o.status)} <button type="button" data-defender-retry="${esc(o.id)}">${esc("Retry")}</button>${game.user.isGM ? ` <button type="button" data-defender-reconcile="${esc(o.id)}">${esc("Reconcile (GM)")}</button>` : ""}</li>`).join("")}</ul>` : ""}
      ${NOTICES.flatMap(notice => notice(actor)).map(text => `<p class="ak5e-defender-notice"><strong>${esc(text)}</strong></p>`).join("")}
      <h3>${esc("Manual procedures")}</h3><ul>${view.manual.map(m => `<li>${esc(m)}</li>`).join("")}</ul></section>`;
    await foundry.applications.api.DialogV2.wait({ window: { title: `Defender — ${actor.name}` }, position: { width: 640 }, classes: ["ak5e-defender-dialog"], rejectClose: false,
      content, buttons: [{ action: "close", label: "Close" }], render: (_event, app) => {
        for (const control of app.element.querySelectorAll("[data-defender-ui]")) control.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          const action = control.dataset.defenderUi;
          safe(() => action === "__setup" ? openDefenderSetup(actor)
            : action === "__undo" ? openPlayUndoList(defenderUses, actor)
            : action === "__rulings" ? openDefenderRulings(actor)
            : action === "__progression" ? game.ak5e.defender.openSetup(actor)
              : action === "__talents" ? game.ak5e.defender.openTalents(actor)
                : openDefenderForm(actor, action));
        });
        for (const control of app.element.querySelectorAll("[data-defender-use-retry]")) control.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          const use = uses.find(entry => entry.id === control.dataset.defenderUseRetry);
          safe(() => retryPlayUse(defenderUses, actor, use));
        });
        for (const control of app.element.querySelectorAll("[data-defender-retry]")) control.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          const op = view.pending.find(o => o.id === control.dataset.defenderRetry);
          safe(async () => { const result = await defenderCommand(actor, op.command, op.data, op.id); await report(actor, { label: `Retry: ${op.command}` }, result); });
        });
        for (const control of app.element.querySelectorAll("[data-defender-reconcile]")) control.addEventListener("click", event => {
          event.preventDefault(); event.stopPropagation();
          safe(async () => {
            const reason = await foundry.applications.api.DialogV2.prompt({ window: { title: "Reconcile interrupted operation" }, rejectClose: false,
              content: `<label class="ak5e-defender-field"><span>${esc("Reason (10+ characters; confirm resources and map were checked)")}</span><input type="text" name="reason"></label>`,
              ok: { label: "Reconcile", callback: (_e, target) => String((target.form ?? target.closest("form"))?.elements?.reason?.value ?? "").trim() } });
            if (reason) await defenderCommand(actor, "reconcile", { operationId: control.dataset.defenderReconcile, reason }, operationId());
          });
        });
      } });
  } finally { active.delete(actor.uuid); }
}

/** GM-only: record a ruling for an unresolved reading; it then replaces the players' per-use readings. */
async function openDefenderRulings(actor) {
  const readings = Object.entries(defenderUses.readings());
  const options = readings.flatMap(([key, reading]) => reading.options.map(option => [`${key}|${option.value}`, `${reading.label}: ${option.label}`]));
  const choice = await foundry.applications.api.DialogV2.prompt({ window: { title: `Defender rulings — ${actor.name}` }, rejectClose: false, position: { width: 620 },
    content: `<div class="ak5e-defender-form">${fieldHtml({ name: "ruling", type: "select", label: "Ruling", options })}${fieldHtml({ name: "source", type: "text", label: "Source and reason (10+ characters)" })}</div>`,
    ok: { label: "Record ruling", callback: (_event, target) => collect(target.form ?? target.closest("form") ?? target, [{ name: "ruling", type: "select" }, { name: "source", type: "text" }]) } });
  if (!choice?.ruling) return null;
  const [key, value] = choice.ruling.split("|");
  return recordDefenderRuling(actor, key, value, choice.source);
}

const eligible = actor => actor?.type === "character" && defenderProfile(actor).applicable;
export function renderDefenderControls(app, element) {
  const actor = actorFor(app);
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !actor || !element?.querySelector || !eligible(actor)) return;
  if (!actor.isOwner && !game.user.isGM) return;
  const roots = app.element?.contains(element) ? [app.element] : [element];
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-defender-sheet-panel")) old.remove();
    if (actor.limited && !game.user.isGM) continue;
    const features = root.matches?.('.tab[data-tab="features"]') ? root : root.querySelector('.tab[data-tab="features"]');
    if (!features) continue;
    const view = getDefenderView(actor), panel = node("section", null, "ak5e-defender-sheet-panel");
    panel.append(node("h3", "Defender"));
    if (view.profile.configured && view.resilience) panel.append(node("p", `Resilience ${view.resilience.value} / ${view.resilience.max}`, "ak5e-defender-summary"));
    if (actor.isOwner) panel.append(button(view.profile.configured ? "Open Defender controls" : "Set up Defender", () => openDefenderControls(actor)));
    panel.append(node("p", "Opening this panel makes no changes.", "ak5e-defender-note"));
    features.prepend(panel);
  }
}
export function registerDefenderSheetHooks() {
  if (installed) return;
  installed = true;
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !eligible(actor) || !actor.isOwner || controls.some(c => c.action === "ak5eDefender")) return;
    controls.unshift({ action: "ak5eDefender", icon: "fa-solid fa-shield-halved", label: "Defender", ownership: "OWNER", onClick: () => safe(() => openDefenderControls(actor)) });
  });
  Hooks.on("renderActorSheetV2", renderDefenderControls);
  Hooks.on("renderChatMessageHTML", (message, html) => { try { renderPlayUseCard(defenderUses, message, html); } catch (error) { console.error("AK5e | Defender use card", error); } });
}
export { defenderLevel, resilience };
