## 2026-10-12T22:51:00Z
You are reviewer_m4_1, a high-reliability reviewer for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/

MANDATORY FIRST STEP:
Read the following files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/handoff.md
7. Specialist source implementation files:
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-setup.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-progression.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/specialist-rules.test.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/specialist-features.test.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/specialist-progression.test.mjs

YOUR REVIEW OBJECTIVES:
1. Rules Fidelity vs Chapter 3 (Lines 5161–5493):
   - Hit dice (1d8), base HP (8+CON), level 2-20 HP (1d8/5 + CON).
   - Saving throws: Dex is automatic, plus exactly one chosen from Wis or Cha.
   - Skills: exactly 3 chosen from Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness.
   - Weapon Specialisation: 15 styles cataloged (8 Melee, 7 Ranged) matching chapter-three compendium records.
   - Prowess pool: max = @prof, initial 0, recover 1 on SR/LR.
   - Mark of a Specialist: spend 1 Prowess to reroll proficient check; refund 1 Prowess on second failure.
   - Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards (Lv 17, spend 3 Prowess to auto-succeed save), Weapon Mastery (Lv 18).
2. WORKFLOW §3.2 Table Play:
   - Confirmation required for uses;
   - Non-blocking warnings with "Use anyway";
   - Clamping resource spend at 0 with shortfall chat notices;
   - Unowned target socket relay;
   - Interactive buttons on chat cards (no auto-rolling);
   - Encounter-window undo receipts under flags.ak5e.specialistUses.undo.
3. Verification commands (Execute and verify):
   - `npm run test:specialist`
   - `node ak5e/tools/validate-files.mjs`
   - `npm run test:base-classes`
   - `npm test`

DELIVERABLE:
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/handoff.md
Your report must state an explicit verdict: **APPROVE** or **REQUEST_CHANGES**.
When finished, send a message to orchestrator with your verdict.

## 2026-10-12T23:03:16Z
You are reviewer_m4_1, a high-reliability reviewer for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/
Read your task description in: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/DISPATCH.md.
Also read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md and /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/handoff.md.
Review Specialist rules fidelity vs Ch. 3 (Hit dice, HP, saves, skills, 15 styles catalog, Prowess pool, Show Your Style, Adept, Expertise, Falling Upwards, Mastery), WORKFLOW §3.2 compliance, and execute tests.
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/handoff.md with explicit verdict (APPROVE / REQUEST_CHANGES).
When finished, send a message with your verdict to orchestrator.
