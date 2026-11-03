/** Checkpoint-1 regressions: linked undo composition, target drift, and relay recovery. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor
} from "./base-classes-fixture.mjs";
import { appendLinkedReceipt, previewArtUndo, registerArtRelayHooks, registerRelayOperation } from "../scripts/arts-ledger.mjs";
import { openArtUndoList, undoArtReceipt } from "../scripts/arts-casting.mjs";

let warnings;
test.beforeEach(() => {
  warnings = [];
  setupFoundryGlobals({ isGM: false, settings: { "ak5e.artReceiptEpoch": 0 }, onWarn: message => warnings.push(message) });
});
test.afterEach(() => teardownFoundryGlobals());

function receipt(id, actor, changes = []) {
  return { id, actorUuid: actor.uuid, status: "available", epoch: 0, windowId: "free:0", changes };
}

async function sourceWithParent(id, parentId = `${id}-parent`) {
  const source = createTestActor({ id, name: id, owner: true });
  await source.update({ "flags.ak5e.artReceipts": [receipt(parentId, source)] });
  return { source, parentId };
}

async function ownedTargetChild({ id, current = 20, after = 20, restore = 12, parentId = `${id}-parent` }) {
  const { source, parentId: parent } = await sourceWithParent(id, parentId);
  const target = createTestActor({ id: `${id}-target`, name: "Target", hp: { value: current, max: 30, temp: 0 } });
  const child = { id: `${id}-child`, relay: {
    targetUuid: target.uuid,
    changes: { "system.attributes.hp.value": after },
    restore: { "system.attributes.hp.value": restore }
  } };
  await appendLinkedReceipt(source, parent, child);
  return { source, target, parentId: parent, childId: child.id };
}

test("A-CP1 target undo restores a clean owned-target relay to captured before-state", async () => {
  const { source, target, childId } = await ownedTargetChild({ id: "cp1-clean", current: 20, after: 20, restore: 12 });
  const result = await undoArtReceipt(source, childId);
  assert.equal(target.system.attributes.hp.value, 12);
  assert.equal(result.conflictCount, 0);
});

test("A-CP1 target undo preserves later owned-target HP drift and reports a conflict", async () => {
  const { source, target, childId } = await ownedTargetChild({ id: "cp1-drift", current: 20, after: 20, restore: 12 });
  await target.update({ "system.attributes.hp.value": 15 });
  const result = await undoArtReceipt(source, childId);
  assert.equal(target.system.attributes.hp.value, 15, "undo must not overwrite the later target change");
  assert.ok(result.conflicts.some(conflict => /system\.attributes\.hp\.value/.test(conflict.path)));
  assert.ok(warnings.length > 0, "preserved target drift must be visible");
});

test("A-CP1 owned-target relay requires explicit before-state provenance", async () => {
  const { source, parentId } = await sourceWithParent("cp1-no-provenance");
  const target = createTestActor({ id: "cp1-no-provenance-target", hp: { value: 20, max: 30, temp: 0 } });
  await assert.rejects(appendLinkedReceipt(source, parentId, { id: "cp1-no-provenance-child", relay: {
    targetUuid: target.uuid, changes: { "system.attributes.hp.value": 20 }
  } }), /before|restore|captur|relay/i);
  assert.equal(target.system.attributes.hp.value, 20, "without explicit before-state provenance, do not infer or mutate");
});

test("A-CP1 serialized owned relay without a usable after-state preserves the target", async () => {
  const { source, parentId } = await sourceWithParent("cp1-missing-after");
  const target = createTestActor({ id: "cp1-missing-after-target", hp: { value: 20, max: 30, temp: 0 } });
  const child = {
    id: "cp1-missing-after-child", actorUuid: source.uuid, parentReceiptId: parentId,
    status: "available", epoch: 0, windowId: "free:0", changes: [],
    relay: { targetUuid: target.uuid, restore: { "system.attributes.hp.value": 12 } }
  };
  await source.update({ "flags.ak5e.artReceipts": [
    ...source.flags.ak5e.artReceipts, structuredClone(child)
  ] });
  const result = await undoArtReceipt(source, child.id);
  assert.equal(target.system.attributes.hp.value, 20, "a serialized restore value without a recorded after-state cannot authorize blind restoration");
  assert.ok(result.conflictCount > 0, "missing post-state provenance is surfaced as an unsafe conflict");
});

test("A-CP1 owned-target undo rejects a tampered claimed after-state", async () => {
  const { source, target, childId } = await ownedTargetChild({ id: "cp1-tampered-after", current: 20, after: 20, restore: 12 });
  const child = source.flags.ak5e.artReceipts.find(entry => entry.id === childId);
  child.relay.changes["system.attributes.hp.value"] = 15;
  const canonicalAfter = child.relay.changesEntries?.find(entry => entry.path === "system.attributes.hp.value");
  assert.ok(canonicalAfter, "fixture has a canonical persisted after-state entry to tamper");
  canonicalAfter.value = 15;
  const result = await undoArtReceipt(source, childId);
  assert.equal(target.system.attributes.hp.value, 20, "tampered post-state provenance cannot authorize restoring an older value");
  assert.ok(result.conflictCount > 0);
});

test("A-CP1 parent undo composes overlapping AP and non-resource child state", async () => {
  const { source, parentId } = await sourceWithParent("cp1-compose");
  await source.update({ "flags.ak5e.artsPoints.value": 8, "flags.ak5e.medic.mode": "parent" });
  await source.update({ "flags.ak5e.resourcePools.shared.value": 8 });
  const parent = receipt(parentId, source, [
    { path: "flags.ak5e.artsPoints.value", before: 10, after: 8 },
    { path: "flags.ak5e.resourcePools.shared.value", before: 10, after: 8 },
    { path: "flags.ak5e.medic.mode", before: "old", after: "parent" }
  ]);
  await source.update({ "flags.ak5e.artReceipts": [parent] });
  await source.update({ "flags.ak5e.artsPoints.value": 6, "flags.ak5e.medic.mode": "child" });
  await source.update({ "flags.ak5e.resourcePools.shared.value": 6 });
  await appendLinkedReceipt(source, parentId, { id: "cp1-compose-child" }, [
    { path: "flags.ak5e.artsPoints.value", before: 8, after: 6 },
    { path: "flags.ak5e.resourcePools.shared.value", before: 8, after: 6 },
    { path: "flags.ak5e.medic.mode", before: "parent", after: "child" }
  ]);
  const result = await undoArtReceipt(source, parentId);
  assert.equal(source.flags.ak5e.artsPoints.value, 10, "reverse composition restores the state before both spends");
  assert.equal(source.flags.ak5e.resourcePools.shared.value, 10, "shared-pool spend also restores across child/parent layers");
  assert.equal(source.flags.ak5e.medic.mode, "old", "successive child then parent state is restored");
  assert.equal(source.flags.ak5e.artReceipts.find(entry => entry.id === parentId).status, "undone");
  assert.equal(source.flags.ak5e.artReceipts.find(entry => entry.id === "cp1-compose-child").status, "undone");
  assert.equal(result.conflictCount, 0);
});

test("A-CP1 parent undo skips an already-undone linked child", async () => {
  const { source, parentId } = await sourceWithParent("cp1-already-undone");
  await source.update({ "flags.ak5e.artsPoints.value": 8 });
  const parent = receipt(parentId, source, [{ path: "flags.ak5e.artsPoints.value", before: 10, after: 8 }]);
  await source.update({ "flags.ak5e.artReceipts": [parent] });
  const child = { ...receipt("cp1-already-undone-child", source, [
    { path: "flags.ak5e.artsPoints.value", before: 8, after: 6 }
  ]), parentReceiptId: parentId, status: "undone" };
  await source.update({ "flags.ak5e.artsPoints.value": 8, "flags.ak5e.artReceipts": [parent, child] });
  await undoArtReceipt(source, parentId);
  assert.equal(source.flags.ak5e.artsPoints.value, 10, "an already-reversed child must not be applied again");
  assert.equal(source.flags.ak5e.artReceipts.find(entry => entry.id === child.id).status, "undone");
});

test("A-CP1 undo review exposes linked child/target conflict and Cancel makes no changes", async () => {
  const { source, target, parentId } = await ownedTargetChild({ id: "cp1-cancel", current: 20, after: 20, restore: 12 });
  const child = source.flags.ak5e.artReceipts.find(entry => entry.parentReceiptId === parentId);
  await target.update({ "system.attributes.hp.value": 15 });
  let dialogCount = 0, confirmationHtml = "";
  foundry.applications ??= {};
  foundry.applications.api ??= {};
  const originalDialog = foundry.applications.api.DialogV2;
  foundry.applications.api.DialogV2 = { async wait(config) {
    dialogCount++;
    if (dialogCount === 2) confirmationHtml = `${config.window?.title ?? ""} ${config.content ?? ""}`;
    if (dialogCount === 1) {
      const undo = config.buttons.find(button => button.action === "undo");
      return undo.callback(null, { form: { elements: { receipt: { value: parentId } } } });
    }
    return "cancel";
  } };
  const before = structuredClone(source.flags.ak5e.artReceipts);
  try { await openArtUndoList(source); }
  finally { foundry.applications.api.DialogV2 = originalDialog; }
  assert.deepEqual({
    dialogsShown: dialogCount,
    confirmationIdentifiesChild: confirmationHtml.includes(child.id),
    confirmationShowsTargetConflict: /system\.attributes\.hp\.value/i.test(confirmationHtml),
    targetAfterCancel: target.system.attributes.hp.value,
    receiptsAfterCancel: source.flags.ak5e.artReceipts
  }, {
    dialogsShown: 2,
    confirmationIdentifiesChild: true,
    confirmationShowsTargetConflict: true,
    targetAfterCancel: 15,
    receiptsAfterCancel: before
  }, "confirmation previews linked child/target conflict, then Cancel makes no document changes");
});

// Fake the player-to-GM chat bridge used by the public relay path.
function enableRelayChatDelivery() {
  const original = ChatMessage.implementation.create.bind(ChatMessage.implementation);
  ChatMessage.implementation.create = async data => {
    const message = await original(data);
    const update = message.update.bind(message);
    message.update = async changes => {
      const result = await update(changes);
      await Hooks.callAll("updateChatMessage", message, {}, game.user.id);
      return result;
    };
    queueMicrotask(async () => {
      const requester = game.user;
      game.user = game.users.activeGM;
      try { await Hooks.callAll("createChatMessage", message, {}, message.author.id); }
      finally { game.user = requester; }
    });
    return message;
  };
}

test("A-CP1 relay initial source-intent persistence failure aborts before target mutation", async () => {
  registerArtRelayHooks();
  const { source, parentId } = await sourceWithParent("cp1-prewrite");
  const target = createTestActor({ id: "cp1-prewrite-target", owner: false, hp: { value: 10, max: 20, temp: 0 } });
  enableRelayChatDelivery();
  const update = source.update.bind(source);
  source.update = async changes => {
    if (Object.hasOwn(changes, "flags.ak5e.artReceipts")) throw new Error("fixture: source intent write failed");
    return update(changes);
  };
  game.user = game.users.get("player");
  await assert.rejects(appendLinkedReceipt(source, parentId, { id: "cp1-prewrite-child", relay: {
    targetUuid: target.uuid, operation: { id: "hp-heal", data: { amount: 5 } }
  } }), /intent|persist|write|failed/i);
  assert.equal(target.system.attributes.hp.value, 10, "failed durable intent must prevent remote mutation");
});

test("A-CP1 GM-authoritative target undo preserves later HP drift", async () => {
  registerArtRelayHooks();
  const { source, parentId } = await sourceWithParent("cp1-gm-drift");
  const target = createTestActor({ id: "cp1-gm-drift-target", owner: false, hp: { value: 10, max: 20, temp: 0 } });
  enableRelayChatDelivery();
  game.user = game.users.get("player");
  await appendLinkedReceipt(source, parentId, { id: "cp1-gm-drift-child", relay: {
    targetUuid: target.uuid, operation: { id: "hp-damage", data: { amount: 3 } }
  } });
  assert.equal(target.system.attributes.hp.value, 7, "elected GM applies the named operation");
  await target.update({ "system.attributes.hp.value": 4 });
  const result = await undoArtReceipt(source, "cp1-gm-drift-child");
  assert.equal(target.system.attributes.hp.value, 4, "GM-authoritative post-state conflict must not overwrite later HP");
  assert.ok(result.conflicts.length > 0);
});

test("A-CP1 post-target source finalization failure leaves durable recovery and stable-ID retry is idempotent", async () => {
  registerArtRelayHooks();
  const { source, parentId } = await sourceWithParent("cp1-postwrite");
  const target = createTestActor({ id: "cp1-postwrite-target", owner: false, hp: { value: 10, max: 20, temp: 0 } });
  enableRelayChatDelivery();
  const update = source.update.bind(source);
  let failed = false;
  source.update = async changes => {
    if (!failed && target.system.attributes.hp.value === 15 && Object.hasOwn(changes, "flags.ak5e.artReceipts")) {
      failed = true;
      throw new Error("fixture: source finalization failed");
    }
    return update(changes);
  };
  game.user = game.users.get("player");
  const input = { id: "cp1-postwrite-child", relay: {
    targetUuid: target.uuid, operation: { id: "hp-heal", data: { amount: 5 } }
  } };
  await assert.rejects(appendLinkedReceipt(source, parentId, input), /final|persist|write|failed/i);
  assert.equal(target.system.attributes.hp.value, 15, "the injected fault occurs after the GM applied the operation");
  const persisted = source.flags.ak5e.artReceipts.find(entry => entry.id === input.id);
  let recoveryUndo = false;
  if (persisted?.status === "available") {
    await undoArtReceipt(source, input.id);
    recoveryUndo = target.system.attributes.hp.value === 10;
  }
  const afterRecovery = target.system.attributes.hp.value;
  try { await appendLinkedReceipt(source, parentId, input); } catch { /* retries may report the original persistence error */ }
  assert.deepEqual({ intentVisible: !!persisted, recoveryUndo, stableRetryDidNotReapply: target.system.attributes.hp.value === afterRecovery },
    { intentVisible: true, recoveryUndo: true, stableRetryDidNotReapply: true },
    "post-apply persistence failure must leave a usable durable undo/retry path");
});

test("A-CP1 serialized stable operation ID remains valid after fresh module import", async () => {
  const operationId = "checkpoint1.serialized-validator";
  const path = "flags.ak5e.medic.checkpoint1.rank";
  registerRelayOperation(operationId, {
    validate: (_target, data) => Number.isInteger(data?.rank),
    apply: (_target, data) => ({ [path]: data.rank }),
    validateUpdate: (_target, updates, context) => Object.keys(updates).length === 1 &&
      Object.keys(updates)[0] === path && Number.isInteger(updates[path]) && ["apply", "restore"].includes(context?.phase)
  });
  const { source, parentId } = await sourceWithParent("cp1-reload");
  const target = createTestActor({ id: "cp1-reload-target", owner: false });
  // A fresh ESM import has an empty registration map: exercise the production registration contract, not a closure.
  const fresh = await import(`../scripts/arts-ledger.mjs?checkpoint=${Date.now()}`);
  const unknown = await fresh.appendLinkedReceipt(source, parentId, { id: "cp1-reload-child", relay: {
    targetUuid: target.uuid, operation: { id: operationId, data: { rank: 3 } }
  } }).then(() => false, () => true);
  assert.equal(unknown, true, "unknown operation ID must fail closed after module reload until code registers it again");
  fresh.registerRelayOperation(operationId, {
    validate: (_doc, data) => Number.isInteger(data?.rank),
    apply: (_doc, data) => ({ [path]: data.rank }),
    validateUpdate: (_doc, updates, context) => Object.keys(updates).length === 1 &&
      Object.keys(updates)[0] === path && Number.isInteger(updates[path]) && ["apply", "restore"].includes(context?.phase)
  });
  assert.equal(typeof fresh.relayOperationFor(operationId)?.validateUpdate, "function");
});

/** A relayed heal whose final source write fails after the GM applied it; the source spent 8 -> 6 AP. */
async function failedFinalRelay(id) {
  registerArtRelayHooks();
  const { source, parentId } = await sourceWithParent(id);
  await source.update({ "flags.ak5e.artsPoints.value": 6 });
  const target = createTestActor({ id: `${id}-target`, owner: false, hp: { value: 10, max: 20, temp: 0 } });
  enableRelayChatDelivery();
  game.user = game.users.get("player");
  const update = source.update.bind(source);
  let failed = false;
  source.update = async changes => {
    if (!failed && target.system.attributes.hp.value === 15 && Object.hasOwn(changes, "flags.ak5e.artReceipts")) {
      failed = true;
      throw new Error("fixture: source finalization failed");
    }
    return update(changes);
  };
  const input = { id: `${id}-child`, relay: { targetUuid: target.uuid, operation: { id: "hp-heal", data: { amount: 5 } } } };
  const changes = [{ path: "flags.ak5e.artsPoints.value", before: 8, after: 6 }];
  await assert.rejects(appendLinkedReceipt(source, parentId, input, changes), /final|persist|write|failed/i);
  assert.equal(target.system.attributes.hp.value, 15, "the injected fault occurs after the GM applied the operation");
  const child = () => source.flags.ak5e.artReceipts.find(entry => entry.id === input.id);
  return { source, parentId, target, input, changes, child };
}

test("A-CP1 stable-ID retry after a pending undo keeps the undo state and never refunds the source twice", async () => {
  const { source, parentId, target, input, changes, child } = await failedFinalRelay("cp1-retry-pending");
  await target.update({ "system.attributes.hp.value": 12 }); // drift: the target restore cannot finish yet
  await undoArtReceipt(source, input.id);
  assert.equal(source.flags.ak5e.artsPoints.value, 8, "the first undo restores the source spend");
  assert.deepEqual({ status: child().status, sourceUndone: child().sourceUndone, targetUndoPending: child().targetUndoPending },
    { status: "available", sourceUndone: true, targetUndoPending: true });
  const pending = structuredClone(child());
  game.user = game.users.get("player");
  await new Promise(resolve => setTimeout(resolve, 20));
  try { await appendLinkedReceipt(source, parentId, input, changes); } catch { /* a refusal is also acceptable */ }
  assert.equal(target.system.attributes.hp.value, 12, "the retry must not reapply the target operation");
  const retried = child();
  assert.deepEqual({ status: retried.status, sourceUndone: retried.sourceUndone, targetUndoPending: retried.targetUndoPending,
    undoneBy: retried.undoneBy, undoneAt: retried.undoneAt, targetUndoOutcome: retried.targetUndoOutcome ?? null },
  { status: pending.status, sourceUndone: true, targetUndoPending: true, undoneBy: pending.undoneBy,
    undoneAt: pending.undoneAt, targetUndoOutcome: pending.targetUndoOutcome ?? null },
  "a retry must carry the pending undo state forward");
  await target.update({ "system.attributes.hp.value": 15 });
  await undoArtReceipt(source, input.id).catch(() => {});
  assert.equal(source.flags.ak5e.artsPoints.value, 8, "the source spend is restored exactly once");
});

test("A-CP1 stable-ID retry cannot replace the recorded source changes", async () => {
  const { source, parentId, input, changes, child } = await failedFinalRelay("cp1-retry-changes");
  game.user = game.users.get("player");
  await assert.rejects(appendLinkedReceipt(source, parentId, input, []), /source changes/i);
  await assert.rejects(appendLinkedReceipt(source, parentId, input,
    [{ path: "flags.ak5e.artsPoints.value", before: 20, after: 6 }]), /source changes/i);
  assert.deepEqual(child().changes, changes, "the stored spend is unchanged by a refused retry");
  await undoArtReceipt(source, input.id);
  assert.equal(source.flags.ak5e.artsPoints.value, 8, "undo still restores the original spend");
});

test("A-CP1 stable-ID retry keeps the child's ledger position so a later sibling still undoes first", async () => {
  registerArtRelayHooks();
  const { source, parentId } = await sourceWithParent("cp1-retry-order");
  await source.update({ "flags.ak5e.medic.mode": "a" });
  const target = createTestActor({ id: "cp1-retry-order-target", owner: false, hp: { value: 10, max: 20, temp: 0 } });
  enableRelayChatDelivery();
  game.user = game.users.get("player");
  const update = source.update.bind(source);
  let failed = false;
  source.update = async changes => {
    if (!failed && target.system.attributes.hp.value === 15 && Object.hasOwn(changes, "flags.ak5e.artReceipts")) {
      failed = true;
      throw new Error("fixture: source finalization failed");
    }
    return update(changes);
  };
  const first = { id: "cp1-retry-order-c1", relay: { targetUuid: target.uuid, operation: { id: "hp-heal", data: { amount: 5 } } } };
  const firstChanges = [{ path: "flags.ak5e.medic.mode", before: "a", after: "b" }];
  await update({ "flags.ak5e.medic.mode": "b" });
  await assert.rejects(appendLinkedReceipt(source, parentId, first, firstChanges), /final|persist|write|failed/i);
  await update({ "flags.ak5e.medic.mode": "c" });
  await appendLinkedReceipt(source, parentId, { id: "cp1-retry-order-c2" }, [{ path: "flags.ak5e.medic.mode", before: "b", after: "c" }]);
  await appendLinkedReceipt(source, parentId, first, firstChanges);
  assert.deepEqual(source.flags.ak5e.artReceipts.map(entry => entry.id), [parentId, first.id, "cp1-retry-order-c2"],
    "a retry replaces the child in place");
  const result = await undoArtReceipt(source, parentId);
  assert.deepEqual({ mode: source.flags.ak5e.medic.mode, hp: target.system.attributes.hp.value, conflicts: result?.conflicts?.length ?? 0 },
    { mode: "a", hp: 10, conflicts: 0 }, "parent undo composes C2 then C1 without a false conflict");
});

test("A-CP1 stable-ID retry cannot swap the revert validator", async () => {
  const { registerRelayRevertValidator } = await import("../scripts/arts-ledger.mjs"); // same module instance
  registerRelayRevertValidator("checkpoint1.permissive", () => true);
  const { source, parentId, input, changes, child } = await failedFinalRelay("cp1-retry-validator");
  const storedId = child().relay.validateRevertId;
  await assert.rejects(appendLinkedReceipt(source, parentId,
    { ...input, relay: { ...input.relay, validateRevertId: "checkpoint1.permissive" } }, changes), /validator/i);
  await assert.rejects(appendLinkedReceipt(source, parentId,
    { ...input, relay: { ...input.relay, validateRevert: () => true } }, changes), /validator/i);
  assert.equal(child().relay.validateRevertId, storedId, "a refused retry leaves the stored validator");
  await appendLinkedReceipt(source, parentId, { ...input, relay: { ...input.relay, validateRevertId: storedId } }, changes);
  assert.equal(child().relay.validateRevertId, storedId, "the same validator (explicit or default) may finish the retry");
});
