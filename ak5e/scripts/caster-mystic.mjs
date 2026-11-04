/**
 * Mystic Caster branch (Ch.3 L672-720), following WORKFLOW.md §3.2:
 * - the Caster's owner uses the ritual and Potent Cantrip without GM approval;
 * - Potent Cantrip's half Damage is a use receipt: the GM's client applies it to a Creature the
 *   player does not own, and the owner can undo it from its card inside the encounter window;
 * - a retry with the same operation ID replays the recorded result and never spends or damages twice;
 * - nothing is rolled here: the reviewed rolled Damage and the Saving Throw outcome come from the table.
 *
 * `registerMystic()` registers the Mystic Charge pool and the branch use plans on the shared Caster use
 * engine (`caster-primal-splash.mjs`). Once registered, `casterCommand` routes "potent", "beginRitual",
 * "finishRitual" and "cancelRitual" to this module through that engine, so the branch gets the same
 * relay, warnings and undo receipt as the Primal, Splash and Chain branches.
 *
 * Integration contract (owned by the parent extraction, not by this lane):
 * - import { registerMystic, MYSTIC_MANUAL } from "./caster-mystic.mjs" in caster-features.mjs, call
 *   registerMystic() with the other branch registers, and spread MYSTIC_MANUAL into the Mystic view's
 *   manual lines;
 * - remove the old inline Mystic command branches from caster-features.mjs at the same time. Registering
 *   this module while the old `potent`/ritual branches stay reachable would run neither twice (the engine
 *   takes priority) but would leave two sources of truth for the same printed rules.
 */
import { casterLevel, casterBranch, casterState } from "./caster-rules.mjs";
import { casterEnabled, casterTurn } from "./caster-casting.mjs";
import { artsState, integer } from "./arts-rules.mjs";
import { definePool, getPoolDefinition } from "./resource-pools.mjs";
import { flag, values, need, opaqueKey, createOperationKernel } from "./operation-kernel.mjs";
import { registerCasterUses } from "./caster-primal-splash.mjs";
import { resolveDamage } from "./damage-pipeline.mjs";

export const MYSTIC_POOL_ID = "mysticCharge";
export const MYSTIC_AP_PATH = "flags.ak5e.artsPoints.value", MYSTIC_CHARGE_PATH = "flags.ak5e.resourcePools.mysticCharge.value";
export const MYSTIC_COMMANDS = Object.freeze(["potent", "beginRitual", "finishRitual", "cancelRitual"]);
export const RITUAL_AP_MAX = 3, TURBOCHARGER_LEVEL = 10, FEEDBACK_LOOP_LEVEL = 15;

/** Marker written on a target by a Potent Cantrip use, so a relayed replay never damages twice. */
const APPLIED_FLAG = "casterApplied";
const appliedKey = (caster, useId) => opaqueKey(`${useId}:${caster.uuid}`);

/**
 * Printed disclosures the Mystic view must carry (WORKFLOW.md §3.2 §8 and the branch's logged manual
 * boundaries). The parent extraction spreads these into `getCasterView().manual`.
 */
export const MYSTIC_MANUAL = Object.freeze([
  "Mystic Charge, the charging ritual and Potent Cantrip follow WORKFLOW.md §3.2: warnings with Use anyway, changes to Creatures you do not own are applied by the GM's client automatically, and every use is undone from its chat card until the encounter window closes.",
  "The charging ritual needs the printed stationary, concentration-like minute; advance World time before finishing it. The ritual's Arts Points are not an Art cast, so Feedback Loop does not add a Charge for them.",
  "A Mystic burst spends every Charge for one Action Cantrip plus one repeat cast per Charge. Unfinished repeats stay visible for GM review and reconciliation.",
  "Multi-attack Cantrip structure behind Potent Cantrip needs the GM's potentMultiAttack ruling; nothing is averaged or applied automatically."
]);

/** Maximum Mystic Charge by Caster level: 2, and 3 from Turbocharger at 10th level (C3:687,704). */
export const mysticChargeMax = level => integer(level, "Caster level", 0, 20) >= TURBOCHARGER_LEVEL ? 3 : 2;

/**
 * The stored Mystic Charge, clamped to its maximum. A stored value above the cap never reads above it
 * (C3:687,704); the stored document is not rewritten by a read.
 */
export function mysticCharge(actor) {
  need(actor && typeof actor === "object" && typeof actor.getFlag === "function", "Choose a Caster character.");
  const stored = flag(actor, "resourcePools")?.[MYSTIC_POOL_ID]?.value ?? 0;
  const value = Number(stored);
  need(Number.isFinite(value), "The stored Mystic Charge is not a number.");
  const max = mysticChargeMax(casterLevel(actor));
  return { value: Math.min(max, Math.max(0, Math.floor(value))), max };
}

/** Whether the Mystic branch owns this Actor and the pool may be shown. */
export const mysticActive = actor => Boolean(actor) && casterEnabled(actor) && casterBranch(actor) === "mystic";

function requireMystic(actor, level) {
  need(mysticActive(actor) && casterLevel(actor) >= level, `This feature requires mystic level ${level}.`);
}
function currentCast(state, id) {
  need(typeof id === "string" && id !== "", "Choose a recorded Art cast.");
  const cast = state.casts?.find(entry => entry.id === id);
  need(cast?.completed, "Choose a recorded completed cast.");
  return cast;
}
function targetActor(uuid) {
  need(typeof uuid === "string" && uuid !== "", "Choose a Creature.");
  const target = globalThis.fromUuidSync?.(uuid);
  need(target?.documentName === "Actor", "Choose a Creature.");
  return target;
}
function defences(data) {
  need(Number.isFinite(data.reduction) && data.reduction >= 0, "Confirm Damage Reduction before applying Damage.");
  need(typeof data.resistance === "boolean" && typeof data.vulnerability === "boolean" && typeof data.immunity === "boolean",
    "Confirm Resistance, Vulnerability and Immunity before applying Damage.");
  return { reduction: data.reduction, resistance: data.resistance, vulnerability: data.vulnerability, immunity: data.immunity };
}
function ruled(state, key) {
  const record = state.rulings?.[key];
  return record?.source?.trim() && record.value !== undefined ? record.value : undefined;
}

/* ---------------------------------------------------------------- creation-time Potent authorization */

/** These originals are private plan inputs, never a reference to owner-writable Actor flags. */
const potentOriginals = new WeakMap(), potentFlights = new WeakMap();
const sealFlag = "mysticPotentSeal", sealRequestFlag = "mysticPotentSealRequest";
const sealReadyFlag = "mysticPotentSealReady", sealResponseFlag = "mysticPotentSealResponse";
const sameTerms = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function originalMap(actor, maps) {
  if (!maps.has(actor)) maps.set(actor, new Map());
  return maps.get(actor);
}
function potentTerms(actor, state, data) {
  requireMystic(actor, 3);
  const cast = currentCast(state, data.castId);
  need(cast.level === 0, "Potent Cantrip requires a missed Cantrip attack or successful save.");
  need(["miss", "save"].includes(data.outcome), "Potent Cantrip requires a missed Cantrip attack or successful save.");
  if (data.multiAttack === true)
    need(ruled(state, "potentMultiAttack") === true, "Review multi-attack Cantrip damage: record a ruling for potentMultiAttack before automating it.");
  const target = targetActor(data.targetUuid), rolled = integer(data.amount, "Reviewed rolled Damage", 0, 100000);
  need(typeof data.type === "string" && data.type.trim() !== "", "Choose the Cantrip's Damage Type.");
  return { castId: cast.id, castLevel: cast.level, itemId: cast.itemId, targetUuid: target.uuid,
    rolled, half: Math.floor(rolled / 2), type: data.type, defence: defences(data),
    outcome: data.outcome, multiAttack: data.multiAttack === true };
}
function gmSeal(actor, useId) {
  // A seal is authoritative because its DOCUMENT AUTHOR is a GM, not because an Actor flag says so.
  const message = values(game.messages).find(candidate => candidate.author?.isGM
    && flag(candidate, sealFlag)?.casterUuid === actor.uuid && flag(candidate, sealFlag)?.useId === useId);
  return flag(message, sealFlag)?.terms ?? null;
}
const potentSealRelay = createOperationKernel({
  label: "Potent Cantrip authorization", stateFlag: "mysticPotentSeals",
  requestFlag: sealRequestFlag, responseFlag: sealResponseFlag,
  receiptFlag: "mysticPotentSealReceipts", benefitFlag: "mysticPotentSealBenefit", rollFlag: "mysticPotentSealRoll", tagPreset: "custom",
  getState: actor => ({ operations: [], ...structuredClone(flag(actor, "mysticPotentSeals") ?? {}) }),
  isMember: actor => mysticActive(actor),
  perform: async (actor, command, data, _op, state) => {
    need(command === "seal" && typeof data.useId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(data.useId),
      "Choose a valid Potent Cantrip authorization.");
    need(data.input && typeof data.input === "object" && data.input.confirmed === true, "Confirm Potent Cantrip before authorizing it.");
    const terms = potentTerms(actor, casterState(actor), data.input), existing = gmSeal(actor, data.useId);
    if (existing) need(sameTerms(existing, terms), "This Potent use already has different GM-authorized terms.");
    else await ChatMessage.implementation.create({
      content: "Potent Cantrip: original confirmed terms recorded for the automatic GM relay.",
      flags: { ak5e: { [sealFlag]: { casterUuid: actor.uuid, useId: data.useId, terms } } }
    });
    return state;
  }
});
async function submitPotentSeal(actor, useId, input) {
  const request = { actorUuid: actor.uuid, id: useId, command: "seal", data: { useId, input, confirmation: true } };
  const message = await ChatMessage.implementation.create({ content: "Potent Cantrip original confirmed terms",
    whisper: [game.users.activeGM.id, game.user.id], flags: { ak5e: { [sealRequestFlag]: request } } });
  // Dispatch on an explicit update after creation. The normal Caster create listener stays the sole
  // consumer of target-use requests, while this independent transport owns its acknowledgement.
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); Hooks.off("updateChatMessage", listener); };
    const finish = response => {
      if (!response) return;
      cleanup(); response.ok ? resolve(response.result) : reject(new Error(response.error));
    };
    const listener = changed => { if (changed.id === message.id) finish(flag(changed, sealResponseFlag)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Potent authorization timed out; retry this same use.")); }, 15000);
    Hooks.on("updateChatMessage", listener);
    message.update({ [`flags.ak5e.${sealReadyFlag}`]: true }).catch(error => { cleanup(); reject(error); });
    finish(flag(message, sealResponseFlag));
  });
}
function requestPotentSeal(actor, useId) {
  const original = originalMap(actor, potentOriginals).get(useId);
  if (!original || !game.users?.activeGM || game.user.isGM) return;
  const flights = originalMap(actor, potentFlights);
  if (!flights.has(useId)) {
    const pending = submitPotentSeal(actor, useId, original.input);
    flights.set(useId, pending);
    // The use engine reports failures when applying the target. Do not leave an unhandled rejection
    // while its independent Actor write is still in flight.
    pending.catch(() => {});
  }
}
async function potentAuthorization(actor, receipt, entry) {
  await originalMap(actor, potentFlights).get(receipt.id);
  const authorization = gmSeal(actor, receipt.id) ?? originalMap(actor, potentOriginals).get(receipt.id)?.terms;
  need(authorization, "This pending Potent use has no creation-time authorization; review its original roll with the GM.");
  need(sameTerms(authorization, receipt.mysticPotent)
    && sameTerms(authorization, potentTerms(actor, casterState(actor), receipt.data)),
    "The recorded change is not one this Potent use can make: its original authorization changed.");
  need(entry.uuid === authorization.targetUuid && entry.damage?.amount === authorization.half
    && entry.damage.type === authorization.type && sameTerms(defences(entry.damage), authorization.defence),
    "The recorded change is not one this Potent use can make: its original authorization changed.");
  return authorization;
}
let sealHooks = false;
function registerPotentSealHooks() {
  if (sealHooks || !globalThis.Hooks?.on) return;
  sealHooks = true;
  Hooks.on("updateChatMessage", (message, _changes, options, userId) => {
    const request = flag(message, sealRequestFlag);
    if (!request || !game.user.isGM || !flag(message, sealReadyFlag) || flag(message, sealResponseFlag)) return;
    const actor = globalThis.fromUuidSync?.(request.actorUuid);
    if (!actor) return;
    const pending = potentSealRelay.handle(message, options, userId);
    originalMap(actor, potentFlights).set(request.data?.useId, pending);
    pending.catch(() => {});
  });
  // Retrying a no-GM pending use resends the private ORIGINAL choices, never the edited receipt.
  // This is explicit retry, not a background queue. After client reload, an unsealed pending refuses.
  Hooks.on("preCreateChatMessage", (_message, data) => {
    const request = data?.flags?.ak5e?.casterRelayRequest;
    if (!request || request.command !== "apply") return;
    const actor = globalThis.fromUuidSync?.(request.actorUuid);
    if (actor) requestPotentSeal(actor, request.data?.useId);
  });
}

/* ---------------------------------------------------------------- target change: Potent half Damage */

/**
 * Potent Cantrip Damage on a Creature: halve the reviewed rolled Damage, then let the normal Damage
 * pipeline apply DR, Resistance, Vulnerability and Temporary HP. `C3:694` says the Creature "still takes
 * half of the Cantrip's Damage, but suffers no additional effects"; nothing else is written here.
 */
const POTENT_KIND = {
  documentName: "Actor",
  commands: ["potent"],
  async apply(caster, useId, entry, target) {
    const key = appliedKey(caster, useId), done = flag(target, APPLIED_FLAG)?.[key];
    if (done) return done;
    const receipt = casterState(caster).undo?.find(candidate => candidate.id === useId);
    need(receipt, "No recorded Potent Cantrip use matches this change.");
    const authorization = await potentAuthorization(caster, receipt, entry);
    const damage = { ...authorization.defence, type: authorization.type };
    const amount = authorization.half;
    // The first application is derived only from original confirmed terms, independently of the receipt.
    const hp = target.system?.attributes?.hp;
    need(hp && Number.isFinite(Number(hp.value)), "This Creature has no reviewed Hit Points.");
    const result = resolveDamage({ amount: damage.immunity ? 0 : amount, type: damage.type, reduction: damage.reduction, resistance: damage.resistance,
      vulnerability: damage.vulnerability, hp });
    need(!result.requiresGM, "This target has several Damage Reduction sources; apply this Damage manually.");
    // The GM-side authorization stamp: the applied terms frozen onto the Creature, outside the Caster flags
    // its owner can write. Later relays validate against this stamp, so a receipt edited afterwards — even
    // consistently across every owner-writable copy — no longer matches and refuses.
    const auth = structuredClone(authorization);
    const record = { hpLost: Number(hp.value) - result.newHp, tempLost: Number(hp.temp ?? 0) - result.newTemp, value: result.newHp, temp: result.newTemp, auth };
    await target.update({ "system.attributes.hp.value": result.newHp, "system.attributes.hp.temp": result.newTemp, [`flags.ak5e.${APPLIED_FLAG}.${key}`]: record });
    return record;
  },
  async revert(caster, useId, _entry, target) {
    const key = appliedKey(caster, useId), record = flag(target, APPLIED_FLAG)?.[key];
    if (!record) return { restored: 0 };
    const hp = target.system?.attributes?.hp;
    need(hp && Number.isFinite(Number(hp.value)), "This Creature has no reviewed Hit Points.");
    const max = Number(hp.max), value = Math.min(Number.isFinite(max) ? max : Infinity, Number(hp.value) + Number(record.hpLost));
    const temp = Number(hp.temp ?? 0) + Number(record.tempLost);
    await target.update({ "system.attributes.hp.value": value, "system.attributes.hp.temp": temp, [`flags.ak5e.${APPLIED_FLAG}.${key}`]: null });
    return { restored: record.hpLost, temp: record.tempLost };
  },
  preview(caster, receipt, entry, target) {
    const record = flag(target, APPLIED_FLAG)?.[appliedKey(caster, receipt.id)], hp = target?.system?.attributes?.hp;
    if (!record) return `${entry.name}: no recorded Hit Point change remains.`;
    const line = `${entry.name}: adds back ${record.hpLost} Hit Points${record.tempLost ? ` and ${record.tempLost} Temporary HP` : ""}.`;
    if (Number(hp?.value) !== record.value || Number(hp?.temp ?? 0) !== record.temp)
      return `${line} ${entry.name}'s Hit Points changed after this use (now ${hp?.value}, then ${record.value}); the lost amount is added back, not the earlier total.`;
    return line;
  },
  // Structural checks run before any target write. Actor receipts, input snapshots and cast markers
  // are all owner-writable; they are consistency checks, not authority. apply() also checks the original
  // private plan or GM-authored creation seal, and later relays check the target's GM-stamped terms.
  validate(caster, receipt, entry, target) {
    need(receipt?.command === "potent", "That change does not belong to this kind of use.");
    const record = receipt.mysticPotent;
    need(record && typeof record === "object", "The recorded change is not one this use can make.");
    need(entry?.uuid === record.targetUuid && target?.uuid === record.targetUuid, "The recorded change is not one this Potent use can make.");
    need(Number.isInteger(record.rolled) && record.rolled >= 0 && record.rolled <= 100000
      && Number.isInteger(record.half) && record.half === Math.floor(record.rolled / 2), "The recorded change is not one this Potent use can make.");
    const amount = entry?.damage?.amount;
    need(Number.isInteger(amount) && amount === record.half, `The relayed Damage is not the recorded half (${record.half}) of the Cantrip's ${record.rolled}.`);
    need(entry.damage.type === record.type, "The relayed Damage Type is not the one recorded for this Cantrip.");
    const defence = record.defence ?? {};
    need(entry.damage.reduction === defence.reduction && entry.damage.resistance === defence.resistance
      && entry.damage.vulnerability === defence.vulnerability && entry.damage.immunity === defence.immunity,
      "The relayed defenses are not the ones recorded for this Cantrip.");
    // The engine snapshots the use's inputs onto its own receipt: the relayed change must agree with that
    // snapshot, so editing the plan's derived copies alone is never enough.
    const input = receipt.data ?? {};
    need(input.castId === record.castId && input.targetUuid === record.targetUuid && input.amount === record.rolled
      && ["miss", "save"].includes(input.outcome), "The recorded change is not one this Potent use can make.");
    // Re-derive the Cantrip from the cast record and the known Art: the cast must still be a completed
    // Cantrip cast, its Art must still be a known Cantrip, and the cast must bear this use's plan-written
    // review marker. A hand-forged receipt reusing a genuine cast has no marker and refuses here.
    const cast = casterState(caster).casts?.find(candidate => candidate.id === record.castId && candidate.completed);
    need(cast && Number(cast.level) === 0 && Number(cast.level) === record.castLevel, "The recorded Cantrip cast is no longer valid for Potent Cantrip.");
    const item = caster.items?.get?.(record.itemId);
    need(item?.type === "spell" && Number(item.system?.level) === 0, "The recorded Cantrip is no longer a known Cantrip; review it with the GM.");
    const mark = (cast.potentUses ?? []).find(marker => marker?.useId === receipt.id);
    need(mark && mark.rolled === record.rolled && mark.half === record.half && mark.type === record.type
      && mark.defence?.reduction === defence.reduction && mark.defence?.resistance === defence.resistance
      && mark.defence?.vulnerability === defence.vulnerability && mark.defence?.immunity === defence.immunity,
      "The recorded change is not one this Potent use can make.");
    // AUTHORITATIVE basis: once the applying client stamped this use's authorization onto the Creature
    // (outside the Caster flags its owner can write), every later relay must match that stamp. A receipt
    // rewritten afterwards — even consistently across receipt, inputs, cast and marker — refuses here.
    const stamp = flag(target, APPLIED_FLAG)?.[appliedKey(caster, receipt.id)]?.auth ?? null;
    if (stamp) need(stamp.rolled === record.rolled && stamp.half === record.half && stamp.type === record.type
      && stamp.castId === record.castId && stamp.targetUuid === record.targetUuid
      && stamp.defence?.reduction === defence.reduction && stamp.defence?.resistance === defence.resistance
      && stamp.defence?.vulnerability === defence.vulnerability && stamp.defence?.immunity === defence.immunity,
      "The recorded change no longer matches the GM-applied authorization for this use; review it with the GM.");
    return true;
  }
};

/* ---------------------------------------------------------------- ritual undo */

/**
 * A ritual receipt changes three values: the pending ritual, the Arts Points and the Mystic Charge.
 * Undo restores all three exactly, and refuses when any of them changed after the use.
 */
const RITUAL_UNDO = {
  preview(actor, receipt) {
    const record = receipt.mystic, lines = [];
    if (!record) return ["This ritual has no recorded before-state."];
    lines.push(`Restores ${record.before.ap} Arts Points.`);
    const gain = record.after.charge - record.before.charge;
    if (gain > 0) lines.push(`Removes ${gain} Mystic Charge gained by the ritual.`);
    if (record.before.ritual) lines.push("Reopens the pending charging ritual from its recorded start.");
    else if (record.after.ritual) lines.push("Clears the pending charging ritual.");
    return lines;
  },
  async undo(actor, receipt) {
    const record = receipt.mystic;
    need(record?.before && record?.after, "This ritual has no recorded before-state; review it with the GM.");
    const state = casterState(actor), charge = mysticCharge(actor), arts = artsState(actor);
    need(arts.value === record.after.ap, "The Arts Points changed after this ritual; review it before undoing.");
    need(charge.value === record.after.charge, "The Mystic Charge changed after this ritual; review it before undoing.");
    need((state.ritual?.start ?? null) === (record.after.ritual?.start ?? null), "The charging ritual changed after this use; review it before undoing.");
    state.ritual = record.before.ritual ? structuredClone(record.before.ritual) : null;
    await actor.update({ "flags.ak5e.caster": state, [MYSTIC_AP_PATH]: record.before.ap, [MYSTIC_CHARGE_PATH]: record.before.charge });
    return { notes: ["Restored the ritual, Arts Points and Mystic Charge from the recorded before-state."] };
  }
};
/** Record the three values a ritual use changes, so its receipt can be undone exactly. */
function ritualRecord(state, actor) {
  return { ritual: structuredClone(state.ritual ?? null), ap: artsState(actor).value, charge: mysticCharge(actor).value };
}
function recordRitual(receipt, before, after) {
  receipt.undoKind = "mysticRitual";
  receipt.mystic = { before: structuredClone(before), after: structuredClone(after) };
}

/* ---------------------------------------------------------------- use plans */

const PLANS = {
  /** Potent Cantrip (C3:694): a missed Cantrip attack or a successful save still takes half Damage. */
  potent(actor, state, data) {
    requireMystic(actor, 3);
    const terms = potentTerms(actor, state, data);
    const cast = currentCast(state, terms.castId), target = targetActor(terms.targetUuid);
    const { rolled, half, defence } = terms;
    return { warnings: [], title: "Potent Cantrip", apply(next, receipt) {
      // The receipt carries the reviewed Cantrip roll and target; the GM relay validates the applied
      // change against them, so a forged or altered amount can never leave the recorded half.
      receipt.mysticPotent = structuredClone(terms);
      originalMap(actor, potentOriginals).set(receipt.id, { terms: structuredClone(terms), input: structuredClone(data) });
      requestPotentSeal(actor, receipt.id);
      // Keep a consistency marker on the completed cast; first-apply authority is the original seal,
      // never this owner-writable marker alone.
      cast.potentUses = [...(cast.potentUses ?? []), { useId: receipt.id, rolled, half, type: data.type, defence: { ...defence } }];
      receipt.targets = [{ uuid: target.uuid, name: target.name, kind: "mysticPotentDamage", ready: true,
        damage: { amount: half, type: data.type, ...defence } }];
      receipt.summary = `${target.name} takes ${half} ${data.type} Damage (half of ${rolled}; the Cantrip suffers no additional effects).`;
      receipt.result = { noAdditionalEffects: true, halved: half, amount: half };
      return {};
    } };
  },
  /** Begin the one-minute charging ritual (C3:685). It records only its start; nothing is spent yet. */
  beginRitual(actor, state) {
    requireMystic(actor, 1);
    need(!state.ritual, "A charging ritual is already pending.");
    const start = Number(game.time?.worldTime);
    need(Number.isFinite(start), "World time is required to time the ritual.");
    const before = ritualRecord(state, actor);
    const positions = (values(actor.getActiveTokens?.(true, true)) ?? []).map(token => {
      const document = token.document ?? token;
      return { uuid: document.uuid, x: document.x, y: document.y, elevation: document.elevation };
    });
    return { warnings: [], title: "Mystic Charge ritual", apply(next, receipt) {
      next.ritual = { start, positions, interrupted: false };
      recordRitual(receipt, before, ritualRecord(next, actor));
      receipt.summary = `Charging ritual begun at World time ${start}. Remain stationary for one minute, as if concentrating on a Spell.`;
      receipt.result = { started: true, start };
      return {};
    } };
  },
  /** Finish the ritual: expend 0-3 Arts Points for 1 Charge each, up to the maximum (C3:685). */
  finishRitual(actor, state, data) {
    requireMystic(actor, 1);
    need(state.ritual && !state.ritual.interrupted, "Start a new uninterrupted charging ritual.");
    need(data.stationary === true && data.concentration === true && data.minuteCompleted === true,
      "Confirm the full stationary, concentration-like minute completed.");
    const ap = integer(data.ap, "Ritual AP", 0, RITUAL_AP_MAX);
    const start = Number(state.ritual.start);
    need(Number.isFinite(start), "The pending ritual has no recorded start time.");
    const now = Number(game.time?.worldTime);
    need(Number.isFinite(now) && now >= start + 60, "Advance World time after the one-minute ritual is completed.");
    const arts = artsState(actor), charge = mysticCharge(actor);
    need(ap <= arts.value, `Not enough AP: ${ap} required.`);
    const after = arts.value - ap, gained = Math.min(charge.max, charge.value + ap);
    const before = ritualRecord(state, actor);
    return { warnings: [], title: "Mystic Charge ritual", apply(next, receipt) {
      next.ritual = null;
      if (ap > 0) receipt.apSpent = { amount: ap, turn: casterTurn(actor), reason: "Mystic Charge ritual" };
      recordRitual(receipt, before, { ritual: null, ap: after, charge: gained });
      receipt.summary = `Ritual completed: ${ap} Arts Point${ap === 1 ? "" : "s"} expended for ${gained - charge.value} Mystic Charge (${gained}/${charge.max}).`;
      receipt.result = { charge: gained };
      return { [MYSTIC_AP_PATH]: after, [MYSTIC_CHARGE_PATH]: gained };
    } };
  },
  /** Cancel always spends nothing (C3:685). */
  cancelRitual(actor, state) {
    requireMystic(actor, 1);
    need(state.ritual, "There is no pending charging ritual to cancel.");
    const before = ritualRecord(state, actor);
    return { warnings: [], title: "Mystic Charge ritual", apply(next, receipt) {
      next.ritual = null;
      recordRitual(receipt, before, ritualRecord(next, actor));
      receipt.summary = "Charging ritual cancelled; no Arts Points were expended.";
      receipt.result = { canceled: true };
      return {};
    } };
  }
};

let registered = false;
/**
 * Register the Mystic pool and use plans on the shared Caster use engine. Pure registry work, so it is
 * safe at import time in the parent (`registerPrimalSplash(); registerChain(); registerMech();` pattern).
 */
export function registerMystic() {
  registerPotentSealHooks();
  if (!getPoolDefinition(MYSTIC_POOL_ID)) definePool({ id: MYSTIC_POOL_ID, label: "Mystic Charge", max: { 1: 2, 10: 3 }, initial: 0,
    classId: "class-caster", levelBasis: "classLevel",
    appliesTo: actor => casterEnabled(actor) && casterBranch(actor) === "mystic", recovery: [{ on: "lr", amount: "toInitial" }] });
  registerCasterUses({ plans: PLANS, targetKinds: { mysticPotentDamage: POTENT_KIND }, undoHandlers: { mysticRitual: RITUAL_UNDO } });
  registered = true;
  return { registered, commands: [...MYSTIC_COMMANDS] };
}

/** Test and integration helper: whether this module's plans are installed on the engine. */
export const mysticRegistered = () => registered;
