import test from "node:test";
import assert from "node:assert/strict";
import { combinedSkillValue, lmdFromCurrency, worldRulesEnabled } from "../scripts/world-rule-state.mjs";
import { patchCantripDamage } from "../scripts/cantrip-damage.mjs";
import { applySkillReconciliation, equippedDamageReduction, isRestrictedHealingSource,
  previewDamage, previewSkillReconciliation, previewAlternateClass, recordNativeDeathSave, registerWorldRuleHooks } from "../scripts/world-rules.mjs";

function world(enabled = true) {
  globalThis.game = { system: { id: "dnd5e" }, settings: { get: (_ns, key) => key === "chapterOneRules" ? enabled : false },
    user: { isGM: true }, ak5e: { damageCategory: t => ["thunder", "piercing"].includes(t) ? "physical" : "arts",
      damageAfterReduction: (n, dr, { resistance, vulnerability }) => Math.max(1, Math.floor(Math.max(1, n - dr) * (resistance === vulnerability ? 1 : resistance ? 0.5 : 2))) } };
  globalThis.ui = { notifications: { warn() {} } };
}

function actor() {
  let flags = {};
  return { documentName: "Actor", type: "character", name: "Tester", system: { attributes: { hp: { value: 0 }, death: {} },
    skills: { his: { value: 1 }, rel: { value: 2 }, nat: { value: 1 }, sur: { value: 0 }, ak5elore: { value: 0 }, ak5ewilderness: { value: 0 } } },
    items: [], getFlag: (_ns, key) => flags[key], async update(changes) { flags.skillReconciliation = changes["flags.ak5e.skillReconciliation"]; },
    _flags: flags };
}

test("World setting controls the replacement rules without modifying the system", () => {
  world(); assert.equal(worldRulesEnabled(), true);
  world(false); assert.equal(worldRulesEnabled(), false);
  assert.equal(lmdFromCurrency({ cp: 2, sp: 3, gp: 4 }), 432);
  assert.equal(lmdFromCurrency({ ep: 2, pp: 3 }), 0);
});

test("zero-HP damage requests a Dying save only for an active Dying state", () => {
  world(); globalThis.CONFIG = {};
  const hooks = new Map(); globalThis.Hooks = { on(name, callback) { hooks.set(name, callback); } };
  registerWorldRuleHooks({});
  const subject = actor(), beforeDamage = hooks.get("dnd5e.preApplyDamage");
  subject.system.attributes.hp.max = 30;
  const ordinary = {}; beforeDamage(subject, 5, {}, ordinary);
  assert.equal(ordinary.ak5eDyingDamage, undefined);
  subject._flags.dying = { active: true };
  const dying = {}; beforeDamage(subject, 5, {}, dying);
  assert.equal(dying.ak5eDyingDamage, true);
  const immune = {}; beforeDamage(subject, 0, {}, immune);
  assert.equal(immune.ak5eDyingDamage, undefined);
});

test("native death save writes AK5e Mettle and failures without 5e success or critical side effects", () => {
  world(); const subject = actor();
  const success = { subject, updates: { "system.attributes.hp.value": 1 }, chatString: "revive" };
  recordNativeDeathSave([{ total: 20, options: { target: 10 }, isCritical: true }], success);
  assert.equal(success.updates["flags.ak5e.dying"].mettle, 2);
  assert.equal(success.updates["flags.ak5e.dying"].failures, 0);
  assert.equal(success.updates["system.attributes.hp.value"], undefined);
  assert.equal(success.updates["system.attributes.death.success"], 0);
  const failure = { subject, updates: {} };
  recordNativeDeathSave([{ total: 1, options: { target: 10 }, isFumble: true }], failure);
  assert.equal(failure.updates["flags.ak5e.dying"].failures, 1);
  assert.equal(failure.updates["flags.ak5e.dying"].mettle, 1);
});

test("skill conversion uses the highest proficiency and preserves a reversible snapshot", async () => {
  world(); const subject = actor();
  assert.equal(combinedSkillValue(subject, ["his", "rel"]), 2);
  const preview = previewSkillReconciliation(subject);
  assert.deepEqual(preview.map(row => row.proposed), [2, 1]);
  await applySkillReconciliation(subject);
  assert.deepEqual(subject._flags.skillReconciliation.original, { his: 1, rel: 2, ak5elore: 0, nat: 1, sur: 0, ak5ewilderness: 0 });
  await assert.rejects(() => applySkillReconciliation(subject), /already recorded/);
});

test("equipment DR never guesses how multiple equipped sources stack", () => {
  world(); const subject = actor();
  subject.items = [{ name: "Combat Gear", system: { equipped: true }, getFlag: () => ({ "damage reduction": "3 (Physical)" }) }];
  assert.equal(equippedDamageReduction(subject, "thunder").total, 3);
  assert.equal(previewDamage(subject, { amount: 10, damageType: "thunder" }).result, 7);
  subject.statuses = new Set(["ak5e-corroded"]);
  assert.equal(previewDamage(subject, { amount: 10, damageType: "thunder" }).result, 9);
  subject.statuses.clear();
  subject.items.push({ name: "Combat Shield", system: { equipped: true }, getFlag: () => ({ "damage reduction": "2 (Physical)" }) });
  assert.throws(() => previewDamage(subject, { amount: 10, damageType: "thunder" }), /GM/);
  assert.equal(previewDamage(subject, { amount: 10, damageType: "thunder", reduction: 4 }).result, 6);
});

test("Construct healing guard targets only source-listed healing categories", () => {
  const item = (type, key) => ({ type, name: "Source", getFlag: (_ns, lookup) => lookup === key ? "id" : undefined });
  assert.equal(isRestrictedHealingSource(item("spell")), true);
  assert.equal(isRestrictedHealingSource(item("feat", "chapterThreeId")), true);
  assert.equal(isRestrictedHealingSource({ ...item("feat"), system: { type: { value: "class" } } }), true);
  assert.equal(isRestrictedHealingSource(item("feat")), false);
  assert.equal(isRestrictedHealingSource({ ...item("tool", "chapterFourId"), name: "Medical Kit" }), true);
});


test("Alternate Class review requires level seven, distinct classes, and swapped scores", () => {
  world();
  const make = (id, name, className, abilities) => ({ id, uuid: `Actor.${id}`, type: "character",
    system: { details: { level: 7 }, abilities: Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, { value }])) },
    items: [{ type: "class", name: className, system: {} }, { type: "weapon", name: "Sword", system: { quantity: 1 } }] });
  const primary = make("a", "One", "Guard", { str: 16, dex: 10, con: 12, int: 8, wis: 14, cha: 11 });
  const alternate = make("b", "Two", "Caster", { str: 8, dex: 10, con: 12, int: 16, wis: 14, cha: 11 });
  const review = previewAlternateClass(primary, alternate, ["str", "int"]);
  assert.deepEqual(review.abilityDifferences, []);
  assert.equal(review.inventoryMatches, true);
  alternate.system.details.level = 6;
  assert.throws(() => previewAlternateClass(primary, alternate, ["str", "int"]), /same level/);
});


test("cantrip modifier applies to the first completed damage roll in each combat turn", async () => {
  world();
  const caster = actor(); caster.uuid = "Actor.caster";
  caster.system.attributes.spellcasting = "int"; caster.system.abilities = { int: { mod: 4 } };
  let last; caster.setFlag = async (_ns, _key, value) => { last = value; };
  caster.getFlag = (_ns, key) => key === "cantripDamageTurn" ? last : undefined;
  game.combat = { id: "combat", round: 1, turn: 0, combatant: { actor: caster } };
  class Activity {
    constructor() { this.actor = caster; this.item = { type: "spell", system: { level: 0 } }; }
    _processDamagePart() {}
    getDamageConfig() { return { rolls: [{ parts: ["1d6"] }] }; }
    async rollDamage() { return [this.getDamageConfig().rolls[0]]; }
  }
  globalThis.CONFIG = { DND5E: { activityTypes: { damage: { documentClass: Activity } } } };
  patchCantripDamage();
  const activity = new Activity();
  assert.deepEqual((await activity.rollDamage())[0].parts, ["1d6", "4"]);
  assert.deepEqual((await activity.rollDamage())[0].parts, ["1d6"]);
  game.combat.turn = 1;
  assert.deepEqual((await activity.rollDamage())[0].parts, ["1d6", "4"]);
});
