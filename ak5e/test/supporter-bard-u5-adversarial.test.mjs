/**
 * U5 adversarial challenge suite: Bard subclass bug fixes (challenger, written from source and the head brief).
 *
 * Behavior-level tests. Oracles are the source text (AK5e 1.3.1 Ch.3 Bard, "C3:NNNN" cites the source line; the Bard
 * block is L7099-7211, the Performance Arts table L7168-7211) and the head rulings in ak5e/DECISIONS.md ("Supporter
 * Class and Artificer / Bard / Hexer Branches", items 7 and 10; "Bard missing Arts" row at L508). The implementation
 * is never read for expectations. Where a finding depends on a ruling the brief states, the test names it.
 *
 * Expected RED against the current bard-compose.mjs / bard-perform.mjs (this is a challenge suite, not a green gate):
 *  - Emergency Improv insert before the cursor leaves active.index pointing at an Art already cast.
 *  - Undo of Soul of the Bard does not restore system.skills.prf.value.
 *  - Turn end with no Art cast ends the Performance silently (no confirm, no Cancel, no keep choice).
 *  - Combat end and Long Rest do not end the active Performance (ruling R2).
 *  - Undo of a composition deletes a Performance the Bard is Performing (active left dangling).
 *  - Performance cap is max(1, CHA) (ruling R1 says CHA modifier, no minimum), and CHA 0 gets no cap warning.
 *  - Emergency Improv: the one-minute loss is not applied, and no Aid Die warning is raised when none is left.
 *  - Emergency Improv can insert into an ended Performance without a warning.
 *  - A Performance of one or two Arts starts without the three-Art minimum warning (C3:7104); a Performance of no Arts
 *    must be refused.
 *  - The Turn-end prompt offers no choice that keeps Heroism's Concentration (C3:7107).
 *  - Shatter (5th Level) has manual: false although ruling 7 marks the undefined 5th-level variant manual.
 *
 * Expected GREEN (guards): cursor-after and cursor-at inserts, consecutive-Art warning, Long Rest removing unperformed
 * Performances, CHA +3 cap, undo of a plain composition, concurrent compose and start, no roll before the player's
 * click, Chromatic Orb manual, Shatter (2nd Level) not manual, one-minute reminder chat.
 *
 * Contract assumptions (named; the brief does not fix them):
 *  - bardComposePlans / bardPerformPlans are registered with the Supporter engine (supporter-uses.mjs).
 *  - emergencyImprovAid insert data: {mode: "insert", checkUseId, performanceId, art, index}; compose data:
 *    {mode: "compose", checkUseId, arts}. The Muse roll is the player's click (useRoll), as for composing.
 *  - Warnings are AK5eWarnings errors unless their ids are passed in data.overrides; a refusal is any other error.
 *  - Turn events are emitted through emitAk5eEvent("turnStart" | "turnEnd", {actorUuid, combatUuid, round, ...}).
 *  - Combat end is handleDeleteCombat(combat) (trigger-events.mjs), which emits combatEnd with actorUuids.
 *  - Long Rest is triggerLongRest(actor) (dnd5e.restCompleted through Hooks.callAll).
 *  - Rising Crescendo is the ActiveEffect carrying flags.ak5e.bardCrescendo.
 *  - A Dialog is emulated through foundry.applications.api.DialogV2 (the Cancel, confirm and X answers).
 *  - The one-minute Emergency Improv reminder is a globalThis.setTimeout call of 60000 ms (captured here).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, createTestCombat, triggerLongRest
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent, handleDeleteCombat } from "../scripts/trigger-events.mjs";

/* ==========================================================================
   Oracles (source text, copied; never read from the implementation)
   ========================================================================== */

// C3:7168-7211 Performance Arts: the Arts used below, with their printed Muse costs.
const MUSE = Object.freeze({
  Bane: 1, Bless: 1, Aid: 2, Heroism: 2, Sleep: 2, "Healing Word": 2, "Cause Fear": 2,
  "Chromatic Orb (Thunder only)": 3, "Shatter (2nd Level)": 5, "Shatter (5th Level)": 8
});
// Ruling 7 / DECISIONS "Bard missing Arts" (L508): the Arts absent from Chapter 5. Shatter (5th Level) is the
// undefined 5th-level variant (item 7 says it needs manual: true).
const ABSENT_FROM_CH5 = Object.freeze(new Set([
  "Bless", "Pyrotechnics", "Cause Fear", "Colour Spray", "Ray of Enfeeblement", "Shield of Faith",
  "Chromatic Orb (Thunder only)", "Crusader's Mantle", "Haste", "Tasha's Mind Whip", "Aura of Life", "Shatter (5th Level)"
]));
const REMINDER_MS = 60000;
// C3:6557-6578 Proficiency Bonus (level 1 is +2).
const pbOf = level => Math.floor((level - 1) / 4) + 2;

/* ==========================================================================
   Loaders, fresh instances and timers
   ========================================================================== */

const composeModule = () => import("../scripts/bard-compose.mjs");
const performModule = () => import("../scripts/bard-perform.mjs");
let freshSeq = 0, opSeq = 0, eventSeq = 0;
let plansRegistered = false;
const realSetTimeout = globalThis.setTimeout;
const reminders = [];

/** Load both modules and register their plans once per file (the engine rejects a second registration). */
async function ready() {
  const C = await composeModule();
  const P = await performModule();
  if (!plansRegistered) {
    try { Uses.registerSupporterPlans({ plans: { ...C.bardComposePlans, ...P.bardPerformPlans } }); }
    catch (error) { if (!/already registered/i.test(String(error?.message))) throw error; }
    plansRegistered = true;
  }
  return { C, P };
}

/** A fresh perform instance with its turn hooks registered (query-busted, so the registration guard is per instance). */
async function freshPerform() {
  const P = await import(`../scripts/bard-perform.mjs?u5=${++freshSeq}`);
  P.registerBardPerformHooks();
  return P;
}

/** A fresh compose instance with its rest hooks registered. */
async function freshCompose() {
  const C = await import(`../scripts/bard-compose.mjs?u5=${++freshSeq}`);
  C.registerBardComposeHooks();
  return C;
}

/** Capture only the one-minute reminder; every other timer is passed to the real setTimeout. */
function captureTimers(fn, ms, ...rest) {
  if (ms === REMINDER_MS) {
    reminders.push(fn);
    return { unref() {} };
  }
  return realSetTimeout(fn, ms, ...rest);
}

/* ==========================================================================
   Roll and dialog emulation
   ========================================================================== */

// Nothing rolls before the player's click (WORKFLOW 3.2). Every formula evaluated is recorded.
const rollFormulas = [];
let rollValue = 0;
function stubRoll() {
  globalThis.Roll = class StubRoll {
    constructor(formula) { this.formula = formula; this.total = null; }
    async evaluate() { rollFormulas.push(this.formula); this.total = rollValue; return this; }
    async toMessage() { return undefined; }
    static async roll() { rollFormulas.push("Roll.roll"); throw new Error("Roll.roll must not run in the Bard flows"); }
  };
}
/** The total the player's click produces for the next roll. */
const rollWith = total => { rollValue = total; return rollFormulas; };

// DialogV2 emulation. dialogAnswer: "confirm" picks the first non-cancel button, "cancel" picks Cancel, "x" closes (null),
// and {choose: "Heroism"} picks the button whose label or action names that Art (null when no such button is offered).
let dialogAnswer = "confirm";
const dialogCalls = [];
async function emulateDialog(options, buttons) {
  dialogCalls.push({ title: options.window?.title ?? "", actions: buttons.map(b => b.action), text: JSON.stringify(options) });
  if (dialogAnswer === "x") return null;
  if (typeof dialogAnswer === "object" && dialogAnswer?.choose) {
    const pick = buttons.find(b => `${b.label ?? ""} ${b.action ?? ""}`.includes(dialogAnswer.choose)) ?? null;
    if (!pick) return null;
    return (await pick.callback?.(null, pick, null)) ?? pick.action;
  }
  if (dialogAnswer === "cancel") {
    const cancel = buttons.find(b => b.action === "cancel") ?? null;
    return cancel ? (await cancel.callback?.(null, cancel, null)) ?? cancel.action : null;
  }
  const pick = buttons.find(b => b.action !== "cancel" && b.action !== "close") ?? null;
  if (!pick) return "ok";
  return (await pick.callback?.(null, pick, null)) ?? pick.action;
}
function installDialogs() {
  globalThis.foundry.applications = {
    api: {
      DialogV2: {
        wait: options => emulateDialog(options, options.buttons ?? []),
        prompt: options => emulateDialog(options, [{ action: "ok", label: "Confirm", default: true }, ...(options.buttons ?? [])])
      }
    }
  };
}

test.beforeEach(async () => {
  setupFoundryGlobals();
  Features.defineSupporterPools();
  stubRoll();
  installDialogs();
  rollFormulas.length = 0;
  rollValue = 0;
  dialogAnswer = "confirm";
  dialogCalls.length = 0;
  reminders.length = 0;
  globalThis.setTimeout = captureTimers;
  const { C } = await ready().catch(() => ({}));
  // Idempotency is asserted by the compose suite; a throw here must not hide every test in this file.
  try { C?.defineBardComposePools?.(); } catch { /* not this file's concern */ }
});

test.afterEach(() => {
  globalThis.setTimeout = realSetTimeout;
  teardownFoundryGlobals();
});

/* ==========================================================================
   Fixtures and helpers
   ========================================================================== */

/**
 * A Bard. Defaults: CHA +2, INT +3, Aid Ability CHA, Performance +5, Lute equipped and proficient (Soul of the Bard
 * Instruments noted, so no Instrument warning), and the Bard may compose (a finished rest is recorded). The Performances
 * and active state are seeded in the stored shape: flags.ak5e.bard = {performances, active, museTHP}.
 */
function makeBard({ level = 1, cha = 2, intMod = 3, aidAbility = "cha", prf = 5, performances = [], active = null,
  rest = true, instruments = true, branch = "bard", fontDie } = {}) {
  const mods = { str: -1, dex: 0, con: 0, int: intMod, wis: 1, cha };
  const abilities = {};
  for (const [key, mod] of Object.entries(mods)) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [
    createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }),
    createTestItem({ name: "Supporter: Bard", type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } }),
    createTestItem({ name: "Lute", type: "tool", system: { equipped: true, proficient: 1 } })
  ];
  // Arts are cast from the Bard's sheet by name. Manual Arts (ruling 7) are cast through the manual card and need no item.
  const seen = new Set();
  for (const entry of performances) {
    for (const art of entry.arts) {
      if (art.manual || seen.has(art.name)) continue;
      seen.add(art.name);
      const properties = art.name === "Heroism" ? new Set(["concentration"]) : new Set();
      items.push(createTestItem({ name: art.name, type: "spell", system: { level: 1, properties } }));
    }
  }
  const flags = {
    supporter: { enabled: true, branch, aidAbility },
    casting: { enabled: true, ability: "cha" },
    artsPoints: { value: 6, maximum: 6, maximumArtLevel: 9 },
    bard: { performances: structuredClone(performances), active: structuredClone(active), museTHP: 0 }
  };
  if (fontDie !== undefined) flags.bard.fontDie = fontDie;
  if (rest) flags.bardRest = { open: true, type: "long", at: "2026-10-24T00:00:00.000Z" };
  if (instruments) flags.bardSetup = { done: true, instruments: ["Lute", "Flute", "Drum"], performance: "proficient" };
  const actor = createTestActor({ name: "Bard", level, items, abilities, hp: { value: 20, max: 20, temp: 0 }, flags: { ak5e: flags } });
  actor.system.attributes ??= {};
  actor.system.attributes.prof = pbOf(level);
  actor.system.skills ??= {};
  actor.system.skills.prf = { value: 0, total: prf };
  actor.system.tools ??= {};
  actor.system.tools.lute = { value: 1 };
  return arrayAwareUpdate(actor);
}

/** A Bard whose Aid Dice pool is 6 (INT +6, Aid Ability INT), so the Performance cap is the only limit under test. */
const composer = (opts = {}) => makeBard({ intMod: 6, aidAbility: "int", ...opts });

/**
 * Foundry's dotted array-index updates write the index in place; the shared fixture would replace the whole array. This
 * wrapper writes the index itself, then delegates the rest (same approach as supporter-bard-perform-adversarial.test.mjs).
 */
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

/** A stored Performance. Manual is ruling 7's Ch.5-absent set (the Art's stored record carries the flag). */
function perf(id, names, extra = {}) {
  return {
    id,
    performed: false,
    composedAt: 1,
    arts: names.map(name => ({ name, muse: MUSE[name] ?? 2, manual: ABSENT_FROM_CH5.has(name) })),
    ...extra
  };
}

const bardOf = actor => actor.flags?.ak5e?.bard ?? null;
const performancesOf = actor => bardOf(actor)?.performances ?? [];
const performanceOf = (actor, id) => performancesOf(actor).find(item => item.id === id) ?? null;
const aidPool = actor => getPool(actor, "aidDie").value;
const crescendoEffectOf = actor => Array.from(actor.effects?.values?.() ?? [])
  .find(effect => effect.flags?.ak5e?.bardCrescendo !== undefined) ?? null;
/** The Bard's own flags and temporary HP: what a composition writes, so an undo can be compared exactly. */
const ownState = actor => JSON.stringify({ bard: bardOf(actor), temp: actor.system.attributes.hp.temp ?? 0 });

const nextOp = name => `u5-${name.toLowerCase()}-${++opSeq}`;
const isWarningError = error => error?.name === "AK5eWarnings" || Array.isArray(error?.warnings);

/** Warnings from a plan: the plan's own list when it passes, or the AK5eWarnings thrown when not overridden. */
async function warningsOf(runPlan) {
  try {
    const plan = await runPlan();
    return plan?.warnings ?? [];
  } catch (error) {
    if (isWarningError(error)) return error.warnings;
    throw error;
  }
}
const planWarnings = (actor, name, data) => warningsOf(() => Uses.supporterUses.plan(actor, name, data));

/** The error from a rejected (sync or async) call, or the value when it resolved. */
async function settle(fn) {
  try { return { threw: false, value: await fn() }; } catch (error) { return { threw: true, error }; }
}

/**
 * Run one use with every current plan warning accepted (the "use anyway" path). Warnings are never blocks (trust
 * table), so a use that throws here is a refusal. Returns {threw, error, value, opId}.
 */
async function go(actor, name, data = {}) {
  const opId = nextOp(name);
  const outcome = await settle(async () => {
    const warnings = await planWarnings(actor, name, data);
    return Uses.supporterUses.execute(actor, name, { ...data, overrides: warnings.map(w => w.id) }, opId);
  });
  return { ...outcome, opId };
}

/** Run a use (with warnings accepted) and then the player's roll click, which is the only path that rolls. */
async function useAndRoll(actor, name, data, total) {
  const out = await go(actor, name, data);
  if (!out.threw) {
    rollWith(total);
    await Uses.supporterUses.command(actor, "useRoll", { useId: out.opId }, `roll-${out.opId}`);
  }
  return out;
}

/** Emergency Improv step 1: the DC 17 Performance check, rolled and recorded. Returns the check's use id. */
async function passedCheck(actor, total = 20) {
  const out = await useAndRoll(actor, "emergencyImprov", {}, total);
  assert.equal(out.threw, false, `Emergency Improv check: ${out.error?.message ?? ""}`);
  return out.opId;
}

/** Start a Performance and cast its first Art (the UI flow: start, then castNextArt for the first Art). */
async function startAndCast(actor, performanceId) {
  const started = await go(actor, "startPerformance", { performanceId });
  assert.equal(started.threw, false, `start ${performanceId}: ${started.error?.message ?? ""}`);
  const cast = await go(actor, "castNextArt", { performanceId, index: 0 });
  assert.equal(cast.threw, false, `first cast of ${performanceId}: ${cast.error?.message ?? ""}`);
}

/** Cast the next Art of the active Performance. */
async function castNext(actor) {
  const active = bardOf(actor).active;
  return go(actor, "castNextArt", { performanceId: active.performanceId, index: active.index });
}

/** Emit a turn event for `actor` through the AK5e event layer (the payload the turn adapter sends). */
async function turn(kind, actor, round = 1) {
  return emitAk5eEvent(kind, {
    eventId: `${kind}:Combat.u5:${round}:${++eventSeq}`,
    actorUuid: actor.uuid, tokenUuid: null, combatantId: "m-bard",
    combatUuid: "Combat.u5", round, turn: 0, skipped: false
  });
}
const turnStart = (actor, round) => turn("turnStart", actor, round);
const turnEnd = (actor, round) => turn("turnEnd", actor, round);

/* ==========================================================================
   Tests A: Emergency Improv insert and the Performance cursor (L7152-7159)
   ========================================================================== */

const CURSOR_ARTS = ["Bane", "Bless", "Aid", "Heroism"];
// Performed, and the cursor is on Aid (index 2): Bane and Bless are already cast, Aid is the next Art.
const cursorBard = () => composer({
  level: 13,
  performances: [perf("p1", CURSOR_ARTS, { performed: true })],
  active: { performanceId: "p1", index: 2, crescendo: 0, castsThisTurn: 0 }
});

async function insertInto(actor, checkUseId, data, total = 6) {
  return useAndRoll(actor, "emergencyImprovAid", { mode: "insert", checkUseId, ...data }, total);
}

test("A1 (RED): an Art inserted before the cursor leaves the cursor on the Art not yet cast (C3:7152-7159, cursor integrity)", async () => {
  await ready();
  const actor = cursorBard();
  const checkUseId = await passedCheck(actor);
  const out = await insertInto(actor, checkUseId, { performanceId: "p1", art: "Sleep", index: 0 });
  assert.equal(out.threw, false, `inserting Sleep at the start: ${out.error?.message ?? ""}`);
  const bard = bardOf(actor);
  const names = performanceOf(actor, "p1").arts.map(art => art.name);
  assert.deepEqual(names, ["Sleep", "Bane", "Bless", "Aid", "Heroism"], "Sleep is inserted at the start");
  assert.equal(names[bard.active.index], "Aid",
    "the cursor moved with the insert: it still points at Aid, the next Art, not at the already-cast Bless");
});

test("A2 (green): an Art inserted after the cursor leaves the cursor on Aid", async () => {
  await ready();
  const actor = cursorBard();
  const checkUseId = await passedCheck(actor);
  const out = await insertInto(actor, checkUseId, { performanceId: "p1", art: "Sleep", index: 3 });
  assert.equal(out.threw, false, `inserting Sleep after the cursor: ${out.error?.message ?? ""}`);
  const bard = bardOf(actor);
  const names = performanceOf(actor, "p1").arts.map(art => art.name);
  assert.deepEqual(names, ["Bane", "Bless", "Aid", "Sleep", "Heroism"]);
  assert.equal(names[bard.active.index], "Aid", "the cursor still points at Aid");
});

test("A3 (green): an Art inserted at the cursor is not an already-cast Art at the cursor", async () => {
  await ready();
  const actor = cursorBard();
  const checkUseId = await passedCheck(actor);
  const out = await insertInto(actor, checkUseId, { performanceId: "p1", art: "Sleep", index: 2 });
  assert.equal(out.threw, false, `inserting Sleep at the cursor: ${out.error?.message ?? ""}`);
  const bard = bardOf(actor);
  const names = performanceOf(actor, "p1").arts.map(art => art.name);
  assert.ok(!["Bane", "Bless"].includes(names[bard.active.index]),
    `the cursor must not point at an Art already cast; it points at ${names[bard.active.index]}`);
});

test("A4 (green): inserting an Art next to the same Art is warned (no Art consecutively, C3:7103)", async () => {
  await ready();
  const actor = cursorBard();
  const checkUseId = await passedCheck(actor);
  const warnings = await planWarnings(actor, "emergencyImprovAid", { mode: "insert", checkUseId, performanceId: "p1", art: "Aid", index: 2 });
  assert.ok(warnings.some(w => w.id === "consecutive"), "a repeat next to Aid is warned as consecutive");
});

/* ==========================================================================
   Tests B: Soul of the Bard undo (L7137-7139)
   ========================================================================== */

test("B1 (RED): undo of Soul of the Bard restores the Performance proficiency it set (system.skills.prf)", async () => {
  await ready();
  const actor = makeBard({ instruments: false });
  const before = actor.system.skills.prf.value;
  const out = await go(actor, "bardSetup", { instruments: ["Lute", "Flute", "Drum"] });
  assert.equal(out.threw, false, `Soul of the Bard: ${out.error?.message ?? ""}`);
  assert.equal(actor.system.skills.prf.value, before + 1, "Performance proficiency is gained (C3:7139)");
  await Uses.supporterUses.undo(actor, out.opId);
  assert.equal(actor.system.skills.prf.value, before, "undo restores the Performance proficiency Soul of the Bard changed");
});

test("B2 (green): undo of Soul of the Bard clears the set-up record, so the feature can be set up again", async () => {
  await ready();
  const actor = makeBard({ instruments: false });
  const out = await go(actor, "bardSetup", { instruments: ["Lute", "Flute", "Drum"] });
  assert.equal(out.threw, false, `Soul of the Bard: ${out.error?.message ?? ""}`);
  await Uses.supporterUses.undo(actor, out.opId);
  assert.notEqual(actor.flags.ak5e.bardSetup?.done, true, "the set-up record is restored to not done");
});

test("B3 (green): a second Soul of the Bard set-up is warned that it is already set up", async () => {
  await ready();
  const actor = makeBard({ instruments: false });
  const first = await go(actor, "bardSetup", { instruments: ["Lute", "Flute", "Drum"] });
  assert.equal(first.threw, false, `first Soul of the Bard: ${first.error?.message ?? ""}`);
  const warnings = await planWarnings(actor, "bardSetup", { instruments: ["Lute", "Flute", "Drum"] });
  assert.ok(warnings.some(w => w.id === "alreadySetUp"), "the second set-up is warned");
});

test.todo("B4 (todo): undo of Soul of the Bard and the custom Instrument text (system.traits.toolProf.custom). Ruling not recorded; flagged for head arbitration");

/* ==========================================================================
   Tests C: Turn end with no Art cast (L7112: the Performance ends; keep Concentration, L7107)
   ========================================================================== */

test("C1 (RED): Cancel at the turn-end prompt keeps the Performance running and writes nothing", async () => {
  const P = await freshPerform();
  const actor = makeBard({ performances: [perf("p1", ["Bane", "Bless", "Aid"], { performed: true })],
    active: { performanceId: "p1", index: 1, crescendo: 0, castsThisTurn: 0 } });
  dialogAnswer = "cancel";
  const before = JSON.stringify(bardOf(actor));
  await turnEnd(actor, 2);
  assert.equal(P.isPerforming(actor), true, "Cancel: the Performance is still running (the engine must ask first)");
  assert.equal(JSON.stringify(bardOf(actor)), before, "Cancel writes nothing to the Bard");
});

test("C2 (RED): ending a Turn without casting an Art asks the player before the Performance ends (C3:7112)", async () => {
  await freshPerform();
  const actor = makeBard({ performances: [perf("p1", ["Bane", "Bless", "Aid"], { performed: true })],
    active: { performanceId: "p1", index: 1, crescendo: 0, castsThisTurn: 0 } });
  dialogAnswer = "confirm";
  await turnEnd(actor, 2);
  assert.ok(dialogCalls.length >= 1, "a confirm dialog is opened before the Performance is ended on Turn end");
});

// Behaviour check (head arbitration item 5): the Turn-end prompt must offer a way to keep one Art's Concentration. The
// injected answer chooses the button naming Heroism; the recorded end must then keep Heroism (the other Concentration
// Arts end). Only the Art name is matched in the prompt, not any label wording.
test("C3 (RED): the Turn-end prompt offers a choice that keeps one Art's Concentration, and choosing Heroism keeps Heroism (C3:7107)", async () => {
  await freshPerform();
  const actor = makeBard({ performances: [perf("p-c", ["Heroism", "Aid", "Bane"], { performed: true })],
    active: { performanceId: "p-c", index: 1, crescendo: 0, castsThisTurn: 0 } });
  dialogAnswer = { choose: "Heroism" };
  await turnEnd(actor, 2);
  assert.ok(dialogCalls.some(call => call.text.includes("Heroism")),
    "the Turn-end prompt names Heroism (a Concentration Art) as a choice");
  assert.equal(bardOf(actor).active, null, "the Performance ends at Turn end");
  const ended = Uses.supporterUses.state(actor).undo.filter(receipt => receipt.command === "endPerformance").at(-1) ?? null;
  assert.ok(ended, "the end of the Performance is recorded as a use");
  assert.equal(ended.result?.keepArt, "Heroism", "choosing Heroism keeps its Concentration; the Performance's other Concentration Arts end");
});

test("C4 (green): a Turn in which an Art was cast does not end the Performance at turn end", async () => {
  await freshPerform();
  const actor = makeBard({ performances: [perf("p1", ["Bane", "Bless", "Aid"], { performed: true })],
    active: { performanceId: "p1", index: 1, crescendo: 0, castsThisTurn: 1 } });
  await turnEnd(actor, 2);
  assert.ok(bardOf(actor).active, "the Performance keeps running after a Turn with a cast");
});

test("C5 (green): a confirmed Turn end with no cast ends the Performance and it cannot be performed again (No Encore)", async () => {
  await freshPerform();
  const actor = makeBard({ performances: [perf("p1", ["Bane", "Bless", "Aid"], { performed: true })],
    active: { performanceId: "p1", index: 1, crescendo: 0, castsThisTurn: 0 } });
  dialogAnswer = "confirm";
  await turnEnd(actor, 2);
  assert.equal(bardOf(actor).active, null, "the Performance ends");
  assert.equal(performanceOf(actor, "p1").performed, true, "the ended Performance stays performed (No Encore, C3:7114)");
});

/* ==========================================================================
   Tests D: Combat end and Long Rest end the Performance (ruling R2, C3:7112-7114)
   ========================================================================== */

test("D1 (RED): combat end ends the Bard's active Performance and removes its Rising Crescendo (ruling R2)", async () => {
  const P = await freshPerform();
  const actor = makeBard({ level: 1, performances: [perf("p3", ["Bless", "Aid", "Heroism"])] });
  await startAndCast(actor, "p3");
  await turnStart(actor, 2);
  const second = await castNext(actor);
  assert.equal(second.threw, false, `the second Art: ${second.error?.message ?? ""}`);
  assert.ok(crescendoEffectOf(actor), "precondition: the second Art gives the Rising Crescendo effect");
  const combat = createTestCombat([actor], { id: `u5-combat-${++freshSeq}`, started: true, round: 2 });
  await handleDeleteCombat(combat);
  assert.equal(P.isPerforming(actor), false, "the combat ends, so the Performance ends");
  assert.equal(crescendoEffectOf(actor), null, "the Rising Crescendo effect is removed with the Performance");
  assert.equal(performanceOf(actor, "p3").performed, true, "the ended Performance cannot be performed again (No Encore)");
});

test("D2 (RED): a Long Rest ends the Bard's active Performance (ruling R2)", async () => {
  await freshPerform();
  await freshCompose();
  const actor = makeBard({ performances: [perf("p1", ["Bane", "Bless", "Aid"], { performed: true })],
    active: { performanceId: "p1", index: 1, crescendo: 0, castsThisTurn: 0 } });
  await triggerLongRest(actor);
  assert.equal(bardOf(actor).active, null, "the Long Rest ends the Performance that was running");
});

test("D3 (green): a Long Rest drops the unperformed Performances and keeps the performed one (C3:7114)", async () => {
  await freshCompose();
  const actor = makeBard({ performances: [perf("p-a", ["Bane", "Bless", "Aid"]), perf("p-b", ["Bane", "Bless", "Aid"], { performed: true })] });
  await triggerLongRest(actor);
  assert.deepEqual(performancesOf(actor).map(item => item.id), ["p-b"], "only the performed Performance remains");
});

/* ==========================================================================
   Tests E: undo of a composition must not delete the Performance the Bard is performing
   ========================================================================== */

test("E1 (RED): undoing the composition does not delete the Performance the Bard is now performing", async () => {
  await ready();
  const actor = composer({ level: 1 });
  const composed = await useAndRoll(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless", "Aid"]] }, 4);
  assert.equal(composed.threw, false, `compose: ${composed.error?.message ?? ""}`);
  const newId = performancesOf(actor)[0]?.id;
  assert.ok(newId, "precondition: one Performance was composed");
  const started = await go(actor, "startPerformance", { performanceId: newId });
  assert.equal(started.threw, false, `start the composed Performance: ${started.error?.message ?? ""}`);
  // Undo may be refused; the rule is about the Performance being performed, so either outcome is acceptable as long as the
  // Bard's active Performance still exists.
  await settle(() => Uses.supporterUses.undo(actor, composed.opId));
  const active = bardOf(actor).active;
  if (active) {
    assert.ok(performancesOf(actor).some(item => item.id === active.performanceId),
      "the Performance being performed still exists after the composition is undone (or the undo is refused)");
  }
});

test("E2 (green): undoing a plain composition restores the Bard's flags and temporary HP exactly", async () => {
  await ready();
  const actor = composer({ level: 1 });
  const before = ownState(actor);
  const composed = await useAndRoll(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless", "Aid"]] }, 6);
  assert.equal(composed.threw, false, `compose: ${composed.error?.message ?? ""}`);
  assert.equal(performancesOf(actor).length, 1, "the Performance is composed");
  assert.ok(actor.system.attributes.hp.temp > 0, "the leftover Muse became Temporary HP");
  await Uses.supporterUses.undo(actor, composed.opId);
  assert.equal(ownState(actor), before, "undo restores the Performances, Muse and Temporary HP exactly");
});

test("E3 (green): no Roll is evaluated while composing, only at the player's click (WORKFLOW 3.2)", async () => {
  await ready();
  const actor = composer({ level: 1 });
  const out = await go(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless", "Aid"]] });
  assert.equal(out.threw, false, `compose: ${out.error?.message ?? ""}`);
  assert.equal(rollFormulas.length, 0, "nothing rolls before the player clicks");
});

/* ==========================================================================
   Tests F: Performance cap is the Charisma modifier with no minimum (ruling R1, C3:7099)
   ========================================================================== */

test("F1 (RED): at Charisma 0 the Performance cap is 0 (the composition gives up Performances; C3:7099 'up to your Charisma Modifier')", async () => {
  const { C } = await ready();
  const actor = composer({ level: 1, cha: 0 });
  assert.equal(C.bardComposeApi.performanceLimit(actor), 0, "the cap is the Charisma modifier, 0");
});

test("F2 (RED): at Charisma -2 the Performance cap is 0 (no minimum of 1)", async () => {
  const { C } = await ready();
  const actor = composer({ level: 1, cha: -2 });
  assert.equal(C.bardComposeApi.performanceLimit(actor), 0, "the cap is the Charisma modifier, 0");
});

test("F3 (green): at Charisma +3 the Performance cap is 3", async () => {
  const { C } = await ready();
  const actor = composer({ level: 1, cha: 3 });
  assert.equal(C.bardComposeApi.performanceLimit(actor), 3);
});

test("F4 (RED): composing one Performance at Charisma 0 is warned about the cap", async () => {
  await ready();
  const actor = composer({ level: 1, cha: 0 });
  const warnings = await planWarnings(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless", "Aid"]] });
  assert.ok(warnings.some(w => w.id === "performanceLimit"), "one Performance is over a cap of 0 and is warned");
});

// Head arbitration item 1: the cap is a warning, never a block. Accepting it lets the composition go through.
test("F4b (green): at Charisma 0 the cap is a warning, not a block: composing with the warning accepted succeeds", async () => {
  await ready();
  const actor = composer({ level: 1, cha: 0 });
  const out = await useAndRoll(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless", "Aid"]] }, 4);
  assert.equal(out.threw, false, `compose with the cap warning accepted: ${out.error?.message ?? ""}`);
  assert.equal(performancesOf(actor).length, 1, "the Performance is composed");
});

test("F5 (RED): the Charisma-0 cap warning does not claim a minimum of 1", async () => {
  const { C } = await ready();
  const actor = composer({ level: 1, cha: 0 });
  const warnings = C.bardComposeApi.validateComposition(actor, [["Bane", "Bless", "Aid"]]);
  const cap = warnings.find(w => w.id === "performanceLimit");
  assert.ok(cap, "a cap warning is raised at Charisma 0");
  assert.doesNotMatch(String(cap.text ?? ""), /minimum 1/i, "the warning states the Charisma modifier with no minimum");
});

test("F6 (green): three Performances at Charisma +3 raise no cap warning", async () => {
  await ready();
  const actor = composer({ level: 1, cha: 3 });
  const warnings = await planWarnings(actor, "composePerformances", {
    aidDice: 1, performances: [["Bane", "Bless", "Aid"], ["Bane", "Bless", "Aid"], ["Bane", "Bless", "Aid"]]
  });
  assert.equal(warnings.some(w => w.id === "performanceLimit"), false, "three is within a cap of 3");
});

/* ==========================================================================
   Tests G: Emergency Improv composition is lost unless begun within a minute (C3:7152-7159)
   ========================================================================== */

test("G1 (green): a composition by Emergency Improv schedules the one-minute reminder", async () => {
  await ready();
  const actor = composer({ level: 13 });
  const checkUseId = await passedCheck(actor);
  const composed = await useAndRoll(actor, "emergencyImprovAid", { mode: "compose", checkUseId, arts: ["Bane", "Bless", "Aid"] }, 4);
  assert.equal(composed.threw, false, `Emergency Improv compose: ${composed.error?.message ?? ""}`);
  assert.equal(reminders.length, 1, "one reminder is scheduled for the new Performance");
});

test("G2 (RED): an Emergency Improv Performance not begun within a minute is lost (the minute's timer removes it or starting it is refused)", async () => {
  await ready();
  const actor = composer({ level: 13 });
  const checkUseId = await passedCheck(actor);
  const composed = await useAndRoll(actor, "emergencyImprovAid", { mode: "compose", checkUseId, arts: ["Bane", "Bless", "Aid"] }, 4);
  assert.equal(composed.threw, false, `Emergency Improv compose: ${composed.error?.message ?? ""}`);
  const newId = performancesOf(actor).at(-1)?.id;
  assert.ok(newId, "precondition: the Performance was composed");
  for (const fire of reminders) await fire();
  if (performanceOf(actor, newId)) {
    const begun = await go(actor, "startPerformance", { performanceId: newId });
    assert.equal(begun.threw, true, "a Performance left unbegun after a minute cannot be begun (it is lost)");
  }
});

test("G3 (green): Emergency Improv is used once per Long Rest: a second check is warned", async () => {
  await ready();
  const actor = composer({ level: 13 });
  await passedCheck(actor);
  const warnings = await planWarnings(actor, "emergencyImprov", {});
  assert.ok(warnings.some(w => w.id === "used"), "the second Emergency Improv check in the same rest is warned");
});

/* ==========================================================================
   Tests H: Emergency Improv Aid Die and the Performance it inserts into
   ========================================================================== */

test("H0 (green): composing with no Aid Die left is warned on the composition path", async () => {
  await ready();
  const actor = composer({ level: 1 });
  await setPool(actor, "aidDie", 0);
  const warnings = await planWarnings(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless", "Aid"]] });
  assert.ok(warnings.length > 0, "an expended Aid Die that is not there is warned");
});

test("H1 (RED): Emergency Improv composing with no Aid Die left gives a warning (no Muse can be gained)", async () => {
  await ready();
  const actor = composer({ level: 13 });
  const checkUseId = await passedCheck(actor);
  await setPool(actor, "aidDie", 0);
  const warnings = await planWarnings(actor, "emergencyImprovAid", { mode: "compose", checkUseId, arts: ["Bane", "Bless", "Aid"] });
  assert.ok(warnings.length > 0, "with no Aid Die left the Muse gained is 0: the use is warned");
});

test("H2 (RED): Emergency Improv inserting with no Aid Die left gives a warning (no Muse can be gained)", async () => {
  await ready();
  const actor = cursorBard();
  const checkUseId = await passedCheck(actor);
  await setPool(actor, "aidDie", 0);
  const warnings = await planWarnings(actor, "emergencyImprovAid", { mode: "insert", checkUseId, performanceId: "p1", art: "Sleep", index: 3 });
  assert.ok(warnings.length > 0, "with no Aid Die left the insert gains no Muse: the use is warned");
});

test("H3 (RED): inserting into a Performance that has already ended is warned (only the current Performance takes an Art)", async () => {
  await ready();
  const actor = composer({
    level: 13,
    performances: [perf("p-ended", ["Bane", "Bless", "Aid"], { performed: true })],
    active: null
  });
  const checkUseId = await passedCheck(actor);
  const warnings = await planWarnings(actor, "emergencyImprovAid", { mode: "insert", checkUseId, performanceId: "p-ended", art: "Sleep", index: 3 });
  assert.ok(warnings.length > 0, "the Performance has ended and is not the current one: the insert is warned");
});

/* ==========================================================================
   Tests I: a Performance needs at least three Arts and is cast from its first (L7101-7112)
   ========================================================================== */

// Head arbitration item 3: one or two Arts may start, but the start must carry a warning citing the three-Art minimum
// (C3:7104); a warning is not a block, so the start with that warning accepted succeeds.
async function assertShortStartWarned(names, label) {
  await ready();
  const actor = makeBard({ performances: [perf("p-short", names)] });
  const warnings = await planWarnings(actor, "startPerformance", { performanceId: "p-short" });
  assert.ok(warnings.some(w => /three|minArts/i.test(`${w.id ?? ""} ${w.text ?? ""}`)),
    `${label}: starting a Performance of ${names.length} Art(s) is warned about the three-Art minimum (C3:7104)`);
  const out = await go(actor, "startPerformance", { performanceId: "p-short" });
  assert.equal(out.threw, false, `${label}: with the warning accepted the start is allowed`);
}

test("I1 (RED): a Performance of two Arts may start, with a warning citing the three-Art minimum (C3:7104)", async () => {
  await assertShortStartWarned(["Bane", "Bless"], "two Arts");
});

test("I1b (RED): a Performance of one Art may start, with a warning citing the three-Art minimum (C3:7104)", async () => {
  await assertShortStartWarned(["Bane"], "one Art");
});

// Head arbitration item 3: zero Arts is refused. go() accepts every warning, so a refusal here cannot be overridden.
test("I2 (RED): a Performance of no Arts is refused, even with warnings accepted, and nothing is started", async () => {
  await ready();
  const actor = makeBard({ performances: [perf("p-empty", [])] });
  const out = await go(actor, "startPerformance", { performanceId: "p-empty" });
  assert.equal(out.threw, true, "a Performance with no Arts cannot be started: nothing can be cast");
  assert.equal(isWarningError(out.error), false, "the refusal is a hard refusal, not an overridable warning");
  assert.equal(bardOf(actor).active, null, "no active Performance is written");
});

test("I3 (green): composing a two-Art Performance is warned (minimum three Arts)", async () => {
  await ready();
  const actor = composer({ level: 1 });
  const warnings = await planWarnings(actor, "composePerformances", { aidDice: 1, performances: [["Bane", "Bless"]] });
  assert.ok(warnings.some(w => w.id === "minArts"), "a two-Art composition is warned");
});

/* ==========================================================================
   Tests J: concurrent writes keep every update (the actor-keyed serial queue)
   ========================================================================== */

test("J1 (green): a composition's Muse roll and a Performance start running together keep both updates", async () => {
  await ready();
  const actor = composer({ level: 1, performances: [perf("p-old", ["Bane", "Bless", "Aid"])] });
  const composed = await go(actor, "composePerformances", { aidDice: 1, performances: [["Heroism", "Sleep", "Bane"]] });
  assert.equal(composed.threw, false, `compose: ${composed.error?.message ?? ""}`);
  rollWith(4);
  const [, started] = await Promise.all([
    Uses.supporterUses.command(actor, "useRoll", { useId: composed.opId }, `roll-${composed.opId}`),
    go(actor, "startPerformance", { performanceId: "p-old" })
  ]);
  assert.equal(started.threw, false, `start: ${started.error?.message ?? ""}`);
  const ids = performancesOf(actor).map(item => item.id);
  assert.ok(ids.includes("p-old") && ids.length === 2, "the composed Performance and the started one are both kept");
  assert.equal(performanceOf(actor, "p-old").performed, true, "the started Performance is marked performed");
  assert.equal(bardOf(actor).active?.performanceId, "p-old", "the Bard is performing the started Performance");
});

/* ==========================================================================
   Tests K: Arts table, manual markers (ruling 7; C3:7168-7211; Ch.5)
   ========================================================================== */

test("K1 (RED): Shatter (5th Level) is marked manual (ruling 7: the undefined 5th-level variant has no Ch.5 entry)", async () => {
  const { C } = await ready();
  const row = C.BARD_PERFORMANCE_ARTS.find(item => item.name === "Shatter (5th Level)");
  assert.ok(row, "the Shatter (5th Level) row exists");
  assert.equal(row.manual, true, "Shatter (5th Level) is manual");
});

test("K2 (green): Shatter (2nd Level) is not manual (Ch.5 L283 lists it)", async () => {
  const { C } = await ready();
  const row = C.BARD_PERFORMANCE_ARTS.find(item => item.name === "Shatter (2nd Level)");
  assert.ok(row, "the Shatter (2nd Level) row exists");
  assert.equal(row.manual, false, "Shatter (2nd Level) is not manual");
});

test("K3 (green): Chromatic Orb (Thunder only) is manual (absent from Ch.5)", async () => {
  const { C } = await ready();
  const row = C.BARD_PERFORMANCE_ARTS.find(item => item.name === "Chromatic Orb (Thunder only)");
  assert.ok(row, "the Chromatic Orb row exists");
  assert.equal(row.manual, true, "Chromatic Orb is manual");
});

test("K4 (green): the Arts table has 34 rows, each with a name, a Muse cost and the manual flag", async () => {
  const { C } = await ready();
  assert.equal(C.BARD_PERFORMANCE_ARTS.length, 34, "34 Performance Arts (C3:7168-7211)");
  for (const row of C.BARD_PERFORMANCE_ARTS) {
    assert.equal(typeof row.name, "string");
    assert.equal(typeof row.muse, "number");
    assert.equal(typeof row.manual, "boolean");
  }
});

/* ==========================================================================
   Tests L: known gaps, recorded as todo (not asserted)
   ========================================================================== */

test.todo("L1 (todo): other Concentration Arts of a Performance end when it ends, keeping only the chosen one (C3:7107). Known limitation (DECISIONS); the source ties it to the end of the Performance, so the check waits on that work");
test.todo("L2 (todo): the keep choice on a manual end and the one confirm on it (C3:7107). The end flow is the perform command, not covered here");
