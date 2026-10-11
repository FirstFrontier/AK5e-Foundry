# AK5e Foundry VTT — Project Workflow

> How to make progress on the **AK5e 1st Edition v1.3.1 → Foundry VTT Version 13** content module.
> Applies to everyone advancing the module, human or agent. Last revised: 2026-10-11.
> **The project rules in this file take precedence over the agent policy in [AGENTS.md](AGENTS.md)** whenever their instructions differ. Neither file overrides the user's explicit request or higher-priority environment/safety constraints.
> For how Claude Code and OpenAI Codex delegate this work to sub-agents, see [AGENTS.md](AGENTS.md).

## 1. Objective

Build **AK5e 1st Edition v1.3.1** as a **Foundry VTT Version 13 content module**
which depends on the **D&D5e game system**. Prioritize accurate, usable rules
content over custom automation. Do not create a standalone AK5e Foundry game
system unless the project owner explicitly changes this direction.

**Non-negotiable:** `ak5e` is the established package ID. Do not create a new World or system, rename the existing package, or modify Foundry's installed D&D5e system files.

## 2. Sources of truth

1. Treat the files in `AK5e_1.3.1_Foundry_Source/` as the **rules authority**.
2. Read `AK5e_1.3.1_Foundry_Source/README.txt` before working with the source.
3. Read the relevant source chapter **in full** before implementing content from it.
4. When a rule refers to another chapter, read that referenced section before deciding how to model it.
5. Preserve rule wording and numerical values. Do not invent omitted mechanics, extrapolate costs, or silently substitute D&D5e rules for distinctive AK5e rules.
6. Record uncertain mappings in a project decision log rather than silently guessing. Find and use an existing project decision log; if none exists, establish `DECISIONS.md` before recording unresolved implementation choices.
7. Distinguish the book's **explicit rules**, a **faithful Foundry representation**, a **manual play procedure**, and a **proposed automation or interpretation**. Do not conflate them.

What sub-agents may and may not decide about source content is in [AGENTS.md](AGENTS.md) section 6.1.

## 3. Package direction

Create a **module**, not a World or a new game system, with:

- A `module.json` manifest at the root of the installed `ak5e/` directory.
- Compatibility `minimum: "13"` and `verified: "13"` unless testing supports a different value.
- A D&D5e system relationship/dependency and system-restricted activation.
- Compendium packs for all distributed documents.
- Scripts only when a rule cannot be represented faithfully with D&D5e content alone.

Use the Foundry VTT **Module Maker** for initial pack creation where practical.
For source-controlled development, keep the module directory and its manifest
in this repository. Do not edit Foundry's installed D&D5e system files.

### 3.1 Foundry VTT 13 integration requirements

**Before changing the manifest, runtime hooks, document importers, or packs, read the
"Foundry VTT installation and integration" section of `ak5e/README.md`.** Treat
its linked **Foundry VTT Version 13** API pages as the platform authority.

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
- Gate **world administration** (installers, imports, migrations, world
  settings, pack edits) behind `game.user.isGM`, make installers **idempotent**,
  namespace persistent state under `flags.ak5e`, and **never auto-import all
  content from a lifecycle hook**. Actor-level play actions follow §3.2.
- Ship content through manifest-declared **LevelDB compendium directories**.
  Actor, Item, and Adventure packs require `"system": "dnd5e"`. Keep stable IDs
  for UUID links and test imports from **locked release packs in a clean World**.
- A manifest-URL installation is not release-ready until `module.json` has
  stable public `manifest` and version-specific `download` URLs and the
  downloaded ZIP installs cleanly.
- Confirm exact V13 manifest schemas and API signatures against the project's
  pinned documentation and installed system versions; do not import syntax from
  Foundry V12/V14 or assume all D&D5e versions expose the same data fields.

### 3.2 Table-play philosophy: trust the table

The module assists the table; it does not police it. Assume the party plays in
good faith and defers to the GM. Apply these rules to every gameplay helper,
sheet control, chat card and Art/Skill/feature workflow:

1. **No GM approval for play.** An Actor's owner may use that Actor's
   abilities, Skills, features, Arts, items and resources without a GM approval
   step, at any time, including outside their turn or outside combat. Do not
   add turn-order, combat-state or GM-presence checks that block a use. These
   may appear as warnings only.
2. **Unowned targets use an automatic relay, not an approval.** When a use must
   change a document the user does not own (damage, conditions or effects on an
   enemy, for example), relay that one validated operation to the active GM's
   client. Reuse the request / elected-GM commit path in
   `ak5e/scripts/operation-kernel.mjs` (or the module socket where the kernel
   does not fit). That client applies it automatically, with no human prompt.
   If no GM is connected, tell the player it could not be applied yet. Do not
   queue it silently and do not drop it. Relay only the specific operation
   requested, never arbitrary document updates.
3. **Warn, don't block.** Before a use, check range to the targeted tokens (when
   tokens and range data exist), source prerequisites, required features or
   equipment, resource sufficiency, and action-economy or timing conditions.
   List every failed check as a warning in the confirm dialog and offer **Use
   anyway**. Hard-stop only for things that cannot be done technically, such as
   a missing Actor or Item, a malformed operation, or no GM available to relay
   to.
   - **Overrides are public.** When the player uses **Use anyway**, the public
     chat card for that use lists each overridden warning (for example "Out of
     range: 45 ft / 30 ft"), so the whole table can see it.
   - **Overspent resources clamp at 0.** If the player overrides a resource
     shortfall (AP, SP, uses, charges), set the resource to 0, never a negative
     value, and show the shortfall on the chat card (for example "AP short by
     2"). The undo receipt restores the exact prior value.
   - **Missing GM ruling: the player picks for this use.** When a use depends on
     unresolved source text the GM has not ruled on (see `ak5e/DECISIONS.md`),
     the confirm dialog presents the possible readings and the player picks
     one. The choice applies to that use only, is shown on the chat card, and is
     never saved as a ruling. A GM-recorded ruling, when present, is applied
     instead and the choice is not offered.
4. **Always confirm before use.** Every ability, AK5e Skill, feature, Art or
   item use that the module starts or wraps shows a confirm step before any
   resource is spent or any document changes. That step summarises the cost,
   targets and warnings. Reuse the native D&D5e activity usage dialog where it
   already does this, but do not let the module skip it (for example via a
   fast-forward path). Cancelling must change nothing. **Ability checks**
   (including skill checks such as Athletics or Perception) and **saving
   throws** need **no** confirm step, whether they come from D&D5e or from the
   module; they keep D&D5e's own roll behaviour.
5. **Never auto-roll the player's dice.** Never evaluate **damage, healing
   (including temporary HP), attack, saving throw, or feature/cost dice** (for
   example an AP cost die or Unending's d6) on the player's behalf. Post the use
   to chat (or a dialog) with a roll button that the player clicks. When a use
   calls for a saving throw, post a save button that the target's owner clicks
   (the player for player characters, the GM for NPCs). Do not roll the save for
   them. Module code may change a
   roll the player starts, such as adding a formula part or a cantrip scaling
   patch, but must not start one. Other rolls follow D&D5e defaults unless a
   decision in `ak5e/DECISIONS.md` says otherwise.
6. **Everything is reversible within the current encounter window.** Every
   module-initiated change to an Actor or Item (resources, uses, AP/SP, flags,
   effects, relayed target changes) records an undo receipt under `flags.ak5e`
   with enough data to restore the prior values. The acting user (or the Actor's
   owner) and any GM can undo it from its chat card or the sheet, and undo also
   reverses relayed target changes. Any receipt in the current window can be
   undone, not only the latest. Windows are per encounter: **starting a combat
   locks every receipt from before it, and ending a combat locks every receipt
   from that combat.** A locked receipt shows as locked rather than vanishing.
   An undo is noted on the public chat card. Where a later change in the same
   window makes a clean undo unsafe, warn and show what will and will not be
   restored before going ahead. Do not refuse silently.
7. **What stays GM-only.** World administration stays GM-gated, exactly as in
   §3.1: installers, imports, migrations, world settings, compendium and pack
   edits, folder and RollTable installation, and recording a GM *ruling* on
   unresolved source text. The GM can always override or undo any use.

## 4. Step-by-step content workflow

### 4.1 Establish the module skeleton

1. Use the existing stable package ID **`ak5e`** and the matching module directory.
2. Create or maintain the root `module.json`; do not introduce a second manifest.
3. Populate title, description, authors, version, compatibility, and D&D5e
   relationship information.
4. Create only needed directories: `packs/`, `assets/`, `scripts/`, `styles/`,
   `templates/`, and `lang/`.
5. Start Foundry VTT 13 and confirm the package appears and can be enabled
   in a **clean D&D5e World** before adding content.

### 4.2 Make a content map before importing

1. List **every source heading and table** that becomes a Foundry document.
2. Assign each entry a target document type, source chapter, and pack name.
3. Prefer the following initial pack layout (the `ak5e.` prefix denotes the
   full package-qualified pack ID; verify manifest pack names and types):

   | Pack ID | Target content |
   | --- | --- |
   | `ak5e.rules` | Journal Entries and pages for retained rules text. |
   | `ak5e.origins` | Origin, ancestry, lineage, and background-like Items. |
   | `ak5e.classes` | Class, subclass, and class-feature Items. |
   | `ak5e.talents` | Talents, upgrades, and other feature Items. |
   | `ak5e.arts` | Arts, using closest D&D5e spell/item type until automation is justified. |
   | `ak5e.equipment` | Weapons, armour, tools, consumables, and modifications. |
   | `ak5e.creatures` | Bestiary Actors. |
   | `ak5e.tables` | RollTable documents. |

4. Split packs further only when size or navigation warrants it.
5. Keep each original source heading in the entry description or dedicated
   source field so every entry is traceable.
6. Track progress, source coverage, blockers, and newly discovered work in
   `TODO.md`; do not mark a source section complete on the strength of a file
   generation script alone.

### 4.3 Implement content in a safe order

1. Import a small **vertical slice** first: one ancestry/origin, one class,
   several features, one Art, one equipment item, and one creature.
2. Verify exact text, numbers, uses, activation costs, duration, range,
   damage, and saving throws against the source.
3. Add Journal pages for rules that do not fit cleanly into item fields.
4. Link compendium entries **only after IDs and pack locations are stable**.
5. Use Foundry's **Keep Document IDs** export option when cross-links must survive
   export from a development World.
6. Expand chapter by chapter only after the vertical slice works in a fresh World.
7. Import or regenerate content deterministically, preserving stable IDs,
   existing links, and authored adjustments; never replace entire packs without
   checking migration and data-loss effects.

### 4.4 Model rules with progressive fidelity

1. Start with native D&D5e fields, effects, activities, chat cards, and
   item descriptions.
2. Use explicit **manual instructions** in descriptions when automation would
   be misleading, lossy, or fragile.
3. Add Active Effects only when their duration, targets, and mechanical impact
   are unambiguous in the source.
4. Add module JavaScript only for a repeatable AK5e mechanic that existing D&D5e
   functionality cannot faithfully express.
5. Keep automation isolated, documented, and tested. Do not globally change
   D&D5e core behavior without an explicit, logged project decision.
6. Do not label descriptions/manual instructions as automatic mechanics.

## 5. Testing, in-Foundry inspection, and release

### 5.1 Test every increment

1. Test in a **new D&D5e World with only AK5e enabled**.
2. Create/import a representative character and NPC from the module packs.
3. Test rolls, item use, saving throws, effects, resource consumption, and
   compendium links against the book and acceptance criteria.
4. Check browser developer-console errors and Foundry warnings.
5. Re-open the World after restarting Foundry to check persisted documents
   and links.
6. Re-test representative content after every Foundry VTT or D&D5e upgrade.
7. Verify stable document/pack IDs, `Compendium.ak5e...` UUID links, and imports
   from locked release packs in a **clean World**, not only editable dev packs.
8. Where automation is intentionally absent, verify its manual instructions are
   visible, accurate, and usable at the table.
9. Exercise uses as a **player (non-GM) user** (§3.2): the confirm step is shown,
   warnings are listed, can be overridden and appear on the public chat card,
   out-of-turn use is allowed, overspent resources clamp at 0 with the shortfall
   shown, no damage/healing/attack/save/feature dice are rolled until the owner
   clicks, ability checks and saves have no extra confirm step, and undo restores the
   prior state (including relayed target changes) until the encounter window
   locks at combat start or end.

### 5.2 Mandatory Foundry UI and interaction inspection

For changes to manifests, packs, sheets, item activities, compendium navigation,
importers, or presentation, **launch and visually inspect Foundry VTT 13** with
`dnd5e`. Inspect the actual rendered result; tests and source reads alone do not
establish that the module is usable.

At a minimum for affected surfaces:

- Confirm module activation, relevant compendium folders/packs and descriptions.
- Open representative Items, Actors, Arts, Journals, RollTables, and linked UUIDs.
- Check legibility, formatting, missing text/images, tooltips, scroll/clipping,
  warnings and console errors.
- Exercise relevant drag/drop, sheet rendering, activation, rolls, resource
  updates, Active Effects, and persistence across reloads.
- Inspect both GM and player visibility/permissions when relevant.
- Capture screenshots if supported and **actually review them**. Viewing may be
  delegated to a sub-agent that opens each image and returns a written report
  (see AGENTS.md section 6.2). Fix and re-test observed visual defects; do not
  claim inspection without a rendered session.
- Use safe test data and avoid mutating the project owner's production World.

### 5.3 Project-specific Playwright/Chromium requirement

For **all Playwright Chromium tests**, including temporary `/tmp` scripts, use
**`launchTestBrowser()` from `ak5e/tools/test-browser.mjs`**. It selects full
Chromium headless mode and requests hardware acceleration with `--enable-gpu`.

- Do **not** disable the GPU or force SwiftShader for routine tests.
- Record the **actual renderer** before claiming hardware acceleration works.
  A `--enable-gpu` request is not proof of GPU rendering. If unavailable,
  state the environment limitation rather than fabricating success.
- Always close browsers in a `finally` block, including on errors.
- Never replace the project's launcher with a new bare
  `chromium.launch(...)` in a throwaway test script.

### 5.4 Release safely

1. Increment the module version for every distributable update.
2. Validate `module.json` JSON and confirm its `id` matches the module directory.
3. Verify required `dnd5e` relationships, pack metadata, compatibility, and
   release download/manifest URLs; test actual installation from a clean ZIP
   or stable manifest URL rather than only the development directory.
4. Include a concise changelog and known limitations.
5. **Do not publish** text, artwork, or data without confirming licensing and
   attribution allow redistribution. Rules/source availability inside the repo
   is not by itself permission to redistribute them.
6. Do not call the release complete if clean-World import, in-app inspection,
   stable UUID links, or licensing checks have not been performed.

## 6. Source chapter routing

| Source file | Primary Foundry outputs |
| --- | --- |
| `01_chapter_1_changing_the_game.txt` | Rules Journals, conditions, rule references. |
| `02_chapter_2_character_origins.txt` | Ancestry/origin/background Items and Journals. |
| `03_chapter_3_character_classes.txt` | Classes, subclasses, features, talents, summons. |
| `04_chapter_4_equipment.txt` | Equipment and modification Items. |
| `05_chapter_5_arts.txt` | Art Items, supporting Journals, roll/target data. |
| `06_chapter_6_dwellers_of_terra.txt` | Creature and NPC Actors, encounter tables. |

## 7. Repository guardrails and change tracking

- Preserve existing user changes; **never overwrite Foundry data directories**.
- Keep **`TODO.md` current throughout the work**: mark completed segments,
  add newly discovered tasks, split work when that improves tracking, and
  remove items no longer relevant.
- Do not mass-import the book before a vertical slice has been tested.
- Do not invent missing mechanics, falsely claim automation, or silently resolve
  ambiguous source text.
- Prefer a correct documented **manual workflow** to incorrect automation.
- Any disagreement between source rules and D&D5e fields must be recorded as
  an explicit design choice and assessed for rules fidelity before coding.

## 8. Development loop

1. **Understand:** read the requested source and relevant code/docs, inspect `git status`, and check existing tests.
2. **Plan proportionately:** define observed behavior, rules authority, Foundry representation, affected files/packs, risks, and acceptance criteria. Avoid long plans for trivial edits.
3. **Delegate selectively:** follow [AGENTS.md](AGENTS.md) when outsourcing bounded discovery, implementation or test tasks; keep ambiguous AK5e rules interpretation with the main agent and log decisions.
4. **Implement a small coherent patch:** follow existing architecture, avoid unrelated refactors, preserve stable IDs and module compatibility, and update `TODO.md`.
5. **Test:** run appropriate lint/static tests, unit checks, pack/manifest validation and Foundry integration tests; do not stop at compilation.
6. **Observe:** render in the real Foundry V13 + D&D5e application when any visible behavior/content may have changed. Use the required `launchTestBrowser()` helper for all Playwright Chromium tests.
7. **Review:** assess code correctness, source fidelity, user experience, player agency per §3.2 (no approval gates, confirm step, no auto-rolled dice, reversible), security, regression risk and test adequacy; fix detected issues and re-run relevant checks.
8. **Report:** distinguish implementation, unexecuted plans, tests actually run, in-app visual findings and remaining blockers.

**Actual rendered validation is mandatory for user-facing changes.** Test the specific Foundry windows, documents, pages and workflows affected. Observe screenshots (directly or through a sub-agent's written visual report per AGENTS.md section 6.2), not just screenshot filenames; look for missing text/images, overflow, dark-theme readability, incorrect roll controls, inappropriate permissions and broken links. Exercise representative interactions and reload/restart persistence. If a GUI/browser cannot be accessed, report *visual inspection not performed*, what is unverified and useful manual reproduction steps. Never fabricate UI observations, hardware rendering evidence, or test results.

**Verified usability in Foundry is the finish line.**
