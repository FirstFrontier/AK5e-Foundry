## 2026-10-16T08:48:08Z
[Message] timestamp=2026-10-16T08:48:08Z sender=7c128871-a90d-4b87-a96b-0f976db806d5 priority=MESSAGE_PRIORITY_HIGH content=You are a Read-only Specification Miner for the AK5e Specialist Base Class and Subclasses project.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/
You must create your working directory metadata files (BRIEFING.md, progress.md, handoff.md) inside this directory.

Read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the section ## 2026-10-16T08:44:15Z).
Read repository policies:
/home/patch/AK5e-Foundry/AGENTS.md
/home/patch/AK5e-Foundry/WORKFLOW.md
/home/patch/AK5e-Foundry/GEMINI.md

Your Objective:
Perform an exhaustive, line-by-line specification extraction from the authoritative source text:
/home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt
Specifically:
1. Base Specialist Class (L5161–5493):
   - Hit Dice (d8), HP progression, proficiencies (armor, weapons, tools, saving throws: DEX + choice of WIS or CHA, skills: choose 3).
   - Starting Equipment / 1300 LMD package.
   - Weapon Specialisation: List all 8 Melee and 7 Ranged Fighting Styles with exact names, mechanics, and cross-list duplicate rejection rules.
   - Show Your Style: `prowess` resource pool formula (max = PB, +1 on SR, +1 on LR), Mark of a Specialist check reroll mechanism and refund on second failure.
   - Weapon Adept (Level 6), Weapon Expertise (Level 12), Falling Upwards / It's All Skill (Level 17), Weapon Mastery (Level 18) mechanics.
   - All 15 Basic Talents and all 18 Advanced Talents in Chapter 3 for Specialist, including exact mechanics for:
     * Hidden Technique (grants Grit pool and Basic Brawler Techniques)
     * Jumpstart (increases Operator Skill Start SP by 5, or 10 with Module)
     * Part-Time Inventor
2. Executor Subclass (L5498–5578):
   - Path choice: Hunter vs Bodyguard.
   - Deathmark state mechanics: target marking, transfer on attack (`onAttackRoll` vs `onHitOnly` readings), return conditions (0 HP or end of turn without attacking/damaging), return bonus (+3 SP with Reaction Disengage), +3 SP at turn start while held, Bonus Action Hide, damage scaling (+1d4 at Lv 1, +2d4 at Lv 7, +3d4 at Lv 14), Hunter +1 crit range, Bodyguard attack redirection within 10 ft.
   - In Every Shadow (Lv 5): Climb/Swim speed = walking speed, Stealth proficiency/expertise.
   - Sweeper (Hunter Lv 5) and Smokescreen (Bodyguard Lv 5) Prowess spends.
   - Executor Prowess gain triggers.
   - Preysense / Dangersense (Lv 11).
   - In for the Kill / Blade Shield (Lv 15).
   - Mortal Blow (Hunter Lv 20) vs Ultimate Sword and Shield (Bodyguard Lv 20).
3. Hookmaster Subclass (L5585–5679):
   - Hooked weapon conversion: cost/time (free starting melee weapon or 200 LMD + 1 hour), weapon constraints (Slashing/Piercing, non-Two-Handed), gained properties (Two-Handed, Thrown 30/- or 50/- at Lv 15, returning, STR-based ranged attack/damage, 10 ft pull vs size <= +1, Bonus Action ranged Hook attack restriction, reversibility).
   - Big Boot (Lv 5 push).
   - King of the Urban Jungle (Lv 5 pre-move requirement, flying speed = 2x hook range, attack restriction while flying, +PB melee damage & double forced movement; Lv 15 Swing to Safety reaction while falling).
   - Bound in Rope (Lv 5 1 Prowess Action, DEX save vs Martial DC, 15 ft BA drag, Action hogtie).
   - Wrangler (Lv 5 1 Prowess Action vs size > +1, DEX save, latch/share space, Advantage, optional -5 attack to ignore DR).
   - Hookmaster Prowess gain triggers.
   - Mighty Push (Lv 11 8d6 roll button, knockback, collision).
   - Spider's Essence (Lv 15 Longer Hook 50/-, climb speed, Swing to Safety).
   - Scorpion Sting (Lv 20 1/LR Action, auto-fail DEX save if Hooked/Grappled, 6 advantaged attacks + half Specialist level damage).
4. Infuser Subclass (L5684–5840):
   - Infuser DC: `20 - INT - PB` vs `8 + INT + PB` per-use reading and ruling.
   - Principle of Double Effect: Pharmacology Kit proficiency, Alchemical Infusions pool (`2 * PB / LR`), 5 ft range (30 ft at Lv 11), 1 min duration, single active Infusion per creature, Construct/Undead guard.
   - All 8 Alchemical Infusions and Leverage CON save workflow (pass/fail benefits, Dazed + Leverage lockout on fail).
   - New Concoctions (Lv 5 Neurological Inhibitor & Bungarotoxin).
   - Double-Blind Trial (Lv 5 BA, 1 Prowess + 1 Infusion -> 1d6 roll applying Toxin).
   - Infuser Prowess gain triggers.
   - Stimpack (Lv 11 30 ft range, Questionable Rejuvenation 1d10 Temp HP roll button).
   - Excessive Dosing (Lv 15 Succumb +PB Toxin DC, Toxic Shock Poisoned rider).
   - To Defy Science (Lv 20 1/LR Action, 1-min Invulnerability).

Scope Boundaries:
- Read-only: DO NOT edit or modify any repository files.
- Produce your comprehensive report at:
  `/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_rules_1/handoff.md`
- When complete, call send_message to report your handoff path and key findings.
