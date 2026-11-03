# BRIEFING — 2026-10-20T02:37:00Z

## Mission
Implement Milestone 1 of the AK5e Inventor subclass (Specialist): chassis, DC, resource pools, Instability engine, Breakdown rolls with matching dice detection and HP loss clamping, equipment modification application/removal and repair, progression wiring, ak5e.mjs wiring, DECISIONS.md rulings, and comprehensive unit tests.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1/
- Original parent: 7c128871-a90d-4b87-a96b-0f976db806d5
- Milestone: Milestone 1: Specialist Base Class, Sheet UI & Module Integration
- Reassigned Parent: cf5c8a2a-802f-473e-8274-6566de462e7c
- Current Milestone: Milestone 1: Inventor Core Implementer (Chassis, Instability, Breakdown, Modifications Engine, Progression)

## 🔒 Key Constraints
- Preserve all existing uncommitted working-tree modifications! Check `git status` before and after editing.
- Integrity Mandate: No cheating, no dummy/facade implementations, no hardcoded test results.
- Code layout compliance: do not place code or tests in .agents/teamwork/.
- Follow minimal change principle and existing patterns from medic-sheet.mjs, vanguard-sheet.mjs, etc.
- Allowed write files:
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/inventor-features.mjs
  - ak5e/scripts/specialist-progression.mjs
  - ak5e/scripts/ak5e.mjs
  - ak5e/test/inventor.test.mjs
  - ak5e/DECISIONS.md
  - Files in /home/patch/AK5e-Foundry/.agents/teamwork/worker_m1/

## Current Parent
- Conversation ID: cf5c8a2a-802f-473e-8274-6566de462e7c
- Updated: 2026-10-20T02:37:00Z

## Task Summary
- **What to build**:
  1. `specialist-rules.mjs`:
     - `isInventor(actor)` predicate.
     - `calculateInventorDC(actor)` = `8 + intMod + pb`.
     - Register `inventions` pool (`max: "@prof * 2"`, `initial: "max"`, `recovery: [{ on: "lr", amount: "toMax" }]`, `appliesTo: isInventor`).
     - Register `theBigOne` pool (`max: 1` at level 20).
  2. `inventor-features.mjs`:
     - `calculateInstability(item, actor, options)`
     - `evaluateBreakdownRoll(rollResults, instability, activatedMod)`
     - `applyEquipmentModification(item, modificationId, options)`
     - `removeEquipmentModification(item, modificationId, options)`
     - `repairBrokenEquipment(item, actor, options)`
     - `isBrokenEquipment(item)`
     - Initial modification catalog schema with 28 catalogued modifications.
  3. `specialist-progression.mjs`:
     - Inventor subclass progression at levels 1, 3, 5, 11, 15, 20.
  4. `ak5e.mjs`:
     - Wire `game.ak5e.specialist.inventor` and `game.ak5e.specialist.isInventor`.
  5. `ak5e/DECISIONS.md`:
     - Log rulings for Dangerous mod extra instability/breakdown rider, Melee Attachment attack modifier reading, and Instability roll timing.
  6. `ak5e/test/inventor.test.mjs`:
     - Comprehensive unit test suite covering all Milestone 1 features.
- **Success criteria**:
  - `node --test ak5e/test/inventor.test.mjs` passes 100% (14/14 pass).
  - `node ak5e/tools/validate-files.mjs` exits 0.
  - Complete specialist regression suite passes 100% (127/127 pass).

## Key Decisions Made
- Pool registration exported as both `registerInventorPools` and `defineInventorPools`.
- Instability clamped at minimum 1; breakdown checks for duplicate dice faces in Nd6 roll.
- Breakdown HP loss clamped to never reduce target below 1 HP.
- Equipment damage on breakdown triggers only when activating a Dangerous modification.
- Logged rulings in DECISIONS.md for Dangerous breakdown rider, Melee Attachment DEX vs DEX+PB reading, and Instability roll timing on activation only.

## Artifact Index
- ak5e/scripts/specialist-rules.mjs
- ak5e/scripts/inventor-features.mjs
- ak5e/scripts/specialist-progression.mjs
- ak5e/scripts/ak5e.mjs
- ak5e/test/inventor.test.mjs
- ak5e/DECISIONS.md

## Change Tracker
- **Files modified**:
  - `ak5e/scripts/specialist-rules.mjs`: added isInventor, calculateInventorDC, registerInventorPools, defineInventorPools, profile dc.inventor and resources.inventions
  - `ak5e/scripts/inventor-features.mjs`: authored complete Instability engine, breakdown roll evaluation, equipment modification application/removal/repair, catalog of 28 modifications
  - `ak5e/scripts/specialist-progression.mjs`: wired INVENTOR_PROGRESSION_FEATURES and previewSpecialistProgression branch feature creation
  - `ak5e/scripts/ak5e.mjs`: wired specialist.isInventor and specialist.inventor API, registered inventor hooks
  - `ak5e/DECISIONS.md`: logged 3 rulings for Dangerous modifications rider, Melee Attachment damage reading, and Instability roll timing
  - `ak5e/test/inventor.test.mjs`: 14 comprehensive test suites covering all Milestone 1 features
- **Build status**: PASS (node --test ak5e/test/inventor.test.mjs: 14 pass, 0 fail; full specialist test: 127 pass, 0 fail; validate-files: 0 errors)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (14/14 inventor tests green, 127/127 specialist regression green)
- **Lint status**: clean (node ak5e/tools/validate-files.mjs validated 287 files with 0 errors)
- **Tests added/modified**: 14 test areas in ak5e/test/inventor.test.mjs
