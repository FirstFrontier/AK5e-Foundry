# Foundry VTT smoke-test checklist

Use this checklist for behavior that the Node.js validation suite cannot prove.
Record the Foundry core version, D&D5e system version, AK5e commit/version,
browser, tester, date, and any console warnings with the test result. The target
for the current development build is Foundry VTT 13 with D&D5e 5.3.3.

For automated browser runs, use `launchTestBrowser()` from
`ak5e/tools/test-browser.mjs`, including in temporary scripts. It requests GPU
acceleration with `--enable-gpu` and full Chromium headless mode. See the root
README for the launch example and host prerequisites. Record the actual renderer
alongside console warnings; prior software-rendered runs remain valid historical
results and do not establish hardware acceleration.

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
  returned totals and resulting World totals are 24 journals, 1,343 top-level
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
- [x] Verify Operator SP charging and lifecycle using the scoped 0.3.3 checks
  below. Resolve individual Skill effects manually.
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

### 0.3.2 enhanced weapons

- [x] In a clean V13/D&D5e 5.3.3 World with only AK5e enabled, import Chapter 4:
  207 Items/six journals; repeat creates/updates zero. Check Magic Items contains
  all 81 weapon variants and Magic Item References contains four combined entries.
- [x] Import Sword, Knife and Staff/Wand upgrades onto a PC and NPC. Verify
  ordinary bonus exactly once in attacks/damage, Sword 1d10 versatile mode,
  thrown ranges, rarity and no Attunement. Staff/Wand attacks have no upgrade
  bonus; select an equipped variant as Casting Unit in Arts setup.
- [x] Confirm launchers expose only damage activities, base Thunder dice,
  manual Ability Modifier, upgraded Martial DC, saves/half damage and
  non-proficiency Advantage instructions. No Attack Roll or added Damage bonus.
- [x] Upgrade old combined references, including one with custom name/text/image:
  IDs/customizations survive, notices occur once and Actor copies are unchanged.
- [ ] Check console/data-model warnings, item sheets, GM/non-GM installation,
  reload and server restart persistence. Export/import a representative locked
  release-pack sample once the equipment pack is created.

### 0.3.1 native Arts UI verification — 2026-09-27

Tested by Codex with Playwright Chromium in an isolated temporary clean World,
Foundry 13.351, D&D5e 5.3.3, AK5e 0.3.1, Chromium 153.0.8010.12, only AK5e
enabled. The module was linked from this repository; existing installed modules and Worlds were not
changed. These checks used newly created PC/NPC Actors and native utility
activities, not a full book import or release-pack installation.

- [x] Register PCs and NPCs with reviewed API adoption. Header AP controls,
  Arts navigation, summary and row badges appear once on native sheets.
- [x] Edit AP through the actual sheet input. Player owners can edit and cast;
  observers see totals without editing controls; GM rule controls remain GM-only.
- [x] Cast at a higher level through the native activity dialog: exact cost and
  projected AP update, one confirmation consumes AP, cancellation consumes none.
- [x] Unlimited grants default to free; limited-only grants consume one use,
  report exhaustion and disable casting; NPC long recovery restores the grant.
- [x] A ninth-level free grant works above the ordinary cap, consumes the ninth
  permission, and disables another cast. Native PC long rest resets that state
  and recovers AP. Silenced prevents casting with a readable reason.
- [x] Use the settings cog and **Save configuration**. Increasing maximum AP
  preserves spent current AP. No adoption dialog is opened by that action.
- [x] Partial spell-tab rendering retains one header/summary. Changing AP on one
  unlinked NPC token preserves the other token and base Actor resources.
- [x] Reload the browser and confirm saved AP remains available.
- [x] Restart the isolated server and verify PC/NPC AP, ninth-use state and both
  independent unlinked token resources; repeat open/close and partial renders.
- [x] Verify empty Arts lists, zero-AP cantrip casting, interrupted setup prompts,
  manual `(Art)` NPC references and mixed ordinary-spell filtering live.
- [x] Verify the compact PC header visually at native size (170-pixel header,
  36-pixel AP bar). Native NPC header controls also remain compact.
- [x] Open the GM rule editor directly from an Art row. Unequip the selected
  Casting Unit and use the sheet's **Equip** action to restore equipped status.
- [x] Switch AP/free/ritual modes. Preserve legal selected levels, reset an
  illegal level to the lowest legal level, recalculate discounted costs and
  projected AP, and show ritual timing with a static base level.
- [x] Change AP after selecting an upcast and before confirming. Consumption
  rejects the stale request without changing its level, spending AP or recording
  a cast. The activity operation unlocks afterward.
- [x] Expand native descriptions and filter by name using native search;
  clearing search restores the matching Art rows.
- [x] Use the NPC **Recover Arts → Long Rest** button to restore AP without
  using a native full rest.

The repository suite also checks invalid/over-cap AP edits, temporary excess,
locking, grant defaults/discounts, ritual selection, source restrictions,
short/manual recovery, limited-sheet privacy and restoration when disabled.
Those cases have DOM/rule coverage; live checks above are listed separately.
No module JavaScript page errors occurred in the completed GM/player/observer
runs. The installed D&D5e package reports an existing `packs.22.type` ActiveEffect
validation warning on V13; headless Chromium reports unavailable hardware
acceleration. These environment warnings were not hidden.

For a release retest, repeat the native sheet cases with actual attack/save/
concentration/template activities and retained resource options. Check search,
activation filters, Casting Unit selection, and rest types with source-specific
configuration. Recheck failed
consumption and guarded undo with a deliberate failure. Alternate sheets,
simultaneous casts by multiple owners, full Art effects and the other checklist
sections remain outside this verification record.

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

### Origin resources and temporary creature tags

- [ ] Open Details on an AK5e character. Confirm **Origin** lists Species,
  Nationality and Background beside native race/background/senses, with the
  setup button inside the section. Confirm there is no header shortcut overlap.
  Repeated/partial renders create one section; observers see names without edits.
- [ ] Grant Anura, Archosauria, Sarkaz Witchcraft and a limited-use background.
  Check native uses, source-defined recovery, spent values after reopen, formula
  maxima at level thresholds, and legacy grants initialized only on first edit.
- [ ] Test Rot (no rest refill), Flock counters, Logic Engine list bounds and
  duplicate Bad Luck results/Long Rest clearing. Verify a custom class counter
  does not create a duplicate pool. With Tactician attached, merge Officer +3
  manually and confirm no separate Officer counter appears.
- [ ] As GM and non-GM owner, link Ægir Teacher/Student to a character, NPC and
  unlinked token. Check rolls reflect proficiency/expertise without overwriting
  base skills. Replace the creature/skill, end the relationship, and remove its
  native effect; verify previous benefits disappear. Dying/death does not expire
  the relationship. Non-editable targets require record-only/GM handling.
- [ ] Add a temporary condition and feature copy. Test source and target rest
  triggers, next turn start, current/next turn end, skipped rounds, combat end,
  rewinds and elapsed game time. Check copied Items and effects are removed;
  pre-existing conditions/features survive. Compare linked vs unlinked NPCs.
- [ ] Remove tags as GM and target owner. Simulate native effect deletion with
  a failed copy cleanup and confirm the orphan appears with **Remove tag**.
  Check replacement failure leaves a visible recovery receipt and prevents
  another conflicting replacement. Check loss of source ownership still allows
  removing the received tag.
- [ ] Reload during a timed tag and during an Ægir relationship. Check persisted
  receipts/effects, time expiry after reconnect, single-client automatic cleanup
  with multiple GMs/owners, and owner fallback with no active GM. Inspect console
  warnings and required permission failures.

### Release checklist

Expanded tag checks (repository regressions pass; complete these in Foundry):

- [ ] Add tags from an Art-only PC, gear-only PC and NPC. Exercise both DialogV2
  steps, source rules, preset parameters, Custom settings, cancel and partial
  Effects renders. Inventory-row gear must show the complete linked gear rule.
- [ ] Cast Galvanise and Protect from Cold/Heat, start native concentration,
  then tag multiple recipients. Delete/disable that concentration effect and
  reload; check only its recipients expire. Confirm matching Damage removes one
  protected recipient. Review resistance and melee-only Damage in native rolls.
- [ ] Apply/replace all four toxin coatings on owned weapons from two creators.
  Inspect native enchantments, timed cleanup and pre-existing weapon effects.
  Consume/delete the source Item and confirm its applied coating persists.
  Test Rust stacking, manual broken-weapon restriction and explicit repairs.
- [ ] Check current versus next-turn end while the recipient's turn is active,
  plus a third actor's current-turn deadline for reactions. Check OR expiry.
- [ ] Test upcast Missile Barrier motes and Flock member uses/rests/capacity;
  joining a second Flock removes the first membership. Original source notes
  remain manual, so review those separately.
- [ ] Study/replace/end a written eligible Treatise. Verify its exact borrowed
  card/drawbacks, counters and removal of derived tags, including missed cleanup
  recovered on reload. Confirm no Arts-granting feature is selected.
- [ ] Confirm tag event buttons do not roll saves or Damage: Lacerate rejects HP
  restoration removal; expired Unstable Plasma still owes an incurred HP cost.
  Review condition-marker penalties and repeated native-bonus stacking manually.

- [ ] Reload the World and restart Foundry. Confirm folders, documents, embedded
  Items, source flags, Actor rule state, asset mappings, and links persist.
- [ ] Open the World as both GM and player; confirm document visibility and
  editing permissions are appropriate and the Asset Library remains GM-only.
- [ ] Repeat the console-error check after imports, item use, reload, and restart.
- [ ] Save the completed checklist and environment metadata with the release or
  test report. File unresolved mappings in `DECISIONS.md` and reproducible bugs
  in `TODO.md` before treating the build as verified.


### 0.3.2 live enhanced-weapon verification (2026-09-27)

Verified in a temporary clean World on Foundry 13.351 / D&D5e 5.3.3, only
AK5e 0.3.2 enabled. All 207 Chapter 4 Items validated. Actual PC/NPC Sword
+1/+2/+3 attacks and damage applied the bonus once; versatile damage uses
1d10. Knife retained thrown ranges. Staff/Wand upgrades added no melee bonus.
Equipped Staff +3 Casting Unit links persisted. Launchers rolled 1d8/2d8 Thunder
only, with manual Ability Modifier and Splash resolution. Four combined
references migrated once, preserving IDs, customized fields and Actor copies.
Browser reload, server restart and real non-GM installation checks passed.
No browser errors occurred; the pre-existing D&D5e `packs.22.type` ActiveEffect
warning remains. Playwright 1.57.0 used Chromium 143.0.7499.4, via
`launchTestBrowser()`, with the Ubuntu 24.04 build on Ubuntu 26.04. Actual renderer:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
Hardware acceleration was unavailable. Browsers closed in `finally`; the temporary
server was stopped. Locked release-pack import testing remains pending.

The initial temporary server linked the installed D&D5e system, triggering
LevelDB metadata repairs in 22 shared packs. It was stopped and subsequent tests
used a full temporary system copy. Document data files were unchanged; original
and repaired metadata copies produced identical record hashes/counts for all
packs. Recovery restored actors24's original manifest/log and CURRENT pointer,
then hit a cross-filesystem backup error. Auto-review rejected the retry because
it modified shared metadata after partial restoration and could delete repair
manifests. The remaining 21 restorations require stopping the installed server,
whose pack locks are still held, and approval for recovery. Original archives,
verified snapshots and browser report remain in `/tmp/ak5e-enhanced-browser/`.
No existing World documents were modified.

### 0.3.4 Operator Skill choice verification (2026-09-27)

Tested in a new disposable World `skill-choice-test` on port 30134, with its own
copy of D&D5e and only AK5e enabled. Foundry 13.351 / D&D5e 5.3.3 loaded repository
AK5e 0.3.4 through the temporary module link. The installed module and its World
data were not changed. Browser coverage is reproducible with
`tools/test-operator-progression-live.mjs`; it refuses other Worlds.

- [x] GM class-level changes prompt the assigned active player, with no popup
  on the second owner, two GMs or observer who are already connected.
- [x] Basic/Advanced/Elite menus at 2/7/14 show the appropriate tier, require
  explicit selection and preview exact effects, SP cost, Start SP, charging,
  activation, duration and source attribution.
- [x] Choose Later changes no Actor state. Partial renders do not repeat it;
  the Details sidebar button reopens the menu.
- [x] Complete a real automatic-only native AdvancementManager from 2 to 7;
  temporary clones cannot open the chooser. This fixture excludes unrelated
  native HP/ASI flows to isolate the completion hook.
- [x] Separately complete the stock interactive HP advancement flow from 1 to 2
  on a Medic fixture. The Skill popup appears only after that flow commits.
- [x] Preserve 7 SP and disabled integration through learning all three tiers,
  manual resource configuration, reload and server restart. Retain three choice
  receipts and exactly three marked Skill Items with no repeated popup.
- [x] Reject player catalogue bypass and replacement of a filled slot; reject
  an observer's popup request. Identical requests from two owners and the second
  GM return existing grants without duplicating Items.
- [x] Import a level-14 Liberator fixture, offer three tiers with its Branch
  options, defer once, reload and complete all three. Expanded previews scroll
  within the menu and the Learn Skills button remains reachable.
- [x] Complete all 123 repository tests with native D&D5e schema checks enabled,
  including 15 new progression tests for every class/boundary, branch unlocks,
  legacy mappings, stale/illegal choices, failures, authority and persistence.
- [x] Test protected choice/SP flags and Skill Items against an earlier native
  advancement snapshot in Node. Actual concurrent level editing during learning
  was not exercised in the browser.

No browser console errors or page errors occurred. Reports are
`/tmp/ak5e-choice-live-report.json` and `/tmp/ak5e-choice-restart-report.json`.
Full Chromium used `launchTestBrowser()` with `--enable-gpu`, with no GPU-disabling
or forced SwiftShader flags. Actual renderer:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
This is software rendering; hardware acceleration is unavailable in this
environment. Browsers closed in `finally`; the disposable server was stopped.
Locked release-pack imports and installed-module deployment remain pending.

### 0.3.3 Operator Skill verification (2026-09-27)

An isolated disposable World used Foundry 13.351 / D&D5e 5.3.3 with only AK5e
0.3.3 enabled and an independent system copy. The small playable slice was
verified before catalogue expansion. The repeatable optional harness is
tools/test-operator-live.mjs; it requires World sp-test on port 30133 and refuses
other Worlds. It creates only disposable test Actors/Scenes and source Skill
Items there. Deployment to the installed module and release packs is separate.

Repository checks:

- [x] Regenerate Chapters 1–6 without drift; validate all 1,843 generated records
  against the source and all 1,843 installer documents, including 320 Skill feats.
- [x] Test all source Skill cells, repeated Continued sections, Cluster Bombs'
  extra cell, stable source IDs, duplicate copies, stacking/mixed methods, pool
  limits, no refill on learning, and opt-in compatibility.
- [x] Test misses, immunity before a later damage part, damage absorbed by
  temporary HP, healing/self-healing/off-turn actions, Art-only temporary HP,
  separate Attacks, multiple targets/parts, and Defensive attack/damage deduplication.
- [x] Test uncertain events, delayed Skill provenance, Instant ending, timed
  expiry/initiative edits/world time, manual endings/extensions, Long Rest surplus
  and repeated rest notifications, explicit GM exceptions, and active-Skill locks.
- [x] Test simultaneous gain/activation, repeated requests, two owners/two GMs,
  actual request authors, unauthorized/invalid-document requests, failed/prevented
  commits, rewinds/replays, synthetic Actors and read-only tracker rendering.
- [x] Full npm test with AK5E_DND5E_BUNDLE passed: 108 Node tests, including 20
  SP regressions and all 51 origin/resource/sheet/tag tests against native models;
  no skips. File, generator, source, helper and installer validators also passed.

Native browser checks:

- [x] Embed five Defender Skills plus a duplicate on a PC, a Defensive Skill on
  an NPC, and an unlinked NPC token. Enable without refilling; verify max 15 and
  rates Automatic 4 / Offensive 2 / Defensive 2, PC/NPC controls and setup.
- [x] Start combat and charge Automatic. A native Sword miss charges Defensive;
  applied attack damage absorbed by temporary HP charges Offensive once and
  does not charge Defensive again. A second damage part does not charge again.
- [x] Native healing restores another Actor's HP and charges Offensive; self
  healing does not. Actual non-GM HP application is relayed to and committed by GM.
- [x] Instant activation spends once, creates a source card with provenance and
  ends. A deferred Skill attack and its native damage do not charge either Actor.
- [x] Two owners submit concurrent gains. Two active GMs use one elected writer;
  a repeated stable request awards once. An observer cannot submit Actor actions.
- [x] Activate a round Skill, reject another activation, expire before turn-start
  charging, rewind/replay without charging twice, and recover Start SP. Synthetic
  token SP remains independent of base-Actor changes and accepts owned commands.
- [x] Complete a native player Long Rest: end an Until Long Rest Skill and raise
  SP from 10 to 15 through the GM. Browser reload retains 15 SP and receipts.
- [x] After the playable slice, create all 320 Skill Items in the clean World;
  every Item validates with one native utility activity. Repeating expansion
  creates zero duplicates. No browser errors occurred.
- [x] Restart the isolated server and re-enter the World: PC 15 SP, NPC and
  synthetic token 2 SP each, ten charging receipts, six learned Item copies,
  and all 320 valid catalogue Items persist. No browser errors occurred.

Playwright 1.57.0 / Chromium 143.0.7499.4 used launchTestBrowser(); the primary
client exercised the canvas, while secondary authority clients disabled their
canvas to keep the multi-client test within available resources. Actual renderer:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
Hardware acceleration was unavailable; the launcher did not force SwiftShader
or disable the GPU. Browsers close in finally; the temporary server was stopped.
Report and final suite log are
written to /tmp/ak5e-sp-live-report.json and /tmp/ak5e-sp-final-suite.log.

- [ ] Export locked release packs and repeat their imports/UUID-link checks in a
  fresh World. Individual Skill effects, class progression and source-specific
  SP modifiers remain manual; broader release checklist items above remain open.

### World-wide replacement rules (2026-09-28)

A separate disposable Foundry 13.351 / D&D5e 5.3.3 World at
`/tmp/ak5e-world-rules-implementation` used only the repository AK5e module.
Both D&D5e legacy (2014) and modern (2024) settings were exercised. Full
`npm test` passed, including the seven focused World-rule Node regressions.
The browser scripts used `launchTestBrowser()` and closed Chromium in `finally`.

- [x] Modern and legacy: entering 0 HP adds AK5e Dying without Unconscious;
  native death counters stay at zero. Healing does not leave Dying and records
  a Mettle receipt. A second class Item is blocked by default. A stock caster
  without AP is reported unconfigured.
- [x] Legacy: an actual native death roll gained 2 Mettle on a success, kept
  native death counters at zero, and retained the Dying marker. Massive damage
  marked the Actor Dead without re-entering Dying. A Long Rest removed exactly
  one persistent AK5e failed save.
- [x] Legacy: ASI-for-feat completion is rejected, the native feat choice is
  hidden, Surprised initiative disadvantage is removed, and Frightened links
  to the installed AK5e Chapter 1 journal. The same Chapter 1 condition setup
  was also inspected in modern mode.
- [x] Legacy combat: a spell damage activity rolled `1d6 + 3` for the first
  damaging cantrip roll and `1d6` for the second on the same turn, persisting
  the turn receipt. A fresh viewport-correct run had no browser errors.
- [x] Two clients: with a GM online, a player-owner rolling a forced failed
  native death save at two existing failures reached Dead, cleared Dying, and
  kept native death counters at zero. Both browsers closed in `finally`.
- [x] GM-reviewed level-7 Guard/Caster Alternate Class sheets with swapped
  Strength/Wisdom, equal levels and matching inventory switched on a real Long
  Rest. The original class's two spent Hit Dice stayed spent.
- [x] Equipped AK5e armour supplied 4 physical DR. Seven thunder damage
  with resistance resolved to 1 after DR; Corroded reduced AC from 10 to 8,
  halved DR to 2, and yielded 2 damage. No browser errors occurred.
- [x] A stock caster with one available native first-level spell slot and
  no configured AP opened an Arts dialog with Cast disabled and an AP setup
  warning. Its native slot remained at one; no fallback cast occurred.
- [x] A GM-configured stock caster with an equipped Casting Unit used a
  native spell activity: AP fell from 2 to 1, the native first-level slot stayed
  at one, and the AK5e cast receipt recorded level 1/cost 1. The dialog closed
  successfully without browser errors.
- [x] A ninth-level Art cast through the native activity spent 9 AP,
  preserved its available native ninth-level slot, and set the once-per-rest
  flag. A second quote was blocked with `NinthUsed`; a real Long Rest restored
  AP and cleared that flag. No browser errors occurred.
- [x] GM skill preview selected the higher proficiency/expertise for both
  History/Religion → Lore and Nature/Survival → Wilderness. Application wrote
  both AK5e fields and retained all original values under `flags.ak5e`.

Most checks used a GM client. Broader multi-client World-rule regressions, Casting Unit exceptions, and locked
release-pack imports remain open in `TODO.md`. The actual WebGL renderer was
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`:
software rendering; hardware acceleration was unavailable in this environment.
