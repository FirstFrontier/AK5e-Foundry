import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isBesieger, inSiegeMode, isLargeOrLarger, defineBesiegerPools,
  BESIEGER_PLANS, besiegerPreRollAttack, besiegerPreRollDamage
} from "../scripts/besieger-features.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

test("Besieger identification, size check, and pools", () => {
  defineBesiegerPools();

  const actor = {
    uuid: "Actor.besieger1",
    system: { attributes: { prof: 4 } },
    items: [
      {
        type: "class",
        system: { levels: 15 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Besieger",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, siegeMode: true }
      }
    }
  };

  assert.equal(isBesieger(actor), true);
  assert.equal(inSiegeMode(actor), true);

  const largeTarget = { system: { traits: { size: "lg" } } };
  const medTarget = { system: { traits: { size: "med" } } };
  assert.equal(isLargeOrLarger(largeTarget), true);
  assert.equal(isLargeOrLarger(medTarget), false);

  const bolt = getPool(actor, "siegeBolt");
  assert.equal(bolt.max, 1);
  assert.equal(bolt.value, 1);

  const bane = getPool(actor, "goliathsBane");
  assert.equal(bane.max, 4); // @prof = 4
  assert.equal(bane.value, 4);
});

test("Siege Mode and Deliberate Efficient plans activate properly", () => {
  const actor = {
    uuid: "Actor.besieger2",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 4 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true }
      }
    }
  };

  const plan = BESIEGER_PLANS.siegeMode(actor, {}, {});
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-siege-1" };
  const updates = plan.apply({}, receipt);

  assert.equal(updates["flags.ak5e.marksman.siegeMode"], true);
  assert.equal(receipt.result.crushBonus, 6); // 2 * PB = 6

  // Deliberate Efficient with active Siege Mode
  actor.flags.ak5e.marksman.siegeMode = true;
  const dePlan = BESIEGER_PLANS.deliberateEfficient(actor, {}, {});
  assert.equal(dePlan.warnings.length, 0);
  const deUpdates = dePlan.apply({}, { id: "rcpt-de-1" });
  assert.equal(deUpdates["flags.ak5e.marksman.deliberateEfficientActive"], true);
});

test("Siege Bolt plan calculates DC and notes DR bypass", () => {
  const actor = {
    uuid: "Actor.besieger3",
    system: {
      attributes: { prof: 4 },
      abilities: { str: { mod: 2 }, dex: { mod: 4 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, martialDcAbility: "dex" }
      }
    }
  };

  const plan = BESIEGER_PLANS.siegeBolt(actor, {}, { targetName: "Goliath" });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-bolt-1" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.dc, 8 + 4 + 4); // 16
  assert.equal(receipt.result.damageFormula, "5d8");
  assert.equal(receipt.result.ignoresDR, true);
});

test("Goliath's Bane plan forces Con save and applies Stunned condition", () => {
  const actor = {
    uuid: "Actor.besieger4",
    system: {
      attributes: { prof: 5 },
      abilities: { str: { mod: 3 }, dex: { mod: 5 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 15 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, siegeMode: true, martialDcAbility: "dex" }
      }
    }
  };

  const plan = BESIEGER_PLANS.goliathsBane(actor, {}, { targetName: "Colossus" });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-bane-1" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.dc, 8 + 5 + 5); // 18
  assert.equal(receipt.result.condition, "stunned");
});

test("besiegerPreRollDamage adds 1d8 in Siege Mode and switches to 8 HP loss with Godpiercer", () => {
  // Pre-18th level
  const actor15 = {
    items: [
      {
        type: "class",
        system: { levels: 15 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, siegeMode: true }
      }
    }
  };

  const roll15 = { parts: ["2d8", "4"], options: {} };
  besiegerPreRollDamage({ subject: { actor: actor15, item: {} }, rolls: [roll15] });
  assert.equal(roll15.parts.includes("1d8"), true);
  assert.equal(roll15.options.godpiercerHpLoss, undefined);

  // 18th level: Godpiercer
  const actor18 = {
    items: [
      {
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, siegeMode: true }
      }
    }
  };

  const roll18 = { parts: ["2d8", "4"], options: {} };
  besiegerPreRollDamage({ subject: { actor: actor18, item: {} }, rolls: [roll18] });
  // Should NOT have added 1d8!
  assert.equal(roll18.parts.includes("1d8"), false);
  // Should have set Godpiercer 8 HP loss
  assert.equal(roll18.options.godpiercerHpLoss, 8);
});

