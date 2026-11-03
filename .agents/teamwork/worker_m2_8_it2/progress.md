# Progress — Milestone 2 Iteration 2 (Specialist Executor Remediation)

- Last visited: 2026-10-17T02:11:30Z
- Status: Completed all remediation tasks and verified 100% passing tests
- Current Step: Final handoff and completion reporting

## Completed Steps:
1. Appended dispatch to DISPATCH.md and initialized BRIEFING.md and progress.md.
2. Read mandatory files: ORIGINAL_REQUEST.md, SCOPE.md, GATE_STATUS.md, AGENTS.md, WORKFLOW.md, GEMINI.md, and upstream reports (explorer, auditor, reviewer, challenger).
3. Applied drop-in remediations to `ak5e/scripts/executor-features.mjs`:
   - Added `hooksInstalled` tracking and `getGameActors()` helper to extract actor documents safely from Arrays, Maps, or Collections with `.contents` or `.values()`.
   - Added idempotency guards per roll in `executorPreRollAttack` (`_ak5eDeathmarkCritApplied`) and `executorPreRollDamage` (`_ak5eDeathmarkDamageApplied`, `_ak5ePreysenseCritApplied`).
   - Gated `registerExecutorHooks()` D&D5e hook registration with `hooksInstalled !== globalThis.Hooks`, and removed the duplicate registration block at the end of the function.
   - Updated `onAk5eEvent("hit")` so when `sweeper.active` is true, Deathmark transfers to the newly hit target even if `dm.holder === "target"` (per Ch. 3 L5532).
   - In `onAk5eEvent("kill")` and `onAk5eEvent("turnEnd")`, used `getGameActors()` to correctly traverse actor collections.
4. Updated `ak5e/test/executor.test.mjs`:
   - Made Area 4 async, dispatched via `Hooks.callAll("dnd5e.preRollDamageV2", ...)`, and asserted exact bonus die count.
   - Updated Area 5 to dispatch via `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and asserted critical threshold is exactly 19.
   - Updated Area 10 to dispatch via `Hooks.callAll("dnd5e.preRollDamageV2", ...)` and asserted exact critical bonus die count.
   - Added Area 14 testing hook registration idempotency across multiple `registerExecutorHooks()` calls and Sweeper multi-target mark cycling.
5. Verification executed:
   - `node --test ak5e/test/executor-adversarial.test.mjs` (11/11 tests pass, 0 fail)
   - `node --test ak5e/test/executor.test.mjs` (14/14 tests pass, 0 fail)
   - `node --test ak5e/test/specialist-rules.test.mjs ak5e/test/specialist-features.test.mjs ak5e/test/specialist-progression.test.mjs ak5e/test/specialist-adversarial.test.mjs ak5e/test/executor.test.mjs ak5e/test/executor-adversarial.test.mjs` (73/73 tests pass, 0 fail)
   - `node ak5e/tools/validate-files.mjs` (270 files validated, 0 errors)
   - `node ak5e/tools/verify-generated-content.mjs` (2193 records verified, 0 errors)
