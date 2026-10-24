import test from "node:test";
import assert from "node:assert/strict";
import {
  defineMedicPools,
  lifeSupport,
  spendLifeSupport,
  refundLifeSupport,
  setLifeSupport,
  resuscitation,
  spendResuscitation,
  refundResuscitation,
  mobileHospital,
  spendMobileHospital,
  refundMobileHospital,
  hasTouchHeal,
  hasPreserver,
  hasUrgencyOfTreatment,
  hasMedicalExpertise,
  hasSelfDefenceProtocol,
  selfDefenceProtocolReduction,
  hasResuscitation,
  hasToRobTheFerryman,
  toRobTheFerrymanBonus,
  hasChosenOfAsclepius,
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
  medicState,
  updateMedicState,
  getMedicView,
  registerMedicHooks
} from "../scripts/medic-features.mjs";
import { clearPoolRegistry, getPoolDefinition } from "../scripts/resource-pools.mjs";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

function mockMedicActor({ level = 1, branch = null, hp = { value: 20, max: 20 }, isOwner = true } = {}) {
  const actor = createTestActor({
    name: "Medic Tester",
    class: "class-medic",
    branch: branch ? `subclass-medic-${branch}` : undefined,
    level,
    abilities: {
      str: { value: 10, mod: 0 },
      dex: { value: 12, mod: 1 },
      con: { value: 14, mod: 2 },
      int: { value: 16, mod: 3 },
      wis: { value: 12, mod: 1 },
      cha: { value: 10, mod: 0 }
    }
  });
  actor.isOwner = isOwner;
  actor.system.attributes.hp = hp;
  actor.flags.ak5e = { medic: { enabled: true } };
  return actor;
}

test("defineMedicPools registers lifeSupport, resuscitation, and mobileHospital correctly", () => {
  clearPoolRegistry();
  defineMedicPools();

  const ls = getPoolDefinition("lifeSupport");
  assert.ok(ls, "lifeSupport definition exists");
  assert.equal(ls.classId, "class-medic");
  assert.equal(ls.overMax, true);
  assert.equal(ls.initial, "max");

  const res = getPoolDefinition("resuscitation");
  assert.ok(res, "resuscitation definition exists");
  assert.equal(res.classId, "class-medic");
  assert.equal(res.max.value, 1);

  const mh = getPoolDefinition("mobileHospital");
  assert.ok(mh, "mobileHospital definition exists");
  assert.equal(mh.classId, "class-medic");
  assert.equal(mh.max.value, 1);
});

test("lifeSupport spend, refund, overMax and clamped behavior", async () => {
  clearPoolRegistry();
  defineMedicPools();
  const actor = mockMedicActor({ level: 4 }); // LS max = 20 + 15 * 2 = 50

  const initial = lifeSupport(actor);
  assert.equal(initial.value, 50);
  assert.equal(initial.max, 50);
  assert.equal(initial.overMax, true);

  await spendLifeSupport(actor, 15, "test spend");
  assert.equal(lifeSupport(actor).value, 35);

  // Refund beyond max is allowed because overMax is true
  await refundLifeSupport(actor, 30, "test refund over max");
  assert.equal(lifeSupport(actor).value, 65);
  assert.equal(lifeSupport(actor).over, 15);

  // Overspend rejected
  await assert.rejects(spendLifeSupport(actor, 100, "overspend"), /Not enough/);

  await setLifeSupport(actor, 25, "test set");
  assert.equal(lifeSupport(actor).value, 25);
});

test("Base Medic feature predicates scale correctly across levels", () => {
  const actor1 = mockMedicActor({ level: 1 });
  assert.equal(hasTouchHeal(actor1), true);
  assert.equal(hasPreserver(actor1), true);
  assert.equal(hasUrgencyOfTreatment(actor1), true);
  assert.equal(hasMedicalExpertise(actor1), true);
  assert.equal(hasSelfDefenceProtocol(actor1), false);
  assert.equal(selfDefenceProtocolReduction(actor1), 0);
  assert.equal(hasResuscitation(actor1), false);
  assert.equal(hasToRobTheFerryman(actor1), false);
  assert.equal(toRobTheFerrymanBonus(actor1), 0);
  assert.equal(hasChosenOfAsclepius(actor1), false);

  const actor5 = mockMedicActor({ level: 5 });
  assert.equal(hasSelfDefenceProtocol(actor5), true);
  assert.equal(selfDefenceProtocolReduction(actor5), 1);

  const actor11 = mockMedicActor({ level: 11 });
  assert.equal(selfDefenceProtocolReduction(actor11), 2);

  const actor12 = mockMedicActor({ level: 12 });
  assert.equal(hasResuscitation(actor12), true);

  const actor18 = mockMedicActor({ level: 18 });
  assert.equal(hasToRobTheFerryman(actor18), true);
  assert.equal(toRobTheFerrymanBonus(actor18), 54); // 3 * 18

  const actor20 = mockMedicActor({ level: 20 });
  assert.equal(hasChosenOfAsclepius(actor20), true);
});

test("Physician subclass feature predicates scale correctly", () => {
  const nonPhysician = mockMedicActor({ level: 20, branch: "triage" });
  assert.equal(hasFocusedTreatment(nonPhysician), false);
  assert.equal(focusedTreatmentBonus(nonPhysician), 0);
  assert.equal(hasIntravenousLine(nonPhysician), false);
  assert.equal(intravenousLineDie(nonPhysician), null);
  assert.equal(hasHypocriticOath(nonPhysician), false);
  assert.equal(hasInpatientCare(nonPhysician), false);
  assert.equal(hasSurgeonGeneral(nonPhysician), false);

  const phys1 = mockMedicActor({ level: 1, branch: "physician" });
  assert.equal(hasFocusedTreatment(phys1), true);
  assert.equal(focusedTreatmentBonus(phys1), 2); // PB at lvl 1
  assert.equal(hasIntravenousLine(phys1), false);

  const phys4 = mockMedicActor({ level: 4, branch: "physician" });
  assert.equal(hasIntravenousLine(phys4), true);
  assert.equal(intravenousLineDie(phys4), "1d6");
  assert.equal(hasHypocriticOath(phys4), false);

  const phys7 = mockMedicActor({ level: 7, branch: "physician" });
  assert.equal(intravenousLineDie(phys7), "2d6");
  assert.equal(hasHypocriticOath(phys7), true);
  assert.equal(hasInpatientCare(phys7), false);

  const phys11 = mockMedicActor({ level: 11, branch: "physician" });
  assert.equal(hasInpatientCare(phys11), true);
  assert.equal(inpatientCareHeal(20), 15); // max(floor(20/2)=10, 15) = 15
  assert.equal(inpatientCareHeal(40), 20); // max(floor(40/2)=20, 15) = 20
  assert.equal(hasSurgeonGeneral(phys11), false);

  const phys15 = mockMedicActor({ level: 15, branch: "physician" });
  assert.equal(hasSurgeonGeneral(phys15), true);
});

test("Triage subclass feature predicates scale correctly", () => {
  const nonTriage = mockMedicActor({ level: 20, branch: "physician" });
  assert.equal(hasOnTheScene(nonTriage), false);
  assert.equal(onTheSceneDie(nonTriage), null);
  assert.equal(hasUrgentCareCentre(nonTriage), false);
  assert.equal(hasStopTheFlow(nonTriage), false);
  assert.equal(hasTouchOfLifeAndDeath(nonTriage), false);
  assert.equal(hasMobileHospital(nonTriage), false);

  const tri1 = mockMedicActor({ level: 1, branch: "triage" });
  assert.equal(hasOnTheScene(tri1), true);
  assert.equal(onTheSceneDie(tri1), "1d6");
  assert.equal(hasUrgentCareCentre(tri1), false);

  const tri4 = mockMedicActor({ level: 4, branch: "triage" });
  assert.equal(hasUrgentCareCentre(tri4), true);
  assert.equal(urgentCareCentreAura(17), 8); // floor(17/2) = 8
  assert.equal(hasStopTheFlow(tri4), false);

  const tri7 = mockMedicActor({ level: 7, branch: "triage" });
  assert.equal(onTheSceneDie(tri7), "2d6");
  assert.equal(hasStopTheFlow(tri7), true);
  assert.equal(hasTouchOfLifeAndDeath(tri7), false);

  const tri11 = mockMedicActor({ level: 11, branch: "triage" });
  assert.equal(hasTouchOfLifeAndDeath(tri11), true);
  assert.equal(hasMobileHospital(tri11), false);

  const tri15 = mockMedicActor({ level: 15, branch: "triage" });
  assert.equal(hasMobileHospital(tri15), true);
});

test("getMedicView and state inspection", async () => {
  clearPoolRegistry();
  defineMedicPools();
  const actor = mockMedicActor({ level: 7, branch: "physician" });
  await updateMedicState(actor, { customNote: "field doctor", enabled: true });

  assert.equal(medicState(actor).customNote, "field doctor");

  const view = getMedicView(actor);
  assert.equal(view.level, 7);
  assert.equal(view.branch, "physician");
  assert.equal(view.lifeSupport.value, 65); // 20 + 15 * 3 = 65
  assert.equal(view.features.touchHeal, true);
  assert.equal(view.features.focusedTreatment, true);
  assert.equal(view.features.hypocriticOath, true);
  assert.ok(view.manual.length > 5);
});

test("registerMedicHooks registers idempotently", () => {
  assert.equal(registerMedicHooks(), true);
  assert.equal(registerMedicHooks(), false);
});
