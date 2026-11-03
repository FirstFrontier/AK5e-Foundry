/**
 * U9 adversarial suite: Artificer Supporter branch composition (ak5e/scripts/artificer-branch.mjs).
 *
 * The composed module registers ONE Supporter branch module that merges the two Artificer halves:
 *  - artificer-features.mjs (U5): Automatons, Fort Builder, Professional Engineer, core Artificer plans and panel.
 *  - artificer-upgrades.mjs (U6): Heavy Duty Upgrades, Basic Personality Matrix, Upgrades panel.
 * Pattern follows supporter-hexer-branch.test.mjs and supporter-hexer-adversarial.test.mjs.
 *
 * Expected today: every test that needs the composed module fails until ak5e/scripts/artificer-branch.mjs exists and
 * supporter-branch-index.mjs imports it. All imports are dynamic, so a missing module fails only its own tests.
 *
 * Oracles are copied from the source (AK5e 1.3.1 Ch. 3, Artificer, C3:6858-7075) and from the head's Supporter rulings,
 * never read back from the implementation under test:
 *  - Machine Personality table, rolls 1 to 6 (C3:6916-6921): Taciturn, Caring, Excitable, Warlike, Nervous, Analytic.
 *  - Heavy Duty Upgrade cap: two, or three from Supporter level 17 (Armoured Core).
 *  - Control names: the 8 Artificer panel buttons and the 3 Upgrades panel buttons (their data-supporter-cmd values).
 *
 * Rules applied here (WORKFLOW.md §3.2): confirm before use, Cancel changes nothing, no Roll during plan or render,
 * a missing reading asks the player (never crashes), and an Artificer control never answers for another branch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();

// Roll spy: any construction or evaluation is recorded. A Roll during plan, render or a cancelled control fails a test.
const rollCalls = [];
globalThis.Roll = class SpyRoll {
  constructor(formula) { rollCalls.push(`construct ${formula}`); }
  async evaluate() { rollCalls.push("evaluate"); return this; }
  async toMessage() { return undefined; }
  static async roll() { rollCalls.push("Roll.roll"); throw new Error("Roll.roll must not run during plan or render"); }
};

// DialogV2 stub: every prompt resolves to null (a Cancel). Each shown prompt is recorded.
const dialogCalls = [];
const cancelDialog = async options => { dialogCalls.push(options); return null; };
globalThis.foundry.applications = { api: { DialogV2: { wait: cancelDialog, prompt: cancelDialog } } };

test.beforeEach(() => { rollCalls.length = 0; dialogCalls.length = 0; });
test.after(() => { teardownFoundryGlobals(); });

/* ==========================================================================
   Oracles, loaders and fixtures
   ========================================================================== */

const MISSING = "ak5e/scripts/artificer-branch.mjs is not registered: the composed Artificer branch is missing, or supporter-branch-index.mjs does not import it";

const FEATURE_PLANS = ["artificerSetup", "asOne", "fortBuilder", "buildAutomaton", "commandAutomaton", "rebuildAutomaton", "concussiveMaintenance", "advancedPersonalityMatrix"];
const UPGRADE_PLANS = ["installUpgrade", "useUpgrade", "basicPersonalityMatrix"];
const ALL_PLANS = [...FEATURE_PLANS, ...UPGRADE_PLANS];

const FEATURE_CONTROLS = ["artificerSetup", "buildAutomaton", "commandAutomaton", "asOne", "fortBuilder", "concussiveMaintenance", "rebuildAutomaton", "advancedPersonalityMatrix"];
const UPGRADE_CONTROLS = ["artificerInstallUpgrade", "artificerUseUpgrade", "artificerPersonality"];
const ALL_CONTROLS = [...FEATURE_CONTROLS, ...UPGRADE_CONTROLS];

const MACHINE_PERSONALITIES = ["Taciturn", "Caring", "Excitable", "Warlike", "Nervous", "Analytic"];
const CORE_CONTROLS = ["provideAid", "useAidDie", "lightenTheLoad", "selfSupportiveDie", "lucky", "ignition", "undo", "__open", "__setup", "__progression", "manual:mirror-move"];
const HEXER_CONTROLS = ["potentHex", "ultimateHex", "cursemark", "cursemarkArea", "configureHexerArts"];
const UNKNOWN_CONTROLS = ["not-a-control", "", "__nonexistent"];

// Loaded once. Every import is dynamic; the composed module is looked up separately so its absence fails only tests that need it.
let libs = null;
async function lib() {
  if (!libs) {
    libs = {
      branches: await import("../scripts/supporter-branches.mjs"),
      sheet: await import("../scripts/supporter-sheet.mjs"),
      uses: await import("../scripts/supporter-uses.mjs"),
      features: await import("../scripts/artificer-features.mjs"),
      upgrades: await import("../scripts/artificer-upgrades.mjs"),
      supporterFeatures: await import("../scripts/supporter-features.mjs"),
      pools: await import("../scripts/resource-pools.mjs")
    };
  }
  return libs;
}

/** Imports the branch index (the production entry point), defines the Supporter pools and runs the branch initialiser. */
async function ready() {
  const L = await lib();
  await import("../scripts/supporter-branch-index.mjs");
  L.supporterFeatures.defineSupporterPools();
  L.branches.initSupporterBranches();
  return { ...L, mod: L.branches.SUPPORTER_BRANCH_MODULES.get("artificer") ?? null };
}

/** A Supporter at `level` with a branch subclass (or none). Owned by default. */
function supporter({ level = 17, subclassId = "subclass-supporter-artificer", owner = true } = {}) {
  const items = [{ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }];
  if (subclassId) items.push({ name: "Branch", type: "subclass", flags: { ak5e: { chapterThreeId: subclassId } } });
  const branch = subclassId ? subclassId.replace("subclass-supporter-", "") : null;
  return createTestActor({
    name: `Supporter L${level}${branch ? ` ${branch}` : ""}`, type: "character", level, isOwner: owner, items,
    abilities: { int: { mod: 3, value: 16 } },
    system: { currency: { cp: 0 }, skills: { ak5etech: { total: 5, value: 1 } } },
    flags: {
      ak5e: {
        supporter: branch ? { enabled: true, branch, aidAbility: "cha" } : { enabled: true, aidAbility: "cha" },
        artificer: { automatons: [], covers: [], professionalVariant: null }
      }
    }
  });
}

/** An Artificer (Supporter with the Artificer subclass) at `level`. */
const artificer = (options = {}) => supporter({ ...options, subclassId: "subclass-supporter-artificer" });

/** An Automaton (an NPC with an automaton flag) created by `owner`. */
function automatonOf(owner, { name = "Platform Automaton", variant = "platform", destroyed = false, upgrades = [] } = {}) {
  return createTestActor({
    name, type: "npc", owner: true,
    hp: { value: destroyed ? 0 : 25, max: 25, temp: 0 },
    flags: { ak5e: { automaton: { creator: owner.uuid, variant, upgrades: [...upgrades], personality: null, destroyed } } }
  });
}

/** A level-17 Artificer with one live and one destroyed Automaton, both listed on the Artificer. */
function world({ level = 17 } = {}) {
  const art = artificer({ level });
  const live = automatonOf(art, { name: "Platform Automaton" });
  const dead = automatonOf(art, { name: "Crumbled Automaton", destroyed: true });
  art.flags.ak5e.artificer.automatons = [live.uuid, dead.uuid];
  return { art, live, dead };
}

/** Document state a use could change. Compared before and after each check. */
const snapshot = (...docs) => JSON.stringify(docs.map(doc => ({ flags: doc.flags, system: doc.system, hp: doc.system?.attributes?.hp ?? null })));

/** Settles a call to { value } or { error }, so a control's outcome can be checked without throwing. */
async function outcomeOf(fn) {
  try { return { value: await fn() }; } catch (error) { return { error }; }
}

/** The data-supporter-cmd values in a panel's HTML. */
const controlsIn = html => [...String(html).matchAll(/data-supporter-cmd="([^"]+)"/g)].map(match => match[1]);

/** Warning ids a plan raises. The engine throws PlayWarnings when warnings are present and not overridden, so both paths are read. */
function warningIdsOf(fn) {
  try {
    const plan = fn();
    return (plan.warnings ?? []).map(warning => warning.id);
  } catch (error) {
    if (Array.isArray(error?.warnings)) return error.warnings.map(warning => warning.id);
    throw error;
  }
}

/* ==========================================================================
   Registration and composition
   ========================================================================== */

test("importing the index registers exactly one Artificer module, id supporter-artificer", async () => {
  const { mod, branches } = await ready();
  assert.ok(mod, MISSING);
  assert.equal(mod.id, "supporter-artificer");
  assert.equal(mod.branch, "artificer");
  const registrations = [...branches.SUPPORTER_BRANCH_MODULES.values()].filter(definition => definition.id === "supporter-artificer");
  assert.equal(registrations.length, 1, "one registration with the Artificer id");
});

test("importing the index a second time neither throws nor double-registers", async () => {
  const { mod, branches } = await ready();
  assert.ok(mod, MISSING);
  const size = branches.SUPPORTER_BRANCH_MODULES.size;
  await assert.doesNotReject(() => import("../scripts/supporter-branch-index.mjs?second-import"));
  assert.equal(branches.SUPPORTER_BRANCH_MODULES.size, size, "no new branch was registered");
  assert.equal(branches.SUPPORTER_BRANCH_MODULES.get("artificer"), mod, "the same registered module is kept");
});

test("the two halves export exactly the plan and control names the composition is built from", async () => {
  const { features, upgrades } = await ready();
  assert.deepEqual(Object.keys(features.artificerPlans).sort(), [...FEATURE_PLANS].sort());
  assert.deepEqual(Object.keys(upgrades.artificerUpgradePlans).sort(), [...UPGRADE_PLANS].sort());
  // The Upgrades panel needs no pool, so it can be read without the composed branch. The features panel reads the
  // Fort Builder pool, which only the composed initialiser defines; its controls are checked in the sheet tests instead.
  const art = world().art;
  assert.deepEqual(controlsIn(upgrades.artificerUpgradePanel(art)).sort(), [...UPGRADE_CONTROLS].sort());
});

test("composed plans are exactly the union of both halves' plans, with no key lost, replaced or duplicated", async () => {
  const { mod, features, upgrades } = await ready();
  assert.ok(mod, MISSING);
  const keys = Object.keys(mod.plans);
  assert.deepEqual([...keys].sort(), [...ALL_PLANS].sort());
  const halfKeys = [...Object.keys(features.artificerPlans), ...Object.keys(upgrades.artificerUpgradePlans)];
  assert.equal(new Set(halfKeys).size, halfKeys.length, "the two halves do not share a plan name");
  for (const name of halfKeys) assert.equal(typeof mod.plans[name], "function", `composed plan ${name}`);
});

test("every composed plan is registered with the Supporter engine (none is Unknown)", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const art = world().art;
  for (const name of Object.keys(mod.plans)) {
    try {
      uses.supporterUses.plan(art, name, {});
    } catch (error) {
      assert.doesNotMatch(String(error?.message), /Unknown Supporter plan/, `${name} reaches the engine`);
    }
  }
});

test("readings.technologyModifier is composed and the Supporter engine knows it", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const reading = mod.readings?.technologyModifier;
  assert.ok(reading, "the Technology Modifier reading is on the branch definition");
  assert.deepEqual(reading.options.map(option => option.value).sort(), ["intMod", "techTotal"]);
  assert.ok(uses.supporterUses.readings().technologyModifier, "the engine offers the reading");
});

test("a buildAutomaton plan with no ruling and no data.technologyModifier asks for the reading and does not crash", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const { art } = world();
  const before = snapshot(art);
  const plan = uses.supporterUses.plan(art, "buildAutomaton", { variant: "platform" });
  assert.equal(plan.reading, "technologyModifier", "the plan names the reading it needs");
  const outcome = await outcomeOf(() => uses.supporterUses.command(art, "buildAutomaton", { variant: "platform", confirmed: true }, "u9-reading-1"));
  assert.ok(outcome.error, "the use is not applied without a reading");
  assert.equal(outcome.error.name, "AK5eReading", "the engine asks for the reading (PlayReading), it does not crash");
  assert.equal(outcome.error.key, "technologyModifier");
  assert.equal(snapshot(art), before, "nothing is written before the reading is answered");
});

test("a recorded GM ruling or data.technologyModifier answers the reading", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const ruled = world();
  ruled.art.flags.ak5e.supporter.rulings = { technologyModifier: { value: "intMod", source: "GM ruling recorded in the test", approvedBy: "gm" } };
  const byRuling = await outcomeOf(() => uses.supporterUses.command(ruled.art, "buildAutomaton", { variant: "platform", confirmed: true }, "u9-ruling-1"));
  assert.notEqual(byRuling.error?.name, "AK5eReading", "a GM ruling answers the reading");

  const byData = await outcomeOf(() => uses.supporterUses.command(world().art, "buildAutomaton", { variant: "platform", confirmed: true, technologyModifier: "intMod" }, "u9-data-1"));
  assert.notEqual(byData.error?.name, "AK5eReading", "data.technologyModifier answers the reading");
});

/* ==========================================================================
   Pools, hooks, initialisation and API
   ========================================================================== */

test("initSupporterBranches runs the Fort Builder pool of the features half", async () => {
  const { pools } = await ready();
  assert.ok(pools.getPoolDefinition("artificerFortBuilder"), "the Fort Builder pool is defined");
});

test("the upgrades half is live after initialisation: installing an Upgrade on an Automaton writes it", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const { art, live } = world();
  await uses.supporterUses.execute(art, "installUpgrade", { automatonUuid: live.uuid, upgradeId: "aegisSystem", timing: "creation" }, "u9-install-1");
  assert.ok(live.flags.ak5e.automaton.upgrades.includes("aegisSystem"), "the Automaton records the installed Upgrade");
});

test("the composed hooks install the upgrade rest, Automaton and chat-message listeners", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  const listeners = name => (globalThis.Hooks._hooks.get(name) ?? []).length;
  assert.ok(listeners("dnd5e.restCompleted") >= 1, "upgrade rest recovery (upgrades half)");
  assert.ok(listeners("updateActor") >= 1, "Automaton destroyed check (features half)");
  assert.ok(listeners("createChatMessage") >= 1, "GM relay listener (features half)");
});

test("initSupporterBranches() is idempotent: a second call adds no hooks and keeps the same API object", async () => {
  const { mod, branches } = await ready();
  assert.ok(mod, MISSING);
  const names = ["dnd5e.restCompleted", "updateActor", "createChatMessage", "renderChatMessageHTML"];
  const counts = () => names.map(name => (globalThis.Hooks._hooks.get(name) ?? []).length);
  const apiBefore = branches.supporterBranchApis().artificer;
  const before = counts();
  assert.doesNotThrow(() => branches.initSupporterBranches());
  assert.deepEqual(counts(), before, "no listener was added twice");
  assert.equal(branches.supporterBranchApis().artificer, apiBefore, "the API object is the same");
});

test("api carries the Artificer API and the upgrades surface", async () => {
  const { mod, branches, features, upgrades } = await ready();
  assert.ok(mod, MISSING);
  const api = branches.supporterBranchApis().artificer;
  assert.ok(api, "the Artificer branch declares an API");
  for (const key of Object.keys(features.artificerApi)) assert.ok(Object.hasOwn(api, key), `api.${key}`);
  assert.ok(api.upgrades && typeof api.upgrades === "object", "api.upgrades is present");
  for (const key of Object.keys(upgrades.artificerUpgradeApi)) assert.ok(Object.hasOwn(api.upgrades, key), `api.upgrades.${key}`);
});

test("upgradeCapFor is unified: both halves and the composed API give 2 at level 16 and 3 at level 17", async () => {
  const { mod, branches, features, upgrades } = await ready();
  assert.ok(mod, MISSING);
  const api = branches.supporterBranchApis().artificer;
  assert.equal(features.upgradeCapFor(artificer({ level: 16 })), 2);
  assert.equal(upgrades.upgradeCapFor(artificer({ level: 16 })), 2);
  assert.equal(api.upgradeCapFor(artificer({ level: 16 })), 2);
  assert.equal(features.upgradeCapFor(artificer({ level: 17 })), 3);
  assert.equal(upgrades.upgradeCapFor(artificer({ level: 17 })), 3);
  assert.equal(api.upgradeCapFor(artificer({ level: 17 })), 3);
  for (let level = 1; level <= 20; level++) {
    const expected = level >= 17 ? 3 : 2;
    const actor = artificer({ level });
    assert.equal(features.upgradeCapFor(actor), expected, `features at level ${level}`);
    assert.equal(upgrades.upgradeCapFor(actor), expected, `upgrades at level ${level}`);
    assert.equal(api.upgradeCapFor(actor), expected, `composed API at level ${level}`);
  }
});

test("the Upgrade cap is enforced through the engine: a third Upgrade warns at level 16 and fits at level 17", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  for (const [level, expectCap] of [[16, true], [17, false]]) {
    const art = artificer({ level });
    const live = automatonOf(art, { upgrades: ["aegisSystem", "gasProjectors"] });
    art.flags.ak5e.artificer.automatons = [live.uuid];
    const ids = warningIdsOf(() => uses.supporterUses.plan(art, "installUpgrade", { automatonUuid: live.uuid, upgradeId: "flamethrower", timing: "creation" }));
    assert.equal(ids.includes("cap"), expectCap, `cap warning at level ${level}`);
  }
});

/* ==========================================================================
   Sheet panels
   ========================================================================== */

test("sheetPanel(actor) contains the buttons of BOTH panels and no others", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  const html = mod.sheetPanel(world().art);
  assert.equal(typeof html, "string");
  assert.deepEqual([...new Set(controlsIn(html))].sort(), [...ALL_CONTROLS].sort());
});

test("supporterPanelHtml for a level-17 Artificer shows the branch slot with both halves, in order", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const html = sheet.supporterPanelHtml(world({ level: 17 }).art);
  const slot = html.indexOf("ak5e-supporter-branch-slot");
  const panel = html.indexOf("ak5e-artificer-panel");
  const upgradesPanel = html.indexOf("ak5e-artificer-upgrades");
  assert.ok(slot > -1, "the branch slot is rendered");
  assert.ok(panel > slot, "the Artificer panel is inside the branch slot");
  assert.ok(upgradesPanel > panel, "the Upgrades panel follows the Artificer panel");
  assert.match(html, /Branch: Artificer/);
  for (const cmd of ALL_CONTROLS) assert.ok(html.includes(`data-supporter-cmd="${cmd}"`), `button ${cmd}`);
});

test("a Hexer's panel shows the Hex controls and NO Artificer controls", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const hexer = supporter({ level: 17, subclassId: "subclass-supporter-hexer" });
  const html = sheet.supporterPanelHtml(hexer);
  assert.ok(html.includes('data-supporter-cmd="potentHex"'), "the Hexer's own control is shown");
  for (const cmd of ALL_CONTROLS) assert.ok(!html.includes(`data-supporter-cmd="${cmd}"`), `no Artificer control ${cmd} on a Hexer`);
  assert.ok(!html.includes("ak5e-artificer"), "no Artificer panel markup on a Hexer");
});

test("a non-Artificer Supporter's panel has no Artificer controls", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const core = supporter({ level: 17, subclassId: null });
  const html = sheet.supporterPanelHtml(core);
  assert.ok(html.length > 0, "the Supporter panel renders");
  assert.deepEqual(controlsIn(html).filter(cmd => ALL_CONTROLS.includes(cmd)), []);
  assert.ok(!html.includes("ak5e-artificer"), "no Artificer panel markup");
});

test("a non-owner of the Artificer sees no Artificer control buttons (the owner-only rule applies to branch buttons too)", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const nonOwner = artificer({ level: 17, owner: false });
  const html = sheet.supporterPanelHtml(nonOwner);
  assert.deepEqual(controlsIn(html).filter(cmd => ALL_CONTROLS.includes(cmd)), [], "no Artificer control for a non-owner");
});

/* ==========================================================================
   Command routing
   ========================================================================== */

// One test per panel control. Each runs a Cancel: the control is routed (a value, or a refusal that is not a
// programming error) and nothing changes. All prompts resolve to null, so no control may write on Cancel.
for (const cmd of ALL_CONTROLS) {
  test(`command routes "${cmd}" and a Cancel changes nothing`, async () => {
    const { mod } = await ready();
    assert.ok(mod, MISSING);
    const { art, live, dead } = world();
    const before = snapshot(art, live, dead);
    const outcome = await outcomeOf(() => mod.command(art, cmd));
    assert.ok(outcome.value !== undefined || outcome.error instanceof Error, `"${cmd}" is routed: it returns a value or refuses with an error, never undefined`);
    assert.ok(!(outcome.error instanceof TypeError) && !(outcome.error instanceof ReferenceError), `"${cmd}" does not fail with a programming error: ${outcome.error?.message}`);
    assert.equal(snapshot(art, live, dead), before, `Cancel on "${cmd}" changes nothing`);
  });
}

// Setup and Fort Builder have no form of their own, so the confirm step is the only prompt before they spend or write.
test("Fort Builder and Professional Engineer setup show a confirm step before they write", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  for (const cmd of ["artificerSetup", "fortBuilder"]) {
    const { art, live, dead } = world();
    dialogCalls.length = 0;
    const before = snapshot(art, live, dead);
    await outcomeOf(() => mod.command(art, cmd));
    assert.ok(dialogCalls.length >= 1, `"${cmd}" shows a confirm step (WORKFLOW §3.2: confirm before any resource is spent)`);
    assert.equal(snapshot(art, live, dead), before, `"${cmd}" with a Cancel at that step changes nothing`);
  }
});

test("core Supporter controls, the Hexer controls and unknown controls return undefined, and open no prompt", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  const art = world().art;
  for (const cmd of [...CORE_CONTROLS, ...HEXER_CONTROLS, ...UNKNOWN_CONTROLS]) {
    const result = await mod.command(art, cmd);
    assert.equal(result, undefined, `"${cmd}" is not an Artificer control`);
  }
  assert.deepEqual(dialogCalls, [], "no prompt is opened for a control this branch does not own");
});

test("an Artificer control sent for a non-Artificer actor is refused without a prompt or a write", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  for (const other of [supporter({ level: 17, subclassId: null }), supporter({ level: 17, subclassId: "subclass-supporter-hexer" })]) {
    const before = snapshot(other);
    for (const cmd of ALL_CONTROLS) {
      const outcome = await outcomeOf(() => mod.command(other, cmd));
      assert.ok(outcome.value === undefined || outcome.error instanceof Error, `"${cmd}" is not performed for ${other.name}`);
    }
    assert.equal(snapshot(other), before, `${other.name} is not written`);
    assert.deepEqual(dialogCalls, [], `${other.name} sees no prompt`);
  }
});

/* ==========================================================================
   Rolls, plans and the upgrade half through the engine
   ========================================================================== */

test("no Roll is called while plans are built, the panels render or a control is cancelled", async () => {
  const { mod, uses, sheet } = await ready();
  assert.ok(mod, MISSING);
  const { art, live } = world();
  sheet.supporterPanelHtml(art);
  mod.sheetPanel(art);
  for (const [name, data] of [
    ["buildAutomaton", { variant: "platform" }],
    ["fortBuilder", {}],
    ["installUpgrade", { automatonUuid: live.uuid, upgradeId: "aegisSystem", timing: "creation" }],
    ["useUpgrade", { automatonUuid: live.uuid, upgradeId: "aegisSystem" }],
    ["basicPersonalityMatrix", { automatonUuid: live.uuid }]
  ]) {
    await outcomeOf(() => uses.supporterUses.plan(art, name, data));
  }
  for (const cmd of ALL_CONTROLS) await outcomeOf(() => mod.command(art, cmd));
  assert.deepEqual(rollCalls, [], "no Roll was constructed or evaluated");
});

test("the Basic Personality Matrix applies through the composed engine: choice 2 is Caring", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const { art, live } = world();
  await uses.supporterUses.execute(art, "basicPersonalityMatrix", { automatonUuid: live.uuid, choice: 2 }, "u9-bpm-1");
  assert.equal(live.flags.ak5e.automaton.personality, MACHINE_PERSONALITIES[1]);
  assert.equal(live.flags.ak5e.automaton.personality, "Caring");
});
