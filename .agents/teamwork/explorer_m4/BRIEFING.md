# BRIEFING — 2026-10-12T22:46:00Z

## Mission
Technical exploration and specification investigation for Milestone 4 (Specialist Base Class in AK5e).

## 🔒 My Identity
- Archetype: explorer
- Roles: Technical explorer and specification agent
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4/
- Original parent: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Milestone: Milestone 4 (Specialist Base Class)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement production source code
- Adhere to WORKFLOW.md, AGENTS.md, GEMINI.md, and PROJECT.md
- Rules authority is AK5e_1.3.1_Foundry_Source/ (lines 5161–5493 in Ch. 3)
- Deliver report to handoff.md in our folder
- Send message back to parent agent upon completion

## Current Parent
- Conversation ID: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Updated: 2026-10-12T22:46:00Z

## Investigation State
- **Explored paths**:
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (lines 5161–5493)
  - `PROJECT.md` (lines 1–165)
  - `ORIGINAL_REQUEST.md` (lines 1–228)
  - `ak5e/scripts/vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`
  - `ak5e/scripts/supporter-rules.mjs`, `supporter-features.mjs`, `supporter-setup.mjs`, `supporter-progression.mjs`, `supporter-uses.mjs`
  - `ak5e/scripts/resource-pools.mjs`, `play-uses.mjs`, `chapter-three-content.mjs`, `chapter-four-content.mjs`
  - `ak5e/test/vanguard-*.test.mjs`, `ak5e/test/supporter-*.test.mjs`, `ak5e/test/base-classes-fixture.mjs`
- **Key findings**:
  - Exact Specialist chassis: 1d8 HD, 8+CON base HP, light/med armor, shields, light melee/ranged weapons, 2 tools, Dex + choice of Wis/Cha saves, 3 skills (acr, slt, ste, ak5etech, prc, ak5ewilderness).
  - Weapon Specialisation: 15 styles (8 Melee, 7 Ranged) with distinct chapter-three-content IDs.
  - Show Your Style (Level 4 in source, noted Lv 1 in dispatch): Prowess resource pool (max = PB, +1 on SR or LR), Mark of a Specialist check reroll with refund on failure.
  - Weapon Adept (Level 6): Extra attack + damage reroll 1-2 (melee) or attack reroll 1 (ranged).
  - Weapon Expertise (Level 12): Crit +1 / bonus damage die (melee) vs 3d20 keep highest / advantage (ranged).
  - Falling Upwards (Level 17): It's All Skill: Reaction before save roll, spend 3 Prowess to auto-succeed.
  - Weapon Mastery (Level 18): Once/turn hit +floor(Lvl/2) damage (melee) vs once/turn double PB attack (ranged).
  - ASIs at 7 levels: 4, 6, 8, 10, 12, 16, 19.
  - Starting gear: 4 choices or 1300 LMD (= 1300 CP).
- **Unexplored areas**: None for Milestone 4 base class specification. Subclasses (Executor, Hookmaster, etc.) belong to subsequent subclass milestones.

## Key Decisions Made
- Architecture follows the proven 5 core modules (`specialist-rules.mjs`, `specialist-features.mjs`, `specialist-setup.mjs`, `specialist-progression.mjs`, `specialist-uses.mjs`) plus 3 unit test suites.
- Show Your Style source placement (Level 4) vs dispatch (Lv 1) explicitly analyzed: Prowess pool applies when character has Show Your Style feature (or level >= 4), with pool definition supporting subclass early access if required.
- All 15 fighting styles cataloged with exact source text and compendium IDs.

## Artifact Index
- DISPATCH.md — Task assignment
- BRIEFING.md — Working memory and status
- progress.md — Liveness heartbeat
- handoff.md — Comprehensive technical specification and code templates report
