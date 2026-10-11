/**
 * Guardian controls in the Defender panel, the Guardian Arts setup dialog, and the buttons on Aura of Mercy and
 * The Best Medicine prompt cards. Opening any of these writes nothing (WORKFLOW.md §3.2: confirm before use).
 */
import { registerDefenderForms, openDefenderForm, registerDefenderNotices } from "./defender-sheet.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { previewGuardianArts, applyGuardianArts, guardianArtsOutdated, isGuardian, pendingNotToday, bestMedicineActive } from "./guardian-features.mjs";
import { openMappings } from "./caster-sheet.mjs";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Guardian UI", error); ui.notifications.error(error?.message ?? String(error)); });

/** Creatures to choose from: your current targets first, then the other tokens on your Scene, then yourself. */
function creatureOptions(actor) {
  const seen = new Set(), options = [];
  const add = (uuid, name) => { if (uuid && !seen.has(uuid)) { seen.add(uuid); options.push([uuid, name]); } };
  for (const token of list(game.user?.targets)) add(token.actor?.uuid, `${token.name ?? token.actor?.name} (targeted)`);
  const own = list(actor.getActiveTokens?.(true, true)).map(t => t.document ?? t)[0];
  for (const token of list(own?.parent?.tokens)) if (token.actor && token.actor.uuid !== actor.uuid) add(token.actor.uuid, token.name);
  add(actor.uuid, `${actor.name} (yourself)`);
  return options;
}

async function openGuardianArts(actor) {
  let ability = (flag(actor, "casting")?.ability && ["int", "wis", "cha"].includes(flag(actor, "casting").ability)) ? flag(actor, "casting").ability : null;
  if (!ability) {
    ability = await foundry.applications.api.DialogV2.prompt({ window: { title: `Guardian of Life — ${actor.name}` }, rejectClose: false,
      content: `<div class="ak5e-defender-form"><p>${esc("When you gain this Feature, choose Intelligence, Wisdom or Charisma as your Spellcasting Ability (Ch.3 L1504).")}</p><label class="ak5e-defender-field"><span>Spellcasting Ability</span><select name="ability"><option value="int">Intelligence</option><option value="wis">Wisdom</option><option value="cha">Charisma</option></select></label></div>`,
      ok: { label: "Preview", callback: (_event, target) => (target.form ?? target.closest("form")).elements.ability.value } });
    if (!ability) return null;
  }
  const plan = await previewGuardianArts(actor, { ability });
  const lines = [`Arts Points ${plan.table.maximum}, maximum Art level ${plan.table.maximumArtLevel} (Defender level ${plan.level}); Long Rest recovery; shields you equip are your Casting Unit.`,
    `Spellcasting Ability: ${{ int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[plan.ability]}.`,
    ...plan.creates.map(data => `Learn ${data.name} (always prepared).`), ...plan.existing.map(name => `${name}: already known.`), ...plan.warnings];
  const buttons = [{ action: "apply", label: "Apply Guardian Arts setup", default: true, callback: () => "apply" }];
  if (game.user.isGM && plan.missing.length) buttons.push({ action: "map", label: "Resolve Healing Arts mappings (GM)", callback: () => "map" });
  buttons.push({ action: "cancel", label: "Cancel", callback: () => null });
  const choice = await foundry.applications.api.DialogV2.wait({ window: { title: `Guardian Arts setup — ${actor.name}` }, position: { width: 600 }, rejectClose: false,
    content: `<ul class="ak5e-defender-plan">${lines.map(line => `<li>${esc(line)}</li>`).join("")}</ul>`, buttons });
  if (choice === "map") { await openMappings(actor, { missing: plan.missing }); return openGuardianArts(actor); }
  if (choice !== "apply") return null;
  const result = await applyGuardianArts(actor, { ability, confirmed: true, contextKey: plan.contextKey });
  ui.notifications.info(`Guardian Arts set up: ${result.granted.length} Healing Arts learned${result.missing.length ? `, ${result.missing.length} awaiting GM mapping` : ""}.`);
  return result;
}

registerDefenderForms({
  guardianArts: { label: "Guardian Arts setup", branch: "guardian", anyLevel: true, open: openGuardianArts, intro: "", fields: () => [] },
  notToday: { label: "Not Today", branch: "guardian", anyLevel: true, engine: defenderUses,
    intro: "Once per Turn, no Action required: expend any amount of Resilience to reduce the Arts Point cost of the next Art you cast by that amount, to a minimum of 0.",
    fields: actor => [{ name: "amount", type: "number", label: `Resilience to expend${pendingNotToday(actor) ? ` (replaces the waiting ${pendingNotToday(actor).amount} AP discount)` : ""}`, default: 1 }] },
  anaesthesia: { label: "Anaesthesia", branch: "guardian", anyLevel: true, engine: defenderUses,
    intro: "When you restore Hit Points to a Creature, you can also grant it 2d6 Temporary Hit Points, or 4d6 if you expend 1 Resilience. The card has a Roll button.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature you restored Hit Points to", options: creatureOptions(actor) },
      { name: "enhanced", type: "check", label: "Expend 1 Resilience for 4d6" }, { name: "healedConfirmed", type: "check", label: "I restored Hit Points to this Creature", default: true }] },
  auraOfMercy: { label: "Aura of Mercy", branch: "guardian", anyLevel: true, engine: defenderUses,
    intro: "Whenever an allied Creature within 10 feet of you recovers Hit Points, they recover additional Hit Points equal to your Proficiency Bonus. Construct targets show a source-rule warning; check the explicit table override only if your table allows it.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature that recovered Hit Points", options: creatureOptions(actor) },
      { name: "healedConfirmed", type: "check", label: "This Creature just recovered Hit Points" }, { name: "allyConfirmed", type: "check", label: "This Creature is my ally" },
      { name: "constructOverride", type: "check", label: "Use the explicit table override to heal a Construct" }] },
  bestMedicine: { label: "The Best Medicine", branch: "guardian", anyLevel: true, engine: defenderUses,
    intro: "Bonus Action, once per Long Rest: for the next minute, whenever you make a Melee Attack against a Creature, you may restore 2d6 Hit Points to a Creature of your choice that you can see within 30 feet.", fields: () => [] },
  bestMedicineHeal: { label: "The Best Medicine: heal", branch: "guardian", anyLevel: true, engine: defenderUses,
    intro: "You made a Melee Attack while The Best Medicine is active: restore 2d6 Hit Points to a Creature you can see within 30 feet. Construct targets show a source-rule warning; check the explicit table override only if your table allows it. The card has a Roll button.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature to heal", options: creatureOptions(actor) },
      { name: "attackConfirmed", type: "check", label: "I made a Melee Attack against a Creature" }, { name: "visible", type: "check", label: "I can see this Creature" },
      { name: "constructOverride", type: "check", label: "Use the explicit table override to heal a Construct" }] }
});

/** Buttons on the whispered Aura of Mercy and The Best Medicine prompt cards (the Guardian's owners and the GM). */
function renderGuardianPrompt(message, html) {
  const prompt = flag(message, "guardianPrompt");
  if (!prompt || html.querySelector(".ak5e-guardian-prompt")) return;
  const actor = globalThis.fromUuidSync?.(prompt.actorUuid);
  if (!actor?.isOwner || !isGuardian(actor)) return;
  const button = document.createElement("button");
  button.type = "button"; button.className = "ak5e-guardian-prompt";
  if (prompt.kind === "aura") {
    const target = globalThis.fromUuidSync?.(prompt.targetUuid);
    button.textContent = `Add Aura of Mercy to ${target?.name ?? "this Creature"}`;
    button.addEventListener("click", event => { event.preventDefault(); safe(() => openDefenderForm(actor, "auraOfMercy", {
      targetUuid: prompt.targetUuid, healedConfirmed: true, allyConfirmed: true, hidden: { healingId: prompt.healingId }
    })); });
  } else {
    button.textContent = bestMedicineActive(actor) ? "Restore 2d6 Hit Points (The Best Medicine)" : "The Best Medicine has ended";
    button.disabled = !bestMedicineActive(actor);
    button.addEventListener("click", event => { event.preventDefault(); safe(() => openDefenderForm(actor, "bestMedicineHeal", { attackConfirmed: true, hidden: { attackId: prompt.attackId } })); });
  }
  html.querySelector(".message-content")?.append(button);
}
/** The Defender panel offers Guardian Arts setup again after a level-up. */
export function guardianNotices(actor) {
  return guardianArtsOutdated(actor) ? ["Guardian Arts setup has not been applied at your current Defender level; open Guardian Arts setup to update your Arts Points and Healing Arts."] : [];
}
let installed = false;
export function registerGuardianSheetHooks() {
  if (installed) return;
  installed = true;
  registerDefenderNotices(guardianNotices);
  Hooks.on("renderChatMessageHTML", (message, html) => { try { renderGuardianPrompt(message, html); } catch (error) { console.error("AK5e | Guardian prompt", error); } });
}
