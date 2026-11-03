# Dispatch Log

## 2026-10-16T05:20:41Z
You are teamwork_preview_swe (SWE Light Orchestrator) for the AK5e Foundry VTT module project.
Your assigned working directory is `/home/patch/AK5e-Foundry/.agents/teamwork/swe_1/`.
Your identity: swe_1.
Authoritative user request is in `/home/patch/AK5e-Foundry/.agents/teamwork/ORIGINAL_REQUEST.md` under `## Follow-up — 2026-10-16T05:17:01Z`.

## Mandatory Repository & Policy Rules
- Read and adhere strictly to `AGENTS.md`, `WORKFLOW.md`, and `GEMINI.md`.
- All subagents must use `model: inherit` (Gemini 3.8 Flash).
- WORKFLOW §3.2 table play philosophy: confirm before uses, warnings with "Use anyway", clamp resource shortfall at 0, automatic GM relay for unowned target changes, never auto-roll dice (chat cards render interactive buttons), encounter-window undo receipts.
- Headless browser validation: all Playwright Chromium live browser validations must use `launchTestBrowser()` from `ak5e/tools/test-browser.mjs` against disposable `/tmp` user data copy of `standard-test` on port 30175 with strict bash process trapping (`AK5E_TEST_PID`, EXIT/INT/TERM traps). Zero console/page errors (`errors: []`).
- Screenshot inspection: delegate rendered inspection per AGENTS.md §6.2.

## Constraints on Sub-Agent Spawning
- **Strict Sub-Agent Cap:** Limit your number of sub-agents to at most 3 across the entire run. Do NOT fan out large parallel waves of spec-miners, explorers, reviewers, or challengers (Phase 1 mining and initial Phase 3 reviews are already on disk in `.agents/teamwork/spec_miner_medic_base/`, `.agents/teamwork/spec_miner_medic_subclasses/`, `.agents/teamwork/reviewer_medic_1/`, `.agents/teamwork/reviewer_medic_2/`, and `.agents/teamwork/challenger_medic_2/`).

## Task & Requirements
Continue and complete the implementation and verification of the AK5e Medic base character class along with the Physician and Triage subclasses on Foundry VTT Version 13 (`dnd5e` system). Initial implementation modules, unit tests, challenger stress suites, and independent review reports are already present in the workspace; resolve all defects identified in the review reports and failing challenger tests, then complete the in-Foundry headless Playwright verification and visual screenshot inspection.

Working directory: /home/patch/AK5e-Foundry
Integrity mode: demo

### R1. Resolve Base Medic Progression & Rules Defects (`ak5e/scripts/medic-progression.mjs`, `ak5e/scripts/medic-rules.mjs`)
- Fix level 1–20 HP calculation in `medic-progression.mjs` so it computes incremental HP per newly gained level rather than summing cumulative HP totals across levels.
- Include Level 6 in `ASI_LEVELS` (`[4, 6, 8, 10, 12, 16, 19]`) and ensure re-running progression is strictly idempotent (never re-applying ASIs to non-maxed abilities or duplicating features).
- Enforce strict choice schema validation in `previewMedicProgression`: require exactly 2 Saving Throw choices from `["con", "int", "wis"]`, require exactly 2 Skill choices from the allowed Medic skill list (`Lore`, `Arts`, `Tech`, `Insight`, `Perception`, `Persuasion`), and reject feats or invalid ASI distributions (`+2` to one ability or `+1/+1` to two abilities, max 20).
- Fix starting equipment grant to use the valid Chapter 4 Medical Kit ID (`tool-medical-kit-8`) or proficient tool kit selection, and support the 1,300 LMD alternative.

### R2. Resolve Physician & Triage Subclass Mechanics (`ak5e/scripts/medic-uses.mjs`, `ak5e/scripts/medic-features.mjs`)
- **Physician:**
  - *Focused Treatment (1st lvl):* Add PB to single-target healing or damage rolls.
  - *Intravenous Line (4th lvl):* Spend 10 LS (Action, 15 ft) to tune to a target for 10 minutes (persisting tuning state on the actor and replacing prior tuning). Unwilling targets make a CON save vs Spell Save DC (on failure: tuned; on success: deal 2d8 Necrotic damage). While tuned, apply once-per-turn +1d6 (+2d6 at 7th level) bonus to damage dealt or HP restored to the tuned target.
  - *Hypocritic Oath (7th lvl):* Allow converting rolled healing into harm; target makes CON save vs Spell Save DC, taking full Necrotic damage on a failed save or half on a successful save, while still counting as restoring HP for feature triggers.
  - *Inpatient Care / Healing Reverberations (11th lvl):* Spend 15 LS as a Reaction on healing roll; trigger delayed heal of `max(floor(healed / 2), 15)` HP to the target at the start of the Medic's next turn.
  - *Surgeon-General (15th lvl):* Double single-target HP restored via Life Support (1:2 Touch Heal ratio), Arts, or Operator Skills.
- **Triage:**
  - *Rapid Response / On the Scene (1st lvl):* Spend 10 LS (Action), enforce/warn on maximum targets equal to Proficiency Bonus (`PB`), and apply Heal (`1d6 + mod`, `2d6 + mod` at 7th) or Harm (Melee Spell Attack for `1d6 + mod` Necrotic, `2d6 + mod` at 7th).
  - *Urgent Care Centre (4th lvl):* Trigger half-heal splash to other creatures within 10 ft when self-healing with a **levelled Art**; reject or warn when triggered on a cantrip (level 0).
  - *Emergency Medicine / Stop the Flow (7th lvl):* Spend 20 LS on a Dying target to grant +6 Mettle (capped at 8, exceeding normal max of 6), track per-dying-episode target lock, and snapshot exact prior Mettle value for clean undo.
  - *Touch of Life and Death (11th lvl) & Mobile Hospital (15th lvl):* Spend 10 LS no-action rider on On the Scene (end <=1h condition / pause >1h condition, or Poison until next turn start); 1/LR Bonus Action 30-ft aura restoring `3d6 + mod` HP on entry (1/round per creature).

### R3. Resolve Table-Play, GM Relay & Sheet UI Defects (`ak5e/scripts/medic-uses.mjs`, `ak5e/scripts/medic-sheet.mjs`)
- Add `validateTarget` to all target-mutating plans in `medic-uses.mjs` (`touchHeal`, `resuscitation`, `stopTheFlow`, `intravenousLine`, `hypocriticOath`, `inpatientCare`, `onTheScene`, `urgentCareCentre`, `mobileHospital`) so unowned target changes relay automatically through the GM client without throwing validation errors.
- Set `receipt.formula` (and save/attack metadata where applicable) on dice-rolling plans (`onTheScene`, `mobileHospital`, `intravenousLine`, `hypocriticOath`) so interactive roll/save buttons render on chat cards without auto-rolling player dice.
- Update `ak5e/scripts/medic-sheet.mjs` so the `ActorSheetV2` Features tab injects `.ak5e-medic-badge` elements displaying Life Support (`value / max`), Medic Spell Save DC, active Subclass name, and active Intravenous Line tuning status.

### R4. Controlled Infrastructure & Live In-Foundry Verification (GEMINI.md §5)
- Run `npm run test:medic` and `npm run test:base-classes` and verify 100% pass rate (including `medic-challenger-features.test.mjs` and `medic-challenger-progression.test.mjs`).
- Run `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs`.
- Execute `ak5e/tools/test-medic-live.mjs` using `launchTestBrowser()` against a disposable `/tmp` copy of `standard-test` on port 30175 with strict process cleanup traps, capturing screenshots for Medic, Physician, and Triage sheets, dialogs, chat cards, and undo states, and inspect screenshots per AGENTS.md §6.2.

## Acceptance Criteria
- `npm run test:medic` passes 100% with 0 failures.
- `npm run test:base-classes` passes 100% with 0 regressions.
- `node ak5e/tools/validate-files.mjs` and `node ak5e/tools/verify-generated-content.mjs` pass with 0 errors.
- Progression idempotency, Level 6 ASI, HP incremental calculation, starting equipment grant verified.
- Table play agency, GM relay, no auto-rolled dice, encounter-window undo receipts verified.
- Sheet UI badge elements render properly.
- Headless Playwright test runs cleanly on port 30175 with `errors: []` in `browser-report.json`.
- Screenshots inspected and verified PASS, `TODO.md` and `ak5e/DECISIONS.md` updated.
