## 2026-10-17T01:15:30Z

Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/.
You are a read-only exploration agent (Role: Executor Rules Explorer). You MUST NOT edit source code or test files.
Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Rules source: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (specifically lines 5498–5578 for Executor)
- Decisions log: /home/patch/AK5e-Foundry/ak5e/DECISIONS.md

Your Task:
Conduct an exhaustive rules investigation of the Executor Specialist subclass.
Extract and document all mechanics, numbers, prerequisites, actions/reactions, costs, durations, and state transitions for:
1. Executor Path Choice at Level 1: Hunter vs Bodyguard path.
2. Deathmark State Tracking & Rules:
   - Who holds the Deathmark (Specialist vs target).
   - How it transfers on attack (investigate `onAttackRoll` vs `onHitOnly` interpretations and relevant rulings).
   - How and when it returns (on 0 HP, or end of turn if target was not attacked/damaged by Specialist).
   - Return benefits: +3 SP on return and Reaction Disengage.
   - Passive while held by Specialist: +3 SP at start of combat turn, Bonus Action Hide.
   - Damage scaling: +1d4 (Lv 1), +2d4 (Lv 7), +3d4 (Lv 14).
   - Hunter benefit (+1 crit range vs marked) vs Bodyguard benefit (reaction attack redirection within 10 ft).
3. Level 5 features:
   - In Every Shadow: Climb and Swim speeds equal to Walking Speed, Stealth proficiency (or Expertise if already proficient).
   - Sweeper (Hunter Prowess spend): reach +5 ft, multi-attack mark cycling.
   - Smokescreen (Bodyguard Prowess spend): 10 ft darkness + ally reaction move.
   - Executor Prowess gain triggers: 1/turn on Deathmark target reduced to 0 HP, Hunter >=30 single-attack damage, Bodyguard ally within 10 ft attacked taking 0 damage.
4. Level 11 features:
   - Preysense (Hunter: +1 crit die & Bleeding condition on crit) vs Dangersense (Bodyguard: reaction move together out of save AoE).
5. Level 15 features:
   - In for the Kill (Hunter: mark transfer grants Vulnerability to Specialist attacks) vs Blade Shield (Bodyguard: reaction attack subtracting PB from enemy attack roll).
6. Level 20 features:
   - Mortal Blow (Hunter: 1/LR Action, DEX save vs Martial DC, interactive 10d8 roll button, HP loss on fail/half on success, doubled if target has Bleeding, investigate `bypassDRResist` vs `bypassAll`).
   - Ultimate Sword and Shield (Bodyguard: Resistance to all damage from Deathmark holder, free Blade Shield without spending Reaction, Reaction transfer of Deathmark when creature within 10 ft is attacked).

Deliverable:
Write a comprehensive handoff report to `/home/patch/AK5e-Foundry/.agents/teamwork/explorer_m2_1/handoff.md` following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.
