## 2026-10-16T12:06:11Z
You are worker_m1_7, a Gemini 3.8 worker implementing Milestone 1 of the AK5e Specialist Project.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_7/
Parent orchestrator conversation ID: 5c764546-11aa-456d-878c-ae694aecfc0f

MANDATORY INSTRUCTIONS:
1. You MUST read the full original request before starting work:
   /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically section ## 2026-10-16T12:01:23Z)
2. Also read the scope document:
   /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_7/SCOPE.md
   And prior explorer survey:
   /home/patch/AK5e-Foundry/.agents/teamwork/explorer_code_1/handoff.md
3. Preserve all existing uncommitted working-tree modifications.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE SCOPE:
You own and may ONLY edit or create the following files:
- ak5e/scripts/specialist-rules.mjs
- ak5e/scripts/resource-pools.mjs
- ak5e/scripts/specialist-sheet.mjs (new file)
- ak5e/styles/ak5e.css
- ak5e/scripts/ak5e.mjs
- Your own metadata files in /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_7/ (DISPATCH.md, BRIEFING.md, progress.md, handoff.md)

TASK OBJECTIVES FOR MILESTONE 1:
1. In `ak5e/scripts/specialist-rules.mjs`:
   - Export predicates: `isSpecialist(actor)`, `isExecutor(actor)`, `isHookmaster(actor)`, `isInfuser(actor)`.
   - Ensure `specialistBranch(actor)` and branch mapping handles both `"infuser"` and `"infusion"` gracefully.
   - Keep calculations pure, without direct database mutations.
2. In `ak5e/scripts/resource-pools.mjs`:
   - Register the `prowess` resource pool system-wide via `definePool` with max `@prof`, initial 0, applies to Specialist level >= 4 (or early unlock), short rest recovery: +1, long rest recovery: +1 (matching Ch. 3 L5312–5320).
3. Author `ak5e/scripts/specialist-sheet.mjs`:
   - Integrate with `ActorSheetV2` (following patterns from `medic-sheet.mjs` and `guard-sheet.mjs`).
   - In features tab (`.tab[data-tab="features"]`), inject `.ak5e-specialist-sheet-panel` containing:
     - `.ak5e-specialist-badge` for Prowess pool (`value / max`),
     - Subclass badge (Deathmark state for Executor, Hooked weapon status for Hookmaster, Active Infusions count for Infuser),
     - "Open Specialist Controls" button.
   - Inject window header control button in `getHeaderControlsApplicationV2` or sheet header.
   - Implement `openSpecialistControls(actor)` dialog to trigger active specialist uses and display/revert recent undo receipts.
   - Export `registerSpecialistSheetHooks()`.
4. In `ak5e/styles/ak5e.css`:
   - Add styles for `.ak5e-specialist-sheet-panel`, `.ak5e-specialist-badge`, and controls.
5. In `ak5e/scripts/ak5e.mjs`:
   - Import specialist modules (`specialistRules`, `specialistSetup`, `specialistProgression`, `specialistFeatures`, `specialistUses`, `specialistSheet`).
   - Expose `game.ak5e.specialist`.
   - Register `registerSpecialistHooks()` in `Hooks.once("ready", ...)`.
   - Wire `specialistUses.handleRelay` into `Hooks.on("createChatMessage", ...)`.
   - Wire `registerSpecialistSheetHooks()` into sheet rendering hooks.
6. Verification & Quality Gates:
   - Run existing unit tests: `node --test ak5e/test/specialist-*.test.mjs` (must pass 48/48 tests cleanly).
   - Run static checks: `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` (must exit 0).
   - Document verification commands, outputs, and exit codes in `handoff.md`.
7. Write `handoff.md` in your directory following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method) and send a completion message to the parent orchestrator via `send_message`.
