import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat
} from "./base-classes-fixture.mjs";
import { VANGUARD_CLASS_ID } from "../scripts/vanguard-rules.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { vanguardUses } from "../scripts/vanguard-uses.mjs";
import { vanguardBenefitsEngine, vanguardBenefitPreRoll } from "../scripts/vanguard-benefits.mjs";
import {
  registerVanguardExtension, registerVanguardTipGrantSource
} from "../scripts/vanguard-extensions.mjs";
import { expireFeatureTags } from "../scripts/feature-tags.mjs";
import { learnedSkills, operatorState } from "../scripts/operator-rules.mjs";
import { PlayWarnings } from "../scripts/play-undo.mjs";
// Static instance: used only for the Attack Action dialog (item 6). Item 1 registers a separate instance (?late=1)
// so that the registration really is the first one in this process.
import { openVanguardControls } from "../scripts/vanguard-sheet.mjs";

/*
 * Adversarial attack suite for the shared Vanguard Tip / Operator hooks and B-308 (SPEC items 1-7).
 * Written from the SPEC, not from the implementation. Expected results per test are recorded in the
 * challenger report; a RED test marks behaviour the SPEC requires and the current code does not provide.
 *
 * Order matters: ATK-1a must be the first test that registers the Vanguard sheet hooks in this process.
 */

const branchId = "subclass-vanguard-agent";
const TIP_FEATURE_ID = "class-feature-vanguard-1st-level-tip-of-the-spear-3092";
const LEADING_LANCE_ID = "operator-skill-vanguard-basic-leading-lance";
const DEVASTATING_BLOW_ID = "operator-skill-vanguard-advanced-devastating-blow";
// A Tip with a numeric choice is a Directed Engagement use: it carries the level-15 warning and a Reaction check.
// Both are warnings the caller accepts through overrides, not blocking errors (SPEC: warn, never block).
const TIP_WARNINGS = ["range", "range-unverified", "visibility-unverified", "alliance-unverified", "level", "reaction"];
const cardKey = vanguardUses.cardFlag;

/* ----------------------------------------------------------------- shared fixtures */

let dom, chatRoot, gmUser, updateCalls = [];

function installChat() {
  globalThis.ui.chat = {
    rendered: true,
    element: chatRoot,
    // Foundry re-renders one message by replacing its element and running the render hooks again.
    updateMessage(message) {
      const old = chatRoot.querySelector(`[data-message-id="${message.id}"]`);
      const li = freshCard(message);
      if (old) old.replaceWith(li); else chatRoot.append(li);
      updateCalls.push(message.id);
      Hooks.call("renderChatMessageHTML", message, li);
      return li;
    }
  };
}

function freshCard(message) {
  const li = dom.document.createElement("li");
  li.setAttribute("data-message-id", message.id);
  li.innerHTML = `<div class="message-content">${message.content}</div>`;
  return li;
}

/** Draw a chat message the way Foundry does: element first, then the render hooks. */
function drawCard(message) {
  const li = freshCard(message);
  chatRoot.append(li);
  Hooks.call("renderChatMessageHTML", message, li);
  return li;
}

const liFor = message => chatRoot.querySelector(`[data-message-id="${message.id}"]`);
const buttonsOf = element => [...element.querySelectorAll("button")];
const rollButtons = element => buttonsOf(element).filter(button => button.textContent.trim().startsWith("Roll "));
const undoButtons = element => buttonsOf(element).filter(button => button.textContent.trim() === "Undo");
const controlBoxes = element => element.querySelectorAll(".ak5e-play-use-controls");
const cardFor = useId => game.messages.find(message => message.getFlag?.("ak5e", cardKey)?.useId === useId) ?? null;
const aflag = (doc, key) => doc.getFlag?.("ak5e", key) ?? doc.flags?.ak5e?.[key];

function makeVanguard({ level = 5, owner = true, branch = false, flags = {} } = {}) {
  const items = [
    createTestItem({ name: "Vanguard", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: VANGUARD_CLASS_ID } } }),
    createTestItem({ name: "1st Level: Tip of the Spear", type: "feat", flags: { ak5e: { chapterThreeId: TIP_FEATURE_ID } } })
  ];
  if (branch) {
    const record = CHAPTER_THREE_CLASSES.find(entry => entry.id === branchId);
    items.push(createTestItem({ name: record.name, type: "subclass", system: record.systemData, flags: { ak5e: { chapterThreeId: branchId } } }));
  }
  return createTestActor({ name: "Vanguard probe", owner, level, items,
    system: {
      attributes: { prof: Math.floor((level - 1) / 4) + 2, hp: { value: 20, max: 20, temp: 0 } },
      abilities: { dex: { mod: 3 }, str: { mod: 1 }, con: { mod: 2 } }
    },
    flags: { ak5e: { vanguard: { enabled: true }, ...flags } } });
}

function makeAlly(name = "Ally") {
  return createTestActor({ name, system: { attributes: { hp: { value: 10, max: 10, temp: 0 }, movement: { walk: 30 } } } });
}

const tipArgs = target => ({ targetUuid: target.uuid, targetName: target.name, overrides: TIP_WARNINGS, confirmed: true });

/** Route an actor's flag writes through the updateActor hook, as Foundry does for every client. */
function emitUpdateHooks(actor) {
  const update = actor.update.bind(actor);
  actor.update = async (changes, options = {}) => {
    const result = await update(changes, options);
    await Hooks.callAll("updateActor", actor, changes, options, game.user.id);
    return result;
  };
  return actor;
}

const committedActivation = (activationId, sourceId) => ({
  id: `${activationId}:activation`, activationId, kind: "activation", sourceId, committed: true
});

function grantActor() {
  return makeVanguard({ level: 5, flags: { operatorSkills: { operatorEvents: [
    committedActivation("act-ll", LEADING_LANCE_ID), committedActivation("act-db", DEVASTATING_BLOW_ID)] } } });
}

/* ----------------------------------------------------------------- registrations used by item 5 */

registerVanguardTipGrantSource("atk5-invented-id", (_actor, sourceEventId, grantIndex) => sourceEventId === "ev-real" && grantIndex === 1);
registerVanguardTipGrantSource("atk5-always", () => true);
registerVanguardTipGrantSource("atk5-race", () => true);
registerVanguardTipGrantSource("atk5-undo", () => true);
registerVanguardTipGrantSource("atk5-count", (_actor, _sourceEventId, grantIndex) => grantIndex <= 2);
registerVanguardTipGrantSource("atk5-never", () => false);

/* ----------------------------------------------------------------- item 6 extension hook (Skill Haste stand-in) */

let bonusMode = "absent";
registerVanguardExtension(branchId, {
  attackActionBonus(context) {
    if (context.branchId !== branchId) return undefined;
    if (bonusMode === "throw") throw new Error("ATK-6 throwing attackActionBonus hook");
    return { absent: undefined, plus2: 2, zero: 0, nan: NaN, negative: -2, infinity: Infinity }[bonusMode];
  }
});

/* ----------------------------------------------------------------- global setup (one Foundry session per file) */

before(() => {
  setupFoundryGlobals();
  gmUser = game.user;
  dom = parseHTML("<!doctype html><html><body><ol id=\"chat\"></ol></body></html>");
  globalThis.document = dom.document;
  chatRoot = dom.document.querySelector("#chat");
  installChat();
});

after(() => {
  teardownFoundryGlobals();
  delete globalThis.document;
});

beforeEach(() => {
  game.user = gmUser;
  game.messages.length = 0;
  game.combat = null;
  chatRoot.innerHTML = "";
  updateCalls = [];
});

afterEach(() => {
  bonusMode = "absent";
});

/* ================================================================= ITEM 1: B-308 late render */

test("ATK-1a (item 1): an awaitingRoll Tip card drawn before the Vanguard sheet hooks register gets its Roll after registration", async () => {
  assert.equal(Hooks._hooks.get("renderChatMessageHTML")?.length ?? 0, 0,
    "precondition: no render hook is registered yet in this process");
  const actor = makeVanguard({ level: 5 }), ally = makeAlly("B-308 ally");
  await vanguardUses.command(actor, "tipOfTheSpear", tipArgs(ally), "atk1-roll");
  const message = cardFor("atk1-roll");
  assert.ok(message, "precondition: the awaitingRoll card is in the chat log");
  const early = drawCard(message);
  assert.equal(rollButtons(early).length, 0, "precondition: the early card has no Roll control yet");

  const sheet = await import("../scripts/vanguard-sheet.mjs?late=1");
  sheet.registerVanguardSheetHooks();

  const after = liFor(message);
  assert.equal(rollButtons(after).length, 1, "after registration the displayed awaitingRoll card shows exactly one Roll");
  assert.match(rollButtons(after)[0].textContent.trim(), /^Roll 1d6/, "the Roll control names the 1d6 Tip roll");
});

test("ATK-1b (item 1): repeated render of the same card does not duplicate the play-use controls or Roll", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const actor = makeVanguard({ level: 5 }), ally = makeAlly("Double render ally");
  await vanguardUses.command(actor, "tipOfTheSpear", tipArgs(ally), "atk1-double");
  const message = cardFor("atk1-double");
  const li = drawCard(message);
  Hooks.call("renderChatMessageHTML", message, li);
  Hooks.call("renderChatMessageHTML", message, li);
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  assert.equal(controlBoxes(li).length, 1, "one controls box per card, however many times it renders");
  assert.equal(rollButtons(li).length, 1, "one Roll button per card");
});

test("ATK-1c (item 1): a non-owner viewer of an awaitingRoll Tip card gets no Roll control", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const actor = makeVanguard({ level: 5 }), ally = makeAlly("Viewer ally");
  await vanguardUses.command(actor, "tipOfTheSpear", tipArgs(ally), "atk1-viewer");
  const message = cardFor("atk1-viewer");
  actor.isOwner = false;
  try {
    const li = drawCard(message);
    assert.equal(rollButtons(li).length, 0, "a viewer who does not own the Actor cannot roll its Tip");
    assert.equal(controlBoxes(li).length, 0, "no play-use controls for a viewer who does not own the Actor");
  } finally {
    actor.isOwner = true;
  }
});

test("ATK-1d (item 1): a card whose status is not awaitingRoll shows no Roll control, and resolved cards offer Undo", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const actor = makeVanguard({ level: 5 }), ally = makeAlly("Resolved ally");
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, "atk1-resolved");
  const message = cardFor("atk1-resolved");
  const li = drawCard(message);
  assert.equal(rollButtons(li).length, 0, "a complete Tip card has no Roll");
  assert.equal(undoButtons(li).length, 1, "a complete Tip card offers Undo");
});

/* ================================================================= ITEM 2: receipt change refresh */

test("ATK-2a (item 2): resolving the Tip roll through the receipt re-renders the displayed card: Roll disappears, Undo appears", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const actor = emitUpdateHooks(makeVanguard({ level: 5 })), ally = makeAlly("Refresh ally");
  await vanguardUses.command(actor, "tipOfTheSpear", tipArgs(ally), "atk2-roll");
  const message = cardFor("atk2-roll");
  const li = drawCard(message);
  assert.equal(rollButtons(li).length, 1, "precondition: the awaitingRoll card shows Roll");
  const before = updateCalls.length;
  await vanguardUses.command(actor, "useRoll", { useId: "atk2-roll" });
  assert.ok(updateCalls.length > before, "the receipt flag change re-rendered the displayed card");
  const after = liFor(message);
  assert.equal(rollButtons(after).length, 0, "after the roll resolves the card no longer offers Roll");
  assert.equal(undoButtons(after).length, 1, "the resolved card offers Undo");
});

test("ATK-2b (item 2): a receipt change on one Actor does not re-render another Actor's card", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const owner = emitUpdateHooks(makeVanguard({ level: 5 })), other = emitUpdateHooks(makeVanguard({ level: 5 }));
  const ally = makeAlly("Scoped ally");
  await vanguardUses.command(owner, "tipOfTheSpear", tipArgs(ally), "atk2-scope");
  const message = cardFor("atk2-scope");
  drawCard(message);
  const before = updateCalls.filter(id => id === message.id).length;
  await other.update({ "flags.ak5e.vanguardUses": { undo: [] } });
  assert.equal(updateCalls.filter(id => id === message.id).length, before, "the other Actor's receipt write leaves this card alone");
});

test("ATK-2c (item 2): an Actor flag write that is not the vanguardUses receipt does not re-render Tip cards", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const actor = emitUpdateHooks(makeVanguard({ level: 5 })), ally = makeAlly("Unrelated write ally");
  await vanguardUses.command(actor, "tipOfTheSpear", tipArgs(ally), "atk2-unrelated");
  const message = cardFor("atk2-unrelated");
  drawCard(message);
  const before = updateCalls.filter(id => id === message.id).length;
  await actor.update({ "flags.ak5e.somethingElse": { touched: true } });
  assert.equal(updateCalls.filter(id => id === message.id).length, before, "unrelated flag writes do not re-render the card");
});

/* ================================================================= ITEM 3: Tip boundary race */

async function boundarySetup(prefix) {
  const source = makeVanguard({ level: 5 }), ally = makeAlly(`${prefix} ally`), other = makeAlly(`${prefix} earlier combatant`);
  // Written before any combat: a manual-trigger receipt the boundary must not touch.
  await vanguardUses.command(source, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, `${prefix}-manual`);
  const combat = createTestCombat([other, source], { round: 1, turn: 0, started: true });
  game.combat = combat;
  await vanguardUses.command(source, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, `${prefix}-old`);
  const event = { kind: "combatTurn", combat: { uuid: combat.uuid, round: 1, turn: 1, previous: { round: 1, turn: 0 }, turns: combat.turns } };
  return { source, ally, event };
}

test("ATK-3a (item 3): a Tip written while the boundary is in flight survives; only the expired receipt is marked", async () => {
  const { source, ally, event } = await boundarySetup("atk3a");
  assert.equal(vanguardUses.receipt(source, "atk3a-old").tipDeadline.trigger, "turnStart", "precondition: the old receipt has a turnStart deadline");
  assert.equal(vanguardUses.receipt(source, "atk3a-manual").tipDeadline.trigger, "manual", "precondition: the manual receipt has a manual deadline");
  const manualBefore = structuredClone(vanguardUses.receipt(source, "atk3a-manual"));

  // Hold the boundary's write (between its read and its write) and start a concurrent Tip.
  let release, arrive;
  const gate = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { arrive = resolve; });
  const originalUpdate = source.update.bind(source);
  let held = false;
  source.update = async (changes, options = {}) => {
    if (!held && Object.hasOwn(changes ?? {}, "flags.ak5e.vanguardUses.undo")) { held = true; arrive(); await gate; }
    return originalUpdate(changes, options);
  };
  try {
    const boundary = expireFeatureTags(event);
    await reached;
    const racing = vanguardUses.command(source, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, "atk3a-new");
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    await Promise.all([boundary, racing]);
  } finally {
    source.update = originalUpdate;
  }

  assert.equal(vanguardUses.receipt(source, "atk3a-old")?.tipBoundaryReached, true, "the expired receipt is marked by the boundary");
  assert.ok(vanguardUses.receipt(source, "atk3a-new"), "a Tip written during the boundary's read-to-write window is not clobbered");
  assert.equal(vanguardUses.receipt(source, "atk3a-new")?.tipBoundaryReached, undefined, "the concurrent receipt is not marked as expired");
  assert.deepEqual(vanguardUses.receipt(source, "atk3a-manual"), manualBefore, "a receipt that has not crossed its deadline is unchanged");
});

test("ATK-3b (item 3, control): without a race, the boundary marks only the crossed receipt", async () => {
  const { source, event } = await boundarySetup("atk3b");
  const manualBefore = structuredClone(vanguardUses.receipt(source, "atk3b-manual"));
  await expireFeatureTags(event);
  assert.equal(vanguardUses.receipt(source, "atk3b-old")?.tipBoundaryReached, true, "the crossed receipt is marked");
  assert.deepEqual(vanguardUses.receipt(source, "atk3b-manual"), manualBefore, "the manual receipt is unchanged");
});

/* ================================================================= ITEM 4: outcome-1 benefit card and damage component */

test("ATK-4a (item 4): an outcome-1 (+PB damage) benefit card gets Undo through the render hook", async () => {
  await import("../scripts/vanguard-sheet.mjs?late=1").then(sheet => sheet.registerVanguardSheetHooks());
  const actor = makeVanguard({ level: 5 }), ally = makeAlly("Outcome one ally");
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, "atk4-card");
  const message = cardFor("atk4-card");
  assert.ok(message, "precondition: the outcome-1 card exists");
  const li = drawCard(message);
  assert.equal(undoButtons(li).length, 1, "the outcome-1 card offers Undo through the render hook");
  assert.equal(undoButtons(li)[0].disabled, false, "Undo is enabled for the owner inside the encounter window");
});

async function armedBenefit(prefix, componentIndex) {
  const actor = makeVanguard({ level: 5 }), ally = makeAlly(`${prefix} recipient`);
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, `${prefix}-tip`);
  const effect = [...ally.effects.values()].find(candidate => aflag(candidate, "vanguardUsesEffect")?.standardBenefit?.kind === "tip1");
  assert.ok(effect, "precondition: outcome 1 gives the recipient a managed +PB damage effect");
  await vanguardBenefitsEngine.command(ally, "armTipDamage", { effectId: effect.id, componentIndex, confirmed: true }, `${prefix}-arm`);
  assert.equal(vanguardBenefitsEngine.receipt(ally, `${prefix}-arm`).status, "awaitingNativeRoll", "precondition: the bonus is armed");
  return { ally, effect };
}

test("ATK-4b (item 4): a missing damage component index warns and keeps the benefit armed (not silently dropped)", async () => {
  const { ally, effect } = await armedBenefit("atk4b", 3);
  const warnings = [];
  const original = globalThis.ui.notifications.warn;
  globalThis.ui.notifications.warn = message => warnings.push(String(message));
  const roll = { parts: ["1d8"], options: {} };
  const message = {};
  try {
    vanguardBenefitPreRoll({ subject: { actor: ally }, rolls: [roll] }, {}, message);
  } finally {
    globalThis.ui.notifications.warn = original;
  }
  assert.equal(warnings.length, 1, "one warning names the absent damage component");
  assert.match(warnings[0], /component 3 is absent/, "the warning identifies component 3");
  assert.deepEqual(roll.parts, ["1d8"], "no bonus is applied to the unrelated roll");
  assert.equal(message.create, undefined, "the native roll is not marked as consuming the benefit");
  assert.equal(vanguardBenefitsEngine.receipt(ally, "atk4b-arm").status, "awaitingNativeRoll", "the armed receipt stays armed");
  assert.ok(aflag(ally, "vanguardTipBenefits")?.armed, "the armed flag is still set");
  assert.equal(effect.disabled, false, "the benefit effect is not consumed");
});

test("ATK-4c (item 4, control): the same armed benefit adds its bonus to the matching component", async () => {
  const { ally } = await armedBenefit("atk4c", 1);
  const first = { parts: ["1d6"], options: {} }, second = { parts: ["1d8"], options: {} };
  vanguardBenefitPreRoll({ subject: { actor: ally }, rolls: [first, second] }, {}, {});
  assert.deepEqual(first.parts, ["1d6"], "the other component is unchanged");
  assert.deepEqual(second.parts, ["1d8", "3"], "the matching component receives the +PB bonus");
});

/* ================================================================= ITEM 5: Tip grant-source registry */

test("ATK-5a (item 5): an unregistered grant kind is rejected", async () => {
  const actor = grantActor(), ally = makeAlly("Grant ally");
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1,
    grantKind: "atk5-never-registered", sourceEventId: "ev-1", grantIndex: 1 }, "atk5a"), /not registered/);
  assert.equal(vanguardUses.receipt(actor, "atk5a"), null, "no receipt is written for the rejected grant");
});

test("ATK-5b (item 5): an invented sourceEventId that the validator rejects is refused; the real one is accepted", async () => {
  const actor = grantActor(), ally = makeAlly("Invented id ally");
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1,
    grantKind: "atk5-invented-id", sourceEventId: "ev-made-up", grantIndex: 1 }, "atk5b-fake"));
  assert.equal(vanguardUses.receipt(actor, "atk5b-fake"), null);
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1,
    grantKind: "atk5-invented-id", sourceEventId: "ev-real", grantIndex: 1 }, "atk5b-real");
  assert.ok(vanguardUses.receipt(actor, "atk5b-real"), "the validated grant is accepted");
});

test("ATK-5b2 (item 5): a validator that returns false refuses the grant", async () => {
  const actor = grantActor(), ally = makeAlly("Refused ally");
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1,
    grantKind: "atk5-never", sourceEventId: "ev-any", grantIndex: 1 }, "atk5b2"));
  assert.equal(vanguardUses.receipt(actor, "atk5b2"), null);
});

test("ATK-5c (item 5): the same (kind, sourceEventId, grantIndex) cannot back two live receipts", async () => {
  const actor = grantActor(), ally = makeAlly("Dup ally");
  const grant = { grantKind: "atk5-always", sourceEventId: "ev-dup", grantIndex: 1 };
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5c-1");
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5c-2"),
    /already used/, "a second live receipt for the same grant is refused");
  assert.equal(vanguardUses.receipt(actor, "atk5c-2"), null);
});

test("ATK-5c2 (item 5): two concurrent calls for the same grant produce exactly one live receipt", async () => {
  const actor = grantActor(), ally = makeAlly("Race ally");
  const grant = { grantKind: "atk5-race", sourceEventId: "ev-race", grantIndex: 1 };
  const results = await Promise.allSettled([
    vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5c2-a"),
    vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5c2-b")
  ]);
  const fulfilled = results.filter(result => result.status === "fulfilled").length;
  const live = ["atk5c2-a", "atk5c2-b"].filter(id => vanguardUses.receipt(actor, id)?.status !== "undone" && vanguardUses.receipt(actor, id));
  assert.equal(fulfilled, 1, "exactly one of the two concurrent calls succeeds");
  assert.equal(live.length, 1, "exactly one live receipt backs the grant");
});

test("ATK-5d (item 5): undoing the receipt releases the grant for a new use", async () => {
  const actor = grantActor(), ally = makeAlly("Undo ally");
  const grant = { grantKind: "atk5-undo", sourceEventId: "ev-undo", grantIndex: 1 };
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5d-1");
  await vanguardUses.command(actor, "undoUse", { useId: "atk5d-1" }, "atk5d-undo");
  assert.equal(vanguardUses.receipt(actor, "atk5d-1")?.status, "undone", "precondition: the first receipt is undone");
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5d-2");
  assert.ok(vanguardUses.receipt(actor, "atk5d-2"), "the released grant backs a new live receipt");
});

test("ATK-5e (item 5): a grantIndex beyond the validator's count is rejected; a non-whole-number index is rejected", async () => {
  const actor = grantActor(), ally = makeAlly("Count ally");
  const base = { ...tipArgs(ally), choice: 1, grantKind: "atk5-count", sourceEventId: "ev-count" };
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...base, grantIndex: 3 }, "atk5e-3"));
  assert.equal(vanguardUses.receipt(actor, "atk5e-3"), null);
  await vanguardUses.command(actor, "tipOfTheSpear", { ...base, grantIndex: 2 }, "atk5e-2");
  assert.ok(vanguardUses.receipt(actor, "atk5e-2"), "index 2 is within the validator's count");
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...base, grantIndex: 0 }, "atk5e-0"), /whole-number/);
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { ...base, grantIndex: 1.5 }, "atk5e-frac"), /whole-number/);
});

test("ATK-5f (item 5): a plain Tip without a grant is unchanged, and two plain Tips are not blocked by each other", async () => {
  const actor = grantActor(), ally = makeAlly("Plain ally");
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, "atk5f-1");
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1 }, "atk5f-2");
  assert.equal(vanguardUses.receipt(actor, "atk5f-1").status, "complete");
  assert.equal(vanguardUses.receipt(actor, "atk5f-2").status, "complete");
  assert.equal(vanguardUses.receipt(actor, "atk5f-2").data?.grantKind, undefined, "no grant fields are recorded for a plain Tip");
});

test("ATK-5g (item 5): Leading Lance grants two Tips tied to a committed activation; a third or an uncommitted source is refused", async () => {
  const actor = grantActor(), ally = makeAlly("Lance ally");
  const ll = (id, index, sourceEventId = "act-ll") => vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1,
    grantKind: "leading-lance", sourceEventId, grantIndex: index }, id);
  await ll("atk5g-1", 1);
  await ll("atk5g-2", 2);
  assert.ok(vanguardUses.receipt(actor, "atk5g-1") && vanguardUses.receipt(actor, "atk5g-2"), "both Leading Lance grants are usable");
  await assert.rejects(() => ll("atk5g-3", 3));
  await assert.rejects(() => ll("atk5g-dup", 1));
  await assert.rejects(() => ll("atk5g-none", 1, "act-uncommitted"));
});

test("ATK-5g2 (item 5): Devastating Blow grants one Tip tied to a committed activation; a second grant is refused", async () => {
  const actor = grantActor(), ally = makeAlly("Blow ally");
  const db = (id, index, sourceEventId = "act-db") => vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1,
    grantKind: "devastating-blow", sourceEventId, grantIndex: index }, id);
  await db("atk5g2-1", 1);
  assert.ok(vanguardUses.receipt(actor, "atk5g2-1"), "the Devastating Blow grant is usable");
  await assert.rejects(() => db("atk5g2-2", 2));
  await assert.rejects(() => db("atk5g2-dup", 1));
  await assert.rejects(() => db("atk5g2-ll", 1, "act-ll"), undefined, "a Leading Lance activation cannot back a Devastating Blow grant");
});

test("ATK-5h (item 5): a range or prerequisite problem warns through the override path and does not turn into a grant refusal", async () => {
  const actor = grantActor(), ally = makeAlly("Warn ally");
  const grant = { grantKind: "leading-lance", sourceEventId: "act-ll", grantIndex: 1 };
  await assert.rejects(() => vanguardUses.command(actor, "tipOfTheSpear", { targetUuid: ally.uuid, targetName: ally.name, choice: 1,
    confirmed: true, ...grant }, "atk5h-warn"), error => error instanceof PlayWarnings,
  "without accepting the warnings the use waits on the warning list, not on a grant error");
  assert.equal(vanguardUses.receipt(actor, "atk5h-warn"), null);
  await vanguardUses.command(actor, "tipOfTheSpear", { ...tipArgs(ally), choice: 1, ...grant }, "atk5h-ok");
  assert.ok(vanguardUses.receipt(actor, "atk5h-ok"), "accepting the warnings completes the granted Tip");
});

/* ================================================================= ITEM 6: attackActionBonus (Skill Haste hook) */

async function attackActionCount(actor) {
  const calls = [];
  foundry.applications ??= {};
  foundry.applications.api ??= {};
  foundry.applications.api.DialogV2 = {
    async wait(options) { calls.push(options); return null; },
    async confirm() { return false; }
  };
  await openVanguardControls(actor);
  const controls = calls[0];
  const { document: panel, window } = parseHTML(`<html><body>${controls.content}</body></html>`);
  controls.render?.(null, { element: panel });
  const button = panel.querySelector("[data-action=\"attackAction\"]");
  assert.ok(button, "the Attack Action procedure is offered on the Vanguard controls");
  button.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const attack = calls.find(options => options.window?.title === "Vanguard Attack Action");
  assert.ok(attack, "the Attack Action dialog opens");
  const match = attack.content.match(/<strong>(\d+)<\/strong>/);
  assert.ok(match, "the dialog states the Attack Action count");
  return Number(match[1]);
}

const LEVELS = [1, 5, 11, 20];
const BASE_ATTACKS = { 1: 1, 5: 2, 11: 2, 20: 2 }; // one Attack, plus Extra Attack at 5th level (Vanguard only has the one)

test("ATK-6a (item 6): with no contribution the Attack Action count is unchanged at levels 1/5/11/20", async () => {
  bonusMode = "absent";
  for (const level of LEVELS) {
    const actor = makeVanguard({ level, branch: true });
    assert.equal(await attackActionCount(actor), BASE_ATTACKS[level], `level ${level}: base Attack Action count`);
  }
});

test("ATK-6b (item 6): an attackActionBonus contribution adds to the base count at each level", async () => {
  bonusMode = "plus2";
  for (const level of LEVELS) {
    const actor = makeVanguard({ level, branch: true });
    assert.equal(await attackActionCount(actor), BASE_ATTACKS[level] + 2, `level ${level}: base plus the hook's 2`);
  }
});

test("ATK-6c (item 6): NaN, negative, zero and infinite contributions count as 0", async () => {
  for (const mode of ["nan", "negative", "zero", "infinity"]) {
    bonusMode = mode;
    for (const level of LEVELS) {
      const actor = makeVanguard({ level, branch: true });
      assert.equal(await attackActionCount(actor), BASE_ATTACKS[level], `${mode} at level ${level} adds nothing`);
    }
  }
});

test("ATK-6d (item 6): a throwing attackActionBonus hook counts as 0 and does not break the procedure", async () => {
  bonusMode = "throw";
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const level of LEVELS) {
      const actor = makeVanguard({ level, branch: true });
      assert.equal(await attackActionCount(actor), BASE_ATTACKS[level], `throwing hook at level ${level} adds nothing`);
    }
  } finally {
    console.error = originalError;
  }
});

/* ================================================================= ITEM 7: Breakthrough ignoreCharging */

const skillMeta = (sourceId, extra = {}) => ({
  sourceId, cost: 2, start: 0, methods: ["automatic", "defensive"], duration: "Instant", activation: "Action", enabled: true, ...extra
});
const skillItem = (name, metadata, choice = null) => createTestItem({ name, type: "feat", flags: { ak5e: {
  operatorSkill: metadata, ...(choice ? { operatorSkillChoice: choice } : {}) } } });

test("ATK-7a (item 7): an Elite-slot Skill flagged ignoreCharging adds no charging rate but still counts for SP cost", async () => {
  const items = [skillItem("Breakthrough (flagged)", skillMeta("atk7-elite", { ignoreCharging: true }))];
  const skills = learnedSkills(items);
  assert.equal(skills[0].ignoreCharging, true, "the flagged Skill keeps its ignoreCharging marker");
  const state = operatorState({ enabled: true }, skills);
  assert.deepEqual(state.rates, { automatic: 0, offensive: 0, defensive: 0 }, "no charging rate from the flagged Skill");
  assert.equal(state.maximum, 2, "the flagged Skill still counts for SP cost");
});

test("ATK-7b (item 7, control): an unflagged Skill with the same methods does add its charging rates", async () => {
  const items = [skillItem("Ordinary twin", skillMeta("atk7-ordinary"))];
  const state = operatorState({ enabled: true }, learnedSkills(items));
  assert.deepEqual(state.rates, { automatic: 2, offensive: 0, defensive: 2 }, "automatic and defensive rates both come from the twin");
});

// ATK-7c/7d (item flags smuggling ignoreCharging) removed by head ruling: ignoreCharging is stored on the
// actor's own item flags, which owners can already edit; WORKFLOW 3.2 (trust the table) makes that an
// accepted, non-integrity risk. Recorded in ak5e/DECISIONS.md.

test("ATK-7e (item 7): ignoreCharging is kept only as the exact boolean true", async () => {
  const { skillDefinition } = await import("../scripts/operator-rules.mjs");
  for (const value of ["true", 1, "yes", {}]) {
    const definition = skillDefinition({ ...skillMeta("atk7-type"), ignoreCharging: value });
    assert.equal(definition.ignoreCharging, undefined, `ignoreCharging ${JSON.stringify(value)} is dropped`);
  }
  assert.equal(skillDefinition({ ...skillMeta("atk7-type"), ignoreCharging: true }).ignoreCharging, true, "exact true is kept");
});
