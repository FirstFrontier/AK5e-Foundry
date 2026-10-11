import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSpreadshot, defineSpreadshotPools, SPREADSHOT_PLANS,
  getLoadedShells, getShellInventory, totalShellsCount,
  spreadshotPreRollAttack, spreadshotPreRollDamage
} from "../scripts/spreadshot-features.mjs";
import { hasSpreadProperty, hasNativeSpreadProperty } from "../scripts/marksman-rules.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";

test("Spreadshot identification and pools", () => {
  const actor = {
    uuid: "Actor.spreadshot1",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Spreadshot",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } }
      }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  assert.equal(isSpreadshot(actor), true);

  defineSpreadshotPools();
  const gutPool = getPool(actor, "gutShot");
  assert.ok(gutPool);
  assert.equal(gutPool.max, 3);
});

test("Spread property detection for native and Wide Fire weapons", () => {
  const nativeSpreadWeapon = {
    name: "Shotgun",
    system: { properties: new Set(["spread"]) }
  };
  assert.equal(hasNativeSpreadProperty(nativeSpreadWeapon), true);
  assert.equal(hasSpreadProperty(nativeSpreadWeapon), true);

  const heavyRangedWeapon = {
    name: "Heavy Crossbow",
    type: "weapon",
    system: {
      weaponType: "Ranged Martial",
      properties: new Set(["hvy", "lod"])
    }
  };
  assert.equal(hasNativeSpreadProperty(heavyRangedWeapon), false);

  // Spreadshot actor grants Wide Fire to Light/Heavy ranged weapons
  const spreadshotActor = {
    items: [
      { type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } } }
    ]
  };
  assert.equal(hasSpreadProperty(heavyRangedWeapon, spreadshotActor), true);
});

test("Crafting and loading Shells follows FIFO queue and maintenance caps", () => {
  const actor = {
    uuid: "Actor.spreadshot2",
    name: "Executor",
    system: { attributes: { prof: 3 } },
    items: [
      { type: "class", system: { levels: 10 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } } }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          shells: { dragonsBreath: 2, slug: 1 },
          loadedShells: []
        }
      }
    }
  };

  assert.equal(totalShellsCount(actor), 3);

  // 1. Craft Shells (PB = 3)
  const craftPlan = SPREADSHOT_PLANS.craftShells(actor, {}, {
    shells: { dragonsBreath: 1, flechette: 1, beanbag: 1 }
  });
  assert.equal(craftPlan.warnings.length, 0);
  const craftReceipt = { id: "rcpt-craft" };
  const craftUpdates = craftPlan.apply({}, craftReceipt);
  assert.equal(craftUpdates["flags.ak5e.marksman.shells"].dragonsBreath, 3);
  assert.equal(craftUpdates["flags.ak5e.marksman.shells"].flechette, 1);
  assert.equal(craftUpdates["flags.ak5e.marksman.shells"].beanbag, 1);

  // Apply updates to mock actor
  actor.flags.ak5e.marksman.shells = craftUpdates["flags.ak5e.marksman.shells"];

  // 2. Load Shells as Bonus Action (up to 5)
  const loadPlan = SPREADSHOT_PLANS.loadShells(actor, {}, {
    shells: ["dragonsBreath", "slug", "beanbag"]
  });
  assert.equal(loadPlan.warnings.length, 0);
  const loadReceipt = { id: "rcpt-load" };
  const loadUpdates = loadPlan.apply({}, loadReceipt);
  assert.deepEqual(loadUpdates["flags.ak5e.marksman.loadedShells"], ["dragonsBreath", "slug", "beanbag"]);
  assert.equal(loadUpdates["flags.ak5e.marksman.shells"].dragonsBreath, 2);
  assert.equal(loadUpdates["flags.ak5e.marksman.shells"].slug, 0);
});

test("Gut Shot and Break Contact plans", async () => {
  const actor = {
    uuid: "Actor.spreadshot3",
    name: "Pinecone",
    system: { attributes: { prof: 3 } },
    items: [
      { type: "class", system: { levels: 4 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } } }
    ],
    flags: { ak5e: { marksman: { enabled: true } } }
  };

  defineSpreadshotPools();

  const gutPlan = SPREADSHOT_PLANS.gutShot(actor, {}, {});
  assert.equal(gutPlan.warnings.length, 0);
  const gutReceipt = { id: "rcpt-gut" };
  const gutUpdates = gutPlan.apply({}, gutReceipt);
  assert.equal(gutReceipt.result.bonusDamage, 3);
  assert.equal(gutReceipt.result.knockback, 10);
  assert.equal(gutUpdates["flags.ak5e.resourcePools.gutShot.value"], 2);

  const breakPlan = SPREADSHOT_PLANS.breakContact(actor, {}, {});
  const breakReceipt = { id: "rcpt-break" };
  await breakPlan.apply({}, breakReceipt);
  assert.equal(breakReceipt.result.breakContact, true);
});

test("Both Barrels consumes first loaded shell", () => {
  const actor = {
    uuid: "Actor.spreadshot4",
    name: "Executor",
    system: {
      attributes: { prof: 6 },
      abilities: { dex: { mod: 5 }, str: { mod: 2 } }
    },
    items: [
      { type: "class", system: { levels: 18 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } } }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          loadedShells: ["dragonsBreath", "slug"]
        }
      }
    }
  };

  defineSpreadshotPools();

  const plan = SPREADSHOT_PLANS.bothBarrels(actor, {}, {});
  assert.equal(plan.warnings.length, 0);
  const receipt = { id: "rcpt-bb" };
  const updates = plan.apply({}, receipt);

  assert.equal(receipt.result.shell, "dragonsBreath");
  assert.match(receipt.result.description, /8d8 Fire Damage/);
  assert.deepEqual(updates["flags.ak5e.marksman.loadedShells"], ["slug"]);
  assert.equal(updates["flags.ak5e.resourcePools.bothBarrels.value"], 0);
});

test("Hooks apply Point Blank advantage and native damage scaling", () => {
  const actor = {
    uuid: "Actor.spreadshot5",
    items: [
      { type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-spreadshot" } } }
    ],
    flags: { ak5e: { marksman: { enabled: true } } },
    getActiveTokens() { return []; }
  };

  const shotgun = {
    name: "Shotgun",
    system: { properties: new Set(["spread"]), damage: { base: { formula: "1d8" } } }
  };

  // 1. Attack roll: Advantage at Point Blank
  const attackConfig = {
    subject: { actor, item: shotgun },
    rolls: [{ options: {} }]
  };
  spreadshotPreRollAttack(attackConfig);
  assert.equal(attackConfig.rolls[0].options.advantage, true);

  // 2. Damage roll: +1 die for native Spread
  const damageConfig = {
    subject: { actor, item: shotgun },
    rolls: [{ parts: ["1d8", "3"], options: {} }]
  };
  spreadshotPreRollDamage(damageConfig);
  assert.equal(damageConfig.rolls[0].parts.includes("1d8"), true);
  assert.equal(damageConfig.rolls[0].parts.length, 3);
});
