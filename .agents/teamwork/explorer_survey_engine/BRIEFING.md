# BRIEFING — 2026-10-12T11:40:00Z

## Mission
Survey AK5e Foundry VTT codebase architecture across class representation, resource pools, operation kernel, sheet integration, and architectural recommendations for upcoming classes (Vanguard, Supporter, Specialist, Medic).

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_survey_engine
- Original parent: 1cea36a2-b300-4df5-b00b-f3243731611c
- Milestone: Engine and architecture survey for AK5e classes and runtime

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify any source code or run any build commands
- Follow AGENTS.md, WORKFLOW.md, GEMINI.md

## Current Parent
- Conversation ID: 1cea36a2-b300-4df5-b00b-f3243731611c
- Updated: 2026-10-12T11:32:40Z

## Investigation State
- **Explored paths**:
  - `ak5e/scripts/guard-setup.mjs`, `guard-progression.mjs`, `guard-rules.mjs`, `guard-features.mjs`, `guard-uses.mjs`, `guard-sheet.mjs`
  - `ak5e/scripts/resource-pools.mjs`
  - `ak5e/scripts/operation-kernel.mjs`, `play-uses.mjs`, `play-undo.mjs`, `play-uses-sheet.mjs`
  - `ak5e/scripts/chapter-three-content.mjs`, `class-content-installation.mjs`, `tools/build-chapter-three-content.mjs`
  - `ak5e/scripts/ak5e.mjs`, `operator-progression.mjs`, `operator-sheet.mjs`
  - Source rules in `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` for Vanguard (L7904–8085), Supporter (L6548–6692), Specialist (L5161–5493), Medic (L4560–4871)
- **Key findings**:
  - Identified complete established class architecture pattern (`<class>-rules`, `<class>-setup`, `<class>-progression`, `<class>-features`, `<class>-uses`, `<class>-sheet`).
  - Confirmed all 4 target base classes (`class-vanguard`, `class-supporter`, `class-specialist`, `class-medic`) and their features already exist with stable IDs in `CHAPTER_THREE_CLASSES`.
  - Mapped resource pool specifications for `prowess` (Specialist, max `@prof`), `aidDie` (Supporter, max ability mod, d8->d10->d12), and `lifeSupport` (Medic, max 20->170 table, `overMax: true`).
  - Verified table-play and undo framework in `play-uses.mjs` / `play-undo.mjs` / `play-uses-sheet.mjs`: confirm dialogs, "Use anyway" overrides, public shortfall notices, zero-clamping, unowned target GM relay, and encounter-window epoch locking.
  - Verified ActorSheetV2 injection patterns via `getHeaderControlsApplicationV2` and `renderActorSheetV2` in `.tab[data-tab="features"]`.
- **Unexplored areas**: None for engine architecture survey.

## Key Decisions Made
- Completed systematic read-only investigation and compiled architectural recommendations for Vanguard, Supporter, Specialist, and Medic.

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_survey_engine/progress.md — Progress tracking and heartbeat
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_survey_engine/handoff.md — Final 5-component handoff report
