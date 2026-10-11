import { readFile } from "node:fs/promises";

const builders = [
  "ak5e/tools/build-chapter-one-content.mjs",
  "ak5e/tools/build-chapter-two-content.mjs",
  "ak5e/tools/build-chapter-three-content.mjs",
  "ak5e/tools/build-chapter-four-content.mjs",
  "ak5e/tools/build-chapter-five-content.mjs",
  "ak5e/tools/build-chapter-six-content.mjs",
  "ak5e/tools/build-roll-table-content.mjs",
  "ak5e/tools/build-content-map.mjs"
];
const generated = [
  "ak5e/scripts/chapter-one-content.mjs",
  "ak5e/scripts/chapter-two-content.mjs",
  "ak5e/scripts/chapter-three-content.mjs",
  "ak5e/scripts/chapter-four-content.mjs",
  "ak5e/scripts/chapter-five-content.mjs",
  "ak5e/scripts/chapter-six-content.mjs",
  "ak5e/scripts/roll-table-content.mjs",
  "ak5e/CONTENT_MAP.md"
];

const before = new Map(await Promise.all(generated.map(async path => [path, await readFile(new URL(`../../${path}`, import.meta.url), "utf8")])));
for (const builder of builders) await import(new URL(`../../${builder}?validation=${Date.now()}`, import.meta.url));
const changed = [];
for (const path of generated) {
  if (await readFile(new URL(`../../${path}`, import.meta.url), "utf8") !== before.get(path)) changed.push(path);
}
if (changed.length) throw new Error(`Regeneration changed generated content: ${changed.join(", ")}`);
console.log("Regenerated Chapters 1–6, RollTables and content map; generated files are unchanged.");
