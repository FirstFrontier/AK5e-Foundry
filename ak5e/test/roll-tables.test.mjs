import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { AK5E_ROLL_TABLES } from "../scripts/roll-table-content.mjs";
import { deterministicResultId, parseTable } from "../tools/roll-table-content.mjs";

const chapter3Path = new URL("../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt", import.meta.url);
const chapter6Path = new URL("../../AK5e_1.3.1_Foundry_Source/06_chapter_6_dwellers_of_terra.txt", import.meta.url);
const sourceByFile = new Map([
  ["03_chapter_3_character_classes.txt", await readFile(chapter3Path, "utf8")],
  ["06_chapter_6_dwellers_of_terra.txt", await readFile(chapter6Path, "utf8")]
]);

const expected = new Map([
  ["rolltable-double-blind-trial", {
    formula: "1d6",
    heading: "5th Level: Double-Blind Trial",
    values: ["Neurologicial Inhibitor", "Necrotoxin", "Haemotoxin", "Cytotoxin", "Neurotoxin", "Bungarotoxin"]
  }],
  ["rolltable-machine-personality", {
    formula: "1d6",
    heading: "Machine Personality",
    values: ["Taciturn", "Caring", "Excitable", "Warlike", "Nervous", "Analytic"]
  }],
  ["rolltable-tip-of-the-spear", {
    formula: "1d6",
    heading: "1st Level: Tip of the Spear",
    values: [
      "Additional Damage equal to your Proficiency Bonus on one Damage Roll of their choice.",
      "They gain 1d6 Temporary Hit Points; these Hit Points are additive with any Temporary Hit Points they already have.",
      "Speed increased by 10 feet.",
      "+2 Bonus to Attack Rolls.",
      "Critical Range increased by 1.",
      "Whenever they gain a Skill Point, they gain 1 more."
    ]
  }],
  ["rolltable-hole-in-the-world", {
    formula: "2d10",
    heading: "Hole in the World",
    values: [
      "Rot Eater", "Shattered Champion", "Imperial Striker", "1d4 Agents", "1d4 Witherers",
      "1d4 Infantry", "1d6 Distorted Casters", "1d6 Tactical Crossbowmen", "1d10 Acidic Originium Slugs",
      "1d10 Hounds", "1d10 Collapsed Constructs", "1d6 Tuskbeasts", "1d6 Tainted Carcasses",
      "1d4 Manglerbeasts", "1d4 Assault Crossbowmen", "1d4 Infected Patrol Captain", "Ursus Raider",
      "Hollow Snowpriest", "War Phantom"
    ]
  }]
]);

test("all four source tables have exact rows, formulas, contiguous ranges, and traceable headings", () => {
  assert.equal(AK5E_ROLL_TABLES.length, 4);
  assert.equal(AK5E_ROLL_TABLES.reduce((sum, table) => sum + table.results.length, 0), 37);

  for (const table of AK5E_ROLL_TABLES) {
    const spec = expected.get(table.id);
    assert.ok(spec, `unexpected table ${table.id}`);
    assert.equal(table.formula, spec.formula);
    assert.equal(table.sourceHeading, spec.heading);
    assert.equal(table.sourceLine, headingLine(sourceByFile.get(table.sourceFile), spec.heading));
    assert.equal(table.contentVersion, "0.3.8");
    assert.equal(table.replacement, true);
    assert.equal(table.displayRoll, true);
    assert.equal(table.results.length, spec.values.length);

    const offset = spec.formula === "2d10" ? 2 : 1;
    table.results.forEach((result, index) => {
      const roll = index + offset;
      assert.equal(result.type, "text");
      assert.equal(result.name, spec.values[index]);
      assert.equal(result.description, `<p class="ak5e-source-paragraph">${escapeHtml(spec.values[index])}</p>`);
      assert.deepEqual(result.range, [roll, roll]);
      assert.equal(result.weight, 1);
      assert.equal(result.drawn, false);
      assert.match(result._id, /^[a-f\d]{16}$/);
      assert.equal(result._id, deterministicResultId(table.id, roll));
    });

    assert.equal(new Set(table.results.map(result => result._id)).size, table.results.length);
    assert.match(table.rawSource, new RegExp(escapeRegExp(spec.heading)));
    assert.ok(table.rawSources.length >= 1);
    assert.ok(table.content.includes("<table") || table.content.includes("<p ") || table.content.includes("<h"));
    assert.doesNotMatch(table.content, /<table\b/, "Native results supply the catalogue; do not duplicate it in the description");
    assert.match(table.content, /^<div class="ak5e-roll-table-context"><p><strong>Manual workflow:/);
  }
  assert.ok(AK5E_ROLL_TABLES.find(table => table.id === "rolltable-double-blind-trial").results[0].name.includes("Neurologicial"));
});

test("source table parser rejects malformed headers and unexpected result rows", () => {
  const malformed = "##### Example\n| Roll | Name\n| --- | --- |\n| 1 | Result |";
  assert.throws(() => parseTable(malformed, 0, ["Result"], "1d1"), /Malformed table/);

  const changed = "##### Example\n| Roll | Name |\n| --- | --- |\n| 1 | Changed result |";
  assert.throws(() => parseTable(changed, 0, ["Expected result"], "1d1"), /Unexpected rows/);
});

test("Hole in the World keeps the source 2d10 sum table and manual summon guidance", () => {
  const table = AK5E_ROLL_TABLES.find(candidate => candidate.id === "rolltable-hole-in-the-world");
  assert.equal(table.formula, "2d10");
  assert.deepEqual(table.results.map(result => result.range), Array.from({ length: 19 }, (_, i) => [i + 2, i + 2]));
  assert.ok(table.rawSources.some(raw => raw.includes("summons the corresponding results to unoccupied spaces within 15 feet")));
  assert.match(table.description, /unoccupied spaces within 15 feet/);
  assert.match(table.description, /<strong>Manual workflow:<\/strong> This table displays the rolled result only\./);
  assert.equal(table.results.reduce((weight, result) => weight + result.weight, 0), 19);
});

test("Machine Personality retains its source setup instruction", () => {
  const table = AK5E_ROLL_TABLES.find(candidate => candidate.id === "rolltable-machine-personality");
  assert.ok(table.rawSources.some(raw => raw.includes("Basic Personality Matrix")));
  assert.match(table.description, /Short Rest Activity with a pre-existing custom Automaton/);
  assert.match(table.description, /<strong>Manual workflow:<\/strong> This table displays the rolled result only\./);
});

test("Tip of the Spear retains its shared duration and manual effect application text", () => {
  const table = AK5E_ROLL_TABLES.find(candidate => candidate.id === "rolltable-tip-of-the-spear");
  assert.match(table.description, /choose an allied Creature you can see within 60 feet/);
  assert.match(table.description, /until the start of your next Turn/);
  assert.match(table.description, /these effects are cumulative/);
  assert.ok(table.results.every(result => result.description.startsWith("<p class=")));
});

test("generator output is deterministic", async () => {
  const generatedPath = new URL("../scripts/roll-table-content.mjs", import.meta.url);
  const before = await readFile(generatedPath, "utf8");
  const generatorPath = new URL("../tools/build-roll-table-content.mjs", import.meta.url);
  for (let i = 0; i < 2; i += 1) {
    const run = spawnSync(process.execPath, [generatorPath.pathname], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(await readFile(generatedPath, "utf8"), before);
  }
});

test("RollTable data uses the installed V13 schema's current field names when available", async t => {
  const foundryRoot = process.env.AK5E_FOUNDRY_PATH || "/home/patch/FoundryV13";
  const foundryPath = `${foundryRoot}/common/documents`;
  try {
    await access(`${foundryPath}/roll-table.mjs`);
    await access(`${foundryPath}/table-result.mjs`);
  } catch {
    t.skip("Foundry installation not available; schema source check skipped.");
    return;
  }
  const [tableSchema, resultSchema] = await Promise.all([
    readFile(`${foundryPath}/roll-table.mjs`, "utf8"),
    readFile(`${foundryPath}/table-result.mjs`, "utf8")
  ]);
  for (const field of ["name", "description", "results", "formula", "replacement", "displayRoll"]) {
    assert.match(tableSchema, new RegExp(`${field}: new fields\\.`));
  }
  for (const field of ["type", "name", "description", "weight", "range", "drawn"]) {
    assert.match(resultSchema, new RegExp(`${field}: new fields\\.`));
  }
  assert.match(resultSchema, /documentUuid: new fields\.DocumentUUIDField/);
  for (const table of AK5E_ROLL_TABLES) {
    assert.deepEqual(Object.keys(table.results[0]).sort(), ["_id", "description", "drawn", "name", "range", "type", "weight"]);
    assert.ok(!("documentId" in table.results[0]));
    assert.ok(!("documentCollection" in table.results[0]));
  }
});

function headingLine(source, heading) {
  const match = new RegExp(`^(?:#{1,6})\\s+${escapeRegExp(heading)}\\s*$`, "m").exec(source);
  assert.ok(match, `missing source heading ${heading}`);
  return source.slice(0, match.index).split("\n").length;
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(value) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
