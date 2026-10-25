import test from "node:test";
import assert from "node:assert/strict";
import { appendArtReceipt, captureArtChanges, previewArtUndo, undoArtChanges } from "../scripts/arts-ledger.mjs";
import { quoteArt } from "../scripts/arts-rules.mjs";
import { registerArtsHooks, wrapActivityUse } from "../scripts/arts-casting.mjs";
import { isLocked } from "../scripts/play-undo.mjs";

function setPath(object, path, value) {
  const parts = path.split("."), last = parts.pop();
  let cursor = object;
  for (const part of parts) cursor = cursor[part] ??= {};
  cursor[last] = structuredClone(value);
}

function actor(ap = 7) {
  return { id: "caster", uuid: "Actor.caster", documentName: "Actor", isOwner: true,
    flags: { ak5e: { artReceiptEpoch: 4, artsPoints: { value: ap, maximum: 10, ninthLevelCast: false },
      resourcePools: { source: { value: 3 } } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    toObject() { return structuredClone({ _id: this.id, flags: this.flags }); },
    async update(changes) { for (const [path, value] of Object.entries(changes)) setPath(this, path, value); } };
}

test("any current-window cast can be undone without refunding later casts", () => {
  const subject = actor(7);
  const firstChanges = captureArtChanges(subject, { "flags.ak5e.artsPoints.value": 4 });
  subject.flags.ak5e.artsPoints.value = 4;
  const first = appendArtReceipt(subject, { id: "cast-1", cost: 3 }, firstChanges, null)[0];
  const secondChanges = captureArtChanges(subject, { "flags.ak5e.artsPoints.value": 2 });
  subject.flags.ak5e.artsPoints.value = 2;
  const second = appendArtReceipt(subject, { id: "cast-2", cost: 2 }, secondChanges, null)[0];

  const undoFirst = previewArtUndo(subject, first);
  assert.equal(undoFirst.safeCount, 1, "earlier cast's AP spend is independently reversible");
  assert.equal(undoArtChanges(subject, undoFirst)["flags.ak5e.artsPoints.value"], 5,
    "refund the first 3 AP while preserving the second cast's 2 AP spend");
  subject.flags.ak5e.artsPoints.value = 5;
  const undoSecond = previewArtUndo(subject, second);
  assert.equal(undoArtChanges(subject, undoSecond)["flags.ak5e.artsPoints.value"], 7);
});

test("undo after resource recovery cannot refund past the current resource maximum", () => {
  const subject = actor(10);
  const receipt = { id: "cast-before-rest", actorUuid: subject.uuid, status: "available", changes: [
    { path: "flags.ak5e.artsPoints.value", before: 7, after: 4 }
  ] };
  const preview = previewArtUndo(subject, receipt);
  assert.equal(undoArtChanges(subject, preview)["flags.ak5e.artsPoints.value"], 10,
    "restored AP must clamp to the current maximum instead of creating 13 AP");
});

test("Art undo accepts only captured module state and cannot apply forged document paths", () => {
  const subject = actor(4);
  subject.system = { attributes: { hp: { value: 9 } } };
  const forged = { id: "forged", actorUuid: subject.uuid, status: "available", windowId: "free:4",
    changes: [{ path: "system.attributes.hp.value", before: 99, after: 9 }] };
  const preview = previewArtUndo(subject, forged);
  assert.equal(preview.safeCount, 0, "receipt paths must be constrained to captured AK5e state");
  assert.equal(preview.conflictCount, 1, "invalid receipt paths must be surfaced for review");
  assert.deepEqual(undoArtChanges(subject, preview), {});
  assert.equal(subject.system.attributes.hp.value, 9);
});

test("shared encounter epoch locks prior receipts and leaves receipts in the current window undoable", () => {
  let epoch = 4;
  globalThis.game = { settings: { get: () => epoch } };
  const previous = { id: "free", epoch: 4 };
  const current = { id: "combat", epoch: 5 };
  assert.equal(isLocked(previous), false);
  epoch = 5;
  assert.equal(isLocked(previous), true, "starting or ending combat advances the shared encounter window");
  assert.equal(isLocked(current), false, "any receipt in the current window remains undoable");
});

test("capture receipts exclude only the receipt index and preserve exact prior resource fields", () => {
  const subject = actor(3);
  const changes = captureArtChanges(subject, {
    "flags.ak5e.artsPoints.value": 0,
    "flags.ak5e.resourcePools.source.value": 0,
    "flags.ak5e.artReceipts": [{ id: "forged-index" }]
  });
  assert.deepEqual(changes.map(change => change.path), ["flags.ak5e.artsPoints.value", "flags.ak5e.resourcePools.source.value"]);
  assert.equal(changes[0].before, 3);
  assert.equal(changes[0].after, 0);
  assert.equal(changes[1].before, 3);
  assert.equal(changes[1].after, 0);
});

test("combined discount, Growing Power and surcharge preserve the explicitly selected order", () => {
  const state = { enabled: true, configured: true, maximum: 10, value: 10, maximumArtLevel: 5, ninthLevelCast: false };
  const grant = { reduction: 2, minimumCost: 2, caster: { level: 5 } };
  assert.throws(() => quoteArt(state, 3, 3, grant, { surcharge: 1 }), error => error.key === "CasterRuling",
    "the mixed order remains unresolved until a ruling or per-use choice is supplied");
  const discountsFirst = quoteArt(state, 3, 3, { ...grant, caster: { ...grant.caster, costOrder: "discountsThenSurcharge" } }, { surcharge: 1 });
  const surchargeFirst = quoteArt(state, 3, 3, { ...grant, caster: { ...grant.caster, costOrder: "surchargeThenDiscounts" } }, { surcharge: 1 });
  assert.equal(discountsFirst.cost, 3);
  assert.equal(surchargeFirst.cost, 2);
});

test("Arts receipts use shared encounter locks; Arts hooks add no client-side Actor locks or rest boundaries", async () => {
  const handlers = {};
  globalThis.Hooks = { on(name, fn) { (handlers[name] ??= []).push(fn); } };
  globalThis.CONFIG = { DND5E: { activityTypes: {} } };
  const subject = actor(4);
  subject.type = "character";
  subject.flags.ak5e.casting = { enabled: true };
  subject.flags.ak5e.artReceipts = [{ id: "before", status: "available", epoch: 4, windowId: "free:4" }];
  subject.getFlag = function(scope, key) { return this.flags?.[scope]?.[key]; };
  subject.update = async function(changes) {
    this.writes = (this.writes ?? 0) + 1;
    for (const [path, value] of Object.entries(changes)) setPath(this, path, value);
  };
  globalThis.game = { user: { id: "gm", isGM: true }, system: { id: "dnd5e" }, settings: { get: () => false },
    actors: new Map([[subject.id, subject]]) };
  registerArtsHooks();

  assert.equal(handlers.combatStart, undefined, "the shared elected-GM encounter service owns lock transitions");
  assert.equal(handlers.deleteCombat, undefined);
  assert.equal(handlers.combatEnd, undefined);
  for (const callback of handlers["dnd5e.preRestCompleted"] ?? []) await callback(subject, { type: "short" }, { type: "short" });
  assert.equal(subject.flags.ak5e.artReceipts[0].status, "available", "a rest does not lock an encounter receipt");
  assert.equal(subject.flags.ak5e.artReceiptEpoch, 4, "a rest does not advance the encounter epoch");
});

test("wrapped Art use forces native confirmation and suppresses fast-forward and automatic attack/damage rolls", async () => {
  const previous = { game: globalThis.game, ui: globalThis.ui, foundry: globalThis.foundry };
  const subject = { documentName: "Actor", type: "character", uuid: "Actor.confirm", isOwner: true,
    flags: { ak5e: { casting: { enabled: true } } }, writes: 0,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update() { this.writes++; } };
  const item = { type: "spell", system: { level: 1 }, flags: { ak5e: { art: { enabled: true } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
  let rolls = 0, received;
  globalThis.game = { user: { id: "owner", isGM: false }, settings: { get: () => false } };
  globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
  globalThis.foundry = { utils: { randomID: () => "native-confirm" } };
  class NativeActivity {
    actor = subject;
    item = { ...item, actor: subject };
    async use(usage, dialog) { received = { usage, dialog }; return usage.cancel ? undefined : { posted: true }; }
    async rollAttack() { rolls++; }
    async rollDamage() { rolls++; }
  }
  wrapActivityUse(NativeActivity.prototype);
  try {
    const activity = new NativeActivity();
    assert.deepEqual(await activity.use({ fastForward: true, subsequentActions: true }), { posted: true });
    assert.equal(received.dialog.configure, true, "the caller cannot suppress the native Art confirm dialog");
    assert.equal(received.usage.subsequentActions, false, "the caller cannot trigger automatic primary actions");
    assert.equal(rolls, 0, "the use wrapper does not roll attacks or damage");
    await activity.use({ cancel: true, fastForward: true });
    assert.equal(subject.writes, 0, "a cancelled native confirmation does not spend resources");
    assert.equal(rolls, 0);
  } finally {
    globalThis.game = previous.game;
    globalThis.ui = previous.ui;
    globalThis.foundry = previous.foundry;
  }
});
