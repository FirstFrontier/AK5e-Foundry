import { vanguardUses, registerTipTemporaryHpHooks } from './vanguard-uses.mjs';
import { warn } from './play-uses.mjs';
import { onAk5eEvent, getReactions, emitAk5eEvent } from './trigger-events.mjs';
import { vanguardEnabled, vanguardLevel, vanguardProfile, vanguardState } from './vanguard-rules.mjs';
import { resolveReading } from './play-undo.mjs';
import { resolveDamage } from './damage-pipeline.mjs';
import { tagActors } from './feature-tags.mjs';
import { need, opaqueKey, keyedSerial, values, esc } from './operation-kernel.mjs';

export const initialAgentState = () => ({ fade: { usesSpent: 0, active: false }, surgical: { payItForwardAvailable: false, payItForwardUsedThisTurn: false, secondStrike: { pendingTargetUuid: null, awaitingLevelChoice: false } }, smoke: { usesSpent: 0, active: null, freeKillUseAvailable: false }, hits: [] });
export const agentState = actor => structuredClone(actor.flags?.ak5e?.agent ?? initialAgentState());
const trackedActors = new Map(), serial = keyedSerial(), initializations = new Map();
const isAgent = actor => {
  const profile = vanguardProfile(actor);
  if (profile.branch) return profile.branch === 'agent';
  // Older imported branch Items can lack their classIdentifier link.
  return profile.applicable && !profile.blocked.length && !profile.branchItem && values(actor?.items).some(item =>
    item.type === 'subclass' && (item.flags?.ak5e?.chapterThreeId === 'subclass-vanguard-agent' || /^(?:Vanguard:\s*)?Agent$/i.test(item.name ?? '')));
};
export function trackAgentActor(actor) { if (actor?.uuid) trackedActors.set(actor.uuid, actor); }
export function initializeAgent(actor) {
  if (initializations.has(actor.uuid)) return initializations.get(actor.uuid);
  if (actor?.flags?.ak5e?.agent) return Promise.resolve();
  if (!initializations.has(actor.uuid)) {
    const pending = Promise.resolve(actor.update({ 'flags.ak5e.agent': initialAgentState() })).finally(() => initializations.delete(actor.uuid));
    initializations.set(actor.uuid, pending);
  }
  return initializations.get(actor.uuid);
}
function changedLeaves(before, after, path, changes = {}) {
  if (JSON.stringify(before) === JSON.stringify(after)) return changes;
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(after, key)) changes[`${path}.-=${key}`] = null;
      else changedLeaves(before[key], after[key], `${path}.${key}`, changes);
    }
  } else changes[path] = after;
  return changes;
}
const update = (actor, before, state) => { const changes = changedLeaves(before, state, 'flags.ak5e.agent'); return Object.keys(changes).length ? actor.update(changes) : Promise.resolve(); };
const originalCommand = vanguardUses.command;
vanguardUses.command = (actor, name, data, ...rest) => {
  const receipt = ['undoUse', 'useRoll'].includes(name) ? vanguardUses.receipt(actor, data?.useId) : null;
  if (!name.startsWith('agent') && !receipt?.command?.startsWith('agent')) return originalCommand(actor, name, data, ...rest);
  return serial(actor, async () => {
    await initializeAgent(actor);
    if (name === 'undoUse' && receipt?.command === 'agentCase' && receipt.status !== 'undone' && !vanguardUses.previewUndo(actor, receipt.id).blocked) {
      need(actor.isOwner && !actor.pack && vanguardEnabled(actor), 'Choose an owned, configured Vanguard.');
      await prepareCaseUndo(actor, receipt, data);
    }
    const result = await originalCommand(actor, name, data, ...rest);
    // Native damage events are asynchronous. Settle this use's credit before
    // returning, using the same identity as its native kill event on either client.
    const useId = receipt?.id ?? rest[0], use = vanguardUses.receipt(actor, useId);
    if (use?.command === 'agentCase' && use.status !== 'undone') {
      const target = globalThis.fromUuidSync?.(use.targetUuid) ?? await globalThis.fromUuid?.(use.targetUuid);
      const applied = target?.flags?.ak5e?.vanguardUsesApplied?.[keyFor(actor, useId)];
      if (applied?.killed && !applied.undone) await grantCaseKill(actor, useId);
    }
    return result;
  });
};

const drReading = 'agentCaseDamageReduction';
const drOptions = [
  { value: 'highest', label: 'Use the highest applicable Damage Reduction source for this use.' },
  { value: 'sum', label: 'Add applicable Damage Reduction sources for this use.' }
];
// Source: Second Strike deals damage "equal to your Agent Level", which the book never defines.
const levelReading = 'agentLevel';
const levelOptions = [
  { value: 'vanguard', label: 'Agent Level is your Vanguard class level.' },
  { value: 'character', label: 'Agent Level is your total character level.' }
];
const validAgentLevel = value => value !== '' && value !== null && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 20;
/** The recorded GM ruling for Agent Level (an option value), or undefined when none is recorded. */
export function agentLevelRuling(actor) {
  const record = vanguardState(actor).rulings?.[levelReading];
  return record?.source?.trim?.() && record.value !== undefined ? record.value : undefined;
}
function agentLevelFor(actor, reading) {
  const vanguard = vanguardLevel(actor);
  if (reading === 'character') return Math.min(20, Number(actor.system?.details?.level) || vanguard || 0);
  return vanguard;
}
function caseDefenses(target) {
  const reductions = values(target?.items).filter(item => item.system?.equipped).map(item => String(item.flags?.ak5e?.tableData?.['damage reduction'] ?? '').match(/^(\d+)\s*\((Physical|All|Piercing)\)$/i)).filter(Boolean).map(match => Number(match[1]));
  const adjustment = values(target?.effects).filter(effect => !effect.disabled).reduce((sum, effect) => sum + (Number(effect.flags?.ak5e?.drAdjustment) || 0), 0);
  return { reductions, adjustment, corroded: target?.statuses?.has?.('ak5e-corroded') ?? false };
}
const caseTarget = uuid => globalThis.fromUuidSync?.(uuid);
const caseCreditId = (source, useId) => `agentCase:${source.uuid}:${useId}`;
function caseCreditParent(actor, creditId) {
  const prefix = `agentCase:${actor.uuid}:`;
  if (!creditId?.startsWith(prefix)) return null;
  const useId = creditId.slice(prefix.length), use = vanguardUses.receipt(actor, useId);
  return use?.command === 'agentCase' && use.status !== 'undone' ? useId : null;
}
async function grantCaseKill(actor, useId) {
  const id = caseCreditId(actor, useId), s = agentState(actor), before = structuredClone(s);
  if (Object.hasOwn(s.caseKillCredits ?? {}, opaqueKey(useId))) return;
  (s.caseKillCredits ??= {})[opaqueKey(useId)] = 'active';
  s.seenEvents = [...(s.seenEvents ?? []).slice(-199), id];
  s.smoke.freeKillUseAvailable = true; s.smoke.killCreditId = id;
  await update(actor, before, s);
}
const plans = {
  agentExpertise(actor, _state, data) {
    const warnings = [], skill = actor.system.skills?.[data.skillId], current = agentState(actor);
    if (current.expertiseSkill) warn(warnings, 'expertise-used', 'Secret Agent grants one Expertise choice.');
    if (Number(skill?.value) !== 1) warn(warnings, 'skill', 'Choose a proficient Skill for Expertise.');
    return { title: 'Secret Agent: Expertise', warnings, apply(_next, receipt) {
      need(skill, 'Choose a Skill for Expertise.');
      receipt.skillId = data.skillId; receipt.skillBefore = skill.value; current.expertiseSkill = data.skillId;
      return { [`system.skills.${data.skillId}.value`]: 2, 'flags.ak5e.agent.expertiseSkill': current.expertiseSkill };
    } };
  },
  agentFade(actor, _state, data) {
    const s = agentState(actor), pb = Math.max(0, Number(actor.system.attributes.prof) || 0), warnings = [];
    if (!data.inDarkness && s.fade.usesSpent >= pb) warn(warnings, 'fade-uses', 'Fade uses exhausted until Long Rest.');
    return { title: 'Secret Agent: Fade', warnings, costs: data.inDarkness ? [] : [{ label: 'Fade uses', amount: 1 }], apply(_next, receipt) {
      if (!data.inDarkness) { const remaining = Math.max(0, pb - s.fade.usesSpent); receipt.resources = [{ path: 'flags.ak5e.agent.fade.remaining', before: remaining, after: Math.max(0, remaining - 1), max: pb, label: 'Fade uses' }]; s.fade.usesSpent = Math.min(pb, s.fade.usesSpent + 1); s.fade.remaining = Math.max(0, pb - s.fade.usesSpent); }
      receipt.fadeGeneration = s.fade.generation ?? 0; s.fade.active = true; s.fade.expiry = data.expiry ?? 'endOfNextTurn'; s.fade.turnStarts = 0;
      receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: 'agentFadeEffect', ready: true }];
      receipt.summary = 'Invisible until the end of your next Turn; ends early on an Attack Roll or forcing a save. Confirm forced saves manually.';
      return { 'flags.ak5e.agent.fade.active': true, 'flags.ak5e.agent.fade.expiry': s.fade.expiry, 'flags.ak5e.agent.fade.turnStarts': 0, 'flags.ak5e.agent.fade.usesSpent': s.fade.usesSpent, ...(s.fade.remaining === undefined ? {} : { 'flags.ak5e.agent.fade.remaining': s.fade.remaining }) };
    } };
  },
  agentShadowstrike(actor, _state, data) { return { title: 'Strike from the Shadows: Shadowstrike', warnings: data.invisibleAtActionStart ? [] : [{ id: 'invisible', text: 'Confirm Invisible when the Attack Action began.' }], apply(_next, receipt) { const s = agentState(actor); s.shadowstrikeUsed = true; receipt.summary = 'One additional attack in this Attack Action; each hit offers Tip of the Spear. Quicklaunch: draw a different Thrown weapon.'; return { 'flags.ak5e.agent.shadowstrikeUsed': true }; } }; },
  agentSurgical(actor, _state, data) {
    const s = agentState(actor), warnings = [];
    if (data.benefit === 'payItForward' && !Number.isFinite(Number(actor.system.attributes.movement?.walk))) warn(warnings, 'speed', 'Walking Speed is unavailable; measure up to half your Speed manually.');
    if (data.benefit === 'payItForward' && (s.surgical.payItForwardUsedThisTurn || !s.surgical.payItForwardAvailable)) warn(warnings, 'pay', 'Pay it Forward requires a qualifying hit and is once per Turn.');
    if (data.benefit === 'secondStrike' && !(s.surgical.secondStrike.awaitingLevelChoice && s.surgical.secondStrike.pendingTargetUuid === data.targetUuid) && !(s.surgical.secondStrike.queuedChoices ?? []).some(choice => choice.targetUuid === data.targetUuid)) warn(warnings, 'strike', 'Second Strike requires the next melee attack against that creature.');
    // A recorded GM ruling always supersedes the per-use Agent Level choice; without one, a valid
    // numeric per-use choice applies, and otherwise the player is asked for a public reading.
    const useReading = data.benefit === 'secondStrike' && (agentLevelRuling(actor) !== undefined || !validAgentLevel(data.agentLevel));
    return { title: 'Surgical Strike', warnings, ...(useReading ? { reading: levelReading } : {}), apply(_next, receipt, reading) {
      if (data.benefit === 'secondStrike') { const level = reading ? agentLevelFor(actor, reading) : Number(data.agentLevel); need(validAgentLevel(level), 'Choose Agent Level.');
        if (reading) { receipt.reading = levelOptions.find(option => option.value === reading)?.label; receipt.readingSource = agentLevelRuling(actor) !== undefined ? 'ruling' : 'player'; }
        else { receipt.reading = `Agent Level chosen for this use: ${level}`; receipt.readingSource = 'player'; }
        const p = s.surgical.secondStrike; const queued = (p.queuedChoices ?? []).find(choice => choice.targetUuid === data.targetUuid); p.lastApplied = { targetUuid: data.targetUuid, agentLevelDamage: level, attackEventId: queued?.attackEventId ?? p.attackEventId }; if (queued) p.queuedChoices = p.queuedChoices.filter(choice => choice !== queued); else { p.pendingTargetUuid = p.queuedTargets?.shift() ?? null; p.awaitingLevelChoice = false; } receipt.summary = `Add ${level} damage to the matching melee attack manually.`; }
      else { s.surgical.payItForwardUsedThisTurn = true; s.surgical.payItForward = { movementAllowanceFeet: (Number(actor.system.attributes.movement?.walk) || 0) / 2 }; }
      return data.benefit === 'secondStrike' ? { 'flags.ak5e.agent.surgical.secondStrike': s.surgical.secondStrike } : { 'flags.ak5e.agent.surgical.payItForwardUsedThisTurn': true, 'flags.ak5e.agent.surgical.payItForward': s.surgical.payItForward };
    } };
  },
  agentCase(actor, _state, data) {
    const s = agentState(actor), warnings = [];
    if (!s.shadowstrikeUsed && data.shadowstrikeUsed !== true) warn(warnings, 'shadowstrike', 'Confirm Shadowstrike was used this Turn.');
    if (data.targetVisible === false) warn(warnings, 'visible', 'The target must be visible.');
    if (data.targetVisible == null) warn(warnings, 'visibility-unknown', 'Confirm the target is visible.');
    if (data.targetDistanceFeet == null) warn(warnings, 'distance-unknown', 'Confirm the target is within 30 feet.');
    if (Number(data.targetDistanceFeet) > 30) warn(warnings, 'range', 'The target must be within 30 feet.');
    need(data.targetUuid, 'Choose a target.');
    const dice = (vanguardLevel(actor) ?? 1) >= 14 ? 2 : 1;
    const count = Math.max(0, Number(s.hits.find(h => h.uuid === data.targetUuid)?.count) || 0);
    if (!count) warn(warnings, 'case-hits', 'No qualifying hit against this target was recorded this Turn.');
    const defenses = caseDefenses(caseTarget(data.targetUuid));
    const reviewed = data.reviewedDR !== undefined && data.reviewedDR !== '';
    if (reviewed) need(Number.isInteger(Number(data.reviewedDR)) && Number(data.reviewedDR) >= 0, 'Reviewed DR must be a nonnegative whole number.');
    return { title: 'Closing the Case', warnings, ...(defenses.reductions.length > 1 && !reviewed ? { reading: drReading } : {}), apply(_next, receipt, reading) {
      receipt.formula = `${count * dice}d8`; receipt.rollLabel = 'Piercing damage'; receipt.targetUuid = data.targetUuid;
      receipt.summary = `Vanguard level ${vanguardLevel(actor) ?? 1}: ${dice}d8 per qualifying hit; ${count} qualifying hits. Roll piercing damage for ${data.targetUuid}.`;
      receipt.targets = [{ uuid: data.targetUuid, name: data.targetName ?? 'Target', kind: 'agentCaseDamage', ready: false,
        damageProperties: Array.from(data.damageProperties ?? []).filter(property => typeof property === 'string' && /^[a-z][a-z0-9_-]{0,30}$/i.test(property)),
        ...(reading ? { drPolicy: reading } : {}), ...(reviewed ? { reviewedDR: Number(data.reviewedDR) } : {}) }];
      if (reading) {
        receipt.reading = drOptions.find(option => option.value === reading)?.label;
        receipt.readingSource = vanguardState(actor).rulings?.[drReading]?.source?.trim?.() ? 'ruling' : 'player';
      }
      if (reviewed) receipt.manualSteps.push(`Reviewed DR total for this use: ${Number(data.reviewedDR)} before adjustments and Corroded. No ruling is saved.`);
      return {};
    } };
  },
  agentProfessional() { return { title: 'Consummate Professional', warnings: [], apply(_next, receipt) { receipt.summary = 'Mechanism Kit proficiency; always considered to have a Mechanism Kit with unlimited charges.'; return {}; } }; },
  agentEndFade(actor) { return { title: 'End Fade', warnings: [], async apply(_next, receipt) { const s = agentState(actor); s.fade.active = false; receipt.summary = 'End Fade after forcing a saving throw or expiry.'; receipt.targets = [{ uuid: actor.uuid, name: actor.name, kind: 'agentEndFadeEffect', ready: true }]; return { 'flags.ak5e.agent.fade.active': false }; } }; },
  agentSmoke(actor, _state, data) { const s = agentState(actor), warnings = []; const useFree = s.smoke.freeKillUseAvailable && data.useKillExemption !== false; if ((vanguardLevel(actor) ?? 1) < 17) warn(warnings, 'level', 'Smoke and Mirrors is a level 17 feature.'); if (data.timing === 'reaction' && getReactions(actor)?.available < 1) warn(warnings, 'reaction', 'No Reaction remains.'); if (s.smoke.usesSpent && !useFree) warn(warnings, 'smoke-use', 'Smoke and Mirrors use spent until Short Rest.');
    return { title: 'Smoke and Mirrors', warnings, costs: [{ label: 'Short Rest use', amount: useFree ? 0 : 1 }], apply(_next, receipt) { receipt.smokeGeneration = s.smoke.generation ?? 0; receipt.smokeKillCreditId = s.smoke.killCreditId ?? null; receipt.smokeSpent = !useFree && !s.smoke.usesSpent; receipt.smokeFree = useFree;
      const parent = useFree && caseCreditParent(actor, receipt.smokeKillCreditId);
      if (parent) { receipt.parentUseId = parent; receipt.manualSteps.push('Undoing the Closing the Case kill also undoes this free Smoke use. Remove its manually placed sphere when undone.'); }
      if (data.timing === 'reaction') receipt.reaction = { requested: true, spent: false, triggerId: `${receipt.id}-agentSmoke` }; if (useFree) s.smoke.freeKillUseAvailable = false; else s.smoke.usesSpent = 1; s.smoke.active = { radiusFeet: 10, centerActorUuid: actor.uuid, selfCanSee: true, expiry: 'startOfNextTurn', useId: receipt.id }; receipt.summary = `Magical Darkness in a 10-foot sphere centered on you; you can see through it. Timing: ${data.timing ?? 'during your Turn'}. Place and remove the sphere manually.`; return { 'flags.ak5e.agent.smoke.usesSpent': s.smoke.usesSpent, 'flags.ak5e.agent.smoke.freeKillUseAvailable': s.smoke.freeKillUseAvailable, 'flags.ak5e.agent.smoke.active': s.smoke.active }; } };
  }
};
plans.agentFade.undoUpdates = (actor, _state, receipt) => {
  const fade = actor.flags?.ak5e?.agent?.fade ?? {}, updates = {};
  const active = [...(actor.effects?.values?.() ?? [])].some(effect => effect.flags?.ak5e?.agentFadeUse);
  if (!active) updates['flags.ak5e.agent.fade.active'] = false;
  if (receipt.resources?.length) {
    const spent = receipt.resources[0].before - receipt.resources[0].after;
    const used = (fade.generation ?? 0) === receipt.fadeGeneration ? Math.max(0, (Number(fade.usesSpent) || 0) - spent) : Number(fade.usesSpent) || 0;
    updates['flags.ak5e.agent.fade.usesSpent'] = used;
    updates['flags.ak5e.agent.fade.remaining'] = Math.max(0, (Number(actor.system.attributes.prof) || 0) - used);
  }
  return updates;
};
plans.agentSmoke.undoUpdates = (actor, _state, receipt) => {
  const smoke = actor.flags?.ak5e?.agent?.smoke ?? {}, updates = { 'flags.ak5e.agent.smoke.usesSpent': Number(smoke.usesSpent) || 0, 'flags.ak5e.agent.smoke.freeKillUseAvailable': Boolean(smoke.freeKillUseAvailable) };
  if ((smoke.generation ?? 0) === receipt.smokeGeneration && receipt.smokeSpent) updates['flags.ak5e.agent.smoke.usesSpent'] = Math.max(0, (Number(smoke.usesSpent) || 0) - 1);
  if (receipt.smokeFree && (smoke.generation ?? 0) === receipt.smokeGeneration) {
    const prefix = `agentCase:${actor.uuid}:`, id = receipt.smokeKillCreditId;
    const creditUndone = id?.startsWith(prefix) && actor.flags?.ak5e?.agent?.caseKillCredits?.[opaqueKey(id.slice(prefix.length))] === 'undone';
    if (smoke.killCreditId === id && !creditUndone) updates['flags.ak5e.agent.smoke.freeKillUseAvailable'] = true;
  }
  if (smoke.active?.useId === receipt.id) updates['flags.ak5e.agent.smoke.active'] = null;
  return updates;
};
plans.agentSmoke.undoNotes = (_actor, _state, receipt) => [`Remove the manually placed Smoke and Mirrors sphere for use ${receipt.id}; later spheres remain. This use's Reaction, if spent and not already refreshed, is restored.`];
plans.agentExpertise.undoUpdates = (actor, _state, receipt) => actor.system.skills?.[receipt.skillId]?.value === 2 ? { [`system.skills.${receipt.skillId}.value`]: receipt.skillBefore } : {};
plans.agentCase.beforeRoll = async (actor, receipt, data) => {
  const entry = receipt.targets[0];
  if (entry.reduction !== undefined || receipt.roll !== undefined) return;
  const { reductions } = caseDefenses(caseTarget(entry.uuid));
  if (reductions.length > 1 && entry.reviewedDR === undefined && !entry.drPolicy) {
    const record = vanguardState(actor).rulings?.[drReading];
    let choice = data.readings?.[drReading] ?? data.reading;
    // The shared card Roll button does not forward confirmation-loop extras.
    // Ask here on the initiating client if defenses changed since confirmation.
    if (!choice && !record?.source?.trim?.() && globalThis.foundry?.applications?.api?.DialogV2) {
      choice = await foundry.applications.api.DialogV2.wait({ window: { title: 'Closing the Case: Damage Reduction for this use' }, rejectClose: false,
        content: '<p>Multiple Damage Reduction sources now apply. Choose for this use only; your choice is public and saves no ruling.</p>',
        buttons: [...drOptions.map(option => ({ action: option.value, label: option.label, callback: () => option.value })), { action: 'cancel', label: 'Cancel', default: true, callback: () => false }] });
      if (!drOptions.some(option => option.value === choice)) throw new Error('Damage roll cancelled; nothing was rolled or applied.');
    }
    const reading = resolveReading(record?.source?.trim?.() ? record.value : undefined, choice, drReading, 'Multiple applicable Damage Reduction sources', drOptions);
    entry.drPolicy = reading.value;
    receipt.reading = drOptions.find(option => option.value === reading.value)?.label;
    receipt.readingSource = reading.source;
  }
  entry.reduction = entry.reviewedDR ?? (entry.drPolicy === 'sum' ? reductions.reduce((sum, value) => sum + value, 0) : Math.max(0, ...reductions));
  receipt.manualSteps.push(`DR for this damage roll: ${entry.reduction} before adjustments and Corroded${entry.reviewedDR !== undefined ? ' (reviewed total)' : entry.drPolicy ? ` (${entry.drPolicy}, ${receipt.readingSource === 'ruling' ? 'GM ruling' : 'this use only'})` : ' (single applicable source)'}. Damage properties: ${entry.damageProperties?.join(', ') || 'none'}.`);
  return true;
};
plans.agentCase.validateTarget = (_source, receipt, entry, target) => entry.kind === 'agentCaseDamage' && entry.uuid === receipt.targetUuid && target.uuid === receipt.targetUuid && entry.amount === receipt.roll && Number.isFinite(entry.amount) && entry.amount >= 0 && Number.isInteger(entry.reduction) && entry.reduction >= 0;
const keyFor = (source, useId) => opaqueKey(`${useId}:${source.uuid}`);
const targetSerial = keyedSerial();
const tempSnapshot = target => ({ temp: Number(target.system.attributes.hp.temp) || 0, revision: target.flags?.ak5e?.tipTemporaryHpRevision ?? null });
function caseReversal(source, useId, target, entry) {
  const applied = target?.flags?.ak5e?.vanguardUsesApplied?.[keyFor(source, useId)];
  if (!applied || applied.undone) return null;
  const hp = target.system.attributes.hp, value = Number(hp.value) || 0, temp = Number(hp.temp) || 0;
  const hpLoss = applied.before.value - applied.after.value, tempLoss = applied.before.temp - applied.after.temp;
  const restoredValue = Math.max(value, Math.min(Math.max(Number(hp.max) || 0, applied.before.value), value + hpLoss));
  const snapshot = tempSnapshot(target), resolution = entry?.undoTempResolution;
  const conflict = tempLoss > 0 && (temp !== applied.after.temp || snapshot.revision !== (applied.expectedRevision ?? null));
  // A replacement cannot be distinguished from later damage from the pool's
  // numeric value alone. Never manufacture a second pool without a table choice.
  const reconciled = conflict && (resolution?.mode === 'preserve' ||
    ['restoreLoss', 'reviewed'].includes(resolution?.mode) && resolution.expectedTemp === temp && resolution.expectedRevision === snapshot.revision &&
    (resolution.mode !== 'reviewed' || Number.isInteger(resolution.total) && resolution.total >= 0));
  const restoredTemp = !conflict ? temp + tempLoss : !reconciled || resolution.mode === 'preserve' ? temp : resolution.mode === 'reviewed' ? resolution.total : temp + tempLoss;
  return { applied, before: { value, temp }, after: { value: restoredValue, temp: restoredTemp },
    hpLoss, tempLoss, conflict, needsReconciliation: conflict && !reconciled,
    ...(reconciled ? { reconciliation: { ...resolution, actualTempBefore: temp, actualRevision: snapshot.revision } } : {}),
    changed: value !== applied.after.value || temp !== applied.after.temp };
}
function caseUndoText(source, useId, entry, target) {
  const reversal = caseReversal(source, useId, target, entry);
  if (!reversal) return `${entry.name}: no outstanding damage to reverse.`;
  const { before, after, changed, hpLoss } = reversal;
  const reconciliation = reversal.needsReconciliation ? ' Temporary HP was written later. Before undo, choose to keep the current replacement pool, confirm only subsequent damage affected the same pool, or enter a reviewed total. No temporary HP is restored without that choice.' : reversal.reconciliation ? ` Temporary HP reconciliation for this undo: ${reversal.reconciliation.mode === 'preserve' ? 'keep the current pool (later replacement)' : reversal.reconciliation.mode === 'restoreLoss' ? 'table confirms later damage to the same pool; restore this use\'s consumed temporary HP' : `use table-reviewed total ${after.temp}`}.` : '';
  return `${entry.name}: ${changed ? 'Later HP changes are preserved by restoring only this use\'s recorded HP loss, capped at the HP maximum. ' : ''}HP ${before.value} → ${after.value}; temporary HP ${before.temp} → ${after.temp}. ${hpLoss - (after.value - before.value)} HP will not be restored because of the HP maximum.${reconciliation}${reversal.applied.killed ? ' Revoke this kill\'s Smoke and Mirrors exemption; also undo free Smoke uses dependent on this kill and remove their manually placed spheres. Preserve later kills and independent spheres.' : ''}`;
}
plans.agentCase.undoNotes = (source, _state, receipt) => receipt.targets.filter(entry => entry.applied || entry.attempted).map(entry => caseUndoText(source, receipt.id, entry, caseTarget(entry.uuid)));

async function prepareCaseUndo(source, receipt, data) {
  const resolutions = new Map();
  for (const entry of receipt.targets ?? []) {
    if (!entry.applied && !entry.attempted) continue;
    const target = caseTarget(entry.uuid) ?? await globalThis.fromUuid?.(entry.uuid);
    const reversal = caseReversal(source, receipt.id, target, entry);
    if (!reversal?.needsReconciliation) continue;
    const snapshot = tempSnapshot(target);
    let choice = data.temporaryHpReconciliation?.[entry.uuid] ?? data.temporaryHpReconciliation;
    if (!choice) {
      const dialog = globalThis.foundry?.applications?.api?.DialogV2;
      need(dialog, 'Temporary HP changed later. Retry Undo with temporaryHpReconciliation: {mode: "preserve"}, {mode: "restoreLoss"}, or {mode: "reviewed", total: N}.');
      choice = await dialog.wait({ window: { title: 'Closing the Case: reconcile temporary HP before undo' }, rejectClose: false,
        content: `<p>${esc(entry.name)} currently has ${snapshot.temp} temporary HP. This use consumed ${reversal.tempLoss}; the pool was written later. Choose how this undo should treat the pool. Your choice is public and saves no ruling.</p><p>Keep the current pool if it was replaced. Restore the consumed amount only if later damage affected the same pool.</p><label>Optional table-reviewed final temporary HP <input name="total" type="number" min="0" step="1"></label>`,
        buttons: [
          { action: 'preserve', label: 'Undo; keep current temporary HP', callback: () => ({ mode: 'preserve' }) },
          { action: 'restoreLoss', label: `Undo; same pool, restore ${reversal.tempLoss}`, callback: () => ({ mode: 'restoreLoss' }) },
          { action: 'reviewed', label: 'Undo; use reviewed total', callback: (_event, button) => { const field = button.form.elements.total; return field.value !== '' && Number.isInteger(Number(field.value)) && Number(field.value) >= 0 ? { mode: 'reviewed', total: Number(field.value) } : false; } },
          { action: 'cancel', label: 'Cancel', default: true, callback: () => false }
        ] });
      need(choice, 'Undo cancelled; nothing was reversed.');
    }
    need(['preserve', 'restoreLoss', 'reviewed'].includes(choice.mode) && (choice.mode !== 'reviewed' || Number.isInteger(choice.total) && choice.total >= 0), 'Choose how to reconcile temporary HP for this undo.');
    resolutions.set(entry.uuid, { mode: choice.mode, ...(choice.mode === 'reviewed' ? { total: choice.total } : {}), expectedTemp: snapshot.temp, expectedRevision: snapshot.revision });
  }
  // Stage choices in the durable source receipt, under the shared ledger lock,
  // before any dependent Smoke or relayed target reversal can change documents.
  if (resolutions.size) await vanguardUses.serial(source, async () => {
    const state = vanguardUses.state(source), use = state.undo.find(use => use.id === receipt.id);
    need(use && use.status !== 'undone', 'This use was already undone.');
    for (const entry of use.targets) if (resolutions.has(entry.uuid)) entry.undoTempResolution = resolutions.get(entry.uuid);
    await source.update({ 'flags.ak5e.vanguardUses': state });
  });
}

// Non-Foundry document adapters (including the unit fixture) have no native
// damage method. Keep this fallback type-aware; production uses applyDamage.
function fallbackDefenses(target, properties) {
  const has = (collection, key) => collection?.has?.(key) || collection?.includes?.(key);
  const applies = trait => !properties.some(property => has(trait?.bypasses, property)) && (has(trait?.value, 'piercing') || has(trait?.value, 'ALL'));
  const traits = target.system?.traits ?? {};
  return { immune: Boolean(applies(traits.di)), resistance: Boolean(applies(traits.dr)), vulnerability: Boolean(applies(traits.dv)) };
}
const targetKinds = {
  agentFadeEffect: {
    local: true,
    async apply(source, useId, _entry, target) {
      need(source.uuid === target.uuid, 'Fade applies to its owner.');
      const existing = [...(target.effects?.values?.() ?? [])].find(effect => effect.flags?.ak5e?.agentFadeUse === useId);
      if (existing) return true;
      await target.createEmbeddedDocuments('ActiveEffect', [{ name: 'Fade: Invisible', img: 'icons/svg/invisible.svg', statuses: ['invisible'], flags: { ak5e: { agentFadeUse: useId } } }]);
      return true;
    },
    async revert(_source, useId, _entry, target) { const ids = [...(target.effects?.values?.() ?? [])].filter(e => e.flags?.ak5e?.agentFadeUse === useId).map(e => e.id); if (ids.length) await target.deleteEmbeddedDocuments('ActiveEffect', ids); return { removed: ids.length }; },
    preview() { return 'Remove the Invisible effect created by this Fade use.'; }
  },
  agentEndFadeEffect: {
    local: true,
    async apply(_source, useId, _entry, target) {
      const key = opaqueKey(useId), path = `flags.ak5e.agentEndedFade.${key}`;
      const effects = [...(target.effects?.values?.() ?? [])].filter(e => e.flags?.ak5e?.agentFadeUse);
      const saved = effects.map(e => ({ name: e.name, img: e.img, statuses: [...(e.statuses ?? ['invisible'])], flags: { ak5e: { agentFadeUse: e.flags.ak5e.agentFadeUse } } }));
      await target.update({ [path]: saved }); if (effects.length) await target.deleteEmbeddedDocuments('ActiveEffect', effects.map(e => e.id)); return true;
    },
    async revert(_source, useId, _entry, target) { const key = opaqueKey(useId), path = `flags.ak5e.agentEndedFade.${key}`, saved = target.flags?.ak5e?.agentEndedFade?.[key] ?? []; if (saved.length) await target.createEmbeddedDocuments('ActiveEffect', saved); await target.update({ [path]: null }); return { restored: saved.length }; },
    preview() { return 'Restore the Fade effects ended by this use.'; }
  },
  agentCaseDamage: {
    async apply(source, useId, entry, target) {
      return targetSerial(target, async () => {
      const key = keyFor(source, useId), path = `flags.ak5e.vanguardUsesApplied.${key}`, previous = target.flags?.ak5e?.vanguardUsesApplied?.[key];
      if (previous) return previous;
      const hp = target.system.attributes.hp, value = Number(hp.value) || 0, temp = Number(hp.temp) || 0;
      const { adjustment, corroded } = caseDefenses(target), properties = entry.damageProperties ?? [];
      const amount = resolveDamage({ amount: entry.amount, type: 'piercing', reduction: entry.reduction, adjustment, corroded }).final;
      const origin = values(game.messages).find(message => message.flags?.ak5e?.[vanguardUses.cardFlag]?.useId === useId && message.flags.ak5e[vanguardUses.cardFlag].actorUuid === source.uuid);
      const creditBefore = { available: Boolean(source.flags?.ak5e?.agent?.smoke?.freeKillUseAvailable), id: source.flags?.ak5e?.agent?.smoke?.killCreditId ?? null };
      const makeRecord = (amount, updates) => ({ agentCaseDamage: true, expectedRevision: tempSnapshot(target).revision, before: { value, temp }, after: { value: Number(updates['system.attributes.hp.value']), temp: Number(updates['system.attributes.hp.temp']) }, amount, damageType: 'piercing',
        killed: value > 0 && Number(updates['system.attributes.hp.value']) <= 0, creditBefore });
      if (typeof target.applyDamage === 'function') {
        const options = { originatingMessage: origin, invertHealing: false };
        // Put the receipt into the *same* native HP update. If interrupted after
        // the write, a relay retry finds it and cannot damage or kill twice.
        const capture = (actor, total, updates, nativeOptions) => {
          if (actor.uuid === target.uuid && nativeOptions === options) updates[path] = makeRecord(total, updates);
        };
        Hooks.on('dnd5e.preApplyDamage', capture);
        try { await target.applyDamage([{ value: amount, type: 'piercing', properties: new Set(properties) }], options); }
        finally { Hooks.off('dnd5e.preApplyDamage', capture); }
        const applied = target.flags?.ak5e?.vanguardUsesApplied?.[key];
        need(applied, 'Native damage was cancelled before its HP update; no damage was recorded.');
        return applied;
      }
      const { immune, resistance, vulnerability } = fallbackDefenses(target, properties);
      const result = immune ? { newHp: value, newTemp: temp, final: 0 } : resolveDamage({ amount, type: 'piercing', ignoreDR: true, resistance, vulnerability, hp: { value, temp } });
      const updates = { 'system.attributes.hp.value': result.newHp, 'system.attributes.hp.temp': result.newTemp };
      const applied = makeRecord(result.final, updates);
      await target.update({ ...updates, [path]: applied });
      // The fallback has no native hooks. Emit once after the atomic write;
      // native applications exclusively use trigger-events' native adapter.
      const event = { actorUuid: target.uuid, sourceActorUuid: source.uuid, hpBefore: value, hpAfter: result.newHp, amount: result.final, raw: { actor: target, message: origin } };
      if (result.final > 0) void emitAk5eEvent('hitTaken', { ...event, eventId: `hitTaken:${caseCreditId(source, useId)}` });
      if (applied.killed) void emitAk5eEvent('kill', { ...event, eventId: caseCreditId(source, useId) });
      return applied;
      });
    },
    async revert(source, useId, entry, target) {
      return targetSerial(target, async () => {
      const key = keyFor(source, useId), path = `flags.ak5e.vanguardUsesApplied.${key}`, applied = target.flags?.ak5e?.vanguardUsesApplied?.[key];
      if (!applied) return { missing: true };
      if (!applied.undone) {
        const reversal = caseReversal(source, useId, target, entry);
        need(!reversal.needsReconciliation, 'Temporary HP changed after review. Retry Undo to choose how to reconcile the current pool.');
        const { applied: _prior, ...restoration } = reversal;
        await target.update({
          ...(reversal.after.value !== reversal.before.value ? { 'system.attributes.hp.value': reversal.after.value } : {}),
          ...(reversal.after.temp !== reversal.before.temp ? { 'system.attributes.hp.temp': reversal.after.temp } : {}),
          [path]: { ...applied, undone: true, reversal: restoration }
        });
      }
      const smoke = source.flags?.ak5e?.agent?.smoke;
      if (applied.killed) {
        const updates = { [`flags.ak5e.agent.caseKillCredits.${opaqueKey(useId)}`]: 'undone' };
        if (smoke?.killCreditId === caseCreditId(source, useId)) {
          const previousId = applied.creditBefore?.id, prefix = `agentCase:${source.uuid}:`;
          const previousUndone = previousId?.startsWith(prefix) && source.flags?.ak5e?.agent?.caseKillCredits?.[opaqueKey(previousId.slice(prefix.length))] === 'undone';
          updates['flags.ak5e.agent.smoke.freeKillUseAvailable'] = Boolean(smoke.freeKillUseAvailable && applied.creditBefore?.available && !previousUndone);
          updates['flags.ak5e.agent.smoke.killCreditId'] = previousUndone ? null : previousId ?? null;
        }
        await source.update(updates);
      }
      return { restored: true };
      });
    },
    preview(source, receipt, entry, target) { return caseUndoText(source, receipt.id, entry, target); }
  }
};
vanguardUses.register({ plans, targetKinds, readings: { [drReading]: { label: 'Closing the Case: multiple applicable Damage Reduction sources', options: drOptions }, [levelReading]: { label: 'Second Strike: the undefined "Agent Level"', options: levelOptions } } });
async function clearFadeEffects(actor) { const ids = [...(actor.effects?.values?.() ?? [])].filter(e => e.flags?.ak5e?.agentFadeUse).map(e => e.id); if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids); }
let eventsRegistered = false; const hookSets = new WeakSet();
export function registerAgentFeatureHooks() {
  // Reuse the shared native-pool revision tracker so even equal-valued writes
  // and A → B → A replacements require an explicit reconciliation.
  registerTipTemporaryHpHooks();
  if (!eventsRegistered) {
    eventsRegistered = true;
    for (const kind of ['attack', 'hit', 'kill', 'turnStart', 'turnEnd']) onAk5eEvent(kind, async event => {
      const uuid = kind === 'kill' ? event.sourceActorUuid : event.actorUuid;
      const actor = uuid && (globalThis.fromUuidSync?.(uuid) ?? await globalThis.fromUuid?.(uuid));
      if (kind === 'turnStart') {
        const candidates = new Map([...tagActors(), ...trackedActors.values()].map(candidate => [candidate.uuid, candidate]));
        for (const candidate of candidates.values()) {
          if (!candidate?.isOwner || !isAgent(candidate)) continue;
          await serial(candidate, async () => {
          await initializeAgent(candidate);
          const state = agentState(candidate), before = structuredClone(state);
          if (state.lastTurnStart === event.eventId) return;
          state.lastTurnStart = event.eventId;
          state.surgical.payItForwardAvailable = false; state.surgical.payItForwardUsedThisTurn = false;
          state.surgical.secondStrike = { pendingTargetUuid: null, awaitingLevelChoice: false };
          state.hits = []; state.shadowstrikeUsed = false;
          if (candidate.uuid === event.actorUuid) { if (state.fade.active) state.fade.turnStarts = (state.fade.turnStarts ?? 0) + 1; state.smoke.active = null; }
          await update(candidate, before, state);
          });
        }
        return;
      }
      if (!actor?.isOwner || !isAgent(actor)) return;
      trackAgentActor(actor);
      await serial(actor, async () => {
      await initializeAgent(actor);
      const s = agentState(actor), before = structuredClone(s);
      s.seenEvents ??= [];
      const card = kind === 'kill' ? event.raw?.message?.flags?.ak5e?.[vanguardUses.cardFlag] : null;
      const caseUseId = card?.actorUuid === actor.uuid && vanguardUses.receipt(actor, card.useId)?.command === 'agentCase' ? card.useId : null;
      const eventId = caseUseId ? caseCreditId(actor, caseUseId) : event.eventId;
      if (eventId && s.seenEvents.includes(eventId) || caseUseId && s.caseKillCredits?.[opaqueKey(caseUseId)]) return;
      if (eventId) s.seenEvents = [...s.seenEvents.slice(-199), eventId];
      if (kind === 'attack' && s.fade.active) { s.fade.active = false; await clearFadeEffects(actor); }
      if (kind === 'attack' || kind === 'hit') {
        const item = globalThis.fromUuidSync?.(event.itemUuid) ?? await globalThis.fromUuid?.(event.itemUuid);
        const activity = event.raw?.subject ?? (event.activityUuid ? (globalThis.fromUuidSync?.(event.activityUuid) ?? await globalThis.fromUuid?.(event.activityUuid)) : null);
        const attack = activity?.attack ?? activity?.system?.attack, type = item?.system?.actionType, props = item?.system?.properties;
        const weaponAttack = item?.type === 'weapon' && (!attack?.type?.classification || attack.type.classification === 'weapon');
        const ranged = type === 'rwak' || attack?.type?.value === 'ranged';
        const thrown = weaponAttack && ranged && (props?.has?.('thr') || props?.includes?.('thr'));
        const melee = weaponAttack && (type === 'mwak' || attack?.type?.value === 'melee');
        if (kind === 'attack' && melee && s.surgical.secondStrike.pendingTargetUuid) {
          const target = event.targets?.find(t => t.uuid === s.surgical.secondStrike.pendingTargetUuid);
          if (target && !s.surgical.secondStrike.awaitingLevelChoice) {
            if (target.hit === false) s.surgical.secondStrike.pendingTargetUuid = s.surgical.secondStrike.queuedTargets?.shift() ?? null;
            else { s.surgical.secondStrike.awaitingLevelChoice = true; s.surgical.secondStrike.attackEventId = event.eventId; }
          }
          const queued = s.surgical.secondStrike.queuedTargets ?? [];
          for (const snapshot of event.targets ?? []) if (queued.includes(snapshot.uuid)) {
            s.surgical.secondStrike.queuedTargets = s.surgical.secondStrike.queuedTargets.filter(uuid => uuid !== snapshot.uuid);
            if (snapshot.hit !== false) (s.surgical.secondStrike.queuedChoices ??= []).push({ targetUuid: snapshot.uuid, attackEventId: event.eventId });
          }
        }
        if (kind === 'hit') {
          if ((thrown || melee) && event.targetUuid) { const hit = s.hits.find(h => h.uuid === event.targetUuid); if (hit) hit.count++; else s.hits.push({ uuid: event.targetUuid, count: 1 }); }
          if (thrown) { s.surgical.payItForwardAvailable = true; const strike = s.surgical.secondStrike; if (!strike.pendingTargetUuid) strike.pendingTargetUuid = event.targetUuid; else if (strike.pendingTargetUuid !== event.targetUuid && !(strike.queuedTargets ?? []).includes(event.targetUuid)) (strike.queuedTargets ??= []).push(event.targetUuid); }
        }
      }
      if (kind === 'kill') {
        s.smoke.freeKillUseAvailable = true; s.smoke.killCreditId = eventId;
        if (caseUseId) (s.caseKillCredits ??= {})[opaqueKey(caseUseId)] = 'active';
      }
      if (kind === 'turnEnd' && s.fade.active && s.fade.expiry !== 'manual' && s.fade.turnStarts > 0) { s.fade.active = false; await clearFadeEffects(actor); }
      await update(actor, before, s);
      });
    });
  }
  if (globalThis.Hooks && !hookSets.has(Hooks)) {
    hookSets.add(Hooks);
    Hooks.on('preUpdateActor', (_actor, changes) => {
      const revision = changes['flags.ak5e.tipTemporaryHpRevision'] ?? changes.flags?.ak5e?.tipTemporaryHpRevision;
      if (!revision) return;
      const stamp = (object, prefix = '') => {
        for (const [key, value] of Object.entries(object ?? {})) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (!value || typeof value !== 'object') continue;
          if (path.startsWith('flags.ak5e.vanguardUsesApplied.') && value.agentCaseDamage && !value.undone) value.expectedRevision = revision;
          else if (path === 'flags' || path.startsWith('flags.')) stamp(value, path);
        }
      };
      stamp(changes);
    });
    Hooks.on('dnd5e.restCompleted', async (actor, _result, config) => { if (!actor.isOwner || !isAgent(actor)) return; await serial(actor, async () => { await initializeAgent(actor); const s = agentState(actor), before = structuredClone(s); if (config?.type === 'long') { s.fade.usesSpent = 0; s.fade.remaining = Number(actor.system.attributes.prof) || 0; s.fade.generation = (s.fade.generation ?? 0) + 1; } if (['short', 'long'].includes(config?.type)) { s.smoke.usesSpent = 0; s.smoke.generation = (s.smoke.generation ?? 0) + 1; } await update(actor, before, s); }); });
  }
}
