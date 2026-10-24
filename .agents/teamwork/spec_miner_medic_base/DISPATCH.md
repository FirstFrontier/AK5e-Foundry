## 2026-10-13T04:01:16Z
[Message] timestamp=2026-10-13T04:01:16Z sender=4dc2c4af-2b0a-43dd-b0c1-68e8edd29582 priority=MESSAGE_PRIORITY_HIGH content=You are the Medic Rules Spec Miner.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Medic section: lines 4560–4870)

YOUR OBJECTIVE:
Perform a comprehensive, read-only extraction and specification of the AK5e Medic base character class rules from Chapter 3:
1. Chassis:
   - Hit Dice: 1d6 per Medic level
   - Hit Points at 1st level: 6 + CON mod
   - Hit Points at higher levels: 1d6 (or 4) + CON mod
   - Armor proficiencies: Light Shields ONLY
   - Weapon proficiencies: Light Melee weapons
   - Tool proficiencies: Choice of 1 Tool Kit or Vehicle
   - Saving Throws: Choice of 2 from CON, INT, WIS
   - Skills: Medicine + Choice of 2 from Lore, Arts, Tech, Insight, Perception, Persuasion
   - Starting Equipment choices (or 1300 LMD starting wealth)
2. Arts Casting:
   - Healing Arts Special Pool (always prepared, not counted against known arts)
   - AP progression table (Level 1 to 20: 3 to 35 AP)
   - Max Art Level progression table (Level 1 to 20: 1st to 9th level)
   - Spellcasting ability score: Choice of INT or WIS (Spell Save DC = 8 + PB + mod, Spell Attack Mod = PB + mod)
3. Resource Pool:
   - Life Support pool (`lifeSupport`): Step table from Level 1 (20) to Level 20 (170). Exact formula / step values for all levels 1–20.
   - OverMax behavior and Long Rest recovery rules.
4. Core Features (exact mechanics, triggers, costs, lines):
   - Medical Expertise (Level 1): Double PB for Medicine checks.
   - Touch Heal (Level 1): Action to expend current Life Support to restore missing HP 1:1. Construct warning.
   - Preserver (Level 2): Spend 5 Life Support on healing/THP roll to reroll any number of dice.
   - Urgency of Treatment (Level 2): Spend multiples of 10 Life Support to reduce Healing Art AP cost by 1 per 10 spent (min 0).
   - Self-Defence Protocol (Level 5): Unlearned standard Caster Arts pool (<=5th level); learned Arts cost 1 fewer AP (min 0); upgraded to 2 fewer AP at Level 11.
   - Resuscitation (Level 12): Cast Revivify 1/Long Rest without expending AP.
   - To Rob the Ferryman (Level 18): Revivified creature recovers 3 * Medic level HP.
   - Chosen of Asclepius (Level 20): Toggle to maximize all healing dice instead of rolling.
5. Level 1–20 Progression Step Table:
   - Feature grants at every level 1–20.
   - Operator Skills (Basic, Advanced, Elite), Talents (Basic at 3rd, Module at 8th, Advanced at 9th, Module at 13th), and ASIs (Levels 4, 6, 8, 10, 12, 16, 19).
   - Subclass grant levels (Subclass chosen at 1st level! Features at 1st, 4th, 7th, 11th, 15th).

DELIVERABLE:
Write your structured specification report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/spec_miner_medic_base/handoff.md`
Cite exact source lines and numbers. DO NOT write or edit production code. When done, send a message to orchestrator with your report summary and path.
