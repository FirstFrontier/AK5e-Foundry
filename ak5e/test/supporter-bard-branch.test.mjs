import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();

// Dialog emulation: each dialog takes the next scripted step (default "cancel"). A prompt step is { values } (Continue) or
// "cancel" (closed, resolves null). A wait step is "confirm" or "cancel". Foundry resolves a button as `(await callback()) ?? action`.
let script = [];
const dialogLog = [];
let writes = [];
const elementsOf = values => ({ elements: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value: String(value), checked: false }])) });
const hasCancel = options => options.buttons?.some(button => button.action === "cancel") === true;
function installDialogs() {
  globalThis.foundry.applications = { api: { DialogV2: {
  async wait(options) {
    const step = script.shift() ?? "cancel";
    dialogLog.push({ kind: "wait", cancelable: hasCancel(options), writesBefore: writes.length, title: options.window?.title });
    const action = step === "confirm" ? "confirm" : "cancel";
    const button = options.buttons.find(candidate => candidate.action === action) ?? options.buttons[0];
    return (await button.callback?.(null, button, null)) ?? button.action;
  },
  async prompt(options) {
    const step = script.shift() ?? "cancel";
    dialogLog.push({ kind: "prompt", cancelable: false, writesBefore: writes.length, title: options.window?.title });
    if (step === "cancel" || step === undefined) return null;
    const button = { action: "ok", form: elementsOf(step.values ?? {}) };
    return (await options.ok.callback?.(null, button)) ?? "ok";
  }
} } };
}

const { SUPPORTER_BRANCH_MODULES, initSupporterBranches, supporterBranchApis } = await import("../scripts/supporter-branches.mjs");
await import("../scripts/supporter-branch-index.mjs");
const { supporterUses } = await import("../scripts/supporter-uses.mjs");
const { supporterPanelHtml } = await import("../scripts/supporter-sheet.mjs");
const { bardComposePlans, bardComposeApi, bardComposePanel } = await import("../scripts/bard-compose.mjs");
const { bardPerformPlans, bardPerformApi, bardPerformPanel } = await import("../scripts/bard-perform.mjs");
const { hexerArtsPlans } = await import("../scripts/hexer-arts.mjs");
const { hexerPlans } = await import("../scripts/hexer-features.mjs");
const { artificerPlans } = await import("../scripts/artificer-features.mjs");
const { artificerUpgradePlans } = await import("../scripts/artificer-upgrades.mjs");
const { defineSupporterPools } = await import("../scripts/supporter-features.mjs");

const BARD_PLANS = [...Object.keys(bardComposePlans), ...Object.keys(bardPerformPlans)];
const OWNED = ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "emergencyImprovAid",
  "bardStartPerformance", "bardCastNextArt", "bardEndPerformance", "bardFontAid"];
const PERFORMING_CMDS = new Set(["bardCastNextArt", "bardEndPerformance", "bardFontAid"]);
const HEXER_AND_ARTIFICER_CMDS = ["potentHex", "ultimateHex", "cursemark", "cursemarkArea", "configureHexerArts",
  "artificerSetup", "buildAutomaton", "commandAutomaton", "fortBuilder", "artificerInstallUpgrade", "artificerUseUpgrade", "artificerPersonality"];

const WRITE_METHODS = ["update", "setFlag", "unsetFlag", "createEmbeddedDocuments", "updateEmbeddedDocuments", "deleteEmbeddedDocuments"];
/** Counts every Actor write so a test can tell whether anything was written, and when. */
function watch(actor) {
  for (const method of WRITE_METHODS) {
    const original = actor[method];
    if (typeof original !== "function") continue;
    actor[method] = function watchedWrite(...args) { writes.push(method); return original.apply(actor, args); };
  }
  return actor;
}

const composed = () => structuredClone({
  id: "perf-a", arts: [{ name: "Bane", muse: 1, manual: false }, { name: "Aid", muse: 2, manual: false }, { name: "Bolster", muse: 3, manual: false }],
  performed: false, composedAt: "2026-10-01T00:00:00.000Z"
});

/** A level-13 Bard (CHA 16) with an equipped proficient Instrument, so Put on a Performance raises no warning. */
function bard({ performing = false, owner = true } = {}) {
  const actor = createTestActor({
    name: performing ? "Bard Performing" : "Bard Composing", type: "character", level: 13, owner,
    abilities: { cha: { value: 16, mod: 3 } },
    items: [
      { name: "Supporter", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } },
      { name: "Lute", type: "tool", system: { equipped: true, proficient: 1 } },
      // The composed Arts are on the sheet, so casting them raises no "not on this Bard's sheet" warning.
      { name: "Bane", type: "spell" }, { name: "Aid", type: "spell" }, { name: "Bolster", type: "spell" }
    ],
    flags: {
      ak5e: {
        supporter: { enabled: true, branch: "bard", aidAbility: "cha" },
        bard: {
          performances: [composed()], museTHP: 0, fontDie: performing,
          active: performing ? { performanceId: "perf-a", index: 0, crescendo: 0, castsThisTurn: 0 } : null
        },
        bardRest: { open: true }
      }
    }
  });
  return watch(actor);
}

/** The state a Cancel must leave untouched: the Bard's own flag, Temporary HP and Aid Dice pool. */
const stateOf = actor => JSON.stringify({ bard: actor.flags?.ak5e?.bard ?? null, temp: actor.system?.attributes?.hp?.temp ?? null });

/** Runs a command with a scripted dialog sequence and returns what happened. */
async function run(cmd, actor, steps = []) {
  script = [...steps];
  dialogLog.length = 0;
  writes = [];
  const thrown = { error: null };
  let result;
  try { result = await SUPPORTER_BRANCH_MODULES.get("bard").command(actor, cmd); }
  catch (error) { thrown.error = error; }
  return { result, thrown: thrown.error, dialogs: [...dialogLog], writes: [...writes] };
}

test.beforeEach(() => {
  setupFoundryGlobals();
  installDialogs();
  script = [];
  dialogLog.length = 0;
  writes = [];
  globalThis.game.user.targets = { first: () => null };
});

test("the index registers exactly one bard module with every compose and perform plan", () => {
  const modules = [...SUPPORTER_BRANCH_MODULES.values()].filter(definition => definition.id === "supporter-bard");
  assert.equal(modules.length, 1, "one bard module");
  const bardModule = SUPPORTER_BRANCH_MODULES.get("bard");
  assert.ok(bardModule, "bard branch registered");
  assert.equal(bardModule.id, "supporter-bard");
  assert.equal(BARD_PLANS.length, 10, "five compose plans and five perform plans");
  for (const plan of BARD_PLANS) assert.equal(typeof bardModule.plans[plan], "function", plan);
  assert.equal(Object.keys(bardModule.plans).length, BARD_PLANS.length, "no plan is dropped or doubled");
});

test("the bard API is frozen and exposes the perform surface under perform", () => {
  const api = supporterBranchApis().bard;
  assert.ok(Object.isFrozen(api), "the API is frozen");
  assert.equal(api.perform, bardPerformApi, "perform is the Bard performing API");
  for (const key of Object.keys(bardComposeApi)) assert.equal(api[key], bardComposeApi[key], key);
});

test("initSupporterBranches is idempotent for the bard branch", () => {
  const first = initSupporterBranches();
  assert.ok(first.branches.includes("bard"));
  assert.doesNotThrow(() => initSupporterBranches());
  assert.deepEqual(initSupporterBranches().branches, first.branches);
});

test("no plan name or target kind of the Bard collides with the base, Hexer or Artificer branches", () => {
  const others = [...Object.keys(hexerArtsPlans), ...Object.keys(hexerPlans), ...Object.keys(artificerPlans), ...Object.keys(artificerUpgradePlans)];
  const clashes = BARD_PLANS.filter(plan => others.includes(plan));
  assert.deepEqual(clashes, [], "no plan name is shared");
  // supporterUses.register uses Object.assign, so a kind defined in two modules would overwrite silently: scan the sources.
  const scripts = new URL("../scripts/", import.meta.url);
  for (const kind of ["bardCompose", "bardCheck", "bardCrescendo"]) {
    const definers = readdirSync(scripts).filter(file => file.endsWith(".mjs")
      && new RegExp(`(^|[\\s,{])${kind}\\s*:`, "m").test(readFileSync(new URL(file, scripts), "utf8")));
    assert.equal(definers.length, 1, `${kind} is defined in one module: ${definers.join(", ")}`);
    assert.match(definers[0], /^bard-(compose|perform)\.mjs$/);
  }
});

test("the sheet's branch slot shows both Bard halves for an owner, and nothing for a non-owner", () => {
  initSupporterBranches();
  const html = supporterPanelHtml(bard());
  assert.match(html, /ak5e-supporter-branch-slot/);
  assert.match(html, /ak5e-bard-panel/, "compose half");
  assert.match(html, /ak5e-bard-perform/, "perform half");
  for (const cmd of ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "bardStartPerformance"]) {
    assert.match(html, new RegExp(`data-supporter-cmd="${cmd}"`), cmd);
  }
  const nonOwner = bard({ owner: false });
  assert.equal(nonOwner.isOwner, false, "the fixture actor is not owned by this user");
  const hidden = supporterPanelHtml(nonOwner);
  assert.ok(!hidden.includes("ak5e-supporter-branch-slot"), "no branch slot");
  assert.ok(!hidden.includes("ak5e-bard-panel") && !hidden.includes("ak5e-bard-perform"), "no Bard section");
  assert.ok(!hidden.includes('data-supporter-cmd="composePerformances"'), "no Bard control");
});

test("the panel halves are the only Bard controls, and each half reads only its own state", () => {
  const idle = `${bardComposePanel(bard())}${bardPerformPanel(bard())}`;
  assert.match(idle, /data-supporter-cmd="bardStartPerformance"/, "an idle Bard with a composed Performance may start it");
  assert.doesNotMatch(idle, /data-supporter-cmd="bardEndPerformance"/);
  const performing = bardPerformPanel(bard({ performing: true }));
  assert.match(performing, /data-supporter-cmd="bardCastNextArt"/);
  assert.match(performing, /data-supporter-cmd="bardEndPerformance"/);
  assert.match(performing, /data-supporter-cmd="bardFontAid"/);
});

test("branch command returns undefined for an unknown control, and opens no dialog", async () => {
  for (const cmd of ["not-a-bard-control", ...HEXER_AND_ARTIFICER_CMDS]) {
    const outcome = await run(cmd, bard());
    assert.equal(outcome.result, undefined, `${cmd} is not a Bard control`);
    assert.equal(outcome.thrown, null, `${cmd} did not throw`);
    assert.equal(outcome.dialogs.length, 0, `${cmd} opened no dialog`);
    assert.equal(outcome.writes.length, 0, `${cmd} wrote nothing`);
  }
});

test("every panel data-supporter-cmd is routable through the branch command", async () => {
  initSupporterBranches();
  const cmds = [...`${supporterPanelHtml(bard())}${supporterPanelHtml(bard({ performing: true }))}`.matchAll(/data-supporter-cmd="([^"]+)"/g)]
    .map(match => match[1]).filter(cmd => !cmd.startsWith("__") && !["undo", "provideAid", "useAidDie", "lightenTheLoad", "selfSupportiveDie"].includes(cmd));
  assert.deepEqual([...new Set(cmds)].sort(), [...OWNED].sort(), "the panels expose exactly the nine Bard controls");
  const unroutable = [];
  for (const cmd of OWNED) {
    const actor = bard({ performing: PERFORMING_CMDS.has(cmd) });
    const outcome = await run(cmd, actor);
    const routed = outcome.thrown !== null || outcome.result !== undefined || outcome.dialogs.length > 0;
    if (!routed) unroutable.push(cmd);
  }
  assert.deepEqual(unroutable, [], "every panel control is handled by the branch");
});

test("Cancel on the first dialog leaves the Bard's state untouched", async () => {
  // bardEndPerformance is excluded: its Cancel is a known defect (see the todo below).
  for (const cmd of OWNED.filter(cmd => cmd !== "bardEndPerformance")) {
    const actor = bard({ performing: PERFORMING_CMDS.has(cmd) });
    const before = stateOf(actor);
    const outcome = await run(cmd, actor, []);
    assert.ok(!outcome.result, `${cmd}: Cancel resolves a falsy non-action value (got ${String(outcome.result)})`);
    assert.equal(stateOf(actor), before, `${cmd}: state after Cancel`);
  }
});

test("composing: each compose control confirms with Cancel before anything is written", async () => {
  const flows = {
    composePerformances: [{ values: { aidDice: "1", performances: "Bane, Aid, Bolster" } }, "cancel"],
    bardSetup: [{ values: { i1: "Lute", i2: "Lyre", i3: "Harp" } }, "cancel"],
    speakToTheSoul: ["cancel"],
    emergencyImprov: ["cancel"],
    emergencyImprovAid: [{ values: { mode: "compose", arts: "Bane, Aid, Bolster", art: "" } }, "cancel"]
  };
  for (const [cmd, steps] of Object.entries(flows)) {
    const actor = bard();
    const before = stateOf(actor);
    const outcome = await run(cmd, actor, steps);
    assert.ok(!outcome.result, `${cmd}: Cancel is falsy`);
    assert.equal(outcome.writes.length, 0, `${cmd}: nothing written`);
    assert.equal(stateOf(actor), before, `${cmd}: state unchanged`);
    assert.ok(outcome.dialogs.some(dialog => dialog.kind === "wait" && dialog.cancelable), `${cmd}: a Cancel-able confirm was shown`);
  }
});

test("composing: a confirmed Speak to the Soul writes only after its confirm", async () => {
  const actor = bard();
  const outcome = await run("speakToTheSoul", actor, ["confirm"]);
  assert.ok(outcome.dialogs.length >= 1, "a confirm was shown");
  assert.equal(outcome.dialogs[0].writesBefore, 0, "nothing was written before the confirm");
});

// Defects found by the U11 confirm audit (WORKFLOW §3.2): these paths write before any Cancel-able confirm. They are todo
// so the suite reports them without going red; the head decides the fix. Each todo names the source line.
const DEFECT = {
  bardStartPerformance: "bard-perform.mjs:625-629 picker (promptPerformance, :484) has no Cancel; startPerformance then writes via confirmPlayUse with no confirm, and the first Art is cast before the only Cancel (manual card, :572)",
  bardCastNextArt: "bard-perform.mjs:563 castNextArt writes via confirmPlayUse with no confirm unless a warning is raised; the only Cancel is the manual-card step after the write",
  bardEndPerformance: "bard-perform.mjs:603 endPerformance writes via confirmPlayUse with no confirm unless a Concentration keep-choice is offered (:599)",
  bardFontAid: "bard-perform.mjs:611 fontProvideAid writes via confirmPlayUse with no confirm at all"
};

for (const cmd of ["bardStartPerformance", "bardCastNextArt", "bardEndPerformance"]) {
  test(`performing: ${cmd} confirms with Cancel before its first write`, { todo: DEFECT[cmd] }, async () => {
    const actor = bard({ performing: cmd !== "bardStartPerformance" });
    // The picker (Start) is answered with the composed Performance; any later Cancel-able confirm is answered Cancel.
    const steps = cmd === "bardStartPerformance" ? [{ values: { performanceId: "perf-a" } }, "cancel"] : ["cancel"];
    const outcome = await run(cmd, actor, steps);
    const confirmFirst = outcome.dialogs.some(dialog => dialog.kind === "wait" && dialog.cancelable && dialog.writesBefore === 0);
    assert.ok(confirmFirst, "a Cancel-able confirm was shown before the first write");
  });
}

test("performing: Cancel on End Performance changes nothing", { todo: DEFECT.bardEndPerformance }, async () => {
  const actor = bard({ performing: true });
  const before = stateOf(actor);
  const outcome = await run("bardEndPerformance", actor, []);
  assert.ok(!outcome.result, "Cancel is falsy");
  assert.equal(stateOf(actor), before, "state unchanged");
});

test("performing: Font of Inspiration Aid confirms with Cancel before it writes", { todo: DEFECT.bardFontAid }, async () => {
  const actor = bard({ performing: true });
  const target = createTestActor({ name: "Ally", type: "character", id: "u11-ally" });
  globalThis.game.user.targets = { first: () => ({ actor: target }) };
  const outcome = await run("bardFontAid", actor, ["cancel"]);
  assert.ok(outcome.dialogs.some(dialog => dialog.kind === "wait" && dialog.cancelable && dialog.writesBefore === 0),
    "a Cancel-able confirm was shown before the first write");
});

test("Font of Inspiration Aid with no target asks for one and writes nothing", async () => {
  const actor = bard({ performing: true });
  const outcome = await run("bardFontAid", actor, []);
  assert.match(String(outcome.thrown?.message), /Target the creature/);
  assert.equal(outcome.writes.length, 0, "nothing written");
});

test("a composed Bard plan reaches its own validation through the Supporter engine", () => {
  initSupporterBranches();
  defineSupporterPools();
  const actor = bard();
  assert.throws(() => supporterUses.plan(actor, "startPerformance", { performanceId: "missing" }), /Choose a composed Performance/);
  assert.throws(() => supporterUses.plan(actor, "composePerformances", { aidDice: 0, performances: [] }), /Expend at least one Aid Die/);
  assert.throws(() => supporterUses.plan(actor, "bardSetup", { instruments: ["Lute"] }), /Choose three different Instruments/);
  assert.throws(() => supporterUses.plan(bard(), "castNextArt", { performanceId: "perf-a", index: 0 }), /This Bard is not Performing/);
  const plan = supporterUses.plan(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Aid", "Bolster"]] });
  assert.match(plan.title, /Compose Performances/);
  assert.equal(typeof plan.apply, "function");
});
