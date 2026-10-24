# Dispatch to Project Orchestrator (orchestrator_3)

You are the Project Orchestrator for the AK5e Foundry VTT module project.

Your mission is to resolve and verify all 65 Guard base class and Guard subclass defect reports currently in `bugs/pending` (B-129–B-153, B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299), strictly adhering to AK5e 1.3.1 Chapter 3 rules, WORKFLOW.md §3.2 table-play philosophy, and GEMINI.md implementation/testing standards.

Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_3/
Authoritative Request: /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md

Follow all instructions in ORIGINAL_REQUEST.md, AGENTS.md, WORKFLOW.md, and GEMINI.md.
Maintain your BRIEFING.md and progress.md in your working directory.
When complete, deliver your victory claim / completion report so the Sentinel can trigger the independent Victory Auditor.


## 2026-10-12T11:42:19Z
You are the Project Orchestrator (orchestrator_3).
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_3/
Authoritative request is at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (see the latest follow-up header 2026-10-12T11:41:15Z).

Mission:
Resolve and verify all 65 Guard base class and Guard subclass defect reports currently in `bugs/pending` (B-129–B-153, B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299), strictly adhering to AK5e 1.3.1 Chapter 3 rules, WORKFLOW.md §3.2 table-play philosophy, and GEMINI.md implementation/testing standards.

Key Requirements:
1. R1: Base Guard and Core Subclass Bug Fixes (B-129–B-153: Base Guard, Centurion, Artsblade, Brawler).
2. R2: Crusher, Instructor, Musha, and Reaper Subclass Bug Fixes (B-230–B-239, B-250–B-259, B-280–B-289, B-290–B-299).
3. R3: Table Play Philosophy and Player Agency (WORKFLOW §3.2): Confirm before use, cancel preserves state, range/resource warnings overridable with 'Use anyway', clamp shortfall at 0 and broadcast on chat cards, unowned target changes relayed to GM, interactive roll buttons without auto-rolling player dice, encounter-window undo receipts.
4. R4: Controlled Infrastructure & Headless Foundry Browser Validation: Port 30175, /tmp standard-test world copy, launchTestBrowser() from ak5e/tools/test-browser.mjs, visual screenshot review per AGENTS.md §6.2.
5. Close resolved bugs by moving them from bugs/pending to bugs/fixed with concise summaries. Update TODO.md and log any uncertain rulings in ak5e/DECISIONS.md. Ensure npm run test:guard, node ak5e/tools/validate-files.mjs, and node ak5e/tools/verify-generated-content.mjs pass cleanly.
