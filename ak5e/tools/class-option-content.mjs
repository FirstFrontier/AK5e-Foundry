import { createHash } from "node:crypto";
import { sourceToHtml } from "./source-html.mjs";

const SOURCE_FILE = "03_chapter_3_character_classes.txt";
const CLASS_NAMES = ["Caster", "Defender", "Guard", "Marksman", "Medic", "Specialist", "Supporter", "Vanguard"];
const slug = value => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Extract option rows and paragraphs without assigning them mechanical automation. */
export function classOptionRecords(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const lineStarts = [];
  let offset = 0;
  for (const line of lines) { lineStarts.push(offset); offset += line.length + 1; }
  const headings = lines.map((line, index) => {
    const match = line.match(/^(#{2,5})\s+(.+?)\s*$/);
    return match ? { level: match[1].length, name: match[2].trim(), line: index + 1, index, offset: lineStarts[index] } : null;
  }).filter(Boolean);
  const records = [];
  let currentClass = null;
  let currentBranch = null;
  for (const heading of headings) {
    if (heading.level === 2 && CLASS_NAMES.includes(heading.name.trim())) {
      currentClass = heading.name.trim();
      currentBranch = null;
    } else if (heading.level === 3 && currentClass && !["Class Features", "Actions", "Reactions", "Leaders of the Pack"].includes(heading.name)) {
      currentBranch = heading.name;
    } else if (heading.level === 3) currentBranch = null;
    heading.parentClass = currentClass;
    heading.parentBranch = currentBranch;
  }

  for (let hi = 0; hi < headings.length; hi += 1) {
    const heading = headings[hi];
    if (!heading.parentClass) continue;
    const next = headings.slice(hi + 1).find(candidate => candidate.level <= heading.level);
    const endOffset = next?.offset ?? source.length;
    const body = source.slice(heading.offset, endOffset);
    const endLine = next?.line ?? lines.length + 1;
    if (heading.level === 5 && /^(Basic|Advanced)\s+.+\s+Talents(?: Continued)?$/.test(heading.name)) {
      const tier = heading.name.startsWith("Basic") ? "Basic" : "Advanced";
      const tableRows = lines.slice(heading.index + 1, (next?.index ?? lines.length));
      const tableLine = tableRows.findIndex(line => /^\|\s*Name\s*\|\s*Effect\s*\|\s*Module Effect\s*\|/.test(line));
      if (tableLine < 0) continue;
      for (let ri = tableLine + 2; ri < tableRows.length; ri += 1) {
        const rawRow = tableRows[ri];
        if (!rawRow.trim().startsWith("|")) break;
        const cells = splitCells(rawRow);
        if (cells.length < 3 || !cells[0]) throw new Error(`Invalid talent row at ${heading.parentClass}:${heading.line + tableLine + ri - tableLine + 1}`);
        const tableHeader = tableRows[tableLine];
        const tableSeparator = tableRows[tableLine + 1];
        const raw = rawRow;
        const optionLine = heading.index + ri + 2;
        const context = classContext(source, heading.parentClass, tier === "Basic" ? "Basic Talent" : "Advanced Talent");
        records.push(makeRecord({ className: heading.parentClass, branch: null, category: "talent", tier,
          name: cells[0], effect: cells[1], moduleEffect: cells[2], raw, line: optionLine, heading: heading.name,
          context, sourceLine: heading.line, tableHeader, tableSeparator, tableRow: rawRow }));
      }
      continue;
    }

    const category = paragraphCategory(heading, body);
    if (!category) continue;
    if (["therapy", "tactic", "modification", "upgrade"].includes(category.category)) {
      for (const child of parseChildOptions(body, heading, category)) {
        const context = optionContext(source, heading.parentClass, heading.parentBranch, category.category, category.tier, category.ritualType);
        records.push({ ...makeRecord({ className: heading.parentClass, branch: heading.parentBranch, category: category.category, target: category.target,
          tier: category.tier, name: child.name, cost: child.cost, effect: child.effect, raw: child.raw,
          line: child.line, heading: child.name, context, sourceLine: child.line }), existing: true });
      }
      continue;
    }
    if (category.table) {
      const tableLines = body.split("\n");
      let columns = [];
      let tableHeader = "";
      let tableSeparator = "";
      for (let ri = 0; ri < tableLines.length; ri += 1) {
        const rawRow = tableLines[ri];
        if (!rawRow.trim().startsWith("|")) continue;
        const cells = splitCells(rawRow);
        if (columns.length === 0) { columns = cells; tableHeader = rawRow; continue; }
        if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) { tableSeparator = rawRow; continue; }
        const value = Object.fromEntries(columns.map((column, ci) => [column.toLowerCase().replace(/[^a-z]/g, ""), cells[ci] ?? ""]));
        const name = value["ritualname"] ?? value.name;
        if (!name) continue;
        const raw = rawRow;
        const context = optionContext(source, heading.parentClass, heading.parentBranch, category.category, category.tier, category.ritualType);
        records.push(makeRecord({ className: heading.parentClass, branch: heading.parentBranch, category: category.category, target: category.target,
          tier: category.tier, name, effect: value["ritualbenefits"] ?? value.effect, essenceCost: value["essencecost"] ? Number(value["essencecost"]) : undefined,
          ritualType: category.ritualType, raw, line: heading.line + ri, heading: heading.name, context, sourceLine: heading.line,
          tableHeader, tableSeparator, tableRow: rawRow }));
      }
      continue;
    }
    const options = parseBoldOptions(body, heading, lines);
    for (const option of options) {
      const context = optionContext(source, heading.parentClass, heading.parentBranch, category.category, category.tier);
      records.push(makeRecord({ className: heading.parentClass, branch: heading.parentBranch, category: category.category, target: category.target,
        tier: category.tier, name: option.name, cost: option.cost, effect: option.effect, raw: option.raw,
        line: option.line, heading: heading.name, context, sourceLine: heading.line }));
    }
  }
  return records;
}

export function stripStandaloneSkillTalentCatalogues(raw) {
  const matches = [...raw.matchAll(/^##### (?=.*\b(?:Basic|Advanced|Elite)\b)(?=.*\b(?:Skills|Talents)\b).+$/gm)];
  if (!matches.length) return raw;
  const ranges = matches.map(match => {
    const end = raw.slice(match.index + match[0].length).search(/^#{1,5} /m);
    return { start: match.index, end: end < 0 ? raw.length : match.index + match[0].length + end };
  });
  return ranges.reduceRight((value, range) => `${value.slice(0, range.start)}${value.slice(range.end)}`, raw).trim();
}

// Homebrewery's four-star labels must not create crossed strong/em tags in
// native HTML fields. Retained rawSources remain byte-exact source quotations.
function optionToHtml(raw) {
  return sourceToHtml(raw.replace(/\*{4}([^*\n]+)\*{4}/g, "**$1**"));
}

export function enrichExistingClassOption(record, option, previousContent) {
  const contextSources = option.contextSources ?? (option.ruleContext ? [option.ruleContext] : []);
  const context = contextSources.join("\n\n");
  const content = context ? `${record.content}\n<h3>Rule context</h3>\n${optionToHtml(context)}` : record.content;
  const changedDescription = content !== record.content;
  return {
    ...record,
    ...(changedDescription ? { content, contentVersion: "0.3.8", previousContentHash: sha256(previousContent) } : {}),
    sourceFile: SOURCE_FILE,
    sourceLine: option.sourceLine,
    rawSources: [record.rawSource, ...contextSources].filter(Boolean),
    classOption: option.classOption,
    ruleContext: context
  };
}

function makeRecord({ className, branch, category, target, tier, name, cost, effect, moduleEffect, essenceCost, ritualType, raw, line, heading, context, sourceLine, tableHeader, tableSeparator, tableRow }) {
  const classOption = Object.fromEntries(Object.entries({ category, target, tier, cost, effect, moduleEffect, ritualType, essenceCost }).filter(([, value]) => value !== undefined));
  const contextSources = Array.isArray(context) ? context : context ? [context] : [];
  const ruleContext = contextSources.join("\n\n");
  const rawSources = [raw, ...(tableRow ? [tableHeader, tableSeparator] : []), ...contextSources].filter(Boolean);
  const rawSource = raw;
  const visible = tableRow ? `${heading}\n\n${tableHeader}\n${tableSeparator}\n${tableRow}` : raw;
  const content = `${optionToHtml(visible)}${ruleContext ? `\n<h3>Rule context</h3>\n${optionToHtml(ruleContext)}` : ""}`;
  const id = `class-option-${slug([className, branch, category, tier, name].filter(Boolean).join("-"))}`;
  return { id, kind: "class-option", name, parentClass: className, parentBranch: branch ?? null, sourceHeading: heading,
    sourceFile: SOURCE_FILE, sourceLine: line, line, sourceHeadingLine: sourceLine, itemType: "feat", level: null,
    systemData: {}, classOption, ruleContext, contentVersion: "0.3.8", content,
    rawSource, rawSources, contextSources, optionRawSource: raw, ...(tableRow ? { sourceRow: tableRow } : {}) };
}

function paragraphCategory(heading, body) {
  const name = heading.name;
  if (/^(Basic|Advanced) Brawling Techniques$/.test(name)) return { category: "technique", tier: name.startsWith("Basic") ? "Basic" : "Advanced" };
  if (name === "Engagements") return { category: "engagement" };
  if (name === "Instruction Options") return { category: "instruction" };
  if (name === "Ephemeral Rituals" || name === "Permanent Rituals") return { category: "ritual", ritualType: name.startsWith("Ephemeral") ? "Ephemeral" : "Permanent", table: true };
  if (/^Basic Therapies$/.test(name)) return { category: "therapy", tier: "Basic" };
  if (/^Advanced Therapies$/.test(name)) return { category: "therapy", tier: "Advanced" };
  if (/^Basic Tactics$/.test(name)) return { category: "tactic", tier: "Basic" };
  if (/^Advanced Tactics$/.test(name)) return { category: "tactic", tier: "Advanced" };
  if (/^(Melee Weapon|Ranged Weapon|Armour) Modifications$/.test(name)) return { category: "modification", target: name.replace(/ Modifications$/, "") };
  if (/^(Automaton|Mobile Cover)$/.test(name) && heading.parentBranch === "Artificer") return { category: "upgrade", target: name };
  return null;
}

function parseChildOptions(body, heading, category) {
  const baseLine = heading.line;
  const lines = body.split("\n");
  const children = [];
  for (let index = 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^#####\s+(.+?)\s*$/);
    if (!match) continue;
    const next = lines.findIndex((line, candidateIndex) => candidateIndex > index && /^#{1,5}\s+/.test(line));
    const raw = lines.slice(index, next < 0 ? lines.length : next).join("\n").trim();
    const name = match[1].trim();
    if (name === "Tactics for Casters" || name === "Artificer DC" || name === "Dangerous Modifications") continue;
    const cost = raw.match(/\*\*Life Support Cost:\*\*\s*([^<\n]+)/)?.[1]?.trim()
      ?? name.match(/\((\d+\s+Acumen)\)/)?.[1];
    const strippedName = name.replace(/\s*\([^)]*\)$/, "");
    children.push({ name: strippedName, cost, raw, effect: raw, line: baseLine + index });
  }
  return children;
}

function parseBoldOptions(body, heading, lines) {
  const contentStart = body.indexOf("\n") + 1;
  const sectionLines = body.slice(contentStart).split("\n");
  const bold = [];
  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    const match = line.match(/^\s*\*\*([^*]+)\*\*(?:\s*<br\s*\/?>)?\s*(.*)$/i);
    if (!match) continue;
    const parsed = parseNameCost(match[1].trim());
    if (!parsed) continue;
    bold.push({ index, label: match[1].trim(), name: parsed.name, cost: parsed.cost, suffix: match[2] });
  }
  return bold.map((item, index) => {
    const nextIndex = bold[index + 1]?.index ?? sectionLines.length;
    const rawLines = sectionLines.slice(item.index, nextIndex);
    while (rawLines.length && !rawLines.at(-1).trim()) rawLines.pop();
    const raw = rawLines.join("\n").trim();
    const effect = [item.suffix, ...rawLines.slice(1)].join("\n").replace(/^\s*:\s*$/gm, "\n").trim();
    return { name: item.name, cost: item.cost, raw, effect, line: heading.line + 1 + item.index };
  });
}

function parseNameCost(value) {
  const match = value.match(/^(.+?)\s+\((\d+\s+[^)]+)\)\.?$/);
  return { name: (match?.[1] ?? value).trim(), ...(match ? { cost: match[2] } : {}) };
}

function classContext(source, className, featureHint) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classMatch = new RegExp(`^## ${escaped}\\s*$`, "m").exec(source);
  if (!classMatch) return "";
  const tail = source.slice(classMatch.index);
  const end = tail.slice(1).search(/^## /m);
  const classRaw = end < 0 ? tail : tail.slice(0, end + 1);
  const headingPattern = featureHint === "Basic Talent" ? /^#### 3rd Level: (?:Basic )?(?:Vanguard )?Talent\s*$/m : /^#### 9th Level: Advanced Talent\s*$/m;
  const match = headingPattern.exec(classRaw);
  if (!match) return "";
  const rest = classRaw.slice(match.index);
  const following = rest.slice(match[0].length).search(/^#### /m);
  return rest.slice(0, following < 0 ? rest.length : match[0].length + following).trim();
}

function optionContext(source, className, branch, category, tier, ritualType) {
  const all = source.replace(/\r\n/g, "\n");
  const classRaw = classSection(all, className);
  if (!classRaw) return [];
  const branchRaw = branch ? classSection(classRaw, branch, "###") : classRaw;
  const section = (text, heading, level = 4) => exactHeadingBlock(text, heading, level);
  const intro = (text, heading, level = 4) => exactHeadingIntro(text, heading, level);
  switch (category) {
    case "technique":
      return [section(classRaw, "1st Level: Press the Attack"),
        section(branchRaw, tier === "Advanced" ? "10th Level: No Ordinary Pugilist" : "1st Level: Martial Artist"),
        ...(tier === "Advanced" ? [intro(classRaw, "Basic Brawling Techniques").split("\n").slice(1).join("\n").trim()] : []),
        intro(classRaw, `${tier} Brawling Techniques`)].filter(Boolean);
    case "engagement":
      return [section(branchRaw, "1st Level: Singular Foe"), intro(branchRaw, "Engagements")].filter(Boolean);
    case "instruction":
      return [section(branchRaw, "1st Level: Instruction"), section(branchRaw, "10th Level: Kingmaker"),
        section(branchRaw, "13th Level: Superior Instruction"), intro(branchRaw, "Instruction Options")].filter(Boolean);
    case "ritual":
      return [section(branchRaw, "1st Level: The Essence of Ritual"),
        exactTableHeader(branchRaw, ritualType === "Permanent" ? "Permanent Rituals" : "Ephemeral Rituals")].filter(Boolean);
    case "therapy":
      return [section(branchRaw, "1st Level: Basic Therapy"), section(branchRaw, "4th Level: The Doctor Is In"),
        section(branchRaw, "11th Level: Advanced Therapy")].filter(Boolean);
    case "modification":
      return [section(branchRaw, "1st Level: Equipment Modification"), exactNoteBlock(branchRaw, "Inventor DC"),
        exactNoteBlock(branchRaw, "Dangerous Modifications")].filter(Boolean);
    case "upgrade":
      return [section(branchRaw, "4th Level: Heavy Duty Upgrades"), exactNoteBlock(branchRaw, "Artificer DC")].filter(Boolean);
    case "tactic": {
      const contexts = [section(branchRaw, "1st Level: Tactical Knowledge")];
      if (tier === "Advanced") contexts.push(section(branchRaw, "13th Level: Master Tactician"));
      contexts.push(exactNoteBlock(branchRaw, "Tactics for Casters"));
      return contexts.filter(Boolean);
    }
    default:
      return [];
  }
}

function classSection(source, name, prefix = "##") {
  const escaped = name;
  const match = new RegExp(`^${prefix} ${escaped}\\s*$`, "m").exec(source);
  if (!match) return "";
  const rest = source.slice(match.index);
  const next = rest.slice(match[0].length).search(new RegExp(`^#{1,${prefix.length}} `, "m"));
  return rest.slice(0, next < 0 ? rest.length : match[0].length + next).trim();
}

function exactHeadingBlock(source, heading, level = 4) {
  const escaped = heading;
  const match = new RegExp(`^#{${level}} ${escaped}\\s*$`, "m").exec(source);
  if (!match) return "";
  const rest = source.slice(match.index);
  const next = rest.slice(match[0].length).search(/^#### /m);
  return rest.slice(0, next < 0 ? rest.length : match[0].length + next).trim();
}

function exactHeadingIntro(source, heading, level = 4) {
  const escaped = heading;
  const match = new RegExp(`^#{${level}} ${escaped}\\s*$`, "m").exec(source);
  if (!match) return "";
  const rest = source.slice(match.index);
  const next = rest.slice(match[0].length).search(/^(?:#{1,6}[ \t]+|[ \t]*\*\*[^*]+\*\*)/m);
  return rest.slice(0, next < 0 ? rest.length : match[0].length + next).trim();
}

function exactTableHeader(source, heading) {
  const start = new RegExp(`^##### ${heading}\\s*$`, "m").exec(source);
  if (!start) return "";
  const rest = source.slice(start.index);
  const lines = rest.split("\n");
  let lastHeaderLine = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^\|/.test(lines[index]) && /^\|\s*:?-+:?/.test(lines[index + 1] ?? "")) {
      lastHeaderLine = index + 1;
      break;
    }
  }
  return lastHeaderLine < 0 ? lines[0] : lines.slice(0, lastHeaderLine + 1).join("\n").trim();
}

function exactNoteBlock(source, heading) {
  const escaped = heading;
  const match = new RegExp(`^##### ${escaped}\\s*$`, "m").exec(source);
  if (!match) return "";
  const start = source.lastIndexOf("{{note", match.index);
  const close = source.indexOf("}}", match.index);
  return start < 0 || close < 0 ? "" : source.slice(start, close + 2).trim();
}

function splitCells(line) { return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(value => value.trim()); }
function sha256(value) { return createHash("sha256").update(value ?? "", "utf8").digest("hex"); }
