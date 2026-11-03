# BRIEFING — 2026-10-20T03:56:00Z

## Mission
Implement Milestone 4: Inventor Table-Play Philosophy (WORKFLOW.md §3.2), GM Relay, ActorSheetV2 controls, and Full Specialist Regression.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m4/
- Original parent: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Milestone: M4 (Specialist Base Class)
- Current Parent: cf5c8a2a-802f-473e-8274-6566de462e7c

## 🔒 Key Constraints
- Exclusive file ownership:
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/specialist-features.mjs
  - ak5e/scripts/specialist-setup.mjs
  - ak5e/scripts/specialist-progression.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/test/specialist-rules.test.mjs
  - ak5e/test/specialist-features.test.mjs
  - ak5e/test/specialist-progression.test.mjs
  - PROJECT.md (update M3 to DONE and M4 to IN_PROGRESS)
- DO NOT CHEAT: Genuine implementations only, real state and real behavior.
- Strictly adhere to WORKFLOW.md §3.2 (Trust the table: player agency, undoable within encounter window, no auto-rolled dice, GM gating for admin only).
- Milestone 4 Inventor Scope:
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/test/inventor-uses.test.mjs
  - TODO.md
  - package.json

## Current Parent
- Conversation ID: cf5c8a2a-802f-473e-8274-6566de462e7c
- Updated: 2026-10-20T03:56:00Z

## Task Summary
- **What to build**:
  1. Specialist-uses.mjs: register Inventor plans (`applyModification`, `removeModification`, `activateModification`, `mobileModding`, `strangeContraption`, `theBigOne`) with confirmation dialogs, non-blocking warnings ("Use anyway"), zero-clamping, GM relay (`validateTarget`), interactive card buttons (`receipt.formula`), and `inventorCleanup` for undo receipts.
  2. Specialist-sheet.mjs: inject ActorSheetV2 badges (Inventions pool, Inventor DC, active mod count) and DialogV2 action buttons.
  3. Author `ak5e/test/inventor-uses.test.mjs`.
  4. Update `TODO.md` with Inventor completion.
  5. Update `package.json` "test:specialist" script to include all inventor test files.
- **Success criteria**:
  - `npm run test:specialist` passes (including all inventor tests and new inventor-uses test)
  - `node ak5e/tools/validate-files.mjs` passes
  - `node ak5e/tools/verify-generated-content.mjs` passes
- **Interface contracts**: WORKFLOW.md §3.2, play-uses.mjs, specialist-uses.mjs, inventor-features.mjs
- **Code layout**: ak5e/scripts/ and ak5e/test/

## Key Decisions Made
- Follow Executor/Hookmaster/Infuser patterns in `specialist-uses.mjs` for plan structure, warnings, receipts, GM relay `.validateTarget`, and cleanup.
- Keep table-play philosophy: confirm before use, non-blocking warnings ("Use anyway"), zero-floor clamping on resource shortfalls, never auto-roll dice (`receipt.formula`).

## Change Tracker
- **Files modified**:
  - .agents/teamwork/worker_m4/DISPATCH.md
  - .agents/teamwork/worker_m4/progress.md
  - .agents/teamwork/worker_m4/BRIEFING.md
- **Build status**: Baseline test:specialist (127/127 pass), inventor tests (144/144 pass).
- **Pending issues**: Implement Inventor plans, sheet integration, test suite, and doc updates.

## Quality Status
- **Build/test result**: Pass (baseline 127/127 specialist + 144/144 inventor)
- **Lint status**: Clean
- **Tests added/modified**: Pending ak5e/test/inventor-uses.test.mjs

## Loaded Skills
- None
