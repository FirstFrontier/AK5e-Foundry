/** Medic feature catalog, runtime helpers, resource pools, and mechanical hooks (Ch. 3 L4560–5050).
 * Defines Life Support, Resuscitation, and Mobile Hospital pools; predicates for base class
 * and subclasses (Physician, Triage); view summaries; and turn/rest hook handlers.
 */
import {
  MEDIC_CLASS_ID,
  medicEnabled,
  medicLevel,
  medicBranch,
  isMedic,
  isPhysician,
  isTriage,
  medicProfile,
  calculateMedicProfile,
  pbForLevel,
  medicSpellcastingAbility,
  medicSpellDC,
  medicSpellAttackMod,
  martialDC,
  lifeSupportMax,
  artsPointsForLevel,
  maxArtLevel,
  flag
} from "./medic-rules.mjs";
import {
  definePool,
  getPool,
  getPoolDefinition,
  spendPool,
  refundPool,
  setPool,
  recoverPool,
  registerLifeSupportPool
} from "./resource-pools.mjs";
import { need, values, gmActive } from "./operation-kernel.mjs";
import { grantFor, registerArtCastOptions, registerArtGrant } from "./arts-casting.mjs";
import { artsState, quoteArt } from "./arts-rules.mjs";
import { supporterArtsMembers } from "./supporter-arts.mjs";
import { resolvePoolArtData } from "./caster-setup.mjs";
import { appendArtReceipt, captureArtChanges, createReceiptItems, receiptItemRecord } from "./arts-ledger.mjs";

/** Healing Arts Pool id (Ch. 5); Urgency of Treatment applies only to these Arts (U3-3). */
export const HEALING_ARTS_POOL_ID = "special-art-pool-healing-arts-4211";
const URGENCY_ID = "urgency-of-treatment";
const SELF_DEFENCE_SOURCE = "Self-Defence Protocol";

/* ---------------------------------------------------------------- Resource Pools */

export function defineMedicPools() {
  registerLifeSupportPool();

  if (!getPoolDefinition("resuscitation")) {
    definePool({
      id: "resuscitation",
      label: "Resuscitation",
      classId: MEDIC_CLASS_ID,
      levelBasis: "classLevel",
      max: 1,
      initial: "max",
      appliesTo: actor => medicEnabled(actor) && medicLevel(actor) >= 12,
      recovery: [{ on: "lr", amount: "full" }]
    });
  }

  if (!getPoolDefinition("mobileHospital")) {
    definePool({
      id: "mobileHospital",
      label: "Mobile Hospital",
      classId: MEDIC_CLASS_ID,
      levelBasis: "classLevel",
      max: 1,
      initial: "max",
      appliesTo: actor => isTriage(actor) && medicLevel(actor) >= 15,
      recovery: [{ on: "lr", amount: "full" }]
    });
  }

  if (!getPoolDefinition("inpatientCare")) {
    definePool({
      id: "inpatientCare",
      label: "Inpatient Care",
      classId: MEDIC_CLASS_ID,
      levelBasis: "classLevel",
      max: 1,
      initial: 0,
      appliesTo: actor => isPhysician(actor) && medicLevel(actor) >= 11,
      recovery: [{
        on: "turnStart",
        amount: "toInitial",
        when(actor) {
          const queue = actor.flags?.ak5e?.medic?.inpatientCareQueue ?? [];
          if (queue.length) {
            for (const item of queue) {
              const patient = globalThis.fromUuidSync?.(item.targetUuid);
              const targetActor = patient?.actor ?? patient;
              if (targetActor) {
                const currentHp = Number(targetActor.system?.attributes?.hp?.value ?? 0);
                const maxHp = Number(targetActor.system?.attributes?.hp?.max ?? 0);
                const newHp = Math.min(maxHp || Infinity, currentHp + item.amount);
                if (targetActor.system?.attributes?.hp) targetActor.system.attributes.hp.value = newHp;
                targetActor.update?.({ "system.attributes.hp.value": newHp });
              }
            }
            if (actor.flags?.ak5e?.medic) actor.flags.ak5e.medic.inpatientCareQueue = [];
            actor.update?.({ "flags.ak5e.medic.inpatientCareQueue": [] });
          }
          return true;
        }
      }]
    });
  }
}

export const lifeSupport = actor => getPool(actor, "lifeSupport");
export const spendLifeSupport = (actor, amount, reason) => spendPool(actor, "lifeSupport", amount, { reason });
export const refundLifeSupport = (actor, amount, reason) => refundPool(actor, "lifeSupport", amount, { reason });
export const setLifeSupport = (actor, value, reason) => setPool(actor, "lifeSupport", value, { reason });

/* ---------------------------------------------------------------- Native Medic Arts (U3-2/U3-3/U3-4) */

/** Native Arts flags a Medic needs (contract item 1). Pure: the caller decides when to write them. */
export function medicArtsFlags(actor, level, ability) {
  const previousCasting = flag(actor, "casting") ?? {};
  const previousArts = flag(actor, "artsPoints") ?? null;
  const chosen = ["int", "wis", "cha"].includes(ability) ? ability
    : (["int", "wis", "cha"].includes(previousCasting.ability) ? previousCasting.ability : medicSpellcastingAbility(actor));
  const maximum = artsPointsForLevel(level), maximumArtLevel = maxArtLevel(level);
  return {
    casting: { ...previousCasting, version: 1, enabled: true, ability: chosen,
      recovery: previousCasting.recovery ?? "long", castingUnit: previousCasting.castingUnit ?? "" },
    artsPoints: { ...(previousArts ?? {}), maximum, maximumArtLevel,
      value: previousArts && Number.isFinite(Number(previousArts.value)) ? Number(previousArts.value) : maximum,
      ninthLevelCast: previousArts?.ninthLevelCast === true }
  };
}

/** Current and maximum Life Support without requiring the pool registry to be loaded. */
function lifeSupportState(actor) {
  try {
    registerLifeSupportPool();
    const pool = getPool(actor, "lifeSupport");
    return { value: Number(pool.value) || 0, max: Number(pool.max) || 0 };
  } catch {
    const stored = actor?.flags?.ak5e?.resourcePools?.lifeSupport ?? {};
    const max = Number(stored.max) || lifeSupportMax(medicLevel(actor) ?? 1);
    return { value: Number.isFinite(Number(stored.value)) ? Number(stored.value) : max, max };
  }
}

const healingArt = item => {
  const art = item?.getFlag?.("ak5e", "art") ?? item?.flags?.ak5e?.art ?? {};
  const pool = art.pool ?? item?.getFlag?.("ak5e", "pool") ?? item?.flags?.ak5e?.pool;
  return pool === HEALING_ARTS_POOL_ID;
};

/** The cast level the Urgency discount caps at: the selected cast level when the dialog or API
 * names one (U3-3, C3:4656 "that casting"), else the Art's base level. Sanitized to a safe int;
 * quoteArt itself rejects an out-of-range level and the caller falls back to the base level. */
function castLevelOf(item, context) {
  const base = Number(item?.system?.level);
  const safeBase = Number.isSafeInteger(base) && base >= 0 && base <= 9 ? base : 0;
  const raw = Number(context?.usage?.level ?? context?.usage?.ak5eLevel);
  if (!Number.isSafeInteger(raw)) return undefined;
  return Math.min(9, Math.max(safeBase, raw));
}

/** The AP cost this Art would have at the cast level before Urgency, used to cap the discount honestly. */
function healingBaseCost(actor, item, level) {
  try {
    const state = artsState(actor);
    const base = Number(item?.system?.level);
    const grant = grantFor(item, actor, {});
    try {
      return quoteArt(state, base, level ?? base, grant, {}).cost;
    } catch {
      return quoteArt(state, base, base, grant, {}).cost;
    }
  } catch { return null; }
}

/** 1 AP per 10 Life Support actually spent, capped by the casting's remaining cost (floored at 0). */
function urgencyQuote(actor, item, selection, level) {
  const requested = Math.max(0, Math.floor((Number(selection?.lifeSupport) || 0) / 10) * 10);
  if (!requested) return {};
  const available = lifeSupportState(actor).value;
  const spendable = Math.min(requested, available);
  // Units follow the printed rate (1 AP per 10 LS actually spent). Every quoted row floors its own
  // cost at 0, so upcast rows show the full cast-level discount even before a level is selected.
  const units = Math.max(0, Math.floor(spendable / 10));
  // Only whole units up to the casting's remaining cost ever leave the pool (no fractional overspend).
  const remaining = healingBaseCost(actor, item, level);
  const payable = remaining === null ? units : Math.min(units, Math.max(0, remaining));
  return { discounts: units ? [{ amount: units, source: "Urgency of Treatment" }] : [], lifeSupportCost: payable * 10 };
}

function urgencyValidate(actor, item, selection, level) {
  const warnings = [];
  const wanted = Number(selection?.lifeSupport) || 0;
  const requested = Math.max(0, Math.floor(wanted / 10) * 10);
  if (wanted % 10 !== 0) warnings.push({ id: "round", text: "Urgency of Treatment spends Life Support in multiples of 10; the request is rounded down." });
  if (!requested) return { warnings, errors: [] };
  const available = lifeSupportState(actor).value;
  if (requested > available) warnings.push({ id: "short", text: `Only ${available} Life Support is available; the Urgency request is clamped to ${Math.floor(available / 10) * 10}.` });
  const base = healingBaseCost(actor, item, level);
  const spendable = Math.min(requested, available);
  if (base !== null && spendable > base * 10) {
    warnings.push({ id: "excess", text: `${spendable - base * 10} Life Support would be wasted; this Art costs only ${base} AP.` });
  }
  return { warnings, errors: [] };
}

function urgencyConsume(actor, item, selection, updates, receipt, level) {
  const requested = Math.max(0, Math.floor((Number(selection?.lifeSupport) || 0) / 10) * 10);
  const quoted = urgencyQuote(actor, item, selection, level);
  const cost = quoted.lifeSupportCost ?? 0;
  if (receipt) {
    receipt.lifeSupportCost = cost;
    receipt.lifeSupportRequested = requested;
    receipt.lifeSupportShortfall = Math.max(0, requested - cost);
  }
  if (!cost) return;
  // Compose from the pending cast update, never overwrite a staged provider write from a live snapshot.
  const pending = Number(updates?.actor?.["flags.ak5e.resourcePools.lifeSupport.value"]);
  const available = Number.isFinite(pending) ? pending : lifeSupportState(actor).value;
  updates.actor ??= {};
  updates.actor["flags.ak5e.resourcePools.lifeSupport.value"] = Math.max(0, Math.min(available, available - cost));
}

/** Cast-option provider: offered only for a Medic's Healing Arts Pool Arts (U3-3). */
function medicCastOptions(actor, item, activity, context) {
  if (!medicEnabled(actor) || !hasUrgencyOfTreatment(actor) || !healingArt(item)) return null;
  // The engine passes the cast context through; the discount caps at the selected cast level.
  const level = castLevelOf(item, context);
  return {
    id: URGENCY_ID,
    label: "Urgency of Treatment",
    fields: [{ name: "lifeSupport", label: "Life Support", type: "number", min: 0, step: 10 }],
    validate: selection => urgencyValidate(actor, item, selection, level),
    quote: selection => urgencyQuote(actor, item, selection, level),
    consume: (selection, updates, receipt) => urgencyConsume(actor, item, selection, updates, receipt, level)
  };
}

/** Grant adapter: an Art created by Self-Defence Protocol carries its AP reduction (U3-4). */
function medicArtGrant(actor, item) {
  const grant = item?.getFlag?.("ak5e", "medicArtGrant") ?? item?.flags?.ak5e?.medicArtGrant;
  if (!grant || grant.source !== SELF_DEFENCE_SOURCE) return {};
  return { reduction: selfDefenceProtocolReduction(actor), source: SELF_DEFENCE_SOURCE };
}

let medicArtsRegistered = false;
/** Idempotent: registers the Urgency quote/validate/consume provider and the Self-Defence grant. */
export function registerMedicArts() {
  if (medicArtsRegistered) return false;
  medicArtsRegistered = true;
  registerLifeSupportPool();
  registerArtCastOptions(medicCastOptions);
  registerArtGrant(medicArtGrant);
  return true;
}

/** Read-only preview of the chosen Standard Arts Pool (levelled Arts up to 5th plus cantrips). */
export async function previewSelfDefenceProtocol(actor, { poolId } = {}) {
  need(actor?.isOwner, "Choose an owned Medic.");
  need(actor?.documentName === "Actor" && !actor.pack, "Choose a live Actor.");
  need(typeof poolId === "string" && poolId, "Choose a Standard Arts Pool.");
  const members = supporterArtsMembers(poolId);
  const existing = values(actor.items).filter(item => item.type === "spell");
  const creates = [], known = [], missing = [];
  for (const member of members) {
    const present = existing.find(item => {
      const grant = item.getFlag?.("ak5e", "medicArtGrant") ?? item.flags?.ak5e?.medicArtGrant;
      return grant?.name === member.name || String(item.name ?? "").toLowerCase() === member.name.toLowerCase();
    });
    if (present) { known.push(member.name); continue; }
    const data = await resolvePoolArtData(member.name, member.level, [poolId]);
    if (!data) { missing.push({ name: member.name, level: member.level }); continue; }
    data.system = { ...data.system, prepared: 2, method: "ak5e" };
    data.flags = { ...(data.flags ?? {}) };
    data.flags.ak5e = { ...(data.flags.ak5e ?? {}),
      medicArtGrant: { source: SELF_DEFENCE_SOURCE, poolId, name: member.name } };
    // Assign the id before creation so the undo receipt can name exactly the Arts this use granted.
    data._id = globalThis.foundry?.utils?.randomID?.() ?? `medic-sdp-${poolId}-${member.level}-${member.name}`;
    creates.push(data);
  }
  const reduction = selfDefenceProtocolReduction(actor);
  const previousPool = flag(actor, "medic")?.selfDefenceProtocol?.poolId ?? null;
  const warnings = [];
  // A missing source prerequisite is advisory (WORKFLOW 3.2): warn, never block. The confirmed apply
  // carries this warning onto the receipt and result so the table sees the override.
  if (!hasSelfDefenceProtocol(actor)) {
    warnings.push("Self-Defence Protocol is a Medic level 5 feature and this character does not currently meet that prerequisite; continuing is a confirmed override (warning only).");
  }
  if (missing.length) warnings.push(`${missing.length} chosen-pool Arts need a GM-approved spell mapping: ${missing.map(entry => entry.name).join(", ")}.`);
  if (previousPool && previousPool === poolId) {
    warnings.push("Self-Defence Protocol must choose a Standard Arts Pool you have not chosen previously; the same pool is already recorded (warning only).");
  }
  const contextKey = JSON.stringify([actor.uuid, poolId, reduction, creates.map(data => data.name), known]);
  return {
    poolId, pool: poolId, reduction, creates, existing: known, missing, contextKey,
    warnings
  };
}

/** Apply the exact previewed grant. Owned Arts are never duplicated or overwritten. */
export async function applySelfDefenceProtocol(actor, { poolId, confirmed, contextKey } = {}) {
  need(confirmed === true, "Confirm the previewed Self-Defence Protocol first.");
  const plan = await previewSelfDefenceProtocol(actor, { poolId });
  need(plan.contextKey === contextKey, "The character changed since the preview; preview the Self-Defence Protocol again.");
  const updates = { "flags.ak5e.medic.selfDefenceProtocol": { poolId, source: SELF_DEFENCE_SOURCE, reduction: plan.reduction } };
  const changes = captureArtChanges(actor, updates);
  const items = plan.creates.map(receiptItemRecord).filter(Boolean);
  let receipt = null;
  if (changes.length || items.length) {
    receipt = {
      id: `medic-self-defence-${String(actor.id ?? actor.uuid).replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now().toString(36)}`,
      name: "Self-Defence Protocol", level: medicLevel(actor), cost: 0, source: SELF_DEFENCE_SOURCE,
      actorUuid: actor.uuid, changes, items, warnings: [...plan.warnings]
    };
    updates["flags.ak5e.artReceipts"] = appendArtReceipt(actor, receipt, changes);
  }
  await actor.update(updates);
  await createReceiptItems(actor, receipt?.id, plan.creates);
  return { poolId, reduction: plan.reduction, granted: plan.creates.map(data => data.name),
    missing: plan.missing.map(entry => entry.name),
    warnings: [...plan.warnings],
    receipt: receipt ? structuredClone(receipt) : null };
}


export const resuscitation = actor => getPool(actor, "resuscitation");
export const spendResuscitation = (actor, amount = 1, reason) => spendPool(actor, "resuscitation", amount, { reason });
export const refundResuscitation = (actor, amount = 1, reason) => refundPool(actor, "resuscitation", amount, { reason });

export const mobileHospital = actor => getPool(actor, "mobileHospital");
export const spendMobileHospital = (actor, amount = 1, reason) => spendPool(actor, "mobileHospital", amount, { reason });
export const refundMobileHospital = (actor, amount = 1, reason) => refundPool(actor, "mobileHospital", amount, { reason });

/* ---------------------------------------------------------------- Feature Predicates: Base Medic */

export function hasTouchHeal(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 1;
}

export function hasPreserver(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 1;
}

export function hasUrgencyOfTreatment(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 1;
}

export function hasMedicalExpertise(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 1;
}

export function hasSelfDefenceProtocol(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 5;
}

export function selfDefenceProtocolReduction(actor) {
  if (!hasSelfDefenceProtocol(actor)) return 0;
  return medicLevel(actor) >= 11 ? 2 : 1;
}

export function hasResuscitation(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 12;
}

export function hasToRobTheFerryman(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 18;
}

export function toRobTheFerrymanBonus(actor) {
  if (!hasToRobTheFerryman(actor)) return 0;
  return 3 * medicLevel(actor);
}

export function hasChosenOfAsclepius(actor) {
  return medicEnabled(actor) && medicLevel(actor) >= 20;
}

/* ---------------------------------------------------------------- Feature Predicates: Physician */

export function hasFocusedTreatment(actor) {
  return isPhysician(actor) && medicLevel(actor) >= 1;
}

export function focusedTreatmentBonus(actor) {
  if (!hasFocusedTreatment(actor)) return 0;
  return pbForLevel(medicLevel(actor));
}

export function hasIntravenousLine(actor) {
  return isPhysician(actor) && medicLevel(actor) >= 4;
}

export function intravenousLineDie(actor) {
  if (!hasIntravenousLine(actor)) return null;
  return medicLevel(actor) >= 7 ? "2d6" : "1d6";
}

export function hasHypocriticOath(actor) {
  return isPhysician(actor) && medicLevel(actor) >= 7;
}

export function hasInpatientCare(actor) {
  return isPhysician(actor) && medicLevel(actor) >= 11;
}

export function inpatientCareHeal(healed) {
  const half = Math.floor(Number(healed || 0) / 2);
  return Math.max(half, 15);
}

export function hasSurgeonGeneral(actor) {
  return isPhysician(actor) && medicLevel(actor) >= 15;
}

/* ---------------------------------------------------------------- Feature Predicates: Triage */

export function hasOnTheScene(actor) {
  return isTriage(actor) && medicLevel(actor) >= 1;
}

export function onTheSceneDie(actor) {
  if (!hasOnTheScene(actor)) return null;
  return medicLevel(actor) >= 7 ? "2d6" : "1d6";
}

export function hasUrgentCareCentre(actor) {
  return isTriage(actor) && medicLevel(actor) >= 4;
}

export function urgentCareCentreAura(rolled) {
  return Math.floor(Number(rolled || 0) / 2);
}

export function hasStopTheFlow(actor) {
  return isTriage(actor) && medicLevel(actor) >= 7;
}

export function hasTouchOfLifeAndDeath(actor) {
  return isTriage(actor) && medicLevel(actor) >= 11;
}

export function hasMobileHospital(actor) {
  return isTriage(actor) && medicLevel(actor) >= 15;
}

/* ---------------------------------------------------------------- State & Inspection */

export function medicState(actor) {
  return flag(actor, "medic") ?? {};
}

export async function updateMedicState(actor, updates) {
  need(actor?.isOwner, "Actor ownership is required to update Medic state.");
  const current = medicState(actor);
  const merged = { ...current, ...updates };
  await actor.update({ "flags.ak5e.medic": merged });
  return merged;
}

/** Read-only view for the sheet panel and public API. */
export function getMedicView(actor) {
  const profile = medicProfile(actor);
  const state = medicState(actor);
  const level = profile.level ?? 1;
  const branch = profile.branch;

  return {
    profile,
    state,
    level,
    branch,
    lifeSupport: profile.applicable ? lifeSupport(actor) : null,
    resuscitation: level >= 12 ? resuscitation(actor) : null,
    mobileHospital: branch === "triage" && level >= 15 ? mobileHospital(actor) : null,
    features: {
      touchHeal: hasTouchHeal(actor),
      preserver: hasPreserver(actor),
      urgencyOfTreatment: hasUrgencyOfTreatment(actor),
      medicalExpertise: hasMedicalExpertise(actor),
      selfDefenceProtocol: hasSelfDefenceProtocol(actor),
      selfDefenceReduction: selfDefenceProtocolReduction(actor),
      resuscitation: hasResuscitation(actor),
      toRobTheFerryman: hasToRobTheFerryman(actor),
      toRobBonus: toRobTheFerrymanBonus(actor),
      chosenOfAsclepius: hasChosenOfAsclepius(actor),
      // Physician
      focusedTreatment: hasFocusedTreatment(actor),
      intravenousLine: hasIntravenousLine(actor),
      hypocriticOath: hasHypocriticOath(actor),
      inpatientCare: hasInpatientCare(actor),
      surgeonGeneral: hasSurgeonGeneral(actor),
      // Triage
      onTheScene: hasOnTheScene(actor),
      urgentCareCentre: hasUrgentCareCentre(actor),
      stopTheFlow: hasStopTheFlow(actor),
      touchOfLifeAndDeath: hasTouchOfLifeAndDeath(actor),
      mobileHospital: hasMobileHospital(actor)
    },
    manual: [
      "Touch Heal: Spend X Life Support to restore X missing HP (1:1 conversion). Constructs emit non-blocking warning (Ch. 1 L138).",
      "Preserver: Spend 5 Life Support on healing/THP roll to reroll any number of dice.",
      "Urgency of Treatment: Spend multiples of 10 Life Support to reduce Healing Art AP cost by 1 per 10 spent.",
      "Medical Expertise: Double proficiency bonus for Medicine skill checks (Expertise).",
      "Self-Defence Protocol: Learn standard Arts pool <= 5th level; AP cost reduced by 1 (Lv 5) or 2 (Lv 11).",
      "Resuscitation: 1/Long Rest free Revivify cast at level 12.",
      "To Rob the Ferryman: Revivify restores 3 * Medic Level HP at level 18.",
      "Chosen of Asclepius: Optional maximum value on all healing dice at level 20.",
      "Physician - Focused Treatment: Add PB to single-target healing or damage roll.",
      "Physician - Intravenous Line: 10 LS, 15 ft tuning wire. Unwilling CON save (2d8 Necrotic on pass; tuned on fail). Sense target, +1d6 (Lv 4) / +2d6 (Lv 7) once/turn.",
      "Physician - Hypocritic Oath: Heal-to-harm toggle. CON save vs Spell DC (full Necrotic on fail, half on pass). Counts as healing for triggers.",
      "Physician - Inpatient Care: Reaction, 15 LS. At start of Medic's next turn, target heals max(floor(healed/2), 15).",
      "Physician - Surgeon-General: Doubles total HP restored on single creature via Life Support, Art, or Operator Skill.",
      "Triage - On the Scene: 10 LS, move without AoO. Heal or Harm up to PB targets within 5 ft.",
      "Triage - Urgent Care Centre: When rolling healing to self with a levelled Art, all creatures within 10 ft heal floor(rolled / 2).",
      "Triage - Stop the Flow: 20 LS, Touch. Dying target (0 HP) immediately gains 6 Mettle (hard cap 8). Cannot receive again while Dying.",
      "Triage - Touch of Life and Death: 10 LS rider on On the Scene. Heal ends condition <=1 hr; Harm inflicts Poisoned.",
      "Triage - Mobile Hospital: 1/LR Bonus Action, 30 ft aura for 1 minute. Moving into or entering space heals 3d6+mod HP once/round per creature."
    ]
  };
}

/* ---------------------------------------------------------------- Hooks & Automation */

let hooksInstalled = false;

export function registerMedicHooks() {
  if (hooksInstalled) return false;
  hooksInstalled = true;
  defineMedicPools();

  // Clean-up or turn start processing (e.g., Inpatient Care queue notification)
  if (globalThis.Hooks?.on) {
    Hooks.on("dnd5e.restCompleted", (actor, result, config = {}) => {
      if (actor?.isOwner && medicEnabled(actor)) {
        defineMedicPools();
      }
    });

    Hooks.on("updateActor", (actor, changes) => {
      const newHp = Number(changes?.system?.attributes?.hp?.value);
      if (Number.isFinite(newHp) && newHp > 0 && flag(actor, "dying")?.stopTheFlowReceived) {
        actor.update?.({ "flags.ak5e.dying.stopTheFlowReceived": false });
      }
    });
  }
  return true;
}
