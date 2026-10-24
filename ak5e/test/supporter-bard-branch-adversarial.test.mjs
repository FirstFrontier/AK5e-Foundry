/**
 * U11 adversarial suite: Bard Supporter branch composition (ak5e/scripts/bard-branch.mjs).
 *
 * The composed module registers ONE Supporter branch module that merges the two landed Bard halves:
 *  - bard-compose.mjs (U7): Performance composition, Soul of the Bard, Speak to the Soul, Emergency Improv.
 *  - bard-perform.mjs (U8): Put on a Performance, Cast next Art, End Performance, Font of Inspiration Aid, and the
 *    turn-start and turn-end Font die rules.
 * Pattern follows supporter-artificer-branch-adversarial.test.mjs (U9), the model for this suite.
 *
 * Expected today: every test that needs the composed module fails until ak5e/scripts/bard-branch.mjs exists and
 * supporter-branch-index.mjs imports it. All imports are dynamic, and the index import is wrapped, so a missing
 * module fails only its own tests.
 *
 * DIALOG EMULATOR. Foundry V13 resolves a clicked button as `(await button.callback?.(...)) ?? button.action`, and
 * an X close resolves null when rejectClose is false (client/applications/api/dialog.mjs). The emulator below does
 * the same. Every dialog is answered with its Cancel: the button whose action is "cancel" when one exists, otherwise
 * the X close (a prompt has only "Continue" and X). Each dialog records the world state at the moment it opened, so a
 * write that happens before the first prompt is visible to the test.
 *
 * Oracles are copied from the source (AK5e 1.3.1 Ch. 3 Bard, C3:L7099-L7147) and from the module files' exported
 * names. They are never read back from the implementation under test.
 *
 * Rules applied (WORKFLOW.md §3.2): confirm before use, Cancel changes nothing, at least one prompt with a Cancel
 * appears before any write, no Roll during plan, render or cancel, and a Bard control never answers for another branch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, triggerLongRest } from "./base-classes-fixture.mjs";

setupFoundryGlobals();

// Roll spy: any construction or evaluation is recorded. A Roll during plan, render or a cancelled control fails a test.
const rollCalls = [];
globalThis.Roll = class SpyRoll {
  constructor(formula) { rollCalls.push(`construct ${formula}`); }
  async evaluate() { rollCalls.push("evaluate"); return this; }
  async toMessage() { return undefined; }
  static async roll() { rollCalls.push("Roll.roll"); throw new Error("Roll.roll must not run during plan or render"); }
};

/* ==========================================================================
   Emulating DialogV2 (Foundry V13, client/applications/api/dialog.mjs)
   ========================================================================== */

/** The probe reads the world state. Set by cancelControl(); each dialog records the state at the moment it opens. */
let probe = null;
/** When set, every dialog is dismissed with X (resolves null) instead of its Cancel button. */
let dismissWithX = false;
/** Every dialog opened, in order: { title, actions, stateAtOpen }. */
const dialogCalls = [];

async function emulateWait(options, buttons) {
  const title = options.window?.title ?? "";
  dialogCalls.push({ title, actions: buttons.map(button => button.action), labels: buttons.map(button => button.label ?? ""), stateAtOpen: probe ? probe() : null });
  // Cancel: the button with action "cancel" when present. A dialog without one, or any dialog while `dismissWithX` is set,
  // is closed with X, which resolves null.
  const cancel = buttons.find(button => button.action === "cancel");
  if (dismissWithX || !cancel) return null;
  const result = await cancel.callback?.(null, { form: { elements: {} }, dataset: { action: cancel.action } }, null);
  return result ?? cancel.action;
}

const emulatedDialogV2 = {
  wait: options => emulateWait(options, options.buttons ?? []),
  prompt: options => emulateWait(options, [{ action: "ok", label: "Confirm", default: true, ...(options.ok ?? {}) }, ...(options.buttons ?? [])])
};
globalThis.foundry.applications = { api: { DialogV2: emulatedDialogV2 } };

test.beforeEach(() => { rollCalls.length = 0; dialogCalls.length = 0; probe = null; dismissWithX = false; });
test.after(() => { teardownFoundryGlobals(); });

/* ==========================================================================
   Oracles, loaders and fixtures
   ========================================================================== */

const MISSING = "ak5e/scripts/bard-branch.mjs is not registered: the composed Bard branch is missing, or supporter-branch-index.mjs does not import it";

const COMPOSE_PLANS = ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "emergencyImprovAid"];
const PERFORM_PLANS = ["startPerformance", "castNextArt", "endPerformance", "fontProvideAid", "clearExpiringCrescendo"];
const ALL_PLANS = [...COMPOSE_PLANS, ...PERFORM_PLANS];

// data-supporter-cmd values of bardComposePanel (bard-compose.mjs L581-L600) and bardPerformPanel (bard-perform.mjs L461-L480).
const COMPOSE_CONTROLS = ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "emergencyImprovAid"];
const PERFORM_CONTROLS = ["bardStartPerformance", "bardCastNextArt", "bardEndPerformance", "bardFontAid"];
const ALL_CONTROLS = [...COMPOSE_CONTROLS, ...PERFORM_CONTROLS];

const ARTIFICER_CONTROLS = ["artificerSetup", "buildAutomaton", "commandAutomaton", "asOne", "fortBuilder", "concussiveMaintenance",
  "rebuildAutomaton", "advancedPersonalityMatrix", "artificerInstallUpgrade", "artificerUseUpgrade", "artificerPersonality"];
const HEXER_CONTROLS = ["potentHex"];
const CORE_CONTROLS = ["provideAid", "useAidDie", "lightenTheLoad", "selfSupportiveDie", "lucky", "ignition", "undo", "__open", "__setup", "__progression", "manual:mirror-move"];
const UNKNOWN_CONTROLS = ["not-a-control", "", "__nonexistent"];

const CONCENTRATION_ARTS = new Set(["Heroism"]);
const MANUAL = new Set(["Cause Fear", "Shield of Faith", "Haste", "Tasha's Mind Whip", "Aura of Life"]);
const MUSE = Object.freeze({ Bless: 1, Bane: 1, Aid: 2, Heroism: 2, "Cause Fear": 2, "Healing Word": 2 });

// Loaded once. Every import is dynamic. The composed module is looked up separately, so its absence fails only the tests that need it.
let libs = null;
async function lib() {
  if (!libs) {
    libs = {
      branches: await import("../scripts/supporter-branches.mjs"),
      sheet: await import("../scripts/supporter-sheet.mjs"),
      uses: await import("../scripts/supporter-uses.mjs"),
      compose: await import("../scripts/bard-compose.mjs"),
      perform: await import("../scripts/bard-perform.mjs"),
      supporterFeatures: await import("../scripts/supporter-features.mjs"),
      pools: await import("../scripts/resource-pools.mjs"),
      triggers: await import("../scripts/trigger-events.mjs")
    };
  }
  return libs;
}

/**
 * Imports the branch index (the production entry point), defines the Supporter pools and runs the branch initialiser.
 * Import errors are recorded, not thrown, so a broken composed module fails only the tests that need it.
 */
let indexError = null;
async function ready() {
  const L = await lib();
  try {
    await import("../scripts/supporter-branch-index.mjs");
  } catch (error) {
    indexError = error;
  }
  L.supporterFeatures.defineSupporterPools();
  try { L.branches.initSupporterBranches(); } catch (error) { indexError = indexError ?? error; }
  const mod = L.branches.SUPPORTER_BRANCH_MODULES.get("bard") ?? null;
  return { ...L, mod, missingReason: mod ? null : `${MISSING}${indexError ? ` (import error: ${indexError.message})` : ""}` };
}

const cap = text => text.charAt(0).toUpperCase() + text.slice(1);

/** A performance: `names` are Art names in order; manual flags come from the Performance Arts table. */
function perf(id, names, extra = {}) {
  return {
    id,
    arts: names.map(artName => ({ name: artName, muse: MUSE[artName] ?? 2, manual: MANUAL.has(artName) })),
    performed: false,
    composedAt: 1,
    ...extra
  };
}
const P3 = (extra = {}) => perf("perf-3", ["Bless", "Aid", "Heroism"], extra);
const PM = (extra = {}) => perf("perf-m", ["Bless", "Cause Fear", "Aid"], extra);

/** Seeded active state (contract shape). */
const activeOf = (performanceId, index, crescendo = 0, castsThisTurn = 0) => ({ performanceId, index, crescendo, castsThisTurn });

/** Foundry's array-index updates write the index in place. The shared fixture would replace the array, so this wrapper writes the index itself. */
function arrayAwareUpdate(actor) {
  const original = actor.update.bind(actor);
  const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
  actor.update = async (changes, options = {}) => {
    const plain = {};
    for (const [path, value] of Object.entries(changes)) {
      const match = path.match(/^(.*)\.(\d+)\.([^.]+)$/);
      const list = match ? getPath(actor, match[1]) : null;
      if (Array.isArray(list)) list[Number(match[2])][match[3]] = value;
      else plain[path] = value;
    }
    return original(plain, options);
  };
  return actor;
}

/**
 * A Bard Supporter at `level` (owner by default). Performances, active state and the Font die are seeded directly, in
 * the contract's stored shape. The Arts are spell items on the sheet, so the engine can read their concentration.
 */
function bard({ level = 17, owner = true, performances = [P3()], active = null, fontDie, branch = "bard", supporter = true, name } = {}) {
  const items = [];
  if (supporter) {
    items.push(createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }));
  }
  if (branch) {
    items.push(createTestItem({ name: `Supporter: ${cap(branch)}`, type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: `subclass-supporter-${branch}` } } }));
  }
  const seen = new Set();
  for (const entry of performances) {
    for (const art of entry.arts) {
      if (art.manual || seen.has(art.name)) continue;
      seen.add(art.name);
      const properties = CONCENTRATION_ARTS.has(art.name) ? new Set(["concentration"]) : new Set();
      items.push(createTestItem({ name: art.name, type: "spell", system: { level: 1, properties } }));
    }
  }
  const abilities = {};
  for (const [key, mod] of Object.entries({ str: -1, dex: 0, con: 0, int: 3, wis: 1, cha: 4 })) abilities[key] = { mod, value: 10 + 2 * mod };
  const bardFlags = { performances: structuredClone(performances), active: structuredClone(active), museTHP: 0 };
  if (fontDie !== undefined) bardFlags.fontDie = fontDie;
  return arrayAwareUpdate(createTestActor({
    name: name ?? `Bard L${level}`, level, owner, items, abilities, hp: { value: 20, max: 20, temp: 0 },
    flags: {
      ak5e: {
        supporter: branch ? { enabled: supporter, branch, aidAbility: "cha" } : { enabled: supporter, aidAbility: "cha" },
        casting: { enabled: true, ability: "cha" },
        artsPoints: { value: 6, maximum: 6, maximumArtLevel: 9 },
        bard: bardFlags,
        bardRest: { open: true, type: "long", at: "2026-10-24T00:00:00.000Z" },
        bardSetup: { done: true, instruments: ["Lute", "Flute", "Drum"], performance: "proficient" }
      }
    }
  }));
}

/** A Performing Bard on P3 at Art index 0 (the first Art not yet cast), Font die held. */
const performingAt = (index = 0, extra = {}) => bard({ performances: [P3()], active: activeOf("perf-3", index), fontDie: true, ...extra });
/** An idle Bard with two composed Performances. */
const idle = (extra = {}) => bard({ performances: [P3(), PM()], ...extra });

/** A plain target creature (no Supporter class), for the Font of Inspiration Aid control. */
const foeActor = () => createTestActor({ name: "Foe", hp: { value: 30, max: 30, temp: 0 } });

/** A Supporter (or Hexer, or Artificer) that is not a Bard, for the cross-branch cases. */
function otherBranch(branch, { level = 17 } = {}) {
  const items = [createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } })];
  if (branch) items.push(createTestItem({ name: `Supporter: ${cap(branch)}`, type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: `subclass-supporter-${branch}` } } }));
  return createTestActor({
    name: `${branch ? cap(branch) : "Core"} L${level}`, level, owner: true, items,
    abilities: { int: { mod: 3, value: 16 } }, hp: { value: 20, max: 20, temp: 0 },
    flags: { ak5e: { supporter: branch ? { enabled: true, branch, aidAbility: "cha" } : { enabled: true, aidAbility: "cha" } } }
  });
}

/** Document state a use could change, read before and after each check: flags, items, effects, pools, chat, writes. */
function stateOf(...actors) {
  return JSON.stringify({
    actors: actors.map(actor => ({
      flags: actor.flags,
      system: actor.system,
      items: [...actor.items.values()].map(item => ({ id: item.id, name: item.name, system: item.system, flags: item.flags })),
      effects: [...(actor.effects?.values?.() ?? [])].map(effect => ({ id: effect.id, changes: effect.changes, disabled: effect.disabled })),
      writes: actor.writes.length,
      created: actor.created.length
    })),
    messages: globalThis.game.messages.length
  });
}

/** Settles a call to { value } or { error }, so a control's outcome can be checked without throwing. */
async function outcomeOf(fn) {
  try { return { value: await fn() }; } catch (error) { return { error }; }
}

/** The data-supporter-cmd values in a panel's HTML. */
const controlsIn = html => [...String(html).matchAll(/data-supporter-cmd="([^"]+)"/g)].map(match => match[1]);

/**
 * Runs one control with Cancel answered to every dialog. Returns the outcome, the state before, the state after and the
 * dialogs shown. `target` (a creature) sets game.user.targets for the Font of Inspiration Aid control, then restores it.
 */
async function cancelControl(mod, actor, cmd, { target = null } = {}) {
  const user = globalThis.game.user;
  const savedTargets = user.targets;
  if (target) user.targets = { first: () => ({ actor: target }) };
  const before = stateOf(actor);
  probe = () => stateOf(actor);
  dialogCalls.length = 0;
  try {
    const outcome = await outcomeOf(() => mod.command(actor, cmd));
    return { outcome, before, after: stateOf(actor), dialogs: [...dialogCalls] };
  } finally {
    probe = null;
    user.targets = savedTargets;
  }
}

/* ==========================================================================
   Registration and composition
   ========================================================================== */

test("importing the index registers exactly one Bard module, id supporter-bard", async () => {
  const { mod, branches } = await ready();
  assert.ok(mod, MISSING);
  assert.equal(mod.id, "supporter-bard");
  assert.equal(mod.branch, "bard");
  const registrations = [...branches.SUPPORTER_BRANCH_MODULES.values()].filter(definition => definition.id === "supporter-bard");
  assert.equal(registrations.length, 1, "one registration with the Bard id");
});

test("importing the index a second time neither throws nor double-registers", async () => {
  const { mod, branches } = await ready();
  assert.ok(mod, MISSING);
  const size = branches.SUPPORTER_BRANCH_MODULES.size;
  await assert.doesNotReject(() => import("../scripts/supporter-branch-index.mjs?second-import"));
  assert.equal(branches.SUPPORTER_BRANCH_MODULES.size, size, "no new branch was registered");
  assert.equal(branches.SUPPORTER_BRANCH_MODULES.get("bard"), mod, "the same registered module is kept");
});

test("the two halves export exactly the plan names the composition is built from", async () => {
  const { compose, perform } = await ready();
  assert.deepEqual(Object.keys(compose.bardComposePlans).sort(), [...COMPOSE_PLANS].sort());
  assert.deepEqual(Object.keys(perform.bardPerformPlans).sort(), [...PERFORM_PLANS].sort());
});

test("composed plans are exactly the union of both halves' plans, with no key lost, replaced or duplicated", async () => {
  const { mod, compose, perform } = await ready();
  assert.ok(mod, MISSING);
  const keys = Object.keys(mod.plans);
  assert.deepEqual([...keys].sort(), [...ALL_PLANS].sort());
  const halfKeys = [...Object.keys(compose.bardComposePlans), ...Object.keys(perform.bardPerformPlans)];
  assert.equal(new Set(halfKeys).size, halfKeys.length, "the two halves do not share a plan name");
  for (const name of halfKeys) assert.equal(typeof mod.plans[name], "function", `composed plan ${name}`);
});

test("every composed plan is registered with the Supporter engine (none is Unknown)", async () => {
  const { mod, uses } = await ready();
  assert.ok(mod, MISSING);
  const actor = performingAt(0);
  for (const name of Object.keys(mod.plans)) {
    try {
      uses.supporterUses.plan(actor, name, {});
    } catch (error) {
      assert.doesNotMatch(String(error?.message), /Unknown Supporter plan/, `${name} reaches the engine`);
    }
  }
});

/* ==========================================================================
   Pools, hooks, initialisation and API
   ========================================================================== */

test("initSupporterBranches defines the Bard pools of the composition half (Speak to the Soul, Emergency Improv)", async () => {
  const { mod, pools } = await ready();
  assert.ok(mod, MISSING);
  for (const id of ["bardSpeakToTheSoul", "bardEmergencyImprov"]) {
    const definition = pools.getPoolDefinition(id);
    assert.ok(definition, `the ${id} pool is defined`);
    // The pool stores its maximum as a formula ({ kind: "fixed", value }) or as a plain number; both mean one use.
    const max = typeof definition.max === "number" ? definition.max : definition.max?.value;
    assert.equal(max, 1, `${id} holds one use`);
  }
});

test("the composition hook is live: a long rest removes unperformed Performances and reopens composition (No Encore, L7114)", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  const actor = bard({ performances: [P3(), PM({ performed: true })] });
  await triggerLongRest(actor);
  assert.deepEqual(actor.flags.ak5e.bard.performances.map(entry => entry.id), ["perf-m"], "only the performed Performance survives");
  assert.equal(actor.flags.ak5e.bardRest.open, true, "composition reopens after the rest");
});

test("the perform hook is live: a turn start gives a Performing Bard of level 4 or higher the Font die", async () => {
  const { mod, triggers } = await ready();
  assert.ok(mod, MISSING);
  const actor = performingAt(0, { fontDie: undefined });
  assert.notEqual(actor.flags.ak5e.bard.fontDie, true, "no Font die before the turn starts");
  await triggers.emitAk5eEvent("turnStart", { actorUuid: actor.uuid });
  assert.equal(actor.flags.ak5e.bard.fontDie, true, "the Font die is gained at turn start (L7146-L7147)");
});

test("initSupporterBranches() is idempotent: a second call adds no hooks, redefines no pool and keeps the same API object", async () => {
  const { mod, branches, pools } = await ready();
  assert.ok(mod, MISSING);
  const restCount = () => (globalThis.Hooks._hooks.get("dnd5e.restCompleted") ?? []).length;
  const poolBefore = pools.getPoolDefinition("bardSpeakToTheSoul");
  const apiBefore = branches.supporterBranchApis().bard;
  const before = restCount();
  assert.doesNotThrow(() => branches.initSupporterBranches());
  assert.equal(restCount(), before, "no rest listener was added twice");
  assert.equal(pools.getPoolDefinition("bardSpeakToTheSoul"), poolBefore, "the pool definition is the same object");
  assert.equal(branches.supporterBranchApis().bard, apiBefore, "the API object is the same");
});

test("api includes the compose API and a perform object carrying the perform API", async () => {
  const { mod, branches, compose, perform } = await ready();
  assert.ok(mod, MISSING);
  const api = branches.supporterBranchApis().bard;
  assert.ok(api, "the Bard branch declares an API");
  for (const key of Object.keys(compose.bardComposeApi)) assert.ok(Object.hasOwn(api, key), `api.${key}`);
  assert.ok(api.perform && typeof api.perform === "object", "api.perform is present");
  for (const key of Object.keys(perform.bardPerformApi)) assert.ok(Object.hasOwn(api.perform, key), `api.perform.${key}`);
});

/* ==========================================================================
   Sheet panels
   ========================================================================== */

test("sheetPanel(actor) holds the buttons of BOTH halves: the composition buttons, and the Performance buttons for each state", async () => {
  const { mod } = await ready();
  assert.ok(mod, MISSING);
  const idleControls = controlsIn(mod.sheetPanel(idle()));
  for (const cmd of [...COMPOSE_CONTROLS, "bardStartPerformance"]) assert.ok(idleControls.includes(cmd), `idle: button ${cmd}`);
  const performingControls = controlsIn(mod.sheetPanel(performingAt(0)));
  for (const cmd of [...COMPOSE_CONTROLS, "bardCastNextArt", "bardEndPerformance", "bardFontAid"]) assert.ok(performingControls.includes(cmd), `performing: button ${cmd}`);
  assert.deepEqual([...new Set([...idleControls, ...performingControls])].sort(), [...ALL_CONTROLS].sort(), "no button outside the nine Bard controls");
});

test("supporterPanelHtml for an owner Bard shows the branch slot with both panels, and every Bard control its state offers", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  for (const [actor, expected] of [
    [idle(), [...COMPOSE_CONTROLS, "bardStartPerformance"]],
    [performingAt(0), [...COMPOSE_CONTROLS, "bardCastNextArt", "bardEndPerformance", "bardFontAid"]]
  ]) {
    const html = sheet.supporterPanelHtml(actor);
    const slot = html.indexOf("ak5e-supporter-branch-slot");
    assert.ok(slot > -1, "the branch slot is rendered");
    assert.ok(html.indexOf("ak5e-bard-panel") > slot, "the composition panel is inside the branch slot");
    assert.ok(html.indexOf("ak5e-bard-perform") > slot, "the Performance panel is inside the branch slot");
    assert.match(html, /Branch: Bard/);
    for (const cmd of expected) assert.ok(html.includes(`data-supporter-cmd="${cmd}"`), `button ${cmd}`);
  }
});

test("a non-owner Bard's panel shows no Bard control and no Bard panel markup", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const html = sheet.supporterPanelHtml(bard({ owner: false, performances: [P3(), PM()] }));
  assert.deepEqual(controlsIn(html).filter(cmd => ALL_CONTROLS.includes(cmd)), [], "no Bard control for a non-owner");
  assert.ok(!html.includes("ak5e-bard-panel") && !html.includes("ak5e-bard-perform"), "no Bard panel markup for a non-owner");
});

test("a Hexer's panel shows the Hex control and NO Bard control", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const html = sheet.supporterPanelHtml(otherBranch("hexer"));
  assert.ok(html.includes('data-supporter-cmd="potentHex"'), "the Hexer's own control is shown");
  assert.deepEqual(controlsIn(html).filter(cmd => ALL_CONTROLS.includes(cmd)), [], "no Bard control on a Hexer");
  assert.ok(!html.includes("ak5e-bard-panel") && !html.includes("ak5e-bard-perform"), "no Bard panel markup on a Hexer");
});

test("an Artificer's panel shows NO Bard control", async () => {
  const { mod, sheet } = await ready();
  assert.ok(mod, MISSING);
  const artificer = otherBranch("artificer");
  artificer.flags.ak5e.artificer = { automatons: [], covers: [], professionalVariant: null };
  const html = sheet.supporterPanelHtml(artificer);
  assert.deepEqual(controlsIn(html).filter(cmd => ALL_CONTROLS.includes(cmd)), [], "no Bard control on an Artificer");
  assert.ok(!html.includes("ak5e-bard-panel") && !html.includes("ak5e-bard-perform"), "no Bard panel markup on an Artificer");
});

/* ==========================================================================
   Command routing and the Cancel rule (WORKFLOW §3.2)
   ========================================================================== */

// One test per Bard control. Each control runs from a state where it is offered. Its first prompt must be its own
// (the half it belongs to), that prompt must appear before any write, and Cancel must change nothing.
// Expected today: a control whose first step is a write, or whose first prompt is missing, fails (see the report).
const CONTROL_CASES = [
  ["composePerformances", /^Compose Performances/, "compose", () => bard({ performances: [] }), null],
  ["bardSetup", /^Soul of the Bard/, "compose", () => idle(), null],
  ["speakToTheSoul", /^Speak to the Soul/, "compose", () => idle(), null],
  ["emergencyImprov", /^Emergency Improv$/, "compose", () => idle(), null],
  ["emergencyImprovAid", /^Emergency Improv: Aid Die/, "compose", () => idle(), null],
  ["bardStartPerformance", /^Put on a Performance/, "perform", () => idle(), null],
  ["bardCastNextArt", /^(End Performance|Cast )/, "perform", () => performingAt(0), null],
  ["bardEndPerformance", /^End Performance/, "perform", () => performingAt(0), null],
  ["bardFontAid", /^Font of Inspiration/, "perform", () => performingAt(0), "target"]
];

for (const [cmd, expectedTitle, half, build, needsTarget] of CONTROL_CASES) {
  test(`command routes "${cmd}" (${half} half): its first prompt comes before any write, and a Cancel changes nothing`, async () => {
    const { mod, missingReason } = await ready();
    assert.ok(mod, missingReason);
    const actor = build();
    const target = needsTarget ? foeActor() : null;
    const { outcome, before, after, dialogs } = await cancelControl(mod, actor, cmd, { target });
    assert.ok(outcome.value !== undefined || outcome.error instanceof Error, `"${cmd}" is routed: it returns a value or refuses with an error, never undefined`);
    assert.ok(!(outcome.error instanceof TypeError) && !(outcome.error instanceof ReferenceError), `"${cmd}" does not fail with a programming error: ${outcome.error?.message}`);
    assert.ok(dialogs.length >= 1, `"${cmd}" shows a prompt with a Cancel before any write (WORKFLOW §3.2): ${dialogs.length} shown`);
    assert.match(dialogs[0].title, expectedTitle, `the first prompt of "${cmd}" belongs to the ${half} half`);
    assert.equal(dialogs[0].stateAtOpen, before, `nothing is written before the first prompt of "${cmd}"`);
    assert.equal(after, before, `Cancel on "${cmd}" changes nothing (flags, pools, items, effects, chat, Aid Dice, writes)`);
  });
}

test("bardCastNextArt on the LAST Art: Cancel (X) on the keep-Concentration prompt changes nothing", async () => {
  const { mod, missingReason } = await ready();
  assert.ok(mod, missingReason);
  // Index 2 is Heroism, the Concentration Art and the last Art of P3: the keep-Concentration prompt opens first (L7108).
  const actor = performingAt(2);
  dismissWithX = true;
  let run;
  try {
    run = await cancelControl(mod, actor, "bardCastNextArt");
  } finally {
    dismissWithX = false;
  }
  const { outcome, before, after, dialogs } = run;
  assert.ok(!(outcome.error instanceof TypeError), `not a programming error: ${outcome.error?.message}`);
  assert.ok(dialogs.length >= 1, "the keep-Concentration prompt is shown");
  // Identified by its buttons, not its title (the title is the last-Art confirm, which may change): "Keep: <Art>" per
  // Concentration Art, "Keep none", and "Cancel".
  const labels = dialogs[0]?.labels ?? [];
  assert.ok(labels.some(label => /^Keep: /.test(label)), "the first prompt offers a \"Keep: <Art>\" button");
  assert.ok(labels.includes("Keep none"), "the first prompt offers \"Keep none\"");
  assert.ok(labels.includes("Cancel"), "the first prompt offers \"Cancel\"");
  assert.equal(dialogs[0].stateAtOpen, before, "nothing is written before that prompt");
  assert.equal(after, before, "closing the prompt cancels the cast: the Art is not cast and nothing is written");
});

test("endPerformance with a Concentration Art already cast: Cancel (X) on the keep prompt returns null and changes nothing", async () => {
  const { mod, missingReason } = await ready();
  assert.ok(mod, missingReason);
  // Index 1 of a Heroism-first Performance: Heroism (Concentration) is cast, so End offers it as the one Art to keep (L7112).
  const actor = bard({ performances: [perf("perf-c", ["Heroism", "Aid", "Bane"])], active: activeOf("perf-c", 1), fontDie: true });
  const { outcome, before, after, dialogs } = await cancelControl(mod, actor, "bardEndPerformance");
  assert.ok(!(outcome.error instanceof TypeError), `not a programming error: ${outcome.error?.message}`);
  assert.ok(dialogs.length >= 1, "the keep prompt is shown before the End");
  assert.equal(dialogs[0].stateAtOpen, before, "nothing is written before the keep prompt");
  assert.equal(outcome.value, null, "the End resolves null on Cancel");
  assert.equal(after, before, "Cancel on End Performance changes nothing");
});

test("core Supporter controls, the Hexer control, the Artificer controls and unknown controls return undefined and open no prompt", async () => {
  const { mod, missingReason } = await ready();
  assert.ok(mod, missingReason);
  const actor = idle();
  for (const cmd of [...CORE_CONTROLS, ...HEXER_CONTROLS, ...ARTIFICER_CONTROLS, ...UNKNOWN_CONTROLS]) {
    const result = await mod.command(actor, cmd);
    assert.equal(result, undefined, `"${cmd}" is not a Bard control`);
  }
  assert.deepEqual(dialogCalls, [], "no prompt is opened for a control this branch does not own");
});

test("a Bard control sent for a non-Bard Supporter, a Hexer, an Artificer or a non-owner Bard is refused without a prompt or a write", async () => {
  const { mod, missingReason } = await ready();
  assert.ok(mod, missingReason);
  const others = [
    ["a core Supporter", otherBranch(null)],
    ["a Hexer", otherBranch("hexer")],
    ["an Artificer", otherBranch("artificer")],
    ["a non-owner Bard", bard({ owner: false, performances: [P3(), PM()] })]
  ];
  for (const [label, actor] of others) {
    const before = stateOf(actor);
    dialogCalls.length = 0;
    for (const cmd of ALL_CONTROLS) {
      const outcome = await outcomeOf(() => mod.command(actor, cmd));
      assert.ok(outcome.value === undefined || outcome.error instanceof Error, `"${cmd}" is not performed for ${label}`);
    }
    assert.equal(stateOf(actor), before, `${label} is not written`);
    assert.deepEqual(dialogCalls, [], `${label} sees no prompt`);
  }
});

/* ==========================================================================
   Rolls, plans and the rest of the surface
   ========================================================================== */

test("no Roll is called while plans are built, the panels render or any control is cancelled", async () => {
  const { mod, uses, sheet } = await ready();
  assert.ok(mod, MISSING);
  const actor = performingAt(0);
  sheet.supporterPanelHtml(actor);
  mod.sheetPanel(actor);
  for (const name of ALL_PLANS) await outcomeOf(() => uses.supporterUses.plan(actor, name, {}));
  for (const cmd of ALL_CONTROLS) await cancelControl(mod, actor, cmd, { target: cmd === "bardFontAid" ? foeActor() : null });
  assert.deepEqual(rollCalls, [], "no Roll was constructed or evaluated");
});

test("the composed command routes a Performance control to the Performance half: a Cancelled Start writes nothing and opens its prompt", async () => {
  const { mod, missingReason } = await ready();
  assert.ok(mod, missingReason);
  const actor = idle();
  const { outcome, before, after, dialogs } = await cancelControl(mod, actor, "bardStartPerformance");
  assert.equal(outcome.value, null, "the Start resolves null on Cancel");
  assert.equal(dialogs.length, 1, "exactly one prompt (the Performance choice) is shown");
  assert.equal(after, before, "nothing is written");
});
