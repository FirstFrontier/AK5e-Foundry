/** Defender › Artshield (Ch.3 L1223-1292). Native effects, activities and hooks where D&D5e can express the rule;
 * guided, receipt-backed commands elsewhere. A roll already made cannot be rewritten, so Spellshield's "no damage"
 * and Eye of the Storm's immunity are procedures the table applies, not automatic mechanics. */
import { defenderProfile, defenderState, defenderLevel, absorptionDice, stormchaserReduction } from "./defender-rules.mjs";
import {
  defenderEnabled, registerDefenderCommands, registerDefenderTurnHandler, registerDefenderRestHandler, ownTurn,
  serial, step, writeDefenderState, spendResilience, defenderTurn, checkLeapingReach, primaryToken, shelteringDefenders, shelterAppliesTo
} from "./defender-features.mjs";
import { registerSetupPlanner, reconcileManagedEffect, planActivity, MANAGED_EFFECT_FLAG } from "./defender-setup.mjs";
import { createOperationKernel, flag, values, need, opaqueKey } from "./operation-kernel.mjs";
import { definePool, getPoolDefinition, getPool, spendPool } from "./resource-pools.mjs";
import { onAk5eEvent, spendReaction, refundReaction } from "./trigger-events.mjs";
import { withinFeet, tokenPoint } from "./standard-bearer-rules.mjs";

export const EXPEL_FEATURE_ID = "subclass-feature-defender-artshield-4th-level-weapons-of-the-enemy-1558";
export const STRIKES_BASE_ID = "artshield-empowered-strikes";
export const STRIKES_SKILL_ID = "artshield-empowered-strikes-skill";
export const WARD_FLAG = "defenderWard";
export const BARRIER_ELEMENT = "eyeOfTheStorm";
const CONCENTRATION_RECEIPT_LIMIT = 40;
const CONCENTRATION_STATE_FLAG = "defenderConcentrationBreakerOps";
const CONCENTRATION_ROLL_MARKER = "defenderConcentrationBreakerReceipt";
let installed = false;
let concentrationClaimSequence = 0;
// Native Concentration rolls await user input, so the receipt can remain pending for a while.
// Keep a local lock per target and receipt to prevent a double-click from opening two rolls.
const concentrationRollLocks = new Set();
let concentrationKernel;
const safe = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Artshield", error); globalThis.ui?.notifications?.error?.(error.message); });

export const isArtshield = actor => defenderEnabled(actor) && defenderProfile(actor).branch === "artshield";
const skillActive = actor => Boolean(flag(actor, "operatorSkills")?.active);
const users = actor => [...values(game.users)].filter(u => u.isGM || actor?.testUserPermission?.(u, "OWNER")).map(u => u.id);
async function whisper(actor, key, html) {
  if (values(game.messages).some(m => m.getFlag?.("ak5e", "defenderNotice") === key)) return;
  await ChatMessage.implementation.create({ whisper: users(actor), speaker: ChatMessage.implementation.getSpeaker?.({ actor }), flags: { ak5e: { defenderNotice: key } }, content: html });
}
/** The chat message a save/attack/damage was started from, when the click came from a chat card. */
export function originMessage(config) {
  const id = config?.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId;
  return id ? game.messages?.get?.(id) ?? null : null;
}
export const isArtMessage = message => message?.flags?.dnd5e?.item?.type === "spell";
const messageUuid = message => message?.uuid ?? (message?.id ? `ChatMessage.${message.id}` : null);
function resolveMessage(uuid) {
  if (!uuid) return null;
  return globalThis.fromUuidSync?.(uuid) ?? globalThis.game?.messages?.get?.(uuid.split(".").at(-1)) ?? null;
}
function spellshieldConfirmed(shelter, message) {
  const uuid = messageUuid(message);
  const receipt = uuid && shelter?.spellshieldArts?.[opaqueKey(uuid)];
  return Boolean(shelter?.active && shelter.operationId && receipt?.messageUuid === uuid
    && receipt.shelterOperationId === shelter.operationId);
}
/* ---------------------------------------------------------------- setup plan */

export function expelActivity() {
  const levels = "@classes.defender.levels";
  return { _id: "ak5eArtsExpel001", type: "save", name: "Expel Absorbed Arts", activation: { type: "action", value: 1 },
    flags: { ak5e: { defenderExpel: true } },
    target: { override: true, prompt: true, affects: { count: "", type: "creature", choice: false }, template: { type: "cube", size: "10", units: "ft", count: "1", contiguous: false } },
    consumption: { targets: [], scaling: { allowed: false }, spellSlot: false },
    save: { ability: ["dex"], dc: { calculation: "", formula: "8 + @prof + max(@abilities.str.mod, @abilities.dex.mod)" } },
    damage: { onSave: "half", parts: [{ number: null, denomination: 6, bonus: "", types: ["force"], scaling: { number: 1 },
      custom: { enabled: true, formula: `(3*(1+min(1,floor(${levels}/7))+min(1,floor(${levels}/14))))d6` } }] },
    description: { chatFlavor: "Expels the energy absorbed with Arts Absorption: a 10-foot square originating from you; Dexterity Save against your Martial DC. 3d6 Force (6d6 at level 7, 9d6 at level 14), half on a success." } };
}
export function artshieldPlanner(actor, profile, plan) {
  const managedIds = [STRIKES_BASE_ID, STRIKES_SKILL_ID];
  // Older versions created a broad D&D5e DR trait for Ward. Disable it during setup
  // regardless of the currently attached branch.
  for (const effect of values(actor.effects).filter(e => flag(e, WARD_FLAG))) {
    if (!effect.disabled) plan.updateEffects.push({ effect, changes: { disabled: true } });
    plan.warnings.push("A legacy Leaping Ward effect is disabled; apply Resistance only to the triggering Art by hand.");
  }
  if (profile.branch !== "artshield") {
    for (const sourceId of managedIds) {
      const effect = values(actor.effects).find(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId === sourceId);
      if (effect && effect.disabled !== true) plan.updateEffects.push({ effect, changes: { disabled: true, [`flags.ak5e.${MANAGED_EFFECT_FLAG}.active`]: false } });
    }
    return;
  }
  const level = profile.level, active = skillActive(actor), eligible = level >= 4;
  const strikes = (sourceId, name, value, disabled) => reconcileManagedEffect(actor, { sourceId, name, img: "icons/svg/lightning.svg", disabled,
    source: "Ch.3 L1260: Melee Weapon Attacks deal 1d6 Force Damage, 2d6 while an Operator Skill is active",
    changes: [{ key: "system.bonuses.mwak.damage", mode: 2, value, priority: 20 }] }, plan);
  strikes(STRIKES_BASE_ID, "Empowered Strikes", "1d6[force]", !eligible || active);
  strikes(STRIKES_SKILL_ID, "Empowered Strikes (Operator Skill active)", "2d6[force]", !eligible || !active);
  if (level >= 4) planActivity(actor, EXPEL_FEATURE_ID, expelActivity(), plan);
}
/** Swap between the 1d6 and 2d6 effects when an Operator Skill starts or ends. Only the disabled flags change. */
export async function syncEmpoweredStrikes(actor) {
  if (!actor?.isOwner || !isArtshield(actor) || defenderLevel(actor) < 4) return;
  const active = skillActive(actor);
  for (const [sourceId, disabled] of [[STRIKES_BASE_ID, active], [STRIKES_SKILL_ID, !active]]) {
    const effect = values(actor.effects).find(e => flag(e, MANAGED_EFFECT_FLAG)?.sourceId === sourceId);
    if (effect && effect.disabled !== disabled) await effect.update({ disabled });
  }
}

/* ---------------------------------------------------------------- saves and concentration */

/** dnd5e.preRollSavingThrowV2: Arts Resistance (the Artshield) and Spellshield (sheltered allies, when the Artshield
 * confirmed sight of the Arts this Shelter) give Advantage on a Save against an Art. Only saves rolled from an Art's chat
 * card can be recognised; anything else is left to the table. */
export function artsSaveHook(config) {
  const actor = config?.subject?.documentName === "Actor" ? config.subject : config?.subject?.actor;
  if (!actor) return;
  const source = originMessage(config);
  if (!isArtMessage(source)) return;
  const options = config.rolls?.[0]?.options; if (!options) return;
  let reason = null;
  if (isArtshield(actor)) reason = "Arts Resistance";
  else {
    const token = values(actor.getActiveTokens?.() ?? [])[0]?.document ?? values(actor.getActiveTokens?.() ?? [])[0];
    const scene = token?.parent;
    // Spellshield protects creatures benefitting from Shelter, so the 5-ft condition is checked when the Save is rolled.
    if (scene && shelteringDefenders(scene).some(d => {
      const shelter = defenderState(d).shelter;
      return isArtshield(d) && spellshieldConfirmed(shelter, source) && shelterAppliesTo(d, token.uuid);
    })) reason = "Spellshield";
  }
  if (!reason) return;
  options.advantage = true;
  globalThis.ui?.notifications?.info?.(`${reason}: Advantage on this Saving Throw against an Art.`);
}

/** Find native D&D5e concentration effects whose source Item is an Art. */
export function concentrationArtSources(actor) {
  // D&D5e 5.3.3 exposes `Actor5e.concentration.items/effects`; the item Set is the
  // authoritative active-concentration list and handles activity-level concentration.
  const items = values(actor?.concentration?.items ?? []);
  return items.flatMap(item => {
    const isConcentration = item?.requiresConcentration === true || item?.system?.properties?.has?.("concentration")
      || values(item?.system?.activities).some(activity => activity?.duration?.concentration);
    if (item?.type !== "spell" || !isConcentration) return [];
    const effect = values(actor.concentration.effects ?? []).find(e => e.origin === item.uuid || flag(e, "item")?.uuid === item.uuid);
    return [{ effectUuid: effect?.uuid ?? null, originUuid: item.uuid, name: item.name }];
  });
}

function concentrationState(actor) {
  const saved = flag(actor, CONCENTRATION_STATE_FLAG);
  return saved && typeof saved === "object" && !Array.isArray(saved)
    ? { ...structuredClone(saved), operations: [...(saved.operations ?? [])], claims: { ...(saved.claims ?? {}) } }
    : { operations: [], claims: {} };
}

function concentrationOperationId(claimId, phase) { return `cb_${opaqueKey(`${claimId}:${phase}`)}`; }

function ownsActor(actor, user = game.user) {
  return Boolean(user?.isGM || actor?.testUserPermission?.(user, "OWNER"));
}

function isMarkedConcentrationSave(message, target, receiptId) {
  return message?.documentName === "ChatMessage" && message.speaker?.actor === target.id
    && flag(message, CONCENTRATION_ROLL_MARKER) === receiptId
    && message.flags?.dnd5e?.messageType === "roll"
    && message.flags?.dnd5e?.roll?.type === "save"
    && message.flags?.dnd5e?.roll?.ability === "con"
    && message.rolls?.length === 1 && Number.isFinite(Number(message.rolls[0]?.total));
}

/** Serialize claim state on the target through the elected-GM operation kernel. This makes
 * the pending->rolling transition visible to every owner before the native dialog opens. */
concentrationKernel = createOperationKernel({
  label: "Concentration Breaker",
  stateFlag: CONCENTRATION_STATE_FLAG,
  requestFlag: "defenderConcentrationBreakerRequest",
  responseFlag: "defenderConcentrationBreakerResponse",
  receiptFlag: "defenderConcentrationBreakerOperationReceipt",
  benefitFlag: "defenderConcentrationBreakerOperationBenefit",
  rollFlag: "defenderConcentrationBreakerOperationRoll",
  tagPreset: "defender",
  getState: concentrationState,
  isMember: actor => actor?.documentName === "Actor" && !actor.pack,
  gate: (_actor, command) => need(["claim", "release", "finish"].includes(command), `Unknown Concentration Breaker operation: ${command}.`),
  perform: async (actor, command, data, operation, state, user) => {
    const receipts = [...(flag(actor, "defenderConcentrationBreakers") ?? [])];
    const index = receipts.findIndex(receipt => receipt.id === data.receiptId);
    need(index >= 0, "Choose a current Concentration Breaker receipt.");
    const receipt = receipts[index];
    const updateReceipt = async next => {
      concentrationKernel.noteMutation(actor);
      const result = await actor.update({ "flags.ak5e.defenderConcentrationBreakers": receipts.map((entry, i) => i === index ? next : entry) }, actor.isToken ? { diff: false } : {});
      need(result, "The Concentration Breaker receipt could not be saved; retry the same operation.");
    };
    if (command === "claim") {
      need(receipt.status === "pending", receipt.status === "rolling" ? "Another owner is already rolling this receipt." : "Choose a pending Concentration Breaker receipt.");
      need(typeof data.claimId === "string" && data.claimId.length > 0, "A stable Concentration Breaker claim ID is required.");
      need(!state.claims[data.receiptId], "Another owner is already rolling this receipt.");
      if (receipt.needsConfirmation) need(data.confirmArtConcentration === true, "Confirm that the target is Concentrating on an Art.");
      else {
        const current = concentrationArtSources(actor);
        const stillActive = receipt.concentrationSources.some(source => source.effectUuid
          && current.some(candidate => candidate.originUuid === source.originUuid && candidate.effectUuid === source.effectUuid));
        if (!stillActive) {
          await updateReceipt({ ...receipt, status: "expired", expiredAt: Date.now(), reason: "concentrationEnded" });
          throw new Error("The recorded Art concentration ended before this roll; this receipt has expired.");
        }
      }
      // Snapshot matching cards from the GM's own ChatMessage collection. This
      // prevents an old/replayed marked save from satisfying a later claim.
      const priorMessages = values(game.messages).filter(message => message.speaker?.actor === actor.id
        && flag(message, CONCENTRATION_ROLL_MARKER) === data.receiptId).map(messageUuid).filter(Boolean);
      const claim = { id: data.claimId, userId: user.id, operationId: operation.id, claimedAt: Date.now(), priorMessages };
      state.claims[data.receiptId] = claim;
      await updateReceipt({ ...receipt, status: "rolling", claim });
      return state;
    }
    const claim = state.claims[data.receiptId];
    need(receipt.status === "rolling" && claim && receipt.claim?.id === claim.id && receipt.claim.userId === user.id
      && data.claimId === claim.id, "This Concentration Breaker claim is no longer active for this user.");
    if (command === "release") {
      delete state.claims[data.receiptId];
      await updateReceipt({ ...receipt, status: "pending", claim: null, releasedAt: Date.now() });
      return state;
    }
    const message = await globalThis.fromUuid?.(data.messageUuid) ?? globalThis.fromUuidSync?.(data.messageUuid);
    need(isMarkedConcentrationSave(message, actor, data.receiptId) && message.author?.id === claim.userId
      && !claim.priorMessages?.includes(message.uuid),
    "Completion requires the claim owner's evaluated native Concentration Save message for this target and receipt.");
    delete state.claims[data.receiptId];
    await updateReceipt({ ...receipt, status: "rolled", claim: null, completedAt: Date.now(), confirmedBy: claim.userId,
      confirmedArtConcentration: receipt.needsConfirmation, rollMessageUuid: message.uuid, rollTotal: Number(message.rolls[0].total) });
    return state;
  }
});

async function submitConcentrationOperation(target, command, receiptId, claimId, data = {}) {
  const phase = command === "claim" ? claimId : `${claimId}:${command}`;
  return concentrationKernel.submit(target, command, { confirmation: true, receiptId, claimId, ...data }, concentrationOperationId(phase, command));
}

function matchingConcentrationMessage(target, receiptId, userId, priorMessages) {
  return values(game.messages).find(message => message.author?.id === userId && isMarkedConcentrationSave(message, target, receiptId)
    && !priorMessages.has(message.uuid)) ?? null;
}

/** A hitTaken event contains actual applied damage and its source Actor. Any damage by an
 * eligible Artshield qualifies; the target's separate concentration source must be an Art. */
export async function concentrationBreakerEvent(event) {
  const source = event.sourceActorUuid ? globalThis.fromUuidSync?.(event.sourceActorUuid) : null;
  const target = globalThis.fromUuidSync?.(event.actorUuid);
  const message = event.raw?.message ?? (event.messageUuid ? resolveMessage(event.messageUuid) : null);
  if (!source || !target || !isArtshield(source) || defenderLevel(source) < 9 || !target.isOwner
    || !(Number(event.amount) > 0)) return;
  const messageId = messageUuid(message), eventId = event.eventId ?? `hitTaken:${messageId}:${target.uuid}`;
  const receipts = [...(flag(target, "defenderConcentrationBreakers") ?? [])];
  if (receipts.some(receipt => receipt.id === eventId)) return;
  const concentrationSources = concentrationArtSources(target);
  const damageAmount = Number(event.amount);
  const receipt = { id: eventId, sourceActorUuid: source.uuid, damageMessageUuid: messageId,
    damageName: message?.flags?.dnd5e?.item?.name ?? message?.name ?? "Damage", damageAmount,
    saveDc: Math.max(10, Math.floor(damageAmount / 2)), concentrationSources,
    needsConfirmation: concentrationSources.length === 0 || concentrationSources.some(source => !source.effectUuid),
    createdAt: Date.now(), turn: defenderTurn(), status: "pending" };
  await target.setFlag?.("ak5e", "defenderConcentrationBreakers", [...receipts, receipt].slice(-CONCENTRATION_RECEIPT_LIMIT));
  const note = receipt.needsConfirmation ? "Confirm that the target is currently Concentrating on an Art before rolling." : "The active Art concentration was identified.";
  await whisper(target, `concentration_${eventId}`, `<p><strong>Concentration Breaker.</strong> ${source.name} dealt ${damageAmount} Damage to ${target.name}. ${note} The target owner or GM can use the Concentration Breaker control on the target's sheet to make the native Concentration Save (DC ${receipt.saveDc}) with Disadvantage.</p>`);
}

/** Target owner/GM explicitly starts the native roll. A cancelled roll keeps its receipt; only
 * a completed roll consumes it. The roll's own options carry the feature marker and disadvantage. */
export async function rollConcentrationBreaker(target, receiptId, event = null, { confirmArtConcentration = false } = {}) {
  if (!target || target.documentName !== "Actor" || !ownsActor(target)) throw new Error("Only the target's owner or the GM can roll this Concentration Save.");
  const lockKey = `${target.uuid}:${receiptId}`;
  if (concentrationRollLocks.has(lockKey)) throw new Error("A Concentration Breaker roll is already in progress for this receipt.");
  concentrationRollLocks.add(lockKey);
  let claimId = null, claimed = false;
  try {
    const receipts = [...(flag(target, "defenderConcentrationBreakers") ?? [])];
    const receipt = receipts.find(r => r.id === receiptId && r.status === "pending");
    if (!receipt) throw new Error("Choose a pending Concentration Breaker receipt.");
    if (receipt.needsConfirmation && confirmArtConcentration !== true) throw new Error("Confirm that the target is Concentrating on an Art.");
    const priorMessages = new Set(values(game.messages).filter(message => message.speaker?.actor === target.id
      && flag(message, CONCENTRATION_ROLL_MARKER) === receipt.id).map(messageUuid).filter(Boolean));
    claimId = `${globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2)}_${Date.now().toString(36)}_${++concentrationClaimSequence}`;
    await submitConcentrationOperation(target, "claim", receiptId, claimId, { confirmArtConcentration });
    claimed = true;
    const rolls = await target.rollConcentration({ event, target: receipt.saveDc, rolls: [{ options: { disadvantage: true, ak5eConcentrationBreaker: receipt.id } }] }, {},
      { data: { flags: { ak5e: { [CONCENTRATION_ROLL_MARKER]: receipt.id } } } });
    if (!rolls?.length || !Number.isFinite(Number(rolls[0]?.total))) {
      await submitConcentrationOperation(target, "release", receiptId, claimId); claimed = false;
      return { cancelled: true, consumed: false };
    }
    const message = matchingConcentrationMessage(target, receiptId, game.user.id, priorMessages);
    if (!message) throw new Error("The native roll did not create an authenticated Concentration Save message for this receipt.");
    await submitConcentrationOperation(target, "finish", receiptId, claimId, { messageUuid: message.uuid });
    claimed = false;
    return { cancelled: false, consumed: true, roll: rolls[0] };
  } catch (error) {
    if (claimed && claimId) {
      try { await submitConcentrationOperation(target, "release", receiptId, claimId); }
      catch (releaseError) { console.error("AK5e | Concentration Breaker claim release", releaseError); }
    }
    throw error;
  } finally {
    concentrationRollLocks.delete(lockKey);
  }
}

function renderConcentrationBreakerControls(app, html) {
  const actor = app?.actor;
  if (!(app instanceof foundry.applications.sheets.ActorSheetV2) || !actor || !ownsActor(actor) || !html?.querySelector) return;
  const receipts = (flag(actor, "defenderConcentrationBreakers") ?? []).filter(r => r.status === "pending");
  if (!receipts.length) return;
  const root = html.querySelector('.tab[data-tab="features"]') ?? html;
  if (root.querySelector?.(".ak5e-concentration-breaker-panel")) return;
  const section = document.createElement("section"); section.className = "ak5e-concentration-breaker-panel ak5e-defender-sheet-panel";
  const title = document.createElement("h3"); title.textContent = "Concentration Breaker"; section.append(title);
  for (const receipt of receipts) {
    const row = document.createElement("p"), button = document.createElement("button");
    button.type = "button"; button.textContent = `Roll with Disadvantage: ${receipt.damageName ?? "Art"}`;
    button.addEventListener("click", () => safe((async () => {
      const confirmArtConcentration = receipt.needsConfirmation && await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirm Art concentration" }, rejectClose: false,
        content: "Confirm this Actor is currently Concentrating on an Art.", yes: { label: "Confirm and roll" }
      });
      if (receipt.needsConfirmation && !confirmArtConcentration) return;
      await rollConcentrationBreaker(actor, receipt.id, null, { confirmArtConcentration });
    })()));
    row.append(button); section.append(row);
  }
  root.prepend(section);
}

/* ---------------------------------------------------------------- Arts Absorption */

export async function artsDamageNotice(event) {
  const actor = globalThis.fromUuidSync?.(event.actorUuid);
  if (!actor || !isArtshield(actor) || defenderLevel(actor) < 4 || !actor.isOwner) return;
  const message = event.raw?.message ?? (event.messageUuid ? await fromUuid?.(event.messageUuid) : null);
  if (!isArtMessage(message) || defenderState(actor).absorbed) return;
  await whisper(actor, `absorb_${event.eventId ?? event.messageUuid}`, `<p><strong>Arts Absorption.</strong> ${actor.name} took Damage from an Art. Open Defender controls and choose Absorb Arts to store its energy (no Action required).</p>`);
}
/** Gate the Expel activity on stored energy and consume it when the activity completes. */
export function expelGate(activity) {
  if (!activity?.flags?.ak5e?.defenderExpel) return;
  const actor = activity.actor;
  if (!actor || !isArtshield(actor)) { globalThis.ui?.notifications?.warn?.("Only a configured Artshield can expel absorbed energy."); return false; }
  if (!defenderState(actor).absorbed) { globalThis.ui?.notifications?.warn?.("No absorbed energy is stored. Use Absorb Arts when you take Arts Damage."); return false; }
  if (game.combat?.started && !ownTurn(actor)) { globalThis.ui?.notifications?.warn?.("Expel absorbed energy as an Action during your Turn."); return false; }
}
export async function expelDone(activity) {
  if (!activity?.flags?.ak5e?.defenderExpel) return;
  const actor = activity.actor; if (!actor?.isOwner) return;
  await serial(actor, async () => { const state = defenderState(actor); state.absorbed = null; await writeDefenderState(actor, state); });
}

/* ---------------------------------------------------------------- Reactive Defence */

export function reachFeet(actor) {
  const reach = values(actor.items).filter(i => i.type === "weapon" && i.system?.equipped && i.system?.range?.reach).map(i => Number(i.system.range.reach)).filter(Number.isFinite);
  return Math.max(5, ...reach);
}
/** dnd5e.postUseActivity: an Art cast within an Artshield's Reach offers an Opportunity Attack. Hostility and sight are the owner's call. */
export async function reactiveDefenceNotice(activity, _usage, results) {
  if (!activity?.isSpell && activity?.item?.type !== "spell") return;
  const caster = activity.actor, token = values(caster?.getActiveTokens?.() ?? [])[0]; const doc = token?.document ?? token;
  if (!doc?.parent) return;
  for (const t of values(doc.parent.tokens)) {
    const defender = t.actor;
    if (!defender || defender.uuid === caster.uuid || !isArtshield(defender) || defenderLevel(defender) < 9 || !defender.isOwner) continue;
    if (!withinFeet(doc.parent, tokenPoint(t), doc, reachFeet(defender))) continue;
    await whisper(defender, `reactive_${results?.message?.id ?? activity.uuid}_${defender.uuid}`,
      `<p><strong>Reactive Defence.</strong> ${caster.name} cast an Art within ${defender.name}'s Reach. If they are hostile, ${defender.name} may spend a Reaction to make an Attack of Opportunity (Defender controls › Reactive Defence).</p>`);
  }
}

/* ---------------------------------------------------------------- commands */

const turnKey = () => defenderTurn() ?? `outside_${game.time?.worldTime ?? 0}`;

const COMMANDS = {
  absorb: async (actor, state, op, data) => {
    need(isArtshield(actor) && defenderLevel(actor) >= 4, "Arts Absorption requires the Artshield Branch at level 4.");
    need(data.artsDamageConfirmed === true, "Confirm that you took Arts Damage.");
    need(!state.absorbed, "Energy is already stored; expel it first (one stored charge).");
    state.absorbed = { at: turnKey(), art: String(data.art ?? "").trim() || null, operationId: op.id };
    const dice = absorptionDice(defenderLevel(actor));
    return { stored: state.absorbed, instruction: `Energy stored. As an Action during your Turn use Expel Absorbed Arts: ${dice.number}d6 Force in a 10-foot square, Dexterity Save against your Martial DC, half on a success. It is kept until expelled or your next Long Rest.` };
  },
  spellshield: async (actor, state, op, data) => {
    need(isArtshield(actor), "Spellshield requires the Artshield Branch.");
    need(data.allyTokenUuid && state.shelter?.active && state.shelter.allies.includes(data.allyTokenUuid), "Choose a Creature currently benefitting from your Shelter.");
    need(shelterAppliesTo(actor, data.allyTokenUuid), "The Creature must still be within 5 feet and benefitting from your Shelter.");
    const source = resolveMessage(data.artMessageUuid);
    need(isArtMessage(source) && spellshieldConfirmed(state.shelter, source), "Confirm sight of this Art during the active Shelter first.");
    need(data.savedConfirmed === true, "Confirm the ally succeeded on a Save that would deal half Damage against this Art.");
    await step(actor, state, op, "spend", () => spendResilience(actor, 2, "Spellshield"));
    return { instruction: `That Creature takes no Damage from ${source.name ?? "this Art"} instead of half. Correct their Hit Points if the half Damage was already applied.` };
  },
  confirmSpellshieldArt: async (actor, state, _op, data) => {
    need(isArtshield(actor), "Spellshield requires the Artshield Branch.");
    need(state.shelter?.active, "Take Shelter before confirming an Art.");
    const source = resolveMessage(data.artMessageUuid);
    need(isArtMessage(source), "Choose an Art's originating chat message.");
    need(data.visibleConfirmed === true, "Confirm that you can see this Art.");
    state.shelter.spellshieldArts ??= {};
    const sourceUuid = messageUuid(source);
    state.shelter.spellshieldArts[opaqueKey(sourceUuid)] = { messageUuid: sourceUuid, shelterOperationId: state.shelter.operationId };
    return { instruction: `Sight of ${source.name ?? "this Art"} is recorded for the current Shelter only. Sheltered allies within 5 feet gain Advantage on Saves against this Art.` };
  },
  reactiveDefence: async (actor, state, op, data) => {
    need(isArtshield(actor) && defenderLevel(actor) >= 9, "Reactive Defence requires the Artshield Branch at level 9.");
    need(typeof data.triggerId === "string" && data.triggerId, "Name the Art cast that triggers this Reaction.");
    need(data.hostileConfirmed === true && data.reachConfirmed === true, "Confirm the caster is hostile and within your Reach.");
    const reaction = await step(actor, state, op, "reaction", () => spendReaction(actor, { triggerId: data.triggerId, receipt: `reactive_${op.id}`, tags: ["reactiveDefence"] }));
    need(reaction?.ok, `No Reaction available for this trigger (${reaction?.reason ?? "unknown"}).`);
    return { instruction: "Make an Attack of Opportunity against the caster." };
  },
  stormchaser: async (actor, _state, _op, data) => {
    need(isArtshield(actor) && defenderLevel(actor) >= 12, "Improved Arts Resistance requires the Artshield Branch at level 12.");
    const physical = Number(data.physicalReduction);
    need(Number.isFinite(physical) && physical >= 0, "Enter your Damage Reduction against Physical Damage.");
    const value = stormchaserReduction(physical);
    return { reduction: value, instruction: `Use ${value} Damage Reduction against Arts Damage (half of ${physical} Physical Damage Reduction, rounded up).` };
  },
  leapingWard: async (actor, state, op, data) => {
    need(isArtshield(actor) && defenderLevel(actor) >= 12, "Leaping Ward requires the Artshield Branch at level 12.");
    need(defenderLevel(actor) >= 11, "Leaping Defence is required.");
    need(game.combat?.started, "Leaping Ward lasts until the end of the current Turn; start the combat first.");
    need(typeof data.triggerId === "string" && data.triggerId, "Name the Saving Throw this Reaction responds to.");
    need(data.saveConfirmed === true, "Confirm an allied Creature you can see is about to make a Saving Throw against an Art or Art-like effect.");
    const types = Array.isArray(data.damageTypes) ? [...new Set(data.damageTypes.map(String))] : [];
    need(types.length > 0, "Name the damage types the Art deals.");
    checkLeapingReach(actor, data);
    const ally = data.allyActorUuid ? globalThis.fromUuidSync?.(data.allyActorUuid) : null;
    need(ally?.documentName === "Actor", "Choose the allied Creature.");
    const reaction = await step(actor, state, op, "reaction", () => spendReaction(actor, { triggerId: data.triggerId, receipt: `ward_${op.id}`, tags: ["leapingWard"] }));
    need(reaction?.ok, `No Reaction available for this trigger (${reaction?.reason ?? "unknown"}).`);
    state.ward = { operationId: op.id, triggerId: data.triggerId, reactionReceipt: `ward_${op.id}`, turn: turnKey(), combatUuid: game.combat.uuid ?? game.combat.id,
      allyActorUuid: ally.uuid, allyTokenUuid: data.allyTokenUuid ?? null, damageTypes: types, artMessageUuid: data.artMessageUuid ?? null, refunded: false };
    return { effects: 0, instruction: `Leaping Ward applies only to the triggering Art: ${actor.name} and ${ally.name} are Resistant to that Art's Damage this Turn. Do not add a general Damage Resistance trait; apply the Resistance in the Art's damage procedure.` };
  },
  leapingWardRefund: async (actor, state, op, data) => {
    need(isArtshield(actor) && defenderLevel(actor) >= 12, "Leaping Ward requires the Artshield Branch at level 12.");
    const ward = state.ward;
    need(ward && ward.operationId === data.wardOperationId, "Choose the current Leaping Ward receipt.");
    need(ward.turn === turnKey(), "The Leaping Ward Reaction was reset at the beginning of your next Turn.");
    const source = state.operations.find(entry => entry.id === ward.operationId && entry.command === "leapingWard" && entry.status === "complete");
    need(source && !ward.refunded, "This Leaping Ward has already regained its Reaction.");
    const recorded = flag(actor, "reactionBudget")?.receipts?.[ward.reactionReceipt];
    need(recorded && !recorded.refunded, "That Reaction has already been regained at the start of your Turn.");
    await step(actor, state, op, "spend", () => spendResilience(actor, 1, "Regain Reaction after Leaping Ward"));
    const result = await step(actor, state, op, "refund", () => refundReaction(actor, { receipt: ward.reactionReceipt }));
    need(result?.ok, "The Leaping Ward Reaction could not be refunded.");
    ward.refunded = true;
    return { refunded: true, instruction: "You regained the Reaction spent on Leaping Ward." };
  },
  eyeOfTheStorm: async (actor, state, op, data) => {
    need(isArtshield(actor) && defenderLevel(actor) >= 15, "Eye of the Storm requires the Artshield Branch at level 15.");
    const radius = Number(data.radius); need(Number.isFinite(radius) && radius > 0 && radius <= 20, "Choose a radius of up to 20 feet.");
    need(typeof data.triggerId === "string" && data.triggerId && data.reactionConfirmed === true, "Confirm the Reaction trigger.");
    need(getPool(actor, "eyeOfTheStorm").value >= 1, "Eye of the Storm is spent until you finish a Long Rest.");
    need(!state.barrier?.active, "A barrier is already up.");
    const own = primaryToken(actor, data.tokenUuid); need(own?.parent || data.positionConfirmed === true, "Place your token on the scene, or confirm positions at the table.");
    const reaction = await step(actor, state, op, "reaction", () => spendReaction(actor, { triggerId: data.triggerId, receipt: `eye_${op.id}`, tags: ["eyeOfTheStorm"] }));
    need(reaction?.ok, `No Reaction available for this trigger (${reaction?.reason ?? "unknown"}).`);
    await step(actor, state, op, "use", () => spendPool(actor, "eyeOfTheStorm", 1, { reason: "Eye of the Storm" }));
    let templateUuid = null, inside = [];
    if (own?.parent) {
      const point = tokenPoint(own);
      const existing = values(own.parent.templates).find(t => t.flags?.ak5e?.[BARRIER_ELEMENT]?.operationId === op.id);
      const template = existing ?? (await own.parent.createEmbeddedDocuments("MeasuredTemplate", [{ t: "circle", user: game.user.id, x: point.x, y: point.y, distance: radius, direction: 0,
        fillColor: "#c0c8d0", borderColor: "#e8eef4", flags: { ak5e: { [BARRIER_ELEMENT]: { operationId: op.id, actorUuid: actor.uuid } } } }]))[0];
      templateUuid = template?.uuid ?? null;
      inside = values(own.parent.tokens).filter(t => t.actor && withinFeet(own.parent, point, t, radius)).map(t => ({ uuid: t.uuid, name: t.name, actorUuid: t.actor.uuid }));
    }
    state.barrier = { active: true, radius, armedTurn: turnKey(), templateUuid, inside, operationId: op.id, tokenUuid: own?.uuid ?? null };
    return { radius, inside: inside.length, instruction: `Until the end of your next Turn, Creatures inside the barrier cannot be affected by Arts or Art-like effects or take Arts Damage; end any Arts affecting them. Inside now: ${inside.map(t => t.name).join(", ") || "(none on the map)"}.` };
  },
  eyeSweep: async (actor, state, _op, data) => {
    need(state.barrier?.active, "No barrier is up.");
    const own = primaryToken(actor, state.barrier.tokenUuid);
    const inside = own?.parent ? values(own.parent.tokens).filter(t => t.actor && withinFeet(own.parent, tokenPoint(own), t, state.barrier.radius)) : [];
    const found = [];
    for (const token of inside) for (const effect of values(token.actor.effects)) {
      const origin = effect.origin ? globalThis.fromUuidSync?.(effect.origin) : null;
      if (origin?.type === "spell") found.push({ token, effect });
    }
    let removed = 0;
    if (data.remove === true) {
      need(game.user.isGM, "Only the GM can end effects on other Creatures; the list below shows what to end.");
      for (const { effect } of found) { await effect.delete(); removed += 1; }
    }
    state.barrier.inside = inside.map(t => ({ uuid: t.uuid, name: t.name, actorUuid: t.actor.uuid }));
    return { found: found.map(f => `${f.token.name}: ${f.effect.name}`), removed, instruction: found.length ? `Arts affecting Creatures inside: ${found.map(f => `${f.token.name} (${f.effect.name})`).join("; ")}.` : "No Art-origin effects found on Creatures inside." };
  }
};

/* ---------------------------------------------------------------- Turn and rest handlers */

async function endBarrier(actor, state) {
  const barrier = state.barrier; if (!barrier?.active) return;
  const template = barrier.templateUuid ? globalThis.fromUuidSync?.(barrier.templateUuid) : null;
  try { await template?.delete?.(); } catch (error) { console.warn("AK5e | Eye of the Storm template", error); }
  state.barrier = { ...barrier, active: false, endedAt: game.time?.worldTime ?? 0 };
}
/** The Artshield's own Turn just ended (the event names it; the current combatant is already the next one). The barrier
 * lasts until the end of the next Turn after the one it was raised in. */
async function artshieldTurnEnd(actor, state, event) {
  const endedTurn = `${event.combatUuid}:${event.round}:${event.combatantId ?? event.turn}`;
  if (state.barrier?.active && endedTurn !== state.barrier.armedTurn) await endBarrier(actor, state);
}
export async function expireWards(event) {
  const combat = game.combat; if (!combat?.started || !game.user.isGM) return;
  const actors = new Map(values(game.actors).map(a => [a.uuid, a]));
  for (const token of values(combat.scene?.tokens)) if (token.actor && !actors.has(token.actor.uuid)) actors.set(token.actor.uuid, token.actor);
  for (const actor of actors.values()) {
    const ward = defenderState(actor).ward;
    if (!ward || ward.turn !== `${event.combatUuid}:${event.round}:${event.combatantId ?? event.turn}`) continue;
    // Remove only legacy, module-marked effects from earlier versions; current Wards are guided.
    for (const effect of values(actor.effects).filter(e => flag(e, WARD_FLAG)?.operationId === ward.operationId)) await effect.delete?.();
    await serial(actor, async () => { const state = defenderState(actor); state.ward = null; await writeDefenderState(actor, state); });
  }
}

export function registerArtshieldHooks() {
  if (installed) return;
  installed = true;
  if (!getPoolDefinition("eyeOfTheStorm")) definePool({ id: "eyeOfTheStorm", label: "Eye of the Storm", max: 1, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: actor => isArtshield(actor) && defenderLevel(actor) >= 15, recovery: [{ on: "lr", amount: "full" }] });
  registerSetupPlanner(artshieldPlanner);
  registerDefenderCommands(COMMANDS);
  registerDefenderTurnHandler("turnEnd", (actor, state, event) => isArtshield(actor) ? artshieldTurnEnd(actor, state, event) : undefined);
  registerDefenderRestHandler(async (actor, state, type) => { if (type === "long") await endBarrier(actor, state); });
  onAk5eEvent("hitTaken", artsDamageNotice);
  onAk5eEvent("hitTaken", concentrationBreakerEvent);
  onAk5eEvent("turnEnd", expireWards);
  Hooks.on("dnd5e.preRollSavingThrowV2", artsSaveHook);
  Hooks.on("dnd5e.preUseActivity", expelGate);
  Hooks.on("renderActorSheetV2", renderConcentrationBreakerControls);
  Hooks.on("createChatMessage", (...args) => concentrationKernel.handle(...args));
  Hooks.on("dnd5e.postUseActivity", (activity, usage, results) => { expelDone(activity).catch(e => console.error("AK5e | Artshield", e)); reactiveDefenceNotice(activity, usage, results).catch(e => console.error("AK5e | Artshield", e)); });
  Hooks.on("updateActor", (actor, changed, _options, userId) => {
    if (game.user.id === userId && changed?.flags?.ak5e && "operatorSkills" in changed.flags.ak5e) syncEmpoweredStrikes(actor).catch(e => console.error("AK5e | Artshield", e));
  });
}
