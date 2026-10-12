import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { confirmMarksmanCommand, registerMarksmanSheetHooks, renderMarksmanResolution } from "../scripts/marksman-sheet.mjs";
import { marksmanUses } from "../scripts/marksman-uses.mjs";

test("Marksman confirm cancellation writes nothing and acceptance supplies a callback with one stable operation ID", async () => {
  const actor = { name: "Marksman", uuid: "Actor.sheet", items: [], flags: { ak5e: { marksman: { enabled: true } } } };
  const command = marksmanUses.command;
  const calls = [], dialogs = [];
  globalThis.foundry = { utils: { randomID: () => "sheet-use" }, applications: { api: { DialogV2: {
    async wait(options) { dialogs.push(options); return null; }
  } } } };
  marksmanUses.command = async (...args) => { calls.push(args); return { used: true }; };
  try {
    assert.equal(await confirmMarksmanCommand(actor, "unerring", { targetName: "Drone" }), null);
    assert.equal(calls.length, 0);
    assert.match(dialogs[0].window.title, /1 Short Rest use/);
    assert.match(dialogs[0].content, /Drone/);
    foundry.applications.api.DialogV2.wait = async () => ({ resolutionNotes: "roof edge" });
    assert.deepEqual(await confirmMarksmanCommand(actor, "unerring", {}), { used: true });
    assert.equal(calls[0][0], actor);
    assert.equal(calls[0][1], "unerring");
    assert.equal(calls[0][2].confirmed, true);
    assert.equal(calls[0][2].resolutionNotes, "roof edge");
    assert.equal(calls[0][3], "sheet-use");
  } finally { marksmanUses.command = command; }
});

test("Marksman registers native V2 header and chat hooks; save controls belong to the target owner", () => {
  const hooks = new Map();
  globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
  registerMarksmanSheetHooks();
  assert.equal(typeof hooks.get("getHeaderControlsApplicationV2"), "function");
  assert.equal(typeof hooks.get("renderChatMessageHTML"), "function");
  const { document } = parseHTML('<html><body><div class="message-content"></div></body></html>');
  globalThis.document = document;
  let rolls = 0;
  const source = { uuid: "Actor.source", isOwner: false };
  const target = { uuid: "Actor.target", isOwner: true, rollSavingThrow: () => { rolls++; } };
  globalThis.fromUuidSync = uuid => uuid === source.uuid ? source : uuid === target.uuid ? target : null;
  const original = marksmanUses.receipt;
  marksmanUses.receipt = () => ({ status: "complete", saveAbility: "wis", saveTargetUuid: target.uuid, result: { dc: 16 } });
  const message = { flags: { ak5e: { [marksmanUses.cardFlag]: { actorUuid: source.uuid, useId: "save-use" } } } };
  try {
    renderMarksmanResolution(message, document.body);
    assert.equal(rolls, 0, "rendering never starts the save");
    assert.equal(document.querySelectorAll("button").length, 1, "the target owner can roll without owning the source");
    renderMarksmanResolution(message, document.body);
    assert.equal(document.querySelectorAll("button").length, 1, "partial renders do not duplicate controls");
    target.isOwner = false;
    document.querySelector(".ak5e-marksman-resolution").remove();
    renderMarksmanResolution(message, document.body);
    assert.equal(document.querySelectorAll("button").length, 0, "observers cannot roll another Actor's save");
  } finally { marksmanUses.receipt = original; }
});

test("Splash detonation cards preserve weapon provenance without offering an Attack Roll", () => {
  const source = { uuid: "Actor.source", isOwner: true };
  globalThis.fromUuidSync = () => source;
  const original = marksmanUses.receipt;
  const message = { flags: { ak5e: { [marksmanUses.cardFlag]: { actorUuid: source.uuid, useId: "splash-use" } } } };
  try {
    for (const command of ["detonateMunition", "secondaryDetonation", "unapproachable"]) {
      const { document } = parseHTML('<html><body><div class="message-content"></div></body></html>');
      globalThis.document = document;
      const receipt = { status: "complete", command, weaponUuid: "Actor.source.Item.launcher" };
      marksmanUses.receipt = () => receipt;
      renderMarksmanResolution(message, document.body);
      assert.equal(document.querySelectorAll("button").length, command === "unapproachable" ? 1 : 0);
      assert.equal(receipt.weaponUuid, "Actor.source.Item.launcher", "source identity stays available for manual damage provenance");
    }
  } finally { marksmanUses.receipt = original; }
});
