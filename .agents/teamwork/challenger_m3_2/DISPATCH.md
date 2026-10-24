## 2026-10-12T18:44:35Z
You are challenger_m3_2, a code-executing adversarial verifier for Milestone 3 (Supporter Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_2/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 6548–6692)
7. Worker handoff: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m3/handoff.md
8. Authored files:
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-setup.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-progression.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/supporter-progression.test.mjs

YOUR MISSION:
Empirically stress-test Supporter setup and progression invariants:
1. Setup Idempotency:
   - Run `applySupporterSetup` 5 times sequentially on the same mock actor; assert item count does not grow.
   - Pre-populate an authored item with custom description/name; assert it is preserved and not overwritten.
2. Progression Idempotency:
   - Incremental level-up 1 -> 20.
   - Re-run progression at level 20; assert HP and ASIs are NOT double-counted.
   - Starting equipment and currency (1300 CP) must NOT be re-granted or duplicated on level-up.
   - ContextKey tampering: corrupt contextKey and assert rejection.
3. Choice & Boundary Validation:
   - Save choices: Assert that selecting < 2, > 2, duplicates (e.g. `["con", "con"]`), or invalid saves (e.g. `["dex", "str"]`) are rejected or flagged in pending.
   - Skill choices: Assert that selecting < 3, > 3, duplicates (e.g. `["arc", "arc", "arc"]`), or invalid skills (e.g. Athletics) are rejected.
   - Rolled HP: Assert that values > 6 are clamped to [1, 6] or rejected.
   - ASI increases: Assert that invalid schemes (+3 or duplicate ability) are rejected.
4. Run verification commands:
   - `npm run test:supporter`
   - `node ak5e/tools/validate-files.mjs`
   - `npm run test:base-classes`
   - `npm test`
5. Deliver verdict: APPROVE or REQUEST_CHANGES.

DELIVERABLE:
Write your challenger report to `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_2/handoff.md`.
Include empirical execution results and state your verdict prominently.
When finished, send a message to orchestrator.
