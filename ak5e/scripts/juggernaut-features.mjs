/**
 * Defender › Juggernaut (Ch.3 L1591–1623), following WORKFLOW.md §3.2 through the Defender use engine (defender-uses.mjs):
 * - Superheavy: Barrier layers (1 / 2 at 7th / 3 at 14th) while wearing Heavy Armour. Damage from another Creature applied
 *   from a chat card is halved and a layer shatters (defender-damage-mods.mjs); the shatter is an undoable automatic use.
 *   Reform a layer as an Action, or as a Bonus Action for 1 Resilience.
 * - Implacable: Shatterstorm (1d8 + Constitution Modifier Force from the shatter card's Roll button); Rolling Boulder is a
 *   printed reminder (D&D5e derives condition Speed itself).
 * - Bullrush and Groundbreaker: cards with a native save link and a Roll button; movement and terrain stay manual.
 * - Overwhelming Might: an extra Force die on Melee Attacks while any layer holds.
 */
import { defenderLevel, defenderBranch, barrierMax } from "./defender-rules.mjs";
import { defenderEnabled, ownTurn } from "./defender-features.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { martialDC } from "./fortress-features.mjs";
import { registerDamageModifier, sameCreature } from "./defender-damage-mods.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { values, esc } from "./operation-kernel.mjs";

export const JUGGERNAUT_FEATURES = Object.freeze({
  superheavy: "subclass-feature-defender-juggernaut-1st-level-superheavy-267",
  implacable: "subclass-feature-defender-juggernaut-4th-level-implacable-893",
  bullrush: "subclass-feature-defender-juggernaut-9th-level-bullrush-1376",
  overwhelmingMight: "subclass-feature-defender-juggernaut-12th-level-overwhelming-might-2074",
  groundbreaker: "subclass-feature-defender-juggernaut-15th-level-groundbreaker-2223"
});
const LAYERS = "flags.ak5e.resourcePools.barrierLayers.value";

export const isJuggernaut = actor => defenderEnabled(actor) && defenderBranch(actor) === "juggernaut";
/** Equipped Heavy Armour (D&D5e equipment type "heavy"); Superheavy works only while it is worn. */
export const heavyArmour = actor => values(actor?.items).find(item => item.type === "equipment" && item.system?.equipped === true && item.system?.type?.value === "heavy") ?? null;
export const barrierLayers = actor => getPool(actor, "barrierLayers");
/** Layers protect (and Overwhelming Might applies) only while Heavy Armour is worn; taking it off suspends them. */
export const barrierHolds = actor => isJuggernaut(actor) && Boolean(heavyArmour(actor)) && barrierLayers(actor).value > 0;
const levelWarning = (warnings, actor, level, name) => {
  if (defenderLevel(actor) < level) warn(warnings, "level", `${name} is a Juggernaut level ${level} feature; this Defender is level ${defenderLevel(actor)}.`);
};
const turnWarning = (warnings, actor, name) => {
  if (game.combat?.started && !ownTurn(actor)) warn(warnings, "turn", `${name} is used during your Turn, and it is not your Turn.`);
};
const signed = n => n < 0 ? `- ${-n}` : `+ ${n}`;
const saveLink = (ability, dc) => `[[/save ability=${ability} dc=${dc}]]`;

/* ---------------------------------------------------------------- use plans */

const PLANS = {
  /** Automatic: recorded by the damage hook when a layer halved an instance of Damage. */
  barrierShatter(actor, _state, data) {
    const con = Number(actor.system?.abilities?.con?.mod ?? 0), shatterstorm = defenderLevel(actor) >= 4;
    return { warnings: [], title: "Superheavy: a Barrier layer shatters", apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "barrierLayers", amount: 1, label: "Barrier layer" });
      const from = data.originName ? ` from ${esc(data.originName)}` : "";
      receipt.html = true;
      receipt.summary = `A layer of ${esc(actor.name)}'s Arts Barrier shattered, halving that instance of Damage${from} (${Number(data.before) || 0} → ${Number(data.after) || 0}). Layers left: ${receipt.resources[0].after} / ${getPool(actor, "barrierLayers").max}.`
        + (shatterstorm ? ` Shatterstorm: roll 1d8 ${signed(con)} Force Damage from this card and apply it to Creatures of your choice within 10 feet.` : "")
        + " Damage Reduction is applied by hand and comes first: with DR, the Damage taken is the reduced Damage halved (rounded down); correct Hit Points by hand."
        + " Undoing this restores the layer; it does not change Hit Points.";
      if (shatterstorm) {
        receipt.damageParts = [{ formula: `1d8 ${signed(con)}`, type: "force" }];
        receipt.formula = receipt.damageParts[0].formula; receipt.rollLabel = "Force Damage"; receipt.rollFlavor = "Shatterstorm (Creatures of your choice within 10 feet)";
      }
      receipt.result = { layers: receipt.resources[0].after, shatterstorm };
      return updates;
    } };
  },
  reformBarrier(actor, _state, data) {
    const bonus = data.bonusAction === true, pool = barrierLayers(actor), warnings = [];
    turnWarning(warnings, actor, "Reforming a Barrier layer");
    if (!heavyArmour(actor)) warn(warnings, "armour", "You are not wearing Heavy Armour, so the Barrier does not protect you until you put it on.");
    if (pool.value >= pool.max) warn(warnings, "full", `The Barrier already has its maximum of ${pool.max} layer${pool.max === 1 ? "" : "s"}; nothing is reformed.`);
    if (bonus && resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "Reforming as a Bonus Action costs 1 Resilience and none remain; Resilience stays at 0.");
    return { warnings, title: "Reform a Barrier layer", apply(_next, receipt) {
      const updates = bonus ? spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" }) : {};
      const after = Math.min(pool.max, pool.value + 1);
      receipt.resources = [...(receipt.resources ?? []), { pool: "barrierLayers", path: LAYERS, before: pool.value, after, max: pool.max, label: "Barrier layer" }];
      receipt.summary = `${actor.name} reforms a layer of the Arts Barrier (${bonus ? "Bonus Action, 1 Resilience" : "Action"}): ${pool.value} → ${after} of ${pool.max}.`;
      receipt.result = { layers: after };
      return { ...updates, [LAYERS]: after };
    } };
  },
  bullrush(actor) {
    const warnings = [], dc = martialDC(actor);
    levelWarning(warnings, actor, 9, "Bullrush");
    turnWarning(warnings, actor, "Bullrush");
    if (resourceValue(actor, { pool: "bullrush" }) < 1) warn(warnings, "used", "Bullrush has been used; restore it with a Short Rest or 2 Resilience. The count stays at 0.");
    return { warnings, title: "Bullrush", apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "bullrush", amount: 1, label: "Bullrush use" });
      receipt.damageParts = [{ formula: "4d12", type: "bludgeoning" }];
      receipt.formula = "4d12"; receipt.rollLabel = "Bludgeoning Damage"; receipt.rollFlavor = "Bullrush (failed save: full, knocked 10 feet away; success: half)";
      receipt.html = true;
      receipt.summary = `Action: ${esc(actor.name)} moves in a straight line to a point they can see within 30 feet, through Creatures and objects of their size or smaller. Each Creature or Object moved through makes ${saveLink("dex", dc)} (Martial DC; the source gives no DC). Failed: 4d12 Bludgeoning Damage and knocked 10 feet directly away. Success: half Damage, no knockback. Move the tokens by hand; roll the Damage from this card and apply it with the native damage controls.`;
      receipt.result = { dc };
      return updates;
    } };
  },
  restoreBullrush(actor) {
    const warnings = [];
    levelWarning(warnings, actor, 9, "Bullrush");
    if (resourceValue(actor, { pool: "bullrush" }) >= getPool(actor, "bullrush").max) warn(warnings, "unused", "Bullrush has not been used; nothing to restore.");
    if (resourceValue(actor, { pool: "resilience" }) < 2) warn(warnings, "resilience", `Restoring Bullrush costs 2 Resilience and ${resourceValue(actor, { pool: "resilience" })} remain; Resilience stays at 0.`);
    return { warnings, title: "Restore Bullrush", apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "resilience", amount: 2, label: "Resilience" });
      const pool = getPool(actor, "bullrush");
      receipt.resources.push({ pool: "bullrush", path: "flags.ak5e.resourcePools.bullrush.value", before: pool.value, after: pool.max, max: pool.max, label: "Bullrush use" });
      receipt.summary = `${actor.name} expends 2 Resilience (no Action required) to restore their use of Bullrush.`;
      receipt.result = { restored: true };
      return { ...updates, "flags.ak5e.resourcePools.bullrush.value": pool.max };
    } };
  },
  groundbreaker(actor) {
    const warnings = [], dc = martialDC(actor);
    levelWarning(warnings, actor, 15, "Groundbreaker");
    if (resourceValue(actor, { pool: "groundbreaker" }) < 1) warn(warnings, "used", "Groundbreaker has been used since your last Long Rest; the count stays at 0.");
    return { warnings, title: "Groundbreaker", apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "groundbreaker", amount: 1, label: "Groundbreaker use" });
      receipt.damageParts = [{ formula: "8d12", type: "thunder" }];
      receipt.formula = "8d12"; receipt.rollLabel = "Thunder Damage"; receipt.rollFlavor = "Groundbreaker (failed save: full; success: half)";
      receipt.html = true;
      receipt.summary = `Action: all other Creatures touching the ground within 30 feet of ${esc(actor.name)} make ${saveLink("str", dc)} (Martial DC). Failed: 8d12 Thunder Damage; success: half. The area is then Difficult Terrain for anyone except ${esc(actor.name)} (mark it by hand). Roll the Damage from this card and apply it with the native damage controls.`;
      receipt.result = { dc };
      return updates;
    } };
  }
};
/* ---------------------------------------------------------------- Superheavy in native damage application */

/** Layers reserved by applications whose shatter is not saved yet (this client only); see preApplyDamageHook. */
const inFlight = new Map();
const reserved = actor => inFlight.get(actor.uuid)?.size ?? 0;
const superheavy = {
  id: "superheavy", order: 80, card: true,
  calculate(actor, _damages, { origin }) {
    if (!barrierHolds(actor) || sameCreature(origin, actor) || barrierLayers(actor).value - reserved(actor) < 1) return null;
    return { effect: "halve", label: "Superheavy", record: { originName: origin.name } };
  },
  reserve(actor, entry) {
    const token = (entry.reservation = globalThis.foundry?.utils?.randomID?.() ?? String(Math.random()));
    if (!inFlight.has(actor.uuid)) inFlight.set(actor.uuid, new Set());
    inFlight.get(actor.uuid).add(token);
    // A cancelled application never reaches applyDamage: release the reservation after a while.
    setTimeout(() => inFlight.get(actor.uuid)?.delete(token), 15000);
  },
  release(actor, entry) { inFlight.get(actor.uuid)?.delete(entry.reservation); },
  async applied(actor, entry) {
    if (!isJuggernaut(actor)) return;
    const id = `shatter-${globalThis.foundry.utils.randomID()}`;
    await defenderUses.command(actor, "barrierShatter", { confirmed: true, originName: entry.record?.originName ?? null, before: entry.before, after: entry.after }, id);
  }
};

/* ---------------------------------------------------------------- Overwhelming Might */

/** dnd5e.preRollDamageV2: while any layer holds, Melee Attacks deal an additional die of Damage as Force Damage. */
export function overwhelmingMightHook(config) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isJuggernaut(actor) || defenderLevel(actor) < 12 || !barrierHolds(actor)) return;
  if (activity.type !== "attack" || activity.attack?.type?.value !== "melee") return;
  const first = config.rolls?.[0];
  const faces = Number(String(first?.parts?.[0] ?? "").match(/\d*d(\d+)/)?.[1] ?? activity.item?.system?.damage?.base?.denomination);
  if (!first || !Number.isInteger(faces) || faces < 2) {
    globalThis.ui?.notifications?.info?.("Overwhelming Might: add one more die of this weapon's Damage as Force Damage.");
    return;
  }
  config.rolls.push({ parts: [`1d${faces}`], data: first.data, options: { ...structuredClone(first.options ?? {}), type: "force", types: ["force"] } });
  globalThis.ui?.notifications?.info?.(`Overwhelming Might: +1d${faces} Force Damage while your Barrier holds.`);
}

export function registerJuggernaut() {
  if (!getPoolDefinition("barrierLayers")) definePool({ id: "barrierLayers", label: "Barrier layers", max: { 1: 1, 7: 2, 14: 3 }, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: isJuggernaut, recovery: [] });
  if (!getPoolDefinition("bullrush")) definePool({ id: "bullrush", label: "Bullrush", max: { 1: 0, 9: 1 }, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: isJuggernaut, recovery: [{ on: "sr", amount: "full" }] });
  if (!getPoolDefinition("groundbreaker")) definePool({ id: "groundbreaker", label: "Groundbreaker", max: { 1: 0, 15: 1 }, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: isJuggernaut, recovery: [{ on: "lr", amount: "full" }] });
  defenderUses.register({ plans: PLANS });
  registerDamageModifier(superheavy);
}
export function registerJuggernautHooks() {
  registerJuggernaut();
  Hooks.on("dnd5e.preRollDamageV2", overwhelmingMightHook);
}
export { barrierMax };
