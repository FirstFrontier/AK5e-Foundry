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
  1,097 Chapter 3 Items, 207 Chapter 4 Items, 128 Chapter 5 Items, and 145 Chapter
  6 Actors, plus journals and summon Actors.
- [x] Identify the source tables that should be real `RollTable` documents;
  Double-Blind Trial, Machine Personality, Tip of the Spear, and Hole in the
  World are the four planned tables.
- [x] Keep class and feature Items together in `ak5e.classes` for the first
  release; revisit a split only if clean-World pack browsing proves it unusable.
- [x] Regenerate and review `ak5e/CONTENT_MAP.md` after an approved source or
  generated-content change.

## 3. Test the current vertical slice first

- [x] Link or copy `ak5e/` into a Foundry VTT 13 data directory.
- [x] Install the 0.3.0 build into
  `/home/patch/.local/share/FoundryVTT/Data/modules/ak5e` (2026-09-27).
  Back up 0.2.6 to `ak5e-code-backup-0.2.6-1s0gfjfo/ak5e` under the User Data
  root; update 28 files and verify all 48 repository files by SHA-256. The full
  Node suite passed, including all 14 origin checks against installed D&D5e
  5.3.3. Foundry V13 restarted automatically after shutdown, responds on port
  30000, and serves the 0.3.0 manifest. World documents were not changed.
- [x] Install the current 0.3.2 build for testing (2026-09-27). Stop the
  FoundryV13 PM2 service, back up nine replaced files to
  `/home/patch/.local/share/FoundryVTT/ak5e-code-backup-1Ya7Rj`, and verify all
  30 deployed files by SHA-256. The full Node suite passed, including all 51
  origin/sheet/tracker/tag checks against installed D&D5e 5.3.3 and nine
  deployment regressions. Restart Foundry 13.351 and confirm HTTP 200 and the
  served AK5e 0.3.2 manifest on port 30000. The server remains at `/auth`;
  module activation and gameplay checks require entering the test World.
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
- [x] Add AK5e origin popup on owned-character drops, a sheet-header reopen
  button, choice validation, review, explicit apply, and duplicate-grant guard.
- [x] Fix v0.2.5 reopening with Foundry's ApplicationV2 header-controls hook
  plus a visible D&D5e character-header shortcut; test completed-record reopen,
  owner permissions, and duplicate-control prevention.
- [x] Fix the background Apply sheet crash by registering custom tool proficiency
  labels; add a regression using D&D5e's actual sheet preparation and resolver.
- [x] Validate 0.2.6 with the full Node suite and all 14 origin tests against the
  installed D&D5e 5.3.3 bundle; install the three changed module files with backup
  and matching hashes. Backup: `ak5e-code-backup-0.2.5-sheet-gobmfng9` under the
  Foundry User Data root. No World documents changed.
- [x] Scope origin and Arts controls to V13 ActorSheetV2/actor-sheet render
  hooks, show them only for relevant AK5e content, and clear stale Arts controls
  when that content is removed; cover these cases with Node UI regressions.
- [ ] Verify those controls in a live V13/D&D5e World on full and partial sheet
  renders, ordinary D&D5e actors, AK5e actors, and another actor document app.
- [x] Move the visible AK5e Origins button into the Details sidebar beside
  native race/background; show attached Species, Nationality and Background.
- [x] Scan all six generated chapters for resource candidates; document the
  reviewed Origin catalogue and unresolved class/equipment/NPC mappings in
  `ak5e/RESOURCE_AUDIT.md`, with a reproducible read-only inventory tool.
- [x] Add 33 reviewed Origin use-pool defaults, ten choice/list/additional-counter
  definitions, configured SP/Mettle displays, and manual native counters for
  other AK5e feats; preserve custom maxima and spent uses.
- [x] Add temporary target tags with native effects, optional feature copies,
  time/rest/turn/combat expiration and owner/GM manual removal; retain orphan
  cleanup receipts and test failures/permissions without base Actor rewrites.
- [x] Link Ægir Student/Teacher to removable proficiency/expertise effects,
  replacing the previous benefit; verify the source has no downed/death expiry.
- [x] Extend tags to Art/equipment sources and embedded weapon enchantments;
  add 53 reviewed Origin/Art/equipment profiles, concentration/OR expiry,
  current versus next-turn deadlines, scoped event confirmations, replacement
  receipts, Flock member uses, Missile Barrier motes and borrowed Treatise cards.
- [x] Provide source-guided custom tags for class/NPC and area-dependent effects,
  with manual native changes, shared replacement groups and permitted events.
- [x] Validate the expanded engine with 16 new tag regressions, full `npm test`,
  and all 51 optional installed D&D5e origin/sheet/tracker/tag checks.
- [ ] Verify native weapon enchantments, tag profile effects/counters, DialogV2
  source/profile selection, concentration deletion/disable/reload, consumed
  source survival, derived Treatise cleanup and non-stacking in a clean World.
- [x] Run full repository validation and the optional installed D&D5e 5.3.3
  regression; pass all 21 tracker/tag tests after final recovery/UI changes.
- [ ] Verify the new Origin/sidebar controls, native resource/effect preparation,
  rests, expiry, unlinked NPC tokens, manual recovery, reload persistence and
  multiple-client behavior in a clean World; see the smoke-test checklist.
- [ ] Review full Chapter 3 and referenced rules before adding source-specific
  class resource maxima, initiative gains, conversions or special rest behavior.
- [ ] Extend existing Dying helpers for Stop the Flow's temporary eight-Mettle
  exception after class-rule review; tracker controls preserve recorded excess.
- [ ] Confirm Player Character reopens after installing 0.2.6, preserving the
  Military School Graduate grants and completed setup record.
- [x] Test plans for all 33 backgrounds and 20 nationalities, including Officer
  tactics, equipment choices, preserved proficiencies, cancellation and failure.
- [x] Browser-test the actual v13 DialogV2 flow against an in-memory actor
  (choices, validation, Back, feature pages, review, Apply); validate all 53
  background/nationality plans with native D&D5e 5.3.3 data models.
- [ ] Verify popup and applied fields in live Foundry v13 / D&D5e 5.3.3, including
  a non-GM owner, rest recovery, reload persistence, and locked release packs.
- [ ] Extend species setup beyond feature-card review: ASIs, size variants,
  Ancient Versatility, Arts, and other feature-specific choices.
- [ ] Implement GM-reviewed Pathfinder conversion, proficiency replacement,
  origin respec/reversal, and Officer/Tactician shared-pool integration.
- [x] Re-check the full Node suite against the installed D&D5e 5.3.3 bundle
  (2026-09-24): all 14 origin tests passed with no skips; source, parser,
  helper, and installer checks passed.
- [x] Run all six installers twice in the in-memory Foundry harness: no
  duplicate folders or documents, no repeat updates, and non-GM calls create
  nothing. Force one Chapter 6 creature stale, refresh its managed Items, and
  confirm a user-added Item survives and the next run makes no changes.
- [ ] Re-run every installer in a live clean World and confirm that it is
  idempotent and does not duplicate folders or documents.
- [ ] Increase a content version in a test branch, migrate again in Foundry,
  and confirm managed content is refreshed while user-added Actor Items are
  preserved.
- [ ] Restart Foundry, reopen the World, and confirm documents, flags, embedded
  Items, and links persist.

As of 2026-09-27, the repository is 0.3.4; the installed module remains 0.3.2.
The installed-module checks above remain pending. Separate isolated clean-World
checks cover enhanced weapons and Operator SP; their exact scope is recorded in
ak5e/FOUNDRY_SMOKE_TEST.md. Do not treat those slices or installation verification
as full release-pack gameplay verification.

## 4. Verify all generated content

- [x] Read Chapter 3 in full and add its 320 exact Operator Skill feats,
  retaining table references, IDs, Continued sections, and the Cluster Bombs mapping.
- [x] Implement opt-in learned-Skill SP limits, stacked charging, GM-authoritative
  owner requests, persistent deduplication, native attack/HP hooks, and provenance.
- [x] Add activation, Instant/round/Long Rest lifecycle, manual endings/extensions,
  source-backed adjustments, and read-only PC/NPC tracker/setup/confirmation controls.
- [x] Test SP rules, source rows, simultaneous operations, ownership, two GM authority,
  synthetic Actors, forward turns/rewinds, Skill origins, and tracker rendering in Node.
- [x] Complete live SP multi-client/reload checks on Foundry 13.351 / D&D5e 5.3.3,
  then validate all 320 Skill Items after the playable slice. Native attacks,
  player HP application/rests, two owners/two GMs, synthetic pool isolation,
  expiry/rewinds and reload passed without browser errors; hardware acceleration
  was unavailable. Full repository validation passed with native system models.
- [x] Add level-2/7/14 Operator Skill popups, catch-up, legal class/Branch options,
  exact previews, Choose Later and a sheet/header reopen control.
- [x] Persist choices and grant markers, protect GM-authorized player learning,
  recover interrupted grants, and preserve SP and manual-resource state.
- [x] Add progression/choice regressions for all classes, branch unlocks, fixed
  choices, failed writes, concurrency, permissions and deferred notifications.
- [x] Verify 0.3.4 choices in isolated Foundry 13.351 / D&D5e 5.3.3: all three
  tiers, catch-up, cancellation/partial renders, automatic and interactive native
  advancement, two owners/two GMs, observer restrictions and reload persistence.
  Restart retained all three choices/Items and 7 SP with integration disabled.
  All 123 repository tests passed with native system checks enabled. Chromium
  used a software renderer; see the smoke-test record for scope and limits.
- [ ] Deploy 0.3.4 and export/test locked release packs as a separate task.

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
- [x] Audit generated description markup separately from source fidelity. The
  prior `sourceToHtml()` rendered each pipe-table line as its own `<pre>` block:
  357 records contained 5,417 such blocks across Chapters 1–6. The boundary
  and resolution are recorded in `ak5e/CONTENT_AUDIT.md`.
- [x] Render source tables as readable, accessible tables or another tested
  document presentation in `ak5e/tools/source-html.mjs`; preserve exact table
  values and source flags, regenerate, and review the affected chapters. Do not
  change generated chapter files directly. All 289 source table blocks now render
  as tables; the source-wide fixture and full Node suite pass.
- [ ] Advance the installer content version when ready to refresh existing World
  documents with the new table and paragraph markup; verify migration in a live
  test World.
- [ ] In a clean V13/D&D5e World, open representative rules journals, origin,
  class, equipment, Art, and creature documents. Check their sheets and source
  tables for legibility, scroll behavior, headings, and console errors; repeat
  after importing from locked release packs.

## 5. Add automated validation

- [x] Add `npm run install:foundry` for local V13 testing with a read-only
  preview, dependency/target checks, changed-code backups, SHA-256 verification,
  and temporary-directory deployment regressions. Preserve Worlds and packs.
- [x] Add a repeatable command that regenerates Chapters 1–6 and fails when the
  working tree changes unexpectedly.
- [x] Validate `ak5e/module.json`, `ak5e/lang/en.json`, and every `.mjs` file.
- [x] Assert expected document counts, unique slugs/IDs, supported document
  types, and required source-traceability flags.
- [x] Add fixture tests for source-section, table, HTML, and monster-statblock
  parsing.
- [x] Add unit tests for Dying/Mettle, Operator Skill Points, Arts Points,
  Oripathy, Rest Actions, Martial DC, and Damage Reduction edge cases.
- [x] Add a documented Foundry smoke-test checklist for behavior that cannot be
  tested in plain Node.js.
- [x] Add a shared full-Chromium browser-test launcher with `--enable-gpu`;
  require it for repository and temporary Playwright tests. The previous
  temporary browser scripts have been removed; Node-only tests need no GPU.
- [ ] Verify the shared browser launcher uses the physical GPU on this host,
  recording the actual renderer after GPU permissions and display/backend
  prerequisites are satisfied.

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

### Arts casting replacement

- [x] Implement 0.3.1 native PC/NPC Arts UI: header AP edits, Arts summary,
  availability badges, Castable now, Casting Unit shortcuts and NPC references.
- [x] Simplify the cast dialog with grant-aware defaults, legal levels, projected
  AP and specific blockers; separate configuration saves from adoption.
- [x] Add owner-checked absolute AP editing and Arts-only rest recovery, plus
  DOM/activity regressions for permissions, partial renders and token-local state.
- [x] Complete 0.3.1 live GM/player/observer browser validation of core casting,
  settings and recovery in a clean Foundry 13.351 / D&D5e 5.3.3 World.

- [x] Add owned-Actor Arts setup, AP display and configuration without resetting spent resources.
- [x] Show Arts Points and setup directly in the Spells tab, including empty spell lists and partial sheet renders; expose configured totals to sheet observers.
- [x] Verify native PC/NPC header/tab Arts controls, AP configuration and casting in a clean World; registration remains manual.
- [x] Implement and live-test activity adapter AP validation, upcasting, consumption and rest recovery.
- [x] Add migration preview and explicit adoption of existing spell Items.
- [x] Add pure-rule and mocked activity tests for costs, grants, recovery, adoption, cancellation and failed writes.
- [x] Live-test cancellation, repeat use, ninth-level limits, player ownership and observer visibility; test failed-write cleanup with mocks.
- [ ] Live-test partially failed consumption and guarded GM undo before claiming that failure-recovery workflow verified.
- [ ] Verify a playable Arts vertical slice in Foundry v13 / D&D5e 5.3.3.
- [ ] Expand casting profiles and source-specific discounts/free uses after the core slice.
- [ ] Add Artsblade, Bard, Ritualist and species-specific casting workflows.
- [x] Add cantrip turn tracking and Casting Unit/Infected casting checks.
- [ ] Complete and live-test Conductive casting bonuses.
- [ ] Complete pool grants and resolve external spell sources without inventing missing content.

### Other fidelity work

- [x] Add all 81 individual +1/+2/+3 weapon variants with source-backed rarity,
  base stats, native ordinary-weapon bonuses, and manual Conductive/Splash.
- [x] Preserve four combined upgrade references in Magic Item References;
  verify idempotent migration, customized fields, GM guards and Actor copies.
- [x] Live-test enhanced weapons on PC/NPCs in a clean V13/D&D5e World,
  including native bonuses, manual Splash, Casting Unit selection and restart.
- [ ] Export enhanced weapons into the future locked `ak5e.equipment` pack
  with stable document IDs and verify imports in another clean World.
- [ ] Add tested activities and Active Effects to one origin feature at a time.
- [ ] Add tested activities and Active Effects to one class/branch feature at a
  time.
- [ ] Implement and test AK5e-only equipment properties such as Brace,
  Conductive, Crush, and Splash without changing D&D5e globally.
- [x] Integrate Art casting with per-Actor Arts Points, Maximum Art Level, and
  the one-9th-level-Art-per-Long-Rest limit.
- [ ] Add tested activities for creature actions, reactions, legendary actions,
  lair actions, and mythic actions.
- [x] Add namespaced Lore, Wilderness and Technology fields and a GM-reviewed
  conversion from the stock combined skills.
- [ ] Provide a usable UI or packaged macros for helper-only mechanics instead
  of requiring browser-console calls.
- [ ] Evaluate condition automation individually, including timing, damage,
  penalties, action restrictions, and removal rules.
- [x] Add source-scoped Construct healing, reviewed Alternate Class switching,
  AP-only World spellcasting and ASI feat guards; retain GM instructions where
  native Foundry cannot determine provenance or turn accounting.
- [ ] Mark automation claims in documentation only after clean-World testing.

## 8. Polish the module

- [x] Preserve source paragraph separators in generated text and add readable
  paragraph/line spacing in descriptions, journals, and origin setup; replace
  the origin dialog's grid spacing with normal document flow for headings.
- [ ] Check the refreshed Ægir origin page and representative descriptions in
  live Foundry after deploying the formatting update and refreshing World content.
- [ ] Resolve malformed source emphasis around Basin Sea Reaper's Enrage
  (`**Enrage.***`); retaining paragraph boundaries exposes its extra asterisk.
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

- [x] Add a root README handoff guide with origin-setup architecture, known
  failures, focused task prompts, test commands, and safe deployment procedure.
- [x] Add a concise UI coding checklist covering lifecycle hooks, sheet controls,
  rerenders, DialogV2 forms, display configuration, and interaction testing.
- [ ] Re-run generation and regression checks after every approved source-book
  change.
- [ ] Re-test a representative sample after every Foundry VTT or D&D5e update.
- [ ] Update `compatibility.verified` only after testing that exact version.
- [ ] Increment the module version for every distributable update.

- [ ] Finish restoration of 21 installed D&D5e pack metadata pointers after
  stopping installed Foundry and approving recovery. See the 0.3.2 live test
  incident in `ak5e/FOUNDRY_SMOKE_TEST.md`; record data was verified unchanged.

## World-wide AK5e replacement follow-up (2026-09-28)

- [x] Add the Chapter 1 World switch, familiar Frightened/Surprised IDs and AK5e
  references, and remove native Surprised initiative disadvantage.
- [x] Add zero-HP Dying entry, native-death-save replacement, Mettle and Death's
  Door controls, massive damage, healing tracking, and persistent failed saves.
- [x] Guard native ASI-for-feat advancement and default multiclass creation;
  add GM-reviewed two-sheet Alternate Class switch.
- [x] Add GM preview and one-time combined-skill conversion with original values
  retained under AK5e flags.
- [x] Require configured Arts Points and level cap for stock casters, validate
  Casting Units, and test first damaging cantrip roll per combat turn.
- [x] Add LMD display, AK5e equipped-DR calculator, Corroded AC/DR adjustment,
  and selected-target Construct healing guard.
- [ ] Complete GM/player owner/observer regression for World rules, including
  damage at zero HP, natural-1/20 death rolls, healing exceptions, and
  class switching in modern D&D5e mode with player/observer clients.
- [x] Test an unconfigured stock caster with an available native slot: the
  Arts dialog disables Cast and leaves that slot untouched.
- [x] Test a configured stock caster's native activity use: spend 1 AP,
  preserve its available native spell slot, and require an equipped Casting Unit.
- [x] Test native ninth-level Art use, second-cast rejection, and Long Rest
  reset while preserving a native ninth-level spell slot.
- [ ] Test source-defined Casting Unit exceptions through native activity use.
- [ ] Add source-backed native activities for individual AK5e equipment
  properties after clean-World testing. Keep currently untested properties GM
  resolved in their Item descriptions.
- [ ] Export locked LevelDB release packs and test imports in another clean
  World with only AK5e enabled; verify stable UUID links and stock packs.
- [ ] Test 5.x versions beyond the installed D&D5e 5.3.3 before broadening the
  compatibility claim.
