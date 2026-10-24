# AK5e Foundry VTT To-Do List

### Marksman, Anti-Air, Artilleryman and Besieger workflows (2026-10-18)

- [x] Re-audit scoped rules and existing repairs; full Chapter 3/reference read by validator.
- [x] Integrate previewed progression, source-ID choices/grants and stale-preview checks.
- [x] Read generated weapon properties; add guided roll/save/application receipts, target relay and partial-failure undo.
- [x] Repair Besieger mode lifetime, weapon-only riders and owner-operated subclass resolution descriptors.
- [ ] Finish native attack/damage integration and independent review corrections.
- [ ] Complete focused/shared/full regressions and private Foundry GM/player UI, screenshot and restart acceptance.
- [ ] Publish the coverage matrix, decisions and final evidence; keep release-pack acceptance separate.
- Checkpoint requested by user before API limits: implementation and remaining
  acceptance are recorded in [MARKSMAN_WORKFLOWS.md](ak5e/MARKSMAN_WORKFLOWS.md).
  Focused 15-file suite, whole `npm test`, file validation and generated-content
  checks pass (one existing optional skip). B-300/B-301 remain open. Full class acceptance
  remains open; do not infer completion from implemented resolution descriptors.

### Gemini bulk implementer guidance (2026-10-12)

- [x] Add [GEMINI.md](GEMINI.md) and its read pointer in `AGENTS.md`: general
  batch implementation, source-derived tests, Codex-or-Claude batch review and
  both reviewers at class/shared-engine milestones, private Foundry startup,
  real UI interaction, screenshots/inspection, persistence and reliable shutdown.
  Documentation checked locally; this addition does not run Foundry or establish
  Antigravity loading, browser execution or cross-model review acceptance.

### Marksman, Anti-Air and Artilleryman audit (2026-10-11)

- [x] Audit source/generated content, setup/progression, use/undo and test gaps;
  map all 117 selected records. See [MARKSMAN_AUDIT.md](ak5e/MARKSMAN_AUDIT.md).
  Read-only Luna mapping/progression and independent Sol review were checked by
  the Codex parent. All 155 existing assertions, source checks and file validation
  pass; defect probes expose cases absent from those tests. No gameplay fixes.
- [x] Add an unchecked **Cross-verified by Codex or Claude** checkpoint under
  each of the 8 class and 54 subclass backlog sections. It records pending
  acceptance; adding a checkpoint does not certify any class/subclass.
- [x] Repair broken control/undo interfaces, register card controls and restore
  every stateful flag on undo (B-110–112). Test actual player/GM confirm/cancel.
- [x] Repair all six Artilleryman setup identities without losing authored Items
  (B-113); make progression preserve HP and prevent repeat ASIs (B-114/116).
- [x] Complete or accurately document style/Talent/module/tool/gear and launcher
  proficiency grants (B-115); correct roll boundaries (B-119).
- [x] Correct Target Lock/retarget expiry and both initiative recovery paths
  (B-117/118), without silently choosing the 11th/12th-level source conflict.
- [x] Correct Anti-Air attack/airborne/stance state and warning/resolution gaps
  (B-120–124); scope Artilleryman typed damage and complete/manual blast and
  defensive benefit workflows (B-125–127).
- [x] Prepare receipts before Reaction side effects and test failed receipt writes
  (B-128). Prepared updates and their committed marker are atomic; undo cannot
  refund an uncommitted spend, and retry cannot overwrite a later spend.
- [ ] Verify two-client receipt/resource races in an authorized safe World.
- Repair evidence (2026-10-11): 80 focused tests pass, including the sheet
  callback/permissions, Splash cards without Attack Roll controls, version-1 ASI
  migration, recursive flag undo and injected write failures. Whole-project
  `npm test` passes (one existing optional skip).
  See [MARKSMAN_FIXES.md](ak5e/MARKSMAN_FIXES.md) for automation/manual boundaries
  and rendered acceptance; full class/subclass cross-verification stays pending.
- [x] Focused private-World rendered repairs in Foundry 13.351 + D&D5e 5.3.3:
  player confirm/cancel, warning override, Target Lock expiry/undo, munition
  deploy/detonate/undo/disarm, native source Item description and browser/server
  restart persistence. Luna viewed screenshots; final Splash-card recheck confirms
  manual save instructions with no Attack Roll control. Full class checks below
  remain pending.
- [ ] Execute the separate Foundry V13 GM/player checklist in MARKSMAN_AUDIT.md:
  actual clicks, warnings/overrides, owner dice/saves, automatic relay, full undo,
  encounter locks, screenshots, reload/restart. The old live script does not cover
  the repaired dialogs; focused rendered repair evidence is in MARKSMAN_FIXES.md.
- [ ] Resolve or explicitly offer the logged source readings; reconcile the
  historical Marksman decision block before claiming complete automation.

### Agent policy: Google Antigravity (2026-10-11)

- [x] Extend `AGENTS.md` for Gemini 3.8 Flash, native Antigravity delegation,
  shared instruction loading, role scopes, screenshot requirements and explicit
  sub-agent prompt templates; cite current Google documentation. Documentation
  checked locally; Antigravity invocation and image viewing not runtime-tested.

### Guard Base Class, Centurion, Crusher, Instructor, Artsblade, and Brawler Branches (0.6.0, 2026-10-11)

- [ ] Audit remediation (2026-10-12): B-129–B-153.

- [x] **Rules & Progression foundation:**
  - `ak5e/scripts/guard-rules.mjs`: Pure formulas, level tables (Aggression: 4/6/8, Unrelenting: 0/1/2, Instruction Dice: 4/5/6, Instruction Die: d6 -> d10 at 13th), DCs (`martialDC`, `centurionDC`), Fighting Styles map, state/profile inspectors.
  - `ak5e/scripts/guard-progression.mjs`: Choice inspector, preview, and apply for chassis saves, skills, tools, starting gear (or 1300 LMD as CP), Fighting Styles, ASIs, HP (fixed/rolled), and basic/advanced talents.
  - `ak5e/scripts/guard-setup.mjs`: Idempotent core Guard feature grants (levels 1–20).
- [x] **Base Guard features & table play (`guardUses` engine):**
  - Registered `aggression` and `unrelenting` resource pools in `resource-pools.mjs`.
  - Registered plans: Forestall (1-3 Aggression, Reaction), Smite (1-3 Aggression), Strike True (1-3 Aggression), Unrelenting (1 use, save reroll), Pursuit Unrelenting (2 uses, Action/Bonus Action), Unrelenting Aggression (2 Aggression, miss damage).
  - Roll hooks: `preRollAttack` and `preRollDamage` for Fighting Styles (Lightly Armed, Ranger, Deadly Fighter, Great Weapon Fighting, Spearwall), and Annihilation Protocol initiative hook.
- [x] **Centurion subclass:**
  - `ak5e/scripts/centurion-features.mjs`: Registered `ferociousFling`, `guillotine`, `stormOfBlood` pools.
  - Plans: Cyclone Strike (target count by level, cleave), Brutal Execution (2 Aggression, Frightened WIS save, Psychic damage), Ferocious Fling (refund on Brutal Execution), Guillotine (2×PB d6 Slashing, Bleeding, Frightened on Elite/Leader), Shredder (STR mod damage, doubled if Frightened), Storm of Blood (10d8 Slashing, Long-Arm AoO refund).
  - Roll hooks: `centurionPreRollAttack` (Fearmonger advantage vs Frightened and disadvantage on incoming attacks against Centurion).
- [x] **Crusher subclass:**
  - `ak5e/scripts/crusher-features.mjs`: Registered `foecrusher` pool (`@prof` uses, Short Rest recovery).
  - Plans: Foecrusher (Staggering, Dazing, Renewing [Hit Die + CON], Smashing), Press the Attack: Overbear (2 Aggression, +1d10, dual riders), Death's Passing (half Thunder on miss), Horde Breaker (excess damage chain), Heroic Blow (Foecrusher spend, reroll dice, Crush 2×PB + existing), Heroic Killing Blow (execute at <50 HP, ignore physical resistance).
  - Roll hooks: `crusherPreRollDamage` (Heavy Metal +1 damage die on Heavy Melee weapons), Singular Strike bonus calculations.
- [x] **Instructor subclass:**
  - `ak5e/scripts/instructor-features.mjs`: Registered `instructionDice` and `breach` pools.
  - Plans: 10 Instruction Options (Defend Yourself!, Focus!, Get out of there!, Go!, Hang in there!, Keep fighting!, Now's your chance!, Snap out of it!, Steel Yourself!, Strike!), Teach from Experience (turn start self buff, free), Press the Attack: Cooperative Combat (1 Aggression spend, Instructor also benefits), Kingmaker (free second instruction with fixed d6), Renowned Instructor (recover to half dice on initiative), Once More Unto The Breach (1/LR mass Help and Instructions).
- [x] **Artsblade subclass:**
  - `ak5e/scripts/artsblade-features.mjs`: Registered `spellswordPoints`, `cutThroughChaos`, `ultimateBladeArt` pools.
  - Plans: Blade Art (with single-save immunity tracking and 11 standard damage types), Augmented Assault (2 Aggression, 2 Blade Arts / turn, 13th Unleash normal AoE), Cast Spellsword Art (1 SP, fixed max level, Martial DC save), Cut Through Chaos (3 modes: `spellAttack`, `savingThrow` with Clear Path, `reactionArt`), Ultimate Blade Art (1/LR).
  - Roll hooks: `artsbladePreRollAttack` & `artsbladePreRollDamage` (Crude Force +1/+3 bonus, Flame +1d10 damage); Ceaseless Initiative hook (+1 SP if below max).
- [x] **Brawler subclass:**
  - `ak5e/scripts/brawler-features.mjs`: Registered `mountainbreaker` pool (1, LR).
  - Plans: 8 Basic Brawling Techniques plans (Body Check, Cross Counter, Feint, Follow Up, Footwork, Guard Up, Slip Off, Tag In); 7 Advanced Brawling Techniques plans (Chokehold, CQC, Disarm, Human Shield, Menace, Skullshaker, Weigh In); Mountainbreaker (17th, 1/LR: Flurry vs Knockout modes).
  - Always Ready turn-start hook (recovers 1 Aggression at combat turn start).
  - Roll hooks: `brawlerPreRollAttack` (Dexterous attacks) & `brawlerPreRollDamage` (+PB damage on unarmed strikes vs detrimental status conditions).
- [x] **Sheet UI & Integration:**
  - `ak5e/scripts/guard-sheet.mjs`: Sheet panel and header control on ActorSheetV2, guided dialogs for all Guard and subclass uses, message card buttons for rolls, retry, and undo.
  - `ak5e/scripts/ak5e.mjs`: Integrated `game.ak5e.guard` API (with `.artsblade` and `.brawler` namespaces) and registered all Guard, Centurion, Crusher, Instructor, Artsblade, Brawler, and sheet hooks.
- [x] **Unit Tests:**
  - 58 tests passing across `ak5e/test/guard-rules.test.mjs`, `ak5e/test/guard-features.test.mjs`, `ak5e/test/guard-progression.test.mjs`, `ak5e/test/centurion.test.mjs`, `ak5e/test/crusher.test.mjs`, `ak5e/test/instructor.test.mjs`, `ak5e/test/artsblade.test.mjs`, and `ak5e/test/brawler.test.mjs`.
- [x] **Live Foundry V13 & D&D5e Visual Verification:**
  - Automated Playwright browser verification suite executed (`ak5e/tools/test-guard-live.mjs`) on port 30175 against `standard-test` World.
  - Exercised sheet panels, Guard Controls dialog, Foecrusher rider prompt, Foecrusher chat card, manual dice roll resolution, Centurion controls, Instructor controls, Instruction issuance dialog & card, Artsblade sheet & controls, Blade Art prompt & roll, Spellsword Art casting, Brawler sheet & controls, Body Check card, Cross Counter card, and complete 2-step Undo list & review flow.
  - 23 screenshots captured in `/tmp/ak5e-guard-live/` and independently visually inspected by Foundry Validator subagent per `AGENTS.md` §6.2.
  - All 23 screenshots verified PASS with zero errors (`report.json` `errors: []`).

### Guard Subclasses Batch 1: Duellist, Liberator, and Lord (0.6.0, 2026-10-12)

- [x] **Duellist subclass:**
  - `ak5e/scripts/duellist-features.mjs`: `isDuellist(actor)`, Duelling Blades (Greatswords and Polearms gain Finesse property via `dnd5e.preRollAttack` hook), Opponent declaration and Points ledger (0–10 max) with entry conditions (+1 on declaration, +1 at turn start if damaged opponent, +1 if not damaged by opponent; upgraded to +2 at 10th level; +1 on non-heavy weapon hit), Parry (1st Forestall/round costs 0 reaction and -1 Aggression), Riposte (Reaction on melee miss -> AoO).
  - Principles of Defence (4th): Every Victory (+1 Aggression on opponent defeat/surrender), Lightning Reflexes (DEX save reaction vs seen effect), Punish Every Opening (free Riposte without reaction on successful save).
  - 9 Engagements: Analysis (0 pts), Balestra (2 pts), Derobement (1 pt), Displacement (1 pt), En Garde (1 pt), Feint (1 pt), Fleche (2 pts), Redoublement (1 pt), Score (1 pt).
  - Grand Challenge (13th): 1/LR, Corps à Corps (AoO when opponent attacks others), Displacement (damage resistance against all non-opponents), Coup de Grâce (8d8 Slashing/Piercing unreduced at 10 points).
  - Master Duellist (17th): Points retained upon opponent death/surrender; declaration requires no action.
- [x] **Liberator subclass:**
  - `ak5e/scripts/liberator-features.mjs`: `isLiberator(actor)`, Liberty resource pool (0–6 max, combat generation at turn end if no attack/cast/skill was used, or via Guide the Masses).
  - Guide the Masses: Action (Bonus Action at 7th, free Champion of the Worthy at 17th) targeting ally within 20 ft (40 ft at 10th): Advocate (healing max(2×PB, 2×Liberty)), Empower (DR max(PB, Liberty)), Uplift (bonus damage max(PB, Liberty)).
  - Righteous Outburst: Flash of Anger (expend Liberty on melee hit for +1d6/d10 damage per Liberty, no crit multiplication, 1 Liberty refund on kill; becomes Force/Arts damage at 13th with Caught in the Crossfire 10-ft splash), The Right Moment (consumes all Liberty on Operator Skill activation for bonus damage).
  - Rising Tide (4th): Operator Skills count as Automatic, Offensive, and Defensive charging.
  - Praxis (10th): Press the Attack: Face Me (2 Aggression, Bonus Action Compelled Duel with Martial DC).
  - Révolution (17th): 1/LR Action, 20-ft burst DEX save vs Martial DC for 1d12 Force per Liberty; Champion of the Worthy; Shield of Belief (THP = Guard level at turn start); Time to Act (+1 Liberty on gain/refund).
- [x] **Lord subclass:**
  - `ak5e/scripts/lord-features.mjs`: `isLord(actor)`, Authority state (`flags.ak5e.lord.hasAuthority`), Overruled (INT/WIS/CHA saves at start and end of turn), 1d8 THP at turn start while holding Authority.
  - Authority Acquisition & Loss: Gain on Elite/Leader kill damaged since last turn, 2+ kills in a turn, or 1-shot full HP kill; lose on 0 HP, end-of-turn save affliction, Prone at end of turn, or Initiative; Press the Attack: Manifest Destiny (3 Aggression to retain Authority).
  - Manifest Will: `manifestation` pool (`@prof` uses, Long Rest recovery, 1-min duration), melee weapons gain Range 30/-, STR for ranged attack/damage, +CHA mod Force damage. Will Attunement (10-minute ritual to change damage type to an Operator Skill type). Authority marks: Ranged/Melee marks, opposite attack deals +1d6 damage (splashes 10 ft at 17th).
  - King's Domain (4th): Castle Doctrine (15-ft zone, reaction move half speed and melee attack, refund reaction on non-elite hit; Authority reduces speed by half / 0 with WIS save at 17th), Pursuit of Power (hit allows full movement without AoO, 2x jump; Authority removes once/turn limit; deals passive CHA damage to adjacent foes at 17th).
  - By Lordly Decree (10th): Make It So (spend Manifestation use to add CHA mod + Proficiency, or Expertise with Authority, to any d20 roll; reroll once on failure at 17th), Press the Attack: A Leader Leads (1+ Aggression, grant Special Inspiration to allies).
  - Force of Will (13th): PB/LR uses, 1/turn across 3 element groups: 3d6 burst (DEX save), 8d6 line (DEX save), 6d6 melee hit (CON save).
  - Divine Right (17th): Opposite attack damage splash 10 ft, Castle Doctrine 0-speed WIS save, Pursuit aura CHA damage, Make It So failure reroll.
- [x] **Sheet UI & Integration:**
  - `ak5e/scripts/guard-sheet.mjs`: Summary badges (Duellist Points, Liberty, Authority, Manifestation), action groups in `openGuardControls()`, interactive prompts in `executeGuardDialog()` for Engagements, Guide the Masses, Flash of Anger, King's Domain, Make It So, Force of Will.
  - `ak5e/scripts/guard-rules.mjs` & `ak5e/scripts/ak5e.mjs`: Registered branch definitions, hooks, and APIs on `game.ak5e.guard`.
- [x] **Unit Tests:**
  - 90 tests passing across `ak5e/test/guard-rules.test.mjs`, `ak5e/test/guard-features.test.mjs`, `ak5e/test/guard-progression.test.mjs`, `ak5e/test/centurion.test.mjs`, `ak5e/test/crusher.test.mjs`, `ak5e/test/instructor.test.mjs`, `ak5e/test/artsblade.test.mjs`, `ak5e/test/brawler.test.mjs`, `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, and `ak5e/test/lord.test.mjs`.
- [x] **Live Foundry V13 & D&D5e Visual Verification:**
  - Automated Playwright browser verification suite executed (`ak5e/tools/test-guard-live.mjs`) on port 30175 against `standard-test` World.
  - 40 screenshots captured in `/tmp/ak5e-guard-live/` covering all 8 Guard subclasses including Duellist, Liberator, and Lord sheets, controls, prompts, roll cards, and undo flows; verified with zero browser errors (`report.json` `errors: []`).

### Guard Subclasses Batch 2: Musha, Reaper, and Weaponmaster (0.6.0, 2026-10-12)

- [x] **Musha subclass:**
  - `ak5e/scripts/musha-features.mjs`: `isMusha(actor)`, Tenacity (Nothing to Lose: bonus melee attacks at <=50% and <=10% HP thresholds, Soloblade: 2d6/2d8/2d10 heal on hit with manual roll button, Stand Alone: outside heal converts to THP), Enduring Resolve (Wisdom save proficiency, Not Yet: escalating DC Wisdom save on drop to 0 HP surviving with 2×PB HP, `mushaResetNotYet` DC reset on Long Rest or at max HP at 17th level).
  - Blood Price (4th Level): 2d8 unreducible self-damage supporting 4 tactical options: Center Oneself (end/suppress condition), Dig Deep (gain Skill Points equal to HP lost), Iai (straight-line Dash + strike with +half HP lost damage), Ichimonji (strike with +full HP lost damage + Off Balance condition). Greater Blood Price (13th Level) scales self-damage to 4d8.
  - Warrior Spirit (10th Level): Go Forth (Reaction move), Retaliator (Press the Attack: 2 Aggression for melee attack or Iai).
  - Found Alongside Death (13th Level): Living on the Edge (+ceil(PB/2) AC/saves at <=50% HP, +PB at <=10% HP).
  - To Laugh at Death (17th Level): Not Yet DC resets at max HP; survives outright kill.
- [x] **Reaper subclass:**
  - `ak5e/scripts/reaper-features.mjs`: `isReaper(actor)`, Reaper's Ruin pool (`reaperRuin`, 0–10 max), complete Reaper Table with inverse scaling: low Ruin gives Reap crit bonuses (+10 at Ruin 0, crit 10+) to build Ruin; high Ruin gives Curtainfall crit bonuses (+10 at Ruin 10, crit 10+) and healing penalties (up to -20) with unlocked passives.
  - Death's Design: Reap (15-ft cone or 10-ft sphere at 13th, DEX save vs Martial DC, half/full damage on fail, level 4+ crits apply Vulnerability), Curtainfall (melee hit dealing +1d6 per Ruin, expends all Ruin on hit, level 4+ crits ignore Physical Resistance).
  - Gain Ruin (+amount on kill/crit), Ruin Decay (-1 at turn end if no damage dealt), Press the Attack: Lingering Violence (1 Aggression to prevent Ruin decay).
  - Fear the Reaper (10th Level): 1/LR mark for 1 hour, 1d6 Psychic on Ruin gain, directional sensing, invisible/hidden piercing.
  - Memento Mori (17th Level): Vulnerability + ignore DR on crit, or 10-ft splash 1d6 Psychic to secondary hostiles.
- [x] **Weaponmaster subclass:**
  - `ak5e/scripts/weaponmaster-features.mjs`: `isWeaponmaster(actor)`, Martial Mastery Table covering 6 weapon categories with property resolution by baseItem and name: Can Opener (+1d6 vs Phys DR), Cornering (-5 ft speed), Drive (move 10 ft), Executioner (+2d6 vs Incapacitated/Prone), Flourish (+1d6 on miss 1/turn), Lethality (+1d6 vs no Phys DR).
  - Judgement Cut (4th Level): 1/SR mark for 2 turns accumulating weapon damage dealt; Detonate deals half accumulated damage as Slashing damage.
  - A Master's Weapon (10th Level): Designate Signature Weapon (+1 attack/damage rolls); Every Part of the Weapon (Bonus Action to swap Signature Weapon Martial Mastery property to any of the 6 table properties until end of turn).
  - Untouchable (13th Level): 2/LR reaction melee duel against attacking enemy in reach; dealing damage causes the enemy attack to automatically miss.
  - Song of Steel (17th Level): 1/LR 1-minute stance granting +1 critical range, crits ignore Physical Resistance, and Advantage with Signature Weapon.
- [x] **Sheet UI & Integration:**
  - `ak5e/scripts/guard-sheet.mjs`: Added Musha status badge (attacks/Edge/Not Yet DC), Reaper status badge (Ruin/Reap crit/Curtainfall crit), Weaponmaster status badge (Signature weapon); action groups in `openGuardControls()`; dialog prompts in `executeGuardDialog()` for Blood Price, Soloblade, Reap, Curtainfall, Fear the Reaper, Memento Mori, Judgement Cut, Every Part of the Weapon, Untouchable, Song of Steel.
  - `ak5e/scripts/guard-rules.mjs` & `ak5e/scripts/ak5e.mjs`: Registered branch identifiers (`musha`, `reaper`, `weaponmaster`), exported feature functions and namespaces on `game.ak5e.guard`, registered roll hooks (`weaponmasterPreRollAttack`, `weaponmasterPreRollDamage`).
- [x] **Unit Tests:**
  - 112 tests passing across all 12 Guard test suites (including `musha.test.mjs`, `reaper.test.mjs`, `weaponmaster.test.mjs`) with zero failures.
- [x] **Live Foundry V13 & D&D5e Visual Verification:**
  - Automated Playwright browser verification suite executed (`ak5e/tools/test-guard-live.mjs`) on port 30175 against clean `standard-test` World.
  - 56 screenshots captured in `/tmp/ak5e-guard-live/` covering all 11 Guard subclasses, including Musha, Reaper, and Weaponmaster sheets, controls dialogs, prompt modals, chat message cards with manual roll buttons, and encounter-window undo receipts.
  - Live test exited with code 0 and zero browser errors (`report.json` `errors: []`).

### Four-branch completion status (Chain, Mech-Accord §3.2, Guardian, Fortress — 0.5.6)

Claude (0.5.3–0.5.5) then Codex (0.5.6) implemented all four; Claude resumed 2026-10-11 afternoon.
Plan: `/home/patch/.claude/plans/work-on-chain-caster-moonlit-snowflake.md`. Nothing is committed (do not reset).

- [x] Code, docs (DECISIONS "Fortress branch and four-branch completion (0.5.6)", DEFENDER/CASTER_IMPLEMENTATION,
  README, CHANGELOG) and unit tests: Caster 148, Defender 132 (Fortress 17, Guardian), Guard 43, automation audit current.
- [x] Fixed two stale unit tests after Codex's dotted-path flag updates: `caster-drones.test.mjs` race test hung forever
  (its pause hook never matched `"flags.ak5e.caster.undo"`; it now pauses and proves the serialization), and
  `caster-branches.test.mjs` Sculpt Arts read the old whole-object key.
- [x] Codex's Chain live run failed only on its own assumption that the Chain Caster acts four turns later; production
  expired Sparks at the Chain Caster's Turn start (round 2 turn 4). The check now advances to the caster's actual Turn.
- [x] **Chain/Primal/Splash live run PASSED** (2026-10-11 ~15:45; Foundry 13.351, dnd5e 5.3.3, AK5e 0.5.6, private World copy
  on port 30172): `passed: true`, 0 browser errors, 43 screenshots. Report and screenshots:
  `/tmp/claude-1000/-home-patch-AK5e-Foundry/cd04258c-be3e-43f5-a56f-e34a21b397a7/scratchpad/run2/branches*`.
  Script-only fixes: cycle-safe report JSON; the Short/Long Rest checks wait for AK5e's un-awaited rest-hook recovery
  (the live actor showed the correct `sr` receipt 2→3; the old check read too early).
- [ ] **Next:** screenshot review of `run2/` by `foundry-validator` (§6.2; not done, so no images have been viewed yet).
  Then `AK5E_CASTER_MECH_ONLY=1 AK5E_PORT=30172 node ak5e/tools/test-caster-live.mjs` and
  `AK5E_DEFENDER_BRANCHES_ONLY=1 AK5E_DEFENDER_PORT=30172 node ak5e/tools/test-defender-live.mjs`, restart-persistence
  reruns (`*_RESTART_REPORT`), and a `FOUNDRY_SMOKE_TEST.md` "Four-branch completion (0.5.6)" entry.
  Restart the private server: `cd /home/patch/FoundryV13 && node main.js --dataPath=<scratchpad>/foundry-live --port=30172
  --hostname=127.0.0.1 --world=standard-test --noupnp` (stopped at wrap-up). `/tmp/ak5e-primal-splash`:30171 belonged
  to another agent; do not share it. Playwright: `AK5E_PLAYWRIGHT=/tmp/frontier-browser-check/node_modules/playwright/index.mjs`.

### Player-agency compliance audit (WORKFLOW.md §3.2, 2026-10-11, not started)

Rules and decision recorded (`ak5e/DECISIONS.md`, "Player agency over GM gating"); existing code not yet changed. **Scheduled after the Defender finish increment** as its own increment. New code must follow §3.2 from now on.

- [x] **Primal and Splash Caster branches are done** (0.5.2, Claude, 2026-10-11).
  - **Warnings and readings:** `ak5e/scripts/caster-primal-splash.mjs` covers warnings with Use anyway, per-use readings, clamping at 0, public cards, the Debilitate roll button, the GM relay through an operation-kernel instance, and undo receipts.
  - **Splash cast options:** these are warnings in `caster-casting.mjs`.
  - **Reusable for this audit:** the branch-free `ak5e/scripts/play-undo.mjs`, with `PlayWarnings`/`PlayReading`, `requireOverrides`, `resolveReading` and the `encounterEpoch` lock.
  - **Still open for the other Caster branches:** the interrupted-operation lock in `casterCommand`, the Arts cast's AP overspend clamp, `undoLastArt`, and GM-only reconcile/rulings preconditions.

- [ ] Remove or downgrade GM-only gates on player actions: `undoLastArt` (`ak5e/scripts/arts-casting.mjs`), Caster ruling/reconciliation preconditions (`caster-features.mjs`), operation-kernel `reconcile` (GM-only with reason), Artshield "Only the GM can end effects" (`artshield-features.mjs`), and any similar `game.user.isGM` checks outside world administration.
- [ ] Replace "The GM must apply … to an unowned target" refusals with an automatic active-GM relay (operation-kernel elected-GM commit or module socket) that writes an undo receipt.
- [ ] Convert `need(...)` hard blocks on confirmations, range, prerequisites, resources, timing and missing GM rulings into confirm-dialog warnings with **Use anyway**; keep hard stops only for technical impossibilities.
- [ ] Show overridden warnings and undos on the public chat card; clamp overspent resources at 0 and show the shortfall; offer per-use readings when a GM ruling is missing.
- [ ] Audit every module use path for a confirm step (no fast-forward past it; cancel changes nothing; none for ability checks or saves) and for damage, healing, attack, saving throw or feature/cost dice the module rolls itself (for example Unending's recorded d6). Saves must be a button the target's owner clicks; drop the extra confirm dialog before the Artshield Concentration Breaker save.
- [ ] Ensure every helper writes an undo receipt that the acting user/owner (not only the GM) can use for any use in the current encounter window, including relayed target changes. Replace most-recent-only undo (`undoLastArt`) and lock receipts at combat start/end.
- [ ] Update affected tests and run non-GM player-user Foundry checks per WORKFLOW.md §5.1 item 9.

### Defender finish increment (2026-10-11, in progress)

- [x] Previewed native Defender progression/setup, conservative HP/ASI ledgers, and all 42 Talent/Module choices; focused tests and native owner/observer checks pass.
- [ ] Interlocking Shields, Power Plant, Refreshment, Sword and Shield, and Tactical Defence with authenticated GM-authoritative SP grants and explicit review of missing facts.
- [ ] Source-fidelity repairs: Leaping Ward/refund, per-Art Spellshield sight, damage-specific Concentration Breaker, Advance activity window, and live Crownsplitter payload.
- [ ] Focused/full/automation tests and fresh private Foundry V13/D&D5e 5.3.3 rendered/reload/restart evidence.
- Coordination (updated 2026-10-11): the project owner confirmed Codex has finished its Defender work; Defender modules may be edited (Claude added Guardian/Fortress on `play-uses.mjs`).

### Focused bug repairs (0.5.1, verified development increment)

- [x] B-080: no-op operation saves with regressions for unchanged/initial/changed/rejected/token writes and actual Foundry no-op behavior.
- [x] B-001/B-002/B-003/B-087: repeatable isolated Standard Bearer fixtures, canvas readiness, deterministic queue teardown, browser cleanup and portable test configuration.
- [x] B-010/B-081/B-062: wrapping panel buttons, strict Defender error checks, reconciled bug records and current documentation.
- [x] Luna: 122 focused tests, full repository suite (one optional native fixture skipped), mutation check, two consecutive live runs, 18 Defender checks, and reload/server-restart persistence. Main reviewed representative GM/player/dialog/retry and Defender screenshots; see `ak5e/FOUNDRY_SMOKE_TEST.md`.

This checklist covers the work remaining to turn the current development-world
importers into a tested, distributable Foundry VTT 13 module. The generated
Chapter 1–6 content and installer APIs already exist; do not redo them unless a
source or verification issue requires a change.

## 1. Confirm distribution requirements

### Defender, Dreadnought and Artshield implementation (0.5.0, in progress)

- [x] Read Ch.3 L896-1292 and L1324-1361 plus Ch.1 Martial DC / activation categories; ledger in `ak5e/DEFENDER_IMPLEMENTATION.md`; defaults in `ak5e/DECISIONS.md`.
- [x] Stage 0 API spike (dnd5e 5.3.3): hook payloads, no ternary formulas, no ability-score clamp.
- [x] Stage 1 Defender chassis: setup preview/apply, Resilience, Shelter, Reactive, Leaping Defence, Stand Behind Me, Indestructible, Adamantine notice, sheet panel. Node tests only.
- [x] Stage 2 Dreadnought: Advance, GM-observed SP awards (`grantOperatorSP`), Crownsplitter, Wrecking Wall, Sword of Damocles, Legendary Might. Node tests only.
- [x] Stage 3 Artshield: Arts Resistance, Spellshield, Absorption/Expel, Empowered Strikes, Reactive Defence, Concentration Breaker, Stormchaser, Leaping Ward, Eye of the Storm. Node tests only.
- [x] **Rendered Foundry verification** (2026-10-10, private disposable `standard-test` copy on port 30147, Foundry 13.351 / dnd5e 5.3.3, ak5e 0.5.0): 18/18 live checks passed (Legendary Might clamp, `config.event` origin lookup for Arts Resistance and Spellshield, Shelter Disadvantage, Advance AE and SP, Crownsplitter, Expel gating, Wrecking Wall card, Eye of the Storm template, GM/owner/observer views, browser reload) and the server-restart persistence check passed. Evidence and limits: `ak5e/FOUNDRY_SMOKE_TEST.md` ("Defender, Dreadnought and Artshield live run"). The 0.5.1 increment also passed 18/18 checks; B-080/B-081/B-087 were repaired and B-082 through B-085 reconciled with existing fixes. B-086 remains open in `bugs/pending/`.
- [x] Defender Talent/Module selection and the five Shelter/SP workflows implemented in the finish increment above; fresh live acceptance is tracked there. Other 37 Talent effects remain manual.
- [x] Guardian Branch (0.5.5). Fortress: see its section below.
- [x] Juggernaut, Protector and Sentry Branches (2026-10-11): unit-tested (18 Branch tests + Sentry progression); rendered acceptance tracked in their sections below.
- [x] The previously reported `test:caster` free-cast Residual Energy regression now passes in the final saved suite log; see Caster verification below.

### Caster, Core, Mystic and Mech-Accord implementation (development verified)

- [x] Read the full Chapter 3 and referenced rules; record explicit/native/helper/manual mappings in `ak5e/CASTER_IMPLEMENTATION.md`.
- [x] Implement previewed Caster setup/progression, reviewed Art mapping workflow, AP costs and committed events; unresolved named Arts require GM-approved UUID mappings and remain blocked until mapped.
- [x] Implement Core controls, resources, scoped damage benefits and Signature Art workflow; selection and native application boundaries remain manual where listed in `ak5e/CASTER_IMPLEMENTATION.md`.
- [x] Implement Mystic Charge, ritual/burst, Potent Cantrip and cast/initiative triggers with reviewed helper boundaries.
- [x] Implement player-owned Mech-Accord drone creation/commands, repairs and alternate-origin casts with GM-created World Actors/tokens.
- [x] Caster behavioral tests (79), full `npm test` (one optional native fixture skipped), `test:automation`, final rendered live checks and server-restart persistence passed; see `ak5e/FOUNDRY_SMOKE_TEST.md`.
- [x] Record source mappings and known manual boundaries for development version 0.5.0; keep release packaging separate.
- [x] Complete final rendered live and server-restart acceptance; reconcile Core inventory as 84 setup Items plus three learned Operator Skills and the preserved expired Rabbit Art, with unchanged IDs.

### Gameplay automation audit and Standard Bearer (0.3.7, in progress)

- [x] Build a reproducible source-backed inventory of generated records and
  source clauses, with stable IDs, line references, planned pack destinations,
  implementation evidence, and installed/repository version comparison in
  `ak5e/AUTOMATION_AUDIT.md`. This is a static candidate audit: axis keywords
  and source-clause extraction are not complete semantic adjudication of every
  individual mechanic or proof that descriptions enforce effects.
- [x] Implement a Standard Bearer helper batch with previewable setup/update,
  the noncombat flag prop, mapped aura previews, confirmed GM-authoritative
  requests, and persistent operation receipts. Focused unit tests and selected
  rendered workflows pass; full branch acceptance remains pending.
- [x] Record source ambiguities, manual boundaries, recovery procedures, and
  current helper usage in `ak5e/DECISIONS.md` and `ak5e/README.md`.
- [ ] Finish source-fidelity and regression validation for cancellation,
  permissions, cooldowns, recovery, interruption, geometry, and failures.
- [x] Inspect selected Foundry V13/D&D5e 5.3.3 workflows and GM/player screenshots
  in a private disposable World copy; verify reload and server-restart persistence.
  The 0.5.1 smoke-test record states the checked interactions and remaining limits.
- [ ] Complete the remaining Standard Bearer rule branches and clean release-pack
  checks before calling the branch or release verified.
- [ ] Reconcile the audit's source heading/CONTENT_MAP count difference and
  exact source-retention exceptions; then keep the audit generator check green.

### Ordered gameplay automation backlog

1. **Basic class and NPC usability:** map source-defined weapon attacks, saves,
   checks, reactions, action economy, damage, recharge, and simple effects to
   native activities or explicit usable manual procedures. Start with the 801
   retained NPC feature clauses and class/branch features whose native action
   mapping is unambiguous.
2. **Reusable roll, effect, target, and resource workflows:** connect selected
   targets to confirmed saves/attacks and source effects; add scoped status and
   duration handling, class resources/costs, cooldowns, rest recovery, and
   additive versus replacement temporary HP. Keep ambiguous relationships and
   eligibility explicit.
3. **Complex conditional mechanics:** implement and validate cross-turn
   triggers, stacking/DR interactions, auras, summons, movement paths, linked
   effects, and class-specific exceptions. Preserve manual GM procedures where
   the source or Foundry behavior does not support faithful automation.
   See §1A for the per-class and per-branch breakdown of items 1–3.
4. **Arts, Origins, and equipment:** complete per-entry action/target/save/effect
   review, choice handling, and item-specific charges/properties after the
   shared workflow foundation is tested.
5. **Release and live verification:** inspect representative content and
   Standard Bearer in a clean World; verify permissions, screens, interactions,
   reload/restart persistence, declared release packs, distribution rights, and
   installation artifact before updating verification status. Production
   deployment remains separate.

- [ ] Confirm that the AK5e rules text, data, and any future artwork may be
  redistributed in a public Foundry module.
- [ ] Add the required license, credits, attribution, and third-party notices to
  the module and release archive.
- [ ] Decide which non-rules front-matter content belongs in the release.
- [ ] Record any uncertain rules-to-Foundry mappings in `ak5e/DECISIONS.md`.

## 1A. Class and branch implementation backlog (Standard Bearer benchmark)

Added 2026-10-10 from a full read of `03_chapter_3_character_classes.txt` (8,856
lines) against the repository. **Sizing reference: Vanguard › Standard Bearer**
(`ak5e/scripts/standard-bearer*.mjs`, 31 focused tests, `tools/test-standard-bearer-live.mjs`,
DECISIONS.md "Standard Bearer helpers", README "Standard Bearer helpers").

**Current state (verified).** All 232 class-feature and 483 branch-feature Items
are text only: `systemData` is `{}` (classes carry only `hd`/`identifier`/`levels`;
branches only `identifier`/`classIdentifier`; no advancement, uses, activities or
Active Effects). The only code-backed class mechanics are (a) the Operator Skill /
SP engine (320 skill feats with `activities`, level 2/7/14 chooser) and (b) Standard
Bearer. Generic manual tools exist but hold no class content: feature counters
(`feature-trackers.mjs:250`), Custom tags (`feature-tags.mjs`), the Arts adapter
(needs GM-set AP; class AP/pool grants absent, `README.md:1050`), World rules (DR
preview, Mettle/Dying, Construct heal guard). Talents (289 rows), Techniques,
Engagements and Instructions were initially aggregate references. P0 now adds
350 individual options: 289 Talents, 15 Techniques, 9 Engagements, 10 Instructions
and 27 Rituals; it enriches the existing 9 Therapies, 10 Tactics, 28 Inventor
modifications and 21 Heavy Duty upgrades without duplication. These remain
descriptive feats. Source issues are logged in DECISIONS.md; class gameplay
automation acceptance remains separate from P0 content inspection.

**Rating key.** S = description + trackers suffice. M = several native
activities/effects. L = bespoke helper module like Standard Bearer. Class-level
rating covers the class's own features, not its branches.

**"Standard-Bearer-grade" checklist (apply per class and per branch).**
- [x] L0 P0 source text corrected, split and traceable (see SI-0 and the
  0.3.8 evidence in `ak5e/FOUNDRY_SMOKE_TEST.md`). Gameplay rulings remain open.
- [ ] L1 Native class/branch data and a **previewed, idempotent** setup that adds
  missing items/activities and never overwrites authored data.
- [ ] L2 Resources with level-derived maxima and recovery.
- [ ] L3 Native activities for attacks, saves, damage and healing where faithful.
- [ ] L4 Targeting / aura / eligibility with explicit GM confirmation (geometry
  never infers allegiance, willingness, visibility or hearing).
- [ ] L5 Effects, tags, durations and expiry.
- [ ] L6 SP / AP / Mettle / DR / Temp HP interactions with source-faithful order.
- [ ] L7 Sheet UI; player-request → elected-GM commit with operation receipts and recovery.
- [ ] L8 Node unit tests, a live Playwright script (via `launchTestBrowser()`),
  rendered inspection and reload/restart persistence.
- [ ] L9 Source ambiguities logged in `ak5e/DECISIONS.md`; manual boundary documented in `ak5e/README.md`.

### Cross-cutting prerequisites (build these first; branches below cite them)

- [x] **SI-0 Content fixes (0.3.8).** Split the level-20 class-feature Items that embed all
  following skill/talent tables (39–60k characters each: Doublecast, Adamantine
  Defence, Annihilation Protocol, Steel Rain, Chosen of Asclepius, Will Into Being,
  Approaching Storm; Liberator Révolution 12k), plus Specialist level-18 Weapon
  Mastery. Add 350 missing talent / technique / engagement / instruction / ritual
  Items and enrich 68 existing therapy / tactic / modification / upgrade Items
  without duplicates. Preserve all 1,106 existing source IDs; install four
  development-World RollTables. Content map, source audits, regressions, rendered
  inspection, GM/player checks and reload/server-restart persistence pass; see
  `ak5e/FOUNDRY_SMOKE_TEST.md`. Customized descriptions and Actor copies survive.
- [x] **SI-1 Operation kernel.** Standard Bearer's request / GM-commit / receipt /
  serial-queue / reconcile machinery is `ak5e/scripts/operation-kernel.mjs`
  (`createOperationKernel`, `keyedSerial`); branch-free sheet helpers are in
  `operation-panel.mjs`. Standard Bearer is rebuilt on it with unchanged flags and
  behaviour; Operator Skills shares the queue only (see `DECISIONS.md`). Tests: 13
  kernel tests with a non-Standard-Bearer branch (mutation-checked), 31 Standard
  Bearer, full suite 210/209 pass (one optional skip). Live disposable-World check
  of GM, player-request, observer rejection, reconcile, reload: see
  `FOUNDRY_SMOKE_TEST.md`. Full Operator migration deferred.
- [x] **SI-2 Resource-pool kernel (core).** `ak5e/scripts/resource-pools.mjs`: safe formula /
  level-table maxima, over-maximum, recovery on SR / LR / initiative / turn start / end /
  combat end, spend / refund / set API, once-per-Turn / Round / creature limiter, one
  registered handler per combat/rest hook. Open: migrate `feature-trackers.mjs` consumers
  onto pools (deliberately not done: flags, native `system.uses`), per-feature pool
  definitions in the class sections, no-combat limiter ruling (see `DECISIONS.md`).
- [x] **SI-3 Trigger / rider / reaction hooks (core).** `ak5e/scripts/trigger-events.mjs`:
  normalised events, one-shot riders, Reaction budget with extra / restricted Reactions.
  Open: ruling on "one Reaction per trigger" scope (TODO L280), Well-Drilled extra
  Reaction lifetime, combat-end Reaction reset, rider expiry on time / rest /
  concentration, kill detection for direct HP edits, back the Reaction budget with an
  SI-2 pool, per-class consumers.
- [x] **SI-4 Damage and healing pipeline (core).** `ak5e/scripts/damage-pipeline.mjs`:
  DR-before-Resistance with minimum rules, Temp HP absorption, additive vs replacing Temp
  HP, healing with Construct exception, explicit-policy HP loss, dice-rule helpers.
  Standard Bearer uses it for Temp HP, the post-calculation HP step and the DR preview.
  Open rulings (`DECISIONS.md`): HP-loss policy for Debilitate / Godpiercer / Mortal Blow
  / Nervous Impairment, DR stacking, Maximum Burst rounding, Weapon Tuning explosions.
  Not implemented: crit-range helper (beyond Tip), damage-type override, reconciling
  `ak5e.mjs` `damageAfterReduction` with the pipeline, wiring `world-rules.mjs`.
- [ ] **SI-5 Arts class setup and AP-cost pipeline.** Caster/Core setup, reviewed mapping flow,
  AP quotes/events, Mystic Feedback Loop and Mech-Accord alternate-origin hooks are implemented
  and covered by focused tests. Remaining: extend class AP / max Art level / pool grants to
  Guardian, Flinger, Medic, Hexer, Ritualist, Summoner and Artsblade;
  one documented cost-modifier order across classes (Growing Power, Unending, Doublecast,
  Splash, Flinger, Guardian, Core Savant, Not Today; Splash Economics of Violence is implemented
  after Growing Power, but the cross-class order is still open); remaining post-cast/free-cast grants
  for other classes. Mech-Accord alternate cast origin is implemented.
- [ ] **SI-6 Aura / zone / prop / placed-object engine.** Reuse
  `operator-geometry.mjs` and `syncStandardMap`; follow-the-owner auras; persistent
  zones; GM-hidden state (traps, buried munitions).
- [ ] **SI-7 Target registry.** Target Lock, marks (Opponent, Deathmark, Reaper's
  Mark, Charger Mark, Hexes), Elite/Leader tier lookup (source categories exist;
  custom-creature eligibility remains manual).
- [ ] **SI-8 Companion / summon controller.** Mech-Accord drone creation/linking, owner-derived stats,
  cap, command range, repair/rebuild and alternate-origin support are implemented and passed final
  live/restart checks. Remaining:
  generalize spawn, lifespans, rest sync, initiative placement and Construct healing for Doll,
  Automatons, Summons, Bound Weapons, Mobile Camera and other class consumers.
- [ ] **SI-9 Weapon-property engine.** Brace, Crush(X), Deadly, Spread, Splash(X),
  Rapid Fire, Loading, Bound, Couch, Reach/Finesse grants, unarmed profile. Open at
  `README.md:865`.
- [ ] **SI-10 Conditions.** Add Taunted, Off Balance and Berserk; define "Status
  Condition"; Enduring-Affliction overlays; speed-reduction immunity; Frightened,
  Bleeding, Burning, Dazed, Corroded, Necrotised mechanics.
- [ ] **SI-11 Choice systems and native class data.** Talent chooser with Module
  upgrades (levels 3/8/9/13), Fighting Styles, branch option lists, Hunter(X)-type
  parameters, HP / proficiency / save / skill / equipment choices, ASI. Reuse the
  `operator-progression.mjs` chooser pattern.
- [x] **SI-12 Tip of the Spear extraction (core).** `ak5e/scripts/tip-of-the-spear.mjs`;
  Standard Bearer delegates with byte-compatible effects. Variant entries exist for
  Agent, Charger, Pioneer, Tactician, Leading Lance and Devastating Blow but none is
  wired to its branch (P3). Open: Tactician "from 4th Level" gate, self-targeting
  ruling, Pioneer SP accounting, Directed Engagement for non-Vanguard callers.
- [ ] **SI-13 SP bridge.** Public provenance grant API (Dig Deep, Rising Tide,
  Responsive Healing, The Right Moment); Start SP modifiers (Jumpstart); charging
  method overrides (Dreadnought, Liberator).
- [ ] **SI-14 Combat lifecycle.** Round-1 and initiative hooks, second turn
  (Lightspeed), extra turns, combat-end resets.
- [ ] **SI-15 Class-wide Active Effects** for pure stat features (Landstrider, Quick
  off the Mark, Heavy Duty, Maximum Bulk, Legendary Might, Tough, Alert).
- [ ] **SI-16 Shared talent library.** 289 rows with heavy cross-class overlap
  (Alacrity, Alert, Hunter(X), Lucky, Tough, Jumpstart, Kingslayer, Lieutenant,
  Reliable Talent, Dig In, Part-Time Inventor, Tactical Mind, Martial Acumen …).
  Cross-class dependencies: Hidden Technique → Brawler Techniques + undefined Grit;
  Lieutenant → Instructor; Part-Time Inventor → Equipment Modification.

### Suggested phasing

- **P0** SI-0 plus the rulings list at the end of this section.
- **P0 complete (0.3.8, 2026-10-10):** content fixes, individual options, explicit
  GM RollTables and source-issue logging pass content and rendered acceptance.
  Source rulings remain unresolved; descriptive effects and costs are manual.
  Hardware acceleration is unverified (actual renderer: llvmpipe); the existing
  D&D5e ActiveEffect-pack warning is recorded in the smoke-test evidence.
- **P1** SI-1 → SI-4 kernels, then SI-12.
- **P2** Class-level modules: Defender Resilience + Shelter; Guard Aggression / Press
  the Attack; Medic Life Support; Specialist Prowess; Supporter Aid Die; Marksman
  Target Lock; Caster / Guardian / Flinger AP setup; Vanguard class features.
- **P3** Branches, S → M → L within each class, one branch per increment with its own
  tests, live script and DECISIONS entry.
- **P4** Per-branch rendered inspection, clean-World import, locked-pack checks.

### Caster — class level (M)

- [ ] Cross-verified by Codex or Claude.

Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`.
- [x] Native chassis/setup, reviewed equipment and proficiency choices, exact AP/max-Art-level
  progression, Arts Casting setup/grants and level-gated distinct pool; AP state feeds the Arts adapter.
- [x] Growing Power quotes, Unending spend/refund receipt and guided Doublecast workflow.
- [x] Caster behavioral suite passed (79 tests). Final rendered setup, owner/observer controls,
  casting and restart checks passed; see the smoke-test evidence. Core inventory matches setup,
  three subsequently learned Skills and the preserved expired borrowed Art.
- [ ] Individual Caster talent automation remains deferred until each talent has a source-backed
  helper and acceptance test; other talent effects retain their documented manual boundaries.
- Open decisions/manual boundaries: GM-approved UUIDs for absent named Arts; cost-order and
  Doublecast repeat-cost confirmation; level 17 "9th Level Arts" has no source text. See the
  implementation map and `DECISIONS.md` for logged source mappings and unresolved rulings.

#### Core — M

- [ ] Cross-verified by Codex or Claude.

Source L390–450. Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`.
- [x] Second pool setup, Rabbit from the Hat grant/use lifecycle, Power from Within completion,
  Empowered Arts, Master of the Elements, Maverick and Savant state/quote/damage helper support.
- [x] Focused unit coverage and final live Core cast/resource checks passed; restart preserved AP,
  pool IDs and every Item ID, and the setup preview created no new Items.
- Open ruling/manual boundary: Signature Art cantrip eligibility and the selection ritual.

#### Chain — L

- [ ] Cross-verified by Codex or Claude.

Source L456–549. Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`; rulings: `DECISIONS.md` "Chain branch (0.5.3)".
- [x] Chain Art uses (PB / LR, +1 on SR at 15) as a cast option with a 15-ft reach warning, player-confirmed
  single-Creature eligibility (note at L465), an undoable use receipt and chained targets on the Art's card.
- [x] Sparks pool 6/8/10/12 (LR) and the six Spark effects with upgrades as expiring native effects; Con save
  buttons at Spell Save DC with failed-save application; GM relay and undo.
- [x] Ouroboros cast option (Disadvantage from that cast's card this Turn); three-target chain at 15.
- [x] 15 focused unit tests (`ak5e/test/caster-chain.test.mjs`, two mutation-checked); full `npm test` passes.
- [ ] Live Chain checks in `tools/test-caster-branches-live.mjs` and rendered GM/player/observer inspection.
- Logged: one Chain Art use per cast (P); Spark cost and upgraded Accelerate/Decelerate as per-use readings;
  Bolster/Shred as a signed DR adjustment (P).

#### Mech-Accord — L

- [ ] Cross-verified by Codex or Claude.

Source L554–668 (Arts Master Drone stat block L579–606; this belongs to Mech-Accord, not Fortress).
Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`.
- [x] Drone create/link/sync workflow, printed stats, cap, owner permissions, Bonus Action command
  range, Spark guidance/reaction budget, Jury Rigging receipts, rebuild/payment, Engineering Kit
  choices, proficiency grants, Translocation, Duplication, Army of One and Death from Above guidance.
- [x] Final live checks confirmed two owned drones, commands, independent Reaction use, drone-space
  origin surcharge, printed passive Perception, Duplication attack lock, Jury Rigging and
  rebuild/payment. Restart preserved drone UUIDs and AP; see the smoke-test report.
- [x] WORKFLOW.md §3.2 compliance (0.5.4): readings instead of required rulings, warnings instead of blocks,
  AP/LMD clamp, Jury Rigging roll button, undo receipts, GM relay for drone writes and owner-requested drone
  creation. 8 new tests in `ak5e/test/caster-mech.test.mjs`; existing Mech tests updated to the new contract.
- [x] Independent review (critical-reviewer, 2026-10-11): H1 drone cap override, M1 relay validation (also for the
  Defender engine), M2 public drone card, M3 Army of One ruling/notice, M4 Spark upgrade reading, L1/L2/L3/L5/L9/L10 fixed
  with regression tests.
- [ ] Review follow-ups (low): Unending refund on a Jury Rigging spend can be restored twice by a later undo; "Use
  anyway" on a held Originium Spark attack roll starts a new use; pre-0.5.4 prepared Mech operations need GM reconcile;
  drone creation/linking has no undo receipt.
- [ ] Live Mech checks in `tools/test-caster-live.mjs` updated for the roll button, readings and requests; rendered check.
- [ ] Individual Mech talent automation remains deferred; use source-specific tests before adding it.

#### Mystic — M

- [ ] Cross-verified by Codex or Claude.

Source L672–720. Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`.
- [x] Mystic Charge pool, turn/ritual/initiative gains, Long Rest clearing, N+1 separate burst casts
  with critical suppression, Potent Cantrip helper, Power Surge and Feedback Loop actual-spend event.
- [x] Focused tests and final live ritual, three-cast burst, critical suppression, Feedback Loop,
  initiative reroll and Long Rest reset checks passed; restart preserved the Charge reset state.
- Open manual boundaries include ritual timing/completion confirmation, multi-attack cantrip
  outcomes and charge-spend targeting; see the implementation map and decision log.

#### Primal — M-L

- [ ] Cross-verified by Codex or Claude.

Source L725–812. Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`; rulings: `DECISIONS.md` "Primal and Splash branches (0.5.2)".
- [x] Residual Suffering: 2×PB uses that recover on a Long Rest, the damage-type → condition table and `nextTurnEnd` expiry. One use per Creature per cast; GM-gated for unowned targets.
- [x] Debilitate and Destroy: 1d8/2d8/3d8 HP loss, once per Creature per Turn, behind the `debilitateLoss` GM ruling (SI-4 HP-loss policy).
- [x] Elemental Burst: once per Short Rest, chat card with a native save link, Condition applied to Creatures confirmed as failing. Cardinal Punishment: +5 DC, and Suffering Unmatched after a successful save.
- [x] Focused tests (21 branch tests) and a rendered live run with a server restart (see `FOUNDRY_SMOKE_TEST.md`).
- [ ] Enduring Affliction overlays other than Charmed's Speed 0 remain manual instructions (SI-10: Bleeding die and 2d8 on removal, Burning, Corroded DR 0, Frightened, Frozen, Necrotised, Nervous Impairment, Blinded light).
- Open rulings (logged, unresolved): Poison has no row; the GM classifies "negative Status Condition"; Nervous Impairment trigger frequency.

#### Splash — M-L

- [ ] Cross-verified by Codex or Claude.

Source L818–873. Implementation map: `ak5e/CASTER_IMPLEMENTATION.md`; rulings: `DECISIONS.md` "Primal and Splash branches (0.5.2)".
- [x] Controlled Detonation +2 DC on the cast activity and card. Splashing Cantrips: halved Damage, DC +2, one result per Creature. Safe Zone (1 + cast level). Overwhelming Detonation growth of the placed template, with its AP surcharge.
- [x] Implements of Destruction setup with a GM area review. Economics of Violence after Growing Power, minimum 1. All-Consuming Disadvantage, once per Short Rest. Maximum Burst floor in the reviewed damage helper.
- [x] Focused tests and a rendered live run with a server restart (see `FOUNDRY_SMOKE_TEST.md`). The live run exposed the D&D5e working-clone preparation bug, now fixed for all Caster casts.
- Open rulings (logged): Safe Zone vs Maximum Burst stays GM-ruled per Caster. Native Apply Damage, and saves rolled away from the cast's card, do not enforce Splash rules.
- [ ] Follow-ups from review (low): Debilitate's Turn mark survives an abandoned receipt; retry HP writes are absolute; per-target `casterReceipts` maps are unbounded; the setup review stamp accepts a client-supplied GM ID; the sheet quote over-applies Economics for a non-area activity. Pre-existing Mystic: a chat-card save on a later Turn uses the current Power Surge, not the one recorded at cast time.

### Defender — class level (L)

- [ ] Cross-verified by Codex or Claude.

Source L896–1223. Evidence: `ak5e/DEFENDER_IMPLEMENTATION.md`, focused tests and private Foundry runs in `ak5e/FOUNDRY_SMOKE_TEST.md`.
- [x] Native data: d12, proficiencies / equipment, ASI, with preview and conservative existing-gain defaults.
- [x] **Resilience pool** (table L943–965: 4 / 6 / 8 / 10; LR) with `spendResilience(actor, n, reason)` (SI-2).
- [x] **Shelter state** (L991): Action / Bonus Action for 1 Resilience, 5-ft radius, confirmed ally list, native Disadvantage; Interlocking Shields reads active Shelter.
- [x] Leaping Defence (L1028), Reactive (two Reactions, L1033), Stand Behind Me, Indestructible (L1042), Adamantine Defence: receipt-backed controls and guided posted-roll/DR handling.
- [x] All 21 Basic + 21 Advanced Talent choices and level-8/13 Modules/additional Talents. Five Shelter/SP workflows; other 37 effects remain manual.
- Rulings to log: Leaping Defence "hits regardless of AC" and DR/Advantage state (L1029); "one Reaction per trigger" scope (L1034); Shelter measured at declaration vs attack; Indestructible with 0 DR.

#### Artshield — L

- [ ] Cross-verified by Codex or Claude.

Source L1223–1319. Evidence: focused tests, implementation map and private Foundry checks; latest acceptance tracked above.
- [x] Against the Storm / Spellshield: native Advantage with per-Art sight and current Shelter; guided 2-Resilience no-damage procedure.
- [x] Arts Absorption charge + native Expel (3d6/6d6/9d6 Force), and switched Empowered Strikes effects.
- [x] Reactive Defence control, damage-correlated Concentration Breaker claim/roll, Stormchaser calculator, Art-specific Ward/refund, Eye barrier and guided immunity.
- [x] Rulings logged for absorption cap/persistence, square template, Unit, Art-like effects and guided immunity.

#### Dreadnought — M

- [ ] Cross-verified by Codex or Claude.

Source L1324–1380. Evidence: `DEFENDER_IMPLEMENTATION.md`, `DECISIONS.md` and native live runs.
- [x] Dreadnought's Advance state with the current activity window and SP awards only while active; it changes no Charging Methods.
- [x] Crownsplitter with native Actor target payload and guided unknown/mixed tiers; Wrecking Wall native activity with guided DR/Stunned; Sword of Damocles controls; Legendary Might AE (STR +6, max 26).
- [x] Rulings logged: missed/0-target rolls, SP per roll, ability cap, Elite/Leader definition and guided boundaries.

#### Fortress — L

- [ ] Cross-verified by Codex or Claude.

Source L1387–1490. Evidence: `ak5e/test/fortress.test.mjs` (17 tests); rulings: `DECISIONS.md` "Fortress branch and four-branch completion (0.5.6)".
- [x] Entrench managed movement effect (OVERRIDE 0 priority 50; −20 ft walk from 9th), Munitions Dice pool (5; d4/d6/d8; LR), loaded list (PB, no duplicates) lost on unequip/Incapacitated with undo.
- [x] Fire Munitions with Martial DC save links, owner-click typed DamageRolls, Danger Close picker, six Munitions' riders after confirmed failed saves; Stop their Advance (Reaction + 1 Resilience); Fortification; Creeping Barrage on initiative; all §3.2.
- Logged: dice rolled once per volley (P); `munitionWeaponDamage` reading for Splash(X)'s ability modifier; Corroded manual removal; Flare as instructions.
- [ ] Live Fortress checks (Defender live script) and rendered GM/player/observer inspection.

#### Guardian — M-L

- [ ] Cross-verified by Codex or Claude.

Source L1494–1586. Evidence: `ak5e/test/guardian.test.mjs` (10 tests); rulings: `DECISIONS.md` "Guardian branch (0.5.5)".
- [x] Guardian AP / max-level table (L1510–1531), Healing Arts pool grant (≤5th, GM mappings for 14), shield Casting Units.
- [x] Not Today (AP-quote discount), Anaesthesia, Aura of Mercy (prompt + use), The Best Medicine (1 minute, per-Melee-Attack prompt), all §3.2.
- [x] Logged: Anaesthesia Temp HP and Aura-includes-Guardian as readings; Aura excludes Temp HP; per Melee Attack (hit or miss).
- [ ] Live Guardian checks (Defender live script) and rendered GM/player/observer inspection.

#### Juggernaut — M

- [ ] Cross-verified by Codex or Claude.

Source L1591–1623. Evidence: `ak5e/test/juggernaut.test.mjs` (6 tests); rulings: `DECISIONS.md` "Juggernaut, Protector and Sentry branches".
- [x] Superheavy layers (1/2/3, Heavy Armour), native halving via `defender-damage-mods.mjs` (preview-safe), undoable shatter + Shatterstorm Roll button; Reform.
- [x] Bullrush (save link at Martial DC, 4d12 Roll button, SR / 2 Resilience restore), Overwhelming Might (Force die roll), Groundbreaker (8d12, LR).
- [x] Live checks passed (run 5, `FOUNDRY_SMOKE_TEST.md`); the remaining checks are in `VERIFY.md`.
- Manual: Rolling Boulder (panel reminder), Bullrush path/knockback, Difficult Terrain.

#### Protector — M-L

- [ ] Cross-verified by Codex or Claude.

Source L1628–1673. Evidence: `ak5e/test/protector.test.mjs` (7 tests); rulings: `DECISIONS.md` "Juggernaut, Protector and Sentry branches".
- [x] Protector DC; Centre of Attention + Taunt; Taunted / Off Balance / Punishment as relayed tracked effects with native Advantage/Disadvantage.
- [x] Anchor Point (Bulwark read as Bastion; Impenetrable with rounding reading + refund; Shelter radius 10 ft; STR/DEX save Advantage), Stone Wall prompt + uses, Unending Defence, Improved Taunt and Greater Improved Shelter Resistance.
- [x] Live checks passed (run 5, `FOUNDRY_SMOKE_TEST.md`); the remaining checks are in `VERIFY.md`.

#### Sentry — L

- [ ] Cross-verified by Codex or Claude.

Source L1679–1722. Evidence: `ak5e/test/sentry.test.mjs` (5 tests) and the Sentry progression test.
- [x] Progression: ranged proficiencies, Equipment Exchange (no Firearms), Marksman Fighting Style at 4th.
- [x] Pavise as a template marker or a linked placed token; opposite-side Disadvantage; recover/undo with shield re-equip; Advance and Fire prompt, refund, Retributor; Bar the Gates, Heads Down, Torrent of Lead.
- [x] Live checks passed (run 5, `FOUNDRY_SMOKE_TEST.md`); the remaining checks are in `VERIFY.md`.
- [ ] Follow-up (owner): optional prop-creature Actor helper for the Pavise (the token link already accepts any placed token).
- Known bugs from the review and live runs: `bugs/pending/` B-090–B-095 (B-096 in `bugs/fixed/`). Remaining rendered/player/clean-World checks: `VERIFY.md` "Juggernaut, Protector and Sentry".

### Guard — class level (L)

- [ ] Cross-verified by Codex or Claude.

Source L1740–2200. Evidence: verified in unit tests (118/118) and live browser suite (`ak5e/tools/test-guard-live.mjs`).
- [x] Native data: d10, proficiencies, save / skill choices, equipment A/B or 1300 LMD, ASI (SI-11).
- [x] **Aggression pool** 4 / 6 / 8 (SR/LR) and **Press the Attack** options Forestall, Smite, Strike True (L1874–1890) as riders (SI-2/3).
- [x] Unrelenting (L3), Upgraded (11), Unrelenting Aggression (15), Eternal Aggression (18, 1d4 Aggression refund), Annihilation Protocol (20).
- [x] 9 Fighting Styles incl. Spearwall and Brawler (L1837–1865); ~45 talents (20 Basic, 24 Advanced) incl. Grit / Hidden Technique, Lucky, Tough, Hunter(X), Overheal / Fortitude.
- [x] Tests; live script.
- Rulings logged in `ak5e/DECISIONS.md`: "Push the Advantage" (class table L1793) vs "Press the Attack" (L1874), "Push the Attack" (L3342);
  Pursuit off-turn (L1933); Spearwall die (L1862); Fighting Style "Brawler" name clash; "Grit" defined only in cross-class Hidden Technique; "roll 1 additional dice" (Fortitude).

#### Artsblade — L

- [ ] Cross-verified by Codex or Claude.

Source L2202–2417. Evidence: verified in unit tests (8/8) and live browser suite (`ak5e/tools/test-guard-live.mjs`).
- [x] Spellsword Points and max-Art-level tables; Spellsword Arts pool(s); cast-on-Melee-Attack flow with fixed casting level, once per Turn; Augmented Assault (SI-5).
- [x] Resonance table (11 damage-type effects, L2278–2290), Blade Art cantrip scaling, Casting Unit on wielded weapons (SI-9).
- [x] Cut Through Chaos, Sharpened Mind pools, High Fantasy (Clear Path, Unleash), Power Overwhelming.
- Rulings to log: Spell Save DC vs Martial DC (L2358 vs L2254); "per Round" vs "per Turn" (L2407 vs L2249); Reaction casting time (L2332).

#### Brawler — M

- [ ] Cross-verified by Codex or Claude.

Source L2423–2546. Evidence: verified in unit tests (6/6) and live browser suite (`ak5e/tools/test-guard-live.mjs`).
- [x] Guns Out base AC and Dex unarmed strikes (die d4/d6/d8) (SI-9, SI-15); Rain of Blows Crush(3) + Flurry.
- [x] Basic Techniques (8) and Advanced Techniques (7) as Press the Attack riders; Always Ready; Kick Them While They're Down; Mountainbreaker (cumulative −2 chain).
- Rulings to log: Bob and Weave "base AC" vs Light Armour; Feint defined twice (Brawler L2494, Duellist L2821).

#### Centurion — M

- [ ] Cross-verified by Codex or Claude.

Source L2549–2630. Evidence: verified in unit tests (8/8) and live browser suite (`ak5e/tools/test-guard-live.mjs`).
- [x] Centurion DC (8 + Intimidation); Cyclone Strike cleave; Brutal Execution; Fling; Fearmonger.
- [x] Guillotine, Shredder, Storm of Blood (10d8, forced Frightened movement, LR) activities.
- Rulings to log: Brutal Execution grammar (L2573); Unconscious-instead-of-death vs Dying.
- Manual-OK: Fling, Shredder.

#### Crusher — M

- [ ] Cross-verified by Codex or Claude.

Source L2633–2736. Evidence: verified in unit tests (7/7) and live browser suite (`ak5e/tools/test-guard-live.mjs`).
- [x] Extreme Fortitude (roll two Hit Dice, drop lowest), Maximum Bulk (+3 HP / level AE), Singular Strike damage rewrite (example L2650–2662), Heavy Metal.
- [x] Foecrusher options (PB / SR), Overbear, Horde Breaker, Heroic Blow Crush(2×PB), Heroic Killing Blow execution (<50 HP).
- Rulings to log: Singular Strike with Extra Attack / Bonus Action / Unrelenting attacks; Horde Breaker "excess" damage.

#### Duellist — L

- [ ] Cross-verified by Codex or Claude.

Source L2739–2843. Evidence: verified in unit tests (9/9) and live browser suite (`ak5e/tools/test-guard-live.mjs`) on port 30175 with screenshots 24–27.
- [x] Opponent + Points ledger (max 10; gain / loss / minute-without-damage timer) (SI-7); Duelling Blades.
- [x] Parry, Riposte, Lightning Reflexes reactions; Engagements (9, L2807–2827) as riders; Duellist's Advance; Grand Challenge (Corps à Corps, Displacement, Coup de Grâce 8d8 unreduced).
- Rulings to log: "Reposte" typo (L2766); "Displacement" used twice; "Once you have used this Feature" scope (L2794); who tracks the "minute without damage".

#### Instructor — M

- [ ] Cross-verified by Codex or Claude.

Source L2846–2933. Evidence: verified in unit tests (7/7) and live browser suite (`ak5e/tools/test-guard-live.mjs`).
- [x] Instruction Dice pool 4/5/6, d6 → d10, initiative top-up (SI-2); Help as Bonus Action at 30 ft.
- [x] 10 Instructions (L2898–2926) applied to an ally's Actor (SI-1 permissions); Kingmaker, Superior Instruction, Once More Unto The Breach.
- Rulings to log: Kingmaker "always d6" vs d10 (L2877/2882); natural-20 Death Save effect undefined in Ch.1 (`TODO.md` World-rule follow-up).

#### Liberator — L

- [ ] Cross-verified by Codex or Claude.

Source L2937–3106. Evidence: verified in unit tests (9/9) and live browser suite (`ak5e/tools/test-guard-live.mjs`) on port 30175 with screenshots 28–33.
- [x] Liberty pool (max 6) with end-of-turn generation conditions (combat only; no Skill / Art / Attack Roll) and spend (SI-2/13).
- [x] Guide the Masses (Advocate / Empower / Uplift), Flash of Anger, The Right Moment, Rising Tide charging, Praxis, Face Me (Compelled Duel Art not in Ch.5 Items), Smouldering Anger, Révolution burst + 10-minute state.
- Rulings to log: "Liberty consumed this Turn" (L3044); Empower / Uplift evaluation time; Time to Act vs LR gating (L3024–3026).

#### Lord — L

- [ ] Cross-verified by Codex or Claude.

Source L3109–3249. Evidence: verified in unit tests (11/11) and live browser suite (`ak5e/tools/test-guard-live.mjs`) on port 30175 with screenshots 34–39.
- [x] Authority flag with gain / loss prompts; Manifestation (1 min, PB / LR, Range(30/-), STR ranged, +CHA Force); Marks with mismatch expiry (SI-7/9).
- [x] Castle Doctrine sphere (SI-6); By Lordly Decree / Make it So; Force of Will tiers; Divine Right.
- Rulings to log: "Special Inspiration" undefined here (L3190); cost "(1+ Authority)" wording; Force vs Attunement damage type.
- Manual-OK: Make it So.

#### Musha — M

- [ ] Cross-verified by Codex or Claude.

Source L3252–3325. Evidence: verified in unit tests (10/10) and live browser suite (`ak5e/tools/test-guard-live.mjs`) on port 30175 with screenshots 41–45.
- [x] Nothing to Lose (≤50% / ≤10% HP bonus actions); Soloblade (2d6 / 2d8 / 2d10 heal on hit); Stand Alone (outside healing → Temp HP) (SI-4).
- [x] Not Yet pool (escalating Wis DC, resets on LR, survives outright kill at 17th) vs Dying; Blood Price (unreducible 2d8 HP loss) + options; Dig Deep SP; Retaliator; To Laugh at Death.
- Rulings logged in `ak5e/DECISIONS.md`: Greater Blood Price benefit (L3308); Not Yet vs Dying / outright kill (L3271, L3316); Stand Alone external heal redirection.
- Manual-OK: Center Oneself, Go Forth.

#### Reaper — L

- [ ] Cross-verified by Codex or Claude.

Source L3330–3433. Evidence: verified in unit tests (10/10) and live browser suite (`ak5e/tools/test-guard-live.mjs`) on port 30175 with screenshots 46–50.
- [x] Ruin 0–10 counter (gain on crit / kill; loss rules) and Reaper Table effects (L3350–3372); Lingering Violence.
- [x] Reap (15-ft cone, Dex save) and Curtainfall as native activities with table-driven crit range; Crescendo; Reaper's Mark; Reaper Prime; Memento Mori; Swarm thresholds; Healing penalty hook.
- Rulings logged in `ak5e/DECISIONS.md`: crit-range column semantics ("+10 Critical Range"); healing-penalty floor; "Deathmark" vs "Reaper's Mark" (L3417); Reap save + crit d20 typo (L3388/3396); Swarm kill thresholds.

#### Weaponmaster — M

- [ ] Cross-verified by Codex or Claude.

Source L3438–3510. Evidence: verified in unit tests (9/9) and live browser suite (`ak5e/tools/test-guard-live.mjs`) on port 30175 with screenshots 51–58.
- [x] Extra Fighting Style (swappable at LR), Light/Heavy Ranged proficiency, Martial Mastery by weapon (SI-9/11), Dualstrike (Fast Hands, Steelwind).
- [x] Judgement Cut accumulator (2 Turns, SR); Signature Weapon flag; Untouchable reaction duel; Song of Steel.
- Rulings logged in `ak5e/DECISIONS.md`: which effect pool "Additional Effect" switches among (L3493); Judgement Cut timing (L3487); Untouchable "automatically misses".

### Marksman — class level (L)

- [ ] Cross-verified by Codex or Claude.

Source L3521–3876. Evidence: 35 Operator Skills, `marksman-rules.mjs`, `marksman-features.mjs`, `marksman-setup.mjs`, `marksman-progression.mjs`.
- [ ] Native setup/progression acceptance: d8 data exists; tools/equipment/style/Talent grants,
  authored HP preservation and idempotent ASIs have repairs and regression tests
  (B-114–116); complete class acceptance remains pending.
- [ ] **Target Lock** acceptance: minute expiry, retarget duration, initiative
  recovery and undo repaired (B-111/117/118). Level 11 versus 12 is an explicit
  per-use reading unless a GM ruling exists; complete class acceptance pending.
- [ ] High Ground and eight Fighting Styles: four have partial hooks, four remain manual;
  selection and roll boundaries need acceptance (B-115/119). Unerring and Steel Rain
  track use costs/cards; the hit adjustment/extra Attack Action remain manual.
- [ ] Weapon-property integration acceptance (SI-9): printed properties and manual
  launcher Splash exist; typed Thunder hooks and complete manual Artilleryman
  procedures repaired (B-125–127). Complete property integration remains pending.
- [x] Generated Talent source content: 19 Basic + 23 Advanced, with exact Effect/Module
  descriptions (L3779–3865). Selection/module grants and all effects remain manual.
- Rulings to log: **branch levels — L3596 says 1/4/10/15, but the class table (L3586) and every branch have an 18th-level feature**;
  may the Target be changed (L3648; Deadeye L4123 implies yes); does Unerring count as a natural 20 (L3683); Defensive style needing a Melee Weapon or Shield (L3630).

#### Anti-Air — L

- [ ] Cross-verified by Codex or Claude.

Source L3876–3950. Evidence: `anti-air-features.mjs`, `marksman-sheet.mjs`, `anti-air.test.mjs`, `tools/test-marksman-live.mjs`.
- [ ] Weight of Fire, Air Tracking and Shifting Focus acceptance: repaired chosen-roll
  procedure, explicit airborne/last-Turn movement facts and retained retarget duration
  (B-117/120/121); complete subclass acceptance remains pending.
- [ ] Versatile Approach Options (PB / SR-LR): guided manual point/height and lingering
  procedures, owner save/damage controls and real damage-instance input/log repaired
  (B-123); complete subclass acceptance remains pending.
- [ ] Unapproachable, Always Another Option and The Last Option acceptance: trigger/target
  warnings, canonical recharge, stance expiry/Turn reset, owner attacks and undo (B-111/118/122/124).
- Rulings to log: Weight of Fire vs Extra Attack; cylinder height (L3909); "one Option per Attack" vs Last Option.

#### Artilleryman — L

- [ ] Cross-verified by Codex or Claude.

Source L3968–4035. Evidence: `artilleryman-features.mjs`.
- [ ] Source-backed setup descriptions/proficiencies and Splash(X)/Controlled Demolition
  consumers, Thunder-only Expertise/Siege damage, Secondary Detonation, Bigger Booms,
  Scatter Them and Explosive Dawn acceptance (B-113/115/125–127).
- [ ] Delayed Detonation: current helper stores a flag/point and Reaction card, not a
  buried prop or automatic movement/10-minute resolution. Complete manual workflow,
  disarm/timer controls and receipt-write recovery repaired (B-126/128); complete
  subclass acceptance remains pending.
- Rulings to log: trap DC undefined (L3976); Secondary Detonation "no damage" on success; whether Last Maniac Standing covers Delayed Detonation.
- Manual-OK: disarming a buried munition.

#### Besieger — M

- [ ] Cross-verified by Codex or Claude.

Source L4040–4100. Evidence: `besieger-features.mjs`.
- [x] Siege Mode turn-declared toggle (Speed 0, +1d8, Crush(2×PB), ignore Brace / Long Range) (SI-9); Large Target; Deliberate, Efficient.
- [x] Siege Bolt (5d8 over three Turns, ignores Piercing DR/Resistance), Goliath's Bane (Con save → Stunned), Godpiercer (8 HP loss per hit, SI-4).
- Rulings to log: Crush(X) stacking (L4048); Godpiercer vs Temp HP / DR; Siege Bolt success wording.

#### Deadeye — M

- [ ] Cross-verified by Codex or Claude.

Source L4106–4160. Evidence: `deadeye-features.mjs`, `marksman-sheet.mjs`, `deadeye.test.mjs`, `tools/test-marksman-live.mjs`.
- [x] Deadshot toggle (ends after an Attack / end of Turn; dice 1–2 → 3; double PB on attack roll); Target Shooting crit range (+1 Elite/Leader, SI-7).
- [x] Vital Strike, Anti-Sniper Training, Deathblow (HP < Marksman Level), Piercing Shots, Killchain, Nevermiss (min d20).
- Rulings to log: Deathblow before / after damage; Target of Opportunity vs one Target; Deadshot lasting to end of Turn vs Half Cover to next Turn.
- Manual-OK: cover tracking.

#### Flinger — L

- [ ] Cross-verified by Codex or Claude.

Source L4163–4295. Evidence: `flinger-features.mjs`, `marksman-sheet.mjs`, `flinger.test.mjs`, `tools/test-marksman-live.mjs`.
- [x] Flinger AP table (L4191–4214), two Caster pools ≤4th, self/Target discount; weapon-for-style exchange (SI-5).
- [x] **Bound Weapons subsystem** (SI-8): 10-minute binding, 1/2/3 weapons, 30-ft moves, Opportunity Attacks, recall at 100 ft; Aftershock, Kinetic Strike (4d8 per weapon), Pass-through Strike, Whirling Death (50-ft sphere, 3 Turns).
- Rulings to log: Bound Weapon attacks vs Extra Attack (L4251); "Arts Bludgeoning" damage (L4280); pass-through when stopping adjacent.

#### Heavyshot — M

- [x] Cross-verified by Codex or Claude.

Source L4308–4388. Evidence: `ak5e/scripts/heavyshot-features.mjs`, `ak5e/test/heavyshot.test.mjs` (57/57 unit tests passing), live playtest suite `ak5e/tools/test-marksman-live.mjs` (`/tmp/ak5e-marksman-live/report.json`), screenshots `13-heavyshot-sheet.png`, `14-heavyshot-dialog.png`, `15-heavyshot-heartseeker-card.png` (9/9 PASS visual inspection per AGENTS.md §6.2).
- [x] Weapon Tuning "Custom Job" weapon copy (exploding dice ≤PB, halved range, extra die with Loading); Devastator crit range and pass-through (SI-4).
- [x] Savage Shots (PB / LR), Improved Tuning, Lethal Weapon, Heartseeker (max dice).
- Rulings logged: Custom Job halved range (min 5 ft); Loading extra die applied to base weapon roll; Heartseeker maximizes all damage dice on hit without rolling.

#### Hunter — M-L

- [x] Cross-verified by Codex or Claude.

Source L4393–4457. Evidence: `ak5e/scripts/hunter-features.mjs`, `ak5e/test/hunter.test.mjs` (57/57 unit tests passing), live playtest suite `ak5e/tools/test-marksman-live.mjs`, screenshots `16-hunter-sheet.png`, `17-hunter-dialog.png`, `18-hunter-railgun-card.png` (9/9 PASS visual inspection).
- [x] Charges pool 2 / 4 / 6 (Action regain, SR/LR); attack-time Empowered Shot picker (Piercing, Concussive, Dazing, Fragmentation, Seeking, Double Up); free first option vs Target (SI-2/3/7).
- [x] Energy Retention speed; Railgun line (2d6 per Charge); Ultimate Empowered Shots; Let the Light In.
- Rulings logged: Spending Charge per ranged attack is optional; free first option when locked Target is attacked; Railgun line geometry (100 ft × 5 ft, DEX save); Let the Light In stance permits BA charge refill.

#### Spreadshot — L

- [x] Cross-verified by Codex or Claude.

Source L4472–4540. Evidence: `ak5e/scripts/spreadshot-features.mjs`, `ak5e/test/spreadshot.test.mjs` (57/57 unit tests passing), live playtest suite `ak5e/tools/test-marksman-live.mjs`, screenshots `19-spreadshot-sheet.png`, `20-spreadshot-dialog.png`, `21-spreadshot-both-barrels-card.png` (9/9 PASS visual inspection).
- [x] Spread engine + Point Blank detection (SI-9); Whites of Their Eyes; Break Their Lines (reaction, Gut Shot PB / SR).
- [x] Shell inventory (PB per SR, ≤10), loaded-Shell queue (up to 5), four Shell types; Breach and Clear; Both Barrels (cone or single).
- Rulings logged: Native Spread weapons deal +1 die of damage at Point Blank (<10 ft); chambered queue operates as FIFO; Both Barrels consumes the lead chambered shell and executes corresponding cone/single payload.

### Medic — class level (L)

- [ ] Cross-verified by Codex or Claude.

Source L4560–4871. Evidence: none; Healing Arts pool exists as an Art Item; Construct heal guard exists (`DECISIONS.md:397`); Witchcraft cross-class skills (`operator-progression.mjs:34`).
- [x] Native data: d6, proficiencies / saves / equipment (SI-11).
- [x] AP / max-Art-level / **Life Support** table (L4620–4644, LS 20→170) feeding the Arts adapter (SI-5).
- [x] Life Support touch heal (Action, any amount), Preserver reroll, Urgency of Treatment (10 LS → −1 AP), Self-Defence Protocol pool grant, Resuscitation (free Revivify, LR), To Rob the Ferryman, Chosen of Asclepius max-dice toggle.
- [x] Automated test suites verified: `npm run test:medic` 61/61 passing, `npm run test:base-classes` 100% passing across Vanguard, Supporter, Specialist, Medic.
- [x] Automated Playwright browser verification suite executed (`ak5e/tools/test-medic-live.mjs`) on port 30175 against clean `standard-test` World: 0 errors in `browser-report.json`, clean process exit and port release, 8 screenshots verified PASS per AGENTS.md §6.2.
- Rulings to log: **Revivify is used (L4712 / 4718) but not in Ch.5 or the generated Arts**; "Medical Skill" (L4659, skill is Medicine); Protocol: Medical references a non-existent Artificer feature (L4767); "Advanced Talent Mastery" vs "Module" (L4636).

#### Physician — M

- [ ] Cross-verified by Codex or Claude.

Source L4871–4905. Evidence: none.
- [x] Focused Treatment (+PB single-target), Intravenous Line (10 LS tuning, +1d6 / 2d6), Hypocritic Oath (heal-or-harm), Healing Reverberations, Surgeon-General (double).
- Rulings to log: Intravenous Line save wording looks inverted (L4880); does "double" include PB (L4899).

#### Therapist — L

- [ ] Cross-verified by Codex or Claude.

Source L4923–5004. Evidence: 9 Therapy Items, text only.
- [ ] Cast-dialog integration (`arts-casting.mjs` / `arts-sheet.mjs`): choose 0–2 Therapies, pay LS, apply riders (SI-5).
- [ ] The Doctor Is In, Early Onset Treatment reaction, Advanced Therapy, Concentrated Treatment; timed tags for Empowering, Recuperative, Regenerative, Resistance, Psychological.
- Rulings to log: "excluding the one chosen for The Doctor Is In" (L4949); Recuperative per damage instance; Long-Term cap.

#### Triage — M

- [ ] Cross-verified by Codex or Claude.

Source L5011–5046. Evidence: Mettle caps at 6 (`world-rules.mjs:193`); Stop the Flow extension open.
- [x] On the Scene, Urgent Care Centre, Emergency Medicine / Stop the Flow (20 LS, +6 Mettle, max 8), Touch of Life and Death, Mobile Hospital aura (30 ft, LR) (SI-4/6).
- Rulings to log: Mettle +6 vs Ch.1; Urgent Care "all other Creatures" includes hostiles; condition "paused" semantics.
- Manual-OK: pausing conditions.

#### Ward — L

- [ ] Cross-verified by Codex or Claude.

Source L5053–5089. Evidence: none.
- [ ] Source-tagged Ward Temp HP (healing → Ward, +1d8 / AP), Status Resistance, Treat the Cause (reaction, Dex save, forced miss), Warding Surge, Community Care / Ward Regeneration with cross-creature transfer (SI-3/4).
- Rulings to log: Ward vs existing Temp HP stacking; partial depletion; removing Ward from others (L5083).

#### Witchcraft — M

- [ ] Cross-verified by Codex or Claude.

Source L5096–5146. Evidence: skill access only.
- [ ] Halfway House pool and AP discount; Healing through Harm (LS gain, over-max allowed, SR); Witchdoctor range; Witchcurse; Life Support Specialist; Witch's Boon; Life through Death (SI-2/5).
- Rulings to log: "the amount rolled" with maximum damage (L5144); touch-range base for "improved" range (L5111).

### Specialist — class level (L)

- [ ] Cross-verified by Codex or Claude.

Source L5161–5493. Evidence: complete level 1–20 implementation in specialist-rules.mjs, specialist-progression.mjs, specialist-features.mjs, specialist-setup.mjs, specialist-uses.mjs, and specialist-sheet.mjs; 73 automated unit & adversarial tests in specialist-rules.test.mjs, specialist-progression.test.mjs, specialist-features.test.mjs, and specialist-adversarial.test.mjs; verified live headless Chromium browser execution in test-specialist-live.mjs (17 screenshots captured, 0 errors).
- [x] Native data: d8, proficiencies, 1300 LMD alternative (SI-11).
- [x] **Prowess pool** (max PB, +1 on SR/LR; gain events per branch; Mark of a Specialist reroll; It's All Skill) (SI-2).
- [x] Weapon Specialisation (Melee 8 / Ranged 7 styles, duplicate rejection), Weapon Adept / Expertise / Mastery, Falling Upwards.
- [x] Talents: 15 Basic + 18 Advanced incl. Hidden Technique (Brawler / Grit), Jumpstart (Start SP), Part-Time Inventor.
- Rulings to log: duplicate styles across lists / Parabellum (L5249, L5391); Spearwall die; Weapon Mastery rounding (L5354); SR Prowess +1 only. (Logged in ak5e/DECISIONS.md)

#### Executor — L

- [ ] Cross-verified by Codex or Claude.

Source L5498–5578. Evidence: Deathmark state machine, 8 table-play plans, 14 unit tests in executor.test.mjs, 11 adversarial tests in executor-adversarial.test.mjs; live browser execution verified (screenshots 05, 06, 07, 08).
- [x] Hunter / Bodyguard choice; Deathmark state (holder, transfer on attack, return triggers, 3 SP at turn start) (SI-7/13).
- [x] Sweeper, Smokescreen, Preysense / Dangersense, In for the Kill / Blade Shield, Mortal Blow / Ultimate Sword and Shield.
- Rulings to log: does a miss count for transfer (L5506/5508); multiple holders (L5532); Mortal Blow HP loss vs Temp HP / DR (L5568); "Level 7/14" class vs character level. (Logged in ak5e/DECISIONS.md)
- Manual-OK: Smokescreen, Dangersense.

#### Hookmaster — M

- [ ] Cross-verified by Codex or Claude.

Source L5585–5679. Evidence: Hooked weapon conversion & reversion, 14 table-play plans in specialist-uses.mjs, hook callbacks, sheet controls & badge, 15 unit tests in hookmaster.test.mjs, 11 adversarial tests in hookmaster-adversarial.test.mjs; live browser execution verified (screenshots 09, 10, 11, 12).
- [x] Hook conversion (first free starting weapon, 200 LMD replacement, 1 hour; Thrown 30/50, returning, Two-Handed, STR mod on ranged attacks) with previewed setup; Big Boot (10 ft push, doubled in Urban Jungle); King of the Urban Jungle (flying speed, +PB dmg); Bound in Rope (grapple, 15 ft drag, hogtie, hook lock); Wrangler (latch on > +1 size, shared space, advantage, ignore DR -5); Prowess gain triggers; Mighty Push (8d6, PB / LR, 20 ft knockback, collision damage); Spider's Essence (50 ft Hook, Spider's Thread climb speed, Swing to Safety reaction); Scorpion Sting (1/LR, Grappled/Latched auto-fail, 6 attacks at advantage + half level damage).
- Rulings to log: Hook "must not have / gains Two-Handed" (L5589 / 5594); same-space Wrangler; environmental damage source for Prowess (L5648). (Logged in ak5e/DECISIONS.md)
- Manual-OK: flying movement, same-space rules.

#### Infuser — L

- [ ] Cross-verified by Codex or Claude.

Source L5684–5840. Evidence: Alchemical Infusions pool (2*PB/LR), 8 Infusions, Leverage CON save workflow & Dazed lockout, New Concoctions, Double-Blind Trial 1d6 roll table, Stimpack, Excessive Dosing, To Defy Science invulnerability; 15 unit tests in infuser.test.mjs, 13 adversarial tests in infuser-adversarial.test.mjs; live browser execution verified (screenshots 13, 14, 15, 16, 17).
- [x] Infusion uses (2×PB / LR), 8 Infusions, Leverage (recipient Con save, Dazed lockout) via player-request flow (SI-1); extra Toxins (Neurological Inhibitor, Bungarotoxin); Double-Blind Trial 1d6 roll; Stimpack; Excessive Dosing; To Defy Science.
- Rulings to log: **Infuser DC `20 − Int − PB` (L5689) preserves subtraction by default with optional standard D&D5e DC toggle**; branch named "Infusion" in the table (L5232); "Invulnerability" prevents HP reduction via preApplyDamage hook (L5768); Toxin DC + PB via Excessive Dosing (L5761). (Logged in ak5e/DECISIONS.md)

#### Inventor — L

- [x] Cross-verified by Codex or Claude.

Source L5847–6140 (largest branch, 42 records). Evidence: complete implementation across specialist-rules.mjs, inventor-features.mjs, specialist-progression.mjs, specialist-uses.mjs, specialist-sheet.mjs; 144 unit & adversarial tests across inventor.test.mjs, inventor-adversarial.test.mjs, inventor-modifications.test.mjs, inventor-modifications-adversarial.test.mjs, inventor-contraptions.test.mjs, inventor-contraptions-adversarial.test.mjs, plus 33 table-play tests across inventor-uses.test.mjs and inventor-tableplay-adversarial.test.mjs (304/304 full specialist suite green); logged rulings in DECISIONS.md; verified live headless Chromium browser execution in test-specialist-live.mjs (/tmp/ak5e-specialist-evidence/report.json: 24 screenshots captured, 0 errors; screenshots 18–24 covering Inventor).
- [x] Equipment Modification (2×PB Inventions, 10-minute application, Instability d6 matching roll → breakdown) with per-item state (SI-8-style item record); Risk Assessment.
- [x] 28 Modifications (10 melee, 8 ranged, 10 armour) and 3 Dangerous ones; Strange Contraption (8, once per LR each) and Stranger Contraptions (8); Mobile Modding; The Big One (FLASH / SHARD / QUASAR); Mobile Camera Construct; Part-Time Inventor reuse.
- Rulings to log: Dangerous Modifications "+1 more than usual" (L5955); passive vs deliberate Instability rolls; Melee Attachment "Attack Modifier" (L6068); duplicate Collapsible Weapon.
- Manual-OK: Universal Keycard, Over-tuned Speaker, Camouflage Cloak.

#### Skyranger — M

- [ ] Cross-verified by Codex or Claude.

Source L6145–6262. Evidence: complete implementation across specialist-rules.mjs, skyranger-features.mjs, specialist-progression.mjs, specialist-uses.mjs, specialist-sheet.mjs, and ak5e.mjs; 19 unit tests in skyranger.test.mjs + 45 adversarial tests in skyranger-adversarial.test.mjs (64/64 green); live browser execution verified (screenshots 18–19); logged rulings in ak5e/DECISIONS.md.
- [x] Flight Suit item; Fuel pool from the table (L6162–6183); Take Off; Doctrine choice (Air Superiority, Bombardment, Close Air Support) with Strafe Damage; Jink; Advanced Doctrine; Afterburners; Skyscreamer (LR).
- Rulings to log: Swooping Dive range wording (L6197); Evasive Manoeuvres half-damage timing (L6202); "not touching the ground" token state. (Logged in ak5e/DECISIONS.md)
- Manual-OK: crash zone, Gas Strike terrain.

#### Dollkeeper — L

- [ ] Cross-verified by Codex or Claude.

Source L6266–6377. Evidence: complete implementation across specialist-rules.mjs, dollkeeper-features.mjs, specialist-progression.mjs, specialist-uses.mjs, specialist-sheet.mjs, and ak5e.mjs; 13 unit tests in dollkeeper.test.mjs + 21 adversarial tests in dollkeeper-adversarial.test.mjs (34/34 green); live browser execution verified (screenshots 20–21); logged rulings in ak5e/DECISIONS.md.
- [x] Doll companion (SI-8): HP / speed / size from owner, Bonus Action command at 100 ft, shared senses, heals only from the owner's Hit Dice, replacement ritual / 500 LMD.
- [x] Doll's Dance (Skill origin moves to Doll), Look in the Mirror (inherit specialisation), Marionette, Musical Chairs, Mistaken Identity, Reciprocity, Share Arts, Doll Raid.
- Rulings to log: Doll attack bonus unstated; Doll Weapon Expertise spending owner's Prowess (L6332); duplicate "Living Doll" at 15 (L6351). (Logged in ak5e/DECISIONS.md)
- Manual-OK: Talking Heads, Share Arts, Reciprocity.

#### Trapmaster — L

- [ ] Cross-verified by Codex or Claude.

Source L6382–6542. Evidence: complete implementation across specialist-rules.mjs, trapmaster-features.mjs, specialist-progression.mjs, specialist-uses.mjs, specialist-sheet.mjs, and ak5e.mjs; 27 unit tests in trapmaster.test.mjs + 37 adversarial tests in trapmaster-adversarial.test.mjs (64/64 green); live browser execution verified (screenshots 22–24); logged rulings in ak5e/DECISIONS.md.
- [x] Place Trap (2×PB / LR) with persisted, GM-hidden trap objects (SI-6); 8 trap types with level scaling; Detect / Disarm checks; Panic Inducer; Here's One I Made Earlier; Bait the Trap; Agent of Chaos DR/Resistance removal; House of Horrors.
- Rulings to log: Trap DC "Creature's Choice" (L6408); Spike Trap uses Spell Save DC (L6534); "Gas Trap" in Incendiary text (L6513); Specialist Level vs character level scaling. (Logged in ak5e/DECISIONS.md)
- Manual-OK: Devil's Own Luck adjudication, Alarm Trap timing.

### Supporter — class level (L)

- [ ] Cross-verified by Codex or Claude.

Source L6548–6692. Implemented on branch `feat/supporter-base` (2026-10-24, PRs #8–#32, adversarial pairs per unit). `npm run test:supporter`: 1019 pass, 0 fail. Live Foundry V13 checks were run per unit with launchTestBrowser(), and the screenshots were viewed by the implementing workers. Not yet merged to `main`.
- [x] Native data: d6, Light Melee (custom weaponProf), saves, skills, tools, equipment; branch features granted by level (supporter-progression.mjs, supporter-setup.mjs).
- [x] **Aid Die module.** Covers:
  - the pool = the chosen ability modifier with no floor (resource-pools now accepts a per-actor function max), d8 / d10 / d12;
  - Provide Aid, Expend, Advanced Aid riders as click-only buttons, with the crit rider applied through `dnd5e.preRollAttackV2`;
  - Lighten the Load (spends a Reaction), Ever Reliable, Self-Supportive and Will Into Being (an opt-in +PB note).

  Code: supporter-rules/features/uses.mjs.
- [x] Arts setup shared by Hexer / Ritualist / Summoner (supporter-arts.mjs, AP table keyed by branch). Only Hexer is filled in: Ritualist and Summoner tables carry extra columns, so they are not added yet.
- [x] Talents: 12 Basic + 16 Advanced (supporter-talents.mjs). 3 are Active Effects, 7 are plans with pools, and 18 are manual cards, including the R11 cross-class borrows.
- [x] Sheet panel (supporter-sheet.mjs). Owner-gated; it includes a branch slot and routes branch commands. A branch seam (supporter-branches.mjs, supporter-branch-index.mjs) is wired in ak5e.mjs.
- [x] Shared Cancel defect fixed for play-uses dialogs. Foundry resolves `callback() ?? action`, so Cancel must return false (play-uses-sheet.mjs). The same defect in other classes is tracked in bugs/pending/B-302.
- [ ] Open: Will Into Being +PB is a note, not applied to an already-made roll. The Advanced Aid Force rider posts its amount for native damage application. The Supporter "Choose Skills" (operator-progression) prompt auto-opens over the sheet at higher levels.
- [ ] Open: Ritualist and Summoner branches.
- Rulings logged: ak5e/DECISIONS.md "Supporter Class and Artificer / Bard / Hexer Branches" (R1–R11) and "Supporter branch implementation rulings".

#### Artificer — L

- [ ] Cross-verified by Codex or Claude.

Source L6859–7090. Implemented in artificer-features.mjs (U5), artificer-upgrades.mjs (U6) and artificer-branch.mjs (U9).
- [x] Automaton lifecycle:
  - build from the Ch.6 template through a GM relay;
  - HP + Technology Modifier as a reading (techTotal / intMod);
  - INT + PB to hit;
  - cap 1 → 2, which warns rather than blocks, with exemptions;
  - destroyed at 0 HP;
  - rebuild (Long Rest or 500 LMD from `currency.cp`);
  - As One, Control, Fort Builder, Concussive Maintenance, Advanced Personality Matrix, Artificer DC.
- [x] Heavy Duty Upgrades: 17 Automaton + 4 Mobile Cover, transcribed with restriction tags. Caps are 2 / 3 (Mobile Cover uses the same cap). Shared-rest recovery; save buttons use the Artificer DC with native `rollSavingThrow`; Machine Personality by choice or by a d6 button.
- [ ] Open:
  - Calculated Strikes is a flag plus a reminder (dnd5e has no global per-weapon ability override).
  - Upgrade-use recovery for Automatons the player doesn't own needs a GM relay.
  - Arts Detonator's "use at 0 HP even if expended" is noted but not enforced.
- Manual-OK: HOIST, Search and Rescue, Ultralight, Personality flavour.

#### Bard — L

- [ ] Cross-verified by Codex or Claude.

Source L7096–7211. Implemented in bard-compose.mjs (U7), bard-perform.mjs (U8) and bard-branch.mjs (U11).
- [x] Composer:
  - Muse from expended Aid Dice, rolled by button;
  - at least 3 Arts, no consecutive duplicates, at most max(1, CHA) Performances, all as warnings;
  - an unknown Art is a hard error;
  - leftover Muse becomes Temporary HP;
  - No Encore and Long Rest cleanup;
  - Soul of the Bard setup, Speak to the Soul, Emergency Improv (DC 17 check button, then compose or insert).
- [x] Runtime:
  - start and per-Art casts at 0 AP through the Arts quote registry;
  - one Art per Turn, or two with Time Signature;
  - turn-end auto-end;
  - the last Art ends the Performance, and its crescendo still applies to that cast;
  - Rising Crescendo as an Active Effect, with Fortissimo ×2;
  - Font of Inspiration die (R4) and Font Aid;
  - the Instrument acts as the Casting Unit for the duration;
  - every control confirms, and Cancel changes nothing.
- [x] Performance Arts table: 34 rows. 11 absent from Ch.5 are marked manual (Bless included); see DECISIONS.
- [ ] Open:
  - Native Concentration effects of other Arts are not ended automatically.
  - The whole-array `performances` write can race between compose and perform.
  - Shatter (5th Level) presence is unresolved.
- Manual-OK: Emergency Improv timing reminder.

#### Hexer — M

- [ ] Cross-verified by Codex or Claude.

Source L7223–7330. Implemented in hexer-arts.mjs (U3), hexer-features.mjs (U4) and hexer-branch.mjs.
- [x] Hexer AP table and pool setup (all Arts ≤5th level plus cantrips, always Prepared; a second pool at level 11; duplicate pool warns).
- [x] Hexes:
  - Potent Hex (PB / LR): Binding with 2 Aid Dice rounded to the nearest 5; Breaking; Looping; Abjuring with its die rolled at the hexed creature's damage roll (L7290).
  - The Force rider is limited per hexed creature per turn cycle and checks the source.
  - Cursemark (optional mark id, an area apply with a single confirm, Spare the Rod).
  - Empathic Pain, Voicethief (native save), Wasting.
  - Ultimate Hex with Rupturing; it includes the level-13 Hexes.
- [ ] Open:
  - Many Standard Pool members have no AK5e record and are reported as "missing", for example Light and Psychic (0 resolved).
  - No Casting Unit is set at setup, so the first cast raises FocusMissing until one is assigned.
  - Breaking has no DR key and uses a flag plus a reminder.
- Manual-OK: Cursemark canvas placement (the targeted token is the point), Rupturing burst targeting.

#### Ritualist — L

- [ ] Cross-verified by Codex or Claude.

Source L7335–7552. Evidence: none; Rituals live in two table Items.
- [ ] Ritual Arts known-Arts table (L7360–7381); Essence tracker and Ritual Criteria ledger (L7405–7414); 12 Ephemeral and 15 Permanent Rituals as Items with Active Effects where unambiguous; Ritual Tools (5; max 2 at 13); Pre-Preparation of Rites; Ritual of Ruin (100-ft radius save, LR).
- Rulings to log: Ephemeral duration "until next LR" vs Instant Ritual "1 minute"; concurrent Ephemeral cap; Essence cap; Find Familiar / Augury / Unseen Servant absent from Ch.5.
- Manual-OK: Secret-Keeper, Wise Beyond Years, many Permanent Rituals.

#### Summoner — L

- [ ] Cross-verified by Codex or Claude.

Source L7555–7900 (summon stat blocks L7629–7869). Evidence: 6 summon Actor templates, formulas unresolved (`DECISIONS.md:140`).
- [ ] Sparks of Creation (3 → 12, LR); Summon spawn from owner-derived formulas, 1-minute expiry, cap 3 → 4, initiative immediately after owner, instruction record (SI-8).
- [ ] Symbiosis (AP refund; Non-Damaging Restructuring), Arts Conduit (Relay, Group Aid), Greater Creation / merge, Refactorisation, Simultaneous Summoning; stat-block activities (Slam, Intervene, Bladed Limbs, Rain of Death recharge, Aura of Wrath, Reaper).
- Rulings to log: Greater Slayer CON 16 (+0) (L7806); Greater Protector Intervene (L7793); merge refunds Sparks / inherits HP; "Multiattack.." typos.
- Manual-OK: per-Summon AI behaviour.

### Vanguard — class level (M)

- [ ] Cross-verified by Codex or Claude.

Source L7904–8085. Evidence: skills only; Tip and DR preview exist only inside the Standard Bearer controller.
- [ ] Native data: d8, proficiencies, saves, equipment (SI-11).
- [ ] Landstrider (+10 ft; Nimble) and Quick off the Mark (initiative +PB) as AEs (SI-15).
- [ ] Standalone Tip of the Spear (SI-12), Directed Engagement, Uncanny Dodge reaction, Lightspeed second turn (SI-14), Approaching Storm round-1 hook.
- [ ] Talents: 17 Basic + 20 Advanced (L8164–8223) incl. SP-affecting rows (SI-13).
- Rulings to log: whether the Vanguard may target themself with Tip ("allied Creature you can see", L7997); Lightspeed tracker timing (L8052); Approaching Storm per roll vs per instance (L8057); Martial Acumen's Couch property vs Charger Couch action.

#### Agent — M

- [ ] Cross-verified by Codex or Claude.

Source L8239–8292. Evidence: none (Fade suggested as Custom tag).
- [ ] Quicklaunch; Shadowstrike (extra attack + free Tip while Invisible); Fade (PB / LR; ends on attack / forced save) (SI-10/12); Second Strike; Closing the Case hit counter; Smoke and Mirrors darkness sphere (SR).
- Rulings to log: "Agent Level" undefined (L8265); Smoke and Mirrors "no Action or Reaction" (L8288).
- Manual-OK: Quicklaunch, Pay it Forward.

#### Charger — M

- [ ] Cross-verified by Codex or Claude.

Source L8297–8372. Evidence: none.
- [ ] Momentum pool (max 6; initiative, 15-ft straight line, Couch; cleared at combat end) (SI-2/14); Couch Action; Momentous Strike (d6 / d8 / d10); Mark for Elimination (SI-7/12); Onto the Next; Deathblow; Renewing Momentum; Geirskögul.
- Rulings to log: Couch Action vs Couch Property; is Momentum consumed on a miss; multiple Marks.
- Manual-OK: Geirskögul movement chain.

#### Pioneer — L

- [ ] Cross-verified by Codex or Claude.

Source L8378–8484. Evidence: none.
- [ ] Heavy Duty (+2 HP / level AE); Auramancy token-following 15-ft aura (30 ft at 13), 7 + 3 aura types, LR choice, SP-bought extras with Tip (SI-6/12/13); Moment of Power; Cycle of Violence; Breakthrough Skill slot outside the three standard tiers.
- Rulings to log: Aura of Pressure "5 (1d8)" (L8460); duration of SP-bought effects (L8434); aura eligibility is never inferred from geometry.

#### Tactician — L

- [ ] Cross-verified by Codex or Claude.

Source L8650–8840. Evidence: Officer Acumen tracker only (`origin-setup.mjs`, `feature-trackers.mjs:156`); shared-pool integration open (§3).
- [ ] Plans registry (PB) and initiative-time activation; Acumen pool (2×PB, merges with Officer +3); Tactics (6 Basic + 4 Advanced) with ally-owned Reactions; Strategic Zones (15-ft cubes, PB, 1 minute) and Lynchpin (SI-6); Well-Drilled extra Reaction (SI-3); Checkmate; Tip on Reaction.
- Rulings to log: zone placement vs designation (L8716); Strategy swap re-spending the LR use (L8718); Tip gate "from 4th Level" (L8707); Officer +3 vs 2×PB.
- Manual-OK: Bring Them Down, Focus Fire, Finish Them.

#### Standard Bearer — benchmark (residual only)

- [ ] Cross-verified by Codex or Claude.

- [ ] All existing unchecked §1 items (regression coverage, rendered inspection, restart persistence).
- [ ] `FOUNDRY_SMOKE_TEST.md` has no Standard Bearer checklist although `README.md:877` points to one — write it.
- [ ] Log the Tip self-targeting ruling (L7997) in `DECISIONS.md`.
- [ ] Extract Tip and the operation kernel for reuse by the other branches (SI-1, SI-12) without behaviour change; keep the 31 tests green. The kernel half is done (SI-1); Tip extraction remains (SI-12).
- Known manual boundaries: recipient-side granted actions, Cry Havoc repeat saves / morale, Last Stand extra-turn pause procedure, SP redirection only for recorded pending grants.

### Source issues (logged for P0 in `ak5e/DECISIONS.md`; gameplay rulings unresolved)

Verified against source on 2026-10-10:
- "Bulwark Property" (L1644) is undefined; Chapter 4 defines **Bastion**.
- Infuser DC is written `20 − Int − PB` (L5689).
- Revivify is used by Medic (L4712 / 4718) but absent from Chapter 5.
- Marksman branch levels 1/4/10/15 (L3596) vs 18th-level Branch Feature (L3586).
- Residual Suffering table (L734–747) has no Poison row.
- Hidden Technique grants Grit (L1177 etc.), but Brawler Techniques spend
  Aggression; no conversion is specified. Special Inspiration has local
  procedures with different durations (L3190, L6821).
- Safe Zone (L840) vs Maximum Burst (L873); "Push the Advantage" vs "Press the Attack" (L1793 / L1874 / L3342).
- "Medical Skill" (L4659) has no Medicine alias. Technology is explicitly aliased
  to Tech in Ch.1 L173; L608/L6882 are not an undefined-skill conflict.
- "Status Condition" is not classified in Chapter 1 (used L755). Enduring
  Affliction L782 explicitly **adds** its Nervous Impairment effect (L794) to the
  base condition (Ch.1 L250); overlay trigger frequency remains unresolved.

Audit-reported, quote and confirm when the branch is implemented:
- AP-discount stacking order; Doublecast / Death from Above second-cast cost.
- Elite / Leader determination for custom creatures; Ch.6 L12–16 defines the
  categories and generated creatures retain source category metadata.
- Taunted / Off Balance have local Protector rules but no general Chapter 1
  definitions.
- Aid Die minimum when the ability modifier is ≤ 0.
- Automaton cap vs explicit Protocol exemptions; Greater Slayer CON 16 (+0)
  (L7806); ten Bard base Arts absent from Ch.5 and unresolved Shatter-5th variant.

## 2. Build and maintain the content map

- [x] Inventory source headings and table blocks in Chapters 1–6 in
  `ak5e/CONTENT_MAP.md`.
- [x] Map every current generated entry to its source chapter, Foundry document
  type, destination pack, generated name, and stable installer ID.
- [x] Compare the map with the current generated totals: 231 Chapter 2 Items,
  1,097 Chapter 3 Items, 207 Chapter 4 Items, 128 Chapter 5 Items, and 145 Chapter
  6 Actors, plus journals and summon Actors.
- [x] Identify the source tables that should be real `RollTable` documents;
  Double-Blind Trial, Machine Personality, Tip of the Spear, and Hole in the
  World are the four planned tables.
- [x] Keep class and feature Items together in `ak5e.classes` for the first
  release; revisit a split only if clean-World pack browsing proves it unusable.
- [x] Regenerate and review `ak5e/CONTENT_MAP.md` after an approved source or
  generated-content change.

## 3. Test the current vertical slice first

- [x] Link or copy `ak5e/` into a Foundry VTT 13 data directory.
- [x] Install the 0.3.0 build into
  `/home/patch/.local/share/FoundryVTT/Data/modules/ak5e` (2026-09-27).
  Back up 0.2.6 to `ak5e-code-backup-0.2.6-1s0gfjfo/ak5e` under the User Data
  root; update 28 files and verify all 48 repository files by SHA-256. The full
  Node suite passed, including all 14 origin checks against installed D&D5e
  5.3.3. Foundry V13 restarted automatically after shutdown, responds on port
  30000, and serves the 0.3.0 manifest. World documents were not changed.
- [x] Install the current 0.3.2 build for testing (2026-09-27). Stop the
  FoundryV13 PM2 service, back up nine replaced files to
  `/home/patch/.local/share/FoundryVTT/ak5e-code-backup-1Ya7Rj`, and verify all
  30 deployed files by SHA-256. The full Node suite passed, including all 51
  origin/sheet/tracker/tag checks against installed D&D5e 5.3.3 and nine
  deployment regressions. Restart Foundry 13.351 and confirm HTTP 200 and the
  served AK5e 0.3.2 manifest on port 30000. The server remains at `/auth`;
  module activation and gameplay checks require entering the test World.
- [ ] Create a clean World using D&D5e 5.3.3 with only AK5e enabled.
- [ ] Confirm that the module loads with no browser-console errors or Foundry
  compatibility warnings.
- [ ] Run all six `game.ak5e.installChapter...()` commands.
- [ ] Verify one complete vertical slice against the source: one Species, one
  Nationality or Background, one Class and Branch, several Features, one Art,
  one weapon, one armour item, one modification, one creature, and one summon.
- [ ] Check names, exact rules text, source headings, flags, images, types,
  activation costs, uses, ranges, targets, durations, damage, saves, and native
  D&D5e fields for the slice.
- [ ] Import the slice into character and NPC sheets and exercise its usable
  rolls, resources, effects, and links.
- [x] Add AK5e origin popup on owned-character drops, a sheet-header reopen
  button, choice validation, review, explicit apply, and duplicate-grant guard.
- [x] Fix v0.2.5 reopening with Foundry's ApplicationV2 header-controls hook
  plus a visible D&D5e character-header shortcut; test completed-record reopen,
  owner permissions, and duplicate-control prevention.
- [x] Fix the background Apply sheet crash by registering custom tool proficiency
  labels; add a regression using D&D5e's actual sheet preparation and resolver.
- [x] Validate 0.2.6 with the full Node suite and all 14 origin tests against the
  installed D&D5e 5.3.3 bundle; install the three changed module files with backup
  and matching hashes. Backup: `ak5e-code-backup-0.2.5-sheet-gobmfng9` under the
  Foundry User Data root. No World documents changed.
- [x] Scope origin and Arts controls to V13 ActorSheetV2/actor-sheet render
  hooks, show them only for relevant AK5e content, and clear stale Arts controls
  when that content is removed; cover these cases with Node UI regressions.
- [ ] Verify those controls in a live V13/D&D5e World on full and partial sheet
  renders, ordinary D&D5e actors, AK5e actors, and another actor document app.
- [x] Move the visible AK5e Origins button into the Details sidebar beside
  native race/background; show attached Species, Nationality and Background.
- [x] Scan all six generated chapters for resource candidates; document the
  reviewed Origin catalogue and unresolved class/equipment/NPC mappings in
  `ak5e/RESOURCE_AUDIT.md`, with a reproducible read-only inventory tool.
- [x] Add 33 reviewed Origin use-pool defaults, ten choice/list/additional-counter
  definitions, configured SP/Mettle displays, and manual native counters for
  other AK5e feats; preserve custom maxima and spent uses.
- [x] Add temporary target tags with native effects, optional feature copies,
  time/rest/turn/combat expiration and owner/GM manual removal; retain orphan
  cleanup receipts and test failures/permissions without base Actor rewrites.
- [x] Link Ægir Student/Teacher to removable proficiency/expertise effects,
  replacing the previous benefit; verify the source has no downed/death expiry.
- [x] Extend tags to Art/equipment sources and embedded weapon enchantments;
  add 53 reviewed Origin/Art/equipment profiles, concentration/OR expiry,
  current versus next-turn deadlines, scoped event confirmations, replacement
  receipts, Flock member uses, Missile Barrier motes and borrowed Treatise cards.
- [x] Provide source-guided custom tags for class/NPC and area-dependent effects,
  with manual native changes, shared replacement groups and permitted events.
- [x] Validate the expanded engine with 16 new tag regressions, full `npm test`,
  and all 51 optional installed D&D5e origin/sheet/tracker/tag checks.
- [ ] Verify native weapon enchantments, tag profile effects/counters, DialogV2
  source/profile selection, concentration deletion/disable/reload, consumed
  source survival, derived Treatise cleanup and non-stacking in a clean World.
- [x] Run full repository validation and the optional installed D&D5e 5.3.3
  regression; pass all 21 tracker/tag tests after final recovery/UI changes.
- [ ] Verify the new Origin/sidebar controls, native resource/effect preparation,
  rests, expiry, unlinked NPC tokens, manual recovery, reload persistence and
  multiple-client behavior in a clean World; see the smoke-test checklist.
- [ ] Review full Chapter 3 and referenced rules before adding source-specific
  class resource maxima, initiative gains, conversions or special rest behavior.
- [ ] Extend existing Dying helpers for Stop the Flow's temporary eight-Mettle
  exception after class-rule review; tracker controls preserve recorded excess.
- [ ] Confirm Player Character reopens after installing 0.2.6, preserving the
  Military School Graduate grants and completed setup record.
- [x] Test plans for all 33 backgrounds and 20 nationalities, including Officer
  tactics, equipment choices, preserved proficiencies, cancellation and failure.
- [x] Browser-test the actual v13 DialogV2 flow against an in-memory actor
  (choices, validation, Back, feature pages, review, Apply); validate all 53
  background/nationality plans with native D&D5e 5.3.3 data models.
- [ ] Verify popup and applied fields in live Foundry v13 / D&D5e 5.3.3, including
  a non-GM owner, rest recovery, reload persistence, and locked release packs.
- [ ] Extend species setup beyond feature-card review: ASIs, size variants,
  Ancient Versatility, Arts, and other feature-specific choices.
- [ ] Implement GM-reviewed Pathfinder conversion, proficiency replacement,
  origin respec/reversal, and Officer/Tactician shared-pool integration.
- [x] Re-check the full Node suite against the installed D&D5e 5.3.3 bundle
  (2026-09-24): all 14 origin tests passed with no skips; source, parser,
  helper, and installer checks passed.
- [x] Run all six installers twice in the in-memory Foundry harness: no
  duplicate folders or documents, no repeat updates, and non-GM calls create
  nothing. Force one Chapter 6 creature stale, refresh its managed Items, and
  confirm a user-added Item survives and the next run makes no changes.
- [ ] Re-run every installer in a live clean World and confirm that it is
  idempotent and does not duplicate folders or documents.
- [ ] Increase a content version in a test branch, migrate again in Foundry,
  and confirm managed content is refreshed while user-added Actor Items are
  preserved.
- [ ] Restart Foundry, reopen the World, and confirm documents, flags, embedded
  Items, and links persist.

As of 2026-09-27, the repository is 0.3.4; the installed module remains 0.3.2.
The installed-module checks above remain pending. Separate isolated clean-World
checks cover enhanced weapons and Operator SP; their exact scope is recorded in
ak5e/FOUNDRY_SMOKE_TEST.md. Do not treat those slices or installation verification
as full release-pack gameplay verification.

## 4. Verify all generated content

### SP audit and Operator targeting (0.3.6)

- [x] Audit all 320 source rows and record supported/manual phases in
  `ak5e/SP_SKILL_AUDIT.md`, retaining exact source values and stable IDs.
- [x] Correct damage-at-zero-HP charging, unavailable Spell Save DC and explicit
  HP prerequisites, and the related inactive-Dying damage-save guard.
- [x] Add Ctrl+T targeting, source-aware AoEs, native rolls, and reviewed deferred
  phase controls, including Grand Cross, Cluster Bombs, and Blood Boil.
- [x] Add recoverable GM receipts, original activation provenance, cross-Actor
  template isolation, and a previewable existing-Skill update.
- [x] Verify geometry, cancellation, permissions, provenance, migration,
  multi-client reload and server restart on Foundry 13.351 / D&D5e 5.3.3.
- [x] Record manual exceptions, source ambiguities, usage instructions and 0.3.6.
- [ ] Expand source-reviewed handling for linked Arts, summons, movement paths,
  conditional hit/tether outcomes, and other manual profiles. Current workflows
  retain the source and require explicit manual resolution; they are not effect
  automation. See the per-row audit before extending a profile.
- [ ] Verify elevation-dependent geometry, directional/limited/proximity wall
  interpretations and structure thickness with GM review and suitable fixtures.
- [ ] Export locked release packs and verify clean zip/manifest installation;
  isolated development-World tests do not establish release readiness.

- [x] Read Chapter 3 in full and add its 320 exact Operator Skill feats,
  retaining table references, IDs, Continued sections, and the Cluster Bombs mapping.
- [x] Implement opt-in learned-Skill SP limits, stacked charging, GM-authoritative
  owner requests, persistent deduplication, native attack/HP hooks, and provenance.
- [x] Add activation, Instant/round/Long Rest lifecycle, manual endings/extensions,
  source-backed adjustments, and read-only PC/NPC tracker/setup/confirmation controls.
- [x] Test SP rules, source rows, simultaneous operations, ownership, two GM authority,
  synthetic Actors, forward turns/rewinds, Skill origins, and tracker rendering in Node.
- [x] Complete live SP multi-client/reload checks on Foundry 13.351 / D&D5e 5.3.3,
  then validate all 320 Skill Items after the playable slice. Native attacks,
  player HP application/rests, two owners/two GMs, synthetic pool isolation,
  expiry/rewinds and reload passed without browser errors; hardware acceleration
  was unavailable. Full repository validation passed with native system models.
- [x] Add level-2/7/14 Operator Skill popups, catch-up, legal class/Branch options,
  exact previews, Choose Later and a sheet/header reopen control.
- [x] Persist choices and grant markers, protect GM-authorized player learning,
  recover interrupted grants, and preserve SP and manual-resource state.
- [x] Add progression/choice regressions for all classes, branch unlocks, fixed
  choices, failed writes, concurrency, permissions and deferred notifications.
- [x] Verify 0.3.4 choices in isolated Foundry 13.351 / D&D5e 5.3.3: all three
  tiers, catch-up, cancellation/partial renders, automatic and interactive native
  advancement, two owners/two GMs, observer restrictions and reload persistence.
  Restart retained all three choices/Items and 7 SP with integration disabled.
  All 123 repository tests passed with native system checks enabled. Chromium
  used a software renderer; see the smoke-test record for scope and limits.
- [ ] Deploy 0.3.4 and export/test locked release packs as a separate task.

- [x] Review Chapter 1 journals and helper behavior against the full Chapter 1
  source.
- [x] Review all Chapter 2 origins, features, backgrounds, guidance journals,
  and summon templates against the full Chapter 2 source.
- [x] Review all Chapter 3 classes, branches, features, options, and summons
  against the full Chapter 3 source.
- [x] Review all Chapter 4 equipment, modifications, property Items, and
  reference journals against the full Chapter 4 source.
- [x] Review all Chapter 5 Arts, Arts Pools, and reference journals against the
  full Chapter 5 source.
- [x] Review all Chapter 6 Actors, defenses, traits, embedded actions, faction
  folders, and reference journals against the full Chapter 6 source.
- [x] Pay special attention to source-defined formulas and intentionally blank
  values, including summon statistics and Pathshaper Fractal's non-numeric HP.
- [x] Fix parser or mapping errors in the relevant file under `ak5e/tools/`, then
  regenerate; do not hand-edit generated chapter content.
- [x] Audit generated description markup separately from source fidelity. The
  prior `sourceToHtml()` rendered each pipe-table line as its own `<pre>` block:
  357 records contained 5,417 such blocks across Chapters 1–6. The boundary
  and resolution are recorded in `ak5e/CONTENT_AUDIT.md`.
- [x] Render source tables as readable, accessible tables or another tested
  document presentation in `ak5e/tools/source-html.mjs`; preserve exact table
  values and source flags, regenerate, and review the affected chapters. Do not
  change generated chapter files directly. All 289 source table blocks now render
  as tables; the source-wide fixture and full Node suite pass.
- [ ] Advance the installer content version when ready to refresh existing World
  documents with the new table and paragraph markup; verify migration in a live
  test World.
- [ ] In a clean V13/D&D5e World, open representative rules journals, origin,
  class, equipment, Art, and creature documents. Check their sheets and source
  tables for legibility, scroll behavior, headings, and console errors; repeat
  after importing from locked release packs.

## 5. Add automated validation

- [x] Add `npm run install:foundry` for local V13 testing with a read-only
  preview, dependency/target checks, changed-code backups, SHA-256 verification,
  and temporary-directory deployment regressions. Preserve Worlds and packs.
- [x] Add a repeatable command that regenerates Chapters 1–6 and fails when the
  working tree changes unexpectedly.
- [x] Validate `ak5e/module.json`, `ak5e/lang/en.json`, and every `.mjs` file.
- [x] Assert expected document counts, unique slugs/IDs, supported document
  types, and required source-traceability flags.
- [x] Add fixture tests for source-section, table, HTML, and monster-statblock
  parsing.
- [x] Add unit tests for Dying/Mettle, Operator Skill Points, Arts Points,
  Oripathy, Rest Actions, Martial DC, and Damage Reduction edge cases.
- [x] Add a documented Foundry smoke-test checklist for behavior that cannot be
  tested in plain Node.js.
- [x] Add a shared full-Chromium browser-test launcher with `--enable-gpu`;
  require it for repository and temporary Playwright tests. The previous
  temporary browser scripts have been removed; Node-only tests need no GPU.
- [ ] Verify the shared browser launcher uses the physical GPU on this host,
  recording the actual renderer after GPU permissions and display/backend
  prerequisites are satisfied.

## 6. Create release compendiums

- [x] Plan the initial pack layout: rules, origins, classes, Arts, equipment,
  creatures, and tables. Do not create a separate talents pack unless
  clean-World navigation testing shows that `ak5e.classes` needs splitting.
- [ ] Create and verify the four planned `ak5e.tables` RollTables:
  Double-Blind Trial, Machine Personality, Tip of the Spear, and Hole in the
  World.
- [ ] Give documents stable IDs before creating cross-links.
- [ ] Export the verified World folders from Foundry VTT 13 using **Keep
  Document IDs** into module-owned compendium packs.
- [ ] Add every exported pack to the `packs` array in `ak5e/module.json` with the
  correct document type and system restriction.
- [ ] Replace temporary name-based references with stable compendium UUID links
  where useful.
- [ ] Test pack browsing, searching, importing, permissions, images, and UUID
  links in a second clean World.
- [ ] Decide whether the development-world installers ship in the release or
  move behind an explicitly labeled development setting.

## 7. Improve fidelity incrementally

### Arts casting replacement

- [x] Implement 0.3.1 native PC/NPC Arts UI: header AP edits, Arts summary,
  availability badges, Castable now, Casting Unit shortcuts and NPC references.
- [x] Simplify the cast dialog with grant-aware defaults, legal levels, projected
  AP and specific blockers; separate configuration saves from adoption.
- [x] Add owner-checked absolute AP editing and Arts-only rest recovery, plus
  DOM/activity regressions for permissions, partial renders and token-local state.
- [x] Complete 0.3.1 live GM/player/observer browser validation of core casting,
  settings and recovery in a clean Foundry 13.351 / D&D5e 5.3.3 World.

- [x] Add owned-Actor Arts setup, AP display and configuration without resetting spent resources.
- [x] Show Arts Points and setup directly in the Spells tab, including empty spell lists and partial sheet renders; expose configured totals to sheet observers.
- [x] Verify native PC/NPC header/tab Arts controls, AP configuration and casting in a clean World; registration remains manual.
- [x] Implement and live-test activity adapter AP validation, upcasting, consumption and rest recovery.
- [x] Add migration preview and explicit adoption of existing spell Items.
- [x] Add pure-rule and mocked activity tests for costs, grants, recovery, adoption, cancellation and failed writes.
- [x] Live-test cancellation, repeat use, ninth-level limits, player ownership and observer visibility; test failed-write cleanup with mocks.
- [ ] Live-test partially failed consumption and guarded GM undo before claiming that failure-recovery workflow verified.
- [ ] Verify a playable Arts vertical slice in Foundry v13 / D&D5e 5.3.3.
- [ ] Expand casting profiles and source-specific discounts/free uses after the core slice.
- [ ] Add Artsblade, Bard, Ritualist and species-specific casting workflows.
- [x] Add cantrip turn tracking and Casting Unit/Infected casting checks.
- [ ] Complete and live-test Conductive casting bonuses.
- [ ] Complete pool grants and resolve external spell sources without inventing missing content.

### Other fidelity work

- [x] Add all 81 individual +1/+2/+3 weapon variants with source-backed rarity,
  base stats, native ordinary-weapon bonuses, and manual Conductive/Splash.
- [x] Preserve four combined upgrade references in Magic Item References;
  verify idempotent migration, customized fields, GM guards and Actor copies.
- [x] Live-test enhanced weapons on PC/NPCs in a clean V13/D&D5e World,
  including native bonuses, manual Splash, Casting Unit selection and restart.
- [ ] Export enhanced weapons into the future locked `ak5e.equipment` pack
  with stable document IDs and verify imports in another clean World.
- [ ] Add tested activities and Active Effects to one origin feature at a time.
- [ ] Add tested activities and Active Effects to one class/branch feature at a
  time.
- [ ] Implement and test AK5e-only equipment properties such as Brace,
  Conductive, Crush, and Splash without changing D&D5e globally.
- [x] Integrate Art casting with per-Actor Arts Points, Maximum Art Level, and
  the one-9th-level-Art-per-Long-Rest limit.
- [ ] Add tested activities for creature actions, reactions, legendary actions,
  lair actions, and mythic actions.
- [x] Add namespaced Lore, Wilderness and Technology fields and a GM-reviewed
  conversion from the stock combined skills.
- [ ] Provide a usable UI or packaged macros for helper-only mechanics instead
  of requiring browser-console calls.
- [ ] Evaluate condition automation individually, including timing, damage,
  penalties, action restrictions, and removal rules.
- [x] Add source-scoped Construct healing, reviewed Alternate Class switching,
  AP-only World spellcasting and ASI feat guards; retain GM instructions where
  native Foundry cannot determine provenance or turn accounting.
- [ ] Mark automation claims in documentation only after clean-World testing.

## 8. Polish the module

- [x] Preserve source paragraph separators in generated text and add readable
  paragraph/line spacing in descriptions, journals, and origin setup; replace
  the origin dialog's grid spacing with normal document flow for headings.
- [x] Give source-backed origin hover cards more width and height, clearer
  paragraph spacing, and a single visible title while preserving full Item text.
- [ ] Check the refreshed Ægir origin page and representative descriptions and
  hover cards in live Foundry after deploying the formatting update and
  refreshing World content.
- [ ] Resolve malformed source emphasis around Basin Sea Reaper's Enrage
  (`**Enrage.***`); retaining paragraph boundaries exposes its extra asterisk.
- [x] Provide a GM-only Asset Library interface for registering, replacing, and
  removing image or audio paths; it starts with no configured assets.
- [ ] Add any licensed icons, thumbnails, or pack artwork required for clear
  navigation; retain source and license information for each asset.
- [ ] Review folder and compendium names for consistency and usability.
- [ ] Finish localization for all user-facing settings, notifications, buttons,
  and labels.
- [ ] Add styles or templates only where native Foundry/D&D5e presentation is
  insufficient.
- [ ] Update `ak5e/README.md` with the final installation, usage, compendium,
  troubleshooting, and contributor instructions.
- [ ] Add a concise changelog and a known-limitations section.

## 9. Release

- [ ] Choose the first distributable module version and update all matching
  content-version references.
- [ ] Add release/download and manifest URLs to `ak5e/module.json` when hosting
  is available.
- [ ] Confirm that the manifest package ID matches the `ak5e/` directory and
  that Foundry accepts all manifest fields.
- [ ] Build a clean zip whose root is the module contents, with no source book,
  development World, temporary files, or unrelated repository files.
- [ ] Install from the zip or manifest URL into a clean Foundry VTT 13 setup.
- [ ] Repeat the representative character, NPC, restart, link, and console-error
  tests using the packaged release.
- [ ] Publish only after license, attribution, compatibility, compendium, and
  known-limitations checks are complete.

## 10. Ongoing maintenance

- [x] Add a root README handoff guide with origin-setup architecture, known
  failures, focused task prompts, test commands, and safe deployment procedure.
- [x] Add a concise UI coding checklist covering lifecycle hooks, sheet controls,
  rerenders, DialogV2 forms, display configuration, and interaction testing.
- [ ] Re-run generation and regression checks after every approved source-book
  change.
- [ ] Re-test a representative sample after every Foundry VTT or D&D5e update.
- [ ] Update `compatibility.verified` only after testing that exact version.
- [ ] Increment the module version for every distributable update.

- [ ] Finish restoration of 21 installed D&D5e pack metadata pointers after
  stopping installed Foundry and approving recovery. See the 0.3.2 live test
  incident in `ak5e/FOUNDRY_SMOKE_TEST.md`; record data was verified unchanged.

## World-wide AK5e replacement follow-up (2026-09-28)

- [x] Add the Chapter 1 World switch, familiar Frightened/Surprised IDs and AK5e
  references, and remove native Surprised initiative disadvantage.
- [x] Add zero-HP Dying entry, native-death-save replacement, Mettle and Death's
  Door controls, massive damage, healing tracking, and persistent failed saves.
- [x] Guard native ASI-for-feat advancement and default multiclass creation;
  add GM-reviewed two-sheet Alternate Class switch.
- [x] Add GM preview and one-time combined-skill conversion with original values
  retained under AK5e flags.
- [x] Require configured Arts Points and level cap for stock casters, validate
  Casting Units, and test first damaging cantrip roll per combat turn.
- [x] Add LMD display, AK5e equipped-DR calculator, Corroded AC/DR adjustment,
  and selected-target Construct healing guard.
- [ ] Complete GM/player owner/observer regression for World rules, including
  damage at zero HP, natural-1/20 death rolls, healing exceptions, and
  class switching in modern D&D5e mode with player/observer clients.
- [x] Test an unconfigured stock caster with an available native slot: the
  Arts dialog disables Cast and leaves that slot untouched.
- [x] Test a configured stock caster's native activity use: spend 1 AP,
  preserve its available native spell slot, and require an equipped Casting Unit.
- [x] Test native ninth-level Art use, second-cast rejection, and Long Rest
  reset while preserving a native ninth-level spell slot.
- [ ] Test source-defined Casting Unit exceptions through native activity use.
- [ ] Add source-backed native activities for individual AK5e equipment
  properties after clean-World testing. Keep currently untested properties GM
  resolved in their Item descriptions.
- [ ] Export locked LevelDB release packs and test imports in another clean
  World with only AK5e enabled; verify stable UUID links and stock packs.
- [ ] Test 5.x versions beyond the installed D&D5e 5.3.3 before broadening the
  compatibility claim.

## Terra nation sheet themes (0.3.5)

- [x] Add 20 source-nationality palettes and motifs to native D&D5e character sheets.
- [x] Resolve the theme from stable nationality IDs, with owner/GM overrides and a native-sheet fallback.
- [x] Add a sheet-header chooser, localization, asset, documentation and regression coverage.
- [ ] Verify all themes in a live Foundry 13 / D&D5e 5.3.3 World with owner and observer clients after installation.
