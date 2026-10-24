## 2026-10-12T23:15:00Z
You are explorer_m4_it2, a read-only technical exploration agent for Milestone 4 Iteration 2 (Specialist Base Class Remediation).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4_it2/

MANDATORY FIRST STEP:
Read the following authoritative files:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_4/GATE_STATUS.md
7. Reviewer & Challenger reports:
   - /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_1/handoff.md
   - /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m4_2/handoff.md
   - /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m4_1/handoff.md
8. Specialist source implementation files:
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-progression.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/specialist-adversarial.test.mjs

YOUR REMEDIATION INVESTIGATION OBJECTIVES:
Investigate and produce the exact line-by-line remediation diff for:
1. `ak5e/scripts/specialist-uses.mjs`:
   - Lines 169–173 and 237–241: Replace `reactions.value < 1` with `!reactions?.available` (or `reactions?.available < 1`).
2. `ak5e/scripts/specialist-features.mjs`:
   - Lines 81–86: Remove redundant `Hooks.on("dnd5e.restCompleted")` listener because `resource-pools.mjs` automatically registers `dnd5e.restCompleted` for pools with `recovery`.
3. `ak5e/scripts/specialist-progression.mjs`:
   - Lines 447–451: Cross-validate `fightingStyle` against the array matching `choices.weaponCategory` (`weaponCat === "ranged" ? RANGED_FIGHTING_STYLES : MELEE_FIGHTING_STYLES`) so Melee specialists cannot select Ranged fighting styles, and vice-versa.
4. `ak5e/test/specialist-adversarial.test.mjs`:
   - Align test assertions:
     - Check `getReactions(actor).available` instead of `.value`.
     - Check `receipt.status === "complete"` instead of `"applied"`.
     - Verify reaction warning emission `result.warnings.some(w => w.code === "reaction")`.

DELIVERABLE:
Write your complete remediation plan to:
/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4_it2/handoff.md.
When finished, send a message to orchestrator.
