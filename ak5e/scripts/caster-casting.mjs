/** Scoped Caster casting context. No document changes at import/render time. */
import { casterLevel, casterBranch, casterState, casterProfile, casterTable } from "./caster-rules.mjs";
import { artsState, integer } from "./arts-rules.mjs";
import { emitAk5eEvent } from "./trigger-events.mjs";
import { flag, values, need, opaqueKey, esc } from "./operation-kernel.mjs";
import { requireOverrides } from "./play-undo.mjs";
import { validateBaseContext, baseConsumption } from "./caster-base.mjs";
import { mechReading } from "./caster-mech.mjs";
import { validateChainContext, recordChainUse } from "./caster-chain.mjs";
import { postCasterUseCard } from "./caster-primal-splash.mjs";

const patched = new WeakSet(), patchedOrigins = new WeakSet(), patchedRolls = new WeakSet(), patchedDamageConfigs = new WeakSet(), pendingEmpower = new WeakMap(), rollingActors = new Set(), patchedChat = new WeakSet();
const safe = promise => Promise.resolve(promise).catch(error => { console.error("AK5e | Caster casting", error); ui.notifications.error(error.message); });
export const casterEnabled = actor => casterState(actor).enabled === true && casterLevel(actor) > 0 && !!casterBranch(actor) && !casterProfile(actor).blocked.length;
export function casterTurn(actor) {
  const c = globalThis.game?.combat;
  if (!c?.started) return null;
  return `${c.uuid ?? c.id}:${c.round}:${c.combatant?.id ?? c.turn}`;
}
export function ownCasterTurn(actor) { return globalThis.game?.combat?.started && game.combat.combatant?.actor?.uuid === actor.uuid; }
export function casterRuling(actor, key) {
  const record = casterState(actor).rulings?.[key];
  need(record?.source?.trim() && record.value !== undefined, `The GM must record a ruling for ${key} before this interaction can be automated.`);
  return record.value;
}
/** "Arts that Target an Area" (Ch.3 L828-829): Sphere, Cone, Cube, Cylinder or Line. Other native shapes are not inferred. */
export const AREA_TYPES = Object.freeze(["sphere", "cone", "cube", "cylinder", "line"]);
/** Overwhelming Detonation growth per additional AP (Ch.3 L843-846). Cylinder is not listed. */
export const OVERWHELM_STEP = Object.freeze({ cone: 10, cube: 10, line: 20, sphere: 5 });
export function artArea(activity) {
  const type = activity?.target?.template?.type;
  return AREA_TYPES.includes(type) ? type : null;
}
export function itemArea(item) {
  return values(item?.system?.activities).map(artArea).find(Boolean) ?? null;
}
export function overwhelmGrowth(activity, extraAP) {
  const n = integer(extraAP, "Overwhelming Detonation AP", 1, 12), area = artArea(activity);
  need(area && OVERWHELM_STEP[area], "Overwhelming Detonation applies to a Cone, Cube, Line or Sphere Art.");
  need(activity.target.template.units === "ft", "Overwhelming Detonation requires an area measured in feet.");
  const size = Number(activity.target.template.size);
  need(Number.isFinite(size) && size > 0, "This Art has no reviewed area size.");
  return { area, size, increase: n * OVERWHELM_STEP[area], newSize: size + n * OVERWHELM_STEP[area] };
}
export function casterGrant(actor, item, grant) {
  if (casterState(actor).enabled && !casterEnabled(actor))
    return { ...grant, blocked:"Caster class/branch changed. Obtain a reviewed setup update before casting." };
  const grants = flag(item, "casterArtGrants");
  if (flag(item, "casterBorrowed") === true && Array.isArray(grants) && grants.every(g => g === "rabbit") && casterState(actor).borrowed?.itemId !== item.id)
    return { ...grant, blocked: "Rabbit from the Hat expired at the last Long Rest. Independently learned grants remain available." };
  if (!casterEnabled(actor)) return grant;
  const state = casterState(actor), signature = state.signature;
  return { ...grant, caster: { level: casterLevel(actor), maximumArtLevel:casterTable(casterLevel(actor)).maximumArtLevel, branch: casterBranch(actor),
    costOrder: state.rulings?.costOrder?.value,
    economics: casterBranch(actor) === "splash" && casterLevel(actor) >= 10 && !!itemArea(item),
    signatureNonDamaging: casterBranch(actor) === "core" && casterLevel(actor) >= 15 && signature?.itemId === item.id && signature.damaging === false } };
}
export function casterQuoteOptions(actor, item, usage = {}) {
  const context = usage.ak5eCaster ?? usage.casterContext ?? {};
  return { ...(context.droneTokenUuid ? { surcharge: context.repeat === "duplicate" ? 0 : 1 } : {}),
    ...(context.overrideCost !== undefined ? { overrideCost: context.overrideCost } : {}),
    ...(["duplicate","deathAbove"].includes(context.repeat) ? { fixedLevel:context.originalLevel } : {}), origin: context.droneTokenUuid ?? null,
    ...(context.overwhelm ? { extraAP: context.overwhelm } : {}), ...(context.area !== undefined ? { area: context.area } : {}) };
}
function token(uuid) {
  const doc = globalThis.fromUuidSync?.(uuid);
  need(doc?.documentName === "Token" && doc.actor, "Choose a placed drone token.");
  return doc;
}
/** The drone token a cast originates from. Only its identity is required; source limits are `droneOriginWarnings`. */
export function casterDroneOrigin(actor, tokenUuid) {
  const drone = token(tokenUuid), link = flag(drone.actor, "artsMaster");
  need(casterBranch(actor) === "mech-accord", "Arts Translocation is a Mech-Accord Caster feature.");
  need(link?.creatorUuid === actor.uuid && casterState(actor).drones?.includes(drone.actor.uuid), "This drone is not linked to this caster.");
  return drone;
}
/** Arts Translocation source limits (Ch.3 L634), as warnings the caster may override (WORKFLOW.md §3.2). */
export function droneOriginWarnings(actor, tokenUuid) {
  const drone = casterDroneOrigin(actor, tokenUuid), link = flag(drone.actor, "artsMaster"), warnings = [];
  if (casterLevel(actor) < 6) warnings.push({ id: "originLevel", text: `Arts Translocation is a Mech-Accord level 6 feature; this Caster is level ${casterLevel(actor)}.` });
  if (!(drone.actor.system.attributes.hp.value > 0) || link.destroyed) warnings.push({ id: "originDestroyed", text: `${drone.name} is destroyed; a destroyed drone normally cannot provide a cast origin.` });
  if (!actor.getActiveTokens?.(true, true)?.map(t => t.document ?? t).some(t => t.parent?.id === drone.parent?.id))
    warnings.push({ id: "originScene", text: "The caster and drone are not on the same Scene, so the distance cannot be checked." });
  return warnings;
}
/** The Art a pending/failed operation is about, when its recorded data names one. */
function operationItemId(state, operation) {
  const data = operation?.data ?? {};
  if (typeof data.itemId === "string" && data.itemId) return data.itemId;
  if (typeof data.castId === "string" && data.castId)
    return state.casts?.find?.(cast => cast.id === data.castId)?.itemId ?? null;
  return null;
}
export function validateCasterContext(actor, item, input = {}) {
  if (!casterEnabled(actor)) { need(!Object.keys(input).length, "Complete Caster setup before using branch cast controls."); return {}; }
  // Base first (AP source limits, Doublecast's named reading); branch options are merged, never discarded.
  const base = validateBaseContext(actor, item, input);
  const state = casterState(actor), level = casterLevel(actor), branch = casterBranch(actor);
  // §3.1/R2/R7: an unfinished or failed earlier operation is recovery evidence, never a blanket Actor
  // lock. Only genuinely ambiguous same-Art evidence (an unresolved receipt naming the Art being cast
  // again) still stops for retry/reconciliation; any unrelated operation only warns ("Use anyway"
  // semantics) and the independent use proceeds. The legacy failed cast/receipt always stays in
  // `state.casts` (and `getCasterView().pending`) for recovery.
  const artId = typeof item?.id === "string" && item.id ? item.id : null;
  const sameArt = operation => Boolean(artId) && (operationItemId(state, operation) === artId || operation?.itemId === artId);
  const unresolved = [...state.casts.filter(cast => cast.status === "failed"),
    ...state.operations.filter(operation => ["prepared", "applying", "eventFailed"].includes(operation.status))];
  need(!unresolved.some(operation => sameArt(operation)),
    "Retry or obtain GM reconciliation for the interrupted Caster operation before casting this Art again.");
  const unrelated = unresolved.filter(operation => !sameArt(operation));
  const recoveryWarnings = unrelated.length ? [{ id: "interruptedOperation", text:
    `${unrelated.length === 1 ? "An earlier Caster operation is" : `${unrelated.length} earlier Caster operations are`} still unresolved ` +
    `(${unrelated.map(operation => operation.id ?? "unrecorded").join(", ")}). ` +
    "The receipt stays available for retry or GM reconciliation; this independent use is not blocked." }] : [];
  const context = { ...input, ...base };
  // A branch repeat ('duplicate'/'deathAbove') is a facade option, not a base repeat: keep it.
  if (input.repeat && input.repeat !== "doublecast") context.repeat = input.repeat;
  // `overrideCost` is internal metadata: only the validated base reading (or a validated branch
  // reading below) may set it. Raw input can never buy a price (spec §3.4/R10).
  if (base.overrideCost !== undefined) context.overrideCost = base.overrideCost;
  else delete context.overrideCost;
  for (const key of ["overwhelm", "allConsuming"]) if (!context[key]) delete context[key];
  if (Array.isArray(context.safeZone) && !context.safeZone.length) delete context.safeZone;
  if (context.overwhelm !== undefined || context.safeZone || context.allConsuming) {
    need(branch === "splash" && !!itemArea(item), "Sculpt Arts and Unavoidable apply to a Splash Caster's Art that targets an area.");
    // WORKFLOW.md §3.2: source limits are warnings the caster may override ("Use anyway"); only impossible input stops.
    const warnings = [], prof = Number(actor.system?.attributes?.prof ?? 0), warn = (id, text) => warnings.push({ id, text });
    if (context.overwhelm !== undefined) {
      if (level < 6) warn("overwhelmLevel", `Overwhelming Detonation is a Splash level 6 feature; this Caster is level ${level}.`);
      context.overwhelm = integer(context.overwhelm, "Overwhelming Detonation AP", 1, 12);
      if (context.overwhelm > 2 * prof) warn("overwhelmCap", `Overwhelming Detonation allows up to ${2 * prof} additional AP (twice your Proficiency Bonus).`);
    }
    if (context.safeZone) {
      if (level < 6) warn("safeZoneLevel", `Safe Zone is a Splash level 6 feature; this Caster is level ${level}.`);
      need(Array.isArray(context.safeZone) && context.safeZone.every(uuid => typeof uuid === "string" && uuid) && new Set(context.safeZone).size === context.safeZone.length, "Choose distinct Safe Zone creatures.");
      const castLevel = Number(context.level);
      if (Number.isSafeInteger(castLevel) && context.safeZone.length > 1 + castLevel) warn("safeZoneCount", `Safe Zone protects at most ${1 + castLevel} Creatures at cast level ${castLevel}.`);
    }
    if (context.allConsuming) {
      if (level < 15) warn("allConsumingLevel", `All-Consuming is a Splash level 15 feature; this Caster is level ${level}.`);
      if (state.uses?.allConsuming) warn("allConsumingUsed", "All-Consuming has been used since the last Short Rest.");
      context.allConsuming = true;
    }
    context.overridden = requireOverrides(warnings, input.overrides).map(warning => warning.text);
  }
  if (context.chain) {
    // Chain Art / Ouroboros (Ch.3 L460-490): source limits are warnings; the use is recorded at consumption.
    const { warnings, chain } = validateChainContext(actor, context.chain);
    const overridden = requireOverrides(warnings, input.overrides).map(warning => warning.text);
    context.chain = { ...chain, overridden };
    context.overridden = [...new Set([...(context.overridden ?? []), ...overridden])];
  } else delete context.chain;
  // Mech-Accord cast options: source limits are warnings; missing GM rulings are the player's reading for this cast.
  const mechWarnings = context.droneTokenUuid ? droneOriginWarnings(actor, context.droneTokenUuid) : [];
  if (context.maverick) {
    need(branch === "core" && level >= 10, "Maverick requires Core level 10.");
    need(context.mode !== "free" && context.mode !== "ritual", "Maverick requires an AP-funded cast.");
    need(coreDamageTypes(state.pools).includes(context.maverick), "Choose a damage type associated with a chosen Core pool.");
  }
  if (context.empowered) {
    need(branch === "core" && level >= 6 && !!casterTurn(actor), "Empowered Arts requires Core level 6 and a current Turn.");
    need(state.uses?.empowered !== casterTurn(actor), "Empowered Arts has already been used this Turn.");
  }
  if (context.signatureReroll) {
    need(branch === "core" && level >= 15 && state.signature?.itemId === item.id, "Select the current Signature Art.");
    context.signatureRerollOnce = casterRuling(actor, "signatureRerollOnce");
    need(typeof context.signatureRerollOnce === "boolean", "Record a boolean Signature reroll policy.");
  }
  if (context.burstStart || context.burstStep) {
    need(branch === "mystic" && Number(item.system.level) === 0, "Mystic burst uses a known Cantrip.");
    need(values(item.system.activities).some(a => a.activation?.type === "action"), "The Cantrip must have an Action casting time.");
    if (context.burstStart) {
      const charge = actor.getFlag("ak5e", "resourcePools")?.mysticCharge?.value ?? 0;
      need(charge > 0, "At least one Mystic Charge is required.");
      need(context.burstCharges === undefined || context.burstCharges === charge, "Mystic Charge changed after preview. Review the burst again before spending it.");
      need(!state.burst?.remaining, "Finish or reconcile the current burst first.");
      context.burstCharges = charge;
    } else need(state.burst?.remaining > 0 && !state.burst.interrupted && state.burst.itemId === item.id && state.burst.turn === casterTurn(actor), "There is no current burst cast remaining.");
    context.noCritical = true;
  }
  if (branch === "mystic" && level >= 6 && Number(item.system.level) === 0)
    context.surge = powerSurge(actor) + (context.burstStart ? context.burstCharges : 0);
  if (context.repeat) {
    const previous = state.casts?.find(c => c.id === context.previousCastId);
    need(previous, "Choose a recorded Art cast to repeat.");
    const sameTurn = previous.completed && previous.turn === casterTurn(actor) && ownCasterTurn(actor);
    if (context.repeat !== "doublecast" && !sameTurn) mechWarnings.push({ id: "repeatTurn", text: "The repeated Art normally follows a completed Art cast during your current Turn." });
    if (context.repeat !== "doublecast") {
      need(branch === "mech-accord" && context.droneTokenUuid, "Cantrip Duplication and Death from Above repeat an Art through a linked drone.");
      need(["duplicate", "deathAbove"].includes(context.repeat), "Choose Cantrip Duplication or Death from Above.");
      const add = (id, text) => mechWarnings.push({ id, text });
      if (previous.itemId !== item.id) add("repeatArt", "The repeated cast is normally the same Art as the original.");
      if (context.repeat === "duplicate") {
        if (level < 6) add("duplicateLevel", `Cantrip Duplication is a Mech-Accord level 6 feature; this Caster is level ${level}.`);
        if (previous.level !== 0) add("duplicateCantrip", "Cantrip Duplication repeats a Cantrip, and the original cast is not a Cantrip.");
        if (context.sameTargets !== true) add("duplicateTargets", "You did not confirm that the repeat targets the same Creature or area.");
        const currentTargets = values(game.user.targets).map(t => t.document?.uuid ?? t.uuid).sort();
        if (previous.targets?.length && JSON.stringify(currentTargets) !== JSON.stringify([...previous.targets].sort())) add("duplicateTargetChange", "Your current targets differ from the original cast's targets.");
        if (state.uses?.duplicate && state.uses.duplicate === casterTurn(actor)) add("duplicateUsed", "Cantrip Duplication has already been used this Turn.");
        const reading = mechReading(actor, "duplicationCost", input.reading);
        context.overrideCost = Number(reading.value);
        if (reading.source === "player") context.readingNote = reading.label;
      } else {
        if (level < 15) add("deathAboveLevel", `Death from Above is a Mech-Accord level 15 feature; this Caster is level ${level}.`);
        if (previous.level > 3) add("deathAboveLevelCast", "Death from Above repeats an Art cast at 3rd level or less.");
        if (previous.activation !== "action") add("deathAboveAction", "Death from Above repeats an Art cast as an Action.");
        const reading = mechReading(actor, "deathAboveCost", input.reading);
        if (reading.value === "free") context.overrideCost = 0;
        if (reading.source === "player") context.readingNote = reading.label;
      }
      context.originalTargets = previous.targets ?? [];
      context.originalLevel = previous.level;
    }
  }
  if (mechWarnings.length) {
    const overridden = requireOverrides(mechWarnings, input.overrides).map(warning => warning.text);
    context.overridden = [...new Set([...(context.overridden ?? []), ...overridden])];
  }
  // Base source-limit warnings are confirmed once, after the branch hard stops (spec §3.1): the
  // player sees "Use anyway" for the base limits, and a branch impossibility still stops first.
  if (base.warnings?.length) {
    const overridden = requireOverrides(base.warnings, input.overrides).map(warning => warning.text);
    context.overridden = [...new Set([...(context.overridden ?? []), ...overridden])];
  }
  // Recovery evidence is surfaced without ever vetoing an independent use: an explicit override lists
  // it on the public card, otherwise the player is told the receipt is still available.
  if (recoveryWarnings.length) {
    const accepted = new Set(Array.isArray(input.overrides) ? input.overrides : []);
    const listed = recoveryWarnings.filter(warning => accepted.has(warning.id));
    if (listed.length) context.overridden = [...new Set([...(context.overridden ?? []), ...listed.map(warning => warning.text)])];
    else globalThis.ui?.notifications?.warn?.(recoveryWarnings.map(warning => warning.text).join(" "));
  }
  return context;
}
export const CORE_POOL_TYPES = Object.freeze({ corrosion: "acid", crude: "force", earth: "piercing", electric: "lightning", flame: "fire", fluid: "bludgeoning", frost: "cold", light: "radiant", psychic: "psychic", spatial: "thunder", wind: "slashing" });
export function coreDamageTypes(pools = []) {
  return [...new Set(pools.map(p => Object.entries(CORE_POOL_TYPES).find(([name]) => String(p).includes(`${name}-arts`))?.[1]).filter(Boolean))];
}
export function prepareCasterActivity(activity, usage, message) {
  if (!casterEnabled(activity.actor)) return;
  const context = validateCasterContext(activity.actor, activity.item, usage.ak5eCaster ?? {});
  // D&D5e's preUseActivity receives its working Item clone. The owned source is never changed.
  usage.ak5eCaster = context;
  updateWorkingClone(activity.item, { "flags.ak5e.casterCast": context });
  context.area = artArea(activity);
  if (context.repeat === "deathAbove") updateWorkingClone(activity.item, { [inheritedPath(activity.item, activity, "activation", "type")]: "bonus" });
  if (context.overwhelm || context.safeZone || context.allConsuming) need(context.area, "Sculpt Arts and Unavoidable apply to the activity that targets an area.");
  applyCastModifiers(activity.actor, activity.item, activity, context, context.surge ?? powerSurge(activity.actor));
  message.data ??= {}; message.data.flags ??= {}; message.data.flags.ak5e ??= {};
  message.data.flags.ak5e.casterCast = context;
}
/**
 * Working-clone changes for one cast: Mystic Power Surge and Splash Controlled Detonation save DCs,
 * and the Overwhelming Detonation area. The owned Item is never changed.
 */
export function castDcBonus(actor, item, activity, surge = 0) {
  const branch = casterBranch(actor), level = casterLevel(actor);
  let bonus = 0;
  if (casterEnabled(actor) && branch === "mystic" && level >= 6 && Number(item.system?.level) === 0) bonus += Number(surge) || 0;
  if (casterEnabled(actor) && branch === "splash" && artArea(activity)) bonus += 2;
  return bonus;
}
export function applyCastModifiers(actor, item, activity, context = {}, surge = 0) {
  if (!activity || !item?.system?.activities) return;
  const changes = {}, bonus = castDcBonus(actor, item, activity, surge);
  if (bonus && activity.save) Object.assign(changes, { [`system.activities.${activity.id}.save.dc.calculation`]: "", [`system.activities.${activity.id}.save.dc.formula`]: String(activity.save.dc.value + bonus) });
  if (context.overwhelm) changes[inheritedPath(item, activity, "target", "template.size")] = String(overwhelmGrowth(activity, context.overwhelm).newSize);
  // Chain Art: the chained Creatures are also targets of the Art (Ch.3 L461), so the cast's chat card lists them all.
  if (context.chain?.mode === "chain" && activity.target?.affects) changes[inheritedPath(item, activity, "target", "affects.count")] = String(1 + context.chain.chainedTokenUuids.length);
  if (Object.keys(changes).length) updateWorkingClone(item, changes);
}
/** D&D5e activities take activation and target from their Item unless `override` is set; change the field that is actually read. */
function inheritedPath(item, activity, field, path) {
  return activity?.[field]?.override === false && item?.system?.[field] !== undefined ? `system.${field}.${path}` : `system.activities.${activity.id}.${field}.${path}`;
}
/**
 * D&D5e 5.3.3 re-reads the cast activity from its working Item clone after `updateSource`, and that activity lacks
 * final data (template type, DC value) until `prepareFinalAttributes` runs. This mirrors D&D5e's own usage-scaling
 * update, including `_embeddedPreparation` so Item-targeting Active Effects are re-applied to the clone.
 */
function updateWorkingClone(item, changes) {
  if (!item?.updateSource) return;
  const actor = item.actor, flagged = actor && !actor._embeddedPreparation;
  if (flagged) actor._embeddedPreparation = true;
  try { item.updateSource(changes); }
  finally { if (flagged) delete actor._embeddedPreparation; }
  item.prepareFinalAttributes?.();
}
export function powerSurge(actor) {
  const state = casterState(actor);
  return casterEnabled(actor) && casterBranch(actor) === "mystic" && casterLevel(actor) >= 6 && state.turn?.key === casterTurn(actor)
    ? Number(state.turn.chargesSpent ?? 0) : 0;
}
export function casterConsumption(activity, usage, updates, receipt) {
  if (!casterEnabled(activity.actor)) return;
  // Base first (§3.3): base context, named repeat reading and the actual debit facts of this cast.
  baseConsumption(activity, usage ?? {}, updates, receipt);
  const actor = activity.actor, state = casterState(actor);
  // Consumption does not re-confirm the BASE source limits (they were accepted at the pre-use step).
  // Branch warnings keep their existing re-check below.
  const input = { ...(usage.ak5eCaster ?? {}) };
  const baseProbe = validateBaseContext(actor, activity.item, input);
  const overrides = [...(Array.isArray(input.overrides) ? input.overrides : []), ...(baseProbe.warnings ?? []).map(warning => warning.id)];
  const context = validateCasterContext(actor, activity.item, { ...input, overrides });
  need(!context.maverick || receipt.cost > 0, "Maverick requires actual AP expenditure on the selected cast.");
  context.area = artArea(activity);
  if (context.overwhelm || context.safeZone || context.allConsuming) need(context.area, "Sculpt Arts and Unavoidable apply to the activity that targets an area.");
  if (context.overwhelm) overwhelmGrowth(activity, context.overwhelm);
  if (context.safeZone && context.safeZone.length > 1 + Number(receipt.level)) {
    const text = `Safe Zone protects at most ${1 + Number(receipt.level)} Creatures at cast level ${receipt.level}.`;
    requireOverrides([{ id: "safeZoneCount", text }], context.overrides);
    if (!context.overridden?.includes(text)) context.overridden = [...(context.overridden ?? []), text];
  }
  context.castId = receipt.id;
  if (context.chain) recordChainUse(actor, state, context, receipt.id, updates.actor);
  updateWorkingClone(activity.item, { "flags.ak5e.casterCast": context });
  const cast = { ...receipt, status: "consumed", turn: casterTurn(actor), activation: activity.activation?.type,
    context, targets: values(game.user.targets).map(t => t.document?.uuid ?? t.uuid), origin: context.droneTokenUuid ?? null };
  state.casts = [...(state.casts ?? []).filter(c => c.id !== receipt.id), cast].slice(-40);
  if (context.burstStart) {
    const count = context.burstCharges;
    state.turn = state.turn?.key === cast.turn ? state.turn : { key: cast.turn, apSpent: 0, chargesSpent: 0 };
    state.turn.chargesSpent += count;
    state.burst = { itemId: activity.item.id, remaining: count, total: count + 1, turn: cast.turn, castIds: [receipt.id] };
    updates.actor["flags.ak5e.resourcePools.mysticCharge.value"] = 0;
  } else if (context.burstStep) {
    state.burst.remaining -= 1; state.burst.castIds.push(receipt.id);
  }
  if (context.repeat === "doublecast") state.uses.doublecast = true;
  if (context.allConsuming) state.uses.allConsuming = true;
  if (context.repeat === "duplicate") {
    state.uses.duplicate = cast.turn;
    state.attackLocks ??= {};
    state.attackLocks[opaqueKey(context.droneTokenUuid)] = { tokenUuid:context.droneTokenUuid, turn: cast.turn, castId: receipt.id };
  }
  // Write only cast-owned fields. Drone requests and other external receipts can be
  // committed by the elected GM on another client while this activity is resolving.
  // Replacing the whole Caster flag here would erase those independent changes.
  updates.actor["flags.ak5e.caster.casts"] = state.casts;
  if (context.burstStart) {
    updates.actor["flags.ak5e.caster.turn"] = state.turn;
    updates.actor["flags.ak5e.caster.burst"] = state.burst;
  } else if (context.burstStep) updates.actor["flags.ak5e.caster.burst"] = state.burst;
  if (context.repeat === "doublecast") updates.actor["flags.ak5e.caster.uses.doublecast"] = true;
  if (context.allConsuming) updates.actor["flags.ak5e.caster.uses.allConsuming"] = true;
  if (context.repeat === "duplicate") {
    updates.actor["flags.ak5e.caster.uses.duplicate"] = cast.turn;
    updates.actor[`flags.ak5e.caster.attackLocks.${opaqueKey(context.droneTokenUuid)}`] = state.attackLocks[opaqueKey(context.droneTokenUuid)];
  }
  receipt.caster = cast;
}
/** The actual debit of a committed cast: AP before minus AP after, never the quoted cost (§3.1). */
function actualDebit(receipt) {
  const before = Number(receipt?.before), after = Number(receipt?.after);
  if (Number.isSafeInteger(before) && Number.isSafeInteger(after) && before >= 0 && after >= 0 && after <= before) return before - after;
  const fallback = Number(receipt?.actualCost ?? receipt?.cost ?? 0);
  return Number.isSafeInteger(fallback) && fallback > 0 ? fallback : 0;
}
/** Persist the emitted marker so a repeated completion never posts a second event for one recorded use. */
async function markReceipt(actor, receipt, key) {
  receipt[key] = true;
  const current = actor.getFlag("ak5e", "lastArtCast");
  if (!current || current.id !== receipt.id) return;
  try { await actor.update({ "flags.ak5e.lastArtCast": { ...current, [key]: true } }); }
  catch (error) { console.warn("AK5e | Caster casting receipt marker", error); }
}
export async function completeCasterConsumption(actor, receipt) {
  if (!receipt || actor.getFlag("ak5e", "lastArtCast")?.id !== receipt.id) return;
  if (receipt.spendEmitted === true) return;
  const amount = actualDebit(receipt);
  if (amount <= 0) return; // A zero actual debit is not an expenditure (C3:195).
  const result=await emitAk5eEvent("apSpent", { actorUuid: actor.uuid, operationId: receipt.id, amount,
    level: receipt.level, itemId: receipt.itemId, origin: receipt.caster?.origin ?? null, turn: receipt.caster?.turn ?? casterTurn(actor) });
  need(!result.errors,"AP was consumed but an expenditure handler failed. Obtain GM reconciliation before continuing.");
  await markReceipt(actor, receipt, "spendEmitted");
}
export async function completeCasterUse(actor, receipt) {
  if (!receipt || actor.getFlag("ak5e", "lastArtCast")?.id !== receipt.id) return;
  if (receipt.castEmitted === true) return;
  const result=await emitAk5eEvent("artCast", { actorUuid: actor.uuid, operationId: receipt.id, amount: actualDebit(receipt), level: receipt.level,
    itemId: receipt.itemId, origin: receipt.caster?.origin ?? null, turn: receipt.caster?.turn ?? casterTurn(actor) });
  need(!result.errors,"The Art completed but a cast handler failed. Obtain GM reconciliation before continuing.");
  await markReceipt(actor, receipt, "castEmitted");
}
/** Array guard for optional warning lists (a non-array is treated as "no warnings"). */
const warningsOf = value => Array.isArray(value) ? value.filter(entry => entry && typeof entry === "object") : [];
/**
 * Base source limits the native Arts quote still enforces as hard stops (spec R2). They are warnings in
 * the Caster context (`maximumArtLevel`/`ninthLevel`) so the player can confirm "Use anyway"; the native
 * preflight re-quotes from stored state and cannot be told to accept them for one use.
 */
const NATIVE_BASE_LIMITS = Object.freeze({ LevelCap: "maximumArtLevel", NinthUsed: "ninthLevel" });
/**
 * Carry a confirmed "Use anyway" through the native preflight's refusal (spec R2/§3.1).
 * The Arts quote veto checks `flags.ak5e.artsPoints.maximumArtLevel`/`ninthLevelCast` and the grant's own
 * ceiling; `overrideCost` only replaces the AP price, and no exported Arts option lowers those checks for
 * one use. So a confirmed override cannot be honored end-to-end from this module without editing `arts-*`
 * (not owned by this package). Instead of silently dropping the confirmation, the refusal names it, keeps
 * the source warning, and states that nothing was spent. Returns null for any other error.
 */
function confirmedLimitRefusal(error, context) {
  const limitKey = typeof error?.key === "string" && Object.hasOwn(NATIVE_BASE_LIMITS, error.key) ? error.key : null;
  const warningId = limitKey ? NATIVE_BASE_LIMITS[limitKey] : null;
  if (!warningId) return null;
  const warning = warningsOf(context?.warnings).find(entry => entry.id === warningId);
  const confirmed = Array.isArray(context?.overridden) ? context.overridden.map(String) : [];
  if (!warning || !confirmed.includes(warning.text)) return null;
  const refusal = new Error(`${warning.text} You confirmed Use anyway for this use, but the native Arts quote still enforces the stored limit (${limitKey}), and the native seam rejects a confirmed override fail-closed (no silent success) for it; nothing was spent.`);
  refusal.name = "AK5eConfirmedOverrideBlocked";
  refusal.key = limitKey;
  refusal.warningId = warningId;
  refusal.warning = warning.text;
  refusal.confirmedOverride = warning.text;
  refusal.blockedBy = "arts-rules quote preflight";
  refusal.spent = false;
  refusal.cause = error;
  return refusal;
}
export async function castCasterArt(actor, itemId, options = {}) {
  need(actor?.isOwner && casterEnabled(actor), "Complete setup on a Caster you own.");
  const item = actor.items.get(itemId);
  need(item?.type === "spell" && flag(item, "art")?.enabled !== false, "Choose a known Art.");
  const context = validateCasterContext(actor, item, options);
  const activity = options.activityId ? item.system.activities.get(options.activityId)
    : values(item.system.activities).find(a => a.activation?.type === "action") ?? values(item.system.activities)[0];
  need(activity, "This Art is a source reference without an activity. Review a native activity before casting.");
  const usage = { ak5eCaster: context, ak5eLevel: options.level ?? item.system.level, ak5eMode: options.mode ?? "ap" };
  let result;
  try { result = await activity.use(usage); }
  // The confirmed base limits travel inside `usage.ak5eCaster` (`warnings`, `overridden`, `overrides`).
  // A native preflight refusal that contradicts a confirmation is reported, never retried without it.
  catch (error) { throw confirmedLimitRefusal(error, context) ?? error; }
  const castContext = flag(actor, "lastArtCast")?.caster?.context ?? {}, overridden = castContext.overridden ?? [];
  if (result && castContext.chain) await postCasterUseCard(actor, `${flag(actor, "lastArtCast").id}-chain`);
  // WORKFLOW.md §3.2: overridden warnings and the player's reading for a missing ruling are public.
  if (result && (overridden.length || castContext.readingNote)) await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<h3>${esc(item.name)}: ${overridden.length ? "used anyway" : "player's reading"}</h3>${overridden.length ? `<p>${overridden.map(esc).join(" ")}</p>` : ""}${castContext.readingNote ? `<p><strong>Player's reading for this use (no GM ruling):</strong> ${esc(castContext.readingNote)}</p>` : ""}` });
  return result;
}
export function casterAttackConfig(config) {
  const activity = config.subject, actor = activity?.actor;
  if (!actor) return;
  const cantrip = activity.item?.type === "spell" && activity.item.system.level === 0;
  const bonus = cantrip ? powerSurge(actor) : 0;
  for (const roll of config.rolls ?? []) {
    if (bonus) { roll.parts ??= []; roll.parts.push(String(bonus)); }
  }
}
export function patchCasterDamage() {
  for (const type of Object.values(CONFIG.DND5E?.activityTypes ?? {})) {
    for (let p = type.documentClass?.prototype; p; p = Object.getPrototypeOf(p)) {
      if (Object.hasOwn(p, "getUsageToken") && !patchedOrigins.has(p)) {
        patchedOrigins.add(p);
        const originalOrigin = p.getUsageToken;
        p.getUsageToken = function(...args) {
          const origin = flag(this.item, "casterCast")?.droneTokenUuid;
          return origin ? token(origin) : originalOrigin.apply(this, args);
        };
      }
      if (!Object.hasOwn(p, "getDamageConfig") || patched.has(p)) continue;
      patched.add(p); const original = p.getDamageConfig;
      p.getDamageConfig = function(...args) {
        const result = original.apply(this, args), context = flag(this.item, "casterCast") ?? {};
        if (patchedDamageConfigs.has(result)) return result;
        patchedDamageConfigs.add(result);
        const empower = pendingEmpower.get(this);
        if (empower && result.rolls?.[0]) result.rolls[0].parts.push(String(empower.bonus));
        if (context.noCritical) { result.critical = { ...result.critical, allow:false }; result.isCritical = false; for (const r of result.rolls ?? []) { r.options ??= {}; r.options.isCritical = false; } }
        if (context.maverick) for (const r of result.rolls ?? []) { r.options ??= {}; r.options.type = context.maverick; r.options.types = [context.maverick]; }
        const link = flag(this.actor, "artsMaster");
        if (link && flag(this.item, "artsMasterSpark")) {
          const owner = globalThis.fromUuidSync?.(link.creatorUuid), state = owner && casterState(owner);
          const rider = casterEnabled(owner) && casterBranch(owner) === "mech-accord" && casterLevel(owner) >= 10 && state?.residual?.active ? state.residual.amount : 0;
          if (rider && result.rolls?.[0]) result.rolls[0].parts.push(String(rider));
        }
        return result;
      };
    }
    for (let p = type.documentClass?.prototype; p; p = Object.getPrototypeOf(p)) {
      if (!Object.hasOwn(p, "rollDamage") || patchedRolls.has(p)) continue;
      patchedRolls.add(p); const original = p.rollDamage;
      p.rollDamage = async function(...args) {
        const state = casterState(this.actor), context = flag(this.item, "casterCast") ?? {};
        const cast = state.casts.find(c => c.id === context.castId);
        const eligible = casterEnabled(this.actor) && casterBranch(this.actor) === "core" && casterLevel(this.actor) >= 6
          && cast?.turn && cast.turn === casterTurn(this.actor) && state.uses.empowered !== cast.turn
          && (context.empowered || state.empowerCastId === cast.id);
        if (!eligible) return original.apply(this, args);
        need(!rollingActors.has(this.actor.uuid), "Finish the pending Empowered damage roll first.");
        rollingActors.add(this.actor.uuid);
        const ability = artsState(this.actor).ability;
        pendingEmpower.set(this, { bonus: Number(this.actor.system.attributes.prof) + (cast.level > 0 ? Number(this.actor.system.abilities[ability].mod) : 0) });
        try {
          const rolls = await original.apply(this, args);
          if (rolls?.length) {
            const next = casterState(this.actor); next.uses.empowered = cast.turn; next.empowerCastId = null;
            next.empoweredReceipt = { castId: cast.id, turn: cast.turn, amount: pendingEmpower.get(this).bonus, rolls: rolls.map(r => r.toJSON?.() ?? { total:r.total }) };
            await this.actor.update({ "flags.ak5e.caster": next });
          }
          return rolls;
        } finally { pendingEmpower.delete(this); rollingActors.delete(this.actor.uuid); }
      };
    }
    const Class = type.documentClass;
    if (!Class || patchedChat.has(Class)) continue;
    patchedChat.add(Class);
    // Chat cards otherwise retrieve the owned Item and lose the working cast clone.
    const metadata = Class.metadata, actions = {};
    for (const [name, handler] of Object.entries(metadata?.usage?.actions ?? {})) {
      actions[name] = async function(event, target, message) {
        const receipt = message.getFlag?.("ak5e", "artCast") ?? message.flags?.ak5e?.artCast;
        if (!receipt?.caster) return handler.call(this, event, target, message);
        const item = this.item.clone({}, { keepId:true });
        updateWorkingClone(item, { "flags.ak5e.casterCast": { ...receipt.caster.context, castId:receipt.id } });
        applyCastModifiers(this.actor, item, item.system.activities.get(this.id), receipt.caster.context ?? {}, powerSurge(this.actor));
        return handler.call(item.system.activities.get(this.id), event, target, message);
      };
    }
    Class.metadata = Object.freeze({ ...metadata, usage:{ ...metadata.usage, actions } });
  }
}
export async function markCasterCastFailure(actor, receipt, error) {
  if (!receipt?.caster || actor.getFlag("ak5e", "lastArtCast")?.id !== receipt.id) return;
  const state = casterState(actor), cast = state.casts.find(c => c.id === receipt.id);
  if (!cast) return;
  cast.status = "failed"; cast.error = String(error?.message ?? error ?? "Activity did not complete after resource consumption");
  await actor.update({ "flags.ak5e.caster": state });
}
/** The cast receipt on the chat card a Saving Throw was rolled from, if any. */
function castFromSave(config) {
  const id = config?.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId;
  const message = id ? globalThis.game?.messages?.get?.(id) : null;
  return message?.getFlag?.("ak5e", "artCast")?.caster ?? message?.flags?.ak5e?.artCast?.caster ?? null;
}
/** An undone Ouroboros use (its `${castId}-chain` receipt) no longer gives Disadvantage. */
function ouroborosUndone(config, context) {
  const id = config?.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId, message = id ? globalThis.game?.messages?.get?.(id) : null;
  const caster = message ? (globalThis.ChatMessage?.implementation?.getSpeakerActor?.(message.speaker) ?? globalThis.game?.actors?.get?.(message.speaker?.actor)) : null;
  return Boolean(caster && casterState(caster).undo?.some(use => use.id === `${context.castId}-chain` && use.status === "undone"));
}
/**
 * dnd5e.preRollSavingThrowV2: All-Consuming Disadvantage this Turn, the Safe Zone reminder (Ch.3 L840, L871), and
 * Ouroboros Disadvantage for the original target this Turn (Ch.3 L490). Only saves rolled from the cast's card apply.
 */
export function splashSaveHook(config) {
  const cast = castFromSave(config), context = cast?.context;
  const ouroboros = context?.chain?.mode === "ouroboros" && !ouroborosUndone(config, context);
  if (!context?.allConsuming && !context?.safeZone?.length && !ouroboros) return;
  const actor = config?.subject?.documentName === "Actor" ? config.subject : config?.subject?.actor;
  const options = config.rolls?.[0]?.options;
  if (context.safeZone?.includes(actor?.uuid)) globalThis.ui?.notifications?.info?.("Safe Zone: this Creature automatically succeeds on this Saving Throw and takes no Damage it would take on a success.");
  const label = ouroboros && actor?.uuid === context.chain.originalActorUuid ? "Ouroboros" : context.allConsuming ? "All-Consuming" : null;
  if (!label || !options) return;
  if (cast.turn && cast.turn === casterTurn()) {
    options.disadvantage = true;
    globalThis.ui?.notifications?.info?.(`${label}: Disadvantage on this Saving Throw against the Art this Turn.`);
  } else if (!cast.turn) globalThis.ui?.notifications?.warn?.(`${label} applies only this Turn. Outside combat, the GM applies Disadvantage manually.`);
}
export function registerCasterCastingHooks() {
  patchCasterDamage();
  Hooks.on("dnd5e.preRollSavingThrowV2", splashSaveHook);
  // `dnd5e.preRollAttackV2` is registered once, by `registerCasterFeatureHooks`, which also runs
  // `casterAttackConfig` before the drone gate so a double registration can never stack listeners.
  Hooks.on("dnd5e.postDamageRollConfiguration", (rolls, config) => {
    const activity = config.subject, context = flag(activity?.item, "casterCast") ?? {};
    if (context.noCritical) for (const roll of rolls ?? []) { roll.options.isCritical = false; roll.configureDamage?.(); }
    const currentSignature = casterEnabled(activity?.actor) && casterBranch(activity.actor) === "core" &&
      casterLevel(activity.actor) >= 15 && casterState(activity.actor).signature?.itemId === activity.item.id;
    if (context.signatureReroll && context.signatureRerollOnce !== undefined && currentSignature) {
      // Optional all-low-dice choice; the panel also supports individual chosen dice.
      for (const roll of rolls ?? []) for (const term of roll.terms ?? []) if (Number.isInteger(term.faces) && Array.isArray(term.modifiers)) {
        need(context.signatureRerollOnce || term.faces > 3, "Repeated Savant rerolls cannot terminate on dice with three or fewer faces. Resolve this die manually with the GM.");
        term.modifiers.push(`${context.signatureRerollOnce ? "r" : "rr"}<=3`);
      }
    }
  });
  Hooks.on("dnd5e.preCreateActivityTemplate", (activity, data) => {
    const context = flag(activity?.item, "casterCast");
    if (!context?.droneTokenUuid) return;
    const drone = casterDroneOrigin(activity.actor, context.droneTokenUuid), point = drone.getCenterPoint();
    data.x = point.x; data.y = point.y;
  });
}
