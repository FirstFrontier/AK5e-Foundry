## 2026-10-17T02:44:30Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_8_1/.
You are the Reviewer for Milestone 3: Hookmaster Subclass Implementation & Tests.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Worker handoff report: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m3_8/handoff.md
- Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5585–5679)
- Implementation files:
  - ak5e/scripts/hookmaster-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/scripts/ak5e.mjs
  - ak5e/test/hookmaster.test.mjs

Your Task:
Examine the Hookmaster subclass deliverables objectively and thoroughly:
1. Rule fidelity against Chapter 3 lines 5585–5679 (Hooked weapon conversion, 1st conversion free vs 200 LMD subsequent, Two-Handed + Thrown 30/50 returning, STR for ranged attack/damage, 10 ft pull on <= +1 size, BA Hook attack restriction; Big Boot 10 ft push; King of the Urban Jungle 20 ft pre-movement, flying speed = 2x Hook range, no Hook attacks while flying, immediate melee hit +PB damage & doubled forced movement; Bound in Rope 1 Prowess DEX save vs Martial DC, Grappled condition, Hook locked, BA 15 ft drag, Action hogtie; Wrangler 1 Prowess > +1 size, DEX save vs Martial DC, latch, shared space, Advantage on attacks, optional -5 attack penalty to ignore DR; Hookmaster Prowess triggers; Mighty Push PB/LR STR save vs Martial DC, 8d6 damage, 20 ft knockback, obstacle collision damage; Spider's Essence 50 ft range, Spider's Thread climb speed aura, Swing to Safety reaction; Scorpion Sting 1/LR auto-fail on Grappled/Latched, 6 advantaged attacks +half level bonus damage).
2. Table-play philosophy (WORKFLOW §3.2): confirmations on uses, non-blocking warnings ("Use anyway"), 0-clamping of overspent resources, no auto-rolled dice (interactive roll buttons on cards), unowned target GM relay via validateTarget, encounter-window undo receipts.
3. Code hygiene, regression risk, hook registration idempotency, and test verification.
Run test suites:
- `node --test ak5e/test/hookmaster.test.mjs`
- `node --test ak5e/test/specialist-*.test.mjs ak5e/test/executor*.test.mjs ak5e/test/hookmaster.test.mjs`
- `node ak5e/tools/validate-files.mjs`
- `node ak5e/tools/verify-generated-content.mjs`

Deliverable:
Write a comprehensive review report to `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_8_1/handoff.md` following the Handoff Protocol with an explicit verdict: **APPROVE** or **REQUEST_CHANGES**.
When finished, notify the orchestrator with send_message.
