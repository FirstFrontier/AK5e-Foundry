## 2026-10-17T02:44:30Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_8_1/.
You are the Adversarial Challenger for Milestone 3: Hookmaster Subclass Implementation & Tests.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Worker handoff report: /home/patch/AK5e-Foundry/.agents/teamwork/worker_m3_8/handoff.md
- Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5585–5679)
- Implementation files:
  - ak5e/scripts/hookmaster-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/test/hookmaster.test.mjs
  - ak5e/test/base-classes-fixture.mjs

Your Task:
Author and run an adversarial stress test suite in `ak5e/test/hookmaster-adversarial.test.mjs`.
Stress test edge cases, boundary conditions, and potential loopholes:
1. Hooked Weapon conversion on invalid weapons (weapons that have Two-Handed property, weapons that are not melee, weapons dealing only Bludgeoning damage, or non-existent items) and cost overrides when LMD is insufficient.
2. Relative creature size comparison engine across all size categories (tiny, sm, med, lg, huge, grg) verifying `isNoMoreThanOneSizeLarger` and `isMoreThanOneSizeLarger`.
3. Resource shortfall overrides: expending Prowess on Bound in Rope or Wrangler when Prowess is 0 with "Use anyway" override (must clamp at 0 and log warning).
4. King of the Urban Jungle: pre-movement < 20 ft warning with override; flying speed scaling (60 ft at Lv 5, 100 ft at Lv 15); +PB bonus damage and doubled forced movement (Big Boot 20 ft push) on immediate melee hit.
5. Bound in Rope: DEX save vs Martial DC, Grappled condition, Hook locked while grappling, 15 ft drag, hogtie within 5 ft (Manacles/Restrained), voluntary release unlocking Hook.
6. Wrangler: creature > +1 size, DEX save vs Martial DC, shared space, Advantage on attacks against target, optional -5 attack penalty for DR bypass.
7. Mighty Push: PB/LR pool spend (`mightyPush`), STR save vs Martial DC, interactive 8d6 damage roll button, 20 ft knockback (half dmg + 10 ft on save), collision damage against obstacles.
8. Scorpion Sting: 1/LR pool spend (`scorpionSting`), auto-failed DEX save and Hook lockout bypass if target is Grappled or Latched, pull target/actor to 5 ft, 6 advantaged attacks +half level (+10) bonus damage.
9. Full undo reversibility for every Hookmaster plan (`convertHookedWeapon`, `revertHookedWeapon`, `bigBoot`, `kingOfUrbanJungle`, `boundInRope`, `wrangler`, `mightyPush`, `scorpionSting`).
10. Dispatch hooks in unit tests via `Hooks.callAll("dnd5e.preRollAttackV2", ...)` and `Hooks.callAll("dnd5e.preRollDamageV2", ...)`.

Execute your test suite:
`node --test ak5e/test/hookmaster-adversarial.test.mjs`

Deliverable:
Write a comprehensive challenge report to `/home/patch/AK5e-Foundry/.agents/teamwork/challenger_m3_8_1/handoff.md` with an explicit verdict: **APPROVE** (all stress tests pass) or **REQUEST_CHANGES** (stress tests exposed defects).
When finished, notify the orchestrator with send_message.
