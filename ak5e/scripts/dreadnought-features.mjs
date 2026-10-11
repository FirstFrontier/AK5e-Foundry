/** Defender › Dreadnought (Ch.3 L1324-1361): Dreadnought's Advance with Skill Point awards, Crownsplitter,
 * Wrecking Wall, Sword of Damocles and Legendary Might. The Advance gives Skill Points; it does not change
 * any Charging Method (the source says nothing of the kind), so no Skill's methods are touched. */
import {
  defenderProfile, defenderState, defenderLevel, advanceSkillPoints, crownsplitterBonus, creatureTier, isEliteOrLeader
} from "./defender-rules.mjs";
import {
  defenderEnabled, registerDefenderCommands, registerDefenderTurnHandler, registerDefenderRestHandler, needOwnTurn, ownTurn, serial, step, writeDefenderState, spendResilience, defenderTurn
} from "./defender-features.mjs";
import { registerSetupPlanner, reconcileManagedEffect, planActivity, MANAGED_EFFECT_FLAG } from "./defender-setup.mjs";
import { flag, values, need } from "./operation-kernel.mjs";
import { definePool, getPoolDefinition, getPool, spendPool, refundPool } from "./resource-pools.mjs";
import { onAk5eEvent } from "./trigger-events.mjs";

export const ADVANCE_EFFECT_ID = "dreadnought-advance";
export const LEGENDARY_MIGHT_EFFECT_ID = "dreadnought-legendary-might";
export const WRECKING_WALL_FEATURE_ID = "subclass-feature-defender-dreadnought-9th-level-wrecking-wall-1572";
export const ADVANCE_SECONDS = 60;
const WATCH = Object.freeze({ attacked: false, dealt: false, forcedSave: false, tookDamage: false });
let installed = false;

export const isDreadnought = actor => defenderEnabled(actor) && defenderProfile(actor).branch === "dreadnought";
export const advanceState = actor => defenderState(actor).advance;
const now = () => Number(globalThis.game?.time?.worldTime ?? 0);
export const advanceActive = actor => {
  const advance = advanceState(actor);
  return Boolean(advance?.active && now() < advance.expiresAt);
};
const gmIds = actor => [...values(game.users)].filter(u => u.isGM || actor?.testUserPermission?.(u, "OWNER")).map(u => u.id);
async function whisper(actor, key, html) {
  if (values(game.messages).some(m => m.getFlag?.("ak5e", "defenderNotice") === key)) return;
  await ChatMessage.implementation.create({ whisper: gmIds(actor), speaker: ChatMessage.implementation.getSpeaker?.({ actor }), flags: { ak5e: { defenderNotice: key } }, content: html });
}

/* ---------------------------------------------------------------- setup plan */

/** Managed effects and the Wrecking Wall activity. Pure: only fills the plan. */
export function dreadnoughtPlanner(actor, profile, plan) {
  if (profile.branch !== "dreadnought") {
    // A removed Branch must not leave live bonuses behind: disable, never delete.
    for (const sourceId of [ADVANCE_EFFECT_ID, LEGENDARY_MIGHT_EFFECT_ID]) {
      const effect = values(actor.effects).find(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId === sourceId);
      if (effect && effect.disabled !== true) {
        plan.updateEffects.push({ effect, changes: { disabled: true, [`flags.ak5e.${MANAGED_EFFECT_FLAG}.active`]: false } });
        plan.warnings.push(`${effect.name} is disabled because the Dreadnought Branch is no longer attached.`);
      }
    }
    return;
  }
  const level = profile.level;
  reconcileManagedEffect(actor, { sourceId: ADVANCE_EFFECT_ID, name: "Dreadnought's Advance", img: "icons/svg/combat.svg", disabled: !advanceActive(actor),
    source: "Ch.3 L1335: Melee Attacks deal additional Damage equal to your Proficiency Bonus while the Advance is active",
    description: "Active only while the Advance runs. Managed by the Dreadnought controls.",
    changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value: "@prof", priority: 20 }] }, plan);
  if (level >= 15) {
    const base = Number(actor.system?.abilities?.str?.value);
    if (Number.isFinite(base) && base > 26) plan.warnings.push("Strength is already above 26; the managed cap of 26 would lower it. Review the Legendary Might effect.");
    reconcileManagedEffect(actor, { sourceId: LEGENDARY_MIGHT_EFFECT_ID, name: "Legendary Might", img: "icons/svg/upgrade.svg", disabled: false, respectManualDisable: true,
      source: "Ch.3 L1361: Strength +6, to a maximum of 26",
      changes: [{ key: "system.abilities.str.value", mode: 2, value: "6", priority: 20 }, { key: "system.abilities.str.value", mode: 3, value: "26", priority: 30 }] }, plan);
  } else {
    const effect = values(actor.effects).find(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId === LEGENDARY_MIGHT_EFFECT_ID);
    if (effect && effect.disabled !== true) plan.updateEffects.push({ effect, changes: { disabled: true, [`flags.ak5e.${MANAGED_EFFECT_FLAG}.active`]: false } });
  }
  if (level >= 9) planActivity(actor, WRECKING_WALL_FEATURE_ID, wreckingWallActivity(), plan);
}

/** Wrecking Wall as a native Save activity (Ch.3 L1347-1349). Stunned and the DR/Resistance bypass stay guided. */
export function wreckingWallActivity() {
  return { _id: "ak5eWreckingWall", type: "save", name: "Wrecking Wall", activation: { type: "action", value: 1 },
    range: { override: true, units: "ft", value: "5", special: "" }, target: { override: true, prompt: true, affects: { count: "1", type: "creature", choice: false }, template: {} },
    uses: { spent: 0, max: "1", recovery: [{ period: "lr", type: "recoverAll" }] }, consumption: { targets: [], scaling: { allowed: false }, spellSlot: false },
    save: { ability: ["con"], dc: { calculation: "", formula: "8 + @prof + max(@abilities.str.mod, @abilities.dex.mod)" } },
    damage: { onSave: "half", parts: [{ number: 10, denomination: 6, bonus: "", types: ["bludgeoning"], custom: { enabled: false, formula: "" }, scaling: { number: 1 } }] },
    description: { chatFlavor: "Choose a Creature you can see within 5 feet. Failed Save: Damage and Stunned (re-save at the end of each of their Turns). Successful Save: half Damage, not Stunned. The Damage ignores Damage Reduction and Resistances: use the Damage Reduction calculator instead of Apply Damage." } };
}

/* ---------------------------------------------------------------- Advance */

const advanceEffect = actor => values(actor.effects).find(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId === ADVANCE_EFFECT_ID);
async function setAdvanceEffect(actor, active) {
  const effect = advanceEffect(actor);
  need(effect, "Run Defender setup first so the Advance's managed effect exists.");
  if (effect.disabled === !active) return;
  await effect.update({ disabled: !active });
}
async function endAdvance(actor, state, reason) {
  if (state.advance?.active) state.advance = { ...state.advance, active: false, endedAt: now(), endedBy: reason };
  await setAdvanceEffect(actor, false);
}

const COMMANDS = {
  advance: async (actor, state, op, data) => {
    need(isDreadnought(actor), "Dreadnought's Advance requires the Dreadnought Branch.");
    need(data.confirmed === true, "Confirm that you are taking this as a Bonus Action.");
    needOwnTurn(actor, "Enter the Advance during your Turn.");
    need(!advanceActive(actor), "The Advance is already active.");
    need(advanceEffect(actor), "Run Defender setup first so the Advance's managed effect exists.");
    need(getPool(actor, "dreadnoughtAdvance").value >= 1, "The Advance is spent; finish a Short Rest or expend 2 Resilience to restore it.");
    await spendPoolOnce(actor, state, op, "use", "dreadnoughtAdvance", 1, "Dreadnought's Advance");
    await setAdvanceEffect(actor, true);
    state.advance = { active: true, startedAt: now(), expiresAt: now() + ADVANCE_SECONDS, startedTurn: defenderTurn(), watch: { ...WATCH, ...(state.advanceWindow ?? {}) }, operationId: op.id, skillPoints: advanceSkillPoints(defenderLevel(actor)) };
    return { advance: state.advance, instruction: `Your Melee Attacks deal ${actor.system?.attributes?.prof ?? "PB"} additional Damage and you gain ${state.advance.skillPoints} Skill Point${state.advance.skillPoints > 1 ? "s" : ""} whenever you make an Attack Roll or are Attacked, for one minute. It ends early if your Turn ends and you have not made an Attack, dealt Damage, forced a Saving Throw or taken Damage since your last Turn.` };
  },
  endAdvance: async (actor, state) => { need(state.advance?.active, "The Advance is not active."); await endAdvance(actor, state, "manual"); return { ended: true }; },
  restoreAdvance: async (actor, state, op) => {
    need(isDreadnought(actor), "Dreadnought's Advance requires the Dreadnought Branch.");
    need(!game.combat?.started || ownTurn(actor), "Restore the Advance during your own Turn.");
    need(getPool(actor, "dreadnoughtAdvance").value < 1, "The Advance has not been used.");
    await step(actor, state, op, "spend", () => spendResilience(actor, 2, "Restore Dreadnought's Advance"));
    await step(actor, state, op, "refund", () => refundPool(actor, "dreadnoughtAdvance", 1, { reason: "Restore Dreadnought's Advance" }));
    return { restored: true };
  },
  advanceActivity: async (actor, state, _op, data) => {
    need(Object.hasOwn(WATCH, data.kind) && data.kind !== "attacked", "Record dealt, forcedSave or tookDamage; Attacks are observed from the roll.");
    state.advanceWindow = { ...WATCH, ...(state.advanceWindow ?? {}), [data.kind]: true };
    if (state.advance?.active) state.advance.watch = { ...state.advance.watch, [data.kind]: true };
    return { recorded: data.kind };
  },
  reinstateAdvance: async (actor, state, op, data) => {
    need(game.user.isGM && String(data.reason ?? "").trim().length >= 10, "A GM must record why the Advance should not have ended (at least 10 characters).");
    const advance = state.advance;
    need(advance && !advance.active && advance.endedBy === "noQualifyingAction" && now() < advance.expiresAt, "Only an Advance that ended for lack of a qualifying action, within its minute, can be reinstated.");
    await setAdvanceEffect(actor, true);
    state.advance = { ...advance, active: true, endedAt: null, endedBy: null, reinstated: { reason: data.reason.trim(), by: game.user.id, operationId: op.id }, watch: { ...WATCH } };
    return { reinstated: true };
  },
  leapingOffence: async (actor, state, op, data) => {
    need(isDreadnought(actor) && defenderLevel(actor) >= 12, "Leaping Offence requires the Dreadnought Branch at level 12.");
    const leap = state.operations.find(o => o.id === data.leapOperationId && o.command === "leapingDefence" && o.status === "complete");
    need(leap, "Choose a completed Leaping Defence.");
    need(!leap.offence || leap.offence === op.id, "This Leaping Defence already triggered Leaping Offence.");
    const tier = attackerTier(data); need(isEliteOrLeader(tier), "Leaping Offence needs an Elite or Leader attacker.");
    await step(actor, state, op, "spend", () => spendResilience(actor, 1, "Leaping Offence"));
    leap.offence = op.id;
    return { tier, instruction: "After that Attack, make an Attack of Opportunity against the Attacking Creature. Leaping Offence needs no Action and, as a no-Action-required Feature, no Reaction." };
  },
  tearThemDown: async (actor, state, _op, data) => {
    need(isDreadnought(actor) && defenderLevel(actor) >= 12, "Tear them Down requires the Dreadnought Branch at level 12.");
    const tier = attackerTier(data); need(isEliteOrLeader(tier), "Tear them Down needs an Elite or Leader Creature.");
    need(data.inReach === true && data.otherTarget === true, "Confirm the Creature is within your Reach and is Attacking, or forcing a Saving Throw on, a Creature that is not you.");
    return { tier, instruction: "Make an Attack of Opportunity against it (no Action required, so no Reaction is spent)." };
  }
};
function attackerTier(data) {
  const known = data.attackerUuid ? creatureTier(globalThis.fromUuidSync?.(data.attackerUuid)) : null;
  const tier = known ?? data.tier;
  need(["normal", "elite", "leader"].includes(tier), "Choose the attacker's tier; it is not stored for this Creature.");
  return tier;
}
async function spendPoolOnce(actor, state, op, name, id, amount, reason) { return step(actor, state, op, name, () => spendPool(actor, id, amount, { reason })); }

/* ---------------------------------------------------------------- Skill Points (GM-observed) */

/** Replaceable for tests; the real grant is the GM-run SP engine. */
export const skillPoints = { grant: async () => { throw new Error("Skill Point grants are not connected."); } };
export function connectSkillPoints(grant) { skillPoints.grant = grant; }

/** One award per Attack Roll made by an Advancing Dreadnought and one per Attack Roll made against one. Misses and
 * rolls with no target still count (logged default: "when you make an Attack Roll or are Attacked"). The message ID
 * makes each award idempotent. Existing SP limits (maximum, no gains while a Skill is active) apply. */
export async function processAdvanceAttack(message) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
  if (message.flags?.dnd5e?.roll?.type !== "attack") return;
  const attacker = ChatMessage.implementation.getSpeakerActor?.(message.speaker) ?? null;
  const awards = [];
  if (attacker && isDreadnought(attacker) && advanceActive(attacker)) awards.push({ actor: attacker, role: "attack" });
  for (const descriptor of message.flags?.dnd5e?.targets ?? []) {
    const target = globalThis.fromUuidSync?.(descriptor.uuid);
    const actor = target?.documentName === "Actor" ? target : target?.actor;
    if (actor && isDreadnought(actor) && advanceActive(actor) && !awards.some(a => a.actor.uuid === actor.uuid && a.role === "defence")) awards.push({ actor, role: "defence" });
  }
  for (const { actor, role } of awards) {
    // Only the one watch key is written, so a concurrent write from another client cannot be overwritten with a stale copy.
    if (role === "attack" && defenderState(actor).advance?.watch) await serial(actor, () => actor.update({ "flags.ak5e.defender.advance.watch.attacked": true }));
    const amount = advanceSkillPoints(defenderLevel(actor));
    try {
      await skillPoints.grant(actor, { amount, id: `dreadnought_${role}_${message.uuid ?? message.id}`, reason: `Dreadnought's Advance (${role === "attack" ? "made an Attack Roll" : "was Attacked"})` });
    } catch (error) {
      await whisper(actor, `advanceSP_${role}_${message.uuid ?? message.id}`, `<p><strong>Dreadnought's Advance.</strong> ${actor.name} did not gain ${amount} Skill Point${amount > 1 ? "s" : ""}: ${error.message} Adjust SP manually if the table rules otherwise.</p>`);
    }
  }
}

/** An Attack Roll made in the current window qualifies even if it happened before Advance activation. */
export async function advanceAttackActivity(event) {
  const actor = event.actorUuid ? globalThis.fromUuidSync?.(event.actorUuid) : null;
  if (actor && isDreadnought(actor)) await recordAdvanceWindow(actor, "attacked");
}

async function recordAdvanceWindow(actor, kind) {
  if (!actor.isOwner) return;
  await serial(actor, async () => {
    const advance = defenderState(actor).advance;
    const changes = { [`flags.ak5e.defender.advanceWindow.${kind}`]: true };
    if (advance?.active) changes[`flags.ak5e.defender.advance.watch.${kind}`] = true;
    await actor.update(changes);
  });
}

/** Damage taken or dealt, as observed on the applying client. Missed observations are covered by Advance activity records. */
export async function advanceDamageEvent(event) {
  const watch = [];
  const taker = globalThis.fromUuidSync?.(event.actorUuid), giver = event.sourceActorUuid ? globalThis.fromUuidSync?.(event.sourceActorUuid) : null;
  if (Number(event.amount ?? 1) > 0 && taker && isDreadnought(taker)) watch.push([taker, "tookDamage"]);
  if (Number(event.amount ?? 1) > 0 && giver && isDreadnought(giver)) watch.push([giver, "dealt"]);
  for (const [actor, kind] of watch) {
    await recordAdvanceWindow(actor, kind);
  }
}

/** At the end of the Dreadnought's Turn the Advance ends unless a qualifying action was observed or recorded. */
export async function advanceTurnEnd(actor, state) {
  const advance = state.advance;
  if (!advance?.active) { state.advanceWindow = { ...WATCH }; return; }
  if (now() >= advance.expiresAt) { await endAdvance(actor, state, "expired"); return; }
  const qualifying = Object.values({ ...state.advanceWindow, ...advance.watch }).some(Boolean);
  if (qualifying) { advance.watch = { ...WATCH }; state.advanceWindow = { ...WATCH }; return; }
  await endAdvance(actor, state, "noQualifyingAction");
  await whisper(actor, `advanceEnd_${advance.operationId}_${defenderTurn()}`,
    `<p><strong>Dreadnought's Advance ended.</strong> No Attack, Damage dealt, forced Saving Throw or Damage taken was recorded since ${actor.name}'s last Turn. If one happened without being detected, ask the GM to reinstate the Advance.</p>`);
}
export async function expireAdvances() {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
  for (const actor of values(game.actors)) {
    if (!actor.isOwner || !defenderEnabled(actor)) continue;
    const advance = advanceState(actor);
    if (!advance?.active || now() < advance.expiresAt) continue;
    await serial(actor, async () => { const state = defenderState(actor); await endAdvance(actor, state, "expired"); await writeDefenderState(actor, state); });
  }
}

/* ---------------------------------------------------------------- Crownsplitter */

/** dnd5e.preRollDamageV2: while an Operator Skill is active, melee weapon hits add the Strength modifier, doubled against
 * an Elite or Leader. The tier is read from the bestiary flag; an unknown tier is never guessed, so the base bonus is added and
 * the table is told what to add if the target is Elite or Leader. */
export function crownsplitterHook(config, _dialog, message) {
  const activity = config?.subject, actor = activity?.actor;
  if (!actor || !isDreadnought(actor) || defenderLevel(actor) < 4 || !flag(actor, "operatorSkills")?.active) return;
  const type = activity.getActionType?.(config.attackMode) ?? activity.actionType;
  if (type !== "mwak") return;
  const roll = config.rolls?.[0]; if (!roll?.parts) return;
  const mod = Number(actor.system?.abilities?.str?.mod ?? 0);
  const attackMessageId = config?.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId;
  const attackMessage = attackMessageId ? globalThis.game?.messages?.get?.(attackMessageId) : null;
  // 5.3.3 ChatMessage flags are directly under `flags.dnd5e.targets`; roll construction may
  // expose them under `message.data.flags` before expansion. Normalize token and Actor UUIDs.
  const descriptors = message?.flags?.dnd5e?.targets ?? message?.data?.flags?.dnd5e?.targets
    ?? attackMessage?.flags?.dnd5e?.targets ?? attackMessage?.data?.flags?.dnd5e?.targets ?? [];
  const tiers = descriptors.map(descriptor => {
    const uuid = typeof descriptor === "string" ? descriptor : descriptor?.uuid ?? descriptor?.actorUuid ?? descriptor?.tokenUuid;
    const document = uuid ? globalThis.fromUuidSync?.(uuid) : null;
    const actorTarget = document?.documentName === "Actor" ? document : document?.actor ?? document;
    return creatureTier(actorTarget);
  });
  const known = tiers.length === 1 && tiers[0] !== null;
  const bonus = crownsplitterBonus(mod, known ? tiers[0] : "normal");
  roll.parts.push(String(bonus));
  if (!known) globalThis.ui?.notifications?.info?.(`Crownsplitter: added ${mod} Damage. If the target is an Elite or Leader Creature, add another ${mod}.`);
}

/* ---------------------------------------------------------------- registration */

export function registerDreadnoughtHooks(connect = null) {
  if (installed) return;
  installed = true;
  if (!getPoolDefinition("dreadnoughtAdvance")) definePool({ id: "dreadnoughtAdvance", label: "Dreadnought's Advance", max: 1, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: isDreadnought, recovery: [{ on: "sr", amount: "full" }] });
  registerSetupPlanner(dreadnoughtPlanner);
  registerDefenderCommands(COMMANDS);
  registerDefenderTurnHandler("turnEnd", (actor, state, event) => event.kind === "turnEnd" && isDreadnought(actor) ? advanceTurnEnd(actor, state) : undefined);
  registerDefenderRestHandler(async (actor, state) => { if (state.advance?.active) await endAdvance(actor, state, "rest"); });
  if (connect) connectSkillPoints(connect);
  onAk5eEvent("hitTaken", advanceDamageEvent);
  onAk5eEvent("attack", event => advanceAttackActivity(event));
  Hooks.on("createChatMessage", message => processAdvanceAttack(message).catch(error => console.error("AK5e | Dreadnought", error)));
  Hooks.on("dnd5e.preRollDamageV2", crownsplitterHook);
  Hooks.on("updateWorldTime", () => expireAdvances().catch(error => console.error("AK5e | Dreadnought", error)));
}
