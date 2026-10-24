# DISPATCH — challenger_m4
Timestamp: 2026-10-20T03:53:35Z
Role: Table-Play Adversarial Challenger
Working Directory: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4

## Objective
Author adversarial stress tests in `ak5e/test/inventor-tableplay-adversarial.test.mjs` attacking table-play philosophy (WORKFLOW.md §3.2), GM relay, interactive chat card buttons, and undo receipt integrity.

## Stress Vectors to Attack:
1. Confirm-Before-Spend & Cancel Invariance:
   - Canceling any confirmation dialog commits zero changes to documents, flags, or resource pools.
2. Non-Blocking Warnings & "Use anyway":
   - Low Inventions or low Prowess produces non-blocking warnings.
   - Overriding with "Use anyway" allows execution, clamps resource at 0, and reports shortfall publicly on receipt.
3. Never Auto-Roll Player Dice:
   - Chat cards set `receipt.status = "awaitingRoll"` with interactive button for Instability roll and damage/save dice; no player dice are auto-rolled during plan execution.
4. Automatic GM Relay:
   - Unowned target document changes relay through active GM client using `validateTarget` without throwing permission or validation errors.
5. Encounter-Window Undo Integrity:
   - Every Inventor action produces an undo receipt under `flags.ak5e.specialistUses.undo`.
   - Executing undo cleanly reverts installed modifications, refunds spent Inventions/Prowess, clears broken status flags, and reverts target damage/conditions.

Allowed write file:
- `ak5e/test/inventor-tableplay-adversarial.test.mjs`
- Files in `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4/`

Run verification:
- `node --test ak5e/test/inventor-tableplay-adversarial.test.mjs`
- `node ak5e/tools/validate-files.mjs`

Maintain progress in `progress.md`. When complete, write report in `handoff.md` and notify orchestrator.

## 2026-10-20T03:53:51Z
You are challenger_m4. Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4/.
Read your dispatch instructions in /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4/DISPATCH.md.

Author adversarial stress test suite in ak5e/test/inventor-tableplay-adversarial.test.mjs attacking:
1. Confirm-before-spend and cancel invariance.
2. Non-blocking warnings and "Use anyway" zero-clamping.
3. Never auto-roll player dice (receipt.status = "awaitingRoll", interactive buttons).
4. Automatic GM relay via validateTarget for unowned target modifications.
5. Encounter-window undo integrity (flags.ak5e.specialistUses.undo reverting all state).

Run:
- node --test ak5e/test/inventor-tableplay-adversarial.test.mjs
- node ak5e/tools/validate-files.mjs

Maintain progress in progress.md. Write report in handoff.md and notify orchestrator when complete.
