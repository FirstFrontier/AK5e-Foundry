# BRIEFING — 2026-10-20T02:15:30Z

## Mission
Investigate the existing Specialist base class and subclass implementations (Executor, Hookmaster, Infuser) to map architectural patterns, file conventions, test structures, and integration points for the upcoming Inventor subclass.

## 🔒 My Identity
- Archetype: explorer
- Roles: Codebase Architecture Explorer, Synthesizer
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1
- Original parent: cf5c8a2a-802f-473e-8274-6566de462e7c
- Milestone: Inventor Subclass Architecture Discovery

## 🔒 Key Constraints
- Read-only investigation — do NOT implement code or modify project files
- Write only to /home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/
- Extract patterns with exact file paths, line numbers, and code examples
- Adhere to WORKFLOW §3.2 (Trust the table, warning overrides, interactive buttons, undo receipts, no auto-rolls)
- Keep BRIEFING.md under ~100 lines and preserve 🔒 sections

## Current Parent
- Conversation ID: cf5c8a2a-802f-473e-8274-6566de462e7c
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ak5e/scripts/specialist-rules.mjs`
  - `ak5e/scripts/specialist-progression.mjs`
  - `ak5e/scripts/specialist-features.mjs`
  - `ak5e/scripts/specialist-setup.mjs`
  - `ak5e/scripts/specialist-uses.mjs`
  - `ak5e/scripts/specialist-sheet.mjs`
  - `ak5e/scripts/infuser-features.mjs`
  - `ak5e/scripts/hookmaster-features.mjs`
  - `ak5e/scripts/executor-features.mjs`
  - `ak5e/scripts/ak5e.mjs`
  - `ak5e/scripts/resource-pools.mjs`
  - `ak5e/scripts/play-uses.mjs` & `play-uses-sheet.mjs`
  - `ak5e/test/infuser.test.mjs` & `package.json`
  - `ak5e/tools/test-specialist-live.mjs`
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (L5847–6140)
- **Key findings**:
  1. `isInventor(actor)`: Needs export in `specialist-rules.mjs` and exposure on `game.ak5e.specialist`.
  2. Pool registration: `inventions` pool max `@prof * 2`, initial `"max"`, recovery on Long Rest, appliesTo `isInventor(actor)`.
  3. Modifications: Stored on Item document in `flags.ak5e.modifications` (array of mod objects) with duplicate prevention, consuming 1 Invention per mod.
  4. Instability: Dynamic formula (base 3, +1 per extra mod, +1 per Dangerous mod, -1 if matching Weapon Spec at Lv 11, -1 if self-wielded at Lv 11).
  5. Interactive Breakdown: Uses `awaitingRoll` status on receipt with interactive card button for `rollInstability` (roll Nd6, test for duplicate faces, if match -> lose (Instability - 2)d8 HP, clamp at 1 HP, damage item if Dangerous).
  6. GM Relay & Receipts: `validateTarget` on plan functions; undo receipts under `flags.ak5e.specialistUses.undo`.
  7. Sheet UI: Badges and controls injected in `renderSpecialistControls` via `ActorSheetV2`.
  8. Testing: Dual test files (`inventor.test.mjs` and `inventor-adversarial.test.mjs`), included in `test:specialist`, verified live browser harness in `test-specialist-live.mjs`.
- **Unexplored areas**: None. All 5 deliverable areas fully researched and mapped.

## Key Decisions Made
- Structure handoff report with exact code examples, before/after snippets, formulas, and file paths.

## Artifact Index
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/DISPATCH.md` — Dispatch instructions
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/BRIEFING.md` — Situational memory
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/progress.md` — Liveness & heartbeat
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_inventor_1/handoff.md` — Comprehensive handoff report
