import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defineMarksmanPools, marksmanPreRollAttack, marksmanPreRollDamage,
  checkHighGround
} from "../scripts/marksman-features.mjs";
import { CORE_PLANS } from "../scripts/marksman-uses.mjs";
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
            bonus: 1
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
