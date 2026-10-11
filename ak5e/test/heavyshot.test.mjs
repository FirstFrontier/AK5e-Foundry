import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isHeavyshot, defineHeavyshotPools, HEAVYSHOT_PLANS,
  heavyshotPreRollAttack, heavyshotPreRollDamage
} from "../scripts/heavyshot-features.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";

test("Heavyshot identification and pools", () => {
  const actor = {
    uuid: "Actor.heavyshot1",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Heavyshot",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  assert.equal(isHeavyshot(actor), true);

  defineHeavyshotPools();
  const savagePool = getPool(actor, "savageShots");
  assert.ok(savagePool);
  assert.equal(savagePool.max, 3);
});

test("Weapon Tuning plan modifies weapon to Custom Job with halved range", async () => {
  let updatedData = null;
  const weapon = {
    id: "heavy-crossbow",
    name: "Heavy Crossbow",
    system: {
      actionType: "rwak",
      properties: new Set(["hvy", "lod"]),
      range: { value: 100, long: 400 }
    },
    update(data) {
      updatedData = data;
      return Promise.resolve();
    }
  };

  const itemList = [
    { type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
    { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } } },
    weapon
  ];
  itemList.get = id => itemList.find(i => i.id === id);

  const actor = {
    uuid: "Actor.heavyshot2",
    name: "Schwarz",
    system: { attributes: { prof: 3 } },
    items: itemList,
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  const plan = HEAVYSHOT_PLANS.tuneWeapon(actor, {}, { weaponId: "heavy-crossbow" });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-tune" };
  await plan.apply({}, receipt);

  assert.equal(updatedData["flags.ak5e.customJob"], true);
  assert.equal(updatedData["system.range.value"], 50);
  assert.equal(updatedData["system.range.long"], 200);
  assert.equal(receipt.result.tuned, true);
});

test("Savage Shots and Heartseeker plans", () => {
  const actor = {
    uuid: "Actor.heavyshot3",
    name: "Schwarz",
    system: { attributes: { prof: 4 } },
    items: [
      {
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  defineHeavyshotPools();

  const savagePlan = HEAVYSHOT_PLANS.savageShots(actor, {}, {});
  assert.equal(savagePlan.warnings.length, 0);
  const savageReceipt = { id: "rcpt-savage" };
  const savageUpdates = savagePlan.apply({}, savageReceipt);
  assert.equal(savageUpdates["flags.ak5e.marksman.savageShotsActive"], true);

  const heartPlan = HEAVYSHOT_PLANS.heartseeker(actor, {}, {});
  assert.equal(heartPlan.warnings.length, 0);
  const heartReceipt = { id: "rcpt-heart" };
  const heartUpdates = heartPlan.apply({}, heartReceipt);
  assert.equal(heartUpdates["flags.ak5e.marksman.heartseekerActive"], true);
  assert.equal(heartReceipt.result.maximized, true);
});

test("Devastator cleave plan passes through excess damage", () => {
  const actor = {
    uuid: "Actor.heavyshot4",
    name: "Pozëmka",
    items: [
      { type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } } }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  const plan = HEAVYSHOT_PLANS.devastatorCleave(actor, {}, {
    targetUuid: "Actor.enemy2",
    targetName: "Ursus Soldier 2",
    excessDamage: 14,
    wasLockedTarget: true,
    damageDieFormula: "1d10"
  });

  assert.equal(plan.warnings.length, 0);
  const receipt = { id: "rcpt-cleave" };
  plan.apply({}, receipt);
  assert.equal(receipt.result.excessDamage, 14);
  assert.equal(receipt.result.wasLockedTarget, true);
});

test("Hooks apply Devastator crit reduction and damage scaling", () => {
  const actorLvl1 = {
    uuid: "Actor.heavyshot5",
    system: { attributes: { prof: 2 } },
    items: [
      {
        type: "class",
        system: { levels: 1 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } },
    getActiveTokens() { return []; }
  };

  const customWeapon = {
    name: "Custom Heavy Crossbow",
    system: {
      actionType: "rwak",
      properties: new Set(["hvy", "lod"]),
      range: { value: 50 },
      damage: { base: { formula: "1d10" } }
    },
    flags: { ak5e: { customJob: true } }
  };

  // 1. Attack roll: +1 crit range
  const attackConfig = {
    subject: { actor: actorLvl1, item: customWeapon },
    rolls: [{ options: {} }]
  };
  heavyshotPreRollAttack(attackConfig);
  assert.equal(attackConfig.rolls[0].options.criticalSuccess, 19);

  // 2. Damage roll at 1st level with Loading: 1d10 base + 1d10 Heaviest Shot
  const damageConfig1 = {
    subject: { actor: actorLvl1, item: customWeapon },
    rolls: [{ parts: ["1d10", "3"], options: {} }]
  };
  heavyshotPreRollDamage(damageConfig1);
  assert.equal(damageConfig1.rolls[0].parts.includes("1d10"), true);
  assert.equal(damageConfig1.rolls[0].parts.length, 3); // ["1d10", "3", "1d10"]

  // 3. Damage roll at 10th level: +1 die damage, +1 die on crit
  const actorLvl10 = {
    uuid: "Actor.heavyshot6",
    system: { attributes: { prof: 4 } },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-heavyshot" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } },
    getActiveTokens() { return []; }
  };

  const critDamageConfig = {
    subject: { actor: actorLvl10, item: customWeapon },
    rolls: [{ parts: ["1d10"], options: { critical: true } }]
  };
  heavyshotPreRollDamage(critDamageConfig);
  // Loading (1d10) + Improved Tuning (1d10) + Custom Criticals (1d10) -> 3 extra dice
  assert.equal(critDamageConfig.rolls[0].parts.length, 4);
});
