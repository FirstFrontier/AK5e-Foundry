/**
 * R1 base adversarial suite (challenger for pair F1, Supporter base, Foundry V13 + dnd5e 5.3.3).
 *
 * Behaviour-level tests for the head rulings F-R1 to F-R8. Each test asserts observable state (effects,
 * flags, Temp HP, pool values, dialogs shown or not, chat messages, relay outcomes) and reaches the code
 * through public entry points: supporterUses.execute/command/undo/plan/handleRelay, renderAidCardButtons
 * (card buttons), handleSupporterCommand (sheet controls), and exported helpers.
 *
 * Source references: C3 = AK5e 1.3.1 Chapter 3 (Supporter). C3:6635 is "Once within the next ten minutes".
 * Many tests are expected to FAIL on the base commit 4492be2; they are the red evidence for F1.
 * Where the spec leaves the shape open, the test is marked `todo` with a note.
 *
 * Order matters for one test: the F-R2 registration test runs first because registerSupporterTalentPlans()
 * is idempotent per process (a module-level flag), so its first call must come from that test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel, aidDieSize, aidAbilityKey, aidDieMax, supporterLevel } from "../scripts/supporter-rules.mjs";
import {
  defineSupporterPools, findAidDieEffect, onSupporterRest
} from "../scripts/supporter-features.mjs";
import { supporterUses, renderAidCardButtons } from "../scripts/supporter-uses.mjs";
import { handleSupporterCommand, supporterPanelHtml } from "../scripts/supporter-sheet.mjs";
import { registerSupporterTalentPlans, SUPPORTER_TALENT_IDS } from "../scripts/supporter-talents.mjs";
import { getPool, getPoolDefinition, recoverPool, setPool } from "../scripts/resource-pools.mjs";
import { expireFeatureTags } from "../scripts/feature-tags.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";
import { SUPPORTER_BRANCH_MODULES, registerSupporterBranchModule } from "../scripts/supporter-branches.mjs";
import { writeArtItems, revertArtItems } from "../scripts/supporter-arts.mjs";

const PROVIDE_AID_FEATURE = "class-feature-supporter-1st-level-provide-aid-2284";
const LIGHTEN_FEATURE = "class-feature-supporter-11th-level-lighten-the-load-5608";
const CARD_FLAG = supporterUses.cardFlag ?? "supporterUsesUse";
const RELAY_REQUEST_FLAG = "supporterUsesRelayRequest";
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 2, wis: 1, cha: 4 });

let docs;
let dialogs;
let answers;
let notices;
let rolls;

/* ==========================================================================
   Environment
   ========================================================================== */

/** DialogV2 stub. Answers are consumed in order: a button action string, null (X close), or { action, elements }. */
function answerWait(options) {
  const answer = answers.length ? answers.shift() : "confirm";
  const { action, elements } = typeof answer === "object" && answer !== null ? { action: answer.action ?? "confirm", elements: answer.elements ?? {} } : { action: answer, elements: {} };
  dialogs.push({ title: options.window?.title ?? "", content: String(options.content ?? ""), buttons: options.buttons ?? [], answer });
  if (action === null) return null;
  const buttons = options.buttons ?? [];
  const button = buttons.find(entry => entry.action === action)
    ?? (action === "confirm" ? buttons.find(entry => !["cancel", "close"].includes(entry.action)) : null);
  if (!button) throw new Error(`no "${action}" button in ${options.window?.title}`);
  // Foundry resolves a click as (await callback()) ?? action.
  return (async () => (await button.callback?.(null, { form: { elements } })) ?? button.action)();
}

async function answerPrompt(options) {
  const answer = answers.length ? answers.shift() : "confirm";
  const { action, elements } = typeof answer === "object" && answer !== null ? { action: answer.action ?? "confirm", elements: answer.elements ?? {} } : { action: answer, elements: {} };
  dialogs.push({ title: options.window?.title ?? "", content: String(options.content ?? ""), buttons: [], answer, prompt: true });
  if (action === null || action === "cancel") return null;
  return (await options.ok?.callback?.(null, { form: { elements } })) ?? "ok";
}

function stubDialogs() {
  foundry.applications = { api: { DialogV2: {
    wait: async options => answerWait(options),
    confirm: async options => answerWait(options),
    prompt: async options => answerPrompt(options)
  } } };
}

/** Counts every Roll the engine constructs (the mock Roll evaluates to 4). */
function countRolls() {
  const Base = globalThis.Roll;
  globalThis.Roll = class CountingRoll extends Base {
    constructor(formula, data) { super(formula, data); rolls += 1; }
  };
}

const settle = async () => { for (let i = 0; i < 50; i++) await new Promise(resolve => setImmediate(resolve)); };

test.beforeEach(() => {
  setupFoundryGlobals();
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  game.time = { worldTime: 1000 };
  game.combat = null;
  game.user.targets = new Set();
  dialogs = [];
  answers = [];
  notices = [];
  rolls = 0;
  globalThis.ui.notifications.error = message => { notices.push(String(message)); };
  globalThis.ui.notifications.warn = message => { notices.push(String(message)); };
  stubDialogs();
  countRolls();
  defineSupporterPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/* ==========================================================================
   Helpers
   ========================================================================== */

/** A Supporter at `level`. `mods` overrides ability modifiers. `flags.aidAbility` only when given. */
function supporter({ level = 5, mods = {}, aidAbility, hp, extraItems = [], pack } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } }
  }), ...extraItems];
  const supporterFlags = { enabled: true };
  if (aidAbility !== undefined) supporterFlags.aidAbility = aidAbility;
  const actor = createTestActor({
    name: `Supporter L${level}`, level, items, abilities, pack: pack ?? null,
    hp: hp ?? { value: 20, max: 20, temp: 0 },
    flags: { ak5e: { supporter: supporterFlags } }
  });
  docs.set(actor.uuid, actor);
  return actor;
}

/** A plain creature (not a Supporter) that can be a Provide Aid recipient. */
function creature(name, { owner = true, type = "character" } = {}) {
  const actor = createTestActor({ name, type, owner, ownership: owner ? undefined : { default: 0 } });
  docs.set(actor.uuid, actor);
  return actor;
}

const provideAidItem = () => createTestItem({
  name: "Provide Aid", type: "feat", flags: { ak5e: { chapterThreeId: PROVIDE_AID_FEATURE } }
});

/** Plants the Aid Die Active Effect that Provide Aid creates (same shape the engine reads). */
async function holdAidDie(actor, data = {}) {
  const level = supporterLevel(actor) ?? 1;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Aid Die",
    flags: { ak5e: {
      supporterUsesEffect: { aidDie: true, opId: "test-hold", sourceUuid: "Actor.supporter" },
      featureTag: { data: { dieSize: aidDieSize(level), supporterLevel: level, supporterPB: pbForLevel(level),
        advancedAid: level >= 5, willIntoBeing: level >= 20, ...data } }
    } }
  }]);
  return findAidDieEffect(actor);
}

/** Parses the card markup into button-like objects, one per <button>, with data-* attributes as dataset. */
function cardButtons(html) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  return Array.from(document.querySelectorAll("button")).map(element => {
    const dataset = {};
    for (const attribute of Array.from(element.attributes)) {
      if (!attribute.name.startsWith("data-")) continue;
      dataset[attribute.name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attribute.value;
    }
    const listeners = [];
    return { dataset, disabled: false, listeners, addEventListener(type, fn) { if (type === "click") listeners.push(fn); } };
  });
}

/** Binds the card's buttons through the real renderer (renderAidCardButtons) for the given use. */
function renderCard(actor, useId) {
  const receipt = supporterUses.receipt(actor, useId);
  assert.ok(receipt, `receipt ${useId} exists`);
  const buttons = cardButtons(receipt.summary);
  renderAidCardButtons({ flags: { ak5e: { [CARD_FLAG]: { useId } } } }, { querySelectorAll: () => buttons });
  return buttons;
}

const rollButton = buttons => buttons.find(button => button.dataset.ak5eAidRoll !== undefined);
const riderButton = (buttons, id) => buttons.find(button => button.dataset.ak5eRider === id);

/** A user click: runs the bound listeners and waits for the handler to finish (it disables the button while running). */
async function press(button) {
  assert.ok(button, "the card shows this button");
  for (const listener of button.listeners) listener({ preventDefault() {}, stopPropagation() {} });
  for (let i = 0; i < 2000 && button.disabled; i++) await new Promise(resolve => setImmediate(resolve));
  await settle();
}

const shownText = () => dialogs.map(entry => `${entry.title}\n${entry.content}`).join("\n");

const stateOf = actor => supporterUses.state(actor);
const lastReceiptFor = (actor, command) => stateOf(actor).undo.filter(entry => entry.command === command).at(-1) ?? null;

/* ==========================================================================
   F-R2 Talent pools are defined at registration (runs first; see header)
   ========================================================================== */

test("F-R2: registerSupporterTalentPlans defines the Luck pools, so a rest refills them before any talent plan runs", async () => {
  assert.equal(getPoolDefinition("supporterLuckBase"), undefined, "no talent pool exists before registration");
  assert.doesNotThrow(() => registerSupporterTalentPlans());
  assert.ok(getPoolDefinition("supporterLuckBase"), "Luck pool is defined at registration, not on first use");

  const actor = supporter({ level: 3 });
  actor.items.set("lucky-item", createTestItem({ _id: "lucky-item", name: "Lucky", type: "feat",
    flags: { ak5e: { chapterThreeId: SUPPORTER_TALENT_IDS.lucky } } }));
  await setPool(actor, "supporterLuckBase", 0);
  await recoverPool(actor, "lr");
  assert.equal(getPool(actor, "supporterLuckBase").value, 2, "a long rest refills Luck Points to the maximum of 2");
});

test("F-R2: registering the talent plans a second time is a no-op (no throw, one definition)", () => {
  assert.doesNotThrow(() => registerSupporterTalentPlans());
  assert.doesNotThrow(() => registerSupporterTalentPlans());
  assert.ok(getPoolDefinition("supporterLuckBase"));
});

/* ==========================================================================
   F-R1 Aid Die duration: "Once within the next ten minutes" (C3:6635)
   ========================================================================== */

test("F-R1: Provide Aid (item path) records a 600-second time trigger on the receipt tag", async () => {
  const actor = supporter({ level: 5, extraItems: [provideAidItem()] });
  const ally = creature("Ally");
  await supporterUses.execute(actor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 30 }, "r1-pa-tag");
  const tag = supporterUses.receipt(actor, "r1-pa-tag").targets[0].tag;
  assert.equal(tag.trigger, "time", "the Aid Die is a time-based effect");
  assert.equal(tag.seconds, 600, "ten minutes");
});

test("F-R1: Provide Aid fallback path (no Provide Aid item) also records a 600-second time trigger", async () => {
  const actor = supporter({ level: 5 });
  const ally = creature("Ally");
  await supporterUses.execute(actor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 30 }, "r1-pa-fallback");
  const tag = supporterUses.receipt(actor, "r1-pa-fallback").targets[0].tag;
  assert.equal(tag.trigger, "time");
  assert.equal(tag.seconds, 600);
  const effect = findAidDieEffect(ally);
  assert.ok(effect, "the fallback creates the Aid Die effect on the recipient");
  const featureTag = effect.flags.ak5e.featureTag;
  const expiresAfter600 = (featureTag?.trigger === "time" && featureTag?.seconds === 600) || effect.duration?.seconds === 600;
  assert.ok(expiresAfter600, "the fallback effect carries a 600-second expiry (either representation)");
});

test("F-R1: the Provide Aid effect expires exactly at 600 s of world time, not before", async () => {
  const actor = supporter({ level: 5, extraItems: [provideAidItem()] });
  const ally = creature("Ally");
  game.time.worldTime = 1000;
  await supporterUses.execute(actor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 30 }, "r1-pa-time");
  assert.ok(findAidDieEffect(ally), "granted");
  await expireFeatureTags({ kind: "time", worldTime: 1599 });
  assert.ok(findAidDieEffect(ally), "still present at 599 s");
  await expireFeatureTags({ kind: "time", worldTime: 1600 });
  assert.equal(findAidDieEffect(ally), null, "expired at 600 s");
});

test("F-R1: the Aid Die survives the recipient's turn start and combat end, inside and outside combat", async () => {
  const actor = supporter({ level: 5, extraItems: [provideAidItem()] });
  const ally = creature("Ally");
  const combat = createTestCombat([actor, ally]);
  combat.start();
  game.combat = combat;
  await supporterUses.execute(actor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 30 }, "r1-pa-combat");

  await emitAk5eEvent("turnStart", { actorUuid: ally.uuid });
  combat.nextTurn();
  await expireFeatureTags({ kind: "combatTurn", combat });
  assert.ok(findAidDieEffect(ally), "not expired at the recipient's or any next turn start");
  await expireFeatureTags({ kind: "combatEnd", combat });
  assert.ok(findAidDieEffect(ally), "not expired at combat end: it lasts 600 s of world time");

  game.combat = null;
  await expireFeatureTags({ kind: "time", worldTime: 1600 });
  assert.equal(findAidDieEffect(ally), null, "expires on the 600 s clock after combat");
});

test("F-R1: outside combat the Aid Die is not converted to manual and still runs its 600 s clock", async () => {
  const actor = supporter({ level: 5, extraItems: [provideAidItem()] });
  const ally = creature("Ally");
  game.combat = null;
  await supporterUses.execute(actor, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 30 }, "r1-pa-nocombat");
  const tag = supporterUses.receipt(actor, "r1-pa-nocombat").targets[0].tag;
  assert.notEqual(tag.trigger, "manual", "the Aid Die is not left for manual removal");
  await expireFeatureTags({ kind: "time", worldTime: 1600 });
  assert.equal(findAidDieEffect(ally), null);
});

test("F-R1: Lighten the Load supplementary die records a 600-second time trigger and is undoable", async () => {
  const actor = supporter({ level: 11 });
  const triggerAlly = creature("Trigger");
  const bonus = creature("Bonus");
  await supporterUses.execute(actor, "lightenTheLoad", {
    targetUuid: bonus.uuid, targetName: bonus.name, triggerUuid: triggerAlly.uuid, distance: 20
  }, "r1-lighten");
  const tag = supporterUses.receipt(actor, "r1-lighten").targets[0].tag;
  assert.equal(tag.trigger, "time");
  assert.equal(tag.seconds, 600);
  assert.ok(findAidDieEffect(bonus), "the supplementary die is granted");
  await expireFeatureTags({ kind: "time", worldTime: 1599 });
  assert.ok(findAidDieEffect(bonus), "still present at 599 s");
  await expireFeatureTags({ kind: "time", worldTime: 1600 });
  assert.equal(findAidDieEffect(bonus), null, "expired at 600 s");
});

/* ==========================================================================
   F-R3 Aid card riders: Temp HP, crit, second roll, nothing rolls without a click
   ========================================================================== */

test("F-R3: nothing rolls on use or on render; only a Roll click evaluates the Aid Die", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "skill" }, "r1-no-roll");
  const buttons = renderCard(actor, "r1-no-roll");
  assert.equal(rolls, 0, "posting the use and rendering the card roll nothing");
  await press(rollButton(buttons));
  assert.equal(rolls, 1, "the Roll click evaluates the Aid Die once");
});

test("F-R3 Temp HP: the rider always asks first, even with no warnings", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "save" }, "r1-temp-ask");
  const buttons = renderCard(actor, "r1-temp-ask");
  await press(rollButton(buttons));
  const before = dialogs.length;
  answers.push("cancel");
  await press(riderButton(buttons, "tempHP"));
  assert.ok(dialogs.length > before, "a confirm dialog is shown for Temp HP even though nothing is flagged");
});

test("F-R3 Temp HP: Cancel writes no Temp HP and records no use", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "save" }, "r1-temp-cancel");
  const buttons = renderCard(actor, "r1-temp-cancel");
  await press(rollButton(buttons));
  answers.push("cancel");
  await press(riderButton(buttons, "tempHP"));
  assert.equal(actor.system.attributes.hp.temp ?? 0, 0, "Cancel leaves Temp HP unchanged");
  assert.equal(lastReceiptFor(actor, "aidTempHP"), null, "Cancel records no temp HP use");
});

test("F-R3 Temp HP (H5): Confirm then Cancel at the second step writes nothing", async () => {
  // Head ruling H5: Temp HP may open a confirm and then a warnings dialog. If a second dialog appears, Cancel there
  // must change nothing. If the implementation shows only one dialog, that single Confirm is the whole use.
  const actor = supporter({ level: 5 });
  actor.system.attributes.hp.temp = 2;
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "save" }, "r1-temp-h5");
  const buttons = renderCard(actor, "r1-temp-h5");
  await press(rollButton(buttons));
  const rolled = Number(supporterUses.receipt(actor, "r1-temp-h5").roll);
  // The Roll button's own confirm is not the Temp HP rider's dialog: count only the rider's dialogs.
  dialogs.length = 0;
  answers.push("confirm", "cancel");
  await press(riderButton(buttons, "tempHP"));
  assert.ok(dialogs.length >= 1, "the rider asks for confirmation before writing (F-R3)");
  if (dialogs.length >= 2) {
    assert.equal(actor.system.attributes.hp.temp, 2, "Cancel at the second step writes no Temp HP");
    assert.equal(lastReceiptFor(actor, "aidTempHP"), null, "Cancel at the second step records no use");
  } else {
    assert.equal(actor.system.attributes.hp.temp, rolled + pbForLevel(5), "one dialog only: the Confirm is the whole use");
  }
});

test("F-R3 crit (H5): Confirm then Cancel at the second step registers nothing", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "attack" }, "r1-crit-h5");
  const buttons = renderCard(actor, "r1-crit-h5");
  answers.push("confirm", "cancel");
  await press(riderButton(buttons, "crit"));
  assert.ok(dialogs.length >= 1, "the crit rider asks for confirmation before registering (F-R3)");
  if (dialogs.length >= 2) {
    assert.equal(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-h5"], undefined, "Cancel at the second step registers no rider");
  } else {
    assert.ok(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-h5"], "one dialog only: the Confirm is the whole use");
  }
});

test("F-R3 crit: undoing the parent Aid use also removes the crit rider registered from its card and restores the die", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "attack" }, "r1-crit-parent");
  assert.equal(findAidDieEffect(actor), null, "the die is expended");
  const buttons = renderCard(actor, "r1-crit-parent");
  answers.push("confirm");
  await press(riderButton(buttons, "crit"));
  assert.ok(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-parent"], "the rider is registered from the card");
  await supporterUses.undo(actor, "r1-crit-parent");
  assert.equal(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-parent"], undefined, "undoing the parent removes the child rider");
  assert.ok(findAidDieEffect(actor), "undoing the parent restores the Aid Die");
});

test("F-R3 Temp HP: Confirm writes roll + PB as Temp HP through an undoable receipt, and undo restores the prior value", async () => {
  const actor = supporter({ level: 5 });
  actor.system.attributes.hp.temp = 2;
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "save" }, "r1-temp-confirm");
  const buttons = renderCard(actor, "r1-temp-confirm");
  await press(rollButton(buttons));
  const rolled = Number(supporterUses.receipt(actor, "r1-temp-confirm").roll);
  answers.push("confirm");
  await press(riderButton(buttons, "tempHP"));
  const expected = rolled + pbForLevel(5);
  assert.equal(actor.system.attributes.hp.temp, expected, "Temp HP is the roll plus Proficiency Bonus");
  const receipt = lastReceiptFor(actor, "aidTempHP");
  assert.ok(receipt, "the Temp HP write is a receipt in the undo list");
  await supporterUses.undo(actor, receipt.id);
  assert.equal(actor.system.attributes.hp.temp, 2, "undo restores the previous Temp HP");
});

test("F-R3 Crit rider: a click asks for confirmation; Cancel registers nothing", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "attack" }, "r1-crit-cancel");
  const buttons = renderCard(actor, "r1-crit-cancel");
  const before = dialogs.length;
  answers.push("cancel");
  await press(riderButton(buttons, "crit"));
  assert.ok(dialogs.length > before, "the crit rider asks first");
  assert.equal(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-cancel"], undefined, "Cancel registers no crit rider");
});

test("F-R3 Crit rider: Confirm registers the one-shot rider, and undoing the Aid use removes it", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "attack" }, "r1-crit-ok");
  const buttons = renderCard(actor, "r1-crit-ok");
  answers.push("confirm");
  await press(riderButton(buttons, "crit"));
  assert.ok(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-ok"], "Confirm registers the crit rider");
  await supporterUses.undo(actor, "r1-crit-ok");
  assert.equal(actor.flags.ak5e.triggerRiders?.["aidcrit-r1-crit-ok"], undefined, "undo removes the rider");
});

test("F-R3 Crit rider: after the Aid use was undone the click warns (not a hard block) and can still be confirmed", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "attack" }, "r1-crit-undone");
  const buttons = renderCard(actor, "r1-crit-undone");
  await supporterUses.undo(actor, "r1-crit-undone");
  answers.push("confirm");
  const before = dialogs.length;
  await press(riderButton(buttons, "crit"));
  const warned = dialogs.slice(before).map(entry => `${entry.title}\n${entry.content}`).join("\n");
  assert.match(warned, /undo/i, "a warning says the Aid use was undone");
  assert.equal(notices.length, 0, "no hard error is raised");
});

test("F-R3 second roll: the first click evaluates one roll; a repeat click warns 'already rolled' and rolls only on Confirm", async () => {
  const actor = supporter({ level: 5 });
  await holdAidDie(actor);
  await supporterUses.execute(actor, "useAidDie", { rollType: "skill" }, "r1-second");
  const buttons = renderCard(actor, "r1-second");
  await press(rollButton(buttons));
  const afterAid = rolls;
  const second = riderButton(buttons, "second");
  assert.ok(second, "a skill Aid Die offers the second roll on the card");

  await press(second);
  assert.equal(rolls, afterAid + 1, "the first click evaluates exactly one roll");

  answers.push("cancel");
  const before = dialogs.length;
  await press(second);
  assert.ok(dialogs.length > before, "the repeat click asks first");
  const repeatText = dialogs.slice(before).map(entry => `${entry.title}\n${entry.content}`).join("\n");
  assert.match(repeatText, /already rolled/i, "the repeat click shows an 'already rolled' warning");
  assert.equal(rolls, afterAid + 1, "Cancel on the repeat click does not roll");

  answers.push("confirm");
  await press(second);
  assert.equal(rolls, afterAid + 2, "the user may still confirm the repeat roll");
});

/* ==========================================================================
   F-R4 Recipient chooser offers NPCs, non-character actors and targeted unlinked tokens
   ========================================================================== */

async function recipientOptions(actor) {
  dialogs = [];
  answers.push(null);
  await handleSupporterCommand(actor, "provideAid");
  const prompt = dialogs.find(entry => entry.prompt);
  return prompt?.content ?? "";
}

test("F-R4: the recipient chooser offers NPCs and other non-character actors, not only characters", async () => {
  const actor = supporter({ level: 5 });
  creature("Goblin Scout", { type: "npc" });
  creature("Iron Sentinel", { type: "vehicle" });
  const content = await recipientOptions(actor);
  assert.match(content, />Goblin Scout</, "an NPC is offered");
  assert.match(content, />Iron Sentinel</, "a non-character actor is offered");
});

test("F-R4: the recipient chooser offers the actor of an unlinked targeted token", async () => {
  const actor = supporter({ level: 5 });
  const bandit = createTestActor({ name: "Unlinked Bandit", type: "npc" });
  game.actors.delete(bandit.id);
  game.user.targets = new Set([{ actor: bandit }]);
  const content = await recipientOptions(actor);
  assert.match(content, />Unlinked Bandit</, "the unlinked token's actor is offered");
});

test("F-R4 negatives: the Supporter itself and compendium actors are not offered", async () => {
  const actor = supporter({ level: 5 });
  creature("Packed Hero", { type: "npc" }).pack = "ak5e.packed";
  const content = await recipientOptions(actor);
  assert.doesNotMatch(content, />Supporter L5</, "the Supporter cannot choose itself");
  assert.doesNotMatch(content, />Packed Hero</, "a compendium actor is not a recipient");
});

test("F-R4: a player with only LIMITED permission on an NPC still sees that NPC as a recipient", async () => {
  setupFoundryGlobals({ isGM: false });
  // setupFoundryGlobals replaces globalThis.foundry, so the DialogV2 stub must be installed again for the player.
  stubDialogs();
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  const actor = supporter({ level: 5 });
  const npc = createTestActor({ name: "Limited Npc", type: "npc", owner: false, ownership: { default: 1 } });
  game.actors.set(npc.id, npc);
  const content = await recipientOptions(actor);
  assert.match(content, />Limited Npc</, "LIMITED permission is enough to be a recipient candidate");
});

/* ==========================================================================
   F-R5 Aid ability with no flag: highest of INT / WIS / CHA; tie order cha > wis > int
   ========================================================================== */

test("F-R5: with no aidAbility flag the highest of INT/WIS/CHA modifiers is used and the pool max follows it", async () => {
  const actor = supporter({ level: 5, mods: { int: 1, wis: 4, cha: 2 } });
  assert.equal(aidAbilityKey(actor), "wis", "WIS is the highest modifier");
  assert.equal(aidDieMax(actor), 4);
  assert.equal(getPool(actor, "aidDie").max, 4, "the Aid pool max follows the chosen ability");
});

test("F-R5: ties break cha > wis > int", () => {
  assert.equal(aidAbilityKey(supporter({ mods: { int: 3, wis: 3, cha: 3 } })), "cha", "three-way tie picks CHA");
  assert.equal(aidAbilityKey(supporter({ mods: { int: 3, wis: 3, cha: 1 } })), "wis", "WIS beats INT on a tie");
  assert.equal(aidAbilityKey(supporter({ mods: { int: 3, wis: 1, cha: 3 } })), "cha", "CHA beats INT on a tie");
  assert.equal(aidAbilityKey(supporter({ mods: { int: 4, wis: 1, cha: 1 } })), "int", "INT alone highest");
});

test("F-R5: an explicit aidAbility choice wins over a higher modifier elsewhere", () => {
  const actor = supporter({ mods: { int: 1, wis: 0, cha: 5 }, aidAbility: "int" });
  assert.equal(aidAbilityKey(actor), "int");
  assert.equal(aidDieMax(actor), 1, "the chosen INT modifier, not the CHA modifier");
});

test("F-R5: no floor of 1: a chosen modifier of 0 or less gives 0 dice and warns", () => {
  const zero = supporter({ mods: { int: 0 }, aidAbility: "int" });
  assert.equal(aidDieMax(zero), 0);
  assert.equal(getPool(zero, "aidDie").max, 0);
  const negative = supporter({ mods: { wis: -2 }, aidAbility: "wis" });
  assert.equal(aidDieMax(negative), 0, "a negative chosen modifier gives 0, not 1");
  assert.throws(() => supporterUses.plan(negative, "provideAid", { distance: 10, target: creature("X") }),
    err => err.warnings.some(warning => warning.id === "aidMax"));
});

test("F-R5: with no flag and every modifier negative the highest (least negative) still applies, with 0 dice", () => {
  const actor = supporter({ mods: { int: -1, wis: -2, cha: -3 } });
  assert.equal(aidAbilityKey(actor), "int");
  assert.equal(aidDieMax(actor), 0);
});

/* ==========================================================================
   F-R6 The __progression control shows its choice fields and Cancel changes nothing
   ========================================================================== */

test("F-R5 panel: 'Aid ability not chosen' is shown only while flags.ak5e.supporter.aidAbility is unset", () => {
  const unset = supporter({ level: 5 });
  assert.match(supporterPanelHtml(unset), /Aid ability not chosen/i, "unset flag shows the warning");
  const set = supporter({ level: 5, aidAbility: "cha" });
  assert.doesNotMatch(supporterPanelHtml(set), /Aid ability not chosen/i, "a chosen ability shows no warning");
});

test("F-R6: the progression control shows the aidAbility, branch and talent choice fields", async () => {
  const actor = supporter({ level: 3 });
  answers.push("cancel");
  await handleSupporterCommand(actor, "__progression");
  const text = shownText();
  assert.match(text, /aidAbility/, "the Aid ability field is shown");
  assert.match(text, /branch/i, "the branch field is shown");
  assert.match(text, /talent/i, "the talent field is shown");
});

test("F-R6: Cancel on the progression control changes nothing", async () => {
  const actor = supporter({ level: 3 });
  const before = JSON.stringify(actor.flags.ak5e);
  answers.push(null);
  await handleSupporterCommand(actor, "__progression");
  assert.equal(JSON.stringify(actor.flags.ak5e), before, "no flag is written on Cancel");
});

test("F-R6: an explicit cancel answer from the dialog also changes nothing", async () => {
  const actor = supporter({ level: 3 });
  const before = JSON.stringify(actor.flags.ak5e);
  answers.push("cancel");
  await handleSupporterCommand(actor, "__progression");
  assert.equal(JSON.stringify(actor.flags.ak5e), before);
});

test("F-R6 todo: confirming the control with a chosen aidAbility stores that choice", { todo: "Spec does not name the exact field shape; asserts only that a chosen value is honoured." }, async () => {
  const actor = supporter({ level: 3 });
  answers.push({ action: "confirm", elements: { aidAbility: { value: "int" } } });
  await handleSupporterCommand(actor, "__progression");
  assert.equal(actor.flags.ak5e.supporter.aidAbility, "int");
});

/* ==========================================================================
   F-R7 GM relay hardening: only the recorded Aid Die change is applied
   ========================================================================== */

/**
 * A player (not GM) provides Aid to an unowned creature. The request goes to the relay; the test then
 * optionally tampers with the recorded receipt (the owner can write it), and the GM client handles the request.
 */
async function relayProvideAid(tamper) {
  setupFoundryGlobals({ isGM: false });
  docs = new Map();
  globalThis.fromUuidSync = uuid => docs.get(uuid) ?? null;
  globalThis.fromUuid = async uuid => docs.get(uuid) ?? null;
  game.time = { worldTime: 1000 };
  const gm = game.users.activeGM;
  const player = game.user;
  const source = supporter({ level: 5, extraItems: [provideAidItem()] });
  const ally = creature("Unowned Ally", { owner: false });
  const opId = `relay-${Math.random().toString(36).slice(2, 8)}`;

  const pending = supporterUses.execute(source, "provideAid", { targetUuid: ally.uuid, targetName: ally.name, distance: 10 }, opId)
    .then(value => ({ value }), error => ({ error }));
  let request = null;
  for (let i = 0; i < 2000 && !request; i++) {
    request = game.messages.find(message => message.flags?.ak5e?.[RELAY_REQUEST_FLAG]) ?? null;
    if (!request) await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(request, "the player's change went to the GM relay as a request");

  if (tamper) {
    const state = structuredClone(source.flags.ak5e.supporterUses);
    const entry = state.undo.find(receipt => receipt.id === opId);
    tamper(entry);
    await source.update({ "flags.ak5e.supporterUses": state });
  }

  // The GM client holds ownership of every document, so feature tags can be written there. The player's
  // view (isOwner false) is what made the change relay in the first place.
  game.user = gm;
  ally.isOwner = true;
  try { await supporterUses.handleRelay(request, {}, player.id); }
  finally { game.user = player; ally.isOwner = false; }
  Hooks.call("updateChatMessage", request);
  const outcome = await pending;
  return { outcome, ally };
}

test("F-R7 control: an untampered relayed Provide Aid is applied by the GM client", async () => {
  const { outcome, ally } = await relayProvideAid(null);
  assert.ok(outcome.value, `applied: ${outcome.error?.message ?? ""}`);
  assert.ok(findAidDieEffect(ally), "the recipient holds the Aid Die");
});

test("F-R7: a relayed Aid Die entry carrying a 'changes' key is rejected and creates no effect", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    entry.targets[0].tag.changes = [{ key: "system.attributes.ac.bonus", mode: 2, value: "5" }];
  });
  assert.ok(outcome.error, "the GM client rejects the tampered entry");
  assert.equal(findAidDieEffect(ally), null, "no effect is created on the target");
});

test("F-R7: a relayed Aid Die entry carrying a 'condition' key is rejected and creates no effect", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    entry.targets[0].tag.condition = "always";
  });
  assert.ok(outcome.error);
  // On the base this "rejection" is an internal TypeError from applyFeatureTag, not the relay validation.
  assert.doesNotMatch(outcome.error.message, /Cannot read|undefined|TypeError/, "rejected by validation, not by a crash");
  assert.equal(findAidDieEffect(ally), null);
});

test("F-R7: a relayed Aid Die entry with any unexpected tag key is rejected", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    entry.targets[0].tag.grantsEverything = true;
  });
  assert.ok(outcome.error);
  assert.equal(findAidDieEffect(ally), null);
});

test("F-R7: a relayed Aid Die entry whose dieSize mismatches the receipt is rejected", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    entry.targets[0].tag.data.dieSize = "d12";
  });
  assert.ok(outcome.error);
  assert.equal(findAidDieEffect(ally), null);
});

test("F-R7: a relayed entry carrying standardBenefit is rejected and creates no effect", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    // The relayed change is the target entry (what relayable checks and the effect apply path writes).
    entry.targets[0].standardBenefit = { key: "bonus", value: 99 };
  });
  assert.ok(outcome.error, "standardBenefit is not part of an Aid Die change");
  assert.equal(findAidDieEffect(ally), null);
});

test("F-R7: an inflated die that does not match the Supporter's level (1d12 on a level-5 Supporter) is rejected", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    // Consistent inside the receipt (result and tag agree), so only the level check can catch it: L5 grants a d8.
    entry.result.dieSize = "d12";
    entry.targets[0].tag.data.dieSize = "d12";
    entry.targets[0].meta.dieSize = "d12";
  });
  assert.ok(outcome.error, "the die size must match the giver's level");
  assert.equal(findAidDieEffect(ally), null);
});

test("F-R7: tag.data.supporterUuid naming a different actor is rejected", async () => {
  const { outcome, ally } = await relayProvideAid(entry => {
    entry.targets[0].tag.data.supporterUuid = "Actor.someoneElse";
  });
  assert.ok(outcome.error, "the recorded giver must be the source Supporter");
  assert.equal(findAidDieEffect(ally), null);
});

/* ==========================================================================
   F-R8 Arts restore original ids; branch registration is atomic; failing rest hook is handled
   ========================================================================== */

test("F-R8: revertArtItems restores a removed Art with its ORIGINAL id", async () => {
  const actor = createTestActor({ name: "Art Holder", items: [createTestItem({ _id: "art-orig-1", name: "Shielding Art", type: "spell" })] });
  docs.set(actor.uuid, actor);
  const snapshot = { _id: "art-orig-1", name: "Shielding Art", type: "spell", system: {} };
  const applied = await writeArtItems(actor, { removeIds: ["art-orig-1"], snapshots: [snapshot] });
  assert.equal(actor.items.get("art-orig-1"), undefined, "the Art is removed");
  await revertArtItems(actor, applied);
  assert.ok(actor.items.get("art-orig-1"), "undo puts it back under the same id");
  assert.equal(actor.items.get("art-orig-1").name, "Shielding Art");
});

test("F-R8: a branch module with a colliding plan name throws and leaves no SUPPORTER_BRANCH_MODULES entry", () => {
  const branch = "r1collide";
  assert.equal(SUPPORTER_BRANCH_MODULES.has(branch), false);
  assert.throws(() => registerSupporterBranchModule({ id: "r1-collide", branch, plans: { provideAid: () => ({}) } }),
    /already registered/);
  assert.equal(SUPPORTER_BRANCH_MODULES.has(branch), false, "a failed registration leaves no entry");
  assert.doesNotThrow(() => registerSupporterBranchModule({ id: "r1-collide", branch, plans: { r1UniquePlanName: () => ({}) } }),
    "the key is free for a valid registration after the failure");
  assert.equal(SUPPORTER_BRANCH_MODULES.has(branch), true);
});

test("F-R8: a failing onSupporterRest does not produce an unhandled rejection", async () => {
  const features = await import("../scripts/supporter-features.mjs?r1-rest-hook=1");
  const actor = supporter({ level: 15 });
  await actor.update({ "flags.ak5e.resourcePools.aidDie.value": 0 });
  let attempts = 0;
  actor.update = async () => { attempts += 1; throw new Error("database write refused"); };
  const unhandled = [];
  const listener = reason => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    features.registerSupporterHooks();
    await Hooks.callAll("dnd5e.restCompleted", actor, { dh: 0, hp: 0 }, { type: "short" });
    await new Promise(resolve => setTimeout(resolve, 25));
  } finally {
    process.off("unhandledRejection", listener);
  }
  assert.ok(attempts > 0, "the failing write was actually attempted");
  assert.deepEqual(unhandled, [], "the failure is handled, not left as an unhandled rejection");
});
