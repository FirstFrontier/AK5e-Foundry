# BRIEFING — 2026-10-17T01:21:00Z

## Mission
Investigate the codebase architecture to design the implementation for Milestone 2: Executor Subclass, producing a comprehensive architectural and test design handoff report.

## 🔒 My Identity
- Archetype: explorer
- Roles: Executor Architecture Explorer
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_2
- Original parent: 333d6dbd-7011-4844-9df5-b166d99aee35
- Milestone: Milestone 2 (Executor Subclass)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT edit source code or test files
- Write only to /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_2/
- Follow WORKFLOW.md, AGENTS.md, GEMINI.md, and WORKFLOW §3.2 table-play philosophy

## Current Parent
- Conversation ID: 333d6dbd-7011-4844-9df5-b166d99aee35
- Updated: 2026-10-17T01:21:00Z

## Investigation State
- **Explored paths**:
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5498–5578)
  - `ak5e/scripts/specialist-rules.mjs`
  - `ak5e/scripts/specialist-features.mjs`
  - `ak5e/scripts/specialist-setup.mjs`
  - `ak5e/scripts/specialist-progression.mjs`
  - `ak5e/scripts/specialist-uses.mjs`
  - `ak5e/scripts/specialist-sheet.mjs`
  - `ak5e/scripts/ak5e.mjs`
  - `ak5e/scripts/centurion-features.mjs`
  - `ak5e/scripts/duellist-features.mjs`
  - `ak5e/scripts/play-uses.mjs`
  - `ak5e/scripts/trigger-events.mjs`
  - `ak5e/test/specialist-*.test.mjs` (all 48 tests verified passing)
  - `ak5e/test/base-classes-fixture.mjs`
- **Key findings**:
  - State model: `flags.ak5e.executor` tracks `path` ("hunter" | "bodyguard"), `deathmark` (`held`, `holder`, `targetUuid`, `targetName`, `transferredTurn`, `attackedOrDamagedThisTurn`), `sweeper`, `smokescreen`, and `prowessTriggers`.
  - Exported functions: `isExecutor`, `getExecutorPath`, `getDeathmarkState`, `setDeathmark`, `recallDeathmark`, `clearDeathmark`, `calculateDeathmarkDamageBonus`, and feature predicates.
  - Hooks: `dnd5e.preRollAttackV2` (crit range +1 for Hunter vs marked), `dnd5e.preRollDamageV2` (+1d4/+2d4/+3d4 damage, Preysense +1 crit die), `onAk5eEvent("attack"/"hit")` (mark transfer, Hunter >=30 dmg prowess), `onAk5eEvent("crit")` (inflict Bleeding), `onAk5eEvent("kill")` (marked 0 HP return, +3 SP, reaction Disengage, +1 prowess), `onAk5eEvent("turnStart")` (held mark +3 SP), `onAk5eEvent("turnEnd")` (mark return if unattacked, Sweeper end, Bodyguard 10 ft ally prowess).
  - Table-play plans in `specialist-uses.mjs`: `transferDeathmark`, `recallDeathmark`, `sweeper`, `smokescreen`, `mortalBlow`, `bladeShield`, `attackRedirection`, `dangersense` with confirmations, non-blocking warnings ("Use anyway"), resource clamping at 0, interactive roll cards (10d8 Mortal Blow), GM relay with `validateTarget`, and encounter-window undo receipts.
  - Rulings: `deathmarkTransferTiming` (`onAttackRoll` vs `onHitOnly`), `mortalBlowReading` (`bypassDRResist` vs `bypassAll`).
  - Sheet integration in `specialist-sheet.mjs`: dynamic badge `Deathmark: Held/Marked (Path)` and interactive action controls dialog for Executor actions.
  - Test strategy: `ak5e/test/executor.test.mjs` testing all 12 functional areas with `base-classes-fixture.mjs`.
- **Unexplored areas**: None. Architectural design is complete.

## Key Decisions Made
- Designed unified plan registry lookup in `specialist-uses.mjs` so subclass plans registered via `specialistUses.register({ plans })` are accessible to `specialistUses.plan()`.
- Modeled Deathmark state with `held: true, holder: "self"` as the natural default state when an Executor begins play.
- Provided explicit support for both table readings (`deathmarkTransferTiming` and `mortalBlowReading`) in `specialistUses.readings()`.

## Artifact Index
- `DISPATCH.md` — Initial dispatch message
- `BRIEFING.md` — Working memory and situational awareness
- `progress.md` — Heartbeat log
- `handoff.md` — Comprehensive architectural and test design handoff report
