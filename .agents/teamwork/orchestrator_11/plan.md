# Project Plan: Specialist Branches (Skyranger, Dollkeeper, Trapmaster)

## Architecture & Code Layout
- `ak5e/scripts/skyranger-features.mjs`: Pure functional mechanics for Skyranger (Flight Suit, Fuel pool, Strafe Damage, Air Doctrines, Jink, Advanced Doctrines, Afterburners, Skyscreamer).
- `ak5e/scripts/dollkeeper-features.mjs`: Pure functional mechanics for Dollkeeper (Living Doll companion construct, synchronization, Pull the Strings, Musical Chairs, Masquerade, Reciprocity, Artistry is Violence).
- `ak5e/scripts/trapmaster-features.mjs`: Pure functional mechanics for Trapmaster (Traps pool, Trap DC, 8 trap schemas, Detection/Disarm, Panic Inducer, Here's One I Made Earlier, Bait the Trap, Agent of Chaos, House of Horrors).
- `ak5e/scripts/specialist-rules.mjs`: Base class rules, predicates (`isSkyranger`, `isDollkeeper`, `isTrapmaster`), pool registrations (`fuel`, `traps`, `comeAndGetMe`, `mistakenIdentity`), and DC calculators.
- `ak5e/scripts/specialist-progression.mjs`: Automatic feature grants for all 3 subclasses across levels 1, 5, 11, 15, and 20.
- `ak5e/scripts/specialist-uses.mjs`: Table-play interactive action plans with confirmation, non-blocking warning overrides, zero clamping, GM relay, and undo receipts.
- `ak5e/scripts/specialist-sheet.mjs`: ActorSheetV2 badges (Fuel, Doll status, Traps, Trap DC) and action controls.
- `ak5e/scripts/ak5e.mjs`: API exposure on `game.ak5e.specialist` and event hooks.
- `ak5e/test/skyranger.test.mjs`: Subsystem unit and adversarial tests for Skyranger.
- `ak5e/test/dollkeeper.test.mjs`: Subsystem unit and adversarial tests for Dollkeeper.
- `ak5e/test/trapmaster.test.mjs`: Subsystem unit and adversarial tests for Trapmaster.
- `ak5e/tools/test-specialist-live.mjs`: In-Foundry Playwright browser test with `launchTestBrowser()`.

## Milestones
| # | Name | Scope & File Ownership | Dependencies | Status |
|---|------|------------------------|--------------|--------|
| M1 | Skyranger Subclass Subsystem | `ak5e/scripts/skyranger-features.mjs`, `ak5e/test/skyranger.test.mjs` | None | DONE |
| M2 | Dollkeeper Subclass Subsystem | `ak5e/scripts/dollkeeper-features.mjs`, `ak5e/test/dollkeeper.test.mjs` | None | DONE |
| M3 | Trapmaster Subclass Subsystem | `ak5e/scripts/trapmaster-features.mjs`, `ak5e/test/trapmaster.test.mjs` | None | DONE |
| M4 | Core Specialist Integration & UI | `specialist-rules.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`, `specialist-sheet.mjs`, `ak5e.mjs`, `DECISIONS.md`, `TODO.md` | M1, M2, M3 | DONE |
| M4.5 | Adversarial Verification Pairs | Dedicated adversarial test suites (`skyranger-adversarial.test.mjs`, `dollkeeper-adversarial.test.mjs`, `trapmaster-adversarial.test.mjs`) probing edge cases, shortfall clamping, non-blocking warnings, and undo reversibility | M4 | DONE |
| M5 | Regression, Live Browser & Screenshots | `test-specialist-live.mjs`, screenshot capture and validation per AGENTS.md §6.2 | M4.5 | DONE |

## Concurrency Guardrail
- Maximum concurrent subagents: <= 4.
- M1, M2, M3 executed in parallel (3 concurrent workers).
- M4 executes with 1 integration worker.
- M4.5 executes with adversarial challengers (up to 3 concurrent challengers, within the 4-agent cap).
- M5 executes live testing and screenshot inspection.
