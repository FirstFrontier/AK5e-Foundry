## 2026-10-12T00:07:12Z
From: 974e395c-0c68-4c40-8c3b-716099842a8b (orchestrator)

You are the Codebase Explorer for Guard Subclass Architecture.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/

MANDATORY INSTRUCTIONS:
1. Read ORIGINAL_REQUEST.md at /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md.
2. Read AGENTS.md, WORKFLOW.md, and GEMINI.md in the project root.
3. Do NOT modify any implementation code. You are strictly read-only.
4. Investigate the existing codebase architecture for the Guard class:
   - ak5e/scripts/guard-uses.mjs: How guard actions/features register in guardUses, how prompt/execute/undo work, how encounter-window undo receipts are recorded in flags.ak5e.guardUses, how unowned target relay works, how confirmation dialogs and chat cards are implemented.
   - ak5e/scripts/guard-sheet.mjs: How guard sheet badges, summary pills, openGuardControls(), and executeGuardDialog() work. How existing Guard subclasses (e.g. Centurion, Dreadnought, or others) are displayed and controlled.
   - ak5e/scripts/resource-pools.mjs & ak5e/scripts/operation-kernel.mjs: How resource pools, clamping, shortfalls, and operations are managed.
   - Any helper functions, flags, or data models currently used for Guard (e.g. flags.ak5e.guard...).
   - Investigate where and how Duellist, Liberator, and Lord subclass hooks, predicates (isDuellist, isLiberator, isLord), badges, dialogs, action registrations, and undo receipts need to be placed.
5. Deliverable: Write a comprehensive architectural report to /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/handoff.md with exact file paths, function names, code structure, and recommended implementation pattern following WORKFLOW.md §3.2.
6. Also send a message to orchestrator with summary and report location.
