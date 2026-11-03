# BRIEFING — 2026-10-17T02:23:55Z

## Mission
Exhaustively investigate the Hookmaster Specialist subclass rules and codebase architecture to produce the complete architectural and test blueprint.

## 🔒 My Identity
- Archetype: explorer
- Roles: Hookmaster Rules & Architecture Explorer
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1
- Original parent: 333d6dbd-7011-4844-9df5-b166d99aee35
- Milestone: Milestone 3 - Hookmaster Specialist Subclass

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT edit source code or test files directly
- Write all findings and blueprints to handoff.md and report to parent via send_message
- Strict adherence to WORKFLOW §3.2 (confirmations, non-blocking warnings, 0-clamping, no auto-rolled dice, GM relay via validateTarget, and encounter-window undo receipts)

## Current Parent
- Conversation ID: 333d6dbd-7011-4844-9df5-b166d99aee35
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5585–5679)
  - `ak5e/scripts/specialist-rules.mjs`
  - `ak5e/scripts/specialist-features.mjs`
  - `ak5e/scripts/specialist-uses.mjs`
  - `ak5e/scripts/specialist-sheet.mjs`
  - `ak5e/scripts/executor-features.mjs`
  - `ak5e/scripts/ak5e.mjs`
  - `ak5e/scripts/resource-pools.mjs`
  - `ak5e/scripts/trigger-events.mjs`
  - `ak5e/test/base-classes-fixture.mjs`
  - `ak5e/test/executor.test.mjs`
- **Key findings**:
  - Hooked Weapon: Melee, non-Two-Handed, Slashing/Piercing weapon converted to Hook; gains Two-Handed, Thrown (30/- or 50/- at Lv 15), returns immediately, STR for ranged attack/damage, 10 ft pull on <= +1 size on ranged hit, Bonus Action ranged Hook attack restriction; free starting equipment conversion vs 200 LMD + 1 hr.
  - Big Boot (Lv 5): Unarmed strike hits creature <= +1 size -> 10 ft push; doubles to 20 ft if Urban Jungle active.
  - King of the Urban Jungle (Lv 5): 20 ft pre-movement -> flying speed 2x Hook range (60 ft / 100 ft); no Hook attack while flying; immediate melee hit deals +PB damage and doubles forced movement.
  - Bound in Rope (Lv 5): 1 Prowess Action, DEX save vs Martial DC -> Grappled; 15 ft BA drag; 5 ft Action hogtie; locks Hook use while grappling.
  - Wrangler (Lv 5): 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks, optional -5 attack to ignore DR.
  - Hookmaster Prowess triggers: environmental/falling/collision damage caused, or >45 ft flying movement in a single turn.
  - Mighty Push (Lv 11): PB/LR Action within 5 ft, STR save vs Martial DC, interactive 8d6 Bludgeoning roll button + 20 ft knockback (half dmg + 10 ft on save), collision damage (1d6/10 ft).
  - Spider's Essence (Lv 15): Longer Hook (50/-), Spider's Thread (50 ft climb speed aura), Swing to Safety (falling reaction).
  - Scorpion Sting (Lv 20): 1/LR Action, DEX save vs Martial DC auto-failed if Grappled/Hooked ignoring Hook restrictions, pull to 5 ft, 6 advantaged Hook attacks each dealing +half level weapon damage.
  - Full WORKFLOW §3.2 table-play integration with non-blocking warnings, clamp-at-0, no auto-rolled dice, GM relay via `validateTarget`, and encounter-window undo receipts.
- **Unexplored areas**: None. Exploration and blueprint design are complete.

## Key Decisions Made
- Architecture blueprint established for `ak5e/scripts/hookmaster-features.mjs`, `ak5e/scripts/specialist-uses.mjs`, `ak5e/scripts/specialist-sheet.mjs`, `ak5e/scripts/ak5e.mjs`, and `ak5e/test/hookmaster.test.mjs`.

## Artifact Index
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/DISPATCH.md` — Dispatch record
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/BRIEFING.md` — Situational awareness
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/progress.md` — Liveness heartbeat
- `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/handoff.md` — Complete architecture & test blueprint
