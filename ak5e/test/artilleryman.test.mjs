import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isArtilleryman, defineArtillerymanPools, artillerymanSplashDC,
  ARTILLERYMAN_PLANS, artillerymanPreRollDamage
} from "../scripts/artilleryman-features.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
globalThis.game = { time: { worldTime: 100 }, user: { targets: new Set() } };

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
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = ARTILLERYMAN_PLANS.delayedDetonation(actor, {}, { point: { x: 150, y: 300 }, weaponName: "Grenade Launcher", triggerConfirmed: true });
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

  const plan = ARTILLERYMAN_PLANS.secondaryDetonation(actor, {}, { originalDamage: 24, point: { x: 50, y: 50 }, triggerConfirmed: true });
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
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-artilleryman" } } }] };
  assert.equal(artillerymanSplashDC(actor), null, "an unchosen Martial DC cannot become DC 2");
  const receipt = { id: "deploy" };
  const updates = ARTILLERYMAN_PLANS.delayedDetonation(actor, {}, {}).apply({}, receipt);
  const munition = updates["flags.ak5e.marksman.delayedMunition"];
  assert.equal(munition.point, null, "an absent point is never silently (0,0)");
  assert.equal(munition.detonatesAt - munition.placedAt, 600);
  actor.flags.ak5e.marksman.delayedMunition = munition;
  const detonate = { id: "automatic" };
  ARTILLERYMAN_PLANS.detonateMunition(actor, {}, { automatic: true }).apply({}, detonate);
  assert.equal(detonate.reaction, undefined, "automatic timer resolution costs no Reaction");
  const manual = { id: "manual" };
  ARTILLERYMAN_PLANS.detonateMunition(actor, {}, {}).apply({}, manual);
  assert.equal(manual.reaction.requested, true, "movement detonation defers Reaction to the prepared engine");
  const secondary = {};
  ARTILLERYMAN_PLANS.secondaryDetonation(actor, {}, {}).apply({}, secondary);
  assert.equal(secondary.result.secondaryDamage, null, "unspecified damage is resolved manually, not zero");
  assert.match(secondary.summary, /cannot generate Secondary/);
  assert.match(secondary.summary, /NO damage/);
  assert.doesNotMatch(secondary.summary, /successful saves half/);
  assert.equal(ARTILLERYMAN_PLANS.disarmMunition(actor, {}, {}).apply({}, {})["flags.ak5e.marksman.delayedMunition.active"], false);
});
