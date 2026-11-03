## 2026-10-13T04:38:16Z
You are auditor_medic_1, the forensic integrity auditor for the AK5e Medic base character class, Physician subclass, and Triage subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/auditor_medic_1/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/AGENTS.md
- Read /home/patch/AK5e-Foundry/WORKFLOW.md
- Read /home/patch/AK5e-Foundry/GEMINI.md
- Read /home/patch/AK5e-Foundry/.agents/teamwork/worker_medic_impl/handoff.md
- Inspect implementation files:
  * `ak5e/scripts/medic-rules.mjs`
  * `ak5e/scripts/medic-features.mjs`
  * `ak5e/scripts/medic-setup.mjs`
  * `ak5e/scripts/medic-progression.mjs`
  * `ak5e/scripts/medic-uses.mjs`
  * `ak5e/scripts/medic-sheet.mjs`
  * `ak5e/scripts/resource-pools.mjs`
  * `ak5e/scripts/ak5e.mjs`
  * `ak5e/test/medic-*.test.mjs`

YOUR OBJECTIVE:
Perform a comprehensive forensic integrity audit to verify authentic implementation and detect any cheating, facades, dummy stubs, or hardcoded test expectations:
1. Static Analysis Checks:
   - Grep for test-specific hardcoding: conditional branches keyed to test names, actor IDs, or synthetic inputs.
   - Check for dummy stubs or facade methods that return fixed strings or empty objects without genuine logic.
   - Verify that calculations (Hit Dice 1d6, base HP 6+CON, higher levels 4+CON min 1, Life Support closed formula 20 + 15 * floor(Level/2), AP table 3–35, Max Art Level 1–9, DC formulas) are genuine mathematical calculations.
2. Runtime & Execution Integrity:
   - Verify that test assertions in `ak5e/test/medic-*.test.mjs` test actual logic and are not trivial tautologies (`assert.ok(true)`).
   - Verify that WORKFLOW §3.2 table play constraints are genuinely implemented in `medic-uses.mjs`:
     * Real confirmation dialogs;
     * Real non-blocking warnings and shortfall clamping at 0;
     * No auto-rolled dice; chat cards render interactive roll buttons;
     * Real automatic GM relay for unowned target modifications;
     * Real encounter-window undo receipts that restore exact prior state.
3. Source Rule Fidelity:
   - Verify that armor proficiencies are Light Shields ONLY (`shl`), with no light/medium/heavy armor.
   - Verify that Physician features (Focused Treatment, Intravenous Line, Hypocritic Oath, Inpatient Care, Surgeon-General) match Chapter 3 lines 4871–4905.
   - Verify that Triage features (On the Scene, Urgent Care Centre, Stop the Flow, Touch of Life and Death, Mobile Hospital) match Chapter 3 lines 5011–5048 and Chapter 1 Mettle rules.
4. Independent Command Execution:
   - Run `npm run test:medic`
   - Run `node ak5e/tools/validate-files.mjs`
   - Run `node ak5e/tools/verify-generated-content.mjs`
   - Verify zero exit errors.

DELIVERABLE:
Write your forensic audit report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/auditor_medic_1/handoff.md`
State your verdict explicitly: CLEAN or INTEGRITY VIOLATION.
Send a message to orchestrator with your verdict and findings.
