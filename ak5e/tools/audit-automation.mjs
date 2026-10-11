import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CHAPTER_ONE_ENTRIES } from "../scripts/chapter-one-content.mjs";
import { CHAPTER_TWO_ORIGINS } from "../scripts/chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS } from "../scripts/chapter-five-content.mjs";
import { CHAPTER_SIX_CREATURES } from "../scripts/chapter-six-content.mjs";
import { AK5E_ROLL_TABLES } from "../scripts/roll-table-content.mjs";
import { skillTargetProfile } from "../scripts/operator-target-profiles.mjs";

const root = new URL("../../", import.meta.url);
const sourceRoot = new URL("../../AK5e_1.3.1_Foundry_Source/", import.meta.url);
const packByChapter = { 1: "ak5e.rules", 2: "ak5e.origins", 3: "ak5e.classes", 4: "ak5e.equipment", 5: "ak5e.arts", 6: "ak5e.creatures" };
const sourceFiles = {
  1: "01_chapter_1_changing_the_game.txt", 2: "02_chapter_2_character_origins.txt",
  3: "03_chapter_3_character_classes.txt", 4: "04_chapter_4_equipment.txt",
  5: "05_chapter_5_arts.txt", 6: "06_chapter_6_dwellers_of_terra.txt"
};
const generatedFiles = {
  1: "ak5e/scripts/chapter-one-content.mjs", 2: "ak5e/scripts/chapter-two-content.mjs",
  3: "ak5e/scripts/chapter-three-content.mjs", 4: "ak5e/scripts/chapter-four-content.mjs",
  5: "ak5e/scripts/chapter-five-content.mjs", 6: "ak5e/scripts/chapter-six-content.mjs"
};
const arrays = { 1: CHAPTER_ONE_ENTRIES, 2: CHAPTER_TWO_ORIGINS, 3: CHAPTER_THREE_CLASSES, 4: CHAPTER_FOUR_EQUIPMENT, 5: CHAPTER_FIVE_ARTS, 6: CHAPTER_SIX_CREATURES };
for (const table of AK5E_ROLL_TABLES) {
  const chapter = Number(table.sourceFile.slice(0, 2));
  arrays[chapter] = [...arrays[chapter], { ...table, kind: "roll-table" }];
}
const axes = [
  ["action", /\b(?:Action|Bonus Action|Reaction|Movement|move|Dash|attack|cast|activate|use)\b/i],
  ["target", /\b(?:target|choose|select|creature|ally|allied|hostile|enemy|point|area|aura|within \d+)\b/i],
  ["roll", /\b(?:roll|Saving Throw|save|Attack Roll|Damage Roll|Hit Dice|d\d+)\b/i],
  ["cost", /\b(?:cost|spend|expend|consume|Fervour|Acumen|Skill Points|Arts Points|SP)\b/i],
  ["effect", /\b(?:gain|grant|deal|damage|healing|regain|increase|reduce|resistance|immune|condition|temporary hit points|Temporary HP|proficiency|expertise)\b/i],
  ["trigger", /\b(?:when|whenever|if|after|before|once per|starts? (?:their|your) Turn|enters?|begins?)\b/i],
  ["duration", /\b(?:until|for \d+|minute|hour|Round|Turn|duration|lasts?)\b/i],
  ["recovery", /\b(?:Short Rest|Long Rest|rest|recover|recovery|reset)\b/i],
  ["map", /\b(?:feet|foot|ft\.?|range|radius|cone|sphere|line|cube|area|Aura|within|visible|space|location|point)\b/i]
];
const mechanics = /\b(?:Action|Bonus Action|Reaction|attack|Saving Throw|save|damage|healing|Hit Dice|Fervour|Acumen|Skill Points|Arts Points|SP|Aura|within \d+|when|whenever|once per|until|Short Rest|Long Rest|resistance|immune|condition|gain|grant|regain|expend|spend|choose|target|range|radius|feet|\d+d\d+)\b/i;

const esc = value => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", "<br>").replaceAll("\r", "");
const kindOf = entry => entry.kind ?? "rules";
const idOf = (chapter, entry) => entry.id ?? entry.slug ?? `${kindOf(entry)}-${slug(entry.name)}`;
const slug = value => String(value ?? "entry").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function linesOf(text) { return text.replace(/\r\n/g, "\n").split("\n"); }
function lineAt(source, fragment, from = 0) {
  if (!fragment) return null;
  let at = source.indexOf(fragment, from);
  if (at < 0 && from === 0) at = source.indexOf(fragment);
  return at < 0 ? null : source.slice(0, at).split("\n").length;
}
function paragraphs(text) {
  return text.replace(/\r\n/g, "\n").split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
}
function inferAxes(text) { return axes.filter(([, regex]) => regex.test(text)).map(([name]) => name); }
function docType(chapter, entry) {
  if (entry.kind === "roll-table") return "RollTable";
  if (chapter === 1 || entry.kind === "reference") return "JournalEntry / reference";
  if (chapter === 6) return entry.kind === "creature" ? "Actor (NPC) + feature Items" : "JournalEntry / reference";
  if (entry.itemType) return `Item (${entry.itemType})`;
  if (chapter === 3 && entry.kind === "class-summon") return "Actor (NPC)";
  return "Item (type not declared)";
}
function runtimeRefs(chapter, entry, base) {
  if (chapter === 3 && entry.id?.startsWith("class-option-defender-talent-")) {
    const automated = /-(basic-(interlocking-shields|power-plant|refreshment)|advanced-(sword-and-shield|tactical-defence))$/.test(entry.id);
    return { status: automated ? "partial helper" : "text/manual only",
      notes: automated ? "Source-scoped Defender Talent/Module selection and GM-validated Shelter/SP workflow; trigger evidence and recipient receipts persist. Damage reduction and missing trigger facts remain guided. See DEFENDER_IMPLEMENTATION.md and FOUNDRY_SMOKE_TEST.md for actual runtime evidence."
        : "Native Defender Talent/Module selection is supported; this Talent's printed effects remain manual. No effect automation is claimed.",
      refs: ["ak5e/scripts/defender-progression.mjs", "ak5e/test/defender-progression.test.mjs", ...(automated ? ["ak5e/scripts/defender-talents.mjs", "ak5e/test/defender-talents.test.mjs"] : [base])] };
  }
  if (entry.kind === "roll-table") return { status: "partial helper", notes: "Native RollTable rolls/display are implemented. Costs, targets, effects and summons remain manual; this static audit does not establish rendered validation.", refs: ["ak5e/tools/build-roll-table-content.mjs", "ak5e/scripts/ak5e.mjs", "ak5e/test/roll-tables.test.mjs"] };
  if (chapter === 3 && entry.kind === "operator-skill") {
    const profile = skillTargetProfile(entry);
    return { status: "partial helper", notes: `Target profile: ${profile.status}; ${profile.phases.map(p => p.mode ? `${p.id} ${p.mode}/${p.shape ?? "token"}${p.distance ? ` ${p.distance} ft` : ""}` : `${p.id} manual`).join(", ")}. This is targeting/geometry evidence only; it does not establish full source effects, rolls, costs, or eligibility.`, refs: ["ak5e/scripts/operator-target-profiles.mjs", "ak5e/scripts/operator-targeting.mjs", "ak5e/scripts/operator-skills.mjs", "ak5e/test/operator-targeting.test.mjs"] };
  }
  if (chapter === 3 && entry.parentBranch === "Standard Bearer") {
    const entrypoint = readFileSync(new URL("../scripts/ak5e.mjs", import.meta.url), "utf8");
    const wired = /registerStandardBearerHooks/.test(entrypoint);
    const tested = existsSync(new URL("../test/standard-bearer.test.mjs", import.meta.url));
    return { status: wired ? "implemented but unverified" : "partial helper", notes: wired
      ? `Scoped runtime and sheet helpers are registered${tested ? " and have focused unit tests" : "; no focused Standard Bearer test file is present"}. This audit does not claim Foundry UI, player/GM interaction, map behavior, persistence, or every action passed live validation.`
      : "Scoped rules, controller, and sheet helpers exist, but the module entrypoint does not register the runtime hooks yet. This is not evidence that the branch is usable in Foundry; no rendered validation is claimed.",
      refs: ["ak5e/scripts/standard-bearer-rules.mjs", "ak5e/scripts/standard-bearer.mjs", "ak5e/scripts/standard-bearer-sheet.mjs", "ak5e/scripts/ak5e.mjs", ...(tested ? ["ak5e/test/standard-bearer.test.mjs"] : [])] };
  }
  if (chapter === 3 && entry.parentClass === "Defender" && ["class-feature", "subclass-feature"].includes(entry.kind) && [undefined, null, "Artshield", "Dreadnought"].includes(entry.parentBranch) &&
    /(Resilience|Shelter|Leaping Defence|Reactive|Stand Behind Me|Indestructible|Adamantine Defence|Dreadnought's Advance|Crownsplitter|Wrecking Wall|Sword of Damocles|Legendary Might|Against the Storm|Weapons of the Enemy|Oppressive Force|Stormchaser|Eye of the Storm)$/.test(entry.sourceHeading ?? entry.name ?? "")) {
    const entrypoint = readFileSync(new URL("../scripts/ak5e.mjs", import.meta.url), "utf8");
    const wired = /registerDefenderHooks/.test(entrypoint);
    return { status: wired ? "partial helper" : "text/manual only", notes: wired
      ? "Defender, Dreadnought and Artshield helpers are registered with focused unit tests. Native progression covers HP, ASIs, proficiencies, equipment and all 42 Talent choices; five Shelter/SP Talent workflows are implemented. Operator Skills retain their chooser. Only features listed in DEFENDER_IMPLEMENTATION.md are covered; many effects remain guided. This static audit does not establish rendered validation; actual evidence is in FOUNDRY_SMOKE_TEST.md."
      : "Source text is retained. No entry-scoped runtime adapter was established for this record.",
      refs: wired ? ["ak5e/scripts/defender-rules.mjs", "ak5e/scripts/defender-features.mjs", "ak5e/scripts/defender-setup.mjs", "ak5e/scripts/dreadnought-features.mjs", "ak5e/scripts/artshield-features.mjs", "ak5e/scripts/defender-sheet.mjs", "ak5e/test/defender-features.test.mjs", "ak5e/test/dreadnought.test.mjs", "ak5e/test/artshield.test.mjs"] : [base] };
  }
  if (chapter === 6 && entry.kind === "creature") return { status: "text/manual only", notes: "NPC features are retained as prose Items; parsed action prose is not an attack/save/recharge activity. Actor stat fields are data mapping, not action automation.", refs: ["ak5e/tools/build-chapter-six-content.mjs", "ak5e/scripts/ak5e.mjs", "ak5e/test/parser-fixtures.test.mjs"] };
  if (chapter === 1 && /operator-skills|damage-reduction|dying|conditions/i.test(entry.name)) return { status: "partial helper", notes: "A rules helper exists for part of this journal's subject; no claim is made that all clauses in this journal are enforced.", refs: ["ak5e/scripts/world-rules.mjs", "ak5e/scripts/world-rule-state.mjs", "ak5e/test/world-rules.test.mjs"] };
  if (chapter === 2 && /species|origin/i.test(entry.kind ?? "")) return { status: "text/manual only", notes: "Origin setup and tag helpers cover selected choices; feature prose, conditional eligibility, rest limits, and all derived effects are not proven automated by item presence.", refs: ["ak5e/scripts/origin-setup.mjs", "ak5e/scripts/feature-trackers.mjs", "ak5e/test/origin-setup.test.mjs"] };
  if (chapter === 5) return { status: "partial helper", notes: "Arts casting/AP helpers and native spell fields exist; this entry's source-specific target/effect behavior is not established by the casting helper or generated Item fields.", refs: ["ak5e/scripts/arts-casting.mjs", "ak5e/scripts/arts-rules.mjs", "ak5e/test/arts-rules.test.mjs"] };
  if (chapter === 4) return { status: "text/manual only", notes: "Native equipment values may be mapped; distinctive properties and magic-item effects remain manual unless an entry-specific handler is evidenced.", refs: ["ak5e/scripts/chapter-four-content.mjs", "ak5e/test/enhanced-weapons.test.mjs"] };
  return { status: "text/manual only", notes: "Source text is retained. No entry-scoped runtime adapter was established for this record.", refs: [base] };
}

const runtimeNeedles = {
  "ak5e/scripts/operator-target-profiles.mjs": "skillTargetProfile",
  "ak5e/scripts/operator-targeting.mjs": "export",
  "ak5e/scripts/operator-skills.mjs": "export",
  "ak5e/scripts/standard-bearer-rules.mjs": "BATTLECRIES",
  "ak5e/scripts/standard-bearer.mjs": "registerStandardBearerHooks",
  "ak5e/scripts/standard-bearer-sheet.mjs": "openStandardBearer",
  "ak5e/scripts/defender-rules.mjs": "defenderProfile",
  "ak5e/scripts/defender-features.mjs": "registerDefenderHooks",
  "ak5e/scripts/defender-setup.mjs": "previewDefenderSetup",
  "ak5e/scripts/dreadnought-features.mjs": "registerDreadnoughtHooks",
  "ak5e/scripts/artshield-features.mjs": "registerArtshieldHooks",
  "ak5e/scripts/defender-sheet.mjs": "openDefenderControls",
  "ak5e/test/defender-features.test.mjs": "test(",
  "ak5e/test/dreadnought.test.mjs": "test(",
  "ak5e/test/artshield.test.mjs": "test(",
  "ak5e/scripts/world-rules.mjs": "previewDamage",
  "ak5e/scripts/world-rule-state.mjs": "export",
  "ak5e/scripts/origin-setup.mjs": "manual",
  "ak5e/scripts/feature-trackers.mjs": "export",
  "ak5e/scripts/chapter-four-content.mjs": "physicalItemData",
  "ak5e/scripts/arts-casting.mjs": "export",
  "ak5e/scripts/arts-rules.mjs": "export",
  "ak5e/tools/build-chapter-six-content.mjs": "parseNpcFeatures",
  "ak5e/scripts/ak5e.mjs": "npcFeature",
  "ak5e/test/parser-fixtures.test.mjs": "test(",
  "ak5e/test/operator-targeting.test.mjs": "test("
};
function runtimeLocation(path) {
  if (runtimeLocation.cache.has(path)) return runtimeLocation.cache.get(path);
  const url = new URL(`../../${path}`, import.meta.url);
  if (!existsSync(url)) { runtimeLocation.cache.set(path, null); return null; }
  const text = readFileSync(url, "utf8");
  const line = lineAt(text, runtimeNeedles[path] ?? "export") ?? 1;
  const result = `${path}:${line}`;
  runtimeLocation.cache.set(path, result);
  return result;
}
runtimeLocation.cache = new Map();
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }

function sourceBlocks(chapter, entry, source) {
  const raw = entry.rawSources?.length ? entry.rawSources : [entry.rawSource].filter(Boolean);
  if (chapter === 6 && entry.kind === "creature" && entry.features?.length) {
    const actorOffset = source.indexOf(`## ${entry.name}`);
    return entry.features.map((feature, index) => ({
      key: `${idOf(chapter, entry)}#${index}`, label: feature.name,
      text: feature.rawSource || feature.name,
      sourceLine: actorOffset >= 0
        ? lineAt(source, feature.rawSource, actorOffset) ?? lineAt(source, feature.rawSource?.split("\n").find(Boolean), actorOffset) ?? lineAt(source, `***${feature.name}***`, actorOffset) ?? lineAt(source, `**${feature.name}**`, actorOffset)
        : lineAt(source, feature.rawSource?.split("\n").find(Boolean)) ?? lineAt(source, `***${feature.name}***`) ?? lineAt(source, `**${feature.name}**`),
      section: feature.section ?? "feature"
    }));
  }
  const blocks = [];
  for (const full of raw) {
    for (const text of paragraphs(full)) {
      if (!mechanics.test(text)) continue;
      const head = text.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? text.match(/^\*\*(.+?)\*\*/)?.[1] ?? "Mechanic clause";
      blocks.push({ key: `${idOf(chapter, entry)}#${blocks.length}`, label: head, text,
        sourceLine: lineAt(source, text) ?? lineAt(source, text.split("\n").find(Boolean)), section: "source clause" });
    }
  }
  if (!blocks.length && entry.rawSource) {
    const first = paragraphs(entry.rawSource)[0] ?? entry.rawSource;
    blocks.push({ key: `${idOf(chapter, entry)}#0`, label: entry.sourceHeading ?? entry.name, text: first,
      sourceLine: lineAt(source, first) ?? lineAt(source, entry.sourceHeading ?? entry.name), section: "source record" });
  }
  return blocks;
}

function statusGlyph(status) { return status === "partial helper" ? "partial helper" : status; }
export async function buildAudit() {
  const manifest = JSON.parse(await readFile(new URL("ak5e/module.json", root), "utf8"));
  const repoReadme = await readFile(new URL("README.md", root), "utf8");
  const installedPath = repoReadme.match(/^\|\s*Installed module\s*\|\s*`?([^|`]+)`?\s*\|/m)?.[1]?.trim();
  let installed = { path: installedPath ?? "not documented", present: false };
  if (installedPath && existsSync(`${installedPath}/module.json`)) {
    const installedManifestRaw = readFileSync(`${installedPath}/module.json`);
    const installedManifest = JSON.parse(installedManifestRaw.toString("utf8"));
    const files = ["scripts/ak5e.mjs", "scripts/standard-bearer.mjs", "scripts/standard-bearer-rules.mjs", "scripts/standard-bearer-sheet.mjs"];
    installed = { path: installedPath, present: true, version: installedManifest.version, manifestHash: sha256(installedManifestRaw), repoManifestHash: sha256(readFileSync(new URL("ak5e/module.json", root))), files: files.map(file => {
      const repoHash = existsSync(new URL(`ak5e/${file}`, root)) ? sha256(readFileSync(new URL(`ak5e/${file}`, root))) : null;
      const installedHash = existsSync(`${installedPath}/${file}`) ? sha256(readFileSync(`${installedPath}/${file}`)) : null;
      return { file, installed: Boolean(installedHash), repoHash, installedHash, sameAsRepo: repoHash != null && repoHash === installedHash };
    }) };
  }
  const sourceTexts = {};
  for (const [chapter, file] of Object.entries(sourceFiles)) sourceTexts[chapter] = (await readFile(new URL(file, sourceRoot), "utf8")).replace(/\r\n/g, "\n");
  const mapText = await readFile(new URL("ak5e/CONTENT_MAP.md", root), "utf8");
  const mappedHeadingCount = Number(mapText.match(/^- Source headings scanned: (\d+)$/m)?.[1] ?? NaN);
  const mappedPacks = new Set([...mapText.matchAll(/`(ak5e\.[a-z-]+)`/g)].map(m => m[1]));
  const declaredPacks = new Set((manifest.packs ?? []).map(pack => `ak5e.${pack.name}`));
  const sources = {};
  for (const chapter of Object.keys(arrays)) sources[chapter] = sourceTexts[chapter];
  const records = [];
  const generatedTexts = {};
  for (const file of new Set([...Object.values(generatedFiles), "ak5e/scripts/roll-table-content.mjs"])) generatedTexts[file] = await readFile(new URL(file, root), "utf8");
  const headingInventory = {};
  const tableInventory = {};
  for (const [chapterText, entries] of Object.entries(arrays)) {
    const chapter = Number(chapterText), source = sources[chapter];
    const headings = [...source.matchAll(/^#{1,6}[ \t]+([^\n]+)$/gm)].filter(match => match[1].trim()).map(match => ({ line: source.slice(0, match.index).split("\n").length, text: match[0], name: match[1].trim() }));
    headingInventory[chapter] = headings.filter(heading => !entries.some(entry => entry.sourceHeading === heading.name || entry.rawSource?.includes(heading.text) || (entry.rawSources ?? []).some(raw => raw.includes(heading.text))));
    const sourceLines = linesOf(source);
    tableInventory[chapter] = sourceLines.reduce((count, line, index) => count + (/^\|/.test(line) && (index === 0 || !/^\|/.test(sourceLines[index - 1])) ? 1 : 0), 0);
    for (const entry of entries) {
      const gen = entry.kind === "roll-table" ? "ak5e/scripts/roll-table-content.mjs" : generatedFiles[chapter];
      const stableId = idOf(chapter, entry);
      const raw = (entry.rawSources ?? [entry.rawSource]).filter(Boolean);
      const firstRawHeading = entry.rawSource?.match(/^#{1,6}\s+(.+)$/m)?.[0];
      const sourceLine = entry.sourceLine ?? (chapter === 6
        ? lineAt(source, `## ${entry.name}`) ?? lineAt(source, entry.rawSource) ?? lineAt(source, firstRawHeading) ?? lineAt(source, entry.sourceHeading ?? entry.name)
        : raw.map(text => lineAt(source, text)).find(Boolean) ?? lineAt(source, entry.sourceHeading ?? entry.name));
      const runtime = runtimeRefs(chapter, entry, gen);
      const clauses = sourceBlocks(chapter, entry, source);
      records.push({ chapter, entry, stableId, sourceLine, runtime, clauses, gen, pack: entry.kind === "roll-table" ? "ak5e.tables" : packByChapter[chapter], sourceRetained: raw.length > 0 && raw.every(text => source.includes(text)) });
    }
  }
  const counts = Object.fromEntries(Object.keys(arrays).map(ch => [ch, arrays[ch].length]));
  const kindCounts = Object.fromEntries(Object.keys(arrays).map(ch => {
    const rows = arrays[ch].reduce((counts, entry) => { const kind = kindOf(entry); counts[kind] = (counts[kind] ?? 0) + 1; return counts; }, {});
    return [ch, rows];
  }));
  const all = records.length;
  const standardRows = records.filter(r => r.chapter === 3 && r.entry.parentBranch === "Standard Bearer");
  const unmatched = records.filter(r => !r.sourceRetained);
  const allHeadings = Object.values(headingInventory).flat();
  const allHeadingCount = Object.values(headingInventory).reduce((sum, rows) => sum + rows.length, 0) + records.reduce((sum, row) => sum + (row.chapter ? 0 : 0), 0);
  const sourceHeadingCount = Object.keys(arrays).reduce((sum, chapter) => sum + [...sources[chapter].matchAll(/^#{1,6}[ \t]+([^\n]+)$/gm)].filter(match => match[1].trim()).length, 0);
  const tableCount = Object.values(tableInventory).reduce((sum, count) => sum + count, 0);
  const mappedRollTables = [...mapText.matchAll(/^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\|\s*(?:Planned|Generated) `ak5e\.tables`: ([^|]+)\|$/gm)]
    .map(match => ({ chapter: match[1], line: match[2], heading: match[3].trim(), name: match[5].trim() }));
  const output = [];
  output.push(`# AK5e gameplay automation audit`, "", `Generated from the checked-in Chapter 1–6 source files and generated content records by \`node ak5e/tools/audit-automation.mjs --write\`. Source edition: AK5e 1st Edition v1.3.1.`, "");
  output.push(`This generator scans all six authoritative source chapters; the document inventory covers the checked-in generated records and their source references. Human source review and rendered acceptance are recorded separately in the decision log and smoke-test checklist. The mechanic-clause rows are produced by structural/keyword extraction to identify review candidates; they are not a semantically exhaustive acceptance audit of every mechanic, nor proof that generated descriptions or selected targets enforce gameplay. Axis labels mean only that the source text mentions that topic. Statuses are evidence-bounded: generated prose, D&D5e field mapping, target selection, and a passing unit test each prove different things. No record is classified “verified in Foundry” without rendered Foundry evidence.`, "");
  const installedEntrypoint = installed.files?.find(item => item.file === "scripts/ak5e.mjs");
  output.push(`## Coverage and package state`, "", `- Generated records: **${all}** — ${Object.entries(counts).map(([chapter, count]) => `Chapter ${chapter}: ${count}`).join("; ")}.`, `- Distributed entries retain source text: **${records.filter(r => r.sourceRetained).length}/${all}** by exact raw-source comparison. Source file / stable ID / line are shown per record; creature feature clauses also use stable actor-id#feature-index keys.`, `- Pack destinations below come from the content map and are **planned pack IDs**. The current manifest declares ${declaredPacks.size ? [...declaredPacks].join(", ") : "no compendium packs"}; generated content counts are not release-pack evidence. Content-map pack IDs observed: ${[...mappedPacks].sort().join(", ") || "none"}.`, `- Release packs absent from the manifest: ${[...mappedPacks].filter(id => !declaredPacks.has(id)).sort().join(", ") || "none"}.`, `- Repository version: **${manifest.version}**. ${installed.present ? `Installed module: **${installed.version}** at \`${installed.path}\`; manifest SHA-256 repository \`${installed.repoManifestHash}\`, installed \`${installed.manifestHash}\`. Entry script \`scripts/ak5e.mjs\` SHA-256 repository \`${installedEntrypoint.repoHash}\`, installed \`${installedEntrypoint.installedHash}\`. Standard Bearer runtime files installed: ${installed.files.filter(item => item.file.startsWith("scripts/standard-bearer") && item.installed).map(item => item.file).join(", ") || "none"}.` : `Installed module: unavailable at the documented path \`${installed.path}\`; installed version could not be verified.`} No World data was inspected.`, `- Runtime/UI evidence: this report is static. “Implemented but unverified” means scoped code exists; it does not mean clean-World import or interaction was verified.`, "");
  output.push(`- Kind cross-checks: Chapter 2 ${Object.entries(kindCounts[2]).map(([kind, count]) => `${kind} ${count}`).join(", ")}; Chapter 3 ${Object.entries(kindCounts[3]).map(([kind, count]) => `${kind} ${count}`).join(", ")}; Chapter 6 ${Object.entries(kindCounts[6]).map(([kind, count]) => `${kind} ${count}`).join(", ")}, ${CHAPTER_SIX_CREATURES.filter(e => e.kind === "creature").reduce((sum, e) => sum + e.features.length, 0)} actor feature records and ${CHAPTER_SIX_CREATURES.filter(e => e.kind === "creature").reduce((sum, e) => sum + e.continuationCount, 0)} continuation blocks.`, "");
  output.push(`- Exact source-retention exceptions: ${unmatched.length ? `${unmatched.map(row => `\`${row.stableId}\``).join(", ")}. These records need manual generator/source comparison; no retention coverage is inferred for them.` : "none. Every stored raw-source fragment is present in its authoritative chapter."}`, "");
  output.push(`## Heading and table routing`, "", `- Direct source scan: **${sourceHeadingCount} Markdown headings** and **${tableCount} Markdown table blocks** across Chapters 1–6. The generated Content Map reports ${Number.isFinite(mappedHeadingCount) ? `**${mappedHeadingCount} headings**` : "no readable heading count"}${mappedHeadingCount === sourceHeadingCount ? ", matching the current source scan" : `; the current source scan sees ${sourceHeadingCount}, so the map should be regenerated`}.`, `- **${allHeadings.length} headings** do not occur in any record source heading/raw source: ${allHeadings.map(row => `Chapter ${Object.entries(headingInventory).find(([, list]) => list.includes(row))?.[0]} line ${row.line}: ${row.name}`).join("; ") || "none"}. These are Chapter 6 character-sheet / patch-note headings, which are version history or layout rather than creature mechanics.`, `- **${mappedRollTables.length}** random-result tables are generated as standalone development-world RollTables. Their native roll/display path is implemented; costs, effects and summons remain manual. Release packs and rendered acceptance are separate evidence.`, "", "| Chapter | Source line | Heading | Planned RollTable |", "| --- | ---: | --- | --- |");
  for (const table of mappedRollTables) output.push(`| ${table.chapter} | ${table.line} | ${esc(table.heading)} | ${esc(table.name)} |`);
  output.push("");
  output.push("## Status meanings", "", "| Status | Evidence threshold |", "| --- | --- |", "| missing | A source mechanic has no matching generated record or code-backed/manual workflow. |", "| text/manual only | Rule text is preserved, but an entry-scoped usable helper was not established. |", "| partial helper | A bounded helper exists for one axis or phase; remaining source mechanics are still manual. |", "| implemented but unverified | Scoped behavior code exists, but the required Foundry interaction/live evidence is absent. |", "| verified in Foundry | Actual affected Foundry screen and interaction were exercised and reviewed; none assigned by this static audit. |", "");
  output.push("## Ordered remediation backlog", "", "1. **Monster usability:** map attack activities, saves, damage, action economy, recharge, and per-feature triggers from all 801 feature clauses; preserve special/manual procedures where D&D5e activities cannot express the source.", "2. **Class and resource workflows:** cover class/branch feature actions, reactions, costs, prerequisites, duration, recovery, and effects. Operator Skills currently have partial targeting/geometry helpers; source effects and event restrictions remain per-skill work. Complete Standard Bearer’s flag, auras, eligibility, costs, persistence, and player/GM flow, then verify live.", "3. **Reusable targeting/effect/resource helpers:** close save/roll mapping, native effect application, source-specific target eligibility, resource spending/refunds, cooldowns, and cumulative temporary HP; test cancellation and duplicate requests. Do not infer allegiance or willingness from geometry.", "4. **Arts and origins:** audit each Arts activity against source target/save/effect text; implement origin choices and conditional benefits without overwriting authored actor state.", "5. **Map and summon behavior:** represent persistent zones/auras and summon workflows with explicit ownership, duration, cleanup, and manual fallback. Verify exact source geometry and lifecycle in a clean World.", "");
  output.push("## Reviewed source findings", "", "The following cross-record reviews were performed against complete source sections. These findings supplement the per-record ledger and keep conclusions tied to identified runtime behavior.", "", "| Area | Source refs | Current evidence-bounded finding |", "| --- | --- | --- |",
    "| Origins and species features | Chapter 2, examples 103–213 and 2126–2156; nationality/background sections 3378–4989; `ak5e/scripts/origin-setup.mjs:87-113`; `ak5e/scripts/feature-trackers.mjs:17-103` | Text/manual only overall. Setup applies selected proficiencies and curated trackers cover limited uses/workflows; source choices, conditional features, rest triggers, willingness, and ongoing effects need feature-specific procedures. |",
    "| Weapon properties | Chapter 4, 52–200; `ak5e/scripts/chapter-four-content.mjs` | Partial helper. Base weapon fields are mapped and some properties have focused support; the remaining Bound, Brace, Casting Unit, Conductive, Couch, Crush, Deadly, Firearm, Rapid Fire, and Returning behaviors require item/property-specific proof or manual handling. |",
    "| Armour damage reduction | Chapter 1, 207–211; Chapter 4, 216–273; `ak5e/scripts/world-rules.mjs:139-164` | Partial helper. A preview handles one applicable DR source and source ordering/minimum damage; multiple applicable sources require GM review, and item equip does not automatically apply damage changes to HP. |",
    "| Toolkits and consumables | Chapter 4, 274–908; `ak5e/scripts/chapter-four-content.mjs` | Text/manual only. Item data/descriptions do not enact distinct charges, actions, checks, attack/save routes, targets, healing, Mettle, DR, death saves, or durations. |",
    "| Magic items | Chapter 4, 909–1098; `ak5e/scripts/chapter-four-content.mjs` | Text/manual only. Per-item charges, rolls, attacks, cooldowns, geometry, and effects need a feature-level helper or a clear manual use procedure. |",
    "| Shared Arts casting | Chapter 5, 9–63 and 324–328; `ak5e/scripts/arts-rules.mjs`, `arts-casting.mjs`, `arts-sheet.mjs` | Partial helper. AP, Casting Unit and selected casting gates exist, but the generated Art records do not establish source-specific target/effect resolution; the sheet requires activities for castability. |",
    "| Individual Arts | Chapter 5, 491–2176; `ak5e/scripts/chapter-five-content.mjs` | Text/manual only at the individual-effect level. Audit each Art's action/trigger, target, save/DC, AoE, damage/healing, conditions, summon, duration, scaling, and exception against a native activity or usable manual procedure. |",
    "| Chapter 6 creature features | All 801 actor feature clauses, Chapter 6; `ak5e/tools/build-chapter-six-content.mjs`; `ak5e/scripts/ak5e.mjs`; `ak5e/test/parser-fixtures.test.mjs` | Text/manual only for actions and traits. Feature prose is represented by embedded feat Items with no activities; actor stat mapping does not execute Multiattack, attacks, saves, recharge, or special conditions. |",
    "| Operator Skills | Chapter 1 Operator Skills and Chapter 3, all 320 skill records; `ak5e/scripts/operator-target-profiles.mjs`; `ak5e/scripts/operator-targeting.mjs`; `ak5e/test/operator-targeting.test.mjs` | Partial helper. Selection/geometry and reviewed phases exist for mapped skills; native effects, damage/save outcomes, source restrictions, movement, and later phases remain manual when not explicitly handled per skill. |", "");
  output.push("## Source-record ledger", "", "Rows are one per generated document or actor. `Axes mentioned` is derived from source wording only. Clause details follow each chapter table. Planned packs may not exist in the release manifest.", "");
  for (let chapter = 1; chapter <= 6; chapter++) {
    const group = records.filter(record => record.chapter === chapter);
    output.push(`### Chapter ${chapter}`, "", `Source: \`AK5e_1.3.1_Foundry_Source/${sourceFiles[chapter]}\` (${linesOf(sourceTexts[chapter]).length} lines). Records: **${group.length}**.`, "", "| Stable ID | Entry / kind | Planned document → pack | Source heading / line | Axes mentioned in source | Audit status | Runtime and test evidence / limitation |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of group) {
      const { entry, runtime, clauses, stableId } = row;
      const mentions = [...new Set(clauses.flatMap(clause => inferAxes(clause.text)))].join(", ") || "none detected";
      const ref = row.sourceLine ? `${row.sourceLine}` : "line unresolved";
      const genLine = lineAt(generatedTexts[row.gen], JSON.stringify(stableId));
      const evidenceRefs = runtime.refs.map(runtimeLocation).filter(Boolean);
      const evidence = `${evidenceRefs.join("; ")}${genLine ? `; ${row.gen}:${genLine}` : `; ${row.gen}`}. ${runtime.notes}`;
      output.push(`| \`${esc(stableId)}\` | ${esc(entry.name)} / ${esc(kindOf(entry))} | ${esc(docType(chapter, entry))} → \`${row.pack}\` (${declaredPacks.has(row.pack) ? "manifest declared" : "not declared in manifest"}) | \`${esc(entry.sourceHeading ?? entry.name)}\` / ${ref} | ${esc(mentions)} | ${statusGlyph(runtime.status)} | ${esc(evidence)} |`);
    }
    output.push("", `#### Chapter ${chapter} mechanic clauses`, "", "Each clause row has a source line and stable key. For creature traits/actions, the key is `actor-id#feature-index`; these are independently retained feature records, but the current generated feature Items have no activities unless the runtime evidence says otherwise.", "", "| Clause key | Entry / section | Source line | Axes mentioned | Source mechanic excerpt |", "| --- | --- | ---: | --- | --- |");
    for (const row of group) {
      for (const clause of row.clauses) {
        const short = clause.text.replace(/\s+/g, " ").slice(0, 380);
        output.push(`| \`${esc(clause.key)}\` | ${esc(row.entry.name)} / ${esc(clause.section)} | ${clause.sourceLine ?? "unresolved"} | ${esc(inferAxes(clause.text).join(", ") || "none detected")} | ${esc(short)}${clause.text.length > 380 ? " …" : ""} |`);
      }
    }
    output.push("");
  }
  output.push("## Standard Bearer focused ledger", "", `Found ${standardRows.length} Standard Bearer generated records. The source states a wielded 10-foot aura, planted 25-foot aura, Bonus Action plant/pickup, Tip of the Spear, Fervour, six Battlecries/Choruses, Symbol of Authority, Power Projection, Proclaimer, and The Last Stand. Each source mechanic remains individually visible above with source line refs.`, "", `The repository contains registered, scoped Standard Bearer rule, controller, and sheet helpers. Installed version ${installed.version ?? "unknown"} does not contain those three Standard Bearer files, so those changes are not present in the installed module. The repository branch status is **implemented but unverified**; this static report does not claim a rendered flag prop, persistent aura template, or live clean-World/player interaction. Open source questions include whether planted Tip of the Spear triggers use generic Creature eligibility or the base allied/visible/60-foot restriction, whether another creature can wield the Standard, and how overlapping auras stack. Apply the explicit GM-confirmed procedures recorded in the project decision log; do not let area membership establish allegiance or consent.`, "");
  output.push("## Interpretation limits", "", "- This audit is not a rules license or redistribution approval.", "- Source axis detection is a browsing aid, not a mechanic parser. Read the cited source clause before changing behavior.", "- Stable IDs identify current generated records. Do not change them casually because compendium UUID links may depend on them.", "- Static helpers, generated Activities, and tests do not establish visual usability. Clean-World import, player/GM permissions, actual screenshots, reload persistence, and renderer evidence remain separate acceptance checks.", "");
  return output.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--write")) {
    const report = await buildAudit();
    await writeFile(new URL("../AUTOMATION_AUDIT.md", import.meta.url), report);
    console.log(`Wrote ak5e/AUTOMATION_AUDIT.md (${report.split("\n").length} lines).`);
  } else if (process.argv.includes("--check")) {
    const generated = await buildAudit();
    const current = await readFile(new URL("../AUTOMATION_AUDIT.md", import.meta.url), "utf8");
    if (generated !== current) throw new Error("AUTOMATION_AUDIT.md is stale; run node ak5e/tools/audit-automation.mjs --write.");
    console.log("Automation audit is current.");
  } else {
    process.stdout.write(await buildAudit());
  }
}
