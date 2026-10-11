import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { classOptionRecords } from "../tools/class-option-content.mjs";
import { stripStandaloneSkillTalentCatalogues } from "../tools/class-option-content.mjs";

const baseline = JSON.parse(await readFile(new URL("./fixtures/p0-chapter-three-baseline.json", import.meta.url), "utf8"));
const source = (await readFile(new URL("../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const sourceLines = source.split("\n");
const byId = new Map(CHAPTER_THREE_CLASSES.map(record => [record.id, record]));
const categoryCount = records => records.reduce((counts, record) => {
  counts[record.classOption.category] = (counts[record.classOption.category] ?? 0) + 1;
  return counts;
}, {});
const sha256 = value => createHash("sha256").update(value ?? "", "utf8").digest("hex");

test("shared introductions stop before option catalogues and neighbouring branches", () => {
  const records = classOptionRecords(source);
  for (const record of records.filter(record => record.classOption.category === "technique")) {
    assert.doesNotMatch(record.ruleContext, /### Centurion|\*\*Cross Counter|\*\*Chokehold|\*\*Body Check/);
    assert.match(record.ruleContext, /All Brawling Techniques are considered to be applications/);
    assert.doesNotMatch(record.content, /<strong><em><em>|<\/strong><\/em>/);
  }
  for (const record of records.filter(record => ["engagement", "instruction"].includes(record.classOption.category))) {
    assert.match(record.ruleContext, /listed in alphabetical order/);
    assert.doesNotMatch(record.ruleContext, /\*\*Balestra|\*\*Focus!|\*\*Defend Yourself!/);
  }
  for (const record of records.filter(record => record.classOption.category === "modification")) {
    assert.match(record.ruleContext, /Dangerous Modifications increase Instability by 1 more than usual/);
    assert.match(record.ruleContext, /If it is a weapon, it cannot be used; if it is armour, it provides no benefits/);
  }
});

test("all pre-P0 records and Operator Skill definitions remain stable", () => {
  assert.equal(baseline.ids.length, 1106);
  for (const id of baseline.ids) assert.ok(byId.has(id), `missing prior record ${id}`);
  const skills = CHAPTER_THREE_CLASSES.filter(record => record.kind === "operator-skill");
  assert.equal(skills.length, 320);
  const hashes = new Map(skills.map(record => [record.id, sha256(JSON.stringify(record.operatorSkill))]));
  assert.equal(baseline.operatorSkills.length, 320);
  for (const prior of baseline.operatorSkills) assert.equal(hashes.get(prior.id), prior.hash, `operator skill changed: ${prior.id}`);
});

test("individual Chapter 3 class options are complete and descriptive only", () => {
  const options = CHAPTER_THREE_CLASSES.filter(record => record.kind === "class-option");
  assert.equal(options.length, 350);
  assert.deepEqual(categoryCount(options), { talent: 289, technique: 15, engagement: 9, instruction: 10, ritual: 27 });
  assert.equal(new Set(options.map(record => record.id)).size, options.length);

  for (const record of options) {
    assert.equal(record.itemType, "feat");
    assert.deepEqual(record.systemData, {});
    assert.ok(record.parentClass);
    assert.equal(record.sourceFile, "03_chapter_3_character_classes.txt");
    assert.ok(Number.isInteger(record.sourceLine) && record.sourceLine > 0);
    assert.ok(record.sourceHeading);
    assert.ok(record.rawSource && record.rawSources.length >= 1);
    assert.ok(record.rawSources.every(fragment => source.includes(fragment)), `${record.id} has non-exact provenance`);
    assert.ok(record.ruleContext, `${record.id} needs its granting or usage context`);
    assert.match(record.content, /<h3>Rule context<\/h3>/);
    assert.equal(record.contentVersion, "0.3.8");
    assert.equal(record.previousContentHash, undefined);
  }

  const talents = options.filter(record => record.classOption.category === "talent");
  assert.equal(talents.filter(record => record.classOption.tier === "Basic").length, 129);
  assert.equal(talents.filter(record => record.classOption.tier === "Advanced").length, 160);
  for (const record of talents) {
    assert.equal(record.parentBranch, null);
    assert.ok(record.classOption.effect);
    assert.ok(record.classOption.moduleEffect);
    assert.ok(record.sourceRow);
    assert.equal(record.rawSource, record.sourceRow);
    assert.equal(sourceLines[record.sourceLine - 1], record.sourceRow);
    assert.match(record.content, /Module Effect/);
  }

  const techniques = options.filter(record => record.classOption.category === "technique");
  assert.equal(techniques.filter(record => record.classOption.tier === "Basic").length, 8);
  assert.equal(techniques.filter(record => record.classOption.tier === "Advanced").length, 7);
  assert.ok(techniques.every(record => record.parentClass === "Guard" && record.parentBranch === "Brawler" && /^\d+ Aggression$/.test(record.classOption.cost)));
  assert.ok(techniques.every(record => /Press the Attack/.test(record.ruleContext)));
  assert.ok(techniques.filter(record => record.classOption.tier === "Advanced").every(record => /Master Brawler/.test(record.ruleContext)));

  const engagements = options.filter(record => record.classOption.category === "engagement");
  assert.equal(engagements.length, 9);
  assert.ok(engagements.every(record => record.parentBranch === "Duellist" && record.classOption.cost));
  const instructions = options.filter(record => record.classOption.category === "instruction");
  assert.equal(instructions.length, 10);
  assert.ok(instructions.every(record => record.parentBranch === "Instructor" && /Instruction Dice/.test(record.ruleContext)));
  assert.ok(instructions.every(record => /Kingmaker/.test(record.ruleContext) && /d6/.test(record.ruleContext)));

  const rituals = options.filter(record => record.classOption.category === "ritual");
  assert.equal(rituals.filter(record => record.classOption.ritualType === "Ephemeral").length, 12);
  assert.equal(rituals.filter(record => record.classOption.ritualType === "Permanent").length, 15);
  assert.ok(rituals.every(record => record.parentBranch === "Ritualist" && /Essence/.test(record.ruleContext)));
  assert.ok(rituals.filter(record => record.classOption.ritualType === "Permanent").every(record => Number.isInteger(record.classOption.essenceCost)));
  assert.ok(rituals.every(record => record.sourceRow && record.rawSource === record.sourceRow));
  assert.ok(rituals.every(record => /Criteria once per Short or Long Rest/.test(record.ruleContext)));
  assert.ok(rituals.every(record => /10 minute Ritual/.test(record.ruleContext)));
  assert.ok(rituals.filter(record => record.classOption.ritualType === "Permanent").every(record => record.rawSources.some(raw => /Ritual Name\s+\| Essence Cost\s+\| Ritual Benefits/.test(raw))));
  assert.ok(rituals.filter(record => record.classOption.ritualType === "Ephemeral").every(record => record.rawSources.some(raw => /Ritual Name\s+\| Ritual Benefits/.test(raw))));
});

test("existing individual therapies, modifications, upgrades, and tactics are enriched in place", () => {
  const reused = CHAPTER_THREE_CLASSES.filter(record => record.classOption && record.kind !== "class-option");
  assert.deepEqual(categoryCount(reused), { therapy: 9, modification: 28, upgrade: 21, tactic: 10 });
  for (const record of reused) {
    assert.ok(baseline.ids.includes(record.id));
    assert.equal(record.contentVersion, "0.3.8");
    assert.equal(record.previousContentHash, sha256(baseline.migrated.find(old => old.id === record.id)?.content));
    assert.ok(record.ruleContext);
    assert.ok(record.rawSources.some(fragment => record.ruleContext.includes(fragment)));
    assert.match(record.content, /<h3>Rule context<\/h3>/);
    assert.ok(record.rawSources.every(fragment => source.includes(fragment)), `${record.id} has non-exact provenance`);
  }
  const therapies = reused.filter(record => record.classOption.category === "therapy");
  assert.ok(therapies.every(record => /one Therapy option on an Art/.test(record.ruleContext)));
  assert.ok(therapies.every(record => /Advanced Therapy/.test(record.ruleContext)));
  const modifications = reused.filter(record => record.classOption.category === "modification");
  assert.ok(modifications.every(record => /Inventor DC/.test(record.ruleContext)));
  const upgrades = reused.filter(record => record.classOption.category === "upgrade");
  assert.ok(upgrades.every(record => /Artificer DC/.test(record.ruleContext)));
  const tactics = reused.filter(record => record.classOption.category === "tactic");
  assert.ok(tactics.every(record => /Cantrip/.test(record.ruleContext) && /Dazed/.test(record.ruleContext)));
  assert.ok(tactics.filter(record => record.classOption.tier === "Advanced").every(record => /Tactical Expansion/.test(record.ruleContext)));
  assert.equal(reused.some(record => record.kind === "class-option"), false);
});

test("catalogue removal keeps real subordinate feature sections and tables", () => {
  const original = [
    "#### 20th Level: Example",
    "Feature opening text.",
    "##### Defensive Procedure",
    "Preserve this subordinate rule.",
    "##### Basic Example Talents",
    "| Name | Effect | Module Effect |",
    "| --- | --- | --- |",
    "| Sample | One | Two |",
    "##### Recovery Procedure",
    "Preserve this table and rule.",
    "| Step | Result |",
    "| --- | --- |",
    "| One | Done |"
  ].join("\n");
  const result = stripStandaloneSkillTalentCatalogues(original);
  assert.match(result, /##### Defensive Procedure/);
  assert.match(result, /Preserve this subordinate rule/);
  assert.doesNotMatch(result, /Basic Example Talents|\| Sample \|/);
  assert.match(result, /##### Recovery Procedure/);
  assert.match(result, /\| Step \| Result \|/);
  assert.match(result, /\| One \| Done \|/);
});

test("only the nine old feature descriptions that absorbed catalogs are migrated", () => {
  const migrations = CHAPTER_THREE_CLASSES.filter(record => record.previousContentHash);
  const catalogCorrections = migrations.filter(record => !record.classOption);
  assert.equal(catalogCorrections.length, 9);
  assert.ok(catalogCorrections.every(record => record.contentVersion === "0.3.8"));
  assert.deepEqual(catalogCorrections.map(record => record.id).sort(), [
    "class-feature-caster-20th-level-doublecast-5298",
    "class-feature-defender-20th-level-adamantine-defence-7964",
    "class-feature-guard-20th-level-annihilation-protocol-10373",
    "subclass-feature-guard-liberator-17th-level-revolution-5283",
    "class-feature-marksman-20th-level-steel-rain-8300",
    "class-feature-medic-20th-level-chosen-of-asclepius-7904",
    "class-feature-specialist-18th-level-weapon-mastery-10086",
    "class-feature-supporter-20th-level-will-into-being-6864",
    "class-feature-vanguard-20th-level-approaching-storm-6548"
  ].sort());
  for (const record of catalogCorrections) {
    const old = baseline.migrated.find(candidate => candidate.id === record.id);
    assert.ok(/(?:(?:Basic|Advanced|Elite) .+|.+ (?:Basic|Advanced|Elite)) (?:Skills|Talents)/.test(old.rawSource));
    assert.ok(!/##### (?=.*\b(?:Basic|Advanced|Elite)\b)(?=.*\b(?:Skills|Talents)\b)/.test(record.rawSource));
  }
  const aggregate = CHAPTER_THREE_CLASSES.find(record => record.kind === "class-feature" && record.sourceHeading === "Basic Caster Talents");
  assert.match(aggregate.content, /Alacrity/);
  assert.match(aggregate.content, /Module Effect/);
});
