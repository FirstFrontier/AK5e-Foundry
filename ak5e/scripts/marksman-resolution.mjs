/** Guided, owner-operated resolution of immutable Marksman use snapshots. */
import { marksmanUses } from "./marksman-uses.mjs";
import { marksmanState, marksmanLevel, marksmanBranch, marksmanEnabled } from "./marksman-rules.mjs";
import { flag, values, need, opaqueKey, esc, keyedSerial } from "./operation-kernel.mjs";
import { warn } from "./play-uses.mjs";
import { isLocked } from "./play-undo.mjs";
import { confirmPlayUse } from "./play-uses-sheet.mjs";
import { resolveDamage } from "./damage-pipeline.mjs";

const clone = value => structuredClone(value);
const actorFor = uuid => { const doc = globalThis.fromUuidSync?.(uuid); return doc?.actor ?? doc; };
const worldTime = () => Number(globalThis.game?.time?.worldTime ?? 0);
export const resolutionId = (useId, stepId, action, target = "", occurrence = "") => `mr_${opaqueKey(JSON.stringify([useId, stepId, action, target, occurrence]))}`;
const markerKey = (source, id) => opaqueKey(`${source.uuid}:${id}`);
const marker = (target, source, id) => flag(target, "marksmanOutcomes")?.[markerKey(source, id)];
const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const owned = actor => Boolean(actor && (globalThis.game?.user?.isGM || actor.isOwner));
const speeds = ["walk", "fly", "swim", "climb", "burrow"];
const effectKeys = new Set([...speeds.map(speed => `system.attributes.movement.${speed}`), "system.attributes.ac.bonus"]);
const statusIds = new Set(["stunned", "blinded", "prone", "restrained", "ak5e-dazed", "ak5e-frozen"]);
const damageTypes = new Set(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);
const beforeTurn = () => ({ combatId: game.combat?.id ?? null, round: Number(game.combat?.round ?? 0), turn: Number(game.combat?.turn ?? 0), worldTime: worldTime() });

export function resolutionStep(actor, useId, stepId) {
  let use = marksmanUses.receipt(actor, useId);
  need(use && use.status !== "undone", "That source use is no longer active.");
  const trustedCard = values(globalThis.game?.messages).find(message => {
    const info = flag(message, marksmanUses.cardFlag);
    return message.author?.isGM && info?.actorUuid === actor.uuid && info.useId === useId && info.snapshot;
  });
  if (trustedCard) use = { ...use, ...clone(flag(trustedCard, marksmanUses.cardFlag).snapshot) };
  const step = use.resolution?.steps?.find(entry => entry.id === stepId);
  need(step && ["attack", "damage", "hpLoss", "effect"].includes(step.kind), "Choose a recorded resolution step.");
  return { use, step };
}
function saveEvidence(actor, use, step, targetUuid, messageUuid, occurrence = "") {
  const message = messageUuid ? globalThis.fromUuidSync?.(messageUuid) : values(game.messages).findLast(message => {
    const evidence = flag(message, "marksmanSave");
    return evidence?.actorUuid === actor.uuid && evidence.useId === use.id && evidence.stepId === step.id && evidence.targetUuid === targetUuid && String(evidence.occurrence ?? "") === String(occurrence);
  });
  if (!message) return null;
  const evidence = flag(message, "marksmanSave"), target = actorFor(targetUuid);
  need(evidence?.actorUuid === actor.uuid && evidence.useId === use.id && evidence.stepId === step.id && evidence.targetUuid === targetUuid,
    "The save does not belong to this target and use.");
  need(message.author?.isGM || target?.testUserPermission?.(message.author, "OWNER"), "The saving throw must be rolled by its target's owner or GM.");
  need(evidence.ability === step.save?.ability && (step.save?.dc == null ? Number.isFinite(evidence.dc) : evidence.dc === step.save.dc) && Number.isFinite(evidence.total) && String(evidence.occurrence ?? "") === String(occurrence), "The save configuration changed; roll the recorded save again.");
  return { succeeded: evidence.total >= evidence.dc, messageUuid: message.uuid };
}
function appliedUse(actor, useId, stepId, targetUuid, occurrence = "") {
  return marksmanUses.receipt(actor, resolutionId(useId, stepId, "apply", targetUuid, occurrence));
}
function hasEnded(actor, use, step) {
  return values(game.messages).some(message => {
    const result = flag(message, "marksmanSave");
    const ending = use.resolution.steps.find(entry => entry.id === result?.stepId && entry.endOnSuccess &&
      (entry.endsStepIds ? entry.endsStepIds.includes(step.id) : entry.groupId && entry.groupId === step.groupId && entry.id !== step.id));
    const target = result && actorFor(result.targetUuid);
    return ending && result.actorUuid === actor.uuid && result.useId === use.id && result.total >= result.dc &&
      (message.author?.isGM || target?.testUserPermission?.(message.author, "OWNER"));
  });
}
export function stepWarnings(actor, use, step) {
  const warnings = [];
  if (isLocked(use)) warn(warnings, "window", "This source use is from an earlier encounter window; review the table's timing.");
  if (hasEnded(actor, use, step)) warn(warnings, "ended", "A successful repeat saving throw already ended this ongoing effect.");
  if (step.trigger) {
    const at = Number(step.trigger.at), trigger = step.trigger;
    if (Number.isFinite(at) && worldTime() < at) warn(warnings, "notDue", "This timed resolution is not due yet.");
    if (trigger.event !== "worldTime" && !values(game.messages).some(message => {
      const due = flag(message, "marksmanDue"); return due?.actorUuid === actor.uuid && due.useId === use.id && due.stepId === step.id;
    }))
      warn(warnings, "timing", "Confirm the recorded turn trigger; it has not been observed automatically.");
  }
  return warnings;
}
function checkedPayload(payload) {
  need(payload && typeof payload === "object", "Missing recorded resolution.");
  for (const part of payload.damageParts ?? []) need(damageTypes.has(part.type) && Number.isFinite(part.amount) && part.amount >= 0, "Invalid typed Damage.");
  for (const effect of payload.effects ?? []) {
    need(typeof effect.label === "string" && effect.label.length <= 200, "Invalid effect label.");
    need((effect.changes ?? []).every(change => effectKeys.has(change.key) && [1, 2, 5].includes(change.mode) && Number.isFinite(Number(change.value)) && Math.abs(Number(change.value)) <= 1000), "Unsupported Marksman effect change.");
    need((effect.statuses ?? []).every(status => statusIds.has(status)), "Unsupported Marksman condition.");
  }
  need((payload.removeLabels ?? []).every(label => ["Siege Mode", "Defensive: end after the triggering Attack"].includes(label)), "Unsupported effect cleanup.");
  if (payload.hpLoss != null) {
    need(Number.isSafeInteger(payload.hpLoss) && payload.hpLoss >= 0 && payload.hpLoss <= 16, "Invalid Godpiercer Hit Point loss.");
    need(["bypassDR", "bypassResistance", "bypassTemp"].every(key => typeof payload.hpLossPolicy?.[key] === "boolean"), "Choose the Hit Point loss policy for this use.");
  }
  return payload;
}
function defenseHas(target, key, type) {
  const trait = target.system?.traits?.[key]?.value;
  return Array.from(trait?.values?.() ?? trait ?? []).some(value => value === type || value === "all");
}
export function outcomeHP(source, target, payload) {
  checkedPayload(payload);
  const hp = target.system?.attributes?.hp;
  need(hp && Number.isFinite(Number(hp.value)), "This target has no Hit Point field; resolve the Object at the table.");
  let state = { value: Number(hp.value), temp: Number(hp.temp ?? 0) }, total = 0;
  const trace = [];
  for (const part of payload.damageParts ?? []) {
    const selfImmune = target.uuid === source.uuid && marksmanBranch(target) === "artilleryman" && marksmanLevel(target) >= 18 && part.type === "thunder";
    const innateResist = part.type === "thunder" && marksmanBranch(target) === "artilleryman" && marksmanLevel(target) >= 18;
    const immune = selfImmune || defenseHas(target, "di", part.type);
    const amount = immune ? 0 : part.amount;
    const resolved = resolveDamage({ amount, type: part.type, hp: state,
      reduction: Number(payload.reduction ?? 0), resistance: innateResist || defenseHas(target, "dr", part.type), vulnerability: defenseHas(target, "dv", part.type),
      ignoreDR: payload.ignoreDR === true && (!payload.physicalOnly || ["bludgeoning", "piercing", "slashing", "thunder"].includes(part.type)),
      ignoreResistance: payload.ignoreResistance === true && (!payload.physicalOnly || ["bludgeoning", "piercing", "slashing", "thunder"].includes(part.type)),
      ...(payload.minimumDamageAfterDR != null && !immune ? { minimumTaken: Math.min(amount, Number(payload.minimumDamageAfterDR)) } : {}) });
    state = { value: resolved.newHp, temp: resolved.newTemp }; total += resolved.hpLost;
    trace.push({ type: part.type, ...resolved });
  }
  if (payload.hpLoss != null) {
    const resolved = resolveDamage({ amount: payload.hpLoss, kind: "hpLoss", policy: payload.hpLossPolicy, hp: state, reduction: Number(payload.reduction ?? 0) });
    state = { value: resolved.newHp, temp: resolved.newTemp }; total += resolved.hpLost; trace.push(resolved);
  }
  return { hp: state.value, temp: state.temp, hpLost: total, trace };
}

// Only these fixed HP/condition/movement operations are sent to the GM. Never accept document update paths.
const outcomeKind = {
  async apply(source, useId, entry, target) {
    const payload = checkedPayload(entry.payload), key = markerKey(source, useId);
    let record = marker(target, source, useId);
    if (record?.complete) return record;
    if (!record) {
      const before = { hp: Number(target.system?.attributes?.hp?.value ?? 0), temp: Number(target.system?.attributes?.hp?.temp ?? 0) };
      const result = payload.damageParts?.length || payload.hpLoss != null ? outcomeHP(source, target, payload) : before;
      const removedEffects = values(target.effects).filter(effect => payload.removeLabels?.includes(effect.name) && flag(effect, "marksmanResolutionEffect")?.sourceUuid === source.uuid)
        .map(effect => effect.toObject ? effect.toObject() : { _id: effect.id, name: effect.name, changes: clone(effect.changes ?? []), statuses: Array.from(effect.statuses ?? []), flags: clone(effect.flags ?? {}) });
      record = { before, after: { hp: result.hp, temp: result.temp }, trace: result.trace ?? [], removedEffects, appliedAt: beforeTurn(), complete: false };
      await target.update({ ...(payload.damageParts?.length || payload.hpLoss != null ? { "system.attributes.hp.value": result.hp, "system.attributes.hp.temp": result.temp } : {}),
        [`flags.ak5e.marksmanOutcomes.${key}`]: record });
    }
    const removing = values(target.effects).filter(effect => record.removedEffects?.some(removed => (removed._id ?? removed.id) === effect.id));
    if (removing.length) await target.deleteEmbeddedDocuments("ActiveEffect", removing.map(effect => effect.id));
    for (const [index, effect] of (payload.effects ?? []).entries()) {
      if (values(target.effects).some(doc => flag(doc, "marksmanResolutionEffect")?.key === `${key}:${index}`)) continue;
      const expiry = { ...effect.expiry, created: record.appliedAt };
      const data = { name: effect.label, img: "icons/svg/aura.svg", origin: source.uuid, changes: effect.changes ?? [], statuses: effect.statuses ?? [],
        flags: { ak5e: { marksmanResolutionEffect: { key: `${key}:${index}`, useId, sourceUuid: source.uuid, expiry, definition: effect } } } };
      await target.createEmbeddedDocuments("ActiveEffect", [data]);
    }
    record.complete = true;
    await target.update({ [`flags.ak5e.marksmanOutcomes.${key}`]: record });
    return record;
  },
  preview(source, receipt, _entry, target) {
    const record = target && marker(target, source, receipt.id);
    if (!record) return `${target?.name ?? "Target"}: no applied Hit Point change is recorded; remove any partial managed effects.`;
    const changed = Number(target.system?.attributes?.hp?.value) !== record.after.hp || Number(target.system?.attributes?.hp?.temp ?? 0) !== record.after.temp;
    return `${target.name}: restore ${record.before.hp - record.after.hp} HP and ${record.before.temp - record.after.temp} Temporary HP; remove this step's managed effects${changed ? ". HP changed later; restore only this step's recorded loss, preserving later changes" : ""}.`;
  },
  async revert(source, useId, _entry, target) {
    const key = markerKey(source, useId), record = marker(target, source, useId);
    const effects = values(target.effects).filter(effect => flag(effect, "marksmanResolutionEffect")?.useId === useId && flag(effect, "marksmanResolutionEffect")?.sourceUuid === source.uuid);
    if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    for (const removed of record?.removedEffects ?? []) if (!values(target.effects).some(effect => effect.id === (removed._id ?? removed.id)))
      await target.createEmbeddedDocuments("ActiveEffect", [removed], { keepId: true });
    if (record && !record.undone) {
      const hp = target.system.attributes.hp;
      const value = Number(hp.value) === record.after.hp ? record.before.hp : Math.min(Math.max(Number(hp.max ?? 0), record.before.hp), Number(hp.value) + record.before.hp - record.after.hp);
      const temp = Number(hp.temp ?? 0) === record.after.temp ? record.before.temp : Number(hp.temp ?? 0) + record.before.temp - record.after.temp;
      await target.update({ "system.attributes.hp.value": Math.max(0, value), "system.attributes.hp.temp": Math.max(0, temp), [`flags.ak5e.marksmanOutcomes.${key}.undone`]: true });
    }
    return { removed: effects.length };
  }
};
const targetSerial = keyedSerial(), applyOutcome = outcomeKind.apply, revertOutcome = outcomeKind.revert;
outcomeKind.apply = (source, id, entry, target) => targetSerial(target, () => applyOutcome(source, id, entry, target));
outcomeKind.revert = (source, id, entry, target) => targetSerial(target, () => revertOutcome(source, id, entry, target));

function sharedRollStep(use, step) {
  return step.rollGroupId ? use.resolution.steps.find(entry => entry.rollGroupId === step.rollGroupId) ?? step : step;
}
function rollRecord(actor, use, step, occurrence) {
  step = sharedRollStep(use, step);
  const id = resolutionId(use.id, step.id, "roll", "", occurrence), receipt = marksmanUses.receipt(actor, id);
  const message = values(game.messages).find(message => flag(message, "marksmanUsesOperation") === `${id}-dice` && flag(message, "marksmanUsesActor") === actor.uuid &&
    (message.author?.isGM || actor.testUserPermission?.(message.author, "OWNER")));
  if (message?.rolls?.length && step.damageParts?.length) {
    need(message.rolls.length === step.damageParts.length, "The recorded Damage does not match this step.");
    const parts = message.rolls.map((roll, index) => {
      need(String(roll.formula).replace(/\s/g, "") === String(step.damageParts[index].formula).replace(/\s/g, "") && Number.isFinite(roll.total), "The recorded Damage formula changed.");
      return { type: step.damageParts[index].type, total: roll.total };
    });
    return { ...receipt, rollParts: parts, roll: parts.reduce((sum, part) => sum + part.total, 0) };
  }
  if (message?.rolls?.length && step.rollFormula) return { ...receipt, roll: Number(message.rolls[0].total) };
  // Legacy/offline dice receipts remain usable for their owner's documents;
  // the target relay separately validates the exact derived operation.
  return receipt;
}
function targetPayload(actor, use, step, data, warnings) {
  const target = actorFor(data.targetUuid);
  need(target?.documentName === "Actor", "Choose a target Actor for this resolution.");
  const targets = (step.targetUuids ?? []).map(uuid => actorFor(uuid)?.uuid ?? uuid);
  if (!targets.includes(target.uuid)) warn(warnings, "target", "This Creature was not in the original target list; confirm the area or trigger at the table.");
  let succeeded = null;
  if (step.save) {
    if (step.save.objectsFail && (data.isObject === true || target.type === "vehicle")) succeeded = false;
    else {
      const evidence = saveEvidence(actor, use, step, data.targetUuid, data.saveMessageUuid, data.occurrence ?? "");
      succeeded = evidence?.succeeded ?? (typeof data.saveSucceeded === "boolean" ? data.saveSucceeded : null);
      if (!evidence) warn(warnings, "save", "No target-owner save is attached. Confirm the reviewed save result before applying.");
      need(succeeded !== null, "Roll the target's saving throw or select its reviewed result before applying this step.");
    }
  }
  if (step.requiresHit && !data.hitConfirmed) warn(warnings, "hit", "Confirm this step's originating Attack hit this Creature.");
  for (const prerequisite of [step.requiresFailedSaveStepId, ...(step.requiresFailedSaveStepIds ?? [])].filter(Boolean)) {
    const earlier = use.resolution.steps.find(entry => entry.id === prerequisite);
    if (!earlier) continue;
    const evidence = saveEvidence(actor, use, earlier, data.targetUuid);
    const reviewed = appliedUse(actor, use.id, earlier.id, data.targetUuid)?.result?.saveSucceeded;
    if (evidence?.succeeded !== false && reviewed !== false) warn(warnings, `prerequisite_${prerequisite}`, "Confirm the required earlier saving throw failed before applying this ongoing step.");
  }
  const rolled = rollRecord(actor, use, step, data.occurrence ?? "");
  let parts = rolled?.rollParts?.map(part => ({ type: part.type, amount: part.total })) ?? step.damageParts?.filter(part => Number.isFinite(part.amount)).map(part => ({ ...part })) ?? [];
  need(step.kind !== "damage" || parts.length, "Roll this step's Damage before applying it.");
  let scale = Number(step.damageScale ?? 1);
  if (succeeded === true) scale *= step.save.success === "zero" ? 0 : step.save.success === "half" ? 0.5 : 1;
  if (step.save && succeeded === null) scale = 0;
  const vehicle = target.type === "vehicle" || data.isStructure === true;
  parts = parts.map(part => ({ type: part.type, amount: Math.floor(part.amount * scale * (step.siegeAttacker && vehicle && part.type === "thunder" ? 2 : 1)) }));
  const effects = (step.effects ?? []).filter(effect => !step.save || succeeded !== null && (!effect.when || effect.when === "always" || effect.when === "failed" && !succeeded || effect.when === "success" && succeeded));
  if (step.effectsFromRoll === "defensiveAC") {
    need(Number.isFinite(rolled?.roll), "Roll the Defensive d4 before applying the AC bonus.");
    effects.push({ label: "Defensive: end after the triggering Attack", changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: String(rolled.roll) }], expiry: { actorUuid: actor.uuid, event: "attackEnd", originMessageUuid: step.originMessageUuid } });
  }
  const reduction = Number(data.reduction ?? 0);
  need(Number.isFinite(reduction) && reduction >= 0, "Reviewed Damage Reduction must be a nonnegative number.");
  return { target, payload: checkedPayload({ damageParts: parts, effects, reduction,
    ...(step.kind === "hpLoss" ? { hpLoss: Number(step.amount), hpLossPolicy: step.hpLossPolicy } : {}),
    ignoreDR: step.ignoreDR, ignoreResistance: step.ignoreResistance, physicalOnly: step.physicalOnly, minimumDamageAfterDR: step.minimumDamageAfterDR }), succeeded };
}

const plans = {
  rollResolution(actor, _state, data) {
    const { use, step } = resolutionStep(actor, data.useId, data.stepId), warnings = stepWarnings(actor, use, step);
    need(step.rollFormula || step.kind === "damage" && step.damageParts?.some(part => part.formula), "This step has no dice to roll.");
    return { warnings, title: `${step.label ?? use.title} — Damage`, apply(_next, receipt) {
      receipt.formula = step.rollFormula ?? step.damageParts.map(part => part.formula).join(" + ");
      if (!step.rollFormula) receipt.damageParts = clone(step.damageParts);
      receipt.parentUseId = use.id; receipt.parentStepId = step.id;
      receipt.summary = `Roll ${receipt.formula} for the recorded targets. Apply the result from the original feature card; native Apply Damage does not apply this feature's exceptions.`;
      receipt.result = { useId: receipt.id }; return step.consumeUpdates ?? {};
    } };
  },
  resolveUse(actor, _state, data) {
    const { use, step } = resolutionStep(actor, data.useId, data.stepId), warnings = stepWarnings(actor, use, step);
    need(step.kind !== "attack", "Roll attacks from their native attack button.");
    const { target, payload, succeeded } = targetPayload(actor, use, step, data, warnings);
    if (appliedUse(actor, use.id, step.id, data.targetUuid, data.occurrence)?.status === "undone") warn(warnings, "undone", "This resolution was already undone; record a new occurrence only if the table intends another use.");
    return { warnings, title: `${step.label ?? use.title} — Apply`,
      validateTarget(source, receipt, entry, candidate) {
        const parent = marksmanUses.receipt(source, receipt.parentUseId);
        return Boolean(parent && parent.status !== "undone" && receipt.targets?.some(record => record.uuid === candidate.uuid && record === entry) && checkedPayload(entry.payload));
      },
      apply(_next, receipt) {
        receipt.parentUseId = use.id; receipt.parentStepId = step.id;
        receipt.targets = [{ kind: "marksmanOutcome", uuid: target.uuid, name: target.name, ready: true, payload }];
        receipt.summary = `${actor.name} applies ${step.label ?? use.title} to ${target.name}${step.save ? ` (${succeeded == null ? "no save result; no outcome" : succeeded ? "successful save" : "failed save"})` : ""}. Reviewed DR: ${payload.reduction}.`;
        receipt.result = { targetUuid: target.uuid, stepId: step.id, saveSucceeded: succeeded }; return {};
      }
    };
  },
  completeResolutionAttack(actor, _state, data) {
    const { use, step } = resolutionStep(actor, data.useId, data.stepId);
    need(step.kind === "attack", "Choose an Attack step.");
    const message = data.messageUuid && (globalThis.fromUuidSync?.(data.messageUuid) ?? values(game.messages).find(message => message.uuid === data.messageUuid));
    need(message && (message.author?.isGM || actor.testUserPermission?.(message.author, "OWNER")), "Choose the owner's completed Attack message.");
    const context = flag(message, "marksmanAttack");
    need(context?.actorUuid === actor.uuid && context.useId === use.id && context.stepId === step.id, "This Attack belongs to a different use.");
    return { warnings: [], title: `${step.label ?? use.title} — Attack recorded`, apply(_next, receipt) {
      receipt.parentUseId = use.id; receipt.parentStepId = step.id; receipt.originMessageUuid = message.uuid;
      receipt.summary = `${actor.name} completed the recorded Attack. Damage remains owner-operated.`;
      receipt.result = { messageUuid: message.uuid };
      return step.consumeUpdates ?? {};
    } };
  },
  recordResolutionDamage(actor, _state, data) {
    const { use, step } = resolutionStep(actor, data.useId, data.stepId);
    need(step.kind === "attack", "Choose a recorded weapon Attack.");
    const message = globalThis.fromUuidSync?.(data.messageUuid) ?? values(game.messages).find(message => message.uuid === data.messageUuid);
    const context = flag(message, "marksmanDamage");
    need(message && (message.author?.isGM || actor.testUserPermission?.(message.author, "OWNER")) && context?.actorUuid === actor.uuid && context.useId === use.id && context.stepId === step.id,
      "Choose the owner's Damage roll for this Attack.");
    const parts = (message.rolls ?? []).map(roll => ({ amount: Number(roll.total), type: roll.options?.type ?? Array.from(roll.options?.types ?? [])[0] }));
    need(parts.length && parts.every(part => Number.isFinite(part.amount) && damageTypes.has(part.type)), "The native Damage types are not definite; resolve this roll at the table.");
    return { warnings: [], title: `${step.label ?? use.title} — Weapon Damage`, apply(_next, receipt) {
      receipt.parentUseId = use.id; receipt.parentStepId = step.id;
      receipt.summary = "Apply this recorded weapon Damage to its original targets. Do not also apply the native damage card.";
      receipt.resolution = { version: 1, steps: [{ id: "weapon-damage", kind: "damage", label: "Recorded weapon Damage", targetUuids: step.targetUuids,
        damageParts: parts, ignoreDR: step.ignoreDR, ignoreResistance: step.ignoreResistance, physicalOnly: step.physicalOnly, minimumDamageAfterDR: step.minimumDamageAfterDR }] };
      receipt.result = {}; return {};
    } };
  },
  nativeWeaponDamage(actor, _state, data) {
    const message = globalThis.fromUuidSync?.(data.originMessageUuid) ?? values(game.messages).find(message => message.uuid === data.originMessageUuid);
    need(message && (message.author?.isGM || actor.testUserPermission?.(message.author, "OWNER")), "Choose an owned native Damage roll.");
    const native = message.rolls?.find(roll => roll.options?.ak5eMarksman?.actorUuid === actor.uuid);
    need(native, "This roll has no recorded Marksman Attack context.");
    const context = native.options.ak5eMarksman, targetUuid = native.options.ak5eTargetSnapshot?.uuid;
    const targets = targetUuid ? [targetUuid] : data.targetUuids;
    const warnings = [];
    if (!data.hitConfirmed) warn(warnings, "hit", "Confirm this Weapon Attack hit the selected Creature. Do not also apply native Damage.");
    const parts = message.rolls.map(roll => ({ amount: Number(roll.total), type: roll.options.type ?? Array.from(roll.options.types ?? [])[0] }));
    need(parts.every(part => damageTypes.has(part.type) && Number.isFinite(part.amount)), "Review ambiguous native Damage types manually.");
    return { warnings, title: "Reviewed Marksman weapon Damage", apply(_next, receipt) {
      receipt.originMessageUuid = message.uuid;
      receipt.summary = "Apply this Attack's recorded Damage once with its Crush and mitigation exceptions. Map movement remains manual.";
      receipt.resolution = { version: 1, steps: [{ id: "native-weapon", kind: "damage", label: "Recorded weapon Damage", targetUuids: targets, damageParts: parts,
        minimumDamageAfterDR: context.crush || undefined, ignoreDR: context.ignoreDR, ignoreResistance: context.ignoreResistance, physicalOnly: context.physicalOnly }] };
      receipt.result = {}; return {};
    } };
  }
};
plans.resolveUse.validateTarget = (source, receipt, entry, target) => {
  const { use, step } = resolutionStep(source, receipt.parentUseId, receipt.parentStepId);
  const expected = targetPayload(source, use, step, receipt.data, []);
  return expected.target.uuid === target.uuid && entry.uuid === target.uuid && JSON.stringify(expected.payload) === JSON.stringify(entry.payload);
};
marksmanUses.register({ plans, targetKinds: { marksmanOutcome: outcomeKind } });

async function accepted(title, text) {
  return foundry.applications.api.DialogV2.confirm({ window: { title }, content: `<p>${esc(text)}</p>`, rejectClose: false });
}
function refresh(useId) {
  for (const message of values(game.messages)) if (flag(message, marksmanUses.cardFlag)?.useId === useId) ui.chat?.updateMessage?.(message);
}
export async function rollResolution(actor, useId, stepId, occurrence = "") {
  const { use, step: selectedStep } = resolutionStep(actor, useId, stepId);
  const step = sharedRollStep(use, selectedStep);
  stepId = step.id;
  if (!await accepted(step.label ?? use.title, "Roll this recorded step's Damage? No resources are spent again.")) return null;
  const id = resolutionId(useId, stepId, "roll", "", occurrence);
  const result = await confirmPlayUse(step.label ?? use.title, extra => marksmanUses.command(actor, "rollResolution", { useId, stepId, occurrence, confirmed: true, ...extra }, id));
  if (!result) return null;
  const rolled = await marksmanUses.command(actor, "useRoll", { useId: id }, `${id}_dice`);
  refresh(useId); return rolled;
}
export async function rollResolutionSave(actor, useId, stepId, targetUuid, occurrence = "") {
  const { use, step } = resolutionStep(actor, useId, stepId), target = actorFor(targetUuid);
  need(owned(target), "Only the target's owner or GM can roll this save.");
  need(step.save, "This step has no saving throw.");
  let dc = step.save.dc;
  if (!Number.isFinite(dc)) {
    const selected = await foundry.applications.api.DialogV2.prompt({ window: { title: "Choose this use's reviewed Martial DC" }, rejectClose: false,
      content: '<p>The source use has no selected DC. Enter the table’s reviewed Martial DC for this saving throw; it appears publicly with the result.</p><input name="dc" type="number" min="1" max="99" required>',
      ok: { label: "Continue to saving throw", callback: (_event, button) => Number(button.form.elements.dc.value) } });
    if (selected == null) return null;
    need(Number.isInteger(selected) && selected >= 1 && selected <= 99, "Enter a valid whole-number DC."); dc = selected;
  }
  const disadvantage = step.save.disadvantage === true || step.save.disadvantageTargets?.includes(targetUuid);
  const rolls = await target.rollSavingThrow({ ability: step.save.ability, target: dc,
    ...(disadvantage ? { disadvantage: true } : {}), ...(step.save.advantage ? { advantage: true } : {}) });
  const total = Number(Array.isArray(rolls) ? rolls[0]?.total : rolls?.total);
  if (!Number.isFinite(total)) return null;
  const result = await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: target }),
    content: `<p>${esc(target.name)}: ${esc(step.save.ability.toUpperCase())} save ${total} / DC ${dc}: ${total >= dc ? "success" : "failure"}.</p>`,
    flags: { ak5e: { marksmanSave: { actorUuid: actor.uuid, useId, stepId, targetUuid, occurrence, total, ability: step.save.ability, dc } } } });
  refresh(use.id); return result;
}
export async function applyResolution(actor, useId, stepId, targetUuid, options = {}) {
  const { use, step } = resolutionStep(actor, useId, stepId);
  const selection = await foundry.applications.api.DialogV2.wait({ window: { title: `Apply ${step.label ?? use.title}` }, rejectClose: false,
    content: `<p>Apply the recorded outcome to ${esc(actorFor(targetUuid)?.name ?? targetUuid)}. Damage/conditions and target changes are undoable.</p>
      <label>Reviewed Damage Reduction <input name="reduction" type="number" value="0" min="0"></label>
      ${step.save ? '<label>Manual save result (if no target-owner save is attached)<select name="save"><option value="">Use recorded save</option><option value="failed">Failed</option><option value="success">Succeeded</option></select></label>' : ""}
      ${step.requiresHit ? '<label><input type="checkbox" name="hit"> The originating Attack hit this Creature.</label>' : ""}
      <label><input type="checkbox" name="structure"> This target is a Structure.</label>`,
    buttons: [{ action: "apply", label: "Apply", callback: (_event, button) => ({ reduction: Number(button.form.elements.reduction.value),
      ...(button.form.elements.save?.value ? { saveSucceeded: button.form.elements.save.value === "success" } : {}), hitConfirmed: button.form.elements.hit?.checked === true, isStructure: button.form.elements.structure?.checked === true }) },
      { action: "cancel", label: "Cancel", default: true, callback: () => null }] });
  if (!selection) return null;
  const id = resolutionId(useId, stepId, "apply", targetUuid, options.occurrence ?? "");
  const result = await confirmPlayUse(step.label ?? use.title, extra => marksmanUses.command(actor, "resolveUse", { useId, stepId, targetUuid, ...selection, ...options, confirmed: true, ...extra }, id));
  refresh(useId); return result;
}
export async function attackResolution(actor, useId, stepId) {
  const { use, step } = resolutionStep(actor, useId, stepId);
  need(owned(actor), "Choose an owned Marksman.");
  const weapon = globalThis.fromUuidSync?.(step.weaponUuid ?? use.weaponUuid);
  need(weapon?.parent?.uuid === actor.uuid, "Choose the recorded owned weapon.");
  const activity = weapon.system?.activities?.get?.(step.activityId) ?? values(weapon.system?.activities).find(activity => activity.type === "attack");
  need(activity?.rollAttack, "This weapon has no native Attack activity. Splash uses saves instead.");
  if (!await accepted(step.label ?? use.title, "Make this recorded Attack? Its Damage is rolled separately.")) return null;
  const warnings = stepWarnings(actor, use, step);
  const attempt = async extra => {
    const { requireOverrides } = await import("./play-undo.mjs"); requireOverrides(warnings, extra.overrides);
    const context = { actorUuid: actor.uuid, useId, stepId, targetUuids: step.targetUuids, damageScale: step.damageScale ?? 1,
      ignoreDR: step.ignoreDR, ignoreResistance: step.ignoreResistance, singleAttack: step.singleAttack, twoWeaponFighting: step.twoWeaponFighting };
    const targetUuid = step.targetUuids?.[0];
    const rolls = await activity.rollAttack({ ak5eTargetUuid: targetUuid, ak5eDeliberateEfficient: step.singleAttack === true,
      target: actorFor(targetUuid)?.system?.attributes?.ac?.value }, { configure: true }, { data: { flags: { ak5e: { marksmanAttack: context } } } });
    if (!rolls?.length) return null;
    const message = values(game.messages).findLast(message => flag(message, "marksmanAttack")?.useId === useId && flag(message, "marksmanAttack")?.stepId === stepId);
    if (message) await marksmanUses.command(actor, "completeResolutionAttack", { useId, stepId, messageUuid: message.uuid, confirmed: true }, resolutionId(useId, stepId, "attack"));
    refresh(useId); return rolls;
  };
  return confirmPlayUse(step.label ?? use.title, attempt);
}
export async function weaponResolutionDamage(actor, useId, stepId) {
  const { use, step } = resolutionStep(actor, useId, stepId);
  const weapon = globalThis.fromUuidSync?.(step.weaponUuid ?? use.weaponUuid);
  need(weapon?.parent?.uuid === actor.uuid && owned(actor), "Choose the recorded owned weapon.");
  const activity = weapon.system?.activities?.get?.(step.activityId) ?? values(weapon.system?.activities).find(activity => activity.type === "attack");
  need(activity?.rollDamage, "This weapon has no native Damage activity.");
  if (!await accepted(step.label ?? use.title, "Roll this Attack's Damage? Apply it once from the resulting feature card.")) return null;
  const context = { actorUuid: actor.uuid, useId, stepId };
  const rolls = await activity.rollDamage({ ak5eTwoWeaponFighting: step.twoWeaponFighting === true, ak5eDamageScale: step.damageScale ?? 1, ak5eTargetUuid: step.targetUuids?.[0] },
    { configure: true }, { data: { flags: { ak5e: { marksmanDamage: context } } } });
  if (!rolls?.length) return null;
  const message = values(game.messages).findLast(message => { const info = flag(message, "marksmanDamage"); return info?.useId === useId && info.stepId === stepId; });
  if (message) return marksmanUses.command(actor, "recordResolutionDamage", { useId, stepId, messageUuid: message.uuid, confirmed: true }, resolutionId(useId, stepId, "weaponDamage"));
  return rolls;
}

export function renderMarksmanSteps(message, html) {
  const info = flag(message, marksmanUses.cardFlag);
  if (!info || html.querySelector(".ak5e-marksman-steps")) return;
  const actor = actorFor(info.actorUuid), use = actor && marksmanUses.receipt(actor, info.useId);
  if (!use?.resolution?.steps?.length || use.status === "undone") return;
  const box = document.createElement("div"); box.className = "ak5e-marksman-steps";
  const add = (parent, label, handler, disabled = false) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.disabled = disabled;
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); button.disabled = true;
      Promise.resolve().then(handler).catch(error => ui.notifications.error(error.message)).finally(() => { button.disabled = disabled; refresh(use.id); }); });
    parent.append(button);
    return button;
  };
  for (const step of use.resolution.steps) {
    const row = document.createElement("fieldset"), title = document.createElement("legend"); title.textContent = step.label ?? step.id; row.append(title);
    let occurrence = "", occurrenceInput;
    if (step.repeatable) {
      const prior = marksmanUses.state(actor).undo.filter(entry => entry.parentUseId === use.id && entry.parentStepId === step.id);
      occurrence = String(prior.at(-1)?.data?.occurrence ?? "1");
      const label = document.createElement("label"); label.textContent = "Area event (entry or end of Turn): ";
      occurrenceInput = document.createElement("input"); occurrenceInput.type = "number"; occurrenceInput.min = "1"; occurrenceInput.value = occurrence;
      label.append(occurrenceInput); row.append(label);
      const note = document.createElement("p"); note.textContent = "Increase the event number for each new entry/end-of-Turn trigger. Reusing a number resumes that event without applying it twice."; row.append(note);
      occurrenceInput.addEventListener("change", () => { occurrence = String(Math.max(1, Number(occurrenceInput.value) || 1)); });
    }
    if (step.trigger) { const text = document.createElement("p"); text.textContent = `Timing: ${step.trigger.event}${step.trigger.at != null ? ` at world time ${step.trigger.at}` : " — resolve when due"}.`; row.append(text); }
    if (owned(actor) && step.kind === "attack") {
      const complete = marksmanUses.receipt(actor, resolutionId(use.id, step.id, "attack"));
      add(row, complete?.status === "complete" ? "Attack recorded" : "Roll Attack", () => attackResolution(actor, use.id, step.id), complete?.status === "complete");
      add(row, "Roll weapon Damage", () => weaponResolutionDamage(actor, use.id, step.id));
    }
    if (owned(actor) && (step.rollFormula || step.kind === "damage" && step.damageParts?.some(part => part.formula))) add(row, step.rollFormula ? `Roll ${step.rollFormula}` : "Roll Damage", () => rollResolution(actor, use.id, step.id, occurrence));
    const targets = [...new Set(step.targetUuids ?? [])];
    for (const uuid of targets) {
      const target = actorFor(uuid);
      if (step.save && owned(target)) add(row, `${target.name}: ${step.save.ability.toUpperCase()} Save`, () => rollResolutionSave(actor, use.id, step.id, uuid, occurrence));
      if (owned(actor) && step.kind !== "attack") {
        const applied = appliedUse(actor, use.id, step.id, uuid, occurrence), done = applied?.status === "complete" || applied?.status === "undone";
        const action = add(row, `${target?.name ?? uuid}: ${done ? applied.status === "undone" ? "Undone" : "Applied" : "Apply outcome"}`, () => applyResolution(actor, use.id, step.id, uuid, { occurrence }), done);
        occurrenceInput?.addEventListener("change", () => {
          const result = appliedUse(actor, use.id, step.id, uuid, occurrenceInput.value);
          action.disabled = ["complete", "undone"].includes(result?.status);
          action.textContent = `${target?.name ?? uuid}: ${action.disabled ? result.status : "Apply outcome"}`;
        });
      }
    }
    if ((!targets.length || step.dynamicTargets) && owned(actor) && step.kind !== "attack") add(row, "Apply to selected Creature", async () => {
      const target = game.user.targets?.first?.(); need(target, "Select a Creature first.");
      return applyResolution(actor, use.id, step.id, target.document?.uuid ?? target.actor.uuid, { occurrence });
    });
    box.append(row);
  }
  html.querySelector(".message-content")?.append(box);
}

export function effectExpired(metadata, event) {
  const expiry = metadata.expiry;
  if (!expiry?.event) return false;
  if (expiry.event === "worldTime") return worldTime() >= expiry.at;
  const combat = game.combat;
  if (!combat?.started || expiry.created?.combatId !== combat.id) return false;
  const expiryActorUuid = actorFor(expiry.actorUuid)?.uuid ?? expiry.actorUuid;
  if (event.actorUuid !== expiryActorUuid) return false;
  const targetIndex = values(combat.turns).findIndex(turn => turn.actor?.uuid === expiryActorUuid);
  const firstRound = Number(expiry.created?.round ?? 0) + (targetIndex <= Number(expiry.created?.turn ?? 0) ? 1 : 0);
  const round = Number(event.round ?? combat.round), turn = Number(event.turn ?? combat.turn);
  if (expiry.event === "nextTurnEnd") return event.event === "turnEnd" && round >= firstRound;
  return expiry.event === event.event && (round > Number(expiry.created?.round ?? 0) || turn >= Number(expiry.created?.turn ?? 0));
}
export function resolutionTriggerDue(use, step, event, combat = globalThis.game?.combat) {
  const trigger = step.trigger;
  if (!trigger) return false;
  if (trigger.event === "worldTime") return worldTime() >= trigger.at;
  const triggerActorUuid = actorFor(trigger.actorUuid)?.uuid ?? trigger.actorUuid;
  if (event.event !== trigger.event || event.actorUuid !== triggerActorUuid || !combat?.started) return false;
  const parts = String(trigger.afterTurnKey ?? use.data?.turnKey ?? "").split(":");
  if (parts.slice(0, -2).join(":") !== combat.id) return false;
  const startRound = Number(parts.at(-2)), startTurn = Number(parts.at(-1));
  if (!Number.isFinite(startRound) || !Number.isFinite(startTurn)) return false;
  const index = values(combat.turns).findIndex(turn => turn.actor?.uuid === triggerActorUuid);
  const firstRound = startRound + (index <= startTurn ? 1 : 0);
  return Number(event.round ?? combat.round) >= firstRound + Number(trigger.occurrence ?? 1) - 1;
}
let installed = false;
export function registerMarksmanResolution() {
  if (installed) return; installed = true;
  const safe = promise => Promise.resolve(promise).catch(error => console.error("AK5e | Marksman resolution", error));
  Hooks.on("renderChatMessageHTML", renderMarksmanSteps);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (html.querySelector(".ak5e-native-marksman") || flag(message, "marksmanDamage")) return;
    const roll = message.rolls?.find(roll => roll.options?.ak5eMarksman), context = roll?.options.ak5eMarksman;
    const actor = context && actorFor(context.actorUuid);
    if (!owned(actor) || !marksmanEnabled(actor)) return;
    const box = document.createElement("div"); box.className = "ak5e-native-marksman";
    const add = (label, command) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.addEventListener("click", () => { button.disabled = true; safe((async () => {
        const { confirmMarksmanCommand } = await import("./marksman-sheet.mjs");
        const uuid = roll.options.ak5eTargetSnapshot?.uuid;
        return confirmMarksmanCommand(actor, command, { originMessageUuid: message.uuid, weaponUuid: context.weaponUuid,
          targetUuids: uuid ? [uuid] : [], targetUuid: uuid, operationId: resolutionId(message.uuid, command, "native"), deliberateEfficient: context.godpiercerHpLoss === 16 });
      })()).finally(() => { button.disabled = false; }); }); box.append(button);
    };
    const isDamage = message.getFlag?.("dnd5e", "roll")?.type === "damage" || roll.options.rollType === "damage";
    if (isDamage) add("Review / apply Marksman Damage", "nativeWeaponDamage");
    if (isDamage && context.godpiercerHpLoss) add("Resolve Godpiercer hit", "besiegerHit");
    if (box.childElementCount) html.querySelector(".message-content")?.append(box);
  });
  Hooks.on("updateChatMessage", message => { const save = flag(message, "marksmanSave"); if (save) refresh(save.useId); });
  Hooks.on("createChatMessage", message => { const save = flag(message, "marksmanSave"); if (save) refresh(save.useId); });
  const process = async event => {
    if (!(game.users?.activeGM ? game.users.activeGM.id === game.user.id : !game.user.isGM)) return;
    const actors = new Map(values(game.actors).map(actor => [actor.uuid, actor]));
    for (const token of values(game.scenes).flatMap(scene => values(scene.tokens))) if (token.actor) actors.set(token.actor.uuid, token.actor);
    for (const actor of actors.values()) {
      if (!owned(actor)) continue;
      for (const effect of values(actor.effects)) {
        const metadata = flag(effect, "marksmanResolutionEffect");
        if (metadata && effectExpired(metadata, event)) await effect.delete();
      }
      if (!marksmanEnabled(actor)) continue;
      for (const use of marksmanUses.state(actor).undo) {
        if (use.status === "undone" || isLocked(use)) continue;
        for (const step of use.resolution?.steps ?? []) {
          const trigger = step.trigger; if (!trigger) continue;
          if (values(game.messages).some(message => { const due = flag(message, "marksmanDue"); return due?.actorUuid === actor.uuid && due.useId === use.id && due.stepId === step.id; })) continue;
          const due = resolutionTriggerDue(use, step, event);
          if (!due) continue;
          await ChatMessage.implementation.create({ content: `<p>${esc(actor.name)}: ${esc(step.label ?? use.title)} is due. Use the original card's owner-operated controls; no dice were rolled.</p>`,
            flags: { ak5e: { marksmanDue: { actorUuid: actor.uuid, useId: use.id, stepId: step.id } } } });
          refresh(use.id);
        }
      }
    }
  };
  Hooks.on("updateWorldTime", () => safe(process({ event: "worldTime" })));
  let prior = game.combat ? { round: game.combat.round, turn: game.combat.turn, actorUuid: game.combat.combatant?.actor?.uuid } : null;
  Hooks.on("updateCombat", combat => {
    const current = { round: combat.round, turn: combat.turn, actorUuid: combat.combatant?.actor?.uuid };
    if (prior && (prior.round !== current.round || prior.turn !== current.turn)) safe(process({ event: "turnEnd", ...prior }));
    if (!prior || prior.round !== current.round || prior.turn !== current.turn) safe(process({ event: "turnStart", ...current }));
    prior = current;
  });
}
