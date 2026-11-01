import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineMarksmanPools, marksmanPreRollAttack, marksmanPreRollDamage,
  marksmanPostRollAttack, recoverTargetLockOnInitiative,
  checkHighGround, isDefensiveStyleActive, expireDefensiveStyle, DEFENSIVE_STYLE_PLANS
} from "../scripts/marksman-features.mjs";
import { CORE_PLANS, MARKSMAN_READINGS, marksmanUses, recordMarksmanRuling, recoverMarksmanPool, plainRecoveryContext } from "../scripts/marksman-uses.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";

test("Marksman pools initialize and spend correctly", () => {
  defineMarksmanPools();

  const actor = {
    uuid: "Actor.marksman1",
    name: "Exusiai",
    items: [
      {
        type: "class",
        system: { levels: 20 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const lock = getPool(actor, "targetLock");
  assert.equal(lock.max, 1);
  assert.equal(lock.value, 1);

  const unerr = getPool(actor, "unerring");
  assert.equal(unerr.max, 1);
  assert.equal(unerr.value, 1);

  const rain = getPool(actor, "steelRain");
  assert.equal(rain.max, 1);
  assert.equal(rain.value, 1);
});

test("Target Lock plan spends pool and records active target", async () => {
  const actor = {
    uuid: "Actor.marksman2",
    name: "Jessica",
    items: [
      {
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = CORE_PLANS.targetLock(actor, {}, { targetUuid: "Scene.1.Token.reunion1", targetName: "Reunion Thug" });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-1" };
  const updates = plan.apply({}, receipt);

  assert.equal(updates["flags.ak5e.marksman.targetLock"].active, true);
  assert.equal(updates["flags.ak5e.marksman.targetLock"].targetUuid, "Scene.1.Token.reunion1");
  assert.equal(updates["flags.ak5e.marksman.targetLock"].bonus, 1);
  assert.equal(receipt.result.bonus, 1);
  assert.equal(Number.isFinite(updates["flags.ak5e.marksman.targetLock"].expiresAt), true);
  assert.equal(updates["flags.ak5e.marksman.targetLock"].expiresAt - updates["flags.ak5e.marksman.targetLock"].startedAt, 60);
});

test("Target Lock warns before timing violations and replacing a live lock", () => {
  const actor = {
    uuid: "Actor.marksman-warning",
    items: [{ type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true, targetLock: { active: true, targetUuid: "Token.old", targetName: "Old", expiresAt: 500 } } } }
  };
  globalThis.game = { time: { worldTime: 100 }, combat: { started: true, combatant: { actor: { uuid: "Actor.other" } } } };
  const plan = CORE_PLANS.targetLock(actor, {}, { targetUuid: "Token.new", targetName: "New" });
  assert.deepEqual(plan.warnings.map(warning => warning.id), ["timing", "replaceLock"]);
});

test("Target Lock level-11 use exposes the source choice and stores its per-use bonus", () => {
  const actor = {
    uuid: "Actor.marksman-level11",
    items: [{ type: "class", system: { levels: 11 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true } } }
  };
  const plan = CORE_PLANS.targetLock(actor, {}, { targetUuid: "Token.target", reading: "11" });
  assert.equal(plan.reading, "enhancedTargetLockLevel");
  assert.deepEqual(MARKSMAN_READINGS.enhancedTargetLockLevel.options.map(option => option.value), ["11", "12"]);
  const receipt = {};
  const updates = plan.apply({}, receipt, "11");
  assert.equal(updates["flags.ak5e.marksman.targetLock"].bonus, 2);
});

test("play engine applies the string choice and a recorded GM ruling to Target Lock", async () => {
  const makeActor = id => ({
    uuid: id,
    name: "Marksman",
    isOwner: true,
    items: [{ type: "class", system: { levels: 11 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true }, resourcePools: { targetLock: { value: 1 } } } },
    async update(updates) {
      for (const [path, value] of Object.entries(updates)) {
        const keys = path.split(".");
        let target = this;
        for (const key of keys.slice(0, -1)) target = target[key] ??= {};
        target[keys.at(-1)] = value;
      }
      return this;
    }
  });
  globalThis.game = { user: { id: "player", isGM: false }, settings: { get: () => 0 }, messages: [] };
  globalThis.ChatMessage = { implementation: {
    getSpeaker: () => ({}),
    create: async message => { globalThis.game.messages.push(message); return message; }
  } };

  const playerChoiceActor = makeActor("Actor.level11-player-choice");
  const playerResult = await marksmanUses.command(playerChoiceActor, "targetLock", {
    confirmed: true, targetUuid: "Token.target", reading: "11"
  }, "level11-player-choice");
  assert.equal(playerResult.bonus, 2);
  assert.equal(marksmanUses.receipt(playerChoiceActor, "level11-player-choice").reading, "11th level (class table)");

  const gmRulingActor = makeActor("Actor.level11-gm-ruling");
  globalThis.game.user.isGM = true;
  await recordMarksmanRuling(gmRulingActor, "enhancedTargetLockLevel", "11", "The GM uses the class table's 11th-level unlock.");
  globalThis.game.user.isGM = false;
  const ruledResult = await marksmanUses.command(gmRulingActor, "targetLock", {
    confirmed: true, targetUuid: "Token.target"
  }, "level11-gm-ruling");
  assert.equal(ruledResult.bonus, 2);
  assert.equal(marksmanUses.receipt(gmRulingActor, "level11-gm-ruling").reading, null);
});

test("Martial DC choice is a receipt-backed core plan", () => {
  const actor = {
    uuid: "Actor.martial-dc",
    name: "Marksman",
    items: [{ type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true } } }
  };
  const plan = CORE_PLANS.chooseMartialDC(actor, {}, { martialDcAbility: "dex" });
  const receipt = {};
  const updates = plan.apply({}, receipt);
  assert.equal(updates["flags.ak5e.marksman.martialDcAbility"], "dex");
  assert.equal(receipt.result.martialDcAbility, "dex");
  assert.throws(() => CORE_PLANS.chooseMartialDC(actor, {}, { martialDcAbility: "wis" }), /Choose Strength or Dexterity/);
});

test("marksmanPreRollAttack applies Target Lock bonus and Ranger style", () => {
  const actor = {
    system: { attributes: { prof: 2 } },
    items: [
      {
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          fightingStyle: "ranger",
          targetLock: {
            active: true,
            targetUuid: "Token.target1",
            bonus: 1,
            expiresAt: 10000000000
          }
        }
      }
    },
    getActiveTokens() { return []; }
  };

  // Mock target in global game
  globalThis.game = {
    user: {
      targets: {
        first: () => ({ document: { uuid: "Token.target1" } })
      }
    }
  };

  const roll = { parts: ["1d20", "4"], options: {} };
  const config = {
    subject: {
      actor,
      actionType: "rwak"
    },
    rolls: [roll]
  };

  marksmanPreRollAttack(config);

  // Target Lock adds +1, Ranger style adds +2
  assert.equal(roll.parts.includes("1"), true);
  assert.equal(roll.parts.includes("2"), true);
});

test("checkHighGround verifies 10 ft height advantage", () => {
  const highToken = { elevation: 20 };
  const lowToken = { elevation: 10 };
  const groundToken = { elevation: 0 };

  assert.equal(checkHighGround(highToken, lowToken), true); // 10 ft difference -> true
  assert.equal(checkHighGround(highToken, groundToken), true); // 20 ft difference -> true
  assert.equal(checkHighGround(lowToken, highToken), false); // Below -> false
  assert.equal(checkHighGround(lowToken, groundToken), true); // 10 ft difference -> true
  assert.equal(checkHighGround(lowToken, { elevation: 5 }), false); // 5 ft difference -> false
});

test("Close and Personal clears disadvantage even when advantage is also set", () => {
  const attacker = { center: { x: 0, y: 0 }, document: { disposition: 1 } };
  const hostile = { center: { x: 50, y: 0 }, document: { disposition: -1 } };
  const actor = {
    uuid: "Actor.close-personal",
    items: [{ type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true, fightingStyle: "closeAndPersonal" } } },
    getActiveTokens: () => [attacker]
  };
  globalThis.canvas = { tokens: { placeables: [attacker, hostile] }, grid: { size: 100, distance: 5 } };
  const roll = { options: { advantage: true, disadvantage: true } };
  marksmanPreRollAttack({ subject: { actor, actionType: "rwak" }, rolls: [roll] });
  assert.equal(roll.options.advantage, true);
  assert.equal(roll.options.disadvantage, false);
});

test("Deadly Fighter expands critical range once per combat Turn", () => {
  const actor = {
    uuid: "Actor.deadly",
    items: [{ type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true, fightingStyle: "deadlyFighter" } } }
  };
  globalThis.game = { combat: { id: "Combat.deadly", started: true, round: 1, turn: 0 }, user: { targets: { first: () => null } } };
  const item = { uuid: "Item.deadly", flags: { ak5e: { deadly: true } } };
  const attack = (weapon = item, roll = { options: {} }) => {
    marksmanPreRollAttack({ subject: { actor, item: weapon, actionType: "rwak" }, rolls: [roll] });
    return roll;
  };
  const firstRoll = attack();
  assert.equal(firstRoll.options.criticalSuccess, 19);
  attack(item, firstRoll); // Reprocessing one native roll cannot stack the range bonus.
  assert.equal(firstRoll.options.criticalSuccess, 19);
  marksmanPostRollAttack([], { subject: { actor, item } });
  assert.equal(attack().options.criticalSuccess, undefined);
  globalThis.game.combat.turn = 1;
  // A canceled dialog never reaches postRollAttack, so the next attempted roll can still use the benefit.
  assert.equal(attack().options.criticalSuccess, 19);
  const retryItem = { uuid: "Item.deadly-retry", flags: { ak5e: { deadly: true } } };
  assert.equal(attack(retryItem).options.criticalSuccess, 19);
  marksmanPostRollAttack([], { subject: { actor, item: retryItem } });
  assert.equal(attack().options.criticalSuccess, undefined);
});

test("Enhanced Target Lock initiative recovery reads raw.actor and uses receipt-aware recovery", async () => {
  const makeActor = (level, ruling) => ({
    uuid: `Actor.initiative-${level}`,
    items: [{ type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true, ...(ruling ? { rulings: { enhancedTargetLockLevel: { value: ruling } } } : {}) }, resourcePools: { targetLock: { value: 0 } } } },
    async update(updates) {
      for (const [path, value] of Object.entries(updates)) {
        const keys = path.split(".");
        let target = this;
        for (const key of keys.slice(0, -1)) target = target[key] ??= {};
        target[keys.at(-1)] = value;
      }
      return this;
    }
  });
  const level12 = makeActor(12);
  const event = { eventId: "initiative-event-12", raw: { actor: level12 }, combatUuid: "Combat.test" };
  const recovered = await recoverTargetLockOnInitiative(event);
  assert.equal(recovered[0].after, 1);
  const duplicate = await recoverTargetLockOnInitiative(event);
  assert.equal(duplicate[0].skipped, "receipt");

  const unresolved11 = makeActor(11);
  await recoverTargetLockOnInitiative({ eventId: "initiative-event-11", raw: { actor: unresolved11 } });
  assert.equal(getPool(unresolved11, "targetLock").value, 0);
});

test("B-301: recoverMarksmanPool handles circular options.context without TypeError: Converting circular structure to JSON", async () => {
  defineMarksmanPools();
  globalThis.game = {
    users: { activeGM: { id: "gm", name: "GM", isGM: true } },
    user: { id: "gm", name: "GM", isGM: true },
    time: { worldTime: 100 }
  };
  globalThis.foundry = { utils: { randomID: () => "recov-id-1" } };

  const actor = {
    uuid: "Actor.circ-test",
    name: "MarksmanCirc",
    documentName: "Actor",
    isOwner: true,
    items: [
      { type: "class", system: { levels: 5 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true },
        resourcePools: { targetLock: { value: 0 } },
        marksmanCoordinator: { operations: [] }
      }
    },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(updates) {
      for (const [path, value] of Object.entries(updates)) {
        const keys = path.split(".");
        let target = this;
        for (const key of keys.slice(0, -1)) target = target[key] ??= {};
        target[keys.at(-1)] = structuredClone(value);
      }
      return this;
    }
  };

  // Build a circular context simulating D&D5e Document / App / Sheet references
  const circularContext = {
    marksmanEvent: true,
    actorUuid: actor.uuid,
    numberProp: 100,
    boolProp: true,
    nullProp: null
  };
  circularContext.self = circularContext;
  circularContext.actor = actor;
  circularContext.sheet = { app: circularContext };

  // plainRecoveryContext helper strips circular non-primitive fields
  const plain = plainRecoveryContext(circularContext);
  assert.equal(plain.marksmanEvent, true);
  assert.equal(plain.actorUuid, actor.uuid);
  assert.equal(plain.numberProp, 100);
  assert.equal(plain.boolProp, true);
  assert.equal(plain.nullProp, null);
  assert.equal(plain.self, undefined);
  assert.equal(plain.actor, undefined);
  assert.equal(plain.sheet, undefined);

  // recoverMarksmanPool succeeds without throwing TypeError
  const result = await recoverMarksmanPool(actor, "sr", {
    poolIds: ["targetLock"],
    eventKey: "event-sr-circ",
    context: circularContext
  });

  assert.ok(Array.isArray(result));
  assert.equal(getPool(actor, "targetLock").value, 1, "targetLock pool is recovered to 1");

  // Verify the coordinator recorded operation contains only sanitized plain data
  const ops = actor.flags.ak5e.marksmanCoordinator.operations;
  assert.equal(ops.length, 1);
  assert.equal(ops[0].command, "recover");
  assert.equal(ops[0].status, "committed");
});

test("Unerring damage continuation carries hit provenance, effective total, and suppresses critical", () => {
  const actor = {
    uuid: "Actor.unerring-test",
    name: "Unerring Shooter",
    items: [
      { type: "class", system: { levels: 7 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, unerringConvertedHit: true },
        marksmanReceipts: {
          "rcpt-unerring-42": {
            id: "rcpt-unerring-42",
            command: "unerring",
            result: { convertedToHit: true, originalTotal: 12, effectiveTotal: 17 },
            messageUuid: "ChatMessage.attack-msg-42"
          }
        }
      }
    }
  };

  const roll = {
    parts: ["1d8", "3"],
    options: {
      critical: true,
      isCritical: true
    }
  };

  const config = {
    subject: {
      actor,
      actionType: "rwak"
    },
    rolls: [roll],
    originMessageUuid: "ChatMessage.attack-msg-42",
    flags: { ak5e: {} }
  };

  marksmanPreRollDamage(config);

  assert.equal(roll.options.ak5eMarksman.unerring, true);
  assert.equal(roll.options.ak5eMarksman.convertedToHit, true);
  assert.equal(roll.options.ak5eMarksman.hit, true);
  assert.equal(roll.options.ak5eMarksman.effectiveTotal, 17);
  assert.equal(roll.options.ak5eMarksman.unerringUseId, "rcpt-unerring-42");
  assert.equal(roll.options.critical, false, "Unerring converted hit suppresses critical damage");
  assert.equal(roll.options.isCritical, false, "Unerring converted hit suppresses isCritical damage");
  assert.equal(roll.critical, false);
  assert.equal(config.flags.ak5e.unerring, true);
  assert.equal(config.flags.ak5e.convertedToHit, true);
});

test("Defensive fighting style explicit end control and predictable expiration", async () => {
  const actor = {
    uuid: "Actor.defensive-test",
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          fightingStyles: ["defensive"],
          defensiveBonusActive: true,
          defensiveActiveUntil: 100
        }
      }
    }
  };

  assert.equal(isDefensiveStyleActive(actor), true);

  // Test the endDefensiveStyle plan
  const plan = DEFENSIVE_STYLE_PLANS.endDefensiveStyle(actor, {}, {});
  assert.equal(plan.warnings.length, 0);
  const receipt = { id: "rcpt-def-end" };
  const updates = plan.apply({}, receipt);
  assert.equal(receipt.result.ended, true);
  assert.equal(updates["flags.ak5e.marksman.defensiveBonusActive"], false);
  assert.equal(receipt.targets.length, 1);
  assert.deepEqual(receipt.targets[0].payload.removeLabels, ["Defensive: end after the triggering Attack"]);

  // Test validateTarget
  assert.equal(DEFENSIVE_STYLE_PLANS.endDefensiveStyle.validateTarget(actor, receipt, receipt.targets[0], actor), true);

  // Test expireDefensiveStyle helper
  const expired = await expireDefensiveStyle(actor);
  assert.equal(expired["flags.ak5e.marksman.defensiveBonusActive"], false);
  assert.ok(typeof expired["flags.ak5e.marksman.defensiveExpiredAt"] === "number");

  // Test marksmanPostRollAttack clears defensive bonus after triggering attack
  actor.flags.ak5e.marksman.defensiveBonusActive = true;
  assert.equal(isDefensiveStyleActive(actor), true);
  const postRollConfig = {
    subject: { actor, actionType: "mwak" },
    flags: { ak5e: {} }
  };
  marksmanPostRollAttack(postRollConfig);
  assert.equal(postRollConfig.flags.ak5e.defensiveStyleExpired, true);
  assert.equal(actor.flags.ak5e.marksman.defensiveBonusActive, false);
  assert.equal(isDefensiveStyleActive(actor), false);
});

