import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  defineGuardPools, aggression, spendAggression, refundAggression,
  unrelenting, spendUnrelenting, refundUnrelenting, getGuardView,
  registerGuardFeatureHooks
} from "../scripts/guard-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";

function setupWorld() {
  const documents = world();
  registerGuardFeatureHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "use-1") => guardUses.command(actor, command, { confirmed: true, ...data }, id);

async function anyway(actor, command, data = {}, id = "use-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Aggression pool spends and refunds correctly", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, aggression: 4 });
  assert.equal(aggression(actor).value, 4);

  const spent = await spendAggression(actor, 2, "Test spend");
  assert.equal(spent.after, 2);
  assert.equal(aggression(actor).value, 2);

  const refunded = await refundAggression(actor, 1, "Test refund");
  assert.equal(refunded.after, 3);
  assert.equal(aggression(actor).value, 3);
});

test("Unrelenting pool spends and refunds correctly", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, unrelenting: 1 });
  assert.equal(unrelenting(actor).value, 1);

  const spent = await spendUnrelenting(actor, 1, "Test spend");
  assert.equal(spent.after, 0);
  assert.equal(unrelenting(actor).value, 0);

  const refunded = await refundUnrelenting(actor, 1, "Test refund");
  assert.equal(refunded.after, 1);
  assert.equal(unrelenting(actor).value, 1);
});

test("Press the Attack: Forestall spends Aggression, spends Reaction, and calculates AC bonus", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, aggression: 4 });
  // PB = 3, amount = 2 -> bonus = 6
  const result = await use(actor, "forestall", { amount: 2 });
  assert.equal(result.acBonus, 6);
  assert.equal(result.aggressionSpent, 2);
  assert.equal(aggression(actor).value, 2);

  const receipt = guardUses.receipt(actor, "use-1");
  assert.equal(receipt.summary, "Guard's AC is increased by 6 against the triggering Attack.");
  assert.equal(receipt.reaction.spent, true);
});

test("Forestall warns when Aggression is insufficient and clamps at 0 with Use anyway", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, aggression: 1 });
  // Demanding 3 Aggression with only 1 available
  await assert.rejects(use(actor, "forestall", { amount: 3 }, "use-warn"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "aggression"));
    return true;
  });

  const result = await anyway(actor, "forestall", { amount: 3 }, "use-override");
  assert.equal(result.acBonus, 9);
  assert.equal(aggression(actor).value, 0);

  const receipt = guardUses.receipt(actor, "use-override");
  assert.ok(receipt.shortfalls.some(s => s.includes("Aggression short by 2")));
});

test("Press the Attack: Smite spends Aggression and calculates damage bonus", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, aggression: 4 });
  const result = await use(actor, "smite", { amount: 3 }, "smite-1");
  assert.equal(result.damageBonus, 9); // 3 * PB(3) = 9
  assert.equal(result.aggressionSpent, 3);
  assert.equal(aggression(actor).value, 1);
});

test("Press the Attack: Strike True spends Aggression and calculates attack bonus", async () => {
  setupWorld();
  const actor = guardFixture({ level: 5, aggression: 4 });
  const result = await use(actor, "strikeTrue", { amount: 1 }, "st-1");
  assert.equal(result.attackBonus, 3);
  assert.equal(result.aggressionSpent, 1);
  assert.equal(aggression(actor).value, 3);
});

test("Unrelenting spends 1 use of Unrelenting and warns if level is below 3", async () => {
  setupWorld();
  const lowActor = guardFixture({ level: 2, unrelenting: 0 });
  await assert.rejects(use(lowActor, "unrelenting", {}, "unrel-low"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "level"));
    return true;
  });

  const actor = guardFixture({ level: 5, unrelenting: 1 });
  const result = await use(actor, "unrelenting", {}, "unrel-ok");
  assert.equal(result.attacks, 1);
  assert.equal(unrelenting(actor).value, 0);
});

test("Pursuit Unrelenting spends 2 uses of Unrelenting and grants Action or Bonus Action", async () => {
  setupWorld();
  const actor = guardFixture({ level: 11, unrelenting: 2 });
  const result = await use(actor, "pursuitUnrelenting", { actionType: "action" }, "pursuit-1");
  assert.equal(result.actionType, "Action");
  assert.equal(unrelenting(actor).value, 0);
});

test("Unrelenting Aggression (15th) spends 2 Aggression and configures miss damage roll", async () => {
  setupWorld();
  const actor = guardFixture({ level: 15, aggression: 4 });
  const result = await use(actor, "unrelentingAggression", { formula: "2d6" }, "unrel-agg-1");
  assert.equal(result.aggressionSpent, 2);
  assert.equal(result.formula, "2d6");
  assert.equal(aggression(actor).value, 2);
});

test("getGuardView provides clean read-only status and manual reminders", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, aggression: 4, unrelenting: 1 });
  const view = getGuardView(actor);
  assert.equal(view.level, 5);
  assert.equal(view.aggression.value, 4);
  assert.equal(view.unrelenting.value, 1);
  assert.ok(view.manual.length > 0);
});
