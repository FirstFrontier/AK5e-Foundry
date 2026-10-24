import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, triggerShortRest
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID } from "../scripts/supporter-rules.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { defineSupporterPools } from "../scripts/supporter-features.mjs";
import { getPool, getPoolDefinition, registerResourcePoolHooks } from "../scripts/resource-pools.mjs";
import {
  BARD_PERFORMANCE_ARTS, bardComposePlans, bardComposeApi, bardComposePanel, bardComposeCommand,
  defineBardComposePools, registerBardComposeHooks, lookupBardArt, museCost, performanceLimit, validateComposition,
  EMERGENCY_IMPROV_DC
} from "../scripts/bard-compose.mjs";
import { CHAPTER_FIVE_ARTS } from "../scripts/chapter-five-content.mjs";

// The plans are registered with the Supporter engine once for this file (the branch module does this in production).
registerSupporterPlans({ plans: bardComposePlans, readings: {} });

// Expected transcription of L7168-7211: [name, muse, inChapterFive, manual], in source order (34 rows).
const EXPECTED_ARTS = [
  ["Bane", 1, true, false], ["Bless", 1, false, true], ["Mage Armour", 1, true, false], ["Pyrotechnics", 1, false, true],
  ["Aid", 2, true, false], ["Cause Fear", 2, false, true], ["Colour Spray", 2, false, true],
  ["Dissonant Whispers", 2, true, false], ["Expeditious Retreat", 2, true, false], ["Healing Word", 2, true, false],
  ["Heroism", 2, true, false], ["Ray of Enfeeblement", 2, false, true], ["Shield of Faith", 2, false, true],
  ["Sleep", 2, true, false], ["Bolster", 3, true, false], ["Chromatic Orb (Thunder only)", 3, false, true],
  ["Protection from Energy", 3, true, false], ["Warding Bond", 3, true, false], ["Aura of Vitality", 4, true, false],
  ["Beacon of Hope", 4, true, false], ["Crusader's Mantle", 4, false, true], ["Haste", 4, false, true],
  ["Mass Healing Word", 4, true, false], ["Mind Spike", 4, true, false], ["Slow", 4, true, false],
  ["Tasha's Mind Whip", 4, false, true], ["Thunderwave", 4, true, false], ["Aura of Life", 5, false, true],
  ["Fire Shield", 5, true, false], ["Freedom of Movement", 5, true, false], ["Shatter (2nd Level)", 5, true, false],
  ["Circle of Power", 6, true, false], ["Shatter (5th Level)", 8, true, false], ["Synaptic Static", 8, true, false]
];

/** Ch.5 presence is looked up in the Chapter Five data (every entry's text), as a whole word, case-sensitive. */
const CH5_TEXT = CHAPTER_FIVE_ARTS.map(entry => `${entry.rawSource ?? ""}\n${entry.content ?? ""}`).join("\n").replace(/[’‘]/g, "'");
const inChapterFiveData = name => {
  const base = name.replace(/\s*\([^)]*\)\s*$/, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`).test(CH5_TEXT);
};

const CLASS_ITEM = level => ({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });

function createBard({ level = 13, cha = 16, prf = { value: 1, total: 5 }, flags = {} } = {}) {
  return createTestActor({
    name: "Bard Test", type: "character", items: [CLASS_ITEM(level)],
    flags: { ak5e: { supporter: { enabled: true, branch: "bard", aidAbility: "cha" }, ...flags } },
    abilities: { int: { value: 12, mod: 1 }, wis: { value: 10, mod: 0 }, cha: { value: cha, mod: Math.floor((cha - 10) / 2) } },
    skills: { prf }
  });
}

/** Stub the dice roller: counts evaluate() calls so a test can prove nothing rolled before a click. */
const rollLog = { evaluations: 0, formulas: [], total: 0, messages: 0 };
function stubRoll(total) {
  rollLog.total = total;
  globalThis.Roll = class StubRoll {
    constructor(formula) { this.formula = formula; this.options = {}; }
    async evaluate() { rollLog.evaluations += 1; rollLog.formulas.push(this.formula); this.total = rollLog.total; return this; }
    async toMessage() { rollLog.messages += 1; return this; }
  };
}

const bardOf = actor => actor.getFlag("ak5e", "bard");
const performancesOf = actor => bardOf(actor)?.performances ?? [];
const armsOf = performance => performance.arts.map(art => art.name);

/** Compose the Performances: Muse is only known after the card's roll. Returns the composition useId. */
async function compose(actor, data, { overrides } = {}) {
  const opId = `compose-${Math.random().toString(36).slice(2, 8)}`;
  await supporterUses.command(actor, "composePerformances", { confirmed: true, ...data, ...(overrides ? { overrides } : {}) }, opId);
  return opId;
}
const rollUse = (actor, useId) => supporterUses.command(actor, "useRoll", { useId }, `roll-${useId}`);
const flag = (actor, key) => actor.getFlag("ak5e", key);

test.beforeEach(() => {
  setupFoundryGlobals();
  rollLog.evaluations = 0; rollLog.formulas = []; rollLog.messages = 0;
  stubRoll(10);
  defineSupporterPools();
  defineBardComposePools();
});
test.afterEach(() => { teardownFoundryGlobals(); });

test("the Performance Arts table matches C3:7168-7211 row for row (34 rows, Muse costs, manual flags)", () => {
  assert.equal(BARD_PERFORMANCE_ARTS.length, 34);
  assert.deepEqual(BARD_PERFORMANCE_ARTS.map(row => [row.name, row.muse, row.inChapterFive, row.manual]), EXPECTED_ARTS);
  assert.equal(Object.isFrozen(BARD_PERFORMANCE_ARTS), true);
  for (const row of BARD_PERFORMANCE_ARTS) assert.deepEqual(Object.keys(row).sort(), ["inChapterFive", "manual", "muse", "name"]);
  assert.equal(BARD_PERFORMANCE_ARTS.filter(row => row.manual).length, 11);
});

test("inChapterFive and manual agree with a lookup in the Chapter Five data (R7)", () => {
  for (const row of BARD_PERFORMANCE_ARTS) {
    assert.equal(inChapterFiveData(row.name), row.inChapterFive, `${row.name}: Chapter Five presence`);
    assert.equal(row.manual, !row.inChapterFive, `${row.name}: manual is the absence from Chapter Five`);
  }
});

test("names resolve exactly: the two Shatter rows and the Thunder-only Chromatic Orb stay separate", () => {
  assert.equal(lookupBardArt("shatter (2nd level)").muse, 5);
  assert.equal(lookupBardArt("Shatter (5th Level)").muse, 8);
  assert.equal(lookupBardArt("Chromatic Orb (Thunder only)").manual, true);
  assert.equal(lookupBardArt("Chromatic Orb"), null);
  assert.equal(lookupBardArt("Shatter"), null);
  assert.equal(lookupBardArt("Crusader’s Mantle").name, "Crusader's Mantle");
  assert.equal(museCost(["Bane", "Aid", "Shatter (5th Level)"]), 11);
});

test("composition validation: each rule warns and reports the rule id", () => {
  const actor = createBard({ cha: 16 });
  assert.deepEqual(validateComposition(actor, [["Bane", "Aid", "Bolster"]]), []);
  assert.deepEqual(validateComposition(actor, [["Bane", "Aid"]]).map(w => w.id), ["minArts"]);
  assert.deepEqual(validateComposition(actor, [["Bane", "Aid", "Aid", "Bolster"]]).map(w => w.id), ["consecutive"]);
  assert.throws(() => validateComposition(actor, [["Bane", "Dragon", "Bolster"]]), /"Dragon" is not a Performance Art.*cannot be composed/);
  assert.deepEqual(validateComposition(actor, [["Bane", "Aid", "Bolster"], ["Aid"]]).map(w => w.id).sort(), ["minArts"]);
});

test("an Art name with no table row is a hard error that names the Art, not an overridable warning", async () => {
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true } } });
  // Hard error: even with every override supplied, nothing is spent or written.
  await assert.rejects(() => supporterUses.command(actor, "composePerformances",
    { confirmed: true, aidDice: 1, performances: [["Bane", "Dragon", "Bolster"]], overrides: ["minArts", "unknownArt"] }, "hard-1"),
    error => /"Dragon" is not a Performance Art/.test(error.message) && !(error.warnings ?? []).length);
  assert.equal(getPool(actor, "aidDie").value, 3, "a refused composition spends nothing");
  assert.deepEqual(performancesOf(actor), []);
});

test("Emergency Improv insert: an unknown Art is a hard error and no check is consumed", async () => {
  const actor = createBard({ cha: 16, level: 13, prf: { value: 1, total: 6 }, flags: {
    bardSetup: { done: true, instruments: ["Lute"] },
    bard: { performances: [{ id: "perf-live", arts: [{ name: "Bane", muse: 1, manual: false }, { name: "Aid", muse: 2, manual: false }, { name: "Bolster", muse: 3, manual: false }], performed: false, composedAt: "2026-10-01T00:00:00.000Z" }],
      active: { performanceId: "perf-live", index: 0, crescendo: false, castsThisTurn: 0 }, museTHP: 0 } } });
  const checkId = "ei-hard-check";
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true }, checkId);
  stubRoll(18);
  await rollUse(actor, checkId);
  await assert.rejects(() => supporterUses.command(actor, "emergencyImprovAid",
    { confirmed: true, mode: "insert", art: "Dragon", index: 1, checkUseId: checkId, overrides: ["unknownArt"] }, "ei-hard-aid"),
    error => /"Dragon" is not a Performance Art/.test(error.message));
  assert.equal(getPool(actor, "aidDie").value, 3, "no Aid Die is expended");
  assert.deepEqual(armsOf(performancesOf(actor)[0]), ["Bane", "Aid", "Bolster"]);
});

test("the Performance cap is max(1, Charisma modifier) (R10)", () => {
  assert.equal(performanceLimit(createBard({ cha: 16 })), 3);
  assert.equal(performanceLimit(createBard({ cha: 8 })), 1);
  assert.equal(performanceLimit(createBard({ cha: 6 })), 1);
  assert.equal(performanceLimit(createBard({ cha: 20 })), 5);
  const actor = createBard({ cha: 14 });   // modifier 2
  const three = [["Bane", "Aid", "Bolster"], ["Heroism", "Sleep", "Warding Bond"], ["Bless", "Mage Armour", "Pyrotechnics"]];
  assert.deepEqual(validateComposition(actor, three).map(w => w.id), ["performanceLimit"]);
  assert.deepEqual(validateComposition(actor, three.slice(0, 2)), []);
});

test("composing: the Aid Dice are expended, one roll button is posted, and nothing rolls before the click", async () => {
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true } } });
  const before = performancesOf(actor).length;
  const plan = bardComposePlans.composePerformances(actor, supporterUses.state(actor), {
    aidDice: 2, performances: [["Bane", "Aid", "Bolster"], ["Heroism", "Sleep", "Warding Bond"]] });
  assert.deepEqual(plan.warnings, []);
  const useId = await compose(actor, { aidDice: 2, performances: [["Bane", "Aid", "Bolster"], ["Heroism", "Sleep", "Warding Bond"]] });
  assert.equal(rollLog.evaluations, 0, "no roll before the card's roll button is clicked");
  assert.equal(rollLog.messages, 0);
  const receipt = supporterUses.receipt(actor, useId);
  assert.equal(receipt.formula, "2d10");
  assert.equal(receipt.status, "awaitingRoll");
  assert.equal(getPool(actor, "aidDie").value, 1, "two of three Aid Dice are expended");
  assert.equal(performancesOf(actor).length, before, "Performances are not written until the roll is known");
  assert.equal(receipt.rollLabel, "Muse (2 Aid Dice)", "the engine labels the one roll button");
  assert.doesNotMatch(receipt.summary, /<button/, "the engine renders the roll button; the card adds none");
});

test("the roll click composes the Performances, grants leftover Muse as Temporary HP and undo restores everything", async () => {
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true } } });
  const hpBefore = Number(actor.system.attributes.hp.temp ?? 0);
  const useId = await compose(actor, { aidDice: 2, performances: [["Bane", "Aid", "Bolster"], ["Heroism", "Sleep", "Warding Bond"]] });
  stubRoll(15);
  await rollUse(actor, useId);
  assert.equal(rollLog.evaluations, 1);
  assert.deepEqual(rollLog.formulas, ["2d10"]);
  const performances = performancesOf(actor);
  assert.equal(performances.length, 2);
  assert.deepEqual(performances.map(armsOf), [["Bane", "Aid", "Bolster"], ["Heroism", "Sleep", "Warding Bond"]]);
  assert.ok(performances.every(item => item.performed === false && typeof item.composedAt === "string" && item.id));
  assert.equal(bardOf(actor).museTHP, 2, "Muse 15 less costs 13 leaves 2");
  assert.equal(actor.system.attributes.hp.temp, Math.max(hpBefore, 2));
  assert.equal(bardOf(actor).active ?? null, null, "active is never written by composition");

  await supporterUses.undo(actor, useId);
  assert.deepEqual(performancesOf(actor), []);
  assert.equal(actor.system.attributes.hp.temp, hpBefore, "Temporary HP restored exactly");
  assert.equal(getPool(actor, "aidDie").value, 3, "Aid Dice restored exactly");
  assert.equal(bardOf(actor).museTHP, 0);
});

test("Muse short of the Arts' cost is recorded on the card, not blocked (warn, never block)", async () => {
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true } } });
  const useId = await compose(actor, { aidDice: 1, performances: [["Bane", "Aid", "Bolster"], ["Heroism", "Sleep", "Warding Bond"]] });
  stubRoll(5);
  await rollUse(actor, useId);
  assert.equal(performancesOf(actor).length, 2, "the composition is kept");
  assert.equal(bardOf(actor).museTHP, 0);
  const receipt = supporterUses.receipt(actor, useId);
  assert.equal(receipt.targets[0].overMuse, 8, "13 needed, 5 rolled");
});

test("composition warnings need 'Use anyway' and are not blocked once overridden", async () => {
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true } } });
  const data = { aidDice: 1, performances: [["Bane", "Aid"]] };
  await assert.rejects(() => supporterUses.command(actor, "composePerformances", { confirmed: true, ...data }, "warn-1"),
    error => (error.warnings ?? []).some(warning => warning.id === "minArts"));
  assert.equal(performancesOf(actor).length, 0, "a refused plan writes nothing");
  assert.equal(getPool(actor, "aidDie").value, 3, "a refused plan spends nothing");
  await supporterUses.command(actor, "composePerformances", { confirmed: true, ...data, overrides: ["minArts"] }, "warn-2");
  assert.equal(getPool(actor, "aidDie").value, 2);
});

test("Aid Dice shortfall warns and clamps at 0, and the Muse rolled is only the dice that existed", async () => {
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true } } });
  await assert.rejects(() => supporterUses.command(actor, "composePerformances", { confirmed: true, aidDice: 5, performances: [] }, "short-1"),
    error => (error.warnings ?? []).some(warning => warning.id === "shortfall"));
  const useId = await compose(actor, { aidDice: 5, performances: [] }, { overrides: ["shortfall"] });
  assert.equal(getPool(actor, "aidDie").value, 0);
  assert.equal(supporterUses.receipt(actor, useId).formula, "3d10");
  assert.ok(supporterUses.receipt(actor, useId).shortfalls.length >= 1);
  await supporterUses.undo(actor, useId);
  assert.equal(getPool(actor, "aidDie").value, 3, "undo restores the clamped Aid Dice exactly");
});

test("timing: composing with no finished rest on record warns", async () => {
  const actor = createBard({ cha: 16 });
  await assert.rejects(() => supporterUses.command(actor, "composePerformances", { confirmed: true, aidDice: 1, performances: [] }, "timing-1"),
    error => (error.warnings ?? []).some(warning => warning.id === "timing"));
});

test("No Encore: a Long Rest removes unperformed Performances (owner client, chat note); a Short Rest keeps them", async () => {
  registerBardComposeHooks();
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true }, bard: {
    performances: [
      { id: "p-done", arts: [{ name: "Bane", muse: 1, manual: false }, { name: "Aid", muse: 2, manual: false }, { name: "Bolster", muse: 3, manual: false }], performed: true, composedAt: "2026-10-01T00:00:00.000Z" },
      { id: "p-open", arts: [{ name: "Heroism", muse: 2, manual: false }, { name: "Sleep", muse: 2, manual: false }, { name: "Warding Bond", muse: 3, manual: false }], performed: false, composedAt: "2026-10-01T00:00:00.000Z" }
    ], active: null, museTHP: 0 } } });
  await globalThis.Hooks.callAll("dnd5e.restCompleted", actor, { type: "short" }, { type: "short" });
  assert.deepEqual(performancesOf(actor).map(item => item.id), ["p-done", "p-open"], "a short rest keeps them");
  await globalThis.Hooks.callAll("dnd5e.restCompleted", actor, { type: "long" }, { type: "long" });
  assert.deepEqual(performancesOf(actor).map(item => item.id), ["p-done"], "a long rest drops the unperformed one");
  assert.ok(globalThis.game.messages.some(message => /lost at the end of the Long Rest/.test(message.content ?? "")), "a chat note is posted");
  assert.equal(flag(actor, "bardRest").open, true, "the rest reopens composition");
});

test("Speak to the Soul: once per Short or Long Rest, states the Performance Modifier and changes nothing", async () => {
  registerResourcePoolHooks();
  const actor = createBard({ cha: 16, prf: { value: 1, total: 7 } });
  const first = await supporterUses.command(actor, "speakToTheSoul", { confirmed: true }, "soul-1");
  assert.equal(first.replacement, 7);
  assert.equal(getPool(actor, "bardSpeakToTheSoul").value, 0);
  await assert.rejects(() => supporterUses.command(actor, "speakToTheSoul", { confirmed: true }, "soul-2"),
    error => (error.warnings ?? []).some(warning => warning.id === "used"));
  await triggerShortRest(actor);
  assert.equal(getPool(actor, "bardSpeakToTheSoul").value, 1, "a Short Rest restores it");
  assert.deepEqual(getPoolDefinition("bardSpeakToTheSoul").recovery.map(entry => entry.on), ["sr", "lr"]);
});

test("Soul of the Bard setup: three Instruments, Performance proficiency, then Expertise; idempotent", async () => {
  const actor = createBard({ cha: 16, prf: { value: 0, total: 1 } });
  await supporterUses.command(actor, "bardSetup", { confirmed: true, instruments: ["Lute", "Flute", "Drum"] }, "setup-1");
  assert.equal(actor.system.skills.prf.value, 1);
  assert.match(actor.system.traits.toolProf.custom, /Lute/);
  assert.equal(flag(actor, "bardSetup").done, true);
  await assert.rejects(() => supporterUses.command(actor, "bardSetup", { confirmed: true, instruments: ["Lute", "Flute", "Drum"] }, "setup-2"),
    error => (error.warnings ?? []).some(warning => warning.id === "alreadySetUp"));
  await supporterUses.command(actor, "bardSetup", { confirmed: true, instruments: ["Lute", "Flute", "Drum"], overrides: ["alreadySetUp"] }, "setup-3");
  assert.equal(actor.system.skills.prf.value, 1, "a second run never raises Performance to Expertise");

  const expert = createBard({ cha: 16, prf: { value: 1, total: 5 } });
  await supporterUses.command(expert, "bardSetup", { confirmed: true, instruments: ["Lute", "Flute", "Drum"] }, "setup-4");
  assert.equal(expert.system.skills.prf.value, 2, "already proficient becomes Expertise");
  assert.throws(() => bardComposePlans.bardSetup(expert, supporterUses.state(expert), { instruments: ["Lute", "Lute", "Drum"] }), /three different/);
});

test("Emergency Improv: the DC 17 check is a button and consumes the use when attempted", async () => {
  const actor = createBard({ cha: 16, level: 13, prf: { value: 1, total: 6 }, flags: { bardSetup: { done: true, instruments: ["Lute"] } } });
  const useId = "ei-1";
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true }, useId);
  assert.equal(getPool(actor, "bardEmergencyImprov").value, 0, "consumed when attempted");
  assert.equal(rollLog.evaluations, 0, "the check does not roll before its button");
  assert.match(supporterUses.receipt(actor, useId).formula, /1d20 \+ 6/);
  stubRoll(18);
  await rollUse(actor, useId);
  assert.equal(rollLog.evaluations, 1);
  assert.equal(supporterUses.receipt(actor, useId).targets[0].success, true);
  assert.equal(EMERGENCY_IMPROV_DC, 17);
  await assert.rejects(() => supporterUses.command(actor, "emergencyImprov", { confirmed: true }, "ei-2"),
    error => (error.warnings ?? []).some(warning => warning.id === "used"));
});

test("Emergency Improv warns below level 13 and without a noted Instrument, and never blocks", async () => {
  const actor = createBard({ cha: 16, level: 12, prf: { value: 1, total: 5 } });
  await assert.rejects(() => supporterUses.command(actor, "emergencyImprov", { confirmed: true }, "ei-warn"),
    error => ["level", "instrument"].every(id => (error.warnings ?? []).some(warning => warning.id === id)));
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true, overrides: ["level", "instrument"] }, "ei-used");
  assert.equal(getPool(actor, "bardEmergencyImprov").value, 0);
});

test("Emergency Improv, follow-up: a successful check spends an Aid Die and composes a Performance on the spot, with a reminder", async () => {
  const actor = createBard({ cha: 16, level: 13, prf: { value: 1, total: 6 }, flags: { bardSetup: { done: true, instruments: ["Lute"] } } });
  const checkId = "ei-check";
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true }, checkId);
  stubRoll(18);
  await rollUse(actor, checkId);
  stubRoll(8);
  const followId = "ei-aid";
  await supporterUses.command(actor, "emergencyImprovAid", { confirmed: true, mode: "compose", arts: ["Bane", "Aid", "Bolster"], checkUseId: checkId }, followId);
  assert.equal(getPool(actor, "aidDie").value, 2, "one Aid Die expended");
  await rollUse(actor, followId);
  assert.deepEqual(rollLog.formulas.at(-1), "1d10");
  const composed = performancesOf(actor).at(-1);
  assert.deepEqual(armsOf(composed), ["Bane", "Aid", "Bolster"]);
  assert.equal(typeof composed.composedAt, "string");
  assert.equal(bardOf(actor).museTHP, 2, "Muse 8 less costs 6 leaves 2");
  await assert.rejects(() => supporterUses.command(actor, "emergencyImprovAid", { confirmed: true, mode: "compose", arts: ["Bane", "Aid", "Bolster"] }, "ei-again"),
    error => /No Performance check is waiting/.test(error.message));
});

test("Emergency Improv, follow-up: a failed check warns, and an insertion that repeats the neighbouring Art warns", async () => {
  const actor = createBard({ cha: 16, level: 13, prf: { value: 1, total: 6 }, flags: {
    bardSetup: { done: true, instruments: ["Lute"] },
    bard: { performances: [{ id: "perf-live", arts: [{ name: "Bane", muse: 1, manual: false }, { name: "Aid", muse: 2, manual: false }, { name: "Bolster", muse: 3, manual: false }], performed: false, composedAt: "2026-10-01T00:00:00.000Z" }],
      active: { performanceId: "perf-live", index: 0, crescendo: false, castsThisTurn: 0 }, museTHP: 0 } } });
  const checkId = "ei-fail";
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true }, checkId);
  stubRoll(4);
  await rollUse(actor, checkId);
  await assert.rejects(() => supporterUses.command(actor, "emergencyImprovAid", { confirmed: true, mode: "insert", art: "Aid", index: 1, checkUseId: checkId }, "ei-fail-aid"),
    error => (error.warnings ?? []).some(warning => warning.id === "checkFailed") && (error.warnings ?? []).some(warning => warning.id === "consecutive"));
});

test("Emergency Improv: inserting an Art into the current Performance writes it in place and undo restores the Arts", async () => {
  const start = [{ name: "Bane", muse: 1, manual: false }, { name: "Aid", muse: 2, manual: false }, { name: "Bolster", muse: 3, manual: false }];
  const actor = createBard({ cha: 16, level: 13, prf: { value: 1, total: 6 }, flags: {
    bardSetup: { done: true, instruments: ["Lute"] },
    bard: { performances: [{ id: "perf-live", arts: start, performed: false, composedAt: "2026-10-01T00:00:00.000Z" }],
      active: { performanceId: "perf-live", index: 0, crescendo: false, castsThisTurn: 0 }, museTHP: 0 } } });
  const checkId = "ei-ins-check";
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true }, checkId);
  stubRoll(18);
  await rollUse(actor, checkId);
  const followId = "ei-ins";
  await supporterUses.command(actor, "emergencyImprovAid", { confirmed: true, mode: "insert", art: "Heroism", index: 1, checkUseId: checkId }, followId);
  stubRoll(6);
  await rollUse(actor, followId);
  assert.deepEqual(armsOf(performancesOf(actor)[0]), ["Bane", "Heroism", "Aid", "Bolster"]);
  await supporterUses.undo(actor, followId);
  assert.deepEqual(armsOf(performancesOf(actor)[0]), ["Bane", "Aid", "Bolster"]);
  assert.equal(bardOf(actor).active.performanceId, "perf-live", "U8's active state is untouched");
});

test("undo of a composition restores Performances it removes, but keeps earlier ones intact", async () => {
  const seeded = [{ id: "perf-old", arts: [{ name: "Bane", muse: 1, manual: false }, { name: "Aid", muse: 2, manual: false }, { name: "Bolster", muse: 3, manual: false }], performed: true, composedAt: "2026-10-01T00:00:00.000Z" }];
  const actor = createBard({ cha: 16, flags: { bardRest: { open: true }, bard: { performances: seeded, active: null, museTHP: 0 } } });
  const useId = await compose(actor, { aidDice: 1, performances: [["Heroism", "Sleep", "Warding Bond"]] });
  stubRoll(9);
  await rollUse(actor, useId);
  assert.equal(performancesOf(actor).length, 2);
  await supporterUses.undo(actor, useId);
  assert.deepEqual(performancesOf(actor), seeded);
  assert.equal(flag(actor, "bardRest").open, true, "the rest window is restored by undo");
});

test("bardComposeCommand returns undefined for commands it does not own, and the panel is inert HTML", () => {
  const actor = createBard({ cha: 16 });
  assert.equal(bardComposeCommand(actor, "configureHexerArts"), undefined);
  assert.equal(bardComposeCommand(actor, "undo"), undefined);
  const panel = bardComposePanel(actor);
  for (const cmd of ["composePerformances", "bardSetup", "speakToTheSoul", "emergencyImprov", "emergencyImprovAid"]) {
    assert.match(panel, new RegExp(`data-supporter-cmd="${cmd}"`));
  }
  assert.equal(bardComposePanel(createTestActor({ name: "Plain" })), "", "a non-Bard gets no panel");
  assert.equal(rollLog.evaluations, 0);
  assert.throws(() => { bardComposeApi.arts.push({}); }, TypeError);
  assert.equal(Object.isFrozen(bardComposeApi), true);
});
