import test from "node:test";
import assert from "node:assert/strict";
import {
  resilienceMax, reactionMax, advanceSkillPoints, absorptionDice, legendaryStrength, crownsplitterBonus,
  creatureTier, indestructibleReduction, stormchaserReduction, interlockingShieldsReduction, leapingRange,
  defenderProfile, defenderLevel, defenderBranch, defenderState, shelterDisadvantage, shelterCost
} from "../scripts/defender-rules.mjs";

const item = (type, chapterThreeId, system = {}) => ({ id: chapterThreeId, type, system, flags: { ak5e: { chapterThreeId } } });
const actor = (items, flags = {}) => ({ type: "character", items: new Map(items.map(i => [i.id, i])), flags: { ak5e: flags } });

test("Resilience follows the Defender table at every level", () => {
  const expected = [4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 10];
  assert.deepEqual(Array.from({ length: 20 }, (_, i) => resilienceMax(i + 1)), expected);
  assert.throws(() => resilienceMax(0), RangeError);
  assert.throws(() => resilienceMax(21), RangeError);
  assert.throws(() => resilienceMax(2.5), RangeError);
});

test("Reactive grants two Reactions from level 13", () => {
  assert.equal(reactionMax(12), 1);
  assert.equal(reactionMax(13), 2);
});

test("Advance Skill Points step at 7 and 14", () => {
  assert.deepEqual([1, 6, 7, 13, 14, 20].map(advanceSkillPoints), [1, 1, 2, 2, 3, 3]);
});

test("Absorption dice are absent before level 4 and step 3/6/9 at 4/7/14", () => {
  assert.equal(absorptionDice(3), null);
  assert.deepEqual([4, 6, 7, 13, 14, 20].map(l => absorptionDice(l).number), [3, 3, 6, 6, 9, 9]);
  assert.equal(absorptionDice(4).type, "force");
});

test("Legendary Might adds 6 capped at 26", () => {
  assert.equal(legendaryStrength(20), 26);
  assert.equal(legendaryStrength(18), 24);
  assert.equal(legendaryStrength(22), 26);
  assert.equal(legendaryStrength(27), 26, "same result as the managed ADD 6 / DOWNGRADE 26 effect");
  assert.throws(() => legendaryStrength("x"), TypeError);
});

test("Crownsplitter doubles only for Elite or Leader and refuses an unknown tier", () => {
  assert.equal(crownsplitterBonus(4, "normal"), 4);
  assert.equal(crownsplitterBonus(4, "elite"), 8);
  assert.equal(crownsplitterBonus(4, "leader"), 8);
  assert.throws(() => crownsplitterBonus(4, null), RangeError);
});

test("creature tier is read from the bestiary flag and never guessed", () => {
  assert.equal(creatureTier({ flags: { ak5e: { category: "Elite" } } }), "elite");
  assert.equal(creatureTier({ flags: { ak5e: {} } }), null);
  assert.equal(creatureTier({ flags: { ak5e: { category: "Boss" } } }), null);
});

test("DR derivations", () => {
  assert.equal(indestructibleReduction(3), 6);
  assert.equal(indestructibleReduction(0), 0);
  assert.throws(() => indestructibleReduction(-1), RangeError);
  assert.equal(stormchaserReduction(5), 3);
  assert.equal(stormchaserReduction(0), 0);
  assert.deepEqual(interlockingShieldsReduction(5), { value: 3, scope: "physical" });
  assert.deepEqual(interlockingShieldsReduction(4, true), { value: 2, scope: "all" });
  assert.equal(leapingRange(30), 15);
});

test("profile detects the class, branch and rejects unsafe combinations", () => {
  const d = item("class", "class-defender", { levels: 12 });
  const a = actor([d, item("subclass", "subclass-defender-artshield")]);
  assert.equal(defenderLevel(a), 12);
  assert.equal(defenderBranch(a), "artshield");
  const profile = defenderProfile(a);
  assert.equal(profile.applicable, true);
  assert.equal(profile.implemented, true);
  assert.deepEqual(profile.blocked, []);
  assert.equal(defenderProfile(actor([d, item("subclass", "subclass-defender-fortress")])).implemented, true);
  assert.equal(defenderProfile(actor([d, item("subclass", "subclass-defender-guardian")])).implemented, true);
  for (const branch of ["juggernaut", "protector", "sentry"])
    assert.equal(defenderProfile(actor([d, item("subclass", `subclass-defender-${branch}`)])).implemented, true);
  assert.deepEqual(defenderProfile(actor([d, item("class", "class-caster", { levels: 1 })])).blocked, ["MultipleClasses"]);
  assert.deepEqual(defenderProfile(actor([d, item("subclass", "subclass-defender-artshield"), item("subclass", "subclass-defender-dreadnought")])).blocked, ["MultipleBranches"]);
  assert.deepEqual(defenderProfile(actor([d, item("subclass", "subclass-guard-duellist")])).blocked, ["UnsupportedBranch"]);
  assert.equal(defenderProfile(actor([item("class", "class-caster", { levels: 1 })])).applicable, false);
  assert.deepEqual(defenderProfile(actor([item("class", "class-defender", { levels: 21 })])).blocked, ["InvalidClassLevel"]);
  assert.equal(defenderProfile({ ...a, pack: "x" }).applicable, false);
});

test("state merges defaults and stays configured only when explicitly enabled", () => {
  assert.equal(defenderState(actor([])).enabled, false);
  const state = defenderState(actor([], { defender: { enabled: true, uses: { indestructible: true } } }));
  assert.equal(state.enabled, true);
  assert.deepEqual(state.operations, []);
  assert.equal(state.uses.indestructible, true);
});

test("Shelter applies only to confirmed allies within 5 ft and never to the Defender", () => {
  const shelter = { active: true, allies: ["Token.a"] };
  const base = { defenderTokenUuid: "Token.d", within: true };
  assert.equal(shelterDisadvantage(shelter, { ...base, targetUuid: "Token.a" }), true);
  assert.equal(shelterDisadvantage(shelter, { ...base, targetUuid: "Token.b" }), false);
  assert.equal(shelterDisadvantage(shelter, { ...base, targetUuid: "Token.d" }), false);
  assert.equal(shelterDisadvantage(shelter, { ...base, targetUuid: "Token.a", within: false }), false);
  assert.equal(shelterDisadvantage({ active: false, allies: ["Token.a"] }, { ...base, targetUuid: "Token.a" }), false);
  assert.equal(shelterDisadvantage(null, { ...base, targetUuid: "Token.a" }), false);
});

test("Shelter as a Bonus Action costs 1 Resilience; as an Action nothing; otherwise invalid", () => {
  assert.equal(shelterCost("action").resilience, 0);
  assert.equal(shelterCost("bonus").resilience, 1);
  assert.throws(() => shelterCost("reaction"), RangeError);
});
