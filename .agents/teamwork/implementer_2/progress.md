# Implementer 2 Progress Log

- Status: Completed all implementation fixes and verifications.
- Completed Items:
  1. Reviewed reviewer handoffs (`reviewer_medic_1`, `reviewer_medic_2`, `challenger_medic_2`).
  2. Verified base Medic progression in `ak5e/scripts/medic-progression.mjs` & `medic-rules.mjs`:
     - Incremental HP computation across levels 1-20.
     - Level 6 present in `ASI_LEVELS` (`[4, 6, 8, 10, 12, 16, 19]`).
     - Strict idempotency on progression re-runs.
     - Strict choice schema validation in `previewMedicProgression` (2 saves from CON/INT/WIS, 2 allowed skills, valid ASI distribution, rejection of feats).
     - Valid starting equipment grant (`tool-medical-kit-8` or 1,300 LMD option).
     - `node ak5e/tools/stress-medic-progression.mjs`: 10/10 PASS.
     - `node --test ak5e/test/medic-challenger-progression.test.mjs`: 9/9 PASS.
  3. Resolved Physician & Triage subclass mechanics and table play:
     - Fixed `focusedTreatment` in `ak5e/scripts/medic-uses.mjs`: returns `bonus: 0` without blocking warning error on multi-target rolls or non-rolled flat heals, allowing seamless execution.
     - Intravenous Line: 10 LS spend, willing/unwilling CON save (fail = tuned 10 min, success = 2d8 Necrotic damage), +1d6/+2d6 once-per-turn bonus, tuning persistence on actor flags.
     - Hypocritic Oath: Heal-to-harm CON save vs DC, counts as restoring HP for triggers.
     - Inpatient Care: 15 LS reaction, delayed heal `max(floor(healed/2), 15)` on turn start.
     - Surgeon-General: 2x multiplier on single-target HP restored via Life Support (1:2 Touch Heal ratio). Fixed Challenger 5.1 expectation to reflect doubled heal (10 + 40 = 50 HP).
     - On the Scene: 10 LS, max PB targets within 5 ft, Heal/Harm dice scaling (`1d6+mod` / `2d6+mod`).
     - Urgent Care Centre: Half heal splash on self-healing levelled Art (artLevel >= 1); rejects cantrips (`isCantrip: false`).
     - Stop the Flow: 20 LS on Dying creature, +6 Mettle up to 8 hard cap, re-use lock while Dying. Clean undo restoring exact prior value.
     - Touch of Life and Death: 10 LS rider (ends condition <=1h, pauses >1h, inflicts Poisoned on harm).
     - Mobile Hospital: 1/LR BA, 30 ft aura, `3d6+mod` HP on entry.
  4. Verified GM relay & sheet UI:
     - `validateTarget` implemented across all 9 target-mutating plans (`touchHeal`, `resuscitation`, `stopTheFlow`, `intravenousLine`, `hypocriticOath`, `inpatientCare`, `onTheScene`, `urgentCareCentre`, `mobileHospital`).
     - `receipt.formula` and roll/save metadata bound to dice-rolling plans (`onTheScene`, `mobileHospital`, `intravenousLine`, `hypocriticOath`).
     - Added `.ak5e-medic-badges` and `.ak5e-medic-badge` pill elements to `ActorSheetV2` Features tab displaying Life Support (`value / max`), Spell Save DC, Subclass, and Intravenous Line tuning status.
     - Added dialog handlers in `medic-sheet.mjs` for `inpatientCare` and `urgentCareCentre`.
     - Added `.ak5e-medic-badges` and `.ak5e-medic-badge` CSS rules in `ak5e/styles/ak5e.css`.
  5. Verified automated test suites:
     - `npm run test:medic`: 59/59 passing (100% pass, 0 failures).
     - `npm run test:base-classes`: 100% passing across Vanguard (45/45), Supporter (44/44), Specialist (48/48), and Medic (59/59).
     - `node ak5e/tools/validate-files.mjs`: Validated module.json, lang/en.json, and 266 .mjs files with 0 errors.
     - `node ak5e/tools/verify-generated-content.mjs`: Verified 2193 records with 0 errors.
  6. Verified in-Foundry headless Playwright live execution:
     - Executed `ak5e/tools/test-medic-live.mjs` against disposable `/tmp` copy of `standard-test` on port 30175 with strict cleanup traps.
     - `browser-report.json`: `errors: []`.
     - Verified 7 rendered screenshots per AGENTS.md §6.2 (all PASS).
  7. Updated `ak5e/DECISIONS.md` and `TODO.md`.
