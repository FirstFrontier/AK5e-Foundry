/**
 * Cancel must cancel (WORKFLOW §3.2). Foundry's DialogV2 resolves a button as `(await callback()) ?? action`, so a Cancel
 * whose callback returns null resolves to the action string "cancel" (truthy) and the use would run anyway. These tests
 * emulate that resolution exactly and assert that every Cancel, close and undecided answer writes nothing, while the
 * positive answers ("Use anyway", a chosen reading, Undo, Confirm) still resubmit or run.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();

// Scripted answers, consumed in order: { title: RegExp, click: action | null (X close), elements }.
let answers = [];
const dialogs = [];

/** Emulates DialogV2: the clicked button's callback runs with a form; a nullish result resolves to the action name. */
async function runDialog(buttons, options) {
  const title = options.window?.title ?? "";
  dialogs.push(title);
  const next = answers.shift();
  if (!next) throw new Error(`Unexpected dialog: "${title}"`);
  assert.match(title, next.title, `dialog title "${title}" should match ${next.title}`);
  if (next.click === null) return null; // X close: rejectClose is false, so the promise resolves null.
  const button = buttons.find(candidate => candidate.action === next.click);
  if (!button) throw new Error(`No "${next.click}" button in "${title}"`);
  return (await button.callback?.(null, { form: { elements: next.elements ?? {} } }, null)) ?? button.action;
}
globalThis.foundry.applications = { api: { DialogV2: {
  wait: async options => runDialog(options.buttons, options),
  prompt: async options => runDialog([{ action: "ok", ...options.ok }], options),
  confirm: async options => runDialog([{ action: "yes", callback: () => true }, { action: "no", callback: () => false }], options)
} } };

const { confirmPlayUse, openPlayUndo, openPlayUndoList } = await import("../scripts/play-uses-sheet.mjs");
const { SUPPORTER_BRANCH_MODULES, initSupporterBranches } = await import("../scripts/supporter-branches.mjs");
await import("../scripts/supporter-branch-index.mjs");
const { supporterUses } = await import("../scripts/supporter-uses.mjs");
const { handleSupporterCommand } = await import("../scripts/supporter-sheet.mjs");

const warningsError = () => Object.assign(new Error("warnings"), { name: "AK5eWarnings", warnings: [{ id: "shortfall", text: "The Aid Die pool is empty." }] });
const readingError = () => Object.assign(new Error("reading"), { name: "AK5eReading", key: "fortRule", label: "Fort rule", options: [{ value: "a", label: "Reading A" }, { value: "b", label: "Reading B" }] });

/** Fake engine for the undo dialogs: records every write-capable command. */
function fakeEngine({ blocked = false, uses = [] } = {}) {
  const commands = [];
  return {
    commands,
    previewUndo: () => ({ lines: ["Restores the spent pool."], blocked }),
    uses: () => uses,
    command: async (actor, name, data) => { commands.push({ name, data }); return { undone: true }; }
  };
}

beforeEach(() => { answers = []; dialogs.length = 0; });

test("warnings dialog: Cancel resolves null, resubmits nothing and writes nothing", async () => {
  const attempts = [];
  answers = [{ title: /check before use/, click: "cancel" }];
  const result = await confirmPlayUse("Test use", extra => { attempts.push(extra); throw warningsError(); });
  assert.equal(result, null);
  assert.equal(attempts.length, 1, "the attempt is not resubmitted after Cancel");
  assert.equal(dialogs.length, 1);
});

test("warnings dialog: closing with X resolves null and resubmits nothing", async () => {
  const attempts = [];
  answers = [{ title: /check before use/, click: null }];
  const result = await confirmPlayUse("Test use", extra => { attempts.push(extra); throw warningsError(); });
  assert.equal(result, null);
  assert.equal(attempts.length, 1);
});

test("warnings dialog: Use anyway resubmits with the warning overrides", async () => {
  const attempts = [];
  answers = [{ title: /check before use/, click: "anyway" }];
  const result = await confirmPlayUse("Test use", extra => {
    attempts.push(extra);
    if (!extra.overrides) throw warningsError();
    return { applied: true };
  });
  assert.deepEqual(result, { applied: true });
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[1].overrides, ["shortfall"]);
});

test("readings dialog: Cancel resolves null and resubmits nothing", async () => {
  const attempts = [];
  answers = [{ title: /no GM ruling/, click: "cancel", elements: { reading: { value: "b" } } }];
  const result = await confirmPlayUse("Test use", extra => { attempts.push(extra); throw readingError(); });
  assert.equal(result, null, "Cancel must not resolve to the action string \"cancel\" and continue");
  assert.equal(attempts.length, 1);
});

test("readings dialog: a chosen reading resubmits with that reading", async () => {
  const attempts = [];
  answers = [{ title: /no GM ruling/, click: "read", elements: { reading: { value: "b" } } }];
  const result = await confirmPlayUse("Test use", extra => {
    attempts.push(extra);
    if (!extra.reading) throw readingError();
    return { ok: extra.reading };
  });
  assert.deepEqual(result, { ok: "b" });
  assert.equal(attempts[1].reading, "b");
  assert.deepEqual(attempts[1].readings, { fortRule: "b" });
});

test("readings dialog: Use this reading with no option picked never resubmits with the action name", async () => {
  const attempts = [];
  answers = [{ title: /no GM ruling/, click: "read", elements: {} }];
  const result = await confirmPlayUse("Test use", extra => { attempts.push(extra); throw readingError(); });
  assert.equal(result, null);
  assert.equal(attempts.length, 1, "no resubmission with reading \"read\"");
});

test("undo dialog: Cancel changes nothing", async () => {
  const engine = fakeEngine();
  answers = [{ title: /^Undo — /, click: "cancel" }];
  const result = await openPlayUndo(engine, createTestActor({ name: "Undoer" }), "use-1");
  assert.equal(result, null);
  assert.equal(engine.commands.length, 0);
});

test("undo dialog: closing with X changes nothing", async () => {
  const engine = fakeEngine();
  answers = [{ title: /^Undo — /, click: null }];
  assert.equal(await openPlayUndo(engine, createTestActor({ name: "Undoer" }), "use-1"), null);
  assert.equal(engine.commands.length, 0);
});

test("undo dialog: a blocked undo's Close button changes nothing", async () => {
  const engine = fakeEngine({ blocked: true });
  answers = [{ title: /^Undo — /, click: "close" }];
  assert.equal(await openPlayUndo(engine, createTestActor({ name: "Undoer" }), "use-1"), null);
  assert.equal(engine.commands.length, 0);
});

test("undo dialog: Undo this use still undoes", async () => {
  const engine = fakeEngine();
  answers = [{ title: /^Undo — /, click: "undo" }];
  const result = await openPlayUndo(engine, createTestActor({ name: "Undoer" }), "use-1");
  assert.deepEqual(result, { undone: true });
  assert.deepEqual(engine.commands, [{ name: "undoUse", data: { useId: "use-1" } }]);
});

test("undo list: Cancel opens no undo and writes nothing", async () => {
  const engine = fakeEngine({ uses: [{ id: "use-1", title: "Fort Builder", summary: "one use", status: "applied" }] });
  answers = [{ title: /^Undo a recent use/, click: "cancel", elements: { useId: { value: "use-1" } } }];
  assert.equal(await openPlayUndoList(engine, createTestActor({ name: "Undoer" })), null);
  assert.equal(dialogs.length, 1, "no undo review is opened after Cancel");
  assert.equal(engine.commands.length, 0);
});

test("undo list: no picked use resolves null rather than treating the action name as a use id", async () => {
  const engine = fakeEngine({ uses: [{ id: "use-1", title: "Fort Builder", summary: "one use", status: "applied" }] });
  answers = [{ title: /^Undo a recent use/, click: "choose", elements: {} }];
  assert.equal(await openPlayUndoList(engine, createTestActor({ name: "Undoer" })), null);
  assert.equal(dialogs.length, 1);
  assert.equal(engine.commands.length, 0);
});

test("undo list: choosing a use then Cancel on its undo changes nothing", async () => {
  const engine = fakeEngine({ uses: [{ id: "use-1", title: "Fort Builder", summary: "one use", status: "applied" }] });
  answers = [
    { title: /^Undo a recent use/, click: "choose", elements: { useId: { value: "use-1" } } },
    { title: /^Undo — /, click: "cancel" }
  ];
  assert.equal(await openPlayUndoList(engine, createTestActor({ name: "Undoer" })), null);
  assert.equal(engine.commands.length, 0);
});

test("undo list: choosing a use then Undo still undoes it", async () => {
  const engine = fakeEngine({ uses: [{ id: "use-1", title: "Fort Builder", summary: "one use", status: "applied" }] });
  answers = [
    { title: /^Undo a recent use/, click: "choose", elements: { useId: { value: "use-1" } } },
    { title: /^Undo — /, click: "undo" }
  ];
  assert.deepEqual(await openPlayUndoList(engine, createTestActor({ name: "Undoer" })), { undone: true });
  assert.deepEqual(engine.commands, [{ name: "undoUse", data: { useId: "use-1" } }]);
});

// Sheet commands: the real Supporter control path with the engine's execute/command spied on.
function supporterActor(level = 5) {
  return createTestActor({
    name: "Supporter", type: "character", level,
    items: [{ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }],
    flags: { ak5e: { supporter: { enabled: true, aidAbility: "cha" } } }
  });
}
function artificer(level = 17) {
  return createTestActor({
    name: `Artificer L${level}`, type: "character", level, owner: true,
    items: [
      { name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } },
      { name: "Artificer", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-artificer" } } }
    ],
    flags: { ak5e: { supporter: { enabled: true, branch: "artificer", aidAbility: "int" }, artificer: { automatons: [], covers: [] } } }
  });
}

/** Spies on the engine entry points: `warn` makes the first, un-overridden attempt raise the shortfall warning. */
function spyEngine(method) {
  const original = supporterUses[method];
  const calls = [];
  supporterUses[method] = async (actor, name, data) => {
    calls.push({ name, data });
    if (!data.overrides) throw warningsError();
    return { written: name };
  };
  return { calls, restore: () => { supporterUses[method] = original; } };
}

const allyActor = () => createTestActor({ name: "Ally", type: "character", id: "u10-ally" });

test("Provide Aid: Cancel at the recipient step writes nothing", async () => {
  const ally = allyActor();
  const actor = supporterActor();
  const spy = spyEngine("command");
  const originalActors = globalThis.game.actors;
  globalThis.game.actors = { contents: [actor, ally] };
  try {
    answers = [{ title: /Provide Aid: recipient/, click: null }];
    assert.equal(await handleSupporterCommand(actor, "provideAid"), null);
    assert.equal(spy.calls.length, 0);
  } finally { globalThis.game.actors = originalActors; spy.restore(); }
});

test("Provide Aid: Cancel at the confirm step writes nothing", async () => {
  const ally = allyActor();
  const actor = supporterActor();
  const spy = spyEngine("command");
  const originalActors = globalThis.game.actors;
  globalThis.game.actors = { contents: [actor, ally] };
  try {
    answers = [
      { title: /Provide Aid: recipient/, click: "ok", elements: { target: { value: ally.uuid } } },
      { title: /^Provide Aid$/, click: "cancel" }
    ];
    assert.equal(await handleSupporterCommand(actor, "provideAid"), null);
    assert.equal(spy.calls.length, 0, "no engine call at all");
  } finally { globalThis.game.actors = originalActors; spy.restore(); }
});

test("Provide Aid: Cancel at the warnings dialog writes nothing and is not resubmitted", async () => {
  const ally = allyActor();
  const actor = supporterActor();
  const spy = spyEngine("command");
  const originalActors = globalThis.game.actors;
  globalThis.game.actors = { contents: [actor, ally] };
  try {
    answers = [
      { title: /Provide Aid: recipient/, click: "ok", elements: { target: { value: ally.uuid } } },
      { title: /^Provide Aid$/, click: "confirm" },
      { title: /check before use/, click: "cancel" }
    ];
    assert.equal(await handleSupporterCommand(actor, "provideAid"), null);
    assert.equal(spy.calls.length, 1, "only the attempt that raised the warning ran");
    assert.equal(spy.calls[0].data.overrides, undefined);
  } finally { globalThis.game.actors = originalActors; spy.restore(); }
});

test("Provide Aid: Use anyway still applies with the overrides", async () => {
  const ally = allyActor();
  const actor = supporterActor();
  const spy = spyEngine("command");
  const originalActors = globalThis.game.actors;
  globalThis.game.actors = { contents: [actor, ally] };
  try {
    answers = [
      { title: /Provide Aid: recipient/, click: "ok", elements: { target: { value: ally.uuid } } },
      { title: /^Provide Aid$/, click: "confirm" },
      { title: /check before use/, click: "anyway" }
    ];
    assert.deepEqual(await handleSupporterCommand(actor, "provideAid"), { written: "provideAid" });
    assert.equal(spy.calls.length, 2);
    assert.deepEqual(spy.calls[1].data.overrides, ["shortfall"]);
  } finally { globalThis.game.actors = originalActors; spy.restore(); }
});

test("Fort Builder: Cancel at the confirm step writes nothing", async () => {
  initSupporterBranches();
  const actor = artificer();
  const spy = spyEngine("execute");
  try {
    answers = [{ title: /^Fort Builder$/, click: "cancel" }];
    assert.equal(await SUPPORTER_BRANCH_MODULES.get("artificer").command(actor, "fortBuilder"), null);
    assert.equal(spy.calls.length, 0);
    assert.equal(supporterUses.uses(actor).length, 0, "no use recorded");
  } finally { spy.restore(); }
});

test("Fort Builder: Cancel at the warnings dialog writes nothing and is not resubmitted", async () => {
  initSupporterBranches();
  const actor = artificer();
  const spy = spyEngine("execute");
  try {
    answers = [
      { title: /^Fort Builder$/, click: "confirm" },
      { title: /check before use/, click: "cancel" }
    ];
    assert.equal(await SUPPORTER_BRANCH_MODULES.get("artificer").command(actor, "fortBuilder"), null);
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].data.overrides, undefined);
  } finally { spy.restore(); }
});

test("Fort Builder: Use anyway still applies with the overrides", async () => {
  initSupporterBranches();
  const actor = artificer();
  const spy = spyEngine("execute");
  try {
    answers = [
      { title: /^Fort Builder$/, click: "confirm" },
      { title: /check before use/, click: "anyway" }
    ];
    assert.deepEqual(await SUPPORTER_BRANCH_MODULES.get("artificer").command(actor, "fortBuilder"), { written: "fortBuilder" });
    assert.equal(spy.calls.length, 2);
    assert.deepEqual(spy.calls[1].data.overrides, ["shortfall"]);
  } finally { spy.restore(); }
});
