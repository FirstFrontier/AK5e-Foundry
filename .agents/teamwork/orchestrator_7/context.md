# Context for Specialist Orchestrator (orchestrator_7)

## Request
Implement and verify the AK5e **Specialist** base class and its **Executor**, **Hookmaster**, and **Infuser** subclasses in Foundry VTT v13 (`dnd5e` 5.3.3).

Full details in `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md` under section `## 2026-10-16T12:01:23Z`.

## Policies & Rules
- `AGENTS.md`
- `WORKFLOW.md`
- `GEMINI.md`
- Use Gemini 3.8 agents for implementation.
- Preserve existing working tree modifications.
- STRICT CAP: Maximum 3 concurrent subagents at any time.
- Table-play philosophy (WORKFLOW §3.2): confirm uses, warn without blocking, clamp overspend at 0, no auto-rolled dice, automatic GM relay for unowned targets, reversible encounter-window undo receipts under `flags.ak5e.specialistUses`.
- Headless Chromium verification via `launchTestBrowser()` with screenshot inspection per AGENTS.md §6.2.
- Prior survey and milestone decomposition are available in `/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/SCOPE.md`.
