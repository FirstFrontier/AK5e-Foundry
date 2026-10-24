/**
 * U8 adversarial challenge suite: Supporter Bard performing.
 *
 * Behavior-level tests written from the source (AK5e 1.3.1 Ch.3, Bard, L7096-7211; "C3:NNNN" below cites the
 * source line) and the head rulings in ak5e/DECISIONS.md ("Supporter Class and Artificer / Bard / Hexer Branches",
 * items 4, 7 and 10. The brief's R4 and R7 are read as items 4 (special dice, Font of Inspiration) and 7 (manual Arts).
 * The implementation lives in ak5e/scripts/bard-perform.mjs and is loaded dynamically, so a missing module fails
 * only the tests that need it. Expected to FAIL until that module lands.
 *
 * Contract assumptions (named guesses; the brief does not fix them):
 *  - Instrument: a tool item named "Lute" with system.equipped and system.proficient, plus actor
 *    system.tools.lute.value (the proficiency shape is an assumption; both are seeded so either reading passes).
 *  - Warnings surface as an AK5eWarnings error (play-undo.mjs PlayWarnings) unless overridden through
 *    data.overrides; a refusal surfaces as any other error. Warning ids are used as overrides.
 *  - A turn event is emitted through emitAk5eEvent("turnStart" | "turnEnd", {actorUuid, combatUuid, round, ...}).
 *  - Crescendo values come only from crescendoBonuses(actor); the "crescendo effect" is observed through it.
 *  - Font of Inspiration state is flags.ak5e.bard.fontDie; AP is flags.ak5e.artsPoints.value; the Aid Die on a
 *    target is found with supporter-features.findAidDieEffect.
 *  - Seeded active state uses the contract fields {performanceId, index, crescendo, castsThisTurn}.
 *
 * Oracles (source numbers and rulings) are copied from the source text, never read from the implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

/* ==========================================================================
   Loaders, fixtures and helpers
   ========================================================================== */

const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 2, wis: 1, cha: 4 });

// Performance Arts table (C3:7168-7211). `manual` marks the Arts absent from Ch.5 (DECISIONS R7 / item 7).
const MUSE = Object.freeze({ Bless: 1, Bane: 1, Aid: 2, Heroism: 2, "Cause Fear": 2, "Healing Word": 2 });
const MANUAL = Object.freeze(new Set(["Cause Fear", "Shield of Faith", "Haste", "Tasha's Mind Whip", "Aura of Life"]));

// Load the module once per file path. A missing module fails only the tests that call bard().
let bardModule = null, bardLoadError = null, plansRegistered = false, freshSeq = 0, eventSeq = 0, opSeq = 0;
let rollCalls = [];

async function bard() {
  if (!bardModule && !bardLoadError) {
    try { bardModule = await import("../scripts/bard-perform.mjs"); }
    catch (error) { bardLoadError = error; }
  }
  assert.ok(bardModule, `ak5e/scripts/bard-perform.mjs is not loadable yet: ${bardLoadError?.message ?? "unknown"}`);
  return bardModule;
}

/** Load the module and register its plans with the Supporter engine (once per file). */
async function ready() {
  const B = await bard();
  if (!plansRegistered) {
    try { Uses.registerSupporterPlans({ plans: B.bardPerformPlans }); }
    catch (error) { if (!/already registered/.test(error?.message ?? "")) throw error; }
    plansRegistered = true;
  }
  return B;
}

/**
 * A fresh module instance (query-busted) whose hooks are registered. Used by every test that drives turnStart or
 * turnEnd, so the module's own registration guard is exercised rather than a shared instance.
 */
async function freshBard() {
  const M = await import(`../scripts/bard-perform.mjs?x=${++freshSeq}`);
  M.registerBardPerformHooks();
  return M;
}

/** Stub Roll: any evaluate() or Roll.roll() is recorded. Nothing in U8 may roll (WORKFLOW 3.2). */
function stubRoll() {
  rollCalls = [];
  globalThis.Roll = class StubRoll {
    constructor(formula) { this.formula = formula; this.total = null; }
    async evaluate() { rollCalls.push(this.formula); this.total = 0; return this; }
    async toMessage() { return undefined; }
    static async roll() { rollCalls.push("Roll.roll"); throw new Error("Roll.roll must not run in the Bard performing flow"); }
  };
}

test.beforeEach(async () => {
  setupFoundryGlobals();
  stubRoll();
  Features.defineSupporterPools();
  const B = await bard().catch(() => null);
  B?.defineBardPerformPools?.();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/**
 * A Supporter at `level`. `instrument`: "ready" (equipped and proficient), "unequipped", "unproficient" or "none".
 * `supporter: false` builds a plain creature with no Supporter class. `branch` sets flags.ak5e.supporter.branch.
 * Performances and active state are seeded directly (the contract's stored shape).
 */
function makeBard({ level = 1, cha = 4, performances = [], active = null, fontDie, instrument = "ready",
  artsValue = 6, branch = "bard", supporter = true, owner = true, name = "Bard" } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, cha })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [];
  if (supporter) {
    items.push(createTestItem({
      name: "Supporter", type: "class", system: { levels: level },
      flags: { ak5e: { chapterThreeId: "class-supporter" } }
    }));
  }
  if (instrument !== "none") {
    items.push(createTestItem({
      name: "Lute", type: "tool",
      system: { equipped: instrument !== "unequipped", proficient: instrument === "unproficient" ? 0 : 1 }
    }));
  }
  // Arts are looked up by name among the actor's spell items (the Bard's sheet). Every non-manual Art of the
  // Performances seeded here gets a spell item; manual Arts are cast through the manual card (R7) and need none.
  const seenArts = new Set();
  for (const entry of performances) {
    for (const art of entry.arts) {
      if (art.manual || seenArts.has(art.name)) continue;
      seenArts.add(art.name);
      // Only Heroism is seeded as a Concentration Art (the property the engine reads, D&D5e system.properties).
      const properties = CONCENTRATION_ARTS.has(art.name) ? new Set(["concentration"]) : new Set();
      items.push(createTestItem({ name: art.name, type: "spell", system: { level: 1, properties } }));
    }
  }
  // Proficiency is detectably absent for "unproficient": proficient 0 on the tool and no tools entry (ruling D).
  const toolsSystem = instrument === "unproficient" || instrument === "none" ? {} : { tools: { lute: { value: 1 } } };
  const bardFlags = { performances: structuredClone(performances), active: structuredClone(active), museTHP: 0 };
  if (fontDie !== undefined) bardFlags.fontDie = fontDie;
  return arrayAwareUpdate(createTestActor({
    name, level, items, abilities, owner,
    hp: { value: 20, max: 20, temp: 0 },
    system: toolsSystem,
    flags: {
      ak5e: {
        supporter: { enabled: supporter, branch },
        casting: { enabled: true, ability: "cha" },
        artsPoints: { value: artsValue, maximum: 6, maximumArtLevel: 9 },
        bard: bardFlags
      }
    }
  }));
}

/**
 * Foundry's array-index updates (`flags.ak5e.bard.performances.0.performed`) write the index in place. The shared
 * fixture would replace the whole array on such a dotted write, so this wrapper writes the index itself, then
 * delegates the rest. Same approach as the implementer's supporter-bard-perform.test.mjs.
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

/** A plain target creature. `owner: false` is the unowned relay case (WORKFLOW 3.2). */
function foeActor(name = "Foe", extra = {}) {
  return createTestActor({ name, hp: { value: 30, max: 30, temp: 0 }, ...extra });
}

/** A stored Performance. `names` are Art names in order; manual flags come from the Performance Arts table. */
function perf(id, names, extra = {}) {
  return {
    id,
    arts: names.map(artName => ({ name: artName, muse: MUSE[artName] ?? 2, manual: MANUAL.has(artName) })),
    performed: false,
    composedAt: 1,
    ...extra
  };
}
// Concentration Arts seeded on the spell sheet (non-manual Arts only).
const CONCENTRATION_ARTS = new Set(["Heroism"]);
const P3 = (extra = {}) => perf("perf-3", ["Bless", "Aid", "Heroism"], extra);
// A Performance whose first Art is the Concentration Art, so keepArt can name a cast Art (ruling E).
const PC = (extra = {}) => perf("perf-c", ["Heroism", "Aid", "Bane"], extra);
const P4 = (extra = {}) => perf("perf-4", ["Bless", "Aid", "Bane", "Heroism"], extra);
const PM = (extra = {}) => perf("perf-m", ["Bless", "Cause Fear", "Aid"], extra);

/** Seeded active state (contract shape). */
const activeOf = (performanceId, index, crescendo, castsThisTurn) => ({ performanceId, index, crescendo, castsThisTurn });

const bardOf = actor => actor.flags?.ak5e?.bard ?? null;
const apOf = actor => actor.flags?.ak5e?.artsPoints?.value;
const effectIds = actor => Array.from(actor.effects?.values?.() ?? []).map(effect => effect.id).sort();
const nonCrescendoEffects = actor => Array.from(actor.effects?.values?.() ?? [])
  .filter(effect => effect.name !== "Rising Crescendo").map(effect => effect.id).sort();
const messageCount = () => game.messages.length;
const lastMessageText = () => String(game.messages[game.messages.length - 1]?.content ?? "");

/** Every observable of the Bard's performing state, for before/after comparison. fontDie is normalized to a boolean. */
function snap(actor, B, others = []) {
  const bard = bardOf(actor) ?? {};
  return {
    performances: JSON.parse(JSON.stringify(bard.performances ?? [])),
    active: JSON.parse(JSON.stringify(bard.active ?? null)),
    fontDie: Boolean(bard.fontDie),
    ap: apOf(actor),
    effects: effectIds(actor),
    aidPool: getPool(actor, "aidDie").value,
    crescendo: B ? B.crescendoBonuses(actor) : null,
    targets: others.map(target => effectIds(target))
  };
}

const isWarningError = error => error?.name === "AK5eWarnings" || Array.isArray(error?.warnings);
const overridesFor = warnings => warnings.map(warning => warning.id);
const hasLevelWarning = warnings => warnings.some(w => /level/i.test(`${w.id ?? ""} ${w.text ?? ""}`));

const nextOp = name => `u8-${name.toLowerCase()}-${++opSeq}`;

/**
 * Run one Bard use through the Supporter engine (the confirmed path). Returns the outcome instead of throwing:
 * ok, warnings (when a warning blocked), error (any other refusal) and the operation id for undo.
 */
async function attempt(actor, name, data = {}) {
  const opId = nextOp(name);
  try {
    const result = await Uses.supporterUses.execute(actor, name, data, opId);
    return { ok: true, warnings: [], error: null, opId, result };
  } catch (error) {
    if (isWarningError(error)) return { ok: false, warnings: error.warnings, error, opId };
    return { ok: false, warnings: [], error, opId };
  }
}

/** The use was blocked by a warning (not a refusal) and nothing was applied. */
function assertWarned(outcome, message) {
  assert.equal(outcome.ok, false, `${message}: expected a warning, got success`);
  assert.ok(outcome.warnings.length > 0, `${message}: expected a warning, got ${outcome.error?.message ?? "a refusal"}`);
}

/** The use was refused outright (an error, not an overridable warning). */
function assertRefused(outcome, message) {
  assert.equal(outcome.ok, false, `${message}: expected a refusal, got success`);
  assert.ok(outcome.error, `${message}: a refusal must carry an error`);
  assert.equal(outcome.warnings.length, 0, `${message}: a refusal is not an overridable warning`);
}

/** Start a Performance and cast its first Art, overriding any warnings the caller explicitly accepts. */
async function startPerformance(actor, performanceId, overrides = []) {
  // The engine's start does not cast (a native cast needs the dnd5e dialog). The UI flow is start, then castNextArt for
  // the first Art (ruling A). Only a successful start is followed by that first cast; a warned start casts nothing.
  const started = await attempt(actor, "startPerformance", { performanceId, overrides });
  if (started.ok) {
    const active = bardOf(actor)?.active ?? {};
    started.firstCast = await attempt(actor, "castNextArt", { performanceId: active.performanceId, index: active.index, overrides: [] });  }
  return started;
}

/**
 * Cast the next Art. The engine checks the caller's view of the Performance: performanceId and index are read from
 * the Bard's active state, as the Performing panel supplies them. Overrides are the warning ids the caller accepts.
 */
async function castNext(actor, overrides = []) {
  const active = bardOf(actor)?.active ?? {};
  return attempt(actor, "castNextArt", { performanceId: active.performanceId, index: active.index, overrides });
}

/**
 * Emit a turn event for `actor` through the AK5e event layer. The payload carries the fields the turn adapter
 * sends (trigger-events.mjs handleCombatTurnChange). Handler errors are NOT asserted here: handlers from earlier
 * tests' module instances stay registered in the shared event layer, and emitAk5eEvent swallows handler errors.
 * Every turn test therefore asserts the observable state (active, fontDie, crescendo), which a failure would break.
 */
async function turn(kind, actor, round = 1) {
  return emitAk5eEvent(kind, {
    eventId: `${kind}:Combat.u8:${round}:${++eventSeq}`,
    actorUuid: actor.uuid, tokenUuid: null, combatantId: "m-bard",
    combatUuid: "Combat.u8", round, turn: 0, skipped: false
  });
}

/** Walk one Bard turn boundary: the Bard's turn starts, then ends. */
const turnStart = (actor, round) => turn("turnStart", actor, round);
const turnEnd = (actor, round) => turn("turnEnd", actor, round);

/** Stored crescendo is read through crescendoBonuses. All four benefits must equal `n`. */
function assertCrescendo(B, actor, n, message) {
  const bonuses = B.crescendoBonuses(actor);
  assert.deepEqual(
    { healing: bonuses.healing, extraTargets: bonuses.extraTargets, saveDC: bonuses.saveDC, spellAttack: bonuses.spellAttack },
    { healing: n, extraTargets: n, saveDC: n, spellAttack: n },
    message
  );
}

/** Hook listener count across the fixture's Hooks registry (the fixture recreates Hooks per test). */
const hookCount = () => [...(globalThis.Hooks?._hooks?.values?.() ?? [])].reduce((total, list) => total + list.length, 0);

/* ==========================================================================
   1. Exports, hooks, pools and command routing
   ========================================================================== */

test("EX-1: module exports the U8 contract (four plans, pool/hook/command/panel/api/crescendo/isPerforming)", async () => {
  const B = await ready();
  for (const plan of ["startPerformance", "castNextArt", "endPerformance", "fontProvideAid"]) {
    assert.equal(typeof B.bardPerformPlans[plan], "function", `bardPerformPlans.${plan} must be a plan`);
  }
  for (const fn of ["defineBardPerformPools", "registerBardPerformHooks", "bardPerformCommand", "crescendoBonuses", "isPerforming"]) {
    assert.equal(typeof B[fn], "function", `${fn} must be exported as a function`);
  }
  assert.notEqual(B.bardPerformPanel, undefined, "bardPerformPanel must be exported");
  assert.notEqual(B.bardPerformApi, undefined, "bardPerformApi must be exported");
});

test("EX-2: defineBardPerformPools and registerBardPerformHooks are idempotent (second call adds nothing)", async () => {
  const B = await ready();
  assert.doesNotThrow(() => { B.defineBardPerformPools(); B.defineBardPerformPools(); }, "pool definition must be idempotent");
  B.registerBardPerformHooks();
  const once = hookCount();
  B.registerBardPerformHooks();
  assert.equal(hookCount(), once, "a second registerBardPerformHooks must not add listeners");
});

test("EX-3: bardPerformCommand returns undefined for an unknown command and does not touch state", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  const before = snap(actor, B);
  assert.equal(await B.bardPerformCommand(actor, "noSuchBardCommand", {}), undefined);
  assert.deepEqual(snap(actor, B), before);
});

test("EX-4: a non-performing Bard reports no crescendo and is not performing", async () => {
  const B = await ready();
  const actor = makeBard({ level: 17, performances: [P3()] });
  assert.equal(B.isPerforming(actor), false);
  assertCrescendo(B, actor, 0, "no Performance means no Rising Crescendo (C3:7118)");
});

/* ==========================================================================
   2. Start (C3:7106-7108, 7114)
   ========================================================================== */

test("ST-1: no Instrument warns and does not block; the warning is overridable (C3:7106)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, instrument: "none", performances: [P3()] });
  const first = await startPerformance(actor, "perf-3");
  assertWarned(first, "a start without an Instrument");
  assert.equal(bardOf(actor).performances[0].performed, false, "a warned start must change nothing");
  assert.equal(B.isPerforming(actor), false);
  const second = await startPerformance(actor, "perf-3", overridesFor(first.warnings));
  assert.equal(second.ok, true, "the warning must be overridable, not a block");
  assert.equal(B.isPerforming(actor), true);
});

// Level 4 keeps the level-1 Font warning (fontLevel) out of these checks, so only the Instrument warning can satisfy them.
test("ST-2: an unequipped Instrument and an unproficient Instrument each warn on start (C3:7106)", async () => {
  await ready();
  const unequipped = makeBard({ level: 4, instrument: "unequipped", performances: [P3()] });
  const unequippedOutcome = await startPerformance(unequipped, "perf-3");
  assertWarned(unequippedOutcome, "an unequipped Instrument");
  assert.ok(unequippedOutcome.warnings.some(w => w.id === "instrument"), "the warning is the Instrument warning");
  const unproficient = makeBard({ level: 4, instrument: "unproficient", performances: [P3()] });
  const unproficientOutcome = await startPerformance(unproficient, "perf-3");
  assertWarned(unproficientOutcome, "an Instrument not proficient with");
  assert.ok(unproficientOutcome.warnings.some(w => w.id === "instrument"), "the warning is the Instrument warning");
});

test("ST-3: a proficient, equipped Instrument starts with no warning, sets performed, casts the first Art and costs 0 AP (C3:7106-7108)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()], artsValue: 6 });
  const before = messageCount();
  const outcome = await startPerformance(actor, "perf-3");
  const raised = outcome.warnings.map(w => `${w.id}: ${w.text}`).join(" | ") || outcome.error?.message;
  assert.equal(outcome.ok, true, `a ready Instrument must start without warnings; raised: ${raised}`);
  assert.equal(bardOf(actor).performances[0].performed, true, "starting sets performed: true");
  assert.equal(bardOf(actor).active?.performanceId, "perf-3");
  // active.index advances past the first Art (C3:7106-7108: the first Art is cast immediately).
  assert.equal(bardOf(actor).active.index, 1, "after the first Art is cast, index advances past it");
  assert.equal(apOf(actor), 6, "Arts cast as part of a Performance cost 0 AP (C3:7106)");
  assert.ok(messageCount() > before, "casting the first Art posts a card");
  assert.match(lastMessageText(), /Bless/, "the first Art of the Performance is the one cast");
  assert.equal(B.isPerforming(actor), true);
  assert.equal(rollCalls.length, 0, "starting a Performance never rolls");
});

test("ST-4: No Encore: starting an already-performed Performance warns, and the warning is overridable (C3:7114)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3({ performed: true })] });
  const first = await startPerformance(actor, "perf-3");
  assertWarned(first, "a Performance that has already been performed");
  assert.equal(B.isPerforming(actor), false, "the warned restart must not begin");
  assert.equal(bardOf(actor).performances[0].performed, true);
  const second = await startPerformance(actor, "perf-3", overridesFor(first.warnings));
  assert.equal(second.ok, true, "the No Encore warning must be overridable");
});

test("ST-5: an unknown performanceId is rejected clearly, as a refusal, and changes nothing", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  const before = snap(actor, B);
  const outcome = await startPerformance(actor, "perf-missing");
  assertRefused(outcome, "an unknown performanceId");
  assert.match(outcome.error.message, /perform/i, "the refusal names the missing Performance");
  assert.deepEqual(snap(actor, B), before);
});

test("ST-6: a non-Bard Supporter (Hexer branch) is refused for startPerformance and changes nothing (C3:7106)", async () => {
  const B = await ready();
  const hexer = makeBard({ level: 4, branch: "hexer", performances: [P3()] });
  const before = snap(hexer, B);
  assertRefused(await startPerformance(hexer, "perf-3"), "a Hexer Supporter starting a Bard Performance");
  assert.deepEqual(snap(hexer, B), before);
});

test("ST-7: a non-Supporter with Bard data is refused for every Performing command", async () => {
  const B = await ready();
  const plain = makeBard({ level: 4, supporter: false, performances: [P3()], active: activeOf("perf-3", 1, 0, 1) });
  const before = snap(plain, B);
  assertRefused(await startPerformance(plain, "perf-3"), "a non-Supporter starting");
  assertRefused(await castNext(plain), "a non-Supporter casting");
  assertRefused(await attempt(plain, "endPerformance", {}), "a non-Supporter ending");
  assertRefused(await attempt(plain, "fontProvideAid", { targetUuid: "Actor.x", targetName: "X", distance: 10 }), "a non-Supporter using Font");
  assert.deepEqual(snap(plain, B), before, "refusals change nothing");
});

test("ST-8: Cancel changes nothing: an unconfirmed command and a plan preview leave every observable unchanged", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  const before = snap(actor, B);
  const messages = messageCount();
  await assert.rejects(
    Uses.supporterUses.command(actor, "startPerformance", { performanceId: "perf-3" }, nextOp("cancel")),
    /Confirm/i, "an unconfirmed use is not applied"
  );
  try { Uses.supporterUses.plan(actor, "startPerformance", { performanceId: "perf-3" }); } catch { /* a warning preview is also a no-op */ }
  assert.deepEqual(snap(actor, B), before, "cancelling must not change state");
  assert.equal(messageCount(), messages, "cancelling must not post a card");
  assert.equal(rollCalls.length, 0);
});

/* ==========================================================================
   3. Per-turn casting and the Time Signature boundary (C3:7108-7110, 7149-7150)
   ========================================================================== */

test("PT-1: castNextArt while not performing is refused or warned, and changes nothing (reading: no Performance is active, C3:7108)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 10, performances: [P3()] });
  const before = snap(actor, B);
  const messages = messageCount();
  const outcome = await castNext(actor);
  assert.equal(outcome.ok, false, "castNextArt with no active Performance must not succeed");
  assert.deepEqual(snap(actor, B), before, "the refused cast must not change state");
  assert.equal(messageCount(), messages, "the refused cast must not post a card");
  assert.equal(B.isPerforming(actor), false);
});

test("PT-2: level 9: a second Art in the same Turn warns; with the warning accepted it is cast (C3:7108-7110)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 9, performances: [P4()] });
  assert.equal((await startPerformance(actor, "perf-4")).ok, true, "the start itself carries no warning");
  const first = await castNext(actor);
  assertWarned(first, "a second Art in the same Turn below level 10");
  assert.equal(bardOf(actor).active.index, 1, "the warned second Art is not cast");
  const second = await castNext(actor, overridesFor(first.warnings));
  assert.equal(second.ok, true, "the one-Art-per-Turn warning must be overridable");
  assert.equal(bardOf(actor).active.index, 2, "the accepted second Art is cast");
  assert.equal(B.isPerforming(actor), true);
});

test("PT-3: level 10 (Time Signature): a second Art in the same Turn has no warning (C3:7149-7150)", async () => {
  await ready();
  const actor = makeBard({ level: 10, performances: [P4()] });
  assert.equal((await startPerformance(actor, "perf-4")).ok, true);
  const second = await castNext(actor);
  assert.equal(second.ok, true, "from level 10 a second Art in the Turn needs no warning");
  assert.equal(bardOf(actor).active.index, 2);
});

test("PT-4: level 10: a third Art in the same Turn warns (only two per Turn are allowed) and is cast when accepted", async () => {
  await ready();
  const actor = makeBard({ level: 10, performances: [P4()] });
  await startPerformance(actor, "perf-4");
  assert.equal((await castNext(actor)).ok, true);
  const third = await castNext(actor);
  assertWarned(third, "a third Art in one Turn at level 10");
  const accepted = await castNext(actor, overridesFor(third.warnings));
  assert.equal(accepted.ok, true, "the third-Art warning must be overridable");
  assert.equal(bardOf(actor).active.index, 3);
});

test("PT-5: the one-Art-per-Turn limit resets at a Turn start (C3:7108-7110)", async () => {
  await ready();
  const actor = makeBard({ level: 1, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  await turnStart(actor, 2);
  const next = await castNext(actor);
  assert.equal(next.ok, true, "after a Turn start the next Art is one Art in a new Turn, with no warning");
  assert.equal(bardOf(actor).active.index, 2);
});

/* ==========================================================================
   4. Turn end (C3:7112)
   ========================================================================== */

test("TE-1: a Turn that ends after the Performance started (its first Art counted) keeps the Performance going (C3:7112)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnEnd(actor, 1);
  assert.equal(B.isPerforming(actor), true, "an Art was cast this Turn, so the Performance continues");
  assert.ok(bardOf(actor).active, "active stays set");
});

test("TE-2: a Turn with no Art cast during the Performance ends the Performance (C3:7112)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnStart(actor, 2);
  await turnEnd(actor, 2);
  assert.equal(bardOf(actor).active, null, "no Art this Turn ends the Performance");
  assert.equal(B.isPerforming(actor), false);
  assert.equal(bardOf(actor).performances[0].performed, true, "the ended Performance stays performed (No Encore, C3:7114)");
});

test("TE-3: turnEnd for a Bard who is not performing is a no-op", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  const before = snap(actor, B);
  await turnEnd(actor, 3);
  assert.deepEqual(snap(actor, B), before, "an idle Bard's turn end changes nothing");
});

test("TE-4: ending the Performance at turn end resets Rising Crescendo and blocks an immediate restart (C3:7114, 7118)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 17, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  await turnStart(actor, 2);
  await castNext(actor);
  assertCrescendo(B, actor, 2, "two Arts into the Performance at level 17 gives crescendo 2");
  await turnStart(actor, 3);
  await turnEnd(actor, 3);
  assertCrescendo(B, actor, 0, "crescendo is only until the Performance ends");
  const restart = await startPerformance(actor, "perf-4");
  assertWarned(restart, "a finished Performance cannot be performed again");
});

/* ==========================================================================
   5. Rising Crescendo and Fortissimo (C3:7118-7122, 7161-7164)
   ========================================================================== */

test("CR-1: the first Art gives no Crescendo; the second Art gives +1 to all four benefits (C3:7118-7122)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  assertCrescendo(B, actor, 0, "the first Art gives no Crescendo");
  await turnStart(actor, 2);
  assert.equal((await castNext(actor)).ok, true);
  assertCrescendo(B, actor, 1, "the second Art gives Crescendo 1");
});

test("CR-2: the third Art stacks cumulatively to 2 below level 17 (C3:7118-7122)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  await turnStart(actor, 2);
  await castNext(actor);
  await turnStart(actor, 3);
  await castNext(actor);
  assertCrescendo(B, actor, 2, "Crescendo accumulates: 2 after three Arts below level 17");
});

test("CR-3: boundary 16 (no Fortissimo): two Arts give 1, three Arts give 2 (C3:7118, 7161-7164 absent)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 16, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  await turnStart(actor, 2);
  // Fortissimo below level 17 is a passive multiplier: the second Art is cast with no warning at all (accepted choice).
  const second = await castNext(actor);
  assert.equal(second.ok, true, "level 16: no Fortissimo warning on the second Art");
  assert.deepEqual(second.warnings, [], "level 16: no warnings on the second Art");
  assertCrescendo(B, actor, 1, "level 16: two Arts give Crescendo 1");
  await turnStart(actor, 3);
  await castNext(actor);
  assertCrescendo(B, actor, 2, "level 16: three Arts give Crescendo 2");
});

test("CR-4: boundary 17 (Fortissimo, C3:7161-7164): each Art after the first counts as two; two Arts give 2, three give 4", async () => {
  const B = await ready();
  const actor = makeBard({ level: 17, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  await turnStart(actor, 2);
  await castNext(actor);
  assertCrescendo(B, actor, 2, "level 17: the second Art counts as two, so Crescendo 2");
  await turnStart(actor, 3);
  await castNext(actor);
  assertCrescendo(B, actor, 4, "level 17: the third Art counts as two more, so Crescendo 4");
});

// Head ruling: Rising Crescendo applies from the second Art onward, including the LAST Art (C3:7118-7122). The effect
// stays on the Bard after the last Art as an expiring effect and is removed at the Bard's turn end (not at the last Art).
test("CR-5: the last Art's Crescendo is still in force at the last Art and clears at the Bard's turn end (C3:7118, 7112)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 17, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnStart(actor, 2);
  await castNext(actor);
  await turnStart(actor, 3);
  const last = await castNext(actor);
  assert.equal(last.ok, true, "the last Art of the Performance can be cast");
  assert.equal(B.isPerforming(actor), false, "casting the last Art ends the Performance");
  assert.ok(crescendoEffectOf(actor), "the last Art's Crescendo is still on the Bard after the last Art");
  await turnEnd(actor, 3);
  assertCrescendo(B, actor, 0, "the Crescendo clears at the Bard's turn end");
});

/** Three Arts of P3 cast in order: start (first Art), a Turn, the second Art, a Turn, the last Art. */
async function castThreeArts(level) {
  const actor = makeBard({ level, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnStart(actor, 2);
  await castNext(actor);
  await turnStart(actor, 3);
  const last = await castNext(actor);
  return { actor, last };
}

// The Rising Crescendo Active Effect carries the value in its changes and the expiring flag (head ruling).
const crescendoEffectOf = actor => Array.from(actor.effects?.values?.() ?? [])
  .find(effect => effect.flags?.ak5e?.bardCrescendo !== undefined) ?? null;
const crescendoEffectValue = effect => {
  const change = (effect?.changes ?? []).find(entry => entry.key === "system.bonuses.spell.dc");
  return change ? Number(change.value) : null;
};

test("CR-6: at the last Art (level 16, three Arts) the Crescendo effect carries 2 and the expiring flag", async () => {
  const { actor, last } = await castThreeArts(16);
  assert.equal(last.ok, true, "the last Art is cast");
  assert.equal(bardOf(actor).active, null, "active is null after the last Art's castNextArt");
  const effect = crescendoEffectOf(actor);
  assert.ok(effect, "the Bard still has the Rising Crescendo Active Effect after the last Art");
  assert.equal(crescendoEffectValue(effect), 2, "level 16: the last Art's Crescendo value is 2");
  assert.equal(effect.flags.ak5e.bardCrescendo.expiring, true, "the effect is marked expiring");
});

test("CR-7: at the last Art (level 17, Fortissimo, three Arts) the Crescendo effect carries 4 and the expiring flag", async () => {
  const { actor, last } = await castThreeArts(17);
  assert.equal(last.ok, true, "the last Art is cast");
  assert.equal(bardOf(actor).active, null, "active is null after the last Art's castNextArt");
  const effect = crescendoEffectOf(actor);
  assert.ok(effect, "the Bard still has the Rising Crescendo Active Effect after the last Art");
  assert.equal(crescendoEffectValue(effect), 4, "level 17: the last Art's Crescendo value is 4 (Fortissimo)");
  assert.equal(effect.flags.ak5e.bardCrescendo.expiring, true, "the effect is marked expiring");
});

test("CR-8: the Bard's turnEnd removes the expiring Crescendo effect (fresh module instance drives it)", async () => {
  const { actor, last } = await castThreeArts(17);
  assert.equal(last.ok, true);
  assert.ok(crescendoEffectOf(actor), "precondition: the expiring effect is on the Bard");
  await turnEnd(actor, 3);
  assert.equal(crescendoEffectOf(actor), null, "the turnEnd removes the expiring Crescendo effect");
});

/* ==========================================================================
   6. Last Art and ending (C3:7108-7112, R7 / concentration)
   ========================================================================== */

test("LA-1: after the last Art of the Performance is cast, the Performance ends (C3:7108)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnStart(actor, 2);
  await castNext(actor);
  assert.equal(B.isPerforming(actor), true, "the middle Art leaves the Performance running");
  await turnStart(actor, 3);
  await castNext(actor);
  assert.equal(bardOf(actor).active, null, "the last Art ends the Performance");
  assert.equal(bardOf(actor).performances[0].performed, true);
});

test("EP-1: endPerformance while not performing is refused and changes nothing", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  const before = snap(actor, B);
  assertRefused(await attempt(actor, "endPerformance", {}), "ending a Performance that is not running");
  assert.deepEqual(snap(actor, B), before);
});

test("EP-2: endPerformance without keepArt ends the Performance and keeps no Art (C3:7104-7105)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await startPerformance(actor, "perf-3");
  const outcome = await attempt(actor, "endPerformance", {});
  assert.equal(outcome.ok, true, "ending a running Performance succeeds");
  assert.equal(B.isPerforming(actor), false);
  assertCrescendo(B, actor, 0, "ending resets Crescendo");
});

test("EP-3: keepArt must name an Art that was cast; keepArt for an uncast Art is refused and changes nothing (C3:7104-7105)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await startPerformance(actor, "perf-3");
  const before = snap(actor, B);
  const outcome = await attempt(actor, "endPerformance", { keepArt: "Aid" });
  assert.equal(outcome.ok, false, "an Art not yet cast cannot be the one kept");
  assert.deepEqual(snap(actor, B), before, "the refused end must leave the Performance running");
  assert.equal(B.isPerforming(actor), true);
});

test("EP-4: keepArt naming the cast Art ends the Performance and succeeds (C3:7104-7105)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [PC()] });
  await startPerformance(actor, "perf-c");
  const outcome = await attempt(actor, "endPerformance", { keepArt: "Heroism" });
  assert.equal(outcome.ok, true, "keeping the cast Art is valid");
  assert.equal(B.isPerforming(actor), false);
});

test.todo("EP-5: how the kept Art's concentration is recorded (C3:7104-7105: 'choose one Art to maintain your Concentration') is not fixed by the contract; assert it once the recording field is named.");

/* ==========================================================================
   7. Manual Arts (R7, DECISIONS item 7)
   ========================================================================== */

test("MA-1: casting a manual Art posts a manual card with no mechanics and no roll; AP and effects are unchanged (R7)", async () => {
  await ready();
  const actor = makeBard({ level: 10, performances: [PM()] });
  await startPerformance(actor, "perf-m");
  // Rising Crescendo legitimately arrives with the second Art (C3:7118); the manual Art itself adds no effect.
  const before = messageCount(), effectsBefore = nonCrescendoEffects(actor), apBefore = apOf(actor);
  const outcome = await castNext(actor);
  assert.equal(outcome.ok, true, "the manual Art is composed in the Performance and can be cast");
  assert.ok(messageCount() > before, "the manual Art posts a card");
  assert.match(lastMessageText(), /Cause Fear/, "the card names the manual Art");
  assert.match(lastMessageText(), /manual|Bard missing Arts/i, "the card points at the manual ruling row (R7)");
  assert.deepEqual(nonCrescendoEffects(actor), effectsBefore, "a manual Art creates no effects of its own");
  assert.equal(apOf(actor), apBefore, "a manual Art costs no AP as a Performance Art");
  assert.equal(rollCalls.length, 0, "a manual Art never rolls");
});

test("MA-2: a manual Art as the first Art posts a manual card on start and never rolls (R7)", async () => {
  await ready();
  const actor = makeBard({ level: 1, performances: [perf("perf-manual-first", ["Cause Fear", "Bless", "Aid"])] });
  const effectsBefore = effectIds(actor);
  const outcome = await startPerformance(actor, "perf-manual-first");
  assert.equal(outcome.ok, true);
  assert.match(lastMessageText(), /Cause Fear/);
  assert.deepEqual(effectIds(actor), effectsBefore, "the first Art, manual or not, adds no effect (no Crescendo yet)");
  assert.equal(rollCalls.length, 0);
});

test.todo("MA-3: whether a manual Art counts toward Rising Crescendo (C3:7118 counts each Art cast; R7 says no mechanics). Ambiguous, so not asserted.");

/* ==========================================================================
   8. Font of Inspiration (level 4, C3:7146-7147, R4)
   ========================================================================== */

test("FO-1: level boundary 3/4: starting a Performance gives the special die at level 4 and not at level 3 (C3:7146-7147)", async () => {
  await ready();
  const at4 = makeBard({ level: 4, performances: [P3()] });
  await startPerformance(at4, "perf-3");
  assert.equal(bardOf(at4).fontDie, true, "level 4: beginning to Perform gives a Font of Inspiration die");
  const at3 = makeBard({ level: 3, performances: [P3()] });
  await startPerformance(at3, "perf-3");
  assert.equal(Boolean(bardOf(at3).fontDie), false, "level 3: the 4th-level feature is not yet held");
});

test("FO-2: at each Turn start while Performing the die is given again (C3:7146-7147)", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  assert.equal(bardOf(actor).fontDie, true);
  const target = foeActor("Ally");
  await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assert.equal(Boolean(bardOf(actor).fontDie), false, "giving the die spends it");
  await turnStart(actor, 2);
  assert.equal(bardOf(actor).fontDie, true, "a new Turn while Performing gives the die again");
});

test("FO-3: a Turn start while not Performing gives no Font die (C3:7146-7147)", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  await freshBard();
  await turnStart(actor, 2);
  assert.equal(Boolean(bardOf(actor).fontDie), false, "the die is only given while Performing");
});

test("FO-4: the Font die is lost at turn end even when the Performance continues (C3:7146-7147, R4 item 4)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  assert.equal(bardOf(actor).fontDie, true);
  await turnEnd(actor, 1);
  assert.equal(B.isPerforming(actor), true, "an Art was cast this Turn, so the Performance continues");
  assert.equal(Boolean(bardOf(actor).fontDie), false, "the unused Font die is lost at the end of the Turn");
});

test("FO-5: fontProvideAid gives an Aid Die to the target, consumes fontDie, and spends no pool Aid Die (R4)", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  await startPerformance(actor, "perf-3");
  const target = foeActor("Ally");
  const poolBefore = getPool(actor, "aidDie").value, apBefore = apOf(actor);
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assert.equal(outcome.ok, true, "a Font die can be given at level 4");
  assert.ok(Features.findAidDieEffect(target), "the target gains an Aid Die effect");
  assert.equal(Boolean(bardOf(actor).fontDie), false, "giving the Font die consumes it");
  assert.equal(getPool(actor, "aidDie").value, poolBefore, "the Font die is not drawn from the pool Aid Dice (R4)");
  assert.equal(apOf(actor), apBefore, "Provide Aid as a Font die costs no AP");
  assert.equal(B.isPerforming(actor), true, "giving the die does not end the Performance");
});

test("FO-6: fontProvideAid with no Font die on hand creates no Aid Die on the target", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P3()], fontDie: false });
  const target = foeActor("Ally");
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assert.equal(outcome.ok, false, "no die on hand must not give one");
  assert.equal(Features.findAidDieEffect(target), null, "no Aid Die appears on the target");
});

test("FO-7: the Font die is not limited by the pool: with no pool Aid Dice left it is still given (R4 item 4)", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P3()], fontDie: true });
  await setPool(actor, "aidDie", 0);
  const target = foeActor("Ally");
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assert.equal(outcome.ok, true, "the special die is outside the pool, so an empty pool does not block it");
  assert.equal(getPool(actor, "aidDie").value, 0, "the pool stays at 0");
  assert.equal(Boolean(bardOf(actor).fontDie), false);
});

test("FO-8: below level 4 fontProvideAid warns with a level warning (C3:7146)", async () => {
  await ready();
  const actor = makeBard({ level: 3, performances: [P3()], fontDie: true });
  const target = foeActor("Ally");
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assertWarned(outcome, "the Font die below level 4");
  assert.ok(hasLevelWarning(outcome.warnings), "the warning is a level warning (level 4 feature)");
});

test("FO-9: at level 4 fontProvideAid raises no level warning (C3:7146)", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P3()], fontDie: true });
  const target = foeActor("Ally");
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assert.equal(outcome.ok, true, "a level 4 Bard gives the die without a warning");
});

test("FO-10: an unowned target receives the Font Aid Die through the GM relay (WORKFLOW 3.2)", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P3()], fontDie: true });
  const unowned = foeActor("Unowned", { owner: false });
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: unowned.uuid, targetName: unowned.name, distance: 10 });
  assert.equal(outcome.ok, true, "a change to an unowned creature is relayed, not refused");
  assert.ok(Features.findAidDieEffect(unowned), "the GM relay places the Aid Die on the unowned target");
});

test.todo("FO-11: the Font die's size (C3:7147 'a Special Aid Die' names no size; the Bard's Aid Die size is assumed elsewhere). Not asserted until the source size is confirmed.");
test.todo("FO-12: how the Font die interacts with the one-die-per-creature cap on regular Provide Aid (R4 says the Font die does not count toward the cap; the interaction is not specified).");
test.todo("FO-13: a Bonus-Action Art in Time Signature (C3:7110 'its usual Action Cost' vs C3:7149-7150): whether a Bonus-Action cast consumes the Action or a Bonus Action is not modelled. Not asserted.");

/* ==========================================================================
   9. Cancel, undo and receipts (WORKFLOW 3.2: every change undoable in the encounter window)
   ========================================================================== */

test("UN-1: undoing the start restores active, performed, fontDie, AP, effects and crescendo exactly", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  const before = snap(actor, B);
  const outcome = await startPerformance(actor, "perf-3");
  assert.equal(outcome.ok, true);
  assert.equal(B.isPerforming(actor), true);
  // Start is two uses in the UI flow (start, then the first Art). Undo the first Art, then the start.
  assert.equal(outcome.firstCast?.ok, true, "the first Art is cast after the start");
  await Uses.supporterUses.undo(actor, outcome.firstCast.opId);
  await Uses.supporterUses.undo(actor, outcome.opId);
  assert.deepEqual(snap(actor, B), before, "undo restores every observable of the start");
  assert.equal(B.isPerforming(actor), false);
});

test("UN-2: undoing the second Art restores active and the crescendo effect exactly", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnStart(actor, 2);
  const beforeCast = snap(actor, B);
  const cast = await castNext(actor);
  assert.equal(cast.ok, true);
  assertCrescendo(B, actor, 1, "the second Art gives crescendo before the undo");
  await Uses.supporterUses.undo(actor, cast.opId);
  assert.deepEqual(snap(actor, B), beforeCast, "undo restores active and the Crescendo effect exactly");
  assertCrescendo(B, actor, 0, "the crescendo bonuses return to 0");
});

test("UN-3: undoing fontProvideAid restores fontDie, removes the target's Aid Die and leaves the pool unchanged", async () => {
  const B = await ready();
  const actor = makeBard({ level: 4, performances: [P3()] });
  await startPerformance(actor, "perf-3");
  const target = foeActor("Ally");
  const before = snap(actor, B, [target]);
  const outcome = await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  assert.equal(outcome.ok, true);
  assert.ok(Features.findAidDieEffect(target));
  await Uses.supporterUses.undo(actor, outcome.opId);
  assert.equal(Features.findAidDieEffect(target), null, "the Aid Die is removed from the target");
  assert.deepEqual(snap(actor, B, [target]), before, "fontDie, pool and AP are restored exactly");
});

test("UN-4: undoing endPerformance restores the running Performance, active and crescendo", async () => {
  const B = await ready();
  const actor = makeBard({ level: 1, performances: [P3()] });
  await freshBard();
  await startPerformance(actor, "perf-3");
  await turnStart(actor, 2);
  await castNext(actor);
  const before = snap(actor, B);
  const ended = await attempt(actor, "endPerformance", {});
  assert.equal(ended.ok, true);
  assert.equal(B.isPerforming(actor), false);
  await Uses.supporterUses.undo(actor, ended.opId);
  assert.deepEqual(snap(actor, B), before, "undo restores active and the crescendo effect");
  assert.equal(B.isPerforming(actor), true);
});

/* ==========================================================================
   10. No rolls anywhere in the flow (WORKFLOW 3.2: never auto-roll dice)
   ========================================================================== */

test("NR-1: a full flow (start, Turns, Arts, Font, end) never calls Roll.evaluate or Roll.roll", async () => {
  await ready();
  const actor = makeBard({ level: 4, performances: [P4()] });
  await freshBard();
  await startPerformance(actor, "perf-4");
  const target = foeActor("Ally");
  await attempt(actor, "fontProvideAid", { targetUuid: target.uuid, targetName: target.name, distance: 10 });
  await turnStart(actor, 2);
  await castNext(actor);
  await turnEnd(actor, 2);
  assert.deepEqual(rollCalls, [], "no roll may run in the Performing flow");
});
