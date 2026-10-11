import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isArtilleryman, defineArtillerymanPools, artillerymanSplashDC,
  ARTILLERYMAN_PLANS, artillerymanPreRollDamage
} from "../scripts/artilleryman-features.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

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
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          targetLock: { active: true, targetUuid: "Token.boss" }
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
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = ARTILLERYMAN_PLANS.delayedDetonation(actor, {}, { point: { x: 150, y: 300 }, weaponName: "Grenade Launcher" });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-del-1" };
  const updates = plan.apply({}, receipt);

  assert.equal(updates["flags.ak5e.marksman.delayedMunition"].active, true);
  assert.deepEqual(updates["flags.ak5e.marksman.delayedMunition"].point, { x: 150, y: 300 });
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
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = ARTILLERYMAN_PLANS.secondaryDetonation(actor, {}, { originalDamage: 24, point: { x: 50, y: 50 } });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-sec-1" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.secondaryDamage, 12);
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

  const roll = { parts: ["1d8", "4"] };
  const config = {
    subject: {
      actor,
      item: weapon
    },
    rolls: [roll]
  };

  artillerymanPreRollDamage(config);

  assert.equal(roll.parts.includes("2d8"), true);
});
