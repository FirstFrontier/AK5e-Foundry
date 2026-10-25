/**
 * U10 adversarial suite: "Cancel must cancel" (WORKFLOW.md §3.2: confirm before use; cancelling changes nothing).
 *
 * The defect under test: Foundry V13 resolves a clicked button as `(await button.callback?.(...)) ?? button.action`
 * (client/applications/api/dialog.mjs, DialogV2._onSubmit, ~L242). A Cancel whose callback returns `null` therefore
 * resolves to the string "cancel", which is truthy. ak5e/scripts/play-uses-sheet.mjs then reads that string as an
 * answer: `if (!accepted)` lets Cancel on the "Use anyway" dialog apply the use, the readings dialog continues with
 * the reading "cancel", and the undo dialog undoes. The same applies to the undo list's Cancel.
 *
 * The core of this suite is an EMULATING DialogV2 stub. `wait` and `prompt` pick a scripted button by action, run its
 * callback and resolve `(await callback?.(...)) ?? button.action`, exactly as Foundry does. Closing with X resolves
 * `null` when rejectClose is false (dialog.mjs `wait`, L386-387). Nothing here returns `null` for a Cancel directly,
 * because that would hide the bug.
 *
 * Expected today: every test marked "bug-proving" in its title fails, because the fix is not on this branch yet.
 * Harness tests (the emulator itself) and regression tests (positive paths and X-dismissal) pass.
 *
 * Oracles are the source rules and the head's rulings, not the implementation under test:
 *  - Automaton base HP 25 plus the Technology Modifier reading (C3:6887, as in artificer-adversarial oracles).
 *  - Heavy Duty Upgrades are a Supporter level 4 feature (artificer-upgrades warns below level 4).
 *  - Aid Die pool max is the chosen ability modifier (R1); a zero modifier gives an empty pool that warns.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { setupFoundryGlobals, teardownFoundryGlobals, createTestActor } from "./base-classes-fixture.mjs";

setupFoundryGlobals();

/* ==========================================================================
   Emulating DialogV2 (Foundry V13, client/applications/api/dialog.mjs)
   ========================================================================== */

/** Dismiss with the X control (no button pressed). `wait` resolves `result ?? null` when rejectClose is false. */
const CLOSE = Object.freeze({ close: true });
/** A scripted answer: press the button with this action, with these form fields filled in first. */
const pick = (action, fields = {}) => Object.freeze({ action, fields });
const CANCEL = pick("cancel");

/** The scripted answers still to be given, in order. An unscripted dialog throws, so an extra prompt fails the test. */
let scripted = [];
/** Every dialog shown, in order: { title, actions }. */
let shown = [];

/**
 * The form a browser would submit for a dialog's HTML content: each select at its selected (or first) option, each
 * radio group at its checked (or first) radio, checkboxes by their checked state, and text areas and inputs by value.
 * A script's `fields` then override individual values, as a player would type or choose them.
 */
function formElementsFor(content, overrides = {}) {
  const elements = {};
  const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  for (const [, tag, inner] of String(content ?? "").matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const options = [...inner.matchAll(/<option\b([^>]*)>/g)].map(match => match[1]);
    const chosen = options.find(option => /\bselected\b/.test(option)) ?? options[0];
    elements[attr(tag, "name")] = { value: chosen ? (attr(chosen, "value") ?? "") : "" };
  }
  const radios = new Map();
  for (const [, tag] of String(content ?? "").matchAll(/<input\b([^>]*)>/g)) {
    const name = attr(tag, "name");
    if (!name) continue;
    if (/\btype="radio"/.test(tag)) {
      const group = radios.get(name) ?? [];
      group.push({ value: attr(tag, "value") ?? "", checked: /\bchecked\b/.test(tag) });
      radios.set(name, group);
    } else if (/\btype="checkbox"/.test(tag)) {
      elements[name] = { checked: /\bchecked\b/.test(tag), value: "on" };
    } else {
      elements[name] = { value: attr(tag, "value") ?? "" };
    }
  }
  for (const [name, group] of radios) {
    const chosen = group.find(radio => radio.checked) ?? group[0];
    elements[name] = { value: chosen?.value ?? "" };
  }
  for (const [, tag, inner] of String(content ?? "").matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    elements[attr(tag, "name")] = { value: inner };
  }
  for (const [name, value] of Object.entries(overrides)) {
    elements[name] = typeof value === "object" ? { ...(elements[name] ?? {}), ...value } : { ...(elements[name] ?? {}), value };
  }
  return elements;
}

function nextAnswer(title, actions, text = "") {
  shown.push({ title, actions, text });
  if (!scripted.length) throw new Error(`Unscripted dialog "${title}" (buttons: ${actions.join(", ")}): an extra prompt appeared`);
  return scripted.shift();
}

/** DialogV2.wait: a button press resolves `(await callback?.(...)) ?? button.action`; X resolves null. */
async function emulateWait(options, buttons) {
  const title = options.window?.title ?? "";
  const text = String(options.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const answer = nextAnswer(title, buttons.map(button => button.action), text);
  if (answer === CLOSE) return null;
  const button = buttons.find(candidate => candidate.action === answer.action);
  if (!button) throw new Error(`Scripted button "${answer.action}" is not on "${title}" (buttons: ${buttons.map(b => b.action).join(", ")})`);
  const elements = formElementsFor(options.content, answer.fields);
  const result = await button.callback?.(null, { form: { elements }, dataset: { action: button.action } }, null);
  return result ?? button.action;
}

/** DialogV2.prompt: the `ok` button is prepended to the buttons, as Foundry does. Its callback result (or "ok") resolves. */
const emulatedDialogV2 = {
  wait: options => emulateWait(options, options.buttons ?? []),
  prompt: options => emulateWait(options, [{ action: "ok", label: "Confirm", default: true, ...(options.ok ?? {}) }, ...(options.buttons ?? [])]),
  confirm: options => emulateWait(options, [
    { action: "yes", callback: () => true, ...(options.yes ?? {}) }, { action: "no", callback: () => false, ...(options.no ?? {}) }, ...(options.buttons ?? [])
  ])
};

/* ==========================================================================
   Loaders, fixtures and state
   ========================================================================== */

let libs = null;
async function lib() {
  if (!libs) {
    libs = {
      branches: await import("../scripts/supporter-branches.mjs"),
      sheet: await import("../scripts/supporter-sheet.mjs"),
      uses: await import("../scripts/supporter-uses.mjs"),
      playUses: await import("../scripts/play-uses-sheet.mjs"),
      features: await import("../scripts/artificer-features.mjs"),
      upgrades: await import("../scripts/artificer-upgrades.mjs"),
      hexerArts: await import("../scripts/hexer-arts.mjs"),
      bard: await import("../scripts/bard-compose.mjs"),
      supporterFeatures: await import("../scripts/supporter-features.mjs"),
      caster: await import("../scripts/caster-rules.mjs"),
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
  return L;
}

/** A Supporter at `level`, optionally on a branch subclass. `mods` overrides ability modifiers (the Aid Die pool uses `aidAbility`). */
function supporter({ level = 5, subclassId = null, aidAbility = "cha", mods = {}, name = `Supporter L${level}` } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 2, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [{ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }];
  if (subclassId) items.push({ name: "Branch", type: "subclass", flags: { ak5e: { chapterThreeId: subclassId } } });
  const branch = subclassId ? subclassId.replace("subclass-supporter-", "") : null;
  return createTestActor({
    name, type: "character", level, items, abilities,
    system: { currency: { cp: 0 }, skills: { ak5etech: { total: 5, value: 1 } } },
    flags: {
      ak5e: {
        supporter: { enabled: true, aidAbility, ...(branch ? { branch } : {}) },
        artificer: { automatons: [], covers: [], professionalVariant: null }
      }
    }
  });
}

const artificer = (options = {}) => supporter({ ...options, subclassId: "subclass-supporter-artificer" });
const hexer = (level = 17) => supporter({ level, subclassId: "subclass-supporter-hexer", aidAbility: "cha", name: "Hexer" });

/** An Automaton (an NPC with an automaton flag) created by `owner`. */
function automatonOf(owner, { name = "Platform Automaton", variant = "platform" } = {}) {
  return createTestActor({
    name, type: "npc", owner: true,
    hp: { value: 25, max: 25, temp: 0 },
    flags: { ak5e: { automaton: { creator: owner.uuid, variant, upgrades: [], personality: null, destroyed: false } } }
  });
}

/** A plain ally (a creature that is not a Supporter) for Provide Aid and target lookups. */
const ally = (name = "Ally") => createTestActor({ name, type: "character", hp: { value: 10, max: 20, temp: 0 } });

/** Point the user's targets at one token for `actor`, as a player who has targeted a creature. */
function target(actor) {
  const token = { actor, name: actor.name, id: actor.id, x: 0, y: 0, center: { x: 0, y: 0 } };
  game.user.targets = Object.assign(new Set([token]), { first: () => token });
}

/** Document state a use could change. Compared before and after each check. */
const stateOf = (...docs) => JSON.stringify(docs.map(doc => ({ flags: doc.flags, system: doc.system })));

/** Settles a call to { value } or { error }, so a dialog's outcome can be checked without throwing. */
async function outcomeOf(fn) {
  try { return { value: await fn() }; } catch (error) { return { error }; }
}

const chatCreates = [];
const ChatHook = () => {
  const create = globalThis.ChatMessage.implementation.create;
  globalThis.ChatMessage.implementation.create = (data, options) => { chatCreates.push(data); return create(data, options); };
};

test.beforeEach(() => {
  setupFoundryGlobals();
  scripted = [];
  shown = [];
  chatCreates.length = 0;
  globalThis.foundry.applications = { api: { DialogV2: emulatedDialogV2 } };
  // World Actor creation: the Artificer's GM relay writes the Automaton through Actor.implementation.create.
  globalThis.Actor = { implementation: { create: async data => createTestActor({
    id: data._id, name: data.name, type: data.type, owner: true, ownership: data.ownership, system: data.system, flags: data.flags, items: data.items
  }) } };
  game.user.targets = new Set();
  ChatHook();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/** Asserts a cancelled flow wrote nothing: no document changed, no use recorded, no chat card posted. */
function assertNothingWritten(label, { before, docs, uses, actor, supporterUses }) {
  assert.equal(stateOf(...docs), before, `${label}: no document changed`);
  assert.equal(supporterUses.uses(actor).length, uses, `${label}: no use recorded`);
  assert.equal(chatCreates.length, 0, `${label}: no chat card posted`);
}

/* ==========================================================================
   0. Harness: the emulator matches Foundry (these pass; they validate the stub)
   ========================================================================== */

test("harness: a button whose callback returns null resolves to its action name, as Foundry _onSubmit does", async () => {
  scripted = [pick("cancel")];
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "harness" }, rejectClose: false,
    buttons: [{ action: "cancel", callback: () => null }]
  });
  // dialog.mjs _onSubmit: `(await button?.callback?.(...)) ?? button?.action`. This is why Cancel-as-null is a bug.
  assert.equal(result, "cancel");
});

test("harness: dismissing with X resolves null when rejectClose is false (dialog.mjs wait, L386-387)", async () => {
  scripted = [CLOSE];
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "harness" }, rejectClose: false, buttons: [{ action: "cancel", callback: () => null }]
  });
  assert.equal(result, null);
});

test("harness: a dialog with no scripted answer fails loudly instead of resolving", async () => {
  await assert.rejects(() => foundry.applications.api.DialogV2.wait({ window: { title: "harness" }, buttons: [{ action: "ok" }] }), /Unscripted dialog/);
});

/* ==========================================================================
   1. confirmPlayUse (play-uses-sheet.mjs): warnings and readings
   ========================================================================== */

/** Provide Aid at a zero Aid Die pool: the plan raises the empty-pool warning, which needs "Use anyway" to proceed. */
async function emptyPoolProvideAid(L) {
  const giver = supporter({ level: 5, mods: { cha: 0 } });
  const recipient = ally("Recipient");
  const data = { targetUuid: recipient.uuid, targetName: recipient.name, distance: 0 };
  const opId = "u10-aid-empty";
  const run = (extra = {}) => L.uses.supporterUses.execute(giver, "provideAid", { ...data, ...extra }, opId);
  return { giver, recipient, run, opId, data };
}

test("confirmPlayUse [bug-proving]: Cancel on the Use anyway warnings dialog returns null and writes nothing", async () => {
  const L = await ready();
  const { giver, recipient, opId } = await emptyPoolProvideAid(L);
  const docs = [giver, recipient];
  const before = stateOf(...docs);
  scripted = [CANCEL];
  const result = await L.playUses.confirmPlayUse("Provide Aid", extra => L.uses.supporterUses.execute(giver, "provideAid", {
    targetUuid: recipient.uuid, targetName: recipient.name, distance: 0, ...extra }, opId), { confirmed: true });
  assert.equal(shown.length, 1, "one warnings dialog was shown");
  assert.deepEqual(shown[0].actions, ["anyway", "cancel"]);
  assert.equal(result, null, "Cancel resolves null");
  assertNothingWritten("Cancel on Use anyway", { before, docs, uses: 0, actor: giver, supporterUses: L.uses.supporterUses });
});

test("confirmPlayUse: Use anyway applies the use with the warnings overridden", async () => {
  const L = await ready();
  const { giver, recipient, opId } = await emptyPoolProvideAid(L);
  scripted = [pick("anyway")];
  const result = await L.playUses.confirmPlayUse("Provide Aid", extra => L.uses.supporterUses.execute(giver, "provideAid", {
    targetUuid: recipient.uuid, targetName: recipient.name, distance: 0, ...extra }, opId), { confirmed: true });
  assert.equal(shown.length, 1, "one warnings dialog was shown");
  assert.notEqual(result, null, "the use resolved");
  assert.equal(L.uses.supporterUses.uses(giver).length, 1, "the use is recorded once");
  const receipt = L.uses.supporterUses.receipt(giver, opId);
  assert.ok(receipt, "a receipt exists for the use");
  assert.ok(receipt.overridden?.length > 0, "the overridden warning is recorded on the receipt");
});

test("confirmPlayUse: dismissing the warnings dialog with X returns null and writes nothing", async () => {
  const L = await ready();
  const { giver, recipient, opId } = await emptyPoolProvideAid(L);
  const docs = [giver, recipient];
  const before = stateOf(...docs);
  scripted = [CLOSE];
  const result = await L.playUses.confirmPlayUse("Provide Aid", extra => L.uses.supporterUses.execute(giver, "provideAid", {
    targetUuid: recipient.uuid, targetName: recipient.name, distance: 0, ...extra }, opId), { confirmed: true });
  assert.equal(result, null);
  assertNothingWritten("X on warnings", { before, docs, uses: 0, actor: giver, supporterUses: L.uses.supporterUses });
});

/** Artificer Build Automaton with no GM ruling for the Technology Modifier: the readings dialog is shown. */
async function unruledBuild(L, level = 5) {
  const art = artificer({ level, subclassId: "subclass-supporter-artificer" });
  const opId = "u10-build";
  const run = (extra = {}) => L.uses.supporterUses.execute(art, "buildAutomaton", { variant: "platform", ...extra }, opId);
  return { art, opId, run };
}

test("confirmPlayUse [bug-proving]: Cancel on the readings dialog returns null, writes nothing and never reads \"cancel\"", async () => {
  const L = await ready();
  const { art, run, opId } = await unruledBuild(L);
  const docs = [art];
  const before = stateOf(...docs);
  scripted = [CANCEL];
  const outcome = await outcomeOf(() => L.playUses.confirmPlayUse("Build Automaton", extra => run(extra), { confirmed: true }));
  assert.equal(shown.length, 1, "one readings dialog was shown (a second means Cancel was read as a reading)");
  assert.match(shown[0].title, /no GM ruling/);
  assert.equal(outcome.error, undefined, `no error: ${outcome.error?.message}`);
  assert.equal(outcome.value ?? null, null, "Cancel resolves null");
  assert.notEqual(outcome.value, "cancel", "the reading is never the action name");
  assert.ok(!L.uses.supporterUses.receipt(art, opId), "no receipt was written");
  assertNothingWritten("Cancel on readings", { before, docs, uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("confirmPlayUse: choosing the intMod reading proceeds with that reading", async () => {
  const L = await ready();
  const { art, run, opId } = await unruledBuild(L);
  scripted = [pick("read", { reading: "intMod" })];
  const result = await L.playUses.confirmPlayUse("Build Automaton", extra => run(extra), { confirmed: true });
  assert.equal(shown.length, 1, "one readings dialog was shown");
  assert.notEqual(result, null);
  const receipt = L.uses.supporterUses.receipt(art, opId);
  assert.ok(receipt, "the use was recorded");
  assert.equal(receipt.result?.technologyModifier, "intMod", "the chosen reading is used");
  // Oracle: Automaton base HP 25 plus the Intelligence modifier (the test Artificer's INT mod is 3).
  assert.equal(receipt.result?.hpMax, 25 + 3, "hit points are 25 plus the Intelligence modifier");
});

test("confirmPlayUse: dismissing the readings dialog with X returns null and writes nothing", async () => {
  const L = await ready();
  const { art, run } = await unruledBuild(L);
  const docs = [art];
  const before = stateOf(...docs);
  scripted = [CLOSE];
  const result = await L.playUses.confirmPlayUse("Build Automaton", extra => run(extra), { confirmed: true });
  assert.equal(result, null);
  assertNothingWritten("X on readings", { before, docs, uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

/* ==========================================================================
   2. Undo (play-uses-sheet.mjs): openPlayUndo and openPlayUndoList
   ========================================================================== */

/** A recorded Provide Aid use that can be undone (no warnings, so no prior prompt). */
async function recordedAid(L, opId = "u10-undo") {
  const giver = supporter({ level: 5, mods: { cha: 2 } });
  const recipient = ally("Recipient");
  await L.uses.supporterUses.execute(giver, "provideAid", { targetUuid: recipient.uuid, targetName: recipient.name, distance: 0 }, opId);
  return { giver, recipient, opId };
}

test("openPlayUndo [bug-proving]: Cancel on the undo dialog undoes nothing", async () => {
  const L = await ready();
  const { giver, opId } = await recordedAid(L);
  const before = L.uses.supporterUses.receipt(giver, opId).status;
  scripted = [CANCEL];
  const result = await L.playUses.openPlayUndo(L.uses.supporterUses, giver, opId);
  assert.equal(result, null, "Cancel resolves null");
  assert.equal(L.uses.supporterUses.receipt(giver, opId).status, before, "the use is still in place");
  assert.notEqual(L.uses.supporterUses.receipt(giver, opId).status, "undone");
});

test("openPlayUndo: Undo this use undoes the use", async () => {
  const L = await ready();
  const { giver, opId } = await recordedAid(L);
  scripted = [pick("undo")];
  await L.playUses.openPlayUndo(L.uses.supporterUses, giver, opId);
  assert.equal(L.uses.supporterUses.receipt(giver, opId).status, "undone");
});

test("openPlayUndo: dismissing the undo dialog with X undoes nothing", async () => {
  const L = await ready();
  const { giver, opId } = await recordedAid(L);
  scripted = [CLOSE];
  const result = await L.playUses.openPlayUndo(L.uses.supporterUses, giver, opId);
  assert.equal(result, null);
  assert.notEqual(L.uses.supporterUses.receipt(giver, opId).status, "undone");
});

test("openPlayUndoList [bug-proving]: Cancel on the list shows no second dialog and undoes nothing", async () => {
  const L = await ready();
  const { giver, opId } = await recordedAid(L);
  scripted = [CANCEL];
  const outcome = await outcomeOf(() => L.playUses.openPlayUndoList(L.uses.supporterUses, giver));
  assert.equal(shown.length, 1, "Cancel opens no undo review (a second dialog means Cancel was read as a choice)");
  assert.equal(outcome.error, undefined, `no error: ${outcome.error?.message}`);
  assert.equal(outcome.value ?? null, null, "Cancel resolves null");
  assert.notEqual(L.uses.supporterUses.receipt(giver, opId).status, "undone");
});

test("openPlayUndoList: choosing a use and then Undo undoes it", async () => {
  const L = await ready();
  const { giver, opId } = await recordedAid(L);
  scripted = [pick("choose", { useId: opId }), pick("undo")];
  await L.playUses.openPlayUndoList(L.uses.supporterUses, giver);
  assert.equal(shown.length, 2, "the list and the review were shown");
  assert.equal(L.uses.supporterUses.receipt(giver, opId).status, "undone");
});

/* ==========================================================================
   3. Branch controls through handleSupporterCommand (the sheet dispatcher)
   ========================================================================== */

// Provide Aid: recipient prompt (prompt "ok"), confirm (wait), then warnings (Use anyway).
test("Provide Aid: dismissing the recipient prompt with X writes nothing", async () => {
  const L = await ready();
  const giver = supporter({ level: 5, mods: { cha: 2 } });
  const recipient = ally("Recipient");
  const docs = [giver, recipient];
  const before = stateOf(...docs);
  scripted = [CLOSE];
  const result = await L.sheet.handleSupporterCommand(giver, "provideAid");
  assert.equal(shown.length, 1, "the recipient prompt was the only dialog");
  assert.equal(result ?? null, null);
  assertNothingWritten("X at recipient", { before, docs, uses: 0, actor: giver, supporterUses: L.uses.supporterUses });
});

test("Provide Aid: Cancel at the confirm step writes nothing", async () => {
  const L = await ready();
  const giver = supporter({ level: 5, mods: { cha: 2 } });
  const recipient = ally("Recipient");
  const docs = [giver, recipient];
  const before = stateOf(...docs);
  scripted = [pick("ok", { target: recipient.uuid }), CANCEL];
  const result = await L.sheet.handleSupporterCommand(giver, "provideAid");
  assert.equal(shown.length, 2, "recipient and confirm dialogs were shown");
  assert.equal(result ?? null, null);
  assertNothingWritten("Cancel at confirm", { before, docs, uses: 0, actor: giver, supporterUses: L.uses.supporterUses });
});

test("Provide Aid [bug-proving]: Cancel on Use anyway (empty Aid Die pool) writes nothing", async () => {
  const L = await ready();
  const giver = supporter({ level: 5, mods: { cha: 0 } });
  const recipient = ally("Recipient");
  const docs = [giver, recipient];
  const before = stateOf(...docs);
  scripted = [pick("ok", { target: recipient.uuid }), pick("confirm"), CANCEL];
  const result = await L.sheet.handleSupporterCommand(giver, "provideAid");
  assert.equal(shown.length, 3, "recipient, confirm and warnings dialogs were shown");
  assert.equal(result ?? null, null, "Cancel resolves null");
  assertNothingWritten("Cancel on Use anyway", { before, docs, uses: 0, actor: giver, supporterUses: L.uses.supporterUses });
});

test("Provide Aid: confirm and Use anyway applies the use (regression)", async () => {
  const L = await ready();
  const giver = supporter({ level: 5, mods: { cha: 0 } });
  const recipient = ally("Recipient");
  scripted = [pick("ok", { target: recipient.uuid }), pick("confirm"), pick("anyway")];
  const result = await L.sheet.handleSupporterCommand(giver, "provideAid");
  assert.notEqual(result, null);
  assert.equal(L.uses.supporterUses.uses(giver).length, 1, "the use is recorded");
});

// Fort Builder and Artificer setup: a single confirm step each. Cancel must write nothing; Confirm must record a use.
test("Fort Builder: Cancel at the confirm step writes nothing", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  const before = stateOf(art);
  scripted = [CANCEL];
  const result = await L.sheet.handleSupporterCommand(art, "fortBuilder");
  assert.equal(shown.length, 1, "the Fort Builder confirm was shown");
  assert.equal(result ?? null, null);
  assertNothingWritten("Fort Builder cancel", { before, docs: [art], uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("Fort Builder: Confirm records the use (regression)", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  scripted = [pick("confirm")];
  await L.sheet.handleSupporterCommand(art, "fortBuilder");
  assert.equal(shown.length, 1, "only the confirm was shown");
  assert.equal(L.uses.supporterUses.uses(art).length, 1);
});

test("Artificer setup: Cancel at the confirm step writes nothing", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  const before = stateOf(art);
  scripted = [CANCEL];
  const result = await L.sheet.handleSupporterCommand(art, "artificerSetup");
  assert.equal(shown.length, 1, "the setup confirm was shown");
  assert.equal(result ?? null, null);
  assertNothingWritten("Artificer setup cancel", { before, docs: [art], uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("Artificer setup: Confirm records the use (regression)", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  scripted = [pick("confirm")];
  await L.sheet.handleSupporterCommand(art, "artificerSetup");
  assert.equal(shown.length, 1, "only the confirm was shown");
  assert.equal(L.uses.supporterUses.uses(art).length, 1);
});

// Professional Engineer: the variant form (Continue/Cancel) then the readings dialog for the Technology Modifier.
test("Build Automaton: Cancel on the variant form writes nothing", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  const before = stateOf(art);
  scripted = [CANCEL];
  const result = await L.sheet.handleSupporterCommand(art, "buildAutomaton");
  assert.equal(shown.length, 1, "the variant form was the only dialog");
  assert.equal(result ?? null, null);
  assertNothingWritten("variant cancel", { before, docs: [art], uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("Build Automaton [bug-proving]: Cancel on the readings dialog writes nothing (no reading \"cancel\")", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  const before = stateOf(art);
  scripted = [pick("ok", { variant: "platform" }), CANCEL];
  const outcome = await outcomeOf(() => L.sheet.handleSupporterCommand(art, "buildAutomaton"));
  assert.equal(shown.length, 2, "variant form and one readings dialog were shown (a third means Cancel was read as a reading)");
  assert.equal(outcome.error, undefined, `no error: ${outcome.error?.message}`);
  assert.equal(outcome.value ?? null, null, "Cancel resolves null");
  assertNothingWritten("Cancel on readings", { before, docs: [art], uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("Build Automaton: Confirm with the intMod reading builds the Automaton (regression)", async () => {
  const L = await ready();
  const art = artificer({ level: 5, subclassId: "subclass-supporter-artificer" });
  scripted = [pick("ok", { variant: "platform" }), pick("read", { reading: "intMod" })];
  await L.sheet.handleSupporterCommand(art, "buildAutomaton");
  const uses = L.uses.supporterUses.uses(art);
  assert.equal(uses.length, 1);
  const receipt = L.uses.supporterUses.receipt(art, uses[0].id);
  assert.equal(receipt.result?.technologyModifier, "intMod", "the chosen reading is recorded");
});

// Potent Hex: the pick dialog (Confirm/Cancel). A Hex needs a targeted creature.
test("Potent Hex: Cancel on the pick dialog writes nothing", async () => {
  const L = await ready();
  const h = hexer();
  const victim = ally("Victim");
  target(victim);
  const before = stateOf(h, victim);
  scripted = [CANCEL];
  const result = await L.sheet.handleSupporterCommand(h, "potentHex");
  assert.equal(shown.length, 1, "the Hex pick was the only dialog");
  assert.equal(result ?? null, null);
  assertNothingWritten("Potent Hex cancel", { before, docs: [h, victim], uses: 0, actor: h, supporterUses: L.uses.supporterUses });
});

test("Potent Hex: Confirm applies the Hex (regression)", async () => {
  const L = await ready();
  const h = hexer();
  const victim = ally("Victim");
  target(victim);
  scripted = [pick("apply")];
  await L.sheet.handleSupporterCommand(h, "potentHex");
  assert.equal(shown.length, 1, "only the pick was shown");
  assert.equal(L.uses.supporterUses.uses(h).length, 1);
});

// Configure Hexer Arts: a details prompt (Continue, X cancels), then the confirm dialog.
test("Configure Hexer Arts: X at the details prompt writes nothing", async () => {
  const L = await ready();
  const h = hexer();
  const before = stateOf(h);
  scripted = [CLOSE];
  const result = await L.sheet.handleSupporterCommand(h, "configureHexerArts");
  assert.equal(shown.length, 1, "the details prompt was the only dialog");
  assert.equal(result ?? null, null);
  assertNothingWritten("Hexer Arts X", { before, docs: [h], uses: 0, actor: h, supporterUses: L.uses.supporterUses });
});

test("Configure Hexer Arts: Cancel at the confirm step writes nothing", async () => {
  const L = await ready();
  const h = hexer();
  const before = stateOf(h);
  const pool = L.caster.standardPools[0].id;
  scripted = [pick("ok", { ability: "cha", pool1: pool }), CANCEL];
  const result = await L.sheet.handleSupporterCommand(h, "configureHexerArts");
  assert.equal(shown.length, 2, "details and confirm dialogs were shown");
  assert.equal(result ?? null, null);
  assertNothingWritten("Hexer Arts confirm cancel", { before, docs: [h], uses: 0, actor: h, supporterUses: L.uses.supporterUses });
});

test("Configure Hexer Arts [bug-proving]: Cancel on Use anyway writes nothing", async () => {
  const L = await ready();
  const h = hexer();
  const before = stateOf(h);
  const pool = L.caster.standardPools[0].id;
  scripted = [pick("ok", { ability: "cha", pool1: pool }), pick("confirm"), CANCEL];
  const result = await L.sheet.handleSupporterCommand(h, "configureHexerArts");
  assert.equal(shown.length, 3, "details, confirm and warnings dialogs were shown");
  assert.equal(result ?? null, null, "Cancel resolves null");
  assertNothingWritten("Hexer Arts Cancel on Use anyway", { before, docs: [h], uses: 0, actor: h, supporterUses: L.uses.supporterUses });
});

test("Configure Hexer Arts: Confirm, then Use anyway, records the setup (regression)", async () => {
  const L = await ready();
  const h = hexer();
  const pool = L.caster.standardPools[0].id;
  scripted = [pick("ok", { ability: "cha", pool1: pool }), pick("confirm"), pick("anyway")];
  await L.sheet.handleSupporterCommand(h, "configureHexerArts");
  assert.equal(L.uses.supporterUses.uses(h).length, 1);
});

// Compose Performances is a Bard command. The Bard branch is not registered in supporter-branch-index.mjs, so the
// dispatcher cannot route it; the branch's own command is called directly, as supporter-bard-compose.test.mjs does.
async function bardCompose(L) {
  const bard = createTestActor({
    name: "Bard", type: "character", level: 5,
    items: [{ name: "Supporter", type: "class", system: { levels: 13 }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }],
    flags: { ak5e: { supporter: { enabled: true, branch: "bard", aidAbility: "cha" } } },
    abilities: { int: { value: 12, mod: 1 }, wis: { value: 10, mod: 0 }, cha: { value: 16, mod: 3 } },
    skills: { prf: { value: 1, total: 5 } }
  });
  L.bard.defineBardComposePools?.();
  return bard;
}

test("Compose Performances: X at the details prompt writes nothing", async () => {
  const L = await ready();
  const bard = await bardCompose(L);
  const before = stateOf(bard);
  scripted = [CLOSE];
  const result = await L.bard.bardComposeCommand(bard, "composePerformances");
  assert.equal(shown.length, 1, "the details prompt was the only dialog");
  assert.equal(result ?? null, null);
  assertNothingWritten("Compose X", { before, docs: [bard], uses: 0, actor: bard, supporterUses: L.uses.supporterUses });
});

test("Compose Performances: Cancel at the confirm step writes nothing", async () => {
  const L = await ready();
  const bard = await bardCompose(L);
  const before = stateOf(bard);
  scripted = [pick("ok", { aidDice: "1", performances: "Bane" }), CANCEL];
  const result = await L.bard.bardComposeCommand(bard, "composePerformances");
  assert.equal(shown.length, 2, "details and confirm dialogs were shown");
  assert.equal(result ?? null, null);
  assertNothingWritten("Compose confirm cancel", { before, docs: [bard], uses: 0, actor: bard, supporterUses: L.uses.supporterUses });
});

test("Compose Performances: Confirm composes the Performance (regression)", async () => {
  const L = await ready();
  const bard = await bardCompose(L);
  scripted = [pick("ok", { aidDice: "1", performances: "Bane" }), pick("confirm"), pick("anyway")];
  await L.bard.bardComposeCommand(bard, "composePerformances");
  assert.equal(shown.length, 3, "details, confirm and warnings dialogs were shown");
  assert.equal(L.uses.supporterUses.uses(bard).length, 1);
});

// Heavy Duty Upgrades: the install form (Continue/Cancel). Installing below level 4 raises a warning, so the warnings
// dialog ("Use anyway") is also reached.
async function upgradeWorld(L, level) {
  const art = artificer({ level, subclassId: "subclass-supporter-artificer" });
  const auto = automatonOf(art);
  art.flags.ak5e.artificer.automatons = [auto.uuid];
  return { art, auto };
}

test("Install Upgrade: Cancel on the install form writes nothing", async () => {
  const L = await ready();
  const { art, auto } = await upgradeWorld(L, 5);
  const before = stateOf(art, auto);
  scripted = [CANCEL];
  const result = await L.sheet.handleSupporterCommand(art, "artificerInstallUpgrade");
  assert.equal(shown.length, 1, "the install form was the only dialog");
  assert.equal(result ?? null, null);
  assertNothingWritten("install form cancel", { before, docs: [art, auto], uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("Install Upgrade [bug-proving]: Cancel on Use anyway (level 3 warning) installs nothing", async () => {
  const L = await ready();
  const { art, auto } = await upgradeWorld(L, 3);
  const before = stateOf(art, auto);
  scripted = [pick("ok", { source: `auto:${auto.uuid}`, upgradeId: "flamethrower", timing: "longRest" }), CANCEL];
  const result = await L.sheet.handleSupporterCommand(art, "artificerInstallUpgrade");
  assert.equal(shown.length, 2, "install form and warnings dialogs were shown");
  assert.equal(result ?? null, null, "Cancel resolves null");
  assertNothingWritten("Cancel on Use anyway (install)", { before, docs: [art, auto], uses: 0, actor: art, supporterUses: L.uses.supporterUses });
});

test("Install Upgrade: Confirm installs the upgrade (regression)", async () => {
  const L = await ready();
  const { art, auto } = await upgradeWorld(L, 5);
  scripted = [pick("ok", { source: `auto:${auto.uuid}`, upgradeId: "flamethrower", timing: "longRest" })];
  await L.sheet.handleSupporterCommand(art, "artificerInstallUpgrade");
  assert.equal(shown.length, 1, "only the install form was shown");
  assert.equal(L.uses.supporterUses.uses(art).length, 1);
});

// The undo review reached through the dispatcher: the list (Review Undo) then the review itself.
test("handleSupporterCommand undo [bug-proving]: Cancel on the list undoes nothing and opens no review", async () => {
  const L = await ready();
  const { giver, opId } = await recordedAid(L, "u10-dispatch-undo");
  scripted = [CANCEL];
  const outcome = await outcomeOf(() => L.sheet.handleSupporterCommand(giver, "undo"));
  assert.equal(shown.length, 1, "Cancel opens no undo review (a second dialog means Cancel was read as a choice)");
  assert.equal(outcome.error, undefined, `no error: ${outcome.error?.message}`);
  assert.notEqual(L.uses.supporterUses.receipt(giver, opId).status, "undone");
});
