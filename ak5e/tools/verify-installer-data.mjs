import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { AK5E_ROLL_TABLES } from "../scripts/roll-table-content.mjs";

const hooks = {};
const collections = { folders: [], journal: [], items: [], actors: [], tables: [] };
const warnings = [];
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
globalThis.ui = { notifications: { info() {}, warn(...args) { warnings.push(args); }, error() {} } };
globalThis.game = {
  ...collections,
  settings: { register() {}, registerMenu() {}, get: () => true },
  system: { id: "dnd5e" },
  user: { isGM: true },
  i18n: { localize: key => key, format: key => key }
};

globalThis.Folder = { create: async data => {
  await new Promise(resolve => setTimeout(resolve, 1));
  return createDocument(collections.folders, "Folder", data);
} };
globalThis.Folder.implementation = globalThis.Folder;
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
globalThis.RollTable = { implementation: {
  createDocuments: async (data, options) => {
    assert.equal(options?.keepEmbeddedIds, true, "RollTable creation must retain stable embedded result IDs");
    await new Promise(resolve => setTimeout(resolve, 10));
    return Promise.all(data.map(entry => createDocument(collections.tables, "RollTable", entry)));
  }
} };

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
  game.ak5e.installChapterSixCreatures(),
  Promise.all([game.ak5e.installRollTables(), game.ak5e.installRollTables()]).then(([first, second]) => {
    assert.deepEqual(first, second, "overlapping table installs should share one result");
    return first;
  })
]);

assert.equal(results.reduce((total, result) => total + result.created, 0), 2197);
assert.equal(collections.journal.length, 24);
assert.equal(collections.items.length, 2013);
assert.equal(collections.tables.length, 4);
assert.equal(collections.folders.filter(folder => folder.type === "RollTable").length, 1);
assert.equal(collections.tables.reduce((total, table) => total + table.results.length, 0), 37);
assert.equal(collections.items.filter(item => item.flags.ak5e.operatorSkill).length, 320);
assert.equal(collections.actors.length, 156);
assert.deepEqual([...new Set(collections.items.map(item => item.type))].sort(), [
  "background", "class", "equipment", "feat", "loot", "race", "spell", "subclass", "tool", "weapon"
]);
assert.ok(collections.actors.every(actor => actor.type === "npc"));
assert.ok(collections.journal.every(journal => journal.pages.length === 1 && journal.pages[0].type === "text"));

const installerNames = [
  "installChapterOneRules", "installChapterTwoOrigins", "installChapterThreeClasses",
  "installChapterFourEquipment", "installChapterFiveArts", "installChapterSixCreatures", "installRollTables"
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

const documents = [...collections.journal, ...collections.items, ...collections.actors, ...collections.tables];
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
    flags.chapterFourId, flags.chapterFiveId, flags.chapterSixId, flags.rollTableId
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

// P0 upgrades only canonical descriptions; unrelated/authored data and Actor copies remain intact.
const baseline = JSON.parse(await readFile(new URL("../test/fixtures/p0-chapter-three-baseline.json", import.meta.url), "utf8"));
const previous = baseline.migrated;
assert.ok(Array.isArray(previous) && previous.length >= 9);
const entry = CHAPTER_THREE_CLASSES.find(entry => /doublecast/.test(entry.id) && entry.previousContentHash);
const item = collections.items.find(item => item.getFlag("ak5e", "chapterThreeId") === entry.id);
const old = previous.find(record => record.id === entry.id);
item.flags.ak5e.contentVersion = "0.2.4";
item.system.description.value = old.content;
item.system.description.chat = "Keep this chat text";
item.name = "My custom Doublecast";
item.img = "custom.webp";
item.system.activities = { custom: { name: "Authored activity" } };
item.effects = [{ name: "Authored effect" }];
item.flags.otherModule = { keep: true };
const p0ActorCopy = JSON.parse(JSON.stringify(item));
collections.actors[0].items.push(p0ActorCopy);
const actorBefore = JSON.stringify(collections.actors);
const unrelatedItem = collections.items.find(candidate => candidate.getFlag("ak5e", "chapterThreeId") === "class-caster");
unrelatedItem.flags.ak5e.contentVersion = "0.0.0";
const unrelatedBefore = JSON.stringify(unrelatedItem);
const migrationResult = await game.ak5e.installChapterThreeClasses();
assert.equal(migrationResult.created, 0);
assert.equal(migrationResult.updated, 1);
assert.equal(item.system.description.value, entry.content);
assert.equal(item.system.description.chat, "Keep this chat text");
assert.equal(item.name, "My custom Doublecast");
assert.equal(item.img, "custom.webp");
assert.deepEqual(item.system.activities, { custom: { name: "Authored activity" } });
assert.deepEqual(item.effects, [{ name: "Authored effect" }]);
assert.deepEqual(item.flags.otherModule, { keep: true });
assert.equal(JSON.stringify(collections.actors), actorBefore);
assert.equal(JSON.stringify(unrelatedItem), unrelatedBefore);
assert.equal(item.flags.ak5e.contentVersion, "0.3.8");

item.flags.ak5e.contentVersion = "0.2.4";
item.system.description.value = old.content + "<p>Campaign note</p>";
const customizedBefore = JSON.stringify(item);
const warningCount = warnings.length;
assert.equal((await game.ak5e.installChapterThreeClasses()).updated, 0);
assert.equal(JSON.stringify(item), customizedBefore);
assert.equal(warnings.length, warningCount + 1);
assert.equal(warnings.at(-1)[0], "AK5E.Notifications.ClassContentConflicts");

// Source identity wins over same names, and repeat table installation never rewrites user edits/results.
const table = collections.tables[0];
table.name = "My table";
table.description = "My table notes";
table.results[0].description = "Custom result";
table.ownership = { default: 0 };
const tableBefore = JSON.stringify(table);
assert.deepEqual(await game.ak5e.installRollTables(), { created: 0, updated: 0, skipped: 4 });
assert.equal(JSON.stringify(table), tableBefore);
assert.deepEqual(collections.tables.map(table => table.id), initialIds.tables);
for (const source of AK5E_ROLL_TABLES) {
  assert.ok(collections.tables.some(table => table.flags.ak5e.rollTableId === source.id));
}
console.log("Verified 2,197 installer documents, repeat/non-GM guards, conservative P0 description migration, custom tables, Actor copies, and existing migrations.");

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
