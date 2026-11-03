/**
 * Witchcraft Medic branch (Ch. 3 C3:5090-5146; U3 rulings 1-11).
 *
 * Registers the branch's table-play plans with the shared Medic use engine. Everything here follows
 * the engine contract: a use is previewed without writing, confirmed once, warnings never block,
 * resource spends clamp at 0 and are reported, dice are only rolled from an explicit control, and
 * every target write is either made by its owner or relayed through the active GM client.
 *
 * The module deliberately keeps branch state in `flags.ak5e.witchcraft` and rebuilds every derived
 * index from receipts/flags on read. No actor cache is kept in module scope.
 */
import { esc, need, values, opaqueKey } from "./operation-kernel.mjs";
import { medicUses } from "./medic-uses.mjs";
import { spendResource, resourceValue } from "./play-uses.mjs";
import { getPool, registerLifeSupportPool } from "./resource-pools.mjs";
import { medicEnabled, medicLevel, medicBranch, maxArtLevel, flag } from "./medic-rules.mjs";
import { standardPools } from "./caster-rules.mjs";
import { resolvePoolArtData } from "./caster-setup.mjs";
import { registerArtConsumption, registerArtGrant } from "./arts-casting.mjs";
import {
  consumeRider,
  getReactions,
  matchRiders,
  onAk5eEvent,
  registerRider,
  registerRiderMatcher,
  removeRider,
  riderRecords
} from "./trigger-events.mjs";
import { tagExpiry } from "./feature-tags.mjs";
import { applyHealing } from "./damage-pipeline.mjs";
import { distanceFeet, tokenPoint } from "./standard-bearer-rules.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";

export const WITCHCRAFT_SOURCE = "Witchcraft";
export const WITCHCRAFT_CURSE_RIDER = "witchcraftWitchsBoon";
export const WITCHCRAFT_HALFWAY_STATE = "halfwayHouse";
const ATTUNEMENT_POOL = "lifeSupport";

const isTokenActor = doc => doc?.documentName === "Token" ? doc.actor : doc;
const resolveTarget = uuid => {
  if (!uuid) return null;
  try { return isTokenActor(globalThis.fromUuidSync?.(uuid)); }
  catch { return null; }
};
const actorLabel = target => target?.name ?? "target";
const previewOnly = data => data?.confirmed !== true;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const combatTurnKey = () => {
  const combat = globalThis.game?.combat;
  if (!combat?.started) return null;
  return `${combat.uuid ?? "combat"}:${combat.round ?? 0}:${combat.turn ?? 0}`;
};
const curseState = actor => {
  const state = flag(actor, "witchcraft")?.curse ?? null;
  if (!state) return null;
  const expires = Number(state.expiresWorldTime);
  const now = Number(globalThis.game?.time?.worldTime ?? 0);
  return Number.isFinite(expires) && now > expires ? null : state;
};
const curseTriggers = actor => {
  const list = flag(actor, "witchcraft")?.curseTriggers;
  return Array.isArray(list) ? list : [];
};
const halfwayState = actor => flag(actor, "witchcraft")?.[WITCHCRAFT_HALFWAY_STATE] ?? null;
const harmState = actor => flag(actor, "witchcraft")?.harm ?? null;
const deathState = actor => flag(actor, "witchcraft")?.lifeThroughDeath ?? null;
const isConstructActor = actor => String(actor?.system?.details?.type?.value ?? "").toLowerCase() === "construct";
const branchWarning = (warnings, actor, feature) => {
  const branch = medicBranch(actor);
  if (branch !== "witchcraft") warnings.push({ id: "branch", text: `${feature} requires the Witchcraft subclass; this character has ${branch ?? "no branch"}.` });
};

export function halfwayHouseReduction(actor) {
  const level = medicLevel(actor) ?? 1;
  return level >= 11 ? 2 : level >= 5 ? 1 : 0;
}

export function witchcraftLifeSupportRange(actor) {
  return (medicLevel(actor) ?? 1) >= 4 ? 60 : 5;
}

/**
 * Expected HP restored by the shared healing writer, including Ch.1 L138 Construct blocking and
 * the target's effective maximum. Used only to read the outcome before the heal target kind writes
 * it; the writer remains the single authority for the actual change.
 */
const healingPreview = (target, amount, source = "classFeature") => {
  const hp = target?.system?.attributes?.hp;
  if (!hp) return null;
  try {
    const heal = applyHealing(hp, Math.max(0, finite(amount, 0)), { source, isConstruct: isConstructActor(target) });
    return {
      restored: heal.blocked ? 0 : heal.restored,
      blocked: heal.blocked === true,
      reason: heal.reason ?? null,
      hpBefore: finite(hp.value, 0),
      hpAfter: heal.newHp
    };
  } catch { return null; }
};

/* ---------------------------------------------------------------- Scene range / visibility */

function tokenOf(actor) {
  if (!actor || actor.isToken) return actor?.token ?? null;
  try { return actor.getActiveTokens?.()?.[0] ?? null; } catch { return null; }
}

/** Distance in feet from the Medic's token to the target's token, or null when either is off-scene. */
function measuredRangeFeet(actor, target) {
  const source = tokenOf(actor), destination = tokenOf(target);
  if (!source?.parent || !destination?.parent || source.parent !== destination.parent) return null;
  try { return distanceFeet(source.parent, tokenPoint(source), tokenPoint(destination)); } catch { return null; }
}

/** Scene visibility when a token exists; null means the client cannot tell, so the table decides. */
function measuredVisibility(target) {
  const token = tokenOf(target);
  if (!token) return null;
  if (token.hidden === true) return false;
  if (token.visible === false) return false;
  return true;
}

/* ---------------------------------------------------------------- Native source-roll binding */

const AUTHORIZED_ROLL_LIMIT = 60;
const authorizedRolls = new Map();   // sourceRollId -> { actorUuid, total, sourceType, itemUuid, at }

function authorizedRoll(sourceRollId) {
  const id = sourceRollId === undefined || sourceRollId === null ? "" : String(sourceRollId);
  if (!id) return null;
  const direct = authorizedRolls.get(id);
  if (direct) return direct;
  // A cast ID names the same authorized roll as its damage event ID; accept either spelling.
  for (const record of authorizedRolls.values()) if (record.castId && record.castId === id) return record;
  return null;
}

function rememberAuthorizedRoll(event, sourceType) {
  const id = String(event?.eventId ?? "");
  if (!id || !sourceType) return null;
  const record = {
    id,
    actorUuid: event?.actorUuid ?? null,
    total: Math.max(0, finite(event?.total, 0)),
    sourceType,
    itemUuid: event?.itemUuid ?? null,
    castId: event?.castId ? String(event.castId) : null,
    at: Date.now()
  };
  authorizedRolls.delete(id);
  authorizedRolls.set(id, record);
  while (authorizedRolls.size > AUTHORIZED_ROLL_LIMIT) authorizedRolls.delete(authorizedRolls.keys().next().value);
  return record;
}

function itemSourceType(item) {
  if (!item) return null;
  // F1: D5 classifier must verify AK5e markers, never bare dnd5e types.
  const art = item.getFlag?.("ak5e", "art") ?? item.flags?.ak5e?.art;
  if (art?.enabled === true && art?.pool) return "art";
  const skill = item.getFlag?.("ak5e", "operatorSkill") ?? item.flags?.ak5e?.operatorSkill;
  if (skill === true || skill?.enabled === true) return "operatorSkill";
  return null;
}

/** Art vs Operator Skill origin of a damage roll, never guessed from a bare total. */
function damageSourceType(event) {
  if (event?.isArt === true || event?.castId) return "art";
  const itemUuid = event?.itemUuid;
  if (itemUuid) {
    try { const type = itemSourceType(globalThis.fromUuidSync?.(itemUuid)); if (type) return type; } catch { /* resolve best-effort */ }
  }
  // F1: do NOT fall back to bare dnd5e spell type; require AK5e art markers.
  return null;
}

function sourceLabel(type) { return type === "operatorSkill" ? "Operator Skill" : "Art"; }

/** A healing formula is not a damage roll for Harm or Life through Death. */
function isHealingOnlyRoll(event) {
  const types = (event?.rolls ?? []).flatMap(part => part?.types ?? []).map(type => String(type).toLowerCase());
  return types.length > 0 && types.every(type => type === "healing");
}

function hasUseForSourceRoll(actor, sourceRollId) {
  if (!sourceRollId) return false;
  const state = medicUses.state(actor);
  return (state?.undo ?? []).some(entry => entry.status !== "undone"
    && (entry.data?.sourceRollId === sourceRollId || entry.id === sourceRollId));
}

function hasUseForTrigger(actor, triggerEventId) {
  if (!triggerEventId) return false;
  const state = medicUses.state(actor);
  return (state?.undo ?? []).some(entry => entry.command === "witchcurse" && entry.status !== "undone"
    && entry.data?.triggerEventId === triggerEventId);
}

function offerRecipients(actor) {
  const users = values(globalThis.game?.users).filter(user => user?.isGM || actor?.testUserPermission?.(user, "OWNER"));
  return users.map(user => user.id);
}

/** Chat offer deduplication is durable: the message flag keeps one offer per key across re-renders/reloads. */
async function postWitchcraftOffer(actor, key, html) {
  const ChatMessage = globalThis.ChatMessage;
  if (!actor?.uuid || !ChatMessage?.implementation?.create) return null;
  if (values(globalThis.game?.messages).some(message => (message.getFlag?.("ak5e", "witchcraftOffer")
    ?? message.flags?.ak5e?.witchcraftOffer) === key)) return null;
  const recipients = offerRecipients(actor);
  return ChatMessage.implementation.create({
    ...(recipients.length ? { whisper: recipients } : {}),
    speaker: ChatMessage.implementation.getSpeaker?.({ actor }),
    content: html,
    flags: { ak5e: { witchcraftOffer: key } }
  });
}

const offerSafe = promise => Promise.resolve(promise).catch(error => console.error("AK5e | Witchcraft offer", error));

/** A relay gate is an owned-document target that fails before an unowned target is touched when no
 * GM is connected. Undoing it is a no-op, so a pending relayed use can always be retired. */
function relayGate(actor, label) {
  return {
    kind: "witchcraftRelayGate",
    uuid: actor.uuid,
    name: label ?? "GM relay",
    ready: true,
    gate: true
  };
}

function addHealingTarget(receipt, actor, target, amount, actual, { healingSource = "classFeature", ready = true, key = null } = {}) {
  if (!target) return null;
  const entry = {
    kind: "heal",
    ...(key ? { key } : {}),
    uuid: target.uuid,
    name: target.name,
    amount,
    healingSource,
    ready,
    actualRestored: actual
  };
  if (!target.isOwner && !globalThis.game?.user?.isGM) receipt.targets = [...(receipt.targets ?? []), relayGate(actor, "GM relay: unowned healing target")];
  receipt.targets = [...(receipt.targets ?? []), entry];
  return entry;
}

function addDamageTarget(receipt, actor, target, amount, damageType = "psychic", { ready = true, key = null } = {}) {
  if (!target) return null;
  const entry = { kind: "damage", ...(key ? { key } : {}), uuid: target.uuid, name: target.name, amount, damageType, ready };
  if (!target.isOwner && !globalThis.game?.user?.isGM) receipt.targets = [...(receipt.targets ?? []), relayGate(actor, "GM relay: unowned curse target")];
  receipt.targets = [...(receipt.targets ?? []), entry];
  return entry;
}

/** Staged/pending Witchcurse Psychic entry. Used instead of a plain `damage` entry when the
 * healing target is unowned, so the Psychic amount is not a nominal estimate: the kind's
 * apply reads the heal total the GM relay actually committed and deals exactly that. */
function addCursePsychicTarget(receipt, actor, curseTarget, healingTarget, { ready = true, key = "witchcursePsychic" } = {}) {
  if (!curseTarget) return null;
  const entry = { kind: "witchcraftCursePsychic", ...(key ? { key } : {}), uuid: curseTarget.uuid, name: curseTarget.name, amount: 0, damageType: "psychic", ready, healUuid: healingTarget?.uuid ?? null, healKey: "witchcurseHeal", curseUseId: receipt.id };
  if (!curseTarget.isOwner && !globalThis.game?.user?.isGM) receipt.targets = [...(receipt.targets ?? []), relayGate(actor, "GM relay: unowned curse target")];
  receipt.targets = [...(receipt.targets ?? []), entry];
  return entry;
}

/** The Boon rider is delivered through the use engine so an unowned recipient goes through the GM
 * relay; a direct registerRider() there would throw or silently skip the rider. */
function addBoonTarget(receipt, actor, target, riderId, expiry, label) {
  if (!target) return null;
  const entry = {
    kind: "witchcraftBoonRider",
    // The heal and the rider can share one recipient; a stable key keeps the GM relay from
    // matching the rider request to the heal entry and silently applying the wrong change.
    key: riderId,
    uuid: target.uuid,
    name: target.name,
    riderId,
    sourceActorUuid: actor.uuid,
    expiry,
    label,
    ready: true
  };
  receipt.targets = [...(receipt.targets ?? []), entry];
  return entry;
}

/* ---------------------------------------------------------------- Plans */

export const WITCHCRAFT_PLANS = {
  halfwayHouse(actor, _state, data = {}) {
    need(medicEnabled(actor), "Halfway House is a Witchcraft Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "Halfway House");
    const level = medicLevel(actor) ?? 1;
    const reduction = halfwayHouseReduction(actor);
    const pool = data.pool ?? data.poolId ?? null;
    const standardPool = standardPools.find(entry => entry.id === pool) ?? null;
    if (previewOnly(data) && !pool) warnings.push({ id: "pool", text: "Choose one Standard Arts Pool for Halfway House." });
    if (previewOnly(data) && pool && !standardPool) {
      warnings.push({ id: "pool", text: "Halfway House chooses a Standard Arts Pool; the selected pool is not a Standard pool, so no Arts are granted from it." });
    }
    if (data.artLevel !== undefined && finite(data.artLevel, 0) > maxArtLevel(level)) {
      warnings.push({ id: "artLevel", text: `Halfway House grants Arts up to the Medic maximum Art level (${maxArtLevel(level)}); level ${data.artLevel} is above that maximum.` });
    }
    const active = halfwayState(actor);
    if (previewOnly(data) && pool && active?.poolId === pool) {
      warnings.push({ id: "overlap", text: "Halfway House already grants this pool; choosing it again overlaps and only the larger reduction applies (never the sum)." });
    }
    const selfDefence = flag(actor, "medic")?.selfDefenceProtocol?.poolId;
    if (previewOnly(data) && pool && selfDefence && selfDefence === pool) {
      warnings.push({ id: "overlapSelfDefence", text: "This pool is also granted by Self-Defence Protocol; the larger AP reduction applies, never the sum." });
    }
    return {
      warnings,
      title: "Halfway House",
      async apply(next, receipt) {
        need(pool, "Choose one Standard Arts Pool for Halfway House.");
        // F4: the grant hook validates Standard-only; the apply records the selection
        // but warns when the pool is not Standard (warned-not-blocked per the 2026-11-02
        // adjudication; the UI only offers Standard pools).
        need(medicBranch(actor) === "witchcraft", "Only a Witchcraft Medic may use Halfway House to grant Arts.");
        const maxLevel = maxArtLevel(level);
        const standard = standardPool;
        const members = standard
          ? standard.members.map(member => ({ name: member.name, level: member.level, poolId: pool }))
          : [];
        const existing = new Set(values(actor.items).filter(item => item.type === "spell").map(item => String(item.name).toLowerCase()));
        const planned = [], missing = [];
        for (const member of members) {
          if (Number(member.level) > maxLevel) continue;
          if (existing.has(String(member.name).toLowerCase())) continue;
          const source = await resolvePoolArtData(member.name, member.level, [pool]);
          if (!source) { missing.push(member.name); continue; }
          source.system = { ...(source.system ?? {}), prepared: 2, method: "ak5e" };
          source.flags = { ...(source.flags ?? {}) };
          source.flags.ak5e = {
            ...(source.flags.ak5e ?? {}),
            pool,
            art: { ...(source.flags.ak5e?.art ?? {}), enabled: true, pool },
            witchcraftGrant: { source: "Halfway House", poolId: pool, name: member.name }
          };
          source._id = globalThis.foundry?.utils?.randomID?.() ?? `witchcraft-art-${pool}-${member.level}-${member.name}`;
          planned.push(source);
        }
        const created = planned.length ? await actor.createEmbeddedDocuments("Item", planned) : [];
        const itemIds = created.map(item => item.id ?? item._id).filter(Boolean);
        // Halfway House is an AP-cost reduction only: it never spends Life Support.
        const updates = {};
        updates["flags.ak5e.witchcraft.halfwayHouse"] = {
            poolId: pool,
            pool,
            reduction,
            useId: receipt.id,
            at: Date.now(),
            granted: planned.map(item => item.name),
            itemIds,
            missing
          };
        receipt.summary = `${actor.name} chooses ${pool} for Halfway House: the pool's Arts up to maximum Art level ${maxLevel} are learned and always prepared, with a ${reduction}-AP reduction.${standard ? "" : ` ${pool} is not a Standard Arts Pool, so no Arts are granted and no AP discount applies.`}${missing.length ? ` ${missing.length} unmapped Art(s) remain manual: ${missing.join(", ")}.` : ""}`;
        receipt.result = {
          pool,
          grantedPool: pool,
          reduction,
          apReduction: reduction,
          granted: planned.map(item => item.name),
          itemIds,
          missing
        };
        return updates;
      }
    };
  },

  healingThroughHarm(actor, _state, data = {}) {
    need(medicEnabled(actor), "Healing through Harm is a Witchcraft Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "Healing through Harm");
    if (previewOnly(data) && (medicLevel(actor) ?? 1) < 1) warnings.push({ id: "level", text: "Healing through Harm is a Witchcraft 1st-level feature." });
    const reactions = getReactions(actor);
    if (previewOnly(data) && reactions.available < 1) warnings.push({ id: "reaction", text: "No Reaction is available; Healing through Harm is a Reaction and the use is warning-only." });
    if (previewOnly(data) && harmState(actor)) {
      warnings.push({ id: "once", text: "Healing through Harm was already used; complete a Short Rest before using it again." });
    }
    const sourceRollId = data.sourceRollId ? String(data.sourceRollId) : null;
    const bound = sourceRollId ? authorizedRoll(sourceRollId) : null;
    const canonicalSourceId = bound?.id ?? sourceRollId;
    if (previewOnly(data)) {
      if (!sourceRollId) {
        warnings.push({ id: "sourceRoll", text: "Manual fallback: no source roll is linked. Use the offer on the Medic's own Art damage roll so the total and origin are verified." });
      } else if (!bound) {
        warnings.push({ id: "sourceRoll", text: "The linked source roll is not known on this client; reopen the offer on the Art damage roll instead of typing the total." });
      } else {
        if (bound.actorUuid !== actor.uuid) warnings.push({ id: "sourceRoll", text: "The linked source roll was not made by this Medic." });
        if (bound.sourceType !== "art") warnings.push({ id: "sourceRoll", text: "Healing through Harm needs the Medic's own Art damage roll; the linked roll is an Operator Skill or another source." });
      }
    }
    if (data.sameRollAs) {
      // Ruling 10 mutuality runs both ways: the same rolled total cannot fund Death and Harm.
      // F-D: the exclusion is per-roll, never per-flag. A Death-claimed roll is the ledger
      // entry (use id or its sourceRollId) or the Death flag's own sourceRollId; an unrelated
      // incoming roll must not warn. A Death flag with no recorded sourceRollId cannot prove
      // it is a different roll, so it warns conservatively. A cast ID is canonicalised to
      // its damage-event ID so either spelling names the same roll.
      const sameSource = authorizedRoll(data.sameRollAs)?.id ?? data.sameRollAs;
      const death = deathState(actor);
      const deathClaim = death?.sourceRollId ? (authorizedRoll(death.sourceRollId)?.id ?? death.sourceRollId) : null;
      const used = (medicUses.state(actor)?.undo ?? []).some(entry => entry.status !== "undone"
        && (entry.id === sameSource || (entry.data?.sourceRollId && entry.data.sourceRollId === sameSource))
        && (entry.command === "lifeThroughDeath" || entry.command === "healingThroughHarm"));
      if (used || (death ? (deathClaim === null || deathClaim === sameSource) : false)) warnings.push({ id: "exclusive", text: "Healing through Harm is mutually exclusive with Life through Death on the same roll." });
    }
    const typedTotal = finite(data.damageTotal ?? data.damage, 0);
    const total = bound ? bound.total : typedTotal;
    if (data.damageTotal === undefined && data.damage === undefined && !bound) warnings.push({ id: "damage", text: "Enter the rolled Art damage total; the module never rolls it." });
    return {
      warnings,
      title: "Healing through Harm (Reaction)",
      async apply(next, receipt) {
        if (sourceRollId) {
          need(bound, "The linked Art damage roll is not known on this client; reopen its offer and try again.");
          need(bound.actorUuid === actor.uuid, "The linked Art damage roll belongs to another character.");
          need(bound.sourceType === "art", "Healing through Harm requires the Medic's own Art damage roll.");
        }
        need(Number.isFinite(total) && total >= 0, "Enter the rolled Art damage total.");
        const gain = Math.floor(total / 2);
        const before = resourceValue(actor, { pool: ATTUNEMENT_POOL });
        const updates = {
          [`flags.ak5e.resourcePools.${ATTUNEMENT_POOL}.value`]: before + gain,
          "flags.ak5e.witchcraft.harm": { useId: receipt.id, at: Date.now(), damageTotal: total, gain, sourceRollId: canonicalSourceId }
        };
        receipt.reaction = { requested: true, triggerId: `${receipt.id}-healing-through-harm`, receipt: receipt.id,
          tags: ["damage"], perTrigger: true };
        receipt.summary = `${actor.name} uses their Reaction on Healing through Harm: rolled Art damage ${total} includes modifiers, so ${actor.name} gains floor(${total} / 2) = ${gain} Life Support (${before} → ${before + gain}). The gain may exceed the maximum; excess is lost on a Long Rest.`;
        receipt.result = { damageTotal: total, gain, lifeSupport: before + gain, reaction: "reaction", overMaximum: before + gain > (getPool(actor, ATTUNEMENT_POOL)?.max ?? Infinity), sourceRollId: canonicalSourceId, sourceType: bound?.sourceType ?? null, sourceBound: Boolean(bound), manualSource: !bound };
        return updates;
      }
    };
  },

  witchcraftLifeSupport(actor, _state, data = {}) {
    need(medicEnabled(actor), "Witchdoctor Life Support is a Witchcraft Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "Witchdoctor Life Support");
    const level = medicLevel(actor) ?? 1;
    const amount = finite(data.amount, 0);
    const typedRangeFt = data.rangeFt === undefined ? null : finite(data.rangeFt, null);
    const range = witchcraftLifeSupportRange(actor);
    const target = resolveTarget(data.targetUuid);
    const measured = target ? measuredRangeFeet(actor, target) : null;
    const rangeFt = measured ?? typedRangeFt;
    if (previewOnly(data) && level < 4) warnings.push({ id: "level", text: "Witchdoctor's 60-foot Life Support healing is a Witchcraft 4th-level feature." });
    if (previewOnly(data) && rangeFt !== null && rangeFt > range) {
      warnings.push({ id: "range", text: `That target is ${Math.round(rangeFt)} feet away; Witchdoctor Life Support healing reaches ${range} feet.` });
    }
    if (previewOnly(data) && target && measured === null && typedRangeFt !== null) {
      warnings.push({ id: "rangeManual", text: "The distance was entered by hand because no scene tokens are available; verify it at the table." });
    }
    const available = resourceValue(actor, { pool: ATTUNEMENT_POOL });
    if (previewOnly(data) && amount > available) {
      warnings.push({ id: "lifeSupport", text: `${amount} Life Support needed and ${available} remain; Life Support clamps at 0.` });
    }
    if (previewOnly(data) && !target) warnings.push({ id: "target", text: "No healing target chosen. Life Support will still be spent, but zero HP will be restored." });
    if (previewOnly(data) && target) {
      const visibility = measuredVisibility(target);
      if (visibility === false) warnings.push({ id: "visibility", text: `${target.name} is not visible on the scene; confirm the table's visibility before healing.` });
      if (visibility === null) warnings.push({ id: "visibility", text: `Cannot determine whether ${target.name} is visible (no scene token); confirm visibility at the table.` });
    }
    if (previewOnly(data) && data.boon === true && level < 11) warnings.push({ id: "level", text: "Witch's Boon is a Witchcraft 11th-level feature." });
    if (previewOnly(data) && target && !target.isOwner && !globalThis.game?.user?.isGM) {
      warnings.push({ id: "relay", text: "That Creature is not owned by you; the change is sent through the GM client and remains Not applied yet until a GM connects." });
    }
    if (data.boon === true) {
      if (!target) {
        if (previewOnly(data)) warnings.push({ id: "boonTarget", text: "Witch's Boon needs the Creature that regains the Hit Points; choose a target before using the Boon." });
        if (previewOnly(data) && amount < 5) warnings.push({ id: "boonThreshold", text: "Witch's Boon needs at least 5 actual Hit Points restored by Life Support; this healing is below that threshold." });
      } else {
        const expected = healingPreview(target, Math.min(amount, available));
        if (previewOnly(data) && expected !== null && expected.restored < 5) {
          warnings.push({ id: "boonThreshold", text: `Witch's Boon needs at least 5 actual Hit Points restored by Life Support; this healing restores ${expected.restored}${expected.blocked ? " (Constructs cannot regain HP from this source)" : ""}.` });
        }
      }
    }
    if (previewOnly(data) && (data.apSpent !== undefined || data.levelled !== undefined)) {
      const ap = finite(data.apSpent, 0);
      if (ap <= 0 || data.levelled !== true) warnings.push({ id: "efficient", text: "Efficient Life Support grants no Life Support for a cantrip or a zero-AP cast; choose a levelled Art that spent positive Arts Points." });
      warnings.push({ id: "efficientManual", text: "Manual Efficient fallback: the sheet normally derives this from the cast receipt; values entered here are not tied to a cast." });
    }
    return {
      warnings,
      title: "Witchdoctor Life Support",
      validateTarget(_source, receipt, entry, targetDoc) {
        if (!targetDoc) return false;
        if (entry.kind === "heal") return entry.healingSource === "classFeature" && entry.amount <= (receipt.result?.amount ?? 0);
        if (entry.kind === "witchcraftBoonRider") {
          const boon = receipt.result?.boon ?? null;
          // F3: a pending Boon (unowned target, actual outstanding) validates by identity so
          // the GM relay can complete it; the committed actual decides registration in apply.
          if (boon?.pending === true) return Boolean(boon.targetUuid === targetDoc.uuid && entry.riderId === boon.riderId);
          return Boolean(boon?.eligible === true && boon.targetUuid === targetDoc.uuid && entry.riderId === boon.riderId);
        }
        return false;
      },
      async apply(next, receipt) {
        need(Number.isFinite(amount) && amount >= 0, "Choose a whole number of Life Support to spend.");
        const before = resourceValue(actor, { pool: ATTUNEMENT_POOL });
        const updates = spendResource(actor, receipt, { pool: ATTUNEMENT_POOL, amount, label: "Life Support" });
        const spent = Math.min(amount, before);
        const spentAfter = Math.max(0, before - amount);
        const apSpent = data.apSpent === undefined ? 0 : Math.max(0, finite(data.apSpent, 0));
        const levelled = data.levelled === true;
        // Frozen D7 contract compatibility: direct plan callers may still supply apSpent/levelled.
        // The sheet never exposes these fields; the supported production path is the cast receipt
        // consumer below (registerArtConsumption), which writes into the cast's own pending update.
        const manualEfficient = data.apSpent !== undefined || data.levelled !== undefined;
        const efficientGain = levelled && apSpent > 0 ? apSpent * 2 : 0;
        let afterSpend = spentAfter;
        if (efficientGain > 0) {
          const max = getPool(actor, ATTUNEMENT_POOL)?.max ?? Infinity;
          afterSpend = Math.min(Math.max(max, before), spentAfter + efficientGain);
          updates[`flags.ak5e.resourcePools.${ATTUNEMENT_POOL}.value`] = afterSpend;
          updates["flags.ak5e.witchcraft.efficient"] = {
            useId: receipt.id,
            gain: efficientGain,
            apSpent,
            levelled,
            permission: "actionOrBonus",
            at: Date.now(),
            turnKey: combatTurnKey(),
            manualFallback: manualEfficient
          };
        }
        // F7: compute actual HP at apply time on the live target, not from a pre-write preview.
        // For owned targets the heal target kind will use the same applyHealing result.
        // For unowned targets the actual is pending until the GM relay completes.
        // Known limit (manager-adjudicated 2026-11-02): a concurrent modification of the
        // target's HP between this compute and the heal target-kind commit can diverge from
        // the recorded actual; the receipt records the apply-time result, not a defect.
        let actual = null;
        let pendingRelay = false;
        if (target) {
          if (target.isOwner || globalThis.game?.user?.isGM) {
            // Owned/GM: compute actual now so Boon and receipt are accurate.
            const hp = target.system?.attributes?.hp;
            if (hp) {
              try {
                const heal = applyHealing(hp, Math.max(0, finite(spent, 0)), { source: "classFeature", isConstruct: isConstructActor(target) });
                actual = heal.blocked ? 0 : heal.restored;
              } catch { actual = null; }
            }
          } else {
            // Unowned: actual is pending the GM relay; we can't compute it here.
            pendingRelay = true;
            actual = null;
          }
        }
        const restored = actual !== null ? { restored: actual, blocked: actual === 0 && isConstructActor(target) ? true : false } : null;
        addHealingTarget(receipt, actor, target, spent, actual);
        let boon = null;
        if (data.boon === true) {
          if (!target) {
            boon = { eligible: false, threshold: 5, actualRestored: null, reason: "no target" };
          } else if (pendingRelay) {
            // F7: Boon eligibility is pending the GM relay's actual HP result. The rider
            // entry is recorded now (F3) so the GM relay can complete it once the committed
            // actual is known; nothing is written locally. See witchcraftBoonRider.apply.
            const riderId = `witchcraftBoon:${receipt.id}:${target.id ?? "target"}`;
            let expiry = { trigger: "manual", instructions: "Until the end of the recipient's next turn." };
            if (globalThis.game?.combat?.started) {
              try { expiry = tagExpiry(actor, target, { trigger: "nextTurnEnd", expiryActor: "target" }); }
              catch { /* the table can still apply the manual expiry */ }
            }
            addBoonTarget(receipt, actor, target, riderId, expiry, "Witch's Boon: +1d10 Force on this Creature's Attacks");
            boon = { eligible: false, threshold: 5, actualRestored: null, reason: "pending GM relay", pending: true, riderId, targetUuid: target.uuid, expiry };
          } else if (actual === null) {
            boon = { eligible: false, threshold: 5, actualRestored: null, reason: "target HP unavailable" };
          } else if (actual >= 5) {
            const riderId = `witchcraftBoon:${receipt.id}:${target.id ?? "target"}`;
            let expiry = { trigger: "manual", instructions: "Until the end of the recipient's next turn." };
            if (globalThis.game?.combat?.started) {
              try { expiry = tagExpiry(actor, target, { trigger: "nextTurnEnd", expiryActor: "target" }); }
              catch { /* the table can still apply the manual expiry */ }
            }
            addBoonTarget(receipt, actor, target, riderId, expiry, "Witch's Boon: +1d10 Force on this Creature's Attacks");
            boon = {
              eligible: true,
              threshold: 5,
              actualRestored: actual,
              formula: "1d10",
              damageType: "force",
              rider: WITCHCRAFT_CURSE_RIDER,
              riderId,
              targetUuid: target.uuid,
              delivery: "ownerOrGmRelay"
            };
          } else {
            boon = { eligible: false, threshold: 5, actualRestored: actual, reason: restored?.blocked ? "construct blocked" : "below threshold" };
          }
        }
        const noTargetNote = !target ? " No target selected: zero HP restored; Life Support spend stands." : "";
        const efficiencyText = efficientGain > 0 ? ` Efficient Life Support grants ${efficientGain} Life Support and permits Life Support healing as an Action or Bonus Action this Turn.` : "";
        const blockedText = restored?.blocked ? ` ${restored.reason}` : "";
        const boonText = boon?.eligible ? ` Witch's Boon: ${actual} actual Hit Points restored, so ${actorLabel(target)} deals an additional 1d10 Force Damage with Attacks until the end of their next Turn (${WITCHCRAFT_CURSE_RIDER}).` : (boon?.pending ? ` Witch's Boon is pending the GM relay: the rider is delivered once the relayed heal restores at least 5 actual Hit Points.` : "");
        const shortfallText = amount > before ? ` Life Support short by ${amount - before}; the pool clamps at 0.` : "";
        receipt.summary = `${actor.name} spends ${spent} Life Support to restore ${actual ?? 0} actual Hit Points to ${actorLabel(target)} (${amount} requested).${shortfallText}${blockedText}${efficiencyText}${boonText}${noTargetNote}`;
        receipt.result = {
          amount,
          spentLS: spent,
          actualRestored: actual,
          pendingRelay,
          healingBlocked: restored?.blocked ? "Constructs cannot regain HP from this source." : null,
          targetUuid: target?.uuid ?? null,
          efficientGain,
          efficientApSpent: apSpent,
          efficientSource: manualEfficient ? "manual-fallback" : null,
          lsPermission: efficientGain > 0,
          boon,
          rangeSource: measured !== null ? "scene" : typedRangeFt !== null ? "typed" : null,
          ...(amount > before ? { shortfall: amount - before } : {})
        };
        return updates;
      }
    };
  },

  witchcurse(actor, _state, data = {}) {
    need(medicEnabled(actor), "Witchcurse is a Witchcraft Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "Witchcurse");
    const level = medicLevel(actor) ?? 1;
    const triggerEventId = data.triggerEventId === undefined || data.triggerEventId === null ? null : String(data.triggerEventId).trim();
    const trigger = Boolean(triggerEventId);
    const typedRangeFt = data.rangeFt === undefined ? null : finite(data.rangeFt, null);
    const target = resolveTarget(data.targetUuid);
    const curse = curseState(actor);
    const curseTarget = resolveTarget(curse?.targetUuid);
    const measuredHealing = target ? measuredRangeFeet(actor, target) : null;
    const measuredCurse = curseTarget ? measuredRangeFeet(actor, curseTarget) : null;
    const rangeFt = measuredHealing ?? measuredCurse ?? typedRangeFt;
    const activeTriggers = curseTriggers(actor);
    if (previewOnly(data) && level < 7) warnings.push({ id: "level", text: "Witchcurse is a Witchcraft 7th-level feature." });
    if (!trigger) {
      if (previewOnly(data) && !data.targetUuid) warnings.push({ id: "target", text: "Choose a visible Creature within 60 feet for Witchcurse." });
      if (previewOnly(data) && target && measuredVisibility(target) === false) warnings.push({ id: "visibility", text: `${target.name} is not visible on the scene; confirm the table's visibility before placing the curse.` });
      if (previewOnly(data) && target && measuredVisibility(target) === null) warnings.push({ id: "visibility", text: `Cannot determine whether ${target.name} is visible (no scene token); confirm visibility at the table.` });
      if (previewOnly(data) && rangeFt !== null && rangeFt > 60) warnings.push({ id: "range", text: `That Creature is ${Math.round(rangeFt)} feet away; Witchcurse reaches 60 feet.` });
      if (previewOnly(data) && target && measuredHealing === null && typedRangeFt !== null) warnings.push({ id: "rangeManual", text: "The distance was entered by hand because no scene tokens are available; verify it at the table." });
      const available = resourceValue(actor, { pool: ATTUNEMENT_POOL });
      if (previewOnly(data) && available < 10) {
        warnings.push({ id: "lifeSupport", text: `10 Life Support needed and ${available} remain; Life Support clamps at 0.` });
      }
      if (previewOnly(data) && curse) warnings.push({ id: "replace", text: `A Witchcurse is already active on ${curse.targetUuid}; placing this one replaces it (one curse per Medic).` });
    } else {
      if (!curse) warnings.push({ id: "noCurse", text: "No Witchcurse is active; place one before recording its trigger." });
      if (previewOnly(data) && !data.targetUuid) warnings.push({ id: "target", text: "Choose the visible healing target for the Witchcurse 2d6. Without a target the spend stands but zero HP is restored and zero Psychic damage is dealt." });
      if (previewOnly(data) && target) {
        const healVisibility = measuredVisibility(target);
        if (healVisibility === false) warnings.push({ id: "visibility", text: `${target.name} is not visible on the scene; confirm the table's visibility before recording the trigger.` });
        if (healVisibility === null) warnings.push({ id: "visibility", text: `Cannot determine whether ${target.name} is visible (no scene token); confirm visibility at the table.` });
      }
      if (previewOnly(data) && rangeFt !== null && rangeFt > 60) warnings.push({ id: "range", text: `That healing target is ${Math.round(rangeFt)} feet away; Witchcurse healing reaches 60 feet.` });
      if (previewOnly(data) && target && measuredHealing === null && typedRangeFt !== null) warnings.push({ id: "rangeManual", text: "The distance was entered by hand because no scene tokens are available; verify it at the table." });
      if (previewOnly(data) && !globalThis.game?.combat?.started) warnings.push({ id: "outsideCombat", text: "Outside combat, each Witchcurse occurrence is offered with this warning; no turn key is available." });
      const seen = activeTriggers.find(entry => entry.eventId === triggerEventId) ?? (hasUseForTrigger(actor, triggerEventId) ? { eventId: triggerEventId } : null);
      const turnKey = combatTurnKey();
      const turnSeen = turnKey ? activeTriggers.find(entry => entry.turnKey === turnKey && entry.eventId !== triggerEventId) : null;
      if (seen || finite(data.part, 1) > 1 || finite(data.priorPart, 0) >= 1 || turnSeen) {
        warnings.push({ id: "duplicate", text: "This trigger is a duplicate: the first occurrence per Turn is already recorded; combined damage parts of one application count once." });
      }
    }
    return {
      warnings,
      title: trigger ? "Witchcurse trigger (2d6)" : "Witchcurse (Bonus Action)",
      async apply(next, receipt) {
        if (!trigger) {
          need(data.targetUuid, "Choose a visible Creature for Witchcurse.");
          const before = resourceValue(actor, { pool: ATTUNEMENT_POOL });
          const updates = spendResource(actor, receipt, { pool: ATTUNEMENT_POOL, amount: 10, label: "Life Support" });
          updates["flags.ak5e.witchcraft.curse"] = {
            targetUuid: data.targetUuid,
            useId: receipt.id,
            placedAt: Date.now(),
            expiresWorldTime: finite(globalThis.game?.time?.worldTime, 0) + 60
          };
          updates["flags.ak5e.witchcraft.curseTriggers"] = [];
          // Common overspend rule: the pool clamps at 0 and the receipt names the shortfall,
          // matching the Witchdoctor Life Support heal path's summary/result fields.
          const shortfallText = before < 10 ? ` Life Support short by ${10 - before}; the pool clamps at 0.` : "";
          receipt.summary = `${actor.name} uses a Bonus Action and 10 Life Support to place a Witchcurse on ${data.targetUuid} for 1 minute (or until another Witchcurse is placed).${shortfallText}`;
          receipt.result = { targetUuid: data.targetUuid, useId: receipt.id, action: "bonusAction", cost: 10, spentLS: Math.min(10, before), duration: "1 minute", ...(before < 10 ? { shortfall: 10 - before } : {}) };
          return updates;
        }
        const sourceKind = String(data.sourceKind ?? data.source ?? "other");
        const total = data.damageTotal === undefined ? null : finite(data.damageTotal, 0);
        const stagedRoll = total === null;
        const activeCurse = curseState(actor);
        const healingTarget = target;
        const healingAmount = total ?? 0;
        // F7: compute actual HP at apply time on the live target for Witchcurse trigger.
        // F5: a targetless direct-total trigger records the known zero result, never nulls.
        let actual = null;
        let pendingRelay = false;
        if (!healingTarget && total !== null) {
          actual = 0;
        } else if (healingTarget && total !== null) {
          if (healingTarget.isOwner || globalThis.game?.user?.isGM) {
            const hp = healingTarget.system?.attributes?.hp;
            if (hp) {
              try {
                const heal = applyHealing(hp, Math.max(0, finite(healingAmount, 0)), { source: "classFeature", isConstruct: isConstructActor(healingTarget) });
                actual = heal.blocked ? 0 : heal.restored;
              } catch { actual = null; }
            }
          } else {
            pendingRelay = true;
            actual = null;
          }
        }
        const restored = actual !== null ? { restored: actual, blocked: actual === 0 && isConstructActor(healingTarget) ? true : false } : null;
        const psychic = actual ?? 0;
        const triggers = [...curseTriggers(actor), {
          eventId: triggerEventId,
          part: finite(data.part, 1),
          turnKey: combatTurnKey(),
          sourceKind,
          sourceRollId: data.sourceRollId ?? triggerEventId,
          useId: receipt.id,
          at: Date.now()
        }];
        if (!stagedRoll) {
          receipt.formula = "2d6";
          receipt.roll = total;
        } else {
          // The Medic must click the 2d6 control on the card. Targets stay unready until that
          // roll is recorded, so no nominal amount can be mistaken for actual restored HP.
          receipt.formula = "2d6";
          // F1(binding): the 2d6 total is not known yet. For an unowned healing target the
          // actual cannot be computed on this client at all: mark the receipt pending now so
          // the staged resolver below never reports client-estimated actuals for a relay.
          pendingRelay = Boolean(healingTarget) && !(healingTarget.isOwner || globalThis.game?.user?.isGM);
        }
        if (healingTarget) addHealingTarget(receipt, actor, healingTarget, stagedRoll ? 0 : healingAmount, stagedRoll ? null : actual, { ready: !stagedRoll, key: "witchcurseHeal" });
        if (curseTarget) {
          if (pendingRelay) {
            // Unowned healing target: the actual is unknowable until the GM relay commits
            // the heal. The completion kind below reads that committed actual and deals
            // equal Psychic damage, instead of dealing a nominal estimate now.
            addCursePsychicTarget(receipt, actor, curseTarget, healingTarget, { ready: !stagedRoll });
          } else {
            addDamageTarget(receipt, actor, curseTarget, stagedRoll ? 0 : psychic, "psychic", { ready: !stagedRoll, key: "witchcursePsychic" });
          }
        }
        const psychicText = actual === null ? "Psychic damage is recorded once the 2d6 is rolled and the target's actual restored HP is known." : `${curseTarget?.name ?? activeCurse?.targetUuid ?? "The cursed Creature"} takes ${psychic} Psychic Damage.`;
        const blockedText = restored?.blocked ? ` ${restored.reason}` : "";
        receipt.summary = `Witchcurse trigger (${sourceKind}): ${actor.name} explicitly rolls/records 2d6 = ${total ?? "awaiting the card's 2d6 roll"}; restore that many Hit Points to ${actorLabel(healingTarget)} within 60 feet, then the cursed Creature takes Psychic Damage equal to the Hit Points actually restored. ${psychicText}${blockedText}`;
        receipt.result = {
          acceptedSource: sourceKind,
          sourceKind,
          triggered: true,
          triggerEventId,
          sourceRollId: data.sourceRollId ?? triggerEventId,
          damageTotal: total,
          healingTargetUuid: healingTarget?.uuid ?? null,
          curseTargetUuid: activeCurse?.targetUuid ?? null,
          actualRestored: actual,
          pendingRelay,
          healingBlocked: restored?.blocked ? "Constructs cannot regain HP from this source." : null,
          psychicDamage: actual,
          formula: "2d6",
          rangeSource: measuredHealing !== null || measuredCurse !== null ? "scene" : typedRangeFt !== null ? "typed" : null
        };
        return { "flags.ak5e.witchcraft.curseTriggers": triggers };
      },
      resolveRoll(actor, receipt) {
        // useRoll() has stored the owner-clicked 2d6 total. Convert it to actual HP restored before
        // the plan's target changes are applied; Psychic damage follows that actual amount.
        // F1(binding): the actual must come from the live target, never from a client estimate.
        // When the healing target is unowned and no GM is connected on this client, the actual
        // is unknowable here: relay the nominal total (the GM relay caps it, as in the direct
        // path), keep the receipt pending, and never write estimated actuals.
        const total = Number(receipt.roll);
        if (!Number.isFinite(total)) return;
        const heal = receipt.targets?.find(entry => entry.kind === "heal");
        const damage = receipt.targets?.find(entry => entry.key === "witchcursePsychic") ?? receipt.targets?.find(entry => entry.kind === "damage");
        const healingTarget = resolveTarget(heal?.uuid);
        const owned = !healingTarget || healingTarget.isOwner || globalThis.game?.user?.isGM;
        if (!owned) {
          // Relay the nominal heal (the GM writer caps it, as in the direct path) but never
          // fabricate Psychic damage: the Psychic actual is unknown while the relay is pending.
          // The witchcraftCursePsychic entry below completes once the relayed heal commits.
          if (heal) { heal.amount = total; heal.actualRestored = null; heal.ready = true; }
          if (damage) { damage.amount = 0; damage.ready = true; }
          receipt.result = { ...(receipt.result ?? {}), damageTotal: total, actualRestored: null, healingBlocked: null, psychicDamage: null, pendingRelay: true };
          receipt.summary = `Witchcurse trigger (${receipt.result.acceptedSource}): ${actor.name} explicitly rolls/records 2d6 = ${total}; up to ${total} Hit Points are restored to ${actorLabel(healingTarget)} through the GM relay, and the cursed Creature takes Psychic Damage equal to the Hit Points actually restored (pending the relay).`;
          return;
        }
        // F7: use applyHealing on the live target for actual computation.
        let actual = 0;
        if (healingTarget) {
          const hp = healingTarget.system?.attributes?.hp;
          if (hp) {
            try {
              const healResult = applyHealing(hp, Math.max(0, finite(total, 0)), { source: "classFeature", isConstruct: isConstructActor(healingTarget) });
              actual = healResult.blocked ? 0 : healResult.restored;
            } catch { actual = 0; }
          }
        }
        if (heal) { heal.amount = actual; heal.actualRestored = actual; heal.ready = true; }
        if (damage) { damage.amount = actual; damage.ready = true; }
        receipt.result = { ...(receipt.result ?? {}), damageTotal: total, actualRestored: actual, healingBlocked: actual === 0 && isConstructActor(healingTarget) ? "Constructs cannot regain HP from this source." : null, psychicDamage: actual, pendingRelay: false };
        receipt.summary = `Witchcurse trigger (${receipt.result.acceptedSource}): ${actor.name} explicitly rolls/records 2d6 = ${total}; ${actorLabel(healingTarget)} restores ${actual} actual Hit Points, and the cursed Creature takes ${actual} Psychic Damage.`;
      }
    };
  },

  lifeThroughDeath(actor, _state, data = {}) {
    need(medicEnabled(actor), "Life through Death is a Witchcraft Medic feature.");
    const warnings = [];
    branchWarning(warnings, actor, "Life through Death");
    const level = medicLevel(actor) ?? 1;
    const damageTotal = finite(data.damageTotal, 0);
    const targetUuids = Array.isArray(data.targetUuids) ? data.targetUuids : [];
    const sourceRollId = data.sourceRollId ? String(data.sourceRollId) : null;
    const sourceType = data.sourceType ? String(data.sourceType) : null;
    const bound = sourceRollId ? authorizedRoll(sourceRollId) : null;
    const canonicalSourceId = bound?.id ?? sourceRollId;
    const sameRollAs = data.sameRollAs && data.sameRollAs !== sourceRollId ? data.sameRollAs : canonicalSourceId;
    const allocations = data.allocations && typeof data.allocations === "object" ? data.allocations : {};
    const allocated = targetUuids.reduce((sum, uuid) => sum + Math.max(0, finite(allocations[uuid], 0)), 0);
    const targets = targetUuids.map(uuid => {
      const target = resolveTarget(uuid);
      return {
        uuid,
        name: data.targetNames?.[uuid] ?? target?.name ?? uuid,
        rangeFeet: target ? measuredRangeFeet(actor, target) : null,
        visible: target ? measuredVisibility(target) : null
      };
    });
    if (previewOnly(data) && level < 15) warnings.push({ id: "level", text: "Life through Death is a Witchcraft 15th-level feature." });
    if (previewOnly(data) && deathState(actor)) warnings.push({ id: "once", text: "Life through Death was already used; finish a Long Rest before using it again." });
    if (previewOnly(data) && allocated > damageTotal) warnings.push({ id: "allocation", text: `The allocation totals ${allocated}, above the authorized maximum ${damageTotal}; it will be capped at ${damageTotal}.` });
    if (previewOnly(data) && allocated < damageTotal) warnings.push({ id: "remainder", text: `${damageTotal - allocated} Hit Points are intentionally unspent (remainder).` });
    if (previewOnly(data)) {
      if (!sourceRollId) {
        warnings.push({ id: "sourceRoll", text: "Manual fallback: no source roll is linked. Open the offer on the Medic's own Art or Operator Skill damage roll so the origin and maximum are authorized." });
      } else if (!bound) {
        warnings.push({ id: "sourceRoll", text: "The linked source roll is not known on this client; reopen the offer on the damage roll instead of typing the source." });
      } else {
        if (bound.actorUuid !== actor.uuid) warnings.push({ id: "sourceRoll", text: "The linked damage roll was not made by this Medic." });
        if (sourceType && bound.sourceType !== sourceType) warnings.push({ id: "sourceRoll", text: `The linked roll is a${bound.sourceType === "art" ? "n Art" : "n Operator Skill"}; the selected origin is different.` });
        if (damageTotal < bound.total) warnings.push({ id: "sourceRoll", text: `The maximum ${damageTotal} is below the linked roll's total ${bound.total}; a maximum cannot be lower than the rolled total.` });
      }
    }
    if (previewOnly(data)) {
      for (const target of targets) {
        if (target.rangeFeet !== null && target.rangeFeet > 60) warnings.push({ id: "range", text: `${target.name} is ${Math.round(target.rangeFeet)} feet away; Life through Death reaches 60 feet.` });
        // F5: warn on unknown (null) range/visibility, not just explicit false.
        if (target.visible === false) warnings.push({ id: "visibility", text: `${target.name} is not visible on the scene; confirm the table's visibility before allocating.` });
        if (target.visible === null) warnings.push({ id: "visibility", text: `Cannot determine whether ${target.name} is visible (no scene token); confirm visibility at the table.` });
        if (target.rangeFeet === null) warnings.push({ id: "range", text: `Cannot measure distance to ${target.name} (no scene tokens); verify it is within 60 feet at the table.` });
      }
    }
    if (sameRollAs) {
      // F-D: per-roll exclusion, mirrored with the Harm side. A Harm-claimed roll is the
      // ledger entry or the Harm flag's own sourceRollId; a Harm flag with no recorded
      // sourceRollId warns conservatively because it cannot prove a different roll.
      const harm = harmState(actor);
      const sameClaim = authorizedRoll(sameRollAs)?.id ?? sameRollAs;
      const harmClaim = harm?.sourceRollId ? (authorizedRoll(harm.sourceRollId)?.id ?? harm.sourceRollId) : null;
      const used = (medicUses.state(actor)?.undo ?? []).some(entry => entry.status !== "undone"
        && (entry.id === sameClaim || (entry.data?.sourceRollId && entry.data.sourceRollId === sameClaim))
        && (entry.command === "healingThroughHarm" || entry.command === "lifeThroughDeath"));
      if (used || (harm ? (harmClaim === null || harmClaim === sameClaim) : false)) warnings.push({ id: "exclusive", text: "Life through Death is mutually exclusive with Healing through Harm on the same roll, and one source roll funds it once." });
    }
    return {
      warnings,
      title: "Life through Death",
      targets,
      async apply(next, receipt) {
        need(Number.isFinite(damageTotal) && damageTotal >= 0, "Record the source-authorized maximum damage total.");
        need(targetUuids.length > 0, "Choose at least one visible Creature within 60 feet.");
        if (sourceRollId) {
          need(bound, "The linked damage roll is not known on this client; reopen its offer and try again.");
          need(bound.actorUuid === actor.uuid, "The linked damage roll belongs to another character.");
          need(!sourceType || bound.sourceType === sourceType, "The linked roll's Art or Operator Skill origin does not match the selected origin.");
          need(damageTotal >= bound.total, "The maximum damage total cannot be lower than the linked roll's total.");
          const duplicate = (medicUses.state(actor)?.undo ?? []).some(entry => entry.command === "lifeThroughDeath"
            && entry.status !== "undone" && entry.id !== receipt.id && entry.data?.sourceRollId === canonicalSourceId);
          need(!duplicate, "This source roll has already funded Life through Death.");
        }
        const entries = [], resultAllocations = [];
        // F2: hard-cap allocations at the authorized maximum.
        let remaining = damageTotal;
        for (const uuid of targetUuids) {
          const requested = Math.max(0, finite(allocations[uuid], 0));
          const amount = Math.min(requested, remaining);
          remaining = Math.max(0, remaining - amount);
          const target = resolveTarget(uuid);
          if (target && !target.isOwner && !globalThis.game?.user?.isGM) entries.push(relayGate(actor, "GM relay: unowned Life through Death target"));
          entries.push({
            kind: target ? "heal" : "witchcraftAllocation",
            uuid: target?.uuid ?? actor.uuid,
            name: target?.name ?? uuid,
            targetUuid: uuid,
            amount,
            healingSource: "classFeature",
            ready: true
          });
          resultAllocations.push({ uuid, name: target?.name ?? uuid, amount });
        }
        const spent = resultAllocations.reduce((sum, entry) => sum + entry.amount, 0);
        receipt.targets = entries;
        const updates = { "flags.ak5e.witchcraft.lifeThroughDeath": { useId: receipt.id, at: Date.now(), damageTotal, spent, sourceRollId: canonicalSourceId, sourceType: bound?.sourceType ?? sourceType } };
        receipt.summary = `${actor.name} takes the maximum ${damageTotal} damage from the ${sourceLabel(bound?.sourceType ?? sourceType ?? "Art")} roll (including modifiers, before mitigation) and divides ${spent} Hit Points among ${resultAllocations.length} visible Creature(s) within 60 feet; ${Math.max(0, damageTotal - spent)} remain unspent.`;
        receipt.result = {
          damageTotal,
          maximum: damageTotal,
          allocations: resultAllocations,
          remainder: Math.max(0, damageTotal - spent),
          unspent: Math.max(0, damageTotal - spent),
          sourceRollId: canonicalSourceId,
          sourceType: bound?.sourceType ?? sourceType,
          sourceBound: Boolean(bound),
          manualSource: !bound,
          targetUuids
        };
        return updates;
      }
    };
  }
};

// play-uses performs the GM-relay validation from the plan *definition* (the function), not from
// the object returned by that function. Attach the same checks there so an unowned target can be
// relayed and reversed. The returned plan keeps its copy for direct callers and tests.
WITCHCRAFT_PLANS.witchcraftLifeSupport.validateTarget = (source, receipt, entry, targetDoc) => {
  if (!targetDoc) return false;
  if (entry.kind === "heal") return entry.healingSource === "classFeature" && finite(entry.amount, 0) <= finite(receipt.result?.amount, 0);
  if (entry.kind === "witchcraftBoonRider") {
    const boon = receipt.result?.boon ?? null;
    // F3: a pending Boon (unowned target, actual outstanding) validates by identity so
    // the GM relay can complete it; the committed actual decides registration in apply.
    if (boon?.pending === true) return Boolean(boon.targetUuid === targetDoc.uuid && entry.riderId === boon.riderId);
    return Boolean(boon?.eligible === true && boon.targetUuid === targetDoc.uuid && entry.riderId === boon.riderId);
  }
  return false;
};
WITCHCRAFT_PLANS.witchcraftLifeSupport.validateRevert = WITCHCRAFT_PLANS.witchcraftLifeSupport.validateTarget;
WITCHCRAFT_PLANS.witchcurse.validateTarget = (source, receipt, entry, targetDoc) => {
  if (!targetDoc) return false;
  if (entry.kind === "heal") return finite(entry.amount, 0) <= finite(receipt.result?.damageTotal, 0);
  // F1(binding): while a relay is pending the Psychic actual is unknown, so the GM relay
  // validates the nominal total (the shared heal writer caps what is applied); once the roll
  // is resolved, the cap is the committed Psychic actual.
  if (entry.kind === "damage") {
    const cap = receipt.result?.psychicDamage ?? receipt.result?.damageTotal;
    return finite(entry.amount, 0) <= finite(cap, 0);
  }
  // F1(binding): the relay-completed Psychic entry carries the GM-committed actual, which
  // can never exceed the rolled total (the heal writer caps restoration at the nominal).
  if (entry.kind === "witchcraftCursePsychic") {
    return finite(entry.amount, 0) <= finite(receipt.result?.damageTotal, 0);
  }
  return false;
};
WITCHCRAFT_PLANS.witchcurse.validateRevert = WITCHCRAFT_PLANS.witchcurse.validateTarget;
WITCHCRAFT_PLANS.lifeThroughDeath.validateTarget = (source, receipt, entry, targetDoc) => {
  if (!targetDoc || entry.kind !== "heal") return false;
  const allocation = (receipt.result?.allocations ?? []).find(item => item.uuid === entry.targetUuid || item.uuid === entry.uuid);
  return Boolean(allocation && finite(entry.amount, 0) <= finite(allocation.amount, 0));
};
WITCHCRAFT_PLANS.lifeThroughDeath.validateRevert = WITCHCRAFT_PLANS.lifeThroughDeath.validateTarget;

/* ---------------------------------------------------------------- Target kinds */

const TARGET_KINDS = {
  witchcraftRelayGate: {
    async apply(_source, _useId, _entry, _target) {
      if (!globalThis.game?.users?.activeGM) throw new Error("GM relay pending: no GM is connected; this change is Not applied yet.");
      return true;
    },
    async revert() { return { removed: 0 }; },
    preview() { return "GM relay gate: no target change of its own."; },
    local: true
  },
  witchcraftAllocation: {
    async apply(_source, _useId, entry) { return { allocated: finite(entry.amount, 0) }; },
    async revert() { return { removed: 0 }; },
    preview(_source, _receipt, entry) { return `${entry.name}: ${finite(entry.amount, 0)} Hit Points allocated (no direct write).`; },
    local: true
  },
  witchcraftCursePsychic: {
    async apply(source, _useId, entry, target) {
      if (!target) throw new Error("The cursed Creature no longer exists.");
      // Idempotent replay: a retried relay must not double-deal. The target's own
      // applied record is the durable proof, readable on either client.
      const ownKey = opaqueKey(`${_useId}:${source.uuid}`);
      const done = target.flags?.ak5e?.medicUsesApplied?.[ownKey];
      if (done) {
        await writeCurseCompletion(source, entry.curseUseId, { phase: "complete", actualRestored: Number(done.damage) || 0, psychicDamage: Number(done.damage) || 0, pendingRelay: false, damageApplied: Number(done.damage) || 0, healUuid: entry.healUuid ?? null, curseUuid: target.uuid });
        return done;
      }
      // No client estimate: the Psychic amount is whatever the GM already committed
      // for this use's heal entry, read from the healed target's applied record.
      let committed = 0;
      if (entry.healUuid) {
        const healingTarget = resolveTarget(entry.healUuid);
        if (!healingTarget) throw new Error("The healed Creature no longer exists; retry after it is restored.");
        const healUseId = entry.healKey ? `${entry.curseUseId}_${opaqueKey(String(entry.healKey))}` : entry.curseUseId;
        const applied = healingTarget.flags?.ak5e?.medicUsesApplied?.[opaqueKey(`${healUseId}:${source.uuid}`)];
        if (!applied) throw new Error("The Witchcurse heal has not been applied yet; retry after the GM relay completes it.");
        committed = Math.max(0, Number(applied.hpGained) || 0);
      }
      entry.amount = committed;
      const hp = target.system?.attributes?.hp ?? {};
      const before = Number(hp.value) || 0;
      const after = Math.max(0, before - committed);
      const result = { before, after, damage: committed };
      await target.update({ "system.attributes.hp.value": after, [`flags.ak5e.medicUsesApplied.${ownKey}`]: result });
      await writeCurseCompletion(source, entry.curseUseId, { phase: "complete", actualRestored: committed, psychicDamage: committed, pendingRelay: false, damageApplied: committed, healUuid: entry.healUuid ?? null, curseUuid: target.uuid });
      return result;
    },
    async revert(source, useId, entry, target) {
      if (!target) return { removed: 0 };
      const key = opaqueKey(`${useId}:${source.uuid}`);
      const applied = target.flags?.ak5e?.medicUsesApplied?.[key];
      if (applied) {
        await target.update({ "system.attributes.hp.value": applied.before, [`flags.ak5e.medicUsesApplied.-=${key}`]: null });
      }
      if (entry.curseUseId) {
        try { await source.update?.({ [`flags.ak5e.witchcraft.curseCompletions.-=${entry.curseUseId}`]: null }); } catch { /* bookkeeping only; HP already restored above */ }
      }
      return { removed: applied ? true : false };
    },
    preview(source, _receipt, entry, _target) {
      const rec = entry.curseUseId ? source?.flags?.ak5e?.witchcraft?.curseCompletions?.[entry.curseUseId] : null;
      if (rec && rec.phase === "complete") return `${entry.name}: takes ${rec.psychicDamage ?? 0} Psychic Damage (restored ${rec.actualRestored ?? 0} HP).`;
      return `${entry.name ?? "The cursed Creature"}: Psychic damage pending the GM relay.`;
    }
  },
  witchcraftBoonRider: {
    async apply(source, _useId, entry, target) {
      if (!target) throw new Error("The Boon recipient no longer exists.");
      const { receipt: useReceipt } = readBoonCompletion(source, entry);
      const pendingBoon = useReceipt?.result?.boon?.pending === true ? useReceipt.result.boon : null;
      if (pendingBoon) {
        // F3 completion mode: this runs on the GM client while the relayed heal is being
        // (or has been) applied. Read the heal's committed actual from the target's applied
        // record — the shared heal writer stores hpGained there — never from a local estimate.
        // The heal entry carries no key, so its applied record is keyed by the bare use id.
        const applied = target.flags?.ak5e?.medicUsesApplied?.[opaqueKey(`${useReceipt.id}:${source.uuid}`)];
        const committed = applied ? Number(applied.hpGained) : NaN;
        if (!Number.isFinite(committed)) throw new Error("The Boon heal has not been applied yet; retry after the GM relay completes it.");
        if (committed < (pendingBoon.threshold ?? 5)) {
          await writeBoonCompletion(source, useReceipt.id, { phase: "declined", eligible: false, threshold: pendingBoon.threshold ?? 5, actualRestored: committed, reason: "below threshold", riderId: entry.riderId ?? pendingBoon.riderId, targetUuid: target.uuid });
          return { declined: true, actualRestored: committed };
        }
        // F2: durably record the stash BEFORE mutating any rider. Both writes below are
        // strict: a throw leaves the use pending (retryable) instead of reporting success
        // with a lost undo. A prior staged record's stash is preserved across retries.
        const prior = readBoonCompletion(source, entry).record;
        const replaced = Array.isArray(prior?.replaced) ? prior.replaced : await readReplacedBoonRiders(target, entry);
        await writeBoonCompletion(source, useReceipt.id, { phase: "staged", eligible: false, threshold: pendingBoon.threshold ?? 5, actualRestored: committed, reason: "staged", riderId: entry.riderId, targetUuid: target.uuid, delivery: "gmRelay", replaced });
        await removeReplacedBoonRiders(target, entry);
        const completed = await registerPendingBoonRider(source, entry, target);
        await writeBoonCompletion(source, useReceipt.id, { phase: "complete", eligible: true, threshold: pendingBoon.threshold ?? 5, actualRestored: committed, formula: "1d10", damageType: "force", rider: WITCHCRAFT_CURSE_RIDER, riderId: entry.riderId, targetUuid: target.uuid, delivery: "gmRelay", replaced });
        return { ...completed, actualRestored: committed };
      }
      // F3: stash replaced rider records so undo can restore them. The stash lives on the
      // entry for the local path (persisted by the engine save); the GM-completion path
      // stores its stash in the branch completion record instead (see writeBoonCompletion).
      const replaced = await readReplacedBoonRiders(target, entry);
      entry.replacedRiders = replaced.length ? replaced : undefined;
      await removeReplacedBoonRiders(target, entry);
      const completed = await registerPendingBoonRider(source, entry, target);
      return completed;
    },
    async revert(_source, _useId, entry, target) {
      if (!target) return { removed: 0 };
      const found = readBoonCompletion(_source, entry);
      const removed = riderRecords(target).some(record => record.id === entry.riderId);
      if (removed) await removeRider(target, entry.riderId);
      // The completion record is spent with the undo; clear it best-effort.
      if (found.receipt) {
        try { await _source.update?.({ [`flags.ak5e.witchcraft.boonCompletions.-=${found.receipt.id}`]: null }); }
        catch { /* the rider removal above is the linked undo; this is bookkeeping */ }
      }
      // F3: restore any riders that were replaced by this Boon, from the entry stash (local
      // path) or the branch completion record (GM-completed relay path).
      const stored = found.record?.replaced;
      const restore = Array.isArray(entry.replacedRiders) ? entry.replacedRiders : stored;
      if (Array.isArray(restore)) {
        for (const record of restore) {
          await registerRider({ ...record, actor: target });
        }
      }
      return { removed: removed ? 1 : 0 };
    },
    preview(_source, _receipt, entry) { return `${entry.name}: Witch's Boon rider (${entry.riderId}).`; }
  }
};

/**
 * F3: the GM-side completion record for a pending Boon. The engine ledger (`medicUses.undo`)
 * is saved whole by finish(), so a GM-side write into it would be clobbered; the completion
 * therefore lives under the branch's own flag path, which finish() never touches. The revert
 * path and the validator read it from there, giving linked undo for relay-completed riders.
 */
async function writeBoonCompletion(source, useId, record) {
  // F2: strict — a write failure throws instead of reporting success with a lost
  // undo stash. The apply path stages the stash before mutating any rider, and a
  // retry preserves the staged stash, so throwing here converges instead of deadlocking.
  await source.update({ [`flags.ak5e.witchcraft.boonCompletions.${useId}`]: record });
}
/**
 * F3: locate the Boon receipt for a rider entry. The engine passes a target-scoped use id
 * (`<receiptId>_<keyHash>` when the entry carries a key), so match by the entry's riderId
 * instead of trusting the id spelling.
 */
function findBoonReceipt(source, entry) {
  try {
    const ledger = source?.flags?.ak5e?.medicUses?.undo;
    if (!Array.isArray(ledger)) return null;
    const receipt = ledger.find(use => (use?.targets ?? []).some(change => change?.kind === "witchcraftBoonRider" && change?.riderId != null && change.riderId === entry?.riderId));
    return receipt ?? null;
  } catch { return null; }
}
function readBoonCompletion(source, entry) {
  const receipt = findBoonReceipt(source, entry);
  if (!receipt) return { receipt: null, record: null };
  try {
    const record = source?.flags?.ak5e?.witchcraft?.boonCompletions?.[receipt.id];
    return { receipt, record: record && typeof record === "object" ? record : null };
  } catch { return { receipt, record: null }; }
}

/**
 * F1/F7: the GM-side completion record for a relayed Witchcurse trigger. Same constraint
 * as the Boon record above: finish() saves the whole medicUses subtree, so a GM-side
 * receipt edit would be clobbered — the completion therefore lives under the branch's own
 * flag path, keyed by the bare receipt id. Strict: callers await this and a write failure
 * throws, so a missing record can never be mistaken for a completed zero.
 */
async function writeCurseCompletion(source, useId, record) {
  await source.update({ [`flags.ak5e.witchcraft.curseCompletions.${useId}`]: record });
}

/** F2/F3: pure read of the same-matcher riders a new Boon would replace. No writes, so it
 * is safe to call before the durable stash record exists. */
function readReplacedBoonRiders(target, entry) {
  return riderRecords(target)
    .filter(record => record.matcher === WITCHCRAFT_CURSE_RIDER && record.id !== entry.riderId)
    .map(record => JSON.parse(JSON.stringify(record)));
}
/** F2/F3: remove the replaced riders stashed by readReplacedBoonRiders. Missing riders
 * are skipped (idempotent retry), and removeRider itself returns false for those. */
async function removeReplacedBoonRiders(target, entry) {
  for (const record of riderRecords(target).filter(record => record.matcher === WITCHCRAFT_CURSE_RIDER && record.id !== entry.riderId)) {
    await removeRider(target, record.id);
  }
}
/** F3: shared rider registration used by both the local path and GM completion. */
async function registerPendingBoonRider(source, entry, target) {
  const existing = riderRecords(target).find(record => record.id === entry.riderId);
  if (!existing) {
    await registerRider({
      id: entry.riderId,
      actor: target,
      trigger: "attack",
      match: WITCHCRAFT_CURSE_RIDER,
      consume: "untilExpiry",
      expiry: entry.expiry,
      label: entry.label ?? "Witch's Boon: +1d10 Force on this Creature's Attacks",
      sourceActorUuid: entry.sourceActorUuid ?? source.uuid
    });
  }
  return { riderId: entry.riderId, targetUuid: target.uuid, replaced: true };
}

/* ---------------------------------------------------------------- Arts integration */

/** Halfway House's selected pool is a grant reduction. Overlap with Self-Defence is resolved by
 * grantFor() taking the larger reduction (U3-4), never by summing here. */
function witchcraftArtGrant(actor, item) {
  const state = halfwayState(actor);
  if (!state?.poolId) return {};
  // F4: validate that the stored pool ID is actually a Standard pool before applying reduction.
  const isStandard = standardPools.some(entry => entry.id === state.poolId);
  if (!isStandard) return {};
  const pool = item?.getFlag?.("ak5e", "pool") ?? item?.flags?.ak5e?.pool
    ?? item?.getFlag?.("ak5e", "art")?.pool ?? item?.flags?.ak5e?.art?.pool
    ?? item?.getFlag?.("ak5e", "medicArtGrant")?.poolId ?? item?.flags?.ak5e?.medicArtGrant?.poolId
    ?? item?.getFlag?.("ak5e", "witchcraftGrant")?.poolId ?? item?.flags?.ak5e?.witchcraftGrant?.poolId;
  if (!pool || pool !== state.poolId) return {};
  return { reduction: halfwayHouseReduction(actor), source: "Halfway House" };
}

/** Efficient Life Support joins the cast's own Actor update. It adds to any Life Support change
 * another provider already placed there instead of overwriting it. */
function efficientLifeSupportConsumer(activity, _usage, updates, receipt, quote) {
  const actor = activity?.actor;
  if (!actor || !medicEnabled(actor) || medicBranch(actor) !== "witchcraft" || (medicLevel(actor) ?? 1) < 11) return;
  const level = Number(receipt?.level ?? quote?.level ?? activity?.item?.system?.level ?? 0);
  const cost = Number(receipt?.cost ?? quote?.cost ?? 0);
  if (level <= 0 || !Number.isFinite(cost) || cost <= 0) {
    if (receipt) receipt.efficientLifeSupport = { gain: 0, apSpent: Math.max(0, cost), levelled: level > 0, reason: "cantrip or zero AP" };
    return;
  }
  const gain = Math.max(0, cost) * 2;
  updates.actor ??= {};
  // Do not write the Life Support path here. A cast-option provider (Urgency of Treatment)
  // writes that same path later in this Actor update; record the gain and let the
  // preUpdateActor reconciliation add it to the provider's final value instead of overwriting it.
  updates.actor["flags.ak5e.witchcraft.efficient"] = {
    useId: receipt?.id ?? null,
    gain,
    apSpent: cost,
    levelled: true,
    permission: "actionOrBonus",
    cast: true,
    at: Date.now(),
    turnKey: combatTurnKey()
  };
  if (receipt) receipt.efficientLifeSupport = { gain, apSpent: cost, levelled: true, permission: "actionOrBonus" };
}

/* ---------------------------------------------------------------- Native offers */

const wiredWitchcraftOffers = new WeakSet();

function resolveMessage(uuidOrId) {
  if (!uuidOrId) return null;
  try {
    return globalThis.fromUuidSync?.(uuidOrId)
      ?? globalThis.game?.messages?.get?.(String(uuidOrId).split(".").at(-1))
      ?? null;
  } catch { return null; }
}

function hitTakenSourceKind(event) {
  if (event?.isArt === true || event?.castId) return "art-cast";
  // F1: resolve the item and verify AK5e markers instead of accepting bare dnd5e types.
  const itemUuid = event?.itemUuid;
  if (itemUuid) {
    try {
      const item = globalThis.fromUuidSync?.(itemUuid);
      if (item) {
        const type = itemSourceType(item);
        if (type === "art") return "art-cast";
        if (type === "operatorSkill") return "operator-skill";
      }
    } catch { /* best-effort */ }
  }
  // Legacy: check message-embedded item for AK5e markers, not bare dnd5e types.
  const message = resolveMessage(event?.messageUuid);
  const item = message?.flags?.dnd5e?.item ?? null;
  if (item) {
    const type = itemSourceType(item);
    if (type === "art") return "art-cast";
    if (type === "operatorSkill") return "operator-skill";
  }
  return null;
}

function harmOfferHtml(actor, event, total) {
  return `<p><strong>Healing through Harm (Reaction).</strong> ${esc(actor.name)} rolled <strong>${esc(total)}</strong> Art damage.</p>
    <p><button type="button" data-ak5e-witchcraft-harm="${esc(event.eventId)}" data-actor="${esc(actor.uuid)}" data-total="${esc(total)}">Use Healing through Harm: gain ${esc(Math.floor(total / 2))} Life Support</button></p>
    <p>This opens the confirmed Reaction use; the module never applies it automatically.</p>`;
}

function deathOfferHtml(actor, event, sourceType) {
  return `<p><strong>Life through Death.</strong> ${esc(actor.name)} may replace this ${esc(sourceLabel(sourceType))} damage roll with its maximum.</p>
    <p><button type="button" data-ak5e-witchcraft-death="${esc(event.eventId)}" data-actor="${esc(actor.uuid)}" data-source="${esc(sourceType)}">Open Life through Death allocation</button></p>
    <p>The source roll is linked automatically; enter its maximum total and divide it among visible Creatures within 60 feet. The module never rolls or applies the damage.</p>`;
}

function curseOfferHtml(actor, event, sourceKind) {
  return `<p><strong>Witchcurse triggered.</strong> ${esc(event.actorName ?? event.actorUuid ?? "The cursed Creature")} took ${esc(sourceKind === "operator-skill" ? "Operator Skill" : "Arts")} damage.</p>
    <p><button type="button" data-ak5e-witchcraft-curse="${esc(event.eventId)}" data-actor="${esc(actor.uuid)}" data-source="${esc(sourceKind)}">Open the Witchcurse 2d6 trigger</button></p>
    <p>The Medic clicks the 2d6 control; the trigger event is linked for first-occurrence deduplication.</p>`;
}

function boonOfferHtml(actor, record, event) {
  // U3-9 / D8: the +1d10 Force is rolled by the recipient's own damage roll. The module never
  // starts a damage roll: this card only tells the owner to add the die themselves.
  return `<p><strong>Witch's Boon.</strong> ${esc(actor.name)} makes an Attack while carrying the Boon.</p>
    <p>Roll 1d10 yourself and add it to this Attack's damage as Force. The module never rolls or changes the native roll.</p>`;
}

/** Native damage roll of a Witchcraft Medic: link its ID and offer Harm / Life through Death once. */
async function onWitchcraftDamageRoll(event) {
  const actor = resolveTarget(event?.actorUuid);
  if (!actor?.isOwner || !medicEnabled(actor) || medicBranch(actor) !== "witchcraft") return;
  const sourceType = damageSourceType(event);
  if (!sourceType || isHealingOnlyRoll(event)) return;
  const bound = rememberAuthorizedRoll(event, sourceType);
  if (!bound || hasUseForSourceRoll(actor, event.eventId)) return;
  const level = medicLevel(actor) ?? 1;
  if (level >= 1 && sourceType === "art" && !harmState(actor)) {
    let available = 0;
    try { available = Number(getReactions(actor)?.available ?? 0); } catch { available = 0; }
    if (available >= 1) {
      await postWitchcraftOffer(actor, `harm:${event.eventId}`, harmOfferHtml(actor, event, bound.total));
    }
  }
  if (level >= 15 && !deathState(actor)) {
    await postWitchcraftOffer(actor, `death:${event.eventId}`, deathOfferHtml(actor, event, sourceType));
  }
}

/** First Witchcurse occurrence per Turn: the offered card carries the real trigger event ID. */
async function onWitchcraftHitTaken(event) {
  if (!event?.actorUuid) return;
  const sourceKind = hitTakenSourceKind(event);
  if (!sourceKind) return;
  const turnKey = combatTurnKey();
  for (const actor of values(globalThis.game?.actors)) {
    if (!medicEnabled(actor) || medicBranch(actor) !== "witchcraft" || (medicLevel(actor) ?? 1) < 7) continue;
    const curse = curseState(actor);
    const curseActor = curse ? resolveTarget(curse.targetUuid) : null;
    if (!curse || curseActor?.uuid !== event.actorUuid) continue;
    const triggers = curseTriggers(actor);
    if (triggers.some(entry => entry.eventId === event.eventId || (turnKey && entry.turnKey === turnKey))) continue;
    if (hasUseForTrigger(actor, event.eventId)) continue;
    // One offer per combat Turn: later damage parts of the same application or later hits in the
    // same Turn reuse the first offer instead of stacking a second 2d6 prompt.
    await postWitchcraftOffer(actor, `curse:${turnKey ?? event.eventId}`, curseOfferHtml(actor, event, sourceKind));
  }
}

/** Every Attack the Boon recipient makes consumes the rider and tells the owner to add the
 * +1d10 Force to their own damage roll. No module roll is started (U3-9/D8). */
async function onWitchcraftAttack(event) {
  const actor = resolveTarget(event?.actorUuid);
  if (!actor?.isOwner) return;
  const records = matchRiders(event, actor).filter(record => record.matcher === WITCHCRAFT_CURSE_RIDER);
  for (const record of records) {
    const consumed = await consumeRider(record.id, { actor, receipt: String(event.eventId) });
    if (!consumed?.ok || consumed.replayed) continue;
    await postWitchcraftOffer(actor, `boon:${record.id}:${event.eventId}`, boonOfferHtml(actor, record, event));
  }
}

/** Chat-card controls are explicit, owner-clicked actions; no card rolls or writes on its own. */
async function handleWitchcraftOfferClick(event) {
  const target = event?.target;
  const harm = target?.closest?.("[data-ak5e-witchcraft-harm]");
  if (harm) {
    const actor = resolveTarget(harm.dataset.actor);
    if (!actor) return;
    const sheet = await import("./witchcraft-sheet.mjs");
    const done = await sheet.commandHealingThroughHarm(actor, {
      damageTotal: Number(harm.dataset.total ?? 0),
      sourceRollId: harm.dataset.ak5eWitchcraftHarm,
      native: true
    });
    if (done) harm.disabled = true;
    return;
  }
  const death = target?.closest?.("[data-ak5e-witchcraft-death]");
  if (death) {
    const actor = resolveTarget(death.dataset.actor);
    if (!actor) return;
    const sheet = await import("./witchcraft-sheet.mjs");
    const done = await sheet.commandLifeThroughDeath(actor, {
      sourceRollId: death.dataset.ak5eWitchcraftDeath,
      sourceType: death.dataset.source,
      native: true
    });
    if (done) death.disabled = true;
    return;
  }
  const curse = target?.closest?.("[data-ak5e-witchcraft-curse]");
  if (curse) {
    const actor = resolveTarget(curse.dataset.actor);
    if (!actor) return;
    const sheet = await import("./witchcraft-sheet.mjs");
    const done = await sheet.commandWitchcurse(actor, {
      triggerEventId: curse.dataset.ak5eWitchcraftCurse,
      sourceKind: curse.dataset.source,
      native: true
    });
    if (done) curse.disabled = true;
    return;
  }
  // The Boon card carries no control: the owner adds 1d10 Force to their own damage roll.
  // (A legacy card button, if present, is inert and never starts a module roll.)
  const boon = target?.closest?.("[data-ak5e-witchcraft-boon]");
  if (boon) {
    boon.disabled = true;
  }
}

function wireWitchcraftOffer(message, html) {
  const root = globalThis.HTMLElement && html instanceof globalThis.HTMLElement ? html : html?.[0] ?? html;
  if (!root?.addEventListener || wiredWitchcraftOffers.has(root)) return;
  const offer = message?.getFlag?.("ak5e", "witchcraftOffer") ?? message?.flags?.ak5e?.witchcraftOffer;
  if (!offer) return;
  wiredWitchcraftOffers.add(root);
  root.addEventListener("click", event => {
    offerSafe(handleWitchcraftOfferClick(event));
  });
}

/* ---------------------------------------------------------------- Cleanup */

function witchcraftCleanup(_state, receipt, actor) {
  const result = receipt?.result ?? {};
  const ids = Array.isArray(result.itemIds) ? result.itemIds : [];
  if (ids.length) {
    Promise.resolve(actor?.deleteEmbeddedDocuments?.("Item", ids)).catch(error => console.error("AK5e | Witchcraft grant cleanup", error));
  }
  const riderId = result.boon?.riderId;
  const target = resolveTarget(result.boon?.targetUuid ?? result.targetUuid);
  // An unowned recipient's rider is reversed by the engine's GM relay target kind; calling
  // removeRider here on the Medic's client would only throw a permission error.
  if (riderId && target && (target.isOwner || globalThis.game?.user?.isGM)) {
    Promise.resolve(removeRider(target, riderId)).catch(error => console.error("AK5e | Witchcraft rider cleanup", error));
  }
}

/* ---------------------------------------------------------------- Retained index / rest hooks */

function clearExhaustedRestState(actor, restType) {
  if (!actor?.isOwner || !medicEnabled(actor)) return;
  const updates = {};
  if (["short", "long"].includes(restType)) {
    if (harmState(actor)) updates["flags.ak5e.witchcraft.-=harm"] = null;
  }
  if (restType === "long") {
    if (deathState(actor)) updates["flags.ak5e.witchcraft.-=lifeThroughDeath"] = null;
    if (flag(actor, "witchcraft")?.efficient) updates["flags.ak5e.witchcraft.-=efficient"] = null;
    // Ruling 5 and the Harm card: the gain may exceed the maximum, but the excess is lost on a
    // Long Rest. The rest hook runs alongside the system's recovery, so clamp in this same update
    // while still clearing the rest-scoped flags above.
    const max = getPool(actor, ATTUNEMENT_POOL)?.max;
    const value = resourceValue(actor, { pool: ATTUNEMENT_POOL });
    if (Number.isFinite(max) && value > max) updates[`flags.ak5e.resourcePools.${ATTUNEMENT_POOL}.value`] = max;
  }
  if (Object.keys(updates).length) Promise.resolve(actor.update(updates)).catch(error => console.error("AK5e | Witchcraft rest", error));
}

let hooksInstalled = false;

/** Idempotent registration. Called from the module's ready hook by its parent. */
export function registerWitchcraftHooks() {
  if (hooksInstalled) return false;
  hooksInstalled = true;
  registerLifeSupportPool();
  // play-uses exposes the undo lifecycle as the "undoUse" command; older and frozen callers use
  // the short `medicUses.undo(actor, useId)` alias. Install it once on the shared engine without
  // changing its receipt or serialization behaviour.
  if (typeof medicUses.undo !== "function") {
    medicUses.undo = (actor, useId, requester = globalThis.game?.user) =>
      medicUses.command(actor, "undoUse", { useId }, `undo-${globalThis.foundry?.utils?.randomID?.() ?? Date.now().toString(36)}`, requester);
  }
  registerArtGrant(witchcraftArtGrant);
  registerArtConsumption(efficientLifeSupportConsumer);
  registerRiderMatcher(WITCHCRAFT_CURSE_RIDER, (payload) => {
    if (payload?.kind !== "attack") return false;
    // Native attack events carry raw.actor; event-only payloads name the attacker by UUID.
    const actor = payload?.raw?.actor ?? payload?.raw?.subject?.actor ?? payload?.actor
      ?? (payload?.actorUuid ? globalThis.fromUuidSync?.(payload.actorUuid) : null);
    return Boolean(actor?.uuid);
  });
  medicUses.register({ plans: WITCHCRAFT_PLANS, targetKinds: TARGET_KINDS, cleanup: witchcraftCleanup });
  onAk5eEvent("damageRoll", event => offerSafe(onWitchcraftDamageRoll(event)));
  onAk5eEvent("hitTaken", event => offerSafe(onWitchcraftHitTaken(event)));
  onAk5eEvent("attack", event => offerSafe(onWitchcraftAttack(event)));
  if (globalThis.Hooks?.on) {
    Hooks.on("renderChatMessageHTML", (message, html) => wireWitchcraftOffer(message, html));
    Hooks.on("dnd5e.renderChatMessage", (message, html) => wireWitchcraftOffer(message, html));
    // Efficient Life Support joins the cast's own pending Actor update. The provider runs before
    // cast-option providers, so add the gain here, after Urgency (or any other provider) has
    // written the final Life Support value. The efficient marker is only present on that cast.
    Hooks.on("preUpdateActor", (actor, changes) => {
      try {
        const efficient = changes?.["flags.ak5e.witchcraft.efficient"] ?? changes?.flags?.ak5e?.witchcraft?.efficient;
        const gain = Number(efficient?.gain) || 0;
        if (!gain || efficient?.cast !== true) return;
        const path = `flags.ak5e.resourcePools.${ATTUNEMENT_POOL}.value`;
        const stored = actor?.flags?.ak5e?.resourcePools?.[ATTUNEMENT_POOL]?.value;
        // Actor update data may be flat (provider wrote the dotted path) or nested. Read both;
        // the flat path is written last so it takes precedence for the final update.
        const nested = changes?.flags?.ak5e?.resourcePools?.[ATTUNEMENT_POOL]?.value;
        const base = changes?.[path] !== undefined ? Number(changes[path])
          : nested !== undefined ? Number(nested) : Number(stored) || 0;
        const max = getPool(actor, ATTUNEMENT_POOL)?.max ?? Infinity;
        changes[path] = Math.min(Math.max(max, base), base + gain);
      } catch (error) {
        console.error("AK5e | Efficient Life Support reconciliation", error);
      }
    });
    Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      const type = config.type ?? result?.type ?? (config.longRest ? "long" : "short");
      clearExhaustedRestState(actor, type);
    });
    const clearTurnPermission = (combat, previous, current) => {
      const nextKey = combat?.started ? `${combat.uuid ?? "combat"}:${combat.round ?? 0}:${combat.turn ?? 0}` : null;
      for (const actor of values(globalThis.game?.actors)) {
        if (!actor?.isOwner || !medicEnabled(actor)) continue;
        const efficient = flag(actor, "witchcraft")?.efficient;
        if (!efficient?.turnKey || efficient.turnKey === nextKey) continue;
        Promise.resolve(actor.update({ "flags.ak5e.witchcraft.-=efficient": null }))
          .catch(error => console.error("AK5e | Efficient Life Support expiry", error));
      }
    };
    Hooks.on("combatTurnChange", clearTurnPermission);
    Hooks.on("deleteCombat", combat => clearTurnPermission(combat, null, null));
  }
  return true;
}

/** Read-only branch view used by the sheet; never writes. */
export function getWitchcraftView(actor) {
  const level = medicLevel(actor) ?? 1;
  const state = flag(actor, "witchcraft") ?? {};
  const pool = getPool(actor, ATTUNEMENT_POOL);
  return {
    branch: "witchcraft",
    level,
    reduction: halfwayHouseReduction(actor),
    range: witchcraftLifeSupportRange(actor),
    half: state.halfwayHouse ?? null,
    curse: state.curse ?? null,
    triggerCount: Array.isArray(state.curseTriggers) ? state.curseTriggers.length : 0,
    harm: state.harm ?? null,
    efficient: state.efficient ?? null,
    lifeThroughDeath: state.lifeThroughDeath ?? null,
    lifeSupport: pool ? { value: pool.value, max: pool.max, over: Math.max(0, pool.value - pool.max) } : null,
    features: {
      halfwayHouse: level >= 1,
      healingThroughHarm: level >= 1,
      witchdoctor: level >= 4,
      witchcurse: level >= 7,
      efficientLifeSupport: level >= 11,
      witchsBoon: level >= 11,
      lifeThroughDeath: level >= 15
    }
  };
}

export default { registerWitchcraftHooks, WITCHCRAFT_PLANS, getWitchcraftView };
