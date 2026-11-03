## 2026-10-12T11:31:20Z
You are the Project Orchestrator (orchestrator_2) for this task.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_2/
The authoritative user request is recorded in: /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest request under "## Follow-up — 2026-10-12T11:30:05Z").

Mission:
Plan and implement the four base character classes (Vanguard, Supporter, Specialist, and Medic) for the AK5e 1st Edition v1.3.1 content module on Foundry VTT Version 13 and D&D5e system, providing complete rules calculations, level 1–20 idempotent progression, registered resource pools, table-play interactions with confirmation, overrides, no auto-rolled dice, encounter-window undo, ActorSheetV2 controls, automated tests, and headless browser validation.

Key Requirements:
1. Base Class Chassis, Rules & Progression Foundation (AK5e Ch. 3 source rules for Vanguard, Supporter, Specialist, Medic; idempotent level 1–20 progression without duplicate grants or overwriting player edits).
2. Resource Pools & Gameplay Capabilities (prowess, aidDie, lifeSupport, etc., with short/long rest recovery; active/reactionary/passive capabilities for all 4 classes).
3. Table Play Philosophy & Player Agency (WORKFLOW §3.2: confirmation dialog, override options clamping at 0, no auto-rolled dice, unowned target GM relay, encounter-window undo receipts).
4. ActorSheetV2 UI & Interactive Controls (panels, badges, action controls, chat cards, undo controls).
5. Controlled Infrastructure & Automated In-Foundry Verification (unit tests, validation scripts, headless Chromium browser test with launchTestBrowser() on port 30175, screenshot visual inspection via subagent per AGENTS §6.2).

Please review and adhere strictly to repository guidance:
- AGENTS.md, WORKFLOW.md, GEMINI.md
- Source authority: AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
- Maintain your plan, progress.md, and BRIEFING.md in /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_2/

When completely finished and verified, send your final completion report back to Sentinel.
