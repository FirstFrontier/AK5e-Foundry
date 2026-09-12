# AK5e Foundry VTT To-Do List

This checklist covers the work remaining to turn the current development-world
importers into a tested, distributable Foundry VTT 13 module. The generated
Chapter 1–6 content and installer APIs already exist; do not redo them unless a
source or verification issue requires a change.

## 1. Confirm distribution requirements

- [ ] Confirm that the AK5e rules text, data, and any future artwork may be
  redistributed in a public Foundry module.
- [ ] Add the required license, credits, attribution, and third-party notices to
  the module and release archive.
- [ ] Decide which non-rules front-matter content belongs in the release.
- [ ] Record any uncertain rules-to-Foundry mappings in `ak5e/DECISIONS.md`.

## 2. Build and maintain the content map

- [x] Inventory source headings and table blocks in Chapters 1–6 in
  `ak5e/CONTENT_MAP.md`.
- [x] Map every current generated entry to its source chapter, Foundry document
  type, destination pack, generated name, and stable installer ID.
- [x] Compare the map with the current generated totals: 231 Chapter 2 Items,
  777 Chapter 3 Items, 126 Chapter 4 Items, 128 Chapter 5 Items, and 145 Chapter
  6 Actors, plus journals and summon Actors.
- [x] Identify the source tables that should be real `RollTable` documents;
  Double-Blind Trial, Machine Personality, Tip of the Spear, and Hole in the
  World are the four planned tables.
- [x] Keep class and feature Items together in `ak5e.classes` for the first
  release; revisit a split only if clean-World pack browsing proves it unusable.
- [x] Regenerate and review `ak5e/CONTENT_MAP.md` after an approved source or
  generated-content change.

## 3. Test the current vertical slice first

- [ ] Link or copy `ak5e/` into a Foundry VTT 13 data directory.
- [ ] Create a clean World using D&D5e 5.3.3 with only AK5e enabled.
- [ ] Confirm that the module loads with no browser-console errors or Foundry
  compatibility warnings.
- [ ] Run all six `game.ak5e.installChapter...()` commands.
- [ ] Verify one complete vertical slice against the source: one Species, one
  Nationality or Background, one Class and Branch, several Features, one Art,
  one weapon, one armour item, one modification, one creature, and one summon.
- [ ] Check names, exact rules text, source headings, flags, images, types,
  activation costs, uses, ranges, targets, durations, damage, saves, and native
  D&D5e fields for the slice.
- [ ] Import the slice into character and NPC sheets and exercise its usable
  rolls, resources, effects, and links.
- [ ] Re-run every installer and confirm that it is idempotent and does not
  duplicate folders or documents.
- [ ] Increase a content version in a test branch, migrate again, and confirm
  managed content is refreshed while user-added Actor Items are preserved.
- [ ] Restart Foundry, reopen the World, and confirm documents, flags, embedded
  Items, and links persist.

## 4. Verify all generated content

- [x] Review Chapter 1 journals and helper behavior against the full Chapter 1
  source.
- [x] Review all Chapter 2 origins, features, backgrounds, guidance journals,
  and summon templates against the full Chapter 2 source.
- [x] Review all Chapter 3 classes, branches, features, options, and summons
  against the full Chapter 3 source.
- [x] Review all Chapter 4 equipment, modifications, property Items, and
  reference journals against the full Chapter 4 source.
- [x] Review all Chapter 5 Arts, Arts Pools, and reference journals against the
  full Chapter 5 source.
- [x] Review all Chapter 6 Actors, defenses, traits, embedded actions, faction
  folders, and reference journals against the full Chapter 6 source.
- [x] Pay special attention to source-defined formulas and intentionally blank
  values, including summon statistics and Pathshaper Fractal's non-numeric HP.
- [x] Fix parser or mapping errors in the relevant file under `ak5e/tools/`, then
  regenerate; do not hand-edit generated chapter content.

## 5. Add automated validation

- [ ] Add a repeatable command that regenerates Chapters 2–6 and fails when the
  working tree changes unexpectedly.
- [ ] Validate `ak5e/module.json`, `ak5e/lang/en.json`, and every `.mjs` file.
- [ ] Assert expected document counts, unique slugs/IDs, supported document
  types, and required source-traceability flags.
- [ ] Add fixture tests for source-section, table, HTML, and monster-statblock
  parsing.
- [ ] Add unit tests for Dying/Mettle, Operator Skill Points, Arts Points,
  Oripathy, Rest Actions, Martial DC, and Damage Reduction edge cases.
- [ ] Add a documented Foundry smoke-test checklist for behavior that cannot be
  tested in plain Node.js.

## 6. Create release compendiums

- [x] Plan the initial pack layout: rules, origins, classes, Arts, equipment,
  creatures, and tables. Do not create a separate talents pack unless
  clean-World navigation testing shows that `ak5e.classes` needs splitting.
- [ ] Create and verify the four planned `ak5e.tables` RollTables:
  Double-Blind Trial, Machine Personality, Tip of the Spear, and Hole in the
  World.
- [ ] Give documents stable IDs before creating cross-links.
- [ ] Export the verified World folders from Foundry VTT 13 using **Keep
  Document IDs** into module-owned compendium packs.
- [ ] Add every exported pack to the `packs` array in `ak5e/module.json` with the
  correct document type and system restriction.
- [ ] Replace temporary name-based references with stable compendium UUID links
  where useful.
- [ ] Test pack browsing, searching, importing, permissions, images, and UUID
  links in a second clean World.
- [ ] Decide whether the development-world installers ship in the release or
  move behind an explicitly labeled development setting.

## 7. Improve fidelity incrementally

- [ ] Add tested activities and Active Effects to one origin feature at a time.
- [ ] Add tested activities and Active Effects to one class/branch feature at a
  time.
- [ ] Implement and test AK5e-only equipment properties such as Brace,
  Conductive, Crush, and Splash without changing D&D5e globally.
- [ ] Integrate Art casting with per-Actor Arts Points, Maximum Art Level, and
  the one-9th-level-Art-per-Long-Rest limit.
- [ ] Add tested activities for creature actions, reactions, legendary actions,
  lair actions, and mythic actions.
- [ ] Decide how combined skills and Intelligence (Technology) should extend the
  D&D5e Actor schema and sheets.
- [ ] Provide a usable UI or packaged macros for helper-only mechanics instead
  of requiring browser-console calls.
- [ ] Evaluate condition automation individually, including timing, damage,
  penalties, action restrictions, and removal rules.
- [ ] Evaluate construct healing, Alternate Classes, spell-slot replacement,
  and ASI feat restrictions separately; retain manual instructions wherever
  automation would be incomplete or fragile.
- [ ] Mark automation claims in documentation only after clean-World testing.

## 8. Polish the module

- [x] Provide a GM-only Asset Library interface for registering, replacing, and
  removing image or audio paths; it starts with no configured assets.
- [ ] Add any licensed icons, thumbnails, or pack artwork required for clear
  navigation; retain source and license information for each asset.
- [ ] Review folder and compendium names for consistency and usability.
- [ ] Finish localization for all user-facing settings, notifications, buttons,
  and labels.
- [ ] Add styles or templates only where native Foundry/D&D5e presentation is
  insufficient.
- [ ] Update `ak5e/README.md` with the final installation, usage, compendium,
  troubleshooting, and contributor instructions.
- [ ] Add a concise changelog and a known-limitations section.

## 9. Release

- [ ] Choose the first distributable module version and update all matching
  content-version references.
- [ ] Add release/download and manifest URLs to `ak5e/module.json` when hosting
  is available.
- [ ] Confirm that the manifest package ID matches the `ak5e/` directory and
  that Foundry accepts all manifest fields.
- [ ] Build a clean zip whose root is the module contents, with no source book,
  development World, temporary files, or unrelated repository files.
- [ ] Install from the zip or manifest URL into a clean Foundry VTT 13 setup.
- [ ] Repeat the representative character, NPC, restart, link, and console-error
  tests using the packaged release.
- [ ] Publish only after license, attribution, compatibility, compendium, and
  known-limitations checks are complete.

## 10. Ongoing maintenance

- [ ] Re-run generation and regression checks after every approved source-book
  change.
- [ ] Re-test a representative sample after every Foundry VTT or D&D5e update.
- [ ] Update `compatibility.verified` only after testing that exact version.
- [ ] Increment the module version for every distributable update.
