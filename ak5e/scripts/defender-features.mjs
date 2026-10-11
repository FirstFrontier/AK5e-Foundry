/** Owner-operated Defender class features (Ch.3 L986-1048): Resilience, Shelter, Leaping Defence,
 * Stand Behind Me, Reactive, Indestructible and the Adamantine Defence notice. Branch features live in
 * dreadnought-features.mjs and artshield-features.mjs. Commands are guided: they spend resources, keep
 * durable receipts and print the table procedure; nothing rewrites another player's roll. */
import {
  DEFENDER_CLASS_ID, defenderState, stateChanges, rebaseState, defenderProfile, defenderLevel, reactionMax, leapingRange,
  indestructibleReduction, shelterCost, shelterDisadvantage, SHELTER_FEET, IMPROVED_SHELTER_FEET, RESILIENCE_STEPS, creatureTier
} from "./defender-rules.mjs";
import { flag, values, need, keyedSerial } from "./operation-kernel.mjs";
import { definePool, getPool, getPoolDefinition, spendPool, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent, spendReaction, refundReaction, setReactionMax } from "./trigger-events.mjs";
import { withinFeet, distanceFeet, tokenPoint } from "./standard-bearer-rules.mjs";
import { resolveDamage } from "./damage-pipeline.mjs";

export const serial = keyedSerial();
const OPERATION_LIMIT = 40, EVENT_LIMIT = 160;
let installed = false;
const safe = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Defender", error); globalThis.ui?.notifications?.error?.(error.message); });

/** Hooks other Defender modules (Dreadnought, Artshield) register for command handling and events. */
const commandHandlers = new Map();
export function registerDefenderCommands(handlers) { for (const [name, handler] of Object.entries(handlers)) commandHandlers.set(name, handler); }
export const defenderCommandNames = () => ["shelter", "endShelter", "resilience", "leapingDefence", "leapingRefund", "indestructible", "restoreIndestructible", ...commandHandlers.keys()];

/** Branch modules add Turn-boundary and rest handlers; each receives (actor, state[, event]) and may mutate state. */
const turnHandlers = { turnStart: [], turnEnd: [] }, restHandlers = [];
export function registerDefenderTurnHandler(kind, handler) { if (!turnHandlers[kind].includes(handler)) turnHandlers[kind].push(handler); }
export function registerDefenderRestHandler(handler) { if (!restHandlers.includes(handler)) restHandlers.push(handler); }

export function defenderEnabled(actor) {
  const profile = defenderProfile(actor);
  return profile.applicable && profile.configured && !profile.blocked.length && profile.level !== null;
}
export function defenderTurn() {
  const c = globalThis.game?.combat;
  if (!c?.started) return null;
  return `${c.uuid ?? c.id}:${c.round}:${c.combatant?.id ?? c.turn}`;
}
export const ownTurn = actor => Boolean(globalThis.game?.combat?.started && game.combat.combatant?.actor?.uuid === actor.uuid);
/** In combat the Defender's own Turn is required; outside combat the table decides. */
export function needOwnTurn(actor, message) { need(!game.combat?.started || ownTurn(actor), message); }

export const resilience = actor => getPool(actor, "resilience");
export const spendResilience = (actor, amount, reason) => spendPool(actor, "resilience", amount, { reason });
export const refundResilience = (actor, amount, reason) => refundPool(actor, "resilience", amount, { reason });

function enabled(actor) { need(actor?.isOwner && !actor.pack && defenderEnabled(actor), "Choose an owned, configured Defender."); }
function levelGate(actor, level, name) { need(defenderLevel(actor) >= level, `${name} requires Defender level ${level}.`); }
const tokenOf = (actor, uuid) => uuid ? globalThis.fromUuidSync?.(uuid) ?? null : null;
export function actorTokens(actor) { return values(actor.getActiveTokens?.(true, true) ?? []).map(t => t.document ?? t); }
export function primaryToken(actor, uuid = null) {
  const tokens = actorTokens(actor);
  return (uuid && tokens.find(t => t.uuid === uuid)) || tokens.find(t => t.parent?.id === globalThis.canvas?.scene?.id) || tokens[0] || null;
}
const walkSpeed = actor => Number(actor.system?.attributes?.movement?.walk ?? 0);

/** Read-only view for the sheet panel and public API. */
export function getDefenderView(actor) {
  const state = defenderState(actor), profile = defenderProfile(actor), level = profile.level;
  return {
    profile, state, level, resilience: profile.applicable ? resilience(actor) : null,
    indestructible: level >= 18 ? getPool(actor, "indestructible") : null,
    reactions: flag(actor, "reactionBudget") ?? null,
    pending: state.operations.filter(o => ["prepared", "applying"].includes(o.status)),
    manual: [
      "Class choices (hit points, proficiencies, equipment, Ability Score Improvements, Talents and Operator Skills) stay on the existing choosers; setup does not change them.",
      "Action economy, movement, visibility and allegiance are confirmed at the table; geometry never decides who is an ally.",
      "Shelter outside combat lasts until it is explicitly ended with End Shelter; no clock or fabricated Turn ends it.",
      "Native roll cards cannot be rewritten after the fact. Where a Feature changes an Attack, the panel prints the procedure and records the receipt."
    ]
  };
}

/** Allied tokens the sheet may offer: every token in the Defender's scene except the Defender. Allegiance is chosen by the user. */
export function shelterCandidates(actor, feet = SHELTER_FEET) {
  const own = primaryToken(actor);
  if (!own?.parent) return [];
  return values(own.parent.tokens).filter(t => t.actor && t.uuid !== own.uuid)
    .map(t => ({ uuid: t.uuid, name: t.name, within: nearFeet(own.parent, tokenPoint(own), t, feet) }));
}
/** Shelter radius: 5 feet, or 10 feet for a Protector's Improved Shelter (Anchor Point, L1648) recorded at declaration. */
export const shelterRadius = shelter => Number(shelter?.radius) > 0 ? Number(shelter.radius) : SHELTER_FEET;
export function shelteredAllies(actor) {
  const shelter = defenderState(actor).shelter;
  return shelter?.active ? [...shelter.allies] : [];
}
/** True when an Attack against targetTokenUuid is made at Disadvantage because of this Defender's Shelter (attack-time check). */
export function shelterAppliesTo(defender, targetTokenUuid) {
  const shelter = defenderState(defender).shelter;
  if (!shelter?.active) return false;
  const own = primaryToken(defender, shelter.defenderTokenUuid), target = tokenOf(defender, targetTokenUuid);
  const within = Boolean(own?.parent && target?.parent && own.parent.id === target.parent.id && nearFeet(own.parent, tokenPoint(own), target, shelterRadius(shelter)));
  return shelterDisadvantage(shelter, { targetUuid: targetTokenUuid, defenderTokenUuid: own?.uuid ?? shelter.defenderTokenUuid, within });
}

/** Defenders on a scene who currently hold an active Shelter. */
export function shelteringDefenders(scene) {
  const found = new Map();
  for (const token of values(scene?.tokens)) {
    const actor = token.actor;
    if (actor && !found.has(actor.uuid) && defenderState(actor).shelter?.active) found.set(actor.uuid, actor);
  }
  return [...found.values()];
}
/** dnd5e.preRollAttackV2: Attacks against sheltered allies within 5 ft are made at Disadvantage. A roll with several
 * selected targets is one roll, so any sheltered target gives Disadvantage (logged default). */
export function shelterAttackHook(config) {
  const options = config?.rolls?.[0]?.options;
  if (!options) return;
  const protectedTargets = values(globalThis.game?.user?.targets).map(t => t.document ?? t)
    .filter(token => token?.parent && shelteringDefenders(token.parent).some(defender => shelterAppliesTo(defender, token.uuid)));
  if (!protectedTargets.length) return;
  options.disadvantage = true;
  globalThis.ui?.notifications?.info?.(`Shelter: this Attack against ${protectedTargets.map(t => t.name).join(", ")} is made at Disadvantage.`);
}

/** Save a Defender state object by writing only the leaves it changed (see stateChanges). */
export async function writeDefenderState(actor, state, extra = {}) {
  const changes = { ...stateChanges(state), ...extra };
  if (!Object.keys(changes).length) return;
  const result = await actor.update(changes);
  if (result === false) throw new Error("The Defender state could not be saved.");
  rebaseState(state);
}
const persist = writeDefenderState;
/** Run a step at most once per operation, even across retries. */
export async function step(actor, state, op, name, task) {
  op.done ??= {};
  if (op.done[name]) return op.stepResults?.[name];
  const value = await task();
  if (value?.ok === false) return value;   // a refused step consumed nothing, so it is not a receipt
  op.done[name] = true; (op.stepResults ??= {})[name] = value ?? null;
  await persist(actor, state);
  return value;
}

/** Within `feet` of an origin, counting a diagonal square as 5 ft as the grid's own measurement does. Falls back to the
 * straight-line test when the scene grid cannot measure a path. */
export function nearFeet(scene, origin, token, feet) {
  if (withinFeet(scene, origin, token, feet)) return true;
  try {
    const target = tokenPoint(token), grid = scene.grid;
    if (typeof grid?.measurePath !== "function" || (Number(origin.elevation ?? 0) !== Number(target.elevation ?? 0))) return false;
    return grid.measurePath([{ x: origin.x, y: origin.y }, { x: target.x, y: target.y }]).distance <= feet + 1e-6;
  } catch { return false; }
}

/** Leaping Defence reach (L1029): an ally within half your Speed. Tokens are measured when both are on one scene. */
export function checkLeapingReach(actor, data) {
  const own = primaryToken(actor, data.tokenUuid), ally = tokenOf(actor, data.allyTokenUuid), range = leapingRange(walkSpeed(actor));
  if (own && ally && own.parent?.id === ally.parent?.id) {
    need(nearFeet(own.parent, tokenPoint(own), ally, range), `The ally is ${Math.round(distanceFeet(own.parent, tokenPoint(own), tokenPoint(ally)))} ft away; Leaping Defence reaches half your Speed (${range} ft).`);
  } else need(data.rangeConfirmed === true, `Confirm the ally is within ${range} feet (half your Speed).`);
  need(data.moveConfirmed === true, "Confirm you have moved to an unoccupied space within 5 feet of the ally (no Opportunity Attacks).");
}

const HANDLED = {
  shelter: async (actor, state, op, data) => {
    needOwnTurn(actor, "Take the Shelter Action during your Turn.");
    const cost = shelterCost(data.activation);
    const allies = data.allies;
    need(Array.isArray(allies) && allies.length > 0 && new Set(allies).size === allies.length && allies.every(u => typeof u === "string"),
      "Choose the allied Creatures (distinct tokens) that Shelter protects.");
    const own = primaryToken(actor, data.tokenUuid);
    need(own || data.positionConfirmed === true, "Place the Defender's token on the scene, or confirm positions at the table.");
    need(!allies.includes(own?.uuid), "Shelter does not protect the Defender.");
    need(data.alliesConfirmed === true, "Confirm that every chosen Creature is an ally; geometry never decides allegiance.");
    if (cost.resilience) await step(actor, state, op, "spend", () => spendResilience(actor, cost.resilience, "Shelter as a Bonus Action"));
    // Protector Anchor Point (L1644-1648): the player confirms the Bulwark shield; the radius is then 10 feet.
    const radius = data.anchorPoint === true && defenderProfile(actor).branch === "protector" && defenderLevel(actor) >= 4 ? IMPROVED_SHELTER_FEET : SHELTER_FEET;
    state.shelter = { active: true, allies: [...allies], defenderTokenUuid: own?.uuid ?? null, declaredTurn: defenderTurn(), activation: data.activation, operationId: op.id, radius };
    return { shelter: state.shelter, instruction: `Until the beginning of your next Turn, Attacks against these allied Creatures within ${radius} feet of you are made at Disadvantage (checked when the Attack is rolled).${radius > SHELTER_FEET ? " Improved Shelter: they also have Advantage on Strength and Dexterity Saving Throws against effects you can see." : ""} Outside combat, choose End Shelter when it ends; no timer substitutes for a Turn.` };
  },
  endShelter: async (actor, state) => { need(state.shelter?.active, "No Shelter is active."); state.shelter = null; return { ended: true }; },
  resilience: async (actor, state, op, data) => {
    need(["spend", "refund"].includes(data.mode), "Choose spend or refund.");
    need(typeof data.reason === "string" && data.reason.trim().length >= 3, "Record a reason for this Resilience change.");
    const amount = Number(data.amount); need(Number.isInteger(amount) && amount > 0, "Change Resilience by a positive whole number.");
    const result = await step(actor, state, op, "pool", () => (data.mode === "spend" ? spendResilience : refundResilience)(actor, amount, data.reason.trim()));
    return { resilience: result };
  },
  leapingDefence: async (actor, state, op, data) => {
    levelGate(actor, 11, "Leaping Defence");
    need(typeof data.attackId === "string" && data.attackId, "Name the Attack this Reaction responds to.");
    need(data.attackConfirmed === true, "Confirm that an Attack hit an allied Creature you can see.");
    checkLeapingReach(actor, data);
    const reaction = await step(actor, state, op, "reaction", () => spendReaction(actor, { triggerId: data.attackId, receipt: `leaping_${op.id}`, tags: ["leapingDefence"] }));
    need(reaction?.ok, `No Reaction available for this trigger (${reaction?.reason ?? "unknown"}).`);
    const instructions = [`You are now the target of that Attack, which hits you regardless of your Armour Class. Apply its Damage to ${actor.name}; a Critical Hit follows the original roll${defenderLevel(actor) >= 20 ? " unless Adamantine Defence downgrades it" : ""}.`];
    if (defenderLevel(actor) >= 17) instructions.push("Stand Behind Me: the triggering Creature may move up to 15 feet without Opportunity Attacks, ending further from the Attacking Creature.");
    instructions.push("You may expend 1 Resilience to regain your Reaction (Leaping Refund).");
    state.leaping = { operationId: op.id, attackId: data.attackId, allyTokenUuid: data.allyTokenUuid ?? null, turn: defenderTurn() };
    return { attackId: data.attackId, reactionPool: reaction.pool, instructions };
  },
  leapingRefund: async (actor, state, op, data) => {
    levelGate(actor, 11, "Leaping Defence");
    const leap = state.operations.find(o => o.id === data.leapOperationId && o.command === "leapingDefence" && o.status === "complete");
    need(leap, "Choose a completed Leaping Defence.");
    need(!leap.refunded || leap.refundedBy === op.id, "This Leaping Defence already regained its Reaction.");
    // The Reaction receipt disappears when your Turn starts (the Reaction comes back anyway); nothing is spent then.
    need(op.done?.spend || flag(actor, "reactionBudget")?.receipts?.[`leaping_${leap.id}`], "That Reaction has already been regained at the start of your Turn, so there is nothing to refund.");
    await step(actor, state, op, "spend", () => spendResilience(actor, 1, "Regain Reaction after Leaping Defence"));
    const refund = await step(actor, state, op, "refund", () => refundReaction(actor, { receipt: `leaping_${leap.id}` }));
    leap.refunded = true; leap.refundedBy = op.id;
    return { refunded: refund?.ok === true };
  },
  indestructible: async (actor, state, op, data) => {
    levelGate(actor, 18, "Indestructible");
    need(typeof data.damageId === "string" && data.damageId, "Name the instance of Damage this Reaction responds to.");
    need(data.hostileConfirmed === true, "Confirm that the Damage is the result of a hostile action.");
    const reduction = Number(data.reduction); need(Number.isFinite(reduction) && reduction >= 0, "Enter the Damage Reduction you currently have against this Damage.");
    const pool = getPool(actor, "indestructible"); need(pool.value >= 1, "Indestructible is spent; finish a Short Rest or restore it with 2 Resilience during your Turn.");
    // Compute (and so validate) everything before any resource is spent: a failure afterwards would strand the operation.
    const doubled = indestructibleReduction(reduction);
    const preview = Number.isFinite(Number(data.amount)) && data.amount !== "" && data.amount !== null && data.amount !== undefined
      ? resolveDamage({ amount: Number(data.amount), type: data.type, reduction: doubled, resistance: data.resistance === true, vulnerability: data.vulnerability === true }) : null;
    const reaction = await step(actor, state, op, "reaction", () => spendReaction(actor, { triggerId: data.damageId, receipt: `indestructible_${op.id}`, tags: ["indestructible"] }));
    need(reaction?.ok, `No Reaction available for this trigger (${reaction?.reason ?? "unknown"}).`);
    await step(actor, state, op, "use", () => spendPool(actor, "indestructible", 1, { reason: "Indestructible" }));
    return { reduction, doubledReduction: doubled, preview,
      instruction: reduction === 0 ? "You have no Damage Reduction against this Damage, so doubling it changes nothing." : `Use ${doubled} Damage Reduction against this instance of Damage.` };
  },
  restoreIndestructible: async (actor, state, op) => {
    levelGate(actor, 18, "Indestructible");
    need(!game.combat?.started || ownTurn(actor), "Restore Indestructible during your own Turn.");
    need(getPool(actor, "indestructible").value < 1, "Indestructible is not spent.");
    await step(actor, state, op, "spend", () => spendResilience(actor, 2, "Restore Indestructible"));
    await step(actor, state, op, "refund", () => refundPool(actor, "indestructible", 1, { reason: "Restore Indestructible" }));
    return { restored: true };
  }
};

/** Guided Defender command with a durable receipt. Retry with the same operation ID and exact choices. */
export async function defenderCommand(actor, command, data = {}, operationId = globalThis.foundry?.utils?.randomID?.()) {
  enabled(actor);
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(operationId), "A stable operation ID is required.");
  need(defenderCommandNames().includes(command) || command === "reconcile", "Unknown Defender command.");
  return serial(actor, async () => {
    const state = defenderState(actor), previous = state.operations.find(o => o.id === operationId);
    if (previous) {
      need(previous.command === command && JSON.stringify(previous.data) === JSON.stringify(data), "Retry with the same operation ID and exact choices.");
      if (previous.status === "complete") return previous.result;
      need(previous.status === "prepared", "This operation was already reconciled.");
    }
    if (command === "reconcile") {
      need(game.user.isGM && String(data.reason ?? "").trim().length >= 10, "A GM must review resources and record a reconciliation reason.");
      const pending = state.operations.find(o => o.id === data.operationId && o.status === "prepared"); need(pending, "Choose an interrupted operation.");
      pending.status = "reconciled"; pending.reason = data.reason.trim(); await persist(actor, state); return { reconciled: pending.id };
    }
    need(!state.operations.some(o => o.status === "prepared" && o.id !== operationId), "Retry or reconcile the interrupted operation first.");
    const op = previous ?? { id: operationId, command, data: structuredClone(data), status: "prepared" };
    if (!previous) {
      state.operations = [...state.operations.filter(o => o.status === "prepared" || o.id !== operationId).slice(-(OPERATION_LIMIT - 1)), op];
    }
    const handler = HANDLED[command] ?? commandHandlers.get(command);
    // Validation failures happen before any resource step; do not leave a blocking receipt behind.
    let output;
    try { output = await handler(actor, state, op, data); } catch (error) {
      if (!op.done || !Object.keys(op.done).length) state.operations = state.operations.filter(o => o !== op);
      else await persist(actor, state);
      throw error;
    }
    op.status = "complete"; op.result = output;
    await persist(actor, state);
    return output;
  });
}

/* ------------------------------------------------------------------ events and hooks */

async function mutateState(actor, change) {
  return serial(actor, async () => { const state = defenderState(actor); const changed = await change(state); if (changed !== false) await persist(actor, state); });
}
function seen(state, id) {
  if (state.events.includes(id)) return true;
  state.events = [...state.events, id].slice(-EVENT_LIMIT); return false;
}

/** The Defender's own Turn starts: Shelter ends "at the beginning of your next Turn". */
export async function defenderTurnEvent(event, extra = turnHandlers[event.kind] ?? []) {
  const actor = globalThis.fromUuidSync?.(event.actorUuid);
  if (!actor || !actor.isOwner || !defenderEnabled(actor) || event.skipped) return;
  await mutateState(actor, async state => {
    const id = `${event.kind}_${event.combatUuid}_${event.round}_${event.combatantId ?? event.turn}`;
    if (seen(state, id)) return false;
    const eventTurn = `${event.combatUuid}:${event.round}:${event.combatantId ?? event.turn}`;
    if (event.kind === "turnStart" && state.shelter?.declaredTurn !== eventTurn) state.shelter = null;
    for (const handler of extra) await handler(actor, state, event);
  });
}
export async function defenderRest(actor, type) {
  if (!actor?.isOwner || !defenderEnabled(actor)) return;
  await mutateState(actor, async state => {
    // Branch handlers run first: Eye of the Storm must still see its barrier to remove the template from the map.
    for (const handler of restHandlers) await handler(actor, state, type);
    if (type === "long") { state.shelter = null; state.leaping = null; state.uses = {}; state.absorbed = null; }
  });
}
export async function defenderCombatEnd(event) {
  for (const uuid of event.actorUuids ?? []) {
    const actor = globalThis.fromUuidSync?.(uuid);
    if (!actor?.isOwner || !defenderEnabled(actor)) continue;
    await mutateState(actor, state => { state.shelter = null; state.leaping = null; });
  }
}
/** Keep the Reaction budget at 1 (2 from Reactive, 13th). Idempotent: skips the write when nothing changes. */
export async function syncDefenderReactions(actor) {
  if (!actor?.isOwner || !defenderEnabled(actor)) return;
  const max = reactionMax(defenderLevel(actor));
  if ((flag(actor, "reactionBudget")?.max ?? 1) === max) return { changed: false, max };
  await setReactionMax(actor, max);
  return { changed: true, max };
}

/** Adamantine Defence (20th): a Critical Hit against the Defender becomes a non-Critical Hit. A posted roll cannot be
 * rewritten, so the owners and the GM are told to roll damage without the critical dice. */
export async function adamantineNotice(event) {
  if (!event.critical) return;
  for (const target of event.targets ?? []) {
    if (target.hit !== true) continue;
    const token = tokenOf(null, target.uuid), actor = token?.actor ?? token;
    if (!actor || actor.documentName !== "Actor" || !defenderEnabled(actor) || defenderLevel(actor) < 20) continue;
    const id = `adamantine_${event.attackId}_${actor.uuid}`;
    if (globalThis.game?.messages?.some?.(m => m.getFlag?.("ak5e", "defenderNotice") === id)) continue;
    const recipients = [...game.users.filter(u => u.isGM || actor.testUserPermission?.(u, "OWNER")).map(u => u.id)];
    await ChatMessage.implementation.create({ whisper: recipients, flags: { ak5e: { defenderNotice: id } },
      speaker: ChatMessage.implementation.getSpeaker?.({ actor }),
      content: `<p><strong>Adamantine Defence.</strong> This Critical Hit against ${actor.name} becomes a non-Critical Hit. Roll its Damage without the critical dice; the native roll cannot be changed after it is made.</p>` });
  }
}

export function definePools() {
  if (!getPoolDefinition("resilience")) definePool({ id: "resilience", label: "Resilience", max: { ...RESILIENCE_STEPS }, initial: "max", classId: DEFENDER_CLASS_ID,
    levelBasis: "classLevel", appliesTo: defenderEnabled, recovery: [{ on: "lr", amount: "full" }] });
  if (!getPoolDefinition("indestructible")) definePool({ id: "indestructible", label: "Indestructible", max: 1, initial: "max", classId: DEFENDER_CLASS_ID,
    levelBasis: "classLevel", appliesTo: actor => defenderEnabled(actor) && defenderLevel(actor) >= 18, recovery: [{ on: "sr", amount: "full" }] });
}

export function registerDefenderHooks() {
  if (installed) return;
  installed = true;
  definePools();
  onAk5eEvent("turnStart", event => defenderTurnEvent(event));
  onAk5eEvent("turnEnd", event => defenderTurnEvent(event));
  onAk5eEvent("combatEnd", defenderCombatEnd);
  onAk5eEvent("attack", event => safe(adamantineNotice(event)));
  Hooks.on("dnd5e.preRollAttackV2", shelterAttackHook);
  Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => safe(defenderRest(actor, config.type ?? result?.type)));
  const classChanged = (item, userId) => { if (game.user.id === userId && ["class", "subclass"].includes(item.type)) safe(syncDefenderReactions(item.parent)); };
  Hooks.on("updateItem", (item, _changes, _options, userId) => classChanged(item, userId));
  Hooks.on("deleteItem", (item, _options, userId) => classChanged(item, userId));
}
export { creatureTier };
