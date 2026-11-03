# Infuser Rules & Architecture Explorer — DISPATCH
Target: Milestone 4: Infuser Subclass Exploration & Architecture Design

## 2026-10-17T11:08:29Z
Your working directory is /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4_1/.
You are the Infuser Rules & Architecture Explorer for Milestone 4. You are a read-only exploration agent. You MUST NOT edit source code or test files directly.

Read first:
- /home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md (mandatory)
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/SCOPE.md
- /home/patch/AK5e-Foundry/.agents/teamwork/orchestrator_8/GATE_STATUS.md
- /home/patch/AK5e-Foundry/AGENTS.md, /home/patch/AK5e-Foundry/WORKFLOW.md, /home/patch/AK5e-Foundry/GEMINI.md
- Source rules: /home/patch/AK5e-Foundry/AK5e_1.3.1_Foundry_Source/03_chapter_3_character_classes.txt (lines 5688–5823)
- Decision log: /home/patch/AK5e-Foundry/ak5e/DECISIONS.md (specifically line 465 regarding Infuser DC)
- Reference subclass implementations:
  - ak5e/scripts/executor-features.mjs
  - ak5e/scripts/hookmaster-features.mjs
  - ak5e/scripts/specialist-rules.mjs
  - ak5e/scripts/specialist-features.mjs
  - ak5e/scripts/specialist-uses.mjs
  - ak5e/scripts/specialist-sheet.mjs
  - ak5e/scripts/ak5e.mjs
  - ak5e/test/base-classes-fixture.mjs
  - ak5e/test/executor.test.mjs
  - ak5e/test/hookmaster.test.mjs

Your Task:
Exhaustively investigate the Infuser Specialist subclass and produce the complete architectural and test blueprint:
1. Rules Analysis (Ch. 3 L5688–5823 & DECISIONS.md L465):
   - Infuser DC: exact formula `20 - INT - PB` with optional GM ruling toggle (`8 + INT + PB`). Explain mechanics and state tracking.
   - Principle of Double Effect: Pharmacology Kit proficiency, Alchemical Infusions resource pool (`2*PB/LR`), range (5 ft, scaling to 30 ft at Lv 11), 1-min duration, max 1 active infusion per creature, immunity for Constructs and Undead (Ch. 1 L226).
   - All 8 Alchemical Infusions (Ch. 3 L5782–5823):
     1. Adrenaline Trigger (Advantage on Initiative and DEX saves; Leverage: reaction attack when attacked)
     2. Flight Reflex Stimulant (+10 ft speed, Disengage BA; Leverage: +10 ft additional speed and Dash as BA)
     3. Focus Heightener (Advantage on CON checks for Concentration, +PB to passive Perception; Leverage: +PB to one attack roll, check, or save)
     4. Hesitation Suppressor (Immunity to Frightened; Leverage: Advantage on attack rolls against frightening creature)
     5. Muscle Strengthener (+PB to melee weapon damage rolls; Leverage: Advantage on STR checks/saves and jump distance doubled)
     6. Procoagulant (Resistance to Slashing/Piercing; Leverage: 2d8 Temp HP)
     7. Respiration Stimulant (Breathe water/air, Advantage on saves vs inhaled poisons/gas; Leverage: end Suffocating or Stunned condition)
     8. Sensation Nulling (Immunity to Pain/Dazed; Leverage: Resistance to all damage except Psychic for 1 round)
   - Leverage Workflow: Target makes CON save vs Infuser DC. On pass: benefit applies. On fail: benefit applies, BUT target is Dazed until end of their next turn and cannot benefit from Leverage until their next turn concludes (Leverage lockout).
   - New Concoctions (Lv 5): Neurological Inhibitor (Berserk condition) & Bungarotoxin (Paralyzed condition) added to Pharmacology Kit Toxicology list.
   - Double-Blind Trial (Lv 5): Bonus Action, 1 Prowess + 1 Infusion -> interactive 1d6 roll applying corresponding Toxin to untoxined weapon.
   - Infuser Prowess Triggers: Poisoned/Toxined creature drops to 0 HP, or 1/round when an Infusion turns an ally's failed check/attack/save into a success.
   - Stimpack & Questionable Rejuvenation (Lv 11): 30 ft range; applying Infusion or passing Leverage CON save grants 1d10 Temp HP (interactive roll button), additive with Procoagulant.
   - Excessive Dosing (Lv 15): Succumb (+PB to Toxin DCs), Toxic Shock (Poisoned condition rider on failed Toxin save).
   - To Defy Science (Lv 20): 1/LR Action within 30 ft, 1-min Invulnerability effect preventing all HP loss.
2. Architecture & Contracts:
   - `ak5e/scripts/infuser-features.mjs`: state model under `flags.ak5e.infuser`, exported helpers (`isInfuser`, `calculateInfuserDC`, `getActiveInfusion`, `applyInfusion`, `clearInfusion`, `hasPrincipleOfDoubleEffect`, `hasNewConcoctions`, `hasDoubleBlindTrial`, `hasStimpack`, `hasExcessiveDosing`, `hasToDefyScience`, etc.), resource pools (`alchemicalInfusions`, `toDefyScience`).
   - `ak5e/scripts/specialist-uses.mjs`: table-play plans (`applyInfusion`, `leverageInfusion`, `doubleBlindTrial`, `clearInfusion`, `toDefyScience`). Strict adherence to WORKFLOW §3.2 (confirmations, non-blocking warnings, 0-clamping, no auto-rolled dice, GM target relay via `validateTarget`, and encounter-window undo receipts).
   - `ak5e/scripts/specialist-sheet.mjs`: Infuser active infusion badge and action buttons in `openSpecialistControls()`.
   - `ak5e/scripts/ak5e.mjs`: export `infuser` under `game.ak5e.specialist` and call `registerInfuserHooks()`.
3. Test Strategy for `ak5e/test/infuser.test.mjs`:
   - Comprehensive test areas covering all features, Infuser DC calculations, Leverage CON saves, Double-Blind Trial 1d6 rolls, Stimpack Temp HP, Excessive Dosing, To Defy Science invulnerability, hook dispatch via `Hooks.callAll`, and empirical listener count invariance checks.

Deliverable:
Write a comprehensive architectural and test design handoff report to /home/patch/AK5e-Foundry/.agents/teamwork/explorer_m4_1/handoff.md following the Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When finished, notify the orchestrator with send_message.
