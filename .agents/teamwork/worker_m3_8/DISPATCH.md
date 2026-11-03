## 2026-10-17T02:24:49Z

Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/worker_m3_8/.
You are the Implementer Worker for Milestone 3: Hookmaster Subclass Implementation & Tests.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Explorer Handoff Report: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/handoff.md
- Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5585–5679)
- Reference Subclass: /home/patch/AK5e-Foundry/ak5e/scripts/executor-features.mjs
- Existing files:
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-features.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-uses.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-sheet.mjs
  - /home/patch/AK5e-Foundry/ak5e/scripts/ak5e.mjs
  - /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs
  - /home/patch/AK5e-Foundry/ak5e/test/executor.test.mjs

File Ownership & Scope:
- Exclusively create:
  - `ak5e/scripts/hookmaster-features.mjs`
  - `ak5e/test/hookmaster.test.mjs`
Integrate into existing files:
  - `ak5e/scripts/specialist-uses.mjs` (register Hookmaster plans in `ALL_PLANS` and any readings)
  - `ak5e/scripts/specialist-sheet.mjs` (Hooked Weapon status badge and action buttons in `openSpecialistControls`)
  - `ak5e/scripts/ak5e.mjs` (export `hookmaster` under `game.ak5e.specialist` and call `registerHookmasterHooks()`)

## 2026-10-17T02:35:06Z
**Context**: Milestone 3 Hookmaster Implementation
**Content**: Safety timer triggered (10 minutes elapsed). Checking on your implementation status.
**Action**: Please report your current progress and ETA for handoff.md.

