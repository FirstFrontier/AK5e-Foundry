import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import { SUPPORTER_CLASS_ID, pbForLevel } from "../scripts/supporter-rules.mjs";
import { findAidDieEffect } from "../scripts/supporter-features.mjs";
import { supporterUses, registerSupporterPlans } from "../scripts/supporter-uses.mjs";
import { isPlayWarnings } from "../scripts/play-undo.mjs";
import { artAvailability } from "../scripts/arts-casting.mjs";
import {
  bardPerformPlans, bardPerformPanel, bardPerformCommand, bardPerformApi, bardTurnStart, bardTurnEnd,
  crescendoBonuses, crescendoFor, isPerforming, bardArtQuoteOptions, withPerformanceCast, CRESCENDO_EFFECT_ID,
  registerBardPerformHooks
} from "../scripts/bard-perform.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

registerSupporterPlans({ plans: bardPerformPlans });

const INSTRUMENT_ID = "lute0000000001";
const docsRef = { docs: null };
let rollCount = 0;

test.beforeEach(() => {
  setupFoundryGlobals();
  docsRef.docs = globalThis._ak5eTestDocs;
  rollCount = 0;
  globalThis.Roll = class CountingRoll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.total = null; }
    async evaluate() { rollCount += 1; this.total = 4; return this; }
    async toMessage() { rollCount += 1; return null; }
  };
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

const PERFORMANCE = {
  id: "P1",
  arts: [
    { name: "Bless", muse: 1, manual: false },
    { name: "Healing Word", muse: 2, manual: false },
    { name: "Heroism", muse: 2, manual: false }
  ],
  performed: false,
  composedAt: 100
};

/** A spell Item with a native activity whose `use` is a recording stub (no dialog, no roll). */
function artItem(actor, name, { level = 1, concentration = false, id = null } = {}) {
  const item = createTestItem({ id: id ?? `art${name.replace(/\W/g, "")}`, name, type: "spell", system: { level } }, actor);
  item.system.activities = new Map([["a1", { id: "a1", activation: { type: "action" }, use: async () => true }]]);
  item.requiresConcentration = concentration;
  actor.items.set(item.id, item);
  return item;
}

function bard({ level = 9, performances = [PERFORMANCE], flags = {}, instrument = true, cha = 16, arts = ["Bless", "Healing Word", "Heroism"], concentrationArts = [] } = {}) {
  const sClass = createTestItem({ name: "Supporter", type: "class", system: { levels: level }, flags: { ak5e: { chapterThreeId: SUPPORTER_CLASS_ID } } });
  const branch = createTestItem({ name: "Supporter: Bard", type: "subclass", flags: { ak5e: { chapterThreeId: "subclass-supporter-bard" } } });
  const actor = createTestActor({
    name: "Bard",
    items: [sClass, branch],
    system: { attributes: { prof: pbForLevel(level) }, abilities: { cha: { value: cha, mod: Math.floor((cha - 10) / 2) }, int: { value: 10, mod: 0 } } },
    flags: { ak5e: {
      supporter: { enabled: true, aidAbility: "cha", branch: "bard" },
      casting: { enabled: true, ability: "cha", castingUnit: instrument ? INSTRUMENT_ID : "" },
      artsPoints: { value: 10, maximum: 10, maximumArtLevel: 9, ninthLevelCast: false },
      bard: { performances, active: null, fontDie: false },
      ...flags
    } }
  });
  docsRef.docs.set(actor.uuid, actor);
  if (instrument) {
    const lute = createTestItem({ id: INSTRUMENT_ID, name: "Lute", type: "tool", system: { equipped: true, proficient: 1 } }, actor);
    actor.items.set(lute.id, lute);
  }
  for (const name of arts) artItem(actor, name, { concentration: concentrationArts.includes(name) });
  return actor;
}

const run = (actor, name, data = {}) => supporterUses.execute(actor, name, { confirmed: true, ...data }, foundry.utils.randomID());
const active = actor => actor.getFlag("ak5e", "bard").active;
const effectOf = actor => [...actor.effects.values()].find(effect => effect.id === CRESCENDO_EFFECT_ID) ?? null;
const startData = { performanceId: "P1" };

async function startAndFirstCast(actor, performanceId = "P1") {
  await run(actor, "startPerformance", { performanceId });
  return run(actor, "castNextArt", { performanceId, index: 0 });
}

/* ---------------------------------------------------------------- start and cast sequence */

test("start sets the Performance active at index 0, marks it performed and gives the Font die at 4th level", async () => {
  const actor = bard({ level: 9 });
  await run(actor, "startPerformance", startData);
  assert.equal(isPerforming(actor), true);
  assert.equal(active(actor).index, 0);
  assert.equal(active(actor).crescendo, 0);
  assert.equal(active(actor).castsThisTurn, 0);
  assert.equal(actor.getFlag("ak5e", "bard").performances[0].performed, true);
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, true);
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, INSTRUMENT_ID);
});

test("start rebuilds the performances array from the current state: only the started Performance is performed", () => {
  const actor = bard({ level: 9, performances: [
    { ...PERFORMANCE, id: "P0" }, { ...PERFORMANCE, id: "P1" }, { ...PERFORMANCE, id: "P2" }] });
  const plan = bardPerformPlans.startPerformance(actor, {}, { performanceId: "P1" });
  const updates = plan.apply({}, {});
  assert.deepEqual(updates["flags.ak5e.bard.performances"].map(entry => [entry.id, entry.performed]),
    [["P0", false], ["P1", true], ["P2", false]]);
  assert.deepEqual(updates["flags.ak5e.bard.performances"][0].arts, PERFORMANCE.arts, "the other entries are kept whole");
});

test("starting one of several Performances marks only that one performed and leaves the others as composed", async () => {
  const actor = bard({ level: 9, performances: [
    { ...PERFORMANCE, id: "P0" }, { ...PERFORMANCE, id: "P1" }, { ...PERFORMANCE, id: "P2" }] });
  await run(actor, "startPerformance", { performanceId: "P1" });
  assert.deepEqual(actor.getFlag("ak5e", "bard").performances.map(entry => entry.performed), [false, true, false]);
  const receipt = supporterUses.state(actor).undo.find(entry => entry.command === "startPerformance");
  await supporterUses.undo(actor, receipt.id);
  assert.deepEqual(actor.getFlag("ak5e", "bard").performances.map(entry => entry.performed), [false, false, false]);
});

test("casting in sequence advances the index and counts casts per Turn", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  assert.equal(active(actor).index, 1);
  assert.equal(active(actor).castsThisTurn, 1);
  assert.equal(active(actor).crescendo, 0, "the first Art adds no Rising Crescendo");
  assert.equal(effectOf(actor), null, "no crescendo effect after the first Art");
});

test("a second cast in the same Turn warns at level 9 and is allowed with Use anyway", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await assert.rejects(run(actor, "castNextArt", { performanceId: "P1", index: 1 }), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "turnLimit"));
  await run(actor, "castNextArt", { performanceId: "P1", index: 1, overrides: ["turnLimit"] });
  assert.equal(active(actor).index, 2);
  assert.equal(active(actor).castsThisTurn, 2);
});

test("Time Signature Change at level 10 allows a second cast in the same Turn without a warning", async () => {
  const actor = bard({ level: 10 });
  await startAndFirstCast(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  assert.equal(active(actor).index, 2);
  assert.equal(active(actor).castsThisTurn, 2);
  await assert.rejects(run(actor, "castNextArt", { performanceId: "P1", index: 2 }), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "turnLimit"));
});

test("a stale index is refused, and casting past the last Art is refused", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await assert.rejects(run(actor, "castNextArt", { performanceId: "P1", index: 0 }), /moved on/);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  // The last Art ended the Performance in that use (C3 L7108): nothing is left to cast.
  assert.equal(isPerforming(actor), false);
  await bardTurnStart(actor);
  await assert.rejects(run(actor, "castNextArt", { performanceId: "P1", index: 3 }), /not Performing/);
});

test("a missing equipped Instrument warns and can be overridden", async () => {
  const actor = bard({ level: 9, instrument: false });
  await assert.rejects(run(actor, "startPerformance", startData), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "instrument"));
  await run(actor, "startPerformance", { ...startData, overrides: ["instrument"] });
  assert.equal(isPerforming(actor), true);
});

/* ---------------------------------------------------------------- No Encore */

test("performing a Performance that was already performed warns (No Encore) and can be overridden", async () => {
  const actor = bard({ level: 9, performances: [{ ...PERFORMANCE, performed: true }] });
  await assert.rejects(run(actor, "startPerformance", startData), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "noEncore"));
  assert.equal(isPerforming(actor), false, "a refused start changes nothing");
  await run(actor, "startPerformance", { ...startData, overrides: ["noEncore"] });
  assert.equal(isPerforming(actor), true);
});

/* ---------------------------------------------------------------- crescendo */

test("crescendo math: +1 per Art after the first, cumulative (level 16)", async () => {
  const actor = bard({ level: 16, performances: [{ ...PERFORMANCE, arts: [...PERFORMANCE.arts, { name: "Bless", muse: 1, manual: false }] }], arts: ["Bless", "Healing Word", "Heroism"] });
  await run(actor, "startPerformance", startData);
  const values = [];
  for (let index = 0; index < 3; index += 1) {
    if (index > 0) await bardTurnStart(actor);
    await run(actor, "castNextArt", { performanceId: "P1", index });
    values.push(active(actor).crescendo);
  }
  assert.deepEqual(values, [0, 1, 2]);
  // The fourth (last) Art ends the Performance in its own use, and the crescendo is removed with it.
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 3 });
  assert.equal(isPerforming(actor), false);
  assert.deepEqual(crescendoBonuses(actor), { healing: 0, extraTargets: 0, saveDC: 0, spellAttack: 0 });
});

test("crescendo math at Fortissimo (level 17): each Art after the first counts as two", async () => {
  const actor = bard({ level: 17, performances: [{ ...PERFORMANCE, arts: [...PERFORMANCE.arts, { name: "Bless", muse: 1, manual: false }] }], arts: ["Bless", "Healing Word", "Heroism"] });
  await run(actor, "startPerformance", startData);
  const values = [];
  for (let index = 0; index < 3; index += 1) {
    if (index > 0) await bardTurnStart(actor);
    await run(actor, "castNextArt", { performanceId: "P1", index });
    values.push(active(actor).crescendo);
  }
  assert.deepEqual(values, [0, 2, 4]);
  assert.equal(crescendoFor(actor, 3), 6, "the fourth Art would count as the third pair (not reached: it ends the Performance)");
});

test("crescendo is an Active Effect on the Bard for Spell Save DC and Spell Attack, removed when the Performance ends", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  const effect = effectOf(actor);
  assert.ok(effect, "the crescendo effect exists");
  assert.equal(effect.flags.ak5e.bardCrescendo.amount, 1);
  const keys = effect.changes.map(change => change.key).sort();
  assert.deepEqual(keys, ["system.bonuses.msak.attack", "system.bonuses.rsak.attack", "system.bonuses.spell.dc"]);
  assert.ok(effect.changes.every(change => change.value === "1" && change.mode === 2));
  assert.deepEqual(crescendoBonuses(actor), { healing: 1, extraTargets: 1, saveDC: 1, spellAttack: 1 });
  await bardTurnStart(actor);
  // The last Art (index 2 of 3) ends the Performance in the same use: the crescendo effect is removed with it.
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  // The last Art keeps its own bonus for its native cast (expiring), and crescendoBonuses reads 0 once the Performance ended.
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.expiring, true, "the last Art's effect is kept, expiring");
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 2, "at the last Art's value");
  assert.deepEqual(crescendoBonuses(actor), { healing: 0, extraTargets: 0, saveDC: 0, spellAttack: 0 });
  await run(actor, "clearExpiringCrescendo", { confirmed: true });
  assert.equal(effectOf(actor), null, "the post-cast step removes the expiring effect");
});

/* ---------------------------------------------------------------- 0 AP cost through the Arts registry */

test("an Art cast as part of a Performance quotes 0 AP; the same Art outside a Performance costs its level", async () => {
  const actor = bard({ level: 9 });
  const item = actor.items.get("artBless");
  const outside = artAvailability(actor, item);
  assert.equal(outside.quote.cost, 1, "Bless is 1st level: normal cost outside a Performance");
  const inside = await withPerformanceCast(actor, item, () => artAvailability(actor, item));
  assert.equal(inside.quote.cost, 0);
  assert.equal(inside.quote.modifiers.at(-1).source, "Performance (no Arts Points)");
});

test("the Performance discount does not apply to other Arts of the same actor", async () => {
  const actor = bard({ level: 9, arts: ["Bless", "Healing Word"] });
  const healing = actor.items.get("artHealingWord");
  const outside = artAvailability(actor, healing).quote.cost;
  const during = await withPerformanceCast(actor, actor.items.get("artBless"), () => artAvailability(actor, healing));
  assert.equal(outside, 1);
  assert.equal(during.quote.cost, 1, "only the Performance Art is discounted");
});

test("bardArtQuoteOptions gives no discount outside a Performance cast", () => {
  const actor = bard({ level: 9 });
  assert.deepEqual(bardArtQuoteOptions(actor, actor.items.get("artBless")), {});
});

/* ---------------------------------------------------------------- manual Arts */

test("a manual Art posts a manual card that refers to DECISIONS and spends no AP", async () => {
  const actor = bard({ level: 9, performances: [{ id: "P1", performed: false, composedAt: 1, arts: [
    { name: "Bless", muse: 1, manual: false }, { name: "Tasha's Mind Whip", muse: 4, manual: true }, { name: "Heroism", muse: 2, manual: false }] }],
  arts: ["Bless", "Heroism"] });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  const result = await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  assert.equal(result.manual, true);
  assert.equal(result.artFound, false);
  assert.equal(actor.getFlag("ak5e", "artsPoints").value, 10, "no AP change from the state step");
});

/* ---------------------------------------------------------------- end and turn-end rule */

test("ending the Performance writes the end, restores the Casting Unit and keeps the record", async () => {
  const actor = bard({ level: 9, instrument: true, flags: { casting: { enabled: true, ability: "cha", castingUnit: "" } } });
  await startAndFirstCast(actor);
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, INSTRUMENT_ID);
  await run(actor, "endPerformance", { keepArt: null });
  assert.equal(isPerforming(actor), false);
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, "", "the prior Casting Unit is restored");
  assert.equal(actor.getFlag("ak5e", "bard").performances[0].performed, true);
});

test("turn end with no Art cast this Turn ends the Performance and records it", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await bardTurnEnd(actor);
  assert.equal(isPerforming(actor), false, "the Performance ended because no Art was cast this Turn");
  const receipt = supporterUses.state(actor).undo.at(-1);
  assert.equal(receipt.command, "endPerformance");
  assert.equal(receipt.data.reason, "turnEnd");
});

test("turn end after an Art was cast this Turn keeps the Performance active", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnEnd(actor);
  assert.equal(isPerforming(actor), true);
});

test("the turn-end rule is undoable through its receipt, restoring the Performance and the crescendo effect", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1, overrides: ["turnLimit"] });
  await bardTurnStart(actor);
  await bardTurnEnd(actor);
  assert.equal(isPerforming(actor), false, "no Art this Turn: the Performance ended");
  const receipt = supporterUses.state(actor).undo.at(-1);
  await supporterUses.undo(actor, receipt.id);
  assert.equal(isPerforming(actor), true);
  assert.equal(active(actor).index, 2);
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 1, "the crescendo effect is restored");
});

/* ---------------------------------------------------------------- Concentration hand-off */

test("the first Concentration Art ignores its own Concentration; keepArt names a concentration Art cast so far", async () => {
  const actor = bard({ level: 9, arts: ["Bless", "Healing Word", "Heroism"], concentrationArts: ["Bless", "Heroism"] });
  await run(actor, "startPerformance", startData);
  const first = await run(actor, "castNextArt", { performanceId: "P1", index: 0 });
  assert.equal(first.ignoreConcentration, true, "the first concentration Art is cast with its Concentration ignored");
  assert.deepEqual(active(actor).concentration, { artName: "Bless", index: 0 });
  await bardTurnStart(actor);
  const second = await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  assert.equal(second.ignoreConcentration, false, "Healing Word is not a concentration Art");
  await bardTurnStart(actor);
  // The last Art takes the keep-Concentration choice in its own use (C3 L7108): an Art not cast so far is refused.
  await assert.rejects(run(actor, "castNextArt", { performanceId: "P1", index: 2, keepArt: "Not cast" }), /Keep Concentration/);
  assert.equal(isPerforming(actor), true, "the refused last Art changes nothing");
  await run(actor, "castNextArt", { performanceId: "P1", index: 2, keepArt: "Bless" });
  assert.equal(isPerforming(actor), false);
  assert.equal(supporterUses.state(actor).undo.at(-1).command, "castNextArt");
});

/* ---------------------------------------------------------------- Font of Inspiration */

test("the Font die is gained at the start of each Turn while Performing and lost at the end of the Turn", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnEnd(actor);
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, false, "lost at the end of the Turn");
  await bardTurnStart(actor);
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, true, "gained at the start of the Turn while Performing");
});

test("Performing is a 1st-level feature: starting below 4th level gives no warning and no Font die", async () => {
  const low = bard({ level: 3, performances: [{ ...PERFORMANCE, arts: [{ name: "Bless", muse: 1, manual: false }] }], arts: ["Bless"] });
  await run(low, "startPerformance", startData);
  assert.equal(isPerforming(low), true);
  assert.equal(low.getFlag("ak5e", "bard").fontDie, false, "no Font die below 4th level");
  const idle = bard({ level: 9 });
  await bardTurnStart(idle);
  assert.equal(idle.getFlag("ak5e", "bard").fontDie, false, "no Font die when not Performing");
});

test("fontProvideAid gives an Aid Die to the target without spending the Aid Die pool and consumes the Font die", async () => {
  const actor = bard({ level: 9 });
  const ally = createTestActor({ name: "Ally", type: "character", owner: false, ownership: { default: 0 } });
  docsRef.docs.set(ally.uuid, ally);
  await startAndFirstCast(actor);
  const poolBefore = structuredClone(actor.getFlag("ak5e", "resourcePools") ?? null);
  await run(actor, "fontProvideAid", { targetUuid: ally.uuid, targetName: "Ally" });
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, false, "the Font die is consumed");
  assert.ok(findAidDieEffect(ally), "the target holds an Aid Die effect");
  assert.deepEqual(actor.getFlag("ak5e", "resourcePools") ?? null, poolBefore, "the Aid Die pool is not touched");
  assert.equal(findAidDieEffect(ally).flags.ak5e.featureTag.data.font, true);
});

test("undoing the Font aid restores the Font die and removes the Aid Die effect", async () => {
  const actor = bard({ level: 9 });
  const ally = createTestActor({ name: "Ally", type: "character", ownership: { default: 0 } });
  docsRef.docs.set(ally.uuid, ally);
  await startAndFirstCast(actor);
  const result = await run(actor, "fontProvideAid", { targetUuid: ally.uuid, targetName: "Ally" });
  assert.equal(result.font, true);
  const receipt = supporterUses.state(actor).undo.at(-1);
  await supporterUses.undo(actor, receipt.id);
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, true, "the Font die is restored");
  assert.equal(findAidDieEffect(ally), null, "the Aid Die effect is removed");
});

test("fontProvideAid with no Font die warns and can be overridden; it never targets the Bard itself", async () => {
  const actor = bard({ level: 9 });
  const ally = createTestActor({ name: "Ally", type: "character", ownership: { default: 0 } });
  docsRef.docs.set(ally.uuid, ally);
  await assert.rejects(run(actor, "fontProvideAid", { targetUuid: ally.uuid, targetName: "Ally" }), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "noFontDie"));
  await assert.rejects(run(actor, "fontProvideAid", { targetUuid: actor.uuid, targetName: "Bard", overrides: ["noFontDie"] }), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "selfTarget"));
});

/* ---------------------------------------------------------------- undo */

test("undo of the cast restores the index, the crescendo and the crescendo effect exactly", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  const before = structuredClone(active(actor));
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  assert.equal(active(actor), null, "the last Art ended the Performance in that use");
  await supporterUses.undo(actor, supporterUses.state(actor).undo.at(-1).id);
  assert.deepEqual(active(actor), { ...before, castsThisTurn: 0 }, "the index and turn count return to the state before the cast");
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 1, "the crescendo effect returns to its prior amount");
});

test("undo of the start restores active, performed and the Casting Unit", async () => {
  const actor = bard({ level: 9, flags: { casting: { enabled: true, ability: "cha", castingUnit: "" } } });
  await run(actor, "startPerformance", startData);
  const receipt = supporterUses.state(actor).undo.at(-1);
  await supporterUses.undo(actor, receipt.id);
  assert.equal(isPerforming(actor), false);
  assert.equal(actor.getFlag("ak5e", "bard").performances[0].performed, false);
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, "");
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, false);
});

/* ---------------------------------------------------------------- panel, commands and API */

test("the panel offers Start with data-supporter-cmd buttons and nothing for a non-Bard", () => {
  const actor = bard({ level: 9 });
  const html = bardPerformPanel(actor);
  assert.match(html, /data-supporter-cmd="bardStartPerformance"/);
  assert.doesNotMatch(html, /bardCastNextArt/);
  const plain = createTestActor({ name: "Plain", type: "character" });
  assert.equal(bardPerformPanel(plain), "");
});

test("bardPerformCommand returns undefined for commands it does not own", async () => {
  const actor = bard({ level: 9 });
  assert.equal(await bardPerformCommand(actor, "configureHexerArts"), undefined);
  assert.equal(await bardPerformCommand(actor, "undefinedCommand"), undefined);
});

test("bardPerformApi is frozen and exposes the state reads", () => {
  assert.equal(Object.isFrozen(bardPerformApi), true);
  assert.equal(typeof bardPerformApi.crescendoBonuses, "function");
  assert.equal(bardPerformApi.isPerforming(bard({ level: 9 })), false);
});

test("no Roll is evaluated by the Performance plans (dice are rolled only on the native card)", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1, overrides: ["turnLimit"] });
  await run(actor, "endPerformance", { keepArt: null });
  assert.equal(rollCount, 0);
});

test("the turn-start and turn-end handlers are registered once and fire on the Bard's events", async () => {
  const actor = bard({ level: 9 });
  registerBardPerformHooks();
  registerBardPerformHooks();
  await startAndFirstCast(actor);
  await emitAk5eEvent("turnEnd", { eventId: "t0", actorUuid: actor.uuid, round: 1, turn: 0 });
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, false, "the turn-end handler clears the Font die");
  assert.equal(isPerforming(actor), true, "an Art was cast this Turn, so the Performance continues");
  await emitAk5eEvent("turnStart", { eventId: "s1", actorUuid: actor.uuid, round: 2, turn: 0 });
  assert.equal(actor.getFlag("ak5e", "bard").fontDie, true, "the turn-start handler grants the Font die");
  assert.equal(active(actor).castsThisTurn, 0, "the turn-start handler resets the Turn's casts");
  await emitAk5eEvent("turnEnd", { eventId: "t1", actorUuid: actor.uuid, round: 2, turn: 0 });
  assert.equal(isPerforming(actor), false, "the turn-end handler ends a Performance with no Art this Turn");
});

/* ---------------------------------------------------------------- last Art ends at engine level (C3 L7108) */

test("the last Art ends the Performance in the same use: active cleared, crescendo removed, Casting Unit restored", async () => {
  const actor = bard({ level: 9, flags: { casting: { enabled: true, ability: "cha", castingUnit: "" } } });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 1);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  assert.equal(active(actor), null);
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.expiring, true, "the last Art's expiring effect is still present for its cast");
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 2, "at the last Art's value");
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, "", "the prior Casting Unit is restored");
  assert.equal(actor.getFlag("ak5e", "bard").performances[0].performed, true);
});

test("undo of the last Art restores active, the crescendo effect and the Instrument as Casting Unit exactly", async () => {
  const actor = bard({ level: 9, flags: { casting: { enabled: true, ability: "cha", castingUnit: "" } } });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  const before = structuredClone(active(actor));
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  await supporterUses.undo(actor, supporterUses.state(actor).undo.at(-1).id);
  assert.deepEqual(active(actor), { ...before, castsThisTurn: 0 }, "active returns to the state before the last Art");
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 1, "the crescendo effect returns");
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, INSTRUMENT_ID, "the Instrument is the Casting Unit again");
  assert.equal(isPerforming(actor), true);
});

test("the last Art with no concentration Art takes keepArt null and ends", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2, keepArt: null });
  assert.equal(isPerforming(actor), false);
});

/* ---------------------------------------------------------------- Instrument proficiency (C3 L7106, D) */

/** Adds a tool Item to the actor, registered like the Bard's own items. */
function addTool(actor, name, system = {}) {
  const tool = createTestItem({ name, type: "tool", system }, actor);
  actor.items.set(tool.id, tool);
  return tool;
}

test("no equipped Instrument: the start warns (overridable) and never blocks", async () => {
  const actor = bard({ level: 9, instrument: false });
  await assert.rejects(run(actor, "startPerformance", startData), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "instrument"));
  await run(actor, "startPerformance", { ...startData, overrides: ["instrument"] });
  assert.equal(isPerforming(actor), true);
});

test("an equipped Instrument recorded as not proficient warns 'not Proficient' and can be used anyway", async () => {
  const actor = bard({ level: 9, instrument: false });
  addTool(actor, "Lute", { equipped: true, proficient: 0 });
  await assert.rejects(run(actor, "startPerformance", startData), error => {
    const warning = isPlayWarnings(error) ? error.warnings.find(w => w.id === "instrument") : null;
    return Boolean(warning) && /not Proficient/.test(warning.text);
  });
  await run(actor, "startPerformance", { ...startData, overrides: ["instrument"] });
  assert.equal(isPerforming(actor), true);
});

test("undeterminable proficiency warns (overridable); a recorded Soul of the Bard instrument clears it", async () => {
  const actor = bard({ level: 9, instrument: false });
  addTool(actor, "Lute", { equipped: true });
  await assert.rejects(run(actor, "startPerformance", startData), error => isPlayWarnings(error) && error.warnings.some(w => w.id === "instrument"));
  await actor.update({ "flags.ak5e.bardSetup": { done: true, instruments: ["Lute"], performance: "proficient" } });
  await run(actor, "startPerformance", startData);
  assert.equal(isPerforming(actor), true, "the recorded Instrument counts as proficiency: no warning");
});

test("a tool item with system.proficient >= 1 is proficient: no warning, and it is the Casting Unit", async () => {
  const actor = bard({ level: 9, instrument: false });
  const flute = addTool(actor, "Flute", { equipped: true, proficient: 1 });
  await run(actor, "startPerformance", startData);
  assert.equal(isPerforming(actor), true);
  assert.equal(actor.getFlag("ak5e", "casting").castingUnit, flute.id);
});

/* ---------------------------------------------------------------- expiring crescendo for the last Art (C3 L7118) */

test("the last Art's expiring crescendo is removed by the turn end, even if the post-cast step never ran", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.expiring, true);
  await bardTurnEnd(actor);
  assert.equal(effectOf(actor), null, "turnEnd removes the expiring effect");
  assert.equal(isPerforming(actor), false);
});

test("starting a new Performance removes a leftover expiring crescendo, and undo of the start restores it", async () => {
  const actor = bard({ level: 9, performances: [PERFORMANCE, { ...PERFORMANCE, id: "P2", composedAt: 2 }] });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.expiring, true);
  await run(actor, "startPerformance", { performanceId: "P2" });
  assert.equal(effectOf(actor), null, "the new start removes the leftover expiring effect");
  const receipt = supporterUses.state(actor).undo.at(-1);
  await supporterUses.undo(actor, receipt.id);
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.expiring, true, "undo restores the expiring effect");
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 2);
});

test("the post-cast step removes the expiring effect, and its undo restores it at the last Art's value", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 2 });
  const cleared = await run(actor, "clearExpiringCrescendo", { confirmed: true });
  assert.equal(cleared.cleared, 2);
  assert.equal(effectOf(actor), null);
  await supporterUses.undo(actor, supporterUses.state(actor).undo.at(-1).id);
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.expiring, true, "undo restores the expiring effect");
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 2);
});

test("the post-cast step never removes a crescendo of a running Performance", async () => {
  const actor = bard({ level: 9 });
  await startAndFirstCast(actor);
  await bardTurnStart(actor);
  await run(actor, "castNextArt", { performanceId: "P1", index: 1 });
  const cleared = await run(actor, "clearExpiringCrescendo", { confirmed: true });
  assert.equal(cleared.cleared, 0);
  assert.equal(effectOf(actor)?.flags.ak5e.bardCrescendo.amount, 1, "the running Performance keeps its crescendo");
  assert.equal(isPerforming(actor), true);
});
