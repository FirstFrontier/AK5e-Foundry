import { test } from "node:test";
import assert from "node:assert/strict";
import { openMarksmanProgression, renderMarksmanProgressionChoices } from "../scripts/marksman-progression-sheet.mjs";
import { marksmanProgressionChoices } from "../scripts/marksman-progression.mjs";

test("Marksman progression form renders all eight styles, source choice details and shared Operator Skills entry", () => {
  const actor = {
    uuid: "Actor.sheet", isOwner: true, type: "character", system: {}, flags: {},
    items: [{ type: "class", system: { levels: 1 }, flags: { ak5e: { chapterThreeId: "class-marksman" } } }]
  };
  const html = renderMarksmanProgressionChoices(marksmanProgressionChoices(actor));
  assert.match(html, /Braced for Action/);
  assert.match(html, /Two-Weapon Fighting/);
  assert.match(html, /Open Operator Skills/);
  assert.match(html, /Starting equipment or 1300 LMD/);
});

test("Marksman progression sheet rejects non-owner access before opening a dialog", async () => {
  await assert.rejects(openMarksmanProgression({ type: "character", isOwner: false }), /character you own/);
});
