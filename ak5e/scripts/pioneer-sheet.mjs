import { vanguardUses } from "./vanguard-uses.mjs";
import { confirmPlayUse, openPlayUndoList } from "./play-uses-sheet.mjs";
import { createPlayUses, warn } from "./play-uses.mjs";
import { need, opaqueKey } from "./operation-kernel.mjs";
import { pioneerAuraRecipients, pioneerLiveEntries, pioneerChosenAuras, isBeneficialAura, settleAuraOverlap } from "./pioneer-features.mjs";
import { vanguardProfile } from "./vanguard-rules.mjs";

/** Owner makes an explicit choice and confirms the resulting use. */
export async function openPioneerAura({ actor }) {
  const enabled = vanguardUses.state(actor).data.pioneerAura?.enabled === true;
  const accepted = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Auramancy" }, rejectClose: false,
    content: `<p>${enabled ? "Disable" : "Enable"} your Aura as an Action?</p>`,
    yes: { label: "Continue" }, no: { label: "Cancel", default: true }
  });
  if (!accepted) return;
  const operationId = foundry.utils.randomID();
  return confirmPlayUse("Auramancy", extra => vanguardUses.command(actor, "pioneerAuramancy", {
    action: "toggle", enabled: !enabled, ...extra, confirmed: true
  }, operationId));
}

/** Choose a threshold's additional Aura; the separate Tip still needs its own use. */
export async function openPioneerThreshold({ actor, grantId }) {
  const { pioneerThresholds } = await import("./pioneer-features.mjs");
  const grant = grantId === "base" && vanguardUses.state(actor).data.pioneerAura?.baseAvailable ? { id: "base" } : pioneerThresholds(actor).grants.find(entry => entry.id === grantId && !vanguardUses.state(actor).data.pioneerAura?.retired?.includes(entry.id));
  if (!grant) throw new Error("This threshold is no longer available.");
  const level = vanguardProfile(actor).level ?? 1;
  const names = ["Clarity", "Liberation", "Protection", "Punishment", "Purity", "Infirmity", "Violence",
    ...(level >= 10 ? ["Pressure", "Shadows", "Vigilance"] : [])];
  const chosen = pioneerChosenAuras(actor);
  const available = names.filter(name => !chosen.includes(name));
  if (!available.length) throw new Error("No additional Aura effect is available.");
  const aura = await foundry.applications.api.DialogV2.prompt({ window: { title: "Choose additional Aura" }, rejectClose: false,
    content: `<p>Choose an effect that is not already active. This does not spend extra SP.</p><label>Aura <select name="aura">${available.map(name => `<option value="${name}">Aura of ${name}</option>`).join("")}</select></label>`,
    ok: { label: "Continue", callback: (_event, target) => target.form.elements.aura.value } });
  if (!aura) return;
  return confirmPlayUse("Choose additional Aura", extra => vanguardUses.command(actor, "pioneerAuraChoice", {
    grantId, aura, ...extra, confirmed: true
  }, foundry.utils.randomID()));
}

/** Inspect live token positions; this view does not apply effects or roll dice. */
export async function openPioneerRecipients({ actor }) {
  const tokens = Array.from(globalThis.canvas?.tokens?.placeables ?? []).filter(token => token.actor && token.isVisible !== false && !token.document?.hidden);
  const sources = tokens.filter(token => token.actor.uuid === actor.uuid);
  if (!sources.length) throw new Error("Place a visible Pioneer token on the current scene.");
  const chosen = await foundry.applications.api.DialogV2.prompt({ window: { title: "Review Aura recipients" }, rejectClose: false,
    content: `<label>Bearer token <select name="source">${sources.map((token, index) => `<option value="${index}">${escapeText(token.name)}</option>`).join("")}</select></label><label>Creature <select name="target">${tokens.map((token, index) => `<option value="${index}">${escapeText(token.name)}</option>`).join("")}</select></label>`,
    ok: { label: "Review", callback: (_event, target) => ({ source: Number(target.form.elements.source.value), target: Number(target.form.elements.target.value) }) } });
  if (!chosen || typeof chosen !== "object") return;
  const { pioneerAuraRecipients } = await import("./pioneer-features.mjs");
  const view = pioneerAuraRecipients(sources[chosen.source]?.document, tokens[chosen.target]?.document);
  const lines = view.effects.map(effect => `<li>${escapeText(effect.name)}: ${escapeText(effect.text)}</li>`).join("");
  await foundry.applications.api.DialogV2.wait({ window: { title: "Aura recipient review" }, rejectClose: false,
    content: `<p>${escapeText(view.relation ?? "")}</p><ul>${lines}</ul>${view.warnings.map(warning => `<p>${escapeText(warning)}</p>`).join("")}<p>Resolve effects and overlap choices at the table.</p>`,
    buttons: [{ action: "close", label: "Close" }] });
}
const escapeText = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

/** Owner identifies a post-duration Skill-damage kill when native provenance is unavailable. */
export async function openPioneerCycleManual({ actor }) {
  const events = (actor.getFlag?.("ak5e", "operatorSkills")?.operatorEvents ?? []).filter(event => event.kind === "end" && event.committed);
  if (!events.length) throw new Error("No ended Operator Skill is recorded.");
  const selected = await foundry.applications.api.DialogV2.wait({ window: { title: "Cycle of Violence: confirm Skill damage" }, rejectClose: false,
    content: `<p>Confirm that the selected Skill's damage reduced the named creature to 0 Hit Points, even though the Skill had already ended.</p><label>Ended Skill <select name="activation">${events.map((event, index) => `<option value="${index}">${escapeText(event.name)}</option>`).join("")}</select></label><label>Creature <input name="targetName" required></label>`,
    buttons: [{ action: "continue", label: "Continue", callback: (_event, button) => {
      const form = button.form;
      if (form.reportValidity && !form.reportValidity()) return false;
      return { event: events[Number(form.elements.activation.value)], targetName: form.elements.targetName.value.trim() };
    } }, { action: "cancel", label: "Cancel", default: true, callback: () => false }] });
  if (!selected?.event || !selected.targetName) return;
  return confirmPlayUse("Cycle of Violence", extra => vanguardUses.command(actor, "pioneerCycleRefund", {
    activationId: selected.event.activationId, targetName: selected.targetName, manualProof: true, ...extra, confirmed: true
  }, foundry.utils.randomID()));
}

/** Source owner sends a reversible offer; the target's owner makes the selection. */
export async function openPioneerOffer({ actor }) {
  const tokens = Array.from(globalThis.canvas?.tokens?.placeables ?? []).filter(token => token.actor && token.isVisible !== false && !token.document?.hidden);
  const sources = tokens.filter(token => token.actor.uuid === actor.uuid);
  if (!sources.length || !tokens.length) throw new Error("Place a visible Pioneer and recipient token on the scene.");
  const selected = await foundry.applications.api.DialogV2.prompt({ window: { title: "Offer Auramancy" }, rejectClose: false,
    content: `<label>Bearer <select name="source">${sources.map((token, index) => `<option value="${index}">${escapeText(token.name)}</option>`).join("")}</select></label><label>Recipient <select name="target">${tokens.map((token, index) => `<option value="${index}">${escapeText(token.name)}</option>`).join("")}</select></label>`,
    ok: { label: "Continue", callback: (_event, target) => ({ source: Number(target.form.elements.source.value), target: Number(target.form.elements.target.value) }) } });
  if (!selected || typeof selected !== "object") return;
  const source = sources[selected.source]?.document, target = tokens[selected.target]?.document;
  if (!source || !target?.actor) return;
  return confirmPlayUse("Offer Auramancy", extra => vanguardUses.command(actor, "pioneerAuraOffer", {
    sourceTokenUuid: source.uuid, targetTokenUuid: target.uuid, targetUuid: target.actor.uuid, ...extra, confirmed: true
  }, foundry.utils.randomID()));
}


/** Each recipient owns their selection and can undo it in the encounter window. */
export const pioneerRecipientUses = createPlayUses({ ns: "pioneerAuraRecipient", label: "Aura recipient", isMember: actor => Boolean(actor) });
const recipientMarks = actor => Array.from(actor?.effects?.values?.() ?? []).flatMap(effect => {
  const mark = effect.flags?.ak5e?.pioneerAuraEffect ?? effect.getFlag?.("ak5e", "pioneerAuraEffect");
  return mark ? [{ effect, mark }] : [];
});
/** Beneficial Auras that reach this creature from more than one Pioneer: the creature chooses which one applies. */
function overlappingAuras(actor) {
  const byAura = new Map();
  for (const item of recipientMarks(actor)) byAura.set(item.mark.aura, [...(byAura.get(item.mark.aura) ?? []), item]);
  return [...byAura].filter(([aura, entries]) => entries.length > 1 && isBeneficialAura(aura));
}
pioneerRecipientUses.register({ targetKinds: {
  /** Records the creature's own choice of source for an overlapping beneficial Aura and re-settles which effect is enabled. */
  pioneerAuraChoice: {
    local: true,
    async apply(_source, useId, entry, target) {
      const record = `flags.ak5e.pioneerAuraChoiceApplied.${opaqueKey(useId)}`;
      if (target.flags?.ak5e?.pioneerAuraChoiceApplied?.[opaqueKey(useId)]) return true;
      const before = target.flags?.ak5e?.pioneerAuraChosen?.[entry.aura] ?? null;
      await target.update({ [`flags.ak5e.pioneerAuraChosen.${entry.aura}`]: entry.sourceUuid, [record]: { before } });
      await settleAuraOverlap(target, entry.aura);
      return true;
    },
    async revert(_source, useId, entry, target) {
      const record = `flags.ak5e.pioneerAuraChoiceApplied.${opaqueKey(useId)}`, applied = target.flags?.ak5e?.pioneerAuraChoiceApplied?.[opaqueKey(useId)];
      if (!applied) return { removed: 0 };
      await target.update({ [`flags.ak5e.pioneerAuraChosen.${entry.aura}`]: applied.before, [record]: null });
      await settleAuraOverlap(target, entry.aura);
      return { removed: 1 };
    },
    preview: (_source, _receipt, entry) => `${entry.name}: goes back to the previous choice for Aura of ${entry.aura}.`
  }
}, plans: {
  pioneerAuraSourceChoice(actor, _state, data) {
    need(isBeneficialAura(data.aura), "Only beneficial Auras are chosen by the creature; the worse negative Aura applies automatically.");
    need(recipientMarks(actor).some(({ mark }) => mark.aura === data.aura && mark.sourceUuid === data.sourceUuid), "That Aura does not currently affect this creature.");
    const origin = globalThis.fromUuidSync?.(data.sourceUuid);
    return { title: `Aura of ${data.aura}: choose which applies`, warnings: [], apply(_next, receipt) {
      receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "pioneerAuraChoice", key: data.aura, aura: data.aura, sourceUuid: data.sourceUuid, ready: true }];
      receipt.summary = `${actor.name} chooses ${origin?.name ?? "that Pioneer"}'s Aura of ${data.aura}; the other overlapping sources are suspended. Undo to go back.`;
      return {};
    } };
  },
  choosePioneerAura(actor, state, data) {
    const offer = actor.getFlag?.("ak5e", "pioneerAuraOffers")?.[data.offerKey] ?? actor.flags?.ak5e?.pioneerAuraOffers?.[data.offerKey];
    need(offer, "This Aura offer is no longer available.");
    const sourceToken = globalThis.fromUuidSync?.(offer.sourceTokenUuid), targetToken = globalThis.fromUuidSync?.(offer.targetTokenUuid);
    need(sourceToken?.actor?.uuid === offer.sourceUuid && targetToken?.actor?.uuid === actor.uuid, "The Aura tokens are no longer available.");
    const sourceChoices = pioneerChosenAuras(sourceToken.actor);
    need(sourceChoices.includes(data.aura), "This Aura effect is no longer selected by its bearer.");
    const view = pioneerAuraRecipients(sourceToken, targetToken), warnings = [];
    for (const [index, text] of view.warnings.entries()) warn(warnings, `eligibility-${index}`, text);
    if (!view.effects.some(effect => effect.name === `Aura of ${data.aura}`))
      warn(warnings, "recipient", "Confirm that this creature is an eligible recipient for the selected effect.");
    if (Object.keys(state.data.selections ?? {}).length) warn(warnings, "overlap", "Resolve overlapping Auras publicly: the recipient chooses beneficial effects and suffers the worse negative effect.");
    return { title: `Choose Aura of ${data.aura}`, warnings, apply(next, receipt) {
      next.data.selections ??= {};
      next.data.selections[data.offerKey] = { aura: data.aura, ...offer };
      receipt.summary = `The recipient selects Aura of ${data.aura}. Recheck this choice if tokens move, the bearer is Incapacitated, the Aura is disabled, or effects end. Resolve overlapping Auras at the table.`;
      const effect = view.effects.find(entry => entry.name === `Aura of ${data.aura}`);
      receipt.manualSteps = [effect?.text ?? "Confirm the selected effect's eligibility and source wording with the table.",
        "Apply this effect only while the creature is eligible; select the beneficial Aura or the worse negative effect when Auras overlap."];
      receipt.result = { aura: data.aura, sourceUuid: offer.sourceUuid };
      return {};
    } };
  }
} });

async function openRecipientAura(actor) {
  const offers = actor.getFlag?.("ak5e", "pioneerAuraOffers") ?? actor.flags?.ak5e?.pioneerAuraOffers ?? {};
  const options = [];
  for (const [key, offer] of Object.entries(offers)) {
    const token = globalThis.fromUuidSync?.(offer.sourceTokenUuid), target = globalThis.fromUuidSync?.(offer.targetTokenUuid);
    if (!token?.actor || target?.actor?.uuid !== actor.uuid || token.actor.uuid !== offer.sourceUuid) continue;
    for (const aura of pioneerChosenAuras(token.actor)) options.push({ type: "offer", key, aura, label: `${token.name}: Aura of ${aura}` });
  }
  for (const [aura, entries] of overlappingAuras(actor)) for (const { mark } of entries) {
    const origin = globalThis.fromUuidSync?.(mark.sourceUuid);
    options.push({ type: "overlap", aura, sourceUuid: mark.sourceUuid, label: `Overlap: Aura of ${aura} from ${origin?.name ?? "a Pioneer"} applies to me` });
  }
  const action = await foundry.applications.api.DialogV2.wait({ window: { title: "Aura recipient" }, rejectClose: false,
    content: options.length ? `<p>Select an Aura offered to this creature. Check current range and overlap before resolving it.</p><label>Aura <select name="aura">${options.map((entry, index) => `<option value="${index}">${escapeText(entry.label)}</option>`).join("")}</select></label>` : "<p>No current Aura effects are offered to this creature.</p>",
    buttons: [...(options.length ? [{ action: "select", label: "Continue", callback: (_event, button) => options[Number(button.form.elements.aura.value)] }] : []),
      { action: "undo", label: "Undo recent Aura choice", callback: () => "undo" }, { action: "cancel", label: "Cancel", default: true, callback: () => false }] });
  if (action === "undo") return openPlayUndoList(pioneerRecipientUses, actor);
  if (!action || typeof action !== "object") return;
  if (action.type === "overlap") return confirmPlayUse("Choose which Aura applies", extra => pioneerRecipientUses.command(actor, "pioneerAuraSourceChoice", {
    aura: action.aura, sourceUuid: action.sourceUuid, ...extra, confirmed: true
  }, foundry.utils.randomID()));
  return confirmPlayUse("Choose Aura", extra => pioneerRecipientUses.command(actor, "choosePioneerAura", {
    offerKey: action.key, aura: action.aura, ...extra, confirmed: true
  }, foundry.utils.randomID()));
}

const recipientHooks = new WeakSet();
export function registerPioneerRecipientHooks() {
  if (!globalThis.Hooks || recipientHooks.has(Hooks)) return;
  recipientHooks.add(Hooks);
  Hooks.on("renderActorSheetV2", (app, element) => {
    const actor = app?.document ?? app?.actor;
    const offers = actor?.getFlag?.("ak5e", "pioneerAuraOffers") ?? actor?.flags?.ak5e?.pioneerAuraOffers;
    if (!actor?.isOwner || !(Object.keys(offers ?? {}).length || overlappingAuras(actor).length) || element?.querySelector?.(".ak5e-pioneer-aura-recipient")) return;
    const section = document.createElement("section"), button = document.createElement("button");
    section.className = "ak5e-pioneer-aura-recipient"; button.type = "button"; button.textContent = "Review Pioneer Aura";
    button.addEventListener("click", () => openRecipientAura(actor).catch(error => ui.notifications.error(error.message)));
    section.append(button);
    (element.querySelector('.tab[data-tab="features"], .tab[data-tab="effects"], .sheet-header') ?? element).prepend(section);
  });
}

/* ------------------------------------------------------------ managed Aura effects */
const visibleTokens = () => Array.from(globalThis.canvas?.tokens?.placeables ?? []).filter(token => token.actor && token.isVisible !== false && !token.document?.hidden);

/** Apply one chosen Aura to creature tokens. The use warns about range, allegiance and overlap and never blocks. */
export async function openPioneerApply({ actor }) {
  const auras = pioneerChosenAuras(actor);
  if (!auras.length) throw new Error("Choose an Aura through Auramancy first.");
  const tokens = visibleTokens(), sources = tokens.filter(token => token.actor.uuid === actor.uuid);
  if (!sources.length) throw new Error("Place a visible Pioneer token on the current scene.");
  const chosen = await foundry.applications.api.DialogV2.prompt({ window: { title: "Apply Aura effects" }, rejectClose: false,
    content: `<label>Bearer token <select name="source">${sources.map((token, index) => `<option value="${index}">${escapeText(token.name)}</option>`).join("")}</select></label>
<label>Aura <select name="aura">${auras.map(name => `<option value="${escapeText(name)}">Aura of ${escapeText(name)}</option>`).join("")}</select></label>
<fieldset><legend>Creatures</legend>${tokens.map((token, index) => `<label><input type="checkbox" name="target" value="${index}"> ${escapeText(token.name)}</label>`).join("")}</fieldset>
<p>Static modifiers become managed effects you can release or undo. Nothing is rolled.</p>`,
    ok: { label: "Continue", callback: (_event, button) => ({ source: Number(button.form.elements.source.value), aura: button.form.elements.aura.value,
      targets: Array.from(button.form.querySelectorAll('input[name="target"]:checked'), input => Number(input.value)) }) } });
  if (!chosen || typeof chosen !== "object" || !chosen.targets?.length) return;
  const source = sources[chosen.source]?.document;
  if (!source) return;
  return confirmPlayUse("Apply Aura effects", extra => vanguardUses.command(actor, "pioneerAuraApply", {
    sourceTokenUuid: source.uuid, recipients: chosen.targets.flatMap(index => tokens[index]?.document ? [{ tokenUuid: tokens[index].document.uuid, auras: [chosen.aura] }] : []),
    ...extra, confirmed: true
  }, foundry.utils.randomID()));
}

/** Review each active managed effect with its current range, then release the ones the owner picks (undoable). */
export async function openPioneerLive({ actor }) {
  const live = pioneerLiveEntries(vanguardUses.state(actor).data);
  if (!live.length) { await foundry.applications.api.DialogV2.wait({ window: { title: "Active Aura effects" }, rejectClose: false,
    content: "<p>No managed Aura effects are active.</p>", buttons: [{ action: "close", label: "Close" }] }); return; }
  const rows = live.map(([id, entry]) => {
    const from = globalThis.fromUuidSync?.(entry.sourceTokenUuid), to = globalThis.fromUuidSync?.(entry.targetTokenUuid);
    const view = from?.actor && to?.actor ? pioneerAuraRecipients(from, to, { lenient: true }) : null;
    const status = view?.inRange === true ? "in range" : view?.inRange === false ? "OUT of range" : "range unknown";
    return { id, label: `${entry.targetName}: Aura of ${entry.aura} (${status})${view?.disabled ? `; ${view.disabled}` : ""}` };
  });
  const keys = await foundry.applications.api.DialogV2.wait({ window: { title: "Active Aura effects" }, rejectClose: false,
    content: `<p>Pick the effects to end. Ending an effect is undoable from the Vanguard undo list.</p><fieldset>${rows.map(row => `<label><input type="checkbox" name="release" value="${escapeText(row.id)}"> ${escapeText(row.label)}</label>`).join("")}</fieldset>`,
    buttons: [{ action: "release", label: "End selected", callback: (_event, button) => Array.from(button.form.querySelectorAll('input[name="release"]:checked'), input => input.value) },
      { action: "cancel", label: "Close", default: true, callback: () => false }] });
  if (!Array.isArray(keys) || !keys.length) return;
  return confirmPlayUse("End Aura effects", extra => vanguardUses.command(actor, "pioneerAuraRelease", { keys, reason: "manual", ...extra, confirmed: true }, foundry.utils.randomID()));
}

/** Punishment or Pressure damage. The owner confirms the use, then clicks Roll on the card; nothing is rolled here. */
export async function openPioneerDamage({ actor }) {
  const auras = pioneerChosenAuras(actor).filter(name => ["Punishment", "Pressure"].includes(name));
  if (!auras.length) throw new Error("Choose Aura of Punishment or Aura of Pressure first.");
  const tokens = visibleTokens();
  if (!tokens.length) throw new Error("Place a visible creature token on the current scene.");
  const chosen = await foundry.applications.api.DialogV2.prompt({ window: { title: "Aura damage" }, rejectClose: false,
    content: `<label>Aura <select name="aura">${auras.map(name => `<option value="${name}">Aura of ${name}</option>`).join("")}</select></label>
<label>Creature <select name="target">${tokens.map((token, index) => `<option value="${index}">${escapeText(token.name)}</option>`).join("")}</select></label>
<p>Punishment: when the creature is hit by an Attack. Pressure: when it starts a Turn in the Aura.</p>`,
    ok: { label: "Continue", callback: (_event, button) => ({ aura: button.form.elements.aura.value, target: Number(button.form.elements.target.value) }) } });
  const token = chosen && typeof chosen === "object" ? tokens[chosen.target] : null;
  if (!token) return;
  return confirmPlayUse(`Aura of ${chosen.aura}`, extra => vanguardUses.command(actor, "pioneerAuraDamage", {
    aura: chosen.aura, targetUuid: token.actor.uuid, targetName: token.name, ...extra, confirmed: true
  }, foundry.utils.randomID()));
}

/** One granted Tip of the Spear (Auramancy threshold or Tactical Burst). The shared Tip flow confirms and rolls. */
export async function openPioneerTip({ actor, grantKind, sourceEventId, grantIndex }) {
  const { chooseTipTarget, useGrantedTip } = await import("./vanguard-sheet.mjs");
  const target = await chooseTipTarget(actor, "Pioneer: Tip of the Spear");
  if (!target) return null;
  return useGrantedTip(actor, target, `pioneer-tip-${opaqueKey(`${grantKind}:${sourceEventId}:${grantIndex}`)}`, { grantKind, sourceEventId, grantIndex });
}

/** Long Rest: end the Aura's choices and effects; asks the per-use reading for the 20-SP count when there is no GM ruling. */
export function runPioneerRest(actor, operationId) {
  return confirmPlayUse("Auramancy: Long Rest", extra => vanguardUses.command(actor, "pioneerAuraRest", { ...extra, confirmed: true }, operationId), { confirmed: true });
}
