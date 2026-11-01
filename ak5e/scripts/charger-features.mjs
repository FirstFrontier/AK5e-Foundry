/**
 * Charger uses, native strike bridge and event records. C3:8297-8375.
 *
 * Flag layout under flags.ak5e.charger. Every key below a map is written alone, and a cleared entry is a null tombstone
 * (never a "-=" key), so undoing one write cannot clash with a later write to a sibling (play-uses "value changed" note):
 *   marks.<opaque target>            { targetUuid, sourceUuid, eventId, useId, turnKey, advantage }
 *   damaged.<opaque target>          true   (damaged by this Charger since the beginning of its last Turn)
 *   tipOpportunities.<opaque kill>   { targetUuid, eventId, status:"available" }
 *   movement / lastMovedAttack / lastQualifiedAttack / lastKill / turn / renewTurn / couchArmed / expiredAtTurnStart
 *   geirskogulUsed                   true until a Long Rest
 * No dice are ever rolled here: the Strike dice are added to the owner's own native damage roll, every save is an
 * owner-clicked native save and collision damage is guidance applied with the native controls.
 */
import { vanguardUses } from './vanguard-uses.mjs';
import { vanguardLevel, martialDC } from './vanguard-rules.mjs';
import { getPool, getPoolDefinition, definePool } from './resource-pools.mjs';
import { onAk5eEvent } from './trigger-events.mjs';
import { need, opaqueKey, keyedSerial, values } from './operation-kernel.mjs';
import { registerVanguardTipGrantSource } from './vanguard-extensions.mjs';
import { marksmanAttackTarget } from './marksman-context.mjs';

export const CHARGER_TIP_GRANT_KIND = 'charger-mark';
const BRANCH_ID = 'subclass-vanguard-charger';
const MAX_MOMENTUM = 6;

const state = actor => actor?.flags?.ak5e?.charger ?? {};
const level = actor => vanguardLevel(actor) ?? 0;
const isCharger = actor => values(actor?.items).some(item => item.type === 'subclass' && item.flags?.ak5e?.chapterThreeId === BRANCH_ID);
const str = value => typeof value === 'string' && value.length ? value : null;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const live = receipt => Boolean(receipt) && receipt.status !== 'undone';
const entryOf = value => value && typeof value === 'object' ? value : null;
const cid = (kind, key) => `charger-${kind}-${opaqueKey(key)}`;
const warnUser = text => globalThis.ui?.notifications?.warn?.(text);
const serial = keyedSerial();

function resolve(uuid) {
  if (typeof uuid !== 'string' || !uuid) return null;
  try { return globalThis.fromUuidSync?.(uuid) ?? null; } catch { return null; }
}
function resolveActor(uuid) {
  const document = resolve(uuid);
  return document?.documentName === 'Token' ? document.actor ?? null : document;
}
const nameOf = uuid => resolve(uuid)?.name ?? uuid;
const turnKeyOf = event => `${str(event?.combatUuid) ?? null}:${finite(event?.round)}:${finite(event?.turn)}`;
function currentTurnKey() {
  const combat = globalThis.game?.combat;
  return combat?.started ? `${str(combat.uuid) ?? null}:${finite(combat.round)}:${finite(combat.turn)}` : null;
}
const undoList = actor => vanguardUses.state(actor).undo;
const child = (actor, parentId, command) => undoList(actor).find(entry => entry.parentUseId === parentId && entry.command === command && live(entry));
const half = total => Math.floor(Math.max(0, Number(total) || 0) / 2);

function poolUpdate(actor, receipt, value) {
  const current = getPool(actor, 'momentum');
  const after = Math.max(0, Math.min(MAX_MOMENTUM, value));
  const path = 'flags.ak5e.resourcePools.momentum.value';
  (receipt.resources ??= []).push({ pool: 'momentum', path, before: current.value, after, max: MAX_MOMENTUM, label: 'Momentum' });
  return { [path]: after };
}

/* ---------------------------------------------------------------- in-memory Couch claims (synchronous, per roll) */
const couchClaims = new Map();
const couchClaimed = (actor, couchId) => couchClaims.get(actor.uuid)?.has(couchId) === true;
function claimCouch(actor, couchId) {
  if (!couchClaims.has(actor.uuid)) couchClaims.set(actor.uuid, new Set());
  couchClaims.get(actor.uuid).add(couchId);
}

/* ---------------------------------------------------------------- plans */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const RECORD_ROOTS = new Set(['movement', 'lastMovedAttack', 'lastQualifiedAttack', 'lastKill', 'turn', 'renewTurn', 'couchArmed',
  'expiredAtTurnStart', 'marks', 'damaged', 'tipOpportunities']);
function recordPath(relative) {
  const parts = String(relative).split('.');
  need(parts.length >= 1 && parts.length <= 2 && parts.every(part => SAFE_SEGMENT.test(part)) && RECORD_ROOTS.has(parts[0]), 'Invalid Charger record path.');
  return `flags.ak5e.charger.${parts.join('.')}`;
}

function strikeResult(actor, strike) {
  return { momentum: Number(strike?.result?.momentum ?? 0), die: Number(strike?.result?.die ?? 6) };
}

const plans = {
  chargerCouch(actor) {
    ensureNativeHooks();
    return { title: 'Couch', warnings: [], apply(_next, receipt) {
      const before = getPool(actor, 'momentum').value;
      receipt.result = { momentumBefore: before, bonus: before, useTurnKey: currentTurnKey() };
      receipt.summary = `Couch: Speed 0 until the beginning of your next Turn; during that Turn Speed +10 feet and your first Melee Attack Roll gets +${before} (the Momentum held when you used Couch).`;
      receipt.manualSteps = ['Track both Speed phases yourself. The first Melee Attack Roll of your next Turn receives the bonus automatically from your own roll.'];
      return poolUpdate(actor, receipt, before + 1);
    } };
  },
  chargerCouchSpent(actor, _state, data) {
    const couch = vanguardUses.receipt(actor, data.couchId);
    need(couch?.command === 'chargerCouch' && live(couch), 'The Couch must remain active.');
    return { title: 'Couch: first melee attack', warnings: [],
      undoNotes: () => ['The attack roll already made keeps its Couch bonus. Undoing this only makes the bonus available to your next melee attack roll.'],
      apply(_next, receipt) {
        receipt.parentUseId = couch.id;
        receipt.result = { couchId: couch.id, bonus: Number(couch.result?.bonus ?? 0), activityUuid: str(data.activityUuid) };
        receipt.summary = `Couch bonus +${receipt.result.bonus} added to the first Melee Attack Roll of the Turn.`;
        return {};
      } };
  },
  chargerMomentousStrike(actor) {
    ensureNativeHooks();
    return { title: 'Momentous Strike', get warnings() {
      return getPool(actor, 'momentum').value > 0 ? [] : [{ id: 'noMomentum', text: 'You have no Momentum: this Momentous Strike adds no damage dice.' }];
    }, apply(_next, receipt) {
      const amount = getPool(actor, 'momentum').value, lvl = level(actor), die = lvl >= 14 ? 10 : lvl >= 7 ? 8 : 6;
      const deathblow = lvl >= 10 && amount >= 5;
      receipt.summary = `Spend ${amount} Momentum on a single attack: +${amount}d${die} Weapon Damage on a hit. ${deathblow ? 'On a hit this attack ignores Resistances.' : ''}`.trim();
      receipt.result = { momentum: amount, die, deathblow, turnKey: currentTurnKey() };
      if (amount) { receipt.formula = `${amount}d${die}`; receipt.rollLabel = 'Additional Weapon Damage'; }
      receipt.manualSteps = [`Make the single weapon attack with its native control, then click Damage on that card: ${amount}d${die} is added to the weapon damage roll. Dice are rolled only by you.`];
      return poolUpdate(actor, receipt, 0);
    } };
  },
  chargerStrikeAttack: (actor, _state, data) => nativeStrikeRecord(actor, data, 'attack'),
  chargerStrikeDamage: (actor, _state, data) => nativeStrikeRecord(actor, data, 'damage'),
  chargerPushOnThrough(actor) {
    const S = state(actor), kill = entryOf(S.lastKill);
    const warnings = [];
    if (!kill) warnings.push({ id: 'kill', text: 'No creature you reduced to 0 Hit Points on this Turn is recorded. Confirm that you did.' });
    else if (S.turn?.key && kill.turnKey !== S.turn.key) warnings.push({ id: 'kill', text: 'The recorded 0 Hit Point reduction was not on your current Turn. Confirm that you reduced a creature to 0 Hit Points on your Turn.' });
    return { title: 'Push on Through', warnings, apply(_next, receipt) {
      receipt.result = { killEventId: kill?.eventId ?? null, killedUuid: kill?.targetUuid ?? null };
      receipt.summary = 'Make one melee weapon attack as a Bonus Action this Turn using its native control.';
      return {};
    } };
  },
  chargerGeirskogul: (actor, _state, data) => geirskogulPlan(actor, data),
  chargerGeirskogulCollision: (actor, _state, data) => collisionPlan(actor, data),
  chargerEvent(actor, _state, data) {
    const set = data.set && typeof data.set === 'object' && !Array.isArray(data.set) ? data.set : {};
    const updates = {};
    for (const [relative, value] of Object.entries(set)) {
      need(value === null || ['string', 'number', 'boolean', 'object'].includes(typeof value), 'Invalid Charger record value.');
      updates[recordPath(relative)] = value === null ? null : structuredClone(value);
    }
    const gain = data.gain === undefined ? 0 : data.gain;
    need(Number.isInteger(gain) && gain >= 0 && gain <= MAX_MOMENTUM, 'Invalid Momentum gain.');
    need(data.setMomentum === undefined || (Number.isInteger(data.setMomentum) && data.setMomentum >= 0 && data.setMomentum <= MAX_MOMENTUM), 'Invalid Momentum amount.');
    return { title: String(data.title ?? 'Charger event').slice(0, 80), warnings: [], apply(_next, receipt) {
      receipt.summary = String(data.summary ?? data.title ?? 'Charger event').slice(0, 300);
      receipt.result = { recorded: true, kind: str(data.kind), eventId: str(data.eventId) };
      if (str(data.parentUseId)) receipt.parentUseId = data.parentUseId;
      const writes = { ...updates };
      if (data.setMomentum !== undefined) Object.assign(writes, poolUpdate(actor, receipt, data.setMomentum));
      else if (gain) Object.assign(writes, poolUpdate(actor, receipt, getPool(actor, 'momentum').value + gain));
      else if (data.gain === 0 && data.kind === 'initiative') Object.assign(writes, poolUpdate(actor, receipt, getPool(actor, 'momentum').value));
      return writes;
    } };
  }
};

/** A native chat message made by the owner for one Strike stage is recorded as an undoable child of the Strike. */
function nativeStrikeRecord(actor, data, stage) {
  const strike = vanguardUses.receipt(actor, data.useId);
  need(strike?.command === 'chargerMomentousStrike' && live(strike), 'Choose an active Momentous Strike.');
  const message = resolve(data.messageUuid), marker = message?.flags?.ak5e?.chargerNative;
  need(message?.documentName === 'ChatMessage' && message.uuid === data.messageUuid, 'The native roll message is missing.');
  need(message.speaker?.actor === actor.id, 'The native roll message does not belong to this actor.');
  const authorId = typeof message.author === 'string' ? message.author : message.author?.id ?? message.user?.id ?? message.user;
  need(authorId === globalThis.game?.user?.id && actor.isOwner, 'Only the owner who made this roll may record it.');
  need(marker?.actorUuid === actor.uuid && marker.useId === strike.id && marker.stage === stage, 'The native message marker does not match this Strike.');
  need(message.flags?.dnd5e?.roll?.type === stage && message.rolls?.length, 'The native message must contain the expected rolled dice.');
  need(!child(actor, strike.id, stage === 'attack' ? 'chargerStrikeAttack' : 'chargerStrikeDamage'), `This Strike already has a recorded ${stage} roll.`);
  const total = Array.from(message.rolls, roll => Number(roll.total)).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return { title: `Momentous Strike: native ${stage}`, warnings: [],
    undoNotes: () => [`The native ${stage} chat message${stage === 'damage' ? ' and any damage already applied to the target' : ''} cannot be unrolled; reverse ${stage === 'damage' ? 'the damage' : 'the attack'} yourself if needed.`],
    apply(next, receipt) {
      receipt.parentUseId = strike.id;
      receipt.result = { stage, messageUuid: message.uuid, targetUuid: str(marker.targetUuid), activityUuid: str(marker.activityUuid), total,
        momentum: Number(strike.result?.momentum ?? 0), die: Number(strike.result?.die ?? 6) };
      receipt.summary = stage === 'attack' ? `Strike attack recorded against ${nameOf(marker.targetUuid) ?? 'the target'}. Review the result on the native card.`
        : `Strike damage recorded: ${total} (includes ${receipt.result.momentum}d${receipt.result.die} Momentous dice). Review it before applying it.`;
      if (stage === 'damage') {
        const parent = next.undo.find(entry => entry.id === strike.id);
        if (parent && parent.roll === undefined) {
          parent.roll = total; parent.diceMessagePublished = true; parent.nativeDamageChild = receipt.id; parent.status = 'complete';
        }
      }
      return {};
    } };
}

/** The Strike's own roll is open again once its native damage record is undone. */
function cleanup(next, receipt, actor) {
  if (receipt.command === 'chargerCouchSpent') couchClaims.get(actor?.uuid)?.delete(receipt.parentUseId);
  if (receipt.command === 'chargerStrikeDamage') {
    const parent = next.undo.find(entry => entry.id === receipt.parentUseId);
    if (parent && parent.nativeDamageChild === receipt.id) {
      delete parent.roll; delete parent.diceMessagePublished; delete parent.nativeDamageChild;
      if (parent.status === 'complete') parent.status = 'awaitingRoll';
    }
  }
}

/* ---------------------------------------------------------------- Geirskogul */
function geirskogulPlan(actor, data) {
  const lvl = level(actor), S = state(actor);
  const targetUuid = str(data.targetUuid);
  need(targetUuid, 'Choose the Creature hit by your Momentous Strike (target it first), then use Geirskögul.');
  const targetDoc = resolve(targetUuid), saveActor = targetDoc?.documentName === 'Token' ? targetDoc.actor : targetDoc;
  const saveUuid = saveActor?.uuid ?? targetUuid, targetName = data.targetName ?? saveActor?.name ?? targetUuid;
  const strikeId = str(data.strikeId) ?? str(data.strikeUseId);
  const found = strikeId ? vanguardUses.receipt(actor, strikeId) : null;
  const strike = found?.command === 'chargerMomentousStrike' && live(found) ? found : null;
  const spent = strike ? Number(strike.result?.momentum ?? 0) : Number.isInteger(data.momentumSpent) && data.momentumSpent >= 0 ? data.momentumSpent : null;
  const damage = strike ? child(actor, strike.id, 'chargerStrikeDamage') : null;
  const martial = martialDC(actor, data.martialDcAbility);
  const dc = martial !== null && spent !== null ? martial + spent : null;
  const hp = saveActor?.system?.attributes?.hp?.value;
  const autoFail = typeof hp === 'number' && hp <= 0;
  const warnings = [];
  if (lvl < 17) warnings.push({ id: 'level', text: `Geirskögul is a 17th-level Charger Feature and this Vanguard is level ${lvl}.` });
  if (!strike) warnings.push({ id: 'strike', text: 'No active Momentous Strike is linked to this use. Confirm that a Strike hit this Creature and consumed 5 or more Momentum.' });
  else if (spent < 5) warnings.push({ id: 'weak', text: `The linked Momentous Strike consumed only ${spent} Momentum; Geirskögul needs a Strike that consumed 5 or more.` });
  if (strike && !damage) warnings.push({ id: 'hit', text: 'No native damage roll is recorded for the linked Strike. Confirm that it hit this Creature.' });
  if (S.geirskogulUsed === true) warnings.push({ id: 'used', text: 'Geirskögul was already used since your last Long Rest.' });
  if (martial === null) warnings.push({ id: 'dc', text: 'Your Martial DC ability (Strength or Dexterity) is not set, so the save DC cannot be calculated.' });
  else if (spent === null) warnings.push({ id: 'spent', text: 'The Momentum consumed is unknown without a linked Strike, so the save DC cannot be calculated.' });
  const total = finite(damage?.result?.total);
  return { title: 'Geirskögul', warnings,
    saves: dc !== null && !autoFail ? [{ id: 'geirskogul-str', saveId: 'geirskogul-str', uuid: saveUuid, name: targetName, ability: 'str', dc }] : [],
    undoNotes: () => ['The push, any crash and collision damage already applied cannot be reversed automatically; move the Creatures back and restore Hit Points yourself.'],
    resolveSave(_actor, receipt, _next, outcome) {
      receipt.result = { ...(receipt.result ?? {}), saveOutcome: { total: outcome.total, success: outcome.success, messageUuid: outcome.messageUuid } };
      receipt.summary = `${receipt.summary} ${targetName} rolled ${outcome.total} against DC ${receipt.result.dc}: ${outcome.success ? 'success' : 'failure'}. The source text does not state what a successful Strength save changes, so apply the push as your table reads it.`;
    },
    apply(_next, receipt) {
      if (strike) receipt.parentUseId = strike.id;
      const speed = Number(actor.system?.attributes?.movement?.walk ?? 0);
      receipt.result = { strikeId: strike?.id ?? null, targetUuid: saveUuid, momentumSpent: spent, martialDC: martial, dc, ability: 'str', autoFail,
        speed, damageTotal: total, collisionDamage: total === null ? null : half(total) };
      receipt.summary = `Geirskögul on ${targetName}: Strength Saving Throw against Martial DC ${martial ?? 'unset'}${spent === null ? '' : ` + ${spent} Momentum consumed = DC ${dc ?? 'unset'}`}. ${autoFail ? 'The Creature is at 0 Hit Points and automatically fails. ' : ''}You drive the Creature back a distance equal to your Speed${speed ? ` (${speed} feet)` : ''}, pushing it the whole way and moving with it. A crash into a Creature or Object deals Bludgeoning collision damage to both equal to half the damage dealt by the triggering Strike${total === null ? '' : ` (half of ${total} is ${half(total)})`}.`;
      receipt.manualSteps = [
        autoFail ? 'The Creature is at 0 Hit Points: it automatically fails the Strength save; no save is rolled.' : 'The Creature\'s owner clicks the Strength save on this card.',
        'Move the Creature and yourself along the push path (Speed movement) yourself. If it would enter another Creature, use the Collision control: that Creature makes a Dexterity save against the same DC (allies automatically succeed).',
        'Collision damage is not rolled or applied for you: use the Collision control for the amount and apply it with the native damage controls.'
      ];
      return { 'flags.ak5e.charger.geirskogulUsed': true };
    } };
}

function collisionPlan(actor, data) {
  const geirskogul = vanguardUses.receipt(actor, data.geirskogulId);
  need(geirskogul?.command === 'chargerGeirskogul' && live(geirskogul), 'Choose an active Geirskögul use.');
  const kind = data.kind === 'object' ? 'object' : 'creature';
  const otherUuid = str(data.otherUuid), otherName = data.otherName ?? (otherUuid ? nameOf(otherUuid) : 'the Object');
  need(kind === 'object' || otherUuid, 'Choose the Creature that was crashed into.');
  const dc = geirskogul.result?.dc ?? null, ally = data.ally === true;
  const warnings = dc === null ? [{ id: 'dc', text: 'The Geirskögul save DC was not calculated, so the Dexterity save has no DC.' }] : [];
  const needsSave = kind === 'creature' && !ally && dc !== null;
  const saveActor = otherUuid ? resolveActor(otherUuid) : null;
  return { title: 'Geirskögul: collision', warnings, reading: 'chargerCollisionDamage',
    saves: needsSave ? [{ id: 'collision-dex', saveId: 'collision-dex', uuid: saveActor?.uuid ?? otherUuid, name: otherName, ability: 'dex', dc }] : [],
    undoNotes: () => ['Collision damage already applied to either Creature cannot be reversed automatically; restore Hit Points yourself.'],
    resolveSave(_actor, receipt, _next, outcome) {
      receipt.result = { ...(receipt.result ?? {}), saveOutcome: { total: outcome.total, success: outcome.success, messageUuid: outcome.messageUuid }, crash: !outcome.success };
      receipt.summary = outcome.success ? `${otherName} rolled ${outcome.total} against DC ${dc} and succeeds: no crash.`
        : `${otherName} rolled ${outcome.total} against DC ${dc} and fails: crash them together. Both take ${receipt.result.amount} Bludgeoning damage.`;
    },
    apply(_next, receipt, basis) {
      receipt.parentUseId = geirskogul.id;
      const rolled = finite(geirskogul.result?.damageTotal), dealt = finite(data.dealtDamage);
      if (basis === 'dealt') need(dealt !== null && dealt >= 0, 'Enter the damage the Strike actually dealt.');
      const amount = basis === 'dealt' ? half(dealt) : rolled === null ? null : half(rolled);
      receipt.result = { geirskogulId: geirskogul.id, kind, otherUuid, ally, dc, basis, amount, crash: !needsSave };
      receipt.summary = `Collision with ${otherName}: ${needsSave ? `${otherName} makes a Dexterity save against DC ${dc}. ` : kind === 'creature' ? `${otherName} ${ally ? 'is an ally and automatically succeeds the Dexterity save, so there is no crash. ' : 'is crashed into. '}` : 'The Object stops the push. '}`
        + `${amount === null ? 'No Strike damage is recorded, so enter the amount yourself.' : `On a crash both Creatures take ${amount} Bludgeoning damage.`}`;
      if (kind === 'creature' && ally) receipt.result.crash = false;
      receipt.manualSteps = [amount === null ? 'Work out half of the damage dealt by the triggering Strike and apply it as Bludgeoning damage to both with the native controls.'
        : `If they crash, apply ${amount} Bludgeoning damage to both with the native damage controls. Nothing is applied for you.`];
      return {};
    } };
}

const readings = {
  chargerCollisionDamage: { label: 'Collision damage: "half of the Damage dealt by the triggering Momentous Strike"',
    options: [{ value: 'rolled', label: 'Half of the Strike\'s native damage roll total' },
      { value: 'dealt', label: 'Half of the damage actually dealt after Resistances and Temporary HP (you enter it)' }] }
};

/* ---------------------------------------------------------------- Mark -> Tip of the Spear grant */
function validateMarkTip(actor, sourceEventId, grantIndex) {
  if (grantIndex !== 1) return { ok: false, reason: 'A Charger Mark grants a single Tip of the Spear use.' };
  const opportunity = typeof sourceEventId === 'string' ? entryOf(state(actor).tipOpportunities?.[opaqueKey(sourceEventId)]) : null;
  if (opportunity?.status === 'available' && opportunity.eventId === sourceEventId) return true;
  return { ok: false, reason: 'No Marked creature was reduced to 0 Hit Points by that event, or its Mark has expired.' };
}

/* ---------------------------------------------------------------- Unbalancing Charge + native attack hooks */
function chargerActors() {
  const found = new Map();
  const add = actor => { if (actor?.uuid && !found.has(actor.uuid) && isCharger(actor)) found.set(actor.uuid, actor); };
  for (const actor of values(globalThis.game?.actors)) add(actor);
  for (const turn of values(globalThis.game?.combat?.turns)) add(turn?.actor);
  for (const token of values(globalThis.canvas?.tokens?.placeables)) add(token?.actor);
  return [...found.values()];
}
const isMelee = activity => /^m[ws]ak$/.test(String(activity?.actionType ?? ''));

function applyUnbalancing(config, roll) {
  const marked = chargerActors().filter(actor => level(actor) >= 4 && Object.values(state(actor).marks ?? {}).some(mark => entryOf(mark)?.advantage === true));
  if (!marked.length) return;
  const target = marksmanAttackTarget(config);
  const uuid = target.actor?.uuid ?? target.uuid;
  if (!uuid) return;
  const key = opaqueKey(uuid);
  if (!marked.some(actor => { const mark = entryOf(state(actor).marks?.[key]); return mark?.advantage === true && mark.targetUuid === uuid; })) return;
  config.advantage = true;
  roll.options ??= {};
  roll.options.advantage = true;
}

function couchBonus(actor, config, roll, activity) {
  if (!isMelee(activity) || config._ak5eChargerCouch) return null;
  const armed = entryOf(state(actor).couchArmed);
  const couch = armed?.useId ? vanguardUses.receipt(actor, armed.useId) : null;
  if (!live(couch) || couch.command !== 'chargerCouch') return null;
  if (couchClaimed(actor, couch.id) || live(undoList(actor).find(entry => entry.command === 'chargerCouchSpent' && entry.parentUseId === couch.id))) return null;
  claimCouch(actor, couch.id);
  const marker = { useId: couch.id };
  config._ak5eChargerCouch = marker;
  roll.options ??= {};
  roll.options._ak5eChargerCouch = marker;
  const bonus = Number(armed.bonus ?? couch.result?.bonus ?? 0);
  if (Number.isInteger(bonus) && bonus > 0) roll.parts.push(String(bonus));
  return vanguardUses.command(actor, 'chargerCouchSpent', { confirmed: true, couchId: couch.id, activityUuid: activity?.uuid }, cid('couchSpent', couch.id));
}

/** The next attack after a Momentous Strike is the Strike's single attack: stamp its card so the owner's Damage click finds the Strike. */
function openStrike(actor) {
  const strikes = undoList(actor).filter(entry => entry.command === 'chargerMomentousStrike' && live(entry));
  const strike = strikes.at(-1);
  return strike && strike.roll === undefined && !child(actor, strike.id, 'chargerStrikeAttack') && !child(actor, strike.id, 'chargerStrikeDamage') ? strike : null;
}
function stampStrikeAttack(actor, config, message, activity) {
  const strike = openStrike(actor);
  if (!strike || config._ak5eChargerStrikeAttack || !message || typeof message !== 'object') return;
  const target = marksmanAttackTarget(config);
  const marker = { actorUuid: actor.uuid, useId: strike.id, stage: 'attack', activityUuid: str(activity?.uuid), targetUuid: target.actor?.uuid ?? target.uuid ?? null };
  config._ak5eChargerStrikeAttack = marker;
  message.create = true;
  message.data ??= {}; message.data.flags ??= {}; message.data.flags.ak5e ??= {};
  message.data.flags.ak5e.chargerNative = marker;
}

export function chargerPreRollAttack(config, _dialog, message) {
  try {
    const roll = config?.rolls?.[0];
    if (!roll || !Array.isArray(roll.parts)) return undefined;
    const activity = config.subject, actor = activity?.actor ?? activity?.item?.actor;
    applyUnbalancing(config, roll);
    if (!actor?.isOwner || !isCharger(actor)) return undefined;
    const recording = couchBonus(actor, config, roll, activity);
    stampStrikeAttack(actor, config, message, activity);
    return recording ? Promise.resolve(recording).catch(error => {
      console.error('AK5e | Charger Couch record', error);
      warnUser('The Couch bonus was added to the roll but its undo record could not be saved.');
    }) : undefined;
  } catch (error) { console.error('AK5e | Charger attack hook', error); return undefined; }
}

function damageMarker(config, message) {
  const direct = config?.flags?.ak5e?.chargerNative ?? message?.data?.flags?.ak5e?.chargerNative;
  if (direct) return direct;
  const id = config?.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId;
  return id ? globalThis.game?.messages?.get?.(id)?.flags?.ak5e?.chargerNative ?? null : null;
}

export function chargerPreRollDamage(config, _dialog, message) {
  try {
    const roll = config?.rolls?.[0];
    if (!roll || !Array.isArray(roll.parts)) return;
    const activity = config.subject, actor = activity?.actor ?? activity?.item?.actor;
    const marker = damageMarker(config, message);
    if (!marker || !actor?.isOwner || marker.actorUuid !== actor.uuid || !isCharger(actor)) return;
    const strike = vanguardUses.receipt(actor, marker.useId);
    if (strike?.command !== 'chargerMomentousStrike' || !live(strike)) return;
    if (config._ak5eChargerStrike?.useId === strike.id || roll.options?._ak5eChargerStrike?.useId === strike.id) return;
    if (strike.roll !== undefined || child(actor, strike.id, 'chargerStrikeDamage')) {
      warnUser('This Momentous Strike already has its damage recorded, so no more Strike dice were added.');
      return;
    }
    const { momentum, die } = strikeResult(actor, strike);
    const stamped = { actorUuid: actor.uuid, useId: strike.id, stage: 'damage', activityUuid: str(marker.activityUuid) ?? str(activity?.uuid), targetUuid: str(marker.targetUuid) };
    roll.options ??= {};
    if (momentum > 0) roll.parts.push(`${momentum}d${die}`);
    roll.options._ak5eChargerStrike = stamped;
    config._ak5eChargerStrike = stamped;
    config.flags ??= {}; config.flags.ak5e ??= {};
    config.flags.ak5e.chargerNative = stamped;
    if (message && typeof message === 'object') {
      message.create = true;
      message.data ??= {}; message.data.flags ??= {}; message.data.flags.ak5e ??= {};
      message.data.flags.ak5e.chargerNative = stamped;
    }
    if (strike.result?.deathblow === true) {
      roll.options.flags ??= {}; roll.options.flags.ak5e ??= {};
      roll.options.flags.ak5e.ignoreResistance = true;
      roll.options.bypassResistance = true;
      roll.options.ak5eMarksman = { ...(roll.options.ak5eMarksman ?? {}), ignoreResistance: true };
      config.flags.ak5e.ignoreResistance = true;
    } else if (level(actor) >= 10 && momentum < 5) {
      warnUser(`Deathblow needs a Strike that consumed 5 or more Momentum; this one consumed ${momentum}, so its damage does not ignore Resistances.`);
    }
  } catch (error) { console.error('AK5e | Charger damage hook', error); }
}

async function recordChargerMessage(message, _options, userId) {
  const marker = message?.flags?.ak5e?.chargerNative;
  if (!marker || userId !== globalThis.game?.user?.id) return;
  const command = marker.stage === 'attack' ? 'chargerStrikeAttack' : marker.stage === 'damage' ? 'chargerStrikeDamage' : null;
  const actor = resolveActor(marker.actorUuid);
  if (!command || !actor?.isOwner || !isCharger(actor)) return;
  const strike = vanguardUses.receipt(actor, marker.useId);
  if (strike?.command !== 'chargerMomentousStrike' || !live(strike)) return;
  if (child(actor, strike.id, command)) return;
  await vanguardUses.command(actor, command, { confirmed: true, useId: strike.id, messageUuid: message.uuid }, cid(marker.stage, `${strike.id}:${message.uuid}`));
}

function resetGeirskogul(actor, result, config) {
  if ((config?.type ?? result?.type) !== 'long') return undefined;
  if (!actor?.isOwner || !isCharger(actor) || state(actor).geirskogulUsed !== true) return undefined;
  return actor.update({ 'flags.ak5e.charger.geirskogulUsed': false });
}

/* ---------------------------------------------------------------- trigger events */
function eventSpec(actor, event) {
  const S = state(actor), key = turnKeyOf(event), id = kind => cid(kind, event.eventId);
  const base = { confirmed: true, kind: event.kind, eventId: event.eventId };
  if (event.kind === 'initiative') return { ...base, id: id('initiative'), title: 'Gathering Momentum', summary: 'Initiative: gain 1 Momentum.', gain: 1 };
  if (event.kind === 'combatEnd') {
    const set = {};
    for (const name of ['movement', 'lastMovedAttack', 'lastQualifiedAttack', 'lastKill', 'couchArmed', 'renewTurn']) if (entryOf(S[name]) || (name === 'renewTurn' && S.renewTurn)) set[name] = null;
    for (const map of ['marks', 'damaged', 'tipOpportunities']) for (const [name, value] of Object.entries(S[map] ?? {})) if (value) set[`${map}.${name}`] = null;
    if (!getPool(actor, 'momentum').value && !Object.keys(set).length) return null;
    return { ...base, id: id('combatEnd'), title: 'Combat ended', summary: 'Combat ended: lose all Momentum.', setMomentum: 0, set };
  }
  if (event.kind === 'hit') {
    const target = str(event.targetUuid), movement = entryOf(S.movement);
    if (!target || !movement || movement.targetUuid !== target) return null;
    const qualifies = movement.hostile === true && !S.damaged?.[opaqueKey(target)];
    const set = { movement: null, lastMovedAttack: { targetUuid: target, eventId: event.eventId, moveEventId: str(movement.eventId) } };
    if (qualifies) set.lastQualifiedAttack = { attackId: str(event.attackId), targetUuid: target, eventId: event.eventId };
    return { ...base, id: id('hit'), title: 'Gathering Momentum', set, gain: qualifies ? 1 : 0,
      summary: qualifies ? 'Confirmed straight movement and a hostile melee hit on an undamaged Creature: gain 1 Momentum.'
        : 'The confirmed movement was used by this attack, but the target was not a hostile, undamaged Creature: no Momentum.' };
  }
  if (event.kind === 'hitTaken') {
    const target = str(event.actorUuid);
    if (!target || target === actor.uuid) return null;
    const k = opaqueKey(target), hasMark = Boolean(entryOf(S.marks?.[k])), wasDamaged = Boolean(S.damaged?.[k]);
    if (hasMark && wasDamaged) return null;
    const set = {};
    if (!wasDamaged) set[`damaged.${k}`] = true;
    const messageUuid = str(event.messageUuid);
    const strikeDamage = messageUuid ? undoList(actor).find(entry => entry.command === 'chargerStrikeDamage' && live(entry) && entry.result?.messageUuid === messageUuid) : null;
    if (!hasMark) {
      const moved = entryOf(S.lastMovedAttack);
      set[`marks.${k}`] = { targetUuid: target, sourceUuid: actor.uuid, eventId: event.eventId, useId: id('hitTaken'), turnKey: key,
        advantage: level(actor) >= 4 && moved?.targetUuid === target };
      if (moved?.targetUuid === target) set.lastMovedAttack = null;
    }
    return { ...base, id: id('hitTaken'), title: 'Mark for Elimination', set, ...(strikeDamage ? { parentUseId: strikeDamage.id } : {}),
      summary: hasMark ? `${nameOf(target)} was damaged again.` : `Marked ${nameOf(target)} until the beginning of your next Turn.` };
  }
  if (event.kind === 'kill') {
    const target = str(event.actorUuid);
    if (!target || target === actor.uuid) return null;
    const k = opaqueKey(target), mark = entryOf(S.marks?.[k]);
    const set = { lastKill: { eventId: event.eventId, targetUuid: target, turnKey: key } }, notes = [];
    if (mark) {
      set[`marks.${k}`] = null;
      set[`tipOpportunities.${opaqueKey(event.eventId)}`] = { targetUuid: target, eventId: event.eventId, status: 'available' };
      notes.push(`Marked ${nameOf(target)} reached 0 Hit Points: you can use Tip of the Spear.`);
    }
    let gain = 0;
    if (level(actor) >= 13 && S.renewTurn !== key) { gain = 1; set.renewTurn = key; notes.push('Renewing Momentum: gain 1 Momentum.'); }
    const markReceipt = mark?.useId ? vanguardUses.receipt(actor, mark.useId) : null;
    return { ...base, id: id('kill'), title: 'Creature reduced to 0 Hit Points', set, gain, ...(live(markReceipt) ? { parentUseId: markReceipt.id } : {}),
      summary: notes.join(' ') || `${nameOf(target)} was reduced to 0 Hit Points.` };
  }
  if (event.kind === 'turnStart') {
    const set = { turn: { key, eventId: event.eventId }, expiredAtTurnStart: event.eventId };
    for (const name of ['movement', 'lastMovedAttack', 'lastQualifiedAttack', 'lastKill']) if (entryOf(S[name])) set[name] = null;
    for (const map of ['marks', 'damaged', 'tipOpportunities']) for (const [name, value] of Object.entries(S[map] ?? {})) if (value) set[`${map}.${name}`] = null;
    const couch = undoList(actor).filter(entry => entry.command === 'chargerCouch' && live(entry)).at(-1);
    const spent = couch && (couchClaimed(actor, couch.id) || undoList(actor).some(entry => entry.command === 'chargerCouchSpent' && entry.parentUseId === couch.id && live(entry)));
    const arm = couch && !spent && couch.id !== S.couchArmed?.useId && couch.result?.useTurnKey !== key
      ? { useId: couch.id, bonus: Number(couch.result?.bonus ?? 0), turnKey: key } : null;
    if (arm) set.couchArmed = arm; else if (entryOf(S.couchArmed)) set.couchArmed = null;
    return { ...base, id: id('turnStart'), title: 'Your Turn begins', set, summary: `Marks expired at the beginning of your Turn.${arm ? ` Couch is armed: your first Melee Attack Roll gets +${arm.bonus}.` : ''}` };
  }
  return null;
}

async function processFor(actor, event) {
  if (!actor?.isOwner || !isCharger(actor) || !str(event.eventId)) return;
  await serial(actor, async () => {
    const spec = eventSpec(actor, event);
    if (!spec || vanguardUses.receipt(actor, spec.id)) return;
    const { id, ...data } = spec;
    await vanguardUses.command(actor, 'chargerEvent', data, id);
  });
}

async function handleEvent(event) {
  if (!event || typeof event.kind !== 'string') return;
  if (event.kind === 'combatEnd') {
    for (const uuid of Array.isArray(event.actorUuids) ? event.actorUuids : []) await processFor(resolveActor(uuid), event);
    return;
  }
  await processFor(resolveActor(event.kind === 'hitTaken' || event.kind === 'kill' ? event.sourceActorUuid : event.actorUuid), event);
}

const nativeHookRegistries = new WeakSet();
let registered = false;

/** Idempotent per Hooks registry, so the native bridge is also present after the host replaces its Hooks object. */
function ensureNativeHooks() {
  if (!globalThis.Hooks || nativeHookRegistries.has(Hooks)) return;
  nativeHookRegistries.add(Hooks);
  Hooks.on('dnd5e.preRollAttackV2', chargerPreRollAttack);
  Hooks.on('dnd5e.preRollDamageV2', chargerPreRollDamage);
  Hooks.on('dnd5e.restCompleted', resetGeirskogul);
  Hooks.on('createChatMessage', (message, options, userId) => {
    Promise.resolve(recordChargerMessage(message, options, userId)).catch(error => {
      console.error('AK5e | Charger native message', error);
      globalThis.ui?.notifications?.error?.('Charger could not record the native roll. Review the roll and retry.');
    });
  });
}

export function registerChargerFeatureHooks() {
  if (!getPoolDefinition('momentum')) definePool({ id: 'momentum', label: 'Momentum', max: MAX_MOMENTUM, initial: 0 });
  vanguardUses.register({ plans, readings, cleanup });
  registerVanguardTipGrantSource(CHARGER_TIP_GRANT_KIND, validateMarkTip);
  ensureNativeHooks();
  if (registered) return;
  registered = true;
  for (const kind of ['initiative', 'hit', 'hitTaken', 'kill', 'turnStart', 'combatEnd']) onAk5eEvent(kind, handleEvent);
}

/** The owner attests a straight, 15-foot move toward a creature before the attack that follows it. Validation happens before any write. */
export async function recordChargerMovement(actor, data) {
  need(actor?.isOwner && isCharger(actor), 'Choose an owned Charger.');
  need(data && data.confirmed === true, 'Confirm movement first.');
  const feet = Number(data.feet);
  need(Number.isFinite(feet) && feet >= 15, 'At least 15 feet is required.');
  need(data.straight === true, 'Movement must be straight.');
  const targetUuid = str(data.targetUuid);
  need(targetUuid, 'Choose the creature you moved toward.');
  const eventId = str(data.eventId) ?? globalThis.foundry?.utils?.randomID?.() ?? `move-${Date.now()}`;
  return vanguardUses.command(actor, 'chargerEvent', { confirmed: true, kind: 'movement', eventId, title: 'Charger movement',
    summary: `Owner confirms ${feet} feet of straight movement toward ${nameOf(targetUuid)}.`,
    set: { movement: { feet, straight: true, hostile: data.hostile === true, targetUuid, eventId } } }, cid('move', eventId));
}
