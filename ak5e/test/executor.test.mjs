/**
 * Comprehensive automated test suite for AK5e Executor Specialist Subclass (Ch. 3 L5498–5578).
 * Tests all 12 functional areas + encounter-window undo reversibility:
 *  1. Executor Identification & Path Choice
 *  2. Deathmark Transfer & Recall State Machine
 *  3. Combat SP Grants & Disengage Reaction
 *  4. Damage Scaling (+1d4, +2d4, +3d4)
 *  5. Hunter Crit Range (+1) vs Bodyguard Attack Redirection
 *  6. Level 5: In Every Shadow (movement speeds & stealth)
 *  7. Level 5: Sweeper (Hunter reach cleave & mark cycle)
 *  8. Level 5: Smokescreen (Bodyguard magical darkness & ally reaction move)
 *  9. Executor Prowess Gain Triggers (marked 0 HP 1/turn, Hunter >=30 dmg, Bodyguard 0-dmg ally)
 * 10. Level 11: Preysense (Hunter crit die & bleeding) vs Dangersense (Bodyguard save evasion)
 * 11. Level 15: In for the Kill (Hunter vulnerability) vs Blade Shield (Bodyguard parry-strike)
 * 12. Level 20: Mortal Blow (Hunter 10d8 HP loss & readings) vs Ultimate Sword and Shield (Bodyguard)
 * 13. Reversibility & Encounter-Window Undo (WORKFLOW §3.2)
 * 14. Hook Registration Idempotency & Sweeper Mark Cycling
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
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
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
        type: { value: options.type ?? "humanoid" }
      }
    }
  });
}

/* ---------------------------------------------------------------- Test Area 1 */

test("Area 1: Executor Identification & Path Choice", async () => {
  const hunter = createExecutorActor(1, { path: "hunter" });
  const bodyguard = createExecutorActor(1, { path: "bodyguard" });

  assert.equal(isExecutor(hunter), true, "isExecutor returns true for Hunter");
  assert.equal(isExecutor(bodyguard), true, "isExecutor returns true for Bodyguard");
  assert.equal(getExecutorPath(hunter), "hunter", "Path resolves to hunter");
  assert.equal(getExecutorPath(bodyguard), "bodyguard", "Path resolves to bodyguard");

  // Dynamic path update
  await setExecutorPath(hunter, "bodyguard");
  assert.equal(getExecutorPath(hunter), "bodyguard", "setExecutorPath changes path to bodyguard");
  await setExecutorPath(hunter, "hunter");
  assert.equal(getExecutorPath(hunter), "hunter", "setExecutorPath reverts path to hunter");

  // Initial Deathmark state
  const dm = getDeathmarkState(hunter);
  assert.equal(dm.held, true, "Initial Deathmark is held");
  assert.equal(dm.holder, "self", "Initial Deathmark holder is self");
  assert.equal(dm.targetUuid, null, "Initial Deathmark targetUuid is null");
});

/* ---------------------------------------------------------------- Test Area 2 */

test("Area 2: Deathmark Transfer & Recall State Machine", async () => {
  const actor = createExecutorActor(1, { path: "hunter" });
  const target = createTargetCreature("Goblin Scout");

  // Transfer Deathmark
  const opIdTransfer = "transfer-dm-op1";
  const res = await specialistUses.execute(actor, "transferDeathmark", {
    targetUuid: target.uuid,
    targetName: target.name
  }, opIdTransfer);
  assert.ok(res, "transferDeathmark applied successfully");
  assert.equal(res.holder, "target");
  assert.equal(specialistUses.receipt(actor, opIdTransfer).status, "complete");

  const markedState = getDeathmarkState(actor);
  assert.equal(markedState.held, false, "Deathmark is no longer held by self");
  assert.equal(markedState.holder, "target", "Deathmark holder is target");
  assert.equal(markedState.targetUuid, target.uuid, "Target UUID recorded accurately");
  assert.equal(markedState.targetName, "Goblin Scout", "Target name recorded accurately");

  // Warnings check: missing target
  assert.throws(() => {
    specialistUses.plan(actor, "transferDeathmark", {});
  }, err => err.warnings?.some(w => w.id === "target"));

  // Recall Deathmark
  const opIdRecall = "recall-dm-op1";
  const recallRes = await specialistUses.execute(actor, "recallDeathmark", {}, opIdRecall);
  assert.ok(recallRes, "recallDeathmark applied successfully");
  assert.equal(recallRes.holder, "self");
  assert.equal(specialistUses.receipt(actor, opIdRecall).status, "complete");

  const recalledState = getDeathmarkState(actor);
  assert.equal(recalledState.held, true, "Deathmark is held again");
  assert.equal(recalledState.holder, "self", "Holder is reset to self");
  assert.equal(recalledState.targetUuid, null, "Target UUID reset to null");

  // Warning check: already held
  assert.throws(() => {
    specialistUses.plan(actor, "recallDeathmark", {});
  }, err => err.warnings?.some(w => w.id === "alreadyHeld"));
});

/* ---------------------------------------------------------------- Test Area 3 */

test("Area 3: Combat SP Grants & Disengage Reaction", async () => {
  const actor = createExecutorActor(1, { path: "hunter", sp: 0 });
  const target = createTargetCreature("Bandit");

  // 1. Recall Deathmark awards +3 SP and Disengage opportunity
  await setDeathmark(actor, target);
  assert.equal(getDeathmarkState(actor).held, false);

  const opIdRecall = "recall-sp-op";
  const recallResult = await specialistUses.execute(actor, "recallDeathmark", {}, opIdRecall);
  assert.ok(recallResult);
  assert.equal(actor.flags.ak5e.operatorSkill.points, 3, "Recalling Deathmark awards 3 Skill Points");
  assert.equal(recallResult.reactionDisengageAvailable, true, "Disengage reaction notice is granted");

  // 2. Turn start while held in combat awards +3 SP
  const combat = createTestCombat([actor, target]);
  combat.start();

  await emitAk5eEvent("turnStart", {
    actorUuid: actor.uuid,
    combatUuid: combat.uuid,
    round: 1,
    turn: 0,
    raw: { actor, combat }
  });

  assert.equal(actor.flags.ak5e.operatorSkill.points, 6, "Turn start in combat while held grants another 3 SP (total 6)");

  // Turn start when mark is on target does NOT award +3 SP
  await setDeathmark(actor, target);
  await emitAk5eEvent("turnStart", {
    actorUuid: actor.uuid,
    combatUuid: combat.uuid,
    round: 2,
    turn: 0,
    raw: { actor, combat }
  });
  assert.equal(actor.flags.ak5e.operatorSkill.points, 6, "Turn start while mark is on target does not grant SP");
});

/* ---------------------------------------------------------------- Test Area 4 */

test("Area 4: Damage Scaling (+1d4, +2d4, +3d4)", async () => {
  // Formula progression
  assert.equal(calculateDeathmarkDamageBonus(1), "1d4", "Level 1 is 1d4");
  assert.equal(calculateDeathmarkDamageBonus(6), "1d4", "Level 6 is 1d4");
  assert.equal(calculateDeathmarkDamageBonus(7), "2d4", "Level 7 is 2d4");
  assert.equal(calculateDeathmarkDamageBonus(13), "2d4", "Level 13 is 2d4");
  assert.equal(calculateDeathmarkDamageBonus(14), "3d4", "Level 14 is 3d4");
  assert.equal(calculateDeathmarkDamageBonus(20), "3d4", "Level 20 is 3d4");

  // PreRollDamage hook evaluation
  const actorL1 = createExecutorActor(1, { path: "hunter" });
  const actorL7 = createExecutorActor(7, { path: "hunter" });
  const actorL14 = createExecutorActor(14, { path: "hunter" });
  const target = createTargetCreature("Orc Grunt");

  setDeathmark(actorL1, target);
  setDeathmark(actorL7, target);
  setDeathmark(actorL14, target);

  // Hook run on Level 1 via Hooks.callAll
  const rollConfigL1 = { subject: { actor: actorL1 }, target, rolls: [{ parts: ["1d8"] }] };
  await Hooks.callAll("dnd5e.preRollDamageV2", rollConfigL1);
  assert.equal(rollConfigL1.rolls[0].parts.filter(p => p === "1d4").length, 1, "Level 1 roll parts include exactly one 1d4");

  // Hook run on Level 7 via Hooks.callAll
  const rollConfigL7 = { subject: { actor: actorL7 }, target, rolls: [{ parts: ["1d8"] }] };
  await Hooks.callAll("dnd5e.preRollDamageV2", rollConfigL7);
  assert.equal(rollConfigL7.rolls[0].parts.filter(p => p === "2d4").length, 1, "Level 7 roll parts include exactly one 2d4");

  // Hook run on Level 14 via Hooks.callAll
  const rollConfigL14 = { subject: { actor: actorL14 }, target, rolls: [{ parts: ["1d8"] }] };
  await Hooks.callAll("dnd5e.preRollDamageV2", rollConfigL14);
  assert.equal(rollConfigL14.rolls[0].parts.filter(p => p === "3d4").length, 1, "Level 14 roll parts include exactly one 3d4");

  // Non-marked target does not gain bonus
  const nonMarkedTarget = createTargetCreature("Bystander");
  const nonMarkedConfig = { subject: { actor: actorL14 }, target: nonMarkedTarget, rolls: [{ parts: ["1d8"] }] };
  await Hooks.callAll("dnd5e.preRollDamageV2", nonMarkedConfig);
  assert.equal(nonMarkedConfig.rolls[0].parts.includes("3d4"), false, "Unmarked target does not receive bonus damage");
});

/* ---------------------------------------------------------------- Test Area 5 */

test("Area 5: Hunter Crit Range (+1) vs Bodyguard Attack Redirection", async () => {
  const hunter = createExecutorActor(5, { path: "hunter" });
  const bodyguard = createExecutorActor(5, { path: "bodyguard" });
  const target = createTargetCreature("Enemy Champion");
  const ally = createTargetCreature("Allied Mage");

  // Hunter: crit range +1 vs marked target
  setDeathmark(hunter, target);
  assert.equal(deathmarkCritRangeBonus(hunter, target), 1, "Hunter has +1 crit range bonus vs marked target");
  assert.equal(deathmarkCritRangeBonus(hunter, ally), 0, "Hunter has 0 crit range bonus vs non-marked target");

  const attackConfig = { subject: { actor: hunter }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  assert.equal(attackConfig.rolls[0].options.criticalThreshold, 19, "Critical threshold lowered to 19 for Hunter vs marked creature");

  // Bodyguard: attack redirection
  setDeathmark(bodyguard, target);
  assert.equal(canRedirectAttack(bodyguard, ally, 8), true, "Can redirect attack within 10 ft");
  assert.equal(canRedirectAttack(bodyguard, ally, 15), false, "Cannot redirect attack beyond 10 ft");

  const opIdRedirect = "redirect-op-1";
  const redirectRes = await specialistUses.execute(bodyguard, "attackRedirection", {
    targetUuid: ally.uuid,
    allyName: ally.name,
    distanceToTarget: 5
  }, opIdRedirect);
  assert.ok(redirectRes, "Attack Redirection executed without action cost");
  assert.equal(redirectRes.redirectedTo, bodyguard.uuid, "Attack redirected to Bodyguard");
  assert.equal(specialistUses.receipt(bodyguard, opIdRedirect).status, "complete");

  // Hunter attempting Bodyguard redirection produces path warning
  assert.throws(() => {
    specialistUses.plan(hunter, "attackRedirection", { distanceToTarget: 5 });
  }, err => err.warnings?.some(w => w.id === "path"));
});

/* ---------------------------------------------------------------- Test Area 6 */

test("Area 6: Level 5: In Every Shadow", async () => {
  const actor = createExecutorActor(5, {
    path: "hunter",
    stealthProf: 1, // Already proficient
    system: {
      attributes: {
        movement: { walk: 35, climb: 0, swim: 0 }
      }
    }
  });

  assert.equal(hasInEveryShadow(actor), true, "Level 5 has In Every Shadow");

  const updates = await applyInEveryShadow(actor);
  assert.equal(actor.system.attributes.movement.climb, 35, "Climbing speed equals walking speed (35)");
  assert.equal(actor.system.attributes.movement.swim, 35, "Swimming speed equals walking speed (35)");
  assert.equal(actor.system.skills.ste.value, 2, "Stealth proficiency upgraded to Expertise (2)");

  // Actor with no stealth proficiency upgrades to 1 (Proficiency)
  const novice = createExecutorActor(5, { path: "bodyguard", stealthProf: 0 });
  await applyInEveryShadow(novice);
  assert.equal(novice.system.skills.ste.value, 1, "Stealth 0 upgraded to Proficiency 1");

  // Low level actor does not have In Every Shadow
  const lowLvl = createExecutorActor(4, { path: "hunter" });
  assert.equal(hasInEveryShadow(lowLvl), false, "Level 4 does not have In Every Shadow");
});

/* ---------------------------------------------------------------- Test Area 7 */

test("Area 7: Level 5: Sweeper (Hunter)", async () => {
  const hunter = createExecutorActor(5, { path: "hunter", initialProwess: 2 });
  assert.equal(hasSweeper(hunter), true, "Level 5 Hunter has Sweeper");

  // Level warning test
  const lowHunter = createExecutorActor(4, { path: "hunter", initialProwess: 2 });
  assert.throws(() => {
    specialistUses.plan(lowHunter, "sweeper", { hidingOrInvisible: true });
  }, err => err.warnings?.some(w => w.id === "level"));

  // Path warning test
  const bodyguard = createExecutorActor(5, { path: "bodyguard", initialProwess: 2 });
  assert.throws(() => {
    specialistUses.plan(bodyguard, "sweeper", { hidingOrInvisible: true });
  }, err => err.warnings?.some(w => w.id === "path"));

  // Stealth check warning
  assert.throws(() => {
    specialistUses.plan(hunter, "sweeper", { hidingOrInvisible: false });
  }, err => err.warnings?.some(w => w.id === "stealth"));

  // Execution: spends 1 Prowess and sets reachBonus = 5
  const opIdSweep = "sweep-exec-op";
  const res = await specialistUses.execute(hunter, "sweeper", { hidingOrInvisible: true }, opIdSweep);
  assert.ok(res, "Sweeper applied successfully");
  assert.equal(res.reachBonus, 5);
  assert.equal(getPool(hunter, "prowess").value, 1, "1 Prowess spent");
  assert.equal(hunter.flags.ak5e.executor.sweeper.active, true, "Sweeper marked active");
  assert.equal(hunter.flags.ak5e.executor.sweeper.reachBonus, 5, "Reach bonus is 5 ft");

  // Turn end concludes Sweeper and recalls mark
  await emitAk5eEvent("turnEnd", {
    actorUuid: hunter.uuid,
    raw: { actor: hunter }
  });
  assert.equal(hunter.flags.ak5e.executor.sweeper.active, false, "Sweeper concludes on turnEnd");

  // Shortfall clamping at 0 with override
  await spendPool(hunter, "prowess", 1); // 0 remaining
  assert.equal(getPool(hunter, "prowess").value, 0);

  assert.throws(() => {
    specialistUses.plan(hunter, "sweeper", { hidingOrInvisible: true });
  }, err => err.warnings?.some(w => w.id === "shortfall"));

  const overrideRes = await specialistUses.execute(hunter, "sweeper", {
    hidingOrInvisible: true,
    overrides: ["shortfall"]
  });
  assert.ok(overrideRes, "Shortfall overridden successfully");
  assert.equal(getPool(hunter, "prowess").value, 0, "Prowess clamped at 0 floor");
});

/* ---------------------------------------------------------------- Test Area 8 */

test("Area 8: Level 5: Smokescreen (Bodyguard)", async () => {
  const bodyguard = createExecutorActor(5, { path: "bodyguard", initialProwess: 2 });
  assert.equal(hasSmokescreen(bodyguard), true, "Level 5 Bodyguard has Smokescreen");

  // Execute Smokescreen: spends 1 Prowess and 1 Reaction
  const opIdSmoke = "smoke-exec-op";
  const res = await specialistUses.execute(bodyguard, "smokescreen", {
    allyName: "Amiya"
  }, opIdSmoke);
  assert.ok(res, "Smokescreen applied");
  assert.equal(getPool(bodyguard, "prowess").value, 1, "1 Prowess spent");
  const receipt = specialistUses.receipt(bodyguard, opIdSmoke);
  assert.equal(receipt.reaction?.requested, true, "Reaction spent");
  assert.equal(res.radius, 10, "10-foot radius sphere");

  // Reaction warning on second attempt
  assert.throws(() => {
    specialistUses.plan(bodyguard, "smokescreen", {});
  }, err => err.warnings?.some(w => w.id === "reaction"));
});

/* ---------------------------------------------------------------- Test Area 9 */

test("Area 9: Executor Prowess Gain Triggers", async () => {
  // 1. Universal Executor Trigger: marked creature reduced to 0 HP
  const hunter = createExecutorActor(5, { path: "hunter", initialProwess: 0 });
  const goblin = createTargetCreature("Goblin", { hp: 10 });
  await setDeathmark(hunter, goblin);

  // Kill event
  await emitAk5eEvent("kill", {
    actorUuid: goblin.uuid,
    hpAfter: 0,
    raw: { actor: hunter }
  });

  assert.equal(getPool(hunter, "prowess").value, 1, "Prowess gained when marked creature reduced to 0 HP");
  assert.equal(getDeathmarkState(hunter).held, true, "Deathmark recalled automatically on kill");

  // 1/turn limit: second kill does not award Prowess
  const goblin2 = createTargetCreature("Goblin 2", { hp: 10 });
  await setDeathmark(hunter, goblin2);
  await emitAk5eEvent("kill", {
    actorUuid: goblin2.uuid,
    hpAfter: 0,
    raw: { actor: hunter }
  });
  assert.equal(getPool(hunter, "prowess").value, 1, "Second marked kill in same turn does not award Prowess");

  // Reset at turn start
  await emitAk5eEvent("turnStart", {
    actorUuid: hunter.uuid,
    combatUuid: "Combat.test",
    raw: { actor: hunter }
  });
  assert.equal(hunter.flags.ak5e.executor.prowessTriggers.zeroHpThisTurn, false, "Trigger reset at turn start");

  // 2. Hunter Trigger: single attack dealing >= 30 damage
  await emitAk5eEvent("hit", {
    actorUuid: hunter.uuid,
    totalDamage: 32,
    raw: { actor: hunter }
  });
  assert.equal(getPool(hunter, "prowess").value, 2, "Hunter gained 1 Prowess from >=30 damage single attack");

  // 3. Bodyguard Trigger: ally within 10 ft attacked taking 0 damage
  const bodyguard = createExecutorActor(5, { path: "bodyguard", initialProwess: 0 });
  const ally = createTargetCreature("Protected Ally");
  globalThis.game.actors = [bodyguard, ally];

  await emitAk5eEvent("turnEnd", {
    actorUuid: ally.uuid,
    wasAttacked: true,
    damageTakenThisTurn: 0,
    distanceToBodyguard: 8,
    raw: { actor: ally }
  });
  assert.equal(getPool(bodyguard, "prowess").value, 1, "Bodyguard gained 1 Prowess when protected ally took 0 damage");
});

/* ---------------------------------------------------------------- Test Area 10 */

test("Area 10: Level 11: Preysense (Hunter) & Dangersense (Bodyguard)", async () => {
  // Preysense
  const hunter = createExecutorActor(11, { path: "hunter" });
  assert.equal(hasPreysense(hunter), true, "Level 11 Hunter has Preysense");

  // Extra critical damage die
  const target = createTargetCreature("Target");
  setDeathmark(hunter, target);
  const critConfig = {
    subject: { actor: hunter, item: { system: { damage: { base: { formula: "1d10" } } } } },
    target,
    critical: true,
    rolls: [{ options: { critical: true }, parts: ["1d10"] }]
  };
  await Hooks.callAll("dnd5e.preRollDamageV2", critConfig);
  assert.equal(critConfig.rolls[0].parts.filter(p => p === "1d10").length, 2, "Base 1d10 plus exactly one extra 1d10 critical bonus die added");

  // Crit inflicts Bleeding on living target
  const livingTarget = createTargetCreature("Living Target", { type: "humanoid" });
  await emitAk5eEvent("crit", {
    actorUuid: hunter.uuid,
    targetUuid: livingTarget.uuid,
    raw: { actor: hunter }
  });
  assert.equal(livingTarget.flags?.ak5e?.bleeding, true, "Living target gained bleeding condition on crit");

  // Crit against construct does NOT inflict Bleeding
  const constructTarget = createTargetCreature("Robot", { type: "construct" });
  await emitAk5eEvent("crit", {
    actorUuid: hunter.uuid,
    targetUuid: constructTarget.uuid,
    raw: { actor: hunter }
  });
  assert.equal(constructTarget.flags?.ak5e?.bleeding ?? false, false, "Construct does not bleed");

  // Dangersense
  const bodyguard = createExecutorActor(11, { path: "bodyguard" });
  assert.equal(hasDangersense(bodyguard), true, "Level 11 Bodyguard has Dangersense");

  const opIdDanger = "danger-exec-op";
  const dangerRes = await specialistUses.execute(bodyguard, "dangersense", {
    allyName: "Amiya",
    allyDistance: 5
  }, opIdDanger);
  assert.ok(dangerRes, "Dangersense applied");
  const dangerReceipt = specialistUses.receipt(bodyguard, opIdDanger);
  assert.equal(dangerReceipt.reaction?.requested, true, "Reaction spent");
  assert.equal(dangerRes.maxMove, 15, "Half speed movement calculated (15 ft)");

  // Warning when ally distance > 5 ft
  assert.throws(() => {
    specialistUses.plan(bodyguard, "dangersense", { allyDistance: 10 });
  }, err => err.warnings?.some(w => w.id === "distance"));
});

/* ---------------------------------------------------------------- Test Area 11 */

test("Area 11: Level 15: In for the Kill (Hunter) & Blade Shield (Bodyguard)", async () => {
  // In for the Kill
  const hunter = createExecutorActor(15, { path: "hunter" });
  assert.equal(hasInForTheKill(hunter), true, "Level 15 Hunter has In for the Kill");

  const target = createTargetCreature("Boss");
  const opIdKill = "kill-exec-op";
  const transferRes = await specialistUses.execute(hunter, "transferDeathmark", {
    targetUuid: target.uuid,
    targetName: target.name
  }, opIdKill);
  assert.ok(transferRes);
  const killReceipt = specialistUses.receipt(hunter, opIdKill);
  assert.ok(killReceipt.summary.includes("Vulnerable"), "In for the Kill applies Vulnerability to Specialist attacks");
  assert.equal(hunter.flags.ak5e.inForTheKillVulnerable, true, "Flag recorded on actor");

  // Blade Shield
  const bodyguard = createExecutorActor(15, { path: "bodyguard" });
  assert.equal(hasBladeShield(bodyguard), true, "Level 15 Bodyguard has Blade Shield");

  setDeathmark(bodyguard, target);
  const opIdBlade15 = "blade-exec-15";
  const bladeRes = await specialistUses.execute(bodyguard, "bladeShield", {
    targetUuid: target.uuid
  }, opIdBlade15);
  assert.ok(bladeRes);
  const bladeReceipt = specialistUses.receipt(bodyguard, opIdBlade15);
  assert.equal(bladeReceipt.reaction?.requested, true, "Reaction spent at level 15");
  assert.equal(bladeRes.pbSubtracted, 5, "Subtracts PB (5) from attack roll");

  // Level 20 Blade Shield costs 0 reaction (Ultimate Sword and Shield)
  const bg20 = createExecutorActor(20, { path: "bodyguard" });
  setDeathmark(bg20, target);
  const opIdBlade20 = "blade-exec-20";
  const freeBladeRes = await specialistUses.execute(bg20, "bladeShield", {
    targetUuid: target.uuid
  }, opIdBlade20);
  assert.ok(freeBladeRes);
  const freeBladeReceipt = specialistUses.receipt(bg20, opIdBlade20);
  assert.equal(freeBladeReceipt.reaction?.free, true, "Costs 0 reaction at level 20");
});

/* ---------------------------------------------------------------- Test Area 12 */

test("Area 12: Level 20: Mortal Blow (Hunter) & Ultimate Sword and Shield (Bodyguard)", async () => {
  // Mortal Blow
  const hunter = createExecutorActor(20, { path: "hunter" });
  assert.equal(hasMortalBlow(hunter), true, "Level 20 Hunter has Mortal Blow");

  const target = createTargetCreature("Dragon");
  const opIdMortal = "mortal-exec-op";
  const mortalRes = await specialistUses.execute(hunter, "mortalBlow", {
    targetUuid: target.uuid,
    targetName: target.name
  }, opIdMortal);

  assert.ok(mortalRes, "Mortal Blow applied");
  const mortalReceipt = specialistUses.receipt(hunter, opIdMortal);
  assert.equal(mortalReceipt.formula, "10d8", "Interactive roll button provides 10d8 formula");
  assert.equal(mortalReceipt.dc, martialDC(hunter), "Uses Martial DC");
  assert.equal(getPool(hunter, "mortalBlow").value, 0, "Expends 1 use of Mortal Blow");

  // Shortfall on second use
  assert.throws(() => {
    specialistUses.plan(hunter, "mortalBlow", { targetUuid: target.uuid });
  }, err => err.warnings?.some(w => w.id === "shortfall"));

  // Ultimate Sword and Shield
  const bodyguard = createExecutorActor(20, { path: "bodyguard" });
  assert.equal(hasUltimateSwordAndShield(bodyguard), true, "Level 20 Bodyguard has Ultimate Sword and Shield");
});

/* ---------------------------------------------------------------- Test Area 13 */

test("Area 13: Full Encounter-Window Undo Reversibility (WORKFLOW §3.2)", async () => {
  const actor = createExecutorActor(5, { path: "hunter", initialProwess: 2 });
  const target = createTargetCreature("Reversion Target");

  // 1. Transfer Deathmark and Undo
  const opIdTransfer = "undo-transfer-op";
  await specialistUses.execute(actor, "transferDeathmark", {
    targetUuid: target.uuid,
    targetName: target.name
  }, opIdTransfer);
  assert.equal(getDeathmarkState(actor).held, false);

  const undoTransfer = await specialistUses.undo(actor, opIdTransfer);
  assert.equal(undoTransfer.undone, opIdTransfer, "Undo executed");
  assert.equal(getDeathmarkState(actor).held, true, "Deathmark held state restored cleanly by undo");

  // 2. Sweeper and Undo
  const opIdSweep = "undo-sweep-op";
  await specialistUses.execute(actor, "sweeper", { hidingOrInvisible: true }, opIdSweep);
  assert.equal(getPool(actor, "prowess").value, 1, "Prowess spent");
  assert.equal(actor.flags.ak5e.executor.sweeper.active, true);

  const undoSweep = await specialistUses.undo(actor, opIdSweep);
  assert.equal(undoSweep.undone, opIdSweep);
  assert.equal(getPool(actor, "prowess").value, 2, "Prowess fully restored to 2 on undo");
  assert.equal(actor.flags.ak5e.executor?.sweeper?.active ?? false, false, "Sweeper active flag restored to false");
});

/* ---------------------------------------------------------------- Test Area 14 */

test("Area 14: Hook Idempotency & Sweeper Mark Transfer Regression", async () => {
  // Test hook registration idempotency: calling registerExecutorHooks() multiple times installs exactly one listener
  registerExecutorHooks();
  registerExecutorHooks();

  const hunter = createExecutorActor(5, { path: "hunter" });
  const target = createTargetCreature("Marked Enemy");
  await setDeathmark(hunter, target);

  const rollConfig = { subject: { actor: hunter }, target, rolls: [{ parts: ["1d8"] }] };
  await Hooks.callAll("dnd5e.preRollDamageV2", rollConfig);
  assert.equal(rollConfig.rolls[0].parts.filter(p => p === "1d4").length, 1, "Deathmark bonus damage added exactly once even after multiple registerExecutorHooks() calls");

  const attackConfig = { subject: { actor: hunter }, target, rolls: [{ options: { criticalThreshold: 20 } }] };
  await Hooks.callAll("dnd5e.preRollAttackV2", attackConfig);
  assert.equal(attackConfig.rolls[0].options.criticalThreshold, 19, "Critical threshold decremented to exactly 19 (not 18)");

  // Test Sweeper mark transfer on hit to second target
  const target1 = createTargetCreature("Target 1");
  const target2 = createTargetCreature("Target 2");
  await specialistUses.execute(hunter, "sweeper", { hidingOrInvisible: true });
  await emitAk5eEvent("hit", { actorUuid: hunter.uuid, targetUuid: target1.uuid, raw: { actor: hunter } });
  assert.equal(getDeathmarkState(hunter).targetUuid, target1.uuid, "Target 1 holds Deathmark");

  await emitAk5eEvent("hit", { actorUuid: hunter.uuid, targetUuid: target2.uuid, raw: { actor: hunter } });
  assert.equal(getDeathmarkState(hunter).targetUuid, target2.uuid, "Target 2 holds Deathmark even though target 1 held it (Ch. 3 L5532)");
});
