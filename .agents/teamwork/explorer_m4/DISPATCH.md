## 2026-10-12T22:41:00Z
You are explorer_m4, a read-only technical exploration and specification agent for Milestone 4 (Specialist Base Class).
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4/

MANDATORY FIRST STEP:
Read the following authoritative files in full:
1. /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
2. /home/patch/AK5e-Foundry/AGENTS.md
3. /home/patch/AK5e-Foundry/WORKFLOW.md
4. /home/patch/AK5e-Foundry/GEMINI.md
5. /home/patch/AK5e-Foundry/PROJECT.md
6. Source rules for Specialist:
   /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (Lines 5161–5493)
7. Existing reference implementations:
   - /home/patch/AK5e-Foundry/ak5e/scripts/vanguard-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/supporter-rules.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/resource-pools.mjs
   - /home/patch/AK5e-Foundry/ak5e/scripts/play-uses.mjs
   - /home/patch/AK5e-Foundry/ak5e/test/base-classes-fixture.mjs

YOUR MISSION:
Perform a comprehensive specification and technical design investigation for Milestone 4 (Specialist Base Class):
1. **Source Rules Extraction (Ch. 3 L5161–5493)**:
   - Chassis: 1d8 HD, 8+CON base HP, light/medium armor, shields, light melee/ranged weapons, 2 tools, Dex + choice of Wis or Cha saves, 3 skills.
   - Weapon Specialisation (Lv 1): Melee (8 styles: Brawler, Cut and Thrust, Dual Wielding, Great Weapon, Polearm, Shield, Single Weapon, Unarmed) vs Ranged (7 styles: Archer, Crossbow, Dual Ranged, Heavy Weapon, Thrown, Trick Shot, Quickdraw).
   - Show Your Style & Prowess (Lv 1): `prowess` resource pool (max = PB, regain 1 on SR or LR); Mark of a Specialist (spend Prowess on skill check to reroll; refund on success).
   - Weapon Adept (Lv 6): Extra Attack with chosen weapon specialization + damage reroll 1-2 (melee) or attack reroll 1 (ranged).
   - Weapon Expertise (Lv 12): Crit +1 & bonus damage die (melee) vs 3d20 keep highest / advantage (ranged).
   - Falling Upwards / It's All Skill (Lv 17): Reaction before saving throw, spend 3 Prowess to auto-succeed.
   - Weapon Mastery (Lv 18): Once/turn hit +floor(Level/2) damage (melee) vs once/turn double PB attack (ranged).
   - Starting Equipment & currency (1300 LMD = 1300 CP).
2. **Architecture & Module Design**:
   - `specialist-rules.mjs`: Pure functional calculations (HD, HP, step tables, DCs, saving throw options, styles).
   - `specialist-features.mjs`: `prowess` pool registration, rest recovery, runtime style checks.
   - `specialist-setup.mjs`: Idempotent preview and apply setup with deterministic `contextKey` hash, mapping embedded features from `chapter-three-content.mjs`.
   - `specialist-progression.mjs`: Choice validation (DEX + 1 save from WIS/CHA, 3 skills, style choice, HP bounds [1, 8], ASI schemes), starting gear tracking.
   - `specialist-uses.mjs`: `createPlayUses({ ns: "specialistUses", label: "Specialist" })` enforcing WORKFLOW §3.2 (Prowess spends, Mark rerolls with refund, Falling Upwards auto-success, undo receipts).
3. **Unit Test Design**:
   - `specialist-rules.test.mjs`, `specialist-features.test.mjs`, `specialist-progression.test.mjs`.

DELIVERABLE:
Write your complete technical exploration report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4/handoff.md`.
Include precise code templates, function signatures, data structures, and test cases for the Worker.
When finished, send a message to the orchestrator.
