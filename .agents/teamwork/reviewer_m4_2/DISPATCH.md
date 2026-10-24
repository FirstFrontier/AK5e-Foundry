## 2026-10-12T22:51:00Z
You are reviewer_m4_2, an independent high-reliability reviewer for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/

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
1. Progression Idempotency & Invariants:
   - Setup: `previewSpecialistSetup` and `applySpecialistSetup` retain existing authored items and custom abilities.
   - Hashing: `contextKey` hash prevents applying stale or mismatched preview plans.
   - Starting Equipment: Tracked in `state.startingEquipmentGranted` so level-ups or re-runs NEVER duplicate equipment items or grant additional cash.
   - Cash Option: Exactly 1,300 CP (`writes["system.currency.cp"] = beforeCp + 1300`), not 130,000 CP.
   - Choice Validation: Strict rejection when choices violate schema (wrong number of saves, wrong skill count, invalid skill IDs, rolled HP outside [1, 8], ASIs exceeding +2 total or pushing ability above 20).
2. Edge cases and concurrency:
   - Level 20 max level clamping.
   - Prowess pool overMax / 0-floor handling.
   - Falling Upwards with < 3 Prowess: warns but allows "Use anyway", clamping pool at 0.
   - Undo receipts properly restore before-state and can be repeatedly invoked safely.
3. Verification commands (Execute and verify):
   - `npm run test:specialist`
   - `node ak5e/tools/validate-files.mjs`
   - `npm run test:base-classes`
   - `npm test`

DELIVERABLE:
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/handoff.md
Your report must state an explicit verdict: **APPROVE** or **REQUEST_CHANGES**.
When finished, send a message to orchestrator with your verdict.

## 2026-10-12T23:03:16Z
You are reviewer_m4_2, an independent high-reliability reviewer for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/
Read your task description in: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/DISPATCH.md.
Also read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md and /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/handoff.md.
Review Specialist progression idempotency, starting equipment tracking across level-ups, choice validation error paths, cash option (1,300 CP), table-play uses, and execute tests.
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/handoff.md with explicit verdict (APPROVE / REQUEST_CHANGES).
When finished, send a message to orchestrator with your verdict.
