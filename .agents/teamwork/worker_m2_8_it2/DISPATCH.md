## 2026-10-17T02:05:57Z

Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_8_it2/.
You are the Remediation Implementer for Milestone 2 Iteration 2 (Specialist Executor).

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Remediation Explorer Report: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/handoff.md
- Auditor Evidence Report: /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m2_8_1/handoff.md
- Reviewer Report: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_8_1/handoff.md
- Challenger Report: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m2_8_1/handoff.md

File Ownership:
- `ak5e/scripts/executor-features.mjs`
- `ak5e/test/executor.test.mjs`

Your Task:
Apply the exact drop-in replacements specified in Section 5 of `explorer_m2_8_it2/handoff.md`:
1. In `ak5e/scripts/executor-features.mjs`:
   - Add `hooksInstalled` tracking and `getGameActors()` helper to safely extract actors from Arrays, Maps, or Collections with `.contents` or `.values()`.
   - Add idempotent guards per roll in `executorPreRollAttack` (`_ak5eDeathmarkCritApplied`) and `executorPreRollDamage` (`_ak5eDeathmarkDamageApplied`, `_ak5ePreysenseCritApplied`).
   - In `registerExecutorHooks()`: register D&D5e hooks once per `Hooks` instance guarded by `hooksInstalled !== globalThis.Hooks`, and remove the duplicate registration block at lines 538–542.
   - In `onAk5eEvent("hit")`: fix Sweeper mark transfer so when `sweeper.active` is true, Deathmark transfers to the newly hit target even if `dm.holder === "target"` (per Ch. 3 L5532).
   - In `onAk5eEvent("kill")` and `onAk5eEvent("turnEnd")`: use `getGameActors()` so Collection/Map entries are extracted as actor documents.
2. In `ak5e/test/executor.test.mjs`:
   - Update Areas 4, 5, and 10 to dispatch through `Hooks.callAll("dnd5e.preRollDamageV2", ...)` and `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and assert exact frequencies.
   - Add Area 14 testing hook registration idempotency and Sweeper multi-target mark cycling.
3. Verification Commands to Run:
   - `node --test ak5e/test/executor-adversarial.test.mjs` (verify all 11 adversarial tests pass 100%)
   - `node --test ak5e/test/executor.test.mjs` (verify all 14 unit tests pass 100%)
   - `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs`
   - `node ak5e/tools/validate-files.mjs`
   - `node ak5e/tools/verify-generated-content.mjs`

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m2_8_it2/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.
