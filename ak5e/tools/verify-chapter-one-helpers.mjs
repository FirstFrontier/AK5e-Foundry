import assert from "node:assert/strict";

const hooks = {};
globalThis.Hooks = { once: (name, callback) => { hooks[name] = callback; }, on() {} };
globalThis.CONFIG = { statusEffects: [] };
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: Base => Base,
      DialogV2: {}
    },
    apps: { FilePicker: { implementation: class {} } }
  },
  utils: { randomID: () => "test-id" }
};
const notifications = [];
globalThis.ui = { notifications: {
  info(message) { notifications.push(["info", message]); },
  warn(message) { notifications.push(["warn", message]); },
  error(message) { notifications.push(["error", message]); }
} };
globalThis.game = {
  settings: {
    register() {},
    registerMenu() {},
    get: () => true
  },
  system: { id: "dnd5e" },
  user: { isGM: true },
  i18n: { localize: key => key, format: key => key }
};

await import(`../scripts/ak5e.mjs?helper-verification=${Date.now()}`);
hooks.init();
hooks.setup();
hooks.ready();
const api = game.ak5e;

assert.equal(CONFIG.statusEffects.length, 9, "All AK5e condition markers should register once.");

const conditionActor = actorFixture();
await api.applyCondition(conditionActor, "burning");
await api.applyCondition(conditionActor, "ak5e-burning");
assert.equal(conditionActor.effects.length, 1, "Applying the same condition twice must be idempotent.");
await api.removeCondition(conditionActor, "burning");
assert.equal(conditionActor.effects.length, 0);
await assert.rejects(() => api.applyCondition(conditionActor, "unknown"), /Unknown AK5e condition/);

const actor = actorFixture();
await actor.setFlag("ak5e", "dying", { active: false, failures: 2 });
let dying = await api.enterDying(actor);
assert.equal(dying.failures, 2, "Entering Dying must preserve failed Death Saves until a Long Rest removes them.");
await assert.rejects(() => api.resolveDyingTurnStart(actor), /true or false/, "A missing Death Save result must not silently become a failure.");
dying = await api.recordDeathSave(actor, true);
assert.deepEqual({ mettle: dying.mettle, failures: dying.failures }, { mettle: 2, failures: 2 });
await api.recordHealingWhileDying(actor, 9);
await api.recordHealingWhileDying(actor, 10);
dying = await api.resolveDyingTurnEnd(actor);
assert.equal(dying.mettle, 4, "Healing Mettle should add one per Turn plus one per full 10 HP in each instance.");
await actor.setFlag("ak5e", "dying", { ...dying, mettle: 6, stabilisesNextTurn: false });
assert.equal(await api.resolveStabilise(actor), true);
dying = await api.resolveDyingTurnStart(actor);
assert.equal(dying.active, false);
assert.equal(actor.system.attributes.hp.value, 1);
assert.equal(dying.failures, 2, "Stabilising must not clear failed Death Saves.");
assert.equal(dying.mettle, 0, "Leaving Dying must remove all Mettle.");

const failedSaveActor = actorFixture();
await api.enterDying(failedSaveActor);
dying = await api.recordDeathSave(failedSaveActor, false);
assert.deepEqual({ mettle: dying.mettle, failures: dying.failures }, { mettle: 1, failures: 1 });
assert.equal(await api.resolveStabilise(failedSaveActor), false, "Stabilise must fail below 6 Mettle.");
await api.recordHealingWhileDying(failedSaveActor, 27);
dying = await api.resolveDyingTurnEnd(failedSaveActor);
assert.equal(dying.mettle, 4, "One healing instance grants 1 Mettle plus 1 per complete 10 HP.");
await api.recordDeathSave(failedSaveActor, true);
assert.equal(api.getDyingState(failedSaveActor).mettle, 6, "Mettle must be capped at six.");
assert.equal(await api.spendMettle(failedSaveActor, 2), true);
assert.equal(api.getDyingState(failedSaveActor).mettle, 4);
await api.leaveDying(failedSaveActor);
assert.equal(await api.recordDeathSave(failedSaveActor, true), null, "A Creature cannot gain Mettle while not Dying.");
await assert.rejects(() => api.recordDeathSave(failedSaveActor, "success"), /true or false/);

const skillActor = actorFixture();
let skills = await api.configureOperatorSkills(skillActor, { maximum: 10, start: 3 });
assert.deepEqual({ points: skills.points, maximum: skills.maximum, start: skills.start }, { points: 3, maximum: 10, start: 3 });
skills = await api.adjustSkillPoints(skillActor, -20);
assert.equal(skills.points, 0, "SP must not fall below zero.");
skills = await api.adjustSkillPoints(skillActor, 4);
assert.equal(await api.activateOperatorSkill(skillActor, { id: "expensive", cost: 5 }), false);
assert.equal(await api.activateOperatorSkill(skillActor, { id: "skill", name: "Skill", cost: 2 }), true);
assert.equal(await api.activateOperatorSkill(skillActor, { id: "second", cost: 0 }), false, "Only one Operator Skill may be active.");
skills = await api.adjustSkillPoints(skillActor, 5);
assert.equal(skills.points, 2, "An active Operator Skill must prevent SP gain.");
await api.endOperatorSkill(skillActor);
skills = await api.adjustSkillPoints(skillActor, 20);
assert.equal(skills.points, 10, "SP must not exceed the configured maximum.");

const artsActor = actorFixture();
let arts = await api.configureArtsPoints(artsActor, { maximum: 20, maximumArtLevel: 9 });
assert.equal(arts.value, 20);
assert.equal(await api.spendArtsPoints(artsActor, 0), true, "Cantrips cost no Arts Points.");
assert.equal(await api.spendArtsPoints(artsActor, 9), true);
await api.recoverArtsPoints(artsActor, "max");
assert.equal(await api.spendArtsPoints(artsActor, 9), false, "Only one 9th-level Art may be cast per Long Rest.");
arts = await api.recoverArtsPoints(artsActor, "max", { longRest: true });
assert.equal(arts.ninthLevelCast, false);
assert.equal(arts.value, 20);
await api.configureArtsPoints(artsActor, { maximum: 3, value: 2, maximumArtLevel: 2 });
assert.equal(await api.spendArtsPoints(artsActor, 3), false, "An Art cannot exceed Maximum Art Level.");
assert.equal(await api.spendArtsPoints(artsActor, 2), true);
assert.equal(await api.spendArtsPoints(artsActor, 1), false, "An Art cannot be cast without enough Arts Points.");
await assert.rejects(() => api.spendArtsPoints(artsActor, 1.5), /integer from 0 to 9/);
await assert.rejects(() => api.spendArtsPoints(artsActor, 10), /integer from 0 to 9/);
arts = await api.recoverArtsPoints(artsActor, -10);
assert.equal(arts.value, 0, "Arts Point recovery cannot reduce the pool below zero.");

const oripathyActor = actorFixture();
assert.deepEqual(api.getOripathyState(oripathyActor), { infected: false, assimilation: 0 });
let oripathy = await api.setOripathyState(oripathyActor, { infected: true, assimilation: 7 });
assert.deepEqual(oripathy, { infected: true, assimilation: 7 });
oripathy = await api.setOripathyState(oripathyActor, { assimilation: -4 });
assert.deepEqual(oripathy, { infected: true, assimilation: 0 }, "Originium Assimilation cannot be negative.");

const restActor = actorFixture();
assert.equal(await api.completeRestAction(restActor, "short"), null);
assert.equal(await api.beginRestAction(restActor, { kind: "long", name: "Work" }), true);
assert.equal(await api.beginRestAction(restActor, { kind: "short", name: "Other" }), false, "Only one Rest Action may be performed at once.");
assert.equal(await api.completeRestAction(restActor, "short"), false, "A Long Rest Action cannot finish during a Short Rest.");
await assert.rejects(() => api.completeRestAction(restActor, "invalid"), /short or long/);
assert.deepEqual(await api.completeRestAction(restActor, "long"), { kind: "long", name: "Work" });
assert.equal(await api.beginRestAction(restActor, { kind: "short" }), true);
assert.deepEqual(await api.completeRestAction(restActor, "long"), { kind: "short", name: "Rest Action" }, "A Short Rest Action may be performed during a Long Rest.");
await assert.rejects(() => api.beginRestAction(restActor, { kind: "invalid" }), /short or long/);

assert.equal(api.martialDC(actor, "str"), 13);
assert.equal(api.martialDC(actor, "dex"), 15);
assert.equal(api.martialDC(actor), 13);
assert.throws(() => api.martialDC(actor, "con"), /str or dex/);
assert.equal(api.damageCategory("thunder"), "physical");
assert.equal(api.damageCategory("BLUDGEONING"), "physical");
assert.equal(api.damageCategory("fire"), "arts");
assert.equal(api.damageCategory("untyped"), null);
assert.equal(api.damageAfterReduction(0, 3), 0);
assert.equal(api.damageAfterReduction(2, 10), 1);
assert.equal(api.damageAfterReduction(12, 3, { resistance: true }), 4);
assert.equal(api.damageAfterReduction(2, 10, { vulnerability: true }), 2, "DR applies before vulnerability and cannot reduce incoming damage below 1.");
assert.equal(api.damageAfterReduction(12, 3, { resistance: true, vulnerability: true }), 9, "Resistance and vulnerability cancel each other.");
assert.equal(api.damageAfterReduction(-4, 2), 0);
assert.throws(() => api.getDyingState({}), /Actor document/);
assert.ok(notifications.some(([level]) => level === "warn"), "Rejected rule actions should issue a warning.");

console.log("Verified Chapter 1 condition, Dying/Mettle, Operator Skill, Arts Point, Rest Action, Martial DC, and DR helpers.");

function actorFixture() {
  const flags = new Map();
  const effects = [];
  return {
    documentName: "Actor",
    name: "Verifier",
    flags,
    effects,
    system: {
      abilities: { str: { mod: 2 }, dex: { mod: 4 } },
      attributes: { prof: 3, hp: { value: 0, max: 20 } }
    },
    getFlag(namespace, key) { return flags.get(`${namespace}.${key}`); },
    async setFlag(namespace, key, value) {
      flags.set(`${namespace}.${key}`, structuredClone(value));
      return value;
    },
    async unsetFlag(namespace, key) { flags.delete(`${namespace}.${key}`); },
    async update(change) {
      if ("system.attributes.hp.value" in change) this.system.attributes.hp.value = change["system.attributes.hp.value"];
    },
    async createEmbeddedDocuments(type, documents) {
      assert.equal(type, "ActiveEffect");
      for (const document of documents) {
        const effect = {
          ...document,
          getFlag: (namespace, key) => document.flags?.[namespace]?.[key],
          async delete() { effects.splice(effects.indexOf(effect), 1); }
        };
        effects.push(effect);
      }
      return documents;
    }
  };
}
