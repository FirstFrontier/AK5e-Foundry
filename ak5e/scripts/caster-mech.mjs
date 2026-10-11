/**
 * Mech-Accord Caster uses (Ch.3 L554–668) on the shared Caster use engine, following WORKFLOW.md §3.2:
 * - Jury Rigging, drone commands, Wolfpack Doctrine and rebuilding are uses with warnings ("Use anyway"),
 *   the player's reading where the GM has not ruled, undo receipts, and the GM relay for unowned drones;
 * - Jury Rigging's d8s are rolled only when the player clicks the card's Roll button;
 * - creating or linking an Arts Master is requested by the owner and performed by the active GM's client.
 */
import { casterLevel, casterBranch, casterState } from "./caster-rules.mjs";
import { casterEnabled, casterTurn, ownCasterTurn } from "./caster-casting.mjs";
import { createCasterDrone, linkCasterDrone, droneAttackLocked } from "./caster-drones.mjs";
import { artsState, integer } from "./arts-rules.mjs";
import { createOperationKernel, flag, values, need, opaqueKey, esc, keyedSerial } from "./operation-kernel.mjs";
import { applyHealing, applyTempHP } from "./damage-pipeline.mjs";
import { resolveReading, requireOverrides, currentEpoch, isLocked } from "./play-undo.mjs";
import { distanceFeet, tokenPoint } from "./standard-bearer-rules.mjs";
import { registerCasterUses, recordExternalCasterUse, updateExternalCasterUse, casterStateSerial } from "./caster-primal-splash.mjs";

const AP_PATH = "flags.ak5e.artsPoints.value", CP_PATH = "system.currency.cp";
/** Readings offered when the GM has not ruled (DECISIONS.md "Mech-Accord and WORKFLOW.md §3.2"). Values match recordable rulings. */
export const MECH_READINGS = Object.freeze({
  juryTempHP: { label: "Excess Jury Rigging healing and existing Temporary HP", options: [
    { value: "replace", label: "Replace current Temporary HP (keep the higher)" },
    { value: "add", label: "Add to current Temporary HP" }] },
  technologyModifier: { label: "Technology Modifier in the Arts Master's Hit Points", options: [
    { value: "techTotal", label: "Total Technology skill modifier" },
    { value: "intMod", label: "Intelligence modifier" }] },
  duplicationCost: { label: "Cantrip Duplication cost with the Arts Translocation surcharge", options: [
    { value: "1", label: "1 AP in total" },
    { value: "2", label: "1 AP plus the 1 AP Translocation surcharge (2 AP)" }] },
  deathAboveCost: { label: "Death from Above repeat cost", options: [
    { value: "normal", label: "The repeated Art costs its normal AP" },
    { value: "free", label: "The repeated Art costs no AP" }] },
  residualStacking: { label: "Residual Energy Recyclers after several levelled Arts this Turn", options: [
    { value: "latest", label: "The latest Art's AP only" },
    { value: "sum", label: "The AP of all those Arts added together" }] }
});
export const MECH_COMMANDS = Object.freeze(["juryRig", "commandDrones", "wolfpack", "rebuild", "residualReading"]);

const stable = value => value === undefined ? undefined : JSON.stringify(value, (_key, nested) => nested && typeof nested === "object" && !Array.isArray(nested)
  ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested);
const droneEvidenceSerial = keyedSerial();
const snapshot = document => document?.toObject?.(false) ?? {
  documentName: document?.documentName, id: document?.id, uuid: document?.uuid, name: document?.name, type: document?.type,
  system: structuredClone(document?.system ?? {}), flags: structuredClone(document?.flags ?? {}), ownership: structuredClone(document?.ownership ?? {}),
  prototypeToken: structuredClone(document?.prototypeToken ?? {}), items: values(document?.items).map(item => ({ name: item.name, type: item.type, system: structuredClone(item.system ?? {}), flags: structuredClone(item.flags ?? {}) })),
  effects: values(document?.effects).map(effect => ({ name: effect.name, changes: structuredClone(effect.changes ?? []), flags: structuredClone(effect.flags ?? {}) })),
  x: document?.x, y: document?.y, elevation: document?.elevation, width: document?.width, height: document?.height, actorId: document?.actorId
};
const sceneTokens = () => values(game.scenes).flatMap(scene => values(scene.tokens));
function requestReceipt(actor, id) { return casterState(actor).undo?.find(entry => entry.id === id); }
function droneRequestSpec(command, droneUuid, details = {}) {
  return { command, droneUuid: droneUuid ?? null, sceneId: details.sceneId ?? null,
    x: details.x ?? null, y: details.y ?? null, technologyModifier: details.technologyModifier ?? null,
    overrides: [...(details.overrides ?? [])].sort() };
}
const droneEvidenceKey = (actor, id) => opaqueKey(`${actor.uuid}:${id}`);
function droneEvidence(actor, receipt) {
  const key = droneEvidenceKey(actor, receipt.id);
  for (const message of values(game.messages)) {
    const record = flag(message, "casterDroneEvidence"), evidence = record?.key === key ? record.evidence : null;
    const authorId = message.author?.id ?? message.user?.id ?? message.userId, author = game.users?.get?.(authorId);
    if (author?.isGM && evidence?.actorUuid === actor.uuid && evidence.operationId === receipt.id && evidence.gmUserId === author.id) return evidence;
  }
  return null;
}
async function writeDroneEvidence(actor, id, evidence) {
  const currentGM = game.users?.activeGM;
  need(game.user?.isGM && currentGM?.id === game.user.id, "Only the elected GM may record Arts Master creation evidence.");
  return droneEvidenceSerial(currentGM, async () => {
    const key = droneEvidenceKey(actor, id), record = { key, evidence: structuredClone(evidence) };
    const existing = values(game.messages).find(message => flag(message, "casterDroneEvidence")?.key === key
      && message.author?.id === evidence.gmUserId && game.users?.get?.(message.author.id)?.isGM);
    if (existing) {
      const result = await existing.update({ "flags.ak5e.casterDroneEvidence.evidence": record.evidence });
      need(result || stable(flag(existing, "casterDroneEvidence")?.evidence) === stable(record.evidence), "The private GM Arts Master evidence could not be updated.");
      return;
    }
    need(evidence.gmUserId === currentGM.id, "The private GM Arts Master evidence is missing; preserve documents for reconciliation.");
    const gmIds = [...new Set([...values(game.users).filter(user => user?.isGM).map(user => user.id), currentGM.id])];
    const message = await ChatMessage.implementation.create({ content: "Private Arts Master operation evidence", whisper: gmIds,
      flags: { ak5e: { casterDroneEvidence: record } } });
    need(message && flag(message, "casterDroneEvidence")?.key === key, "The private GM Arts Master evidence could not be recorded.");
  });
}
async function patchDroneEvidence(actor, receipt, patch) {
  const evidence = droneEvidence(actor, receipt);
  need(evidence, "The GM-authored Arts Master evidence is missing; documents will be preserved for reconciliation.");
  await writeDroneEvidence(actor, receipt.id, { ...evidence, ...structuredClone(patch) });
}
function droneEvidenceCallbacks(actor, id, command) {
  return {
    async onActorCreated(drone) {
      const receipt = requestReceipt(actor, id);
      await writeDroneEvidence(actor, id, { actorUuid: actor.uuid, operationId: id, gmUserId: game.user.id, command,
        droneUuid: drone.uuid, createdActor: true, spec: receipt?.request?.spec, epoch: currentEpoch(),
        priorDrones: [...(receipt?.request?.priorDrones ?? [])], actorSnapshot: snapshot(drone), tokens: [],
        tokensCaptured: false, status: "actorCreated", deletion: {} });
    },
    async onTokenCreated(token) {
      const evidence = droneEvidence(actor, requestReceipt(actor, id));
      need(evidence?.createdActor && evidence.droneUuid === token.actor?.uuid, "The GM Arts Master creation evidence is missing; the placed Token will be preserved for reconciliation.");
      const tokens = [...(evidence.tokens ?? []).filter(row => row.uuid !== token.uuid), { uuid: token.uuid, snapshot: snapshot(token) }];
      await writeDroneEvidence(actor, id, { ...evidence, tokens, tokensCaptured: true, status: "placing" });
    }
  };
}
async function prepareDroneRequest(actor, id, command, droneUuid = null, details = {}) {
  const spec = droneRequestSpec(command, droneUuid, details);
  const existing = requestReceipt(actor, id);
  if (existing) {
    need(existing.undoKind === "droneRequest" && existing.command === "droneRequest", "That operation ID belongs to another Caster use.");
    need(existing.status !== "undone", "That Arts Master request was undone; use a new operation ID for a new request.");
    need(stable(existing.request?.spec) === stable(spec), "Retry the original Arts Master request with the same operation choices; no documents changed.");
    return existing;
  }
  const state = casterState(actor), priorDrones = [...state.drones];
  return recordExternalCasterUse(actor, { id, command: "droneRequest", undoKind: "droneRequest", title: command === "create" ? "Create Arts Master" : "Link Arts Master",
    userId: details.userId ?? game.user.id, epoch: currentEpoch(), createdAt: Date.now(), status: "applying", request: { command, droneUuid, priorDrones, spec, deletion: {}, gmUserId: details.gmUserId ?? game.users?.activeGM?.id },
    overridden: details.overridden ?? [], reading: details.reading ?? null,
    summary: command === "create" ? "Create and link a new Arts Master Actor." : `Link ${droneUuid} to this Caster.`, targets: [] }, { alreadySerialized: true });
}
async function finishDroneRequest(actor, id, drone, command) {
  const tokens = sceneTokens().filter(token => token.flags?.ak5e?.artsMasterOperationId === id);
  const prior = droneEvidence(actor, requestReceipt(actor, id));
  const evidence = { actorUuid: actor.uuid, operationId: id, gmUserId: prior?.gmUserId ?? game.user.id, command, droneUuid: drone.uuid,
    createdActor: command === "create", spec: requestReceipt(actor, id)?.request?.spec,
    epoch: prior?.epoch ?? currentEpoch(),
    priorDrones: [...(requestReceipt(actor, id)?.request?.priorDrones ?? [])],
    actorSnapshot: command === "create" ? prior?.actorSnapshot ?? null : null,
    tokens: command === "create" ? prior?.tokens ?? [] : [],
    tokensCaptured: command === "create" && !!prior && (!!prior.tokensCaptured || !prior.spec?.sceneId),
    status: "complete", deletion: prior?.deletion ?? {} };
  await writeDroneEvidence(actor, id, evidence);
  const update = { status: "complete", request: { ...requestReceipt(actor, id)?.request, command, droneUuid: drone.uuid,
    createdActor: command === "create", gmUserId: game.user.id, actorSnapshot: evidence.actorSnapshot,
    tokens: evidence.tokens },
    summary: command === "create" ? `${drone.name} was created and linked to this Caster.` : `${drone.name} was linked to this Caster.` };
  await updateExternalCasterUse(actor, id, update, { post: true, alreadySerialized: true });
}
function droneUndoPreview(actor, receipt) {
  const request = receipt.request ?? {}, evidence = droneEvidence(actor, receipt), droneUuid = evidence?.droneUuid ?? request.droneUuid;
  const drone = droneUuid && globalThis.fromUuidSync?.(droneUuid);
  if (!evidence) {
    const provenLink = request.command === "link" && casterState(actor).drones.includes(droneUuid) && flag(drone, "artsMaster")?.creatorUuid === actor.uuid;
    return [provenLink ? `${drone?.name ?? "Arts Master"}: removes this Caster's proven link; the Actor and Token documents are preserved. GM request evidence is unavailable.`
      : `${drone?.name ?? "Arts Master"}: GM-authored request evidence is unavailable; preserve Actor and Token documents for reconciliation.`];
  }
  if (!evidence.createdActor) return [evidence.priorDrones?.includes(droneUuid) ? `${drone?.name ?? "Arts Master"}: this request did not add its link.` : `${drone?.name ?? "Arts Master"}: removes only this operation's link; other drone links remain.`];
  const actorUnchanged = !!drone && stable(snapshot(drone)) === stable(evidence.actorSnapshot);
  const tokenRows = evidence.tokens ?? [];
  const tokensUnchanged = tokenRows.every(row => {
    const token = globalThis.fromUuidSync?.(row.uuid), progress = evidence.deletion?.[row.uuid];
    return token
      ? token.flags?.ak5e?.artsMasterOperationId === receipt.id && stable(snapshot(token)) === stable(row.snapshot)
      : progress === "deleting" || progress === "deleted";
  });
  const otherLinks = values(game.actors).some(candidate => candidate.uuid !== actor.uuid && casterState(candidate).drones.includes(drone?.uuid));
  const safe = evidence.spec && stable(evidence.spec) === stable(request.spec) && evidence.droneUuid === request.droneUuid
    && evidence.tokensCaptured && actorUnchanged && tokensUnchanged && !otherLinks
    && flag(drone, "artsMaster")?.creatorUuid === actor.uuid && flag(drone, "artsMaster")?.operationId === receipt.id;
  return safe
    ? [`${drone.name}: removes this operation's unchanged Arts Master Actor and ${tokenRows.length} unchanged placed Token(s).`]
    : [`${drone?.name ?? "Arts Master"}: its Actor or Token changed, or is no longer attributable only to this operation. Undo preserves those documents and removes only this Caster's link.`];
}
async function undoDroneRequest(actor, receipt, relayState) {
  need(game.user?.isGM && game.users?.activeGM?.id === game.user.id, "Only the elected GM may undo Arts Master documents or links.");
  const request = receipt.request ?? {}, evidence = droneEvidence(actor, receipt), state = casterState(actor), droneUuid = evidence?.droneUuid ?? request.droneUuid;
  const hadLink = (state.drones ?? []).includes(droneUuid), drones = (state.drones ?? []).filter(uuid => uuid !== droneUuid);
  const notes = [];
  if (evidence?.createdActor) {
    const drone = globalThis.fromUuidSync?.(droneUuid), preview = droneUndoPreview(actor, receipt)[0];
    const tokenRows = evidence.tokens ?? [], otherLinks = values(game.actors).some(candidate => candidate.uuid !== actor.uuid && casterState(candidate).drones.includes(droneUuid));
    const tokenDocsSafe = tokenRows.every(row => {
      const token = globalThis.fromUuidSync?.(row.uuid), progress = evidence.deletion?.[row.uuid];
      return token
        ? token.flags?.ak5e?.artsMasterOperationId === receipt.id && stable(snapshot(token)) === stable(row.snapshot)
        : progress === "deleting" || progress === "deleted";
    });
    const safe = !!drone && stable(snapshot(drone)) === stable(evidence.actorSnapshot)
      && flag(drone, "artsMaster")?.creatorUuid === actor.uuid && flag(drone, "artsMaster")?.operationId === receipt.id
      && evidence.tokensCaptured && tokenDocsSafe && !otherLinks
      && sceneTokens().filter(token => token.actor?.uuid === droneUuid).every(token => token.flags?.ak5e?.artsMasterOperationId === receipt.id
        && tokenRows.some(row => row.uuid === token.uuid));
    if (safe) {
      for (const row of tokenRows) {
        const token = globalThis.fromUuidSync?.(row.uuid);
        if (token) {
          // Save intent before each irreversible delete. If the client stops after the delete, a retry can
          // distinguish this operation's partial progress from an unrelated missing token.
          evidence.deletion ??= {}; evidence.deletion[row.uuid] = "deleting";
          await patchDroneEvidence(actor, receipt, { deletion: structuredClone(evidence.deletion) });
          request.deletion ??= {}; request.deletion[row.uuid] = "deleting";
          await updateExternalCasterUse(actor, receipt.id, { request: structuredClone(request) }, { alreadySerialized: true });
          const latestToken = globalThis.fromUuidSync?.(row.uuid);
          if (!latestToken || latestToken.flags?.ak5e?.artsMasterOperationId !== receipt.id || stable(snapshot(latestToken)) !== stable(row.snapshot)) {
            evidence.deletion[row.uuid] = "preserved";
            await patchDroneEvidence(actor, receipt, { deletion: structuredClone(evidence.deletion) });
            request.deletion[row.uuid] = "preserved";
            await updateExternalCasterUse(actor, receipt.id, { request: structuredClone(request) }, { alreadySerialized: true });
            notes.push(`${token.name ?? "Arts Master Token"}: changed during undo; the Token was preserved.`);
            continue;
          }
          await latestToken.delete();
          evidence.deletion[row.uuid] = "deleted";
          await patchDroneEvidence(actor, receipt, { deletion: structuredClone(evidence.deletion) });
          request.deletion[row.uuid] = "deleted";
          await updateExternalCasterUse(actor, receipt.id, { request: structuredClone(request) }, { alreadySerialized: true });
        }
      }
      let refreshedDrone = globalThis.fromUuidSync?.(droneUuid);
      let newTokens = sceneTokens().filter(token => token.actor?.uuid === droneUuid);
      let newLinks = values(game.actors).some(candidate => candidate.uuid !== actor.uuid && casterState(candidate).drones.includes(droneUuid));
      let actorStillOurs = refreshedDrone && stable(snapshot(refreshedDrone)) === stable(evidence.actorSnapshot)
        && flag(refreshedDrone, "artsMaster")?.creatorUuid === actor.uuid && flag(refreshedDrone, "artsMaster")?.operationId === receipt.id;
      if (actorStillOurs && !newTokens.length && !newLinks) {
        evidence.deletion.actor = "deleting";
        await patchDroneEvidence(actor, receipt, { deletion: structuredClone(evidence.deletion) });
        request.deletion.actor = "deleting";
        await updateExternalCasterUse(actor, receipt.id, { request: structuredClone(request) }, { alreadySerialized: true });
        // These durable intent writes may take long enough for an owner or another GM to edit or link the Actor.
        // Revalidate immediately before deletion; the earlier scan never authorizes a later delete.
        refreshedDrone = globalThis.fromUuidSync?.(droneUuid);
        newTokens = sceneTokens().filter(token => token.actor?.uuid === droneUuid);
        newLinks = values(game.actors).some(candidate => candidate.uuid !== actor.uuid && casterState(candidate).drones.includes(droneUuid));
        actorStillOurs = refreshedDrone && stable(snapshot(refreshedDrone)) === stable(evidence.actorSnapshot)
          && flag(refreshedDrone, "artsMaster")?.creatorUuid === actor.uuid && flag(refreshedDrone, "artsMaster")?.operationId === receipt.id;
        if (actorStillOurs && !newTokens.length && !newLinks) {
          await refreshedDrone.delete();
          evidence.deletion.actor = "deleted";
        } else {
          evidence.deletion.actor = "preserved";
          if (refreshedDrone) notes.push(`${refreshedDrone.name}: changed or linked during undo; the Actor was preserved.`);
        }
        await patchDroneEvidence(actor, receipt, { deletion: structuredClone(evidence.deletion) });
        request.deletion.actor = evidence.deletion.actor;
        await updateExternalCasterUse(actor, receipt.id, { request: structuredClone(request) }, { alreadySerialized: true });
      } else if (refreshedDrone) {
        notes.push(`${refreshedDrone.name}: its Actor or Token changed during undo, or another Caster linked it; documents were preserved and this Caster's link was removed.`);
      }
    } else {
      if (hadLink) notes.push(preview);
      else notes.push(`${drone?.name ?? "Arts Master"}: no link remains; its Actor and Token documents were preserved.`);
    }
  } else if (evidence?.priorDrones?.includes(droneUuid)) {
    drones.push(...(hadLink ? [droneUuid] : []));
  } else if (hadLink) notes.push(`${globalThis.fromUuidSync?.(droneUuid)?.name ?? "Arts Master"}: removed this operation's link; the existing Actor and Token were preserved.`);
  state.drones = [...new Set(drones)];
  await actor.update({ "flags.ak5e.caster.drones": state.drones });
  if (evidence) await patchDroneEvidence(actor, receipt, { status: "undone" });
  // createOperationKernel expects the updated relay state, not an arbitrary result object.
  // Keep undo notes on the durable Caster receipt through its public preview/card.
  const current = casterState(actor), currentReceipt = current.undo?.find(entry => entry.id === receipt.id);
  if (currentReceipt) { currentReceipt.undoNotes = notes; await actor.update({ "flags.ak5e.caster.undo": current.undo }); }
  return relayState;
}

const warn = (list, id, text) => list.push({ id, text });
const ruled = (state, key) => { const record = state.rulings?.[key]; return record?.source?.trim() && record.value !== undefined ? record.value : undefined; };
/** A GM ruling, otherwise the player's reading for this use (throws `PlayReading` until one is chosen). */
export function mechReading(actor, key, reading, readings) {
  if (readings?.[key] !== undefined) reading = readings[key];
  const offered = MECH_READINGS[key], ruling = ruled(casterState(actor), key);
  const result = resolveReading(ruling === undefined ? undefined : String(ruling), reading === undefined ? undefined : String(reading), key, offered.label, offered.options);
  return { ...result, label: offered.options.find(option => option.value === result.value)?.label ?? String(result.value) };
}
const droneCap = actor => casterLevel(actor) >= 10 ? 2 : 1;
const destroyed = drone => flag(drone, "artsMaster")?.destroyed === true || Number(drone.system?.attributes?.hp?.value) <= 0;
/** This creator's linked Arts Master Actor from an Actor or Token UUID. Identity is required; ownership is not (the GM relay writes). */
function droneActor(actor, uuid) {
  const doc = globalThis.fromUuidSync?.(uuid), drone = doc?.documentName === "Token" ? doc.actor : doc;
  need(drone?.documentName === "Actor" && casterState(actor).drones.includes(drone.uuid) && flag(drone, "artsMaster")?.creatorUuid === actor.uuid, "Choose this creator's linked Arts Master.");
  return drone;
}
function droneToken(actor, uuid) {
  const token = globalThis.fromUuidSync?.(uuid);
  need(token?.documentName === "Token", "Choose a placed Arts Master token.");
  droneActor(actor, uuid);
  return token;
}
/** Range from the creator's tokens to a drone token (or any of the drone's tokens); unmeasurable range is its own warning. */
function rangeWarning(warnings, actor, drone, feet, token = null) {
  const sources = (actor.getActiveTokens?.(true, true) ?? actor.tokens ?? []).map(t => t.document ?? t);
  const targets = token ? [token] : (drone.getActiveTokens?.(true, true) ?? []).map(t => t.document ?? t);
  const pairs = sources.flatMap(source => targets.filter(target => target.parent?.id === source.parent?.id && source.parent?.grid).map(target => distanceFeet(source.parent, tokenPoint(source), tokenPoint(target))));
  if (!pairs.length) warn(warnings, `range_${opaqueKey(drone.uuid)}`, `${drone.name}: range to its creator could not be measured (no tokens on the same Scene).`);
  else if (Math.min(...pairs) > feet + 1e-6) warn(warnings, `range_${opaqueKey(drone.uuid)}`, `${drone.name} is more than ${feet} feet from its creator (${Math.round(Math.min(...pairs))} feet).`);
}
function levelWarning(warnings, actor, level, feature) {
  if (casterLevel(actor) < level) warn(warnings, "level", `${feature} is a Mech-Accord level ${level} feature; this Caster is level ${casterLevel(actor)}.`);
}
/** Spend AP for a use: clamps at 0, records the actual expenditure, and emits the same `apSpent` event as a cast. */
function spendAP(actor, next, receipt, amount, reason) {
  const ap = artsState(actor), after = Math.max(0, ap.value - amount), spent = ap.value - after, turn = casterTurn(actor);
  receipt.caster = { pool: { path: AP_PATH, before: ap.value, after, max: ap.maximum, label: "AP", unit: "" } };
  if (amount > ap.value) receipt.shortfall = `AP short by ${amount - ap.value}`;
  next.spends = [...(next.spends ?? []), { id: receipt.id, amount: spent, reason, turn, before: ap.value, after }].slice(-40);
  receipt.apSpent = { amount: spent, turn, reason };
  return { [AP_PATH]: after, "flags.ak5e.lastArtCast": null };
}

/* ---------------------------------------------------------------- target changes (local or relayed) */

const appliedKey = (caster, useId) => opaqueKey(`${useId}:${caster.uuid}`);
/** GM-side relay checks: a drone change must target a drone created by and linked to this Caster. */
const linkedTo = (caster, drone) => drone?.documentName === "Actor" && flag(drone, "artsMaster")?.creatorUuid === caster.uuid && casterState(caster).drones.includes(drone.uuid);
const record = (target, caster, useId) => flag(target, "casterApplied")?.[appliedKey(caster, useId)];
/** Jury Rigging healing: the Construct exception is explicit (Ch.3 L628); excess healing becomes Temporary HP. */
const droneHeal = {
  commands: ["juryRig"],
  validate(caster, receipt, entry, target) {
    const dice = Number(String(receipt.formula ?? "").split("d")[0]);
    return linkedTo(caster, target) && Number.isInteger(dice) && dice >= 1 && dice <= 12 && Number(entry.amount) === Number(receipt.roll) && entry.amount <= dice * 8;
  },
  async apply(caster, useId, entry, target) {
    const done = record(target, caster, useId);
    if (done) return done;
    const hp = target.system.attributes.hp, heal = applyHealing(hp, entry.amount, { source: "classFeature", isConstruct: true, constructException: true });
    const excess = Math.max(0, entry.amount - heal.restored), tempBefore = Number(hp.temp ?? 0);
    const temp = excess > 0 ? applyTempHP(tempBefore, excess, entry.tempMode === "additive" ? "additive" : "replace") : tempBefore;
    const applied = { hpGained: heal.newHp - Number(hp.value), tempBefore, temp, value: heal.newHp, rolled: entry.amount };
    await target.update({ "system.attributes.hp.value": heal.newHp, "system.attributes.hp.temp": temp, [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: applied });
    return applied;
  },
  async revert(caster, useId, _entry, target) {
    const applied = record(target, caster, useId);
    if (!applied) return { restored: 0 };
    const hp = target.system.attributes.hp, current = Number(hp.temp ?? 0);
    const temp = current === applied.temp ? applied.tempBefore : Math.max(0, current - (applied.temp - applied.tempBefore));
    await target.update({ "system.attributes.hp.value": Math.max(0, Number(hp.value) - applied.hpGained), "system.attributes.hp.temp": temp,
      [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: null });
    return { removed: applied.hpGained };
  },
  preview(caster, receipt, entry, target) {
    const applied = record(target, caster, receipt.id);
    if (!applied) return `${entry.name}: no recorded repair remains.`;
    const changed = Number(target.system.attributes.hp.value) !== applied.value ? " Its Hit Points changed since; the repaired amount is removed, not the earlier total." : "";
    return `${entry.name}: removes the ${applied.hpGained} Hit Points repaired${applied.temp !== applied.tempBefore ? ` and restores Temporary HP to ${applied.tempBefore}` : ""}.${changed}`;
  },
  rolled(entry, total) { entry.amount = total; },
  rollText(entry) {
    const applied = entry.applied && typeof entry.applied === "object" ? entry.applied : {};
    return `${entry.name} recovers ${applied.hpGained ?? 0} Hit Points${applied.temp > applied.tempBefore ? `; Temporary HP is now ${applied.temp}` : ""} (rolled ${applied.rolled ?? entry.amount}).`;
  }
};
/** A commanded move of a drone token; undo moves it back. */
const tokenMove = {
  documentName: "Token", commands: ["commandDrones"],
  validate: (caster, _receipt, entry, target) => linkedTo(caster, target.actor) && [entry.to?.x, entry.to?.y].every(Number.isFinite),
  async apply(caster, useId, entry, target) {
    const done = record(target, caster, useId);
    if (done) return done;
    const applied = { fromX: target.x, fromY: target.y, x: entry.to.x, y: entry.to.y };
    await target.update({ x: entry.to.x, y: entry.to.y, [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: applied });
    return applied;
  },
  async revert(caster, useId, _entry, target) {
    const applied = record(target, caster, useId);
    if (!applied) return { moved: false };
    await target.update({ x: applied.fromX, y: applied.fromY, [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: null });
    return { moved: true };
  },
  preview(caster, receipt, entry, target) {
    const applied = record(target, caster, receipt.id);
    return applied ? `${entry.name}: moves back to (${applied.fromX}, ${applied.fromY})${target.x !== applied.x || target.y !== applied.y ? "; it has moved since" : ""}.` : `${entry.name}: no recorded move remains.`;
  }
};
/** Wolfpack Doctrine: the drone's own Reaction, reset at the start of its creator's Turn. */
const droneReaction = {
  commands: ["wolfpack"], validate: (caster, _receipt, _entry, target) => linkedTo(caster, target),
  async apply(caster, useId, entry, target) {
    const link = flag(target, "artsMaster") ?? {};
    if (link.reactionOperation === useId) return true;
    await target.update({ "flags.ak5e.artsMaster.reactionTurn": entry.stamp, "flags.ak5e.artsMaster.reactionOperation": useId,
      [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: { reactionTurn: link.reactionTurn ?? null, reactionOperation: link.reactionOperation ?? null } });
    return true;
  },
  async revert(caster, useId, _entry, target) {
    const prior = record(target, caster, useId);
    if (!prior) return { restored: false };
    const current = flag(target, "artsMaster")?.reactionOperation === useId;
    await target.update({ ...(current ? { "flags.ak5e.artsMaster.reactionTurn": prior.reactionTurn, "flags.ak5e.artsMaster.reactionOperation": prior.reactionOperation } : {}),
      [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: null });
    return { restored: current };
  },
  preview(_caster, receipt, entry, target) {
    return flag(target, "artsMaster")?.reactionOperation === receipt.id ? `${entry.name}: its Reaction is available again.` : `${entry.name}: a later Reaction replaced this one; nothing to restore.`;
  }
};
/** Rebuilding restores the retained Actor; undo restores its prior Hit Points and destroyed state. */
const droneRebuild = {
  commands: ["rebuild"], validate: (caster, _receipt, _entry, target) => linkedTo(caster, target),
  async apply(caster, useId, _entry, target) {
    const done = record(target, caster, useId);
    if (done) return done;
    const applied = { value: Number(target.system.attributes.hp.value), destroyed: flag(target, "artsMaster")?.destroyed === true };
    await target.update({ "system.attributes.hp.value": target.system.attributes.hp.max, "flags.ak5e.artsMaster.destroyed": false,
      [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: applied });
    return applied;
  },
  async revert(caster, useId, _entry, target) {
    const applied = record(target, caster, useId);
    if (!applied) return { restored: false };
    await target.update({ "system.attributes.hp.value": applied.value, "flags.ak5e.artsMaster.destroyed": applied.destroyed,
      [`flags.ak5e.casterApplied.${appliedKey(caster, useId)}`]: null });
    return { restored: true };
  },
  preview(caster, receipt, entry, target) {
    return record(target, caster, receipt.id) ? `${entry.name}: returns to its destroyed state.` : `${entry.name}: no recorded rebuild remains.`;
  }
};

/* ---------------------------------------------------------------- use plans */

const PLANS = {
  juryRig(actor, state, data) {
    need(casterBranch(actor) === "mech-accord", "Jury Rigging is a Mech-Accord Caster feature.");
    const drone = droneActor(actor, data.droneUuid), n = integer(data.ap, "Repair AP", 1, 12), prof = Number(actor.system.attributes.prof), warnings = [];
    levelWarning(warnings, actor, 3, "Jury Rigging");
    if (n > 2 * prof) warn(warnings, "apCap", `Jury Rigging spends up to ${2 * prof} AP (twice your Proficiency Bonus).`);
    if (data.visible !== true) warn(warnings, "visible", "You did not confirm that you can see the Arts Master.");
    const token = globalThis.fromUuidSync?.(data.droneUuid);
    rangeWarning(warnings, actor, drone, 100, token?.documentName === "Token" ? token : null);
    if (destroyed(drone)) warn(warnings, "destroyed", `${drone.name} is destroyed; it is normally rebuilt as a Long Rest activity.`);
    const ap = artsState(actor);
    if (ap.value < n) warn(warnings, "ap", `${n} AP needed and ${ap.value} remain; AP stays at 0.`);
    const hp = drone.system.attributes.hp, overflow = 8 * n > Number(hp.max) - Number(hp.value);
    return { warnings, title: "Jury Rigging", reading: overflow ? "juryTempHP" : null, apply(next, receipt, reading) {
      const updates = spendAP(actor, next, receipt, n, "Jury Rigging");
      receipt.formula = `${n}d8`; receipt.rollLabel = "Arts Master repair"; receipt.rollFlavor = `Jury Rigging: ${drone.name} recovers Hit Points`;
      receipt.targets = [{ uuid: drone.uuid, name: drone.name, kind: "droneHeal", ready: false, tempMode: reading === "add" ? "additive" : "replace" }];
      receipt.summary = `${drone.name} recovers ${n}d8 Hit Points; any excess becomes Temporary HP. Roll it from this card.`;
      receipt.result = { awaitingRoll: true, formula: receipt.formula, spent: receipt.apSpent.amount };
      return updates;
    } };
  },
  commandDrones(actor, state, data) {
    need(casterBranch(actor) === "mech-accord", "Commanding Arts Masters is a Mech-Accord Caster feature.");
    need(["move", "action"].includes(data.mode), "Command movement or one statblock Action.");
    const uuids = Array.isArray(data.tokenUuids) ? data.tokenUuids : [];
    need(uuids.length > 0 && new Set(uuids).size === uuids.length, "Choose distinct Arts Master tokens.");
    const tokens = uuids.map(uuid => droneToken(actor, uuid)), warnings = [];
    if (data.mode === "move") need(data.destination && [data.destination.x, data.destination.y].every(Number.isFinite), "Choose a map destination.");
    if (game.combat?.started && !ownCasterTurn(actor)) warn(warnings, "turn", "Commanding Arts Masters is a Bonus Action during your Turn, and it is not your Turn.");
    if (uuids.length > droneCap(actor)) warn(warnings, "cap", `You can command ${droneCap(actor) === 1 ? "one Arts Master" : "both Arts Masters"} at once at your level.`);
    for (const token of tokens) {
      rangeWarning(warnings, actor, token.actor, 100, token);
      if (destroyed(token.actor)) warn(warnings, `destroyed_${opaqueKey(token.uuid)}`, `${token.name} is destroyed and cannot act.`);
    }
    return { warnings, title: "Command Arts Masters", apply(next, receipt) {
      next.lastCommand = { turn: casterTurn(actor), mode: data.mode, tokens: uuids, op: receipt.id };
      const names = tokens.map(token => token.name).join(", ");
      if (data.mode === "move") {
        receipt.targets = tokens.map(token => ({ uuid: token.uuid, name: token.name, kind: "tokenMove", to: { x: data.destination.x, y: data.destination.y }, ready: true }));
        receipt.summary = `${names}: move to (${data.destination.x}, ${data.destination.y}). Check the 30-foot hover Speed and path at the table.`;
      } else receipt.summary = `${names}: take one statblock Action. Use each drone's Originium Spark activity; range and target are checked at the table.`;
      receipt.result = { ...next.lastCommand };
      return {};
    } };
  },
  wolfpack(actor, state, data) {
    need(casterBranch(actor) === "mech-accord", "Wolfpack Doctrine is a Mech-Accord Caster feature.");
    const drone = droneActor(actor, data.droneUuid), cast = state.casts?.find(entry => entry.id === data.castId), warnings = [];
    need(cast, "Choose a recorded Art cast.");
    if (!cast.completed) warn(warnings, "castIncomplete", "That Art cast has not been recorded as complete.");
    if (casterTurn(actor) && cast.turn !== casterTurn(actor)) warn(warnings, "turn", "Wolfpack Doctrine responds to an Art cast during the current Turn.");
    if (data.visible !== true) warn(warnings, "visible", "You did not confirm a Creature the drone can see.");
    const link = flag(drone, "artsMaster") ?? {};
    if (link.reactionTurn) warn(warnings, "reaction", `${drone.name} has already used its Reaction before its creator's next Turn.`);
    if (destroyed(drone)) warn(warnings, "destroyed", `${drone.name} is destroyed and cannot react.`);
    if (droneAttackLocked(actor, drone)) warn(warnings, "locked", "Cantrip Duplication prevents this drone's Attacks until your next Turn.");
    const stamp = casterTurn(actor) ?? `outside_${game.time?.worldTime ?? 0}`;
    return { warnings, title: "Wolfpack Doctrine", apply(_next, receipt) {
      receipt.targets = [{ uuid: drone.uuid, name: drone.name, kind: "droneReaction", stamp, ready: true }];
      receipt.summary = `${drone.name} uses its Reaction: make one Originium Spark Attack from its sheet against a Creature it can see.`;
      receipt.result = { droneUuid: drone.uuid, castId: cast.id };
      return {};
    } };
  },
  rebuild(actor, state, data) {
    need(casterBranch(actor) === "mech-accord", "Rebuilding an Arts Master is a Mech-Accord Caster feature.");
    need(typeof data.components === "boolean", "Confirm whether the destroyed Arts Master's components were retained.");
    const drone = droneActor(actor, data.droneUuid), warnings = [], paid = data.components ? 0 : 500, cp = Number(actor.system.currency?.cp ?? 0);
    if (data.restCompleted !== true) warn(warnings, "rest", "Complete the drone rebuild Long Rest activity before rebuilding.");
    if (!destroyed(drone)) warn(warnings, "notDestroyed", `${drone.name} is not destroyed.`);
    if (cp < paid) warn(warnings, "cost", `Replacing missing components costs 500 LMD and ${cp} remain; currency stays at 0.`);
    return { warnings, title: "Rebuild Arts Master", apply(_next, receipt) {
      const updates = {};
      if (paid) {
        const after = Math.max(0, cp - paid);
        receipt.caster = { pool: { path: CP_PATH, before: cp, after, label: "LMD", unit: "" } };
        if (cp < paid) receipt.shortfall = `LMD short by ${paid - cp}`;
        updates[CP_PATH] = after;
      }
      receipt.targets = [{ uuid: drone.uuid, name: drone.name, kind: "droneRebuild", ready: true }];
      receipt.summary = `${drone.name} is rebuilt${paid ? " with replacement components (500 LMD)" : " from its retained components"}.`;
      receipt.result = { rebuilt: drone.uuid, paid };
      return updates;
    } };
  },
  /** Army of One with several levelled Arts this Turn and no GM ruling: the player's reading for this Turn. */
  residualReading(actor, state, data) {
    need(casterBranch(actor) === "mech-accord", "Residual Energy Recyclers is a Mech-Accord Caster feature.");
    const residual = state.residual;
    need(residual?.active && (residual.amounts?.length ?? 0) > 1, "There are not several levelled Arts this Turn to combine.");
    need(["latest", "sum"].includes(data.reading), "Choose the latest Art or the sum.");
    // WORKFLOW.md §3.2: a recorded GM ruling applies and no reading is offered.
    need(ruled(state, "residualStacking") === undefined, "The GM has recorded a ruling for Residual Energy Recyclers; it applies.");
    const warnings = [];
    return { warnings, title: "Residual Energy Recyclers", apply(next, receipt) {
      const amount = data.reading === "sum" ? residual.amounts.reduce((sum, value) => sum + value, 0) : residual.amounts.at(-1);
      next.residual = { ...residual, choice: data.reading, amount, choiceOp: receipt.id, priorAmount: residual.amount, priorChoice: residual.choice ?? null };
      receipt.reading = MECH_READINGS.residualStacking.options.find(option => option.value === data.reading).label;
      receipt.summary = `Arts Master Originium Spark deals ${amount} additional Force Damage until the end of this Turn.`;
      receipt.result = { amount };
      return {};
    } };
  }
};
function cleanup(state, receiptId) {
  state.spends = (state.spends ?? []).filter(entry => entry.id !== receiptId);
  if (state.lastCommand?.op === receiptId) state.lastCommand = null;
  if (state.residual?.choiceOp === receiptId) state.residual = { ...state.residual, amount: state.residual.priorAmount, choice: state.residual.priorChoice, choiceOp: null };
}

/* ---------------------------------------------------------------- Arts Master creation and linking */

/**
 * The owner asks for an Arts Master to be created (or linked); creating a World Actor needs GM permission, so the
 * active GM's client performs it automatically. The cap is a warning (WORKFLOW.md §3.2); without a GM nothing changes.
 */
const droneRelay = createOperationKernel({
  label: "Arts Master request", stateFlag: "casterDroneRelay", requestFlag: "casterDroneRequest", responseFlag: "casterDroneResponse",
  receiptFlag: "casterDroneReceipts", benefitFlag: "casterDroneBenefit", rollFlag: "casterDroneRoll", tagPreset: "custom",
  getState: actor => ({ operations: [], ...structuredClone(flag(actor, "casterDroneRelay") ?? {}) }),
  isMember: actor => casterEnabled(actor) && casterBranch(actor) === "mech-accord",
  perform: async (actor, command, data, _op, state, user = game.user) => {
    const run = async () => {
    if (command === "undoRequest") {
      const receipt = casterState(actor).undo?.find(entry => entry.id === data.useId);
      need(receipt?.undoKind === "droneRequest" && receipt.status !== "undone", "Choose a current Arts Master request receipt to undo.");
      const evidence = droneEvidence(actor, receipt);
      const validEvidence = evidence && evidence.command === receipt.request?.command && stable(evidence.spec) === stable(receipt.request?.spec)
        && evidence.droneUuid === receipt.request?.droneUuid;
      const drone = globalThis.fromUuidSync?.(receipt.request?.droneUuid);
      const provenLink = receipt.request?.command === "link" && casterState(actor).drones.includes(receipt.request.droneUuid)
        && flag(drone, "artsMaster")?.creatorUuid === actor.uuid;
      need(validEvidence || (user.isGM && provenLink), "This Arts Master request has no matching GM-authored evidence; preserve its documents for reconciliation. A GM may still remove this Caster's proven link while preserving the Actor and Tokens.");
      need(!validEvidence || !isLocked({ epoch: evidence.epoch }) || user.isGM, "This Arts Master request is locked because its encounter window ended.");
      return undoDroneRequest(actor, receipt, state);
    }
    // A recorded GM ruling wins over the requester's reading (resolved again on this client).
    const technologyModifier = command === "create" ? mechReading(actor, "technologyModifier", data.reading).value : undefined;
    const options = { managedRequest: true, confirmed: true, operationId: data.operationId, sceneId: data.sceneId, x: data.x, y: data.y, technologyModifier, overrides: data.overrides,
      ...(command === "create" ? droneEvidenceCallbacks(actor, data.operationId, command) : {}) };
    need(["create", "link"].includes(command), "Unknown Arts Master request.");
    const receipt = await prepareDroneRequest(actor, data.operationId, command, data.droneUuid,
      { sceneId: data.sceneId, x: data.x, y: data.y, technologyModifier, overrides: data.overrides,
        overridden: data.overridden, userId: data.requestUserId, gmUserId: game.user.id });
    if (receipt.status !== "complete") {
      const drone = command === "create" ? await createCasterDrone(actor, options)
      : await linkCasterDrone(actor, data.droneUuid, true, { managedRequest: true, overrides: data.overrides });
      await finishDroneRequest(actor, data.operationId, drone, command);
    }
    state.operations = state.operations.slice(-30);
    return state;
    };
    // Direct elected-GM request paths already hold the shared Actor queue; relayed player requests must acquire it here.
    return user?.isGM ? run() : casterStateSerial(actor, run);
  }
});
export const handleDroneRelay = (message, options, userId) => droneRelay.handle(message, options, userId);
export function droneRequestWarnings(actor, command, data = {}) {
  const warnings = [], state = casterState(actor);
  if (command === "create" && state.drones.length >= droneCap(actor)) warn(warnings, "cap", `The source Arts Master cap has been reached (${droneCap(actor)} at this level); a destroyed drone is normally rebuilt instead.`);
  if (command === "link" && !state.drones.includes(data.droneUuid) && state.drones.length >= droneCap(actor)) warn(warnings, "cap", `The Arts Master cap has been reached (${droneCap(actor)} at this level).`);
  return warnings;
}
/** Create or link an Arts Master: directly for a GM, otherwise through the active GM's client. */
export async function requestCasterDrone(actor, command, data = {}) {
  return casterStateSerial(actor, () => requestCasterDroneNow(actor, command, data));
}
async function requestCasterDroneNow(actor, command, data = {}) {
  need(actor?.isOwner && casterEnabled(actor) && casterBranch(actor) === "mech-accord", "Choose an owned, configured Mech-Accord Caster.");
  need(["create", "link"].includes(command), "Choose Create or Link.");
  need(data.confirmed === true, "Confirm the Arts Master request before applying it.");
  const operationId = data.operationId ?? foundry.utils.randomID();
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(operationId), "A stable operation ID is required.");
  const technology = command === "create" ? mechReading(actor, "technologyModifier", data.reading, data.readings) : null;
  const requestDetails = { sceneId: data.sceneId, x: data.x, y: data.y, technologyModifier: technology?.value, overrides: data.overrides };
  const existing = requestReceipt(actor, operationId);
  if (existing) {
    need(existing.undoKind === "droneRequest" && existing.command === "droneRequest", "That operation ID belongs to another Caster use.");
    need(existing.status !== "undone", "That Arts Master request was undone; use a new operation ID for a new request.");
    need(stable(existing.request?.spec) === stable(droneRequestSpec(command, data.droneUuid, requestDetails)), "Retry the original Arts Master request with the same operation choices; no documents changed.");
  }
  // Warnings are checked here, on the requesting client, so "Use anyway" is offered before anything is relayed.
  const overridden = existing ? existing.overridden ?? [] : requireOverrides(droneRequestWarnings(actor, command, data), data.overrides).map(warning => warning.text);
  if (!game.user.isGM) need(game.users?.activeGM, "Not applied yet: no GM is connected to create or link the Arts Master. Nothing was changed; try again when a GM is connected.");
  if (game.user.isGM) need(game.users?.activeGM?.id === game.user.id, "Not applied yet: use the elected GM client so document changes and undo receipts stay authoritative.");
  // A direct-GM retry of a completed receipt must be a read-only replay. Re-running
  // finish would replace its creation-time snapshots with possibly edited documents.
  if (game.user.isGM && existing?.status === "complete") {
    const prior = globalThis.fromUuidSync?.(existing.request?.droneUuid);
    need(prior, "The completed Arts Master request has no Actor document; review its receipt before retrying.");
    return prior;
  }
  const options = { ...data, managedRequest: true, operationId, technologyModifier: technology?.value, confirmed: true,
    ...(command === "create" ? droneEvidenceCallbacks(actor, operationId, command) : {}) };
  await prepareDroneRequest(actor, operationId, command, data.droneUuid,
    { sceneId: data.sceneId, x: data.x, y: data.y, technologyModifier: technology?.value,
      overrides: data.overrides, reading: technology?.source === "player" ? technology.value : null,
      overridden, userId: game.user.id, gmUserId: game.users?.activeGM?.id });
  let result;
  if (game.user.isGM) {
    result = command === "create" ? await createCasterDrone(actor, options) : await linkCasterDrone(actor, data.droneUuid, true, { managedRequest: true, overrides: data.overrides });
    await finishDroneRequest(actor, operationId, result, command);
  }
  else {
    await droneRelay.submit(actor, command, { ...options, confirmation: true, reading: technology?.value,
      readingLabel: technology?.source === "player" ? technology.label : null,
      overridden, requestUserId: game.user.id }, operationId);
    result = { requested: command, operationId };
  }
  const reading = technology?.source === "player" ? technology.label : null;
  if (result && typeof result === "object" && !result.documentName) result.technologyModifier = reading;
  return result;
}

export function registerMech() {
  registerCasterUses({ plans: PLANS, readings: MECH_READINGS, targetKinds: { droneHeal, tokenMove, droneReaction, droneRebuild }, legacyCommands: Object.keys(PLANS),
    undoHandlers: { droneRequest: {
      preview: droneUndoPreview,
      async undo(actor, receipt) {
        const id = `undo_${opaqueKey(receipt.id)}`;
        need(game.user.isGM || game.users?.activeGM, "Not undone yet: no GM is connected to safely change the Arts Master Actor or link.");
        const result = await droneRelay.submit(actor, "undoRequest", { useId: receipt.id, confirmation: true }, id);
        const updated = requestReceipt(actor, receipt.id);
        return { ...result, notes: updated?.undoNotes ?? [] };
      }
    } }, cleanup });
}
