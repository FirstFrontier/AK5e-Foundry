import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isHunter, defineHunterPools, inLetTheLightIn, HUNTER_PLANS,
  hunterPreRollAttack, hunterPreRollDamage
} from "../scripts/hunter-features.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";
import { hunterMaxCharges } from "../scripts/marksman-rules.mjs";

test("Hunter identification and Charges scaling", () => {
  const actor1 = {
    uuid: "Actor.hunter1",
    system: { attributes: { prof: 2 } },
    items: [
      {
        type: "class",
        system: { levels: 1 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Hunter",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-hunter" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  assert.equal(isHunter(actor1), true);
  assert.equal(hunterMaxCharges(actor1), 2);

  defineHunterPools();
  const pool1 = getPool(actor1, "hunterCharges");
  assert.ok(pool1);
  assert.equal(pool1.max, 2);

  // Scaling at 7th and 14th level
  const actor7 = {
    uuid: "Actor.hunter7",
    items: [{ type: "class", system: { levels: 7 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true } } }
  };
  assert.equal(hunterMaxCharges(actor7), 4);

  const actor14 = {
    uuid: "Actor.hunter14",
    items: [{ type: "class", system: { levels: 14 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }],
    flags: { ak5e: { marksman: { enabled: true } } }
  };
  assert.equal(hunterMaxCharges(actor14), 6);
});

test("Empowered Shot plan with Target Lock discount and Double Up", () => {
  const actor = {
    uuid: "Actor.hunter2",
    name: "Coldshot",
    system: {
      attributes: { prof: 3 },
      abilities: { dex: { mod: 4 }, str: { mod: 1 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-hunter" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          targetLock: { active: true, targetUuid: "Actor.boss1" }
        }
      }
    }
  };

  defineHunterPools();

  // 1. Single option vs locked Target: FREE (0 charges spent)
  const planFree = HUNTER_PLANS.empoweredShot(actor, {}, {
    option: "piercing",
    targetUuid: "Actor.boss1"
  });
  assert.equal(planFree.warnings.length, 0);
  const receiptFree = { id: "rcpt-free" };
  planFree.apply({}, receiptFree);
  assert.equal(receiptFree.result.cost, 0);
  assert.equal(receiptFree.result.freeUsed, true);

  // 2. Double Up vs locked Target: 2 options - 1 free = 1 charge spent
  const planDouble = HUNTER_PLANS.empoweredShot(actor, {}, {
    options: ["piercing", "concussive"],
    targetUuid: "Actor.boss1"
  });
  assert.equal(planDouble.warnings.length, 0);
  const receiptDouble = { id: "rcpt-double" };
  const updatesDouble = planDouble.apply({}, receiptDouble);
  assert.equal(receiptDouble.result.cost, 1);
  assert.equal(updatesDouble["flags.ak5e.resourcePools.hunterCharges.value"], 1);
});

test("Railgun plan calculates DC and damage based on charges spent", () => {
  const actor = {
    uuid: "Actor.hunter3",
    name: "Ray",
    system: {
      attributes: { prof: 4 },
      abilities: { dex: { mod: 5 }, str: { mod: 1 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-hunter" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  defineHunterPools();

  const plan = HUNTER_PLANS.railgun(actor, {}, { charges: 3 });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-railgun" };
  const updates = plan.apply({}, receipt);

  assert.equal(receipt.result.chargesSpent, 3);
  assert.equal(receipt.result.damageFormula, "6d6");
  assert.equal(receipt.result.dc, 17); // 8 + 4 + 5 = 17
  assert.equal(updates["flags.ak5e.resourcePools.railgun.value"], 0);
  assert.equal(updates["flags.ak5e.resourcePools.hunterCharges.value"], 1);
});

test("Let the Light In plan activates stance and refunds charges", async () => {
  const actor = {
    uuid: "Actor.hunter4",
    name: "Ray",
    system: { attributes: { prof: 6 } },
    items: [
      {
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-hunter" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  defineHunterPools();
  actor.flags.ak5e.resourcePools = { hunterCharges: { value: 0 } };

  const plan = HUNTER_PLANS.letTheLightIn(actor, {}, {});
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-light" };
  const updates = await plan.apply({}, receipt);

  assert.equal(updates["flags.ak5e.marksman.letTheLightInActive"], true);
  assert.equal(receipt.result.active, true);
});

test("Hooks apply Seeking Shot and Piercing Shot bonuses", () => {
  const actor = {
    uuid: "Actor.hunter5",
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-hunter" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          activeEmpoweredShot: { seekingBonus: "1d6", piercingBonus: "1d8" }
        }
      }
    },
    update() { return Promise.resolve(); }
  };

  const attackConfig = {
    subject: { actor },
    rolls: [{ parts: ["1d20", "5"] }]
  };
  hunterPreRollAttack(attackConfig);
  assert.equal(attackConfig.rolls[0].parts.includes("1d6"), true);

  const damageConfig = {
    subject: { actor },
    rolls: [{ parts: ["1d8", "3"] }]
  };
  hunterPreRollDamage(damageConfig);
  assert.equal(damageConfig.rolls[0].parts.includes("1d8"), true);
});
