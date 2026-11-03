/**
 * Witchcraft sheet section and command router (Ch. 3 C3:5090-5146).
 *
 * Opening the section or any dialog never writes: every mutating command is sent through
 * `medicUses` after its own explicit confirmation. Actor-controlled text is escaped; controls carry
 * `data-medic-cmd` so the Medic panel can forward them without binding branch internals.
 */
import { flag, medicBranch, medicLevel } from "./medic-rules.mjs";
import { standardPools } from "./caster-rules.mjs";
import { medicUses } from "./medic-uses.mjs";
import { getWitchcraftView } from "./witchcraft-features.mjs";
import { confirmPlayUse, openPlayUndoList } from "./play-uses-sheet.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const operationId = () => globalThis.foundry?.utils?.randomID?.() ?? `witchcraft-${Date.now().toString(36)}`;
const notifyError = error => {
  console.error("AK5e | Witchcraft UI", error);
  globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
};
const dialog = (title, content, buttons, width = 560) => {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) throw new Error("The Foundry dialog API is unavailable.");
  return DialogV2.wait({ window: { title }, position: { width }, rejectClose: false, content, buttons });
};
const button = (action, label, value, primary = false) => ({ action, label, default: primary, callback: (event, el) => typeof value === "function" ? value(event, el) : value });
const field = (label, inner) => `<label class="ak5e-witchcraft-field"><span>${esc(label)}</span>${inner}</label>`;
const numberInput = (name, value = 0, min = 0) => `<input type="number" name="${esc(name)}" value="${esc(value)}" min="${esc(min)}" step="1">`;
const textInput = (name, value = "") => `<input type="text" name="${esc(name)}" value="${esc(value)}">`;
const checkbox = (name, checked = false) => `<input type="checkbox" name="${esc(name)}"${checked ? " checked" : ""}>`;

function poolOptions(selected = "") {
  // U3 #4: Halfway House chooses one of the Caster's Standard Arts Pools. Special Arts Pools are
  // deliberately not offered (the previous Healing Arts special-pool option violated that ruling).
  return standardPools.map(pool => `<option value="${esc(pool.id)}"${pool.id === selected ? " selected" : ""}>${esc(pool.name)}</option>`).join("");
}

/** Escaped, read-only branch section. Controls are inert until the parent forwards their command. */
export function renderWitchcraftSection(actor) {
  if (!actor || medicBranch(actor) !== "witchcraft") return "";
  let view;
  try { view = getWitchcraftView(actor); }
  catch (error) {
    console.error("AK5e | Witchcraft view", error);
    view = { level: medicLevel(actor) ?? 1, features: {}, reduction: 0, range: 5, curse: null, harm: null };
  }
  const level = view.level ?? medicLevel(actor) ?? 1;
  const feature = (key, label, hint, required) => `<button type="button" class="ak5e-witchcraft-control" data-medic-cmd="witchcraft.${esc(key)}" ${level >= required ? "" : `title="Requires Witchcraft level ${required}"`}>${esc(label)}${level >= required ? "" : ` (Lv ${required})`}</button><small>${esc(hint)}</small>`;
  const curse = view.curse?.targetUuid ? `<p class="ak5e-witchcraft-active"><strong>Active Witchcurse:</strong> ${esc(view.curse.targetUuid)} (placed by ${esc(view.curse.useId)})</p>` : "";
  const ls = view.lifeSupport ? `<p><strong>Life Support:</strong> ${esc(view.lifeSupport.value)} / ${esc(view.lifeSupport.max)}${view.lifeSupport.over > 0 ? ` (+${esc(view.lifeSupport.over)} over maximum)` : ""}</p>` : "";
  return `<section class="ak5e-witchcraft" data-actor-uuid="${esc(actor.uuid)}">
    <header><h4>Witchcraft — ${esc(actor.name)}</h4><p class="ak5e-witchcraft-meta">Medic level ${esc(level)} · Halfway House reduction ${esc(view.reduction ?? 0)} · Life Support range ${esc(view.range ?? 5)} ft</p></header>
    ${ls}${curse}
    <div class="ak5e-witchcraft-features">
      ${feature("halfwayHouse", "Halfway House", "Choose a Standard Arts Pool; its Arts are always prepared.", 1)}
      ${feature("healingThroughHarm", "Healing through Harm", "Reaction: add floor(rolled Art damage / 2) Life Support; once per Short Rest.", 1)}
      ${feature("witchcraftLifeSupport", "Witchdoctor Life Support", "Restore Hit Points with Life Support at 60 feet; actual restored HP is recorded.", 4)}
      ${feature("witchcurse", "Witchcurse", "Bonus Action + 10 Life Support; place the curse or record its explicit 2d6 trigger.", 7)}
      ${feature("lifeThroughDeath", "Life through Death", "Maximum Art or Operator Skill damage, divided among visible Creatures within 60 feet; once per Long Rest.", 15)}
    </div>
    <footer><button type="button" data-medic-cmd="witchcraft.undo">Undo a recent Witchcraft use</button></footer>
  </section>`;
}

async function commandHalfwayHouse(actor) {
  const chosen = await dialog("Halfway House", `<p>Choose one Standard Arts Pool. This writes nothing until you confirm.</p>${field("Arts Pool", `<select name="pool">${poolOptions()}</select>`)}`,
    [button("choose", "Review", (_event, el) => el.form.elements.pool?.value ?? ""), button("cancel", "Cancel", false, true)]);
  if (!chosen) return false;
  return confirmPlayUse("Halfway House", extra => medicUses.command(actor, "halfwayHouse", { ...extra, pool: chosen }, operationId()),
    { preview: extra => medicUses.preview(actor, "halfwayHouse", { ...extra, pool: chosen }) });
}

export async function commandHealingThroughHarm(actor, prefill = {}) {
  const nativeTotal = Number(prefill?.damageTotal);
  const nativeSource = prefill?.sourceRollId ? String(prefill.sourceRollId) : null;
  const native = Boolean(nativeSource) && Number.isFinite(nativeTotal);
  let value = native ? nativeTotal : null;
  if (!native) {
    const entered = await dialog("Healing through Harm", `<p>Enter the total you rolled for the Art's Damage, including flat modifiers and before the target's mitigation. The module never rolls it.</p>
      <p><strong>Manual fallback:</strong> the preferred path is the offer on your own Art damage roll, which links the roll and verifies its origin.</p>${field("Rolled Art damage total", numberInput("damageTotal", Number.isFinite(Number(prefill?.damageTotal)) ? prefill.damageTotal : 0, 0))}`,
      [button("choose", "Review", (_event, el) => Number(el.form.elements.damageTotal?.value ?? 0)), button("cancel", "Cancel", false, true)]);
    if (!Number.isFinite(entered)) return false;
    value = entered;
  }
  const payload = { damageTotal: value, ...(nativeSource ? { sourceRollId: nativeSource, sameRollAs: nativeSource, native: true } : {}) };
  return confirmPlayUse("Healing through Harm", extra => medicUses.command(actor, "healingThroughHarm", { ...extra, ...payload }, operationId()),
    { preview: extra => medicUses.preview(actor, "healingThroughHarm", { ...extra, ...payload }) });
}

export async function commandWitchcraftLifeSupport(actor) {
  const selected = Array.from(globalThis.game?.user?.targets ?? [])[0]?.actor ?? null;
  const data = await dialog("Witchdoctor Life Support", `<p>Spend Life Support to restore Hit Points. Actual restored HP is recorded after the shared healing rules (including Construct blocking and the target's maximum) are applied.</p>
    ${field("Life Support to spend", numberInput("amount", 1, 0))}
    ${field("Target Actor UUID (optional)", textInput("targetUuid", selected?.uuid ?? ""))}
    ${field("Distance (feet; used only when scene tokens are unavailable)", numberInput("rangeFt", 5, 0))}
    ${field("Witch's Boon rider (requires an actual target and at least 5 actual HP restored)", checkbox("boon", false))}
    <p><em>Efficient Life Support is granted by the cast itself (its receipt records the AP spent); there is no manual entry here.</em></p>`,
    [button("choose", "Review", (_event, el) => ({
      amount: Number(el.form.elements.amount?.value ?? 0),
      targetUuid: el.form.elements.targetUuid?.value?.trim() || undefined,
      rangeFt: Number(el.form.elements.rangeFt?.value ?? 0),
      boon: el.form.elements.boon?.checked === true
    })), button("cancel", "Cancel", false, true)]);
  if (!data) return false;
  return confirmPlayUse("Witchdoctor Life Support", extra => medicUses.command(actor, "witchcraftLifeSupport", { ...extra, ...data }, operationId()),
    { preview: extra => medicUses.preview(actor, "witchcraftLifeSupport", { ...extra, ...data }) });
}

export async function commandWitchcurse(actor, prefill = {}) {
  const triggerMode = Boolean(prefill?.triggerEventId);
  const sourceKind = String(prefill?.sourceKind ?? "other");
  const data = await dialog("Witchcurse", `<p>Witchcurse is placed as a Bonus Action for 10 Life Support. Its trigger is the first Arts Damage each Turn; the 2d6 is clicked by the Medic, never rolled automatically.</p>
    <p><strong>Native offers</strong> link the real damage event. The form below is the manual fallback and cannot correlate a blank event ID.</p>
    ${field("Mode", `<select name="mode"><option value="place"${triggerMode ? "" : " selected"}>Place / replace the curse</option><option value="trigger"${triggerMode ? " selected" : ""}>Record a 2d6 trigger</option></select>`)}
    ${field("Curse target UUID (placement)", textInput("targetUuid", triggerMode ? "" : prefill?.curseTargetUuid ?? ""))}
    ${field("Healing target UUID (trigger)", textInput("healingTargetUuid", triggerMode ? prefill?.targetUuid ?? "" : ""))}
    ${field("Distance (feet; used only when scene tokens are unavailable)", numberInput("rangeFt", Number.isFinite(Number(prefill?.rangeFt)) ? prefill.rangeFt : 5, 0))}
    ${field("Trigger event ID (trigger; leave blank only for the warning fallback)", textInput("triggerEventId", prefill?.triggerEventId ?? ""))}
    ${field("2d6 total (trigger; leave 0 for an explicit card roll)", numberInput("damageTotal", Number.isFinite(Number(prefill?.damageTotal)) ? prefill.damageTotal : 0, 0))}
    ${field("Source kind (trigger)", `<select name="sourceKind"><option value="art-cast"${sourceKind === "art-cast" ? " selected" : ""}>Art cast</option><option value="operator-skill"${sourceKind === "operator-skill" ? " selected" : ""}>Operator Skill</option><option value="other"${!["art-cast", "operator-skill"].includes(sourceKind) ? " selected" : ""}>Other Arts damage</option></select>`)}`,
    [button("choose", "Review", (_event, el) => {
      const trigger = el.form.elements.mode?.value === "trigger";
      const total = Number(el.form.elements.damageTotal?.value ?? 0);
      return {
        mode: trigger ? "trigger" : "place",
        triggerEventId: trigger ? (el.form.elements.triggerEventId?.value?.trim() || undefined) : undefined,
        targetUuid: (trigger ? el.form.elements.healingTargetUuid?.value : el.form.elements.targetUuid?.value)?.trim() || undefined,
        rangeFt: Number(el.form.elements.rangeFt?.value ?? 0),
        sourceKind: el.form.elements.sourceKind?.value ?? "other",
        ...(trigger && total > 0 ? { damageTotal: total } : {})
      };
    }), button("cancel", "Cancel", false, true)]);
  if (!data) return false;
  return finalizeWitchcurse(actor, data, prefill);
}

async function finalizeWitchcurse(actor, data, prefill) {
  const wantsTrigger = data.mode === "trigger";
  const payload = { ...data };
  if (wantsTrigger) {
    if (!payload.triggerEventId) {
      const fallback = await dialog("Witchcurse: manual trigger fallback", `<p>No native trigger event is linked. This fallback cannot deduplicate against the real damage event and should only be used when the offer card is unavailable.</p><p>Record it anyway?</p>`,
        [button("choose", "Use the warning fallback", () => true), button("cancel", "Cancel", false, true)]);
      if (!fallback) return false;
      payload.triggerEventId = `manual:${operationId()}`;
      payload.manualFallback = true;
    }
    payload.sourceKind = data.sourceKind ?? "other";
  } else {
    delete payload.triggerEventId;
    delete payload.sourceKind;
    delete payload.damageTotal;
  }
  delete payload.mode;
  if (prefill?.native === true) payload.native = true;
  return confirmPlayUse("Witchcurse", extra => medicUses.command(actor, "witchcurse", { ...extra, ...payload }, operationId()),
    { preview: extra => medicUses.preview(actor, "witchcurse", { ...extra, ...payload }) });
}

export async function commandLifeThroughDeath(actor, prefill = {}) {
  const selectedTargets = Array.from(globalThis.game?.user?.targets ?? []).map(token => token.actor?.uuid).filter(Boolean);
  const sourceType = String(prefill?.sourceType ?? "art");
  const data = await dialog("Life through Death", `<p>Use the source-authorized maximum damage total (including modifiers, before mitigation), then divide it among visible Creatures within 60 feet. A remainder may stay unspent.</p>
    <p><strong>Native offers</strong> link the real Art or Operator Skill roll. The source fields below are the manual fallback and are verified when the roll is still known on this client.</p>
    ${field("Source roll / cast ID", textInput("sourceRollId", prefill?.sourceRollId ?? ""))}
    ${field("Origin", `<select name="sourceType"><option value="art"${sourceType === "art" ? " selected" : ""}>Art</option><option value="operatorSkill"${sourceType === "operatorSkill" ? " selected" : ""}>Operator Skill</option></select>`)}
    ${field("Maximum damage total", numberInput("damageTotal", 0, 0))}
    ${field("Visible target UUIDs (comma separated; selected targets prefilled)", textInput("targetUuids", selectedTargets.join(", ")))}
    ${field("Allocations (one per line: UUID=amount)", `<textarea name="allocations" rows="4" placeholder="Actor.foeA=12&#10;Actor.foeB=8"></textarea>`)}`,
    [button("choose", "Review", (_event, el) => {
      const targetUuids = String(el.form.elements.targetUuids?.value ?? "").split(",").map(value => value.trim()).filter(Boolean);
      const allocations = {};
      for (const line of String(el.form.elements.allocations?.value ?? "").split(/\r?\n/)) {
        const [uuid, amount] = line.split("=");
        if (uuid?.trim() && Number.isFinite(Number(amount))) allocations[uuid.trim()] = Number(amount);
      }
      const sourceRollId = el.form.elements.sourceRollId?.value?.trim() || undefined;
      return {
        sourceRollId,
        sourceType: el.form.elements.sourceType?.value ?? "art",
        damageTotal: Number(el.form.elements.damageTotal?.value ?? 0),
        targetUuids,
        allocations,
        ...(sourceRollId ? { sameRollAs: sourceRollId } : {})
      };
    }), button("cancel", "Cancel", false, true)]);
  if (!data) return false;
  if (!data.sourceRollId) {
    globalThis.ui?.notifications?.warn?.("Life through Death needs the linked source roll or cast ID. Open the offer on the Art or Operator Skill damage roll instead of entering the allocation without a source.");
    return false;
  }
  const payload = { ...data };
  if (prefill?.native === true) payload.native = true;
  return confirmPlayUse("Life through Death", extra => medicUses.command(actor, "lifeThroughDeath", { ...extra, ...payload }, operationId()),
    { preview: extra => medicUses.preview(actor, "lifeThroughDeath", { ...extra, ...payload }) });
}

/**
 * Route a Witchcraft control. Returns false only for a command this branch does not own, so the
 * parent panel can continue its own dispatch chain. Opening a dialog or cancelling writes nothing.
 */
export async function handleWitchcraftCommand(actor, command, context = {}) {
  const name = String(command ?? "").replace(/^witchcraft\./, "");
  const known = ["halfwayHouse", "healingThroughHarm", "witchcraftLifeSupport", "witchcurse", "lifeThroughDeath", "undo"];
  if (!known.includes(name)) return false;
  if (!actor || actor.documentName !== "Actor" || !actor.isOwner) {
    globalThis.ui?.notifications?.warn?.("Choose a Witchcraft Medic you own.");
    return true;
  }
  if (medicBranch(actor) !== "witchcraft") {
    globalThis.ui?.notifications?.warn?.("These controls belong to the Witchcraft subclass; this Medic's branch is " + (medicBranch(actor) ?? "unset") + ".");
    return true;
  }
  try {
    switch (name) {
      case "halfwayHouse": await commandHalfwayHouse(actor); break;
      case "healingThroughHarm": await commandHealingThroughHarm(actor); break;
      case "witchcraftLifeSupport": await commandWitchcraftLifeSupport(actor); break;
      case "witchcurse": await commandWitchcurse(actor); break;
      case "lifeThroughDeath": await commandLifeThroughDeath(actor); break;
      case "undo": await openPlayUndoList(medicUses, actor); break;
      default: return false;
    }
    // A recognized command is ours even when its dialog was cancelled; only an unrelated
    // command returns false so the parent panel can continue its dispatch chain.
    return true;
  } catch (error) {
    notifyError(error);
    return true;
  }
}

/** Read-only summary for a parent panel; never writes. */
export function witchcraftSummary(actor) {
  const view = getWitchcraftView(actor);
  return {
    branch: "witchcraft",
    level: view.level,
    curse: view.curse?.targetUuid ?? null,
    lifeSupport: view.lifeSupport,
    features: view.features
  };
}

export default { renderWitchcraftSection, handleWitchcraftCommand, witchcraftSummary };
