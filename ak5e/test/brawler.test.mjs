import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isBrawler, defineBrawlerPools, artOfTheFistDie, bobAndWeaveAC, isUnarmoredOrLight,
  registerBrawlerHooks, brawlerPreRollAttack, brawlerPreRollDamage
} from "../scripts/brawler-features.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { martialDC } from "../scripts/guard-rules.mjs";
import { getPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

function setupWorld() {
  const documents = world();
  registerGuardFeatureHooks();
  registerBrawlerHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "brawl-1") => guardUses.command(actor, command, { confirmed: true, ...data }, id);

test("Brawler identification and formula scaling", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "brawler" });
  assert.equal(isBrawler(actor), true);

  // Art of the Fist damage die scaling: 1d4 (1st), 1d6 (7th), 1d8 (14th)
  assert.equal(artOfTheFistDie(1), "1d4");
  assert.equal(artOfTheFistDie(6), "1d4");
  assert.equal(artOfTheFistDie(7), "1d6");
  assert.equal(artOfTheFistDie(13), "1d6");
  assert.equal(artOfTheFistDie(14), "1d8");
  assert.equal(artOfTheFistDie(20), "1d8");

  // Bob and Weave base AC: 10 + STR (4) + DEX (2) = 16
  assert.equal(bobAndWeaveAC(actor), 16);
  assert.equal(isUnarmoredOrLight(actor), true);
});

test("Basic Brawling Techniques spend Aggression correctly", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "brawler" });

  // Body Check (1 Agg)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resBody = await use(actor, "bodyCheck", {}, "bc-1");
  assert.equal(resBody.aggressionSpent, 1);
  assert.equal(resBody.doubledShove, true);

  // Cross Counter (1 Agg, Reaction, +PB AC)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resCross = await use(actor, "crossCounter", {}, "cc-1");
  assert.equal(resCross.aggressionSpent, 1);
  assert.equal(resCross.acBonus, 3); // level 5 PB

  // Feint (1 Agg, Advantage)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resFeint = await use(actor, "feint", { targetUuid: "Actor.foe1" }, "ft-1");
  assert.equal(resFeint.aggressionSpent, 1);
  assert.equal(resFeint.advantage, true);

  // Follow Up (1 Agg)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resFollow = await use(actor, "followUp", {}, "fu-1");
  assert.equal(resFollow.aggressionSpent, 1);
  assert.equal(resFollow.extraStrike, true);

  // Footwork (1 Agg, Half Movement)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resFoot = await use(actor, "footwork", {}, "fw-1");
  assert.equal(resFoot.aggressionSpent, 1);
  assert.equal(resFoot.moveDistance, 15); // half of 30 walk speed

  // Guard Up (1 Agg, Dodge)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resGuard = await use(actor, "guardUp", {}, "gu-1");
  assert.equal(resGuard.aggressionSpent, 1);
  assert.equal(resGuard.dodge, true);

  // Slip Off (2 Agg, Reaction, Halve Damage)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  delete actor.flags.ak5e.reactionBudget;
  const resSlip = await use(actor, "slipOff", {}, "so-1");
  assert.equal(resSlip.aggressionSpent, 2);
  assert.equal(resSlip.halveDamage, true);

  // Tag In (2 Agg, Position Swap)
  actor.flags.ak5e.resourcePools.aggression.value = 4;
  const resTag = await use(actor, "tagIn", { allyUuid: "Actor.ally1" }, "ti-1");
  assert.equal(resTag.aggressionSpent, 2);
  assert.equal(resTag.positionSwap, true);
});

test("Advanced Brawling Techniques enforce 10th level and spend Aggression", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "brawler" });

  // Chokehold (2 Agg, Ability Score HP loss)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resChoke = await use(actor, "chokehold", { ability: "str" }, "ch-1");
  assert.equal(resChoke.aggressionSpent, 2);
  assert.equal(resChoke.hpLoss, 18); // STR score = 18

  // CQC (2 Agg, Grapple Attempt)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resCQC = await use(actor, "cqc", {}, "cqc-1");
  assert.equal(resCQC.aggressionSpent, 2);
  assert.equal(resCQC.grappleAttempt, true);

  // Disarm (3 Agg, Martial DC)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resDisarm = await use(actor, "disarm", {}, "da-1");
  assert.equal(resDisarm.aggressionSpent, 3);
  assert.equal(resDisarm.martialDC, martialDC(actor));

  // Human Shield (2 Agg, Three-Quarters Cover)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resShield = await use(actor, "humanShield", {}, "hs-1");
  assert.equal(resShield.aggressionSpent, 2);
  assert.equal(resShield.cover, "threeQuarters");

  // Menace (2 Agg, Frightened WIS save)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resMenace = await use(actor, "menace", {}, "mn-1");
  assert.equal(resMenace.aggressionSpent, 2);
  assert.equal(resMenace.frightened, true);

  // Skullshaker (2 Agg, Double Damage + Dazed)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resSkull = await use(actor, "skullshaker", {}, "sk-1");
  assert.equal(resSkull.aggressionSpent, 2);
  assert.equal(resSkull.doubleDamage, true);
  assert.equal(resSkull.dazed, true);

  // Weigh In (2 Agg, Disadvantage vs Others)
  actor.flags.ak5e.resourcePools.aggression.value = 6;
  const resWeigh = await use(actor, "weighIn", {}, "wi-1");
  assert.equal(resWeigh.aggressionSpent, 2);
  assert.equal(resWeigh.martialDC, martialDC(actor));
});

test("Always Ready regains 1 Aggression at start of turn in combat for level 10+ Brawler", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "brawler", aggression: 4 });
  globalThis.game.combat = { started: true };

  await emitAk5eEvent("turnStart", { raw: { actor } });

  const agg = getPool(actor, "aggression");
  assert.equal(agg.value, 5); // 4 + 1 = 5
});

test("Mountainbreaker (17th level) spends pool and configures flurry or knockout", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "brawler" });
  actor.flags.ak5e.resourcePools.mountainbreaker = { value: 1, max: 1 };

  // Mode 1: Flurry
  const resFlurry = await use(actor, "mountainbreaker", { mode: "flurry" }, "mb-1");
  assert.equal(resFlurry.mode, "flurry");
  assert.equal(resFlurry.useSpent, 1);

  // Mode 2: Knockout
  actor.flags.ak5e.resourcePools.mountainbreaker = { value: 1, max: 1 };
  const resKO = await use(actor, "mountainbreaker", { mode: "knockout" }, "mb-2");
  assert.equal(resKO.mode, "knockout");
  assert.equal(resKO.useSpent, 1);
});

test("Roll hooks apply Dexterous attacks and Kick them while they're Down", () => {
  const documents = setupWorld();
  const actor = guardFixture({ level: 13, branch: "brawler" });
  actor.system.abilities.str.mod = 2;
  actor.system.abilities.dex.mod = 4;
  actor.system.attributes.prof = 5;

  const foe = {
    uuid: "Actor.foeProne",
    id: "foeProne",
    name: "Prone Target",
    statuses: new Set(["prone"]),
    flags: { ak5e: {} }
  };
  documents.set(foe.uuid, foe);
  globalThis.game.user.targets = new Set([{ actor: foe }]);

  // Dexterous Attacks (+2 to attack if DEX > STR)
  const unarmedItem = { name: "Unarmed Strike", system: { properties: new Set(["unarmed"]) } };
  const atkConfig = { subject: { actor, actionType: "mwak", item: unarmedItem }, rolls: [{ parts: ["1d20", "2"] }] };
  brawlerPreRollAttack(atkConfig);
  assert.ok(atkConfig.rolls[0].parts.includes("2")); // diff between dex(4) and str(2)

  // Kick them while they're Down (+PB 5 to damage against Prone foe)
  const dmgConfig = { subject: { actor, actionType: "mwak", item: unarmedItem }, rolls: [{ parts: ["1d6", "4"] }] };
  brawlerPreRollDamage(dmgConfig);
  assert.ok(dmgConfig.rolls[0].parts.includes("5")); // PB is 5
});
