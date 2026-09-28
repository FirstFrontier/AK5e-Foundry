import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHAPTER_ONE_ENTRIES } from "../scripts/chapter-one-content.mjs";
import { CHAPTER_TWO_ORIGINS } from "../scripts/chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS } from "../scripts/chapter-five-content.mjs";
import { CHAPTER_SIX_CREATURES } from "../scripts/chapter-six-content.mjs";
import { fieldValue } from "./monster-statblock.mjs";

const sourceRoot = new URL("../../AK5e_1.3.1_Foundry_Source/", import.meta.url);
const chapters = [
  chapter(1, "01_chapter_1_changing_the_game.txt", CHAPTER_ONE_ENTRIES),
  chapter(2, "02_chapter_2_character_origins.txt", CHAPTER_TWO_ORIGINS),
  chapter(3, "03_chapter_3_character_classes.txt", CHAPTER_THREE_CLASSES),
  chapter(4, "04_chapter_4_equipment.txt", CHAPTER_FOUR_EQUIPMENT),
  chapter(5, "05_chapter_5_arts.txt", CHAPTER_FIVE_ARTS),
  chapter(6, "06_chapter_6_dwellers_of_terra.txt", CHAPTER_SIX_CREATURES)
];
const supportedItemTypes = new Set(["background", "class", "equipment", "feat", "loot", "race", "spell", "subclass", "tool", "weapon"]);

await Promise.all(chapters.map(async entry => {
  entry.source = (await readFile(new URL(entry.file, sourceRoot), "utf8")).replace(/\r\n/g, "\n");
}));

assert.equal(CHAPTER_ONE_ENTRIES.length, 8);
assertKinds(CHAPTER_TWO_ORIGINS, {
  reference: 3, species: 36, nationality: 20, background: 33,
  "species-feature": 142, "origin-summon": 3
});
assertKinds(CHAPTER_THREE_CLASSES, {
  reference: 1, class: 8, "class-summon": 8, "class-feature": 232,
  subclass: 54, "subclass-feature": 483, "operator-skill": 320
});
assertKinds(CHAPTER_FOUR_EQUIPMENT, {
  reference: 6, weapon: 27, equipment: 16, tool: 13, loot: 15,
  "weapon-property": 13, "armour-property": 1, "tool-rule": 13,
  "gear-rule": 15, "magic-item": 13, "magic-weapon": 81
});
assertKinds(CHAPTER_FIVE_ARTS, {
  reference: 4, "standard-art-pool": 11, "special-art-pool": 6, art: 111
});
assertKinds(CHAPTER_SIX_CREATURES, { reference: 2, creature: 145 });

const allIdentifiers = chapters.flatMap(({ entries }) => entries.map(entry => entry.id ?? entry.slug));
assert.equal(new Set(allIdentifiers).size, allIdentifiers.length, "Generated slugs/IDs must be unique across every chapter.");

for (const { number, entries, source } of chapters) {
  const identifiers = entries.map(entry => entry.id ?? entry.slug);
  assert.equal(new Set(identifiers).size, identifiers.length, `Chapter ${number} has duplicate IDs.`);
  for (const entry of entries) {
    const identifier = entry.id ?? entry.slug;
    assert.match(identifier ?? "", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${entry.name ?? `Chapter ${number} record`} has an invalid stable ID.`);
    assert.ok(entry.name, `Chapter ${number} has an unnamed record.`);
    assert.ok(entry.sourceHeading, `${entry.name} has no source heading for flags.ak5e.sourceHeading.`);
    assert.ok(entry.content, `${entry.name} has no rendered content.`);
    assert.ok(entry.rawSource, `${entry.name} has no retained source.`);
    if (entry.itemType != null) assert.ok(supportedItemTypes.has(entry.itemType), `${entry.name} has unsupported Item type ${entry.itemType}.`);
    assert.equal(entry.itemType ?? null, expectedItemType(number, entry.kind), `${entry.name} has the wrong Foundry document/item type.`);
    assert.doesNotMatch(entry.content, /\{\{|\\(?:page|column)\b|<img\b|<script\b/i, `${entry.name} contains unsafe/unrendered source markup.`);
    for (const fragment of entry.rawSources ?? []) {
      assert.ok(source.includes(fragment), `${entry.name} contains a source fragment not present in Chapter ${number}.`);
    }
  }

  const reviewedSource = number === 6 ? source.slice(0, source.indexOf("## Character Sheet\n")) : source;
  const retained = entries.flatMap(entry => entry.rawSources ?? [entry.rawSource]).join("\n");
  const uncovered = reviewedSource.split("\n")
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(line => meaningfulSourceLine(line.text) && !retained.includes(line.text));
  assert.deepEqual(uncovered, [], `Chapter ${number} has uncovered rules/source lines.`);
}

const species = CHAPTER_TWO_ORIGINS.filter(entry => entry.kind === "species");
for (const entry of species.filter(entry => !entry.parent)) {
  const explicitSize = entry.rawSource.match(/\b(?:your|their) size is (Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i)?.[1];
  assert.ok(explicitSize, `${entry.name} has no explicit source size.`);
  assert.equal(entry.speciesSize, sizeKey(explicitSize), `${entry.name} has the wrong native size.`);
}

for (const background of CHAPTER_TWO_ORIGINS.filter(entry => entry.kind === "background")) {
  assert.deepEqual(
    background.systemData.advancement,
    [],
    `${background.name} must suppress D&D5e's unrelated default background advancements.`
  );
}

const summons = [...CHAPTER_TWO_ORIGINS, ...CHAPTER_THREE_CLASSES]
  .filter(entry => ["origin-summon", "class-summon"].includes(entry.kind));
for (const entry of summons) {
  const hpText = entry.statblock.hitPoints.text;
  if (!/^\s*\d+\s*(?:\([^)]+\))?\s*$/.test(hpText)) {
    assert.equal(entry.statblock.hitPoints.maximum, null, `${entry.name} has a source-defined HP formula but a fixed native maximum.`);
  }
}
assert.deepEqual(
  CHAPTER_TWO_ORIGINS.find(entry => entry.name === "Flowing Shape").statblock.abilityScores.slice(3),
  [null, null, null],
  "Flowing Shape's intentionally blank mental abilities must remain blank in generated data."
);
assert.equal(
  CHAPTER_THREE_CLASSES.find(entry => entry.name === "Doll").statblock.armorClass.value,
  null,
  "Doll's source-defined AC must not become a fixed value."
);

const classes = CHAPTER_THREE_CLASSES.filter(entry => entry.kind === "class");
for (const entry of classes) {
  const sourceDie = entry.rawSource.match(/^\*\*Hit Dice:\*\*\s*1d(\d+)/mi)?.[1];
  assert.equal(entry.systemData.hd.denomination, `d${sourceDie}`, `${entry.name} has the wrong Hit Die.`);
}

for (const weapon of CHAPTER_FOUR_EQUIPMENT.filter(entry => entry.kind === "weapon")) {
  const sourceRange = weapon.tableData.properties.match(/(?:Range|Thrown)\s*\((\d+)(?:\s*\/\s*(\d+))?\)/i);
  if (sourceRange) {
    assert.equal(weapon.systemData.range.value, Number(sourceRange[1]), `${weapon.name} has the wrong native range.`);
    assert.equal(weapon.systemData.range.long, sourceRange[2] ? Number(sourceRange[2]) : null, `${weapon.name} has the wrong native long range.`);
  }
}

const arts = CHAPTER_FIVE_ARTS.filter(entry => entry.kind === "art");
for (const entry of arts) {
  assert.ok(Number.isInteger(entry.level) && entry.level >= 0 && entry.level <= 9, `${entry.name} has an invalid Art level.`);
  assert.ok(entry.school, `${entry.name} has no Art school.`);
  for (const [field, value] of Object.entries(entry.castingMetadata)) assert.ok(value, `${entry.name} has no ${field} source value.`);
  assert.ok(entry.spellData.activation.type, `${entry.name} has no native activation.`);
  assert.ok(entry.spellData.range.units, `${entry.name} has no native range unit.`);
  assert.ok(entry.spellData.duration.units, `${entry.name} has no native duration unit.`);
}

const creatures = CHAPTER_SIX_CREATURES.filter(entry => entry.kind === "creature");
assert.equal(creatures.reduce((total, entry) => total + entry.continuationCount, 0), 2, "Unexpected Chapter 6 statblock continuation count.");
assertGroups(creatures, "faction", {
  Collapsals: 8, Creatures: 15, Reunion: 36, Sarkaz: 37,
  Seaborn: 22, Soldiers: 12, Ursus: 8, Uncategorized: 7
});
assertGroups(creatures, "category", { Normal: 60, Elite: 52, Leader: 33 });
assert.ok(creatures.every(entry => entry.category), "Every Chapter 6 creature must have a Normal, Elite, or Leader category.");
assert.ok(creatures.every(entry => entry.statblock.size), "Every Chapter 6 creature must have a parsed size.");
assert.ok(creatures.every(entry => entry.statblock.abilityScores.every(Number.isFinite)), "A Chapter 6 ability score did not parse.");
assert.deepEqual(
  creatures.filter(entry => entry.statblock.hitPoints.maximum === null).map(entry => entry.name),
  ["Pathshaper Fractal"],
  "Pathshaper Fractal must be the only Chapter 6 creature with non-numeric HP."
);
assert.deepEqual(
  creatures.filter(entry => entry.statblock.challenge.value === null).map(entry => entry.name),
  ["Pathshaper Fractal"],
  "Pathshaper Fractal must be the only Chapter 6 creature with non-numeric CR."
);
for (const entry of creatures) {
  const featureHeadings = [...entry.rawSource.matchAll(/^\*\*\*(.+?)\*\*\*\s*(?:[.:]\s*)?(.*)$/gm)];
  assert.equal(entry.features.length, featureHeadings.length, `${entry.name} has omitted embedded traits/actions.`);
  const expectedDefenses = {
    damageResistances: fieldValue(entry.rawSource, "Damage Resistances") || fieldValue(entry.rawSource, "Resistances"),
    damageImmunities: fieldValue(entry.rawSource, "Damage Immunities"),
    damageVulnerabilities: fieldValue(entry.rawSource, "Damage Vulnerabilities"),
    conditionImmunities: fieldValue(entry.rawSource, "Condition Immunities") || fieldValue(entry.rawSource, "Condition Immunity")
  };
  assert.deepEqual(entry.statblock.defenses, expectedDefenses, `${entry.name} has incorrect defenses.`);
  assert.equal(entry.statblock.languages, fieldValue(entry.rawSource, "Languages"), `${entry.name} has incorrect languages.`);
}

console.log("Verified all generated AK5e Chapter 1–6 records against the v1.3.1 source.");
console.log(`Top-level records: ${chapters.reduce((total, entry) => total + entry.entries.length, 0)}; Chapter 6 embedded features: ${creatures.reduce((total, entry) => total + entry.features.length, 0)}.`);

function chapter(number, file, entries) {
  return { number, file, entries, source: "" };
}

function assertKinds(entries, expected) {
  const actual = Object.fromEntries([...Map.groupBy(entries, entry => entry.kind)].map(([kind, records]) => [kind, records.length]));
  assert.deepEqual(actual, expected);
}

function assertGroups(entries, property, expected) {
  const actual = Object.fromEntries([...Map.groupBy(entries, entry => entry[property])].map(([value, records]) => [value, records.length]));
  assert.deepEqual(actual, expected, `Unexpected ${property} counts.`);
}

function meaningfulSourceLine(text) {
  return Boolean(text)
    && text !== ":"
    && !/^\\(?:page|column)\b/.test(text)
    && !/^\{\{|^}}$|^::::?$/.test(text)
    && !/^<\/?(?:img|br)\b/.test(text)
    && !/^(?:src|style)=/.test(text)
    && !/^# Chapter \d/.test(text);
}

function sizeKey(value) {
  return { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" }[value.toLowerCase()];
}

function expectedItemType(chapterNumber, kind) {
  if ([1, 6].includes(chapterNumber)) return null;
  const types = {
    2: {
      reference: null, species: "race", nationality: "feat", background: "background",
      "species-feature": "feat", "origin-summon": null
    },
    3: {
      reference: null, class: "class", "class-summon": null, "class-feature": "feat",
      subclass: "subclass", "subclass-feature": "feat", "operator-skill": "feat"
    },
    4: {
      reference: null, weapon: "weapon", equipment: "equipment", tool: "tool", loot: "loot",
      "weapon-property": "feat", "armour-property": "feat", "tool-rule": "feat",
      "gear-rule": "feat", "magic-item": "equipment", "magic-weapon": "weapon"
    },
    5: { reference: null, "standard-art-pool": "feat", "special-art-pool": "feat", art: "spell" }
  };
  assert.ok(Object.hasOwn(types[chapterNumber] ?? {}, kind), `Unsupported Chapter ${chapterNumber} record kind: ${kind}`);
  return types[chapterNumber][kind];
}
