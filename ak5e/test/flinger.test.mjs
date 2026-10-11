import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFlinger, boundWeaponsList, defineFlingerPools,
  FLINGER_PLANS
} from "../scripts/flinger-features.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

test("Flinger identification and resource pools", () => {
  defineFlingerPools();

  const actor = {
    uuid: "Actor.flinger1",
    system: {
      attributes: { prof: 4 },
      abilities: { int: { mod: 4 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 10 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        name: "Flinger",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-flinger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          flingerAbility: "int"
        }
      }
    }
  };

  assert.equal(isFlinger(actor), true);

  const ap = getPool(actor, "flingerArtsPoints");
  assert.equal(ap.max, 7); // Level 10 has 7 AP
  assert.equal(ap.value, 7);

  const ks = getPool(actor, "kineticStrike");
  assert.equal(ks.max, 1);
  assert.equal(ks.value, 1);
});

test("Weapon Binding respects level capacity and handles unbind/recall", () => {
  const actor = {
    uuid: "Actor.flinger2",
    name: "Rosmontis",
    system: { attributes: { prof: 3 } },
    items: [
      {
        type: "class",
        system: { levels: 5 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-flinger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, boundWeapons: [] }
      }
    }
  };

  // Level 5 allows 2 bound weapons
  const bind1 = FLINGER_PLANS.bindWeapon(actor, {}, { weaponId: "w1", weaponName: "Greatsword 1" });
  assert.equal(bind1.warnings.length, 0);
  const rcpt1 = { id: "rcpt-b1" };
  const u1 = bind1.apply({}, rcpt1);
  actor.flags.ak5e.marksman.boundWeapons = u1["flags.ak5e.marksman.boundWeapons"];
  assert.equal(actor.flags.ak5e.marksman.boundWeapons.length, 1);

  const bind2 = FLINGER_PLANS.bindWeapon(actor, {}, { weaponId: "w2", weaponName: "Greatsword 2" });
  assert.equal(bind2.warnings.length, 0);
  const rcpt2 = { id: "rcpt-b2" };
  const u2 = bind2.apply({}, rcpt2);
  actor.flags.ak5e.marksman.boundWeapons = u2["flags.ak5e.marksman.boundWeapons"];
  assert.equal(actor.flags.ak5e.marksman.boundWeapons.length, 2);

  // Third weapon warns on capacity (limit 2 at lvl 5)
  const bind3 = FLINGER_PLANS.bindWeapon(actor, {}, { weaponId: "w3", weaponName: "Greatsword 3" });
  assert.equal(bind3.warnings.length, 1);
  assert.equal(bind3.warnings[0].id, "boundCapacity");

  // Recall
  const recall = FLINGER_PLANS.recallBoundWeapons(actor, {}, {});
  const rcptRecall = { id: "rcpt-rec" };
  recall.apply({}, rcptRecall);
  assert.equal(rcptRecall.result.recalledCount, 2);

  // Unbind
  const unbind = FLINGER_PLANS.unbindWeapon(actor, {}, { weaponId: "w1" });
  const rcptUnbind = { id: "rcpt-unb" };
  const uUnb = unbind.apply({}, rcptUnbind);
  assert.equal(uUnb["flags.ak5e.marksman.boundWeapons"].length, 1);
  assert.equal(uUnb["flags.ak5e.marksman.boundWeapons"][0].id, "w2");
});

test("Manipulation Arts spends AP with self/target discount", () => {
  defineFlingerPools();

  const actor = {
    uuid: "Actor.flinger3",
    name: "Greyy",
    system: { attributes: { prof: 2 }, abilities: { int: { mod: 3 } } },
    items: [
      {
        type: "class",
        system: { levels: 3 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-flinger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: { enabled: true, flingerAbility: "int" },
        pools: { flingerArtsPoints: { value: 3 } }
      }
    }
  };

  // Standard cast of 2 AP art
  const planStandard = FLINGER_PLANS.spendArtsPoints(actor, {}, { artName: "Thunderwave", baseCost: 2, isSelfOrTarget: false });
  assert.equal(planStandard.warnings.length, 0);
  const rcptStandard = { id: "rcpt-ap-std" };
  planStandard.apply({}, rcptStandard);
  assert.equal(rcptStandard.result.finalCost, 2);

  // Discounted cast on self / Target Lock (1 AP discount -> costs 1 AP)
  const planDiscount = FLINGER_PLANS.spendArtsPoints(actor, {}, { artName: "Mage Armour", baseCost: 2, isSelfOrTarget: true });
  const rcptDiscount = { id: "rcpt-ap-disc" };
  planDiscount.apply({}, rcptDiscount);
  assert.equal(rcptDiscount.result.finalCost, 1);

  // 1 AP base on self -> costs 0 AP!
  const planFree = FLINGER_PLANS.spendArtsPoints(actor, {}, { artName: "Shield", baseCost: 1, isSelfOrTarget: true });
  const rcptFree = { id: "rcpt-ap-free" };
  planFree.apply({}, rcptFree);
  assert.equal(rcptFree.result.finalCost, 0);
});

test("Command Bound Weapons calculates Aftershock and Pass-through Strike", () => {
  // Level 15 actor with 3 bound weapons
  const actor = {
    uuid: "Actor.flinger4",
    name: "Rosmontis Elite 2",
    system: {
      attributes: { prof: 5 },
      abilities: { int: { mod: 5 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 15 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-flinger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          flingerAbility: "int",
          boundWeapons: [
            { id: "w1", name: "Kinetic Shield 1" },
            { id: "w2", name: "Kinetic Shield 2" },
            { id: "w3", name: "Kinetic Shield 3" }
          ]
        }
      }
    }
  };

  const plan = FLINGER_PLANS.commandBoundWeapons(actor, {}, {});
  assert.equal(plan.warnings.length, 0);
  const rcpt = { id: "rcpt-cmd" };
  plan.apply({}, rcpt);

  assert.equal(rcpt.result.commandedCount, 3);
  assert.equal(rcpt.result.spellMod, 5);
  assert.equal(rcpt.result.aftershockDamage, 5); // 4th level Aftershock: INT mod thunder
  assert.equal(rcpt.result.passThroughDamage, 5); // 15th level Pass-through: INT mod piercing
});

test("Kinetic Strike and Whirling Death plans calculate DCs and dice formulas", () => {
  defineFlingerPools();

  const actor = {
    uuid: "Actor.flinger5",
    name: "Wiš'adel",
    system: {
      attributes: { prof: 6 },
      abilities: { int: { mod: 5 } }
    },
    items: [
      {
        type: "class",
        system: { levels: 18 },
        flags: { ak5e: { chapterThreeId: "class-marksman" } }
      },
      {
        type: "subclass",
        flags: { ak5e: { chapterThreeId: "subclass-marksman-flinger" } }
      }
    ],
    flags: {
      ak5e: {
        marksman: {
          enabled: true,
          flingerAbility: "int",
          boundWeapons: [
            { id: "w1", name: "Staff 1" },
            { id: "w2", name: "Staff 2" },
            { id: "w3", name: "Staff 3" }
          ]
        },
        pools: {
          kineticStrike: { value: 1 },
          whirlingDeath: { value: 1 }
        }
      }
    }
  };

  // Kinetic Strike: 4d8 per bound weapon (3 * 4 = 12d8)
  const ksPlan = FLINGER_PLANS.kineticStrike(actor, {}, { targetName: "Patriot" });
  assert.equal(ksPlan.warnings.length, 0);
  const ksRcpt = { id: "rcpt-ks" };
  ksPlan.apply({}, ksRcpt);
  assert.equal(ksRcpt.result.dc, 8 + 6 + 5); // 19
  assert.equal(ksRcpt.result.damageFormula, "12d8");
  assert.equal(ksRcpt.result.weaponCount, 3);

  // Whirling Death: 50 ft sphere, 8d8 slashing
  const wdPlan = FLINGER_PLANS.whirlingDeath(actor, {}, {});
  assert.equal(wdPlan.warnings.length, 0);
  const wdRcpt = { id: "rcpt-wd" };
  const wdUpdates = wdPlan.apply({}, wdRcpt);
  assert.equal(wdRcpt.result.dc, 19);
  assert.equal(wdRcpt.result.damageFormula, "8d8");
  assert.equal(wdRcpt.result.radiusFt, 50);
  assert.equal(wdUpdates["flags.ak5e.marksman.whirlingDeathActive"], true);
});
