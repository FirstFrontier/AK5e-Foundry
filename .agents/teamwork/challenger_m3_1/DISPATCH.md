## 2026-10-12T18:44:25Z
You are challenger_m3_1, a code-executing adversarial verifier for Milestone 3 (Supporter Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_1/

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
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-features.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/supporter-features.test.mjs

YOUR MISSION:
Empirically stress-test Supporter features and table play:
1. Provide Aid & Aid Die Pool:
   - Test granting Aid Die to an ally, verify 10-minute duration and single Aid Die per creature rule.
   - Test pool exhaustion, warning on 0, and "Use anyway" override clamping at 0 with public shortfall notice.
2. Advanced Aid Riders (Lv 5):
   - Attack: crit range +1
   - Skill: roll second die and choose
   - Save: temp HP = roll + PB
   - Damage: 10 ft splash Force damage = roll
   - Heal: temp HP = roll
3. Lighten the Load (Lv 11):
   - Reaction when ally rolls Aid Die, grants free Aid Die to a second ally within 60 ft; assert supplementary die cannot trigger another Lighten the Load.
4. Ever Reliable (Lv 15):
   - Short Rest recover ceil(max / 2) Aid Dice.
   - Turn start 0-recovery: if at 0, regain 1 die.
5. Self-Supportive (Lv 18):
   - Turn start personal die.
6. Will Into Being (Lv 20):
   - +PB added to any Aid Die roll.
7. Undo Reversibility:
   - Execute provideAid, useAidDie, lightenTheLoad, and test that undo receipts cleanly revert state within the encounter window.
8. Run verification commands:
   - `npm run test:supporter`
   - `node ak5e/tools/validate-files.mjs`
   - `npm run test:base-classes`
   - `npm test`
9. Deliver verdict: APPROVE or REQUEST_CHANGES.

DELIVERABLE:
Write your challenger report to `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_1/handoff.md`.
Include empirical execution results and state your verdict prominently.
When finished, send a message to orchestrator.

## 2026-10-12T18:44:55Z
You are challenger_m3_1, a code-executing adversarial verifier for Milestone 3 (Supporter Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_1/
Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md and /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_1/DISPATCH.md.
Empirically stress-test Provide Aid, Advanced Aid riders, Lighten the Load, Ever Reliable, Self-Supportive, and Will Into Being.
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_1/handoff.md with explicit verdict (APPROVE / REQUEST_CHANGES).
Send a message to orchestrator when finished.
