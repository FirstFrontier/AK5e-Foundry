import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isReaper,
  getRuin,
  getReaperTableEntry,
  getReaperHealingPenalty,
  getReapCritThreshold,
  getCurtainfallCritThreshold,
  calculateSwarmKills,
  reaperPreApplyDamageHook,
  registerReaperHooks
} from "../scripts/reaper-features.mjs";
import { registerGuardFeatureHooks } from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { getPool } from "../scripts/resource-pools.mjs";

function setupWorld(combat = null) {
  const documents = world(combat);
  registerGuardFeatureHooks();
  registerReaperHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "reap-1") =>
  guardUses.command(actor, command, { confirmed: true, ...data }, id);

async function anyway(actor, command, data = {}, id = "reap-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Reaper identification", () => {
  setupWorld();
  const reaper = guardFixture({ level: 5, branch: "reaper" });
  assert.equal(isReaper(reaper), true);

  const centurion = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isReaper(centurion), false);

  const unconfigured = guardFixture({ level: 5, branch: null, enabled: false });
  assert.equal(isReaper(unconfigured), false);
});

test("Reaper Table: crit ranges, healing penalties, and unlocked effects", () => {
  setupWorld();
  const e0 = getReaperTableEntry(0);
  assert.equal(e0.reapCritBonus, 10);
  assert.equal(e0.curtainfallCritBonus, 0);
  assert.equal(e0.healingPenalty, 0);

  const e2 = getReaperTableEntry(2);
  assert.equal(e2.reapCritBonus, 8);
  assert.equal(e2.curtainfallCritBonus, 2);
  assert.equal(e2.healingPenalty, 4);
  assert.match(e2.effect, /Reroll 1s/);

  const e4 = getReaperTableEntry(4);
  assert.match(e4.effect, /does not provoke Opportunity Attacks/);

  const e6 = getReaperTableEntry(6);
  assert.match(e6.effect, /move through space of hostile creatures/);

  const e8 = getReaperTableEntry(8);
  assert.match(e8.effect, /roll an additional time/);

  const e10 = getReaperTableEntry(10);
  assert.equal(e10.reapCritBonus, 0);
  assert.equal(e10.curtainfallCritBonus, 10);
  assert.equal(e10.healingPenalty, 20);
  assert.match(e10.effect, /kill/);
});

test("Ruin pool: gain, decay, and Lingering Violence", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "reaper" });
  assert.equal(getRuin(actor), 0);

  // Gain 3 Ruin
  const gRes = await use(actor, "reaperGainRuin", { amount: 3, reason: "Crit" }, "ruin-1");
  assert.equal(gRes.amount, 3);
  assert.equal(gRes.newRuin, 3);
  assert.equal(getRuin(actor), 3);
  assert.equal(getReaperHealingPenalty(actor), 6);

  // Decay 1 Ruin
  const dRes = await use(actor, "reaperDecayRuin", {}, "ruin-2");
  assert.equal(dRes.newRuin, 2);
  assert.equal(getRuin(actor), 2);

  // Lingering Violence: spend 1 Aggression to prevent decay
  const lvRes = await use(actor, "reaperLingeringViolence", {}, "ruin-3");
  assert.equal(lvRes.aggressionSpent, 1);
  assert.equal(lvRes.ruin, 2);
  assert.equal(getRuin(actor), 2);
});

test("Death's Design: Reap (cone vs sphere at 13th) and crit scaling", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "reaper" });
  // Set Ruin to 2 -> Reap crit bonus +8 -> crit on 20 - 8 = 12+
  await use(actor, "reaperGainRuin", { amount: 2 }, "r-set");
  assert.equal(getReapCritThreshold(actor), 12);

  const reapRes = await use(actor, "reaperReap", { weaponName: "Scythe" }, "reap-1");
  assert.equal(reapRes.critThreshold, 12);
  assert.equal(reapRes.area, "15-foot cone");
  assert.equal(reapRes.isPrime, false);

  // Level 13 Reaper Prime: 10-ft sphere option and full damage
  const prime = guardFixture({ level: 13, branch: "reaper" });
  const primeRes = await use(prime, "reaperReap", { areaSphere: true }, "reap-2");
  assert.equal(primeRes.area, "10-foot sphere");
  assert.equal(primeRes.isPrime, true);
});

test("Death's Design: Curtainfall expends all Ruin and computes bonus dice", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "reaper" });
  await use(actor, "reaperGainRuin", { amount: 4 }, "r-set-4");
  assert.equal(getRuin(actor), 4);
  assert.equal(getCurtainfallCritThreshold(actor), 16); // 20 - 4 = 16

  const cRes = await use(actor, "reaperCurtainfall", { targetName: "Boss Monster" }, "curtain-1");
  assert.equal(cRes.ruinSpent, 4);
  assert.equal(cRes.bonusDice, "4d6");
  assert.equal(cRes.critThreshold, 16);
  assert.equal(getRuin(actor), 0); // All expended!
});

test("Fear the Reaper (10th level) and Memento Mori (17th level)", async () => {
  setupWorld();
  const actor10 = guardFixture({ level: 10, branch: "reaper" });
  assert.equal(getPool(actor10, "fearTheReaper").value, 1);

  const fRes = await use(actor10, "reaperFearTheReaper", { targetName: "Target Fiend" }, "fear-1");
  assert.equal(fRes.targetName, "Target Fiend");
  assert.equal(getPool(actor10, "fearTheReaper").value, 0);
  assert.equal(actor10.flags.ak5e.reaper.reaperMarkTarget, "Target Fiend");

  // Memento Mori at 17th level
  const actor17 = guardFixture({ level: 17, branch: "reaper" });
  const mRes = await use(actor17, "reaperMementoMori", { mode: "vulnerability" }, "mm-1");
  assert.equal(mRes.mode, "vulnerability");

  const mRes2 = await use(actor17, "reaperMementoMori", { mode: "splash" }, "mm-2");
  assert.equal(mRes2.mode, "splash");
});

test("Reaper encounter-window undo", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "reaper" });
  assert.equal(getRuin(actor), 0);

  await use(actor, "reaperGainRuin", { amount: 5 }, "ruin-undo-1");
  assert.equal(getRuin(actor), 5);

  await use(actor, "undoUse", { useId: "ruin-undo-1" });
  assert.equal(getRuin(actor), 0);
});

test("Reaper Table: Healing penalty hook and floor at zero", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "reaper" });
  actor.system.attributes.hp = { value: 20, max: 50 };

  // Set Ruin to 4 -> penalty = 8
  await use(actor, "reaperGainRuin", { amount: 4 }, "r-pen-1");
  assert.equal(getReaperHealingPenalty(actor), 8);

  // Incoming heal 20 -> net heal 20 - 8 = 12
  const updates1 = { "system.attributes.hp.value": 40 };
  reaperPreApplyDamageHook(actor, -20, updates1, { source: "ally" });
  assert.equal(updates1["system.attributes.hp.value"], 32); // 20 + 12 = 32

  // Incoming heal 5 (less than penalty 8) -> net heal floored at 0 (does not hurt actor!)
  const updates2 = { "system.attributes.hp.value": 25 };
  reaperPreApplyDamageHook(actor, -5, updates2, { source: "ally" });
  assert.equal(updates2["system.attributes.hp.value"], 20); // 20 + 0 = 20
});

test("Reaper and Hordes: calculateSwarmKills threshold helper", () => {
  // Swarm unit max HP 10
  assert.equal(calculateSwarmKills(25, 10), 2);
  assert.equal(calculateSwarmKills(42, 10), 4);
  assert.equal(calculateSwarmKills(9, 10), 0);

  // Swarm unit max HP 15
  assert.equal(calculateSwarmKills(45, 15), 3);
  assert.equal(calculateSwarmKills(14, 15), 0);

  // Edge cases
  assert.equal(calculateSwarmKills(0, 10), 0);
  assert.equal(calculateSwarmKills(10, 0), 0);
});

