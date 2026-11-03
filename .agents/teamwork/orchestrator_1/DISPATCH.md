## 2026-10-12T00:05:57Z

You are the Project Orchestrator (teamwork_preview_orchestrator).

Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/
The authoritative user request is recorded in: /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md

## Mission
Implement Batch 1 of the remaining Guard subclasses (Duellist, Liberator, and Lord) for the AK5e Foundry VTT module according to AK5e v1.3.1 Chapter 3 source rules and WORKFLOW.md §3.2 table-play philosophy.

## Key Requirements & Policies
1. Review ORIGINAL_REQUEST.md in full. Adhere strictly to AGENTS.md, WORKFLOW.md, and GEMINI.md.
2. Rules authority is in AK5e_1.3.1_Foundry_Source/ (Chapter 3 for Guard subclasses).
3. Implement R1 (Duellist), R2 (Liberator), R3 (Lord), R4 (Table-play philosophy & engine integration), R5 (Guard Sheet UI & dialogs), and R6 (Verification & validation).
4. Author unit tests: ak5e/test/duellist.test.mjs, ak5e/test/liberator.test.mjs, ak5e/test/lord.test.mjs. Update "test:guard" in package.json.
5. Validate files: node ak5e/tools/validate-files.mjs and node ak5e/tools/verify-generated-content.mjs.
6. Expand and execute the live Foundry V13 Playwright test in ak5e/tools/test-guard-live.mjs via /tmp/run-guard-live.sh on port 30175 using launchTestBrowser().
7. Delegate screenshot inspection to a foundry-validator subagent per AGENTS.md §6.2.
8. Maintain progress.md and BRIEFING.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/) throughout execution.

Report completion back to Sentinel once all acceptance criteria are verified and complete.
