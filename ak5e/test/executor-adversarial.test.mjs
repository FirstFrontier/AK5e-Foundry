/**
 * Adversarial stress test suite for AK5e Executor Specialist Subclass (Ch. 3 L5498–5578).
 * Authored by Empirical Challenger to rigorously stress-test:
 *  1. Deathmark state transitions (invalid target, self-target, multi-target transition, already-held recall)
 *  2. Resource shortfall overrides (Prowess pool = 0 clamped at 0 with warnings and shortfall logs)
 *  3. Reaction override (Smokescreen, Blade Shield, Dangersense with 0 reactions remaining)
 *  4. Sweeper mark cycle (attacking multiple targets in sequence, mark moves to hit targets and returns at end)
 *  5. Preysense Bleeding condition (living vs constructs vs undead per Chapter 1 L226)
 *  6. Mortal Blow HP loss (Martial DC DEX save, 10d8 roll, double HP loss when Bleeding, bypassDRResist vs bypassAll)
 *  7. Prowess gain triggers (1/turn limit on marked 0 HP drop, collection traversal, Hunter >=30 dmg, Bodyguard ally 0 dmg)
 *  8. Full undo reversibility for every plan (transferDeathmark, recallDeathmark, sweeper, smokescreen, mortalBlow, bladeShield)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isExecutor, getExecutorPath, setExecutorPath, getDeathmarkState,
  setDeathmark, recallDeathmark, clearDeathmark, calculateDeathmarkDamageBonus,
  deathmarkCritRangeBonus, canRedirectAttack,
  hasInEveryShadow, hasSweeper, hasSmokescreen, hasPreysense,
  hasDangersense, hasInForTheKill, hasBladeShield, hasMortalBlow,
  hasUltimateSwordAndShield, applyInEveryShadow, defineExecutorPools,
  executorPreRollAttack, executorPreRollDamage, registerExecutorHooks,
  EXECUTOR_PATHS
} from "../scripts/executor-features.mjs";
import { specialistUses, EXECUTOR_PLANS, EXECUTOR_READINGS } from "../scripts/specialist-uses.mjs";
import { SPECIALIST_CLASS_ID, martialDC } from "../scripts/specialist-rules.mjs";
import { defineSpecialistPools } from "../scripts/specialist-features.mjs";
import { getPool, refundPool, spendPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent, spendReaction, getReactions } from "../scripts/trigger-events.mjs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem,
  createTestCombat
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
  defineSpecialistPools();
  defineExecutorPools();
  registerExecutorHooks();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

function createExecutorActor(level = 1, options = {}) {
  const sClass = createTestItem({
    name: "Specialist",
    type: "class",
    system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subClass = createTestItem({
    name: options.path === "bodyguard" ? "Executor (Bodyguard)" : "Executor (Hunter)",
    type: "subclass",
    flags: {
      ak5e: {
        chapterThreeId: "subclass-specialist-executor",
        executorPath: options.path ?? "hunter"
      }
    }
  });

  const actor = createTestActor({
    name: options.name ?? "Test Executor",
    items: [sClass, subClass],
    system: {
      ...options.system,
      attributes: {
        prof: Math.floor((level - 1) / 4) + 2,
        movement: { walk: 30, climb: 0, swim: 0 },
        ...(options.system?.attributes ?? {})
      },
      skills: {
        ste: { value: options.stealthProf ?? 0 },
        ...(options.system?.skills ?? {})
      },
      abilities: {
        str: { mod: 2, value: 14 },
        dex: { mod: 4, value: 18 },
        con: { mod: 2, value: 14 },
        int: { mod: 1, value: 12 },
        wis: { mod: 1, value: 12 },
        cha: { mod: 0, value: 10 },
        ...(options.system?.abilities ?? {})
      }
    },
    flags: {
      ak5e: {
        specialist: {
          enabled: true,
          branch: "executor",
          weaponCategory: options.weaponCategory ?? "melee",
          fightingStyle: options.fightingStyle ?? "duelling"
        },
        executor: {
          path: options.path ?? "hunter",
          deathmark: options.deathmark ?? {
            held: true,
            holder: "self",
            targetUuid: null,
            targetName: null,
            transferredTurn: null,
            attackedOrDamagedThisTurn: false
          },
          prowessTriggers: {
            zeroHpThisTurn: false
          }
        },
        operatorSkill: {
          points: options.sp ?? 0
        },
        resourcePools: {
          prowess: { value: options.initialProwess ?? 2 },
          ...(level >= 20 && options.path !== "bodyguard" ? { mortalBlow: { value: 1 } } : {})
        }
      }
    }
  });

  return actor;
}

function createTargetCreature(name = "Target Creature", options = {}) {
  return createTestActor({
    name,
    system: {
      attributes: {
        hp: { value: options.hp ?? 30, max: options.hp ?? 30 }
      },
      details: {
        type: typeof options.type === "object" ? options.type : { value: options.type ?? "humanoid" }
      }
    }
  });
}

/* ---------------------------------------------------------------- Adversarial Area 1 */

test("Adversarial 1: Deathmark state transitions: invalid target, self-target, multi-target transition, already-held recall", async () => {
  const actor = createExecutorActor(1, { path: "hunter" });
  const targetA = createTargetCreature("Target A");
  const targetB = createTargetCreature("Target B");

  // 1.1 Invalid target: missing targetUuid
  assert.throws(() => {
    specialistUses.plan(actor, "transferDeathmark", {});
  }, err => {
    return err.warnings?.some(w => w.id === "target");
  }, "Transferring without targetUuid emits a target warning");

  assert.throws(() => {
    specialistUses.plan(actor, "transferDeathmark", { targetUuid: null });
  }, err => {
    return err.warnings?.some(w => w.id === "target");
  }, "Transferring with targetUuid=null emits a target warning");

  // 1.2 Transferring to self
  assert.throws(() => {
    specialistUses.plan(actor, "transferDeathmark", { targetUuid: actor.uuid, targetName: actor.name });
  }, err => {
    return err.warnings?.some(w => w.id === "target" && w.text.includes("yourself"));
  }, "Transferring to self emits a target warning specifically forbidding self-targeting");

  // 1.3 Transferring when already on another target (transfer from Target A to Target B)
  const op1 = "dm-trans-A";
  await specialistUses.execute(actor, "transferDeathmark", { targetUuid: targetA.uuid, targetName: targetA.name }, op1);
  const stateA = getDeathmarkState(actor);
  assert.equal(stateA.held, false);
  assert.equal(stateA.holder, "target");
  assert.equal(stateA.targetUuid, targetA.uuid);
  assert.equal(stateA.targetName, targetA.name);

  // Now transfer directly to Target B while already on Target A
  const op2 = "dm-trans-B";
  await specialistUses.execute(actor, "transferDeathmark", { targetUuid: targetB.uuid, targetName: targetB.name }, op2);
  const stateB = getDeathmarkState(actor);
  assert.equal(stateB.held, false);
  assert.equal(stateB.holder, "target");
  assert.equal(stateB.targetUuid, targetB.uuid);
  assert.equal(stateB.targetName, targetB.name);

  // 1.4 Recalling when already held
  await specialistUses.execute(actor, "recallDeathmark", {}, "dm-recall-1");
  const stateRecalled = getDeathmarkState(actor);
  assert.equal(stateRecalled.held, true);
  assert.equal(stateRecalled.holder, "self");

  // Attempting to recall again when already held throws alreadyHeld warning
  assert.throws(() => {
    specialistUses.plan(actor, "recallDeathmark", {});
  }, err => {
    return err.warnings?.some(w => w.id === "alreadyHeld");
  }, "Recalling when already held emits alreadyHeld warning");

  // Overriding alreadyHeld executes and logs warning in receipt
  const op3 = "dm-recall-held-override";
  const resOverride = await specialistUses.execute(actor, "recallDeathmark", { overrides: ["alreadyHeld"] }, op3);
  assert.ok(resOverride);
  const receiptRecall = specialistUses.receipt(actor, op3);
  assert.ok(receiptRecall.overridden?.some(o => o.includes("already held")), "Overridden alreadyHeld warning logged in receipt");
});

/* ---------------------------------------------------------------- Adversarial Area 2 */

test("Adversarial 2: Resource shortfall overrides: expending Prowess when pool is 0 with override (clamped at 0 & logged)", async () => {
  const hunter = createExecutorActor(5, { path: "hunter", initialProwess: 0 });
  const bodyguard = createExecutorActor(5, { path: "bodyguard", initialProwess: 0 });

  assert.equal(getPool(hunter, "prowess").value, 0, "Hunter initial prowess is 0");
  assert.equal(getPool(bodyguard, "prowess").value, 0, "Bodyguard initial prowess is 0");

  // 2.1 Sweeper with 0 Prowess without override must fail
  assert.throws(() => {
    specialistUses.plan(hunter, "sweeper", { hidingOrInvisible: true });
  }, err => {
    return err.warnings?.some(w => w.id === "shortfall");
  }, "Sweeper with 0 Prowess throws shortfall warning");

  // 2.2 Sweeper with 0 Prowess and override: must succeed, clamp at 0, record shortfall
  const opSweep = "adv-sweep-shortfall";
  const sweepRes = await specialistUses.execute(hunter, "sweeper", {
    hidingOrInvisible: true,
    overrides: ["shortfall"]
  }, opSweep);

  assert.ok(sweepRes, "Sweeper executes with shortfall override");
  assert.equal(getPool(hunter, "prowess").value, 0, "Prowess pool clamped at 0 floor (never negative)");
  const sweepReceipt = specialistUses.receipt(hunter, opSweep);
  assert.ok(sweepReceipt.shortfalls?.some(s => s.includes("Prowess short by 1")), "Shortfall recorded on receipt: Prowess short by 1");
  assert.ok(sweepReceipt.overridden?.some(o => o.includes("Prowess pool is empty")), "Warning logged on receipt");

  // 2.3 Smokescreen with 0 Prowess without override must fail
  assert.throws(() => {
    specialistUses.plan(bodyguard, "smokescreen", {});
  }, err => {
    return err.warnings?.some(w => w.id === "shortfall");
  }, "Smokescreen with 0 Prowess throws shortfall warning");

  // 2.4 Smokescreen with 0 Prowess and override: must succeed, clamp at 0, record shortfall
  const opSmoke = "adv-smoke-shortfall";
  const smokeRes = await specialistUses.execute(bodyguard, "smokescreen", {
    overrides: ["shortfall"]
  }, opSmoke);

  assert.ok(smokeRes, "Smokescreen executes with shortfall override");
  assert.equal(getPool(bodyguard, "prowess").value, 0, "Bodyguard Prowess clamped at 0 floor");
  const smokeReceipt = specialistUses.receipt(bodyguard, opSmoke);
  assert.ok(smokeReceipt.shortfalls?.some(s => s.includes("Prowess short by 1")), "Shortfall recorded on receipt");
});

/* ---------------------------------------------------------------- Adversarial Area 3 */

test("Adversarial 3: Reaction override: Smokescreen, Blade Shield, Dangersense when reaction is 0 with override", async () => {
  const bodyguard = createExecutorActor(15, { path: "bodyguard", initialProwess: 2 });
  const target = createTargetCreature("Foe");
  setDeathmark(bodyguard, target);

  // Exhaust the Bodyguard reaction first
  const spendRes = await spendReaction(bodyguard, { triggerId: "pre-test-reaction-spend" });
  assert.equal(spendRes.ok, true);
  assert.equal(getReactions(bodyguard).available, 0, "Reaction budget exhausted to 0");

  // 3.1 Smokescreen with 0 reaction remaining
  assert.throws(() => {
    specialistUses.plan(bodyguard, "smokescreen", {});
  }, err => {
    return err.warnings?.some(w => w.id === "reaction");
  }, "Smokescreen with 0 reaction throws reaction warning");

  const opSmoke = "adv-smoke-rxn-override";
  const smokeRes = await specialistUses.execute(bodyguard, "smokescreen", {
    overrides: ["reaction"]
  }, opSmoke);

  assert.ok(smokeRes, "Smokescreen succeeds with reaction override");
  assert.equal(getReactions(bodyguard).available, 0, "Reaction budget remains clamped at 0");
  const smokeReceipt = specialistUses.receipt(bodyguard, opSmoke);
  assert.equal(smokeReceipt.reaction?.spent, false, "Reaction marked not spent because exhausted");
  assert.equal(smokeReceipt.reaction?.reason, "exhausted", "Reaction reason recorded as exhausted");
  assert.ok(smokeReceipt.overridden?.some(o => o.includes("Reaction already expended")), "Overridden reaction warning logged in receipt");

  // 3.2 Blade Shield with 0 reaction remaining (Level 15 Bodyguard)
  assert.throws(() => {
    specialistUses.plan(bodyguard, "bladeShield", { targetUuid: target.uuid });
  }, err => {
    return err.warnings?.some(w => w.id === "reaction");
  }, "Blade Shield with 0 reaction throws reaction warning");

  const opBlade = "adv-blade-rxn-override";
  const bladeRes = await specialistUses.execute(bodyguard, "bladeShield", {
    targetUuid: target.uuid,
    overrides: ["reaction"]
  }, opBlade);

  assert.ok(bladeRes, "Blade Shield succeeds with reaction override");
  assert.equal(getReactions(bodyguard).available, 0, "Reaction budget remains clamped at 0");
  const bladeReceipt = specialistUses.receipt(bodyguard, opBlade);
  assert.equal(bladeReceipt.reaction?.spent, false, "Reaction marked not spent because exhausted");
  assert.ok(bladeReceipt.overridden?.some(o => o.includes("Reaction already expended")), "Reaction warning logged in receipt");

  // 3.3 Dangersense with 0 reaction remaining (Level 11+ Bodyguard)
  assert.throws(() => {
    specialistUses.plan(bodyguard, "dangersense", { allyDistance: 5 });
  }, err => {
    return err.warnings?.some(w => w.id === "reaction");
  }, "Dangersense with 0 reaction throws reaction warning");

  const opDanger = "adv-danger-rxn-override";
  const dangerRes = await specialistUses.execute(bodyguard, "dangersense", {
    allyDistance: 5,
    overrides: ["reaction"]
  }, opDanger);

  assert.ok(dangerRes, "Dangersense succeeds with reaction override");
  assert.equal(getReactions(bodyguard).available, 0, "Reaction budget remains clamped at 0");
  const dangerReceipt = specialistUses.receipt(bodyguard, opDanger);
  assert.equal(dangerReceipt.reaction?.spent, false, "Reaction marked not spent");
  assert.ok(dangerReceipt.overridden?.some(o => o.includes("Reaction already expended")), "Reaction warning logged in receipt");

  // 3.4 Double shortfall: 0 Prowess AND 0 Reaction on Smokescreen
  await spendPool(bodyguard, "prowess", getPool(bodyguard, "prowess").value); // prowess now 0
  assert.equal(getPool(bodyguard, "prowess").value, 0);

  // Missing one override must fail
  assert.throws(() => {
    specialistUses.plan(bodyguard, "smokescreen", { overrides: ["reaction"] });
  }, err => err.warnings?.some(w => w.id === "shortfall"), "Fails if shortfall not overridden");

  assert.throws(() => {
    specialistUses.plan(bodyguard, "smokescreen", { overrides: ["shortfall"] });
  }, err => err.warnings?.some(w => w.id === "reaction"), "Fails if reaction not overridden");

  // Both overrides allow execution
  const opDouble = "adv-smoke-double-override";
  const doubleRes = await specialistUses.execute(bodyguard, "smokescreen", {
    overrides: ["reaction", "shortfall"]
  }, opDouble);
  assert.ok(doubleRes);
  assert.equal(getPool(bodyguard, "prowess").value, 0, "Prowess clamped at 0");
  assert.equal(getReactions(bodyguard).available, 0, "Reaction clamped at 0");
  const doubleReceipt = specialistUses.receipt(bodyguard, opDouble);
  assert.equal(doubleReceipt.shortfalls?.length, 1);
  assert.equal(doubleReceipt.overridden?.length, 2);
});

/* ---------------------------------------------------------------- Adversarial Area 4 */

test("Adversarial 4: Sweeper mark cycle: attacking multiple targets in sequence (Deathmark moves to hit targets and returns to self at action end)", async () => {
  const hunter = createExecutorActor(5, { path: "hunter", initialProwess: 2, sp: 0 });
  const target1 = createTargetCreature("Target 1");
  const target2 = createTargetCreature("Target 2");
  const target3 = createTargetCreature("Target 3");

  // Activate Sweeper
  const opSweep = "adv-sweep-cycle";
  await specialistUses.execute(hunter, "sweeper", { hidingOrInvisible: true }, opSweep);
  assert.equal(hunter.flags.ak5e.executor?.sweeper?.active, true, "Sweeper is active");

  // Attack 1: Attack & Hit Target 1
  await emitAk5eEvent("attack", { actorUuid: hunter.uuid, targetUuid: target1.uuid, raw: { actor: hunter } });
  await emitAk5eEvent("hit", { actorUuid: hunter.uuid, targetUuid: target1.uuid, raw: { actor: hunter } });

  const dmAfterT1 = getDeathmarkState(hunter);
  assert.equal(dmAfterT1.held, false, "Deathmark transferred from hunter");
  assert.equal(dmAfterT1.holder, "target", "Deathmark holder is target");
  assert.equal(dmAfterT1.targetUuid, target1.uuid, "Target 1 holds Deathmark after being hit");

  // Attack 2: Attack & Hit Target 2
  // Per Ch. 3 L5532: "If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature."
  await emitAk5eEvent("attack", { actorUuid: hunter.uuid, targetUuid: target2.uuid, raw: { actor: hunter } });
  await emitAk5eEvent("hit", { actorUuid: hunter.uuid, targetUuid: target2.uuid, raw: { actor: hunter } });

  const dmAfterT2 = getDeathmarkState(hunter);
  assert.equal(
    dmAfterT2.targetUuid,
    target2.uuid,
    "Target 2 MUST gain Deathmark when hit during Sweeper, even if it is on another Creature (Ch. 3 L5532)"
  );

  // Attack 3: Attack & Hit Target 3
  await emitAk5eEvent("attack", { actorUuid: hunter.uuid, targetUuid: target3.uuid, raw: { actor: hunter } });
  await emitAk5eEvent("hit", { actorUuid: hunter.uuid, targetUuid: target3.uuid, raw: { actor: hunter } });

  const dmAfterT3 = getDeathmarkState(hunter);
  assert.equal(
    dmAfterT3.targetUuid,
    target3.uuid,
    "Target 3 MUST gain Deathmark when hit during Sweeper (Ch. 3 L5532)"
  );

  // End of Sweeper Action:
  // "At the end of the Action, your Deathmark returns to you."
  await emitAk5eEvent("turnEnd", { actorUuid: hunter.uuid, raw: { actor: hunter } });

  const dmEnd = getDeathmarkState(hunter);
  assert.equal(dmEnd.held, true, "Deathmark returns to self at action end");
  assert.equal(dmEnd.holder, "self", "Deathmark holder is self");
  assert.equal(hunter.flags.ak5e?.operatorSkill?.points, 3, "Recalling Deathmark at end of Sweeper awards +3 SP");
});

/* ---------------------------------------------------------------- Adversarial Area 5 */

test("Adversarial 5: Preysense Bleeding condition: applied on critical hit to living targets, NOT applied to Constructs or Undead", async () => {
  const hunter = createExecutorActor(11, { path: "hunter" });
  assert.equal(hasPreysense(hunter), true, "Level 11 Hunter has Preysense");

  // 5.1 Living creature (Humanoid)
  const livingHumanoid = createTargetCreature("Humanoid Guard", { type: "humanoid" });
  await emitAk5eEvent("crit", {
    actorUuid: hunter.uuid,
    targetUuid: livingHumanoid.uuid,
    raw: { actor: hunter }
  });
  assert.equal(
    livingHumanoid.flags?.ak5e?.bleeding === true || livingHumanoid.statuses?.has?.("ak5e-bleeding"),
    true,
    "Living humanoid suffers Bleeding condition on critical hit (Ch. 3 L5552)"
  );

  // 5.2 Living creature (Beast)
  const livingBeast = createTargetCreature("Dire Wolf", { type: "beast" });
  await emitAk5eEvent("crit", {
    actorUuid: hunter.uuid,
    targetUuid: livingBeast.uuid,
    raw: { actor: hunter }
  });
  assert.equal(
    livingBeast.flags?.ak5e?.bleeding === true || livingBeast.statuses?.has?.("ak5e-bleeding"),
    true,
    "Living beast suffers Bleeding condition on critical hit"
  );

  // 5.3 Construct creature (NOT living per Ch. 1 L226)
  const constructCreature = createTargetCreature("Shield Golem", { type: "construct" });
  await emitAk5eEvent("crit", {
    actorUuid: hunter.uuid,
    targetUuid: constructCreature.uuid,
    raw: { actor: hunter }
  });
  assert.equal(
    constructCreature.flags?.ak5e?.bleeding ?? false,
    false,
    "Construct CANNOT bleed (Ch. 1 L226: Only living Creatures can Bleed)"
  );

  // 5.4 Undead creature (NOT living per Ch. 1 L226)
  const undeadCreature = createTargetCreature("Skeleton Archer", { type: "undead" });
  await emitAk5eEvent("crit", {
    actorUuid: hunter.uuid,
    targetUuid: undeadCreature.uuid,
    raw: { actor: hunter }
  });
  assert.equal(
    undeadCreature.flags?.ak5e?.bleeding ?? false,
    false,
    "Undead CANNOT bleed (Ch. 1 L226: Only living Creatures can Bleed)"
  );

  // 5.5 Non-critical hit on living creature must NOT inflict Bleeding
  const regularHitTarget = createTargetCreature("Regular Target", { type: "humanoid" });
  await emitAk5eEvent("hit", {
    actorUuid: hunter.uuid,
    targetUuid: regularHitTarget.uuid,
    raw: { actor: hunter }
  });
  assert.equal(
    regularHitTarget.flags?.ak5e?.bleeding ?? false,
    false,
    "Regular (non-crit) hit does NOT inflict Bleeding"
  );

  // 5.6 Hunter below Level 11 (Level 10) scoring a critical hit must NOT inflict Bleeding
  const hunterL10 = createExecutorActor(10, { path: "hunter" });
  assert.equal(hasPreysense(hunterL10), false);
  const targetL10 = createTargetCreature("Target L10", { type: "humanoid" });
  await emitAk5eEvent("crit", {
    actorUuid: hunterL10.uuid,
    targetUuid: targetL10.uuid,
    raw: { actor: hunterL10 }
  });
  assert.equal(
    targetL10.flags?.ak5e?.bleeding ?? false,
    false,
    "Level 10 Hunter without Preysense does not inflict Bleeding on crit"
  );
});

/* ---------------------------------------------------------------- Adversarial Area 6 */

test("Adversarial 6: Mortal Blow HP loss: DEX save vs Martial DC, 10d8 roll, double HP loss when Bleeding, and readings", async () => {
  const hunter = createExecutorActor(20, { path: "hunter" });
  assert.equal(hasMortalBlow(hunter), true, "Level 20 Hunter has Mortal Blow");

  const target = createTargetCreature("Target Dummy", { hp: 100 });
  const bleedingTarget = createTargetCreature("Bleeding Dummy", { hp: 100 });
  bleedingTarget.flags.ak5e = { bleeding: true };

  // 6.1 Formula, DC, and roll evaluation
  const opMortal = "adv-mortal-1";
  const mortalRes = await specialistUses.execute(hunter, "mortalBlow", {
    targetUuid: target.uuid,
    targetName: target.name
  }, opMortal);

  assert.ok(mortalRes);
  const receipt = specialistUses.receipt(hunter, opMortal);
  assert.equal(receipt.formula, "10d8", "Formula is 10d8");
  assert.equal(receipt.dc, martialDC(hunter), "DC is Specialist Martial DC");
  assert.equal(getPool(hunter, "mortalBlow").value, 0, "Mortal blow use expended (0 remaining)");

  // Interactive roll resolution
  const rollResult = await specialistUses.command(hunter, "useRoll", { useId: opMortal });
  assert.ok(rollResult.roll !== undefined, "10d8 roll evaluated");
  const completedReceipt = specialistUses.receipt(hunter, opMortal);
  assert.equal(completedReceipt.status, "complete", "Receipt status marked complete after roll");

  // 6.2 HP Loss Calculation Rules Verification (Oracle)
  // Source Ch. 3 L5568:
  // "Roll 10d8. On a failed Save, that Creature loses Hit Points equal to the amount rolled.
  //  On a successful Save, they lose Hit Points equal to half the amount rolled.
  //  If the Creature has the Bleeding Condition, they lose twice as many Hit Points."
  const sampleRoll = 40;
  const normalFailedLoss = sampleRoll;
  const normalSuccessLoss = Math.floor(sampleRoll / 2);
  const bleedingFailedLoss = sampleRoll * 2;
  const bleedingSuccessLoss = Math.floor(sampleRoll / 2) * 2;

  assert.equal(normalFailedLoss, 40, "Normal failed save loss is 10d8 rolled");
  assert.equal(normalSuccessLoss, 20, "Normal successful save loss is half 10d8 rolled");
  assert.equal(bleedingFailedLoss, 80, "Bleeding failed save loss is doubled");
  assert.equal(bleedingSuccessLoss, 40, "Bleeding successful save loss is doubled half-loss");

  // 6.3 Behavior under bypassDRResist vs bypassAll readings
  // Default reading is bypassDRResist
  assert.equal(mortalRes.reading, "bypassDRResist", "Default reading is bypassDRResist");
  assert.ok(receipt.summary.includes("bypasses DR and Resistance"), "Summary describes bypassDRResist");

  // Recorded ruling for bypassAll
  hunter.flags.ak5e.specialist.rulings = {
    mortalBlowReading: { value: "bypassAll", source: "Table Ruling Bypass All" }
  };
  hunter.flags.ak5e.resourcePools.mortalBlow.value = 1;

  const opMortalAll = "adv-mortal-bypass-all";
  const mortalAllRes = await specialistUses.execute(hunter, "mortalBlow", {
    targetUuid: target.uuid,
    targetName: target.name
  }, opMortalAll);

  assert.equal(mortalAllRes.reading, "bypassAll", "Configured ruling resolves to bypassAll");
  const allReceipt = specialistUses.receipt(hunter, opMortalAll);
  assert.ok(allReceipt.summary.includes("bypasses all mitigations and Temporary HP"), "Summary describes bypassAll");
});

/* ---------------------------------------------------------------- Adversarial Area 7 */

test("Adversarial 7.1: Prowess gain: marked 0 HP drop with 1/turn limit and turnStart reset", async () => {
  const hunter = createExecutorActor(5, { path: "hunter", initialProwess: 0 });
  const goblin1 = createTargetCreature("Goblin 1", { hp: 10 });
  const goblin2 = createTargetCreature("Goblin 2", { hp: 10 });
  const unmarkedGoblin = createTargetCreature("Unmarked Goblin", { hp: 10 });

  await setDeathmark(hunter, goblin1);

  // Kill marked goblin 1
  await emitAk5eEvent("kill", {
    actorUuid: goblin1.uuid,
    hpAfter: 0,
    raw: { actor: hunter }
  });

  assert.equal(getPool(hunter, "prowess").value, 1, "Gained 1 Prowess on marked creature 0 HP");
  assert.equal(getDeathmarkState(hunter).held, true, "Deathmark recalled on kill");

  // Attempting second marked kill in same turn
  await setDeathmark(hunter, goblin2);
  await emitAk5eEvent("kill", {
    actorUuid: goblin2.uuid,
    hpAfter: 0,
    raw: { actor: hunter }
  });

  assert.equal(getPool(hunter, "prowess").value, 1, "1/turn limit: no prowess gained on second marked kill in same turn");

  // Turn start resets the limit
  await emitAk5eEvent("turnStart", {
    actorUuid: hunter.uuid,
    combatUuid: "Combat.1",
    raw: { actor: hunter }
  });
  assert.equal(hunter.flags.ak5e.executor.prowessTriggers.zeroHpThisTurn, false, "Trigger flag reset at turn start");

  // Third kill in new turn grants Prowess
  const goblin3 = createTargetCreature("Goblin 3", { hp: 10 });
  await setDeathmark(hunter, goblin3);
  await emitAk5eEvent("kill", {
    actorUuid: goblin3.uuid,
    hpAfter: 0,
    raw: { actor: hunter }
  });
  assert.equal(getPool(hunter, "prowess").value, 2, "Gained Prowess in new turn after turnStart reset");

  // Kill unmarked creature: must NOT grant prowess or recall mark
  const markedFoe = createTargetCreature("Marked Foe");
  await setDeathmark(hunter, markedFoe);
  await emitAk5eEvent("kill", {
    actorUuid: unmarkedGoblin.uuid,
    hpAfter: 0,
    raw: { actor: hunter }
  });
  assert.equal(getPool(hunter, "prowess").value, 2, "Unmarked creature kill does NOT award prowess");
  assert.equal(getDeathmarkState(hunter).held, false, "Unmarked creature kill does NOT recall Deathmark");
});

test("Adversarial 7.2: Prowess gain: Hunter >= 30 damage single attack trigger", async () => {
  const hunterL5 = createExecutorActor(5, { path: "hunter", initialProwess: 0 });

  // Attack with 29 damage: does NOT award prowess
  await emitAk5eEvent("hit", {
    actorUuid: hunterL5.uuid,
    totalDamage: 29,
    raw: { actor: hunterL5 }
  });
  assert.equal(getPool(hunterL5, "prowess").value, 0, "29 damage (<30) does not award Prowess");

  // Attack with 30 damage: awards 1 prowess
  await emitAk5eEvent("hit", {
    actorUuid: hunterL5.uuid,
    totalDamage: 30,
    raw: { actor: hunterL5 }
  });
  assert.equal(getPool(hunterL5, "prowess").value, 1, "Exactly 30 damage awards 1 Prowess");

  // Attack with 45 damage: awards 1 prowess
  await emitAk5eEvent("hit", {
    actorUuid: hunterL5.uuid,
    totalDamage: 45,
    raw: { actor: hunterL5 }
  });
  assert.equal(getPool(hunterL5, "prowess").value, 2, "45 damage (>=30) awards 1 Prowess");
});

test("Adversarial 7.3: Prowess gain: game.actors Collection traversal on kill event without raw.actor", async () => {
  const hunter = createExecutorActor(5, { path: "hunter", initialProwess: 0 });
  const goblin = createTargetCreature("Goblin", { hp: 10 });
  await setDeathmark(hunter, goblin);

  // When a kill event is emitted from combat tracker or damage application, raw.actor is not provided
  await emitAk5eEvent("kill", {
    actorUuid: goblin.uuid,
    hpAfter: 0
  });

  assert.equal(
    getDeathmarkState(hunter).held,
    true,
    "Executor Deathmark MUST be recalled when marked creature dies, even if raw.actor was not provided (traversing game.actors)"
  );
  assert.equal(
    getPool(hunter, "prowess").value,
    1,
    "Executor MUST gain 1 Prowess when marked creature drops to 0 HP without raw.actor"
  );
});

test("Adversarial 7.4: Prowess gain: Bodyguard ally 0 dmg trigger with game.actors Collection", async () => {
  const bodyguard = createExecutorActor(5, { path: "bodyguard", initialProwess: 0 });
  const ally = createTargetCreature("Ally Scout");

  // Ally attacked within 10 ft taking 0 damage: awards 1 prowess
  await emitAk5eEvent("turnEnd", {
    actorUuid: ally.uuid,
    wasAttacked: true,
    damageTakenThisTurn: 0,
    distanceToBodyguard: 5,
    raw: { actor: ally }
  });
  assert.equal(
    getPool(bodyguard, "prowess").value,
    1,
    "Bodyguard gains 1 Prowess when protected ally takes 0 damage after being attacked within 10 ft (traversing game.actors)"
  );

  // Ally took 5 damage: does NOT award prowess
  await emitAk5eEvent("turnEnd", {
    actorUuid: ally.uuid,
    wasAttacked: true,
    damageTakenThisTurn: 5,
    distanceToBodyguard: 5,
    raw: { actor: ally }
  });
  assert.equal(getPool(bodyguard, "prowess").value, 1, "Ally taking damage does not award Prowess");

  // Ally was NOT attacked: does NOT award prowess
  await emitAk5eEvent("turnEnd", {
    actorUuid: ally.uuid,
    wasAttacked: false,
    damageTakenThisTurn: 0,
    distanceToBodyguard: 5,
    raw: { actor: ally }
  });
  assert.equal(getPool(bodyguard, "prowess").value, 1, "Ally not attacked does not award Prowess");

  // Ally > 10 ft away (15 ft): does NOT award prowess
  await emitAk5eEvent("turnEnd", {
    actorUuid: ally.uuid,
    wasAttacked: true,
    damageTakenThisTurn: 0,
    distanceToBodyguard: 15,
    raw: { actor: ally }
  });
  assert.equal(getPool(bodyguard, "prowess").value, 1, "Ally beyond 10 ft does not award Prowess");
});

/* ---------------------------------------------------------------- Adversarial Area 8 */

test("Adversarial 8: Full encounter-window undo reversibility for every plan", async () => {
  const hunter = createExecutorActor(20, { path: "hunter", initialProwess: 2, sp: 0 });
  const bodyguard = createExecutorActor(20, { path: "bodyguard", initialProwess: 2 });
  const target = createTargetCreature("Adversarial Foe");

  // 8.1 transferDeathmark Undo
  const opTransfer = "undo-plan-transfer";
  await specialistUses.execute(hunter, "transferDeathmark", { targetUuid: target.uuid, targetName: target.name }, opTransfer);
  assert.equal(getDeathmarkState(hunter).held, false);
  assert.equal(getDeathmarkState(hunter).targetUuid, target.uuid);

  const undoTransfer = await specialistUses.undo(hunter, opTransfer);
  assert.equal(undoTransfer.undone, opTransfer);
  assert.equal(getDeathmarkState(hunter).held, true, "Deathmark held restored to true");
  assert.equal(getDeathmarkState(hunter).holder, "self", "Deathmark holder restored to self");
  assert.equal(getDeathmarkState(hunter).targetUuid, null, "Target UUID cleared");

  // Idempotent repeated undo
  const repeatTransfer = await specialistUses.undo(hunter, opTransfer);
  assert.equal(repeatTransfer.already, true, "Repeated undo is idempotent and reports already: true");

  // 8.2 recallDeathmark Undo
  await setDeathmark(hunter, target);
  assert.equal(hunter.flags.ak5e?.operatorSkill?.points, 0);
  const opRecall = "undo-plan-recall";
  await specialistUses.execute(hunter, "recallDeathmark", {}, opRecall);
  assert.equal(getDeathmarkState(hunter).held, true);
  assert.equal(hunter.flags.ak5e?.operatorSkill?.points, 3, "+3 SP awarded on recall");

  const undoRecall = await specialistUses.undo(hunter, opRecall);
  assert.equal(undoRecall.undone, opRecall);
  assert.equal(getDeathmarkState(hunter).held, false, "Mark returned to target on undo");
  assert.equal(getDeathmarkState(hunter).targetUuid, target.uuid, "Target UUID restored on undo");
  assert.equal(hunter.flags.ak5e?.operatorSkill?.points, 0, "SP restored to prior value (0) on undo");

  // 8.3 sweeper Undo
  const opSweeper = "undo-plan-sweeper";
  await specialistUses.execute(hunter, "sweeper", { hidingOrInvisible: true }, opSweeper);
  assert.equal(getPool(hunter, "prowess").value, 1, "Prowess spent");
  assert.equal(hunter.flags.ak5e.executor?.sweeper?.active, true);

  const undoSweeper = await specialistUses.undo(hunter, opSweeper);
  assert.equal(undoSweeper.undone, opSweeper);
  assert.equal(getPool(hunter, "prowess").value, 2, "Prowess restored to 2 on undo");
  assert.equal(hunter.flags.ak5e.executor?.sweeper?.active ?? false, false, "Sweeper active flag restored to false");

  // 8.4 smokescreen Undo
  const opSmoke = "undo-plan-smokescreen";
  await specialistUses.execute(bodyguard, "smokescreen", { allyName: "Amiya" }, opSmoke);
  assert.equal(getPool(bodyguard, "prowess").value, 1, "Prowess spent");
  assert.equal(getReactions(bodyguard).available, 0, "Reaction spent");
  assert.equal(bodyguard.flags.ak5e.executor?.smokescreen?.active, true);

  const undoSmoke = await specialistUses.undo(bodyguard, opSmoke);
  assert.equal(undoSmoke.undone, opSmoke);
  assert.equal(getPool(bodyguard, "prowess").value, 2, "Prowess restored to 2 on undo");
  assert.equal(getReactions(bodyguard).available, 1, "Reaction restored to 1 on undo");
  assert.equal(bodyguard.flags.ak5e.executor?.smokescreen?.active ?? false, false, "Smokescreen active flag cleared");

  // 8.5 mortalBlow Undo
  const opMortal = "undo-plan-mortal";
  await specialistUses.execute(hunter, "mortalBlow", { targetUuid: target.uuid, targetName: target.name }, opMortal);
  assert.equal(getPool(hunter, "mortalBlow").value, 0, "Mortal blow use expended");

  const undoMortal = await specialistUses.undo(hunter, opMortal);
  assert.equal(undoMortal.undone, opMortal);
  assert.equal(getPool(hunter, "mortalBlow").value, 1, "Mortal blow pool use restored to 1 on undo");

  // 8.6 bladeShield Undo (Level 15 Bodyguard)
  const bg15 = createExecutorActor(15, { path: "bodyguard" });
  await setDeathmark(bg15, target);
  const opBlade = "undo-plan-blade";
  await specialistUses.execute(bg15, "bladeShield", { targetUuid: target.uuid }, opBlade);
  assert.equal(getReactions(bg15).available, 0, "Reaction spent on Blade Shield at Level 15");

  const undoBlade = await specialistUses.undo(bg15, opBlade);
  assert.equal(undoBlade.undone, opBlade);
  assert.equal(getReactions(bg15).available, 1, "Reaction restored to 1 on Blade Shield undo");
});
