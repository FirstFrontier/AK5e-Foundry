/**
 * U5 adversarial challenge suite: Supporter Artificer (Automaton and core).
 *
 * Behavior-level tests written from the source (AK5e 1.3.1 Ch.3, Artificer, L6859-6960; Ch.6 Automaton stat
 * blocks, L6583-6685; Ch.4 Automaton Automation / Turret, ~L425). "C3:NNNN" and "C4:NNN" below cite the source
 * line. Head rulings are in ak5e/DECISIONS.md (row "Automaton caps / Protocol", and the Supporter rulings,
 * items 1-11). The source is treated as data.
 *
 * Many tests are expected to FAIL until ak5e/scripts/artificer-features.mjs lands. The module is loaded
 * dynamically, so a missing file fails only the tests that need it.
 *
 * Contract assumptions (each is a named guess, listed in the report):
 *  - plan data: buildAutomaton {variant}; commandAutomaton {automatonUuid, distance, command, all?};
 *    asOne {automatonUuid, action}; rebuildAutomaton {automatonUuid, method: "longRest" | "lmd"};
 *    concussiveMaintenance {automatonUuid}; advancedPersonalityMatrix {automatonUuid, saves: [a, b]};
 *    fortBuilder {}.
 *  - A build adds the new Automaton's uuid to flags.ak5e.artificer.automatons on the Artificer.
 *  - Automaton creation goes through Actor.create / Actor.implementation.create. The shared fixture has
 *    neither, so this file installs a local stub (installActorStub) that wraps createTestActor. The real
 *    Foundry creation path is covered only by a test.todo.
 *  - LMD currency is read from system.currency.lmd (the module's actual path is not confirmed; see the report).
 *  - Destroyed-at-0-HP is observed by an actor update followed by Hooks.callAll("updateActor", ...).
 *
 * Oracles (PB column, Aid Die column, the 8 + INT + PB Artificer DC, cap and upgrade numbers, Automaton base
 * HP 25 and ability scores) are copied from the source, never read from the implementation under test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { artificerDC } from "../scripts/supporter-rules.mjs";
import { getPool, recoverPool, spendPool } from "../scripts/resource-pools.mjs";

/* ==========================================================================
   Oracles, loaders and fixtures
   ========================================================================== */

// C3:6557-6578 Proficiency Bonus column (the Artificer uses the Supporter progression).
const pbOf = level => Math.floor((level - 1) / 4) + 2;
// Ch.6 Automaton stat blocks (L6583-6685): base Hit Points 25 for Platform, Air Support and Turret.
const AUTOMATON_BASE_HP = 25;
const AUTOMATON_VARIANTS = Object.freeze(["platform", "airSupport", "turret"]);
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 3, wis: 1, cha: 4 });
const ARTIFICER_LMD_COST = 500; // C3:6900-6901 (Automaton rebuild components, 500 LMD)

// Load the module once. A missing module fails only the tests that call artificer().
let artificerModule = null, artificerLoadError = null, plansRegistered = false;
async function artificer() {
  if (!artificerModule && !artificerLoadError) {
    try { artificerModule = await import("../scripts/artificer-features.mjs"); }
    catch (error) { artificerLoadError = error; }
  }
  assert.ok(artificerModule, `ak5e/scripts/artificer-features.mjs is not loadable yet: ${artificerLoadError?.message ?? "unknown"}`);
  return artificerModule;
}

/** Load the module and register its plans with the Supporter engine (once per file). */
async function ready() {
  const A = await artificer();
  if (!plansRegistered) {
    Uses.registerSupporterPlans({ plans: A.artificerPlans });
    plansRegistered = true;
  }
  return A;
}

// Local Actor.create stub. Restored in afterEach so no other file sees it.
let restoreActor = null;
function installActorStub() {
  const previous = globalThis.Actor;
  const create = async (data = {}) => {
    const automatonFlags = structuredClone(data.flags?.ak5e?.automaton ?? {});
    const created = makeAutomaton({
      name: data.name ?? "Automaton",
      creator: automatonFlags.creator ?? null,
      variant: automatonFlags.variant ?? "platform"
    });
    created.flags.ak5e.automaton = { ...created.flags.ak5e.automaton, ...automatonFlags };
    created.delete = async () => {
      game.actors.delete(created.id);
      globalThis._ak5eTestDocs?.delete(created.uuid);
      return created;
    };
    return created;
  };
  globalThis.Actor = { create, implementation: { create } };
  return () => { globalThis.Actor = previous; };
}

test.beforeEach(async () => {
  setupFoundryGlobals();
  restoreActor = installActorStub();
  Features.defineSupporterPools();
  const A = await artificer().catch(() => null);
  A?.defineArtificerPools?.();
});

test.afterEach(() => {
  restoreActor?.();
  restoreActor = null;
  teardownFoundryGlobals();
});

/** An Artificer (branch flag "artificer") at `level`. `automatons` and `covers` seed flags.ak5e.artificer. */
function makeArtificer({ level = 1, mods = {}, branch = "artificer", enabled = true, lmd = 0,
  automatons = [], covers = [], supporter = true } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = supporter ? [createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-supporter" } }
  })] : [];
  const ak5e = { artificer: { automatons: [...automatons], covers: structuredClone(covers), professionalVariant: null } };
  if (supporter) ak5e.supporter = { enabled, branch };
  return createTestActor({
    name: `Artificer L${level}`, level, items, abilities,
    hp: { value: 20, max: 20, temp: 0 },
    system: { currency: { lmd } },
    flags: { ak5e }
  });
}

/** A plain Supporter-less actor. */
const plainActor = (name = "Plain") => createTestActor({ name });

/**
 * An Automaton actor, created directly (not through a plan). The `creator` may be the Artificer's uuid, another
 * Artificer's uuid, or null (missing creator). `exempt` and `destroyed` mirror the data contract.
 */
function makeAutomaton({ name = "Automaton", creator = null, variant = "platform", exempt = false,
  destroyed = false, hp = AUTOMATON_BASE_HP } = {}) {
  const automaton = {
    creator, variant, upgrades: [], personality: null, destroyed
  };
  if (exempt) automaton.exempt = true;
  return createTestActor({
    name, type: "npc",
    hp: { value: hp, max: AUTOMATON_BASE_HP, temp: 0 },
    flags: { ak5e: { automaton } }
  });
}

/** Plan data helpers. */
const buildData = (variant = "platform", extra = {}) => ({ variant, ...extra });
const commandData = (auto, distance = 60, command = "move", extra = {}) => ({ automatonUuid: auto.uuid, distance, command, ...extra });

/** Click the use's roll button (the only path that rolls). */
const click = (actor, useId) => Uses.supporterUses.command(actor, "useRoll", { useId }, `roll-${useId}`);

const receiptOf = (actor, id) => Uses.supporterUses.receipt(actor, id);
const aidPool = actor => getPool(actor, "aidDie");
const fortPool = actor => getPool(actor, "artificerFortBuilder");
const fortValue = actor => fortPool(actor).value;
const aidValue = actor => aidPool(actor).value;

/** The Automaton uuids on the Artificer (flags.ak5e.artificer.automatons). */
const uuidsOf = actor => actor?.flags?.ak5e?.artificer?.automatons ?? [];
const coversOf = actor => actor?.flags?.ak5e?.artificer?.covers ?? [];
const fromUuid = uuid => globalThis.fromUuidSync?.(uuid) ?? game.actors.get(String(uuid).split(".").pop()) ?? null;
const lmdOf = actor => Number(actor?.system?.currency?.lmd ?? 0);

/** Warnings from a plan run: the plan's own list when it passes, or the AK5eWarnings thrown when it is not yet overridden. */
async function warningsOf(run) {
  try {
    const plan = await run();
    return plan?.warnings ?? [];
  } catch (error) {
    if (error?.name === "AK5eWarnings" || error?.name === "PlayWarnings" || Array.isArray(error?.warnings)) return error.warnings;
    throw error;
  }
}

const warningText = ws => ws.map(w => `${w.id ?? ""} ${w.text ?? ""}`).join(" | ");
const hasWarning = (ws, rx) => ws.some(w => rx.test(`${w.id ?? ""} ${w.text ?? ""}`));
const levelWarning = ws => hasWarning(ws, /level/i);
const capWarning = ws => hasWarning(ws, /maximum|limit|cap|at once|more than/i);
const rangeWarning = ws => hasWarning(ws, /100|range|distance|feet|ft/i);
const overridesFor = ws => ws.map(w => w.id);

/** Did the use record a shortfall (receipt.shortfalls, or a shortfall word in the receipt)? */
function recordsShortfall(receipt) {
  return (Array.isArray(receipt?.shortfalls) && receipt.shortfalls.length > 0) || /short/i.test(JSON.stringify(receipt ?? {}));
}

/** Stub Roll. Every evaluate() is recorded; Roll.roll is an error. */
function forbidRolls() {
  const calls = [];
  globalThis.Roll = class SpyRoll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; this.total = null; }
    async evaluate() { calls.push(this.formula); this.total = 4; return this; }
    async toMessage() { return undefined; }
    static async roll() { calls.push("Roll.roll"); throw new Error("Roll.roll must not run before the player clicks Roll"); }
  };
  return calls;
}

const messageCount = () => game.messages.length;
const lastMessageText = () => String(game.messages[game.messages.length - 1]?.content ?? "");

/** Execute an Artificer use (confirmed), passing through the given overrides. */
const run = (actor, name, data, opId) => Uses.supporterUses.execute(actor, name, data, opId);

/** Build one Automaton through the real plan and return the new actor (or null if none appeared). */
async function buildOne(art, variant = "platform", opId = `build-${Math.random().toString(36).slice(2, 8)}`) {
  const before = uuidsOf(art).slice();
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData(variant)));
  await run(art, "buildAutomaton", buildData(variant, { overrides: overridesFor(ws) }), opId);
  const added = uuidsOf(art).find(uuid => !before.includes(uuid)) ?? null;
  return { uuid: added, automaton: added ? fromUuid(added) : null, opId, receipt: receiptOf(art, opId) };
}

/* ==========================================================================
   1. Exports, hooks and pools
   ========================================================================== */

test("EXP-1: the contract names are exported and the plans are named after the Artificer features", async () => {
  const A = await ready();
  for (const name of ["artificerSetup", "asOne", "fortBuilder", "buildAutomaton", "commandAutomaton",
    "rebuildAutomaton", "concussiveMaintenance", "advancedPersonalityMatrix"]) {
    assert.ok(A.artificerPlans[name], `plan ${name} exists`);
  }
  for (const name of ["defineArtificerPools", "registerArtificerHooks", "artificerPanel", "automatonsOf",
    "coversOf", "upgradeCapFor", "countsAgainstCap", "artificerCommand"]) {
    assert.equal(typeof A[name], "function", `${name} is a function`);
  }
  assert.ok(A.artificerApi, "artificerApi is exported");
});

test("HK-1: registerArtificerHooks called twice registers its hooks once (second call adds none)", async () => {
  const A = await ready();
  const hookSpy = globalThis.Hooks;
  const countRegistrations = () => Array.from(hookSpy._hooks?.values?.() ?? []).reduce((n, list) => n + list.length, 0);
  const beforeFirst = countRegistrations();
  A.registerArtificerHooks();
  const afterFirst = countRegistrations();
  assert.ok(afterFirst > beforeFirst, "the first call registers at least one hook (guards a vacuous pass)");
  A.registerArtificerHooks();
  const afterSecond = countRegistrations();
  assert.equal(afterSecond, afterFirst, "a second registration adds no hook handlers");
});

test("EXP-2: defineArtificerPools called twice does not throw and keeps the pool maximum", async () => {
  const A = await ready();
  assert.doesNotThrow(() => { A.defineArtificerPools(); A.defineArtificerPools(); });
  assert.equal(fortPool(makeArtificer({ level: 5 })).max, pbOf(5));
});

test("PO-1: artificerFortBuilder max is the Proficiency Bonus at each PB step (C3:6891 Fort Builder)", async () => {
  await ready();
  for (const level of [1, 5, 9, 13, 17]) {
    assert.equal(fortPool(makeArtificer({ level })).max, pbOf(level), `level ${level}`);
  }
});

test("PO-2: a Long Rest refills artificerFortBuilder to PB; a Short Rest does not", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  await run(art, "fortBuilder", {}, "po2-a");
  await run(art, "fortBuilder", {}, "po2-b");
  assert.equal(fortValue(art), pbOf(5) - 2);
  await recoverPool(art, "sr");
  assert.equal(fortValue(art), pbOf(5) - 2, "a Short Rest does not refill the Fort Builder pool");
  await recoverPool(art, "lr");
  assert.equal(fortValue(art), pbOf(5), "a Long Rest refills to PB");
});

test("DC-1: artificerDC is 8 + INT modifier + PB at each PB step (C3:6958)", async () => {
  await ready();
  for (const [level, int] of [[1, 3], [5, 3], [9, 0], [13, -1], [17, 4]]) {
    const art = makeArtificer({ level, mods: { int } });
    assert.equal(artificerDC(art), 8 + int + pbOf(level), `level ${level}, INT ${int}`);
  }
});

/* ==========================================================================
   2. Refusals for non-Artificers
   ========================================================================== */

test("BR-1: a Hexer (branch hexer) is refused by a build plan with a clear Error, not a TypeError", async () => {
  await ready();
  const hexer = makeArtificer({ level: 5, branch: "hexer" });
  await assert.rejects(() => Promise.resolve().then(() => Uses.supporterUses.plan(hexer, "buildAutomaton", buildData())), error => {
    assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}: ${error?.message}`);
    assert.doesNotMatch(error.message, /undefined|of null|is not a function/i);
    return true;
  });
  assert.equal(uuidsOf(hexer).length, 0, "nothing is built for a Hexer");
});

test("BR-2: a non-Supporter is refused for a Fort Builder use: rejects cleanly and changes nothing", async () => {
  await ready();
  const ally = plainActor();
  await assert.rejects(() => run(ally, "fortBuilder", {}, "br2-op"), error => {
    assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}`);
    return true;
  });
  assert.equal(game.messages.length, messageCount(), "no card is posted for a refused use");
});

test("BR-3: a Bard (branch bard) is refused by the concussive plan with a clear Error", async () => {
  await ready();
  const bard = makeArtificer({ level: 10, branch: "bard" });
  const auto = makeAutomaton({ creator: bard.uuid });
  await assert.rejects(() => Promise.resolve().then(() => Uses.supporterUses.plan(bard, "concussiveMaintenance", { automatonUuid: auto.uuid })), error => {
    assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}: ${error?.message}`);
    return true;
  });
});

/* ==========================================================================
   3. Build (Professional Engineer, C3:6886-6889; Ch.6 stat blocks)
   ========================================================================== */

test("BLD-1: a built Automaton has max HP 25 plus the Technology Modifier (one of the two readings)", async () => {
  // Source (C3:6886-6889): "additional Maximum Hit Points equal to your Technology Modifier". The source does not say
  // whether this is the Technology skill total or the INT modifier (see the DECISIONS "Technology Modifier" note).
  // The test accepts either reading, so it cannot pass by inventing one.
  await ready();
  const art = makeArtificer({ level: 5, mods: { int: 3 } });
  const { automaton } = await buildOne(art, "platform", "bld1");
  assert.ok(automaton, "an Automaton actor was created");
  const hpMax = Number(automaton.system.attributes.hp.max);
  const techTotal = Number(art.system?.skills?.tec?.total ?? art.system?.skills?.tec?.mod ?? NaN);
  const readings = [AUTOMATON_BASE_HP + 3, AUTOMATON_BASE_HP + (Number.isFinite(techTotal) ? techTotal : -999)];
  assert.ok(readings.includes(hpMax), `max HP ${hpMax} is one of ${readings.join(", ")}`);
  assert.ok(hpMax > AUTOMATON_BASE_HP, "the Automaton gains extra max HP");
});

test("BLD-2: the built Automaton uses the Artificer's Proficiency Bonus (C3:6886-6889)", async () => {
  await ready();
  for (const level of [5, 9]) {
    const art = makeArtificer({ level });
    const { automaton } = await buildOne(art, "airSupport", `bld2-${level}`);
    assert.equal(Number(automaton.system.attributes.prof), pbOf(level), `level ${level}`);
  }
});

test("BLD-3: the built Automaton attacks at INT + PB (C3:6889)", async () => {
  // Storage for the attack bonus is not contracted. The test accepts the bonus stored on the Automaton, or on the
  // build receipt, and fails if neither carries INT + PB.
  await ready();
  const art = makeArtificer({ level: 5, mods: { int: 3 } });
  const { automaton, receipt } = await buildOne(art, "turret", "bld3");
  const want = 3 + pbOf(5);
  const stored = [automaton?.flags?.ak5e?.automaton?.attack, automaton?.flags?.ak5e?.automaton?.attackBonus,
    automaton?.system?.attack?.bonus, receipt?.result?.attackBonus].map(v => Number(v));
  assert.ok(stored.includes(want), `attack bonus +${want} is recorded (stored: ${stored.join(", ")})`);
});

test("BLD-4: a build records the new Automaton's uuid on the Artificer and the variant on the Automaton", async () => {
  await ready();
  const art = makeArtificer({ level: 1 });
  const { uuid, automaton } = await buildOne(art, "turret", "bld4");
  assert.ok(uuid, "a uuid is added to flags.ak5e.artificer.automatons");
  assert.equal(uuidsOf(art).length, 1);
  assert.equal(automaton?.flags?.ak5e?.automaton?.creator, art.uuid, "the creator is the building Artificer");
  assert.equal(automaton?.flags?.ak5e?.automaton?.variant, "turret");
});

test("BLD-5: an unknown variant is rejected clearly, builds nothing, and is not a TypeError", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  assert.throws(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("tank")), error => {
    assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}: ${error?.message}`);
    assert.match(error.message, /variant|platform|air|turret/i, "the message names the variant problem");
    return true;
  });
  assert.equal(uuidsOf(art).length, 0);
});

test("BLD-6: every source variant (Platform, Air Support, Turret) builds", async () => {
  await ready();
  for (const variant of AUTOMATON_VARIANTS) {
    const art = makeArtificer({ level: 5 });
    const { uuid } = await buildOne(art, variant, `bld6-${variant}`);
    assert.ok(uuid, `${variant} builds`);
  }
});

test("BLD-7: undo of buildAutomaton removes the created actor and its uuid from flags.ak5e.artificer.automatons", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const { uuid, opId } = await buildOne(art, "platform", "bld7");
  assert.ok(uuid, "the build created an Automaton");
  await Uses.supporterUses.undo(art, opId);
  assert.equal(uuidsOf(art).includes(uuid), false, "the uuid is removed from the Artificer");
  assert.equal(fromUuid(uuid), null, "the created Automaton actor no longer exists");
});

test("BLD-8: a build with no Actor creation support is reported as an error, not a silent no-op", async () => {
  // Negative test. With no Actor.create on the global, a build must fail loudly. A silent success would leave
  // the Artificer pointing at nothing.
  await ready();
  restoreActor?.();
  restoreActor = null;
  const art = makeArtificer({ level: 5 });
  await assert.rejects(() => run(art, "buildAutomaton", buildData("platform"), "bld8"), error => {
    assert.ok(error instanceof Error);
    return true;
  });
  assert.equal(uuidsOf(art).length, 0, "no uuid is recorded when creation fails");
});

test.todo("BLD-TODO-1: the real Foundry Actor.create path builds the Automaton from the Ch.6 stat block (not the test stub)");
test.todo("BLD-TODO-2: Technology Modifier reading (skill total vs INT modifier) is a GM ruling; no default is invented here");

/* ==========================================================================
   4. Cap (A1, C3:6895 / 6938): 1 Automaton, 2 from level 13
   ========================================================================== */

test("CAP-1: a second build at level 12 warns, and 'Use anyway' still builds (a warning, not a block)", async () => {
  await ready();
  const art = makeArtificer({ level: 12 });
  await buildOne(art, "platform", "cap1-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.ok(capWarning(ws), `a cap warning is raised, got: ${warningText(ws)}`);
  await assert.rejects(() => run(art, "buildAutomaton", buildData("platform"), "cap1-blocked"), error => error instanceof Error);
  assert.equal(uuidsOf(art).length, 1, "the blocked build creates nothing");
  await run(art, "buildAutomaton", buildData("platform", { overrides: overridesFor(ws) }), "cap1-anyway");
  assert.equal(uuidsOf(art).length, 2, "Use anyway proceeds with the second Automaton");
});

test("CAP-2: at level 13 a second build is within the cap (no cap warning), a third warns (C3:6938)", async () => {
  await ready();
  const art = makeArtificer({ level: 13 });
  await buildOne(art, "platform", "cap2-first");
  const second = await warningsOf(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.equal(capWarning(second), false, "a second Automaton at level 13 raises no cap warning");
  await buildOne(art, "platform", "cap2-second");
  const third = await warningsOf(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.ok(capWarning(third), `a third Automaton at level 13 warns, got: ${warningText(third)}`);
});

test("CAP-3: the level 12 / 13 boundary: the same two-Automaton state warns at 12 and not at 13", async () => {
  await ready();
  const at12 = makeArtificer({ level: 12, automatons: [makeAutomaton({ creator: "x" }).uuid] });
  const at13 = makeArtificer({ level: 13, automatons: [makeAutomaton({ creator: "x" }).uuid] });
  const w12 = await warningsOf(() => Uses.supporterUses.plan(at12, "buildAutomaton", buildData("platform")));
  const w13 = await warningsOf(() => Uses.supporterUses.plan(at13, "buildAutomaton", buildData("platform")));
  assert.ok(capWarning(w12), "level 12: one existing Automaton means a warning on the second");
  assert.equal(capWarning(w13), false, "level 13: one existing Automaton allows a second");
});

test("CAP-4: an exempt Automaton (exempt: true) does not count against the cap", async () => {
  await ready();
  const exempt = makeAutomaton({ creator: "x", exempt: true });
  const art = makeArtificer({ level: 12, automatons: [exempt.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.equal(capWarning(ws), false, "the exempt Automaton is not counted, so no cap warning");
});

test("CAP-5: a destroyed Automaton does not count against the cap", async () => {
  await ready();
  const dead = makeAutomaton({ creator: "x", destroyed: true });
  const art = makeArtificer({ level: 12, automatons: [dead.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform")));
  assert.equal(capWarning(ws), false, "a destroyed Automaton is not counted");
});

test("CAP-6: countsAgainstCap is false for exempt and destroyed Automatons, true for a normal one", async () => {
  const A = await ready();
  assert.equal(A.countsAgainstCap(makeAutomaton({ creator: "x" })), true);
  assert.equal(A.countsAgainstCap(makeAutomaton({ creator: "x", exempt: true })), false);
  assert.equal(A.countsAgainstCap(makeAutomaton({ creator: "x", destroyed: true })), false);
});

test("CAP-7: automatonsOf returns the Artificer's Automaton actors, in order", async () => {
  const A = await ready();
  const a = makeAutomaton({ creator: "x" }), b = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 13, automatons: [a.uuid, b.uuid] });
  const found = A.automatonsOf(art).map(actor => actor.uuid);
  assert.deepEqual(found, [a.uuid, b.uuid]);
});

/* ==========================================================================
   5. Fort Builder (C3:6891 area): PB per Long Rest, Action, covers
   ========================================================================== */

test("FB-1: a Fort Builder use spends one of PB and adds a cover record with id, label, upgrades and deployedAt", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  assert.equal(fortValue(art), pbOf(5));
  await run(art, "fortBuilder", {}, "fb1");
  assert.equal(fortValue(art), pbOf(5) - 1);
  const cover = coversOf(art)[0];
  assert.equal(coversOf(art).length, 1, "one cover record is added");
  assert.ok(cover?.id, "the cover has an id");
  assert.ok(cover?.label, "the cover has a label");
  assert.ok(Array.isArray(cover?.upgrades), "the cover lists its upgrades");
  assert.ok(cover?.deployedAt !== undefined, "the cover records when it was deployed");
});

test("FB-2: an empty Fort Builder pool warns, a blocked use spends nothing, and 'Use anyway' clamps at 0 and records the shortfall", async () => {
  await ready();
  const art = makeArtificer({ level: 1 });
  for (let i = 0; i < pbOf(1); i++) await run(art, "fortBuilder", {}, `fb2-fill-${i}`);
  assert.equal(fortValue(art), 0);
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "fortBuilder", {}));
  assert.ok(ws.length > 0, "an empty pool warns");
  const coversBefore = coversOf(art).length;
  await assert.rejects(() => run(art, "fortBuilder", {}, "fb2-blocked"), error => error instanceof Error);
  assert.equal(coversOf(art).length, coversBefore, "a blocked use adds no cover");
  await run(art, "fortBuilder", {}, "fb2-anyway");
  assert.equal(fortValue(art), 0, "the pool clamps at 0, never below");
  assert.ok(recordsShortfall(receiptOf(art, "fb2-anyway")), "the shortfall is recorded on the receipt");
});

test("FB-3: Fort Builder undo restores the pool and removes the cover exactly", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const poolBefore = fortValue(art);
  const coversBefore = JSON.stringify(coversOf(art));
  await run(art, "fortBuilder", {}, "fb3");
  await Uses.supporterUses.undo(art, "fb3");
  assert.equal(fortValue(art), poolBefore, "pool restored exactly");
  assert.equal(JSON.stringify(coversOf(art)), coversBefore, "covers restored exactly");
});

test("FB-4: Fort Builder plan with a non-empty pool raises no pool warning", async () => {
  await ready();
  const art = makeArtificer({ level: 5 });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "fortBuilder", {}));
  assert.equal(hasWarning(ws, /pool|none|empty|uses|short/i), false, `no shortage warning, got: ${warningText(ws)}`);
});

/* ==========================================================================
   6. Control (C3:6900-6916 area; Ch.3 Your Automaton in Combat; C3:6930-6945 at 13)
   ========================================================================== */

test("CTL-1: commanding an Automaton beyond 100 feet warns; within 100 feet does not", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  const far = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", commandData(auto, 120)));
  assert.ok(rangeWarning(far), `beyond 100 ft warns, got: ${warningText(far)}`);
  const near = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", commandData(auto, 100)));
  assert.equal(rangeWarning(near), false, "exactly 100 ft is within range");
});

test("CTL-2: a range warning is overridable: execute with 'Use anyway' proceeds", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", commandData(auto, 150)));
  await assert.rejects(() => run(art, "commandAutomaton", commandData(auto, 150), "ctl2-blocked"), error => error instanceof Error);
  await run(art, "commandAutomaton", commandData(auto, 150, "move", { overrides: overridesFor(ws) }), "ctl2-anyway");
  assert.ok(receiptOf(art, "ctl2-anyway"), "the command is recorded after Use anyway");
});

test("CTL-3: a command card posts roll buttons and rolls nothing (no Roll.evaluate)", async () => {
  await ready();
  const calls = forbidRolls();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  await run(art, "commandAutomaton", commandData(auto, 60, "attack"), "ctl3");
  assert.equal(calls.length, 0, `no roll was evaluated, got ${JSON.stringify(calls)}`);
  assert.match(JSON.stringify(receiptOf(art, "ctl3") ?? {}) + lastMessageText(), /roll/i, "a roll control is offered on the card");
});

test("CTL-4: at level 13 one command covers all Automatons (C3:6945; Ch.3 Maximum Automaton Limit)", async () => {
  await ready();
  const a = makeAutomaton({ creator: "x" }), b = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 13, automatons: [a.uuid, b.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", { all: true, distance: 60, command: "move" }));
  assert.equal(rangeWarning(ws), false, "a 60 ft command to both is in range");
  await run(art, "commandAutomaton", { all: true, distance: 60, command: "move" }, "ctl4");
  const receipt = JSON.stringify(receiptOf(art, "ctl4") ?? {});
  assert.ok(receipt.includes(a.uuid) && receipt.includes(b.uuid), "the receipt covers both Automatons");
});

test("CTL-5: an unknown command returns undefined from artificerCommand (no throw, no card)", async () => {
  const A = await ready();
  const art = makeArtificer({ level: 5 });
  const before = messageCount();
  assert.equal(A.artificerCommand(art, "dance"), undefined);
  assert.equal(messageCount(), before, "no card is posted for an unknown command");
});

test("CTL-6: an Automaton owned by a different Artificer cannot be commanded without a warning", async () => {
  await ready();
  const other = makeArtificer({ level: 5 });
  const auto = makeAutomaton({ creator: other.uuid });
  const art = makeArtificer({ level: 5 });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", commandData(auto, 30)));
  assert.ok(ws.length > 0, `a warning is raised, got: ${warningText(ws)}`);
  await assert.rejects(() => run(art, "commandAutomaton", commandData(auto, 30), "ctl6"), error => error instanceof Error);
});

test("CTL-7: an Automaton with a missing creator cannot be commanded without a warning", async () => {
  await ready();
  const auto = makeAutomaton({ creator: null });
  const art = makeArtificer({ level: 5 });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", commandData(auto, 30)));
  assert.ok(ws.length > 0, `a warning is raised for a missing creator, got: ${warningText(ws)}`);
});

test("CTL-8: at level 12 the all-Automatons command is not available; at level 13 it is", async () => {
  await ready();
  const a = makeAutomaton({ creator: "x" }), b = makeAutomaton({ creator: "x" });
  const at12 = makeArtificer({ level: 12, automatons: [a.uuid] });
  const at13 = makeArtificer({ level: 13, automatons: [a.uuid, b.uuid] });
  const w12 = await warningsOf(() => Uses.supporterUses.plan(at12, "commandAutomaton", { all: true, distance: 30, command: "move" }));
  const refused12 = await refusedPlan(at12);
  assert.ok(w12.length > 0 || refused12, "level 12 cannot command all at once (a warning or a refusal)");
  const w13 = await warningsOf(() => Uses.supporterUses.plan(at13, "commandAutomaton", { all: true, distance: 30, command: "move" }));
  assert.equal(hasWarning(w13, /all|level|bonus/i), false, "level 13 allows the all-Automatons command");
});

/** True when the plan throws (a refusal, not a warning). */
async function refusedPlan(art) {
  try { await Uses.supporterUses.plan(art, "commandAutomaton", { all: true, distance: 30, command: "move" }); return false; }
  catch { return true; }
}

/* ==========================================================================
   7. As One (A2, C3:6870-6876)
   ========================================================================== */

test("AO-1: an Automaton repeating the same Action before the Artificer's next turn warns (A2)", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  await run(art, "asOne", { automatonUuid: auto.uuid, action: "Ram" }, "ao1-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "asOne", { automatonUuid: auto.uuid, action: "Ram" }));
  assert.ok(ws.length > 0, `a repeated Action warns, got: ${warningText(ws)}`);
});

test("AO-2: a different Action is not a repeat (no As One warning)", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  await run(art, "asOne", { automatonUuid: auto.uuid, action: "Ram" }, "ao2-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "asOne", { automatonUuid: auto.uuid, action: "Dodge" }));
  assert.equal(hasWarning(ws, /same|repeat|already|cannot/i), false, "a different Action raises no repeat warning");
});

test("AO-3: As One with a repeat is overridable with 'Use anyway'", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  await run(art, "asOne", { automatonUuid: auto.uuid, action: "Ram" }, "ao3-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "asOne", { automatonUuid: auto.uuid, action: "Ram" }));
  await run(art, "asOne", { automatonUuid: auto.uuid, action: "Ram", overrides: overridesFor(ws) }, "ao3-anyway");
  assert.ok(receiptOf(art, "ao3-anyway"), "the repeat proceeds after Use anyway");
});

/* ==========================================================================
   8. Destruction and rebuild (A3, C3:6900-6905)
   ========================================================================== */

test("RB-1: an Automaton reduced to 0 HP is marked destroyed: true", async () => {
  const A = await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  const changes = { "system.attributes.hp.value": 0 };
  await auto.update(changes);
  globalThis.Hooks.callAll?.("updateActor", auto, changes, {}, game.user.id);
  assert.equal(auto.flags.ak5e.automaton.destroyed, true, "the Automaton is destroyed at 0 HP");
  assert.equal(A.countsAgainstCap(auto), false, "a destroyed Automaton no longer counts");
  assert.ok(art, "the Artificer is still present");
});

test("RB-2: rebuild by Long Rest activity costs no LMD and restores the Automaton", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", destroyed: true });
  const art = makeArtificer({ level: 5, lmd: 800, automatons: [auto.uuid] });
  await run(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "longRest" }, "rb2");
  assert.equal(auto.flags.ak5e.automaton.destroyed, false, "the Automaton is rebuilt");
  assert.equal(lmdOf(art), 800, "no LMD is spent for a Long Rest rebuild");
});

test("RB-3: rebuild for 500 LMD spends exactly 500 LMD and restores the Automaton", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", destroyed: true });
  const art = makeArtificer({ level: 5, lmd: 800, automatons: [auto.uuid] });
  await run(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "lmd" }, "rb3");
  assert.equal(lmdOf(art), 800 - ARTIFICER_LMD_COST, "500 LMD is spent");
  assert.equal(auto.flags.ak5e.automaton.destroyed, false);
});

test("RB-4: insufficient LMD warns, a blocked rebuild spends nothing, and 'Use anyway' clamps currency at 0 and records the shortfall", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", destroyed: true });
  const art = makeArtificer({ level: 5, lmd: 200, automatons: [auto.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "lmd" }));
  assert.ok(ws.length > 0, `insufficient LMD warns, got: ${warningText(ws)}`);
  await assert.rejects(() => run(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "lmd" }, "rb4-blocked"), error => error instanceof Error);
  assert.equal(lmdOf(art), 200, "a blocked rebuild spends nothing");
  await run(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "lmd", overrides: overridesFor(ws) }, "rb4-anyway");
  assert.equal(lmdOf(art), 0, "currency clamps at 0, never below");
  assert.ok(recordsShortfall(receiptOf(art, "rb4-anyway")), "the LMD shortfall is recorded");
});

test("RB-5: rebuild undo restores LMD exactly", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", destroyed: true });
  const art = makeArtificer({ level: 5, lmd: 800, automatons: [auto.uuid] });
  await run(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "lmd" }, "rb5");
  await Uses.supporterUses.undo(art, "rb5");
  assert.equal(lmdOf(art), 800, "currency restored exactly");
});

/* ==========================================================================
   9. Concussive Maintenance (level 10, C3:6928-6931)
   ========================================================================== */

test("CM-1: below level 10 a concussive use warns about the level", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 9, automatons: [auto.uuid] });
  const aidBefore = aidValue(art);
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "concussiveMaintenance", { automatonUuid: auto.uuid }));
  assert.ok(levelWarning(ws), `a level warning is raised at 9, got: ${warningText(ws)}`);
  await assert.rejects(() => run(art, "concussiveMaintenance", { automatonUuid: auto.uuid }, "cm1-blocked"), error => error instanceof Error);
  assert.equal(aidValue(art), aidBefore, "a blocked level-9 use spends no Aid Die");
});

test("CM-2: at level 10 the boundary is reached: no level warning", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 10, automatons: [auto.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "concussiveMaintenance", { automatonUuid: auto.uuid }));
  assert.equal(levelWarning(ws), false, "level 10 is not refused for level");
});

test("CM-3: a concussive use expends exactly one Aid Die (pool aidDie) and posts a heal roll button, not healing", async () => {
  await ready();
  const calls = forbidRolls();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 10, automatons: [auto.uuid] });
  const aidBefore = aidValue(art);
  const hpBefore = Number(auto.system.attributes.hp.value);
  await run(art, "concussiveMaintenance", { automatonUuid: auto.uuid }, "cm3");
  assert.equal(aidValue(art), aidBefore - 1, "exactly one Aid Die is expended");
  assert.equal(Number(auto.system.attributes.hp.value), hpBefore, "healing is not applied automatically");
  assert.equal(calls.length, 0, "no Roll.evaluate before the player clicks Roll");
  assert.match(JSON.stringify(receiptOf(art, "cm3") ?? {}) + lastMessageText(), /roll|heal/i, "a heal roll control is posted");
});

test("CM-4: a concussive heal formula is the Aid Die multiplied by PB (C3:6928-6931)", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 10, automatons: [auto.uuid] });
  await run(art, "concussiveMaintenance", { automatonUuid: auto.uuid }, "cm4");
  const text = JSON.stringify(receiptOf(art, "cm4") ?? {}) + lastMessageText();
  assert.match(text, /d10/i, "the expended die is the level 10 Aid Die (d10)");
  assert.match(text, new RegExp(`\\b${pbOf(10)}\\b`), "the heal multiplier includes PB");
});

test("CM-5: an empty Aid Die pool warns, a blocked use spends nothing, and 'Use anyway' records the shortfall at 0", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 10, automatons: [auto.uuid] });
  await spendPool(art, "aidDie", aidValue(art));
  assert.equal(aidValue(art), 0);
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "concussiveMaintenance", { automatonUuid: auto.uuid }));
  assert.ok(ws.length > 0, "an empty Aid Die pool warns");
  await assert.rejects(() => run(art, "concussiveMaintenance", { automatonUuid: auto.uuid }, "cm5-blocked"), error => error instanceof Error);
  assert.equal(aidValue(art), 0);
  await run(art, "concussiveMaintenance", { automatonUuid: auto.uuid, overrides: overridesFor(ws) }, "cm5-anyway");
  assert.equal(aidValue(art), 0, "the Aid Die pool clamps at 0");
  assert.ok(recordsShortfall(receiptOf(art, "cm5-anyway")), "the shortfall is recorded");
});

test("CM-6: a concussive use on another Artificer's Automaton warns (no heal without a warning)", async () => {
  await ready();
  const other = makeArtificer({ level: 5 });
  const auto = makeAutomaton({ creator: other.uuid, hp: 5 });
  const art = makeArtificer({ level: 10 });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "concussiveMaintenance", { automatonUuid: auto.uuid }));
  assert.ok(ws.length > 0, `a warning is raised for a foreign Automaton, got: ${warningText(ws)}`);
});

test("CM-7: concussive undo restores the Aid Die pool exactly", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 10, automatons: [auto.uuid] });
  const before = aidValue(art);
  await run(art, "concussiveMaintenance", { automatonUuid: auto.uuid }, "cm7");
  await Uses.supporterUses.undo(art, "cm7");
  assert.equal(aidValue(art), before);
});

/* ==========================================================================
   10. Advanced Personality Matrix (level 13, C3:6939-6943)
   ========================================================================== */

test("APM-1: at level 13 the Automaton's INT, WIS and CHA become 10, and it gains the two chosen save proficiencies", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  auto.system.abilities.int = { value: 4, mod: -3 };
  auto.system.abilities.wis = { value: 4, mod: -3 };
  auto.system.abilities.cha = { value: 1, mod: -5 };
  const art = makeArtificer({ level: 13, automatons: [auto.uuid] });
  await run(art, "advancedPersonalityMatrix", { automatonUuid: auto.uuid, saves: ["str", "con"] }, "apm1");
  for (const key of ["int", "wis", "cha"]) {
    assert.equal(Number(auto.system.abilities[key].value), 10, `${key} is 10`);
  }
  const proficient = Object.keys(auto.system.abilities).filter(key => auto.system.abilities[key]?.proficient)
    .concat(auto.flags.ak5e.automaton.saves ?? []);
  assert.ok(proficient.includes("str") && proficient.includes("con"), `both chosen saves are gained, got: ${proficient.join(",")}`);
});

test("APM-2: below level 13 the Advanced Personality Matrix warns about the level", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  const art = makeArtificer({ level: 12, automatons: [auto.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "advancedPersonalityMatrix", { automatonUuid: auto.uuid, saves: ["str", "con"] }));
  assert.ok(levelWarning(ws), `a level warning is raised at 12, got: ${warningText(ws)}`);
});

/* ==========================================================================
   11. Upgrade caps (C3:6925 / 6945)
   ========================================================================== */

test("UPG-1: upgradeCapFor is 2 below level 17 and 3 from level 17 (C3:6925 / 6945)", async () => {
  const A = await ready();
  for (const level of [1, 9, 16]) assert.equal(A.upgradeCapFor(makeArtificer({ level })), 2, `level ${level}`);
  for (const level of [17, 20]) assert.equal(A.upgradeCapFor(makeArtificer({ level })), 3, `level ${level}`);
});

/* ==========================================================================
   12. Cancel, state and panel
   ========================================================================== */

test("CX-1: a plan with no execute (cancel) changes nothing: pools, covers, Automatons and LMD are untouched", async () => {
  await ready();
  const auto = makeAutomaton({ creator: "x", destroyed: true });
  const art = makeArtificer({ level: 5, lmd: 800, automatons: [auto.uuid] });
  const snapshot = JSON.stringify({ fort: fortValue(art), aid: aidValue(art), covers: coversOf(art), uuids: uuidsOf(art), lmd: lmdOf(art) });
  Uses.supporterUses.plan(art, "buildAutomaton", buildData("platform"));
  Uses.supporterUses.plan(art, "fortBuilder", {});
  Uses.supporterUses.plan(art, "rebuildAutomaton", { automatonUuid: auto.uuid, method: "lmd" });
  assert.equal(JSON.stringify({ fort: fortValue(art), aid: aidValue(art), covers: coversOf(art), uuids: uuidsOf(art), lmd: lmdOf(art) }), snapshot);
});

test("CX-2: a blocked execute (warnings not overridden) changes nothing", async () => {
  await ready();
  const art = makeArtificer({ level: 12 });
  await buildOne(art, "platform", "cx2-first");
  const snapshot = JSON.stringify({ uuids: uuidsOf(art), fort: fortValue(art) });
  await assert.rejects(() => run(art, "buildAutomaton", buildData("platform"), "cx2-blocked"), error => error instanceof Error);
  assert.equal(JSON.stringify({ uuids: uuidsOf(art), fort: fortValue(art) }), snapshot);
});

test("CX-3: artificerPanel returns HTML with data-supporter-cmd buttons for the Artificer's actions", async () => {
  const A = await ready();
  const art = makeArtificer({ level: 10 });
  const html = A.artificerPanel(art);
  assert.equal(typeof html, "string");
  assert.match(html, /data-supporter-cmd/, "the panel has command buttons");
});

/* ==========================================================================
   13. No roll during plan, apply or undo
   ========================================================================== */

test("NR-1: no Roll.evaluate or Roll.roll during plan, apply or undo across the Artificer's uses", async () => {
  await ready();
  const calls = forbidRolls();
  const auto = makeAutomaton({ creator: "x", hp: 5 });
  const art = makeArtificer({ level: 10, lmd: 800, automatons: [auto.uuid] });
  await run(art, "fortBuilder", {}, "nr-fort");
  await run(art, "concussiveMaintenance", { automatonUuid: auto.uuid }, "nr-cm");
  await run(art, "commandAutomaton", commandData(auto, 60, "attack"), "nr-cmd");
  await Uses.supporterUses.undo(art, "nr-fort");
  await Uses.supporterUses.undo(art, "nr-cm");
  assert.deepEqual(calls, [], `no roll evaluated, got ${JSON.stringify(calls)}`);
});

/* ==========================================================================
   14. Relay: unowned Automatons are changed through the GM client
   ========================================================================== */

test("RL-1: an Automaton the player does not own is still commanded, with the change relayed (not blocked)", async () => {
  // WORKFLOW 3.2: an unowned target is relayed through the GM client; it is not refused and not blocked by an
  // ownership check. The plan should not throw for ownership alone.
  await ready();
  const auto = makeAutomaton({ creator: "x" });
  auto.isOwner = false;
  auto.ownership = { default: 0 };
  const art = makeArtificer({ level: 5, automatons: [auto.uuid] });
  const ws = await warningsOf(() => Uses.supporterUses.plan(art, "commandAutomaton", commandData(auto, 30)));
  assert.equal(hasWarning(ws, /owner|permission/i), false, "ownership is relayed, not warned or blocked");
});
