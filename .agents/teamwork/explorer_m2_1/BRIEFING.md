# BRIEFING — 2026-10-17T01:19:05Z

## Mission
Conduct an exhaustive rules investigation of the Executor Specialist subclass and document all mechanics, numbers, state transitions, and rulings.

## 🔒 My Identity
- Archetype: explorer
- Roles: Executor Rules Explorer
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1
- Original parent: 333d6dbd-7011-4844-9df5-b166d99aee35
- Milestone: M2 (Executor Specialist subclass rules investigation)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT edit source code or test files
- Deliver handoff.md following 5-component protocol

## Current Parent
- Conversation ID: 333d6dbd-7011-4844-9df5-b166d99aee35
- Updated: 2026-10-17T01:19:05Z

## Investigation State
- **Explored paths**:
  - `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md`
  - `/home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md`
  - `/home/patch/AK5e-Foundry/AGENTS.md`, `WORKFLOW.md`, `GEMINI.md`
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5498–5578)
  - `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (lines 211–212 Martial DC, lines 224–226 Bleeding)
  - `ak5e/DECISIONS.md`
  - `TODO.md` (lines 932–941)
  - `ak5e/scripts/specialist-rules.mjs`, `specialist-features.mjs`, `specialist-uses.mjs`, `specialist-sheet.mjs`, `ak5e.mjs`
- **Key findings**:
  - Level 1: Wolf and Shepherd path choice (Hunter vs Bodyguard) is permanent in fiction, determines features across all tiers (1, 5, 11, 15, 20).
  - Deathmark State Machine: single mark exists, held by self or target; transfers on attack (`onAttackRoll` vs `onHitOnly` reading); returns on 0 HP or end of turn without attacking/damaging marked target; returns grant +3 SP and reaction Disengage; held grants +3 SP at turn start and BA Hide; damage scales +1d4 (Lv 1), +2d4 (Lv 7), +3d4 (Lv 14); Hunter +1 crit range, Bodyguard attack redirection within 10 ft without action.
  - Level 5: In Every Shadow (Climb/Swim = Walk speed, Stealth prof -> expertise); Sweeper (Hunter 1 Prowess Action while Hiding/Invisible, +5 ft reach, multi-cleave, hit cycles mark, mark returns at action end); Smokescreen (Bodyguard 1 Prowess Reaction, 10 ft magical darkness, ally reaction move); Prowess triggers (marked 0 HP 1/turn, Hunter >=30 dmg single attack, Bodyguard 10 ft 0-dmg ally attack).
  - Level 11: Preysense (Hunter +1 crit damage die & Bleeding on living target) vs Dangersense (Bodyguard reaction move together half speed out of STR/DEX save AoE; pass=0, fail=half).
  - Level 15: In for the Kill (Hunter mark transfer -> Vulnerability to attacks until end of turn) vs Blade Shield (Bodyguard reaction attack vs marked attacker, hit subtracts PB from attacker roll).
  - Level 20: Mortal Blow (Hunter 1/LR Action, teleport within Speed to 5 ft, DEX save vs Martial DC, 10d8 HP loss on fail / half on pass, doubled if Bleeding; `bypassDRResist` vs `bypassAll` reading) vs Ultimate Sword and Shield (Bodyguard Resistance to all damage from marked creature, free Blade Shield without reaction, reaction mark transfer when ally within 10 ft attacked).
- **Unexplored areas**: None for Executor; findings are complete.

## Key Decisions Made
- Structured the complete specification and design contracts for `executor-features.mjs`, `specialist-uses.mjs` plans, and `executor.test.mjs` in `handoff.md`.

## Artifact Index
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/DISPATCH.md` — Incoming assignment
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/BRIEFING.md` — Persistent state
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/progress.md` — Heartbeat log
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/handoff.md` — Final deliverable report
