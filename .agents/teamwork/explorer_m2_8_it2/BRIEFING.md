# BRIEFING — 2026-10-17T02:05:00Z

## Mission
Investigate and formulate drop-in fixes for the three critical defects (duplicate hook registration & test masking, Sweeper mark transfer on non-held state, and game.actors collection traversal) from Milestone 2 Iteration 1.

## 🔒 My Identity
- Archetype: explorer
- Roles: Remediation Explorer, Synthesis
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2
- Original parent: 333d6dbd-7011-4844-9df5-b166d99aee35
- Milestone: Milestone 2 Iteration 2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code or test files
- All proposed code changes must be provided as exact drop-in patches/snippets in handoff.md
- Address all specific integrity violations and defects identified without omitting, summarizing, or filtering them
- Communicate via send_message to parent upon completion

## Current Parent
- Conversation ID: 333d6dbd-7011-4844-9df5-b166d99aee35
- Updated: 2026-10-17T02:05:00Z

## Investigation State
- **Explored paths**:
  - `ak5e/scripts/executor-features.mjs` (duplicate hooks, Sweeper transfer on hit, game.actors traversal in kill and turnEnd)
  - `ak5e/scripts/specialist-uses.mjs` (sweeper plan, WORKFLOW §3.2 table-play compliance)
  - `ak5e/test/executor.test.mjs` (test masking of preRollAttack/preRollDamage)
  - `ak5e/test/executor-adversarial.test.mjs` (tests 4, 7.3, 7.4 failures reproduced)
  - Forensic Audit Report (`auditor_m2_8_1/handoff.md`)
  - Reviewer Report (`reviewer_m2_8_1/handoff.md`)
  - Challenger Report (`challenger_m2_8_1/handoff.md`)
- **Key findings**:
  - Confirmed duplicate hook registration in `registerExecutorHooks()` at lines 348–351 and lines 538–542.
  - Confirmed `executorPreRollAttack` and `executorPreRollDamage` lack per-roll idempotency guards.
  - Confirmed `onAk5eEvent("hit")` gates mark transfer on `dm.holder === "self"`, breaking Sweeper multi-target mark cycling (Ch. 3 L5532).
  - Confirmed `Array.from(globalThis.game?.actors ?? [])` yields `[id, doc]` tuples from Map/Collection, causing `isExecutor(actor)` to return false.
  - Designed `getGameActors()` helper supporting Arrays, Collections with `.contents`, Maps with `.values()`, and edge-case iterables.
  - Verified exact drop-in replacements for both `executor-features.mjs` and `executor.test.mjs`.
- **Unexplored areas**: None for M2 defects. M3 (Hookmaster) and M4 (Infuser) are separate future milestones.

## Key Decisions Made
- Formulated exact drop-in replacements with per-roll idempotent guards and `hooksInstalled !== globalThis.Hooks` check.
- Gated Sweeper mark transfer on `isSweeper` in `onAk5eEvent("hit")` to transfer immediately to newly hit targets per Ch. 3 L5532.
- Exported and integrated `getGameActors()` helper for uniform actor document extraction.

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/DISPATCH.md — Incoming assignment and dispatch log
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/BRIEFING.md — Persistent working memory
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/progress.md — Liveness heartbeat
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_8_it2/handoff.md — 5-component Remediation Plan & Handoff Report
