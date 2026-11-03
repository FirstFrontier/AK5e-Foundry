/**
 * Therapist sheet surface: the branch panel markup and its guided commands.
 *
 * `renderTherapistSection(actor)` is pure: it returns escaped `data-medic-cmd` markup and never
 * writes. `handleTherapistCommand(actor, command, context)` owns the confirm-before-use flow for
 * the Therapist's own commands and returns `false` for any command that belongs to another
 * Medic branch or to the shared Medic panel (WORKFLOW §3.2: one confirmation per use).
 */
import { medicEnabled, pbForLevel } from "./medic-rules.mjs";
import { medicUses } from "./medic-uses.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import {
  THERAPIES,
  therapyById,
  doctorIsInActive,
  earlyOnsetUses
} from "./therapist-rules.mjs";
import { isTherapist, therapistState, therapistRiders, castableTherapistArts, openEarlyOnsetCast,
  postEarlyOnsetCastCard, confirmTherapistPasses, restoreTherapistPass, therapistPassMarkers } from "./therapist-features.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const operationId = () => foundry.utils.randomID();
const currentTarget = () => Array.from(globalThis.game?.user?.targets ?? [])[0]?.actor ?? null;
const rows = items => (items ?? []).map(entry => `<li>${entry}</li>`).join("");

/** Branch panel markup. Pure: no writes, no dialogs, no dice. */
export function renderTherapistSection(actor) {
  if (!isTherapist(actor)) return "";
  const state = therapistState(actor);
  const level = state.level || 1;
  const active = Boolean(state.doctorIsIn) && doctorIsInActive({ doctorIsIn: state.doctorIsIn }, Number(globalThis.game?.time?.worldTime ?? 0));
  const chosen = state.doctorIsIn?.chosenId ? therapyById(state.doctorIsIn.chosenId) : null;
  const usesTotal = earlyOnsetUses(pbForLevel(level));
  const usesRemaining = Math.max(0, usesTotal - state.earlyOnsetUsed);
  const riders = therapistRiders(actor);
  const advanced = level >= 11;
  const lines = [];
  lines.push(`<p class="ak5e-therapist-status"><strong>The Doctor Is In:</strong> ${active
    ? `active${chosen ? ` — ${esc(chosen.name)} is free` : ""}${state.concentratedAllowance ? `; ${esc(state.concentratedAllowance)} free Concentrated Therapies remain` : ""}`
    : state.usedSinceLongRest ? "used since the last Long Rest" : "ready"}</p>`);
  lines.push(`<p class="ak5e-therapist-status"><strong>Concentrated Treatment:</strong> ${esc(state.concentratedAllowance)} free ${state.concentratedAllowance === 1 ? "Therapy" : "Therapies"}${level >= 15 ? "" : " (a 15th-level feature)"}</p>`);
  lines.push(`<p class="ak5e-therapist-status"><strong>Early Onset Treatment:</strong> ${usesRemaining} / ${usesTotal} uses${level >= 7 ? "" : " (a 7th-level feature)"}${state.earlyOnsetPending ? ` — casting as a Reaction at ${esc(state.earlyOnsetPending.requiredTargetUuid)}` : ""}</p>`);
  lines.push(`<p class="ak5e-therapist-status"><strong>Therapies:</strong> ${esc(THERAPIES.filter(therapy => therapy.tier === "basic" || advanced).length)} available (${esc(advanced ? "basic and advanced" : "basic")}); choose them in the Art's native cast dialog.</p>`);
  if (riders.length) {
    lines.push(`<ul class="ak5e-therapist-riders">${rows(riders.map(rider =>
      `<strong>${esc(rider.label)}</strong>${rider.package ? ` <button type="button" data-medic-cmd="rollPackage" data-therapist-rider="${esc(rider.id)}">Roll ${esc(rider.rider?.formula ?? "1d6")}</button>` : ""}${rider.therapyId === "regenerative" ? ` <button type="button" data-medic-cmd="rollRegenerative" data-therapist-rider="${esc(rider.id)}">Roll 1d6</button>` : ""}${rider.therapyId === "resistance" || rider.therapyId === "psychological" ? ` <button type="button" data-medic-cmd="confirmAutoPass" data-therapist-rider="${esc(rider.id)}">Confirm automatic pass</button>` : ""}`))}</ul>`);
  }
  const passMarkers = Object.entries(actor.flags?.ak5e?.therapistPass ?? {});
  if (passMarkers.length) {
    lines.push(`<ul class="ak5e-therapist-passes">${rows(passMarkers.map(([key, marker]) =>
      `<strong>Consumed pass</strong> (${esc(marker?.eventId ?? key)}) <button type="button" data-medic-cmd="restoreAutoPass" data-therapist-marker="${esc(key)}">Restore the pass rider</button>`))}</ul>`);
  }
  const controls = [];
  controls.push(`<button type="button" data-medic-cmd="doctorIsIn"${level >= 4 ? "" : " disabled"}>The Doctor Is In (Bonus Action)</button>`);
  controls.push(`<button type="button" data-medic-cmd="earlyOnset"${level >= 7 ? "" : " disabled"}>Early Onset Treatment (Reaction)</button>`);
  controls.push(`<button type="button" data-medic-cmd="reviewTherapies">Review Therapies</button>`);
  if (advanced) controls.push(`<button type="button" data-medic-cmd="cleansingTherapy">Cleansing Therapy (end one condition)</button>`);
  return `<section class="ak5e-therapist-panel">
  <h4>Therapist</h4>
  ${lines.join("\n  ")}
  <div class="ak5e-button-row">${controls.join("")}</div>
  <p class="ak5e-therapist-note"><em>Opening this panel makes no changes. Every use is confirmed; Therapies are chosen in the native Art cast dialog and are recorded on that cast's receipt.</em></p>
</section>`;
}

const COMMANDS = new Set(["doctorIsIn", "earlyOnset", "reviewTherapies", "cleansingTherapy", "rollRegenerative", "rollPackage", "confirmAutoPass", "restoreAutoPass"]);

/** True when this module handles the command; used by the parent before forwarding. */
export const isTherapistCommand = command => COMMANDS.has(String(command ?? ""));

/** Guided commands. Returns `false` only for a command this module does not own. */
export async function handleTherapistCommand(actor, command, context = {}) {
  if (!COMMANDS.has(String(command ?? ""))) return false;
  if (!medicEnabled(actor) || !isTherapist(actor)) {
    globalThis.ui?.notifications?.warn?.("This command belongs to the Therapist branch; choose a Therapist Medic.");
    return null;
  }
  if (command === "doctorIsIn") return openDoctorIsIn(actor);
  if (command === "earlyOnset") return openEarlyOnset(actor, context);
  if (command === "reviewTherapies") return openTherapyReview(actor);
  if (command === "cleansingTherapy") return openCleansing(actor, context);
  if (command === "rollRegenerative") return rollRegenerative(actor, context);
  if (command === "rollPackage") return rollPackage(actor, context);
  if (command === "confirmAutoPass") return confirmAutoPass(actor, context);
  if (command === "restoreAutoPass") return restoreAutoPass(actor, context);
  return false;
}

async function openDoctorIsIn(actor) {
  const state = therapistState(actor);
  const basics = THERAPIES.filter(therapy => therapy.tier === "basic");
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "The Doctor Is In" }, position: { width: 520 }, rejectClose: false,
    content: `<p>Activate this feature as a Bonus Action: choose one Basic Therapy. For the next minute it costs no Life Support, and one additional, different Therapy may join it on each Art you cast. Once per Long Rest.</p>
      <label>Basic Therapy
        <select name="chosenId">${basics.map(therapy => `<option value="${esc(therapy.id)}"${state.doctorIsIn?.chosenId === therapy.id ? " selected" : ""}>${esc(therapy.name)} (${esc(therapy.lifeSupportCost)} Life Support)</option>`).join("")}</select>
      </label>`,
    buttons: [
      { action: "review", label: "Review this use", callback: (_event, button) => ({ chosenId: button.form.elements.chosenId?.value ?? "" }) },
      { action: "cancel", label: "Cancel", default: true, callback: () => false }
    ]
  });
  if (!choice?.chosenId) return null;
  return confirmPlayUse("The Doctor Is In", extra =>
    medicUses.command(actor, "doctorIsIn", { confirmed: true, chosenId: choice.chosenId, ...extra }, operationId()),
  { preview: extra => medicUses.preview(actor, "doctorIsIn", { chosenId: choice.chosenId, ...extra }) });
}

async function openEarlyOnset(actor, context = {}) {
  const target = context.target ?? currentTarget();
  const trigger = context.triggerEventId ?? `hitTaken:${operationId()}`;
  const arts = castableTherapistArts(actor);
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: "Early Onset Treatment" }, position: { width: 560 }, rejectClose: false,
    content: `<p>When an allied Creature you can see takes Damage, you may cast an Art with a Casting Time of an Action or a Bonus Action as a Reaction. That Art must target the damaged Creature. Uses equal your Proficiency Bonus, refreshed by a Long Rest.</p>
      <label>Art to cast as a Reaction
        <select name="artItemId">
          ${arts.length ? arts.map(art => `<option value="${esc(art.id)}">${esc(art.name)} (${esc(art.activation || "unknown casting time")}${art.level ? `, level ${art.level}` : ""})</option>`).join("") : `<option value="">No castable Art available</option>`}
          <option value="">Decide at the table (manual cast)</option>
        </select>
      </label>
      <p>Damaged Creature: ${target ? `<strong>${esc(target.name)}</strong>` : "<em>no token targeted</em>"}</p>
      <label><input type="checkbox" name="damagedIsAlly" value="true" checked> The damaged Creature is an ally</label>
      <label><input type="checkbox" name="canSee" value="true" checked> I can see the damaged Creature</label>
      <label>Triggering event ID <input type="text" name="triggerEventId" value="${esc(trigger)}"></label>
      <p><em>Confirming records the use and opens the chosen Art's native cast dialog with a Reaction context; the Reaction itself is spent by that cast. Cancelling the native cast dialog refunds the recorded use automatically, so cancellation changes nothing. Choosing no Art leaves the use recorded for a manual cast at the table.</em></p>`,
    buttons: [
      { action: "review", label: "Review this use", callback: (_event, button) => ({
        artItemId: button.form.elements.artItemId?.value ?? "",
        damagedIsAlly: Boolean(button.form.elements.damagedIsAlly?.checked),
        canSee: Boolean(button.form.elements.canSee?.checked),
        triggerEventId: button.form.elements.triggerEventId?.value ?? trigger
      }) },
      { action: "cancel", label: "Cancel", default: true, callback: () => false }
    ]
  });
  if (!answer) return null;
  const art = arts.find(entry => entry.id === answer.artItemId) ?? null;
  const data = {
    artItemId: art?.id ?? null,
    damagedIsAlly: answer.damagedIsAlly,
    canSee: answer.canSee,
    triggerEventId: answer.triggerEventId,
    damagedUuid: target?.uuid ?? context.damagedUuid ?? null,
    requiredTargetUuid: target?.uuid ?? context.requiredTargetUuid ?? null,
    targetUuids: target?.uuid ? [target.uuid] : (context.targetUuids ?? [])
  };
  const useId = operationId();
  const result = await confirmPlayUse("Early Onset Treatment", extra =>
    medicUses.command(actor, "earlyOnset", { confirmed: true, ...data, ...extra }, useId),
  { preview: extra => medicUses.preview(actor, "earlyOnset", { ...data, ...extra }) });
  if (!result) return null;
  const cast = { artItemId: result.artItemId ?? null, activityId: result.activityId ?? null,
    triggerEventId: result.triggerEventId, requiredTargetUuid: result.requiredTargetUuid,
    artName: art?.name ?? null, targetName: target?.name ?? null,
    usesRemaining: result.usesRemaining, usesTotal: result.usesTotal };
  await postEarlyOnsetCastCard(actor, cast);
  if (!cast.artItemId) return result;
  let native = null, openFailed = false;
  try {
    native = await openEarlyOnsetCast(actor, cast);
  } catch (error) {
    openFailed = true;
    console.error("AK5e | Early Onset cast", error);
    globalThis.ui?.notifications?.warn?.("The native Art dialog could not be opened; use the card button to cast as a Reaction.");
  }
  if (!openFailed && !native) {
    // The native cast dialog was cancelled: refund the recorded use through its own undo
    // path so cancellation changes nothing (E4/3.2.4). A dialog that failed to open keeps
    // the use, and the card button still offers the manual reaction cast.
    try {
      await medicUses.command(actor, "undoUse", { useId }, operationId());
      globalThis.ui?.notifications?.info?.("Early Onset Treatment use refunded: the native Art cast was cancelled.");
    } catch (undoError) {
      console.error("AK5e | Early Onset refund", undoError);
      globalThis.ui?.notifications?.warn?.("The native cast was cancelled but the recorded use could not be refunded; undo it from the Medic panel.");
    }
    return null;
  }
  return result;
}

async function openTherapyReview(actor) {
  const state = therapistState(actor);
  const level = state.level || 1;
  const active = Boolean(state.doctorIsIn) && doctorIsInActive({ doctorIsIn: state.doctorIsIn }, Number(globalThis.game?.time?.worldTime ?? 0));
  const body = THERAPIES.map(therapy => `<tr><td>${esc(therapy.name)}</td><td>${esc(therapy.lifeSupportCost)}</td><td>${esc(therapy.tier)}</td><td>${level >= therapy.minLevel ? "available" : `locked (level ${esc(therapy.minLevel)})`}</td></tr>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Therapist Therapies" }, position: { width: 620 }, rejectClose: false,
    content: `<p>Nine Therapies modify an Art you cast. Select them in the Art's native cast dialog; the Life Support cost is charged with that cast and is undone with it.</p>
      <p><strong>The Doctor Is In:</strong> ${active ? `active — ${esc(therapyById(state.doctorIsIn?.chosenId)?.name ?? "chosen Therapy")} is free, and a second different Therapy is allowed` : "not active"}. <strong>Concentrated allowance:</strong> ${esc(state.concentratedAllowance)}.</p>
      <table class="ak5e-source-table"><thead><tr><th>Ther-apy</th><th>Life Support</th><th>Tier</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>
      <p><em>This review writes nothing. Each Therapy's prerequisites are warnings at cast time, never a block.</em></p>`,
    buttons: [{ action: "close", label: "Close", default: true }]
  });
}

async function openCleansing(actor, context = {}) {
  const target = context.target ?? currentTarget();
  if (!target) {
    globalThis.ui?.notifications?.warn?.("Target the Creature whose Status Condition Cleansing Therapy should end.");
    return null;
  }
  const effects = Array.from(target.effects ?? []).map(effect => ({ id: effect.id, name: effect.name ?? effect.label ?? effect.id }));
  if (!effects.length) {
    globalThis.ui?.notifications?.info?.(`${target.name} has no Status Conditions recorded.`);
    return null;
  }
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Cleansing Therapy" }, rejectClose: false,
    content: `<p>Cleansing Therapy ends one Status Condition affecting ${esc(target.name)}.</p>
      <label>Status Condition
        <select name="conditionId">${effects.map(effect => `<option value="${esc(effect.id)}">${esc(effect.name)}</option>`).join("")}</select>
      </label>`,
    buttons: [
      { action: "review", label: "Review this use", callback: (_event, button) => ({ conditionId: button.form.elements.conditionId?.value ?? "" }) },
      { action: "cancel", label: "Cancel", default: true, callback: () => false }
    ]
  });
  if (!choice?.conditionId) return null;
  const data = { targetUuid: target.uuid, conditionId: choice.conditionId, label: `Cleansing Therapy: ${effects.find(effect => effect.id === choice.conditionId)?.name ?? "Status Condition"}` };
  return confirmPlayUse("Cleansing Therapy", extra =>
    medicUses.command(actor, "therapistCleansing", { confirmed: true, ...data, ...extra }, operationId()),
  { preview: extra => medicUses.preview(actor, "therapistCleansing", { ...data, ...extra }) });
}

async function rollRegenerative(actor, context = {}) {
  const riderId = context.riderId ?? null;
  const riders = therapistRiders(actor).filter(rider => rider.therapyId === "regenerative" && (riderId ? rider.id === riderId : true));
  if (!riders.length) {
    globalThis.ui?.notifications?.info?.("No active Regenerative Therapy rider is recorded on this Creature.");
    return null;
  }
  const rider = riders[0];
  const owner = rider.casterUuid && rider.casterUuid !== actor.uuid ? globalThis.fromUuidSync?.(rider.casterUuid) : actor;
  const caster = owner?.documentName === "Actor" ? owner : actor;
  const roll = await new Roll(rider.rider?.formula ?? "1d6", actor.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: "Regenerative Therapy" });
  const amount = Math.max(1, Number(roll.total) || 1);
  return confirmPlayUse("Regenerative Therapy", extra => medicUses.command(caster, "therapistHeal",
    { confirmed: true, amount, targetUuid: actor.uuid, targetName: actor.name, label: "Regenerative Therapy", riderId: rider.id, ...extra }, operationId()), {
    preview: extra => medicUses.preview(caster, "therapistHeal", { amount, targetUuid: actor.uuid, targetName: actor.name, label: "Regenerative Therapy", ...extra })
  });
}

/** Concentrated Treatment package: the owner clicks the roll, then confirms the healing. */
async function rollPackage(actor, context = {}) {
  const riderId = context.riderId ?? null;
  const riders = therapistRiders(actor).filter(rider => rider.package && (riderId ? rider.id === riderId : true));
  if (!riders.length) {
    globalThis.ui?.notifications?.info?.("No pending Concentrated Treatment package is recorded on this Creature.");
    return null;
  }
  const rider = riders[0];
  const casterDoc = rider.casterUuid ? globalThis.fromUuidSync?.(rider.casterUuid) : null;
  const caster = casterDoc?.documentName === "Actor" ? casterDoc : actor;
  const formula = rider.rider?.formula ?? "1d6";
  const roll = await new Roll(formula, caster.getRollData?.() ?? {}).evaluate();
  await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor: caster }), flavor: "Concentrated Treatment" });
  const amount = Math.max(1, Number(roll.total) || 1);
  return confirmPlayUse("Concentrated Treatment", extra => medicUses.command(caster, "therapistHeal",
    { confirmed: true, amount, targetUuid: actor.uuid, targetName: actor.name, label: "Concentrated Treatment", riderId: rider.id, ...extra }, operationId()), {
    preview: extra => medicUses.preview(caster, "therapistHeal", { amount, targetUuid: actor.uuid, targetName: actor.name, label: "Concentrated Treatment", ...extra })
  });
}

async function confirmAutoPass(actor, context = {}) {
  const riderId = context.riderId ?? null;
  const riders = therapistRiders(actor).filter(rider => ["psychological", "resistance"].includes(rider.therapyId) && (riderId ? rider.id === riderId : true));
  if (!riders.length) {
    globalThis.ui?.notifications?.info?.("No active automatic-pass Therapy rider is recorded on this Creature.");
    return null;
  }
  const list = riders.map(rider => `<li>${esc(rider.label)}${rider.therapyId === "resistance" ? " — confirm only for a save against an Arts or Art-like effect" : ""}</li>`).join("");
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: "Therapy: automatic pass" }, rejectClose: false,
    content: `<p>Confirming records that the saving throw automatically passes. The module does not roll or change any die.</p><ul>${list}</ul>`,
    buttons: [
      { action: "confirm", label: "Confirm automatic pass", callback: () => true },
      { action: "cancel", label: "Cancel", default: true, callback: () => false }
    ]
  });
  if (answer !== true) return null;
  const eventId = `pass:${operationId()}`;
  return confirmTherapistPasses(actor, eventId, riderId ? [riderId] : null);
}

async function restoreAutoPass(actor, context = {}) {
  const markers = therapistPassMarkers(actor);
  const keys = Object.keys(markers ?? {});
  if (!keys.length) {
    globalThis.ui?.notifications?.info?.("No consumed automatic pass is recorded on this Creature.");
    return null;
  }
  let markerKey = typeof context.markerId === "string" && context.markerId ? context.markerId
    : (typeof context.therapistMarker === "string" && context.therapistMarker ? context.therapistMarker : null);
  if (!markerKey && keys.length === 1) markerKey = keys[0];
  if (!markerKey) {
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: "Restore automatic pass" }, rejectClose: false,
      content: `<p>Choose the consumed pass to restore. Restoring reinstates the rider exactly as it was before the confirm.</p>
        <label>Consumed pass
          <select name="markerId">${keys.map(key => `<option value="${esc(key)}">${esc(markers[key]?.eventId ?? key)}</option>`).join("")}</select>
        </label>`,
      buttons: [
        { action: "restore", label: "Restore this pass", callback: (_event, button) => button.form.elements.markerId?.value ?? false },
        { action: "cancel", label: "Cancel", default: true, callback: () => false }
      ]
    });
    if (!choice || !keys.includes(choice)) return null;
    markerKey = choice;
  }
  return restoreTherapistPass(actor, markerKey);
}

/** Exported for the parent panel's click wiring; opening never writes. */
export const THERAPIST_SHEET_COMMANDS = Object.freeze([...COMMANDS]);
