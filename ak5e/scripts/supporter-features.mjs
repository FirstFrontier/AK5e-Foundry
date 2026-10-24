/** Supporter runtime features and mechanical hooks (Ch. 3 L6548–6692).
 * Provide Aid, Advanced Aid riders, Lighten the Load, Ever Reliable,
 * Self-Supportive, and Will Into Being.
 */
import {
  supporterLevel, supporterEnabled, checkLevel, pbForLevel, flag,
  aidDieSize, supporterState
} from "./supporter-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool, recoverPool } from "./resource-pools.mjs";
import { need, opaqueKey } from "./operation-kernel.mjs";
import { spendReaction, getReactions } from "./trigger-events.mjs";

let hooksInstalled = false;

export function hasProvideAid(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 1);
}

export function hasAdvancedAid(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 5);
}

export function hasLightenTheLoad(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 11);
}

export function hasEverReliable(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 15);
}

export function hasSelfSupportive(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 18);
}

export function hasWillIntoBeing(actor) {
  const lvl = supporterLevel(actor);
  return Boolean(lvl && lvl >= 20);
}

export function willIntoBeingBonus(actor) {
  if (!hasWillIntoBeing(actor)) return 0;
  const lvl = supporterLevel(actor);
  return pbForLevel(lvl);
}

export function defineSupporterPools() {
  if (!getPoolDefinition("aidDie")) {
    definePool({
      id: "aidDie",
      label: "Aid Dice",
      max: "max(1, max(@abilities.int.mod, max(@abilities.wis.mod, @abilities.cha.mod)))",
      initial: "max",
      classId: "class-supporter",
      levelBasis: "classLevel",
      appliesTo: supporterEnabled,
      recovery: [{ on: "lr", amount: "full" }]
    });
  }
}

export function hasSelfSupportDie(actor) {
  return Boolean(flag(actor, "supporter")?.selfSupportDie);
}

export async function consumeSelfSupportDie(actor) {
  await actor.update({ "flags.ak5e.supporter.selfSupportDie": false });
}

export async function onSupporterRest(actor, restType) {
  if (!supporterEnabled(actor)) return;
  if (restType === "short" && hasEverReliable(actor)) {
    const pool = getPool(actor, "aidDie");
    const halfMax = Math.ceil(pool.max / 2);
    if (halfMax > 0) {
      await refundPool(actor, "aidDie", halfMax, { reason: "Ever Reliable Short Rest" });
    }
  }
}

export async function onSupporterTurnStart(actor) {
  if (!supporterEnabled(actor)) return;
  // Ever Reliable: If turn begins and you have no Aid Dice remaining, regain 1 Aid Die.
  if (hasEverReliable(actor)) {
    const pool = getPool(actor, "aidDie");
    if (pool.value === 0) {
      await refundPool(actor, "aidDie", 1, { reason: "Ever Reliable Turn Start" });
    }
  }
  // Self-Supportive: Gain personal Aid Die at turn start
  if (hasSelfSupportive(actor)) {
    await actor.update({ "flags.ak5e.supporter.selfSupportDie": true });
  }
}

export function registerSupporterHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineSupporterPools();

  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
      onSupporterRest(actor, type);
    });
  }
}
