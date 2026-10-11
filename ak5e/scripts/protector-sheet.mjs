/**
 * Protector controls in the Defender panel and the button on the whispered Stone Wall prompt. Opening any of these writes
 * nothing (WORKFLOW.md §3.2: confirm before use).
 */
import { registerDefenderForms, openDefenderForm, registerDefenderNotices } from "./defender-sheet.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { defenderLevel, defenderState } from "./defender-rules.mjs";
import { isProtector, protectorDCFor, bulwarkShield } from "./protector-features.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Protector UI", error); ui.notifications.error(error?.message ?? String(error)); });
/** Creatures to choose from: your current targets first, then the other tokens on your Scene. */
function creatureOptions(actor, { self = false } = {}) {
  const seen = new Set(), options = [];
  const add = (uuid, name) => { if (uuid && !seen.has(uuid)) { seen.add(uuid); options.push([uuid, name]); } };
  if (self) add(actor.uuid, `${actor.name} (yourself)`);
  for (const token of list(game.user?.targets)) add(token.actor?.uuid, `${token.name ?? token.actor?.name} (targeted)`);
  const own = list(actor.getActiveTokens?.(true, true)).map(t => t.document ?? t)[0];
  for (const token of list(own?.parent?.tokens)) if (token.actor && token.actor.uuid !== actor.uuid) add(token.actor.uuid, token.name);
  return options;
}
function tokenOptions(actor) {
  const own = list(actor.getActiveTokens?.(true, true)).map(t => t.document ?? t)[0], targeted = new Set(list(game.user?.targets).map(t => (t.document ?? t).uuid));
  return list(own?.parent?.tokens).filter(token => token.actor && token.uuid !== own.uuid).map(token => [token.uuid, token.name, targeted.has(token.uuid)]);
}
/** Your Physical Damage Reduction from equipped armour and shields (single source); otherwise you enter it. */
function physicalReduction(actor) {
  const values = list(actor.items).filter(item => item.system?.equipped).map(item => String(flag(item, "tableData")?.["damage reduction"] ?? "").match(/^(\d+)\s*\((Physical|All)\)$/i)).filter(Boolean);
  return values.length === 1 ? Number(values[0][1]) : undefined;
}
const recent = (actor, command) => defenderUses.uses(actor).filter(use => use.command === command && use.status !== "undone").slice(0, 10);

registerDefenderForms({
  centreOfAttention: { label: "Centre of Attention", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "As an Action, or as a Bonus Action by expending 2 Resilience: Creatures of your choice within 10 feet make a Wisdom Saving Throw against your Protector DC or are Taunted by you until the end of their next Turn. Uses equal your Constitution Modifier per Long Rest. The card has the save button; then apply Taunt to each Creature that failed.",
    fields: actor => [{ name: "targets", type: "tokens", label: "Creatures of your choice within 10 feet (targeted ones are pre-checked)", options: tokenOptions(actor) },
      { name: "bonusAction", type: "check", label: "Use it as a Bonus Action (2 Resilience)" }] },
  taunt: { label: "Taunt (failed Centre of Attention save)", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "The Creature is Taunted by you until the end of its next Turn and must Attack you during its Turn, if it is able to. From 12th level it also suffers Punishment.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature that failed its Wisdom Saving Throw", options: creatureOptions(actor) },
      { name: "failedSave", type: "check", label: "It failed the Saving Throw", default: true }] },
  impenetrable: { label: "Impenetrable", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "Anchor Point (Shield with the Bulwark Property): when you or a Creature benefitting from your Shelter would take Damage, expend 1 Resilience as a Reaction to grant Damage Reduction against that Damage equal to half your Physical Damage Reduction (not cumulative). Apply it by hand before Resistance.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature taking the Damage", options: creatureOptions(actor, { self: true }) },
      { name: "physicalReduction", type: "number", label: "Your Physical Damage Reduction", default: physicalReduction(actor) },
      { name: "triggerId", type: "text", label: "Instance of Damage (any short label, one Reaction per trigger)" }] },
  impenetrableRefund: { label: "Impenetrable: regain Reaction (1 Resilience)", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "No Action required: expend 1 further Resilience to refund the Reaction spent on Impenetrable.",
    fields: actor => [{ name: "useId", type: "select", label: "Impenetrable use", options: recent(actor, "impenetrable").map(use => [use.id, use.summary?.slice(0, 80) ?? use.id]) }] },
  stoneWall: { label: "Stone Wall", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "Reaction when a Creature hits you with a Melee Attack while you are wielding a shield: it makes a Strength Saving Throw against your Protector DC. The card has the save button; on a failure use Stone Wall: failed save.",
    fields: actor => [{ name: "attackerUuid", type: "select", label: "Creature that hit you", options: creatureOptions(actor) },
      { name: "triggerId", type: "text", label: "Attack being answered (any short label)" },
      { name: "hitConfirmed", type: "check", label: "It hit me with a Melee Attack", default: true }] },
  stoneWallFailed: { label: "Stone Wall: failed save", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "The Creature takes 1d8 + your Constitution Modifier Bludgeoning Damage (Roll button on the card) and is knocked Off Balance until the end of your next Turn: Attacks against it are made at Advantage.",
    fields: actor => [{ name: "stoneWallUseId", type: "select", label: "Stone Wall", options: recent(actor, "stoneWall").map(use => [use.id, use.summary?.slice(0, 80) ?? use.id]) },
      { name: "targetUuid", type: "select", label: "Creature that failed", options: creatureOptions(actor) },
      { name: "failedSave", type: "check", label: "It failed the Strength Saving Throw", default: true }] },
  punishment: { label: "Punishment (failed save)", branch: "protector", anyLevel: true, engine: defenderUses,
    intro: "War of Attrition: when a Creature fails a Saving Throw against you, it has Disadvantage on the next Attack Roll it makes before the end of your next Turn. Hits apply this automatically.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature that failed a Saving Throw against you", options: creatureOptions(actor) },
      { name: "failedSave", type: "check", label: "It failed a Saving Throw against me", default: true }] }
});

export function protectorNotices(actor) {
  if (!isProtector(actor) || !getPoolDefinition("centreOfAttention")) return [];
  const level = defenderLevel(actor), uses = getPool(actor, "centreOfAttention"), shelter = defenderState(actor).shelter, notes = [];
  notes.push(`Protector DC ${protectorDCFor(actor)} · Centre of Attention ${uses.value} / ${uses.max}${level >= 4 ? ` · ${bulwarkShield(actor) ? `${bulwarkShield(actor).name} (Bastion, read as Bulwark)` : "no Bulwark shield equipped"}` : ""}${shelter?.active ? ` · Shelter radius ${shelter.radius ?? 5} ft` : ""}`);
  if (level >= 4) notes.push("Improved Shelter: when you take the Shelter Action, check Anchor Point to use a 10-foot radius.");
  return notes;
}
/** Button on the whispered Stone Wall prompt (the Protector's owners and the GM). */
function renderProtectorPrompt(message, html) {
  const prompt = flag(message, "protectorPrompt");
  if (!prompt || html.querySelector(".ak5e-protector-prompt")) return;
  const actor = globalThis.fromUuidSync?.(prompt.actorUuid);
  if (!actor?.isOwner || !isProtector(actor)) return;
  const button = document.createElement("button");
  button.type = "button"; button.className = "ak5e-protector-prompt"; button.textContent = "Stone Wall (Reaction)";
  button.addEventListener("click", event => { event.preventDefault(); safe(() => openDefenderForm(actor, "stoneWall", {
    attackerUuid: prompt.attackerUuid, triggerId: prompt.attackId, hitConfirmed: true })); });
  html.querySelector(".message-content")?.append(button);
}
let installed = false;
export function registerProtectorSheetHooks() {
  if (installed) return;
  installed = true;
  registerDefenderNotices(protectorNotices);
  Hooks.on("renderChatMessageHTML", (message, html) => { try { renderProtectorPrompt(message, html); } catch (error) { console.error("AK5e | Protector prompt", error); } });
}
