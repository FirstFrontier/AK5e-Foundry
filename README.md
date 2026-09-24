# AK5e Foundry — developer handoff guide

Use this guide to continue development with GPT-5.6 Sol, Terra, or another
coding assistant without reconstructing the previous conversation. It explains
how the origin popup was built, how to extend it, and how to test and deploy a
change safely. It does not replace [AGENTS.md](AGENTS.md).

Player installation and usage instructions are in [ak5e/README.md](ak5e/README.md).
The backlog is [TODO.md](TODO.md); mapping decisions are in
[ak5e/DECISIONS.md](ak5e/DECISIONS.md).

## 1. Current state: start here

September 13 sheet fix: **0.2.6** is installed locally. Applying Military School
Graduate exposed a missing `CONFIG.DND5E.toolProficiencies` label registration:
D&D5e tried a base-item lookup with an undefined ID while preparing the sheet.
`registerOriginConfig()` now supplies those labels. The full Node suite and all
14 origin tests with the installed D&D5e 5.3.3 bundle passed. The optional
`origin-sheet.test.mjs` reproduces the old crash using the actual system methods
and verifies the fix. No World data changed. Restart/reload and a live reopen of
Player Character remain to be confirmed; existing grants need no migration.
The earlier handoff snapshot follows.

This is a **content module for Foundry VTT 13 and D&D5e**, not a standalone game
system. At this handoff, the module version is **0.2.5**, developed against
Foundry **13.351** and D&D5e **5.3.3**. Check the files and installed versions
again before working; these are a snapshot, not permanent assumptions.

The origin menu covers 33 backgrounds and 20 nationalities. It opens when an
AK5e-tagged origin Item is created on an owned character. Players can also use
the **AK5e Origins** button in the character sheet's header for existing Items.
The steps are choices → feature rules → review → explicit Apply.

Military School Graduate is the main regression example: Messenger Kit
proficiency, another tool/vehicle choice, two of six Basic Tactics, Officer,
and a 3-Acumen tracker. Pioneer is the simpler example: toolkit choices and
Frontier Knowledge. Toolkit proficiency does not give the player a free kit.

Do not mistake the menu for complete rules automation:

- Species setup adds/reviews feature cards, including inherited features. ASIs,
  size variants, Ancient Versatility and Arts choices still need implementation.
- Pathfinder's proficiency-point conversion needs GM reconciliation.
- Conditional bonuses, tactic resolution, resource expenditure and later
  Officer/Tactician pool merging remain manual.
- Origin replacement/respec and simultaneous application by different owners
  are not supported as transactional workflows.
- Release compendiums, public installation URLs and distribution permissions
  are still pending. Development installers are not a finished pack release.

## 2. Give the next model a bounded task

Use one reproducible problem or one feature at a time. Avoid requests such as
“finish all character creation” when you need one missing choice. Include the
origin name, expected rule, actual behavior, installed versions, and any console
error. Screenshots help identify the screen, but are not proof of the cause.

Copy this prompt into the next session and fill in the brackets:

```text
Work in /home/patch/AK5e-Foundry. Read the root README.md handoff guide and
AGENTS.md, then the required source/integration references for this task.

Task: [one specific bug or feature].
Reproduction: [World, character, origin, exact actions, actual result].
Expected result: [player-visible behavior and source rule/heading].

Preserve all existing changes. Use the existing origin-setup architecture;
do not rebuild the module or change D&D5e system files. Work locally without
spawning other agents. Inspect only relevant implementation files, but read
the complete required source chapter as AGENTS.md requires. Keep output from
large generated files and source maps out of the conversation.

Add regression tests, run the targeted suite, then npm test. Keep TODO.md and
the relevant documentation current. Distinguish unit/schema/UI tests from
live-World verification. If blocked, state the exact missing access or evidence.

Deployment: [repository-only / copy the tested changed module files to the
confirmed installed ak5e directory, with a backup and required permission].

Finish with: what changed, tests actually run, whether files were copied,
what I must restart/click, and any remaining limitation.
```

Keep a short handoff after each task: affected functions, decisions, exact test
results, deployment status and next unresolved issue. This is more useful to
the next model than the entire debugging transcript. This documentation-only
task does not authorize future agents to deploy or change World data by itself.

## 3. Find the correct file

| Responsibility | File |
| --- | --- |
| Module identity, version, script/CSS registration | `ak5e/module.json` |
| Lifecycle registration, public API, World installers | `ak5e/scripts/ak5e.mjs` |
| Origin choices, validation, grants, popup and sheet button | `ak5e/scripts/origin-setup.mjs` |
| Popup layout | `ak5e/styles/origin-setup.css` |
| Origin regression tests | `ak5e/test/origin-setup.test.mjs` |
| Generated origin records | `ak5e/scripts/chapter-two-content.mjs` |
| Generator for those records | `ak5e/tools/build-chapter-two-content.mjs` |
| Tactics and equipment reused by setup | `ak5e/scripts/chapter-three-content.mjs`, `ak5e/scripts/chapter-four-content.mjs` |
| Validation command definitions | `package.json` |
| Live test checklist and evidence boundaries | `ak5e/FOUNDRY_SMOKE_TEST.md` |

Start with `git status --short` and `git diff --stat`. This repository has
pre-existing tracked and untracked changes; do not reset or discard them.
Use `rg` to locate functions. Do not print entire generated content modules:
their HTML and raw-source fields can make a few lines enormous. For example:

```bash
rg -n 'buildOriginPlan|prepareOriginChanges|registerOriginHooks' ak5e/scripts/origin-setup.mjs
node --input-type=module - <<'JS'
import { CHAPTER_TWO_ORIGINS } from './ak5e/scripts/chapter-two-content.mjs';
const entry = CHAPTER_TWO_ORIGINS.find(e => e.name === 'Military School Graduate');
console.log({ id: entry.id, kind: entry.kind, parent: entry.parent });
JS
```

Rules authority: read `AK5e_1.3.1_Foundry_Source/README.txt`, then the complete
relevant chapter before implementing its content. For origins, that is Chapter
2. Read referenced sections before modeling cross-chapter mechanics: Officer
uses Chapter 3's Tactician rules; equipment uses Chapter 4; skill mappings use
Chapter 1. Use manageable chunks and continue past truncated output. Do not
substitute this guide or generated summaries for required source reading.

Before changing hooks, importers, the manifest or packs, read the **Foundry VTT
installation and integration** section of `ak5e/README.md` and consult its
linked v13 API documentation. For D&D5e-specific behavior, inspect the installed
version's code read-only rather than assuming an older system schema still fits.

## 4. How the popup works

### What maintained D&D5e modules do with sheet UI

| Reference | Observed approach | Lesson for AK5e |
| --- | --- | --- |
| [Custom D&D 5e actor-sheet code](https://github.com/Larkinabout/fvtt-custom-dnd5e/blob/main/scripts/actor-sheet.js) | Registers `renderActorSheetV2` handlers, checks the sheet type before editing HTML, gates individual changes with settings, and applies whole-window behavior only when the rendered element is the application frame. | Scope a handler to the intended sheet and HTML part; avoid running every UI edit for every Actor window. |
| [Tidy 5e Sheets integration guide](https://kgar.github.io/foundry-vtt-tidy-5e-sheets/) | Shows that `renderActorSheetV2` runs for full and partial renders, checks for a Tidy sheet, and targets a named sheet part. Its `data-tidy-render-scheme="handlebars"` attribute is specific to Tidy's render pipeline. | Treat each render as a fresh part: inspect the supplied element, use a stable local target, and prevent duplicate controls. Add Tidy-specific markup only in an explicit Tidy adapter. |

[Foundry V13's header-control hook](https://foundryvtt.com/api/v13/functions/hookEvents.getHeaderControlsApplicationV2.html)
adds entries to the window menu; a sheet render hook modifies the sheet body.
AK5e uses both: `getHeaderControlsApplicationV2` for the three-dot menu and
`renderActorSheetV2` for visible Origin and Arts controls. It checks
`ActorSheetV2`, ownership, and AK5e Item/Actor flags before showing controls.
The Arts tracker targets the Spells tab when that tab renders. These patterns
are based on the referenced modules; the exact selectors and behavior still
need a live check with the installed Foundry and D&D5e versions.

### UI coding checklist

Start in [`ak5e/scripts/origin-setup.mjs`](ak5e/scripts/origin-setup.mjs).
Reuse `registerOriginHooks()`, `page()`, and `openOriginSetup()` as working
patterns. Inspect the installed Foundry/D&D5e version before using a new API.

Generated rules descriptions use a different path: the chapter builders call
[`ak5e/tools/source-html.mjs`](ak5e/tools/source-html.mjs), then the installers
place that HTML in native D&D5e Item, Actor, and Journal documents. Fix shared
description formatting in that converter and regenerate from the source; do not
patch generated files or use an actor-sheet render hook to rewrite rule text.
The [content audit](ak5e/CONTENT_AUDIT.md) records a pending table-presentation
issue and the live sheet checks needed to verify any fix.

| Need | Use | Watch out for |
| --- | --- | --- |
| Register configuration | `init` | Register settings here; read them from `setup` onward. |
| Access actors or expose `game.ak5e` | `ready` | Never auto-import content from a lifecycle hook. |
| Add a sheet's three-dot menu entry | `getHeaderControlsApplicationV2` | Give it a unique action, owner check, and `onClick`. |
| Add a visible sheet button | `renderActorSheetV2(app, element)` | Query inside `element`; it may contain a full sheet or one rerendered part. |
| Show a multi-step dialog | Existing `page()` helper | Wait for the outgoing dialog's close event before opening the next page. |
| Save changes | Await Document/embedded-document methods | Changing HTML or assigning to `actor.system` does not persist data. |

Follow these rules when editing UI code:

1. **Scope every handler.** Check document type and ownership. Drop handlers
   must also check the initiating user, AK5e flags, and the generated-item guard.
   Recheck permission when applying changes; hiding a button is insufficient.
2. **Expect rerenders.** Restrict sheet controls to ActorSheetV2 instances and use the actor-sheet render hook for visible controls. Use namespaced selectors such as
   `.ak5e-origins-button`. Skip insertion when the button/action already exists;
   return safely when its target is absent. The current D&D5e header target is
   `.sheet-header .right`; verify it after system upgrades. Avoid global DOM
   queries and repeated document-level listeners.
3. **Wire buttons explicitly.** Use `type="button"` for injected controls and
   `preventDefault()` where needed. Catch asynchronous errors, log the stack,
   and show a useful notification. Do not return a Promise from document hooks.
4. **Read the right form.** DialogV2 callbacks receive `(event, button, dialog)`;
   use `new FormData(button.form)` and `getAll()` for checkbox groups. Preserve
   choices on Back, validate before advancing, and grant benefits only on Apply.
   Use `textContent` or escape dynamic text before inserting it into HTML.
5. **Supply display configuration too.** For every custom tool, register both
   `CONFIG.DND5E.tools[key] = { label, ability }` and
   `CONFIG.DND5E.toolProficiencies[key] = label`. In D&D5e 5.3.3, `tools.label`
   alone causes an undefined compendium-ID lookup when rendering proficiencies.
   Valid actor data does not prove the sheet can render it.
6. **Test the complete interaction.** Open → choose → Back → Apply → close →
   reopen → reload. Also test cancellation, invalid choices, non-owner access,
   and repeated renders. Check console errors and saved fields. Run
   `npm run test:origins`; set `AK5E_DND5E_BUNDLE` to the installed `dnd5e.mjs`
   to include the actual sheet-method regression. Report live-World testing
   separately from Node/schema tests.

After deployment, restart Foundry and reload the browser. Installer macros can
correctly say “already installed”: they refresh content, not loaded UI code.

The implementation separates planning from persistence. Keep that separation:

1. `registerOriginConfig()` adds namespaced tools and skills during `init`.
   It does not rename/delete the stock skills. Settings must not be read in init.
2. During `ready`, `registerOriginHooks()` registers `createItem` and the
   character-sheet button. World imports, other users' events, and the wizard's
   own generated feature Items must not trigger another popup.
3. `getOriginEntry(item)` resolves `flags.ak5e.chapterTwoId` against generated
   source records. A name alone is not enough to opt a stock Item into setup.
4. `buildOriginPlan(entry, actor)` returns required choices, fixed grants,
   features and explicitly manual rules. It changes no documents.
5. `validateOriginChoices(plan, values, actor)` rejects wrong counts, duplicate
   choices, illegal options and invalid expertise selections.
6. `prepareOriginChanges(...)` produces actor updates, embedded Item data and
   the review summary. It also changes no documents. Reuse this exact plan for
   the preview and Apply; do not calculate different benefits in the UI.
7. `openOriginSetup(actor, item)` renders DialogV2 pages. Valid choices are
   saved after Next. Closing before Apply grants no benefits, although a draft
   can remain. `openActorOrigins(actor)` is the existing-Item entry point.
8. `applyOriginSetup(...)` checks ownership and an existing receipt, writes a
   recovery record, creates embedded Items, applies actor fields, and marks
   completion. It does not elevate permissions or import World collections.

Persistent state is deliberately namespaced:

| Location | Purpose |
| --- | --- |
| Item `flags.ak5e.chapterTwoId` | Stable origin identity |
| Actor `flags.ak5e.originDrafts[originId]` | Choices saved after Next |
| Actor `flags.ak5e.originSetups[originId]` | Applying/complete receipt, choices and planned changes |
| Granted Item `flags.ak5e.originGrant` | Origin, source Item and grant index |

Receipts are keyed by origin identity, not just the dropped Item's ID. Deleting
and re-dropping a background must not grant everything twice. A receipt stuck
at `applying` is a recovery case: compare actual actor fields and tagged Items
with the planned summary. **Do not blindly clear the receipt and rerun**, since
some writes may already have succeeded. There is no general automatic rollback.

When extending a choice, update the plan, validation, prepared changes and tests
together. Preserve higher existing proficiency/expertise and unrelated traits.
Escape player-entered text before inserting it into HTML. Keep unspecified or
conditional mechanics visible as manual instructions instead of guessing.

## 5. Earlier bugs: do not repeat these fixes

The original blank “Background Proficiencies” screen came from stock D&D5e
background advancements, not missing text in the AK5e rulebook. Backgrounds
created without explicit advancement data acquired default 2024 advancements.
Those defaults did not contain AK5e choices.

- Setting `system.advancement: []` suppresses defaults on newly created
  backgrounds. That alone left the player with no setup menu.
- Existing D&D5e 5.3.3 advancement data is keyed. Updating it to an empty
  array/object did not necessarily remove persisted entries because updates
  merge data. The installer uses explicit
  `system.advancement.-=<advancementId>` deletion updates for that migration.
- World Items and Items already embedded on actors are separate documents.
  Refreshing a World Item does not prove that an actor's old copy was repaired.
- Do not solve a broken choice page by removing all interaction again. The
  player needs a populated, validated workflow with the correct benefits.
- `DialogV2.wait()` resolves on submission before its close animation finishes.
  The wizard also waits for the close event before opening the next step.
  Preserve this behavior, and make browser tests wait for the new page to render.
- Keep the six Basic Tactics separate from Advanced Tactics. Do not create a
  second independent Acumen pool when a Tactician Branch is already attached.

## 6. Test efficiently, then test the real workflow

Use Node.js 22 or newer. The repository validation suite requires no npm
dependency installation. Run from the repository root:

```bash
npm run test:origins
git diff --check
npm test
```

The full suite includes syntax/JSON validation, generated-content consistency,
source verification, parser fixtures, rule helpers, installers and origin tests.
`check:generated` **runs generators and writes their outputs** before comparing
them. Inspect changes if it fails; do not erase unrelated edits to make it pass.
If a generator is intentionally changed, regenerate and review its outputs
before expecting the consistency check to pass. Edit generators, not generated
chapter files by hand. A runtime-only popup fix does not normally require a
content-generator change.

An `EPERM` from `spawnSync` can be a sandbox restriction on the validation
subprocess, not a code failure. Request the necessary execution permission;
do not disable checks or report an unexecuted suite as passing.

Add regression cases for the changed behavior and its boundaries: missing or
duplicate choices, an already-proficient character, cancellation, reopening,
an unowned actor, another user's event, and failure between document writes.
For equipment choices, test alternatives as well as the first option.

Then use a clean D&D5e World with only AK5e enabled:

1. Record Foundry/system/module versions. Open a test character as its non-GM
   owner; do not alter an existing player's character as a test fixture.
2. Drop Military School Graduate from the installed AK5e Items. Confirm only
   the initiating player sees the menu. Try invalid selections, Back, Finish
   later, reopening, and Apply. Confirm two tactic cards and the intended tools.
3. Repeat with Pioneer and an equipment-granting background. Verify the
   character fields and Item data, not just the success notification.
4. Reopen setup and re-drop the origin: no duplicate grants. Reload the World
   and check persisted choices. Test relevant rolls, effects and rest recovery.
5. Capture console errors and complete the relevant smoke-test checklist items.

Read-only diagnostic for a selected token, or the user's assigned character:

```js
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) throw new Error('Select a character token first.');
console.table(actor.items.filter(i => i.getFlag('ak5e', 'chapterTwoId')).map(i => ({
  name: i.name, itemId: i.id, originId: i.getFlag('ak5e', 'chapterTwoId')
})));
console.log(actor.getFlag('ak5e', 'originSetups'));
```

To open setup explicitly on that owned character, use
`await game.ak5e.openActorOrigins(actor)`. That opens the interactive workflow;
it is not a read-only diagnostic if the user proceeds through it.

At the 0.2.5 handoff, the full Node suite passed. Actual Foundry DialogV2 was
browser-tested with an in-memory actor, and native D&D5e Item/Character schemas
accepted plans for all 53 backgrounds/nationalities. **Live World drops,
non-GM permissions, persistence, effects and rest recovery were not verified.**
Foundry was at its password-protected Administrator screen.

The additional browser/schema experiments used temporary Playwright scripts,
not checked-in tests. They are not part of `npm test`, and `/tmp` files may be
gone in a later session. If reconstructing them, serve repository scripts only
to the isolated test browser, keep actor persistence in memory, and use the
installed Foundry/D&D5e classes. If automating this routinely, add a maintained
browser harness in a separately scoped task. Do not read/reset Administrator
credentials to get past a locked World; ask the owner to launch the test World.

## 7. Deploy only when requested

Known paths on the owner's machine at this handoff:

| Purpose | Path |
| --- | --- |
| Repository | `/home/patch/AK5e-Foundry` |
| Installed module | `/home/patch/.local/share/FoundryVTT/Data/modules/ak5e` |
| Foundry installation | `/home/patch/FoundryV13` |
| Installed D&D5e bundle, read-only | `/home/patch/.local/share/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs` |
| Existing test World, do not overwrite | `/home/patch/.local/share/FoundryVTT/Data/worlds/ak5e-test` |

Confirm the current User Data path and exact target before copying. Filesystem
permission approval and task authorization are both required where applicable.

1. Finish tests. Increment the distributable module version; inspect
   `CONTENT_VERSION` in `scripts/ak5e.mjs` and related documentation. Changing
   the content version affects installer refresh behavior; do not reset the
   wizard's receipt schema version or invalidate completed characters casually.
2. Compare repository files with installed files to detect installation-side
   edits. Stop Foundry before manual deployment. Back up the specific installed
   files being replaced to a separate, uniquely named directory.
3. Copy only reviewed, changed module files. For the 0.2.4 popup and 0.2.5
   reopen fix these were
   `module.json`, `scripts/ak5e.mjs`, `scripts/origin-setup.mjs`,
   `styles/origin-setup.css`, and the module README. New script/CSS dependencies
   must be present before the updated manifest/runtime is used.
4. Compare source/destination hashes with `sha256sum` or file contents with
   `cmp`. A changed repository file is not proof that Foundry received it.
5. Restart Foundry, launch the World, and reload the browser. Verify the loaded
   module version and `game.ak5e.openActorOrigins` before retesting the UI.
6. If content records changed, run only the needed GM installer in the intended
   test World. The popup-only update does not need another installer run when
   tagged origin Items are already present. Never auto-import all chapters.

Never replace the whole Foundry Data directory, copy a development World over
the owner's World, edit installed D&D5e, or write to live LevelDB files. Avoid
recursive synchronization with deletion. Database backups require Foundry to be
stopped or a supported backup mechanism; copying a live database is not a
reliable backup strategy.

The previous 0.2.3 code backup was
`/home/patch/.local/share/FoundryVTT/ak5e-code-backup-0.2.3-bluOSt`.
Verify it exists before relying on it. It contains code/README backups, not a
backup of characters or World databases.

## 8. Recommended next bounded task

Complete the pending live-World popup test before broadening origin automation.
If it fails, reproduce one failure and add a regression for that cause. After
that, select one species-choice mechanic or one background exception from
TODO.md. Keep the source, implementation, test evidence and installed version
aligned, and never describe the entire character builder as finished when only
one layer has been verified.
