import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAntiAir, isAirborneOrFast, defineAntiAirPools,
  ANTI_AIR_PLANS, antiAirPreRollAttack, antiAirRollInitiative
} from "../scripts/anti-air-features.mjs";
import { getPool, recoverPool } from "../scripts/resource-pools.mjs";
globalThis.game = { time: { worldTime: 100 }, combat: null };

test("Anti-Air identification, airborne check, and pools", () => {
  defineAntiAirPools();

  const actor = {
    uuid: "Actor.antiAir1",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Anti-Air",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  assert.equal(isAntiAir(actor), true);

  // Airborne check: elevation or movement
  const flyingToken = { document: { elevation: 15, flags: { ak5e: { airborne: true } } } };
  const groundToken = { document: { elevation: 0 } };
  const flyingActor = { system: { attributes: { movement: { fly: 30 } } } };
  const fastActor = { flags: { ak5e: { movedLastTurn: 60 } } };
  const normalActor = { system: { attributes: { movement: { fly: 0 } } } };

  assert.equal(isAirborneOrFast(flyingToken, normalActor), true);
  assert.equal(isAirborneOrFast(groundToken, flyingActor), false, "a grounded flyer gets no airborne bonus");
  assert.equal(isAirborneOrFast({ document: { elevation: 50 } }, normalActor), false, "a rooftop is not airborne");
  assert.equal(isAirborneOrFast(groundToken, fastActor), true);
  assert.equal(isAirborneOrFast(groundToken, normalActor), false);

  // Resource Pool
  const va = getPool(actor, "versatileApproach");
  assert.equal(va.max, 3);
  assert.equal(va.value, 3);
});

test("Weight of Fire never suppresses an unrelated ranged or melee roll", () => {
  const actor = { uuid: "Actor.weight", flags: { ak5e: { marksman: { enabled: true, weightOfFireActive: true } } },
    items: [{ type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } } }] };
  game.user = { targets: { first: () => null } };
  for (const actionType of ["mwak", "rwak"]) {
    const roll = { options: { advantage: true } };
    antiAirPreRollAttack({ subject: { actor, actionType }, rolls: [roll] });
    assert.equal(roll.options.advantage, true);
  }
});

test("Option Recharge uses the canonical pool, once for an initiative event", async () => {
  const actor = { uuid: "Actor.recharge", flags: { ak5e: { marksman: { enabled: true }, resourcePools: { versatileApproach: { value: 0 } } } },
    system: { attributes: { prof: 6 } },
    items: [{ type: "class", system: { levels: 15 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } } }],
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split("."), last = parts.pop();
        let obj = this; for (const key of parts) obj = obj[key] ??= {};
        obj[last] = structuredClone(value);
      }
      return this;
    } };
  await recoverPool(actor, "initiative", { eventKey: "generic-init" });
  assert.equal(getPool(actor, "versatileApproach").value, 0, "the generic combatant hook cannot also grant recharge");
  await antiAirRollInitiative(actor, { eventId: "init-once" });
  await antiAirRollInitiative(actor, { eventId: "init-once" });
  assert.equal(getPool(actor, "versatileApproach").value, 1);
  await antiAirRollInitiative(actor, { eventId: "reroll" });
  assert.equal(getPool(actor, "versatileApproach").value, 2, "a genuinely new initiative roll recovers one");
});

test("Weight of Fire and Shifting Focus plans", () => {
  const actor = {
    uuid: "Actor.antiAir2",
    name: "Meteor",
    system: { attributes: { prof: 2 } },
    items: [
      {
        type: "class",
        system: { levels: 1 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  game.combat = { id: "test", started: true, round: 1, turn: 0, combatant: { actor }, turns: [{ actor }] };
  actor.flags.ak5e.marksman.targetLock = { active: true, targetUuid: "Old.Target", bonus: 2, startedAt: 90, expiresAt: 150 };

  // Weight of Fire
  const wofPlan = ANTI_AIR_PLANS.weightOfFire(actor, {}, { advantagedRangedAttack: true });
  assert.equal(wofPlan.warnings.length, 0);
  const wofReceipt = { id: "rcpt-wof" };
  const wofUpdates = wofPlan.apply({}, wofReceipt);
  assert.equal(wofUpdates["flags.ak5e.marksman.weightOfFireUsedTurn"], "test:1:0");
  assert.equal(wofReceipt.result.weightOfFire, true);

  // Shifting Focus
  const sfPlan = ANTI_AIR_PLANS.shiftingFocus(actor, {}, { targetUuid: "Target.Token.2", targetName: "Hovering Drone", previousTargetHp: 0 });
  assert.equal(sfPlan.warnings.length, 0);
  const sfReceipt = { id: "rcpt-sf" };
  const sfUpdates = sfPlan.apply({}, sfReceipt);
  assert.equal(sfUpdates["flags.ak5e.marksman.targetLock"].active, true);
  assert.equal(sfUpdates["flags.ak5e.marksman.targetLock"].targetName, "Hovering Drone");
  assert.equal(sfUpdates["flags.ak5e.marksman.targetLock"].bonus, 2, "retarget preserves the original per-use reading");
  assert.equal(sfUpdates["flags.ak5e.marksman.targetLock"].expiresAt, 150);
});

test("Versatile Approach options execute and deduct pool", () => {
  const actor = {
    uuid: "Actor.antiAir3",
    name: "GreyThroat",
    system: {
      attributes: { prof: 4 },
      abilities: { dex: { mod: 4 }, str: { mod: 1 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 11 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true },
        pools: { versatileApproach: { value: 4 } }
      }
    }
  };

  // Area Denial
  const adPlan = ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "areaDenial", conditionsConfirmed: true, martialDcAbility: "dex" });
  assert.equal(adPlan.warnings.length, 0);
  const adReceipt = { id: "rcpt-ad" };
  adPlan.apply({}, adReceipt);
  assert.equal(adReceipt.result.option, "areaDenial");
  assert.equal(adReceipt.result.dc, 8 + 4 + 4); // 16
  assert.equal(adReceipt.result.damage, "3d6 piercing");

  // Crowd Control
  const ccPlan = ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "crowdControl" });
  const ccReceipt = { id: "rcpt-cc" };
  ccPlan.apply({}, ccReceipt);
  assert.equal(ccReceipt.result.option, "crowdControl");
  assert.equal(ccReceipt.result.halfDamage, true);

  // Stop their Approach
  const saPlan = ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "stopApproach", targetName: "Reunion Soldier" });
  const saReceipt = { id: "rcpt-sa" };
  saPlan.apply({}, saReceipt);
  assert.equal(saReceipt.result.option, "stopApproach");
  assert.equal(saReceipt.result.speedReduction, 20);

  // Shoot to Kill
  const skPlan = ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "shootToKill", damageInstances: 3 });
  const skReceipt = { id: "rcpt-sk" };
  skPlan.apply({}, skReceipt);
  assert.equal(skReceipt.result.option, "shootToKill");
  assert.equal(skReceipt.result.formula, "3d4");
});

test("Unapproachable handles reaction and free reaction for Target Lock", async () => {
  const actor = {
    uuid: "Actor.antiAir4",
    name: "Kroos",
    system: { attributes: { prof: 4 } },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          targetLock: { active: true, targetUuid: "Target.Locked.1", expiresAt: 160 }
        }
      }
    }
  };

  // Locked target -> free reaction!
  const lockedPlan = ANTI_AIR_PLANS.unapproachable(actor, {}, { targetUuid: "Target.Locked.1", targetName: "Target Drone", triggerConfirmed: true });
  assert.equal(lockedPlan.warnings.length, 0);
  const lockedReceipt = { id: "rcpt-unapp-locked" };
  await lockedPlan.apply({}, lockedReceipt);
  assert.equal(lockedReceipt.result.targetLocked, true);
  assert.equal(lockedReceipt.reaction.spent, false);

  // Unlocked target -> standard reaction
  const unlockedPlan = ANTI_AIR_PLANS.unapproachable(actor, {}, { targetUuid: "Target.Other.2", targetName: "Random Infiltrator" });
  const unlockedReceipt = { id: "rcpt-unapp-unlocked" };
  await unlockedPlan.apply({}, unlockedReceipt);
  assert.equal(unlockedReceipt.result.targetLocked, false);
});

test("The Last Option 18th level stance and free option", () => {
  defineAntiAirPools();

  const actor = {
    uuid: "Actor.antiAir5",
    name: "Exusiai",
    system: { attributes: { prof: 6 }, abilities: { dex: { mod: 5 }, str: { mod: 0 } } },
    items: [
      {
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-anti-air" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true },
        pools: { theLastOption: { value: 1 } }
      }
    }
  };

  const loPool = getPool(actor, "theLastOption");
  game.combat = { id: "stance", started: true, round: 1, turn: 0, combatant: { actor }, turns: [{ actor }] };
  assert.equal(loPool.max, 1);
  assert.equal(loPool.value, 1);

  const plan = ANTI_AIR_PLANS.theLastOption(actor, {}, {});
  assert.equal(plan.warnings.length, 0);
  const receipt = { id: "rcpt-lo" };
  const updates = plan.apply({}, receipt);
  assert.equal(updates["flags.ak5e.marksman.lastOption"].active, true);
  assert.equal(receipt.result.stance, "theLastOption");

  // Free option while The Last Option is active
  actor.flags.ak5e.marksman.lastOption = updates["flags.ak5e.marksman.lastOption"];
  const freePlan = ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "shootToKill", damageInstances: 2 });
  const freeReceipt = { id: "rcpt-free-opt" };
  const freeUpdates = freePlan.apply({}, freeReceipt);
  assert.equal(freeUpdates["flags.ak5e.marksman.freeOptionTurn"], "stance:1:0");
  assert.equal(freeReceipt.result.die, "1d6"); // Upgraded at 18th level (>=15th)
  assert.equal(freeReceipt.result.formula, "2d6");
  actor.flags.ak5e.marksman.freeOptionTurn = "stance:1:0";
  const again = {};
  ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "shootToKill", damageInstances: 1 }).apply({}, again);
  assert.equal(again.resources.length, 1, "second same-Turn Option costs a use");
  game.combat.round = 2;
  const next = {};
  ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "shootToKill", damageInstances: 1 }).apply({}, next);
  assert.equal(next.resources, undefined, "the next own Turn grants one free Option");
  game.time.worldTime = 160;
  const expired = {};
  ANTI_AIR_PLANS.versatileApproach(actor, {}, { option: "shootToKill", damageInstances: 1 }).apply({}, expired);
  assert.equal(expired.resources.length, 1, "the stance expires after one minute");
});

