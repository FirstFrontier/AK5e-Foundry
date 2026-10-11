/**
 * Primal (Ch.3 L725–812) and Splash (Ch.3 L818–873) Caster branch helpers, following WORKFLOW.md §3.2:
 * - the Caster's owner uses every feature without GM approval; source problems are warnings with "Use anyway";
 * - a missing GM ruling is resolved by the player's reading for that use only;
 * - changes to an unowned target are relayed to the active GM's client, which applies them automatically;
 * - the player rolls Debilitate and Destroy's dice by clicking;
 * - every use keeps an undo receipt for its encounter window.
 * Each use is one receipt in `flags.ak5e.caster.undo`; a retry with the same operation ID resumes it.
 */
import { casterLevel, casterBranch, casterState } from "./caster-rules.mjs";
import { casterEnabled, casterTurn, ownCasterTurn } from "./caster-casting.mjs";
import { applyFeatureTag } from "./feature-tags.mjs";
import { artsState, integer } from "./arts-rules.mjs";
import { createOperationKernel, flag, values, need, opaqueKey, esc, keyedSerial } from "./operation-kernel.mjs";
import { definePool, getPool, getPoolDefinition } from "./resource-pools.mjs";
import { resolveDamage } from "./damage-pipeline.mjs";
import { requireOverrides, resolveReading, currentEpoch, isLocked } from "./play-undo.mjs";
import { emitAk5eEvent } from "./trigger-events.mjs";

/** Residual Suffering table (Ch.3 L734-747). Poison has no row and is deliberately absent (DECISIONS.md). */
export const PRIMAL_CONDITIONS = Object.freeze({ acid: "ak5e-corroded", bludgeoning: "frightened", cold: "ak5e-frozen", fire: "ak5e-burning",
  force: "blinded", lightning: "ak5e-nervous-impairment", necrotic: "ak5e-necrotised", piercing: "ak5e-bleeding", psychic: "charmed",
  radiant: "blinded", slashing: "ak5e-bleeding", thunder: "frightened" });
export const PRIMAL_CONDITION_NAMES = Object.freeze({ "ak5e-corroded": "Corroded", frightened: "Frightened", "ak5e-frozen": "Frozen", "ak5e-burning": "Burning",
  blinded: "Blinded", "ak5e-nervous-impairment": "Nervous Impairment", "ak5e-necrotised": "Necrotised", "ak5e-bleeding": "Bleeding", charmed: "Charmed" });
/** Enduring Affliction additional effects (Ch.3 L784-794), added to the Condition. Only Charmed has an unambiguous native change. */
export const ENDURING_AFFLICTION = Object.freeze({
  "ak5e-bleeding": "The dice is increased one step to d8, from d6. When the Condition is removed, the Creature loses 2d8 Hit Points.",
  blinded: "The Creature glows with 10ft of Blinding Light, cannot become Invisible, and cannot take the Hide Action.",
  "ak5e-burning": "The Creature takes 1d8 additional Fire Damage, and cannot gain Hit Points.",
  charmed: "The Creature's Speed is reduced to 0.",
  "ak5e-corroded": "The Creature's DR is set to 0.",
  frightened: "The Creature has Disadvantage on Attack Rolls.",
  "ak5e-frozen": "The Creature automatically fails Dexterity Saving Throws.",
  "ak5e-necrotised": "The Creature cannot take Reactions.",
  "ak5e-nervous-impairment": "The Creature loses 3 Hit Points the first time it moves each Turn, takes an Action, or takes a Bonus Action."
});
const SPEED_ZERO = ["walk", "fly", "swim", "climb", "burrow"].map(type => ({ key: `system.attributes.movement.${type}`, mode: 5, value: "0" }));
const PRIMAL_FEATURES = Object.freeze({ residual: "subclass-feature-caster-primal-1st-level-residual-suffering-289",
  burst: "subclass-feature-caster-primal-6th-level-elemental-burst-1773" });
const DEBILITATE_POLICIES = Object.freeze({ bypassDRResist: { bypassDR: true, bypassResistance: true, bypassTemp: false },
  bypassAll: { bypassDR: true, bypassResistance: true, bypassTemp: true } });
/** Readings offered when the GM has not ruled (DECISIONS.md "Primal and Splash branches"). Values match recordable rulings. */
export const PRIMAL_SPLASH_READINGS = Object.freeze({
  debilitateLoss: { label: "How Debilitate and Destroy's Hit Point loss meets defenses", options: [
    { value: "bypassDRResist", label: "Ignores DR and Resistance; Temporary HP absorbs it" },
    { value: "bypassAll", label: "Ignores DR, Resistance and Temporary HP" }] },
  safeZoneVsMaximumBurst: { label: "A Safe Zone Creature hit by a Maximum Burst Art", options: [
    { value: "safeZone", label: "Safe Zone: no Damage" },
    { value: "maximumBurst", label: "Maximum Burst: at least half the rolled Damage" }] }
});
export const PRIMAL_SPLASH_COMMANDS = Object.freeze(["residual", "debilitate", "debilitateRoll", "useRoll", "elementalBurst", "burstCondition", "splashCantrip", "undoUse"]);
/** One per-Actor mutation queue shared by every Caster branch and external request receipt. */
export const casterStateSerial = keyedSerial();
/** Readings, target kinds and ledgers registered by other §3.2 Caster branch modules (for example caster-chain.mjs). */
const READINGS = { ...PRIMAL_SPLASH_READINGS }, TARGET_KINDS = {}, LEDGER_CLEANUPS = [], EXTRA_COMMANDS = new Set(), UNDO_HANDLERS = {};
/** The document a target change writes: an Actor unless the registered kind says otherwise (a drone's Token). */
const targetDocument = entry => TARGET_KINDS[entry.kind]?.documentName ?? "Actor";
const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const RESIDUAL_POOL_PATH = "flags.ak5e.resourcePools.residualSuffering.value";
function retainUndoWindow(receipts) {
  const locked = receipts.filter(isLocked).slice(-60), current = receipts.filter(entry => !isLocked(entry));
  return [...locked, ...current];
}

export function residualSuffering(actor) {
  if (casterBranch(actor) !== "primal" || !getPoolDefinition("residualSuffering")) return null;
  return getPool(actor, "residualSuffering");
}
export function casterSpellDC(actor) {
  const native = Number(actor.system?.attributes?.spell?.dc);
  if (Number.isFinite(native) && native > 0) return native;
  const ability = artsState(actor).ability;
  return 8 + Number(actor.system?.attributes?.prof ?? 0) + Number(actor.system?.abilities?.[ability]?.mod ?? 0);
}
function castDamageTypes(actor, cast) {
  const item = actor.items.get(cast.itemId);
  return [...new Set(values(item?.system?.activities).flatMap(activity => values(activity.damage?.parts).flatMap(part => values(part.types))))];
}
function actorAt(uuid, label = "the target") {
  const target = globalThis.fromUuidSync?.(uuid);
  need(target?.documentName === "Actor", `Choose ${label}.`);
  return target;
}
const canWrite = target => game.user.isGM || target.isOwner;
const ruled = (state, key) => { const record = state.rulings?.[key]; return record?.source?.trim() && record.value !== undefined ? record.value : undefined; };
const warn = (list, id, text) => list.push({ id, text });
function levelWarning(warnings, actor, level, feature) {
  if (casterLevel(actor) < level) warn(warnings, "level", `${feature} is a level ${level} feature; this Caster is level ${casterLevel(actor)}.`);
}
/** Preconditions of applyPrimalCondition, checked before a receipt is saved so a missing Item or status cannot lock the Caster. */
function primalConditionReady(actor, status, origin) {
  need(values(actor.items).some(entry => flag(entry, "chapterThreeId") === PRIMAL_FEATURES[origin]), "Run Caster setup to add this Primal feature Item first.");
  need(values(globalThis.CONFIG?.statusEffects).some(effect => effect.id === status),
    `The ${PRIMAL_CONDITION_NAMES[status]} Condition is not registered. Enable "Enable Chapter 1 rule support" in the World settings and reload.`);
}
/** One Residual Suffering or Elemental Burst Condition, until the end of the Caster's next Turn. A retry reuses the applied effect. */
async function applyPrimalCondition(actor, target, status, opId, origin) {
  const existing = values(target.effects).find(effect => flag(effect, "casterPrimal")?.opId === opId && flag(effect, "casterPrimal")?.casterUuid === actor.uuid);
  if (existing) return existing;
  const item = values(actor.items).find(entry => flag(entry, "chapterThreeId") === PRIMAL_FEATURES[origin]);
  need(item, "Run Caster setup to add this Primal feature Item first.");
  const overlay = casterLevel(actor) >= 10 ? ENDURING_AFFLICTION[status] : null, name = PRIMAL_CONDITION_NAMES[status];
  const combatant = game.combat?.started && values(game.combat.turns).some(c => c.actor?.uuid === actor.uuid);
  const effect = await applyFeatureTag(actor, item, target, {
    label: `${name} (${origin === "burst" ? "Elemental Burst" : "Residual Suffering"})`, condition: status,
    trigger: combatant ? "nextTurnEnd" : "manual", expiryActor: "source",
    instructions: [`${name} until the end of ${actor.name}'s next Turn.`, combatant ? "" : "Outside combat, remove it manually at the end of the Caster's next Turn.",
      overlay ? `Enduring Affliction (resolve at the table unless shown as a native change): ${overlay}` : ""].filter(Boolean).join(" "),
    replacement: { family: `primal:${status}:${actor.uuid}`, scope: "target" },
    changes: overlay && status === "charmed" ? SPEED_ZERO : [] });
  try { await effect.update({ "flags.ak5e.casterPrimal": { opId, casterUuid: actor.uuid, status, origin, overlay: !!overlay } }); }
  catch (error) { await effect.delete(); throw error; }
  return effect;
}

/* ---------------------------------------------------------------- target changes (local or relayed) */

const appliedKey = (caster, useId) => opaqueKey(`${useId}:${caster.uuid}`);
/** Apply one recorded target change. Idempotent: a condition is matched by its use, HP by the target's applied record. */
async function applyTargetChange(caster, useId, entry, target) {
  if (TARGET_KINDS[entry.kind]) return TARGET_KINDS[entry.kind].apply(caster, useId, entry, target);
  if (entry.kind === "condition") { await applyPrimalCondition(caster, target, entry.status, useId, entry.origin); return null; }
  const key = appliedKey(caster, useId), done = flag(target, "casterApplied")?.[key];
  if (done) return done;
  const hp = target.system.attributes.hp, result = resolveDamage({ ...entry.damage, hp });
  need(!result.requiresGM, "This target has several Damage Reduction sources; apply this Damage manually.");
  const record = { hpLost: Number(hp.value) - result.newHp, tempLost: Number(hp.temp ?? 0) - result.newTemp, value: result.newHp, temp: result.newTemp };
  await target.update({ "system.attributes.hp.value": result.newHp, "system.attributes.hp.temp": result.newTemp, [`flags.ak5e.casterApplied.${key}`]: record });
  return record;
}
/** Reverse one target change by delta: delete the use's Condition, or add back the Hit Points and Temporary HP it removed. */
async function revertTargetChange(caster, useId, entry, target) {
  if (TARGET_KINDS[entry.kind]) return TARGET_KINDS[entry.kind].revert(caster, useId, entry, target);
  if (entry.kind === "condition") {
    const effects = values(target.effects).filter(effect => flag(effect, "casterPrimal")?.opId === useId && flag(effect, "casterPrimal")?.casterUuid === caster.uuid);
    if (effects.length) await target.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    return { removed: effects.length };
  }
  const key = appliedKey(caster, useId), record = flag(target, "casterApplied")?.[key];
  if (!record) return { restored: 0 };
  const hp = target.system.attributes.hp, max = Number(hp.max);
  const value = Math.min(Number.isFinite(max) ? max : Infinity, Number(hp.value) + record.hpLost), temp = Number(hp.temp ?? 0) + record.tempLost;
  await target.update({ "system.attributes.hp.value": value, "system.attributes.hp.temp": temp, [`flags.ak5e.casterApplied.${key}`]: null });
  return { restored: record.hpLost, temp: record.tempLost };
}
/** Which uses may record each built-in target kind; registered kinds declare `commands` and a GM-side `validate`. */
const BUILTIN_KIND_COMMANDS = Object.freeze({ condition: ["residual", "burstCondition"], hp: ["debilitate", "damage"] });
/**
 * A receipt lives in a flag its owner can write, so the GM's client re-checks that the recorded change is one the
 * recorded use could make: the kind belongs to the command, and the kind's own validation (for example a drone
 * linked to this Caster, a heal no larger than its dice) passes. This keeps the relay from carrying arbitrary updates.
 */
function relayAllowed(caster, receipt, entry, target) {
  const kind = TARGET_KINDS[entry.kind], allowed = kind?.commands ?? BUILTIN_KIND_COMMANDS[entry.kind];
  need(allowed?.includes(receipt.command), "That change does not belong to this kind of use.");
  if (receipt.command === "debilitate") {
    const dice = Number(String(receipt.formula ?? "").split("d")[0]);
    need(Number.isInteger(dice) && dice >= 1 && dice <= 3 && Number(entry.damage?.amount) === Number(receipt.roll) && receipt.roll <= dice * 8, "That Hit Point loss does not match its recorded roll.");
  }
  if (kind?.validate) need(kind.validate(caster, receipt, entry, target) !== false, "The recorded change is not one this use can make.");
}
/**
 * GM-client half of the relay. Only a change recorded in the Caster's own use receipt can be applied or reversed,
 * and `relayAllowed` re-checks it, so the relay never carries an arbitrary document update.
 */
export async function relayedTargetChange(caster, command, data, user = game.user) {
  need(["apply", "revert"].includes(command), "Unknown relayed Caster change.");
  const receipt = casterState(caster).undo?.find(entry => entry.id === data.useId);
  need(receipt, "No recorded Caster use matches this relayed change.");
  const entry = receipt.targets?.find(change => change.uuid === data.targetUuid);
  need(entry, "That Creature is not part of the recorded use.");
  if (command === "apply") need(receipt.status !== "undone" && entry.ready, "That change is not ready to apply.");
  else need(!isLocked(receipt) || user.isGM, "This use is locked: its encounter window has ended.");
  const target = await globalThis.fromUuid(entry.uuid);
  if (!target && command === "revert") return { missing: true };
  need(target?.documentName === targetDocument(entry), "The target no longer exists.");
  if (command === "apply") relayAllowed(caster, receipt, entry, target);
  return command === "apply" ? applyTargetChange(caster, receipt.id, entry, target) : revertTargetChange(caster, receipt.id, entry, target);
}
const relay = createOperationKernel({
  label: "Caster target change", stateFlag: "casterRelay", requestFlag: "casterRelayRequest", responseFlag: "casterRelayResponse",
  receiptFlag: "casterRelayReceipts", benefitFlag: "casterRelayBenefit", rollFlag: "casterRelayRoll", tagPreset: "custom",
  getState: actor => ({ operations: [], ...structuredClone(flag(actor, "casterRelay") ?? {}) }),
  isMember: actor => casterEnabled(actor),
  perform: async (actor, command, data, _op, state, user) => {
    await relayedTargetChange(actor, command, data, user);
    state.operations = state.operations.slice(-60);
    return state;
  }
});
export const handleCasterRelay = (message, options, userId) => relay.handle(message, options, userId);

class NoGM extends Error {}
/** Change one target: directly when this user may write it, otherwise through the active GM's client. */
async function changeTarget(caster, receipt, entry, command) {
  const target = await globalThis.fromUuid(entry.uuid);
  // A deleted target (for example a removed drone token) leaves nothing to revert; the rest of the undo still runs.
  if (!target && command === "revert") return { missing: true };
  need(target?.documentName === targetDocument(entry), "The target no longer exists.");
  if (canWrite(target)) return command === "apply" ? applyTargetChange(caster, receipt.id, entry, target) : revertTargetChange(caster, receipt.id, entry, target);
  if (!game.users?.activeGM) throw new NoGM("No GM is connected.");
  await relay.submit(caster, command, { useId: receipt.id, targetUuid: entry.uuid, confirmation: true }, `${receipt.id}-${command[0]}-${opaqueKey(entry.uuid)}`);
  entry.relayed = true;
  return command === "apply" ? flag(target, "casterApplied")?.[appliedKey(caster, receipt.id)] ?? null : null;
}

/* ---------------------------------------------------------------- use plans */

function currentCastOf(state, id) { const cast = state.casts?.find(entry => entry.id === id); need(cast, "Choose a recorded cast."); return cast; }

const PLANS = {
  residual(actor, state, data) {
    need(casterBranch(actor) === "primal", "Residual Suffering is a Primal Caster feature.");
    const cast = currentCastOf(state, data.castId), target = actorAt(data.targetUuid);
    need(["hit", "failedSave", "succeededSave"].includes(data.outcome), "Choose the qualifying result.");
    need(data.damageType !== "poison", "Residual Suffering has no Poison row, so there is no Condition to apply (see DECISIONS.md).");
    const status = PRIMAL_CONDITIONS[data.damageType]; need(status, "Choose a Damage Type from the Residual Suffering table.");
    primalConditionReady(actor, status, "residual");
    const warnings = [], key = `${cast.id}:${opaqueKey(target.uuid)}`, pool = residualSuffering(actor), name = PRIMAL_CONDITION_NAMES[status];
    need(pool, "Residual Suffering has no use pool on this Actor; run Caster setup.");
    if (!cast.completed) warn(warnings, "castIncomplete", "That Art cast has not been recorded as complete.");
    if (data.outcome === "succeededSave" && casterLevel(actor) < 15) warn(warnings, "sufferingUnmatched", "A successful Saving Throw needs Suffering Unmatched (Primal level 15).");
    if (!castDamageTypes(actor, cast).includes(data.damageType)) warn(warnings, "damageType", `That Art's activities do not list ${data.damageType} Damage.`);
    if ((state.primal?.residual ?? []).some(entry => entry.key === key)) warn(warnings, "repeat", "Residual Suffering was already applied to this Creature from that Art.");
    if (pool.value < 1) warn(warnings, "noUses", "No Residual Suffering uses remain until a Long Rest; the count stays at 0.");
    return { warnings, title: "Residual Suffering", apply(next, receipt) {
      next.primal ??= {}; next.primal.residual = [...(next.primal.residual ?? []), { key, op: receipt.id }].slice(-80);
      const after = Math.max(0, pool.value - 1);
      receipt.caster = { pool: { path: RESIDUAL_POOL_PATH, before: pool.value, after } };
      if (pool.value < 1) receipt.shortfall = "Residual Suffering uses short by 1";
      receipt.targets = [{ uuid: target.uuid, name: target.name, kind: "condition", status, origin: "residual", ready: true }];
      receipt.summary = `${name} on ${target.name} until the end of ${actor.name}'s next Turn.`;
      receipt.result = { condition: name, targetUuid: target.uuid, remaining: after };
      return { [RESIDUAL_POOL_PATH]: after };
    } };
  },
  debilitate(actor, state, data) {
    need(casterBranch(actor) === "primal", "Debilitate and Destroy is a Primal Caster feature.");
    const target = actorAt(data.targetUuid), warnings = [];
    levelWarning(warnings, actor, 3, "Debilitate and Destroy");
    if (data.damageDealt !== true) warn(warnings, "damageDealt", "You did not confirm dealing Damage to this Creature.");
    if (data.negativeConfirmed !== true) warn(warnings, "negative", "You did not confirm that this Creature has a negative Status Condition.");
    const turn = casterTurn(actor) ?? `outside_${game.time?.worldTime ?? 0}`, key = opaqueKey(target.uuid);
    const ledger = state.primal?.debilitated?.turn === turn ? state.primal.debilitated.targets : [];
    if (ledger.some(entry => entry.key === key)) warn(warnings, "repeat", "Debilitate and Destroy already affected this Creature this Turn.");
    const level = casterLevel(actor), dice = level >= 14 ? 3 : level >= 7 ? 2 : 1;
    return { warnings, title: "Debilitate and Destroy", reading: "debilitateLoss", apply(next, receipt, reading) {
      next.primal ??= {};
      if (next.primal.debilitated?.turn !== turn) next.primal.debilitated = { turn, targets: [] };
      next.primal.debilitated.targets = [...next.primal.debilitated.targets, { key, op: receipt.id }];
      receipt.formula = `${dice}d8`;
      receipt.targets = [{ uuid: target.uuid, name: target.name, kind: "hp", ready: false, damage: { kind: "hpLoss", policy: DEBILITATE_POLICIES[reading] } }];
      receipt.summary = `${target.name} loses ${dice}d8 Hit Points. Roll it from this card.`;
      receipt.result = { awaitingRoll: true, formula: receipt.formula, dice };
      return {};
    } };
  },
  elementalBurst(actor, state, data) {
    need(casterBranch(actor) === "primal", "Elemental Burst is a Primal Caster feature.");
    need(Object.hasOwn(PRIMAL_CONDITION_NAMES, data.condition), "Choose a Condition listed in Residual Suffering.");
    primalConditionReady(actor, data.condition, "burst");
    const warnings = [];
    levelWarning(warnings, actor, 6, "Elemental Burst");
    if (state.uses?.elementalBurst) warn(warnings, "used", "Elemental Burst has been used since your last Short Rest.");
    if (game.combat?.started && !ownCasterTurn(actor)) warn(warnings, "turn", "Elemental Burst is a Bonus Action during your Turn, and it is not your Turn.");
    const improved = casterLevel(actor) >= 15, dc = casterSpellDC(actor) + (improved ? 5 : 0), name = PRIMAL_CONDITION_NAMES[data.condition];
    return { warnings, title: "Elemental Burst", apply(next, receipt) {
      receipt.caster = { uses: { elementalBurst: next.uses?.elementalBurst ?? false } };
      next.uses.elementalBurst = true;
      next.primal ??= {}; next.primal.burst = { id: receipt.id, turn: casterTurn(actor), status: data.condition, dc, applied: [] };
      receipt.summary = `Bonus Action. Each Creature in a 20-foot-radius Sphere centred on a point ${esc(actor.name)} can see within 100 feet must succeed on [[/save ability=dex dc=${dc}]]${improved ? " (Improved Elemental Burst: +5)" : ""} or suffer <strong>${esc(name)}</strong> until the end of ${esc(actor.name)}'s next Turn. Place the area with Foundry's template tools, then apply the Condition to each Creature that failed from the Caster panel.`;
      receipt.html = true;
      receipt.result = { burstId: receipt.id, dc, condition: name };
      return {};
    } };
  },
  burstCondition(actor, state, data) {
    need(casterBranch(actor) === "primal", "Elemental Burst is a Primal Caster feature.");
    const burst = state.primal?.burst; need(burst && burst.id === data.burstId, "Choose the current Elemental Burst.");
    const target = actorAt(data.targetUuid), key = opaqueKey(target.uuid), warnings = [];
    primalConditionReady(actor, burst.status, "burst");
    if (burst.turn && burst.turn !== casterTurn(actor)) warn(warnings, "turn", "Elemental Burst Conditions are normally applied during the Turn it was used.");
    if (data.failedSave !== true) warn(warnings, "failedSave", "You did not confirm that this Creature failed its Dexterity Saving Throw.");
    if (burst.applied.some(entry => entry.key === key)) warn(warnings, "repeat", "This Creature already suffers this Elemental Burst.");
    const name = PRIMAL_CONDITION_NAMES[burst.status];
    return { warnings, title: "Elemental Burst Condition", apply(next, receipt) {
      const current = next.primal.burst; current.applied = [...current.applied, { key, op: receipt.id }];
      receipt.targets = [{ uuid: target.uuid, name: target.name, kind: "condition", status: burst.status, origin: "burst", ready: true }];
      receipt.summary = `${name} on ${target.name} until the end of ${actor.name}'s next Turn.`;
      receipt.result = { condition: name, targetUuid: target.uuid };
      return {};
    } };
  },
  splashCantrip(actor, state, data) {
    need(casterBranch(actor) === "splash", "Splashing Cantrips is a Splash Caster feature.");
    const cast = currentCastOf(state, data.castId), primary = actorAt(data.primaryTargetUuid, "the original target"), warnings = [];
    const rolled = integer(data.amount, "Rolled Cantrip Damage", 0), halved = Math.floor(rolled / 2), dc = casterSpellDC(actor) + 2;
    levelWarning(warnings, actor, 3, "Splashing Cantrips");
    if (casterTurn(actor) && cast.turn !== casterTurn(actor)) warn(warnings, "turn", "That Cantrip was not cast during the current Turn.");
    if (cast.level !== 0) warn(warnings, "notCantrip", "Splashing Cantrips applies to a damaging Cantrip, and that cast is not a Cantrip.");
    if (data.singleTarget !== true) warn(warnings, "singleTarget", "You did not confirm that the Cantrip would deal Damage to only one Creature.");
    if ((state.splash ?? []).some(entry => entry.castId === cast.id)) warn(warnings, "repeat", "Splashing Cantrips was already used for this Cantrip.");
    return { warnings, title: "Splashing Cantrips", apply(next, receipt) {
      next.splash = [...(next.splash ?? []).filter(entry => entry.castId !== cast.id), { castId: cast.id, op: receipt.id, primary: primary.uuid, rolled, halved, dc }].slice(-20);
      receipt.summary = `The Cantrip deals halved Damage (${halved}) to ${esc(primary.name)}. All Creatures within 10 feet of ${esc(primary.name)} must succeed on [[/save ability=dex dc=${dc}]] (Controlled Detonation +2) or take ${halved} Damage. ${esc(actor.name)} automatically passes if within the area. Apply this Damage from the Caster panel with the Splashing Cantrip receipt.`;
      receipt.html = true;
      receipt.result = { halved, dc };
      return {};
    } };
  },
  damage(actor, state, data) {
    need(casterBranch(actor) === "splash", "Splash Damage applies to a Splash Caster.");
    const cast = currentCastOf(state, data.castId), target = actorAt(data.targetUuid), warnings = [];
    need(Number.isFinite(data.reduction) && typeof data.resistance === "boolean" && typeof data.vulnerability === "boolean" && typeof data.immunity === "boolean",
      "Confirm DR, Resistance, Vulnerability and Immunity before applying Damage.");
    let amount = integer(data.amount, "Reviewed rolled Damage", 0), minimumTaken, readingKey = null, area = null;
    if (data.splashOf) {
      const record = (state.splash ?? []).find(entry => entry.castId === cast.id && entry.castId === data.splashOf);
      need(record, "Record Splashing Cantrips for this Cantrip first.");
      need(["primary", "failed", "succeeded"].includes(data.splashRole), "Choose the original target or the splash Saving Throw result.");
      if (data.splashRole === "primary" && target.uuid !== record.primary) warn(warnings, "role", "Only the original target takes the halved Damage without a Saving Throw.");
      if (data.splashRole !== "primary" && target.uuid === record.primary) warn(warnings, "role", "The original target does not make the splash Saving Throw.");
      amount = data.splashRole === "succeeded" ? 0 : record.halved;
    } else if (cast.context?.area) {
      need(["failed", "succeeded", "noSave"].includes(data.saveOutcome), "Choose the Saving Throw result, or that this Art allows no Saving Throw.");
      if (data.saveOutcome !== "noSave") need(["half", "none"].includes(data.onSuccess), "Confirm whether a successful Saving Throw halves this Art's Damage or prevents it.");
      area = splashArea(actor, cast, target, amount, data);
      readingKey = area.reading;
    }
    const key = `${cast.id}:${opaqueKey(target.uuid)}`;
    if ((state.splashDamage ?? []).some(entry => entry.key === key)) warn(warnings, "repeat", data.splashOf
      ? "This Creature already took Splashing Cantrips Damage from that Cantrip."
      : "This Creature already took Damage from that Art (use anyway for a separate instance, such as ongoing Damage).");
    return { warnings, title: data.splashOf ? "Splashing Cantrips Damage" : "Splash area Damage", reading: readingKey, apply(next, receipt, reading) {
      if (area) ({ amount, minimumTaken } = area.resolve(reading));
      if (data.immunity) { amount = 0; minimumTaken = undefined; }
      next.splashDamage = [...(next.splashDamage ?? []), { key, op: receipt.id }].slice(-200);
      receipt.targets = [{ uuid: target.uuid, name: target.name, kind: "hp", ready: true, damage: { amount, type: data.type, reduction: data.reduction,
        resistance: data.resistance, vulnerability: data.vulnerability, ...(minimumTaken !== undefined ? { minimumTaken } : {}) } }];
      receipt.summary = `${target.name}: ${amount} ${data.type ?? ""} Damage before defenses${minimumTaken !== undefined ? ` (Maximum Burst: at least ${minimumTaken})` : ""}.`;
      return {};
    } };
  }
};
/**
 * Register further §3.2 use plans on this engine. `plans` map command → plan builder (same shape as PLANS above);
 * `readings` add offered readings; `targetKinds` add idempotent {apply, revert, preview} target changes;
 * `cleanup(state, receiptId)` removes the branch's ledger entries when a use is undone.
 */
export function registerCasterUses({ plans = {}, readings = {}, targetKinds = {}, undoHandlers = {}, legacyCommands = [], cleanup } = {}) {
  for (const [command, plan] of Object.entries(plans)) { PLANS[command] = plan; EXTRA_COMMANDS.add(command); }
  for (const command of legacyCommands) LEGACY_COMMANDS.add(command);
  Object.assign(READINGS, readings);
  Object.assign(TARGET_KINDS, targetKinds);
  Object.assign(UNDO_HANDLERS, undoHandlers);
  if (cleanup && !LEDGER_CLEANUPS.includes(cleanup)) LEDGER_CLEANUPS.push(cleanup);
}
const LEGACY_COMMANDS = new Set();

/** Persist a receipt for an operation owned by a registered Caster branch. */
export async function recordExternalCasterUse(actor, receipt, { post = false, alreadySerialized = false } = {}) {
  if (!alreadySerialized) return casterStateSerial(actor, () => recordExternalCasterUse(actor, receipt, { post, alreadySerialized: true }));
  const state = casterState(actor); state.undo ??= [];
  const existing = state.undo.find(entry => entry.id === receipt.id);
  if (existing) return existing;
  state.undo = retainUndoWindow([...state.undo, receipt]);
  await actor.update({ "flags.ak5e.caster.undo": state.undo });
  if (post) await useCard(actor, receipt);
  return receipt;
}
export async function updateExternalCasterUse(actor, useId, update, { post = false, alreadySerialized = false } = {}) {
  if (!alreadySerialized) return casterStateSerial(actor, () => updateExternalCasterUse(actor, useId, update, { post, alreadySerialized: true }));
  const state = casterState(actor), receipt = state.undo?.find(entry => entry.id === useId);
  need(receipt, "This Caster operation has no recorded receipt.");
  Object.assign(receipt, update); await actor.update({ "flags.ak5e.caster.undo": state.undo });
  if (post) await useCard(actor, receipt);
  return receipt;
}
export const isCasterUseCommand = command => PRIMAL_SPLASH_COMMANDS.includes(command) || EXTRA_COMMANDS.has(command);
/**
 * Splash area Damage from the rolled total. Safe Zone (L840): automatic success and no Damage where a success would
 * halve it. Maximum Burst (L873): not less than half the rolled Damage, except immunity. Their precedence needs a ruling
 * or the player's reading for this use.
 */
function splashArea(actor, cast, target, rolled, data) {
  const level = casterLevel(actor), safe = level >= 6 && data.saveOutcome !== "noSave" && (cast.context.safeZone ?? []).includes(target.uuid);
  const half = Math.floor(rolled / 2), burst = level >= 15;
  const amount = safe ? 0 : data.saveOutcome === "succeeded" ? (data.onSuccess === "half" ? half : 0) : rolled;
  const conflict = safe && burst && half > 0;
  return { reading: conflict ? "safeZoneVsMaximumBurst" : null, resolve(reading) {
    if (conflict && reading === "safeZone") return { amount: 0 };
    return burst ? { amount: Math.max(amount, half), minimumTaken: half } : { amount };
  } };
}

/* ---------------------------------------------------------------- the use lifecycle */

async function save(actor, state, updates = {}) { await actor.update({ ...updates, "flags.ak5e.caster": state }); }
function cardHtml(receipt) {
  const lines = [`<p>${receipt.html ? receipt.summary : esc(receipt.summary)}</p>`];
  if (receipt.overridden?.length) lines.push(`<p><strong>Used anyway:</strong> ${receipt.overridden.map(esc).join(" ")}</p>`);
  if (receipt.reading) lines.push(`<p><strong>Player's reading for this use (no GM ruling):</strong> ${esc(receipt.reading)}</p>`);
  if (receipt.shortfall) lines.push(`<p><strong>${esc(receipt.shortfall)}.</strong></p>`);
  if (receipt.status === "pending") lines.push(`<p><strong>Not applied yet:</strong> ${esc(receipt.lastError ?? "no GM is connected")}. Retry this use from the Caster panel.</p>`);
  return lines.join("");
}
/** One public card per use and Caster. The render hook adds Roll and Undo buttons for the Caster's owners. */
async function useCard(actor, receipt, kind = "use") {
  const id = kind === "use" ? receipt.id : `${receipt.id}-${kind}`;
  if (values(game.messages).some(message => flag(message, "casterOperation") === id && flag(message, "casterActor") === actor.uuid)) return;
  const title = kind === "undo" ? `Undone: ${receipt.title}` : kind === "roll" ? `${receipt.title}: result` : receipt.title;
  const body = kind === "undo" ? `<p>${esc(game.user.name)} undid this use.${receipt.undoNotes?.length ? ` ${receipt.undoNotes.map(esc).join(" ")}` : ""}</p>`
    : kind === "roll" && TARGET_KINDS[receipt.targets[0].kind]?.rollText ? `<p>${esc(TARGET_KINDS[receipt.targets[0].kind].rollText(receipt.targets[0]))}</p>${receipt.targets[0].relayed ? "<p>Applied by the GM's client.</p>" : ""}`
    : kind === "roll" ? `<p>${esc(receipt.targets[0].name)} loses ${esc(receipt.targets[0].applied?.hpLost ?? 0)} Hit Points${receipt.targets[0].applied?.tempLost ? ` and ${esc(receipt.targets[0].applied.tempLost)} Temporary HP` : ""}.</p>${receipt.targets[0].relayed ? "<p>Applied by the GM's client.</p>" : ""}`
    : `${cardHtml(receipt)}${receipt.targets?.some(entry => entry.relayed) ? "<p>Applied by the GM's client.</p>" : ""}`;
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<h3>${esc(title)}</h3>${body}`,
    flags: { ak5e: { casterOperation: id, casterActor: actor.uuid, ...(kind === "use" ? { casterUse: { actorUuid: actor.uuid, useId: receipt.id } } : {}) } } });
}
/** Post the public card of a receipt recorded outside this engine's command path (a cast-time Chain Art use). */
export async function postCasterUseCard(actor, useId) {
  const receipt = casterState(actor).undo?.find(entry => entry.id === useId);
  if (receipt) await useCard(actor, receipt);
}
/** Apply every ready target change of a receipt, then complete it. Without a GM for an unowned target, keep it pending. */
async function finish(actor, useId) {
  let state = casterState(actor), receipt = state.undo.find(entry => entry.id === useId);
  for (const entry of receipt.targets ?? []) {
    if (!entry.ready || entry.applied) continue;
    try { entry.applied = (await changeTarget(actor, receipt, entry, "apply")) ?? true; }
    catch (error) {
      receipt.status = "pending"; receipt.lastError = error instanceof NoGM ? "no GM is connected" : String(error.message).replace(/\.$/, "");
      await save(actor, state); await useCard(actor, receipt);
      throw new Error(`Not applied yet: ${receipt.lastError}. The use is recorded; retry it from the Caster panel${error instanceof NoGM ? " when a GM is connected" : ""}.`);
    }
  }
  receipt.status = receipt.targets?.some(entry => !entry.ready) ? "awaitingRoll" : "complete"; receipt.lastError = null;
  const hp = receipt.targets?.find(entry => entry.kind === "hp" && entry.applied);
  if (hp && typeof hp.applied === "object") receipt.result = { ...receipt.result, ...hp.applied };
  await save(actor, state);
  await useCard(actor, receipt);
  return receipt.result;
}
/**
 * Run one Primal/Splash use. Warnings throw `PlayWarnings` until overridden and a missing ruling throws `PlayReading`,
 * both before anything is written. `serial` is the Caster's per-Actor queue.
 */
export async function primalSplashCommand(actor, command, data, operationId, serial) {
  need(actor?.isOwner && !actor.pack && casterEnabled(actor), "Choose an owned, configured Caster.");
  need(typeof operationId === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(operationId), "A stable operation ID is required.");
  if (command === "undoUse") return serial(actor, () => undoUse(actor, data));
  if (command === "debilitateRoll" || command === "useRoll") return serial(actor, () => useRoll(actor, data));
  need(Object.hasOwn(PLANS, command), "Unknown Caster branch command.");
  need(data.confirmed === true, "Confirm this use before applying it.");
  let spent = null;
  const result = await serial(actor, async () => {
    let state = casterState(actor); state.undo ??= [];
    const existing = state.undo.find(entry => entry.id === operationId);
    if (existing) {
      need(existing.command === command, "That operation ID belongs to a different use.");
      spent = existing.apSpent ?? null;
      if (existing.status === "pending" || existing.status === "applying") return finish(actor, existing.id);
      if (existing.status !== "undone") await useCard(actor, existing); // A card lost to an interruption is posted once.
      return existing.result;
    }
    if (LEGACY_COMMANDS.has(command)) {
      const legacy = state.operations.find(entry => LEGACY_COMMANDS.has(entry.command) && ["prepared", "applying", "eventFailed"].includes(entry.status));
      if (legacy) {
        const known = state.undo.find(entry => entry.id === legacy.id && entry.command === legacy.command);
        if (!known)
          throw new Error(`Legacy prepared Mech-Accord operation ${legacy.id} has no established use receipt. Review AP, target documents and drone links, then use GM reviewed reconciliation before another Mech-Accord use.`);
        if (["pending", "applying"].includes(known.status)) await finish(actor, known.id);
        state = casterState(actor);
        const recovered = state.operations.find(entry => entry.id === legacy.id && entry.command === legacy.command);
        if (recovered) {
          recovered.status = "recovered";
          recovered.recoveredBy = operationId;
          await save(actor, state);
          state = casterState(actor);
        }
      }
    }
    const plan = PLANS[command](actor, state, data);
    const overridden = requireOverrides(plan.warnings, data.overrides);
    let reading = null;
    if (plan.reading) {
      const offered = READINGS[plan.reading];
      reading = resolveReading(ruled(state, plan.reading), data.readings?.[plan.reading] ?? data.reading, plan.reading, offered.label, offered.options);
    }
    const receipt = { id: operationId, command, title: plan.title, userId: game.user.id, epoch: currentEpoch(), createdAt: Date.now(), status: "applying",
      data: structuredClone(data), overridden: overridden.map(warning => warning.text), targets: [],
      reading: reading?.source === "player" ? READINGS[plan.reading].options.find(option => option.value === reading.value).label : null };
    const updates = plan.apply(state, receipt, reading?.value);
    state.undo = retainUndoWindow([...state.undo, receipt]);
    spent = receipt.apSpent ?? null;
    await save(actor, state, updates);
    return finish(actor, receipt.id);
  });
  // An AP expenditure is the same committed event as a cast's; handlers dedupe by operation ID, so a retry is safe.
  if (spent?.amount > 0) {
    const event = await emitAk5eEvent("apSpent", { actorUuid: actor.uuid, operationId: operationId, amount: spent.amount, turn: spent.turn, reason: spent.reason });
    if (event?.errors) globalThis.ui?.notifications?.warn?.("The AP were spent, but an AP-spend handler failed; check AP-dependent features (for example Unending) by hand.");
  }
  return result;
}
/**
 * The owner (or a GM) rolls a use's dice from its card (Debilitate and Destroy, Jury Rigging); the result is then
 * applied. Nothing is rolled before this click (WORKFLOW.md §3.2).
 */
async function useRoll(actor, data) {
  const state = casterState(actor), receipt = state.undo?.find(entry => entry.id === data.useId);
  need(receipt?.formula, "Choose a use that is waiting for its roll.");
  need(receipt.status !== "undone", "That use was undone.");
  if (receipt.status === "complete") return receipt.result;
  const entry = receipt.targets[0];
  if (receipt.roll === undefined) {
    const roll = await new Roll(receipt.formula, actor.getRollData?.() ?? {}).evaluate();
    receipt.roll = roll.total; entry.ready = true;
    if (TARGET_KINDS[entry.kind]?.rolled) TARGET_KINDS[entry.kind].rolled(entry, roll.total); else entry.damage.amount = roll.total;
    await save(actor, state);
    await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: receipt.rollFlavor ?? `Debilitate and Destroy: ${entry.name} loses Hit Points`,
      flags: { ak5e: { casterOperation: `${receipt.id}-dice`, casterActor: actor.uuid } } });
  }
  const result = await finish(actor, receipt.id);
  const after = casterState(actor).undo.find(item => item.id === receipt.id);
  await useCard(actor, after, "roll");
  return { ...result, roll: after.roll, dice: Number(after.formula.split("d")[0]) };
}
/** What undoing a use will and will not restore, shown before the user confirms. */
export function previewUndo(actor, useId) {
  const receipt = casterState(actor).undo?.find(entry => entry.id === useId);
  if (!receipt) return { lines: ["This use is no longer recorded."], blocked: true };
  if (receipt.status === "undone") return { lines: ["This use was already undone."], blocked: true };
  const lines = [], locked = isLocked(receipt);
  if (locked) lines.push(game.user.isGM ? "This use is from an earlier encounter window; as GM you may still undo it." : "Locked: this use's encounter window has ended.");
  if (receipt.undoKind && UNDO_HANDLERS[receipt.undoKind]?.preview) lines.push(...UNDO_HANDLERS[receipt.undoKind].preview(actor, receipt));
  if (receipt.caster?.pool) {
    const record = receipt.caster.pool, amount = Math.max(0, record.before - record.after - Number(record.refunded ?? receipt.apRefunded ?? 0));
    lines.push(`Restores ${amount} ${record.poolLabel ?? record.label ?? "Residual Suffering"} ${record.unit ?? "use(s)"}${record.refunded || receipt.apRefunded ? ` after subtracting ${record.refunded ?? receipt.apRefunded} AP refunded by Unending` : ""}.`);
  }
  if (receipt.caster?.uses) lines.push("Marks Elemental Burst as unused since the last Short Rest.");
  for (const entry of receipt.targets ?? []) {
    const target = globalThis.fromUuidSync?.(entry.uuid);
    if (!entry.applied) { lines.push(`${entry.name}: nothing was applied yet.`); continue; }
    if (TARGET_KINDS[entry.kind]) { lines.push(TARGET_KINDS[entry.kind].preview(actor, receipt, entry, target)); continue; }
    if (entry.kind === "condition") {
      const present = values(target?.effects).some(effect => flag(effect, "casterPrimal")?.opId === receipt.id);
      lines.push(present ? `${entry.name}: removes ${PRIMAL_CONDITION_NAMES[entry.status]}.` : `${entry.name}: ${PRIMAL_CONDITION_NAMES[entry.status]} is already gone; nothing to remove.`);
    } else {
      const record = flag(target, "casterApplied")?.[appliedKey(actor, receipt.id)], hp = target?.system?.attributes?.hp;
      if (!record) lines.push(`${entry.name}: no recorded Hit Point change remains.`);
      else {
        lines.push(`${entry.name}: adds back ${record.hpLost} Hit Points${record.tempLost ? ` and ${record.tempLost} Temporary HP` : ""}.`);
        if (Number(hp?.value) !== record.value || Number(hp?.temp ?? 0) !== record.temp)
          lines.push(`${entry.name}'s Hit Points changed after this use (now ${hp?.value}, then ${record.value}); the lost amount is added back, not the earlier total.`);
      }
    }
  }
  return { lines, blocked: locked && !game.user.isGM, locked };
}
async function undoUse(actor, data) {
  const state = casterState(actor), receipt = state.undo?.find(entry => entry.id === data.useId);
  need(receipt, "This use is no longer recorded.");
  if (receipt.status === "undone") return { undone: receipt.id, already: true };
  need(!isLocked(receipt) || game.user.isGM, "This use is locked: its encounter window has ended.");
  if (receipt.undoKind) {
    const handler = UNDO_HANDLERS[receipt.undoKind]; need(handler, "This receipt needs its Mech-Accord recovery handler; no change was made.");
    const outcome = await handler.undo(actor, structuredClone(receipt));
    const fresh = casterState(actor), current = fresh.undo?.find(entry => entry.id === receipt.id);
    need(current, "The use receipt disappeared during undo.");
    current.status = "undone"; current.undoneBy = game.user.id; current.undoNotes = outcome?.notes ?? [];
    await save(actor, fresh); await useCard(actor, current, "undo");
    return { undone: receipt.id, ...outcome };
  }
  receipt.undoNotes = [];
  for (const entry of receipt.targets ?? []) {
    if (!entry.applied) continue;
    try {
      const reverted = await changeTarget(actor, receipt, entry, "revert"); entry.applied = false;
      if (reverted?.missing) receipt.undoNotes.push(`${entry.name} no longer exists; nothing to revert there.`);
    }
    catch (error) { throw new Error(`Not undone yet: ${error instanceof NoGM ? "no GM is connected to change the target" : error.message}.`); }
  }
  const updates = {};
  if (receipt.caster?.pool) {
    // A resource pool, or a plain Actor value such as AP or currency (path, before, after, optional max).
    const record = receipt.caster.pool, id = record.id ?? (record.path === RESIDUAL_POOL_PATH ? "residualSuffering" : null);
    const pool = id && getPoolDefinition(id) ? getPool(actor, id) : null;
    const restored = Math.max(0, record.before - record.after - Number(record.refunded ?? receipt.apRefunded ?? 0));
    const current = pool ? pool.value : Number(getPath(actor, record.path)) || 0;
    // The exact prior value is restored even when it was above the maximum (over-cap AP is allowed).
    updates[record.path] = Math.min(Math.max(pool?.max ?? record.max ?? Infinity, record.before), current + restored);
  }
  if (receipt.caster?.uses) Object.assign(state.uses, receipt.caster.uses);
  const keep = list => (list ?? []).filter(entry => entry.op !== receipt.id);
  if (state.primal) {
    state.primal.residual = keep(state.primal.residual);
    if (state.primal.debilitated) state.primal.debilitated.targets = keep(state.primal.debilitated.targets);
    if (state.primal.burst?.id === receipt.id) state.primal.burst = null;
    else if (state.primal.burst) state.primal.burst.applied = keep(state.primal.burst.applied);
  }
  state.splash = keep(state.splash); state.splashDamage = keep(state.splashDamage);
  for (const cleanup of LEDGER_CLEANUPS) cleanup(state, receipt.id);
  receipt.status = "undone"; receipt.undoneBy = game.user.id;
  await save(actor, state, updates);
  await useCard(actor, receipt, "undo");
  return { undone: receipt.id };
}

/** Uses for the panel: newest first, with lock and retry state. */
export function primalSplashUses(actor) {
  return (casterState(actor).undo ?? []).slice().reverse().map(receipt => ({ id: receipt.id, title: receipt.title, command: receipt.command, status: receipt.status,
    summary: receipt.summary?.replace(/<[^>]+>|\[\[[^\]]*\]\]/g, ""), locked: isLocked(receipt), data: receipt.data, lastError: receipt.lastError ?? null }));
}
export function registerPrimalSplash() {
  if (!getPoolDefinition("residualSuffering")) definePool({ id: "residualSuffering", label: "Residual Suffering", max: "2 * @prof", initial: "max", classId: "class-caster",
    appliesTo: actor => casterEnabled(actor) && casterBranch(actor) === "primal", recovery: [{ on: "lr", amount: "toInitial" }] });
}
