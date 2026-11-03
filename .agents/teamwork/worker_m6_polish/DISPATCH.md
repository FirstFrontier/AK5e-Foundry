## 2026-10-12T01:20:52Z
You are the Worker implementing Milestone M6: Polish & Documentation.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m6_polish/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root.
4. Files you own exclusively:
   - ak5e/scripts/guard-sheet.mjs (for minor cosmetic spacing fix on line 55 between Authority and Manifestation spans: add ' · ' separator)
   - TODO.md (update completed tasks for Guard Subclasses Batch 1: Duellist, Liberator, Lord)
   - ak5e/DECISIONS.md (document rules decisions and mappings for Duellist, Liberator, Lord)
   Do NOT touch other files.

Detailed Implementation Requirements:
A. `ak5e/scripts/guard-sheet.mjs`:
   - Line 55: Fix the cosmetic badge spacing between `Authority: Active/Inactive` and `Manifestation: ${value}/${max}` by inserting ` · ` or a space so they don't run together.
B. `TODO.md`:
   - Inspect existing `TODO.md` and update progress: record Guard Subclasses Batch 1 (Duellist, Liberator, Lord) implementation, unit test suites (90 passing tests), and live Foundry Playwright verification on port 30175 with 40 screenshots.
C. `ak5e/DECISIONS.md`:
   - Document the rulings and mapping decisions for Batch 1:
     - Duellist: Duelling Blades finesse property for Greatswords/Polearms via preRoll hooks; Rules of Engagement points ledger (0-10 max, entry conditions, level 10 +2 upgrade, non-heavy weapon bonus); Parry reducing 1st Forestall/round reaction cost to 0 and -1 Aggression; 9 Engagements; Grand Challenge & Coup de Grâce unreduced 8d8 damage.
     - Liberator: Liberty resource pool (0-6 max, combat generation via turn-end inaction or Guide the Masses); Guide the Masses scaling (Advocate max(2*PB, 2*Liberty), Empower/Uplift max(PB, Liberty), 20 ft / 40 ft range); Flash of Anger melee damage rider (d6/d10, no crit multiplication, 1 Liberty kill refund, 13th Force/Arts and 10-ft splash); Rising Tide charging methods; Praxis Face Me Compelled Duel with Martial DC; Révolution (17th) burst damage and 10-min benefits.
     - Lord: Authority state (`flags.ak5e.lord.hasAuthority`, gain/loss triggers, Overruled saves, turn-start 1d8 THP); Manifestation pool (`@prof` uses, Long Rest recovery, 1-min duration, melee Range 30/-, STR ranged, +CHA damage); Will Attunement ritual; King's Domain modes (Castle Doctrine reaction move+attack+refund, Pursuit of Power no AoO full move); By Lordly Decree (Make It So CHA+PB or CHA+2*PB Expertise with Authority); Force of Will (3 element groups: 3d6 burst, 8d6 line, 6d6 melee hit).
D. Run and verify:
   - `npm run test:guard` (verify 90 tests pass cleanly).
   - `node ak5e/tools/validate-files.mjs` (verify all files pass syntax check).
   - `node ak5e/tools/verify-generated-content.mjs` (verify 0 content regressions).
E. Write report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m6_polish/handoff.md` and send completion message.
