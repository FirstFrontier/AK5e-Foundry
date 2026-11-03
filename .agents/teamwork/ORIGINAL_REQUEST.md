# Original User Request

## Initial Request — 2026-10-12T00:05:05Z

Implement Batch 1 of the remaining Guard subclasses (Duellist, Liberator, and Lord) for the AK5e Foundry VTT module according to AK5e v1.3.1 Chapter 3 source rules and WORKFLOW.md §3.2 table-play philosophy.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Duellist Subclass Rules & Table Play (Ch. 3 L2739–2845)
- **Identification & Weapons:** `isDuellist(actor)`; Duelling Blades (Greatswords and Polearms gain Finesse property).
- **Rules of Engagement:** Bonus Action Opponent declaration; Points ledger (0–10 max) with entry conditions (+1 on declaration, +1 at turn start if damaged opponent, +1 if not damaged by opponent; upgraded to +2 at 10th level).
- **Parry & Riposte:** Parry (1st Forestall/round costs 0 reaction, -1 Aggression); Press the Attack: Riposte (1 Aggression, Reaction on melee miss -> Attack of Opportunity).
- **Principles of Defence (4th Level):** Every Victory (+1 Aggression on opponent defeat/surrender); Press the Attack: Lightning Reflexes (1 Aggression, Reaction -> DEX save against seen effect); Punish Every Opening (free Riposte without reaction on successful save).
- **Engagements (9 options):** Analysis (0 pts), Balestra (2 pts), Derobement (1 pt), Displacement (1 pt), En Garde (1 pt), Feint (1 pt), Fleche (2 pts), Redoublement (1 pt), Score (1 pt).
- **Grand Challenge (13th Level):** 1/Long Rest, Corps à Corps (AoO when opponent attacks others), Displacement (damage resistance against all non-opponents), Coup de Grâce (8d8 Slashing/Piercing unreduced at 10 points).
- **Master Duellist (17th Level):** Retain points when opponent dies/surrenders; declaration requires no action.

### R2. Liberator Subclass Rules & Table Play (Ch. 3 L2938–3039)
- **Identification & Pools:** `isLiberator(actor)`; Liberty resource pool (0–6 max, combat generation at turn end if no attack/cast/skill was used, or via Guide the Masses).
- **Guide the Masses:** Action (or Bonus Action at 7th level) targeting an ally within 20 ft (40 ft at 10th):
  - Advocate: bonus healing equal to max(2×PB, 2×Liberty).
  - Empower: damage reduction equal to max(PB, Liberty).
  - Uplift: bonus damage on next hit equal to max(PB, Liberty).
- **Righteous Outburst:**
  - Flash of Anger: expend Liberty on melee hit for +1d6 (d10 at 10th) damage per Liberty, refund 1 on kill; becomes Force damage (or Skill damage type) at 13th with Caught in the Crossfire 10-ft splash.
  - The Right Moment: consumes all Liberty on Operator Skill activation for bonus damage.
- **Rising Tide (4th Level):** Operator Skills considered Automatic, Offensive, and Defensive charging.
- **Praxis (10th Level):** Press the Attack: Face Me (2 Aggression, Bonus Action Compelled Duel with Martial DC).
- **Révolution (17th Level):** 1/Long Rest Action, 20-ft burst DEX save vs Martial DC for 1d12 Force per Liberty; Champion of the Worthy (free Guide the Masses); Shield of Belief (THP = Guard level at turn start); Time to Act (+1 Liberty on gain/refund).

### R3. Lord Subclass Rules & Table Play (Ch. 3 L3013–3248)
- **Identification & State:** `isLord(actor)`; Authority state (`flags.ak5e.lord.hasAuthority`); Overruled (INT/WIS/CHA saves at both start and end of turn); 1d8 Temporary HP at turn start while holding Authority.
- **Authority Acquisition & Loss:**
  - Gain on: Elite/Leader kill damaged since last turn, 2+ kills in a turn, or 1-shot full HP kill.
  - Lose on: 0 HP, end-of-turn save affliction, Prone at end of turn, or Initiative.
  - Press the Attack: Manifest Destiny (3 Aggression, prevent loss of Authority).
- **Manifest Will:**
  - Manifestation pool (`@prof` uses, Long Rest recovery). Duration 1 minute: melee weapons gain Range 30/-, STR for ranged attack/damage, +CHA mod Force damage.
  - Will Attunement (10-minute ritual to change damage type to an Operator Skill type).
  - Authority bonus: Ranged/Melee marks; opposite attack deals +1d6 damage (splashes 10 ft at 17th).
- **King's Domain (4th Level):** Choice during Manifestation:
  - Castle Doctrine: 15-ft zone, reaction move half speed and melee attack, refund reaction on non-elite hit; Authority reduces speed by half (or 0 with WIS save at 17th).
  - Pursuit of Power: hit allows full movement without AoO, 2x jump; Authority removes once/turn limit; deals passive CHA damage to adjacent foes at 17th.
- **By Lordly Decree (10th Level):**
  - Make It So: spend Manifestation use to add CHA mod + Proficiency (or Expertise with Authority) to any d20 roll; reroll once on failure at 17th.
  - Press the Attack: A Leader Leads (1+ Aggression, grant Special Inspiration to allies).
- **Force of Will (13th Level):** PB/Long Rest uses, 1/turn:
  - Fire/Psychic/Force/Thunder: 10-ft burst 3d6 DEX save.
  - Bludgeoning/Piercing/Slashing/Radiant: 50-ft line 8d6 DEX save.
  - Acid/Cold/Lightning/Necrotic/Poison: melee hit 6d6 CON save.

### R4. Table-Play Philosophy & Engine Integration (WORKFLOW §3.2)
- All uses register in `guardUses` in `ak5e/scripts/guard-uses.mjs`.
- Confirm before use; cancel changes nothing.
- Ability checks and saves require no confirm dialog.
- Never auto-roll damage, healing, attack, save, or feature dice; cards render roll buttons clicked by the user.
- Resource shortfalls warn but do not block with "Use anyway"; clamp at 0 and report shortfall publicly on chat card.
- Unowned target modifications relay automatically through the active GM client.
- Every action records an undo receipt in `flags.ak5e.guardUses` supporting encounter-window undo.

### R5. Guard Sheet UI & Dialogs
- Add summary badges in `ak5e/scripts/guard-sheet.mjs`: Duellist Points, Liberty, Authority, Manifestation uses.
- Add subclass action groups in `openGuardControls()`.
- Interactive prompts in `executeGuardDialog()` for choices (Engagements, Guide the Masses target bonuses, King's Domain modes, Force of Will, Make It So).

### R6. Verification & Validation
- Unit tests: author `ak5e/test/duellist.test.mjs`, `ak5e/test/liberator.test.mjs`, and `ak5e/test/lord.test.mjs`. Update `"test:guard"` in `package.json` to include them. All must pass cleanly with 0 failures.
- Static verification: `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs`.
- In-Foundry Playwright live browser test: expand `ak5e/tools/test-guard-live.mjs` to exercise Duellist, Liberator, and Lord actors, dialogs, rolls, and undo. Run via `/tmp/run-guard-live.sh` against clean `standard-test` World copy on port 30175 with `launchTestBrowser()`.
- Screenshot inspection: delegate all captured screenshots to `foundry-validator` subagent per AGENTS.md §6.2.

## Acceptance Criteria

### Automated Tests & Quality Checks
- [ ] `npm run test:guard` passes 100% of test suites with 0 failures.
- [ ] `node ak5e/tools/validate-files.mjs` validates all `.mjs`, `module.json`, and `lang/en.json` files.
- [ ] `node ak5e/tools/verify-generated-content.mjs` confirms zero regressions against Chapter 1–6 source records.

### Live Browser & Visual Inspection
- [ ] Live Foundry V13 test suite runs cleanly on port 30175 with `errors: []` in `report.json`.
- [ ] All captured screenshots for Duellist, Liberator, and Lord inspected and verified PASS by the `foundry-validator` subagent.
- [ ] Task progress updated in `TODO.md` and rulings documented in `ak5e/DECISIONS.md`.


## Follow-up — 2026-10-12T11:30:05Z

Plan and implement the four base character classes (Vanguard, Supporter, Specialist, and Medic) for the AK5e 1st Edition v1.3.1 content module on Foundry VTT Version 13 and D&D5e system, providing complete rules calculations, level 1–20 idempotent progression, registered resource pools, table-play interactions with confirmation, overrides, no auto-rolled dice, encounter-window undo, ActorSheetV2 controls, automated tests, and headless browser validation.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Base Class Chassis, Rules & Progression Foundation
Implement the core level 1–20 chassis, formulas, level step tables, and feature grants for Vanguard, Supporter, Specialist, and Medic strictly adhering to AK5e Chapter 3 rules (`AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`). Progression must be idempotent, allowing re-runs and incremental level-ups without duplicate feature grants, loss of hit points, or discarding authored item customizations.

### R2. Resource Pools & Gameplay Capabilities
Register and manage dedicated resource pools (`prowess`, `aidDie`, `lifeSupport`, etc.) with their respective maximum caps, short-rest and long-rest recovery rules. Model all base class active/reactionary/passive capabilities:
- Vanguard: Landstrider, Quick off the Mark, Tip of the Spear d6 table & Directed Engagement, Uncanny Dodge, Lightspeed, and Approaching Storm.
- Supporter: Provide Aid (d8→d10→d12), Advanced Aid riders, Lighten the Load, Ever Reliable, Self-Supportive, and Will Into Being.
- Specialist: Weapon Specialisation (Melee & Ranged styles), Show Your Style (Prowess & Mark of a Specialist), Weapon Adept, Weapon Expertise, Falling Upwards (It's All Skill), and Weapon Mastery.
- Medic: Life Support pool (20→170), Touch Heal, Urgency of Treatment, Resuscitation, To Rob the Ferryman, and Chosen of Asclepius.

### R3. Table Play Philosophy & Player Agency (WORKFLOW §3.2)
Every active ability must present a confirmation dialog showing costs, targets, and any failed prerequisite/range warnings. Overridden warnings must allow execution ("Use anyway"), clamp overspent resources at 0, and broadcast warnings and shortfalls publicly on chat cards. No player dice (damage, healing, saving throws) may be auto-rolled. Unowned target changes must relay automatically to the active GM client without GM approval prompts. Every action must log an undo receipt under `flags.ak5e` reversible within the active encounter window.

### R4. ActorSheetV2 UI & Interactive Controls
Provide sheet panels, status badges, action controls, and chat cards on `ActorSheetV2` for all four base classes, enabling players and GMs to inspect class resources, trigger abilities, roll associated dice from chat buttons, and view/execute undo receipts.

### R5. Controlled Infrastructure & Automated In-Foundry Verification
All automated browser validation must use `launchTestBrowser()` from `ak5e/tools/test-browser.mjs` against a disposable `/tmp` user data copy of the `standard-test` world on port 30175 with proper process traps, capturing rendered screenshots and verifying zero console/page errors.

## Verification Resources
- Rules Authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`
  - Medic: L4560–4871
  - Specialist: L5161–5493
  - Supporter: L6548–6692
  - Vanguard: L7904–8085
- Generated Compendium Content: `ak5e/scripts/chapter-three-content.mjs`
- Test Suites & Runners:
  - `npm test`
  - `node --test ak5e/test/resource-pools.test.mjs ak5e/test/operation-kernel.test.mjs`
  - `node ak5e/tools/validate-files.mjs`
  - `node ak5e/tools/verify-generated-content.mjs`
  - Headless browser harness: `ak5e/tools/test-browser.mjs`

## Acceptance Criteria

### Progression & Source Fidelity
- [ ] Level 1–20 feature setup and progression for Vanguard, Supporter, Specialist, and Medic match the source tables and numbers exactly.
- [ ] Running setup multiple times on the same actor produces identical state without duplicate items or resetting edited fields.
- [ ] Hit dice, proficiencies, saving throw choices, starting equipment, and talent allocations correctly match source specifications.

### Rules & Table Play Agency
- [ ] Resource pools (`prowess`, `aidDie`, `lifeSupport`) initialize to proper maximums, spend accurately, clamp at zero on manual override, and restore on short/long rest.
- [ ] Base feature uses display a confirmation dialog showing resource spend, target, and warnings.
- [ ] Damage, healing, attack, and saving throw dice are never automatically evaluated; chat cards contain interactive roll buttons for document owners.
- [ ] Changes to tokens or documents not owned by the player automatically relay to the active GM client without human approval gates.
- [ ] Every feature use creates an undo receipt under `flags.ak5e` that cleanly reverts all document modifications and resource expenditures within the encounter window.

### Test Coverage & Visual Inspection
- [ ] Unit tests for rules, setup, progression, and table uses for all 4 classes pass cleanly with zero regressions across `npm test`.
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` pass.
- [ ] Private Foundry V13 headless Playwright browser test starts, authenticates, renders sheets for each class, triggers core actions and chat cards, executes undo, and captures screenshots with zero console/page errors.
- [ ] Rendered screenshots are verified PASS for layout, styling, readability, and functional controls.


## Follow-up — 2026-10-12T11:41:15Z

Resolve and verify all 65 Guard base class and Guard subclass defect reports currently in `bugs/pending` (B-129–B-153, B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299), strictly adhering to AK5e 1.3.1 Chapter 3 rules, WORKFLOW.md §3.2 table-play philosophy, and GEMINI.md implementation/testing standards.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Base Guard and Core Subclass Bug Fixes (B-129–B-153)
Resolve all defect reports for Base Guard, Centurion, Artsblade, and Brawler:
- Ensure all Guard uses require confirmation before resource expenditure and preserve state on cancel (B-129, B-130).
- Fix setup preview keys and progression idempotency (preventing duplicate HP and ASIs) (B-131, B-132).
- Fix undo cleanup to remove ephemeral flags and properly sequence reaction spend receipts (B-133, B-135).
- Correct Blade Art duration/expiry, pool selection, casting frequency, spell level limits, resonance rolls, and save immunity recording (B-134, B-136, B-137, B-138, B-139, B-140, B-150).
- Fix Brawler armor gates, dexterity double-counting, target checking, and native benefits (B-141, B-142, B-143, B-151).
- Correct Centurion Fearmonger scope, Cyclone Strike frequency checks, Brutal Execution resolution and intimidation, Cut Through Chaos rolls, reach calculations, and refund mechanics (B-144, B-145, B-146, B-147, B-148, B-152).
- Reconcile subclass dialog text with source mechanics and expand player/integration coverage (B-149, B-153).

### R2. Crusher, Instructor, Musha, and Reaper Subclass Bug Fixes (B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299)
Resolve all defect reports for the remaining Guard subclasses:
- **Crusher (B-230–B-239):** Fix heavy melee weapon detection using AK5e category definitions, wire sheet button inputs, spend hit dice on Renewing Strike, implement Extreme Fortitude and Singular Strike runtime effects, restrict Overbear riders to Foecrusher, implement 10th and 17th passives, prevent false `isCrusher` checks, log unrecorded rulings, and display prerequisite/timing warnings.
- **Instructor (B-250–B-259):** Fix Renowned Instructor initiative tracking, generate chat cards and undo receipts, enable recipient selection, apply/relay Keep Fighting temporary HP, properly implement Once More Unto the Breach, add timing/frequency warnings, guard plan inputs, show instruction dice/cost summaries, log rulings, and align card text with source conditions.
- **Musha (B-280–B-289):** Fix Soloblade HP restoration, apply self-damage on Blood Price, implement tactical options, fix Stand Alone self-heal exemption and stacking, implement Not Yet save and survival HP, warn on reset DC, check Go Forth prerequisites on Retaliator, prevent multi-client hook stacking, and implement Living on the Edge mechanical bonuses.
- **Reaper (B-290–B-299):** Fix Ruin gain undo and Ruin loss, correct Curtainfall timing and Ruin expenditure on hit, implement Reap save damage and crit rolls, apply Reaper crit ranges at runtime, wire Fear the Reaper mark effects and expiry, gate Ruin reset hooks with receipts, restrict healing penalty to incoming heals, guard plan inputs, align card text with source, and expand test coverage.

### R3. Table Play Philosophy and Player Agency (WORKFLOW §3.2)
- All feature activations show a confirmation dialog with costs, targets, and warnings prior to committing any document changes or resource spends.
- Warnings (range, timing, resource shortfall) can be overridden with "Use anyway"; overspent resources clamp at 0 and shortfalls/warnings are broadcast on chat cards.
- Player dice (damage, healing, saving throws) are never auto-evaluated; chat cards render interactive roll/save buttons for participants.
- Unowned target document changes relay automatically through the active GM client without blocking approval gates.
- Every operation writes a reversible undo receipt under `flags.ak5e` valid within the active encounter window.

### R4. Controlled Infrastructure & Browser Validation
- All Playwright Chromium live browser validations must use `launchTestBrowser()` from `ak5e/tools/test-browser.mjs`.
- Run against a disposable `/tmp` user data copy of the `standard-test` world on port 30175 with proper shutdown signal traps.
- Exercise updated sheets, controls, chat cards, and undo flows with zero console or page errors reported.
- Delegate screenshot inspection to a dedicated reviewer subagent per AGENTS.md §6.2.

## Verification Resources
- Source Rules Authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Guard section L1740–L3520)
- Defect Files: `bugs/pending/` (B-129 through B-153, B-230 through B-239, B-250 through B-259, B-280 through B-289, B-290 through B-299)
- Unit Test Suites: `ak5e/test/guard-*.test.mjs`, `ak5e/test/centurion.test.mjs`, `ak5e/test/crusher.test.mjs`, `ak5e/test/instructor.test.mjs`, `ak5e/test/artsblade.test.mjs`, `ak5e/test/brawler.test.mjs`, `ak5e/test/musha.test.mjs`, `ak5e/test/reaper.test.mjs`
- Test & Static Check Commands:
  - `npm run test:guard`
  - `node ak5e/tools/validate-files.mjs`
  - `node ak5e/tools/verify-generated-content.mjs`
- Headless Browser Infrastructure: `ak5e/tools/test-browser.mjs`, `ak5e/tools/test-guard-live.mjs`

## Acceptance Criteria

### Source Fidelity & Bug Remediation
- [ ] All 65 Guard defect reports (B-129–B-153, B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299) are resolved according to source rules and closed by moving files from `bugs/pending/` to `bugs/fixed/` with concise resolution summaries.
- [ ] Uncertain rulings or interpretations are formally recorded in `ak5e/DECISIONS.md`.
- [ ] Task progress and remediation items are updated in `TODO.md`.

### Automated Testing & Quality Gates
- [ ] Unit tests covering all fixes pass with 100% success rate across `npm run test:guard` (and `npm test`).
- [ ] `node ak5e/tools/validate-files.mjs` succeeds with zero lint, formatting, or JSON schema errors.
- [ ] `node ak5e/tools/verify-generated-content.mjs` succeeds with zero discrepancies against source data.

### Table Play Agency & Reversibility
- [ ] Every Guard and subclass ability confirms before spending resources; cancel aborts cleanly.
- [ ] Ability checks and saving throws keep native D&D5e behavior without extra confirmation dialogs.
- [ ] Overridden resource shortfalls clamp at 0 and broadcast on chat cards.
- [ ] No damage, healing, or save dice are auto-rolled.
- [ ] Every modified actor/item produces an undo receipt that cleanly reverses all changes within the encounter window.

### Headless Foundry Live Browser Verification
- [ ] Live Foundry V13 headless test executes cleanly on port 30175 with zero page errors or uncaught exceptions (`errors: []`).
- [ ] Visual screenshots captured for modified sheets, dialogs, chat cards, and undo flows.
- [ ] Captured screenshots are visually inspected and verified PASS by a dedicated reviewer agent per AGENTS.md §6.2.


## Follow-up — 2026-10-12T17:33:57Z

The quota cooldown period has ended and the server restarted. Resume the base classes project per PROJECT.md.


## Follow-up — 2026-10-13T03:54:12Z

Implement the AK5e Medic base character class along with the Physician and Triage subclasses for the AK5e content module on Foundry VTT Version 13 and D&D5e system, providing complete rules calculations, level 1–20 idempotent progression, registered Life Support pool, table-play interactions with confirmation, overrides, no auto-rolled dice, encounter-window undo, ActorSheetV2 controls, automated tests, and headless browser validation.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: demo

## Requirements

### R1. Base Medic Class Chassis, Rules & Idempotent Progression (Ch. 3 L4560–4870)
- **Class Chassis:** Hit Dice 1d6, starting HP (6 + CON), higher levels (1d6 or 4 + CON).
- **Proficiencies & Equipment:** Light Shields armor, Light Melee weapons, Tool Kit/Vehicle of choice, Saving Throws (choose 2 from CON, INT, WIS), Skills (Medicine + choose 2 from Lore, Arts, Tech, Insight, Perception, Persuasion). Equipment package: Light Melee Weapon OR Light Shield; Arts Wand OR Arts Staff; 1x Tool Kit proficient with; OR 1300 LMD.
- **Arts Casting & Progression:** Healing Arts special pool (always prepared), AP pool (3 to 35) & Max Art Level (1 to 9) progression table, Spellcasting Ability (choose INT or WIS).
- **Core Features & Resource Pools:**
  - Medical Expertise: Expertise in Medicine skill.
  - Life Support pool: Registered pool (`lifeSupport`) scaling from 20 to 170 (Ch. 3 L4620–4644), replenishes on Long Rest.
  - Touch Heal: Action to expend any amount of current Life Support to restore missing HP to a touched creature.
  - Preserver: 5 Life Support to reroll any number of healing or temp HP dice rolled for another creature (must use new results).
  - Urgency of Treatment: When casting from Healing Arts pool, expend Life Support in multiples of 10 to reduce AP cost by 1 per 10 LS (minimum 0 AP).
  - Self-Defence Protocol (5th lvl): Choose an unlearned standard Caster Arts pool (<=5th level, including cantrips); learned Arts cost 1 fewer AP (min 0), upgraded to 2 fewer AP at 11th level.
  - Resuscitation (12th lvl): Cast Revivify 1/Long Rest without expending AP.
  - To Rob the Ferryman (18th lvl): Target revived with Revivify recovers HP equal to 3x Medic level.
  - Chosen of Asclepius (20th lvl): Toggle to maximize all healing dice instead of rolling.
- **Progression Idempotency:** Previewed and idempotent setup/progression up to level 20 with grants for Basic/Advanced/Elite Operator Skills, Talents (Basic at 3rd, Module at 8th; Advanced at 9th, Module at 13th), and ASIs at levels 4, 6, 8, 10, 12, 16, 19 without duplicating features, resetting custom edits, or repeating HP increases.

### R2. Physician Subclass Implementation (Ch. 3 L4871–4905)
- **Focused Treatment (1st lvl):** Whenever rolling to determine HP restored or damage dealt to a single creature, add Proficiency Bonus to the total.
- **Intravenous Line (4th lvl):** 10 Life Support Action to tune to a creature within 15 ft for 10 minutes (or until used again). Unwilling creature makes CON save vs Spell Save DC (failure = tuned, success = 2d8 Necrotic damage). While tuned: sense direction, sense when target has <50% max HP, and once per turn add 1d6 (+2d6 at 7th level) to damage dealt or HP restored to that creature.
- **Hypocritic Oath (7th lvl):** When rolling to determine HP restored to a creature, may choose to harm them instead. Target makes CON save vs Spell Save DC; takes Necrotic damage equal to the rolled healing on failure, or half damage on success. Counted as restoring HP for feature trigger purposes.
- **Inpatient Care / Healing Reverberations (11th lvl):** Reaction on rolling HP restored to a creature; expend 15 Life Support. At the start of the Medic's next turn, target recovers HP equal to `max(floor(healed / 2), 15)`.
- **Surgeon-General (15th lvl):** When restoring HP to a single creature using Life Support, an Art, or an Operator Skill, double the total HP restored.

### R3. Triage Subclass Implementation (Ch. 3 L5011–5048)
- **Rapid Response / On the Scene (1st lvl):** 10 Life Support Action: move up to Speed without provoking Opportunity Attacks. Choose up to PB other creatures moved within 5 ft of:
  - Heal: Restore 1d6 + Spellcasting mod HP (upgraded to 2d6 + mod at 7th level).
  - Harm: Melee Spell Attack; on hit, deals 1d6 + Spellcasting mod Necrotic damage (upgraded to 2d6 + mod at 7th level).
- **Urgent Care Centre (4th lvl):** When rolling to restore HP to self with a levelled Art, all other creatures within 10 ft recover HP equal to half the amount rolled.
- **Emergency Medicine / Stop the Flow (7th lvl):** 20 Life Support Action to touch a Dying creature. Target immediately gains 6 Mettle, allowing temporary exceedance of the maximum Mettle of 6 up to a hard cap of 8. Target cannot be affected again until no longer Dying.
- **Touch of Life and Death (11th lvl):** When dealing damage or restoring HP via On the Scene, expend 10 Life Support (no action):
  - Heal: End a condition with duration <= 1 hour (if duration > 1 hour, pause condition for 1 hour).
  - Harm: Target is Poisoned until the beginning of the Medic's next turn.
- **Mobile Hospital (15th lvl):** 1/Long Rest Bonus Action: project a 30-ft radius aura centered on the Medic for 1 minute. When a creature enters the aura or the aura enters a creature's space, restore 3d6 + Spellcasting mod HP (no action required; maximum once per round per creature, resetting at turn start).

### R4. Table-Play Philosophy & Engine Integration (WORKFLOW §3.2)
- Register `medicUses` in `ak5e/scripts/medic-uses.mjs`.
- Always confirm before use; cancelling changes nothing. Ability checks and saving throws keep D&D5e behavior without extra confirmation dialogs.
- Never auto-roll player dice (damage, healing, attack, save, or feature dice); chat cards provide clickable roll buttons for document owners.
- Range, prerequisite, and resource shortfall warnings must be non-blocking with a "Use anyway" override option. Overridden shortfalls clamp resources at 0 and broadcast shortfalls/warnings on chat cards.
- Automatic GM relay for unowned target modifications (healing, damage, conditions, mettle) without GM approval prompts.
- All actions record undo receipts under `flags.ak5e.medicUses` supporting clean encounter-window undo.

### R5. UI & Sheet Integration
- Integrate ActorSheetV2 controls and badges for Medic: Life Support pool display and spend controls, active Intravenous Line tuning status, and subclass action buttons.
- Dialog workflows for On the Scene movement/targeting, Intravenous Line tuning, and Hypocritic Oath heal/harm toggles.

### R6. Controlled Infrastructure & Automated In-Foundry Verification (GEMINI.md §5)
- All browser tests must use `launchTestBrowser()` from `ak5e/tools/test-browser.mjs`.
- Run against a disposable `/tmp` user data copy of the `standard-test` world on port 30175 with strict bash process trapping (`AK5E_TEST_PID`, EXIT/INT/TERM traps).
- Exercise Medic, Physician, and Triage sheets, dialogs, rolls, GM relay, and undo receipts, ensuring zero console/page errors (`report.errors.length === 0`).
- Delegate rendered screenshot viewing to subagents per AGENTS.md §6.2.

## Verification Resources
- Rules Authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`
  - Medic: L4560–4870
  - Physician: L4871–4905
  - Triage: L5011–5048
- Compendium Data: `ak5e/scripts/chapter-three-content.mjs`
- Test Harness: `ak5e/tools/test-browser.mjs`, `ak5e/tools/validate-files.mjs`, `ak5e/tools/verify-generated-content.mjs`

## Acceptance Criteria

### Progression & Rules Fidelity
- [ ] Level 1–20 feature setup and progression for Medic match Chapter 3 source tables and numbers exactly.
- [ ] Re-running progression on an existing Medic actor is strictly idempotent (no duplicated items, no repeated HP increments, authored customizations preserved).
- [ ] Life Support pool scales from 20 to 170 according to the level table and restores to maximum on Long Rest.
- [ ] Physician features (Focused Treatment, Intravenous Line tuning & +1d6/+2d6 bonus, Hypocritic Oath harm conversion, Healing Reverberations, Surgeon-General doubling) function with exact source values.
- [ ] Triage features (On the Scene multi-target heal/harm, Urgent Care Centre splash, Stop the Flow Mettle boost to 8, Touch of Life and Death condition clear/pause/poison, Mobile Hospital aura) function with exact source values.

### Table Play Agency & Engine Integrity
- [ ] All feature activations show a confirmation dialog with costs, targets, and warnings prior to committing any document changes or resource spends.
- [ ] Overridden resource shortfalls clamp at 0 and post public notice cards; cancelling any dialog commits zero changes.
- [ ] Player dice (damage, healing, attack, save) are never automatically evaluated; chat cards render interactive roll/save buttons.
- [ ] Changes to tokens or documents not owned by the player automatically relay to the active GM client without human approval gates.
- [ ] Every feature use creates an undo receipt under `flags.ak5e.medicUses` that cleanly reverts all document modifications and resource expenditures within the encounter window.

### Automated Tests & Quality Checks
- [ ] Unit test suites authored for Medic rules, progression, features, table uses, Physician, and Triage.
- [ ] `npm run test:medic` and full test regression pass 100% with 0 failures.
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` pass.
- [ ] In-Foundry Playwright headless browser test runs cleanly on port 30175 with `errors: []` in `report.json`.
- [ ] Captured screenshots for Medic, Physician, and Triage sheets, dialogs, cards, and undo states inspected and verified PASS per AGENTS.md §6.2.
- [ ] Progress tracked in `TODO.md` and any rulings documented in `ak5e/DECISIONS.md`.


## Follow-up — 2026-10-16T05:17:01Z

This is a single self-contained fix; keep it small and focused. Continue this, but limit your number of sub-agents to 3.

Continue and complete the implementation and verification of the AK5e Medic base character class along with the Physician and Triage subclasses on Foundry VTT Version 13 (`dnd5e` system). Initial implementation modules, unit tests, challenger stress suites, and independent review reports are already present in the workspace; resolve all defects identified in the review reports and failing challenger tests, then complete the in-Foundry headless Playwright verification and visual screenshot inspection.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: demo

## Constraints on Sub-Agent Spawning
- **Strict Sub-Agent Cap:** Limit your number of sub-agents to at most 3 across the entire run. Do NOT fan out large parallel waves of spec-miners, explorers, reviewers, or challengers (Phase 1 mining and initial Phase 3 reviews are already on disk in `.agents/teamwork/spec_miner_medic_base/`, `.agents/teamwork/spec_miner_medic_subclasses/`, `.agents/teamwork/reviewer_medic_1/`, `.agents/teamwork/reviewer_medic_2/`, and `.agents/teamwork/challenger_medic_2/`).

## Requirements

### R1. Resolve Base Medic Progression & Rules Defects (`ak5e/scripts/medic-progression.mjs`, `ak5e/scripts/medic-rules.mjs`)
- Fix level 1–20 HP calculation in `medic-progression.mjs` so it computes incremental HP per newly gained level rather than summing cumulative HP totals across levels.
- Include Level 6 in `ASI_LEVELS` (`[4, 6, 8, 10, 12, 16, 19]`) and ensure re-running progression is strictly idempotent (never re-applying ASIs to non-maxed abilities or duplicating features).
- Enforce strict choice schema validation in `previewMedicProgression`: require exactly 2 Saving Throw choices from `["con", "int", "wis"]`, require exactly 2 Skill choices from the allowed Medic skill list (`Lore`, `Arts`, `Tech`, `Insight`, `Perception`, `Persuasion`), and reject feats or invalid ASI distributions (`+2` to one ability or `+1/+1` to two abilities, max 20).
- Fix starting equipment grant to use the valid Chapter 4 Medical Kit ID (`tool-medical-kit-8`) or proficient tool kit selection, and support the 1,300 LMD alternative.

### R2. Resolve Physician & Triage Subclass Mechanics (`ak5e/scripts/medic-uses.mjs`, `ak5e/scripts/medic-features.mjs`)
- **Physician:**
  - *Focused Treatment (1st lvl):* Add PB to single-target healing or damage rolls.
  - *Intravenous Line (4th lvl):* Spend 10 LS (Action, 15 ft) to tune to a target for 10 minutes (persisting tuning state on the actor and replacing prior tuning). Unwilling targets make a CON save vs Spell Save DC (on failure: tuned; on success: deal 2d8 Necrotic damage). While tuned, apply once-per-turn +1d6 (+2d6 at 7th level) bonus to damage dealt or HP restored to the tuned target.
  - *Hypocritic Oath (7th lvl):* Allow converting rolled healing into harm; target makes CON save vs Spell Save DC, taking full Necrotic damage on a failed save or half on a successful save, while still counting as restoring HP for feature triggers.
  - *Inpatient Care / Healing Reverberations (11th lvl):* Spend 15 LS as a Reaction on healing roll; trigger delayed heal of `max(floor(healed / 2), 15)` HP to the target at the start of the Medic's next turn.
  - *Surgeon-General (15th lvl):* Double single-target HP restored via Life Support (1:2 Touch Heal ratio), Arts, or Operator Skills.
- **Triage:**
  - *Rapid Response / On the Scene (1st lvl):* Spend 10 LS (Action), enforce/warn on maximum targets equal to Proficiency Bonus (`PB`), and apply Heal (`1d6 + mod`, `2d6 + mod` at 7th) or Harm (Melee Spell Attack for `1d6 + mod` Necrotic, `2d6 + mod` at 7th).
  - *Urgent Care Centre (4th lvl):* Trigger half-heal splash to other creatures within 10 ft when self-healing with a **levelled Art**; reject or warn when triggered on a cantrip (level 0).
  - *Emergency Medicine / Stop the Flow (7th lvl):* Spend 20 LS on a Dying target to grant +6 Mettle (capped at 8, exceeding normal max of 6), track per-dying-episode target lock, and snapshot exact prior Mettle value for clean undo.
  - *Touch of Life and Death (11th lvl) & Mobile Hospital (15th lvl):* Spend 10 LS no-action rider on On the Scene (end <=1h condition / pause >1h condition, or Poison until next turn start); 1/LR Bonus Action 30-ft aura restoring `3d6 + mod` HP on entry (1/round per creature).

### R3. Resolve Table-Play, GM Relay & Sheet UI Defects (`ak5e/scripts/medic-uses.mjs`, `ak5e/scripts/medic-sheet.mjs`)
- Add `validateTarget` to all target-mutating plans in `medic-uses.mjs` (`touchHeal`, `resuscitation`, `stopTheFlow`, `intravenousLine`, `hypocriticOath`, `inpatientCare`, `onTheScene`, `urgentCareCentre`, `mobileHospital`) so unowned target changes relay automatically through the GM client without throwing validation errors.
- Set `receipt.formula` (and save/attack metadata where applicable) on dice-rolling plans (`onTheScene`, `mobileHospital`, `intravenousLine`, `hypocriticOath`) so interactive roll/save buttons render on chat cards without auto-rolling player dice.
- Update `ak5e/scripts/medic-sheet.mjs` so the `ActorSheetV2` Features tab injects `.ak5e-medic-badge` elements displaying Life Support (`value / max`), Medic Spell Save DC, active Subclass name, and active Intravenous Line tuning status.

### R4. Controlled Infrastructure & Live In-Foundry Verification (GEMINI.md §5)
- Run `npm run test:medic` and `npm run test:base-classes` and verify 100% pass rate (including `medic-challenger-features.test.mjs` and `medic-challenger-progression.test.mjs`).
- Run `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs`.
- Execute `ak5e/tools/test-medic-live.mjs` using `launchTestBrowser()` against a disposable `/tmp` copy of `standard-test` on port 30175 with strict process cleanup traps, capturing screenshots for Medic, Physician, and Triage sheets, dialogs, chat cards, and undo states, and inspect screenshots per AGENTS.md §6.2.

## Verification Resources
- Existing Review & Challenger Handoffs:
  - `.agents/teamwork/reviewer_medic_1/BRIEFING.md` & `handoff.md`
  - `.agents/teamwork/reviewer_medic_2/BRIEFING.md` & `handoff.md`
  - `.agents/teamwork/challenger_medic_2/handoff.md`
- Existing Test Suites:
  - `ak5e/test/medic-rules.test.mjs`
  - `ak5e/test/medic-features.test.mjs`
  - `ak5e/test/medic-progression.test.mjs`
  - `ak5e/test/medic-uses.test.mjs`
  - `ak5e/test/medic-adversarial.test.mjs`
  - `ak5e/test/medic-challenger-features.test.mjs`
  - `ak5e/test/medic-challenger-progression.test.mjs`
- Live Browser Harness: `ak5e/tools/test-medic-live.mjs`

## Acceptance Criteria

### Automated Tests & Static Checks
- [ ] `npm run test:medic` passes 100% of tests (including all challenger feature and progression tests) with 0 failures.
- [ ] `npm run test:base-classes` passes 100% with 0 regressions across Vanguard, Supporter, Specialist, and Medic.
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` pass with 0 errors.

### Table Play, Progression & Subclass Fidelity
- [ ] Level 1–20 Medic progression is strictly idempotent on re-run, includes Level 6 ASI, validates save/skill/ASI schemas, calculates incremental HP accurately, and grants valid starting equipment (`tool-medical-kit-8`).
- [ ] Unowned target changes relay automatically via `validateTarget` without GM approval gates; dice-rolling features expose interactive chat card roll/save buttons via `receipt.formula`; all actions record reversible encounter-window undo receipts.
- [ ] `ActorSheetV2` renders `.ak5e-medic-badge` with Life Support pool, DC, subclass, and tuning state.

### Live Browser & Visual Verification
- [ ] Headless Playwright test (`ak5e/tools/test-medic-live.mjs`) runs against disposable `/tmp` `standard-test` world on port 30175 using `launchTestBrowser()`, completing with `errors: []` in `browser-report.json` and clean server shutdown.
- [ ] Captured screenshots for Medic, Physician, and Triage are visually inspected and verified PASS, with `TODO.md` and `ak5e/DECISIONS.md` updated.


## 2026-10-16T08:44:15Z

Use Gemini 3.8 agents for implementation. Implement and verify the AK5e **Specialist** base class and its **Executor**, **Hookmaster**, and **Infuser** subclasses in Foundry VTT v13 (`dnd5e` 5.3.3), including progression, table-play uses (`WORKFLOW.md` §3.2), sheet controls, unit/adversarial tests, and live headless Chromium verification.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Specialist Base Class Completion & Module Integration (Ch. 3 L5161–5493)
Complete the base Specialist class across `ak5e/scripts/specialist-rules.mjs`, `ak5e/scripts/specialist-progression.mjs`, `ak5e/scripts/specialist-features.mjs`, `ak5e/scripts/specialist-setup.mjs`, `ak5e/scripts/specialist-uses.mjs`, and `ak5e/scripts/specialist-sheet.mjs`, and wire `game.ak5e.specialist` and hooks into `ak5e/scripts/ak5e.mjs`. Support d8 Hit Dice, proficiencies, 1300 LMD / starting equipment, Weapon Specialisation (8 Melee and 7 Ranged Fighting Styles with cross-list duplicate rejection), Show Your Style (`prowess` pool max PB, +1 on SR and +1 on LR, Mark of a Specialist reroll and refund on second failure), Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards / It's All Skill (Lv 17), Weapon Mastery (Lv 18), and all 15 Basic + 18 Advanced Talents (including Hidden Technique granting Grit pool and Basic Brawler Techniques, Jumpstart increasing Operator Skill Start SP by 5 or 10 with Module, and Part-Time Inventor).

### R2. Executor Subclass (Ch. 3 L5498–5578)
Implement Executor (`ak5e/scripts/executor-features.mjs`) with Hunter / Bodyguard path choice; Deathmark state tracking (holder, transfer on attack with `onAttackRoll` vs `onHitOnly` reading, return on 0 HP or end of turn without attacking/damaging, +3 SP on return with Reaction Disengage, +3 SP at combat turn start while held, Bonus Action Hide, +1d4/+2d4/+3d4 damage scaling at levels 1/7/14, Hunter +1 crit range, Bodyguard attack redirection within 10 ft); In Every Shadow (Lv 5 Climb/Swim speeds equal to Walking Speed and Stealth Proficiency/Expertise); Sweeper (Lv 5 Hunter Prowess spend) and Smokescreen (Lv 5 Bodyguard Prowess spend); Executor Prowess gain triggers (1/turn on Deathmark target reduced to 0 HP, Hunter >=30 single-attack damage, Bodyguard ally within 10 ft attacked taking 0 damage); Preysense / Dangersense (Lv 11); In for the Kill / Blade Shield (Lv 15); and Mortal Blow (Lv 20 Hunter: 1/LR Action, DEX save vs Martial DC, interactive `10d8` roll button, HP loss on fail/half on success, doubled if target has `bleeding`, with `bypassDRResist` vs `bypassAll` reading) / Ultimate Sword and Shield (Lv 20 Bodyguard: Resistance to all damage from Deathmark holder, free Blade Shield without spending Reaction, Reaction transfer of Deathmark when creature within 10 ft is attacked).

### R3. Hookmaster Subclass (Ch. 3 L5585–5679)
Implement Hookmaster (`ak5e/scripts/hookmaster-features.mjs`) with Hooked weapon conversion (free starting melee weapon or 200 LMD + 1 hour; Slashing/Piercing non-Two-Handed melee weapon gains Two-Handed, Thrown 30/- or 50/- at Lv 15, returning, STR-based ranged attacks, 10 ft pull vs <= +1 size, Bonus Action ranged Hook attack restriction, reversible via undo); Big Boot (Lv 5 Unarmed Strike 10 ft push); King of the Urban Jungle (Lv 5: 20 ft pre-move -> Flying Speed = 2x Hook range, cannot attack with Hook while flying, immediate melee damage deals +PB damage and doubles forced movement; Lv 15 Swing to Safety allows Reaction trigger while falling); Bound in Rope (Lv 5: 1 Prowess Action, DEX save vs Martial DC -> Grappled, 15 ft BA drag, Action hogtie within 5 ft, locks Hook use while grappling); Wrangler (Lv 5: 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks vs target, optional -5 attack penalty to ignore DR); Hookmaster Prowess gain triggers (environmental/falling/collision damage or >45 ft flying movement in a turn); Mighty Push (Lv 11: PB/LR Action within 5 ft, STR save vs Martial DC, interactive `8d6` Bludgeoning roll button + 20 ft knockback, half damage and 10 ft on save, collision damage); Spider's Essence (Lv 15: Longer Hook 50/-, Spider's Thread climbing speed, Swing to Safety); and Scorpion Sting (Lv 20: 1/LR Action, DEX save vs Martial DC auto-failed if Grappled/Hooked ignoring Hook restrictions, pull to 5 ft, 6 advantaged Hook attacks each dealing +half Specialist level weapon damage).

### R4. Infuser Subclass (Ch. 3 L5684–5840)
Implement Infuser (`ak5e/scripts/infuser-features.mjs`) with Infuser DC (`20 - INT - PB` vs `8 + INT + PB` per-use reading / GM ruling); Principle of Double Effect (Pharmacology Kit proficiency, Alchemical Infusions pool `2 * PB / LR`, 5 ft range -> 30 ft at Lv 11, 1 min duration, single active Infusion per creature overwriting prior Infusion, Construct/Undead guard); all 8 Alchemical Infusions (`adrenalineTrigger`, `flightReflexStimulant`, `focusHeightener`, `hesitationSuppressor`, `muscleStrengthener`, `procoagulant`, `respirationStimulant`, `sensationNulling`) and the recipient Leverage workflow (CON save vs Infuser DC -> benefit on pass/fail, Dazed until start of next turn + Leverage lockout on fail); New Concoctions (Lv 5 Neurological Inhibitor and Bungarotoxin items/actions); Double-Blind Trial (Lv 5 BA, 1 Prowess + 1 Infusion use -> interactive `1d6` roll button applying corresponding Toxin from table to untoxined weapon); Infuser Prowess gain triggers (Poisoned/Toxined creature reduced to 0 HP, or 1/round when Infusion turns a failed roll into a success); Stimpack (Lv 11: 30 ft range, Questionable Rejuvenation `1d10` Temp HP roll button on apply and on save success, additive with Procoagulant); Excessive Dosing (Lv 15: Succumb +PB Toxin DC and Toxic Shock Poisoned rider on failed Toxin save); and To Defy Science (Lv 20: 1/LR Action within 30 ft, 1-minute Invulnerability effect preventing HP loss).

### R5. Table-Play Philosophy & Foundry V13 Guardrails (`WORKFLOW.md` §3.2)
All uses must confirm before spending resources or mutating documents, warn without blocking (offering "Use anyway" with public card overrides), clamp overspent resources at 0 with shortfall reporting, never auto-roll player dice (post interactive roll/save buttons on chat cards), relay unowned target updates automatically through the active GM client, and record encounter-window undo receipts under `flags.ak5e.specialistUses`. Log all rulings in `ak5e/DECISIONS.md` and update `TODO.md`. Preserve all existing uncommitted working-tree changes.

## Acceptance Criteria

### Automated Unit & Static Verification
- [ ] `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs` passes with 0 failures.
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` exit 0.

### Live Foundry V13 + D&D5e Browser & Visual Verification
- [ ] `ak5e/tools/test-specialist-live.mjs` launches an isolated `/tmp` copy of `standard-test` with `launchTestBrowser()`, exercises GM and Player workflows for Base Specialist, Executor, Hookmaster, and Infuser, verifies 0 console/page errors, and cleanly releases the server port on exit.
- [ ] Captured screenshots of the Specialist sheet panel, dialogs, and chat cards for each subclass are inspected by a sub-agent per `AGENTS.md` §6.2 and receive PASS verdicts.
- [ ] `TODO.md` and `ak5e/DECISIONS.md` are updated with verified evidence and logged rulings.


## 2026-10-16T11:52:34Z

The server restarted and stopped all active subagents and background cron tasks (`task-26`, `task-28`). Please check the state of `orchestrator_6` (`7c128871-a90d-4b87-a96b-0f976db806d5`) and its active worker (`worker_m1`), revive `orchestrator_6` (and have it revive/continue its workers), and re-establish your monitoring crons until the full Specialist, Executor, Hookmaster, and Infuser implementation and verification are complete.


## 2026-10-16T12:01:23Z

This is a focused team task; keep it bounded and capped to a maximum of 3 concurrent sub-agents at any time. Use Gemini 3.8 agents for implementation.

Implement and verify the AK5e **Specialist** base class and its **Executor**, **Hookmaster**, and **Infuser** subclasses in Foundry VTT v13 (`dnd5e` 5.3.3), including progression, table-play uses (`WORKFLOW.md` §3.2), sheet controls, unit/adversarial tests, and live headless Chromium verification.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Specialist Base Class Completion & Module Integration (Ch. 3 L5161–5493)
Complete the base Specialist class across `ak5e/scripts/specialist-rules.mjs`, `ak5e/scripts/specialist-progression.mjs`, `ak5e/scripts/specialist-features.mjs`, `ak5e/scripts/specialist-setup.mjs`, `ak5e/scripts/specialist-uses.mjs`, and `ak5e/scripts/specialist-sheet.mjs`, and wire `game.ak5e.specialist` and hooks into `ak5e/scripts/ak5e.mjs`. Support d8 Hit Dice, proficiencies, 1300 LMD / starting equipment, Weapon Specialisation (8 Melee and 7 Ranged Fighting Styles with cross-list duplicate rejection), Show Your Style (`prowess` pool max PB, +1 on SR and +1 on LR, Mark of a Specialist reroll and refund on second failure), Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards / It's All Skill (Lv 17), Weapon Mastery (Lv 18), and all 15 Basic + 18 Advanced Talents (including Hidden Technique granting Grit pool and Basic Brawler Techniques, Jumpstart increasing Operator Skill Start SP by 5 or 10 with Module, and Part-Time Inventor).

### R2. Executor Subclass (Ch. 3 L5498–5578)
Implement Executor (`ak5e/scripts/executor-features.mjs`) with Hunter / Bodyguard path choice; Deathmark state tracking (holder, transfer on attack with `onAttackRoll` vs `onHitOnly` reading, return on 0 HP or end of turn without attacking/damaging, +3 SP on return with Reaction Disengage, +3 SP at combat turn start while held, Bonus Action Hide, +1d4/+2d4/+3d4 damage scaling at levels 1/7/14, Hunter +1 crit range, Bodyguard attack redirection within 10 ft); In Every Shadow (Lv 5 Climb/Swim speeds equal to Walking Speed and Stealth Proficiency/Expertise); Sweeper (Lv 5 Hunter Prowess spend) and Smokescreen (Lv 5 Bodyguard Prowess spend); Executor Prowess gain triggers (1/turn on Deathmark target reduced to 0 HP, Hunter >=30 single-attack damage, Bodyguard ally within 10 ft attacked taking 0 damage); Preysense / Dangersense (Lv 11); In for the Kill / Blade Shield (Lv 15); and Mortal Blow (Lv 20 Hunter: 1/LR Action, DEX save vs Martial DC, interactive `10d8` roll button, HP loss on fail/half on success, doubled if target has `bleeding`, with `bypassDRResist` vs `bypassAll` reading) / Ultimate Sword and Shield (Lv 20 Bodyguard: Resistance to all damage from Deathmark holder, free Blade Shield without spending Reaction, Reaction transfer of Deathmark when creature within 10 ft is attacked).

### R3. Hookmaster Subclass (Ch. 3 L5585–5679)
Implement Hookmaster (`ak5e/scripts/hookmaster-features.mjs`) with Hooked weapon conversion (free starting melee weapon or 200 LMD + 1 hour; Slashing/Piercing non-Two-Handed melee weapon gains Two-Handed, Thrown 30/- or 50/- at Lv 15, returning, STR-based ranged attacks, 10 ft pull vs <= +1 size, Bonus Action ranged Hook attack restriction, reversible via undo); Big Boot (Lv 5 Unarmed Strike 10 ft push); King of the Urban Jungle (Lv 5: 20 ft pre-move -> Flying Speed = 2x Hook range, cannot attack with Hook while flying, immediate melee damage deals +PB damage and doubles forced movement; Lv 15 Swing to Safety allows Reaction trigger while falling); Bound in Rope (Lv 5: 1 Prowess Action, DEX save vs Martial DC -> Grappled, 15 ft BA drag, Action hogtie within 5 ft, locks Hook use while grappling); Wrangler (Lv 5: 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks vs target, optional -5 attack penalty to ignore DR); Hookmaster Prowess gain triggers (environmental/falling/collision damage or >45 ft flying movement in a turn); Mighty Push (Lv 11: PB/LR Action within 5 ft, STR save vs Martial DC, interactive `8d6` Bludgeoning roll button + 20 ft knockback, half damage and 10 ft on save, collision damage); Spider's Essence (Lv 15: Longer Hook 50/-, Spider's Thread climbing speed, Swing to Safety); and Scorpion Sting (Lv 20: 1/LR Action, DEX save vs Martial DC auto-failed if Grappled/Hooked ignoring Hook restrictions, pull to 5 ft, 6 advantaged Hook attacks each dealing +half Specialist level weapon damage).

### R4. Infuser Subclass (Ch. 3 L5684–5840)
Implement Infuser (`ak5e/scripts/infuser-features.mjs`) with Infuser DC (`20 - INT - PB` vs `8 + INT + PB` per-use reading / GM ruling); Principle of Double Effect (Pharmacology Kit proficiency, Alchemical Infusions pool `2 * PB / LR`, 5 ft range -> 30 ft at Lv 11, 1 min duration, single active Infusion per creature overwriting prior Infusion, Construct/Undead guard); all 8 Alchemical Infusions (`adrenalineTrigger`, `flightReflexStimulant`, `focusHeightener`, `hesitationSuppressor`, `muscleStrengthener`, `procoagulant`, `respirationStimulant`, `sensationNulling`) and the recipient Leverage workflow (CON save vs Infuser DC -> benefit on pass/fail, Dazed until start of next turn + Leverage lockout on fail); New Concoctions (Lv 5 Neurological Inhibitor and Bungarotoxin items/actions); Double-Blind Trial (Lv 5 BA, 1 Prowess + 1 Infusion use -> interactive `1d6` roll button applying corresponding Toxin from table to untoxined weapon); Infuser Prowess gain triggers (Poisoned/Toxined creature reduced to 0 HP, or 1/round when Infusion turns a failed roll into a success); Stimpack (Lv 11: 30 ft range, Questionable Rejuvenation `1d10` Temp HP roll button on apply and on save success, additive with Procoagulant); Excessive Dosing (Lv 15: Succumb +PB Toxin DC and Toxic Shock Poisoned rider on failed Toxin save); and To Defy Science (Lv 20: 1/LR Action within 30 ft, 1-minute Invulnerability effect preventing HP loss).

### R5. Table-Play Philosophy & Foundry V13 Guardrails (`WORKFLOW.md` §3.2)
All uses must confirm before spending resources or mutating documents, warn without blocking (offering "Use anyway" with public card overrides), clamp overspent resources at 0 with shortfall reporting, never auto-roll player dice (post interactive roll/save buttons on chat cards), relay unowned target updates automatically through the active GM client, and record encounter-window undo receipts under `flags.ak5e.specialistUses`. Log all rulings in `ak5e/DECISIONS.md` and update `TODO.md`. Preserve all existing uncommitted working-tree changes.

### R6. Strict Sub-Agent Concurrency Cap
Never spawn more than 3 sub-agents concurrently at any time.

## Acceptance Criteria

### Automated Unit & Static Verification
- [ ] `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs` passes with 0 failures.
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` exit 0.

### Live Foundry V13 + D&D5e Browser & Visual Verification
- [ ] `ak5e/tools/test-specialist-live.mjs` launches an isolated `/tmp` copy of `standard-test` with `launchTestBrowser()`, exercises GM and Player workflows for Base Specialist, Executor, Hookmaster, and Infuser, verifies 0 console/page errors, and cleanly releases the server port on exit.
- [ ] Captured screenshots of the Specialist sheet panel, dialogs, and chat cards for each subclass are inspected by a sub-agent per `AGENTS.md` §6.2 and receive PASS verdicts.
- [ ] `TODO.md` and `ak5e/DECISIONS.md` are updated with verified evidence and logged rulings.


## 2026-10-17T01:10:32Z

This is a focused team task; keep it bounded and capped to a maximum of 4 concurrent sub-agents at any time working in adversarial pairs (implementer vs challenger/reviewer pairs). Use Gemini 3.8 agents for implementation.

Implement and verify the AK5e **Specialist** base class and its **Executor**, **Hookmaster**, and **Infuser** subclasses in Foundry VTT v13 (`dnd5e` 5.3.3), including progression, table-play uses (`WORKFLOW.md` §3.2), sheet controls, unit/adversarial tests, and live headless Chromium verification.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Requirements

### R1. Specialist Base Class Completion & Module Integration (Ch. 3 L5161–5493)
Complete the base Specialist class across `ak5e/scripts/specialist-rules.mjs`, `ak5e/scripts/specialist-progression.mjs`, `ak5e/scripts/specialist-features.mjs`, `ak5e/scripts/specialist-setup.mjs`, `ak5e/scripts/specialist-uses.mjs`, and `ak5e/scripts/specialist-sheet.mjs`, and wire `game.ak5e.specialist` and hooks into `ak5e/scripts/ak5e.mjs`. Support d8 Hit Dice, proficiencies, 1300 LMD / starting equipment, Weapon Specialisation (8 Melee and 7 Ranged Fighting Styles with cross-list duplicate rejection), Show Your Style (`prowess` pool max PB, +1 on SR and +1 on LR, Mark of a Specialist reroll and refund on second failure), Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards / It's All Skill (Lv 17), Weapon Mastery (Lv 18), and all 15 Basic + 18 Advanced Talents (including Hidden Technique granting Grit pool and Basic Brawler Techniques, Jumpstart increasing Operator Skill Start SP by 5 or 10 with Module, and Part-Time Inventor).

### R2. Executor Subclass (Ch. 3 L5498–5578)
Implement Executor (`ak5e/scripts/executor-features.mjs`) with Hunter / Bodyguard path choice; Deathmark state tracking (holder, transfer on attack with `onAttackRoll` vs `onHitOnly` reading, return on 0 HP or end of turn without attacking/damaging, +3 SP on return with Reaction Disengage, +3 SP at combat turn start while held, Bonus Action Hide, +1d4/+2d4/+3d4 damage scaling at levels 1/7/14, Hunter +1 crit range, Bodyguard attack redirection within 10 ft); In Every Shadow (Lv 5 Climb/Swim speeds equal to Walking Speed and Stealth Proficiency/Expertise); Sweeper (Lv 5 Hunter Prowess spend) and Smokescreen (Lv 5 Bodyguard Prowess spend); Executor Prowess gain triggers (1/turn on Deathmark target reduced to 0 HP, Hunter >=30 single-attack damage, Bodyguard ally within 10 ft attacked taking 0 damage); Preysense / Dangersense (Lv 11); In for the Kill / Blade Shield (Lv 15); and Mortal Blow (Lv 20 Hunter: 1/LR Action, DEX save vs Martial DC, interactive `10d8` roll button, HP loss on fail/half on success, doubled if target has `bleeding`, with `bypassDRResist` vs `bypassAll` reading) / Ultimate Sword and Shield (Lv 20 Bodyguard: Resistance to all damage from Deathmark holder, free Blade Shield without spending Reaction, Reaction transfer of Deathmark when creature within 10 ft is attacked).

### R3. Hookmaster Subclass (Ch. 3 L5585–5679)
Implement Hookmaster (`ak5e/scripts/hookmaster-features.mjs`) with Hooked weapon conversion (free starting melee weapon or 200 LMD + 1 hour; Slashing/Piercing non-Two-Handed melee weapon gains Two-Handed, Thrown 30/- or 50/- at Lv 15, returning, STR-based ranged attacks, 10 ft pull vs <= +1 size, Bonus Action ranged Hook attack restriction, reversible via undo); Big Boot (Lv 5 Unarmed Strike 10 ft push); King of the Urban Jungle (Lv 5: 20 ft pre-move -> Flying Speed = 2x Hook range, cannot attack with Hook while flying, immediate melee damage deals +PB damage and doubles forced movement; Lv 15 Swing to Safety allows Reaction trigger while falling); Bound in Rope (Lv 5: 1 Prowess Action, DEX save vs Martial DC -> Grappled, 15 ft BA drag, Action hogtie within 5 ft, locks Hook use while grappling); Wrangler (Lv 5: 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks vs target, optional -5 attack penalty to ignore DR); Hookmaster Prowess gain triggers (environmental/falling/collision damage or >45 ft flying movement in a turn); Mighty Push (Lv 11: PB/LR Action within 5 ft, STR save vs Martial DC, interactive `8d6` Bludgeoning roll button + 20 ft knockback, half damage and 10 ft on save, collision damage); Spider's Essence (Lv 15: Longer Hook 50/-, Spider's Thread climbing speed, Swing to Safety); and Scorpion Sting (Lv 20: 1/LR Action, DEX save vs Martial DC auto-failed if Grappled/Hooked ignoring Hook restrictions, pull to 5 ft, 6 advantaged Hook attacks each dealing +half Specialist level weapon damage).

### R4. Infuser Subclass (Ch. 3 L5684–5840)
Implement Infuser (`ak5e/scripts/infuser-features.mjs`) with Infuser DC (`20 - INT - PB` vs `8 + INT + PB` per-use reading / GM ruling); Principle of Double Effect (Pharmacology Kit proficiency, Alchemical Infusions pool `2 * PB / LR`, 5 ft range -> 30 ft at Lv 11, 1 min duration, single active Infusion per creature overwriting prior Infusion, Construct/Undead guard); all 8 Alchemical Infusions (`adrenalineTrigger`, `flightReflexStimulant`, `focusHeightener`, `hesitationSuppressor`, `muscleStrengthener`, `procoagulant`, `respirationStimulant`, `sensationNulling`) and the recipient Leverage workflow (CON save vs Infuser DC -> benefit on pass/fail, Dazed until start of next turn + Leverage lockout on fail); New Concoctions (Lv 5 Neurological Inhibitor and Bungarotoxin items/actions); Double-Blind Trial (Lv 5 BA, 1 Prowess + 1 Infusion use -> interactive `1d6` roll button applying corresponding Toxin from table to untoxined weapon); Infuser Prowess gain triggers (Poisoned/Toxined creature reduced to 0 HP, or 1/round when Infusion turns a failed roll into a success); Stimpack (Lv 11: 30 ft range, Questionable Rejuvenation `1d10` Temp HP roll button on apply and on save success, additive with Procoagulant); Excessive Dosing (Lv 15: Succumb +PB Toxin DC and Toxic Shock Poisoned rider on failed Toxin save); and To Defy Science (Lv 20: 1/LR Action within 30 ft, 1-minute Invulnerability effect preventing HP loss).

### R5. Table-Play Philosophy & Foundry V13 Guardrails (`WORKFLOW.md` §3.2)
All uses must confirm before spending resources or mutating documents, warn without blocking (offering "Use anyway" with public card overrides), clamp overspent resources at 0 with shortfall reporting, never auto-roll player dice (post interactive roll/save buttons on chat cards), relay unowned target updates automatically through the active GM client, and record encounter-window undo receipts under `flags.ak5e.specialistUses`. Log all rulings in `ak5e/DECISIONS.md` and update `TODO.md`. Preserve all existing uncommitted working-tree changes.

### R6. Concurrency & Adversarial Pairing Guardrails
Operate with at most 4 sub-agents concurrently, working in adversarial pairs (implementer vs challenger/reviewer pairs) for each milestone.

## Acceptance Criteria

### Automated Unit & Static Verification
- [ ] `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/hookmaster.test.mjs ak5e/test/infuser.test.mjs` passes with 0 failures.
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` exit 0.

### Live Foundry V13 + D&D5e Browser & Visual Verification
- [ ] `ak5e/tools/test-specialist-live.mjs` launches an isolated `/tmp` copy of `standard-test` with `launchTestBrowser()`, exercises GM and Player workflows for Base Specialist, Executor, Hookmaster, and Infuser, verifies 0 console/page errors, and cleanly releases the server port on exit.
- [ ] Captured screenshots of the Specialist sheet panel, dialogs, and chat cards for each subclass are inspected by a sub-agent per `AGENTS.md` §6.2 and receive PASS verdicts.
- [ ] `TODO.md` and `ak5e/DECISIONS.md` are updated with verified evidence and logged rulings.


## 2026-10-17T10:54:40Z

System restarted and quota has reset. Please resume monitoring and orchestrating Milestone 3 gate evaluation (reviewer_m3_8_it2, challenger_m3_8_it2, auditor_m3_8_it2) and subsequent milestones under the 4-agent cap.


## 2026-10-17T11:05:19Z

Sentinel status sync:
Milestone 3 Iteration 2 Gate reports are complete:
- Reviewer (reviewer_m3_8_it2_r2): APPROVE
- Challenger (challenger_m3_8_it2_r2): APPROVE
- Auditor (auditor_m3_8_it2_r2): CLEAN
Orchestrator has been notified to record PASS in GATE_STATUS.md, terminate completed M3 subagents, and dispatch Milestone 4 (Infuser Subclass).

## 2026-10-20T02:06:47Z

This is a focused team task; keep it bounded and capped to exactly 2 concurrent sub-agents working as an adversarial pair (1 implementer vs 1 challenger/reviewer). Use Gemini 3.8 agents for implementation.

Implement and verify the AK5e **Inventor** subclass of the Specialist class in Foundry VTT v13 (`dnd5e` 5.3.3), including Equipment Modification, Instability mechanics, all 28 standard + 3 dangerous Modifications, Strange & Stranger Contraptions, Mobile Modding, Risk Assessment, The Big One, table-play interactions (`WORKFLOW.md` §3.2), sheet controls, unit/adversarial tests, and headless Chromium verification.

Working directory: `/home/patch/AK5e-Foundry`  
Integrity mode: development

## Requirements

### R1. Equipment Modification & Instability Engine (Ch. 3 L5847–5865, L5950–5956)
- **Inventor DC**: Calculate as `8 + INT Modifier + Proficiency Bonus` (separate from Martial DC).
- **Inventions Resource Pool**: Register `inventions` pool with `max: "@prof * 2"`, initial value equal to max, refunded when modifications are removed.
- **Equipment Modification Workflow**: 10-minute modification application/removal to non-magical weapons or armor; disallow duplicate modifications on the same item; auto-remove after 1 week if unmaintained.
- **Instability Engine**: Base Instability = 3 for any equipment with modifications; +1 per additional modification after the first; +1 extra for Dangerous modifications.
- **Breakdown Roll**: On modification activation, roll $N$ `d6` dice ($N = \text{Instability}$); if any two or more dice match (duplicates), trigger breakdown:
  - Wielder/wearer loses $1\text{d}8 + 1\text{d}8 \times (\text{Instability} - 3)$ HP (cannot reduce below 1 HP).
  - Dangerous modification breakdown rider: Equipment is rendered broken/damaged (weapon unusable, armor gives no benefits) until repaired with a Maintenance Kit.

### R2. Modifications Catalog & Mechanics (Ch. 3 L5958–6140)
Implement all 31 Modifications across weapons and armor:
- **Melee Weapon (10 Modifications, 1 Dangerous)**:
  1. *Boom Module* (Bludgeoning): hit $\to$ +1 die Thunder + STR save vs Inventor DC or 20 ft knockback & Prone.
  2. *Burning Edge* (Melee): Attack Action $\to$ attacks deal Fire damage until end of turn.
  3. *Collapsible Weapon* (Melee): Action $\to$ fold to disguise (improvised weapon); BA revert.
  4. *Flexible Weapon* (Melee): ignore shield bonus + BA repeat attack on creature within 10 ft.
  5. *Laser Cutter [Dangerous]* (Melee): forgo attack $\to$ 15 ft cone DEX save vs Inventor DC for 3d8/4d8/5d8 Radiant (half on save).
  6. *Returner* (Melee): Attack Action $\to$ Returning property until end of turn; BA recall within normal range if dropped/disarmed.
  7. *Rotary Blade* (Slashing/Piercing): hit $\to$ +1 die Slashing + DEX save or Bleeding.
  8. *Shock Engine* (Melee): hit $\to$ Lightning damage + DEX save or Dazed until end of next turn.
  9. *Telescopic Weapon* (Melee): Attack Action $\to$ Reach property (or 15 ft if already Reach) until end of turn.
  10. *Trick Weapon* (Melee): BA $\to$ transform into chosen Light/Heavy melee weapon for 1 min.
- **Ranged Weapon (8 Modifications, 1 Dangerous)**:
  11. *Arts Cannon [Dangerous]* (Ranged Two-Handed): Action $\to$ 60 ft range, 10 ft radius sphere, DEX save for 3d8/4d8/5d8 Force damage (half on save).
  12. *Collapsible Weapon* (Ranged): Action $\to$ fold to disguise (improvised weapon); BA revert.
  13. *Explosive Shots* (Light/Heavy Ranged): on attack $\to$ roll damage even on miss; other creatures within 10 ft DEX save for half damage as Thunder.
  14. *Electrobolts* (Ranged non-Splash, non-Firearm): hit BA $\to$ Lightning damage + CON save or Nervous Impairment until start of next turn.
  15. *Flame Gout* (Ranged Two-Handed): Action $\to$ 15 ft cone DEX save for 1d8/2d8/3d8 Fire + Burning (half on save).
  16. *Homing Shots* (Light/Heavy Ranged): miss Reaction $\to$ reroll attack (must take new result).
  17. *Melee Attachment* (Ranged): BA or Opportunity Attack $\to$ melee attacks with DEX for 1d8 + DEX mod Piercing until end of turn.
  18. *Safety Removal* (Ranged Firearm): Attack Action $\to$ 1 extra attack, but all attacks in action at Disadvantage.
- **Armor (10 Modifications, 1 Dangerous)**:
  19. *Adrenal Overloader [Dangerous]* (Any Armor): on turn $\to$ gain 1 additional Action this turn (1/SR, 1/turn).
  20. *Artsfield Generator* (Medium/Heavy Armor): ally within 5 ft hit Reaction $\to$ Resistance against 1 damage type present on that attack.
  21. *Camouflage Cloak* (Light Armor or Clothing): Action $\to$ 1 min Advantage on Stealth, Disadvantage on Perception to see wearer.
  22. *Exoskeleton* (Any Armor): BA $\to$ 1 size larger for push/pull/carry, double jump, Advantage on Athletics, unhindered by carrying $\le$ size creature.
  23. *Jetboots* (Any Armor): BA $\to$ Dash Action immediately, straight line only.
  24. *Life Support* (Any Armor): below half HP BA $\to$ roll 1 Hit Die + CON mod HP recovery.
  25. *Powered Gauntlet* (Any Armor): Unarmed strike hit $\to$ +1 die Lightning damage.
  26. *Refocuser* (Any Armor or Clothing): failed concentration CON save Reaction $\to$ reroll with Advantage.
  27. *Shock Absorbers* (Any Armor): STR or DEX save Reaction $\to$ add Inventor's INT modifier to roll.
  28. *Wingsuit* (Light Armor or Clothing): falling Reaction $\to$ Flying Speed 30 ft until landing (descend $\ge 10$ ft/turn, cannot ascend).

### R3. Contraptions, Mobile Modding, Risk Assessment & The Big One (Ch. 3 L5881–5946)
- **Strange Contraption (Lv 5)**: Action to throw to a point within 30 ft; 8 options each usable 1/Long Rest:
  - *12 Million Lumen Flashlight* (15 ft radius DEX save or Blinded until end of next turn).
  - *Fun Toy* (Mobile Camera Construct: 18 AC, 10 HP, 20 ft walk, 60 ft Darkvision, 10 min).
  - *Musbeast Remover* (10 ft radius sphere for 2 rounds, DEX save or 4d8 Piercing).
  - *Needlefly Fumigator* (20 ft radius sphere for 1 min, CON save or 2d8 Poison + Poisoned).
  - *Over-tuned Speaker* (loud sound up to 100 ft for 1 min).
  - *Portable Firestarter* (10 ft radius DEX save or 2d8 Fire + Burning).
  - *Universal Keycard* (5 ft electronic lock removal, leaves trace).
  - *Unstable Contraption* (10 ft radius DEX save or 5d8 Thunder).
- **Mobile Modding (Lv 5)**: Action, 1 Prowess $\to$ apply 1 Modification of choice to equipment of willing creature within 5 ft for 1 minute (no Invention cost).
- **Inventor Prowess Gain Trigger**: Gain 1 Prowess when a creature who activated one of your Modifications this turn reduces a creature to 0 HP (max 1/turn).
- **Risk Assessment (Lv 11)**:
  - *Speciality Modding*: -1 Instability on modified weapons matching Weapon Specialisation choice.
  - *Trained Operator*: -1 Instability on modified equipment wielded/worn by the Inventor.
- **Stranger Contraptions (Lv 15)**: Enhanced effects (Flashlight Dazed on save pass, Fun Toy Invisible, Musbeast Bleeding on fail, Fumigator party immunity, Speaker volume/direction control, Firestarter +INT Burning damage, Keycard traceless, Unstable Contraption 8d8).
- **The Big One (Lv 20)**: 1/Long Rest Action choosing FLASH (4 points within 100 ft, 10 ft radius, 8d6 Thunder + Burning), SHARD (50 ft cone, 10d6 Slashing + Bleeding, ignores cover), or QUASAR (100x10 ft line, 14d6 Radiant).

### R4. Table-Play Philosophy & Reversibility (`WORKFLOW.md` §3.2)
- Confirm uses before spending resources or mutating documents.
- Warn without blocking (offer "Use anyway" with public chat card notifications).
- Clamp overspent resources at 0 with shortfall reporting.
- Never auto-roll player dice (post interactive chat card buttons for attacks, saves, damage, and instability d6 rolls).
- Relay unowned target updates automatically through the active GM client (`validateTarget`).
- Full encounter-window undo receipts recorded under `flags.ak5e.specialistUses.undo`.
- Log all rulings in `ak5e/DECISIONS.md` and update `TODO.md`.

## Acceptance Criteria

### Automated Unit & Adversarial Verification
- [ ] `node --test ak5e/test/inventor.test.mjs ak5e/test/inventor-adversarial.test.mjs` passes 100% with 0 failures.
- [ ] Complete Specialist regression suite passes 100%: `npm run test:specialist` (all base class, Executor, Hookmaster, Infuser, and Inventor tests green).
- [ ] `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` exit 0.

### Live Foundry V13 Browser & Visual Verification
- [ ] `ak5e/tools/test-specialist-live.mjs` is updated with Inventor workflows and executes via `launchTestBrowser()` with 0 console/page errors, releasing port 30175 on exit.
- [ ] Captured screenshots of Inventor sheet controls, modification dialogs, Instability breakdown rolls, and Contraption chat cards are inspected by a sub-agent per `AGENTS.md` §6.2 with PASS verdicts.
- [ ] `TODO.md` and `ak5e/DECISIONS.md` are updated with verified evidence and logged rulings.


## 2026-10-24T03:31:05Z

Use a team with at most 4 agents at once to implement the Skyranger, Dollkeeper, and Trapmaster Specialist branches in the AK5e Foundry VTT module according to source rules, table-play principles, and verification guardrails.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: development

## Reference Material
- Source Rules: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 6145–6542)
- Existing Implementations: `ak5e/scripts/specialist-*.mjs`, `ak5e/scripts/infuser-features.mjs`, `ak5e/scripts/inventor-features.mjs`
- Project Contracts: `WORKFLOW.md`, `AGENTS.md`, `GEMINI.md`, `ak5e/DECISIONS.md`, `TODO.md`
- Implementation Plan: `/home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md`

## Requirements

### R1. Skyranger Specialist Branch
Implement the complete Skyranger subclass features faithfully to source lines 6145–6262:
- Flight Suit starting equipment (Light Armour, AC 12 + Dex, 0 DR, 25 lb, 650 LMD replacement cost).
- Fuel resource pool (scaling 2 to 8 across levels, Long Rest recovery) and Take Off bonus action (1 minute fly speed).
- Strafe Damage progression (5d8 at level 5 scaling to 10d8 at level 20).
- Air Doctrine rest selection (Air Superiority, Bombardment, Close Air Support) with actions: AA Missile (grounded/flying damage bonuses), Bombing Run (distance scaling), and Swooping Dive (movement + advantage).
- Jink at 5th level: Evasive Manoeuvres (+PB AC reaction, damage halving if still hit) and aerial Prowess gain triggers.
- Advanced Doctrine at 11th level: crash AoE thunder damage, Firebomb / Gas Strike options, and Close Air Support fear effect.
- Afterburners at 15th level: reaction movement and fire aura damage.
- Skyscreamer at 20th level: 1/LR Combat Mode granting multirole doctrine, free Fuel for Air Doctrine features, and Core Cannon & Core Saber special weapons.

### R2. Dollkeeper Specialist Branch
Implement the complete Dollkeeper subclass features faithfully to source lines 6266–6377:
- Living Doll companion construct (STR 16, DEX 16, CON 14, INT 1, WIS 10, CHA 4, immunities, darkvision, shared senses, owner-linked HP/speed/PB, and Strike action).
- Combat command via Bonus Action within 100 ft; Hit Dice healing linkage (+owner Con mod) and Long Rest ritual / 500 LMD rebuild.
- Pull the Strings at 5th level: Doll's Dance remote skill casting, Look in the Mirror weapon feature sharing, and Marionette 1/LR 0 HP substitution.
- Musical Chairs at 5th level: 1 Prowess position swapping and joint Prowess triggers.
- Masquerade at 11th level: Doll Multiattack (2 attacks), Mistaken Identity target redirection (PB/rest), and telepathic Talking Heads.
- Living Doll at 15th level: Reciprocity temporary HP sharing and non-damaging Share Arts.
- Artistry is Violence at 20th level: Doll Multiattack (3 attacks) and 1/LR Doll Raid simultaneous action.

### R3. Trapmaster Specialist Branch
Implement the complete Trapmaster subclass features faithfully to source lines 6382–6542:
- Environmental Warfare at 1st level: Traps pool (2×PB / LR), Sleight of Hand Expertise, Trap DC formula `8 + PB + max(Dex, Int)`.
- Devil's Own Luck 1/rest GM environmental trap suggestion workflow.
- 8 Trap schemas with base mechanics and level 7 / 14 damage scaling: Alarm, Explosive, Gas, Incendiary, Paddle, Snare, Spike, and Timed Explosive.
- Detecting (Perception vs Trap DC) and Disarming (Sleight of Hand vs Trap DC, fail by 5+ triggers).
- Panic Inducer at 5th level: Irritating Distraction save disadvantage, Jester's Grace trap immunity/advantage, and Warning Point reaction delay & speed reduction.
- Here's One I Made Earlier at 5th level: 1 Prowess 60 ft action trap planting, double-save/kill Prowess gains.
- Bait the Trap at 11th level: Come and Get Me movement lure (PB/rest).
- Agent of Chaos at 15th level: Damage reduction and resistance bypass.
- House of Horrors at 20th level: Permanent +5 Trap DC and Party Favours 1/LR 6 hidden traps at 100 ft.

### R4. Core Specialist Integration & Character Sheet UI
- Integrate Skyranger, Dollkeeper, and Trapmaster with `specialist-rules.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`, `specialist-sheet.mjs`, and `ak5e.mjs`.
- Provide interactive character sheet badges (Fuel, Doll status, Traps, DCs) and action button controls in the Specialist sheet panel.
- Ensure strict adherence to WORKFLOW §3.2: confirm before use, non-blocking warning overrides, zero-spending shortfall clamping, GM relay for unowned target operations, interactive roll buttons without auto-rolls, and encounter-window undo receipts.
- Log all rulings in `ak5e/DECISIONS.md` and update `TODO.md`.

### R5. Test & Browser Verification
- Provide automated unit and adversarial test suites for each branch covering positive/negative cases, boundary conditions, resource spending/recovery, and undo reversibility.
- Execute live Chromium browser verification via `launchTestBrowser()` with screenshot inspection confirming error-free rendering and usability.

## Acceptance Criteria

### Automated Testing
- [ ] Subsystem unit and adversarial test suites for Skyranger, Dollkeeper, and Trapmaster pass with 100% green exit status.
- [ ] Full Specialist test suite (`ak5e/test/specialist-*.test.mjs`, `ak5e/test/inventor*.test.mjs`, `ak5e/test/infuser*.test.mjs`, and new branch tests) passes without regression.
- [ ] Codebase validation script (`node ak5e/tools/validate-files.mjs`) succeeds with 0 errors.

### WORKFLOW §3.2 Conformance
- [ ] All active features require confirmation before use and provide non-blocking warning overrides.
- [ ] Resource shortfalls clamp at zero and do not block execution if overridden.
- [ ] Every change produces a valid undo receipt restoring the pre-activation state cleanly.
- [ ] Unowned target interactions automatically relay through GM messaging.
- [ ] No feature auto-rolls damage, healing, attack, or save dice.

### Live Browser & Rendered Verification
- [ ] Live headless Chromium test session launches via `launchTestBrowser()`, joins standard-test world, and inspects Specialist characters with Skyranger, Dollkeeper, and Trapmaster branches across level milestones (1, 5, 11, 15, 20).
- [ ] Character sheets render correct badges, resource pools, and DCs without console or page errors.
- [ ] Screenshots captured and inspected, achieving PASS verdicts on readability, layout, contrast, and controls.


## 2026-10-24T04:02:54Z

USER DIRECTIVE: The user has explicitly instructed: "use adversarial pairs for implementation". 

Please ensure that implementation and verification use adversarial pairs (implementer + adversarial challenger/tester), authoring dedicated adversarial test suites (e.g., `skyranger-adversarial.test.mjs`, `dollkeeper-adversarial.test.mjs`, `trapmaster-adversarial.test.mjs`) to aggressively probe edge cases, boundary values, resource shortfalls, non-blocking warnings, and undo reversibility before accepting each milestone, while maintaining the maximum cap of 4 concurrent agents at once.


## User Directive — 2026-10-24T04:03:19Z

The user has explicitly instructed: "use adversarial pairs for implementation".

Please ensure that implementation and verification use adversarial pairs (implementer + adversarial challenger/tester), authoring dedicated adversarial test suites (e.g., `skyranger-adversarial.test.mjs`, `dollkeeper-adversarial.test.mjs`, `trapmaster-adversarial.test.mjs`) to aggressively probe edge cases, boundary values, resource shortfalls, non-blocking warnings, and undo reversibility before accepting each milestone, while maintaining the maximum cap of 4 concurrent agents at once.

Ensure this directive is recorded and strictly enforced across your milestones.


## 2026-10-24T04:43:17Z

User confirmed: "/teamwork proceed". 

Please proceed with Milestone 5 (Live Foundry V13 headless Playwright browser testing, screenshot capture, and visual validation) through to completion. Ensure that all screenshots are inspected per AGENTS.md §6.2 and that final victory audit checks pass.
