## 2026-10-17T02:18:51Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/.
You are the Hookmaster Rules & Architecture Explorer for Milestone 3. You are a read-only exploration agent. You MUST NOT edit source code or test files directly.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Rules source: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5585–5679)
- Existing specialist files:
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/specialist-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/scripts/executor-features.mjs
  - ak5e/scripts/ak5e.mjs
  - ak5e/test/base-classes-fixture.mjs

Your Task:
Exhaustively investigate the Hookmaster Specialist subclass and produce the complete architectural and test blueprint:
1. Rules Analysis (Ch. 3 L5585–5679):
   - Hooked Weapon mechanics: conversion prerequisites (Slashing or Piercing melee weapon, NOT two-handed), free starting weapon or 200 LMD + 1 hour cost; properties added (Two-Handed, Thrown 30/- or 50/- at Lv 15, returning to hand, STR for ranged attack and damage rolls); 10 ft pull on hit against <= +1 size; Bonus Action ranged Hook attack restrictions; reversible via undo.
   - Big Boot (Lv 5): Unarmed Strike pushes creature up to size +1 by 10 ft.
   - King of the Urban Jungle (Lv 5): Requires 20 ft pre-movement; Flying Speed = 2x Hook range (60 ft, 100 ft at Lv 15); cannot attack with Hook while flying; immediate melee strike deals +PB damage and doubles forced movement. Lv 15 Swing to Safety falling reaction.
   - Bound in Rope (Lv 5): 1 Prowess Action, DEX save vs Martial DC -> Grappled; Bonus Action 15 ft drag; Action hogtie within 5 ft; locks Hook use while grappling.
   - Wrangler (Lv 5): 1 Prowess Action vs > +1 size, DEX save vs Martial DC -> latch and share space, Advantage on attacks vs target, optional -5 attack penalty to ignore Damage Reduction.
   - Hookmaster Prowess triggers: environmental/falling/collision damage or >45 ft flying movement in a single turn.
   - Mighty Push (Lv 11): PB/LR Action within 5 ft, STR save vs Martial DC, interactive 8d6 Bludgeoning roll button + 20 ft knockback, half damage and 10 ft on save, collision damage against obstacles.
   - Spider's Essence (Lv 15): Longer Hook (50/- range), Spider's Thread climbing speed aura, Swing to Safety falling reaction.
   - Scorpion Sting (Lv 20): 1/LR Action within Hook range, auto-failed DEX save if Grappled/Hooked ignoring Hook restrictions, pull to 5 ft, 6 advantaged Hook attacks each dealing +half Specialist level weapon damage.
2. Architecture & Contracts:
   - `ak5e/scripts/hookmaster-features.mjs`: state under `flags.ak5e.hookmaster`, exported helpers (`isHookmaster`, `isHookedWeapon`, `calculateHookRange`, `getHookmasterState`, etc.), resource pools (`mightyPush`, `scorpionSting`), hooks for returning thrown weapons and prowess triggers.
   - `ak5e/scripts/specialist-uses.mjs`: table-play plans (`convertHookedWeapon`, `revertHookedWeapon`, `bigBoot`, `kingOfUrbanJungle`, `boundInRope`, `hogtie`, `wrangler`, `mightyPush`, `swingToSafety`, `scorpionSting`). Strict adherence to WORKFLOW §3.2 (confirmations, non-blocking warnings, 0-clamping, no auto-rolled dice, GM relay via `validateTarget`, and encounter-window undo receipts).
   - `ak5e/scripts/specialist-sheet.mjs`: Hooked Weapon status badge and action buttons in `openSpecialistControls()`.
   - `ak5e/test/hookmaster.test.mjs`: comprehensive unit test suite covering all features.

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m3_1/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.
