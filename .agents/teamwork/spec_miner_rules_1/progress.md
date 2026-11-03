# Progress Log - spec_miner_rules_1

Last visited: 2026-10-16T09:05:00Z

## Status
Exhaustive line-by-line inspection of Chapter 3 (L5161–5840) completed. Cross-checked with Chapter 4 (Pharmacology Kit, Toxins L643–900), Guard Brawler branch (Basic Brawler Techniques L2423–2550), and existing `specialist-rules.mjs`, `specialist-features.mjs`, and `specialist-uses.mjs`.

## Detailed Progress
1. Checked `ORIGINAL_REQUEST.md` (section `## 2026-10-16T08:44:15Z`).
2. Examined Base Specialist Class (L5161–5493):
   - Hit Dice: 1d8 per Specialist Level. HP: 8 + CON at 1st lvl, 1d8 (or 5) + CON thereafter.
   - Proficiencies: Armor (Light, Medium, Light Shields), Weapons (Light Melee, Light Ranged), Tools (Two Tool Kits of choice), Saves (DEX + choice of WIS or CHA), Skills (Three from: Acrobatics, Sleight of Hand, Stealth, Tech, Perception, Wilderness).
   - Starting Equipment: Choice 1 (Light Melee or Light Ranged), Choice 2 (Light Melee or Light Shield), Choice 3 (Reinforced Outfit or Underarmour), 1x Proficient Tool Kit, OR 1300 LMD.
   - 8 Melee Fighting Styles & 7 Ranged Fighting Styles; cross-list duplicate rejection rules (`Deadly Fighter` and `Two-Weapon Fighting` present on both).
   - Show Your Style (Lv 4): Prowess max = PB; gains 1 on SR, 1 on LR; Mark of a Specialist check reroll for 1 Prowess and refund if still failing.
   - Weapon Adept (Lv 6): Melee (+1 attack on Attack action, reroll 1s and 2s on damage dice); Ranged (+1 attack on Attack action, reroll 1s on attack rolls).
   - Weapon Expertise (Lv 12): Melee (+1 Crit range, 1 Prowess BA for +1 damage die); Ranged (Elven Accuracy triple advantage on Advantage, 1 Prowess BA for Advantage on next ranged attack).
   - Falling Upwards / It's All Skill (Lv 17): Reaction 3 Prowess before rolling save to auto-succeed at minimum roll required.
   - Weapon Mastery (Lv 18): Melee (1/turn on hit +half level weapon damage); Ranged (1/turn double PB on ranged attack roll).
   - All 15 Basic Specialist Talents (L5446–5465) and Module effects.
   - All 18 Advanced Specialist Talents (L5471–5492) and Module effects (including Hidden Technique with 8 Basic Brawler Techniques & Grit pool, Jumpstart +5/+10 Start SP).
   - Cross-class talent Part-Time Inventor (appears in other classes granting Inventor Specialist modification feature, explains presence in user prompt).
3. Examined Executor Subclass (L5498–5578):
   - Path choice: Hunter vs Bodyguard.
   - Deathmark state mechanics: target marking, transfer on attack (`onAttackRoll` vs `onHitOnly` readings), return conditions (0 HP or end of turn without attacking/damaging), return bonus (+3 SP with Reaction Disengage), +3 SP at turn start while held, Bonus Action Hide, damage scaling (+1d4 at Lv 1, +2d4 at Lv 7, +3d4 at Lv 14), Hunter +1 crit range, Bodyguard attack redirection within 10 ft.
   - In Every Shadow (Lv 5): Climb/Swim speed = walking speed, Stealth proficiency/expertise.
   - Sweeper (Hunter Lv 5) and Smokescreen (Bodyguard Lv 5) Prowess spends.
   - Executor Prowess gain triggers.
   - Preysense / Dangersense (Lv 11).
   - In for the Kill / Blade Shield (Lv 15).
   - Mortal Blow (Hunter Lv 20) vs Ultimate Sword and Shield (Bodyguard Lv 20).
4. Examined Hookmaster Subclass (L5585–5679):
   - Hooked weapon conversion: cost/time (free starting melee weapon or 200 LMD + 1 hour), weapon constraints (Slashing/Piercing, non-Two-Handed), gained properties (Two-Handed, Thrown 30/- or 50/- at Lv 15, returning, STR-based ranged attack/damage, 10 ft pull vs size <= +1, Bonus Action ranged Hook attack restriction, reversibility).
   - Big Boot (Lv 5 push).
   - King of the Urban Jungle (Lv 5 pre-move requirement, flying speed = 2x hook range, attack restriction while flying, +PB melee damage & double forced movement; Lv 15 Swing to Safety reaction while falling).
   - Bound in Rope (Lv 5 1 Prowess Action, DEX save vs Martial DC, 15 ft BA drag, Action hogtie).
   - Wrangler (Lv 5 1 Prowess Action vs size > +1, DEX save, latch/share space, Advantage, optional -5 attack to ignore DR).
   - Hookmaster Prowess gain triggers.
   - Mighty Push (Lv 11 8d6 roll button, knockback, collision).
   - Spider's Essence (Lv 15 Longer Hook 50/-, climb speed, Swing to Safety).
   - Scorpion Sting (Lv 20 1/LR Action, auto-fail DEX save if Hooked/Grappled, 6 advantaged attacks + half Specialist level damage).
5. Examined Infuser Subclass (L5684–5840):
   - Infuser DC: `20 - INT - PB` vs `8 + INT + PB` per-use reading and ruling.
   - Principle of Double Effect: Pharmacology Kit proficiency, Alchemical Infusions pool (`2 * PB / LR`), 5 ft range (30 ft at Lv 11), 1 min duration, single active Infusion per creature, Construct/Undead guard.
   - All 8 Alchemical Infusions and Leverage CON save workflow (pass/fail benefits, Dazed + Leverage lockout on fail).
   - New Concoctions (Lv 5 Neurological Inhibitor & Bungarotoxin).
   - Double-Blind Trial (Lv 5 BA, 1 Prowess + 1 Infusion -> 1d6 roll applying Toxin).
   - Infuser Prowess gain triggers.
   - Stimpack (Lv 11 30 ft range, Questionable Rejuvenation 1d10 Temp HP roll button).
   - Excessive Dosing (Lv 15 Succumb +PB Toxin DC, Toxic Shock Poisoned rider).
   - To Defy Science (Lv 20 1/LR Action, 1-min Invulnerability).
6. Next: Author comprehensive `handoff.md` and send completion message to parent.
