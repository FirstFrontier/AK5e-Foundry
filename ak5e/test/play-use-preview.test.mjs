import test from "node:test";
import assert from "node:assert/strict";
import { createPlayUses, spendResource } from "../scripts/play-uses.mjs";
import { confirmPlayUse } from "../scripts/play-uses-sheet.mjs";
import { guardFixture, world } from "./guard-fixture.mjs";

function fixture() {
  const docs = world();
  const actor = guardFixture(); docs.set(actor.uuid, actor);
  const engine = createPlayUses({ ns: "previewTest", label: "test", isMember: () => true });
  engine.register({ plans: { activate(_actor, _state, data) {
    return { title: "Activate", costs: [{ amount: 1, label: "charge" }], warnings: [],
      apply(next, receipt) {
        next.data.active = true;
        receipt.summary = "Activated";
        return spendResource(actor, receipt, { path: "system.attributes.hp.temp", amount: 1, label: "charge" });
      } };
  }, save(_actor, _state, data) {
    return { title: "Save", warnings: [], saves: [{ id: "test-save", uuid: data.targetUuid, name: "Patient", ability: "con", dc: 15 }],
      apply(_next, receipt) { receipt.summary = "Waiting for a native saving throw"; return {}; },
      resolveSave(_source, receipt, state, outcome) { state.data.saveSucceeded = outcome.success; receipt.result = outcome; }
    };
  } } });
  return { docs, actor, engine };
}

test("preview never applies a plan or creates receipts; clean use cancellation writes nothing", async () => {
  const { actor, engine } = fixture();
  const before = structuredClone(actor.flags);
  let dialogs = 0;
  foundry.applications = { api: { DialogV2: { wait: async options => {
    dialogs++;
    assert.match(options.content, /1 charge/);
    assert.equal(actor.writes.length, 0);
    return null;
  } } } };
  assert.equal(engine.preview(actor, "activate").costs[0].amount, 1);
  const result = await confirmPlayUse("Activate", extra => engine.command(actor, "activate", extra, "cancelled"),
    { preview: extra => engine.preview(actor, "activate", extra) });
  assert.equal(result, null);
  assert.equal(dialogs, 1);
  assert.equal(actor.writes.length, 0);
  assert.deepEqual(actor.flags, before);
});

test("generic confirmation also prompts before a callback without preview support", async () => {
  fixture();
  let attempted = false;
  foundry.applications = { api: { DialogV2: { wait: async () => null } } };
  await confirmPlayUse("No metadata", () => { attempted = true; });
  assert.equal(attempted, false);
});

test("state undo restores changed leaves and preserves unrelated later state", async () => {
  const { actor, engine } = fixture();
  await engine.command(actor, "activate", { confirmed: true }, "state-undo");
  actor.flags.ak5e.previewTest.data.unrelated = 7;
  await engine.command(actor, "undoUse", { useId: "state-undo" }, "undo-state");
  assert.equal(actor.flags.ak5e.previewTest.data.active, undefined);
  assert.equal(actor.flags.ak5e.previewTest.data.unrelated, 7);
});

test("save bridge rejects unrelated authors and uses only the matching native owner's roll", async () => {
  const { docs, actor, engine } = fixture();
  const target = guardFixture(); target.id = "patient"; target.uuid = "Actor.patient";
  const owner = { id: "patient-owner", isGM: false };
  target.testUserPermission = user => user.id === owner.id;
  docs.set(target.uuid, target);
  await engine.command(actor, "save", { confirmed: true, targetUuid: target.uuid }, "owner-save");
  assert.equal(engine.receipt(actor, "owner-save").status, "awaitingSave");
  const message = {
    documentName: "ChatMessage", uuid: "ChatMessage.save1", author: owner,
    speaker: { actor: target.id }, rolls: [{ total: 12 }],
    flags: { dnd5e: { roll: { type: "save", ability: "con" } }, ak5e: { playSave: {
      ns: engine.ns, sourceUuid: actor.uuid, useId: "owner-save", targetUuid: target.uuid, saveId: "test-save"
    } } }
  };
  await assert.rejects(engine.handleSaveMessage(message, {}, "someone-else"), /target's owner/);
  assert.equal(engine.receipt(actor, "owner-save").saves[0].resolved, undefined);
  await engine.handleSaveMessage(message, {}, owner.id);
  assert.equal(engine.receipt(actor, "owner-save").saves[0].success, false);
  assert.equal(actor.flags.ak5e.previewTest.data.saveSucceeded, false);
  assert.equal(engine.receipt(actor, "owner-save").status, "complete");
  await engine.handleSaveMessage(message, {}, owner.id);
  await engine.command(actor, "undoUse", { useId: "owner-save" }, "undo-save");
  assert.equal(actor.flags.ak5e.previewTest.data.saveSucceeded, undefined);
  await assert.rejects(engine.handleSaveMessage(message, {}, owner.id), /no longer active/);
});

test("keyed operations on one target apply independently and undo only their own changes", async () => {
  const { docs, actor, engine } = fixture();
  const target = guardFixture(); target.uuid = "Actor.target"; docs.set(target.uuid, target);
  engine.register({ plans: { both() {
    return { title: "Two changes", warnings: [],
      validateTarget(_source, _receipt, entry) { return ["first", "second"].includes(entry.key) && entry.path === `flags.ak5e.test.${entry.key}` && entry.value === true; },
      apply(_state, receipt) {
        receipt.targets = ["first", "second"].map(key => ({ key, kind: "flag", uuid: target.uuid, name: target.name, path: `flags.ak5e.test.${key}`, value: true, ready: true }));
        return {};
      }
    };
  } } });
  await engine.command(actor, "both", { confirmed: true }, "two-flags");
  assert.equal(target.flags.ak5e.test.first, true);
  assert.equal(target.flags.ak5e.test.second, true);
  const receipt = engine.receipt(actor, "two-flags");
  receipt.targets[0].path = "flags.ak5e.someoneElse";
  actor.flags.ak5e.previewTest.undo = [receipt];
  await assert.rejects(engine.relayedTargetChange(actor, "apply", { useId: "two-flags", targetUuid: target.uuid, targetKey: "first" }), /not one this use can make/);
  actor.flags.ak5e.previewTest.undo[0].targets[0].path = "flags.ak5e.test.first";
  target.flags.ak5e.test.unrelated = 9;
  await engine.command(actor, "undoUse", { useId: "two-flags" }, "undo-two-flags");
  assert.equal(target.flags.ak5e.test.first, undefined);
  assert.equal(target.flags.ak5e.test.second, undefined);
  assert.equal(target.flags.ak5e.test.unrelated, 9);
});
