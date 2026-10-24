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
        marksman: { enabled: true, siegeMode: true, manualTurn: 0, siegeModeTurn: "manual:0" }
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
  assert.equal(receipt.targets[0].payload.effects[0].changes.length, 5, "Siege Mode sets every movement mode to 0");
  assert.equal(BESIEGER_PLANS.siegeMode.validateTarget(actor, receipt, receipt.targets[0], actor), true);
  const endReceipt = { id: "end-siege" };
  BESIEGER_PLANS.endSiegeMode(actor, {}, {}).apply({}, endReceipt);
  assert.deepEqual(endReceipt.targets[0].payload.removeLabels, ["Siege Mode"]);

  // Deliberate Efficient with active Siege Mode
  actor.flags.ak5e.marksman.siegeMode = true;
  actor.flags.ak5e.marksman.siegeModeTurn = "manual:0";
  const weapon = { id: "rifle", uuid: "Actor.besieger2.Item.rifle", system: { damage: { base: { formula: "2d12", types: new Set(["piercing"]) } } } };
  actor.items.push(weapon);
  const dePlan = BESIEGER_PLANS.deliberateEfficient(actor, {}, { targetUuid: "Actor.target", weaponUuid: weapon.uuid, activityId: "attack", actionId: "action-1" });
  assert.equal(dePlan.warnings.length, 0);
  const deReceipt = { id: "rcpt-de-1" };
  const deUpdates = dePlan.apply({}, deReceipt);
  assert.deepEqual(deUpdates, {});
  assert.equal(deReceipt.resolution.steps[0].kind, "attack");
  assert.equal(deReceipt.resolution.steps[0].consumeUpdates["flags.ak5e.marksman.deliberateEfficientAction"], "action-1");
  assert.equal(deReceipt.resolution.steps[1].damageParts[0].formula, "1d8");
  assert.equal(deReceipt.resolution.steps[0].ignoreDR, true, "physical Weapon Attacks ignore DR");
  weapon.system.damage.base.types = new Set(["fire", "thunder"]);
  const mixedPlan = BESIEGER_PLANS.deliberateEfficient(actor, {}, { targetUuid: "Actor.target", weaponUuid: weapon.uuid, activityId: "attack", actionId: "action-2" });
  const mixedReceipt = { id: "rcpt-de-mixed" }; mixedPlan.apply({}, mixedReceipt);
  assert.equal(mixedReceipt.resolution.steps[0].ignoreDR, true);
  assert.equal(mixedReceipt.resolution.steps[0].physicalOnly, true, "bypass applies to physical Thunder only, not the mixed Fire portion");
  weapon.system.damage.base.types = new Set(["fire"]);
  const nonphysicalPlan = BESIEGER_PLANS.deliberateEfficient(actor, {}, { targetUuid: "Actor.target", weaponUuid: weapon.uuid, activityId: "attack", actionId: "action-3" });
  const nonphysicalReceipt = { id: "rcpt-de-nonphysical" }; nonphysicalPlan.apply({}, nonphysicalReceipt);
  assert.equal(nonphysicalReceipt.resolution.steps[0].ignoreDR, undefined, "nonphysical attacks do not receive the physical bypass");
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

  const plan = BESIEGER_PLANS.siegeBolt(actor, {}, { targetName: "Goliath", targetUuid: "Actor.goliath" });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-bolt-1" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.dc, 8 + 4 + 4); // 16
  assert.equal(receipt.result.damageFormula, "5d8");
  assert.equal(receipt.result.ignoresDR, true);
  assert.equal(receipt.resolution.steps[0].damageParts[0].formula, "5d8");
  assert.equal(receipt.resolution.steps[0].save.success, "full", "a successful initial save still takes full damage");
  assert.equal(receipt.resolution.steps[0].endOnSuccess, true);
  assert.equal(receipt.resolution.steps.find(step => step.id.endsWith("tick-2")).requiresFailedSaveStepIds.length, 3);
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
        marksman: { enabled: true, siegeMode: true, manualTurn: 0, siegeModeTurn: "manual:0", martialDcAbility: "dex" }
      }
    }
  };

  const plan = BESIEGER_PLANS.goliathsBane(actor, {}, { targetName: "Colossus", targetUuid: "Actor.colossus", rangedWeaponAttack: true });
  assert.equal(plan.warnings.length, 0);

  const receipt = { id: "rcpt-bane-1" };
  plan.apply({}, receipt);

  assert.equal(receipt.result.dc, 8 + 5 + 5); // 18
  assert.equal(receipt.result.condition, "stunned");
  assert.equal(receipt.resolution.steps[0].effects[0].expiry.event, "nextTurnEnd");
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
        marksman: { enabled: true, siegeMode: true, manualTurn: 0, siegeModeTurn: "manual:0" }
      }
    }
  };

  const weapon = { uuid: "Actor.weapon", type: "weapon", flags: { ak5e: { tableData: { properties: "Crush (5), Brace" } } } };
  const roll15 = { parts: ["2d8", "4"], options: {} };
  besiegerPreRollDamage({ subject: { actor: actor15, item: weapon, actionType: "rwak" }, rolls: [roll15] });
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
        marksman: { enabled: true, siegeMode: true, manualTurn: 0, siegeModeTurn: "manual:0" }
      }
    }
  };

  const roll18 = { parts: ["2d8", "4"], options: {} };
  besiegerPreRollDamage({ subject: { actor: actor18, item: weapon, actionType: "rwak" }, rolls: [roll18] });
  // Should NOT have added 1d8!
  assert.equal(roll18.parts.includes("1d8"), false);
  // Should have set Godpiercer 8 HP loss
  assert.equal(roll18.options.ak5eMarksman.godpiercerHpLoss, 8);
  assert.equal(roll18.options.ak5eMarksman.crush, 9); // base Crush 5 + twice default PB 2
});

test("Siege Mode is scoped to one recorded combat or manual Turn", () => {
  const actor = { uuid: "Actor.turn", items: [{ type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
      { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } } }],
    flags: { ak5e: { marksman: { enabled: true, manualTurn: 2, siegeMode: true, siegeModeTurn: "manual:2" } } } };
  assert.equal(inSiegeMode(actor), true);
  actor.flags.ak5e.marksman.manualTurn = 3;
  assert.equal(inSiegeMode(actor), false, "legacy/unbounded Siege Mode does not persist into later Turns");
  assert.equal(Object.hasOwn(BESIEGER_PLANS, "advanceManualTurn"), false, "manual turn command is shared, not overridden by a subclass plan");
});

test("Godpiercer requires an explicit per-use mitigation reading", () => {
  const actor = { uuid: "Actor.godpiercer", name: "Godpiercer", items: [
    { type: "class", system: { levels: 18 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } },
    { type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-marksman-besieger" } } }],
    flags: { ak5e: { marksman: { enabled: true, siegeMode: true, manualTurn: 0, siegeModeTurn: "manual:0" } } } };
  const data = { hitConfirmed: true, targetUuid: "Actor.target", originMessageUuid: "ChatMessage.attack" };
  const plan = BESIEGER_PLANS.besiegerHit(actor, {}, data);
  assert.equal(plan.reading, "godpiercerMitigation");
  const expected = {
    currentHP: { bypassDR: true, bypassResistance: true, bypassTemp: true },
    temporaryHP: { bypassDR: true, bypassResistance: true, bypassTemp: false },
    ordinaryMitigation: { bypassDR: false, bypassResistance: false, bypassTemp: false }
  };
  for (const [reading, policy] of Object.entries(expected)) {
    const receipt = { id: `godpiercer-${reading}` };
    plan.apply({}, receipt, { value: reading });
    assert.deepEqual(receipt.resolution.steps[0].hpLossPolicy, policy);
  }
  assert.equal(plan.reading, "godpiercerMitigation", "the resolver must ask for the reading on each use");
  const ordinaryReceipt = { id: "ordinary" };
  plan.apply({}, ordinaryReceipt, { value: "ordinaryMitigation" });
  assert.equal(ordinaryReceipt.resolution.steps[0].amount, 8);
});

