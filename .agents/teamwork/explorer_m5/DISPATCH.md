## 2026-10-12T22:52:00Z
You are explorer_m5, a read-only technical exploration and specification agent for Milestone 5 (Medic Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m5/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. Source rules authority:
   /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 4560–4871)
7. Established class patterns:
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/specialist-rules.mjs (once available)

YOUR EXPLORATION MISSION:
1. Extract exact Medic rules from Chapter 3:
   - Chassis: 1d6 Hit Dice, 6+CON base HP, 1d6 (or 4) + CON higher levels.
   - Armor: Light shields ONLY (`shl`). (No armor proficiencies!).
   - Weapons: Light Melee weapons.
   - Tools: One kit of choice.
   - Saving Throws: Choose exactly 2 from Constitution (`con`), Intelligence (`int`), Wisdom (`wis`).
   - Skills: Medicine is automatic (`med`) + choose exactly 2 from Animal Handling (`ani`), History (`his`), Insight (`ins`), Perception (`prc`), Survival (`sur`), Tech (`ak5etech`), Wilderness (`ak5ewilderness`).
   - Starting Equipment & Currency (1300 LMD = 1300 CP).
2. Level Step Table & Features:
   - Life Support Pool: 20 (Lv 1) scaling to 170 (Lv 20). Initial = max. OverMax allowed. Long rest recovery.
   - Arts Casting: AP table (3->35), Max Art Level table (1st->9th). Healing Arts Special Pool.
   - Touch Heal (Lv 1): 1:1 HP conversion with Construct warning.
   - Medical Expertise (Lv 1): Double PB for Medicine checks.
   - Preserver (Lv 2): Spend 5 Life Support to reroll healing/THP dice.
   - Urgency of Treatment (Lv 3): Spend multiples of 10 Life Support to reduce AP cost by 1 per 10 spent.
   - Self-Defence Protocol (Lv 5): Standard arts reduction by 1 (Lv 5) and 2 (Lv 11).
   - Resuscitation (Lv 12): Free Revivify 1/LR.
   - To Rob the Ferryman (Lv 18): Revivify restores 3 * Medic Level HP.
   - Chosen of Asclepius (Lv 20): Max healing dice option.
   - ASIs at Levels 4, 8, 12, 16, 19.
3. Design Complete Module Templates & Test Specifications:
   - `medic-rules.mjs`
   - `medic-features.mjs`
   - `medic-setup.mjs`
   - `medic-progression.mjs`
   - `medic-uses.mjs`
   - Unit tests: `medic-rules.test.mjs`, `medic-features.test.mjs`, `medic-progression.test.mjs`.

DELIVERABLE:
Write your complete report and specifications to:
/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m5/handoff.md.
When finished, send a message to orchestrator.


## 2026-10-12T23:53:19Z
You are explorer_m5, a read-only technical exploration and specification agent for Milestone 5 (Medic Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m5/
Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md and /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m5/DISPATCH.md.
Also read source rules in AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 4560–4871) and established class patterns (vanguard-rules, supporter-rules, specialist-rules).
Extract exact specifications, formulas, Life Support pool rules (20->170 step table, overMax allowed), Arts Casting AP table (3->35) and Max Art Level table (1->9), Touch Heal (1:1 conversion with Construct warning), Medical Expertise, Preserver, Urgency of Treatment, Self-Defence Protocol, Resuscitation, To Rob the Ferryman, Chosen of Asclepius, and design complete module templates and unit test suites for Medic.
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m5/handoff.md.
When finished, send a message to orchestrator.
