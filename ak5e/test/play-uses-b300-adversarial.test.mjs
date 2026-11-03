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

function createWorld() {
  const messages = [];
  let writeCount = 0;
  const reactionState = new Map();
  globalThis.game = {
    user: { id: "gm", name: "GM", isGM: true },
    users: { activeGM: { id: "gm" } },
    combat: null,
    messages,
    time: { worldTime: 0 }
  };
  globalThis.foundry = { utils: { randomID: () => "op-" + Math.random().toString(36).slice(2, 8) } };
  globalThis.fromUuidSync = uuid => uuid ? ({ uuid, name: String(uuid).split(".").pop() }) : null;
  globalThis.fromUuid = async uuid => uuid ? ({ uuid, name: String(uuid).split(".").pop(), isOwner: true, update: async () => {} }) : null;

  globalThis.ChatMessage = {
    implementation: {
      getSpeaker: ({ actor }) => ({ actor: actor.id }),
      async create(message) {
        messages.push(message);
        return { ...message, id: "msg-" + messages.length, uuid: `ChatMessage.msg-${messages.length}` };
      }
    }
  };

  setReactionStore({
    read: actor => reactionState.get(actor.uuid) ?? { max: 1, spent: 0, extra: [], triggers: {}, receipts: {} },
    async write(actor, state) { writeCount += 1; reactionState.set(actor.uuid, structuredClone(state)); }
  });

  const actor = {
    id: "marksman-tester",
    uuid: "Actor.marksmanTester",
    documentName: "Actor",
    name: "Marksman Tester",
    isOwner: true,
    flags: { ak5e: {} },
    system: { resources: { test: { value: 10, max: 10 } } },
    items: [],
    effects: [],
    getRollData() { return { pb: 3, mod: 4 }; },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
      return this;
    }
  };

  const uses = createPlayUses({ ns: "testUses", label: "test use", isMember: () => true });
  return { actor, uses, messages, reactionState, reactionWrites: () => writeCount };
}

/* =========================================================================
 * Part 1: ChatMessage creation failure and retry stress tests
 * ========================================================================= */

test("B-300 Stress: Single formula — 3 consecutive ChatMessage creation failures retain evaluated roll deterministically without duplicate messages", async () => {
  const { actor, uses, messages } = createWorld();
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
      this.total = 14;
      this._total = 14;
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

  uses.register({
    plans: {
      snipe() {
        return {
          title: "Snipe",
          warnings: [],
          apply(_state, receipt) {
            receipt.formula = "2d6+4";
            receipt.result = { snipe: true };
            return {};
          }
        };
      }
    }
  });

  await uses.command(actor, "snipe", { confirmed: true }, "use-snipe-1");
  const initialReceipt = uses.receipt(actor, "use-snipe-1");
  assert.equal(initialReceipt.roll, undefined, "initial receipt has no roll");
  assert.equal(initialReceipt.status, "awaitingRoll");

  // ChatMessage.create will fail 3 times on messages containing rolls
  let failureCount = 0;
  const originalCreate = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async msg => {
    if (msg.rolls?.length && failureCount < 3) {
      failureCount++;
      throw new Error(`simulated dice ChatMessage failure attempt ${failureCount}`);
    }
    return originalCreate(msg);
  };

  // Attempt 1: throws
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "use-snipe-1" }, "roll-attempt-1"),
    /simulated dice ChatMessage failure attempt 1/
  );
  let receiptAfterFail1 = uses.receipt(actor, "use-snipe-1");
  assert.equal(receiptAfterFail1.roll, 14, "attempt 1 evaluated roll total was persisted");
  assert.equal(receiptAfterFail1.diceMessagePublished, false, "attempt 1 diceMessagePublished is false");
  assert.equal(rollEvaluations, 1, "attempt 1 roll evaluated exactly once");
  assert.equal(messages.filter(m => m.rolls?.length).length, 0, "no dice messages delivered yet");

  // Attempt 2: throws again
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "use-snipe-1" }, "roll-attempt-2"),
    /simulated dice ChatMessage failure attempt 2/
  );
  let receiptAfterFail2 = uses.receipt(actor, "use-snipe-1");
  assert.equal(receiptAfterFail2.roll, 14, "attempt 2 evaluated roll total UNCHANGED");
  assert.equal(receiptAfterFail2.diceMessagePublished, false, "attempt 2 diceMessagePublished is false");
  assert.equal(rollEvaluations, 1, "attempt 2 roll was NOT re-evaluated");
  assert.equal(messages.filter(m => m.rolls?.length).length, 0, "still no dice messages delivered");

  // Attempt 3: throws again
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "use-snipe-1" }, "roll-attempt-3"),
    /simulated dice ChatMessage failure attempt 3/
  );
  let receiptAfterFail3 = uses.receipt(actor, "use-snipe-1");
  assert.equal(receiptAfterFail3.roll, 14, "attempt 3 evaluated roll total UNCHANGED");
  assert.equal(receiptAfterFail3.diceMessagePublished, false, "attempt 3 diceMessagePublished is false");
  assert.equal(rollEvaluations, 1, "attempt 3 roll was NOT re-evaluated");
  assert.equal(messages.filter(m => m.rolls?.length).length, 0, "still no dice messages delivered");

  // Attempt 4: succeeds!
  const successResult = await uses.command(actor, "useRoll", { useId: "use-snipe-1" }, "roll-attempt-4");
  assert.equal(successResult.roll, 14, "success result returns persisted roll total");
  let receiptAfterSuccess = uses.receipt(actor, "use-snipe-1");
  assert.equal(receiptAfterSuccess.roll, 14, "success receipt retains roll total");
  assert.equal(receiptAfterSuccess.diceMessagePublished, true, "diceMessagePublished is now true");
  assert.equal(receiptAfterSuccess.status, "complete", "receipt status is complete");
  assert.equal(rollEvaluations, 1, "roll was NEVER re-evaluated across all 4 attempts");

  const diceMessages = messages.filter(m => m.rolls?.length);
  assert.equal(diceMessages.length, 1, "exactly one dice chat message was delivered");
  assert.equal(diceMessages[0].content, "Roll [2d6+4]: 14");
  assert.equal(diceMessages[0].rolls[0].total, 14);

  // Attempt 5: subsequent retry after success returns receipt.result and does not emit duplicate messages
  const retryResult = await uses.command(actor, "useRoll", { useId: "use-snipe-1" }, "roll-attempt-5");
  assert.deepEqual(retryResult, { snipe: true });
  assert.equal(uses.receipt(actor, "use-snipe-1").roll, 14, "persisted roll in receipt remains 14");
  assert.equal(messages.filter(m => m.rolls?.length).length, 1, "no duplicate chat message emitted");
  assert.equal(rollEvaluations, 1, "no re-evaluation occurred");
});

test("B-300 Stress: Typed damage parts (damageParts) — 3 consecutive failures retain rollParts, sums and retry publishes native damage roll", async () => {
  const { actor, uses, messages } = createWorld();
  let damageRollEvaluations = 0;

  class MockDamageRoll {
    constructor(formula, data = {}, options = {}) {
      this.formula = formula;
      this.data = data;
      this.options = options;
      this.type = options.type;
      this.total = null;
      this._evaluated = false;
    }
    async evaluate() {
      damageRollEvaluations++;
      if (this.formula === "2d8") this.total = 11;
      else if (this.formula === "1d6") this.total = 5;
      else this.total = 4;
      this._total = this.total;
      this._evaluated = true;
      return this;
    }
    toJSON() {
      return {
        formula: this.formula,
        type: this.type,
        total: this.total,
        evaluated: this._evaluated
      };
    }
  }
  globalThis.CONFIG = { Dice: { DamageRoll: MockDamageRoll } };

  uses.register({
    plans: {
      munitionsVolley() {
        return {
          title: "Munitions Volley",
          warnings: [],
          apply(_state, receipt) {
            receipt.formula = "2d8+1d6";
            receipt.damageParts = [
              { formula: "2d8", type: "piercing" },
              { formula: "1d6", type: "fire" }
            ];
            receipt.result = { volley: true };
            return {};
          }
        };
      }
    }
  });

  await uses.command(actor, "munitionsVolley", { confirmed: true }, "volley-1");
  const initialReceipt = uses.receipt(actor, "volley-1");
  assert.equal(initialReceipt.roll, undefined);
  assert.equal(initialReceipt.status, "awaitingRoll");

  // Fail ChatMessage.create 3 times
  let failureCount = 0;
  const originalCreate = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async msg => {
    if (msg.rolls?.length && failureCount < 3) {
      failureCount++;
      throw new Error(`simulated damageParts ChatMessage failure ${failureCount}`);
    }
    return originalCreate(msg);
  };

  // Attempt 1: throws
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "volley-1" }, "roll-volley-1"),
    /simulated damageParts ChatMessage failure 1/
  );
  let receipt1 = uses.receipt(actor, "volley-1");
  assert.equal(receipt1.roll, 16, "total sum 11 + 5 = 16 persisted");
  assert.deepEqual(receipt1.rollParts, [
    { type: "piercing", total: 11 },
    { type: "fire", total: 5 }
  ]);
  assert.equal(receipt1.serializedRolls.length, 2);
  assert.equal(receipt1.diceMessagePublished, false);
  assert.equal(damageRollEvaluations, 2, "evaluated 2 parts once");

  // Attempt 2: throws
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "volley-1" }, "roll-volley-2"),
    /simulated damageParts ChatMessage failure 2/
  );
  let receipt2 = uses.receipt(actor, "volley-1");
  assert.equal(receipt2.roll, 16, "roll total unchanged on retry 2");
  assert.equal(damageRollEvaluations, 2, "not re-evaluated on retry 2");

  // Attempt 3: throws
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "volley-1" }, "roll-volley-3"),
    /simulated damageParts ChatMessage failure 3/
  );
  let receipt3 = uses.receipt(actor, "volley-1");
  assert.equal(receipt3.roll, 16, "roll total unchanged on retry 3");
  assert.equal(damageRollEvaluations, 2, "not re-evaluated on retry 3");

  // Attempt 4: succeeds!
  const success = await uses.command(actor, "useRoll", { useId: "volley-1" }, "roll-volley-4");
  assert.equal(success.roll, 16);
  let finalReceipt = uses.receipt(actor, "volley-1");
  assert.equal(finalReceipt.roll, 16);
  assert.equal(finalReceipt.diceMessagePublished, true);
  assert.equal(finalReceipt.status, "complete");
  assert.equal(damageRollEvaluations, 2, "damage parts NEVER re-evaluated across all retries");

  const diceMsgs = messages.filter(m => m.rolls?.length);
  assert.equal(diceMsgs.length, 1, "exactly one damageParts chat message created");
  assert.equal(diceMsgs[0].flags?.dnd5e?.roll?.type, "damage", "marked as dnd5e damage roll");
  assert.equal(diceMsgs[0].rolls.length, 2, "message contains both parts");
  assert.equal(diceMsgs[0].rolls[0].total, 11);
  assert.equal(diceMsgs[0].rolls[1].total, 5);

  // Attempt 5: subsequent retry does not emit duplicate
  const retryResult = await uses.command(actor, "useRoll", { useId: "volley-1" }, "roll-volley-5");
  assert.deepEqual(retryResult, { volley: true });
  assert.equal(messages.filter(m => m.rolls?.length).length, 1, "no duplicate on subsequent retry");
});

test("B-300 Stress: Fallback reconstruction when serializedRolls / serializedRoll are missing from receipt state", async () => {
  const { actor, uses, messages } = createWorld();

  class MockDamageRoll {
    constructor(formula, data = {}, options = {}) {
      this.formula = formula;
      this.data = data;
      this.options = options;
      this.total = null;
    }
  }
  globalThis.CONFIG = { Dice: { DamageRoll: MockDamageRoll } };

  // Simulate a legacy or interrupted receipt that has roll and rollParts but no serializedRolls
  const state = actor.flags.ak5e.testUses ?? { undo: [], data: {} };
  const legacyReceipt = {
    id: "legacy-damage-use",
    command: "legacyAttack",
    title: "Legacy Attack",
    status: "awaitingRoll",
    epoch: 0,
    formula: "1d8+1d4",
    roll: 12,
    rollParts: [{ type: "slashing", total: 8 }, { type: "acid", total: 4 }],
    damageParts: [{ formula: "1d8", type: "slashing" }, { formula: "1d4", type: "acid" }],
    targets: [],
    diceMessagePublished: false
  };
  state.undo.push(legacyReceipt);
  await actor.update({ "flags.ak5e.testUses": state });

  // useRoll executes fallback branch in line 629
  await uses.command(actor, "useRoll", { useId: "legacy-damage-use" }, "roll-legacy");

  const updatedReceipt = uses.receipt(actor, "legacy-damage-use");
  assert.equal(updatedReceipt.roll, 12, "roll total preserved");
  assert.equal(updatedReceipt.diceMessagePublished, true, "marked as published");

  const diceMsgs = messages.filter(m => m.rolls?.length);
  assert.equal(diceMsgs.length, 1);
  assert.equal(diceMsgs[0].rolls[0].total, 8);
  assert.equal(diceMsgs[0].rolls[1].total, 4);
});

/* =========================================================================
 * Part 2: previewUndo descendant collection stress tests
 * ========================================================================= */

test("B-300 Stress: previewUndo handles 4-tier deep hierarchy in reverse execution order", async () => {
  const { actor, uses } = createWorld();

  uses.register({
    plans: {
      action() {
        return {
          title: "Root Action",
          warnings: [],
          apply(_next, receipt) {
            const updates = spendResource(actor, receipt, { path: "system.resources.test.value", amount: 2, label: "Energy" });
            return updates;
          }
        };
      }
    },
    targetKinds: {
      hpAdjustment: {
        preview(_source, _receipt, entry, doc) {
          return `${doc?.name ?? entry.name}: restore ${entry.amount} HP`;
        }
      }
    }
  });

  await uses.command(actor, "action", { confirmed: true }, "root");

  // Create deep hierarchy: Root -> Child -> Grandchild -> GreatGrandchild
  const state = actor.flags.ak5e.testUses;
  state.undo.push({
    id: "child",
    parentUseId: "root",
    command: "childStep",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "hpAdjustment", name: "Goblin", uuid: "Token.Goblin", amount: 10, applied: true }]
  });
  state.undo.push({
    id: "grandchild",
    parentUseId: "child",
    command: "grandchildStep",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "hpAdjustment", name: "Orc", uuid: "Token.Orc", amount: 25, applied: true }]
  });
  state.undo.push({
    id: "great-grandchild",
    parentUseId: "grandchild",
    command: "greatGrandchildStep",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "hpAdjustment", name: "Dragon", uuid: "Token.Dragon", amount: 80, applied: true }]
  });
  await actor.update({ "flags.ak5e.testUses": state });

  const preview = uses.previewUndo(actor, "root");
  assert.equal(preview.locked, false);
  assert.equal(preview.blocked, false);

  // Check lines presence
  const linesStr = preview.lines.join("\n");
  assert.ok(linesStr.includes("Dragon: restore 80 HP"), "contains great-grandchild reversal");
  assert.ok(linesStr.includes("Orc: restore 25 HP"), "contains grandchild reversal");
  assert.ok(linesStr.includes("Goblin: restore 10 HP"), "contains child reversal");
  assert.ok(linesStr.includes("Restores 2 Energy"), "contains root resource refund");

  // Check ordering: deepest descendant first (Dragon, then Orc, then Goblin, then Root resource)
  const dragonIndex = preview.lines.findIndex(l => l.includes("Dragon"));
  const orcIndex = preview.lines.findIndex(l => l.includes("Orc"));
  const goblinIndex = preview.lines.findIndex(l => l.includes("Goblin"));
  const rootIndex = preview.lines.findIndex(l => l.includes("Restores 2 Energy"));

  assert.ok(dragonIndex < orcIndex, "great-grandchild comes before grandchild");
  assert.ok(orcIndex < goblinIndex, "grandchild comes before child");
  assert.ok(goblinIndex < rootIndex, "child comes before root");
});

test("B-300 Stress: previewUndo handles branching trees and accurate reverse tree ordering", async () => {
  const { actor, uses } = createWorld();

  uses.register({
    plans: {
      rootPlan() {
        return {
          title: "Root Plan",
          warnings: [],
          apply(_next, receipt) {
            return spendResource(actor, receipt, { path: "system.resources.test.value", amount: 1, label: "RootCharge" });
          }
        };
      }
    },
    targetKinds: {
      targetKind: {
        preview(_source, _receipt, entry) {
          return `${entry.name}: revert ${entry.amount}`;
        }
      }
    }
  });

  await uses.command(actor, "rootPlan", { confirmed: true }, "root-branch");

  // Tree:
  // Root
  // ├── ChildA (added first)
  // │   ├── GCA1
  // │   └── GCA2
  // └── ChildB (added second)
  //     └── GCB1
  const state = actor.flags.ak5e.testUses;
  state.undo.push({
    id: "childA",
    parentUseId: "root-branch",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "targetKind", name: "ChildA Target", amount: 1, applied: true }]
  });
  state.undo.push({
    id: "gca1",
    parentUseId: "childA",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "targetKind", name: "GCA1 Target", amount: 2, applied: true }]
  });
  state.undo.push({
    id: "gca2",
    parentUseId: "childA",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "targetKind", name: "GCA2 Target", amount: 3, applied: true }]
  });
  state.undo.push({
    id: "childB",
    parentUseId: "root-branch",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "targetKind", name: "ChildB Target", amount: 4, applied: true }]
  });
  state.undo.push({
    id: "gcb1",
    parentUseId: "childB",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "targetKind", name: "GCB1 Target", amount: 5, applied: true }]
  });
  await actor.update({ "flags.ak5e.testUses": state });

  const preview = uses.previewUndo(actor, "root-branch");
  assert.equal(preview.locked, false);
  assert.equal(preview.blocked, false);

  // In collectDescendants:
  // Children of root: [childB, childA] (reversed from undo insertion)
  // childB branch: GCB1 then ChildB
  // childA branch: GCA2, GCA1 then ChildA
  // root: RootCharge
  const gcb1Idx = preview.lines.findIndex(l => l.includes("GCB1 Target"));
  const childBIdx = preview.lines.findIndex(l => l.includes("ChildB Target"));
  const gca2Idx = preview.lines.findIndex(l => l.includes("GCA2 Target"));
  const gca1Idx = preview.lines.findIndex(l => l.includes("GCA1 Target"));
  const childAIdx = preview.lines.findIndex(l => l.includes("ChildA Target"));
  const rootIdx = preview.lines.findIndex(l => l.includes("RootCharge"));

  assert.ok(gcb1Idx < childBIdx, "GCB1 before ChildB");
  assert.ok(childBIdx < gca2Idx, "ChildB branch before ChildA branch");
  assert.ok(gca2Idx < gca1Idx, "GCA2 before GCA1");
  assert.ok(gca1Idx < childAIdx, "GCA1 before ChildA");
  assert.ok(childAIdx < rootIdx, "ChildA before Root");
});

test("B-300 Stress: Encounter window lock propagation from deep descendant blocks non-GM and permits GM", async () => {
  const { actor, uses } = createWorld();

  uses.register({
    plans: {
      action() {
        return {
          title: "Root Action",
          warnings: [],
          apply() { return {}; }
        };
      }
    }
  });

  await uses.command(actor, "action", { confirmed: true }, "root-lock-test");

  const state = actor.flags.ak5e.testUses;
  // Parent is epoch 0 (current encounter window)
  // Child is epoch 0
  // Grandchild is epoch -1 (expired encounter window)
  state.undo.push({
    id: "child-lock",
    parentUseId: "root-lock-test",
    status: "complete",
    epoch: 0
  });
  state.undo.push({
    id: "grandchild-lock",
    parentUseId: "child-lock",
    status: "complete",
    epoch: -1 // LOCKED!
  });
  await actor.update({ "flags.ak5e.testUses": state });

  // Test 1: Non-GM preview is blocked by grandchild's lock
  globalThis.game.user.isGM = false;
  const nonGmPreview = uses.previewUndo(actor, "root-lock-test");
  assert.equal(nonGmPreview.locked, true, "locked is true because grandchild is locked");
  assert.equal(nonGmPreview.blocked, true, "blocked is true for non-GM");
  assert.ok(
    nonGmPreview.lines.some(l => l.includes("Locked: this use's encounter window has ended.")),
    "includes non-GM locked warning line"
  );

  // Test 2: GM preview is NOT blocked
  globalThis.game.user.isGM = true;
  const gmPreview = uses.previewUndo(actor, "root-lock-test");
  assert.equal(gmPreview.locked, true, "locked is true for GM as well");
  assert.equal(gmPreview.blocked, false, "blocked is false for GM");
  assert.ok(
    gmPreview.lines.some(l => l.includes("as GM you may still undo it")),
    "includes GM override notice line"
  );
});

test("B-300 Stress: Undone child receipts are strictly excluded from preview and do not transmit locks", async () => {
  const { actor, uses } = createWorld();

  uses.register({
    plans: {
      action() {
        return {
          title: "Root Action",
          warnings: [],
          apply() { return {}; }
        };
      }
    },
    targetKinds: {
      testTarget: {
        preview(_s, _r, entry) {
          return `Target ${entry.name}: revert ${entry.amount}`;
        }
      }
    }
  });

  await uses.command(actor, "action", { confirmed: true }, "root-undone-test");

  const state = actor.flags.ak5e.testUses;
  // Child 1 is ALREADY status: "undone", and has epoch -1 (expired encounter)
  state.undo.push({
    id: "child-undone",
    parentUseId: "root-undone-test",
    status: "undone",
    epoch: -1, // locked epoch, BUT status is undone!
    targets: [{ kind: "testTarget", name: "UndoneChildTarget", amount: 100, applied: true }]
  });
  // Grandchild under the undone child
  state.undo.push({
    id: "gc-under-undone",
    parentUseId: "child-undone",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "testTarget", name: "GCUnderUndoneTarget", amount: 50, applied: true }]
  });
  // Child 2 is ACTIVE (complete)
  state.undo.push({
    id: "child-active",
    parentUseId: "root-undone-test",
    status: "complete",
    epoch: 0,
    targets: [{ kind: "testTarget", name: "ActiveChildTarget", amount: 20, applied: true }]
  });
  await actor.update({ "flags.ak5e.testUses": state });

  // Non-GM inspects Root
  globalThis.game.user.isGM = false;
  const preview = uses.previewUndo(actor, "root-undone-test");

  // Critical assertion: The locked epoch on the undone child MUST NOT lock the parent!
  assert.equal(preview.locked, false, "undone descendant's locked epoch does NOT lock root");
  assert.equal(preview.blocked, false, "root preview is not blocked");

  // Undone child target must NOT appear in lines
  assert.ok(!preview.lines.some(l => l.includes("UndoneChildTarget")), "undone child target is excluded");
  // Grandchild under undone child must NOT appear in lines
  assert.ok(!preview.lines.some(l => l.includes("GCUnderUndoneTarget")), "grandchild under undone child is excluded");
  // Active child target MUST appear in lines
  assert.ok(preview.lines.some(l => l.includes("ActiveChildTarget")), "active child target is included");
});

test("B-300 Stress: Target reversals handle unapplied targets properly across descendants", async () => {
  const { actor, uses } = createWorld();

  uses.register({
    plans: {
      action() {
        return {
          title: "Root Action",
          warnings: [],
          apply() { return {}; }
        };
      }
    },
    targetKinds: {
      customTarget: {
        preview(_s, _r, entry) {
          return `${entry.name}: applied amount ${entry.amount}`;
        }
      }
    }
  });

  await uses.command(actor, "action", { confirmed: true }, "root-unapplied-test");

  const state = actor.flags.ak5e.testUses;
  state.undo.push({
    id: "child-unapplied",
    parentUseId: "root-unapplied-test",
    status: "complete",
    epoch: 0,
    targets: [
      { kind: "customTarget", name: "AppliedTarget", amount: 15, applied: true },
      { kind: "customTarget", name: "AttemptedTarget", amount: 25, applied: false, attempted: true },
      { kind: "customTarget", name: "UnappliedTarget", amount: 35, applied: false, attempted: false }
    ]
  });
  await actor.update({ "flags.ak5e.testUses": state });

  const preview = uses.previewUndo(actor, "root-unapplied-test");
  assert.ok(preview.lines.some(l => l.includes("AppliedTarget: applied amount 15")), "applied target previewed");
  assert.ok(preview.lines.some(l => l.includes("AttemptedTarget: applied amount 25")), "attempted target previewed");
  assert.ok(preview.lines.some(l => l.includes("UnappliedTarget: nothing was applied yet.")), "unapplied target noted");
});

test("B-300 Stress: collectDescendants handles corrupted circular parentUseId references without infinite loop", async () => {
  const { actor, uses } = createWorld();

  uses.register({
    plans: {
      action() {
        return { title: "Loop Action", warnings: [], apply() { return {}; } };
      }
    }
  });

  await uses.command(actor, "action", { confirmed: true }, "cycle-root");

  const state = actor.flags.ak5e.testUses;
  // Corrupt state with cycle: cycle-root -> cycle-child -> cycle-child (or cycle-child -> cycle-root)
  state.undo.push({
    id: "cycle-child-1",
    parentUseId: "cycle-root",
    status: "complete",
    epoch: 0
  });
  state.undo.push({
    id: "cycle-child-2",
    parentUseId: "cycle-child-1",
    status: "complete",
    epoch: 0
  });
  // Cycle back to cycle-child-1
  state.undo.push({
    id: "cycle-child-3",
    parentUseId: "cycle-child-2",
    status: "complete",
    epoch: 0
  });
  // Mutate parentUseId to create cycle: cycle-child-1's child is cycle-child-2, whose child is cycle-child-3, whose child is cycle-child-1!
  state.undo.find(e => e.id === "cycle-child-1").parentUseId = "cycle-child-3";

  await actor.update({ "flags.ak5e.testUses": state });

  // Must not throw RangeError: Maximum call stack size exceeded
  assert.doesNotThrow(() => {
    uses.previewUndo(actor, "cycle-root");
  }, "cycle in parentUseId does not crash previewUndo");
});

test("B-300 Stress: resolveRoll is deferred until ChatMessage succeeds and never runs on failed publication", async () => {
  const { actor, uses } = createWorld();
  let resolverCallCount = 0;

  class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 15;
      this._evaluated = false;
    }
    async evaluate() {
      this._evaluated = true;
      return this;
    }
    async toMessage(msgData = {}) {
      return ChatMessage.implementation.create({ ...msgData, rolls: [this], content: "Roll: 15" });
    }
    toJSON() {
      return { formula: this.formula, total: this.total, evaluated: true };
    }
  }
  globalThis.Roll = MockRoll;

  uses.register({
    plans: {
      deferredPlan() {
        return {
          title: "Deferred Plan",
          warnings: [],
          apply(_s, receipt) {
            receipt.formula = "1d20";
            return {};
          },
          async resolveRoll(_actor, receipt, _state) {
            resolverCallCount++;
            receipt.customResolvedMarker = true;
          }
        };
      }
    }
  });

  await uses.command(actor, "deferredPlan", { confirmed: true }, "deferred-1");

  let failCreate = true;
  const originalCreate = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async msg => {
    if (failCreate && msg.rolls?.length) {
      failCreate = false;
      throw new Error("fail dice create");
    }
    return originalCreate(msg);
  };

  // Attempt 1 fails during ChatMessage creation
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "deferred-1" }, "roll-deferred-1"),
    /fail dice create/
  );

  // Critical check: resolveRoll was NOT executed because ChatMessage creation failed
  assert.equal(resolverCallCount, 0, "resolveRoll was not called on failed publication attempt");
  let receipt1 = uses.receipt(actor, "deferred-1");
  assert.equal(receipt1.customResolvedMarker, undefined);
  assert.equal(receipt1.rollResolved, undefined);

  // Attempt 2 succeeds
  await uses.command(actor, "useRoll", { useId: "deferred-1" }, "roll-deferred-2");

  assert.equal(resolverCallCount, 1, "resolveRoll executed exactly once on success");
  let receipt2 = uses.receipt(actor, "deferred-1");
  assert.equal(receipt2.customResolvedMarker, true);
  assert.equal(receipt2.rollResolved, true);

  // Attempt 3 does not re-invoke resolveRoll
  await uses.command(actor, "useRoll", { useId: "deferred-1" }, "roll-deferred-3");
  assert.equal(resolverCallCount, 1, "resolveRoll is idempotent and not re-executed");
});

test("B-300 Stress: target rolled callback runs once on initial evaluation and is not re-invoked on retry", async () => {
  const { actor, uses } = createWorld();
  let rolledCallbackCount = 0;

  class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 18;
      this._evaluated = false;
    }
    async evaluate() {
      this._evaluated = true;
      return this;
    }
    async toMessage(msgData = {}) {
      return ChatMessage.implementation.create({ ...msgData, rolls: [this], content: "Roll: 18" });
    }
    toJSON() {
      return { formula: this.formula, total: this.total, evaluated: true };
    }
  }
  globalThis.Roll = MockRoll;

  globalThis.fromUuid = async uuid => uuid ? ({ uuid, name: String(uuid).split(".").pop(), documentName: "Actor", isOwner: true, update: async () => {} }) : null;

  uses.register({
    plans: {
      targetAction() {
        return {
          title: "Target Action",
          warnings: [],
          apply(_s, receipt) {
            receipt.formula = "1d20+2";
            receipt.targets = [
              { kind: "customRolledTarget", name: "Target 1", uuid: "Actor.target1", ready: false, amount: 0 }
            ];
            return {};
          }
        };
      }
    },
    targetKinds: {
      customRolledTarget: {
        rolled(entry, total) {
          rolledCallbackCount++;
          entry.amount = total * 2; // e.g. double damage
        },
        async apply() { return true; }
      }
    }
  });

  await uses.command(actor, "targetAction", { confirmed: true }, "target-act-1");

  let failCreate = true;
  const originalCreate = ChatMessage.implementation.create;
  ChatMessage.implementation.create = async msg => {
    if (failCreate && msg.rolls?.length) {
      failCreate = false;
      throw new Error("chat failure");
    }
    return originalCreate(msg);
  };

  // Attempt 1 fails
  await assert.rejects(
    uses.command(actor, "useRoll", { useId: "target-act-1" }, "roll-target-1"),
    /chat failure/
  );

  assert.equal(rolledCallbackCount, 1, "rolled callback invoked once on initial roll");
  let receipt1 = uses.receipt(actor, "target-act-1");
  assert.equal(receipt1.targets[0].ready, true);
  assert.equal(receipt1.targets[0].amount, 36);

  // Attempt 2 succeeds
  await uses.command(actor, "useRoll", { useId: "target-act-1" }, "roll-target-2");

  assert.equal(rolledCallbackCount, 1, "rolled callback was NOT re-invoked on retry");
  let receipt2 = uses.receipt(actor, "target-act-1");
  assert.equal(receipt2.targets[0].amount, 36, "target amount preserved");
});
