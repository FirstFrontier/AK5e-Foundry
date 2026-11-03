# BRIEFING — 2026-10-16T09:05:00Z

## Mission
Perform exhaustive line-by-line specification extraction from authoritative source text (Chapter 3) for Specialist Base Class and Subclasses (Executor, Hookmaster, Infuser).

## 🔒 My Identity
- Archetype: Specification Miner
- Roles: Specification Miner, Read-Only Analyst
- Working directory: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1
- Original parent: 7c128871-a90d-4b87-a96b-0f976db806d5
- Milestone: Specialist Base Class and Subclasses Specification Mining

## 🔒 Key Constraints
- Read-only: DO NOT edit or modify any repository files outside working directory.
- Preserve source wording, mechanics, formulas, and numeric values exactly without inventing mechanics.
- Do not make assumptions or skip obscure features.
- Produce comprehensive handoff report at `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/handoff.md`.
- Report findings using `## Features Discovered` and `## Edge Cases` tables with full details.

## Current Parent
- Conversation ID: 7c128871-a90d-4b87-a96b-0f976db806d5
- Updated: 2026-10-16T08:48:30Z

## Task Summary
- **What to extract**:
  1. Base Specialist Class (L5161–5493): Hit dice, proficiencies, starting equipment/LMD, Weapon Specialisation (8 melee + 7 ranged fighting styles + duplicate rejection), Show Your Style (prowess pool formula, Mark of a Specialist reroll/refund), Weapon Adept (Lv 6), Weapon Expertise (Lv 12), Falling Upwards / It's All Skill (Lv 17), Weapon Mastery (Lv 18), all 15 Basic Talents and all 18 Advanced Talents in Chapter 3.
  2. Executor Subclass (L5498–5578): Hunter vs Bodyguard, Deathmark state mechanics, In Every Shadow, Sweeper & Smokescreen, Prowess triggers, Preysense/Dangersense, In for the Kill/Blade Shield, Mortal Blow vs Ultimate Sword and Shield.
  3. Hookmaster Subclass (L5585–5679): Hooked weapon conversion, Big Boot, King of the Urban Jungle, Bound in Rope, Wrangler, Prowess triggers, Mighty Push, Spider's Essence, Scorpion Sting.
  4. Infuser Subclass (L5684–5840): Infuser DC formula analysis, Principle of Double Effect, all 8 Alchemical Infusions + Leverage save workflow, New Concoctions, Double-Blind Trial, Prowess triggers, Stimpack, Excessive Dosing, To Defy Science.
- **Success criteria**: Comprehensive, self-contained handoff.md with verified line citations and tables.
- **Interface contracts**: AK5e v1.3.1 Chapter 3 rules authority.

## Key Decisions Made
- Infuser DC: `20 - INT - PB` is preserved per source L5689 and DECISIONS.md L465; it models formulation purity where higher INT/PB lowers the DC to spare allies from the Dazed side-effect. Supported with GM configurable toggle for conventional `8 + INT + PB`.
- Deathmark Transfer: Clarified two readings: literal `onAttackRoll` (L5506 "by making an Attack against them") vs `onHitOnly` (sweeper comparison L5532).
- Mortal Blow: Direct HP loss (10d8, doubled on Bleeding) bypasses DR and Resistance.
- Part-Time Inventor: Identified as cross-class talent in Defender, Guard, Sniper, Supporter, Vanguard; omitted from Specialist talent table because Inventor is an authored Specialist subclass.
- Hidden Technique: Mapped to 8 Basic Brawler Techniques in Guard class, fueled by Grit pool (2 base, +1 module).

## Artifact Index
- `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/DISPATCH.md` — Dispatch message
- `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/BRIEFING.md` — Working memory
- `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/progress.md` — Liveness & step tracking
- `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/handoff.md` — Final extraction report
