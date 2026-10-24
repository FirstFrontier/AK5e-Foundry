# BRIEFING — 2026-10-16T12:17:10Z

## Mission
Implement Milestone 1 of the AK5e Specialist Project: predicate exports, prowess resource pool registration, specialist sheet integration with ActorSheetV2, styling, and ak5e.mjs hook wiring.

## 🔒 My Identity
- Archetype: worker_m1_7
- Roles: implementer, qa, specialist
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_7
- Original parent: 5c764546-11aa-456d-878c-ae694aecfc0f
- Milestone: Milestone 1

## 🔒 Key Constraints
- Preserve all existing uncommitted working-tree modifications.
- DO NOT CHEAT: genuine logic only, no hardcoded test results, real state and behavior.
- EXCLUSIVE WRITE SCOPE:
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/resource-pools.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/styles/ak5e.css
  - ak5e/scripts/ak5e.mjs
  - Metadata files in /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1_7/

## Current Parent
- Conversation ID: 5c764546-11aa-456d-878c-ae694aecfc0f
- Updated: 2026-10-16T12:06:11Z

## Task Summary
- **What to build**:
  1. `specialist-rules.mjs`: Export predicates (`isSpecialist`, `isExecutor`, `isHookmaster`, `isInfuser`), ensure branch mapping handles "infuser" and "infusion" gracefully in `specialistProfile`, item matching, and state fallback, keep calculations pure.
  2. `resource-pools.mjs`: Register `prowess` resource pool system-wide via `definePool` (max `@prof`, initial 0, applies to Specialist level >= 4 or early unlock, SR +1, LR +1).
  3. `specialist-sheet.mjs`: Author ActorSheetV2 integration: inject `.ak5e-specialist-sheet-panel` into `.tab[data-tab="features"]` with Prowess badge (`value / max`), subclass badges (Deathmark, Hooked weapon, Active Infusions), "Open Specialist Controls" button; window header control button; interactive `openSpecialistControls(actor)` dialog; export `registerSpecialistSheetHooks()`.
  4. `ak5e.css`: Add styles for `.ak5e-specialist-sheet-panel`, `.ak5e-specialist-badges`, `.ak5e-specialist-badge`, and controls.
  5. `ak5e.mjs`: Import specialist modules, expose `game.ak5e.specialist`, wire `registerSpecialistHooks()` in `ready`, wire `specialistUses.handleRelay` in `createChatMessage`, wire `registerSpecialistSheetHooks()`.
- **Success criteria**:
  - `node --test ak5e/test/specialist-*.test.mjs` passes 48/48 tests cleanly (verified).
  - `node ak5e/tools/validate-files.mjs` exits 0 (verified, 267 files).
  - `node ak5e/tools/verify-generated-content.mjs` exits 0 (verified).

## Key Decisions Made
- Canonical `SPECIALIST_BRANCH_IDS` and `IMPLEMENTED_SPECIALIST_BRANCHES` retain the 7 compendium items, while `specialistProfile`, `isInfuser`, and state fallbacks gracefully handle both `"infuser"` and `"infusion"` without errors or blocked branch state.
- In `specialist-sheet.mjs`, fallback dialog support is provided via `foundry.applications.api.DialogV2` or `Dialog` to ensure safe operation across test and runtime environments.

## Artifact Index
- `.agents/teamwork/worker_m1_7/DISPATCH.md` — assignment
- `.agents/teamwork/worker_m1_7/BRIEFING.md` — persistent memory
- `.agents/teamwork/worker_m1_7/progress.md` — liveness heartbeat
- `.agents/teamwork/worker_m1_7/handoff.md` — final handoff report
- `ak5e/scripts/specialist-sheet.mjs` — newly authored ActorSheetV2 panel and dialog controller

## Change Tracker
- **Files modified**:
  - `ak5e/scripts/specialist-rules.mjs`: Enhanced `specialistProfile` and `isInfuser` to gracefully resolve both "infuser" and "infusion".
  - `ak5e/scripts/resource-pools.mjs`: Confirmed and registered `prowess` pool with max `@prof`, initial 0, appliesTo level >= 4 / early unlock, +1 SR / +1 LR recovery.
  - `ak5e/scripts/specialist-sheet.mjs`: Created sheet module with panel injection, badges, header buttons, dialog controller, and hooks.
  - `ak5e/styles/ak5e.css`: Appended CSS rules for `.ak5e-specialist-sheet-panel`, `.ak5e-specialist-badges`, `.ak5e-specialist-badge`, and controls dialog.
  - `ak5e/scripts/ak5e.mjs`: Imported specialist modules, exposed `game.ak5e.specialist`, wired lifecycle hooks and chat relay.
- **Build status**: All tests and static checks pass cleanly (exit 0).
- **Pending issues**: None for Milestone 1.

## Quality Status
- **Build/test result**: PASS (48/48 specialist tests pass, 71/71 resource pools and kernel tests pass).
- **Lint status**: PASS (267 .mjs files validated with syntax check).
- **Tests added/modified**: Verified all existing suites against Milestone 1 deliverables.

## Loaded Skills
- None
