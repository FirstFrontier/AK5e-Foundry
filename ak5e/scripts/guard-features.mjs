/**
 * Guard class features (Ch.3 L1740-2201):
 * Aggression pool, Unrelenting pool, Annihilation Protocol, Eternal Aggression,
 * and 9 Fighting Styles. Follows WORKFLOW.md §3.2 and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardState, guardProfile, guardEnabled, guardLevel, guardBranch,
  aggressionMax, unrelentingMax, AGGRESSION_STEPS, UNRELENTING_STEPS, FIGHTING_STYLES
} from "./guard-rules.mjs";
import { definePool, getPool, getPoolDefinition, spendPool, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";
import { flag, values, need, keyedSerial } from "./operation-kernel.mjs";

export const serial = keyedSerial();
let installed = false;

export function defineGuardPools() {
  if (!getPoolDefinition("aggression")) {
    definePool({
      id: "aggression",
      label: "Aggression",
      max: { ...AGGRESSION_STEPS },
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => guardEnabled(actor),
      recovery: [
        { on: "sr", amount: "toMax" },
        { on: "lr", amount: "toMax" }
      ]
    });
  }
  if (!getPoolDefinition("unrelenting")) {
    definePool({
      id: "unrelenting",
      label: "Unrelenting",
      max: { ...UNRELENTING_STEPS },
      initial: "max",
      classId: GUARD_CLASS_ID,
      levelBasis: "classLevel",
      appliesTo: actor => guardEnabled(actor),
      recovery: [
        { on: "lr", amount: "toMax" }
      ]
    });
  }
}

export const aggression = actor => getPool(actor, "aggression");
export const spendAggression = (actor, amount, reason) => spendPool(actor, "aggression", amount, { reason });
export const refundAggression = (actor, amount, reason) => refundPool(actor, "aggression", amount, { reason });

export const unrelenting = actor => getPool(actor, "unrelenting");
export const spendUnrelenting = (actor, amount, reason) => spendPool(actor, "unrelenting", amount, { reason });
export const refundUnrelenting = (actor, amount, reason) => refundPool(actor, "unrelenting", amount, { reason });

export const ownTurn = actor => Boolean(globalThis.game?.combat?.started && globalThis.game.combat.combatant?.actor?.uuid === actor.uuid);

/** Read-only view for the sheet panel and public API. */
export function getGuardView(actor) {
  const state = guardState(actor);
  const profile = guardProfile(actor);
  const level = profile.level;
  return {
    profile,
    state,
    level,
    branch: profile.branch,
    aggression: profile.applicable ? aggression(actor) : null,
    unrelenting: level >= 3 ? unrelenting(actor) : null,
    fightingStyle: state.fightingStyle,
    manual: [
      "Press the Attack riders (Forestall, Smite, Strike True, Unrelenting Aggression) are confirmed before use and spend Aggression with durable receipts.",
      "Unrelenting Reaction is taken when another Creature ends their Turn; Pursuit Unrelenting allows spending 2 uses for an Action or Bonus Action.",
      "At 18th level, Eternal Aggression refunds 1d4 Aggression on using Unrelenting; at 20th level, Annihilation Protocol restores 1 Unrelenting on Initiative if none remain.",
      "Crusher, Centurion, and Instructor branch features register distinct use plans under the Guard panel."
    ]
  };
}

/* ---------------------------------------------------------------- Fighting Style Roll Hooks */

/**
 * Checks if the actor has a specific Guard Fighting Style chosen.
 */
export function hasFightingStyle(actor, styleKey) {
  const state = guardState(actor);
  if (state.fightingStyle === styleKey) return true;
  // Fallback: check if the character owns the corresponding feature item
  const style = FIGHTING_STYLES[styleKey];
  if (!style) return false;
  return values(actor.items).some(i => i.type === "feat" && (flag(i, "chapterThreeId") === style.id || i.name === style.name));
}

export function guardPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !guardEnabled(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll) return;
  const isMelee = activity.actionType === "mwak";
  const isRangedOrThrown = activity.actionType === "rwak" || Boolean(activity.item?.system?.properties?.has?.("thr"));

  // Lightly Armed: +2 to Attack Rolls with 1H melee weapon when wielding no other weapon or shield
  if (isMelee && hasFightingStyle(actor, "lightlyArmed")) {
    const equipped = values(actor.items).filter(i => i.type === "weapon" || i.type === "equipment");
    const wieldedWeapons = equipped.filter(i => i.type === "weapon" && i.system?.equipped);
    const wieldedShields = equipped.filter(i => i.type === "equipment" && i.system?.type?.value === "shield" && i.system?.equipped);
    if (wieldedWeapons.length === 1 && wieldedShields.length === 0) {
      const isTwoHanded = wieldedWeapons[0].system?.properties?.has?.("two");
      if (!isTwoHanded) {
        roll.parts.push("2");
      }
    }
  }

  // Ranger: +2 to Attack Rolls with Ranged or Thrown Weapons
  if (isRangedOrThrown && hasFightingStyle(actor, "ranger")) {
    roll.parts.push("2");
  }

  // Deadly Fighter: first attack roll each turn with Deadly weapon gets +1 critical range
  if (hasFightingStyle(actor, "deadlyFighter")) {
    const isDeadly = Boolean(activity.item?.system?.properties?.has?.("deadly") || flag(activity.item, "deadly"));
    if (isDeadly) {
      roll.options ??= {};
      roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
    }
  }
}

export function guardPreRollDamage(config, _dialog, _message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !guardEnabled(actor)) return;
  const roll = config.rolls?.[0];
  if (!roll?.parts) return;
  const isMelee = activity.actionType === "mwak";

  // Great Weapon Fighting: +2 bonus to damage with melee weapons wielded with two hands (two-handed or versatile)
  if (isMelee && hasFightingStyle(actor, "greatWeaponFighting")) {
    const weapon = activity.item;
    const props = weapon?.system?.properties;
    const isTwoHandedOrVersatile = props?.has?.("two") || props?.has?.("ver");
    if (isTwoHandedOrVersatile) {
      roll.parts.push("2");
    }
  }

  // Spearwall: when making a melee attack while not your turn, deal 1 additional damage die
  if (isMelee && hasFightingStyle(actor, "spearwall") && !ownTurn(actor)) {
    const formula = activity.item?.system?.damage?.base?.formula || activity.damage?.parts?.[0]?.formula || "1d8";
    const dieMatch = formula.match(/d(\d+)/);
    const faces = dieMatch ? dieMatch[1] : "8";
    roll.parts.push(`1d${faces}`);
  }
}

/* ---------------------------------------------------------------- Registration */

export function registerGuardFeatureHooks() {
  if (installed) return;
  installed = true;

  defineGuardPools();

  // Annihilation Protocol (Guard 20th level): regain 1 use of Unrelenting on Initiative if at 0
  onAk5eEvent("initiative", async actor => {
    if (!guardEnabled(actor)) return;
    const level = guardLevel(actor);
    if (level === 20) {
      const unrel = unrelenting(actor);
      if (unrel && unrel.value === 0) {
        await refundUnrelenting(actor, 1, "Annihilation Protocol");
      }
    }
  });

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", guardPreRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", guardPreRollDamage);
  }
}

export const registerGuardHooks = registerGuardFeatureHooks;

defineGuardPools();
