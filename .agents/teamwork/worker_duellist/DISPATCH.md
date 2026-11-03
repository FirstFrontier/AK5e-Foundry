## 2026-10-12T00:13:31Z
You are the Worker implementing Milestone M1: Duellist Subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_duellist/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read the relevant sections of:
   - /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules/handoff.md (Duellist rules)
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/handoff.md (Duellist architecture & blueprints)
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_test_infra/handoff.md (Duellist test blueprint)
4. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root. Adhere strictly to WORKFLOW.md §3.2 (no auto-rolled dice, table-play confirmation, warning shortfalls clamping at 0 with 'Use anyway', encounter-window undo receipts).
5. Files you own exclusively:
   - ak5e/scripts/duellist-features.mjs (CREATE)
   - ak5e/test/duellist.test.mjs (CREATE)
   - ak5e/scripts/guard-uses.mjs (EDIT ONLY for Parry adjustment to CORE_PLANS.forestall)
   Do NOT touch other files.

Detailed Implementation Requirements:
A. `ak5e/scripts/duellist-features.mjs`:
   - `isDuellist(actor)`: returns true if guardEnabled(actor) and guardBranch(actor) === "duellist".
   - `defineDuellistPools()`: defines `duellistPoints` (max 10, min 0, initial 0) and `grandChallenge` (max 1, initial 1, recovery Long Rest, level >= 13).
   - `registerDuellistHooks()`: defines pools, registers `DUELLIST_PLANS` with `guardUses.register({ plans: DUELLIST_PLANS })`, hooks `dnd5e.preRollAttackV2` and `dnd5e.preRollDamageV2` for Duelling Blades (Greatswords and Polearms gain Finesse property).
   - `DUELLIST_PLANS`:
     - `declareOpponent`: Sets `flags.ak5e.guard.duellist.opponent = { uuid, name }`. Grants +1 Duel Point (+2 if level >= 10, +1 extra if not wielding Heavy Melee weapon). Bonus Action cost (Free at 17th). Retains points at 17th.
     - `riposte`: Spends 1 Aggression, Reaction on melee miss -> AoO summary.
     - `lightningReflexes`: Spends 1 Aggression, Reaction on save against visible effect -> DEX save.
     - `punishOpening`: Free Riposte without reaction on successful save.
     - 9 Engagements (`engagementAnalysis` (0 pts), `engagementBalestra` (2 pts), `engagementDerobement` (1 pt), `engagementDisplacement` (1 pt), `engagementEnGarde` (1 pt), `engagementFeint` (1 pt), `engagementFleche` (2 pts), `engagementRedoublement` (1 pt), `engagementScore` (1 pt)).
     - `grandChallenge`: Spends 1 `grandChallenge` use, sets 1-minute state (Corps à Corps AoO, Displacement resistance).
     - `coupDeGrace`: 8d8 Slashing or Piercing damage formula, unreduced by Resistance or DR at 10 Duel points; ends Grand Challenge.
   - All plans follow `guardUses` receipt and undo conventions, clamp shortfalls at 0, render roll buttons on cards (no auto-rolling).
B. `ak5e/scripts/guard-uses.mjs`:
   - In `CORE_PLANS.forestall`, check if actor `isDuellist`. If it's the first Forestall this round, costs 0 reaction and 1 fewer Aggression (min 0).
C. `ak5e/test/duellist.test.mjs`:
   - Author thorough unit tests using `node:test`, `node:assert/strict`, `guardFixture` and `world` from `ak5e/test/guard-fixture.mjs`.
   - Test identification, Duelling Blades finesse property, Rules of Engagement & points ledger, Parry & Riposte, Principles of Defence (4th), all 9 Engagements, Grand Challenge (13th), Master Duellist (17th), warning shortfalls, "Use anyway" overrides, roll card formulas, and encounter-window undo receipts.
D. Run and verify:
   - Run `node --test ak5e/test/duellist.test.mjs` and ensure all tests pass cleanly.
   - Run `node ak5e/tools/validate-files.mjs` to ensure clean syntax.
E. Write your report to /home/patch/AK5e-Foundry/.agents/teamwork/worker_duellist/handoff.md and send a completion message with test results.
