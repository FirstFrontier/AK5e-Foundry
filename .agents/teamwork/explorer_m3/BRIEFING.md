# BRIEFING — 2026-10-12T18:29:10Z

## Mission
Technical exploration and specification for Milestone 3 (Supporter Base Class): rules extraction, module architecture, and test suite design.

## 🔒 My Identity
- Archetype: explorer
- Roles: explorer, specification engineer
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3
- Original parent: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Milestone: Milestone 3 (Supporter Base Class)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Base class implementation pattern must follow established vanguard architecture
- Rules authority is AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 6548–6692)
- Preserve wording and numbers, never invent mechanics

## Current Parent
- Conversation ID: e4e8eb8b-5d74-43ee-ad08-c5ba6d91bed6
- Updated: 2026-10-12T18:29:10Z

## Investigation State
- **Explored paths**:
  - `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Lines 6548–6692)
  - `ak5e/scripts/vanguard-rules.mjs`, `vanguard-features.mjs`, `vanguard-setup.mjs`, `vanguard-progression.mjs`, `vanguard-uses.mjs`
  - `ak5e/scripts/chapter-three-content.mjs`, `chapter-four-content.mjs`
  - `ak5e/scripts/resource-pools.mjs`, `play-uses.mjs`, `operation-kernel.mjs`
  - `ak5e/test/base-classes-fixture.mjs`, `vanguard-*.test.mjs`
  - `PROJECT.md`, `TEST_INFRA.md`, `package.json`
- **Key findings**:
  - Hit Dice: 1d6, 6 + CON at 1st level, 4 (or 1d6) + CON per level after 1st.
  - Proficiencies: Light Armor, Light Shields, Light Melee Weapons, choice of Tool Kit or Vehicle.
  - Saving Throws: Choice of exactly 2 from Constitution, Charisma, Wisdom (no automatic save).
  - Skills: Exactly 3 unique choices from Arts (`arc`), Lore (`ak5elore`), Tech (`ak5etech`), Insight (`ins`), Deception (`dec`), Persuasion (`per`).
  - Equipment: Choice of item bundle or 1300 LMD currency.
  - `aidDie` pool: max formula `"max(1, max(@abilities.int.mod, max(@abilities.wis.mod, @abilities.cha.mod)))"`; scaling d8 (1–6), d10 (7–13), d12 (14–20).
  - Provide Aid: Bonus Action, 60 ft range, 10 min duration, grants Aid Die to ally.
  - Advanced Aid (Lv 5): Attack (crit range +1), Skill (2nd die advantage), Save/Heal (THP = roll + PB / roll), Damage (splash Force in 10 ft).
  - Lighten the Load (Lv 11): Reaction on ally rolling Aid Die within 60 ft grants free supplementary die to another ally.
  - Ever Reliable (Lv 15): Turn start regain 1 die if at 0; Short Rest recover `Math.ceil(max / 2)`.
  - Self-Supportive (Lv 18): Turn start personal Aid Die.
  - Will Into Being (Lv 20): Add PB to any Aid Die rolled.
  - Full module specifications and test suite architectures designed.
- **Unexplored areas**: None for Supporter base class specification. Ready for worker implementation.

## Key Decisions Made
- Reconciled Aid Die scaling to exact source table: d8 (1–6), d10 (7–13), d12 (14–20).
- Reconciled skills to exact source text: Arts (`arc`), Lore (`ak5elore`), Tech (`ak5etech`), Insight (`ins`), Deception (`dec`), Persuasion (`per`).
- Reconciled saves to exact source text: 2 choices from `con`, `cha`, `wis`.
- Formulated exact pool definition for `aidDie` compatible with `resource-pools.mjs`.

## Artifact Index
- `DISPATCH.md` — incoming task dispatch
- `BRIEFING.md` — persistent situational awareness
- `progress.md` — liveness heartbeat
- `handoff.md` — 5-component handoff report with complete code specifications and test suite designs
