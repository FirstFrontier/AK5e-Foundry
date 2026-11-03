## 2026-10-24T03:35:11Z
You are worker_dollkeeper_11, an expert AK5e Foundry VTT developer and implementer.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/worker_dollkeeper_11

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY SPECIFICATION:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Source rules: AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 6266–6377)
- Existing implementations for pattern reference: ak5e/scripts/infuser-features.mjs, ak5e/scripts/inventor-features.mjs
- Project contracts: WORKFLOW.md, AGENTS.md, GEMINI.md, ak5e/DECISIONS.md, TODO.md

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/scripts/dollkeeper-features.mjs
- ak5e/test/dollkeeper.test.mjs
DO NOT modify any other files (do not touch specialist-rules, specialist-progression, or specialist-uses; those will be integrated in Milestone 4).

TASK SCOPE:
Implement the complete Dollkeeper Specialist branch in ak5e/scripts/dollkeeper-features.mjs and comprehensive tests in ak5e/test/dollkeeper.test.mjs:
1. Living Doll companion construct:
   - Medium or Small Construct, Neutral alignment.
   - Base stats: STR 16 (+3), DEX 16 (+3), CON 14 (+2), INT 1 (-5), WIS 10 (+0), CHA 4 (-3).
   - Immunities: Poison, Poisoned, Charmed, Exhaustion, Frightened.
   - Senses: Darkvision 60 ft, shared telepathic/sensory connection with owner.
   - Synchronization: Max HP = owner's Max HP, Speed = owner's walking speed, PB = owner's PB.
   - Strike Action: Melee weapon attack using Doll's STR or DEX (+3) + owner's PB to hit; 1d8 + 3 Bludgeoning/Slashing/Piercing damage.
2. Command & Healing linkage:
   - Combat command via Bonus Action within 100 ft (Strike, Dash, Disengage, Dodge, Help).
   - Hit Dice healing linkage: whenever owner spends Hit Dice during a Short Rest to regain HP, the Doll also regains HP equal to the roll + owner's CON mod.
   - Long Rest ritual / 500 LMD rebuild if destroyed.
3. Pull the Strings at 5th level:
   - Doll's Dance: Operator Skills can originate from the Doll instead of the Dollkeeper.
   - Look in the Mirror: The Doll shares the owner's Weapon Specialisation, Adept, Expertise, and Mastery benefits, drawing from owner's Prowess pool.
   - Marionette: 1/Long Rest reaction when owner would drop to 0 HP, owner drops to 1 HP instead and Doll takes the remaining damage (or is destroyed if lethal).
4. Musical Chairs at 5th level:
   - 1 Prowess Action/Bonus Action to swap positions with the Doll up to 60 ft apart without provoking opportunity attacks.
   - Joint Prowess gain: when either the Dollkeeper or Doll reduces a creature to 0 HP or crits while within 10 ft of each other, gain 1 Prowess (1/turn).
5. Masquerade at 11th level:
   - Doll Multiattack: Doll can make 2 Strike attacks with its attack command.
   - Mistaken Identity: PB/Short or Long Rest reaction when attacked while within 5 ft of the Doll; redirect the attack to the Doll.
   - Talking Heads: Telepathic projection and voice throwing through the Doll.
6. Living Doll at 15th level:
   - Reciprocity: Whenever owner or Doll gains Temporary HP, the other gains the same amount of Temporary HP.
   - Share Arts: Non-damaging Arts or buff spells cast by owner targeting self can also affect the Doll simultaneously.
7. Artistry is Violence at 20th level:
   - Doll Multiattack: 3 Strike attacks.
   - Doll Raid: 1/Long Rest Action allowing both owner and Doll to take a full turn of actions simultaneously in any order.

VERIFICATION:
- Author comprehensive tests in ak5e/test/dollkeeper.test.mjs covering companion creation, synchronization logic, Strike attacks, Pull the Strings, Musical Chairs, Masquerade, Reciprocity, and Doll Raid.
- Run `node --test ak5e/test/dollkeeper.test.mjs` using run_command. Ensure 100% pass rate.
- Write handoff.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/worker_dollkeeper_11/handoff.md) summarizing changes, test results, and source rules mapping.
- Send a completion message back to parent orchestrator_11 (f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07).
