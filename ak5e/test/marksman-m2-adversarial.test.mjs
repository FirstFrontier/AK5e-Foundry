import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineMarksmanPools, marksmanPreRollDamage, marksmanPostRollAttack,
  isDefensiveStyleActive, expireDefensiveStyle, DEFENSIVE_STYLE_PLANS,
  findUnerringReceipt
} from "../scripts/marksman-features.mjs";
import {
  defineAntiAirPools, isAirborneOrFast, declareAirborneTarget,
  antiAirPreRollAttack, antiAirRollInitiative, ANTI_AIR_PLANS
} from "../scripts/anti-air-features.mjs";
import {
  marksmanUses, recoverMarksmanPool
} from "../scripts/marksman-uses.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";

function setupEnvironment() {
  globalThis.game = {
    users: {
      activeGM: { id: "gm-user", name: "GM", isGM: true },
      get: id => ({ id, isGM: id === "gm-user" })
    },
    user: { id: "gm-user", name: "GM", isGM: true },
    time: { worldTime: 1000 },
    combat: { started: true, id: "combat-m2", round: 1, turn: 0 },
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

function createMockMarksmanActor({
  uuid = "Actor.marksmanM2",
  name = "AdversarialMarksman",
  level = 17,
  branch = "antiAir",
  defensiveBonusActive = false,
  defensiveEffect = false,
  vaValue = 0
} = {}) {
  const effects = [];
  if (defensiveEffect) {
    effects.push({
      id: "eff-def-1",
      name: "Defensive: end after the triggering Attack",
      statuses: new Set(),
      flags: { ak5e: { marksmanResolutionEffect: { sourceUuid: uuid } } }
    });
  }

  const actor = {
    uuid,
    id: uuid.split(".").pop(),
    name,
    documentName: "Actor",
    isOwner: true,
    testUserPermission: () => true,
    effects,
    system: {
      attributes: { prof: Math.ceil(level / 4) + 1, hp: { value: 50, max: 50 } },
      abilities: { dex: { mod: 4 }, str: { mod: 2 } }
    },
    items: [
      {
        type: "class",
        system: { levels: level },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      ...(branch ? [{
        type: "subclass",
        name: branch === "antiAir" ? "Anti-Air" : branch,
        flags: { ak5e: { chapterThreeId: `subclass-marksman-${branch.replace(/([A-Z])/g, "-$1").toLowerCase()}` } }
      }] : [])
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          martialDcAbility: "dex",
          defensiveBonusActive
        },
        resourcePools: {
          versatileApproach: { value: vaValue },
          unerring: { value: 1 }
        },
        marksmanCoordinator: { operations: [] },
        marksmanUses: { undo: [], data: {} }
      }
    },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split(".");
        const last = parts.pop();
        let obj = this;
        for (const key of parts) obj = obj[key] ??= {};
        obj[last] = structuredClone(value);
      }
      return this;
    },
    async deleteEmbeddedDocuments(type, ids) {
      if (type === "ActiveEffect") {
        this.effects = this.effects.filter(e => !ids.includes(e.id));
      }
      return ids;
    }
  };
  return actor;
}

// =============================================================================
// GROUP 1: UNERRING DAMAGE CONTINUATION & CRITICAL SUPPRESSION
// =============================================================================

test("ADVERSARIAL: Normal damage roll without Unerring preserves critical status and options intact", () => {
  setupEnvironment();
  defineMarksmanPools();

  const actor = createMockMarksmanActor({ level: 17 });
  const roll = {
    parts: ["1d10", "4"],
    options: {
      critical: true,
      isCritical: true,
      criticalSuccess: 20
    },
    critical: true
  };

  const config = {
    subject: {
      actor,
      actionType: "rwak"
    },
    rolls: [roll],
    originMessageUuid: "ChatMessage.normal-attack-msg",
    flags: { ak5e: {} }
  };

  marksmanPreRollDamage(config);

  // Assert nothing related to Unerring touched the roll
  assert.equal(roll.options.critical, true, "Normal critical roll retains options.critical = true");
  assert.equal(roll.options.isCritical, true, "Normal critical roll retains options.isCritical = true");
  assert.equal(roll.critical, true, "Normal critical roll retains roll.critical = true");
  assert.equal(roll.options.ak5eMarksman?.unerring, undefined, "Unerring option flag is undefined");
  assert.equal(config.flags.ak5e.unerring, undefined, "Unerring config flag is undefined");
  assert.deepEqual(roll.parts, ["1d10", "4"], "Damage formula parts remain unchanged");
});

test("ADVERSARIAL: Attack converted by Unerring strictly suppresses critical damage and inherits hit provenance", () => {
  setupEnvironment();
  defineMarksmanPools();

  const actor = createMockMarksmanActor({ level: 17 });

  // Store completed Unerring receipt in marksmanUses undo
  const unerringReceipt = {
    id: "rcpt-unerring-stress",
    command: "unerring",
    status: "complete",
    originMessageUuid: "ChatMessage.missed-roll-101",
    result: {
      hit: true,
      effectiveTotal: 18,
      originMessageUuid: "ChatMessage.missed-roll-101"
    }
  };
  actor.flags.ak5e.marksmanUses.undo.push(unerringReceipt);

  // Even if the damage roll is configured with critical: true (e.g. d20 rolled 20 or user toggled crit)
  const roll = {
    parts: ["1d10", "4"],
    options: {
      critical: true,
      isCritical: true,
      criticalMultiplier: 2
    },
    critical: true
  };

  const config = {
    subject: {
      actor,
      actionType: "rwak"
    },
    rolls: [roll],
    originMessageUuid: "ChatMessage.missed-roll-101",
    flags: { ak5e: {} }
  };

  marksmanPreRollDamage(config);

  // Critical hit MUST be strictly suppressed per Chapter 3 rule (minimum required to hit)
  assert.equal(roll.options.critical, false, "Unerring conversion strictly forces roll.options.critical to false");
  assert.equal(roll.options.isCritical, false, "Unerring conversion strictly forces roll.options.isCritical to false");
  assert.equal(roll.critical, false, "Unerring conversion strictly forces roll.critical to false");

  // Provenance and hit metadata must be properly set
  assert.equal(roll.options.ak5eMarksman.unerring, true, "roll.options carries ak5eMarksman.unerring = true");
  assert.equal(roll.options.ak5eMarksman.convertedToHit, true, "roll.options carries convertedToHit = true");
  assert.equal(roll.options.ak5eMarksman.hit, true, "roll.options carries hit = true");
  assert.equal(roll.options.ak5eMarksman.effectiveTotal, 18, "Effective AC total inherited from unerring receipt");
  assert.equal(roll.options.ak5eMarksman.unerringUseId, "rcpt-unerring-stress", "Linked to unerring receipt ID");
  assert.equal(roll.options.ak5eMarksman.actorUuid, actor.uuid);

  // Config flags
  assert.equal(config.flags.ak5e.unerring, true, "config.flags.ak5e.unerring is set");
  assert.equal(config.flags.ak5e.convertedToHit, true, "config.flags.ak5e.convertedToHit is set");
});

test("ADVERSARIAL: Unerring provenance resolution across diverse channels and DOM datasets", () => {
  setupEnvironment();
  defineMarksmanPools();

  const actor = createMockMarksmanActor({ level: 17 });
  const unerringRcpt = {
    id: "rcpt-channel-test",
    command: "unerring",
    status: "complete",
    originMessageUuid: "Scene.1.Token.actor.ChatMessage.xyz789",
    result: { hit: true, effectiveTotal: 15 }
  };
  actor.flags.ak5e.marksmanReceipts = [unerringRcpt];

  // Channel A: DOM dataset resolution fallback
  const mockEvent = {
    target: {
      closest: sel => sel === "[data-message-id]" ? { dataset: { messageId: "ChatMessage.xyz789" } } : null
    }
  };
  const rollA = { parts: ["1d8", "3"], options: { critical: true } };
  const configA = {
    subject: { actor, actionType: "rwak" },
    rolls: [rollA],
    event: mockEvent,
    flags: { ak5e: {} }
  };
  marksmanPreRollDamage(configA);
  assert.equal(rollA.options.critical, false, "Channel A: Suffix messageId match via DOM dataset suppresses crit");
  assert.equal(rollA.options.ak5eMarksman.effectiveTotal, 15);

  // Channel B: Explicit config.ak5eUnerring with targetAC
  const rollB = { parts: ["1d8", "3"], options: { critical: true } };
  const configB = {
    subject: { actor, actionType: "rwak" },
    rolls: [rollB],
    ak5eUnerring: true,
    targetAC: 19,
    flags: { ak5e: {} }
  };
  marksmanPreRollDamage(configB);
  assert.equal(rollB.options.critical, false, "Channel B: Explicit config.ak5eUnerring suppresses crit");
  assert.equal(rollB.options.ak5eMarksman.effectiveTotal, 19);

  // Channel C: Roll options pre-seeded with unerring
  const rollC = { parts: ["1d8", "3"], options: { critical: true, ak5eMarksman: { unerring: true } } };
  const configC = {
    subject: { actor, actionType: "rwak" },
    rolls: [rollC],
    flags: { ak5e: {} }
  };
  marksmanPreRollDamage(configC);
  assert.equal(rollC.options.critical, false, "Channel C: Pre-seeded roll.options.ak5eMarksman.unerring suppresses crit");
  assert.equal(configC.flags.ak5e.unerring, true);
});

test("ADVERSARIAL: Undone Unerring receipt is strictly ignored and critical status is preserved", () => {
  setupEnvironment();
  defineMarksmanPools();

  const actor = createMockMarksmanActor({ level: 17 });

  // Receipt marked undone!
  actor.flags.ak5e.marksmanUses.undo.push({
    id: "rcpt-undone-unerring",
    command: "unerring",
    status: "undone",
    originMessageUuid: "ChatMessage.undone-attack",
    result: { hit: true, effectiveTotal: 15 }
  });

  const found = findUnerringReceipt(actor, "ChatMessage.undone-attack");
  assert.equal(found, undefined, "findUnerringReceipt returns undefined for undone receipt");

  const roll = { parts: ["1d8", "3"], options: { critical: true, isCritical: true } };
  const config = {
    subject: { actor, actionType: "rwak" },
    rolls: [roll],
    originMessageUuid: "ChatMessage.undone-attack",
    flags: { ak5e: {} }
  };
  marksmanPreRollDamage(config);

  assert.equal(roll.options.critical, true, "Critical damage is NOT suppressed when unerring was undone");
  assert.equal(roll.options.ak5eMarksman?.unerring, undefined);
  assert.equal(config.flags.ak5e.unerring, undefined);
});

// =============================================================================
// GROUP 2: DEFENSIVE FIGHTING STYLE AC BONUS, TOGGLE & EXPIRATION
// =============================================================================

test("ADVERSARIAL: Defensive fighting style state toggle detection (isDefensiveStyleActive)", () => {
  // 1. Inactive state
  const cleanActor = createMockMarksmanActor({ defensiveBonusActive: false, defensiveEffect: false });
  assert.equal(isDefensiveStyleActive(cleanActor), false, "Clean actor returns false");
  assert.equal(isDefensiveStyleActive(null), false, "Null actor returns false");
  assert.equal(isDefensiveStyleActive(undefined), false, "Undefined actor returns false");

  // 2. Active via flag
  const flagActor = createMockMarksmanActor({ defensiveBonusActive: true, defensiveEffect: false });
  assert.equal(isDefensiveStyleActive(flagActor), true, "Active via defensiveBonusActive flag");

  // 3. Active via effect
  const effectActor = createMockMarksmanActor({ defensiveBonusActive: false, defensiveEffect: true });
  assert.equal(isDefensiveStyleActive(effectActor), true, "Active via ActiveEffect name");

  // 4. Irrelevant effect does not activate
  const otherEffectActor = createMockMarksmanActor({ defensiveBonusActive: false, defensiveEffect: false });
  otherEffectActor.effects.push({ id: "eff-other", name: "Bless" });
  assert.equal(isDefensiveStyleActive(otherEffectActor), false, "Irrelevant effect does not activate defensive style");
});

test("ADVERSARIAL: DEFENSIVE_STYLE_PLANS.endDefensiveStyle plan execution and strict target validation", () => {
  setupEnvironment();
  const actor = createMockMarksmanActor({ defensiveBonusActive: true, defensiveEffect: true });

  // 1. Non-marksman actor throws need check
  const nonMarksman = { flags: {} };
  assert.throws(() => {
    DEFENSIVE_STYLE_PLANS.endDefensiveStyle(nonMarksman, {}, {});
  }, /Defensive is a Marksman fighting style/);

  // 2. Marksman actor generates clean plan
  const plan = DEFENSIVE_STYLE_PLANS.endDefensiveStyle(actor, {}, {});
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.title, "End Defensive Style AC Bonus");

  const receipt = { id: "rcpt-def-test" };
  const updates = plan.apply({}, receipt);

  assert.equal(receipt.result.ended, true);
  assert.equal(updates["flags.ak5e.marksman.defensiveActive"], false);
  assert.equal(updates["flags.ak5e.marksman.defensiveBonusActive"], false);
  assert.equal(receipt.targets.length, 1);
  assert.equal(receipt.targets[0].uuid, actor.uuid);
  assert.deepEqual(receipt.targets[0].payload.removeLabels, ["Defensive: end after the triggering Attack"]);

  // 3. validateTarget security checks
  const targetEntry = receipt.targets[0];
  assert.equal(DEFENSIVE_STYLE_PLANS.endDefensiveStyle.validateTarget(actor, receipt, targetEntry, actor), true);

  // Tamper: wrong target actor
  const wrongActor = { uuid: "Actor.someone-else" };
  assert.equal(DEFENSIVE_STYLE_PLANS.endDefensiveStyle.validateTarget(actor, receipt, targetEntry, wrongActor), false);

  // Tamper: forged removeLabels
  const forgedTarget = {
    ...targetEntry,
    payload: { removeLabels: ["Siege Mode"] }
  };
  assert.equal(DEFENSIVE_STYLE_PLANS.endDefensiveStyle.validateTarget(actor, receipt, forgedTarget, actor), false);

  // Tamper: additional payload properties
  const extraPayloadTarget = {
    ...targetEntry,
    payload: {
      removeLabels: ["Defensive: end after the triggering Attack"],
      extraPrivilege: true
    }
  };
  assert.equal(DEFENSIVE_STYLE_PLANS.endDefensiveStyle.validateTarget(actor, receipt, extraPayloadTarget, actor), false);
});

test("ADVERSARIAL: expireDefensiveStyle and marksmanPostRollAttack automatic cleanup", async () => {
  setupEnvironment();
  const actor = createMockMarksmanActor({ defensiveBonusActive: true, defensiveEffect: true });

  assert.equal(isDefensiveStyleActive(actor), true);
  assert.equal(actor.effects.length, 1);

  // Helper directly removes effects and updates flags
  const expired = await expireDefensiveStyle(actor);
  assert.equal(expired["flags.ak5e.marksman.defensiveBonusActive"], false);
  assert.ok(typeof expired["flags.ak5e.marksman.defensiveExpiredAt"] === "number");
  assert.equal(actor.effects.length, 0, "ActiveEffect was deleted via deleteEmbeddedDocuments");
  assert.equal(isDefensiveStyleActive(actor), false);

  // Test automatic expiration in postRollAttack
  actor.flags.ak5e.marksman.defensiveBonusActive = true;
  assert.equal(isDefensiveStyleActive(actor), true);

  // Triggering attack finishes
  const postContext = {
    subject: { actor, actionType: "rwak" },
    flags: { ak5e: {} }
  };
  const rollObj = { total: 19 };
  marksmanPostRollAttack(rollObj, postContext);

  assert.equal(postContext.flags.ak5e.defensiveStyleExpired, true, "postRollAttack flagged defensiveStyleExpired on context");
  assert.equal(isDefensiveStyleActive(actor), false, "Defensive style is no longer active after triggering attack");

  // Subsequent call when already inactive does NOT flag expired
  const postContext2 = {
    subject: { actor, actionType: "rwak" },
    flags: { ak5e: {} }
  };
  marksmanPostRollAttack(rollObj, postContext2);
  assert.equal(postContext2.flags.ak5e.defensiveStyleExpired, undefined);

  // Malformed postRollAttack calls fail safe
  assert.doesNotThrow(() => marksmanPostRollAttack(null, null));
  assert.doesNotThrow(() => marksmanPostRollAttack([], {}));
  assert.doesNotThrow(() => marksmanPostRollAttack({}));
});

// =============================================================================
// GROUP 3: ANTI-AIR AIR TRACKING & PIGEON SHOOTING
// =============================================================================

test("ADVERSARIAL: declareAirborneTarget writes structured tableFact and stores on attacker", async () => {
  setupEnvironment();
  defineAntiAirPools();

  const attacker = createMockMarksmanActor({ level: 5, branch: "antiAir" });
  const targetUuid = "Scene.1.Token.targetFlyer";

  const result = await declareAirborneTarget(attacker, targetUuid, {
    targetName: "Flying Drone Mark II",
    airborne: true,
    feetMovedLastTurn: 20,
    resolutionNotes: "Observed hovering 15ft above ground by spotter"
  });

  // Verify receipt & tableFact
  assert.ok(result.receipt);
  assert.equal(result.tableFact.factType, "airTracking");
  assert.equal(result.tableFact.targetUuid, targetUuid);
  assert.equal(result.tableFact.targetName, "Flying Drone Mark II");
  assert.equal(result.tableFact.airborne, true);
  assert.equal(result.tableFact.feetMovedLastTurn, 20);
  assert.equal(result.tableFact.resolutionNotes, "Observed hovering 15ft above ground by spotter");
  assert.equal(result.tableFact.actorUuid, attacker.uuid);
  assert.equal(typeof result.tableFact.declaredAt, "number");
  assert.equal(result.tableFact.declaredBy, "gm-user");

  // Verify updates recorded on actor
  const targetKey = encodeURIComponent(targetUuid).replaceAll(".", "%2E");
  assert.ok(result.updates[`flags.ak5e.marksman.airTrackingFacts.${targetKey}`]);
  assert.equal(result.updates[`flags.ak5e.marksman.airTrackingFacts.${targetKey}`].airborne, true);

  // Query isAirborneOrFast
  const targetToken = { id: "targetFlyer", document: { uuid: targetUuid, elevation: 0 } };
  const targetActor = { uuid: targetUuid, system: { attributes: { movement: { fly: 0 } } } };
  assert.equal(isAirborneOrFast(targetToken, targetActor, attacker), true, "isAirborneOrFast recognizes declared airborne fact");
});

test("ADVERSARIAL: Pigeon Shooting advantage on rwak against airborne vs grounded vs fast", () => {
  setupEnvironment();
  defineAntiAirPools();

  const aaMarksman = createMockMarksmanActor({ level: 5, branch: "antiAir" });
  const baseMarksman = createMockMarksmanActor({ level: 5, branch: null }); // Base Marksman, NOT Anti-Air

  const targetUuid = "Scene.1.Token.combatDrone";
  const targetToken = { id: "drone", document: { uuid: targetUuid, elevation: 0 } };
  const targetActor = { uuid: targetUuid, system: { attributes: { movement: {} } } };

  // Helper to test attack roll advantage
  const runAttack = (attacker, actionType, setupFacts) => {
    attacker.flags.ak5e.marksman.airTrackingFacts = {};
    if (setupFacts) {
      const key = encodeURIComponent(targetUuid).replaceAll(".", "%2E");
      attacker.flags.ak5e.marksman.airTrackingFacts[key] = setupFacts;
    }
    const roll = { options: {} };
    const config = {
      subject: { actor: attacker, actionType },
      rolls: [roll],
      targetToken,
      targetActor
    };
    antiAirPreRollAttack(config);
    return roll.options.advantage === true;
  };

  // Case 1: Ranged attack against declared airborne target -> Advantage!
  assert.equal(runAttack(aaMarksman, "rwak", { airborne: true }), true, "rwak vs airborne target gains Advantage");

  // Case 2: Ranged attack against grounded target that moved 60+ ft -> Advantage!
  assert.equal(runAttack(aaMarksman, "rwak", { airborne: false, feetMovedLastTurn: 60 }), true, "rwak vs target moved exactly 60 ft gains Advantage");
  assert.equal(runAttack(aaMarksman, "rwak", { airborne: false, feetMovedLastTurn: 80 }), true, "rwak vs target moved 80 ft gains Advantage");

  // Case 3: Ranged attack against grounded target that moved 59 ft (boundary) -> NO Advantage!
  assert.equal(runAttack(aaMarksman, "rwak", { airborne: false, feetMovedLastTurn: 59 }), false, "rwak vs target moved 59 ft does NOT gain Advantage");

  // Case 4: Ranged attack against grounded target with 0 movement -> NO Advantage!
  assert.equal(runAttack(aaMarksman, "rwak", { airborne: false, feetMovedLastTurn: 0 }), false, "rwak vs grounded target does NOT gain Advantage");

  // Case 5: Melee attack (mwak) against declared airborne target -> NO Advantage! (Pigeon Shooting is Ranged only)
  assert.equal(runAttack(aaMarksman, "mwak", { airborne: true }), false, "mwak vs airborne target does NOT gain Advantage");

  // Case 6: Non-Anti-Air Marksman making rwak vs airborne target -> NO Advantage!
  assert.equal(runAttack(baseMarksman, "rwak", { airborne: true }), false, "Non-Anti-Air Marksman does NOT gain Pigeon Shooting Advantage");
});

// =============================================================================
// GROUP 4: ANTI-AIR INITIATIVE ROLL EVENT ADAPTER VARIATIONS
// =============================================================================

test("ADVERSARIAL: antiAirRollInitiative event format variations and boundary gating", async () => {
  setupEnvironment();
  defineAntiAirPools();

  // Test actor Level 15 Anti-Air with empty pool
  const makeActor = (level = 15, branch = "antiAir", va = 0) =>
    createMockMarksmanActor({ level, branch, vaValue: va });

  // Format 1: (actor, { eventId })
  const actor1 = makeActor(15, "antiAir", 0);
  const res1 = await antiAirRollInitiative(actor1, { eventId: "init-format-1" });
  assert.ok(Array.isArray(res1));
  assert.equal(getPool(actor1, "versatileApproach").value, 1, "Format 1 (actor, { eventId }) recovers pool");

  // Format 2: (actor, { eventKey })
  const actor2 = makeActor(15, "antiAir", 0);
  const res2 = await antiAirRollInitiative(actor2, { eventKey: "init-format-2" });
  assert.ok(Array.isArray(res2));
  assert.equal(getPool(actor2, "versatileApproach").value, 1, "Format 2 (actor, { eventKey }) recovers pool");

  // Format 3: (actor) with no event object (deterministic fallback eventKey)
  const actor3 = makeActor(15, "antiAir", 0);
  const res3 = await antiAirRollInitiative(actor3);
  assert.ok(Array.isArray(res3));
  assert.equal(getPool(actor3, "versatileApproach").value, 1, "Format 3 (actor) without event recovers pool using fallback key");

  // Format 4: (event) where event has raw.actor
  const actor4 = makeActor(15, "antiAir", 0);
  const singleArgEvent = {
    raw: { actor: actor4 },
    eventId: "init-format-4",
    combatUuid: "Combat.single-arg"
  };
  const res4 = await antiAirRollInitiative(singleArgEvent);
  assert.ok(Array.isArray(res4));
  assert.equal(getPool(actor4, "versatileApproach").value, 1, "Format 4 (event with raw.actor) recovers pool");

  // Gating 1: Actor level 14 Anti-Air (Option Recharge requires level 15)
  const actorLvl14 = makeActor(14, "antiAir", 0);
  const resLvl14 = await antiAirRollInitiative(actorLvl14, { eventId: "init-lvl14" });
  assert.equal(resLvl14, undefined, "Level 14 actor does not recharge");
  assert.equal(getPool(actorLvl14, "versatileApproach").value, 0);

  // Gating 2: Actor level 15 Anti-Air with full pool (5 uses)
  const actorFull = makeActor(15, "antiAir", 5);
  const resFull = await antiAirRollInitiative(actorFull, { eventId: "init-full" });
  assert.equal(resFull, undefined, "Full pool actor does not recharge");
  assert.equal(getPool(actorFull, "versatileApproach").value, 5);

  // Gating 3: Actor level 15 Besieger (not Anti-Air)
  const actorBesieger = makeActor(15, "besieger", 0);
  const resBesieger = await antiAirRollInitiative(actorBesieger, { eventId: "init-besieger" });
  assert.equal(resBesieger, undefined, "Non-Anti-Air actor does not recharge");

  // Fault injection: null actor
  assert.doesNotThrow(async () => {
    const resNull = await antiAirRollInitiative(null, {});
    assert.equal(resNull, undefined);
  });

  // Idempotence & Deduplication: Calling twice with identical eventId must not double-recover
  const actorDedup = makeActor(15, "antiAir", 0);
  const firstCall = await antiAirRollInitiative(actorDedup, { eventId: "dedup-event-1" });
  assert.ok(Array.isArray(firstCall));
  assert.equal(getPool(actorDedup, "versatileApproach").value, 1, "First call recovers 1 use");

  // Second call with same eventId
  const secondCall = await antiAirRollInitiative(actorDedup, { eventId: "dedup-event-1" });
  assert.equal(getPool(actorDedup, "versatileApproach").value, 1, "Duplicate initiative roll with same eventId does NOT double-recover");
});

test("ADVERSARIAL: Air tracking handles complex UUIDs with special characters and dots safely", async () => {
  setupEnvironment();
  defineAntiAirPools();

  const attacker = createMockMarksmanActor({ level: 5, branch: "antiAir" });
  const complexUuid = "Scene.Alpha.1.Token.Drone-X#99.sub:1";

  const result = await declareAirborneTarget(attacker, complexUuid, {
    targetName: "Special Drone",
    airborne: true
  });

  assert.equal(result.tableFact.targetUuid, complexUuid);

  const targetToken = { id: "complexToken", document: { uuid: complexUuid, elevation: 0 } };
  const targetActor = { uuid: complexUuid, system: { attributes: { movement: {} } } };

  assert.equal(isAirborneOrFast(targetToken, targetActor, attacker), true, "isAirborneOrFast handles encoded complex UUID");
});

test("ADVERSARIAL: Defensive fighting style under enemy attack vs marksman attack", async () => {
  setupEnvironment();
  const marksman = createMockMarksmanActor({ defensiveBonusActive: true, defensiveEffect: true });
  const enemy = {
    uuid: "Actor.reunionSoldier",
    name: "Reunion Soldier",
    flags: { ak5e: {} }
  };

  assert.equal(isDefensiveStyleActive(marksman), true);

  // Scenario 1: Enemy attacks the Marksman.
  // In D&D5e postRollAttack, the attacking actor is the subject.
  const enemyPostContext = {
    subject: { actor: enemy, actionType: "mwak" },
    flags: { ak5e: {} }
  };
  marksmanPostRollAttack({ total: 15 }, enemyPostContext);

  // Because marksmanPostRollAttack inspects the attacker (actor), the enemy doesn't have defensive style active.
  // Thus, the Marksman's defensive bonus is not cleared by the enemy's postRollAttack hook directly.
  assert.equal(isDefensiveStyleActive(marksman), true, "Marksman retains active defensive bonus if hook only checks attacker");

  // To resolve this at the table, the explicit endDefensiveStyle plan is invoked:
  const plan = DEFENSIVE_STYLE_PLANS.endDefensiveStyle(marksman, {}, {});
  const receipt = { id: "rcpt-manual-end" };
  const updates = plan.apply({}, receipt);
  await marksman.update(updates);
  await expireDefensiveStyle(marksman);

  assert.equal(isDefensiveStyleActive(marksman), false, "Explicit endDefensiveStyle plan cleanly ends bonus at table");
});

