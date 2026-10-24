# BRIEFING — 2026-10-16T12:05:00Z

## Mission
Orchestrate the implementation and verification of the AK5e Specialist base class and its Executor, Hookmaster, and Infuser subclasses in Foundry VTT v13 (dnd5e 5.3.3) with table-play philosophy, unit/adversarial tests, and headless Chromium verification.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/
- Original parent: Sentinel / Parent Agent
- Original parent conversation ID: 8e33d4aa-cb2e-4cf9-8683-b9806f767e66

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/SCOPE.md
1. **Decompose**: Decomposed into 5 clean milestones:
   - M1: Base Specialist Class, Sheet UI & Module Integration
   - M2: Executor Subclass Implementation & Tests
   - M3: Hookmaster Subclass Implementation & Tests
   - M4: Infuser Subclass Implementation & Tests
   - M5: Full Test Regression, Headless Browser & Visual Verification
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Worker -> Reviewer -> Challenger -> Auditor -> Gate per milestone.
   - Max concurrent subagents: 3.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: At 16 spawns, write soft handoff.md, kill timers, spawn successor with original parent conversation ID.
- **Work items**:
  1. Milestone 1: Base Specialist Class, Sheet UI & Module Integration [in-progress]
  2. Milestone 2: Executor Subclass Implementation & Tests [pending]
  3. Milestone 3: Hookmaster Subclass Implementation & Tests [pending]
  4. Milestone 4: Infuser Subclass Implementation & Tests [pending]
  5. Milestone 5: Full Test Regression, Headless Browser & Visual Verification [pending]
- **Current phase**: 2 (Milestone 1 execution)
- **Current focus**: Milestone 1 Worker dispatch

## 🔒 Key Constraints
- DISPATCH-ONLY orchestrator: NEVER write source code, NEVER run tests or build commands directly, NEVER explore codebase directly.
- Only edit metadata files (.md) in `/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/`.
- STRICT SUB-AGENT CONCURRENCY CAP: Maximum 3 concurrent subagents at any time.
- Use Gemini 3.8 agents for implementation.
- Zero tolerance on forensic audit violations (binary veto).
- Preserve existing working tree modifications.
- Table-play philosophy (WORKFLOW §3.2): confirm uses, warn without blocking, clamp overspend at 0, no auto-rolled dice, automatic GM relay for unowned targets, reversible encounter-window undo receipts.
- Live browser verification with `launchTestBrowser()`, visual inspection per AGENTS.md §6.2 with PASS verdicts.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- When complete, notify parent Sentinel (8e33d4aa-cb2e-4cf9-8683-b9806f767e66) to claim victory.

## Current Parent
- Conversation ID: 8e33d4aa-cb2e-4cf9-8683-b9806f767e66
- Updated: 2026-10-16T12:05:00Z

## Key Decisions Made
- Recovered from server restart replacing orchestrator_6 with orchestrator_7.
- Inherited SCOPE.md and initial milestone breakdown.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| worker_m1_7 | teamwork_preview_worker | Milestone 1 Base Specialist & Wiring | completed | 6c1e5430-a56d-48aa-8087-b1de5a8b8963 |
| reviewer_m1_7_1 | teamwork_preview_reviewer | Milestone 1 Independent Review | in-progress | 3c69744f-f334-4290-87e2-0f3e3c9616ec |
| reviewer_m1_7_2 | teamwork_preview_reviewer | Milestone 1 Independent Review | in-progress | 62430fa6-ab05-47c8-885c-ec180d93744b |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: 3c69744f-f334-4290-87e2-0f3e3c9616ec, 62430fa6-ab05-47c8-885c-ec180d93744b
- Predecessor: orchestrator_6 (7c128871-a90d-4b87-a96b-0f976db806d5)
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-38 (*/10 * * * *)
- Safety timer: task-80 (600s condition=6c1e5430-a56d-48aa-8087-b1de5a8b8963)
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/DISPATCH.md — Incoming dispatch log
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/BRIEFING.md — Persistent working memory index
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/progress.md — Liveness heartbeat & state recovery
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/SCOPE.md — Detailed milestone decomposition and feature inventory
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/GATE_STATUS.md — Gate verdicts per iteration
