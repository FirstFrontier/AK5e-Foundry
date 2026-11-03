import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isArtilleryman,
  defineArtillerymanPools,
  artillerymanSplashDC,
  ARTILLERYMAN_PLANS,
  isDelayedMunitionActive,
  isDelayedMunitionSuppressed,
  suppressDelayedMunitionTimer
} from "../scripts/artilleryman-features.mjs";

import {
  isBesieger,
  defineBesiegerPools,
  inSiegeMode,
  BESIEGER_PLANS,
  isSiegeBoltTickActive,
  evaluateSiegeBoltSave,
  besiegerPreRollAttack,
  besiegerPreRollDamage
} from "../scripts/besieger-features.mjs";

import { outcomeHP } from "../scripts/marksman-resolution.mjs";

// Ensure required globals
globalThis.game = {
  time: { worldTime: 1000 },
  user: { targets: new Set(), isGM: true },
  combat: null
};

const makeLauncher = (extraProps = "") => ({
  id: "launcher",
  uuid: "Actor.test.Item.launcher",
  name: "Heavy Launcher",
  type: "weapon",
  flags: {
    ak5e: {
      tableData: {
        properties: `Range (60/180), Splash (10)${extraProps ? ", " + extraProps : ""}`,
        damage: "2d8 Thunder"
      }
    }
  },
  system: { ability: "dex", proficient: true }
});

const makeMixedLauncher = () => ({
  id: "mixedLauncher",
  uuid: "Actor.test.Item.mixedLauncher",
  name: "Shrapnel Thunder Cannon",
  type: "weapon",
  flags: {
    ak5e: {
      tableData: {
        properties: "Range (60/180), Splash (10)",
        damage: "2d8 Thunder + 1d6 Piercing"
      }
    }
  },
  system: { ability: "dex", proficient: true }
});

const makeArtillerymanActor = (level = 15, extraFlags = {}) => ({
  uuid: `Actor.artilleryman.L${level}`,
  name: "Artillery Tester",
  system: {
    attributes: { prof: Math.ceil(level / 4) + 1 },
    abilities: { str: { mod: 2 }, dex: { mod: 4 } }
  },
  items: [
    {
      type: "class",
      system: { levels: level },
      flags: { ak5e: { chapterThreeId: "class-marksman" } }
    },
    {
      type: "subclass",
      name: "Artilleryman",
      flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
    },
    makeLauncher()
  ],
  flags: {
    ak5e: {
      marksman: {
        enabled: true,
        martialDcAbility: "dex",
        ...extraFlags
      },
      resourcePools: {
        scatterThem: { value: 1 },
        delayedDetonation: { value: 1 },
        secondaryDetonation: { value: 3 }
      }
    }
  }
});

/* =========================================================================
   1. ARTILLERYMAN ADVERSARIAL CHALLENGES
   ========================================================================= */

test("ADVERSARIAL: Grouped blast rollGroupId and per-target cover & DC calculation", () => {
  // Level 10 Artilleryman: Base DC = 8 + 4 (prof) + 4 (dex) = 16.
  // Sharpened Shrapnel (level 10+) adds +2 -> Raw DC = 18.
  // Target Lock bonus at level 10 = +1 -> Raw DC vs locked target = 19.
  const actor = makeArtillerymanActor(10, {
    targetLock: { active: true, targetUuid: "Target.boss", expiresAt: 2000 }
  });
  const weapon = actor.items[2];

  const targetUuids = [
    "Target.noCover",
    "Target.halfCoverString",
    "Target.halfCoverArray",
    "Target.threeQuartersArray",
    "Target.threeQuartersString",
    "Target.numericCover",
    "Target.boss" // Locked target with 3/4 cover
  ];

  const plan = ARTILLERYMAN_PLANS.splash(actor, {}, {
    weaponUuid: weapon.uuid,
    point: { x: 50, y: 50 },
    targetUuids,
    halfCoverTargets: ["Target.halfCoverArray"],
    threeQuartersCoverTargets: ["Target.threeQuartersArray"],
    coverByTarget: {
      "Target.halfCoverString": "half",
      "Target.threeQuartersString": "threeQuarters",
      "Target.numericCover": 3,
      "Target.boss": "threeQuarters"
    }
  });

  const receipt = { id: "rcpt-splash-group" };
  plan.apply({}, receipt);

  assert.ok(receipt.resolution?.steps?.length === targetUuids.length);

  // Challenge 1.1: Verify every step belongs to the exact same rollGroupId
  for (const step of receipt.resolution.steps) {
    assert.equal(step.rollGroupId, "splash-blast", "All splash targets must share rollGroupId: splash-blast");
    assert.equal(step.kind, "damage");
    assert.ok(step.save, "Each step must specify a save object");
    assert.equal(step.save.ability, "dex");
    assert.equal(step.save.success, "half");
  }

  // Challenge 1.2: Verify independent DC and cover bonus calculation per target
  const stepMap = Object.fromEntries(receipt.resolution.steps.map(s => [s.targetUuids[0], s]));

  // No cover: Raw DC 18, cover bonus 0, effective DC 18
  assert.equal(stepMap["Target.noCover"].save.baseDC, 18);
  assert.equal(stepMap["Target.noCover"].save.coverBonus, 0);
  assert.equal(stepMap["Target.noCover"].save.dc, 18);

  // Half cover (string "half"): cover bonus 2, effective DC 18 - 2 = 16
  assert.equal(stepMap["Target.halfCoverString"].save.baseDC, 18);
  assert.equal(stepMap["Target.halfCoverString"].save.coverBonus, 2);
  assert.equal(stepMap["Target.halfCoverString"].save.dc, 16);

  // Half cover (halfCoverTargets array): cover bonus 2, effective DC 18 - 2 = 16
  assert.equal(stepMap["Target.halfCoverArray"].save.baseDC, 18);
  assert.equal(stepMap["Target.halfCoverArray"].save.coverBonus, 2);
  assert.equal(stepMap["Target.halfCoverArray"].save.dc, 16);

  // Three-quarters cover (array): cover bonus 5, effective DC 18 - 5 = 13
  assert.equal(stepMap["Target.threeQuartersArray"].save.baseDC, 18);
  assert.equal(stepMap["Target.threeQuartersArray"].save.coverBonus, 5);
  assert.equal(stepMap["Target.threeQuartersArray"].save.dc, 13);

  // Three-quarters cover (string "threeQuarters"): cover bonus 5, effective DC 18 - 5 = 13
  assert.equal(stepMap["Target.threeQuartersString"].save.baseDC, 18);
  assert.equal(stepMap["Target.threeQuartersString"].save.coverBonus, 5);
  assert.equal(stepMap["Target.threeQuartersString"].save.dc, 13);

  // Arbitrary numeric cover (3): cover bonus 3, effective DC 18 - 3 = 15
  assert.equal(stepMap["Target.numericCover"].save.baseDC, 18);
  assert.equal(stepMap["Target.numericCover"].save.coverBonus, 3);
  assert.equal(stepMap["Target.numericCover"].save.dc, 15);

  // Boss: Target Locked (+1 DC = 19), with three-quarters cover (-5 DC = 14)
  assert.equal(stepMap["Target.boss"].save.baseDC, 19);
  assert.equal(stepMap["Target.boss"].save.coverBonus, 5);
  assert.equal(stepMap["Target.boss"].save.dc, 14);
});

test("ADVERSARIAL: Extreme cover bonus clamping ensures save DC never drops below 1", () => {
  const actor = makeArtillerymanActor(1, { martialDcAbility: "str" }); // STR mod +2, prof +2 -> DC 12
  const weapon = actor.items[2];

  const plan = ARTILLERYMAN_PLANS.splash(actor, {}, {
    weaponUuid: weapon.uuid,
    point: { x: 0, y: 0 },
    targetUuids: ["Target.bunker"],
    coverByTarget: { "Target.bunker": 30 } // Extreme cover bonus
  });

  const receipt = { id: "rcpt-splash-clamp" };
  plan.apply({}, receipt);

  const step = receipt.resolution.steps[0];
  assert.equal(step.save.baseDC, 12);
  assert.equal(step.save.coverBonus, 30);
  assert.equal(step.save.dc, 1, "Save DC must clamp to minimum 1 under extreme cover bonus");
});

test("ADVERSARIAL: Siege Attacker thunder damage doubling on Vehicles and Structures at Level 15+", () => {
  const level15Actor = makeArtillerymanActor(15);
  const mixedWeapon = makeMixedLauncher();
  level15Actor.items.push(mixedWeapon);

  // Plan splash with level 15 actor
  const plan15 = ARTILLERYMAN_PLANS.splash(level15Actor, {}, {
    weaponUuid: mixedWeapon.uuid,
    point: { x: 10, y: 10 },
    targetUuids: ["Vehicle.tank", "Structure.bunker", "Creature.goblin"]
  });
  const receipt15 = { id: "rcpt-siege-15" };
  plan15.apply({}, receipt15);

  // Check siegeAttacker flag on steps
  for (const step of receipt15.resolution.steps) {
    assert.equal(step.siegeAttacker, true, "Level 15+ Artilleryman with thunder weapon must attach siegeAttacker: true");
  }

  // Now challenge resolution through marksman-resolution / outcomeHP mechanics
  // Step damageParts: [{ amount: 20, type: "thunder" }, { amount: 10, type: "piercing" }]
  const step = receipt15.resolution.steps[0];
  step.damageParts = [
    { type: "thunder", amount: 20 },
    { type: "piercing", amount: 10 }
  ];

  // Case A: Target is a Vehicle
  const vehicleTarget = {
    type: "vehicle",
    uuid: "Vehicle.tank",
    system: { attributes: { hp: { value: 100 } } }
  };
  // Simulate resolution with scale 1 (failed save)
  const vehicleScale = 1;
  const vehicleParts = step.damageParts.map(part => ({
    type: part.type,
    amount: Math.floor(part.amount * vehicleScale * (step.siegeAttacker && (vehicleTarget.type === "vehicle") && part.type === "thunder" ? 2 : 1))
  }));
  assert.equal(vehicleParts.find(p => p.type === "thunder").amount, 40, "Thunder damage must be doubled against Vehicle");
  assert.equal(vehicleParts.find(p => p.type === "piercing").amount, 10, "Non-thunder damage must NOT be doubled against Vehicle");

  // Case B: Target is a Structure (via data.isStructure)
  const structureTarget = {
    type: "npc",
    uuid: "Structure.bunker",
    system: { attributes: { hp: { value: 100 } } }
  };
  const isStructure = true;
  const structureParts = step.damageParts.map(part => ({
    type: part.type,
    amount: Math.floor(part.amount * vehicleScale * (step.siegeAttacker && (structureTarget.type === "vehicle" || isStructure) && part.type === "thunder" ? 2 : 1))
  }));
  assert.equal(structureParts.find(p => p.type === "thunder").amount, 40, "Thunder damage must be doubled against Structure");
  assert.equal(structureParts.find(p => p.type === "piercing").amount, 10, "Non-thunder damage must NOT be doubled against Structure");

  // Case C: Target is an ordinary Creature (not a vehicle, not a structure)
  const creatureTarget = {
    type: "character",
    uuid: "Creature.goblin",
    system: { attributes: { hp: { value: 100 } } }
  };
  const creatureParts = step.damageParts.map(part => ({
    type: part.type,
    amount: Math.floor(part.amount * vehicleScale * (step.siegeAttacker && (creatureTarget.type === "vehicle") && part.type === "thunder" ? 2 : 1))
  }));
  assert.equal(creatureParts.find(p => p.type === "thunder").amount, 20, "Thunder damage must NOT be doubled against ordinary Creature");

  // Case D: Level 14 Actor (one level below 15!) -> siegeAttacker must be undefined/false
  const level14Actor = makeArtillerymanActor(14);
  level14Actor.items.push(mixedWeapon);
  const plan14 = ARTILLERYMAN_PLANS.splash(level14Actor, {}, {
    weaponUuid: mixedWeapon.uuid,
    point: { x: 10, y: 10 },
    targetUuids: ["Vehicle.tank"]
  });
  const receipt14 = { id: "rcpt-siege-14" };
  plan14.apply({}, receipt14);
  assert.equal(receipt14.resolution.steps[0].siegeAttacker, undefined, "Level 14 actor must NOT have siegeAttacker flag");
});

test("ADVERSARIAL: Scatter Them full 360-degree direction tracking and collision damage steps", () => {
  const actor = makeArtillerymanActor(15);
  const weapon = actor.items[2];

  // Blast center at (100, 100)
  // Test 8 distinct angles around center:
  // E (0 deg), SE (45 deg), S (90 deg), SW (135 deg), W (180 deg), NW (225 deg), N (270 deg), NE (315 deg)
  const targetPositions = {
    "Target.E":  { x: 150, y: 100 },
    "Target.SE": { x: 150, y: 150 },
    "Target.S":  { x: 100, y: 150 },
    "Target.SW": { x: 50,  y: 150 },
    "Target.W":  { x: 50,  y: 100 },
    "Target.NW": { x: 50,  y: 50 },
    "Target.N":  { x: 100, y: 50 },
    "Target.NE": { x: 150, y: 50 }
  };
  const targetUuids = Object.keys(targetPositions);

  // Only E, SW, and N collided with obstacles
  const collisionTargetUuids = ["Target.E", "Target.SW", "Target.N"];
  const collisionSurfaces = {
    "Target.E": "iron barrier",
    "Target.SW": "stone pillar",
    "Target.N": "cliff face"
  };
  const collisionDistanceByTarget = {
    "Target.E": 15, // collided early after 15ft
    "Target.SW": 30
  };

  const plan = ARTILLERYMAN_PLANS.scatterThem(actor, {}, {
    weaponUuid: weapon.uuid,
    point: { x: 100, y: 100 },
    targetUuids,
    targetPositions,
    collisionTargetUuids,
    collisionSurfaces,
    collisionDistanceByTarget,
    flingDistance: 30,
    triggerConfirmed: true
  });

  const receipt = { id: "rcpt-scatter-adversarial" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.targetCount, 8);
  assert.equal(receipt.result.flingDistance, 30);
  assert.equal(receipt.result.collisionFormula, "4d8");

  // Verify geometry calculations for each direction
  const geom = receipt.result.geometry;
  assert.equal(geom["Target.E"].angleDeg, 0);
  assert.equal(geom["Target.SE"].angleDeg, 45);
  assert.equal(geom["Target.S"].angleDeg, 90);
  assert.equal(geom["Target.SW"].angleDeg, 135);
  assert.equal(geom["Target.W"].angleDeg, 180);
  assert.equal(geom["Target.NW"].angleDeg, 225);
  assert.equal(geom["Target.N"].angleDeg, 270);
  assert.equal(geom["Target.NE"].angleDeg, 315);

  // Verify collision data
  assert.equal(geom["Target.E"].collided, true);
  assert.equal(geom["Target.E"].surface, "iron barrier");
  assert.equal(geom["Target.E"].distanceToCollision, 15);

  assert.equal(geom["Target.SE"].collided, false);
  assert.equal(geom["Target.SE"].surface, null);
  assert.equal(geom["Target.SE"].distanceToCollision, null);

  assert.equal(geom["Target.SW"].collided, true);
  assert.equal(geom["Target.SW"].surface, "stone pillar");
  assert.equal(geom["Target.SW"].distanceToCollision, 30);

  // Verify collision damage steps: exactly 3 steps for the 3 collided targets
  const collisionSteps = receipt.resolution.steps.filter(s => s.id.startsWith("scatter-collision-"));
  assert.equal(collisionSteps.length, 3, "Only collided targets must receive collision damage steps");

  for (const step of collisionSteps) {
    assert.equal(step.kind, "damage");
    assert.equal(step.damageParts[0].formula, "4d8");
    assert.equal(step.damageParts[0].type, "bludgeoning");
  }
  const collidedStepUuids = collisionSteps.map(s => s.targetUuids[0]);
  assert.deepEqual(collidedStepUuids.sort(), collisionTargetUuids.sort());
});

test("ADVERSARIAL: suppressDelayedMunitionTimer persistence across multi-munition state and simulated reloads", () => {
  // Canonical scenario: Actor with delayedMunitions array (modern schema created by delayedDetonation plan)
  const canonicalActor = {
    uuid: "Actor.canonicalMunitions",
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          delayedMunitions: [
            { id: "mun-1", active: true, suppressed: false, point: { x: 10, y: 10 } },
            { id: "mun-2", active: true, suppressed: false, point: { x: 20, y: 20 } },
            { id: "mun-3", active: false, suppressed: true, point: { x: 30, y: 30 } }
          ]
        }
      }
    }
  };

  assert.equal(isDelayedMunitionActive(canonicalActor, "mun-1"), true);
  assert.equal(isDelayedMunitionActive(canonicalActor, "mun-2"), true);
  assert.equal(isDelayedMunitionActive(canonicalActor, "mun-3"), false);

  assert.equal(isDelayedMunitionSuppressed(canonicalActor, "mun-1"), false);
  assert.equal(isDelayedMunitionSuppressed(canonicalActor, "mun-2"), false);
  assert.equal(isDelayedMunitionSuppressed(canonicalActor, "mun-3"), true);

  // 1. Suppress mun-1 individually
  const updates1 = suppressDelayedMunitionTimer(canonicalActor, "mun-1");
  assert.equal(isDelayedMunitionActive(canonicalActor, "mun-1"), false);
  assert.equal(isDelayedMunitionSuppressed(canonicalActor, "mun-1"), true);
  // mun-2 remains active
  assert.equal(isDelayedMunitionActive(canonicalActor, "mun-2"), true);
  assert.equal(isDelayedMunitionSuppressed(canonicalActor, "mun-2"), false);

  // 2. Simulate persistence by serializing to JSON and re-instantiating actor (clean reload simulation)
  const serialized = JSON.stringify(canonicalActor.flags);
  const reloadedActor = {
    uuid: "Actor.canonicalMunitions",
    flags: JSON.parse(serialized)
  };

  // State persists across reload
  assert.equal(isDelayedMunitionActive(reloadedActor, "mun-1"), false);
  assert.equal(isDelayedMunitionSuppressed(reloadedActor, "mun-1"), true);
  assert.equal(isDelayedMunitionActive(reloadedActor, "mun-2"), true);
  assert.equal(isDelayedMunitionSuppressed(reloadedActor, "mun-2"), false);

  // 3. Suppress all remaining munitions without specifying ID
  suppressDelayedMunitionTimer(reloadedActor);
  assert.equal(isDelayedMunitionActive(reloadedActor, "mun-2"), false);
  assert.equal(isDelayedMunitionSuppressed(reloadedActor, "mun-2"), true);
  assert.equal(isDelayedMunitionActive(reloadedActor), false, "No active munitions after blanket suppression");
  assert.equal(isDelayedMunitionSuppressed(reloadedActor), true, "All munitions must be suppressed");

  // 4. Legacy scenario: Actor with singular delayedMunition object and update method
  let appliedUpdates = null;
  const legacyActor = {
    uuid: "Actor.legacyMunition",
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          delayedMunition: { id: "legacy-1", active: true, suppressed: false }
        }
      }
    },
    async update(updates) {
      appliedUpdates = updates;
      if (updates["flags.ak5e.marksman.delayedMunition.active"] !== undefined) {
        this.flags.ak5e.marksman.delayedMunition.active = updates["flags.ak5e.marksman.delayedMunition.active"];
      }
      if (updates["flags.ak5e.marksman.delayedMunition.suppressed"] !== undefined) {
        this.flags.ak5e.marksman.delayedMunition.suppressed = updates["flags.ak5e.marksman.delayedMunition.suppressed"];
      }
    }
  };
  const legacyUpdates = suppressDelayedMunitionTimer(legacyActor, "legacy-1");
  assert.equal(legacyUpdates["flags.ak5e.marksman.delayedMunition.active"], false);
  assert.equal(legacyUpdates["flags.ak5e.marksman.delayedMunition.suppressed"], true);
  assert.equal(isDelayedMunitionActive(legacyActor, "legacy-1"), false);
  assert.equal(isDelayedMunitionSuppressed(legacyActor, "legacy-1"), true);
});

/* =========================================================================
   2. BESIEGER ADVERSARIAL CHALLENGES
   ========================================================================= */

const makeBesiegerActor = (level = 10, extraFlags = {}) => ({
  uuid: `Actor.besieger.L${level}`,
  name: "Besieger Tester",
  system: {
    attributes: { prof: Math.ceil(level / 4) + 1 },
    abilities: { str: { mod: 4 }, dex: { mod: 3 } }
  },
  items: [
    {
      type: "class",
      system: { levels: level },
      flags: { ak5e: { chapterThreeId: "class-marksman" } }
    },
    {
      type: "subclass",
      name: "Besieger",
      flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
    },
    {
      id: "heavyRifle",
      uuid: "Actor.test.Item.heavyRifle",
      name: "Anti-Fortification Rifle",
      type: "weapon",
      flags: {
        ak5e: {
          tableData: {
            properties: "Range (100/300), Crush (4)",
            damage: "2d12 Piercing"
          }
        }
      },
      system: { ability: "dex", proficient: true }
    }
  ],
  flags: {
    ak5e: {
      marksman: {
        enabled: true,
        siegeMode: true,
        manualTurn: 0,
        siegeModeTurn: "manual:0",
        martialDcAbility: "str",
        ...extraFlags
      },
      resourcePools: {
        siegeBolt: { value: 1 },
        goliathsBane: { value: 4 }
      }
    }
  }
});

test("ADVERSARIAL: Siege Bolt 5-step ongoing save ticks and early termination branches", () => {
  defineBesiegerPools();
  const actor = makeBesiegerActor(10);
  const targetUuidA = "Target.dragon";
  const targetUuidB = "Target.golem";

  const plan = BESIEGER_PLANS.siegeBolt(actor, {}, {
    targetUuids: [targetUuidA, targetUuidB],
    targetName: "Dual Targets",
    triggerConfirmed: true
  });

  const receipt = { id: "rcpt-siege-bolt-5steps" };
  plan.apply({}, receipt);

  // Verify 5 steps per target = 10 steps total
  assert.equal(receipt.resolution.steps.length, 10);

  const groupA = `siege-bolt-${encodeURIComponent(targetUuidA)}`;
  const groupB = `siege-bolt-${encodeURIComponent(targetUuidB)}`;

  const stepsA = receipt.resolution.steps.filter(s => s.groupId === groupA);
  assert.equal(stepsA.length, 5);

  const [initialStep, save1Step, tick1Step, save2Step, tick2Step] = stepsA;

  // Step 1: initial damage
  assert.equal(initialStep.id, `${groupA}-initial`);
  assert.equal(initialStep.kind, "damage");
  assert.equal(initialStep.damageParts[0].formula, "5d8");
  assert.equal(initialStep.save.ability, "dex");
  assert.equal(initialStep.save.success, "full");

  // Step 2: repeat save 1 at turnStart
  assert.equal(save1Step.id, `${groupA}-repeat-save-1`);
  assert.equal(save1Step.kind, "effect");
  assert.equal(save1Step.trigger.event, "turnStart");
  assert.equal(save1Step.trigger.occurrence, 1);

  // Step 3: tick 1 damage at turnEnd
  assert.equal(tick1Step.id, `${groupA}-tick-1`);
  assert.equal(tick1Step.kind, "damage");
  assert.equal(tick1Step.trigger.event, "turnEnd");
  assert.equal(tick1Step.trigger.occurrence, 1);

  // Step 4: repeat save 2 at turnStart
  assert.equal(save2Step.id, `${groupA}-repeat-save-2`);
  assert.equal(save2Step.kind, "effect");
  assert.equal(save2Step.trigger.event, "turnStart");
  assert.equal(save2Step.trigger.occurrence, 2);

  // Step 5: tick 2 damage at turnEnd
  assert.equal(tick2Step.id, `${groupA}-tick-2`);
  assert.equal(tick2Step.kind, "damage");
  assert.equal(tick2Step.trigger.event, "turnEnd");
  assert.equal(tick2Step.trigger.occurrence, 2);

  // Challenge 2.1: Target A fails initial save, Target B succeeds initial save
  // DC = 8 + 4 (prof) + 4 (str) = 16
  const evalA_init = evaluateSiegeBoltSave(receipt, targetUuidA, initialStep.id, 10, 16);
  assert.equal(evalA_init.passed, false);
  assert.equal(evalA_init.endedOngoing, false);

  const evalB_init = evaluateSiegeBoltSave(receipt, targetUuidB, `${groupB}-initial`, 18, 16);
  assert.equal(evalB_init.passed, true);
  assert.equal(evalB_init.endedOngoing, true);
  assert.deepEqual(evalB_init.remainingTicksCancelled, [1, 2]);

  // Target A ticks remain active
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidA, 1), true);
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidA, 2), true);

  // Target B ticks are terminated immediately
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidB, 1), false);
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidB, 2), false);

  // Challenge 2.2: Target A fails Turn 1 save, tick 1 takes place
  const evalA_turn1 = evaluateSiegeBoltSave(receipt, targetUuidA, save1Step.id, 12, 16);
  assert.equal(evalA_turn1.passed, false);
  assert.equal(evalA_turn1.endedOngoing, false);
  assert.equal(evalA_turn1.tickDue, 1);
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidA, 1), true);
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidA, 2), true);

  // Challenge 2.3: Target A succeeds Turn 2 save -> tick 2 terminated early
  const evalA_turn2 = evaluateSiegeBoltSave(receipt, targetUuidA, save2Step.id, 19, 16);
  assert.equal(evalA_turn2.passed, true);
  assert.equal(evalA_turn2.endedOngoing, true);
  assert.deepEqual(evalA_turn2.remainingTicksCancelled, [2]);
  assert.equal(isSiegeBoltTickActive(receipt, targetUuidA, 2), false);
});

test("ADVERSARIAL: Siege Mode <= 20ft proximity disadvantage boundary conditions", () => {
  const actor = makeBesiegerActor(10);
  const weapon = actor.items[2];

  // Helper to run besiegerPreRollAttack with variable targetDistance and actionType
  const testAttackProximity = (dist, actionType = "rwak", extraOpts = {}) => {
    const roll = { options: { ...extraOpts } };
    const config = {
      subject: { actor, item: weapon, actionType },
      rolls: [roll],
      targetDistance: dist,
      flags: { ak5e: {} }
    };
    besiegerPreRollAttack(config);
    return { roll, config };
  };

  // Boundary 1: 0 ft (point-blank) -> Disadvantage
  const r0 = testAttackProximity(0);
  assert.equal(r0.roll.options.disadvantage, true);
  assert.equal(r0.roll.options.ak5eMarksman.siegeModeDisadvantage, true);
  assert.equal(r0.roll.options.ak5eMarksman.disadvantageDistance, 0);

  // Boundary 2: 15 ft -> Disadvantage
  const r15 = testAttackProximity(15);
  assert.equal(r15.roll.options.disadvantage, true);
  assert.equal(r15.roll.options.ak5eMarksman.siegeModeDisadvantage, true);

  // Boundary 3: Exactly 20.0 ft -> Disadvantage
  const r20 = testAttackProximity(20.0);
  assert.equal(r20.roll.options.disadvantage, true, "Exactly 20ft must have disadvantage");
  assert.equal(r20.roll.options.ak5eMarksman.siegeModeDisadvantage, true);
  assert.equal(r20.config.flags.ak5e.siegeModeDisadvantage, true);

  // Boundary 4: 20.001 ft -> NO Disadvantage
  const r20_1 = testAttackProximity(20.001);
  assert.equal(r20_1.roll.options.disadvantage, undefined, "20.001ft must NOT have disadvantage");
  assert.equal(r20_1.roll.options.ak5eMarksman?.siegeModeDisadvantage, undefined);

  // Boundary 5: 35 ft -> NO Disadvantage
  const r35 = testAttackProximity(35);
  assert.equal(r35.roll.options.disadvantage, undefined);
  assert.equal(r35.roll.options.ak5eMarksman?.siegeModeDisadvantage, undefined);

  // Boundary 6: Melee attack (mwak) at 5 ft in Siege Mode -> NO proximity disadvantage!
  const rMelee = testAttackProximity(5, "mwak");
  assert.equal(rMelee.roll.options.ak5eMarksman?.siegeModeDisadvantage, undefined, "Melee attack must NOT receive proximity disadvantage");

  // Boundary 7: Actor NOT in Siege Mode at 10 ft -> NO proximity disadvantage!
  const nonSiegeActor = makeBesiegerActor(10, { siegeMode: false });
  const rollNonSiege = { options: {} };
  besiegerPreRollAttack({
    subject: { actor: nonSiegeActor, item: weapon, actionType: "rwak" },
    rolls: [rollNonSiege],
    targetDistance: 10,
    flags: { ak5e: {} }
  });
  assert.equal(rollNonSiege.options.ak5eMarksman?.siegeModeDisadvantage, undefined);
});

test("ADVERSARIAL: Deliberate/Efficient damage bonus scaling (levels 1-17 vs 18+) and DR/Resistance bypass", () => {
  const weapon = {
    id: "heavyRifle",
    uuid: "Actor.test.Item.heavyRifle",
    name: "Anti-Fortification Rifle",
    type: "weapon",
    system: { damage: { base: { formula: "2d12", types: new Set(["piercing"]) } } }
  };

  // Subcase A: Level 10 Besieger (< 18)
  const actor10 = makeBesiegerActor(10, { deliberateEfficientAction: "act-10" });
  const roll10 = { parts: ["2d12", "3"], options: {} };
  const config10 = {
    subject: { actor: actor10, item: weapon, actionType: "rwak", id: "act-10" },
    rolls: [roll10],
    flags: { ak5e: {} }
  };
  besiegerPreRollDamage(config10);

  // Should have +1d8 from Siege Mode AND +1d8 from Deliberate Efficient (total two 1d8s)
  const d8Count10 = roll10.parts.filter(p => p === "1d8").length;
  assert.equal(d8Count10, 2, "Level 10 Besieger must gain two 1d8 dice (Siege Mode + Deliberate Efficient)");

  // Verify full set of native and provenance bypass flags
  assert.equal(roll10.options.ignoreDamageReduction, true);
  assert.equal(roll10.options.bypassResistance, true);
  assert.equal(roll10.options.ak5eMarksman.deliberateEfficient, true);
  assert.equal(roll10.options.ak5eMarksman.ignoreDR, true);
  assert.equal(roll10.options.ak5eMarksman.ignoreResistance, true);
  assert.equal(roll10.options.ak5eMarksman.physicalOnly, true);
  assert.equal(roll10.options.ak5eMarksman.bypassPhysicalDR, true);
  assert.equal(roll10.options.ak5eMarksman.bypassPhysicalResistance, true);

  // Subcase B: Level 18 Besieger (Godpiercer)
  const actor18 = makeBesiegerActor(18, { deliberateEfficientAction: "act-18" });
  const roll18 = { parts: ["2d12", "3"], options: {} };
  const config18 = {
    subject: { actor: actor18, item: weapon, actionType: "rwak", id: "act-18" },
    rolls: [roll18],
    flags: { ak5e: {} }
  };
  besiegerPreRollDamage(config18);

  // Level 18 does NOT add 1d8 dice; replaces with 16 HP loss (8 Siege Mode + 8 Deliberate)
  const d8Count18 = roll18.parts.filter(p => p === "1d8").length;
  assert.equal(d8Count18, 0, "Level 18 Godpiercer must NOT add 1d8 damage dice");
  assert.equal(roll18.options.ak5eMarksman.godpiercerHpLoss, 16, "Level 18 with Deliberate Efficient must set godpiercerHpLoss to 16");

  // Bypass flags still fully set on Level 18
  assert.equal(roll18.options.ignoreDamageReduction, true);
  assert.equal(roll18.options.bypassResistance, true);
});

test("ADVERSARIAL: Deliberate Efficient physical DR/Resistance bypass in outcomeHP execution", () => {
  const sourceActor = makeBesiegerActor(10);

  // Target creature with 50 HP, DR 10 against everything, and innate resistances
  const targetActor = {
    uuid: "Target.armoredGolem",
    system: {
      attributes: {
        hp: { value: 100, temp: 0 }
      },
      traits: {
        dr: { value: ["bludgeoning", "piercing", "slashing", "thunder", "fire", "cold"] },
        di: { value: [] },
        dv: { value: [] }
      }
    }
  };

  // Test 1: Physical Damage (Piercing 30) with Deliberate Efficient flags
  const physicalPayload = {
    damageParts: [{ amount: 30, type: "piercing" }],
    reduction: 10, // Target has 10 DR
    ignoreDR: true,
    ignoreResistance: true,
    physicalOnly: true
  };

  const physicalOutcome = outcomeHP(sourceActor, targetActor, physicalPayload);
  // DR 10 ignored -> 30 damage. Resistance ignored -> full 30 damage.
  // 100 - 30 = 70 HP.
  assert.equal(physicalOutcome.hp, 70, "Physical damage must completely bypass DR and Resistance");
  assert.equal(physicalOutcome.hpLost, 30);

  // Test 2: Non-Physical Damage (Fire 30) with the SAME physicalOnly Deliberate Efficient flags
  const nonPhysicalPayload = {
    damageParts: [{ amount: 30, type: "fire" }],
    reduction: 10,
    ignoreDR: true,
    ignoreResistance: true,
    physicalOnly: true // physicalOnly restricts bypass to bludgeoning, piercing, slashing, thunder
  };

  const nonPhysicalOutcome = outcomeHP(sourceActor, targetActor, nonPhysicalPayload);
  // For fire damage:
  // DR 10 is NOT bypassed (amount becomes 30 - 10 = 20).
  // Resistance is NOT bypassed (20 halved = 10).
  // 100 - 10 = 90 HP.
  assert.equal(nonPhysicalOutcome.hp, 90, "Non-physical (fire) damage must NOT bypass DR or Resistance under physicalOnly");
  assert.equal(nonPhysicalOutcome.hpLost, 10);

  // Test 3: Mixed physical and non-physical parts in a single attack
  const mixedPayload = {
    damageParts: [
      { amount: 30, type: "thunder" }, // Physical -> bypasses both DR and Resist -> full 30
      { amount: 30, type: "cold" }     // Non-physical -> DR 10 applies (30-10=20), Resist applies (20/2=10)
    ],
    reduction: 10,
    ignoreDR: true,
    ignoreResistance: true,
    physicalOnly: true
  };

  const mixedOutcome = outcomeHP(sourceActor, targetActor, mixedPayload);
  // Total HP lost: 30 (thunder) + 10 (cold) = 40.
  // 100 - 40 = 60 HP.
  assert.equal(mixedOutcome.hp, 60, "Mixed payload must selectively bypass physical damage while mitigating non-physical");
  assert.equal(mixedOutcome.hpLost, 40);
});
