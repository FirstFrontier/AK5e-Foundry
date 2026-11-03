/**
 * Ward sheet UI: the Features-panel section and its guided confirm dialogs.
 *
 * Rendering is read-only (WORKFLOW.md §3.2: nothing is written before the owner confirms) and
 * every value interpolated from an Actor, Item or flag is HTML-escaped. Controls carry
 * `data-medic-cmd` and are wired by the shared listener; there are no inline handlers.
 * Each roll (1d8 Additional Temporary Hit Points, 2d10 Treat the Cause, the attacker's
 * Dexterity save) is entered or rolled by the owner in the dialog; the module never rolls.
 */
import { medicProfile, medicEnabled, medicLevel, medicBranch, medicSpellDC, flag } from "./medic-rules.mjs";
import { medicUses } from "./medic-uses.mjs";
import { opaqueKey } from "./operation-kernel.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { lifeSupport } from "./medic-features.mjs";
import { WARD_RESIST_FLAG, wardView, WARD_READING_KEY } from "./ward-features.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const operationId = () => foundry.utils.randomID();
const safe = fn => Promise.resolve().then(fn).catch(error => {
  console.error("AK5e | Ward UI", error);
  ui?.notifications?.error?.(error?.message ?? String(error));
  return null;
});

/** Commands this section owns; anything else is another sheet module's business. */
export const WARD_COMMANDS = Object.freeze([
  "wardGrant",
  "wardLifeSupport",
  "statusResistance",
  "treatTheCause",
  "wardingSurge",
  "collectiveWard",
  "wardRegeneration",
  "reapplyForeignPool"
]);
const WARD_CONTROLS = Object.freeze(["wardGrant", "wardLifeSupport", "statusResistance", "treatTheCause", "wardingSurge", "collectiveWard", "wardRegeneration", "reapplyForeignPool"]);

const LABELS = Object.freeze({
  wardGrant: "Convert rolled healing into Ward",
  wardLifeSupport: "Ward from Life Support healing",
  statusResistance: "Status Resistance (this Turn's first save)",
  treatTheCause: "Treat the Cause, not the Symptom",
  wardingSurge: "Warding Surge",
  collectiveWard: "Collective Ward",
  wardRegeneration: "Ward Regeneration",
  reapplyForeignPool: "Record foreign Temporary Hit Points"
});
const LEVELS = Object.freeze({ statusResistance: 4, treatTheCause: 7, wardingSurge: 11, collectiveWard: 15, wardRegeneration: 15 });

/** Explicitly unlinked Tokens retain their own synthetic Actor and pool. */
const baseActor = doc => {
  const token = doc?.documentName === "Token" ? doc : doc?.document ?? (doc?.documentName === "Actor" ? doc.token : null);
  const actor = doc?.documentName === "Actor" ? doc : doc?.actor ?? token?.actor ?? null;
  if (!actor || actor.documentName !== "Actor") return null;
  if (token?.actorLink !== false && typeof actor.uuid === "string"
      && actor.uuid.includes(".Token.") && typeof actor.id === "string") {
    return globalThis.game?.actors?.get(actor.id) ?? actor;
  }
  return actor;
};
const targets = () => Array.from(globalThis.game?.user?.targets ?? []).map(baseActor).filter(actor => actor && actor.documentName === "Actor");
const firstTarget = () => targets()[0] ?? null;
const actorFor = uuid => {
  if (!uuid) return null;
  const doc = globalThis.fromUuidSync?.(uuid) ?? null;
  return baseActor(doc);
};
const dialog = (title, content, buttons) => foundry.applications.api.DialogV2.wait({
  window: { title }, position: { width: 560 }, rejectClose: false, content: `<div class="ak5e-ward">${content}</div>`, buttons
});
const prompt = (title, content, ok = "Confirm") => foundry.applications.api.DialogV2.prompt({
  window: { title }, position: { width: 560 }, rejectClose: false, content: `<div class="ak5e-ward">${content}</div>`,
  ok: { label: ok, callback: (_event, button) => Object.fromEntries(new FormData(button.form).entries()) }
});

/**
 * The Features-tab section. `actor` may be any Actor; a non-Ward Medic gets a short note and no
 * active controls, which keeps the panel readable without hiding the branch from its owner.
 */
export function renderWardSection(actor, { context = {} } = {}) {
  const enabled = medicEnabled(actor);
  const branch = enabled ? medicBranch(actor) : null;
  const level = enabled ? medicLevel(actor) ?? 1 : 0;
  const view = enabled && branch === "ward" ? wardView(actor, actor) : { temp: 0, tag: null, ward: 0, own: false };
  const artsPoints = Number(flag(actor, "artsPoints")?.value ?? 0);
  const lifeSupportValue = Number(lifeSupport(actor)?.value ?? 0);
  const resist = flag(actor, WARD_RESIST_FLAG);
  const rows = [];
  rows.push(`<p class="ak5e-ward-summary">Ward: <strong>${esc(view.temp)}</strong> Temporary Hit Points`
    + `${view.tag ? ` (${esc(view.own ? "this Medic's Ward" : `provenance ${view.tag.medicUuid}`)})` : " (no Ward)"}`
    + ` · Life Support <strong>${esc(lifeSupportValue)}</strong> · Arts Points <strong>${esc(artsPoints)}</strong></p>`);
  if (view.tag && !view.own) {
    rows.push(`<p class="ak5e-ward-note" role="note">The current Temporary Hit Points are not this Medic's Ward${view.tag.medicUuid ? ` (source ${esc(view.tag.medicUuid)})` : ""}; Ward features do not use them.</p>`);
  }
  if (resist?.types?.length) {
    rows.push(`<p class="ak5e-ward-note" role="note">Warding Surge Resistance active: ${esc(resist.types.join(", "))} (until ${esc(resist.until ?? "the end of the current Turn")}).</p>`);
  }
  const profile = medicProfile(actor);
  if (!profile.applicable) {
    rows.push(`<p class="ak5e-ward-note" role="note">This character has no Medic class; the Ward features belong to the Ward Medic subclass.</p>`);
    return `<section class="ak5e-ward-section" data-ward-section>${rows.join("")}</section>`;
  }
  if (!enabled || branch !== "ward") {
    rows.push(`<p class="ak5e-ward-note" role="note">${enabled
      ? `This character is a ${esc(branch ?? "branchless")} Medic; the Ward features belong to the Ward subclass.`
      : "Configure this Medic (Setup) before using the Ward features."}</p>`);
  }
  const controls = WARD_CONTROLS.map(command => {
    const required = LEVELS[command] ?? 1;
    const blocked = !enabled || branch !== "ward" || level < required;
    return `<button type="button" class="ak5e-ward-control" data-medic-cmd="${esc(command)}"`
      + ` title="${esc(blocked ? `${LABELS[command]} (Medic level ${required})` : LABELS[command])}"`
      + `${blocked ? " disabled" : ""}>${esc(LABELS[command])}${blocked ? ` <span class="ak5e-ward-level">level ${required}</span>` : ""}</button>`;
  }).join("");
  // F4: reapplyForeignPool always renders alongside the other commands: whenever the table
  // applies a non-Ward pool, this records the provenance explicitly (with visible context)
  // instead of silently keeping this Medic's Ward tag alongside unrelated Temporary Hit Points.
  rows.push(`<div class="ak5e-ward-controls">${controls}</div>`);
  rows.push(`<p class="ak5e-ward-note" role="note">Every Ward use is confirmed before anything is written; the owner supplies each roll.`
    + ` Keep or replace is always an explicit choice — Ward never stacks with other Temporary Hit Points.</p>`);
  return `<section class="ak5e-ward-section" data-ward-section data-ward-context="${esc(context.key ?? "features")}">${rows.join("")}</section>`;
}

/* --------------------------------------------------------------- dialogs */

async function askWardGrant(actor) {
  const target = firstTarget();
  const content = `
    <p>${target ? `Target: <strong>${esc(target.name)}</strong> — ${esc(target.system?.attributes?.hp?.temp ?? 0)} Temporary Hit Points` : "<em>No token is targeted. Select the recipient first.</em>"}</p>
    <label>Rolled healing converted to Ward <input type="number" name="healingAmount" min="0" step="1" value="0" required></label>
    <label>Casting time <select name="actionType">
      <option value="action">Action</option><option value="bonus">Bonus Action</option>
      <option value="reaction">Reaction</option><option value="other">Other</option>
    </select></label>
    <label><input type="checkbox" name="fromArt"> Granted by an Art (adds the Arts Points spent)</label>
    <label>Arts Points spent <input type="number" name="apSpent" min="0" step="1" value="0"></label>
    <label><input type="checkbox" name="extraTempHP" checked> Additional Temporary Hit Points for Action or Bonus Action: roll 1d8 and enter it</label>
    <label>Owner's 1d8 <input type="number" name="ownerRoll1d8" min="1" max="8" step="1"></label>
    <fieldset><legend>${esc("Existing Temporary Hit Points")}</legend>
      <label><input type="radio" name="keepOrReplace" value="keep"> Keep the current pool</label>
      <label><input type="radio" name="keepOrReplace" value="replace"> Replace the current pool</label>
    </fieldset>`;
  const form = await prompt("Ward: convert healing", content);
  if (!form) return null;
  const data = {
    targetUuid: target?.uuid ?? null,
    healingAmount: Number(form.healingAmount || 0),
    actionType: String(form.actionType || "action"),
    fromArt: form.fromArt === "on",
    apSpent: Number(form.apSpent || 0),
    extraTempHP: form.extraTempHP === "on",
    ownerRoll1d8: form.ownerRoll1d8 === "" ? undefined : Number(form.ownerRoll1d8)
  };
  if (form.keepOrReplace === "keep" || form.keepOrReplace === "replace") data.keepOrReplace = form.keepOrReplace;
  return data;
}

async function askWardLifeSupport(actor) {
  const target = firstTarget();
  const reading = medicUses.readings()?.[WARD_READING_KEY];
  const options = (reading?.options ?? []).map((option, index) => `<label><input type="radio" name="reading" value="${esc(option.value)}"${index === 0 ? " checked" : ""}> ${esc(option.label)}</label>`).join("");
  const content = `
    <p>${target ? `Target: <strong>${esc(target.name)}</strong>` : "<em>No token is targeted. Select the recipient first.</em>"}</p>
    <label>Life Support to expend <input type="number" name="amount" min="1" step="1" value="10" required></label>
    <label>Casting time <select name="actionType"><option value="action">Action</option><option value="bonus">Bonus Action</option></select></label>
    <label><input type="checkbox" name="extraTempHP" checked disabled> Additional Temporary Hit Points: roll 1d8 and enter it</label>
    <label>Owner's 1d8 <input type="number" name="ownerRoll1d8" min="1" max="8" step="1" required></label>
    <label>Other Temporary Hit Points <select name="keepOrReplace"><option value="">—</option><option value="keep">Keep</option><option value="replace">Replace</option></select></label>
    <fieldset><legend>${esc(reading?.label ?? "Reading for this use (never a GM ruling)")}</legend>${options}</fieldset>`;
  const form = await prompt("Ward: Life Support healing", content);
  if (!form) return null;
  return {
    targetUuid: target?.uuid ?? null,
    amount: Number(form.amount || 0),
    actionType: String(form.actionType || "action"),
    ownerRoll1d8: form.ownerRoll1d8 === "" ? undefined : Number(form.ownerRoll1d8),
    reading: String(form.reading || ""),
    readings: { [WARD_READING_KEY]: String(form.reading || "") },
    ...(form.keepOrReplace ? { keepOrReplace: String(form.keepOrReplace) } : {})
  };
}

async function askStatusResistance(actor) {
  const target = firstTarget();
  const content = `
    <p>${target ? `Warded Creature: <strong>${esc(target.name)}</strong> — ${esc(target.system?.attributes?.hp?.temp ?? 0)} Temporary Hit Points` : "<em>No token is targeted. Select the warded Creature first.</em>"}</p>
    <label><input type="checkbox" name="savingAgainstStatus" checked> Saving Throw avoids or ends a Status Condition (first this Turn: Advantage)</label>
    <p class="ak5e-ward-note" role="note">The first qualifying save each combat Turn has Advantage; later saves this Turn are normal.</p>`;
  const form = await prompt("Status Resistance", content);
  if (!form) return null;
  return {
    targetUuid: target?.uuid ?? null,
    savingAgainstStatus: form.savingAgainstStatus === "on"
  };
}

async function askTreatTheCause(actor, context = {}) {
  const target = firstTarget();
  const content = `
    <p>${target ? `Warded Creature: <strong>${esc(target.name)}</strong>` : "<em>No token is targeted. Select the warded Creature first.</em>"}</p>
    <label>Attacking Creature <input type="text" name="attackerName" value="" placeholder="Name (or target the attacker's token afterwards)"></label>
    <label>Triggering attack card (message UUID, optional) <input type="text" name="attackMessageUuid" value="${esc(context.attackMessageUuid ?? "")}" placeholder="Leave blank to apply the miss manually"></label>
    <label>Attacker's distance from the warded Creature (feet) <input type="number" name="attackerDistanceFeet" min="0" step="5" value="30"></label>
    <label>Spell Save DC <input type="number" name="saveDC" min="0" step="1" value="${esc(medicSpellDC(actor))}"></label>
    <label>Attacker's DEX save total (owner roll) <input type="number" name="ownerRollDexSave" min="0" step="1"> </label>
    <label>Owner's 2d10 Force damage <input type="number" name="ownerRoll2d10" min="0" step="1" required></label>
    <label><input type="checkbox" name="restoreReaction"> Expend 15 Life Support to restore the Reaction</label>
    <label><input type="checkbox" name="lateApplication"> The damage was already applied (late defense)</label>`;
  const form = await prompt("Treat the Cause, not the Symptom", content);
  if (!form) return null;
  const attackMessageUuid = String(form.attackMessageUuid ?? "").trim()
    || (typeof context.attackMessageUuid === "string" && context.attackMessageUuid ? context.attackMessageUuid : null);
  return {
    targetUuid: target?.uuid ?? null,
    attackMessageUuid,
    attackerUuid: actorFor(contextAttackerUuid(form))?.uuid ?? null,
    attackerName: String(form.attackerName || ""),
    attackerDistanceFeet: form.attackerDistanceFeet === "" ? null : Number(form.attackerDistanceFeet),
    saveDC: Number(form.saveDC || 0),
    ownerRollDexSave: form.ownerRollDexSave === "" ? undefined : Number(form.ownerRollDexSave),
    ownerRoll2d10: Number(form.ownerRoll2d10 || 0),
    restoreReaction: form.restoreReaction === "on",
    lateApplication: form.lateApplication === "on"
  };
}
function contextAttackerUuid(form) {
  const value = String(form?.attackerName ?? "").trim();
  if (!value) return null;
  const byUuid = actorFor(value);
  if (byUuid) return byUuid.uuid;
  const match = Array.from(globalThis.game?.actors?.values?.() ?? []).find(candidate => candidate?.name === value);
  return match?.uuid ?? null;
}

async function askWardingSurge(actor) {
  const target = firstTarget();
  const content = `
    <p>${target ? `Protected Creature: <strong>${esc(target.name)}</strong>` : "<em>No token is targeted. Select the protected Creature first.</em>"}</p>
    <label>Triggering Damage Types (comma separated) <input type="text" name="damageTypes" value="fire" required></label>
    <label><input type="checkbox" name="restoreReaction"> Expend 15 more Life Support to restore the Reaction</label>`;
  const form = await prompt("Warding Surge", content);
  if (!form) return null;
  return {
    targetUuid: target?.uuid ?? null,
    damageTypes: String(form.damageTypes || "").split(",").map(type => type.trim().toLowerCase()).filter(Boolean),
    restoreReaction: form.restoreReaction === "on"
  };
}

async function askCollectiveWard(actor) {
  const target = firstTarget();
  const donors = targets().filter(candidate => candidate.uuid !== target?.uuid);
  const donorRows = donors.map((donor, index) => {
    const view = wardView(donor, actor);
    return `<label><input type="checkbox" name="donor${index}"${view.own && view.ward > 0 ? " checked" : ""}${view.own && view.ward > 0 ? "" : " disabled"}> ${esc(donor.name)}: ${esc(view.ward)} Ward</label>
      <label>Remove from ${esc(donor.name)} <input type="number" name="remove${index}" min="0" max="${esc(view.ward)}" step="1" value="0"></label>
      <label>${esc(donor.name)} distance from the Medic (feet) <input type="number" name="distance${index}" min="0" step="5" value="30"></label>`;
  }).join("");
  const content = `
    <p>${target ? `Recipient: <strong>${esc(target.name)}</strong> — ${esc(target.system?.attributes?.hp?.temp ?? 0)} Temporary Hit Points` : "<em>No token is targeted. Select the recipient first.</em>"}</p>
    <label>Damage remaining after DR and Resistance <input type="number" name="damage" min="0" step="1" value="0" required></label>
    <label>Recipient distance from the Medic (feet) <input type="number" name="recipientDistanceFeet" min="0" step="5" value="30"></label>
    <fieldset><legend>Donors (within 30 feet, this Medic's Ward only)</legend>${donorRows || "<p>No other targeted Creature.</p>"}</fieldset>`;
  const form = await prompt("Collective Ward", content);
  if (!form) return null;
  const selected = [], removals = {};
  donors.forEach((donor, index) => {
    if (form[`donor${index}`] !== "on") return;
    selected.push({ uuid: donor.uuid, distanceFeet: Number(form[`distance${index}`] ?? 30) });
    // uuids contain dots; the receipt is stored in a flag, so key removals by an opaque digest.
    removals[opaqueKey(donor.uuid)] = Number(form[`remove${index}`] ?? 0);
  });
  return {
    targetUuid: target?.uuid ?? null,
    damage: Number(form.damage || 0),
    recipientDistanceFeet: form.recipientDistanceFeet === "" ? null : Number(form.recipientDistanceFeet),
    donors: selected,
    removals
  };
}

async function askWardRegeneration(actor, context = {}) {
  // Ward Regeneration always applies to the Medic whose Turn begins.
  const target = actorFor(context.actorUuid) ?? actor;
  const content = `
    <p>${esc(target.name)} begins their Turn without their Ward${context.amount ? ` and gains ${esc(context.amount)} Temporary Hit Points` : ""}.</p>
    <p class="ak5e-ward-note" role="note">Ward Regeneration applies at the start of the Medic's own Turn. Using it at any other time is recorded as a manual table correction.</p>
    <label>Other Temporary Hit Points <select name="keepOrReplace"><option value="">—</option><option value="keep">Keep</option><option value="replace">Replace</option></select></label>`;
  const form = await prompt("Ward Regeneration", content);
  if (!form) return null;
  return {
    targetUuid: target.uuid,
    turnStart: context.turnStart === true,
    offerTurnKey: typeof context.offerTurnKey === "string" ? context.offerTurnKey : null,
    ...(form.keepOrReplace ? { keepOrReplace: String(form.keepOrReplace) } : {})
  };
}

async function askReapplyForeignPool(actor) {
  const target = firstTarget();
  const tag = target ? flag(target, "ward") ?? null : null;
  const content = `
    <p>${target ? `Creature: <strong>${esc(target.name)}</strong> — ${esc(target.system?.attributes?.hp?.temp ?? 0)} Temporary Hit Points` : "<em>No token is targeted. Select the Creature first.</em>"}</p>
    <p class="ak5e-ward-note" role="note">Recording a foreign pool clears this Medic's Ward provenance with visible context; it never stacks or merges pools.</p>
    <label>Originating source (Medic UUID or name) <input type="text" name="medicUuid" value="${esc(tag?.medicUuid ?? "")}" required></label>
    <label>Replacement Temporary Hit Points <input type="number" name="amount" min="0" step="1" value="${esc(target?.system?.attributes?.hp?.temp ?? 0)}" required></label>`;
  const form = await prompt("Record foreign Temporary Hit Points", content);
  if (!form) return null;
  const medicUuid = String(form.medicUuid ?? "").trim();
  return {
    targetUuid: target?.uuid ?? null,
    foreign: { medicUuid, amount: Number(form.amount || 0) }
  };
}

/**
 * Route one Ward command from the section (or a card control). Returns `false` for any command
 * this module does not own, so the parent sheet can chain modules safely.
 */
export async function handleWardCommand(actor, command, context = {}) {
  if (!WARD_COMMANDS.includes(command)) return false;
  if (!medicEnabled(actor)) { ui?.notifications?.warn?.("The Ward features belong to a configured Medic."); return true; }
  return safe(async () => {
    let data = null;
    if (command === "wardGrant") data = await askWardGrant(actor);
    else if (command === "wardLifeSupport") data = await askWardLifeSupport(actor);
    else if (command === "statusResistance") data = await askStatusResistance(actor);
    else if (command === "treatTheCause") data = await askTreatTheCause(actor, context);
    else if (command === "wardingSurge") data = await askWardingSurge(actor);
    else if (command === "collectiveWard") data = await askCollectiveWard(actor);
    else if (command === "wardRegeneration") data = await askWardRegeneration(actor, context);
    else if (command === "reapplyForeignPool") data = await askReapplyForeignPool(actor);
    else data = { targetUuid: firstTarget()?.uuid ?? null };
    if (data === null) return null;
    if (typeof context.attackMessageUuid === "string" && context.attackMessageUuid && !data.attackMessageUuid) {
      data.attackMessageUuid = context.attackMessageUuid;
    }
    if (!data.targetUuid && command !== "collectiveWard") {
      ui?.notifications?.warn?.("Target the Creature first; nothing was written.");
      return null;
    }
    // Validate before showing the confirm: invalid choices get their guided message and
    // cannot produce a null plan or make any writes.
    let plan;
    try { plan = await medicUses.preview(actor, command, data); }
    catch (error) {
      ui?.notifications?.warn?.(error?.message ?? String(error));
      return null;
    }
    // The first dialog has already captured this reading; don't offer a second radio
    // group defaulting to a different value, and preserve it when merging confirmation.
    plan.readings = (plan.readings ?? []).filter(reading => !Object.hasOwn(data.readings ?? {}, reading.key));
    return confirmPlayUse(LABELS[command] ?? command, extra =>
      medicUses.command(actor, command, {
        confirmed: true, ...data, ...extra, ...(context.extra ?? {}),
        readings: { ...(data.readings ?? {}), ...(extra.readings ?? {}), ...(context.extra?.readings ?? {}) }
      }, operationId()), { preview: async () => plan });
  });
}

/** Wire a rendered section (panel or dialog) to `handleWardCommand`. */
export function wireWardSection(actor, root) {
  if (!root?.querySelectorAll) return;
  for (const control of root.querySelectorAll("[data-medic-cmd]")) {
    const command = control.dataset?.medicCmd;
    if (!WARD_COMMANDS.includes(command) || control.dataset.wardWired === "1") continue;
    control.dataset.wardWired = "1";
    control.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      control.disabled = true;
      safe(() => handleWardCommand(actor, command, { ...(control.dataset ?? {}) })).finally(() => { control.disabled = false; });
    });
  }
}

/** Chat-card control for the turn-start Ward Regeneration offer. */
export function wireWardCard(message, html) {
  const offer = flag(message, "wardRegenerationOffer");
  if (!offer?.actorUuid || !html?.querySelector) return;
  const actor = actorFor(offer.actorUuid);
  if (!actor?.isOwner) return;
  for (const control of html.querySelectorAll('[data-medic-cmd="wardRegeneration"]')) {
    if (control.dataset.wardWired === "1") continue;
    control.dataset.wardWired = "1";
    control.addEventListener("click", event => {
      event.preventDefault();
      safe(() => handleWardCommand(actor, "wardRegeneration", { actorUuid: offer.actorUuid, amount: offer.amount, turnStart: true, offerTurnKey: offer.turnKey }));
    });
  }
}
