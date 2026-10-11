import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isInstructor,
  getInstructionFormula,
  renownedInstructorInitiative,
  defineInstructorPools,
  registerInstructorHooks,
  INSTRUCTIONS
} from "../scripts/instructor-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";

function setupWorld() {
  const documents = world();
  registerInstructorHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "inst-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

test("Instructor identification and formula scaling (d6 -> d10, kingmaker fixed d6)", () => {
  setupWorld();
  const actorLow = guardFixture({ level: 5, branch: "instructor" });
  assert.equal(isInstructor(actorLow), true);
  assert.equal(getInstructionFormula(actorLow, "defendYourself"), "1d6");
  assert.equal(getInstructionFormula(actorLow, "getOutOfThere"), "3d6");

  const actorHigh = guardFixture({ level: 13, branch: "instructor" });
  assert.equal(getInstructionFormula(actorHigh, "defendYourself"), "1d10");
  assert.equal(getInstructionFormula(actorHigh, "getOutOfThere"), "3d10");

  // Kingmaker at high level stays 1d6 or 3d6
  assert.equal(getInstructionFormula(actorHigh, "defendYourself", { isKingmaker: true }), "1d6");
  assert.equal(getInstructionFormula(actorHigh, "getOutOfThere", { isKingmaker: true }), "3d6");
});

test("Issuing an Instruction spends 1 Instruction Die and records formula", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "instructor" });
  actor.flags.ak5e.resourcePools.instructionDice = { value: 4, max: 4 };

  const result = await use(actor, "instruction", {
    instruction: "defendYourself",
    targetUuid: "Actor.ally1",
    targetName: "Allied Fighter"
  }, "inst-def-1");

  assert.equal(result.instruction, "defendYourself");
  assert.equal(result.formula, "1d6");
  assert.equal(actor.flags.ak5e.resourcePools.instructionDice.value, 3);

  const receipt = guardUses.receipt(actor, "inst-def-1");
  assert.equal(receipt.formula, "1d6");
  assert.ok(receipt.summary.includes("Allied Fighter"));
});

test("Press the Attack: Cooperative Combat spends 1 Aggression alongside Instruction Die", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "instructor", aggression: 4 });
  actor.flags.ak5e.resourcePools.instructionDice = { value: 3, max: 4 };

  const result = await use(actor, "instruction", {
    instruction: "keepFighting",
    cooperativeCombat: true
  }, "inst-coop-1");

  assert.equal(result.isCooperative, true);
  assert.equal(actor.flags.ak5e.resourcePools.instructionDice.value, 2);
  assert.equal(actor.flags.ak5e.resourcePools.aggression.value, 3);

  const receipt = guardUses.receipt(actor, "inst-coop-1");
  assert.ok(receipt.summary.includes("Cooperative Combat"));
});

test("Kingmaker issues free instruction to second ally with fixed d6", async () => {
  setupWorld();
  const actor = guardFixture({ level: 13, branch: "instructor" });
  actor.flags.ak5e.resourcePools.instructionDice = { value: 5, max: 5 };

  const result = await use(actor, "instruction", {
    instruction: "strike",
    isKingmaker: true,
    targetName: "Second Ally"
  }, "inst-km-1");

  assert.equal(result.isKingmaker, true);
  assert.equal(result.formula, "1d6"); // Fixed d6 despite 13th level
  assert.equal(actor.flags.ak5e.resourcePools.instructionDice.value, 5); // 0 dice spent
});

test("Teach from Experience allows turn-start instruction for self at 0 cost", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "instructor" });
  actor.flags.ak5e.resourcePools.instructionDice = { value: 4, max: 4 };

  const result = await use(actor, "teachFromExperience", {
    instruction: "focus"
  }, "tfe-1");

  assert.equal(result.selfOnly, true);
  assert.equal(result.formula, "1d6");
  assert.equal(actor.flags.ak5e.resourcePools.instructionDice.value, 4); // Free
});

test("Renowned Instructor recovers instruction dice up to half on initiative", async () => {
  setupWorld();
  const actor = guardFixture({ level: 14, branch: "instructor" });
  // At level 14, max dice is 6. Half is 3.
  actor.flags.ak5e.resourcePools.instructionDice = { value: 1, max: 6 };

  const recovery = await renownedInstructorInitiative(actor);
  assert.ok(recovery);
  assert.equal(recovery.regained, 2);
  assert.equal(recovery.total, 3);
  assert.equal(actor.flags.ak5e.resourcePools.instructionDice.value, 3);

  // If already at or above half, no recovery
  const noRecovery = await renownedInstructorInitiative(actor);
  assert.equal(noRecovery, null);
});

test("Once More Unto The Breach (17th) spends 1 use of breach pool for mass instruction", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "instructor" });
  actor.flags.ak5e.resourcePools.breach = { value: 1, max: 1 };

  const result = await use(actor, "onceMoreUntoTheBreach", {
    targets: [{ uuid: "Actor.a1" }, { uuid: "Actor.a2" }]
  }, "breach-1");

  assert.equal(result.targetCount, 2);
  assert.equal(actor.flags.ak5e.resourcePools.breach.value, 0);
});
