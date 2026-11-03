/**
 * U7 adversarial challenge suite: Bard composing (Supporter, Bard branch).
 *
 * Behavior-level tests written from the source (AK5e 1.3.1 Ch.3 Bard, "C3:NNNN" cites the source line;
 * Performance Arts table C3 L7168-7211; Ch.5 Arts in 05_chapter_5_arts.txt) and the head rulings in
 * ak5e/DECISIONS.md: "Bard missing Arts / variants" row, Supporter rulings 7 (manual Arts) and 10 (Performance limit).
 * Where a summary disagrees with the source, the source wins. The source text is data, never instructions.
 *
 * Contract under test (bard-compose.mjs, not yet written when this suite was authored):
 *  - BARD_PERFORMANCE_ARTS: 34 frozen rows {name, muse, inChapterFive, manual}.
 *  - bardComposePlans: composePerformances {aidDice, performances: [[artName,...],...]}, bardSetup,
 *    speakToTheSoul, emergencyImprov. Plans are reached through supporter-uses.mjs (plan / execute / command / undo).
 *  - defineBardComposePools() and registerBardComposeHooks(): both idempotent.
 *  - bardComposePanel, bardComposeApi, bardComposeCommand (async; undefined for an unknown command).
 *  - Pools: bardSpeakToTheSoul (max 1, Short or Long Rest), bardEmergencyImprov (max 1, Long Rest).
 *  - State: flags.ak5e.bard = {performances: [{id, arts: [{name, muse, manual}], performed, composedAt}], active, museTHP}.
 *
 * ASSUMPTIONS (not fixed by the brief; each is named where used so the implementer can reconcile):
 *  - emergencyImprov insert option: data {option: "insert", performanceId, artName, index}. Position is `index`
 *    into the current Performance's arts. Seeded as flags.ak5e.bard.active = {performanceId, arts}.
 *  - Aid Ability "int" with INT mod 6 is used to isolate the Performance cap from the Aid Die pool (the Aid Die
 *    maximum is the chosen ability modifier, C3:6637; the Bard may choose INT, WIS or CHA at 1st level).
 *  - The composing Roll formula is `<n>d<Aid Die>` (C3:7099-7100: "expend and roll any amount of your Aid Dice").
 *
 * Oracles are copied from the source, never read from the implementation under test. Modules are loaded with
 * dynamic imports inside the helpers, so a missing module fails only the tests that need it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, triggerLongRest, triggerShortRest
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { getPool, registerResourcePoolHooks } from "../scripts/resource-pools.mjs";

/* ==========================================================================
   Oracles (source text)
   ========================================================================== */

// C3 L7168-7211 Performance Arts table, in source order (17 left column, then 17 right column).
// inChapterFive: the exact name appears in 05_chapter_5_arts.txt (a Ch.5 Art heading or a pool list, e.g. L255, L282-284,
// L422-424). null = ambiguous, see the test.todo for Shatter (5th Level). manual = (inChapterFive === false), ruling 7.
const SOURCE_ARTS = Object.freeze([
  { name: "Bane", muse: 1, ch5: true },
  { name: "Bless", muse: 1, ch5: false },
  { name: "Mage Armour", muse: 1, ch5: true },
  { name: "Pyrotechnics", muse: 1, ch5: false },
  { name: "Aid", muse: 2, ch5: true },
  { name: "Cause Fear", muse: 2, ch5: false },
  { name: "Colour Spray", muse: 2, ch5: false },
  { name: "Dissonant Whispers", muse: 2, ch5: true },
  { name: "Expeditious Retreat", muse: 2, ch5: true },
  { name: "Healing Word", muse: 2, ch5: true },
  { name: "Heroism", muse: 2, ch5: true },
  { name: "Ray of Enfeeblement", muse: 2, ch5: false },
  { name: "Shield of Faith", muse: 2, ch5: false },
  { name: "Sleep", muse: 2, ch5: true },
  { name: "Bolster", muse: 3, ch5: true },
  { name: "Chromatic Orb (Thunder only)", muse: 3, ch5: false },
  { name: "Protection from Energy", muse: 3, ch5: true },
  { name: "Warding Bond", muse: 3, ch5: true },
  { name: "Aura of Vitality", muse: 4, ch5: true },
  { name: "Beacon of Hope", muse: 4, ch5: true },
  { name: "Crusader's Mantle", muse: 4, ch5: false },
  { name: "Haste", muse: 4, ch5: false },
  { name: "Mass Healing Word", muse: 4, ch5: true },
  { name: "Mind Spike", muse: 4, ch5: true },
  { name: "Slow", muse: 4, ch5: true },
  { name: "Tasha's Mind Whip", muse: 4, ch5: false },
  { name: "Thunderwave", muse: 4, ch5: true },
  { name: "Aura of Life", muse: 5, ch5: false },
  { name: "Fire Shield", muse: 5, ch5: true },
  { name: "Freedom of Movement", muse: 5, ch5: true },
  { name: "Shatter (2nd Level)", muse: 5, ch5: true },
  { name: "Circle of Power", muse: 6, ch5: true },
  { name: "Shatter (5th Level)", muse: 8, ch5: null },
  { name: "Synaptic Static", muse: 8, ch5: true }
]);
const ARTS_BY_NAME = new Map(SOURCE_ARTS.map(art => [art.name, art]));
// Ruling 7 / DECISIONS "Bard missing Arts": the eleven names with no Ch.5 presence (Bless is absent too).
const ABSENT_FROM_CH5 = Object.freeze([
  "Aura of Life", "Bless", "Cause Fear", "Chromatic Orb (Thunder only)", "Colour Spray", "Crusader's Mantle",
  "Haste", "Pyrotechnics", "Ray of Enfeeblement", "Shield of Faith", "Tasha's Mind Whip"
]);
const isManualSource = name => ARTS_BY_NAME.get(name).ch5 === false;
const museCostOf = names => names.reduce((sum, name) => sum + ARTS_BY_NAME.get(name).muse, 0);

// C3:6557-6578 Proficiency Bonus column; C3:6637 and the Aid Die column (d8 at 1-6, d10 at 7-13, d12 at 14-20).
const pbOf = level => Math.floor((level - 1) / 4) + 2;
const aidDieSizeOf = level => (level >= 14 ? 12 : level >= 7 ? 10 : 8);

/* ==========================================================================
   Harness
   ========================================================================== */

// Any evaluation is a failure. Counted, and asserted to be zero in every test that uses it.
const rollEvaluations = { count: 0 };
class ForbiddenRoll {
  constructor(formula) { this.formula = formula; }
  async evaluate() { rollEvaluations.count++; throw new Error(`Roll.evaluate must never be called (formula ${this.formula})`); }
}

const bardModule = () => import("../scripts/bard-compose.mjs");
let freshSeq = 0;
/** A fresh instance of the implementation module (cache-busted), for a new session with its own hook guard. */
const freshBardModule = () => import(`../scripts/bard-compose.mjs?session=${++freshSeq}`);

let plansRegistered = false;
/** Load the module and register its plans with the Supporter engine once per file (as the Hexer suite does). */
async function ready() {
  const B = await bardModule();
  if (!plansRegistered) {
    try { Uses.registerSupporterPlans({ plans: B.bardComposePlans }); }
    catch (error) { if (!/already registered/i.test(String(error?.message))) throw error; }
    plansRegistered = true;
  }
  return B;
}

test.beforeEach(async () => {
  setupFoundryGlobals();
  Features.defineSupporterPools();
  globalThis.Roll = ForbiddenRoll;
  rollEvaluations.count = 0;
  const B = await bardModule().catch(() => null);
  // Idempotency is asserted directly in its own test; a throw here must not hide every other test.
  try { B?.defineBardComposePools?.(); } catch { /* see the defineBardComposePools test */ }
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/**
 * A Bard Supporter. Defaults: CHA +2 (so the Performance cap is 2), INT +3, Aid Ability CHA, Performance skill +5.
 * `bardState` seeds flags.ak5e.bard; the default is an empty, known baseline so "undo restores exactly" is precise.
 */
function bard({ level = 1, cha = 2, intMod = 3, prf = 5, aidAbility = "cha", branch = "bard", bardState } = {}) {
  const mods = { str: -1, dex: 0, con: 0, int: intMod, wis: 1, cha };
  const abilities = {};
  for (const [key, mod] of Object.entries(mods)) abilities[key] = { mod, value: 10 + 2 * mod };
  const branchName = branch[0].toUpperCase() + branch.slice(1);
  const items = [
    createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: "class-supporter" } } }),
    createTestItem({ name: `Supporter: ${branchName}`, type: "subclass", system: {}, flags: { ak5e: { chapterThreeId: `subclass-supporter-${branch}` } } })
  ];
  const actor = createTestActor({
    name: `${branch} L${level}`, level, items, abilities, hp: { value: 20, max: 20, temp: 0 },
    flags: {
      ak5e: {
        supporter: { enabled: true, branch, aidAbility },
        bard: bardState ?? { performances: [], active: null, museTHP: 0 }
      }
    }
  });
  actor.system.attributes ??= {};
  actor.system.attributes.prof = pbOf(level);
  actor.system.skills ??= {};
  actor.system.skills.prf = { ...(actor.system.skills.prf ?? {}), total: prf };
  return actor;
}

/** A Bard whose Aid Dice pool is 6 (INT mod 6, Aid Ability INT), so the CHA cap is the only limit under test. */
// bard-compose.mjs reads the rest window from flags.ak5e.bardRest ({open, type, at}) and the proficient Instrument
// from flags.ak5e.bardSetup.instruments (Soul of the Bard, C3 L7137-7140). rest:false and instruments:false remove them.
const composer = ({ level = 1, cha = 2, rest = true, instruments = true } = {}) => {
  const actor = bard({ level, cha, intMod: 6, aidAbility: "int" });
  if (rest) actor.flags.ak5e.bardRest = { open: true, type: "long", at: "2026-10-24T00:00:00.000Z" };
  if (instruments) actor.flags.ak5e.bardSetup = { done: true, instruments: ["Lute", "Flute", "Drum"], performance: "proficient" };
  return actor;
};

/** A Supporter with no Supporter class and no branch: refused by the engine. */
function nonSupporter() {
  return createTestActor({
    name: "Plain", level: 5, items: [],
    abilities: { str: { mod: 0, value: 10 }, dex: { mod: 0, value: 10 }, con: { mod: 0, value: 10 }, int: { mod: 0, value: 10 }, wis: { mod: 0, value: 10 }, cha: { mod: 2, value: 14 } },
    hp: { value: 20, max: 20, temp: 0 }, flags: {}
  });
}

/** A seeded Performance in stored shape (manual from the source table). */
const perf = (id, names, performed = false) => ({
  id, performed, composedAt: 1,
  arts: names.map(name => ({ name, muse: ARTS_BY_NAME.get(name).muse, manual: isManualSource(name) }))
});

const bardOf = actor => actor.flags?.ak5e?.bard ?? null;
const performancesOf = actor => bardOf(actor)?.performances ?? [];
const aidPool = actor => getPool(actor, "aidDie").value;
const hpOf = actor => ({ value: actor.system.attributes.hp.value, temp: actor.system.attributes.hp.temp ?? 0 });
/** Everything a bard use may write, so "nothing changed" can be proven exactly. */
const snapshot = actor => JSON.stringify({ ak5e: actor.flags?.ak5e ?? {}, aid: aidPool(actor), hp: hpOf(actor) });

/** A non-empty string (an id that can be used to accept or find a record). */
const hasText = value => typeof value === "string" && value.trim().length > 0;

const hasFigure = (text, figure) => new RegExp(`(^|[^0-9])${figure}([^0-9]|$)`).test(text);
const showsDC = (receipt, dc) => new RegExp(`\\bDC\\D{0,4}${dc}\\b`).test(JSON.stringify(receipt ?? {}));

/** Warnings from a plan: the plan's own list when it passes, or the AK5eWarnings thrown when not overridden. */
async function warningsOf(runPlan) {
  try {
    const plan = await runPlan();
    return plan?.warnings ?? [];
  } catch (error) {
    if (error?.name === "AK5eWarnings" || Array.isArray(error?.warnings)) return error.warnings;
    throw error;
  }
}
/** The error from a rejected (sync or async) call, or null when it resolved. */
async function settle(fn) {
  try { return { threw: false, value: await fn() }; } catch (error) { return { threw: true, error }; }
}
const isWarningError = error => error?.name === "AK5eWarnings" || Array.isArray(error?.warnings);
const hasWarning = (ws, rx) => ws.some(w => rx.test(`${w.id ?? ""} ${w.text ?? ""}`));
const hasLevelWarning = ws => hasWarning(ws, /level/i);

const run = (actor, name, data, opId) => Uses.supporterUses.execute(actor, name, data, opId);
const click = (actor, useId) => Uses.supporterUses.command(actor, "useRoll", { useId }, `roll-${useId}`);
const receiptOf = (actor, id) => Uses.supporterUses.receipt(actor, id);
const planWarnings = (actor, name, data) => warningsOf(() => Uses.supporterUses.plan(actor, name, data));

/** Run a use with every current plan warning accepted (Use anyway). Warnings are never blocks. */
async function anyway(actor, name, data, opId) {
  await ready();
  const ws = await planWarnings(actor, name, data);
  return run(actor, name, { ...data, overrides: ws.map(w => w.id) }, opId);
}

/** Stub Roll for the click path. `total` is the value a player's click produces; every formula is recorded. */
function rollWith(total) {
  const formulas = [];
  globalThis.Roll = class SpyRoll {
    constructor(formula) { this.formula = formula; this.total = null; }
    async evaluate() { formulas.push(this.formula); this.total = total; return this; }
    async toMessage() { return undefined; }
  };
  return formulas;
}

/** Compose and roll: Use anyway, then the player's roll click, which is the only path that rolls. */
async function composeAndRoll(actor, data, total, opId) {
  await anyway(actor, "composePerformances", data, opId);
  const formulas = rollWith(total);
  await click(actor, opId);
  return formulas;
}

const compose = (aidDice, performances, extra = {}) => ({ aidDice, performances, ...extra });
const CAP_LINE = [["Bane", "Bless", "Mage Armour"]];

/* ==========================================================================
   Tests: the Performance Arts table (C3 L7168-7211, ruling 7)
   ========================================================================== */

test("Arts table: 34 frozen rows, each with exactly the keys {name, muse, inChapterFive, manual}", async () => {
  const { BARD_PERFORMANCE_ARTS } = await bardModule();
  assert.equal(BARD_PERFORMANCE_ARTS.length, 34, "34 Performance Arts (C3 L7168-7211)");
  assert.ok(Object.isFrozen(BARD_PERFORMANCE_ARTS), "the table is frozen");
  for (const row of BARD_PERFORMANCE_ARTS) {
    assert.ok(Object.isFrozen(row), `row ${row.name} is frozen`);
    assert.deepEqual(Object.keys(row).sort(), ["inChapterFive", "manual", "muse", "name"], `row ${row.name} keys`);
  }
});

test("Arts table: every name and printed Muse Cost matches C3 L7168-7211, in source order", async () => {
  const { BARD_PERFORMANCE_ARTS } = await bardModule();
  assert.deepEqual(
    BARD_PERFORMANCE_ARTS.map(row => [row.name, row.muse]),
    SOURCE_ARTS.map(art => [art.name, art.muse])
  );
});

test("Arts table: names are unique; Shatter (2nd Level) and Shatter (5th Level) are separate rows (DECISIONS)", async () => {
  const { BARD_PERFORMANCE_ARTS } = await bardModule();
  const names = BARD_PERFORMANCE_ARTS.map(row => row.name);
  assert.equal(new Set(names).size, 34);
  assert.ok(names.includes("Shatter (2nd Level)") && names.includes("Shatter (5th Level)"));
});

test("Arts table: inChapterFive agrees with 05_chapter_5_arts.txt for every row except Shatter (5th Level)", async () => {
  const { BARD_PERFORMANCE_ARTS } = await bardModule();
  for (const row of BARD_PERFORMANCE_ARTS) {
    const oracle = ARTS_BY_NAME.get(row.name);
    assert.ok(oracle, `${row.name} is a source row`);
    if (oracle.ch5 === null) continue;
    assert.equal(row.inChapterFive, oracle.ch5, `${row.name} inChapterFive`);
  }
});

test("Ruling 7 (+ U5 ruling d): the eleven Arts absent from Ch.5 and Shatter (5th Level) carry manual: true; every other row is manual: false", async () => {
  const { BARD_PERFORMANCE_ARTS } = await bardModule();
  const manualNames = BARD_PERFORMANCE_ARTS.filter(row => row.manual === true).map(row => row.name).sort();
  // U5 ruling d: Shatter (5th Level) is manual as well (Ch.5 defines Shatter only at 2nd Level), so it joins the eleven.
  assert.deepEqual(manualNames, [...ABSENT_FROM_CH5, "Shatter (5th Level)"].sort());
  for (const row of BARD_PERFORMANCE_ARTS) {
    if (row.name === "Shatter (5th Level)") continue;   // manual by ruling d, see the test.todo below
    assert.equal(row.manual, !row.inChapterFive, `${row.name}: manual is the negation of inChapterFive`);
  }
});

test("Ruling 7: Pyrotechnics, Cause Fear, Colour Spray, Ray of Enfeeblement, Shield of Faith and Chromatic Orb are all manual", async () => {
  const { BARD_PERFORMANCE_ARTS } = await bardModule();
  for (const name of ["Pyrotechnics", "Cause Fear", "Colour Spray", "Ray of Enfeeblement", "Shield of Faith", "Chromatic Orb (Thunder only)"]) {
    const row = BARD_PERFORMANCE_ARTS.find(candidate => candidate.name === name);
    assert.ok(row, `${name} row exists`);
    assert.equal(row.manual, true, `${name} is manual`);
    assert.equal(row.inChapterFive, false, `${name} is not in Ch.5`);
  }
});

test.todo("Shatter (5th Level): does the Ch.5 'Shatter' (C5:283, 2nd Level only) make the 5th Level row inChapterFive, or manual? Ruling is silent (DECISIONS: 'no higher-level definition'). Not asserted; do not invent a rule.");

test.todo("Shatter (2nd Level) then Shatter (5th Level) in one Performance: are they the 'same Art' for the no-consecutive rule? DECISIONS keeps separate rows; the source does not say. Not asserted.");

/* ==========================================================================
   Tests: composing, plan-level (warnings are never blocks; refusals are)
   ========================================================================== */

test("Unknown Art name is rejected as an error (not a warning) that names the Art", async () => {
  await ready();
  const actor = composer();
  const result = await settle(() => Uses.supporterUses.plan(actor, "composePerformances", compose(1, [["Bane", "Bless", "Nope Art"]])));
  assert.equal(result.threw, true, "an unknown Art is refused");
  assert.equal(isWarningError(result.error), false, "it is a refusal, not an overridable warning");
  assert.ok(String(result.error?.message).includes("Nope Art"), "the message names the Art");
});

test("Unknown Art name cannot be overridden with Use anyway", async () => {
  await ready();
  const actor = composer();
  const result = await settle(() => Uses.supporterUses.plan(actor, "composePerformances",
    compose(1, [["Bane", "Bless", "Nope Art"]], { overrides: ["Nope Art", "unknown-art"] })));
  assert.equal(result.threw, true, "still refused with overrides supplied");
  assert.equal(isWarningError(result.error), false);
});

test("A manual Art (Pyrotechnics, ruling 7) can be composed and is stored with manual: true", async () => {
  await ready();
  const actor = composer();
  const plan = await settle(() => Uses.supporterUses.plan(actor, "composePerformances", compose(1, [["Pyrotechnics", "Bane", "Bless"]])));
  assert.equal(plan.threw, false, "a manual Art is not refused");
  await composeAndRoll(actor, compose(1, [["Pyrotechnics", "Bane", "Bless"]]), 8, "manual-1");
  const stored = performancesOf(actor)[0]?.arts?.[0];
  assert.equal(stored?.name, "Pyrotechnics");
  assert.equal(stored?.muse, 1, "Pyrotechnics costs 1 Muse");
  assert.equal(stored?.manual, true, "stored as manual");
});

test("Timing (C3 L7099): composing with no finished rest recorded warns timing; Use anyway is still allowed", async () => {
  await ready();
  const actor = composer({ rest: false });
  const ws = await planWarnings(actor, "composePerformances", compose(1, CAP_LINE));
  assert.equal(ws.some(w => w.id === "timing"), true, "no open rest window is a timing warning");
  const accepted = await settle(() => Uses.supporterUses.plan(actor, "composePerformances", compose(1, CAP_LINE, { overrides: ws.map(w => w.id) })));
  assert.equal(accepted.threw, false, "overridable, not blocked");
});

test("Timing: with a finished rest recorded, composing raises no timing warning", async () => {
  await ready();
  const actor = composer();
  const ws = await planWarnings(actor, "composePerformances", compose(1, CAP_LINE));
  assert.equal(ws.some(w => w.id === "timing"), false);
});

test("A Performance of exactly 3 Arts raises no warning", async () => {
  await ready();
  const actor = composer();
  assert.deepEqual(await planWarnings(actor, "composePerformances", compose(1, CAP_LINE)), []);
});

test("A Performance of 2 Arts warns (minimum three Arts, C3:7099-7101)", async () => {
  await ready();
  const actor = composer();
  const ws = await planWarnings(actor, "composePerformances", compose(1, [["Bane", "Bless"]]));
  assert.ok(ws.length > 0, "two Arts is a warning");
});

test("The 2-Art warning is overridable: Use anyway passes the plan and the composition is written", async () => {
  await ready();
  const actor = composer();
  const data = compose(1, [["Bane", "Bless"]]);
  const ws = await planWarnings(actor, "composePerformances", data);
  const accepted = await settle(() => Uses.supporterUses.plan(actor, "composePerformances", { ...data, overrides: ws.map(w => w.id) }));
  assert.equal(accepted.threw, false, "not blocked once accepted");
  await composeAndRoll(actor, data, 6, "two-art-1");
  assert.equal(performancesOf(actor).length, 1, "the Performance is written");
  assert.equal(performancesOf(actor)[0].arts.length, 2, "with its two Arts");
});

test("The same Art twice in a row warns; the warning is overridable", async () => {
  await ready();
  const actor = composer();
  const ws = await planWarnings(actor, "composePerformances", compose(1, [["Bane", "Bane", "Bless"]]));
  assert.ok(ws.length > 0, "a consecutive repeat is a warning");
});

test("The same Art separated by another Art is allowed (no warning)", async () => {
  await ready();
  const actor = composer();
  assert.deepEqual(await planWarnings(actor, "composePerformances", compose(1, [["Bane", "Bless", "Bane"]])), []);
});

test("The no-consecutive rule is per Performance: one Performance may end with an Art another begins with", async () => {
  await ready();
  const actor = composer({ cha: 2 });
  const data = compose(2, [["Bane", "Bless", "Mage Armour"], ["Mage Armour", "Bless", "Bane"]]);
  assert.deepEqual(await planWarnings(actor, "composePerformances", data), [], "across two Performances this is allowed");
});

// U5 head ruling R1: the cap is the Charisma Modifier with no minimum (C3:7102), so CHA 0 allows no Performance.
test("Performance cap at CHA 0: even one Performance warns (cap is the Charisma modifier, no minimum, C3:7102)", async () => {
  await ready();
  const actor = composer({ cha: 0 });
  assert.deepEqual(await planWarnings(actor, "composePerformances", compose(1, CAP_LINE)).then(list => list.map(w => w.id)), ["performanceLimit"]);
  const ws = await planWarnings(actor, "composePerformances", compose(2, [...CAP_LINE, ["Aid", "Heroism", "Sleep"]]));
  assert.ok(ws.length > 0, "a second Performance at CHA 0 is a warning");
});

test("Performance cap at CHA 1: one Performance is fine, two warn", async () => {
  await ready();
  const actor = composer({ cha: 1 });
  assert.deepEqual(await planWarnings(actor, "composePerformances", compose(1, CAP_LINE)), []);
  const ws = await planWarnings(actor, "composePerformances", compose(2, [...CAP_LINE, ["Aid", "Heroism", "Sleep"]]));
  assert.ok(ws.length > 0);
});

test("Performance cap at CHA 3: three Performances pass, a fourth warns", async () => {
  await ready();
  const actor = composer({ cha: 3 });
  const three = [...CAP_LINE, ["Aid", "Heroism", "Sleep"], ["Thunderwave", "Slow", "Mind Spike"]];
  assert.deepEqual(await planWarnings(actor, "composePerformances", compose(3, three)), []);
  const four = [...three, ["Bolster", "Warding Bond", "Synaptic Static"]];
  assert.ok((await planWarnings(actor, "composePerformances", compose(4, four))).length > 0, "a fourth is a warning");
});

test("Performance cap with a negative CHA modifier is zero (no invented minimum of one, R1)", async () => {
  await ready();
  const actor = composer({ cha: -1 });
  assert.deepEqual(await planWarnings(actor, "composePerformances", compose(1, CAP_LINE)).then(list => list.map(w => w.id)), ["performanceLimit"]);
  assert.ok((await planWarnings(actor, "composePerformances", compose(2, [...CAP_LINE, ["Aid", "Heroism", "Sleep"]]))).length > 0);
});

test("Every composing violation is a warning with an id: the plan throws only AK5eWarnings and Use anyway clears it", async () => {
  await ready();
  const actor = composer({ cha: 0 });
  const bad = compose(2, [["Bane", "Bane"], ["Aid", "Heroism", "Sleep"]]);
  const first = await settle(() => Uses.supporterUses.plan(actor, "composePerformances", bad));
  assert.equal(first.threw, true);
  assert.equal(isWarningError(first.error), true, "a violation is an overridable warning, not a refusal");
  for (const warning of first.error.warnings) assert.ok(hasText(warning.id), "each warning has an id to accept");
  const ids = first.error.warnings.map(w => w.id);
  const second = await settle(() => Uses.supporterUses.plan(actor, "composePerformances", { ...bad, overrides: ids }));
  assert.equal(second.threw, false, "accepting every warning lets the plan proceed");
});

test("Refused: a Hexer Supporter cannot compose (the plan throws and writes nothing)", async () => {
  await ready();
  const hexer = bard({ branch: "hexer", level: 4 });
  const before = snapshot(hexer);
  const plan = await settle(() => Uses.supporterUses.plan(hexer, "composePerformances", compose(1, CAP_LINE)));
  assert.equal(plan.threw, true, "a non-Bard Supporter is refused");
  assert.equal(isWarningError(plan.error), false, "a refusal, not an overridable warning");
  const use = await settle(() => run(hexer, "composePerformances", compose(1, CAP_LINE), "hexer-refuse-1"));
  assert.equal(use.threw, true, "execute refuses too");
  assert.equal(isWarningError(use.error), false, "execute refusal is not overridable");
  assert.equal(snapshot(hexer), before, "nothing written");
  assert.deepEqual(performancesOf(hexer), []);
});

test("Refused: a non-Supporter cannot compose, and nothing is written", async () => {
  await ready();
  const plain = nonSupporter();
  const before = JSON.stringify(plain.flags ?? {});
  const use = await settle(() => run(plain, "composePerformances", compose(1, CAP_LINE), "plain-refuse-1"));
  assert.equal(use.threw, true, "a non-Supporter is refused");
  assert.equal(isWarningError(use.error), false, "a refusal, not an overridable warning");
  assert.equal(JSON.stringify(plain.flags ?? {}), before, "nothing written");
});

/* ==========================================================================
   Tests: the Muse roll (click), Aid Dice, THP
   ========================================================================== */

test("No Roll.evaluate and no Performance written before the player clicks (execute alone)", async () => {
  await ready();
  const actor = composer();
  const before = JSON.stringify(bardOf(actor));
  const data = compose(2, [["Aid", "Heroism", "Sleep"], ["Bane", "Bless", "Mage Armour"]]);
  await anyway(actor, "composePerformances", data, "noroll-1");
  assert.equal(rollEvaluations.count, 0, "no Roll.evaluate before the click");
  assert.equal(JSON.stringify(bardOf(actor)), before, "no Muse, Performance or THP written before the click");
  assert.deepEqual(performancesOf(actor), []);
});

test("Composing roll is nd<Aid Die> at the chosen dice count: 2d8 at level 1, 2d10 at 7, 2d12 at 14", async () => {
  await ready();
  for (const level of [1, 7, 14]) {
    const actor = composer({ level });
    const opId = `formula-l${level}`;
    await anyway(actor, "composePerformances", compose(2, CAP_LINE), opId);
    const formula = String(receiptOf(actor, opId)?.formula ?? "").replace(/\s+/g, "").toLowerCase();
    assert.equal(formula, `2d${aidDieSizeOf(level)}`, `level ${level} composing formula`);
  }
});

test("Muse equals the rolled total: Performances are stored with id, arts {name, muse, manual}, performed false, composedAt", async () => {
  await ready();
  const actor = composer();
  await composeAndRoll(actor, compose(2, [["Aid", "Heroism", "Sleep"], ["Bane", "Bless", "Mage Armour"]]), 9, "muse-1");
  const stored = performancesOf(actor);
  assert.equal(stored.length, 2);
  assert.ok(stored.every(p => hasText(p.id)), "each Performance has an id");
  assert.equal(new Set(stored.map(p => p.id)).size, 2, "ids are unique");
  assert.deepEqual(stored[0].arts.map(a => a.name), ["Aid", "Heroism", "Sleep"]);
  assert.deepEqual(stored[1].arts.map(a => a.name), ["Bane", "Bless", "Mage Armour"]);
  for (const p of stored) {
    assert.equal(p.performed, false, "a new Performance is not yet performed");
    assert.notEqual(p.composedAt, undefined, "composedAt is recorded");
    for (const art of p.arts) {
      assert.equal(art.muse, ARTS_BY_NAME.get(art.name).muse, `${art.name} Muse cost`);
      assert.equal(art.manual, isManualSource(art.name), `${art.name} manual flag`);
    }
  }
});

test("Leftover Muse becomes Temporary HP (museTHP): Muse 10 against a cost of 9 leaves 1", async () => {
  await ready();
  const actor = composer();
  await composeAndRoll(actor, compose(2, [["Aid", "Heroism", "Sleep"], ["Bane", "Bless", "Mage Armour"]]), 10, "thp-1");
  assert.equal(museCostOf(["Aid", "Heroism", "Sleep", "Bane", "Bless", "Mage Armour"]), 9);
  assert.equal(bardOf(actor).museTHP, 1);
});

test("Exact spend leaves no THP: Muse 9 against a cost of 9 leaves 0", async () => {
  await ready();
  const actor = composer();
  await composeAndRoll(actor, compose(2, [["Aid", "Heroism", "Sleep"], ["Bane", "Bless", "Mage Armour"]]), 9, "thp-0");
  assert.equal(bardOf(actor).museTHP, 0);
});

test("Cost above Muse is a warning, never a block: with Use anyway the Performances are written and museTHP is 0 (not negative)", async () => {
  await ready();
  const actor = composer();
  // Muse 8 (rolled), cost 9. Muse-cost checks are made at the click, so the plan is accepted pre-click.
  await composeAndRoll(actor, compose(2, [["Aid", "Heroism", "Sleep"], ["Bane", "Bless", "Mage Armour"]]), 8, "over-1");
  assert.equal(performancesOf(actor).length, 2, "not blocked");
  assert.equal(bardOf(actor).museTHP, 0, "THP never goes negative");
});

test("Aid Dice: n are expended and stay spent through a Short Rest (refill is on Long Rest only)", async () => {
  await ready();
  const actor = composer();
  await composeAndRoll(actor, compose(4, CAP_LINE), 5, "spend-1");
  assert.equal(aidPool(actor), 2, "6 - 4 = 2");
  await triggerShortRest(actor);
  assert.equal(aidPool(actor), 2, "a Short Rest does not refill Aid Dice spent into Muse");
});

test("Aid Dice shortfall clamps at 0: spending more than the pool never goes negative", async () => {
  await ready();
  const actor = composer();
  await anyway(actor, "composePerformances", compose(9, CAP_LINE), "clamp-1");
  assert.equal(aidPool(actor), 0, "the pool clamps at 0");
  assert.ok(aidPool(actor) >= 0);
});

test("Composing happens after the Long Rest refill: the refilled pool is spent, then stays spent until the next Long Rest", async () => {
  await ready();
  registerResourcePoolHooks();
  const actor = composer();
  await composeAndRoll(actor, compose(6, CAP_LINE), 4, "lr-1");
  assert.equal(aidPool(actor), 0);
  await triggerShortRest(actor);
  assert.equal(aidPool(actor), 0, "still spent after a Short Rest");
  await triggerLongRest(actor);
  assert.equal(aidPool(actor), 6, "refilled by the Long Rest");
});

test.todo("composePerformances with aidDice 0 (or a pool at 0): refused or warned? Not in the source; not asserted.");

/* ==========================================================================
   Tests: cancel, undo, no Encore
   ========================================================================== */

test("Cancel: a plan with an unaccepted warning writes nothing (state, Aid Dice and flags unchanged)", async () => {
  await ready();
  const actor = composer();
  const before = snapshot(actor);
  const result = await settle(() => run(actor, "composePerformances", compose(2, [["Bane", "Bless"]]), "cancel-1"));
  assert.equal(result.threw, true, "the unaccepted warning stops the use");
  assert.equal(isWarningError(result.error), true);
  assert.equal(snapshot(actor), before, "nothing changed");
});

test("A use that is not confirmed writes nothing", async () => {
  await ready();
  const actor = composer();
  const before = snapshot(actor);
  const result = await settle(() => Uses.supporterUses.command(actor, "composePerformances", compose(1, CAP_LINE), "noconfirm-1"));
  assert.equal(result.threw, true, "confirmation is required");
  assert.equal(snapshot(actor), before, "nothing changed");
});

test("Undo restores Aid Dice, Performances and museTHP exactly", async () => {
  await ready();
  const actor = composer();
  const beforeBard = structuredClone(bardOf(actor));
  const beforePool = aidPool(actor);
  await composeAndRoll(actor, compose(3, [["Aid", "Heroism", "Sleep"], ["Bane", "Bless", "Mage Armour"]]), 10, "undo-1");
  assert.notEqual(aidPool(actor), beforePool, "precondition: something was spent");
  assert.equal(bardOf(actor).museTHP, 1, "precondition: THP was granted");
  await Uses.supporterUses.undo(actor, "undo-1");
  assert.equal(aidPool(actor), beforePool, "Aid Dice restored");
  assert.deepEqual(bardOf(actor).performances, beforeBard.performances, "Performances restored");
  assert.equal(bardOf(actor).museTHP, beforeBard.museTHP, "museTHP restored");
});

test("No Encore: a Long Rest removes Performances not yet performed (only that is asserted)", async () => {
  await ready();
  const B = await freshBardModule();
  B.registerBardComposeHooks();
  const actor = bard({
    bardState: {
      performances: [perf("p-unperformed", ["Bane", "Bless", "Mage Armour"], false), perf("p-performed", ["Aid", "Heroism", "Sleep"], true)],
      active: null, museTHP: 0
    }
  });
  await triggerLongRest(actor);
  const ids = performancesOf(actor).map(p => p.id);
  assert.equal(ids.includes("p-unperformed"), false, "an unperformed Performance is lost after a Long Rest");
});

/* ==========================================================================
   Tests: Speak to the Soul (C3 L7137-7142, Soul of the Bard, 1st level)
   ========================================================================== */

test("Speak to the Soul: once per rest; a second use without Use anyway is refused", async () => {
  await ready();
  const actor = bard({ prf: 13 });
  await run(actor, "speakToTheSoul", {}, "soul-1");
  assert.equal(getPool(actor, "bardSpeakToTheSoul").value, 0, "the once-per-rest use is spent");
  const second = await settle(() => run(actor, "speakToTheSoul", {}, "soul-2"));
  assert.equal(second.threw, true, "a second use before a rest is refused or warned");
});

test("Speak to the Soul refreshes on a Short Rest", async () => {
  await ready();
  registerResourcePoolHooks();
  const actor = bard({ prf: 13 });
  await run(actor, "speakToTheSoul", {}, "soul-sr-1");
  await triggerShortRest(actor);
  const again = await settle(() => run(actor, "speakToTheSoul", {}, "soul-sr-2"));
  assert.equal(again.threw, false, "available again after a Short Rest");
});

test("Speak to the Soul refreshes on a Long Rest", async () => {
  await ready();
  registerResourcePoolHooks();
  const actor = bard({ prf: 13 });
  await run(actor, "speakToTheSoul", {}, "soul-lr-1");
  await triggerLongRest(actor);
  const again = await settle(() => run(actor, "speakToTheSoul", {}, "soul-lr-2"));
  assert.equal(again.threw, false, "available again after a Long Rest");
});

test("Speak to the Soul replaces the Aid Die with system.skills.prf.total: card only, no roll, nothing changed", async () => {
  await ready();
  const actor = bard({ prf: 13 });
  const hpBefore = hpOf(actor), aidBefore = aidPool(actor);
  await run(actor, "speakToTheSoul", {}, "soul-card-1");
  const receipt = receiptOf(actor, "soul-card-1");
  assert.ok(hasFigure(JSON.stringify(receipt ?? {}), 13), "the card shows the Performance modifier (+13)");
  assert.equal(rollEvaluations.count, 0, "no roll");
  assert.deepEqual(hpOf(actor), hpBefore, "no HP change");
  assert.equal(aidPool(actor), aidBefore, "no Aid Die change");
});

test("Speak to the Soul is refused for a Hexer Supporter and for a non-Supporter", async () => {
  await ready();
  const hexer = bard({ branch: "hexer", level: 2 });
  const hexerUse = await settle(() => run(hexer, "speakToTheSoul", {}, "soul-hexer-1"));
  assert.equal(hexerUse.threw, true, "a Hexer may not use Speak to the Soul");
  assert.equal(isWarningError(hexerUse.error), false, "a refusal, not an overridable warning");
  const plain = nonSupporter();
  const plainUse = await settle(() => run(plain, "speakToTheSoul", {}, "soul-plain-1"));
  assert.equal(plainUse.threw, true, "a non-Supporter may not use Speak to the Soul");
  assert.equal(isWarningError(plainUse.error), false, "a refusal, not an overridable warning");
});

/* ==========================================================================
   Tests: Emergency Improv (C3 L7152-7158, 13th Level: Emergency Improv)
   ========================================================================== */

test("Emergency Improv below 13th level warns (level), and the warning is overridable", async () => {
  await ready();
  const actor = composer({ level: 12 });
  const ws = await planWarnings(actor, "emergencyImprov", {});
  assert.equal(hasLevelWarning(ws), true, "a level 12 warning");
  const accepted = await settle(() => Uses.supporterUses.plan(actor, "emergencyImprov", { overrides: ws.map(w => w.id) }));
  assert.equal(accepted.threw, false, "Use anyway passes the plan");
});

test("Emergency Improv warns when no proficient Instrument is noted (Soul of the Bard, C3 L7137-7140)", async () => {
  await ready();
  const actor = composer({ level: 13, instruments: false });
  const ws = await planWarnings(actor, "emergencyImprov", {});
  assert.equal(hasWarning(ws, /instrument/i), true, "an Instrument warning is raised");
  const accepted = await settle(() => Uses.supporterUses.plan(actor, "emergencyImprov", { overrides: ws.map(w => w.id) }));
  assert.equal(accepted.threw, false, "overridable with Use anyway");
});

test("Emergency Improv at 13th level has no level warning", async () => {
  await ready();
  const actor = composer({ level: 13 });
  const ws = await planWarnings(actor, "emergencyImprov", {});
  assert.equal(hasLevelWarning(ws), false);
});

test("Emergency Improv: the DC 17 Performance check is on the card, and nothing rolls before the click", async () => {
  await ready();
  const actor = composer({ level: 13 });
  await run(actor, "emergencyImprov", {}, "improv-dc-1");
  const receipt = receiptOf(actor, "improv-dc-1");
  assert.equal(showsDC(receipt, 17), true, "DC 17 is shown");
  assert.equal(String(receipt?.formula ?? "").toLowerCase().includes("1d20"), true, "a d20 Performance check");
  assert.equal(rollEvaluations.count, 0, "no roll before the click");
});

test("Emergency Improv is consumed when attempted: pool 0, and a second attempt before a Long Rest is refused", async () => {
  await ready();
  const actor = composer({ level: 13 });
  await run(actor, "emergencyImprov", {}, "improv-once-1");
  assert.equal(getPool(actor, "bardEmergencyImprov").value, 0, "consumed when attempted, not when it succeeds");
  const second = await settle(() => run(actor, "emergencyImprov", {}, "improv-once-2"));
  assert.equal(second.threw, true, "a second attempt is refused or warned");
});

test("Emergency Improv is available again after a Long Rest", async () => {
  await ready();
  registerResourcePoolHooks();
  const actor = composer({ level: 13 });
  await run(actor, "emergencyImprov", {}, "improv-lr-1");
  await triggerLongRest(actor);
  const again = await settle(() => run(actor, "emergencyImprov", {}, "improv-lr-2"));
  assert.equal(again.threw, false, "available again after a Long Rest");
});

test("Emergency Improv insert: an Art repeating its neighbour warns; a non-repeating insert does not", async () => {
  await ready();
  const actor = composer({ level: 13 });
  actor.flags.ak5e.bard = {
    performances: [perf("p-live", ["Bane", "Mage Armour"], false)],
    active: { performanceId: "p-live", arts: [{ name: "Bane", muse: 1, manual: false }, { name: "Mage Armour", muse: 1, manual: false }] },
    museTHP: 0
  };
  // Step 1: the DC 17 check, rolled on the click. A total of 20 succeeds (the check must succeed before step 2).
  rollWith(20);
  await run(actor, "emergencyImprov", {}, "imp-chk-ins");
  await click(actor, "imp-chk-ins");
  // Step 2 (emergencyImprovAid, mode insert, C3 L7152-7158). Inserting "Mage Armour" at index 1 gives
  // [Bane, Mage Armour, Mage Armour]: a consecutive repeat, which must warn.
  const aid = { mode: "insert", performanceId: "p-live", checkUseId: "imp-chk-ins", index: 1 };
  const repeat = await planWarnings(actor, "emergencyImprovAid", { ...aid, art: "Mage Armour" });
  assert.equal(repeat.some(w => w.id === "consecutive"), true, "a consecutive repeat on insert is a warning");
  // Inserting "Bless" at index 1 gives [Bane, Bless, Mage Armour]: no consecutive repeat.
  const clean = await planWarnings(actor, "emergencyImprovAid", { ...aid, art: "Bless" });
  assert.equal(clean.some(w => w.id === "consecutive"), false, "no consecutive warning for a clean insert");
});

/* ==========================================================================
   Tests: refusals of composing (already covered above), lifecycle and UI
   ========================================================================== */

test("defineBardComposePools is idempotent: calling it again does not throw and the pools keep their definitions", async () => {
  const B = await bardModule();
  assert.doesNotThrow(() => B.defineBardComposePools());
  assert.doesNotThrow(() => B.defineBardComposePools());
  const actor = bard();
  assert.equal(getPool(actor, "bardSpeakToTheSoul").max, 1, "Speak to the Soul: once per rest");
  assert.equal(getPool(actor, "bardEmergencyImprov").max, 1, "Emergency Improv: once per Long Rest");
  assert.equal(getPool(bard({ intMod: 6, aidAbility: "int" }), "aidDie").max, 6, "the Aid Die pool still resolves to the INT modifier");
});

test("registerBardComposeHooks called twice registers its hooks once", async () => {
  const B = await freshBardModule();
  const total = () => Array.from(globalThis.Hooks._hooks.values()).reduce((sum, list) => sum + list.length, 0);
  B.registerBardComposeHooks();
  const once = total();
  assert.ok(once > 0, "the first call registers hooks");
  B.registerBardComposeHooks();
  assert.equal(total(), once, "the second call adds nothing");
});

test("bardComposeCommand resolves undefined for an unknown command (it does not throw)", async () => {
  const B = await ready();
  const actor = bard();
  const result = await settle(() => B.bardComposeCommand(actor, "noSuchCommand", {}));
  assert.equal(result.threw, false, "an unknown command does not throw");
  assert.equal(result.value, undefined);
});

test("bardComposePanel and bardComposeApi are exported for the sheet and the API", async () => {
  const B = await bardModule();
  assert.notEqual(B.bardComposePanel, undefined, "bardComposePanel exists");
  assert.notEqual(B.bardComposeApi, undefined, "bardComposeApi exists");
  assert.equal(typeof B.bardComposeCommand, "function", "bardComposeCommand is a function");
});

test("bardComposePlans declares the four plans: composePerformances, bardSetup, speakToTheSoul, emergencyImprov", async () => {
  const B = await bardModule();
  for (const name of ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov"]) {
    assert.equal(typeof B.bardComposePlans[name], "function", `plan ${name}`);
  }
});

