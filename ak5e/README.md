# AK5e Foundry VTT Module

This is the AK5e Foundry VTT v13 module. Version `0.3.4` contains development
World installers and generated content for Chapters 1–6 of AK5e v1.3.1.
See `DECISIONS.md` for native-field boundaries and release-pack limitations.

## Foundry VTT installation and integration

This package is an add-on **module**, not a World or a game system. Foundry
discovers it from `<User Data>/Data/modules/ak5e/module.json`; the directory
name and manifest `id` must both remain `ak5e`. The manifest restricts the
module to D&D5e Worlds and declares D&D5e 5.x as a system relationship. Foundry
VTT 13 is the minimum and verified core generation.

### Install and activate

The repository includes a local testing installer (Node.js 22 or newer).
From the repository root, preview the changes, stop Foundry including any
automatic restart service, then install:

```bash
npm run install:foundry -- --dry-run
npm run install:foundry
```

On the owner's machine it defaults to `~/FoundryV13` and
`~/.local/share/FoundryVTT`. Set `--foundry-path` to the Foundry application
directory and `--data-path` to the **User Data root containing `Data/`**, not
the application directory or `Data/modules`. `FOUNDRY_VTT_DATA_PATH` also
overrides the default User Data root. For example:

```bash
npm run install:foundry -- --data-path /path/to/FoundryVTT --foundry-path /path/to/FoundryV13
```

The script checks V13 and the installed D&D5e dependency, compares files, backs
up changed code under `ak5e-code-backup-*` in the User Data root, copies runtime
files and module documentation, and verifies SHA-256 hashes. It leaves unrelated
files and existing compendium databases intact. A failed copy restores attempted
file changes. It refuses symlinked destinations and a listening local Foundry
port; use `--port` if Foundry was launched with a port override. Port checks are
a precaution, so still stop the instance yourself before installing. `--dry-run`
does not write files and can run while Foundry is running. This is a development
code installer; it refuses manifest-declared release packs and never imports
World content or enables the module automatically. `npm run test:deployment`
checks installation behavior using isolated temporary directories.

For local development, stop Foundry, then copy or link this repository's
`ak5e/` directory to `<User Data>/Data/modules/ak5e/`. Do not copy the repository
root and do not create an extra `ak5e/ak5e/` level. The resulting manifest must
be exactly:

```text
<User Data>/Data/modules/ak5e/module.json
```

Default User Data roots are `%LOCALAPPDATA%/FoundryVTT` on Windows,
`~/Library/Application Support/FoundryVTT` on macOS, and usually
`~/.local/share/FoundryVTT` on Linux. The authoritative path is the **User Data
Path** shown in Foundry's Configuration screen; a custom `--dataPath` overrides
the defaults. Restart Foundry after a manual install or manifest change.

Then:

1. Install a D&D5e version allowed by `module.json`.
2. Create or open a Foundry VTT 13 World whose game system is D&D5e.
3. Log in as a Gamemaster, open **Game Settings → Manage Modules**, enable
   **AK5e**, and save. Foundry reloads the World.
4. Check the browser developer console for manifest, module, or D&D5e data-model
   errors. After the `ready` hook, `game.ak5e` must exist.
5. Run the development installers described below only as the GM.

For a published release, users should install from **Add-on Modules → Install
Module** using either Foundry's package browser or a stable public URL ending
in `module.json`. Manifest-URL installation requires two release fields which
this development manifest intentionally does not yet contain:

```json
{
  "manifest": "https://example.invalid/ak5e/module.json",
  "download": "https://example.invalid/ak5e/releases/0.2.6/ak5e.zip"
}
```

`manifest` must remain the stable latest-release URL; `download` must identify
the zip for the exact manifest `version`. Do not add placeholder URLs. Validate
the final zip through Foundry's installer, not merely by copying it locally.

Official references: [Module Management](https://foundryvtt.com/article/modules/),
[Application Configuration and User Data](https://foundryvtt.com/article/configuration/),
[Module Development](https://foundryvtt.com/article/module-development/), and
[Package Management](https://foundryvtt.com/article/package-management/).

### Manifest contract

Foundry loads paths in `esmodules`, `scripts`, `styles`, `languages`, and
`packs` relative to the module root, and only while the module is enabled in a
World. AK5e uses `esmodules: ["scripts/ak5e.mjs"]`; that file imports the
generated chapter modules and connects AK5e to Foundry's lifecycle.

Keep these manifest rules when editing the package:

- `id`, the installed directory name, flag namespace, API namespace, and pack
  prefix all remain `ak5e`.
- `compatibility.minimum` and `compatibility.verified` remain `13` until actual
  clean-World testing justifies a change. `verified` is a claim of testing, not
  a requested version.
- `system: ["dnd5e"]` prevents activation in an unrelated World;
  `relationships.systems` identifies the required compatible D&D5e package.
- Actor, Item, and Adventure pack declarations must contain
  `"system": "dnd5e"`. In V11 and later each `path` names a LevelDB directory,
  such as `packs/classes`, not a legacy `.db` file.
- Localization keys belong in `lang/en.json` and are read with
  `game.i18n.localize(key)` or `game.i18n.format(key, data)`.
- Module assets use browser paths relative to the User Data `Data` directory,
  normally `modules/ak5e/...`; never reference a contributor's absolute path.

### Lifecycle hooks

The relevant one-time hooks occur in the order `init`, `i18nInit`, `setup`, then
`ready` (other specialized hooks may occur between them). Use each phase
deliberately:

| Hook | AK5e use | Do not do here |
| --- | --- | --- |
| `Hooks.once("init", fn)` | Register settings, sheets, keybindings, and stable `CONFIG` additions. | Do not read settings or access World documents. |
| `Hooks.once("setup", fn)` | Read registered settings and finish configuration that depends on initialized Documents. AK5e condition registration currently runs here. | Do not assume the UI, canvas, or World collections are ready. |
| `Hooks.once("ready", fn)` | Verify `game.system.id`, access `game.actors`/`game.items`, notify users, and publish `game.ak5e`. | Do not automatically create hundreds of documents for every connected client. |
| `Hooks.on("event", fn)` | Subscribe only to a repeatable Foundry or D&D5e event needed by a tested feature. | Do not use broad hooks when a native activity/effect represents the rule. |

In V13, `init` is the registration phase, `setup` is the first phase at which
settings may be read, and `ready` means the game is fully ready. See the
official [`init`](https://foundryvtt.com/api/v13/functions/hookEvents.init.html),
[`setup`](https://foundryvtt.com/api/v13/functions/hookEvents.setup.html), and
[`ready`](https://foundryvtt.com/api/v13/functions/hookEvents.ready.html) API
entries.

Minimal pattern:

```js
const MODULE_ID = "ak5e";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "example", {
    name: "AK5E.Settings.Example.Name",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("setup", () => {
  const enabled = game.settings.get(MODULE_ID, "example");
  if (enabled) configureAk5e();
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  game.ak5e = Object.freeze({ /* intentionally public methods */ });
});
```

### Foundry API methods used by AK5e

Use documented public APIs and `await` every database mutation. In new V13
code, prefer the configured document implementation (`Actor.implementation`,
`Item.implementation`, and so on), because D&D5e may configure subclasses of
Foundry's base documents.

| Purpose | V13 API | AK5e convention |
| --- | --- | --- |
| Subscribe once/repeatedly | `Hooks.once(name, fn)`, `Hooks.on(name, fn)` | One-time setup uses `once`; combat/UI listeners require `on` and a tested reason. |
| Register/read/write settings | `game.settings.register(ns, key, config)`, `.get(ns, key)`, `await .set(ns, key, value)` | Register in `init`; read no earlier than `setup`; use namespace `ak5e`. |
| Test runtime/system/user | `game.system.id`, `game.user.isGM` | Require `dnd5e`; only the GM may run installers or migrations. |
| Find World documents | `game.actors.get(id)`, `.getName(name)`, `.find(fn)` and corresponding `game.items`, `game.journal`, `game.folders` collections | Identify managed content by a stable `flags.ak5e` ID, never by display name alone. |
| Create World documents | `await Actor.implementation.create(data)`, `await Item.implementation.create(data)`, `await JournalEntry.implementation.create(data)`, `await Folder.implementation.create(data)` | Batch large imports with `.createDocuments(dataArray)` and keep batches bounded. |
| Update/delete documents | `await document.update(changes)`, `await DocumentClass.implementation.updateDocuments(changes)`, `await document.delete()` | Update only fields owned by AK5e; never delete user-owned documents during migration. |
| Manage embedded documents | `await actor.createEmbeddedDocuments("Item", data)`, `await actor.updateEmbeddedDocuments("Item", changes)`, `await actor.deleteEmbeddedDocuments("Item", ids)` | The parent Actor owns NPC actions/features; a Journal Entry owns `JournalEntryPage` documents. |
| Store module state | `document.getFlag("ak5e", key)`, `await document.setFlag("ak5e", key, value)`, `await document.unsetFlag("ak5e", key)` | Keep AK5e state out of D&D5e core fields unless it has an exact native mapping. |
| Conditions/effects | `await actor.createEmbeddedDocuments("ActiveEffect", data)`, `await effect.delete()` | Use an `ak5e-*` status ID and `flags.ak5e.statusId`; automate only unambiguous effects. |
| Packs | `game.packs.get("ak5e.pack-name")`, `await pack.getIndex()`, `await pack.getDocument(id)`, `await pack.getDocuments(query)`, `await pack.importDocument(document)` | Release content belongs in manifest-declared packs; normal users should not edit module packs because updates replace them. |
| UUID links | `await fromUuid(uuid)`; `pack.getUuid(id)` | Preserve IDs when exporting linked content and prefer UUIDs over name-based links. |
| Localization/notices | `game.i18n.localize(key)`, `game.i18n.format(key, data)`, `ui.notifications.info/warn/error(message)` | Localize user-visible runtime text; return structured results as well as showing a notice. |

Core API references: [ClientSettings](https://foundryvtt.com/api/v13/classes/foundry.helpers.ClientSettings.html),
[Actor](https://foundryvtt.com/api/v13/classes/foundry.documents.Actor.html),
[Item](https://foundryvtt.com/api/v13/classes/foundry.documents.Item.html),
[Folder](https://foundryvtt.com/api/v13/classes/foundry.documents.Folder.html), and
[CompendiumCollection](https://foundryvtt.com/api/v13/classes/foundry.documents.collections.CompendiumCollection.html).

### Sheet UI integration

AK5e adds origin and Arts controls to the existing D&D5e actor sheet. Header
menu controls use Foundry V13's `getHeaderControlsApplicationV2` hook and are
restricted to `ActorSheetV2` instances. Visible controls use
`renderActorSheetV2`, which also runs for partial sheet renders; each render
checks the Actor and the HTML part before inserting a control. Attached Origins
appear beside race/background in Details; their setup button is owner-only.
Feature counters also use the Details sidebar, and temporary tag removal uses
the Effects tab. Arts controls
appear when an Actor has AK5e class or Art content, or Arts is already enabled.
Registered PCs and NPCs show AP controls in the header and the existing Spells
tab, labelled Arts. Availability badges, a Castable now filter, and Casting Unit
controls are scoped to adopted Arts; excluded ordinary spells keep their native
controls. NPC stat-block features remain references. Render hooks never write
documents and limited sheets do not expose private Arts information.

This follows the render-scoping approach documented by
[Tidy 5e Sheets](https://kgar.github.io/foundry-vtt-tidy-5e-sheets/) and used by
[Custom D&D 5e](https://github.com/Larkinabout/fvtt-custom-dnd5e/blob/main/scripts/actor-sheet.js).
Rules that need code use D&D5e's named activity hooks; the module does not
replace the D&D5e game system. The native Arts hooks and selectors passed the
recorded clean-World checks on V13/D&D5e 5.3.3. Origin/tag checks remain tracked
separately in the smoke-test checklist.

### Compendium hookup and release workflow

Development installers create source-preserving World documents so they can be
reviewed. A distributable content module should expose those documents through
manifest-declared compendium packs; it should not require every user to execute
console importers.

1. Start with a clean D&D5e World and only AK5e enabled.
2. Run the GM installer for the content under test and inspect every native
   D&D5e field, description, flag, embedded Item, and console warning.
3. Create the matching module pack with Foundry's Module Maker. Use document
   type `Item`, `Actor`, `JournalEntry`, or `RollTable`; set D&D5e as the
   required system for Actor/Item packs.
4. Unlock the pack, export the verified folder, and select **Keep Document
   IDs** whenever links depend on IDs. Use **Merge By Name** only after checking
   for legitimate duplicate names.
5. Lock the release pack, restart, import a sample into another clean World,
   follow all UUID links, and verify no other module is required.
6. Commit the complete LevelDB pack directory and its `module.json` declaration
   together. Never hand-edit LevelDB contents.

Foundry warns that edits made directly to system/module compendiums can be lost
on update. Tell users to import a document to their World before customizing
it. See the official [Content Packaging Guide](https://foundryvtt.com/article/packaging-guide/)
and [Compendium Packs guide](https://foundryvtt.com/article/compendium/).

### Integration safety rules

- Do not write World documents from `init`, `setup`, or an unguarded `ready`
  hook. Imports are explicit GM actions and must remain idempotent.
- Do not mutate Foundry core or installed D&D5e files. Put source-accurate data
  in native `system` fields only after validating the active D&D5e schema; put
  AK5e-only metadata in `flags.ak5e`.
- Do not assume a global Actor or Item is Foundry's configured D&D5e class; use
  `.implementation` for new static document operations.
- Do not add a hook merely to automate a rule. Prefer D&D5e activities and
  Active Effects, then a documented manual workflow, and add JavaScript only
  for a repeatable rule that cannot otherwise be represented faithfully.
- Test with a Gamemaster and a non-GM client, reload the World, restart Foundry,
  check persistence and permissions, and repeat a representative sample after
  each Foundry or D&D5e upgrade.

## Install for development

1. Link or copy the `ak5e/` directory to Foundry's `Data/modules/ak5e/` path.
2. Start Foundry VTT 13 with D&D5e 5.0.0 or newer installed.
3. Enable **AK5e** in a D&D5e World.
4. As a GM, run this in the browser console or a Script Macro:

   ```js
   await game.ak5e.installChapterOneRules();
   await game.ak5e.installChapterTwoOrigins();
   await game.ak5e.installChapterThreeClasses();
   await game.ak5e.installChapterFourEquipment();
   await game.ak5e.installChapterFiveArts();
   await game.ak5e.installChapterSixCreatures();
   ```

   The commands create and migrate idempotent development-world content.
   Chapter 1 creates eight Journal Entries in **AK5e: Chapter 1 — Changing the
   Game**. Chapter 2
   creates guidance journals; Species, Species Features, Nationalities, and
   Backgrounds as D&D5e Items; and three origin summon Actors. Chapter 3 creates
   Classes, Branches, and their Features/Options as D&D5e Items within
   **AK5e: Chapter 3 — Character Classes**, plus one overview journal and eight
   summon Actors. Chapter 4 creates equipment Items
   and six reference journals. Chapter 5 creates Arts, Arts-pool entries, and
   four reference journals. Chapter 6 creates NPC
   Actors, organized by faction, and two rules/reference journals. Once their text and links are approved,
   export each folder to the matching module compendium pack before release.

## Asset Library

AK5e ships without artwork or audio. A Gamemaster can open **Game Settings →
Configure Settings → Module Settings → AK5e Asset Library** to add a named image
or audio asset, select or upload its file using Foundry's file picker, replace
the path later, or remove the mapping. The library stores only World-specific
paths; removing an entry never deletes its selected file.

Content and macros can read the configured mappings through
`game.ak5e.assets.list()` or `game.ak5e.assets.get(assetId)`. A GM can also open
the interface with `game.ak5e.assets.openLibrary()`.

## Content map

`CONTENT_MAP.md` is the generated source-to-document inventory for Chapters
1–6. It includes each development installer record's stable source ID, planned
release pack, Foundry document type, source heading, and all source table
blocks. Regenerate it after an approved source or generated-content change:

```bash
node ak5e/tools/build-content-map.mjs
```

## Chapter 1 API

`tools/build-chapter-one-content.mjs` reads the complete Chapter 1 source and
generates the eight source-preserving rule journals in
`scripts/chapter-one-content.mjs`. Regenerate it after an approved Chapter 1
source change:

```bash
node ak5e/tools/build-chapter-one-content.mjs
```

The API never hooks D&D5e combat or changes D&D5e Actor data automatically.
The GM calls the appropriate helper from a macro or other tested AK5e feature.
This is intentional: Chapter 1 has several rules that would be unsafe to
half-automate, particularly the replacement death-state workflow.

`game.ak5e` is published after Foundry's `ready` hook. Calls that change a
Document are asynchronous and must be awaited. Every Actor argument must be a
Foundry Actor document, for example `canvas.tokens.controlled[0]?.actor`; an
invalid Actor or invalid constrained value throws an `Error`.

### Public module surface

| Member | Signature / value | Result |
| --- | --- | --- |
| `conditions` | Frozen object keyed by `dying`, `bleeding`, `burning`, `corroded`, `dazed`, `frozen`, `necrotised`, `nervous-impairment`, and `silenced` | Condition metadata containing `id`, `key`, `name`, and `img`. |
| `assets` | `list()`, `get(assetId)`, `openLibrary()` | World-specific asset mappings. `openLibrary()` is GM-only; entries contain a stable ID, name, type, and selected file path. |
| Chapter installers | `installChapterOneRules()`, `installChapterTwoOrigins()`, `installChapterThreeClasses()`, `installChapterFourEquipment()`, `installChapterFiveArts()`, `installChapterSixCreatures()` | Promise of import counts such as `{created, updated, skipped}`. GM-only and idempotent by stable AK5e flags. |
| Conditions | `applyCondition(actor, key)`, `removeCondition(actor, key)` | Promise; creates or removes the AK5e-managed Active Effect marker. Reapplying an existing marker is a no-op. |
| Temporary feature tags | `openFeatureTagSetup(actor)`, `applyFeatureTag(source, sourceItem, target, options)`, `removeFeatureTag(target, tagId)`, `featureTags(actor)` | Owner/GM workflow. Options include `label`, `condition`, `copyFeature`, `changes`, `trigger`, `expiryActor` and `seconds`. Native effects/copies are reversible and scoped to their tag receipt. |
| Reviewed tag profiles | `sourceTagPresets(item)`, `applyTagPreset(source, item, target, presetId, parameters)` | Attached AK5e features, Arts and equipment; Actor or embedded weapon targets. Concentration profiles require the Art's native concentration effect. |
| Tag event/counter controls | `resolveFeatureTag(actor, tagId, action)`, `setTagCounter(actor, tagId, key, value)` | Confirm source-permitted removal events or edit bounded recipient resources; both require ownership. |
| Dying state | `getDyingState(actor)` | `{active, mettle, failures, stabilisesNextTurn, healingThisTurn, healingBonusMettle}`. |
| Enter/leave Dying | `enterDying(actor)`, `leaveDying(actor)` | Promise of the new dying state; also adds/removes the Dying marker. |
| Death save | `recordDeathSave(actor, successful)` | Promise of updated dying state, or `null` when not Dying. A success adds 2 Mettle; failure adds 1 Mettle and 1 failure. |
| Dying turn start | `resolveDyingTurnStart(actor, deathSaveSucceeded = false)` | Promise of updated state. Resolves a queued Stabilise or records the supplied save result. |
| Healing while Dying | `recordHealingWhileDying(actor, hitPointsRegained)`, `resolveDyingTurnEnd(actor)` | Promise of updated state, or `null` when not Dying. Record every healing instance, then resolve once at turn end. |
| Spend/Stabilise | `spendMettle(actor, amount)`, `resolveStabilise(actor)` | Promise of `true` on success or `false` when the stored Mettle is insufficient. Stabilise costs 6 and resolves next turn. |
| Operator state | `getOperatorSkillState(actor)` | Legacy `{points, maximum, start, active}`; enabled integration also returns derived `counts`, `rates`, and persisted receipts. |
| Configure Operator SP | `configureOperatorSkills(actor, {maximum, start = 0, points = start})` or `{enabled: true}` | Legacy manual pool configuration remains available until integration is enabled. Opt-in derives limits from learned Items without refilling SP. |
| Operator setup | `openOperatorSkills(actor)` | Owned PC/NPC setup, catalogue learning, and GM exception configuration. |
| Configure a Skill | `configureOperatorSkill(item, {cost, start, methods, activation, duration, source})` | GM configuration of an owned feat; `methods` may contain multiple methods or be empty. |
| Adjust Operator SP | `adjustSkillPoints(actor, amount, {reason, exception = false})` | Enabled integration requires an active GM and a source/reason. Documented exceptions may grant SP during an active Skill. Ordinary charging uses the event API. Legacy manual behavior is retained. |
| Activate/end Operator Skill | `activateOperatorSkill(actor, {itemId})`, `endOperatorSkill(actor)` | Owned Item cost, sufficient SP, and one-active-Skill lock; resolves to `true` on activation. Legacy `{id, name, cost}` remains available; on enabled Actors it is GM-only. New integration failures reject with an error. |
| Confirm a charging event | `recordSkillPointEvent(actor, event)` | Owned Actor confirmation; resolves to `{gained, reason}`. Requires a stable event `id`; repeated IDs cannot award twice. |
| Completed Long Rest | `recoverOperatorSkills(actor)` | Ends Until Long Rest Skills, then raises SP to highest Start SP if needed, preserving higher SP. |
| Arts Point state | `getArtsPointState(actor)` | `{value, maximum, maximumArtLevel, ninthLevelCast}`. |
| Configure Arts Points | `configureArtsPoints(actor, {maximum, value = maximum, maximumArtLevel})` | Promise of the configured state; resets `ninthLevelCast`. |
| Spend/recover Arts Points | `spendArtsPoints(actor, artLevel)`, `recoverArtsPoints(actor, amount, {longRest = false})` | Spend resolves to a boolean. Recover resolves to state; `amount` may be a number or `"max"`; only a long rest resets the ninth-level limit. |
| Oripathy state | `getOripathyState(actor)`, `setOripathyState(actor, change)` | Current or updated `{infected, assimilation}` state; the setter is asynchronous. |
| Rest Action | `beginRestAction(actor, {kind, name})`, `completeRestAction(actor, restKind)` | Begin resolves to a boolean and accepts `kind: "short"` or `"long"`. Complete returns the stored action, `null` if absent, or `false` if a long action was given only a short rest. |
| Martial DC | `martialDC(actor, ability = "str")` | `8 + ability modifier + proficiency`; ability must be `"str"` or `"dex"`. |
| Damage category | `damageCategory(damageType)` | `"physical"`, `"arts"`, or `null` for an unclassified type. |
| Damage reduction | `damageAfterReduction(amount, reduction = 0, {resistance = false, vulnerability = false})` | Final integer damage after reduction and resistance/vulnerability handling, with the helper's minimum-damage rules. |

These methods are the supported module-facing surface. Helpers not exposed on
`game.ak5e` are private implementation details and may change without notice.

```js
const actor = canvas.tokens.controlled[0]?.actor;

// Dying and Mettle
await game.ak5e.enterDying(actor);
await game.ak5e.recordDeathSave(actor, true); // success: +2 Mettle
await game.ak5e.recordHealingWhileDying(actor, 12);
await game.ak5e.resolveDyingTurnEnd(actor);   // +1, plus +1 for the 10-HP instance
await game.ak5e.spendMettle(actor, 1);        // Lash Out or Stagger Away
await game.ak5e.resolveStabilise(actor);      // spend 6
await game.ak5e.resolveDyingTurnStart(actor); // call at the next turn's start

// Conditions: creates/removes a visible Active Effect marker.
await game.ak5e.applyCondition(actor, "burning");
await game.ak5e.removeCondition(actor, "burning");

// Operator Skills
game.ak5e.getOperatorSkillChoices(actor); // Read-only earned/pending/chosen/blocked slots and legal options.
await game.ak5e.openOperatorSkillChoices(actor); // Reopen ordinary character progression choices.
await game.ak5e.configureOperatorSkills(actor, { maximum: 20, start: 5 });
await game.ak5e.adjustSkillPoints(actor, 2);
await game.ak5e.activateOperatorSkill(actor, { id: "example", name: "Example Skill", cost: 10 });
await game.ak5e.endOperatorSkill(actor);

// Arts Points
await game.ak5e.configureArtsPoints(actor, { maximum: 18, maximumArtLevel: 3 });
await game.ak5e.spendArtsPoints(actor, 2);
await game.ak5e.recoverArtsPoints(actor, "max"); // recovery does not reset the 9th-level limit
await game.ak5e.recoverArtsPoints(actor, "max", { longRest: true });

// Oripathy and Rest Actions
await game.ak5e.setOripathyState(actor, { infected: true, assimilation: 1 });
await game.ak5e.beginRestAction(actor, { kind: "short", name: "Maintain device" });
await game.ak5e.completeRestAction(actor, "short");

// Rule calculations
game.ak5e.martialDC(actor, "dex");
game.ak5e.damageCategory("fire"); // "arts"
game.ak5e.damageAfterReduction(12, 3, { resistance: true }); // 4
```

## Chapter 2 content

`tools/build-chapter-two-content.mjs` reads the complete Chapter 2 source and
generates `scripts/chapter-two-content.mjs`. Do not edit the generated file by
hand. Run this after any approved source-book update:

```bash
node ak5e/tools/build-chapter-two-content.mjs
```

Chapter 2 installs 231 source-accurate D&D5e `race`, `background`, and `feat`
Items, three source guidance journals, and three summon Actors. Species Items
populate their native creature type, movement, and explicit senses. Source size
is retained for Foundry's Size advancement choice. The feature Items are intentionally separate from their Species so
that a GM can verify and automate each one incrementally. Every installed Item
retains its source heading and raw source text in `flags.ak5e`.

## Player origin setup (0.2.4)

After updating the module, restart Foundry and reload the browser. Dropping an
AK5e-tagged background, nationality, or species onto a character you own opens
**AK5e Origin Setup**. Existing attached origins can be set up with the
**AK5e Origins** button in the Details sidebar's **Origin** section. No reinstall
macro is needed for this menu if the origin Items were already installed.
The public fallback is `await game.ak5e.openActorOrigins(actor)`.

Version 0.2.5 fixes reopening setup from a character sheet. Open the character,
then either click **AK5e Origins** beside its Origin summary in Details or
open the sheet's top-right three-dot menu and choose **AK5e Origins**. Merely
clicking an Actor in the right-hand Actors directory opens the character sheet;
it does not automatically reopen a completed setup every time. Completed setup
opens a read-only record of the choices and grants instead of applying them again.

Version 0.2.6 fixes character sheets failing to open after applying a background
such as Military School Graduate. D&D5e 5.3.3 resolves custom tool labels through
`CONFIG.DND5E.toolProficiencies`; registering only `tools` made its sheet attempt
a compendium lookup with an undefined ID. The module now registers both tables
during init. Restart Foundry and reload the browser after updating, then reopen
the character. Existing grants and setup records remain valid; no installer run,
background removal, or repeated Apply is needed.

The optional regression below exercises the installed system's actual tool-label
resolver and sheet preparation method without accessing World data:

```bash
AK5E_DND5E_BUNDLE=/path/to/Data/systems/dnd5e/dnd5e.mjs npm run test:origins
```

Without that environment variable, the installed-system test is skipped. This
check does not replace a live-World character-sheet reopen test.

The menu walks through choices, feature rules, and a final review. Nothing is
granted until **Apply to character**. Valid choices are saved after Next, so
players can finish later. Completed origins have a saved record and cannot be
applied twice, even if the original Item is deleted and dropped again.

- All 33 backgrounds offer their source-defined toolkit/vehicle choices and
  add a feature card. Proficiency does **not** give a free toolkit.
- Military School Graduate offers exactly two of the six Basic Tactics, adds
  both tactic cards, and an Officer Acumen tracker (3, Long Rest recovery).
  Spending Acumen and resolving tactics is manual; merge the +3 with the
  Tactician pool with the GM if that Branch is later taken. If a Tactician Branch
  is already attached, no duplicate pool is created; the review calls out the
  required +3 adjustment to the existing pool.
- Professional offers two skills and one proficient skill for expertise;
  Upper Class offers a language. Equipment-granting backgrounds offer their
  legal choices and add the selected Items. Specific weapon/armour grants are
  retained as custom proficiency traits, not broadened to whole categories.
- Nationalities offer languages and three skills. Leithanien also offers its
  proficient starting instrument. The unique background is selected separately.
- Lore, Wilderness and Technology use namespaced native skill entries; Arts
  uses Arcana's existing field. Existing D&D5e skills are not renamed/deleted.
  AK5e kits/instruments and the source-named Land Vehicles/Drones proficiencies
  are registered as native tools. Other GM-defined vehicle types remain manual.
- Labourer's level-based HP bonus and Miner's Blindsight are removable transfer
  effects. Several limited-use background features have rest-recovery trackers.
  Tool ability defaults are only sheet defaults; choose the appropriate ability
  for each check with the GM. Conditional bonuses and resource expenditure remain
  manual, as indicated in the review.
- Pathfinder's skill replacement/point conversion requires GM reconciliation;
  the menu requires allocation notes and does not silently rewrite skill values.
  Normal nationality/Professional skill grants are blocked while Pathfinder is
  attached. Species setup currently reviews and adds feature cards (including
  parent-species features), **not** complete species-stat/Arts automation.

### Feature resources and temporary tags

The **AK5e Feature Trackers** section in Details shows reviewed Origin uses,
choice records, and configured Operator SP/Mettle. Use **−/+** to adjust a
counter, **Edit** for lists/choices, or **Configure feature counter** for
other AK5e feat Items. Existing native uses take precedence, including spent
uses and custom maxima. Native recovery occurs on the configured rest; choices
and special gain/spend triggers are manual. The complete-module scan and
reviewed catalogue are in [RESOURCE_AUDIT.md](RESOURCE_AUDIT.md).

For Ægir's Student/Teacher record, choose an editable linked creature to apply
the appropriate removable skill proficiency/expertise benefit. Saving a new
choice replaces the old benefit; **End relationship** removes it. Record-only mode supports creatures the user
cannot edit. The source gives no expiry on being downed or killed; the benefit
persists until replaced or manually ended. Willingness and Long Rest Activity
timing remain player/GM decisions.

Use **Effects → AK5e Temporary Tags → Add AK5e tag** on a character or NPC.
Choose an attached feature, Art or item, then a profile and editable recipient
or owned weapon. The 53 profiles cover Flocks, Treatises, Cognitovore, lasting
Arts, toxins, Alcohol, Painkillers, weapon maintenance and magic-item effects.
Simple native changes include Speed, specific bonuses, resistance/vulnerability
and weapon degradation; AK5e condition markers and conditional restrictions
still need their source rules resolved manually. **Edit effect** configures
additional native sheet changes. Both source and target require edit access.

Expiry distinguishes the current turn from the next turn, supports source,
target or active combatant, and combines triggers with OR. Game time, rests,
turn boundaries and the exact Art concentration effect drive cleanup.
Concentration profiles must be applied after starting native concentration.
For consumables, apply the tag before the source Item disappears: its resulting
profile survives consumption. Actions, charges, AP, initial saves and Damage
are resolved separately; applying a tag does not pay costs or cast the Art.

**Successful save**, **Used**, **Matching damage**, **Antidote**, and other
profile buttons confirm an event already resolved under the source rules.
They do not roll or infer events from unrelated HP changes. Lacerate rejects
healing removal; Protect from Cold/Heat removal affects only that recipient.
Missile Barrier exposes its upcast mote counter; Flock members have independent
Birds of Prey/Nestmakers counters and Short Rest recovery. The original Flock
member notes remain manual; the linked tags enforce membership and capacity.

For class/NPC features and area-dependent effects, choose **Custom tag** and
review **Source rules**. Set conditions/native changes, one or two removal
triggers, permitted confirmation buttons, and a shared replacement group.
For example, use one group named `alchemical-infusions`, **One per recipient**,
and the one-minute duration for all infusion variants. Resolve range and
conditional roll/Damage benefits manually. Spatial movement does not automatically
apply or remove aura benefits. See [RESOURCE_AUDIT.md](RESOURCE_AUDIT.md).

GMs and target owners can always use **Effects → AK5e temporary tags → Remove
tag**, including cleanup of copied features left after a failed effect removal.
The action removes only that tag's effect and copies. Linked and unlinked NPC
targets are supported. Native Effects-tab deletion also cleans the tag's copies.
Clean-World testing of these additions remains pending in the
[smoke-test checklist](FOUNDRY_SMOKE_TEST.md).

World installers remain GM-only. The player menu can change only an owned
character and its embedded Items. It never imports World collections. If an
application fails part-way, a recovery record prevents automatic retries from
duplicating benefits. The GM should inspect `flags.ak5e.originSetups`, the
saved summary, and feature Items tagged `flags.ak5e.originGrant` before
reconciling a failed setup. Replacement/respec is not yet automatic.

## Chapter 3 content

`tools/build-chapter-three-content.mjs` reads the complete Chapter 3 source and
generates `scripts/chapter-three-content.mjs`. Do not edit the generated file
by hand. Run this after an approved class-source update:

```bash
node ak5e/tools/build-chapter-three-content.mjs
```

The Chapter 3 installer creates 1,097 D&D5e Items in batches of 50, eight summon
Actors, and one source-preserving class-overview journal. It creates `class`,
`subclass`, and `feat` Items, retaining parent class/branch,
source heading, level where stated, and raw source text in `flags.ak5e`.
Class hit dice and stable class/subclass identifiers are populated natively.

The 320 individual Operator Skill feats retain exact effects, costs, Start SP,
charging, activation, duration, raw rows, and source attribution. Existing table
references keep their IDs. New Skill IDs use class/branch, tier, and name.

### Operator Skills and SP

AK5e characters are prompted to choose one Basic Skill at class level 2, one
Advanced at 7, and one Elite at 14. A level jump or higher-level import offers
all outstanding tiers in one menu. Select each Skill to preview its exact rules,
costs, charging, activation and duration, then click **Learn Skills**. **Choose
Later** or closing the window changes nothing; reopen **Choose Skills** in the
Details sidebar or sheet header menu. The first sheet opening after login also
offers missing choices. Dismissed choices do not repeatedly reopen on sheet
renders during that session; new earned tiers can prompt again.

Choices use the attached AK5e class and Branch's stable source IDs. Liberators
can choose their Branch tables. Sentry and Witchcraft cross-class access applies
to Advanced and Elite slots because that access begins at level 4; delayed Basic
selection still uses the level-2 options. Confirmed choices survive level changes
and Item deletion. The GM can restore a deleted Skill from the manual catalogue;
the saved choice remains fixed. A single identifiable existing Skill per tier
already satisfies that choice; ambiguous, custom or ineligible existing Skills,
unrecognized Branches and multiple classes require GM reconciliation. Resolve
ambiguity by retaining the intended Skill Item, then level/update the class or
run `submitOperatorCommand(actor, "checkChoices")` from the Operator runtime as
the GM to record the inferred selections. This does not remove Items for you.

The assigned active player receives automatic level-up prompts, otherwise the
first active owner by user ID, with the active GM as fallback. Learning requires
an active GM and goes through verified owner requests; concurrent selections
cannot fill a tier twice. Interrupted Item grants retain recovery markers so
reopening the chooser finishes the Actor save without duplicating Skills.

Enable learned Skill integration in Operator Skills **Setup** to derive SP limits
and charging. Choosing Skills preserves existing SP and never enables automation
or refills the pool. NPCs retain manual catalogue learning in their header
sidebar; GMs retain catalogue learning for exceptional grants. Breakthrough
Skill exchanges, retraining and source-specific SP modifiers remain manual.
Alternate Class switching has a separate GM-reviewed World-rule control. Duplicate copies of the same source Skill contribute only once.

Automatic gains 2 SP per matching Skill at the beginning of your combat turn.
Offensive gains 1 per matching Skill during your turn for actual hostile damage,
actual HP restored to another creature, or temporary HP granted to another
creature through an Art. An Attack charges only once across parts and targets.
Defensive gains 2 per matching Skill for hostile attacks, including misses, or
hostile non-Attack damage. The methods share one pool whose maximum is the
highest learned Skill cost. An active Skill stops ordinary charging.

Activate spends the owned Skill cost once and displays a source card for manual
resolution; tracker activation also opens the Item sheet. Instant Skills end immediately after activation. Numbered rounds
expire at the activation initiative point; outside combat the configured round
length and world time apply. Ending combat alone does not cancel a Skill.
One-Attack durations and special early endings use End Skill. Duration extensions
require the source rule or reason; the GM/player resolves any eligibility or
maximum duration stated in that effect.

Use Resolve as part of Skill before a manually performed attack or Art, including
deferred effects after an Instant Skill ends. This marks the next native usage or
roll message and its linked follow-up messages. Mark each separate deferred
action. Skill-generated actions cannot charge ordinary SP. Missing or ambiguous
hostility, Attack identity, or provenance waits for Review pending event. Use
Confirm SP event for actions Foundry cannot attribute, including the separate
native temporary-HP action in D&D5e 5.3.3. Choose the original Attack when known;
use a separate manual Attack only for a distinct Attack.

Confirmations accept `type` (`offensiveDamage`, `offensiveHealing`,
`offensiveTemp`, `defensiveAttack`, or `defensiveDamage`), stable `id`, optional
`attackId` (ChatMessage UUID), `attack`, `hostile`, `positive`, `art`,
`skillOrigin`, and `targetUuid` (Actor UUID for healing/temporary HP). The GM
validates referenced documents and ownership; own-turn eligibility is derived
from combat or the pending observation. Confirmations cannot erase recorded
Skill provenance or an observed active-Skill block. Automatic events come only
from successful forward `updateCombat` transitions, including combat start.

Players request changes through namespaced whispered ChatMessage cards. One
active GM verifies the server-attributed initiating user, serializes updates per
Actor, and persists SP and receipts together under `flags.ak5e.operatorSkills`.
The cards retain their acknowledged result in `flags.ak5e.spResponse`; failed
requests report an error. No active GM means no commit. PCs, NPCs, and synthetic
token Actors use the same engine, with independent SP stored for unlinked tokens.
Individual Skill effects and class/talent/equipment exceptions remain manual;
configure costs, Start SP, or charging methods on the owned Skill, and use a
source-backed GM adjustment for exceptional grants/refunds/corrections.

Optional browser regression: start a disposable `sp-test` World on port 30133,
with an independent D&D5e system copy, and run `tools/test-operator-live.mjs`.
Set `AK5E_PLAYWRIGHT` to the installed Playwright module if needed. The test
refuses other Worlds, uses the repository Chromium launcher, records its actual
renderer, and closes browsers in `finally`.

## Chapter 4 content

`tools/build-chapter-four-content.mjs` reads the complete Chapter 4 source and
generates `scripts/chapter-four-content.mjs`. Do not edit the generated file by
hand. Regenerate it after an approved equipment-source update:

```bash
node ak5e/tools/build-chapter-four-content.mjs
```

The Chapter 4 installer creates 207 D&D5e Items in batches of 50 and six
Journal Entries containing the complete currency, weapons, armour, toolkits,
adventuring gear, and magic-items references. Weapons are `weapon` Items,
armour and named magic-item references are `equipment` Items, toolkits are `tool` Items, and
adventuring gear is `loot`; all property and detailed-use rules are separate
`feat` Items for safe, incremental automation.

Individual enhanced weapons appear under **Items → AK5e: Chapter 4 — Equipment
→ Magic Items**. There are 81 variants: three upgrades for each of the 27 base
weapons. +1/+2/+3 correspond to uncommon/rare/very rare, with no Attunement
requirement. Their native price is unset; the source's rarity prices are GM
estimates. Base damage, weight, range, reach and properties are retained.

- Arts Staff +1/+2/+3 has Conductive 2/3/4; Arts Wand +1/+2/+3 has Conductive
  1/2/3. Apply these to Spell Attack Rolls and Spell Save DC manually, using
  only the highest equipped value. These upgrades add no melee bonus.
- Grenade Launcher and Rocket Launcher +1/+2/+3 increase Martial DC for Splash
  by 1/2/3. Their damage activity rolls base Thunder dice only: add the weapon's
  Ability Modifier manually, resolve Dexterity saves/half damage, and grant
  Advantage on saves if the wielder is not Proficient. There is no Attack Roll
  or upgrade bonus to damage. Loading and Brace remain manual.
- The other 23 weapons, including Heavy Defender Shield's weapon profile, use
  native +1/+2/+3 Attack and Damage bonuses, including versatile/thrown modes.
  Enhanced weapons are excluded from background starting-equipment choices.

As GM, rerun `await game.ak5e.installChapterFourEquipment()` after updating the
module. It adds the variants and moves the four combined +1/+2/+3 documents to
**Magic Item References**, retaining their IDs and rules text. Default names
receive a `Reference:` prefix; custom names, descriptions, images and other
fields survive. Actor-owned copies are unchanged: replace them manually with
the chosen variant. Only these affected records use content version 0.3.2;
unrelated chapter content is not refreshed by this migration.

## World-wide Chapter 1 rules (development)

The **Chapter 1 rules** World setting enables changed AK5e base rules for owned
character and NPC Actors, including stock Actors. It is on by default and
requires a reload when changed. The stock D&D5e compendiums and installed system
files remain intact. Rules were exercised in disposable Foundry 13.351 / D&D5e
5.3.3 Worlds in both 2014 and 2024 modes; see `FOUNDRY_SMOKE_TEST.md`.

- Frightened and Surprised keep their familiar status IDs and link to the AK5e
  Chapter 1 journal after it is installed. Surprised no longer gives stock
  initiative disadvantage. The **AK5e World Rules** Actor header control records
  Move, Action, or Bonus Action; the GM confirms movement and action use.
- At zero HP, creatures with death saves enter Dying without Unconscious.
  Native death save successes/failures are replaced by Mettle and persistent
  AK5e failed saves. The header control handles turn-start saves, damage saves,
  Death's Door costs, DC 15 Medicine triage, and Stabilise. Healing while Dying
  grants Mettle at turn end; it does not end Dying. Massive damage marks Dead.
  A Long Rest removes one AK5e failed save. The GM must confirm turn timing,
  Medicine success and the action actually taken after paying Mettle.
- Native ASI advancement cannot select a feat. New class Items cannot add a
  second class unless the GM enables **Allow AK5e multiclassing**. The optional
  Alternate Class control lets a GM review two separate level 7+ sheets,
  inventory and swapped abilities, then queue a switch for the next GM-completed
  Long Rest. Hit Dice recovery is withheld on that rest. The GM keeps the two
  sheets' shared inventory and level aligned.
- Lore and Wilderness are new skill fields; Arts uses Arcana's field and
  Technology is new. The GM can preview and apply a one-time skill conversion
  from History/Religion and Nature/Survival using the highest proficiency or
  expertise. Original values are saved under `flags.ak5e.skillReconciliation`.
  The stock fields remain for reversal and legacy content.
- Spell activities use Arts Points across the World. A stock caster needs a
  GM-configured AP maximum and Art level cap; no slot conversion is inferred.
  An equipped, configured Casting Unit is required except for an explicit
  exception. Arts are always prepared and have no material cost in AK5e content.
  The adapter enforces the once-per-Long-Rest ninth-level limit. The first
  completed damaging cantrip roll on the caster's combat turn adds the casting
  modifier; later rolls that turn do not.
- The sheet shows copper/silver/gold currency as LMD at 1/10/100. Electrum
  and platinum have no source conversion and are omitted from that display.
  The damage calculator applies equipped AK5e DR before resistance or
  vulnerability, using minimum 1 damage; multiple DR sources need a GM total.
  Corroded halves the entered DR and its marker applies -2 AC. AK5e weapon
  properties still need individual native-activity tests. The selected-target
  activity guard rejects source-listed healing on Constructs without an
  explicit exception; the GM must adjudicate effects with no selected target or
  healing entered directly on a sheet.

Current controls require an owner or GM. They are prompts for rules that Foundry
cannot infer reliably from movement, target history, or an unreviewed class
sheet. See `DECISIONS.md` for unresolved source-to-D&D5e mappings.

## Current scope and deliberate deferrals

- Dying/Mettle, SP, Arts Point, Oripathy, Rest Action and World-rule state live
  under `flags.ak5e` on Actors. Some conditions retain manual damage, removal,
  movement and turn accounting pending tested activities.
- Character Origins are source-complete content entries, but their highly
  varied effects are not claimed to be universally automated. Add and test
  Active Effects, activities, and custom automation one origin feature at a
  time, using the generated feature Item as the rules authority.
- Character Classes follow the same source-complete, automation-incremental
  approach. Do not mark a Class or Branch feature as automated until its
  activity, effect, or hook has been tested on a clean D&D5e World.
- Equipment table entries contain source stats and dedicated rules Items, but
  do not yet claim automatic handling for AK5e-only weapon properties such as
  Brace, Conductive, Crush, or Splash. Implement and test those properties one
  at a time before adding effects or activities to the equipment Items.

## Chapter 5 content

`tools/build-chapter-five-content.mjs` reads the complete Chapter 5 source and
generates `scripts/chapter-five-content.mjs`. Do not edit the generated file by
hand. Regenerate it after an approved Arts-source update:

```bash
node ak5e/tools/build-chapter-five-content.mjs
```

The Chapter 5 installer creates 128 D&D5e Items in batches of 50 and four
Journal Entries. Its 111 new Art descriptions become `spell` Items with their
source level, school, casting time, range, components, and duration populated;
Arts are marked always prepared. Standard and Special Arts Pools are separate
`feat` Items. The World-wide casting adapter spends configured Arts Points in
place of spell slots. Class and Branch pool grants remain separately reviewed.

## Chapter 6 content

`tools/build-chapter-six-content.mjs` reads the complete Chapter 6 source and
generates `scripts/chapter-six-content.mjs`. Do not edit the generated file by
hand. Regenerate it after an approved bestiary-source update:

```bash
node ak5e/tools/build-chapter-six-content.mjs
```

The Chapter 6 installer creates 145 D&D5e `npc` Actors in faction folders and
two Journal Entries for the GM guidance and supporting statblock notes. Actor
AC, HP (where numeric), movement, ability scores, type, alignment, and CR are
loaded into native D&D5e fields; every full original statblock is retained in
the public biography and `flags.ak5e`. Damage defenses, languages, and senses
are preserved in native/custom trait fields. Traits, actions, reactions,
legendary, lair, and mythic actions are installed as embedded source-preserving
feature Items, but remain manual until their activities have been tested. The
source gives Pathshaper Fractal `-` HP, so no numeric HP is added for that Actor.

## Generated-content verification

From the repository root, run the complete dependency-free Node.js validation
suite (Node.js 22 or newer):

```bash
npm test
```

The suite validates both JSON files and syntax-checks every `.mjs` file;
regenerates Chapters 1–6 and the content map, failing if regeneration changes a
tracked output; verifies all 1,843 top-level records and 801 embedded Chapter 6
features against the v1.3.1 source; runs source-section, table, HTML, and monster
parser fixtures; exercises rule-helper edge cases with a mocked Foundry
lifecycle; and verifies the supported types and traceability flags produced by
all six development installers. Individual commands are listed in the root
`package.json` when a narrower check is useful.

The optional installed D&D5e bundle exercises native data models in Node, but
does not replace Foundry checks of sheets, permissions, persistence or browser
lifecycle. Complete
[`FOUNDRY_SMOKE_TEST.md`](FOUNDRY_SMOKE_TEST.md) in a clean World for those
behaviors. See `CONTENT_AUDIT.md` for the completed source audit and its runtime
test boundary.
# Arts casting adapter and sheet UI (0.3.1 development)

The **Arts** tab and sheet header show current and maximum Arts Points once
configured, even when the actor has no Arts Items. Edit current AP directly or
use the −/+ buttons. Dropping Caster alone does not configure
AP or grant its Arts pools yet. Click **Set up AK5e Arts** in that tab (or open
**Arts settings** from the sheet header menu), enter the source-defined
casting ability, AP, maximum Art level and recovery, and select an equipped
Casting Unit. Review the spell adoption preview before applying. Setup does not
refill existing AP or reset the ninth-level limit. Adopted spells retain original
preparation/material fields in their flags; ordinary actors remain unchanged.

Use an Art's activity to open one casting dialog with its legal levels, exact
cost and projected AP. Unlimited free grants are preferred, followed by AP and
then limited free grants; ritual casting remains an explicit option unless it is
the only legal mode. Cancellation does not spend AP. Unavailable casts show
their reason. Castable now hides unavailable adopted Arts without removing them.
The GM can configure documented free-use grants,
discounts and focus exceptions through **Casting rules** on each Art row. After a
partially failed cast, inspect its outcome before using **Undo last cast**; undo
restores Arts resources only, not other costs, effects or chat messages.

The core sheet/casting flows passed live checks in a clean Foundry 13.351 /
D&D5e 5.3.3 World with GM, player-owner and observer clients. A separate
World-rule check verified the first completed damaging cantrip roll in combat.
See [`FOUNDRY_SMOKE_TEST.md`](FOUNDRY_SMOKE_TEST.md) for the tested scope and
remaining checks. Use one operating client per Actor. Class progression, special
casting modes, pool grants and Conductive bonuses remain unfinished. Infected
Casting Unit exceptions use the Actor's explicit Oripathy state. Ritual timing
and other exception eligibility require GM review.
Existing content without roll activities still needs those activities authored;
this adapter does not automate individual Art effects.

The settings cog separates **Save configuration** from reviewed **Adopt existing
spells**. Configuration saves preserve current AP, free-use counters and ninth
use, and do not update Items. The casting ability is the default for adoption and
new Arts; existing Items retain their explicit ability. NPC **Recover Arts**
applies Short/Long Rest Arts recovery only, without recovering HP or other
features. The collapsed Stat-block Arts section opens managed Spellcasting and
explicitly labelled `(Art)` features as references.

Public owner-checked helpers: `await game.ak5e.setActorArtsValue(actor, value)`
sets a nonnegative whole-number AP value without creating temporary excess;
`await game.ak5e.recoverActorArts(actor, "short" | "long")` applies Arts recovery.
Both share the casting operation lock and invalidate the previous cast receipt.
Use `configureActorArts(actor, { ...options, adopt: false })` to save settings
without adopting spells; existing callers retain reviewed adoption by default.
