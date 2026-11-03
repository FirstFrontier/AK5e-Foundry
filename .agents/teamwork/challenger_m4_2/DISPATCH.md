## 2026-10-12T22:51:00Z
You are challenger_m4_2, a code-executing adversarial verifier for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_2/

MANDATORY FIRST STEP:
Read the following files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/handoff.md
7. Specialist source implementation files in `ak5e/scripts/` and tests in `ak5e/test/`.

YOUR MISSION:
Empirically stress-test Specialist setup idempotency and progression invariants.
Author and execute a stress test script (e.g. `ak5e/tools/stress-specialist-progression.mjs` or in your report) covering:
1. Setup Idempotency:
   - Repeated runs of `applySpecialistSetup` never create duplicate items or wipe authored items.
   - Preserves custom weapons, armor, or abilities.
2. Progression Invariants:
   - Level 1 to 20 progression preserves exact HP math (`8 + con` at lv 1, `1d8/5 + con` at lvs 2-20).
   - Prevents double-counting HP or ASIs across levels.
   - Starting equipment and cash: starting equipment granted flag ensures cash (1300 CP) and gear are NOT re-granted on level-up.
3. Choice Validation Permutations:
   - Permute invalid saving throws (e.g. Dex + Str, or Wis + Cha without Dex, or 2 saves from Wis/Cha).
   - Permute invalid skill counts (2 skills, 4 skills, unlisted skill like Athletics).
   - Permute invalid rolled HP (0, 9, negative, float).
   - Permute invalid ASIs (+3 to one stat, +2 to one and +1 to another, or ASI pushing stat to 21).
   - ContextKey tampering (mismatched plan rejected).

Run your stress tests and existing test commands:
- `node ak5e/tools/stress-specialist-progression.mjs` (if created) or test suite commands
- `npm run test:specialist`
- `npm run test:base-classes`

DELIVERABLE:
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_2/handoff.md
Your report must state an explicit verdict: **APPROVE** or **REQUEST_CHANGES**.
When finished, send a message to orchestrator with your verdict.

## 2026-10-12T23:03:16Z
You are challenger_m4_2, a code-executing adversarial verifier for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_2/
Read your task description in: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_2/DISPATCH.md.
Also read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md and /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/handoff.md.
Empirically stress-test Specialist setup idempotency and progression invariants: multiple runs, authored item retention, HP/ASI progression across levels 1-20, choice validation permutations, contextKey tampering, and starting gear retention on level-up.
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_2/handoff.md with explicit verdict (APPROVE / REQUEST_CHANGES).
When finished, send a message with your verdict to orchestrator.
