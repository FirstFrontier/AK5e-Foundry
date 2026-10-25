import test from "node:test";
import assert from "node:assert/strict";
import { appendArtReceipt, artReceiptUndoAllowed, captureArtChanges, previewArtUndo, undoArtChanges } from "../scripts/arts-ledger.mjs";
import { grantFor, registerArtGrant, undoArtReceipt } from "../scripts/arts-casting.mjs";
import { quoteArt } from "../scripts/arts-rules.mjs";
import { isLocked } from "../scripts/play-undo.mjs";

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let cursor = object;
  for (const part of parts) cursor = cursor[part] ??= {};
  cursor[last] = structuredClone(value);
}
function actor() {
  return { id: "actor-a", uuid: "Actor.actor-a", documentName: "Actor", isOwner: true,
    flags: { ak5e: { artReceiptEpoch: 2, artsPoints: { value: 7, ninthLevelCast: false }, sourceResource: { value: 2 } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, toObject() { return structuredClone({ _id: this.id, flags: this.flags }); },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
}
function setEpoch() { globalThis.game = { ...(globalThis.game ?? {}), settings: { get: () => 2 } }; }

test("native Art receipt snapshots AP, free-use and source consumer updates in one record", () => {
  const subject = actor(), changes = {
    "flags.ak5e.artsPoints.value": 4,
    "flags.ak5e.artFreeUses.bard-performance": 1,
    "flags.ak5e.resourcePools.performance.value": 0,
    "flags.ak5e.lastArtCast": { id: "cast-1" }
  };
  const fields = captureArtChanges(subject, changes);
  assert.deepEqual(fields.map(entry => entry.path), ["flags.ak5e.artsPoints.value", "flags.ak5e.artFreeUses.bard-performance", "flags.ak5e.resourcePools.performance.value"]);
  assert.equal(fields[0].before, 7);
  assert.equal(fields[0].after, 4);
  assert.equal(fields[1].beforeMissing, true);
  assert.equal(fields[1].after, 1);
  const receipt = appendArtReceipt(subject, { id: "cast-1", itemId: "art", cost: 3 }, fields, { started: true, uuid: "Combat.now" })[0];
  assert.equal(receipt.actorUuid, subject.uuid);
  assert.equal(receipt.windowId, "combat:Combat.now");
  assert.equal(receipt.status, "available");
  assert.equal(receipt.changes.length, 3);
});

test("AP shortfall remains overridable and the quote clamps projected resources at zero", () => {
  const quote = quoteArt({ enabled: true, configured: true, value: 2, maximum: 8, maximumArtLevel: 9, ninthLevelCast: false }, 3, 3);
  assert.equal(quote.cost, 3);
  assert.equal(quote.shortfall, 1);
  assert.equal(quote.remaining, 0);
});

test("undo preview restores unchanged paths exactly and preserves later conflicting edits", async () => {
  setEpoch();
  const subject = actor();
  subject.flags.ak5e.artsPoints.value = 4;
  subject.flags.ak5e.sourceResource.value = 1;
  subject.flags.ak5e.sourceResource.mode = "old";
  const receipt = { id: "cast-2", actorUuid: subject.uuid, status: "available", changes: [
    { path: "flags.ak5e.artsPoints.value", before: 7, after: 4 },
    { path: "flags.ak5e.sourceResource.value", before: 2, after: 1 },
    { path: "flags.ak5e.sourceResource.mode", before: "old", after: "cast" }
  ] };
  subject.flags.ak5e.sourceResource.mode = "cast";
  const preview = previewArtUndo(subject, receipt);
  assert.deepEqual(preview.restore.map(change => change.path), ["flags.ak5e.artsPoints.value", "flags.ak5e.sourceResource.value", "flags.ak5e.sourceResource.mode"]);
  subject.flags.ak5e.sourceResource.value = 9;
  subject.flags.ak5e.sourceResource.mode = "later";
  const conflicted = previewArtUndo(subject, receipt);
  assert.deepEqual(conflicted.conflicts.map(change => change.path), ["flags.ak5e.sourceResource.value", "flags.ak5e.sourceResource.mode"]);
  assert.equal(undoArtChanges(subject, conflicted)["flags.ak5e.artsPoints.value"], 7);
  assert.equal(undoArtChanges(subject, conflicted)["flags.ak5e.sourceResource.value"], undefined, "unregistered state values are not treated as resource pools");
  await subject.update({ ...undoArtChanges(subject, conflicted), "flags.ak5e.artReceipts": [{ ...receipt, status: "undone" }] });
  assert.equal(subject.flags.ak5e.artsPoints.value, 7);
  assert.equal(subject.flags.ak5e.sourceResource.value, 9, "later non-resource state changes are preserved");
  assert.equal(subject.flags.ak5e.sourceResource.mode, "later", "later non-resource flag is preserved");
  assert.equal(subject.flags.ak5e.artReceipts[0].status, "undone");
});

test("receipt authority rejects spoofed actors and shared encounter epoch locks prior receipts", () => {
  const subject = actor();
  const entry = { id: "x", actorUuid: "Actor.other", status: "available", epoch: 2, windowId: "combat:old" };
  globalThis.game = { ...(globalThis.game ?? {}), settings: { get: () => 2 } };
  assert.equal(artReceiptUndoAllowed(subject, entry, { isGM: false }), false);
  assert.equal(isLocked(entry), false);
  globalThis.game.settings.get = () => 3;
  assert.equal(isLocked(entry), true);
});

test("undo rejects a non-owner and a receipt belonging to another Actor", async () => {
  setEpoch();
  const subject = actor(); subject.flags.ak5e.artReceipts = [{ id: "owned", actorUuid: subject.uuid, status: "available", windowId: "free:2", changes: [] }];
  globalThis.game = { user: { id: "player", isGM: false } };
  subject.isOwner = false;
  await assert.rejects(undoArtReceipt(subject, "owned"), /own this Actor/);
  subject.isOwner = true;
  await assert.rejects(undoArtReceipt(subject, "missing"), /missing, already undone, or locked/);
  assert.equal(subject.flags.ak5e.artReceipts[0].status, "available");
});

test("chat undo verifies the public card actor and receipt id before applying changes", async () => {
  setEpoch();
  const subject = actor();
  subject.flags.ak5e.artReceipts = [{ id: "valid", actorUuid: subject.uuid, status: "available", epoch: 2, windowId: "free:2", changes: [] }];
  globalThis.game = { user: { id: "owner", isGM: false }, settings: { get: () => 2 } };
  const spoofed = { data: { speaker: { actor: "another-actor" }, flags: { ak5e: { artCast: { id: "valid", actorUuid: subject.uuid } } } } };
  await assert.rejects(undoArtReceipt(subject, "valid", { message: spoofed }), /does not belong/);
  assert.equal(subject.flags.ak5e.artReceipts[0].status, "available");
});

test("source grant adapter is transient and only applies when its source condition is valid", () => {
  const subject = actor(), item = { id: "performance", type: "spell", flags: { ak5e: { art: { enabled: true } } }, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
  registerArtGrant((_actor, _item, usage) => usage.performanceValid
    ? { free: { level: 2, maximum: null, recovery: "manual" }, source: "Bard performance" }
    : {});
  assert.equal(grantFor(item, subject, {}).free, undefined);
  const valid = grantFor(item, subject, { performanceValid: true });
  assert.deepEqual(valid.free, { level: 2, maximum: null, recovery: "manual", spent: 0 });
  assert.equal(item.flags.ak5e.art.free, undefined, "source grant is not persisted as a permanent Art flag");
});
