# Foundry VTT smoke-test checklist

Use this checklist for behavior that the Node.js validation suite cannot prove.
Record the Foundry core version, D&D5e system version, AK5e commit/version,
browser, tester, date, and any console warnings with the test result. The target
for the current development build is Foundry VTT 13 with D&D5e 5.3.3.

## Clean-World setup

- [ ] Link or copy `ak5e/` to `<User Data>/Data/modules/ak5e/`; confirm there is
  no extra directory level and `module.json` is directly inside that directory.
- [ ] Create a new D&D5e World with no module enabled, then enable only AK5e.
- [ ] Confirm module activation has no manifest, compatibility, localization,
  hook, or D&D5e data-model error in the browser console.
- [ ] Confirm `game.ak5e` appears only after `ready` and exposes the documented
  API. Confirm all nine AK5e condition markers appear once in the status UI.
- [ ] Open Module Settings and verify the Chapter 1 setting and GM-only Asset
  Library labels render in English rather than as localization keys.

## Explicit installer behavior

- [ ] As a GM, await all six `game.ak5e.installChapter...()` calls. Confirm the
  returned totals and resulting World totals are 24 journals, 1,262 top-level
  Items, and 156 Actors (including 11 source-defined summons).
- [ ] Confirm Items, Actors, and journals open without sheet/data-model errors.
  Spot-check one document from every chapter for `flags.ak5e` source ID,
  `sourceFile`, `sourceHeading`, `rawSource`, and `contentVersion`.
- [ ] On a Chapter 6 Actor, confirm all source traits/actions appear as embedded
  feature Items and retain their section/source-index flags.
- [ ] Re-run all six installers. Confirm no folder or document is duplicated and
  each call reports zero created/updated documents.
- [ ] Give an AK5e Background D&D5e's four default advancements, rerun the
  Chapter 2 installer, and confirm the stale advancements are removed and the
  background can be added to a character without an empty advancement flow.
- [ ] In a disposable branch/build, increment `CONTENT_VERSION`, add an
  unmanaged Item to a generated creature, and run its installer again. Confirm
  managed content refreshes while the unmanaged Item remains.
- [ ] Log in as a non-GM and invoke each installer. Confirm no documents change
  and a GM-only warning is shown.

## Native D&D5e use

- [ ] Open a Chapter 1 rules journal, Chapter 2 origin and guidance journal,
  Chapter 3 class (including Caster's progression table), Chapter 4 equipment
  and reference journal, Chapter 5 Art and pool journal, and Chapter 6 creature
  (including its ability-score table). Check readable table structure, headings,
  horizontal overflow, keyboard navigation, and browser-console errors.
- [ ] Close and reopen those documents after a sheet rerender and World reload.
  Confirm descriptions and source headings remain visible and no duplicate UI
  controls or document content appears.
- [ ] Import a representative Species, Nationality or Background, Class,
  Branch, several Features, Art, weapon, armour, modification, creature, and
  summon onto appropriate character/NPC sheets.
- [ ] Compare names, descriptions, source headings, types, uses, activation,
  range, target, duration, damage, saves, and populated native fields with the
  source. Confirm no description claims automation that is not present.
- [ ] Exercise the native rolls and item-use cards that are populated. Confirm
  they produce no console errors and do not consume D&D5e spell slots for Arts.
- [ ] Confirm source-defined formulas remain descriptive/manual where native
  values are intentionally absent, including Pathshaper Fractal HP/CR and
  summoner-dependent summon statistics.

## Rule-helper behavior

- [ ] On a disposable Actor, exercise Dying entry/exit, successful and failed
  death saves, healing Mettle (including separate healing instances), Mettle
  spending, and delayed Stabilise. Confirm the visible Dying marker and Actor
  flags agree after every step.
- [ ] Configure Operator SP, charge to its maximum, activate one Skill, attempt
  to charge/activate another while it is active, then end it. Confirm state and
  warnings match the source rules.
- [ ] Configure Arts Points and Maximum Art Level; test insufficient points, a
  level above the maximum, and the one-9th-level-Art-per-Long-Rest flag. Confirm
  only a long-rest recovery clears that flag.
- [ ] Set and reload Oripathy state; begin Short and Long Rest Actions and verify
  that a Long Rest Action cannot finish during a Short Rest.
- [ ] Compare Martial DC and Damage Reduction helper results with sheet values.
  Test resistance, vulnerability, both together, zero damage, and DR greater
  than incoming damage.
- [ ] Apply and remove each AK5e condition marker. Resolve its damage, penalties,
  restrictions, timing, and removal manually; the module does not claim those
  effects are automated.

## Persistence and handoff

### 0.2.4 origin-menu verification

- [x] Actual Foundry 13.351 DialogV2 in Chromium: Military School Graduate
  displays tool choices and all six Basic Tactics; empty submission is rejected;
  two selected tactics survive Back; Officer and both tactic pages lead to a
  populated review; Apply grants the expected data to an in-memory actor.
  No browser errors occurred. This test did not enter or modify a World.
- [x] The installed D&D5e 5.3.3 Item/Character data models accept the grants and
  actor updates from all 33 background and 20 nationality setup plans, with
  modern rules and non-metric defaults in an isolated browser context.
- [ ] In a running test World, drag an installed AK5e background onto a real
  character as a non-GM owner and confirm the popup appears only for that user.
- [ ] Use the character-sheet AK5e Origins button on an already attached
  background; finish setup, reload, and reopen the saved record without grants
  being duplicated. Confirm cancellation before Apply does not grant benefits.
- [ ] Verify native tool rolls, Labourer/Miner transfer effects, limited-use
  rest recovery, equipment activity proficiency, and repeated World reloads.

The live-World portion remains pending: Foundry was on its password-protected
Administrator screen during this test session. The isolated UI/schema results
do not establish full live drop, persistence, rest, or permissions behavior.

### 0.2.5 reopen-control verification

- [x] Unit-test the ApplicationV2 header-control registration, owner-only
  visibility, duplicate prevention, and reopening of a completed receipt.
- [ ] In a live World, open a character from the right-hand Actors directory.
  Confirm the visible compass shortcut and the **AK5e Origins** entry under the
  sheet's top-right three-dot menu both open the origin selector.
- [ ] Reopen a completed origin record and confirm no feature, proficiency,
  equipment, or resource is granted a second time.

### Actor sheet controls

- [ ] Open an ordinary D&D5e character and NPC with no AK5e content. Confirm
  no AK5e Origins or Arts controls appear.
- [ ] Add an AK5e origin to a character and an AK5e Art or class to another
  Actor. Confirm the relevant header menu controls appear once and work.
- [ ] Open the Spells tab, change AP, rerender the tab, and confirm the tracker
  updates once. Remove the last AK5e Art/class from a disabled Arts actor and
  confirm the tracker disappears.
- [ ] Open another Actor document application, such as token configuration;
  confirm it has no AK5e sheet header controls.

### Release checklist

- [ ] Reload the World and restart Foundry. Confirm folders, documents, embedded
  Items, source flags, Actor rule state, asset mappings, and links persist.
- [ ] Open the World as both GM and player; confirm document visibility and
  editing permissions are appropriate and the Asset Library remains GM-only.
- [ ] Repeat the console-error check after imports, item use, reload, and restart.
- [ ] Save the completed checklist and environment metadata with the release or
  test report. File unresolved mappings in `DECISIONS.md` and reproducible bugs
  in `TODO.md` before treating the build as verified.
