import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reductionPreview } from "../scripts/standard-bearer-rules.mjs";
import {
  resolveDamage, applyTempHP, applyHealing, applyDiceRules, diceRuleModifiers, applyDiceRulesToRolls,
  compareReductionImplementations, damageCategory, HP_LOSS_PRESETS, PHYSICAL_DAMAGE_TYPES, ARTS_DAMAGE_TYPES, isConstruct
} from "../scripts/damage-pipeline.mjs";

// ak5e.mjs cannot be imported under Node (Foundry globals); evaluate its exact
// damageAfterReduction source so the comparison tracks the real implementation.
const ak5eSource = readFileSync(new URL("../scripts/ak5e.mjs", import.meta.url), "utf8");
const fnSource = ak5eSource.match(/function damageAfterReduction\([\s\S]*?\n}\n/)[0];
const damageAfterReduction = new Function(`${fnSource}; return damageAfterReduction;`)();

const seq = values => { let i = 0; return () => { if (i >= values.length) throw new Error("rng exhausted"); return values[i++]; }; };
const face = (n, faces) => (n - 1) / faces + 1e-9; // rng value that yields face n

test("resolveDamage reproduces reductionPreview over the full grid (compatibility guarantee)", () => {
  let checked = 0;
  for (let amount = 0; amount <= 25; amount++) for (const dr of [0, 1, 2, 3, 5, 9, 30])
    for (const resistance of [false, true]) for (const vulnerability of [false, true]) {
      const expected = reductionPreview(amount, dr, { resistance, vulnerability });
      const viaTotal = resolveDamage({ amount, reduction: dr, resistance, vulnerability }).final;
      const viaSource = resolveDamage({ amount, type: "slashing", reductions: [{ value: dr, scope: "physical" }], resistance, vulnerability }).final;
      assert.equal(viaTotal, expected, `amount ${amount} dr ${dr} r ${resistance} v ${vulnerability}`);
      assert.equal(viaSource, expected);
      checked++;
    }
  assert.equal(checked, 26 * 7 * 4);
});

test("DR is applied strictly before Resistance, and the order changes the result", () => {
  // DR first: (10 - 3) = 7, halved = 3. Resistance first would give 5 - 3 = 2.
  const r = resolveDamage({ amount: 10, reduction: 3, resistance: true });
  assert.equal(r.final, 3);
  assert.deepEqual(r.steps.map(s => s.step), ["input", "damageReduction", "resistanceVulnerability"]);
  assert.equal(r.steps[1].after, 7);
  // Vulnerability: DR first (10-3)*2 = 14, not 10*2-3 = 17.
  assert.equal(resolveDamage({ amount: 10, reduction: 3, vulnerability: true }).final, 14);
});

test("minimum-1 rule: DR cannot reduce damage below 1; zero damage stays 0", () => {
  assert.equal(resolveDamage({ amount: 4, reduction: 9 }).final, 1);
  assert.equal(resolveDamage({ amount: 4, reduction: 4 }).final, 1);
  assert.equal(resolveDamage({ amount: 5, reduction: 9, resistance: true }).final, 1);
  assert.equal(resolveDamage({ amount: 0, reduction: 9 }).final, 0);
  assert.match(resolveDamage({ amount: 4, reduction: 9 }).steps[1].note, /minimum 1/);
});

test("Corroded halves total DR rounding down; overlay 'zero' sets it to 0", () => {
  assert.equal(resolveDamage({ amount: 10, reduction: 5, corroded: true }).final, 8);
  assert.equal(resolveDamage({ amount: 10, reduction: 5, corroded: "halve" }).final, 8);
  assert.equal(resolveDamage({ amount: 10, reduction: 5, corroded: "zero" }).final, 10);
  assert.equal(resolveDamage({ amount: 10, reduction: 1, corroded: true }).final, 10);
  assert.throws(() => resolveDamage({ amount: 10, reduction: 5, corroded: "quarter" }), /corroded/);
});

test("DR scopes: all / physical / arts / exact type; multiple sources require GM or explicit sum", () => {
  const reductions = [{ value: 2, scope: "physical" }, { value: 3, scope: "fire" }, { value: 4, scope: "arts" }];
  assert.equal(resolveDamage({ amount: 10, type: "thunder", reductions }).final, 8);
  assert.equal(resolveDamage({ amount: 10, type: "psychic", reductions }).final, 6);
  assert.equal(resolveDamage({ amount: 10, type: "force", reductions: [{ value: 3, scope: "all" }] }).final, 7);
  const gm = resolveDamage({ amount: 10, type: "fire", reductions });
  assert.equal(gm.requiresGM, true); assert.equal(gm.final, null); assert.equal(gm.reductionSources.length, 2);
  assert.equal(resolveDamage({ amount: 10, type: "fire", reductions, policy: { stacking: "gm" } }).requiresGM, true);
  assert.equal(resolveDamage({ amount: 10, type: "fire", reductions, policy: { stacking: "sum" } }).final, 3);
  assert.equal(resolveDamage({ amount: 10, type: "fire", reductions, policy: { stacking: "sum" }, corroded: true }).final, 7);
  assert.throws(() => resolveDamage({ amount: 10, type: "fire", reductions, policy: { stacking: "highest" } }), /stacking/);
  assert.throws(() => resolveDamage({ amount: 10, reduction: 1, reductions }), /either/);
});

test("ignoreDR and ignoreResistance (Savant / Wrecking Wall); Vulnerability still applies", () => {
  assert.equal(resolveDamage({ amount: 10, reduction: 5, resistance: true, ignoreDR: true, ignoreResistance: true }).final, 10);
  assert.equal(resolveDamage({ amount: 10, reduction: 5, ignoreDR: true, vulnerability: true, ignoreResistance: true }).final, 20);
  assert.equal(resolveDamage({ amount: 10, reduction: 5, ignoreDR: true, resistance: true }).final, 5);
});

test("Temp HP absorbs first, then HP, floor 0 (confirmedDamage order)", () => {
  const r = resolveDamage({ amount: 12, reduction: 2, hp: { value: 20, max: 30, temp: 4 } });
  assert.equal(r.final, 10); assert.equal(r.absorbedByTemp, 4); assert.equal(r.newTemp, 0);
  assert.equal(r.hpLost, 6); assert.equal(r.newHp, 14);
  assert.deepEqual(r.steps.map(s => s.step), ["input", "damageReduction", "resistanceVulnerability", "temporaryHP", "hitPoints"]);
  const partial = resolveDamage({ amount: 3, hp: { value: 20, temp: 8 } });
  assert.deepEqual([partial.absorbedByTemp, partial.newTemp, partial.newHp, partial.hpLost], [3, 5, 20, 0]);
  const overkill = resolveDamage({ amount: 50, hp: { value: 7, temp: 0 } });
  assert.deepEqual([overkill.newHp, overkill.hpLost], [0, 7]);
});

test("hpLoss requires an explicit policy with no default", () => {
  assert.throws(() => resolveDamage({ amount: 8, kind: "hpLoss" }), /explicit policy/);
  assert.throws(() => resolveDamage({ amount: 8, kind: "hpLoss", policy: {} }), /bypassDR/);
  assert.throws(() => resolveDamage({ amount: 8, kind: "hpLoss", policy: { bypassDR: true, bypassResistance: true } }), /bypassTemp/);
  assert.throws(() => resolveDamage({ amount: 8, kind: "hpLoss", policy: { bypassDR: "yes", bypassResistance: true, bypassTemp: true } }), /bypassDR/);
  assert.throws(() => resolveDamage({ amount: 8, kind: "poison" }), /kind/);
  // A ruled non-bypassing policy runs the ordinary order.
  const ruled = resolveDamage({ amount: 8, kind: "hpLoss", reduction: 3, policy: { bypassDR: false, bypassResistance: false, bypassTemp: false }, hp: { value: 10, temp: 2 } });
  assert.deepEqual([ruled.final, ruled.absorbedByTemp, ruled.newHp], [5, 2, 7]);
});

test("Blood Price preset bypasses DR, Resistance and Temp HP; only explicit presets exist", () => {
  assert.deepEqual(Object.keys(HP_LOSS_PRESETS), ["BLOOD_PRICE"]);
  assert.ok(Object.isFrozen(HP_LOSS_PRESETS.BLOOD_PRICE));
  const r = resolveDamage({ amount: 9, kind: "hpLoss", reduction: 5, resistance: true, corroded: true,
    policy: HP_LOSS_PRESETS.BLOOD_PRICE, hp: { value: 30, max: 30, temp: 10 } });
  assert.deepEqual([r.final, r.absorbedByTemp, r.newTemp, r.newHp, r.hpLost], [9, 0, 10, 21, 9]);
  for (const name of ["DEBILITATE", "GODPIERCER", "MORTAL_BLOW", "NERVOUS_IMPAIRMENT"]) assert.equal(HP_LOSS_PRESETS[name], undefined);
});

test("Maximum Burst style floor is applied after DR and Resistance", () => {
  const r = resolveDamage({ amount: 10, reduction: 6, resistance: true, minimumTaken: 5 });
  assert.equal(r.steps.find(s => s.step === "resistanceVulnerability").after, 2);
  assert.equal(r.final, 5);
  assert.throws(() => resolveDamage({ amount: 10, minimumTaken: 11 }), /exceed/);
});

test("invalid amounts throw instead of producing NaN", () => {
  for (const amount of [-1, NaN, "abc", undefined, null, Infinity]) assert.throws(() => resolveDamage({ amount }), /amount/);
  assert.throws(() => resolveDamage({ amount: 5, reduction: -2 }), /reduction/);
});

test("applyTempHP reproduces Standard Bearer additive vs replace", () => {
  const legacy = (temp, amount, additive) => additive ? temp + Math.max(0, amount) : Math.max(temp, amount, 0);
  for (const temp of [0, 3, 10]) for (const amount of [-2, 0, 4, 12]) {
    assert.equal(applyTempHP(temp, amount, "additive"), legacy(temp, amount, true));
    assert.equal(applyTempHP(temp, amount, "replace"), legacy(temp, amount, false));
  }
  assert.equal(applyTempHP(5, 3, "additive"), 8);
  assert.equal(applyTempHP(5, 3, "replace"), 5);
  assert.throws(() => applyTempHP(5, 3), /mode/);
  assert.throws(() => applyTempHP(5, 3, true), /mode/);
});

test("healing caps at effectiveMax ?? max and enforces the Construct exception", () => {
  assert.deepEqual(applyHealing({ value: 10, max: 20 }, 15, { source: "other", isConstruct: false }), { blocked: false, newHp: 20, restored: 10 });
  assert.equal(applyHealing({ value: 10, max: 20, effectiveMax: 15 }, 15, { source: "classFeature", isConstruct: false }).newHp, 15);
  for (const source of ["healingArt", "operatorSkill", "classFeature", "medicine"]) {
    const r = applyHealing({ value: 5, max: 20 }, 6, { source, isConstruct: true });
    assert.equal(r.blocked, true); assert.equal(r.newHp, 5); assert.match(r.reason, /L138/);
    assert.equal(applyHealing({ value: 5, max: 20 }, 6, { source, isConstruct: true, constructException: true }).newHp, 11);
  }
  assert.equal(applyHealing({ value: 5, max: 20 }, 6, { source: "other", isConstruct: true }).newHp, 11);
  assert.throws(() => applyHealing({ value: 5, max: 20 }, 6, { source: "potion", isConstruct: false }), /source/);
  assert.throws(() => applyHealing({ value: 5, max: 20 }, 6, { source: "other" }), /isConstruct/);
  assert.equal(isConstruct({ system: { details: { type: { value: "construct" } } } }), true);
});

test("dice: Savant rerolls results of 3 or less once and must use the new result (Ch.3 L438)", () => {
  // d8 results [2, 3, 7]: 2 -> 1 (kept, even though still <= 3), 3 -> 8.
  const r = applyDiceRules([2, 3, 7], { faces: 8, rerollAtOrBelow: 3, rerollOnce: true }, seq([face(1, 8), face(8, 8)]));
  assert.equal(r.total, 1 + 8 + 7);
  assert.equal(r.dice.filter(d => d.rerolled).length, 2);
  assert.throws(() => applyDiceRules([2], { faces: 8, rerollAtOrBelow: 3 }), /rerollOnce/);
  const recursive = applyDiceRules([2], { faces: 8, rerollAtOrBelow: 3, rerollOnce: false }, seq([face(1, 8), face(5, 8)]));
  assert.equal(recursive.total, 5);
});

test("dice: Deadshot Make it Count treats 1 or 2 as 3 (Ch.3 L4114)", () => {
  assert.equal(applyDiceRules([1, 2, 3, 6], { faces: 6, min: 3 }).total, 3 + 3 + 3 + 6);
});

test("dice: Weapon Tuning exploding dice capped by Proficiency Bonus; recursion is a required ruling (Ch.3 L4317)", () => {
  assert.throws(() => applyDiceRules([10], { faces: 10, explode: { limit: 2 } }), /recursive/);
  const flat = applyDiceRules([10, 10, 10], { faces: 10, explode: { limit: 2, recursive: false } }, seq([face(10, 10), face(4, 10)]));
  assert.equal(flat.total, 30 + 10 + 4); assert.equal(flat.dice.filter(d => d.added).length, 2);
  const chain = applyDiceRules([10], { faces: 10, explode: { limit: 3, recursive: true } }, seq([face(10, 10), face(10, 10), face(2, 10)]));
  assert.equal(chain.total, 10 + 10 + 10 + 2);
  const noChain = applyDiceRules([10], { faces: 10, explode: { limit: 3, recursive: false } }, seq([face(10, 10)]));
  assert.equal(noChain.total, 20);
});

test("dice: maximize (Heartseeker / Chosen of Asclepius) and exclusivity with explode", () => {
  assert.equal(applyDiceRules([1, 4], { faces: 6, max: true }).total, 12);
  assert.throws(() => applyDiceRules([1], { faces: 6, max: true, explode: { limit: 1, recursive: false } }), /ruling/);
  assert.throws(() => applyDiceRules([1], { faces: 6, max: 6 }), /boolean/);
});

test("dice: player-chosen rerolls (Savage Shots) and floorTotal", () => {
  const r = applyDiceRules([1, 6, 2], { faces: 6, rerollIndices: [0, 2] }, seq([face(4, 6), face(1, 6)]));
  assert.equal(r.total, 4 + 6 + 1);
  assert.equal(applyDiceRules([1, 1], { faces: 6, floorTotal: 5 }).total, 5);
  assert.throws(() => applyDiceRules([7], { faces: 6 }), /results/);
  assert.throws(() => applyDiceRules([1], { faces: 6, rerollIndices: [0] }, () => 1), /rng/);
});

test("Foundry modifier adapter emits V13 Die modifiers and only mutates unevaluated terms", () => {
  assert.deepEqual(diceRuleModifiers({ min: 3 }, 8), ["min3"]);
  assert.deepEqual(diceRuleModifiers({ rerollAtOrBelow: 3, rerollOnce: true }, 8), ["r<=3"]);
  assert.deepEqual(diceRuleModifiers({ explode: { limit: 3, recursive: false } }, 10), ["xo3=10"]);
  assert.deepEqual(diceRuleModifiers({ max: true }, 6), ["min6"]);
  assert.throws(() => diceRuleModifiers({ rerollIndices: [0] }, 6), /manual/);
  const roll = { terms: [{ faces: 8, modifiers: [] }, { operator: "+" }, { number: 3 }], resetFormula() { this.reset = true; } };
  assert.deepEqual(applyDiceRulesToRolls([roll], { min: 3 }), { modified: 1, terms: ["d8min3"] });
  assert.deepEqual(roll.terms[0].modifiers, ["min3"]); assert.equal(roll.reset, true);
  const two = { terms: [{ faces: 8, modifiers: [] }, { faces: 6, modifiers: [] }] };
  assert.throws(() => applyDiceRulesToRolls([two], { explode: { limit: 2, recursive: false } }), /multi-term/);
  assert.throws(() => applyDiceRulesToRolls([{ _evaluated: true, terms: [] }], { min: 3 }), /evaluated/);
});

test("damage categories mirror ak5e.mjs sets", () => {
  const set = name => JSON.parse(ak5eSource.match(new RegExp(`const ${name} = new Set\\((\\[[^\\]]*\\])\\)`))[1]);
  assert.deepEqual([...PHYSICAL_DAMAGE_TYPES], set("PHYSICAL_DAMAGE"));
  assert.deepEqual([...ARTS_DAMAGE_TYPES], set("ARTS_DAMAGE"));
  assert.equal(damageCategory("Thunder"), "physical"); assert.equal(damageCategory("healing"), null);
});

test("compareReductionImplementations surfaces differences without merging", () => {
  const cases = [
    { amount: 10, reduction: 3, resistance: true, vulnerability: true },
    { amount: 7, reduction: 0, resistance: true, vulnerability: true },
    { amount: 0, reduction: 5 }, { amount: 3, reduction: 3 }, { amount: 3, reduction: 9, resistance: true },
    { amount: 1, reduction: 0, resistance: true },
    { amount: 2.5, reduction: 0 }, { amount: "abc", reduction: 0 }, { amount: 5, reduction: "x" }, { amount: -4, reduction: 0 }
  ];
  const rows = compareReductionImplementations(cases, { reductionPreview, damageAfterReduction });
  // Valid integer inputs agree across all three implementations.
  for (const row of rows.slice(0, 7)) assert.equal(row.differs, false, JSON.stringify(row));
  assert.equal(rows[6].results.resolveDamage, 2); // fractional input floors identically
  assert.equal(rows[0].results.resolveDamage, 7); assert.equal(rows[2].results.resolveDamage, 0);
  assert.equal(rows[3].results.resolveDamage, 1); assert.equal(rows[5].results.resolveDamage, 1);
  // Malformed inputs differ: legacy NaN / coercion vs explicit validation errors.
  assert.deepEqual(rows.slice(7).map(r => r.differs), [true, true, true]);
  assert.ok(Number.isNaN(rows[7].results.reductionPreview)); assert.equal(rows[7].results.damageAfterReduction, 0);
  assert.match(rows[7].results.resolveDamage, /throws/);
});
