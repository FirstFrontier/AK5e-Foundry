import test from "node:test";
import assert from "node:assert/strict";
import { medicUses } from "../scripts/medic-uses.mjs";
import { defineMedicPools, setLifeSupport, lifeSupport } from "../scripts/medic-features.mjs";
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

function createMedic(level = 1, branch = null, ls = 100) {
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

function createPatient(name = "Injured Ally", hp = 10, maxHp = 50) {
  const actor = createTestActor({
    name,
    level: 3,
    abilities: { con: { value: 12, mod: 1 } }
  });
  actor.system.attributes.hp = { value: hp, max: maxHp };
  return actor;
}

test("Adversarial: concurrent touchHeal calls on the same Medic are serialized without lost updates", async () => {
  const medic = createMedic(5, "physician", 100);
  const patient = createPatient("Patient", 5, 80);

  // Run 5 simultaneous spends of 10 LS each
  const promises = [1, 2, 3, 4, 5].map(i =>
    medicUses.command(medic, "touchHeal", {
      confirmed: true,
      amount: 10,
      targetUuid: patient.uuid
    }, `op-concurrent-${i}`)
  );

  const results = await Promise.all(promises);
  assert.equal(results.length, 5);
  // Total spent: 5 * 10 = 50
  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 50);
  // Total healed: 5 * 10 = 50 -> 5 + 50 = 55
  assert.equal(patient.system.attributes.hp.value, 55);
});

test("Adversarial: invalid amounts, NaN, and negative values are strictly rejected", async () => {
  const medic = createMedic(1, null, 50);
  const patient = createPatient();

  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: -5, targetUuid: patient.uuid }, "bad-neg"),
    /whole number/
  );

  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: NaN, targetUuid: patient.uuid }, "bad-nan"),
    /whole number/
  );

  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: "fifteen", targetUuid: patient.uuid }, "bad-str"),
    /whole number/
  );

  await assert.rejects(
    medicUses.command(medic, "touchHeal", { confirmed: true, amount: 2.5, targetUuid: patient.uuid }, "bad-float"),
    /whole number/
  );

  // Urgency of Treatment requires multiples of 10
  await assert.rejects(
    medicUses.command(medic, "urgencyOfTreatment", { confirmed: true, spentLS: 15 }, "bad-uot"),
    /multiples of 10/
  );
});

test("Adversarial: cross-subclass feature violations raise branch warnings", async () => {
  const physician = createMedic(7, "physician", 50);

  // Physician trying Triage feature (Stop the Flow) triggers branch warning
  await assert.rejects(
    medicUses.command(physician, "stopTheFlow", { confirmed: true }, "bad-stf-phys"),
    error => error.warnings?.some(w => w.id === "branch")
  );

  const triage = createMedic(7, "triage", 50);
  // Triage trying Physician feature (Hypocritic Oath) triggers branch warning
  await assert.rejects(
    medicUses.command(triage, "hypocriticOath", { confirmed: true }, "bad-oath-tri"),
    error => error.warnings?.some(w => w.id === "branch")
  );
});

test("Adversarial: level gating raises level warnings for high-level features", async () => {
  const lowMedic = createMedic(2, "physician", 50);

  // Resuscitation is level 12
  await assert.rejects(
    medicUses.command(lowMedic, "resuscitation", { confirmed: true }, "bad-lvl-res"),
    error => error.warnings?.some(w => w.id === "level")
  );

  // Chosen of Asclepius is level 20
  await assert.rejects(
    medicUses.command(lowMedic, "chosenOfAsclepius", { confirmed: true }, "bad-lvl-asclepius"),
    error => error.warnings?.some(w => w.id === "level")
  );
});

test("Adversarial: idempotent retry returns cached result without double spending", async () => {
  const medic = createMedic(1, null, 50);
  const patient = createPatient("Patient", 10, 40);

  const res1 = await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 10,
    targetUuid: patient.uuid
  }, "op-idempotent-retry");

  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 40);
  assert.equal(patient.system.attributes.hp.value, 20);

  // Retrying the exact same operationId
  const res2 = await medicUses.command(medic, "touchHeal", {
    confirmed: true,
    amount: 10,
    targetUuid: patient.uuid
  }, "op-idempotent-retry");

  assert.deepEqual(res1, res2);
  assert.equal(medic.flags.ak5e.resourcePools.lifeSupport.value, 40, "No double spend");
  assert.equal(patient.system.attributes.hp.value, 20, "No double heal");
});

test("Adversarial: undoing non-existent or already undone use throws", async () => {
  const medic = createMedic(1, null, 50);

  // Unknown useId throws
  await assert.rejects(
    medicUses.command(medic, "undoUse", { useId: "non-existent-op" }),
    /no longer recorded/
  );

  // Execute use, then undo once
  await medicUses.command(medic, "preserver", { confirmed: true }, "op-undo-twice");
  const firstUndo = await medicUses.command(medic, "undoUse", { useId: "op-undo-twice" });
  assert.equal(firstUndo.undone, "op-undo-twice");

  // Undoing a second time is safely idempotent and returns already: true
  const secondUndo = await medicUses.command(medic, "undoUse", { useId: "op-undo-twice" });
  assert.equal(secondUndo.already, true);

  // Previewing undo on already undone use reports blocked
  const preview = medicUses.previewUndo(medic, "op-undo-twice");
  assert.equal(preview.blocked, true);
  assert.ok(preview.lines.some(l => l.includes("already undone")));
});
