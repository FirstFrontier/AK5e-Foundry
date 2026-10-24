## 2026-10-24T04:44:17Z
You are worker_live_11_2, an expert AK5e Foundry VTT test automation engineer replacing worker_live_11.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_live_11_2

MANDATORY INTEGRITY & VERIFICATION RULES:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Integration handoff: /home/patch/AK5e-Foundry/.agents/teamwork/worker_integration_11/handoff.md
- Previous live test runner handoff: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m5_8/handoff.md
- Existing live runner script: ak5e/tools/test-specialist-live.mjs
- Existing test browser launcher: ak5e/tools/test-browser.mjs
- Project contracts: WORKFLOW.md §5.2/§5.3, GEMINI.md §5, AGENTS.md §6.2

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/tools/test-specialist-live.mjs
DO NOT modify any production script files.

TASK SCOPE:
1. Update `ak5e/tools/test-specialist-live.mjs` to provision and live-test the three new Specialist branches alongside existing tests:
   - **Skyranger**: Create Level 5 Skyranger with Flight Suit, Air Superiority doctrine. Render sheet and capture screenshot verifying Fuel (`Fuel: 3 / 3`) and Doctrine badges. Trigger Take Off and AA Missile, capture screenshot of interactive chat cards with clickable roll buttons, execute encounter-window undo and verify state reversion.
   - **Dollkeeper**: Create Level 5 Dollkeeper with Living Doll construct. Render sheet and capture screenshot verifying Doll status (`Doll: Active`) and Mistaken Identity badges. Trigger Command Doll and Musical Chairs, capture screenshot of chat card, execute encounter-window undo.
   - **Trapmaster**: Create Level 5 Trapmaster. Render sheet and capture screenshot verifying Traps pool (`Traps: 6 / 6`) and Trap DC badges. Trigger Plant Trap (Explosive Trap) and Warning Point, capture screenshot of chat card, execute encounter-window undo.
   - Capture clean screenshots into `/tmp/ak5e-specialist-evidence/`:
     - `18-skyranger-sheet.png`
     - `19-skyranger-takeoff-card.png`
     - `20-dollkeeper-sheet.png`
     - `21-dollkeeper-command-card.png`
     - `22-trapmaster-sheet.png`
     - `23-trapmaster-plant-trap-card.png`
     - `24-specialist-undo-executed.png`
2. Set up and execute the live test session per GEMINI.md §5:
   - Check that port 30175 is free.
   - Prepare disposable `/tmp/ak5e-specialist-test-data/` User Data copy of `standard-test` world and run `npm run install:foundry`.
   - Launch Foundry V13 headless server with bash traps (`AK5E_TEST_PID`, EXIT/INT/TERM traps).
   - Execute `test-specialist-live.mjs` using `launchTestBrowser()`.
   - Ensure `report.json` contains `errors: []` with zero console/page errors.
   - Gracefully shut down the server and verify port 30175 is released.
3. Deliver handoff report in `/home/patch/AK5e-Foundry/.agents/teamwork/worker_live_11_2/handoff.md` with screenshot paths, commands, exit codes, and server logs.
4. Send a completion message back to parent orchestrator_11 (`f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07`).
