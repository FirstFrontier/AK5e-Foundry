import test from "node:test";
import assert from "node:assert/strict";
import { createPlayUses, spendResource } from "../scripts/play-uses.mjs";
import { setReactionStore } from "../scripts/trigger-events.mjs";

const setPath = (object, path, value) => {
  const parts = path.split("."), last = parts.pop();
  let current = object;
  for (const part of parts) current = current[part] ??= {};
  if (last.startsWith("-=")) { delete current[last.slice(2)]; return; }
  current[last] = structuredClone(value);
};

function world() {
  const messages = [];
  let writeCount = 0;
  const reactionState = new Map();
  globalThis.game = { user: { id: "gm", name: "GM", isGM: true }, users: { activeGM: { id: "gm" } },
    combat: null, messages, time: { worldTime: 0 } };
  globalThis.foundry = { utils: { randomID: () => "generated" } };
  globalThis.ChatMessage = { implementation: {
    getSpeaker: ({ actor }) => ({ actor: actor.id }),
    async create(message) { messages.push(message); return message; }
  } };
  setReactionStore({
    read: actor => reactionState.get(actor.uuid) ?? { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} },
    async write(actor, state) { writeCount += 1; reactionState.set(actor.uuid, structuredClone(state)); }
  });
  const actor = {
    id: "marksman", uuid: "Actor.marksman", documentName: "Actor", name: "Marksman", isOwner: true,
    flags: { ak5e: {} }, system: { resources: { test: { value: 2, max: 2 } } }, items: [], effects: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); return this; }
  };
  const uses = createPlayUses({ ns: "testUses", label: "test use", isMember: () => true });
  return { actor, uses, messages, reactionState, reactionWrites: () => writeCount };
}

test("play-use undo restores returned flags only while they still match the use and restores its resource", async () => {
  const { actor, uses } = world();
  uses.register({ plans: { activate(_actor, _state, _data) {
    return { title: "Activate", warnings: [], apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { path: "system.resources.test.value", amount: 1, label: "Test charge" });
      updates["flags.ak5e.marksman.targetLock"] = { active: true, targetUuid: "Token.target" };
      receipt.summary = "Marksman activates a test benefit.";
      return updates;
    } };
  }, temporary(_actor, _state, _data) {
    return { title: "Temporary", warnings: [], apply() { return { "flags.ak5e.marksman.temporary": true }; } };
  } } });

  await uses.command(actor, "activate", { confirmed: true }, "flag-undo");
  assert.equal(actor.flags.ak5e.marksman.targetLock.active, true);
  assert.equal(actor.system.resources.test.value, 1);
  actor.flags.ak5e.marksman.targetLock.active = false;
  const preview = uses.previewUndo(actor, "flag-undo");
  assert.ok(preview.lines.some(line => line.includes("Won't restore marksman.targetLock")));

  await uses.command(actor, "undoUse", { useId: "flag-undo" }, "undo-flag-undo");
  assert.equal(actor.flags.ak5e.marksman.targetLock.active, false, "a later flag edit is preserved");
  assert.equal(actor.system.resources.test.value, 2, "the use's resource spend is refunded");
  await uses.command(actor, "temporary", { confirmed: true }, "flag-delete");
  await uses.command(actor, "undoUse", { useId: "flag-delete" }, "undo-flag-delete");
  assert.equal(Object.hasOwn(actor.flags.ak5e.marksman, "temporary"), false, "undo removes a flag that did not exist before the use");
});

test("a prepared use retries after an Actor write fault without spending twice", async () => {
  const { actor, uses, reactionState, reactionWrites } = world();
  let fault = true;
  const update = actor.update.bind(actor);
  actor.update = async changes => {
    if (fault && changes["flags.ak5e.marksman.benefit"]) { fault = false; throw new Error("simulated write fault"); }
    return update(changes);
  };
  uses.register({ plans: { detonate(_actor, _state, _data, id) {
    return { title: "Detonate", warnings: [], apply(_next, receipt) {
      const updates = spendResource(actor, receipt, { path: "system.resources.test.value", amount: 1, label: "Munition" });
      updates["flags.ak5e.marksman.benefit"] = { active: true };
      receipt.reaction = { requested: true, triggerId: `${id}-detonate` };
      receipt.summary = "The munition detonates.";
      return updates;
    } };
  } } });

  await assert.rejects(uses.command(actor, "detonate", { confirmed: true }, "retry-detonate"), /Not applied yet: simulated write fault/);
  assert.equal(actor.system.resources.test.value, 2, "the failing update did not spend the resource");
  assert.equal(reactionWrites(), 0, "reaction is not spent before the prepared update commits");
  assert.equal(uses.receipt(actor, "retry-detonate").status, "pending");

  await uses.command(actor, "detonate", { confirmed: true }, "retry-detonate");
  assert.equal(actor.system.resources.test.value, 1);
  assert.deepEqual(actor.flags.ak5e.marksman.benefit, { active: true });
  assert.equal(reactionState.get(actor.uuid).spent, 1);
  assert.equal(reactionWrites(), 1, "one Reaction spend is committed");
});

test("undo never refunds a prepared resource change that failed to commit", async () => {
  const { actor, uses } = world();
  actor.system.resources.test.max = 3;
  const update = actor.update.bind(actor);
  actor.update = async changes => {
    if (changes["flags.ak5e.benefit"]) throw new Error("failed commit");
    return update(changes);
  };
  uses.register({ plans: { activate() { return { title: "Activate", warnings: [], apply(_state, receipt) {
    return { ...spendResource(actor, receipt, { path: "system.resources.test.value", max: 3, amount: 1, label: "Charge" }), "flags.ak5e.benefit": true };
  } }; } } });
  await assert.rejects(uses.command(actor, "activate", { confirmed: true }, "failed"), /failed commit/);
  assert.equal(uses.receipt(actor, "failed").updatesApplied, false);
  await uses.command(actor, "undoUse", { useId: "failed" }, "undo-failed");
  assert.equal(actor.system.resources.test.value, 2);
  assert.equal(actor.flags.ak5e.benefit, undefined);
});

test("an interrupted completion cannot replay prepared costs over a later use", async () => {
  const { actor, uses } = world();
  actor.system.resources.test.value = 3;
  const update = actor.update.bind(actor);
  let fault = true;
  actor.update = async changes => {
    if (fault && changes["flags.ak5e.testUses"]?.undo?.some(r => r.id === "first" && r.status === "complete")) {
      fault = false; throw new Error("completion failed");
    }
    return update(changes);
  };
  uses.register({ plans: { spend() { return { title: "Spend", warnings: [], apply(_state, receipt) {
    return spendResource(actor, receipt, { path: "system.resources.test.value", amount: 1, label: "Charge" });
  } }; } } });
  await assert.rejects(uses.command(actor, "spend", { confirmed: true }, "first"), /completion failed/);
  assert.equal(uses.receipt(actor, "first").updatesApplied, true, "the marker commits atomically with the cost");
  await uses.command(actor, "spend", { confirmed: true }, "second");
  await uses.command(actor, "spend", { confirmed: true }, "first");
  assert.equal(actor.system.resources.test.value, 1, "retry preserves the later spend");
});

test("undo restores a nested deleted flag key with Foundry recursive update semantics", async () => {
  const { actor, uses } = world();
  actor.flags.ak5e.benefit = { removed: 7, kept: 4 };
  function merge(before, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(value);
    const result = structuredClone(before ?? {});
    for (const [key, entry] of Object.entries(value)) {
      if (key.startsWith("-=")) delete result[key.slice(2)];
      else result[key] = merge(result[key], entry);
    }
    return result;
  }
  actor.update = async changes => { for (const [path, value] of Object.entries(changes)) {
    const before = path.split(".").reduce((obj, key) => obj?.[key], actor);
    setPath(actor, path, merge(before, value));
  } return actor; };
  uses.register({ plans: { remove() { return { title: "Remove", warnings: [], apply() {
    return { "flags.ak5e.benefit": { "-=removed": null, added: 3 } };
  } }; } } });
  await uses.command(actor, "remove", { confirmed: true }, "delete-key");
  assert.deepEqual(actor.flags.ak5e.benefit, { kept: 4, added: 3 });
  await uses.command(actor, "undoUse", { useId: "delete-key" }, "undo-delete");
  assert.deepEqual(actor.flags.ak5e.benefit, { kept: 4, removed: 7 });
});

test("reaction ledger replay prevents double spend when saving its engine receipt fails", async () => {
  const { actor, uses, reactionState, reactionWrites } = world();
  let failReceiptWrite = true;
  const update = actor.update.bind(actor);
  actor.update = async changes => {
    const state = changes["flags.ak5e.testUses"];
    const receipt = state?.undo?.find(entry => entry.id === "reaction-retry");
    if (failReceiptWrite && receipt?.reaction?.spent) { failReceiptWrite = false; throw new Error("receipt write fault"); }
    return update(changes);
  };
  uses.register({ plans: { react(_actor, _state, _data, id) {
    return { title: "React", warnings: [], apply(_next, receipt) {
      receipt.reaction = { requested: true, triggerId: `${id}-trigger` };
      receipt.summary = "Marksman reacts.";
      return {};
    } };
  } } });

  await assert.rejects(uses.command(actor, "react", { confirmed: true }, "reaction-retry"), /receipt write fault/);
  assert.equal(reactionState.get(actor.uuid).spent, 1);
  assert.equal(reactionWrites(), 1);
  await uses.command(actor, "react", { confirmed: true }, "reaction-retry");
  assert.equal(reactionState.get(actor.uuid).spent, 1);
  assert.equal(reactionWrites(), 1, "retry uses the stable Reaction receipt ID");
});

test("B-300: ChatMessage creation failure retains evaluated roll and retry publishes without rerolling", async () => {
  const { actor, uses, messages } = world();
  let rollEvaluations = 0;
  class MockRoll {
    constructor(formula, data = {}) {
      this.formula = formula;
      this.data = data;
      this.total = null;
      this._evaluated = false;
    }
    async evaluate() {
      rollEvaluations++;
      this.total = 17;
      this._total = 17;
      this._evaluated = true;
      return this;
    }
    async toMessage(messageData = {}) {
      return ChatMessage.implementation.create({
        ...messageData,
        rolls: [this],
        content: `Roll [${this.formula}]: ${this.total}`
      });
    }
    toJSON() {
      return {
        formula: this.formula,
        total: this.total,
        evaluated: this._evaluated
      };
    }
  }
  globalThis.Roll = MockRoll;

  uses.register({ plans: {
    shoot() {
      return {
        title: "Shoot",
        warnings: [],
        apply(_state, receipt) {
          receipt.formula = "1d20+7";
          return {};
        }
      };
    }
  } });

  await uses.command(actor, "shoot", { confirmed: true }, "shoot-b300");
  const initialReceipt = uses.receipt(actor, "shoot-b300");
  assert.equal(initialReceipt.roll, undefined);

  let failDiceCreate = true;
  const originalCreate = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async msg => {
    if (failDiceCreate && msg.rolls?.length) {
      failDiceCreate = false;
      throw new Error("simulated dice ChatMessage failure");
    }
    return originalCreate(msg);
  };

  // First useRoll fails during dice ChatMessage creation
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "shoot-b300" }, "roll-attempt-1"),
    /simulated dice ChatMessage failure/
  );

  // Evaluated roll was persisted, diceMessagePublished remains false, no dice message was delivered
  const failedReceipt = uses.receipt(actor, "shoot-b300");
  assert.equal(failedReceipt.roll, 17, "evaluated roll total was persisted");
  assert.equal(failedReceipt.diceMessagePublished, false, "diceMessagePublished is false after failed creation");
  const diceMessages = () => messages.filter(m => m.rolls?.length);
  assert.equal(diceMessages().length, 0, "no dice chat message was created");
  assert.equal(rollEvaluations, 1, "dice evaluated once");

  // Subsequent retry succeeds and publishes the ChatMessage without re-evaluating the dice roll
  await uses.command(actor, "useRoll", { useId: "shoot-b300" }, "roll-attempt-2");
  assert.equal(diceMessages().length, 1, "dice chat message is published on retry");
  assert.equal(diceMessages()[0].content, "Roll [1d20+7]: 17");
  assert.equal(rollEvaluations, 1, "dice was NOT re-evaluated on retry; preserved total was published");
  assert.equal(uses.receipt(actor, "shoot-b300").diceMessagePublished, true, "diceMessagePublished is true");

  // Further retry does not publish a duplicate ChatMessage
  await uses.command(actor, "useRoll", { useId: "shoot-b300" }, "roll-attempt-3");
  assert.equal(diceMessages().length, 1, "no duplicate chat message published when diceMessagePublished is true");
  assert.equal(rollEvaluations, 1);
});

test("B-300: previewUndo reflects target reversals and lock states from descendant child receipts", async () => {
  const { actor, uses } = world();
  globalThis.fromUuidSync = uuid => ({ uuid, name: uuid === "Token.targetA" ? "Goblin" : "Orc" });

  uses.register({
    plans: {
      parentAction() {
        return {
          title: "Parent Action",
          warnings: [],
          apply(_next, receipt) {
            const updates = spendResource(actor, receipt, { path: "system.resources.test.value", amount: 1, label: "Charge" });
            receipt.summary = "Parent action performed.";
            return updates;
          }
        };
      }
    },
    targetKinds: {
      customTarget: {
        preview(_source, _receipt, entry, doc) {
          return `${doc?.name ?? entry.name}: restore ${entry.amount} HP`;
        }
      }
    }
  });

  await uses.command(actor, "parentAction", { confirmed: true }, "parent-1");

  // Simulate a child resolution step in actor state.undo
  const state = actor.flags.ak5e.testUses;
  const childReceipt = {
    id: "child-step-1",
    parentUseId: "parent-1",
    command: "childResolution",
    status: "complete",
    epoch: 0,
    targets: [
      { kind: "customTarget", name: "Goblin", uuid: "Token.targetA", amount: 15, applied: true }
    ],
    summary: "Child resolution step"
  };
  state.undo.push(childReceipt);
  await actor.update({ "flags.ak5e.testUses": state });

  // Previewing undo on parent-1 includes child target reversal lines
  const preview = uses.previewUndo(actor, "parent-1");
  assert.ok(preview.lines.some(line => line.includes("Goblin: restore 15 HP")), "preview reflects child target reversal");
  assert.ok(preview.lines.some(line => line.includes("Restores 1 Charge")), "preview reflects parent resource restoration");
  assert.equal(preview.locked, false);
  assert.equal(preview.blocked, false);

  // If a descendant receipt is from an earlier epoch (locked)
  childReceipt.epoch = -1;
  await actor.update({ "flags.ak5e.testUses": state });

  // Non-GM user is blocked by child lock
  globalThis.game.user.isGM = false;
  const blockedPreview = uses.previewUndo(actor, "parent-1");
  assert.equal(blockedPreview.locked, true, "locked is true because child receipt is locked");
  assert.equal(blockedPreview.blocked, true, "blocked is true for non-GM");
  assert.ok(blockedPreview.lines.some(l => l.includes("Locked: this use's encounter window has ended.")));

  // GM user is not blocked
  globalThis.game.user.isGM = true;
  const gmPreview = uses.previewUndo(actor, "parent-1");
  assert.equal(gmPreview.locked, true);
  assert.equal(gmPreview.blocked, false, "GM is not blocked");
  assert.ok(gmPreview.lines.some(l => l.includes("as GM you may still undo it")));
});
