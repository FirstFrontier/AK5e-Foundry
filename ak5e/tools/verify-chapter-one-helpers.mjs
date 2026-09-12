import assert from "node:assert/strict";

const hooks = {};
globalThis.Hooks = { once: (name, callback) => { hooks[name] = callback; } };
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
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
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

let skills = await api.configureOperatorSkills(actor, { maximum: 10, start: 3 });
assert.deepEqual({ points: skills.points, maximum: skills.maximum, start: skills.start }, { points: 3, maximum: 10, start: 3 });
assert.equal(await api.activateOperatorSkill(actor, { id: "skill", name: "Skill", cost: 2 }), true);
skills = await api.adjustSkillPoints(actor, 5);
assert.equal(skills.points, 1, "An active Operator Skill must prevent SP gain.");
await api.endOperatorSkill(actor);
skills = await api.adjustSkillPoints(actor, 20);
assert.equal(skills.points, 10, "SP must not exceed the configured maximum.");

let arts = await api.configureArtsPoints(actor, { maximum: 20, maximumArtLevel: 9 });
assert.equal(arts.value, 20);
assert.equal(await api.spendArtsPoints(actor, 9), true);
assert.equal(await api.spendArtsPoints(actor, 9), false, "Only one 9th-level Art may be cast per Long Rest.");
arts = await api.recoverArtsPoints(actor, "max", { longRest: true });
assert.equal(arts.ninthLevelCast, false);
assert.equal(arts.value, 20);

assert.equal(await api.beginRestAction(actor, { kind: "long", name: "Work" }), true);
assert.equal(await api.completeRestAction(actor, "short"), false, "A Long Rest Action cannot finish during a Short Rest.");
await assert.rejects(() => api.completeRestAction(actor, "invalid"), /short or long/);
assert.deepEqual(await api.completeRestAction(actor, "long"), { kind: "long", name: "Work" });

assert.equal(api.martialDC(actor, "str"), 13);
assert.equal(api.martialDC(actor, "dex"), 15);
assert.equal(api.damageCategory("thunder"), "physical");
assert.equal(api.damageCategory("fire"), "arts");
assert.equal(api.damageAfterReduction(12, 3, { resistance: true }), 4);
assert.equal(api.damageAfterReduction(2, 10, { vulnerability: true }), 2, "DR applies before vulnerability and cannot reduce incoming damage below 1.");

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
