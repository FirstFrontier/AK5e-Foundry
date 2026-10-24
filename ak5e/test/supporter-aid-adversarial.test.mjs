/**
 * U1 adversarial challenge suite: Supporter base Aid Die engine.
 *
 * Behavior-level tests written from the source (AK5e 1.3.1 Ch.3, Supporter, L6548-6692; "C3:NNNN" below
 * cites the source line) and the head rulings R1-R6 in ak5e/DECISIONS.md ("Supporter Class and Artificer /
 * Bard / Hexer Branches"). Written against the U1 contract; many tests are expected to FAIL until the
 * implementation lands. Namespace imports keep a missing export from failing the whole file.
 *
 * Oracles (die size, PB, table values) are copied from the source table at C3:6557-6578, never read from
 * the implementation under test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setupFoundryGlobals, teardownFoundryGlobals, createTestActor, createTestItem
} from "./base-classes-fixture.mjs";
import * as Rules from "../scripts/supporter-rules.mjs";
import * as Features from "../scripts/supporter-features.mjs";
import * as Uses from "../scripts/supporter-uses.mjs";
import { getPool, recoverPool } from "../scripts/resource-pools.mjs";
import { getReactions } from "../scripts/trigger-events.mjs";

/* ==========================================================================
   Oracles and helpers
   ========================================================================== */

// C3:6557-6578 Aid Die column: d8 at 1-6, d10 at 7-13, d12 at 14-20.
const dieOf = level => (level >= 14 ? "d12" : level >= 7 ? "d10" : "d8");
// C3:6557-6578 Proficiency Bonus column: +2 at 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20.
const pbOf = level => Math.floor((level - 1) / 4) + 2;
const DEFAULT_MODS = Object.freeze({ str: 0, dex: 2, con: 2, int: 2, wis: 1, cha: 4 });

test.beforeEach(() => {
  setupFoundryGlobals();
  Features.defineSupporterPools();
});

test.afterEach(() => {
  teardownFoundryGlobals();
});

/** A Supporter at `level`. `mods` overrides ability modifiers; `aidAbility` and `branch` are optional flags. */
function makeSupporter({ level = 1, mods = {}, aidAbility, branch, subclass = null, enabled = true, hp } = {}) {
  const abilities = {};
  for (const [key, mod] of Object.entries({ ...DEFAULT_MODS, ...mods })) abilities[key] = { mod, value: 10 + 2 * mod };
  const items = [createTestItem({
    name: "Supporter", type: "class", system: { levels: level },
    flags: { ak5e: { chapterThreeId: "class-supporter" } }
  })];
  if (subclass) {
    items.push(createTestItem({ name: subclass.name, type: "subclass", flags: { ak5e: { chapterThreeId: subclass.id } } }));
  }
  const supporter = { enabled };
  if (aidAbility !== undefined) supporter.aidAbility = aidAbility;
  if (branch !== undefined) supporter.branch = branch;
  return createTestActor({
    name: `Supporter L${level}`, level, items, abilities,
    hp: hp ?? { value: 20, max: 20, temp: 0 },
    flags: { ak5e: { supporter } }
  });
}

/** A creature that is not a Supporter (no class item). */
function makeAlly(name = "Ally", hp) {
  return createTestActor({ name, hp: hp ?? { value: 10, max: 20, temp: 0 } });
}

const pool = actor => getPool(actor, "aidDie");
const poolValue = actor => pool(actor).value;

/** Bring the pool down to `target` through the public Provide Aid use (no spendAidDice in setup). */
async function drainTo(actor, target) {
  for (let i = 0; poolValue(actor) > target && i < 40; i++) {
    await Uses.supporterUses.execute(actor, "provideAid", grantData(makeAlly(`Drain ${i}`)), `drain-${i}`);
  }
  return poolValue(actor);
}

/** The Advanced Aid attack rider is recorded on the use's result: crit wording or advancedEffect "attack". */
function critRiderRecorded(receipt) {
  return /crit/i.test(JSON.stringify(receipt?.result ?? {})) || receipt?.result?.advancedEffect === "attack";
}

/** Run a plan and return the warning ids, whether the engine threw them (AK5eWarnings) or returned them. */
async function warningIds(run) {
  try {
    const plan = await run();
    return (plan?.warnings ?? []).map(w => w.id);
  } catch (error) {
    if (error?.name === "AK5eWarnings") return error.warnings.map(w => w.id);
    throw error;
  }
}

/** Returns true when the engine blocks the action until the warning is used anyway. */
async function blockedUntilOverridden(run) {
  try {
    await run();
    return false;
  } catch (error) {
    if (error?.name === "AK5eWarnings") return true;
    throw error;
  }
}

/** Shortfall is recorded on the receipt (play-uses convention: `shortfalls` array, or some explicit note). */
function recordsShortfall(receipt) {
  return (Array.isArray(receipt?.shortfalls) && receipt.shortfalls.length > 0) || /short/i.test(JSON.stringify(receipt ?? {}));
}

/** Number of roll buttons in whatever shape the implementation returns (HTML string, array, or {buttons}). */
function buttonCount(out) {
  if (out == null) return 0;
  if (typeof out === "string") return (out.match(/<button\b/gi) ?? []).length;
  if (Array.isArray(out)) return out.length;
  if (Array.isArray(out.buttons)) return out.buttons.length;
  if (typeof out.html === "string") return buttonCount(out.html);
  return 0;
}

/** Roll button output for an Aid Die roll. The brief leaves the signature open, so pass a superset of keys. */
function rollButtonsFor(actor, rollType, level) {
  return Features.rollAidDieButton(actor, {
    rollType, type: rollType, rollKind: rollType, dieSize: dieOf(level),
    supporterLevel: level, level, supporterPB: pbOf(level)
  });
}

/** Stub Roll so any evaluate() or static roll() during plan, apply, undo or button creation is recorded. */
function forbidRolls() {
  const calls = [];
  globalThis.Roll = class ForbiddenRoll {
    constructor(formula, data = {}) { this.formula = formula; this.data = data; }
    async evaluate() { calls.push("evaluate"); throw new Error("Roll.evaluate must not run before the player clicks Roll"); }
    static async roll() { calls.push("roll"); throw new Error("Roll.roll must not run before the player clicks Roll"); }
  };
  return calls;
}

const grantData = target => ({ targetUuid: target.uuid, targetName: target.name, distance: 30 });
const grant = (giver, target, opId, extra = {}) =>
  Uses.supporterUses.execute(giver, "provideAid", { ...grantData(target), ...extra }, opId);

/** Pair of Supporters at `level`: a giver and a holder who can take a die. */
function aidPair(level) {
  return { giver: makeSupporter({ level }), holder: makeSupporter({ level, hp: { value: 10, max: 20, temp: 0 } }) };
}

/* ==========================================================================
   1. Exports and rulings
   ========================================================================== */

// Ruling R2: the base class prints no DC, so supporterDC must not be exported.
test("EXP-1: supporterDC is no longer exported from supporter-rules (R2)", () => {
  assert.equal(Rules.supporterDC, undefined);
});

// Branch flags: isArtificer/isBard/isHexer are true for the flag key or for the subclass item.
test("BR-1: branch flag selects the matching branch predicate only", async () => {
  const artificer = makeSupporter({ level: 4, branch: "artificer" });
  assert.equal(await Rules.isArtificer(artificer), true);
  assert.equal(await Rules.isBard(artificer), false);
  assert.equal(await Rules.isHexer(artificer), false);
});

test("BR-2: subclass item with chapterThreeId subclass-supporter-<key> selects the branch when no flag is set", async () => {
  const bard = makeSupporter({ level: 4, subclass: { name: "Bard", id: "subclass-supporter-bard" } });
  assert.equal(await Rules.isBard(bard), true);
  assert.equal(await Rules.isArtificer(bard), false);
  assert.equal(await Rules.isHexer(bard), false);
});

test("BR-3: a Supporter with no branch is none of the branch predicates", async () => {
  const plain = makeSupporter({ level: 4 });
  assert.equal(await Rules.isArtificer(plain), false);
  assert.equal(await Rules.isBard(plain), false);
  assert.equal(await Rules.isHexer(plain), false);
});

test("BR-4: a hexer flag is recognised", async () => {
  const hexer = makeSupporter({ level: 4, branch: "hexer" });
  assert.equal(await Rules.isHexer(hexer), true);
  assert.equal(await Rules.isBard(hexer), false);
});

/* ==========================================================================
   2. Level tables and boundaries (C3:6557-6578)
   ========================================================================== */

test("LV-1: Aid Die size boundary 6/7 is d8 -> d10 (C3:6557-6565)", () => {
  assert.equal(Rules.aidDieSize(6), "d8");
  assert.equal(Rules.aidDieSize(7), "d10");
});

test("LV-2: Aid Die size boundary 13/14 is d10 -> d12 (C3:6571-6572)", () => {
  assert.equal(Rules.aidDieSize(13), "d10");
  assert.equal(Rules.aidDieSize(14), "d12");
});

test("LV-3: aidDieFormula matches the table at the 6/7 boundary", async () => {
  assert.equal(await Features.aidDieFormula(makeSupporter({ level: 6 })), "1d8");
  assert.equal(await Features.aidDieFormula(makeSupporter({ level: 7 })), "1d10");
});

test("LV-4: aidDieFormula matches the table at the 13/14 boundary", async () => {
  assert.equal(await Features.aidDieFormula(makeSupporter({ level: 13 })), "1d10");
  assert.equal(await Features.aidDieFormula(makeSupporter({ level: 14 })), "1d12");
});

test("LV-5: aidDieFormula and aidDieSize agree with the oracle at every level 1-20", async () => {
  for (let level = 1; level <= 20; level++) {
    assert.equal(Rules.aidDieSize(level), dieOf(level), `aidDieSize(${level})`);
    assert.equal(await Features.aidDieFormula(makeSupporter({ level })), `1${dieOf(level)}`, `aidDieFormula at ${level}`);
  }
});

test("LV-6: pbForLevel matches the Proficiency Bonus column at every level 1-20 (C3:6557-6578)", () => {
  for (let level = 1; level <= 20; level++) {
    assert.equal(Rules.pbForLevel(level), pbOf(level), `pbForLevel(${level})`);
  }
});

test("LV-7: supporterLevel reads the Supporter class level", async () => {
  assert.equal(await Rules.supporterLevel(makeSupporter({ level: 7 })), 7);
});

/* ==========================================================================
   3. Aid Die pool maximum (R1: the chosen mental modifier, no floor)
   ========================================================================== */

// R1 / C3:6637: the pool maximum is the modifier of the chosen ability, not the highest mental modifier.
test("R1-1: default aidAbility is CHA, not the highest mental modifier (int 5, cha 2 -> max 2)", async () => {
  const s = makeSupporter({ level: 4, mods: { int: 5, wis: 1, cha: 2 } });
  assert.equal(pool(s).max, 2);
});

test("R1-2: aidAbility INT gives max = INT mod even when CHA is higher (int 2, cha 4 -> max 2)", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "int" });
  assert.equal(pool(s).max, 2);
});

test("R1-3: aidAbility WIS gives max = WIS mod (wis 1 while cha 4 -> max 1)", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "wis" });
  assert.equal(pool(s).max, 1);
});

test("R1-4: a negative chosen modifier gives max 0, not 1 and not the highest mental modifier", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "cha", mods: { cha: -1, int: 3 } });
  assert.equal(pool(s).max, 0);
  assert.equal(poolValue(s), 0, "pool value is never negative");
});

test("R1-5: a zero chosen modifier gives max 0 and Provide Aid warns on the empty pool", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "int", mods: { int: 0 } });
  assert.equal(pool(s).max, 0);
  const ally = makeAlly();
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  assert.ok(ids.length > 0, "a zero-dice pool must warn");
});

test("R1-6: pool max equals the chosen modifier for INT, WIS and CHA across modifiers 1-6", async () => {
  for (const aidAbility of ["int", "wis", "cha"]) {
    for (let mod = 1; mod <= 6; mod++) {
      const s = makeSupporter({ level: 4, aidAbility, mods: { [aidAbility]: mod } });
      assert.equal(pool(s).max, mod, `${aidAbility} mod ${mod}`);
    }
  }
});

test("R1-7: the implementation reads aidAbility, not a hard-coded ability (aidAbility int, int 6 is never capped by cha 4)", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "int", mods: { int: 6 } });
  assert.equal(pool(s).max, 6);
});

/* ==========================================================================
   4. Provide Aid: range, targets, one die per creature (R3)
   ========================================================================== */

test("PA-1: range boundary: 60 ft has no range warning, 61 ft has one (C3:6633)", async () => {
  const s = makeSupporter({ level: 3 });
  const ally = makeAlly();
  const at60 = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", { ...grantData(ally), distance: 60 }));
  const at61 = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", { ...grantData(ally), distance: 61 }));
  assert.ok(!at60.includes("range"), "60 ft is in range");
  assert.ok(at61.includes("range"), "61 ft is out of range");
});

test("PA-2: a target given by uuid only is resolved, so a second grant to it warns (R3, uuid lookup)", async () => {
  const s = makeSupporter({ level: 5 });
  const ally = makeAlly("Texas");
  await grant(s, ally, "pa2-first");
  assert.equal(ally.effects.size, 1, "first grant creates the Aid Die effect on the target");
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  assert.ok(ids.includes("targetHasAidDie"), "a creature already holding an Aid Die warns");
});

// R3: warning, not a block. Use anyway proceeds.
test("R3-1: giving an Aid Die to a creature already holding one is blocked until 'Use anyway' (R3)", async () => {
  const s = makeSupporter({ level: 5 });
  const ally = makeAlly("Nearl");
  await grant(s, ally, "r3-first");
  const blocked = await blockedUntilOverridden(() => Uses.supporterUses.execute(s, "provideAid", grantData(ally), "r3-second"));
  assert.equal(blocked, true, "the warning must surface to the player before the grant");
  assert.equal(poolValue(s), 3, "nothing is spent by the blocked attempt");
});

test("R3-2: 'Use anyway' proceeds past the existing-Aid-Die warning and spends one die (R3)", async () => {
  const s = makeSupporter({ level: 5 });
  const ally = makeAlly("Nearl");
  await grant(s, ally, "r3-first-b");
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  assert.ok(ids.length > 0, "the second grant warns");
  await Uses.supporterUses.execute(s, "provideAid", { ...grantData(ally), overrides: ids }, "r3-second-b");
  assert.equal(poolValue(s), 2, "the overridden grant spends one die");
});

test("PA-3: a Supporter cannot Provide Aid to itself without a warning (C3:6633 'another Creature')", async () => {
  const s = makeSupporter({ level: 3 });
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", {
    targetUuid: s.uuid, targetName: s.name, distance: 0
  }));
  assert.ok(ids.length > 0, "Provide Aid to self must warn");
});

/* ==========================================================================
   5. Empty pool and shortfall
   ========================================================================== */

test("EP-1: Provide Aid at 0 dice warns and cannot be used without 'Use anyway'", async () => {
  const s = makeSupporter({ level: 1, aidAbility: "cha", mods: { cha: 1 } });
  await grant(s, makeAlly("First"), "ep1-first");
  assert.equal(poolValue(s), 0);
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(makeAlly("Second"))));
  assert.ok(ids.length > 0, "an empty pool must warn");
  assert.equal(await blockedUntilOverridden(() => Uses.supporterUses.execute(s, "provideAid", grantData(makeAlly("Third")), "ep1-second")), true);
});

test("EP-2: 'Use anyway' at 0 dice clamps the pool at 0 and records the shortfall on the receipt", async () => {
  const s = makeSupporter({ level: 1, aidAbility: "cha", mods: { cha: 1 } });
  await grant(s, makeAlly("First"), "ep2-first");
  const ally = makeAlly("Second");
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  assert.ok(ids.length > 0, "the empty pool warns");
  await Uses.supporterUses.execute(s, "provideAid", { ...grantData(ally), overrides: ids }, "ep2-second");
  assert.equal(poolValue(s), 0, "the pool never goes negative");
  assert.ok(recordsShortfall(Uses.supporterUses.receipt(s, "ep2-second")), "the shortfall is recorded on the receipt");
});

test("EP-3: spendAidDice clamps at 0 and records the shortfall when it overspends", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "int", mods: { int: 2 } });
  await Features.spendAidDice(s, 1, {});
  assert.equal(poolValue(s), 1);
  const receipt = {};
  await Features.spendAidDice(s, 5, receipt);
  assert.equal(poolValue(s), 0, "clamped at 0");
  assert.ok(recordsShortfall(receipt), "overspend is recorded on the receipt");
});

test("EP-4: spendAidDice that exactly empties the pool records no shortfall", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "int", mods: { int: 2 } });
  const receipt = {};
  await Features.spendAidDice(s, 2, receipt);
  assert.equal(poolValue(s), 0);
  assert.equal(recordsShortfall(receipt), false, "an exact spend is not a shortfall");
});

test("EP-5: spendAidDice with zero spends nothing and records no shortfall", async () => {
  const s = makeSupporter({ level: 4 });
  const receipt = {};
  await Features.spendAidDice(s, 0, receipt);
  assert.equal(poolValue(s), pool(s).max);
  assert.equal(recordsShortfall(receipt), false);
});

/* ==========================================================================
   6. Cancel changes nothing
   ========================================================================== */

test("CX-1: planning without confirming changes nothing (pool, effects, messages, receipts)", async () => {
  const s = makeSupporter({ level: 7 });
  const ally = makeAlly();
  const before = poolValue(s), messages = game.messages.length;
  await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  assert.equal(poolValue(s), before);
  assert.equal(ally.effects.size, 0);
  assert.equal(game.messages.length, messages);
  assert.equal(Uses.supporterUses.uses(s).length, 0);
});

test("CX-2: a command that is not confirmed is rejected and changes nothing", async () => {
  const s = makeSupporter({ level: 7 });
  const ally = makeAlly();
  const before = poolValue(s);
  await assert.rejects(() => Uses.supporterUses.command(s, "provideAid", grantData(ally), "cx2-op"));
  assert.equal(poolValue(s), before);
  assert.equal(ally.effects.size, 0);
  assert.equal(Uses.supporterUses.receipt(s, "cx2-op"), null);
});

/* ==========================================================================
   7. No auto-roll (WORKFLOW 3.2: dice only from the player's button)
   ========================================================================== */

test("NR-1: Provide Aid, useAidDie and button creation never call Roll.evaluate or Roll.roll", async () => {
  const rolls = forbidRolls();
  const { giver, holder } = aidPair(5);
  await grant(giver, holder, "nr1-grant");
  await Uses.supporterUses.execute(holder, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 5 }, "nr1-use");
  await rollButtonsFor(giver, "skill", 5);
  assert.deepEqual(rolls, [], `no Roll call expected, saw: ${rolls.join(", ")}`);
});

test("NR-2: plan-only and undo flows never call Roll", async () => {
  const rolls = forbidRolls();
  const s = makeSupporter({ level: 7 });
  const ally = makeAlly();
  await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  await grant(s, ally, "nr2-grant");
  await Uses.supporterUses.undo(s, "nr2-grant");
  assert.deepEqual(rolls, []);
});

/* ==========================================================================
   8. Roll buttons (useAidDie and rollAidDieButton)
   ========================================================================== */

// C3:6658 / 6661 / 6662: the skill rider rolls the die an additional time; other riders are not rolled automatically.
test("RB-1: level 4 skill check offers one roll button (below Advanced Aid, C3:6652)", async () => {
  const s = makeSupporter({ level: 4 });
  assert.equal(buttonCount(await rollButtonsFor(s, "skill", 4)), 1);
});

test("RB-2: level 5 skill check offers two roll buttons (Advanced Aid skill rider, C3:6659)", async () => {
  const s = makeSupporter({ level: 5 });
  assert.equal(buttonCount(await rollButtonsFor(s, "skill", 5)), 2);
});

test("RB-3: an attack roll at level 5 has one roll button; the crit rider is not a second roll (C3:6658)", async () => {
  const s = makeSupporter({ level: 5 });
  assert.equal(buttonCount(await rollButtonsFor(s, "attack", 5)), 1);
});

// C3:6660-6662: save, damage and healing riders are buttons only; nothing is applied automatically.
test("RB-4: save, damage and healing riders at level 5 apply nothing automatically", async () => {
  for (const rollType of ["save", "damage", "healing"]) {
    const { giver, holder } = aidPair(5);
    await grant(giver, holder, `rb4-grant-${rollType}`);
    const rolls = forbidRolls();
    await Uses.supporterUses.execute(holder, "useAidDie", { rollType, dieSize: "d10", supporterLevel: 5 }, `rb4-use-${rollType}`);
    assert.equal(holder.system.attributes.hp.temp, 0, `${rollType}: no Temporary HP applied automatically`);
    assert.equal(holder.system.attributes.hp.value, 10, `${rollType}: no Hit Points changed automatically`);
    assert.deepEqual(rolls, [], `${rollType}: no Roll call`);
    assert.ok(buttonCount(await rollButtonsFor(holder, rollType, 5)) >= 1, `${rollType}: at least one roll button`);
  }
});

// R5 / ruling 5 (C3:6692): Will Into Being is an opt-in +PB button on every Aid Die roll.
test("WI-1: Will Into Being bonus is +PB at level 20 and zero at level 19 (C3:6692)", async () => {
  assert.equal(Features.willIntoBeingBonus(makeSupporter({ level: 19 })), 0);
  assert.equal(Features.willIntoBeingBonus(makeSupporter({ level: 20 })), 6);
});

test("WI-2: at level 20 the +PB is an extra opt-in button, not applied automatically (R5)", async () => {
  const at19 = makeSupporter({ level: 19 });
  const at20 = makeSupporter({ level: 20 });
  const rolls = forbidRolls();
  const count19 = buttonCount(await rollButtonsFor(at19, "attack", 19));
  const count20 = buttonCount(await rollButtonsFor(at20, "attack", 20));
  assert.equal(count20, count19 + 1, "one extra opt-in +PB button at level 20");
  assert.deepEqual(rolls, []);
});

/* ==========================================================================
   9. useAidDie: effect removal, warnings, Advanced Aid crit
   ========================================================================== */

test("UA-1: useAidDie removes the holder's Aid Die effect", async () => {
  const { giver, holder } = aidPair(5);
  await grant(giver, holder, "ua1-grant");
  assert.equal(holder.effects.size, 1);
  await Uses.supporterUses.execute(holder, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 5 }, "ua1-use");
  assert.equal(holder.effects.size, 0, "the expended die's effect is removed");
});

test("UA-2: undo of useAidDie re-creates the holder's Aid Die effect", async () => {
  const { giver, holder } = aidPair(5);
  await grant(giver, holder, "ua2-grant");
  await Uses.supporterUses.execute(holder, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 5 }, "ua2-use");
  await Uses.supporterUses.undo(holder, "ua2-use");
  assert.equal(holder.effects.size, 1, "undo restores the Aid Die effect");
});

test("UA-3: a death save gets a warning and cannot be used without 'Use anyway' (C3:6635)", async () => {
  const { giver, holder } = aidPair(5);
  await grant(giver, holder, "ua3-grant");
  const ids = await warningIds(() => Uses.supporterUses.plan(holder, "useAidDie", {
    rollType: "save", dieSize: "d8", supporterLevel: 5, isDeathSave: true
  }));
  assert.ok(ids.includes("deathSave"), "a death save warns");
  assert.equal(await blockedUntilOverridden(() => Uses.supporterUses.execute(holder, "useAidDie", {
    rollType: "save", dieSize: "d8", supporterLevel: 5, isDeathSave: true
  }, "ua3-use")), true);
});

test("UA-4: an invalid roll type (initiative) warns; the Aid Die is only for attack, skill, save, damage and healing (C3:6635)", async () => {
  const { holder } = aidPair(5);
  const ids = await warningIds(() => Uses.supporterUses.plan(holder, "useAidDie", {
    rollType: "initiative", dieSize: "d8", supporterLevel: 5
  }));
  assert.ok(ids.length > 0, "an unsupported roll type must warn");
});

// C3:6635: "they may expend and roll that Aid Dice". The holder is any Creature, not only a Supporter.
test("UA-5: a non-Supporter creature holding an Aid Die can expend it (C3:6635)", async () => {
  const giver = makeSupporter({ level: 3 });
  const ally = makeAlly("Non-supporter holder");
  await grant(giver, ally, "ua5-grant");
  assert.equal(ally.effects.size, 1, "the non-Supporter holds the Aid Die effect");
  const rolls = forbidRolls();
  await Uses.supporterUses.execute(ally, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 3 }, "ua5-use");
  assert.equal(ally.effects.size, 0, "the expended die is removed from the non-Supporter holder");
  assert.deepEqual(rolls, [], "no Roll call");
});

// C3:6664-6666 / 6658: Advanced Aid starts at level 5. Attack rider widens crit for that one attack.
test("ADV-CRIT-1: level 5 attack rider widens the crit range for that attack only (C3:6658, R6)", async () => {
  const { giver, holder } = aidPair(5);
  await grant(giver, holder, "crit1-grant");
  await Uses.supporterUses.execute(holder, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 5 }, "crit1-use");
  const receipt = Uses.supporterUses.receipt(holder, "crit1-use");
  assert.ok(receipt, "the attack use is recorded");
  assert.equal(critRiderRecorded(receipt), true, "the crit rider is recorded for the attack");
  assert.equal(holder.effects.size, 0, "no lingering crit effect on the holder");
});

test("ADV-CRIT-2: level 4 attack has no Advanced Aid crit rider (C3:6652 boundary 4/5, R6)", async () => {
  const { giver, holder } = aidPair(4);
  await grant(giver, holder, "crit2-grant");
  await Uses.supporterUses.execute(holder, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 4 }, "crit2-use");
  const receipt = Uses.supporterUses.receipt(holder, "crit2-use");
  assert.equal(critRiderRecorded(receipt), false, "no crit rider below level 5");
});

/* ==========================================================================
   10. Undo restores the exact prior state
   ========================================================================== */

test("UN-1: undo of Provide Aid restores the exact prior pool value and removes the effect", async () => {
  const s = makeSupporter({ level: 7 });
  const ally = makeAlly();
  const prior = poolValue(s);
  await grant(s, ally, "un1-grant");
  assert.equal(poolValue(s), prior - 1);
  await Uses.supporterUses.undo(s, "un1-grant");
  assert.equal(poolValue(s), prior, "exact prior value");
  assert.equal(ally.effects.size, 0, "the Aid Die effect is removed");
});

test("UN-2: undo restores the exact prior value when the pool was not at its maximum", async () => {
  const s = makeSupporter({ level: 4, aidAbility: "cha", mods: { cha: 4 } });
  await grant(s, makeAlly("A"), "un2-a");
  await grant(s, makeAlly("B"), "un2-b");
  const beforeThird = poolValue(s);
  assert.equal(beforeThird, 2);
  await grant(s, makeAlly("C"), "un2-c");
  await Uses.supporterUses.undo(s, "un2-c");
  assert.equal(poolValue(s), beforeThird, "restores 2, not the maximum");
});

test("UN-3: undoing the same use twice does not inflate the pool", async () => {
  const s = makeSupporter({ level: 7 });
  const prior = poolValue(s);
  await grant(s, makeAlly(), "un3-grant");
  await Uses.supporterUses.undo(s, "un3-grant");
  await Uses.supporterUses.undo(s, "un3-grant");
  assert.equal(poolValue(s), prior);
});

test("UN-4: re-executing an undone operation ID does not spend a second Aid Die", async () => {
  const s = makeSupporter({ level: 7 });
  const ally = makeAlly();
  const prior = poolValue(s);
  await grant(s, ally, "un4-grant");
  await Uses.supporterUses.undo(s, "un4-grant");
  await Uses.supporterUses.execute(s, "provideAid", grantData(ally), "un4-grant");
  assert.equal(poolValue(s), prior, "the undone use is not spent again");
  assert.equal(ally.effects.size, 0);
});

test("UN-5: undo of useAidDie restores the holder's effect and leaves the holder's pool untouched", async () => {
  const { giver, holder } = aidPair(5);
  await grant(giver, holder, "un5-grant");
  await Uses.supporterUses.execute(holder, "useAidDie", { rollType: "attack", dieSize: "d8", supporterLevel: 5 }, "un5-use");
  await Uses.supporterUses.undo(holder, "un5-use");
  assert.equal(holder.effects.size, 1);
  assert.equal(poolValue(holder), pool(holder).max, "holder pool untouched by a useAidDie");
});

/* ==========================================================================
   11. Stale and corrupt receipts
   ========================================================================== */

test("ST-1: undo of an unknown receipt rejects with an Error and changes nothing", async () => {
  const s = makeSupporter({ level: 7 });
  const prior = poolValue(s);
  await assert.rejects(() => Uses.supporterUses.undo(s, "no-such-use"), error => error instanceof Error);
  assert.equal(poolValue(s), prior);
});

test("ST-2: a corrupt receipt does not throw in a way that corrupts the pool", async () => {
  const s = makeSupporter({ level: 7 });
  await s.update({
    "flags.ak5e.supporterUses": {
      undo: [{ id: "corrupt-1", command: "provideAid", status: "applied", resources: "bad", flagChanges: null, targets: [null, { uuid: 5 }] }]
    }
  });
  try {
    await Uses.supporterUses.undo(s, "corrupt-1");
  } catch (error) {
    assert.ok(error instanceof Error, "any failure is an Error, not a silent state change");
  }
  const value = poolValue(s);
  assert.ok(Number.isFinite(value) && value >= 0 && value <= pool(s).max, `pool stays in range (saw ${value})`);
});

test("ST-3: a corrupt undo list does not stop listing uses", () => {
  const s = makeSupporter({ level: 7 });
  s.flags.ak5e.supporterUses = { undo: "garbage" };
  assert.doesNotThrow(() => Uses.supporterUses.uses(s));
});

/* ==========================================================================
   12. Non-Supporter actors
   ========================================================================== */

test("NS-1: planning Provide Aid for a non-Supporter fails with a clear need() message", async () => {
  const notSupporter = makeAlly("Plain Creature");
  await assert.rejects(
    () => Promise.resolve().then(() => Uses.supporterUses.plan(notSupporter, "provideAid", grantData(makeAlly()))),
    error => error instanceof Error && error.name !== "TypeError" && /Supporter/i.test(error.message)
  );
});

test("NS-2: executing a use for a non-Supporter fails with a clear message, not a TypeError", async () => {
  const notSupporter = makeAlly("Plain Creature");
  await assert.rejects(
    () => Uses.supporterUses.execute(notSupporter, "provideAid", grantData(makeAlly()), "ns2-op"),
    error => error instanceof Error && error.name !== "TypeError" && /Supporter/i.test(error.message)
  );
});

test("NS-3: turn-start and rest hooks for a non-Supporter are no-ops, not crashes", async () => {
  const notSupporter = makeAlly("Plain Creature");
  await Features.onSupporterTurnStart(notSupporter);
  await Features.onSupporterRest(notSupporter, "short");
  await Features.onSupporterRest(notSupporter, "long");
  assert.equal(notSupporter.effects.size, 0);
});

/* ==========================================================================
   13. Ever Reliable (level 15+, C3:6679-6684)
   ========================================================================== */

test("ER-1: at turn start with 0 Aid Dice, a level 15 Supporter regains exactly 1 (C3:6682)", async () => {
  const s = makeSupporter({ level: 15 });
  await drainTo(s, 0);
  assert.equal(poolValue(s), 0);
  await Features.onSupporterTurnStart(s);
  assert.equal(poolValue(s), 1);
});

test("ER-2: at turn start with 1 die, nothing is regained (trigger is 0 only, C3:6682)", async () => {
  const s = makeSupporter({ level: 15 });
  await drainTo(s, 1);
  assert.equal(poolValue(s), 1);
  await Features.onSupporterTurnStart(s);
  assert.equal(poolValue(s), 1);
});

test("ER-3: at turn start with 2 dice, nothing is regained (no extra die at 2+)", async () => {
  const s = makeSupporter({ level: 15 });
  await drainTo(s, 2);
  assert.equal(poolValue(s), 2);
  await Features.onSupporterTurnStart(s);
  assert.equal(poolValue(s), 2);
});

test("ER-4: below level 15 (level 14), turn start with 0 dice regains nothing (boundary 14/15)", async () => {
  const s = makeSupporter({ level: 14 });
  await drainTo(s, 0);
  await Features.onSupporterTurnStart(s);
  assert.equal(poolValue(s), 0);
});

test("ER-5: Short Rest refills ceil(max/2) with an odd max (cha 5 -> 3 from 0, C3:6684)", async () => {
  const s = makeSupporter({ level: 15, mods: { cha: 5 } });
  await drainTo(s, 0);
  await Features.onSupporterRest(s, "short");
  assert.equal(poolValue(s), 3);
});

test("ER-6: Short Rest refills ceil(max/2) with an even max (cha 4 -> 2 from 0)", async () => {
  const s = makeSupporter({ level: 15, mods: { cha: 4 } });
  await drainTo(s, 0);
  await Features.onSupporterRest(s, "short");
  assert.equal(poolValue(s), 2);
});

test("ER-7: Short Rest refill cannot take the pool above its maximum (max 4, value 3 -> 4)", async () => {
  const s = makeSupporter({ level: 15, mods: { cha: 4 } });
  await drainTo(s, 3);
  assert.equal(poolValue(s), 3);
  await Features.onSupporterRest(s, "short");
  assert.equal(poolValue(s), 4);
});

test("ER-8: below level 15 (level 14), a Short Rest refills nothing (boundary 14/15)", async () => {
  const s = makeSupporter({ level: 14, mods: { cha: 4 } });
  await drainTo(s, 0);
  await Features.onSupporterRest(s, "short");
  assert.equal(poolValue(s), 0);
});

// C3:6637 "You regain all expended uses when you finish a Long Rest." The refill may run through
// onSupporterRest(actor, "long") or through the pool's own "lr" recovery (recovery: [{on: "lr", amount: "full"}]).
// Either path must restore the pool to its maximum.
test("ER-9: a Long Rest restores the pool to its maximum (C3:6637)", async () => {
  const s = makeSupporter({ level: 7, mods: { cha: 4 } });
  await drainTo(s, 0);
  await Features.onSupporterRest(s, "long");
  await recoverPool(s, "lr");
  assert.equal(poolValue(s), pool(s).max);
});

/* ==========================================================================
   14. Self-Supportive (level 18+, C3:6686-6687, R4)
   ========================================================================== */

test("SS-1: at turn start a level 18 Supporter gains the special die flag (R4, C3:6687)", async () => {
  const s = makeSupporter({ level: 18 });
  await Features.onSupporterTurnStart(s);
  assert.equal(s.flags.ak5e.supporter.selfSupportDie, true);
});

test("SS-2: below level 18 (level 17), no Self-Supportive die is granted (boundary 17/18)", async () => {
  const s = makeSupporter({ level: 17 });
  await Features.onSupporterTurnStart(s);
  assert.notEqual(s.flags.ak5e.supporter.selfSupportDie, true);
});

test("SS-3: the self die does not count toward the one-die cap (R4)", async () => {
  const s = makeSupporter({ level: 18 });
  await Features.onSupporterTurnStart(s);
  const ally = makeAlly();
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "provideAid", grantData(ally)));
  assert.equal(ids.includes("targetHasAidDie"), false, "the Supporter's own special die does not block a grant to another creature");
  await Uses.supporterUses.execute(s, "provideAid", grantData(ally), "ss3-grant");
  assert.equal(ally.effects.size, 1, "the grant goes through normally");
  assert.equal(poolValue(s), pool(s).max - 1, "the grant spends one regular die");
});

test("SS-4: the self die cannot be given to another creature (R4): a grant to another leaves the self die flag as is", async () => {
  const s = makeSupporter({ level: 18 });
  await Features.onSupporterTurnStart(s);
  const ally = makeAlly();
  await Uses.supporterUses.execute(s, "provideAid", grantData(ally), "ss4-grant");
  assert.equal(s.flags.ak5e.supporter.selfSupportDie, true, "the special die stays with the Supporter");
  assert.equal(s.effects.size, 0, "the Supporter does not gain an effect from giving aid");
});

test("SS-5: the special die flag is granted fresh at each turn start (R4)", async () => {
  const s = makeSupporter({ level: 18 });
  await Features.onSupporterTurnStart(s);
  await s.update({ "flags.ak5e.supporter.selfSupportDie": false });
  await Features.onSupporterTurnStart(s);
  assert.equal(s.flags.ak5e.supporter.selfSupportDie, true);
});

test("SS-6: a level 18 Supporter can use its own special die as if it were its own Provide Aid target (C3:6687)", async () => {
  const s = makeSupporter({ level: 18 });
  await Features.onSupporterTurnStart(s);
  const rolls = forbidRolls();
  await Uses.supporterUses.execute(s, "useAidDie", { rollType: "skill", dieSize: "d12", supporterLevel: 18, selfSupport: true }, "ss6-use");
  assert.deepEqual(rolls, [], "no Roll call");
  assert.ok(Uses.supporterUses.receipt(s, "ss6-use"), "the self-supportive use is recorded");
});

test.todo("SS-7: the special die is lost at the end of the Supporter's turn (R4): the contract has no end-of-turn entry point; specify the turnEnd hook before testing");

/* ==========================================================================
   15. Lighten the Load (level 11+, C3:6673-6674)
   ========================================================================== */

test("LT-1: level 10 has a level warning, level 11 with a valid target has none (boundary 10/11)", async () => {
  const at10 = makeSupporter({ level: 10 });
  const at11 = makeSupporter({ level: 11 });
  const data = { triggerUuid: makeAlly("Trigger").uuid, targetUuid: makeAlly("Second").uuid, targetName: "Second", distance: 20 };
  const ids10 = await warningIds(() => Uses.supporterUses.plan(at10, "lightenTheLoad", data));
  const ids11 = await warningIds(() => Uses.supporterUses.plan(at11, "lightenTheLoad", data));
  assert.ok(ids10.length > 0, "level 10 warns");
  assert.deepEqual(ids11, [], "level 11 with a valid target has no warnings");
});

test("LT-2: Lighten the Load spends the Supporter's Reaction on execute (C3:6674)", async () => {
  const s = makeSupporter({ level: 11 });
  assert.equal(getReactions(s).available, 1);
  const trigger = makeAlly("Trigger"), second = makeAlly("Second");
  await Uses.supporterUses.execute(s, "lightenTheLoad", {
    triggerUuid: trigger.uuid, targetUuid: second.uuid, targetName: second.name, distance: 20
  }, "lt2-use");
  assert.equal(getReactions(s).available, 0, "the Reaction is spent");
});

test("LT-3: a second Lighten the Load in the same round warns but can be used anyway (R-LTL)", async () => {
  const s = makeSupporter({ level: 11 });
  const trigger = makeAlly("Trigger");
  await Uses.supporterUses.execute(s, "lightenTheLoad", {
    triggerUuid: trigger.uuid, targetUuid: makeAlly("First").uuid, targetName: "First", distance: 20
  }, "lt3-first");
  const third = makeAlly("Third");
  const data = { triggerUuid: trigger.uuid, targetUuid: third.uuid, targetName: third.name, distance: 20 };
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "lightenTheLoad", data));
  assert.ok(ids.includes("reaction"), "no Reaction left warns");
  await Uses.supporterUses.execute(s, "lightenTheLoad", { ...data, overrides: ["reaction"] }, "lt3-second");
  assert.ok(getReactions(s).available >= 0, "the Reaction count never goes negative");
});

test("LT-4: Lighten the Load does not spend from the Aid Die pool (C3:6674)", async () => {
  const s = makeSupporter({ level: 11, mods: { cha: 4 } });
  const before = poolValue(s);
  const second = makeAlly("Second");
  await Uses.supporterUses.execute(s, "lightenTheLoad", {
    triggerUuid: makeAlly("Trigger").uuid, targetUuid: second.uuid, targetName: second.name, distance: 20
  }, "lt4-use");
  assert.equal(poolValue(s), before, "the pool is untouched");
  assert.equal(second.effects.size, 1, "the free die is granted to the second creature");
});

test("LT-5: a supplementary bonus die cannot itself trigger Lighten the Load (C3:6674)", async () => {
  const s = makeSupporter({ level: 11 });
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "lightenTheLoad", {
    isSupplementary: true, triggerUuid: makeAlly("Trigger").uuid, targetUuid: makeAlly("Second").uuid, targetName: "Second", distance: 20
  }));
  assert.ok(ids.includes("chaining"), "a supplementary die cannot chain");
});

test("LT-6: Lighten the Load cannot target the Supporter itself or the triggering creature (C3:6674)", async () => {
  const s = makeSupporter({ level: 11 });
  const trigger = makeAlly("Trigger");
  const self = await warningIds(() => Uses.supporterUses.plan(s, "lightenTheLoad", {
    triggerUuid: trigger.uuid, targetUuid: s.uuid, targetName: s.name, distance: 10
  }));
  const same = await warningIds(() => Uses.supporterUses.plan(s, "lightenTheLoad", {
    triggerUuid: trigger.uuid, targetUuid: trigger.uuid, targetName: trigger.name, distance: 10
  }));
  assert.ok(self.length > 0, "self-target warns");
  assert.ok(same.length > 0, "same-creature target warns");
});

test("LT-7: Lighten the Load beyond 60 ft warns (C3:6674 uses the 60 ft range of the trigger)", async () => {
  const s = makeSupporter({ level: 11 });
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "lightenTheLoad", {
    triggerUuid: makeAlly("Trigger").uuid, targetUuid: makeAlly("Second").uuid, targetName: "Second", distance: 61
  }));
  assert.ok(ids.includes("range"));
});

test("LT-8: a target already holding an Aid Die warns and can be used anyway (ruling 3)", async () => {
  const s = makeSupporter({ level: 11 });
  const holder = makeAlly("Holder");
  await grant(s, holder, "lt8-grant");
  assert.equal(holder.effects.size, 1);
  const data = { triggerUuid: makeAlly("Trigger").uuid, targetUuid: holder.uuid, targetName: holder.name, distance: 20 };
  const ids = await warningIds(() => Uses.supporterUses.plan(s, "lightenTheLoad", data));
  assert.ok(ids.includes("targetHasAidDie"), "the target already holds a die: warn");
  await Uses.supporterUses.execute(s, "lightenTheLoad", { ...data, overrides: ["targetHasAidDie"] }, "lt8-use");
  assert.equal(holder.effects.size, 2, "the player used it anyway");
});

test("LT-9: undo of Lighten the Load refunds the Reaction and removes the granted die", async () => {
  const s = makeSupporter({ level: 11 });
  const second = makeAlly("Second");
  await Uses.supporterUses.execute(s, "lightenTheLoad", {
    triggerUuid: makeAlly("Trigger").uuid, targetUuid: second.uuid, targetName: second.name, distance: 20
  }, "lt9-use");
  assert.equal(getReactions(s).available, 0);
  await Uses.supporterUses.undo(s, "lt9-use");
  assert.equal(getReactions(s).available, 1, "the Reaction is refunded");
  assert.equal(second.effects.size, 0, "the supplementary die is removed");
});

/* ==========================================================================
   16. Hooks and plan registration
   ========================================================================== */

test("HK-1: registerSupporterHooks called several times adds at most one rest handler", () => {
  const count = () => globalThis.Hooks?._hooks?.get("dnd5e.restCompleted")?.length ?? 0;
  const before = count();
  Features.registerSupporterHooks();
  Features.registerSupporterHooks();
  Features.registerSupporterHooks();
  const after = count();
  assert.ok(after - before <= 1, `handlers added: ${after - before}`);
  assert.ok(after <= 1, `handler count: ${after}`);
});

test("HK-2: registering a duplicate plan name throws (provideAid already exists)", () => {
  assert.throws(() => Uses.registerSupporterPlans({ plans: { provideAid: () => ({ warnings: [], title: "dup", apply: () => ({}) }) } }));
});

test("HK-3: registering a duplicate of useAidDie throws", () => {
  assert.throws(() => Uses.registerSupporterPlans({ plans: { useAidDie: () => ({ warnings: [], title: "dup", apply: () => ({}) }) } }));
});

test("HK-4: registering a new, non-duplicate plan name does not throw", () => {
  assert.doesNotThrow(() => Uses.registerSupporterPlans({
    plans: { zzAdversarialProbe: () => ({ warnings: [], title: "probe", apply: () => ({}) }) }
  }));
});

test("HK-5: the four plan names are all known to the engine", () => {
  const s = makeSupporter({ level: 18 });
  for (const name of ["provideAid", "useAidDie", "lightenTheLoad", "selfSupportiveDie"]) {
    try {
      Uses.supporterUses.plan(s, name, {});
    } catch (error) {
      assert.ok(!/Unknown Supporter plan/i.test(error?.message ?? ""), `${name} is registered`);
    }
  }
});

test("HK-6: plan names that do not exist are rejected clearly", () => {
  const s = makeSupporter({ level: 4 });
  assert.throws(() => Uses.supporterUses.plan(s, "noSuchPlan", {}), error => error instanceof Error && error.name !== "TypeError");
});
