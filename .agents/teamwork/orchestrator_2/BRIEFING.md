# BRIEFING — 2026-10-12T11:32:00Z

## Mission
Plan and implement the four base character classes (Vanguard, Supporter, Specialist, and Medic) for AK5e v1.3.1 on Foundry VTT V13 and D&D5e system with rules calculations, level 1–20 idempotent progression, registered resource pools, table-play confirmation/overrides/undo, ActorSheetV2 UI, automated tests, and live browser validation.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_2/
- Original parent: Sentinel
- Original parent conversation ID: 6647d313-e894-40a6-a0ca-533b0e97735a

## 🔒 My Workflow
- **Pattern**: Project Pattern (Dual Track: Implementation Track + E2E Testing Track)
- **Scope document**: /home/patch/AK5e-Foundry/PROJECT.md
1. **Decompose**: Survey codebase & source rules (3 parallel explorers), map feature inventory, decompose into milestones (Test Track + Class Implementation Milestones + Live Browser Milestone).
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Explorer → Worker → Reviewer → Challenger → Auditor loop per milestone.
3. **On failure**:
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical, never auditor)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (last resort)
4. **Succession**: At 16 spawns, write handoff.md, spawn successor.
- **Work items**:
  1. Survey & Architecture [in-progress]
  2. Test Infrastructure & E2E Track [pending]
  3. Base Progression Engine & Common Architecture [pending]
  4. Vanguard Class Implementation [pending]
  5. Supporter Class Implementation [pending]
  6. Specialist Class Implementation [pending]
  7. Medic Class Implementation [pending]
  8. ActorSheetV2 Controls & Live Browser Validation [pending]
  9. Final Verification & Adversarial Hardening [pending]
- **Current phase**: 0 (Survey)
- **Current focus**: Survey & Scope Mapping

## 🔒 Key Constraints
- DISPATCH-ONLY orchestrator: NEVER write source code, NEVER run tests directly, delegate all execution to subagents.
- Only edit metadata files (.md) in .agents/teamwork/orchestrator_2/ or PROJECT.md.
- Follow AGENTS.md, WORKFLOW.md, and GEMINI.md strictly.
- Rules authority is AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt.
- In-Foundry Playwright tests must use launchTestBrowser() on port 30175 with clean standard-test copy in /tmp.
- Screenshot review must be delegated to subagents per AGENTS §6.2.
- Binary veto on Forensic Auditor violations.

## Current Parent
- Conversation ID: 6647d313-e894-40a6-a0ca-533b0e97735a
- Updated: 2026-10-12T11:32:00Z

## Key Decisions Made
- Selected Project Pattern with Dual Track (E2E Testing + Implementation).
- Launching Survey Phase with 3 Explorers.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| spec_miner_survey_rules | teamwork_preview_spec_miner | Survey Class Rules (Ch. 3) | completed | 58a365bd-90d9-4f17-8132-de922c76dcc3 |
| explorer_survey_engine | teamwork_preview_explorer | Survey Engine Architecture | completed | 3091c5ac-2041-410d-a946-a009acaa7877 |
| explorer_survey_tests | teamwork_preview_explorer | Survey Tests & In-Foundry Harness | completed | 13cb37d5-df06-4349-b55a-afa002c156b3 |
| worker_m1 | teamwork_preview_worker | M1: Test Track Infra & Fixtures | completed | 4875ed70-d906-43be-a22f-7d966ab92dd0 |
| reviewer_m1_1 | teamwork_preview_reviewer | M1 Review: Test Infra & Fixture | completed | 174b5d1f-031b-4e45-8bc4-c8a715499665 |
| reviewer_m1_2 | teamwork_preview_reviewer | M1 Review: Fixture & Regressions | completed | 45ca7372-023d-473d-8204-fbc52d2e344f |
| challenger_m1_1 | teamwork_preview_challenger | M1 Challenge: Fixture Stress Test | completed | 6a43c40e-6dde-4cde-9af0-2ea569189fb7 |
| challenger_m1_2 | teamwork_preview_challenger | M1 Challenge: Harness & Coverage | completed | 468d7286-18d3-49ed-8234-d3c5889efd11 |
| auditor_m1 | teamwork_preview_auditor | M1 Forensic Integrity Audit | completed | d0358b16-a573-4b23-9ae0-3fb6a0b811e5 |
| worker_m1_it2 | teamwork_preview_worker | M1 Remediation: Fixture Fixes | completed | e37f133d-2f6b-4037-aedb-2bf028facc4e |
| reviewer_m1_it2_1 | teamwork_preview_reviewer | M1 It2 Review: Fixture Fixes | completed | 9668862a-30eb-4f6e-abd8-302558a8b983 |
| reviewer_m1_it2_2 | teamwork_preview_reviewer | M1 It2 Review: Regressions Check | completed | 8efdaaa7-62b4-4307-9ba4-bb0b635a5f0d |
| challenger_m1_it2 | teamwork_preview_challenger | M1 It2 Challenge: Adversarial | completed | b3001e23-8243-4682-9a0e-6db2c02cef4a |
| auditor_m1_it2 | teamwork_preview_auditor | M1 It2 Audit: Integrity Check | completed | 75ef5e01-eb86-4db2-83dc-c9637a3347cf |
| worker_m2 | teamwork_preview_worker | M2: Vanguard Base Class Implementation | in-progress | 57fbdaac-c754-46b5-9dd5-6ad21019838c |

## Succession Status
- Succession required: no
- Spawn count: 15 / 16
- Pending subagents: 57fbdaac-c754-46b5-9dd5-6ad21019838c
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 1cea36a2-b300-4df5-b00b-f3243731611c/task-10
- Safety timer: none

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_2/DISPATCH.md — Dispatch instructions
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_2/BRIEFING.md — Persistent working state
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_2/progress.md — Liveness & progress tracking
- /home/patch/AK5e-Foundry/PROJECT.md — Global project plan & decomposition
