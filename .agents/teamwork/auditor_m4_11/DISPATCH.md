# DISPATCH — auditor_m4_11

**Agent**: `auditor_m4_11` (`teamwork_preview_auditor`)  
**Working Directory**: `/home/patch/AK5e-Foundry/.agents/teamwork/auditor_m4_11/`  
**Parent Orchestrator**: `orchestrator_10` (`cf5c8a2a-802f-473e-8274-6566de462e7c`)

---

## Assignment: Milestone 4 Forensic Integrity Audit

Perform an exhaustive forensic audit on Milestone 4 of the AK5e Inventor Subclass implementation:

### Target Files:
1. `ak5e/scripts/specialist-uses.mjs`
2. `ak5e/scripts/specialist-sheet.mjs`
3. `ak5e/test/inventor-uses.test.mjs`
4. `ak5e/test/inventor-tableplay-adversarial.test.mjs`
5. `TODO.md`
6. `ak5e/DECISIONS.md`
7. `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md`

### Forensic Integrity Checks:
1. **No Hardcoded Test Results or Dummy Implementations**:
   - Verify that test assertions verify genuine calculations and state mutations rather than hardcoded returns.
   - Verify that plans in `specialist-uses.mjs` execute authentic logic (e.g. `calculateInstability`, `evaluateBreakdownRoll`, `isBrokenEquipment`, `getItemModifications`, `addItemModification`, etc.).
2. **Table-Play Philosophy Integrity**:
   - Verify that confirmation checks (`data.confirmed === true`) cannot be circumvented without throws.
   - Verify that `shortfall` zero clamping actually floors pool values at 0 and records genuine shortfall strings on the receipt.
   - Verify that breakdown rolls and HP loss dice are never auto-evaluated or auto-applied during plan execution.
   - Verify that `validateTarget` performs authentic UUID validation preventing target spoofing.
   - Verify that `inventorCleanup` in `specialistUses.undo` cleanly restores exact prior states (resources, items, broken flags, lockouts).
3. **Execution Verification**:
   - Run: `npm run test:specialist`
   - Run: `node ak5e/tools/validate-files.mjs`
   - Run: `node ak5e/tools/verify-generated-content.mjs`

Deliver a BINARY forensic verdict: **CLEAN** or **INTEGRITY VIOLATION**. Provide line-by-line evidence in `/home/patch/AK5e-Foundry/.agents/teamwork/auditor_m4_11/handoff.md` and notify parent orchestrator via `send_message`.


## 2026-10-20T07:07:34Z
You are auditor_m4_11. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m4_11/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m4_11/DISPATCH.md.
Read original requirements in /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.

MANDATORY INTEGRITY VERIFICATION:
Conduct forensic integrity audit on Milestone 4:
1. Verify no hardcoded test outputs or facade implementations.
2. Verify authentic logic in specialist-uses.mjs (confirmation, non-blocking warnings, zero clamping, awaitingRoll interactive buttons, GM relay validateTarget, undo receipts).
3. Verify genuine state mutations on ActorSheetV2 controls.
4. Run:
   - npm run test:specialist
   - node ak5e/tools/validate-files.mjs
   - node ak5e/tools/verify-generated-content.mjs
5. Deliver a BINARY verdict: CLEAN or INTEGRITY VIOLATION with line-by-line evidence in handoff.md. Send message to orchestrator when done.
