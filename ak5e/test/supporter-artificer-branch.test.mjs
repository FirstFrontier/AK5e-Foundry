import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();
// Dialogs are stubbed: a cancelled dialog returns null, so every routed control resolves without writing.
const dialogs = [];
globalThis.foundry.applications = { api: { DialogV2: { wait: async options => { dialogs.push(options); return null; } } } };
const { SUPPORTER_BRANCH_MODULES, initSupporterBranches, supporterBranchApis } = await import("../scripts/supporter-branches.mjs");
await import("../scripts/supporter-branch-index.mjs");
const { supporterUses } = await import("../scripts/supporter-uses.mjs");
const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
const { artificerPlans, artificerReadings, artificerPanel, upgradeCapFor } = await import("../scripts/artificer-features.mjs");
const { artificerUpgradePlans, artificerUpgradePanel, upgradeCapFor: upgradeCapForU6 } = await import("../scripts/artificer-upgrades.mjs");

const U5_PLANS = Object.keys(artificerPlans);
const U6_PLANS = Object.keys(artificerUpgradePlans);

function artificer(level = 17, { automatons = [] } = {}) {
  return createTestActor({
    name: `Artificer L${level}`, type: "character", level,
    items: [
      { name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } }
    ],
    flags: {
      ak5e: {
        supporter: { enabled: true, branch: "artificer", aidAbility: "int" },
        artificer: { automatons, covers: [] }
      }
    }
  });
}

/** One live Automaton (turret, with an upgrade) and one destroyed Automaton, so every panel control has a target. */
function artificerWithAutomatons(level = 17) {
  const live = createTestActor({
    name: "Turret", type: "npc", id: "u9-live",
    flags: { ak5e: { automaton: { creator: null, variant: "turret", upgrades: ["aegisSystem"], upgradeUses: {}, personality: null, destroyed: false, exempt: false, attackBonus: 3 } } }
  });
  const dead = createTestActor({
    name: "Platform", type: "npc", id: "u9-dead",
    system: { attributes: { hp: { value: 0, max: 25 } } },
    flags: { ak5e: { automaton: { creator: null, variant: "platform", upgrades: [], upgradeUses: {}, personality: null, destroyed: true, exempt: false, attackBonus: 3 } } }
  });
  const actor = artificer(level, { automatons: [live.uuid, dead.uuid] });
  const docs = { [actor.uuid]: actor, [live.uuid]: live, [dead.uuid]: dead };
  globalThis.fromUuidSync = uuid => docs[uuid] ?? null;
  globalThis.fromUuid = async uuid => globalThis.fromUuidSync(uuid);
  return actor;
}

test("the index registers exactly one artificer module with every U5 and U6 plan composed", () => {
  const modules = [...SUPPORTER_BRANCH_MODULES.values()].filter(definition => definition.id === "supporter-artificer");
  assert.equal(modules.length, 1, "one artificer module");
  const artificerModule = SUPPORTER_BRANCH_MODULES.get("artificer");
  assert.ok(artificerModule, "artificer branch registered");
  assert.equal(artificerModule.id, "supporter-artificer");
  for (const plan of [...U5_PLANS, ...U6_PLANS]) {
    assert.equal(typeof artificerModule.plans[plan], "function", plan);
  }
  assert.equal(Object.keys(artificerModule.plans).length, U5_PLANS.length + U6_PLANS.length, "no plan is dropped or doubled");
  assert.ok(Object.isFrozen(supporterBranchApis().artificer), "the API is frozen");
  assert.ok(supporterBranchApis().artificer.upgrades, "the API exposes the upgrades surface");
});

test("the artificer module declares the Technology Modifier reading", () => {
  const artificerModule = SUPPORTER_BRANCH_MODULES.get("artificer");
  assert.ok(artificerReadings.technologyModifier, "the reading is exported");
  assert.ok(artificerModule.readings.technologyModifier, "the reading is on the module");
  assert.equal(artificerModule.readings.technologyModifier, artificerReadings.technologyModifier);
});

test("initSupporterBranches runs the Artificer pools and hooks once across repeated calls", () => {
  const first = initSupporterBranches();
  assert.ok(first.branches.includes("artificer"));
  assert.doesNotThrow(() => initSupporterBranches());
  assert.deepEqual(initSupporterBranches().branches, first.branches);
});

test("the sheet's branch slot shows the Automaton buttons and the Heavy Duty Upgrade buttons", () => {
  initSupporterBranches();
  const html = supporterPanelHtml(artificerWithAutomatons());
  assert.match(html, /data-supporter-cmd="buildAutomaton"/);
  assert.match(html, /data-supporter-cmd="fortBuilder"/);
  assert.match(html, /data-supporter-cmd="artificerInstallUpgrade"/);
  assert.match(html, /data-supporter-cmd="artificerUseUpgrade"/);
  assert.match(html, /data-supporter-cmd="artificerPersonality"/);
});

test("branch command returns undefined for an unknown control", async () => {
  const command = SUPPORTER_BRANCH_MODULES.get("artificer").command;
  assert.equal(await command(artificerWithAutomatons(), "not-an-artificer-control"), undefined);
});

test("every panel data-supporter-cmd is routable through the branch command", async () => {
  initSupporterBranches();
  const actor = artificerWithAutomatons();
  const panels = `${artificerPanel(actor)}${artificerUpgradePanel(actor)}`;
  const cmds = [...panels.matchAll(/data-supporter-cmd="([^"]+)"/g)].map(match => match[1]);
  assert.equal(cmds.length, 11, `found ${cmds.length} panel controls (8 Artificer, 3 upgrade)`);
  const command = SUPPORTER_BRANCH_MODULES.get("artificer").command;
  const unroutable = [];
  for (const cmd of cmds) {
    dialogs.length = 0;
    let result;
    try { result = await command(actor, cmd); }
    catch (error) { unroutable.push(`${cmd} threw: ${error.message}`); continue; }
    if (result === undefined && dialogs.length === 0) unroutable.push(cmd);
  }
  assert.deepEqual(unroutable, [], "every panel control is handled by the branch");
});

test("a composed Artificer plan reaches its own validation through the Supporter engine", () => {
  initSupporterBranches();
  const actor = artificerWithAutomatons();
  // An Automaton UUID that does not resolve proves the composed U5 plan ran (not an "unknown command" error).
  assert.throws(() => supporterUses.plan(actor, "commandAutomaton", { automatonUuid: "Actor.nope", move: true, action: null }), /no longer exists/);
  // The same for a composed U6 plan: a missing timing is the plan's own check.
  assert.throws(() => supporterUses.plan(actor, "installUpgrade", { automatonUuid: "Actor.u9-live", upgradeId: "aegisSystem", timing: "sometime" }), /Choose a timing/);
});

test("upgradeCapFor is the same function in both modules: 2 at level 16, 3 at level 17", () => {
  assert.equal(upgradeCapFor(artificer(16)), 2);
  assert.equal(upgradeCapFor(artificer(17)), 3);
  assert.equal(upgradeCapForU6(artificer(16)), upgradeCapFor(artificer(16)));
  assert.equal(upgradeCapForU6(artificer(17)), upgradeCapFor(artificer(17)));
});
