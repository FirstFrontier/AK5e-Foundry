import test from "node:test";
import assert from "node:assert/strict";
import {
  aggressionMax, unrelentingMax, instructionDiceMax, instructionDieFaces,
  martialDC, centurionDC, guardProfile, guardLevel, guardBranch, guardEnabled,
  guardState, GUARD_CLASS_ID, GUARD_BRANCH_IDS, FIGHTING_STYLES
} from "../scripts/guard-rules.mjs";

const item = (type, chapterThreeId, system = {}) => ({
  id: chapterThreeId,
  type,
  system,
  name: chapterThreeId,
  flags: { ak5e: { chapterThreeId } }
});

const actor = (items, flags = {}) => ({
  type: "character",
  items: new Map(items.map(i => [i.id, i])),
  flags: { ak5e: flags },
  system: {
    attributes: { prof: 3 },
    abilities: { str: { mod: 4 }, dex: { mod: 2 }, cha: { mod: 1 } },
    skills: { itm: { total: 5, mod: 5 } }
  }
});

test("Aggression pool follows the Guard table (4 at 1st, 6 at 7th, 8 at 14th)", () => {
  const expected = [
    4, 4, 4, 4, 4, 4,
    6, 6, 6, 6, 6, 6, 6,
    8, 8, 8, 8, 8, 8, 8
  ];
  assert.deepEqual(Array.from({ length: 20 }, (_, i) => aggressionMax(i + 1)), expected);
  assert.throws(() => aggressionMax(0), RangeError);
  assert.throws(() => aggressionMax(21), RangeError);
  assert.throws(() => aggressionMax(1.5), RangeError);
});

test("Unrelenting uses step at levels 3 (1 use) and 11 (2 uses)", () => {
  assert.equal(unrelentingMax(1), 0);
  assert.equal(unrelentingMax(2), 0);
  assert.equal(unrelentingMax(3), 1);
  assert.equal(unrelentingMax(10), 1);
  assert.equal(unrelentingMax(11), 2);
  assert.equal(unrelentingMax(20), 2);
});

test("Instruction Dice step at 1 (4 dice), 7 (5 dice), 14 (6 dice)", () => {
  assert.equal(instructionDiceMax(1), 4);
  assert.equal(instructionDiceMax(6), 4);
  assert.equal(instructionDiceMax(7), 5);
  assert.equal(instructionDiceMax(13), 5);
  assert.equal(instructionDiceMax(14), 6);
  assert.equal(instructionDiceMax(20), 6);
});

test("Instruction Die size upgrades from d6 to d10 at 13th level", () => {
  assert.equal(instructionDieFaces(1), 6);
  assert.equal(instructionDieFaces(12), 6);
  assert.equal(instructionDieFaces(13), 10);
  assert.equal(instructionDieFaces(20), 10);
});

test("Martial DC is 8 + PB + max(STR, DEX)", () => {
  const a = actor([]);
  // PB = 3, STR = 4, DEX = 2 -> 8 + 3 + 4 = 15
  assert.equal(martialDC(a), 15);
});

test("Centurion DC is 8 + Intimidation modifier", () => {
  const a = actor([]);
  // Intimidation total = 5 -> 8 + 5 = 13
  assert.equal(centurionDC(a), 13);
});

test("Guard profile detects class, branch, and flags invalid configurations", () => {
  const g = item("class", GUARD_CLASS_ID, { levels: 5 });
  const a = actor([g, item("subclass", "subclass-guard-centurion")]);
  assert.equal(guardLevel(a), 5);
  assert.equal(guardBranch(a), "centurion");

  const profile = guardProfile(a);
  assert.equal(profile.applicable, true);
  assert.equal(profile.configured, false);
  assert.deepEqual(profile.blocked, []);

  // Multi-class blocked
  assert.deepEqual(guardProfile(actor([g, item("class", "class-caster", { levels: 1 })])).blocked, ["MultipleClasses"]);
  // Invalid level blocked
  assert.deepEqual(guardProfile(actor([item("class", GUARD_CLASS_ID, { levels: 25 })])).blocked, ["InvalidClassLevel"]);
});

test("guardState merges defaults and recognizes enabled flag", () => {
  const a1 = actor([]);
  assert.equal(guardState(a1).enabled, false);

  const a2 = actor([], { guard: { enabled: true, fightingStyle: "duelling" } });
  assert.equal(guardState(a2).enabled, true);
  assert.equal(guardState(a2).fightingStyle, "duelling");
});
