/**
 * Defender › Sentry (Ch.3 L1679–1722), following WORKFLOW.md §3.2 through the Defender use engine (defender-uses.mjs):
 * - Pavise: plant a Heavy Shield (Bonus Action). Its position is a 10-ft circle template marker, or a token the player or
 *   GM placed and linked (any prop creature, so it can be moved, targeted and re-imaged). Allies within 10 feet, including
 *   the Sentry, gain Shelter's Disadvantage against Attacks from the opposite side of the shield; the shield is Half Cover.
 * - Marksman Training: Operator Skill access (operator-progression.mjs) and a Marksman Fighting Style (progression).
 * - Advance and Fire: a prompt when the Sentry or a sheltered ally is attacked; a Reaction (Retributor: once per Round free)
 *   and a 1-Resilience refund. The player rolls their own weapon's attack.
 * - Pointman: Bar the Gates (re-plant after Leaping Defence) and Heads Down (an automatic Dexterity save success).
 * - Firebase: Torrent of Lead, Wall of Steel (once per Long Rest).
 */
import { defenderLevel, defenderBranch, defenderState, equippedShields, shieldInfo, paviseOpposite, PAVISE_FEET } from "./defender-rules.mjs";
import { defenderEnabled, defenderTurn, ownTurn, primaryToken, nearFeet, shelterAppliesTo } from "./defender-features.mjs";
import { defenderUses } from "./defender-uses.mjs";
import { warn, spendResource, resourceValue } from "./play-uses.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { onAk5eEvent, getReactions, spendReaction } from "./trigger-events.mjs";
import { tokenPoint } from "./standard-bearer-rules.mjs";
import { flag, values, need, esc, opaqueKey } from "./operation-kernel.mjs";

export const SENTRY_FEATURES = Object.freeze({
  equipmentExchange: "subclass-feature-defender-sentry-equipment-exchange-392",
  pavise: "subclass-feature-defender-sentry-1st-level-pavise-645",
  marksmanTraining: "subclass-feature-defender-sentry-4th-level-marksman-training-1451",
  advanceAndFire: "subclass-feature-defender-sentry-9th-level-advance-and-fire-1865",
  pointman: "subclass-feature-defender-sentry-12th-level-pointman-2174",
  firebase: "subclass-feature-defender-sentry-15th-level-firebase-2970"
});
/** Readings offered when the GM has not ruled (DECISIONS.md "Juggernaut, Protector and Sentry branches"). */
export const SENTRY_READINGS = Object.freeze({
  paviseShield: { label: "Plant Pavise: is the planted shield still equipped (its AC and Damage Reduction)?", options: [
    { value: "unequip", label: "No: unequip it while it is planted, and equip it again when recovered" },
    { value: "keep", label: "Yes: leave it equipped" }] }
});

export const isSentry = actor => defenderEnabled(actor) && defenderBranch(actor) === "sentry";
export const heavyShield = actor => equippedShields(actor?.items).find(entry => entry.info.heavy)?.item ?? null;
const levelWarning = (warnings, actor, level, name) => {
  if (defenderLevel(actor) < level) warn(warnings, "level", `${name} is a Sentry level ${level} feature; this Defender is level ${defenderLevel(actor)}.`);
};
function actorAt(uuid, label = "the Creature") {
  const doc = globalThis.fromUuidSync?.(uuid), actor = doc?.documentName === "Token" ? doc.actor : doc;
  need(actor?.documentName === "Actor", `Choose ${label}.`);
  return actor;
}
const tokensOf = actor => values(actor?.getActiveTokens?.(true, true) ?? []).map(t => t.document ?? t);

/* ---------------------------------------------------------------- the planted shield */

export const pavise = actor => defenderUses.state(actor).data.pavise ?? null;
/** The planted shield's marker document (template or linked token), or null when it is gone. */
export function paviseDocument(actor) {
  const record = pavise(actor);
  const doc = record?.uuid ? globalThis.fromUuidSync?.(record.uuid) : null;
  return doc && ["MeasuredTemplate", "Token"].includes(doc.documentName) ? doc : null;
}
/** The planted shield's centre on its Scene: a circle template's origin, or a linked token's centre. */
export function pavisePoint(actor) {
  const doc = paviseDocument(actor);
  if (!doc?.parent) return null;
  const point = doc.documentName === "Token" ? tokenPoint(doc) : { x: Number(doc.x), y: Number(doc.y), elevation: Number(doc.elevation ?? 0) };
  return { ...point, scene: doc.parent };
}
/**
 * Plant Pavise (L1692): a token listed as an ally (the Sentry included) within 10 feet of the planted shield benefits from
 * Shelter against an Attack whose attacker is on the opposite side of the shield, seen from the token (logged reading).
 */
export function paviseProtects(sentry, targetToken, attackerToken) {
  const record = pavise(sentry), point = pavisePoint(sentry);
  if (!record || !point || !targetToken || !attackerToken || targetToken.parent?.id !== point.scene.id || attackerToken.parent?.id !== point.scene.id) return false;
  if (!(record.allies ?? []).includes(targetToken.uuid)) return false;
  if (!nearFeet(point.scene, point, targetToken, PAVISE_FEET)) return false;
  return paviseOpposite(tokenPoint(targetToken), point, tokenPoint(attackerToken));
}
/** Sentries on a Scene with a planted shield there. */
export function paviseSentries(scene) {
  const found = new Map();
  for (const token of values(scene?.tokens)) {
    const actor = token.actor;
    if (actor && !found.has(actor.uuid) && isSentry(actor) && pavisePoint(actor)?.scene?.id === scene.id) found.set(actor.uuid, actor);
  }
  return [...found.values()];
}

/**
 * Target kind for the Sentry's own marker and shield: removes a planted template (keeping its data so undo recreates it
 * with the same ID), creates a new template with a pre-chosen ID, and unequips or equips the shield. Applied on the
 * Sentry (always writable by its owner); a linked token is never deleted.
 */
/** Only this Sentry's own circle Pavise templates are ever deleted or recreated (never another document). */
const ownMarker = (doc, sentry) => doc?.documentName === "MeasuredTemplate" && doc.t === "circle" && doc.flags?.ak5e?.sentryPavise?.actorUuid === sentry.uuid;
const ownMarkerData = (data, sentry) => data?.t === "circle" && data.flags?.ak5e?.sentryPavise?.actorUuid === sentry.uuid;
const paviseMarker = {
  local: true,   // the Sentry's owner always applies and reverts it; the GM relay refuses it
  async apply(_source, useId, entry, target) {
    const key = opaqueKey(useId), path = `flags.ak5e.${defenderUses.appliedFlag}.${key}`, done = flag(target, defenderUses.appliedFlag)?.[key];
    if (done?.complete) return done;
    const record = { removed: done?.removed ?? null, created: done?.created ?? null, equip: [...(done?.equip ?? [])], complete: false };
    if (entry.remove && !record.removed) {
      const doc = globalThis.fromUuidSync?.(entry.remove);
      if (ownMarker(doc, target)) {
        record.removed = { sceneUuid: doc.parent.uuid, data: doc.toObject() };
        await target.update({ [path]: record });   // recorded before deleting, so undo can always put it back
        await doc.delete();
      }
    }
    if (entry.create && !record.created) {
      const scene = globalThis.fromUuidSync?.(entry.create.sceneUuid);
      need(scene?.documentName === "Scene", "The Scene for the planted shield no longer exists.");
      const [doc] = await scene.createEmbeddedDocuments("MeasuredTemplate", [{ _id: entry.create.id, t: "circle", x: entry.create.x, y: entry.create.y,
        distance: PAVISE_FEET, direction: 0, fillColor: "#8a6d3b", borderColor: "#4a3a1f", flags: { ak5e: { sentryPavise: { actorUuid: target.uuid, useId } } } }], { keepId: true });
      record.created = doc?.uuid ?? `${scene.uuid}.MeasuredTemplate.${entry.create.id}`;
      await target.update({ [path]: record });
    }
    for (const change of entry.equip ?? []) {
      const item = target.items.get?.(change.itemId) ?? values(target.items).find(candidate => candidate.id === change.itemId);
      if (!item || item.system?.equipped === change.equipped) continue;
      await item.update({ "system.equipped": change.equipped });
      record.equip.push({ itemId: item.id, equipped: change.equipped });
    }
    record.complete = true;
    await target.update({ [path]: record });
    return record;
  },
  async revert(_source, useId, _entry, target) {
    const key = opaqueKey(useId), record = flag(target, defenderUses.appliedFlag)?.[key];
    if (!record) return { restored: false };
    if (record.created) { const doc = globalThis.fromUuidSync?.(record.created); if (ownMarker(doc, target)) await doc.delete(); }
    if (record.removed && ownMarkerData(record.removed.data, target)) {
      const scene = globalThis.fromUuidSync?.(record.removed.sceneUuid);
      if (scene?.documentName === "Scene" && !scene.templates?.get?.(record.removed.data._id)) await scene.createEmbeddedDocuments("MeasuredTemplate", [record.removed.data], { keepId: true });
    }
    for (const change of record.equip ?? []) {
      const item = target.items.get?.(change.itemId) ?? values(target.items).find(candidate => candidate.id === change.itemId);
      if (item) await item.update({ "system.equipped": !change.equipped });
    }
    await target.update({ [`flags.ak5e.${defenderUses.appliedFlag}.${key}`]: null });
    return { restored: true };
  },
  preview(_source, _receipt, entry) {
    return [entry.create ? "removes the planted-shield marker" : null, entry.remove ? "puts the earlier marker back" : null,
      entry.equip?.length ? "restores the shield's equipped state" : null].filter(Boolean).join("; ").replace(/^./, c => c.toUpperCase()) + ".";
  }
};
const randomId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18);
/** A marker entry that plants a new template at the Sentry's token, optionally removing the current template first. */
function plantEntry(actor, { remove = null, unequip = null, equip = null } = {}) {
  const own = primaryToken(actor);
  need(own?.parent, "Place your token on a Scene to plant your shield there, or place a prop token and use Link a placed token as the Pavise.");
  const point = tokenPoint(own), id = randomId();
  return { entry: { uuid: actor.uuid, name: actor.name, kind: "paviseMarker", ready: true, remove,
    create: { sceneUuid: own.parent.uuid, id, x: point.x, y: point.y },
    equip: [...(equip ? [{ itemId: equip, equipped: true }] : []), ...(unequip ? [{ itemId: unequip, equipped: false }] : [])] },
  uuid: `${own.parent.uuid}.MeasuredTemplate.${id}`, sceneId: own.parent.id };
}
function alliesFrom(actor, data) {
  const own = primaryToken(actor), allies = Array.isArray(data.allies) ? [...new Set(data.allies)] : [];
  return own && !allies.includes(own.uuid) ? [own.uuid, ...allies] : allies;
}

/* ---------------------------------------------------------------- use plans */

const PLANS = {
  plantPavise(actor, state, data) {
    const warnings = [], shield = heavyShield(actor), current = state.data.pavise;
    if (game.combat?.started && !ownTurn(actor)) warn(warnings, "turn", "Plant Pavise is a Bonus Action, and it is not your Turn.");
    if (!shield) warn(warnings, "shield", "Plant Pavise needs a Heavy Shield equipped (Defender Shield or Heavy Defender Shield).");
    if (current) warn(warnings, "planted", "You can only have one shield planted at a time; this use moves it here (undo puts it back).");
    if (data.alliesConfirmed !== true) warn(warnings, "allies", "You did not confirm that every chosen Creature is your ally.");
    const allies = alliesFrom(actor, data);
    return { warnings, title: "Plant Pavise", reading: shield ? "paviseShield" : null, apply(next, receipt, reading) {
      const unequip = shield && reading === "unequip" ? shield.id : null;
      const plant = plantEntry(actor, { remove: current?.kind === "template" ? current.uuid : null, unequip });
      next.data.pavise = { kind: "template", uuid: plant.uuid, sceneId: plant.sceneId, allies, shieldItemId: shield?.id ?? current?.shieldItemId ?? null,
        unequipped: shield ? Boolean(unequip) : Boolean(current?.unequipped), useId: receipt.id, previous: current ?? null };
      receipt.targets = [plant.entry];
      receipt.summary = `Bonus Action: ${actor.name} plants their shield (10-foot marker on the map). Allied Creatures within 10 feet of it, including ${actor.name}, gain the benefit of Shelter against Attacks from the opposite side of the shield, and the shield is Half Cover (+2 AC, +2 Dexterity saves; apply it by hand). Other Creatures cannot move it; recover it as an Interact with Object within 5 feet.${unequip ? " The shield is unequipped while planted." : ""}`;
      receipt.result = { planted: true };
      return {};
    } };
  },
  /** The planted shield as a token the player or GM placed (a prop creature): moveable, targetable, any image. */
  linkPaviseToken(actor, state, data) {
    const warnings = [], token = globalThis.fromUuidSync?.(data.tokenUuid), current = state.data.pavise, own = primaryToken(actor);
    need(token?.documentName === "Token", "Choose the token that stands for your planted shield.");
    need(token.actor?.uuid !== actor.uuid, "Choose a token other than your own.");
    if (own?.parent && token.parent?.id !== own.parent.id) warn(warnings, "scene", "That token is on another Scene from yours.");
    if (current) warn(warnings, "planted", "You can only have one shield planted at a time; this use moves it to the token (undo puts it back).");
    if (data.alliesConfirmed !== true) warn(warnings, "allies", "You did not confirm that every chosen Creature is your ally.");
    const allies = alliesFrom(actor, data).filter(uuid => uuid !== token.uuid);
    return { warnings, title: "Pavise: link a placed token", apply(next, receipt) {
      next.data.pavise = { kind: "token", uuid: token.uuid, sceneId: token.parent?.id ?? null, allies, shieldItemId: current?.shieldItemId ?? null, unequipped: current?.unequipped ?? false, useId: receipt.id, previous: current ?? null };
      if (current?.kind === "template") receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "paviseMarker", ready: true, remove: current.uuid, create: null, equip: [] }];
      receipt.summary = `${actor.name}'s planted shield is now the token ${token.name}. Move it, target it or change its image as you like; Shelter is measured from it.`;
      receipt.result = { linked: token.uuid };
      return {};
    } };
  },
  recoverPavise(actor, state) {
    const warnings = [], current = state.data.pavise, point = pavisePoint(actor), own = primaryToken(actor);
    need(current, "You have no planted shield.");
    if (point && own && (own.parent?.id !== point.scene.id || !nearFeet(point.scene, point, own, 5))) warn(warnings, "range", "You are not within 5 feet of your planted shield.");
    return { warnings, title: "Recover Pavise", apply(next, receipt) {
      next.data.pavise = null;
      next.data.recovered = [...(next.data.recovered ?? []), { op: receipt.id, pavise: current }].slice(-20);
      receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "paviseMarker", ready: true, remove: current.kind === "template" ? current.uuid : null, create: null,
        equip: current.unequipped && current.shieldItemId ? [{ itemId: current.shieldItemId, equipped: true }] : [] }];
      receipt.summary = `Interact with Object: ${actor.name} recovers their planted shield${current.unequipped ? " and equips it again" : ""}.${current.kind === "token" ? " Remove the prop token from the map by hand if you no longer need it." : ""}`;
      receipt.result = { recovered: true };
      return {};
    } };
  },
  advanceAndFire(actor, state, data, useId) {
    const warnings = [], attacker = actorAt(data.attackerUuid, "the attacking Creature");
    const triggerId = String(data.triggerId ?? "").trim() || `advanceAndFire:${useId}`, receiptId = `advancefire_${useId}`;
    const weapon = data.weaponId ? (actor.items.get?.(data.weaponId) ?? values(actor.items).find(item => item.id === data.weaponId)) : null;
    const round = game.combat?.started ? `${game.combat.uuid ?? game.combat.id}:${game.combat.round}` : null;
    const free = data.retributor === true;
    levelWarning(warnings, actor, 9, "Advance and Fire");
    if (data.attackConfirmed !== true) warn(warnings, "attack", `You did not confirm that ${attacker.name} made an Attack against you or a Creature benefitting from your Shelter.`);
    if (!weapon) warn(warnings, "weapon", "Choose the Ranged Weapon you attack with.");
    else if (weapon.system?.equipped !== true) warn(warnings, "equipped", `${weapon.name} is not equipped.`);
    if (free) {
      levelWarning(warnings, actor, 15, "Retributor");
      if (!round) warn(warnings, "round", "Outside combat there is no Round to count; Retributor is once per Round.");
      else if (state.data.retributor === round) warn(warnings, "retributor", "Retributor has already been used this Round.");
    } else {
      const budget = getReactions(actor), already = Boolean(budget.receipts?.[receiptId]);
      if (!already && budget.triggers?.[triggerId]) warn(warnings, "triggerUsed", "A Reaction was already spent for this Attack; no additional Reaction will be spent.");
      if (!already && budget.available < 1) warn(warnings, "reaction", "No Reaction remains for Advance and Fire; no Reaction will be spent.");
    }
    const torrent = torrentActive(actor);
    return { warnings, title: "Advance and Fire", async apply(next, receipt) {
      if (free) { next.data.retributor = round ?? `outside_${receipt.id}`; next.data.retributorUse = receipt.id; }
      else {
        const result = await spendReaction(actor, { triggerId, receipt: receiptId, tags: ["advanceAndFire"] });
        if (!result.ok) need(data.overrides?.includes("reaction") || data.overrides?.includes("triggerUsed"), "Your Reaction was spent elsewhere since the check; use it again to review.");
        receipt.reaction = { requested: true, spent: result.ok === true, receiptId, triggerId, ...(result.ok ? {} : { reason: result.reason }) };
      }
      receipt.html = true;
      const link = weapon ? `@UUID[${weapon.uuid}]{${esc(weapon.name)}}` : "your Ranged Weapon";
      receipt.summary = `${free ? "Retributor (no Reaction)" : "Reaction"}: ${esc(actor.name)} makes a Ranged Weapon Attack against ${esc(attacker.name)} with ${link}. Roll it from the weapon.`
        + (torrent ? " Torrent of Lead, Wall of Steel: make one additional Attack (no Action required) against the same Creature; these Attacks cannot generate further Attacks." : "")
        + (free ? "" : ` ${esc(actor.name)} may expend 1 Resilience to regain the Reaction.`);
      receipt.result = { free, torrent };
      return {};
    } };
  },
  advanceAndFireRefund(actor, state, data) {
    const warnings = [], use = defenderUses.receipt(actor, data.useId);
    need(use?.command === "advanceAndFire" && use.status !== "undone", "Choose an Advance and Fire use.");
    if (!use.reaction?.spent) warn(warnings, "noReaction", "That Advance and Fire spent no Reaction; nothing to refund.");
    else if (!getReactions(actor).receipts?.[use.reaction.receiptId]) warn(warnings, "refreshed", "That Reaction has already come back at the start of your Turn.");
    if ((state.data.refunds ?? []).some(entry => entry.useId === use.id)) warn(warnings, "repeat", "That Reaction was already refunded.");
    if (resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "The refund costs 1 Resilience and none remain; Resilience stays at 0.");
    return { warnings, title: "Advance and Fire: regain Reaction", apply(next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" });
      next.data.refunds = [...(next.data.refunds ?? []), { op: receipt.id, useId: use.id }].slice(-40);
      if (use.reaction?.spent) receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: "reactionRefund", ready: true, receiptId: use.reaction.receiptId, triggerId: use.reaction.triggerId }];
      receipt.summary = `${actor.name} expends 1 Resilience to regain the Reaction spent on Advance and Fire${use.reaction?.spent ? "" : " (no Reaction was outstanding)"}.`;
      receipt.result = { refunded: Boolean(use.reaction?.spent) };
      return updates;
    } };
  },
  barTheGates(actor, state, data) {
    const warnings = [], current = state.data.pavise, recoverFirst = data.recoverFirst === true, own = primaryToken(actor), point = pavisePoint(actor);
    // Recovering first plants the same shield again; otherwise the shield you are wielding is planted.
    const recovered = recoverFirst && current?.shieldItemId ? (actor.items.get?.(current.shieldItemId) ?? values(actor.items).find(item => item.id === current.shieldItemId)) : null;
    const shield = recovered ?? heavyShield(actor);
    levelWarning(warnings, actor, 12, "Pointman");
    if (!defenderState(actor).leaping) warn(warnings, "leap", "No Leaping Defence is recorded; Bar the Gates is used as part of that Reaction.");
    if (!shield || !shieldInfo(shield)?.heavy) warn(warnings, "shield", "Bar the Gates needs a Heavy Shield (Defender Shield or Heavy Defender Shield).");
    if (recoverFirst && !current) warn(warnings, "none", "You have no planted shield to recover.");
    if (recoverFirst && point && own && (own.parent?.id !== point.scene.id || !nearFeet(point.scene, point, own, 5))) warn(warnings, "range", "You were not within 5 feet of your planted shield.");
    if (recoverFirst && resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "Recovering the shield first costs 1 Resilience and none remain; Resilience stays at 0.");
    if (!recoverFirst && current) warn(warnings, "planted", "You can only have one shield planted at a time; this use moves it here (undo puts it back).");
    const allies = alliesFrom(actor, { allies: Array.isArray(data.allies) && data.allies.length ? data.allies : current?.allies ?? [] });
    return { warnings, title: "Bar the Gates", reading: shield ? "paviseShield" : null, apply(next, receipt, reading) {
      const updates = recoverFirst ? spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" }) : {};
      const equipped = shield?.system?.equipped === true;
      const unequip = shield && reading === "unequip" && equipped ? shield.id : null;
      const equip = shield && reading === "keep" && !equipped ? shield.id : null;
      const plant = plantEntry(actor, { remove: current?.kind === "template" ? current.uuid : null, unequip, equip });
      next.data.pavise = { kind: "template", uuid: plant.uuid, sceneId: plant.sceneId, allies, shieldItemId: shield?.id ?? null, unequipped: Boolean(shield) && reading === "unequip", useId: receipt.id, previous: current ?? null };
      receipt.targets = [plant.entry];
      receipt.summary = `Bar the Gates: as part of Leaping Defence, ${actor.name} ${recoverFirst ? "recovers their planted shield (1 Resilience) and " : ""}plants ${recoverFirst ? "it again" : "their shield"} where they landed.`;
      receipt.result = { planted: true };
      return updates;
    } };
  },
  headsDown(actor, _state, data) {
    const warnings = [], target = actorAt(data.targetUuid, "the Creature making the save"), point = pavisePoint(actor);
    levelWarning(warnings, actor, 12, "Pointman");
    if (!point) warn(warnings, "noPavise", "You have no planted shield.");
    else {
      const token = tokensOf(target).find(t => t.parent?.id === point.scene.id);
      if (!token || !nearFeet(point.scene, point, token, 5)) warn(warnings, "range", `${target.name} is not within 5 feet of your planted shield.`);
    }
    if (data.visibleConfirmed !== true) warn(warnings, "visible", `You did not confirm that ${target.name} is making a Dexterity Saving Throw against an effect they can see.`);
    if (resourceValue(actor, { pool: "resilience" }) < 1) warn(warnings, "resilience", "Heads Down costs 1 Resilience and none remain; Resilience stays at 0.");
    return { warnings, title: "Heads Down", apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "resilience", amount: 1, label: "Resilience" });
      receipt.summary = `Heads Down: ${target.name} automatically passes this Dexterity Saving Throw. Do not roll it; treat it as a success.`;
      receipt.result = { target: target.uuid };
      return updates;
    } };
  },
  torrentOfLead(actor) {
    const warnings = [];
    levelWarning(warnings, actor, 15, "Firebase");
    if (game.combat?.started && !ownTurn(actor)) warn(warnings, "turn", "Torrent of Lead, Wall of Steel is activated during your Turn, and it is not your Turn.");
    if (resourceValue(actor, { pool: "torrentOfLead" }) < 1) warn(warnings, "used", "Torrent of Lead, Wall of Steel has been used since your last Long Rest; the count stays at 0.");
    if (torrentActive(actor)) warn(warnings, "active", "Torrent of Lead, Wall of Steel is already active.");
    return { warnings, title: "Torrent of Lead, Wall of Steel", apply(next, receipt) {
      const updates = spendResource(actor, receipt, { pool: "torrentOfLead", amount: 1, label: "Torrent of Lead use" });
      next.data.torrent = { useId: receipt.id, turn: defenderTurn(), turnEnds: 0, active: true };
      receipt.summary = `Until the end of ${actor.name}'s next Turn, each Ranged Attack made with Advance and Fire allows one additional Attack (no Action required) against the same Creature; these Attacks cannot generate further Attacks.${game.combat?.started ? "" : " Outside combat, end it from the Defender panel."}`;
      receipt.result = { active: true };
      return updates;
    } };
  },
  endTorrentOfLead(actor, state) {
    need(state.data.torrent?.active, "Torrent of Lead, Wall of Steel is not active.");
    return { warnings: [], title: "End Torrent of Lead", apply(next, receipt) {
      next.data.torrentEnded = [...(next.data.torrentEnded ?? []), { op: receipt.id, torrent: next.data.torrent }].slice(-10);
      next.data.torrent = null;
      receipt.summary = `${actor.name}'s Torrent of Lead, Wall of Steel ends.`;
      receipt.result = { ended: true };
      return {};
    } };
  }
};
export function torrentActive(actor) { return Boolean(defenderUses.state(actor).data.torrent?.active); }
// These change only the Sentry's own documents and are never applied through the GM relay.
for (const name of ["plantPavise", "linkPaviseToken", "recoverPavise", "barTheGates", "advanceAndFireRefund"]) PLANS[name].validateTarget = () => false;
function cleanup(state, receipt) {
  // Undo a plant, link or Bar the Gates: the previous planted shield comes back. Undo a recovery: the shield is planted again.
  if (state.data.pavise?.useId === receipt.id) state.data.pavise = state.data.pavise.previous ?? null;
  const recovered = (state.data.recovered ?? []).find(entry => entry.op === receipt.id);
  if (recovered) state.data.pavise = recovered.pavise;
  const ended = (state.data.torrentEnded ?? []).find(entry => entry.op === receipt.id);
  if (ended && !state.data.torrent) state.data.torrent = ended.torrent;
  if (state.data.torrent?.useId === receipt.id) state.data.torrent = null;
  if (state.data.retributorUse === receipt.id) { state.data.retributor = null; state.data.retributorUse = null; }
  for (const key of ["recovered", "refunds", "torrentEnded"]) state.data[key] = (state.data[key] ?? []).filter(entry => entry.op !== receipt.id);
}

/* ---------------------------------------------------------------- native rolls, prompts and Turn tracking */

/** dnd5e.preRollAttackV2: Disadvantage when a target is sheltered by a planted shield against this attacker. */
export function paviseAttackHook(config) {
  const options = config?.rolls?.[0]?.options, attacker = config?.subject?.actor;
  if (!options || !attacker) return;
  const targets = values(globalThis.game?.user?.targets).map(t => t.document ?? t).filter(t => t?.parent);
  const hits = [];
  for (const target of targets) {
    const attackerToken = tokensOf(attacker).find(t => t.parent?.id === target.parent.id);
    const sentry = paviseSentries(target.parent).find(candidate => paviseProtects(candidate, target, attackerToken));
    if (sentry) hits.push({ target, sentry });
  }
  if (!hits.length) return;
  options.disadvantage = true;
  globalThis.ui?.notifications?.info?.(`Pavise: this Attack against ${hits.map(h => h.target.name).join(", ")} comes from beyond ${hits[0].sentry.name}'s planted shield. Disadvantage applied; the shield is also Half Cover (+2 AC).`);
}
const owners = actor => values(game.users).filter(user => user.isGM || actor.testUserPermission?.(user, "OWNER")).map(user => user.id);
/** Advance and Fire is offered to a level-9 Sentry when it, or a Creature benefitting from its Shelter, is attacked. */
async function advanceAndFirePrompt(event) {
  const attackerDoc = globalThis.fromUuidSync?.(event?.actorUuid);
  if (!attackerDoc) return;
  const offered = new Set();
  const attackerTokens = tokensOf(attackerDoc);
  for (const target of event.targets ?? []) {
    // D&D5e target descriptors carry the Actor UUID; a Token UUID is accepted too. Use the target's token on the attacker's Scene.
    const doc = globalThis.fromUuidSync?.(target.uuid);
    const token = doc?.documentName === "Token" ? doc : tokensOf(doc).find(t => attackerTokens.some(a => a.parent?.id === t.parent?.id)) ?? tokensOf(doc)[0];
    if (!token?.parent) continue;
    const attackerToken = attackerTokens.find(t => t.parent?.id === token.parent.id);
    for (const sceneToken of values(token.parent.tokens)) {
      const sentry = sceneToken.actor;
      if (!sentry || offered.has(sentry.uuid) || sentry.uuid === attackerDoc.uuid || !isSentry(sentry) || defenderLevel(sentry) < 9) continue;
      const covered = token.actor?.uuid === sentry.uuid || shelterAppliesTo(sentry, token.uuid) || paviseProtects(sentry, token, attackerToken);
      if (!covered) continue;
      offered.add(sentry.uuid);
      await ChatMessage.implementation.create({ whisper: owners(sentry), speaker: ChatMessage.implementation.getSpeaker({ actor: sentry }),
        content: `<h3>Advance and Fire</h3><p>${esc(attackerDoc.name)} made an Attack against ${esc(token.name)}. Make a Ranged Weapon Attack against ${esc(attackerDoc.name)} as a Reaction?</p>`,
        flags: { ak5e: { sentryPrompt: { kind: "advanceAndFire", actorUuid: sentry.uuid, attackerUuid: attackerDoc.uuid, attackId: event.attackId } } } });
    }
  }
}
/** Torrent of Lead lasts until the end of the Sentry's next Turn: the second of its Turn ends after activation (GM client). */
async function torrentTurnEnd(event) {
  const actor = globalThis.fromUuidSync?.(event?.actorUuid);
  if (!actor?.isOwner || event.skipped || !isSentry(actor) || !torrentActive(actor)) return;
  await defenderUses.serial(actor, async () => {
    const torrent = defenderUses.state(actor).data.torrent;
    if (!torrent?.active) return;
    const ends = (torrent.turn === null ? 1 : 0) + Number(torrent.turnEnds ?? 0) + 1;
    await actor.update({ "flags.ak5e.defenderUses.data.torrent": ends >= 2 ? { ...torrent, active: false, turnEnds: ends } : { ...torrent, turnEnds: ends } });
  });
}

export function registerSentry() {
  if (!getPoolDefinition("torrentOfLead")) definePool({ id: "torrentOfLead", label: "Torrent of Lead, Wall of Steel", max: { 1: 0, 15: 1 }, initial: "max", classId: "class-defender",
    levelBasis: "classLevel", appliesTo: isSentry, recovery: [{ on: "lr", amount: "full" }] });
  defenderUses.register({ plans: PLANS, readings: SENTRY_READINGS, targetKinds: { paviseMarker }, cleanup });
}
export function registerSentryHooks() {
  registerSentry();
  Hooks.on("dnd5e.preRollAttackV2", paviseAttackHook);
  onAk5eEvent("attack", event => advanceAndFirePrompt(event).catch(error => console.error("AK5e | Advance and Fire prompt", error)));
  onAk5eEvent("turnEnd", event => torrentTurnEnd(event).catch(error => console.error("AK5e | Torrent of Lead", error)));
}
export { getPool };
