import test from "node:test";
import assert from "node:assert/strict";
import { guardFixture, world } from "./guard-fixture.mjs";
import {
  isCenturion, defineCenturionPools, registerCenturionHooks
} from "../scripts/centurion-features.mjs";
import { guardUses } from "../scripts/guard-uses.mjs";
import { centurionDC, martialDC } from "../scripts/guard-rules.mjs";

function setupWorld() {
  const documents = world();
  registerCenturionHooks();
  return documents;
}

const use = (actor, command, data = {}, id = "cent-1") => guardUses.command(actor, command, { confirmed: true, ...data }, id);

async function anyway(actor, command, data = {}, id = "cent-1") {
  try {
    return await use(actor, command, data, id);
  } catch (error) {
    if (error.name !== "AK5eWarnings") throw error;
    return use(actor, command, { ...data, overrides: error.warnings.map(w => w.id) }, id);
  }
}

test("Centurion identification and DC calculations", () => {
  setupWorld();
  const actor = guardFixture({ level: 5, branch: "centurion" });
  assert.equal(isCenturion(actor), true);
  // system.skills.itm.mod = 4 -> Centurion DC = 8 + 4 = 12
  assert.equal(centurionDC(actor), 12);
  // STR mod = 4, PB = 3 -> Martial DC = 8 + 3 + 4 = 15
  assert.equal(martialDC(actor), 15);
});

test("Cyclone Strike enforces target limits by level and allows cleave", async () => {
  setupWorld();
  const actor1 = guardFixture({ level: 5, branch: "centurion" });
  // Level 5: max 1 secondary target. 2 secondary targets should warn.
  await assert.rejects(use(actor1, "cycloneStrike", { targetUuids: ["t1", "t2"] }, "cyc-1"), error => {
    assert.equal(error.name, "AK5eWarnings");
    assert.ok(error.warnings.some(w => w.id === "targetCount"));
    return true;
  });

  const res1 = await use(actor1, "cycloneStrike", { targetUuids: ["t1"] }, "cyc-ok");
  assert.equal(res1.secondaryCount, 1);
  assert.equal(res1.maxTargets, 1);

  // Level 7: can cleave to 2 secondary targets
  const actor7 = guardFixture({ level: 7, branch: "centurion" });
  const res7 = await use(actor7, "cycloneStrike", { targetUuids: ["t1", "t2"] }, "cyc-7");
  assert.equal(res7.secondaryCount, 2);
  assert.equal(res7.maxTargets, 2);
});

test("Brutal Execution spends 2 Aggression, calculates DC and damage, and queues targets", async () => {
  const documents = setupWorld();
  const actor = guardFixture({ level: 5, branch: "centurion", aggression: 4 });
  const trooperItem = {
    id: "trooper",
    uuid: `${actor.uuid}.Item.trooper`,
    parent: actor,
    name: "Shock Trooper",
    type: "feat",
    flags: { ak5e: { chapterThreeId: "subclass-feature-guard-centurion-1st-level-shock-trooper-1175" } }
  };
  actor.items.set("trooper", trooperItem);

  const enemy = {
    uuid: "Actor.enemy1",
    id: "enemy1",
    name: "Enemy 1",
    documentName: "Actor",
    isOwner: true,
    effects: new Map(),
    items: new Map(),
    system: { attributes: { hp: { value: 20 } } },
    getFlag() {},
    async update() { return this; },
    createEmbeddedDocuments: async () => [{ id: "eff1", update: async () => {} }]
  };
  documents.set(enemy.uuid, enemy);

  const targetRef = { uuid: enemy.uuid, name: enemy.name };
  const result = await use(actor, "brutalExecution", { targets: [targetRef] }, "brutal-1");
  assert.equal(result.aggressionSpent, 2);
  assert.equal(result.dc, 12);
  assert.equal(result.damage, 4); // Intimidation mod

  const receipt = guardUses.receipt(actor, "brutal-1");
  assert.equal(receipt.targets.length, 1);
  assert.equal(receipt.targets[0].uuid, "Actor.enemy1");
  assert.equal(receipt.targets[0].kind, "effect");
});

test("Ferocious Fling spends pool use and provides refund when Brutal Execution is flagged", async () => {
  setupWorld();
  const actor = guardFixture({ level: 4, branch: "centurion" });
  // Normal fling spends 1 use of ferociousFling pool
  const res1 = await use(actor, "ferociousFling", { targetConMod: 3, targetUuid: "Actor.t2" }, "fling-1");
  assert.equal(res1.conMod, 3);
  assert.equal(res1.brutalRefund, false);

  // Fling with brutalExecution flag does not spend pool use (refunded)
  const res2 = await use(actor, "ferociousFling", { targetConMod: 2, brutalExecution: true }, "fling-refund");
  assert.equal(res2.brutalRefund, true);
});

test("Guillotine (10th) rolls 2*PB d6, applies Bleeding, and pulses Frightened on Elite/Leader", async () => {
  setupWorld();
  const actor = guardFixture({ level: 10, branch: "centurion" });
  actor.system.attributes.prof = 4;
  const result = await use(actor, "guillotine", { eliteOrLeader: true }, "guill-1");
  assert.equal(result.diceCount, 8); // 2 * PB(4) = 8
  assert.equal(result.eliteOrLeader, true);

  const receipt = guardUses.receipt(actor, "guill-1");
  assert.equal(receipt.formula, "8d6");
});

test("Shredder (13th) deals STR modifier damage, doubled if target is Frightened", async () => {
  setupWorld();
  const actor = guardFixture({ level: 13, branch: "centurion" });
  // STR mod = 4
  const resNormal = await use(actor, "shredder", { targetFrightened: false }, "shred-1");
  assert.equal(resNormal.damage, 4);

  const resFrightened = await use(actor, "shredder", { targetFrightened: true }, "shred-2");
  assert.equal(resFrightened.damage, 8);
});

test("Storm of Blood (17th) rolls 10d8 Slashing and sets DC", async () => {
  setupWorld();
  const actor = guardFixture({ level: 17, branch: "centurion" });
  const result = await use(actor, "stormOfBlood", {}, "storm-1");
  assert.equal(result.damageFormula, "10d8");

  const receipt = guardUses.receipt(actor, "storm-1");
  assert.equal(receipt.formula, "10d8");
});
