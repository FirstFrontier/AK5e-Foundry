## 2026-10-12T18:22:15Z
You are explorer_m3, a read-only technical exploration and specification agent for Milestone 3 (Supporter Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. Source rules for Supporter:
   /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 6548–6692)
7. Existing base class reference implementations and established patterns:
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-features.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-setup.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-progression.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/resource-pools.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs

YOUR MISSION:
Perform a comprehensive specification and technical design investigation for Milestone 3 (Supporter Base Class):
1. **Source Rules Extraction (Ch. 3 L6548–6692)**:
   - Hit Points: Hit Dice 1d6, 6 + CON at 1st level, 1d6 (or 4) + CON per level after 1st.
   - Proficiencies: Light Armour, Light Shields, Light Melee Weapons, Choice of 1 Tool or Vehicle.
   - Saving Throws: Choice of 2 from Constitution, Charisma, Wisdom.
   - Skills: Three from Acrobatics, Animal Handling, Insight, Medicine, Nature, Perception, Performance, Persuasion.
   - Starting Equipment: choices or starting LMD currency.
   - Level progression steps 1–20 (Provide Aid, Advanced Aid, Supporter Branch at Lv 1/4/10/13/17, Lighten the Load at Lv 11, Ever Reliable at Lv 15, Self-Supportive at Lv 18, Will Into Being at Lv 20).
   - `aidDie` resource pool: maximum = chosen ability modifier (Int, Wis, or Cha; default to highest or player choice), die size progression (d8 at Lv 1, d10 at Lv 9, d12 at Lv 17), Long Rest recovery.
   - Provide Aid mechanics: Bonus action, 60 ft range, 10 min duration, grants Aid Die to ally.
   - Advanced Aid riders: attack roll (crit range +1), ability check (roll second Aid Die and choose), saving throw / healing (grant Temporary HP = die roll + PB), damage roll (splash damage in 10 ft).
   - Lighten the Load (Lv 11): Reaction when ally within 60 ft rolls Aid Die to grant a free Aid Die to a second ally.
   - Ever Reliable (Lv 15): At turn start, regain 1 Aid Die if at 0. On Short Rest, regain ceil(max / 2) Aid Dice.
   - Self-Supportive (Lv 18): Regain 1 special Aid Die at turn start usable only by self.
   - Will Into Being (Lv 20): Add PB to any Aid Die rolled.
2. **Architecture & Module Design**:
   - `supporter-rules.mjs`: Pure functional calculations (HD, HP, steps, DCs, proficiencies, saves, aidDie scaling).
   - `supporter-features.mjs`: Runtime hooks, pool definitions, rest recovery, Advanced Aid riders, Will Into Being.
   - `supporter-setup.mjs`: `previewSupporterSetup` and `applySupporterSetup` with contextKey hashing, embedded item mapping from `chapter-three-content.mjs`, and idempotency.
   - `supporter-progression.mjs`: `inspectSupporterFields`, `previewSupporterProgression`, `applySupporterProgression` with choice validation (saves: exactly 2 from CON/CHA/WIS, skills: exactly 3 unique, HP bounds [1, 6], ASI schemes), and starting gear idempotency.
   - `supporter-uses.mjs`: `createPlayUses({ ns: "supporterUses", label: "Supporter" })` implementing Provide Aid, Lighten the Load, Advanced Aid roll resolution, warnings with "Use anyway", shortfall clamping, automatic GM relay, interactive roll buttons, undo receipts.
3. **Test Suite Design**:
   - `supporter-rules.test.mjs`
   - `supporter-features.test.mjs`
   - `supporter-progression.test.mjs`
   - Test script `"test:supporter"` in `package.json`.

DELIVERABLE:
Write your complete technical exploration and specification report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3/handoff.md`.
Include precise code templates, function signatures, data structures, and test cases for the Worker.
When finished, send a message to the orchestrator.


## 2026-10-12T18:22:16Z
You are explorer_m3, a read-only technical exploration and specification agent for Milestone 3 (Supporter Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3/
Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md and /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3/DISPATCH.md.
Also read source rules in AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 6548–6692) and existing vanguard patterns.
Extract exact specifications, formulas, pool rules, level steps, and design complete module templates and test cases for Supporter.
Write your report to: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3/handoff.md.
Send a message to orchestrator when finished.
