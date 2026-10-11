import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sourceToHtml } from "./source-html.mjs";
import { extractMonsterBlocks, parseMonsterStatblock } from "./monster-statblock.mjs";
import { sourceHeadings, splitSourceSections } from "./source-sections.mjs";
import { operatorSkillRecords } from "./operator-skill-content.mjs";
import { classOptionRecords, enrichExistingClassOption, stripStandaloneSkillTalentCatalogues } from "./class-option-content.mjs";

const sourceUrl = new URL("../../AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt", import.meta.url);
const outputUrl = new URL("../scripts/chapter-three-content.mjs", import.meta.url);
const baselineUrl = new URL("../test/fixtures/p0-chapter-three-baseline.json", import.meta.url);

const CLASS_NAMES = ["Caster", "Defender", "Guard", "Marksman", "Medic", "Specialist", "Supporter", "Vanguard"];
const NON_BRANCH_SECTIONS = new Set(["Class Features", "Actions", "Reactions", "Leaders of the Pack"]);

const source = (await readFile(sourceUrl, "utf8")).replace(/\r\n/g, "\n");
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"));
const baselineRecords = baseline.records ?? baseline.migrated ?? [];
const baselineById = new Map(baselineRecords.map(record => [record.id, record]));
const baselineIds = new Set(baseline.ids ?? baseline.records?.map(record => record.id) ?? []);
const classBoundaries = CLASS_NAMES.map(name => {
  const match = new RegExp(`^## ${escapeRegExp(name)}\\s*$`, "m").exec(source);
  if (!match) throw new Error(`Could not find the ${name} class heading.`);
  return { name, index: match.index };
});

const records = [];
records.push({
  id: "class-reference-overview",
  kind: "reference",
  name: "Chapter 3: Class Overview",
  parentClass: null,
  parentBranch: null,
  sourceHeading: "Chapter 3: Character Classes",
  itemType: null,
  level: null,
  systemData: {},
  content: toHtml(source.slice(0, classBoundaries[0].index)),
  rawSource: source.slice(0, classBoundaries[0].index).trim()
});
for (let index = 0; index < classBoundaries.length; index += 1) {
  const boundary = classBoundaries[index];
  const end = classBoundaries[index + 1]?.index ?? source.length;
  const classRaw = source.slice(boundary.index, end);
  const classRecord = {
    id: `class-${slugify(boundary.name)}`,
    kind: "class",
    name: boundary.name,
    parentClass: null,
    parentBranch: null,
    sourceHeading: boundary.name,
    itemType: "class",
    systemData: classSystemData(boundary.name, classRaw),
    content: toHtml(classRaw),
    rawSource: classRaw.trim()
  };
  records.push(classRecord);
  records.push(...extractClassSummons(classRaw, boundary.name));

  const h3Sections = splitSections(classRaw, 3);
  const classFeatures = h3Sections.find(section => section.name === "Class Features");
  if (!classFeatures) throw new Error(`${boundary.name} is missing its Class Features section.`);

  const baseFeatureSections = h3Sections.filter(section => ["Class Features", "Leaders of the Pack"].includes(section.name));
  for (const section of baseFeatureSections) {
    records.push(...extractFeatureRecords(section, boundary.name, null, "class-feature", baselineById));
  }

  const branches = h3Sections.filter(section => (
    section.index > classFeatures.index && !NON_BRANCH_SECTIONS.has(section.name)
  ));
  for (const branch of branches) {
    const branchRecord = {
      id: `subclass-${slugify(`${boundary.name}-${branch.name}`)}`,
      kind: "subclass",
      name: `${boundary.name}: ${branch.name}`,
      parentClass: boundary.name,
      parentBranch: null,
      sourceHeading: branch.name,
      itemType: "subclass",
      systemData: { identifier: slugify(branch.name), classIdentifier: slugify(boundary.name) },
      content: toHtml(branch.raw),
      rawSource: branch.raw.trim()
    };
    records.push(branchRecord);
    records.push(...extractFeatureRecords(branch, boundary.name, branch.name, "subclass-feature", baselineById));
  }
}

const optionRecords = classOptionRecords(source);
const reusableOptions = optionRecords.filter(option => option.existing);
const enrichedRecordIds = new Set();
for (const option of reusableOptions) {
  const candidates = records.filter(record => record.parentClass === option.parentClass
    && record.parentBranch === option.parentBranch
    && normalizeOptionName(record.sourceHeading ?? record.name) === normalizeOptionName(option.name));
  const match = candidates.find(record => record.rawSource?.trim() === option.optionRawSource?.trim())
    ?? candidates.find(record => !enrichedRecordIds.has(record.id));
  if (!match) throw new Error(`Could not match existing ${option.classOption.category} record ${option.parentClass}/${option.parentBranch ?? ""}/${option.name}.`);
  if (enrichedRecordIds.has(match.id)) throw new Error(`More than one source option matched existing record ${match.id}.`);
  enrichedRecordIds.add(match.id);
  const previous = baselineById.get(match.id);
  if (!previous) throw new Error(`Existing record ${match.id} is missing from the P0 baseline fixture.`);
  const enriched = enrichExistingClassOption(match, option, previous.content);
  Object.assign(match, enriched);
}
records.push(...optionRecords.filter(option => !option.existing));

if (records.filter(record => record.kind === "operator-skill").length !== 320) {
  throw new Error("P0 Chapter 3 generation must preserve the 320 existing Operator Skills.");
}
for (const id of baselineIds) {
  if (!records.some(record => record.id === id)) throw new Error(`P0 generation removed existing record ID ${id}.`);
}
if (baseline.operatorSkills) {
  const currentSkills = new Map(records.filter(record => record.kind === "operator-skill").map(record => [record.id, hash(JSON.stringify(record.operatorSkill))]));
  for (const previous of baseline.operatorSkills) {
    if (currentSkills.get(previous.id) !== previous.hash) throw new Error(`P0 generation changed Operator Skill data for ${previous.id}.`);
  }
}

assertUnique(records.map(record => record.id), "record IDs");
const output = [
  "/** This file is generated by tools/build-chapter-three-content.mjs. Do not edit by hand. */",
  `export const CHAPTER_THREE_CLASSES = ${JSON.stringify(records, null, 2)};`,
  ""
].join("\n");
await writeFile(outputUrl, output);

const counts = records.reduce((grouped, record) => {
  (grouped[record.kind] ??= []).push(record);
  return grouped;
}, {});
console.log(`Read ${fileURLToPath(sourceUrl)} and wrote ${records.length} records to ${fileURLToPath(outputUrl)}.`);
console.log(Object.entries(counts).map(([kind, entries]) => `${kind}: ${entries.length}`).join(", "));

function extractFeatureRecords(section, parentClass, parentBranch, kind, baselineById) {
  const h4 = splitSections(section.raw, 4).map(feature => featureRecord(feature, true));
  const h5 = splitSections(section.raw, 5).map(feature => featureRecord(feature, false));
  return [...h4, ...h5, ...splitSections(section.raw, 5).flatMap(table => operatorSkillRecords(table, parentClass, parentBranch))];

  function featureRecord(feature, stripCatalogues) {
    const prefix = parentBranch ? `${parentClass}-${parentBranch}` : parentClass;
    const id = `${kind}-${slugify(`${prefix}-${feature.name}`)}-${feature.index}`;
    const rawSource = stripCatalogues ? stripStandaloneSkillTalentCatalogues(feature.raw.trim()) : feature.raw.trim();
    const content = toHtml(rawSource);
    const previous = baselineById.get(id);
    const changedDescription = Boolean(previous && previous.content !== content);
    return {
      id,
      kind,
      name: `${parentBranch ? `${parentBranch}: ` : ""}${feature.name}`,
      parentClass,
      parentBranch,
      sourceHeading: feature.name,
      itemType: "feat",
      level: extractLevel(feature.name),
      systemData: {},
      content,
      rawSource,
      ...(changedDescription ? { contentVersion: "0.3.8", previousContentHash: createHash("sha256").update(previous.content, "utf8").digest("hex") } : {})
    };
  }
}

function normalizeOptionName(value) {
  return String(value).replace(/^.*:\s*/, "").replace(/\s*\([^)]*\)$/, "").trim().toLowerCase();
}

function hash(value) {
  return createHash("sha256").update(value ?? "", "utf8").digest("hex");
}

function splitSections(text, level) {
  return splitSourceSections(text, level);
}

function extractLevel(name) {
  const match = name.match(/(?:^|\s)(?:(\d+)(?:st|nd|rd|th)?\s+Level|Level\s+(\d+))/i);
  return match ? Number(match[1] ?? match[2]) : null;
}

function classSystemData(name, raw) {
  const die = raw.match(/^\*\*Hit Dice:\*\*\s*1d(\d+)/mi)?.[1] ?? "8";
  return {
    identifier: slugify(name),
    levels: 1,
    hd: { denomination: `d${die}`, spent: 0 }
  };
}

function extractClassSummons(classRaw, parentClass) {
  const h3 = sourceHeadings(classRaw, 3);
  return extractMonsterBlocks(classRaw).map(block => {
    const name = block.raw.match(/^##\s+(.+)$/m)?.[1]?.trim();
    if (!name) throw new Error(`A summon statblock under ${parentClass} has no name.`);
    const parentBranch = h3.filter(heading => heading.index < block.index).at(-1)?.name ?? null;
    return {
      id: `class-summon-${slugify(`${parentClass}-${parentBranch}-${name}`)}`,
      kind: "class-summon",
      name,
      parentClass,
      parentBranch,
      sourceHeading: name,
      itemType: null,
      level: null,
      systemData: {},
      statblock: parseMonsterStatblock(block.raw),
      content: toHtml(block.raw),
      rawSource: block.raw
    };
  });
}

function slugify(value) {
  return value.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toHtml(raw) {
  return sourceToHtml(raw);
}

function assertUnique(values, label) {
  const seen = new Set();
  const duplicate = values.find(value => seen.has(value) || !seen.add(value));
  if (duplicate) throw new Error(`Duplicate ${label} generated: ${duplicate}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
