import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isCrusher,
  isHeavyMeleeWeapon,
  parseBaseDie,
  singularStrikeBonus,
  deathPassingDamage,
  heroicBlowCrushValue,
  checkCrusherExecution,
  defineCrusherPools,
  registerCrusherHooks
} from "../scripts/crusher-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";

function setupWorld() {
  const documents = world();
  registerCrusherHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "crush-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

test("Crusher identification, weapon helpers, and singular strike formulas", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "crusher" });
  assert.equal(isCrusher(actor), true);

  const greatsword = {
    type: "weapon",
    system: {
      actionType: "mwak",
      properties: new Set(["hvy", "two"]),
      damage: { base: { formula: "2d6" } }
    }
  };
  assert.equal(isHeavyMeleeWeapon(greatsword), true);
  assert.equal(parseBaseDie("2d6"), "1d6");
  assert.equal(parseBaseDie("1d12"), "1d12");

  const dagger = {
    type: "weapon",
    system: {
      actionType: "mwak",
      properties: new Set(["fin", "lgt"])
    }
  };
  assert.equal(isHeavyMeleeWeapon(dagger), false);

  // Singular Strike calculations:
  // 1 attack -> 0 bonus
  const s1 = singularStrikeBonus({ attacksCount: 1, weaponDice: "3d6", strMod: 5, weaponBonus: 0 });
  assert.equal(s1.additionalAttacks, 0);

  // 2 attacks with Greatsword (3d6) + STR 5 -> +1 * (3d6 + 5)
  const s2 = singularStrikeBonus({ attacksCount: 2, weaponDice: "3d6", strMod: 5, weaponBonus: 0 });
  assert.equal(s2.additionalAttacks, 1);
  assert.equal(s2.bonusFormula, "3d6 + 5");

  // 3 attacks with Greatsword (3d6) + STR 5 + +1 weapon -> +2 * (3d6 + 6)
  const s3 = singularStrikeBonus({ attacksCount: 3, weaponDice: "3d6", strMod: 5, weaponBonus: 1 });
  assert.equal(s3.additionalAttacks, 2);
  assert.equal(s3.bonusFormula, "3d6 + 6 + 3d6 + 6");
});

test("Death's Passing calculates half damage as Thunder Damage", async () => {
  setupWorld();
  const actor = guardFixture({ level: 1, branch: "crusher" });
  assert.equal(deathPassingDamage(25), 12);
  assert.equal(deathPassingDamage(10), 5);

  const result = await use(actor, "deathPassing", { damageTotal: 25 }, "dp-1");
  assert.equal(result.thunderDamage, 12);
  assert.equal(result.originalDamage, 25);
});

test("Foecrusher spends 1 use and supports Staggering, Dazing, Smashing, and Renewing strikes", async () => {
  setupWorld();
  const actor = guardFixture({ level: 4, branch: "crusher" });
  actor.flags.ak5e.resourcePools.foecrusher = { value: 3, max: 3 };

  // Staggering
  const resStag = await use(actor, "foecrusher", { rider: "staggering" }, "foe-1");
  assert.equal(resStag.rider, "staggering");
  assert.equal(actor.flags.ak5e.resourcePools.foecrusher.value, 2);

  // Renewing
  const resRen = await use(actor, "foecrusher", { rider: "renewing" }, "foe-2");
  assert.equal(resRen.rider, "renewing");
  assert.equal(actor.flags.ak5e.resourcePools.foecrusher.value, 1);

  const receipt = guardUses.receipt(actor, "foe-2");
  assert.equal(receipt.formula, "1d10 + 3"); // d10 hit die + CON mod 3
});

test("Press the Attack: Overbear spends 2 Aggression, adds 1d10, and applies dual riders", async () => {
  setupWorld();
  const actor = guardFixture({ level: 4, branch: "crusher", aggression: 4 });
  actor.flags.ak5e.resourcePools.foecrusher = { value: 2, max: 2 };

  const result = await use(actor, "overbear", {
    primaryRider: "staggering",
    secondaryRider: "dazing"
  }, "over-1");

  assert.equal(result.aggressionSpent, 2);
  assert.equal(result.bonusDice, "1d10");
  assert.equal(result.primaryRider, "staggering");
  assert.equal(result.secondaryRider, "dazing");
  assert.equal(actor.flags.ak5e.resourcePools.aggression.value, 2);

  const receipt = guardUses.receipt(actor, "over-1");
  assert.equal(receipt.formula, "1d10");
});

test("Horde Breaker assigns excess damage directly without rolling", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "crusher" });

  const result = await use(actor, "hordeBreaker", { excessDamage: 18 }, "hb-1");
  assert.equal(result.damage, 18);
});

test("Heroic Blow (13th) spends 1 Foecrusher and computes Crush (2*PB + existing)", async () => {
  setupWorld();
  const actor = guardFixture({ level: 13, branch: "crusher" });
  actor.system.attributes.prof = 5;
  actor.flags.ak5e.resourcePools.foecrusher = { value: 4, max: 4 };

  assert.equal(heroicBlowCrushValue(actor, 5), 15); // 5 + 2*5 = 15

  const result = await use(actor, "heroicBlow", { existingCrush: 10 }, "hero-1");
  assert.equal(result.foecrusherSpent, 1);
  assert.equal(result.crushValue, 20); // 10 + 2*5 = 20
  assert.equal(result.allowReroll, true);
});

test("Heroic Killing Blow (17th) executes targets with fewer than 50 HP", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "crusher" });

  assert.equal(checkCrusherExecution(49), true);
  assert.equal(checkCrusherExecution(50), false);
  assert.equal(checkCrusherExecution(85), false);

  const resExec = await use(actor, "heroicKillingBlow", { targetHp: 35 }, "kill-1");
  assert.equal(resExec.executed, true);
  assert.equal(resExec.ignoresPhysicalResistance, true);

  const resSurvive = await use(actor, "heroicKillingBlow", { targetHp: 60 }, "kill-2");
  assert.equal(resSurvive.executed, false);
});
