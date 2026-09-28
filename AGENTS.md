# AK5e Foundry VTT Build Instructions

## Objective

Build **AK5e 1st Edition v1.3.1** as a Foundry VTT Version 13 content module
which depends on the D&D5e game system. Prioritize accurate, usable rules
content over custom automation. Do not create a standalone AK5e Foundry game
system unless the project owner explicitly changes this direction.

## Sources of Truth

1. Treat the files in `AK5e_1.3.1_Foundry_Source/` as the rules authority.
2. Read `AK5e_1.3.1_Foundry_Source/README.txt` before working with the source.
3. Read the relevant source chapter in full before implementing content from it.
4. When a rule refers to another chapter, read that referenced section before
   deciding how to model it.
5. Preserve rule wording and numerical values. Do not invent omitted mechanics.
6. Record uncertain mappings in a project decision log rather than silently
   guessing.

## Package Direction

Create a module (not a World and not a new game system) with:

- a `module.json` manifest at the module root;
- compatibility `minimum: "13"` and `verified: "13"` unless testing supports a
  different value;
- a D&D5e system relationship/dependency;
- compendium packs for all distributed documents;
- scripts only when a rule cannot be represented faithfully with D&D5e content
  alone.

Use the Foundry VTT Module Maker for initial pack creation where practical.
For source-controlled development, keep the module directory and its manifest
in this repository. Do not edit Foundry's installed D&D5e system files.

## Foundry VTT 13 Integration Requirements

Before changing the manifest, runtime hooks, document importers, or packs, read
the **Foundry VTT installation and integration** section of `ak5e/README.md`.
Treat its linked Foundry VTT Version 13 API pages as the platform authority.

- Keep `module.json` at the root of the installed `ak5e/` directory, keep its
  `id` equal to `ak5e`, restrict activation to `dnd5e`, and retain the D&D5e
  system relationship. Do not turn this package into a World or game system.
- Use `Hooks.once("init", ...)` only for registration and `CONFIG` changes.
  Register settings there, but do not read them until `setup`. Use `ready` for
  world collections, UI, and the public `game.ak5e` API.
- Prefer configured document implementations such as
  `Item.implementation.createDocuments(...)` and
  `Actor.implementation.createDocuments(...)`; use embedded-document methods
  on the parent Actor or Journal Entry.
- Gate world mutations behind `game.user.isGM`, make installers idempotent,
  namespace persistent state under `flags.ak5e`, and never auto-import all
  content from a lifecycle hook.
- Ship content through manifest-declared LevelDB compendium directories. Actor,
  Item, and Adventure packs require `"system": "dnd5e"`. Keep stable IDs for
  UUID links and test imports from locked release packs in a clean World.
- A manifest URL install is not release-ready until `module.json` has stable
  public `manifest` and version-specific `download` URLs and the downloaded zip
  installs cleanly.

## Step-by-Step Workflow

### 1. Establish the module skeleton

1. Choose a stable, lowercase, hyphenated package ID, such as `ak5e`.
2. Create the matching module directory and root `module.json`.
3. Populate title, description, authors, version, compatibility, and D&D5e
   relationship information.
4. Create only the folders that are needed: `packs/`, `assets/`, `scripts/`,
   `styles/`, `templates/`, and `lang/`.
5. Start Foundry VTT 13 and confirm the package appears and can be enabled in a
   clean D&D5e World before adding content.

### 2. Make a content map before importing

1. List every source heading and table that becomes a Foundry document.
2. Assign each entry a target document type, source chapter, and pack name.
3. Prefer the following starting pack layout:

   - `ak5e.rules` — Journal Entries and pages for retained rules text.
   - `ak5e.origins` — origin, ancestry, lineage, and background-like Items.
   - `ak5e.classes` — class, subclass, and class-feature Items.
   - `ak5e.talents` — talents, upgrades, and other feature Items.
   - `ak5e.arts` — Art entries, represented by the closest D&D5e spell/item
     type until custom automation is justified.
   - `ak5e.equipment` — weapons, armour, tools, consumables, and modifications.
   - `ak5e.creatures` — bestiary Actors.
   - `ak5e.tables` — RollTable documents.

4. Split packs further only when their size or user navigation warrants it.
5. Keep the source heading in each description or a dedicated source field so
   every entry remains traceable.

### 3. Implement content in safe order

1. Import a small vertical slice first: one ancestry/origin, one class, several
   features, one Art, one equipment item, and one creature.
2. Verify the exact text, numbers, uses, activation cost, duration, range,
   damage, and saving throw against the source.
3. Add Journal pages for rules that do not fit cleanly into item fields.
4. Link related compendium entries only after their IDs and pack locations are
   stable.
5. Use Foundry's “Keep Document IDs” export option when stable cross-links need
   to survive export from a development World.
6. Expand by chapter after the vertical slice works in a fresh World.

### 4. Model rules with progressive fidelity

1. First use native D&D5e fields, effects, activities, chat cards, and item
   descriptions.
2. Use a manual instruction in the item description when automation would be
   misleading or fragile.
3. Add an Active Effect only when its duration, target, and mechanical impact
   are unambiguous in the source.
4. Add module JavaScript only for a repeatable AK5e mechanic that cannot be
   represented accurately with existing D&D5e facilities.
5. Keep automation isolated, documented, and tested; never change D&D5e core
   behavior globally without an explicit project decision.

### 5. Test every increment

1. Test in a new D&D5e World with only this module enabled.
2. Create/import a representative character and NPC from the module packs.
3. Test rolls, item use, saving throws, effects, resource consumption, and
   compendium links.
4. Check browser developer-console errors and Foundry warnings.
5. Re-open the World after a restart to check persisted documents and links.
6. Re-test a small sample after every Foundry VTT or D&D5e system upgrade.

For all Playwright Chromium tests, including temporary `/tmp` scripts, use
`launchTestBrowser()` from `ak5e/tools/test-browser.mjs`. It selects full Chromium
headless mode and requests hardware acceleration with `--enable-gpu`. Do not
disable the GPU or force SwiftShader for routine tests. Record the actual
renderer before claiming hardware acceleration works; if hardware is unavailable,
report the environment limitation. Always close browsers in `finally`.

### 6. Release safely

1. Increment the module version for every distributable update.
2. Validate `module.json` as JSON and confirm its package ID matches its
   directory name.
3. Test installation from a clean zip or manifest URL, not only the development
   directory.
4. Include a concise changelog and known limitations.
5. Do not publish text, artwork, or data without confirming that its license and
   attribution allow redistribution.

## Source Chapter Routing

| Source file | Primary Foundry outputs |
| --- | --- |
| `01_chapter_1_changing_the_game.txt` | rules journals, conditions, rule references |
| `02_chapter_2_character_origins.txt` | ancestry/origin/background Items and journals |
| `03_chapter_3_character_classes.txt` | classes, subclasses, features, talents, summons |
| `04_chapter_4_equipment.txt` | equipment and modification Items |
| `05_chapter_5_arts.txt` | Art Items, supporting journals, roll/target data |
| `06_chapter_6_dwellers_of_terra.txt` | creature and NPC Actors, encounter tables |

## Guardrails

- Preserve existing user changes and do not overwrite Foundry data directories.
- Use `apply_patch` for repository edits.
- Keep `TODO.md` current as work progresses: mark completed segments, add newly
  discovered tasks, split work when that improves tracking, and remove tasks
  that are no longer needed.
- Do not mass-import the full book before the vertical slice has been tested.
- Do not claim a mechanic is automated unless a clean test proves it.
- Prefer a correct documented manual workflow to incorrect automation.
