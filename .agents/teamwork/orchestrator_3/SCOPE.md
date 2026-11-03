# Scope: Guard Base Class & Subclasses Defect Remediation (65 Defect Reports)

## Architecture

The Guard implementation in AK5e Foundry VTT V13 comprises:
1. **Base Guard Engine**:
   - `ak5e/scripts/guard-rules.mjs`: Pure functional calculations: hit dice, HP formulas, level tables, Martial DC, saving throws, fighting styles, proficiencies.
   - `ak5e/scripts/guard-features.mjs`: Core Guard mechanics, resource pools (`aggression`, `unrelenting`), rest recovery, die-rolling hooks.
   - `ak5e/scripts/guard-setup.mjs`: Pure preview and transactional embedded document grants with idempotent `contextKey` hash.
   - `ak5e/scripts/guard-progression.mjs`: Idempotent Level 1–20 choices, HP, ASI/talent allocation without duplicate benefits.
   - `ak5e/scripts/guard-uses.mjs`: Table-play active abilities powered by `createPlayUses({ ns: "guardUses" })` enforcing WORKFLOW §3.2 (confirmations, non-blocking warnings, shortfall clamping at 0, GM relay, interactive roll buttons, encounter-window undo receipts).
   - `ak5e/scripts/guard-sheet.mjs`: ActorSheetV2 injection, header button, dialog prompts, and action buttons.
2. **Subclasses (7 implemented branches under review)**:
   - **Centurion** (`centurion-features.mjs`): Fearmonger, Cyclone Strike, Brutal Execution, Cut Through Chaos, Ferocious Fling, Guillotine, Shredder, Storm of Blood.
   - **Artsblade** (`artsblade-features.mjs`): Spellsword Points, Blade Art maximal casting, Augmented Assault, Ultimate Blade Art, Resonance damage types, save immunity.
   - **Brawler** (`brawler-features.mjs`): Guns Out armor gates, Dexterous Attacks (no double-counting DEX), Bob & Weave, Art of the Fist, Kick Them While They're Down.
   - **Crusher** (`crusher-features.mjs`): Heavy Melee Weapon category detection, Extreme Fortitude, Singular Strike, Death's Passing, Foecrusher / Overbear riders, Renewing Strike HD expenditure, 10th & 17th passives.
   - **Instructor** (`instructor-features.mjs`): Instruction dice, Renowned Instructor initiative tracking, Keep Fighting! temp HP GM relay, Once More Unto the Breach, timing warnings.
   - **Musha** (`musha-features.mjs`): Soloblade HP restoration, Blood Price self-damage, Stand Alone self-heal exemption, Not Yet save/survival HP, Retaliator Go Forth check, Living on the Edge.
   - **Reaper** (`reaper-features.mjs`): Ruin pool gain/loss/caps/undo, Curtainfall timing, Reap save/crit rolls, crit range hooks, Fear the Reaper mark & duration, incoming heal penalty scope.

## Feature Inventory

| # | Feature / Bug Cluster | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Confirmation & State Preservation | B-129, B-130: Guard uses confirm before spending; cancel aborts cleanly | M1 | Survey |
| 2 | Setup Preview & Idempotency | B-131, B-132: Setup button passes contextKey; progression avoids duplicate HP/ASIs | M1 | Survey |
| 3 | Undo Flags & Reaction Sequencing | B-133, B-135: Undo restores gameplay flags; reactions spent atomically with receipt | M1 | Survey |
| 4 | Centurion Mechanics & Fidelity | B-144, B-145, B-146, B-147, B-148, B-152: Fearmonger scope, Cyclone intervals, Brutal Execution resolution/intimidation, Cut Through Chaos, reach/refunds | M2 | Survey |
| 5 | Artsblade Casting & Expiry | B-134, B-136, B-137, B-138, B-139, B-140, B-150: Ultimate Blade Art expiry, pool selection, casting limits, max level, resonance scope/duration, save immunity | M2 | Survey |
| 6 | Brawler Armor, Stats & Benefits | B-141, B-142, B-143, B-151: Medium/heavy armor gate, DEX double-count fix, target hit checks, Bob & Weave AC, Fist scaling | M2 | Survey |
| 7 | Subclass Dialogs & Integration Coverage | B-149, B-153: Align dialog text with source; expand player/integration tests | M2 | Survey |
| 8 | Crusher Heavy Weapons & Riders | B-230, B-231, B-232, B-235, B-239: Heavy melee category detection, sheet inputs, Renewing Strike HD spend, Foecrusher riders, warnings | M3 | Survey |
| 9 | Crusher Passives & Isolation | B-233, B-234, B-236, B-237, B-238: Extreme Fortitude, Singular Strike, 10th/17th passives, isCrusher isolation, rulings log | M3 | Survey |
| 10 | Instructor Tracking & Relay | B-250, B-251, B-252, B-253, B-254: Renowned Instructor initiative & receipt, target recipient selection, Keep Fighting! Temp HP relay, Once More | M3 | Survey |
| 11 | Instructor Warnings & Cards | B-255, B-256, B-257, B-258, B-259: Timing/frequency warnings, guarded inputs, instruction dice/costs, card text fidelity | M3 | Survey |
| 12 | Musha Healing & Sacrifices | B-280, B-281, B-282, B-283, B-284: Soloblade HP application, Blood Price self-damage, Stand Alone self-heal exemption, stacking rulings | M4 | Survey |
| 13 | Musha Survival & Runtime Passives | B-285, B-286, B-287, B-288, B-289: Not Yet save & survival HP, reset DC warning, Retaliator Go Forth check, client hook isolation, Living on the Edge | M4 | Survey |
| 14 | Reaper Ruin Lifecycle & Timing | B-290, B-291, B-295, B-296: Ruin cap/undo, Curtainfall spend-on-hit, Ruin reset receipt, incoming heal penalty scope | M4 | Survey |
| 15 | Reaper Attacks, Marks & Testing | B-292, B-293, B-294, B-297, B-298, B-299: Reap save/crit rolls, crit range hooks, Fear the Reaper mark expiry, guarded inputs, card text, test coverage | M4 | Survey |
| 16 | Headless Foundry Live Browser Validation | Controlled Playwright browser test on port 30175 with /tmp standard-test copy, launchTestBrowser(), full sheet and feature exercise | M5 | Survey |
| 17 | Rendered Screenshot Inspection | Independent subagent review of captured screenshots per AGENTS.md §6.2 | M5 | Survey |
| 18 | Bug Closures & Decisions Log | Move B-129..B-153, B-230..B-239, B-250..B-259, B-280..B-289, B-290..B-299 to bugs/fixed; update ak5e/DECISIONS.md & TODO.md | M6 | Survey |
| 19 | Quality Verification & Victory Audit | Run npm run test:guard, validate-files.mjs, verify-generated-content.mjs; Forensic Auditor gate check; report to Sentinel | M6 | Survey |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Base Guard & Core Engine Fixes | B-129–B-133, B-135 (confirmation, progression, undo flags, reaction sequencing) | none | IN_PROGRESS |
| M2 | Core Subclasses Fixes | Centurion (B-144–B-148, B-152), Artsblade (B-134, B-136–B-140, B-150), Brawler (B-141–B-143, B-151), dialogs & tests (B-149, B-153) | M1 | PLANNED |
| M3 | Crusher & Instructor Fixes | Crusher (B-230–B-239), Instructor (B-250–B-259) | M1 | PLANNED |
| M4 | Musha & Reaper Fixes | Musha (B-280–B-289), Reaper (B-290–B-299) | M1 | PLANNED |
| M5 | Headless Foundry Browser Validation & Screenshot Review | Controlled port 30175 headless browser run; launchTestBrowser(); visual review per AGENTS.md §6.2 | M1, M2, M3, M4 | PLANNED |
| M6 | Bug Closures, Quality Verification & Victory Handoff | Move 65 bugs to bugs/fixed; update DECISIONS.md & TODO.md; run validate & verify tools; forensic audit; report to Sentinel | M5 | PLANNED |

## Interface Contracts

### Base Guard ↔ Subclasses
- Subclass feature plans register with `guardUses.register({ plans: ... })`.
- Receipts stored under `flags.ak5e.guardUses.undo`.
- All plans return `{ title, warnings, rolls, formula, rollLabel, apply(nextState, receipt, readingValue), validateTarget(source, receipt, entry, target) }`.
- Subclass sheets hook into `renderActorSheetV2` via `ak5e/scripts/guard-sheet.mjs` injecting into `.tab[data-tab="features"]`.
- `confirmPlayUse(title, callback)` must explicitly prompt for user confirmation before calling `guardUses.command()`. Cancelation rejects or closes without executing.

## Code Layout

```
ak5e/scripts/
├── guard-rules.mjs            (M1)
├── guard-features.mjs         (M1)
├── guard-setup.mjs            (M1)
├── guard-progression.mjs      (M1)
├── guard-uses.mjs             (M1)
├── guard-sheet.mjs            (M1)
├── centurion-features.mjs     (M2)
├── artsblade-features.mjs     (M2)
├── brawler-features.mjs       (M2)
├── crusher-features.mjs       (M3)
├── instructor-features.mjs    (M3)
├── musha-features.mjs         (M4)
├── reaper-features.mjs        (M4)
└── ak5e.mjs

ak5e/test/
├── guard-rules.test.mjs       (M1)
├── guard-features.test.mjs    (M1)
├── guard-progression.test.mjs (M1)
├── guard-uses.test.mjs        (M1)
├── centurion.test.mjs         (M2)
├── artsblade.test.mjs         (M2)
├── brawler.test.mjs           (M2)
├── crusher.test.mjs           (M3)
├── instructor.test.mjs        (M3)
├── musha.test.mjs             (M4)
├── reaper.test.mjs            (M4)
└── guard-live.test.mjs        (M5)

ak5e/tools/
└── test-guard-live.mjs        (M5)
```
