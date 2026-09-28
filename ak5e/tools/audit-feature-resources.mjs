/** Read-only candidate inventory. Matches are review leads, never automation rules. */
import { ORIGIN_USES, ORIGIN_RECORDS } from "../scripts/feature-trackers.mjs";

const pools = ["Mystic Charge", "Resilience", "Munitions Dice", "Liberty", "Empowered Shots", "Life Support",
  "Fuel", "Aid Dice", "Sparks of Creation", "Momentum", "Fervour", "Acumen"];
const restLimit = /\b(?:once|twice|three times|number of times)\b[^.\n]*(?:Short|Long) Rest|(?:regain|recover|restore)[^.\n]*(?:expended (?:uses|charges)|charges)/i;
const recharge = /\brecharge\b|\b\d+\s*\/\s*day\b|\bper day\b/i;
const chapters = [];
for (const [index, name] of ["one", "two", "three", "four", "five", "six"].entries()) {
  const module = await import(`../scripts/chapter-${name}-content.mjs`);
  const records = Object.values(module).find(Array.isArray);
  const candidates = [];
  for (const record of records) {
    const text = record.rawSource ?? "";
    const namedPools = pools.filter(pool => text.includes(pool));
    if (restLimit.test(text) || namedPools.length) candidates.push({ id: record.id ?? record.slug,
      kind: record.kind ?? "journal", heading: record.sourceHeading, namedPools, restLimit: restLimit.test(text) });
    for (const feature of record.features ?? []) if (recharge.test(`${feature.name}\n${feature.rawSource ?? ""}`)) {
      candidates.push({ parentId: record.id, kind: "creature-feature", heading: feature.name, recharge: true });
    }
  }
  chapters.push({ chapter: index + 1, records: records.length,
    embeddedFeatures: records.reduce((total, record) => total + (record.features?.length ?? 0), 0), candidates });
}
const report = { warning: "Keyword candidates include containers and duplicate references. Review the authoritative chapter before modelling any rule.",
  reviewedOriginUses: Object.keys(ORIGIN_USES), reviewedOriginRecords: Object.keys(ORIGIN_RECORDS), chapters };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(report.warning);
  for (const chapter of chapters) console.log(`Chapter ${chapter.chapter}: ${chapter.records} records; ${chapter.embeddedFeatures} embedded features; ${chapter.candidates.length} candidates`);
  console.log(`Reviewed Origin definitions: ${report.reviewedOriginUses.length} use pools; ${report.reviewedOriginRecords.length} records`);
  console.log(`Named class pools scanned: ${pools.join(", ")}`);
  console.log("Use --json for candidate IDs and source headings.");
}
