/** Recipient-owned controls for active Vanguard Tip of the Spear outcome effects. */
import { createPlayUses } from "./play-uses.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { flag, values, need, opaqueKey } from "./operation-kernel.mjs";
import { warn } from "./play-uses.mjs";

const actorBenefits = actor => values(actor?.effects).filter(effect => !effect.disabled
  && ["tip1", "tip6"].includes(flag(effect, "vanguardUsesEffect")?.standardBenefit?.kind));
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const benefits = createPlayUses({ ns: "vanguardBenefits", label: "Vanguard Benefit", isMember: actor => actor?.documentName === "Actor" && actor.isOwner });

const PLANS = {
  armTipDamage(actor, state, data) {
    const effect = actor.effects?.get?.(data.effectId) ?? values(actor.effects).find(candidate => candidate.id === data.effectId);
    const meta = flag(effect, "vanguardUsesEffect")?.standardBenefit;
    need(effect && !effect.disabled && meta?.kind === "tip1" && meta.bearerUuid
      && flag(effect, "vanguardUsesEffect")?.sourceUuid === meta.bearerUuid
      && flag(effect, "vanguardUsesEffect")?.opId === flag(effect, "vanguardUsesEffect")?.sourceUseId,
      "Choose an active managed Tip of the Spear Damage bonus on this creature.");
    const componentIndex = Number(data.componentIndex ?? 0);
    need(Number.isSafeInteger(componentIndex) && componentIndex >= 0, "Choose a non-negative native Damage Roll component.");
    const used = flag(actor, "vanguardTipBenefits")?.used ?? {};
    need(!used[effect.id], "This Tip damage bonus was already used.");
    const warnings = [];
    if (flag(actor, "vanguardTipBenefits")?.armed) warn(warnings, "armed", "Another Tip damage bonus is armed; using this one replaces that pending selection.");
    return { warnings, title: "Tip of the Spear: arm one Damage Roll", apply(_next, receipt) {
      receipt.effectId = effect.id; receipt.bonus = Number(meta.value) || 0; receipt.componentIndex = componentIndex;
      receipt.bearerUuid = meta.bearerUuid; receipt.nativePending = true;
      receipt.targets = [{ uuid: actor.uuid, name: effect.name, kind: "tipBenefitEffect", effectId: effect.id, ready: false }];
      receipt.summary = `Arm +${receipt.bonus} for component ${componentIndex} of the next native Damage Roll. No die is rolled here; canceling the roll leaves this benefit armed.`;
      receipt.result = { armed: true, bonus: receipt.bonus, componentIndex };
      return { "flags.ak5e.vanguardTipBenefits.armed": { useId: receipt.id, effectId: effect.id,
        actorUuid: actor.uuid, bearerUuid: meta.bearerUuid, bonus: receipt.bonus, componentIndex } };
    } };
  },

  tipSkillPointBonus(actor, state, data) {
    const effect = actor.effects?.get?.(data.effectId) ?? values(actor.effects).find(candidate => candidate.id === data.effectId);
    const meta = flag(effect, "vanguardUsesEffect")?.standardBenefit;
    need(effect && !effect.disabled && meta?.kind === "tip6" && meta.bearerUuid
      && flag(effect, "vanguardUsesEffect")?.sourceUuid === meta.bearerUuid
      && flag(effect, "vanguardUsesEffect")?.opId === flag(effect, "vanguardUsesEffect")?.sourceUseId,
      "Choose an active managed Tip of the Spear Skill Point benefit on this creature.");
    const operator = flag(actor, "operatorSkills") ?? {};
    need(operator.enabled === true && Number.isFinite(Number(operator.maximum)), "Enable this Actor's existing Operator Skill Point pool before recording its gain.");
    const eventId = String(data.eventId ?? "");
    const sourceGain = (operator.receipts ?? []).find(event => event.id === eventId && Number(event.gained) > 0)
      ?? (operator.operatorEvents ?? []).find(event => event.id === eventId && Number(event.spGained) > 0 && event.kind !== "tipBonus");
    need(sourceGain, "Choose a committed, positive Skill Point gain receipt for this creature.");
    need(sourceGain.undone !== true && sourceGain.reversed !== true && sourceGain.status !== "undone"
      && !(operator.operatorEvents ?? []).some(event => event.reversesEventId === eventId || event.invalidatesEventId === eventId),
      "This Skill Point gain was undone or invalidated and cannot receive a Tip bonus.");
    const recordedGain = Number(sourceGain.gained ?? sourceGain.spGained), recordedBefore = Number(sourceGain.before ?? sourceGain.spBefore), recordedAfter = Number(sourceGain.after ?? sourceGain.spAfter);
    need(Number.isFinite(recordedBefore) && Number.isFinite(recordedAfter) && recordedAfter - recordedBefore === recordedGain,
      "The recorded Skill Point gain no longer has a consistent before/after receipt.");
    const priorTipBonus = (operator.operatorEvents ?? []).find(event => event.id === `tip:${eventId}`);
    need(!priorTipBonus, "This Skill Point gain already received the Tip of the Spear bonus.");
    const activeBenefits = actorBenefits(actor).filter(item => flag(item, "vanguardUsesEffect")?.standardBenefit?.kind === "tip6");
    const count = activeBenefits.length;
    need(count > 0, "No active Tip of the Spear Skill Point benefits remain.");
    const warnings = [];
    const sourceTime = Number(sourceGain.createdAt ?? sourceGain.time ?? 0);
    const benefitTimesKnown = activeBenefits.every(item => Number(flag(item, "vanguardUsesEffect")?.createdAt ?? item._stats?.createdTime ?? 0) > 0);
    if (sourceTime > 0 && activeBenefits.some(item => Number(flag(item, "vanguardUsesEffect")?.createdAt ?? item._stats?.createdTime ?? 0) > sourceTime)) {
      throw new Error("This Tip benefit was created after the recorded Skill Point gain and cannot modify it.");
    }
    if (!benefitTimesKnown || sourceTime <= 0) warn(warnings, "timing-unverified", "Confirm these Tip effects were active when the recorded Skill Point gain occurred.");
    if (operator.active) warn(warnings, "active-skill", "The shared Operator rules normally prevent Skill Point gains while a Skill is active.");
    const before = Math.max(0, Number(operator.points) || 0), maximum = Math.max(0, Number(operator.maximum) || 0);
    const requested = Math.max(0, Number(sourceGain.gained ?? sourceGain.spGained) || 0) * count;
    const after = Math.min(maximum, before + requested), gained = after - before;
    return { warnings, title: "Tip of the Spear: additional Skill Points", apply(_next, receipt) {
      receipt.eventId = eventId; receipt.effectIds = activeBenefits.map(item => item.id); receipt.sourceEvent = structuredClone(sourceGain);
      receipt.spBefore = before; receipt.spAfter = after; receipt.spRequested = requested; receipt.spGained = gained;
      receipt.summary = `${actor.name} gains ${gained} of ${requested} additional Skill Points from ${count} active Tip benefit${count === 1 ? "" : "s"}${gained < requested ? ` (capped at ${maximum})` : ""}.`;
      receipt.result = { eventId, count, requested, before, after, gained, maximum };
      const event = { id: `tip:${eventId}`, kind: "tipBonus", sourceId: activeBenefits[0] && flag(activeBenefits[0], "vanguardUsesEffect")?.sourceUuid,
        trigger: eventId, useId: receipt.id, spBefore: before, spAfter: after, spRequested: requested,
        spGained: gained, maximum, committed: true, createdAt: Date.now() };
      receipt.resources = [...(receipt.resources ?? []), { pool: null, path: "flags.ak5e.operatorSkills.points", before, after,
        max: maximum, label: "Skill Points" }];
      return { "flags.ak5e.operatorSkills.points": after,
        "flags.ak5e.operatorSkills.operatorEvents": [...(operator.operatorEvents ?? []), event] };
    } };
  }
};

PLANS.armTipDamage.undoUpdates = (actor, _state, receipt) => {
  const armed = flag(actor, "vanguardTipBenefits")?.armed;
  const updates = {};
  if (armed?.useId === receipt.id) updates["flags.ak5e.vanguardTipBenefits.armed"] = null;
  return updates;
};
PLANS.armTipDamage.validateNativeMessage = (actor, receipt, message, requester) => {
  const marker = flag(message, "vanguardTipDamage"), speaker = message.speaker ?? {};
  const speakerActor = speaker.token && speaker.scene
    ? globalThis.fromUuidSync?.(`Scene.${speaker.scene}.Token.${speaker.token}`)?.actor ?? globalThis.fromUuidSync?.(`Actor.${speaker.actor}`)
    : speaker.actor ? globalThis.fromUuidSync?.(`Actor.${speaker.actor}`) : null;
  return Boolean(marker?.useId === receipt.id && marker.actorUuid === actor.uuid && marker.effectId === receipt.effectId
    && marker.kind === "tipBenefitEffect" && speakerActor?.uuid === actor.uuid
    && message.author?.id === requester?.id && actor.testUserPermission?.(requester, "OWNER"));
};
PLANS.tipSkillPointBonus.undoUpdates = (actor, _state, receipt) => {
  const operator = flag(actor, "operatorSkills") ?? {}, events = operator.operatorEvents ?? [];
  const event = events.find(candidate => candidate.id === `tip:${receipt.eventId}` && candidate.useId === receipt.id);
  return event ? { "flags.ak5e.operatorSkills.operatorEvents": events.filter(candidate => candidate !== event) } : {};
};

const TARGET_KINDS = {
  tipBenefitEffect: {
    local: true,
    async apply(source, useId, entry, target) {
      const effect = target.effects?.get?.(entry.effectId);
      need(effect && !effect.disabled && flag(effect, "vanguardUsesEffect")?.standardBenefit?.kind === "tip1",
        "The giver removed or changed this Tip damage benefit before its native roll completed.");
      await effect.update({ disabled: true, [`flags.ak5e.vanguardBenefitConsumed.${opaqueKey(`${source.uuid}:${useId}`)}`]: { useId, sourceUuid: source.uuid } });
      return true;
    },
    async revert(source, useId, entry, target) {
      const effect = target.effects?.get?.(entry.effectId);
      if (!effect) return { missing: true };
      const used = flag(effect, "vanguardBenefitConsumed")?.[opaqueKey(`${source.uuid}:${useId}`)];
      if (!used || used.useId !== useId || !effect.disabled) return { unchanged: true };
      await effect.update({ disabled: false, [`flags.ak5e.vanguardBenefitConsumed.-=${opaqueKey(`${source.uuid}:${useId}`)}`]: null });
      return true;
    },
    preview(source, receipt, entry, target) {
      const effect = target?.effects?.get?.(entry.effectId);
      return effect?.disabled ? `${effect.name}: re-enable this consumed benefit if no later change conflicts.`
        : "The giver removed or changed this benefit; undo will not recreate it.";
    }
  }
};

benefits.register({ plans: PLANS, targetKinds: TARGET_KINDS });

function dialogPrompt(title, content, read) {
  return foundry.applications.api.DialogV2.prompt({ window: { title }, rejectClose: false, content,
    ok: { label: "Continue", callback: (_event, target) => read(target.form ?? target.closest("form")) } });
}
export async function openVanguardBenefits(actor) {
  if (!actor?.isOwner) throw new Error("Own this creature to resolve its Vanguard benefits.");
  const active = actorBenefits(actor);
  if (!active.length) throw new Error("This creature has no active Vanguard Tip benefits.");
  const selected = await dialogPrompt("Vanguard Tip benefits", `<label>Benefit <select name="effect">${active.map(effect => `<option value="${esc(effect.id)}">${esc(effect.name)} — ${esc(flag(effect, "vanguardUsesEffect")?.standardBenefit?.kind)}</option>`).join("")}</select></label>`, form => form.elements.effect.value);
  if (!selected) return null;
  const effect = active.find(item => item.id === selected), kind = flag(effect, "vanguardUsesEffect")?.standardBenefit?.kind;
  if (kind === "tip1") {
    const componentIndex = await dialogPrompt("Tip damage component", `<p>Choose one component of your next native Damage Roll. This arm does not roll damage and remains armed if that roll is canceled.</p><label>Component index <input name="index" type="number" min="0" step="1" value="0"></label>`, form => Number(form.elements.index.value));
    if (!Number.isSafeInteger(componentIndex) || componentIndex < 0) return null;
    const approved = await foundry.applications.api.DialogV2.confirm({ window: { title: "Arm Tip Damage bonus" }, rejectClose: false,
      content: `<p>Arm +${Number(flag(effect, "vanguardUsesEffect")?.standardBenefit?.value) || 0} on component ${componentIndex} of the next native Damage Roll. Only a successful matching roll consumes the benefit.</p>`,
      yes: { label: "Arm for next Damage Roll" }, no: { label: "Cancel", default: true } });
    if (!approved) return null;
    const id = foundry.utils.randomID();
    return confirmPlayUse("Tip damage bonus", extra => benefits.command(actor, "armTipDamage", {
      ...extra, effectId: effect.id, componentIndex, confirmed: true
    }, id));
  }
  const operator = flag(actor, "operatorSkills") ?? {};
  const events = [...(operator.receipts ?? []), ...(operator.operatorEvents ?? [])].filter(event => Number(event.gained ?? event.spGained) > 0);
  if (!events.length) throw new Error("There is no recorded Skill Point gain to match to this benefit.");
  const eventId = await dialogPrompt("Choose a committed Skill Point gain", `<label>Gain <select name="event">${events.map(event => `<option value="${esc(event.id)}">${esc(event.id)} — +${Number(event.gained ?? event.spGained)}</option>`).join("")}</select></label>`, form => form.elements.event.value);
  if (!eventId) return null;
  const count = active.filter(item => flag(item, "vanguardUsesEffect")?.standardBenefit?.kind === "tip6").length;
  const approved = await foundry.applications.api.DialogV2.confirm({ window: { title: "Confirm Tip Skill Point benefit" }, rejectClose: false,
    content: `<p>Confirm this creature gained Skill Points from the selected committed event while ${count} Tip benefit${count === 1 ? " was" : "s were"} active. The recorded gain and active benefit count determine the bonus; no caller-entered amount is accepted.</p>`,
    yes: { label: "Confirm qualifying gain" }, no: { label: "Cancel", default: true } });
  if (!approved) return null;
  const id = foundry.utils.randomID();
  return confirmPlayUse("Tip Skill Point bonus", extra => benefits.command(actor, "tipSkillPointBonus", {
    ...extra, effectId: effect.id, eventId, confirmed: true
  }, id));
}

export function vanguardBenefitPreRoll(config, _dialog, message) {
  const actor = config?.subject?.actor, armed = flag(actor, "vanguardTipBenefits")?.armed;
  if (!actor?.isOwner || !armed || !Array.isArray(config.rolls)) return;
  const receipt = benefits.receipt(actor, armed.useId);
  if (receipt?.command !== "armTipDamage" || receipt.status !== "awaitingNativeRoll" || !receipt.nativePending) return;
  const effect = actor.effects?.get?.(armed.effectId), benefit = flag(effect, "vanguardUsesEffect")?.standardBenefit;
  if (!effect || effect.disabled || benefit?.kind !== "tip1" || benefit.bearerUuid !== armed.bearerUuid) return;
  const candidates = [...new Set(config.rolls)].filter(roll => Array.isArray(roll?.parts));
  const selected = candidates[armed.componentIndex];
  if (!selected) { ui.notifications.warn("Tip of the Spear component is absent; this Damage Roll was unchanged. Review the armed receipt."); return; }
  if (config._ak5eVanguardTipDamage?.useId === armed.useId || selected.options?._ak5eVanguardTipDamage?.useId === armed.useId) return;
  selected.parts.push(String(armed.bonus));
  selected.options ??= {};
  const marker = { actorUuid: actor.uuid, useId: armed.useId, effectId: armed.effectId, kind: "tipBenefitEffect" };
  selected.options._ak5eVanguardTipDamage = marker;
  config._ak5eVanguardTipDamage = marker;
  message.create = true;
  message.data ??= {};
  message.data.flags ??= {};
  message.data.flags.ak5e ??= {};
  message.data.flags.ak5e.vanguardTipDamage = marker;
}
export async function vanguardBenefitPostMessage(message, userId) {
  if (message?.documentName !== "ChatMessage" || message.flags?.dnd5e?.roll?.type !== "damage") return;
  const speaker = message.speaker ?? {};
  const actor = speaker.token && speaker.scene
    ? globalThis.fromUuidSync?.(`Scene.${speaker.scene}.Token.${speaker.token}`)?.actor
      ?? globalThis.fromUuidSync?.(`Actor.${speaker.actor}`)
    : speaker.actor ? globalThis.fromUuidSync?.(`Actor.${speaker.actor}`) : null;
  if (!actor?.isOwner || message.author?.id !== userId || userId !== game.user.id) return;
  const marker = message.flags?.ak5e?.vanguardTipDamage;
  if (!marker || marker.actorUuid !== actor.uuid) return;
  const result = await benefits.completeNativeRoll(actor, { useId: marker.useId, chatMessageUuid: message.uuid });
  return result;
}

export function registerVanguardBenefitHooks() {
  Hooks.on("createChatMessage", (message, _options, userId) => {
    void vanguardBenefitPostMessage(message, userId).catch(error => console.error("AK5e | Vanguard Tip native roll receipt", error));
  });
  Hooks.on("renderActorSheetV2", (app, element) => {
    const actor = app?.document ?? app?.actor;
    if (!actor?.isOwner || !actorBenefits(actor).length || element?.querySelector?.(".ak5e-vanguard-benefits")) return;
    const section = document.createElement("section"); section.className = "ak5e-vanguard-benefits";
    const heading = document.createElement("h3"); heading.textContent = "Vanguard Benefits on this creature"; section.append(heading);
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Resolve Vanguard benefits";
    button.addEventListener("click", () => openVanguardBenefits(actor).catch(error => ui.notifications.error(error.message)));
    section.append(button);
    (element.querySelector('.tab[data-tab="features"], .tab[data-tab="effects"], .sheet-header') ?? element).prepend(section);
  });
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = app?.document ?? app?.actor;
    if (!actor?.isOwner || !actorBenefits(actor).length || controls.some(control => control.action === "ak5eVanguardBenefits")) return;
    controls.unshift({ action: "ak5eVanguardBenefits", icon: "fa-solid fa-hand-sparkles", label: "Vanguard Benefits", ownership: "OWNER",
      onClick: () => openVanguardBenefits(actor).catch(error => ui.notifications.error(error.message)) });
  });
}

export const vanguardBenefitsEngine = benefits;
