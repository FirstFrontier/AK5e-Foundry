## 2026-10-12T18:44:00Z
You are reviewer_m3_1, a high-reliability reviewer for Milestone 3 (Supporter Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_1/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 6548–6692)
7. Worker handoff: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m3/handoff.md
8. Authored files to review:
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-features.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-setup.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-progression.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/supporter-rules.test.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/supporter-features.test.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/supporter-progression.test.mjs

YOUR MISSION:
1. Review Supporter rules fidelity against source rules (Ch. 3 L6548–6692):
   - Hit Dice 1d6, 6+CON base HP, 4 (or 1d6)+CON per level after 1st.
   - Proficiencies (Light Armour, Light Shields, Light Melee, 1 Tool/Vehicle).
   - Saving throws: exactly two chosen from CON, CHA, WIS.
   - Skill choices: exactly three chosen from Arts, Lore, Tech, Insight, Deception, Persuasion.
   - Aid Die scaling: d8 (Lv 1–6), d10 (Lv 7–13), d12 (Lv 14–20).
   - Resource pool `aidDie`: max formula based on chosen mental mod (Int/Wis/Cha), Long Rest recovery.
   - Provide Aid (60 ft, 10 min, bonus action).
   - Advanced Aid riders (attack: crit range +1, skill: roll 2nd die and choose, save: temp HP = roll + PB, damage: 10 ft splash Force damage, heal: temp HP = roll).
   - Lighten the Load (Lv 11 reaction chaining).
   - Ever Reliable (Lv 15 Short Rest recovery ceil(max/2), Turn start 0-recovery).
   - Self-Supportive (Lv 18 Turn start personal die).
   - Will Into Being (Lv 20 +PB to roll).
2. Review idempotency and choice validation in setup and progression.
3. Review WORKFLOW §3.2 compliance in `supporter-uses.mjs` (confirmation, warnings, shortfall clamp at 0, automatic GM relay, no auto-rolled dice, undo receipts).
4. Run verification commands:
   - `npm run test:supporter`
   - `node ak5e/tools/validate-files.mjs`
   - `npm run test:base-classes`
   - `npm test`
5. Deliver verdict: APPROVE or REQUEST_CHANGES.

DELIVERABLE:
Write your review report to `/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_m3_1/handoff.md`.
State your verdict prominently in the conclusion.
When finished, send a message to orchestrator.
