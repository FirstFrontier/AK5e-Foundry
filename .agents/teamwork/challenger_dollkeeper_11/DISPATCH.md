## 2026-10-24T04:09:08Z
From: f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07
Priority: MESSAGE_PRIORITY_HIGH

You are challenger_dollkeeper_11, an adversarial quality assurance engineer and challenger for the AK5e Foundry VTT module.
Your working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/challenger_dollkeeper_11

MANDATORY INTEGRITY & VERIFICATION RULES:
You MUST read the authoritative user request at:
/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md
Also review:
- Implementation plan: /home/patch/.gemini/antigravity/brain/cfa2db8c-fdf5-4245-a920-2d2da2bf8d95/specialist_branches_plan.md
- Implementation handoffs:
  - /home/patch/AK5e-Foundry/.agents/teamwork/worker_dollkeeper_11/handoff.md
  - /home/patch/AK5e-Foundry/.agents/teamwork/worker_integration_11/handoff.md
- Source code:
  - ak5e/scripts/dollkeeper-features.mjs
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/specialist-progression.mjs
  - ak5e/scripts/specialist-uses.mjs
- Source rules: AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 6266–6377)
- Project contracts: WORKFLOW.md §3.2, AGENTS.md, GEMINI.md, ak5e/DECISIONS.md

EXCLUSIVE FILE OWNERSHIP:
You own exclusively:
- ak5e/test/dollkeeper-adversarial.test.mjs
DO NOT modify any production implementation files.

TASK SCOPE:
Author a comprehensive, rigorous adversarial test suite in `ak5e/test/dollkeeper-adversarial.test.mjs` that aggressively stresses the Dollkeeper subsystem and its integration:
1. Living Doll Companion Synchronization & Edge Cases:
   - Owner Max HP changes (level up, constitution changes) and corresponding Doll Max HP synchronization.
   - Non-standard walking speed (encumbered, reduced to 0, modified by feats) propagating to Doll.
   - Construct immunities (Poison, Necrotic, Charmed, Frightened, Exhaustion, etc.) properly maintained.
2. Strike Attacks & Look in the Mirror:
   - Attack roll formula (Doll's Dex/Str + owner PB) with diverse PB values.
   - Multiattack scaling (1 attack at Lv 1-10, 2 at Lv 11-19, 3 at Lv 20).
   - Look in the Mirror weapon trait propagation (Dueling style damage bonus, Archery attack bonus, Weapon Adept, Weapon Mastery).
   - Prowess pool deduction for shared weapon maneuvers.
3. Hit Dice Healing Linkage & Rest Rejuvenation:
   - Owner short rest healing when owner has negative/zero CON modifier.
   - Doll healing even when owner is already at maximum HP.
   - Self-Rejuvenation: verify Doll does NOT restore HP on Long Rest if at 1 HP or 0 HP.
   - Rebuilding ritual and 500 LMD replacement cost handling.
4. Pull the Strings & Musical Chairs (5th Level):
   - Marionette lethal damage substitution: triggering when owner would drop to 0 HP, owner dropping to 1 HP, positions swapping, and Doll taking the remainder.
   - Musical Chairs: 1 Prowess cost, position swap up to 60 ft, shortfall handling (0 prowess override clamping at 0), range boundary checks.
   - Joint Prowess triggers: 1/turn limit, 10 ft proximity requirements, kill by Doll vs kill by owner.
5. Masquerade (11th Level):
   - Mistaken Identity: PB/rest pool tracking, range limits (within 5 ft), DC 18 Perception check resolution, attacker 1-hour immunity on success, attack redirection on failure.
   - Talking Heads telepathic projection within 100 ft.
6. Living Doll (15th Level) & Artistry is Violence (20th Level):
   - Reciprocity: Temporary HP synchronization between owner and Doll without infinite looping.
   - Share Arts: Non-damaging self-targeted Arts duplicating to Doll.
   - Doll Raid: 1/Long Rest simultaneous full turn execution.
7. Full Encounter-Window Undo Reversibility (WORKFLOW §3.2):
   - Undo of Marionette, Musical Chairs, Mistaken Identity, Reciprocity, and Doll Raid.
   - Verify all document mutations revert cleanly to their exact prior snapshots.

VERIFICATION:
- Run `node --test ak5e/test/dollkeeper-adversarial.test.mjs` using run_command.
- Ensure all adversarial tests pass (or if a genuine bug in production code is uncovered, document reproduction in detail).
- Write handoff.md in your working directory (/home/patch/AK5e-Foundry/.agents/teamwork/challenger_dollkeeper_11/handoff.md) with complete test output, verdict (APPROVE or REQUEST_CHANGES), and coverage evidence.
- Send a completion message back to parent orchestrator_11 (f3fb86fe-a1dd-4c3f-999f-c6fcb92faf07).
