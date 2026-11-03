## 2026-10-24T04:31:52Z
You are worker_live_11, an expert AK5e Foundry VTT test automation engineer.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_live_11

MANDATORY INTEGRITY & VERIFICATION RULES:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Integration handoff: /home/patch/AK5e-Foundry/.agents/teamwork/worker_integration_11/handoff.md
- Reference previous live test runner: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m5_8/handoff.md
- Test harness files:
  - ak5e/tools/test-browser.mjs
  - ak5e/tools/test-specialist-live.mjs
  - ak5e/tools/install-for-testing.mjs
- Project contracts: WORKFLOW.md §5.2/§5.3, GEMINI.md §5, AGENTS.md §6.2

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/tools/test-specialist-live.mjs
DO NOT modify any production script files.

TASK SCOPE (Milestone 5 - Part 1):
1. Expand `ak5e/tools/test-specialist-live.mjs` to provision and test characters for the three newly implemented Specialist branches:
   - **Skyranger**: Create Skyranger actor (e.g. Level 5 with Flight Suit equipped, Air Superiority doctrine). Render sheet verifying Fuel badge (`Fuel: X / Y`) and Active Doctrine badge. Trigger Take Off, AA Missile, Evasive Manoeuvres, verify chat cards and interactive roll buttons, execute encounter-window undo.
   - **Dollkeeper**: Create Dollkeeper actor (Level 5) with Living Doll companion construct. Render sheet verifying Doll status badge (`Doll: Active / Destroyed`) and Mistaken Identity badge. Trigger Command Doll, Musical Chairs, verify chat card, execute encounter-window undo.
   - **Trapmaster**: Create Trapmaster actor (Level 5). Render sheet verifying Traps pool badge (`Traps: X / Y`) and Trap DC badge (`Trap DC: Z`). Trigger Plant Trap (e.g. Explosive Trap), Warning Point, verify chat card, execute encounter-window undo.
2. Ensure the test captures clear screenshots for each branch into `/tmp/ak5e-specialist-evidence/` (or `/tmp/ak5e-specialist-branches-evidence/`):
   - Skyranger sheet & controls
   - Skyranger Take Off / AA Missile chat card
   - Dollkeeper sheet & controls
   - Dollkeeper Command / Musical Chairs chat card
   - Trapmaster sheet & controls
   - Trapmaster Plant Trap chat card
   - Undo state chat card
3. Set up and execute the live test session per GEMINI.md §5:
   - Ensure port 30175 is free.
   - Copy/install test data to a unique directory under `/tmp/`.
   - Start Foundry V13 headless with bash signal traps (`AK5E_TEST_PID`, EXIT/INT/TERM).
   - Execute `test-specialist-live.mjs` using `launchTestBrowser()`.
   - Ensure zero console/page errors (`report.errors.length === 0`).
   - Gracefully shut down the server and verify port 30175 is released.
4. Deliver handoff report with exact screenshot paths, command outputs, server logs, and verification evidence.

Deliverables:
- Updated `ak5e/tools/test-specialist-live.mjs`
- Captured screenshots in evidence directory
- Clean `report.json` with `errors: []`
- Clean port release
- Write handoff.md in `/home/patch/AK5e-Foundry/.agents/teamwork/worker_live_11/handoff.md` and send message to orchestrator_11.


## 2026-10-24T04:39:11Z
**Context**: Milestone 5 Live Browser Test Automation
**Content**: Checking in on status — please report your progress on expanding `ak5e/tools/test-specialist-live.mjs` and running the headless Foundry V13 browser session. Update your progress.md timestamp and let me know if you need any assistance.
**Action**: Reply with your current progress and estimated time to completion.


## 2026-10-24T04:39:39Z
**Context**: Milestone 5 Live Browser Test Automation
**Content**: Status received. Harness verification confirmed. Proceed with executing the test scenarios, capturing screenshots, and recording report.json with zero errors.
**Action**: Deliver handoff.md with screenshot paths and execution logs upon completion.
