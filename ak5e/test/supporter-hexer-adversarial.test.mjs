/**
 * U4 adversarial challenge suite: Supporter Hexer hexes.
 *
 * Behavior-level tests written from the source (AK5e 1.3.1 Ch.3, Hexer, L7223-7330; "C3:NNNN" below cites the
 * source line) and the head rulings in ak5e/DECISIONS.md ("Supporter Class and Artificer / Bard / Hexer Branches",
 * items 1-11, especially item 8 and item 9 (R9)). Written against the U4 contract in the task brief; many tests
 * are expected to FAIL until ak5e/scripts/hexer-features.mjs lands. The module is loaded dynamically so a missing
 * file fails only the tests that need it.
 *
 * Contract assumptions (the brief does not fix these; each is a deliberate, named guess and is listed in the report):
 *  - plan data: { targetUuid, targetName, distance, kind, ability?, point?, excluded?, overrides? }
 *  - Hex Active Effect on the target carries flags.ak5e.hex = { source, kind, ultimate, roll, ability, expires }.
 *  - Speed loss from Binding is read from ADD changes on system.attributes.movement.walk, or from
 *    flags.ak5e.hex.speedReduction. The fixture drops `changes` on createEmbeddedDocuments, so the second path
 *    is the one the mock can observe.
 *  - Expiry of 1 minute: flags.ak5e.hex.expires is 60 (seconds), the absolute time worldTime + 60, or {seconds: 60}.
 *
 * Oracles (die size, PB, rounding examples, save DC arithmetic) are copied from the source and the rulings,
 * never read from the implementation under test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { getPool, recoverPool } from "../scripts/resource-pools.mjs";
import { emitAk5eEvent } from "../scripts/trigger-events.mjs";

/* ==========================================================================
   Oracles, loaders and fixtures
   ========================================================================== */

// C3:6557-6578 Proficiency Bonus column (the Hexer uses the same progression as the Supporter).
const pbOf = level => Math.floor((level - 1) / 4) + 2;
// C3:6557-6578 Aid Die column: d8 at 1-6, d10 at 7-13, d12 at 14-20.
const dieOf = level => (level >= 14 ? "d12" : level >= 7 ? "d10" : "d8");
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 2, wis: 1, cha: 4 });
const HEX_KINDS = Object.freeze(["abjuring", "binding", "breaking", "looping"]);
const LATE_KINDS = Object.freeze(["voicethief", "wasting"]);

// Load the module once. A missing module fails only the tests that call hexer().
let hexerModule = null, hexerLoadError = null, plansRegistered = false;
async function hexer() {
  if (!hexerModule && !hexerLoadError) {
    try { hexerModule = await import("../scripts/hexer-features.mjs"); }
    catch (error) { hexerLoadError = error; }
  }
  assert.ok(hexerModule, `ak5e/scripts/hexer-features.mjs is not loadable yet: ${hexerLoadError?.message ?? "unknown"}`);
  return hexerModule;
}

/** Load the module and register its plans with the Supporter engine (once per file). */
async function ready() {
  const H = await hexer();
  if (!plansRegistered) {
    Uses.registerSupporterPlans({ plans: H.hexerPlans });
    plansRegistered = true;
  }
  return H;
}

test.beforeEach(async () => {
  setupFoundryGlobals();
  Features.defineSupporterPools();
  const H = await hexer().catch(() => null);
  H?.defineHexerPools?.();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/** A Hexer (branch flag "hexer") at `level`. `casting` sets flags.ak5e.casting (the Arts casting ability). */
function makeHexer({ level = 1, mods = {}, casting, enabled = true, branch = "hexer", hp } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-supporter" } }
  })];
  const ak5e = { supporter: { enabled, branch } };
  if (casting !== undefined) ak5e.casting = casting;
  return createTestActor({
    name: `Hexer L${level}`, level, items, abilities,
    hp: hp ?? { value: 20, max: 20, temp: 0 },
    flags: { ak5e }
  });
}

/** A creature that the Hexer may hex. Owned by default; pass `owner: false` for the unowned relay case. */
function foeActor(name = "Foe", extra = {}) {
  return createTestActor({ name, hp: { value: 30, max: 30, temp: 0 }, ...extra });
}

/** Plan data for a Potent Hex on `foe`. */
const potentData = (foe, kind, extra = {}) => ({ targetUuid: foe.uuid, targetName: foe.name, distance: 30, kind, ...extra });

/** Stub Roll. `total` is the value a user's click produces; every evaluate() is recorded in `calls`. */
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

const receiptOf = (actor, id) => Uses.supporterUses.receipt(actor, id);
const potentPool = actor => getPool(actor, "hexerPotentHex");
const ultimatePool = actor => getPool(actor, "hexerUltimateHex");
const potentValue = actor => potentPool(actor).value;

const flagOf = effect => effect?.flags?.ak5e?.hex ?? null;

/** Raw Active Effects on a creature that carry a Hex flag (the implementation's data contract). */
function hexEffects(target) {
  return Array.from(target?.effects?.values?.() ?? []).filter(effect => flagOf(effect));
}

/** The Hex records of one kind on a creature. `kind` may be stored as a string or an array. */
const kindsOf = effect => [].concat(flagOf(effect)?.kind ?? []);
function hexOfKind(target, kind) {
  const effect = hexEffects(target).find(candidate => kindsOf(candidate).includes(kind));
  return effect ? flagOf(effect) : null;
}

/** Speed lost to Binding Hexes: ADD changes on movement.walk, plus the flag fallback. */
// One source per Hex: the ADD change on movement.walk when present, otherwise the speedReduction flag. Never both.
function speedLoss(target) {
  let loss = 0;
  for (const effect of hexEffects(target)) {
    const walk = (effect.changes ?? []).find(change => /movement\.walk/.test(change.key) && Number.isFinite(Number(change.value)));
    if (walk) loss += -Number(walk.value);
    else loss += Number(flagOf(effect)?.speedReduction ?? 0);
  }
  return loss;
}

/** Walking speed after Binding, floored at 0 (the Speed floor). */
const effectiveWalk = target => Math.max(0, Number(target.system.attributes.movement.walk) - speedLoss(target));

/** True when an expiry value means 1 minute (60 seconds, worldTime + 60, or a seconds object). */
function isOneMinute(value) {
  const now = Number(game.time?.worldTime ?? 0);
  if (value === 60 || value === now + 60) return true;
  if (value && typeof value === "object" && (value.seconds === 60 || value.duration === 60)) return true;
  return typeof value === "string" && /1\s*min/i.test(value);
}

/**
 * Warnings from a plan run: the plan's own list when it passes, or the AK5eWarnings thrown when it is not yet
 * overridden. Any other error is rethrown, so a TypeError still fails the test.
 */
async function warningsOf(run) {
  try {
    const plan = await run();
    return plan?.warnings ?? [];
  } catch (error) {
    if (error?.name === "AK5eWarnings" || Array.isArray(error?.warnings)) return error.warnings;
    throw error;
  }
}

const warningText = ws => ws.map(w => `${w.id ?? ""} ${w.text ?? ""}`).join(" | ");
const hasWarning = (ws, rx) => ws.some(w => rx.test(`${w.id ?? ""} ${w.text ?? ""}`));
const levelWarning = ws => hasWarning(ws, /level/i);
const overridesFor = ws => ws.map(w => w.id);

/** Did the use record a shortfall (receipt.shortfalls, or a shortfall word in the receipt)? */
function recordsShortfall(receipt) {
  return (Array.isArray(receipt?.shortfalls) && receipt.shortfalls.length > 0) || /short/i.test(JSON.stringify(receipt ?? {}));
}

const messageCount = () => game.messages.length;
const lastMessageText = () => String(game.messages[game.messages.length - 1]?.content ?? "");

/** Does the receipt show a save DC of `dc` (e.g. "DC 17" or "DC: 17")? */
const showsDC = (receipt, dc) => new RegExp(`\\bDC\\D{0,4}${dc}\\b`).test(JSON.stringify(receipt ?? {}));

/** Execute a Hexer use (confirmed), passing through the given overrides. */
const run = (actor, name, data, opId) => Uses.supporterUses.execute(actor, name, data, opId);

/* ==========================================================================
   1. Exports, hooks and pools
   ========================================================================== */

// Brief: registerHexerHooks() must be idempotent. This is the first call in the file, so the count is meaningful.
test("HK-1: registerHexerHooks called twice registers the hit handler once (one card per hit)", async () => {
  const H = await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "hk1-hex");
  H.registerHexerHooks();
  H.registerHexerHooks();
  const before = messageCount();
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker").uuid, targetUuid: foe.uuid, ac: 12, eventId: "hit:hk1" });
  assert.equal(messageCount() - before, 1, "exactly one Force card for one hit");
});

test("EXP-1: the contract names are exported and the plans are named potentHex, cursemark and ultimateHex", async () => {
  const H = await ready();
  for (const name of ["potentHex", "cursemark", "ultimateHex"]) assert.ok(H.hexerPlans[name], `plan ${name} exists`);
  for (const name of ["defineHexerPools", "registerHexerHooks", "hexerPanel", "isHexed", "hexesOn", "hexerSpellSaveDC", "cursemarkTargets"]) {
    assert.equal(typeof H[name], "function", `${name} is a function`);
  }
  assert.ok(H.hexerApi, "hexerApi is exported");
});

test("EXP-2: defineHexerPools called twice does not throw and keeps the pools defined", async () => {
  const H = await ready();
  assert.doesNotThrow(() => { H.defineHexerPools(); H.defineHexerPools(); });
  const s = makeHexer({ level: 5 });
  assert.equal(potentPool(s).max, pbOf(5));
});

test("PO-1: hexerPotentHex max is the Proficiency Bonus at every PB step (C3:7287-7288)", async () => {
  await ready();
  for (const level of [1, 4, 5, 8, 9, 12, 13, 16, 17]) {
    const s = makeHexer({ level });
    assert.equal(potentPool(s).max, pbOf(level), `level ${level}`);
  }
});

test("PO-2: hexerUltimateHex max is 1 at level 17 (C3:7325-7330)", async () => {
  await ready();
  assert.equal(ultimatePool(makeHexer({ level: 17 })).max, 1);
});

test("PO-3: a Long Rest restores the Potent Hex pool to PB; a Short Rest does not (C3:7287-7288, R-pool)", async () => {
  await ready();
  const s = makeHexer({ level: 5 });
  for (let i = 0; i < 3; i++) await run(s, "potentHex", potentData(foeActor(`Drain ${i}`), "looping"), `po3-${i}`);
  assert.equal(potentValue(s), 0);
  await recoverPool(s, "sr");
  assert.equal(potentValue(s), 0, "a Short Rest does not refill the Hexer pools");
  await recoverPool(s, "lr");
  assert.equal(potentValue(s), pbOf(5), "a Long Rest refills to PB");
});

/* ==========================================================================
   2. Refusals for non-Hexers
   ========================================================================== */

test("BR-H1: a Bard (branch bard) is refused by the Potent Hex plan with a clear Error, not a TypeError", async () => {
  await ready();
  const bard = makeHexer({ level: 4, branch: "bard" });
  assert.throws(() => Uses.supporterUses.plan(bard, "potentHex", potentData(foeActor(), "looping")), error => {
    assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}: ${error?.message}`);
    assert.doesNotMatch(error.message, /undefined|of null|is not a function/i);
    return true;
  });
});

test("BR-H2: a non-Supporter is refused for an executed Hex: rejects cleanly and changes nothing", async () => {
  await ready();
  const ally = createTestActor({ name: "Plain" });
  const foe = foeActor();
  await assert.rejects(() => run(ally, "potentHex", potentData(foe, "looping"), "br2-op"), error => {
    assert.ok(error instanceof Error && error.name !== "TypeError", `got ${error?.name}`);
    return true;
  });
  assert.equal(hexEffects(foe).length, 0);
});

/* ==========================================================================
   3. Potent Hex: pool, duplicates, warnings and cancel
   ========================================================================== */

test("PH-1: a Potent Hex spends 1 of the PB uses and records a complete use for a no-roll kind (C3:7287-7288)", async () => {
  await ready();
  const s = makeHexer({ level: 1 });
  assert.equal(potentValue(s), pbOf(1));
  await run(s, "potentHex", potentData(foeActor(), "looping"), "ph1-op");
  assert.equal(potentValue(s), pbOf(1) - 1);
  assert.equal(receiptOf(s, "ph1-op").status, "complete", "looping needs no roll");
});

test("PH-2: an empty Potent Hex pool warns, blocks without 'Use anyway', and clamps at 0 with the shortfall recorded", async () => {
  await ready();
  const s = makeHexer({ level: 1 });
  const foe = foeActor();
  for (let i = 0; i < pbOf(1); i++) await run(s, "potentHex", potentData(foeActor(`E${i}`), "looping"), `ph2-fill-${i}`);
  assert.equal(potentValue(s), 0);

  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foe, "looping")));
  assert.ok(ws.length > 0, "an empty pool warns");
  await assert.rejects(() => run(s, "potentHex", potentData(foe, "looping"), "ph2-blocked"), error => error?.name === "AK5eWarnings" || error instanceof Error);
  assert.equal(potentValue(s), 0, "a blocked use spends nothing");

  await run(s, "potentHex", potentData(foe, "looping", { overrides: overridesFor(ws) }), "ph2-anyway");
  assert.equal(potentValue(s), 0, "the pool clamps at 0, never below");
  assert.ok(recordsShortfall(receiptOf(s, "ph2-anyway")), "the shortfall is recorded on the receipt");
});

test("PH-3: a second Hex of the same kind on one creature warns and is not a silent block (one instance, C3:7288)", async () => {
  await ready();
  const s = makeHexer({ level: 5 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "ph3-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foe, "looping")));
  assert.ok(hasWarning(ws, /hex|already|instance/i), `a duplicate-kind warning is raised, got: ${warningText(ws)}`);
  // A warning is overridable: with its id accepted, the plan goes through without throwing.
  assert.doesNotThrow(() => Uses.supporterUses.plan(s, "potentHex", potentData(foe, "looping", { overrides: overridesFor(ws) })));
});

test("PH-4: a duplicate kind used 'anyway' still leaves one instance of that kind on the creature (C3:7288)", async () => {
  await ready();
  const s = makeHexer({ level: 5 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "ph4-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foe, "looping")));
  await run(s, "potentHex", potentData(foe, "looping", { overrides: overridesFor(ws) }), "ph4-second");
  const loopingCount = hexEffects(foe).filter(effect => kindsOf(effect).includes("looping")).length;
  assert.equal(loopingCount, 1, "a creature is affected by one instance of each Hex at a time");
});

test("PH-5: different Hex kinds may stack on one creature without a duplicate warning (C3:7288)", async () => {
  await ready();
  const s = makeHexer({ level: 5 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "ph5-first");
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foe, "abjuring")));
  assert.equal(hasWarning(ws, /instance|already|duplicate/i), false, "no duplicate-kind warning for a different kind");
});

test("PH-6: planning only changes nothing (pool, effects, messages, receipts) (Cancel)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  const before = potentValue(s), messages = messageCount();
  await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foe, "abjuring")));
  assert.equal(potentValue(s), before);
  assert.equal(hexEffects(foe).length, 0);
  assert.equal(messageCount(), messages);
  assert.equal(Uses.supporterUses.uses(s).length, 0);
});

test("PH-7: a command without confirmation is rejected and changes nothing", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  const before = potentValue(s);
  await assert.rejects(() => Uses.supporterUses.command(s, "potentHex", potentData(foe, "looping"), "ph7-op"));
  assert.equal(potentValue(s), before);
  assert.equal(hexEffects(foe).length, 0);
  assert.equal(receiptOf(s, "ph7-op"), null);
});

test("PH-8: undo of a Potent Hex removes the target effect and restores the pool exactly", async () => {
  await ready();
  const s = makeHexer({ level: 5 });
  const foe = foeActor();
  const prior = potentValue(s);
  await run(s, "potentHex", potentData(foe, "looping"), "ph8-op");
  assert.equal(potentValue(s), prior - 1);
  await Uses.supporterUses.undo(s, "ph8-op");
  assert.equal(potentValue(s), prior, "exact prior value");
  assert.equal(hexEffects(foe).length, 0, "the Hex effect is removed");
});

test("PH-9: undo restores the exact prior value when the pool was not at its maximum", async () => {
  await ready();
  const s = makeHexer({ level: 9 });
  await run(s, "potentHex", potentData(foeActor("A"), "looping"), "ph9-first");
  const mid = potentValue(s);
  await run(s, "potentHex", potentData(foeActor("B"), "looping"), "ph9-second");
  await Uses.supporterUses.undo(s, "ph9-second");
  assert.equal(potentValue(s), mid);
});

test("PH-10: undoing the same use twice does not inflate the pool", async () => {
  await ready();
  const s = makeHexer({ level: 5 });
  const prior = potentValue(s);
  await run(s, "potentHex", potentData(foeActor(), "looping"), "ph10-op");
  await Uses.supporterUses.undo(s, "ph10-op");
  await Uses.supporterUses.undo(s, "ph10-op");
  assert.equal(potentValue(s), prior);
});

test("PH-11: a 1-minute Hex expires after 1 minute (duration of the Hex, not an open-ended effect)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "ph11-op");
  const [effect] = hexEffects(foe);
  assert.ok(effect, "the Hex effect exists");
  assert.ok(isOneMinute(flagOf(effect).expires) || isOneMinute(effect.duration), `expiry is 1 minute, got ${JSON.stringify(flagOf(effect).expires)}`);
});

test("PH-12: planning a Hex on an unowned creature does not throw (player side, no ownership warning invented)", async () => {
  await ready();
  // The player-side relay round trip waits 15 s for a GM chat response that the fixture never sends (operation-kernel
  // timeout), so only the plan is exercised here. The GM half is PH-12b.
  game.user = game.users.get("player");
  assert.equal(game.user.isGM, false, "the acting user is a player");
  const s = makeHexer({ level: 4 });
  const unowned = foeActor("Unowned Foe", { owner: false });
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(unowned, "looping")));
  assert.equal(ws.length, 0, `no warning for a clean first Hex, got: ${warningText(ws)}`);
});

test("PH-12b: the GM relay re-applies a recorded Hex on an unowned creature (relayedTargetChange, GM half)", async () => {
  await ready();
  // The GM writes directly, so the use is recorded with the change applied. The creature's Hex is then removed to
  // stand for the write the player could not make, and the GM's relayed apply must put it back.
  const s = makeHexer({ level: 4 });
  const unowned = foeActor("Unowned Foe", { owner: false });
  await run(s, "potentHex", potentData(unowned, "looping"), "ph12b-op");
  const [effect] = hexEffects(unowned);
  assert.ok(effect, "the recorded use applied the Hex");
  await unowned.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  assert.equal(hexEffects(unowned).length, 0);
  assert.equal(typeof Uses.supporterUses.relayedTargetChange, "function", "the relay entry point exists");
  await Uses.supporterUses.relayedTargetChange(s, "apply", { useId: "ph12b-op", targetUuid: unowned.uuid });
  assert.equal(hexEffects(unowned).length, 1, "the relayed apply restores the recorded Hex on the unowned creature");
});

test("PH-13: the relay refuses a target that is not part of the recorded use (no forged relay)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const recorded = foeActor("Recorded", { owner: false });
  const forged = foeActor("Forged", { owner: false });
  await run(s, "potentHex", potentData(recorded, "looping"), "ph13-op");
  assert.equal(typeof Uses.supporterUses.relayedTargetChange, "function", "the relay entry point exists");
  await assert.rejects(() => Uses.supporterUses.relayedTargetChange(s, "apply", { useId: "ph13-op", targetUuid: forged.uuid }));
  assert.equal(hexEffects(forged).length, 0);
});

/* ==========================================================================
   4. Level boundaries (C3:7281-7330)
   ========================================================================== */

test("LV-H1: Potent kinds abjuring, binding, breaking and looping raise no level warning at level 1", async () => {
  await ready();
  const s = makeHexer({ level: 1 });
  for (const kind of HEX_KINDS) {
    const ws = await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foeActor(), kind)));
    assert.equal(levelWarning(ws), false, `${kind} is available at level 1 (warnings: ${warningText(ws)})`);
  }
});

test("LV-H2: voicethief and wasting warn below level 13 and not at 13 (boundary 12/13, C3:7307-7312)", async () => {
  await ready();
  for (const kind of LATE_KINDS) {
    const low = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 12 }), "potentHex", potentData(foeActor(), kind, { ability: "dex" })));
    const high = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 13 }), "potentHex", potentData(foeActor(), kind, { ability: "dex" })));
    assert.ok(levelWarning(low), `${kind} at level 12 warns: ${warningText(low)}`);
    assert.equal(levelWarning(high), false, `${kind} at level 13 has no level warning`);
  }
});

test("LV-H3: Cursemark warns below level 4 and not at 4 (boundary 3/4, C3:7302)", async () => {
  await ready();
  const low = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 3 }), "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }));
  const high = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 4 }), "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }));
  assert.ok(levelWarning(low), `level 3 warns: ${warningText(low)}`);
  assert.equal(levelWarning(high), false);
});

test("LV-H4: Ultimate Hex warns below level 17 and not at 17 (boundary 16/17, C3:7325)", async () => {
  await ready();
  const low = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 16 }), "ultimateHex", potentData(foeActor(), "looping")));
  const high = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 17 }), "ultimateHex", potentData(foeActor(), "looping")));
  assert.ok(levelWarning(low), `level 16 warns: ${warningText(low)}`);
  assert.equal(levelWarning(high), false);
});

test("LV-H5: the Hex die follows the Aid Die size at the 6/7 and 13/14 boundaries (C3:6557-6578, C3:7290)", async () => {
  await ready();
  for (const level of [6, 7, 13, 14]) {
    const s = makeHexer({ level });
    const calls = rollSpy(3);
    const opId = `lv5-${level}`;
    await run(s, "potentHex", potentData(foeActor(), "abjuring"), opId);
    assert.equal(receiptOf(s, opId).formula, `1${dieOf(level)}`, `level ${level} die`);
    assert.deepEqual(calls, [], "no roll at application");
  }
});

test.todo("LV-H6: Controlled Cruelty (Empathic Pain) is available from level 10 (boundary 9/10, C3:7307-7312). Gap: the Empathic Pain data seam is not in the U4 contract.");

/* ==========================================================================
   5. R9: Abjuring and Binding (DECISIONS R9, C3:7290 / 7292)
   ========================================================================== */

test("R9-1: Abjuring never rolls at plan or application; the roll waits for the user's click", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const calls = rollSpy(5);
  await warningsOf(() => Uses.supporterUses.plan(s, "potentHex", potentData(foeActor(), "abjuring")));
  await run(s, "potentHex", potentData(foeActor("Click Target"), "abjuring"), "r9-1");
  assert.deepEqual(calls, [], "no Roll.evaluate during plan or application");
});

// C3:7290: the hexed creature rolls a die of the Aid Die size on EACH of its own Damage Rolls. Nothing is rolled
// when the Hex is applied; the Hex records the die formula and a reminder (R9).
test("R9-2: applying Abjuring records the die formula (1d8 at level 4) and a reminder, with no roll and no awaiting-roll state", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  const calls = rollSpy(5);
  await run(s, "potentHex", potentData(foe, "abjuring"), "r9-2");
  assert.deepEqual(calls, [], "no Roll on application");
  assert.equal(receiptOf(s, "r9-2").status, "complete", "no awaiting-roll state");
  const hex = hexOfKind(foe, "abjuring");
  assert.ok(hex, "the Abjuring Hex is applied at once");
  assert.equal(hex.formula, "1d8", "the die the creature rolls on its Damage Rolls is recorded");
  assert.equal(hex.roll ?? null, null, "nothing is rolled or recorded at application");
  assert.match(JSON.stringify(receiptOf(s, "r9-2") ?? {}), /Damage Roll/i, "the reminder that the creature rolls on its Damage Roll is shown");
});

test("R9-3: the binding roll is two Aid Dice (2d8 at level 4), not one (C3:7292, ruling 9)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  await run(s, "potentHex", potentData(foeActor(), "binding"), "r9-3");
  assert.equal(receiptOf(s, "r9-3").formula, "2d8");
});

// C3:7292 + R9: Binding Speed loss is two rolls rounded to the nearest 5 ft. Examples from the brief: 7→5, 8→10, 12→10, 13→15.
for (const [total, expected] of [[7, 5], [8, 10], [12, 10], [13, 15]]) {
  test(`R9-4.${total}: binding of recorded total ${total} reduces Speed by ${expected} ft (nearest 5, C3:7292)`, async () => {
    await ready();
    const s = makeHexer({ level: 13 });
    const foe = foeActor();
    rollSpy(total);
    await run(s, "potentHex", potentData(foe, "binding"), `r9-4-${total}`);
    await click(s, `r9-4-${total}`);
    assert.equal(speedLoss(foe), expected, `speed loss for total ${total}`);
    assert.equal(effectiveWalk(foe), 30 - expected, "walking speed after Binding");
  });
}

test("R9-5: Binding never takes Speed below 0 (floor at 0, C3:7292)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  rollSpy(40);
  await run(s, "potentHex", potentData(foe, "binding"), "r9-5");
  await click(s, "r9-5");
  assert.ok(effectiveWalk(foe) >= 0, "walking speed is never negative");
  assert.equal(effectiveWalk(foe), 0, "a loss larger than the Speed floors at 0");
});

test("R9-6: Binding with no click records no speed loss at all (the plan never rolls)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  const calls = rollSpy(9);
  await run(s, "potentHex", potentData(foe, "binding"), "r9-6");
  assert.deepEqual(calls, []);
  assert.equal(speedLoss(foe), 0, "no speed is lost before the roll is clicked");
});

test("R9-7: undo after applying Abjuring removes the effect and restores the pool, with no click step", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  const prior = potentValue(s);
  const calls = rollSpy(5);
  await run(s, "potentHex", potentData(foe, "abjuring"), "r9-7");
  assert.equal(hexEffects(foe).length, 1, "the Abjuring Hex is applied");
  await Uses.supporterUses.undo(s, "r9-7");
  assert.equal(potentValue(s), prior, "the pool is restored exactly");
  assert.equal(hexEffects(foe).length, 0, "the Abjuring Hex is removed on undo");
  assert.deepEqual(calls, [], "undo never rolls");
});

test.todo("ABJ-DMG: Abjuring subtracts floor(roll/2) from the creature's damage roll, minimum 1 (C3:7290, R9). Gap: the contract has no damage-pipeline seam to call.");
test.todo("BRK-DR: Breaking reduces Damage Reduction by one roll of the Aid Die (C3:7291). Gap: the DR representation for Breaking is not fixed (head ruling needed).");
test.todo("LOOP-CONC: Looping Hex: the Concentration Art does not count toward the limit while Hexed (C3:7290). Gap: the concentration seam is not in the contract.");
test.todo("CRUEL-EP: Empathic Pain redirects the Force damage to a creature within 30 ft (C3:7307-7312). Gap: the redirect data seam is not fixed.");

/* ==========================================================================
   6. Force rider (C3:7290, once per turn cycle; reset at the Hexer's turn start)
   ========================================================================== */

test("FR-1: two hits on one hexed creature in one turn cycle produce one Force card", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "fr1-hex");
  const before = messageCount();
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker A").uuid, targetUuid: foe.uuid, ac: 10, eventId: "hit:fr1-a" });
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker B").uuid, targetUuid: foe.uuid, ac: 10, eventId: "hit:fr1-b" });
  assert.equal(messageCount() - before, 1, "one card for two hits in one cycle");
});

test("FR-2: after the Hexer's turnStart the rider resets and another hit produces a card", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "fr2-hex");
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker").uuid, targetUuid: foe.uuid, ac: 10, eventId: "hit:fr2-a" });
  const before = messageCount();
  await emitAk5eEvent("turnStart", { actorUuid: s.uuid, eventId: "turnStart:fr2" });
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker").uuid, targetUuid: foe.uuid, ac: 10, eventId: "hit:fr2-b" });
  assert.equal(messageCount() - before, 1, "a fresh cycle allows one more card");
});

test("FR-3: a hit on a creature that carries no Hex from this Hexer produces no card", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const s = makeHexer({ level: 4 });
  const plain = foeActor("Plain Foe");
  const before = messageCount();
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker").uuid, targetUuid: plain.uuid, ac: 10, eventId: "hit:fr3" });
  assert.equal(messageCount() - before, 0);
});

test("FR-4: a creature hexed only by another Hexer does not trigger this Hexer's rider ('any of your Hexes', C3:7290)", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const mine = makeHexer({ level: 4 });
  const theirs = makeHexer({ level: 4 });
  const foe = foeActor();
  await run(theirs, "potentHex", potentData(foe, "looping"), "fr4-theirs");
  const before = messageCount();
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker").uuid, targetUuid: foe.uuid, ac: 10, eventId: "hit:fr4" });
  assert.equal(messageCount() - before, 0, `no card for ${mine.name}`);
});

test("FR-5: the Force rider is a button, not automatic: no roll, and the card carries a button and the Aid Die formula", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const calls = rollSpy(6);
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "fr5-hex");
  await emitAk5eEvent("hit", { actorUuid: foeActor("Attacker").uuid, targetUuid: foe.uuid, ac: 10, eventId: "hit:fr5" });
  assert.deepEqual(calls, [], "no Roll on a hit");
  assert.match(lastMessageText(), /<button/i, "the card has a button");
  assert.match(lastMessageText(), /1d8/, "the Force formula is one roll of the Aid Die (d8 at level 4)");
});

// C3:7290: "Once THEY have taken this Damage, they cannot take it again until the beginning of your next Turn."
// Head ruling: the limit is per hexed creature, and everything resets at the Hexer's turnStart.
test("FR-6: the Force rider limit is per hexed creature: two creatures each get one card, the same creature twice gets one, and it all resets at turnStart", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const s = makeHexer({ level: 4 });
  const foeA = foeActor("Creature A"), foeB = foeActor("Creature B");
  await run(s, "potentHex", potentData(foeA, "looping"), "fr6-a");
  await run(s, "potentHex", potentData(foeB, "looping"), "fr6-b");
  const hit = (target, n) => emitAk5eEvent("hit", { actorUuid: foeActor(`Attacker ${n}`).uuid, targetUuid: target.uuid, ac: 10, eventId: `hit:fr6-${target.name}-${n}` });

  const before = messageCount();
  await hit(foeA, 1);
  assert.equal(messageCount() - before, 1, "creature A's first hit in the cycle: one card");
  await hit(foeA, 2);
  assert.equal(messageCount() - before, 1, "creature A hit again in the same cycle: no second card");
  await hit(foeB, 1);
  assert.equal(messageCount() - before, 2, "creature B is a different creature: its own card");
  await hit(foeB, 2);
  assert.equal(messageCount() - before, 2, "creature B hit again in the same cycle: no second card");

  await emitAk5eEvent("turnStart", { actorUuid: s.uuid, eventId: "turnStart:fr6" });
  const mid = messageCount();
  await hit(foeA, 3);
  assert.equal(messageCount() - mid, 1, "after the Hexer's turnStart, creature A gets a card again");
  await hit(foeB, 3);
  assert.equal(messageCount() - mid, 2, "after the Hexer's turnStart, creature B gets a card again");
});

/* ==========================================================================
   7. Cursemark (C3:7302-7305, C3:7307-7312)
   ========================================================================== */

test("CM-1: a Cursemark is a Bonus Action that spends exactly 1 Potent Hex use (C3:7302-7305)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const prior = potentValue(s);
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "cm1-op");
  assert.equal(potentValue(s), prior - 1);
});

test("CM-2: a Cursemark record stores radius 10 ft, its kind, its point and its excluded creatures", async () => {
  await ready();
  // Spare the Rod is a level 10 feature (C3:7307-7312), so an excluded list needs a level 10 Hexer (CM-8 covers the warning).
  const s = makeHexer({ level: 10 });
  const foe = foeActor("Spared");
  await run(s, "cursemark", { point: { x: 40, y: 60 }, kind: "looping", distance: 30, excluded: [foe.uuid] }, "cm2-op");
  const [mark] = s.flags.ak5e.hexer.cursemarks;
  assert.ok(mark, "a cursemark is recorded on the Hexer");
  assert.equal(mark.radius, 10);
  assert.equal(mark.kind, "looping");
  assert.deepEqual(mark.point, { x: 40, y: 60 });
  assert.deepEqual(mark.excluded, [foe.uuid]);
});

test("CM-3: a Cursemark over 100 ft warns; 100 ft has no range warning (C3:7302)", async () => {
  await ready();
  const over = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 4 }), "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 101 }));
  const at = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 4 }), "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 100 }));
  assert.ok(hasWarning(over, /range|100|feet|ft/i), `101 ft warns: ${warningText(over)}`);
  assert.equal(hasWarning(at, /range|beyond|100\s*(feet|ft)/i), false, "100 ft is in range");
});

test("CM-4: the Cursemark Aid Die is a d6 (formula 1d6) at level 4 and level 10 (C3:7302-7305)", async () => {
  await ready();
  for (const level of [4, 10]) {
    const s = makeHexer({ level });
    const opId = `cm4-${level}`;
    await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "abjuring", distance: 30 }, opId);
    assert.equal(receiptOf(s, opId).formula, "1d6", `level ${level} cursemark die`);
  }
});

test("CM-5: a binding Cursemark rolls two d6 (the Aid Die counted as a d6)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "binding", distance: 30 }, "cm5-op");
  assert.equal(receiptOf(s, "cm5-op").formula, "2d6");
});

test("CM-6: cursemarkTargets returns a creature at the point and not one far away (radius 10 ft)", async () => {
  const H = await ready();
  const s = makeHexer({ level: 4 });
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "cm6-op");
  const markId = s.flags.ak5e.hexer.cursemarks.at(-1).id;
  const near = foeActor("Near"), far = foeActor("Far");
  const tokens = [
    { uuid: `Scene.x.Token.near`, name: near.name, actor: near, x: -50, y: -50, center: { x: 0, y: 0 } },
    { uuid: `Scene.x.Token.far`, name: far.name, actor: far, x: 9950, y: -50, center: { x: 10000, y: 0 } }
  ];
  const hit = (H.cursemarkTargets(s, markId, tokens) ?? []).map(t => t.actor?.uuid ?? t.actorUuid ?? t.uuid ?? t);
  assert.ok(hit.includes(near.uuid), "the creature at the point is affected");
  assert.equal(hit.includes(far.uuid), false, "a creature far outside the radius is not affected");
});

test("CM-7: a creature on the Spare the Rod list is not affected by the Cursemark (C3:7307-7312)", async () => {
  const H = await ready();
  const s = makeHexer({ level: 10 });
  const spared = foeActor("Spared");
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30, excluded: [spared.uuid] }, "cm7-op");
  const markId = s.flags.ak5e.hexer.cursemarks.at(-1).id;
  const tokens = [{ uuid: "Scene.x.Token.spared", name: spared.name, actor: spared, x: -50, y: -50, center: { x: 0, y: 0 } }];
  const hit = (H.cursemarkTargets(s, markId, tokens) ?? []).map(t => t.actor?.uuid ?? t.actorUuid ?? t.uuid ?? t);
  assert.equal(hit.includes(spared.uuid), false, "a spared creature inside the radius is unaffected");
});

test("CM-8: Spare the Rod warns below level 10 (boundary 9/10, C3:7307-7312)", async () => {
  await ready();
  const spared = foeActor("Spared");
  const low = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 9 }), "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30, excluded: [spared.uuid] }));
  const high = await warningsOf(() => Uses.supporterUses.plan(makeHexer({ level: 10 }), "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30, excluded: [spared.uuid] }));
  assert.ok(levelWarning(low), `level 9 warns: ${warningText(low)}`);
  assert.equal(levelWarning(high), false);
});

test("CM-9: a Cursemark with an empty Potent pool warns and records the shortfall when used anyway", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  for (let i = 0; i < pbOf(4); i++) await run(s, "potentHex", potentData(foeActor(`F${i}`), "looping"), `cm9-fill-${i}`);
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }));
  assert.ok(ws.length > 0, "an empty pool warns");
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30, overrides: overridesFor(ws) }, "cm9-anyway");
  assert.equal(potentValue(s), 0, "clamped at 0");
  assert.ok(recordsShortfall(receiptOf(s, "cm9-anyway")));
});

test("CM-10: undo of a Cursemark removes the cursemark record and restores the Potent pool", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const prior = potentValue(s);
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "looping", distance: 30 }, "cm10-op");
  await Uses.supporterUses.undo(s, "cm10-op");
  assert.equal(potentValue(s), prior);
  assert.equal((s.flags.ak5e.hexer?.cursemarks ?? []).length, 0, "the cursemark record is removed");
});

test("CM-11: a Cursemark never rolls when planned or applied (abjuring formula only, no click)", async () => {
  await ready();
  const s = makeHexer({ level: 4 });
  const calls = rollSpy(4);
  await run(s, "cursemark", { point: { x: 0, y: 0 }, kind: "abjuring", distance: 30 }, "cm11-op");
  assert.deepEqual(calls, []);
});

/* ==========================================================================
   8. Gospel of Curses (level 13): Voicethief and Wasting
   ========================================================================== */

test("GO-1: Voicethief at level 13 posts an INT save against the Hexer's Spell Save DC (cha fallback = 17)", async () => {
  await ready();
  const s = makeHexer({ level: 13 });
  await run(s, "potentHex", potentData(foeActor(), "voicethief"), "go1-op");
  const dc = 8 + pbOf(13) + DEFAULT_MODS.cha;
  assert.equal(dc, 17, "oracle: 8 + PB 5 + CHA 4");
  assert.ok(showsDC(receiptOf(s, "go1-op"), dc), "the save DC is shown on the card");
  assert.match(JSON.stringify(receiptOf(s, "go1-op") ?? {}), /intelligence|\bint\b/i, "the save is Intelligence");
});

test("GO-2: Voicethief uses the Arts casting ability for its DC when one is set (int mod 2 gives 15)", async () => {
  await ready();
  const s = makeHexer({ level: 13, casting: { ability: "int" } });
  await run(s, "potentHex", potentData(foeActor(), "voicethief"), "go2-op");
  assert.ok(showsDC(receiptOf(s, "go2-op"), 8 + pbOf(13) + DEFAULT_MODS.int), "DC 15");
});

test("GO-3: hexerSpellSaveDC is 8 + PB + the casting ability modifier, falling back to CHA (C3:7281, C3:6958 family)", async () => {
  const H = await ready();
  assert.equal(H.hexerSpellSaveDC(makeHexer({ level: 5 })), 8 + pbOf(5) + DEFAULT_MODS.cha, "fallback to CHA 4 gives 15");
  assert.equal(H.hexerSpellSaveDC(makeHexer({ level: 5, mods: { int: 3 }, casting: { ability: "int" } })), 8 + pbOf(5) + 3, "INT 3 gives 14");
  assert.equal(H.hexerSpellSaveDC(makeHexer({ level: 9, mods: { wis: 4 }, casting: { ability: "wis" } })), 8 + pbOf(9) + 4, "WIS 4 at PB 4 gives 16");
});

test("GO-4: Wasting records the chosen ability and a penalty roll of one Aid Die (level 13: 1d10, C3:7313)", async () => {
  await ready();
  const s = makeHexer({ level: 13 });
  const foe = foeActor();
  const calls = rollSpy(7);
  await run(s, "potentHex", potentData(foe, "wasting", { ability: "dex" }), "go4-op");
  assert.equal(receiptOf(s, "go4-op").formula, "1d10");
  assert.deepEqual(calls, [], "no roll before the click");
  await click(s, "go4-op");
  assert.equal(hexOfKind(foe, "wasting")?.ability, "dex", "the ability is recorded");
  assert.equal(hexOfKind(foe, "wasting")?.roll, 7, "the penalty roll is recorded on the click");
});

test("GO-5: Voicethief never rolls at application (the save is a button, not a roll)", async () => {
  await ready();
  const s = makeHexer({ level: 13 });
  const calls = rollSpy(4);
  await run(s, "potentHex", potentData(foeActor(), "voicethief"), "go5-op");
  assert.deepEqual(calls, []);
});

/* ==========================================================================
   9. Ultimate Hex (level 17, C3:7325-7330)
   ========================================================================== */

test("UL-1: the Ultimate Hex is once per Long Rest; a second use with 'Use anyway' keeps the pool at 0 and records the shortfall", async () => {
  await ready();
  const s = makeHexer({ level: 17 });
  await run(s, "ultimateHex", potentData(foeActor("U1"), "looping"), "ul1-op");
  assert.equal(ultimatePool(s).value, 0);
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "ultimateHex", potentData(foeActor("U2"), "looping")));
  assert.ok(ws.length > 0, "a second Ultimate Hex in the Long Rest warns");
  await run(s, "ultimateHex", potentData(foeActor("U2"), "looping", { overrides: overridesFor(ws) }), "ul1-anyway");
  assert.equal(ultimatePool(s).value, 0, "clamped at 0");
  assert.ok(recordsShortfall(receiptOf(s, "ul1-anyway")));
});

test("UL-2: the Ultimate Hex does not stack with a Potent Hex on the same creature (warning, C3:7330)", async () => {
  await ready();
  const s = makeHexer({ level: 17 });
  const foe = foeActor();
  await run(s, "potentHex", potentData(foe, "looping"), "ul2-potent");
  const ws = await warningsOf(() => Uses.supporterUses.plan(s, "ultimateHex", potentData(foe, "looping")));
  assert.ok(hasWarning(ws, /hex|potent|cumulative|stack|already/i), `the stacking warning is raised: ${warningText(ws)}`);
});

test("UL-3: the Ultimate Hex applies its non-roll kinds with ultimate: true (C3:7325-7330)", async () => {
  await ready();
  const s = makeHexer({ level: 17 });
  const foe = foeActor();
  await run(s, "ultimateHex", potentData(foe, "looping"), "ul3-op");
  const ultimates = hexEffects(foe).filter(effect => flagOf(effect).ultimate === true);
  const kinds = ultimates.flatMap(kindsOf);
  assert.ok(kinds.includes("looping"), `looping is in the Ultimate Hex, got ${JSON.stringify(kinds)}`);
  assert.ok(kinds.includes("voicethief"), `voicethief (level 13+ option) is in the Ultimate Hex, got ${JSON.stringify(kinds)}`);
});

test.todo("UL-3b: the Ultimate Hex includes the roll-based kinds (abjuring, binding, breaking, wasting) with ultimate: true; the contract does not fix how many clicks the multi-roll Ultimate needs.");

test("UL-4: Rupturing: when the ultimate-hexed creature is reduced to 0 HP, a 15 ft DEX save with 4 Aid Die damage is posted", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const s = makeHexer({ level: 17 });
  const foe = foeActor("Ruptured");
  await run(s, "ultimateHex", potentData(foe, "looping"), "ul4-op");
  const before = messageCount();
  await emitAk5eEvent("kill", { actorUuid: foe.uuid, eventId: "kill:ul4" });
  assert.ok(messageCount() > before, "a Rupturing card is posted on the kill");
  const text = lastMessageText();
  assert.match(text, /dex/i, "the save is Dexterity");
  assert.match(text, /15\s*ft/i, "the save reaches 15 ft");
  assert.match(text, /4d12/i, "four Aid Die (d12 at level 17) of damage");
  assert.match(text, /<button/i, "the damage is a button, not an automatic roll");
});

test("UL-5: Rupturing is not posted for a creature with no Ultimate Hex from this Hexer", async () => {
  const H = await ready();
  H.registerHexerHooks();
  const s = makeHexer({ level: 17 });
  const plain = foeActor("Plain");
  await run(s, "potentHex", potentData(foeActor("Other"), "looping"), "ul5-other");
  const before = messageCount();
  await emitAk5eEvent("kill", { actorUuid: plain.uuid, eventId: "kill:ul5" });
  assert.equal(messageCount() - before, 0);
});

test("UL-6: undo of the Ultimate Hex removes its effects and restores the Ultimate pool to 1", async () => {
  await ready();
  const s = makeHexer({ level: 17 });
  const foe = foeActor();
  await run(s, "ultimateHex", potentData(foe, "looping"), "ul6-op");
  assert.equal(ultimatePool(s).value, 0);
  await Uses.supporterUses.undo(s, "ul6-op");
  assert.equal(ultimatePool(s).value, 1, "exact prior value");
  assert.equal(hexEffects(foe).length, 0);
});

test("UL-7: the Ultimate Hex lasts 1 minute and never rolls at application", async () => {
  await ready();
  const s = makeHexer({ level: 17 });
  const foe = foeActor();
  const calls = rollSpy(6);
  await run(s, "ultimateHex", potentData(foe, "looping"), "ul7-op");
  assert.deepEqual(calls, []);
  const [effect] = hexEffects(foe);
  assert.ok(effect && (isOneMinute(flagOf(effect).expires) || isOneMinute(effect.duration)), "1-minute expiry on the Ultimate Hex");
});

/* ==========================================================================
   10. Hexed-target helpers and panel
   ========================================================================== */

test("HX-1: isHexed and hexesOn report the creature's Hexes, and an unhexed creature reports none", async () => {
  const H = await ready();
  const s = makeHexer({ level: 4 });
  const foe = foeActor();
  assert.equal(H.isHexed(foe), false, "no Hex before");
  await run(s, "potentHex", potentData(foe, "looping"), "hx1-op");
  assert.equal(H.isHexed(foe), true, "hexed after the Hex is applied");
  assert.ok(H.hexesOn(foe).length >= 1, "hexesOn lists the Hex");
});

test("HX-2: hexerPanel returns HTML that lists Potent Hex and escapes a hostile actor name", async () => {
  const H = await ready();
  const evil = makeHexer({ level: 5 });
  evil.name = "<img src=x onerror=alert(1)>";
  const html = H.hexerPanel(evil);
  assert.equal(typeof html, "string");
  assert.match(html, /Potent Hex/i);
  assert.equal(html.includes("<img src=x"), false, "the actor name is escaped in the panel");
});
