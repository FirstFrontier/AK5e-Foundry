## 2026-10-24T03:35:21Z
You are worker_trapmaster_11, an expert AK5e Foundry VTT developer and implementer.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_trapmaster_11

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY SPECIFICATION:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Source rules: AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 6382–6542)
- Existing implementations for pattern reference: ak5e/scripts/infuser-features.mjs, ak5e/scripts/inventor-features.mjs
- Project contracts: WORKFLOW.md, AGENTS.md, GEMINI.md, ak5e/DECISIONS.md, TODO.md

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/scripts/trapmaster-features.mjs
- ak5e/test/trapmaster.test.mjs
DO NOT modify any other files (do not touch specialist-rules, specialist-progression, or specialist-uses; those will be integrated in Milestone 4).

TASK SCOPE:
Implement the complete Trapmaster Specialist branch in ak5e/scripts/trapmaster-features.mjs and comprehensive tests in ak5e/test/trapmaster.test.mjs:
1. Environmental Warfare at 1st level:
   - Traps resource pool: Max = 2 * PB, replenishes on Long Rest.
   - Sleight of Hand Expertise grant.
   - Trap DC formula: `8 + PB + max(Dex, Int)`.
2. Devil's Own Luck:
   - 1/Short or Long Rest Action to scout and identify environmental traps/hazards or gain GM suggestion.
3. 8 Trap Schemas with base mechanics, trigger conditions, and Level 7 & Level 14 damage scaling:
   - Alarm: 20 ft perimeter, audible or mental ping within 1 mile.
   - Explosive: 5-ft square, 2d8 Fire (4d8 at 7th, 6d8 at 14th), DEX save for half.
   - Gas: 10-ft radius cloud, 2d6 Poison (4d6 at 7th, 6d6 at 14th) + Poisoned on failed CON save.
   - Incendiary: 5-ft square, 2d6 Fire (4d6 at 7th, 6d6 at 14th) + Burning condition on failed DEX save.
   - Paddle: Bludgeoning knockback / prone, 1d10 Bludgeoning (2d10 at 7th, 3d10 at 14th) + STR save or pushed 15 ft & Prone.
   - Snare: Restrained condition, STR or DEX check vs Trap DC to escape.
   - Spike: 2d10 Piercing (4d10 at 7th, 6d10 at 14th) + movement speed halved on failed DEX save.
   - Timed Explosive: Countdown in rounds (1-5 rounds), 3d8 Force (6d8 at 7th, 9d8 at 14th) in 15-ft radius, DEX save for half.
4. Detecting & Disarming mechanics:
   - Detection DC = Trap DC (Passive Perception or active Investigation/Perception).
   - Disarm DC = Trap DC (Sleight of Hand check; failure by 5 or more immediately triggers the trap).
5. Panic Inducer at 5th level:
   - Irritating Distraction: Targets who trigger your traps make saving throws against other effects at Disadvantage until start of your next turn.
   - Jester's Grace: Trapmaster is immune to their own traps and has Advantage on saving throws against all other traps.
   - Warning Point: Reaction when a creature moves within 30 ft of a trap; trigger early or delay trigger, reducing creature's speed to 0 for the turn.
6. Here's One I Made Earlier at 5th level:
   - Spend 1 Prowess as an Action to plant a trap up to 60 ft away (instead of adjacent 5 ft).
   - Trapmaster Prowess triggers: Gain 1 Prowess when a creature fails a save against your trap by 5+ or is reduced to 0 HP by a trap (1/turn).
7. Bait the Trap at 11th level:
   - Come and Get Me: PB/Short or Long Rest Action to taunt a creature within 60 ft; WIS save vs Trap DC or must spend movement heading toward designated point/trap.
8. Agent of Chaos at 15th level:
   - Trap damage ignores Damage Reduction (DR) and treats Damage Resistance as normal damage.
9. House of Horrors at 20th level:
   - Permanent +5 bonus to Trap DC (`calculateTrapDC` includes +5 at Lv 20).
   - Party Favours: 1/Long Rest Action to place up to 6 hidden traps simultaneously anywhere within 100 ft without expending Traps pool uses.

VERIFICATION:
- Author comprehensive tests in ak5e/test/trapmaster.test.mjs covering all 8 traps, DC calculations, placement rules, detection/disarm checks, scaling, Panic Inducer, and House of Horrors.
- Run `node --test ak5e/test/trapmaster.test.mjs` using run_command. Ensure 100% pass rate.
- Write handoff.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/worker_trapmaster_11/handoff.md) summarizing changes, test results, and source rules mapping.
- Send a completion message back to parent orchestrator_11 (f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07).
