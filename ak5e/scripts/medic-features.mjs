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
