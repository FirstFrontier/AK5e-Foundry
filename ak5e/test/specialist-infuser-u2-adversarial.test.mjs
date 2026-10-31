/**
 * U2 challenger suite: Specialist base class and Infuser subclass (bugs B-303..B-307).
 *
 * Expectations come from the source text (AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt, Specialist
 * L5161-5493 and Infuser L5684-5822; Martial DC in 01_chapter_1_changing_the_game.txt L211-212), the bug files and
 * the U2 spec. Each test cites its source line. Red tests are expected and must not be weakened to match behaviour.
 *
 * Harness notes: plans run through specialistUses.command(...) (the play-uses engine, as guard-branch-adversarial does).
 * Native saves are emulated against specialistUses.handleSaveMessage (play-uses.mjs nativeSaveOutcome). Dialogs use the
 * DialogV2 emulation from play-uses-cancel.test.mjs, where a button without a callback resolves to its action name.
 * Turn events go through handleCombatTurnChange (the combatTurnChange adapter in trigger-events.mjs).
 * Targets are either player-owned (direct writes; B-303, B-304, B-306 and the sheet tests use these, so they do not depend
 * on the relay) or unowned (writes go through the GM relay; only the B-305 section uses unowned targets).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat
} from "./base-classes-fixture.mjs";
import { specialistUses } from "../scripts/specialist-uses.mjs";
// Namespace import: F13 asks that the invented specialistDC export is removed, so a named import would fail the whole file.
import * as specialistRules from "../scripts/specialist-rules.mjs";
const { SPECIALIST_CLASS_ID, martialDC } = specialistRules;
import {
  INFUSER_SUBCLASS_ID, calculateInfuserDC, calculateInfusionRange, getActiveInfusion,
  registerInfuserHooks, defineInfuserPools
} from "../scripts/infuser-features.mjs";
import { registerSpecialistHooks } from "../scripts/specialist-features.mjs";
import { getPool, clearPoolRegistry } from "../scripts/resource-pools.mjs";
import { handleCombatTurnChange } from "../scripts/trigger-events.mjs";
import { isPlayWarnings } from "../scripts/play-undo.mjs";
import { previewSpecialistProgression, applySpecialistProgression } from "../scripts/specialist-progression.mjs";

// play-uses-sheet.mjs reads foundry globals at import time, so load it after the globals exist (as play-uses-cancel does).
setupFoundryGlobals();
const { confirmPlayUse } = await import("../scripts/play-uses-sheet.mjs");
const { handleSpecialistCommand } = await import("../scripts/specialist-sheet.mjs");

const SOURCE_PATH = new URL("../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt", import.meta.url);

const GM = { id: "gm", name: "GM", isGM: true, targets: new Set() };
const PLAYER = { id: "player", name: "Player", isGM: false, targets: new Set() };
const RIVAL = { id: "rival", name: "Rival", isGM: false, targets: new Set() };
const ALLY_OWNER = { id: "ally-owner", name: "Ally Owner", isGM: false, targets: new Set() };

const INFUSION_IDS = [
  "adrenalineTrigger", "flightReflexStimulant", "focusHeightener", "hesitationSuppressor",
  "muscleStrengthener", "procoagulant", "respirationStimulant", "sensationNulling"
];
// Source L5732-5743: Double-Blind Trial table. The printed spelling "Neurologicial" is matched tolerantly.
const DOUBLE_BLIND_ROWS = {
  1: /Neurolog\w*\s+Inhibitor/i, 2: /^Necrotoxin$/i, 3: /^Haemotoxin$/i,
  4: /^Cytotoxin$/i, 5: /^Neurotoxin$/i, 6: /^Bungarotoxin$/i
};

let docs;
let answers = [];
let dialogsShown = [];
let rollQueue = [];
let rollFormulas = [];

/* ============================================================================
 * Dialog emulation (DialogV2: `(await callback()) ?? action`)
 * ============================================================================ */
async function runDialog(buttons, options) {
  const title = options.window?.title ?? "";
  dialogsShown.push(title);
  const next = answers.shift();
  if (!next) throw new Error(`Unexpected dialog: "${title}"`);
  if (next.click === null) return null; // X close resolves null.
  const button = next.click === "primary"
    ? buttons.find(candidate => !["cancel", "close"].includes(candidate.action))
    : buttons.find(candidate => candidate.action === next.click);
  if (!button) throw new Error(`No "${next.click}" button in "${title}"`);
  return (await button.callback?.(null, { form: { elements: {} } }, null)) ?? button.action;
}

function installDialogEmulator() {
  globalThis.foundry.applications = { api: { DialogV2: {
    wait: async options => runDialog(options.buttons, options),
    prompt: async options => runDialog([{ action: "ok", ...options.ok }], options),
    confirm: async options => runDialog([{ action: "yes", callback: () => true }, { action: "no", callback: () => false }], options)
  } } };
}

/* ============================================================================
 * Fixtures
 * ============================================================================ */
function setGlobals({ activeGM = GM } = {}) {
  const context = setupFoundryGlobals({
    user: PLAYER, gmUser: GM, playerUser: PLAYER, users: [RIVAL, ALLY_OWNER], activeGM, worldTime: 100,
    rollEvaluator: formula => {
      rollFormulas.push(formula);
      return rollQueue.length ? rollQueue.shift() : 4;
    }
  });
  docs = context.docs;
  installDialogEmulator();
  defineInfuserPools();
  registerInfuserHooks();
  registerSpecialistHooks();
}

function register(document) {
  docs.set(document.uuid, document);
  return document;
}

function addItem(actor, item) {
  if (actor.items?.set) actor.items.set(item.id, item);
  else if (Array.isArray(actor.items)) actor.items.push(item);
  return item;
}

/** A Specialist with the Infusion branch, owned by the player. Source L5161-5493 (class), L5684+ (Infuser). */
function makeInfuser({ level = 5, intMod = 3, prowess, infusions, flags = {} } = {}) {
  const prof = Math.floor((level - 1) / 4) + 2; // Source Specialist proficiency table, L5199-5220.
  const classItem = createTestItem({
    name: "Specialist", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } }
  });
  const subclass = createTestItem({ name: "Infuser", type: "subclass", flags: { ak5e: { chapterThreeId: INFUSER_SUBCLASS_ID } } });
  const actor = createTestActor({
    name: "Infuser Specialist",
    items: [classItem, subclass],
    system: {
      attributes: { prof, movement: { walk: 30 } },
      abilities: {
        str: { mod: 0, value: 10 }, dex: { mod: 2, value: 14 }, con: { mod: 2, value: 14 },
        int: { mod: intMod, value: 10 + intMod * 2 }, wis: { mod: 1, value: 12 }, cha: { mod: 0, value: 10 }
      }
    },
    flags: {
      ak5e: {
        specialist: { enabled: true, branch: "infusion", ...(flags.specialist ?? {}) },
        specialistProgression: { level, branch: "infusion" },
        resourcePools: {
          prowess: { value: prowess ?? prof, max: prof },
          alchemicalInfusions: { value: infusions ?? 2 * prof, max: 2 * prof },
          toDefyScience: { value: 1, max: 1 }
        },
        infuser: { activeInfusions: {} },
        ...(flags.ak5e ?? {})
      }
    }
  });
  register(actor);
  return actor;
}

/**
 * A creature. `owned: true` makes the player its owner (direct writes allowed). Otherwise `ownerId` names another
 * user who owns it (writes relay through the GM), or nobody owns it (unowned target).
 * Statuses follow Foundry V13 (actor.statuses as a Set).
 */
function makeCreature(name, { owned = false, ownerId = null, hp = 25, statuses = [], str = 2, dex = 1, con = 2 } = {}) {
  const actor = createTestActor({
    name,
    system: {
      attributes: { hp: { value: hp, max: 30, temp: 0 }, hd: { denom: "d8" }, movement: { walk: 30 }, prof: 2 },
      abilities: {
        str: { mod: str, value: 10 + str * 2 }, dex: { mod: dex, value: 10 + dex * 2 }, con: { mod: con, value: 10 + con * 2 },
        int: { mod: 0, value: 10 }, wis: { mod: 0, value: 10 }, cha: { mod: 0, value: 10 }
      },
      details: { type: { value: "humanoid" } }
    }
  });
  actor.isOwner = owned;
  actor.testUserPermission = (user, permission = "OWNER") => Boolean(user?.isGM)
    || (owned && user?.id === PLAYER.id && permission === "OWNER")
    || (Boolean(ownerId) && user?.id === ownerId && permission === "OWNER");
  actor.statuses = new Set(statuses);
  actor.toggleStatusEffect = async function (statusId, { active } = {}) {
    const on = active === undefined ? !this.statuses.has(statusId) : active;
    if (on) this.statuses.add(statusId); else this.statuses.delete(statusId);
  };
  register(actor);
  return actor;
}

const playerOwns = target => target.isOwner === true;

/** A native chat save from the target's owner. play-uses.mjs nativeSaveOutcome reads these exact fields. */
function nativeSave({ infuser, target, useId, saveId, total, userId = "player", ability = "con", speakerId = target.id, uuid }) {
  const id = uuid ?? `ChatMessage.save-${useId}-${total}-${userId}-${ability}-${speakerId}`;
  return register({
    documentName: "ChatMessage", id: id.replace("ChatMessage.", ""), uuid: id,
    author: { id: userId, isGM: false },
    speaker: { actor: speakerId },
    rolls: [{ total }],
    flags: {
      dnd5e: { roll: { type: "save", ability } },
      ak5e: { playSave: { ns: "specialistUses", sourceUuid: infuser.uuid, useId, targetUuid: target.uuid, saveId } }
    }
  });
}

/** The save bridge runs on the active GM client (play-uses.mjs handleSaveMessage gate). */
async function resolveSave(message, userId = message.author.id) {
  const previous = game.user;
  game.user = GM;
  try {
    return await specialistUses.handleSaveMessage(message, {}, userId);
  } finally {
    game.user = previous;
  }
}

async function attempt(promise) {
  try { return { value: await promise, error: null }; } catch (error) { return { value: undefined, error }; }
}

const receipt = (actor, useId) => specialistUses.receipt(actor, useId);
const toxinOf = (actor, useId) => {
  const entry = receipt(actor, useId);
  return entry?.result?.toxinName ?? entry?.result?.toxin ?? entry?.toxin ?? actor.flags?.ak5e?.appliedToxin?.name ?? null;
};
const poolValue = (actor, pool) => getPool(actor, pool).value;
const snapshot = actor => JSON.stringify({
  items: Array.from(actor.items?.values?.() ?? actor.items ?? []).map(item => ({ name: item.name, type: item.type, levels: item.system?.levels })),
  hp: actor.system?.attributes?.hp, abilities: actor.system?.abilities, flags: actor.flags, statuses: [...(actor.statuses ?? [])],
  effects: Array.from(actor.effects?.values?.() ?? [], effect => effect.name ?? effect.id)
});
const writesOf = actor => (actor.writes ?? []).length;

/** Drive a turn change through the combatTurnChange adapter (GM client only, as trigger-events.mjs requires). */
async function turnChange(combat, from, to) {
  const previous = { round: from.round, turn: from.turn, combatantId: combat.turns[from.turn].id };
  const current = { round: to.round, turn: to.turn, combatantId: combat.turns[to.turn].id };
  const before = game.user;
  game.user = GM;
  try { await handleCombatTurnChange(combat, previous, current); } finally { game.user = before; }
}

/** Apply an Infusion as the Infuser's owner. Source L5697: Bonus Action, willing creature within 5 ft, 1 minute. */
async function applyInfusion(infuser, target, infusionType = "respirationStimulant", { distance = 5, opId = `apply-${target.id}` } = {}) {
  return specialistUses.command(infuser, "applyInfusion", {
    confirmed: true, targetUuid: target.uuid, targetName: target.name, infusionType, distance
  }, opId);
}

/** Apply an Infusion and, for a target the player does not own, let the GM relay apply the recorded change. */
async function infuseTarget(infuser, target, infusionType = "respirationStimulant", opId = `apply-${target.id}`) {
  await applyInfusion(infuser, target, infusionType, { opId });
  if (!playerOwns(target)) await specialistUses.relayedTargetChange(infuser, "apply", { useId: opId, targetUuid: target.uuid }, GM);
  return opId;
}

async function leverage(infuser, target, opId, extra = {}) {
  return specialistUses.command(infuser, "leverageInfusion", {
    confirmed: true, targetUuid: target.uuid, targetName: target.name, ...extra
  }, opId);
}

/** Start a Leverage use; it must wait for the recipient's native save. */
async function startLeverage(infuser, target, opId, extra = {}) {
  await leverage(infuser, target, opId, extra);
  const entry = receipt(infuser, opId);
  assert.ok(entry?.saves?.[0], "B-303 L5699: Leverage must open a native Constitution save for the recipient; none was requested");
  return { entry, save: entry.saves[0] };
}

/** Leverage the recipient, then resolve its native CON save with the given total. */
async function leverageWithNativeSave(infuser, target, { total, opId, userId = "player", ability = "con", speakerId }) {
  const { save } = await startLeverage(infuser, target, opId);
  const message = nativeSave({ infuser, target, useId: opId, saveId: save.id, total, userId, ability, speakerId });
  await resolveSave(message, userId);
  return message;
}

function makeTestWeapon(actor) {
  return addItem(actor, createTestItem({ name: "Combat Knife", type: "weapon", system: { equipped: true, quantity: 1 } }));
}

test.beforeEach(() => {
  rollQueue = [];
  rollFormulas = [];
  answers = [];
  dialogsShown = [];
  setGlobals();
});

test.afterEach(() => {
  teardownFoundryGlobals();
  clearPoolRegistry();
});

/* ============================================================================
 * 1. Leverage (B-303). Source L5699: Constitution save against the Infuser DC; failure adds Dazed until the
 *    beginning of the recipient's next Turn and blocks Leverage while Dazed; an Infusion is not consumed.
 *    Infuser DC L5689: 20 - Intelligence modifier - Proficiency Bonus.
 * ============================================================================ */

test("B-303 L5699: a supplied saveFailed:true never decides the Leverage outcome", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-forged-fail");
  await attempt(leverage(infuser, target, "lev-forged-fail", { saveFailed: true }));
  assert.equal(receipt(infuser, "lev-forged-fail")?.status, "awaitingSave", "L5699 the recipient must make its own save");
  assert.equal(target.statuses.has("dazed"), false, "no Dazed is applied from a supplied flag");
});

test("B-303 L5699: a supplied saveSuccess:true never resolves the Leverage use", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-forged-success");
  await attempt(leverage(infuser, target, "lev-forged-success", { saveSuccess: true, saveFailed: false }));
  assert.equal(receipt(infuser, "lev-forged-success")?.status, "awaitingSave");
  assert.equal(receipt(infuser, "lev-forged-success")?.saves?.[0]?.resolved, undefined, "no save is marked resolved");
});

test("L5689: the Infuser DC is 20 - INT - PB (Lv 5, INT +3, PB 3 gives 14)", () => {
  // Pure formula check (DECISIONS L482 is UNRESOLVED; the printed subtraction is the default in infuser-features.mjs L155-170).
  assert.equal(calculateInfuserDC(makeInfuser({ level: 5, intMod: 3 })), 14);
});

test("B-303 L5689,L5699: Leverage asks for a Constitution save against Infuser DC 20 - INT - PB", async () => {
  // Lv5 (PB 3), INT +3: DC = 20 - 3 - 3 = 14. L5689 prints the subtraction literally (DECISIONS.md L482 is UNRESOLVED).
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  assert.equal(calculateInfuserDC(infuser), 14, "L5689 Infuser DC formula");
  await infuseTarget(infuser, target, "respirationStimulant", "apply-dc");
  const { save } = await startLeverage(infuser, target, "lev-dc");
  assert.equal(save?.ability, "con", "L5699 Constitution Saving Throw");
  assert.equal(save?.dc, 14, "L5699 against the Infuser DC");
});

test("B-303 L5699: a native CON save below the Infuser DC applies Dazed and keeps the benefit", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-fail");
  await leverageWithNativeSave(infuser, target, { total: 9, opId: "lev-fail" });
  assert.equal(receipt(infuser, "lev-fail").status, "complete", "a resolved save completes the use");
  assert.equal(target.statuses.has("dazed"), true, "L5699 failed save: Dazed");
  assert.ok(getActiveInfusion(target), "L5699 the benefit still applies on a failed save");
});

test("B-303 L5699: a native CON save at the Infuser DC succeeds, grants the benefit and applies no Dazed", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-success");
  await leverageWithNativeSave(infuser, target, { total: 14, opId: "lev-success" });
  assert.equal(receipt(infuser, "lev-success").status, "complete");
  assert.equal(target.statuses.has("dazed"), false, "L5699 successful save: no Dazed");
  assert.ok(receipt(infuser, "lev-success").result, "the benefit result is recorded");
});

test("B-303 L5699: a native save from a user who is not the target's owner is ignored", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-rival");
  const { save } = await startLeverage(infuser, target, "lev-rival");
  const message = nativeSave({ infuser, target, useId: "lev-rival", saveId: save.id, total: 2, userId: "rival" });
  await attempt(resolveSave(message, "rival"));
  assert.equal(receipt(infuser, "lev-rival").status, "awaitingSave", "only the recipient's own save counts");
  assert.equal(target.statuses.has("dazed"), false);
});

test("B-303 L5699: a native save for the wrong ability (DEX) is ignored", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-dex");
  const { save } = await startLeverage(infuser, target, "lev-dex");
  const message = nativeSave({ infuser, target, useId: "lev-dex", saveId: save.id, total: 2, ability: "dex" });
  await attempt(resolveSave(message));
  assert.equal(receipt(infuser, "lev-dex").status, "awaitingSave", "L5699 requires a Constitution save");
  assert.equal(target.statuses.has("dazed"), false);
});

test("B-303 L5699: a native save whose speaker is a different actor is ignored", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-speaker");
  const { save } = await startLeverage(infuser, target, "lev-wrong-actor");
  const message = nativeSave({ infuser, target, useId: "lev-wrong-actor", saveId: save.id, total: 2, speakerId: "someone-else" });
  await attempt(resolveSave(message));
  assert.equal(receipt(infuser, "lev-wrong-actor").status, "awaitingSave", "a save made by another actor does not resolve this Leverage");
  assert.equal(target.statuses.has("dazed"), false);
});

test("B-303 L5699: a duplicate or forged second native save does not flip a resolved outcome", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-dup");
  const { save } = await startLeverage(infuser, target, "lev-dup");
  await resolveSave(nativeSave({ infuser, target, useId: "lev-dup", saveId: save.id, total: 6, uuid: "ChatMessage.lev-dup-fail" }));
  await attempt(resolveSave(nativeSave({ infuser, target, useId: "lev-dup", saveId: save.id, total: 20, uuid: "ChatMessage.lev-dup-forged" })));
  assert.equal(receipt(infuser, "lev-dup").saves[0].total, 6, "the first resolved total is kept");
  assert.equal(target.statuses.has("dazed"), true, "a later success does not clear the failed-save Dazed");
});

test("B-303 L5699: Leverage while Dazed is a warning that Use anyway overrides, not a block", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true, statuses: ["dazed"] });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-while-dazed");
  const blocked = await attempt(leverage(infuser, target, "lev-dazed-1"));
  assert.ok(isPlayWarnings(blocked.error), "L5699 cannot Leverage while Dazed: a warning is raised");
  assert.ok(blocked.error.warnings.some(warning => /dazed/i.test(`${warning.id} ${warning.text}`)), "the warning names Dazed");
  const overridden = await attempt(leverage(infuser, target, "lev-dazed-2", { overrides: blocked.error.warnings.map(warning => warning.id) }));
  assert.equal(overridden.error, null, "Use anyway proceeds");
  assert.equal(receipt(infuser, "lev-dazed-2")?.status, "awaitingSave");
});

test("B-303 L5699: an Infusion is not consumed when Leveraged", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-consume");
  const before = poolValue(infuser, "alchemicalInfusions");
  await leverageWithNativeSave(infuser, target, { total: 20, opId: "lev-not-consumed" });
  assert.ok(getActiveInfusion(target), "the Infusion stays on the recipient");
  assert.equal(poolValue(infuser, "alchemicalInfusions"), before, "Leverage does not spend an Alchemical Infusion use");
});

test("B-303 WORKFLOW 3.2 #6: undoing a Leverage that still awaits its save leaves no Dazed", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-undo-lev");
  await startLeverage(infuser, target, "lev-undo");
  await specialistUses.command(infuser, "undoUse", { useId: "lev-undo" }, "undo-lev-undo");
  assert.equal(receipt(infuser, "lev-undo")?.status, "undone");
  assert.equal(target.statuses.has("dazed"), false, "undo leaves no Dazed");
});

/* ============================================================================
 * 2. Double-Blind Trial (B-304). Source L5732-5743: Bonus Action, Pharmacology Kit, 1 Prowess + 1 Infusion use, 1d6.
 * ============================================================================ */

function doubleBlindInfuser(prowess = 3, infusions = 6) {
  const infuser = makeInfuser({ level: 5, intMod: 3, prowess, infusions });
  addItem(infuser, createTestItem({ name: "Pharmacology Kit", type: "tool", flags: { ak5e: { chapterFourId: "tool-pharmacology-kit-4" } } }));
  makeTestWeapon(infuser);
  return infuser;
}

test("B-304 L5733-5743: no toxin is chosen or applied before the card's Roll button is clicked", async () => {
  // L5733: "As a Bonus Action ... roll 1d6 and apply the corresponding Toxin". The roll follows the click.
  const infuser = doubleBlindInfuser();
  await specialistUses.command(infuser, "doubleBlindTrial", { confirmed: true, rolledToxin: 4 }, "dbt-pre");
  assert.equal(receipt(infuser, "dbt-pre")?.status, "awaitingRoll", "the card waits for its roll");
  assert.equal(toxinOf(infuser, "dbt-pre"), null, "no toxin is selected before the click");
  assert.equal(infuser.flags.ak5e.appliedToxin, undefined, "no toxin is applied before the click");
  assert.equal(rollFormulas.filter(formula => /d6/.test(formula)).length, 0, "no d6 is rolled before the click");
});

for (const [roll, pattern] of Object.entries(DOUBLE_BLIND_ROWS)) {
  test(`B-304 L5739-5741: a clicked d6 of ${roll} maps to its source table row`, async () => {
    const infuser = doubleBlindInfuser();
    rollQueue.push(Number(roll));
    await specialistUses.command(infuser, "doubleBlindTrial", { confirmed: true }, `dbt-row-${roll}`);
    await specialistUses.command(infuser, "useRoll", { useId: `dbt-row-${roll}` }, `dbt-row-roll-${roll}`);
    assert.match(String(toxinOf(infuser, `dbt-row-${roll}`)), pattern, `d6 ${roll} is the row printed in the source table`);
  });
}

test("B-304 L5733: a supplied rolledToxin or rollResult is ignored when the clicked d6 differs", async () => {
  const infuser = doubleBlindInfuser();
  rollQueue.push(5); // the clicked d6
  await specialistUses.command(infuser, "doubleBlindTrial", { confirmed: true, rolledToxin: 1, rollResult: 1 }, "dbt-forged");
  await specialistUses.command(infuser, "useRoll", { useId: "dbt-forged" }, "dbt-forged-roll");
  assert.match(String(toxinOf(infuser, "dbt-forged")), DOUBLE_BLIND_ROWS[5], "the clicked 5 wins over the supplied 1");
});

test("B-304 WORKFLOW 3.2 #6: repeated Roll clicks do not re-roll or replace the toxin", async () => {
  const infuser = doubleBlindInfuser(3, 6);
  rollQueue.push(3, 6);
  await specialistUses.command(infuser, "doubleBlindTrial", { confirmed: true }, "dbt-double");
  await specialistUses.command(infuser, "useRoll", { useId: "dbt-double" }, "dbt-double-click-1");
  const first = toxinOf(infuser, "dbt-double");
  await attempt(specialistUses.command(infuser, "useRoll", { useId: "dbt-double" }, "dbt-double-click-2"));
  assert.equal(toxinOf(infuser, "dbt-double"), first, "the second click does not replace the toxin");
  assert.equal(rollFormulas.filter(formula => /d6/.test(formula)).length, 1, "the d6 is rolled once");
});

test("B-304 L5733: one use spends exactly 1 Prowess and 1 Alchemical Infusion use across the whole flow", async () => {
  const infuser = doubleBlindInfuser(3, 6);
  rollQueue.push(2);
  await specialistUses.command(infuser, "doubleBlindTrial", { confirmed: true }, "dbt-spend");
  await specialistUses.command(infuser, "useRoll", { useId: "dbt-spend" }, "dbt-spend-roll");
  await attempt(specialistUses.command(infuser, "useRoll", { useId: "dbt-spend" }, "dbt-spend-roll-2"));
  assert.equal(poolValue(infuser, "prowess"), 2, "exactly 1 Prowess spent");
  assert.equal(poolValue(infuser, "alchemicalInfusions"), 5, "exactly 1 Infusion use spent");
});

test("B-304 WORKFLOW 3.2 #6: undo of a completed Double-Blind Trial restores Prowess, Infusion uses and removes the toxin", async () => {
  const infuser = doubleBlindInfuser(3, 6);
  rollQueue.push(1);
  await specialistUses.command(infuser, "doubleBlindTrial", { confirmed: true }, "dbt-undo");
  await specialistUses.command(infuser, "useRoll", { useId: "dbt-undo" }, "dbt-undo-roll");
  await specialistUses.command(infuser, "undoUse", { useId: "dbt-undo" }, "dbt-undo-op");
  assert.equal(poolValue(infuser, "prowess"), 3, "Prowess restored");
  assert.equal(poolValue(infuser, "alchemicalInfusions"), 6, "Infusion use restored");
  assert.equal(toxinOf(infuser, "dbt-undo"), null, "the applied toxin is removed");
});

/* ============================================================================
 * 3. Relay and undo (B-305). WORKFLOW 3.2 #2 (unowned changes relay through the GM) and #6 (undo). Source L5697.
 * ============================================================================ */

test("B-305 WORKFLOW 3.2 #2: a player's infusion on an unowned ally writes nothing to that ally directly", async () => {
  const infuser = makeInfuser({ level: 5 });
  const ally = makeCreature("Unowned Ally");
  const before = snapshot(ally);
  await applyInfusion(infuser, ally, "procoagulant", { opId: "apply-unowned" });
  assert.equal(writesOf(ally), 0, "the player client does not write the unowned ally");
  assert.equal(snapshot(ally), before, "the ally is unchanged until the GM applies the relayed change");
});

test("B-305 WORKFLOW 3.2 #2,#6: the GM-applied relay lands the Infusion and undo restores the ally exactly", async () => {
  const infuser = makeInfuser({ level: 5 });
  const ally = makeCreature("Unowned Ally");
  const pristine = snapshot(ally);
  await applyInfusion(infuser, ally, "procoagulant", { opId: "apply-relay" });
  await specialistUses.relayedTargetChange(infuser, "apply", { useId: "apply-relay", targetUuid: ally.uuid }, GM);
  assert.ok(getActiveInfusion(ally), "the GM-side relay applies the Infusion to the ally");
  game.user = PLAYER;
  await specialistUses.command(infuser, "undoUse", { useId: "apply-relay" }, "undo-relay");
  await attempt(specialistUses.relayedTargetChange(infuser, "revert", { useId: "apply-relay", targetUuid: ally.uuid }, GM));
  assert.equal(snapshot(ally), pristine, "undo restores the ally to its pre-apply state exactly");
});

test("B-305 WORKFLOW 3.2 #2: with no GM connected the relay refuses visibly and writes nothing", async () => {
  setGlobals({ activeGM: null });
  const infuser = makeInfuser({ level: 5 });
  const ally = makeCreature("Unowned Ally");
  const before = snapshot(ally);
  const result = await attempt(applyInfusion(infuser, ally, "procoagulant", { opId: "apply-nogm" }));
  assert.ok(result.error, "the player is told the change could not be applied yet");
  assert.match(String(result.error?.message ?? ""), /GM/i, "the refusal names the missing GM");
  assert.equal(snapshot(ally), before, "nothing is written or silently queued on the ally");
});

test("B-305 WORKFLOW 3.2 #6: a revert aimed at an actor that was not the recorded target is refused", async () => {
  const infuser = makeInfuser({ level: 5 });
  const ally = makeCreature("Unowned Ally");
  const bystander = makeCreature("Bystander");
  await applyInfusion(infuser, ally, "procoagulant", { opId: "apply-refuse" });
  await specialistUses.relayedTargetChange(infuser, "apply", { useId: "apply-refuse", targetUuid: ally.uuid }, GM);
  const bystanderBefore = snapshot(bystander);
  const result = await attempt(specialistUses.relayedTargetChange(infuser, "revert", { useId: "apply-refuse", targetUuid: bystander.uuid }, GM));
  assert.ok(result.error, "the revert is refused");
  assert.equal(snapshot(bystander), bystanderBefore, "the bystander is untouched");
});

test("B-305 WORKFLOW 3.2 #2: a duplicate relayed apply does not double-apply", async () => {
  const infuser = makeInfuser({ level: 5 });
  const ally = makeCreature("Unowned Ally");
  await applyInfusion(infuser, ally, "procoagulant", { opId: "apply-dup-relay" });
  await specialistUses.relayedTargetChange(infuser, "apply", { useId: "apply-dup-relay", targetUuid: ally.uuid }, GM);
  const once = snapshot(ally);
  await attempt(specialistUses.relayedTargetChange(infuser, "apply", { useId: "apply-dup-relay", targetUuid: ally.uuid }, GM));
  assert.equal(snapshot(ally), once, "a duplicate relay request leaves the ally as one application");
});

test("B-305 WORKFLOW 3.2 #6: undo keeps an unrelated condition the GM added after the Infusion", async () => {
  const infuser = makeInfuser({ level: 5 });
  const ally = makeCreature("Unowned Ally");
  await applyInfusion(infuser, ally, "procoagulant", { opId: "apply-keep" });
  await specialistUses.relayedTargetChange(infuser, "apply", { useId: "apply-keep", targetUuid: ally.uuid }, GM);
  await ally.toggleStatusEffect("blinded", { active: true });
  game.user = PLAYER;
  await specialistUses.command(infuser, "undoUse", { useId: "apply-keep" }, "undo-keep");
  await attempt(specialistUses.relayedTargetChange(infuser, "revert", { useId: "apply-keep", targetUuid: ally.uuid }, GM));
  assert.equal(ally.statuses.has("blinded"), true, "the unrelated Blinded condition survives undo");
});

test("B-305 L5768 + WORKFLOW 3.2 #2: To Defy Science on an unowned ally writes nothing from the player client", async () => {
  const infuser = makeInfuser({ level: 20, prowess: 6 });
  const ally = makeCreature("Unowned Ally");
  await specialistUses.command(infuser, "toDefyScience", { confirmed: true, targetUuid: ally.uuid, targetName: ally.name }, "tds-relay");
  assert.equal(writesOf(ally), 0, "the invulnerability change is relayed, not written by the player");
});

/* ============================================================================
 * 4. Expiry (B-306). Source L5697 (Infusion lasts 1 minute), L5699 (Dazed until the recipient's next Turn),
 *    L5768 (To Defy Science: cannot lose HP for the next minute), L5812 (Respiration Stimulant: Speed +10 until the
 *    end of the Turn). Time advances through game.time.worldTime (1 minute = 60 seconds). Turn events go through
 *    handleCombatTurnChange, which emits turnStart/turnEnd from the combatTurnChange adapter.
 * ============================================================================ */

test("B-306 L5697: an Infusion is still active 59 seconds after application and expired at 61 seconds", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  game.time.worldTime = 100;
  await applyInfusion(infuser, target, "respirationStimulant", { opId: "apply-expiry" });
  game.time.worldTime = 159;
  assert.ok(getActiveInfusion(target), "still active inside the minute");
  game.time.worldTime = 161;
  assert.equal(getActiveInfusion(target), null, "expired after one minute");
});

test("B-306 L5697: an expired Infusion can no longer be Leveraged", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  game.time.worldTime = 100;
  await infuseTarget(infuser, target, "respirationStimulant", "apply-expired-lev");
  game.time.worldTime = 161;
  const result = await attempt(leverage(infuser, target, "lev-expired"));
  assert.ok(result.error, "Leverage of an expired Infusion is refused");
  assert.equal(target.statuses.has("dazed"), false);
});

test("B-306 L5768: To Defy Science stops HP loss while active (inside the minute)", async () => {
  const infuser = makeInfuser({ level: 20, prowess: 6 });
  const target = makeCreature("Ally", { owned: true, hp: 25 });
  game.time.worldTime = 100;
  await specialistUses.command(infuser, "toDefyScience", { confirmed: true, targetUuid: target.uuid, targetName: target.name }, "tds-active");
  game.time.worldTime = 150;
  const updates = { "system.attributes.hp.value": 15 }; // 10 damage from 25 HP, as dnd5e computes it before preApplyDamage
  Hooks.call("dnd5e.preApplyDamage", target, 10, updates, {});
  assert.ok(Number(updates["system.attributes.hp.value"] ?? 25) >= 25, "L5768 the creature cannot lose Hit Points");
});

test("B-306 L5768: To Defy Science invulnerability ends after one minute", async () => {
  const infuser = makeInfuser({ level: 20, prowess: 6 });
  const target = makeCreature("Ally", { owned: true, hp: 25 });
  game.time.worldTime = 100;
  await specialistUses.command(infuser, "toDefyScience", { confirmed: true, targetUuid: target.uuid, targetName: target.name }, "tds-expire");
  game.time.worldTime = 161;
  const updates = { "system.attributes.hp.value": 15 };
  Hooks.call("dnd5e.preApplyDamage", target, 10, updates, {});
  assert.equal(updates["system.attributes.hp.value"], 15, "after the minute the damage applies normally");
});

test("B-306 L5699: Dazed from a Leverage failed during the Infuser's Turn is removed at the recipient's next Turn start", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  const combat = createTestCombat([infuser, target], { started: true, round: 1, turn: 0 });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-turn-a");
  await leverageWithNativeSave(infuser, target, { total: 3, opId: "lev-turn-a" });
  assert.equal(target.statuses.has("dazed"), true, "Dazed is applied");
  await turnChange(combat, { round: 1, turn: 0 }, { round: 1, turn: 1 }); // the recipient's next Turn begins
  assert.equal(target.statuses.has("dazed"), false, "L5699 Dazed ends at the beginning of the recipient's next Turn");
});

test("B-306 L5699: Dazed from a Leverage failed during the recipient's own Turn survives the Infuser's Turn and ends at the recipient's following Turn", async () => {
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  const combat = createTestCombat([infuser, target], { started: true, round: 1, turn: 1 });
  await infuseTarget(infuser, target, "respirationStimulant", "apply-turn-b");
  await leverageWithNativeSave(infuser, target, { total: 3, opId: "lev-turn-b" });
  await turnChange(combat, { round: 1, turn: 1 }, { round: 2, turn: 0 }); // the Infuser's Turn begins
  assert.equal(target.statuses.has("dazed"), true, "still Dazed: the recipient's next Turn has not begun");
  await turnChange(combat, { round: 2, turn: 0 }, { round: 2, turn: 1 }); // the recipient's next Turn begins
  assert.equal(target.statuses.has("dazed"), false, "Dazed ends at the recipient's next Turn start");
});

test("B-306 L5699 boundary (Dazed preset as a condition, because B-303 masks the native-save path): Dazed ends at the recipient's next Turn start, not the Infuser's", async () => {
  // The Dazed is set directly, so this checks only the Turn boundary. The two tests above exercise the same boundary
  // through a Leverage, and they are red today for the B-303 reason (no native save is requested).
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true, statuses: ["dazed"] });
  const combat = createTestCombat([infuser, target], { started: true, round: 1, turn: 1 });
  await turnChange(combat, { round: 1, turn: 1 }, { round: 2, turn: 0 }); // the Infuser's Turn begins
  assert.equal(target.statuses.has("dazed"), true, "still Dazed: the recipient's next Turn has not begun");
  await turnChange(combat, { round: 2, turn: 0 }, { round: 2, turn: 1 }); // the recipient's next Turn begins
  assert.equal(target.statuses.has("dazed"), false, "L5699 Dazed ends at the recipient's next Turn start");
});

test("B-306 L5812: Respiration Stimulant's +10 ft Speed is in effect during the Turn and ends with it", async () => {
  // UNCERTAIN: L5812 does not say whose Turn "the end of the Turn" is. This test assumes the recipient's own Turn, as
  // the Infuser's Bonus Action happens during the recipient's Turn here. The head must confirm the boundary.
  // Mechanism: the test reads target.system.attributes.movement.walk, the value a Speed change would show on a fixture.
  // The implementation records receipt.speedBonus = 10 (specialist-uses.mjs L1705-1706) and does not change walk.
  const infuser = makeInfuser({ level: 5, intMod: 3 });
  const target = makeCreature("Recipient", { owned: true });
  const combat = createTestCombat([infuser, target], { started: true, round: 1, turn: 0 });
  await turnChange(combat, { round: 1, turn: 0 }, { round: 1, turn: 1 }); // the recipient's Turn begins
  await infuseTarget(infuser, target, "respirationStimulant", "apply-speed");
  await leverageWithNativeSave(infuser, target, { total: 20, opId: "lev-speed" });
  assert.equal(target.system.attributes.movement.walk, 40, "L5812 Speed is 30 + 10 ft during the Turn");
  await turnChange(combat, { round: 1, turn: 1 }, { round: 2, turn: 0 }); // the recipient's Turn ends
  assert.equal(target.system.attributes.movement.walk, 30, "L5812 the Speed increase ends with the Turn");
});

test("B-306 WORKFLOW 3.2 #6: the expiry deadline is persisted (1 minute from 100 s = 160) so a reload still expires it", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  game.time.worldTime = 100;
  await applyInfusion(infuser, target, "respirationStimulant", { opId: "apply-persist" });
  const persisted = JSON.stringify([infuser.flags, target.flags]);
  assert.match(persisted, /"expiresAt":\s*160\b/, "the expiry evidence is stored in actor flags, not only in memory");
});

/* ============================================================================
 * 5. Sheet (B-307). Source L5697 (5 ft), L5747-5749 (Delivery Service: 30 ft from Level 11), L5782-5822 (eight Infusions).
 * ============================================================================ */

for (const id of INFUSION_IDS) {
  test(`B-307 L5782-5822: the Infusion option "${id}" is selectable and applies`, async () => {
    const infuser = makeInfuser({ level: 5 });
    const target = makeCreature("Recipient", { owned: true });
    const result = await attempt(applyInfusion(infuser, target, id, { opId: `pick-${id}` }));
    assert.equal(result.error, null, `option ${id} is reachable without an unknown-option error`);
    assert.equal(getActiveInfusion(target)?.type, id, "the chosen Infusion is the one recorded");
  });
}

test("B-307 L5697: a target 10 ft away at Level 5 raises a range warning, and Use anyway applies the Infusion", async () => {
  // Source L5697: "within 5 feet". calculateInfusionRange gives 5 ft below Level 11.
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Far Ally", { owned: true });
  assert.equal(calculateInfusionRange(infuser), 5, "range is 5 feet below Level 11");
  const blocked = await attempt(applyInfusion(infuser, target, "procoagulant", { distance: 10, opId: "range-warn" }));
  assert.ok(isPlayWarnings(blocked.error), "warn, never block: a source warning is raised");
  assert.ok(blocked.error.warnings.some(warning => /range/i.test(`${warning.id} ${warning.text}`)), "the warning names range");
  const overridden = await attempt(specialistUses.command(infuser, "applyInfusion", {
    confirmed: true, targetUuid: target.uuid, targetName: target.name, infusionType: "procoagulant", distance: 10,
    overrides: blocked.error.warnings.map(warning => warning.id)
  }, "range-anyway"));
  assert.equal(overridden.error, null, "Use anyway proceeds");
  assert.equal(getActiveInfusion(target)?.type, "procoagulant");
});

test("B-307 L5747-5749: at Level 11 the Infusion range is 30 ft, so a 20 ft target raises no range warning", async () => {
  const infuser = makeInfuser({ level: 11 });
  const target = makeCreature("Far Ally", { owned: true });
  assert.equal(calculateInfusionRange(infuser), 30, "Delivery Service range is 30 feet");
  const result = await attempt(applyInfusion(infuser, target, "procoagulant", { distance: 20, opId: "range-lv11" }));
  assert.equal(result.error, null, "no range warning or block at 20 ft on Level 11");
});

test("B-307 WORKFLOW 3.2 #3: the public card lists an overridden range warning", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Far Ally", { owned: true });
  await attempt(specialistUses.command(infuser, "applyInfusion", {
    confirmed: true, targetUuid: target.uuid, targetName: target.name, infusionType: "procoagulant", distance: 10,
    overrides: ["range"]
  }, "range-public"));
  const cards = Array.from(game.messages ?? []).map(message => String(message.content ?? "")).join("\n");
  const recorded = JSON.stringify(receipt(infuser, "range-public") ?? {});
  assert.match(`${cards}\n${recorded}`, /range/i, "the overridden warning is visible to the whole table");
});

test("B-307 (sheet): Apply Infusion from the sheet submits a chosen Infusion type (option picker), not a silent default", async () => {
  // specialist-sheet.mjs L773-783 sends { confirmed, targetUuid, targetName, ...extra } and no infusionType, so the
  // engine's infusion default is used. The dialog is answered with its primary button and no option is picked.
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  const submitted = [];
  const original = specialistUses.command;
  specialistUses.command = async (actor, name, data, id) => {
    if (name === "applyInfusion") submitted.push(data);
    return original.call(specialistUses, actor, name, data, id);
  };
  answers = [{ click: "primary" }];
  PLAYER.targets.add(target);
  try {
    await attempt(handleSpecialistCommand(infuser, "applyInfusion"));
  } finally {
    specialistUses.command = original;
    PLAYER.targets.clear();
  }
  assert.equal(submitted.length, 1, "the Apply Infusion command reached the engine once");
  assert.ok(submitted[0]?.infusionType, "B-307 the sheet must submit an Infusion the player chose (no option picker today)");
});

test("B-307 WORKFLOW 3.2 #4: Cancel on the Apply Infusion prompt writes nothing", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  const before = snapshot(infuser);
  answers = [{ click: "cancel" }];
  let attempts = 0;
  const result = await confirmPlayUse("Apply Infusion", async extra => {
    attempts += 1;
    return specialistUses.command(infuser, "applyInfusion", { ...extra, targetUuid: target.uuid, targetName: target.name, infusionType: "procoagulant" }, "cancel-apply");
  });
  assert.equal(result, null, "Cancel resolves null");
  assert.equal(attempts, 0, "the use is not attempted after Cancel");
  assert.equal(receipt(infuser, "cancel-apply"), null, "no receipt is written");
  assert.equal(snapshot(infuser), before, "the Infuser is unchanged");
  assert.equal(getActiveInfusion(target), null, "no Infusion is applied");
});

test("B-307 WORKFLOW 3.2 #4: X close on the Apply Infusion prompt writes nothing", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  answers = [{ click: null }];
  const result = await confirmPlayUse("Apply Infusion", extra => specialistUses.command(infuser, "applyInfusion", { ...extra, targetUuid: target.uuid, targetName: target.name, infusionType: "procoagulant" }, "close-apply"));
  assert.equal(result, null);
  assert.equal(receipt(infuser, "close-apply"), null);
  assert.equal(getActiveInfusion(target), null);
});

/* ============================================================================
 * 6. Specialist progression. Source L5309 (ASI at 4th Level: +2 to one, or +1 to two; never above 20),
 *    L5187 (HP: 1d8 or 5, plus CON, per Level after 1st). Choice-field names follow the guard progression test shape.
 * ============================================================================ */

/**
 * A fresh Specialist at 4th Level with nothing granted yet, so the 4th Level ASI and HP grants are pending. A new actor
 * is built for every case: the progression state lives on the actor, so reuse would hide the defect under test.
 * Source L5309 (ASI at 4th Level), L5187 (HP per Level after 1st).
 */
function progressionActor(levels = 4) {
  const actor = createTestActor({
    name: "Progressing Specialist",
    items: [createTestItem({ name: "Specialist", type: "class", system: { levels }, flags: { ak5e: { chapterThreeId: SPECIALIST_CLASS_ID } } })],
    system: {
      attributes: { prof: 2, hp: { value: 20, max: 20, temp: 0 } },
      abilities: { str: { mod: 1, value: 12 }, dex: { mod: 2, value: 14 }, con: { mod: 2, value: 14 }, int: { mod: 0, value: 10 }, wis: { mod: 0, value: 10 }, cha: { mod: 0, value: 10 } }
    }
  });
  register(actor);
  return actor;
}

/**
 * Complete choices for a 4th Level Specialist (specialist-progression.mjs L592-620 requires them all before apply).
 * The first-Level picks (Wis save, three skills, melee Specialisation, Duelling) are needed because a 4th Level actor
 * has none granted yet. Levels 1-3 HP are marked existing, and the starting equipment is marked existing, so the only
 * pending or invalid part of a case is the part under test. Without the first-Level picks, invalid-ASI cases would be
 * refused for missing choices and pass for the wrong reason.
 */
function levelFourChoices({ asi = { 4: { increases: [{ ability: "str", amount: 2 }] } }, roll = 5 } = {}) {
  return {
    branch: INFUSER_SUBCLASS_ID,
    saves: ["wis"],
    skills: ["acr", "slt", "ste"],
    weaponCategory: "melee",
    fightingStyle: "duelling",
    startingEquipment: { mode: "existing" },
    hp: { 1: { mode: "existing" }, 2: { mode: "existing" }, 3: { mode: "existing" }, 4: { mode: "fixed", roll } },
    asi
  };
}

async function applyProgression(actor, choices) {
  const preview = await previewSpecialistProgression(actor, choices);
  return applySpecialistProgression(actor, { confirmed: true, contextKey: preview.contextKey, choices });
}

test("progression L5309,L5187: applying with no choices is refused, and no level, ASI or HP is written", async () => {
  const actor = progressionActor(4);
  const before = snapshot(actor);
  const result = await attempt(applyProgression(actor, {}));
  assert.ok(result.error, "an incomplete progression is refused, not reported as applied");
  assert.equal(snapshot(actor), before, "no state, ASI or HP is written by the refused apply");
  assert.equal(actor.system.abilities.str.value, 12, "STR is untouched");
});

test("progression L5309: a valid 4th Level apply grants STR +2 once, and re-applying identical choices grants nothing more (F8)", async () => {
  const actor = progressionActor(4);
  const first = await attempt(applyProgression(actor, levelFourChoices()));
  assert.equal(first.error, null, "a complete 4th Level choice set applies");
  assert.equal(actor.system.abilities.str.value, 14, "STR 12 + 2 = 14 after the first apply");
  const hpAfterFirst = actor.system.attributes.hp.max;
  const afterFirst = snapshot(actor);
  await attempt(applyProgression(actor, levelFourChoices()));
  assert.equal(actor.system.abilities.str.value, 14, "STR +2 is not granted a second time");
  assert.equal(actor.system.attributes.hp.max, hpAfterFirst, "the HP for 4th Level is not granted a second time");
  assert.equal(snapshot(actor), afterFirst, "re-applying identical choices changes nothing");
});

test("progression L5309: invalid ASI schemes (+3 to one, +2/+2 split, past 20) are rejected and write nothing", async () => {
  const cases = [
    { label: "+3 to one ability", increases: [{ ability: "str", amount: 3 }] },
    { label: "+2 and +2 split across two abilities", increases: [{ ability: "str", amount: 2 }, { ability: "dex", amount: 2 }] },
    { label: "a score above 20", increases: [{ ability: "str", amount: 2 }], strValue: 19 }
  ];
  for (const scheme of cases) {
    const actor = progressionActor(4);
    if (scheme.strValue) actor.system.abilities.str = { mod: 4, value: scheme.strValue };
    const before = snapshot(actor);
    const result = await attempt(applyProgression(actor, levelFourChoices({ asi: { 4: { increases: scheme.increases } } })));
    assert.ok(result.error, `${scheme.label} is rejected`);
    assert.equal(snapshot(actor), before, `${scheme.label} writes nothing`);
  }
});

test("progression L5187: HP rolls of 9 and 0 on a d8 are rejected (not clamped); a roll of 5 is accepted", async () => {
  // L5187: the HP die is a d8, so 1-8 are the only legal results. The engine clamps 9 to 8 and 0 to 1 today (F7).
  for (const roll of [9, 0]) {
    const actor = progressionActor(4);
    const before = snapshot(actor);
    const result = await attempt(applyProgression(actor, levelFourChoices({ roll })));
    assert.ok(result.error, `HP roll ${roll} on a d8 is rejected`);
    assert.equal(snapshot(actor), before, `HP roll ${roll} writes nothing`);
  }
  const valid = progressionActor(4);
  const result = await attempt(applyProgression(valid, levelFourChoices({ roll: 5 })));
  assert.equal(result.error, null, "a roll of 5 on a d8 is valid");
});

/* ============================================================================
 * 7. Martial DC (Ch.1 L211-212: 8 + STR or DEX modifier, the player's choice, + PB). Chapter 3 prints no "Specialist DC".
 * ============================================================================ */

function martialActor() {
  const actor = createTestActor({
    name: "Martial",
    system: {
      attributes: { prof: 3 },
      abilities: { str: { mod: 1, value: 12 }, dex: { mod: 5, value: 20 }, con: { mod: 0, value: 10 }, int: { mod: 0, value: 10 }, wis: { mod: 0, value: 10 }, cha: { mod: 0, value: 10 } }
    }
  });
  // UNCERTAIN: the stored-choice key is not defined for Specialist. This follows guard-rules.mjs L115 (martialDCAbility).
  actor.flags = { ak5e: { specialist: { enabled: true, martialDCAbility: "str" } } };
  register(actor);
  return actor;
}

test("Martial DC Ch.1 L211-212: with STR chosen the DC is 8 + PB + STR (12), not the higher DEX value (16)", () => {
  assert.equal(martialDC(martialActor(), "str"), 12, "8 + PB 3 + STR +1 = 12");
});

test("Martial DC Ch.1 L211-212: with DEX chosen the DC is 8 + PB + DEX (16)", () => {
  assert.equal(martialDC(martialActor(), "dex"), 16, "8 + PB 3 + DEX +5 = 16");
});

test("Martial DC Ch.1 L211-212: with no explicit ability, the saved STR choice is used, not the maximum", () => {
  assert.equal(martialDC(martialActor()), 12, "the saved choice (STR) decides, not max(STR, DEX)");
});

test("Martial DC source: Chapter 3 Specialist text (L5161-5493) prints no separate 'Specialist DC'", () => {
  const lines = readFileSync(SOURCE_PATH, "utf8").split("\n").slice(5160, 5493).join("\n");
  assert.equal(/Specialist DC/.test(lines), false, "the Specialist chapter uses Martial DC only");
});

test("F13 ruling 12: the invented Specialist DC is not exported (it would be a second DC figure that can diverge)", () => {
  assert.equal(specialistRules.specialistDC, undefined, "specialistDC is removed; Martial DC is the only DC for the Specialist");
});

/* ============================================================================
 * 8. Refund Mark of a Specialist. Source L5319: a failed Mark reroll refunds its Prowess.
 *    Prowess maximum = Proficiency Bonus (source L5315-5317).
 * ============================================================================ */

test("Refund Mark L5319: with no spent Mark the refund warns and refunds nothing", async () => {
  const actor = makeInfuser({ level: 5, prowess: 2 });
  const result = await attempt(specialistUses.command(actor, "refundMarkOfASpecialist", { confirmed: true }, "refund-warn"));
  assert.ok(isPlayWarnings(result.error), "a warning is raised when no Mark was spent");
  assert.equal(poolValue(actor, "prowess"), 2, "nothing is refunded before the warning is overridden");
});

test("Refund Mark L5315-5319: Use anyway proceeds and clamps Prowess at its maximum (PB 3), not 4", async () => {
  const actor = makeInfuser({ level: 5, prowess: 3 });
  const first = await attempt(specialistUses.command(actor, "refundMarkOfASpecialist", { confirmed: true }, "refund-first"));
  assert.ok(isPlayWarnings(first.error), "F9: a refund with no spent Mark warns, so there is a warning for the player to override");
  const result = await attempt(specialistUses.command(actor, "refundMarkOfASpecialist", {
    confirmed: true, overrides: first.error.warnings.map(warning => warning.id)
  }, "refund-anyway"));
  assert.equal(result.error, null, "Use anyway proceeds");
  assert.equal(poolValue(actor, "prowess"), 3, "Prowess clamps at its maximum");
});

test("Mark L5319 (F14): the Mark sheet does not pre-select Acrobatics; the player names the proficient Skill they failed", async () => {
  // L5319: "a Skill you are Proficient in". The sheet hard-codes skill "acr" (specialist-sheet.mjs L415-416). The engine is
  // wrapped to capture the data the sheet submits, and the confirm dialog is answered with its primary button.
  const actor = makeInfuser({ level: 5, prowess: 2 });
  const submitted = [];
  const original = specialistUses.command;
  specialistUses.command = async (target, name, data, id) => {
    if (name === "markOfASpecialist") submitted.push(data);
    return original.call(specialistUses, target, name, data, id);
  };
  answers = [{ click: "primary" }];
  try {
    await attempt(handleSpecialistCommand(actor, "markOfASpecialist"));
  } finally {
    specialistUses.command = original;
  }
  assert.equal(submitted.length, 1, "the Mark command reached the engine once");
  assert.notEqual(submitted[0]?.skill, "acr", "L5319 no Acrobatics default is invented");
});

test("Mark L5319: a Mark on a proficient Skill other than Acrobatics is accepted as the chosen Skill", async () => {
  const actor = makeInfuser({ level: 5, prowess: 2 });
  const result = await attempt(specialistUses.command(actor, "markOfASpecialist", { confirmed: true, skill: "ath", skillName: "Athletics" }, "mark-ath"));
  assert.equal(result.error, null, "Athletics (any proficient Skill) can be rerolled");
  assert.equal(receipt(actor, "mark-ath")?.result?.skill, "ath", "the receipt records the Skill the player chose");
});

test("Weapon Mastery L5354: the Melee Weapon Mastery bonus is once per Turn, so a second use in the same Turn is warned", async () => {
  const actor = makeInfuser({ level: 18, flags: { specialist: { weaponCategory: "melee" } } });
  const combat = createTestCombat([actor], { started: true, round: 1, turn: 0 });
  const first = await attempt(specialistUses.command(actor, "weaponMasteryMelee", { confirmed: true }, "wm-turn-1"));
  assert.equal(first.error, null, "the first Melee Weapon Mastery use in the Turn is available");
  const second = await attempt(specialistUses.command(actor, "weaponMasteryMelee", { confirmed: true }, "wm-turn-2"));
  assert.ok(isPlayWarnings(second.error), "a second use in the same Turn raises a warning (warn, never block)");
  assert.ok(second.error.warnings.some(warning => /turn/i.test(`${warning.id} ${warning.text}`)), "the warning names the once-per-Turn limit");
  await turnChange(combat, { round: 1, turn: 0 }, { round: 2, turn: 0 }); // the Specialist's next Turn begins
  const third = await attempt(specialistUses.command(actor, "weaponMasteryMelee", { confirmed: true }, "wm-turn-3"));
  assert.equal(third.error, null, "the bonus is available again on the next Turn");
});

/* ============================================================================
 * 9. Passives. Source L5336-5342 (Weapon Expertise, Melee: Critical Range +1 at Level 12), L5321-5325 (Weapon Adept:
 *    reroll of 1-2 damage dice on Melee is offered, not forced). Dispatched as dnd5e.preRollAttackV2 / preRollDamageV2.
 *    The config shape follows dnd5e 5.x (critical.threshold, rolls[].parts). If the implementation reads a different
 *    shape these fail for interface reasons, and the head must re-check them.
 * ============================================================================ */

function passiveActor(level) {
  return makeInfuser({ level, flags: { specialist: { weaponCategory: "melee", fightingStyle: "duelling" } } });
}

test("Passives L5339: Weapon Expertise (Level 12, Melee) raises Critical Range by 1 (threshold 20 becomes 19)", () => {
  const actor = passiveActor(12);
  const config = { subject: { actor, item: makeTestWeapon(actor) }, critical: { threshold: 20 }, rolls: [{ parts: ["1d8"], options: {} }] };
  Hooks.call("dnd5e.preRollAttackV2", config, {});
  assert.equal(config.critical.threshold, 19, "L5339 Critical Range for Melee Attacks improved by 1");
});

test("Passives L5336: Weapon Expertise does not apply at Level 11 (threshold stays 20)", () => {
  const actor = passiveActor(11);
  const config = { subject: { actor, item: makeTestWeapon(actor) }, critical: { threshold: 20 }, rolls: [{ parts: ["1d8"], options: {} }] };
  Hooks.call("dnd5e.preRollAttackV2", config, {});
  assert.equal(config.critical.threshold, 20, "Weapon Expertise is gated at Level 12");
});

// GUARD: locks in "offered, not forced" (L5324) so that a damage hook cannot auto-roll dice (AGENTS 2). The hook may write
// bookkeeping (infuser-features.mjs writes _ak5eInfuserDamageApplied into options today), which is not a reroll, so only
// the dice formula and the reroll fields are compared.
test("Passives L5324 guard: Weapon Adept (Level 6, Melee) never rerolls damage dice automatically", () => {
  const actor = passiveActor(6);
  const config = { subject: { actor, item: makeTestWeapon(actor) }, critical: { threshold: 20 }, rolls: [{ parts: ["1d8"], options: {} }] };
  Hooks.call("dnd5e.preRollDamageV2", config, {});
  assert.deepEqual(config.rolls[0].parts, ["1d8"], "L5324 the damage dice are not replaced or re-rolled by the hook");
  assert.notEqual(config.rolls[0].options.reroll, true, "L5324 no reroll is forced");
});

/* ============================================================================
 * 10. Cancel and X write nothing; each confirmed use runs exactly once (WORKFLOW 3.2 #4).
 * ============================================================================ */

test("Cancel L5697-5699: Cancel on the Leverage prompt writes nothing", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  await applyInfusion(infuser, target, "respirationStimulant", { opId: "cancel-lev-apply" });
  const before = snapshot(infuser);
  answers = [{ click: "cancel" }];
  const result = await confirmPlayUse("Leverage Infusion", extra => specialistUses.command(infuser, "leverageInfusion", { ...extra, targetUuid: target.uuid, targetName: target.name }, "cancel-lev"));
  assert.equal(result, null);
  assert.equal(receipt(infuser, "cancel-lev"), null, "no Leverage receipt");
  assert.equal(snapshot(infuser), before);
  assert.equal(target.statuses.has("dazed"), false);
});

test("Cancel L5733: X close on the Double-Blind Trial prompt spends nothing and rolls nothing", async () => {
  const infuser = doubleBlindInfuser(3, 6);
  answers = [{ click: null }];
  const result = await confirmPlayUse("Double-Blind Trial", extra => specialistUses.command(infuser, "doubleBlindTrial", { ...extra }, "close-dbt"));
  assert.equal(result, null);
  assert.equal(receipt(infuser, "close-dbt"), null);
  assert.equal(poolValue(infuser, "prowess"), 3, "no Prowess spent");
  assert.equal(poolValue(infuser, "alchemicalInfusions"), 6, "no Infusion use spent");
  assert.equal(rollFormulas.length, 0, "no d6 rolled");
});

test("Cancel L5768: Cancel on the To Defy Science prompt keeps the pool and grants no invulnerability", async () => {
  const infuser = makeInfuser({ level: 20, prowess: 6 });
  const target = makeCreature("Ally", { owned: true, hp: 25 });
  answers = [{ click: "cancel" }];
  await confirmPlayUse("To Defy Science", extra => specialistUses.command(infuser, "toDefyScience", { ...extra, targetUuid: target.uuid, targetName: target.name }, "cancel-tds"));
  assert.equal(poolValue(infuser, "toDefyScience"), 1, "the 1/Long Rest use is not spent");
  assert.equal(receipt(infuser, "cancel-tds"), null);
});

test("Cancel L5319: Cancel on the Refund Mark prompt refunds nothing", async () => {
  const infuser = makeInfuser({ level: 5, prowess: 2 });
  answers = [{ click: "cancel" }];
  const result = await confirmPlayUse("Refund Mark of a Specialist", extra => specialistUses.command(infuser, "refundMarkOfASpecialist", { ...extra }, "cancel-refund"));
  assert.equal(result, null);
  assert.equal(poolValue(infuser, "prowess"), 2, "no Prowess refunded");
});

test("WORKFLOW 3.2 #4: a confirmed Apply Infusion runs exactly once (one dialog, one attempt, one Infusion)", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  answers = [{ click: "primary" }];
  let attempts = 0;
  await confirmPlayUse("Apply Infusion", async extra => {
    attempts += 1;
    return specialistUses.command(infuser, "applyInfusion", { ...extra, targetUuid: target.uuid, targetName: target.name, infusionType: "procoagulant" }, "once-apply");
  });
  assert.equal(dialogsShown.length, 1, "exactly one confirm dialog");
  assert.equal(attempts, 1, "the use runs once");
  assert.equal(getActiveInfusion(target)?.type, "procoagulant");
});

test("WORKFLOW 3.2 #4: a Specialist command without confirmed:true is refused and writes nothing", async () => {
  const infuser = makeInfuser({ level: 5 });
  const target = makeCreature("Recipient", { owned: true });
  const before = snapshot(infuser);
  const result = await attempt(specialistUses.command(infuser, "applyInfusion", { targetUuid: target.uuid, targetName: target.name, infusionType: "procoagulant" }, "unconfirmed-apply"));
  assert.ok(result.error, "an unconfirmed use is refused");
  assert.equal(receipt(infuser, "unconfirmed-apply"), null);
  assert.equal(snapshot(infuser), before);
  assert.equal(getActiveInfusion(target), null);
});
