# AK5e — Known bugs and things that need fixing

Collected from agent runs (SI-1 operation kernel; SI-2/3/4/12 kernels, their reviews and live
checks), 2026-10-10. This file lists **defects, gaps and unverified behaviour**. Open rules
questions live in `ak5e/DECISIONS.md`; planned work lives in `TODO.md`.

**How to use:** add new entries at the top of the relevant section with the next free ID. Say
where it was found (agent/run), the evidence, and what "fixed" means. Move fixed entries to
*Fixed* with the date rather than deleting them. Severity: **High** (data loss / wrong rules
result / security), **Medium** (wrong in some situations), **Low** (cosmetic, latent, or tidy-up).
"Unverified" means it was reasoned about or tested in Node only, not reproduced in Foundry.

## Open

### Marksman, Anti-Air and Artilleryman audit (Codex, 2026-10-11)

Full source/code evidence, reproductions, recommendations, the 117-entry map and
pending Foundry checklist are in [MARKSMAN_AUDIT.md](ak5e/MARKSMAN_AUDIT.md).
These findings are static or Node-mock verified; none is claimed reproduced in
rendered Foundry. Gameplay code was not changed. Existing tests pass despite them.

- **B-110 · High · Broken feature/Undo controls.** `marksman-sheet.mjs:463`
  passes an engine object instead of `confirmPlayUse`'s callback; line 443
  reverses Undo helper arguments. Probes throw `attempt is not a function` and
  `engine.uses is not a function`. Fix the interfaces and exercise real clicks
  with confirm/cancel as both owner and GM.
- **B-111 · High · Undo refunds costs but leaves benefits active.**
  `play-uses.mjs:343–352` has no snapshot/cleanup for Marksman plan flag updates.
  Engine probes leave Target Lock, Last Option and munitions active with uses
  refunded. Record/restore every changed flag and review later conflicts.
- **B-112 · Medium · Missing card controls.** `marksman-sheet.mjs:471–485`
  never registers the imported `renderPlayUseCard`. Direct API cards have no
  shared Undo/Retry/Roll controls. Register and render-check owner visibility.
- **B-113 · High · Artilleryman setup loses every feature's rules.**
  `marksman-setup.mjs:36–42` uses `class-feature-*` instead of the six generated
  `subclass-feature-*` IDs. A level-18 preview emits six placeholder descriptions.
  Correct source lookup and safely repair existing placeholders without erasing
  authored changes or casually replacing source IDs.
- **B-114 · High · Progression repeats ASIs and replaces authored HP.**
  `marksman-progression.mjs:106–122,156–163` recomputes whole HP and reapplies ASIs
  to current abilities. A level-4 probe changes STR 12→14, then previews 16 for
  the same choices, and replaces max HP 100 with 31. Track contributions and
  already-included choices; preserve Tough/other authored HP and test reapply.
- **B-115 · Medium · Missing style/Talent/tool/equipment choice grants.**
  `marksman-progression.mjs:79–89` lists these choices, but 120–194 never applies
  them. Artilleryman launcher proficiency grants are absent too. Implement
  reviewed grants or expose an accurate complete manual procedure.
- **B-116 · Medium · Preview does not bind values.** Progression line 170
  hashes only update names; a +1 STR preview key accepts +2 STR at apply.
  ASI budgets/three allowed skill picks lack warnings. Bind full values and
  source choices; reject malformed data, warn on legal table-rule overrides.
- **B-117 · High · Target Lock never expires; retarget loses its duration.**
  `marksman-uses.mjs:65` and `marksman-rules.mjs:197` do not enforce C3:3648's
  minute. `anti-air-features.mjs:113` replaces the lock without retaining expiry
  or warning on the dead-target prerequisite (C3:3889). Preserve and test expiry.
- **B-118 · High · Initiative recovery does not restore actual uses.**
  `marksman-features.mjs:180` mistakes an event for its `raw.actor`; Anti-Air
  line 319 writes `pools` instead of `resourcePools`. Event mocks leave both
  canonical pools at 0. Use canonical receipt-aware recovery and test payloads.
- **B-119 · Medium · Fighting Style attack boundaries are wrong.**
  `marksman-features.mjs:144–149` expands Deadly Fighter's crit range on every
  roll, not the first each Turn (C3:3628). Close and Personal leaves disadvantage
  set when advantage is already true (134–139). Test repeated/opposing flags;
  unrelated-disadvantage wording remains an explicit interpretation question.
- **B-120 · High · Weight of Fire suppresses future unrelated advantage.**
  Anti-Air lines 90/305–307 set/read a permanent flag, never consume/reset it,
  and narrate rather than expose the repeat attack. A later melee roll also
  loses advantage. Scope to one chosen ranged Attack Action roll and track use.
- **B-121 · Medium · A grounded flyer is treated as airborne.** Anti-Air
  lines 66–70 infer airborne state from fly speed or absolute elevation.
  The probe and existing test grant the bonus to a grounded fly-capable Actor.
  Use reviewed actual airborne/last-Turn movement facts (C3:3887).
- **B-122 · High · Last Option has no expiry or free-use Turn reset.**
  Anti-Air lines 136–137/164/275–276 retain booleans indefinitely. Only its first
  free Option is free; extra attack is narrative. Track the source minute and
  own-Turn allowance, expose owner attacks/manual boundary, test next Turn.
- **B-123 · Medium · Versatile Approach is missing inputs/resolution.**
  Anti-Air lines 171–212 narrate results; sheet lines 451–460 provide no point,
  height, immunity nominations or damage-instance count. Save/roll controls,
  delayed/lingering effects and one-Option-per-Attack warnings are absent.
  Guide the actual operations or describe the complete manual process.
- **B-124 · Medium · Unapproachable lacks trigger/repeat warnings.**
  Anti-Air lines 220–255 check Reaction/level only, omitting weapon normal range,
  movement/hostility and same-Creature-per-Turn facts (C3:3919). Attack/movement
  are narrative. Add warnings and owner-operated resolution without turn gates.
- **B-125 · High · Artilleryman hooks alter non-Thunder damage.**
  `artilleryman-features.mjs:209–230` never checks damage type for extra dice or
  vehicle/structure multiplier. A Piercing Splash mock receives +3d6; a Piercing
  vehicle roll gets multiply 2. Scope per actual Thunder component/recipient.
- **B-126 · Medium · Blast controls have no reviewed blast inputs.**
  Artilleryman lines 100–166 default deployment to `{x:0,y:0}` and secondary
  damage to 0; sheet supplies neither. Weapon/Splash origin, automatic ten-minute
  detonation, disarm, saves, no-chaining and Scatter/collision resolution are
  missing. Add guided inputs/resolution or explicit complete manual boundaries.
- **B-127 · Medium · Artilleryman native benefit consumers are absent.**
  `artillerymanSplashDC` only supplies a displayed/public calculation; no native
  trap/Splash DC path reads it. X doubling, removing Loading, Thunder resistance
  and self-damage immunity are not implemented. Integrate faithfully or label
  them manual; no source trap base DC is invented.
- **B-128 · Medium · Receipt-write failure strands a spent Reaction.**
  Artilleryman line 137 spends before `play-uses.mjs:265–268` saves the use.
  Fault injection leaves Reaction 0, active munition and no undo receipt.
  Persist prepared state before side effects; test retry/rollback without a
  double spend. This is a confirmed mocked failure, not a live Foundry incident.

### Live testing / environment

- **B-004 · Low · Hardware acceleration unverified.** The earlier live runs reported the ANGLE Vulkan
  **llvmpipe** software renderer. `launchTestBrowser()` requests `--enable-gpu` only. Record the
  real renderer on a machine with a working GPU before claiming acceleration.
  The 0.5.1 repair runs report `ANGLE (Mesa, AMD CEDAR, OpenGL ES 3.1)` through the actual
  WebGL renderer query. No acceleration benchmark or specific acceleration mode is claimed.
- **B-005 · Low · Unattributed console warnings.** D&D5e 5.3 deprecation warnings
  (`senses.darkvision/blindsight/tremorsense/truesight has moved to senses.ranges.*`) and WebGL
  "GPU stall due to ReadPixels" appear during live runs. The source of the `senses.*` accesses
  (module code, the test fixtures, or the system itself) was not identified. The older D&D5e
  ActiveEffect-pack warning is recorded in `FOUNDRY_SMOKE_TEST.md`.

### Standard Bearer UI

- **B-011 · Low · Unverified: Operator "Choose Skills" dialog opens over the Vanguard sheet.**
  Opening the test Vanguard's sheet showed the "Choose Skills" dialog on top of it. This is
  probably intended for an Actor with unchosen tiers; confirm it is not triggered for a class
  that has no Operator Skill choices to make.

### SI-2 resource pools (`scripts/resource-pools.mjs`)

- **B-020 · Medium · Unverified: lost updates across clients.** `keyedSerial` orders writes only
  within one client. A player's `spendPool` and the GM's `recoverPool` write absolute values and
  can overwrite each other. Needs a version/receipt check or routing writes through the GM
  (as the SI-1 kernel does for operations).
- **B-021 · Low · Receipt history is short.** Receipts are capped at 24 per pool and shared by
  all event types, so a pool with turn-start and turn-end triggers keeps about 12 rounds. An
  old event replayed after eviction (GM stepping back, initiative reroll) regrants.
- **B-022 · Low · Recovery list order matters.** Only the first matching entry applies and a long
  rest matches `lr` then `sr`; a pool defined `[{sr:+2},{lr:full}]` gets only +2 on a long rest.
  Make `definePool` reject or reorder ambiguous lists, or apply all matching entries.
- **B-023 · Low · Rest dedupe falls back to `config` identity.** `seenRests` is a `WeakSet` keyed
  by the rest `result` object, or `config` if `result` is not an object. dnd5e always passes a
  fresh `result`, so this is latent; numeric `+n` rest recoveries have no `eventKey` receipt.
- **B-024 · Low · Corrupt stored values refill the pool.** A float, negative or string stored
  `value` silently falls back to the initial/max value on read. Surface it instead of masking it.
- **B-025 · Low · Prototype-name pool IDs.** IDs such as `constructor` or `toString` pass the ID
  regex and `stored()`/`_limits[key]` use plain-object lookup (harmless today). Use
  `Object.hasOwn` or a `Map`.
- **B-026 · Low · Test adequacy.** Hook tests depend on a 15 ms `settle()`; the Doublecast test
  asserts a bare `lr` trigger does not refill an SR-only pool (a quirk of the rest split, not a real
  long rest); no test covers a real long rest on Doublecast.
- **B-027 · Medium · Not done: feature trackers are separate.** `feature-trackers.mjs` still
  computes maxima by string equality (`@prof`, one tier formula) and silently drops a tracker
  whose formula it does not recognise (`Number.isFinite` check, ~L164). Migrating consumers onto
  pools was deliberately deferred (flags and native `system.uses` data).

### SI-3 trigger events (`scripts/trigger-events.mjs`)

- **B-030 · Medium · Unverified: no live combat run.** Initiative, `combatTurnChange`, rest and
  `deleteCombat` adapters, riders and Reaction refresh were exercised by Node tests only. Run a
  real combat in the disposable World (including a quick double advance, an inserted combatant,
  rewind, and a player-owned actor).
- **B-031 · Medium · Kill detection misses direct HP edits.** `kill` is derived from
  `dnd5e.applyDamage` only; HP changed on the sheet, by macro or by a healing/effect path is not
  seen. Also: no events when no GM is online; chat attacks without an activity have no actor.
- **B-032 · Low · Hit/miss uses current targets.** Hits are computed from the user's targets and
  their AC at `postRollAttack` time, not the targets dnd5e stored on the message.
- **B-033 · Low · Consumed `once` rider blocks re-registering the same ID** until a non-attack
  expiry pass prunes it, so outside combat it stays; transient matcher functions are keyed by
  rider ID across all Actors.
- **B-034 · Low · Rider expiry is only wired for attack, combat turn and combat end.** Time,
  rest and concentration expiry exist in `tagHasExpired` but nothing calls `expireRiders` from
  those hooks.
- **B-035 · Low · Combat-end Reaction reset not implemented.** Reactions refresh at the creature's
  own turn start only.
- **B-036 · Low · Trust limit.** Any owner can write their own rider and Reaction flags from
  their client; GM-authorised commits would need the SI-1 kernel.
- **B-037 · Low · Two interpretations of turn events coexist.** `trigger-events.mjs`
  (`combatTurnChange`) and `resource-pools.mjs` (`updateCombat` + `combat.previous/current`)
  each derive turn start/end independently. Pick one source of truth when the Reaction budget is
  moved onto an SI-2 pool.
- **B-038 · Low · Test mock gaps.** Reaction/rider tests now mimic Foundry's recursive flag merge,
  but `tagged()` and effect creation are mocked in the Tip tests, so they pin option shapes, not
  real Foundry effects.

### SI-4 damage pipeline and Standard Bearer wiring

- **B-040 · Medium · Duplicate reduction logic remains.** `ak5e.mjs` `damageAfterReduction`
  (and `world-rules.mjs` `previewDamage`) still use their own arithmetic. They agree with the
  pipeline for valid numbers but differ on malformed input (returns 0/`NaN` instead of throwing).
  Reconcile and delete the duplicates.
- **B-041 · Medium · Unverified: dice-rule adapter on critical hits.** It is not known whether
  dnd5e's critical-hit dice configuration keeps the modifiers appended by
  `applyDiceRulesToRolls`. The maximise adapter uses `min{faces}` because `options.maximize` has no
  effect at `postDamageRollConfiguration`; explosions are refused on rolls with several dice terms.
- **B-042 · Medium · Not implemented.** Crit-range helper beyond Tip (TODO L399-400),
  damage-type override (L220), HP-loss presets for Debilitate/Godpiercer/Mortal Blow/Nervous
  Impairment (need a ruling), `world-rules.mjs` wiring.
- **B-043 · Low · Behaviour tightening to confirm.** `confirmedDamage` now throws before any write
  on an undefined `hp.value` or negative `hp.temp` (previously wrote `NaN`/extra damage); a
  fractional manual total would now be floored (the UI only accepts whole numbers).
- **B-044 · Low · Unlogged-until-review interpretation.** HP-loss `bypassResistance` also bypasses
  Vulnerability. Logged in `DECISIONS.md`; confirm or change.

### SI-12 Tip of the Spear

- **B-050 · Low · Unexercised branches.** `useTipVariant`'s `range`, `source` and `targets`
  paths are used only by the named wrappers (none wired); no integration test drives Last Stand
  (index 1) or `tipSP` through the real Standard Bearer command path.
- **B-051 · Medium · Variant entries are not wired.** Agent, Charger, Pioneer, Tactician,
  Leading Lance and Devastating Blow have entry functions but no caller or trigger; their source
  conditions (Invisible, Marked/0 HP, Tactician "from 4th Level") are not enforced.

### SI-1 operation kernel and Operator Skills

- **B-060 · Low · Three copies of the request transport.** `operator-skills.mjs`
  (`submitOperatorCommand`/`handleOperatorRequest`) still carries its own chat-message transport
  and journal; only the queue was shared. Migrating it changes SP-ledger replay semantics and needs
  its own tests.
- **B-061 · Low · `reconcile` has no UI.** The Standard Bearer panel lists a "Refresh" button
  mapped to `reconcile`, but its dialog does not collect `operationId` and `reason`. GM recovery
  currently needs the console/API.

### Repository hygiene

- **B-070 · High · Almost all work is uncommitted.** Every kernel, test and the Standard Bearer
  files are untracked or modified in the working tree; `git worktree` isolation was unusable for
  parallel agents because HEAD lacks them. Commit (or otherwise back up) when the owner decides,
  then future parallel work can use worktrees.

### Defender, Dreadnought and Artshield (0.5.0 live run, 2026-10-10)

- **B-086 · Low · Smaller fidelity doubts (all logged or visible, none contradicts a printed
  number).** Concentration Breaker is consumed by the next Concentration Save whatever caused it
  (`artshield-features.mjs:107-111`); Leaping Ward cannot take Leaping Defence's Resilience
  Reaction refund (`defender-features.mjs:185`); Spellshield sight is confirmed once per Shelter,
  not per Art; Shelter outside combat has no automatic expiry; the Advance watch starts at entry,
  not "since your last Turn" (source L1331); `message.data.flags.dnd5e.targets` in
  `preRollDamageV2` (Crownsplitter tier lookup) is not listed as a live-verified fact, although
  the Crownsplitter check passed.

### Juggernaut, Protector and Sentry (2026-10-11)

Found by the independent review (critical-reviewer, Opus) and the live runs of
`ak5e/tools/test-defender-jps-live.mjs`. Rulings are in `ak5e/DECISIONS.md` ("Juggernaut, Protector and Sentry
branches"); checks still to run are in `VERIFY.md`.

- **B-090 · Medium · Damage Reduction is applied after the automatic halving and Resistance.**
  - Chapter 1 L208 applies DR before Resistance. DR is still a manual step in this module.
  - Superheavy, Improved Taunt and Greater Improved Shelter change the native amount first (`defender-damage-mods.mjs`).
  - Example: 20 Damage with DR 4 and Resistance should leave 8; the native result is 10, and a hand-applied DR then gives 6.
  - Juggernaut Armour has 5 DR against all Damage, so this affects every hit on a Juggernaut.
  - Workaround: the shatter card and the public "AK5e Defender: Damage to …" note state the DR-first rule, and the table corrects HP by hand.
  - Fixed means: equipped DR is applied in the hook before these modifiers (a world-rule decision for the owner), or the card shows the exact corrected figure.
- **B-091 · Medium · Unverified: lost Defender use receipts across clients.**
  - Every Defender use saves the whole `flags.ak5e.defenderUses` object (`play-uses.mjs` `save`), and the `undo` array is replaced wholesale.
  - Some automatic uses run on the GM client for player-owned Actors: a shatter when the GM applies Damage, Unending Defence, and the Torrent of Lead Turn-end write (`sentry-features.mjs` `torrentTurnEnd`).
  - A player use committed at the same moment can drop one of those receipts, or restore a stale `data.torrent`, so Torrent lasts an extra Turn.
  - Same class of problem as B-020 and the pre-0.5.1 B-085.
  - Fixed means: leaf-level writes or GM-routed commits for these flags.
- **B-092 · Low · Unverified: the Superheavy layer reservation is per client.**
  - The `dnd5e.preApplyDamage` reservation stops one client halving two instances with one layer (B-F13).
  - Two different clients applying Damage to the same Juggernaut at the same moment (for example the GM and the Juggernaut's player) can still both halve with the last layer and offer Shatterstorm twice.
  - The second shatter card shows "Barrier layer short by 1"; undo it.
- **B-093 · Low · The damage modifiers act only on Damage applied from a chat card.**
  - Hand-edited Hit Point bars, the DR calculator's manual workflow and Damage with no speaker skip Superheavy, Shatterstorm, Improved Taunt and Greater Improved Shelter.
  - This is a deliberate safety boundary (DECISIONS.md), but the table must apply these by hand in those cases.
- **B-094 · Low · Shelter still hard-stops player actions (pre-existing, WORKFLOW §3.2).**
  - `defender-features.mjs` `shelter` uses `needOwnTurn` and requires the ally confirmation, unlike the new Branch uses, which warn.
  - This affects Protector Anchor Point and Greater Improved Shelter, which depend on Shelter.
  - Tracked by the player-agency audit in `TODO.md`.
- **B-095 · Low · Defender panel scroll area has no visible scroll affordance.**
  - The panel body now scrolls inside the dialog (fix for the clipping in B-F15).
  - In the run-5 screenshots no scrollbar is visible; only the cut-off "Manual procedures" heading hints at more content.
  - Fixed means: a visible scrollbar or fade on `.ak5e-defender-dialog .ak5e-defender-panel` (`styles/defender.css`).
- **B-096 · Low · Repository hygiene: `BUGS.md` contains the B-F11 entry twice** (end of *Fixed*). It predates this increment and was left as found.

## Fixed

- **B-001 (fixed 2026-10-10, 0.5.1) · Medium · Standard Bearer live script fails.** `ak5e/tools/test-standard-bearer-live.mjs`
  stops in `syncStandardMap` with `TypeError: Cannot read properties of undefined (reading
  'OBJECTS')` raised from `OperatorMeasuredTemplate._onUpdate` → `RenderFlags.set` when it updates
  the aura MeasuredTemplate. It happened on the new code and on a restored copy of the old
  `standard-bearer*.mjs`/`operator-skills.mjs`, so it is not caused by SI-1. Likely the template
  layer is updated before the canvas/scene is drawn, or the `OperatorMeasuredTemplate` class
  (`operator-targeting.mjs`) assumes a drawn object. Fixed when the full script passes on a
  fresh disposable World.
  **Resolution:** The harness waits for the initial and fixture scenes/canvas and actual template graphics before commands. Two consecutive fresh-fixture runs (3 and 4) passed in the private World; no RenderFlags error.

- **B-002 (fixed 2026-10-10, 0.5.1) · Low · Live fixture is not re-runnable.** The same script leaves state in the
  `standard-test` World and fails on the next run with `Retrieve or return the standard before
  wielding it.` or `Recipient Speed must be greater than zero.` until the fixture Actors, scene and
  combat are deleted. Make the script reset or detect and reuse its fixtures. Also ensure it
  closes every browser context and never needs `pkill` (a `pkill -f` on the server command line
  killed the agent's own shell once; use the PID).
  **Resolution:** Marked fixtures are recreated on each normal run with explicit Speed. Teardown disables support and drains queued refreshes before deleting map/combat documents. Runs 3 and 4 passed consecutively; every context/browser closes through nested finally blocks.

- **B-003 (fixed 2026-10-10, 0.5.1) · Low · Test tooling paths are machine-specific.** Playwright lives only in
  `/tmp/frontier-browser-check/node_modules`, Chromium is the snap binary, and `playwright`
  cannot be imported by directory from ESM (`AK5E_PLAYWRIGHT` must point at an `.mjs` wrapper that
  re-exports `chromium`). Document this in `ak5e/README.md` or add a `package.json` dev dependency.
  **Resolution:** README now documents an ESM file path (playwright/index.mjs or a wrapper), executable override, configurable localhost port, and private test copies. No dependency installation is required.

- **B-010 (fixed 2026-10-10, 0.5.1) · Low · Panel labels overflow their buttons.** In the Standard Bearer dialog the labels
  "Preview standard setup", "Hand the Standard to a willing creature within 5 feet" and
  "Additional Tip: confirm a qualifying Skill Point gain" spill out of their button boxes
  (screenshot reviewed 2026-10-10). Fix in `styles/standard-bearer.css` (allow wrapping/min-height)
  or shorten the strings in `standard-bearer-sheet.mjs` `text()`.
  **Resolution:** Buttons grow vertically and wrap labels. GM/player screenshots were reviewed, and every panel label passed the rendered bounds check in runs 3 and 4.

- **B-012 (fixed 2026-10-10, 0.5.1) · Low · Rendered checks still missing.** Player-side panel, the Retry-pending button,
  the Cry/Tip/Projection dialogs and server-restart persistence have not been re-inspected since
  the SI-1/SI-12/SI-4 rewiring. `README.md` still labels the helpers "rendered validation pending".
  **Resolution:** GM/player panels, Cry/Tip/Projection dialogs, the real Retry-pending button, browser reload, and server-restart persistence were checked in 0.5.1. See the smoke-test record for exact scope.

- **B-062 (fixed 2026-10-10, 0.5.1) · Low · Stale documentation.** `ak5e/README.md` still says the installed module is
  0.3.5 and Standard Bearer helpers are "rendered validation pending"; `TODO.md` notes README
  points to a Standard Bearer smoke-test checklist that did not exist until the partial one
  added 2026-10-10.
  **Resolution:** Module/README versions now match 0.5.1; obsolete owner-install claims were removed. README links to recorded rendered evidence and documents repeatable checks without claiming complete branch/release acceptance.

- **B-071 (fixed 2026-10-10, 0.5.1) · Low · Stray untracked files.** `AGENTS copy.md` is untracked at the repository root and
  duplicates `AGENTS.md`.
  **Resolution:** The reported AGENTS copy.md is absent from the current tree. No deletion was performed.

- **B-080 (fixed 2026-10-10, 0.5.1) · Medium · "Standard Bearer state could not be saved" on every refresh with an unchanged
  state.** Seen 7 times (plus UI toasts) during the Defender live run, from `saveState`
  (`operation-kernel.mjs:67-70`) called by `refreshStandard` (`standard-bearer.mjs:~472`) for a
  leftover "Standard Bearer test" Actor in the cloned World when tokens move or combat changes.
  Suspected cause (not reproduced in isolation): `actor.update` of an identical flag returns a
  falsy value and `need(result)` throws. Fixed when an unchanged save is a no-op, not an error.
  **Resolution:** The kernel compares nested state by value, skips unchanged writes, and accepts an undefined result only if requested state persisted. Real Foundry returned undefined for an unchanged write; repeated kernel saves made zero writes. Standard Bearer runs 3/4/restart and all 18 Defender checks passed without this error.

- **B-081 (fixed 2026-10-10, 0.5.1) · Low · Live script exit code 1 hides a green run.** `test-defender-live.mjs` fails on
  any console error, including B-080. Fix B-080 rather than filtering the message.
  **Resolution:** The Standard Bearer exemption was removed. The Luna Defender run exited 0 with 18/18 checks and no unexpected console/page errors. Existing environment-warning filters remain; see smoke-test limits.

- **B-082 (fixed 2026-10-10, 0.5.1) · Low · Long Rest leaves the Eye of the Storm template on the map.**
  `defender-features.mjs:281` clears `state.barrier` before the Artshield rest handler runs, so
  `endBarrier` (`artshield-features.mjs:268`) returns early and never deletes the MeasuredTemplate.
  Reported by static review; not reproduced live.
  **Resolution:** Already fixed by B-F08; removed from Open during this reconciliation. The current Defender regression suite includes the Long Rest template cleanup case.

- **B-083 (fixed 2026-10-10, 0.5.1) · Low · Live script leaves the "Choose Skills" dialog open.** It covers the map and chat
  in later screenshots, including Eye of the Storm. Close it before capturing.
  **Resolution:** Already fixed by B-F11; current Defender screenshots close the chooser before capture. Representative owner/map/observer screenshots were reviewed by the main agent.

- **B-084 (fixed 2026-10-10, 0.5.1) · Low · Setup re-enables a Legendary Might effect the GM disabled.**
  `dreadnought-features.mjs:58` passes `disabled: false` and `defender-setup.mjs:35` writes it on
  every setup, contradicting "an edited managed effect is kept". Static review; not reproduced.
  **Resolution:** Already fixed by B-F09; current regression verifies a manual Legendary Might disable is preserved and a module disable restored.

- **B-085 (fixed 2026-10-10, 0.5.1) · Low · Concurrent writes can revert Dreadnought Advance watch flags.** `persist`
  (`defender-features.mjs:114`) writes the whole `flags.ak5e.defender` object while the GM client
  writes `advance.watch.*` by dotted path (`dreadnought-features.mjs:175,196`); `serial()` is per
  client. The GM reinstate command recovers. Static review.
  **Resolution:** Already fixed by B-F10; changed-leaf writes avoid stale sibling overwrites. Concurrent writes to the same leaf still remain last-writer-wins.

- **B-087 (fixed 2026-10-10, 0.5.1) · Low · Private-server practice.** Several sessions share the default test server
  (port 30135, `/tmp/ak5e-standard-test`) and one session's shutdown killed another's run. Use a
  copy of the data dir and a private port, and stop servers by PID.
  **Resolution:** Main and Luna live runs used separate private data copies/ports (30159 and 30161). Each server was controlled by its own PID; the test procedure is documented.
- **B-F01 (2026-10-10, SI-3 review)** Reaction `triggers`/`receipts` never cleared on real Foundry
  (recursive flag merge); now force-replaced with `==` keys.
- **B-F02 (2026-10-10, SI-3 review)** Turn events lost when the GM advanced twice before the
  first hook ran (core mutates `combat.previous`); handler now walks from the last processed state.
- **B-F03 (2026-10-10, SI-3 review)** Death saves emitted as saves; concentration saves never
  flagged `concentration`.
- **B-F04 (2026-10-10, SI-3 review)** Rider IDs containing `.` broke flag storage; rider expiries
  without anchor fields would never expire; unstarted combats emitted `combatEnd`.
- **B-F05 (2026-10-10, SI-2 review)** An index shift of the same combatant fired turn events;
  `deleteCombat` ran combat-end recovery for unstarted combats; `toInitial` was not clamped to max.
- **B-F06 (2026-10-10, SI-4 review)** `applyHealing` could lower HP above a reduced effective max;
  `preApplyDamage` received a different amount than was applied.
- **B-F07 (2026-10-10, SI-1)** A Standard Bearer `reconcile` required a resolvable source token;
  it now runs before token resolution.
- **B-F08 (2026-10-10, fixes B-082)** A Long Rest cleared `state.barrier` before the Artshield rest
  handler ran, so the Eye of the Storm template stayed on the map. Branch rest handlers now run
  first (`defender-features.mjs` `defenderRest`); test "a Long Rest removes the Eye of the Storm
  template from the map".
- **B-F09 (2026-10-10, fixes B-084)** Setup re-enabled a Legendary Might effect the GM had
  switched off. `reconcileManagedEffect` now restores only an effect this module itself disabled
  (`flags.ak5e.defenderManagedEffect.active === false`); a manual disable is kept.
- **B-F10 (2026-10-10, fixes B-085)** Defender state was saved as one object, so a stale copy could
  overwrite a key another client had changed. `writeDefenderState` now writes only the leaves a
  state object changed (`stateChanges` in `defender-rules.mjs`), including `-=` deletions, and skips
  empty writes. Cross-client writes to the same leaf are still last-writer-wins.
- **B-F11 (2026-10-10, workaround for B-081; fixes B-083)** The live script initially recorded the Standard Bearer
  baseline errors (B-080) separately instead of failing on them, closes the Operator Skill chooser
  before screenshots, unpauses the game, and waits for the template to draw. B-080 itself is not a
  Defender defect and remained open at that point. The 0.5.1 repair above fixes B-080 and
  removes that error exemption; this entry preserves the earlier workaround history.
- **B-F12 (2026-10-11, Juggernaut/Protector/Sentry increment)** Defender progression checked each write's `before`
  against the Actor as it went. A second write to the same path therefore always failed with "changed after preview":
  Fortress's launcher proficiency (latent since 0.5.6) and Sentry's ranged proficiency after the class's own
  weapon write. Same-path writes now chain their expected value, and a write that already has a receipt does not
  feed the chain (review follow-up). Regression tests are in `ak5e/test/defender-progression.test.mjs`.
- **B-F13 (2026-10-11, review, High) · The Pavise relay could delete any World document.**
  - A player could forge a Pavise marker receipt on their own Sentry and send a relay request.
  - The GM's client would then delete whatever UUID the forged record named.
  - Fixed: the engine refuses `local` target kinds through the relay (`play-uses.mjs`), and the Pavise marker and Reaction refund are local.
  - The marker deletes or recreates only this Sentry's flagged circle templates, and records a removal before deleting.
  - Regression test: `sentry.test.mjs`, mutation-checked.
- **B-F14 (2026-10-11, review) · Superheavy: one layer could halve two quick applications on one client.**
  - The layer is now reserved synchronously in `dnd5e.preApplyDamage` and released after the shatter is saved.
  - The cross-client case remains as B-092.
  - Regression test: `juggernaut.test.mjs`, mutation-checked.
- **B-F15 (2026-10-11, review and visual review) · Smaller fixes.**
  - The Advance and Fire prompt never fired in Foundry, because D&D5e target descriptors carry Actor UUIDs.
  - The GM relay refused Protector effects when a player had used a level warning's "Use anyway" (WORKFLOW §3.2); it now checks only which effects each use may create.
  - Undoing a Reaction refund left the Reaction available; it is now spent again.
  - Undoing Retributor kept the once-per-Round marker.
  - Greater Improved Shelter and Punishment use-ups could not be undone; they are now disabled only, and re-enabling restores them.
  - Greater Improved Shelter was not used up by an already-resisted first instance.
  - A later hit did not renew Punishment.
  - Improved Shelter text named the wrong Creature as the one who must see the effect.
  - A re-planted Pavise could lose track of its unequipped shield.
  - The Protector and Sentry panels ran off the bottom of the viewport.
  - The Shatterstorm "result" card body was empty.

