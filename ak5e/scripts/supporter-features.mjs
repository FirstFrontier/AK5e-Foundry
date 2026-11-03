/** Supporter runtime features and mechanical hooks (Ch. 3 L6548–6692).
 * Aid Die pool and Aid Die effects, Provide Aid helpers, Advanced Aid riders, Lighten the Load,
 * Ever Reliable, Self-Supportive and Will Into Being. Dice are rolled only on a user's click.
 */
import { supporterLevel, supporterEnabled, pbForLevel, flag, aidDieSize, aidDieMax } from "./supporter-rules.mjs";
import { definePool, getPool, getPoolDefinition, refundPool } from "./resource-pools.mjs";
import { need, values, esc } from "./operation-kernel.mjs";
import { spendResource } from "./play-uses.mjs";
import { onAk5eEvent, registerRider, removeRider, riderRecords } from "./trigger-events.mjs";
import { renderAidCardButtons } from "./supporter-uses.mjs";

/** The flag the Supporter Uses engine stamps on its Active Effects (`${ns}Effect`, ns "supporterUses"). */
export const AID_DIE_EFFECT_FLAG = "supporterUsesEffect";
const AID_CRIT_PREFIX = "aidcrit-";
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

/** Aid Die roll formula by Supporter level: 1d8 (1–6), 1d10 (7–13), 1d12 (14–20). */
export function aidDieFormula(actor) {
  const level = supporterLevel(actor) ?? 1;
  return `1${aidDieSize(level)}`;
}

/** Resolve a UUID to an Actor (a Token resolves to its Actor). Synchronous; null when unknown. */
export function actorFromUuid(uuid) {
  if (!uuid) return null;
  const doc = globalThis.fromUuidSync?.(uuid) ?? globalThis.game?.actors?.get?.(uuid) ?? null;
  if (!doc) return null;
  return doc.documentName === "Token" ? (doc.actor ?? null) : doc;
}

/** The Aid Die Active Effect a creature holds (created by Provide Aid or Lighten the Load), or null. */
export function findAidDieEffect(target) {
  return values(target?.effects).find(effect => flag(effect, AID_DIE_EFFECT_FLAG)?.aidDie === true) ?? null;
}

export function defineSupporterPools() {
  if (!getPoolDefinition("aidDie")) {
    definePool({
      id: "aidDie",
      label: "Aid Dice",
      // R1: the chosen INT/WIS/CHA modifier, no floor of 1; 0 or less warns and the GM resolves.
      max: aidDieMax,
      initial: "max",
      classId: "class-supporter",
      levelBasis: "classLevel",
      appliesTo: supporterEnabled,
      recovery: [{ on: "lr", amount: "full" }]
    });
  }
}

/** Staging helper: spends Aid Dice from the aidDie pool, clamps at 0, records any shortfall, and returns the update. */
export function spendAidDice(actor, amount, receipt) {
  need(Number.isInteger(amount) && amount >= 0, "Aid Dice spent must be a whole number of 0 or more.");
  return spendResource(actor, receipt, { pool: "aidDie", amount, label: "Aid Die" });
}

/**
 * Chat-card markup with the roll buttons for an Aid Die. Never rolls: each button is wired by
 * renderAidCardButtons, and a click is the only thing that rolls.
 */
export function rollAidDieButton({ actor, label = "Roll Aid Die", formula = aidDieFormula(actor), rollType = "", extra = {} } = {}) {
  // The use id is not embedded: the click handler reads it from the chat message flags (play-uses cardFlag).
  const common = `data-actor="${esc(actor?.uuid)}"`;
  const buttons = [`<button type="button" data-ak5e-aid-roll="${esc(formula)}" ${common}>${esc(label)}</button>`];
  if (extra.willIntoBeingPB > 0) {
    buttons.push(`<button type="button" data-ak5e-will-into-being="${Number(extra.willIntoBeingPB)}" ${common}>+${Number(extra.willIntoBeingPB)} (Will Into Being)</button>`);
  }
  for (const rider of extra.riders ?? []) {
    buttons.push(`<button type="button" data-ak5e-rider="${esc(rider.id)}" data-roll-type="${esc(rollType)}" data-formula="${esc(formula)}" ${common}>${esc(rider.label)}</button>`);
  }
  return `<div class="ak5e-aid-roll"><p>${esc(formula)}</p>${buttons.join("")}</div>`;
}

/** Optional Advanced Aid riders offered after an Aid Die roll (Ch. 3 L6658 table); each is a user-clicked button. */
export function advancedAidOffers(rollType) {
  switch (rollType) {
    case "attack": return [{ id: "crit", label: "Crit range +1 for this attack only" }];
    case "skill": return [{ id: "second", label: "Roll the Aid Die again and choose a result" }];
    case "save": return [{ id: "tempHP", label: "Gain Temporary HP = roll + PB" }];
    case "damage": return [{ id: "force", label: "Force damage = roll to a creature within 10 ft" }];
    case "healing": return [{ id: "tempHP", label: "Recipients gain Temporary HP = roll" }];
    default: return [];
  }
}

/** One-shot attack rider: the next attack by this Actor widens its critical range by 1 (R6). */
export async function registerAidCritRider(actor, riderId, label = "Advanced Aid: critical range +1 (this attack)") {
  return registerRider({
    id: riderId, actor, trigger: "attack", consume: "once",
    expiry: { trigger: "attack", actorUuid: actor.uuid }, label, sourceActorUuid: actor.uuid
  });
}

export async function removeAidRider(actor, riderId) {
  return removeRider(actor, riderId);
}

/**
 * dnd5e.preRollAttackV2(config): an active Advanced Aid crit rider lowers this attack's critical
 * threshold from 20 to 19 (R6). The rider is consumed by the attack event (trigger-events), not here.
 */
export function aidCritPreRollAttack(config) {
  const actor = config?.subject?.actor;
  const roll = config?.rolls?.[0];
  if (!actor || !roll) return;
  const pending = riderRecords(actor).find(record => String(record.id).startsWith(AID_CRIT_PREFIX) && record.status === "active");
  if (!pending) return;
  roll.options ??= {};
  if (roll.options.aidCritRider) return;   // one application per roll, even if the hook runs twice
  roll.options.criticalSuccess = Math.max(1, (roll.options.criticalSuccess ?? 20) - 1);
  roll.options.aidCritRider = pending.id;
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

/** Turn start (Ch. 3 L6687 / L15+ / L18+): Ever Reliable regain, then the Self-Supportive die. */
export async function onSupporterTurnStart(actor) {
  if (!supporterEnabled(actor)) return;
  if (hasEverReliable(actor) && getPool(actor, "aidDie").value === 0) {
    await refundPool(actor, "aidDie", 1, { reason: "Ever Reliable Turn Start" });
  }
  if (hasSelfSupportive(actor)) {
    await actor.update({ "flags.ak5e.supporter.selfSupportDie": true });
  }
}

/** Turn end: the Self-Supportive die is lost at the end of its Turn (R4). Clears even if the class is no longer enabled. */
export async function onSupporterTurnEnd(actor) {
  if (hasSelfSupportDie(actor)) {
    await actor.update({ "flags.ak5e.supporter.selfSupportDie": false });
  }
}

/** Turn events come from the active GM's client (trigger-events), so the Actor write is always permitted. */
function turnEventHandler(handler) {
  return event => {
    const actor = actorFromUuid(event?.actorUuid);
    return actor ? handler(actor) : undefined;
  };
}

/** Idempotent: a second call is a no-op, so handlers are never double-registered. */
export function registerSupporterHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  defineSupporterPools();

  if (typeof globalThis.Hooks?.on === "function") {
    globalThis.Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      // Only the owner's client writes the refund (F-R8); a failed refund is logged and shown, never silent.
      if (!actor?.isOwner) return;
      const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
      Promise.resolve().then(() => onSupporterRest(actor, type)).catch(error => {
        console.error("AK5e | Supporter rest", error);
        globalThis.ui?.notifications?.error?.(error?.message ?? String(error));
      });
    });
    globalThis.Hooks.on("dnd5e.preRollAttackV2", aidCritPreRollAttack);
    globalThis.Hooks.on("renderChatMessageHTML", (message, html) => {
      try { renderAidCardButtons(message, html); }
      catch (error) { console.error("AK5e | Supporter Aid card", error); }
    });
  }
  onAk5eEvent("turnStart", turnEventHandler(onSupporterTurnStart));
  onAk5eEvent("turnEnd", turnEventHandler(onSupporterTurnEnd));
}
