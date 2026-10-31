/**
 * Guard class features (Ch.3 L1740-2201):
 * Aggression pool, Unrelenting pool, Annihilation Protocol, Eternal Aggression,
 * and 9 Fighting Styles. Follows WORKFLOW.md §3.2 and resource-pools.mjs.
 */
import {
  GUARD_CLASS_ID, guardState, guardProfile, guardEnabled, guardLevel, guardBranch, martialDC, martialDCChoice,
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
    martialDC: martialDC(actor),
    martialDCAbility: martialDCChoice(actor),
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

  // Deadly Fighter (L1843): the first time each Turn you make an Attack Roll with a Deadly weapon, +1 Critical Range.
  if (hasFightingStyle(actor, "deadlyFighter")) {
    const isDeadly = Boolean(activity.item?.system?.properties?.has?.("deadly") || flag(activity.item, "deadly"));
    if (isDeadly) applyDeadlyFighter(actor, activity, roll);
  }
}

/** Combat turn slot ("combat:round:turn"), or null outside a started combat. */
export const currentTurnKey = () => {
  const combat = globalThis.game?.combat;
  return combat?.started && combat.round != null && combat.turn != null ? `${combat.uuid ?? combat.id ?? "combat"}:${combat.round}:${combat.turn}` : null;
};

// Deadly Fighter's once-per-Turn ledger. An attack is only counted when its roll was actually made (postRollAttack), so
// cancelling the roll dialog does not use the benefit up. The pending entry ties the bonus to the one weapon it was offered on.
const deadlyFighterTurn = new Map();
const deadlyFighterPending = new Map();
const actorKey = actor => actor?.uuid ?? actor?.id ?? actor?.name;
const itemKey = item => item?.uuid ?? item?.id ?? item?.name ?? null;

/** The first Deadly attack roll each combat Turn gets +1 Critical Range; later ones in the same Turn do not. Outside a
 * started combat there is no Turn to count, so the bonus applies to this roll (once, never stacked) with a warning. */
function applyDeadlyFighter(actor, activity, roll) {
  roll.options ??= {};
  if (roll.options.ak5eDeadlyFighter) return;   // this roll already has it; never stack
  const key = currentTurnKey();
  if (key) {
    if (deadlyFighterTurn.get(actorKey(actor)) === key) return;
    deadlyFighterPending.set(actorKey(actor), { cycle: key, itemKey: itemKey(activity.item) });
  } else {
    globalThis.ui?.notifications?.warn?.("Deadly Fighter: +1 Critical Range applies to the first Deadly attack each Turn. There is no combat Turn to count, so it was applied to this attack; apply it once per Turn.");
  }
  roll.options.ak5eDeadlyFighter = key ?? "outOfCombat";
  roll.options.criticalSuccess = Math.min(Number(roll.options.criticalSuccess ?? 20) - 1, 19);
}

/** `dnd5e.postRollAttack`: the roll was made, so this Turn's Deadly Fighter benefit is used. */
export function guardPostRollAttack(_rolls, { subject } = {}) {
  const actor = subject?.actor, key = currentTurnKey();
  if (!actor || !key) return;
  const pending = deadlyFighterPending.get(actorKey(actor));
  if (pending?.cycle !== key || pending.itemKey !== itemKey(subject.item)) return;
  deadlyFighterTurn.set(actorKey(actor), key);
  deadlyFighterPending.delete(actorKey(actor));
}

/** Test helper: forget the Deadly Fighter ledger. */
export function resetDeadlyFighterLedger() { deadlyFighterTurn.clear(); deadlyFighterPending.clear(); }

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

/* ---------------------------------------------------------------- Annihilation Protocol */

/** Annihilation Protocol (20th level, L1948): when you roll Initiative with no uses of Unrelenting remaining, regain one.
 * Runs once per combat for an Actor, so editing an Initiative value afterwards does not refund again. */
export async function annihilationProtocol(event) {
  const actor = event?.raw?.actor ?? (event?.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null);
  if (!actor || !guardEnabled(actor) || guardLevel(actor) !== 20) return null;
  const pool = unrelenting(actor);
  if (!pool || pool.value !== 0) return null;
  const combatUuid = event.combatUuid ?? null;
  if (combatUuid && flag(actor, "guard")?.annihilationProtocolCombat === combatUuid) return null;
  const result = await refundUnrelenting(actor, 1, "Annihilation Protocol");
  if (combatUuid) await actor.update({ "flags.ak5e.guard.annihilationProtocolCombat": combatUuid });
  return result;
}

/* ---------------------------------------------------------------- Registration */

export function registerGuardFeatureHooks() {
  if (installed) return;
  installed = true;

  defineGuardPools();

  // Annihilation Protocol (Guard 20th level): regain 1 use of Unrelenting on Initiative if at 0
  // The handler receives the frozen event payload, not the Actor: the live Actor is event.raw.actor.
  onAk5eEvent("initiative", annihilationProtocol);

  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.preRollAttackV2", guardPreRollAttack);
    Hooks.on("dnd5e.postRollAttack", guardPostRollAttack);
    Hooks.on("dnd5e.preRollDamageV2", guardPreRollDamage);
  }
}

export const registerGuardHooks = registerGuardFeatureHooks;

defineGuardPools();
