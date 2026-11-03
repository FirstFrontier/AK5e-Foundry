# Foundry VTT smoke-test checklist

## Focused bug repairs (0.5.1, 2026-10-10, Asia/Manila)

This increment repairs B-001/B-002/B-003/B-010/B-012/B-062/B-080/B-081/B-087;
the older B-082/B-083/B-084/B-085 entries were reconciled with their existing fixes.
No rules text, generated content, pack IDs, public gameplay API or flag format changed.
The internal `waitForStandardOperations` export only drains the existing Actor queue
for test teardown; queued refreshes no longer recreate removed support.

Environment: Foundry **13.351**, D&D5e **5.3.3**, AK5e **0.5.1**. Main used the
private copy `/tmp/ak5e-bugfix-rwu7hcsl` on localhost port **30159**. Luna used
`/tmp/ak5e-defender-luna` on **30161**. Both reused the existing disposable
`standard-test` World with only AK5e installed/enabled. Production data was untouched;
servers were stopped using their recorded PIDs. All browser checks used
`launchTestBrowser()` with the installed Playwright ESM file and snap Chromium.
Measured renderer: **ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)**; no particular
acceleration mode or benchmark is claimed.

Verified evidence:

- [x] Luna ran the combined kernel/Standard Bearer/Defender Node suites:
  **122/122 passed** (`/tmp/ak5e-bugfix-luna-node-focused-final.log`). Removing
  the queued-refresh flag guard in a temporary runtime copy made its new
  regression fail on a stale write (`/tmp/ak5e-bugfix-luna-node-mutant.log`).
- [x] Full `npm test`: **315 cases, 314 passed, one optional installed-system
  origin fixture skipped**, validators passed (`/tmp/ak5e-bugfix-luna-node-npm.log`).
  `npm run test:automation` passed after targeted version/hash and runtime-line
  metadata updates (`/tmp/ak5e-bugfix-automation-final.log`). Final syntax checks
  and `npm run check:files` passed (manifest, translations and 122 modules).
- [x] Two consecutive normal Standard Bearer runs exited 0 with no console/page
  errors: `/tmp/ak5e-bugfix-standard-3.json` and `-4.json`. Each reset three
  marked Actors and drained refreshes before deleting their combat/map fixtures.
  An earlier repeat exposed simultaneous template deletion; the queue guard/fence
  corrected it before these final runs.
- [x] Real Foundry returned `undefined` from an unchanged Actor update. Two
  unchanged kernel saves made **zero database writes**. Token movement, combat
  advancement, repeated map synchronization and reload produced no save errors.
- [x] GM/player panels, long-label button bounds, hidden-target privacy, observer
  rejection, Cry/Tip/Projection dialogs and their cancellation passed. A deliberate
  fixture-only receipt-write interruption displayed the real **Retry pending
  operation** button; retry committed the same operation and applied each stored
  roll exactly once. Main reviewed the panel/dialog/retry/player PNGs from runs
  1 and 4; final screenshot prefixes are `/tmp/ak5e-bugfix-standard-{3,4}-`.
- [x] Browser reload and actual server restart retained Actor HP, module flags,
  effects/application receipts, all **20 committed operation receipts**, weapon
  ID, prop token ID, and both aura template IDs/geometry. Restart-only mode
  compares the canonically ordered snapshot against run 4 without resetting it:
  `/tmp/ak5e-bugfix-standard-restart.json` and `-restart.png`. Main reviewed the
  final restart screenshot with the asynchronous Skill chooser closed.
- [x] Luna Defender live regression: **18/18 checks passed**, no Standard Bearer
  save-error exemption, `errors: []`, `consoleErrorsFailed: false`
  (`/tmp/ak5e-bugfix-luna-defender.json`). Main reviewed owner controls, the Eye
  of the Storm map and observer sheet screenshots. The existing known environment
  filters cover ActiveEffect-pack validation, ReadPixels and GPU-stall messages;
  the empty error list excludes those patterns. Foundry still logged the system's
  `type: ActiveEffect is not a valid choice` pack warning.

These are development-World regression checks. They do not verify every Standard
Bearer rule branch, cross-client resource consistency, locked release packs,
manifest-URL/ZIP installation or redistribution licensing. Those tasks remain
separate; no release was published and no rules interpretation was added.

## P0 content foundation (0.3.8)

Use only the existing disposable `standard-test` World at
`/tmp/ak5e-standard-test`: Foundry 13.351, D&D5e 5.3.3, only AK5e enabled.
Preserve the owner's installed module and Worlds. The repeatable browser script
is `tools/test-p0-content-live.mjs`; it uses `launchTestBrowser()` and closes
the browser in `finally`. Set `AK5E_PLAYWRIGHT`, `AK5E_CHROMIUM` and optionally
`AK5E_NATIVE_VULKAN=1` for the available host runtime. Artifacts default to
`/tmp/ak5e-p0-live/report.json` and adjacent PNGs; review the screenshots.

- [x] Inspect all nine corrected feature sheets, including legitimate subordinate
  rules; keep the customized migration fixture unchanged.
- [x] Inspect Talent Effect/Module Effect, Technique, Engagement, Instruction,
  Ritual, Therapy, Tactic, Inventor modification and Heavy Duty upgrade sheets.
- [x] Search individual Items and drag/drop a descriptive option onto an owned
  Actor; confirm its description and source metadata remain usable.
- [x] Inspect all four native table sheets and click Draw to chat; verify all
  37 exact results/ranges, formulas, minimum/maximum totals and repeat draws.
- [x] Verify explicit GM install, overlapping/repeated calls, player rejection,
  player table visibility and owned option visibility.
- [x] Verify previous canonical description migration, customized-description
  warning/preservation, authored fields, unaffected records and Actor copies.
- [x] Inspect console errors/warnings; reload and restart the server and confirm
  document/result IDs and authored data persist without hook-driven imports.
- [x] Record actual renderer and environment limitations.

Verified 2026-10-10 by Codex with source/content workers and an independent
review. Only the disposable World was changed; the owner's installed 0.3.5
module and production Worlds were preserved. Tests ran with Node 24.18.0,
Foundry 13.351, D&D5e 5.3.3, AK5e 0.3.8 and full Chromium headless mode.

Executed checks:

- `npm test`: 163 passed, one optional native-sheet test skipped; manifest/file
  checks, deterministic generation, source coverage and all seven installer
  checks passed (2,197 records).
- `npm run test:automation`: two tests passed; the regenerated audit is current,
  with 2,038 named headings, 289 tables and exact fragments for all 2,197 records.
- `node --test ak5e/test/standard-bearer.test.mjs ak5e/test/standard-bearer-sheet.test.mjs`:
  31 focused regressions passed. This does not establish Standard Bearer gameplay
  acceptance in Foundry.
- `tools/test-p0-content-live.mjs`: all 418 individual options matched current
  generated descriptions after equivalent V13 line-break normalization. The
  previous Doublecast description migrated; its authored title, chat, uses,
  activity and effect remained. Chosen of Asclepius with an authored note and an
  unrelated Caster record remained unchanged. Existing Actor copies remained.
  Repeat Chapter 3 installation returned `0 created / 0 updated / 1456 skipped`;
  repeat tables returned `0 / 0 / 4`. Same-client overlapping calls shared one
  result. Both installers rejected the player; all four tables and an owned
  option were usable by that player.
- All 37 native results matched source wording, stable IDs and ranges. Native
  draws to chat, minimum/maximum sums and repeat draws passed. Screenshots of
  all nine corrected features, all nine option families, four tables including
  their last rows, Item search, owned copies and chat draws were actually reviewed.
  The duplicate source-table presentation/clipping observed initially was fixed
  and rechecked. Browser page-error lists were empty.
- `tools/test-p0-restart-live.mjs --capture`, an actual server stop/start, then
  the script without `--capture`: all 1,461 document hashes and collection totals
  were unchanged, including embedded copies, authored fields, table results and
  IDs. Player access remained usable; the restart screenshot was reviewed.
  The player's native table sheet was read-only, its Draw button produced chat,
  and the dragged option retained its exact description and AK5e provenance.
  The player table screenshot was reviewed as well.

Evidence: `/tmp/ak5e-p0-live/report.json`, `before-restart.json`, `restart.json`
and adjacent PNGs. The live script accepts `AK5E_P0_DRAFT` only for explicit,
exact-hash reconciliation of unpublished test drafts; that option was used
during iteration in this World. It does not change production installer policy.
For restart checks use the same browser environment variables as the live script.

Actual renderer: `ANGLE (Mesa, Vulkan 1.4.335 (llvmpipe (LLVM 21.1.8 256 bits)
(0x00000000)), llvmpipe)`. The launcher requested `--enable-gpu`; **hardware
acceleration is unverified**. Native Vulkan was needed for WebGL in this host;
no GPU was disabled and SwiftShader was not forced. Software-renderer ReadPixels
stall warnings occurred. Foundry also reports the existing D&D5e manifest warning
`packs:22:type: ActiveEffect is not a valid choice`, observed before P0 imports.
The custom-description and non-GM warnings were expected. These limitations are
recorded separately from the passing P0 content and UI checks.

Release packs, clean locked-pack imports, licensing and public installation are
outside P0. This checklist does not validate P1 or Standard Bearer gameplay.

## Caster / Core / Mystic / Mech-Accord implementation (0.5.0)

The rules-to-helper mappings and manual boundaries are recorded in
`ak5e/CASTER_IMPLEMENTATION.md`. Automated validation was confirmed from saved
logs and live reports on 2026-10-10:

- [x] Caster behavioral test run: 79 passed, 0 failed. Saved output:
  `/tmp/ak5e-caster-unit-final.log`.
- [x] `npm test`: the full repository test pipeline passed, including Caster
  (79) and Defender (69); one optional native fixture was skipped. Saved output:
  `/tmp/ak5e-caster-npm-final.log`.
- [x] `npm run test:automation`: test passed and the generated automation audit
  was current. Saved output: `/tmp/ak5e-caster-automation-final.log`.
- [x] Final live run `/tmp/ak5e-caster-final.json` passed on the disposable
  World. It reports no unexpected browser errors and confirms observer rejection
  with no Caster controls, setup cancellation without mutation, native Art damage
  rolls and AP expenditure, and reference casts blocked without spending AP.
- [x] Core checks covered Unending's spend/refund boundary, Signature Art damage
  handling, Doublecast repeat denial, Power from Within, borrowed-grant expiry,
  and AP recovery. Mystic checks covered a three-cast Burst with critical damage
  suppressed, initiative rerolls (0→1→2 charges), Feedback Loop (+2 charges),
  end-of-Turn gain (3), and Long Rest reset (0).
- [x] Mech checks covered two owned drones, native drone-space casting (+2 AP),
  two commands, independent Wolfpack Reaction budget, Death from Above cost and
  rider, Duplication cost and attack lock, passive Perception 6, Jury Rigging
  without excess-Temp-HP inflation, AP-funded repair and 500 LMD rebuild.
- [x] Main agent reviewed owner controls, setup preview (zero new grants),
  drone-origin quote, the native owner drone sheet and observer read-only sheet.
  The final observer could view the native sheet; operations were rejected and
  Caster controls were absent.
- [x] Actual server stop/start and restart verification passed. The report
  `/tmp/ak5e-caster-restart.json` has no errors and confirms all three Actors'
  AP and pool IDs, managed Item IDs, Mystic Charge reset, two drone links and
  rebuilt drone HP, with no new grants on setup preview and no mutation on
  cancellation. Main agent reviewed the Core, setup-preview and GM-drone restart
  screenshots. Core's 88 managed Items are its 84 setup Items plus three
  subsequently learned Operator Skills and the preserved expired Rabbit Art
  (Stone Shower). The restart check identifies these four by source IDs and
  verifies the count exactly; every Item ID matches the pre-restart snapshot.

The live harness used the existing disposable `standard-test` World at
`/tmp/ak5e-standard-test`, Foundry 13.351, D&D5e 5.3.3, AK5e 0.5.0, with only
AK5e enabled. The actual renderer was `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)`;
this records the renderer and does not by itself establish hardware acceleration.

Some named Arts are absent from the installed licensed spell content. Live
fixtures for those names are mechanics-free reference Items with no activities;
attempted casts are blocked. They are test references, not working Arts or
production mappings. Production setup needs GM-approved UUID mappings to
legitimate licensed spell documents. Twelve unrelated Standard Bearer no-op-save
errors and the installed D&D5e ActiveEffect pack-schema warning were logged as
known baseline issues; the live report's `unexpectedBrowserErrors` list is empty.
Public release-pack imports, licensed distribution, and public installation have
not been performed.

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

- [ ] As a GM, await all six `game.ak5e.installChapter...()` calls and
  `game.ak5e.installRollTables()`. Confirm release-wide totals are 24 journals,
  2,013 top-level Items, 156 Actors (including 11 source-defined summons) and
  four RollTables. This broader clean-World check remains separate from P0.
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

### SP audit and Skill targeting (0.3.6, 2026-10-02)

An independent clean `sp-test` World at `/tmp/ak5e-skill-foundry` used Foundry
13.351, D&D5e 5.3.3 and only AK5e. Its system/module copies and server on port
30133 were separate from installed World data. Browser tools used full Chromium
143 through `launchTestBrowser()` and closed browsers in `finally`.

- [x] Existing SP suite: stacked charging, native attack misses, temporary HP,
  actual healing, deferred Skill-origin suppression, two owners, two GMs,
  observer rejection, synthetic pool isolation, expiry/rewind, native Long Rest
  and reload. All 320 catalogue Items remained valid; no browser errors.
- [x] Actual Ctrl+T on a hovered unowned enemy and Ctrl+Shift+T addition from a
  player canvas. Concurrent activation with one stable ID spent once. Escape
  canceled a local placement without changing SP or templates.
- [x] Grand Cross created two rectangles, excluded its source, missed diagonal
  victims and included an occupied cell of a large token. Cluster Bombs created
  three areas and deduplicated overlapping victims. Hidden victims were absent
  from player results/shared Actor receipts and GM receipt messages remained
  private.
- [x] Native cone/line inclusion, moving Thousand Cuts aura, delayed Holding
  Shadow after Instant expiry, Blood Boil's damage counter/ending prompt, native
  Martial save DC, five separate Echoes of Life healing rolls, and original
  activation/phase provenance. Resolution did not change HP automatically.
- [x] Volcanian's subsequent placed pulse recomputed victims, offered native
  saving throws/damage with the original phase provenance and spent no further
  SP. Escape canceled Frost Claw's subsequent preview without changing state.
- [x] Inactive scenes: native hex offsets (eight cells for the fixture),
  gridless token-center inclusion, closed-wall blocking and an opened door.
  GM scene references were independent of their selected targets/current canvas.
- [x] Explicit managed update preview/application retained Item IDs, a user-edited
  damage formula, custom counter and SP. Reload retained activation receipts.
- [x] Server restart retained SP, synthetic-token state, templates, phase
  receipts, Blood Boil counter, edited activity and custom counter. Player state
  retained hidden-token privacy. Fresh native models validated all 320 generated
  Skills. Actual native positive damage at zero HP charged; immunity did not.
- [x] Node regressions cover unavailable Spell Save DC, positive-HP prerequisites,
  healing limits, defenses, source variants, source exclusions, corner spreading,
  sealed walls, range/count validation, cancellation/recovery, failed commits,
  retry deduplication, cross-caster template isolation and GM counter corrections.

Full `npm test` passed: 146 passing tests and one optional native-sheet test
skipped in the Node environment. Exact source/generated-file checks and file
validation also passed. Runtime browser checks independently validated native
D&D5e models.

Actual renderer:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
The launcher requested acceleration; this environment supplied software
rendering. Hardware acceleration remains unverified.

Manual limitations remain explicit in `SP_SKILL_AUDIT.md`: linked Arts, summons,
movement paths, conditional effects/tethers, source omissions, source height,
elevation, structure thickness and uncertain wall types. These checks do not
establish locked release-pack or clean zip/manifest installation readiness.

## SI-1 operation kernel (Standard Bearer re-based, unreleased)

Disposable `standard-test` World only (`/tmp/ak5e-standard-test`; Foundry 13.351,
D&D5e 5.3.3, AK5e 0.3.8 manifest version, repository code installed with
`tools/install-for-testing.mjs`). Run 2026-10-10 with `launchTestBrowser()`;
actual renderer: ANGLE Vulkan **llvmpipe** (software; hardware acceleration not
verified). The focused script was a temporary scratchpad file, not committed.

Observed in the live World:

- [x] GM submit commits, replays the same ID as `replayed: true`, rejects the same
  ID with different choices, and rejects an unconfirmed request.
- [x] A Player's request travels through the whispered chat message, is committed
  by the GM client, replays once, and a different-choices reuse is rejected.
- [x] A non-owner Observer is rejected ("You must own the Standard Bearer.").
- [x] An operation left `prepared` by an earlier interrupted run blocked a new
  operation with the interrupted-operation message; GM `reconcile` cleared it.
- [x] The Standard Bearer panel opened from the sheet and listed all 26 controls;
  screenshot reviewed. Reload kept the committed operations and state; none prepared.
- [x] No page errors. Console warnings were WebGL "GPU stall" notices and D&D5e 5.3
  `senses.*` deprecations.

Not verified: the full `tools/test-standard-bearer-live.mjs` script did not
complete on this run (its fixture failed in `syncStandardMap` with a MeasuredTemplate
`RenderFlags` error from the Operator template layer when the canvas was not yet
drawn; the same error occurred on a refreshed copy of the pre-refactor code, so it
is not attributable to the kernel but was not investigated further). Player
panel rendering, the Retry-pending button, Cry/Tip/Projection dialogs and
restart persistence were not re-inspected. Three long control labels ("Preview
standard setup", "Hand the Standard…", "Additional Tip…") overflow their buttons
in the panel; CSS was not changed here.

## P1 kernels SI-2 / SI-3 / SI-4 / SI-12 (unreleased)

Disposable `standard-bearer` fixtures in `/tmp/ak5e-standard-test` only; Foundry
13.351, D&D5e 5.3.3; repository code installed with `tools/install-for-testing.mjs`
after the independent-review fixes. Run 2026-10-10 with `launchTestBrowser()`
(native-Vulkan arguments); actual renderer ANGLE Vulkan **llvmpipe** (software; hardware
acceleration unverified). The focused script was a scratchpad file, not committed.

Observed (GM and the owning Player on the real server):

- [x] Module loads; `game.ak5e` exposes `resourcePools`, `triggers`, `damagePipeline`,
  `tipOfTheSpear`; no page errors. Handler counts per hook equal one per owning module.
- [x] Standard Bearer after the rewire: Directed Engagement, then Tip outcomes 2 (Temp HP
  0 -> 4, additive), 3, 4 and 5 created the expected tagged effects on the ally; the
  critical-range hook lowered the ally's threshold to 19; outcome 7 was rejected ("Tip
  choices range from 1 to 6."); the Defiant Roar damage preview returned its ordered
  breakdown.
- [x] A real `actor.applyDamage` produced a `hitTaken` event (amount 3) alongside the
  existing world-rules / Operator handlers; Temp HP absorbed it as the pipeline predicts.
- [x] Resource pool: initial 7 (PB 6 + 1), spend 2 -> 5, overspend rejected, replayed
  `eventKey` recovery ignored, limiter first use true / second false; the owning Player
  spent from their own pool; values persisted across a reload.
- [x] Reaction budget: base 1, second spend rejected (`perTrigger`, then `exhausted`),
  state persisted across a reload.

Not verified: no clean-World import from release packs; no rendered panel was
inspected this run (only the canvas, which was paused); `combatTurnChange`, initiative,
rest and `deleteCombat` adapters were exercised by Node tests only, not in a live
combat; cross-client races and the installed-module upgrade path; hardware
acceleration. The full `tools/test-standard-bearer-live.mjs` fixture still fails in
`syncStandardMap` as recorded above.

## Defender, Dreadnought and Artshield live run (0.5.0, 2026-10-10)

Script: `ak5e/tools/test-defender-live.mjs` (uses `launchTestBrowser()`), run against a private
copy of the disposable `standard-test` World (`/tmp/ak5e-defender-test`, port 30147) so other
sessions could not shut the server down mid-run (earlier runs 5 and 6 failed that way, not in
the module). Foundry 13.351, dnd5e 5.3.3, ak5e 0.5.0. Recorded renderer: `ANGLE (Mesa, AMD
CEDAR, OpenGL ES 3.1)`.

Observed:

- [x] 18/18 checks PASS in one run (run 7): setup preview writes nothing; setup is idempotent
  and a replayed receipt is a no-op; Legendary Might 18/20/22 -> 24/26/26; Resilience 8 at level
  15; Shelter Bonus Action costs 1 and a real enemy attack within 5 ft is rolled at Disadvantage
  (not outside 5 ft or after it ends); Arts Resistance and Spellshield give Advantage on a Save
  rolled from an Art's chat card (and not on a non-Art save); Advance, its SP awards (+3 each,
  once), end and GM reinstatement; Crownsplitter doubles the STR modifier against the Elite;
  Expel refused with nothing stored, then Absorb and Expel; Wrecking Wall DC 20 Con card;
  Eye of the Storm Reaction, pool spend, 20-ft template and expiry; owner panel and controls;
  observer has no controls and commands are rejected; state persists after a browser reload.
- [x] Server restart: the private server was stopped by PID and restarted; the restart-mode run
  confirmed both Defender actors' setup flags, managed effects and Resilience pool persisted.
- Screenshots reviewed (setup preview, controls, Shelter form, sheet panel, chat cards, observer
  sheet): legible, no clipping of the dialogs themselves.

Not verified or not clean:

- The script exits 1: 14 console errors, all "Standard Bearer state could not be saved" (B-080),
  not from Defender code. No Defender check failed because of it.
- The Eye of the Storm map screenshot does not show the template (an unrelated "Choose Skills"
  dialog covers the map, B-083); the template was confirmed by the check, not by sight.
- The post-restart screenshot shows only the paused canvas (the sheet had not rendered within
  800 ms); persistence was confirmed by the data check, not visually.
- No clean-World import from locked release packs; no player-client (non-GM) rendering beyond the
  owner and observer fixture users; the five Shelter/SP Talents and five Branches remain
  unimplemented (see `TODO.md`).

### Independent rerun with the review fixes (private server, 2026-10-10)

A second, independent run of `ak5e/tools/test-defender-live.mjs` on its own copy of the World
(`/tmp/ak5e-defender-mine`, port 30148, stopped and restarted by PID), after the fixes in
`bugs/fixed/` B-F08 to B-F11 (rest ordering, manual-disable respect, leaf-level state writes):

- [x] 18/18 checks PASS, twice, with no console errors other than the 14-22 recorded Standard
  Bearer baseline messages (B-080, listed separately in `knownBaselineErrors`).
- [x] Server restart: after stopping and restarting the server, the restart-mode run confirmed
  both Defender actors' setup flags, managed effects and Resilience; the reopened Dreadnought
  sheet shows STR 24 (Legendary Might re-applied), Defender 15 and 10/15 SP intact.
- [x] Eye of the Storm: the check now asserts the barrier is still up and drawn
  (`canvas.templates.placeables`) before the Artshield's next Turn ends, and the in-run
  screenshot shows the 20-ft circle with its squares highlighted around the Artshield. An earlier
  screenshot missed it because the command was issued before the previous turn-end event had
  been processed; that was a test race, not a module defect.
- Recorded renderer: `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)`, a hardware GL renderer, not
  llvmpipe; that is the actual reported string, not proof of the specific acceleration mode.
- Screenshots reviewed: setup preview, controls dialog, Shelter form, sheet panel, Arts save
  card with the "Arts Resistance: Advantage" toast and a d20adv roll, Wrecking Wall card (DC 20
  Constitution save and Damage buttons), Eye of the Storm map, observer sheet, post-restart
  sheet. All legible; the Shelter form's fieldset legend wraps onto its border.
- Not verified: clean-World import from locked packs, a non-GM player client beyond the owner and
  observer fixture users, and Foundry-rendered Stunned handling (a manual procedure).

## Juggernaut, Protector and Sentry live run (2026-10-11)

**Environment.**
- Script: `ak5e/tools/test-defender-jps-live.mjs`. It uses `launchTestBrowser()`, refuses any World but `standard-test`, and creates only fixtures flagged `jpsLiveFixture`.
- It ran on a private copy of the disposable `standard-test` World, in this session's scratchpad on port 30185, never the production World.
- Foundry 13.351, D&D5e 5.3.3; the module reports 0.5.6 because the version was not bumped.
- Recorded renderer: `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)`.
- The working tree also contained other agents' in-progress Marksman and Flinger code.

**Result:** 8/8 checks PASS in run 3, with 0 console errors.

- [x] **Juggernaut damage.**
  - Native `applyDamage` from an enemy-speaker card halved 11 to 5.
  - Three `calculateDamage` previews used no layer.
  - One layer shattered and posted a `1d8 + 3` Shatterstorm receipt awaiting the Roll button.
  - Damage without a card was unchanged.
- [x] **Overwhelming Might:** a melee `rollDamage` included a Force roll while a layer held.
- [x] **Juggernaut as the player:** the player rolled Shatterstorm, undo restored the layer to 2, and a Bullrush card was posted.
- [x] **Protector Stone Wall:** the player's Stone Wall put Off Balance on a GM-owned enemy through the GM relay. A native attack roll against it had `advantageMode` 1.
- [x] **Protector Shelter:**
  - The player's Shelter with Anchor Point stored a 10-ft radius.
  - The sheltered ally's native Dexterity save rolled with Advantage.
  - Greater Improved Shelter was applied automatically by relay. It halved the first 10 Damage to 5, and the next 10 was taken in full.
- [x] **Sentry Pavise:**
  - The player planted the Pavise: a template was created by the player and the shield was unequipped by the chosen reading.
  - An attack on the Pavise ally from beyond the shield rolled with Disadvantage; one from the ally's side did not.
- [x] **Sentry Advance and Fire:** it spent the Reaction, and the 1-Resilience refund restored it.
- [x] **Reload:** the template, the unequipped shield, Off Balance and the receipts survived a browser reload.
- [x] **Server restart:** the private server was stopped and restarted. The restart-mode run matched every fixture Actor's receipts, pools, Shelter, HP, items with their equipped states, effects and the Scene templates exactly (1/1 PASS).

**Harness fixes during the runs (not module defects):**
- An activity ID was one character short.
- The player client read a receipt before the GM's write had synced; the script now waits for it.
- A GM token `update({x})` did not move the token. The script now uses a second attacker on the near side.

**After the independent review fixes (run 5):**
- The fixes were reinstalled into the same private copy.
- 8/8 checks PASS with 0 console errors. The restart-mode run after a second server restart also PASSed (1/1).
- The review findings were fixed with regression tests and mutation checks in Node:
  - the Pavise relay deletion;
  - the Advance and Fire prompt with Actor-UUID targets;
  - the double halving with one layer (preApplyDamage reservation);
  - level warnings refused by the relay;
  - the progression chain on recorded writes;
  - undo gaps: Retributor, Reaction refunds, and GIS and Punishment use-ups.
- The visual review of the run-3 screenshots found the Defender panel clipped at the bottom of the viewport and an empty Shatterstorm "result" card body; both are fixed for run 5.

**Not covered:**
- A live Groundbreaker or Heads Down use.
- The Bar the Gates and Torrent of Lead Turn expiry, which is covered by unit tests only.
- A clean-World import from locked packs.
