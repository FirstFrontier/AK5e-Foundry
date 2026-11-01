import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineAntiAirPools, isAntiAir, antiAirRollInitiative
} from "../scripts/anti-air-features.mjs";
import {
  defineMarksmanPools
} from "../scripts/marksman-features.mjs";
import {
  marksmanUses, recoverMarksmanPool, plainRecoveryContext
} from "../scripts/marksman-uses.mjs";
import { getPool, setPool, listPoolDefinitions } from "../scripts/resource-pools.mjs";
import { opaqueKey } from "../scripts/operation-kernel.mjs";

function setupEnvironment() {
  globalThis.game = {
    users: {
      activeGM: { id: "gm-user", name: "GM", isGM: true },
      get: id => ({ id, isGM: id === "gm-user" })
    },
    user: { id: "gm-user", name: "GM", isGM: true },
    time: { worldTime: 100 },
    combat: { started: true, id: "combat-1", round: 1, turn: 0 },
    settings: { get: () => 0 },
    messages: []
  };
  globalThis.foundry = {
    utils: {
      randomID: () => "rand_" + Math.random().toString(36).slice(2, 10)
    }
  };
  globalThis.ChatMessage = {
    implementation: {
      getSpeaker: () => ({}),
      create: async message => {
        globalThis.game.messages.push(message);
        return message;
      }
    }
  };
}

function createMockAntiAirActor({
  uuid = "Actor.antiAirAdv",
  name = "MeteoriteAdv",
  level = 15,
  isAA = true,
  vaValue = 0,
  targetLockValue = 0
} = {}) {
  const actor = {
    uuid,
    name,
    documentName: "Actor",
    isOwner: true,
    testUserPermission: () => true,
    system: {
      attributes: { prof: Math.ceil(level / 4) + 1 },
      abilities: { dex: { mod: 4 }, str: { mod: 2 } }
    },
    items: [
      {
        type: "class",
        system: { levels: level },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      ...(isAA ? [{
        type: "subclass",
        name: "Anti-Air",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }] : [])
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, martialDcAbility: "dex" },
        resourcePools: {
          versatileApproach: { value: vaValue },
          targetLock: { value: targetLockValue }
        },
        marksmanCoordinator: { operations: [] },
        marksmanUses: { undo: [], data: {} }
      }
    },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async update(changes, options) {
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split(".");
        const last = parts.pop();
        let obj = this;
        for (const key of parts) obj = obj[key] ??= {};
        obj[last] = structuredClone(value);
      }
      return this;
    }
  };
  return actor;
}

// -----------------------------------------------------------------------------
// GROUP 1: MALICIOUS & EDGE-CASE CONTEXT PAYLOADS FOR recoverMarksmanPool
// -----------------------------------------------------------------------------

test("ADVERSARIAL: Deep circular reference payloads sanitize cleanly without JSON.stringify TypeError", async () => {
  setupEnvironment();
  defineMarksmanPools();
  defineAntiAirPools();

  const actor = createMockAntiAirActor({ uuid: "Actor.circ-adv-1" });

  // A -> B -> A
  const objA = { name: "A", num: 42, flag: true };
  const objB = { name: "B", refA: objA };
  objA.refB = objB;

  // Deeply nested circular graph
  const deepRoot = { level0: "ok" };
  let curr = deepRoot;
  for (let i = 1; i <= 20; i++) {
    curr[`level${i}`] = { depth: i, step: `node-${i}` };
    curr = curr[`level${i}`];
  }
  curr.loopBack = deepRoot;

  // Circular arrays
  const cyclicArr = ["hello", 123];
  cyclicArr.push(cyclicArr);

  const maliciousContext = {
    scalarString: "initiative-roll",
    scalarNum: 15,
    scalarBool: false,
    scalarNull: null,
    circularPair: objA,
    deepCycle: deepRoot,
    cyclicArray: cyclicArr
  };

  // 1. Verify plainRecoveryContext strips all circular references and leaves only scalars
  const sanitized = plainRecoveryContext(maliciousContext);
  assert.equal(sanitized.scalarString, "initiative-roll");
  assert.equal(sanitized.scalarNum, 15);
  assert.equal(sanitized.scalarBool, false);
  assert.equal(sanitized.scalarNull, null);
  assert.equal(sanitized.circularPair, undefined);
  assert.equal(sanitized.deepCycle, undefined);
  assert.equal(sanitized.cyclicArray, undefined);

  // 2. Direct stringification must not throw
  assert.doesNotThrow(() => {
    JSON.stringify(["recover", { context: sanitized }]);
  });

  // 3. recoverMarksmanPool executes through coordinator without throwing TypeError
  const result = await recoverMarksmanPool(actor, "sr", {
    poolIds: ["targetLock"],
    eventKey: "event-circ-stress",
    context: maliciousContext
  });

  assert.ok(Array.isArray(result));
  const ops = actor.flags.ak5e.marksmanCoordinator.operations;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].command, "recover");
  assert.equal(ops[0].status, "committed");
  assert.ok(typeof ops[0].fingerprint === "string" && ops[0].fingerprint.length > 0);
});

test("ADVERSARIAL: Mock Foundry document graph (.apps, .sheet, .items[0].actor) sanitization", async () => {
  setupEnvironment();
  defineMarksmanPools();

  const actor = createMockAntiAirActor({ uuid: "Actor.docgraph-1" });

  // Simulate Foundry VTT live document graph with back-references and DOM/App proxies
  const mockItem = {
    id: "item-123",
    name: "Repeating Heavy Crossbow",
    actor: null,
    sheet: { rendered: true, form: {} }
  };
  const mockApp = {
    appId: 99,
    rendered: true,
    object: actor,
    close: () => {},
    options: { classes: ["dnd5e", "sheet", "actor"] }
  };
  const mockSheet = {
    actor,
    apps: { 99: mockApp },
    render: () => {}
  };
  mockItem.actor = actor;
  mockApp.sheet = mockSheet;

  const foundryContext = {
    marksmanEvent: true,
    actorUuid: actor.uuid,
    combatantId: "cbt-123",
    actor,
    item: mockItem,
    sheet: mockSheet,
    apps: { main: mockApp },
    user: globalThis.game.user
  };

  const plain = plainRecoveryContext(foundryContext);
  assert.deepEqual(plain, {
    marksmanEvent: true,
    actorUuid: actor.uuid,
    combatantId: "cbt-123"
  });

  // Verify recoverMarksmanPool passes through coordinator kernel
  const res = await recoverMarksmanPool(actor, "lr", {
    poolIds: ["targetLock"],
    eventKey: "event-docgraph-lr",
    context: foundryContext
  });

  assert.ok(Array.isArray(res));
  const ops = actor.flags.ak5e.marksmanCoordinator.operations;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].status, "committed");
});

test("ADVERSARIAL: Exotic types, Symbols, BigInts, Functions, prototype pollution, null, undefined", async () => {
  setupEnvironment();
  defineMarksmanPools();

  const actor = createMockAntiAirActor({ uuid: "Actor.exotic-1" });

  const symKey = Symbol("secretKey");
  const exoticContext = {
    strVal: "normal",
    numVal: 0,
    negNum: -42.5,
    boolFalse: false,
    boolTrue: true,
    nullVal: null,
    undefVal: undefined,
    bigIntVal: 9007199254740993n,
    funcVal: () => "evil",
    asyncFuncVal: async () => {},
    arrOfObjects: [{ a: 1 }, { b: 2 }],
    nestedObj: { safeNum: 1 },
    [symKey]: "symbolValue"
  };

  // Add prototype pollution attempts
  const protoPolluter = JSON.parse('{"__proto__": {"polluted": true}}');
  Object.assign(exoticContext, protoPolluter);

  const plain = plainRecoveryContext(exoticContext);

  // Assert prototype pollution was blocked
  assert.equal(Object.prototype.polluted, undefined, "Object.prototype must not be polluted");
  assert.equal({}.polluted, undefined, "Clean objects must not show prototype pollution");

  // Assert primitive scalar retention
  assert.equal(plain.strVal, "normal");
  assert.equal(plain.numVal, 0);
  assert.equal(plain.negNum, -42.5);
  assert.equal(plain.boolFalse, false);
  assert.equal(plain.boolTrue, true);
  assert.equal(plain.nullVal, null);

  // Assert non-scalars were stripped
  assert.equal(plain.undefVal, undefined);
  assert.equal(plain.bigIntVal, undefined, "BigInt must be omitted to prevent JSON.stringify TypeError");
  assert.equal(plain.funcVal, undefined);
  assert.equal(plain.asyncFuncVal, undefined);
  assert.equal(plain.arrOfObjects, undefined);
  assert.equal(plain.nestedObj, undefined);
  assert.equal(plain[symKey], undefined);

  // Test root-level edge cases
  assert.deepEqual(plainRecoveryContext(null), {});
  assert.deepEqual(plainRecoveryContext(undefined), {});
  assert.deepEqual(plainRecoveryContext("primitive string"), {});
  assert.deepEqual(plainRecoveryContext(12345), {});
  assert.deepEqual(plainRecoveryContext(true), {});
  assert.deepEqual(plainRecoveryContext(Symbol("foo")), {});
  assert.deepEqual(plainRecoveryContext(100n), {});

  // Test recoverMarksmanPool with exoticContext
  const res = await recoverMarksmanPool(actor, "sr", {
    poolIds: ["targetLock"],
    eventKey: "event-exotic",
    context: exoticContext
  });
  assert.ok(Array.isArray(res));
  assert.equal(actor.flags.ak5e.marksmanCoordinator.operations.length, 1);
});

// -----------------------------------------------------------------------------
// GROUP 2: STRESS TEST antiAirRollInitiative & CONCURRENCY
// -----------------------------------------------------------------------------

test("ADVERSARIAL: Concurrency between antiAirRollInitiative and versatileApproach spending", async () => {
  setupEnvironment();
  defineAntiAirPools();
  defineMarksmanPools();

  // Create Level 15 Anti-Air with 1 Versatile Approach use (max = 5)
  const actor = createMockAntiAirActor({
    uuid: "Actor.concurrency-aa",
    level: 15,
    isAA: true,
    vaValue: 1
  });

  const vaPoolBefore = getPool(actor, "versatileApproach");
  assert.equal(vaPoolBefore.value, 1);
  assert.equal(vaPoolBefore.max, 5);

  // Fire concurrent Option Recharge recovery and Versatile Approach spend simultaneously
  const recoveryPromise = antiAirRollInitiative(actor, {
    eventId: "concurrent-init-event",
    combatantId: "combatant-concurrent-1",
    combatUuid: "Combat.concurrent-1"
  });

  const spendPromise = marksmanUses.command(actor, "versatileApproach", {
    confirmed: true,
    option: "shootToKill",
    conditionsConfirmed: true,
    targetUuid: "Target.Foe.1",
    targetName: "Target Foe",
    damageInstances: 1
  }, "spend-concurrent-action");

  // Await both promises concurrently
  const [recResult, spendResult] = await Promise.all([recoveryPromise, spendPromise]);

  // Both operations must have completed successfully
  assert.ok(Array.isArray(recResult), "Option Recharge completed and returned recovery receipt");
  assert.ok(spendResult, "Versatile Approach spend completed");

  // Verify the serial coordinator recorded BOTH operations in its queue
  const ops = actor.flags.ak5e.marksmanCoordinator.operations;
  assert.equal(ops.length, 2, "Coordinator queue must contain exactly 2 serial operations");

  const commands = ops.map(o => o.command);
  assert.ok(commands.includes("recover"), "Coordinator recorded recover operation");
  assert.ok(commands.includes("use"), "Coordinator recorded use operation");
  assert.ok(ops.every(o => o.status === "committed"), "All coordinator operations must be committed");

  // Check that no increments were lost:
  // Initial: 1. Spent: 1. Recovered: 1. Net result must be exactly 1!
  const vaPoolAfter = getPool(actor, "versatileApproach");
  assert.equal(vaPoolAfter.value, 1, "Net pool value must be 1 (1 - 1 + 1) without lost updates");
});

test("ADVERSARIAL: Concurrent burst stress test (5 recoveries + 5 spends) maintains serial queue integrity", async () => {
  setupEnvironment();
  defineAntiAirPools();
  defineMarksmanPools();

  // Start with 2 uses
  const actor = createMockAntiAirActor({
    uuid: "Actor.burst-aa",
    level: 15,
    isAA: true,
    vaValue: 2
  });

  // Launch 5 recoveries (each with distinct eventId) and 5 spends interleaved concurrently
  const tasks = [];
  for (let i = 0; i < 5; i++) {
    tasks.push(
      antiAirRollInitiative(actor, {
        eventId: `burst-init-${i}`,
        combatantId: `cbt-${i}`,
        combatUuid: `Combat.${i}`
      })
    );
    tasks.push(
      marksmanUses.command(actor, "versatileApproach", {
        confirmed: true,
        option: "shootToKill",
        conditionsConfirmed: true,
        attackId: `burst-attack-${i}`,
        targetUuid: `Target.Enemy.${i}`,
        damageInstances: 1
      }, `burst-spend-${i}`)
    );
  }

  // Execute all 10 interleaved operations concurrently
  await Promise.all(tasks);

  const ops = actor.flags.ak5e.marksmanCoordinator.operations;
  assert.equal(ops.length, 10, "All 10 operations must be recorded in the coordinator ledger");
  assert.ok(ops.every(o => o.status === "committed"), "Every operation committed cleanly");

  // Starting value: 2. 5 spends (-5) + 5 recoveries (+5) = 2.
  // Pool max is 5 (at level 15 prof = 5). Pool must remain within [0, 5].
  const finalPool = getPool(actor, "versatileApproach");
  assert.ok(finalPool.value >= 0 && finalPool.value <= finalPool.max, "Pool value must be within bounds");
  assert.equal(finalPool.value, 2, "Final pool value must accurately match net transactions without lost increments");
});

test("ADVERSARIAL: antiAirRollInitiative respects level gates and max capacity", async () => {
  setupEnvironment();
  defineAntiAirPools();

  // 1. Level 14 Anti-Air (Option Recharge requires level 15)
  const actorLvl14 = createMockAntiAirActor({
    uuid: "Actor.lvl14-aa",
    level: 14,
    isAA: true,
    vaValue: 0
  });
  const res14 = await antiAirRollInitiative(actorLvl14, { eventId: "init-lvl14" });
  assert.equal(res14, undefined, "Level 14 Anti-Air must return undefined");
  assert.equal(getPool(actorLvl14, "versatileApproach").value, 0, "No recharge applied to level 14");
  assert.equal(actorLvl14.flags.ak5e.marksmanCoordinator.operations.length, 0, "No coordinator ops queued");

  // 2. Level 4 Anti-Air (Core Versatile Approach unlocked, but no Option Recharge)
  const actorLvl4 = createMockAntiAirActor({
    uuid: "Actor.lvl4-aa",
    level: 4,
    isAA: true,
    vaValue: 0
  });
  const res4 = await antiAirRollInitiative(actorLvl4, { eventId: "init-lvl4" });
  assert.equal(res4, undefined, "Level 4 Anti-Air must return undefined");
  assert.equal(getPool(actorLvl4, "versatileApproach").value, 0, "No recharge applied to level 4");

  // 3. Level 15 Non-Anti-Air Marksman
  const actorBaseMarksman = createMockAntiAirActor({
    uuid: "Actor.lvl15-base",
    level: 15,
    isAA: false,
    vaValue: 0
  });
  const resBase = await antiAirRollInitiative(actorBaseMarksman, { eventId: "init-base" });
  assert.equal(resBase, undefined, "Non-Anti-Air Marksman must return undefined");

  // 4. Level 15 Anti-Air already at MAX capacity
  const actorAtMax = createMockAntiAirActor({
    uuid: "Actor.lvl15-max",
    level: 15,
    isAA: true,
    vaValue: 5 // max is prof = 5
  });
  const resMax = await antiAirRollInitiative(actorAtMax, { eventId: "init-at-max" });
  assert.equal(resMax, undefined, "Actor at max capacity must return undefined without queuing an op");
  assert.equal(actorAtMax.flags.ak5e.marksmanCoordinator.operations.length, 0);
});

test("ADVERSARIAL: Zero-pool spending clamps at 0 and handles concurrent Option Recharge without negative values", async () => {
  setupEnvironment();
  defineAntiAirPools();
  defineMarksmanPools();

  // 1. Single spend from 0 uses with override
  const actorZero = createMockAntiAirActor({
    uuid: "Actor.zero-spend",
    level: 15,
    isAA: true,
    vaValue: 0
  });

  const spendZero = await marksmanUses.command(actorZero, "versatileApproach", {
    confirmed: true,
    option: "shootToKill",
    conditionsConfirmed: true,
    overrides: ["versatileApproach"],
    attackId: "zero-attack-1",
    targetUuid: "Target.Enemy.0",
    damageInstances: 1
  }, "spend-zero-1");

  assert.ok(spendZero);
  const poolAfterZero = getPool(actorZero, "versatileApproach");
  assert.equal(poolAfterZero.value, 0, "Uses clamp at 0 and never become negative");

  const receipt = marksmanUses.receipt(actorZero, "spend-zero-1");
  assert.ok(receipt.shortfalls?.some(s => s.includes("Versatile Approach short by 1")), "Shortfall recorded on receipt");
  assert.equal(actorZero.flags.ak5e.marksmanCoordinator.operations.length, 1);
  assert.equal(actorZero.flags.ak5e.marksmanCoordinator.operations[0].status, "committed");

  // 2. Concurrent race: starting at 0, spend with override AND roll initiative recovery simultaneously
  const actorRace = createMockAntiAirActor({
    uuid: "Actor.race-from-zero",
    level: 15,
    isAA: true,
    vaValue: 0
  });

  const taskRec = antiAirRollInitiative(actorRace, {
    eventId: "race-zero-init",
    combatantId: "cbt-race-zero",
    combatUuid: "Combat.race-zero"
  });

  const taskSpend = marksmanUses.command(actorRace, "versatileApproach", {
    confirmed: true,
    option: "shootToKill",
    conditionsConfirmed: true,
    overrides: ["versatileApproach"],
    attackId: "race-zero-attack",
    targetUuid: "Target.Enemy.Race",
    damageInstances: 1
  }, "spend-race-zero");

  await Promise.all([taskRec, taskSpend]);

  const ops = actorRace.flags.ak5e.marksmanCoordinator.operations;
  assert.equal(ops.length, 2, "Both operations must be recorded in coordinator");
  assert.ok(ops.every(o => o.status === "committed"));

  const finalPool = getPool(actorRace, "versatileApproach");
  assert.ok(finalPool.value >= 0, "Pool value must be non-negative");
  assert.ok(finalPool.value === 0 || finalPool.value === 1, "Pool value must be either 0 or 1 depending on serial execution order");
});

