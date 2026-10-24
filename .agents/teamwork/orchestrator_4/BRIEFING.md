# BRIEFING — 2026-10-12T18:56:05Z

## Mission
Orchestrate completion and verification of the AK5e base character classes (Vanguard, Supporter, Specialist, Medic, Sheet UI, and Live in-Foundry validation) adhering strictly to Chapter 3 rules and WORKFLOW §3.2.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_4/
- Original parent: parent
- Original parent conversation ID: 6647d313-e894-40a6-a0ca-533b0e97735a

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /home/patch/AK5e-Foundry/PROJECT.md
1. **Decompose**: Decomposed into 7 milestones (M1–M7) per PROJECT.md.
2. **Dispatch & Execute**:
   - M1: DONE.
   - M2: DONE (Passed Gate on Iteration 2).
   - M3: DONE (Passed Gate on Iteration 1).
   - M4: In progress (Specialist Base Class: Explorer -> Worker -> Reviewers -> Challengers -> Auditor).
   - M5: Medic Base Class.
   - M6: Sheet Integration & Canonical Registration.
   - M7: Live In-Foundry Browser Validation & Final Verification.
3. **On failure**: Retry -> Replace -> Skip (non-auditor) -> Redistribute -> Redesign. Forensic Audit is hard binary veto.
4. **Succession**: External self-spawn not supported by harness; orchestrator_4 manages full project lifecycle across all milestones.
- **Work items**:
  1. M1: Test Track Infrastructure & Fixtures [done]
  2. M2: Vanguard Base Class [done]
  3. M3: Supporter Base Class [done]
  4. M4: Specialist Base Class [done]
  5. M5: Medic Base Class [in-progress: explorer investigating]
  6. M6: Sheet Integration & Canonical Registration [pending]
  7. M7: Live In-Foundry Browser Validation & Final Verification [pending]
- **Current phase**: 5
- **Current focus**: Milestone 5 Medic Base Class Exploration

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- NEVER investigate or explore the problem at the code level — dispatch Explorers for technical investigation.
- File editing tools ONLY for metadata/state files (.md) in .agents/teamwork/.
- Forensic Auditor INTEGRITY VIOLATION is a BINARY VETO — fails milestone unconditionally.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- Always include path to ORIGINAL_REQUEST.md in subagent dispatches.
- Include mandatory integrity warning in Worker dispatches.
- Gemini 3.8 Flash for all workers (model: inherit).
- In-Foundry tests must use launchTestBrowser() from ak5e/tools/test-browser.mjs and clean standard-test world copy on port 30175.
- WORKFLOW §3.2 table play philosophy: confirm uses, warnings with "Use anyway", clamp resource at 0, automatic GM relay, no auto-rolled dice, undo receipts.

## Current Parent
- Conversation ID: 6647d313-e894-40a6-a0ca-533b0e97735a
- Updated: 2026-10-12T17:35:12Z

## Key Decisions Made
- M1 confirmed DONE.
- M2 PASSED GATE (Vanguard complete and verified).
- M3 PASSED GATE (Supporter complete and verified).
- M4 PASSED GATE (Specialist complete, all 4 defects remediated and verified).
- Advancing directly to Milestone 5 (Medic Base Class).

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| reviewer_m4_1_it2 | teamwork_preview_reviewer | Specialist Rules Review It2 | completed (APPROVE) | abd317ba-8285-4e5c-a553-9df9d5073a6e |
| reviewer_m4_2_it2 | teamwork_preview_reviewer | Specialist Robustness Review It2 | completed (APPROVE) | c8df3832-1aa0-40b3-8aea-a684ae0491d4 |
| challenger_m4_1_it2 | teamwork_preview_challenger | Specialist Features Stress Test It2 | completed (APPROVE) | c9c6e6de-8b9e-4424-bb03-4806bdf678dc |
| challenger_m4_2_it2 | teamwork_preview_challenger | Specialist Progression Stress Test It2 | completed (APPROVE) | a673331c-0e3b-48b6-b2ea-e088fecd1eaa |
| auditor_m4_it2 | teamwork_preview_auditor | Specialist Forensic Integrity Audit It2 | completed (CLEAN) | 1dab0cad-942d-4bdb-94c5-8e39a3a5cb2e |
| explorer_m5 | teamwork_preview_explorer | Medic Rules & Module Exploration | in-progress | 2815515e-276a-4c77-bf7d-609454a107cd |

## Succession Status
- Succession required: no (harness restricted to teamwork_preview_* roles; orchestrator_4 executing all milestones)
- Spawn count: 34
- Pending subagents: 2815515e-276a-4c77-bf7d-609454a107cd

## Active Timers
- Heartbeat cron: task-293
- Safety timer: none

## Artifact Index
- /home/patch/AK5e-Foundry/PROJECT.md — Global architecture, feature inventory, milestones
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md — Authoritative user requirements
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_4/GATE_STATUS.md — Milestone gate status
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_4/handoff.md — M2 & M3 Summary
