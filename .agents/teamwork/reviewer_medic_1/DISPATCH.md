## 2026-10-13T04:38:16Z
You are reviewer_medic_1, the rules fidelity and progression reviewer for the AK5e Medic base character class, Physician subclass, and Triage subclass.
Your assigned working directory is: /home/patch/AK5e-Foundry/.agents/teamwork/reviewer_medic_1/

MANDATORY INPUTS:
- Read /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (under section ## Follow-up — 2026-10-13T03:54:12Z)
- Read /home/patch/AK5e-Foundry/PROJECT.md
- Read /home/patch/AK5e-Foundry/AGENTS.md
- Read /home/patch/AK5e-Foundry/WORKFLOW.md
- Read /home/patch/AK5e-Foundry/GEMINI.md
- Read /home/patch/AK5e-Foundry/.agents/teamwork/worker_medic_impl/handoff.md
- Read source chapters:
  * `AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt` (Medic lines 4560–4870, Physician lines 4871–4905, Triage lines 5011–5048)
  * `AK5e_1.3.1_Foundry_Source/01_chapter_1_changing_the_game.txt` (Construct line 138, Mettle lines 50–78)

YOUR TASK:
Independently review the Medic implementation in `ak5e/scripts/medic-rules.mjs`, `medic-features.mjs`, `medic-setup.mjs`, and `medic-progression.mjs`:
1. Verify chassis rules: 1d6 HD, 6+CON at Lv 1, 4+CON (min 1) at higher levels.
2. Verify proficiencies: Light Shields ONLY (no light, medium, or heavy armor proficiencies), Light Melee weapons, 1 tool kit/vehicle.
3. Verify saving throws: choice of 2 from CON, INT, WIS.
4. Verify skills: Medicine automatic (with Medical Expertise: value 2) + choice of 2 from Lore, Arts, Tech, Insight, Perception, Persuasion.
5. Verify Arts casting: Healing Arts Special Pool, AP progression (3 to 35), Max Art Level (1 to 9), spellcasting ability choice (INT or WIS).
6. Verify Life Support pool: registered in `resource-pools.mjs`, exact closed formula `20 + 15 * floor(Level / 2)` (20 to 170), overMax allowed, Long Rest recovery toMax.
7. Verify Physician features: Focused Treatment (PB to heal/damage roll on single creature), Intravenous Line (10 LS, 15 ft, CON save or 2d8 Necrotic on pass, tuning state, +1d6/+2d6 bonus), Hypocritic Oath (heal-to-harm CON save vs DC, counts as heal for triggers), Inpatient Care (15 LS Reaction, delayed heal next turn), Surgeon-General (double HP restored on single creature).
8. Verify Triage features: On the Scene (10 LS, move Speed without AoO, up to PB targets within 5 ft: Heal 1d6+mod / Harm 1d6+mod melee spell attack, upgraded to 2d6+mod at Lv 7), Urgent Care Centre (half self-heal to 10 ft on levelled Art), Stop the Flow (20 LS Action on Dying creature, +6 Mettle up to 8 hard cap, Dying gate and re-use lock), Touch of Life and Death (10 LS rider on On the Scene, ends <=1hr condition or pauses >1hr condition / poisons target), Mobile Hospital (1/LR BA 30 ft aura for 1 min, 3d6+mod HP once/round).
9. Verify progression idempotency: re-running setup and progression produces identical state, preserves customizations, and does not duplicate HP or ASIs.
10. Run tests: `npm run test:medic`, `node ak5e/tools/validate-files.mjs`, `node ak5e/tools/verify-generated-content.mjs`.

DELIVERABLE:
Write your structured review report to:
`/home/patch/AK5e-Foundry/.agents/teamwork/reviewer_medic_1/handoff.md`
State your verdict explicitly: APPROVE or REQUEST_CHANGES. Send a message to orchestrator with your verdict and summary.
