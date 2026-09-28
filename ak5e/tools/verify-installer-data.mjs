import assert from "node:assert/strict";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";

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
// The configured D&D5e implementation can differ from the global base class.
globalThis.Item.implementation = { createDocuments: globalThis.Item.createDocuments };
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

assert.equal(results.reduce((total, result) => total + result.created, 0), 1843);
assert.equal(collections.journal.length, 24);
assert.equal(collections.items.length, 1663);
assert.equal(collections.items.filter(item => item.flags.ak5e.operatorSkill).length, 320);
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

// Simulate upgrading an existing World containing the four combined references.
const variants = collections.items.filter(item => item.flags.ak5e.enhancement);
assert.equal(variants.length, 81);
const combined = collections.items.filter(item => item.flags.ak5e.enhancementReference);
assert.equal(combined.length, 4);
for (const item of variants) collections.items.splice(collections.items.indexOf(item), 1);
const combinedIds = combined.map(item => item.id);
const magicFolder = collections.folders.find(folder => folder.name === "Magic Items");
const referenceFolder = collections.folders.find(folder => folder.name === "Magic Item References");
assert.ok(magicFolder && referenceFolder);
for (const item of combined) {
  const entry = CHAPTER_FOUR_EQUIPMENT.find(entry => entry.id === item.flags.ak5e.chapterFourId);
  item.name = entry.previousName;
  item.flags.ak5e.contentVersion = "0.2.4";
  delete item.flags.ak5e.enhancementReference;
  item.folder = magicFolder.id;
  item.system.description = { value: entry.content.split('<aside class="ak5e-note" data-ak5e-enhancement-reference>')[0], chat: "Custom chat" };
}
combined[0].name = "My custom staff reference";
combined[0].img = "custom-staff.webp";
combined[0].system.quantity = 7;
combined[0].system.description.value += "<p>My campaign notes.</p>";
combined[0].flags.otherModule = { keep: true };
const actorCopy = embeddedItem({ name: combined[0].name, type: combined[0].type, flags: combined[0].flags, system: combined[0].system });
creature.items.push(actorCopy);
const actorCopyBefore = JSON.stringify(actorCopy);
const unrelated = [...collections.items, ...collections.journal, ...collections.actors].filter(item => !combined.includes(item));
const updateCounts = unrelated.map(item => item.updates.length);
game.user.isGM = false;
assert.equal((await game.ak5e.installChapterFourEquipment()).created, 0);
assert.equal(collections.items.filter(item => item.flags.ak5e.enhancement).length, 0);
assert.ok(combined.every(item => item.folder === magicFolder.id));
game.user.isGM = true;
assert.deepEqual(await game.ak5e.installChapterFourEquipment(), { created: 81, updated: 4, skipped: 128 });
assert.deepEqual(combined.map(item => item.id), combinedIds);
assert.ok(combined.every(item => item.folder === referenceFolder.id));
assert.ok(combined.slice(1).every(item => item.name.startsWith("Reference: ")));
assert.equal(combined[0].name, "My custom staff reference");
assert.equal(combined[0].img, "custom-staff.webp");
assert.equal(combined[0].system.quantity, 7);
assert.equal(combined[0].system.description.chat, "Custom chat");
assert.match(combined[0].system.description.value, /My campaign notes/);
assert.deepEqual(combined[0].flags.otherModule, { keep: true });
assert.equal(JSON.stringify(actorCopy), actorCopyBefore);
assert.deepEqual(unrelated.map(item => item.updates.length), updateCounts);
assert.ok(collections.items.filter(item => item.flags.ak5e.enhancement).every(item => item.folder === magicFolder.id));
assert.deepEqual(await game.ak5e.installChapterFourEquipment(), { created: 0, updated: 0, skipped: 213 });
assert.ok(combined.every(item => item.system.description.value.split("data-ak5e-enhancement-reference").length === 2));
creature.items.pop();

console.log("Verified 1,843 installer documents, repeat runs, non-GM guards, reference upgrade preserving custom fields/Actor copies, and creature migration.");

async function createDocument(collection, documentName, data) {
  const document = {
    ...structuredClone(data),
    id: `document-${++nextId}`,
    documentName,
    updates: [],
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
    async update(change) {
      this.updates.push(structuredClone(change));
      for (const [path, value] of Object.entries(structuredClone(change))) {
        const keys = path.split(".");
        const last = keys.pop();
        let parent = this;
        for (const key of keys) parent = parent[key] ??= {};
        if (last.startsWith("-=")) delete parent[last.slice(2)];
        else parent[last] = value;
      }
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
