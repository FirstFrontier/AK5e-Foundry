/**
 * Sentry controls in the Defender panel and the button on the whispered Advance and Fire prompt. Opening any of these
 * writes nothing (WORKFLOW.md §3.2: confirm before use).
 */
import { registerDefenderForms, openDefenderForm, registerDefenderNotices } from "./defender-sheet.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { defenderLevel, PAVISE_FEET } from "./defender-rules.mjs";
import { nearFeet, primaryToken } from "./defender-features.mjs";
import { tokenPoint } from "./standard-bearer-rules.mjs";
import { isSentry, pavise, pavisePoint, paviseDocument, heavyShield, torrentActive } from "./sentry-features.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (doc, key) => doc?.getFlag?.("ak5e", key) ?? doc?.flags?.ak5e?.[key];
const safe = fn => Promise.resolve().then(fn).catch(error => { console.error("AK5e | Sentry UI", error); ui.notifications.error(error?.message ?? String(error)); });
/** Ally tokens for the planted shield: tokens within 10 feet of you are pre-checked; you decide who is an ally. */
function allyOptions(actor) {
  const own = primaryToken(actor);
  if (!own?.parent) return [];
  return list(own.parent.tokens).filter(token => token.actor && token.uuid !== own.uuid)
    .map(token => [token.uuid, token.name, nearFeet(own.parent, tokenPoint(own), token, PAVISE_FEET)]);
}
function creatureOptions(actor) {
  const seen = new Set(), options = [];
  const add = (uuid, name) => { if (uuid && !seen.has(uuid)) { seen.add(uuid); options.push([uuid, name]); } };
  for (const token of list(game.user?.targets)) add(token.actor?.uuid, `${token.name ?? token.actor?.name} (targeted)`);
  const own = primaryToken(actor);
  for (const token of list(own?.parent?.tokens)) if (token.actor) add(token.actor.uuid, token.actor.uuid === actor.uuid ? `${token.name} (yourself)` : token.name);
  return options;
}
const rangedWeapons = actor => list(actor.items).filter(item => item.type === "weapon" && list(item.system?.activities).some(activity => activity.type === "attack" && activity.attack?.type?.value === "ranged"))
  .sort((a, b) => Number(b.system?.equipped === true) - Number(a.system?.equipped === true)).map(item => [item.id, `${item.name}${item.system?.equipped ? "" : " (not equipped)"}`]);
const placedTokens = actor => { const own = primaryToken(actor); return list(own?.parent?.tokens).filter(token => token.uuid !== own?.uuid).map(token => [token.uuid, token.name]); };
const recent = (actor, command) => defenderUses.uses(actor).filter(use => use.command === command && use.status !== "undone").slice(0, 10);
const allies = actor => ({ name: "allies", type: "tokens", label: "Allied Creatures who shelter behind it (you are always included; nearby ones are pre-checked)", options: allyOptions(actor) });
const alliesConfirmed = { name: "alliesConfirmed", type: "check", label: "I confirm every checked Creature is my ally" };

registerDefenderForms({
  plantPavise: { label: "Plant Pavise", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Bonus Action with a Heavy Shield equipped: plant it at your position (a 10-foot marker on the map). Allied Creatures within 10 feet of it, including you, gain the benefit of Shelter against Attacks from the opposite side of the shield; the shield is Half Cover. One planted shield at a time.",
    fields: actor => [allies(actor), alliesConfirmed] },
  linkPaviseToken: { label: "Pavise: link a placed token", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Use a token that you or the GM placed (for example a prop creature with a shield image) as your planted shield. It can be moved, targeted and re-imaged; Shelter is measured from it.",
    fields: actor => [{ name: "tokenUuid", type: "select", label: "Token standing for the planted shield", options: placedTokens(actor) }, allies(actor), alliesConfirmed] },
  recoverPavise: { label: "Recover Pavise", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Interact with Object while within 5 feet of your planted shield: pick it up again.", fields: () => [] },
  advanceAndFire: { label: "Advance and Fire", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Reaction when a Creature makes an Attack against you or a Creature benefitting from your Shelter: make a Ranged Weapon Attack against the attacker (roll it from your weapon). Expend 1 Resilience afterwards to regain the Reaction. Retributor (15th): once per Round without expending your Reaction.",
    fields: actor => [{ name: "attackerUuid", type: "select", label: "Attacking Creature", options: creatureOptions(actor) },
      { name: "weaponId", type: "select", label: "Ranged Weapon", options: rangedWeapons(actor) },
      { name: "triggerId", type: "text", label: "Attack being answered (any short label)" },
      { name: "retributor", type: "check", label: "Retributor: use it without expending my Reaction (once per Round)" },
      { name: "attackConfirmed", type: "check", label: "It attacked me or a Creature benefitting from my Shelter", default: true }] },
  advanceAndFireRefund: { label: "Advance and Fire: regain Reaction (1 Resilience)", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "After making the Attack, expend 1 Resilience to refund use of your Reaction.",
    fields: actor => [{ name: "useId", type: "select", label: "Advance and Fire use", options: recent(actor, "advanceAndFire").map(use => [use.id, use.summary?.slice(0, 80) ?? use.id]) }] },
  barTheGates: { label: "Bar the Gates", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Pointman: when you use Leaping Defence while wielding a Heavy Shield, plant it as part of that Reaction where you land. If you were within 5 feet of your planted shield, you may expend 1 Resilience to recover it before moving and plant it again.",
    fields: actor => [{ name: "recoverFirst", type: "check", label: "Recover my planted shield first (1 Resilience; within 5 feet of it)" }, allies(actor)] },
  headsDown: { label: "Heads Down", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "No Action required: when a Creature within 5 feet of your planted shield would make a Dexterity Saving Throw against an effect they can see, expend 1 Resilience so they automatically pass.",
    fields: actor => [{ name: "targetUuid", type: "select", label: "Creature making the Dexterity Saving Throw", options: creatureOptions(actor) },
      { name: "visibleConfirmed", type: "check", label: "They can see the effect", default: true }] },
  torrentOfLead: { label: "Torrent of Lead, Wall of Steel", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Once per Long Rest, during your Turn (no Action required): until the end of your next Turn, each Ranged Attack from Advance and Fire lets you make one additional Attack against the same Creature.", fields: () => [] },
  endTorrentOfLead: { label: "End Torrent of Lead", branch: "sentry", anyLevel: true, engine: defenderUses,
    intro: "Ends Torrent of Lead, Wall of Steel (outside combat it does not end on its own).", fields: () => [] }
});

export function sentryNotices(actor) {
  if (!isSentry(actor)) return [];
  const record = pavise(actor), doc = paviseDocument(actor), level = defenderLevel(actor), notes = [];
  const planted = record ? (doc ? `Shield planted (${record.kind === "token" ? `token ${doc.name}` : "template marker"}${record.unequipped ? ", unequipped" : ""})${pavisePoint(actor) ? "" : " on another Scene"}` : "Planted shield's marker is missing; recover it") : "No shield planted";
  notes.push(`${planted} · ${heavyShield(actor) ? `${heavyShield(actor).name} equipped` : "no Heavy Shield equipped"}${level >= 15 && getPoolDefinition("torrentOfLead") ? ` · Torrent of Lead ${torrentActive(actor) ? "active" : getPool(actor, "torrentOfLead").value ? "ready" : "used"}` : ""}`);
  return notes;
}
/** Button on the whispered Advance and Fire prompt (the Sentry's owners and the GM). */
function renderSentryPrompt(message, html) {
  const prompt = flag(message, "sentryPrompt");
  if (!prompt || html.querySelector(".ak5e-sentry-prompt")) return;
  const actor = globalThis.fromUuidSync?.(prompt.actorUuid);
  if (!actor?.isOwner || !isSentry(actor)) return;
  const button = document.createElement("button");
  button.type = "button"; button.className = "ak5e-sentry-prompt"; button.textContent = "Advance and Fire (Reaction)";
  button.addEventListener("click", event => { event.preventDefault(); safe(() => openDefenderForm(actor, "advanceAndFire", {
    attackerUuid: prompt.attackerUuid, triggerId: prompt.attackId, attackConfirmed: true })); });
  html.querySelector(".message-content")?.append(button);
}
let installed = false;
export function registerSentrySheetHooks() {
  if (installed) return;
  installed = true;
  registerDefenderNotices(sentryNotices);
  Hooks.on("renderChatMessageHTML", (message, html) => { try { renderSentryPrompt(message, html); } catch (error) { console.error("AK5e | Sentry prompt", error); } });
}
