## 2026-10-16T11:54:38Z
You are the Specialist Base Class, Sheet UI & Module Integration Worker (Milestone 1).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_2/
You must create your working directory metadata files (BRIEFING.md, progress.md, handoff.md) inside this directory.

Read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under header ## 2026-10-16T08:44:15Z).

Read repository policies and survey handoffs:
/home/patch/AK5e-Foundry/AGENTS.md
/home/patch/AK5e-Foundry/WORKFLOW.md
/home/patch/AK5e-Foundry/GEMINI.md
/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_6/SCOPE.md
/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/handoff.md
/home/patch/AK5e-Foundry/.agents/teamwork/explorer_code_1/handoff.md
/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_infra_1/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY CONSTRAINT:
Preserve all existing uncommitted working-tree modifications! Check `git status` before and after editing.

Your Objective (Milestone 1):
Implement and integrate the core Specialist base class, sheet UI, CSS, resource pools, and module registration:

1. `ak5e/scripts/specialist-rules.mjs`:
   - Export `isSpecialist(actor)`: checks if actor has `class-specialist` or identifier `specialist`.
   - Export `isExecutor(actor)`: checks if actor has `subclass-specialist-executor` or branch `executor`.
   - Export `isHookmaster(actor)`: checks if actor has `subclass-specialist-hookmaster` or branch `hookmaster`.
   - Export `isInfuser(actor)`: checks if actor has `subclass-specialist-infuser` or branch `infuser` or `infusion` (supports both).
   - Ensure `calculateSpecialistProfile(actor)` returns complete profile data including branch, level, PB, prowess, and styles.

2. `ak5e/scripts/resource-pools.mjs`:
   - Add standard registration for `prowess` pool (max `@prof`, initial 0, applies to `actor => specialistLevel(actor) >= 4 || prowessEarlyUnlocked(actor)`, recovery: `1 on sr`, `1 on lr`, label "Prowess").

3. `ak5e/scripts/specialist-sheet.mjs`:
   - Follow the pattern of `ak5e/scripts/medic-sheet.mjs` and `ak5e/scripts/vanguard-sheet.mjs`.
   - Implement `renderSpecialistSheetPanel(sheet, element)`: inject `.ak5e-specialist-sheet-panel` into `.tab[data-tab="features"]` on `ActorSheetV2`.
   - Render `.ak5e-specialist-badge` displaying Prowess (`value / max`), Specialist DC, active fighting style, and active subclass/branch.
   - Render "Open Specialist Controls" button that opens `openSpecialistControls(actor)`.
   - Implement `openSpecialistControls(actor)`: DialogV2 with buttons for Specialist active features, recent undo receipts list, and subclass controls.
   - Implement `registerSpecialistSheetHooks()`: register `renderActorSheetV2` and `getHeaderControlsApplicationV2` (header button for Specialist controls).

4. `ak5e/styles/ak5e.css`:
   - Add styling for `.ak5e-specialist-sheet-panel`, `.ak5e-specialist-badge`, and control buttons matching the established module style for `.ak5e-medic-badge` and `.ak5e-guard-badge`.

5. `ak5e/scripts/ak5e.mjs`:
   - Import `* as specialist` from `./specialist-rules.mjs`, `./specialist-features.mjs`, `./specialist-setup.mjs`, `./specialist-progression.mjs`, `./specialist-uses.mjs`, `./specialist-sheet.mjs`.
   - Wire `game.ak5e.specialist`.
   - Wire `specialistUses.handleRelay` into `createChatMessage` hook.
   - Call `registerSpecialistHooks()` in `Hooks.once("ready", ...)` or `init`.
   - Call `registerSpecialistSheetHooks()` in `ready` hook.

6. Verification:
   - Run tests:
     `npm run test:specialist`
     `node ak5e/tools/validate-files.mjs`
     `node ak5e/tools/verify-generated-content.mjs`
   - Document all commands, exit codes, and test results in your handoff report.
   - Deliver handoff report to: `/home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_2/handoff.md`.
   - Notify with `send_message` when done.
