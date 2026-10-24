## 2026-10-13T04:38:16Z
You are challenger_medic_2, an adversarial verifier for Medic progression idempotency, schema stress, and table concurrency.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_medic_2/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/WORKFLOW.md
- Read /home/patch/AK5e-Foundry/GEMINI.md
- Read /home/patch/AK5e-Foundry/.agents/teamwork/worker_medic_impl/handoff.md

YOUR TASK:
Author and execute an independent stress test script (e.g., `ak5e/tools/stress-medic-progression.mjs` or `ak5e/test/medic-challenger-progression.test.mjs`):
1. Progression Idempotency Stress:
   - Level 1 -> Level 4 -> Level 8 -> Level 12 -> Level 16 -> Level 20.
   - Re-run progression 5 times on the same Level 20 character.
   - Assert: HP does NOT double/increase; ASIs do NOT re-apply (abilities clamped at max 20); items do NOT duplicate; authored item changes (names, descriptions) are preserved.
2. Choice Schema Edge Cases:
   - Attempting to pick 1 or 3 saves (must reject; exactly 2 required).
   - Attempting to pick invalid saves (e.g. STR, DEX, CHA; only CON, INT, WIS allowed).
   - Attempting to pick invalid skills (Medicine automatic + exactly 2 from Lore, Arts, Tech, Insight, Perception, Persuasion).
   - Attempting Feats for ASIs (rejected; only ability score improvements allowed in AK5e).
   - Starting equipment: cash (1300 LMD) vs item packages.
3. Concurrency Stress:
   - Trigger concurrent calls to `executeMedicPlan` / `command` on the same actor and verify `keyedSerial` executes them in strict sequence without race conditions, lost updates, or corrupted undo stacks.
4. Re-running tests:
   - Run your stress script with `node` and report pass/fail count and execution times.

DELIVERABLE:
Write your structured challenge report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/challenger_medic_2/handoff.md`
State your verdict explicitly: APPROVE or REQUEST_CHANGES. Send a message to orchestrator with your verdict and summary.
