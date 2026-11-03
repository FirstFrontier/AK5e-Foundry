## 2026-10-17T01:57:26Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/.
You are the Remediation Explorer for Milestone 2 Iteration 2. You are a read-only exploration agent. You MUST NOT edit source code or test files directly.

MANDATORY INSTRUCTION:
Milestone 2 Iteration 1 failed the Forensic Integrity Audit with an INTEGRITY VIOLATION verdict, alongside REQUEST_CHANGES from the Reviewer and Challenger. You are receiving the FULL AUDIT EVIDENCE REPORT and GATE STATUS. You must address the specific integrity violations and defects identified without omitting, summarizing, or filtering them.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Full Auditor Evidence Report: /home/patch/AK5e-Foundry/.agents/teamwork/auditor_m2_8_1/handoff.md
- Reviewer Report: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m2_8_1/handoff.md
- Challenger Report: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m2_8_1/handoff.md
- Implementation files to investigate:
  - ak5e/scripts/executor-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/test/executor.test.mjs
  - ak5e/test/executor-adversarial.test.mjs

Specific Defects to Investigate and Formulate Drop-In Fixes For:
1. [Integrity Violation & Reviewer Blocker] Duplicate Hook Registration:
   - In `ak5e/scripts/executor-features.mjs`, `Hooks.on("dnd5e.preRollAttackV2")` and `Hooks.on("dnd5e.preRollDamageV2")` are registered twice (lines 348–351 and lines 538–542).
   - Lines 348–351 precede the `if (ak5eEventsInstalled) return;` guard, causing duplicate listeners to be leaked on subsequent calls to `registerExecutorHooks()`.
   - Live dispatch via `Hooks.callAll` doubles Deathmark bonus damage and decrements critical threshold twice (20 → 18).
   - In `ak5e/test/executor.test.mjs`, the handlers were invoked directly instead of via `Hooks.callAll`, masking this issue.
   - Investigate and provide exact line replacements in `executor-features.mjs` and updated test assertions in `executor.test.mjs` using `Hooks.callAll`.
2. [Reviewer & Challenger Blocker] Sweeper Mark Transfer Blocked on Non-Held State:
   - Ch. 3 line 5532 states: "If you hit a Creature with an Attack as part of this Action, that Creature immediately gains your Deathmark, even if it is on another Creature."
   - In `onAk5eEvent("hit")`, transfer was strictly gated on `dm.holder === "self"`. When hitting subsequent creatures during a multi-target Sweeper action, the mark fails to transfer to newly hit creatures.
   - Investigate how `onAk5eEvent("hit")` and/or `onAk5eEvent("attack")` can transfer the mark when `sweeper.active === true` even if `dm.holder === "target"`.
3. [Challenger Blocker] `game.actors` Map/Collection Entry Traversal in `kill` and `turnEnd`:
   - `Array.from(globalThis.game?.actors ?? [])` converts Map to array of `[id, doc]` tuples, causing `isExecutor(actor)` to evaluate to false.
   - Investigate and provide a safe iterator helper that extracts documents whether `game.actors` is an Array, a Map, or a Collection with `.values()` or `.contents`.

Deliverable:
Write a comprehensive remediation plan to `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method) with exact drop-in code fixes and verification commands.
When finished, notify the orchestrator with send_message.
