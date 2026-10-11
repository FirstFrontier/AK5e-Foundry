/**
 * Defender damage modifiers in native D&D5e damage application (DECISIONS.md "Juggernaut, Protector and Sentry branches").
 * Superheavy halves an instance of Damage while a Barrier layer holds; Improved Taunt and Greater Improved Shelter grant
 * Resistance. These are mandatory source rules, so they apply automatically, but only to Damage applied from a chat card
 * whose speaker is a Creature (`options.originatingMessage`): hand-edited Hit Point bars are never changed.
 *
 * - `dnd5e.calculateDamage` is pure. D&D5e also calls it for every preview of the damage-application controls, so it only
 *   changes the calculated amount and notes what applied on `options.ak5eDefenderMods[actorUuid]`.
 * - `dnd5e.preApplyDamage` (synchronous, apply only) lets a modifier reserve what it will use up, so a second application
 *   calculated before the first one's consequence is saved cannot use the same Barrier layer again.
 * - `dnd5e.applyDamage` runs once, on the client that applied the Damage (it owns the Actor). Only there do modifiers record
 *   their consequences (a Barrier layer shatters; a Greater Improved Shelter effect is used up), and a public note shows what
 *   changed. Damage Reduction stays a manual step (DECISIONS.md), so the note gives the DR-first figure to correct HP by.
 */
import { halveDamage } from "./defender-rules.mjs";

const MODIFIERS = [];
const KEY = "ak5eDefenderMods";

/**
 * `modifier`: { id, order, calculate(actor, damages, { origin, options }) → null | { effect: "resist" | "halve", label, always?, record? },
 * reserve?(actor, entry), release?(actor, entry), applied?(actor, entry, { amount, origin, options }), card? (posts its own card) }.
 * Resistance (order < 50) runs before halving the whole instance; `always` records the entry even when nothing changed.
 */
export function registerDamageModifier(modifier) {
  const index = MODIFIERS.findIndex(entry => entry.id === modifier.id);
  if (index >= 0) MODIFIERS.splice(index, 1, modifier); else MODIFIERS.push(modifier);
  MODIFIERS.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}
export const damageModifiers = () => MODIFIERS.map(entry => entry.id);

/** The Creature that dealt the Damage: the speaker of the chat card the Damage was applied from, or null. */
export function damageOrigin(options) {
  const message = options?.originatingMessage;
  if (!message) return null;
  try {
    const actor = globalThis.ChatMessage?.implementation?.getSpeakerActor?.(message.speaker) ?? message.getAssociatedActor?.() ?? null;
    return actor?.documentName === "Actor" ? actor : null;
  } catch { return null; }
}
/** Same Creature: the same Actor document, or the same linked World Actor. */
export const sameCreature = (a, b) => Boolean(a && b && (a.uuid === b.uuid || (!a.isToken && !b.isToken && a.id === b.id)));

export function calculateDamageHook(actor, damages, options) {
  if (!actor?.uuid || !Array.isArray(damages) || !options || typeof options !== "object") return;
  const records = (options[KEY] ??= {});
  delete records[actor.uuid];                     // each calculation (preview or apply) starts afresh
  if (!(Number(damages.amount) > 0) || !MODIFIERS.length || options.ignore === true) return;
  const origin = damageOrigin(options);
  if (!origin) return;
  const applied = [];
  for (const modifier of MODIFIERS) {
    let result = null;
    try { result = modifier.calculate(actor, damages, { origin, options }); }
    catch (error) { console.error(`AK5e | Defender damage modifier ${modifier.id}`, error); }
    if (!result) continue;
    const before = Number(damages.amount);
    if (result.effect === "resist") {
      const removed = halveDamage(damages, { unresistedOnly: true, label: result.label });
      if (!removed && !result.always) continue;   // already Resistant or immune: nothing changes and nothing is used up
      damages.amount = Math.max(0, Math.trunc(before - removed));
    } else if (result.effect === "halve") {
      damages.amount = Math.trunc(before / 2);
      for (const part of damages) if (Number(part.value) > 0 && !["healing", "temphp", "maximum"].includes(part.type))
        part.active = { ...(part.active ?? {}), ak5e: [...(part.active?.ak5e ?? []), result.label] };
    } else continue;
    applied.push({ id: modifier.id, label: result.label, before, after: damages.amount, record: result.record ?? null });
  }
  if (applied.length) records[actor.uuid] = applied;
}

/** Synchronous and apply-only (D&D5e calls it once, just before writing Hit Points): reserve what will be used up. */
export function preApplyDamageHook(actor, _amount, _updates, options) {
  for (const entry of options?.[KEY]?.[actor?.uuid] ?? []) {
    const modifier = MODIFIERS.find(candidate => candidate.id === entry.id);
    if (!modifier?.reserve || entry.reserved) continue;
    try { modifier.reserve(actor, entry); entry.reserved = true; }
    catch (error) { console.error(`AK5e | Defender damage modifier ${entry.id}`, error); }
  }
}
export async function applyDamageHook(actor, amount, options) {
  const applied = options?.[KEY]?.[actor?.uuid];
  if (!applied?.length) return;
  delete options[KEY][actor.uuid];                // one application, one set of consequences
  const origin = damageOrigin(options);
  try {
    if (!actor.isOwner) return;
    for (const entry of applied) {
      const modifier = MODIFIERS.find(candidate => candidate.id === entry.id);
      if (!modifier?.applied) continue;
      try { await modifier.applied(actor, entry, { amount: Number(amount), origin, options }); }
      catch (error) {
        console.error(`AK5e | Defender damage modifier ${entry.id}`, error);
        globalThis.ui?.notifications?.error?.(`${entry.label}: ${error.message}`);
      }
    }
    await damageNote(actor, applied, origin);
  } finally {
    for (const entry of applied) if (entry.reserved) MODIFIERS.find(candidate => candidate.id === entry.id)?.release?.(actor, entry);
  }
}
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** A public note for changes that post no card of their own, so the table sees why the Damage changed. */
async function damageNote(actor, applied, origin) {
  const notes = applied.filter(entry => !MODIFIERS.find(candidate => candidate.id === entry.id)?.card);
  if (!notes.length || !globalThis.ChatMessage?.implementation) return;
  const lines = notes.map(entry => `${esc(entry.label)}: ${entry.before} → ${entry.after}${entry.before === entry.after ? " (already Resistant; used up)" : ""}`);
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<p><strong>AK5e Defender: Damage to ${esc(actor.name)}${origin ? ` from ${esc(origin.name)}` : ""}.</strong> ${lines.join("; ")}.</p><p>Damage Reduction is applied by hand and comes first: with DR, the result is the reduced Damage halved (rounded down). Correct Hit Points by hand if you apply DR.</p>`,
    flags: { ak5e: { defenderDamageNote: true } } });
}

let installed = false;
export function registerDefenderDamageHooks() {
  if (installed) return;
  installed = true;
  Hooks.on("dnd5e.calculateDamage", calculateDamageHook);
  Hooks.on("dnd5e.preApplyDamage", preApplyDamageHook);
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => { applyDamageHook(actor, amount, options).catch(error => console.error("AK5e | Defender damage", error)); });
}
