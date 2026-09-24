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
