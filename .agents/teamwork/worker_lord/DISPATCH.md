## 2026-10-12T00:38:00Z
You are the Worker implementing Milestone M3: Lord Subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_lord/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read the relevant sections of:
   - /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules/handoff.md (Lord rules)
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/handoff.md (Lord architecture & blueprints)
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_test_infra/handoff.md (Lord test blueprint)
4. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root. Adhere strictly to WORKFLOW.md §3.2 (no auto-rolled dice, table-play confirmation, warning shortfalls clamping at 0 with 'Use anyway', unowned target relay, encounter-window undo receipts).
5. Files you own exclusively:
   - ak5e/scripts/lord-features.mjs (CREATE)
   - ak5e/test/lord.test.mjs (CREATE)
   Do NOT touch other files.

Detailed Implementation Requirements:
A. `ak5e/scripts/lord-features.mjs`:
   - `isLord(actor)`: returns true if guardEnabled(actor) and guardBranch(actor) === "lord".
   - `defineLordPools()`:
     - `manifestation`: max `@prof` (or standard PB formula), initial "max", recovery Long Rest.
     - `forceOfWill`: max `@prof`, initial "max", recovery Long Rest, level >= 13.
   - `registerLordHooks()`: defines pools, registers `LORD_PLANS` with `guardUses.register({ plans: LORD_PLANS })`.
     - Hooks `dnd5e.preRollAttackV2`: When Manifestation is active, melee weapons gain Range 30/-, STR modifier is used for ranged attack and damage rolls.
     - Hooks `dnd5e.preRollDamageV2`: Weapon attacks add +CHA mod Force (or attuned) damage during Manifestation; opposite attack deals +1d6 damage when consuming mark.
   - `LORD_PLANS`:
     - `toggleAuthority`: Sets `flags.ak5e.lord.hasAuthority` (gain or loss).
       - Gain triggers: Elite/Leader kill damaged since last turn, 2+ kills in turn, 1-shot full HP kill.
       - Loss triggers: 0 HP, end-of-turn save affliction, Prone at end of turn, Initiative roll.
       - Authority benefits: 1d8 Temporary HP at turn start; Overruled saves (INT, WIS, CHA at start and end of turn).
     - `manifestDestiny`: Press the Attack spending 3 Aggression to prevent loss of Authority.
     - `manifestWill`: Spends 1 `manifestation` use, activates 1-minute state.
       - Mode selection: King's Domain mode ("castle" or "pursuit").
       - Castle Doctrine (4th level): 15-ft zone. Reaction move half speed and melee attack, refund reaction on non-elite hit. Authority reduces speed by half (or 0 with WIS save vs Martial DC at 17th).
       - Pursuit of Power (4th level): 1/turn on hit, full movement without AoO, 2x jump. Authority removes 1/turn limit. Passive CHA damage to adjacent foes at 17th.
       - Marks: Attacks apply Ranged or Melee mark; opposite attack expends mark for +1d6 damage (+1d6 with 10-ft splash at 17th).
     - `willAttunement`: 10-minute ritual to change Manifestation damage type to an owned Operator Skill damage type.
     - `makeItSo` (10th level): Spends 1 `manifestation` use to add CHA mod to d20 roll, treated as Proficient. With Authority: treated as having Expertise! At 17th level: reroll once on failure.
     - `aLeaderLeads` (10th level): Press the Attack spending 1+ Aggression on Authority gain to grant Special Inspiration to allies (1 minute).
     - `forceOfWill` (13th level): Spends 1 `forceOfWill` use, 1/turn.
       - Fire/Psychic/Force/Thunder: 10-ft burst 3d6 DEX save vs Martial DC.
       - Bludgeoning/Piercing/Slashing/Radiant: 50-ft line 8d6 DEX save vs Martial DC.
       - Acid/Cold/Lightning/Necrotic/Poison: Melee hit rider 6d6 CON save vs Martial DC.
     - `divineRight` (17th level): Flags upgrade to Authority features.
   - All plans follow `guardUses` receipt and undo conventions, clamp shortfalls at 0, render roll buttons on cards (no auto-rolling).
B. `ak5e/test/lord.test.mjs`:
   - Author thorough unit tests using `node:test`, `node:assert/strict`, `guardFixture` and `world` from `ak5e/test/guard-fixture.mjs`.
   - Test identification, Authority state & acquisition/loss conditions, Overruled saves, Manifest Destiny (3 Aggression), Manifest Will pool & weapon range/STR/CHA scaling, Will Attunement, King's Domain modes (Castle Doctrine, Pursuit of Power), By Lordly Decree (Make It So CHA+Prof/Expertise, A Leader Leads), Force of Will (3 element categories and formulas), Divine Right (17th level), warning shortfalls, "Use anyway" overrides, and encounter-window undo receipts.
C. Run and verify:
   - Run `node --test ak5e/test/lord.test.mjs` and ensure all tests pass cleanly.
   - Run `node ak5e/tools/validate-files.mjs` to ensure clean syntax.
D. Write your report to /home/patch/AK5e-Foundry/.agents/teamwork/worker_lord/handoff.md and send a completion message with test results.
