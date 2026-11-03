/**
 * U5 (Bard subclass bug fixes): the implementer's own tests, complementing the challenger's supporter-bard-u5-adversarial
 * suite. Covers the cap (R1), the cursor on an insert before it and its undo, Soul of the Bard undo, the shared end flow
 * (turn end, combat end, Long Rest; owner relay, Cancel, timeout), Emergency Improv expiry and warnings, the other-Concentration
 * and minimum-Arts warnings, concurrent writes, and the Shatter / Chromatic Orb variants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, triggerLongRest
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel } from "../scripts/supporter-rules.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { defineSupporterPools } from "../scripts/supporter-features.mjs";
import { getPool, setPool } from "../scripts/resource-pools.mjs";
import {
  bardPerformPlans, bardPerformCommand, bardTurnEnd, bardCombatEnd, bardLongRest, endWithChoice, handleBardEndRequest,
  handleBardEndAnswer, isPerforming, CRESCENDO_EFFECT_ID, registerBardPerformHooks
} from "../scripts/bard-perform.mjs";
import {
  bardComposePlans, defineBardComposePools, performanceLimit, validateComposition, improvExpired, expireImprovPerformances,
  BARD_PERFORMANCE_ARTS, artVariantNote, isManualArt
} from "../scripts/bard-compose.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

for (const plans of [bardPerformPlans, bardComposePlans]) {
  try { registerSupporterPlans({ plans, readings: {} }); } catch (error) {
    if (!/already registered/.test(error?.message ?? "")) throw error;
  }
}

const INSTRUMENT_ID = "lute0000000001";
const docsRef = { docs: null };
let seq = 0;

const GM = { id: "gm", name: "Gamemaster", isGM: true, active: true, targets: new Set() };
const PLAYER = { id: "player", name: "Player", isGM: false, active: false, targets: new Set() };

test.beforeEach(() => {
  setupFoundryGlobals({ gmUser: GM, playerUser: PLAYER });
  docsRef.docs = globalThis._ak5eTestDocs;
  defineSupporterPools();
  defineBardComposePools();
  globalThis.Roll = class StubRoll {
    constructor(formula) { this.formula = formula; this.options = {}; }
    async evaluate() { this.total = globalThis.__rollTotal ?? 10; return this; }
    async toMessage() { return this; }
  };
});
test.afterEach(() => { PLAYER.active = false; teardownFoundryGlobals(); delete globalThis.__rollTotal; });

const art = (name, extra = {}) => ({ name, muse: 1, manual: false, ...extra });
const performance = (id, names, extra = {}) => ({ id, arts: names.map(name => art(name)), performed: false, composedAt: 100, ...extra });

/** A Bard with the class and subclass Items, a Lute and one spell Item per native Art. */
function makeBard({ level = 13, cha = 16, prf = { value: 1, total: 5 }, performances = [], active = null, flags = {}, arts = [],
  concentrationArts = [], instrument = true } = {}) {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const branch = createTestItem({ name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } });
  const actor = createTestActor({
    name: "Bard", type: "character", items: [sClass, branch],
    system: { attributes: { prof: pbForLevel(level), hp: { value: 20, max: 20, temp: 0 } } },
    abilities: { int: { value: 12, mod: 1 }, wis: { value: 10, mod: 0 }, cha: { value: cha, mod: Math.floor((cha - 10) / 2) } },
    skills: { prf },
    flags: { ak5e: {
      supporter: { enabled: true, aidAbility: "cha", branch: "bard" },
      casting: { enabled: true, ability: "cha", castingUnit: instrument ? INSTRUMENT_ID : "" },
      artsPoints: { value: 10, maximum: 10, maximumArtLevel: 9, ninthLevelCast: false },
      bard: { performances: structuredClone(performances), active: structuredClone(active), fontDie: false, museTHP: 0 },
      ...flags
    } }
  });
  docsRef.docs.set(actor.uuid, actor);
  if (instrument) {
    const lute = createTestItem({ id: INSTRUMENT_ID, name: "Lute", type: "tool", system: { equipped: true, proficient: 1 } }, actor);
    actor.items.set(lute.id, lute);
  }
  for (const name of arts) {
    const item = createTestItem({ id: `art${name.replace(/\W/g, "")}`, name, type: "spell", system: { level: 1 } }, actor);
    item.system.activities = new Map([["a1", { id: "a1", activation: { type: "action" }, use: async () => true }]]);
    item.requiresConcentration = concentrationArts.includes(name);
    actor.items.set(item.id, item);
  }
  return actor;
}

const run = (actor, name, data = {}) => supporterUses.execute(actor, name, { confirmed: true, ...data }, `u5-${++seq}`);
const bardOf = actor => actor.getFlag("ak5e", "bard");
const performancesOf = actor => bardOf(actor).performances;
const artNames = entry => entry.arts.map(item => item.name);
const crescendoEffect = actor => [...actor.effects.values()].find(effect => effect.id === CRESCENDO_EFFECT_ID) ?? null;
const warningIds = error => (error?.warnings ?? []).map(warning => warning.id);

async function warningsOf(task) {
  try { await task(); } catch (error) { return warningIds(error); }
  return [];
}

/** DialogV2 stand-in: `answers` are button actions consumed in order; the record keeps the window titles. */
function stubDialogs(answers = []) {
  const queue = [...answers];
  const seen = [];
  foundry.applications = { api: { DialogV2: {
    async wait({ window, buttons }) {
      seen.push(window.title);
      const answer = queue.shift();
      if (answer === null || answer === undefined) return null;
      const button = buttons.find(entry => entry.action === answer);
      if (!button) throw new Error(`no button ${answer} in ${window.title}`);
      return (await button.callback?.(null, button, null)) ?? answer;
    },
    async prompt() { return null; }
  } } };
  return { seen, remaining: () => queue.length };
}

/* ---------------------------------------------------------------- R1: the cap */

test("R1: the Performance cap is the Charisma modifier with no minimum", () => {
  for (const [cha, cap] of [[16, 3], [11, 0], [10, 0], [8, 0], [6, 0], [20, 5]]) {
    assert.equal(performanceLimit(makeBard({ cha })), cap, `Charisma ${cha}`);
  }
});

test("R1: a cap warning says Charisma modifier and never claims a minimum of one; limit:false skips it (Emergency Improv)", () => {
  const actor = makeBard({ cha: 8 });
  const list = validateComposition(actor, [["Bane", "Bless", "Aid"]]);
  const cap = list.find(item => item.id === "performanceLimit");
  assert.ok(cap, "one Performance at a cap of 0 is warned");
  assert.doesNotMatch(cap.text, /minimum (of )?(1|one)\b/i);
  assert.equal(validateComposition(actor, [["Bane", "Bless", "Aid"]], { limit: false }).some(item => item.id === "performanceLimit"), false);
});

/* ---------------------------------------------------------------- Soul of the Bard undo and redo */

test("Soul of the Bard: undo restores Performance proficiency and the Instruments, and a redo gives proficiency, not Expertise", async () => {
  const actor = makeBard({ prf: { value: 0, total: 1 } });
  const instruments = ["Lute", "Flute", "Drum"];
  await supporterUses.command(actor, "bardSetup", { confirmed: true, instruments }, "setup-a");
  assert.equal(actor.system.skills.prf.value, 1);
  assert.match(actor.system.traits.toolProf.custom, /Flute/);
  await supporterUses.undo(actor, "setup-a");
  assert.equal(actor.system.skills.prf.value, 0, "Performance goes back to what it was");
  assert.doesNotMatch(actor.system.traits.toolProf.custom ?? "", /Flute|Drum|Lute/, "the Instruments the use added are removed");
  assert.equal(actor.getFlag("ak5e", "bardSetup"), undefined);
  await supporterUses.command(actor, "bardSetup", { confirmed: true, instruments }, "setup-b");
  assert.equal(actor.system.skills.prf.value, 1, "the redo does not stack Expertise on the undone proficiency");
});

test("Soul of the Bard: an Expertise set-up undoes back to proficiency, and a later sheet change is not overwritten", async () => {
  const actor = makeBard({ prf: { value: 1, total: 5 } });
  await supporterUses.command(actor, "bardSetup", { confirmed: true, instruments: ["Lute", "Flute", "Drum"] }, "setup-c");
  assert.equal(actor.system.skills.prf.value, 2);
  await supporterUses.undo(actor, "setup-c");
  assert.equal(actor.system.skills.prf.value, 1);
  await supporterUses.command(actor, "bardSetup", { confirmed: true, instruments: ["Lute", "Flute", "Drum"] }, "setup-d");
  await actor.update({ "system.skills.prf.value": 0 });
  await supporterUses.undo(actor, "setup-d");
  assert.equal(actor.system.skills.prf.value, 0, "a value the player changed afterwards is left alone");
});

/* ---------------------------------------------------------------- Emergency Improv insert and the cursor */

async function improvInsert(actor, index, { overrides = [] } = {}) {
  const checkId = `chk-${++seq}`;
  await supporterUses.command(actor, "emergencyImprov", { confirmed: true }, checkId);
  globalThis.__rollTotal = 18;
  await supporterUses.command(actor, "useRoll", { useId: checkId }, `roll-${checkId}`);
  const followId = `ins-${seq}`;
  await supporterUses.command(actor, "emergencyImprovAid",
    { confirmed: true, mode: "insert", art: "Heroism", index, checkUseId: checkId, overrides }, followId);
  globalThis.__rollTotal = 6;
  await supporterUses.command(actor, "useRoll", { useId: followId }, `roll-${followId}`);
  return followId;
}

const ACTIVE_AT_2 = { performanceId: "live", index: 2, crescendo: 0, castsThisTurn: 0 };

test("an Art inserted before the cursor is skipped and the cursor still points at the Art not yet cast; undo restores both", async () => {
  const actor = makeBard({ flags: { bardSetup: { done: true, instruments: ["Lute"] } },
    performances: [performance("live", ["Bane", "Aid", "Bolster"])], active: ACTIVE_AT_2 });
  const followId = await improvInsert(actor, 1, { overrides: ["beforeCursor"] });
  const live = performancesOf(actor)[0];
  assert.deepEqual(artNames(live), ["Bane", "Heroism", "Aid", "Bolster"]);
  assert.equal(live.arts[1].skipped, true, "the inserted Art is behind the cursor, so it is never cast");
  assert.equal(bardOf(actor).active.index, 3, "the cursor moved with the insert and stays on Bolster");
  await supporterUses.undo(actor, followId);
  assert.deepEqual(artNames(performancesOf(actor)[0]), ["Bane", "Aid", "Bolster"]);
  assert.equal(bardOf(actor).active.index, 2, "undo moves the cursor back");
  assert.equal(performancesOf(actor)[0].arts.some(item => item.skipped), false);
});

test("an Art inserted at or after the cursor does not move it and is not skipped", async () => {
  const actor = makeBard({ flags: { bardSetup: { done: true, instruments: ["Lute"] } },
    performances: [performance("live", ["Bane", "Aid", "Bolster"])], active: ACTIVE_AT_2 });
  await improvInsert(actor, 2);
  const live = performancesOf(actor)[0];
  assert.deepEqual(artNames(live), ["Bane", "Aid", "Heroism", "Bolster"]);
  assert.equal(bardOf(actor).active.index, 2);
  assert.equal(live.arts.some(item => item.skipped), false);
});

test("Emergency Improv insert: warns for an ended Performance, for one that is not current and for a place behind the cursor", async () => {
  const insert = (actor, index, id = "live") => supporterUses.command(actor, "emergencyImprovAid",
    { confirmed: true, mode: "insert", art: "Heroism", index, performanceId: id, checkUseId: "none", overrides: ["noCheck"] }, `warn-${++seq}`);
  const ended = makeBard({ performances: [performance("live", ["Bane", "Aid", "Bolster"], { performed: true })], active: null });
  assert.ok((await warningsOf(() => insert(ended, 1))).includes("endedPerformance"));
  const idle = makeBard({ performances: [performance("live", ["Bane", "Aid", "Bolster"])], active: null });
  assert.ok((await warningsOf(() => insert(idle, 1))).includes("notCurrent"));
  const running = makeBard({ performances: [performance("live", ["Bane", "Aid", "Bolster"])], active: ACTIVE_AT_2 });
  assert.ok((await warningsOf(() => insert(running, 1))).includes("beforeCursor"));
});

test("Emergency Improv with no Aid Die left warns (noAidDie) on both the compose and the insert path, and the override proceeds", async () => {
  const actor = makeBard({ flags: { bardSetup: { done: true, instruments: ["Lute"] } },
    performances: [performance("live", ["Bane", "Aid", "Bolster"])], active: ACTIVE_AT_2 });
  await setPool(actor, "aidDie", 0);
  assert.equal(getPool(actor, "aidDie").value, 0, "precondition: no Aid Die");
  const compose = data => supporterUses.command(actor, "emergencyImprovAid",
    { confirmed: true, checkUseId: "none", overrides: ["noCheck"], ...data }, `aid-${++seq}`);
  assert.ok((await warningsOf(() => compose({ mode: "compose", arts: ["Bane", "Aid", "Bolster"] }))).includes("noAidDie"));
  assert.ok((await warningsOf(() => compose({ mode: "insert", art: "Heroism", index: 2 }))).includes("noAidDie"));
});

/* ---------------------------------------------------------------- Emergency Improv: the one-minute expiry */

test("improvExpired: not begun within a minute (wall clock or world time), never for a begun or non-Improv Performance", () => {
  const now = Date.now();
  const base = performance("i", ["Bane", "Aid", "Bolster"], { improv: true });
  assert.equal(improvExpired({ ...base, improvExpiresAt: now - 1 }, now), true);
  assert.equal(improvExpired({ ...base, improvExpiresAt: now + 60_000 }, now), false);
  assert.equal(improvExpired({ ...base, improvExpiresWorld: 90 }, now), true, "world time 100 is past 90");
  assert.equal(improvExpired({ ...base, improvExpiresWorld: 500 }, now), false);
  assert.equal(improvExpired({ ...base, improvExpiresAt: now - 1, performed: true }, now), false);
  assert.equal(improvExpired({ ...base, improvExpiresAt: now - 1, improv: false }, now), false);
  assert.equal(improvExpired({ ...base, expired: true }, now), true);
});

test("expireImprovPerformances marks the lost Performance and says so; starting it is an overridable warning", async () => {
  const lost = performance("lost", ["Bane", "Bless", "Aid"], { improv: true, improvExpiresAt: Date.now() - 5 });
  const actor = makeBard({ performances: [lost, performance("kept", ["Bane", "Bless", "Aid"])], arts: ["Bane", "Bless", "Aid"] });
  assert.deepEqual(await expireImprovPerformances(actor), ["lost"]);
  assert.equal(performancesOf(actor).find(item => item.id === "lost").expired, true);
  assert.equal(performancesOf(actor).find(item => item.id === "kept").expired, undefined);
  assert.ok(game.messages.some(message => /not begun within a minute/.test(message.content ?? "")));
  assert.deepEqual(await expireImprovPerformances(actor), [], "a second pass finds nothing new");
  assert.ok((await warningsOf(() => run(actor, "startPerformance", { performanceId: "lost" }))).includes("improvExpired"));
  await run(actor, "startPerformance", { performanceId: "lost", overrides: ["improvExpired"] });
  assert.equal(isPerforming(actor), true, "warn, never block");
});

test("an expiry and a start running together keep both writes (the performances array is not overwritten)", async () => {
  const lost = performance("lost", ["Bane", "Bless", "Aid"], { improv: true, improvExpiresAt: Date.now() - 5 });
  const actor = makeBard({ performances: [performance("go", ["Bane", "Bless", "Aid"]), lost], arts: ["Bane", "Bless", "Aid"] });
  await Promise.all([expireImprovPerformances(actor), run(actor, "startPerformance", { performanceId: "go" })]);
  const byId = Object.fromEntries(performancesOf(actor).map(item => [item.id, item]));
  assert.equal(byId.go.performed, true);
  assert.equal(byId.lost.expired, true);
  assert.equal(bardOf(actor).active.performanceId, "go");
});

test("a Long Rest and an expiry running together neither throw nor lose the running Performance", async () => {
  const registerCompose = await import("../scripts/bard-compose.mjs?u5=long");
  registerCompose.registerBardComposeHooks();
  const lost = performance("lost", ["Bane", "Bless", "Aid"], { improv: true, improvExpiresAt: Date.now() - 5 });
  const actor = makeBard({ performances: [performance("run", ["Bane", "Bless", "Aid"], { performed: true }), lost],
    active: { performanceId: "run", index: 1, crescendo: 0, castsThisTurn: 1 } });
  await Promise.all([expireImprovPerformances(actor), triggerLongRest(actor)]);
  assert.deepEqual(performancesOf(actor).map(item => item.id), ["run"]);
  assert.equal(bardOf(actor).active.performanceId, "run", "the Long Rest's compose hook leaves the active Performance alone");
});

/* ---------------------------------------------------------------- starting: Arts count */

test("a Performance with no Arts is refused and writes nothing; one or two Arts warn about the three-Art minimum", async () => {
  const actor = makeBard({ performances: [performance("none", []), performance("one", ["Bless"]), performance("two", ["Bless", "Aid"])],
    arts: ["Bless", "Aid"] });
  const before = JSON.stringify(bardOf(actor));
  await assert.rejects(() => run(actor, "startPerformance", { performanceId: "none" }), /no Arts/);
  assert.equal(JSON.stringify(bardOf(actor)), before);
  for (const id of ["one", "two"]) {
    const tooFew = makeBard({ performances: [performance(id, id === "one" ? ["Bless"] : ["Bless", "Aid"])], arts: ["Bless", "Aid"] });
    assert.ok((await warningsOf(() => run(tooFew, "startPerformance", { performanceId: id }))).includes("minArts"));
    await run(tooFew, "startPerformance", { performanceId: id, overrides: ["minArts"] });
    assert.equal(isPerforming(tooFew), true);
  }
});

/* ---------------------------------------------------------------- casting: skipped Arts, other Concentration, variants */

const RUNNING = { performanceId: "P", index: 0, crescendo: 0, castsThisTurn: 0, concentration: false };

test("an inserted-and-skipped Art is not counted for the Rising Crescendo and cannot be the Art kept in Concentration", async () => {
  const arts = [art("Bless"), art("Heroism", { skipped: true }), art("Aid"), art("Bane")];
  const actor = makeBard({ arts: ["Bless", "Heroism", "Aid", "Bane"], concentrationArts: ["Heroism"],
    performances: [{ id: "P", arts, performed: true, composedAt: 100 }], active: { ...RUNNING, index: 2, castsThisTurn: 0 } });
  const plan = bardPerformPlans.castNextArt(actor, supporterUses.state(actor), { performanceId: "P", index: 2 });
  assert.ok(plan, "the Art at the cursor is planned");
  assert.throws(() => bardPerformPlans.endPerformance(actor, supporterUses.state(actor), { keepArt: "Heroism" }), /Keep Concentration/);
});

test("casting a Concentration Art while Concentrating on another spell warns (C3:7108) and the override casts it", async () => {
  const actor = makeBard({ arts: ["Bless", "Heroism", "Aid"], concentrationArts: ["Heroism"],
    performances: [performance("P", ["Heroism", "Bless", "Aid"], { performed: true })], active: RUNNING });
  actor.concentration = { items: [{ name: "Hex" }], effects: [] };
  const ids = await warningsOf(() => run(actor, "castNextArt", { performanceId: "P", index: 0 }));
  assert.ok(ids.includes("otherConcentration"), `got ${ids.join(",")}`);
  await run(actor, "castNextArt", { performanceId: "P", index: 0, overrides: ["otherConcentration"] });
  assert.equal(bardOf(actor).active.index, 1, "warn, never block");
  const quiet = makeBard({ arts: ["Bless", "Heroism", "Aid"], concentrationArts: ["Heroism"],
    performances: [performance("P", ["Heroism", "Bless", "Aid"], { performed: true })], active: RUNNING });
  assert.equal((await warningsOf(() => run(quiet, "castNextArt", { performanceId: "P", index: 0 }))).includes("otherConcentration"), false);
});

test("Shatter (2nd Level) is cast from the native Shatter Item; Shatter (5th Level) and Chromatic Orb (Thunder only) are manual with a note", async () => {
  assert.equal(isManualArt(BARD_PERFORMANCE_ARTS.find(row => row.name === "Shatter (2nd Level)")), false);
  for (const name of ["Shatter (5th Level)", "Chromatic Orb (Thunder only)"]) {
    const row = BARD_PERFORMANCE_ARTS.find(item => item.name === name);
    assert.equal(isManualArt(row), true, name);
    assert.ok(artVariantNote(name), `${name} has a card note`);
  }
  assert.equal(artVariantNote("Shatter (2nd Level)"), null);

  const native = makeBard({ arts: ["Shatter"], performances: [performance("P", ["Shatter (2nd Level)", "Bane", "Aid"], { performed: true })], active: RUNNING });
  const result = await run(native, "castNextArt", { performanceId: "P", index: 0 });
  assert.equal(result.manual, false);
  assert.equal(result.artFound, true);

  const manual = makeBard({ arts: ["Shatter"], performances: [performance("P", ["Shatter (5th Level)", "Bane", "Aid"], { performed: true })], active: RUNNING });
  const card = await run(manual, "castNextArt", { performanceId: "P", index: 0 });
  assert.equal(card.manual, true);
  assert.match(card.variantNote ?? "", /Chapter 5/);
  assert.ok(game.messages.some(message => /Shatter \(5th Level\)/.test(message.content ?? "") && /Chapter 5/.test(message.content ?? "")), "the card says it stays manual");
});

/* ---------------------------------------------------------------- the end flow */

const ENDING = { performanceId: "P", index: 3, crescendo: 0, castsThisTurn: 0, concentration: true };
function endingBard(extra = {}) {
  return makeBard({ arts: ["Bless", "Healing Word", "Heroism"], concentrationArts: ["Heroism"],
    performances: [performance("P", ["Bless", "Healing Word", "Heroism"], { performed: true })], active: ENDING, ...extra });
}

test("turn end with no Art cast offers the keep-Concentration choice once; Cancel keeps the Performance and writes nothing", async () => {
  const actor = endingBard();
  const dialogs = stubDialogs(["cancel"]);
  const before = JSON.stringify(bardOf(actor));
  await bardTurnEnd(actor);
  assert.equal(dialogs.seen.length, 1, "one prompt");
  assert.equal(isPerforming(actor), true);
  assert.equal(JSON.stringify(bardOf(actor)), before);
  const kept = stubDialogs(["keep0"]);
  await bardTurnEnd(actor);
  assert.equal(kept.seen.length, 1);
  assert.equal(isPerforming(actor), false);
  assert.equal(actor.getFlag("ak5e", "bard").performances[0].performed, true);
});

test("turn end without Concentration Arts confirms once; without a dialog API it ends keeping none", async () => {
  const actor = makeBard({ arts: ["Bless", "Aid", "Bane"],
    performances: [performance("P", ["Bless", "Aid", "Bane"], { performed: true })], active: ENDING });
  const dialogs = stubDialogs(["cancel", "confirm"]);
  await bardTurnEnd(actor);
  assert.equal(isPerforming(actor), true);
  await bardTurnEnd(actor);
  assert.equal(isPerforming(actor), false);
  assert.equal(dialogs.seen.length, 2);
  const headless = endingBard();
  foundry.applications = undefined;
  await bardTurnEnd(headless);
  assert.equal(isPerforming(headless), false);
});

test("a Turn in which an Art was cast does not end the Performance", async () => {
  const actor = endingBard({ active: { ...ENDING, castsThisTurn: 1 } });
  stubDialogs([]);
  await bardTurnEnd(actor);
  assert.equal(isPerforming(actor), true);
});

test("combat end and Long Rest end the Performance, remove the Rising Crescendo and are undoable", async () => {
  for (const [ender, reason] of [[bardCombatEnd, "combatEnd"], [bardLongRest, "longRest"]]) {
    const actor = endingBard({ active: { ...ENDING, crescendo: 2 } });
    await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: CRESCENDO_EFFECT_ID, name: "Rising Crescendo", changes: [],
      flags: { ak5e: { bardCrescendo: { amount: 2, expiring: false } } } }]);
    assert.ok(crescendoEffect(actor), "precondition");
    stubDialogs(["none"]);
    await ender(actor);
    assert.equal(isPerforming(actor), false, reason);
    assert.equal(crescendoEffect(actor), null, `${reason}: the crescendo ends with the Performance`);
    const receipt = supporterUses.state(actor).undo.find(entry => entry.command === "endPerformance");
    assert.ok(receipt, `${reason}: recorded`);
    await supporterUses.undo(actor, receipt.id);
    assert.equal(isPerforming(actor), true, `${reason}: undo restores the Performance`);
  }
});

test("Cancel at combat end and at a Long Rest leaves the Performance running", async () => {
  const actor = endingBard();
  stubDialogs(["cancel", "cancel"]);
  await bardCombatEnd(actor);
  await bardLongRest(actor);
  assert.equal(isPerforming(actor), true);
});

test("a Rising Crescendo left on a Bard that is no longer Performing is removed at combat end", async () => {
  const actor = makeBard({ performances: [], active: null });
  await actor.createEmbeddedDocuments("ActiveEffect", [{ _id: CRESCENDO_EFFECT_ID, name: "Rising Crescendo", changes: [],
    flags: { ak5e: { bardCrescendo: { amount: 1, expiring: true } } } }]);
  await bardCombatEnd(actor);
  assert.equal(crescendoEffect(actor), null);
});

test("the combatEnd event and the Long Rest hook reach the flow through the registered hooks", async () => {
  const fresh = await import(`../scripts/bard-perform.mjs?u5=${++seq}`);
  fresh.registerBardPerformHooks();
  const combatant = endingBard();
  await emitAk5eEvent("combatEnd", { eventId: `ce-${seq}`, combatUuid: "Combat.u5", actorUuids: [combatant.uuid], round: 2, turn: null, raw: {} });
  assert.equal(isPerforming(combatant), false, "combat end");
  const sleeper = endingBard();
  await triggerLongRest(sleeper);
  assert.equal(isPerforming(sleeper), false, "Long Rest");
});

/* ---------------------------------------------------------------- the owner's prompt (GM client driving) */

function asOwnedByPlayer(actor) {
  PLAYER.active = true;
  actor.testUserPermission = (user, level) => user?.id === PLAYER.id && level === "OWNER";
  return actor;
}
const requestsIn = () => game.messages.filter(message => message.flags?.ak5e?.bardEndRequest);
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

/** Plays the owner's client: the request message is shown to PLAYER, whose answer is relayed back to the GM client. */
async function ownerAnswers(answers) {
  await tick();
  const [request] = requestsIn();
  assert.ok(request, "the GM client sent a request");
  assert.deepEqual(request.whisper ?? request.data?.whisper ?? [PLAYER.id], [PLAYER.id]);
  const gm = game.user;
  game.user = PLAYER;
  stubDialogs(answers);
  const before = game.messages.length;
  const answer = await handleBardEndRequest(request);
  game.user = gm;
  const reply = game.messages.slice(before).find(message => message.flags?.ak5e?.bardEndAnswer);
  return { answer, reply };
}

test("owner prompt: the player's choice comes back and the Performance ends keeping that Art", async () => {
  const actor = asOwnedByPlayer(endingBard());
  stubDialogs([]);
  const ending = endWithChoice(actor, "combatEnd", { timeoutMs: 2000 });
  const { answer, reply } = await ownerAnswers(["keep0"]);
  assert.deepEqual({ cancelled: answer.cancelled, keepArt: answer.keepArt }, { cancelled: false, keepArt: "Heroism" });
  assert.equal(handleBardEndAnswer(reply, PLAYER.id), true);
  await ending;
  assert.equal(isPerforming(actor), false);
});

test("owner prompt: Cancel keeps the Performance; a stranger's answer is ignored", async () => {
  const actor = asOwnedByPlayer(endingBard());
  stubDialogs([]);
  const ending = endWithChoice(actor, "combatEnd", { timeoutMs: 2000 });
  const { reply } = await ownerAnswers(["cancel"]);
  assert.equal(handleBardEndAnswer(reply, "someone-else"), false, "only the asked owner's answer counts");
  assert.equal(isPerforming(actor), true, "still waiting");
  assert.equal(handleBardEndAnswer(reply, PLAYER.id), true);
  assert.equal(await ending, null);
  assert.equal(isPerforming(actor), true, "Cancel leaves the Performance running");
});

test("owner prompt: no answer within the timeout ends the Performance keeping none", async () => {
  const actor = asOwnedByPlayer(endingBard());
  stubDialogs([]);
  await endWithChoice(actor, "combatEnd", { timeoutMs: 20 });
  assert.equal(isPerforming(actor), false);
});

test("a Long Rest asks the Bard's own client, never a stand-in: with the GM driving it still prompts locally", async () => {
  const actor = asOwnedByPlayer(endingBard());
  const dialogs = stubDialogs(["none"]);
  await bardLongRest(actor);
  assert.equal(requestsIn().length, 0, "no relay for a Long Rest (the rest runs on the owner's client)");
  assert.equal(dialogs.seen.length, 1);
  assert.equal(isPerforming(actor), false);
});

test("the sheet's End command uses the same flow (one prompt, Cancel writes nothing)", async () => {
  const actor = endingBard();
  const dialogs = stubDialogs(["cancel"]);
  const before = JSON.stringify(bardOf(actor));
  await bardPerformCommand(actor, "bardEndPerformance");
  assert.equal(dialogs.seen.length <= 1, true);
  assert.equal(JSON.stringify(bardOf(actor)), before);
});

test("registerBardPerformHooks is idempotent per module instance", async () => {
  const fresh = await import(`../scripts/bard-perform.mjs?u5=${++seq}`);
  fresh.registerBardPerformHooks();
  fresh.registerBardPerformHooks();
  registerBardPerformHooks();
  const actor = endingBard();
  stubDialogs([]);
  foundry.applications = undefined;
  await emitAk5eEvent("combatEnd", { eventId: `idem-${seq}`, combatUuid: "Combat.idem", actorUuids: [actor.uuid], raw: {} });
  assert.equal(isPerforming(actor), false);
  assert.equal(supporterUses.state(actor).undo.filter(entry => entry.command === "endPerformance").length, 1, "one end, not one per handler");
});
