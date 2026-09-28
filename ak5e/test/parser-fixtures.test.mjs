import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractMonsterBlocks, parseMonsterStatblock } from "../tools/monster-statblock.mjs";
import { sourceToHtml } from "../tools/source-html.mjs";
import { sourceHeadings, splitSourceSections } from "../tools/source-sections.mjs";
import { parseSourceTable } from "../tools/source-tables.mjs";

const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");

test("source sections stop at peer/higher headings and ignore monster headings", async () => {
  const source = await fixture("sections.md");
  assert.deepEqual(sourceHeadings(source, 3).map(heading => heading.name), ["Alpha", "Beta", "Gamma"]);
  const sections = splitSourceSections(source, 3);
  assert.match(sections[0].raw, /Internal monster heading/);
  assert.doesNotMatch(sections[0].raw, /### Beta/);
  assert.doesNotMatch(sections[1].raw, /## Second Parent/);
  assert.equal(sections[2].name, "Gamma");
});

test("table parser retains categories, normalized headers, cells, and raw rows", async () => {
  const table = parseSourceTable(await fixture("table.md"), "Equipment (Test)");
  assert.deepEqual(table.headers, ["name", "damage", "cost"]);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].category, "Light Gear");
  assert.equal(table.rows[0].cells.name, "Test &lt;Blade&gt;");
  assert.equal(table.rows[1].cells.cost, "10 LMD");
  assert.match(table.rows[0].raw, /^\| &emsp;/);
  assert.throws(() => parseSourceTable("### Nothing here", "Missing"), /Missing source table/);
});

test("HTML renderer converts supported source markup and removes layout/images", async () => {
  const html = sourceToHtml(await fixture("html.md"));
  assert.match(html, /<h3>Fixture Heading<\/h3>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<aside class="ak5e-note">/);
  assert.match(html, /<pre>\| Unsafe &lt;cell&gt; \|<\/pre>/);
  assert.doesNotMatch(html, /imageMask|<img|\\page/);
});

test("HTML renderer produces readable tables with source values and category rows", async () => {
  const html = sourceToHtml(await fixture("table.md"));
  assert.match(html, /<table class="ak5e-source-table">/);
  assert.match(html, /<th scope="col" class="ak5e-source-table__center">Damage<\/th>/);
  assert.match(html, /<th scope="rowgroup" colspan="3"><em>Light Gear<\/em><\/th>/);
  assert.match(html, /&emsp; Test &lt;Blade&gt;/);
  assert.match(html, /<td class="ak5e-source-table__right">10 LMD<\/td>/);
  assert.doesNotMatch(html, /<pre>/);

  const irregular = sourceToHtml("| Name | Effect | Duration |\n|:---|:---|:---|\n| Cluster Bombs | Three points | | Instant");
  assert.match(irregular, /<td class="ak5e-source-table__left">Instant<\/td>/);
  assert.equal((irregular.match(/<td /g) ?? []).length, 3);
});

test("HTML renderer retains source paragraph separators and intentional line breaks", async () => {
  const html = sourceToHtml("First paragraph.\n:\nSecond paragraph.\nContinued line.\n\nThird paragraph.");
  assert.deepEqual([...html.matchAll(/<p class="ak5e-source-paragraph">(.*?)<\/p>/g)].map(match => match[1]), [
    "First paragraph.", "Second paragraph.<br>Continued line.", "Third paragraph."
  ]);

  // The nationality shown in the origin wizard uses ':' between all five prose paragraphs.
  const source = await readFile(new URL("../../AK5e_1.3.1_Foundry_Source/02_chapter_2_character_origins.txt", import.meta.url), "utf8");
  const prose = source.slice(source.indexOf("Up until around two centuries ago"), source.indexOf("{{note", source.indexOf("Up until around two centuries ago")));
  const paragraphs = [...sourceToHtml(prose).matchAll(/<p class="ak5e-source-paragraph">(.*?)<\/p>/g)].map(match => match[1]);
  assert.deepEqual(paragraphs, prose.split("\n").map(line => line.trim()).filter(line => line && line !== ":"));
  assert.equal(paragraphs.length, 5);
});

test("every source pipe-table block renders as one table", async () => {
  const sourceFiles = [
    "01_chapter_1_changing_the_game.txt",
    "02_chapter_2_character_origins.txt",
    "03_chapter_3_character_classes.txt",
    "04_chapter_4_equipment.txt",
    "05_chapter_5_arts.txt",
    "06_chapter_6_dwellers_of_terra.txt"
  ];
  for (const name of sourceFiles) {
    const source = await readFile(new URL(`../../AK5e_1.3.1_Foundry_Source/${name}`, import.meta.url), "utf8");
    const lines = source.split("\n");
    const blocks = lines.filter((line, index) =>
      line.trim().startsWith("|") && !lines[index - 1]?.trim().startsWith("|")).length;
    const html = sourceToHtml(source);
    assert.equal((html.match(/<table class="ak5e-source-table">/g) ?? []).length, blocks, name);
    assert.doesNotMatch(html, /<pre>/, name);
  }
});

test("monster parser extracts core statistics, defenses, senses, and movement", async () => {
  const blocks = extractMonsterBlocks(await fixture("monster.md"));
  assert.equal(blocks.length, 1);
  const parsed = parseMonsterStatblock(blocks[0].raw);
  assert.deepEqual(
    { category: parsed.category, size: parsed.size, type: parsed.typeCustom, subtype: parsed.subtype, alignment: parsed.alignment },
    { category: "Elite", size: "sm", type: "Beast", subtype: "Originium", alignment: "unaligned" }
  );
  assert.deepEqual(parsed.abilityScores, [8, 14, 12, 3, 10, 5]);
  assert.deepEqual(parsed.armorClass, { value: 14, text: "14 (natural armor)" });
  assert.deepEqual(parsed.hitPoints, { maximum: 27, formula: "6d6 + 6", text: "27 (6d6 + 6)" });
  assert.deepEqual(
    { walk: parsed.movement.walk, climb: parsed.movement.climb, fly: parsed.movement.fly, hover: parsed.movement.hover },
    { walk: 30, climb: 20, fly: 40, hover: true }
  );
  assert.equal(parsed.challenge.value, 0.5);
  assert.equal(parsed.senses.passive, 12);
  assert.equal(parsed.defenses.conditionImmunities, "poisoned");
  assert.equal(parsed.languages, "understands Terran but cannot speak");
});
