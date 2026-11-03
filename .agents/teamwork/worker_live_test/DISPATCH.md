## 2026-10-12T01:00:51Z
You are the Worker implementing Milestone M5: Live Playwright Browser Test.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_live_test/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read the relevant sections of:
   - /home/patch/AK5e-Foundry/.agents/teamwork/explorer_test_infra/handoff.md (Sections 1.3, 1.4, 1.5, 2.6, 2.7)
4. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root. Adhere strictly to GEMINI.md §5 (Foundry test instance lifecycle, launchTestBrowser, port 30175, process tracking, traps) and WORKFLOW §5.3.
5. Files you own exclusively:
   - ak5e/tools/test-guard-live.mjs (EDIT)
   Do NOT touch other files.

Detailed Implementation Requirements:
A. Expand `ak5e/tools/test-guard-live.mjs`:
   - Keep existing tests intact (Centurion, Crusher, Instructor, Artsblade, Brawler).
   - Add setup and live UI exercise for the 3 new Guard subclasses:
     1. Duellist: "Irene (Duellist)" (Guard level 5, subclass `Guard: Duellist` (`subclass-guard-duellist`), DEX 18, Rapier/Greatsword, Duellist Points 3).
        - Open actor sheet Features tab -> screenshot `24-duellist-sheet-features-tab.png`.
        - Open Guard Controls dialog -> screenshot `25-duellist-guard-controls-dialog.png`.
        - Click Engagement button (`openEngagement` or engagement action) -> screenshot `26-duellist-engagement-prompt.png`.
        - Confirm engagement -> inspect chat card -> screenshot `27-duellist-engagement-chat-card.png`.
     2. Liberator: "Tequila (Liberator)" (Guard level 5, subclass `Guard: Liberator` (`subclass-guard-liberator`), STR 16, CHA 16, Liberty 3).
        - Open actor sheet Features tab -> screenshot `28-liberator-sheet-features-tab.png`.
        - Open Guard Controls dialog -> screenshot `29-liberator-guard-controls-dialog.png`.
        - Trigger Guide the Masses -> screenshot `30-liberator-guide-the-masses-prompt.png`.
        - Confirm -> inspect chat card -> screenshot `31-liberator-guide-the-masses-chat-card.png`.
        - Trigger Flash of Anger -> inspect card with unrolled dice button -> screenshot `32-liberator-flash-of-anger-card-awaiting-roll.png`.
        - Click Roll button on card -> screenshot `33-liberator-flash-of-anger-card-rolled.png`.
     3. Lord: "SilverAsh (Lord)" (Guard level 5, subclass `Guard: Lord` (`subclass-guard-lord`), STR 18, CHA 16, Authority active, Manifestation uses 3).
        - Open actor sheet Features tab -> screenshot `34-lord-sheet-features-tab.png`.
        - Open Guard Controls dialog -> screenshot `35-lord-guard-controls-dialog.png`.
        - Trigger Manifest Will dialog (King's Domain mode prompt) -> screenshot `36-lord-manifest-will-dialog.png`.
        - Confirm -> chat card -> screenshot `37-lord-manifest-will-chat-card.png`.
        - Trigger Make It So -> screenshot `38-lord-make-it-so-prompt.png`.
        - Confirm -> chat card -> screenshot `39-lord-make-it-so-chat-card.png`.
     4. Subclasses Undo Flow:
        - Click Undo button on card or dialog -> confirm undo -> verify state reverted -> screenshot `40-guard-subclasses-undo-flow.png`.
B. Prepare test environment and execute:
   - Prepare clean disposable data copy from `/tmp/ak5e-standard-test`:
     ```bash
     rm -rf /tmp/ak5e-guard-test-data
     cp -r /tmp/ak5e-standard-test /tmp/ak5e-guard-test-data
     node ak5e/tools/install-for-testing.mjs --data-path /tmp/ak5e-guard-test-data --foundry-path /home/patch/FoundryV13 --port 30175
     ```
   - Execute `/tmp/run-guard-live.sh`.
   - Ensure the server exits cleanly, port 30175 is free, and `/tmp/ak5e-guard-live/report.json` contains `errors: []`.
C. Output:
   - Write handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_live_test/handoff.md`.
   - List all generated screenshot paths (e.g. `/tmp/ak5e-guard-live/*.png`) and `report.json` content so they can be delegated for visual review.
