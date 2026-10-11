import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAudit } from "../tools/audit-automation.mjs";
import { CHAPTER_ONE_ENTRIES } from "../scripts/chapter-one-content.mjs";
import { CHAPTER_TWO_ORIGINS } from "../scripts/chapter-two-content.mjs";
import { CHAPTER_THREE_CLASSES } from "../scripts/chapter-three-content.mjs";
import { CHAPTER_FOUR_EQUIPMENT } from "../scripts/chapter-four-content.mjs";
import { CHAPTER_FIVE_ARTS } from "../scripts/chapter-five-content.mjs";
import { CHAPTER_SIX_CREATURES } from "../scripts/chapter-six-content.mjs";
import { AK5E_ROLL_TABLES } from "../scripts/roll-table-content.mjs";

const audit = await buildAudit();

test("audit inventory covers all generated source records and creature feature keys", async () => {
  const chapters = [CHAPTER_ONE_ENTRIES, CHAPTER_TWO_ORIGINS, CHAPTER_THREE_CLASSES, CHAPTER_FOUR_EQUIPMENT, CHAPTER_FIVE_ARTS, CHAPTER_SIX_CREATURES];
  assert.deepEqual(chapters.map(entries => entries.length), [8, 237, 1456, 213, 132, 147]);
  assert.equal(AK5E_ROLL_TABLES.length, 4);
  assert.match(audit, /Generated records: \*\*2197\*\*/);
  assert.match(audit, /Distributed entries retain source text: \*\*2197\/2197\*\*/);
  assert.match(audit, /Exact source-retention exceptions: none\./);
  assert.match(audit, /2038 Markdown headings/);
  assert.match(audit, /2038 headings\*\*, matching the current source scan/);
  assert.ok(audit.includes("class-option 350, roll-table 3"));
  for (const table of AK5E_ROLL_TABLES) assert.ok(audit.includes(`\`${table.id}\``));
  assert.ok(audit.includes("class-summon 8"), "Class summon records must be counted independently from other class features.");
  assert.ok(audit.includes("creature 145, roll-table 1, 801 actor feature records and 2 continuation blocks"));
  assert.match(audit, /creature-collapsed-construct-[\w-]+#0/);
  assert.match(audit, /\| `subclass-feature-vanguard-standard-bearer-[^|]+` \|[^|]+\|[^|]+\| `[^`]+` \/ \d+ \|/);
  assert.doesNotMatch(audit, /\| `[^|]+` \|[^|]+\|[^|]+\| `[^`]+` \/ line unresolved \|/);
  const featureKeys = [...audit.matchAll(/\| `creature-[^|]+-\d+#\d+` \|/g)];
  assert.equal(featureKeys.length, 801, "Every NPC feature clause gets an actor stable ID and source feature index.");
});

test("audit separates text retention, bounded helpers, and unverified UI evidence", async () => {
  assert.match(audit, /partial helper \|[^\n]*Target profile:/);
  assert.match(audit, /does not establish full source effects, rolls, costs, or eligibility/);
  assert.match(audit, /text\/manual only \|[^\n]*NPC features are retained as prose Items/);
  assert.ok(audit.includes("implemented but unverified | ak5e/scripts/standard-bearer-rules.mjs:"), "Standard Bearer helper evidence must stay below Foundry-verified status.");
  assert.ok(audit.includes("No record is classified “verified in Foundry”"));
  assert.ok(audit.includes("Installed module: **0.3.5**"), "Installed version is reported separately from the repository manifest.");
  assert.ok(audit.includes("Standard Bearer runtime files installed: none"));
  assert.ok(audit.includes("no compendium packs"));
  assert.ok(audit.includes("Exact source-retention exceptions:"));
});
