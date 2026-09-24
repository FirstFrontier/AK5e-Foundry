import assert from "node:assert/strict";

const hooks = {};
const collections = { folders: [], journal: [], items: [], actors: [] };
let nextId = 0;

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
  utils: { randomID: () => `test-${++nextId}` }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = {
  ...collections,
  settings: { register() {}, registerMenu() {}, get: () => true },
  system: { id: "dnd5e" },
  user: { isGM: true },
  i18n: { localize: key => key, format: key => key }
};

globalThis.Folder = { create: data => createDocument(collections.folders, "Folder", data) };
globalThis.JournalEntry = { create: data => createDocument(collections.journal, "JournalEntry", data) };
globalThis.Item = {
  create: data => createDocument(collections.items, "Item", data),
  createDocuments: data => Promise.all(data.map(entry => createDocument(collections.items, "Item", entry)))
};
globalThis.Actor = {
  create: data => createDocument(collections.actors, "Actor", data),
  createDocuments: data => Promise.all(data.map(entry => createDocument(collections.actors, "Actor", entry)))
};

await import(`../scripts/ak5e.mjs?installer-verification=${Date.now()}`);
hooks.init();
hooks.setup();
hooks.ready();

const results = await Promise.all([
  game.ak5e.installChapterOneRules(),
  game.ak5e.installChapterTwoOrigins(),
  game.ak5e.installChapterThreeClasses(),
  game.ak5e.installChapterFourEquipment(),
  game.ak5e.installChapterFiveArts(),
  game.ak5e.installChapterSixCreatures()
]);

assert.equal(results.reduce((total, result) => total + result.created, 0), 1442);
assert.equal(collections.journal.length, 24);
assert.equal(collections.items.length, 1262);
assert.equal(collections.actors.length, 156);
assert.deepEqual([...new Set(collections.items.map(item => item.type))].sort(), [
  "background", "class", "equipment", "feat", "loot", "race", "spell", "subclass", "tool", "weapon"
]);
assert.ok(collections.actors.every(actor => actor.type === "npc"));
assert.ok(collections.journal.every(journal => journal.pages.length === 1 && journal.pages[0].type === "text"));

const installerNames = [
  "installChapterOneRules", "installChapterTwoOrigins", "installChapterThreeClasses",
  "installChapterFourEquipment", "installChapterFiveArts", "installChapterSixCreatures"
];
const initialCounts = Object.fromEntries(Object.entries(collections).map(([key, entries]) => [key, entries.length]));
const initialIds = Object.fromEntries(Object.entries(collections).map(([key, entries]) => [key, entries.map(entry => entry.id)]));
for (const name of installerNames) {
  const result = await game.ak5e[name]();
  assert.equal(result.created, 0, name + " created documents on repeat");
  assert.equal(result.updated, 0, name + " updated documents on repeat");
}
for (const [key, entries] of Object.entries(collections)) {
  assert.equal(entries.length, initialCounts[key], key + " count changed on repeat");
  assert.deepEqual(entries.map(entry => entry.id), initialIds[key], key + " IDs changed on repeat");
}

game.user.isGM = false;
for (const name of installerNames) {
  const result = await game.ak5e[name]();
  assert.equal(result.created, 0, name + " allowed a non-GM creation");
}
game.user.isGM = true;
for (const [key, entries] of Object.entries(collections)) {
  assert.equal(entries.length, initialCounts[key], key + " count changed for non-GM");
}

const documents = [...collections.journal, ...collections.items, ...collections.actors];
const identifiers = [];
for (const document of documents) {
  const flags = document.flags?.ak5e;
  assert.ok(flags, `${document.name} has no flags.ak5e object.`);
  assert.ok(flags.sourceHeading, `${document.name} has no source heading flag.`);
  assert.match(flags.sourceFile ?? "", /^0[1-6]_chapter_[1-6]_.+\.txt$/, `${document.name} has no valid source file flag.`);
  assert.ok(flags.rawSource, `${document.name} has no raw source flag.`);
  assert.match(flags.contentVersion ?? "", /^\d+\.\d+\.\d+$/, `${document.name} has no content version flag.`);
  const identifier = [
    flags.chapterOneSlug, flags.chapterTwoId, flags.chapterThreeId,
    flags.chapterFourId, flags.chapterFiveId, flags.chapterSixId
  ].find(Boolean);
  assert.match(identifier ?? "", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${document.name} has no stable source identifier flag.`);
  identifiers.push(`${flags.sourceFile}:${identifier}`);
}
assert.equal(new Set(identifiers).size, identifiers.length, "Installed source identifier flags must be unique.");

const pioneer = collections.items.find(item => item.flags?.ak5e?.chapterTwoId === "background-pioneer");
pioneer.system.advancement = {
  staleAbility: { _id: "staleAbility", type: "AbilityScoreImprovement" },
  staleTraits: { _id: "staleTraits", type: "Trait" }
};
const repair = await game.ak5e.installChapterTwoOrigins();
assert.deepEqual(repair, { created: 0, updated: 1, skipped: 236 });
assert.equal(pioneer.updates.at(-1)["system.advancement.-=staleAbility"], null);
assert.equal(pioneer.updates.at(-1)["system.advancement.-=staleTraits"], null);

const embedded = collections.actors.flatMap(actor => actor.items ?? []);
assert.equal(embedded.length, 801);
for (const item of embedded) {
  assert.equal(item.type, "feat");
  assert.equal(item.flags?.ak5e?.npcFeature, true);
  assert.ok(item.flags.ak5e.section);
  assert.ok(Number.isInteger(item.flags.ak5e.sourceIndex));
}

const creature = collections.actors.find(actor => actor.getFlag("ak5e", "chapterSixId") && actor.items.length);
const managedBefore = creature.items.filter(item => item.getFlag("ak5e", "npcFeature"));
const unmanaged = { id: "embedded-" + ++nextId, name: "User-added Item", type: "feat", flags: {}, getFlag() { return undefined; } };
creature.items.push(unmanaged);
const originalVersion = creature.getFlag("ak5e", "contentVersion");
creature.flags.ak5e.contentVersion = "0.0.0";
const migration = await game.ak5e.installChapterSixCreatures();
assert.deepEqual(migration, { created: 0, updated: 1, skipped: 146 });
assert.equal(collections.actors.length, initialCounts.actors);
assert.ok(creature.items.includes(unmanaged), "creature migration removed an unmanaged Item");
const managedAfter = creature.items.filter(item => item.getFlag("ak5e", "npcFeature"));
assert.equal(managedAfter.length, managedBefore.length);
assert.ok(managedAfter.every(item => !managedBefore.some(oldItem => oldItem.id === item.id)), "managed creature Items were not refreshed");
assert.equal(creature.getFlag("ak5e", "contentVersion"), originalVersion);
assert.deepEqual(await game.ak5e.installChapterSixCreatures(), { created: 0, updated: 0, skipped: 147 });

console.log("Verified 1,442 installer documents, repeat runs, non-GM guards, and creature migration preserving an unmanaged Item.");

async function createDocument(collection, documentName, data) {
  const document = {
    ...structuredClone(data),
    id: `document-${++nextId}`,
    documentName,
    updates: [],
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
    async update(change) {
      this.updates.push(structuredClone(change));
      Object.assign(this, structuredClone(change));
      return this;
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Item");
      this.items = this.items.filter(item => !ids.includes(item.id));
    },
    async createEmbeddedDocuments(type, entries) {
      assert.equal(type, "Item");
      const created = entries.map(entry => embeddedItem(entry));
      this.items.push(...created);
      return created;
    }
  };
  if (documentName === "Actor") document.items = (data.items ?? []).map(entry => embeddedItem(entry));
  collection.push(document);
  return document;
}

function embeddedItem(entry) {
  return {
    ...structuredClone(entry),
    id: "embedded-" + ++nextId,
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; }
  };
}
