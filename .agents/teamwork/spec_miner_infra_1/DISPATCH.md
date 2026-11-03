## 2026-10-16T08:48:08Z
You are a Read-only Specification Miner for Test Infrastructure and Table Play for the AK5e Specialist project.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_infra_1/
You must create your working directory metadata files (BRIEFING.md, progress.md, handoff.md) inside this directory.

Read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the section ## 2026-10-16T08:44:15Z).
Read repository policies:
/home/patch/AK5e-Foundry/AGENTS.md (especially §5, §6.2)
/home/patch/AK5e-Foundry/WORKFLOW.md (especially §3.2, §5.2, §5.3, §8)
/home/patch/AK5e-Foundry/GEMINI.md (especially §3, §4, §5, §6)

Your Objective:
Investigate and document all test harness requirements, table-play guardrails, and verification tools:
1. WORKFLOW §3.2 Table-Play requirements for Specialist:
   - How `createPlayUses({ ns: "specialistUses", label: "Specialist" })` operates.
   - Confirm before spending / mutating; cancel leaves state untouched.
   - Warnings non-blocking with "Use anyway"; resource shortfalls clamped at 0 with public chat card shortfall notices.
   - No auto-rolled dice: chat cards must render interactive roll buttons (`receipt.formula`, attack/save metadata) clicked by document owners.
   - Automatic GM relay for unowned target modifications via `validateTarget` / `relayTargetOperation`.
   - Encounter-window undo receipts under `flags.ak5e.specialistUses`.
2. Existing live browser test patterns:
   - Inspect `ak5e/tools/test-browser.mjs`, `ak5e/tools/test-medic-live.mjs`, `ak5e/tools/test-guard-live.mjs`, and `/tmp/run-*-live.sh`.
   - Document how `launchTestBrowser()` is invoked, how the disposable `/tmp` user data copy of `standard-test` world is set up and cleaned up on port 30175, and how process signals (EXIT, INT, TERM) are trapped.
   - Identify what `ak5e/tools/test-specialist-live.mjs` must exercise (Base Specialist, Executor, Hookmaster, Infuser sheet panels, dialogs, rolls, GM relay, undo) and what screenshots must be captured.
3. Subagent visual inspection protocol per AGENTS.md §6.2:
   - What checks must be performed on screenshots (missing text/images, overflow/clipping, dark-theme readability, roll controls, permissions, links).
   - PASS / FAIL / UNCERTAIN criteria.
4. Static check requirements:
   - `node ak5e/tools/validate-files.mjs`
   - `node ak5e/tools/verify-generated-content.mjs`
   - `npm test` / focused node test commands.

Scope Boundaries:
- Read-only: DO NOT edit or modify any repository files.
- Produce your comprehensive report at:
  `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_infra_1/handoff.md`
- When complete, call send_message to report your handoff path and key findings.
