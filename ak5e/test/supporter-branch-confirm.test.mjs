/**
 * Confirm step on the Hexer's Hex controls: the picker is shown first, Cancel resolves null, and nothing is written.
 * (WORKFLOW §3.2: confirm before use; cancelling changes nothing.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();
const dialogs = [];
// Foundry's DialogV2 resolves a Cancel as `(await callback()) ?? action`: a callback returning null resolves to "cancel".
const cancelLikeFoundry = async options => {
  const button = options.buttons.find(candidate => candidate.action === "cancel");
  return (await button.callback?.(null, {}, null)) ?? button.action;
};
globalThis.foundry.applications = { api: { DialogV2: { wait: async options => { dialogs.push(options); return cancelLikeFoundry(options); }, confirm: async options => { dialogs.push(options); return false; } } } };
const { SUPPORTER_BRANCH_MODULES, initSupporterBranches } = await import("../scripts/supporter-branches.mjs");
await import("../scripts/supporter-branch-index.mjs");
const { supporterUses } = await import("../scripts/supporter-uses.mjs");

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

for (const cmd of ["potentHex", "cursemark"]) {
  test(`Hexer "${cmd}": the picker is shown first, Cancel resolves null and records no use`, async () => {
    initSupporterBranches();
    const actor = hexer();
    dialogs.length = 0;
    const result = await SUPPORTER_BRANCH_MODULES.get("hexer").command(actor, cmd);
    assert.equal(result, null, "Cancel resolves null");
    assert.equal(dialogs.length, 1, "one confirm step was shown");
    assert.equal(supporterUses.uses(actor).length, 0, "no use recorded");
  });
}
