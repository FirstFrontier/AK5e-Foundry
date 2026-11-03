import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isArtilleryman, defineArtillerymanPools, artillerymanSplashDC,
  ARTILLERYMAN_PLANS, artillerymanPreRollDamage,
  isDelayedMunitionActive, isDelayedMunitionSuppressed, suppressDelayedMunitionTimer
} from "../scripts/artilleryman-features.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
globalThis.game = { time: { worldTime: 100 }, user: { targets: new Set() } };
const generatedLauncher = () => ({ id: "grenade", uuid: "Actor.test.Item.grenade", name: "Grenade Launcher", type: "weapon",
  flags: { ak5e: { tableData: { properties: "Loading, Range (50), Splash (5)", damage: "1d8 Thunder" } } }, system: { ability: "dex" } });

test("Artilleryman identification and DC calculation", () => {
  const actor = {
    system: {
      attributes: { prof: 3 },
      abilities: { str: { mod: 1 }, dex: { mod: 4 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Artilleryman",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }, generatedLauncher()
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          martialDcAbility: "dex",
          targetLock: { active: true, targetUuid: "Token.boss", expiresAt: 160 }
        }
      }
    }
  };

  assert.equal(isArtilleryman(actor), true);

  // Martial DC = 8 + 3 + 4 = 15
  // Sharpened Shrapnel (10th level) = +2 -> 17
  // Controlled Demolition vs Target Lock = +1 -> 18
  assert.equal(artillerymanSplashDC(actor), 17);
  assert.equal(artillerymanSplashDC(actor, "Token.boss"), 18);
  assert.equal(artillerymanSplashDC(actor, "Token.other"), 17);
});

test("Artilleryman pools initialize correctly", () => {
  defineArtillerymanPools();

  const actor = {
    uuid: "Actor.artilleryman1",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Artilleryman",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const del = getPool(actor, "delayedDetonation");
  assert.equal(del.max, 1);
  assert.equal(del.value, 1);

  const sec = getPool(actor, "secondaryDetonation");
  assert.equal(sec.max, 3);
  assert.equal(sec.value, 3);
});

test("Delayed Detonation deploy plan updates actor state", () => {
  const actor = {
    uuid: "Actor.artilleryman2",
    items: [
      {
        type: "class",
        system: { levels: 1 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }, generatedLauncher()
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = ARTILLERYMAN_PLANS.delayedDetonation(actor, {}, { point: { x: 150, y: 300 }, weaponUuid: "Actor.test.Item.grenade", weaponName: "Grenade Launcher", triggerConfirmed: true });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-del-1" };
  const updates = plan.apply({}, receipt);

  assert.equal(updates["flags.ak5e.marksman.delayedMunitions"][0].active, true);
  assert.deepEqual(updates["flags.ak5e.marksman.delayedMunitions"][0].point, { x: 150, y: 300 });
  assert.equal(receipt.result.munitionId, updates["flags.ak5e.marksman.delayedMunitions"][0].id);
  assert.equal(updates["flags.ak5e.marksman.delayedMunitions"][0].deploymentUseId, receipt.id);
});

test("Secondary Detonation halves damage and notes save for 0", () => {
  const actor = {
    uuid: "Actor.artilleryman3",
    system: { attributes: { prof: 2 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }, generatedLauncher()
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = ARTILLERYMAN_PLANS.secondaryDetonation(actor, {}, { originalDamage: 24, point: { x: 50, y: 50 }, weaponUuid: "Actor.test.Item.grenade", originUseId: "use-origin", triggerConfirmed: true });
  assert.ok(plan.warnings.some(warning => warning.id === "martialDC"), "this use needs an explicit Martial DC choice");

  const receipt = { id: "rcpt-sec-1" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.originalDamage, 24);
  assert.equal(receipt.result.damageReading, "freshRoll", "the reading is selected for the current use");
  assert.equal(plan.reading, "secondaryDetonationDamage");
});

test("artillerymanPreRollDamage adds Explosive Expertise dice on Splash weapon", () => {
  const actor = {
    items: [
      {
        type: "class",
        system: { levels: 7 }, // Level 7 -> 2 dice
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const weapon = {
    system: {
      properties: new Set(["splash"]),
      damage: { base: { formula: "1d8" } }
    }
  };

  const roll = { parts: ["1d8", "4"], options: { type: "thunder", types: ["thunder"] } };
  const config = {
    subject: {
      actor,
      item: weapon
    },
    rolls: [roll]
  };

  artillerymanPreRollDamage(config);

  assert.equal(roll.parts.includes("2d8"), true);
  const piercing = { parts: ["1d8", "4"], options: { type: "piercing", types: ["piercing"] } };
  const mixed = { parts: ["1d8"], options: { types: ["thunder", "piercing"] } };
  artillerymanPreRollDamage({ subject: config.subject, rolls: [piercing, mixed] });
  assert.deepEqual(piercing.parts, ["1d8", "4"], "non-Thunder damage is untouched");
  assert.deepEqual(mixed.parts, ["1d8"], "unresolved alternative types receive no premature bonus");
  assert.equal(roll.options.multiply, undefined, "recipient-specific doubling is manual");
});

test("blast plans preserve manual geometry, no chaining and timer/disarm rules", () => {
  const actor = { uuid: "Actor.blast", name: "Blast", flags: { ak5e: { marksman: { enabled: true } } },
    system: { attributes: { prof: 6 } },
    items: [{ type: "class", system: { levels: 18 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } }, generatedLauncher()] };
  assert.equal(artillerymanSplashDC(actor), null, "an unchosen Martial DC cannot become DC 2");
  const receipt = { id: "deploy" };
  const updates = ARTILLERYMAN_PLANS.delayedDetonation(actor, {}, { weaponUuid: "Actor.test.Item.grenade" }).apply({}, receipt);
  const munition = updates["flags.ak5e.marksman.delayedMunitions"][0];
  assert.equal(munition.point, null, "an absent point is never silently (0,0)");
  assert.equal(munition.detonatesAt - munition.placedAt, 600);
  actor.flags.ak5e.marksman.delayedMunitions = [munition];
  const detonate = { id: "automatic" };
  ARTILLERYMAN_PLANS.detonateMunition(actor, {}, { automatic: true }).apply({}, detonate);
  assert.equal(detonate.reaction, undefined, "automatic timer resolution costs no Reaction");
  const manual = { id: "manual" };
  ARTILLERYMAN_PLANS.detonateMunition(actor, {}, {}).apply({}, manual);
  assert.equal(manual.reaction.requested, true, "movement detonation defers Reaction to the prepared engine");
  const secondary = {};
  ARTILLERYMAN_PLANS.secondaryDetonation(actor, {}, { weaponUuid: "Actor.test.Item.grenade" }).apply({}, secondary);
  assert.equal(secondary.result.secondaryDamage, null, "unspecified damage is resolved manually, not zero");
  assert.match(secondary.summary, /cannot generate another Secondary/);
  assert.match(secondary.summary, /NO damage/i);
  assert.doesNotMatch(secondary.summary, /successful saves half/);
  assert.deepEqual(ARTILLERYMAN_PLANS.disarmMunition(actor, {}, { munitionId: munition.id }).apply({}, {})["flags.ak5e.marksman.delayedMunitions"], [{ ...munition, active: false }]);
});

test("Splash uses generated tableData properties and creates target-specific guided resolution", () => {
  const weapon = generatedLauncher();
  weapon.uuid = "Actor.generated.Item.grenade";
  weapon.system.proficient = false;
  const target = "Actor.target";
  const actor = { uuid: "Actor.artillery", name: "Artillery", system: { attributes: { prof: 4 }, abilities: { dex: { mod: 3 } } },
    items: [{ type: "class", system: { levels: 15 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } }, weapon],
    flags: { ak5e: { marksman: { enabled: true, martialDcAbility: "dex" } } } };
  const plan = ARTILLERYMAN_PLANS.splash(actor, {}, { weaponUuid: weapon.uuid, point: { x: 10, y: 20 }, targetUuids: [target], attackAction: true, enhancedPayload: true });
  const receipt = { id: "guided-splash" }; plan.apply({}, receipt);
  const step = receipt.resolution.steps[0];
  assert.equal(step.kind, "damage");
  assert.equal(step.save.ability, "dex");
  assert.equal(step.save.dc, 17); // 8 + PB4 + DEX3 + Enhanced Payload's class feature DC +2
  assert.equal(step.damageParts[0].type, "thunder");
  assert.match(step.damageParts[0].formula, /1d8 \+ 3 \+ 3d8/);
  assert.equal(step.siegeAttacker, true);
  assert.equal(step.splash.noAttackRoll, true);
  assert.equal(step.splash.radiusFt, 10);
  assert.equal(step.save.advantage, true, "nonproficient Splash weapon grants save Advantage as a step property");
});

test("Splash uses this use's Martial DC, retains a null-DC save, and supports a manual radius", () => {
  const weapon = generatedLauncher(); weapon.uuid = "Actor.dc.Item.launcher"; weapon.system.proficient = false;
  const actor = { uuid: "Actor.dc", name: "DC", system: { attributes: { prof: 3 }, abilities: { str: { mod: 1 }, dex: { mod: 4 } } },
    items: [{ type: "class", system: { levels: 10 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } }, weapon],
    flags: { ak5e: { marksman: { enabled: true, martialDcAbility: "dex" } } } };
  const plan = ARTILLERYMAN_PLANS.splashAttack(actor, {}, { weaponUuid: weapon.uuid, martialDcAbility: "str", manualDC: 13,
    point: { x: 0, y: 0 }, targetUuids: ["Actor.target"] });
  const receipt = { id: "splash-str" }; plan.apply({}, receipt);
  assert.equal(receipt.resolution.steps[0].save.dc, 15, "manual base DC is combined with level-10 Splash DC +2");
  assert.equal(receipt.resolution.steps[0].save.advantage, true);

  const noDCActor = { ...actor, flags: { ak5e: { marksman: { enabled: true } } } };
  const noDC = ARTILLERYMAN_PLANS.splash(noDCActor, {}, { weaponUuid: weapon.uuid, point: { x: 0, y: 0 }, targetUuids: ["Actor.target"] });
  const noDCReceipt = { id: "splash-no-dc" }; noDC.apply({}, noDCReceipt);
  assert.equal(noDCReceipt.resolution.steps[0].save.dc, null, "missing DC stays a save step and cannot silently become an attack without a save");
  assert.equal(noDCReceipt.resolution.steps[0].save.advantage, true);

  const noProperty = { ...weapon, flags: { ak5e: { tableData: { properties: "Loading, Range (50)", damage: "1d8 Thunder" } } } };
  actor.items[2] = noProperty;
  const manual = ARTILLERYMAN_PLANS.splash(actor, {}, { weaponUuid: noProperty.uuid, manualSplashRadius: 7, manualDC: 13,
    point: { x: 0, y: 0 }, targetUuids: ["Actor.target"] });
  const manualReceipt = { id: "splash-radius" }; manual.apply({}, manualReceipt);
  assert.equal(manualReceipt.resolution.steps[0].splash.radiusFt, 7);
  assert.equal(manual.warnings.some(warning => warning.id === "splashProperty"), false, "the explicit manual radius resolves the missing property value");
});

test("Secondary Detonation records its originating use and selected damage reading", () => {
  const weapon = generatedLauncher();
  const actor = { uuid: "Actor.secondary", name: "Secondary", system: { attributes: { prof: 3 }, abilities: { dex: { mod: 2 } } },
    items: [{ type: "class", system: { levels: 4 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } }, weapon],
    flags: { ak5e: { marksman: { enabled: true, martialDcAbility: "dex" } } } };
  const data = { weaponUuid: weapon.uuid, targetUuids: ["Actor.t1", "Actor.t2"], originUseId: "source-splash", point: { x: 5, y: 5 },
    originalDamageByTarget: { "Actor.t1": 21, "Actor.t2": 8 }, triggerConfirmed: true };
  const plan = ARTILLERYMAN_PLANS.secondaryDetonation(actor, {}, data);
  const receipt = { id: "secondary-reading" };
  plan.apply({}, receipt, { value: "originalTotal" });
  assert.equal(receipt.result.damageReading, "originalTotal");
  assert.equal(receipt.resolution.steps.length, 2);
  assert.deepEqual(receipt.resolution.steps.map(step => step.damageParts[0].amount), [10, 4]);
  assert.equal(receipt.resolution.steps[0].save.success, "zero");
  assert.equal(receipt.resolution.steps[0].damageScale, 1, "fixed original damage is halved once");
  assert.equal(receipt.resolution.steps[0].sourceActorUuid, actor.uuid);
  assert.equal(receipt.resolution.steps[0].originUseId, "source-splash");
});

test("Grouped mixed-recipient blast tests and handling with cover and vehicle doubling", () => {
  const launcher = generatedLauncher();
  const actor = {
    uuid: "Actor.artilleryGroup",
    name: "Artillery Group",
    system: { attributes: { prof: 3 }, abilities: { dex: { mod: 4 } } },
    items: [
      { type: "class", system: { levels: 15 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } },
      launcher
    ],
    flags: { ak5e: { marksman: { enabled: true, martialDcAbility: "dex" } } }
  };

  // Base DC = 8 + 3 + 4 = 15
  // Three targets:
  // t1: no cover (DC 15)
  // t2: half cover (+2 to save / DC 13)
  // t3: three quarters cover (+5 to save / DC 10)
  const plan = ARTILLERYMAN_PLANS.splash(actor, {}, {
    weaponUuid: launcher.uuid,
    point: { x: 20, y: 20 },
    targetUuids: ["Actor.t1", "Actor.t2", "Actor.t3"],
    coverByTarget: {
      "Actor.t2": "half",
      "Actor.t3": "threeQuarters"
    }
  });

  const receipt = { id: "rcpt-mixed-blast" };
  plan.apply({}, receipt);

  assert.equal(receipt.resolution.steps.length, 3);
  const [s1, s2, s3] = receipt.resolution.steps;

  // All targets belong to the shared rollGroupId
  assert.equal(s1.rollGroupId, "splash-blast");
  assert.equal(s2.rollGroupId, "splash-blast");
  assert.equal(s3.rollGroupId, "splash-blast");

  // Cover DCs with Sharpened Shrapnel (base 15 + 2 = 17)
  assert.equal(s1.save.dc, 17, "no cover has standard DC 17 with Sharpened Shrapnel");
  assert.equal(s1.save.coverBonus, 0);

  assert.equal(s2.save.dc, 15, "half cover reduces effective DC by 2 (17 - 2 = 15)");
  assert.equal(s2.save.coverBonus, 2);

  assert.equal(s3.save.dc, 12, "three-quarters cover reduces effective DC by 5 (17 - 5 = 12)");
  assert.equal(s3.save.coverBonus, 5);

  // Siege Attacker doubling for vehicles / objects
  assert.equal(s1.siegeAttacker, true, "Artilleryman blast carries siegeAttacker: true");
  assert.equal(s2.siegeAttacker, true);
  assert.equal(s3.siegeAttacker, true);
});

test("Scatter Them distance, direction, and collision geometry tracking", () => {
  const launcher = generatedLauncher();
  const actor = {
    uuid: "Actor.scatterGeom",
    name: "Scatter Artillery",
    system: { attributes: { prof: 3 }, abilities: { dex: { mod: 3 } } },
    items: [
      { type: "class", system: { levels: 9 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } },
      launcher
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, martialDcAbility: "dex" },
        resourcePools: { secondaryDetonation: { value: 1 } }
      }
    }
  };

  // Target positions relative to blast center { x: 10, y: 10 }:
  // tRight: { x: 20, y: 10 } -> direction dx: 1, dy: 0, angle ~ 0 deg
  // tUp: { x: 10, y: 0 } -> direction dx: 0, dy: -1, angle ~ 270 deg
  const plan = ARTILLERYMAN_PLANS.scatterThem(actor, {}, {
    weaponUuid: launcher.uuid,
    point: { x: 10, y: 10 },
    targetUuids: ["Actor.tRight", "Actor.tUp"],
    targetPositions: {
      "Actor.tRight": { x: 20, y: 10 },
      "Actor.tUp": { x: 10, y: 0 }
    },
    collisionTargetUuids: ["Actor.tRight"],
    triggerConfirmed: true
  });

  const receipt = { id: "rcpt-scatter-geom" };
  plan.apply({}, receipt);

  assert.ok(receipt.result.geometry);
  assert.equal(receipt.result.blastCenter.x, 10);
  assert.equal(receipt.result.blastCenter.y, 10);

  const geomRight = receipt.result.geometry["Actor.tRight"];
  assert.ok(geomRight);
  assert.equal(geomRight.distanceFt, 30);
  assert.equal(geomRight.collided, true);
  assert.equal(geomRight.angleDeg, 0);

  const geomUp = receipt.result.geometry["Actor.tUp"];
  assert.ok(geomUp);
  assert.equal(geomUp.distanceFt, 30);
  assert.equal(geomUp.collided, false);
  assert.equal(geomUp.angleDeg, 270);

  // Check collision damage step for tRight
  const collisionStep = receipt.resolution.steps.find(s => s.id.startsWith("scatter-collision") && s.targetUuids.includes("Actor.tRight"));
  assert.ok(collisionStep);
  assert.equal(collisionStep.damageParts[0].formula, "4d8");
  assert.equal(collisionStep.damageParts[0].type, "bludgeoning");
});

test("Timer reload suppression maintains inactive munition state across reload", () => {
  const actor = {
    uuid: "Actor.timerReload",
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          delayedMunitions: [
            { id: "active-1", active: true, point: { x: 5, y: 5 } },
            { id: "suppressed-2", active: false, point: { x: 10, y: 10 } }
          ]
        }
      }
    }
  };

  assert.equal(isDelayedMunitionActive(actor, "active-1"), true);
  assert.equal(isDelayedMunitionSuppressed(actor, "active-1"), false);

  assert.equal(isDelayedMunitionActive(actor, "suppressed-2"), false);
  assert.equal(isDelayedMunitionSuppressed(actor, "suppressed-2"), true);

  // Suppress active munition
  suppressDelayedMunitionTimer(actor, "active-1");
  assert.equal(isDelayedMunitionActive(actor, "active-1"), false);
  assert.equal(isDelayedMunitionSuppressed(actor, "active-1"), true);
});

