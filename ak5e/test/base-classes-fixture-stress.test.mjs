/**
 * Empirical Adversarial & Stress Test Suite for base-classes-fixture.mjs
 * Validates edge cases, failure modes, prototype pollution defense, memory leak prevention,
 * serialization correctness, concurrent updates, rest hooks, and permission checks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals,
  teardownFoundryGlobals,
  createTestActor,
  createTestItem,
  TestCollection,
  setPropertyByPath,
  getPropertyByPath,
  triggerShortRest,
  triggerLongRest,
  createTestCombat
} from "./base-classes-fixture.mjs";

test.beforeEach(() => {
  setupFoundryGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  // Clean up any potential prototype pollution
  delete Object.prototype.polluted_proto;
  delete Object.prototype.polluted_ctor;
});

// ============================================================================
// SUITE 1: Nested Dotted Path Updates, Deletions (-=), and Force-Keys (==)
// ============================================================================

test("Suite 1: Standard nested dotted path updates succeed", () => {
  const actor = createTestActor({ hp: { value: 20, max: 20 } });
  setPropertyByPath(actor, "system.attributes.hp.value", 12);
  assert.equal(actor.system.attributes.hp.value, 12);

  setPropertyByPath(actor, "flags.ak5e.customFlag.subKey", "success");
  assert.equal(actor.flags.ak5e.customFlag.subKey, "success");
});

test("Suite 1: Deletion syntax flags.-=ak5e removes nested key", () => {
  const actor = { flags: { ak5e: { toDelete: 123, toKeep: 456 } } };
  setPropertyByPath(actor, "flags.ak5e.-=toDelete", null);
  assert.equal(actor.flags.ak5e.toDelete, undefined);
  assert.equal(actor.flags.ak5e.toKeep, 456);
});

test("Suite 1: Path -=flags.ak5e cleanly deletes nested property without creating -=flags", () => {
  const actor = { flags: { ak5e: { value: 10 } } };
  setPropertyByPath(actor, "-=flags.ak5e", null);

  assert.equal("-=flags" in actor, false, "Does not create corrupted '-=flags' property");
  assert.equal(actor.flags?.ak5e, undefined, "Original flags.ak5e was cleanly deleted");
});

test("Suite 1: Force-key == force-replaces target property without creating == literal key", () => {
  const actor = { flags: { ak5e: { state: { a: 1, b: 2 } } } };

  // Attempt 1: via nested object update
  setPropertyByPath(actor, "flags.ak5e", { "==state": { c: 3 } });
  assert.equal("==state" in actor.flags.ak5e, false, "Does not create literal '==state' key");
  assert.deepEqual(actor.flags.ak5e.state, { c: 3 }, "Force-replaces 'state', discarding old properties");

  // Attempt 2: via direct dotted path
  const actor2 = { flags: { ak5e: { state: { a: 1, b: 2 } } } };
  setPropertyByPath(actor2, "flags.ak5e.==state", { c: 3 });
  assert.equal("==state" in actor2.flags.ak5e, false, "Direct dotted path does not create literal '==state'");
  assert.deepEqual(actor2.flags.ak5e.state, { c: 3 }, "Direct dotted path force-replaces target property");
});

test("Suite 1: Intermediate primitive in dotted path is replaced with object without throwing", () => {
  const actor = { system: 123 };
  assert.doesNotThrow(() => setPropertyByPath(actor, "system.attributes.hp", 10));
  assert.equal(actor.system.attributes.hp, 10, "Intermediate primitive converted to object");
});

// ============================================================================
// SUITE 2: Embedded Document Additions, Updates, Deletions & Memory Leaks
// ============================================================================

test("Suite 2: Multiple embedded document additions and duplicate ID collision", async () => {
  const actor = createTestActor();

  const created = await actor.createEmbeddedDocuments("Item", [
    { _id: "item1", name: "First Item" },
    { _id: "item1", name: "Duplicate ID Item" },
    { _id: "item2", name: "Second Item" }
  ]);

  assert.equal(created.length, 3, "Returned 3 items");
  assert.equal(actor.items.size, 2, "Collection only retains 2 due to Map key overwrite");
  assert.equal(actor.items.get("item1").name, "Duplicate ID Item", "Duplicate ID overwrote prior entry in collection");
  assert.equal(actor.created.length, 3, "actor.created tracked all 3 items including duplicate");
});

test("Suite 2: Deletion with duplicate IDs and non-existent IDs returns Document[]", async () => {
  const actor = createTestActor();
  await actor.createEmbeddedDocuments("Item", [{ _id: "itemA", name: "Alpha" }]);

  const deleted = await actor.deleteEmbeddedDocuments("Item", ["itemA", "itemA", "ghostId"]);
  assert.equal(deleted.length, 1, "Returns only the successfully deleted document once");
  assert.equal(deleted[0].id, "itemA", "Deleted document is a Document instance with matching ID");
  assert.equal(deleted[0].documentName, "Item", "Deleted document has Document documentName");
  assert.equal(actor.items.size, 0);
});

test("Suite 2: ActiveEffect embedded document has correct documentName, UUID, and is removed on effect.delete()", async () => {
  const actor = createTestActor();
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: "eff1", name: "Bless" }]);

  assert.equal(effect.documentName, "ActiveEffect", "ActiveEffect mock has documentName 'ActiveEffect'");
  assert.match(effect.uuid, /\.ActiveEffect\.eff1$/, "ActiveEffect UUID has .ActiveEffect. instead of .Item.");
  assert.ok(actor.effects.has("eff1"), "Effect exists in actor.effects");

  await effect.delete();
  assert.equal(actor.effects.has("eff1"), false, "effect.delete() removes effect from parent.effects");
});

test("Suite 2: actor.created is cleaned up across create/delete lifecycles preventing memory leaks", async () => {
  const actor = createTestActor();
  for (let i = 0; i < 50; i++) {
    const [doc] = await actor.createEmbeddedDocuments("Item", [{ _id: `temp_${i}`, name: `Temp ${i}` }]);
    await actor.deleteEmbeddedDocuments("Item", [doc.id]);
  }

  assert.equal(actor.items.size, 0, "All items deleted from collection");
  assert.equal(actor.created.length, 0, "actor.created cleans up deleted items (no memory leak)");
});

test("Suite 2: actor.updateEmbeddedDocuments updates matching documents and returns Document[]", async () => {
  const actor = createTestActor();
  const [item] = await actor.createEmbeddedDocuments("Item", [{ _id: "itemX", name: "Old Name", system: { uses: 1 } }]);
  const updated = await actor.updateEmbeddedDocuments("Item", [{ id: "itemX", name: "New Name", "system.uses": 2 }]);

  assert.equal(updated.length, 1, "Returns updated document array");
  assert.equal(updated[0], item, "Returns document instance");
  assert.equal(actor.items.get("itemX").name, "New Name", "Document name updated");
  assert.equal(actor.items.get("itemX").system.uses, 2, "Document system updated");
});

// ============================================================================
// SUITE 3: Rest Triggers with Multiple Registered Pools
// ============================================================================

test("Suite 3: Rest triggers recover multiple registered pools simultaneously", async () => {
  const { definePool, registerResourcePoolHooks, spendPool, getPool } = await import("../scripts/resource-pools.mjs");
  registerResourcePoolHooks();

  definePool({
    id: "stressPool1",
    label: "Stress Pool 1",
    max: 10,
    recovery: [{ on: "sr", amount: 4 }, { on: "lr", amount: "full" }]
  });

  definePool({
    id: "stressPool2",
    label: "Stress Pool 2",
    max: 20,
    recovery: [{ on: "sr", amount: 10 }, { on: "lr", amount: "full" }]
  });

  definePool({
    id: "stressPool3",
    label: "Stress Pool 3",
    max: 6,
    recovery: [{ on: "sr", when: () => false, amount: 6 }, { on: "lr", amount: "full" }]
  });

  const actor = createTestActor({ isOwner: true });
  await spendPool(actor, "stressPool1", 8);
  await spendPool(actor, "stressPool2", 15);
  await spendPool(actor, "stressPool3", 5);

  assert.equal(getPool(actor, "stressPool1").value, 2);
  assert.equal(getPool(actor, "stressPool2").value, 5);
  assert.equal(getPool(actor, "stressPool3").value, 1);

  await triggerShortRest(actor);
  assert.equal(getPool(actor, "stressPool1").value, 6);
  assert.equal(getPool(actor, "stressPool2").value, 15);
  assert.equal(getPool(actor, "stressPool3").value, 1, "Conditional SR was skipped");

  await triggerLongRest(actor);
  assert.equal(getPool(actor, "stressPool1").value, 10);
  assert.equal(getPool(actor, "stressPool2").value, 20);
  assert.equal(getPool(actor, "stressPool3").value, 6);
});

// ============================================================================
// SUITE 4: Permission Checks (testUserPermission) and Concurrent Updates
// ============================================================================

test("Suite 4: testUserPermission parses permission levels (NONE, LIMITED, OBSERVER, OWNER)", () => {
  const observerUser = { id: "user_obs", isGM: false };
  const actor = createTestActor({ ownership: { user_obs: 2 } }); // level 2 = OBSERVER in Foundry

  assert.equal(actor.testUserPermission(observerUser, "OBSERVER"), true, "OBSERVER user passes OBSERVER check");
  assert.equal(actor.testUserPermission(observerUser, "LIMITED"), true, "OBSERVER user passes LIMITED check");
  assert.equal(actor.testUserPermission(observerUser, "OWNER"), false, "OBSERVER user fails OWNER check");
  assert.equal(actor.testUserPermission(observerUser, 2), true, "Numeric level 2 passes level 2 check");
  assert.equal(actor.testUserPermission(observerUser, 3), false, "Numeric level 2 fails level 3 check");
});

test("Suite 4: testUserPermission respects ownership.default for unlisted non-GM users", () => {
  const strangerUser = { id: "user_stranger", isGM: false };
  const actor = createTestActor({ ownership: { default: 0, player1: 3 } });

  assert.equal(actor.testUserPermission(strangerUser, "OWNER"), false, "Unlisted non-GM player does not get OWNER access");
  assert.equal(actor.testUserPermission(strangerUser, "NONE"), true, "Unlisted player has NONE access");

  const gmUser = { id: "user_gm", isGM: true };
  assert.equal(actor.testUserPermission(gmUser, "OWNER"), true, "GM user always passes permission check");
});

test("Suite 4: Rapid concurrent updates do not lose writes", async () => {
  const actor = createTestActor();
  const updates = Array.from({ length: 50 }, (_, i) => ({
    [`flags.ak5e.concurrent.key_${i}`]: i
  }));

  await Promise.all(updates.map(u => actor.update(u)));

  assert.equal(actor.writes.length, 50, "All 50 writes recorded");
  for (let i = 0; i < 50; i++) {
    assert.equal(actor.flags.ak5e.concurrent[`key_${i}`], i, `Key ${i} correctly written`);
  }
});

// ============================================================================
// SUITE 5: Prototype Pollution Defense
// ============================================================================

test("Suite 5: setPropertyByPath guards against prototype pollution via __proto__", () => {
  const victim = {};
  assert.equal(({}).polluted_proto, undefined, "Before: Object.prototype is clean");

  setPropertyByPath(victim, "__proto__.polluted_proto", "POLLUTED");

  assert.equal(({}).polluted_proto, undefined, "Object.prototype was NOT polluted");
  assert.equal(victim.polluted_proto, undefined, "Victim object was not polluted");
});

test("Suite 5: setPropertyByPath guards against prototype pollution via constructor.prototype", () => {
  const victim = {};
  assert.equal(({}).polluted_ctor, undefined, "Before: Object.prototype is clean");

  setPropertyByPath(victim, "constructor.prototype.polluted_ctor", "POLLUTED");

  assert.equal(({}).polluted_ctor, undefined, "Object.prototype was NOT polluted via constructor.prototype");
  assert.equal(victim.polluted_ctor, undefined, "Victim object was not polluted");
});

// ============================================================================
// SUITE 6: Document Serialization (toObject)
// ============================================================================

test("Suite 6: actor.toObject() serializes document state without functions or DataCloneError", () => {
  const actor = createTestActor({ class: "Vanguard", level: 3 });
  let obj;
  assert.doesNotThrow(() => { obj = actor.toObject(); });
  assert.equal(obj.name, "Test Actor");
  assert.equal(obj.type, "character");
  assert.equal(obj.system.details.level, 3);
  assert.equal(typeof obj.getFlag, "undefined", "Methods are stripped from serialized object");
  assert.equal(typeof obj.update, "undefined", "Methods are stripped from serialized object");
  assert.ok(Array.isArray(obj.items), "Items is serialized array");
  assert.ok(Array.isArray(obj.effects), "Effects is serialized array");
  assert.doesNotThrow(() => structuredClone(obj), "Object returned by toObject() can be cleanly cloned");
});

test("Suite 6: item.toObject() serializes document state without functions or DataCloneError", () => {
  const item = createTestItem({ name: "Sword", system: { damage: "1d8" } });
  let obj;
  assert.doesNotThrow(() => { obj = item.toObject(); });
  assert.equal(obj.name, "Sword");
  assert.equal(obj.system.damage, "1d8");
  assert.equal(typeof obj.getFlag, "undefined", "Methods are stripped from serialized object");
  assert.equal(typeof obj.update, "undefined", "Methods are stripped from serialized object");
  assert.doesNotThrow(() => structuredClone(obj), "Object returned by toObject() can be cleanly cloned");
});

// ============================================================================
// SUITE 7: Collections & Globals Compliance
// ============================================================================

test("Suite 7: game.users is a TestCollection with find, filter, map, some, every, and activeGM", () => {
  assert.ok(globalThis.game.users instanceof TestCollection, "game.users is an instance of TestCollection");
  assert.equal(typeof globalThis.game.users.find, "function");
  assert.equal(typeof globalThis.game.users.filter, "function");
  assert.equal(typeof globalThis.game.users.map, "function");
  assert.equal(typeof globalThis.game.users.some, "function");
  assert.equal(typeof globalThis.game.users.every, "function");
  assert.equal(globalThis.game.users.some(u => u.isGM), true, "game.users.some works");
  assert.equal(globalThis.game.users.activeGM?.isGM, true, "game.users.activeGM getter works");
});

test("Suite 7: game.messages has get(id) method", async () => {
  const message = await globalThis.ChatMessage.implementation.create({ content: "Test message" });
  assert.equal(typeof globalThis.game.messages.get, "function");
  assert.equal(globalThis.game.messages.get(message.id), message);
  assert.equal(globalThis.game.messages.get("non-existent-id"), null);
});

test("Suite 7: createTestCombat combatants is a TestCollection", () => {
  const actor1 = createTestActor({ name: "Hero" });
  const actor2 = createTestActor({ name: "Villain" });
  const combat = createTestCombat([actor1, actor2]);

  assert.ok(combat.combatants instanceof TestCollection, "combat.combatants is a TestCollection");
  assert.equal(typeof combat.combatants.find, "function");
  const found = combat.combatants.find(c => c.actor.name === "Hero");
  assert.ok(found, "Found combatant via .find()");
  assert.equal(found.actor.name, "Hero");
});
