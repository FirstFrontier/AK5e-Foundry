# BRIEFING — 2026-10-12T00:11:45Z

## Mission
Investigate the existing Guard class architecture and determine exact patterns for adding Duellist, Liberator, and Lord subclasses compliant with WORKFLOW.md §3.2.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, codebase investigator
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch
- Original parent: 974e395c-0c68-4c40-8c3b-716099842a8b
- Milestone: Guard Subclass Architecture Exploration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- No modification of code outside working directory
- Follow WORKFLOW.md §3.2, AGENTS.md, GEMINI.md
- Use send_message to report back to parent

## Current Parent
- Conversation ID: 974e395c-0c68-4c40-8c3b-716099842a8b
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`, `WORKFLOW.md`, `AGENTS.md`, `GEMINI.md`
  - `ak5e/scripts/guard-uses.mjs`, `ak5e/scripts/play-uses.mjs`, `ak5e/scripts/play-uses-sheet.mjs`
  - `ak5e/scripts/guard-sheet.mjs`, `ak5e/scripts/guard-rules.mjs`, `ak5e/scripts/guard-features.mjs`
  - `ak5e/scripts/resource-pools.mjs`, `ak5e/scripts/operation-kernel.mjs`
  - Existing subclasses: `centurion-features.mjs`, `crusher-features.mjs`, `instructor-features.mjs`, `artsblade-features.mjs`, `brawler-features.mjs`
  - Source rules in `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt`:
    - Duellist: L2739–2845
    - Liberator: L2937–3039
    - Lord: L3109–3248
  - Test suites: `guard-fixture.mjs`, `guard-features.test.mjs`, `centurion.test.mjs`, `tools/test-guard-live.mjs`
- **Key findings**:
  - Guard uses `createPlayUses` (`guardUses`) with namespace `guardUses`, receipts stored under `flags.ak5e.guardUses.undo`.
  - All subclasses register plans via `guardUses.register({ plans })`.
  - WORKFLOW.md §3.2 table-play requirements: player ownership gating (no GM approval for play), unowned targets relayed automatically through active GM client via `operation-kernel.mjs`, warning/override system ("Use anyway"), zero auto-rolling of dice, resource clamping at 0 with shortfall reporting, encounter-window reversibility.
  - Recommended blueprint creates `duellist-features.mjs`, `liberator-features.mjs`, and `lord-features.mjs` following established Centurion/Brawler patterns.
- **Unexplored areas**: None for architecture exploration. All requested areas thoroughly analyzed.

## Key Decisions Made
- Confirmed that each new subclass should reside in its own dedicated feature module (`ak5e/scripts/<subclass>-features.mjs`) registering plans directly with `guardUses`.
- Pools (`duellistPoints`, `grandChallenge`, `liberty`, `revolution`, `manifestation`, `forceOfWill`) defined via `definePool` in `resource-pools.mjs` pattern to ensure clamping and delta undo restoration.
- Completed full 5-component handoff report at `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/handoff.md`.

## Artifact Index
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/DISPATCH.md — Incoming task assignments
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/BRIEFING.md — Situational awareness and working memory
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/progress.md — Heartbeat and step progress
- /home/patch/AK5e-Foundry/.agents/teamwork/explorer_guard_arch/handoff.md — Final 5-component handoff report
