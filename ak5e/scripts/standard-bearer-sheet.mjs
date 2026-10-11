import { BATTLECRIES, FERVOUR_TRIGGERS, STANDARD_ENTRIES, TIP_INSTRUCTIONS, distanceFeet, hasStandardBranch, standardFeatureActions, flag, standardState, tokenPoint } from "./standard-bearer-rules.mjs";
import { getStandardView, previewStandardUpdate, standardDamagePreview, submitStandardCommand } from "./standard-bearer.mjs";
import { previewSkillArea } from "./operator-targeting.mjs";
import { esc } from "./operation-kernel.mjs";
import { createOperationPanel, node, choices } from "./operation-panel.mjs";

const entries = collection => Array.from(collection?.values?.() ?? collection ?? []);
const text = key => {
  const keyName = `AK5E.StandardBearer.${key}`, localized = game.i18n?.localize?.(keyName);
  if (localized && localized !== keyName) return localized;
  return ({
  Title: "Standard Bearer", Fervour: "Fervour", DC: "Standard Bearer DC", Source: "Source token",
  ChooseSource: "Choose source token", Confirm: "I confirm this action and its source requirements",
  Setup: "Preview standard setup", Refresh: "Refresh", Wield: "Wield", Stow: "Stow", Plant: "Plant (Bonus Action)",
  Pickup: "Pick up (Bonus Action)", Gain: "Gain Fervour", Clear: "Clear Fervour", Tip: "Tip of the Spear",
  Handoff: "Hand the Standard to a willing creature within 5 feet",
  Cry: "Use Battlecry", Chorus: "Join Chorus", Extend: "Extend Battlecry", King: "King of the Hill",
  Herald: "Voice of the Herald", Projection: "Power Projection", Duty: "Duty Not Yet Done", Expertise: "Skill Expertise",
  Stand: "Declare Final Stand", EndStand: "End Final Stand", ExtraTurn: "Grant extra Turn", Redirect: "Redirect Skill Points",
  SP: "Additional Tip: confirm a qualifying Skill Point gain", AcceptGain: "Keep pending Skill Points", Benefit: "Consume a Standard Bearer benefit", DamagePreview: "Preview Damage Reduction",
  FRight: "Fervour trigger", Target: "Targets", Facts: "Confirm only facts you have established", Choice: "Tip outcome (Directed Engagement)",
  Point: "Projection point", Outcome: "Hostile save outcomes", Preview: "Place 15-foot impact circle (60-foot range)",
  Cancel: "Cancel", Submit: "Confirm and submit", Mode: "Standard status", Instructions: "Source instructions",
  NoBranch: "This Actor does not have the Standard Bearer branch.", NoToken: "Place this Actor's token on the active scene first.",
  Wielding: "Carried / wielded", Planted: "Planted", LastStand: "Final Stand active", Action: "Source confirmation",
  Allied: "Allied", Hostile: "Hostile", Visible: "Can see the standard / bearer", Hears: "Can hear the bearer", Willing: "Willing",
  Grounded: "Chosen point is grounded", NotKilled: "Not killed outright", Qualifying: "Qualifying event occurred",
  Reaction: "Reaction available and spent", ActionSpent: "Action available and spent", CrySelect: "Battlecry",
  TriggerSelect: "Fervour trigger", Walk: "Replace Walking Speed", All: "+10 feet to all Speeds", Amount: "Amount",
  TargetChooser: "Select visible targets", PreviewDamage: "Preview damage", Manual: "Manual procedure"
}[key] ?? key);
};
// Lazy submit: this module and standard-bearer.mjs import each other.
const { safe, button, run: submitWithRetry, pendingRetry: retainedRetry, retryPending, openOnce } =
  createOperationPanel({ label: "Standard Bearer", submit: (...args) => submitStandardCommand(...args) });
const itemList = actor => entries(actor?.items);
const branchItems = actor => itemList(actor).filter(item => STANDARD_ENTRIES.some(entry => flag(item, "chapterThreeId") === entry.id));
const actorFor = app => app?.document?.documentName === "Actor" ? app.document : app?.actor?.documentName === "Actor" ? app.actor : null;
const checks = (name, targets, max = Infinity) => `<fieldset><legend>${esc(text("TargetChooser"))}</legend>${targets.map(t => `<label><input type="checkbox" name="${esc(name)}" value="${esc(t.uuid)}">${esc(t.name)}${t.eligible === false ? " (not eligible)" : ""}</label>`).join("") || "<p>No visible target tokens in this scene.</p>"}</fieldset>`;
const factsOptions = ["allied", "hostile", "visible", "hears", "willing", "grounded", "eligibility", "damageReviewed", "notKilledOutright", "qualifying", "reaction", "action"];
const factLabel = { allied: "Allied", hostile: "Hostile", visible: "Visible", hears: "Hears", willing: "Willing", grounded: "Grounded", eligibility: "Map placement respects elevation, walls, and source sight", damageReviewed: "Review final Damage after defenses", notKilledOutright: "NotKilled", qualifying: "Qualifying", reaction: "Reaction", action: "ActionSpent" };

async function chooseSource(actor, explicit, view) {
  if (explicit) return explicit;
  const tokens = (view?.sourceTokens ?? []).filter(token => !token.hidden);
  if (tokens.length === 1) return tokens[0].uuid;
  if (!tokens.length) throw new Error(text("NoToken"));
  return foundry.applications.api.DialogV2.wait({ window: { title: text("ChooseSource") }, rejectClose: false,
    content: `<label>${esc(text("Source"))}${choices("source", tokens.map(t => [t.uuid, t.name]))}</label>`,
    buttons: [{ action: "choose", label: text("Submit"), callback: (_event, button) => button.form.elements.source.value }] });
}

async function confirmedDialog(actor, action, view, sourceTokenUuid, { limited = false, pickerTokenUuid = null } = {}) {
  const cryPairs = Object.entries(BATTLECRIES).map(([id, cry]) => [id, `${cry.name} (${cry.cost} Fervour)`]);
  const triggerPairs = FERVOUR_TRIGGERS.map(trigger => [trigger, trigger.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`)]);
  const targetList = (view.targets ?? []).filter(target => !target.hidden);
  const selected = (name, max = Infinity) => checks(name, targetList, max);
  const factSection = `<fieldset><legend>${esc(text("Facts"))}</legend>${factsOptions.map(f => `<label><input type="checkbox" name="fact-${f}">${esc(action === "herald" && f === "hears" ? "Can see or hear the bearer" : text(factLabel[f]))}</label>`).join("")}</fieldset>`;
  const records = Object.entries(view.state?.cries ?? {});
  const gains = Object.entries(view.pendingGains ?? {});
  const gainOptions = gains.map(([eventId, gain]) => [eventId, `${gain.amount} SP · ${gain.source ?? "source not recorded"} · ${gain.reason ?? eventId}`]);
  const cryReceiptOptions = records.map(([id, record]) => [id, `${BATTLECRIES[record.cry]?.name ?? record.cry} (${id})`]);
  const cryIdSelect = `<label>${esc(text("CrySelect"))}${choices("cryId", action === "extend" ? cryReceiptOptions.filter(([id]) => ["defiant", "heroic"].includes(view.state.cries[id]?.cry)) : cryReceiptOptions)}</label>`;
  const tokenUuid = target => target.uuid;
  const tipEligible = targets => targets.filter(target => target.eligible !== false);
  const outcomeField = (target, values) => `<label>${esc(target.name)}${choices(`outcome-${esc(target.uuid)}`, values)}</label>`;
  let content = `<p>${esc(view.sourceText ?? text("Action"))}</p>`;
  if (["pickup", "handoff"].includes(action) && limited && pickerTokenUuid && action === "pickup") content += `<p>Picker: ${esc(view.targets?.find(t => t.uuid === pickerTokenUuid)?.name ?? "your selected creature")}</p>`;
  if (action === "pickup") content += (limited ? "" : selected("targetTokenUuids", 1));
  if (action === "handoff") content += selected("targetTokenUuids", 1);
  if (action === "fervour") content += `<label>${esc(text("FRight"))}${choices("trigger", triggerPairs)}</label>${selected("targetTokenUuids", 1)}`;
  if (action === "tip") content += selected("targetTokenUuids", 1) + `<label>Trigger${choices("trigger", [["general", "General Tip of the Spear opportunity"], ["planted", "Creature entered or began its Turn in the planted aura"]])}</label><label>${esc(text("Choice"))}${choices("tipChoice", [["", "Roll 1d6"], ...[1,2,3,4,5,6].map(n => [String(n), `${n}: ${TIP_INSTRUCTIONS[n-1]}`])])}</label>`;
  if (action === "directed") content += "<p>Enable Directed Engagement, then use Tip of the Spear with a selected outcome.</p>";
  if (action === "cry") {
    content += `<label>${esc(text("CrySelect"))}${choices("cry", cryPairs)}</label>`;
    content += selected("targetTokenUuids");
    content += `<p>Chorus responders (optional; select only creatures that confirm spending their Reaction):</p>${selected("chorusTokenUuids")}`;
    content += `<button type="button" data-preview-havoc>Preview Cry Havoc cone</button><output data-havoc-direction></output>`;
    content += `<fieldset><legend>${esc(text("Outcome"))}</legend>${targetList.map(t => outcomeField(t, [["manual", "Resolve save/damage manually"], ["failure", "Failed save"], ["success", "Successful save"]])).join("")}</fieldset>`;
    content += `<fieldset><legend>Optional manually reviewed final Psychic Damage</legend>${targetList.map(t => `<label>${esc(t.name)}<input type="number" name="damage-${esc(t.uuid)}" min="0" step="1" placeholder="Use native calculation"></label>`).join("")}</fieldset><p>Enter a final amount only after reviewing AK5e Damage Reduction and defenses. A blank amount uses Foundry's native defenses; confirm no additional reduction applies.</p>`;
    content += `<fieldset><legend>Rallying Cry Hit Dice, if selected</legend>${targetList.map(t => `<label>${esc(t.name)}${choices(`hitdie-${esc(t.actorUuid ?? t.uuid)}`, [["", "Choose available Hit Die"], ...(t.hitDice ?? []).filter(hd => hd.available > 0 && hd.denomination).map(hd => [hd.denomination, `${hd.denomination} (${hd.available} available)`])])}</label>`).join("")}</fieldset>`;
  }
  if (action === "chorus") {
    content += cryIdSelect + selected("targetTokenUuids", 1);
    const rallyingReceipts = records.filter(([, record]) => record.cry === "rallying");
    if (rallyingReceipts.length) content += `<fieldset><legend>Rallying Cry Chorus Hit Dice</legend>${targetList.map(t => `<label>${esc(t.name)}${choices(`hitdie-${esc(t.actorUuid ?? t.uuid)}`, [["", "Choose available Hit Die"], ...(t.hitDice ?? []).filter(hd => hd.available > 0 && hd.denomination).map(hd => [hd.denomination, `${hd.denomination} (${hd.available} available)`])])}</label>`).join("")}</fieldset>`;
  }
  if (action === "extend") content += cryIdSelect;
  if (action === "kingHill") content += `<label>${esc(text("Choice"))}${choices("choice", [["walk", text("Walk")], ["all", text("All")]])}</label>${selected("targetTokenUuids", 1)}`;
  if (["herald", "duty", "extraTurn", "redirect", "tipSP", "frightenedSave"].includes(action)) content += selected("targetTokenUuids", action === "herald" ? 2 : 1);
  if (action === "projection") content += `<p>${esc(text("Preview"))}</p><button type="button" data-preview-projection>${esc(text("Preview"))}</button><output data-projection-point></output>${selected("targetTokenUuids")}<fieldset><legend>${esc(text("Outcome"))}</legend>${targetList.map(t => outcomeField(t, [["manual", "Resolve manually"], ["friendly", "Friendly / neutral (temporary HP)"], ["failure", "Hostile, failed save"], ["success", "Hostile, successful save"]])).join("")}</fieldset><fieldset><legend>Optional manually reviewed final Thunder Damage</legend>${targetList.map(t => `<label>${esc(t.name)}<input type="number" name="damage-${esc(t.uuid)}" min="0" step="1" placeholder="Use native calculation"></label>`).join("")}</fieldset><p>Enter a final amount only after reviewing AK5e Damage Reduction and defenses. A blank amount uses Foundry's native defenses; confirm no additional reduction applies.</p>`;
  if (action === "tipSP") content += `<label>${esc(text("Amount"))}<input type="number" name="amount" min="1" step="1"></label>`;
  if (["redirect", "acceptGain"].includes(action)) content += `<label>Pending Skill Point gain${choices("eventId", gainOptions)}</label>`;
  if (action === "useBenefit") content += selected("targetTokenUuids", 1);
  if (["useBenefit", "frightenedSave"].includes(action)) {
    content += `<fieldset><legend>Choose a benefit on the selected creature</legend>${targetList.map(target => {
      const consumable = new Set(["tip1", "resistance", "extraTurn", "belligerantChorus", "herald"]);
      const benefits = (target.benefits ?? []).filter(benefit => action === "frightenedSave" ? benefit.kind === "havoc" : consumable.has(benefit.kind));
      const instruction = benefit => ({ tip1: "Add the bearer's Proficiency Bonus to one Damage Roll, then mark this benefit used.",
        resistance: "Apply Resistance to the next Damage instance within one minute, then mark this benefit used.",
        herald: "Roll 1d8 and add it to one Damage Roll before the target's next Turn ends, then mark used.",
        belligerantChorus: "Use a Reaction now for the granted Action; do not also use this bonus as a Bonus Action next Turn." })[benefit.kind] ?? "Apply the feature instructions, then mark its one-use benefit consumed.";
      return `<label>${esc(target.name)}${choices(`benefit-${esc(target.actorUuid ?? target.uuid)}`, [["", "Choose a benefit"], ...benefits.map(benefit => [benefit.id, `${benefit.label} (${benefit.id})`])])}</label>${benefits.map(benefit => `<p class="ak5e-standard-benefit-note"><strong>${esc(benefit.label)}:</strong> ${esc(instruction(benefit))}</p>`).join("")}`;
    }).join("")}</fieldset>`;
    if (action === "frightenedSave") content += `<label>Repeat Wisdom save${choices("repeatSave", [["", "Choose outcome"], ["success", "Successful: end Frightened"], ["failure", "Failed: remain Frightened"]])}</label>`;
  }
  if (action === "hitDice" || action === "cry" && false) content += "";
  if (["wield", "plant", "pickup", "fervour", "handoff", "tip", "directed", "cry", "chorus", "extend", "kingHill", "herald", "projection", "duty", "lastStand", "endStand", "extraTurn", "redirect", "acceptGain", "tipSP", "useBenefit", "frightenedSave"].includes(action)) content += factSection;
  content += `<label class="ak5e-standard-confirm"><input type="checkbox" name="confirmation">${esc(text("Confirm"))}</label>`;
  const result = await foundry.applications.api.DialogV2.wait({ window: { title: `${text(action === "clearFervour" ? "Clear" : action)} — ${actor.name}` }, rejectClose: false,
    content: `<div class="ak5e-standard-form">${content}</div>`, buttons: [
      { action: "submit", label: text("Submit"), callback: (_event, button) => {
        const form = button.form, confirmation = form.elements.confirmation?.checked === true;
        if (!confirmation) { ui.notifications.warn("Confirm the action and its requirements before submitting."); return false; }
        const targetTokenUuids = limited && action === "pickup" && pickerTokenUuid ? [pickerTokenUuid] : [...form.querySelectorAll('input[name="targetTokenUuids"]:checked')].map(input => input.value);
        const needsTarget = ["pickup", "handoff", "fervour", "tip", "chorus", "kingHill", "herald", "duty", "extraTurn", "redirect", "tipSP", "frightenedSave", "useBenefit"].includes(action);
        if (needsTarget && !targetTokenUuids.length) { ui.notifications.warn("Choose a target."); return false; }
        if (["redirect", "acceptGain"].includes(action) && !form.elements.eventId?.value) { ui.notifications.warn("Choose a pending Skill Point gain."); return false; }
        if ((action === "herald" && targetTokenUuids.length > 2) || (["pickup", "handoff", "fervour", "tip", "chorus", "kingHill", "duty", "extraTurn", "redirect", "tipSP", "frightenedSave", "useBenefit"].includes(action) && targetTokenUuids.length > 1)) { ui.notifications.warn("Choose only the number of creatures allowed by this feature."); return false; }
        const facts = Object.fromEntries(factsOptions.map(key => [key, form.elements[`fact-${key}`]?.checked === true]));
        const data = { confirmation, sourceTokenUuid, targetTokenUuids, facts };
        for (const field of ["trigger", "cry", "cryId", "choice", "tipChoice", "eventId"]) if (form.elements[field]?.value) data[field] = field === "tipChoice" ? Number(form.elements[field].value) : form.elements[field].value;
        if (action === "cry") {
          data.chorusTokenUuids = [...form.querySelectorAll('input[name="chorusTokenUuids"]:checked')].map(input => input.value);
          if (data.cry === "havoc") {
            if (form.dataset.havocDirection == null || Number(form.dataset.havocChorusCount) !== data.chorusTokenUuids.length) { ui.notifications.warn("Preview the Cry Havoc cone again after changing Chorus responders."); return false; }
            data.direction = Number(form.dataset.havocDirection);
          }
          data.outcomes = Object.fromEntries(targetTokenUuids.map(uuid => [uuid, form.elements.namedItem(`outcome-${uuid}`)?.value ?? "manual"]));
          data.hitDice = Object.fromEntries(targetList.map(target => [target.actorUuid ?? target.uuid, form.elements.namedItem(`hitdie-${target.actorUuid ?? target.uuid}`)?.value]).filter(([, denomination]) => denomination));
          data.damageTotals = {};
          for (const uuid of targetTokenUuids) {
            const amount = form.elements.namedItem(`damage-${uuid}`)?.value;
            if (amount === "" || amount == null) continue;
            if (!Number.isSafeInteger(Number(amount)) || Number(amount) < 0) { ui.notifications.warn("Enter a nonnegative whole-number final Damage amount."); return false; }
            data.damageTotals[uuid] = Number(amount);
          }
          if (data.cry === "havoc" && targetTokenUuids.some(uuid => data.outcomes[uuid] !== "manual") && !facts.damageReviewed) { ui.notifications.warn("Review Damage after defenses before applying the confirmed save outcomes."); return false; }
        }
        if (action === "projection") {
          const point = form.dataset.projectionPoint ? JSON.parse(form.dataset.projectionPoint) : null;
          if (!point) { ui.notifications.warn("Place and review the projection point first."); return false; }
          data.point = point; data.outcomes = Object.fromEntries(targetTokenUuids.map(uuid => [uuid, form.elements.namedItem(`outcome-${uuid}`)?.value ?? "manual"]));
          data.damageTotals = {};
          for (const uuid of targetTokenUuids) {
            const amount = form.elements.namedItem(`damage-${uuid}`)?.value;
            if (amount === "" || amount == null) continue;
            if (!Number.isSafeInteger(Number(amount)) || Number(amount) < 0) { ui.notifications.warn("Enter a nonnegative whole-number final Damage amount."); return false; }
            data.damageTotals[uuid] = Number(amount);
          }
          if (!facts.eligibility) { ui.notifications.warn("Confirm the map placement is eligible after checking elevation, walls, and sight."); return false; }
          if (targetTokenUuids.some(uuid => ["failure", "success"].includes(data.outcomes[uuid])) && !facts.damageReviewed) { ui.notifications.warn("Review Damage after defenses before applying the confirmed save outcomes."); return false; }
        }
        if (action === "chorus" || action === "extend") data.cryId = form.elements.cryId?.value;
        if (action === "chorus") data.hitDice = Object.fromEntries(targetList.map(target => [target.actorUuid ?? target.uuid, form.elements.namedItem(`hitdie-${target.actorUuid ?? target.uuid}`)?.value]).filter(([, denomination]) => denomination));
        if (action === "tipSP") data.amount = Number(form.elements.amount?.value);
        if (action === "useBenefit" || action === "frightenedSave") {
          const target = targetList.find(candidate => candidate.uuid === targetTokenUuids[0]);
          data.benefitId = target && form.elements.namedItem(`benefit-${target.actorUuid ?? target.uuid}`)?.value;
        }
        if (action === "frightenedSave") data.outcomes = { [targetTokenUuids[0]]: form.elements.repeatSave?.value };
        return data;
      } }, { action: "cancel", label: text("Cancel"), callback: () => null }
    ], render: (_event, app) => {
      app.element.querySelector("[data-preview-projection]")?.addEventListener("click", async event => {
        event.preventDefault();
        try {
          const token = await fromUuid(sourceTokenUuid);
          const shapes = await previewSkillArea({ shape: "circle", distance: 15, range: 60, anchor: "placed", variable: false, templates: 1 }, token);
          if (!shapes?.length) return;
          const point = { x: shapes[0].x, y: shapes[0].y, direction: Number(shapes[0].direction ?? 0) };
          const form = app.element.querySelector("form"); form.dataset.projectionPoint = JSON.stringify(point);
          app.element.querySelector("[data-projection-point]").textContent = `Point: ${Math.round(point.x)}, ${Math.round(point.y)}. Confirm it is visible and grounded.`;
        } catch (error) { ui.notifications.error(error.message); }
      });
      app.element.querySelector("[data-preview-havoc]")?.addEventListener("click", async event => {
        event.preventDefault();
        try {
          const source = await fromUuid(sourceTokenUuid), chorusCount = app.element.querySelectorAll('input[name="chorusTokenUuids"]:checked').length;
          const shapes = await previewSkillArea({ shape: "cone", distance: 30 + chorusCount * 10, angle: 90, anchor: "source", variable: false, templates: 1 }, source);
          if (!shapes?.length) return;
          const direction = Number(shapes[0].direction ?? 0), form = app.element.querySelector("form"); form.dataset.havocDirection = String(direction); form.dataset.havocChorusCount = String(chorusCount);
          app.element.querySelector("[data-havoc-direction]").textContent = `Preview placed. Direction ${direction}°. Confirm the selected targets and their source eligibility.`;
        } catch (error) { ui.notifications.error(error.message); }
      });
    } });
  return result && typeof result === "object" ? result : null;
}

export async function runAction(actor, action, explicitSource, { limited = false, pickerTokenUuid = null } = {}) {
  if (action === "damagePreview") return runDamagePreview(actor);
  const limitedActions = ["pickup", "handoff"];
  if ((!actor?.isOwner && !(limited && limitedActions.includes(action))) || !hasStandardBranch(actor)) throw new Error(text("NoBranch"));
  const view = await getStandardView(actor, game.user);
  if (!view?.state) throw new Error("Standard Bearer state is unavailable.");
  const sourceTokenUuid = action === "setup" ? null : await chooseSource(actor, explicitSource ?? view.sourceTokenUuid, view);
  if (action === "setup") {
    const preview = await previewStandardUpdate(actor);
    const accepted = await foundry.applications.api.DialogV2.confirm({ window: { title: text("Setup") }, rejectClose: false,
      content: `<p>Review the Standard Bearer helper additions. Existing items, activities, and IDs are preserved.</p><pre>${esc(JSON.stringify(preview, null, 2))}</pre>` });
    if (!accepted) return false;
    return submitStandardCommand(actor, action, { confirmation: true });
  }
  if (action === "clearFervour" && view.pending?.hostileCombatEnded !== false) {
    const accepted = await foundry.applications.api.DialogV2.confirm({ window: { title: text("Clear") }, rejectClose: false,
      content: "Confirm that you are no longer in combat with hostile Creatures." });
    if (!accepted) return false;
    return submitStandardCommand(actor, action, { confirmation: true, sourceTokenUuid, facts: { qualifying: true } });
  }
  const data = await confirmedDialog(actor, action, view, sourceTokenUuid, { limited, pickerTokenUuid });
  if (!data) return false;
  return submitWithRetry(actor, action, data);
}

async function runDamagePreview(actor) {
  if (!actor?.isOwner || !hasStandardBranch(actor)) throw new Error(text("NoBranch"));
  const view = await getStandardView(actor, game.user), candidates = (view.targets ?? []).filter(target => !target.hidden);
  const result = await foundry.applications.api.DialogV2.wait({ window: { title: "Preview Defiant Roar Damage Reduction" }, rejectClose: false,
    content: `<div class="ak5e-standard-form"><label>Recipient${choices("target", candidates.map(target => [target.uuid, target.name]))}</label><label>Incoming Damage<input type="number" name="amount" min="0" step="1"></label><label>Damage type${choices("damageType", ["bludgeoning", "piercing", "slashing", "acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"].map(type => [type, type]))}</label><label><input type="checkbox" name="resistance">Resistance applies</label><label><input type="checkbox" name="vulnerability">Vulnerability applies</label><label><input type="checkbox" name="confirmation">I confirmed existing Damage Reduction and defenses with the GM</label></div>`,
    buttons: [{ action: "preview", label: "Preview only", callback: async (_event, button) => {
      const form = button.form, confirmation = form.elements.confirmation.checked;
      if (!confirmation) { ui.notifications.warn("Confirm the existing defenses before previewing."); return false; }
      const token = await fromUuid(form.elements.target.value), target = token?.actor;
      if (!target) { ui.notifications.warn("Choose a visible creature."); return false; }
      const amount = Number(form.elements.amount.value);
      if (!Number.isSafeInteger(amount) || amount < 0) { ui.notifications.warn("Enter nonnegative whole-number Damage."); return false; }
      const preview = standardDamagePreview(target, { amount, damageType: form.elements.damageType.value,
        resistance: form.elements.resistance.checked, vulnerability: form.elements.vulnerability.checked });
      await foundry.applications.api.DialogV2.confirm({ window: { title: "Damage preview (no changes applied)" }, rejectClose: false,
        content: `<p>Incoming Damage: ${amount}</p><p>AK5e Damage Reduction: ${preview.reduction}</p><p>After DR and selected Resistance/Vulnerability: ${preview.result}</p><p>${esc(preview.instructions)}</p>` });
      return preview;
    } }, { action: "cancel", label: text("Cancel"), callback: () => null }] });
  return Boolean(result);
}

async function renderPanel(actor, { limited = false, pickerTokenUuid = null } = {}) {
  const view = await getStandardView(actor, game.user);
  if (!view?.state || (!actor.isOwner && !limited)) return;
  const sourceTexts = Object.fromEntries(STANDARD_ENTRIES.map(entry => {
    const holder = document.createElement("div"); holder.innerHTML = entry.content ?? "";
    return [entry.sourceHeading, holder.textContent.trim()];
  }));
  const labels = { setup: "Setup", wield: "Wield", stow: "Stow", plant: "Plant", pickup: "Pickup", handoff: "Handoff", fervour: "Gain", clearFervour: "Clear", tip: "Tip", directed: "Tip", cry: "Cry", chorus: "Chorus", extend: "Extend", kingHill: "King", herald: "Herald", projection: "Projection", duty: "Duty", expertise: "Expertise", lastStand: "Stand", endStand: "EndStand", extraTurn: "ExtraTurn", redirect: "Redirect", acceptGain: "AcceptGain", tipSP: "SP", useBenefit: "Benefit", frightenedSave: "Benefit", damagePreview: "DamagePreview", reconcile: "Refresh" };
  const normalActions = ["setup", "wield", "stow", "plant", "pickup", "handoff", "fervour", "clearFervour", "tip", "directed", "cry", "chorus", "extend", "kingHill", "herald", "projection", "duty", "expertise", "lastStand", "endStand", "extraTurn", "redirect", ...(Object.keys(view.pendingGains ?? {}).length ? ["acceptGain"] : []), "tipSP", "useBenefit", "frightenedSave", "damagePreview", ...(game.user.isGM ? ["reconcile"] : [])];
  const visibleActions = limited ? [standardState(actor).mode === "planted" ? "pickup" : "handoff"] : normalActions;
  const available = visibleActions.filter(action => {
    if (action === "redirect" && (!view.state.lastStand || !Object.keys(view.pendingGains ?? {}).length)) return false;
    const minimum = { kingHill: 4, herald: 4, projection: 10, duty: 13, expertise: 13, lastStand: 17, endStand: 17, extraTurn: 17, redirect: 17 }[action];
    return !minimum || view.level >= minimum;
  });
  const actionHtml = available.map(action => `<button type="button" data-standard-action="${action}">${esc(text(labels[action] ?? action))}</button>`).join("");
  const preview = limited ? "Choose a visible creature and confirm willingness or the pickup action." : view.pending?.summary ?? "Confirm source requirements, targets, costs, and outcomes. These controls are player-confirmed helpers; follow the source text when applying an effect manually.";
  const retry = retainedRetry(actor, view.pending), pendingRetry = Boolean(retry);
  const content = `<section class="ak5e-standard-panel">${limited ? `<p>${esc(preview)}</p>` : `<p><strong>${esc(text("Mode"))}:</strong> ${esc(view.state.mode ?? "carried")} · <strong>${esc(text("Fervour"))}:</strong> ${Number(view.state.fervour ?? 0)} · <strong>${esc(text("DC"))}:</strong> ${Number(view.dc ?? 0)}</p><p>${esc(preview)}</p>`}<div class="ak5e-standard-buttons">${actionHtml}</div>${pendingRetry ? `<p role="alert">Operation ${esc(retry.id)} is prepared. Retry the exact same confirmed choices:</p><button type="button" data-standard-retry>Retry pending operation</button>` : ""}${!limited ? `<details><summary>${esc(text("Instructions"))}</summary>${STANDARD_ENTRIES.map(entry => `<article><h3>${esc(entry.sourceHeading)}</h3><p>${esc(sourceTexts[entry.sourceHeading])}</p></article>`).join("")}${Object.values(BATTLECRIES).map(cry => `<article><h3>${esc(cry.name)} · ${cry.cost} Fervour</h3><p>${esc(cry.instructions)}</p></article>`).join("")}${TIP_INSTRUCTIONS.map((instruction, index) => `<p><strong>Tip ${index + 1}:</strong> ${esc(instruction)}</p>`).join("")}<p><strong>Manual guidance:</strong> Confirm positioning, disposition, visibility, reactions, and saves at the table. Apply described changes through the target's sheet when no scoped helper is available.</p>${view.pending?.length ? `<p role="alert">Prepared operation ${esc(view.pending[0].id)} remains unresolved. Retry the same choices or ask the GM to reconcile it.</p>` : ""}</details>` : ""}</section>`;
  await foundry.applications.api.DialogV2.wait({ window: { title: `${text("Title")} — ${actor.name}` }, rejectClose: false, content,
    buttons: [{ action: "close", label: text("Cancel"), callback: () => null }], render: (_event, app) => {
      app.element.querySelector("[data-standard-retry]")?.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation(); app.close();
        safe(async () => {
          await retryPending(actor, retry);
          await renderPanel(actor, { limited, pickerTokenUuid });
        });
      });
      for (const control of app.element.querySelectorAll("[data-standard-action]")) control.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation(); control.disabled = true;
        const action = control.dataset.standardAction;
        app.close();
        safe(async () => { try { await runAction(actor, action, view.sourceTokenUuid, { limited, pickerTokenUuid }); }
          finally { await renderPanel(actor, { limited, pickerTokenUuid }); } }).finally(() => { control.disabled = false; });
      });
    } });
}

export function openStandardBearer(actor) {
  if (!actor?.isOwner || !hasStandardBranch(actor)) return Promise.reject(new Error(text("NoBranch")));
  return openOnce(actor, () => renderPanel(actor));
}

export function openStandardInteraction(actor, token, action) {
  if (!actor || !token?.actor?.isOwner || !["pickup", "handoff"].includes(action)) return Promise.reject(new Error("Own the interacting creature to use this Standard control."));
  return renderPanel(actor, { limited: true, pickerTokenUuid: token.uuid });
}

export function renderStandardBearerControls(app, element) {
  const actor = actorFor(app);
  if (!actor || !element?.querySelector) return;
  const roots = app.element?.contains?.(element) ? [app.element] : [element];
  if (app.element?.querySelector && app.element !== element && !app.element.contains?.(element) && !element.contains?.(app.element)) roots.push(app.element);
  for (const root of roots) {
    for (const old of root.querySelectorAll(".ak5e-standard-controls, .ak5e-standard-row-button, .ak5e-standard-recipient-controls")) old.remove();
    if (!actor.isOwner) continue;
    const recipientBenefits = entries(actor.effects).filter(effect => {
      const benefit = flag(effect, "standardBenefit"); return !effect.disabled && benefit?.bearerUuid;
    });
    if (recipientBenefits.length) {
      const recipientPanel = node("section", "ak5e-standard-recipient-controls");
      recipientPanel.append(node("h3", "", "Standard Bearer benefits on this creature"));
      for (const effect of recipientBenefits) {
        const benefit = flag(effect, "standardBenefit"), row = node("div", "ak5e-standard-recipient-benefit");
        row.append(node("strong", "", effect.name));
        const instruction = node("p", "");
        const description = document.createElement("div"); description.innerHTML = effect.description?.value ?? "";
        instruction.textContent = description.textContent || "Follow the effect instructions on this sheet and confirm its use with the bearer.";
        row.append(instruction);
        const bearer = globalThis.fromUuidSync?.(benefit.bearerUuid);
        if (bearer?.isOwner && hasStandardBranch(bearer)) row.append(button("Open bearer controls to confirm use", () => openStandardBearer(bearer)));
        else row.append(node("p", "ak5e-standard-owner-reminder", "Ask the bearer owner or GM to confirm and record one-use benefits. This reminder does not submit a request."));
        recipientPanel.append(row);
      }
      const effectTarget = root.querySelector('.tab[data-tab="features"], .tab[data-tab="effects"], .tab[data-tab="inventory"]') ?? root.querySelector(".sheet-header");
      effectTarget?.prepend(recipientPanel);
    }
    if (!hasStandardBranch(actor)) continue;
    const controls = node("section", "ak5e-standard-controls");
    controls.append(node("h3", "", text("Title")));
    controls.append(button("Open Standard Bearer", () => openStandardBearer(actor)));
    const target = root.querySelector('.tab[data-tab="inventory"] .inventory-element, .tab[data-tab="features"] .items-list, .tab[data-tab="features"]') ?? root.querySelector(".sheet-header");
    target?.prepend(controls);
    for (const row of root.querySelectorAll("[data-item-id]")) {
      const item = actor.items.get(row.dataset.itemId), entry = STANDARD_ENTRIES.find(candidate => candidate.id === flag(item, "chapterThreeId"));
      if (!entry) continue;
      const actions = standardFeatureActions(entry);
      const control = button(`Standard: ${actions.map(action => action.split(":")[0]).join(", ") || "Open"}`, () => openStandardBearer(actor), "ak5e-standard-row-button");
      row.append(control);
    }
  }
}

export function renderStandardInteractionHUD(app, element) {
  const picker = app?.object?.document ?? app?.object;
  if (picker?.documentName !== "Token" || !element?.querySelector) return;
  const roots = app.element?.contains?.(element) ? [app.element] : [element];
  for (const root of roots) root.querySelectorAll(".ak5e-standard-hud-button").forEach(button => button.remove());
  if (!picker.actor?.isOwner) return;
  const actorDocs = entries(game.actors).filter(actor => hasStandardBranch(actor));
  const interaction = actorDocs.map(bearer => {
    const state = standardState(bearer);
    if (state.mode === "planted" && state.propTokenUuid) {
      const prop = globalThis.fromUuidSync?.(state.propTokenUuid);
      if (prop?.parent?.id === picker.parent?.id && !prop.hidden && (!prop.object || prop.object.visible) && distanceFeet(picker.parent, tokenPoint(prop), tokenPoint(picker)) <= 5 + 1e-6) return { bearer, action: "pickup" };
    }
    if (state.mode !== "planted" && state.holderTokenUuid === picker.uuid) return { bearer, action: "handoff" };
    return null;
  }).filter(Boolean);
  if (!interaction.length) return;
  const target = roots.map(root => root.querySelector(".col.right, .right, .token-hud")).find(Boolean) ?? roots[0];
  for (const { bearer, action } of interaction) {
    const control = button(action === "pickup" ? text("Pickup") : text("Handoff"), () => openStandardInteraction(bearer, picker, action), "ak5e-standard-hud-button");
    target.append(control);
  }
}

export function registerStandardSheetHooks() {
  Hooks.on("renderActorSheetV2", renderStandardBearerControls);
  Hooks.on("renderTokenHUD", renderStandardInteractionHUD);
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = actorFor(app);
    if (!actor?.isOwner || !hasStandardBranch(actor) || controls.some(control => control.action === "ak5eStandardBearer")) return;
    controls.unshift({ action: "ak5eStandardBearer", icon: "fa-solid fa-flag", label: text("Title"), ownership: "OWNER", onClick: () => safe(() => openStandardBearer(actor)) });
  });
  Hooks.on("dnd5e.preUseActivity", activity => {
    const item = activity?.item, actor = activity?.actor;
    if (!actor?.isOwner || !hasStandardBranch(actor) || !item?.getFlag?.("ak5e", "chapterThreeId")) return;
    const entry = STANDARD_ENTRIES.find(candidate => candidate.id === item.getFlag("ak5e", "chapterThreeId"));
    if (!entry || !standardFeatureActions(entry).length || !activity.id?.startsWith?.("ak5eStandard")) return;
    safe(() => openStandardBearer(actor));
    return false;
  });
}
