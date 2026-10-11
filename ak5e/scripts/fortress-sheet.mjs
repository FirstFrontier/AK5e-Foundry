/** Fortress controls in the Defender panel (WORKFLOW.md §3.2: every use confirms first and posts a public card). */
import { registerDefenderForms, registerDefenderNotices } from "./defender-sheet.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { shelterCandidates } from "./defender-features.mjs";
import { defenderLevel, munitionDie } from "./defender-rules.mjs";
import { MUNITIONS, isFortress, isLauncher, loadedMunitions, entrenched } from "./fortress-features.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";

const list = collection => Array.from(collection?.values?.() ?? collection ?? []);
const launchers = actor => list(actor.items).filter(isLauncher).sort((a, b) => Number(b.system?.equipped === true) - Number(a.system?.equipped === true));
function creatures(actor) {
  const own = list(actor.getActiveTokens?.(true, true)).map(t => t.document ?? t)[0], seen = new Set(), options = [];
  for (const token of [...list(game.user?.targets), ...list(own?.parent?.tokens)]) {
    const doc = token.document ?? token, uuid = doc.actor?.uuid;
    if (uuid && uuid !== actor.uuid && !seen.has(uuid)) { seen.add(uuid); options.push([uuid, doc.name ?? doc.actor.name]); }
  }
  return options;
}
const munitionLabel = (actor, key) => `${MUNITIONS[key].name}: ${MUNITIONS[key].dice}d${munitionDie(defenderLevel(actor))} ${MUNITIONS[key].type ?? "Acid, Fire or Thunder"}`;

registerDefenderForms({
  entrench: { label: "Entrench", branch: "fortress", anyLevel: true, engine: defenderUses,
    intro: "At the beginning of your Turn: Entrench at your position until the beginning of your next Turn. Your Speed becomes 0 (reduced by 20 feet from 9th level). From 9th level, the native adjustment affects walking Speed; reduce any other movement speeds manually. While Entrenched: Barrage and Danger Close.", fields: () => [] },
  loadMunition: { label: "Load a Munition", branch: "fortress", anyLevel: true, engine: defenderUses,
    intro: "As an Action with a Grenade or Rocket Launcher equipped (or a Bonus Action for 1 Resilience): expend 1 Munitions Die to load a Munition. Up to your Proficiency Bonus per weapon, never the same Munition twice. Loaded Munitions are lost if you unequip the weapon or become Incapacitated.",
    fields: actor => [{ name: "weaponId", type: "select", label: "Launcher", options: launchers(actor).map(item => [item.id, `${item.name}${item.system?.equipped ? "" : " (not equipped)"} — loaded: ${(loadedMunitions(actor)[item.id] ?? []).map(key => MUNITIONS[key].name).join(", ") || "none"}`]) },
      { name: "munition", type: "select", label: "Munition", options: Object.keys(MUNITIONS).map(key => [key, munitionLabel(actor, key)]) },
      { name: "bonusAction", type: "check", label: "Load as a Bonus Action (1 Resilience)" }] },
  fireMunitions: { label: "Fire Munitions", branch: "fortress", anyLevel: true, engine: defenderUses,
    intro: "When you take the Attack Action: fire all Munitions loaded into a launcher at a point within 100 feet (15-foot radius; place it manually with Foundry's template tools). Stop their Advance (12th): as a Reaction for 1 Resilience when a Creature you can see moves within 100 feet, aim as close to it as possible. The Reaction budget is tracked and can be restored by undoing this use before your next Turn.",
    fields: actor => [{ name: "weaponId", type: "select", label: "Launcher", options: launchers(actor).filter(item => (loadedMunitions(actor)[item.id] ?? []).length).map(item => [item.id, `${item.name} — ${(loadedMunitions(actor)[item.id] ?? []).map(key => MUNITIONS[key].name).join(", ")}`]) },
      { name: "mode", type: "select", label: "How", options: [["attack", "Attack Action"], ["stopTheirAdvance", "Stop their Advance (Reaction, 1 Resilience)"]] },
      { name: "triggerId", type: "text", label: "Stop their Advance: movement trigger (short label; same trigger cannot spend another Reaction)" },
      { name: "triggerConfirmed", type: "check", label: "I can see a Creature moving within 100 feet of me" },
      { name: "explosiveType", type: "select", label: "Explosive Munition Damage type (if loaded)", options: [["thunder", "Thunder"], ["fire", "Fire"], ["acid", "Acid"]] },
      { name: "dangerClose", type: "checks", label: `Danger Close (while Entrenched${entrenched(actor) ? "" : " — you are not Entrenched"}): Creatures that automatically succeed`, options: creatures(actor) },
      { name: "pointConfirmed", type: "check", label: "The point is within 100 feet (if I cannot see it, neither I nor it is under a roof)" }] },
  munitionEffects: { label: "Munition effects on a failed save", branch: "fortress", anyLevel: true, engine: defenderUses,
    intro: "Apply all loaded Munitions' additional effects to one Creature that failed its Dexterity Saving Throw.",
    fields: actor => [{ name: "fireId", type: "select", label: "Volley", options: (defenderUses.state(actor).data.fired ?? []).slice().reverse().filter(entry => entry.munitions.some(key => MUNITIONS[key]?.rider))
      .map(entry => [entry.id, `${entry.munitions.map(key => MUNITIONS[key].name).join(", ")} (DC ${entry.dc})`]) },
      { name: "targetUuid", type: "select", label: "Creature that failed", options: creatures(actor) },
      { name: "failedSave", type: "check", label: "This Creature failed its Dexterity Saving Throw" }] },
  fortification: { label: "Fortification: Shelter (no Action)", branch: "fortress", anyLevel: true, engine: defenderUses,
    intro: "Stronghold (12th): once per Turn while Entrenched, take the Shelter Action without expending an Action.",
    fields: actor => [{ name: "allies", type: "tokens", label: "Allied Creatures (nearby ones are pre-checked; you decide who is an ally)", options: shelterCandidates(actor).map(t => [t.uuid, `${t.name}${t.within ? " — within 5 ft" : ""}`, t.within]) },
      { name: "alliesConfirmed", type: "check", label: "I confirm every checked Creature is my ally" }] }
});

let installed = false;
export function registerFortressSheetHooks() {
  if (installed) return;
  installed = true;
  registerDefenderNotices(actor => {
    if (!isFortress(actor) || !getPoolDefinition("munitionsDice")) return [];
    const dice = getPool(actor, "munitionsDice"), loaded = Object.entries(loadedMunitions(actor)).filter(([, keys]) => keys.length);
    return [`Munitions Dice ${dice.value} / ${dice.max} (d${munitionDie(defenderLevel(actor))})${entrenched(actor) ? " · Entrenched" : ""}${loaded.length ? ` · Loaded: ${loaded.map(([id, keys]) => `${actor.items.get?.(id)?.name ?? "launcher"} (${keys.map(key => MUNITIONS[key].name).join(", ")})`).join("; ")}` : ""}`];
  });
}
