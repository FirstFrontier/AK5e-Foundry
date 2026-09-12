# AK5e Foundry VTT Module

This is the AK5e Foundry VTT v13 module. Version `0.2.1` contains development
World installers and generated content for Chapters 1–6 of AK5e v1.3.1.
See `DECISIONS.md` for native-field boundaries and release-pack limitations.

## Foundry VTT installation and integration

This package is an add-on **module**, not a World or a game system. Foundry
discovers it from `<User Data>/Data/modules/ak5e/module.json`; the directory
name and manifest `id` must both remain `ak5e`. The manifest restricts the
module to D&D5e Worlds and declares D&D5e 5.x as a system relationship. Foundry
VTT 13 is the minimum and verified core generation.

### Install and activate

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
  "download": "https://example.invalid/ak5e/releases/0.2.1/ak5e.zip"
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
| Dying state | `getDyingState(actor)` | `{active, mettle, failures, stabilisesNextTurn, healingThisTurn, healingBonusMettle}`. |
| Enter/leave Dying | `enterDying(actor)`, `leaveDying(actor)` | Promise of the new dying state; also adds/removes the Dying marker. |
| Death save | `recordDeathSave(actor, successful)` | Promise of updated dying state, or `null` when not Dying. A success adds 2 Mettle; failure adds 1 Mettle and 1 failure. |
| Dying turn start | `resolveDyingTurnStart(actor, deathSaveSucceeded = false)` | Promise of updated state. Resolves a queued Stabilise or records the supplied save result. |
| Healing while Dying | `recordHealingWhileDying(actor, hitPointsRegained)`, `resolveDyingTurnEnd(actor)` | Promise of updated state, or `null` when not Dying. Record every healing instance, then resolve once at turn end. |
| Spend/Stabilise | `spendMettle(actor, amount)`, `resolveStabilise(actor)` | Promise of `true` on success or `false` when the stored Mettle is insufficient. Stabilise costs 6 and resolves next turn. |
| Operator state | `getOperatorSkillState(actor)` | `{points, maximum, start, active}`. |
| Configure Operator SP | `configureOperatorSkills(actor, {maximum, start = 0, points = start})` | Promise of the configured state; clears the active skill. |
| Adjust Operator SP | `adjustSkillPoints(actor, amount)` | Promise of state. SP is clamped from 0 to maximum and does not change while a skill is active. |
| Activate/end Operator skill | `activateOperatorSkill(actor, {id, name, cost})`, `endOperatorSkill(actor)` | Activation resolves to a boolean; ending resolves to the updated state. |
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

## Chapter 3 content

`tools/build-chapter-three-content.mjs` reads the complete Chapter 3 source and
generates `scripts/chapter-three-content.mjs`. Do not edit the generated file
by hand. Run this after an approved class-source update:

```bash
node ak5e/tools/build-chapter-three-content.mjs
```

The Chapter 3 installer creates 777 D&D5e Items in batches of 50, eight summon
Actors, and one source-preserving class-overview journal. It creates `class`,
`subclass`, and `feat` Items, retaining parent class/branch,
source heading, level where stated, and raw source text in `flags.ak5e`.
Class hit dice and stable class/subclass identifiers are populated natively.

## Chapter 4 content

`tools/build-chapter-four-content.mjs` reads the complete Chapter 4 source and
generates `scripts/chapter-four-content.mjs`. Do not edit the generated file by
hand. Regenerate it after an approved equipment-source update:

```bash
node ak5e/tools/build-chapter-four-content.mjs
```

The Chapter 4 installer creates 126 D&D5e Items in batches of 50 and six
Journal Entries containing the complete currency, weapons, armour, toolkits,
adventuring gear, and magic-items references. Weapons are `weapon` Items,
armour and magic items are `equipment` Items, toolkits are `tool` Items, and
adventuring gear is `loot`; all property and detailed-use rules are separate
`feat` Items for safe, incremental automation.

## Current scope and deliberate deferrals

- The Dying/Mettle, SP, Arts Point, Oripathy, and Rest Action helpers store
  state under `flags.ak5e` on the Actor, so they do not corrupt D&D5e data.
- AK5e condition markers are available in Foundry's status UI. Their damage,
  roll penalties, action restrictions, and special removal rules remain
  explicitly GM-resolved until a combat integration is tested against D&D5e.
- Skill renaming and Technology cannot safely be added by merely changing
  labels: D&D5e's Actor skill schema must be extended. Keep these as journal
  rules until the Chapter 2 character-content pass defines the needed sheet
  and data approach.
- No ASI feat replacement, construct-healing prevention, Alternate Class
  switching, or spell-slot replacement is silently forced on a World. Their
  rules are installed as Chapter 1 references and the stateful portions have
  APIs above.
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
Arts are marked always prepared. Standard
and Special Arts Pools are separate `feat` Items. Arts still spend Chapter 1
Arts Points rather than D&D5e spell slots, so add per-actor casting automation
only after it has been tested against the applicable Class and Branch.

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

Run both source-fidelity checks after regenerating any chapter:

```bash
node ak5e/tools/verify-generated-content.mjs
node ak5e/tools/verify-chapter-one-helpers.mjs
```

The first command verifies all 1,442 top-level Chapter 1–6 records and the 801
embedded Chapter 6 features against the v1.3.1 source. The second exercises the
Chapter 1 condition, Dying/Mettle, Operator Skill, Arts Point, Rest Action,
Martial DC, and Damage Reduction helpers with a mocked Foundry lifecycle. See
`CONTENT_AUDIT.md` for the completed audit and its runtime-test boundary.
