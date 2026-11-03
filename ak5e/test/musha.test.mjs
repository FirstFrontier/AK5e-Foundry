import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isMusha,
  getNothingToLoseAttacks,
  solobladeFormula,
  livingOnTheEdgeBonus,
  getNotYetDC,
  mushaPreApplyDamageHook,
  registerMushaHooks
} from "../scripts/musha-features.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

function setupWorld(combat = null) {
  const documents = world(combat);
  registerGuardFeatureHooks();
  registerMushaHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "musha-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

async function anyway(actor, command, data = {}, id = "musha-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Musha identification", () => {
  setupWorld();
  const musha = guardFixture({ level: 5, branch: "musha" });
  assert.equal(isMusha(musha), true);

  const centurion = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isMusha(centurion), false);

  const unconfigured = guardFixture({ level: 5, branch: null, enabled: false });
  assert.equal(isMusha(unconfigured), false);
});

test("Nothing to Lose: bonus melee attacks based on HP thresholds", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "musha" });
  actor.system.attributes.hp = { value: 100, max: 100 };
  assert.equal(getNothingToLoseAttacks(actor), 0);

  actor.system.attributes.hp.value = 50;
  assert.equal(getNothingToLoseAttacks(actor), 1);

  actor.system.attributes.hp.value = 25;
  assert.equal(getNothingToLoseAttacks(actor), 1);

  actor.system.attributes.hp.value = 10;
  assert.equal(getNothingToLoseAttacks(actor), 2);

  actor.system.attributes.hp.value = 5;
  assert.equal(getNothingToLoseAttacks(actor), 2);
});

test("Soloblade: healing scaling and plan execution without auto-rolling", async () => {
  setupWorld();
  const actorLvl1 = guardFixture({ level: 1, branch: "musha" });
  assert.equal(solobladeFormula(actorLvl1), "2d6");

  const actorLvl7 = guardFixture({ level: 7, branch: "musha" });
  assert.equal(solobladeFormula(actorLvl7), "2d8");

  const actorLvl14 = guardFixture({ level: 14, branch: "musha" });
  assert.equal(solobladeFormula(actorLvl14), "2d10");

  const result = await use(actorLvl7, "mushaSoloblade", { targetName: "Enemy Soldier" }, "solo-1");
  assert.equal(result.formula, "2d8");
  assert.equal(result.targetName, "Enemy Soldier");
});

test("Not Yet: escalating Wisdom save DC and reset", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "musha" });
  assert.equal(getNotYetDC(actor), 10);

  // First use: DC 10, escalates to 15
  const res1 = await use(actor, "mushaNotYet", {}, "ny-1");
  assert.equal(res1.previousDc, 10);
  assert.equal(res1.newDc, 15);
  assert.equal(getNotYetDC(actor), 15);

  // Second use: DC 15, escalates to 20
  const res2 = await use(actor, "mushaNotYet", {}, "ny-2");
  assert.equal(res2.previousDc, 15);
  assert.equal(res2.newDc, 20);
  assert.equal(getNotYetDC(actor), 20);

  // Reset Not Yet DC back to 10
  const resetRes = await use(actor, "mushaResetNotYet", {}, "ny-reset");
  assert.equal(resetRes.reset, true);
  assert.equal(getNotYetDC(actor), 10);
});

test("Blood Price: 4 options, unreducible self-damage, and Greater Blood Price", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "musha" });
  actor.system.attributes.hp = { value: 30, max: 40 };

  // Center Oneself
  const centerRes = await use(actor, "mushaBloodPrice", { option: "centerOneself" }, "bp-1");
  assert.equal(centerRes.option, "centerOneself");
  assert.equal(centerRes.formula, "2d8");

  // Dig Deep
  const digRes = await use(actor, "mushaBloodPrice", { option: "digDeep" }, "bp-2");
  assert.equal(digRes.option, "digDeep");

  // Iai
  const iaiRes = await use(actor, "mushaBloodPrice", { option: "iai" }, "bp-3");
  assert.equal(iaiRes.option, "iai");

  // Ichimonji
  const ichiRes = await use(actor, "mushaBloodPrice", { option: "ichimonji" }, "bp-4");
  assert.equal(ichiRes.option, "ichimonji");

  // Greater Blood Price at 13th level
  const actor13 = guardFixture({ level: 13, branch: "musha" });
  actor13.system.attributes.hp = { value: 60, max: 80 };
  const gbpRes = await use(actor13, "mushaBloodPrice", { option: "iai", greaterBloodPrice: true }, "bp-5");
  assert.equal(gbpRes.formula, "4d8");
  assert.equal(gbpRes.isGreater, true);
});

test("Warrior Spirit: Go Forth and Retaliator", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "musha" });

  // Go Forth spends reaction
  const gfRes = await use(actor, "mushaGoForth", { attackerName: "Archer" }, "gf-1");
  assert.equal(gfRes.attackerName, "Archer");
  assert.equal(gfRes.reactionSpent, true);

  // Retaliator spends 2 Aggression
  const retRes = await use(actor, "mushaRetaliator", { mode: "iai" }, "ret-1");
  assert.equal(retRes.mode, "iai");
  assert.equal(retRes.aggressionSpent, 2);
});

test("Living on the Edge (13th level): AC and saving throw bonuses", () => {
  setupWorld();
  const actor = guardFixture({ level: 13, branch: "musha" });
  actor.system.attributes.prof = 5;
  actor.system.attributes.hp = { value: 100, max: 100 };
  assert.equal(livingOnTheEdgeBonus(actor), 0);

  actor.system.attributes.hp.value = 50;
  // ceil(5 / 2) = 3
  assert.equal(livingOnTheEdgeBonus(actor), 3);

  actor.system.attributes.hp.value = 10;
  // pb = 5
  assert.equal(livingOnTheEdgeBonus(actor), 5);

  // Level below 13 grants 0
  const actorLvl5 = guardFixture({ level: 5, branch: "musha" });
  actorLvl5.system.attributes.hp = { value: 5, max: 50 };
  assert.equal(livingOnTheEdgeBonus(actorLvl5), 0);
});

test("Musha encounter-window undo", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "musha" });
  assert.equal(getNotYetDC(actor), 10);

  await use(actor, "mushaNotYet", {}, "undo-ny-1");
  assert.equal(getNotYetDC(actor), 15);

  // Undo the use
  await use(actor, "undoUse", { useId: "undo-ny-1" });
  assert.equal(getNotYetDC(actor), 10);
});

test("Stand Alone: outside healing converted to Temporary HP", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "musha" });
  actor.system.attributes.hp = { value: 20, max: 50, temp: 0 };

  // Outside healing (amount < 0, source not self)
  const outsideUpdates = { "system.attributes.hp.value": 35 };
  mushaPreApplyDamageHook(actor, -15, outsideUpdates, { source: "ally-cleric" });
  assert.equal(outsideUpdates["system.attributes.hp.value"], 20); // HP not restored
  assert.equal(outsideUpdates["system.attributes.hp.temp"], 15); // Converted to Temp HP!

  // Self-healing (e.g. Soloblade / ak5eSelfHeal) restores HP normally
  const selfUpdates = { "system.attributes.hp.value": 30 };
  mushaPreApplyDamageHook(actor, -10, selfUpdates, { ak5eSelfHeal: true, source: actor.id });
  assert.equal(selfUpdates["system.attributes.hp.value"], 30); // HP restored normally!
});

test("Not Yet: outright kill protection gated at 17th level (To Laugh at Death)", async () => {
  setupWorld();
  const actorLvl5 = guardFixture({ level: 5, branch: "musha" });
  // Level 5 warns on outright kill
  await assert.rejects(
    async () => use(actorLvl5, "mushaNotYet", { outrightKill: true }, "ok-1"),
    err => err.name === "AK5eWarnings" && err.warnings.some(w => w.id === "outrightKill")
  );

  // Level 17 succeeds with outright kill protection
  const actorLvl17 = guardFixture({ level: 17, branch: "musha" });
  actorLvl17.system.attributes.prof = 6;
  const res17 = await use(actorLvl17, "mushaNotYet", { outrightKill: true }, "ok-2");
  assert.equal(res17.outrightKill, true);
  assert.equal(res17.surviveHp, 12); // 2 * PB (PB 6)
});

