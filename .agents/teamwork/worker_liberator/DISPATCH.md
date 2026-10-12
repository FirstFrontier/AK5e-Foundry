## 2026-10-12T00:24:02Z

You are the Worker implementing Milestone M2: Liberator Subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_liberator/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read the relevant sections of:
   - /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules/handoff.md (Liberator rules)
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/handoff.md (Liberator architecture & blueprints)
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_test_infra/handoff.md (Liberator test blueprint)
4. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root. Adhere strictly to WORKFLOW.md §3.2 (no auto-rolled dice, table-play confirmation, warning shortfalls clamping at 0 with 'Use anyway', unowned target relay, encounter-window undo receipts).
5. Files you own exclusively:
   - ak5e/scripts/liberator-features.mjs (CREATE)
   - ak5e/test/liberator.test.mjs (CREATE)
   Do NOT touch other files.

Detailed Implementation Requirements:
A. `ak5e/scripts/liberator-features.mjs`:
   - `isLiberator(actor)`: returns true if guardEnabled(actor) and guardBranch(actor) === "liberator".
   - `defineLiberatorPools()`:
     - `liberty`: max 6, min 0, initial 0.
     - `revolution`: max 1, initial 1, recovery Long Rest, level >= 17.
   - `registerLiberatorHooks()`: defines pools, registers `LIBERATOR_PLANS` with `guardUses.register({ plans: LIBERATOR_PLANS })`, hooks `dnd5e.preRollDamageV2` for The Right Moment active bonus.
   - `LIBERATOR_PLANS`:
     - `guideTheMasses`:
       - Target: ally within 20 ft (40 ft at 10th level). Action (Bonus Action at 7th level if Action used on another ally; free 1/turn at 17th).
       - Options: `mode` ("advocate", "empower", "uplift"), `targetUuid`.
       - Formulas: Advocate bonus healing = max(2*PB, 2*Liberty); Empower DR = max(PB, Liberty); Uplift bonus damage = max(PB, Liberty).
       - Records target update for GM relay in `receipt.targets`.
       - Awards +1 Liberty (+2 at 17th level Time to Act).
     - `flashOfAnger`:
       - Melee hit rider: spends `data.liberty` (1 to current).
       - Damage formula: `${data.liberty}d6` (or `${data.liberty}d10` at level >= 10). No crit multiplication.
       - Kill refund: if target 0 HP, refunds 1 Liberty.
       - Level 13+ Caught in the Crossfire: becomes Force damage (or chosen Skill damage type) and creates 10-ft splash to secondary creature.
       - Sets `receipt.formula` for manual card roll (no auto-rolling).
     - `theRightMoment`:
       - Consumes all current Liberty on Operator Skill activation.
       - Bonus to saving throw skill damage = +1d6 (d10 at 10th) per Liberty; weapon attack damage = +1d6 (d10) per 2 Liberty.
     - `faceMe`:
       - 10th level Praxis: Press the Attack spending 2 Aggression as Bonus Action; forces Compelled Duel save vs Martial DC (`martialDC(actor)`).
     - `revolution`:
       - 17th level Révolution: 1/Long Rest Action (`revolution` pool).
       - Expends all Liberty: 20-ft burst DEX save vs Martial DC for `${liberty}d12` Force damage.
       - Flags 10-minute benefits: Champion of the Worthy (1/turn free Guide the Masses), Shield of Belief (turn-start THP = Guard level), Time to Act (+1 Liberty on gain/refund).
     - Helper plans/commands: `libertyInaction` (turn end +1 Liberty if no attack/cast/skill used).
   - All plans follow `guardUses` receipt and undo conventions, clamp shortfalls at 0, render roll buttons on cards (no auto-rolling).
B. `ak5e/test/liberator.test.mjs`:
   - Author thorough unit tests using `node:test`, `node:assert/strict`, `guardFixture` and `world` from `ak5e/test/guard-fixture.mjs`.
   - Test identification, Liberty pool initialization and combat turn end inaction, Guide the Masses (all 3 modes: advocate, empower, uplift, range gating 20 ft / 40 ft), Flash of Anger (d6 / d10 scaling, kill refund, splash at 13th), The Right Moment, Rising Tide, Praxis Face Me (2 Aggression, DC), Révolution (17th, burst save, 10-min state), warning shortfalls, "Use anyway" overrides, roll card formulas, and encounter-window undo receipts.
C. Run and verify:
   - Run `node --test ak5e/test/liberator.test.mjs` and ensure all tests pass cleanly.
   - Run `node ak5e/tools/validate-files.mjs` to ensure clean syntax.
D. Write your report to /home/patch/AK5e-Foundry/.agents/teamwork/worker_liberator/handoff.md and send a completion message with test results.
