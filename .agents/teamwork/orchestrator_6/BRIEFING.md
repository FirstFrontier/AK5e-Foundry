# BRIEFING — 2026-10-16T11:55:00Z

## Mission
Orchestrate the implementation and verification of the AK5e Specialist base class and its Executor, Hookmaster, and Infuser subclasses in Foundry VTT v13 (dnd5e 5.3.3) with table-play philosophy, unit/adversarial tests, and headless Chromium verification.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/
- Original parent: Sentinel / Parent Agent
- Original parent conversation ID: ba1b406d-cfdb-4601-bb26-146b2396bbcd

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/SCOPE.md
1. **Decompose**: Decomposed into 5 clean milestones (M1: Base Specialist, Sheet & Wiring; M2: Executor; M3: Hookmaster; M4: Infuser; M5: Regression, Browser & Visual).
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Worker -> Reviewer -> Challenger -> Auditor -> Gate per milestone.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: At 16 spawns, write soft handoff.md, kill timers, spawn successor with original parent conversation ID.
- **Work items**:
  1. Survey & Spec Mining [DONE]
  2. Milestone 1: Base Specialist Class, Sheet UI & Module Integration [in-progress]
  3. Milestone 2: Executor Subclass Implementation & Tests [pending]
  4. Milestone 3: Hookmaster Subclass Implementation & Tests [pending]
  5. Milestone 4: Infuser Subclass Implementation & Tests [pending]
  6. Milestone 5: Full Test Regression, Headless Browser & Visual Verification [pending]
- **Current phase**: 2 (Milestone 1 execution)
- **Current focus**: worker_m1_2 executing Milestone 1

## 🔒 Key Constraints
- DISPATCH-ONLY orchestrator: NEVER write source code, NEVER run tests or build commands directly, NEVER explore codebase directly.
- Only edit metadata files (.md) in `/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/`.
- Zero tolerance on forensic audit violations (binary veto).
- Preserve existing working tree modifications.
- Table-play philosophy (WORKFLOW §3.2): confirm uses, warn without blocking, clamp overspend at 0, no auto-rolled dice, automatic GM relay for unowned targets, reversible encounter-window undo receipts.
- Live browser verification with `launchTestBrowser()`, visual inspection per AGENTS.md §6.2.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.

## Current Parent
- Conversation ID: ba1b406d-cfdb-4601-bb26-146b2396bbcd
- Updated: 2026-10-16T11:53:34Z

## Key Decisions Made
- Recovered from server restart: re-established heartbeat cron as task-97.
- Terminated stalled worker_m1 and spawned fresh replacement worker_m1_2 (41bc6648-9667-4852-835e-578bdd0c65c1).

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| spec_miner_rules_1 | teamwork_preview_spec_miner | Chapter 3 rules & talent mining | completed | 1dbd5859-352c-44a2-9d87-485588c84a13 |
| explorer_code_1 | teamwork_preview_explorer | Existing codebase & test gap analysis | completed | 7352c72b-510a-429d-a0ce-40f4ebeb9372 |
| spec_miner_infra_1 | teamwork_preview_spec_miner | Table play, live browser harness & visual spec | completed | 8dc13cd5-a14f-48c8-be87-c60bfc6d3e39 |
| worker_m1_2 | teamwork_preview_worker | Base Specialist, sheet, CSS & wiring | in-progress | 41bc6648-9667-4852-835e-578bdd0c65c1 |

## Succession Status
- Succession required: no
- Spawn count: 5 / 16
- Pending subagents: 41bc6648-9667-4852-835e-578bdd0c65c1
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-97 (*/10 * * * *)
- Safety timer: none (covered by heartbeat cron)
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/DISPATCH.md — Incoming dispatch log
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/BRIEFING.md — Persistent working memory index
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/progress.md — Liveness heartbeat & state recovery
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/SCOPE.md — Detailed milestone decomposition and feature inventory
