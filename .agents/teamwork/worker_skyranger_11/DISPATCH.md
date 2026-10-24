## 2026-10-24T03:35:02Z
You are worker_skyranger_11, an expert AK5e Foundry VTT developer and implementer.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_skyranger_11

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY SPECIFICATION:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Source rules: AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 6145–6262)
- Existing implementations for pattern reference: ak5e/scripts/infuser-features.mjs, ak5e/scripts/inventor-features.mjs
- Project contracts: WORKFLOW.md, AGENTS.md, GEMINI.md, ak5e/DECISIONS.md, TODO.md

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/scripts/skyranger-features.mjs
- ak5e/test/skyranger.test.mjs
DO NOT modify any other files (do not touch specialist-rules, specialist-progression, or specialist-uses; those will be integrated in Milestone 4).

TASK SCOPE:
Implement the complete Skyranger Specialist branch in ak5e/scripts/skyranger-features.mjs and comprehensive tests in ak5e/test/skyranger.test.mjs:
1. Flight Suit starting equipment: Light Armour, AC 12 + Dex, 0 DR, 25 lb, 650 LMD replacement cost.
2. Fuel resource pool progression table (scaling 2 to 8 across levels, Long Rest recovery):
   - Lv 1–2: 2, Lv 3–5: 3, Lv 6–8: 4, Lv 9–11: 5, Lv 12–14: 6, Lv 15–17: 7, Lv 18–20: 8.
3. Take Off: Bonus action, consumes 1 Fuel, grants 1 minute Fly speed equal to walking speed.
4. Strafe Damage progression lookup:
   - Lv 1–4: 0, Lv 5–7: 5d8, Lv 8–10: 6d8, Lv 11–13: 7d8, Lv 14–16: 8d8, Lv 17–19: 9d8, Lv 20: 10d8.
5. Air Doctrine rest selection (Air Superiority, Bombardment, Close Air Support) and active actions:
   - AA Missile: 1 Fuel, ground/flying target bonuses (+Strafe Damage vs flying/aerial target, etc.).
   - Bombing Run: 1 Fuel, distance-scaled burst damage / line drop.
   - Swooping Dive: 1 Fuel, moving up to Speed as part of attack with Advantage on attack.
6. Jink at 5th level:
   - Evasive Manoeuvres: Reaction, spend 1 Prowess -> +PB AC until start of next turn; if the triggering attack still hits despite AC bonus, damage taken is halved!
   - Aerial Prowess gain triggers: Prowess gain when taking off or dealing damage while flying/aerial (1/turn).
7. Advanced Doctrine at 11th level:
   - Crash AoE: upon crash / forced landing, burst Thunder damage to nearby creatures.
   - Firebomb / Gas Strike options for Bombardment.
   - CAS Frighten: Close Air Support causes targets to make WIS save or be Frightened.
8. Afterburners at 15th level:
   - Reaction movement upon being targeted/attacked, leaving a fire damage aura/trail.
9. Skyscreamer at 20th level:
   - 1/Long Rest Action: Combat Mode for 1 minute.
   - Multirole: gains benefits of all three Air Doctrines simultaneously.
   - Free Fuel for Air Doctrine features during transformation.
   - Core Cannon & Core Saber special weapons data models and attacks.

VERIFICATION:
- Author comprehensive tests in ak5e/test/skyranger.test.mjs covering all pure functions, lookups, item generators, damage calculations, and edge cases.
- Run `node --test ak5e/test/skyranger.test.mjs` using run_command. Ensure 100% pass rate.
- Write handoff.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/worker_skyranger_11/handoff.md) summarizing changes, test results, and source rules mapping.
- Send a completion message back to parent orchestrator_11 (f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07).
