## 2026-10-12T01:26:13Z
You are the Forensic Integrity Auditor (teamwork_preview_auditor) for Guard Subclasses Batch 1 (Duellist, Liberator, and Lord).
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m6/

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read PROJECT.md at /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_1/PROJECT.md.
3. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root.
4. Perform an exhaustive forensic integrity audit across all files implemented/modified for Guard Subclasses Batch 1:
   - Implementation files:
     - ak5e/scripts/duellist-features.mjs
     - ak5e/scripts/liberator-features.mjs
     - ak5e/scripts/lord-features.mjs
     - ak5e/scripts/guard-uses.mjs
     - ak5e/scripts/guard-sheet.mjs
     - ak5e/scripts/guard-rules.mjs
     - ak5e/scripts/ak5e.mjs
   - Test files:
     - ak5e/test/duellist.test.mjs
     - ak5e/test/liberator.test.mjs
     - ak5e/test/lord.test.mjs
     - ak5e/tools/test-guard-live.mjs
   - Config & Docs:
     - package.json
     - TODO.md
     - ak5e/DECISIONS.md
5. Audit Checks:
   A. Integrity Forensics:
      - Static Analysis: Check for dummy/facade implementations, stubbed returns, mock bypasses, or hardcoded expected values designed to trick tests.
      - Implementation Authenticity: Verify that rules logic (Duellist points ledger, finesse weapons, Parry/Riposte, 9 Engagements; Liberator Liberty pool, Guide the Masses, Righteous Outburst, Rising Tide, Face Me, Révolution; Lord Authority triggers, Manifest Will, King's Domain, Make It So, Force of Will) is genuine, calculations are mathematically sound according to Ch. 3 source rules, and state modifications are durable.
      - Table-Play & WORKFLOW §3.2 Compliance: Verify confirm before spend, cancellation changes nothing, ability checks/saves require no confirmation, dice rolls render interactive roll buttons (NO auto-rolled dice), resource shortfalls warn with 'Use anyway' and clamp at 0 without going negative, unowned targets relay via active GM, and encounter-window undo receipts are recorded under flags.ak5e.guardUses.undo.
   B. Automated Verification:
      - Run `npm run test:guard` and verify all 90 tests pass genuinely.
      - Run `node ak5e/tools/validate-files.mjs` and verify clean syntax across all 213 files.
      - Run `node ak5e/tools/verify-generated-content.mjs` and verify 0 content regressions.
6. Deliverable:
   Write a comprehensive forensic audit report to `/home/patch/AK5e-Foundry/.agents/teamwork/auditor_m6/handoff.md`.
   State your binary verdict: CLEAN or INTEGRITY VIOLATION.
7. Send a message to the orchestrator with your verdict and evidence.
