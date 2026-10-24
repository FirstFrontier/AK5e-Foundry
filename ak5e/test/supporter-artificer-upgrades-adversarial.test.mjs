/**
 * U6 adversarial challenge suite: Artificer Heavy Duty Upgrades (Supporter, Artificer branch).
 *
 * Behavior-level tests written from the source, not from the implementation.
 *  - Ch. 3 L6908-6925 (4th level: Basic Personality Matrix, Machine Personality table, Loaded for Bear, Automaton cap two).
 *  - Ch. 3 L6942-6950 (17th level: Armoured Core, two upgrades at creation, cap raised to three).
 *  - Ch. 3 L6954-7075 (Heavy Duty Upgrades: Artificer DC L6958, Automaton upgrades L6962-7052, Mobile Cover L7059-7074).
 *  - Ch. 6 L6583-6685 (Automaton variants: Platform has Ram, Air Support and Turret have Crossbows).
 * "C3:NNNN" below cites the source line. Where a summary disagrees with the source, the source wins.
 *
 * Head rulings: the Supporter rulings at the end of ak5e/DECISIONS.md (items 1-11, the Artificer DC in item 2) and the
 * brief's cap (A4) and recovery (A5) rulings. A6 is not written in DECISIONS.md, so no test here depends on it.
 *
 * Contract assumed by this file (the brief fixes the names, not every field; each guess is named here and listed in
 * the report):
 *  - ARTIFICER_UPGRADES entries: {id, name, target, restriction, action, uses, save, dice, summary}.
 *  - install data: {automatonUuid | coverId, upgradeId, timing}. Single installs use timing "creation".
 *  - use data: {automatonUuid | coverId, upgradeId, targets?}.
 *  - personality data: {automatonUuid, choice?}. A choice is stored; a plan without a choice is only a card.
 *  - flags.ak5e.automaton = {creator (uuid), variant ("platform"|"airSupport"|"turret"), upgrades (ids), personality,
 *    destroyed, upgradeUses?: {[upgradeId]: remaining}}.
 *  - flags.ak5e.artificer = {automatons: [uuid], covers: [{id, label, upgrades}]}.
 *  - Seeded upgrades on fixture actors are plain id strings. Cap and duplicate tests seed them so that a single
 *    install is the only action under test (creation-timing counts do not muddy the cap tests).
 *
 * Oracles (Artificer DC, PB, aid die, cap, rest recovery) are copied from the source and rulings, not from the code.
 * The module is loaded dynamically, so a missing module fails only the tests that need it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem, triggerLongRest, triggerShortRest
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";

/* ==========================================================================
   Oracles, loaders and fixtures
   ========================================================================== */

// C3:6557-6578 Proficiency Bonus column (the Supporter progression, shared by every branch).
const pbOf = level => Math.floor((level - 1) / 4) + 2;
// C3:6557-6578 Aid Die column: d8 at 1-6, d10 at 7-13, d12 at 14-20.
const dieOf = level => (level >= 14 ? "d12" : level >= 7 ? "d10" : "d8");
// C3:6958 Artificer DC = 8 + INT + PB. Oracle, not the implementation.
const artificerDCOf = (intMod, level) => 8 + intMod + pbOf(level);
// C3:6957-6958 / the Basic Personality Matrix roll, C3:6913-6921 (d6 table, in row order).
const PERSONALITY_TABLE = Object.freeze(["Taciturn", "Caring", "Excitable", "Warlike", "Nervous", "Analytic"]);
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 4 });

let upgradesModule = null, upgradesLoadError = null, plansRegistered = false;
// The loaded implementation module, for its exported use-max rule (set by ready()).
let AU = null;

/** Load the module once. A missing module fails only the tests that call artificer(). */
async function artificer() {
  if (!upgradesModule && !upgradesLoadError) {
    try { upgradesModule = await import("../scripts/artificer-upgrades.mjs"); }
    catch (error) { upgradesLoadError = error; }
  }
  assert.ok(upgradesModule, `ak5e/scripts/artificer-upgrades.mjs is not loadable yet: ${upgradesLoadError?.message ?? "unknown"}`);
  return upgradesModule;
}

// A fresh instance of the implementation module (cache-busted import), for a new session with its own hook guard.
let freshSeq = 0;
async function freshArtificerModule() {
  return import(`../scripts/artificer-upgrades.mjs?session=${++freshSeq}`);
}

/** Load the module and register its plans with the Supporter engine (once per file, as the hexer suite does). */
async function ready() {
  const A = await artificer();
  AU = A;
  if (!plansRegistered) {
    Uses.registerSupporterPlans({ plans: A.artificerUpgradePlans });
    plansRegistered = true;
  }
  // The rest-recovery hook is wired on a fresh module instance. The module guards its hooks with a per-instance
  // flag (correct for one persistent Foundry Hooks object), but the fixture builds a new Hooks mock for each test,
  // so each test loads a fresh instance to model a new session. Plans and rules stay on the shared instance AU.
  const session = await freshArtificerModule();
  session.registerArtificerUpgradeHooks();
  return A;
}

test.beforeEach(async () => {
  setupFoundryGlobals();
  Features.defineSupporterPools();
  const A = await artificer().catch(() => null);
  A?.defineArtificerUpgradePools?.();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/**
 * A Supporter on the Artificer branch at `level`. The branch is read from the subclass item (supporterProfile) and
 * also mirrored into flags.ak5e.supporter.branch. INT defaults to 3, so the Artificer DC differs from every other
 * ability-based DC.
 */
function makeArtificer({ level = 4, mods = {}, branch = "artificer", enabled = true, automatons = [], covers = [] } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [
    createTestItem({
      name: "Supporter", type: "class", system: { levels: level },
      flags: { ak5e: { chapterThreeId: "class-supporter" } }
    }),
    createTestItem({
      name: `Supporter: ${branch[0].toUpperCase()}${branch.slice(1)}`, type: "subclass", system: {},
      flags: { ak5e: { chapterThreeId: `subclass-supporter-${branch}` } }
    })
  ];
  return createTestActor({
    name: `Artificer L${level}`, level, items, abilities,
    hp: { value: 20, max: 20, temp: 0 },
    flags: {
      ak5e: {
        supporter: { enabled, branch },
        artificer: { automatons: [...automatons], covers: covers.map(c => ({ ...c, upgrades: [...(c.upgrades ?? [])] })) }
      }
    }
  });
}

/** A non-Artificer Supporter (Hexer branch), for the refusal tests. */
function makeOtherBranch(level = 4) {
  return makeArtificer({ level, branch: "hexer" });
}

/**
 * An Automaton owned by `creator` (default: the creator Artificer). The creator's flags.ak5e.artificer.automatons list
 * is updated to include the new uuid. `upgrades` seeds installed upgrade ids; `upgradeUses` seeds remaining uses.
 */
function makeAutomaton(creator, { variant = "platform", upgrades = [], upgradeUses, destroyed = false, personality = null, creatorUuid, name = "Automaton" } = {}) {
  const automaton = createTestActor({
    name, type: "npc",
    flags: {
      ak5e: {
        automaton: {
          creator: creatorUuid ?? creator.uuid, variant, upgrades: [...upgrades], personality, destroyed,
          // Recorded shape (head ruling): upgradeUses[id] = { used }. A seeded "remaining" becomes used = max - remaining.
          ...(upgradeUses ? { upgradeUses: seededUsed(creator, upgradeUses) } : {})
        }
      }
    }
  });
  if (creator && !creatorUuid) {
    const art = creator.flags.ak5e.artificer;
    art.automatons = [...(art.automatons ?? []), automaton.uuid];
  }
  return automaton;
}

/** A Mobile Cover on `artificer` (flags.ak5e.artificer.covers). */
function addCover(artificerActor, { id = "cover-1", upgrades = [] } = {}) {
  artificerActor.flags.ak5e.artificer.covers.push({ id, label: `Cover ${id}`, upgrades: [...upgrades] });
  return id;
}

/** Install plan data for an Automaton. Single installs use timing "creation" (see the header note). */
const installData = (automaton, upgradeId, extra = {}) => ({ automatonUuid: automaton.uuid, upgradeId, timing: "creation", ...extra });
const coverInstallData = (coverId, upgradeId, extra = {}) => ({ coverId, upgradeId, timing: "creation", ...extra });
const useData = (automaton, upgradeId, extra = {}) => ({ automatonUuid: automaton.uuid, upgradeId, ...extra });

/** Stub Roll. `total` is the value a user's click produces; every evaluate() is recorded. */
function rollSpy(total = 4) {
  const calls = [];
  globalThis.Roll = class SpyRoll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.total = null; }
    async evaluate() { calls.push(this.formula); this.total = total; return this; }
    async toMessage() { return undefined; }
    static async roll() { calls.push("Roll.roll"); throw new Error("Roll.roll must not run before the player clicks Roll"); }
  };
  return calls;
}

/** Click the use's roll button (the only path that rolls). */
const click = (actor, useId) => Uses.supporterUses.command(actor, "useRoll", { useId }, `roll-${useId}`);

/** Execute a confirmed use, with optional overrides in data. */
const run = (actor, name, data, opId) => Uses.supporterUses.execute(actor, name, data, opId);
const receiptOf = (actor, id) => Uses.supporterUses.receipt(actor, id);

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
async function rejectionOf(runCall) {
  try { await runCall(); return null; }
  catch (error) { return error; }
}

const warningText = ws => ws.map(w => `${w.id ?? ""} ${w.text ?? ""}`).join(" | ");
const hasWarning = (ws, rx) => ws.some(w => rx.test(`${w.id ?? ""} ${w.text ?? ""}`));
const overridesFor = ws => ws.map(w => w.id);
const levelWarning = ws => hasWarning(ws, /level/i);
const capWarning = ws => hasWarning(ws, /maximum|limit|at most|cap\b|too many/i);
const messageCount = () => game.messages.length;

/** Does the text contain the number as a standalone figure (so "10" does not match "100")? */
const hasFigure = (text, figure) => new RegExp(`(^|[^0-9])${figure}([^0-9]|$)`).test(text);

/** Does the receipt show a save DC of `dc` (e.g. "DC 16" or "DC: 16")? */
const showsDC = (receipt, dc) => new RegExp(`\\bDC\\D{0,4}${dc}\\b`).test(JSON.stringify(receipt ?? {}));

/** Upgrade id from either a string id or an object entry. */
const idOf = entry => (typeof entry === "string" ? entry : entry?.id ?? entry?.upgradeId ?? null);
const upgradeIdsOn = automaton => (automaton.flags?.ak5e?.automaton?.upgrades ?? []).map(idOf);
const coverUpgradeIds = (artificerActor, coverId) =>
  (artificerActor.flags?.ak5e?.artificer?.covers ?? []).find(c => c.id === coverId)?.upgrades?.map(idOf) ?? [];

/**
 * Use max of an upgrade for a creator, from the implementation's own upgradeUseMax (so "intMod" resolves to the
 * creator's INT modifier at use time). Returns 0 for a non-use upgrade.
 */
function useMaxOf(upgradeId, creator) {
  return AU.upgradeUseMax(AU.upgradeById(upgradeId), creator);
}

/** Seeded upgradeUses as recorded state: a "remaining" value r becomes { used: max - r }. */
function seededUsed(creator, remainingById) {
  const out = {};
  for (const [id, remaining] of Object.entries(remainingById)) {
    out[id] = { used: Math.max(0, useMaxOf(id, creator) - Number(remaining)) };
  }
  return out;
}

/**
 * Remaining uses of an Automaton upgrade: max - used, where used is flags.ak5e.automaton.upgradeUses[id].used
 * (recorded shape, head ruling) and max is resolved at read time from the Creator (fixture lookup by uuid).
 */
function usesOf(automaton, upgradeId) {
  const creator = globalThis.fromUuidSync?.(automaton.flags?.ak5e?.automaton?.creator) ?? null;
  const used = Number(automaton.flags?.ak5e?.automaton?.upgradeUses?.[upgradeId]?.used ?? 0);
  return useMaxOf(upgradeId, creator) - used;
}

/** Ability key of a save ("dex", "Dexterity", ...), compared on its first three letters. */
const abilityKey = save => String(save?.ability ?? save ?? "").toLowerCase().slice(0, 3);

/** Pick exactly one entry of the contract by its name (regex) and target. */
function entryFor(A, rx, target) {
  const hits = A.ARTIFICER_UPGRADES.filter(u => rx.test(u.name) && (!target || u.target === target));
  assert.equal(hits.length, 1, `exactly one ${target ?? "any"} upgrade matches ${rx}, found ${hits.length}`);
  return hits[0];
}

/** Recovery of a use after a rest: the creator completes a rest. */
const longRest = artificerActor => triggerLongRest(artificerActor);
const shortRest = artificerActor => triggerShortRest(artificerActor);

/* ==========================================================================
   Source spec for every Heavy Duty Upgrade (transcription oracle)
   ========================================================================== */

// Each row is copied from the source line cited in `src`. `figures` are numbers the entry must expose somewhere
// (range, radius, reach, distance or a DR value). `dice` is the number of Aid Dice rolled as damage or healing.
// `save` is the ability on a Saving Throw against the Artificer DC. `uses` is {recovery, shared, max?} where
// `shared` means both the Automaton and its Creator must complete the rest together (C3:6972-7045).
const SPEC_AUTOMATON = Object.freeze([
  { rx: /AEGIS/i, restriction: null, dice: null, save: null, uses: null, figures: [10],
    src: "C3:6964-6966 AEGIS: 10 ft sphere, Advantage on Saves against outside Arts; no dice, no uses" },
  { rx: /Arbalest/i, restriction: "turret", dice: 1, save: "dex", uses: null, figures: [80, 5, 3],
    src: "C3:6967-6971 Arbalest (Turret Only): 80 ft; 3 + one Aid Die Piercing; DEX save, 5 ft, one Aid Die Thunder; Once per Turn" },
  { rx: /Arts Detonator/i, restriction: null, dice: 3, save: "dex", uses: { recovery: "srlr", shared: true, max: 1 }, figures: [10],
    src: "C3:6972-6979 Arts Detonator: Reaction; 10 ft; DEX save; 3 Aid Dice Force; knocked 10 ft; shared SR/LR reset" },
  { rx: /Bombtail/i, restriction: "airSupport", dice: 5, save: "dex", uses: { recovery: "lr", shared: true, max: 1 }, figures: [60, 10],
    src: "C3:6980-6984 Bombtail (Air Support Only): 60 ft point; 10 ft sphere; DEX save; 5 Aid Dice Thunder; shared Long Rest reset" },
  { rx: /CASTLE/i, restriction: null, dice: 1, save: null, uses: null, figures: [5],
    src: "C3:6985-6991 CASTLE System: Reach 5 ft; hit = STR + one Aid Die Slashing; additional attack" },
  { rx: /Electroshock/i, restriction: null, dice: 3, save: "dex", uses: { recovery: "srlr", shared: true, max: 1 }, figures: [15],
    src: "C3:6992-6996 Electroshock Cables: 15 ft; DEX save; 3 Aid Dice Lightning; Stunned; shared SR/LR reset" },
  { rx: /Flamethrower/i, restriction: null, dice: 3, save: "dex", uses: { recovery: "srlr", shared: true, max: 1 }, figures: [20],
    src: "C3:6997-7005 Flamethrower: 20 ft Cone; DEX save; 3 Aid Dice Fire; Burning; shared SR/LR reset" },
  { rx: /Gas Projectors/i, restriction: null, dice: 2, save: "con", uses: { recovery: "lr", shared: true, max: 1 }, figures: [10],
    src: "C3:7006-7010 Gas Projectors: 10 ft sphere; CON save; 2 Aid Dice Poison; shared Long Rest reset" },
  { rx: /HOIST/i, restriction: "airSupport", dice: null, save: null, uses: null, figures: [5],
    src: "C3:7011-7013 HOIST System (Air Support Only): one Medium or smaller grab within 5 ft; no dice, no uses" },
  { rx: /Medical Dispenser/i, restriction: "platform", dice: 1, save: null, uses: { recovery: "sr", shared: true }, figures: [5],
    src: "C3:7014-7021 Medical Dispenser (Platform Only): 5 ft; 1 Aid Die heal; INT-mod uses; shared Short Rest reset" },
  { rx: /Mobility System/i, restriction: "turret", dice: null, save: null, uses: null, figures: [15],
    src: "C3:7022-7024 Mobility System (Turret Only): Walking Speed 15 ft" },
  { rx: /Raptor/i, restriction: null, dice: null, save: null, uses: null, figures: [4],
    src: "C3:7025-7027 Raptor Armour: Damage Reduction 4 against Physical Damage" },
  { rx: /Reconnaissance/i, restriction: null, dice: null, save: null, uses: null, figures: [30],
    src: "C3:7028-7032 Reconnaissance Suite: 30 ft bright cone, 30 ft dim light; no cover on weapon hits" },
  { rx: /Rotary Crossbow/i, restriction: "crossbow", dice: null, save: null, uses: null, figures: [],
    src: "C3:7033-7035 Rotary Crossbow (Requires Crossbow): once per Turn extra Crossbow attack" },
  { rx: /Search and Rescue/i, restriction: "platform", dice: null, save: "str", uses: null, figures: [],
    src: "C3:7036-7040 Search and Rescue Suite (Platform Only): STR save vs Artificer DC when unwilling" },
  { rx: /Smoke Launcher/i, restriction: null, dice: null, save: null, uses: { recovery: "sr", shared: true }, figures: [20],
    src: "C3:7041-7045 Smoke Launcher: 20 ft radius; INT-mod uses; shared Short Rest reset" },
  { rx: /Tracer Shots/i, restriction: "crossbow", dice: null, save: null, uses: null, figures: [],
    src: "C3:7046-7051 Tracer Shots (Requires Crossbow): Advantage on the next Ranged Attack" }
]);

const SPEC_COVER = Object.freeze([
  { rx: /Mounted Crossbow/i, restriction: null, dice: null, save: null, uses: null, figures: [5, 8],
    src: "C3:7061-7063 Mounted Crossbow: a Creature within 5 ft; Proficient with Int 8 or higher" },
  { rx: /Reinforced/i, restriction: null, dice: null, save: null, uses: null, figures: [],
    src: "C3:7064-7066 Reinforced: Three-Quarters Cover vs Ranged, Half Cover vs Melee" },
  { rx: /Stimulant/i, restriction: null, dice: 1, save: null, uses: null, figures: [5],
    src: "C3:7067-7071 Stimulant Vaporiser: 5 ft; one Aid Die Temporary HP; exhausted after one minute" },
  { rx: /Ultralight/i, restriction: null, dice: null, save: null, uses: null, figures: [5],
    src: "C3:7072-7074 Ultralight: an allied Creature within 5 ft uses a Bonus Action to shove" }
]);

/* ==========================================================================
   1. Exports, hooks and pools
   ========================================================================== */

test("EXP-1: ARTIFICER_UPGRADES is frozen, holds 17 Automaton and 4 Mobile Cover entries, with unique ids (C3:6962-7074)", async () => {
  const A = await ready();
  assert.ok(Object.isFrozen(A.ARTIFICER_UPGRADES), "the list is frozen");
  assert.equal(A.ARTIFICER_UPGRADES.filter(u => u.target === "automaton").length, 17, "17 Automaton upgrades");
  assert.equal(A.ARTIFICER_UPGRADES.filter(u => u.target === "cover").length, 4, "4 Mobile Cover upgrades");
  const ids = A.ARTIFICER_UPGRADES.map(u => u.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const entry of A.ARTIFICER_UPGRADES) assert.ok(Object.isFrozen(entry), `${entry.name} is frozen`);
});

test("EXP-2: the contract names are exported; the plans installUpgrade, useUpgrade and basicPersonalityMatrix exist", async () => {
  const A = await ready();
  for (const name of ["installUpgrade", "useUpgrade", "basicPersonalityMatrix"]) {
    assert.equal(typeof A.artificerUpgradePlans[name], "function", `plan ${name} exists`);
  }
  for (const name of ["upgradeCapFor", "upgradesAtCreation", "defineArtificerUpgradePools", "registerArtificerUpgradeHooks"]) {
    assert.equal(typeof A[name], "function", `${name} is a function`);
  }
  for (const name of ["artificerUpgradePanel", "artificerUpgradeApi", "artificerUpgradeCommand"]) {
    assert.ok(A[name], `${name} is exported`);
  }
});

test("EXP-3: upgradeCapFor is 2 below level 17 and 3 from level 17 (C3:6925 cap two, C3:6942-6950 Armoured Core)", async () => {
  const A = await ready();
  for (const level of [4, 5, 9, 13, 16]) assert.equal(A.upgradeCapFor(makeArtificer({ level })), 2, `level ${level}`);
  for (const level of [17, 18, 20]) assert.equal(A.upgradeCapFor(makeArtificer({ level })), 3, `level ${level}`);
});

test("EXP-4: upgradesAtCreation is 1 below level 17 and 2 from level 17 (C3:6923-6925, C3:6942-6950)", async () => {
  const A = await ready();
  for (const level of [4, 16]) assert.equal(A.upgradesAtCreation(makeArtificer({ level })), 1, `level ${level}`);
  for (const level of [17, 20]) assert.equal(A.upgradesAtCreation(makeArtificer({ level })), 2, `level ${level}`);
});

test("EXP-5: registerArtificerUpgradeHooks called twice registers its hooks once (no growth on the second call)", async () => {
  await ready();
  const session = await freshArtificerModule();
  const total = () => Array.from(globalThis.Hooks._hooks.values()).reduce((sum, list) => sum + list.length, 0);
  session.registerArtificerUpgradeHooks();
  const afterFirst = total();
  assert.ok(afterFirst > 0, "the hooks are registered at least once (rest recovery needs one)");
  session.registerArtificerUpgradeHooks();
  assert.equal(total(), afterFirst, "a second call adds no hook registration");
});

test("EXP-6: defineArtificerUpgradePools called twice does not throw", async () => {
  const A = await ready();
  assert.doesNotThrow(() => { A.defineArtificerUpgradePools(); A.defineArtificerUpgradePools(); });
});

/* ==========================================================================
   2. Transcription: every upgrade against its source
   ========================================================================== */

for (const row of SPEC_AUTOMATON) {
  test(`TR-A: ${row.src}`, async () => {
    const A = await ready();
    const entry = entryFor(A, row.rx, "automaton");
    assert.equal(entry.restriction ?? null, row.restriction, "restriction (variant) as in the source");
    if (row.dice === null) assert.ok(!entry.dice, "no Aid Dice in the source");
    else assert.equal(entry.dice?.count, row.dice, "Aid Dice count as in the source");
    if (row.save === null) assert.ok(!entry.save, "no Saving Throw in the source");
    else {
      assert.equal(abilityKey(entry.save), row.save, "Saving Throw ability as in the source");
      assert.equal(entry.save.dc, "artificer", "the DC is the Artificer DC (C3:6958)");
    }
    if (row.uses === null) assert.ok(!entry.uses, "no per-rest uses in the source");
    else {
      assert.equal(entry.uses?.recovery, row.uses.recovery, "recovery as in the source");
      assert.equal(Boolean(entry.uses?.sharedRest), row.uses.shared, "shared Automaton + Creator rest (A5)");
      if (row.uses.max !== undefined) assert.equal(entry.uses.max, row.uses.max, "uses per rest");
    }
    const text = JSON.stringify(entry);
    for (const figure of row.figures) assert.ok(hasFigure(text, figure), `the figure ${figure} appears in the entry`);
    assert.ok(typeof entry.summary === "string" && entry.summary.length > 0, "a summary is present");
  });
}

for (const row of SPEC_COVER) {
  test(`TR-C: ${row.src}`, async () => {
    const A = await ready();
    const entry = entryFor(A, row.rx, "cover");
    assert.equal(entry.restriction ?? null, row.restriction, "no restriction on Mobile Cover upgrades");
    if (row.dice === null) assert.ok(!entry.dice, "no Aid Dice in the source");
    else assert.equal(entry.dice?.count, row.dice, "Aid Dice count as in the source");
    assert.ok(!entry.save, "no Saving Throw in the source");
    assert.ok(!entry.uses, "no per-rest uses in the source");
    const text = JSON.stringify(entry);
    for (const figure of row.figures) assert.ok(hasFigure(text, figure), `the figure ${figure} appears in the entry`);
  });
}

test("TR-X1: Arbalest is Turret only, and Bombtail and HOIST are Air Support only (C3:6967, 6980, 7011)", async () => {
  const A = await ready();
  assert.equal(entryFor(A, /Arbalest/i, "automaton").restriction, "turret");
  assert.equal(entryFor(A, /Bombtail/i, "automaton").restriction, "airSupport");
  assert.equal(entryFor(A, /HOIST/i, "automaton").restriction, "airSupport");
});

test("TR-X2: Rotary Crossbow and Tracer Shots require a Crossbow (C3:7033, 7046)", async () => {
  const A = await ready();
  assert.equal(entryFor(A, /Rotary Crossbow/i, "automaton").restriction, "crossbow");
  assert.equal(entryFor(A, /Tracer Shots/i, "automaton").restriction, "crossbow");
});

test("TR-X3: Medical Dispenser and Search and Rescue are Platform only (C3:7014, 7036)", async () => {
  const A = await ready();
  assert.equal(entryFor(A, /Medical Dispenser/i, "automaton").restriction, "platform");
  assert.equal(entryFor(A, /Search and Rescue/i, "automaton").restriction, "platform");
});

test("TR-X4: Mobility System is Turret only (C3:7022)", async () => {
  const A = await ready();
  assert.equal(entryFor(A, /Mobility System/i, "automaton").restriction, "turret");
});

test("TR-X5: the Flamethrower Cone is 20 ft, DEX save vs Artificer DC, 3 Aid Dice Fire (C3:6997-7005)", async () => {
  const A = await ready();
  const flame = entryFor(A, /Flamethrower/i, "automaton");
  assert.equal(abilityKey(flame.save), "dex");
  assert.equal(flame.dice?.count, 3);
  assert.ok(hasFigure(JSON.stringify(flame), 20), "20 ft Cone");
  assert.match(JSON.stringify(flame), /fire/i, "Fire damage");
});

/* ==========================================================================
   3. Restriction mismatch: a warning, never a block (C3:6967, 6980, 7014, 7033)
   ========================================================================== */

test("RS-1: Arbalest (Turret Only) on a Platform warns, and the install goes through once overridden", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const platform = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(platform, entryFor(A, /Arbalest/i, "automaton").id)));
  assert.ok(ws.length > 0, "a Turret-only upgrade on a Platform warns");
  assert.ok(hasWarning(ws, /turret|variant|only|restrict|platform/i), `the warning names the restriction, got: ${warningText(ws)}`);
  await run(s, "installUpgrade", installData(platform, entryFor(A, /Arbalest/i, "automaton").id, { overrides: overridesFor(ws) }), "rs1-op");
  assert.ok(upgradeIdsOn(platform).includes(entryFor(A, /Arbalest/i, "automaton").id), "the overridden install is applied");
});

test("RS-2: Rotary Crossbow on a Platform (which has a Ram, not a Crossbow) warns (C3:7033, Ch.6 L6583-6615)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const platform = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(platform, entryFor(A, /Rotary Crossbow/i, "automaton").id)));
  assert.ok(ws.length > 0, "a Crossbow upgrade on a Ram Platform warns");
});

test("RS-3: Bombtail (Air Support Only) on a Turret warns", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const turret = makeAutomaton(s, { variant: "turret" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(turret, entryFor(A, /Bombtail/i, "automaton").id)));
  assert.ok(ws.length > 0, "an Air Support upgrade on a Turret warns");
});

test("RS-4: the matching variant raises no restriction warning (Arbalest on Turret, Rotary Crossbow on Air Support, Medical on Platform)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const turret = makeAutomaton(s, { variant: "turret" });
  const air = makeAutomaton(s, { variant: "airSupport" });
  const platform = makeAutomaton(s, { variant: "platform" });
  const cases = [
    [turret, entryFor(A, /Arbalest/i, "automaton")],
    [air, entryFor(A, /Rotary Crossbow/i, "automaton")],
    [platform, entryFor(A, /Medical Dispenser/i, "automaton")]
  ];
  for (const [automaton, entry] of cases) {
    const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(automaton, entry.id)));
    assert.equal(ws.length, 0, `${entry.name} on ${automaton.flags.ak5e.automaton.variant}: no warning, got: ${warningText(ws)}`);
  }
});

test("RS-5: a restriction mismatch is not a block: without the override nothing is installed; with it the upgrade lands", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const platform = makeAutomaton(s, { variant: "platform" });
  const id = entryFor(A, /Arbalest/i, "automaton").id;
  const error = await rejectionOf(() => run(s, "installUpgrade", installData(platform, id), "rs5-blocked"));
  assert.ok(error, "an unoverridden warning stops the first run");
  assert.deepEqual(upgradeIdsOn(platform), [], "the blocked install changes nothing");
  await run(s, "installUpgrade", installData(platform, id, { overrides: [...((await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(platform, id)))).map(w => w.id))] }), "rs5-anyway");
  assert.ok(upgradeIdsOn(platform).includes(id), "the overridden install is applied");
});

/* ==========================================================================
   4. Cap (A4): two per Automaton or Mobile Cover, three from level 17 (C3:6925, C3:6942-6950)
   ========================================================================== */

// Upgrades that carry no variant restriction, so a cap warning is the only warning.
const UNRESTRICTED = [/AEGIS/i, /Raptor/i, /Reconnaissance/i, /CASTLE/i, /Arts Detonator/i];

test("CAP-1: a 3rd upgrade on an Automaton at level 16 warns (cap two, C3:6925)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 16 });
  const ids = UNRESTRICTED.map(rx => entryFor(A, rx, "automaton").id);
  const auto = makeAutomaton(s, { variant: "platform", upgrades: ids.slice(0, 2) });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, ids[2])));
  assert.ok(capWarning(ws), `the third install warns on the cap, got: ${warningText(ws)}`);
});

test("CAP-2: a 3rd upgrade on an Automaton at level 17 is allowed with no cap warning (C3:6942-6950)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 17 });
  const ids = UNRESTRICTED.map(rx => entryFor(A, rx, "automaton").id);
  const auto = makeAutomaton(s, { variant: "platform", upgrades: ids.slice(0, 2) });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, ids[2])));
  assert.equal(ws.length, 0, `a clean 3rd install at level 17, got: ${warningText(ws)}`);
});

test("CAP-3: a 4th upgrade on an Automaton at level 17 warns (the cap is three, not four)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 17 });
  const ids = UNRESTRICTED.map(rx => entryFor(A, rx, "automaton").id);
  const auto = makeAutomaton(s, { variant: "platform", upgrades: ids.slice(0, 3) });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, ids[3])));
  assert.ok(capWarning(ws), `the fourth install warns, got: ${warningText(ws)}`);
});

test("CAP-4: a 2nd upgrade at level 16 is allowed with no cap warning (boundary, C3:6925)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 16 });
  const ids = UNRESTRICTED.map(rx => entryFor(A, rx, "automaton").id);
  const auto = makeAutomaton(s, { variant: "platform", upgrades: ids.slice(0, 1) });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, ids[1])));
  assert.equal(ws.length, 0, `a clean 2nd install, got: ${warningText(ws)}`);
});

test("CAP-5: Mobile Cover uses the same cap: a 3rd cover upgrade at level 16 warns, at 17 it does not, and a 4th at 17 warns", async () => {
  const A = await ready();
  const coverIds = ["Reinforced", "Ultralight", "Stimulant", "Mounted Crossbow"].map(n => entryFor(A, new RegExp(n, "i"), "cover").id);

  const s16 = makeArtificer({ level: 16, covers: [{ id: "c16", upgrades: coverIds.slice(0, 2) }] });
  const ws16 = await warningsOf(() => Uses.supporterUses.plan(s16, "installUpgrade", coverInstallData("c16", coverIds[2])));
  assert.ok(capWarning(ws16), `a 3rd cover upgrade at level 16 warns, got: ${warningText(ws16)}`);

  const s17 = makeArtificer({ level: 17, covers: [{ id: "c17", upgrades: coverIds.slice(0, 2) }] });
  const ws17 = await warningsOf(() => Uses.supporterUses.plan(s17, "installUpgrade", coverInstallData("c17", coverIds[2])));
  assert.equal(ws17.length, 0, `a 3rd cover upgrade at level 17 is clean, got: ${warningText(ws17)}`);

  const s17b = makeArtificer({ level: 17, covers: [{ id: "c17b", upgrades: coverIds.slice(0, 3) }] });
  const ws17b = await warningsOf(() => Uses.supporterUses.plan(s17b, "installUpgrade", coverInstallData("c17b", coverIds[3])));
  assert.ok(capWarning(ws17b), `a 4th cover upgrade at level 17 warns, got: ${warningText(ws17b)}`);
});

test("CAP-6: the cap is per Automaton: a full Automaton does not block a fresh one", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 16 });
  const ids = UNRESTRICTED.map(rx => entryFor(A, rx, "automaton").id);
  const full = makeAutomaton(s, { variant: "platform", upgrades: ids.slice(0, 2) });
  const fresh = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(fresh, ids[0])));
  assert.equal(ws.length, 0, `the fresh Automaton takes its first upgrade cleanly, got: ${warningText(ws)}`);
  assert.ok(full.flags.ak5e.automaton.upgrades.length === 2, "the full Automaton is unchanged by planning");
});

test.todo("CAP-7: a creation-time second upgrade at level 16 is refused by upgradesAtCreation (1 below 17). Gap: how a creation batch is identified is not in the contract.");

/* ==========================================================================
   5. Duplicates (C3:6923 Loaded for Bear: an Upgrade is one of the list)
   ========================================================================== */

test("DUP-1: the same upgrade twice on one Automaton warns (overridable)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const id = entryFor(A, /AEGIS/i, "automaton").id;
  const auto = makeAutomaton(s, { variant: "platform", upgrades: [id] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, id)));
  assert.ok(hasWarning(ws, /already|duplicate|twice|same|installed/i), `a duplicate warning, got: ${warningText(ws)}`);
});

test("DUP-2: the same upgrade on two different Automatons is not a duplicate", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const id = entryFor(A, /AEGIS/i, "automaton").id;
  const first = makeAutomaton(s, { variant: "platform", upgrades: [id] });
  const second = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(second, id)));
  assert.equal(ws.length, 0, `no duplicate warning across Automatons, got: ${warningText(ws)}`);
  assert.ok(first, "the first Automaton exists");
});

test("DUP-3: a duplicate warning does not change the Automaton until it is overridden", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const id = entryFor(A, /AEGIS/i, "automaton").id;
  const auto = makeAutomaton(s, { variant: "platform", upgrades: [id] });
  const before = [...upgradeIdsOn(auto)];
  await rejectionOf(() => run(s, "installUpgrade", installData(auto, id), "dup3-blocked"));
  assert.deepEqual(upgradeIdsOn(auto), before, "the blocked duplicate changes nothing");
});

test.todo("DUP-4: whether an overridden duplicate is actually stored twice. Gap: the brief says it warns; it does not say whether the override may store a second copy.");

/* ==========================================================================
   6. Wrong target: a cover upgrade on an Automaton, or an Automaton upgrade on a cover, is REJECTED
   (a technical impossibility, not a warning; C3:6967-7074 "Automaton" vs "Mobile Cover")
   ========================================================================== */

test("WT-1: a Mobile Cover upgrade installed on an Automaton is rejected with an Error, not a warning", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const coverUp = entryFor(A, /Reinforced/i, "cover");
  const error = await rejectionOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, coverUp.id)));
  assert.ok(error instanceof Error, "a clear rejection");
  assert.notEqual(error.name, "AK5eWarnings", "it is not a warning");
  assert.notEqual(error.name, "TypeError", "it is a clear error, not a TypeError");
  assert.deepEqual(upgradeIdsOn(auto), [], "nothing is installed");
});

test("WT-2: the rejection holds even when every warning is overridden", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const coverUp = entryFor(A, /Reinforced/i, "cover");
  const error = await rejectionOf(() => run(s, "installUpgrade", installData(auto, coverUp.id, { overrides: [coverUp.id, "wrong-target", "cover", "automaton"] }), "wt2-op"));
  assert.ok(error instanceof Error && error.name !== "AK5eWarnings", "an override does not turn the rejection into an install");
  assert.deepEqual(upgradeIdsOn(auto), [], "nothing is installed");
  assert.equal(receiptOf(s, "wt2-op"), null, "no receipt is written for a rejected install");
});

test("WT-3: an Automaton upgrade installed on a Mobile Cover is rejected with an Error", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8, covers: [{ id: "c1", upgrades: [] }] });
  const autoUp = entryFor(A, /AEGIS/i, "automaton");
  const error = await rejectionOf(() => Uses.supporterUses.plan(s, "installUpgrade", coverInstallData("c1", autoUp.id)));
  assert.ok(error instanceof Error, "a clear rejection");
  assert.notEqual(error.name, "AK5eWarnings", "it is not a warning");
  assert.deepEqual(coverUpgradeIds(s, "c1"), [], "the cover is unchanged");
});

/* ==========================================================================
   7. useUpgrade: save DC, roll buttons, nothing rolled automatically, uses and undo
   ========================================================================== */

test("USE-1: Flamethrower at level 14 posts a DEX save at DC 8 + INT + PB of the Creator, and a 3d12 roll button (C3:6997-7005)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14, mods: { int: 3, wis: 1, cha: 4 } });
  const auto = makeAutomaton(s, { variant: "platform" });
  const flame = entryFor(A, /Flamethrower/i, "automaton");
  await run(s, "installUpgrade", installData(auto, flame.id), "use1-install");
  const calls = rollSpy();
  await run(s, "useUpgrade", useData(auto, flame.id), "use1-op");
  const receipt = receiptOf(s, "use1-op");
  assert.ok(receipt, "the use is recorded");
  assert.ok(showsDC(receipt, artificerDCOf(3, 14)), `DC ${artificerDCOf(3, 14)} (8 + INT 3 + PB ${pbOf(14)}), got ${JSON.stringify(receipt).slice(0, 300)}`);
  assert.match(JSON.stringify(receipt), /dex/i, "the save is DEX");
  assert.ok(JSON.stringify(receipt).includes(`3${dieOf(14)}`), "the roll button is 3d12 at level 14");
  assert.deepEqual(calls, [], "nothing is rolled automatically");
});

test("USE-2: the save DC uses the Creator's INT, not WIS or CHA (C3:6958)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14, mods: { int: 1, wis: 5, cha: 6 } });
  const auto = makeAutomaton(s, { variant: "platform" });
  const flame = entryFor(A, /Flamethrower/i, "automaton");
  await run(s, "installUpgrade", installData(auto, flame.id), "use2-install");
  await run(s, "useUpgrade", useData(auto, flame.id), "use2-op");
  const receipt = receiptOf(s, "use2-op");
  assert.ok(showsDC(receipt, artificerDCOf(1, 14)), `DC ${artificerDCOf(1, 14)} from INT 1, got ${JSON.stringify(receipt).slice(0, 300)}`);
  assert.equal(showsDC(receipt, artificerDCOf(5, 14)) || showsDC(receipt, artificerDCOf(6, 14)), false, "not the WIS or CHA DC");
});

test("USE-3: the DC tracks the Proficiency Bonus: level 5 gives DC 14 with INT 3 and 3d8 (C3:6557-6578, C3:6958)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 5, mods: { int: 3 } });
  const auto = makeAutomaton(s, { variant: "platform" });
  const flame = entryFor(A, /Flamethrower/i, "automaton");
  await run(s, "installUpgrade", installData(auto, flame.id), "use3-install");
  await run(s, "useUpgrade", useData(auto, flame.id), "use3-op");
  const receipt = receiptOf(s, "use3-op");
  assert.ok(showsDC(receipt, artificerDCOf(3, 5)), `DC ${artificerDCOf(3, 5)}`);
  assert.ok(JSON.stringify(receipt).includes(`3${dieOf(5)}`), `3${dieOf(5)} at level 5`);
});

test("USE-4: the aid die steps up at level 7 (d10) and 14 (d12): 3d8 at 6, 3d10 at 7, 3d10 at 13, 3d12 at 14 (C3:6557-6578)", async () => {
  const A = await ready();
  const flame = entryFor(A, /Flamethrower/i, "automaton");
  for (const [level, die] of [[6, "d8"], [7, "d10"], [13, "d10"], [14, "d12"]]) {
    const s = makeArtificer({ level, mods: { int: 3 } });
    const auto = makeAutomaton(s, { variant: "platform" });
    await run(s, "installUpgrade", installData(auto, flame.id), `use4-install-${level}`);
    rollSpy();
    await run(s, "useUpgrade", useData(auto, flame.id), `use4-op-${level}`);
    assert.ok(JSON.stringify(receiptOf(s, `use4-op-${level}`)).includes(`3${die}`), `level ${level} rolls 3${die}`);
    assert.equal(die, dieOf(level), "oracle sanity");
  }
});

test("USE-5: nothing is rolled by the use: a roll happens only on the user's click (no Roll call during execute)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const med = entryFor(A, /Medical Dispenser/i, "automaton");
  await run(s, "installUpgrade", installData(auto, med.id), "use5-install");
  const calls = rollSpy(7);
  await run(s, "useUpgrade", useData(auto, med.id), "use5-op");
  assert.deepEqual(calls, [], "no evaluate and no Roll.roll during the use");
  // Upgrade damage and heal rolls are buttons on the upgrade's own chat card (renderArtificerCardButtons), not the
  // engine's awaiting-roll path. The card must carry a 1<aid die> roll button at level 14, and nothing rolled.
  const cards = game.messages.map(message => String(message.content ?? "")).join("\n");
  assert.ok(cards.includes(`data-ak5e-upgrade-roll="1${dieOf(14)}"`), `the card carries a 1${dieOf(14)} roll button`);
  assert.deepEqual(calls, [], "posting the card rolls nothing");
});

test("USE-6: Bombtail spends its single use and the Automaton's remaining uses fall to 0 (C3:6980-6984)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "use6-install");
  assert.equal(usesOf(auto, bomb.id), 1, "one use after install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "use6-op");
  assert.equal(usesOf(auto, bomb.id), 0, "the use is spent");
});

test("USE-7: an over-use warns; with the override the uses clamp at 0 (never negative) and the shortfall is recorded", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "use7-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "use7-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "useUpgrade", useData(auto, bomb.id)));
  assert.ok(ws.length > 0, "a second use with no uses left warns");
  await run(s, "useUpgrade", useData(auto, bomb.id, { overrides: overridesFor(ws) }), "use7-second");
  assert.equal(usesOf(auto, bomb.id), 0, "clamped at 0, not -1");
  assert.ok(JSON.stringify(receiptOf(s, "use7-second") ?? {}).match(/short/i), "the shortfall is recorded on the receipt");
});

test("USE-8: undo of a use restores the uses exactly (1 for Bombtail, not 0 and not 2)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "use8-install");
  const prior = usesOf(auto, bomb.id);
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "use8-op");
  await Uses.supporterUses.undo(s, "use8-op");
  assert.equal(usesOf(auto, bomb.id), prior, "the uses are restored exactly");
});

test("USE-9: an unknown upgradeId is rejected clearly, with no receipt and no change", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const error = await rejectionOf(() => Uses.supporterUses.plan(s, "useUpgrade", useData(auto, "no-such-upgrade")));
  assert.ok(error instanceof Error, "a clear rejection");
  assert.notEqual(error.name, "TypeError", "not a TypeError");
  assert.match(error.message, /upgrade/i, "the message names the upgrade");
  const error2 = await rejectionOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, "no-such-upgrade")));
  assert.ok(error2 instanceof Error && error2.name !== "TypeError", "install rejects an unknown id too");
  assert.deepEqual(upgradeIdsOn(auto), [], "nothing is installed");
  assert.equal(A.ARTIFICER_UPGRADES.some(u => u.id === "no-such-upgrade"), false, "the fixture id is not a real upgrade");
});

test("USE-10: a Mobile Cover Stimulant Vaporiser rolls one Aid Die on click (1d8 at level 4, C3:7067-7071)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4, covers: [{ id: "c1", upgrades: [entryFor(A, /Stimulant/i, "cover").id] }] });
  const stim = entryFor(A, /Stimulant/i, "cover");
  const calls = rollSpy(3);
  await run(s, "useUpgrade", { coverId: "c1", upgradeId: stim.id }, "use10-op");
  assert.ok(JSON.stringify(receiptOf(s, "use10-op")).includes(`1${dieOf(4)}`), `1${dieOf(4)} roll button`);
  assert.deepEqual(calls, [], "nothing rolled automatically");
});

test.todo("USE-11: useUpgrade on an upgrade that is not installed on that Automaton. Gap: the brief does not say whether this is a warning or a rejection.");
test.todo("USE-12: a Creator who is not the Automaton's creator uses it. Gap: the brief pins the install warning only; the use rule is not stated.");

/* ==========================================================================
   8. Recovery (A5): creator's rest restores uses per type; shared uses stop when destroyed
   ========================================================================== */

test("REC-1: a Long Rest of the Creator restores a Long-Rest use (Bombtail back to 1, C3:6980-6984)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "rec1-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "rec1-op");
  assert.equal(usesOf(auto, bomb.id), 0);
  await longRest(s);
  assert.equal(usesOf(auto, bomb.id), 1, "restored on the Creator's Long Rest");
});

test("REC-2: a Short Rest does not restore a Long-Rest-only use (Bombtail stays spent, A5)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "rec2-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "rec2-op");
  await shortRest(s);
  assert.equal(usesOf(auto, bomb.id), 0, "still spent after a Short Rest");
});

test("REC-3: a Short Rest restores a Short-Rest use (Medical Dispenser) when both rest together (C3:7014-7021)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14, mods: { int: 3 } });
  const auto = makeAutomaton(s, { variant: "platform" });
  const med = entryFor(A, /Medical Dispenser/i, "automaton");
  await run(s, "installUpgrade", installData(auto, med.id), "rec3-install");
  rollSpy();
  for (let i = 0; i < 3; i++) await run(s, "useUpgrade", useData(auto, med.id), `rec3-op-${i}`);
  assert.equal(usesOf(auto, med.id), 0);
  await shortRest(s);
  assert.equal(usesOf(auto, med.id), 3, "restored to the INT modifier on a Short Rest");
});

test("REC-4: a destroyed Automaton does not recover its shared uses on the Creator's Long Rest (A5)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "rec4-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "rec4-op");
  await auto.update({ "flags.ak5e.automaton.destroyed": true });
  await longRest(s);
  assert.equal(usesOf(auto, bomb.id), 0, "a destroyed Automaton's shared use stays spent");
});

test("REC-5: a destroyed Automaton does not recover a Short-Rest shared use either (Medical Dispenser, A5)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14, mods: { int: 3 } });
  const auto = makeAutomaton(s, { variant: "platform" });
  const med = entryFor(A, /Medical Dispenser/i, "automaton");
  await run(s, "installUpgrade", installData(auto, med.id), "rec5-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, med.id), "rec5-op");
  await auto.update({ "flags.ak5e.automaton.destroyed": true });
  await shortRest(s);
  assert.equal(usesOf(auto, med.id), 2, "the destroyed Automaton keeps its spent use");
});

test("REC-6: a Long Rest restores the Flamethrower use (srlr) when the Automaton is intact (C3:6997-7005)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const flame = entryFor(A, /Flamethrower/i, "automaton");
  await run(s, "installUpgrade", installData(auto, flame.id), "rec6-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, flame.id), "rec6-op");
  assert.equal(usesOf(auto, flame.id), 0);
  await longRest(s);
  assert.equal(usesOf(auto, flame.id), 1, "restored on the Long Rest");
});

test("REC-7: a rest of a different Artificer does not restore my Automaton's uses", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const other = makeArtificer({ level: 14 });
  const auto = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(auto, bomb.id), "rec7-install");
  rollSpy();
  await run(s, "useUpgrade", useData(auto, bomb.id), "rec7-op");
  await longRest(other);
  assert.equal(usesOf(auto, bomb.id), 0, "another Creator's rest does not recover it");
});

test("REC-8: a Long Rest recovers every Automaton the Creator owns (two Automatons, both restored)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 14 });
  const a1 = makeAutomaton(s, { variant: "airSupport" });
  const a2 = makeAutomaton(s, { variant: "airSupport" });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  await run(s, "installUpgrade", installData(a1, bomb.id), "rec8-install-1");
  await run(s, "installUpgrade", installData(a2, bomb.id), "rec8-install-2");
  rollSpy();
  await run(s, "useUpgrade", useData(a1, bomb.id), "rec8-op-1");
  await run(s, "useUpgrade", useData(a2, bomb.id), "rec8-op-2");
  await longRest(s);
  assert.equal(usesOf(a1, bomb.id), 1, "first Automaton restored");
  assert.equal(usesOf(a2, bomb.id), 1, "second Automaton restored");
});

test.todo("REC-9: a Long Rest restores a Short-Rest-only use (Medical Dispenser). Gap: the source says only 'a Short Rest at the same time'; whether a Long Rest also resets it is not stated.");

/* ==========================================================================
   9. Basic Personality Matrix (C3:6911-6921)
   ========================================================================== */

test("PER-1: planning the personality never rolls and stores nothing", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const calls = rollSpy();
  Uses.supporterUses.plan(s, "basicPersonalityMatrix", { automatonUuid: auto.uuid });
  assert.deepEqual(calls, [], "the plan itself never rolls");
  assert.equal(auto.flags.ak5e.automaton.personality, null, "nothing is stored by the plan");
  assert.ok(A, "module loaded");
});

test("PER-2: the d6 Machine Personality table maps 1-6 to Taciturn, Caring, Excitable, Warlike, Nervous, Analytic (C3:6913-6921)", async () => {
  await ready();
  const s = makeArtificer({ level: 4 });
  for (const [index, name] of PERSONALITY_TABLE.entries()) {
    const total = index + 1;
    const auto = makeAutomaton(s, { variant: "platform" });
    const opId = `per2-${total}`;
    const calls = rollSpy(total);
    await run(s, "basicPersonalityMatrix", { automatonUuid: auto.uuid }, opId);
    assert.deepEqual(calls, [], `roll ${total}: nothing rolled before the click`);
    await click(s, opId);
    assert.ok(calls.includes("1d6"), `roll ${total}: the click rolls 1d6, saw ${calls.join(", ")}`);
    assert.equal(auto.flags.ak5e.automaton.personality, name, `roll ${total} gives ${name}`);
  }
});

test("PER-3: a user's chosen personality is stored, with no roll", async () => {
  await ready();
  const s = makeArtificer({ level: 4 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const calls = rollSpy();
  await run(s, "basicPersonalityMatrix", { automatonUuid: auto.uuid, choice: "Analytic" }, "per3-op");
  assert.equal(auto.flags.ak5e.automaton.personality, "Analytic");
  assert.deepEqual(calls, [], "no roll for a chosen personality");
});

test("PER-4: a personality card posted without a click stores nothing (only the roll button stores it)", async () => {
  await ready();
  const s = makeArtificer({ level: 4 });
  const auto = makeAutomaton(s, { variant: "platform" });
  rollSpy(5);
  await run(s, "basicPersonalityMatrix", { automatonUuid: auto.uuid }, "per4-op");
  assert.equal(auto.flags.ak5e.automaton.personality, null, "still unset before the click");
});

test("PER-5: the Basic Personality Matrix is a 4th level feature: below level 4 it warns (C3:6908-6911)", async () => {
  await ready();
  const s = makeArtificer({ level: 3 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "basicPersonalityMatrix", { automatonUuid: auto.uuid }));
  assert.ok(levelWarning(ws), `a level warning at level 3, got: ${warningText(ws)}`);
});

/* ==========================================================================
   10. Level gates (4th level for Heavy Duty Upgrades, C3:6908)
   ========================================================================== */

test("LV-1: installing an upgrade below level 4 warns (level 3)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 3 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id)));
  assert.ok(levelWarning(ws), `a level warning at level 3, got: ${warningText(ws)}`);
});

test("LV-2: installing at level 4 raises no level warning (boundary 3/4)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 4 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id)));
  assert.equal(levelWarning(ws), false, `no level warning at level 4, got: ${warningText(ws)}`);
});

test("LV-3: a level 3 install with the override still goes through (warning, not a block)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 3 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const id = entryFor(A, /AEGIS/i, "automaton").id;
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, id)));
  await run(s, "installUpgrade", installData(auto, id, { overrides: overridesFor(ws) }), "lv3-op");
  assert.ok(upgradeIdsOn(auto).includes(id), "the install goes through once overridden");
});

/* ==========================================================================
   11. Refusals: non-Artificers and plain actors
   ========================================================================== */

test("REF-1: a Hexer-branch Supporter is refused by installUpgrade with an Error, not a TypeError, and nothing changes", async () => {
  const A = await ready();
  const hexer = makeOtherBranch(4);
  const auto = makeAutomaton(hexer, { variant: "platform" });
  const id = entryFor(A, /AEGIS/i, "automaton").id;
  const error = await rejectionOf(() => Uses.supporterUses.plan(hexer, "installUpgrade", installData(auto, id)));
  assert.ok(error instanceof Error, "a clear refusal");
  assert.notEqual(error.name, "TypeError");
  assert.doesNotMatch(error.message, /undefined|of null|is not a function/i);
  assert.deepEqual(upgradeIdsOn(auto), []);
});

test("REF-2: a plain actor with no Supporter class is refused on execute, with no receipt written", async () => {
  const A = await ready();
  const plain = createTestActor({ name: "Plain" });
  const auto = makeAutomaton(plain, { variant: "platform", creatorUuid: plain.uuid });
  const id = entryFor(A, /AEGIS/i, "automaton").id;
  const error = await rejectionOf(() => run(plain, "installUpgrade", installData(auto, id), "ref2-op"));
  assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}`);
  assert.deepEqual(upgradeIdsOn(auto), []);
  assert.equal(receiptOf(plain, "ref2-op"), null);
});

test("REF-3: a Hexer-branch Supporter is refused by useUpgrade and by the personality plan", async () => {
  const A = await ready();
  const hexer = makeOtherBranch(14);
  const auto = makeAutomaton(hexer, { variant: "airSupport", upgrades: [entryFor(A, /Bombtail/i, "automaton").id] });
  const bomb = entryFor(A, /Bombtail/i, "automaton");
  const useError = await rejectionOf(() => Uses.supporterUses.plan(hexer, "useUpgrade", useData(auto, bomb.id)));
  assert.ok(useError instanceof Error && useError.name !== "TypeError", "useUpgrade refused cleanly");
  const personalityError = await rejectionOf(() => Uses.supporterUses.plan(hexer, "basicPersonalityMatrix", { automatonUuid: auto.uuid }));
  assert.ok(personalityError instanceof Error && personalityError.name !== "TypeError", "personality refused cleanly");
});

/* ==========================================================================
   12. Creator checks and cancel
   ========================================================================== */

test("OWN-1: an Automaton whose creator is a different Artificer gets a warning on install", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const other = makeArtificer({ level: 8 });
  const auto = makeAutomaton(other, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id)));
  assert.ok(ws.length > 0, `a creator warning, got: ${warningText(ws)}`);
  assert.ok(hasWarning(ws, /creator|another|other|artificer|own/i), `the warning names the creator, got: ${warningText(ws)}`);
});

test("OWN-2: the Creator's own Automaton raises no creator warning", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id)));
  assert.equal(ws.length, 0, `a clean install on the Creator's own Automaton, got: ${warningText(ws)}`);
});

test("CAN-1: planning an install and then not confirming changes nothing (no upgrades, no messages, no receipts)", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const messages = messageCount();
  await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id)));
  assert.deepEqual(upgradeIdsOn(auto), []);
  assert.equal(messageCount(), messages, "no chat message is posted");
  assert.equal(Uses.supporterUses.uses(s).length, 0, "no receipt");
});

test("CAN-2: a command without confirmation is rejected and changes nothing", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  await assert.rejects(
    () => Uses.supporterUses.command(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id), "can2-op"),
    error => error instanceof Error && error.name !== "TypeError"
  );
  assert.deepEqual(upgradeIdsOn(auto), []);
  assert.equal(receiptOf(s, "can2-op"), null);
});

test("CAN-3: an install that is not overridden never writes, even when the warnings are visible", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 3 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const error = await rejectionOf(() => run(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id), "can3-op"));
  assert.ok(error, "the un-overridden level warning stops the run");
  assert.deepEqual(upgradeIdsOn(auto), []);
});

test("CAN-4: an install never calls Roll", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const calls = rollSpy();
  await run(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id), "can4-op");
  assert.deepEqual(calls, [], "no roll during install");
});

/* ==========================================================================
   13. Undo of install: removes exactly that upgrade
   ========================================================================== */

test("UND-1: undoing the second install removes exactly that upgrade and keeps the first", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 16 });
  const first = entryFor(A, /AEGIS/i, "automaton").id;
  const second = entryFor(A, /Raptor/i, "automaton").id;
  const auto = makeAutomaton(s, { variant: "platform", upgrades: [first] });
  await run(s, "installUpgrade", installData(auto, second), "und1-op");
  assert.deepEqual(upgradeIdsOn(auto), [first, second]);
  await Uses.supporterUses.undo(s, "und1-op");
  assert.deepEqual(upgradeIdsOn(auto), [first], "only the undone upgrade is removed");
});

test("UND-2: undoing an install restores the Automaton's upgrades to their exact prior list", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8 });
  const auto = makeAutomaton(s, { variant: "platform" });
  const before = [...upgradeIdsOn(auto)];
  await run(s, "installUpgrade", installData(auto, entryFor(A, /AEGIS/i, "automaton").id), "und2-op");
  await Uses.supporterUses.undo(s, "und2-op");
  assert.deepEqual(upgradeIdsOn(auto), before);
});

test("UND-3: undoing a Mobile Cover install removes exactly that cover upgrade", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8, covers: [{ id: "c1", upgrades: [entryFor(A, /Reinforced/i, "cover").id] }] });
  const ultra = entryFor(A, /Ultralight/i, "cover").id;
  await run(s, "installUpgrade", coverInstallData("c1", ultra), "und3-op");
  assert.ok(coverUpgradeIds(s, "c1").includes(ultra), "installed on the cover");
  await Uses.supporterUses.undo(s, "und3-op");
  assert.deepEqual(coverUpgradeIds(s, "c1"), [entryFor(A, /Reinforced/i, "cover").id], "only Ultralight is removed");
});

test("UND-4: undoing the same install twice does not remove a second upgrade", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 16 });
  const first = entryFor(A, /AEGIS/i, "automaton").id;
  const auto = makeAutomaton(s, { variant: "platform", upgrades: [first] });
  await run(s, "installUpgrade", installData(auto, entryFor(A, /Raptor/i, "automaton").id), "und4-op");
  await Uses.supporterUses.undo(s, "und4-op");
  await Uses.supporterUses.undo(s, "und4-op");
  assert.deepEqual(upgradeIdsOn(auto), [first], "the earlier upgrade survives a repeated undo");
});

/* ==========================================================================
   14. Mobile Cover flows and the Automaton/Cover split
   ========================================================================== */

test("COV-1: installing a Mobile Cover upgrade stores it in that cover's list", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8, covers: [{ id: "c1", upgrades: [] }] });
  const reinforced = entryFor(A, /Reinforced/i, "cover").id;
  await run(s, "installUpgrade", coverInstallData("c1", reinforced), "cov1-op");
  assert.deepEqual(coverUpgradeIds(s, "c1"), [reinforced]);
});

test("COV-2: a Mobile Cover upgrade with a Creator warns on install of a repeat (duplicate on a cover)", async () => {
  const A = await ready();
  const reinforced = entryFor(A, /Reinforced/i, "cover").id;
  const s = makeArtificer({ level: 8, covers: [{ id: "c1", upgrades: [reinforced] }] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "installUpgrade", coverInstallData("c1", reinforced)));
  assert.ok(hasWarning(ws, /already|duplicate|twice|same|installed/i), `a duplicate warning on a cover, got: ${warningText(ws)}`);
});

test("COV-3: an unknown coverId is rejected clearly", async () => {
  const A = await ready();
  const s = makeArtificer({ level: 8, covers: [{ id: "c1", upgrades: [] }] });
  const error = await rejectionOf(() => Uses.supporterUses.plan(s, "installUpgrade", coverInstallData("no-such-cover", entryFor(A, /Reinforced/i, "cover").id)));
  assert.ok(error instanceof Error && error.name !== "TypeError", "a clear rejection");
});

/* ==========================================================================
   15. Gaps (genuine ambiguity, test.todo)
   ========================================================================== */

test.todo("TODO-1: Arts Detonator and Electroshock Cables are once 'until both complete a rest at the same time'. Gap: whether the Reaction refresh when the Automaton drops to 0 HP is modelled (C3:6972-6979) is not in the contract.");
test.todo("TODO-2: Arbalest is 'Once per Turn' and has no per-rest use count. Gap: the Turn limit is not a rest-based use; the contract has no per-turn field.");
test.todo("TODO-3: installUpgrade timing 'longRest' (Loaded for Bear as a Long Rest Activity, C3:6925) and its one-per-Automaton limit. Gap: the timing value names and the per-rest limit are not in the contract.");
test.todo("TODO-4: Concussive Maintenance (C3:6928-6931) heals an Automaton by one Aid Die times PB. Gap: not part of the upgrade plans; the contract does not expose the attack-action seam.");
test.todo("TODO-5: Advanced Personality Matrix (C3:6933-6940, 13th level) raises INT, WIS and CHA to 10 and grants two saves. Gap: not part of U6's contract.");
test.todo("TODO-6: Search and Rescue Suite (C3:7036-7040) STR save applies only when the Creature is unwilling. Gap: the willingness flag is not in the save data.");
