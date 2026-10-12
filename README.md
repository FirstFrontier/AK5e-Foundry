# AK5e Foundry — developer handoff guide

Start here when you continue work on this repository, whether you are a person
or a coding assistant, so you do not have to reconstruct earlier conversations.
It says what exists, where it lives, how to test it and how to hand it over.
It does not replace [WORKFLOW.md](WORKFLOW.md) (project rules and workflow),
[AGENTS.md](AGENTS.md) (agent and sub-agent policy) or, for Gemini bulk
implementers, [GEMINI.md](GEMINI.md).

This is a **content module (`ak5e`) for Foundry VTT 13 and the D&D5e system**,
implementing *AK5e 1st Edition v1.3.1*. It is not a game system or a World.

| Need | Read |
| --- | --- |
| Install, use, API and Foundry integration contracts | [ak5e/README.md](ak5e/README.md) |
| Project rules, testing and release requirements | [WORKFLOW.md](WORKFLOW.md) |
| Agent roles, models, delegation | [AGENTS.md](AGENTS.md), [GEMINI.md](GEMINI.md) |
| Backlog and per-class checklists | [TODO.md](TODO.md) |
| Implemented but not yet verified in Foundry | [VERIFY.md](VERIFY.md) |
| Open defects (one file each) | [bugs/README.md](bugs/README.md), then `ls bugs/pending` |
| Rules mappings and unresolved source questions | [ak5e/DECISIONS.md](ak5e/DECISIONS.md) |
| Version history | [ak5e/CHANGELOG.md](ak5e/CHANGELOG.md) |
| Evidence from live Foundry runs | [ak5e/FOUNDRY_SMOKE_TEST.md](ak5e/FOUNDRY_SMOKE_TEST.md) |
| Rules authority | `AK5e_1.3.1_Foundry_Source/` (read its `README.txt` first) |

## 1. Current state: start here

Snapshot of **2026-10-12**. Re-check the files and installed versions before
relying on it; this section is replaced, not appended to, when it is updated.

- **Repository module:** `ak5e/module.json` says **0.5.6**, verified against
  Foundry **13.351** and D&D5e **5.3.3** (minimum D&D5e 5.0.0). The Unreleased
  section of the changelog covers later work, and `TODO.md` labels the Guard
  increment 0.6.0; the manifest version has not been bumped for them.
- **Installed module:** the owner's installed copy was **0.3.5** when this was
  written. The repository is far ahead of it. Check the installed version
  before testing there; tests use private copies of disposable Worlds.
- **Working tree:** most recent work is uncommitted, including whole new files.
  Run `git status --short` first and never reset or discard changes.
- **No release packs yet.** `ak5e/packs/` does not exist; content is installed
  into Worlds by GM installer commands. Distribution permissions and public
  install URLs are still pending.

### What exists

| Area | State |
| --- | --- |
| Chapters 1–6 content (rules journals, origins, classes/branches, equipment, Arts, creatures) | Generated from the source text as native D&D5e Items, Actors and Journals. P0 added 350 standalone class options (Talents, Techniques, Engagements, Instructions, Rituals), enriched existing options and four development RollTables. |
| Origin setup popup | 33 backgrounds and 20 nationalities. Choices → feature rules → review → explicit Apply. Details-sidebar button, Origin trackers, temporary creature tags. Rest of the architecture is in §5. |
| Operator Skills and SP | 320 individual Skills, level 2/7/14 choice popups, stacked SP charging, rest recovery. |
| Arts | Casting adapter, PC/NPC controls, AP quotes and consumption hooks. |
| Vanguard › Standard Bearer | Helper module, sheet and live script. The sizing benchmark for other classes. |
| Caster | Chain, Mech-Accord, Primal and Splash, plus Core/Mystic casting; shared Caster use engine, drones, GM relay, undo. |
| Defender | Progression and Talents, Shelter/SP workflows, Dreadnought, Artshield, Guardian, Fortress, Juggernaut, Protector, Sentry. |
| Guard | Rules, progression, base features, Centurion, Crusher, Instructor, Artsblade, Brawler on the `guardUses` engine. |
| Marksman | Artilleryman, Besieger, Anti-Air, Deadeye, Flinger, Heavyshot, Hunter, Spreadshot; the 2026-10-11 audit repairs are in [ak5e/MARKSMAN_FIXES.md](ak5e/MARKSMAN_FIXES.md). |
| Medic, Specialist, Supporter | **Not started.** Content text only. |
| Remaining Vanguard branches and class gameplay automation generally | Text only unless listed above; see the backlog in `TODO.md` §1A. |

"Implemented" is not "accepted". Each class has unit tests, and several have a
rendered Foundry run (Chain/Primal/Splash, Defender Juggernaut/Protector/Sentry,
Guard, and focused Marksman repairs). Every checklist item in `VERIFY.md` and
the full GM/player checklists in `TODO.md` are still open: two-client races,
combat-time hooks, non-GM user checks and the rest. Hardware acceleration is
unverified (B-004); recorded runs used a software renderer. Do not describe a
class or the character builder as finished when only one layer has been
verified.

## 2. Ground rules in brief

Full wording is in [WORKFLOW.md](WORKFLOW.md); these catch most mistakes.

- Package ID `ak5e` is fixed. Never create a World or game system, rename the
  package or edit Foundry's installed D&D5e files.
- The source chapters are the rules authority. Read the complete relevant
  chapter, preserve wording and numbers, never invent mechanics, and log
  uncertain mappings in `ak5e/DECISIONS.md`.
- **Trust the table (WORKFLOW §3.2).** Players act without GM approval or turn
  gating. Changes to unowned targets go through an automatic active-GM relay.
  Range and prerequisite problems warn with **Use anyway** rather than block.
  Always confirm before a use (not for ability checks or saves). Never
  auto-roll damage, healing, attack, save or feature dice. Every use writes an
  undo receipt the acting player can use during the encounter window.
- GM-gate world administration only; installers are idempotent and nothing is
  imported from a lifecycle hook.
- Every Playwright Chromium run uses `launchTestBrowser()` (§6).
- User-facing changes need rendered inspection in Foundry V13 + D&D5e. Image
  review is delegated to a validator sub-agent (AGENTS.md §6.2).
- Keep `TODO.md` current; never overwrite Foundry data directories.

## 3. Find the correct file

| Responsibility | Where |
| --- | --- |
| Manifest, version, script/CSS registration | `ak5e/module.json` |
| Lifecycle registration, public API (`game.ak5e`), World installers, `CONTENT_VERSION` | `ak5e/scripts/ak5e.mjs` |
| Origin choices, validation, grants, popup, sheet button | `ak5e/scripts/origin-setup.mjs` |
| Feature counters and temporary tags | `feature-trackers.mjs`, `feature-tags.mjs`, `tag-presets.mjs` |
| Arts casting and sheet controls | `arts-rules.mjs`, `arts-casting.mjs`, `arts-sheet.mjs` |
| Operator Skills / SP | `operator-*.mjs` |
| Shared play engines | `play-uses.mjs` (+ `play-uses-sheet.mjs`), `play-undo.mjs`, `operation-kernel.mjs`, `resource-pools.mjs`, `trigger-events.mjs`, `damage-pipeline.mjs` |
| Class helpers | `standard-bearer*.mjs`, `caster-*.mjs`, `defender-*.mjs` and one `<branch>-features.mjs` per branch, `guard-*.mjs`, `marksman-*.mjs` |
| World-wide Chapter 1 rules (Dying/Mettle, DR preview, …) | `world-rules.mjs`, `world-rule-state.mjs` |
| Generated content (do not hand-edit) | `chapter-<one…six>-content.mjs`, `roll-table-content.mjs`, `class-option-content.mjs` |
| Generators and content checks | `ak5e/tools/build-*.mjs`, `check-generated-content.mjs`, `verify-*.mjs`, `source-html.mjs` |
| Live Foundry browser scripts | `ak5e/tools/test-*-live.mjs`, `*-live-checks.mjs` |
| Unit tests | `ak5e/test/*.test.mjs` (fixtures beside them) |
| Styles and templates | `ak5e/styles/`, `ak5e/templates/` |
| Audits and implementation notes | `ak5e/*_AUDIT.md`, `CASTER_IMPLEMENTATION.md`, `DEFENDER_IMPLEMENTATION.md`, `MARKSMAN_FIXES.md`, `CONTENT_MAP.md` |
| Agent definitions | `.claude/agents/`, `.codex/agents/`, `.agents/` |
| Test and installer commands | `package.json` |

All scripts above are under `ak5e/scripts/` unless a path says otherwise.
Start with `git status --short` and `git diff --stat`. Use `rg` to locate
functions, and do not print the generated content modules: their HTML and raw
source fields can make a few lines enormous. For example:

```bash
rg -n 'buildOriginPlan|prepareOriginChanges|registerOriginHooks' ak5e/scripts/origin-setup.mjs
node --input-type=module - <<'JS'
import { CHAPTER_TWO_ORIGINS } from './ak5e/scripts/chapter-two-content.mjs';
const entry = CHAPTER_TWO_ORIGINS.find(e => e.name === 'Military School Graduate');
console.log({ id: entry.id, kind: entry.kind, parent: entry.parent });
JS
```

Rules authority: read `AK5e_1.3.1_Foundry_Source/README.txt`, then the complete
relevant chapter before implementing it (Chapter 2 origins, Chapter 3 classes,
Chapter 4 equipment, Chapter 5 Arts, Chapter 6 creatures). Read referenced
sections before modeling cross-chapter mechanics. Use manageable chunks and
continue past truncated output; this guide and generated summaries do not
substitute for the source.

Before changing hooks, importers, the manifest or packs, read the **Foundry VTT
installation and integration** section of `ak5e/README.md` and its linked v13
API documentation. For D&D5e behavior, inspect the installed system read-only
instead of assuming an older schema still fits. To add a class branch, follow
"Adding an operation-based branch" in `ak5e/README.md` and copy the shape of a
finished branch (for example `fortress-features.mjs` with its sheet and test).

## 4. Give the next session a bounded task

Use one reproducible problem or feature at a time. "Finish the Medic class" is
too large; "implement the Medic's first-level healing feature" is not. Include
the class/origin, the expected rule and its source heading, the actual
behavior, installed versions and any console error. Screenshots help identify a
screen but do not prove the cause. Bug assignments cite B-IDs.

```text
Work in /home/patch/AK5e-Foundry. Read the root README.md, AGENTS.md and
WORKFLOW.md (and GEMINI.md if you are Gemini), then run git status, read TODO.md
and ak5e/DECISIONS.md, and `ls bugs/pending` (open only the bugs for this task).
Read the complete source chapter(s) WORKFLOW.md requires.

Task: [one specific bug or feature].
Reproduction or source rule: [World, character, exact actions, actual result,
or chapter/heading].
Expected result: [player-visible behavior].

Preserve all existing changes. Reuse the existing engines and the shape of a
finished branch; do not rebuild the module or change D&D5e system files. Follow
WORKFLOW.md §3.2 for player agency. Add regression tests, run the targeted
suite, then npm test. Update TODO.md, VERIFY.md, DECISIONS.md and bug files
(bugs/README.md) as they apply. Distinguish unit tests from live-World
verification.

Deployment: [repository-only / install into the stopped Foundry after
confirming the target and backup].

Finish with: what changed, tests actually run, whether files were copied, what
I must restart or click, and remaining limitations.
```

Keep a short handoff after each task: affected functions, decisions, exact test
results, deployment status and the next unresolved issue. That is more useful
to the next session than the debugging transcript. This documentation does not
authorize an agent to deploy or change World data by itself.

## 5. Origin setup architecture and sheet UI

The origin popup is the oldest and best-documented UI. Class helpers reuse its
patterns.

### What maintained D&D5e modules do with sheet UI

| Reference | Observed approach | Lesson for AK5e |
| --- | --- | --- |
| [Custom D&D 5e actor-sheet code](https://github.com/Larkinabout/fvtt-custom-dnd5e/blob/main/scripts/actor-sheet.js) | Registers `renderActorSheetV2` handlers, checks the sheet type before editing HTML, gates individual changes with settings, and applies whole-window behavior only when the rendered element is the application frame. | Scope a handler to the intended sheet and HTML part; avoid running every UI edit for every Actor window. |
| [Tidy 5e Sheets integration guide](https://kgar.github.io/foundry-vtt-tidy-5e-sheets/) | Shows that `renderActorSheetV2` runs for full and partial renders, checks for a Tidy sheet, and targets a named sheet part. Its `data-tidy-render-scheme="handlebars"` attribute is specific to Tidy's render pipeline. | Treat each render as a fresh part: inspect the supplied element, use a stable local target, and prevent duplicate controls. Add Tidy-specific markup only in an explicit Tidy adapter. |

[Foundry V13's header-control hook](https://foundryvtt.com/api/v13/functions/hookEvents.getHeaderControlsApplicationV2.html)
adds entries to the window menu; a sheet render hook modifies the sheet body.
AK5e uses both: `getHeaderControlsApplicationV2` for the three-dot menu and
`renderActorSheetV2` for visible controls. It checks `ActorSheetV2`, ownership,
and AK5e Item/Actor flags before showing them. The exact selectors still need a
live check after each Foundry or D&D5e upgrade.

### UI coding checklist

Start in [`ak5e/scripts/origin-setup.mjs`](ak5e/scripts/origin-setup.mjs).
Reuse `registerOriginHooks()`, `page()` and `openOriginSetup()` as working
patterns. Inspect the installed Foundry/D&D5e version before using a new API.

Generated rules descriptions use a different path: the chapter builders call
[`ak5e/tools/source-html.mjs`](ak5e/tools/source-html.mjs), then the installers
place that HTML in native D&D5e Item, Actor and Journal documents. Fix shared
description formatting in that converter and regenerate; do not patch generated
files or rewrite rule text from a sheet render hook. The
[content audit](ak5e/CONTENT_AUDIT.md) records a pending table-presentation
issue and the live checks needed to verify a fix.

| Need | Use | Watch out for |
| --- | --- | --- |
| Register configuration | `init` | Register settings here; read them from `setup` onward. |
| Access actors or expose `game.ak5e` | `ready` | Never auto-import content from a lifecycle hook. |
| Add a sheet's three-dot menu entry | `getHeaderControlsApplicationV2` | Give it a unique action, owner check and `onClick`. |
| Add a visible sheet button | `renderActorSheetV2(app, element)` | Query inside `element`; it may contain a full sheet or one rerendered part. |
| Show a multi-step dialog | Existing `page()` helper | Wait for the outgoing dialog's close event before opening the next page. |
| Save changes | Await Document/embedded-document methods | Changing HTML or assigning to `actor.system` does not persist data. |

1. **Scope every handler.** Check document type and ownership. Drop handlers
   must also check the initiating user, AK5e flags and the generated-item
   guard. Recheck permission when applying changes; hiding a button is not
   enough. (Player-owned actions must not require the GM: see §2.)
2. **Expect rerenders.** Restrict sheet controls to ActorSheetV2 instances. Use
   namespaced selectors such as `.ak5e-origins-button`, skip insertion when the
   control already exists, and return safely when the target is absent. Origins
   target the Details sidebar's `.pills-lg`, resources its direct `.right`
   column, tags the Effects tab and Arts the Spells tab. Avoid global DOM
   queries and repeated document-level listeners.
3. **Wire buttons explicitly.** Use `type="button"` for injected controls and
   `preventDefault()` where needed. Catch asynchronous errors, log the stack and
   show a useful notification. Do not return a Promise from document hooks.
4. **Read the right form.** DialogV2 callbacks receive `(event, button, dialog)`;
   use `new FormData(button.form)` and `getAll()` for checkbox groups. Preserve
   choices on Back, validate before advancing, and grant benefits only on
   Apply. Use `textContent` or escape dynamic text before inserting it.
5. **Supply display configuration too.** For every custom tool, register both
   `CONFIG.DND5E.tools[key] = { label, ability }` and
   `CONFIG.DND5E.toolProficiencies[key] = label`. In D&D5e 5.3.3, `tools.label`
   alone causes an undefined compendium-ID lookup when rendering proficiencies.
   Valid actor data does not prove the sheet can render it.
6. **Test the complete interaction.** Open → choose → Back → Apply → close →
   reopen → reload. Also test cancellation, invalid choices, non-owner access
   and repeated renders. Check console errors and saved fields.

After deployment, restart Foundry and reload the browser. Installer macros can
correctly say "already installed": they refresh content, not loaded UI code.

### How the origin popup is built

Planning is separated from persistence. Keep that separation.

1. `registerOriginConfig()` adds namespaced tools and skills during `init`. It
   does not rename or delete the stock skills.
2. During `ready`, `registerOriginHooks()` registers `createItem` and the
   character-sheet button. World imports, other users' events and the wizard's
   own generated feature Items must not trigger another popup.
3. `getOriginEntry(item)` resolves `flags.ak5e.chapterTwoId` against generated
   source records. A name alone does not opt a stock Item into setup.
4. `buildOriginPlan(entry, actor)` returns required choices, fixed grants,
   features and explicitly manual rules. It changes no documents.
5. `validateOriginChoices(plan, values, actor)` rejects wrong counts, duplicates,
   illegal options and invalid expertise selections.
6. `prepareOriginChanges(...)` produces actor updates, embedded Item data and
   the review summary. Reuse this exact plan for the preview and Apply; do not
   calculate different benefits in the UI.
7. `openOriginSetup(actor, item)` renders DialogV2 pages. Valid choices are
   saved after Next. Closing before Apply grants nothing, although a draft can
   remain. `openActorOrigins(actor)` is the existing-Item entry point.
8. `applyOriginSetup(...)` checks ownership and an existing receipt, writes a
   recovery record, creates embedded Items, applies actor fields and marks
   completion. It does not elevate permissions or import World collections.

| Location | Purpose |
| --- | --- |
| Item `flags.ak5e.chapterTwoId` | Stable origin identity |
| Actor `flags.ak5e.originDrafts[originId]` | Choices saved after Next |
| Actor `flags.ak5e.originSetups[originId]` | Applying/complete receipt, choices and planned changes |
| Granted Item `flags.ak5e.originGrant` | Origin, source Item and grant index |

Receipts are keyed by origin identity, not the dropped Item's ID, so deleting
and re-dropping a background does not grant everything twice. A receipt stuck at
`applying` is a recovery case: compare actual actor fields and tagged Items with
the planned summary. **Do not blindly clear the receipt and rerun**; some writes
may already have succeeded. There is no general automatic rollback.

When extending a choice, update the plan, validation, prepared changes and
tests together. Preserve higher existing proficiency/expertise. Keep
unspecified or conditional mechanics visible as manual instructions instead of
guessing. Known gaps: species ASIs, size variants, Ancient Versatility and Arts
choices; Pathfinder's proficiency-point conversion (GM reconciliation);
conditional bonuses, tactic resolution and Officer/Tactician pool merging;
origin replacement and simultaneous application by different owners.

### Earlier bugs: do not repeat these fixes

- The blank "Background Proficiencies" screen came from stock D&D5e background
  advancements. `system.advancement: []` suppresses the defaults on new
  backgrounds. Existing keyed advancement data needs explicit
  `system.advancement.-=<advancementId>` deletion updates because updates merge.
- World Items and Items already embedded on actors are separate documents.
  Refreshing a World Item does not repair an actor's copy.
- Do not fix a broken choice page by removing all interaction. Players need a
  populated, validated workflow with the correct benefits.
- `DialogV2.wait()` resolves on submission before the close animation finishes.
  Wait for the close event before opening the next page, and make browser tests
  wait for the new page to render.
- Keep the six Basic Tactics separate from Advanced Tactics. Do not create a
  second Acumen pool when a Tactician Branch is already attached.
- A custom tool needs both registrations in item 5 above (the 0.2.6 sheet fix).

## 6. Test efficiently, then test the real workflow

Use Node.js 22 or newer. Install the one dev dependency (`linkedom`, used by DOM
regressions) once with `npm install`, then run from the repository root:

```bash
git diff --check
npm test            # the whole suite
```

Focused scripts (see `package.json`):

| Script | Covers |
| --- | --- |
| `test:origins` | Origin setup/sheet, sheet themes, trackers, tags |
| `test:rules` | Chapter 1 helpers, Arts, World rules, Operator Skills/SP |
| `test:caster`, `test:defender`, `test:guard`, `test:marksman` | The class suites (Marksman also runs `play-uses`) |
| `test:content`, `test:parsers`, `test:installers` | Generated content, parsers, installer data |
| `test:automation` | Automation audit (`ak5e/AUTOMATION_AUDIT.md`) |
| `test:deployment` | The development installer |
| `check:files`, `check:generated` | File validation; generated-content consistency |

`npm test` is a chain of `check:files`, `check:generated`, `test:content`,
`test:parsers`, `test:rules`, `test:installers`, `test:origins`,
`test:deployment` and the four class suites. It does not include
`test:automation`. `check:generated` **runs the generators and writes their
outputs** before comparing them: inspect changes if it fails and do not erase
unrelated edits to make it pass. Edit generators, not generated chapter files.
`npm run regenerate` rebuilds them all.

An `EPERM` from `spawnSync` can be a sandbox restriction on the validation
subprocess, not a code failure. Request the execution permission; never
disable checks or report an unexecuted suite as passing.

Add regression cases for the changed behavior and its boundaries: missing or
duplicate choices, an already-proficient character, cancellation, reopening, an
unowned actor, another user's event, failure between document writes. For class
features also test warnings with **Use anyway**, overspent resources, the GM
relay, undo (including past deleted targets) and receipt writes that fail. Set
`AK5E_DND5E_BUNDLE` to the installed `dnd5e.mjs` to include the real
sheet-method regression in the origin tests.

### Live Foundry checks

Unit, schema and Node DOM tests are not live-World verification; report them
separately. The live scripts in `ak5e/tools/` (`test-guard-live.mjs`,
`test-defender-jps-live.mjs`, `test-caster-branches-live.mjs`,
`test-marksman-live.mjs`, `test-standard-bearer-live.mjs`, `test-operator-*`,
`test-p0-*`, …) drive a **private copy** of a disposable World on a spare port
with the installed Foundry 13 and D&D5e. Use them as templates: record versions,
capture screenshots, check reload and server-restart persistence, and have a
validator sub-agent open every screenshot and write the per-image report
(AGENTS.md §6.2). Never read or reset Administrator credentials to get past a
locked World; ask the owner to launch it. For manual clean-World checks:

1. Record Foundry/system/module versions. Open a test character as its non-GM
   owner; do not alter an existing player's character as a fixture.
2. Exercise the feature as the owning player, then as the GM. Try invalid
   input, Back/cancel, warnings and overrides, undo, reopening, and re-applying.
3. Verify character fields and Item data, not just the success notification.
4. Reload the World and check persistence. Test rolls, effects and rest recovery.
5. Capture console errors and complete the relevant smoke-test items.

Read-only diagnostic for a selected token or the user's assigned character:

```js
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) throw new Error('Select a character token first.');
console.table(actor.items.filter(i => i.getFlag('ak5e', 'chapterTwoId')).map(i => ({
  name: i.name, itemId: i.id, originId: i.getFlag('ak5e', 'chapterTwoId')
})));
console.log(actor.getFlag('ak5e', 'originSetups'));
```

`await game.ak5e.openActorOrigins(actor)` opens the interactive origin
workflow; it is not read-only if the user proceeds.

All Playwright Chromium tests, including temporary scripts, must use the shared
GPU-enabled launcher (install full Chromium with `npx playwright install chromium`
in the environment that supplies Playwright):

```js
import { chromium } from 'playwright';
import { launchTestBrowser } from '/home/patch/AK5e-Foundry/ak5e/tools/test-browser.mjs';

const browser = await launchTestBrowser(chromium);
try {
  // Run the browser checks here.
} finally {
  await browser.close();
}
```

The launcher selects `channel: "chromium"` to use
[Playwright's full Chromium headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode)
and adds `--enable-gpu`, preserving additional launch options and arguments.
It requests acceleration without forcing a software renderer. On Linux, GPU
device permissions, working drivers and a compatible display/backend are still
required; see [Chromium's headless GPU guidance](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md).
Record the actual WebGL renderer with live-test results; a successful launch
does not verify hardware acceleration. The Node-only `npm test` needs no GPU.

## 7. Deploy only when requested

Known paths on the owner's machine at this writing:

| Purpose | Path |
| --- | --- |
| Repository | `/home/patch/AK5e-Foundry` |
| Installed module | `/home/patch/.local/share/FoundryVTT/Data/modules/ak5e` |
| Foundry installation | `/home/patch/FoundryV13` |
| Installed D&D5e bundle, read-only | `/home/patch/.local/share/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs` |
| Worlds (do not overwrite) | `/home/patch/.local/share/FoundryVTT/Data/worlds/` (`ak5e-test`, `standard-test`, others) |

Confirm the current User Data path and the exact target before copying.
Filesystem permission and task authorization are both required.

1. Finish tests. Increment the distributable module version, and inspect
   `CONTENT_VERSION` in `ak5e/scripts/ak5e.mjs` (currently `0.2.4`) and related
   documentation. Changing it affects installer refresh behavior; do not reset
   the wizard's receipt schema version or invalidate completed characters.
2. **Stop Foundry**, then preview with
   `npm run install:foundry -- --dry-run`. The installer
   (`ak5e/tools/install-for-testing.mjs`) refuses symbolic links and a running
   Foundry, takes a uniquely named `ak5e-code-backup-*` directory, copies the
   changed runtime files (`module.json` and `scripts`, `styles`, `templates`,
   `lang`, `assets`), and verifies hashes. Flags: `--data-path`,
   `--foundry-path`, `--port`. Drop `--dry-run` only with authorization.
   Manual copies need the same care: back up the specific files first and
   compare hashes with `sha256sum` or `cmp`.
3. Restart Foundry, launch the World and reload the browser. Verify the loaded
   module version and a `game.ak5e` entry point before retesting the UI.
4. If content records changed, run only the needed GM installer in the intended
   test World (`game.ak5e.installChapter<One…Six>…`, listed in
   `ak5e/README.md`). Never auto-import all chapters.

Never replace the whole Foundry Data directory, copy a development World over
the owner's World, edit installed D&D5e, or write to live LevelDB files. Avoid
recursive synchronization with deletion. Database backups require Foundry to be
stopped or a supported backup mechanism; copying a live database is not a
reliable backup. A code backup does not back up characters or World databases.

## 8. Recommended next steps

Pick one bounded item from [TODO.md](TODO.md); at this writing the strongest
candidates are:

1. Run the open GM/player live checklists for Guard and Marksman (actual clicks,
   warnings and overrides, owner dice and saves, automatic relay, undo,
   encounter locks, reload and restart), and clear `VERIFY.md` items.
2. The player-agency compliance audit of older code (GM-only gates, hard blocks
   that should be **Use anyway** warnings, most-recent-only undo).
3. Medic, Specialist and Supporter: start with the rules mapping and a vertical
   slice, using Standard Bearer and a finished branch as the template.
4. Open medium/high items in `bugs/pending` (for example B-020 and B-091 lost
   updates across clients, B-090 damage-reduction ordering).
5. Release compendiums, distribution permissions and public install URLs.

Keep the source, implementation, test evidence and installed version aligned,
and never describe the entire module as finished when only one layer has been
verified.
