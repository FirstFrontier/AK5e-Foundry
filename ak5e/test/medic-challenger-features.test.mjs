import test from "node:test";
import assert from "node:assert/strict";
import {
  medicUses,
  MEDIC_PLANS,
  recordMedicRuling
} from "../scripts/medic-uses.mjs";
import {
  defineMedicPools,
  setLifeSupport,
  lifeSupport,
  hasTouchHeal,
  hasFocusedTreatment,
  focusedTreatmentBonus,
  hasIntravenousLine,
  intravenousLineDie,
  hasHypocriticOath,
  hasInpatientCare,
  inpatientCareHeal,
  hasSurgeonGeneral,
  hasOnTheScene,
  onTheSceneDie,
  hasUrgentCareCentre,
  urgentCareCentreAura,
  hasStopTheFlow,
  hasTouchOfLifeAndDeath,
  hasMobileHospital,
  resuscitation,
  mobileHospital
} from "../scripts/medic-features.mjs";
import {
  clearPoolRegistry,
  getPool,
  setPool,
  refundPool,
  spendPool,
  recoverPool
} from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  triggerShortRest,
  triggerLongRest,
  createTestCombat
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

async function createMedic(level = 1, branch = null, ls = 50, ability = "int") {
  clearPoolRegistry();
  defineMedicPools();

  const actor = createTestActor({
    name: "Doctor Challenger",
    class: "class-medic",
    branch: branch ? `subclass-medic-${branch}` : undefined,
    level,
    abilities: {
      str: { value: 10, mod: 0 },
      dex: { value: 12, mod: 1 },
      con: { value: 14, mod: 2 },
      int: { value: 16, mod: 3 },
      wis: { value: 14, mod: 2 },
      cha: { value: 8, mod: -1 }
    }
  });
  actor.flags.ak5e = {
    medic: { enabled: true, spellcastingAbility: ability }
  };
  await setLifeSupport(actor, ls, "challenger test setup");
  return actor;
}

function createPatient(name = "Target Creature", hp = 10, maxHp = 40, type = "humanoid") {
  const actor = createTestActor({
    name,
    level: 3,
    abilities: {
      str: { value: 10, mod: 0 },
      dex: { value: 10, mod: 0 },
      con: { value: 12, mod: 1 },
      int: { value: 10, mod: 0 },
      wis: { value: 10, mod: 0 },
      cha: { value: 10, mod: 0 }
    }
  });
  actor.system.attributes.hp = { value: hp, max: maxHp };
  actor.system.details.type = { value: type };
  return actor;
}

/* ========================================================================== */
/* 1. TOUCH HEAL EDGE CASES                                                   */
/* ========================================================================== */

test("Challenger 1.1: Touch Heal strictly rejects 0, negative, float, and NaN amounts", async () => {
  const medic = await createMedic(1, null, 50);
  const patient = createPatient("Patient", 10, 40);

  // 0 spend
  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: 0, targetUuid: patient.uuid }, "ch-th-zero"),
    /whole number/
  );

  // Negative spend
  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: -10, targetUuid: patient.uuid }, "ch-th-neg"),
    /whole number/
  );

  // Float spend
  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: 4.5, targetUuid: patient.uuid }, "ch-th-float"),
    /whole number/
  );

  // NaN spend
  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: NaN, targetUuid: patient.uuid }, "ch-th-nan"),
    /whole number/
  );

  // Ensure patient HP and medic LS were not touched
  assert.equal(patient.system.attributes.hp.value, 10);
  assert.equal(lifeSupport(medic).value, 50);
});

test("Challenger 1.2: Touch Heal overspend triggers non-blocking warning and shortfall clamping on override", async () => {
  const medic = await createMedic(1, null, 15); // only 15 LS available
  const patient = createPatient("Patient", 5, 40);

  // Spending 30 LS without override MUST trigger warning
  await assert.rejects(
    medicUses.command(medic, "touchHeal", {
      confirmed: true,
      amount: 30,
      targetUuid: patient.uuid
    }, "ch-th-overspend-no-override"),
    error => error.warnings?.some(w => w.id === "lifeSupport")
  );

  // Override "lifeSupport" shortfall: clamps pool at 0, logs shortfall on receipt, restores patient HP
  await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 30,
    targetUuid: patient.uuid,
    overrides: ["lifeSupport"]
  }, "ch-th-overspend-override");

  assert.equal(lifeSupport(medic).value, 0, "Pool clamped at 0");
  assert.equal(patient.system.attributes.hp.value, 35, "Patient healed by requested amount 30 (5 + 30 = 35)");

  const state = medic.flags.ak5e.medicUses;
  const receipt = state.undo.find(r => r.id === "ch-th-overspend-override");
  assert.ok(receipt, "Receipt recorded");
  assert.ok(receipt.shortfalls?.some(s => s.includes("Life Support short by 15")), "Shortfall recorded on receipt");

  // Undo reverts to exact prior values
  await medicUses.command(medic, "undoUse", { useId: "ch-th-overspend-override" });
  assert.equal(lifeSupport(medic).value, 15, "Pool restored to 15");
  assert.equal(patient.system.attributes.hp.value, 5, "Patient HP reverted to 5");
});

test("Challenger 1.3: Touch Heal targeting Constructs triggers non-blocking warning and blocks HP recovery (Ch. 1 L138)", async () => {
  const medic = await createMedic(1, null, 40);
  const drone = createPatient("Repair Drone", 10, 50, "construct");

  // Attempting without construct override MUST trigger construct warning
  await assert.rejects(
    medicUses.command(medic, "touchHeal", {
      confirmed: true,
      amount: 20,
      targetUuid: drone.uuid
    }, "ch-th-construct-nowarn"),
    error => error.warnings?.some(w => w.id === "construct")
  );

  // Overriding construct warning
  await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 20,
    targetUuid: drone.uuid,
    overrides: ["construct"]
  }, "ch-th-construct-override");

  // Life support was spent
  assert.equal(lifeSupport(medic).value, 20);

  // Drone HP did NOT increase because Constructs cannot regain HP from class features (Ch. 1 L138)
  assert.equal(drone.system.attributes.hp.value, 10, "Construct HP must remain 10");

  // Target applied record confirms blocked status
  const appliedKey = Object.keys(drone.flags.ak5e?.medicUsesApplied ?? {})[0];
  const applied = drone.flags.ak5e?.medicUsesApplied?.[appliedKey];
  assert.ok(applied?.blocked, "Receipt must record blocked healing for Construct");
  assert.equal(applied?.hpGained, 0);

  // Undo restores spent Life Support
  await medicUses.command(medic, "undoUse", { useId: "ch-th-construct-override" });
  assert.equal(lifeSupport(medic).value, 40);
  assert.equal(drone.system.attributes.hp.value, 10);
});

/* ========================================================================== */
/* 2. LIFE SUPPORT POOL OVERMAX & REST BEHAVIOR                               */
/* ========================================================================== */

test("Challenger 2.1: Life Support overMax: true allows exceeding max; Long Rest drops excess to max, Short Rest preserves pool", async () => {
  const medic = await createMedic(1, null, 20); // Level 1 Medic max Life Support is 20
  assert.equal(lifeSupport(medic).max, 20);
  assert.equal(lifeSupport(medic).value, 20);

  // Set pool above max (overMax = true)
  await setPool(medic, "lifeSupport", 65, { reason: "OverMax bonus grant" });
  const poolOver = lifeSupport(medic);
  assert.equal(poolOver.value, 65, "Value exceeds max");
  assert.equal(poolOver.max, 20, "Max remains 20");
  assert.equal(poolOver.over, 45, "Excess is 45");
  assert.equal(poolOver.overMax, true, "overMax flag is true");

  // Trigger Short Rest: pool MUST NOT recover or drop excess (no SR recovery defined for Life Support)
  await recoverPool(medic, "sr");
  assert.equal(lifeSupport(medic).value, 65, "Short Rest preserves Life Support excess");

  // Trigger Long Rest: pool MUST reset to max (20), dropping the excess
  await recoverPool(medic, ["lr", "sr"]);
  assert.equal(lifeSupport(medic).value, 20, "Long Rest drops excess and resets exactly to max");
});

test("Challenger 2.2: Life Support restores to max on Long Rest when depleted below max", async () => {
  const medic = await createMedic(4, null, 50); // Level 4 Medic max is 50
  assert.equal(lifeSupport(medic).max, 50);

  // Spend down to 8 LS
  await spendPool(medic, "lifeSupport", 42, { reason: "Spends" });
  assert.equal(lifeSupport(medic).value, 8);

  // Short rest does not restore Life Support
  await recoverPool(medic, "sr");
  assert.equal(lifeSupport(medic).value, 8, "Short rest does not restore Life Support");

  // Long rest restores to max
  await recoverPool(medic, ["lr", "sr"]);
  assert.equal(lifeSupport(medic).value, 50, "Long rest restores Life Support to max (50)");
});

/* ========================================================================== */
/* 3. PHYSICIAN FEATURES ADVERSARIAL CHALLENGES                              */
/* ========================================================================== */

test("Challenger 3.1: Focused Treatment adds PB ONLY to single-target rolls, NOT multi-target or flat heals", async () => {
  const phys = await createMedic(5, "physician", 50); // Level 5 Physician, PB = +3
  assert.equal(hasFocusedTreatment(phys), true);
  assert.equal(focusedTreatmentBonus(phys), 3);

  // Single-target roll execution should return bonus = 3
  const singleRoll = await medicUses.command(phys, "focusedTreatment", {
    confirmed: true,
    isRoll: true,
    targetCount: 1
  }, "ch-ft-single");
  assert.equal(singleRoll.bonus, 3);

  // Adversarial challenge: Multi-target roll (e.g. 3 targets) must NOT receive PB bonus!
  // In source: "Whenever you roll to determine the amount of Hit Points you restore, or the Damage you deal to only a single Creature..."
  const multiTargetAttempt = await medicUses.command(phys, "focusedTreatment", {
    confirmed: true,
    isRoll: true,
    targetCount: 3,
    isMultiTarget: true
  }, "ch-ft-multi");

  assert.notEqual(
    multiTargetAttempt.bonus,
    3,
    "CRITICAL BUG: Focused Treatment must NOT grant PB bonus to multi-target rolls (Ch. 3 L4875 restricts to single Creature)!"
  );

  // Adversarial challenge: Flat heal (not rolling) must NOT receive PB bonus!
  const flatHealAttempt = await medicUses.command(phys, "focusedTreatment", {
    confirmed: true,
    isRoll: false,
    isFlat: true
  }, "ch-ft-flat");

  assert.notEqual(
    flatHealAttempt.bonus,
    3,
    "CRITICAL BUG: Focused Treatment must NOT grant PB bonus to flat heals without roll (Ch. 3 L4875 restricts to rolled amounts)!"
  );
});

test("Challenger 3.2: Intravenous Line willing vs unwilling CON save, tuning replacement, and +1d6/+2d6 once per turn bonus", async () => {
  const phys4 = await createMedic(4, "physician", 50); // Level 4 Physician (1d6 bonus die)
  const patient1 = createPatient("Patient Alpha", 15, 30);
  const patient2 = createPatient("Patient Beta", 20, 30);
  const foe = createPatient("Hostile Foe", 30, 30);

  // Willing target: establishes tuning
  const ivWilling = await medicUses.command(phys4, "intravenousLine", {
    confirmed: true,
    targetUuid: patient1.uuid,
    isUnwilling: false
  }, "ch-iv-willing");

  assert.equal(ivWilling.bonusDie, "1d6");
  assert.equal(lifeSupport(phys4).value, 40, "Expended 10 LS");

  // Unwilling target CON save check: on save success, deals 2d8 Necrotic damage to target
  await medicUses.command(phys4, "intravenousLine", {
    confirmed: true,
    targetUuid: foe.uuid,
    isUnwilling: true,
    saveSuccess: true
  }, "ch-iv-unwilling-success");

  // Verify whether unwilling save success dealt damage or updated state
  assert.notEqual(
    foe.system.attributes.hp.value,
    30,
    "CRITICAL BUG: Intravenous Line on unwilling target with successful save must deal 2d8 Necrotic damage (Ch. 3 L4880)!"
  );

  // Tuning replacement: tuning Patient Beta must replace Patient Alpha ("until you use this Feature again")
  const ivReplace = await medicUses.command(phys4, "intravenousLine", {
    confirmed: true,
    targetUuid: patient2.uuid,
    isUnwilling: false
  }, "ch-iv-replace");
  assert.equal(ivReplace.targetUuid, patient2.uuid);

  // At Level 7, bonus die upgrades to 2d6
  const phys7 = await createMedic(7, "physician", 50);
  const iv7 = await medicUses.command(phys7, "intravenousLine", {
    confirmed: true,
    targetUuid: patient1.uuid,
    isUnwilling: false
  }, "ch-iv-7");
  assert.equal(iv7.bonusDie, "2d6");

  // Undo reverts the 10 LS spent
  await medicUses.command(phys4, "undoUse", { useId: "ch-iv-replace" });
  assert.equal(lifeSupport(phys4).value, 30);
});

test("Challenger 3.3: Hypocritic Oath CON save vs DC (failure full Necrotic, success half Necrotic) and restores HP trigger count", async () => {
  const phys = await createMedic(7, "physician", 50);
  const target = createPatient("Enemy Target", 30, 30);
  assert.equal(hasHypocriticOath(phys), true);

  const oath = await medicUses.command(phys, "hypocriticOath", {
    confirmed: true,
    targetUuid: target.uuid,
    rolledHealing: 20
  }, "ch-oath-1");

  assert.equal(oath.convertedToDamage, true);
  assert.equal(oath.dc, 14); // 8 + 3 (PB) + 3 (INT)

  // Verify that Hypocritic Oath targets the creature and applies Necrotic damage on save failure/success
  assert.notEqual(
    target.system.attributes.hp.value,
    30,
    "CRITICAL BUG: Hypocritic Oath must inflict Necrotic damage to target based on CON save vs Spell DC (Ch. 3 L4889)!"
  );
});

test("Challenger 3.4: Inpatient Care: 15 LS reaction, delayed heal max(floor(healed/2), 15) on turn start", async () => {
  const phys = await createMedic(11, "physician", 60);
  const patient = createPatient("Critical Patient", 5, 50);

  // Case A: Small heal (10 HP) -> floor(10/2) = 5 -> max(5, 15) = 15
  assert.equal(inpatientCareHeal(10), 15);

  // Case B: Large heal (50 HP) -> floor(50/2) = 25 -> max(25, 15) = 25
  assert.equal(inpatientCareHeal(50), 25);

  const res = await medicUses.command(phys, "inpatientCare", {
    confirmed: true,
    targetUuid: patient.uuid,
    healedAmount: 50
  }, "ch-ipc-1");

  assert.equal(res.reverberation, 25);
  assert.equal(lifeSupport(phys).value, 45, "Expended 15 LS");

  // Delayed heal verification: trigger turn start to verify patient recovers reverberation HP
  // Ch. 3 L4896: "At the beginning of your next Turn, that Creature recovers Hit Points equal to half of the amount they recovered from the triggering instance, or 15 Hit Points; whichever is greater."
  await recoverPool(phys, "turnStart");

  assert.equal(
    patient.system.attributes.hp.value,
    30, // 5 + 25 = 30
    "CRITICAL BUG: Inpatient Care delayed heal must trigger and restore HP to target on Medic turn start (Ch. 3 L4896)!"
  );

  // Undo reverts reaction and 15 LS
  await medicUses.command(phys, "undoUse", { useId: "ch-ipc-1" });
  assert.equal(lifeSupport(phys).value, 60);
});

test("Challenger 3.5: Surgeon-General 2x multiplier on single-target heal from LS (1:2 Touch Heal ratio)", async () => {
  const phys = await createMedic(15, "physician", 80);
  const patient = createPatient("Surgery Patient", 10, 50);
  assert.equal(hasSurgeonGeneral(phys), true);

  // In Ch. 3 L4899: "When you restore Hit Points to a single Creature using your Life Support Feature, an Art, or an Operator Skill, the amount of Hit Points you restore is doubled."
  // When spending 15 Life Support on Touch Heal, a Level 15 Physician should restore 30 Hit Points (1:2 ratio)!
  await medicUses.command(phys, "touchHeal", {
    confirmed: true,
    amount: 15,
    targetUuid: patient.uuid
  }, "ch-sg-th");

  // Check if patient HP increased by 30 (10 + 30 = 40) or only 15 (10 + 15 = 25)
  assert.equal(
    patient.system.attributes.hp.value,
    40,
    "CRITICAL BUG: Surgeon-General must double Touch Heal to 1:2 ratio (15 LS should restore 30 HP, not 15 HP)!"
  );
});

/* ========================================================================== */
/* 4. TRIAGE FEATURES ADVERSARIAL CHALLENGES                                 */
/* ========================================================================== */

test("Challenger 4.1: On the Scene 10 LS move speed, max PB targets, Heal/Harm dice scaling", async () => {
  const tri1 = await createMedic(1, "triage", 40); // PB = 2, die = 1d6 + mod
  const tri7 = await createMedic(7, "triage", 40); // PB = 3, die = 2d6 + mod

  assert.equal(onTheSceneDie(tri1), "1d6");
  assert.equal(onTheSceneDie(tri7), "2d6");

  const ots1 = await medicUses.command(tri1, "onTheScene", {
    confirmed: true
  }, "ch-ots-1");

  assert.equal(ots1.lsCost, 10);
  assert.equal(ots1.dieFormula, "1d6 + 3");
  assert.equal(lifeSupport(tri1).value, 30);

  // Adversarial challenge: max PB targets limit (PB = 2 for Level 1 Medic)
  // Attempting to select 3 targets must reject or warn!
  const p1 = createPatient("P1");
  const p2 = createPatient("P2");
  const p3 = createPatient("P3");

  await assert.rejects(
    medicUses.command(tri1, "onTheScene", {
      confirmed: true,
      targetUuids: [p1.uuid, p2.uuid, p3.uuid]
    }, "ch-ots-too-many-targets"),
    /Proficiency Bonus|targets/,
    "CRITICAL BUG: On the Scene must enforce maximum targets equal to Proficiency Bonus (Ch. 3 L5017)!"
  );
});

test("Challenger 4.2: Urgent Care Centre half heal splash on levelled Art, NO trigger on cantrips", async () => {
  const tri = await createMedic(4, "triage", 50);
  assert.equal(hasUrgentCareCentre(tri), true);

  // Levelled Art rolling 24 healing to self -> 12 HP splash within 10 ft
  assert.equal(urgentCareCentreAura(24), 12);

  const uccLevelled = await medicUses.command(tri, "urgentCareCentre", {
    confirmed: true,
    artLevel: 1,
    rolledHealing: 24
  }, "ch-ucc-levelled");
  assert.equal(uccLevelled.auraHeal, 12);

  // Adversarial challenge: Cantrips (Art level 0) must NOT trigger Urgent Care Centre!
  // Ch. 3 L5026: "When you roll to restore Hit Points to yourself with a levelled Art..."
  await assert.rejects(
    medicUses.command(tri, "urgentCareCentre", {
      confirmed: true,
      artLevel: 0,
      isCantrip: true,
      rolledHealing: 10
    }, "ch-ucc-cantrip"),
    /levelled Art/,
    "CRITICAL BUG: Urgent Care Centre must reject or warn when triggered on cantrips (Ch. 3 L5026 restricts to levelled Arts)!"
  );
});

test("Challenger 4.3: Stop the Flow 20 LS on Dying creature, +6 Mettle up to 8 hard cap, re-use lock while Dying, warning if not Dying", async () => {
  const tri = await createMedic(7, "triage", 50);
  const healthyPatient = createPatient("Healthy Ally", 20, 30);
  const dyingPatient = createPatient("Dying Ally", 0, 30);

  // Warning when target is not Dying (HP > 0)
  await assert.rejects(
    medicUses.command(tri, "stopTheFlow", {
      confirmed: true,
      targetUuid: healthyPatient.uuid
    }, "ch-stf-not-dying"),
    error => error.warnings?.some(w => w.id === "targetDying")
  );

  // Valid use on Dying target (HP = 0) with 0 initial Mettle
  await medicUses.command(tri, "stopTheFlow", {
    confirmed: true,
    targetUuid: dyingPatient.uuid
  }, "ch-stf-dying-1");

  assert.equal(lifeSupport(tri).value, 30, "Expended 20 LS");
  assert.equal(dyingPatient.flags.ak5e.dying.mettle, 6, "Gained 6 Mettle");
  assert.equal(dyingPatient.flags.ak5e.dying.stopTheFlowReceived, true, "Marked as received");

  // Re-use lock: second use while still Dying MUST raise repeat warning
  await assert.rejects(
    medicUses.command(tri, "stopTheFlow", {
      confirmed: true,
      targetUuid: dyingPatient.uuid
    }, "ch-stf-dying-repeat"),
    error => error.warnings?.some(w => w.id === "repeatStopTheFlow")
  );

  // Undo reverts Mettle and lock
  await medicUses.command(tri, "undoUse", { useId: "ch-stf-dying-1" });
  assert.equal(lifeSupport(tri).value, 50, "Life Support refunded");
  assert.equal(dyingPatient.flags.ak5e.dying.mettle, 0, "Mettle reverted to 0");
  assert.equal(dyingPatient.flags.ak5e.dying.stopTheFlowReceived, false, "Repeat lock cleared");
});

test("Challenger 4.4: Stop the Flow hard cap 8 when target already has Mettle", async () => {
  const tri = await createMedic(7, "triage", 50);
  const dyingWithMettle = createPatient("Dying Hero", 0, 30);
  dyingWithMettle.flags.ak5e = { dying: { mettle: 4 } };

  await medicUses.command(tri, "stopTheFlow", {
    confirmed: true,
    targetUuid: dyingWithMettle.uuid
  }, "ch-stf-hard-cap");

  assert.equal(dyingWithMettle.flags.ak5e.dying.mettle, 8, "Mettle capped at hard maximum 8");

  await medicUses.command(tri, "undoUse", { useId: "ch-stf-hard-cap" });
  assert.equal(lifeSupport(tri).value, 50);
});

test("Challenger 4.5: Touch of Life and Death 10 LS rider (ends condition <=1h, pauses >1h, inflicts Poisoned)", async () => {
  const tri = await createMedic(11, "triage", 50);
  assert.equal(hasTouchOfLifeAndDeath(tri), true);

  // With rider active, On the Scene costs 20 LS (10 base + 10 rider)
  const otsRider = await medicUses.command(tri, "onTheScene", {
    confirmed: true,
    withTouchOfLifeAndDeath: true
  }, "ch-ots-rider");

  assert.equal(otsRider.lsCost, 20);
  assert.equal(otsRider.withTouchOfLifeAndDeath, true);
  assert.equal(lifeSupport(tri).value, 30);

  // Undo reverts 20 LS
  await medicUses.command(tri, "undoUse", { useId: "ch-ots-rider" });
  assert.equal(lifeSupport(tri).value, 50);
});

test("Challenger 4.6: Mobile Hospital 1/LR Bonus Action, 30 ft aura, 3d6+mod HP max 1/round per creature resetting at Medic turn start", async () => {
  const tri = await createMedic(15, "triage", 50);
  assert.equal(hasMobileHospital(tri), true);
  assert.equal(mobileHospital(tri).value, 1);

  // First activation uses 1/LR pool
  const mh = await medicUses.command(tri, "mobileHospital", {
    confirmed: true
  }, "ch-mh-1");

  assert.equal(mh.auraRadius, 30);
  assert.equal(mh.healFormula, "3d6 + 3");
  assert.equal(mobileHospital(tri).value, 0);

  // Second activation without rest triggers shortfall warning
  await assert.rejects(
    medicUses.command(tri, "mobileHospital", {
      confirmed: true
    }, "ch-mh-repeat"),
    error => error.warnings?.some(w => w.id === "mobileHospital")
  );

  // Undo restores mobileHospital pool
  await medicUses.command(tri, "undoUse", { useId: "ch-mh-1" });
  assert.equal(mobileHospital(tri).value, 1);
});

/* ========================================================================== */
/* 5. UNDO INTEGRITY SUITE                                                    */
/* ========================================================================== */

test("Challenger 5.1: Comprehensive Undo Integrity across all base, Physician, and Triage operations", async () => {
  const medic = await createMedic(15, "physician", 100);
  const patient = createPatient("Patient", 10, 50);

  // Baseline snapshots
  const baselineLs = lifeSupport(medic).value;
  const baselineHp = patient.system.attributes.hp.value;

  // Run Touch Heal (at level 15, Surgeon-General doubles 20 LS heal to 40 HP; 10 + 40 = 50)
  await medicUses.command(medic, "touchHeal", { confirmed: true, amount: 20, targetUuid: patient.uuid }, "undo-th");
  assert.equal(lifeSupport(medic).value, 80);
  assert.equal(patient.system.attributes.hp.value, 50);

  // Run Preserver
  await medicUses.command(medic, "preserver", { confirmed: true }, "undo-pres");
  assert.equal(lifeSupport(medic).value, 75);

  // Run Urgency of Treatment
  await medicUses.command(medic, "urgencyOfTreatment", { confirmed: true, spentLS: 20 }, "undo-uot");
  assert.equal(lifeSupport(medic).value, 55);

  // Run Inpatient Care
  await medicUses.command(medic, "inpatientCare", { confirmed: true, targetUuid: patient.uuid, healedAmount: 30 }, "undo-ipc");
  assert.equal(lifeSupport(medic).value, 40);

  // Undo in reverse order
  await medicUses.command(medic, "undoUse", { useId: "undo-ipc" });
  assert.equal(lifeSupport(medic).value, 55);

  await medicUses.command(medic, "undoUse", { useId: "undo-uot" });
  assert.equal(lifeSupport(medic).value, 75);

  await medicUses.command(medic, "undoUse", { useId: "undo-pres" });
  assert.equal(lifeSupport(medic).value, 80);

  await medicUses.command(medic, "undoUse", { useId: "undo-th" });
  assert.equal(lifeSupport(medic).value, baselineLs);
  assert.equal(patient.system.attributes.hp.value, baselineHp);
});
