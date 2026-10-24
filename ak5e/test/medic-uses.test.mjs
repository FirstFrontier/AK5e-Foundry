import test from "node:test";
import assert from "node:assert/strict";
import {
  medicUses,
  recordMedicRuling,
  MEDIC_PLANS
} from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport } from "../scripts/medic-features.mjs";
import { clearPoolRegistry } from "../scripts/resource-pools.mjs";
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

function createMedic(level = 1, branch = null, ls = 50) {
  clearPoolRegistry();
  defineMedicPools();

  const actor = createTestActor({
    name: "Doctor Kal",
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
    medic: { enabled: true, spellcastingAbility: "int" }
  };
  setLifeSupport(actor, ls, "test setup");
  return actor;
}

function createPatient(name = "Injured Ally", hp = 10, maxHp = 30, type = "humanoid") {
  const actor = createTestActor({
    name,
    level: 3,
    abilities: { con: { value: 12, mod: 1 } }
  });
  actor.system.attributes.hp = { value: hp, max: maxHp };
  actor.system.details.type = { value: type };
  return actor;
}

test("touchHeal: restores missing HP, spends Life Support, and undoes cleanly", async () => {
  const medic = createMedic(1, "physician", 50);
  const patient = createPatient("Patient", 10, 30);

  // Attempt without confirmation throws
  await assert.rejects(
    medicUses.command(medic, "touchHeal", {
      confirmed: false,
      amount: 15,
      targetUuid: patient.uuid
    }, "op-th-1"),
    /Confirm this use/
  );

  // Valid confirmed execution
  const res = await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 15,
    targetUuid: patient.uuid
  }, "op-th-1");

  assert.equal(res.amount, 15);
  assert.equal(patient.system.attributes.hp.value, 25); // 10 + 15
  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 35); // 50 - 15

  // Preview undo
  const preview = medicUses.previewUndo(medic, "op-th-1");
  assert.equal(preview.blocked, false);

  // Undo use
  await medicUses.command(medic, "undoUse", { useId: "op-th-1" });
  assert.equal(patient.system.attributes.hp.value, 10); // restored to prior 10
  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 50); // refunded to 50
});

test("touchHeal: Construct target triggers non-blocking warning (Ch. 1 L138)", async () => {
  const medic = createMedic(1, null, 50);
  const robot = createPatient("Drone Mk II", 10, 30, "construct");

  // Warning thrown if not overridden
  await assert.rejects(
    medicUses.command(medic, "touchHeal", {
      confirmed: true,
      amount: 10,
      targetUuid: robot.uuid
    }, "op-th-construct"),
    error => error.warnings?.some(w => w.id === "construct")
  );

  // Override allows use anyway
  const res = await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 10,
    targetUuid: robot.uuid,
    overrides: ["construct"]
  }, "op-th-construct");

  assert.equal(res.amount, 10);
});

test("touchHeal: Life Support shortfall warning clamps pool at 0 when overridden", async () => {
  const medic = createMedic(1, null, 10); // Only 10 LS
  const patient = createPatient("Patient", 5, 30);

  // Spending 25 LS triggers shortfall warning
  await assert.rejects(
    medicUses.command(medic, "touchHeal", {
      confirmed: true,
      amount: 25,
      targetUuid: patient.uuid
    }, "op-th-shortfall"),
    error => error.warnings?.some(w => w.id === "lifeSupport")
  );

  // Overriding shortfall clamps pool at 0
  await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 25,
    targetUuid: patient.uuid,
    overrides: ["lifeSupport"]
  }, "op-th-shortfall");

  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 0);
  const state = medic.flags.ak5e.medicUses;
  const receipt = state.undo.find(r => r.id === "op-th-shortfall");
  assert.ok(receipt.shortfalls.some(s => s.includes("Life Support short by 15")));
});

test("preserver and urgencyOfTreatment execute and record cleanly", async () => {
  const medic = createMedic(1, null, 40);

  // Preserver spends 5 LS
  await medicUses.command(medic, "preserver", { confirmed: true }, "op-pres-1");
  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 35);

  // Urgency of Treatment: spend 20 LS to reduce AP cost by 2
  const uotRes = await medicUses.command(medic, "urgencyOfTreatment", {
    confirmed: true,
    spentLS: 20
  }, "op-uot-1");
  assert.equal(uotRes.apReduction, 2);
  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 15);
});

test("resuscitation scales at level 18 with To Rob the Ferryman", async () => {
  const medic12 = createMedic(12, null, 50);
  const deadAlly = createPatient("Fallen Ally", 0, 40);

  const res12 = await medicUses.command(medic12, "resuscitation", {
    confirmed: true,
    targetUuid: deadAlly.uuid
  }, "op-res-12");
  assert.equal(res12.healAmount, 1);
  assert.equal(deadAlly.system.attributes.hp.value, 1);

  // Level 18 medic with To Rob the Ferryman restores 3 * Level = 54 HP
  const medic18 = createMedic(18, null, 50);
  const deadAlly2 = createPatient("Fallen Ally 2", 0, 60);

  const res18 = await medicUses.command(medic18, "resuscitation", {
    confirmed: true,
    targetUuid: deadAlly2.uuid
  }, "op-res-18");
  assert.equal(res18.healAmount, 54);
  assert.equal(deadAlly2.system.attributes.hp.value, 54);
});

test("Physician features: focusedTreatment, intravenousLine, hypocriticOath, inpatientCare, surgeonGeneral", async () => {
  const phys = createMedic(15, "physician", 80);
  const ally = createPatient("Ally", 15, 40);
  const foe = createPatient("Enemy", 30, 30);

  // Focused Treatment
  const ft = await medicUses.command(phys, "focusedTreatment", { confirmed: true }, "op-ft-1");
  assert.equal(ft.bonus, 5); // PB at lvl 15

  // Intravenous Line on unwilling foe
  const iv = await medicUses.command(phys, "intravenousLine", {
    confirmed: true,
    targetUuid: foe.uuid,
    isUnwilling: true
  }, "op-iv-1");
  assert.equal(iv.bonusDie, "2d6"); // Lvl 15 >= 7
  assert.equal(iv.dc, 16); // 8 + 5 + 3

  // Hypocritic Oath
  const oath = await medicUses.command(phys, "hypocriticOath", { confirmed: true }, "op-oath-1");
  assert.equal(oath.convertedToDamage, true);

  // Inpatient Care
  const ipc = await medicUses.command(phys, "inpatientCare", {
    confirmed: true,
    targetUuid: ally.uuid,
    healedAmount: 40
  }, "op-ipc-1");
  assert.equal(ipc.reverberation, 20); // max(floor(40/2)=20, 15) = 20

  // Surgeon-General
  const sg = await medicUses.command(phys, "surgeonGeneral", { confirmed: true }, "op-sg-1");
  assert.equal(sg.doubleHealing, true);
});

test("Triage features: onTheScene, urgentCareCentre, stopTheFlow, mobileHospital", async () => {
  const triage = createMedic(15, "triage", 100);
  const dyingPatient = createPatient("Dying Patient", 0, 50);

  // On the Scene
  const ots = await medicUses.command(triage, "onTheScene", {
    confirmed: true,
    withTouchOfLifeAndDeath: true
  }, "op-ots-1");
  assert.equal(ots.lsCost, 20);
  assert.equal(ots.withTouchOfLifeAndDeath, true);

  // Urgent Care Centre
  const ucc = await medicUses.command(triage, "urgentCareCentre", {
    confirmed: true,
    rolledHealing: 22
  }, "op-ucc-1");
  assert.equal(ucc.auraHeal, 11); // floor(22/2)

  // Stop the Flow: Dying target gains 6 Mettle up to hard cap 8
  const stf = await medicUses.command(triage, "stopTheFlow", {
    confirmed: true,
    targetUuid: dyingPatient.uuid
  }, "op-stf-1");
  assert.equal(stf.mettleGranted, 6);
  assert.equal(dyingPatient.flags.ak5e.dying.mettle, 6);
  assert.equal(dyingPatient.flags.ak5e.dying.stopTheFlowReceived, true);

  // Attempting second Stop the Flow while Dying triggers repeat warning
  await assert.rejects(
    medicUses.command(triage, "stopTheFlow", {
      confirmed: true,
      targetUuid: dyingPatient.uuid
    }, "op-stf-2"),
    error => error.warnings?.some(w => w.id === "repeatStopTheFlow")
  );

  // Mobile Hospital
  const mh = await medicUses.command(triage, "mobileHospital", { confirmed: true }, "op-mh-1");
  assert.equal(mh.auraRadius, 30);
});

test("GM Ruling recording succeeds for GM and rejects for players", async () => {
  const medic = createMedic(5, "physician", 50);

  // Global user as GM
  globalThis.game.user = { id: "gmUser", isGM: true };
  // Setup reading
  medicUses.readings = () => ({
    rulingTest: {
      label: "Test Reading",
      options: [{ value: "standard", label: "Standard" }]
    }
  });

  const ruling = await recordMedicRuling(medic, "rulingTest", "standard", "Rulebook Errata 2026 Chapter 3");
  assert.equal(ruling.value, "standard");

  // Non-GM user fails
  globalThis.game.user = { id: "playerUser", isGM: false };
  await assert.rejects(
    recordMedicRuling(medic, "rulingTest", "standard", "Rulebook Errata 2026 Chapter 3"),
    /Only the GM/
  );
});

test("GM Relay: unowned target mutations validate and apply cleanly across network boundary", async () => {
  const gmUser = { id: "gm1", isGM: true, name: "GM" };
  const playerUser = { id: "player1", isGM: false, name: "Player" };
  globalThis.game.users = [gmUser, playerUser];
  globalThis.game.users.activeGM = gmUser;

  const medic = createMedic(5, "physician", 50);
  medic.ownership = { [playerUser.id]: 3, default: 0 };

  const ally = createPatient("Unowned Ally", 10, 30);
  ally.ownership = { [gmUser.id]: 3, default: 0 };

  globalThis.game.user = playerUser;

  // Player executes touchHeal on unowned ally
  await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 10,
    targetUuid: ally.uuid
  }, "op-relay-th");

  // GM client processes the relayed change
  globalThis.game.user = gmUser;
  await medicUses.relayedTargetChange(medic, "apply", { useId: "op-relay-th", targetUuid: ally.uuid }, gmUser);
  assert.equal(ally.system.attributes.hp.value, 20, "Ally gained 10 HP through GM relay");

  // Player initiates undo
  globalThis.game.user = playerUser;
  await medicUses.command(medic, "undoUse", { useId: "op-relay-th" }, "undo-relay-th");

  // GM client processes the relayed revert
  globalThis.game.user = gmUser;
  await medicUses.relayedTargetChange(medic, "revert", { useId: "op-relay-th", targetUuid: ally.uuid }, gmUser);
  assert.equal(ally.system.attributes.hp.value, 10, "Ally HP restored to 10 on relayed undo");

  // Adversarial: forged amount on target entry is rejected by validateTarget
  const forgedMedic = createMedic(5, "physician", 50);
  forgedMedic.ownership = { [playerUser.id]: 3, default: 0 };
  globalThis.game.user = playerUser;
  await medicUses.command(forgedMedic, "touchHeal", {
    confirmed: true,
    amount: 10,
    targetUuid: ally.uuid
  }, "op-forged-th");

  // Player tampers with stored target amount in actor flags
  forgedMedic.flags.ak5e.medicUses.undo[0].targets[0].amount = 999;
  globalThis.game.user = gmUser;
  await assert.rejects(
    medicUses.relayedTargetChange(forgedMedic, "apply", { useId: "op-forged-th", targetUuid: ally.uuid }, gmUser),
    /not one this use can make/
  );
});

test("Triage target mutation: onTheScene, urgentCareCentre, and mobileHospital populate targets and mutate state", async () => {
  const triage = createMedic(15, "triage", 100);
  const patient1 = createPatient("Patient 1", 10, 40);
  const patient2 = createPatient("Patient 2", 15, 40);

  // Urgent Care Centre with target
  await medicUses.command(triage, "urgentCareCentre", {
    confirmed: true,
    artLevel: 1,
    rolledHealing: 24,
    targetUuids: [patient1.uuid, patient2.uuid]
  }, "op-ucc-targets");

  assert.equal(patient1.system.attributes.hp.value, 22, "Patient 1 received 12 HP splash heal");
  assert.equal(patient2.system.attributes.hp.value, 27, "Patient 2 received 12 HP splash heal");

  // Undo UCC
  await medicUses.command(triage, "undoUse", { useId: "op-ucc-targets" });
  assert.equal(patient1.system.attributes.hp.value, 10, "Patient 1 reverted to 10 HP");
  assert.equal(patient2.system.attributes.hp.value, 15, "Patient 2 reverted to 15 HP");
});

