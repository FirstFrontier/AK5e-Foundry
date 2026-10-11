/** Juggernaut controls in the Defender panel (WORKFLOW.md §3.2: every use confirms first and posts a public card). */
import { registerDefenderForms, registerDefenderNotices } from "./defender-sheet.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { defenderLevel } from "./defender-rules.mjs";
import { isJuggernaut, heavyArmour, barrierLayers, barrierHolds } from "./juggernaut-features.mjs";
import { getPool, getPoolDefinition } from "./resource-pools.mjs";

registerDefenderForms({
  reformBarrier: { label: "Reform a Barrier layer", branch: "juggernaut", anyLevel: true, engine: defenderUses,
    intro: "Superheavy: while you wear Heavy Armour, Damage you would take from another Creature is halved and a layer of your Arts Barrier shatters (applied automatically when Damage is applied from a chat card). Reform a layer as an Action during your Turn, or as a Bonus Action by expending 1 Resilience.",
    fields: () => [{ name: "bonusAction", type: "check", label: "Reform as a Bonus Action (1 Resilience)" }] },
  bullrush: { label: "Bullrush", branch: "juggernaut", anyLevel: true, engine: defenderUses,
    intro: "Action during your Turn: move in a straight line to a point you can see within 30 feet, through Creatures and objects your size or smaller. Each one moved through makes a Dexterity Saving Throw: 4d12 Bludgeoning Damage and knocked 10 feet away on a failure, half Damage on a success. Once per Short Rest; 2 Resilience restores it. Move tokens by hand.", fields: () => [] },
  restoreBullrush: { label: "Restore Bullrush (2 Resilience)", branch: "juggernaut", anyLevel: true, engine: defenderUses,
    intro: "No Action required: expend 2 Resilience to restore your use of Bullrush.", fields: () => [] },
  groundbreaker: { label: "Groundbreaker", branch: "juggernaut", anyLevel: true, engine: defenderUses,
    intro: "Action, once per Long Rest: all other Creatures touching the ground within 30 feet make a Strength Saving Throw against your Martial DC, taking 8d12 Thunder Damage on a failure or half on a success. The area becomes Difficult Terrain for anyone except you.", fields: () => [] }
});

/** Panel status: layers, Heavy Armour, uses, and the Rolling Boulder reminder (manual). */
export function juggernautNotices(actor) {
  if (!isJuggernaut(actor) || !getPoolDefinition("barrierLayers")) return [];
  const layers = barrierLayers(actor), armour = heavyArmour(actor), level = defenderLevel(actor), notes = [];
  notes.push(`Barrier layers ${layers.value} / ${layers.max}${armour ? ` · ${armour.name}` : " · no Heavy Armour worn: the Barrier does not protect you"}${level >= 12 && barrierHolds(actor) ? " · Overwhelming Might active" : ""}`
    + (level >= 9 ? ` · Bullrush ${getPool(actor, "bullrush").value ? "ready" : "used"}` : "") + (level >= 15 ? ` · Groundbreaker ${getPool(actor, "groundbreaker").value ? "ready" : "used"}` : ""));
  if (level >= 4) notes.push("Rolling Boulder: your Speed cannot be reduced by another Creature, and Conditions do not reduce your Speed. Undo such Speed reductions by hand.");
  return notes;
}
let installed = false;
export function registerJuggernautSheetHooks() {
  if (installed) return;
  installed = true;
  registerDefenderNotices(juggernautNotices);
}
