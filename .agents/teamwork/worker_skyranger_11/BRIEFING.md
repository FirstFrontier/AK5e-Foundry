# BRIEFING — 2026-10-24T03:45:00Z

## Mission
Implement the complete Skyranger Specialist branch in ak5e/scripts/skyranger-features.mjs and comprehensive tests in ak5e/test/skyranger.test.mjs.

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/worker_skyranger_11
- Original parent: f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07
- Milestone: Skyranger Specialist Branch (Milestone 1)

## 🔒 Key Constraints
- Exclusive file ownership: ONLY edit `ak5e/scripts/skyranger-features.mjs` and `ak5e/test/skyranger.test.mjs`.
- Do NOT touch `specialist-rules.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`, or any other file.
- Rules Authority: `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 6145–6262).
- Zero cheating, zero facade/dummy implementations, full real state and behavior.
- Run `node --test ak5e/test/skyranger.test.mjs` to achieve 100% pass rate.
- Adhere to WORKFLOW.md §3.2 table-play philosophy.

## Current Parent
- Conversation ID: f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07
- Updated: 2026-10-24T03:45:00Z

## Task Summary
- **What to build**: Complete functional model of Skyranger Specialist branch:
  1. Flight Suit starting equipment (AC 12+Dex, 0 DR, 25 lb, 650 LMD, 24 hr crafting).
  2. Fuel pool scaling (2 to 8 across levels, Long Rest recovery).
  3. Take Off: Bonus action, 1 Fuel -> 1 min Fly speed equal to walk speed.
  4. Strafe Damage progression lookup: Lv 1-4: 0, Lv 5-7: 5d8, Lv 8-10: 6d8, Lv 11-13: 7d8, Lv 14-16: 8d8, Lv 17-19: 9d8, Lv 20: 10d8.
  5. Air Doctrine rest selection (Air Superiority, Bombardment, Close Air Support) and action logic:
     - AA Missile: 1 Fuel, 100 ft, DEX save vs Martial DC, Thunder = Strafe Damage (half on save), max dice if target not touching ground.
     - Bombing Run: 1 Fuel, 30 ft (or 120 ft if flying), 15 ft radius, DEX save vs Martial DC, Thunder = Strafe Damage (half on save).
     - Swooping Dive: 1 Fuel, move up to Speed as part of Attack Action, advantage on attack within 10 ft, +Strafe Damage Thunder on hit (1/turn).
  6. Jink (Lv 5):
     - Evasive Manoeuvres: Reaction, 1 Prowess -> +PB AC until next turn; if still hits, damage halved.
     - Aerial Prowess gain triggers (1/turn limit).
  7. Advanced Doctrine (Lv 11):
     - Air Superiority Crash AoE: non-ground target 0 HP -> crash point <= 2x height, 10 ft radius DEX save vs Martial DC or half Strafe Damage (Thunder).
     - Bombardment: Firebomb (remove 3d8, Fire damage + Burning on fail) / Gas Strike (remove 3d8, Poison damage + Poisoned until end of next turn + breathing difficult terrain).
     - Close Air Support: Hit targets have Disadvantage on attacks vs Skyranger until start of next turn; Strafe Damage hit -> WIS save vs Martial DC or Frightened until end of next turn.
  8. Afterburners (Lv 15):
     - Reaction movement up to Speed as part of Evasive Manoeuvres.
     - When moving within 10 ft of a creature while AC is increased by Evasive Manoeuvres (1/turn), DEX save vs Martial DC or Strafe Damage (Fire).
  9. Skyscreamer (Lv 20):
     - 1/LR Action: Combat Mode for 1 minute.
     - Multirole: all 3 Air Doctrines simultaneously.
     - Free Fuel for Air Doctrine features during Combat Mode.
     - Core Cannon & Core Saber special weapon definitions and attacks.
- **Success criteria**: 100% tests pass, full source fidelity, complete documentation.

## Change Tracker
- **Files modified**:
  - `ak5e/scripts/skyranger-features.mjs`: full Skyranger branch logic, data models, pools, and hooks.
  - `ak5e/test/skyranger.test.mjs`: 19 comprehensive unit and adversarial tests.
- **Build status**: Pass (19/19 Skyranger tests green, 48/48 core Specialist tests green, validate-files 0 errors).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: Pass (19/19 tests).
- **Lint status**: 0 violations.
- **Tests added/modified**: `ak5e/test/skyranger.test.mjs` (19 test suites, covering all 9 required features and adversarial boundary cases).

## Loaded Skills
- None.
