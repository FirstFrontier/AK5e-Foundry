import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();
const { SUPPORTER_BRANCH_MODULES, initSupporterBranches, supporterBranchApis } = await import("../scripts/supporter-branches.mjs");
await import("../scripts/supporter-branch-index.mjs");
const { supporterUses } = await import("../scripts/supporter-uses.mjs");
const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");

function hexer(level = 17) {
  return createTestActor({
    name: "Hexer", type: "character", level,
    items: [
      { name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Hexer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-hexer" } } }
    ],
    flags: { ak5e: { supporter: { enabled: true, branch: "hexer", aidAbility: "cha" } } }
  });
}

test("the branch index registers one Hexer module with the Arts and Hex plans composed", () => {
  const hexerModule = SUPPORTER_BRANCH_MODULES.get("hexer");
  assert.ok(hexerModule, "hexer branch registered");
  for (const plan of ["configureHexerArts", "potentHex", "cursemark", "ultimateHex", "ultimateHexPart"]) {
    assert.equal(typeof hexerModule.plans[plan], "function", plan);
  }
  assert.ok(supporterBranchApis().hexer?.arts, "the API exposes the Arts setup alongside the Hexes");
});

test("initSupporterBranches runs the Hexer pools and hooks once", () => {
  initSupporterBranches();
  assert.doesNotThrow(() => initSupporterBranches());
});

test("the sheet's branch slot shows the Arts setup and the Hexes", () => {
  initSupporterBranches();
  const html = supporterPanelHtml(hexer());
  assert.match(html, /data-supporter-cmd="configureHexerArts"/);
  assert.match(html, /data-supporter-cmd="potentHex"/);
});

test("branch command routing leaves unknown controls to the Supporter dispatcher", async () => {
  const command = SUPPORTER_BRANCH_MODULES.get("hexer").command;
  assert.equal(await command(hexer(), "not-a-hexer-control"), undefined);
});

test("composed plans run through the Supporter engine", () => {
  initSupporterBranches();
  // Reaching the Hex plan's own target check proves the engine found the composed plan (not "unknown command").
  assert.throws(() => supporterUses.plan(hexer(), "potentHex", { kind: "looping" }), /target creature for this Hex/);
});
